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

  /* 【频率特征】号码池排序也走同一套分数（全局频率 + 近 100 期冷热 + 遗漏回补），
     于是 20/15/10/3/1 码的档位 = 热度从高到低，和图上推荐号同源。 */
  const feats = freqFeatures(gameId, areaKey, from, to);
  candidate.sort((a, b) => ((freqScore(feats, b) - freqScore(feats, a)) || (a - b)));

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
   5.5 九转连环图 · 用户新版【用户原话逐字照抄，函数名/常量名不改】
   ------------------------------------------------------------
   用户给的原话（原样落地，函数名一字不改）：
     createJiuZhuan(lastNums, type)  ·  getNumberRoot(num)
     calcOffsetByLastLottery(list)   ·  createLuoshu9Grid(offset)
     getCurrentLuoshu(list)          ·  createNineChartPack(lastNums, type)
     BASE_LUOSHU（基准洛书，只读）

   ⚠️ 这版的口径（要改之前先读 5.5.0 的几何表）：
     · 九转 = 【同心圆环 × 米字轴】的交点，几何【两个彩种完全一样】：
         双色球 4 圈 × 8 轴 = 32 交点 + 中心 1 个号码位 = 33 位 → 01~33 全铺满
         大乐透 4 圈 × 8 轴 = 32 交点 + 中心 1 个号码位 = 33 位，
                放不下的 34、35 放到【中心旁边的小字球】side 里 → 01~35 全铺满
       每个交点【都有号码】，不再有 num:null 的空点；
       上期开奖号【所在的那个点】标 isHit:true（深色），其余号码是浅色。
       —— 也就是「全部号码都在，只是有深有浅、开奖的有标记」。
     · 中心【固定】：双色球 17 / 大乐透 18（见 NINE_CHART_BASE）。
       两个彩种的这个中心值自己都占一个号码位（17 ∈ 01~33 / 18 ∈ 01~35），
       所以既固定又不漏号。
     · getNumberRoot 【没有】0 -> 5 的特判：0 就是 0。

   数据来源（NINE_CHART_BASE，用户原名 nineChartBase）：
     ssqCenter / dltCenter 从配置读；圈数 / 轴数 / 号码范围从
     JIUZHUAN_GEOMETRY（5.5.0）读 —— 两彩种同几何，中心位固定占号，
     一个号不漏。
   ============================================================ */

/* ------------------------------------------------------------
   九转连环图 + 洛书九宫 的基准配置
   ------------------------------------------------------------
   用户原名「nineChartBase」，下面是用户给的 JSON 原样：

   {
     "nineChartBase":{
       "desc":"九转连环图+洛书九宫，输入上期开奖号，每期自动生成不同图表数据，仅娱乐",
       "baseLuoshu":[[4,9,2],[3,5,7],[8,1,6]],
       "jiuzhuan":{
         "ssqCenter":17,
         "dltCenter":18,
         "ringCount":4,
         "axisCount":8
       }
     }
   }

   ⚠️ 这份配置是【唯一来源】：BASE_LUOSHU 从 baseLuoshu 读，
      createJiuZhuan 的中心值从 jiuzhuan 读 —— 改配置即生效。
      （圈数 / 轴数见 5.5.0 的 JIUZHUAN_GEOMETRY：要装下 33 / 35 个号，
        不能所有彩种都用 4 × 8。）
   ⚠️ 仍然是【只读】：createLuoshu9Grid / 九宫矩阵一律先克隆再改。
   ⚠️ desc 里的「仅娱乐」在页面上要看得见：render.js 的九转/九宫两个
      区块会把它当图注印出来（和足球亚指那块同一个口径）。
   ------------------------------------------------------------ */
const NINE_CHART_BASE = {
  desc: '九转连环图+洛书九宫，输入上期开奖号，每期自动生成不同图表数据，仅娱乐',
  baseLuoshu: [
    [4,9,2],
    [3,5,7],
    [8,1,6]
  ],
  jiuzhuan: {
    ssqCenter: 17,
    dltCenter: 18,
    ringCount: 4,
    axisCount: 8
  }
};

/* ------------------------------------------------------------
   5.5.0 九转连环 · 几何表（【双色球 / 大乐透完全一致】4 圈 × 8 轴）
   ------------------------------------------------------------
   用户原话：「九转图需要分散4个圈」「每一个号码都在 只是有深浅开奖的有标记」
             「大乐透双色球都填满不要漏掉的号码」
             「大乐透也要按照双色球九转图一样，只是号码不同逻辑都相同」

   两彩种【同一套几何】，逐字一致：
     彩种      圈 × 轴      交点数   中心            中心旁小字   号码位合计   覆盖号码
     ssq      4 × 8 = 32    32       占 1 位（=17）   无          33          01~33 一个不漏
     dlt      4 × 8 = 32    32       占 1 位（=18）   34、35      33 + 2      01~35 一个不漏
     其它     4 × 8 = 32    32       装饰位           无          32          01~32 一个不漏

   【中心冲突怎么解的】
     模板里中心是固定值（配置 ssqCenter = 17 / dltCenter = 18），而这个值本身
     就是号码范围内的一个号 → 让「中心这一格也当一个号码位」，
     固定值没有被改掉，号码也刚好各出现一次（dlt 正好因此从 34 个环上号
     变成 33 位：32 交点 + 中心；剩下的 34、35 走 side）。
     唯一的副作用：开奖号里出现中心值时，那个「命中」亮点落在中心而不是环上
     （命中总数不会少）。

   【大乐透 34 / 35 放哪】
     4 圈 × 8 轴只有 32 个交点、加上中心 1 位 = 33 位，而大乐透有 35 个号，
     硬塞就必然漏号。所以 32 个交点放 01~33（跳过中心值 18），
     中心放 18，剩下的 34、35 作为【中心旁边的小字球】放 side：
     返回结构里的 jiuZhuan.side = [34,35]，铺字段成 cir_side = "34,35"，
     render.js 画成中心下方的一排小字球（双色球 side 为空，不画）。
     这样几何和双色球完全一样，01~35 也一个不漏。

   【号码怎么铺】（用户说的「分散4个圈」）
     从第 1 圈（最内圈）开始，按轴 1→轴 N 顺时针依次放，
     铺满一圈再铺下一圈；所以每个圈里的号数一样多，不会全挤在第 1 圈。
   ------------------------------------------------------------ */
const JIUZHUAN_GEOMETRY = {
  /* 两彩种同几何：ringCount=4 / axisCount=8 —— 改这个就是改「和双色球一样」 */
  ssq:     { ringCount: 4, axisCount: 8, min: 1,  max: 33, centerHoldsNumber: true, sideCount: 0, sideMax: 0  },
  dlt:     { ringCount: 4, axisCount: 8, min: 1,  max: 35, centerHoldsNumber: true, sideCount: 2, sideMax: 35 },
  /* 目前只有双色球 / 大乐透有九转图位；其它彩种按 4 圈 × 8 轴兜底 */
  default: { ringCount: 4, axisCount: 8, min: 1,  max: 32, centerHoldsNumber: false, sideCount: 0, sideMax: 0 }
};

/** 取某个彩种的九转几何（type: ssq / dlt / 其它） */
function jiuZhuanGeometry(type) {
  return JIUZHUAN_GEOMETRY[type] || JIUZHUAN_GEOMETRY.default;
}

/* ------------------------------------------------------------
   5.5.1 九转连环图生成【用户原话原样 + 全号铺满】
   ------------------------------------------------------------ */

/**
 * 九转连环图生成
 *   · 每个交点都有号码（不再有 num:null 的空点）
 *   · 上期开奖号【所在的那个点】标 isHit:true（其余号码低亮），
 *     不是像以前那样「把开奖号填进前 N 个空位」
 * @param {number[]} lastNums 上期开奖号码
 * @param {string} type 双色球ssq / 大乐透dlt
 * @returns {object} 九转点位、圆环、轴信息，用于绘图渲染
 */
function createJiuZhuan(lastNums, type = "ssq"){
  /* 中心值：ssq / dlt 各读各的（以前这里写死 17 / 18，现在统一从配置读） */
  const cfg = NINE_CHART_BASE.jiuzhuan;
  const geo = jiuZhuanGeometry(type);
  const centerVal = type === "dlt" ? cfg.dltCenter : cfg.ssqCenter;

  /* 圈数 / 轴数【按彩种】取（见 5.5.0 的几何表）。
     配置里的 ringCount / axisCount 仍然保留，作为双色球口径的说明。 */
  const ringCount = geo.ringCount;
  const axisCount = geo.axisCount;

  /* 同心圆环
     · radius 仍然是 1..ringCount 的序号（环的序号，不是像素半径）
     · sum: 68 —— 用户给的代码里每个环都带这个值，配置里没有它，所以
       这里保留字面量 68（见下面 ringSum 的说明），并且可以由
       NINE_CHART_BASE.jiuzhuan.ringSum 覆盖。 */
  const ringSum = Number.isFinite(cfg.ringSum) ? cfg.ringSum : 68;
  const rings = [];
  for(let i = 1; i <= ringCount; i++){
    rings.push({id:i, radius:i, sum:ringSum});
  }

  /* 米字轴：角度 = i × (360 / axisCount)。
     8 轴时就是 0/45/90/…/315，45° 一个（和以前完全一样）；
     7 轴时是 360/7 ≈ 51.43° 一个。轴名沿用用户写法「轴1…轴N」。 */
  const axisList = [];
  for(let i = 0; i < axisCount; i++){
    axisList.push({name:"轴" + (i + 1), angle: i * (360 / axisCount)});
  }

  /* 本彩种的【全部号码】：双色球 01~33、大乐透 01~35，一个都不能漏。 */
  const allNums = [];
  for(let n = geo.min; n <= geo.max; n++) allNums.push(n);

  /* 中心算不算一个号码位：
     两个彩种的中心值都在号码范围内（17 ∈ 01~33 / 18 ∈ 01~35）→ 都占位，
     所以几何不同、口径完全相同：中心钉死配置值，其余号码铺满 32 个交点。 */
  const centerHoldsNumber = !!geo.centerHoldsNumber && allNums.indexOf(centerVal) >= 0;
  const ringNums = centerHoldsNumber
    ? allNums.filter((n) => n !== centerVal)
    : allNums.slice();

  // 全部交点（圈 × 轴）
  const allPoints = [];
  rings.forEach(ring=>{
    axisList.forEach(axis=>{
      allPoints.push({
        ringId: ring.id,
        axisName: axis.name,
        angle: axis.angle,
        radius: ring.radius,
        num: null,
        isHit: false
      })
    })
  })

  /* 号码铺满所有交点：圈优先（第 1 圈最内圈开始），一圈一圈往外铺。
     位数多于交点数的部分（大乐透第 33、34 个）留给下面的 side 小字球，
     所以「铺不满交点」这种情况不会发生（32 个交点永远都有号）。 */
  allPoints.forEach((p, i) => {
    if (i < ringNums.length) p.num = ringNums[i];
  });

  /* 中心旁边的小字球（side）：中心 + 32 个交点还装不下的号。
     大乐透 = [34, 35]（01~35 里减掉铺进 32 个交点的、再减掉中心的 18）；
     双色球 = []（33 个位刚好装下 01~33，不画小字球）。
     这就是「几何和双色球完全一样、号码还一个不漏」的解法。
     写法：直接从【已经铺到交点上的号码】里筛，谁没上交点谁进小字球 ——
     不用自己遍历号码范围，也就不会因为遍历顺序写错而漏号。 */
  const onRing = Object.create(null);
  allPoints.forEach((p) => { if (p.num !== null && p.num !== undefined) onRing[p.num] = true; });
  const sideNums = [];
  if (centerHoldsNumber && Number.isFinite(geo.sideCount) && geo.sideCount > 0) {
    for (let i = 0; i < allNums.length && sideNums.length < geo.sideCount; i++) {
      const n = allNums[i];
      if (n === centerVal) continue;
      if (!onRing[n]) sideNums.push(n);
    }
  }

  /* 上期开奖号 → 点亮对应点位的「命中」标记：
     号码位置是固定的（保证不漏号），开奖号只决定哪几个点是深色。 */
  const hitSet = Object.create(null);
  (Array.isArray(lastNums) ? lastNums : []).forEach((n) => { hitSet[Number(n)] = true; });
  let hitCount = 0;
  allPoints.forEach((p) => {
    if (p.num !== null && hitSet[p.num]) { p.isHit = true; hitCount++; }
  });
  /* 中心本身是号码位时（双色球 17 / 大乐透 18），它也要参与命中统计 */
  const centerHit = centerHoldsNumber && !!hitSet[centerVal];
  if (centerHit) hitCount++;
  /* 小字球（大乐透 34 / 35）也是号码位，命中一样要算进总数 */
  const sideHitCount = sideNums.filter((n) => hitSet[n]).length;
  hitCount += sideHitCount;

  return {
    center: centerVal,
    centerHoldsNumber: centerHoldsNumber,   // 中心是否占一个号码位（两彩种都 true）
    centerHit: centerHit,                   // 中心那个号是不是上期开奖号
    ringCount: ringCount,
    axisCount: axisCount,
    nums: allNums,                          // 铺进图里的全部号码
    hitCount: hitCount,                     // 命中总数（= 上期开奖号个数，含中心/小字球）
    side: sideNums,                         // 中心旁边的小字球（dlt = 34,35；ssq = []）
    sideHitCount: sideHitCount,             // 其中命中的个数
    rings,
    axisList,
    points: allPoints
  }
}

/* ------------------------------------------------------------
   5.5.2 洛书九宫 · 每期自动偏移【用户原话原样】
   ------------------------------------------------------------ */

// 原始基准洛书【只读，不能修改】
// 数据来源 = NINE_CHART_BASE.baseLuoshu（值仍然是 4 9 2 / 3 5 7 / 8 1 6）
const BASE_LUOSHU = NINE_CHART_BASE.baseLuoshu;

/**
 * 号码求数根：号码 -> 宫号
 * @param {number} num
 */
function getNumberRoot(num){
  let n = num;
  while(n >=10){
    let s = 0;
    while(n>0){
      s += n %10;
      n = Math.floor(n /10);
    }
    n = s;
  }
  return n;
}

/**
 * 根据上期开奖号，自动计算九宫偏移量 offset
 * @param {number[]} lastNumList
 * @returns {number} offset 1~9
 */
function calcOffsetByLastLottery(lastNumList){
  const countMap = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
  lastNumList.forEach(num=>{
    const gong = getNumberRoot(num);
    countMap[gong]++;
  });
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

/**
 * 生成本期全新九宫盘面（全部数字偏移，每期不同）
 * @param {number} offset
 */
function createLuoshu9Grid(offset){
  const grid = JSON.parse(JSON.stringify(BASE_LUOSHU));
  for(let i=0;i<3;i++){
    for(let j=0;j<3;j++){
      let val = grid[i][j] + offset;
      if(val >9) val -=9;
      if(val ===0) val =9;
      grid[i][j] = val;
    }
  }
  return grid;
}

/**
 * 九宫综合入口函数：输入上期号码，直接输出本期九宫盘面
 * @param {number[]} lastNumList
 */
function getCurrentLuoshu(lastNumList){
  const offset = calcOffsetByLastLottery(lastNumList);
  const grid = createLuoshu9Grid(offset);
  return {
    offset,
    grid
  }
}

/* ------------------------------------------------------------
   5.5.3 统一入口：一次性生成九转+九宫两套数据【用户原话原样】
   ------------------------------------------------------------ */

/**
 * 九转+九宫一次性生成，每期调用一次
 * @param {number[]} lastNums 上期开奖号码数组
 * @param {string} type ssq双色球 / dlt大乐透
 */
function createNineChartPack(lastNums, type="ssq"){
  const jiuZhuanData = createJiuZhuan(lastNums, type);
  const luoshuData = getCurrentLuoshu(lastNums);
  return {
    jiuZhuan: jiuZhuanData,
    luoshu: luoshuData
  }
}

/* ------------------------------------------------------------
   5.5.4 出图用的小工具【不是用户算法，只是把上面两套数据铺成字段】
   ------------------------------------------------------------ */

/**
 * 上期开奖号（九转 / 九宫用）
 *   双色球 -> 6 个红球（不带蓝球）；大乐透 -> 5 个前区号（不带后区）
 *   取不到就返回 []
 * @returns {number[]}
 */
function lastIssueNumsFor(gameId) {
  try {
    const hist = getHistory(gameId);
    if (!hist.length) return [];
    const areas = (hist[0] && hist[0].areas) || {};
    /* 【按区名找，不按彩种名写死】
       以前写的是 'dlt' -> front / 'ssq' -> red / 其它 -> main，
       七乐彩（main）碰巧对，七星彩（实际是 front + back）就永远取不到上期号。
       现在按「这个彩种的主区叫什么」逐级回退，新增彩种不用再改这里。 */
    const key = ['front', 'red', 'main'].find((k) => Array.isArray(areas[k]) && areas[k].length);
    const arr = (key ? areas[key] : []).filter((n) => Number.isInteger(n));
    return arr.slice(0, 6);
  } catch (e) { return []; }
}

/** 号码 -> 定宽两位数（0 也占两位，保证一个点位固定 2 个字符） */
function cirPad2(n) {
  return (Number(n) === 0 ? '0' : String(n)).padStart(2, '0');
}

/**
 * 把 createNineChartPack 的结果压成一行字段值（定点解码，长度固定）
 *   每个点位 3 个字符：第 1 位 H = 命中（上期开奖号）/ - = 未开出，
 *                      后 2 位是号码，「--」= 该交点没有号码（正常情况下不会出现）
 *   例：'H03-04-05-06…'（32 个点位 = 96 个字符；两彩种同几何，都是 96）
 *   ⚠️ 编解码必须是同一份口径：render.js 优先调 decodeCirPoints，
 *      取不到才用等价的兜底解码（见 render.js 的 circle()）。
 *   ⚠️ 中心旁边的小字球（大乐透 34 / 35）【不进这一串】——这一串只描述
 *      圈 × 轴的交点；小字球单独走 cir_side 字段（见 autoFillWuxing）。
 *   为什么不存 JSON：这一串会进 saved-tickets.js 存档，定宽最好解码也好排查。
 * @returns {{str:string, hitCount:number, numCount:number}} hitCount 只数【环上】的命中
 */
function encodeCirPoints(jz) {
  const pts = (jz && Array.isArray(jz.points)) ? jz.points : [];
  let str = '';
  let hitCount = 0;
  let numCount = 0;
  pts.forEach((p) => {
    const head = p.isHit ? 'H' : '-';
    let tail = '--';
    if (p.num !== null && p.num !== undefined) {
      tail = cirPad2(p.num);
      numCount++;
    }
    if (p.isHit) hitCount++;
    str += head + tail;
  });
  return { str, hitCount, numCount };
}

/** encodeCirPoints 的逆运算（render.js 用；取不到点位就返回 []） */
function decodeCirPoints(str) {
  const s = String(str || '');
  const out = [];
  /* 每个点位 3 个字符：H/-(命中) + 两位号码（'--' = 该点没有号码） */
  for (let i = 0; i + 2 < s.length; i += 3) {
    const head = s[i];
    const body = s.slice(i + 1, i + 3);
    const hit = head === 'H';
    const empty = body === '--';
    out.push({ isHit: hit, num: empty ? null : parseInt(body, 10) });
  }
  return out;
}

/** 九宫中宫那几个宫位对应的号码（号码范围内「数根 == 中宫」的号） */
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

  /* ---- 五行号码 ---- */
  const from = 1;
  const to = gameId === 'dlt' ? 35 : 33;
  const areaKey = gameId === 'dlt' ? 'front' : 'red';
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
  const yyPickN = areaPickCount(gameId, areaKey, gameId === 'dlt' ? 5 : 6);
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
  const pool = recommendNumbers(gameId, areaKey, 16, from, to);
  const backKey = gameId === 'dlt' ? 'back' : 'blue';
  const backRange = gameId === 'dlt' ? [1, 12] : [1, 16];
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

  /* ---- 九转连环（【全号铺满】版：4 圈 × 8 轴，双色球/大乐透几何完全一样） ----
     用户原话：「九转连环图+洛书九宫，输入上期开奖号，每期自动生成不同图表数据」
              「九转图需要分散4个圈」「每一个号码都在 只是有深浅开奖的有标记」
              「大乐透双色球都填满不要漏掉的号码」
              「大乐透也要按照双色球九转图一样，只是号码不同逻辑都相同」。
     数据【一次性】从统一入口拿：createNineChartPack(last, type) → {jiuZhuan, luoshu}。
       · 几何：两彩种都是 4 圈 × 8 轴 = 32 交点 + 中心 1 位，圈/轴/每圈点数逐字一致
       · 每个交点都有号码；上期开奖号【所在的那个点】标 isHit:true（深色），
         其余号码是浅色 —— 「有深浅」就是这么来的（以前是「只画开奖号、其余空白」）
       · 中心：双色球固定 17 / 大乐透固定 18，两个中心值都占一个号码位
       · 大乐透多出来的 34、35：4×8 只有 33 个位，装不下 35 个号 →
         放到【中心旁边的小字球】jiuZhuan.side = [34,35] → cir_side = '34,35'
         （双色球 side 为空串，不画小字球）
     铺成字段（render.js 只读这几个，不再自己算几何）：
       cir_points     环上全部交点的定宽串（3 字符/点，H 或 - 开头）
       cir_side       中心旁边的小字球，逗号分隔（大乐透 '34,35'；双色球空串）
       cir_side_hit   小字球里命中的个数（0~2）
       cir_center     中心号（17 / 18）
       cir_center_pos 中心是不是号码位（1/0，两彩种都是 1）
       cir_center_hit 中心那个号是不是上期开奖号（1/0）
       cir_rings      圈数（两彩种都是 4）
       cir_axes       轴数（两彩种都是 8）
       cir_hit        命中总数（= 上期开奖号个数，含中心和小字球）
       cir_ring_hit   其中落在环上的命中个数
       cir_num_count  环上有号码的点数（= 圈数 × 轴数 = 32）
       cir_axis       米字轴条数（= cir_axes）
       cir_source     上期开奖号原文，给图注/排查看
     旧键 cir_num_* / cir_rotate 是更早两版留下的，这一版不再产生；
     render.js 里仍然保留 cir_num_* 的兜底读取，老存档不会画成空白。 */
  const cirLast = lastIssueNumsFor(gameId);
  const cirType = (gameId === 'dlt') ? 'dlt' : 'ssq';
  const pack = createNineChartPack(cirLast, cirType);
  const jz = pack.jiuZhuan;
  const enc = encodeCirPoints(jz);

  out.cir_points = enc.str;
  out.cir_side = (Array.isArray(jz.side) ? jz.side : []).map(pad2).join(',');
  out.cir_side_hit = String(jz.sideHitCount || 0);
  out.cir_center = pad2(jz.center);
  out.cir_center_pos = jz.centerHoldsNumber ? '1' : '0';
  out.cir_center_hit = jz.centerHit ? '1' : '0';
  out.cir_rings = String(jz.ringCount);
  out.cir_axes = String(jz.axisCount);
  out.cir_hit = String(jz.hitCount);
  out.cir_ring_hit = String(enc.hitCount);
  out.cir_num_count = String(enc.numCount);
  out.cir_axis = String(jz.axisList.length);
  out.cir_source = cirLast.length ? cirLast.map(pad2).join(' ') : '—';

  /* 号码池：仍旧按原来的池子算出来（图一、绕胆图共用同一套），本图只报个数 */
  /* __CORE_POOL__ 用户 2026-10-18：推荐号码池 = 核心算法的 20 码
     （交叉相加减 → 减法杀号 → 金/银胆尾 → 大乐透跨彩种绝杀尾 → 补足 20 码，
      基线自动取【最新已开奖三期】；模板版式一个字不动，只换号码来源）
     ⚠️ 只对双色球/大乐透生效；算不出来 / 其它彩种 → 退回原来的 recommendNumbers，
        保证页面永远有号，绝不空白。 */
  let cirPool = null;
  if ((gameId === 'ssq' || gameId === 'dlt') && typeof require === 'function') {
    try {
      const cp = require('./core-pool.js').corePoolFor(gameId);
      if (cp && Array.isArray(cp.pool20) && cp.pool20.length) {
        cirPool = cp.pool20.filter((n) => n >= from && n <= to);
      }
    } catch (e) { cirPool = null; }
  }
  if (!cirPool || !cirPool.length) {
    cirPool = recommendNumbers(gameId, areaKey, Math.min(20, to - from + 1), from, to);
  }
  out.cir_pool = cirPool.map(pad2).join(' ');

  /* ---- 九宫（洛书 + 每期自动偏移：上期开奖号 → offset → 本期盘面） ----
     用统一入口吐出来的那套 luoshu（即用户代码里的 getCurrentLuoshu）：
     BASE_LUOSHU 只读，createLuoshu9Grid 内部克隆后再平移，中宫不再固定是 5。 */
  const jgGrid = pack.luoshu.grid;
  const jgCenterPalace = jgGrid[1][1];
  out.jg_offset = String(pack.luoshu.offset);
  out.jg_matrix = jgGrid.map((row) => row.join('')).join(',');
  out.jg_center = String(jgCenterPalace);
  out.jg_zhong = `中宫${jgCenterPalace}（数根${jgCenterPalace}为旺）`;
  out.jg_guan = jiugongGuanNums(gameId, jgCenterPalace, from, to)
    .slice(0, 3).map(pad2).join(' ');

  return out;
}

/* 【补零规则】用户要求：「不要两个 0，所有的 0 都是一位数 0」
       所以 0 显示成 '0'；其它个位数仍然补零（1 -> '01'、4 -> '04'）。 */
  const pad2 = (n) => (Number(n) === 0 ? '0' : String(n).padStart(2, '0'));
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

/* ============================================================
   ★ 频率特征引擎（用户 2026-10-20：「把这个思路学习到大乐透和双色球
     规则里面，后续结合这些思路出号」）
   ------------------------------------------------------------
   用户给的原始思路（Python）：
     · 全局频率：全部历史里每个号各出现多少次
     · 冷热号   ：只统计【最近 window 期】（默认 100）的出现次数
   本引擎在此基础上再加一项同类特征（遗漏回补），然后合成一个 0~100 的热度分：
     · rR = 近 window 期出现率 ÷ 期望出现率（>1 = 近期热，<1 = 近期冷）
     · rG = 全局出现率   ÷ 期望出现率（长期热度）
     · omit = 距上次出现的期数 ÷ 平均间隔（越大 = 越"该回补"）
     score = 100 × ( 0.45·clamp(rR/2) + 0.30·clamp(rG/2) + 0.25·clamp(omit/1.6) )
   ⚠️ 用「出现率 ÷ 期望」而不是裸次数：不同彩种球数不同、历史长短不同也能直接比。
   分层：全部号按分数三等分 → 热 / 温 / 冷。
   出号：n ≤ 8 时按冷热配比抽（6 个 = 热2 温2 冷2；5 个 = 热2 温2 冷1；
         2 个 = 热1 冷1；1 个 = 热1），n 更大时按分数取前 n。
   ⚠️ 只用历史数据、不用随机数 —— 同一份历史永远出同一批号（可复现、可验收）。
   ============================================================ */
const FREQ_WINDOW = 100;        /* 用户 Python 里的 window 默认值 */
const FREQ_GLOBAL_CAP = 500;    /* 全局频率最多统计最近 500 期 */

/** 某区在连续 periods 期内的出现次数统计 */
function freqCounts(history, areaKey, periods) {
  const map = new Map();
  let span = 0, balls = 0;
  for (let i = 0; i < history.length && i < periods; i++) {
    const a = (history[i] && history[i].areas && history[i].areas[areaKey]) || [];
    if (!a.length) continue;
    span++;
    balls += a.length;
    a.forEach((n) => map.set(n, (map.get(n) || 0) + 1));
  }
  return { map, span, balls, perDraw: span ? balls / span : 0 };
}

const _freqCache = new Map();
/** 计算某彩种某区的频率特征（按 彩种|区|范围|历史长度 缓存） */
function freqFeatures(gameId, areaKey, from, to) {
  const hist = (typeof getHistory === 'function' ? getHistory(gameId) : []) || [];
  const key = [gameId, areaKey, from, to, hist.length].join('|');
  const hit = _freqCache.get(key);
  if (hit) return hit;

  const size = Math.max(1, to - from + 1);
  const g = freqCounts(hist, areaKey, FREQ_GLOBAL_CAP);
  const r = freqCounts(hist, areaKey, FREQ_WINDOW);
  const expG = g.span ? g.perDraw / size : 0;
  const expR = r.span ? r.perDraw / size : 0;
  const meanGap = expG ? 1 / expG : 1;

  /* 遗漏：从最新一期（下标 0）往前数，第一次出现是第几期（本期开出 = 0） */
  const omit = new Map();
  for (let n = from; n <= to; n++) omit.set(n, Math.min(hist.length, 60));
  hist.forEach((d, idx) => {
    const a = (d && d.areas && d.areas[areaKey]) || [];
    a.forEach((n) => { if (n >= from && n <= to && omit.get(n) > idx) omit.set(n, idx); });
  });

  const raw = new Map();
  for (let n = from; n <= to; n++) {
    const rateG = g.span ? (g.map.get(n) || 0) / g.span : 0;
    const rateR = r.span ? (r.map.get(n) || 0) / r.span : 0;
    const rG = expG ? rateG / expG : 1;
    const rR = expR ? rateR / expR : 1;
    const omitN = Math.min((omit.get(n) || 0) / meanGap, 1.6) / 1.6;
    const sc = 100 * (0.45 * (Math.min(Math.max(rR, 0), 2) / 2)
                    + 0.30 * (Math.min(Math.max(rG, 0), 2) / 2)
                    + 0.25 * omitN);
    raw.set(n, { score: sc, rR: rR, rG: rG, omit: omit.get(n) || 0 });
  }

  /* 分层：按分数排序，前 1/3 热、后 1/3 冷、中间温 */
  const order = [];
  for (let n = from; n <= to; n++) order.push(n);
  order.sort((a, b) => ((raw.get(b).score - raw.get(a).score) || (a - b)));
  const third = Math.max(1, Math.floor(order.length / 3));
  const tier = new Map();
  order.forEach((n, i) => {
    tier.set(n, i < third ? 'hot' : (i >= order.length - third ? 'cold' : 'warm'));
  });

  const feats = {
    gameId: gameId, areaKey: areaKey, from: from, to: to,
    window: FREQ_WINDOW, span: g.span, recentSpan: r.span,
    global: g.map, recent: r.map, omit: omit, detail: raw, tier: tier, order: order,
    hot: order.filter((n) => tier.get(n) === 'hot'),
    warm: order.filter((n) => tier.get(n) === 'warm'),
    cold: order.filter((n) => tier.get(n) === 'cold')
  };
  _freqCache.set(key, feats);
  return feats;
}

/** 某个号的热度分（没有特征时 0） */
function freqScore(feats, n) {
  const x = feats && feats.detail && feats.detail.get(n);
  return x ? x.score : 0;
}

/** 按热度从高到低排（同分按号码小） */
function freqRank(nums, feats) {
  return nums.slice().sort((a, b) => ((freqScore(feats, b) - freqScore(feats, a)) || (a - b)));
}

/**
 * 按频率特征出号：n ≤ 8 走「冷热配比」，n 更大走「热度前 n」
 * @param {number[]} nums  候选号（号码池 / 全区）
 * @param {object} feats   freqFeatures() 的结果
 * @param {number} n       要几个
 */
function freqPick(nums, feats, n) {
  const want = Math.min(n, nums.length);
  if (!want) return [];
  const ranked = freqRank(nums, feats);
  if (want > 8) return ranked.slice(0, want);

  const quotaFor = (k) => {
    if (k <= 1) return { hot: 1, warm: 0, cold: 0 };
    if (k === 2) return { hot: 1, warm: 0, cold: 1 };   /* 一个热 + 一个冷回补 */
    if (k === 3) return { hot: 1, warm: 1, cold: 1 };
    if (k === 4) return { hot: 2, warm: 1, cold: 1 };
    if (k <= 8) return { hot: 2, warm: 2, cold: k - 4 };
    return { hot: 2, warm: 2, cold: 4 };
  };
  const q = quotaFor(want);
  const take = (tierName, cnt) => (feats.order || [])
    .filter((x) => nums.indexOf(x) >= 0 && feats.tier.get(x) === tierName)
    .slice(0, cnt);

  const picked = [].concat(take('hot', q.hot), take('warm', q.warm), take('cold', q.cold));
  /* 某一层在候选里不够 → 按热度补齐（永远给满 want 个，且不重复） */
  if (picked.length < want) {
    for (const n2 of ranked) {
      if (picked.length >= want) break;
      if (picked.indexOf(n2) < 0) picked.push(n2);
    }
  }
  return picked.slice(0, want);
}


/* ============================================================
   ★ 号码池 · 三源融合（用户 2026-10-20：「全部都留 一起结合算了出号」）
   ------------------------------------------------------------
   候选来源（三套全留）：
     ① 资料号码（data-store.js 的 materialRulesFor）—— 最高优先，永远排最前
     ② 核心算法 20 码（core-algo.js / core-pool.js，用户自己写的那一套：
        交叉相加减 → 减法杀号 → 金胆尾/银胆尾 → 大乐透绝杀尾 → 补足 20 码）
     ③ 专家号码池（expert-pool.js，按专家共识度 1 - i/(n-1) 给分）
   排序分（②③ 之间比大小，① 不参与比）：
     score = 0.50 × 热度分（全局频率 + 近 100 期冷热 + 遗漏回补，归一化到 0~1）
           + 0.30 × 专家共识度
           + 0.20 × 是否命中核心算法 20 码
   20/15/10/3/1 档 = 按这个顺序往下截 ⇒ 天然满足「小档 ⊆ 大档」，
   不会再出现「15 码里有 04 05 07，20 码里却没有」这种两张来源打架。
   ⚠️ 浏览器里没有 require（拿不到 core-pool）时，②自动缺省 → 退化成「资料 + 专家池 + 热度」，
      不会报错、也不会出空池。
   ============================================================ */
function poolRankBlend(gameId, areaKey, from, to, want) {
  const n = Math.max(1, Math.min(want || 1, to - from + 1));
  const seen = new Set();
  const uni = [];
  const push = (x) => {
    if (Number.isInteger(x) && x >= from && x <= to && !seen.has(x)) { seen.add(x); uni.push(x); }
  };

  /* ① 资料号码（+ 资料杀号剔除） */
  let mat = { pick: [], kill: new Set() };
  try { mat = materialFirstOf(gameId, areaKey, from, to); } catch (e) { mat = { pick: [], kill: new Set() }; }
  const matList = (mat.pick || []).filter((x) => !(mat.kill && mat.kill.has(x)));
  matList.forEach(push);

  /* ② 核心算法 20 码（用户写的那套） */
  let core = [];
  try {
    if ((gameId === 'ssq' || gameId === 'dlt') && areaKey !== 'blue' && areaKey !== 'back'
        && typeof require === 'function') {
      const cp = require('./core-pool.js').corePoolFor(gameId);
      if (cp && Array.isArray(cp.pool20)) {
        core = cp.pool20.filter((x) => Number.isInteger(x) && x >= from && x <= to);
      }
    }
  } catch (e) { core = []; }
  core.forEach(push);

  /* ③ 专家号码池（共识度顺序） */
  let exp = [];
  try { exp = (expertPoolOf(gameId, areaKey) || []).filter((x) => x >= from && x <= to); } catch (e) { exp = []; }
  exp.forEach(push);

  /* ④ 还是不够（比如资料/专家/核心都没有）→ 用全区补，保证能出满 */
  for (let i = from; i <= to && uni.length < n; i++) {
    if (mat.kill && mat.kill.has(i)) continue;
    push(i);
  }

  const feats = freqFeatures(gameId, areaKey, from, to);
  let maxHeat = 0;
  uni.forEach((x) => { const s = freqScore(feats, x); if (s > maxHeat) maxHeat = s; });

  const expIdx = new Map(exp.map((x, i) => [x, i]));
  const expDen = Math.max(1, exp.length - 1);
  const matSet = new Set(matList);
  const coreSet = new Set(core);

  const ranked = uni.map((x) => {
    if (matSet.has(x)) return { n: x, s: 10 };            /* 资料号永远第一 */
    const heat = maxHeat > 0 ? freqScore(feats, x) / maxHeat : 0;
    const cons = expIdx.has(x) ? (1 - expIdx.get(x) / expDen) : 0;
    const coreHit = coreSet.has(x) ? 1 : 0;
    return { n: x, s: 0.50 * heat + 0.30 * cons + 0.20 * coreHit };
  }).sort((a, b) => ((b.s - a.s) || (a.n - b.n))).map((o) => o.n);

  return ranked.slice(0, n);
}

/** 直接取热度最高的 n 个号（升序返回，给「主推球」这类单号用） */
function freqTop(gameId, areaKey, from, to, n) {
  const feats = freqFeatures(gameId, areaKey, from, to);
  const all = [];
  for (let i = from; i <= to; i++) all.push(i);
  return freqRank(all, feats).slice(0, Math.max(1, n || 1)).sort((a, b) => a - b);
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
  /* __CORE_POOL2__ 用户 2026-10-18：所有「推荐号码」统一出自核心算法
     （双色球/大乐透主区；交叉相加减→减法杀号→金银胆尾→大乐透绝杀尾→补足20码）
     · 这里是 recommendNumbers 的唯一入口 → 配图号池、五行、九转、绕胆全部跟着变 ✓
     · 算不出来 / 其它彩种 / 非主区 → 走原逻辑，绝不空白。 */
  if ((gameId === 'ssq' || gameId === 'dlt') &&
      (areaKey === 'main' || areaKey === 'red' || areaKey === 'front') &&
      typeof require === 'function') {
    try {
      /* 【三源融合】用户 2026-10-20：「全部都留 一起结合算了出号」——
         推荐号也从「融合后的 20 码」里挑（资料 ∪ 核心算法 20 码 ∪ 专家池，见 poolRankBlend），
         这样推荐号一定落在图上那行 20 码里，不会再出现「推荐号不在号码池里」。
         挑法仍是频率特征：n=6 → 热2 温2 冷2；大乐透 n=5 → 热2 温2 冷1。 */
      const f = poolRankBlend(gameId, areaKey, from, to, 20);
      if (f.length >= Math.min(n, 4)) {
        return freqPick(f, freqFeatures(gameId, areaKey, from, to), n).sort((a, b) => a - b);
      }
    } catch (e) { /* 掉回原逻辑 */ }
  }

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

  /* 【频率特征】原来的评分是「近 10 期 ×3 + 近 30 期 ×1」，
     现在统一换成频率特征分（全局频率 + 近 `FREQ_WINDOW` 期冷热 + 遗漏回补，见上面的引擎）。
     号码池档位用的也是同一套分数 —— 图上的「推荐号」和「号码池」不会各算各的。 */
  const feats = freqFeatures(gameId, areaKey, from, to);

  const list = [];
  for (let i = from; i <= to; i++) {
    list.push({ num: i, score: freqScore(feats, i) });
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

  /* 【频率特征】在「资料 > 专家池 > 全号」这条优先带里按冷热配比挑号：
       带子 = 专家池（没有池就是全号），配比 = 热2 温2 冷2（按 want 自动缩）。
     于是「蓝球推荐 / 大乐透后区 / 其它彩种」也是频率特征在起作用，
     而不是简单取排序后的前 want 个。 */
  const bandLen = pool.length
    ? Math.min(ordered.length, Math.max(pool.length, want))
    : ordered.length;
  const band = ordered.slice(0, bandLen).map((x) => x.num);
  const pickedFreq = freqPick(band, feats, want);
  const picked = (pickedFreq.length >= want)
    ? pickedFreq
    : pickedFreq.concat(band.filter((x) => pickedFreq.indexOf(x) < 0)).slice(0, want);

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
  /* __QXC_POS__ 用户 2026-10-18：七星彩 6 位推荐不能一样。
     原逻辑：从专家池旋转取 want 个 → 当【池大小 ≤ want】时旋转只改顺序不改集合，
     6 个位就完全一样了。改成：池比要取的个数多才用池，否则走按位频率（各位置天然不同）。 */
  if (pool.length > want) {
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

/* ---------- 和值 / 跨度：区间 = 【最窄的、能覆盖最近 10 期中 6 期的那个窗口】 ----------
   用户 2026-10-17 定的口径（方案 B）：
     · 区间要【窄】（宽了没参考价值，用户原话「和值 71~141 太宽」）；
     · 但也不能被实际开奖打脸 —— 要求覆盖最近 10 期里的【大多数（≥6 期）】。
   于是取「覆盖 6 期的最窄窗口」：既满足 ≥6 期，又是这类窗口里最窄的，
   不用再拍一个宽度上限（原来 hardMax=20 会让双色球/快乐8 直接盖不住）。 */
const TREND_RECENT = 10;      /* 看最近 10 期 */
const TREND_COVER = 6;        /* 至少覆盖 6 期 */

/** recent: 最近 10 期的取值（原始顺序）→ 返回覆盖 ≥6 期的最窄 [a,b] */
function narrowCoverRange(recent) {
  const s = (recent || []).filter((x) => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const k = Math.min(TREND_COVER, s.length);
  const mid = s[Math.floor(s.length / 2)];
  let best = null;
  for (let i = 0; i + k - 1 < s.length; i++) {
    const a = s[i], b = s[i + k - 1];
    const w = b - a;
    const off = Math.abs((a + b) / 2 - mid);
    if (!best || w < best.w || (w === best.w && off < best.off)) best = { a, b, w, off };
  }
  return best;
}

function calcSum(areas) {
  if (!areas || !areas.length) return '';
  const recent = areas.slice(0, TREND_RECENT).map((a) => a.reduce((x, y) => x + y, 0));
  const r = narrowCoverRange(recent);
  return r ? `${r.a}~${r.b}` : '';
}

function calcSpan(areas) {
  if (!areas || !areas.length) return '';
  const recent = areas.slice(0, TREND_RECENT).map((a) => Math.max(...a) - Math.min(...a));
  const r = narrowCoverRange(recent);
  return r ? `${r.a}~${r.b}` : '';
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
  /* 【去重】七星彩这种「按位」玩法，一期里同一个数字能在不同位上重复出现
     （例如 7 7 5 5 1 3），不过滤就会印出「01,07,07防3枚」这种自带重复的重复号。
     双色球/大乐透/七乐彩每期号码本身互不重复，去重对它们没有任何影响。 */
  const rep = [];
  areas[1].forEach((x) => { if (cur.has(x) && rep.indexOf(x) < 0) rep.push(x); });
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
      /* 【必须排除热号】七星彩这种彩种整区只有 0~9 十个号，池子一占满
         `coldDom` 就会退回 ALL（=池内），如果不排除热号，
         热号和冷号会挑出同一批号 → 违反 ①HOT∩COLD=∅ / ⑧COLD∩HOT=∅。
         所以这里无条件 .filter((n) => !hotSet.has(n))。 */
      let cold = consByFreq(gameId, areaKey, coldDom, false)
        .filter((n) => !hotSet.has(n)).slice(0, coldWant);
      if (coldCalcEmpty(cold, coldCur, hotSet)) {
        cold = coldCur.filter((n) => coldDomSet.has(n) && !hotSet.has(n)).slice(0, coldWant);
      }
      if (!cold.length) {
        /* 池外一个都挑不出来时（极小概率），退回全区最冷 —— 同样要排除热号 */
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
      /* 该字段「不能撞的号」：自己的池（或该位推荐）+ 图上所有推荐 / 定位推荐 / 胆拖 */
      const ban = new Set(domain || []);
      consUniq(roleKeys('rec').concat(roleKeys('posrec'))
        .reduce((a, m) => a.concat(numsOfKey(m)), []))
        .concat(danTuoNums)
        .forEach((n) => ban.add(n));
      /* 【硬性条件配套】福彩3D / 排列3 / 排列5前三位：定位推荐被约束成
         「两两不重复」（占掉 9 个号），杀号又必须「既不撞池子、也不撞任何一位推荐」
         —— 能挑的号必然凑不满 3 个。这时候宁缺毋滥：只给挑得到的号，
         绝不允许为了凑满 3 个去撞定位推荐（那就是自相矛盾的页面）。
         其它彩种（七星彩每位杀号等）保持原样：最后仍允许用池外号兜底。 */
      const STRICT = (gameId === 'fc3d' || gameId === 'pl3' || gameId === 'pl5');
      const badNow = cur.length !== want
        || (domSet && cur.some((n) => domSet.has(n)))
        || (STRICT && cur.some((n) => ban.has(n)))
        || cur.some((n) => n < from || n > to);
      if (!badNow) return;

      const outside = ALL.filter((n) => !domSet || !domSet.has(n));
      /* 【池子 = 全区 ⇒ 没有「池外号」可杀】
         七星彩前区（0~9）、福彩3D 组选（0~9）这类「候选 = 全部号码」的区，
         杀号只能从池内挑、挑哪个都撞池，所以给中性提示「无」。
         （这一条是既有行为，已随 qlc/qxc 回退一起恢复原样；
          它在图上不会变成破折号 —— render.js 只在【空串/null】时才画占位符。） */
      if (!outside.length) { out[k] = '无'; return; }
      /* ① 先保留原算法（按位杀 / 池内共识度最低）里「本来就合法」的号，
            这样七星彩每位杀号仍然各有各的号，不会全变成同一串；
         ② 不够再用「不在任何推荐/胆拖里」的池外号；
         ③ 再不够就用池外最冷的号（福彩3D/排列3/排列5 不再走 ③：宁缺毋滥）。 */
      let algo = [];
      try {
        if (role === 'poskill' && typeof positionKill === 'function') {
          algo = positionKill(gameId, roles[k].posIdx, want, from, to, HIST_PERIODS) || [];
        } else if (typeof autoKillNumbers === 'function') {
          algo = autoKillNumbers(gameId, areaKey, want, from, to, HIST_PERIODS) || [];
        }
      } catch (e) { algo = []; }
      const okNum = (n) => n >= from && n <= to
        && (!domSet || !domSet.has(n)) && (!STRICT || !ban.has(n));
      const algoOK = algo.filter(okNum);
      const preferred = consByFreq(gameId, areaKey, outside.filter(okNum), false);
      const fallback = STRICT ? [] : consByFreq(gameId, areaKey, outside, false);
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

/* ============================================================
   ★★★ 硬性条件：三位数字彩「直选」候选号必须避开豹子和组三 ★★★
   ------------------------------------------------------------
   用户原话：资料模板计入进去，直选的出号 少匹配一点豹子和组三。
             尽量百位 十位 个位是组六的情况，只有一组是组三的情况。
             这个是硬性条件给到 app。

   【2026-10-20 更新】用户要求「3D和排列三以及排列五定位都改成3位」——
     每位候选号由 2 个改成 3 个。此时「每位 3 号 + 定位 ⊆ 6码」必然 组三 ≥ 9
     （见下方数学：并集 ≤ 6 时 ab+ac+bc−abc ≥ 9−6 = 3），所以硬性条件收敛为：
       ① 每位正好 3 个号，且全部取自「6码可组选」；
       ② 豹子 = 0（三个位置不能有共同的号）；
       ③ 组三压到该约束下的最小值 9 注：
          百位取池内最想要的 3 个，十位取「池里剩下的」3 个（与百位互不相交、用满 6 码），
          个位再从池内按自己的偏好取 3 个 ⇒ ab = 0 ⇒ 组三 = 3·(ac+bc) = 9。
     原「每位 2 号 / 8 注全组六 / 组三 = 0」的口径已废弃，不要再改回去。

   适用：福彩3D(fc3d) / 排列3(pl3)，以及排列5(pl5)的【前三位】
        （排列5 前三位 = 排列3 的三位，口径见 positionRecommend）

   定义（用户口径）：
     组六 = 三个数字互不相同      如 1 5 8
     组三 = 有两个数字相同        如 3 3 7
     豹子 = 三个数字全都相同      如 5 5 5

   硬性：① 豹子 = 0 组  ② 组三 ≤ 1 组  ③ 组六 尽可能多

   【数学可行性 —— 穷举验证过，别再"硬编"其它做法】
     设三个位置候选集合 A / B / C（各 3 个号），记 ab=|A∩B| · ac=|A∩C| ·
     bc=|B∩C| · abc=|A∩B∩C|，则（按"哪两位相同"分三类，互不重叠）
       豹子 = abc
       组三 = 3·(ab + ac + bc − abc)
     ⇒ 组三【恒为 3 的倍数】⇒「只出 1 注组三」数学上不存在；
       「组三 ≤ 1」只能等于 0 ⇒ 三个位置两两不相交 ⇒ 9 个号互不相同。
       所以「组三 ≤ 1」和原来那条「三位两两不重复」是同一件事 ——
       这条硬性条件没有"放宽"的余地，放宽也变不出 1 注组三。
     穷举 120^3 = 1,728,000 种三位候选（0~9 各取 3 个）实测：
       · 满足「豹子=0 且 组三 ≤ 1」的组合 = 16800 种，【全部】组三 = 0；
       · 豹子 = 0 时，最小的【正】组三 = 3（例 A={0,1,2} B={0,3,4} C={5,6,7}，
         并集 8 个号）—— 想要"有组三"，最少也是 3 注，不是 1 注；
       · 0~9 共 10 个号 ≥ 9 ⇒ 可行（只剩 1 个号余量）。
     ⚠️ 若另外要求「9 个位置号都取自模板那 6 码」⇒ 只有 6 个号却要 9 个
        互不相同的号 ⇒ 同样穷举结果【可行组合 = 0】，「组三 ≤ 1」在这条
        约束下【数学上不可能】。并集 ≤ 6 个号时必有
        ab + ac + bc − abc ≥ 9 − 6 = 3，即 组三 ≥ 9
        （例 A={0,1,2} B={0,1,2} C={3,4,5}，并集 6 个号 → 组三 9 注）。
        两条约束不能同时满足，只能二选一：
          ① 全组六 + 6码另算（= 当前做法，组三 = 0）；
          ② 位置号 ⊆ 6码 + 组三 ≥ 9。

   为什么「组三 ≤ 1」等价于「三个位置的候选号两两不重复」：
     每个位置 3 个候选号 → 3×3×3 = 27 注直选。
     只要有两个位置共用 1 个数字 d（d 不在第三个位置里），
     第三个位置的 3 个号就各凑出 1 注 (d,d,x) —— 3 注组三，已经超过 1 组；
     若 d 也在第三个位置里，那 1 注是豹子（更不允许）。
     所以 ② 只能靠「百位 / 十位 / 个位的候选号两两不重复」来满足，
     满足之后 27 注全是组六（③ 自动满足），豹子也必然为 0（①）。

   做法：只换「被两个位置共用的号」，换号次数最少
     （资料号 / 专家池号优先保留，补位也优先用资料号和专家池号）。
   注意：这里的「防组三」是页面页脚的提示性字段，和本函数无关，不要混为一谈。
   ============================================================ */

/** 数字彩「直选」三位 = 第1位 / 第2位 / 第3位 的字段 key */
const DIGIT_STRAIGHT_KEYS = {
  fc3d: ['bai', 'shi', 'ge'],
  pl3:  ['bai', 'shi', 'ge'],
  pl5:  ['wan', 'qian', 'bai']    /* 排列5 前三位 = 排列3 三位 */
};

/** 某个位置候选号的优先级：资料号 > 专家池 > 该位近 30 期频率 > 其余升序 */
function digitStraightPref(gameId, posIdx, from, to) {
  const rank = [];
  const push = (arr) => {
    (arr || []).forEach((n) => {
      if (Number.isInteger(n) && n >= from && n <= to && rank.indexOf(n) < 0) rank.push(n);
    });
  };
  /* 资料里指定的号（用户要求「资料模板计入进去」）：排最前，能留就留、能补就补 */
  try {
    if (typeof materialRulesFor === 'function') {
      const mr = materialRulesFor(gameId, 'main');
      if (mr && mr.pick) push(mr.pick);
    }
  } catch (e) { /* 没有资料就跳过 */ }
  try {
    if (typeof expertPoolOf === 'function') push(expertPoolOf(gameId, 'main'));
  } catch (e) { /* 没有专家池就跳过 */ }

  /* 剩下的号按「该位置近 30 期出现次数」排（多的在前），次数相同按号码升序 */
  const freq = new Map();
  try {
    if (typeof getHistory === 'function') {
      getHistory(gameId).slice(0, HIST_PERIODS).forEach((d) => {
        const main = (d.areas && (d.areas.main || d.areas.front)) || [];
        const v = main[posIdx];
        if (Number.isInteger(v) && v >= from && v <= to) freq.set(v, (freq.get(v) || 0) + 1);
      });
    }
  } catch (e) { /* 没历史就按号码升序 */ }
  const rest = [];
  for (let n = from; n <= to; n++) if (rank.indexOf(n) < 0) rest.push(n);
  rest.sort((a, b) => ((freq.get(b) || 0) - (freq.get(a) || 0)) || (a - b));
  return rank.concat(rest);
}

/* 【6 码池 =「6码可组选」那 6 个号】用户 2026-10-17：
   「排三3D 很冲突 下面定位绝对不允许和组六不同」——定位只能从这 6 个号里挑。 */
const DIGIT_POOL_KEY = { fc3d: 'grp', pl3: 'grp' };
const DIGIT_POOL_PER = 3;          /* 每位 3 个号（27 注直选，全部取自 6 码）；用户 2026-10-20 要求 */

/** 从一个字段串里取出合法号码（去重、限定范围） */
function digitsOfField(v, from, to) {
  return consUniq((String(v == null ? '' : v).match(/\d+/g) || [])
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isInteger(n) && n >= from && n <= to));
}

/** 取「6码可组选」那 6 个号：fc3d / pl3 读本图的 grp；
    排列5 没有这一行（模板里前三位＝排三带入）→ 去【排三存档】里按内容找到同一期，取它那 6 个号。
    ⚠️ 不能用 recommendNumbers 现算：历史每天都在变，现算出来的 6 码和历史卡片上那 6 个号不一样
       （实测 2026-10-14 存档 [0,1,4,5,7,8] vs 现算 [0,1,2,3,6,8]）。 */
/** 找到「同一期排三」那张卡的数据（排五前三位＝排三三位，模板里就是"直接带入"）
 *  ① ctx.date 精确命中（迁移/重算必须走这条）
 *  ② 按内容匹配（排五 万/千/百 == 排三 百/十/个）
 *  ③ 最新一期（摇号时排三先摇完，最新的就是本期） */
function pl3MainFor(out, ctx) {
  try {
    if (typeof loadTickets !== 'function') return null;
    const p3 = (loadTickets() || {}).pl3 || {};
    const dates = Object.keys(p3).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    const mainOf = (d) => { const m = ((p3[d] || {}).images || {}).main; return (m && m.grp != null) ? m : null; };
    if (ctx && ctx.date) { const m = mainOf(ctx.date); if (m) return m; }
    const want = ['wan', 'qian', 'bai'].map((k) => digitsOfField(out[k], 0, 9).join(','));
    for (let i = 0; i < dates.length; i++) {
      const m = mainOf(dates[i]); if (!m) continue;
      const got = ['bai', 'shi', 'ge'].map((k) => digitsOfField(m[k], 0, 9).join(','));
      if (got[0] === want[0] && got[1] === want[1] && got[2] === want[2]) return m;
    }
    for (let i = dates.length - 1; i >= 0; i--) { const m = mainOf(dates[i]); if (m) return m; }
  } catch (e) { /* 忽略 */ }
  return null;
}

function digitPoolOf(gameId, out, ctx) {
  const key = DIGIT_POOL_KEY[gameId];
  if (key && out && out[key] != null) {
    const a = digitsOfField(out[key], 0, 9);
    if (a.length >= 6) return a.slice(0, 6);
    return null;
  }
  if (gameId === 'pl5') {
    const m = pl3MainFor(out, ctx);
    if (m) {
      const a = digitsOfField(m.grp, 0, 9);
      if (a.length >= 6) return a.slice(0, 6);
    }
    /* 兜底：现算排三的 6 码（历史不同会不一样，所以只当最后手段） */
    try {
      if (typeof recommendNumbers === 'function') {
        const a = consUniq(recommendNumbers('pl3', 'main', 6, 0, 9));
        if (a.length >= 6) return a.slice(0, 6);
      }
    } catch (e) { /* 拿不到就退回老逻辑，不硬编 */ }
  }
  return null;
}

/**
 * 把三个位置的候选号修成【与「6码可组选」完全一致】+【每位 3 号】
 *   · 有 6 码池（fc3d / pl3 / pl5 前三位）：每位 3 号，全部取自那 6 码
 *     → 27 注直选，豹子 0，组三压到最小值 9 注（百位 / 十位互不相交，个位从池内取）
 *   · 没有池（老数据 / 异常）：退回原来的「每位 3 号两两不重复」（27 注全组六）
 * @returns {boolean} 是否改动了 out
 */
function enforceDigitStraightGate(gameId, out, ctx) {
  if (!out || typeof out !== 'object') return false;
  const keys = DIGIT_STRAIGHT_KEYS[gameId];
  if (!keys) return false;
  /* 排列5 前三位就是排列3 的三位：连优先级也按排列3 算，
     这样两个彩种喂进同一个函数、得到的结果一定一样（不能各修各的）。 */
  const gateGame = (gameId === 'pl5') ? 'pl3' : gameId;
  const [from, to] = consRangeOf(gameId, 'main');
  const pool = digitPoolOf(gameId, out, ctx);
  const per = DIGIT_POOL_PER;

  const sets = [];
  for (let i = 0; i < keys.length; i++) {
    const arr = digitsOfField(out[keys[i]], from, to);
    /* 没有池：必须正好 3 个号（老口径，不满足就不动它、不凭空造号）；
       有池：旧的 2 号 / 3 号都收编成 3 号，一律按 6 码重排。 */
    if (!pool && arr.length !== per) return false;
    sets.push(arr);
  }

  const pref = [];
  for (let i = 0; i < keys.length; i++) pref.push(digitStraightPref(gateGame, i, from, to));
  const rankOf = (p, n) => { const i = pref[p].indexOf(n); return i < 0 ? 99 : i; };

  /* ============================================================
     方案 A（用户 2026-10-20 更新后）：定位每位 3 个号，全部取自「6码可组选」
     ------------------------------------------------------------
     6 个号要铺 3 个位置 × 3 个号 = 9 个位置格 ⇒ 必然有交集，
     所以「组三 = 0」在这条约束下做不到（数学，见文件头）。
     取法（组三最小 = 9 注、豹子 = 0）：
       · 百位：池内该位置最想要的 3 个（A）
       · 十位：池里【A 剩下的】3 个（B）—— A∩B=∅，6 码正好用满
       · 个位：全池按该位置偏好取 3 个（C）—— A∩B=∅ ⇒ 三个位置不会有共同号（无豹子）
       ⇒ ab = 0，ac + bc = |C| = 3 ⇒ 组三 = 3 × 3 = 9 注，已是这条约束下的最小值。
     ============================================================ */
  if (pool) {
    /* 【排列五前三位】＝排三那三位「直接带入」：照抄排三这张卡的三个位置，
       不要自己重新配对 —— 各配各的会分叉（踩过：排五用了现算的 6 码，
       结果 万/千/百 和排三 百/十/个 对不上）。 */
    if (gameId === 'pl5') {
      const src = pl3MainFor(out, ctx);
      const srcKeys = ['bai', 'shi', 'ge'];
      if (src) {
        let c2 = false;
        keys.forEach((k, p) => {
          const a = digitsOfField(src[srcKeys[p]], from, to);
          if (a.length !== per) return;          /* 排三那边还没收编好 → 不动，等下一轮 */
          const before = String(out[k] == null ? '' : out[k]).trim();
          const v = consJoin(a);
          if (v !== before) { out[k] = v; c2 = true; }
        });
        if (c2) return true;
      }
    }

    /* 达标判定：每位 3 个不重复的号 · 全部在 6 码内 · 没有豹子（三个位置没有共同号） */
    const okEach = sets.every((a) => a.length === per && consUniq(a).length === per);
    const allInPool = sets.every((a) => a.every((n) => pool.indexOf(n) >= 0));
    const noBao = !sets[0].some((n) => sets[1].indexOf(n) >= 0 && sets[2].indexOf(n) >= 0);
    if (okEach && allInPool && noBao) return false;      /* 已达标：一个号都不换（幂等） */

    const byPref = (p, list) => (list || pool).slice()
      .sort((x, y) => (rankOf(p, x) - rankOf(p, y)) || (x - y));

    const A = byPref(0).slice(0, per);
    const restPool = pool.filter((n) => A.indexOf(n) < 0);
    const B = byPref(1, restPool).slice(0, per);
    /* 池子异常短时兜底：从全池补，宁可重叠也不留空 */
    if (B.length < per) {
      byPref(1).forEach((n) => { if (B.length < per && B.indexOf(n) < 0) B.push(n); });
    }
    const C = byPref(2).slice(0, per);
    /* 个位恰好和百位（或十位）是同一组号时，换掉最不想要的那个，避免两行完全重复 */
    const sameSet = (a, b) => a.length === b.length && a.every((n) => b.indexOf(n) >= 0);
    if (sameSet(C, A) || sameSet(C, B)) {
      const other = sameSet(C, A) ? B : A;
      const swapIn = other.find((n) => C.indexOf(n) < 0);
      if (swapIn !== undefined) {
        C[C.length - 1] = swapIn;
        C.sort((x, y) => (rankOf(2, x) - rankOf(2, y)) || (x - y));
      }
    }

    const fixed = [A, B, C];
    let changed = false;
    keys.forEach((k, p) => {
      const before = String(out[k] == null ? '' : out[k]).trim();
      const v = consJoin(fixed[p]);
      if (v !== before) { out[k] = v; changed = true; }
    });
    return changed;
  }

  /* 已经两两不重复 → 27 注全是组六，豹子/组三都是 0，一个号都不换 */
  const used = new Set();
  let dup = false;
  sets.forEach((a) => a.forEach((n) => { if (used.has(n)) dup = true; else used.add(n); }));
  if (!dup) return false;

  /* ① 每个被两个以上位置共用的数字，只留在一个位置
        （留给「最想要它」= 优先级最高的那个位置），别的位置把它换掉。
        这样换号次数最少：Σ(共用位置数 - 1)。 */
  const keeper = new Map();
  for (let n = from; n <= to; n++) {
    const has = [];
    sets.forEach((a, p) => { if (a.indexOf(n) >= 0) has.push(p); });
    if (has.length < 2) continue;
    let best = has[0];
    has.forEach((p) => { if (rankOf(p, n) < rankOf(best, n)) best = p; });
    keeper.set(n, best);
  }
  const fixed = sets.map((a, p) => a.filter((n) => {
    const k = keeper.get(n);
    return k === undefined || k === p;
  }));

  /* ② 空出来的位置用「还没被任何位置用掉的号」补满（优先级高的先补） */
  const usedNow = new Set();
  fixed.forEach((a) => a.forEach((n) => usedNow.add(n)));
  fixed.forEach((a, p) => {
    for (let i = 0; i < pref[p].length && a.length < sets[p].length; i++) {
      const n = pref[p][i];
      if (usedNow.has(n) || a.indexOf(n) >= 0) continue;
      a.push(n); usedNow.add(n);
    }
  });
  /* 极端兜底：优先级表凑不够时按号码升序补（0~9 共 10 个号、只用 9 个，正常不会走到这里） */
  fixed.forEach((a) => {
    for (let n = from; n <= to && a.length < 3; n++) {
      if (usedNow.has(n)) continue;
      a.push(n); usedNow.add(n);
    }
  });

  let changed = false;
  keys.forEach((k, p) => {
    const before = String(out[k] == null ? '' : out[k]).trim();
    const v = consJoin(fixed[p]);
    if (v !== before) { out[k] = v; changed = true; }
  });
  return changed;
}

/**
 * 按「27 注直选」统计三个位置候选号的 豹子 / 组三 / 组六 注数（纯函数，验收用）。
 * 口径与用户一致：豹子 = 三位全同 · 组三 = 两位同 · 组六 = 三位互不相同。
 * @returns {{bao:number,zu3:number,zu6:number,total:number,distinct:number}|null}
 *          三位候选号不足 3 个 → 返回 null（不猜、不硬编）
 */
function digitStraightTally(gameId, out, ctx) {
  if (!out || typeof out !== 'object') return null;
  const keys = DIGIT_STRAIGHT_KEYS[gameId];
  if (!keys) return null;
  const [from, to] = consRangeOf(gameId, 'main');
  const sets = [];
  for (let i = 0; i < keys.length; i++) {
    const arr = digitsOfField(out[keys[i]], from, to);
    /* 每位个数必须一致且 ≥2：现在统一 3 个（2026-10-20 起，6 码里每位取 3 个） */
    if (arr.length < 2 || arr.length !== (sets.length ? sets[0].length : arr.length)) return null;
    sets.push(arr);
  }
  let bao = 0, zu3 = 0, zu6 = 0;
  sets[0].forEach((a) => sets[1].forEach((b) => sets[2].forEach((c) => {
    if (a === b && b === c) bao++;
    else if (a === b || a === c || b === c) zu3++;
    else zu6++;
  })));
  const all = sets[0].concat(sets[1], sets[2]);
  const pool = digitPoolOf(gameId, out, ctx);
  return {
    bao, zu3, zu6, total: bao + zu3 + zu6, distinct: consUniq(all).length,
    per: sets[0].length,
    pool: pool ? pool.length : 0,
    outside: pool ? consUniq(all.filter((n) => pool.indexOf(n) < 0)).length : 0
  };
}

/** 一整张图的一致性收尾：逐个号码区过一遍 */
function enforceConsistencyImage(gameId, imageKey, out, ctx) {
  if (!out || typeof out !== 'object') return out;
  /* 【硬性条件】放在最前面：福彩3D / 排列3 / 排列5前三位 的直选候选号
     必须避开豹子、组三，且【全部取自「6码可组选」】—— 它不能被后面的异常吞掉，所以先跑。 */
  try { enforceDigitStraightGate(gameId, out, ctx); } catch (e) { /* 失败不影响出号 */ }
  let roles;
  try { roles = fieldRolesOf(gameId, imageKey); } catch (e) { return out; }
  const areas = [];
  Object.keys(roles).forEach((k) => { if (areas.indexOf(roles[k].area) < 0) areas.push(roles[k].area); });
  areas.forEach((a) => {
    try { enforceConsistency(gameId, a, out, imageKey); } catch (e) { /* 单个区失败不影响其它 */ }
  });
  /* 【硬性条件的最终保证】一致性收尾在后半段仍可能改写号码字段，
     所以最后【再验一遍】：
       · 出现豹子、或某位不是 3 个号 → 重跑直选闸；
       · 【6 码一致性】定位里出现「6码可组选」以外的号 → 也重跑
         （用户 2026-10-17：「下面定位绝对不允许和组六不同」）。
     enforceDigitStraightGate 是幂等的（已合规的输入一个号都不换）。 */
  try {
    const t = digitStraightTally(gameId, out, ctx);
    if (t && (t.bao > 0 || t.outside > 0 || t.per !== DIGIT_POOL_PER)) enforceDigitStraightGate(gameId, out, ctx);
  } catch (e) { /* 失败不影响出号 */ }
  return out;
}

function autoFillForTemplate(gameId, imageKey) {
  const tpl = (typeof TEMPLATES !== 'undefined') ? TEMPLATES[gameId] : null;
  if (!tpl) return {};

  const img = tpl.images.find((i) => i.key === imageKey) || tpl.images[0];
  const out = {};

  /* ---- 「蓝球推荐 / 后区推荐」那批号：整张图只算一次 ----
     两个用处：① 图一上印出来的「蓝球推荐」字段值
              ② 绕胆图的蓝球关注要避开它（用户：「蓝球不要在推荐里面选」）
     算一次、两处共用，就不会出现
     「图上印的推荐」和「绕胆图避开的推荐」是两批号。
     （没有历史数据时 recommendNumbers 会走随机兜底，
       算两次就会得到两个不同的结果，所以必须只算一次。） */
  const backArea = (gameId === 'dlt') ? 'back' : 'blue';
  const backN = gameId === 'dlt' ? 2 : 6;
  const backRec = (gameId === 'ssq' || gameId === 'dlt')
    ? backRecNumbers(gameId, backArea, backN)
    : [];
  /* 蓝球/后区推荐字段的个数（双色球 6、大乐透 2） */
  const backRecN = backRec.length;

  // 五行 / 绕胆 / 九转 / 九宫 这张图用专用填充
  if (imageKey === 'wuxing') {
    Object.assign(out, autoFillWuxing(gameId, { backRec }));
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
        /* 【号码池 · 三源融合】用户 2026-10-20：「全部都留 一起结合算了出号」。
           候选 = 资料号码 ∪ 核心算法 20 码（你写的那套）∪ 专家号码池，去重后按融合分排：
             资料号永远第一；其余 = 0.50 × 热度分 + 0.30 × 专家共识度 + 0.20 × 命中核心 20 码。
           20/15/10/3/1 档按这个顺序往下截 ⇒ 小档必然 ⊆ 大档。 */
        const rankedPool = poolRankBlend(gameId, areaKey, range[0], range[1], wantMax);
        poolRows.forEach((r, i) => {
          const take = rankedPool.slice(0, counts[i]).sort((a, b) => a - b);
          out[r.key] = take.length
            ? take.map(pad2).join(' ')
            : recommendNumbers(gameId, areaKey, counts[i] || 1, range[0], range[1]).map(pad2).join(' ');
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

    /* ---- 主推球 ----
       【频率特征】原来是「近 30 期最热的那个」，现在用统一的频率特征分
       （全局频率 + 近 100 期冷热 + 遗漏回补）：双色球蓝球主推、大乐透后区主推
       都走这条，和「蓝球推荐」那 6 个是同一套分数选出来的。 */
    if (sec.bigBall && !out[sec.bigBall.key]) {
      out[sec.bigBall.key] = freqTop(gameId, areaKey, range[0], range[1], 1).map(pad2).join(' ');
    }
    if (sec.bigBalls && !out[sec.bigBalls.key]) {
      out[sec.bigBalls.key] = freqTop(gameId, areaKey, range[0], range[1], sec.bigBalls.count || 2)
        .map(pad2).join(' ');
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
          if (gameId === 'qxc') console.log('__QXC_LOG__', r.key, 'idx=' + idx, 'n=' + n);
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
