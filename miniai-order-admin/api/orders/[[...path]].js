const { handleApi, memoryStore } = require("../../api");

const store = memoryStore();

module.exports = async function handler(req, res) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `https://${host}`);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: hasBody ? JSON.stringify(req.body || {}) : undefined,
  });
  const result = await handleApi(request, store);
  res.status(result.status).setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(result.body));
};
