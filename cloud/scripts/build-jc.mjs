// ============================================================
//  build-jc.mjs —— 抓取体彩「竞彩」在售比赛 + 赔率
//
//  数据源（全部 500.com 自家，无需队名配对）：
//    live.500.com/jczq.php          竞彩在售列表（含竞彩编号、fid）
//    live.500.com/json/odds.php     欧赔/亚盘/大小球（初盘 + 即时）
//
//  产物：jc-data.js  →  const JC_DATA = {...}
//  用法：node build-jc.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'jc-data.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

const log = (...a) => console.log(...a);

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
    rqLine: rqHint
  };
}

/* ============================================================
   主流程
   ============================================================ */
async function main() {
  log('════════════════════════════════════════════');
  log('  春风十里送大奖 · 竞彩在售比赛抓取');
  log('════════════════════════════════════════════\n');

  log('【1/3】竞彩在售列表');
  const list = await fetchJcList();
  if (!list.length) { log('  ❌ 未取到竞彩列表'); process.exit(1); }
  log(`  ✅ ${list.length} 场在售`);

  log('\n【2/3】抓实时比分（未开赛/进行中/完场）');
  const scores = await fetchScores();
  log(`  ✅ 取到 ${scores.size} 场的状态与比分`);

  log('\n【3/3】逐场抓赔率并合并比分');
  const games = [];
  let okOdds = 0;
  let withScore = 0;

  for (const g of list) {
    let odds = null;
    if (g.fid) {
      odds = await fetchOdds(g.fid);
      await new Promise((r) => setTimeout(r, 200));
    }
    const reco = calcReco(odds);
    if (reco) okOdds++;

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

    if (hs !== null && hs !== undefined) withScore++;

    const eu = odds && odds.europe && (odds.europe.live || odds.europe.open);
    const euTxt = eu ? `欧赔 ${eu.home}/${eu.draw}/${eu.away}` : '无欧赔';
    const scoreTxt = (hs !== null && hs !== undefined) ? `  ${hs}-${as_}` : '';
    const stTxt = { upcoming: '未开赛', live: `进行中${minute ? ' ' + minute + "'" : ''}`, finished: '完场' }[status];

    log(`  ✅ ${g.code} ${g.time.slice(5)} [${g.league}] ${g.home.name} vs ${g.away.name}`);
    log(`       ${euTxt}  ${reco ? '→ ' + reco.label + ' ' + reco.confidence + '%' : ''}  [${stTxt}${scoreTxt}]`);

    games.push(Object.assign({}, g, {
      odds,
      reco,
      status,
      minute,
      liveScore: (hs !== null && hs !== undefined) ? { home: hs, away: as_ } : null
    }));
  }

  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

  const stat = {
    total: games.length,
    upcoming: games.filter((g) => g.status === 'upcoming').length,
    live: games.filter((g) => g.status === 'live').length,
    finished: games.filter((g) => g.status === 'finished').length,
    withScore
  };

  const js = `/* 自动生成，请勿手动编辑 · ${stamp} */\n` +
    `const JC_DATA = ${JSON.stringify({ updated: stamp, stat, games }, null, 1)};\n`;

  fs.writeFileSync(OUT, js, 'utf8');

  log(`\n✅ 已写入 ${OUT}`);
  log(`   ${stat.total} 场在售 · ${okOdds} 场有赔率 · ${withScore} 场有比分`);
  log(`   未开赛 ${stat.upcoming} · 进行中 ${stat.live} · 完场 ${stat.finished}`);
  log(`   ${stamp}`);
}

main().catch((e) => {
  console.error('\n❌ 出错：', e.message);
  process.exit(1);
});
