// Small helpers shared by the API functions.

function send(res, status, obj, headers) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers || {})) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}

function body(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") { try { return JSON.parse(b); } catch { return {}; } }
  return b;
}

// Wraps a handler so database problems come back as a clear message, not a crash.
function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e && e.code === "NO_DB") return send(res, 503, { error: e.message, code: "NO_DB" });
      if (e && (e.code === "DB_DOWN" || e.code === "DB_ERROR")) return send(res, 503, { error: e.message, code: e.code });
      console.error(e);
      send(res, 500, { error: "Something went wrong on the server." });
    }
  };
}

module.exports = { send, body, handle };
