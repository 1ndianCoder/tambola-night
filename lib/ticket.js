// Tickets are worked out from a seed (player id + a per-game salt), so they never
// need to be stored: the same player always gets the same ticket within a game,
// and a new game (new salt) deals everyone a new one.
//
// Rules: 3 rows x 9 columns, 5 numbers per row, every column used,
// column c holds c*10..c*10+9 (1-9 in the first, 80-90 in the last), sorted top to bottom.

function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTicket(seedText) {
  const rnd = rng(hash("tambola:" + seedText));
  for (let attempt = 0; attempt < 500; attempt++) {
    const counts = Array(9).fill(1);
    let extra = 6, guard = 0;
    while (extra > 0 && guard++ < 1000) { const c = Math.floor(rnd() * 9); if (counts[c] < 3) { counts[c]++; extra--; } }
    const grid = [0, 1, 2].map(() => Array(9).fill(false));
    const left = [5, 5, 5];
    const colKey = counts.map(() => rnd());
    const order = [...Array(9).keys()].sort((a, b) => (counts[b] - counts[a]) || (colKey[a] - colKey[b]));
    let ok = true;
    for (const c of order) {
      const rk = [rnd(), rnd(), rnd()];
      const rows = [0, 1, 2].sort((a, b) => (left[b] - left[a]) || (rk[a] - rk[b])).slice(0, counts[c]);
      for (const r of rows) { if (left[r] <= 0) { ok = false; break; } grid[r][c] = true; left[r]--; }
      if (!ok) break;
    }
    if (!ok || left.some((x) => x !== 0)) continue;
    const t = [0, 1, 2].map(() => Array(9).fill(0));
    for (let c = 0; c < 9; c++) {
      const lo = c === 0 ? 1 : c * 10, hi = c === 8 ? 90 : c * 10 + 9;
      const pool = [];
      for (let n = lo; n <= hi; n++) pool.push(n);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const picked = pool.slice(0, counts[c]).sort((a, b) => a - b);
      let k = 0;
      for (let r = 0; r < 3; r++) if (grid[r][c]) t[r][c] = picked[k++];
    }
    return t;
  }
  throw new Error("Could not build a ticket");
}

module.exports = { makeTicket };
