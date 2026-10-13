// ============================================================
//  export-football.mjs —— 生成足球只读分享页
//
//  产物：足球推荐.html —— 自包含单文件，发出去只能看
//  内容：未开赛 / 进行中 / 已完场 三个分区
//        每场比赛的对阵、比分、赔率、推荐
//        完场明确标出「红（命中）/ 黑（未中）」
//
//  数据源：football.js
//  用法：node export-football.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, '足球推荐.html');

/* ---------- 读数据 ---------- */
const dataPath = path.join(ROOT, 'football.js');
if (!fs.existsSync(dataPath)) {
  console.error('❌ 找不到 football.js，请先运行 build-football.mjs');
  process.exit(1);
}

const ctx = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
vm.runInContext(fs.readFileSync(dataPath, 'utf8') + '\nglobalThis.__D = FOOTBALL_DATA;', ctx);
const DATA = ctx.__D;

if (!DATA || !DATA.lists) {
  console.error('❌ football.js 数据格式不对');
  process.exit(1);
}

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

/* ---------- 渲染一场 ---------- */
function renderMatch(g) {
  const eu = g.odds && g.odds.europe;
  const euV = eu && (eu.live || eu.open);
  const as = g.odds && g.odds.asian;
  const asV = as && (as.live || as.open);
  const ou = g.odds && g.odds.overunder;
  const ouV = ou && (ou.live || ou.open);
  const r = g.reco;
  const res = g.result;

  const hs = g.home ? g.home.score : null;
  const as_ = g.away ? g.away.score : null;
  const hasScore = hs !== null && hs !== undefined && as_ !== null && as_ !== undefined;

  const oddSpan = (label, v, on) =>
    (v === null || v === undefined || v === '') ? '' :
    `<span class="m-ov${on ? ' on' : ''}">${label}${v}</span>`;

  let oddsHtml = '';
  if (euV) {
    oddsHtml += `<div class="m-odds"><span class="m-ol">欧赔</span>` +
      oddSpan('主 ', euV.home, r && r.pick === 'home') +
      oddSpan('平 ', euV.draw, r && r.pick === 'draw') +
      oddSpan('客 ', euV.away, r && r.pick === 'away') + `</div>`;
  }
  if (asV) {
    oddsHtml += `<div class="m-odds"><span class="m-ol">亚盘</span>` +
      oddSpan('', asV.line, false) + oddSpan('主 ', asV.home, false) + oddSpan('客 ', asV.away, false) + `</div>`;
  }
  if (ouV) {
    oddsHtml += `<div class="m-odds"><span class="m-ol">大小</span>` +
      oddSpan('', ouV.line, false) + oddSpan('大 ', ouV.over, false) + oddSpan('小 ', ouV.under, false) + `</div>`;
  }

  /* 推荐 + 红黑 */
  let recoHtml = '';
  if (r) {
    const rb = res
      ? `<span class="m-rb ${res.hit ? 'hit' : 'miss'}">${res.hit ? '红' : '黑'}</span>`
      : '';
    const note = res
      ? `最终 ${res.actualLabel}（${res.score}）`
      : `信心 ${r.confidence}%`;

    recoHtml =
      `<div class="m-reco">` +
      `<span class="m-reco-pick">推荐 <b>${r.label}</b></span>` +
      rb +
      `<span class="m-reco-conf">${note}</span>` +
      `<span class="m-reco-prob">` +
      `<i class="${r.pick === 'home' ? 'on' : ''}">主${r.prob.home}%</i>` +
      `<i class="${r.pick === 'draw' ? 'on' : ''}">平${r.prob.draw}%</i>` +
      `<i class="${r.pick === 'away' ? 'on' : ''}">客${r.prob.away}%</i>` +
      `</span></div>`;
  }

  /* 比分显示 */
  let scoreHtml;
  if (hasScore) {
    scoreHtml = `<span class="m-vs${g.kind === 'live' ? ' live' : ''}">${hs} - ${as_}</span>`;
  } else {
    scoreHtml = `<span class="m-vs">VS</span>`;
  }

  /* 时间 / 分钟 */
  const timeLabel = (g.kind === 'live' && g.minute)
    ? `<span class="m-minute">${g.minute}'</span>`
    : `<span class="m-time">${timeHM(g.time)}</span>`;

  return (
    `<div class="m-card${res ? (res.hit ? ' win' : ' lose') : ''}">` +
    `<div class="m-top">` +
    `<span class="m-league"${g.league && g.league.color ? ` style="color:#${g.league.color}"` : ''}>${esc(g.league ? g.league.name : '')}</span>` +
    timeLabel +
    `</div>` +
    `<div class="m-teams">` +
    `<span class="m-team home">${esc(g.home ? g.home.name : '?')}</span>` +
    scoreHtml +
    `<span class="m-team away">${esc(g.away ? g.away.name : '?')}</span>` +
    `</div>` +
    oddsHtml +
    recoHtml +
    `</div>`
  );
}

/* ---------- 分区渲染 ---------- */
const KINDS = [
  ['upcoming', '未开赛'],
  ['live', '进行中'],
  ['finished', '已完场']
];

let bodyHtml = '';
let total = 0;

KINDS.forEach(([key, label]) => {
  const games = DATA.lists[key] || [];
  if (!games.length) return;
  total += games.length;

  const byDate = new Map();
  games.forEach((g) => {
    const d = dateMD(g.time) || '未知';
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(g);
  });

  let inner = '';
  [...byDate.keys()].sort().forEach((date) => {
    const arr = byDate.get(date);
    inner +=
      `<div class="m-datehead"><span>${date}</span><span class="m-week">${weekCN(arr[0].time)}</span>` +
      `<span class="m-count">${arr.length} 场</span></div>`;
    arr.forEach((g) => { inner += renderMatch(g); });
  });

  bodyHtml +=
    `<section class="m-section" id="sec-${key}">` +
    `<h2 class="m-sectitle">${label}<span class="m-seccount">${games.length}</span></h2>` +
    inner +
    `</section>`;
});

const st = DATA.stat || {};
const now = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

/* ---------- 组装 ---------- */
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>足球推荐 · ${stamp.slice(5, 10)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
  background: #0f1115; color: #e8eaed;
  padding: 12px 9px 50px;
  -webkit-user-select: none; user-select: none;
}
.wrap { max-width: 700px; margin: 0 auto; }

.head { text-align: center; padding: 12px 0 16px; }
.head h1 {
  font-size: 23px; font-weight: 800; letter-spacing: 3px;
  background: linear-gradient(90deg, #6ea8fe, #47e0a0, #f0b429);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.head .sub { font-size: 11.5px; color: #6b7488; margin-top: 7px; }

.stat { display: flex; gap: 7px; margin-bottom: 10px; }
.stat div {
  flex: 1; text-align: center; padding: 9px 5px;
  background: #161a21; border: 1px solid #262d3a; border-radius: 10px;
}
.stat b { display: block; font-size: 18px; font-weight: 800; margin-bottom: 2px; }
.stat span { font-size: 10.5px; color: #6b7488; }
.stat .u b { color: #6ea8fe; }
.stat .l b { color: #f0575c; }
.stat .f b { color: #8b93a1; }

.record {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 14px; margin-bottom: 18px;
  background: rgba(229,72,77,0.07); border: 1px solid rgba(229,72,77,0.28);
  border-radius: 11px; font-size: 12.5px;
}
.record .rt { color: #8b93a1; }
.record .rh { color: #ff5f6d; font-weight: 800; }
.record .rm { color: #6b7488; font-weight: 800; }
.record .rr { color: #47e0a0; font-weight: 700; }
.record .rn { color: #5a6272; font-size: 11px; }

.m-section { margin-bottom: 26px; }
.m-sectitle {
  font-size: 15px; font-weight: 700; color: #e8eaed;
  padding-left: 10px; position: relative; margin-bottom: 10px;
}
.m-sectitle::before {
  content: ''; position: absolute; left: 0; top: 3px;
  width: 4px; height: 15px; border-radius: 2px; background: #6ea8fe;
}
#sec-live .m-sectitle::before { background: #f0575c; }
#sec-finished .m-sectitle::before { background: #5a6272; }
.m-seccount { font-size: 11.5px; color: #6b7488; font-weight: 400; margin-left: 6px; }

.m-datehead {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #8b93a1;
  padding: 10px 3px 6px;
  border-bottom: 1px solid #1e2430; margin-bottom: 7px;
}
.m-week { color: #5a6272; }
.m-count { margin-left: auto; font-size: 10.5px; color: #454d5c; }

.m-card {
  background: #161a21; border: 1px solid #262d3a;
  border-radius: 11px; padding: 10px 13px; margin-bottom: 8px;
}
.m-card.win { border-color: rgba(229,72,77,0.45); background: rgba(229,72,77,0.06); }
.m-card.lose { opacity: 0.82; }

.m-top { display: flex; align-items: center; gap: 8px; font-size: 11px; margin-bottom: 8px; }
.m-league { color: #8b93a1; font-weight: 600; }
.m-time { color: #6b7488; font-family: Consolas, monospace; margin-left: auto; }
.m-minute {
  margin-left: auto; color: #f0575c; font-weight: 800;
  font-family: Consolas, monospace;
}

.m-teams { display: flex; align-items: center; gap: 9px; margin-bottom: 9px; }
.m-team { flex: 1; min-width: 0; font-size: 13.5px; color: #e8eaed; line-height: 1.4; word-break: break-word; }
.m-team.home { text-align: right; }
.m-team.away { text-align: left; }
.m-vs {
  flex-shrink: 0; min-width: 52px; text-align: center;
  font-size: 14px; font-weight: 700; color: #47e0a0;
  font-family: Consolas, monospace;
}
.m-vs.live { color: #f0575c; }

.m-odds {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: #8b93a1; margin-bottom: 5px;
  font-family: Consolas, monospace;
}
.m-ol { color: #5a6272; min-width: 30px; font-family: "Microsoft YaHei", sans-serif; font-size: 10.5px; }
.m-ov { padding: 1.5px 7px; border-radius: 5px; background: #0f1115; border: 1px solid #1e2430; }
.m-ov.on { background: rgba(71,224,160,0.13); border-color: rgba(71,224,160,0.4); color: #47e0a0; font-weight: 600; }

.m-reco {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 9px; padding-top: 9px;
  border-top: 1px dashed #262d3a; font-size: 12px;
}
.m-reco-pick { color: #c8cfda; }
.m-reco-pick b { color: #47e0a0; font-size: 14px; font-weight: 800; margin-left: 2px; }
.m-reco-conf { color: #8b93a1; font-size: 11px; }
.m-rb {
  font-size: 11.5px; font-weight: 800;
  padding: 2px 9px; border-radius: 6px;
}
.m-rb.hit {
  background: linear-gradient(180deg, #e5484d, #c0252a);
  color: #fff;
  box-shadow: 0 0 9px rgba(229,72,77,0.5);
}
.m-rb.miss { background: #1a1e26; color: #6b7488; border: 1px solid #3a4150; }
.m-reco-prob { margin-left: auto; display: flex; gap: 5px; }
.m-reco-prob i { font-style: normal; font-size: 10.5px; color: #5a6272; padding: 1.5px 6px; border-radius: 4px; background: #0f1115; }
.m-reco-prob i.on { color: #47e0a0; background: rgba(71,224,160,0.12); font-weight: 700; }

.foot {
  text-align: center; padding: 24px 14px 40px;
  font-size: 10.5px; color: #454d5c; line-height: 2;
}

@media (max-width: 520px) {
  .m-team { font-size: 13px; }
  .m-reco-prob { margin-left: 0; width: 100%; }
  .record { font-size: 11.5px; gap: 7px; }
}
</style>
</head>
<body>
<div class="wrap">

  <div class="head">
    <h1>足球推荐</h1>
    <div class="sub">更新时间 ${stamp}</div>
  </div>

  <div class="stat">
    <div class="u"><b>${st.upcoming || 0}</b><span>未开赛</span></div>
    <div class="l"><b>${st.live || 0}</b><span>进行中</span></div>
    <div class="f"><b>${st.finished || 0}</b><span>已完场</span></div>
  </div>

  ${st.settled ? `<div class="record">
    <span class="rt">完场战绩</span>
    <span class="rh">红 ${st.hit}</span>
    <span class="rm">黑 ${st.miss}</span>
    <span class="rr">命中率 ${st.rate}%</span>
    <span class="rn">（推荐胜负平比对最终比分）</span>
  </div>` : ''}

  ${bodyHtml}

  <div class="foot">
    本页面为只读分享版，仅供观看，无法修改。<br>
    推荐由博彩公司赔率反推概率得出，属市场共识换算，<br>
    不构成购彩建议。请理性参与，量力而行。
  </div>

</div>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');

console.log(`✅ 已生成：${OUT}`);
console.log(`   大小：${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`   比赛：${total} 场（未开赛 ${st.upcoming || 0} · 进行中 ${st.live || 0} · 完场 ${st.finished || 0}）`);
if (st.settled) console.log(`   完场战绩：红 ${st.hit} / 黑 ${st.miss}  命中率 ${st.rate}%`);
console.log(`   更新时间：${stamp}`);
