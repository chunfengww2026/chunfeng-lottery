/* ============================================================
   build-match.mjs —— 生成【比赛详情.html】（比赛详情页 · 第 1 步：框架 + 已有数据）
   ------------------------------------------------------------
   用户在竞彩页（足球推荐.html）点某一场比赛 → 进这一页看这场的数据。

   【为什么是独立页面】
     竞彩页的卡片点多、就地弹层会挡住列表；独立页返回逻辑天然（history.back），
     而且可以单独发布到云端，不影响竞彩页的排版。

   【为什么整份数据内嵌进 HTML】
     云端发布出去的是 cloud/out/football.html，它是【自包含】的 ——
     线上站点目录里【没有】jc-data.js（实测：out/football.html 里搜不到
     'JC_DATA' 也搜不到 'jc-data.js'）。所以详情页如果去 <script src="jc-data.js">，
     线上必然 404。这里在构建时就把 jc-data.js 的 games 数组内嵌进来，
     页面只用 URL 参数 ?c=周五002 找那一场 → 零外部依赖、永不 404。

   【只用已有数据，缺的不编】
     jc-data.js 里每场实际有：odds.europe(.open/.live 的 home/draw/away)、
     odds.asian(.open/.live 的 home/line/away)、odds.overunder(.open/.live 的 over/line/under)、
     reco(pick/label/confidence/prob/clear/margin)、asianIndex(整套换算)。
     这些全部来自 500.com 一个源 —— jc-data.js 里【没有任何公司名】，
     所以「大小 / 让球 / 亚指」表里只有 1 行，公司列如实写 500.com。

   用法：node build-match.mjs         → 写 比赛详情.html
   ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(HERE, '比赛详情.html');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* 从 "<var> = {...};" 里安全取出那个对象字面量 */
function loadVar(file, varName) {
  const fp = path.join(HERE, file);
  if (!fs.existsSync(fp)) return null;
  const src = fs.readFileSync(fp, 'utf8');
  const i = src.indexOf('const ' + varName);
  if (i < 0) return null;
  const a = src.indexOf('{', i);
  const b = src.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(src.slice(a, b + 1)); } catch (e) { return null; }
}

const JC = loadVar('jc-data.js', 'JC_DATA');
const HIST = loadVar('jc-history.js', 'JC_HISTORY');
const OFFICIAL = loadVar('jc-official.js', 'JC_OFFICIAL');
if (!JC || !Array.isArray(JC.games)) {
  console.error('❌ build-match.mjs：读不到 jc-data.js 的 JC_DATA.games');
  process.exit(1);
}

const UPDATED = JC.updated || '';
const IN_SALE = (OFFICIAL && OFFICIAL.inSale != null) ? OFFICIAL.inSale : (JC.stat && JC.stat.total) || null;

/* ============================================================
   【为什么还要读 jc-history.js】
     竞彩页的卡片【不只是】在售那 11 场 —— 已完场的 50 多场也各有卡片
     （用户要的是「每张卡片都能点进去看这场的数据」）。
     实测：竞彩页 64 张卡片里 53 张是归档场次，只内嵌 jc-data 的话
     这 53 张点进去全是「找不到」——等于 83% 的卡片是死的。

   jc-history.js 的条目【形状和在售不一样】，必须转一道：
     · home / away 是【字符串】（在售是 {name, rank}）
     · odds 是【扁平的 {home,draw,away}】（在售是 {open:{...}, live:{...}}）
       而且它只存了【即时】那一档 —— 初盘在 asianIndex 里（openHandicap 那套）
     · pickLabel / conf      → reco.label / reco.confidence
     · score "0:2" 这种字符串 → liveScore 数值
     · 【完全没有大小球字段】→ 这一档在详情页如实显示「没有」
   ============================================================ */
function normHist(r) {
  const parts = String(r.score || '').split(':');
  const hs = parts.length === 2 && parts[0] !== '' ? Number(parts[0]) : null;
  const as = parts.length === 2 && parts[1] !== '' ? Number(parts[1]) : null;
  const hasScore = hs !== null && as !== null && !isNaN(hs) && !isNaN(as);
  const o = r.odds || {};
  const anyOdds = [o.home, o.draw, o.away].some((v) => v != null);
  return {
    code: r.code || '',
    league: r.league || '',
    round: null,                    /* 归档里没有轮次 → 头部少显示一段，不编 */
    time: r.time || '',
    handicap: r.hc != null ? String(r.hc) : null,
    home: { name: r.home || '', rank: null },
    away: { name: r.away || '', rank: null },
    score: hasScore ? { home: hs, away: as } : { home: null, away: null },
    liveScore: hasScore ? { home: hs, away: as } : { home: null, away: null },
    statusText: '',
    /* ⚠️ 归档里【只保留最近 72 小时】的场次，实测 56 条里有 35 条其实是
       【还没开赛的】（有未来的 time、没有比分）。所以这里不能一律写 finished ——
       先标 'hist'，真正的状态由页面按「有没有比分」+「时间过没过」现算。 */
    status: 'hist',
    minute: 0,
    src: 'hist',
    odds: {
      /* 只存了即时一档 → 没有 open，前端会少显示半行「初盘」，不编 */
      europe: anyOdds ? { live: { home: o.home ?? null, draw: o.draw ?? null, away: o.away ?? null } } : null,
      asian: null,                  /* 归档的亚盘水位在 asianIndex 里，这里不重复造 */
      overunder: null               /* 归档【没有】大小球数据 */
    },
    reco: {
      pick: r.pick ?? null,
      label: r.pickLabel ?? null,
      confidence: r.conf ?? null,
      prob: r.prob ?? null,
      clear: null,
      margin: null,
      rqLine: (r.asianIndex && r.asianIndex.line) || null
    },
    asianIndex: r.asianIndex || null
  };
}

/* 在售优先（信息最全），归档补位 —— 按 code 去重，两边都没有的才真找不到 */
const LIVE_GAMES = Array.isArray(JC.games) ? JC.games : [];
const HIST_GAMES = (HIST && Array.isArray(HIST.list)) ? HIST.list.map(normHist) : [];
const seen = new Set();
const GAMES = [];
LIVE_GAMES.forEach((g) => { if (g && g.code && !seen.has(g.code)) { seen.add(g.code); GAMES.push(g); } });
let histAdded = 0;
HIST_GAMES.forEach((g) => { if (g && g.code && !seen.has(g.code)) { seen.add(g.code); GAMES.push(g); histAdded++; } });
/* 未开赛的排前面（按时间正序），已完场的排后面（按时间倒序）——和在售列表的读法一致 */
const tkey = (g) => String(g.time || '');
/* 归档里的状态：有比分=已完场；没比分且时间在数据更新时间之后=未开赛；否则按已完场算 */
const isDone = (g) => {
  if (g.status === 'live') return false;
  if (g.status === 'upcoming') return false;
  const ls = g.liveScore || g.score;
  if (ls && ls.home != null && ls.away != null) return true;
  if (g.status === 'finished') return true;
  return tkey(g) <= String(UPDATED || '');   /* 'hist' 且无比分：看时间 */
};
const up = GAMES.filter((g) => !isDone(g)).sort((a, b) => tkey(a).localeCompare(tkey(b)));
const fin = GAMES.filter((g) => isDone(g)).sort((a, b) => tkey(b).localeCompare(tkey(a)));
const ORDERED = up.concat(fin);

/* ---------- 数值工具（"缺"就是缺，不拿 0 或 — 冒充） ---------- */
const has = (v) => v !== null && v !== undefined && v !== '';
const num = (v) => (has(v) && isFinite(Number(v)) ? Number(v) : null);
const pct = (v) => { const n = num(v); return n === null ? null : (Math.round(n * 10) / 10) + '%'; };

/* 盘口的「让 X 球」写法一律用 500.com 原始字符串（odds.asian.*.line）——
   实测它本身就带「让/受」前缀（半球/一球、受平手/半球、受半球），
   从数值再拼一次会拼成「受让平手/半球」这种两边都没有的写法 → 属于编数据。
   所以这里只保留一个「数值 → 中文」的兜底表，给完全没有 line 字符串时用。 */
function hcFallback(h) {
  const n = num(h);
  if (n === null) return null;
  const map = { 0: '平手', 0.25: '平手/半球', 0.5: '半球', 0.75: '半球/一球', 1: '一球', 1.25: '一球/球半', 1.5: '球半', 1.75: '球半/两球', 2: '两球', 2.25: '两球/两球半', 2.5: '两球半', 2.75: '两球半/三球', 3: '三球' };
  const a = Math.abs(n);
  if (map[a]) return (n < 0 ? '受' : '让') + map[a];
  return (n > 0 ? '+' : '') + n;
}

/* 亚盘行里那种「受半球」是站在主队视角的，原样保留最诚实 */
const lineText = (o, side) => {
  if (!o || !has(o.line)) return null;
  return { text: String(o.line), home: num(o.home), away: num(o.away) };
};

/* ---------- 渲染一个卡片 ---------- */
function card(title, badgeHtml, bodyHtml, emptyText) {
  const inner = bodyHtml || `<div class="md-empty">${esc(emptyText)}</div>`;
  return `<section class="md-card">
  <div class="md-chead"><span class="md-ctitle">${esc(title)}</span>${badgeHtml || ''}</div>
  ${inner}
</section>`;
}

/* 「实时」角标：数据本身取自 live 就写实时，取自开盘就如实写初盘 */
function badge(fromLive, fromText) {
  return fromLive
    ? '<span class="md-badge live">实时</span>'
    : '<span class="md-badge">' + esc(fromText || '初盘') + '</span>';
}

const liveBadge = () => '<span class="md-badge live">实时</span>';

/* ============================================================
   服务端只把 games 内嵌进去；DOM 由页面里的小脚本按 ?c= 渲染。
   这样将来加模块（必发/分歧指/泊松…）只改这一处。
   ============================================================ */
const DATA_JSON = JSON.stringify({
  updated: UPDATED,
  histUpdated: (HIST && HIST.updated) || '',
  inSale: IN_SALE,
  liveCount: LIVE_GAMES.length,
  histCount: histAdded,
  games: ORDERED
}).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>比赛详情 · 彩虹多多</title>
<style>
:root {
  --ro-bg:#f7efe1; --ro-card:#fdf6ea; --ro-line:#e8d7bd;
  --ro-fg:#4a3a26; --ro-fg2:#8a7a63; --ro-ok:#1a8c5a;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin:0; padding:0; }
body {
  background: var(--ro-bg); color: var(--ro-fg);
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  overflow-x: hidden;
}
a { color: var(--ro-ok); text-decoration: none; }

/* ① 顶部返回栏 —— sticky（用 &lt;a&gt;，页面里没有任何裸 button 元素） */
.md-top {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; background: rgba(247,239,225,0.97);
  backdrop-filter: blur(8px); border-bottom: 1px solid var(--ro-line);
}
.md-back { color: var(--ro-ok); font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.md-title { flex: 1 1 auto; text-align: center; font-size: 15.5px; font-weight: 800; color: var(--ro-fg); }
.md-live { font-size: 11.5px; color: var(--ro-fg2); white-space: nowrap; }
.md-live i { font-style: normal; color: var(--ro-ok); font-weight: 700; }

.md-wrap { padding: 12px 12px 0; max-width: 560px; margin: 0 auto; }

/* ② 数据源切换（本次只做样式；雷速体育 = 占位，点了不报错） */
.md-src { display: flex; gap: 8px; margin-bottom: 12px; }
.md-srcbtn {
  flex: 1 1 0; min-width: 0; text-align: center; cursor: pointer;
  font-size: 13px; font-weight: 700; color: var(--ro-fg2);
  background: var(--ro-card); border: 1px solid var(--ro-line);
  border-radius: 9px; padding: 8px 4px;
}
.md-srcbtn.on { color: #fff; background: var(--ro-ok); border-color: var(--ro-ok); }
.md-srcbtn.soon { color: #a99a82; }
.md-srcbtn.soon::after { content: '即将'; font-size: 9px; margin-left: 3px; opacity: .8; }
.md-srcnote { font-size: 11.5px; color: var(--ro-fg2); margin: -6px 0 12px; min-height: 16px; }

/* ③ 比赛头部 */
.md-head {
  background: var(--ro-card); border: 1px solid var(--ro-line);
  border-radius: 12px; padding: 13px 14px; margin-bottom: 12px;
}
.md-hmeta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-size: 11.5px; color: var(--ro-fg2); }
.md-code { font-weight: 800; color: var(--ro-fg); background: var(--ro-bg); border: 1px solid var(--ro-line); border-radius: 5px; padding: 2px 7px; }
.md-hstate { margin-left: auto; font-weight: 700; color: var(--ro-ok); }
.md-hstate.fin { color: var(--ro-fg2); }
.md-hstate.live { color: #c0392b; }
.md-teams { display: flex; align-items: center; gap: 8px; margin: 11px 0 4px; }
.md-team { flex: 1 1 0; min-width: 0; font-size: 15.5px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-team.home { text-align: right; }
.md-team em { font-style: normal; font-size: 11.5px; font-weight: 700; color: var(--ro-fg2); margin: 0 3px; }
.md-vs { flex: 0 0 auto; min-width: 56px; text-align: center; font-size: 15px; font-weight: 800; color: var(--ro-fg2); font-family: Consolas, monospace; }
.md-vs.score { color: var(--ro-ok); }
.md-htime { text-align: center; font-size: 12.5px; color: var(--ro-fg2); font-family: Consolas, monospace; }
.md-htip { margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--ro-line); font-size: 12.5px; color: var(--ro-fg); }
.md-htip b { color: var(--ro-ok); }

/* ④ 四个模块卡片 */
.md-card { background: var(--ro-card); border: 1px solid var(--ro-line); border-radius: 12px; padding: 12px 13px; margin-bottom: 12px; }
.md-chead { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.md-ctitle { font-size: 14.5px; font-weight: 800; color: var(--ro-fg); }
.md-badge { margin-left: auto; font-size: 10.5px; font-weight: 700; color: var(--ro-fg2); background: var(--ro-bg); border: 1px solid var(--ro-line); border-radius: 20px; padding: 2px 8px; }
.md-badge.live { color: var(--ro-ok); border-color: rgba(26,140,90,0.35); background: rgba(26,140,90,0.10); }
.md-empty { font-size: 12.5px; color: var(--ro-fg2); padding: 4px 0; }

/* 欧指三格 */
.md-ou { display: flex; gap: 9px; }
.md-ou > div { flex: 1 1 0; min-width: 0; text-align: center; background: var(--ro-bg); border: 1px solid var(--ro-line); border-radius: 9px; padding: 8px 3px; }
.md-ou span { display: block; font-size: 11.5px; color: var(--ro-fg2); margin-bottom: 3px; }
.md-ou b { font-size: 19px; font-weight: 800; color: var(--ro-fg); font-family: Consolas, monospace; }
.md-ou > div.top b { color: var(--ro-ok); }
.md-ou > div.top { border-color: rgba(26,140,90,0.45); background: rgba(26,140,90,0.08); }
.md-ourow { display: flex; gap: 9px; margin-top: 8px; font-size: 11.5px; color: var(--ro-fg2); justify-content: space-between; }

/* 小表 */
.md-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
.md-tbl th, .md-tbl td { font-size: 13px; padding: 7px 2px; border-bottom: 1px solid var(--ro-line); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-tbl th { font-size: 11.5px; font-weight: 700; color: var(--ro-fg2); background: transparent; }
.md-tbl tr:last-child td { border-bottom: 0; }
.md-tbl td.n { font-family: Consolas, monospace; font-size: 13.5px; color: var(--ro-fg); font-weight: 700; }
.md-tbl td.s { color: var(--ro-fg); }
.md-tbl td.dim { color: var(--ro-fg2); }
.md-tbl th:first-child, .md-tbl td:first-child { text-align: left; }
.md-tbl .up { color: var(--ro-ok); font-weight: 800; }
.md-tbl .down { color: #c0392b; font-weight: 800; }
/* 亚指那两列（初盘/即时）内容是「盘口 + 水位」，比别的列长 ——
   允许折成两行，绝不用省略号把盘口吃掉 */
.md-tbl td.wrap { white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.35; }
.md-tbl td.wrap span { font-size: 12px; color: var(--ro-fg2); white-space: nowrap; }
.md-one { font-size: 12.5px; color: var(--ro-fg2); }

.md-foot { max-width: 560px; margin: 2px auto 0; padding: 0 12px; font-size: 11.5px; color: var(--ro-fg2); line-height: 1.7; }
.md-foot b { color: var(--ro-fg); }
.md-miss { background: var(--ro-card); border: 1px solid var(--ro-line); border-radius: 12px; padding: 16px; text-align: center; }
.md-miss .t { font-size: 15px; font-weight: 800; margin-bottom: 8px; }
.md-miss .d { font-size: 13px; color: var(--ro-fg2); margin-bottom: 12px; }
.md-miss a { display: inline-block; padding: 8px 16px; border: 1px solid var(--ro-ok); border-radius: 8px; font-weight: 700; }
</style>
</head>
<body>

<div class="md-top">
  <a class="md-back" id="mdBack" href="football.html">← 返回</a>
  <span class="md-title">比赛详情</span>
  <span class="md-live" id="mdLive"></span>
</div>

<div class="md-wrap">
  <div id="mdBody"></div>
</div>

<script id="mdData" type="application/json">${DATA_JSON}</script>
<script>
(function () {
  var D;
  try { D = JSON.parse(document.getElementById('mdData').textContent); } catch (e) { D = { games: [] }; }
  var games = (D && D.games) || [];

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var has = function (v) { return v !== null && v !== undefined && v !== ''; };
  var num = function (v) { return (has(v) && isFinite(Number(v))) ? Number(v) : null; };
  var pct = function (v) { var n = num(v); return n === null ? null : (Math.round(n * 10) / 10) + '%'; };

  /* 盘口数值 → 中文写法：只作【兜底】。
     正常情况一律用 500.com 原始字符串（odds.asian.*.line），它本身就带「让/受」前缀；
     从数值再拼一次会拼出「受让平手/半球」这种两边都没有的写法 → 那属于编数据。 */
  function hcFallback(h) {
    var n = num(h); if (n === null) return null;
    var m = { 0: '平手', 0.25: '平手/半球', 0.5: '半球', 0.75: '半球/一球', 1: '一球', 1.25: '一球/球半', 1.5: '球半', 1.75: '球半/两球', 2: '两球', 2.25: '两球/两球半', 2.5: '两球半', 2.75: '两球半/三球', 3: '三球' };
    var a = Math.abs(n);
    return m[a] ? ((n < 0 ? '受' : '让') + m[a]) : ((n > 0 ? '+' : '') + n);
  }
  /* 初盘 vs 即时：盘口值谁大谁「升」 */
  function chg(openH, liveH, openLine, liveLine) {
    var a = num(openH), b = num(liveH);
    if (a === null || b === null) return has(liveLine) ? esc(liveLine) : '—';
    if (b > a) return '<span class="up">升盘</span>';
    if (b < a) return '<span class="down">降盘</span>';
    if (has(openLine) && has(liveLine) && String(openLine) !== String(liveLine)) return '<span class="up">变盘</span>';
    return '<span class="dim">不变</span>';
  }
  /* 水位变化箭头 */
  function wchg(o, l) {
    var a = num(o), b = num(l);
    if (a === null || b === null) return '';
    if (b > a) return ' <span class="up">↑</span>';
    if (b < a) return ' <span class="down">↓</span>';
    return '';
  }

  /* 角标：在售场次用 live/open 区分；归档场次只存了一档，它是
     【归档那一刻的快照】—— 写「实时」会误导（这场可能早就踢完了）。 */
  var badge = function (isLive, text, g) {
    if (g && g.src === 'hist') return '<span class="md-badge">归档快照</span>';
    return isLive ? '<span class="md-badge live">实时</span>'
                  : '<span class="md-badge">' + esc(text || '初盘') + '</span>';
  };

  function card(title, badgeHtml, bodyHtml, emptyText) {
    return '<section class="md-card"><div class="md-chead"><span class="md-ctitle">' + esc(title) + '</span>'
      + (badgeHtml || '') + '</div>'
      + (bodyHtml || ('<div class="md-empty">' + esc(emptyText) + '</div>'))
      + '</section>';
  }

  /* ---- ④-1 欧指：三格，最高的那个用主色 ---- */
  function renderEurope(g) {
    var eu = g.odds && g.odds.europe;
    if (!eu) return card('欧指', '', null, '这一场没有欧赔数据');
    var live = eu.live || eu.open;
    if (!live) return card('欧指', '', null, '这一场没有欧赔数据');
    var isLive = !!eu.live;
    var h = num(live.home), d = num(live.draw), a = num(live.away);
    var vals = [h, d, a].filter(function (x) { return x !== null; });
    var mx = vals.length ? Math.max.apply(null, vals) : null;
    var cell = function (label, v) {
      var top = (mx !== null && v !== null && v === mx);
      return '<div' + (top ? ' class="top"' : '') + '><span>' + label + '</span><b>'
        + (v === null ? '—' : v.toFixed(2)) + '</b></div>';
    };
    var body = '<div class="md-ou">' + cell('主胜', h) + cell('平', d) + cell('客胜', a) + '</div>';
    /* 开盘 → 即时（有帮助就显示，没有就少说） */
    var op = eu.open;
    if (op && (num(op.home) !== null || num(op.draw) !== null || num(op.away) !== null)) {
      body += '<div class="md-ourow"><span>初盘 ' + (num(op.home) !== null ? num(op.home).toFixed(2) : '—')
        + ' / ' + (num(op.draw) !== null ? num(op.draw).toFixed(2) : '—')
        + ' / ' + (num(op.away) !== null ? num(op.away).toFixed(2) : '—') + '</span>'
        + '<span>最高值＝主色</span></div>';
    }
    return card('欧指', badge(isLive, '初盘', g), body);
  }

  /* ---- ④-2 大小：一行 = 一个数据源（现在只有 500.com 一家） ---- */
  function renderOU(g) {
    var ou = g.odds && g.odds.overunder;
    if (!ou) return card('大小', '', null, g.src === 'hist'
      ? '归档场次没有存大小球数据（jc-history.js 只存欧赔即时 + 亚指即时）' : '这一场没有大小球数据');
    var live = ou.live || ou.open, open = ou.open;
    if (!live) return card('大小', '', null, '这一场没有大小球数据');
    var over = num(live.over), line = num(live.line), under = num(live.under);
    if (over === null && line === null && under === null) return card('大小', '', null, '这一场没有大小球数据');
    var isLive = !!ou.live;
    var t = '<table class="md-tbl"><thead><tr><th style="width:28%">公司</th>'
      + '<th style="width:24%">大</th><th style="width:24%">盘口</th><th style="width:24%">小</th></tr></thead><tbody>'
      + '<tr><td class="s">500.com</td>'
      + '<td class="n">' + (over === null ? '—' : over.toFixed(2)) + '</td>'
      + '<td class="n">' + (line === null ? '—' : line.toFixed(1)) + '</td>'
      + '<td class="n">' + (under === null ? '—' : under.toFixed(2)) + '</td></tr>'
      + '</tbody></table>'
      + '<div class="md-one">大/小＝该档水位（越低越贵）；盘口＝进球数分界'
      + (open && (num(open.over) !== over || num(open.line) !== line || num(open.under) !== under)
        ? ' · 初盘 ' + (num(open.over) === null ? '—' : num(open.over).toFixed(2)) + ' / '
          + (num(open.line) === null ? '—' : num(open.line).toFixed(1)) + ' / '
          + (num(open.under) === null ? '—' : num(open.under).toFixed(2)) : ' · 初盘与即时一致')
      + '</div>';
    return card('大小', badge(isLive, '初盘', g), t);
  }

  /* ---- ④-3 让球：公司 / 盘口 / 主水 / 客水 ----
     用户规格里写的是「主让 / 盘口 / 客让」，但 jc-data.js 里 500.com 实际只给三个值：
     odds.asian.*.line（盘口字符串）+ home / away（两边的【水位】）。
     没有「主让 0.85」这种独立字段 —— 所以表头如实写 盘口/主水/客水，不硬套规格名字。 */
  function renderRQ(g) {
    var as = g.odds && g.odds.asian;
    if (!as) return card('让球', '', null, '这一场没有让球数据');
    var live = as.live || as.open;
    if (!live) return card('让球', '', null, '这一场没有让球数据');
    var home = num(live.home), away = num(live.away);
    /* 盘口只写 500.com 的原样字符串；没有字符串时才退回数值换算 */
    var zhLine = has(live.line) ? String(live.line) : hcFallback(g.asianIndex ? g.asianIndex.handicap : null);
    if (home === null && away === null && !has(zhLine)) return card('让球', '', null, '这一场没有让球数据');
    var isLive = !!as.live;
    var t = '<table class="md-tbl"><thead><tr><th style="width:28%">公司</th>'
      + '<th style="width:24%">盘口</th><th style="width:24%">主水</th><th style="width:24%">客水</th></tr></thead><tbody>'
      + '<tr><td class="s">500.com</td>'
      + '<td class="s">' + (has(zhLine) ? esc(zhLine) : '—') + '</td>'
      + '<td class="n">' + (home === null ? '—' : home.toFixed(2)) + '</td>'
      + '<td class="n">' + (away === null ? '—' : away.toFixed(2)) + '</td></tr>'
      + '</tbody></table>'
      + '<div class="md-one">主水/客水＝两侧水位（越低越贵）；盘口带「受」＝主队受让（客队让球）'
      + (as.open && has(as.open.line) && String(as.open.line) !== String(live.line)
        ? ' · 初盘 ' + esc(as.open.line) : '')
      + '</div>';
    return card('让球', badge(isLive, '初盘', g), t);
  }

  /* ---- ④-4 亚指：只有 1 家（jc-data 里没有任何公司名）→ 有几家显示几家 ---- */
  function renderAsian(g) {
    var as = g.odds && g.odds.asian;
    var ai = g.asianIndex;
    if (!as && !ai) return card('亚指', '', null, '这一场没有亚指数据');
    var o = as && as.open, l = as && as.live;
    var openLine = (ai && ai.handicapChange && ai.handicapChange.initLine) || (o && o.line) || null;
    var nowLine = (ai && ai.handicapChange && ai.handicapChange.nowLine) || (l && l.line) || null;
    var openWater = (ai && num(ai.openUpWater) !== null) ? ai.openUpWater : (o && o.home);
    var nowWater = (ai && num(ai.upWater) !== null) ? ai.upWater : (l && l.home);
    var change = chg(o && o.home, l && l.home, openLine, nowLine);
    var t = '<table class="md-tbl"><thead><tr><th style="width:24%">公司</th>'
      + '<th style="width:26%">初盘</th><th style="width:26%">即时</th><th style="width:24%">变化</th></tr></thead><tbody>';
    t += '<tr><td class="s">500.com</td>'
      + '<td class="s wrap">' + (has(openLine) ? esc(openLine) : '—')
      + (num(openWater) !== null ? '<br><span>' + num(openWater).toFixed(2) + '</span>' : '') + '</td>'
      + '<td class="s wrap">' + (has(nowLine) ? esc(nowLine) : '—')
      + (num(nowWater) !== null ? '<br><span>' + num(nowWater).toFixed(2) + wchg(openWater, nowWater) + '</span>' : '') + '</td>'
      + '<td class="s">' + change + '</td></tr>';
    t += '</tbody></table>';
    if (ai) {
      t += '<div class="md-one">'
        + (has(ai.handicapChange && ai.handicapChange.type) ? '盘口走势 <b>' + esc(ai.handicapChange.type) + '</b> · ' : '')
        + (has(ai.upSide) ? '上盘 ' + esc(ai.upSide === 'home' ? '主队' : ai.upSide === 'away' ? '客队' : ai.upSide) + ' · ' : '')
        + (num(ai.upWater) !== null ? '上水 ' + num(ai.upWater).toFixed(2) + ' · ' : '')
        + (num(ai.downWater) !== null ? '下水 ' + num(ai.downWater).toFixed(2) + ' · ' : '')
        + (num(ai.totalWater) !== null ? '总水 ' + num(ai.totalWater).toFixed(2) : '')
        + '</div>';
    }
    return card('亚指', badge(!!l, '初盘', g), t);
  }

  /* ---- ③ 比赛头部 ---- */
  /* 归档场次用的是另一种数据形状（jc-history.js），这里统一推出一个状态。
     口径：有比分 → 已完场；没比分且时间在数据更新时间之后 → 未开赛；否则按已完场。 */
  function gameState(g) {
    if (g.status === 'live') return { cls: ' live', txt: g.minute ? (g.minute + "' 进行中") : '进行中', done: false };
    if (g.status === 'upcoming') return { cls: '', txt: '未开赛', done: false };
    var ls = g.liveScore || g.score;
    if (ls && ls.home !== null && ls.home !== undefined && ls.away !== null && ls.away !== undefined) {
      return { cls: ' fin', txt: '已完场', done: true };
    }
    if (g.status === 'finished') return { cls: ' fin', txt: '已完场', done: true };
    if (String(g.time || '') <= String(D.updated || '')) return { cls: ' fin', txt: '已完场', done: true };
    return { cls: '', txt: '未开赛', done: false };
  }

  function renderHead(g) {
    var h = g.home || {}, a = g.away || {};
    var hn = has(h.name) ? h.name : '主队', an = has(a.name) ? a.name : '客队';
    var hr = (h.rank !== null && h.rank !== undefined && h.rank !== 0 && h.rank !== '') ? '[' + esc(h.rank) + ']' : '';
    var ar = (a.rank !== null && a.rank !== undefined && a.rank !== 0 && a.rank !== '') ? '[' + esc(a.rank) + ']' : '';
    var stt = gameState(g);
    var stCls = stt.cls, stTxt = stt.txt;
    var isHist = g.src === 'hist';
    if (isHist) stTxt = stTxt + ' · 归档';
    /* 有比分就显示比分，没有就 VS */
    var ls = g.liveScore || g.score;
    var showScore = ls && ls.home !== null && ls.home !== undefined && ls.away !== null && ls.away !== undefined && stt.done;
    var vs = showScore ? '<span class="md-vs score">' + esc(ls.home) + ' - ' + esc(ls.away) + '</span>'
      : '<span class="md-vs">VS</span>';
    var meta = (has(g.code) ? '<span class="md-code">' + esc(g.code) + '</span>' : '')
      + (has(g.league) ? '<span>' + esc(g.league) + '</span>' : '')
      + (has(g.round) ? '<span>· ' + esc(g.round) + '</span>' : '')
      + '<span class="md-hstate' + stCls + '">' + esc(stTxt) + '</span>';
    var tip = '';
    var r = g.reco;
    if (r && has(r.label)) {
      tip = '<div class="md-htip">推荐 <b>' + esc(r.label) + '</b>'
        + (num(r.confidence) !== null ? ' · 信心 ' + esc(pct(r.confidence)) : '')
        + (r.clear === true ? ' · 分歧小' : (r.clear === false ? ' · 分歧偏大' : ''))
        + (has(r.rqLine) ? ' · 让球线 ' + esc(r.rqLine) : '')
        + '</div>';
    }
    return '<section class="md-head">'
      + '<div class="md-hmeta">' + meta + '</div>'
      + '<div class="md-teams"><span class="md-team home">' + (hr ? '<em>' + hr + '</em>' : '') + esc(hn) + '</span>'
      + vs
      + '<span class="md-team away">' + esc(an) + (ar ? '<em>' + ar + '</em>' : '') + '</span></div>'
      + '<div class="md-htime">' + esc(g.time || '') + (has(g.handicap) ? ' · 让球 ' + esc(g.handicap) : '') + '</div>'
      + tip
      + (isHist ? '<div class="md-one" style="margin-top:8px">这场已过【在售】窗口，数据来自 归档记录（jc-history.js）—— 只存了欧赔即时/亚指即时一档</div>' : '')
      + '</section>';
  }

  /* ---- ② 数据源切换（本次只做样式，点了不报错） ---- */
  function srcBar() {
    return '<div class="md-src" id="mdSrc">'
      + '<div class="md-srcbtn on" data-src="all" role="button" tabindex="0">全部</div>'
      + '<div class="md-srcbtn" data-src="500" role="button" tabindex="0">500.com</div>'
      + '<div class="md-srcbtn soon" data-src="leisu" role="button" tabindex="0" aria-disabled="true">雷速体育</div>'
      + '</div><div class="md-srcnote" id="mdSrcNote"></div>';
  }

  function esc0(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ---- 组装整页 ---- */
  function render(g) {
    var body = srcBar() + renderHead(g)
      + renderEurope(g) + renderOU(g) + renderRQ(g) + renderAsian(g);
    document.getElementById('mdBody').innerHTML = body;

    /* 数据源：全部/500.com 可点（只切高亮 + 一句说明，不改数据、不报错）；
       雷速体育 = 占位，点了给一句「暂未接入」 */
    var note = document.getElementById('mdSrcNote');
    var bar = document.getElementById('mdSrc');
    bar.addEventListener('click', function (ev) {
      var el = ev.target.closest ? ev.target.closest('.md-srcbtn') : null;
      if (!el) return;
      var s = el.getAttribute('data-src');
      if (s === 'leisu') {
        note.textContent = '雷速体育数据源暂未接入（本次只有 500.com）';
        return;
      }
      var all = bar.querySelectorAll('.md-srcbtn');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('on');
      el.classList.add('on');
      note.textContent = (s === 'all')
        ? '当前只有 500.com 一个数据源，这一页显示的就是它'
        : '数据源：500.com';
    });
    bar.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.target.click(); }
    });
  }

  /* ---- 找不到那一场：不白屏、给回去的路 ---- */
  function renderMiss(code) {
    document.getElementById('mdBody').innerHTML =
      '<div class="md-miss"><div class="t">没有找到这场比赛的详情</div>'
      + '<div class="d">' + (code ? '编号 ' + esc0(code) + ' ' : '') + '不在当前数据里（已过保留期被清理，或编号写错了）。</div>'
      + '<a href="football.html">← 回到竞彩页</a></div>';
    document.getElementById('mdLive').innerHTML = '';
  }

  /* ---- 入口：?c=周五002 ---- */
  var code = null;
  try { code = new URLSearchParams(location.search).get('c'); } catch (e) { code = null; }
  if (code) code = String(code).trim();

  var g = null;
  if (code) {
    for (var i = 0; i < games.length; i++) {
      if (String(games[i].code || '').trim() === code) { g = games[i]; break; }
    }
  }
  /* 没带参数：只有一场就直接展示（用户从别处手滑点进来也不白屏） */
  if (!g && !code && games.length === 1) g = games[0];

  document.getElementById('mdLive').innerHTML = '更新 <i>' + esc0((D.updated || '').slice(11) || '—') + '</i>';
  if (g) render(g); else renderMiss(code);
})();
</script>

<div class="md-foot" id="mdFoot"></div>
<script>
(function () {
  var D; try { D = JSON.parse(document.getElementById('mdData').textContent); } catch (e) { D = {}; }
  var foot = '数据源：<b>500.com</b>（欧赔 / 亚盘 / 大小球）· 共 ' + ((D.games || []).length) + ' 场在库'
    + '（在售 ' + (D.liveCount || 0) + ' + 归档 ' + (D.histCount || 0) + '）'
    + (D.inSale ? ' · 体彩官方在售 ' + D.inSale + ' 场' : '')
    + '<br>在售数据更新时间：' + (D.updated || '—') + (D.histUpdated ? ' · 归档数据更新时间：' + D.histUpdated : '')
    + '<br>本页只陈列数据，不构成投注建议。';
  document.getElementById('mdFoot').innerHTML = foot;
  /* 返回：优先浏览器历史，站内直接进来的就回竞彩页 */
  var back = document.getElementById('mdBack');
  back.addEventListener('click', function (ev) {
    if (document.referrer && history.length > 1) { ev.preventDefault(); history.back(); }
  });
})();
</script>
</body>
</html>
`;

fs.writeFileSync(OUT_FILE, html, 'utf8');
console.log('✅ 比赛详情.html 已生成  ' + (fs.statSync(OUT_FILE).size / 1024).toFixed(1) + ' KB');
console.log('   内嵌比赛：' + ORDERED.length + ' 场（在售 ' + LIVE_GAMES.length + ' + 归档 ' + histAdded + '）'
  + ' · 在售数据时间 ' + (UPDATED || '—') + ' · 归档数据时间 ' + ((HIST && HIST.updated) || '—')
  + ' · 体彩官方在售 ' + (IN_SALE == null ? '—' : IN_SALE) + ' 场');
console.log('   入口：比赛详情.html?c=周五002');
