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
      const order = orders.find((item) => item.id === statusMatch[1]);
      if (!order) return { status: 404, body: { error: "Không thấy đơn" } };
      Object.assign(order, changeStatus(order, body.status, body.reason));
      await store.save(orders);
      return { status: 200, body: present(order) };
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
  };
}

function kvStore(kv) {
  return {
    async load() {
      const raw = await kv.get("orders");
      if (!raw) {
        const seeded = seedOrders();
        await kv.put("orders", JSON.stringify(seeded));
        return seeded;
      }
      return JSON.parse(raw);
    },
    save(next) {
      return kv.put("orders", JSON.stringify(next));
    },
  };
}

module.exports = { handleApi, memoryStore, kvStore };
