// ============================================================
//  build-jc.mjs —— 抓取体彩「竞彩」在售比赛 + 赔率
//
//  数据源（全部 500.com 自家，无需队名配对）：
//    live.500.com/jczq.php          竞彩在售列表（含竞彩编号、fid）
//    live.500.com/json/odds.php     欧赔/亚盘/大小球（初盘 + 即时）
//
//  【额外】体彩官网官方竞彩 SP（模拟计算器要用）：
//    webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry
//      m.had  = 胜平负 SP        （主胜 h / 平 d / 客胜 a）
//      m.hhad = 让球胜平负 SP    （让球数 goalLine + h/d/a）
//    这是【官方 SP 原值】，不是欧赔换算、不是估算。
//    ⚠️ 云端（GitHub Actions，美国 IP）访问该域名会被拒（567）——
//       抓不到就【沿用上一次 jc-data.js 里的 SP】，绝不写空、绝不崩。
//
//  产物：
//    jc-data.js     →  const JC_DATA = {...}   本次「在售」的比赛
//                      顶层多一个 sp 块：官方竞彩 SP 列表（模拟计算器读它）
//    jc-history.js  →  const JC_HISTORY = {...} 已完场累积记录
//
//  每场比赛还会算一份【亚指综合换算】结果存在 game.asianIndex
//  （算法在 asian-index.js，用 vm 读进来，保证项目和页面用的是同一份）：
//    · 亚盘盘口数值 + 上/下盘水位 + 水位换算的理论均衡占比 —— 真实数据
//    · 热度等级 / 爆冷·输盘·赢盘推演 / 偏差 —— 需要「上盘真实资金占比 fundUp」
//    · 【fundUp 目前没有数据源】（数据源只返回亚盘/欧赔/大小球三个数组）
//      → asianIndex.analysis 恒为 null，页面整块不显示热度推演，绝不编数
//
//  【为什么需要 jc-history】体彩在售列表只含【还能买】的比赛，
//  一开完赛就从列表里消失 —— 所以「已完场」如果只读 jc-data 会永远是 0。
//  每次跑这里都会把「上次在售、这次不见了」的比赛归档进 jc-history.js
//  （按队名+日期去 football.js 里找它的终场比分），已完场才能累积。
//
//  用法：node build-jc.mjs
//        node build-jc.mjs --archive-test   （离线自测归档逻辑，不联网、不碰真数据）
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  archiveJcHistory, mergeHistory, trimHistory, renderHistoryJs,
  findInFootball, toHistoryRecord
} from './jc-archive.mjs';

/* 【自测用】DSH_JC_ROOT 可以把数据目录指到别处（造夹具验证归档，见 --archive-test） */
const ROOT = process.env.DSH_JC_ROOT
  ? path.resolve(process.env.DSH_JC_ROOT)
  : path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'jc-data.js');
const HIST = path.join(ROOT, 'jc-history.js');
const FB_JS = path.join(ROOT, 'football.js');

/* 代码目录：DSH_JC_ROOT 只改【数据目录】，不改代码目录 ——
   asian-index.js 是代码，必须从脚本所在目录读（夹具目录里没有它）。 */
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/* 【已完场只留前后 24 小时】用户要求：
     「足球信息记录前后24小时内的，超过24小时内的比赛就不要了」
   原来是「最多 200 场」，会越积越多、翻出好几天前的比赛。
   现在改成：只保留开赛时间在 [现在-24h, 现在+24h] 内的记录。 */
const HIST_KEEP_HOURS = 72;
const HIST_MAX = 200;   /* 兜底上限：万一时间解析不出来，也不让它无限增长 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

const log = (...a) => console.log(...a);

/* ============================================================
   读取已有的 js 数据文件（jc-data.js / jc-history.js / football.js）
   ============================================================ */
function loadVar(file, varName) {
  const p = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(p)) return null;
  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + `\nglobalThis.__X = ${varName};`, c);
    return c.__X;
  } catch (e) {
    log(`  ⚠️ ${path.basename(file)} 解析失败：${e.message}`);
    return null;
  }
}

/* ============================================================
   亚指综合换算（asian-index.js）
   ------------------------------------------------------------
   为什么用 vm 读而不是 import：
     asian-index.js 是【普通浏览器脚本】（函数挂全局，供
     football.html 里 <script src> 直接用），不能同时写 export。
     为了保证「算法只有一份」，这里用和 loadVar 一样的办法把它
     读进沙箱跑一遍，再把函数取出来 —— 不复制算法代码。

   算出什么：game.asianIndex（详见 asian-index.js 文件头注释）
     · 【真实资金占比 fundUp 目前没有数据源】→ 恒为 null，
       asianIndex.analysis 也恒为 null，页面据此整块不显示
       热度/爆冷推演，不显示任何编造的数字。
   ============================================================ */
function loadAsianIndex() {
  const p = path.join(SCRIPT_DIR, 'asian-index.js');
  if (!fs.existsSync(p)) { log('  ⚠️ 缺 asian-index.js —— 本场不做亚指换算'); return null; }
  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + `
globalThis.__AI = { ASIAN_INDEX_CALC, calcAsianIndexAnalysis, asianHotRule,
  asianHandicapFromLine, buildAsianIndex, asianIndexView, getFundUp };`, c);
    return c.__AI;
  } catch (e) {
    log(`  ⚠️ asian-index.js 解析失败：${e.message} —— 本场不做亚指换算`);
    return null;
  }
}

/* ---------- 抓取 ---------- */
async function get(url, referer, asBuffer) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': referer || 'https://live.500.com/'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    if (asBuffer) return { ok: true, buf: Buffer.from(await res.arrayBuffer()) };
    return { ok: true, text: await res.text() };
  } catch (e) {
    return { ok: false, error: e.cause?.code || e.message };
  }
}

function decode(buf) {
  const head = buf.slice(0, 3000).toString('latin1');
  const m = /charset=["']?([\w-]+)/i.exec(head);
  const enc = (m ? m[1] : 'utf-8').toLowerCase();
  if (/gb2312|gbk|gb18030/.test(enc)) {
    try { return new TextDecoder('gb18030').decode(buf); } catch { /* fall */ }
  }
  return buf.toString('utf8');
}

const strip = (s) => String(s || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .trim();

/* ============================================================
   1. 竞彩在售列表（含实时比分）
   ============================================================ */
async function fetchJcList() {
  const r = await get('https://live.500.com/jczq.php', null, true);
  if (!r.ok) { log(`  ❌ 竞彩列表失败：${r.error}`); return []; }

  const html = decode(r.buf);
  if (html.length < 5000) { log('  ⛔ 竞彩列表被反爬'); return []; }

  const rows = [...html.matchAll(/<tr\s+id="a(\d+)"([^>]*)>([\s\S]*?)<\/tr>/gi)];
  const year = new Date().getFullYear();
  const games = [];

  rows.forEach(([, gid, attrs, body]) => {
    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 8) return;

    const attrGet = (name) => {
      const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
      return m ? m[1] : '';
    };

    /* 竞彩编号：形如 周二004 */
    const codeM = /周[一二三四五六日]\d{3}/.exec(strip(cells[0]));
    const code = codeM ? codeM[0] : '';

    const league = strip(cells[1]);
    const round = strip(cells[2]);

    /* 时间：10-14 00:45 → 补年份 */
    const timeRaw = strip(cells[3]);
    const timeM = /(\d{2})-(\d{2})\s+(\d{2}:\d{2})/.exec(timeRaw);
    let time = '';
    if (timeM) time = `${year}-${timeM[1]}-${timeM[2]} ${timeM[3]}`;

    /* 主队（含排名、让球数） */
    const homeCell = cells[5] || '';
    const homeRankM = /\[(\d+)\]/.exec(homeCell);
    const homeRqM = /class="sp_rq"[^>]*>\(([^)]*)\)/.exec(homeCell);
    const homeName = strip(homeCell.replace(/<span[^>]*>[\s\S]*?<\/span>/g, ''));

    /* 进球数（pk 里的两个数） */
    const midCell = cells[6] || '';
    const goals = [...midCell.matchAll(/class="clt\d"[^>]*>(\d+)</g)].map((m) => +m[1]);

    /* 客队 */
    const awayCell = cells[7] || '';
    const awayRankM = /\[(\d+)\]/.exec(awayCell);
    const awayName = strip(awayCell.replace(/<span[^>]*>[\s\S]*?<\/span>/g, ''));

    /* 比赛状态标记 */
    const statusText = strip(cells[8] || '') + ' ' + strip(cells[9] || '');

    games.push({
      gid,
      fid: attrGet('fid'),
      sid: attrGet('sid'),
      code,
      league,
      round,
      time,
      handicap: homeRqM ? homeRqM[1] : null,
      home: { name: homeName, rank: homeRankM ? +homeRankM[1] : null },
      away: { name: awayName, rank: awayRankM ? +awayRankM[1] : null },
      score: goals.length >= 2 ? { home: goals[0], away: goals[1] } : null,
      statusText
    });
  });

  games.sort((a, b) => {
    const na = String(a.code).replace(/\D/g, '');
    const nb = String(b.code).replace(/\D/g, '');
    return (+na || 0) - (+nb || 0);
  });

  return games;
}

/* ============================================================
   1b. 各状态的实时比分（245qq）
   ============================================================ */
const QQ_BASE = 'https://new-jiko.sukeku.com';
const QQ_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function qqApi(pathName) {
  try {
    const res = await fetch(`${QQ_BASE}${pathName}?lang=zh`, {
      headers: {
        'User-Agent': QQ_UA,
        'Accept': 'application/json',
        'Origin': 'https://m.245qq.com',
        'Referer': 'https://m.245qq.com/'
      },
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch (e) { return []; }
}

/**
 * 抓三种状态的比分，返回 GID → { score, status, minute } 的映射
 *   GS: 1=未开赛  4=进行中  20=完场（实测）
 */
async function fetchScores() {
  const map = new Map();
  const lists = [
    ['/api/Game/GetSingleList', 'upcoming'],
    ['/api/Game/GetRunballList', 'live'],
    ['/api/Game/GetFinishList', 'finished']
  ];

  for (const [path, kind] of lists) {
    const arr = await qqApi(path);
    arr.forEach((g) => {
      const hs = g.T1 ? g.T1.S : null;
      const as = g.T2 ? g.T2.S : null;
      map.set(String(g.GID), {
        kind,
        gs: g.GS,
        minute: g.TS || 0,
        home: hs,
        away: as,
        hasScore: hs !== null && hs !== undefined && as !== null && as !== undefined
      });
    });
  }
  return map;
}

/* ============================================================
   2. 赔率（用 fid 直接查）
   ============================================================ */
async function fetchOdds(fid) {
  const r = await get(`https://live.500.com/json/odds.php?fid=${fid}`, `https://live.500.com/detail.php?fid=${fid}`);
  if (!r.ok) return null;

  let j = null;
  try { j = JSON.parse(r.text); } catch { return null; }
  if (!Array.isArray(j) || j.length < 3) return null;

  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const [asArr, euArr, ouArr] = j;

  const pair = (arr, mapper) => {
    if (!Array.isArray(arr) || arr.length < 2) return { open: null, live: null };
    return { open: mapper(arr[0]), live: mapper(arr[1]) };
  };

  /*
    赔率数组的字段顺序（实测确认）：
      亚盘   ["1.05", "平手/半球", "0.75"]   → 主水位 / 盘口 / 客水位
      欧赔   [2.35, 3.75, 2.7]              → 主胜 / 平局 / 客胜
      大小球 [0.92, "3", 0.92]              → 盘口 / 大球水位 / 小球水位
  */
  return {
    asian: pair(asArr, (v) => ({ home: num(v[0]), line: v[1], away: num(v[2]) })),
    europe: pair(euArr, (v) => ({ home: num(v[0]), draw: num(v[1]), away: num(v[2]) })),
    overunder: pair(ouArr, (v) => ({ line: v[0], over: num(v[1]), under: num(v[2]) }))
  };
}

/* ============================================================
   2b. 官方竞彩 SP（胜平负 had / 让球胜平负 hhad）—— 模拟计算器要用
   ------------------------------------------------------------
   数据源：体彩官网 webapi.sporttery.cn（getMatchCalculatorV1，1 次请求）
     m.had  = { h 主胜, d 平, a 客胜 }              ← 竞彩【胜平负】官方 SP
     m.hhad = { goalLine 让球数, h/d/a }             ← 竞彩【让球胜平负】官方 SP
     m.poolList[].single / bettingSingle             ← 官方单关标记（原样存下，页面不据此承诺）
   这就是体彩竞彩奖金计算器用的 SP 值，【原值使用】，不用欧赔换算、不估算。

   ⚠️ 云端（GitHub Actions，美国 IP）访问这个域名会被拒（567）→
      抓不到时保留上一次 jc-data.js 里的 SP（source='carried'），绝不写空、绝不崩。
   ============================================================ */
/* 【自测用】JC_SP_API 可以把 SP 接口指到别处（比如死端口），
   用来演练「抓不到 → 沿用上一次 SP、不写空、不崩」这条路（云端就是这个情况）。 */
const SP_API = process.env.JC_SP_API ||
  'https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=hhad,had&channel=c';

function spNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function spStamp(o) {
  if (!o) return '';
  return [o.updateDate, o.updateTime].filter(Boolean).join(' ').trim();
}

async function fetchOfficialSp() {
  try {
    const res = await fetch(SP_API, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://www.sporttery.cn/',
        'Origin': 'https://www.sporttery.cn'
      },
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    let j = null;
    try { j = await res.json(); } catch { return { ok: false, error: '不是 JSON（可能被反爬）' }; }
    if (!j || j.success === false) return { ok: false, error: `success=false errorCode=${j && j.errorCode}` };

    const v = (j && j.value) || {};
    const list = [];
    for (const grp of (v.matchInfoList || [])) {
      for (const m of ((grp && grp.subMatchList) || [])) {
        if (!m) continue;
        const H = m.had || {};
        const HH = m.hhad || {};
        const had = (spNum(H.h) || spNum(H.d) || spNum(H.a))
          ? { h: spNum(H.h), d: spNum(H.d), a: spNum(H.a), update: spStamp(H) } : null;
        const hhad = (spNum(HH.h) || spNum(HH.d) || spNum(HH.a))
          ? {
              line: String(HH.goalLine || ''),
              h: spNum(HH.h), d: spNum(HH.d), a: spNum(HH.a), update: spStamp(HH)
            } : null;
        if (!had && !hhad) continue;

        const pools = {};
        (m.poolList || []).forEach((p) => {
          if (p && p.poolCode) pools[String(p.poolCode).toUpperCase()] = p;
        });
        const flag = (code) => {
          const p = pools[code] || {};
          return {
            single: Number(p.single) === 1 ? 1 : 0,
            betSingle: Number(p.bettingSingle) === 1 ? 1 : 0
          };
        };

        list.push({
          code: String(m.matchNumStr || ''),
          matchNum: m.matchNum != null ? String(m.matchNum) : '',
          league: String(m.leagueAbbName || ''),
          time: [String(m.matchDate || ''), String(m.matchTime || '')].filter(Boolean).join(' ').trim(),
          home: String(m.homeTeamAbbName || m.homeTeamAllName || ''),
          away: String(m.awayTeamAbbName || m.awayTeamAllName || ''),
          had, hhad,
          single: { HAD: flag('HAD'), HHAD: flag('HHAD') }
        });
      }
    }
    if (!list.length) return { ok: false, error: '接口里没有带 SP 的比赛' };
    return {
      ok: true, list,
      officialUpdate: String(v.lastUpdateTime || ''),
      inSale: Number.isFinite(Number(v.totalCount)) ? Number(v.totalCount) : null
    };
  } catch (e) {
    return { ok: false, error: (e && e.cause && e.cause.code) || (e && e.message) || String(e) };
  }
}

/* ============================================================
   3-0. 推荐类型：three（胜负平）/ unbeaten（不败）
   ------------------------------------------------------------
   页面（足球推荐.html）支持两种推荐类型：
     type='three'    推胜负平：主胜 / 平 / 客胜
     type='unbeaten' 推不败：主不败（主胜或平）/ 客不败（客胜或平）

   【判定只看一个数】reco.prob 里【最高】的那个概率（由真实欧赔反推）。
     最高概率 < 50%  → 'unbeaten'
     最高概率 >= 50% → 'three'

   为什么这么定（道理，不是拍的数）：
     ① 推单一结果 = 赌「这一个事件发生」。欧赔反推出来的概率（1/赔率
        归一化，见下面 calcReco）就是它发生的概率 —— 已经是全部依据。
     ② 最高概率 ≥ 50% ⇒ 这个结果【比不发生更可能】→ 单推它合理；
        最高概率 < 50% ⇒ 它是【少数事件】（不发生反而更可能）
        → 单推它等于明知大概率不中还要赌，不划算。
     ③ 这种场次改推「不败」：那一边的「胜 + 平」两个结果都算中，
        概率 = 最高概率 + 平局概率 —— 由 ② 可知它必然 > 50%，
        等于把「少数事件」换成「多数事件」（覆盖面更宽、更稳）。
     ④ 50% 这个分界不是随手挑的：多数事件 / 少数事件的分界线本身
        就是 50%，它由赔率直接决定 —— 不需要引入任何新数据、不编数。
     实测（2026-10-17 的 11 场）：最高概率 38.7% ~ 62.7%，
     平移后「不败」概率最低 64.1%，全部 > 50%。

   【边界情况】
     · pick === 'draw'（平局概率最高）→ 一律 'three'：
       「不败」按定义就是「胜或平」，推荐"平"时没有"哪一边不败"可言，
       页面上的 2 个不败胶囊也画不出高亮（会一个都不亮）→ 不平移。
     · 概率缺失（那场没抓到赔率）→ 'three'：算不出来就不改推荐。
     · 兜底：万一「最高 + 平」仍 < 50%，退回 'three'
       （保证平移只会把少数事件变多数事件，绝不反向）。

   ⚠️ 只【新增】type 一个字段：pick / label / confidence / prob / clear /
      margin / rqLine 一个都不动（别处在用）。
   ⚠️ 只作用于 jc-data.js（本次在售）。历史归档记录（jc-history.js）不带
      type → 出页面时按 'three' 判红黑，一个字节都不受影响。
   ============================================================ */
const RECO_UNBEATEN_TOP = 50;   /* 最高概率低于它就推「不败」（依据见上面 ②③④） */

function recoTypeOf(pick, prob) {
  if (!pick || !prob) return 'three';        /* 算不出来 → 不改推荐 */
  if (pick === 'draw') return 'three';       /* 平局没法用「不败」表达 */
  const top = Number(prob[pick]);
  if (!Number.isFinite(top) || top >= RECO_UNBEATEN_TOP) return 'three';
  const ub = top + Number(prob.draw || 0);   /* 不败 = 胜 或 平 */
  if (!Number.isFinite(ub) || ub < RECO_UNBEATEN_TOP) return 'three';   /* 兜底 */
  return 'unbeaten';
}

/* ============================================================
   3. 推荐胜负平（赔率反推概率）
   ============================================================ */
function calcReco(odds) {
  if (!odds || !odds.europe) return null;
  const src = odds.europe.live || odds.europe.open;
  if (!src || !src.home || !src.draw || !src.away) return null;

  const raw = { home: 1 / src.home, draw: 1 / src.draw, away: 1 / src.away };
  const sum = raw.home + raw.draw + raw.away;
  if (!sum) return null;

  const prob = {
    home: +(raw.home / sum * 100).toFixed(1),
    draw: +(raw.draw / sum * 100).toFixed(1),
    away: +(raw.away / sum * 100).toFixed(1)
  };
  const sorted = [['home', prob.home], ['draw', prob.draw], ['away', prob.away]].sort((a, b) => b[1] - a[1]);
  const [pick, conf] = sorted[0];

  // 让球胜平负：若主队让 n 球，主胜概率需要调整（用亚盘盘口近似）
  let rqHint = null;
  const line = odds.asian && ((odds.asian.live && odds.asian.live.line) || (odds.asian.open && odds.asian.open.line));
  if (line !== null && line !== undefined) rqHint = String(line);

  return {
    pick,
    label: { home: '主胜', draw: '平局', away: '客胜' }[pick],
    confidence: conf,
    prob,
    clear: conf >= 45,
    margin: +((sum - 1) * 100).toFixed(1),
    rqLine: rqHint,
    /* 【推荐类型】three / unbeaten —— 判定依据与道理见上面 recoTypeOf 的注释。
       只加这一个字段，上面那些字段的值一个都没动。 */
    type: recoTypeOf(pick, prob)
  };
}

/* ============================================================
   3b. 归档：把「打完的比赛」存进 jc-history.js
   ------------------------------------------------------------
   规则：
     ① 上次在售、这次不见了          → 开完赛（或下架）→ 尝试归档
     ② 这次还在、但状态已是 finished → 也归档
     ③ 去 football.js 里按「队名 + 日期」找同一场，拿它的终场比分
     ④ 去重（编号 或 队名+日期 相同只留一条）
     ⑤ 已有结果的记录，绝不被「没结果」的记录覆盖
     ⑥ 按时间倒序，最多保留 HIST_MAX 场
   ============================================================ */
function archiveStep(oldJc, newJc, stamp) {
  /* 旧历史（可能还没有这个文件） */
  const oldHist = loadVar('jc-history.js', 'JC_HISTORY');
  const oldList = (oldHist && Array.isArray(oldHist.list)) ? oldHist.list : [];

  /* football.js：拿终场比分用的（全世界的比赛，含 245qq 的完场比分） */
  const FB = loadVar('football.js', 'FOOTBALL_DATA');
  const fbList = (FB && FB.lists)
    ? [...(FB.lists.upcoming || []), ...(FB.lists.live || []), ...(FB.lists.finished || [])]
    : [];

  /* 这次新归档的（用来打印「本次新增 M 场」） */
  const fresh = archiveJcHistory({
    oldJc, newJc, history: { list: [] }, fbList, now: stamp
  });

  /* ---------- 补比分：老记录当时没配到 football.js 的，再试一次 ----------
     为什么需要：一场比赛从在售列表消失的那一刻，football.js 里可能还
     没有它的终场比分（比赛刚结束、数据源还没更新）。那一次只能记成
     「无结果」，而它之后再也不会出现在 oldJc 里了 ——
     不补这一步，这场就永远没有比分和红黑。
     注意：这一步【只补没结果的】，已经有结果的绝不改动。 */
  let backfilled = 0;
  const retried = oldList.map((rec) => {
    if (rec.score && rec.result) return rec;         /* 已有比分/结果 → 不动 */
    if (!rec.time || !rec.home || !rec.away) return rec;

    /* 做成一场比赛的形状，直接复用归档模块的匹配（同一套别名/青年队规则） */
    const game = {
      code: rec.code, league: rec.league, time: rec.time,
      home: { name: rec.home }, away: { name: rec.away },
      score: null, liveScore: null,
      odds: rec.odds ? { europe: { live: rec.odds } } : null,
      reco: rec.pick
        ? { pick: rec.pick, label: rec.pickLabel, confidence: rec.conf, prob: rec.prob }
        : null
    };
    const fb = findInFootball(game, fbList);
    if (!fb) return rec;

    const fixed = toHistoryRecord(game, [fb], rec.at || stamp);
    if (fixed && fixed.score) { backfilled++; return fixed; }
    return rec;
  });

  /* ---------- ① 本次新归档的先和旧历史对齐，避免覆盖已有结果 ----------
     【为什么必须先过一遍 mergeHistory】
     同一条历史记录可能被「重新推导」出一条新的（比如这场又出现在了
     oldJc 里、而 football.js 的比分后来被改了/改错过）。如果直接把
     新推导的送去合并，一个错比分就会把【已经存下来的正确结果】顶掉。
     先和旧历史合并一次，mergeHistory 里「已有结果的优先」这条规则
     就会把旧结果保护住，同时新记录还能补上赔率、概率这些缺失字段。 */
  const aligned = mergeHistory(retried, fresh.list);
  const addedNow = aligned.added;

  /* ② 再和旧历史合并（此时两边都已经带上结果保护，幂等） */
  const merged = mergeHistory(retried, aligned.list);
    /* 【24 小时窗口】先筛掉窗口外的，再套 200 场上限兜底。
       用户要求：「足球信息记录前后24小时内的，超过24小时内的比赛就不要了」 */
    const _jc0 = Date.now();
    const _jcFrom = _jc0 - HIST_KEEP_HOURS * 3600 * 1000;
    const _jcTo   = _jc0 + HIST_KEEP_HOURS * 3600 * 1000;
    const _jcInWin = (g) => {
      const raw = g && (g.time || g.matchTime || g.startTime || g.kickoff);
      if (!raw) return true;
      let t = new Date(String(raw).replace(/-/g, '/')).getTime();
      if (isNaN(t)) t = new Date(String(raw)).getTime();
      if (isNaN(t)) return true;
      return t >= _jcFrom && t <= _jcTo;
    };
    const _jcWin = merged.list.filter(_jcInWin);
    const _jcDropped = merged.list.length - _jcWin.length;
    const kept = trimHistory(_jcWin, HIST_MAX);

  const matched = kept.filter((r) => r.matched).length;
  const withResult = kept.filter((r) => r.hit || r.result).length;

  fs.writeFileSync(HIST, renderHistoryJs(kept, stamp), 'utf8');

  log(`\n【归档】竞彩已完场累积`);
  log(`  本次在售 ${newJc.games.length} 场 · 本次归档 ${addedNow} 场 · 历史累计 ${kept.length} 场`);
  log(`  其中 ${matched} 场在 football.js 里找到终场比分 · ${withResult} 场有胜负结果`);
  if (backfilled) log(`  另有 ${backfilled} 场补上了之前缺的终场比分`);
  log(`  24 小时窗口内 ${_jcWin.length} 场（窗口外丢弃 ${_jcDropped} 场）· 兜底上限 ${HIST_MAX} 场 · 已写入 ${path.basename(HIST)}`);

  /* 便于调用方一眼看到有没有真的累积起来 */
  return { added: addedNow, total: kept.length, matched, withResult, backfilled };
}

/* ============================================================
   主流程
   ============================================================ */
async function main() {
  log('════════════════════════════════════════════');
  log('  春风十里送大奖 · 竞彩在售比赛抓取');
  log('════════════════════════════════════════════\n');

  /* ============================================================
     【离线自测】--archive-test
     不联网、不碰真数据：在 DSH_JC_ROOT 指定的目录里放好
       old-jc-data.js（上一次在售）/ jc-data.js（这次在售）/
       football.js（终场比分）/ jc-history.js（旧历史，可无）
     然后把归档逻辑跑一遍，直接产出 jc-history.js。
     用来验收「比赛完场了就进已完场」+ 幂等。
     ============================================================ */
  if (process.argv.includes('--archive-test')) {
    const oldJcT = loadVar('old-jc-data.js', 'JC_DATA');
    const newJcT = loadVar('jc-data.js', 'JC_DATA');
    if (!newJcT || !Array.isArray(newJcT.games)) {
      log('❌ 缺少 newJc 夹具：' + path.join(ROOT, 'jc-data.js'));
      process.exit(1);
    }
    log('【自测】归档逻辑（离线，数据目录 ' + ROOT + '）');
    const r = archiveStep(oldJcT, newJcT, '2026-10-15 12:00');
    const written = loadVar('jc-history.js', 'JC_HISTORY');
    log('\n【自测】写出的 jc-history.js：');
    log(JSON.stringify(written, null, 1));
    log(`\n【自测】本次在售 ${newJcT.games.length} 场 / 归档 ${r.added} 场 / 历史累计 ${r.total} 场`);
    return;
  }

  /* ============================================================
     【离线补算】--retype
     不联网、不抓数据：读【已有的 jc-data.js】，用它里面已经由真实赔率
     算好的 reco.prob 重新判一遍类型（用的是 calcReco 里同一个
     recoTypeOf），把 reco.type 补进文件再原样写回去；其余字段不变。
     为什么需要这个模式：500.com 抓不到时（本机网络不通 / 云端被拒），
     「不败」类型不能一直干等下一次联网生效。
     ⚠️ 只写 jc-data.js —— 不归档、绝不碰 jc-history.js
        （历史归档记录不带 type，出页面时仍按 'three' 判红黑）。
     ============================================================ */
  if (process.argv.includes('--retype')) {
    const cur = loadVar('jc-data.js', 'JC_DATA');
    if (!cur || !Array.isArray(cur.games)) { log('❌ 读不到 jc-data.js'); process.exit(1); }
    let three = 0, unbeaten = 0, none = 0;
    log('【离线补算】推荐类型 reco.type（只读已有 reco.prob，不联网、不抓数据）');
    cur.games.forEach((g) => {
      const r = g.reco;
      if (!r) { none++; log(`  ${g.code} 无 reco（当时没抓到赔率）→ 不写 type`); return; }
      const t = recoTypeOf(r.pick, r.prob);
      r.type = t;
      if (t === 'unbeaten') unbeaten++; else three++;
      const top = r.prob
        ? Math.max(Number(r.prob.home), Number(r.prob.draw), Number(r.prob.away))
        : null;
      log(`  ${g.code} ${g.home.name} vs ${g.away.name} · ${r.label} ` +
          `最高概率 ${top == null ? '—' : top + '%'} → type=${t}`);
    });
    fs.writeFileSync(OUT, `/* 自动生成，请勿手动编辑 · ${cur.updated} */\n` +
      `const JC_DATA = ${JSON.stringify(cur, null, 1)};\n`, 'utf8');
    log(`\n✅ 已写回 ${OUT}（数据内容没变，只补了 reco.type）`);
    log(`   共 ${cur.games.length} 场：three ${three} · unbeaten ${unbeaten} · 无 reco ${none}`);
    log('   jc-history.js 未被触碰：历史归档记录不带 type，出页面时仍按 three 判红黑');
    return;
  }

  log('【1/3】竞彩在售列表');
  /* 【归档用】先把上一次的 jc-data 读出来 —— 覆盖之后就没了 */
  const oldJc = loadVar('jc-data.js', 'JC_DATA');
  const list = await fetchJcList();
  if (!list.length) { log('  ❌ 未取到竞彩列表'); process.exit(1); }
  log(`  ✅ ${list.length} 场在售`);

  /* 时间戳（SP 块和文件头都用它，所以提前算） */
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;

  log('\n【2/3】抓实时比分（未开赛/进行中/完场）');
  const scores = await fetchScores();
  log(`  ✅ 取到 ${scores.size} 场的状态与比分`);

  log('\n【2b/3】抓体彩官网官方竞彩 SP（胜平负 / 让球胜平负，模拟计算器用）');
  const spTry = await fetchOfficialSp();
  if (spTry.ok) {
    log(`  ✅ 官方 SP ${spTry.list.length} 场 · 官方更新 ${spTry.officialUpdate || '(无)'}` +
        ` · 在售 ${spTry.inSale == null ? '(无)' : spTry.inSale} 场`);
  } else {
    log(`  ⚠️ 官方 SP 抓不到（${spTry.error}）→ 保留上一次 jc-data.js 里的 SP 值`);
  }
  /* code（竞彩编号，如 周五001）→ SP 行；对不上编号时再用队名兜底 */
  const spByCode = new Map();
  const spByTeams = new Map();
  const teamKey = (h, a) => `${String(h || '').trim()}|${String(a || '').trim()}`;
  if (spTry.ok) {
    spTry.list.forEach((r) => {
      if (r.code) spByCode.set(r.code, r);
      spByTeams.set(teamKey(r.home, r.away), r);
    });
  }

  log('\n【3/3】逐场抓赔率并合并比分');
  /* 亚指综合换算（算一次就够，整个循环共用） */
  const AI = loadAsianIndex();
  if (AI) log('  ✅ 已载入 asian-index.js（亚指综合换算）');
  const games = [];
  let okOdds = 0;
  let withScore = 0;
  let withAsian = 0;

  for (const g of list) {
    let odds = null;
    if (g.fid) {
      odds = await fetchOdds(g.fid);
      await new Promise((r) => setTimeout(r, 200));
    }
    const reco = calcReco(odds);
    if (reco) okOdds++;

    /* ---- 亚指综合换算 ----
       输入来自真实抓到的数据：odds.asian（上下盘水位）+ g.handicap（竞彩让球数）。
       fundUp（上盘真实资金占比）目前【没有数据源】→ asianIndex.analysis 是 null，
       页面据此整块不显示热度/爆冷推演（绝不编数）。 */
    const asianIndex = AI ? AI.buildAsianIndex({ handicap: g.handicap, odds }) : null;
    if (asianIndex) withAsian++;

    /* ---- 合并实时比分 ---- */
    const s = scores.get(String(g.gid));
    let status = 'upcoming';
    let minute = 0;
    let hs = g.score ? g.score.home : null;
    let as_ = g.score ? g.score.away : null;

    if (s) {
      status = s.kind;
      minute = s.minute || 0;
      if (s.hasScore) { hs = s.home; as_ = s.away; }
    } else if (g.score) {
      status = 'live';
    }

    if (s && s.gs === 20) status = 'finished';
    else if (s && s.gs && s.gs !== 1 && s.gs !== 0) status = 'live';

    /* 【按时间兜底判断】—— 修「比赛早打完了还显示进行中」
       实测问题：2026-10-14 18:00 开赛、比分 3-0 已定，
                 到 10-15 00:35 页面仍标「进行中」。
       原因：245qq 有时把已经结束的比赛继续留在 GetRunballList（进行中）里，
             所以照抄它的 kind 就会一直是 live。
       规则：只要【两边都有比分】且【开赛时间 + 2.5 小时已经过去】→ 判为完场。
             正常比赛 90 分钟 + 中场 15 分 + 补时 ≈ 2 小时，留 2.5 小时余量；
             这样不会把正在进行（含加时/点球）的比赛误判成完场。
       注意：这条只往 'finished' 方向纠正，不会把完场改回进行中。 */
    if (hs !== null && hs !== undefined && as_ !== null && as_ !== undefined && status !== 'finished') {
      /* 开赛时间字段在不同数据源里名字不同，挨个试 */
      const rawTime = g.time || g.matchTime || g.startTime || g.beginTime || g.kickoff || '';
      let st = NaN;
      if (rawTime) {
        st = new Date(String(rawTime).replace(/-/g, '/')).getTime();
        if (isNaN(st)) st = new Date(String(rawTime)).getTime();
      }
      if (!isNaN(st) && (Date.now() - st) > 2.5 * 3600 * 1000) {
        status = 'finished';
      }
    }

    if (hs !== null && hs !== undefined) withScore++;

    const eu = odds && odds.europe && (odds.europe.live || odds.europe.open);
    const euTxt = eu ? `欧赔 ${eu.home}/${eu.draw}/${eu.away}` : '无欧赔';
    const scoreTxt = (hs !== null && hs !== undefined) ? `  ${hs}-${as_}` : '';
    const stTxt = { upcoming: '未开赛', live: `进行中${minute ? ' ' + minute + "'" : ''}`, finished: '完场' }[status];
    /* 亚指一行：有水位就报盘口+水位；fundUp 缺失时明说「热度推演不显示」 */
    const aiTxt = asianIndex
      ? (`亚盘 ${asianIndex.line}(${asianIndex.handicap}) 上盘=${asianIndex.upSide === 'home' ? '主' : '客'}` +
         ` ${asianIndex.upWater}/${asianIndex.downWater}` +
         (asianIndex.analysis
           ? ` · 亚指 ${asianIndex.analysis.conclusionTag} 偏差${asianIndex.analysis.devUp}%`
           : ' · 资金占比无数据源，热度推演不显示'))
      : '无亚盘';

    /* ---- 本场有没有官方竞彩 SP ---- */
    const spRow = spByCode.get(g.code)
      || spByTeams.get(teamKey(g.home.name, g.away.name))
      || null;

    log(`  ✅ ${g.code} ${g.time.slice(5)} [${g.league}] ${g.home.name} vs ${g.away.name}`);
    log(`       ${euTxt}  ${reco ? '→ ' + reco.label + ' ' + reco.confidence + '%' : ''}  [${stTxt}${scoreTxt}]`);
    log(`       ${aiTxt}`);
    if (spRow) {
      const one = (v) => (v == null ? '—' : v);
      log(`       SP 胜平负 ${one(spRow.had && spRow.had.h)}/${one(spRow.had && spRow.had.d)}/${one(spRow.had && spRow.had.a)}` +
        (spRow.hhad
          ? ` · 让球${spRow.hhad.line || ''} ${one(spRow.hhad.h)}/${one(spRow.hhad.d)}/${one(spRow.hhad.a)}`
          : ' · 无让球') +
        `（体彩官网官方 SP${spTry.ok ? '' : ' · 上次值'}）`);
    } else {
      log('       SP：本场不在体彩官网「在售计算器」列表里（无官方 SP，不进模拟计算器）');
    }

    games.push(Object.assign({}, g, {
      odds,
      reco,
      asianIndex,
      status,
      minute,
      liveScore: (hs !== null && hs !== undefined) ? { home: hs, away: as_ } : null
    }));
  }

  const stat = {
    total: games.length,
    upcoming: games.filter((g) => g.status === 'upcoming').length,
    live: games.filter((g) => g.status === 'live').length,
    finished: games.filter((g) => g.status === 'finished').length,
    withScore
  };

  /* ---------- 官方竞彩 SP 汇总块（写进 jc-data.js 顶层 sp） ----------
     source:
       official = 本次真的从体彩官网抓到了（本机可抓）
       carried  = 本次没抓到，沿用上一次 jc-data.js 里那份（云端常态）
       none     = 一次都没抓到过 → 页面显示「暂无 SP 数据」，绝不编数字 */
  const oldSpList = (oldJc && oldJc.sp && Array.isArray(oldJc.sp.list)) ? oldJc.sp.list : [];
  let spBlock;
  if (spTry.ok) {
    spBlock = {
      source: 'official',
      from: '体彩官网 webapi.sporttery.cn（getMatchCalculatorV1）· 官方 SP 原值',
      updated: stamp,
      officialUpdate: spTry.officialUpdate || '',
      inSale: spTry.inSale,
      list: spTry.list
    };
  } else if (oldSpList.length) {
    spBlock = {
      source: 'carried',
      from: `沿用上一次抓到的体彩官方 SP（本次没抓到：${spTry.error}）`,
      updated: (oldJc.sp && oldJc.sp.updated) || '',
      officialUpdate: (oldJc.sp && oldJc.sp.officialUpdate) || '',
      inSale: (oldJc.sp && oldJc.sp.inSale != null) ? oldJc.sp.inSale : null,
      list: oldSpList
    };
  } else {
    spBlock = {
      source: 'none',
      from: `暂无官方 SP（体彩官网接口抓不到：${spTry.error}）`,
      updated: '', officialUpdate: '', inSale: null, list: []
    };
  }

  const js = `/* 自动生成，请勿手动编辑 · ${stamp} */\n` +
    `const JC_DATA = ${JSON.stringify({ updated: stamp, stat, games, sp: spBlock }, null, 1)};\n`;

  fs.writeFileSync(OUT, js, 'utf8');

  log(`\n✅ 已写入 ${OUT}`);
  log(`   ${stat.total} 场在售 · ${okOdds} 场有赔率 · ${withScore} 场有比分 · ${withAsian} 场有亚盘`);
  log(`   SP（模拟计算器）：${spBlock.source} · ${spBlock.list.length} 场 · ${spBlock.from}`);
  log(`   未开赛 ${stat.upcoming} · 进行中 ${stat.live} · 完场 ${stat.finished}`);
  log(`   亚指综合换算：${withAsian} 场算出 asianIndex` +
      `（其中 ${games.filter((g) => g.asianIndex && g.asianIndex.analysis).length} 场有资金占比 → 显示热度推演）`);
  log(`   【如实说明】上盘真实资金占比 fundUp 目前【没有数据源】，` +
      `所以热度/爆冷推演不显示，页面上只显示真实水位换算出来的理论均衡占比。`);

  /* 【归档】必须在 jc-data.js 写完之后、用【旧数据 + 新数据】对比着算 */
  try {
    archiveStep(oldJc, { games }, stamp);
  } catch (e) {
    log(`\n⚠️ 归档失败（不影响本次在售数据）：${e.message}`);
  }

  log(`   ${stamp}`);
}

main().catch((e) => {
  console.error('\n❌ 出错：', e.message);
  process.exit(1);
});
