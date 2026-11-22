const assert = require("assert");
const http = require("http");
const { changeStatus } = require("./policy");
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
