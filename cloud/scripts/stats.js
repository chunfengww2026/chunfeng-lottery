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
    jq: `${odd}奇${n - odd}偶`,
    dx: `${big}大${n - big}小`,
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
    .map((h) => `${String(h.num).padStart(2, '0')}出现${h.count}次`);
}

/** 生成「热号」一行文字 */
function hotLine(gameId, areaKey, n, periods) {
  return hotNumbers(gameId, areaKey, n, periods)
    .map((h) => String(h.num).padStart(2, '0'))
    .join(' ');
}

/** 生成「冷号」一行文字 */
function coldLine(gameId, areaKey, n, from, to, periods) {
  return coldNumbers(gameId, areaKey, n, from, to, periods)
    .map((h) => String(h.num).padStart(2, '0'))
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
   6. 五行 / 绕胆 / 九宫模板的自动填充
   ------------------------------------------------------------
   全部按固定规则生成，不是预测。
   ============================================================ */

/** 五行号码：按尾数归类（金4/9 木3/8 水1/6 火2/7 土5/0） */
function wuxingNumbers(from, to) {
  const T = { jin: [4, 9], mu: [3, 8], shui: [1, 6], huo: [2, 7], tu: [5, 0] };
  const out = {};
  Object.keys(T).forEach((k) => {
    const arr = [];
    for (let n = from; n <= to; n++) {
      if (T[k].includes(n % 10)) arr.push(n);
    }
    out[k] = arr;
  });
  return out;
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

/** 从号码池里构造 4×4 绕胆图 */
function buildRaodanGrid(pool, backNums) {
  const out = {};
  const main = pool.slice(0, 16);
  main.forEach((n, i) => { out['grid_' + i] = pad2(n); });
  const extra = (backNums || []).slice(0, Math.max(0, 16 - main.length));
  extra.forEach((n, i) => { out['grid_' + (main.length + i)] = pad2(n); });
  return out;
}

/**
 * 五行九宫模板的自动填充
 */
function autoFillWuxing(gameId) {
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

  /* ---- 五行号码 ---- */
  const from = 1;
  const to = gameId === 'dlt' ? 35 : 33;
  const wx = wuxingNumbers(from, to);
  out.e_jin = wx.jin.map(pad2).join(' ');
  out.e_mu = wx.mu.map(pad2).join(' ');
  out.e_shui = wx.shui.map(pad2).join(' ');
  out.e_huo = wx.huo.map(pad2).join(' ');
  out.e_tu = wx.tu.map(pad2).join(' ');

  /* ---- 尾数旺弱（近 30 期真实频次） ---- */
  const hist = getHistory(gameId);
  const areaKey = gameId === 'dlt' ? 'front' : 'red';
  const tail = new Array(10).fill(0);
  hist.slice(0, 30).forEach((d) => {
    ((d.areas && d.areas[areaKey]) || []).forEach((n) => tail[n % 10]++);
  });
  const ranked = tail.map((c, i) => ({ tail: i, c })).sort((a, b) => b.c - a.c);
  out.wx_wang = ranked.slice(0, 4).map((x) => x.tail).join('、');
  out.wx_ruo = ranked.slice(-2).map((x) => x.tail).join('、');

  /* ---- 吉利数字 ---- */
  out.wx_ji = recommendNumbers(gameId, areaKey, 6, from, to).map(pad2).join(' ');

  /* ---- 绕胆图 ---- */
  const pool = recommendNumbers(gameId, areaKey, 16, from, to);
  const backKey = gameId === 'dlt' ? 'back' : 'blue';
  const backRange = gameId === 'dlt' ? [1, 12] : [1, 16];
  const backNums = recommendNumbers(gameId, backKey, 3, backRange[0], backRange[1]);
  Object.assign(out, buildRaodanGrid(pool, backNums));

  /* ---- 九转连环 ---- */
  const ringNames = recommendNumbers(gameId, areaKey, 9, from, to);
  out.cir_center = pad2(ringNames[4] || 18);
  ringNames.filter((_, i) => i !== 4).slice(0, 8).forEach((n, i) => {
    out['cir_' + i] = pad2(n);
  });

  /* ---- 九宫 ---- */
  out.jg_center = '5';
  out.jg_zhong = '5为主，对应尾数5、0为旺';
  const guan = [];
  for (let n = from; n <= to; n++) if (n % 5 === 0) guan.push(n);
  out.jg_guan = guan.slice(0, 3).map(pad2).join(' ');

  return out;
}

const pad2 = (n) => String(n).padStart(2, '0');
const toLine = (arr) => arr.map(pad2).join(' ');

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
    const out = pool.slice(0, want);
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

  const picked = list.slice(0, want).map((x) => x.num);

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
  if (oddCount === list.length) oddEven = `${list.length}奇`;
  else if (evenCount === list.length) oddEven = `${list.length}偶`;
  else oddEven = `${oddCount}奇${evenCount}偶`;

  // 大小：同理
  let bigSmall;
  if (bigCount === list.length) bigSmall = `${list.length}大`;
  else if (smallCount === list.length) bigSmall = `${list.length}小`;
  else bigSmall = `${bigCount}大${smallCount}小`;

  // 012 路：每个号给出路数，用空格连起来
  const route012 = list.map((n) => `${n % 3}路`).join(' ');

  return { oddEven, bigSmall, route012 };
}

/* ---------- 和值（区间 = 统计窗口内真实取值范围） ---------- */
function calcSum(areas) {
  const sums = areas.map((a) => a.reduce((x, y) => x + y, 0)).sort((a, b) => a - b);
  if (!sums.length) return '';
  return compactRange(sums, 25);
}

/* ---------- 跨度（区间 = 统计窗口内真实取值范围） ---------- */
function calcSpan(areas) {
  const spans = areas.map((a) => Math.max(...a) - Math.min(...a)).sort((a, b) => a - b);
  if (!spans.length) return '';
  return compactRange(spans, 15);
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
 */
function compactRange(sorted, maxWidth) {
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
function calcTrendFields(gameId, areaKey, from, to, pickCount) {
  const areas = historyAreas(gameId, areaKey, 30);
  if (!areas.length) return {};

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
    hz:      calcSum(areas),
    kd:      calcSpan(areas),
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

  const fmt = (arr) => arr.map((x) => String(x.num).padStart(2, '0')).join(' ');

  const lines = [];
  lines.push(`统计范围：最近 ${periods} 期真实开奖数据`);
  lines.push(`上期${cfg.name}：${nums.map((n) => String(n).padStart(2, '0')).join(' ')}`);
  lines.push(`热号（出现最多）：${fmt(hot)}`);
  lines.push(`冷号（出现最少）：${fmt(cold)}`);

  // 附加：其他区的热号（双色球蓝球 / 大乐透后区 / 七星彩后区）
  if (gameId === 'ssq') {
    const bh = hotNumbers(gameId, 'blue', 4, periods);
    if (bh.length) lines.push(`蓝球热号：${bh.map((x) => String(x.num).padStart(2, '0')).join(' ')}`);
  }
  if (gameId === 'dlt') {
    const bh = hotNumbers(gameId, 'back', 4, periods);
    if (bh.length) lines.push(`后区热号：${bh.map((x) => String(x.num).padStart(2, '0')).join(' ')}`);
  }
  if (gameId === 'qxc') {
    const bh = hotNumbers(gameId, 'back', 4, periods);
    if (bh.length) lines.push(`后区热号：${bh.map((x) => String(x.num).padStart(2, '0')).join(' ')}`);
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

function autoFillForTemplate(gameId, imageKey) {
  const tpl = (typeof TEMPLATES !== 'undefined') ? TEMPLATES[gameId] : null;
  if (!tpl) return {};

  const img = tpl.images.find((i) => i.key === imageKey) || tpl.images[0];
  const out = {};

  // 五行 / 绕胆 / 九转 / 九宫 这张图用专用填充
  if (imageKey === 'wuxing') {
    Object.assign(out, autoFillWuxing(gameId));
  }

  // 号码范围表（按彩种）
  const RANGE = {
    ssq:  { red: [1, 33], blue: [1, 16], main: [1, 30] },
    dlt:  { front: [1, 35], back: [1, 12] },
    qlc:  { main: [1, 30] },
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
    } else {
      areaKey = 'main';
      range = (rng.main) || [1, 33];
      pickCount = areaPickCount(gameId, areaKey,
        { qlc: 7, kl8: 20, fc3d: 3, pl3: 3, pl5: 5 }[gameId] || 6);
    }

    /* ---- 走势分析字段：全部自动算 ---- */
    if (sec.fields) {
      const trend = calcTrendFields(gameId, areaKey, range[0], range[1], pickCount);

      // 先算出「推荐号」——奇偶/大小/012路 都要跟着它走
      // 【关键】号码个数 = 该玩法该区的真实球数（双色球红球 6、大乐透前区 5……）
      // 不能再按「区间大小」猜，否则会写出「3奇7偶」这种 10 个号的指标
      const zoneSize = range[1] - range[0] + 1;
      const recCap = areaPickCount(gameId, areaKey, pickCount);
      const recN = Math.min(recCap, zoneSize);
      const recNums = recommendNumbers(gameId, areaKey, recN, range[0], range[1]);

      /* 推荐号的衍生指标：只看「真实球数」那一批号码
         双色球红球 6 个 → 写 6 个号的奇偶/大小/012路；
         大乐透前区 5 个 → 写 5 个号；蓝球 1 个、后区 2 个同理。
         不能拿「号码池自身的构成」来写 —— 池子有 20 个号，
         会写出「8奇12偶」这种和玩法对不上的指标。 */
      const derived = deriveFromPicks(recNums, range[0], range[1]);

      sec.fields.forEach((f) => {
        const L = f.label;

        // 推荐号本身
        if (L.includes('推荐')) {
          out[f.key] = recNums.map(pad2).join(' ');
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
        for (const [kw, key] of Object.entries(map)) {
          if (L.includes(kw) && trend[key]) { out[f.key] = trend[key]; return; }
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
      const pad2s = (x) => String(x).padStart(2, '0');

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

        if (L.includes('合值') || K === 'hz') {
          const td = calcTrendFields(gameId, areaKey, range[0], range[1], pickCount);
          out[f.key] = td.hz || '0~27';
          return;
        }
        if (L.includes('和尾') || K === 'hw') {
          out[f.key] = '0~9';
          return;
        }
        if (L.includes('防组三') || K === 'fz3') {
          out[f.key] = '对子号';
          return;
        }
        if (L.includes('杀号') || K === 'sh') {
          out[f.key] = autoKillNumbers(gameId, areaKey, 3, range[0], range[1], 30)
            .map((x) => String(x).padStart(2, '0')).join(' ');
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

  return out;
}
