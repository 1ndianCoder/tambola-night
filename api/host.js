// POST /api/host { key, action, ... }: everything the host screen does.
// Actions: setup (choose the host password), details, call, undo, auto, newgame, remove, revoke.
const { checkHost, setHostKey, hostDetails, hostAction } = require("../lib/game");
const { send, body, handle } = require("../lib/http");

module.exports = handle(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const b = body(req);

  if (b.action === "setup") {
    const r = await setHostKey(b.key);
    return send(res, r.error ? 400 : 200, r);
  }

  const auth = await checkHost(b.key);
  if (auth === "unset") return send(res, 409, { error: "Choose a host password first.", code: "SETUP" });
  if (auth !== "ok") return send(res, 401, { error: "That host password isn’t right.", code: "WRONG_KEY" });

  if (b.action === "details") return send(res, 200, await hostDetails());
  const state = await hostAction(b.action, b);
  if (!state) return send(res, 400, { error: "Unknown action" });
  send(res, 200, { state });
});
