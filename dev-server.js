// Optional: run the game on your own computer, the same way Vercel runs it.
//   1. Copy the Redis URL and token from Vercel (Storage > your database > .env.local tab).
//   2. KV_REST_API_URL=... KV_REST_API_TOKEN=... node dev-server.js
//   3. Open http://localhost:3000 (players) and http://localhost:3000/host (host).
// You don't need this for Vercel itself.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  const api = p.match(/^\/api\/([a-z]+)$/);
  if (api) {
    let file;
    try { file = require.resolve(`./api/${api[1]}.js`); } catch { res.writeHead(404); return res.end("Not found"); }
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
    req.on("end", () => {
      try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = raw; }
      require(file)(req, res);
    });
    return;
  }
  let file = p === "/" ? "/index.html" : p;
  if (!path.extname(file)) file += ".html"; // like Vercel's cleanUrls
  const full = path.join(PUBLIC, path.normalize(file));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Tambola Night: http://localhost:${PORT}  (host: http://localhost:${PORT}/host)`));
