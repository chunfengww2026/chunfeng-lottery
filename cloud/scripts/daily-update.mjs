// ============================================================
//  daily-update.mjs —— 每天凌晨 2 点自动更新（计划任务调用）
//
//  流程：
//    1. 抓最新开奖号码
//    2. 抓足球赛事 + 赔率
//    3. 抓竞彩在售
//    4. 抓奖级奖金
//    5. 归档已开奖的期次（保留 30 期）
//    6. 检查本期号码是否存在（默认不摇号，保护已推送的号）
//    7. 重新生成所有分享页
//
//  用法：
//    node daily-update.mjs           完整执行
//    node daily-update.mjs --check   只看会做什么
//    node daily-update.mjs --roll    允许自动摇号（会改号，慎用）
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(ROOT, '_daily-update.log');

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const FORCE = argv.includes('--force');

/* 【重要】默认【不摇号】。
   自动更新只刷新开奖数据与足球，绝不改推荐号码 ——
   否则推送出去的号码会变，开奖后中奖栏就对不上了。
   只有手工加 --roll 参数时才摇号。 */
const ALLOW_ROLL = argv.includes('--roll');

/* ---------- 日志 ---------- */
function log(...a) {
  const msg = a.join(' ');
  console.log(msg);
  try { fs.appendFileSync(LOG, msg + '\n', 'utf8'); } catch (e) { /* 忽略 */ }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ---------- 跑子脚本 ---------- */
function run(file, args) {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) { log(`  ⚠️ 找不到 ${file}`); return false; }
  log(`  ▶ ${file} ${(args || []).join(' ')}`);
  try {
    const out = execFileSync(process.execPath, [fp, ...(args || [])], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000
    });
    out.split('\n')
      .filter((l) => /✅|❌|⚠️|写入|期|场/.test(l))
      .slice(0, 14)
      .forEach((l) => log('      ' + l.trim()));
    return true;
  } catch (e) {
    log(`  ❌ ${file} 失败：${String(e.message).slice(0, 220)}`);
    return false;
  }
}

/* ---------- 迷你 DOM（给摇号用） ---------- */
function makeDom() {
  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = []; this.attrs = {}; this._text = ''; this._html = null;
      this.className = ''; this.dataset = {};
      this.style = { cssText: '' };
    }
    set textContent(v) { this._text = String(v); this.children = []; this._html = null; }
    get textContent() { return this._html ? this._html.replace(/<[^>]*>/g, '') : this._text; }
    set innerHTML(v) { this._html = String(v); this.children = []; }
    get innerHTML() { return this._html !== null ? this._html : ''; }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }
  return {
    createElement: (t) => new El(t),
    createTextNode: (t) => { const e = new El('#text'); e.textContent = t; return e; },
    addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => []
  };
}

/* ---------- 沙箱里跑：归档 + 判断是否需要摇号 ---------- */
function inspect() {
  const store = new Map();

  // 把磁盘上的存档塞进去
  const savedPath = path.join(ROOT, 'saved-tickets.js');
  let saved = { tickets: {} };
  if (fs.existsSync(savedPath)) {
    try {
      const c = vm.createContext({ console, Object, Array, String, Number, Date, Math, JSON });
      vm.runInContext(fs.readFileSync(savedPath, 'utf8') + '\nglobalThis.__S = SAVED_TICKETS;', c);
      saved = c.__S || saved;
    } catch (e) { log(`  ⚠️ 存档解析失败：${e.message}`); }
  }
  if (saved.tickets && Object.keys(saved.tickets).length) {
    store.set('cdd.tickets.v1', JSON.stringify(saved.tickets));
  }

  /* 【资料优先】把 materials-data.js 里的资料塞进 localStorage（cdd.materials.v1）。
     为什么：用户在 App「资料」页录入的内容（如「红球：01 02 03」「红球杀号 04 05」）
     会存到这个文件里。摇号时 poolCandidates() 的优先级是
     【资料 > 专家池 > 原算法】—— 但那个优先级只在 materialsFor() 能取到资料时才生效。
     以前这里【没有】塞资料，所以凌晨 2 点的强制重摇完全忽略用户录入的内容，
     出号等于没用他的逻辑（实测确认过）。现在和 roll-and-export.mjs 保持一致。 */
  const matPath = path.join(ROOT, 'materials-data.js');
  if (fs.existsSync(matPath)) {
    try {
      const mc = vm.createContext({ console, Object, Array, String, Number, Date, Math, JSON });
      vm.runInContext(fs.readFileSync(matPath, 'utf8') + '\nglobalThis.__M = (typeof MATERIALS_DATA !== "undefined" ? MATERIALS_DATA : null);', mc);
      const md = mc.__M;
      if (md && Array.isArray(md.list) && md.list.length) {
        store.set('cdd.materials.v1', JSON.stringify(md.list));
        log(`  📋 资料已载入沙箱：${md.list.length} 条（出号时会优先遵守）`);
      } else {
        log('  📋 资料库是空的（没有录入内容，出号走专家池/原算法）');
      }
    } catch (e) { log(`  ⚠️ 资料解析失败（不影响出号）：${e.message}`); }
  }

  const ctx = vm.createContext({
    console, Math, Map, Set, Array, Object, String, Number, JSON, Date,
    parseInt, parseFloat, isNaN, Uint32Array, RegExp, Error, Infinity,
    document: makeDom(),
    window: { addEventListener: () => {}, crypto: globalThis.crypto },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    Image: function () {}, ClipboardItem: function () {}, alert: () => {}, confirm: () => true
  });

  const FILES = ['games.js', 'draws.js', 'history.js', 'draw-data.js', 'algo.js',
                 'stats.js', 'templates.js', 'experts-data.js', 'expert-pool.js',
                 'ticket-store.js', 'saved-tickets.js',
                 'render.js', 'data-store.js', 'prize-data.js', 'hit-check.js',
                 'heatmap-data.js', 'materials-data.js'];   // 实票统计热力图（按天出）
  for (const f of FILES) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }
    catch (e) { log(`  ⚠️ 加载 ${f} 失败：${e.message}`); }
  }

  vm.runInContext(`
    globalThis.__archive = archiveFinished;
    globalThis.__roll = rollAllGames;
    globalThis.__load = loadTickets;
    globalThis.__all = allPeriodsOf;
    globalThis.__wins = getWinRows;
    globalThis.__T = TEMPLATES;
    globalThis.__nextIssue = nextIssueFor;
    globalThis.__nextDate = nextDrawDate;
  `, ctx);

  // 1. 归档
  const arch = ctx.__archive();
  log(`  归档：新增 ${arch.archived} 期，保留 ${arch.kept} 个彩种，裁掉 ${arch.trimmed} 期`);

  // 2. 检查每个彩种本期有没有号码
  const missing = [];
  Object.keys(ctx.__T).forEach((gid) => {
    let need = true;
    try {
      const periods = ctx.__all(gid);
      const cur = periods.find((p) => !p.draw);
      if (cur && cur.images && Object.keys(cur.images).length) need = false;
    } catch (e) { /* 视为需要 */ }
    if (need) missing.push(gid);
  });

  return { ctx, store, missing, savedPath, arch };
}

/* ---------- 主流程 ---------- */
function main() {
  log('');
  log('════════════════════════════════════════════');
  log(`  每日自动更新 · ${stamp()}`);
  log('════════════════════════════════════════════');

  /* 1. 抓数据 */
  log('\n【1/5】抓开奖号码');
  if (!CHECK_ONLY) run('build-draws.mjs', []);
  else log('  （--check 跳过）');

  log('\n【2/5】抓历史开奖（60 期）');
  if (!CHECK_ONLY) run('build-history.mjs', ['60']);
  else log('  （--check 跳过）');

  log('\n【3/5】抓足球 + 竞彩 + 奖级');
  if (!CHECK_ONLY) {
    run('build-football.mjs', ['all']);
    run('build-jc.mjs', []);
    run('build-prizes.mjs', []);
  } else log('  （--check 跳过）');

  /* 3.5 实票统计热力图（按天出）
     【说明】这一步【不依赖】网络是否成功：
       · 今天不是双色球/大乐透开奖日 → 脚本自己跳过，页面上不会出现这张图
       · 是开奖日 → 抓一起彩晒票；抓不到就用「近 30 期开奖频率」兜底并标注来源
     真正的「开奖当日 18:00 出图」由云端负责（.github/workflows/daily-update.yml
     里的 cron '0 10 * * *'）；本机这一步只是让开机时也能出。 */
  log('\n【3.5/5】实票统计热力图（按天出）');
  if (!CHECK_ONLY) {
    run('build-heatmap.mjs', []);
  } else log('  （--check 跳过）');

  /* 3.6 【专家数据】抓 一起彩 的专家推荐（三胆/杀号/共识百分比等）
     ============================================================
     为什么必须有这一步：
       出号的组合逻辑是「抓专家数据 → 按共识百分比组号」——
       号码池的内容直接来自 experts-data.js 里的 pool.red / pool.blue。
       但这一步以前【没有】放进 2 点的流程里，导致：
         · experts-data.js 一直停在第一次抓取的时间
         · 每天 2 点强制重摇，用的却是【旧专家数据】
         · 等于"按你教的方法出号"只生效过一次
     现在补上：每次 2 点先抓最新专家数据，再摇号。
     抓不到也不影响出号（会自动沿用旧的 experts-data.js）。 */
  log('\n【3.6/5】抓专家推荐数据（出号组合逻辑的数据源）');
  if (!CHECK_ONLY) {
    try {
      run('build-experts.mjs', []);
    } catch (e) {
      log('  ⚠️ 专家数据抓取失败（不影响出号，沿用上一次的 experts-data.js）：' + e.message);
    }
  } else log('  （--check 跳过）');

  /* 2. 归档 + 判断 */
  log('\n【4/5】归档并检查是否需要摇号');
  const { ctx, missing, savedPath } = inspect();

  if (missing.length) {
    log(`  这些彩种本期还没有号码：${missing.join(', ')}`);
  } else {
    log('  ✅ 所有彩种本期都已有号码');
  }

  if (CHECK_ONLY) {
    log(`\n  --check 结论：${missing.length ? '需要摇号' : '不需要摇号'}`);
    return;
  }

  /* 3. 摇号：默认【不做】，只提示 */
  if (!ALLOW_ROLL && !CHECK_ONLY) {
    if (missing.length) {
      log(`\n  ⚠️ 这些彩种本期还没有号码：${missing.join(', ')}`);
      log('     自动更新不会替你摇号（避免推送出去的号码变动）。');
      log('     需要摇号请到程序「资料」页点「一键摇号」。');
    } else {
      log('  ✅ 各彩种本期号码都在，未做改动');
    }
  }

  if (ALLOW_ROLL && (missing.length || FORCE)) {
    log(`\n【5/5】自动摇号${FORCE ? '（强制）' : ''}`);
    try {
      const stat = ctx.__roll({ force: !!FORCE });
      log(`  ✅ 摇了 ${stat.rolled || stat.games} 个彩种 / ${stat.images} 张图 / ${stat.fields} 个字段`);

      // 写回存档
      const after = ctx.__load();
      const fileText =
        `/* ============================================================\n` +
        `   saved-tickets.js —— 推荐数据存档（自动生成）\n\n` +
        `   由 daily-update.mjs 自动写入，请勿手动编辑。\n` +
        `   更新时间：${stamp()}\n` +
        `   ============================================================ */\n\n` +
        `const SAVED_TICKETS = ${JSON.stringify({ updated: stamp(), tickets: after }, null, 1)};\n`;
      fs.writeFileSync(savedPath, fileText, 'utf8');
      log(`  ✅ 已写入 saved-tickets.js（${(Buffer.byteLength(fileText, 'utf8') / 1024).toFixed(1)} KB）`);

      // 各彩种下一期
      Object.keys(ctx.__T).forEach((gid) => {
        try {
          log(`     ${ctx.__T[gid].name.padEnd(8)} 第 ${ctx.__nextIssue(gid)} 期 (${ctx.__nextDate(gid)})`);
        } catch (e) { /* 忽略 */ }
      });
    } catch (e) {
      log(`  ❌ 摇号失败：${e.message}`);
    }
  } else {
    log('\n【5/5】跳过摇号（本期号码已存在）');
  }

  /* 4. 重生成分享页
     【重要】这里必须用 export-only.mjs，不能用 roll-and-export.mjs。
     后者会重新摇号，把已经推送出去的号码改掉，中奖栏就对不上了。 */
  log('\n  重新生成分享页（不改动号码）...');
  run('export-only.mjs', []);

  /* 5. 同步数据到云端（让微信链接保持一致） */
  log('\n  同步数据到云端 ...');
  run(path.join('cloud', 'sync-cloud.mjs'), []);

  log('\n════════════════════════════════════════════');
  log(`  完成 · ${stamp()}`);
  log('════════════════════════════════════════════');
}

main();
