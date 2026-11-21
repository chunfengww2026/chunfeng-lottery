/* core-pool.js —— 用 core-algo 从真实开奖算出双色球/大乐透 20 码池（构建时算好，页面只读） */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { coreAlgo } = require('./core-algo.js');

let cache = null;
let cacheTag = '';
/* 仅排序，不改变20码成员；对应资料原版的金胆尾 > 银胆尾 > 近30期频次。 */
function rankCorePool(result, history) {
  const pool = [...new Set(result.pool20 || [])], freq = new Map();
  for (const draw of (history || []).slice(0, 30)) {
    const a = draw.areas || {};
    for (const n of (draw.red || a.red || a.front || [])) freq.set(Number(n), (freq.get(Number(n)) || 0) + 1);
  }
  const gold = new Set(result.goldPool || []), silver = new Set(result.silverPool || []);
  const max = Math.max(1, ...pool.map(n => freq.get(n) || 0));
  const score = n => (gold.has(n) ? 1000 : 0) + (silver.has(n) ? 100 : 0) + (freq.get(n) || 0) / max * 10;
  return pool.sort((a, b) => score(b) - score(a) || a - b);
}
function loadHistory() {
  const p = path.join(__dirname, 'history.js');
  if (!fs.existsSync(p)) return null;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(p, 'utf8') + '\n;globalThis.__X = DRAW_HISTORY;', ctx);
  return ctx.__X || null;
}

/* ============================================================
   __CORE_SSQ_BLUE__ 双色球蓝球 6 个（用户 2026-10-20「双色球 20 码要加蓝球」）
   ------------------------------------------------------------
   · 大乐透后区出 6 个 → 双色球蓝球也出 6 个（蓝球只有 1-16，16 里取 6 个，合理）
   · ⚠️ 算法一个字没动：跟 export-static.mjs 的 seededRandom20 是【同一套】
        LCG（seed*1103515245+12345）+ Fisher-Yates 洗牌，只是把范围换成 1-16、
        取前 6 个 —— 期号当种子 → 同一期永远是同一组蓝球，换期自动换。
   ============================================================ */
function seededPick(max, count, seedStr) {
  let seed = 0;
  const s = String(seedStr || 'x');
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  function rnd() {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296;
  }
  const all = [];
  for (let i = 1; i <= max; i++) all.push(i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = all[i]; all[i] = all[j]; all[j] = tmp;
  }
  return all.slice(0, count).sort((x, y) => x - y);
}

function corePoolFor(gameId) {
  try {
    const H = loadHistory();
    if (!H || !H.games) return null;
    const tag = JSON.stringify(['ssq', 'dlt'].map(g => (H.games[g] || []).slice(0, 30)));
    if (!cache || cacheTag !== tag) {
      const ssq = (H.games.ssq || []).map((d) => ({ ...d, red: (d.areas || {}).red || [] }));
      const dlt = (H.games.dlt || []).map((d) => ({ ...d, red: (d.areas || {}).front || [] }));
      cache = {
        ssq: coreAlgo(ssq, 33, false, null),
        dlt: coreAlgo(dlt, 35, true, ssq)
      };
      if (cache.ssq) cache.ssq.issue = ssq[0] && ssq[0].issue;
      if (cache.dlt) cache.dlt.issue = dlt[0] && dlt[0].issue;
      if (cache.ssq) cache.ssq.rank = rankCorePool(cache.ssq, ssq);
      if (cache.dlt) cache.dlt.rank = rankCorePool(cache.dlt, dlt);
      cacheTag = tag;
      /* 双色球蓝球（1-16 取 6 个）：同一个 seededPick/期号种子 */
      if (cache.ssq) {
        try { cache.ssq.blue = seededPick(16, 6, String(cache.ssq.issue || '') + '|ssqblue'); } catch (e) { cache.ssq.blue = []; }
      }
    }
    return cache[gameId] || null;
  } catch (e) { return null; }
}

module.exports = { corePoolFor, rankCorePool };
