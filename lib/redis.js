// Minimal client for Upstash Redis's REST API (what Vercel's Redis add-on provides).
// No npm packages needed: it uses the built-in fetch.

class DbError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function config() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new DbError("The Redis database isn't connected to this project yet.", "NO_DB");
  return { url: url.replace(/\/+$/, ""), token };
}

async function post(path, body) {
  const { url, token } = config();
  let res;
  try {
    res = await fetch(url + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new DbError("Couldn't reach the Redis database.", "DB_DOWN");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok && !Array.isArray(data)) {
    throw new DbError((data && data.error) || `Redis error (HTTP ${res.status})`, "DB_ERROR");
  }
  return data;
}

// One command: cmd("GET", "key")
async function cmd(...args) {
  const data = await post("", args.map(String));
  if (data.error) throw new DbError(data.error, "DB_ERROR");
  return data.result;
}

// Several commands in one round trip: pipe([["GET","a"],["GET","b"]])
async function pipe(commands) {
  const data = await post("/pipeline", commands.map((c) => c.map(String)));
  return data.map((d) => {
    if (d.error) throw new DbError(d.error, "DB_ERROR");
    return d.result;
  });
}

module.exports = { cmd, pipe, DbError };
