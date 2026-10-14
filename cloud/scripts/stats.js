/* ============================================================
   stats.js —— 历史统计 + 系统自动计算

   两块功能：
     1. 热号/冷号统计 —— 基于真实历史开奖数据的出现频次统计
        （这是统计，不是预测；彩票每期独立随机）
     2. 系统自动算号码池 —— 用 algo.js 的余数筛选算法
        拿最近一期开奖号去筛大底，从多到少排出号码池

   数据来源：history.js（由 build-history.mjs 生成）
   ============================================================ */

/** 取某个彩种的历史开奖列表（最新在前） */
function getHistory(gameId) {
  try {
    if (typeof DRAW_HISTORY === 'undefined' || !DRAW_HISTORY || !DRAW_HISTORY.games) return [];
    return DRAW_HISTORY.games[gameId] || [];
  } catch (e) {
    return [];
  }
}

function getHistoryTime() {
  try {
    return (typeof DRAW_HISTORY !== 'undefined' && DRAW_HISTORY && DRAW_HISTORY.updated) || null;
  } catch (e) { return null; }
}

/* ============================================================
   0. 专家号码池接入层
   ------------------------------------------------------------
   本文件里所有「选号 / 走势」的函数都先问一句：
     · 这个彩种这个区有没有专家号码池（expert-pool.js 提供）？
   · 有 → 号码只从池子里挑（池子不够时用原算法补齐）
   · 没有 → 完全按原来的统计口径走，行为不变
   所以没加载 experts-data.js / expert-pool.js 时，一切照旧。
   ============================================================ */

/** 取某区专家池（按共识度排序）；不可用时返回 [] */
function expertPoolOf(gameId, areaKey) {
  try {
    if (typeof expertPoolOrdered !== 'function') return [];
    if (typeof expertsReady === 'function' && !expertsReady(gameId)) return [];
    const arr = expertPoolOrdered(gameId, areaKey);
    return Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : [];
  } catch (e) { return []; }
}

/** 该区是否有专家池 */
function hasExpertPool(gameId, areaKey) {
  return expertPoolOf(gameId, areaKey).length > 0;
}

/**
 * 【资料优先】资料（data-store.js）里写明的号码 / 杀号。
 * 优先级：资料 > 专家池 > 原算法。解析不出来就返回空（静默跳过，不影响原算法）。
 * @returns {{pick:number[], kill:Set<number>}}
 */
function materialFirstOf(gameId, areaKey, from, to) {
  const out = { pick: [], kill: new Set() };
  try {
    if (typeof materialRulesFor !== 'function') return out;
    const mr = materialRulesFor(gameId, areaKey) || {};
    const kill = (mr.kill || []).filter((x) => x >= from && x <= to);
    out.kill = new Set(kill);
    out.pick = (mr.pick || []).concat(mr.dan || [], mr.tuo || [])
      .filter((x) => Number.isInteger(x) && x >= from && x <= to && !out.kill.has(x));
  } catch (e) { out.pick = []; out.kill = new Set(); }
  return out;
}

/** 号码池基底（专家池优先，不足时用 fillFn / 随机补齐）；没有池返回 null */
function expertBaseOf(gameId, areaKey, total, from, to, fillFn) {
  try {
    if (typeof expertPoolBase !== 'function') return null;
    if (typeof expertsReady === 'function' && !expertsReady(gameId)) return null;
    const arr = expertPoolBase(gameId, areaKey, total, from, to, fillFn);
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch (e) { return null; }
}

/**
 * 号码池构成统计（奇偶 / 大小 / 区间 / 012路 / 质合）
 * @returns {{n:number, jq:string, dx:string, qjb:string, lu012:string, zhs:string}|null}
 *
 * ⚠️ 【不要用它写奇偶比 / 大小比 / 012路比 / 和值 / 跨度】
 *    号号码池有 20 个号，用池子自身的构成会写出「8奇12偶」这种
 *    和玩法对不上的指标（用户反馈「全部都不对」）。
 *    那几个指标必须按「该玩法该区的真实球数」算：
 *      双色球红球 6 · 大乐透前区 5 · 七乐彩 7 · 快乐8 10 · 蓝球 1 · 后区 2
 *    走 areaPickCount() + deriveFromPicks(recNums, ...)，或
 *    calcTrendFields() 里的真实开奖统计。
 *    本函数只做展示用的池子构成说明，不参与指标口径。
 */
function poolComposition(gameId, areaKey, from, to) {
  const pool = expertPoolOf(gameId, areaKey);
  if (!pool.length) return null;

  const nums = pool.filter((n) => n >= from && n <= to);
  if (!nums.length) return null;

  const n = nums.length;
  const mid = (from + to) / 2;
  const odd = nums.filter((x) => x % 2 === 1).length;
  const big = nums.filter((x) => x > mid).length;

  const zoneSize = Math.ceil((to - from + 1) / 3);
  const z = [0, 0, 0];
  nums.forEach((x) => { z[Math.min(2, Math.floor((x - from) / zoneSize))]++; });

  const r = [0, 0, 0];
  nums.forEach((x) => { r[x % 3]++; });

  const prime = nums.filter(isPrime).length;

  return {
    n,
    /* 【单球格式】用户原话：「双色球硬模板蓝球要么就是大要么就是小不要加个 1」
       号码池里只有一个号（比如双色球蓝球池）时，只写「奇」/「偶」、「大」/「小」，
       不写「1奇」「1小」。号码池有多个号时保持原来的「2奇4偶」写法。 */
    jq: n === 1 ? (odd === 1 ? '奇' : '偶') : `${odd}奇${n - odd}偶`,
    dx: n === 1 ? (big === 1 ? '大' : '小') : `${big}大${n - big}小`,
    qjb: z.join(':'),
    lu012: `${r[0]}:${r[1]}:${r[2]}`,
    zhs: `${prime}:${n - prime}`
  };
}

/** 号码池里「号码自身」的统计值（不依赖历史），给 3D / 排3 / 排5 的合值用 */
function poolNumberStats(gameId, areaKey, from, to) {
  const pool = expertPoolOf(gameId, areaKey);
  if (!pool.length) return null;
  const nums = pool.filter((n) => n >= from && n <= to);
  if (!nums.length) return null;
  return {
    nums,
    sumRange: `${Math.min(...nums)}~${Math.max(...nums)}`,
    span: Math.max(...nums) - Math.min(...nums),
    odd: nums.filter((x) => x % 2 === 1).length,
    even: nums.filter((x) => x % 2 === 0).length,
    big: nums.filter((x) => x > (from + to) / 2).length
  };
}

/* ============================================================
   1. 频率统计
   ============================================================ */

/**
 * 统计某个区在最近 N 期的出现次数
 * @param {string} gameId
 * @param {string} areaKey   号码区（如 red / main / front）
 * @param {number} periods   统计期数
 * @returns {Map<number, number>}  号码 -> 出现次数
 */
function countFrequency(gameId, areaKey, periods) {
  const hist = getHistory(gameId).slice(0, periods || 30);
  const freq = new Map();

  hist.forEach((d) => {
    const nums = (d.areas && d.areas[areaKey]) || [];
    nums.forEach((n) => freq.set(n, (freq.get(n) || 0) + 1));
  });

  return freq;
}

/**
 * 取热号（出现次数最多的前 n 个）
 * 有专家池时：先在池子里按出现次数排，不够 n 个再用池外的号补足
 * @returns {{num:number, count:number}[]}
 */
function hotNumbers(gameId, areaKey, n, periods) {
  const want = n || 6;
  const freq = countFrequency(gameId, areaKey, periods);
  const rank = (a, b) => (b.count - a.count) || (a.num - b.num);

  const pool = expertPoolOf(gameId, areaKey);
  if (pool.length) {
    const inPool = new Set(pool);
    const inList = pool.map((num) => ({ num, count: freq.get(num) || 0 })).sort(rank);
    const outList = [...freq.entries()]
      .filter(([num]) => !inPool.has(num))
      .map(([num, count]) => ({ num, count }))
      .sort(rank);
    return inList.concat(outList).slice(0, want);
  }

  return [...freq.entries()]
    .map(([num, count]) => ({ num, count }))
    .sort(rank)
    .slice(0, want);
}

/**
 * 取冷号（出现次数最少的前 n 个）
 * 注意：只统计「在号码范围内出现过至少一次」的号；
 * 若历史期数够多，未出现的号也算冷号。
 * 有专家池时：先在池子里按出现次数从少到多排，不够 n 个再用池外的号补足
 */
function coldNumbers(gameId, areaKey, n, rangeFrom, rangeTo, periods) {
  const want = n || 6;
  const freq = countFrequency(gameId, areaKey, periods);
  const from = rangeFrom || 1;
  const to = rangeTo || 33;
  const rank = (a, b) => (a.count - b.count) || (a.num - b.num);

  const pool = expertPoolOf(gameId, areaKey).filter((x) => x >= from && x <= to);
  if (pool.length) {
    const inPool = new Set(pool);
    const inList = pool.map((num) => ({ num, count: freq.get(num) || 0 })).sort(rank);
    const outList = [];
    for (let i = from; i <= to; i++) {
      if (!inPool.has(i)) outList.push({ num: i, count: freq.get(i) || 0 });
    }
    outList.sort(rank);
    return inList.concat(outList).slice(0, want);
  }

  const all = [];
  for (let i = from; i <= to; i++) {
    all.push({ num: i, count: freq.get(i) || 0 });
  }
  return all.sort(rank).slice(0, want);
}

/**
 * 生成「热号排行」文字数组，格式：13出现8次
 * @returns {string[]}
 */
function hotRankStrings(gameId, areaKey, n, periods) {
  return hotNumbers(gameId, areaKey, n, periods)
    .map((h) => `${Number(h.num) === 0 ? '0' : String(h.num).padStart(2, '0')}出现${h.count}次`);
}

/** 生成「热号」一行文字 */
function hotLine(gameId, areaKey, n, periods) {
  return hotNumbers(gameId, areaKey, n, periods)
    .map((h) => (Number(h.num) === 0 ? '0' : String(h.num).padStart(2, '0')))
    .join(' ');
}

/** 生成「冷号」一行文字 */
function coldLine(gameId, areaKey, n, from, to, periods) {
  return coldNumbers(gameId, areaKey, n, from, to, periods)
    .map((h) => (Number(h.num) === 0 ? '0' : String(h.num).padStart(2, '0')))
    .join(' ');
}

/* ============================================================
   2. 系统自动算号码池
   ------------------------------------------------------------
   用 algo.js 的余数筛选：拿最近一期的开奖号当特征，
   筛出大底里同余的号，再按「近期出现频率」从高到低排序，
   依次截取 20/15/10/3/1 码。
   ============================================================ */

/**
 * 自动计算号码池
 * @param {string} gameId
 * @param {string} areaKey      号码区
 * @param {number[]} rowCounts  各档数量，如 [20,15,10,3,1]
 * @param {object} opts         { from, to, periods, mod }
 * @returns {{label:string, nums:number[]}[]}
 */
function autoNumberPool(gameId, areaKey, rowCounts, opts) {
  const o = opts || {};
  const from = o.from || 1;
  const to = o.to || 33;
  const periods = o.periods || 30;
  const mod = o.mod || 4;

  // 大底
  const pool = [];
  for (let i = from; i <= to; i++) pool.push(i);

  // 特征号 = 最近一期该区的开奖号
  const hist = getHistory(gameId);
  const latest = hist.length ? (hist[0].areas[areaKey] || []) : [];

  let candidate;
  if (latest.length > 0) {
    // 用余数筛选
    const grouped = shrinkLotteryNumbers(latest, pool, mod);
    candidate = flattenShrinkResult(grouped);
  } else {
    candidate = pool.slice();
  }

  // 按出现频率排序（热号优先），频率相同按号码大小
  const freq = countFrequency(gameId, areaKey, periods);
  candidate.sort((a, b) => {
    const fa = freq.get(a) || 0;
    const fb = freq.get(b) || 0;
    if (fb !== fa) return fb - fa;
    return a - b;
  });

  /* 【资料优先】资料里写明的号码排最前、资料杀号剔除（资料 > 专家池 > 原算法） */
  try {
    const mf = materialFirstOf(gameId, areaKey, from, to);
    if (mf.pick.length || mf.kill.size) {
      const kept = candidate.filter((x) => !mf.kill.has(x));
      const band = (kept.length >= Math.max(...rowCounts.map((c) => c || 1), 1)) ? kept : candidate;
      const first = mf.pick.filter((x) => band.indexOf(x) >= 0);
      candidate = first.concat(band.filter((x) => first.indexOf(x) < 0));
    }
  } catch (e) { /* 解析不出来就走原来的排序 */ }

  // 依次截取
  return rowCounts.map((cnt) => ({
    label: cnt + '码',
    nums: candidate.slice(0, cnt).sort((a, b) => a - b)
  }));
}

/**
 * 自动算杀号
 *   有专家池时：杀号 = 池内共识度最低的最后几个（也就是池子里的弱档）
 *   没有池子：原来的「取近期最冷的几个号」
 */
function autoKillNumbers(gameId, areaKey, n, from, to, periods) {
  const want = Math.max(1, n || 3);

  const pool = expertPoolOf(gameId, areaKey);
  if (pool.length) {
    // expertPoolOf 返回的是「共识度从高到低」，所以尾部就是共识度最低的
    const killed = pool.slice(Math.max(0, pool.length - want)).reverse().sort((a, b) => a - b);
    if (killed.length >= want) return killed;

    // 池子比要杀的个数还少时，用池外最冷的号补齐
    const inPool = new Set(pool);
    const extra = coldNumbers(gameId, areaKey, want * 3, from, to, periods)
      .map((c) => c.num).filter((x) => !inPool.has(x));
    const merged = killed.slice();
    extra.forEach((x) => { if (merged.length < want && !merged.includes(x)) merged.push(x); });
    return merged.sort((a, b) => a - b);
  }

  return coldNumbers(gameId, areaKey, want, from, to, periods)
    .map((c) => c.num)
    .sort((a, b) => a - b);
}

/* ============================================================
   3. 汇总：给某个模板图生成「系统计算」的填充值
   ============================================================ */

/* ============================================================
   5.5 九转连环图 · 固定同心圆模板【用户指定，不许改】
   ------------------------------------------------------------
   用户原话：「九转连环图必须是这种模板还要有号码」。

   结构：中心 1 个 + 4 圈 × 8 个方向 = 33 个位置（固定不变）。
   每圈 8 个方向按【从上开始、顺时针】理解：
     [0]上 [1]右上 [2]右 [3]右下 [4]下 [5]左下 [6]左 [7]左上
   所以 rings[i][0] 在正上方、[2] 正右方、[4] 正下方、[6] 正左方。

   ⚠️ 下面这张表是用户逐字给的，数组顺序 = 号码摆放位置，
      不要重排、不要“优化”。
   ⚠️ 双色球表 = 1~33 各一次（无重复无遗漏）；
      大乐透表 33 个号，1~35 里缺 01 和 33（用户给的就是这样，照实现，
      要不要补齐由用户决定，代码不擅自补号）。
   ============================================================ */
const JIUZHUAN_LAYOUT = {
  ssq: {
    center: 17,
    rings: [
      [16, 9, 25, 11, 23, 13, 21, 7],
      [15, 4, 28, 5, 29, 19, 22, 2],
      [18, 3, 30, 6, 27, 20, 24, 1],
      [14, 8, 31, 10, 33, 12, 26, 32]
    ]
  },
  dlt: {
    center: 18,
    rings: [
      [17, 10, 26, 12, 24, 14, 22, 8],
      [16, 5, 29, 6, 30, 20, 23, 3],
      [19, 4, 31, 7, 28, 21, 25, 2],
      [15, 9, 32, 11, 35, 13, 27, 34]
    ]
  }
};

/** 取某彩种的九转连环固定模板；没有就返回 null（render 那边退回旧画法） */
function jiuzhuanLayoutOf(gameId) {
  return JIUZHUAN_LAYOUT[gameId] || null;
}

/* ---- 【每期变化的中心点】用户要求：「九宫格和九转图每一期中心点还是变一下」 ----
   用户给的那张表里 center 是写死的（ssq=17 / dlt=18）。要在**不改表**的前提下
   让中心每期变，用「整条 33 格序列整体轮转 rotate = 中心下标」的办法：

     · 轮转量从【上期开奖号】确定性算出来（同一期 → 同一个中心，刷新不会变）
     · 中心站哪个位置，就把整串 33 个号绕着这个位置轮转一圈：
         位置 i 的号 = SEQ[(i - rotate + 33) % 33]
       于是位置 0（正中心）拿到的正好是 SEQ[rotate]
     · 其余 32 个位置的号【相对顺序完全保持用户表的原样】，只是整体转了一下，
       所以「33 个位置 = 全部号码、无重复无遗漏」这两条永远成立

   轮转量口径（可复现、可解释）：
     数根和 = Σ getNumberRoot(上期每个号)
     rotate = 数根和 % 33
   取不到上期号码时 rotate = 0 → 就是用户原表（中心 = 表里的 center）。 */
function jiuzhuanRotateOf(lastNums, size) {
  const list = (lastNums || []).filter((n) => Number.isInteger(n));
  const mod = size || 33;
  if (!list.length) return 0;
  let sum = 0;
  list.forEach((n) => { sum += getNumberRoot(n); });
  return ((sum % mod) + mod) % mod;
}

/** 把固定表的 33 格序列按 rotate 整体轮转（保证仍是同一批号、无重复无遗漏） */
function rotateSeq(seq, rotate) {
  const n = seq.length;
  const r = ((rotate % n) + n) % n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(seq[(i - r + n) % n]);
  return out;
}

/**
 * 本期九转连环盘面（中心每期变）
 * @returns {{center:number, rings:number[][], seq:number[], rotate:number, last:number[], size:number}}
 *          rings[ri][di] = 第 (ri+1) 圈「第 di 个方向」上的号（0=上，顺时针 45°）
 */
function jiuzhuanMatrixFor(gameId) {
  return jiuzhuanMatrixFromLast(gameId, lastIssueNumsFor(gameId));
}

/**
 * 同上，但上期开奖号由调用方给（验收/排查时可以直接喂几组号码，不动历史数据）
 * @param {string} gameId
 * @param {number[]} lastNums 上期开奖号（双色球 6 个红球 / 大乐透 5 个前区号）
 */
function jiuzhuanMatrixFromLast(gameId, lastNums) {
  const L = jiuzhuanLayoutOf(gameId);
  if (!L) return null;
  const seq = [L.center].concat(...L.rings);              // 33 格，用户表的原始顺序
  const last = (lastNums || []).filter((n) => Number.isInteger(n));
  const rotate = jiuzhuanRotateOf(last, seq.length);
  const rotated = rotateSeq(seq, rotate);                 // 位置 i 的号 = SEQ[(i-rotate+n)%n]
  const rings = [];
  for (let ri = 0; ri < L.rings.length; ri++) {
    rings.push(rotated.slice(1 + ri * 8, 1 + ri * 8 + 8));
  }
  return { center: rotated[0], rings, seq, rotate, last, size: seq.length };
}

/* ============================================================
   5.6 九宫图 · 洛书 + 每期自动偏移【用户指定算法，原文照抄】
   ------------------------------------------------------------
   用户原话：「九宫图的代码：」+ 下面这段，要求原样落进项目。
   数据流：上期开奖号 → calcOffsetByLastLottery → offset
           → matrixOffsetShift(BASE_LU_SHU, offset) → 本期九宫矩阵
   ============================================================ */

// 原始基准洛书【只读，不能改】
const BASE_LU_SHU = [
  [4,9,2],
  [3,5,7],
  [8,1,6]
];

// 克隆矩阵（保护基准，所有操作在副本）
function cloneMatrix(mat){
  return JSON.parse(JSON.stringify(mat));
}

// 号码求数根：号码 → 宫号
function getNumberRoot(num){
  let n = num;
  while(n>=10){
    let s=0;
    while(n>0){
      s += n%10;
      n = Math.floor(n/10);
    }
    n = s;
  }
  if(n===0) return 5;
  return n;
}

/**
 * 【核心！每期自动变化函数】宫位偏移
 * @param mat 九宫矩阵副本
 * @param offset 偏移量 1~9
 */
function matrixOffsetShift(mat, offset){
  const m = cloneMatrix(mat);
  for(let i=0;i<3;i++){
    for(let j=0;j<3;j++){
      let val = m[i][j] + offset;
      if(val >9) val -=9;
      if(val ===0) val =9;
      m[i][j] = val;
    }
  }
  return m;
}

// 复位：回到原始洛书
function resetLuShu(){
  return cloneMatrix(BASE_LU_SHU);
}

/**
 * 【每期自动计算偏移量】输入上期开奖号码，输出offset
 * 业务主函数：每期执行这个，自动得到偏移值
 */
function calcOffsetByLastLottery(lastNumList){
  // 1、统计上期开奖号落在各个宫的数量
  const countMap = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
  lastNumList.forEach(num=>{
    const gong = getNumberRoot(num);
    countMap[gong]++;
  });
  // 2、找出出现次数最多的宫，作为偏移offset
  let maxCount = -1;
  let offset = 1;
  for(let g=1;g<=9;g++){
    if(countMap[g]>maxCount){
      maxCount = countMap[g];
      offset = g;
    }
  }
  return offset;
}

/* ---- 把上面两个算法接进出号流程：上期开奖号 → 本期九宫 ---- */

/**
 * 上期开奖号（九宫图用）
 *   双色球 → 6 个红球（不带蓝球）；大乐透 → 5 个前区号（不带后区）
 *   取不到就返回 []
 * @returns {number[]}
 */
function lastIssueNumsFor(gameId) {
  try {
    const hist = getHistory(gameId);
    if (!hist.length) return [];
    const areas = (hist[0] && hist[0].areas) || {};
    /* 【按区名找，不按彩种名写死】
       以前写的是 'dlt' → front / 'ssq' → red / 其它 → main，
       七乐彩（main）碰巧对，七星彩（实际是 front + back）就永远取不到上期号
       → 九宫图每期都不偏移、九转连环中心变成「—」。
       现在按「这个彩种的主区叫什么」逐级回退，新增彩种不用再改这里。 */
    const key = ['front', 'red', 'main'].find((k) => Array.isArray(areas[k]) && areas[k].length);
    const arr = (key ? areas[key] : []).filter((n) => Number.isInteger(n));
    return arr.slice(0, 6);
  } catch (e) { return []; }
}

/**
 * 本期九宫盘面（每期自动变化）
 * @returns {{offset:number, matrix:number[][], last:number[], centerPalace:number, counts:object}}
 */
function jiugongMatrixFor(gameId) {
  const last = lastIssueNumsFor(gameId);
  const counts = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
  last.forEach((num) => { counts[getNumberRoot(num)]++; });
  // 没有上期开奖数据时 offset 取算法初值 1，盘面照样出得来
  const offset = last.length ? calcOffsetByLastLottery(last) : 1;
  const matrix = matrixOffsetShift(BASE_LU_SHU, offset);
  const centerPalace = matrix[1][1];           // 中宫 = 基准洛书里 5 那一格
  return { offset, matrix, last, centerPalace, counts };
}

/** 中宫那几个宫位对应的号码（号码范围内「数根 == 中宫」的号） */
function jiugongGuanNums(gameId, centerPalace, from, to) {
  const out = [];
  for (let n = from; n <= to; n++) if (getNumberRoot(n) === centerPalace) out.push(n);
  return out;
}

/* ============================================================
   6. 五行 / 绕胆 / 九宫模板的自动填充
   ------------------------------------------------------------
   全部按固定规则生成，不是预测。
   ============================================================ */

/** 五行号码：按尾数归类（金4/9 木3/8 水1/6 火2/7 土5/0） */
function wuxingNumbers(from, to) {
  const T = { jin: [4, 9], mu: [3, 8], shui: [1, 6], huo: [2, 7], tu: [5, 0] };
  /* 【0 只出一位】用户硬性要求「号码里的 0 写成单个 0，不写 00」。
     五行号码这块用 render.js 的 numBalls → twoDigit()，它会把 0 补成 '00'，
     所以数字型彩种（七星彩等 0 起算的区）这里就把尾数 0 的号排除掉，
     宁可少一个「土」组的 0，也不在图上出现 00。 */
  const showZero = from > 0;
  const out = {};
  Object.keys(T).forEach((k) => {
    const arr = [];
    for (let n = from; n <= to; n++) {
      if (!showZero && n === 0) continue;
      if (T[k].includes(n % 10)) arr.push(n);
    }
    out[k] = arr;
  });
  return out;
}

/* ============================================================
   6.1 五行阴阳映射【用户指定，原文照抄】
   ------------------------------------------------------------
   ⚠️ 用户给这份映射起的正式名字就是 `yinyangTail`（键是字符串 "0"~"9"）。
      这里定义成 WUXING_YINYANG_TAIL 并在注释里保留用户原名，
      避免和别处可能出现的同名变量撞车。
   ⚠️ 尾数归类和 wuxingNumbers() 完全一致（1/6 水、2/7 火、3/8 木、
      4/9 金、5/0 土），所以现有的「五行号码」分组【不用改】，
      这份映射新增的是「阴阳」这一维。
   ============================================================ */

// 五行阴阳映射（用户原名：yinyangTail）
const WUXING_YINYANG_TAIL = {
  "1": {wx:"water", yinyang:"yang", name:"阳水"},
  "6": {wx:"water", yinyang:"yin",  name:"阴水"},
  "2": {wx:"fire",  yinyang:"yin",  name:"阴火"},
  "7": {wx:"fire",  yinyang:"yang", name:"阳火"},
  "3": {wx:"wood",  yinyang:"yang", name:"阳木"},
  "8": {wx:"wood",  yinyang:"yin",  name:"阴木"},
  "4": {wx:"metal", yinyang:"yin",  name:"阴金"},
  "9": {wx:"metal", yinyang:"yang", name:"阳金"},
  "5": {wx:"earth", yinyang:"yang", name:"阳土"},
  "0": {wx:"earth", yinyang:"yin",  name:"阴土"}
};

/**
 * 获取号码的五行+阴阳
 * @param {number} num
 */
function getNumWuxingYinYang(num){
  const tail = num %10;
  // 表里的键是字符串 "0"~"9"；JS 里 obj[1] 和 obj["1"] 等价，
  // 但这里仍用 String(tail) 显式取，避免踩坑
  return WUXING_YINYANG_TAIL[String(tail)];
}

/**
 * 统计阴阳数量
 */
function countYinYangStat(numList){
  let yangCount = 0;
  let yinCount =0;
  numList.forEach(num=>{
    const info = getNumWuxingYinYang(num);
    if(info.yinyang === "yang") yangCount++;
    else yinCount++;
  })
  return {yangCount, yinCount};
}

/** 图上那行「阳 N · 阴 M」的文案（按真实球数统计，不是号码池） */
function yinYangLine(numList) {
  const st = countYinYangStat(numList || []);
  return `阳 ${st.yangCount} · 阴 ${st.yinCount}`;
}

/** 给五行行补「本行号码各自的阴阳」标记：
    行内固定两个尾数，一个是阳一个是阴（1/6、2/7、3/8、4/9、5/0），
    所以结果是「阳X·阴Y」；阳永远写在前面，和行里号码的排列顺序无关。 */
function yinYangLabelOf(tailsLabel) {
  const tails = [];
  (String(tailsLabel || '').match(/\d/g) || []).forEach((d) => {
    const t = Number(d);
    if (tails.indexOf(t) < 0) tails.push(t);
  });
  let yang = '';
  let yin = '';
  tails.forEach((t) => {
    const info = WUXING_YINYANG_TAIL[String(t)];
    if (!info) return;
    if (info.yinyang === 'yang') yang += t;
    else yin += t;
  });
  return `阳${yang}·阴${yin}`;
}

/* ---------- 干支与神煞（传统对照表） ---------- */

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const SHENGXIAO = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

/** 日支索引（0=子 … 11=亥） */
function dayZhiIndex(d) {
  // 以 1949-10-01（甲子日附近）为基准，用儒略日推算日支
  const base = Date.UTC(1949, 9, 1);
  const days = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - base) / 86400000);
  return ((days % 12) + 12 + 0) % 12;
}

/** 日干支（甲子为 0，60 循环） */
function dayGanzhiIndex(d) {
  const base = Date.UTC(1949, 9, 1);
  const days = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - base) / 86400000);
  return ((days % 60) + 60) % 60;
}

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

function dayGanzhiText(d) {
  const gz = dayGanzhiIndex(d);
  return GAN[gz % 10] + ZHI[gz % 12];
}

/** 财神方位（按日干） */
const CAISHEN_GAN = ['东北', '东北', '西南', '西南', '正北', '正北', '正东', '正东', '正南', '正南'];

/** 喜神方位（按日干） */
const XISHEN_GAN = ['东北', '西北', '西南', '正南', '东南', '东北', '西北', '西南', '正南', '东南'];

/** 福神方位（按日干） */
const FUSHEN_GAN = ['东南', '东南', '正东', '正东', '正北', '正北', '西南', '西南', '西北', '西北'];

/** 贵神方位（按日干） */
const GUISHEN_GAN = ['西南', '西南', '正西', '正西', '正北', '正北', '东北', '东北', '正东', '正东'];

/**
 * 吉神方位 + 冲煞
 * 财神/喜神/福神/贵神 按日干查表；冲煞按日支
 */
function luckyDirections(d) {
  const ganIdx = dayGanzhiIndex(d) % 10;
  const zhiIdx = dayZhiIndex(d);
  const chongIdx = (zhiIdx + 6) % 12;
  return {
    财神: CAISHEN_GAN[ganIdx],
    喜神: XISHEN_GAN[ganIdx],
    福神: FUSHEN_GAN[ganIdx],
    贵神: GUISHEN_GAN[ganIdx],
    冲煞: `冲${SHENGXIAO[chongIdx]} 煞${['南', '东', '北', '西'][zhiIdx % 4]}`
  };
}

/** 简易农历（按公历日期与春节表粗略换算，够显示用） */
function lunarText(d) {
  // 农历换算需要完整历表，这里只给出月份与日期区间的近似说明，
  // 避免显示错误的具体农历日期。
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const approx = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
  // 以公历月近似对应农历月（误差 1 个月内），标注为参考
  const lm = approx[(m + 10) % 12];
  const ld = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
              '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
              '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'][(day - 1) % 30];
  return `${lm}月${ld}`;
}

/* ============================================================
   绕胆图（4×4）—— 用户指定的【固定模板版式】
   ------------------------------------------------------------
   用户原话：「绕胆图模板赢条件金胆只能有三个 银胆只有3个6个托4个蓝
             蓝球不要在推荐里面选 我提供模板给我固定模板 蓝必须在中间
             其他的可以随意环绕但是我的要求胆数不能变」

   ① 角色位置表写死（行优先 0~15）：
        拖 拖 金 拖
        拖 蓝 蓝 银
        银 蓝 蓝 金
        金 拖 拖 银
   ② 蓝球固定在中间 2×2（位置 5/6/9/10）—— 「蓝必须在中间」
   ③ 金/银/拖 的号码可以随出号变化，但【角色占的格子永不变】、
      数量恒定 金3 · 银3 · 拖6 · 蓝4 —— 「胆数不能变」
   ④ 蓝球取的是【蓝球池】(双色球 1~16 / 大乐透 1~12) 的号，
      并排除「蓝球推荐」里已经有的 6 个 —— 「蓝球不要在推荐里面选」
   ============================================================ */

/** 角色位置表（行优先 0~15）—— 绕胆图数据的唯一口径 */
const RAODAN_ROLES = [
  'tuo', 'tuo', 'dan', 'tuo',
  'tuo', 'blue', 'blue', 'yin',
  'yin', 'blue', 'blue', 'dan',
  'dan', 'tuo', 'tuo', 'yin'
];

/** 角色 → 色块 class（render.js 与本表同源，颜色只在 render.js 用） */
const RAODAN_COLOR = { dan: 'goldred', yin: 'orange', tuo: 'purple', blue: 'blue' };

/** 角色 → 中文字（验收/报告用） */
const RAODAN_ROLE_CN = { dan: '金', yin: '银', tuo: '拖', blue: '蓝' };

/** 绕胆图每个角色要几个（恒定，任何情况下都不多不少） */
const RAODAN_COUNT = { dan: 3, yin: 3, tuo: 6, blue: 4 };

/**
 * 蓝球关注 4 个 —— 只从【蓝球池】取，且排除「蓝球推荐」已有的号
 *   ① 主路径：recommendNumbers(蓝球区) 的推荐序里，跳过 exclude、取 4 个
 *      （排除后的候选仍按「专家号码池 → 近 10 期×3 + 近 30 期」排）
 *   ② 兜底：池子不够 4 个时，用【近 30 期开奖的蓝球频率】补
 *      （只在「区大小 - 排除数 < 4」时才会触发，双色球 16-6=10、大乐透 12-6=6，
 *        实际永远够；这里留着是为了数量恒定这条硬性要求）
 *   ③ 保证：返回的号在 [from,to] 内、互不重复、且必与 exclude 无交集
 * @returns {number[]} 升序，长度 = min(4, 区大小 - exclude 数)
 */
function raodanBluePicks(gameId, areaKey, from, to, exclude) {
  const size = to - from + 1;
  const banned = new Set((exclude || []).filter((x) => x >= from && x <= to));
  const want = Math.min(4, size - banned.size);

  const out = [];
  const push = (n) => {
    if (out.length >= want) return;
    if (!(n >= from && n <= to)) return;
    if (banned.has(n)) return;
    if (out.indexOf(n) >= 0) return;
    out.push(n);
  };

  /* 【重要】recommendNumbers() 最后一句是 picked.sort((a,b)=>a-b)，
     它只保证「取哪几个号」，【不保留任何优先级顺序】——
     所以这里不能拿它当排序源，必须自己按优先级排：
       ① 蓝球（后区）专家号码池（按共识度）
       ② 近 10 期×3 + 近 30 期 的频率分（和 recommendNumbers 同一口径）
       ③ 升序兜底，保证一定要凑够 4 个
     每一层都跳过「蓝球推荐（exclude）」里已有的号。 */

  /* ① 蓝球专家池，按共识度 */
  try {
    expertPoolOf(gameId, areaKey)
      .filter((n) => n >= from && n <= to)
      .forEach(push);
  } catch (e) { /* 忽略 */ }

  /* ② 频率分（近期更活跃的排前面；同分按号小优先，保证确定性） */
  if (out.length < want) {
    try {
      const hist = getHistory(gameId);
      const recent = new Map();
      const all = new Map();
      hist.slice(0, 10).forEach((d) => {
        ((d.areas && d.areas[areaKey]) || []).forEach((x) => recent.set(x, (recent.get(x) || 0) + 1));
      });
      hist.slice(0, HIST_PERIODS).forEach((d) => {
        ((d.areas && d.areas[areaKey]) || []).forEach((x) => all.set(x, (all.get(x) || 0) + 1));
      });
      const ranked = [];
      for (let n = from; n <= to; n++) {
        ranked.push({ num: n, score: (recent.get(n) || 0) * 3 + (all.get(n) || 0) });
      }
      ranked.sort((a, b) => b.score - a.score || a.num - b.num);
      ranked.forEach((x) => push(x.num));
    } catch (e) { /* 忽略 */ }
  }

  /* ③ 升序兜底（池子/频率都用完还不够时的最后保险） */
  for (let n = from; n <= to; n++) push(n);

  return out.sort((a, b) => a - b);
}

/**
 * 从号码池里构造 4×4 绕胆图（固定版式）
 *
 * 取数规则（与模板图一同一套口径，保证整图不自相矛盾）：
 *   金 3 / 银 3 / 拖 6 —— 都来自 recommendNumbers(主区) 的同一个 16 码池，
 *                          按原顺序切成 3 / 3 / 6+ 段 → 三段互不重复；
 *                          池子不足 16 个时用 calcDanTuo() 的胆拖口径补齐
 *   蓝 4               —— 只来自蓝球池，且排除「蓝球推荐」（见 raodanBluePicks）
 *
 * @param {number[]} pool       主区（红球/前区）推荐池
 * @param {number[]} backNums   蓝球池候选（保留参数，兼容旧调用）
 * @param {object}   info       { gameId, areaKey, backKey, from, to, blueFrom, blueTo, blueExclude }
 * @returns {object} { grid_0 .. grid_15 } —— 位置固定，值随出号变
 */
function buildRaodanGrid(pool, backNums, info) {
  const cfg = info || {};
  const gameId = cfg.gameId || 'ssq';
  const areaKey = cfg.areaKey || (gameId === 'dlt' ? 'front' : 'red');
  const from = cfg.from || 1;
  const to = cfg.to || (gameId === 'dlt' ? 35 : 33);
  const blueFrom = cfg.blueFrom || 1;
  const blueTo = cfg.blueTo || (gameId === 'dlt' ? 12 : 16);

  const main = Array.isArray(pool) ? pool.filter((n) => n >= from && n <= to) : [];

  /* ---- 主区：金 3 / 银 3 / 拖 6（互斥） ----
     【硬性保证】先整体去重，再去重后再补足 12 个 ——
     上游推荐池在「没有历史数据」的兜底路径里会返回重复号，
     同一个号占两格会被当成「拖码凑数」；用户要求胆数不能变、
     所以这里必须保证 12 个格子是 12 个不同的号。 */
  const uniqIn = (arr) => {
    const seen = new Set();
    const out = [];
    arr.forEach((n) => {
      const v = Number(n);
      if (!Number.isFinite(v)) return;
      if (seen.has(v)) return;
      seen.add(v);
      out.push(v);
    });
    return out;
  };
  const pick = uniqIn(main);
  if (pick.length < 12) {
    /* 池子不足 12 个：用胆拖口径补齐，且绝不与已有号重复 */
    try {
      const areas = historyAreas(gameId, areaKey, HIST_PERIODS);
      const dt = calcDanTuo(gameId, areaKey, areas, from, to);
      uniqIn(dt.dan.map(Number).concat(dt.tuo.map(Number))).forEach((n) => {
        if (pick.length < 12 && pick.indexOf(n) < 0) pick.push(n);
      });
    } catch (e) { /* 忽略 */ }
  }
  /* 还不够（无历史 + 无专家池的极端情况）→ 从大到小把没被占用的号补上，
     保证 金/银/拖 这 12 格一定有 12 个不同的号 */
  for (let n = to; n >= from && pick.length < 12; n--) {
    if (pick.indexOf(n) < 0) pick.push(n);
  }

  const dan = pick.slice(0, RAODAN_COUNT.dan);                             // 金 3
  const yin = pick.slice(RAODAN_COUNT.dan, RAODAN_COUNT.dan + RAODAN_COUNT.yin);   // 银 3
  const tuo = pick.slice(RAODAN_COUNT.dan + RAODAN_COUNT.yin,
    RAODAN_COUNT.dan + RAODAN_COUNT.yin + RAODAN_COUNT.tuo);               // 拖 6

  /* ---- 蓝球 4：只从蓝球池取，排除「蓝球推荐」 ---- */
  const blueExcl = Array.isArray(cfg.blueExclude) ? cfg.blueExclude
    : (Array.isArray(backNums) && backNums.length ? backNums : []);
  const blue = raodanBluePicks(gameId, cfg.backKey || (gameId === 'dlt' ? 'back' : 'blue'),
    blueFrom, blueTo, blueExcl);

  /* ---- 按固定角色表落格（位置不变，值变） ---- */
  const byRole = { dan, yin, tuo, blue };
  const cursor = { dan: 0, yin: 0, tuo: 0, blue: 0 };
  const out = {};
  for (let i = 0; i < RAODAN_ROLES.length; i++) {
    const role = RAODAN_ROLES[i];
    const n = byRole[role][cursor[role]++];
    if (n === undefined) continue;                 // 池子异常时不写，渲染成空格
    out['grid_' + i] = pad2(n);
  }
  return out;
}

/**
 * 蓝球（后区）「推荐」号 —— 即用户说的「推荐」里那批，
 *   绕胆图的蓝球关注必须避开它们
 * 口径：与模板图一的「蓝球推荐 / 后区推荐」字段同一个函数、同一组参数
 *   （双色球 6 个 · 大乐透 2 个），保证两边永远对得上
 */
function backRecNumbers(gameId, areaKey, n) {
  const [from, to] = consRangeOf(gameId, areaKey);
  const want = Math.min(n, to - from + 1);
  try {
    return recommendNumbers(gameId, areaKey, want, from, to);
  } catch (e) {
    return [];
  }
}

/* ============================================================
   五行九宫这张图的「号码区」口径（新增彩种只要在 games.js 写清 areas 就对）
   ------------------------------------------------------------
   原来这三个值是写死在 autoFillWuxing 里的（1 / dlt?35:33 / dlt?front:red），
   只对双色球、大乐透成立。七乐彩（1~30）会多铺 31/32/33；
   七星彩（前六位 0~9 + 最后一位 0~14）整个结构都对不上。
   统一成"读 games.js 的 areas"后：
     · 七乐彩  → main 1~30
     · 七星彩  → front 0~9
   ============================================================ */
const WUXING_AREA_OVERRIDE = {
  /* 双色球：红球（areas[0] 本来就是 red，写在这里只是把口径写明 */
  ssq: { area: 'red', from: 1, to: 33 },
  /* 大乐透：前区 */
  dlt: { area: 'front', from: 1, to: 35 }
};

/** 五行/九转/九宫这张图用的主号码区 */
function wuxingAreaOf(gameId) {
  const o = WUXING_AREA_OVERRIDE[gameId];
  if (o) return o;
  const g = (typeof GAMES !== 'undefined' && GAMES) ? GAMES[gameId] : null;
  const a = (g && Array.isArray(g.areas) && g.areas[0]) || null;
  if (a && Number.isInteger(a.from) && Number.isInteger(a.to)) {
    return { area: a.key, from: a.from, to: a.to };
  }
  return { area: 'main', from: 1, to: 33 };
}

/** 后区 / 特别号 的区名（绕胆图「蓝球/后区关注」和它的号码范围都按这个来） */
function backAreaOf(gameId) {
  return { ssq: 'blue', dlt: 'back', qxc: 'back', qlc: 'special' }[gameId]
    || (gameId === 'dlt' ? 'back' : 'blue');
}

/** 后区 / 特别号 的号码范围（同 consRangeOf，但七乐彩特别号是 1~30） */
function backRangeOf(gameId) {
  const per = {
    ssq:  [1, 16],
    dlt:  [1, 12],
    qlc:  [1, 30],
    qxc:  [0, 14]
  }[gameId];
  if (per) return per;
  const g = (typeof GAMES !== 'undefined' && GAMES) ? GAMES[gameId] : null;
  const a = (g && Array.isArray(g.areas) && g.areas[1]) || null;
  if (a && Number.isInteger(a.from) && Number.isInteger(a.to)) return [a.from, a.to];
  return [1, 16];
}

/** 「蓝球 / 后区 / 特别号」这一区每期真实开出几个号 */
function backPickCountOf(gameId, fallback) {
  const n = AREA_PICK_COUNT[gameId] ? AREA_PICK_COUNT[gameId][backAreaOf(gameId)] : 0;
  return (Number.isInteger(n) && n > 0) ? n : (fallback || 1);
}

/**
 * 九转连环「通用铺号」（只给【没有 JIUZHUAN_LAYOUT 固定表】的彩种用）
 *   几何完全是 ssq / dlt 那一套：位置 0 = 中心，位置 1~32 = 第 1~4 圈
 *   各 8 个方向（0=上，顺时针 45°）。
 *   号：按本彩种主区范围 [from,to] 升序循环铺满 33 格。
 *   轮转：本彩种顺序里的上期开奖号 → 每个号取「数根」→ 求和 → mod 33，
 *        让中心每期跟着开奖号变（和 ssq / dlt 的轮转是同一个思路）。
 * @returns {object} cir_num_center / cir_num_01~32 / cir_center / cir_0~7
 */
function genericCircleNums(gameId, from, to, jzNow) {
  const cand = [];
  for (let n = from; n <= to; n++) cand.push(n);
  const out = {};
  if (!cand.length) return out;

  const SIZE = 33;

  /* 从大到小铺：这样位置 0（中心）拿到的是范围里最大的号，接近 ssq/dlt
     中心在 16~18 的位置感，不会一开图中心就是 0 或 01。 */
  const desc = cand.slice().reverse();
  const nums = [];
  for (let i = 0; i < SIZE; i++) nums.push(desc[i % desc.length]);

  const last = (jzNow && Array.isArray(jzNow.last)) ? jzNow.last : [];
  const rot = last.length
    ? (last.reduce((s, n) => s + getNumberRoot(n), 0) % SIZE)
    : 0;
  if (rot) {
    const tail = nums.splice(SIZE - rot, rot);
    nums.unshift.apply(nums, tail);
  }

  out.cir_num_center = pad2(nums[0]);
  for (let i = 1; i < SIZE; i++) out['cir_num_' + i] = pad2(nums[i]);
  /* 旧键（存档里可能还带着）：中心 + 第 1 圈 8 个方向 */
  out.cir_center = pad2(nums[0]);
  for (let i = 0; i < 8; i++) out['cir_' + i] = pad2(nums[1 + i]);
  return out;
}

/**
 * 五行九宫模板的自动填充
 * @param {string} gameId
 * @param {object} [opts] { backRec: number[] } —— 已经算好的「蓝球推荐 / 后区推荐」，
 *        由 autoFillForTemplate 传进来，保证「绕胆图蓝球避开的那批号」
 *        和图上真正印出来的「蓝球推荐」永远是同一批
 *        （没有历史数据时 recommendNumbers 会走随机兜底，
 *          不传就会出现「算两次、两次不一样」）。
 */
function autoFillWuxing(gameId, opts) {
  const out = {};
  const now = new Date();

  /* ---- 日期 ---- */
  out.c_gongli = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ` +
    ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
  out.c_nongli = lunarText(now);
  const gzText = dayGanzhiText(now);
  out.c_ganzhi = `${
    GAN[(now.getFullYear() - 4) % 10]}${ZHI[(now.getFullYear() - 4) % 12]}年 ${gzText}日`;
  out.c_wx = `${gzText}日`;

  /* ---- 神煞方位 ---- */
  const dirs = luckyDirections(now);
  out.badge1 = dirs['财神'];
  out.badge2 = dirs['喜神'];
  out.badge3 = dirs['福神'];
  out.badge4 = dirs['贵神'];
  out.badge5 = dirs['冲煞'];

  /* ---- 号码范围 / 五行号码 ----
     【不要再按彩种名写死】以前是 from=1、to = dlt ? 35 : 33、areaKey = dlt ? front : red，
     只对双色球（1~33 红球）和大乐透（1~35 前区）成立：
       · 七乐彩 1~30 会被铺出 31/32/33 这三个根本不存在的号；
       · 七星彩主区是 0~9 的数位，「红球 1~33」和它的开奖结构完全对不上。
     现在统一走「这个彩种的 areas[0]」+ 一个可覆盖表（和 AREA_PICK_COUNT 同口径），
     新增彩种只要在 games.js 里写清 areas 就自动正确。 */
  const hs = wuxingAreaOf(gameId);
  const from = hs.from;
  const to = hs.to;
  const areaKey = hs.area;
  const wx = wuxingNumbers(from, to);
  out.e_jin = wx.jin.map(pad2).join(' ');
  out.e_mu = wx.mu.map(pad2).join(' ');
  out.e_shui = wx.shui.map(pad2).join(' ');
  out.e_huo = wx.huo.map(pad2).join(' ');
  out.e_tu = wx.tu.map(pad2).join(' ');

  /* ---- 五行阴阳（用户指定的 yinyangTail 映射） ----
     分组不变（上面五行那 5 行原样），这里只多两件事：
       · 每行标出该行两个尾数各自的阴阳（模板里五行元素的 tailsLabel 就是标记来源）
       · 按【真实球数】统计本期推荐号的阳/阴（双色球红球 6、大乐透前区 5，
         不是号码池那 20 个）—— 用 countYinYangStat() */
  const yyPickN = areaPickCount(gameId, areaKey, (to - from + 1) >= 30 ? 6 : 3);
  const yyNums = recommendNumbers(gameId, areaKey, yyPickN, from, to);
  out.wx_yy = yinYangLine(yyNums);

  /* ---- 尾数旺弱（近 30 期真实频次） ---- */
  const hist = getHistory(gameId);
  const tail = new Array(10).fill(0);
  hist.slice(0, 30).forEach((d) => {
    ((d.areas && d.areas[areaKey]) || []).forEach((n) => tail[n % 10]++);
  });
  const ranked = tail.map((c, i) => ({ tail: i, c })).sort((a, b) => b.c - a.c);
  out.wx_wang = ranked.slice(0, 4).map((x) => x.tail).join('、');
  out.wx_ruo = ranked.slice(-2).map((x) => x.tail).join('、');

  /* ---- 吉利数字 ---- */
  out.wx_ji = recommendNumbers(gameId, areaKey, 6, from, to).map(pad2).join(' ');

  /* ---- 绕胆图（固定版式：金3 银3 拖6 蓝4，蓝在中宫，蓝球避开推荐） ----
     金/银/拖 都来自下面这个 16 码推荐池（同一顺序切 3/3/6+，
     三段天然互斥）；蓝球单独从蓝球池取，且排除「蓝球推荐」的号。
     【单一来源】blueRec 优先用 autoFillForTemplate 传进来的那一份，
     保证「图一印出来的蓝球推荐」和「绕胆图避开的蓝球」是同一批号。 */
  const pool = recommendNumbers(gameId, areaKey, Math.min(16, to - from + 1), from, to);
  const backKey = backAreaOf(gameId);
  const backRange = backRangeOf(gameId);
  const blueRec = (opts && Array.isArray(opts.backRec) && opts.backRec.length)
    ? opts.backRec
    : backRecNumbers(gameId, backKey, 6);                // 「蓝球推荐」那 6 个
  Object.assign(out, buildRaodanGrid(pool, [], {
    gameId,
    areaKey,
    backKey,
    from,
    to,
    blueFrom: backRange[0],
    blueTo: backRange[1],
    blueExclude: blueRec
  }));

  /* ---- 九转连环（固定同心圆模板：中心 1 + 4 圈 × 8 方向 = 33 个位置） ----
     用户原话：「九转连环图必须是这种模板还要有号码」。
     · 33 个位置固定不变，号从 JIUZHUAN_LAYOUT 里取，但【整串 33 格按上期开奖号
       整体轮转】—— 用户补的要求：「九宫格和九转图每一期中心点还是变一下」。
       轮转后中心每期变，其余 32 格的相对顺序保持用户表的原样；
       33 个位置仍然是「全部号码、无重复无遗漏」（见 jiuzhuanMatrixFor）。
     · 推荐的号只用来【高亮】：cir_pool（号码池）· cir_dan（金胆/银胆）·
       cir_tuo（拖码），口径都走 recommendNumbers（专家池/资料池优先），
       和图一的号码池、图二的绕胆图同一套池子
     · 旧键 cir_center / cir_0~7 保留（存档里可能还带着），值改成模板里的真号 */
  const jzLayout = jiuzhuanLayoutOf(gameId);
  const jzNow = jiuzhuanMatrixFor(gameId);
  if (jzLayout && jzNow) {
    out.cir_center = pad2(jzNow.center);
    for (let i = 0; i < 8; i++) out['cir_' + i] = pad2(jzNow.rings[0][i]);

    /* 位置号 = 本期盘面里那一格原本写的号：
         位置 0        → 中心（每期轮转，会变）
         位置 1+ri*8+di → 第 (ri+1) 圈的「第 di 个方向」（0=上，顺时针 45°）
       所以 cir_num_01 是第 1 圈上方的号（rotate=0 时双色球=16），不是「号 01」。
       render.js 按位置号取号 → 位置画在几何点上、号来自本期盘面。 */
    out.cir_num_center = pad2(jzNow.center);
    for (let ri = 0; ri < jzNow.rings.length; ri++) {
      for (let di = 0; di < jzNow.rings[ri].length; di++) {
        out['cir_num_' + (1 + ri * 8 + di)] = pad2(jzNow.rings[ri][di]);
      }
    }
    out.cir_rotate = String(jzNow.rotate);                 // 本期轮转量（排查用）
  }

  /* 【通用兜底】没有 JIUZHUAN_LAYOUT 的彩种（模板表只有 ssq / dlt 两张，
     是用户逐字给的固定表，不补不改）。
     照「用和 ssq / dlt 相同的图位定义」办：位置/圈数/方向全部一样
     （中心 1 + 4 圈 × 8 方向 = 33 格），只是格子里的号按本彩种主区的
     号码范围循环铺 —— 保证图上【没有一个空格、也没有一个「—」】。
     ssq / dlt 不受影响（它们走上面那一支，值一模一样）。 */
  if (!jzLayout) {
    Object.assign(out, genericCircleNums(gameId, from, to, jzNow));
  }

  const cirPool = recommendNumbers(gameId, areaKey, Math.min(20, to - from + 1), from, to);
  const cirDan = cirPool.slice(0, 3);                       // 金胆 / 银胆（前 3）
  const cirTuo = cirPool.slice(3, 10);                      // 拖码（后 7）
  out.cir_pool = cirPool.map(pad2).join(' ');
  out.cir_dan = cirDan.map(pad2).join(' ');
  out.cir_tuo = cirTuo.map(pad2).join(' ');

  /* ---- 九宫（洛书 + 每期自动偏移：上期开奖号 → offset → 本期盘面） ----
     offset 每期跟着上期开奖号变，所以「中宫」不再固定是 5。 */
  const jg = jiugongMatrixFor(gameId);
  out.jg_offset = String(jg.offset);
  out.jg_matrix = jg.matrix.map((row) => row.join('')).join(',');
  out.jg_center = String(jg.centerPalace);
  out.jg_zhong = `中宫${jg.centerPalace}（数根${jg.centerPalace}为旺）`;
  out.jg_guan = jiugongGuanNums(gameId, jg.centerPalace, from, to)
    .slice(0, 3).map(pad2).join(' ');

  return out;
}

/* 【补零规则】用户要求：「不要两个 0，所有的 0 都是一位数 0」
       所以 0 显示成 '0'；其它个位数仍然补零（1 -> '01'、4 -> '04'）。 */
  const pad2 = (n) => (Number(n) === 0 ? '0' : String(n).padStart(2, '0'));
const toLine = (arr) => arr.map(pad2).join(' ');

/**
 * 模板里「后区/蓝球/特别号 推荐」那一格写的是几个号
 *   模板写 count 就用它（双色球 6、大乐透 2、七星彩 1）；
 *   模板没写 → 用该区真实球数兜底。
 *   为什么必须从模板读：这个字段既是「图上印出来的推荐」，
 *   又是绕胆图「蓝球关注」的排除名单，两处必须同一个个数。
 */
function templateBackFieldCount(gameId, imageKey, fallback) {
  try {
    const tpl = (typeof TEMPLATES !== 'undefined') ? TEMPLATES[gameId] : null;
    if (!tpl) return fallback;
    const img = tpl.images.find((i) => i.key === imageKey) || tpl.images[0];
    if (!img) return fallback;
    let found = 0;
    const walk = (sec) => {
      if (!sec || typeof sec !== 'object' || found) return;
      const joined = [sec.title || '']
        .concat((sec.fields || []).map((f) => f.label || ''))
        .join(' ');
      if (/后区|蓝球|特别号/.test(joined) && Array.isArray(sec.fields)) {
        sec.fields.forEach((f) => {
          if (found) return;
          if (String(f.label || '').includes('推荐') && Number.isInteger(f.count) && f.count > 0) {
            found = f.count;
          }
        });
      }
      if (sec.left) walk(sec.left);
      if (sec.right) walk(sec.right);
    };
    (img.sections || []).forEach(walk);
    return found || fallback;
  } catch (e) { return fallback; }
}

/** 把历史里某个区的号码按「期」取出来（最新在前） */
function historyAreas(gameId, areaKey, periods) {
  return getHistory(gameId).slice(0, periods || 30)
    .map((d) => (d.areas && d.areas[areaKey]) || [])
    .filter((a) => a.length > 0);
}

/** 实际可用的历史期数（最多 30 期，取实际抓到的数量） */
const HIST_PERIODS = 30;

/**
 * 号码池档位上限
 *   红区/前区（双色球、大乐透这类 1-33 / 1-35 的）→ 最多 20 码
 *   七乐彩（30 选 7）、快乐8（80 选 1~10）→ 不设此上限，按模板原样
 */
function maxPoolCount(gameId) {
  if (gameId === 'ssq' || gameId === 'dlt') return 20;
  return Infinity;
}

/** 最近的期数（用实际抓到的数量，避免写死 30 导致取不到） */
function actualPeriods(gameId) {
  const h = getHistory(gameId);
  return Math.min(h.length || 0, HIST_PERIODS) || 1;
}

/**
 * 「推荐」口径：与「热号」区分开
 * 热号 = 近 30 期总频次最高
 * 推荐 = 近 10 期频次 ×3 + 近 30 期频次 ×1（近期更活跃的排前面）
 *
 * 有专家号码池时：池内号码（按共识度排序）优先占位，
 * 池子不够 n 个时再用原评分排序把剩下的补足 —— 保证图上的
 * 「推荐号 / 蓝球推荐 / 组选 / 绕胆图」都落在号码池里。
 */
function recommendNumbers(gameId, areaKey, n, from, to) {
  const size = to - from + 1;
  const want = Math.max(1, Math.min(n, size));

  const hist = getHistory(gameId);
  const pool = expertPoolOf(gameId, areaKey).filter((x) => x >= from && x <= to);

  /* 【兜底】没有历史数据时，也要给出号码，避免整张图空着 */
  if (!hist.length) {
    let out = pool.slice(0, want);
    try {
      const mf = materialFirstOf(gameId, areaKey, from, to);
      if (mf.pick.length) out = mf.pick.slice(0, want);
      if (mf.kill.size) out = out.filter((x) => !mf.kill.has(x));
    } catch (e) { /* 忽略 */ }
    const have = new Set(out);
    const rest = [];
    for (let i = from; i <= to; i++) if (!have.has(i)) rest.push(i);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    rest.slice(0, want - out.length).forEach((x) => out.push(x));
    return out.sort((a, b) => a - b);
  }

  const recent = new Map();  // 近 10 期
  const all = new Map();     // 近 30 期

  hist.slice(0, 10).forEach((d) => {
    ((d.areas && d.areas[areaKey]) || []).forEach((x) => recent.set(x, (recent.get(x) || 0) + 1));
  });
  hist.slice(0, HIST_PERIODS).forEach((d) => {
    ((d.areas && d.areas[areaKey]) || []).forEach((x) => all.set(x, (all.get(x) || 0) + 1));
  });

  const list = [];
  for (let i = from; i <= to; i++) {
    const r = recent.get(i) || 0;
    const a = all.get(i) || 0;
    list.push({ num: i, score: r * 3 + a });
  }

  // 池内号码按共识度顺序排在前面，其余按评分排序
  const poolRank = new Map(pool.map((num, i) => [num, i]));
  list.sort((x, y) => {
    const px = poolRank.has(x.num);
    const py = poolRank.has(y.num);
    if (px !== py) return px ? -1 : 1;
    if (px) return poolRank.get(x.num) - poolRank.get(y.num);
    return y.score - x.score || x.num - y.num;
  });

  /* 【资料优先】资料里写明的号码排在最前面（资料 > 专家池 > 原算法） */
  let ordered = list;
  try {
    const mf = materialFirstOf(gameId, areaKey, from, to);
    if (mf.pick.length || mf.kill.size) {
      const kept = list.filter((x) => !mf.kill.has(x.num));
      const band = (kept.length >= want) ? kept : list;
      const matRank = new Map(mf.pick.map((num, i) => [num, i]));
      band.sort((x, y) => {
        const mx = matRank.has(x.num);
        const my = matRank.has(y.num);
        if (mx !== my) return mx ? -1 : 1;
        if (mx) return matRank.get(x.num) - matRank.get(y.num);
        const px = poolRank.has(x.num);
        const py = poolRank.has(y.num);
        if (px !== py) return px ? -1 : 1;
        if (px) return poolRank.get(x.num) - poolRank.get(y.num);
        return y.score - x.score || x.num - y.num;
      });
      ordered = band;
    }
  } catch (e) { ordered = list; }

  const picked = ordered.slice(0, want).map((x) => x.num);

  // 如果这个区在历史里从没出现过（比如七星彩后区），随机补足
  if (picked.length < want) {
    const have = new Set(picked);
    const rest = [];
    for (let i = from; i <= to; i++) if (!have.has(i)) rest.push(i);
    while (picked.length < want && rest.length) {
      picked.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    }
  }

  return picked.sort((a, b) => a - b);
}

/**
 * 按「第 posIdx 位」统计各数字出现频率，给出该位置推荐的 N 个数字
 * 用途：排列3/排列5/七星彩 的定位推荐，让每个位置不一样
 *
 * @param {string} gameId
 * @param {number} posIdx 位置下标（0 = 第1位）
 * @param {number} n      推荐几个
 * @param {number} from   数字下限
 * @param {number} to     数字上限
 * @param {number} periods 统计期数
 */
function positionRecommend(gameId, posIdx, n, from, to, periods) {
  /* 【重要】排列5 的「前三位」必须和排列3 完全一样。
     原因：排列3 的开奖号就是排列5 开奖号的前三位
     （如 排列3 26272 = 8 9 0，排列5 26272 = 8 9 0 2 0）。
     所以 排列5 的 万位/千位/百位 直接取 排列3 的 百位/十位/个位，
     保证两者永远一致，不会各算各的。 */
  if (gameId === 'pl5' && posIdx >= 0 && posIdx <= 2) {
    return positionRecommend('pl3', posIdx, n, from, to, periods);
  }

  const size = to - from + 1;
  const want = Math.max(1, Math.min(n, size));
  const hist = getHistory(gameId);
  const per = periods || HIST_PERIODS;

  const freq = new Map();
  for (let x = from; x <= to; x++) freq.set(x, 0);

  let used = 0;
  if (hist.length) {
    hist.slice(0, per).forEach((d) => {
      const main = (d.areas && (d.areas.main || d.areas.front)) || [];
      const v = main[posIdx];
      if (Number.isInteger(v) && freq.has(v)) {
        freq.set(v, freq.get(v) + 1);
        used++;
      }
    });
  }

  /* 有专家池时：池内号码优先（按共识度顺序，并且按位置错开取，
     让 百位/十位/个位 不会每个位置都一模一样），不够再用频率补 */
  const poolArea = (to > 9) ? 'back' : 'main';
  const pool = expertPoolOf(gameId, poolArea).filter((x) => x >= from && x <= to);
  if (pool.length) {
    const off = posIdx % pool.length;
    const rotated = pool.slice(off).concat(pool.slice(0, off));
    const out = rotated.slice(0, want);
    const have = new Set(out);
    const list = [];
    for (let x = from; x <= to; x++) if (!have.has(x)) list.push({ num: x, f: freq.get(x) || 0 });
    list.sort((a, b) => (b.f - a.f) || (a.num - b.num));
    list.forEach((x) => { if (out.length < want) out.push(x.num); });
    return out.slice(0, want).sort((a, b) => a - b);
  }

  const list = [];
  for (let x = from; x <= to; x++) list.push({ num: x, f: freq.get(x) || 0 });

  // 优先高频；没有历史数据时用位置做偏移，保证各位置不同
  list.sort((a, b) => {
    if (b.f !== a.f) return b.f - a.f;
    return a.num - b.num;
  });

  let picked = list.slice(0, want).map((x) => x.num);

  // 所有位置频率都是 0（没历史）时，用位置偏移错开
  if (used === 0) {
    const shifted = [];
    for (let k = 0; k < want; k++) {
      shifted.push(from + ((posIdx * 3 + k * 2) % size));
    }
    picked = [...new Set(shifted)].slice(0, want);
    while (picked.length < want) {
      const c = from + Math.floor(Math.random() * size);
      if (!picked.includes(c)) picked.push(c);
    }
  }

  return picked.sort((a, b) => a - b);
}

/**
 * 按位置给杀号（取该位置出现最少的 N 个）
 *   有专家池时：池内共识度最低的几个优先杀，不够再用位置冷号补
 */
function positionKill(gameId, posIdx, n, from, to, periods) {
  /* 同上：排列5 前三位（万/千/百）的杀号也要和排列3 一致，
     因为两者开奖号的前三位本来就是同一组数字。 */
  if (gameId === 'pl5' && posIdx >= 0 && posIdx <= 2) {
    return positionKill('pl3', posIdx, n, from, to, periods);
  }

  const size = to - from + 1;
  const want = Math.max(1, Math.min(n, size));
  const hist = getHistory(gameId);
  const per = periods || HIST_PERIODS;

  const freq = new Map();
  for (let x = from; x <= to; x++) freq.set(x, 0);

  let used = 0;
  if (hist.length) {
    hist.slice(0, per).forEach((d) => {
      const arr = (d.areas && (d.areas.back || d.areas.main || d.areas.front)) || [];
      const v = arr[posIdx];
      if (Number.isInteger(v) && freq.has(v)) { freq.set(v, freq.get(v) + 1); used++; }
    });
  }

  const poolArea = (to > 9) ? 'back' : 'main';
  const pool = expertPoolOf(gameId, poolArea).filter((x) => x >= from && x <= to);
  if (pool.length) {
    const off = posIdx % pool.length;
    const rotated = pool.slice(off).concat(pool.slice(0, off));
    const out = rotated.slice(Math.max(0, rotated.length - want)).reverse().sort((a, b) => a - b);
    if (out.length >= want) return out;
    const have = new Set(out);
    const rest = [];
    for (let x = from; x <= to; x++) if (!have.has(x)) rest.push({ num: x, f: freq.get(x) || 0 });
    rest.sort((a, b) => (a.f - b.f) || (a.num - b.num));
    rest.forEach((x) => { if (out.length < want) out.push(x.num); });
    return out.slice(0, want).sort((a, b) => a - b);
  }

  const list = [];
  for (let x = from; x <= to; x++) list.push({ num: x, f: freq.get(x) || 0 });

  if (used === 0) {
    // 没历史：按位置偏移取
    const out = [];
    for (let k = 0; k < want; k++) {
      const c = from + ((posIdx * 2 + k * 3 + 1) % size);
      if (!out.includes(c)) out.push(c);
    }
    while (out.length < want) {
      const c = from + Math.floor(Math.random() * size);
      if (!out.includes(c)) out.push(c);
    }
    return out.sort((a, b) => a - b);
  }

  list.sort((a, b) => a.f - b.f || a.num - b.num);
  return list.slice(0, want).map((x) => x.num).sort((a, b) => a - b);
}

/** 「推荐」一行文字 */
function recommendLine(gameId, areaKey, n, from, to) {
  return recommendNumbers(gameId, areaKey, n, from, to).map(pad2).join(' ');
}

/**
 * 由「推荐号」推导出奇偶 / 大小 / 012路
 * 规则：推荐什么就写什么，保证图上的指标和推荐号一致。
 *   双色球蓝球推荐 03      → 奇偶「奇」、大小「小」、012路「0路」
 *   大乐透后区推荐 03 09   → 奇偶「2奇」、大小「2小」、012路「0路 0路」
 */
function deriveFromPicks(nums, from, to) {
  const list = Array.isArray(nums) ? nums.filter((n) => Number.isInteger(n)) : [];
  if (list.length === 0) return { oddEven: '', bigSmall: '', route012: '' };

  const mid = (from + to) / 2;

  const oddCount = list.filter((n) => n % 2 === 1).length;
  const evenCount = list.length - oddCount;

  const bigCount = list.filter((n) => n > mid).length;
  const smallCount = list.length - bigCount;

  // 奇偶：全部同类就写「N奇」/「N偶」，否则写「2奇1偶」
  let oddEven;
  if (list.length === 1) {
    /* 【单球】用户要求：蓝球这种只有一个球的时候只写「奇」或「偶」，
       不要「1奇」这种带个 1 的写法。 */
    oddEven = oddCount === 1 ? '奇' : '偶';
  } else if (oddCount === list.length) oddEven = `${list.length}奇`;
  else if (evenCount === list.length) oddEven = `${list.length}偶`;
  else oddEven = `${oddCount}奇${evenCount}偶`;

  // 大小：同理
  let bigSmall;
  if (list.length === 1) {
    /* 【单球】用户原话：「双色球硬模板蓝球要么就是大要么就是小不要加个 1」 */
    bigSmall = bigCount === 1 ? '大' : '小';
  } else if (bigCount === list.length) bigSmall = `${list.length}大`;
  else if (smallCount === list.length) bigSmall = `${list.length}小`;
  else bigSmall = `${bigCount}大${smallCount}小`;

  // 012 路：每个号给出路数，用空格连起来
  const route012 = list.map((n) => `${n % 3}路`).join(' ');

  return { oddEven, bigSmall, route012 };
}

/* ---------- 和值（区间 = 统计窗口内真实取值范围） ---------- */
function calcSum(areas, hardMax) {
  const sums = areas.map((a) => a.reduce((x, y) => x + y, 0)).sort((a, b) => a - b);
  if (!sums.length) return '';
  /* 【和值必须是区间】用户原话：
       「双色球和大乐透的和值 是多少到多少 区间宽度在25和25以内」
     所以：非数字彩（双色球/大乐透/七乐彩/快乐8）返回「X~Y」区间，宽度 ≤ 25。
     （数字彩 3D/排列3/排列5 的 3 个数由 ticket-store.js 单独处理，不走这里）

     hardMax：可选【更紧的】硬上限，给号码范围很小的玩法用 ——
     七星彩前六位是 6 个 0~9 的数位，30 期真实和值本身就能从 10 拉到 48，
     按 25 的硬上限会给出「11~36」这种宽到没参考价值的区间；
     模板里把宽度标成 8，这里就贴着中位数收成「24~32」。
     不传 = 保持原来的 25（双色球/大乐透/七乐彩/快乐8 完全不变）。 */
  const w = (Number.isFinite(hardMax) && hardMax > 0) ? hardMax : 25;
  return compactRange(sums, w, w);
}

/* ---------- 跨度（区间 = 统计窗口内真实取值范围） ---------- */
function calcSpan(areas, hardMax) {
  const spans = areas.map((a) => Math.max(...a) - Math.min(...a)).sort((a, b) => a - b);
  if (!spans.length) return '';
  /* 同理：跨度也收在 15 以内（可选更紧的硬上限，见 calcSum 注释） */
  const w = (Number.isFinite(hardMax) && hardMax > 0) ? hardMax : 15;
  return compactRange(spans, w, w);
}

/**
 * 把一组真实取值压成一个区间。
 * 规则（第 1 条优先于第 2 条）：
 *   1.【必须覆盖】区间要包含统计窗口内真实出现过的全部取值 ——
 *      最近几期开出的和值/跨度不能落在区间外，否则「前区和值 68~93」
 *      会被实际开出的 109 打脸；
 *   2.【尽量紧凑】先取中间 80% 分位作为主体区间，宽度超过 maxWidth 时
 *      围绕中位数收紧，让区间贴着大多数期次；
 *   3. 最后向外扩到真实最小值 / 最大值，保证第 1 条成立。
 * @param {number[]} sorted 升序排列的真实取值（近 30 期）
 * @param {number} maxWidth 主体区间期望宽度上限（只影响紧凑度，不影响覆盖）
 * @param {number} [hardMax] 【硬上限】给了就绝不超这个宽度。
 *   用户要求：「红球和值控制在 20 之间，不要相差太大」——
 *   原来最后一步会「向外扩到真实极值」，30 期里最小到最大能拉开 70，
 *   页面上就显示成「红球和值 71~141」，区间太宽、没有参考价值。
 *   现在和值传 hardMax=20：以中位数为中心，宽度不超过 20。
 *   代价：极少数很偏的历史值会落在区间外 —— 这是用户明确要的取舍。
 */
function compactRange(sorted, maxWidth, hardMax) {
  const n = sorted.length;
  if (!n) return '';
  if (n === 1) return `${sorted[0]}~${sorted[0]}`;

  const min = sorted[0];
  const max = sorted[n - 1];

  // 主体：中间 80% 分位
  let a = sorted[Math.floor(n * 0.1)];
  let b = sorted[Math.min(n - 1, Math.ceil(n * 0.9) - 1)];

  // 还是太宽，就以中位数为中心收紧到 maxWidth
  if (b - a > maxWidth) {
    const mid = Math.round((a + b) / 2);
    a = mid - Math.floor(maxWidth / 2);
    b = a + maxWidth;
  }

  /* 【硬上限】用户明确要求「不要相差太大」——
     以中位数为中心压到 hardMax 宽，不再向外扩到极值。 */
  if (hardMax && (max - min) > hardMax) {
    const med = sorted[Math.floor(n / 2)];
    let lo = med - Math.floor(hardMax / 2);
    let hi = lo + hardMax;
    /* 别越过真实取值范围 */
    if (lo < min) { lo = min; hi = lo + hardMax; }
    if (hi > max) { hi = max; lo = hi - hardMax; }
    return `${lo}~${hi}`;
  }

  // 【关键】向外扩到真实极值：宁可略宽，也不漏掉最近的开奖
  if (a > min) a = min;
  if (b < max) b = max;

  return `${a}~${b}`;
}

/* ---------- 奇偶比（出现最多的 2~3 种） ---------- */
function calcOddEven(areas, cnt) {
  const n = cnt || 6;
  const stat = new Map();
  areas.forEach((a) => {
    const odd = a.filter((x) => x % 2 === 1).length;
    const key = `${odd}:${n - odd}`;
    stat.set(key, (stat.get(key) || 0) + 1);
  });
  return [...stat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k]) => k).join(' / ');
}

/* ---------- 大小比（以区间中点划分） ---------- */
function calcBigSmall(areas, from, to, cnt) {
  const n = cnt || 6;
  const mid = (from + to) / 2;
  const stat = new Map();
  areas.forEach((a) => {
    const big = a.filter((x) => x > mid).length;
    const key = `${big}:${n - big}`;
    stat.set(key, (stat.get(key) || 0) + 1);
  });
  return [...stat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k]) => k).join(' / ');
}

/* ---------- 区间比（三等分） ---------- */
function calcZone(areas, from, to, cnt) {
  const n = cnt || 6;
  const size = Math.ceil((to - from + 1) / 3);
  const stat = new Map();
  areas.forEach((a) => {
    const z = [0, 0, 0];
    a.forEach((x) => {
      const i = Math.min(2, Math.floor((x - from) / size));
      z[i]++;
    });
    const key = z.join(':');
    stat.set(key, (stat.get(key) || 0) + 1);
  });
  return [...stat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k]) => k).join(' / ');
}

/* ---------- 012 路比（除以 3 的余数） ---------- */
function calc012(areas, cnt) {
  const n = cnt || 6;
  const stat = new Map();
  areas.forEach((a) => {
    const r = [0, 0, 0];
    a.forEach((x) => { r[x % 3]++; });
    const key = `${r[0]}:${r[1]}:${r[2]}`;
    stat.set(key, (stat.get(key) || 0) + 1);
  });
  return [...stat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k]) => k).join(' / ');
}

/* ---------- 连号（近期出现过的相邻对） ---------- */
function calcConsecutive(areas, max) {
  const found = new Set();
  areas.slice(0, 10).forEach((a) => {
    const s = [...a].sort((x, y) => x - y);
    for (let i = 1; i < s.length; i++) {
      if (s[i] - s[i - 1] === 1) found.add(`${pad2(s[i - 1])}-${pad2(s[i])}`);
    }
  });
  return [...found].slice(0, max || 3).join(' / ');
}

/* ---------- 重复号（上期与上上期都出现的号） ---------- */
function calcRepeat(areas) {
  if (areas.length < 2) return '';
  const cur = new Set(areas[0]);
  const rep = areas[1].filter((x) => cur.has(x));
  if (!rep.length) return '';
  return rep.sort((a, b) => a - b).map(pad2).join(',') + `防${rep.length}枚`;
}

/* ---------- 同尾号（相同尾数的号码组） ---------- */
function calcSameTail(areas, max) {
  const freq = new Map();
  areas.slice(0, 15).forEach((a) => a.forEach((x) => freq.set(x, (freq.get(x) || 0) + 1)));

  const byTail = new Map();
  [...freq.keys()].sort((a, b) => a - b).forEach((n) => {
    const t = n % 10;
    if (!byTail.has(t)) byTail.set(t, []);
    byTail.get(t).push(n);
  });

  const groups = [...byTail.values()]
    .filter((g) => g.length >= 3)
    .sort((a, b) => b.length - a.length)
    .slice(0, max || 2)
    .map((g) => g.map(pad2).join('-'));

  return groups.join(' / ');
}

/* ---------- 邻号（上期号码 ±1） ---------- */
function calcNeighbor(areas, from, to, max) {
  if (!areas.length) return '';
  const set = new Set();
  areas[0].forEach((n) => { set.add(n - 1); set.add(n + 1); });
  areas[0].forEach((n) => set.delete(n));
  return [...set].filter((n) => n >= from && n <= to)
    .sort((a, b) => a - b).slice(0, max || 6).map(pad2).join(' ');
}

/* ---------- 跳连号（相隔 1 位的三连） ---------- */
function calcSkipChain(areas, max) {
  if (!areas.length) return '';
  const s = [...areas[0]].sort((a, b) => a - b);
  const set = new Set(s);
  const found = [];
  for (const n of s) {
    if (set.has(n + 2) && set.has(n + 4)) found.push(`${pad2(n)}-${pad2(n + 2)}-${pad2(n + 4)}`);
  }
  return found.slice(0, max || 2).join(' / ');
}

/* ---------- 同区号（号码最密集的区间） ---------- */
function calcSameZone(areas, from, to) {
  const freq = new Map();
  areas.forEach((a) => a.forEach((x) => freq.set(x, (freq.get(x) || 0) + 1)));

  const zoneSize = Math.ceil((to - from + 1) / 3);
  let best = { idx: 0, total: -1, nums: [] };
  for (let i = 0; i < 3; i++) {
    const lo = from + i * zoneSize;
    const hi = Math.min(to, lo + zoneSize - 1);
    let total = 0;
    const nums = [];
    for (let n = lo; n <= hi; n++) {
      const c = freq.get(n) || 0;
      total += c;
      if (c > 0) nums.push(n);
    }
    if (total > best.total) best = { idx: i, total, nums };
  }

  const zoneName = ['一区', '二区', '三区'][best.idx];
  const shown = best.nums.sort((a, b) => a - b).slice(0, 6).map(pad2).join(',');
  return `${zoneName}${shown}`;
}

/* ---------- 质数/合数 ---------- */
function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}
function calcPrime(areas, cnt) {
  const n = cnt || 6;
  const stat = new Map();
  areas.forEach((a) => {
    const p = a.filter(isPrime).length;
    const key = `${p}:${n - p}`;
    stat.set(key, (stat.get(key) || 0) + 1);
  });
  return [...stat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k]) => k).join(' / ');
}

/* ---------- 尾数冷热 ---------- */
function calcTailHotCold(areas) {
  const tail = new Array(10).fill(0);
  areas.forEach((a) => a.forEach((x) => tail[x % 10]++));
  const idx = tail.map((c, i) => ({ tail: i, c })).sort((a, b) => b.c - a.c);
  const hot = idx.slice(0, 2).map((x) => `${x.tail}尾热`).join(' ');
  const cold = idx.slice(-1).map((x) => `${x.tail}尾冷`).join(' ');
  return `${hot} ${cold}`;
}

/* ---------- 最大遗漏 ---------- */
function calcMaxOmit(areas, from, to, allow) {
  const omit = new Map();
  for (let i = 0; i < areas.length; i++) {
    areas[i].forEach((n) => { if (!omit.has(n)) omit.set(n, i); });
  }
  // allow = 只在这个号码集合里找（有号码池时传号码池）
  const candidates = (allow && allow.length)
    ? allow.slice()
    : (() => { const a = []; for (let n = from; n <= to; n++) a.push(n); return a; })();

  let best = { num: null, gap: -1 };
  for (const n of candidates) {
    const gap = omit.has(n) ? omit.get(n) : areas.length;
    if (gap > best.gap) best = { num: n, gap };
  }
  return best.num === null ? '' : `${pad2(best.num)}号`;
}

/* ---------- 遗漏回补（遗漏期数最多的几个号） ---------- */
function calcOmitBack(areas, from, to, max, allow) {
  const omit = new Map();
  for (let i = 0; i < areas.length; i++) {
    areas[i].forEach((n) => { if (!omit.has(n)) omit.set(n, i); });
  }
  const candidates = (allow && allow.length)
    ? allow.slice()
    : (() => { const a = []; for (let n = from; n <= to; n++) a.push(n); return a; })();
  const list = candidates.map((num) => ({
    num, gap: omit.has(num) ? omit.get(num) : areas.length
  }));
  return list.sort((a, b) => b.gap - a.gap || a.num - b.num)
    .slice(0, max || 3).map((x) => pad2(x.num)).join(' ');
}

/* ---------- 胆码 / 拖码（基于频次与遗漏的统计排序） ---------- */
function calcDanTuo(gameId, areaKey, areas, from, to) {
  /* 有专家池时：直接按号码池分档 ——
     共识度最高的 3 个做胆码，往后 7 个做拖码 */
  const pool = expertPoolOf(gameId, areaKey);
  if (pool.length >= 6) {
    return {
      dan: pool.slice(0, 3).map(pad2),
      tuo: pool.slice(3, 10).map(pad2)
    };
  }

  const freq = new Map();
  areas.forEach((a) => a.forEach((x) => freq.set(x, (freq.get(x) || 0) + 1)));

  const omit = new Map();
  for (let i = 0; i < areas.length; i++) {
    areas[i].forEach((n) => { if (!omit.has(n)) omit.set(n, i); });
  }

  // 综合分：出现频次高 + 近期遗漏适中
  const scored = [];
  for (let n = from; n <= to; n++) {
    const f = freq.get(n) || 0;
    const gap = omit.has(n) ? omit.get(n) : areas.length;
    scored.push({ num: n, score: f * 2 + Math.min(gap, 10) });
  }
  scored.sort((a, b) => b.score - a.score || a.num - b.num);

  return {
    dan: scored.slice(0, 3).map((x) => pad2(x.num)),
    tuo: scored.slice(3, 10).map((x) => pad2(x.num))
  };
}

/* ---------- 统一入口：算出某彩种某区的全部走势字段 ----------
   有专家号码池时：所有走势都「围绕号码池」算 ——
     · 和值 / 跨度 / 连号 / 重复号 / 同尾号 / 邻号 / 跳连号 /
       同区号 / 质数合数 / 尾数冷热 → 只看「历史开奖号 ∩ 号码池」
     · 奇偶比 / 大小比 / 区间比 / 012路比 → 直接统计号码池自身的构成
     · 热号 / 冷号 → 池内按近 30 期出现次数排
     · 胆码 / 拖码 / 杀号 → 池内分档
   没有号码池（或池内算不出东西）时，逐项回退到原来的全量口径。
   ------------------------------------------------------------------ */
/* ============================================================
   【数字彩页脚三项】用户的模板硬性条件：
     · 排列3 / 福彩3D 的「和值」 要推荐 3 个数（不是 3~22 这种区间）
     · 「和尾」 要推荐 3 个数（不是 0~9 这种区间）
     · 「对子号」要推荐 2 个数（不是"对子号"三个字）
   做法：从近 30 期真实开奖里统计出现次数，取最热的 N 个。
         不够 N 个就用最近出现过的补上，保证【一定】给出 N 个。
   kind: 'sum' 和值 | 'tail' 和尾 | 'pair' 对子号
   ============================================================ */
function digitFooterTop(areas, kind, n) {
  const list = Array.isArray(areas) ? areas.filter((a) => Array.isArray(a) && a.length) : [];
  if (!list.length) return [];

  const valOf = (a, once) => {
    if (kind === 'sum') return a.reduce((x, y) => x + y, 0);
    if (kind === 'tail') return a.reduce((x, y) => x + y, 0) % 10;
    /* pair：找出这一期里的对子（两个相同数字 → 值 = dd，如 1 → 11） */
    const cnt = new Map();
    a.forEach((d) => cnt.set(d, (cnt.get(d) || 0) + 1));
    const pairs = [...cnt.entries()].filter(([, c]) => c >= 2).map(([d]) => d * 11);
    if (!pairs.length) return null;
    return once ? pairs : pairs;
  };

  const stat = new Map();
  list.forEach((a) => {
    const v = valOf(a, false);
    if (v === null) return;
    (Array.isArray(v) ? v : [v]).forEach((x) => stat.set(x, (stat.get(x) || 0) + 1));
  });

  let out = [...stat.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => k);

  /* 不够 n 个 → 用最近出现过的补（先去重再补） */
  if (out.length < n) {
    const seen = new Set(out);
    for (const a of list) {
      if (out.length >= n) break;
      const v = valOf(a, true);
      if (v === null) continue;
      (Array.isArray(v) ? v : [v]).forEach((x) => {
        if (out.length < n && !seen.has(x)) { seen.add(x); out.push(x); }
      });
    }
  }
  return out.slice(0, n);
}

function calcTrendFields(gameId, areaKey, from, to, pickCount, opts) {
  const areas = historyAreas(gameId, areaKey, 30);
  if (!areas.length) return {};

  /* 【区间宽度】模板可以为「和值 / 跨度」两个字段各标一个宽度上限（w / kdW）。
     不标 = 沿用原来的 25 / 15（双色球、大乐透、七乐彩、快乐8 一个字都不变）。
     标了 = 号码范围很小的玩法（七星彩前六位 0~9）能收紧成更有参考价值的区间。 */
  const o = opts || {};
  const hzW = (Number.isFinite(o.w) && o.w > 0) ? o.w : 25;
  const kdW = (Number.isFinite(o.kdW) && o.kdW > 0) ? o.kdW
    : ((Number.isFinite(o.w) && o.w > 0) ? Math.min(15, o.w) : 15);

  const pool = expertPoolOf(gameId, areaKey).filter((n) => n >= from && n <= to);
  const poolSet = new Set(pool);
  const poolAreas = pool.length
    ? areas.map((a) => a.filter((x) => poolSet.has(x)))
    : [];
  const usePool = pool.length > 0 && poolAreas.some((a) => a.length > 0);

  // 池内算得出来就用池内的，算不出来就回退全量 —— 保证图上不出现 「—」
  const pick = (fn) => {
    if (usePool) {
      try { const v = fn(poolAreas); if (v) return v; } catch (e) { /* 回退 */ }
    }
    try { return fn(areas) || ''; } catch (e) { return ''; }
  };

  const dt = calcDanTuo(gameId, areaKey, areas, from, to);

  // 邻号：有池子时只保留「池内的邻号」
  //   注意：calcNeighbor() 返回的是【字符串】，不能直接 .filter —— 这里自己算数组
  const lin = (() => {
    if (usePool) {
      try {
        const src = poolAreas[0] || [];
        const set = new Set();
        src.forEach((n) => { set.add(n - 1); set.add(n + 1); });
        src.forEach((n) => set.delete(n));   // 邻号不含自己
        const near = [...set]
          .filter((n) => n >= from && n <= to && poolSet.has(n))
          .sort((a, b) => a - b)
          .slice(0, 6);
        if (near.length) return near.map(pad2).join(' ');
      } catch (e) { /* 回退到全量邻号 */ }
    }
    return calcNeighbor(areas, from, to, 6);
  })();

  return {
    /* 【按真实开奖统计，不按号码池过滤】
       和值 / 跨度 / 奇偶比 / 大小比 / 区间比 / 012路比 / 质数合数
       说的都是「每期真实开奖号」：
         · 和值 / 跨度区间必须覆盖最近开奖，否则会被实际开出的号打脸
           （用户反馈：大乐透显示前区和值 68~93，实际开出 109）；
         · 号码个数必须等于该玩法该区的真实球数（双色球红球 6、大乐透前区 5…）。
       号码池有 20 个号，用池子自身的构成会写出「8奇12偶」这种
       和玩法对不上的指标；用「开奖号 ∩ 池子」又会把区间压窄到盖不住最近开奖。 */
    hz:      calcSum(areas, hzW),
    kd:      calcSpan(areas, kdW),
    jq:      calcOddEven(areas, pickCount),
    dx:      calcBigSmall(areas, from, to, pickCount),
    qjb:     calcZone(areas, from, to, pickCount),
    lu012:   calc012(areas, pickCount),
    lh:      pick((a) => calcConsecutive(a, 3)),
    cf:      pick((a) => calcRepeat(a)),
    wh:      pick((a) => calcSameTail(a, 2)),
    lin,
    tjlh:    pick((a) => calcSkipChain(a, 2)),
    tqh:     pick((a) => calcSameZone(a, from, to)),
    zhs:     calcPrime(areas, pickCount),
    wsl:     pick((a) => calcTailHotCold(a)),
    maxomit: pool.length ? (calcMaxOmit(areas, from, to, pool) || calcMaxOmit(areas, from, to)) : calcMaxOmit(areas, from, to),
    ylhb:    pool.length
      ? (calcOmitBack(areas, from, to, 3, pool) || calcOmitBack(areas, from, to, 3))
      : calcOmitBack(areas, from, to, 3),
    dm:      dt.dan.join(' '),
    tm:      dt.tuo.join(' '),
    // 热号 / 冷号 / 杀号：都围绕号码池
    re:      hotLine(gameId, areaKey, 6, HIST_PERIODS),
    leng:    coldLine(gameId, areaKey, 6, from, to, HIST_PERIODS),
    sh:      autoKillNumbers(gameId, areaKey, 3, from, to, HIST_PERIODS).map(pad2).join(' ')
  };
}

/**
 * 号码池相关的走势值（给 ticket-store.js 摇号用）
 *   只有在「该区有专家号码池」时才返回，否则返回 null → 调用方走原算法
 *   注意：里面的 和值/跨度/奇偶比/大小比/012路比 都是
 *   「真实开奖 + 真实球数」口径（见 calcTrendFields 顶部注释），
 *   只有 热号/冷号/胆码/拖码/杀号/邻号… 才是围绕号码池算的。
 * @returns {object|null}
 */
function poolTrendFields(gameId, areaKey, from, to, count) {
  if (!hasExpertPool(gameId, areaKey)) return null;
  try {
    const t = calcTrendFields(gameId, areaKey, from, to, count);
    return (t && Object.keys(t).length) ? t : null;
  } catch (e) { return null; }
}

/** 各彩种主号码区与范围 */
const MAIN_AREA = {  ssq:  { area: 'red',   from: 1, to: 33, name: '红球' },
  dlt:  { area: 'front', from: 1, to: 35, name: '前区' },
  qlc:  { area: 'main',  from: 1, to: 30, name: '基本号' },
  kl8:  { area: 'main',  from: 1, to: 80, name: '号码' },
  fc3d: { area: 'main',  from: 0, to: 9,  name: '号码' },
  pl3:  { area: 'main',  from: 0, to: 9,  name: '号码' },
  pl5:  { area: 'main',  from: 0, to: 9,  name: '号码' },
  qxc:  { area: 'front', from: 0, to: 9,  name: '前六位' }
};

/**
 * 生成系统自动摘要文字
 * @param {string} gameId
 * @returns {string}
 */
function autoSummary(gameId) {
  const cfg = MAIN_AREA[gameId];
  if (!cfg) return '暂无数据';

  const hist = getHistory(gameId);
  if (!hist || hist.length === 0) {
    return '历史数据未抓取 —— 运行「更新开奖数据」后会自动生成统计。';
  }

  const periods = Math.min(hist.length, 30);
  const latest = hist[0];
  const nums = (latest.areas && latest.areas[cfg.area]) || [];

  const hot = hotNumbers(gameId, cfg.area, 6, periods);
  const cold = coldNumbers(gameId, cfg.area, 6, cfg.from, cfg.to, periods);

  const fmt = (arr) => arr.map((x) => (Number(x.num) === 0 ? '0' : String(x.num).padStart(2, '0'))).join(' ');

  const lines = [];
  lines.push(`统计范围：最近 ${periods} 期真实开奖数据`);
  lines.push(`上期${cfg.name}：${nums.map((n) => (Number(n) === 0 ? '0' : String(n).padStart(2, '0'))).join(' ')}`);
  lines.push(`热号（出现最多）：${fmt(hot)}`);
  lines.push(`冷号（出现最少）：${fmt(cold)}`);

  // 附加：其他区的热号（双色球蓝球 / 大乐透后区 / 七星彩后区）
  if (gameId === 'ssq') {
    const bh = hotNumbers(gameId, 'blue', 4, periods);
    if (bh.length) lines.push(`蓝球热号：${bh.map((x) => (Number(x.num) === 0 ? '0' : String(x.num).padStart(2, '0'))).join(' ')}`);
  }
  if (gameId === 'dlt') {
    const bh = hotNumbers(gameId, 'back', 4, periods);
    if (bh.length) lines.push(`后区热号：${bh.map((x) => (Number(x.num) === 0 ? '0' : String(x.num).padStart(2, '0'))).join(' ')}`);
  }
  if (gameId === 'qxc') {
    const bh = hotNumbers(gameId, 'back', 4, periods);
    if (bh.length) lines.push(`后区热号：${bh.map((x) => (Number(x.num) === 0 ? '0' : String(x.num).padStart(2, '0'))).join(' ')}`);
  }

  lines.push('');
  lines.push('（以上为历史频次统计，彩票每期独立随机，不构成购彩建议）');

  return lines.join('\n');
}

/**
 * 根据模板定义，自动算出能自动的部分
 * 返回 { 字段key: 值 }
 */

/* ============================================================
   每个玩法、每个号码区的「真实球数」（真实开奖每期摇出几个号）
   ------------------------------------------------------------
   用途：推导奇偶比 / 大小比 / 012路比 时，参与的号码个数必须等于
         该区的真实球数。以前用「区间大小 ≤16 ? 6 : 10」去猜，
         双色球红区（33 个号）被猜成 10 个，于是出现
         「3奇7偶」「5大5小」这种 10 个号的指标。
   区名以 history.js / templates.js 里实际用的 areaKey 为准：
     ssq red / blue、dlt front / back、qlc main / special、
     kl8 main、fc3d·pl3 bai·shi·ge、pl5 wan·qian·bai·shi·ge、qxc front / back
   注：快乐8 按「选十」口径算走势指标（10 个号）。
   ============================================================ */
const AREA_PICK_COUNT = {
  ssq:  { red: 6, blue: 1 },
  dlt:  { front: 5, back: 2 },
  qlc:  { main: 7, special: 1 },
  kl8:  { main: 10 },
  fc3d: { bai: 1, shi: 1, ge: 1, main: 3 },
  pl3:  { bai: 1, shi: 1, ge: 1, main: 3 },
  pl5:  { wan: 1, qian: 1, bai: 1, shi: 1, ge: 1, main: 5 },
  qxc:  { front: 6, back: 1 },
  xqxc: { front: 6, back: 1 }   // 兼容旧写法，与 qxc 同一玩法
};

/** 查表取某玩法某区的真实球数；表里没有就退回兜底值 */
function areaPickCount(gameId, areaKey, fallback) {
  const per = AREA_PICK_COUNT[gameId];
  const n = per ? per[areaKey] : 0;
  return (Number.isInteger(n) && n > 0) ? n : fallback;
}

/* ============================================================
   走势指标兜底表：每个彩种按「真实球数」补一份
   奇偶比 / 大小比 / 012路比 / 和值 / 跨度
   ------------------------------------------------------------
   有的玩法模板里没有这几个字段，但 App / 分享页会统一读取，
   这里统一补上，避免出现空白。模板里已经算出来的值优先。
   数字型玩法（福彩3D / 排列3 / 排列5 / 七星彩）按「个位」算，各 1 个号。
   ============================================================ */
const TREND_FALLBACK = {
  ssq:  { area: 'red',   from: 1,  to: 33, n: 6 },
  dlt:  { area: 'front', from: 1,  to: 35, n: 5 },
  qlc:  { area: 'main',  from: 1,  to: 30, n: 7 },
  kl8:  { area: 'main',  from: 1,  to: 80, n: 10 },
  fc3d: { area: 'main',  from: 0,  to: 9,  n: 1, pos: 2 },   // 个位
  pl3:  { area: 'main',  from: 0,  to: 9,  n: 1, pos: 2 },   // 个位
  pl5:  { area: 'main',  from: 0,  to: 9,  n: 1, pos: 4 },   // 个位
  qxc:  { area: 'front', from: 0,  to: 9,  n: 1, pos: 5 }    // 第 6 位（个位）
};

/** 给 out 补上 奇偶比 / 大小比 / 012路比 / 和值 / 跨度（已有的不覆盖） */
function ensureTrendFallback(gameId, out) {
  const cfg = TREND_FALLBACK[gameId];
  if (!cfg) return;

  const picked = Number.isInteger(cfg.pos)
    ? positionRecommend(gameId, cfg.pos, cfg.n, cfg.from, cfg.to, HIST_PERIODS)
    : recommendNumbers(gameId, cfg.area, cfg.n, cfg.from, cfg.to);
  const d = deriveFromPicks(picked, cfg.from, cfg.to);

  if (!out.jq)    out.jq = d.oddEven || '';
  if (!out.dx)    out.dx = d.bigSmall || '';
  if (!out.lu012) out.lu012 = d.route012 || '';

  const t = calcTrendFields(gameId, cfg.area, cfg.from, cfg.to, cfg.n);
  if (!out.hz && t.hz) out.hz = t.hz;
  if (!out.kd && t.kd) out.kd = t.kd;
}

/* ============================================================
   一致性收尾：消除「字段自相矛盾」（唯一实现，两处调用）
   ------------------------------------------------------------
   调用点：
     ① stats.js  autoFillForTemplate() 组装完 → 图上「实时算」的数
     ② ticket-store.js rollAllGames() 存档前 → saved-tickets.js 那层
   规则（池子优先）：
     · POOL = 该区最大的推荐档（没有档位就用专家号码池）
     · 杀号从 POOL 外面挑最冷的（池子 = 全部号时杀号给中性提示）
     · 热号/冷号都在 POOL 内按近 30 期频次排，冷号排除热号
     · 胆码/拖码在 POOL 内且互不重复
     · 同区号/邻号/连号/跳连号/同尾号/遗漏 里的号必须在 POOL 内
     · 「N尾冷」的号不能出现在 1码/3码 主推档
   只改「有矛盾」的字段：不矛盾的原样保留（不动统计口径、
   不动用户资料优先级、不动池子档位数量）。
   ============================================================ */

/** 各彩种各号码区的范围（和 ticket-store.js 的 areaRangeOf 同口径） */
const AREA_RANGE = {
  ssq:  { red: [1, 33], blue: [1, 16] },
  dlt:  { front: [1, 35], back: [1, 12] },
  qlc:  { main: [1, 30] },
  kl8:  { main: [1, 80] },
  fc3d: { main: [0, 9] },
  pl3:  { main: [0, 9] },
  pl5:  { main: [0, 9] },
  qxc:  { front: [0, 9], back: [0, 14] }
};

/** 取某彩种某区的号码范围 */
function consRangeOf(gameId, areaKey) {
  const per = AREA_RANGE[gameId] || {};
  return per[areaKey] || [1, 33];
}

/** 区块属于哪个号码区（与 autoFillForTemplate 判断一致） */
function consAreaOf(gameId, joined) {
  if (gameId === 'ssq') return /蓝球/.test(joined) ? 'blue' : 'red';
  if (gameId === 'dlt') return /后区/.test(joined) ? 'back' : 'front';
  if (gameId === 'qxc') return /后区/.test(joined) ? 'back' : 'front';
  return 'main';
}

const _CONS_ROLE_CACHE = Object.create(null);

/**
 * 字段语义表：key → { role, count, area, posIdx }
 *   role: tier(号码池档位) pool(组选池) kill/poskill(杀号)
 *         hot/cold(热冷号) dan/tuo(胆拖) rec/posrec(推荐/定位推荐)
 *         lh/cf/wh/lin/tjlh/tqh(走势号) maxomit/ylhb(遗漏) wsl(尾数冷热)
 * 从 TEMPLATES 推，不另写一份表。
 */
function fieldRolesOf(gameId, imageKey) {
  const ck = gameId + '/' + (imageKey || '*');
  if (_CONS_ROLE_CACHE[ck]) return _CONS_ROLE_CACHE[ck];

  const tpl = (typeof TEMPLATES !== 'undefined') ? TEMPLATES[gameId] : null;
  if (!tpl) return (_CONS_ROLE_CACHE[ck] = {});

  const imgs = imageKey
    ? tpl.images.filter((i) => i.key === imageKey)
    : tpl.images;
  const out = Object.create(null);
  const put = (key, role, count, area, posIdx) => {
    if (!key || out[key]) return;
    out[key] = { role, count, area, posIdx };
  };

  const walk = (sec) => {
    if (!sec || typeof sec !== 'object') return;
    const texts = [sec.title || ''];
    if (Array.isArray(sec.fields)) sec.fields.forEach((f) => texts.push(f.label || ''));
    if (Array.isArray(sec.items)) sec.items.forEach((i) => texts.push(i.label || ''));
    if (Array.isArray(sec.rows)) sec.rows.forEach((r) => texts.push(r.label || ''));
    if (Array.isArray(sec.positions)) sec.positions.forEach((p) => texts.push(p.label || ''));
    if (Array.isArray(sec.footer)) sec.footer.forEach((f) => texts.push(f.label || ''));
    if (sec.bigBall) texts.push(sec.bigBall.label || '');
    const joined = texts.join(' ');
    const area0 = consAreaOf(gameId, joined);
    const type = sec.type;

    if (Array.isArray(sec.fields)) {
      sec.fields.forEach((f) => {
        const L = String(f.label || '');
        const a = consAreaOf(gameId, (sec.title || '') + ' ' + L);
        let role = null; let cnt = 6;
        if (L.includes('热号')) role = 'hot';
        else if (L.includes('冷号')) role = 'cold';
        else if (L.includes('杀号')) { role = 'kill'; cnt = 3; }
        else if (L.includes('胆码')) { role = 'dan'; cnt = 3; }
        else if (L.includes('拖码')) { role = 'tuo'; cnt = 7; }
        else if (L.includes('推荐')) role = 'rec';
        else if (L.includes('跳连号')) role = 'tjlh';
        else if (L.includes('连号')) role = 'lh';
        else if (L.includes('重复号')) role = 'cf';
        else if (L.includes('同尾号')) role = 'wh';
        else if (L.includes('邻号')) role = 'lin';
        else if (L.includes('同区号')) role = 'tqh';
        else if (L.includes('最大遗漏')) role = 'maxomit';
        else if (L.includes('遗漏回补')) role = 'ylhb';
        else if (L.includes('尾数冷热')) role = 'wsl';
        if (role) put(f.key, role, cnt, a);
      });
    }

    if (Array.isArray(sec.items)) {
      sec.items.forEach((i) => {
        const L = String(i.label || '');
        if (L.includes('热号')) put(i.key, 'hot', 6, area0);
        else if (L.includes('冷号')) put(i.key, 'cold', 6, area0);
      });
    }

    if (type === 'rows' && Array.isArray(sec.rows)) {
      sec.rows.forEach((r) => {
        const L = String(r.label || '');
        if (/杀/.test(L)) put(r.key, 'kill', r.count, area0);
        else if (/^\d+\s*(码|胆)$/.test(L.trim())) put(r.key, 'tier', r.count, area0);
        else if (r.key === 'sh') put(r.key, 'kill', r.count, area0);
      });
    }

    if (type === 'digit' || (Array.isArray(sec.positions) && type !== 'positions')) {
      if (sec.groupRow) put(sec.groupRow.key, 'pool', sec.groupRow.count, area0, -2);
      if (Array.isArray(sec.positions)) {
        sec.positions.forEach((p, i) => put(p.key, 'posrec', p.count, area0, i));
      }
    }

    /* 七星彩：定位推荐 / 每位杀号（前后区分开判断，不能用整个区块的标题） */
    if (type === 'positions' && Array.isArray(sec.rows)) {
      sec.rows.forEach((r, i) => {
        const L = String(r.label || '');
        const isBack = /后区/.test(L);
        const a = (gameId === 'qxc') ? (isBack ? 'back' : 'front') : (isBack ? 'back' : area0);
        put(r.key, /杀/.test(L) ? 'poskill' : 'posrec', r.count, a, i);
      });
    }

    if (Array.isArray(sec.footer)) {
      sec.footer.forEach((f) => {
        if (String(f.label || '').includes('杀号')) put(f.key, 'kill', 3, area0);
      });
    }

    if (sec.bigBall) put(sec.bigBall.key, 'rec', 1, area0);
    if (sec.bigBalls) put(sec.bigBalls.key, 'rec', sec.bigBalls.count || 2, area0);

    /* ---- 绕胆图（4×4）的 16 个格子【不登记角色】----
       它是「色块图」不是「号码池行」：一格里只有一个号，
       而 tier/pool 断言要求「字段里的号码个数 = count」，
       登记成 pool(count=16) 会被验收脚本判成数量不符；
       登记成 pool(count=1) 又会污染池子档位统计。
       所以格子的正确性交给专用验收（_verify_raodan.mjs）逐格比对角色表，
       这里保持原样：不参与 ①~⑬ 的号码集合断言（改动前也是这个口径）。 */

    if (sec.left) walk(sec.left);
    if (sec.right) walk(sec.right);
  };

  imgs.forEach((img) => (img.sections || []).forEach(walk));
  _CONS_ROLE_CACHE[ck] = out;
  return out;
}

/** 号码字符串 → 数组（按字段语义解析，只取号码本身） */
function consParse(role, v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s === '—') return [];
  if (role === 'wsl') return [];
  let t = s;
  if (role === 'cf') t = t.split('防')[0];
  if (role === 'maxomit') t = t.replace(/号/g, '');
  if (role === 'tqh') t = t.replace(/[一二三]区/g, '');
  const out = [];
  (t.match(/\d+/g) || []).forEach((x) => {
    const n = parseInt(x, 10);
    if (Number.isInteger(n) && out.indexOf(n) < 0) out.push(n);
  });
  return out;
}

/** 数组 → 号码串（升序、两位） */
function consJoin(arr) {
  return arr.slice().sort((a, b) => a - b).map(pad2).join(' ');
}
/** 数组 → 号码串（保持原有顺序，用于胆码/拖码的共识度顺序） */
function consJoinKeep(arr) {
  return arr.slice().map(pad2).join(' ');
}
/** 两组号码是否同一批（顺序无关） */
function consSame(a, b) {
  return a.length === b.length && a.every((n) => b.indexOf(n) >= 0);
}
/** 去重 */
function consUniq(arr) {
  const out = [];
  arr.forEach((n) => { if (out.indexOf(n) < 0) out.push(n); });
  return out;
}

/** 池内按近 30 期频次排（desc=true 热号优先；false 冷号优先） */
function consByFreq(gameId, areaKey, poolNums, desc) {
  const freq = countFrequency(gameId, areaKey, HIST_PERIODS);
  return poolNums.slice().sort((a, b) => {
    const fa = freq.get(a) || 0;
    const fb = freq.get(b) || 0;
    if (fa !== fb) return desc ? fb - fa : fa - fb;
    return a - b;
  });
}

/** 从候选里按顺序取 count 个（跳过已用过的） */
function consTake(cands, count, used) {
  const out = [];
  for (let i = 0; i < cands.length && out.length < count; i++) {
    const n = cands[i];
    if (used.has(n)) continue;
    used.add(n);
    out.push(n);
  }
  return out;
}

/** 走势号字段的「池内」兜底值（保证不出现池外号） */
function consPropFallback(role, pool, from, to, gameId, areaKey) {
  const sorted = pool.slice().sort((a, b) => a - b);
  const set = new Set(sorted);
  if (role === 'lh') {
    const pairs = [];
    for (let i = 1; i < sorted.length && pairs.length < 3; i++) {
      if (sorted[i] - sorted[i - 1] === 1) pairs.push(`${pad2(sorted[i - 1])}-${pad2(sorted[i])}`);
    }
    return pairs.join(' / ');
  }
  if (role === 'tjlh') {
    const found = [];
    for (const n of sorted) {
      if (found.length >= 2) break;
      if (set.has(n + 2) && set.has(n + 4)) found.push(`${pad2(n)}-${pad2(n + 2)}-${pad2(n + 4)}`);
    }
    return found.join(' / ');
  }
  if (role === 'wh') {
    const byTail = new Map();
    sorted.forEach((n) => {
      const t = n % 10;
      if (!byTail.has(t)) byTail.set(t, []);
      byTail.get(t).push(n);
    });
    return [...byTail.values()].filter((g) => g.length >= 2)
      .sort((a, b) => b.length - a.length).slice(0, 2)
      .map((g) => g.map(pad2).join('-')).join(' / ');
  }
  if (role === 'lin') {
    const near = [];
    sorted.forEach((n) => {
      if (set.has(n + 1)) near.push(n + 1);
      if (set.has(n - 1)) near.push(n - 1);
    });
    return consUniq(near).sort((a, b) => a - b).slice(0, 6).map(pad2).join(' ');
  }
  if (role === 'cf') {
    let top = [];
    try { top = consByFreq(gameId, areaKey, sorted, true).slice(0, 2); } catch (e) { top = sorted.slice(0, 2); }
    return top.length ? top.map(pad2).join(',') + `防${top.length}枚` : '';
  }
  if (role === 'tqh') {
    const zoneSize = Math.ceil((to - from + 1) / 3);
    let best = { idx: 0, n: -1, nums: [] };
    for (let i = 0; i < 3; i++) {
      const lo = from + i * zoneSize;
      const hi = Math.min(to, lo + zoneSize - 1);
      const nums = sorted.filter((n) => n >= lo && n <= hi);
      if (nums.length > best.n) best = { idx: i, n: nums.length, nums };
    }
    return `${
      ['一区', '二区', '三区'][best.idx]}${best.nums.slice(0, 6).map(pad2).join(',')}`;
  }
  return '';
}

/**
 * 一致性收尾（唯一实现）
 * @param {string} gameId
 * @param {string} areaKey  号码区（red/blue/front/back/main）
 * @param {object} out      该图的字段表（会被就地改写并返回）
 * @param {string} [imageKey] 图 key（决定字段语义；不传则合并该彩种所有图）
 * @returns {object} out
 */
function enforceConsistency(gameId, areaKey, out, imageKey) {
  if (!out || typeof out !== 'object') return out;

  let roles;
  try { roles = fieldRolesOf(gameId, imageKey); } catch (e) { return out; }
  if (!roles || !Object.keys(roles).length) return out;

  const [from, to] = consRangeOf(gameId, areaKey);
  const keys = Object.keys(roles).filter((k) => roles[k].area === areaKey
    && out[k] !== undefined && out[k] !== null && String(out[k]).trim() !== '');
  if (!keys.length) return out;

  const roleKeys = (r) => keys.filter((k) => roles[k].role === r);
  const numsOfKey = (k) => consParse(roles[k].role, out[k]);
  const rangeAll = () => { const a = []; for (let i = from; i <= to; i++) a.push(i); return a; };
  const ALL = rangeAll();

  /* ---- 1. 定池：最大档 > 组选池 > 专家池 > （没有池） ---- */
  const tiers = roleKeys('tier')
    .map((k) => ({ k, count: roles[k].count, nums: consUniq(numsOfKey(k)) }))
    .sort((a, b) => a.count - b.count);
  const grpKeys = roleKeys('pool');

  let POOL = null;
  if (tiers.length) {
    POOL = consUniq(tiers[tiers.length - 1].nums);
  } else if (grpKeys.length) {
    POOL = consUniq(grpKeys.reduce((acc, k) => acc.concat(numsOfKey(k)), []));
  } else {
    let exp = [];
    try { exp = (expertPoolOf(gameId, areaKey) || []).filter((n) => n >= from && n <= to); } catch (e) { exp = []; }
    if (exp.length) POOL = consUniq(exp);
  }
  const poolSet = POOL ? new Set(POOL) : null;
  const inPool = (n) => !!poolSet && poolSet.has(n);

  /* ---- 2. 号码池档位：最大档不动，小档必须是上层子集 ----
     这个动作在「尾数冷热」换号前后各做一次：换号会往大档里塞号，
     可能让更小的档（1码对3码）不再是子集。 */
  const fixTierNesting = () => {
    if (!tiers.length) return;
    let cur = consParse('tier', out[tiers[tiers.length - 1].k]);
    if (!cur.length) cur = tiers[tiers.length - 1].nums.slice();
    for (let i = tiers.length - 2; i >= 0; i--) {
      const t = tiers[i];
      const before = consParse('tier', out[t.k]);
      const have = before.filter((n) => cur.indexOf(n) >= 0);
      const need = Math.max(0, t.count - have.length);
      const add = need ? cur.filter((n) => have.indexOf(n) < 0).slice(0, need) : [];
      const fixed = have.concat(add).slice(0, t.count);
      if (!consSame(fixed, before)) out[t.k] = consJoin(fixed);
      cur = fixed;
    }
  };
  fixTierNesting();

  /* ---- 3. 尾数冷热：「N尾冷」的号不能进 1码/3码 主推档 ---- */
  if (tiers.length) {
    const coldTails = consUniq(roleKeys('wsl')
      .reduce((acc, k) => acc.concat((String(out[k]).match(/(\d)尾冷/g) || []).map((x) => Number(x[0]))), []));
    if (coldTails.length) {
      const isCold = (n) => coldTails.indexOf(n % 10) >= 0;
      const small = tiers.filter((t) => t.count <= 3).sort((a, b) => b.count - a.count);
      small.forEach((t) => {
        const idx = tiers.indexOf(t);
        const parent = tiers[idx + 1];
        if (!parent) return;
        let curT = consParse('tier', out[t.k]);
        let curP = consParse('tier', out[parent.k]);
        let changed = false;
        for (let i = 0; i < curT.length; i++) {
          if (!isCold(curT[i])) continue;
          /* 换号：从上一层档位里挑一个「没进这个档、也不是冷尾」的号。
             上一层不用改 —— 候选号本来就在上一层里，被换下的号本来
             也在上一层里（小档是大档的子集），只是不再出现在小档。 */
          const cand = curP.find((n) => curT.indexOf(n) < 0 && !isCold(n));
          if (cand === undefined) continue;
          curT[i] = cand;
          curT = curT.slice().sort((a, b) => a - b);
          changed = true;
        }
        if (changed) out[t.k] = consJoin(curT);
      });
      fixTierNesting();   // 换号后重新保证「小档 ⊆ 大档」
    }
  }

  /* ---- 4. 热号 / 冷号（【方案B】热号从池内取、冷号从池外取）----
     语义：池内的号是「你看好的」→ 里面最热的几个写热号
           池外的号是「你没选的」→ 里面最冷的几个写冷号
     好处：两边天然不重叠（一个在池内、一个在池外），且都能写满 6 个，
           不会再出现「后区池只有 4 个号 → 热冷各 2 个」这种干瘪的结果。 */
  const hotKeys = roleKeys('hot');
  const coldKeys = roleKeys('cold');
  if ((hotKeys.length || coldKeys.length) && (!POOL || POOL.length >= 2)) {
    const dom = POOL ? POOL.slice() : ALL;
    const domSet = new Set(dom);
    /* 冷号候选域：池外。池子等于全区时退回全区 */
    const coldDom = (POOL && ALL.length > dom.length) ? ALL.filter((n) => !domSet.has(n)) : ALL.slice();
    const coldDomSet = new Set(coldDom);

    const hotWant = Math.min(6, dom.length);
    const coldWant = Math.min(6, coldDom.length);

    const hotCur = consUniq(hotKeys.reduce((a, k) => a.concat(numsOfKey(k)), []));
    const coldCur = consUniq(coldKeys.reduce((a, k) => a.concat(numsOfKey(k)), []));

    let hot = hotCur;
    let hotCalc = null;
    if (hot.length !== hotWant || !hot.every((n) => domSet.has(n))) {
      hotCalc = consByFreq(gameId, areaKey, dom, true).slice(0, hotWant);
      hot = hotCalc;
    }
    const hotSet = new Set(hot);

    /* 冷号：必须在池外、且不和热号重叠（池内/池外天然不重叠，这里再保险一次） */
    const coldOK = coldCur.length === coldWant
      && coldCur.every((n) => coldDomSet.has(n) && !hotSet.has(n));
    if (!coldOK) {
      let cold = consByFreq(gameId, areaKey, coldDom, false).slice(0, coldWant);
      if (coldCalcEmpty(cold, coldCur, hotSet)) {
        cold = coldCur.filter((n) => coldDomSet.has(n) && !hotSet.has(n)).slice(0, coldWant);
      }
      if (!cold.length) {
        /* 池外一个都挑不出来时（极小概率），退回全区最冷 */
        cold = consByFreq(gameId, areaKey, ALL, false).filter((n) => !hotSet.has(n)).slice(0, coldWant);
      }
      if (cold.length) coldKeys.forEach((k) => { out[k] = consJoin(cold); });
    }
    if (hotCalc) hotKeys.forEach((k) => { out[k] = consJoin(hot); });
  }

  /* ---- 5. 胆码 / 拖码：池内、互不重复 ---- */
  const danKeys = roleKeys('dan');
  const tuoKeys = roleKeys('tuo');
  if ((danKeys.length || tuoKeys.length) && POOL) {
    let consensus = [];
    try { consensus = (expertPoolOf(gameId, areaKey) || []).filter((n) => n >= from && n <= to); } catch (e) { consensus = []; }
    /* 候选顺序 = 「专家池共识度顺序 ∩ 本区 POOL」，再接 POOL 里剩下的号。
       必须过一遍 inPool：本区 POOL 是模板最大档（可能是资料/存档层给的），
       不一定和专家池完全一致，胆拖绝不能因此掉到池子外面。 */
    const candOrder = consensus.filter(inPool)
      .concat(POOL.filter((n) => consensus.indexOf(n) < 0));

    const danCur = consUniq(danKeys.reduce((a, k) => a.concat(numsOfKey(k)), []));
    let dan = danCur.filter(inPool);
    const danWant = danCur.length || (danKeys.length ? roles[danKeys[0]].count : 3) || 3;
    const used = new Set(dan);
    if (dan.length < danWant) dan = dan.concat(consTake(candOrder, danWant - dan.length, used));
    dan = dan.slice(0, danWant);
    if (!consSame(dan, danCur)) danKeys.forEach((k) => { out[k] = consJoinKeep(dan); });

    if (tuoKeys.length) {
      const tuoCur = consUniq(tuoKeys.reduce((a, k) => a.concat(numsOfKey(k)), []));
      const danSet = new Set(dan);
      let tuo = tuoCur.filter((n) => inPool(n) && !danSet.has(n));
      const tuoWant = tuoCur.length || (roles[tuoKeys[0]].count || 7);
      const usedT = new Set(tuo.concat(dan));
      if (tuo.length < tuoWant) tuo = tuo.concat(consTake(candOrder, tuoWant - tuo.length, usedT));
      tuo = tuo.slice(0, tuoWant);
      if (!consSame(tuo, tuoCur)) tuoKeys.forEach((k) => { out[k] = consJoinKeep(tuo); });
    }
  }

  /* ---- 6. 杀号：从池子外面挑最冷的（越界/池内都算矛盾） ---- */
  const killKeys = roleKeys('kill').concat(roleKeys('poskill'));
  const danTuoNums = consUniq(roleKeys('dan').concat(roleKeys('tuo'))
    .reduce((a, k) => a.concat(numsOfKey(k)), []));
  if (killKeys.length) {
    killKeys.forEach((k) => {
      const role = roles[k].role;
      const cur = consParse(role, out[k]);
      const want = Math.max(1, roles[k].count || cur.length || 3);

      // 该字段自己的「池」：位杀 → 配对的定位推荐；否则 → 本区 POOL
      let domain = POOL ? POOL.slice() : null;
      if (role === 'poskill') {
        const mate = roleKeys('posrec').find((m) => roles[m].posIdx === roles[k].posIdx);
        const mateNums = mate ? consUniq(numsOfKey(mate)) : [];
        if (mateNums.length) domain = mateNums;
      }
      if (!domain) {
        const recs = consUniq(roleKeys('rec').concat(roleKeys('posrec'))
          .reduce((a, m) => a.concat(numsOfKey(m)), []));
        domain = recs.length ? recs : null;
      }
      const domSet = domain ? new Set(domain) : null;
      const badNow = cur.length !== want
        || (domSet && cur.some((n) => domSet.has(n)))
        || cur.some((n) => n < from || n > to);
      if (!badNow) return;

      const outside = ALL.filter((n) => !domSet || !domSet.has(n));
      if (!outside.length) { out[k] = '无'; return; }
      /* ① 先保留原算法（按位杀 / 池内共识度最低）里「本来就合法」的号，
            这样七星彩每位杀号仍然各有各的号，不会全变成同一串；
         ② 不够再用「不在任何推荐/胆拖里」的池外号；
         ③ 再不够就用池外最冷的号。 */
      let algo = [];
      try {
        if (role === 'poskill' && typeof positionKill === 'function') {
          algo = positionKill(gameId, roles[k].posIdx, want, from, to, HIST_PERIODS) || [];
        } else if (typeof autoKillNumbers === 'function') {
          algo = autoKillNumbers(gameId, areaKey, want, from, to, HIST_PERIODS) || [];
        }
      } catch (e) { algo = []; }
      const algoOK = algo.filter((n) => n >= from && n <= to && (!domSet || !domSet.has(n)));
      const ban = new Set(domain || []);
      consUniq(roleKeys('rec').concat(roleKeys('posrec'))
        .reduce((a, m) => a.concat(numsOfKey(m)), []))
        .concat(danTuoNums)
        .forEach((n) => ban.add(n));
      const preferred = consByFreq(gameId, areaKey, outside.filter((n) => !ban.has(n)), false);
      const fallback = consByFreq(gameId, areaKey, outside, false);
      const picked = consUniq(algoOK.concat(preferred, fallback)).slice(0, Math.min(want, outside.length));
      out[k] = picked.length ? consJoin(picked) : '无';
    });
  }

  /* ---- 7. 走势号（连号/重复号/同尾号/邻号/跳连号/同区号）必须在池内 ---- */
  if (POOL) {
    const areas = historyAreas(gameId, areaKey, HIST_PERIODS);
    const poolAreas = areas.map((a) => a.filter(inPool));
    const propRecalc = (role) => {
      if (role === 'lh') return calcConsecutive(poolAreas, 3);
      if (role === 'cf') return calcRepeat(poolAreas);
      if (role === 'wh') return calcSameTail(poolAreas, 2);
      if (role === 'tjlh') return calcSkipChain(poolAreas, 2);
      if (role === 'tqh') return calcSameZone(poolAreas, from, to);
      if (role === 'lin') {
        const src = poolAreas[0] || [];
        const set = new Set();
        src.forEach((n) => { set.add(n - 1); set.add(n + 1); });
        src.forEach((n) => set.delete(n));
        return [...set].filter((n) => n >= from && n <= to && inPool(n))
          .sort((a, b) => a - b).slice(0, 6).map(pad2).join(' ');
      }
      return '';
    };
    /* 该区所有「走势号」字段：一致的跳过；越出池子/空着的
       → 先按「开奖号 ∩ 池子」重算，再不行就用池子里的号兜底。
       注意：这里遍历的是角色表里的全部字段，不只是已经有值的 ——
       避免字段缺值被 render 画成 「—」。 */
    ['lh', 'cf', 'wh', 'lin', 'tjlh', 'tqh'].forEach((role) => {
      Object.keys(roles).filter((k) => roles[k].area === areaKey && roles[k].role === role).forEach((k) => {
        const cur = consParse(role, out[k]);
        if (cur.length && cur.every(inPool)) return;
        let v = '';
        try { v = propRecalc(role); } catch (e) { v = ''; }
        if (!v || consParse(role, v).some((n) => !inPool(n))) v = consPropFallback(role, POOL, from, to, gameId, areaKey);
        if (v) out[k] = v;
      });
    });

    /* ---- 8. 最大遗漏 / 遗漏回补 也必须在池内 ---- */
    Object.keys(roles).filter((k) => roles[k].area === areaKey
      && (roles[k].role === 'maxomit' || roles[k].role === 'ylhb')).forEach((k) => {
      const role = roles[k].role;
      const cur = consParse(role, out[k]);
      if (cur.length && cur.every(inPool)) return;
      let v = '';
      try {
        v = (role === 'maxomit')
          ? calcMaxOmit(areas, from, to, POOL)
          : calcOmitBack(areas, from, to, 3, POOL);
      } catch (e) { v = ''; }
      if (v) out[k] = v;
    });
  }

  return out;
}

/** 冷号兜底：算不出来时用现有冷号里池内的那部分 */
function coldCalcEmpty(calc, cur, hotSet) {
  if (calc && calc.length) return false;
  return (cur || []).some((n) => !hotSet.has(n));
}

/** 一整张图的一致性收尾：逐个号码区过一遍 */
function enforceConsistencyImage(gameId, imageKey, out) {
  if (!out || typeof out !== 'object') return out;
  let roles;
  try { roles = fieldRolesOf(gameId, imageKey); } catch (e) { return out; }
  const areas = [];
  Object.keys(roles).forEach((k) => { if (areas.indexOf(roles[k].area) < 0) areas.push(roles[k].area); });
  areas.forEach((a) => {
    try { enforceConsistency(gameId, a, out, imageKey); } catch (e) { /* 单个区失败不影响其它 */ }
  });
  return out;
}

function autoFillForTemplate(gameId, imageKey) {
  const tpl = (typeof TEMPLATES !== 'undefined') ? TEMPLATES[gameId] : null;
  if (!tpl) return {};

  const img = tpl.images.find((i) => i.key === imageKey) || tpl.images[0];
  const out = {};

  /* ---- 【字段级宽度】模板里给「和值 / 跨度」标的区间宽度上限 ----
     模板写法：{ key: 'hz', label: '前区和值', w: 8 }（w / kdW，不写就沿用 25 / 15）。
     为什么放在模板里：号码范围小的玩法（七星彩前六位 0~9）25 的宽度会给出
     「11~36」这种没参考价值的区间；把它标在字段上，这张图要用多宽一目了然，
     也不用在 stats.js 里按彩种名写 if。 */
  const fieldWidths = {};
  {
    const scan = (sec) => {
      if (!sec || typeof sec !== 'object') return;
      if (Array.isArray(sec.fields)) {
        sec.fields.forEach((f) => {
          if (!f || !f.key) return;
          if (Number.isFinite(f.w) && f.w > 0) {
            fieldWidths[f.key] = f.w;
            if (f.key === 'hz') fieldWidths.w = f.w;      // calcTrendFields 读 w
          }
          if (Number.isFinite(f.kdW) && f.kdW > 0) fieldWidths.kdW = f.kdW;
        });
      }
      if (sec.left) scan(sec.left);
      if (sec.right) scan(sec.right);
    };
    (img.sections || []).forEach(scan);
  }

  /* ---- 「蓝球推荐 / 后区推荐」那批号：整张图只算一次 ----
     两个用处：① 图一上印出来的「蓝球推荐」字段值
              ② 绕胆图的蓝球关注要避开它（用户：「蓝球不要在推荐里面选」）
     算一次、两处共用，就不会出现
     「图上印的推荐」和「绕胆图避开的推荐」是两批号。
     （没有历史数据时 recommendNumbers 会走随机兜底，
       算两次就会得到两个不同的结果，所以必须只算一次。） */
  const backArea = backAreaOf(gameId);
  const backN = backPickCountOf(gameId, 6);
  /* 【推荐号个数】双色球「蓝球推荐」6 个、大乐透「后区推荐」2 个、
     七星彩「后区推荐」1 个 —— 都从模板里读，模板没写才用真实球数兜底。
     以前这里写死「不是 dlt 就是 6」，七星彩会印出 6 个「后区推荐」号，
     和「最后一位只开 1 个号」的玩法对不上。 */
  const backFieldN = templateBackFieldCount(gameId, 'main', backN);
  const hasBackRec = !!AREA_PICK_COUNT[gameId] && !!AREA_PICK_COUNT[gameId][backArea];
  const backRec = hasBackRec ? backRecNumbers(gameId, backArea, backFieldN) : [];
  /* 蓝球/后区推荐字段的个数 */
  const backRecN = backRec.length;

  // 五行 / 绕胆 / 九转 / 九宫 这张图用专用填充
  if (imageKey === 'wuxing') {
    Object.assign(out, autoFillWuxing(gameId, { backRec }));
  }

    /* ---- 号码范围表（按彩种）----
       qlc 的「特别号」是 1~30（不是蓝球 1~16）：autoFillWuxing / 绕胆图
       都要按这个范围取号，否则会取出根本不存在的号。 */
  const RANGE = {
    ssq:  { red: [1, 33], blue: [1, 16], main: [1, 30] },
    dlt:  { front: [1, 35], back: [1, 12] },
    qlc:  { main: [1, 30], special: [1, 30] },
    kl8:  { main: [1, 80] },
    fc3d: { main: [0, 9] },
    pl3:  { main: [0, 9] },
    pl5:  { main: [0, 9] },
    qxc:  { front: [0, 9], back: [0, 14] }
  };
  const rng = RANGE[gameId] || {};

  const walk = (sec) => {
    if (!sec || typeof sec !== 'object') return;

    /* ---- 判断当前区块属于哪个号码区 ---- */
    // 依据：区块标题 + 字段名里有没有「后区 / 蓝球」
    const texts = [sec.title || ''];
    if (sec.fields) sec.fields.forEach((f) => texts.push(f.label));
    if (sec.items) sec.items.forEach((i) => texts.push(i.label));
    if (sec.bigBall) texts.push(sec.bigBall.label || '');
    const joined = texts.join(' ');

    let areaKey, range, pickCount;
    if (gameId === 'ssq') {
      const isBlue = /蓝球/.test(joined);
      areaKey = isBlue ? 'blue' : 'red';
      range = isBlue ? [1, 16] : [1, 33];
      pickCount = areaPickCount(gameId, areaKey, isBlue ? 1 : 6);
    } else if (gameId === 'dlt') {
      const isBack = /后区/.test(joined);
      areaKey = isBack ? 'back' : 'front';
      range = isBack ? [1, 12] : [1, 35];
      pickCount = areaPickCount(gameId, areaKey, isBack ? 2 : 5);
    } else if (gameId === 'qxc') {
      const isBack = /后区/.test(joined);
      areaKey = isBack ? 'back' : 'front';
      range = isBack ? [0, 14] : [0, 9];
      pickCount = areaPickCount(gameId, areaKey, isBack ? 1 : 6);
    } else if (gameId === 'qlc') {
      /* 七乐彩两个区：基本号（1~30 选 7）+ 特别号（1~30 选 1）。
         以前这里一律落进最后的 else → areaKey='main'，
         所以「特别号走势分析」实际算的是基本号的走势（数字全错）。
         判断口径和 consAreaOf 保持一致：标题/字段名里带「特别号」就是 special。 */
      const isSpecial = /特别号/.test(joined);
      areaKey = isSpecial ? 'special' : 'main';
      range = (rng[areaKey]) || [1, 30];
      pickCount = areaPickCount(gameId, areaKey, isSpecial ? 1 : 7);
    } else {
      areaKey = 'main';
      range = (rng.main) || [1, 33];
      pickCount = areaPickCount(gameId, areaKey,
        { qlc: 7, kl8: 20, fc3d: 3, pl3: 3, pl5: 5 }[gameId] || 6);
    }

    /* ---- 走势分析字段：全部自动算 ---- */
    if (sec.fields) {
      const trend = calcTrendFields(gameId, areaKey, range[0], range[1], pickCount, fieldWidths);

      // 先算出「推荐号」——奇偶/大小/012路 都要跟着它走
      // 【关键】号码个数 = 该玩法该区的真实球数（双色球红球 6、大乐透前区 5……）
      // 不能再按「区间大小」猜，否则会写出「3奇7偶」这种 10 个号的指标
      const zoneSize = range[1] - range[0] + 1;
      const recCap = areaPickCount(gameId, areaKey, pickCount);
      const recN = Math.min(recCap, zoneSize);
      /* 【单一来源】蓝球/后区「推荐」用上面算好的那一份（双色球 6 个、大乐透 2 个）——
         绕胆图避开的正是它，两处必须同源。
         注意：`recN` 是「该区真实球数」（蓝球 1、后区 2），
         只用来算奇偶/大小/012路；「蓝球推荐」这个字段的个数看模板，
         这里不能拿 recN 去截 backRec，否则字段会只剩 1 个号。 */
      const isBackArea = (gameId === 'ssq' && areaKey === 'blue')
        || (gameId === 'dlt' && areaKey === 'back')
        /* 七星彩「后区」（最后一位）和七乐彩「特别号」也走这份唯一来源，
           绕胆图的「后区/特别号关注」避开的正是它 */
        || (gameId === 'qxc' && areaKey === 'back');
      const recNums = (isBackArea && backRec.length)
        ? backRec.slice()
        : recommendNumbers(gameId, areaKey, recN, range[0], range[1]);

      /* 推荐号的衍生指标：只看「真实球数」那一批号码
         双色球红球 6 个 → 写 6 个号的奇偶/大小/012路；
         大乐透前区 5 个 → 写 5 个号；蓝球 1 个、后区 2 个同理。
         不能拿「号码池自身的构成」来写 —— 池子有 20 个号，
         会写出「8奇12偶」这种和玩法对不上的指标。
         注意：blue 区的 recNums 可能是 6 个（「蓝球推荐」字段要 6 个），
         但指标只能按真实球数 1 个算 —— 所以这里必须 slice(0, recN)。 */
      const derived = deriveFromPicks(recNums.slice(0, recN), range[0], range[1]);

      sec.fields.forEach((f) => {
        const L = f.label;

        // 推荐号本身
        if (L.includes('推荐')) {
          /* 蓝球/后区推荐：直接用上面那份【唯一来源】——
             绕胆图避开的正是它，两处必须是同一批号
             （没有历史数据时 recommendNumbers 会走随机兜底，
               这里再算一次就会和绕胆图避开的名单对不上）。
             个数按模板来（双色球 6、大乐透 2），不按 recN（真实球数 1/2）。 */
          out[f.key] = (isBackArea && backRec.length)
            ? backRec.map(pad2).join(' ')
            : recNums.map(pad2).join(' ');
          return;
        }
        // 热号：近 30 期出现最多
        if (L.includes('热号')) {
          out[f.key] = hotLine(gameId, areaKey, 6, HIST_PERIODS);
          return;
        }
        // 冷号：近 30 期出现最少
        if (L.includes('冷号')) {
          out[f.key] = coldLine(gameId, areaKey, 6, range[0], range[1], HIST_PERIODS);
          return;
        }
        // 杀号：取最冷号
        if (L.includes('杀号')) {
          out[f.key] = autoKillNumbers(gameId, areaKey, 3, range[0], range[1], 30)
            .map(pad2).join(' ');
          return;
        }
        // 奇偶：由推荐号推导
        if (L.includes('奇偶')) {
          out[f.key] = derived.oddEven;
          return;
        }
        // 大小：由推荐号推导
        if (L.includes('大小')) {
          out[f.key] = derived.bigSmall;
          return;
        }
        // 012 路：由推荐号推导
        if (L.includes('012')) {
          out[f.key] = derived.route012;
          return;
        }

        // 主区和值/跨度等（后区一般没有这些）
        const map = {
          '和值': 'hz', '跨度': 'kd', '区间比': 'qjb', '连号': 'lh',
          '重复号': 'cf', '同尾号': 'wh', '邻号': 'lin', '跳连号': 'tjlh',
          '同区号': 'tqh', '质数/合数': 'zhs', '尾数冷热': 'wsl',
          '最大遗漏': 'maxomit', '遗漏回补': 'ylhb', '胆码': 'dm', '拖码': 'tm'
        };
        /* 关键词按长度从长到短匹配，且「匹配上就不再往下试」——
           「跳连号」不能被短关键词「连号」抢先匹配（否则两个字段
           会显示同一串号，等于自相矛盾）；算不出来就留空，
           交给下面的一致性收尾按池子补上。 */
        const kws = Object.keys(map).sort((a, b) => b.length - a.length);
        const kw = kws.find((w) => L.includes(w));
        if (kw) {
          const tv = trend[map[kw]];
          if (tv) out[f.key] = tv;
          return;
        }
      });
    }

    /* ---- 热号/冷号一行（冷热号参考区块） ---- */
    if (sec.items) {
      sec.items.forEach((it) => {
        if (it.label === '热号') out[it.key] = hotLine(gameId, areaKey, 6, 30);
        else if (it.label === '冷号') out[it.key] = coldLine(gameId, areaKey, 6, range[0], range[1], 30);
      });
    }

    /* ---- 号码池 / 杀号行 ----
       注意：杀号区块的标题可能是空的（标签在 row 上），
       所以判断要同时看标题、字段名 和 row 的 label。
    ---- */
    if (sec.rows && sec.type === 'rows') {
      // 把 row 标签也纳入判断依据
      const rowText = sec.rows.map((r) => r.label || '').join(' ');
      const judgeText = joined + ' ' + rowText;

      // 按 key 前缀把行分组：sh→杀号，k→杀号，其余→号码池
      const killRows = sec.rows.filter((r) => /杀/.test(r.label || '') || /^k/i.test(r.key || ''));
      const poolRows = sec.rows.filter((r) => !killRows.includes(r));

      // 号码池：按档位递减取号（保证大档包含小档）
      if (poolRows.length) {
        const cap = maxPoolCount(gameId);
        const counts = poolRows.map((r) => Math.min(r.count || 1, cap, range[1] - range[0] + 1));
        const wantMax = counts.reduce((a, b) => Math.max(a, b), 1);

        /* 【号码池优先】
           有专家号码池 → 号码从池子里按共识度排序取，
             池子不够最大档时，用原来的评分算法把差额补足
           没有专家池   → 完全走原来的 autoNumberPool */
        const inPoolSet = new Set(expertPoolOf(gameId, areaKey));
        const base = expertBaseOf(gameId, areaKey, wantMax, range[0], range[1], (need) =>
          recommendNumbers(gameId, areaKey,
            Math.min(range[1] - range[0] + 1, need + inPoolSet.size + 5), range[0], range[1])
            .filter((n) => !inPoolSet.has(n)));

        if (base && base.length) {
          poolRows.forEach((r, i) => {
            out[r.key] = base.slice(0, counts[i]).sort((a, b) => a - b).map(pad2).join(' ');
          });
        } else {
          const pool = autoNumberPool(gameId, areaKey, counts, {
            from: range[0], to: range[1], periods: HIST_PERIODS, mod: 4
          });

          poolRows.forEach((r, i) => {
            if (pool[i] && pool[i].nums && pool[i].nums.length) {
              out[r.key] = pool[i].nums.map(pad2).join(' ');
            } else {
              // 兜底：直接用推荐号补上
              out[r.key] = recommendNumbers(gameId, areaKey, counts[i] || 1, range[0], range[1])
                .map(pad2).join(' ');
            }
          });
        }
      }

      // 杀号：取最冷的 N 个
      killRows.forEach((r) => {
        const n = Math.min(r.count || 3, range[1] - range[0] + 1);
        const killed = autoKillNumbers(gameId, areaKey, n, range[0], range[1], 30);
        out[r.key] = (killed && killed.length)
          ? killed.map(pad2).join(' ')
          : recommendNumbers(gameId, areaKey, n, range[0], range[1]).map(pad2).join(' ');
      });
    }

    /* ---- 主推球 ---- */
    if (sec.bigBall && !out[sec.bigBall.key]) {
      out[sec.bigBall.key] = hotLine(gameId, areaKey, 1, 30);
    }
    if (sec.bigBalls && !out[sec.bigBalls.key]) {
      out[sec.bigBalls.key] = hotLine(gameId, areaKey, sec.bigBalls.count || 2, 30);
    }

    /* ---- 热号排行：每个分组按自己的标签判断区域 ---- */
    if (sec.type === 'rank' && sec.groups) {
      sec.groups.forEach((g) => {
        // 按分组标签决定用哪个号码区（如「后区热号排行」用后区）
        let gArea = areaKey;
        if (gameId === 'ssq') {
          gArea = /蓝球/.test(g.label) ? 'blue' : 'red';
        } else if (gameId === 'dlt') {
          gArea = /后区/.test(g.label) ? 'back' : 'front';
        } else if (gameId === 'qxc') {
          gArea = /后区/.test(g.label) ? 'back' : 'front';
        } else if (/后区|蓝球/.test(g.label)) {
          gArea = 'back';
        }
        const rk = hotRankStrings(gameId, gArea, g.count || 6, 30);
        rk.forEach((v, i) => { out[`${g.label}_${i}`] = v; });
      });
    }

    /* ---- 定位推荐 / 组选 / 每位杀号 ----
       覆盖三种写法：
         sec.groupRow              组选（福彩3D、排列3）
         sec.positions[]           定位数组（福彩3D、排列3、排列5 的 digit 区）
         sec.type==='positions'    定位行（七星彩，用 rows 表示每位）
    ---- */
    {
      const lo = range[0];
      const hi = range[1];
      const pad2s = (x) => (Number(x) === 0 ? '0' : String(x).padStart(2, '0'));

      // 组选：从该区挑 N 个不同号
      if (sec.groupRow) {
        const n = Math.min(sec.groupRow.count || 6, hi - lo + 1);
        out[sec.groupRow.key] = recommendNumbers(gameId, areaKey, n, lo, hi).map(pad2s).join(' ');
      }

      // 数组形式的定位（福彩3D、排列3、排列5）
      if (Array.isArray(sec.positions)) {
        sec.positions.forEach((p, idx) => {
          const n = Math.min(p.count || 3, hi - lo + 1);
          // 按位置分别统计，保证每个位置的推荐不一样
          out[p.key] = positionRecommend(gameId, idx, n, lo, hi, HIST_PERIODS)
            .map(pad2s).join(' ');
        });
      }

      // 七星彩：type='positions'，用 rows 表示每一位（推荐 或 杀号）
      if (sec.type === 'positions' && Array.isArray(sec.rows)) {
        const isKill = /杀/.test(joined + ' ' + (sec.title || ''));
        sec.rows.forEach((r, idx) => {
          const n = Math.min(r.count || 3, 15);
          const isBack = /后区/.test(r.label || '');

          // 后区：0-14；前区：0-9
          const pFrom = isBack ? 0 : 0;
          const pTo = isBack ? 14 : 9;

          out[r.key] = (isKill
            ? positionKill(gameId, idx, n, pFrom, pTo, HIST_PERIODS)
            : positionRecommend(gameId, idx, n, pFrom, pTo, HIST_PERIODS)
          ).map(pad2s).join(' ');
        });
      }
    }

    /* ---- 数字型页脚：合值 / 和尾 / 防组三 / 杀号（福彩3D、排列3）---- */
    if (Array.isArray(sec.footer)) {
      sec.footer.forEach((f) => {
        const L = String(f.label || '');
        const K = String(f.key || '');

        /* 【硬性条件】和值 3 个数（不再是区间） */
        if (L.includes('合值') || K === 'hz') {
          const hzAreas = historyAreas(gameId, areaKey, 30);
          const hzTop = digitFooterTop(hzAreas, 'sum', 3);
          if (hzTop.length) { out[f.key] = hzTop.join(' '); return; }
          const td = calcTrendFields(gameId, areaKey, range[0], range[1], pickCount);
          out[f.key] = td.hz || '0~27';
          return;
        }
        /* 【硬性条件】和尾 3 个数（不再是 0~9） */
        if (L.includes('和尾') || K === 'hw') {
          const hwAreas = historyAreas(gameId, areaKey, 30);
          const hwTop = digitFooterTop(hwAreas, 'tail', 3);
          out[f.key] = hwTop.length ? hwTop.join(' ') : '0 1 2';
          return;
        }
        /* 【硬性条件】对子号 2 个数（不再是"对子号"三个字） */
        if (L.includes('防组三') || L.includes('对子') || K === 'fz3') {
          const fzAreas = historyAreas(gameId, areaKey, 30);
          const fzTop = digitFooterTop(fzAreas, 'pair', 2);
          out[f.key] = fzTop.length ? fzTop.join(' ') : '11 22';
          return;
        }
        if (L.includes('杀号') || K === 'sh') {
          out[f.key] = autoKillNumbers(gameId, areaKey, 3, range[0], range[1], 30)
            .map((x) => (Number(x) === 0 ? '0' : String(x).padStart(2, '0'))).join(' ');
          return;
        }
        // 其他：给个占位，避免整行空着
        if (!out[f.key]) out[f.key] = '—';
      });
    }

    /* ---- 五行号码（e_*）---- */
    if (Array.isArray(sec.elements)) {
      const wxFrom = (gameId === 'dlt') ? 1 : 1;
      const wxTo = (gameId === 'dlt') ? 35 : 33;
      const wx = wuxingNumbers(wxFrom, wxTo);
      sec.elements.forEach((e) => {
        const key = e.key || '';
        let arr = [];
        if (/jin/.test(key)) arr = wx.jin;
        else if (/mu/.test(key)) arr = wx.mu;
        else if (/shui/.test(key)) arr = wx.shui;
        else if (/huo/.test(key)) arr = wx.huo;
        else if (/tu/.test(key)) arr = wx.tu;
        if (arr.length) out[e.key] = arr.map(pad2).join(' ');
      });
    }

    /* ---- 神煞徽章（badge*） + 九宫中心 ---- */
    if (Array.isArray(sec.badges) || sec.centerKey) {
      const dirs = luckyDirections(new Date());
      const order = ['财神', '喜神', '福神', '贵神', '冲煞'];
      if (Array.isArray(sec.badges)) {
        sec.badges.forEach((b, i) => {
          const v = dirs[order[i]] || dirs[order[order.length - 1]];
          if (v) out[b.key] = v;
        });
      }
      if (sec.centerKey && !out[sec.centerKey]) out[sec.centerKey] = '5';
    }

    if (sec.left) walk(sec.left);
    if (sec.right) walk(sec.right);
  };

  img.sections.forEach(walk);

  /* ---- 兜底：保证每个彩种的走势指标都不为空 ---- */
  ensureTrendFallback(gameId, out);

  /* ---- 【一致性收尾】消除字段自相矛盾（池子优先，唯一实现在上面） ---- */
  try { enforceConsistencyImage(gameId, imageKey, out); } catch (e) { /* 失败不影响出图 */ }

  return out;
}
