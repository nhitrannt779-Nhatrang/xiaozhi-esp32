const http = require("http");
const fs = require("fs");
const path = require("path");
const { STATUS_LABELS, assertAdmin, rejectWrite, changeStatus } = require("./policy");

const orders = [
  {
    id: "10482",
    customer: "Nguyễn Thu Hà",
    phone: "0901000001",
    address: "Nha Trang",
    amount: 6200000,
    shippingFee: 25000,
    payment: "Chuyển khoản",
    carrier: "Chưa chọn",
    status: "pending",
    cancelReason: "",
    items: [{ name: "Loa MiniAI", quantity: 1, price: 6200000 }],
  },
  {
    id: "10481",
    customer: "Trần Minh Khoa",
    phone: "0901000002",
    address: "Hà Nội",
    amount: 7400000,
    shippingFee: 30000,
    payment: "COD",
    carrier: "GHN",
    status: "shipping",
    cancelReason: "",
    items: [{ name: "Tai nghe MiniAI", quantity: 2, price: 3700000 }],
  },
  {
    id: "10479",
    customer: "Lê Hoàng Anh",
    phone: "0901000003",
    address: "Đà Nẵng",
    amount: 5000000,
    shippingFee: 20000,
    payment: "Đã thanh toán",
    carrier: "GHTK",
    status: "delivered",
    cancelReason: "",
    items: [{ name: "Mic MiniAI", quantity: 1, price: 5000000 }],
  },
];

function roleOf(req) {
  return req.headers["x-role"] || "admin";
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        error.status = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function present(order) {
  return { ...order, statusLabel: STATUS_LABELS[order.status] };
}

function summary(status, query) {
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

async function handle(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/orders/order")) {
    const html = fs.readFileSync(path.join(__dirname, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/orders/order") {
    return send(res, 200, summary(url.searchParams.get("status") || "", url.searchParams.get("q") || ""));
  }

  const detailMatch = url.pathname.match(/^\/api\/orders\/order\/(\d+)$/);
  if (req.method === "GET" && detailMatch) {
    const order = orders.find((item) => item.id === detailMatch[1]);
    if (!order) {
      const error = new Error("Không thấy đơn");
      error.status = 404;
      throw error;
    }
    return send(res, 200, present(order));
  }

  const statusMatch = url.pathname.match(/^\/api\/orders\/order\/(\d+)\/status$/);
  if (req.method === "POST" && statusMatch) {
    assertAdmin(roleOf(req));
    const body = await readBody(req);
    const locked = ["customer", "phone", "address", "amount", "shippingFee", "payment", "carrier", "items"];
    if (locked.some((field) => field in body)) {
      rejectWrite("Admin không được sửa tiền hoặc thông tin khách");
    }
    const order = orders.find((item) => item.id === statusMatch[1]);
    if (!order) {
      const error = new Error("Không thấy đơn");
      error.status = 404;
      throw error;
    }
    const next = changeStatus(order, body.status, body.reason);
    Object.assign(order, next);
    return send(res, 200, present(order));
  }

  if (req.method === "DELETE" && /^\/api\/orders\/order\/\d+$/.test(url.pathname)) {
    assertAdmin(roleOf(req));
    rejectWrite("Admin không được xóa đơn");
  }

  if ((req.method === "PATCH" || req.method === "PUT") && /^\/api\/orders\/order\/\d+$/.test(url.pathname)) {
    assertAdmin(roleOf(req));
    rejectWrite("Admin không được sửa tiền hoặc thông tin khách");
  }

  send(res, 404, { error: "Không có route" });
}

function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      send(res, error.status || 500, { error: error.message || "Lỗi" });
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  createServer().listen(port, "127.0.0.1");
}

module.exports = { createServer, orders };
