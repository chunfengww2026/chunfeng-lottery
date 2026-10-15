// ============================================================
//  export-football.mjs —— 生成足球只读分享页（只显示竞猜场次）
//
//  产物：足球推荐.html —— 自包含单文件，发出去只能看
//
//  【数据源】
//    jc-data.js     —— 体彩竞彩【在售】比赛（官方场次，每天 10~20 场）
//    jc-history.js  —— 竞彩【已完场】累积记录（build-jc.mjs 归档出来的）
//
//  【为什么要有 jc-history】
//    在售列表只含还能买的比赛，一开完赛就从列表里消失 ——
//    所以「已完场」如果只读 jc-data 会【永远是 0 场】。
//    build-jc.mjs 每跑一次就把打完的比赛归档进 jc-history.js，
//    这里把两边合并，已完场才真的能累积起来。
//
//  内容：未开赛 / 进行中 / 已完场 三个分区
//        每场：竞彩编号、联赛、球队+排名、比分、赔率、推荐
//        完场明确标出「红（命中）/ 黑（未中）」
//
//  用法：node export-football.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/* 【自测用】DSH_JC_ROOT 可以把数据目录指到别处（用夹具验证页面，不碰真数据） */
const ROOT = process.env.DSH_JC_ROOT
  ? path.resolve(process.env.DSH_JC_ROOT)
  : path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, '足球推荐.html');

/* 代码目录：DSH_JC_ROOT 只改【数据目录】，不改代码目录 */
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/* ---------- 亚指综合换算（算法在 asian-index.js，只有一份） ----------
   用 vm 读进来而不是 import：asian-index.js 是普通浏览器脚本
   （football.html 里 <script src> 直接用），不能同时写 export。 */
function loadAsianIndex() {
  const p = path.join(SCRIPT_DIR, 'asian-index.js');
  if (!fs.existsSync(p)) { console.error('⚠️ 缺 asian-index.js —— 页面不做亚指换算'); return null; }
  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + `
globalThis.__AI = { ASIAN_INDEX_CALC, calcAsianIndexAnalysis, asianHotRule,
  asianHandicapFromLine, buildAsianIndex, asianIndexView, getFundUp };`, c);
    return c.__AI;
  } catch (e) {
    console.error(`⚠️ asian-index.js 解析失败：${e.message} —— 页面不做亚指换算`);
    return null;
  }
}
const AI = loadAsianIndex();

/* ---------- 读数据 ---------- */
function loadVar(file, varName) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return null;
  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + `\nglobalThis.__X = ${varName};`, c);
    return c.__X;
  } catch (e) {
    console.error(`⚠️ ${file} 解析失败：${e.message}`);
    return null;
  }
}

const JC = loadVar('jc-data.js', 'JC_DATA');
if (!JC || !Array.isArray(JC.games) || !JC.games.length) {
  console.error('❌ 找不到竞彩数据（jc-data.js），请先运行 build-jc.mjs');
  process.exit(1);
}

/* 已完场累积记录（可能还没有这个文件 —— 第一次跑 build-jc.mjs 之后才有） */
const HIST = loadVar('jc-history.js', 'JC_HISTORY');

/* football.js 用来补充实时比分（可选） */
const FB = loadVar('football.js', 'FOOTBALL_DATA');

/* 【体彩官网在售场次】jc-official.js 由 build-jc-count.mjs 每小时抓一次，
   里面 JC_OFFICIAL.inSale 是体彩官网公布的【真实】在售场次。
   读取方式和上面 jc-data.js / jc-history.js / football.js 完全一样。
   拿不到（文件还没生成 / 解析失败）时返回 null，页面自动退回原来的
   stat.upcoming + stat.live，绝不会因为少这个文件就崩。 */
const JC_OFFICIAL = loadVar('jc-official.js', 'JC_OFFICIAL');

/* ---------- 工具 ---------- */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function timeHM(dt) {
  const m = /(\d{2}):(\d{2})/.exec(dt || '');
  return m ? `${m[1]}:${m[2]}` : '';
}
function dateMD(dt) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(dt || '');
  return m ? `${m[2]}-${m[3]}` : '';
}
function weekCN(dt) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(dt || '');
  if (!m) return '';
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

/* ---------- 用 football.js 补实时比分 ---------- */
const ALL_FB = FB && FB.lists
  ? [...(FB.lists.upcoming || []), ...(FB.lists.live || []), ...(FB.lists.finished || [])]
  : [];

/* 繁简 + 简写对照
   【注意】这份表和 jc-archive.mjs 里的 ALIAS / TRAD 是同一套规则，
   两边要一起改，否则「归档时能配上的队名、出页面时又配不上」。
   这里只影响 jc-data 场次去 football.js 补实时比分，漏配只是少个比分，不会出错。 */
const ALIAS = {
  /* jc-data（竞彩简称）→ football.js（245qq 写法） */
  '南安普敦': '南安普顿', '贝蒂斯': '皇家贝蒂斯', '维拉': '阿斯顿维拉',
  '曼城': '曼彻斯特城', '巴黎圣曼': '巴黎圣日耳曼', '弗鲁米嫩': '弗鲁米嫩塞',
  '帕梅拉斯': '帕尔梅拉斯', '圣路易斯城': '圣路易斯市', '温哥华': '温哥华白帽',
  '皇马': '皇家马德里', '巴萨': '巴塞罗那', '马竞': '马德里竞技',
  '曼联': '曼彻斯特联', '国米': '国际米兰', '拜仁': '拜仁慕尼黑',
  '莱红牛': '莱比锡红牛', '米堡': '米德尔斯堡', '那不勒斯': '拿玻里',
  '比利亚雷': '比利亚雷亚尔', '加拉塔萨': '加拉塔萨雷',
  '埃因霍温': 'PSV埃因霍温', '里斯本': '葡萄牙体育',
  '纽喷气机': '纽卡斯尔喷气机', '博德闪耀': '博多格林特'
};

/* 繁体 → 简体（队名常见字） */
const TRAD = {
  '溫': '温', '爾': '尔', '蘭': '兰', '維': '维', '薩': '萨', '羅': '罗',
  '馬': '马', '德': '德', '聯': '联', '競': '竞', '體': '体', '門': '门',
  '興': '兴', '達': '达', '萊': '莱', '錫': '锡', '圖': '图', '倫': '伦',
  '佈': '布', '雷': '雷', '斯': '斯', '頓': '顿', '漢': '汉', '堡': '堡',
  '聖': '圣', '貝': '贝', '華': '华', '魯': '鲁', '輔': '辅', '亞': '亚',
  '內': '内', '納': '纳', '傑': '杰', '飛': '飞', '紅': '红', '紐': '纽',
  '約': '约', '廣': '广', '島': '岛', '國': '国', '際': '际', '業': '业',
  '費': '费', '熱': '热', '銀': '银', '礦': '矿', '澤': '泽', '車': '车',
  '東': '东', '蘇': '苏', '愛': '爱'
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

function norm(s) {
  const simp = toSimp(String(s || '').trim());
  const aliased = ALIAS[simp] || simp;
  return stripNoise(aliased)
    .replace(/[（(].*?[)）()]/g, '')
    .replace(/[\s\-·.]/g, '')
    .toLowerCase();
}

/* 青年队 / 后备队 / 女足 必须和成年队区分开，否则「维拉」会配到「阿斯顿维拉U19」 */
const YOUTH_RE = /(U\d{2}|女足|后备队|预备队|青年队|B队|二队|II队)/i;

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

const dayOf = (t) => String(t || '').slice(0, 10);

/** 找 football.js 里对应的那场（用来拿实时比分） */
function findFb(g) {
  if (!ALL_FB.length) return null;
  const jd = dayOf(g.time);
  return ALL_FB.find((m) => {
    const d1 = new Date(jd + 'T00:00:00').getTime();
    const d2 = new Date(dayOf(m.time) + 'T00:00:00').getTime();
    if (Math.abs(d1 - d2) > 86400000) return false;
    return sameTeam(g.home.name, m.home.name) && sameTeam(g.away.name, m.away.name);
  }) || null;
}

/* ---------- 整理每场的展示数据 ---------- */
const kindCN = { upcoming: '未开赛', live: '进行中', finished: '已完场' };

/* ============================================================
   把 jc-history.js 的归档记录转成和 jc-data 一样的形状，
   这样后面的 prep / renderMatch / 统计全都不用改逻辑。
   ============================================================ */
/** 老记录可能没存 prob（早期版本），从欧赔反推一下，免得渲染时 r.prob 是 null */
function probFromOdds(odds) {
  if (!odds) return null;
  const h = +odds.home, d = +odds.draw, a = +odds.away;
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

function historyToGame(rec) {
  const m = /^(\d+)\s*[:：-]\s*(\d+)$/.exec(String(rec.score || ''));
  const hs = m ? +m[1] : null;
  const as = m ? +m[2] : null;
  const hasScore = hs !== null && as !== null;

  const pick = rec.pick || '';
  const label = rec.pickLabel
    || { home: '主胜', draw: '平局', away: '客胜' }[pick] || '';

  return {
    gid: 'hist-' + (rec.code || '') + '-' + String(rec.time || '').replace(/\D/g, ''),
    code: rec.code || '',
    league: rec.league || '',
    round: '',
    time: rec.time || '',
    handicap: rec.hc != null ? rec.hc : null,
    /* 【亚指综合换算】归档时存下来的那份（老记录没有 → null → 不显示） */
    asianIndex: rec.asianIndex || null,
    home: { name: rec.home || '?', rank: null },
    away: { name: rec.away || '?', rank: null },
    score: hasScore ? { home: hs, away: as } : null,
    liveScore: null,
    status: 'finished',
    minute: 0,
    odds: rec.odds ? { europe: { open: null, live: rec.odds } } : null,
    reco: pick ? {
      pick, label,
      confidence: rec.conf != null ? rec.conf : null,
      prob: rec.prob || probFromOdds(rec.odds),
      clear: false, margin: null,
      fromHistory: true
    } : null
  };
}

/* 历史记录的身份键（用来和本次在售的去重） */
const histKey = (r) => {
  const ck = /[周週]([一二三四五六日天])\s*0*(\d{1,3})/.exec(String(r.code || ''));
  if (ck) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
    return 'code:周' + map[ck[1]] + '-' + String(ck[2]).padStart(3, '0');
  }
  const tp = [norm(r.home), norm(r.away)].sort().join('|');
  return tp ? 'id:' + tp + '@' + dayOf(r.time) : '';
};

/* 本次在售里已有的身份键 —— 历史里重复的就不再单独显示 */
const jcKeys = new Set();
JC.games.forEach((g) => {
  const ck = /[周週]([一二三四五六日天])\s*0*(\d{1,3})/.exec(String(g.code || ''));
  if (ck) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
    jcKeys.add('code:周' + map[ck[1]] + '-' + String(ck[2]).padStart(3, '0'));
  }
  const tp = [norm(g.home && g.home.name), norm(g.away && g.away.name)].sort().join('|');
  if (tp) jcKeys.add('id:' + tp + '@' + dayOf(g.time));
});

/* 历史（去重 + 按时间倒序） */
const HIST_LIST = (HIST && Array.isArray(HIST.list)) ? HIST.list : [];
const HIST_GAMES = [];
const seenHist = new Set();
HIST_LIST.forEach((r) => {
  if (!r) return;
  const k = histKey(r);
  if (k && (jcKeys.has(k) || seenHist.has(k))) return;
  if (k) seenHist.add(k);
  HIST_GAMES.push(historyToGame(r));
});

/* 已完场 = 本次在售里完场的 + 历史累积的 */
const ALL_GAMES = [...JC.games, ...HIST_GAMES];

function prep(g) {
  const fb = findFb(g);

  /* 【亚指综合换算】优先用 build-jc.mjs 存好的那份；
     jc-data.js 还是旧版（没存）时就地算一遍，页面不至于空着。
     算不出来（没亚盘 / 认不出盘口）→ null → 整块不显示。 */
  let asianIndex = g.asianIndex || null;
  if (!asianIndex && AI && typeof AI.buildAsianIndex === 'function') {
    try { asianIndex = AI.buildAsianIndex(g); } catch (e) { asianIndex = null; }
  }

  /* 比分优先级：football.js 实时比分 > jc-data 自己的比分 */
  let hs = null, as = null;
  if (fb && fb.home && fb.home.score !== null && fb.home.score !== undefined) {
    hs = fb.home.score; as = fb.away.score;
  } else if (g.liveScore && g.liveScore.home !== null && g.liveScore.home !== undefined) {
    hs = g.liveScore.home; as = g.liveScore.away;
  } else if (g.score && g.score.home !== null && g.score.home !== undefined) {
    hs = g.score.home; as = g.score.away;
  }

  const hasScore = hs !== null && hs !== undefined && as !== null && as !== undefined;
  const kind = g.status || 'upcoming';

  /* 判定结果 */
  let result = null;
  if (hasScore) {
    const actual = hs > as ? 'home' : (hs === as ? 'draw' : 'away');
    const actualLabel = actual === 'home' ? '主胜' : (actual === 'draw' ? '平局' : '客胜');
    const hit = !!(g.reco && g.reco.pick === actual);
    result = { actual, actualLabel, hit, score: `${hs} - ${as}`, settled: kind === 'finished' };
  }

  return {
    gid: g.gid, code: g.code, league: g.league, round: g.round,
    time: g.time, handicap: g.handicap,
    home: g.home, away: g.away,
    minute: (fb && fb.minute) || g.minute || 0,
    odds: g.odds, reco: g.reco, kind, hasScore, hs, as, result,
    asianIndex,
    /* 这场是从 jc-history 归档来的（不是本次在售）→ 卡片样式区分一下 */
    fromHistory: !!(g.reco && g.reco.fromHistory)
  };
}

/* 【关键】这里必须用合并后的 ALL_GAMES（在售 + 历史），
   否则「已完场」还是只有本次在售里完场的那几场，历史累积的不显示。 */
const MATCHES = ALL_GAMES.map(prep);

/* 本次在售有多少场完场（和总数区分开，页面上会标） */
const JC_FINISHED = JC.games.filter((g) => (g.status || '') === 'finished').length;

/* ---------- 统计 ---------- */
const stat = {
  total: MATCHES.length,
  upcoming: MATCHES.filter((m) => m.kind === 'upcoming').length,
  live: MATCHES.filter((m) => m.kind === 'live').length,
  /* finished 含【历史累积】的场次 —— 这就是「已完场能累积」的关键 */
  finished: MATCHES.filter((m) => m.kind === 'finished').length,
  /* 其中这一次在售里完场的几场（其余是历史归档来的） */
  finishedToday: JC_FINISHED,
  history: HIST_GAMES.length,
  settled: 0, hit: 0, miss: 0
};
MATCHES.forEach((m) => {
  if (m.kind === 'finished' && m.result) {
    stat.settled++;
    if (m.result.hit) stat.hit++; else stat.miss++;
  }
});
stat.rate = stat.settled ? ((stat.hit / stat.settled) * 100).toFixed(1) : '0.0';

/* ---------- 「体彩竞彩在售 N 场」的那个 N ----------
   优先用体彩官网的数字（jc-official.js 的 inSale，build-jc-count.mjs 每小时抓）；
   拿不到就用本地竞彩数据算的 upcoming + live 兜底（和改动前完全一样）。
   注意 inSale 必须先确认是「数字本身或纯数字字符串」：
   Number(null) 是 0、Number('') 也是 0，直接 Number() 会把没值的
   jc-official.js 当成「在售 0 场」显示出去。 */
const rawInSale = JC_OFFICIAL ? JC_OFFICIAL.inSale : null;
const OFFICIAL = (typeof rawInSale === 'number' && Number.isFinite(rawInSale)) ||
  (typeof rawInSale === 'string' && /^\s*\d+\s*$/.test(rawInSale))
  ? Number(rawInSale) : null;
const IN_SALE = OFFICIAL === null ? (stat.upcoming + stat.live) : OFFICIAL;

/* ---------- 数据更新时间 ----------
   jc-data.updated 是「在售列表」的时间，jc-history.updated 是归档时间，
   页面上显示两者里较新的那个，免得页脚写着「更新于」却是几小时前的在售时间。 */
const LATEST_UPDATED = [JC.updated, HIST && HIST.updated]
  .filter(Boolean).sort().pop() || JC.updated || '';

const recoDist = { home: 0, draw: 0, away: 0, none: 0 };
MATCHES.forEach((m) => { if (m.reco) recoDist[m.reco.pick]++; else recoDist.none++; });

/* ============================================================
   奖金试算器 · 数据准备（页面上的 SP 赔率）
   ------------------------------------------------------------
   【赔率来源】体彩官网 webapi.sporttery.cn（getMatchCalculatorV1）的
   【官方 SP 原值】：had = 胜平负（主胜/平/客胜）、hhad = 让球胜平负（让球数 + 三项）。
   由 build-jc.mjs 抓到后写进 jc-data.js 顶层的 sp 块 —— 本机可抓，
   云端（美国 IP）抓不到时 build-jc.mjs 会沿用上一次那份（source='carried'）。
   这里【原样使用】：不换算、不估算、不编数字。没有 sp 就显示「暂无」。

   【可试算的场次】
     · 必须有官方 SP（had 或 hhad）
     · 已完场的去掉（竞彩开赛前就停售，完场更不能投注）
     · SP 是「沿用上次」的（可能已过几小时）→ 再剔掉已过开赛时间的
   ============================================================ */
const SP = (JC && JC.sp && Array.isArray(JC.sp.list) && JC.sp.list.length) ? JC.sp : null;
const SP_SRC_CN = !SP
  ? '暂无官方 SP 数据'
  : (SP.source === 'official'
    ? `体彩官网官方 SP（抓取于 ${SP.updated || '—'}）`
    : SP.source === 'carried'
      ? `体彩官网官方 SP（沿用上次抓取 ${SP.updated || '—'}）`
      : '暂无官方 SP 数据');

const NOW_MS = Date.now();
function kickMs(t) {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(t || ''));
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

/* 本次【在售列表】(jc-data) 里每场的状态：编号@日期 → status。
   ⚠️ 只认在售列表，【不认】历史归档 —— 归档记录是「从在售列表消失」就记下来的，
   没有终场比分的那种（比赛还没开踢）也会被标成 finished，
   用它来判「这场不能投注」会把还在官方在售的比赛误删。
   （编号每天复用，所以必须带上日期一起比。） */
const JC_SALE_STATUS = new Map();
JC.games.forEach((g) => {
  if (g && g.code) JC_SALE_STATUS.set(`${g.code}@${dayOf(g.time)}`, g.status || 'upcoming');
});

const CALC_ROWS = (SP ? SP.list : []).filter((r) => {
  if (!r || !(r.had || r.hhad)) return false;
  /* 本次在售里明确已经完场的 → 不能投注，剔掉 */
  if (JC_SALE_STATUS.get(`${r.code}@${dayOf(r.time)}`) === 'finished') return false;
  if (SP.source === 'carried') {
    const t = kickMs(r.time);
    if (!isNaN(t) && t <= NOW_MS) return false;   /* 已开赛 → 竞彩已停售 */
  }
  return true;
}).map((r) => ({
  code: r.code || '', league: r.league || '', time: r.time || '',
  home: r.home || '', away: r.away || '',
  had: r.had ? { h: r.had.h, d: r.had.d, a: r.had.a } : null,
  hhad: r.hhad ? { line: r.hhad.line || '', h: r.hhad.h, d: r.hhad.d, a: r.hhad.a } : null
}));

/* ---------- 渲染 ---------- */
function oddsRow(label, v, pickKey) {
  if (!v) return '';
  const cell = (txt, on) => (txt === null || txt === undefined || txt === '')
    ? '' : `<span class="m-ov${on ? ' on' : ''}">${esc(txt)}</span>`;
  return `<div class="m-odds"><span class="m-ol">${label}</span>${cell(v.a, false)}${cell(v.b, pickKey === 'b')}${cell(v.c, pickKey === 'c')}</div>`;
}

/* ============================================================
   亚指综合换算卡片
   ------------------------------------------------------------
   · 真拿到「上盘真实资金占比 fundUp」时：结论标签 + 热度文案 + 理论/真实资金 + 偏差
   · 没拿到时（【当前就是这种】）：【整块不显示热度推演】，只显示由真实水位
     换算出来的「水位隐含 · 理论均衡占比」+ 走水判定，并如实标注数据缺失 ——
     不显示任何编造的数字。
   【合规】带「仅娱乐参考」；标签只用中性词（爆冷 / 输盘 / 赢盘 / 走水机会 / 胜负难分）。
   ============================================================ */
const devNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
function devCls(v) {
  const n = devNum(v);
  if (n === null) return '';
  return n > 0 ? 'up' : (n < 0 ? 'down' : '');
}
function devText(v) {
  const n = devNum(v);
  if (n === null) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

function renderAsianCard(m) {
  if (!AI || typeof AI.asianIndexView !== 'function') return '';
  let ai = null;
  try { ai = AI.asianIndexView(m.asianIndex); } catch (e) { return ''; }
  if (!ai) return '';            /* 没有亚指数据 → 整块不显示 */

  const head =
    `<div class="m-ai-head">` +
    `<span class="m-ai-title">亚指综合换算</span>` +
    (ai.hasFund && ai.conclusionTag ? `<span class="m-ai-tag">${esc(ai.conclusionTag)}</span>` : '') +
    `<span class="m-ai-fun">仅娱乐参考</span>` +
    `</div>`;

  const line =
    `<div class="m-ai-line">盘口 ${esc(ai.line)}（${esc(ai.fromText)}）· ${esc(ai.handicapText)}` +
    ` · 上盘 ${esc(ai.upSideText)} · 上 ${esc(ai.upWater)} / 下 ${esc(ai.downWater)}` +
    ` · ${esc(ai.canWaterText)}</div>`;

  const change = ai.changeType
    ? `<div class="m-ai-change"><span class="m-ai-change-tag">${esc(ai.changeType)}</span>` +
      `<span class="m-ai-change-d">${esc(ai.changeDetail)}</span></div>`
    : '';

  let grid = '';
  if (ai.hasFund) {
    grid =
      `<div class="m-ai-grid">` +
      `<span class="m-ai-cell"><i>理论上盘资金</i><b>${esc(ai.theoryUp)}%</b></span>` +
      `<span class="m-ai-cell on"><i>真实上盘资金</i><b>${esc(ai.fundUp)}%</b></span>` +
      `<span class="m-ai-cell"><i>理论下盘资金</i><b>${esc(ai.theoryDown)}%</b></span>` +
      `<span class="m-ai-cell on"><i>真实下盘资金</i><b>${esc(ai.fundDown)}%</b></span>` +
      `</div>` +
      `<div class="m-ai-dev"><span class="m-ai-dev-v ${devCls(ai.devUp)}">偏差 ${devText(ai.devUp)}</span>` +
      `<span class="m-ai-dev-u">（上盘真实 − 理论上盘）</span></div>` +
      (ai.hotText ? `<div class="m-ai-hot">${esc(ai.hotText)}</div>` : '') +
      (ai.fundUpSource ? `<div class="m-ai-src">资金占比来源：${esc(ai.fundUpSource)}</div>` : '');
  } else {
    grid =
      `<div class="m-ai-grid">` +
      `<span class="m-ai-cell"><i>水位隐含 · 理论上盘</i><b>${esc(ai.theoryUp)}%</b></span>` +
      `<span class="m-ai-cell"><i>水位隐含 · 理论下盘</i><b>${esc(ai.theoryDown)}%</b></span>` +
      `</div>`;
  }

  const miss = ai.missingText ? `<div class="m-ai-miss">${esc(ai.missingText)}</div>` : '';
  const note = ai.note ? `<div class="m-ai-note">${esc(ai.note)}</div>` : '';

  return `<div class="m-ai">${head}${line}${change}${grid}${miss}${note}</div>`;
}

function renderMatch(m) {
  const eu = m.odds && m.odds.europe;
  const euV = eu && (eu.live || eu.open);
  const as = m.odds && m.odds.asian;
  const asV = as && (as.live || as.open);
  const ou = m.odds && m.odds.overunder;
  const ouV = ou && (ou.live || ou.open);
  const r = m.reco;

  const hc = m.handicap ? `<span class="m-hc">(${esc(m.handicap)})</span>` : '';
  const hs = m.home && m.home.rank ? `<i>[${m.home.rank}]</i>` : '';
  const asR = m.away && m.away.rank ? `<i>[${m.away.rank}]</i>` : '';

  /* 状态标签 */
  let st = '';
  if (m.kind === 'live') st = `<span class="m-st live">${m.minute ? m.minute + "'" : '进行中'}</span>`;
  else if (m.kind === 'finished') st = '<span class="m-st fin">完场</span>';

  /* 历史归档场次：卡片加 .hist（虚线左边框 + 略淡），一眼看出不是本次在售 */
  const cls = 'm-card'
    + (m.result && m.result.settled ? (m.result.hit ? ' win' : ' lose') : '')
    + (m.fromHistory ? ' hist' : '');

  return (
    `<div class="${cls}">` +
    `<div class="m-top">` +
    (m.code ? `<span class="m-code">${esc(m.code)}</span>` : '') +
    `<span class="m-league">${esc(m.league || '')}</span>` +
    (m.round ? `<span class="m-round">${esc(m.round)}</span>` : '') +
    st +
    `<span class="m-time">${esc(dateMD(m.time))} ${esc(timeHM(m.time))}</span>` +
    `</div>` +
    `<div class="m-teams">` +
    `<span class="m-team home">${hs}${esc(m.home.name)}${hc}</span>` +
    `<span class="m-vs${m.kind === 'live' ? ' live' : ''}">${m.hasScore ? m.hs + ' - ' + m.as : 'VS'}</span>` +
    `<span class="m-team away">${esc(m.away.name)}${asR}</span>` +
    `</div>` +
    (euV ? `<div class="m-odds"><span class="m-ol">欧赔</span>` +
      (euV.home != null ? `<span class="m-ov${r && r.pick === 'home' ? ' on' : ''}">主 ${euV.home}</span>` : '') +
      (euV.draw != null ? `<span class="m-ov${r && r.pick === 'draw' ? ' on' : ''}">平 ${euV.draw}</span>` : '') +
      (euV.away != null ? `<span class="m-ov${r && r.pick === 'away' ? ' on' : ''}">客 ${euV.away}</span>` : '') +
      `</div>` : '') +
    (asV ? `<div class="m-odds"><span class="m-ol">亚盘</span>` +
      (asV.home != null ? `<span class="m-ov">${asV.home}</span>` : '') +
      (asV.line ? `<span class="m-ov">${esc(asV.line)}</span>` : '') +
      (asV.away != null ? `<span class="m-ov">${asV.away}</span>` : '') +
      `</div>` : '') +
    (ouV ? `<div class="m-odds"><span class="m-ol">大小</span>` +
      (ouV.line != null ? `<span class="m-ov">${ouV.line}</span>` : '') +
      (ouV.over != null ? `<span class="m-ov">大 ${ouV.over}</span>` : '') +
      (ouV.under != null ? `<span class="m-ov">小 ${ouV.under}</span>` : '') +
      `</div>` : '') +
    (r ? `<div class="m-reco">` +
      `<span class="m-pick">推荐 <b>${esc(r.label)}</b></span>` +
      (m.result && m.result.settled ? `<span class="m-rb ${m.result.hit ? 'hit' : 'miss'}">${m.result.hit ? '红' : '黑'}</span>` : '') +
      `<span class="m-conf">${m.result && m.result.settled
        ? '最终 ' + esc(m.result.actualLabel) + '（' + esc(m.result.score) + '）'
        : '信心 ' + r.confidence + '%'}</span>` +
      `<span class="m-probs">` +
      /* prob 可能为 null（这场当时没抓到赔率）→ 显示 —，不能直接取 .home */
      `<i class="${r.pick === 'home' ? 'on' : ''}">主${r.prob ? r.prob.home : '—'}%</i>` +
      `<i class="${r.pick === 'draw' ? 'on' : ''}">平${r.prob ? r.prob.draw : '—'}%</i>` +
      `<i class="${r.pick === 'away' ? 'on' : ''}">客${r.prob ? r.prob.away : '—'}%</i>` +
      `</span></div>` : '<div class="m-reco"><span class="m-noodds">暂无赔率</span></div>') +
    renderAsianCard(m) +
    `</div>`
  );
}

/* ============================================================
   奖金试算器（渲染）
   ------------------------------------------------------------
   · 赔率是【官方 SP 原值】（见上面数据准备段的说明）
   · 勾选 / 倍数由页面上的纯前端脚本实时算（不发任何请求、不刷新页面）
   · 【交互边界】竞彩页上只有这一块可以操作；不写任何本地存储
     （浏览器存储 API 一个都不用），刷新页面全部回到默认（全不勾选、倍数 1）
   · 规则见区块底部「怎么算的」，合规声明单独一行放在最下面
   ============================================================ */
const CALC_MAX_PARLAY = 8;   /* 体彩：胜平负 / 让球胜平负 最多 8 关 */

function renderCalc() {
  const head =
    `<div class="calc-head">` +
    `<span class="calc-title">奖金试算</span>` +
    `<span class="calc-tag">仅供娱乐参考</span>` +
    `<span class="calc-src">赔率：${esc(SP_SRC_CN)}</span>` +
    `</div>`;

  const rules =
    `<div class="calc-note">` +
    `<b>怎么算的</b>（按体彩竞彩官方规则）：<br>` +
    `· 单注固定 <b>2 元</b>。<b>单注奖金</b> = 2 元 × 所选各场固定奖金额连乘，按官方规则保留 2 位小数（第 3 位 0~4 舍、6~9 进、5 看第 2 位奇偶，偶舍奇进）。<br>` +
    `· <b>总投注额</b> = 注数 × 2 元 × 倍数；中奖时按【中的那一注】算奖金，再乘倍数。<br>` +
    `· 只勾 1 场 = <b>单关</b>；勾 2 场及以上 = <b>过关</b>（串关）。同一场勾多个结果 = <b>复式</b>，注数 = 各场勾选个数的乘积。<br>` +
    `· <b>单注最高奖金限额</b>：单关 10 万元 · 2~3 关 20 万元 · 4~5 关 50 万元 · 6 关及以上 100 万元（超出部分按限额兑付）。<br>` +
    `· 胜平负 / 让球胜平负最多 <b>${CALC_MAX_PARLAY} 关</b>；同一场比赛的「胜平负」与「让球胜平负」<b>不能混合过关</b>（体彩规则，遇到这种勾选本工具不计算并提示）。<br>` +
    `· 单关只有在官方开放单关的场次才能投注，本工具<b>不判断该资格</b>，请以官方为准。<br>` +
    `· 赔率随时会变，一切以官方最终公布为准。` +
    `</div>`;

  /* 【合规声明】这一块自己的底部声明（不与页面最底部的免责声明重复堆砌） */
  const disclaim =
    `<div class="calc-disclaim">本工具仅为奖金试算演示，数据仅供参考，` +
    `<b>仅供娱乐，不构成购彩建议</b>，请理性购彩。</div>`;

  if (!CALC_ROWS.length) {
    return `<div class="calc" id="jcCalc">${head}` +
      `<div class="calc-empty">暂无可试算的竞彩 SP 赔率（${esc(SP ? (SP.from || '') : 'jc-data.js 里没有 sp 数据')}）。` +
      `SP 抓不到时本区块不会显示数字，也绝不估算。</div>` +
      rules + disclaim + `</div>`;
  }

  const rows = CALC_ROWS.map((r) => {
    const opt = (pool, key, label, odds) => (odds == null ? '' :
      `<label class="calc-opt"><input class="calc-cb" type="checkbox" value="${esc(r.code)}|${pool}|${key}">` +
      `<span class="calc-opt-t">${label}</span><span class="calc-opt-o">${odds}</span></label>`);
    return `<div class="calc-row">` +
      `<div class="calc-mt"><span class="calc-code">${esc(r.code)}</span>` +
      `<span class="calc-league">${esc(r.league)}</span>` +
      `<span class="calc-time">${esc(dateMD(r.time))} ${esc(timeHM(r.time))}</span></div>` +
      `<div class="calc-teams">${esc(r.home)}<span class="calc-vs">VS</span>${esc(r.away)}</div>` +
      (r.had ? `<div class="calc-opts"><span class="calc-ol">胜平负</span>` +
        opt('had', 'h', '主胜', r.had.h) + opt('had', 'd', '平', r.had.d) + opt('had', 'a', '客胜', r.had.a) +
        `</div>` : '') +
      (r.hhad ? `<div class="calc-opts"><span class="calc-ol">让球${esc(r.hhad.line)}</span>` +
        opt('hhad', 'h', '主胜', r.hhad.h) + opt('hhad', 'd', '平', r.hhad.d) + opt('hhad', 'a', '客胜', r.hhad.a) +
        `</div>` : '') +
      `</div>`;
  }).join('');

  /* 纯前端脚本要用的赔率：内联成 JSON。
     【注意】必须把 < 转义，否则 JSON 里的字符串可能提前闭合 <script>。 */
  const payload = JSON.stringify(CALC_ROWS.map((r) => ({ code: r.code, had: r.had, hhad: r.hhad })))
    .replace(/</g, '\\u003c');

  const bar =
    `<script type="application/json" id="jcCalcData">${payload}</script>` +
    `<div class="calc-bar">` +
    `<div class="calc-stat">` +
    `<span>已选 <b id="calcN">0</b> 关</span>` +
    `<span>共 <b id="calcBets">0</b> 注</span>` +
    `<span>总投注 <b id="calcCost">¥0.00</b></span>` +
    `<span class="calc-mul"><label for="calcMul">倍数</label>` +
    `<input id="calcMul" type="number" min="1" max="99" step="1" value="1"></span>` +
    `<a role="button" tabindex="0" class="calc-btn" id="calcClear">清空</a>` +
    `</div>` +
    `<div class="calc-prize"><span class="calc-prize-l">预计奖金</span>` +
    `<b id="calcPrize">¥0.00</b>` +
    `<span class="calc-prize-h" id="calcPrizeHint">还没勾选场次</span></div>` +
    `<div class="calc-warn" id="calcWarn"></div>` +
    `<div class="calc-foot">单注 2 元（体彩竞彩固定）；倍数越大，总投注与预计奖金同步放大。</div>` +
    `</div>`;

  return `<div class="calc" id="jcCalc">${head}` +
    `<div class="calc-sub">勾选你看好的结果 → 自动按体彩竞彩规则算预计奖金（纯前端计算，不刷新页面）</div>` +
    `<div class="calc-rows">${rows}</div>` +
    bar + rules + disclaim +
    `</div>`;
}

/* 分组 */
const order = [['upcoming', '未开赛'], ['live', '进行中'], ['finished', '已完场']];
let cards = '';
order.forEach(([kind, label]) => {
  const arr = MATCHES.filter((m) => m.kind === kind);
  if (kind === 'finished') arr.sort((a, b) => String(b.time).localeCompare(String(a.time)));
  else arr.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  /* __FB_SEC_COL__ 用户要求：三个分段（未开赛/进行中/已完场）
     也要能收起，默认【收起】，点了才展开 —— 和彩票推荐那边的架构一致。
     用原生 <details> 折叠（不写 JS 也能用），提示文字由 CSS 按 [open] 切换。 */
  cards += `<details class="m-sec" id="sec-${kind}">` +
    `<summary class="m-subhead">${label}<span class="m-subcount">${arr.length} 场</span>` +
    `<span class="m-sectip" aria-hidden="true"></span></summary>`;
  if (!arr.length) {
    cards += `<div class="m-empty">这个分类下暂时没有比赛</div>`;
  } else {
    arr.forEach((m) => { cards += renderMatch(m); });
  }
  cards += `</details>`;
});

/* ---------- 页面 ---------- */
const nav = `
<style>
.site-nav { position: sticky; top: 0; z-index: 99; display: flex; background: rgba(15,17,21,0.96); border-bottom: 1px solid #262d3a; }
.site-nav a { flex: 1; text-align: center; padding: 13px 10px; font-size: 14px; font-weight: 600; color: #6b7488; text-decoration: none; border-bottom: 2px solid transparent; }
.site-nav a.on { color: #47e0a0; border-bottom-color: #47e0a0; }
</style>`;

const CSS = `
* { box-sizing: border-box; }
body { margin: 0; background: #0f1115; color: #e8eaed;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.wrap { max-width: 820px; margin: 0 auto; padding: 16px 14px 60px; }
h1 { font-size: 21px; margin: 6px 0 4px; }
.sub { font-size: 12.5px; color: #8b93a1; margin-bottom: 14px; line-height: 1.7; }
.stat { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.stat > div { flex: 1 1 90px; background: #161a21; border: 1px solid #232a36;
  border-radius: 10px; padding: 10px 12px; text-align: center; }
.stat b { display: block; font-size: 19px; color: #47e0a0; }
.stat span { font-size: 11.5px; color: #8b93a1; }
.record { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: #161a21; border: 1px solid #232a36; border-radius: 10px;
  padding: 11px 14px; margin-bottom: 16px; font-size: 13px; }
.record .t { color: #8b93a1; }
.record .h { color: #f0575c; font-weight: 700; }
.record .m { color: #6b7488; font-weight: 700; }
.record .r { color: #ffd54a; font-weight: 700; }
.record .n { color: #5a6272; font-size: 11.5px; }
.m-subhead { display: flex; align-items: center; gap: 8px; font-size: 14px;
  font-weight: 700; color: #b8c2d4; margin: 18px 0 10px; }
/* __FB_SEC_COL__ 分段可收起的样式（details/summary 原生折叠） */
.m-sec { margin-bottom: 4px; }
.m-sec > summary.m-subhead { cursor: pointer; list-style: none; user-select: none; display: flex; align-items: center; gap: 8px; }
.m-sec > summary.m-subhead::-webkit-details-marker { display: none; }
.m-sec > summary.m-subhead::marker { content: ''; }
.m-sectip { margin-left: auto; font-size: 11.5px; font-weight: 400; color: #47e0a0; opacity: .9; }
.m-sec[open] > summary.m-subhead .m-sectip::after { content: '点击收起'; }
.m-sec:not([open]) > summary.m-subhead .m-sectip::after { content: '点击查看'; }

.m-subcount { font-size: 11.5px; color: #6b7488; font-weight: 400;
  background: #1b212b; padding: 2px 8px; border-radius: 20px; }
.m-card { background: #161a21; border: 1px solid #232a36; border-left: 3px solid #2b3550;
  border-radius: 11px; padding: 12px 14px; margin-bottom: 10px; }
.m-card.win { border-left-color: #f0575c; }
.m-card.lose { border-left-color: #4a5160; }
/* 历史归档场次：左边框更暗、整卡略淡，和「本次在售」区分开 */
.m-card.hist { border-left-style: dashed; opacity: .88; }
.m-card.hist.win { border-left-color: #f0575c; }
.m-card.hist.lose { border-left-color: #4a5160; }
.m-top { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; flex-wrap: wrap; }
.m-code { font-size: 11.5px; font-weight: 700; color: #4a83f5;
  background: rgba(74,131,245,0.13); padding: 2px 8px; border-radius: 5px; }
.m-league { font-size: 12px; color: #8b93a1; }
.m-round { font-size: 11px; color: #5a6272; }
.m-time { margin-left: auto; font-size: 12px; color: #6b7488; font-family: Consolas, monospace; }
.m-st { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 5px; }
.m-st.live { color: #f0575c; background: rgba(240,87,92,0.14); }
.m-st.fin { color: #8b93a1; background: #232a36; }
.m-teams { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.m-team { flex: 1 1 0; min-width: 0; font-size: 14px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-team.home { text-align: right; }
.m-team i { font-style: normal; font-size: 11px; color: #6b7488; margin: 0 3px; }
.m-hc { font-size: 11px; color: #f0b429; margin-left: 3px; }
.m-vs { flex: 0 0 auto; min-width: 62px; text-align: center; font-size: 14px;
  color: #6b7488; font-family: Consolas, monospace; font-weight: 700; }
.m-vs.live { color: #47e0a0; }
.m-odds { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; flex-wrap: wrap; }
.m-ol { flex: 0 0 34px; font-size: 11.5px; color: #6b7488; }
.m-ov { font-size: 12px; color: #c8cfda; background: #1b212b;
  padding: 2px 9px; border-radius: 5px; font-family: Consolas, monospace; }
.m-ov.on { background: rgba(71,224,160,0.16); color: #47e0a0; font-weight: 700; }
.m-reco { display: flex; align-items: center; gap: 9px; margin-top: 9px;
  padding-top: 9px; border-top: 1px solid #1e2430; flex-wrap: wrap; }
.m-pick { font-size: 12.5px; color: #8b93a1; }
.m-pick b { color: #47e0a0; font-size: 14px; }
.m-rb { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 5px; }
.m-rb.hit { background: rgba(240,87,92,0.18); color: #f0575c; }
.m-rb.miss { background: #232a36; color: #6b7488; }
.m-conf { font-size: 11.5px; color: #8b93a1; }
/* 【可点击的分类卡】未开赛 / 进行中 / 已完场 */
.stat a { flex: 1; display: block; text-align: center; text-decoration: none;
  background: #171b23; border: 1px solid #232a36; border-radius: 10px;
  padding: 13px 8px 11px; cursor: pointer; transition: border-color .15s, background .15s; }
.stat a:active { background: #1d222c; border-color: #47e0a0; }
.stat a b { display: block; font-size: 25px; font-weight: 800; color: #47e0a0;
  font-variant-numeric: tabular-nums; line-height: 1.1; }
.stat a span { display: block; margin-top: 5px; font-size: 12.5px; color: #8b93a1; }
.m-empty { padding: 22px 12px; text-align: center; font-size: 13px;
  color: #5a6272; background: #14171d; border-radius: 10px; margin-bottom: 12px; }
/* 点分类卡跳过去时，标题不要被顶部导航挡住 */
.m-subhead { scroll-margin-top: 58px; }
.m-probs { margin-left: auto; display: flex; gap: 5px; }
.m-probs i { font-style: normal; font-size: 11px; color: #6b7488;
  background: #1b212b; padding: 2px 7px; border-radius: 4px; }
.m-probs i.on { color: #47e0a0; background: rgba(71,224,160,0.14); font-weight: 700; }
.m-noodds { font-size: 12px; color: #5a6272; }
.note { margin-top: 22px; padding: 13px 15px; background: #14171d;
  border: 1px solid #1e2430; border-radius: 10px; font-size: 11.5px;
  color: #6b7488; line-height: 1.9; }
.brand { margin-top: 22px; text-align: center; font-size: 12.5px; color: #f0575c; }
/* ---- 亚指综合换算卡片（手机优先，格子 auto-fit 自适应） ---- */
.m-ai { margin-top: 10px; padding: 11px 12px; background: #14171d;
  border: 1px solid #262d3a; border-radius: 10px; }
.m-ai-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.m-ai-title { font-size: 12.5px; font-weight: 700; color: #b8c2d4; }
.m-ai-tag { font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 6px;
  color: #f0b429; background: rgba(240,180,41,0.14);
  border: 1px solid rgba(240,180,41,0.35); white-space: nowrap; }
.m-ai-fun { margin-left: auto; font-size: 10.5px; color: #6b7488;
  border: 1px solid #2b3550; border-radius: 20px; padding: 1px 8px; white-space: nowrap; }
.m-ai-line { font-size: 11.5px; color: #8b93a1; line-height: 1.8;
  font-family: Consolas, monospace; word-break: break-word; margin-bottom: 9px; }
.m-ai-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 7px; margin-bottom: 8px; }
.m-ai-cell { display: flex; flex-direction: column; gap: 3px; background: #0f1115;
  border: 1px solid #262d3a; border-radius: 8px; padding: 7px 9px;
  min-width: 0; overflow: hidden; }
.m-ai-cell i { font-style: normal; font-size: 10.5px; color: #6b7488; white-space: nowrap; }
.m-ai-cell b { font-size: 13.5px; font-weight: 700; color: #c8cfda;
  font-family: Consolas, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-ai-cell.on { border-color: rgba(71,224,160,0.4); background: rgba(71,224,160,0.08); }
.m-ai-cell.on b { color: #47e0a0; }
.m-ai-dev { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; margin-bottom: 7px; }
.m-ai-dev-v { font-size: 12.5px; font-weight: 700; font-family: Consolas, monospace; }
.m-ai-dev-v.up { color: #f0575c; }
.m-ai-dev-v.down { color: #47e0a0; }
.m-ai-dev-u { font-size: 10.5px; color: #5a6272; }
.m-ai-hot { font-size: 12px; color: #f0b429; line-height: 1.75; margin-bottom: 7px; }
.m-ai-src { font-size: 10.5px; color: #6b7488; line-height: 1.7; }
.m-ai-miss { font-size: 11px; color: #8b93a1; line-height: 1.8; background: #171b23;
  border: 1px dashed #2b3550; border-radius: 8px; padding: 7px 9px; margin-bottom: 6px; }
.m-ai-note { font-size: 10.5px; color: #5a6272; line-height: 1.7; }
/* 盘口升降标签（升盘降水 / 降盘降水 / 升盘升水 / 降盘升水 / 无明显变化） */
.m-ai-change { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 9px; }
.m-ai-change-tag { font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 6px;
  color: #8ab0f5; background: rgba(110,168,254,0.12);
  border: 1px solid rgba(110,168,254,0.3); white-space: nowrap; }
.m-ai-change-d { font-size: 10.5px; color: #6b7488; font-family: Consolas, monospace;
  word-break: break-word; }
/* ---- 奖金试算器（竞彩页唯一可操作的区块） ---- */
.calc { margin-top: 22px; padding: 13px 14px; background: #14171d;
  border: 1px solid #262d3a; border-radius: 12px; }
.calc-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.calc-title { font-size: 14.5px; font-weight: 800; color: #e8eaed; letter-spacing: .5px; }
.calc-tag { font-size: 10.5px; color: #f0b429; background: rgba(240,180,41,0.13);
  border: 1px solid rgba(240,180,41,0.32); border-radius: 20px; padding: 1px 8px; white-space: nowrap; }
.calc-src { margin-left: auto; font-size: 10.5px; color: #6b7488; }
.calc-sub { font-size: 11.5px; color: #8b93a1; line-height: 1.7; margin-bottom: 10px; }
.calc-rows { display: flex; flex-direction: column; gap: 8px; }
.calc-row { background: #161a21; border: 1px solid #232a36; border-radius: 10px; padding: 9px 10px; }
.calc-mt { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 6px; }
.calc-code { font-size: 11px; font-weight: 700; color: #4a83f5;
  background: rgba(74,131,245,0.13); padding: 1px 7px; border-radius: 5px; }
.calc-league { font-size: 11px; color: #8b93a1; }
.calc-time { margin-left: auto; font-size: 11px; color: #6b7488; font-family: Consolas, monospace; }
.calc-teams { display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  font-size: 13px; font-weight: 600; color: #c8cfda; margin-bottom: 7px; }
.calc-vs { font-size: 10.5px; font-weight: 400; color: #5a6272; }
.calc-opts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
.calc-ol { flex: 0 0 auto; min-width: 52px; font-size: 11px; color: #6b7488; }
.calc-opt { display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  background: #1b212b; border: 1px solid #262d3a; border-radius: 7px; padding: 4px 8px;
  font-size: 11.5px; color: #c8cfda; user-select: none; -webkit-user-select: none; }
.calc-opt input { width: 14px; height: 14px; margin: 0; cursor: pointer; accent-color: #47e0a0; }
.calc-opt-o { font-family: Consolas, monospace; color: #8b93a1; }
.calc-opt.on { background: rgba(71,224,160,0.14); border-color: #47e0a0; color: #47e0a0; }
.calc-opt.on .calc-opt-o { color: #47e0a0; font-weight: 700; }
.calc-bar { margin-top: 11px; padding-top: 11px; border-top: 1px solid #1e2430; }
.calc-stat { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 11.5px; color: #8b93a1; }
.calc-stat b { color: #e8eaed; font-family: Consolas, monospace; }
.calc-mul { display: inline-flex; align-items: center; gap: 5px; }
.calc-mul input { width: 58px; padding: 3px 6px; background: #0f1115; border: 1px solid #2b3550;
  border-radius: 6px; color: #e8eaed; font-size: 12.5px; font-family: Consolas, monospace; }
.calc-btn { margin-left: auto; padding: 4px 12px; font-size: 11.5px; color: #8b93a1;
  background: #1b212b; border: 1px solid #2b3550; border-radius: 7px;
  cursor: pointer; user-select: none; -webkit-user-select: none; }
.calc-btn:active { background: #232a36; color: #47e0a0; }
.calc-prize { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 9px; }
.calc-prize-l { font-size: 12px; color: #8b93a1; }
.calc-prize b { font-size: 20px; font-weight: 800; color: #47e0a0;
  font-family: Consolas, monospace; font-variant-numeric: tabular-nums; }
.calc-prize-h { font-size: 10.5px; color: #6b7488; }
.calc-warn { margin-top: 7px; font-size: 11.5px; color: #f0b429; line-height: 1.7; }
.calc-warn:empty { display: none; }
.calc-foot { margin-top: 7px; font-size: 10.5px; color: #5a6272; }
.calc-empty { margin-bottom: 8px; padding: 9px 10px; background: #171b23;
  border: 1px dashed #2b3550; border-radius: 8px; font-size: 12px; color: #8b93a1; line-height: 1.8; }
.calc-note { margin-top: 11px; padding: 10px 11px; background: #0f1115;
  border: 1px solid #1e2430; border-radius: 9px; font-size: 10.5px; color: #6b7488; line-height: 1.9; }
.calc-disclaim { margin-top: 9px; padding-top: 8px; border-top: 1px dashed #232a36;
  font-size: 10.5px; color: #6b7488; line-height: 1.8; }
.calc-disclaim b { color: #8b93a1; font-weight: 700; }
`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>竞彩推荐 · 春风十里送大奖</title>
${nav}
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <h1>竞彩 · 推胜负平</h1>
  <div class="sub">体彩竞彩在售 ${IN_SALE} 场 · 已完场累积 ${stat.finished} 场 · <span class="cd" data-cd="1"></span></div>

  <div class="stat">
    <a href="#sec-upcoming"><b>${stat.upcoming}</b><span>未开赛</span></a>
    <a href="#sec-live"><b>${stat.live}</b><span>进行中</span></a>
    <a href="#sec-finished"><b>${stat.finished}</b><span>已完场</span></a>
  </div>

  ${stat.settled ? `<div class="record">
    <span class="t">完场战绩</span>
    <span class="h">红 ${stat.hit}</span>
    <span class="m">黑 ${stat.miss}</span>
    <span class="r">命中率 ${stat.rate}%</span>
    <span class="n">（推荐胜负平比对最终比分）</span>
  </div>` : ''}

  ${cards}

  ${renderCalc()}

  <div class="note">
    <div class="note-title" style="font-size:13.5px;font-weight:700;letter-spacing:1px;margin-bottom:6px;">免责声明</div>
    · 本页只显示<b>体彩竞彩</b>比赛，其他联赛不显示。<br>
    · 「已完场」是<b>累积</b>的：比赛开出结果后会从在售列表消失，程序会把它归档下来继续留在本页${stat.history ? `（当前累积 ${stat.history} 场）` : ''}。<br>
    · 推荐由博彩公司赔率反推概率得出（市场共识换算），属统计归纳，<b>不是预测</b>。<br>
    · 「亚指综合换算」「盘口升降」是<b>亚盘水位与资金热度的推演</b>，<b>仅娱乐参考</b>，不是预测，也不代表任何结果倾向。<br>
    · 上盘<b>真实资金占比暂无公开数据源</b>，所以不显示热度 / 爆冷推演；页面上的「水位隐含 · 理论均衡占比」是由亚盘水位换算出来的，<b>不是真实资金数据</b>。<br>
    · 盘口升降的「初盘 → 即时」原始数据一并列出，便于自行核对（盘口或水位只有一边变化时，程序也会照原始判定显示「无明显变化」）。<br>
    · 彩票每期独立随机，任何分析都不能提高中奖概率。本页不构成购彩建议。<br>
    · 未满 18 周岁禁止购买彩票。
  </div>

  <div class="brand">— 小晴推荐官 · 仅供参考 —</div>
</div>

<!-- __FB_COUNTDOWN__ 距离下次更新倒数（纯前端，每半小时整点 :00 / :30 为目标）
     免费：只是浏览器里的 setInterval，不请求任何接口、不调 AI。
     数据本身在 :28 / :58 抓取，所以 :00 / :30 那一刻数据已经是新的。 -->
<script>
(function () {
  var el = document.querySelector('.cd[data-cd]');
  if (!el) return;
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function left() {
    var d = new Date();
    /* 【改成每 5 分钟】比分任务每 5 分钟一轮 → 倒计时目标 = 下一个 5 分钟刻度 */
    var sec = d.getMinutes() * 60 + d.getSeconds();
    var step = 300;                        /* 5 分钟 = 300 秒 */
    var rem = step - (sec % step);
    if (rem === step) rem = 0;
    return rem;
  }
  function draw() {
    var s = left();
    if (s <= 0) { el.textContent = '正在更新…'; return; }
    var m = Math.floor(s / 60);
    el.textContent = '实时更新倒计时 ' + pad(m) + ':' + pad(s % 60);
  }
  draw();
  setInterval(draw, 1000);
})();
</script>

<!-- __FB_SEC_JS__ 点了顶部「未开赛/进行中/已完场」的数字 → 自动展开那一栏
     （因为分段默认收起，锚点跳过去如果不展开就看不到内容） -->
<script>
(function () {
  function openTarget() {
    var h = String(location.hash || '');
    if (!h || h.indexOf('#sec-') !== 0) return;
    var el = document.getElementById(h.slice(1));
    if (el && el.tagName === 'DETAILS') el.open = true;
  }
  openTarget();
  window.addEventListener('hashchange', openTarget);
  /* 顶部统计卡也是 <a href="#sec-...">，点的时候 hash 变化 → hashchange 会触发 */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#sec-"]') : null;
    if (!a) return;
    var el = document.getElementById(String(a.getAttribute('href')).slice(1));
    if (el && el.tagName === 'DETAILS') el.open = true;
  }, true);
})();
</script>
<!-- __FB_CALC_JS__ 奖金试算器（纯前端：勾选 / 倍数 → 实时算，不发请求、不刷新页面）
     赔率来自上面内联的 <script type="application/json" id="jcCalcData">（体彩官网官方 SP）。
     算奖规则按体彩竞彩官方规则，见区块底部「怎么算的」。
     【交互边界】竞彩页上只有这一块可以操作；这里【不写任何本地存储】
     （浏览器存储 API 一个都不用，代码里搜不到相关字样）——
     勾选和倍数只存在内存里，刷新页面即回到默认。 -->
<script>
(function () {
  var root = document.getElementById('jcCalc');
  if (!root) return;

  var elN = document.getElementById('calcN');
  var elBets = document.getElementById('calcBets');
  var elCost = document.getElementById('calcCost');
  var elPrize = document.getElementById('calcPrize');
  var elHint = document.getElementById('calcPrizeHint');
  var elWarn = document.getElementById('calcWarn');
  var elMul = document.getElementById('calcMul');
  var elClear = document.getElementById('calcClear');
  if (!elN || !elBets || !elCost || !elPrize || !elHint) return;

  var rows = [];
  var dataEl = document.getElementById('jcCalcData');
  if (dataEl) {
    try { rows = JSON.parse(dataEl.textContent || dataEl.innerHTML || '[]') || []; }
    catch (e) { rows = []; }
  }
  var byCode = {};
  for (var r = 0; r < rows.length; r++) { if (rows[r] && rows[r].code) byCode[rows[r].code] = rows[r]; }

  var boxes = root.querySelectorAll('input.calc-cb');
  var MAX_PARLAY = 8;            /* 体彩：胜平负 / 让球胜平负 最多 8 关 */

  function money(v) { return '¥' + v.toFixed(2); }

  /* 官方「单注奖金」保留 2 位小数规则：
     第 3 位 0~4 舍；6~9 进；5 时看第 2 位奇偶（偶舍、奇进） */
  function round2(v) {
    if (!isFinite(v) || v <= 0) return 0;
    var t = Math.round(v * 1000);        /* 千分位整数（消除浮点噪声） */
    var third = t % 10;
    var base = Math.floor(t / 10);       /* 百分位（分） */
    if (third > 5) return (base + 1) / 100;
    if (third === 5) return (base % 2 === 0 ? base : base + 1) / 100;
    return base / 100;
  }
  /* 单注最高奖金限额（体彩竞彩官方规则） */
  function capOf(n) {
    if (n <= 1) return 100000;
    if (n <= 3) return 200000;
    if (n <= 5) return 500000;
    return 1000000;
  }
  function mul() {
    var m = elMul ? parseInt(elMul.value, 10) : 1;
    if (!isFinite(m) || m < 1) m = 1;
    if (m > 99) m = 99;
    return m;
  }
  function warn(t) { if (elWarn) elWarn.textContent = t || ''; }

  function update() {
    var i, j;
    var sel = {}, codes = [];

    /* 1) 读勾选（同一场可勾多个结果 → 复式） */
    for (i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var on = !!b.checked;
      var lab = b.parentNode;
      if (lab && lab.classList) { if (on) lab.classList.add('on'); else lab.classList.remove('on'); }
      if (!on) continue;
      var p = String(b.value || '').split('|');
      if (p.length < 3) continue;
      if (!sel[p[0]]) { sel[p[0]] = { had: [], hhad: [] }; codes.push(p[0]); }
      if (p[1] === 'hhad') sel[p[0]].hhad.push(p[2]); else sel[p[0]].had.push(p[2]);
    }

    var n = codes.length;
    var m = mul();

    /* 2) 默认（一个都没勾）：0 关 0 注 ¥0 */
    if (!n) {
      elN.textContent = '0';
      elBets.textContent = '0';
      elCost.textContent = money(0);
      elPrize.textContent = money(0);
      elHint.textContent = '还没勾选场次';
      warn('');
      return;
    }

    /* 3) 注数 = 各场勾选个数的乘积；同一场跨玩法（胜平负+让球）→ 混合过关，体彩不允许 */
    var bets = 1, mixed = false;
    for (i = 0; i < codes.length; i++) {
      var s = sel[codes[i]];
      bets *= (s.had.length + s.hhad.length);
      if (n >= 2 && s.had.length && s.hhad.length) mixed = true;
    }
    elN.textContent = String(n);
    elBets.textContent = String(bets);

    var bad = '';
    if (mixed) bad = '同一场比赛不能同时选「胜平负」和「让球胜平负」（体彩混合过关规则），请取消其中一边。';
    else if (n > MAX_PARLAY) bad = '已选 ' + n + ' 关，超过体彩「胜平负 / 让球胜平负」最多 ' + MAX_PARLAY + ' 关的过关上限，实际不能出票。';
    if (bad) {
      elCost.textContent = money(bets * 2 * m);
      elPrize.textContent = '—';
      elHint.textContent = '该组合不能出票，未计算奖金';
      warn(bad);
      return;
    }

    /* 4) 单注奖金 = 2 元 × 各场赔率连乘（每场取最小/最大 → 复式的奖金范围） */
    var minProd = 2, maxProd = 2, hasOdds = true;
    for (i = 0; i < codes.length; i++) {
      var rr = byCode[codes[i]] || {};
      var ss = sel[codes[i]];
      var lo = Infinity, hi = -Infinity;
      for (j = 0; j < ss.had.length; j++) {
        var o1 = rr.had ? rr.had[ss.had[j]] : null;
        if (o1 > 0) { if (o1 < lo) lo = o1; if (o1 > hi) hi = o1; }
      }
      for (j = 0; j < ss.hhad.length; j++) {
        var o2 = rr.hhad ? rr.hhad[ss.hhad[j]] : null;
        if (o2 > 0) { if (o2 < lo) lo = o2; if (o2 > hi) hi = o2; }
      }
      if (!(lo > 0) || !(hi > 0)) { hasOdds = false; break; }
      minProd *= lo;
      maxProd *= hi;
    }
    if (!hasOdds) {
      elCost.textContent = money(bets * 2 * m);
      elPrize.textContent = '—';
      elHint.textContent = '所选场次缺少赔率，无法试算';
      warn('所选里有一场没有可用赔率（官方可能刚更新），取消后重试。');
      return;
    }

    var lim = capOf(n);
    var rawMax = round2(maxProd);
    var loBet = Math.min(round2(minProd), lim);
    var hiBet = Math.min(rawMax, lim);
    var capped = rawMax > lim;
    var loPrize = loBet * m;
    var hiPrize = hiBet * m;

    elCost.textContent = money(bets * 2 * m);
    elPrize.textContent = (loPrize === hiPrize) ? money(hiPrize) : (money(loPrize) + ' ~ ' + money(hiPrize));
    elHint.textContent = (n === 1 ? '单关' : n + ' 关·串关') +
      ' · 共 ' + bets + ' 注 · 单注奖金 ' +
      (loBet === hiBet ? loBet.toFixed(2) : loBet.toFixed(2) + '~' + hiBet.toFixed(2)) + ' 元' +
      (bets > 1 ? '（复式，中其中一注）' : '') +
      (capped ? ' · 已按单注最高限额 ' + lim + ' 元封顶' : '') +
      (n === 1 ? ' · 单关能否投注以官方为准' : '');
    warn('');
  }

  for (var k = 0; k < boxes.length; k++) boxes[k].addEventListener('change', update);
  if (elMul) {
    elMul.addEventListener('input', update);
    elMul.addEventListener('change', update);
  }
  if (elClear) {
    elClear.addEventListener('click', function () {
      for (var i = 0; i < boxes.length; i++) boxes[i].checked = false;
      if (elMul) elMul.value = '1';
      update();
    });
  }

  update();   /* 初始：一个都没勾 → 0 关 0 注 ¥0.00（刷新后也是这样，不做任何持久化） */
})();
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');

console.log('✅ 已生成：' + OUT);
console.log(`   大小：${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`   三卡片：未开赛 ${stat.upcoming} · 进行中 ${stat.live} · 已完场 ${stat.finished}`);
console.log(`   已完场构成：本次在售完场 ${stat.finishedToday} 场 + 历史归档 ${stat.history} 场`);
console.log(`   已完场分区卡片数：${MATCHES.filter((m) => m.kind === 'finished').length}`);
console.log(`   头行「体彩竞彩在售 ${IN_SALE} 场」· 来源：` +
  (OFFICIAL === null
    ? `本地竞彩数据兜底 upcoming+live=${IN_SALE}（没读到 jc-official.js）`
    : `体彩官网 jc-official.js inSale=${IN_SALE} · 官方更新 ${(JC_OFFICIAL && JC_OFFICIAL.officialUpdate) || '(无)'}`));
if (stat.settled) console.log(`   完场战绩：红 ${stat.hit} / 黑 ${stat.miss}  命中率 ${stat.rate}%`);
console.log(`   数据来源：jc-data.js（体彩竞彩在售）+ jc-history.js（已完场累积）`);
console.log(`   奖金试算器：${CALC_ROWS.length} 场可试算 · 赔率来源：${SP_SRC_CN}` +
  `（sp.source=${SP ? SP.source : 'none'}）`);
console.log(`   （试算器只用官方 SP 原值；抓不到时不显示数字，绝不估算；不写任何本地存储）`);
