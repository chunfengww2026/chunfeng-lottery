/* core-pool.js —— 用 core-algo 从真实开奖算出双色球/大乐透 20 码池（构建时算好，页面只读） */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { coreAlgo } = require('./core-algo.js');

let cache = null;
function loadHistory() {
  const p = path.join(__dirname, 'history.js');
  if (!fs.existsSync(p)) return null;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(p, 'utf8') + '\n;globalThis.__X = DRAW_HISTORY;', ctx);
  return ctx.__X || null;
}

function corePoolFor(gameId) {
  try {
    if (!cache) {
      const H = loadHistory();
      if (!H || !H.games) return null;
      const ssq = (H.games.ssq || []).map((d) => ({ ...d, red: (d.areas || {}).red || [] }));
      const dlt = (H.games.dlt || []).map((d) => ({ ...d, red: (d.areas || {}).front || [] }));
      cache = {
        ssq: coreAlgo(ssq, 33, false, null),
        dlt: coreAlgo(dlt, 35, true, ssq)
      };
      if (cache.ssq) cache.ssq.issue = ssq[0] && ssq[0].issue;
      if (cache.dlt) cache.dlt.issue = dlt[0] && dlt[0].issue;
    }
    return cache[gameId] || null;
  } catch (e) { return null; }
}

module.exports = { corePoolFor };
