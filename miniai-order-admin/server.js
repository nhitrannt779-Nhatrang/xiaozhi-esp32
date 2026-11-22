const http = require("http");
const fs = require("fs");
const path = require("path");
const { handleApi, memoryStore } = require("./api");

const store = memoryStore();

async function handleNode(req, res) {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && !url.pathname.startsWith("/api")) {
      const html = fs.readFileSync(path.join(__dirname, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value != null) headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
    });
    const result = await handleApi(request, store);
    res.writeHead(result.status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result.body));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Lỗi hệ thống" }));
  }
}

function createServer() {
  return http.createServer(handleNode);
}

const server = createServer();

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  server.listen(port, process.env.HOST || "0.0.0.0");
}

module.exports = handleNode;
module.exports.createServer = createServer;
