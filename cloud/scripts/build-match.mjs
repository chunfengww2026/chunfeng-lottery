/* ============================================================
   build-match.mjs —— 生成【比赛详情.html】（比赛详情页 · 第 2 步：加「泊松指数」+「分歧指」）
   ------------------------------------------------------------
   用户在竞彩页（足球推荐.html）点某一场比赛 → 进这一页看这场的数据。

   【为什么是独立页面】
     竞彩页的卡片点多、就地弹层会挡住列表；独立页返回逻辑天然（history.back），
     而且可以单独发布到云端，不影响竞彩页的排版。

   【返回键：href 写实际文件名 + 优先走浏览器历史】
     竞彩页的文件名是【足球推荐.html】（不是 football.html）—— 实测点「← 返回」
     原来落到 football.html 这个不存在的文件上，属于死链。
     现在：href="足球推荐.html"（直接打开也能回去），
     同时 href 上带 onclick="if(history.length>1){history.back();return false}"。
     ⚠️ 为什么不用第二段脚本里那句 document.referrer 判断：
        file:// 下 Chrome 不给 file→file 的跳转发 referrer（实测 document.referrer === ''），
        于是 "referrer && history.length>1" 永远为假 → history.back() 从来没生效过。
        history.length 才是 file:// 下唯一可靠的信号，所以判断挪到 href 的 onclick 里。

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

   【第 2 步新加的两个模块 —— 都只用已有数据，缺的不编】
     ⑤ 泊松指数：名字叫泊松，实际算法是【欧赔反推】（1/赔率 → 归一化到 100%）。
        返还率用「页面上显示的那三个赔率」现算 100%/(1/主+1/平+1/客)，
        任何一项拿不到就写「—」。模块说明里【如实写明这不是泊松分布模型】，
        免得用户以为用了进球数模型。
     ⑥ 分歧指：分歧＝多家公司欧赔的离散程度，【至少要 2 家】才成立。
        · 第 2 步（2026-10-17）已接上第二个源：球探 titan007 的欧赔比较
          （1x2d.titan007.com/{ScheduleID}.js，每场 320~370 家公司）。
          抓取 + 计算在 build-odds-divergence.mjs 里，结果写 jc-divergence.js，
          由这一页在【构建时内嵌】进去（自包含：线上站点目录里没有那个 js，也不会 404）。
          算法：各家【即时】欧赔逐方向算 cv = 标准差 ÷ 均值，按 3.0% / 5.5% 分低/中/高。
        · 这一场在 titan007 赛程里没对上号 / 只抓到 1 家 / jc-divergence.js 缺失时，
          仍然如实显示「暂无多家赔率数据，无法计算分歧」，绝不用单源硬造低/中/高。
     ⑦ 欧赔对比（2026-10-17 第 3 步）：同一趟抓取还产出 jc-titan.js ——
        每场【主流 12 家】的 初盘 / 即时 / 返还率 / 凯利 明细（英文原名映射成中文习惯名）。
        由 build-odds-divergence.mjs 一起写出来（一趟抓取两个出口，源上只请求一遍），
        这一页同样在【构建时内嵌】。缺文件 / 这一场没有 → 显示「暂无」，不编。

   【第 4 步 · 加两块：🔥 爆冷预警 + 📊 差异分析】（都用本页已有的真数据，零 mock）
     ⑧ 🔥 爆冷预警：民间口诀算法。【阈值是口诀参数，触发条件全部是真实数据】——
        ① 主胜赔率 &lt; 1.40
        ② |主队排名 − 客队排名| ≤ 3 且 平赔 &lt; 3.50
        ③ 主队排名 ≤ 5 且 客队排名 ≥ 15 且 客胜赔率 &gt; 4.00
        三条按顺序取第一条命中的；都不中 → normal（绿框 + 「暂无明显爆冷迹象」）。
        排名：在售场次每场都有（home.rank / away.rank 是数字）；归档场次没有排名 →
        第 ②③ 条那两场【如实写「无法判」，不拿欧赔接近度之类的代理指标硬凑】。
     ⑨ 📊 差异分析：给的是【数字】，不是模板文字 ——
        · 欧赔隐含概率（1/赔率 归一，和「泊松指数」同一口径）
        · 亚盘推算概率（上下盘水位各取倒数再归一，和「亚指」卡同一套水位）
        · 两者差几个百分点 + 分档（&lt;3 基本一致 / 3~6 轻微 / ≥6 明显）
        · 即时 vs 初盘 的涨跌（欧赔三项、亚盘让球线与上盘水位）
        ⚠️ 欧赔「主胜」是赢球概率、亚盘是「赢盘」概率（含走盘退款、没有平局项），
           两者口径不同 —— 卡片里如实写明"差只作横向参照"，不假装是同一件事。
     两块底部都带「以上为民间口诀算法自动推演，仅供参考」。

   【⚠️ 硬性规则 · 页面上【不许】出现任何"数据是从哪儿来的"】
     用户要求：全页面不要有任何地方显示在哪里抓取的数据（含站名 / 域名 / 接口 / 文件名）。
     所以这一页里：
       · 不再写「数据源：xxx」「数据来源：xxx」「来自 xxx」「取自 xxx」「接入 xxx」；
       · 不再出现 500.com / 球探 / titan007 / leisu / jc-data.js / jc-history.js /
         jc-divergence.js / jc-titan.js 这些字眼（连页内 <script> 的注释里都不写）；
       · 「公司」列里那唯一一行不再叫 500.com，改叫「综合」（列本身要保留 ——
         对比表里的博彩公司名是"公司"，不是"我们的来源"）；
       · 各表格里的【368 家】【共 64 场】【更新时间 2026-10-17 05:26】这类统计和时间
         不含来源信息 → 保留。
     ⚠️ 这一条由文件最后那段【留痕断言】强制执行：命中黑名单 → 生成失败 exit 1。
        所以以后谁再往页面里加站名 / 文件名，构建会当场报错，不会悄悄发上线。
     ⚠️ 用户自己起的两个标签名【数据检测报告】【体育抓取】要保留 —— 那是功能名，
        不含来源信息（断言里先剔除这两个词再扫「抓取」）。

   用法：node build-match.mjs         → 写 比赛详情.html
   ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* 【设备门 + PWA】共用模块（零 localStorage、零裸 button、文案不含任何出处）：
     本机 / ?admin=1 / 手机平板 → 放行；电脑浏览器 / 电脑微信 → 拦截。
   ⚠️ 新模块必须同步进 cloud/sync-cloud.mjs 的 FROM_ROOT，否则云端构建找不到它。 */
import {
  PWA_HEAD, DEVICE_GATE_CSS, DEVICE_GATE_BODY, INSTALL_CSS, INSTALL_HTML, INSTALL_JS
} from './device-gate.mjs';

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
/* ============================================================
   【分歧指 · 多公司欧赔】jc-divergence.js（build-odds-divergence.mjs 生成）
   ------------------------------------------------------------
   它抓的是球探 titan007 的 https://1x2d.titan007.com/{ScheduleID}.js ——
   每场 320~370 家公司的【初盘 + 即时】欧赔，用它才算得出"分歧"。
   ⚠️ 文件不存在也不算错：这一页照旧运行，分歧指那一档显示「暂无多家赔率数据」。
      绝不因为少一个可选数据文件就让整页生成失败（竞彩页 64 张卡片都指着它）。
   ============================================================ */
const DIV = loadVar('jc-divergence.js', 'JC_DIVERGENCE');
const DIV_GAMES = (DIV && DIV.games && typeof DIV.games === 'object') ? DIV.games : null;

/* ============================================================
   【欧赔对比 · 主流公司的初盘/即时/返还率/凯利】jc-titan.js
   ------------------------------------------------------------
   同一趟抓取（build-odds-divergence.mjs）产出的第二份文件：
   每场只留主流 12 家（该场共 320~370 家，全存要 11 MB，不值当）。
   ⚠️ 文件不存在 / 这一场没有 → 这一档显示「暂无」，绝不拿别处的数字顶。
   ⚠️ 页面里【不显示】source / sourceUrl 这两个字段（硬性规则：不留来源痕迹），
      所以下面内嵌时只取 updated / main / count / games。
   ============================================================ */
const TITAN = loadVar('jc-titan.js', 'JC_TITAN');
const TITAN_GAMES = (TITAN && TITAN.games && typeof TITAN.games === 'object') ? TITAN.games : null;

/* ============================================================
   【雷达寻胆 · 成交资金面】jc-bifa.js（fetch-bifa.mjs 生成）
   ------------------------------------------------------------
   现有的「信心」全部来自各家公司的【报价】（欧赔反推 / 盘口水位）——
   报价是"公司怎么说"。这一份补的是【已经成交的钱】：三项成交量、占比、
   成交价、盘口挂单量、大小球资金。
   ⚠️ 只有临近开赛的比赛才有这一份：成交额是赛前才累积起来的，
      距开赛太远 / 打完一阵子之后都会变空。没有就是没有 ——
      这一档显示「暂无」，绝不拿报价去反推一个成交量出来。
   ⚠️ 文件不存在 / 这一场没有 → 整个寻胆只用「欧赔 + 盘口 + 凯利」三个维度，
      权重在「投过票的维度」之间重新归一（不因为少一个维度就整体失真）。
   ⚠️ 内嵌时【只取 games 的数字】，不内嵌 metric / updated 之外的任何字段 ——
      页面上不许留来源痕迹（硬性规则）。
   ============================================================ */
const BIFA = loadVar('jc-bifa.js', 'JC_BIFA');
const BIFA_GAMES = (BIFA && BIFA.games && typeof BIFA.games === 'object') ? BIFA.games : null;

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
  /* 【分歧指】多公司欧赔的离散度（jc-divergence.js）。
     整体内嵌进页面 —— 线上站点目录里【没有】jc-divergence.js，
     所以绝不能让页面去 <script src> 它（那样线上必然 404，和 jc-data.js 同一个道理）。
     ⚠️ 这里【不内嵌 source / sourceUrl / note】—— 页面上不许留来源痕迹（硬性规则），
        字符串"球探 titan007"只要进了这个 JSON 就等于进了 HTML，断言也会拦下来。 */
  div: DIV_GAMES ? {
    updated: DIV.updated || '',
    metric: DIV.metric || '',
    levels: DIV.levels || null,
    count: Object.keys(DIV_GAMES).length,
    games: DIV_GAMES
  } : null,
  /* 【欧赔对比】主流 12 家的明细（jc-titan.js）。同样整体内嵌、同样不带 source。
     main = [[公司ID, 英文原名, 中文习惯名], …]，页面按这个顺序和名字显示；
     以后调名单只改 build-odds-divergence.mjs 的 MAIN_COMPANIES，页面不用动。 */
  multi: TITAN_GAMES ? {
    updated: TITAN.updated || '',
    main: Array.isArray(TITAN.main) ? TITAN.main : [],
    count: Object.keys(TITAN_GAMES).length,
    games: TITAN_GAMES
  } : null,
  /* 【雷达寻胆 · 成交资金面】每场三项的成交量 / 占比 / 成交价 + 挂单量 + 大小球。
     ⚠️ 只内嵌 games（纯数字）；metric / updated 之外一个字段都不带，
        免得把说明性文字带进 HTML 被断言拦下来。 */
  money: BIFA_GAMES ? {
    updated: BIFA.updated || '',
    count: Object.keys(BIFA_GAMES).length,
    games: BIFA_GAMES
  } : null,
  games: ORDERED
}).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>比赛详情 · 彩虹多多</title>
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
${PWA_HEAD}
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

/* ② 顶部三档标签：全部 / 数据检测报告 / 体育抓取
      ⚠️ 「数据检测报告」6 个字比原来的「检测」长得多，320px 下三个标签平分一行
         会挤 —— 所以：标签文字【不换行】+ 窄屏(<360px)自动缩字号和左右内边距。
         实测（CDP 设备模拟）：375px 每个标签 111.7px、320px 每个 93.3px，
         「数据检测报告」在 12.5px 下 75px、11.5px 下 69px，都装得下，不溢出。 */
.md-src { display: flex; gap: 8px; margin-bottom: 12px; }
.md-srcbtn {
  flex: 1 1 0; min-width: 0; text-align: center; cursor: pointer;
  font-size: 12.5px; font-weight: 700; color: var(--ro-fg2);
  background: var(--ro-card); border: 1px solid var(--ro-line);
  border-radius: 9px; padding: 8px 4px;
  white-space: nowrap;
}
.md-srcbtn.on { color: #fff; background: var(--ro-ok); border-color: var(--ro-ok); }
@media (max-width: 360px) {
  .md-src { gap: 6px; }
  .md-srcbtn { font-size: 11.5px; padding: 8px 2px; }
}
/* 提示语为空时【不占位】（「全部」那一档没有提示，删掉后不能留一条空白） */
.md-srcnote { font-size: 11.5px; color: var(--ro-fg2); margin: -6px 0 12px; min-height: 16px; }
.md-srcnote:empty { display: none; }

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

/* ④ 六个模块卡片（欧指 / 大小 / 让球 / 亚指 / 泊松指数 / 分歧指） */
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
/* 分歧指那三行的「低/中/高」档 —— 纯文字 + 实色，不靠浅灰（用户抱怨过太淡）
   ⚠️ 颜色都在米杏底(#fdf6ea)上量过对比度：低 #146c46 ≈5.6:1 / 中 #8a5a00 ≈5.4:1 /
      高 #a5281b ≈6.5:1，都过 4.5:1；底色只作提示，不承担"看得见"的责任。 */
.md-tbl td.lv { font-weight: 800; color: var(--ro-fg); }
.md-lv { display: inline-block; min-width: 34px; text-align: center; font-weight: 800; font-size: 12.5px; border-radius: 6px; padding: 2px 8px; }
.md-lv.low { color: #146c46; background: rgba(26,140,90,0.13); }
.md-lv.mid { color: #8a5a00; background: rgba(191,145,0,0.16); }
.md-lv.high { color: #a5281b; background: rgba(192,57,43,0.12); }
/* 分歧指的一句话结论（主胜分歧 低 / 平局分歧 中 / 客胜分歧 低） */
.md-divsum { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 9px; }
.md-divsum span { flex: 1 1 0; min-width: 0; text-align: center; font-size: 12px; color: var(--ro-fg2); background: var(--ro-bg); border: 1px solid var(--ro-line); border-radius: 8px; padding: 7px 4px; }
.md-divsum span b { display: block; margin-top: 3px; font-size: 13.5px; }
/* ⑥-2 雷达寻胆（四维共识）
   · 三行信心条：标签 + 横条 + 百分比。横条用两层 span（外框 + 内层 i 控宽），
     宽度由页内脚本按算出来的分数写进 style —— 320px 下横条会自己压窄，不溢出。
   · 「本期胆」那一条用米杏浅底 + 深棕字，和这一页其它卡片的层级一致。
   · 颜色沿用本页既有色：#1a8c5a（绿＝选中）· #8a7a63（次要字）· #c0392b（提醒）。 */
.md-radar-pick { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  background: var(--ro-bg); border: 1px solid var(--ro-line); border-radius: 9px;
  padding: 10px 12px; margin-bottom: 10px; }
.md-radar-pick .lb { font-size: 12px; color: var(--ro-fg2); }
.md-radar-pick b { font-size: 21px; font-weight: 800; color: var(--ro-ok); line-height: 1.1; }
.md-radar-pick .cf { font-size: 12.5px; color: var(--ro-fg2); }
/* 「本场无胆」那一条：字色换成次要色，别一眼看着像推荐 */
.md-radar-pick.none b { color: var(--ro-fg2); }
.md-radar-pick.none .cf { flex: 1 1 100%; }
.md-radar-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12.5px; }
.md-radar-row .k { flex: 0 0 40px; color: var(--ro-fg2); }
.md-radar-row .bar { flex: 1 1 auto; min-width: 0; height: 9px; border-radius: 5px;
  background: var(--ro-bg); border: 1px solid var(--ro-line); overflow: hidden; }
.md-radar-row .bar i { display: block; height: 100%; background: #c9b28e; }
.md-radar-row.on .k { color: var(--ro-fg); font-weight: 700; }
.md-radar-row.on .bar i { background: var(--ro-ok); }
.md-radar-row .v { flex: 0 0 46px; text-align: right; color: var(--ro-fg2);
  font-variant-numeric: tabular-nums; }
.md-radar-row.on .v { color: var(--ro-fg); font-weight: 700; }
.md-radar-votes { margin-top: 9px; font-size: 12px; color: var(--ro-fg2); line-height: 1.7; }
.md-radar-votes span { display: inline-block; margin-right: 8px; }
.md-radar-votes span b { color: var(--ro-fg2); }
.md-radar-votes span.on b { color: var(--ro-ok); }
.md-radar-money { margin-top: 7px; font-size: 12px; color: var(--ro-fg2); line-height: 1.6;
  background: var(--ro-bg); border: 1px solid var(--ro-line); border-radius: 8px; padding: 7px 9px; }
.md-radar-money b { color: var(--ro-fg); }
/* ⑦ 欧赔对比（主流 12 家 × 初盘 / 即时 / 返还率 / 凯利）
   一屏 5 列，320px 下每列只有 46~70px —— 所以每格里的三个数字（主/平/客）
   用 inline-block 小格【自己折行】，绝不用省略号把赔率吃掉。
   「初盘 → 即时」的变化就看【即时那三格的颜色】：绿＝比初盘高，红＝比初盘低。
   颜色对比度在米杏底(#fdf6ea)上量过：#146c46 ≈5.6:1 · #a5281b ≈6.5:1，都过 4.5:1。 */
.md-eu th { font-size: 11px; line-height: 1.25; }
.md-eu th em { font-style: normal; font-weight: 400; font-size: 9.5px; color: var(--ro-fg2); }
.md-eu td { padding: 6px 1px; vertical-align: top; }
.md-eu td.co { font-size: 12px; font-weight: 700; color: var(--ro-fg); white-space: normal; overflow: visible; line-height: 1.25; }
.md-eu td.nums { white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.35; }
.md-eu td.nums i {
  display: inline-block; font-style: normal; font-family: Consolas, monospace;
  font-size: 11.5px; color: var(--ro-fg); margin: 0 3px 1px 0;
}
.md-eu td.nums.small i { font-size: 10.5px; }
.md-eu td.nums i.up { color: #146c46; font-weight: 800; }
.md-eu td.nums i.down { color: #a5281b; font-weight: 800; }
.md-eu td.rate { font-family: Consolas, monospace; font-size: 11.5px; font-weight: 700; color: var(--ro-fg); line-height: 1.3; }
.md-eu td.rate span { display: block; font-size: 10px; font-weight: 400; color: var(--ro-fg2); }
.md-eu td.wide { font-size: 11px; white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.3; }
/* 分歧指：单源算不出来时的如实占位（虚线框，一眼看出是「没有」而不是「空着」） */
.md-na {
  border: 1px dashed var(--ro-line); border-radius: 9px;
  padding: 11px 12px; font-size: 12.5px; line-height: 1.6; color: var(--ro-fg);
}
.md-na b { color: var(--ro-fg); }
.md-na em { font-style: normal; color: var(--ro-fg2); }

/* ⑧ 资金分布（三项成交占比的横条）
   · 三条横条：标签 + 横条 + 占比。横条宽度＝该项占比，由页内脚本按数据写进 style ——
     320px 下横条自己压窄（flex:1 1 auto + min-width:0），不会把页面撑宽。
   · 三条同层级实色，靠明度区分，不靠"浅到看不见"的灰：
     主 #1a8c5a（本页主色）· 平 #a8842c · 客 #7a6248，都在米杏底(#fdf6ea)上看着有分量。
   · 占比那一格用等宽字体 + nowrap，「100%」在 320px 下也装得下。 */
.md-money-top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  background: var(--ro-bg); border: 1px solid var(--ro-line); border-radius: 9px;
  padding: 10px 12px; margin-bottom: 10px; }
.md-money-top .k { font-size: 12px; color: var(--ro-fg2); }
.md-money-top b { font-size: 21px; font-weight: 800; color: var(--ro-fg);
  line-height: 1.1; font-family: Consolas, monospace; }
.md-money-top .ex { font-size: 11.5px; color: var(--ro-fg2); font-family: Consolas, monospace; }
.md-money-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12.5px; }
.md-money-row .k { flex: 0 0 30px; color: var(--ro-fg); font-weight: 700; }
.md-money-row .bar { flex: 1 1 auto; min-width: 0; height: 12px; border-radius: 6px;
  background: var(--ro-bg); border: 1px solid var(--ro-line); overflow: hidden; }
.md-money-row .bar i { display: block; height: 100%; background: #1a8c5a; }
.md-money-row .bar i.draw { background: #a8842c; }
.md-money-row .bar i.away { background: #7a6248; }
.md-money-row .v { flex: 0 0 42px; text-align: right; white-space: nowrap;
  color: var(--ro-fg); font-weight: 700; font-family: Consolas, monospace; }
.md-money-amt { margin-top: 7px; font-size: 12px; color: var(--ro-fg2); line-height: 1.7; }
.md-money-amt span { white-space: nowrap; }
.md-money-amt b { color: var(--ro-fg); font-weight: 700; font-family: Consolas, monospace; }

/* ⑨ 爆冷预警（民间口诀算法）—— 触发时整卡转红框，未触发（normal）转绿框。
   · 颜色都在米杏底(#fdf6ea)上量过对比度：#a5281b ≈6.5:1 · #146c46 ≈5.6:1，都过 4.5:1。
   · 判词块单独一层底色 + 一个状态签；320px 下判词自己换行，不挤右侧徽标。
   · 判定表复用本页既有的 .md-tbl（条件那一列允许折行，绝不用省略号吃掉条件）。 */
.md-card.md-cold-on { border-color: rgba(192,57,43,0.55); }
.md-card.md-cold-on .md-ctitle { color: #a5281b; }
.md-card.md-cold-off { border-color: rgba(26,140,90,0.42); }
.md-card.md-cold-off .md-ctitle { color: #146c46; }
.md-badge.warn { color: #a5281b; border-color: rgba(192,57,43,0.35); background: rgba(192,57,43,0.10); }
.md-cold-box {
  border: 1px solid rgba(192,57,43,0.45); background: rgba(192,57,43,0.08);
  border-radius: 9px; padding: 10px 11px; margin-bottom: 9px;
}
.md-cold-off .md-cold-box { border-color: rgba(26,140,90,0.40); background: rgba(26,140,90,0.08); }
.md-cold-tag {
  display: inline-block; font-size: 10.5px; font-weight: 800; color: #fff;
  background: #a5281b; border-radius: 5px; padding: 1px 6px; margin-right: 6px;
}
.md-cold-off .md-cold-tag { background: #1a8c5a; }
.md-cold-msg { font-size: 13px; font-weight: 700; line-height: 1.6; color: #a5281b; }
.md-cold-off .md-cold-msg { color: #146c46; }
.md-cold-why { margin-top: 7px; font-size: 12px; line-height: 1.7; color: var(--ro-fg); }
.md-cold-why b { font-family: Consolas, monospace; color: #a5281b; }
.md-cold-off .md-cold-why b { color: #146c46; }
.md-cold-note {
  margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--ro-line);
  font-size: 11.5px; line-height: 1.7; color: var(--ro-fg2);
}
.md-cold-note b { color: var(--ro-fg); }

/* ⑩ 差异分析（欧赔隐含 vs 亚盘推算 + 即时/初盘变化）—— 蓝框。
   · 顶部那块是【真实数字】：差几个百分点大字摆着，判定分档在同一行下面。
   · 变化用 .md-diff-line 逐行摆，等宽字体 + nowrap 的只有数字，320px 不溢出。 */
.md-card.md-diff { border-color: rgba(31,78,121,0.45); }
.md-card.md-diff .md-ctitle { color: #1f4e79; }
.md-badge.blue { color: #1f4e79; border-color: rgba(31,78,121,0.35); background: rgba(31,78,121,0.10); }
.md-diff-quote {
  border: 1px solid rgba(31,78,121,0.35); background: rgba(31,78,121,0.07);
  border-radius: 9px; padding: 9px 11px; margin-bottom: 9px;
}
.md-diff-quote .lb { font-size: 11px; font-weight: 800; color: #1f4e79; margin-bottom: 3px; }
.md-diff-quote .tx { font-size: 12.5px; line-height: 1.65; color: var(--ro-fg); }
.md-diff-top {
  display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
  background: var(--ro-bg); border: 1px solid var(--ro-line); border-radius: 9px;
  padding: 9px 11px; margin-bottom: 9px;
}
.md-diff-top .k { font-size: 12px; color: var(--ro-fg2); }
.md-diff-top b { font-size: 19px; font-weight: 800; font-family: Consolas, monospace; color: #1f4e79; line-height: 1.15; }
.md-diff-top .u { font-size: 11.5px; color: var(--ro-fg2); }
.md-diff-top .jd { flex: 1 1 100%; font-size: 11.5px; line-height: 1.65; color: var(--ro-fg2); }
.md-diff-top .jd em { font-style: normal; font-weight: 800; color: #1f4e79; }
.md-diff-line { display: flex; gap: 7px; align-items: baseline; font-size: 12px;
  padding: 4px 0; border-bottom: 1px dashed var(--ro-line); color: var(--ro-fg); }
.md-diff-line:last-child { border-bottom: 0; }
.md-diff-line .k { flex: 0 0 54px; color: var(--ro-fg2); }
.md-diff-line .v { flex: 1 1 auto; min-width: 0; font-family: Consolas, monospace; word-break: break-word; }
.md-diff-line .d { flex: 0 0 auto; font-weight: 800; font-family: Consolas, monospace; white-space: nowrap; }
.md-diff-line .d.up { color: #146c46; }
.md-diff-line .d.down { color: #a5281b; }
.md-diff-sub { margin: 9px 0 2px; font-size: 12px; font-weight: 800; color: var(--ro-fg); }

.md-foot { max-width: 560px; margin: 2px auto 0; padding: 0 12px; font-size: 11.5px; color: var(--ro-fg2); line-height: 1.7; }
.md-foot b { color: var(--ro-fg); }
.md-miss { background: var(--ro-card); border: 1px solid var(--ro-line); border-radius: 12px; padding: 16px; text-align: center; }
.md-miss .t { font-size: 15px; font-weight: 800; margin-bottom: 8px; }
.md-miss .d { font-size: 13px; color: var(--ro-fg2); margin-bottom: 12px; }
.md-miss a { display: inline-block; padding: 8px 16px; border: 1px solid var(--ro-ok); border-radius: 8px; font-weight: 700; }
</style>
<!-- __DEVICE_GATE_CSS__ / __INSTALL_APP_CSS__ 设备门 + 一键桌面（device-gate.mjs）
     放在 </head> 之前 → 电脑端第一帧就是隐藏态，不会先闪出内容。 -->
<style>${DEVICE_GATE_CSS}${INSTALL_CSS}</style>
</head>
<body>
${DEVICE_GATE_BODY}

<div class="md-top">
  <a class="md-back" id="mdBack" role="button" href="足球推荐.html" onclick="if(history.length>1){history.back();return false}">← 返回</a>
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
     正常情况一律用原始字符串（odds.asian.*.line），它本身就带「让/受」前缀；
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
    var lineDiff = has(openLine) && has(liveLine) && String(openLine) !== String(liveLine);
    if (a === null || b === null) {
      /* 没有盘口值可比较时，靠盘口文字判断；两个文字一样就【如实说不变】，
         不能把「受一球」这种盘口文字当成变化说明重复显示一遍。 */
      if (lineDiff) return '<span class="up">变盘</span>';
      return '<span class="dim">不变</span>';
    }
    if (b > a) return '<span class="up">升盘</span>';
    if (b < a) return '<span class="down">降盘</span>';
    if (lineDiff) return '<span class="up">变盘</span>';
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

  /* grp = 这一档归哪一档标签：'report' = 数据检测报告 · 'sports' = 体育抓取 ·
     'report sports' = 两档都显示（亚盘那两档只有一份数据，两档里都该看得到）。
     点标签时按 data-grp 显示/隐藏，「全部」＝都显示。
     cls = 卡片自己的额外类名（爆冷预警的 md-cold-on/off、差异分析的 md-diff 用它上色）。
     ⚠️ 只能【追加】类名，'md-card' 必须一直在 —— applySrc() 用 '#mdBody .md-card' 选卡片。 */
  function card(title, badgeHtml, bodyHtml, emptyText, grp, cls) {
    return '<section class="md-card' + (cls ? ' ' + cls : '') + '" data-grp="' + esc(grp || 'report') + '">'
      + '<div class="md-chead"><span class="md-ctitle">' + esc(title) + '</span>'
      + (badgeHtml || '') + '</div>'
      + (bodyHtml || ('<div class="md-empty">' + esc(emptyText) + '</div>'))
      + '</section>';
  }

  /* ---- ④-7 欧赔对比（主流 12 家：初盘 / 即时 / 返还率 / 凯利） ----
     ⚠️ 页面上【不写】这些数字是从哪儿来的（硬性规则，见文件头）。
        这一档只说「主流 12 家」「这一场共 N 家」—— 不透露来源。
     ⚠️ 该场没有明细 → 如实显示「暂无」，绝不拿别处的均值或别场的数字顶。
     ⚠️ 「初盘 → 即时 的变化」用【颜色】表达：即时那三格比初盘高＝绿、低＝红。 */
  function euNums(o) {
    var h = '';
    for (var i = 0; i < 3; i++) {
      var v = num(o && o[i]);
      h += '<i>' + (v === null ? '—' : v.toFixed(2)) + '</i>';
    }
    return h;
  }
  function euLiveNums(o, l) {
    var h = '';
    for (var i = 0; i < 3; i++) {
      var a = num(o && o[i]), b = num(l && l[i]);
      var cls = (a === null || b === null || b === a) ? '' : (b > a ? 'up' : 'down');
      h += '<i class="' + cls + '">' + (b === null ? '—' : b.toFixed(2)) + '</i>';
    }
    return h;
  }
  function euRow(name, d) {
    var o = (d && d.o) || [], l = (d && d.l) || [], r = (d && d.r) || [], k = (d && d.k) || [];
    var live = num(r[1]), open = num(r[0]);
    return '<tr><td class="co">' + esc0(name) + '</td>'
      + '<td class="nums">' + euNums(o) + '</td>'
      + '<td class="nums">' + euLiveNums(o, l) + '</td>'
      + '<td class="rate">' + (live === null ? '—' : live.toFixed(1) + '%')
      + (open === null ? '' : '<span>初 ' + open.toFixed(1) + '</span>') + '</td>'
      + '<td class="nums small">' + euNums(k) + '</td></tr>';
  }
  function renderTitanEuro(g) {
    var mg = (D.multi && D.multi.games) ? D.multi.games[String(g.code || '')] : null;
    var na = function (why) {
      return card('欧赔对比', '<span class="md-badge">多公司欧赔</span>',
        '<div class="md-na">暂无多家公司的赔率对比数据。<br><em>' + esc0(why)
        + '这一档就不显示数值 —— 不用别处的数字顶。</em></div>', null, 'sports');
    };
    if (!D.multi) return na('本次构建没有拿到这一档的数据。');
    if (!mg || !mg.eu) return na('这一场没有对上号（或这一场没有可列的公司）。');
    var main = D.multi.main || [];
    var t = '<table class="md-tbl md-eu"><thead><tr>'
      + '<th style="width:20%">公司</th>'
      + '<th style="width:22%">初盘<br><em>主/平/客</em></th>'
      + '<th style="width:24%">即时<br><em>主/平/客</em></th>'
      + '<th style="width:17%">返还率</th>'
      + '<th style="width:17%">凯利<br><em>主/平/客</em></th>'
      + '</tr></thead><tbody>';
    var n = 0;
    for (var i = 0; i < main.length; i++) {
      var d = mg.eu[main[i][1]];
      if (!d) continue;              /* 这一场这家没有三项齐全的即时赔率 → 整行不显示，不补 */
      t += euRow(main[i][2] || main[i][1], d);
      n++;
    }
    t += '</tbody></table>';
    if (!n) return na('这一场没有可列的公司。');
    t += '<div class="md-one">每格按 <b>主 / 平 / 客</b> 三个方向排列；'
      + '即时那三格的颜色＝与初盘相比：<b class="up">绿</b> 是赔率升高、<b class="down">红</b> 是赔率降低'
      + '（只标变化，不代表任何结论）。返还率那一格＝即时，小字是初盘；凯利＝即时凯利指数。'
      + '<br>本表固定列主流 <b>' + n + '</b> 家 —— 这一场共 <b>' + esc0(mg.companies) + '</b> 家公司有即时欧赔，'
      + '其余不逐个列出（320px 一屏塞不下，也为了这一页别做成几十兆）。'
      + (has(mg.league) ? ' · ' + esc0(mg.league) : '')
      + ' · 更新时间 ' + esc0(D.multi.updated || '—') + '。</div>';
    return card('欧赔对比', '<span class="md-badge live">主流 ' + n + ' 家</span>', t, null, 'sports');
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

  /* ---- ④-2 大小：一行 —— 这一档只有一个口径（没有第二家的数据，不硬凑行） ---- */
  function renderOU(g) {
    var ou = g.odds && g.odds.overunder;
    if (!ou) return card('大小', '', null, g.src === 'hist'
      ? '归档场次没有存大小球数据（归档只留了欧赔即时 + 亚指即时两档）' : '这一场没有大小球数据');
    var live = ou.live || ou.open, open = ou.open;
    if (!live) return card('大小', '', null, '这一场没有大小球数据');
    var over = num(live.over), line = num(live.line), under = num(live.under);
    if (over === null && line === null && under === null) return card('大小', '', null, '这一场没有大小球数据');
    var isLive = !!ou.live;
    var t = '<table class="md-tbl"><thead><tr><th style="width:28%">公司</th>'
      + '<th style="width:24%">大</th><th style="width:24%">盘口</th><th style="width:24%">小</th></tr></thead><tbody>'
      + '<tr><td class="s">综合</td>'
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
    return card('大小', badge(isLive, '初盘', g), t, null, 'report');
  }

  /* ---- ④-3 让球：公司 / 盘口 / 主水 / 客水 ----
     用户规格里写的是「主让 / 盘口 / 客让」，但这一档的数据里实际只给三个值：
     odds.asian.*.line（盘口字符串）+ home / away（两边的【水位】）。
     没有「主让 0.85」这种独立字段 —— 所以表头如实写 盘口/主水/客水，不硬套规格名字。
     ⚠️ 「公司」列里那一行叫「综合」而不是某个站名（页面上不许留来源痕迹）。 */
  function renderRQ(g) {
    var as = g.odds && g.odds.asian;
    if (!as) return card('让球', '', null, g.src === 'hist'
      ? '归档只存了亚指一档（在下面那张「亚指」卡里），没有单独的让球水位'
      : '这一场没有让球数据');
    var live = as.live || as.open;
    if (!live) return card('让球', '', null, g.src === 'hist'
      ? '归档只存了亚指一档（在下面那张「亚指」卡里）'
      : '这一场没有让球数据');
    var home = num(live.home), away = num(live.away);
    /* 盘口只写原样字符串；没有字符串时才退回数值换算 */
    var zhLine = has(live.line) ? String(live.line) : hcFallback(g.asianIndex ? g.asianIndex.handicap : null);
    if (home === null && away === null && !has(zhLine)) return card('让球', '', null, '这一场没有让球数据');
    var isLive = !!as.live;
    var t = '<table class="md-tbl"><thead><tr><th style="width:28%">公司</th>'
      + '<th style="width:24%">盘口</th><th style="width:24%">主水</th><th style="width:24%">客水</th></tr></thead><tbody>'
      + '<tr><td class="s">综合</td>'
      + '<td class="s">' + (has(zhLine) ? esc(zhLine) : '—') + '</td>'
      + '<td class="n">' + (home === null ? '—' : home.toFixed(2)) + '</td>'
      + '<td class="n">' + (away === null ? '—' : away.toFixed(2)) + '</td></tr>'
      + '</tbody></table>'
      + '<div class="md-one">主水/客水＝两侧水位（越低越贵）；盘口带「受」＝主队受让（客队让球）'
      + (as.open && has(as.open.line) && String(as.open.line) !== String(live.line)
        ? ' · 初盘 ' + esc(as.open.line) : '')
      + '</div>';
    /* 亚盘只有这一份数据 → 「数据检测报告」和「体育抓取」两档里都显示 */
    return card('让球', badge(isLive, '初盘', g), t, null, 'report sports');
  }

  /* ---- ④-4 亚指：这一档只有 1 个口径（没有第二家的数据）→ 有几家显示几家 ---- */
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
    t += '<tr><td class="s">综合</td>'
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
    /* 亚盘只有这一份数据 → 两档标签里都显示 */
    return card('亚指', badge(!!l, '初盘', g), t, null, 'report sports');
  }

  /* ---- ④-5 泊松指数 ----
     ⚠️【名字叫「泊松指数」，但它不是泊松分布模型】—— 这一点必须对用户如实写清楚。
     本模块的算法只有两步，全部用这一页【已经有的】欧赔，不新取任何数据：
       ① 反推原始概率：p主 = 1/主赔, p平 = 1/平赔, p客 = 1/客赔（庄家赔率的倒数）
       ② 归一化（让三项加起来正好 100%）：P主 = p主 / (p主+p平+p客)
     返还率列【不是编的】：用【页面上显示的那三个赔率】按 100% / (1/主+1/平+1/客) 现算，
     这就是这套赔率本身隐含的返还率（口径与庄家一致，≈89%~95% 属正常区间）；
     三项赔率有任何一个缺失，这一列就写「—」，绝不拿别的数硬凑。
     所以：这个指数【等于】把庄家赔率换算成百分比，不是用进球数做的独立预测。 */
  function poissonModel(o) {
    if (!o) return null;
    var h = num(o.home), d = num(o.draw), a = num(o.away);
    var ps = [h, d, a].map(function (v) { return (v === null || v <= 1) ? null : 1 / v; });
    if (ps[0] === null || ps[1] === null || ps[2] === null) return null;
    var s = ps[0] + ps[1] + ps[2];
    if (!isFinite(s) || s <= 0) return null;
    var pay = 100 / s;
    /* 防守：赔率被写坏时（比如三项都是 1.01）返还率会离谱 → 这一列宁可写「—」 */
    var payOk = isFinite(pay) && pay >= 60 && pay <= 120;
    return {
      p: [ps[0] / s * 100, ps[1] / s * 100, ps[2] / s * 100],
      pay: payOk ? pay : null
    };
  }

  function renderPoisson(g) {
    var eu = g.odds && g.odds.europe;
    var pick = eu ? (eu.live || eu.open) : null;
    if (!pick) return card('泊松指数', badge(false, '模型', g), null, '这一场没有欧赔数据，无法反推概率');
    var m = poissonModel(pick);
    if (!m) return card('泊松指数', badge(false, '模型', g), null, '这一场欧赔不完整（三项赔率有缺），无法反推概率');
    var mx = Math.max(m.p[0], m.p[1], m.p[2]);
    var rows = [['主胜', m.p[0]], ['平', m.p[1]], ['客胜', m.p[2]]];
    var t = '<table class="md-tbl"><thead><tr><th style="width:34%">选项</th>'
      + '<th style="width:33%">理论概率</th><th style="width:33%">返还率</th></tr></thead><tbody>';
    for (var i = 0; i < rows.length; i++) {
      var top = (rows[i][1] === mx);
      t += '<tr><td class="' + (top ? 'up' : 's') + '">' + rows[i][0] + '</td>'
        + '<td class="' + (top ? 'up' : 'n') + '">' + pct(rows[i][1]) + '</td>'
        + '<td class="' + (i === 0 && m.pay !== null ? 'n' : 'dim') + '">'
        + (i === 0 && m.pay !== null ? m.pay.toFixed(1) + '%' : '—') + '</td></tr>';
    }
    t += '</tbody></table>';
    /* 算法如实写在模块里 —— 不让用户以为这是真的泊松模型。
       ⚠️ 这里【不写】这些赔率是从哪儿来的（硬性规则），只写用哪一档（初盘/即时）。 */
    t += '<div class="md-one">算法：<b>欧赔反推</b>，不是泊松分布模型 —— '
      + '理论概率 = (1/赔率) 归一化到三项合计 100%；返还率 = 100% ÷（1/主+1/平+1/客），'
      + '用本档赔率现算，三项有缺就写「—」。本档用的是'
      + (eu.live ? '【即时】赔率' : '【初盘】赔率') + '；概率最高的一项用主色。</div>';
    /* 站内自己的推荐概率在同一份数据里 —— 并排放一次，方便对照，不另算 */
    var rp = g.reco && g.reco.prob;
    if (rp && num(rp.home) !== null && num(rp.draw) !== null && num(rp.away) !== null) {
      t += '<div class="md-ourow"><span>站内推荐概率 ' + pct(rp.home) + ' / ' + pct(rp.draw)
        + ' / ' + pct(rp.away) + '</span><span>口径：推荐模型</span></div>';
    }
    return card('泊松指数', badge(false, '模型', g), t, null, 'report');
  }

  /* ---- ④-6 分歧指（多公司欧赔的离散程度） ----
     2026-10-17 第 2 步：以前这里永远是「暂无多家赔率数据」——
     因为一份数据里一场只有一份欧赔，自己跟自己的离散度恒等于 0，算不出分歧。
     现在这一档用的是【多公司】欧赔（每场 320~370 家即时欧赔），
     由 build-odds-divergence.mjs 抓好、算好写进文件，构建时【内嵌】进这一页
     （和 games 一样自包含，线上站点目录里没有那个文件也不会 404）。

     算法（模块里如实写出来，不让用户瞎猜）：
       每个方向取各家公司的【即时】欧赔 x₁…xₙ
       均值 m = Σxᵢ/n ，标准差 s = √(Σ(xᵢ-m)²/n) ，变异系数 cv = s/m
       档位：cv < 3.0% 低 · 3.0%~5.5% 中 · ≥5.5% 高（阈值按实测 192 个样本定）
     ⚠️ 这一场没对上号 / 只有 1 家 → 仍然如实显示「暂无」，
        绝不用"初盘 vs 即时"或单源硬造一个低/中/高。 */
  function lvChip(level) {
    var cls = level === '低' ? 'low' : (level === '中' ? 'mid' : (level === '高' ? 'high' : ''));
    return '<span class="md-lv ' + cls + '">' + esc0(level) + '</span>';
  }
  function renderDivergence(g) {
    var need = '<b>主胜分歧</b> / <b>平局分歧</b> / <b>客胜分歧</b>';
    var dd = (D.div && D.div.games) ? D.div.games[String(g.code || '')] : null;
    if (!dd || !dd.live) {
      /* ⚠️ 这段文案里【不写】来源与文件名（硬性规则）：
         原来写的是"没能在 xxx 的赛程里对上号""xxx 缺失"，现在只说"没对上号 / 这一档没有数据"。 */
      var why = D.div
        ? '这一场没有对上号，或者这一场只有 1 家公司的欧赔（1 家算不出分歧）。'
        : '本次构建没有拿到这一档的数据。';
      var body = '<div class="md-na">'
        + '暂无多家赔率数据，无法计算分歧。<br>'
        + '<em>分歧指＝多家公司欧赔的离散程度，至少要 2 家才成立。'
        + why + '所以 ' + need + ' 这三档不显示数值 —— 不用单源硬造。</em>'
        + '</div>';
      return card('分歧指', '<span class="md-badge">欧赔分歧</span>', body, null, 'sports');
    }
    var dirs = [['主胜分歧', 'home'], ['平局分歧', 'draw'], ['客胜分歧', 'away']];
    var sum = '<div class="md-divsum">';
    var t = '<table class="md-tbl"><thead><tr><th style="width:34%">方向</th>'
      + '<th style="width:22%">分歧</th><th style="width:22%">变异系数</th><th style="width:22%">均值</th></tr></thead><tbody>';
    for (var i = 0; i < dirs.length; i++) {
      var d = dd.live[dirs[i][1]];
      if (!d) continue;
      sum += '<span>' + esc0(dirs[i][0]) + '<b>' + lvChip(d.level) + '</b></span>';
      t += '<tr><td class="s">' + esc0(dirs[i][0]) + '</td>'
        + '<td class="lv">' + lvChip(d.level) + '</td>'
        + '<td class="n">' + (num(d.cv) === null ? '—' : (Math.round(num(d.cv) * 10000) / 100) + '%') + '</td>'
        + '<td class="dim">' + (num(d.mean) === null ? '—' : num(d.mean).toFixed(2)) + '</td></tr>';
    }
    t += '</tbody></table>';
    sum += '</div>';
    /* 算法如实写在这一档里（和泊松指数同一套写法）；
       ⚠️ 原来这里还有一段「数据源：xxx · N 家公司」，按硬性规则【删掉了】——
          算法、家数、场次、时间都留着，只是不再说这些数字是哪来的。 */
    var note = '<div class="md-one" style="margin-top:9px">算法：<b>欧赔离散度</b> —— '
      + '各家公司的【即时】欧赔，逐方向算 变异系数 cv = 标准差 ÷ 均值'
      + '（用 cv 不用标准差：主胜 1.5 与客胜 8.0 的标准差天然差几倍）。'
      + '档位：cv &lt; ' + ((D.div.levels && D.div.levels['低']) ? esc0(String(D.div.levels['低']).replace(/[<>]/g, '')) : '3.0%').trim()
      + ' 低 · 3.0%~5.5% 中 · ≥5.5% 高。'
      + 'cv 越小＝各家越一致（分歧低）。<br>'
      + '共 <b>' + esc0(dd.companies) + '</b> 家公司'
      + (dd.match ? ' · ' + esc0(dd.match) : '')
      + ' · 更新时间 ' + esc0(D.div.updated || '—') + '。'
      + '这一档只描述"各家赔率有多不一致"，不是预测、不是推荐。</div>';
    return card('分歧指', '<span class="md-badge live">' + esc0(dd.companies) + ' 家</span>', sum + t + note, null, 'sports');
  }

  /* ---- ④-8 雷达寻胆（四个维度的共识） ----
     用户要求：「自己算一个胆出来，而且要能解释清楚道理，别瞎加权」。

     思路：胆 = 四个【互相独立】的市场维度里，指向最一致的那一项。
     每个维度先各自换算成「主/平/客」三项的分布，再用【加权几何平均】合并
     （对数池：这是合并多个独立概率估计的标准做法 ——
      任一个维度强烈反对，乘积就把这一项拉下来，这正是"共识"该有的样子；
      用加权平均（算术）的话，一个维度喊 90%、另一个喊 5%，平均出来还是很高，
      那种"平均"会把分歧藏起来，所以不用它）。

     四个维度与权重 —— 权重只由【独立性】和【是不是真钱】决定，不是拍脑袋调的：
       ① 欧赔反推  1.0  各家公司报价去水后的共识概率（基础口径）
       ② 盘口水位  1.0  独立的让球市场；⚠️ 亚盘只有上下盘、没有平局这一项，
                          所以它【只在主/客两项上投票】，平局那一项它弃权
                          （不硬凑一张票，也不把它的一票折算成两项）
       ③ 凯利修正  0.5  它是对①的二阶修正、和①【同源】，给满票等于同一件事投两次，
                          所以只算半票；原始离散只有 ±3%，放大到能说话的尺度
       ④ 成交资金  2.0  真金白银、和所有报价都独立，所以信它最多

     ⚠️ 权重只在「对这一项投过票的维度」之间归一 ——
        一个不投平局的维度，不能因为弃权就把平局的分数压低。
     ⚠️ 拿不到成交资金（距开赛还远、或已经打完很久）→ 它就不投票，
        其余三个维度权重重归一，整块照常算得出胆。
     ⚠️ 这一档是【统计归纳】，不是预测，也不是推荐（页面上明写）。 */
  var RADAR_KEYS = [['home', '主胜'], ['draw', '平'], ['away', '客胜']];

  /* 夹值：防止某一项把总分带跑偏（成交价隐含概率的尾部会极端，比如 21.00） */
  function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* 维度①：欧赔反推概率（现成的 reco.prob 就是"三项去水后归一"） */
  function dimEuro(g) {
    var p = g.reco && g.reco.prob;
    if (!p) return null;
    var v = [num(p.home), num(p.draw), num(p.away)];
    if (v[0] === null || v[1] === null || v[2] === null) return null;
    if (!(v[0] + v[1] + v[2] > 0)) return null;
    return { name: '欧赔反推', w: 1, p: v, vote: ['home', 'draw', 'away'],
      why: '各家公司报价去水后的共识概率' };
  }

  /* 维度②：盘口水位 —— 上下盘两边水位各自取倒数后去水归一 = "上盘赢盘"的概率 */
  function dimAsian(g) {
    var a = g.asianIndex;
    if (!a) return null;
    var uw = num(a.upWater), dw = num(a.downWater);
    if (uw === null || dw === null || !(uw > 0) || !(dw > 0)) return null;
    if (a.upSide !== 'home' && a.upSide !== 'away') return null;
    var iu = 1 / uw, id = 1 / dw;
    var qUp = iu / (iu + id);
    var p = a.upSide === 'home'
      ? [qUp * 100, 0, (1 - qUp) * 100]
      : [(1 - qUp) * 100, 0, qUp * 100];
    return { name: '盘口水位', w: 1, p: p, vote: ['home', 'away'],
      why: '让球盘两边水位去水后的上下盘概率（亚盘没有"平局"这一项，所以它弃权）' };
  }

  /* 维度③：凯利修正
     凯利值 = 某家赔率 × 市场平均概率。一家公司把某一项的凯利压得比别家低，
     说明它在这一项上收赔率、防着这一项 → 压得越狠＝越防。
     12 家取均值 → 取倒数 → 三次方放大（原始离散只有 ±3%，不放大等于没投票）。 */
  function dimKelly(g) {
    var tg = (D.multi && D.multi.games) ? D.multi.games[String(g.code || '')] : null;
    if (!tg || !tg.eu) return null;
    var rows = [], k;
    for (k in tg.eu) {
      if (!Object.prototype.hasOwnProperty.call(tg.eu, k)) continue;
      var kk = tg.eu[k] && tg.eu[k].k;
      if (!kk || kk.length !== 3) continue;
      var v = [num(kk[0]), num(kk[1]), num(kk[2])];
      if (v[0] === null || v[1] === null || v[2] === null) continue;
      if (!(v[0] > 0 && v[1] > 0 && v[2] > 0)) continue;
      rows.push(v);
    }
    if (rows.length < 3) return null;   /* 少于 3 家就不算——均值没有代表性 */
    var avg = [0, 0, 0], i, j;
    for (i = 0; i < rows.length; i++) {
      for (j = 0; j < 3; j++) avg[j] += rows[i][j];
    }
    for (j = 0; j < 3; j++) avg[j] = avg[j] / rows.length;
    var inv = [1 / avg[0], 1 / avg[1], 1 / avg[2]];
    var mean = (inv[0] + inv[1] + inv[2]) / 3;
    var cube = [Math.pow(inv[0] / mean, 3), Math.pow(inv[1] / mean, 3), Math.pow(inv[2] / mean, 3)];
    var s = cube[0] + cube[1] + cube[2];
    if (!(s > 0)) return null;
    return { name: '凯利修正', w: 0.5,
      p: [cube[0] / s * 100, cube[1] / s * 100, cube[2] / s * 100],
      vote: ['home', 'draw', 'away'],
      why: rows.length + ' 家即时凯利的均值取倒数再放大（公司越压某一项的赔率＝越防着它）' };
  }

  /* 维度④：成交资金（用户建议的那条式子）
       资金分 = 成交量占比 × 挂牌量比 × 凯利修正
     挂牌量比 = 买入挂单 ÷ 该项挂单总量；0.5 = 买卖均衡 → 归一成 1.0 倍的系数
     凯利修正 = 成交量占比 ÷ 成交价的隐含概率；>1 = 钱比价更看好这一项 */
  function dimMoney(g) {
    var m = (D.money && D.money.games) ? D.money.games[String(g.code || '')] : null;
    if (!m || !m.ratio || !m.price) return null;
    var K = ['home', 'draw', 'away'], share = [], price = [], i;
    for (i = 0; i < 3; i++) {
      share.push(num(m.ratio[K[i]]));
      price.push(num(m.price[K[i]]));
    }
    for (i = 0; i < 3; i++) {
      if (share[i] === null || price[i] === null || !(price[i] > 0)) return null;
    }
    var imp = [1 / price[0], 1 / price[1], 1 / price[2]];
    var si = imp[0] + imp[1] + imp[2];
    imp = [imp[0] / si, imp[1] / si, imp[2] / si];
    var f = [], part = [];
    for (i = 0; i < 3; i++) {
      var rs = share[i] / 100;
      var book = 1;
      if (m.back && m.lay) {
        var bk = num(m.back[K[i]]), ly = num(m.lay[K[i]]);
        if (bk !== null && ly !== null && (bk + ly) > 0) book = clampNum((bk / (bk + ly)) / 0.5, 0.5, 2);
      }
      var kf = clampNum(rs / imp[i], 0.5, 2);
      f.push(rs * book * kf);
      part.push([Math.round(rs * 1000) / 10, Math.round(book * 100) / 100, Math.round(kf * 100) / 100]);
    }
    var sf = f[0] + f[1] + f[2];
    if (!(sf > 0)) return null;
    return { name: '成交资金', w: 2,
      p: [f[0] / sf * 100, f[1] / sf * 100, f[2] / sf * 100],
      vote: ['home', 'draw', 'away'], part: part,
      why: '成交量占比 × 挂牌量比 × 凯利修正（真金白银，和报价互相独立，所以权重最高）' };
  }

  function radarCalc(g) {
    var dims = [], d;
    d = dimEuro(g); if (d) dims.push(d);
    d = dimAsian(g); if (d) dims.push(d);
    d = dimKelly(g); if (d) dims.push(d);
    d = dimMoney(g); if (d) dims.push(d);
    if (!dims.length) return null;
    var S = [0, 0, 0], i, j;
    for (i = 0; i < 3; i++) {
      var key = RADAR_KEYS[i][0], logSum = 0, wSum = 0;
      for (j = 0; j < dims.length; j++) {
        if (dims[j].vote.indexOf(key) < 0) continue;       /* 它在这一项上弃权 */
        var p = dims[j].p[i];
        if (!(p > 0)) continue;
        logSum += dims[j].w * Math.log(p);
        wSum += dims[j].w;
      }
      S[i] = wSum > 0 ? Math.exp(logSum / wSum) : 0;
    }
    var tot = S[0] + S[1] + S[2];
    if (!(tot > 0)) return null;
    var score = [S[0] / tot * 100, S[1] / tot * 100, S[2] / tot * 100];
    var best = 0;
    if (score[1] > score[best]) best = 1;
    if (score[2] > score[best]) best = 2;
    var votes = [], wTotal = 0, wAgree = 0;
    for (j = 0; j < dims.length; j++) {
      var bi = -1;
      for (i = 0; i < 3; i++) {
        if (dims[j].vote.indexOf(RADAR_KEYS[i][0]) < 0) continue;
        if (bi < 0 || dims[j].p[i] > dims[j].p[bi]) bi = i;
      }
      if (bi < 0) continue;
      wTotal += dims[j].w;
      if (bi === best) wAgree += dims[j].w;
      votes.push({ name: dims[j].name, pick: RADAR_KEYS[bi][1], w: dims[j].w, hit: bi === best });
    }
    var agree = 0;
    for (j = 0; j < votes.length; j++) if (votes[j].hit) agree++;
    var agreePct = wTotal > 0 ? (wAgree / wTotal * 100) : 0;
    /* 【什么时候才配叫"胆"】
       两项同时满足才算，否则这一场显示「本期无胆」——
       · 最高分 ≥ 40%：三项均分是 33.3%，不到 40% 说明根本没拉开差距；
       · 加权同意度 ≥ 60%：按【权重】算多大比例的维度站在它这边
         （不是数人头：成交资金一票顶欧赔两票，所以它反对也得算进去）。
       ⚠️ 这一步是【防自欺】：算出来最高分那一项如果只有 1 个维度支持，
          标题还写「本期胆」就是在骗人 —— 宁可写「本场无胆」。 */
    var qualified = score[best] >= 40 && agreePct >= 60;
    return {
      score: score, best: best, dims: dims, votes: votes,
      agree: agree, agreePct: agreePct, qualified: qualified
    };
  }

  function renderRadar(g) {
    var r = radarCalc(g);
    if (!r) {
      return card('雷达寻胆', '<span class="md-badge">共识</span>',
        '<div class="md-na">这一场连「欧赔反推概率」都没有，算不出胆。<br>'
        + '<em>寻胆至少要有一档报价数据；没有就如实空着，不猜一个出来。</em></div>', null, 'report');
    }
    var bars = '', i;
    for (i = 0; i < 3; i++) {
      var w = clampNum(r.score[i], 0, 100);
      w = Math.round(w * 10) / 10;
      bars += '<div class="md-radar-row' + (i === r.best ? ' on' : '') + '">'
        + '<span class="k">' + RADAR_KEYS[i][1] + '</span>'
        + '<span class="bar"><i style="width:' + w + '%"></i></span>'
        + '<span class="v">' + w + '%</span></div>';
    }
    var head = r.qualified
      ? '<div class="md-radar-pick"><span class="lb">本期胆</span>'
        + '<b>' + RADAR_KEYS[r.best][1] + '</b>'
        + '<span class="cf">信心 ' + (Math.round(r.score[r.best] * 10) / 10) + '%</span></div>'
      : '<div class="md-radar-pick none"><span class="lb">本期</span>'
        + '<b>无胆</b>'
        + '<span class="cf">各维度分歧过大 —— 最高一项「' + RADAR_KEYS[r.best][1] + '」只有 '
        + (Math.round(r.score[r.best] * 10) / 10) + '% 分、'
        + (Math.round(r.agreePct)) + '% 的维度权重支持它，不配当胆</span></div>';

    var voteTxt = [];
    for (i = 0; i < r.votes.length; i++) {
      voteTxt.push('<span class="' + (r.votes[i].hit ? 'on' : '') + '">'
        + esc0(r.votes[i].name) + '→<b>' + esc0(r.votes[i].pick) + '</b></span>');
    }
    var voteLine = '<div class="md-radar-votes">' + r.votes.length + ' 个维度投票：' + voteTxt.join(' · ') + '</div>';

    /* 资金面明细：有才显示，没有整行不出现（不写"暂无"占位，免得像漏了数据） */
    var m = (D.money && D.money.games) ? D.money.games[String(g.code || '')] : null;
    var moneyLine = '';
    if (m && m.total) {
      var wan = function (x) { var v = num(x); return v === null ? '—' : (Math.round(v / 1000) / 10) + ' 万'; };
      var rr = m.ratio || {};
      moneyLine = '<div class="md-radar-money">资金面：成交 <b>' + wan(m.total) + '</b>'
        + ' · 占比 主 ' + (num(rr.home) === null ? '—' : num(rr.home) + '%')
        + ' / 平 ' + (num(rr.draw) === null ? '—' : num(rr.draw) + '%')
        + ' / 客 ' + (num(rr.away) === null ? '—' : num(rr.away) + '%')
        + ((m.over != null || m.under != null)
          ? ' · 大小球 ' + wan(m.over) + ' / ' + wan(m.under) : '')
        + '</div>';
    }

    /* 一句话结论：几个维度同意 + 资金面是否与胆同向 */
    var same = null;
    for (i = 0; i < r.votes.length; i++) if (r.votes[i].name === '成交资金') same = r.votes[i].hit;
    var verdict;
    if (r.qualified && r.agree === r.votes.length) {
      verdict = '所有维度都指向<b>' + RADAR_KEYS[r.best][1] + '</b>，共识最干净。';
    } else if (r.qualified) {
      verdict = r.votes.length + ' 个维度里 <b>' + r.agree + '</b> 个指向<b>' + RADAR_KEYS[r.best][1] + '</b>'
        + '（按权重算 <b>' + Math.round(r.agreePct) + '%</b> 支持），其余不同意 —— 属于有分歧，信心要打折。';
    } else {
      verdict = '各维度分歧太大（最高一项「' + RADAR_KEYS[r.best][1] + '」只有 '
        + Math.round(r.agreePct) + '% 的维度权重支持）→ <b>这一场不设胆</b>。'
        + '下面三行只是把各维度合成后的排序摆出来，不是说' + RADAR_KEYS[r.best][1] + '值得买。';
    }
    if (same === true) verdict += ' 资金面与它同向。';
    else if (same === false) verdict += ' ⚠️ 而且资金面投给了别的一项。';

    var note = '<div class="md-one" style="margin-top:9px">算法：<b>四维共识</b> —— '
      + '每个维度先各自换算成「主/平/客」的分布，再按权重做<b>加权几何平均</b>'
      + '（用几何平均不用算术平均：算术平均会把分歧藏起来 —— '
      + '一个维度喊 90%、另一个喊 5%，平均出来还是很高；几何平均会被那个 5% 直接压下去）。<br>'
      + '权重：成交资金 2 · 欧赔反推 1 · 盘口水位 1 · 凯利修正 0.5。'
      + '权重只看<b>独立性</b>和<b>是不是真钱</b>：资金是真金白银、和报价独立，所以权重最高；'
      + '凯利是对欧赔的二阶修正、两者同源，给满票等于同一件事投两次，所以只算半票。'
      + '某一项上弃权的维度不参与那一项的归一（比如亚盘不投平局，平局不会因此被压低）。<br>'
      + '各维度口径：'
      + '<b>欧赔反推</b>＝' + esc0(dimWhy(r, '欧赔反推')) + '；'
      + '<b>盘口水位</b>＝' + esc0(dimWhy(r, '盘口水位')) + '；'
      + '<b>凯利修正</b>＝' + esc0(dimWhy(r, '凯利修正')) + '；'
      + '<b>成交资金</b>＝' + esc0(dimWhy(r, '成交资金')) + '。'
      + (m ? '（这一场有成交资金数据，所以四个维度都投了票。）' : '（这一场没有成交资金数据 —— 它没投票，其余三个维度权重重归一。）')
      + '<br>什么时候才写「本期胆」：最高分 <b>≥ 40%</b>（三项均分是 33.3%，不到 40% 就是没拉开）'
      + '且 <b>≥ 60% 的维度权重</b>支持它；两条缺一条就写「本场无胆」—— 算得出来不等于配叫胆。'
      + '<br>这一档是<b>统计归纳</b>，不是预测、也不是推荐。</div>';

    return card('雷达寻胆', '<span class="md-badge live">' + r.votes.length + ' 维共识</span>',
      head + bars + voteLine + moneyLine + '<div class="md-one">结论：' + verdict + '</div>' + note, null, 'report');
  }

  function dimWhy(r, name) {
    for (var i = 0; i < r.dims.length; i++) if (r.dims[i].name === name) return r.dims[i].why;
    return '这一场没有这一档数据';
  }

  /* ---- ④-8 资金分布（三个方向的成交额 + 占比横条） ----
     ⚠️ 这一档只说「成交额 / 占比 / 金额」，【不写】这些数字是从哪儿来的（硬性规则，见文件头）。
        所以模块名用中性的「资金分布」，正文里也不出现任何站名 / 产品名 / 文件名。
     ⚠️ 成交额只在【临场窗口】里累积：
        · 距开赛还早 → 没有；比赛打完一阵子 → 会清空。两种情况都是【正常】的，不是 bug。
        · 没有时显示「本场暂无成交量数据」，【绝不显示 0】—— 0 和"没数据"不是一回事。
     ⚠️ 占比直接取数据里的整数百分比，不自己重新归一（改口径就等于改数据）；
        三项里有任何一项缺失 → 整档按"没数据"处理，不拿 0 顶。 */
  var MONEY_KEYS = [['home', '主'], ['draw', '平'], ['away', '客']];

  /* 千分位：3879905 这种位数，不点开就看不清是多少 */
  function fmInt(v) {
    var n = num(v);
    if (n === null) return null;
    return String(Math.round(n)).replace(/[0-9](?=(?:[0-9]{3})+$)/g, '$&,');
  }
  /* 大额转「万」留 1 位小数；不到 1 万就原样按千分位写 */
  function fmWan(v) {
    var n = num(v);
    if (n === null || !(n > 0)) return null;
    if (n >= 10000) return (Math.round(n / 1000) / 10).toFixed(1) + ' 万';
    return fmInt(n);
  }
  function moneyView(g) {
    var m = (D.money && D.money.games) ? D.money.games[String(g.code || '')] : null;
    if (!m) return null;
    var total = num(m.total);
    if (total === null || !(total > 0)) return null;      /* 0 / 空 → 当"没数据" */
    var rows = [], i, sum = 0;
    for (i = 0; i < 3; i++) {
      var p = num(m.ratio && m.ratio[MONEY_KEYS[i][0]]);
      if (p === null || !(p >= 0)) return null;           /* 缺一项就整档不画，不拿 0 顶 */
      rows.push({ p: p, a: num(m.amount && m.amount[MONEY_KEYS[i][0]]) });
      sum += p;
    }
    if (!(sum > 0)) return null;                          /* 三项全 0 ＝ 还没累积，按"没数据" */
    return { total: total, rows: rows };
  }
  function renderMoney(g) {
    var mv = moneyView(g);
    if (!mv) {
      return card('资金分布', '<span class="md-badge">临场累计</span>',
        '<div class="md-na">本场暂无成交量数据。<br>'
        + '<em>成交额只在【临场窗口】里累积 —— 距开赛还早、或者已经打完一阵子，这一档都会空着。'
        + '比赛临近时才统计，到时再回来看。这里不写 0：0 和「没数据」不是一回事。</em></div>', null, 'report');
    }
    var i, w, body = '<div class="md-money-top"><span class="k">总成交</span>'
      + '<b>' + fmWan(mv.total) + '</b>'
      + '<span class="ex">' + fmInt(mv.total) + '</span></div>';
    var amt = [];
    for (i = 0; i < 3; i++) {
      w = Math.round(mv.rows[i].p * 10) / 10;
      body += '<div class="md-money-row">'
        + '<span class="k">' + MONEY_KEYS[i][1] + '</span>'
        + '<span class="bar"><i class="' + MONEY_KEYS[i][0] + '" style="width:' + w + '%"></i></span>'
        + '<span class="v">' + w + '%</span></div>';
      var at = fmWan(mv.rows[i].a);
      /* 每一项包一层 nowrap：320px 下换行只发生在「项与项之间」，不会把「41.1 万」拆开 */
      if (at) amt.push('<span>' + MONEY_KEYS[i][1] + ' <b>' + at + '</b></span>');
    }
    if (amt.length === 3) body += '<div class="md-money-amt">成交金额：' + amt.join(' · ') + '</div>';
    body += '<div class="md-one" style="margin-top:6px">'
      + '占比＝该方向已成交的金额占总额的比例（主 / 平 / 客 三项合计约 100%）。'
      + '成交额越接近开赛越完整，打完一阵子会清空。</div>';
    return card('资金分布', '<span class="md-badge">临场累计</span>', body, null, 'report');
  }

  /* ============================================================
     ⑨ 🔥 爆冷预警（民间口诀算法）
     ------------------------------------------------------------
     口诀三条（阈值 1.40 / 3.50 / 4.00 是口诀参数，原样保留）：
       ① 主胜赔率 < 1.40
       ② |主队排名 − 客队排名| ≤ 3 且 平赔 < 3.50
       ③ 主队排名 ≤ 5 且 客队排名 ≥ 15 且 客胜赔率 > 4.00
     按顺序取【第一条】命中的（和用户给的 if / else if 一致）；都不中 → normal。

     ⚠️ 触发条件全部是【本页已有的真实数据】，一个数都不写死：
        · 欧赔：g.odds.europe 的【即时】（这一场没有即时才退回初盘）
        · 排名：g.home.rank / g.away.rank（在售场次每场都有；归档场次没有）
        · 亚盘：g.asianIndex 的让球线 / 上下盘水位（只作并列事实，不参与判定）
     ⚠️ 归档场次没有排名 → 第 ②③ 条如实写「无法判」，
        绝不用"欧赔接近度"之类的代理指标冒充排名（换了判据还叫同一个口诀，
        等于拿两个不同的东西说同一句话）。
     ============================================================ */
  var COLD_NOTE = '以上为民间口诀算法自动推演，仅供参考';

  /* 两队排名：两个都得是正整数才算「有排名」，缺一个就整对作废（不拿 0 顶） */
  function coldRanks(g) {
    var hr = num(g.home && g.home.rank), ar = num(g.away && g.away.rank);
    if (hr === null || ar === null || hr <= 0 || ar <= 0) return null;
    return { h: hr, a: ar, d: Math.abs(hr - ar) };
  }

  /* 欧赔：三项齐全才算数（缺一项就判不了 ②③ 的平赔 / 客赔那一半） */
  function coldOdds(g) {
    var eu = g.odds && g.odds.europe;
    if (!eu) return null;
    var lv = eu.live || eu.open;
    if (!lv) return null;
    var h = num(lv.home), d = num(lv.draw), a = num(lv.away);
    if (h === null || d === null || a === null) return null;
    return { h: h, d: d, a: a, live: !!eu.live };
  }

  /* 亚盘这一档：让球线 + 上下盘水位 + 由水位反推的赢盘百分比。
     1/水位 各自归一到 100%，用的就是「亚指」卡里那同一份水位，不另取数。
     hc.initLine / initUpWater 是初盘那一档；没有就用 odds.asian.open 的同侧水位。 */
  function coldAsian(g) {
    var ai = g.asianIndex || null;
    var as = g.odds && g.odds.asian;
    var lv = as ? (as.live || as.open) : null;
    var hc = (ai && ai.handicapChange) || null;
    var line = (ai && has(ai.line)) ? String(ai.line) : ((lv && has(lv.line)) ? String(lv.line) : null);
    var openLine = (hc && has(hc.initLine)) ? String(hc.initLine)
      : ((as && as.open && has(as.open.line)) ? String(as.open.line) : null);
    var nowLine = (hc && has(hc.nowLine)) ? String(hc.nowLine) : line;
    var side = (ai && (ai.upSide === 'home' || ai.upSide === 'away')) ? ai.upSide : null;
    var uw = num(ai && ai.upWater), dw = num(ai && ai.downWater);
    var openUp = num(hc && hc.initUpWater);
    if (openUp === null && side && as && as.open) openUp = num(as.open[side]);
    var upPct = null;
    if (uw !== null && dw !== null && uw > 0 && dw > 0) {
      var iu = 1 / uw, id = 1 / dw;
      upPct = iu / (iu + id) * 100;
    }
    return {
      line: line, openLine: openLine, nowLine: nowLine, side: side,
      uw: uw, dw: dw, openUp: openUp, upPct: upPct,
      downPct: upPct === null ? null : 100 - upPct,
      chgType: (hc && has(hc.type)) ? String(hc.type) : null
    };
  }

  /* 判词原文（用户给的那六句 + 两句默认句），一个字不改 */
  var COLD_TEXT = {
    r1: { rule: '大热必死',
      msg: '【大热必死】主队赔率极低，但亚盘让步不足或水位偏高，谨防主队久攻不下出平局。',
      diff: '欧赔与亚盘存在背离，机构有意造热主队，存在诱盘嫌疑。' },
    r2: { rule: '强强对话',
      msg: '【强强对话】双方实力接近，且平赔处于防范区间，平局概率大增。',
      diff: '胜负赔率分流均衡，平局赔率低开，机构防范平局意图明显。' },
    r3: { rule: '哀兵必胜',
      msg: '【哀兵必胜】客队虽排名靠后，但保级战意强烈，主队状态不佳时容易翻车。',
      diff: '主队让步过深，市场对客队战意估计不足，防平局或客胜。' },
    normal: {
      msg: '暂无明显爆冷迹象，正路打出概率较大。',
      diff: '基本面与盘口走势一致，无明显诱导。' }
  };

  function sgn1(v) {
    var n = num(v);
    if (n === null) return '—';
    if (Math.abs(n) < 0.05) n = 0;
    return (n > 0 ? '+' : '') + n.toFixed(1);
  }

  function coldCalc(g) {
    var o = coldOdds(g), rk = coldRanks(g), as = coldAsian(g);
    var checks = [], i, first = -1;

    /* ① 主胜赔率 < 1.40 */
    if (o) {
      checks.push({ key: 'r1', n: '① 主胜赔率 &lt; 1.40', v: o.h.toFixed(2),
        j: (o.h < 1.40) ? 'hit' : 'miss' });
    } else {
      checks.push({ key: 'r1', n: '① 主胜赔率 &lt; 1.40', v: '欧赔不全', j: 'na' });
    }
    /* ② |主排 − 客排| ≤ 3 且 平赔 < 3.50 —— 没有排名就整条「无法判」，不找替身 */
    if (o && rk) {
      checks.push({ key: 'r2', n: '② 排名差 ≤ 3 且 平赔 &lt; 3.50',
        v: '排名差 ' + rk.d + ' · 平赔 ' + o.d.toFixed(2),
        j: (rk.d <= 3 && o.d < 3.50) ? 'hit' : 'miss' });
    } else {
      checks.push({ key: 'r2', n: '② 排名差 ≤ 3 且 平赔 &lt; 3.50',
        v: rk ? ('平赔 ' + (o ? o.d.toFixed(2) : '—')) : '本场没有两队排名', j: 'na' });
    }
    /* ③ 主排 ≤ 5 且 客排 ≥ 15 且 客胜赔率 > 4.00 —— 同上 */
    if (o && rk) {
      checks.push({ key: 'r3', n: '③ 主排 ≤ 5 · 客排 ≥ 15 · 客胜赔率 &gt; 4.00',
        v: '主 ' + rk.h + ' · 客 ' + rk.a + ' · 客赔 ' + o.a.toFixed(2),
        j: (rk.h <= 5 && rk.a >= 15 && o.a > 4.00) ? 'hit' : 'miss' });
    } else {
      checks.push({ key: 'r3', n: '③ 主排 ≤ 5 · 客排 ≥ 15 · 客胜赔率 &gt; 4.00',
        v: rk ? ('客赔 ' + (o ? o.a.toFixed(2) : '—')) : '本场没有两队排名', j: 'na' });
    }
    for (i = 0; i < checks.length; i++) { if (checks[i].j === 'hit') { first = i; break; } }

    var type = 'normal', rule = null, msg = COLD_TEXT.normal.msg, diff = COLD_TEXT.normal.diff;
    if (first === 0) { type = 'warning'; rule = COLD_TEXT.r1.rule; msg = COLD_TEXT.r1.msg; diff = COLD_TEXT.r1.diff; }
    else if (first === 1) { type = 'warning'; rule = COLD_TEXT.r2.rule; msg = COLD_TEXT.r2.msg; diff = COLD_TEXT.r2.diff; }
    else if (first === 2) { type = 'warning'; rule = COLD_TEXT.r3.rule; msg = COLD_TEXT.r3.msg; diff = COLD_TEXT.r3.diff; }

    /* 触发依据：把命中那一条用【本场真实数值】说清楚（不是把判词再抄一遍） */
    var why;
    var lt = as.line ? esc0(as.line) : '—';
    var uwTxt = as.uw === null ? '—' : as.uw.toFixed(2);
    if (first === 0) {
      var oh = num(g.odds.europe.open && g.odds.europe.open.home);
      why = '本场主胜赔率 <b>' + o.h.toFixed(2) + '</b>，已低于口诀线 1.40'
        + (oh === null ? '（本场没有初盘可比）' : '（初盘 ' + oh.toFixed(2) + '）') + '。'
        + '同场的真实盘口一并摆出来：让球 <b>' + lt + '</b>、上盘水位 <b>' + uwTxt + '</b>。'
        + '口诀第一条只按主胜赔率这一条判，让步与水位不作加权。';
    } else if (first === 1) {
      why = '本场两队排名 <b>' + rk.h + '</b> / <b>' + rk.a + '</b>，排名差 <b>' + rk.d + '</b>（≤ 3）；'
        + '平赔 <b>' + o.d.toFixed(2) + '</b>（&lt; 3.50）。';
      var pm = poissonModel(g.odds.europe.live || g.odds.europe.open);
      if (pm) why += '平局隐含概率 <b>' + pm.p[1].toFixed(1) + '%</b>。';
      if (rk.h > 8 && rk.a > 8) {
        why += ' 口诀只看排名差、不看排名绝对值 —— 这两队其实都不在前列，判词是按口诀原样给出的。';
      }
    } else if (first === 2) {
      why = '本场主队排名 <b>' + rk.h + '</b>（≤ 5）、客队排名 <b>' + rk.a + '</b>（≥ 15）、'
        + '客胜赔率 <b>' + o.a.toFixed(2) + '</b>（&gt; 4.00）；让球 <b>' + (as.openLine ? esc0(as.openLine) : '—')
        + '</b> → <b>' + lt + '</b>。';
    } else if (!o) {
      why = '本场没有三项齐全的欧赔，三条口诀都判不了 —— 上面那句是口诀的默认结论，不是算出来的。';
    } else {
      why = '主胜赔率 <b>' + o.h.toFixed(2) + '</b>（没低于 1.40）';
      if (rk) {
        why += '；排名差 <b>' + rk.d + '</b>、客胜赔率 <b>' + o.a.toFixed(2) + '</b> 这几条也没同时到线，'
          + '所以三条口诀都不触发。';
      } else {
        why += '；本场没有两队排名，第 ②③ 条无法判，实际只判了第 ① 条。';
      }
    }
    return { type: type, rule: rule, msg: msg, diff: diff, why: why, checks: checks,
             o: o, rk: rk, as: as };
  }

  function renderCold(g) {
    var c = coldCalc(g);
    var on = c.type === 'warning';
    var bd = on ? '<span class="md-badge warn">已触发</span>' : '<span class="md-badge">未触发</span>';
    var head = '<div class="md-cold-box">'
      + '<div class="md-cold-msg"><span class="md-cold-tag">'
      + (on ? esc0(c.rule) : '正路') + '</span>' + esc0(c.msg) + '</div>'
      + '<div class="md-cold-why">' + c.why + '</div>'
      + '</div>';
    var t = '<table class="md-tbl"><thead><tr>'
      + '<th style="width:40%">口诀条件</th><th style="width:40%">本场数值</th><th style="width:20%">判定</th>'
      + '</tr></thead><tbody>';
    for (var i = 0; i < c.checks.length; i++) {
      var k = c.checks[i];
      var jd = k.j === 'hit' ? '<span class="down">触发</span>'
        : (k.j === 'na' ? '<span class="dim">无法判</span>' : '<span class="dim">未触发</span>');
      t += '<tr><td class="s wrap">' + k.n + '</td><td class="s wrap">' + k.v + '</td><td>' + jd + '</td></tr>';
    }
    t += '</tbody></table>';
    var note = '<div class="md-cold-note">三条口诀按 <b>①→②→③</b> 的顺序取第一条命中的，'
      + '都不中就是「暂无明显爆冷迹象」。判定表把三条<b>各自</b>算了一遍 —— '
      + '所以看得见命中哪条、卡在哪条；「无法判」＝那一场缺这条要用的数，不猜。<br>'
      + COLD_NOTE + '</div>';
    return card('🔥 爆冷预警', bd, head + t + note, null, 'report sports', on ? 'md-cold-on' : 'md-cold-off');
  }

  /* ============================================================
     ⑩ 📊 差异分析（给的是数字，不是模板文字）
     ------------------------------------------------------------
     三样东西，全部现算：
       A 欧赔隐含概率    p = (1/主, 1/平, 1/客) 归一化到 100%
                        （和「泊松指数」同一口径，不另立一套）
       B 亚盘推算概率    上下盘水位各取 1/水位 再归一 → 上盘赢盘百分比；
                        再按 asianIndex.upSide 落回主/客两队
       C 差             A − B（单位：个百分点），并按 3 / 6 分档
     另外给「即时 vs 初盘」的涨跌幅（欧赔三项）+ 让球线与上盘水位的变化。
     ⚠️ A 的「主胜」是【赢球】概率、B 的主队侧是【赢盘】概率（含走盘退款、
        也没有平局项）—— 两者口径不同，卡片里如实写「差只作横向参照」，
        不假装是同一件事，也不写「机构一定在诱」这种结论。
     ============================================================ */
  function diffCalc(g) {
    var eu = g.odds && g.odds.europe;
    var lv = eu ? (eu.live || eu.open) : null;
    var op = eu ? eu.open : null;
    var m = lv ? poissonModel(lv) : null;
    var as = coldAsian(g);
    var rowHome = null, rowAway = null;
    if (m && as.side && as.upPct !== null) {
      var homePct = as.side === 'home' ? as.upPct : as.downPct;
      var awayPct = 100 - homePct;
      rowHome = { eu: m.p[0], as: homePct, d: m.p[0] - homePct };
      rowAway = { eu: m.p[2], as: awayPct, d: m.p[2] - awayPct };
    }
    var chg = [], i;
    if (lv && op) {
      var ks = [['主胜', 'home'], ['平', 'draw'], ['客胜', 'away']];
      for (i = 0; i < 3; i++) {
        var a0 = num(op[ks[i][1]]), b0 = num(lv[ks[i][1]]);
        if (a0 === null || b0 === null || !(a0 > 0)) continue;
        chg.push({ k: ks[i][0], from: a0, to: b0, p: (b0 - a0) / a0 * 100 });
      }
    }
    return { m: m, as: as, rowHome: rowHome, rowAway: rowAway, chg: chg,
             hasOpen: !!(lv && op), hasLive: !!lv };
  }

  function diffJudge(v) {
    var a = Math.abs(num(v) === null ? 0 : v);
    if (a >= 6) return '明显背离';
    if (a >= 3) return '轻微背离';
    return '基本一致';
  }

  function renderDiff(g) {
    var c = coldCalc(g);
    var d = diffCalc(g);
    var body = '<div class="md-diff-quote"><div class="lb">口诀判词</div>'
      + '<div class="tx">' + esc0(c.diff) + '</div></div>';

    if (d.rowHome) {
      var dh = d.rowHome.d, da = d.rowAway.d;
      body += '<div class="md-diff-top">'
        + '<span class="k">主队侧差</span><b>' + sgn1(dh) + '</b><span class="u">个百分点</span>'
        + '<span class="jd">欧赔主胜 <b>' + d.rowHome.eu.toFixed(1) + '%</b> − 亚盘主队侧 <b>'
        + d.rowHome.as.toFixed(1) + '%</b> = <em>' + sgn1(dh) + ' 个百分点 → ' + diffJudge(dh)
        + '</em>；客队侧差 ' + sgn1(da) + ' 个百分点 → ' + diffJudge(da) + '。</span>'
        + '</div>';
      body += '<table class="md-tbl"><thead><tr><th style="width:24%">方向</th>'
        + '<th style="width:26%">欧赔隐含</th><th style="width:26%">亚盘推算</th><th style="width:24%">差</th>'
        + '</tr></thead><tbody>'
        + '<tr><td class="s">主胜</td><td class="n">' + d.rowHome.eu.toFixed(1) + '%</td>'
        + '<td class="n">' + d.rowHome.as.toFixed(1) + '%</td>'
        + '<td class="' + (dh > 0.05 ? 'up' : (dh < -0.05 ? 'down' : 'dim')) + '">' + sgn1(dh) + '</td></tr>'
        + '<tr><td class="s">平</td><td class="n">' + d.m.p[1].toFixed(1) + '%</td>'
        + '<td class="dim">不可比</td><td class="dim">—</td></tr>'
        + '<tr><td class="s">客胜</td><td class="n">' + d.rowAway.eu.toFixed(1) + '%</td>'
        + '<td class="n">' + d.rowAway.as.toFixed(1) + '%</td>'
        + '<td class="' + (da > 0.05 ? 'up' : (da < -0.05 ? 'down' : 'dim')) + '">' + sgn1(da) + '</td></tr>'
        + '</tbody></table>'
        + '<div class="md-one">亚盘是上下盘二元市场，没有「平」这一项（走盘退款），'
        + '所以平局那一行只能写「不可比」，不硬凑一个数。</div>';
    } else {
      body += '<div class="md-na">本场没有可用的亚盘水位，算不出「欧赔 vs 亚盘」的差。<br>'
        + '<em>这一块不拿"即时 vs 初盘"的变化去顶替它 —— 那是另一件事，下面单独列。</em></div>';
    }

    body += '<div class="md-diff-sub">即时 vs 初盘</div>';
    if (!d.hasLive) {
      body += '<div class="md-one">本场连即时欧赔都没有，变化幅度无从谈起。</div>';
    } else if (!d.hasOpen) {
      body += '<div class="md-one">本场只存了即时一档（没有初盘），所以不给涨跌幅 —— 不拿别处的均值顶。</div>';
    } else if (d.chg.length) {
      for (var i = 0; i < d.chg.length; i++) {
        var v = d.chg[i];
        body += '<div class="md-diff-line"><span class="k">欧赔' + v.k + '</span>'
          + '<span class="v">' + v.from.toFixed(2) + ' → ' + v.to.toFixed(2) + '</span>'
          + '<span class="d ' + (v.p > 0.05 ? 'up' : (v.p < -0.05 ? 'down' : '')) + '">' + sgn1(v.p) + '%</span></div>';
      }
    }
    /* 亚盘：让球线 + 上盘水位（这两样是初盘/即时都有的，归档场次也有） */
    var as = d.as;
    if (as && (as.openLine || as.line || as.openUp !== null || as.uw !== null)) {
      var sideTxt = as.side === 'home' ? '主队' : (as.side === 'away' ? '客队' : '—');
      var lineRow, lineD = '';
      if (as.openLine && as.line) {
        lineRow = '初 ' + String(as.openLine) + ' → 即 ' + String(as.line);
        lineD = String(as.openLine) === String(as.line) ? '不变' : '变盘';
      } else {
        lineRow = as.line ? String(as.line) : '—';
      }
      body += '<div class="md-diff-line"><span class="k">让球</span>'
        + '<span class="v">' + esc0(lineRow) + '</span>'
        + '<span class="d">' + esc0(lineD) + '</span></div>';
      var wRow = '—';
      var wD = '', wDiff = null;
      if (as.openUp !== null && as.uw !== null) {
        wRow = as.openUp.toFixed(2) + ' → ' + as.uw.toFixed(2);
        wDiff = as.uw - as.openUp;
        wD = sgn1(wDiff);
      } else if (as.uw !== null) {
        wRow = as.uw.toFixed(2);
      }
      body += '<div class="md-diff-line"><span class="k">上盘水</span>'
        + '<span class="v">' + esc0(sideTxt + ' · ' + wRow) + '</span>'
        + '<span class="d ' + (wDiff === null ? '' : (wDiff > 0.0001 ? 'up' : (wDiff < -0.0001 ? 'down' : ''))) + '">'
        + esc0(wD) + '</span></div>';
    }

    body += '<div class="md-diff-note">口径：<b>欧赔隐含</b> = (1/赔率) 归一化到三项合计 100%（和「泊松指数」同一套算法）；'
      + '<b>亚盘推算</b> = 上下盘水位各取 1/水位 再归一（和「亚指」卡用的是同一份水位）。'
      + '背离分档：差 &lt; 3 个百分点记「基本一致」，3~6 记「轻微背离」，≥ 6 记「明显背离」（本页口径，只用于给背离分档）。<br>'
      + '⚠️ 两者不是同一件事：欧赔的「主胜」是<b>赢球</b>概率，亚盘的主队侧是<b>赢盘</b>概率'
      + '（含走盘退款、也没有平局这一项）—— 所以这个差只作横向参照，不等于哪一边算错了。'
      + '这一块只描述两个盘口之间的差，是统计描述，不是预测、不是推荐。<br>'
      + COLD_NOTE + '</div>';

    return card('📊 差异分析', '<span class="md-badge blue">两盘对照</span>', body, null, 'report sports', 'md-diff');
  }

  /* ---- ③ 比赛头部 ---- */
  /* 归档场次用的是另一种数据形状，这里统一推出一个状态。
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
      + (isHist ? '<div class="md-one" style="margin-top:8px">这场已过【在售】窗口，用的是归档记录 —— 只留了欧赔即时 / 亚指即时两档</div>' : '')
      + '</section>';
  }

  /* ---- ② 顶部三档标签 ----
     用户起的两个功能名【保留】：数据检测报告 / 体育抓取（都不含来源信息）。
     ⚠️ 原来第三档带「即将」角标、点了只说一句"暂未接入" —— 现在已经接上了，
        角标去掉、点了真的切内容。
     ⚠️ data-src 的值只是页内用的开关名，不带任何站点/文件名：
        all = 全部 · report = 数据检测报告 · sports = 体育抓取。 */
  function srcBar() {
    return '<div class="md-src" id="mdSrc">'
      + '<div class="md-srcbtn on" data-src="all" role="button" tabindex="0">全部</div>'
      + '<div class="md-srcbtn" data-src="report" role="button" tabindex="0">数据检测报告</div>'
      + '<div class="md-srcbtn" data-src="sports" role="button" tabindex="0">体育抓取</div>'
      + '</div><div class="md-srcnote" id="mdSrcNote"></div>';
  }

  function esc0(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* 按标签显示/隐藏各档卡片：卡片上有 data-grp（'report' / 'sports' / 'report sports'）。
     「全部」＝都显示。 */
  function applySrc(s) {
    var cards = document.querySelectorAll('#mdBody .md-card');
    for (var i = 0; i < cards.length; i++) {
      var grp = cards[i].getAttribute('data-grp') || 'report';
      var show = (s === 'all') || (' ' + grp + ' ').indexOf(' ' + s + ' ') >= 0;
      cards[i].style.display = show ? '' : 'none';
    }
  }

  /* ---- 组装整页 ----
     卡片顺序（11 张）：雷达寻胆 · 欧指 · 欧赔对比 · 大小 · 让球 · 亚指 ·
       🔥 爆冷预警 · 📊 差异分析 · 泊松指数 · 资金分布 · 分歧指。
     ⚠️ 新加的两块放在【欧指 / 让球 / 亚指 之后】——它们读的就是那几张卡的数字；
        原来的 9 张卡一张没动、相对顺序也没变（只是中间插了两块）。 */
  function render(g) {
    var body = srcBar() + renderHead(g)
      + renderRadar(g)
      + renderEurope(g) + renderTitanEuro(g) + renderOU(g) + renderRQ(g) + renderAsian(g)
      + renderCold(g) + renderDiff(g)
      + renderPoisson(g) + renderMoney(g) + renderDivergence(g);
    document.getElementById('mdBody').innerHTML = body;
    applySrc('all');

    /* 三档标签：切高亮 + 切内容 + 一句说明。
       ⚠️ 提示语里【不许】出现来源 / 站名 / 文件名（硬性规则）；
          「全部」那一档的用户可见提示已按用户要求【整条删除】，所以那里是空字符串
          （CSS 里 .md-srcnote:empty 会把它收起来，不留空白）。 */
    var note = document.getElementById('mdSrcNote');
    var bar = document.getElementById('mdSrc');
    var TIP = {
      all: '',
      report: '赔率、盘口、大小球、资金和模型推算这几档',
      sports: '各家博彩公司的初盘 / 即时赔率对比'
    };
    bar.addEventListener('click', function (ev) {
      var el = ev.target.closest ? ev.target.closest('.md-srcbtn') : null;
      if (!el) return;
      var s = el.getAttribute('data-src') || 'all';
      if (!TIP.hasOwnProperty(s)) s = 'all';
      var all = bar.querySelectorAll('.md-srcbtn');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('on');
      el.classList.add('on');
      applySrc(s);
      note.textContent = TIP[s];
    });
    bar.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.target.click(); }
    });
  }

  /* ---- 找不到那一场：不白屏、给回去的路 ----
     兜底页也只回显【合法】编号：格式不对的 ?c=（"?c=abc def" 之类）连这个字符串
     都不往页面上摆 —— 虽然 esc0 已经转义了，但把用户的输入原样印出来依然不好看。
     返回键同样：href 写实际文件名 足球推荐.html，能回历史就回历史。 */
  function renderMiss(code, badFormat) {
    var d = badFormat
      ? '编号格式不对 —— 只接受「周X + 3 位数字」的竞彩编号（例如 周五002）。'
      : ((code ? '编号 ' + esc0(code) + ' ' : '') + '不在当前数据里（已过保留期被清理，或编号写错了）。');
    document.getElementById('mdBody').innerHTML =
      '<div class="md-miss"><div class="t">没有找到这场比赛的详情</div>'
      + '<div class="d">' + d + '</div>'
      + '<a href="足球推荐.html" role="button" onclick="if(history.length>1){history.back();return false}">← 回到竞彩页</a></div>';
    document.getElementById('mdLive').innerHTML = '';
  }

  /* ---- 入口：?c=周五002 ----
     ⚠️ ?c= 只接受「周X + 3 位数字」：
        实测库里的编号全是「周五001」「周日018」这种形状，
        别的字符串（"abc def"、"<b>x</b>"、超长串）一律走兜底页，
        既不拿去匹配，也不拿去回显。
     ⚠️ 正则里用 [0-9] 不用 \\d —— 这段代码写在模板字符串里，反斜杠会被先吃一遍。 */
  var CODE_RE = /^(周[一二三四五六日])[0-9]{3}$/;
  var raw = null;
  try { raw = new URLSearchParams(location.search).get('c'); } catch (e) { raw = null; }
  if (raw !== null && raw !== undefined) raw = String(raw).trim();
  if (!raw) raw = null;
  var code = (raw && CODE_RE.test(raw)) ? raw : null;
  var badFormat = !!raw && code === null;

  var g = null;
  if (code) {
    for (var i = 0; i < games.length; i++) {
      if (String(games[i].code || '').trim() === code) { g = games[i]; break; }
    }
  }
  /* 没带参数：只有一场就直接展示（用户从别处手滑点进来也不白屏）；
     格式不对的参数不算「没带参数」，别顺手塞一场别的比赛给他 */
  if (!g && !code && !badFormat && games.length === 1) g = games[0];

  document.getElementById('mdLive').innerHTML = '更新 <i>' + esc0((D.updated || '').slice(11) || '—') + '</i>';
  if (g) render(g); else renderMiss(code, badFormat);
})();
</script>

<div class="md-foot" id="mdFoot"></div>
<script>
(function () {
  /* 【底部脚注 · 2026-10-17 第 3 步】用户把整块圈出来要求删掉。原来这里有四行：
       ①「数据源：xxx（欧赔/亚盘/大小球）· xxx（多公司欧赔 → 分歧指，共 N 场）」
       ② 场次统计「共 64 场在库（在售 11 + 归档 53）· 体彩官方在售 35 场」
       ③ 三个更新时间（在售 / 归档 / 分歧指）
       ④「泊松指数 = 由 xxx 欧赔反推…；分歧指 = xxx 各家公司的即时欧赔离散度…」两个口径说明
     处理：
       · ①④ 里点了来源 → 按硬性规则【必须删】，连同站名一起删干净；
       · ②③ 本身不含来源信息，但用户圈的是【整块】、要求一起删 → 也一并删掉。
         删了不会让用户少看什么：更新时间在顶栏「更新 05:13」那一处仍然有，
         归档场次的头部也各自带「已完场 · 归档」标记。
       · 【唯一保留】最后那句免责声明 —— 这一页上【只有这一处】免责声明
         （全文搜过 '投注建议'，仅此一处），删了就没有了，所以按用户给的
         「唯一一处 → 保留」处理，留在原来的 .md-foot 位置（页尾）。
     ⚠️ 以后往这里加字，同样不许出现站名 / 域名 / 接口 / 文件名 —— 页面尾部那段
        【留痕断言】会当场拦下来（命中就 exit 1，构建失败）。 */
  document.getElementById('mdFoot').innerHTML = '本页只陈列数据，不构成投注建议。';
  /* 返回键的「优先回浏览器历史」写在 <a id="mdBack"> 的 onclick 里（见上面 md-top）。
     ⚠️ 这里【不要】再挂一个 click 监听去 history.back()：
        两处都调用会连退两级（回到竞彩页的上一页）。
     另外原来那句用 referrer 判断的写法是失效的 ——
        file:// 下 file→file 跳转没有 referrer（实测 document.referrer === ''），
        条件永远为假 → history.back() 从来没生效过，才会落到死链上。 */
})();
</script>
${INSTALL_HTML}
${INSTALL_JS}
</body>
</html>
`;

fs.writeFileSync(OUT_FILE, html, 'utf8');

/* ============================================================
   【输出自检】看到红字就说明这个脚本的源码被别的工具【转码弄坏了】
   ------------------------------------------------------------
   实测踩过：用 PowerShell 的 Get-Content -Raw / Set-Content 改这个文件，
   会按系统 ANSI(GBK) 往返一次 → 所有中文变成「娆ф寚」这种乱码，还会加 BOM。
   乱码会让页面上的中文全错，而且不会报错 —— 所以这里主动拦一道。
   正确改法：用编辑工具改（读写都是 UTF-8），不要用 PowerShell 文本管道。
   ============================================================ */
const problems = [];
if (html.charCodeAt(0) === 0xFEFF) problems.push('输出带了 BOM');
if (html.includes('\uFFFD')) problems.push('输出里有 U+FFFD 替换字符');
if (!html.includes('比赛详情')) problems.push('输出里找不到「比赛详情」（中文可能已损坏）');
if (!html.includes('欧指') || !html.includes('亚指')) problems.push('输出里找不到「欧指/亚指」');
if (!html.includes('泊松指数') || !html.includes('分歧指')) problems.push('输出里找不到「泊松指数/分歧指」');
if (!html.includes('欧赔反推')) problems.push('输出里找不到「欧赔反推」（泊松指数的算法说明丢了）');
if (!html.includes('暂无多家赔率数据')) problems.push('输出里找不到分歧指的如实占位文案');
/* 【分歧指】有数据时必须能自证：数据真的内嵌进去了、档位色块也在。
   少一个都会变成"静默失效"（页面照旧显示暂无，但没人知道为什么）。 */
if (DIV_GAMES) {
  if (html.indexOf('"div":{') < 0) problems.push('jc-divergence.js 读到了，但没内嵌进页面（D.div 丢了）');
  if (!html.includes('md-lv')) problems.push('输出里找不到分歧指的档位样式 .md-lv（CSS 丢了）');
  if (!html.includes('变异系数')) problems.push('输出里找不到分歧指的「变异系数」说明');
}
if (/<button[\s>]/.test(html)) problems.push('输出里出现了裸 <button> 元素');
/* 返回键的死链回归：竞彩页的文件名是 足球推荐.html，不是 football.html */
if (html.includes('href="football.html"')) problems.push('返回链接还写着 football.html（竞彩页实际文件名是 足球推荐.html）');
if (!html.includes('href="足球推荐.html"')) problems.push('输出里找不到 href="足球推荐.html"（返回链接丢了）');
if (html.includes('document.referrer && history.length')) problems.push('返回键还在用 document.referrer 判断（file:// 下恒为假）');
/* ?c= 的编号校验必须只认「周X + 3 位数字」 */
if (!html.includes('周[一二三四五六日])[0-9]{3}')) problems.push('输出里找不到 ?c= 的编号校验正则 /^(周[一二三四五六日])[0-9]{3}$/');
if (html.includes('localStorage') || html.includes('sessionStorage')) problems.push('输出里出现了 localStorage/sessionStorage');
if (/[\u00C0-\u00FF]{4,}/.test(html)) problems.push('输出里有连续高位字节（乱码迹象）');
/* 【欧赔对比】有数据时同样要能自证：明细真的内嵌了、表格样式也在。
   少了任何一样都会变成"静默失效"（页面显示暂无，但没人知道为什么）。 */
if (TITAN_GAMES) {
  if (html.indexOf('"multi":{') < 0) problems.push('jc-titan.js 读到了，但没内嵌进页面（D.multi 丢了）');
  if (!html.includes('md-eu')) problems.push('输出里找不到欧赔对比的表格样式 .md-eu（CSS 丢了）');
  if (!html.includes('欧赔对比')) problems.push('输出里找不到「欧赔对比」这一档');
  if (!html.includes('主流')) problems.push('输出里找不到欧赔对比的「主流 N 家」说明');
}
/* 【雷达寻胆】必须始终在页面上（每场都能算：至少欧赔那一档一定有）；
   有成交资金数据时还要能自证"真的内嵌进去了 + 横条样式在"，
   少一样就会变成静默失效（页面照旧显示，但数字其实没进来）。 */
if (!html.includes('雷达寻胆')) problems.push('输出里找不到「雷达寻胆」这一档');
if (!html.includes('md-radar-row')) problems.push('输出里找不到雷达寻胆的信心横条样式 .md-radar-row（CSS 丢了）');
if (!html.includes('加权几何平均')) problems.push('输出里找不到雷达寻胆的算法口径说明');
if (BIFA_GAMES) {
  if (html.indexOf('"money":{') < 0) problems.push('jc-bifa.js 读到了，但没内嵌进页面（D.money 丢了）');
  if (!html.includes('资金面：成交')) problems.push('输出里找不到雷达寻胆的「资金面：成交」明细行（成交资金那一维没接上）');
}
/* 【资金分布】独立一档：没数据也要在页面上（显示如实占位，绝不写 0）。
   有数据时「总成交」必须能在页面里找到 —— 否则就是"内嵌成功但没画出来"的静默失效。 */
if (!html.includes('资金分布')) problems.push('输出里找不到「资金分布」这一档');
if (!html.includes('md-money-row')) problems.push('输出里找不到资金分布的占比横条样式 .md-money-row（CSS 丢了）');
if (!html.includes('本场暂无成交量数据')) problems.push('输出里找不到资金分布的如实占位文案「本场暂无成交量数据」');
if (BIFA_GAMES && !html.includes('总成交')) problems.push('输出里找不到资金分布的「总成交」（成交额没接上）');

/* ============================================================
   【留痕断言 · 硬性条件】页面上不许出现任何"数据是从哪儿来的"
   ------------------------------------------------------------
   用户 2026-10-17 反复强调：全页面不要有任何地方显示在哪里抓取的数据
   （站名 / 域名 / 接口 / 数据文件名都不行）。这一条不靠人自觉 ——
   生成完 HTML 当场扫一遍，命中就 exit 1（构建失败），并打印命中了什么。
   以后谁再往页面里加站名 / 文件名，构建会红，不会悄悄发上线。

   两道网，都是硬失败：
     ① 硬词（站名 / 域名 / 数据文件名）—— 扫【整个 HTML】，连 <script> 注释里
        都不许有：这些词只要出现在文件里，看源码的人就能顺着追到源头。
     ② 软词（数据源 / 数据来源 / 来源 / 来自 / 取自 / 接入 / 接口 / 抓取 / 爬 / API）
        —— 只扫【可见文本】：HTML 注释、<style>、JS 注释都不算（用户看不到），
        标签属性也不算（那是 data-src="report" 这种页内开关名，不是给用户看的字）。
        ⚠️【关键】这一页的字几乎全是页内 <script> 用 JS 拼出来再塞进 DOM 的，
           所以【不能整块丢掉 <script>】—— 那样等于什么都没扫。
           正确做法：留下 <script> 里的【字符串】，只把 JS 的块注释和行注释去掉。
           实测踩过：第一版整块丢掉 script，结果往脚注里塞"数据源见上"照样 exit 0（漏拦）。
        ⚠️ 用户自己起的两个功能名【数据检测报告】【体育抓取】先剔除再扫 ——
           那是功能名、不含来源信息，必须保留。
   ============================================================ */
function visibleText(h) {
  return String(h)
    .replace(/<!--[\s\S]*?-->/g, ' ')                  /* HTML 注释 */
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')         /* 样式表整块 */
    /* <script>：留字符串、去 JS 注释（// 前面排除冒号，免得把 https:// 当注释切掉） */
    .replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, code) =>
      ' ' + String(code)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ') + ' ')
    .replace(/<[^>]*>/g, ' ');                          /* 剩下的标签（含属性）去掉 */
}
const HARD_WORDS = ['500.com', '500网', '球探', 'titan007', '7m', '雷速', 'leisu',
  'yiqicai', '一起彩', 'toutiao', '头条', 'bf_jc', 'JcResult',
  /* ⚠️ 2026-10-17 加：成交额那一档的数据是交易所的成交记录，站名 / 产品名一样算"来源痕迹"。
     页面上的模块名因此用中性的「资金分布」，正文里一个「必发 / Betfair」都不许有。 */
  '必发', 'Betfair',
  'jc-data.js', 'jc-history.js', 'jc-divergence.js', 'jc-titan.js', 'jc-bifa.js', 'history.js',
  'http://', 'https://'];
const hardHit = HARD_WORDS.filter((w) => html.toLowerCase().includes(w.toLowerCase()));
if (hardHit.length) {
  problems.push('页面里出现了"数据是从哪儿来的"痕迹（硬词 · 全文件扫）：' + hardHit.join(' / '));
}
const SOFT_WORDS = ['数据源', '数据来源', '来源', '来自', '取自', '接入', '接口', '抓取', '爬'];
const vis = visibleText(html).replace(/数据检测报告|体育抓取/g, ' ');
const softHit = SOFT_WORDS.filter((w) => vis.includes(w));
if (/(^|[^A-Za-z])api([^A-Za-z]|$)/i.test(vis)) softHit.push('API');
if (softHit.length) {
  problems.push('可见文本里出现了"数据是从哪儿来的"字样（软词 · 只扫可见文本）：' + softHit.join(' / '));
}

if (problems.length) {
  console.error('❌ 编码自检失败：' + problems.join(' / '));
  console.error('   说明 build-match.mjs 或数据文件被非 UTF-8 工具改过，请用编辑工具重存一遍。');
  process.exit(1);
}

console.log('✅ 比赛详情.html 已生成  ' + (fs.statSync(OUT_FILE).size / 1024).toFixed(1) + ' KB');
console.log('   内嵌比赛：' + ORDERED.length + ' 场（在售 ' + LIVE_GAMES.length + ' + 归档 ' + histAdded + '）'
  + ' · 在售数据时间 ' + (UPDATED || '—') + ' · 归档数据时间 ' + ((HIST && HIST.updated) || '—')
  + ' · 体彩官方在售 ' + (IN_SALE == null ? '—' : IN_SALE) + ' 场');
console.log('   分歧指：' + (DIV_GAMES
  ? '球探 titan007 多公司欧赔 ' + Object.keys(DIV_GAMES).length + ' 场（数据时间 ' + (DIV.updated || '—') + '）'
  : '⚠️ 没有 jc-divergence.js → 页面显示「暂无多家赔率数据」（不会报错，但这一档是空的）'));
console.log('   欧赔对比：' + (TITAN_GAMES
  ? '主流 ' + ((TITAN && TITAN.main) ? TITAN.main.length : 0) + ' 家的明细 ' + Object.keys(TITAN_GAMES).length
    + ' 场（数据时间 ' + (TITAN.updated || '—') + '）'
  : '⚠️ 没有 jc-titan.js → 页面显示「暂无多家公司的赔率对比数据」（不会报错，但这一档是空的）'));
console.log('   资金分布：' + (BIFA_GAMES
  ? Object.keys(BIFA_GAMES).length + ' 场有成交额（其余场次显示「本场暂无成交量数据」，绝不写 0）'
  : '⚠️ 没有 jc-bifa.js → 这一档全部显示「本场暂无成交量数据」（不会报错）'));
console.log('   ✅ 留痕断言：页面里没有任何站名 / 域名 / 接口 / 数据文件名（可见文本也扫过了）');
console.log('      ⚠️ 硬词黑名单已含「必发」「Betfair」—— 成交额那一档的站名 / 产品名同样不许出现');
console.log('   入口：比赛详情.html?c=周五002');
