// ============================================================
//  build-football.mjs —— 抓取足球赛事（进行中 + 已完场）
//
//  数据源：245qq 公开接口（new-jiko.sukeku.com）
//    /api/Game/GetSingleList   未开赛
//    /api/Game/GetRunballList  进行中（带实时比分）
//    /api/Game/GetFinishList   已完场（带最终比分）
//
//  产物：football.js → const FOOTBALL_DATA = {...}
//  用法：node build-football.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_JS = path.join(ROOT, 'football.js');

const BASE = 'https://new-jiko.sukeku.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const log = (...a) => console.log(...a);

/* ---------- 请求（带 lang=zh 拿中文队名）---------- */
async function api(pathName) {
  const qs = '?lang=zh';
  try {
    const res = await fetch(BASE + pathName + qs, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Origin': 'https://m.245qq.com',
        'Referer': 'https://m.245qq.com/'
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const j = await res.json();
    return { ok: true, json: j };
  } catch (e) {
    return { ok: false, error: e.cause?.code || e.message };
  }
}

/* ---------- 赔率解析 ----------
   数组字段顺序（实测）：
     亚盘   ["1.05", "平手/半球", "0.75"]  主水位 / 盘口 / 客水位
     欧赔   [2.35, 3.75, 2.7]             主胜 / 平局 / 客胜
     大小球 [0.92, "3", 0.92]             盘口 / 大球 / 小球
--------------------------------- */
function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseOdds(oddsArr) {
  const by = {};
  (oddsArr || []).forEach((o) => { if (o && o.code) by[o.code] = o.values || []; });

  return {
    asian: {
      open: by['001'] ? { home: num(by['001'][0]), line: by['001'][1], away: num(by['001'][2]) } : null,
      live: by['002'] ? { home: num(by['002'][0]), line: by['002'][1], away: num(by['002'][2]) } : null
    },
    overunder: {
      open: by['003'] ? { line: by['003'][0], over: num(by['003'][1]), under: num(by['003'][2]) } : null,
      live: by['004'] ? { line: by['004'][0], over: num(by['004'][1]), under: num(by['004'][2]) } : null
    },
    europe: {
      open: by['005'] ? { home: num(by['005'][0]), draw: num(by['005'][1]), away: num(by['005'][2]) } : null,
      live: by['006'] ? { home: num(by['006'][0]), draw: num(by['006'][1]), away: num(by['006'][2]) } : null
    }
  };
}

/* ---------- 推荐胜负平（赔率反推）---------- */
function calcReco(odds) {
  const eu = odds && odds.europe;
  const src = eu && (eu.live || eu.open);
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

  return {
    pick,
    label: { home: '主胜', draw: '平局', away: '客胜' }[pick],
    confidence: conf,
    prob,
    clear: conf >= 45,
    margin: +((sum - 1) * 100).toFixed(1)
  };
}

/* ---------- 整理一场 ---------- */
function normalize(g, kind) {
  const odds = parseOdds(g.Odds);
  const hs = g.T1 ? g.T1.S : null;
  const as_ = g.T2 ? g.T2.S : null;
  const hasScore = hs !== null && hs !== undefined && as_ !== null && as_ !== undefined;

  let actual = null;
  if (hasScore) actual = hs > as_ ? 'home' : (hs === as_ ? 'draw' : 'away');

  const reco = calcReco(odds);

  return {
    gid: g.GID,
    kind,                                   // upcoming / live / finished
    league: g.L ? { name: g.L.N, color: g.L.C } : null,
    time: g.DT || '',
    minute: g.TS || 0,
    home: g.T1 ? { name: g.T1.N, score: hasScore ? hs : null, red: g.T1.RC, rank: g.T1.RK } : null,
    away: g.T2 ? { name: g.T2.N, score: hasScore ? as_ : null, red: g.T2.RC, rank: g.T2.RK } : null,
    odds,
    reco,
    // 结果判定：命中 = 红，未中 = 黑
    result: (reco && actual)
      ? {
          actual,
          actualLabel: { home: '主胜', draw: '平局', away: '客胜' }[actual],
          hit: actual === reco.pick,
          score: `${hs} - ${as_}`
        }
      : null
  };
}

/* ---------- 主流程 ---------- */
async function main() {
  log('════════════════════════════════════════════');
  log('  春风十里送大奖 · 足球赛事抓取');
  log('════════════════════════════════════════════\n');

  const kinds = [
    ['upcoming', '/api/Game/GetSingleList', '未开赛'],
    ['live',     '/api/Game/GetRunballList', '进行中'],
    ['finished', '/api/Game/GetFinishList', '已完场']
  ];

  const lists = {};
  for (const [key, pathName, label] of kinds) {
    const r = await api(pathName);
    if (!r.ok || !Array.isArray(r.json)) {
      log(`  ❌ ${label}：${r.error || '格式不对'}`);
      lists[key] = [];
      continue;
    }
    const games = r.json.map((g) => normalize(g, key));
    lists[key] = games;
    const withScore = games.filter((g) => g.result).length;
    const hit = games.filter((g) => g.result && g.result.hit).length;
    log(`  ✅ ${label.padEnd(4)} ${String(games.length).padStart(3)} 场` +
        (withScore ? `  有比分 ${withScore} · 推荐命中 ${hit}` : ''));
  }

  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

  const stat = {
    upcoming: lists.upcoming.length,
    live: lists.live.length,
    finished: lists.finished.length,
    total: lists.upcoming.length + lists.live.length + lists.finished.length
  };

  // 完场战绩统计
  const fin = lists.finished.filter((g) => g.result);
  stat.settled = fin.length;
  stat.hit = fin.filter((g) => g.result.hit).length;
  stat.miss = fin.length - stat.hit;
  stat.rate = fin.length ? +(stat.hit / fin.length * 100).toFixed(1) : 0;

  const js = `/* 自动生成，请勿手动编辑 · ${stamp} */\n` +
    `const FOOTBALL_DATA = ${JSON.stringify({ updated: stamp, stat, lists }, null, 1)};\n`;

  fs.writeFileSync(OUT_JS, js, 'utf8');

  log(`\n✅ 已写入 ${OUT_JS}`);
  log(`   共 ${stat.total} 场（未开赛 ${stat.upcoming} · 进行中 ${stat.live} · 完场 ${stat.finished}）`);
  if (stat.settled) {
    log(`   完场战绩：红 ${stat.hit} / 黑 ${stat.miss}  命中率 ${stat.rate}%`);
  }
  log(`   ${stamp}`);
}

main().catch((e) => {
  console.error('\n❌ 出错了：', e.message);
  process.exit(1);
});
