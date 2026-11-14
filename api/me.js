// GET /api/me?pid=...: a player's name and ticket for the current game.
const { getPlayer } = require("../lib/game");
const { send, handle } = require("../lib/http");

module.exports = handle(async (req, res) => {
  const pid = new URL(req.url, "http://x").searchParams.get("pid") || "";
  const me = await getPlayer(pid);
  if (!me) return send(res, 404, { error: "Not joined" });
  send(res, 200, me);
});
