// ============================================================
//  update-draws-retry.mjs —— 「重试到今天该开的都抓到」外层循环
//
//  用户硬性要求：
//    「21点30分抓福彩的开奖号码，21点45分抓大乐透开奖号码，
//      必须直到今天开奖号码全部抓完，没开奖的不管，然后实时同步到云端」
//
//  本脚本就是那个「直到抓全」的外层循环：
//     抓一轮  →  检查「今天该开的」是否都有今天的开奖
//                ├─ 全都有了   → 立刻退出（不空等）
//                └─ 还有缺的   → 等 N 分钟 → 再抓一轮（最多 M 轮）
//
//  用法：
//    node update-draws-retry.mjs fucai            # 21:30 班：ssq fc3d qlc kl8
//    node update-draws-retry.mjs ticai            # 21:45 班：dlt pl3 pl5 qxc
//    node update-draws-retry.mjs fucai --once     # 只抓一轮，不重试（调试用）
//    node update-draws-retry.mjs fucai --plan     # 【自测】只判断+打印计划，不联网、不写文件
//    node update-draws-retry.mjs fucai --quiet    # 精简日志（.cmd 定时任务用这个）
//    node update-draws-retry.mjs fucai --today=2026-10-16   # 覆盖「今天」（自测用）
//
//  环境变量（覆盖重试参数，方便临时调整）：
//    DRAW_RETRY_MAX      最多抓几轮（默认 8：首次 + 最多 7 次重试）
//    DRAW_RETRY_WAIT_MS  每轮之间等多久（默认 300000 = 5 分钟）
//
//  ⚠️ 成本红线：本脚本【绝不传 --ai】，所以永远不会调用 DeepSeek。
//     build-draws.mjs 默认就是零 token 路径，--only 只抓本班的 4 个彩种。
//
//  ⚠️ 防封：不自己写请求间隔。抓取全部走 draw-sources.mjs 的
//     fetchTextRetry（每个源自带 1~2.5s 退避重试），
//     一轮 4 个彩种 × 最多 4 个源的自然间隔本来就 ≥ 3 秒；
//     轮与轮之间再等 5 分钟，同一个源绝不会被狂刷。
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { RULES, GAME_IDS } from './draw-sources.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;                       /* 复用当前 node（.cmd 传进来的是 runtime\node.exe） */
const OUT_JS = path.join(ROOT, 'draws.js');
const GAMES_JS = path.join(ROOT, 'games.js');

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const SHIFT = (argv.find((a) => a === 'fucai' || a === 'ticai') || '').toLowerCase();
const ONCE = argv.includes('--once');
const PLAN = argv.includes('--plan');
const QUIET = argv.includes('--quiet');
const argToday = (argv.find((a) => a.startsWith('--today=')) || '').slice('--today='.length);

/* 【重试参数】默认：每 5 分钟重试一轮，最多 8 轮（首次 + 最多 7 次重试）。
   21:30 开始 → 最晚约 22:05 收工；21:45 开始 → 最晚约 22:20 收工。
   为什么是 8 轮 / 35 分钟：
     全部抓到就【立刻退出】，所以轮数上限只在「一直没抓齐」时才起作用；
     8 轮能覆盖官网发布延迟（个别彩种/个别源会拖到 22:00 后）和源的短时抽风，
     又能在 02:00 全量班、以及足球 02:28 那班之前很久就结束，不跟别的任务抢。
     注意：「没开奖的不管」由 assessDay 的开奖日判断保证 ——
     不该开的彩种根本进不了 pending 列表，8 轮的等待不会因为它被白白拉长。 */
const MAX_ROUNDS = ONCE ? 1 : Math.max(1, Number(process.env.DRAW_RETRY_MAX || 8) | 0);
const WAIT_MS = Math.max(3000, Number(process.env.DRAW_RETRY_WAIT_MS || 5 * 60 * 1000) | 0);

const FUCAI_IDS = ['ssq', 'fc3d', 'qlc', 'kl8'];
const TICAI_IDS = ['dlt', 'pl3', 'pl5', 'qxc'];

if (!SHIFT) {
  console.error('用法：node update-draws-retry.mjs fucai|ticai [--once] [--plan] [--quiet] [--today=YYYY-MM-DD]');
  process.exit(2);
}

const MISSIONS = {
  fucai: { ids: FUCAI_IDS, time: '21:30', label: '福彩班' },
  ticai: { ids: TICAI_IDS, time: '21:45', label: '体彩班' }
};
const MISSION = MISSIONS[SHIFT];

const log = (...a) => console.log(...a);
const say = (...a) => { if (!QUIET) console.log(...a); };
const pad2 = (n) => String(n).padStart(2, '0');

/* ============================================================
   1. 日期工具（一律用本机本地时间，跟 Windows 任务计划一致）
   ============================================================ */
function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseYmd(s) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);  /* 中午，避免夏令时/时区边界 */
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 今天（YYYY-MM-DD）；--today= 只影响「今天」这个判断，不影响抓取 */
function todayStr() {
  if (argToday) {
    const d = parseYmd(argToday);
    if (!d) { console.error(`❌ --today=${argToday} 不是 YYYY-MM-DD`); process.exit(2); }
    return toDateStr(d);
  }
  return toDateStr(new Date());
}

/* ============================================================
   2. 「今天该不该开奖」的口径
   ------------------------------------------------------------
   第一口径（可靠时优先）：games.js 里每个彩种的 draw 字段。
     双色球「每周二、四、日」/ 大乐透「每周一、三、六」/
     七乐彩「每周一、三、五」/ 福彩3D、排列3、排列5、七星彩、
     快乐8「每天」—— 这份表来自官方规则，代码里本来就有，
     不用自己重新猜（七星彩经核实为「每天」开奖，不是旧规则的周二/五/日）。
   兜底口径（games.js 读不到时）：只有在 draws.js 里
     「上一期开奖日期离今天 ≥ 3 天」才当成不常开 → 不重试。
   局限：
     · games.js 的 draw 字段是人工维护的文案，赛制改了要跟着改；
     · 「今天该开」只按【日期】判断，不按具体开奖时刻，
       所以它不区分「已经过了开奖时间还没出」和「今天根本不开」——
       21:30 起步时这两者本来也无法从日期上区分，
       但重试上限只有 4 轮，误判的代价最多是 15 分钟的正常轮询。
     · 特殊/停开（节假日休市、临时调整）不在此表内，会当成该开 →
       白重试到上限后退出（不会写错数据）。
   ============================================================ */
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/* 【修正】原来写的是「周日/周一/…」（带周字），但 games.js 的文案是「每周二、五、日」——
     只有第一个带「周」，后面的「五、日」是单字，导致周五/周日永远匹配不到
     （七星彩周五被误判为不开奖）。改成单字：既匹配「周一」也匹配裸的「一」。 */
  const KEYS = ['日', '一', '二', '三', '四', '五', '六'];

function readGamesSchedule() {
  const out = {};
  let src = '';
  try { src = fs.readFileSync(GAMES_JS, 'utf8'); } catch { return null; }
  const idRe = /(\w+)\s*:\s*\{[\s\S]*?\n  \}/g;          /* games.js 里每个彩种一层缩进 */
  let m;
  while ((m = idRe.exec(src))) {
    const gid = m[1];
    if (GAME_IDS.indexOf(gid) < 0) continue;
    const d = /draw:\s*'([^']+)'/.exec(m[0]);
    if (d) out[gid] = d[1];
  }
  /* 必须 8 个彩种都读到，否则当成「没读到」，走兜底口径 */
  return GAME_IDS.every((g) => out[g]) ? out : null;
}

/** 解析 draw 文案 → {daily:boolean, days:number[]}；解析不了返回 null */
function parseSchedule(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (t.indexOf('每天') >= 0 || t.indexOf('每日') >= 0) return { daily: true, days: [0, 1, 2, 3, 4, 5, 6] };
  const days = [];
  for (let i = 0; i < KEYS.length; i++) if (t.indexOf(KEYS[i]) >= 0) days.push(i);
  return days.length ? { daily: false, days: days.slice().sort((a, b) => a - b) } : null;
}

function readSnapshot() {
  try {
    if (!fs.existsSync(OUT_JS)) return { games: {} };
    const src = fs.readFileSync(OUT_JS, 'utf8');
    const ctx = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math, RegExp });
    vm.runInContext(src + '\nglobalThis.__V = DRAW_DATA;', ctx, { filename: 'draws.js' });
    return ctx.__V || { games: {} };
  } catch (e) {
    return { games: {} };
  }
}

/**
 * 【核心判断】给定某一天，判断「该开的彩种是否都已经抓到那天的开奖」
 * @param {string[]} ids       本班彩种
 * @param {string}   dayStr    要判断的日期 YYYY-MM-DD（默认今天）
 * @param {boolean}  verbose   是否逐彩种打印
 * @param {object}  [gamesOverride] 自测用：假一份 draws.js 的 games 数据
 * @returns {{today:string, weekday:string, pending:Array, due:Array, scheduleOk:boolean}}
 */
function assessDay(ids, dayStr, verbose, gamesOverride) {
  const today = dayStr || todayStr();
  const t = parseYmd(today);
  const wd = t.getDay();
  const games = gamesOverride || (readSnapshot().games || {});
  const sched = readGamesSchedule();
  const isSched = !!sched;

  const pending = [];
  const due = [];

  for (const gid of ids) {
    const rule = RULES[gid] || {};
    const rec = games[gid] || {};
    const issue = rec.issue ? String(rec.issue) : '';
    const date = String(rec.date || '');
    const got = date === today;

    /* ---- 今天该开吗 ---- */
    let isDue; let why;
    const s = isSched ? parseSchedule(sched[gid]) : null;
    if (s) {
      isDue = s.days.indexOf(wd) >= 0;
      why = isDue ? `开奖日 ${sched[gid]}` : `今天（${WD[wd]}）不开奖：${sched[gid]}`;
    } else {
      /* 兜底：上一期离今天 ≥ 3 天 → 当它不常开；否则当作今天该开 */
      const prev = parseYmd(date);
      if (!prev) { isDue = true; why = '没有可靠开奖日表，且上一期日期缺失 → 按「该开」处理'; }
      else {
        const gap = Math.round((t - prev) / 86400000);
        if (gap >= 3) { isDue = false; why = `没有可靠开奖日表，但上一期是 ${date}（距今 ${gap} 天）→ 当它不常开`; }
        else { isDue = true; why = `没有可靠开奖日表，上一期 ${date}（距今 ${gap} 天）→ 继续重试`; }
      }
    }

    if (isDue) due.push({ gid, name: rule.name || gid, issue, date, got });
    if (isDue && !got) pending.push({ gid, name: rule.name || gid, issue, date, reason: why });

    if (verbose) {
      say(`  ${got ? '✅' : (isDue ? '⏳' : '⏭ ')} ${(rule.name || gid).padEnd(4, '　')} ` +
        `该开：${isDue ? '是' : '否'}　抓到 ${today}：${got ? '是' : '否'}　` +
        `最新 ${issue || '—'} / ${date || '—'}　（${why}）`);
    }
  }

  return { today, weekday: WD[wd], pending, due, scheduleOk: isSched };
}

/** 今天该开的彩种是否都抓到了今天（打印用） */
function assessToday(ids) {
  return assessDay(ids, null, true);
}

/** 打印「这一天的结果会怎么驱动循环」——把两种分支都摊开 */
function printPlanFor(a, tag) {
  if (a.pending.length === 0) {
    log(`  [${tag}] 该开 ${a.due.length} 个、全部已抓到 ${a.today} → 循环【立刻退出】：1 轮、0 次等待、0 分钟空等`);
    log(`  SELF_TEST ${tag}_planned=no ${tag}_rounds=1 ${tag}_sleepCount=0 ${tag}_totalWaitMs=0`);
  } else {
    log(`  [${tag}] 该开 ${a.due.length} 个、还差 ${a.pending.length} 个（${a.pending.map((p) => p.name).join('/')}）→ 会重试：${MAX_ROUNDS} 轮、等 ${MAX_ROUNDS - 1} 次 × ${(WAIT_MS / 60000).toFixed(1)} 分钟 = ${((MAX_ROUNDS - 1) * WAIT_MS / 60000).toFixed(0)} 分钟上限`);
    log(`  SELF_TEST ${tag}_planned=yes ${tag}_rounds=${MAX_ROUNDS} ${tag}_sleepCount=${MAX_ROUNDS - 1} ${tag}_totalWaitMs=${(MAX_ROUNDS - 1) * WAIT_MS}`);
  }
}

/* ============================================================
   3. 单轮流程：抓 → 生成 → 导出 → 同步云端
   ============================================================ */
function runNode(script, args, opts = {}) {
  const p = path.join(ROOT, script);
  if (!fs.existsSync(p)) { log(`  ⚠️  找不到 ${script}，跳过`); return 0; }
  const r = spawnSync(NODE, [p, ...(args || [])], { cwd: opts.cwd || ROOT, stdio: 'inherit' });
  if (r.error) { log(`  ⚠️  ${script} 启动失败：${r.error.message}`); return 1; }
  return r.status === null ? 1 : r.status;
}

function runCloudSync() {
  const p = path.join(ROOT, 'cloud', 'sync-cloud.mjs');
  if (!fs.existsSync(p)) { log('  ⚠️  找不到 cloud/sync-cloud.mjs，跳过云端同步'); return 1; }
  const r = spawnSync(NODE, [p], { cwd: path.join(ROOT, 'cloud'), stdio: 'inherit' });
  return r.status === null ? 1 : r.status;
}

/** 一轮完整的「抓 + 生成 + 同步」；返回这一轮实际抓到的结果 */
function oneRound(round) {
  log('');
  log(`──────── 第 ${round} / ${MAX_ROUNDS} 轮（${MISSION.label} ${SHIFT}）────────`);
  runNode('build-draws.mjs', [`--only=${SHIFT}`]);      /* 绝不加 --ai：零 token */
  runNode('build-history.mjs', []);
  runNode('export-static.mjs', []);
  runNode('export-football.mjs', []);
  runNode('export-site.mjs', []);
  runNode('export-cloud-tickets.mjs', []);
  const sync = runCloudSync();
  log(sync === 0 ? '  ☁️  云端同步完成' : `  ⚠️  云端同步返回 ${sync}（继续，下一轮还会再同步一次）`);
}

/* ============================================================
   4. 主循环
   ============================================================ */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const startWall = Date.now();
  const today = todayStr();
  /* --today=YYYY-MM-DD 时按那一天判断（自测用：指定一个「那天该开的都已经抓到」的日子，
     就能验证「抓齐了 → 立刻退出」这条路，不用等真实开奖） */
  const dayOverride = argToday ? today : null;

  log('════════════════════════════════════════════════════════');
  log(`  开奖抓取重试循环 · ${MISSION.label}（每天 ${MISSION.time}）`);
  log(`  本班彩种：${MISSION.ids.map((g) => `${RULES[g] ? RULES[g].name : g}(${g})`).join(' / ')}`);
  log(`  今天：${today}　常规：抓一轮 → 检查 → 没抓齐就每 ${(WAIT_MS / 60000).toFixed(1)} 分钟再抓 → 最多 ${MAX_ROUNDS} 轮`);
  log(`  上限用时：约 ${((MAX_ROUNDS - 1) * WAIT_MS / 60000).toFixed(0)} 分钟（全抓到就立刻退出）`);
  log('════════════════════════════════════════════════════════');

  /* ---------- 自测模式：只判断 + 打印计划，不联网、不写文件 ---------- */
  if (PLAN) {
    log('');
    log('【--plan 自测模式】只做判断，不联网、不写文件');
    log(`  ── 第 1 轮检查（真实数据 ${path.basename(OUT_JS)} / 开奖日表来自 ${path.basename(GAMES_JS)}）──`);
    const a1 = assessToday(MISSION.ids);
    log('');
    log(`  今天该开奖的彩种：${a1.due.length ? a1.due.map((d) => d.name).join(' / ') : '（无）'}`);
    log(`  还没抓到今天的：  ${a1.pending.length ? a1.pending.map((p) => p.name).join(' / ') : '（无）'}`);
    log(`  SELF_TEST date=${a1.today} weekday=${a1.weekday} scheduleTable=${a1.scheduleOk ? 'games.js' : 'fallback'}`);
    log('');
    printPlanFor(a1, 'real');

    /* ── 对照实验（不联网、不写文件）──
       draws.js 里只存每个彩种的【最新一期】，所以不能靠查历史日期来模拟，
       直接造一份「今天该开的都已经抓到今天」的假快照，喂给同一个判断函数，
       验证「抓齐了 → 立刻退出、不空等」这条路。 */
    const realGames = readSnapshot().games || {};
    const fakeCaught = {};
    for (const gid of GAME_IDS) {
      const rec = realGames[gid] || {};
      fakeCaught[gid] = { issue: rec.issue || '', date: a1.today, source: rec.source || '', areas: rec.areas || {} };
    }
    const a2 = assessDay(MISSION.ids, a1.today, false, fakeCaught);
    log('');
    log(`【对照实验】假快照：本班 4 个彩种的最新开奖日期都写成 ${a1.today}（模拟已抓齐）`);
    printPlanFor(a2, 'caught');

    /* 另一个方向的对照：假快照里今天该开的都没有今天的日期（模拟一个都没抓到） */
    const fakeNone = {};
    for (const gid of GAME_IDS) {
      const rec = realGames[gid] || {};
      fakeNone[gid] = { issue: rec.issue || '', date: '2026-01-01', source: rec.source || '', areas: rec.areas || {} };
    }
    const a3 = assessDay(MISSION.ids, a1.today, false, fakeNone);
    log('');
    log('【对照实验】假快照：最新开奖日期全写成 2026-01-01（模拟一个都没抓到）');
    printPlanFor(a3, 'none');
    return 0;
  }

  /* ---------- 正常模式 ---------- */
  let lastPending = null;
  let outOfRounds = false;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    oneRound(round);

    log('');
    log(`── 第 ${round} 轮检查：今天该开的都抓到了吗 ──`);
    const a = assessDay(MISSION.ids, dayOverride, true);
    lastPending = a.pending;

    if (a.pending.length === 0) {
      const total = Math.round((Date.now() - startWall) / 1000);
      log('');
      log(`✅ 今天（${a.today} ${a.weekday}）该开的 ${a.due.length} 个彩种已全部抓到；` +
        `${MISSION.ids.length - a.due.length} 个今天不开奖，按「没开奖的不管」跳过。`);
      log(`   用时 ${(total / 60).toFixed(1)} 分钟（${round} 轮），已实时同步云端。退出。`);
      return 0;
    }

    log(`⏳ 还差 ${a.pending.length} 个：${a.pending.map((p) => p.name).join(' / ')}` +
      `（最新分别是 ${a.pending.map((p) => p.date || '—').join(' / ')}）`);

    if (round === MAX_ROUNDS) { outOfRounds = true; break; }

    const mins = (WAIT_MS / 60000).toFixed(1);
    log(`   → ${mins} 分钟后重试（第 ${round + 1} / ${MAX_ROUNDS} 轮）…`);
    await sleep(WAIT_MS);
  }

  if (outOfRounds) {
    log('');
    log(`⚠️  已重试到上限（${MAX_ROUNDS} 轮 / 约 ${((MAX_ROUNDS - 1) * WAIT_MS / 60000).toFixed(0)} 分钟），` +
      `仍有彩种没抓到今天的开奖：`);
    for (const p of (lastPending || [])) log(`     · ${p.name}（${p.gid}）最新 ${p.date || '—'}${p.issue ? ' 第 ' + p.issue + ' 期' : ''}`);
    log('   可能是：官网尚未发布 / 数据源临时故障 / 今天其实休市。旧值没有被覆盖，页面仍显示上一期。');
    log('   下一次机会：明天 21:30 / 21:45 的定时任务，以及 02:00 的全量班。');
    return 0;   /* 不算失败：保留旧值不是错误，别让任务计划报红 */
  }
  return 0;
}

main().catch((e) => {
  console.error('❌ update-draws-retry.mjs 出错了：', e && e.message ? e.message : e);
  process.exit(1);
});
