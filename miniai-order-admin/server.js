const http = require("http");
const fs = require("fs");
const path = require("path");
const { STATUS_LABELS, assertAdmin, rejectWrite, changeStatus } = require("./policy");

const orders = [
  { id: "10482", customer: "Nguyễn Thu Hà", amount: 6200000, status: "pending", cancelReason: "" },
  { id: "10481", customer: "Trần Minh Khoa", amount: 7400000, status: "shipping", cancelReason: "" },
  { id: "10479", customer: "Lê Hoàng Anh", amount: 5000000, status: "delivered", cancelReason: "" },
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

function summary() {
  const revenue = orders
    .filter((order) => order.status !== "cancelled")
    .reduce((total, order) => total + order.amount, 0);
  return {
    revenue,
    orders: orders.map((order) => ({ ...order, statusLabel: STATUS_LABELS[order.status] })),
  };
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
    return send(res, 200, summary());
  }

  const statusMatch = url.pathname.match(/^\/api\/orders\/order\/(\d+)\/status$/);
  if (req.method === "POST" && statusMatch) {
    assertAdmin(roleOf(req));
    const body = await readBody(req);
    const order = orders.find((item) => item.id === statusMatch[1]);
    if (!order) {
      const error = new Error("Không thấy đơn");
      error.status = 404;
      throw error;
    }
    const next = changeStatus(order, body.status, body.reason);
    Object.assign(order, next);
    return send(res, 200, { ...order, statusLabel: STATUS_LABELS[order.status] });
  }

  if (req.method === "DELETE" && /^\/api\/orders\/order\/\d+$/.test(url.pathname)) {
    assertAdmin(roleOf(req));
    rejectWrite("Admin không được xóa đơn");
  }

  if (req.method === "PATCH" && /^\/api\/orders\/order\/\d+$/.test(url.pathname)) {
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
