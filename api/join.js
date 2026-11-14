// POST /api/join { name }: adds a player and returns their private id.
const { join } = require("../lib/game");
const { send, body, handle } = require("../lib/http");

module.exports = handle(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const r = await join(body(req).name);
  send(res, r.error ? 400 : 200, r);
});
