/* ============================================================
   asian-index.js —— 亚指综合换算（竞彩 / 足球共用）
   ------------------------------------------------------------
   用户给的算法与配置（名字照抄，函数名不变）：
     · 算法  calcAsianIndexAnalysis()  —— 原样落地，函数名不变
     · 配置  asianIndexCalc           —— 本项目里叫 ASIAN_INDEX_CALC

   【为什么单开一个文件】
     build-jc.mjs（抓数据时算）、fb-page.js（App 竞彩页）、
     export-football.mjs（足球推荐.html）三处都要用同一套算法。
     合成一份、三处共用，避免「算法抄三份、改一处漏两处」。
       · 浏览器：普通 <script src="asian-index.js">（函数挂全局）
       · Node  ：build-jc.mjs / export-football.mjs 用 vm 读进来
                 （见各自的 loadAsianIndex()）

   ============================================================
   【一、上盘 / 下盘 与 handicap 符号约定】
   ------------------------------------------------------------
     handicap = 主队让球数 × (-1)
       · handicap < 0 → 主队让球、客队受让 → 主队 = 上盘（让球方）
       · handicap > 0 → 主队受让、客队让球 → 客队 = 上盘
       · handicap = 0 → 平手盘，按惯例取主队为上盘

     用户原话：「盘口值 0,0.25,0.5,0.75,1.0... 负数=客受让」——
     负数 = 客受让 = 主队让球，与上面完全一致。

     实测校验（500.com 亚盘文字 → 数值 → 欧赔方向）：
       周三001 墨胜利 vs 首尔FC   line="一球"    → -1   （主队让球）
       周三006 LASK林茨 vs 利物浦 line="受一球"  → +1   （主队受让，欧赔 8/5/1.38 主队是弱队 ✔）
       周三008 罗马 vs 皇马       line="受半球/一球" → +0.75（欧赔 3.7/4/1.9 主队是弱队 ✔）
       周三009 博德闪耀 vs 多特    line="受平手/半球" → +0.25（欧赔 2.63/3.75/2.45 主队是弱队 ✔）
     也就是「受X」= 主队受让 → 正数，和竞彩 handicap 字段（"-1" = 主队让一球）同号。

   ============================================================
   【二、fundUp（上盘真实资金占比%）数据来源 —— 如实说明】
   ------------------------------------------------------------
     目前项目里【没有任何】真实资金占比数据源。已实测确认：
       · 数据源 live.500.com/json/odds.php 只返回 3 个数组
         （亚盘 / 欧赔 / 大小球），没有资金、热度、占比等任何字段
       · jc-data.js / jc-history.js / football.js 里也没有这类字段
     所以 getFundUp() 恒返回 null → analysis 恒为 null →
     页面上【不显示】热度等级、爆冷/输盘推演、真实资金、偏差，
     也【绝不编造】任何一个 fundUp 数字。

     页面上仍然显示的「水位隐含 · 理论均衡占比」是由【真实水位】换算出来的
     （pUpTheory = downWater/(upWater+downWater)），属于真实可算的量，
     和「真实资金占比」是两回事，页面上分开标注、不混用。

     将来若接入真实资金源，只改 getFundUp() 一处即可，
     算法、数据流、页面都不用动。
   ============================================================ */

/* ============================================================
   1. 配置 —— 用户给的 asianIndexCalc（原样落地）
   ============================================================ */
const ASIAN_INDEX_CALC = {
  desc: '亚指综合换算，资金热度推演，仅娱乐',
  /* 能走水的盘口（半球 / 球半 这类没有走水可能，所以不在表里） */
  waterHandicapList: [0, 0.25, 0.75, 1.0, 1.25, 1.75, 2],
  /* 热度规则：dev = 上盘真实资金占比 - 理论上盘资金占比（单位：百分点）
     【坑·必读】这个数组的顺序是用户给的原始顺序（15 → 5 → -5 → -15 → 0），
     它【不是】判断顺序。若照数组字面顺序去匹配，dev = -20 会先命中 -5
     被误判成 cold（偏冷），而用户算法的语义要求它是 veryCold（极冷）。
     所以下面 asianHotRule() 按「阈值绝对值从大到小」匹配，
     完整复刻用户原始算法的 if/else 顺序：
       dev>=15 veryHot → dev>=5 hot → dev<=-15 veryCold → dev<=-5 cold → else balance
     这样即使以后有人调整数组顺序或阈值，结果语义都不变。 */
  hotRule: [
    { dev: 15, level: 'veryHot', text: '上盘大热，警惕爆冷输盘', tag: '爆冷' },
    { dev: 5, level: 'hot', text: '上盘偏热，防输盘，部分盘口防走水', tag: '输盘' },
    { dev: -5, level: 'cold', text: '上盘偏冷，倾向上盘赢盘', tag: '赢盘' },
    { dev: -15, level: 'veryCold', text: '上盘极冷，看好上盘赢盘', tag: '赢盘' },
    { dev: 0, level: 'balance', text: '资金均衡，结合盘口属性判断', tag: '胜负难分' }
  ]
};

/* 均衡档落在「能走水」的盘口上时，结论标签要换成这个。
   【注意】这一条是用户原始算法额外给的，配置 hotRule 里没有，
   所以单独放一个常量，不硬塞进用户给的配置里。 */
const ASIAN_INDEX_WATER_TAG = '走水机会';

/* ============================================================
   2. 热度规则匹配（复刻用户原始算法的判断顺序，见配置里的「坑·必读」）
   ============================================================ */
function asianHotRule(dev) {
  const rules = (ASIAN_INDEX_CALC && Array.isArray(ASIAN_INDEX_CALC.hotRule))
    ? ASIAN_INDEX_CALC.hotRule : [];
  if (!rules.length) return null;

  const fallback = rules.find((r) => Number(r.dev) === 0) || rules[rules.length - 1];
  const n = Number(dev);
  if (!Number.isFinite(n)) return fallback;

  if (n >= 0) {
    /* 正偏差：阈值从大到小（15 → 5），第一个 n >= 阈值 的命中 */
    const pos = rules.filter((r) => Number(r.dev) > 0)
      .sort((a, b) => Number(b.dev) - Number(a.dev));
    for (const r of pos) if (n >= Number(r.dev)) return r;
  } else {
    /* 负偏差：阈值从小到大（-15 → -5），第一个 n <= 阈值 的命中 */
    const neg = rules.filter((r) => Number(r.dev) < 0)
      .sort((a, b) => Number(a.dev) - Number(b.dev));
    for (const r of neg) if (n <= Number(r.dev)) return r;
  }
  return fallback;
}

/* ============================================================
   3. 亚指综合换算（用户给的算法 —— 逻辑原样，阈值/文案/标签走配置）
   ------------------------------------------------------------
   与用户原始代码的唯一差别：原来写死的 15 / 5 / -15 / -5、
   文案、标签、走水盘口列表，改成从 ASIAN_INDEX_CALC 里读。
   判断顺序、比较符（含等号）、返回字段名与顺序都与原版一致。
   ============================================================ */
/**
 * 亚指综合换算：理论资金分布 + 热度偏差 + 赢盘/输盘/走水/爆冷推演
 * @param {number} handicap 盘口值 0,0.25,0.5,0.75,1.0... 负数=客受让
 * @param {number} upWater 上盘即时水位
 * @param {number} downWater 下盘即时水位
 * @param {number} fundUp 采集到【上盘真实资金占比%】
 * @returns Object
 *
 * 【调用前请注意】fundUp 必须是【真实拿到】的数字。
 * 拿不到就不要调这个函数（或调用后只取理论值），
 * 传 null 会得到 devUp="NaN" 这种假结果 —— 详见 asianIndexFor()。
 */
function calcAsianIndexAnalysis(handicap, upWater, downWater, fundUp){
  const totalW = upWater + downWater;
  // 1. 计算理论均衡资金占比
  const pUpTheory = (downWater / totalW) * 100;
  const pDownTheory = (upWater / totalW) * 100;
  const fundDown = 100 - fundUp;

  // 2. 热度偏差
  const devUp = fundUp - pUpTheory;
  const devDown = fundDown - pDownTheory;

  // 3. 判断盘口是否支持走水
  const waterAvailableHandicap = ASIAN_INDEX_CALC.waterHandicapList;
  const canWater = waterAvailableHandicap.includes(Math.abs(handicap));

  // 4. 热度等级（阈值 / 文案 / 标签 全部来自 ASIAN_INDEX_CALC.hotRule）
  const hotRule = asianHotRule(devUp);
  const hotLevel = hotRule ? hotRule.level : 'balance';
  const hotText = hotRule ? hotRule.text : '';

  // 5. 综合结论标签
  // 【原始算法】均衡档还要看盘口能不能走水：
  //     canWater ? "走水机会" : "胜负难分"
  //   「走水机会」是算法额外给的（配置里没有这一条）
  const balanced = !hotRule || Number(hotRule.dev) === 0;
  let conclusionTag;
  if (balanced) {
    conclusionTag = canWater ? ASIAN_INDEX_WATER_TAG : ((hotRule && hotRule.tag) || '胜负难分');
  } else {
    conclusionTag = (hotRule && hotRule.tag)
      || (canWater ? ASIAN_INDEX_WATER_TAG : '胜负难分');
  }

  return {
    totalWater: totalW,
    theoryFundUpPercent: pUpTheory.toFixed(2),
    theoryFundDownPercent: pDownTheory.toFixed(2),
    realFundUpPercent: fundUp,
    realFundDownPercent: fundDown,
    devUp: devUp.toFixed(2),
    devDown: devDown.toFixed(2),
    canWater: canWater,
    hotLevel,
    hotText,
    conclusionTag
  }
}

/* ============================================================
   4. 盘口升降类型（用户给的 checkHandicapChange —— 原样落地，函数名不变）
   ------------------------------------------------------------
   它要【初盘】和【即时盘】两组数据。项目里的数据（已实测 dump）：
     jc-data.js → game.odds.asian.open / game.odds.asian.live
       每个都是 { home: 主水位, line: 盘口文字, away: 客水位 }
       例：周三001  open={0.77,"平手",1.02}  live={0.9,"一球",0.9}
     也就是说 4 个参数【都拿得到】（本次在售 14/14 场初盘即时盘都有）。
     只有「初盘 / 即时盘的上盘方不是同一支球队」时才比不了
     （见 buildAsianIndex 里的说明）。

   【注意·边界行为，照用户代码实现，但如实记录】
     · 分支全是严格 `>` / `<`，没有等于号：
         盘口不变、只有水位变  → 4 个分支都不命中 → "盘口水位无明显变化"
         盘口变、水位不变      → 同样 → "盘口水位无明显变化"
         盘口水位都不变        → "盘口水位无明显变化"
       前两种其实「有变化」，但函数会说「无明显变化」—— 这是原代码的行为，
       不改；页面上另外把「初盘 → 即时」的原始盘口/水位明细一起显示出来，
       免得那句话误导人。
     · 负数区间（主队让球）语义与常见叫法相反：
         -0.25 → -0.5（主队让球从 0.25 加深到 0.5，行话叫「升盘」）
         用户代码 nowHandicap(-0.5) < initHandicap(-0.25) → 判成「降盘…」
       因为 handicap = 主队让球数 × (-1)，数值变大 = 让球权往客队方向走；
       正数区间（客队让球）与行话一致，负数区间相反。照用户代码实现，不改。
   ============================================================ */
/**
 * 判断盘口升降类型
 */
function checkHandicapChange(initHandicap, nowHandicap, initUpWater, nowUpWater){
  let type = "";
  if(nowHandicap > initHandicap && nowUpWater < initUpWater){
    type = "升盘降水";
  }else if(nowHandicap < initHandicap && nowUpWater < initUpWater){
    type = "降盘降水";
  }else if(nowHandicap > initHandicap && nowUpWater > initUpWater){
    type = "升盘升水";
  }else if(nowHandicap < initHandicap && nowUpWater > initUpWater){
    type = "降盘升水";
  }else{
    type = "盘口水位无明显变化";
  }
  return type;
}

/* ============================================================
   5. 亚盘盘口文字 → 数值盘口（用户约定：负数 = 客受让）
   ============================================================ */
const ASIAN_LINE_NUM = {
  '平手': 0, '半球': 0.5, '一球': 1, '球半': 1.5, '两球': 2, '两球半': 2.5,
  '三球': 3, '三球半': 3.5, '四球': 4, '四球半': 4.5, '五球': 5, '五球半': 5.5,
  '六球': 6, '六球半': 6.5, '七球': 7
};

/**
 * 盘口 → 数值（用户约定：负数=客受让）
 *   "一球"          → -1      （主队让一球）
 *   "受一球"        → +1      （主队受让一球）
 *   "平手/半球"     → -0.25   （组合盘两边各半，取平均）
 *   "受半球/一球"   → +0.75
 *   数字 / 数字字符串（"-1"、"0.5"）→ 直接用（符号已带在里面）
 * 认不出来的写法返回 null —— 宁可不显示，也不瞎猜。
 */
function asianHandicapFromLine(line) {
  if (line === null || line === undefined || line === '') return null;

  if (typeof line === 'number') return Number.isFinite(line) ? line : null;

  const s0 = String(line).trim();
  if (!s0) return null;
  /* 纯数字（含负号）→ 符号已经在里面了，直接用 */
  if (/^[+-]?\d+(\.\d+)?$/.test(s0)) return parseFloat(s0);

  let s = s0;
  let sign = -1;                       /* 默认「主队让球」→ 负数 */
  if (/^受/.test(s)) { sign = 1; s = s.replace(/^受/, ''); }        /* 受 = 主队受让 */
  else if (/^让/.test(s)) { sign = -1; s = s.replace(/^让/, ''); }  /* 让 = 主队让球 */

  const parts = s.split('/').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;

  const nums = [];
  for (const p of parts) {
    if (/^\d+(\.\d+)?$/.test(p)) { nums.push(parseFloat(p)); continue; }
    if (ASIAN_LINE_NUM[p] !== undefined) { nums.push(ASIAN_LINE_NUM[p]); continue; }
    return null;
  }
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const v = sign * avg;
  return v === 0 ? 0 : v;              /* 免得出现 -0 */
}

/* ============================================================
   6. fundUp 的唯一入口
   ------------------------------------------------------------
   目前【没有数据源】→ 恒返回 null（详见文件头「二、fundUp 数据来源」）。
   将来接入真实资金占比时，只改这个函数：
     return { percent: 上盘资金占比%, source: '数据来源说明' };
   ============================================================ */
function getFundUp(_game) {
  return null;
}

const numOrNull = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/* ============================================================
   7. 一场竞彩数据 → 亚指分析（算法要的 4 个输入都在这里凑齐）
   ------------------------------------------------------------
   输入：jc-data.js 里一场的形状（odds.asian + handicap）
   输出（存进 jc-data.js / jc-history.js 的 game.asianIndex）：
     {
       line, from,                 亚盘文字盘口 / 用的是即时还是初盘
       handicap, upSide,           数值盘口（负数=客受让）/ 上盘是哪边
       upWater, downWater,         上盘、下盘即时水位（真实）
       openHandicap, openUpWater, openDownWater,   初盘（真实，仅展示）
       totalWater,                 上+下水位合计（真实）
       theoryUpPercent, theoryDownPercent,         水位换算的理论均衡占比（真实可算）
       canWater,                   该盘口能不能走水
       handicapChange,             盘口升降（checkHandicapChange 的结果，比不了时 null）
       handicapChangeWhy,          比不了时的原因（如实说明，页面不显示假标签）
       fundUp, fundUpSource,       【恒为 null】上盘真实资金占比% 及其来源
       analysis                    【恒为 null】只有拿到真实 fundUp 才是算法完整输出
     }
   返回 null 表示「这场凑不齐输入」→ 页面整块不显示（不编数据）。
   ============================================================ */
function buildAsianIndex(game) {
  if (!game) return null;
  const a = game.odds && game.odds.asian;
  if (!a) return null;

  /* 盘口 + 水位：优先「即时」，没有即时才退回「初盘」 */
  const live = a.live, open = a.open;
  let use = null, from = '';
  if (live && live.line !== null && live.line !== undefined && live.line !== '') { use = live; from = 'live'; }
  else if (open && open.line !== null && open.line !== undefined && open.line !== '') { use = open; from = 'open'; }
  if (!use) return null;

  /* 数值盘口：先认亚盘文字，认不出再退回竞彩的 handicap 字段（"-1" / "平手"） */
  let handicap = asianHandicapFromLine(use.line);
  if (handicap === null) handicap = asianHandicapFromLine(game.handicap);
  if (handicap === null) return null;          /* 认不出盘口 → 不显示 */

  const hw = numOrNull(use.home), aw = numOrNull(use.away);
  if (hw === null || aw === null) return null; /* 没有水位 → 不显示 */

  /* 上盘 = 让球方 */
  const upSide = handicap <= 0 ? 'home' : 'away';
  const upWater = upSide === 'home' ? hw : aw;
  const downWater = upSide === 'home' ? aw : hw;

  /* 初盘（同样方向），只做展示 */
  let openHandicap = null, openUpWater = null, openDownWater = null;
  if (open && open.line !== null && open.line !== undefined && open.line !== '') {
    openHandicap = asianHandicapFromLine(open.line);
    const ohw = numOrNull(open.home), oaw = numOrNull(open.away);
    if (openHandicap !== null && ohw !== null && oaw !== null) {
      const oUp = openHandicap <= 0 ? 'home' : 'away';
      openUpWater = oUp === 'home' ? ohw : oaw;
      openDownWater = oUp === 'home' ? oaw : ohw;
    }
  }

  /* ---- 盘口升降（checkHandicapChange）----
     要【初盘 + 即时】两组数据，实测数据源两组都有（在售 14/14 场）。
     只有「初盘 / 即时的上盘方不是同一支球队」时才真的比不了 ——
     那种情况 initUpWater 和 nowUpWater 根本不是同一支球队的水位，
     硬比会得出一个看似合理、实际错误的标签，所以宁可不算（= null）。
     另外这里只在【即时盘可用】（from === 'live'）时才算升降。 */
  let handicapChange = null;
  let handicapChangeWhy = '';
  if (from !== 'live') {
    handicapChangeWhy = '只有初盘数据，没有即时盘，无法比较升降';
  } else if (openHandicap === null || openUpWater === null || openDownWater === null) {
    handicapChangeWhy = '初盘盘口或初盘水位认不出来，无法比较升降';
  } else {
    const openSide = openHandicap <= 0 ? 'home' : 'away';
    if (openSide !== upSide) {
      handicapChangeWhy = '初盘与即时的上盘方不是同一支球队（盘口跨了平手），升降不适用';
    } else {
      handicapChange = {
        type: checkHandicapChange(openHandicap, handicap, openUpWater, upWater),
        initHandicap: openHandicap,
        nowHandicap: handicap,
        initUpWater: openUpWater,
        nowUpWater: upWater,
        initLine: String(open.line),
        nowLine: String(use.line)
      };
    }
  }

  /* ---- 调算法 ----
     注意：这里【总是】调一次，但只有【真拿到 fundUp】时才把完整结果存下来。
     fundUp 缺失时只取 totalWater / 理论占比 / canWater 这几项 ——
     它们只由真实水位和盘口决定，和资金占比无关，所以是真数据。 */
  const fund = getFundUp(game);
  const fundPct = (fund && Number.isFinite(Number(fund.percent))) ? Number(fund.percent) : null;

  const res = calcAsianIndexAnalysis(handicap, upWater, downWater, fundPct);

  const out = {
    line: String(use.line),
    from, handicap, upSide,
    upWater, downWater,
    openHandicap, openUpWater, openDownWater,
    totalWater: res.totalWater,
    theoryUpPercent: res.theoryFundUpPercent,
    theoryDownPercent: res.theoryFundDownPercent,
    canWater: res.canWater,
    /* 【盘口升降】checkHandicapChange 的结果；比不了时为 null（+why 说明原因） */
    handicapChange,
    handicapChangeWhy,
    /* 【不允许编】没拿到就是 null，页面据此整块不显示热度推演 */
    fundUp: null,
    fundUpSource: null,
    analysis: null
  };

  if (fundPct !== null) {
    out.fundUp = fundPct;
    out.fundUpSource = (fund && fund.source) ? String(fund.source) : '';
    out.analysis = res;        /* 完整算法输出（含 devUp/devDown/hotLevel/hotText/conclusionTag） */
  }
  return out;
}

/* ============================================================
   8. 页面展示模型（App 与 足球推荐.html 共用同一份，保证两页一致）
   ============================================================ */
function asianHandicapText(h) {
  if (h === null || h === undefined) return '';
  const v = Number(h);
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '平手';
  return v < 0 ? ('主让 ' + Math.abs(v)) : ('客让 ' + v);
}

/**
 * @param {object} asian buildAsianIndex() 的产物（或 jc-data 里的 game.asianIndex）
 * @returns {object|null} null = 这场没有亚指数据 → 页面整块不显示
 */
function asianIndexView(asian) {
  if (!asian) return null;
  const A = asian.analysis;
  const hasFund = !!A;                     /* 只有真拿到资金占比，才有热度推演 */
  return {
    hasFund,
    /* 【合规】用户给这块的定位就是「仅娱乐」，两个页面都要标出来 */
    desc: ASIAN_INDEX_CALC.desc,
    note: '仅娱乐参考，不构成购彩建议',
    line: asian.line,
    fromText: asian.from === 'open' ? '初盘' : '即时',
    handicap: asian.handicap,
    handicapText: asianHandicapText(asian.handicap),
    upSide: asian.upSide,
    upSideText: asian.upSide === 'away' ? '客队' : '主队',
    upWater: asian.upWater,
    downWater: asian.downWater,
    openHandicapText: asianHandicapText(asian.openHandicap),
    openUpWater: asian.openUpWater,
    openDownWater: asian.openDownWater,
    totalWater: asian.totalWater,
    theoryUp: asian.theoryUpPercent,
    theoryDown: asian.theoryDownPercent,
    canWater: !!asian.canWater,
    canWaterText: asian.canWater ? '该盘口可走水' : '该盘口无走水',
    /* 【盘口升降】checkHandicapChange 的结果（比不了时为 null，不显示假标签）。
       另外把「初盘 → 即时」的原始盘口/水位明细一起给出去：
       函数在「盘口不变只水位变」「盘口变水位不变」这两种情况下会说
       「盘口水位无明显变化」，显示明细能避免那句话误导人。 */
    changeType: asian.handicapChange ? asian.handicapChange.type : null,
    changeMissingText: (!asian.handicapChange && asian.handicapChangeWhy) ? asian.handicapChangeWhy : '',
    changeDetail: asian.handicapChange
      ? ('初盘 ' + asian.handicapChange.initLine + ' ' + asian.handicapChange.initUpWater +
         ' → 即时 ' + asian.handicapChange.nowLine + ' ' + asian.handicapChange.nowUpWater)
      : '',
    /* 下面这些只有在 hasFund 时才有值 —— 页面必须用 hasFund 判断后再显示 */
    fundUp: hasFund ? asian.fundUp : null,
    fundDown: hasFund ? (100 - asian.fundUp) : null,
    fundUpSource: hasFund ? (asian.fundUpSource || '') : '',
    devUp: hasFund ? A.devUp : null,
    devDown: hasFund ? A.devDown : null,
    hotLevel: hasFund ? A.hotLevel : null,
    hotText: hasFund ? A.hotText : null,
    conclusionTag: hasFund ? A.conclusionTag : null,
    /* 数据缺失时的如实说明（页面上会显示这句，而不是显示编造的数字） */
    missingText: hasFund ? '' : '上盘真实资金占比暂无公开数据源，故不显示热度 / 爆冷推演'
  };
}
