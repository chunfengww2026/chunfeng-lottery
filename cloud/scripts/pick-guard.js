/* pick-guard.js —— 「每一期号码必须和上一期不一样」硬校验 + 加盐重摇
   ============================================================
   用户原话（逐字，两轮）：
     ①「每一期保证和上一期不一样」「所以这一期重新摇」
     ②「虽然有算法 但是推荐号码要保证每期不一样 怎么都要修改几个」
   ------------------------------------------------------------
   为什么需要它（实测出来的真问题）：
     · 智能精选的【胆码 / 杀号】= 近 30 期频次排序的前 3 / 后 3。
       相邻两期的 30 期窗口只差「掉一期最老 + 加一期最新」，
       热门号的名次几乎不动 → 2026121 vs 2026120 实测【胆码 3/3 重合、
       杀号 3/3 重合】，一期都没换过。用户说的「怎么都要修改几个」正是这个。
     · 青蛙 20 码 / 蓝球虽然本来就在换，但没有硬校验：
       万一某期真的撞成一样（20 码重合 20 个），页面不会管。
   ------------------------------------------------------------
   这里只做三件事，全部【确定性、可复现】：
     ① 阈值判定：重合超过阈值 = 不合格
     ② 加盐重摇：种子后面接固定字符串 '|v2' / '|v3' …（不是 Math.random，
        不是时间戳）→ 同一期每次构建都得到同一组盐、同一组号
     ③ 最多试 MAX_TRY 次；还不行就用最后一次并打日志（绝不静默）
   ⚠️ 盐只由「第几次尝试」决定 → 换一台机器、重新构建一遍，结果完全一样。
   ============================================================ */
'use strict';

/* 默认最多重摇几次（用户口径：最多试 50 次） */
const MAX_TRY = 50;

/* 各类号码的硬阈值：重合 ≥ 这个数 → 重摇（等于「至少改这么多号」的上限） */
const MIN_CHANGED = {
  pool20: 5,      /* 青蛙 20 码：至少 5 个不同（重合 ≤ 15） */
  blue6: 3,       /* 双色球蓝球 6 个：至少 3 个不同 */
  back6: 3,       /* 大乐透后区 6 个：至少 3 个不同 */
  dan: 2,         /* 智能精选 胆码 3~4 个：至少 2 个不同 */
  sha: 1,         /* 智能精选 杀号 3 个：至少 1 个不同 */
  pick: 3,        /* 智能精选 精选一注（6+1 / 5+2 / 3 位）：至少 3 个不同 */
  px9: 2,         /* 推荐图 9 套算法：至少 2 个不同 */
  qxcPos: 2       /* 七星彩定位每一位：至少 2 个号不同 */
};

/* 两个号码集合重合几个（多重集口径：按 cur 里每个号去 prev 里找，同号只算一次） */
function overlapOf(prevSet, curSet) {
  const a = Array.isArray(prevSet) ? prevSet : [];
  const b = Array.isArray(curSet) ? curSet : [];
  let n = 0;
  for (const x of b) if (a.indexOf(x) >= 0) n++;
  return n;
}

/* 用户给的原始函数（逐字实现）：完全一样 → false（不合格）；否则 true */
function assertDiffFromLast(gid, prevSet, curSet) {
  if (!Array.isArray(prevSet) || !Array.isArray(curSet)) return true;   /* 拿不到 → 跳过校验 */
  if (prevSet.length !== curSet.length) return true;                    /* 个数变了 → 必然不同 */
  if (!prevSet.length) return true;
  return !prevSet.every((n) => curSet.indexOf(n) >= 0);
}

/* 更严格的一条：至少 minChanged 个不同（= 重合 ≤ 长度 - minChanged）
   —— 用户「怎么都要修改几个」就是这条；比「不完全一样」硬。
   拿不到上一期（prev 不是数组 / 为空）→ 直接合格，不报错。 */
function meetsMinChanged(prevSet, curSet, minChanged) {
  if (!Array.isArray(prevSet) || !Array.isArray(curSet)) return true;
  if (!prevSet.length || !curSet.length) return true;
  const min = Number(minChanged) || 0;
  if (min <= 0) return assertDiffFromLast('', prevSet, curSet);
  return overlapOf(prevSet, curSet) <= Math.max(0, curSet.length - min);
}

/* 加盐：第 t 次尝试用哪个固定字符串（t = 0 → 不加盐，保持历史行为） */
function saltFor(t) { return t > 0 ? '|v' + (t + 1) : ''; }

/* 重摇器（通用）—— 所有「用期号做种子」的号码都走这一条
   opts = {
     gid        : 'frog|ssq'     日志/调试用的名字
     issue      : '2026121'      本期期号（只用来打日志）
     gen        : (salt) => 号码  给盐出号码（必须确定性）
     prevGen    : () => 号码      上一期的号码（不给就跳过校验）
     minChanged : 5              至少几个不同
     maxTry     : 50
     label      : '双色球 20 码'
   }
   返回 { value, prev, tries, ok, salt, gid, label }
     · tries = 重摇了几次（0 = 一次就合格）
     · ok = false 表示试满 maxTry 仍不合格（value 是最后一次的结果） */
function rerollPick(opts) {
  const o = opts || {};
  const maxTry = Math.max(1, Number(o.maxTry) || MAX_TRY);
  const minChanged = o.minChanged == null ? 1 : Number(o.minChanged);
  const gen = typeof o.gen === 'function' ? o.gen : null;
  if (!gen) return { value: null, prev: null, tries: 0, ok: true, salt: '', gid: o.gid || '', label: o.label || '' };

  let prev = null;
  try { prev = (typeof o.prevGen === 'function') ? o.prevGen() : null; } catch (e) { prev = null; }

  let value = null, salt = '', t = 0;
  for (; t < maxTry; t++) {
    salt = saltFor(t);
    try { value = gen(salt); } catch (e) { value = null; }
    if (value == null) { salt = ''; continue; }
    if (meetsMinChanged(prev, value, minChanged)) break;
  }
  const ok = t < maxTry;
  if (!ok) {
    /* 试满还不行：用最后一次（已经是加了盐的第 maxTry 个），并把话说清楚 */
    t = maxTry - 1;
    salt = saltFor(t);
    value = gen(salt);
    try {
      console.warn('  ⚠️ ' + (o.label || o.gid || '号码') + '：重摇 ' + maxTry +
        ' 次仍和上一期太像（' + (o.issue ? '第 ' + o.issue + ' 期' : '本期') + '），先用最后一次');
    } catch (e) { /* 忽略 */ }
  }
  return { value: value, prev: prev, tries: t, ok: ok, salt: salt, gid: o.gid || '', label: o.label || '' };
}

/* 智能精选专用：一份 = { dan:[], sha:[], pick:[] }，三项各自校验，
   任何一项不过就整体重摇（换一个盐），直到三项全过或试满。
   thr = { dan:2, sha:1, pick:3 } */
function pickMeets(cur, prev, thr) {
  if (!cur || !prev) return true;
  const t = thr || {};
  const chk = (k, min) => (min == null ? true : meetsMinChanged(prev[k], cur[k], min));
  return chk('dan', t.dan) && chk('sha', t.sha) && chk('pick', t.pick);
}

function rerollObject(opts) {
  const o = opts || {};
  const maxTry = Math.max(1, Number(o.maxTry) || MAX_TRY);
  const chk = typeof o.check === 'function' ? o.check : function () { return true; };
  const gen = typeof o.gen === 'function' ? o.gen : null;
  if (!gen) return { value: null, prev: null, tries: 0, ok: true, salt: '', gid: o.gid || '', label: o.label || '' };
  let prev = null;
  try { prev = (typeof o.prevGen === 'function') ? o.prevGen() : null; } catch (e) { prev = null; }
  let value = null, salt = '', t = 0;
  for (; t < maxTry; t++) {
    salt = saltFor(t);
    try { value = gen(salt); } catch (e) { value = null; }
    if (value == null) { salt = ''; continue; }
    let ok = false;
    try { ok = !!chk(value, prev); } catch (e) { ok = true; }
    if (ok) break;
  }
  const ok = t < maxTry;
  if (!ok) {
    t = maxTry - 1; salt = saltFor(t);
    try { value = gen(salt); } catch (e) { /* 忽略 */ }
    try {
      console.warn('  ⚠️ ' + (o.label || o.gid || '号码') + '：重摇 ' + maxTry +
        ' 次仍和上一期太像（' + (o.issue ? '第 ' + o.issue + ' 期' : '本期') + '），先用最后一次');
    } catch (e) { /* 忽略 */ }
  }
  return { value: value, prev: prev, tries: t, ok: ok, salt: salt, gid: o.gid || '', label: o.label || '' };
}

/* ============================================================
   【智能精选 · 胆码 / 杀号】频次「带内加权抽号」
   ------------------------------------------------------------
   为什么必须这么改（实测证据）：
     原来 胆码 = 近 30 期出现次数最多的 3 个（纯排序），
     相邻两期的 30 期窗口只差「掉一期最老 + 加一期最新」→ 名次几乎不动，
     实测 2026121 vs 2026120：胆码 3/3 完全相同、杀号 3/3 完全相同。
     用户原话：「虽然有算法 但是推荐号码要保证每期不一样 怎么都要修改几个」。
   改法（仍然只读开奖历史，没有 Math.random）：
     ① 先按次数排名（热=次数降序 / 冷=次数升序）——名次仍然是主导；
     ② 取前 k×bandMul 名作为【候选带】（带里都是"次数差不多"的号）；
     ③ 在带内按「次数差」加权抽号（次数越高权重越大），rnd 由期号种子驱动
        → 每期在带内换一批，但绝不会跳到"明显不热"的号上去。
   例：双色球当前次数 4/13/14/22/24 = 10 次，30/31 = 9/8 次 →
       胆码就在这 7 个里按期号种子挑 3 个，每期会换、但都是真热号。
   ============================================================ */
function bandWeight(band, dir) {
  let lo = Infinity, hi = -Infinity;
  for (const x of band) { if (x.c < lo) lo = x.c; if (x.c > hi) hi = x.c; }
  return band.map((x) => {
    const d = dir === 'cold' ? (hi - x.c) : (x.c - lo);   /* 越该选 → d 越大 */
    return 1 + d * 3;
  });
}

function pickFromBand(ranked, k, rnd, dir, bandMul) {
  const want = Math.max(0, Math.min(k, ranked.length));
  const mul = Math.max(2, Number(bandMul) || 2);
  const band = ranked.slice(0, Math.min(ranked.length, want * mul));
  if (!band.length) return [];
  const out = [];
  const pool = band.map((x) => ({ n: x.n, c: x.c }));
  const w = bandWeight(pool, dir);
  let i = 0;
  while (out.length < want && pool.length) {
    let total = 0;
    for (let j = 0; j < pool.length; j++) total += w[j];
    let r = rnd() * total;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) { r -= w[j]; if (r <= 0) { idx = j; break; } }
    out.push({ n: pool[idx].n, c: pool[idx].c });
    pool.splice(idx, 1);
    w.splice(idx, 1);
    i++;
    if (i > 200) break;
  }
  return out.sort((a, b) => a.n - b.n);
}

/* freq = { 号码: 次数 }（近 30 期）；area = { from, to }
   k = 胆码个数；kCold = 杀号个数（不给就同 k）
   返回 { hot: [{n, c}], cold: [{n, c}] } —— 结构和原来的 zxHotCold 完全一样 */
function bandedHotCold(freq, area, k, rnd, bandMul, kCold) {
  const from = Number(area && area.from) || 0;
  const to = Number(area && area.to) || 0;
  const all = [];
  for (let n = from; n <= to; n++) all.push({ n: n, c: (freq && freq[n]) || 0 });
  const hotRank = all.slice().sort((a, b) => (b.c - a.c) || (a.n - b.n));
  const coldRank = all.slice().sort((a, b) => (a.c - b.c) || (a.n - b.n));
  return {
    hot: pickFromBand(hotRank, k, rnd, 'hot', bandMul),
    cold: pickFromBand(coldRank, kCold == null ? k : kCold, rnd, 'cold', bandMul)
  };
}

/* 给外部（export-static.mjs）统一打一行汇总日志用 */
const _stat = [];
function statReset() { _stat.length = 0; }
function statPush(r) {
  if (!r) return;
  _stat.push({ gid: r.gid, label: r.label, tries: r.tries, ok: r.ok });
  return r;
}
function statReport() {
  const rolled = _stat.filter((x) => x.tries > 0);
  const bad = _stat.filter((x) => x.ok === false);
  return {
    total: _stat.length,
    rerolled: rolled.length,
    rerollTimes: rolled.reduce((a, x) => a + x.tries, 0),
    failed: bad.length,
    rows: _stat.slice()
  };
}

module.exports = {
  MAX_TRY, MIN_CHANGED,
  overlapOf, assertDiffFromLast, meetsMinChanged, saltFor,
  rerollPick, rerollObject, pickMeets,
  bandedHotCold,
  statReset, statPush, statReport
};
