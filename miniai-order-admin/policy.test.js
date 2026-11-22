const assert = require("assert");
const http = require("http");
const { changeStatus } = require("./policy");
const { kvStore, handleApi } = require("./api");
const { seedOrders } = require("./seed");
const { createServer } = require("./server");

function request(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: { "content-type": "application/json", ...headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const pending = { id: "1", status: "pending", customer: "A", amount: 1, cancelReason: "" };
  assert.strictEqual(changeStatus(pending, "shipping").status, "shipping");
  assert.throws(() => changeStatus(pending, "delivered"), /Chỉ chuyển/);
  assert.throws(() => changeStatus(pending, "cancelled"), /lý do/);
  assert.strictEqual(changeStatus(pending, "cancelled", "khách hủy").status, "cancelled");

  let reads = 0;
  const kv = {
    async get() {
      reads += 1;
      return null;
    },
    async put() {},
  };
  const store = kvStore(kv, 5000);
  const first = await store.load();
  const second = await store.load();
  assert.strictEqual(reads, 1);
  assert.strictEqual(second[0].id, first[0].id);
  await store.save([{ id: "1", status: "pending", amount: 1, customer: "A", phone: "" }]);
  const third = await store.load();
  assert.strictEqual(reads, 1);
  assert.strictEqual(third[0].id, "1");

  let version = 1;
  let stored = seedOrders();
  const versioned = kvStore(
    {
      async getWithMetadata() {
        return { value: stored, metadata: { version } };
      },
      async put(_key, raw, options) {
        stored = JSON.parse(raw);
        version = options.metadata.version;
      },
    },
    5000
  );
  await versioned.load();
  version = 9;
  await assert.rejects(() => versioned.save(stored), /thử lại/);
  versioned.invalidate();
  await versioned.load();
  assert.strictEqual(version, 9);

  let saves = 0;
  const retryStore = {
    orders: seedOrders(),
    async load() {
      return this.orders;
    },
    async save(next) {
      saves += 1;
      if (saves === 1) {
        const error = new Error("Đơn vừa được cập nhật, thử lại");
        error.status = 409;
        throw error;
      }
      this.orders = next;
    },
    invalidate() {},
  };
  const retried = await handleApi(
    new Request("http://127.0.0.1/api/orders/order/10482/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "shipping" }),
    }),
    retryStore
  );
  assert.strictEqual(retried.status, 200);
  assert.strictEqual(saves, 2);

  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const list = await request(port, "GET", "/api/orders/order");
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.revenue > 0);
    assert.ok(list.body.orders[0].phone);

    const missing = await request(port, "GET", "/api/orders/order?q=khong-co");
    assert.strictEqual(missing.body.orders.length, 0);

    const found = await request(port, "GET", "/api/orders/order?q=0901000001");
    assert.strictEqual(found.body.orders.length, 1);
    assert.strictEqual(found.body.orders[0].id, "10482");

    const filtered = await request(port, "GET", "/api/orders/order?status=shipping");
    assert.ok(filtered.body.orders.every((order) => order.status === "shipping"));

    const detail = await request(port, "GET", "/api/orders/order/10482");
    assert.strictEqual(detail.status, 200);
    assert.strictEqual(detail.body.customer, "Nguyễn Thu Hà");
    assert.strictEqual(detail.body.items.length, 1);

    const removed = await request(port, "DELETE", "/api/orders/order/10482");
    assert.strictEqual(removed.status, 403);

    const edited = await request(port, "PATCH", "/api/orders/order/10482", { amount: 1 });
    assert.strictEqual(edited.status, 403);

    const replaced = await request(port, "PUT", "/api/orders/order/10482", { customer: "Khác" });
    assert.strictEqual(replaced.status, 403);

    const smuggled = await request(port, "POST", "/api/orders/order/10482/status", {
      status: "shipping",
      phone: "0999",
      items: [],
    });
    assert.strictEqual(smuggled.status, 403);

    const noReason = await request(port, "POST", "/api/orders/order/10482/status", { status: "cancelled" });
    assert.strictEqual(noReason.status, 400);

    const finished = await request(port, "POST", "/api/orders/order/10479/status", { status: "shipping" });
    assert.strictEqual(finished.status, 403);

    const jumped = await request(port, "POST", "/api/orders/order/10482/status", { status: "delivered" });
    assert.strictEqual(jumped.status, 403);

    const moved = await request(port, "POST", "/api/orders/order/10482/status", { status: "shipping" });
    assert.strictEqual(moved.status, 200);
    assert.strictEqual(moved.body.status, "shipping");

    const staff = await request(
      port,
      "POST",
      "/api/orders/order/10481/status",
      { status: "delivered" },
      { "x-role": "staff" }
    );
    assert.strictEqual(staff.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main()
  .then(() => {
    console.log("ok");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
