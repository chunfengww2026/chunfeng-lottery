// ============================================================
//  jc-archive.mjs —— 竞彩【已完场】累积归档（纯函数，可单测）
//
//  【为什么需要这个文件】
//  jc-data.js 是体彩「竞彩在售」列表（build-jc.mjs 抓 live.500.com/jczq.php），
//  只包含【还能买】的比赛 —— 一开完赛就从在售列表里消失。
//  所以「已完场」如果只读 jc-data，永远是 0 场。
//
//  解决办法：每跑一次 build-jc.mjs，就把「上一次在售、这次不见了」的比赛
//  归档进 jc-history.js（按队名 + 日期去 football.js 里找它的比分），
//  页面上的「已完场」= jc-data 里完场的 + jc-history 里累积的。
//
//  本文件只做纯计算，不碰文件系统 —— build-jc.mjs 负责读写。
//
//  用法：
//    import { archiveJcHistory, mergeHistory, renderHistoryJs } from './jc-archive.mjs';
// ============================================================

/* 【推荐命中判定 · 共用一份】
   three（只中那一个）/ unbeaten（胜或平都算中）的判定规则只写在
   jc-reco-archive.js 里（unbeatenSide / recoHit），本文件直接复用 ——
   ⚠️ 别在这里再写第二套 pick === actual，否则不败推荐会被错判成黑。
   jc-reco-archive.js 是 CJS/UMD（require 与 <script> 双模式），
   这里用 ESM 默认导入拿它的 module.exports。 */
import RECO from './jc-reco-archive.js';
const { recoHit } = RECO;

/* ============================================================
   1. 队名归一化（容忍繁体 / 简称 / 中英混写）
   ------------------------------------------------------------
   两边的队名写法经常不一样，例如：
     竞彩(500.com)      245qq
     南安普敦      →    南安普顿
     贝蒂斯        →    皇家贝蒂斯
     维拉          →    阿斯顿维拉
     曼城          →    曼彻斯特城
   所以匹配前先做「繁转简 → 去掉前缀/后缀 → 查别名表」。
   ============================================================ */

/* 简体对照表（队名里常见的繁体字）—— 与 export-football.mjs 保持一致 */
const TRAD = {
  '溫': '温', '爾': '尔', '蘭': '兰', '維': '维', '薩': '萨', '羅': '罗',
  '馬': '马', '聯': '联', '競': '竞', '體': '体', '門': '门', '興': '兴',
  '達': '达', '萊': '莱', '錫': '锡', '圖': '图', '倫': '伦', '佈': '布',
  '頓': '顿', '漢': '汉', '堡': '堡', '聖': '圣', '貝': '贝', '華': '华',
  '魯': '鲁', '輔': '辅', '亞': '亚', '尼': '尼', '斯': '斯', '拉': '拉',
  '內': '内', '納': '纳', '爾': '尔', '傑': '杰', '飛': '飞', '燕': '燕',
  '豪': '豪', '賦': '赋', '紅': '红', '紐': '纽', '約': '约', '廣': '广',
  '島': '岛', '國': '国', '際': '际', '業': '业', '餘': '余', '費': '费',
  '熱': '热', '刺': '刺', '銀': '银', '礦': '矿', '工': '工', '澤': '泽',
  '車': '车', '東': '东', '西': '西', '南': '南', '北': '北', '中': '中',
  '蘇': '苏', '格': '格', '蘭': '兰', '愛': '爱', '爾': '尔', '維': '维'
};

/* 别名表：键是某一方的写法，值是更完整的官方名 */
const ALIAS = {
  /* 从 jc-data（竞彩简称）→ football.js（245qq 写法） */
  '南安普敦': '南安普顿',
  '贝蒂斯': '皇家贝蒂斯',
  '维拉': '阿斯顿维拉',
  '曼城': '曼彻斯特城',
  '巴黎圣曼': '巴黎圣日耳曼',
  '弗鲁米嫩': '弗鲁米嫩塞',
  '帕梅拉斯': '帕尔梅拉斯',
  '圣路易斯城': '圣路易斯市',
  '温哥华': '温哥华白帽',
  '皇马': '皇家马德里',
  '巴萨': '巴塞罗那',
  '马竞': '马德里竞技',
  '曼联': '曼彻斯特联',
  '国米': '国际米兰',
  '拜仁': '拜仁慕尼黑',
  '莱红牛': '莱比锡红牛',
  '米堡': '米德尔斯堡',
  '那不勒斯': '拿玻里',
  '比利亚雷': '比利亚雷亚尔',
  '加拉塔萨': '加拉塔萨雷',
  '埃因霍温': 'PSV埃因霍温',
  '里斯本': '葡萄牙体育',
  '纽喷气机': '纽卡斯尔喷气机',
  '利物浦': '利物浦',
  '多特蒙德': '多特蒙德',
  '波尔图': '波尔图',
  '费内巴切': '费内巴切',
  '博德闪耀': '博多格林特'
};

function toSimp(s) {
  return String(s || '').replace(/[\u4e00-\u9fa5]/g, (ch) => TRAD[ch] || ch);
}

/** 去掉「U19 / 女足 / 俱乐部 / 后备队」这类噪音 */
function stripNoise(s) {
  return String(s || '').replace(
    /(足球俱乐部|俱乐部|足球队|后备队|预备队|青年队|女足|U\d{2}|FC|SC|CF|AC|BK|IF|FK|SV|SK|CS)/gi,
    ''
  );
}

/* 【关键】青年队 / 后备队 / 女足 必须和成年队区分开，否则会出现
   「维拉」被匹配到「阿斯顿维拉U19」这种错配，把青年队比分当成一队比分。
   所以除了归一化时剥掉这些标记，还要单独记住「这场有没有这类标记」。 */
const YOUTH_RE = /(U\d{2}|女足|后备队|预备队|青年队|B队|二队|II队)/i;

/** 归一化：繁转简 → 查别名 → 去噪音 → 去符号 → 小写 */
function norm(s) {
  const simp = toSimp(String(s || '').trim());
  const aliased = ALIAS[simp] || simp;
  return stripNoise(aliased)
    .replace(/[（(].*?[)）()]/g, '')
    .replace(/[\s\-·.]/g, '')
    .toLowerCase();
}

/**
 * 判定两个队名是不是同一支球队。
 * 规则（从严到宽）：
 *   ① 青年队/后备队标记不一致 → 直接判否
 *      （「维拉」≠「阿斯顿维拉U19」；「沙兰迪兵工厂后备队」≠「沙兰迪兵工厂」）
 *   ② 归一化后完全相等          → 同一支
 *   ③ 一方包含另一方，且被包含的那方 ≥ 3 个字 → 同一支
 *      （≥3 是防止「罗马」把「罗马尼亚」也算进来）
 */
function sameTeam(a, b) {
  const ra = String(a || '');
  const rb = String(b || '');
  if (YOUTH_RE.test(ra) !== YOUTH_RE.test(rb)) return false;

  const x = norm(ra);
  const y = norm(rb);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  if (short.length >= 3 && long.includes(short)) return true;
  return false;
}

/* ============================================================
   2. 比赛身份键
   ------------------------------------------------------------
   优先用竞彩编号（周三001），它不可靠时用「主队+客队+日期」。
   实际数据里 football.js 【没有】竞彩编号，所以队名+日期是主力。
   ============================================================ */

/** 队名对（顺序不敏感，避免主客写反时漏匹配） */
function teamPair(g) {
  const h = norm(g && g.home && g.home.name);
  const a = norm(g && g.away && g.away.name);
  if (!h || !a) return '';
  return [h, a].sort().join('|');
}

const dayOf = (t) => String(t || '').slice(0, 10);

/** 竞彩编号归一化：周二004 / 週二004 都变成 周2-004（兼容繁体「週」） */
function codeKey(code) {
  const m = /[周週]([一二三四五六日天])\s*0*(\d{1,3})/.exec(String(code || ''));
  if (!m) return '';
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  return `周${map[m[1]]}-${String(m[2]).padStart(3, '0')}`;
}

/** 比赛身份键（不含编号）—— 主客队 + 日期，顺序不敏感 */
function identityKeys(g) {
  const tp = teamPair(g);
  const d = dayOf(g && g.time);
  if (!tp || !d) return [];
  return [`${tp}@${d}`];
}

/** 这场有没有「完整比分」（归档的必要条件） */
function scoresOf(g) {
  if (!g) return null;
  if (g.score && g.score.home !== null && g.score.home !== undefined &&
      g.score.away !== null && g.score.away !== undefined) {
    return { h: +g.score.home, a: +g.score.away };
  }
  if (g.liveScore && g.liveScore.home !== null && g.liveScore.home !== undefined &&
      g.liveScore.away !== null && g.liveScore.away !== undefined) {
    return { h: +g.liveScore.home, a: +g.liveScore.away };
  }
  if (g.home && g.home.score !== null && g.home.score !== undefined &&
      g.away && g.away.score !== null && g.away.score !== undefined) {
    return { h: +g.home.score, a: +g.away.score };
  }
  return null;
}

/* ============================================================
   3. 在 football.js 里找同一场（拿最终比分）
   ============================================================ */

/**
 * @param {object} game   要归档的那场（jc-data 的形状）
 * @param {Array}  fbList football.js 的全部比赛（upcoming+live+finished）
 * @returns {object|null} 找到的那场 football 记录
 *
 * 匹配条件（必须同时满足）：
 *   · 主客队名归一化后一一对应（顺序也必须一致——主客写反不认为是同一场）
 *   · 日期相差 ≤ 1 天（跨零点时两边的日期可能差一天）
 * 结果只接受「已有比分」的那些。
 */
function findInFootball(game, fbList) {
  const list = Array.isArray(fbList) ? fbList : [];
  if (!list.length) return null;
  const gd = dayOf(game && game.time);
  if (!gd) return null;

  const hit = list.find((m) => {
    const md = dayOf(m && m.time);
    if (!md) return false;
    const d1 = new Date(gd + 'T00:00:00').getTime();
    const d2 = new Date(md + 'T00:00:00').getTime();
    if (!Number.isFinite(d1) || !Number.isFinite(d2)) return false;
    if (Math.abs(d1 - d2) > 86400000) return false;
    return sameTeam(game.home && game.home.name, m.home && m.home.name)
        && sameTeam(game.away && game.away.name, m.away && m.away.name);
  }) || null;

  if (!hit) return null;
  /* 没有比分的 football 记录对我们没用 */
  return scoresOf(hit) ? hit : null;
}

/* ============================================================
   4. 归档主逻辑
   ============================================================ */

/**
 * 算出「本次新增的已完场」，并和旧历史合并。
 *
 * @param {object} opts
 *   opts.oldJc     上一次的 jc-data（{games:[...]}，可能为 null）
 *   opts.newJc     本次抓到的 jc-data（{games:[...]}）
 *   opts.history   旧历史（{list:[...]}，可能为 null）
 *   opts.fbList    football.js 的全部比赛（用来找终场比分）
 *   opts.now       'YYYY-MM-DD HH:MM' 时间戳（归档时间）
 * @returns {{list:Array, added:number, newly:Array, updated:number}}
 */
function archiveJcHistory(opts) {
  const o = opts || {};
  const oldGames = (o.oldJc && Array.isArray(o.oldJc.games)) ? o.oldJc.games : [];
  const newGames = (o.newJc && Array.isArray(o.newJc.games)) ? o.newJc.games : [];
  const fbList = Array.isArray(o.fbList) ? o.fbList : [];
  const at = o.now || '';

  const newCodes = new Set(newGames.map((g) => codeKey(g.code)).filter(Boolean));
  const newIds = new Set();
  newGames.forEach((g) => identityKeys(g).forEach((k) => newIds.add(k)));

  /* ---------- ① 找出「该归档」的候选 ---------- */
  const candidates = [];

  /* (a) 上次在售、这次不见了 → 说明开完赛（或下架）了 */
  oldGames.forEach((g) => {
    const ck = codeKey(g.code);
    const ids = identityKeys(g);
    const stillThere = (ck && newCodes.has(ck)) || ids.some((k) => newIds.has(k));
    if (!stillThere) candidates.push({ game: g, why: 'gone' });
  });

  /* (b) 上次在售、这次还在，但状态已是 finished → 一并归档（会同时保留在 new 里） */
  newGames.forEach((g) => {
    if (String(g.status || '') !== 'finished') return;
    const ck = codeKey(g.code);
    const ids = identityKeys(g);
    const wasThere = (ck && oldGames.some((x) => codeKey(x.code) === ck))
      || ids.some((k) => oldGames.some((x) => identityKeys(x).includes(k)));
    /* 只要它「完场且有比分」就归档，不要求上次在售
       （这样第一次跑、jc-data 里就有完场的情况也能收进来） */
    if (scoresOf(g) || wasThere) candidates.push({ game: g, why: 'finished' });
  });

  /* ---------- ② 逐场补上终场比分，做成历史记录 ---------- */
  const newly = [];
  candidates.forEach(({ game }) => {
    const rec = toHistoryRecord(game, fbList, at);
    if (rec) newly.push(rec);
  });

  /* ---------- ③ 合并去重 ---------- */
  const old = (o.history && Array.isArray(o.history.list)) ? o.history.list : [];
  const merged = mergeHistory(old, newly);

  return {
    list: merged.list,
    added: merged.added,
    updated: merged.updated,
    newly: merged.all
  };
}

/**
 * 从欧赔反推概率（和 build-jc.mjs 的 calcReco 同一套算法）。
 * 【为什么历史里要存这个】页面渲染「主 x% / 平 y% / 客 z%」时要用 prob，
 * 历史记录如果没有 prob，出页面时会直接崩（r.prob 是 null）。
 * 存下来还有个好处：显示的是【当时下单时】的概率，不会事后变。
 */
function probFromOdds(odds) {
  if (!odds) return null;
  const h = +odds.home;
  const d = +odds.draw;
  const a = +odds.away;
  if (!(h > 0) || !(d > 0) || !(a > 0)) return null;
  const raw = { home: 1 / h, draw: 1 / d, away: 1 / a };
  const sum = raw.home + raw.draw + raw.away;
  if (!sum) return null;
  return {
    home: +(raw.home / sum * 100).toFixed(1),
    draw: +(raw.draw / sum * 100).toFixed(1),
    away: +(raw.away / sum * 100).toFixed(1)
  };
}

/* ============================================================
   3b. 推荐类型：three（胜负平）/ unbeaten（不败）
   ------------------------------------------------------------
   【为什么要存进归档】在售列表（jc-data.js）的 reco.type 是 build-jc.mjs
   的 calcReco() 当场算的；一场比赛离开在售列表后只剩归档记录 —— 归档不带
   type 的话，卡片就只能按 'three' 判红黑，同一个推荐「在售时算红、进归档后
   算黑」，口径会变。所以归档必须把 type 一起留下来。

   【规则】和 build-jc.mjs 的 recoTypeOf(pick, prob) 【一字不差】（改一边
   必须改另一边，否则在售卡和归档卡的口径又会分叉）：
     pick === 'draw'                     → 'three'（平局没法用"不败"表达）
     prob[pick] >= 50%                   → 'three'（多数事件，单推合理）
     prob[pick] < 50% 且 +平局 >= 50%    → 'unbeaten'（改推更稳的那一边不败）
     概率缺失（当时没抓到赔率）           → 'three'（算不出来就不改推荐）

   【值从哪来 —— 优先从 prob 现算，不瞎填】
     · prob 本来就存在归档记录里（页面「主 x% / 平 y% / 客 z%」要用它），
       按同一套规则现算即可，不需要猜、也不编数。
     · game.reco.type 有值时以它为准（那是同一套规则当场算出来的同一个值）；
       老数据没有 type 就走现算 —— 这就是为什么 2026-10-17 之前的 59 场
       老归档也能补齐口径。
   ============================================================ */
const RECO_UNBEATEN_TOP = 50;

function recoTypeOf(pick, prob) {
  if (!pick || !prob) return 'three';        /* 算不出来 → 不改推荐 */
  if (pick === 'draw') return 'three';       /* 平局没法用「不败」表达 */
  const top = Number(prob[pick]);
  if (!Number.isFinite(top) || top >= RECO_UNBEATEN_TOP) return 'three';
  const ub = top + Number(prob.draw || 0);   /* 不败 = 胜 或 平 */
  if (!Number.isFinite(ub) || ub < RECO_UNBEATEN_TOP) return 'three';   /* 兜底 */
  return 'unbeaten';
}

/** 这场推荐是哪一种：reco.type 有值就用它，否则按 prob 现算（没有 prob → 'three'） */
function recoTypeOfRecord(reco, prob) {
  if (reco && (reco.type === 'unbeaten' || reco.type === 'three')) return reco.type;
  return recoTypeOf(reco && reco.pick, prob);
}

/**
 * 把一场比赛做成历史记录。
 * 返回 null 表示「这场没有任何有用信息」——既没比分也没推荐，收了也是空壳。
 */
function toHistoryRecord(game, fbList, at) {
  if (!game) return null;

  /* 比分优先用 football.js 的终场比分，其次用 jc-data 自己的 */
  const fb = findInFootball(game, fbList);
  const sc = (fb && scoresOf(fb)) || scoresOf(game);

  const reco = game.reco || (fb && fb.reco) || null;
  const pick = reco && reco.pick ? reco.pick : '';

  /* 两边都没有比分 → 这场只能记成「无结果」；连推荐都没有就没什么可记的 */
  if (!sc && !pick) return null;

  const eu = (game.odds && game.odds.europe) || (fb && fb.odds && fb.odds.europe) || null;
  const euV = eu ? (eu.live || eu.open) : null;
  const odds = euV ? { home: euV.home, draw: euV.draw, away: euV.away } : null;

  /* 页面要用的概率：优先用当时算好的 reco.prob，没有就从赔率反推 */
  const prob = (reco && reco.prob)
    || (game.reco && game.reco.prob)
    || (fb && fb.reco && fb.reco.prob)
    || probFromOdds(odds);

  /* 【推荐类型】three / unbeaten —— 规则和来源见上面 3b 段。
     注意用的是【算完的 prob】（优先当时存的，其次从赔率反推），
     所以老数据没 type 也能现算出来，不会瞎填。 */
  const type = recoTypeOfRecord(reco, prob);

  let result = '';
  let hit = false;
  if (sc && pick) {
    const actual = sc.h > sc.a ? 'home' : (sc.h === sc.a ? 'draw' : 'away');
    /* 【判定必须按 type 走】three 只中一个；unbeaten 主胜或平 / 客胜或平都算中。
       规则复用 jc-reco-archive.js 的 recoHit()（和页面 export-football.mjs
       的 recoHit 同一套口径，全场只此一份实现）。 */
    hit = recoHit({ pick, type }, actual);
    result = hit ? 'win' : 'lose';
  } else if (sc && !pick) {
    result = 'draw';  /* 没推荐，只有比分：借这个字段表示「仅记录结果」 */
    hit = false;
  }

  return {
    code: game.code || '',
    league: game.league || (fb && fb.league && fb.league.name) || '',
    home: (game.home && game.home.name) || '',
    away: (game.away && game.away.name) || '',
    time: game.time || (fb && fb.time) || '',
    score: sc ? `${sc.h}:${sc.a}` : '',
    hc: game.handicap != null ? game.handicap : null,
    /* 【亚指综合换算】跟着归档一起留下来，已完场的记录也保留当时的
       盘口 / 上下盘水位 / 水位换算的理论均衡占比。
       【注意】里面的 analysis 恒为 null —— 上盘真实资金占比 fundUp
       目前没有数据源，热度/爆冷推演不显示、也不编造（详见 asian-index.js）。 */
    asianIndex: game.asianIndex || null,
    odds,
    prob,
    pick,
    pickLabel: reco && reco.label ? reco.label : '',
    conf: reco && reco.confidence != null ? reco.confidence : null,
    /* 【推荐类型】three（胜负平）/ unbeaten（不败）—— 判定规则见上面 3b 段。
       出页面时按它判红黑（不败：主胜或平 / 客胜或平都算中），
       保证「在售时怎么算、进了归档还怎么算」，口径不漂移。 */
    type,
    result,
    hit,
    matched: !!fb,
    at: at || ''
  };
}

/** 一条历史记录的身份键集合（编号 + 队名日期 都算） */
function recordKeys(rec) {
  const keys = [];
  const ck = codeKey(rec && rec.code);
  if (ck) keys.push(`code:${ck}`);
  const g = { home: { name: rec && rec.home }, away: { name: rec && rec.away }, time: rec && rec.time };
  identityKeys(g).forEach((k) => keys.push(`id:${k}`));
  return keys;
}

/** 这条记录有没有「真结果」（有比分或有明确推荐） */
function hasRealResult(rec) {
  if (!rec) return false;
  if (rec.result === 'win' || rec.result === 'lose') return true;
  if (rec.result === 'draw' && rec.score) return true;
  if (rec.score && rec.pick) return true;
  return false;
}

/**
 * 合并新旧历史，去重。
 *
 * 【最重要的一条规则】已有结果的记录，绝不被「没结果 / 空」的记录覆盖。
 * 合并顺序：先放【带结果】的（新的优先，这样能补上更准的比分），
 *          再放【没结果】的（只在该场还没有任何记录时才加）。
 * 同一场只留一条：编号相同，或者 队名+日期 相同，都算同一场。
 *
 * @returns {{list:Array, added:number, updated:number, all:Array}}
 */
function mergeHistory(oldList, newList) {
  const oldArr = Array.isArray(oldList) ? oldList : [];
  const newArr = Array.isArray(newList) ? newList : [];

  /* 旧记录建索引，方便「新数据补全旧记录」 */
  const oldByKey = new Map();
  oldArr.forEach((r) => recordKeys(r).forEach((k) => { if (!oldByKey.has(k)) oldByKey.set(k, r); }));

  /* ---------- 1. 新记录：有结果的先上 ---------- */
  const withResult = newArr.filter(hasRealResult);
  const noResult = newArr.filter((r) => !hasRealResult(r));

  const out = [];
  const used = new Set();

  const push = (rec) => {
    /* 只保留一条：和已有条目同键就跳过 */
    const keys = recordKeys(rec);
    if (keys.some((k) => used.has(k))) return false;
    out.push(rec);
    keys.forEach((k) => used.add(k));
    return true;
  };

  let added = 0;
  let updated = 0;

  withResult.forEach((rec) => {
    /* 同一场旧记录里有结果、但新记录缺赔率/信心时，用旧的补齐 */
    const prev = recordKeys(rec).map((k) => oldByKey.get(k)).find(Boolean);
    let final = rec;
    if (prev && hasRealResult(prev)) {
      final = {
        ...prev, ...rec,
        /* 旧值兜底：新记录里为空/null 的字段不要覆盖旧的有值字段 */
        odds: rec.odds || prev.odds || null,
        prob: rec.prob || prev.prob || null,
        hc: (rec.hc !== null && rec.hc !== undefined) ? rec.hc : (prev.hc ?? null),
        /* 亚指换算结果：新增的没算出来（null）时，保留旧的 */
        asianIndex: rec.asianIndex || prev.asianIndex || null,
        pickLabel: rec.pickLabel || prev.pickLabel || '',
        conf: (rec.conf !== null && rec.conf !== undefined) ? rec.conf : (prev.conf ?? null),
        league: rec.league || prev.league || '',
        code: rec.code || prev.code || '',
        at: prev.at || rec.at || ''
      };
      /* 【最重要的一条】已经有比分的记录是【权威值】，绝不被重新推导的值覆盖。
         为什么必须这么硬：同一条记录可能被重新推导一次（比如这场又出现在
         oldJc 里，而 football.js 的比分后来被改了 / 数据源改错过），
         一旦让新推导的写进去，已经存下来的正确结果就被一个错比分顶掉了。
         真正需要「补」的情况（当时没比分、后来才有）由 backfill 那一步负责，
         那条路径的前提就是旧记录里【没有】比分 —— 两者不冲突。 */
      if (prev.score) {
        final.score = prev.score;
        final.result = prev.result;
        final.hit = prev.hit;
      }
      if (JSON.stringify(final) !== JSON.stringify(prev)) updated++;
    }
    if (push(final)) added++;
  });

  /* ---------- 2. 旧记录：带结果的先保留（按时间倒序排过，顺序稳定） ---------- */
  oldArr.forEach((rec) => {
    if (hasRealResult(rec)) push(rec);
  });

  /* ---------- 3. 没结果的：旧的无结果记录也留下（证明这场打完过，只是没找到比分） ---------- */
  oldArr.forEach((rec) => {
    if (!hasRealResult(rec)) push(rec);
  });
  noResult.forEach((rec) => { if (push(rec)) added++; });

  /* ---------- 4. 按时间倒序（最新打完的排最前） ---------- */
  out.sort((a, b) => {
    const ta = String(a.time || '');
    const tb = String(b.time || '');
    if (ta !== tb) return tb.localeCompare(ta);
    return String(b.at || '').localeCompare(String(a.at || ''));
  });

  return { list: out, added, updated, all: withResult };
}

/** 只保最近 N 场（默认 200），超了删最旧的 */
function trimHistory(list, max) {
  const lim = Number.isFinite(max) ? max : 200;
  const arr = Array.isArray(list) ? list : [];
  if (arr.length <= lim) return arr;
  /* 已经按时间倒序，直接砍尾巴 */
  return arr.slice(0, lim);
}

/* ============================================================
   5. 生成 jc-history.js 的文本
   ============================================================ */

/** 归档记录 → jc-data 里一場的形状（供页面直接当已完场渲染） */
function historyToGame(rec) {
  const m = /^(\d+)\s*[:：-]\s*(\d+)$/.exec(String(rec.score || ''));
  const hs = m ? +m[1] : null;
  const as = m ? +m[2] : null;
  const hasScore = hs !== null && as !== null;

  const pick = rec.pick || '';
  const pickLabel = rec.pickLabel
    || { home: '主胜', draw: '平局', away: '客胜' }[pick] || '';

  return {
    gid: rec.gid || ('hist-' + (rec.code || '') + '-' + String(rec.time || '').replace(/\D/g, '')),
    code: rec.code || '',
    league: rec.league || '',
    round: '',
    time: rec.time || '',
    handicap: rec.hc != null ? rec.hc : null,
    /* 【亚指综合换算】归档时存下来的那份，原样带回页面 */
    asianIndex: rec.asianIndex || null,
    home: { name: rec.home || '?', rank: null },
    away: { name: rec.away || '?', rank: null },
    score: hasScore ? { home: hs, away: as } : null,
    liveScore: null,
    status: 'finished',
    minute: 0,
    /* 页面只看 europe，亚盘/大小球历史里没留 */
    odds: rec.odds ? { europe: { open: null, live: rec.odds } } : null,
    reco: pick ? {
      pick,
      label: pickLabel,
      confidence: rec.conf != null ? rec.conf : null,
      /* 页面渲染「主 x%/平 y%/客 z%」要用它 —— 老记录没存就从赔率反推 */
      prob: rec.prob || probFromOdds(rec.odds),
      clear: false,
      margin: null,
      fromHistory: true
    } : null
  };
}

/** 把 jc-history.js 的内容渲染成文本 */
function renderHistoryJs(list, at) {
  const body = {
    updated: at || '',
    note: '竞彩已完场累积记录 —— 由 build-jc.mjs 自动维护，勿手改',
    list: Array.isArray(list) ? list : []
  };
  return '/* jc-history.js —— 竞彩【已完场】累积记录（程序生成，勿手改）\n' +
    '   为什么需要：体彩「在售」列表只含还能买的比赛，一开完就消失，\n' +
    '   所以必须自己把打完的比赛存下来，已完场才不会永远是 0。 */\n' +
    'const JC_HISTORY = ' + JSON.stringify(body, null, 1) + ';\n';
}

export {
  ALIAS, TRAD,
  norm, sameTeam, codeKey, identityKeys, dayOf, scoresOf,
  findInFootball, archiveJcHistory, toHistoryRecord,
  mergeHistory, trimHistory, hasRealResult, recordKeys,
  historyToGame, renderHistoryJs,
  /* 【推荐类型】给回填老归档 / 单测复用，保证用的是同一个 recoTypeOf */
  RECO_UNBEATEN_TOP, recoTypeOf, recoTypeOfRecord
};
