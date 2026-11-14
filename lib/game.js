// Game logic. All game state lives in Redis so every Vercel function instance sees
// the same game. Changes to the shared state run as small Lua scripts inside Redis,
// so two things happening at once (say, two players claiming the same prize) can't
// overwrite each other.

const crypto = require("crypto");
const { cmd, pipe, DbError } = require("./redis");
const { makeTicket } = require("./ticket");

const K = {
  state: "tambola:state",
  players: "tambola:players",
  log: "tambola:log",
  hostkey: "tambola:hostkey",
};
const MAX_PLAYERS = 300;
const PRIZES = {
  early: "Early five", top: "Top line", middle: "Middle line",
  bottom: "Bottom line", corners: "Four corners", full: "Full house",
};

/* ---------------- helpers ---------------- */
const newId = (bytes = 8) => crypto.randomBytes(bytes).toString("hex");
function shuffled() {
  const a = Array.from({ length: 90 }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function freshState() {
  return {
    gameNo: 1, salt: newId(6), order: shuffled(), idx: 0, winners: {}, news: null,
    playerCount: 0, auto: false, interval: 6, lastAt: 0, v: 1,
  };
}
function parseState(raw) {
  if (!raw) return null;
  const s = JSON.parse(raw);
  // Redis's JSON encoder writes an empty table as {} but be safe either way.
  if (!s.winners || Array.isArray(s.winners)) s.winners = {};
  if (s.news && typeof s.news !== "object") s.news = null;
  return s;
}
async function loadState() {
  let raw = await cmd("GET", K.state);
  if (!raw) {
    await cmd("SET", K.state, JSON.stringify(freshState()), "NX");
    raw = await cmd("GET", K.state);
  }
  return parseState(raw);
}
const ticketFor = (pid, s) => makeTicket(`${pid}:${s.salt}`);

function prizeNumbers(t, prize) {
  const row = (r) => t[r].filter(Boolean);
  if (prize === "top") return row(0);
  if (prize === "middle") return row(1);
  if (prize === "bottom") return row(2);
  if (prize === "corners") { const a = row(0), b = row(2); return [a[0], a[a.length - 1], b[0], b[b.length - 1]]; }
  return t.flat().filter(Boolean);
}
function claimIsValid(t, prize, calledSet) {
  const need = prizeNumbers(t, prize);
  const have = need.filter((n) => calledSet.has(n)).length;
  return prize === "early" ? have >= 5 : have === need.length;
}

function publicView(s) {
  const winners = {};
  for (const [k, w] of Object.entries(s.winners || {})) winners[k] = { name: w.name, callNo: w.callNo };
  return {
    gameNo: s.gameNo,
    v: s.v,
    called: s.order.slice(0, s.idx),
    winners,
    prizes: PRIZES,
    playerCount: s.playerCount,
    over: Boolean(s.winners && s.winners.full) || s.idx >= 90,
    auto: { on: Boolean(s.auto), interval: s.interval },
    news: s.news || null,
  };
}

async function addLog(text) {
  await pipe([
    ["LPUSH", K.log, JSON.stringify({ at: Date.now(), text })],
    ["LTRIM", K.log, 0, 99],
  ]);
}

/* ---------------- atomic updates (Lua, run inside Redis) ---------------- */
const PRELUDE = `
local raw = redis.call('GET', KEYS[1])
if not raw then return redis.error_reply('NO_STATE') end
local s = cjson.decode(raw)
if type(s.winners) ~= 'table' then s.winners = {} end
local function save()
  s.v = s.v + 1
  local out = cjson.encode(s)
  redis.call('SET', KEYS[1], out)
  return out
end
`;

const LUA = {
  // ARGV: expected idx (-1 = any), now (ms), 'auto' | 'manual'
  call: PRELUDE + `
local exp = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
if exp >= 0 and s.idx ~= exp then return raw end
if ARGV[3] == 'auto' then
  if not s.auto or (now - s.lastAt) < (s.interval * 1000 - 300) then return raw end
end
if s.idx >= 90 or s.winners['full'] then
  if s.auto then s.auto = false; return save() end
  return raw
end
s.idx = s.idx + 1
s.lastAt = now
s.news = cjson.null
if s.idx >= 90 then s.auto = false end
return save()
`,
  undo: PRELUDE + `
if s.idx <= 0 then return raw end
s.idx = s.idx - 1
s.auto = false
s.news = cjson.null
return save()
`,
  // ARGV: on ('1'|'0'), interval seconds, now
  auto: PRELUDE + `
local iv = tonumber(ARGV[2])
if iv < 3 then iv = 3 end
if iv > 60 then iv = 60 end
s.interval = iv
if ARGV[1] == '1' and s.idx < 90 and not s.winners['full'] then
  s.auto = true
  s.lastAt = tonumber(ARGV[3]) - iv * 1000
else
  s.auto = false
end
return save()
`,
  // ARGV: order (JSON), salt, news id
  newgame: PRELUDE + `
s.gameNo = s.gameNo + 1
s.order = cjson.decode(ARGV[1])
s.salt = ARGV[2]
s.idx = 0
s.winners = {}
s.auto = false
s.lastAt = 0
s.news = { id = ARGV[3], text = 'Game ' .. s.gameNo .. ' is starting. Everyone has a fresh ticket.' }
return save()
`,
  // ARGV: prize, pid, name, gameNo, news id, prize label
  win: PRELUDE + `
if s.gameNo ~= tonumber(ARGV[4]) then return cjson.encode({ r = 'STALE' }) end
local w = s.winners[ARGV[1]]
if w then return cjson.encode({ r = 'TAKEN', name = w.name }) end
s.winners[ARGV[1]] = { pid = ARGV[2], name = ARGV[3], callNo = s.idx }
s.news = { id = ARGV[5], text = ARGV[3] .. ' wins ' .. ARGV[6] .. '!' }
if ARGV[1] == 'full' then s.auto = false end
save()
return cjson.encode({ r = 'OK' })
`,
  // ARGV: prize
  revoke: PRELUDE + `
if not s.winners[ARGV[1]] then return raw end
s.winners[ARGV[1]] = nil
s.news = cjson.null
return save()
`,
  // KEYS: state, players. ARGV: pid, name, max
  join: PRELUDE + `
local n = redis.call('HLEN', KEYS[2])
if n >= tonumber(ARGV[3]) then return 'FULL' end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
s.playerCount = n + 1
save()
return 'OK'
`,
  // KEYS: state, players. ARGV: pid
  remove: PRELUDE + `
if redis.call('HDEL', KEYS[2], ARGV[1]) == 1 then
  s.playerCount = redis.call('HLEN', KEYS[2])
  return save()
end
return raw
`,
  bump: PRELUDE + `return save()`,
};

async function run(script, keys, args) {
  await loadState(); // makes sure the game exists before any script touches it
  return cmd("EVAL", LUA[script], keys.length, ...keys, ...args);
}
const runState = async (script, args) => parseState(await run(script, [K.state], args));

/* ---------------- operations used by the API ---------------- */

// Public state. Also does the auto-calling: whenever anyone asks for the state and the
// next auto-call is due, it's made here, so no always-on server or open host tab is needed.
async function getPublicState() {
  let s = await loadState();
  if (s.auto && Date.now() - s.lastAt >= s.interval * 1000 - 300) {
    s = await runState("call", [-1, Date.now(), "auto"]);
  }
  return publicView(s);
}

async function getPlayer(pid) {
  if (!pid) return null;
  const [raw, name] = await pipe([["GET", K.state], ["HGET", K.players, pid]]);
  if (!name) return null;
  const s = raw ? parseState(raw) : await loadState();
  return { name, gameNo: s.gameNo, ticket: ticketFor(pid, s) };
}

async function join(rawName) {
  const name = String(rawName || "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (!name) return { error: "Please enter your name." };
  const pid = newId(8);
  const r = await run("join", [K.state, K.players], [pid, name, MAX_PLAYERS]);
  if (r === "FULL") return { error: "Sorry, the game is full." };
  await addLog(`${name} joined`);
  return { pid };
}

async function claim(pid, prize) {
  if (!PRIZES[prize]) return { ok: false, message: "Unknown prize." };
  const [raw, name] = await pipe([["GET", K.state], ["HGET", K.players, pid || "-"]]);
  if (!name) return { ok: false, gone: true, message: "Your ticket wasn’t found. Please join again." };
  const s = raw ? parseState(raw) : await loadState();
  if (s.winners[prize]) return { ok: false, message: `${PRIZES[prize]} was already won by ${s.winners[prize].name}.` };
  const called = new Set(s.order.slice(0, s.idx));
  if (!claimIsValid(ticketFor(pid, s), prize, called)) {
    await addLog(`Bogey! ${name} claimed ${PRIZES[prize]} too early`);
    await run("bump", [K.state], []);
    return { ok: false, message: "Not complete yet. Check your ticket again!" };
  }
  const r = JSON.parse(await run("win", [K.state], [prize, pid, name, s.gameNo, newId(4), PRIZES[prize]]));
  if (r.r === "TAKEN") return { ok: false, message: `So close! ${r.name} claimed ${PRIZES[prize]} first.` };
  if (r.r === "STALE") return { ok: false, message: "A new game just started. Check your new ticket!" };
  await addLog(`${name} won ${PRIZES[prize]} on call ${s.idx}`);
  return { ok: true, message: `Congratulations, you won ${PRIZES[prize]}!` };
}

/* ---------------- host ---------------- */
const sha = (t) => crypto.createHash("sha256").update("tambola-host:" + t).digest("hex");
function sameText(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
// Returns "ok", "wrong" or "unset" (no host password chosen yet).
async function checkHost(key) {
  if (process.env.HOST_KEY) return key && sameText(key, process.env.HOST_KEY) ? "ok" : "wrong";
  const stored = await cmd("GET", K.hostkey);
  if (!stored) return "unset";
  return key && sameText(sha(key), stored) ? "ok" : "wrong";
}
async function setHostKey(key) {
  if (process.env.HOST_KEY) return { error: "The host password is set in Vercel (HOST_KEY)." };
  if (!key || String(key).length < 4) return { error: "Use at least 4 characters." };
  const r = await cmd("SET", K.hostkey, sha(key), "NX");
  return r ? { ok: true } : { error: "A host password has already been set." };
}

async function hostDetails() {
  const [raw, flat, log] = await pipe([["GET", K.state], ["HGETALL", K.players], ["LRANGE", K.log, 0, 39]]);
  const s = raw ? parseState(raw) : await loadState();
  const players = [];
  for (let i = 0; i < (flat || []).length; i += 2) players.push({ pid: flat[i], name: flat[i + 1] });
  return {
    state: publicView(s),
    players,
    log: (log || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean),
  };
}

async function hostAction(action, body) {
  let s;
  if (action === "call") s = await runState("call", [Number.isInteger(body.expect) ? body.expect : -1, Date.now(), "manual"]);
  else if (action === "undo") {
    s = await runState("undo", []);
    await addLog("Host undid the last call");
  } else if (action === "auto") s = await runState("auto", [body.on ? "1" : "0", Number(body.interval) || 6, Date.now()]);
  else if (action === "newgame") {
    s = await runState("newgame", [JSON.stringify(shuffled()), newId(6), newId(4)]);
    await addLog(`Game ${s.gameNo} started`);
  } else if (action === "remove") {
    const name = await cmd("HGET", K.players, body.pid || "-");
    s = parseState(await run("remove", [K.state, K.players], [body.pid || "-"]));
    if (name) await addLog(`Host removed ${name}`);
  } else if (action === "revoke") {
    const before = await loadState();
    const w = before.winners[body.prize];
    s = await runState("revoke", [body.prize || "-"]);
    if (w) await addLog(`Host cancelled ${w.name}’s ${PRIZES[body.prize]}`);
  } else return null;
  return publicView(s);
}

module.exports = {
  getPublicState, getPlayer, join, claim,
  checkHost, setHostKey, hostDetails, hostAction,
  DbError, PRIZES,
};
