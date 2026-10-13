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
 * @returns {{num:number, count:number}[]}
 */
function hotNumbers(gameId, areaKey, n, periods) {
  const freq = countFrequency(gameId, areaKey, periods);
  return [...freq.entries()]
    .map(([num, count]) => ({ num, count }))
    .sort((a, b) => b.count - a.count || a.num - b.num)
    .slice(0, n || 6);
}

/**
 * 取冷号（出现次数最少的前 n 个）
 * 注意：只统计「在号码范围内出现过至少一次」的号；
 * 若历史期数够多，未出现的号也算冷号。
 */
function coldNumbers(gameId, areaKey, n, rangeFrom, rangeTo, periods) {
  const freq = countFrequency(gameId, areaKey, periods);
  const from = rangeFrom || 1;
  const to = rangeTo || 33;

  const all = [];
  for (let i = from; i <= to; i++) {
    all.push({ num: i, count: freq.get(i) || 0 });
  }
  return all
    .sort((a, b) => a.count - b.count || a.num - b.num)
    .slice(0, n || 6);
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
 * 自动算杀号（取近期最冷的几个号）
 */
function autoKillNumbers(gameId, areaKey, n, from, to, periods) {
  return coldNumbers(gameId, areaKey, n, from, to, periods)
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
 */
function recommendNumbers(gameId, areaKey, n, from, to) {
  const size = to - from + 1;
  const want = Math.max(1, Math.min(n, size));

  const hist = getHistory(gameId);

  // 【兜底】没有历史数据时，也要给出号码，避免整张图空着
  if (!hist.length) {
    const pool = [];
    for (let i = from; i <= to; i++) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, want).sort((a, b) => a - b);
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

  const picked = list
    .sort((x, y) => y.score - x.score || x.num - y.num)
    .slice(0, want)
    .map((x) => x.num);

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
 */
function positionKill(gameId, posIdx, n, from, to, periods) {
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

/* ---------- 和值（区间宽度控制在 25 以内） ---------- */
function calcSum(areas) {
  const sums = areas.map((a) => a.reduce((x, y) => x + y, 0)).sort((a, b) => a - b);
  if (!sums.length) return '';
  return compactRange(sums, 25);
}

/* ---------- 跨度（区间宽度控制在 15 以内） ---------- */
function calcSpan(areas) {
  const spans = areas.map((a) => Math.max(...a) - Math.min(...a)).sort((a, b) => a - b);
  if (!spans.length) return '';
  return compactRange(spans, 15);
}

/**
 * 把一组数值压成一个「最紧凑的主体区间」
 * 取中间 80% 的分位作为区间，并把宽度限制在 maxWidth 内。
 * 这样不会出现「33~132」这种把极端值也算进去的离谱范围。
 */
function compactRange(sorted, maxWidth) {
  const n = sorted.length;
  if (n === 1) return `${sorted[0]}~${sorted[0]}`;

  // 先取中间 80% 分位
  const lo = sorted[Math.floor(n * 0.1)];
  const hi = sorted[Math.min(n - 1, Math.ceil(n * 0.9) - 1)];

  let a = lo;
  let b = hi;

  // 如果还是太宽，以中位数为中心收缩到 maxWidth
  if (b - a > maxWidth) {
    const mid = Math.round((a + b) / 2);
    a = mid - Math.floor(maxWidth / 2);
    b = a + maxWidth;
  }

  // 对齐到实际出现过的值
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
function calcMaxOmit(areas, from, to) {
  const omit = new Map();
  for (let i = 0; i < areas.length; i++) {
    areas[i].forEach((n) => { if (!omit.has(n)) omit.set(n, i); });
  }
  let best = { num: null, gap: -1 };
  for (let n = from; n <= to; n++) {
    const gap = omit.has(n) ? omit.get(n) : areas.length;
    if (gap > best.gap) best = { num: n, gap };
  }
  return best.num === null ? '' : `${pad2(best.num)}号`;
}

/* ---------- 遗漏回补（遗漏期数最多的几个号） ---------- */
function calcOmitBack(areas, from, to, max) {
  const omit = new Map();
  for (let i = 0; i < areas.length; i++) {
    areas[i].forEach((n) => { if (!omit.has(n)) omit.set(n, i); });
  }
  const list = [];
  for (let n = from; n <= to; n++) {
    list.push({ num: n, gap: omit.has(n) ? omit.get(n) : areas.length });
  }
  return list.sort((a, b) => b.gap - a.gap || a.num - b.num)
    .slice(0, max || 3).map((x) => pad2(x.num)).join(' ');
}

/* ---------- 胆码 / 拖码（基于频次与遗漏的统计排序） ---------- */
function calcDanTuo(gameId, areaKey, areas, from, to) {
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

/* ---------- 统一入口：算出某彩种某区的全部走势字段 ---------- */
function calcTrendFields(gameId, areaKey, from, to, pickCount) {
  const areas = historyAreas(gameId, areaKey, 30);
  if (!areas.length) return {};

  const dt = calcDanTuo(gameId, areaKey, areas, from, to);

  return {
    hz:      calcSum(areas),
    kd:      calcSpan(areas),
    jq:      calcOddEven(areas, pickCount),
    dx:      calcBigSmall(areas, from, to, pickCount),
    qjb:     calcZone(areas, from, to, pickCount),
    lu012:   calc012(areas, pickCount),
    lh:      calcConsecutive(areas, 3),
    cf:      calcRepeat(areas),
    wh:      calcSameTail(areas, 2),
    lin:     calcNeighbor(areas, from, to, 6),
    tjlh:    calcSkipChain(areas, 2),
    tqh:     calcSameZone(areas, from, to),
    zhs:     calcPrime(areas, pickCount),
    wsl:     calcTailHotCold(areas),
    maxomit: calcMaxOmit(areas, from, to),
    ylhb:    calcOmitBack(areas, from, to, 3),
    dm:      dt.dan.join(' '),
    tm:      dt.tuo.join(' ')
  };
}

/** 各彩种主号码区与范围 */
const MAIN_AREA = {
  ssq:  { area: 'red',   from: 1, to: 33, name: '红球' },
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
 */function autoFillForTemplate(gameId, imageKey) {
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
      pickCount = isBlue ? 1 : 6;
    } else if (gameId === 'dlt') {
      const isBack = /后区/.test(joined);
      areaKey = isBack ? 'back' : 'front';
      range = isBack ? [1, 12] : [1, 35];
      pickCount = isBack ? 2 : 5;
    } else if (gameId === 'qxc') {
      const isBack = /后区/.test(joined);
      areaKey = isBack ? 'back' : 'front';
      range = isBack ? [0, 14] : [0, 9];
      pickCount = isBack ? 1 : 6;
    } else {
      areaKey = 'main';
      range = (rng.main) || [1, 33];
      pickCount = { qlc: 7, kl8: 20, fc3d: 3, pl3: 3, pl5: 5 }[gameId] || 6;
    }

    /* ---- 走势分析字段：全部自动算 ---- */
    if (sec.fields) {
      const trend = calcTrendFields(gameId, areaKey, range[0], range[1], pickCount);

      // 先算出「推荐号」——奇偶/大小/012路 都要跟着它走
      const zoneSize = range[1] - range[0] + 1;
      const recCap = zoneSize <= 16 ? 6 : 10;
      const recN = Math.min(recCap, zoneSize);
      const recNums = recommendNumbers(gameId, areaKey, recN, range[0], range[1]);

      // 推荐号的衍生指标
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
  return out;
}
