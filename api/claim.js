// POST /api/claim { pid, prize }: checks a claim against the numbers called.
const { claim } = require("../lib/game");
const { send, body, handle } = require("../lib/http");

module.exports = handle(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const b = body(req);
  send(res, 200, await claim(b.pid, b.prize));
});
