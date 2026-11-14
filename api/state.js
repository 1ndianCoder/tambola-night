// GET /api/state: the live game everyone polls.
// Vercel's CDN caches it for 1 second, so 5 players or 200 cost the database the same.
const { getPublicState } = require("../lib/game");
const { send, handle } = require("../lib/http");

module.exports = handle(async (req, res) => {
  const state = await getPublicState();
  send(res, 200, state, {
    "Cache-Control": "public, max-age=0, s-maxage=1",
    "CDN-Cache-Control": "public, s-maxage=1",
  });
});
