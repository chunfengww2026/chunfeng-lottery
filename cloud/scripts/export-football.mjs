// ============================================================
//  export-football.mjs —— 生成足球只读分享页（只显示竞猜场次）
//
//  产物：足球推荐.html —— 自包含单文件，发出去只能看
//
//  【数据源】jc-data.js —— 体彩竞彩在售比赛
//    这是官方竞彩场次，每天 10~20 场，看得过来。
//    之前的 football.js 有 168 场（全世界各种联赛），
//    太多而且大部分不能买，已改为只显示竞彩场次。
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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, '足球推荐.html');

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

/* football.js 用来补充实时比分（可选） */
const FB = loadVar('football.js', 'FOOTBALL_DATA');

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

/* 繁简 + 简写对照 */
const ALIAS = {
  '米堡': '米德尔斯堡', '莱红牛': '莱比锡红牛', '拜仁': '拜仁慕尼黑',
  '巴萨': '巴塞罗那', '马竞': '马德里竞技', '曼联': '曼彻斯特联',
  '那不勒斯': '拿玻里', '比利亚雷': '比利亚雷亚尔', '加拉塔萨': '加拉塔萨雷',
  '埃因霍温': 'PSV埃因霍温', '里斯本': '葡萄牙体育', '国米': '国际米兰',
  '纽喷气机': '纽卡斯尔喷气机', '圣日耳曼': '巴黎圣日尔曼'
};

/* 繁体 → 简体（队名常见字） */
const TRAD = {
  '溫': '温', '爾': '尔', '蘭': '兰', '維': '维', '薩': '萨', '羅': '罗',
  '馬': '马', '德': '德', '聯': '联', '競': '竞', '體': '体', '門': '门',
  '興': '兴', '達': '达', '萊': '莱', '錫': '锡', '圖': '图', '倫': '伦',
  '佈': '布', '雷': '雷', '斯': '斯', '頓': '顿', '漢': '汉', '堡': '堡'
};

function toSimp(s) {
  return String(s || '').replace(/[\u4e00-\u9fa5]/g, (ch) => TRAD[ch] || ch);
}

function norm(s) {
  return toSimp(String(s || ''))
    .replace(/[\s\-·.()（）]/g, '')
    .replace(/(足球俱乐部|俱乐部|足球队|后备队|预备队|青年队|女足|U\d+|FC|SC|CF|AC|BK|IF|FK|SV|SK|CS)/gi, '')
    .toLowerCase();
}

function expand(n) {
  const t = ALIAS[String(n || '').trim()];
  return t ? norm(t) : norm(n);
}

function sameTeam(a, b) {
  const x = expand(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))) return true;
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

function prep(g) {
  const fb = findFb(g);

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
    odds: g.odds, reco: g.reco, kind, hasScore, hs, as, result
  };
}

const MATCHES = JC.games.map(prep);

/* ---------- 统计 ---------- */
const stat = {
  total: MATCHES.length,
  upcoming: MATCHES.filter((m) => m.kind === 'upcoming').length,
  live: MATCHES.filter((m) => m.kind === 'live').length,
  finished: MATCHES.filter((m) => m.kind === 'finished').length,
  settled: 0, hit: 0, miss: 0
};
MATCHES.forEach((m) => {
  if (m.kind === 'finished' && m.result) {
    stat.settled++;
    if (m.result.hit) stat.hit++; else stat.miss++;
  }
});
stat.rate = stat.settled ? ((stat.hit / stat.settled) * 100).toFixed(1) : '0.0';

const recoDist = { home: 0, draw: 0, away: 0, none: 0 };
MATCHES.forEach((m) => { if (m.reco) recoDist[m.reco.pick]++; else recoDist.none++; });

/* ---------- 渲染 ---------- */
function oddsRow(label, v, pickKey) {
  if (!v) return '';
  const cell = (txt, on) => (txt === null || txt === undefined || txt === '')
    ? '' : `<span class="m-ov${on ? ' on' : ''}">${esc(txt)}</span>`;
  return `<div class="m-odds"><span class="m-ol">${label}</span>${cell(v.a, false)}${cell(v.b, pickKey === 'b')}${cell(v.c, pickKey === 'c')}</div>`;
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

  return (
    `<div class="m-card${m.result && m.result.settled ? (m.result.hit ? ' win' : ' lose') : ''}">` +
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
      `<i class="${r.pick === 'home' ? 'on' : ''}">主${r.prob.home}%</i>` +
      `<i class="${r.pick === 'draw' ? 'on' : ''}">平${r.prob.draw}%</i>` +
      `<i class="${r.pick === 'away' ? 'on' : ''}">客${r.prob.away}%</i>` +
      `</span></div>` : '<div class="m-reco"><span class="m-noodds">暂无赔率</span></div>') +
    `</div>`
  );
}

/* 分组 */
const order = [['upcoming', '未开赛'], ['live', '进行中'], ['finished', '已完场']];
let cards = '';
order.forEach(([kind, label]) => {
  const arr = MATCHES.filter((m) => m.kind === kind);
  if (!arr.length) return;
  if (kind === 'finished') arr.sort((a, b) => String(b.time).localeCompare(String(a.time)));
  else arr.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  cards += `<div class="m-subhead">${label}<span class="m-subcount">${arr.length} 场</span></div>`;
  arr.forEach((m) => { cards += renderMatch(m); });
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
.m-subcount { font-size: 11.5px; color: #6b7488; font-weight: 400;
  background: #1b212b; padding: 2px 8px; border-radius: 20px; }
.m-card { background: #161a21; border: 1px solid #232a36; border-left: 3px solid #2b3550;
  border-radius: 11px; padding: 12px 14px; margin-bottom: 10px; }
.m-card.win { border-left-color: #f0575c; }
.m-card.lose { border-left-color: #4a5160; }
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
.m-probs { margin-left: auto; display: flex; gap: 5px; }
.m-probs i { font-style: normal; font-size: 11px; color: #6b7488;
  background: #1b212b; padding: 2px 7px; border-radius: 4px; }
.m-probs i.on { color: #47e0a0; background: rgba(71,224,160,0.14); font-weight: 700; }
.m-noodds { font-size: 12px; color: #5a6272; }
.note { margin-top: 22px; padding: 13px 15px; background: #14171d;
  border: 1px solid #1e2430; border-radius: 10px; font-size: 11.5px;
  color: #6b7488; line-height: 1.9; }
.brand { margin-top: 22px; text-align: center; font-size: 12.5px; color: #f0575c; }
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
  <div class="sub">体彩竞彩在售 ${stat.total} 场 · 更新于 ${esc(JC.updated || '')}</div>

  <div class="stat">
    <div><b>${recoDist.home}</b><span>推荐主胜</span></div>
    <div><b>${recoDist.draw}</b><span>推荐平局</span></div>
    <div><b>${recoDist.away}</b><span>推荐客胜</span></div>
  </div>

  ${stat.settled ? `<div class="record">
    <span class="t">完场战绩</span>
    <span class="h">红 ${stat.hit}</span>
    <span class="m">黑 ${stat.miss}</span>
    <span class="r">命中率 ${stat.rate}%</span>
    <span class="n">（推荐胜负平比对最终比分）</span>
  </div>` : ''}

  ${cards}

  <div class="note">
    <div class="note-title" style="font-size:13.5px;font-weight:700;letter-spacing:1px;margin-bottom:6px;">免责声明</div>
    · 本页只显示<b>体彩竞彩在售</b>比赛，其他联赛不显示。<br>
    · 推荐由博彩公司赔率反推概率得出（市场共识换算），属统计归纳，<b>不是预测</b>。<br>
    · 彩票每期独立随机，任何分析都不能提高中奖概率。本页不构成购彩建议。<br>
    · 未满 18 周岁禁止购买彩票。
  </div>

  <div class="brand">— 小晴推荐官 · 仅供参考 —</div>
</div>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');

console.log('✅ 已生成：' + OUT);
console.log(`   大小：${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`   竞彩场次：${stat.total} 场（未开赛 ${stat.upcoming} · 进行中 ${stat.live} · 完场 ${stat.finished}）`);
if (stat.settled) console.log(`   完场战绩：红 ${stat.hit} / 黑 ${stat.miss}  命中率 ${stat.rate}%`);
console.log(`   数据来源：jc-data.js（体彩竞彩在售）`);
