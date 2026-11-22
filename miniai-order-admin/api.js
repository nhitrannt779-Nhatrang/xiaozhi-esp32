const { STATUS_LABELS, assertAdmin, rejectWrite, changeStatus } = require("./policy");
const { seedOrders } = require("./seed");

function present(order) {
  return { ...order, statusLabel: STATUS_LABELS[order.status] };
}

function summary(orders, status, query) {
  const needle = (query || "").trim().toLowerCase();
  const visible = orders.filter((order) => {
    if (status && order.status !== status) return false;
    if (!needle) return true;
    return [order.id, order.customer, order.phone].join(" ").toLowerCase().includes(needle);
  });
  const revenue = orders
    .filter((order) => order.status !== "cancelled")
    .reduce((total, order) => total + order.amount, 0);
  return { revenue, orders: visible.map(present) };
}

async function handleApi(request, store) {
  const url = new URL(request.url);
  const orders = await store.load();

  if (request.method === "GET" && url.pathname === "/api/orders/order") {
    return { status: 200, body: summary(orders, url.searchParams.get("status") || "", url.searchParams.get("q") || "") };
  }

  const detailMatch = url.pathname.match(/^\/api\/orders\/order\/(\d+)$/);
  if (request.method === "GET" && detailMatch) {
    const order = orders.find((item) => item.id === detailMatch[1]);
    if (!order) return { status: 404, body: { error: "Không thấy đơn" } };
    return { status: 200, body: present(order) };
  }

  const statusMatch = url.pathname.match(/^\/api\/orders\/order\/(\d+)\/status$/);
  if (request.method === "POST" && statusMatch) {
    try {
      assertAdmin(request.headers.get("x-role") || "admin");
      const body = await request.json().catch(() => ({}));
      const locked = ["customer", "phone", "address", "amount", "shippingFee", "payment", "carrier", "items"];
      if (locked.some((field) => field in body)) {
        rejectWrite("Admin không được sửa tiền hoặc thông tin khách");
      }
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const current = attempt === 0 ? orders : await store.load();
        const order = current.find((item) => item.id === statusMatch[1]);
        if (!order) return { status: 404, body: { error: "Không thấy đơn" } };
        const nextOrder = changeStatus(order, body.status, body.reason);
        const nextOrders = current.map((item) => (item.id === order.id ? nextOrder : item));
        try {
          await store.save(nextOrders);
          return { status: 200, body: present(nextOrder) };
        } catch (error) {
          if (error.status !== 409 || attempt === 1) throw error;
          store.invalidate();
        }
      }
    } catch (error) {
      return { status: error.status || 500, body: { error: error.message } };
    }
  }

  if (request.method === "DELETE" && detailMatch) {
    try {
      assertAdmin(request.headers.get("x-role") || "admin");
      rejectWrite("Admin không được xóa đơn");
    } catch (error) {
      return { status: error.status || 500, body: { error: error.message } };
    }
  }

  if ((request.method === "PATCH" || request.method === "PUT") && detailMatch) {
    try {
      assertAdmin(request.headers.get("x-role") || "admin");
      rejectWrite("Admin không được sửa tiền hoặc thông tin khách");
    } catch (error) {
      return { status: error.status || 500, body: { error: error.message } };
    }
  }

  return { status: 404, body: { error: "Không có route" } };
}

function memoryStore(initial = seedOrders()) {
  let orders = initial;
  return {
    load: async () => orders,
    save: async (next) => {
      orders = next;
    },
    invalidate() {},
  };
}

function kvStore(kv, ttlMs = 5000) {
  let cache = null;
  let cacheAt = 0;
  let version = 0;

  async function read() {
    if (typeof kv.getWithMetadata === "function") {
      const result = await kv.getWithMetadata("orders", { type: "json" });
      return {
        orders: result && result.value ? result.value : null,
        version: (result && result.metadata && result.metadata.version) || 0,
      };
    }
    const raw = await kv.get("orders");
    return { orders: raw ? JSON.parse(raw) : null, version: 0 };
  }

  return {
    invalidate() {
      cache = null;
      cacheAt = 0;
    },
    async load() {
      if (cache && Date.now() - cacheAt < ttlMs) return cache;
      const record = await read();
      cache = record.orders || seedOrders();
      version = record.version;
      cacheAt = Date.now();
      if (!record.orders) {
        version = 1;
        await kv.put("orders", JSON.stringify(cache), { metadata: { version } });
      }
      return cache;
    },
    async save(next) {
      if (typeof kv.getWithMetadata === "function") {
        const latest = await kv.getWithMetadata("orders", { type: "json" });
        const latestVersion = (latest && latest.metadata && latest.metadata.version) || 0;
        if (latestVersion !== version) {
          const error = new Error("Đơn vừa được cập nhật, thử lại");
          error.status = 409;
          throw error;
        }
        version = latestVersion + 1;
      }
      cache = next;
      cacheAt = Date.now();
      await kv.put("orders", JSON.stringify(next), { metadata: { version } });
    },
  };
}

module.exports = { handleApi, memoryStore, kvStore };
