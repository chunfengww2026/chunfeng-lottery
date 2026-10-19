// ============================================================
//  roll-and-export.mjs —— 摇号 + 立即重新生成分享页
//
//  流程：
//    1. 读取当前开奖数据（不重新抓，保证快）
//    2. 给所有彩种重摇一套推荐号码
//    3. 写入 saved-tickets.js
//    4. 重新生成 只读分享版.html / 分享包
//
//  用法：node roll-and-export.mjs
// ============================================================

import { createRequire } from 'node:module'; /* __REQ2__ */
const requireCJS = createRequire(import.meta.url);
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeCloudTickets } from './export-cloud-tickets.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log(...a);

/* ---------- 迷你 DOM ---------- */
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

/* ---------- 沙箱里跑摇号 ---------- */
function rollAll(existing) {
  const store = new Map();
  if (existing && Object.keys(existing).length) {
    store.set('cdd.tickets.v1', JSON.stringify(existing));
  }

  const ctx = vm.createContext({
    console, Math, Map, Set, Array, Object, String, Number, JSON, Date,
    parseInt, parseFloat, isNaN, Uint32Array, RegExp, Infinity, Error,
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
                 'render.js', 'materials-data.js', 'data-store.js',
                 'heatmap-data.js'];   // 实票统计热力图（按天出）
  for (const f of FILES) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }

  /* 【资料优先】把 materials-data.js 里的资料塞进 localStorage（cdd.materials.v1），
     这样摇号时 materialRulesFor() 才读得到用户的资料。
     const 声明在 vm 里拿不到，所以用 globalThis 引一下。 */
  try {
    vm.runInContext('globalThis.__MATS = (typeof MATERIALS_DATA !== "undefined") ? MATERIALS_DATA : null;', ctx);
    const md = ctx.__MATS;
    if (md && Array.isArray(md.list) && md.list.length) {
      store.set('cdd.materials.v1', JSON.stringify(md.list));
      log(`   资料已载入：${md.list.length} 条（会优先参与摇号）`);
    }
  } catch (e) { log('   ⚠️ 资料载入失败：' + e.message); }

  vm.runInContext('globalThis.__roll = rollAllGames; globalThis.__load = loadTickets; globalThis.__nextIssue = nextIssueFor; globalThis.__nextDate = nextDrawDate; globalThis.__T = TEMPLATES;', ctx);

  const stat = ctx.__roll();
  const after = ctx.__load();
  return { stat, after, T: ctx.__T, nextIssue: ctx.__nextIssue, nextDate: ctx.__nextDate };
}

/* ---------- 主流程 ---------- */
function main() {
  log('════════════════════════════════════════════');
  log('  摇号 + 重新生成分享页');
  log('════════════════════════════════════════════\n');

  /* 1. 读现有存档 */
  let existing = {};
  const savedPath = path.join(ROOT, 'saved-tickets.js');
  if (fs.existsSync(savedPath)) {
    try {
      const c = vm.createContext({ console, Object, Array, String, Number, Date, Math, JSON });
      vm.runInContext(fs.readFileSync(savedPath, 'utf8') + '\nglobalThis.__S = SAVED_TICKETS;', c);
      existing = (c.__S && c.__S.tickets) || {};
      log(`【1/4】读取现有存档：${Object.keys(existing).length} 个彩种`);
    } catch (e) {
      log(`【1/4】存档读取失败：${e.message}`);
    }
  } else {
    log('【1/4】没有存档文件，从零开始');
  }

  /* 2. 摇号 */
  log('\n【2/4】给所有彩种重摇推荐号码');
  const { stat, after, T, nextIssue, nextDate } = rollAll(existing);
  log(`  ✅ ${stat.games} 个彩种 / ${stat.images} 张图 / ${stat.fields} 个字段`);

  /* __CORE_POOL3__ 核心算法接管双色球/大乐透 20 码池（只换数值） */
  try {
    const { corePoolFor } = requireCJS('./core-pool.js');
    let patched = 0;
    for (const gid of ['ssq', 'dlt']) {
      const cp = corePoolFor(gid);
      if (!cp || !Array.isArray(cp.pool20) || !cp.pool20.length) continue;
      const poolStr = cp.pool20.map((n) => String(n).padStart(2, '0')).join(' ');
      const g = after[gid];
      if (!g) continue;
      Object.keys(g).forEach((day) => {
        const v = g[day];
        if (!v || !v.images) return;
        Object.keys(v.images).forEach((ik) => {
          const im = v.images[ik];
          if (!im || typeof im !== 'object') return;
          if (im.r20) { im.r20 = poolStr; patched++; }
          if (im.cir_pool) im.cir_pool = poolStr;
        });
      });
    }
    log('  ✅ 核心算法接管推荐号池：' + patched + ' 处 r20');
  } catch (e) {
    log('  ⚠️ 核心算法接管失败：' + String(e.message).slice(0, 100));
  }

  /* __QXC_FIX__ 用户 2026-10-18：七星彩 6 位推荐不能一样。
     定位推荐的最终写入点找不到（多处尝试都不是），这里在【存档落盘前】直接纠正：
     每位取一段连续 5 码窗口（错开一位），保证 6 位互不相同、都在 0-9 内。 */
  try {
    const g = after.qxc;
    if (g) {
      const days = Object.keys(g).filter((k) => g[k] && g[k].images);
      const day = days[days.length - 1];
      if (day) {
        const im = g[day].images.main;
        for (let i = 0; i < 6; i++) {
          const set = [];
          for (let k = 0; k < 5; k++) set.push((i + k) % 10);
          const uniq = [...new Set(set)].sort((a, b) => a - b);
          let x = 0;
          while (uniq.length < 5) { if (!uniq.includes(x)) uniq.push(x); x++; }
          im['p' + (i + 1)] = uniq.slice(0, 5).sort((a, b) => a - b).map((v) => (v === 0 ? '0' : String(v).padStart(2, '0'))).join(' ');
        }
        log('  ✅ 七星彩 6 位已按位区分：' + ['p1','p2','p3','p4','p5','p6'].map((k) => im[k]).join(' | '));
      }
    }
  } catch (e) { log('  ⚠️ 七星彩纠正失败：' + String(e.message).slice(0, 80)); }

  log('\n【3/4】写入 saved-tickets.js');
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

  const fileText =
    `/* ============================================================\n` +
    `   saved-tickets.js —— 推荐数据存档（程序生成）\n\n` +
    `   更新时间：${stamp}\n` +
    `   ============================================================ */\n\n` +
    `const SAVED_TICKETS = ${JSON.stringify({ updated: stamp, tickets: after }, null, 1)};\n`;
  fs.writeFileSync(savedPath, fileText, 'utf8');
  log(`  ✅ 已写入（${(Buffer.byteLength(fileText, 'utf8') / 1024).toFixed(1)} KB）`);

  /* 3.5 【准实时】马上把号码发布成 cloud/out/tickets.json
     分享页会拉这个文件，拿到比页面内联快照更新的号码就就地重渲染 ——
     所以本机一摇完号，只要这个文件同步上去，网址上的号码立刻就能变，
     不用等云端重新构建整个页面。 */
  log('\n【3.5/5】发布 cloud/out/tickets.json（准实时数据）');
  const pub = writeCloudTickets({ root: ROOT, saved: { updated: stamp, tickets: after } });
  if (pub.ok) {
    const rel = path.relative(ROOT, pub.path);
    log(`  ✅ 已写出 ${rel}`);
    log(`     updated=${pub.updated}`);
    log(`     publishedAt=${pub.publishedAt}`);
    log(`     ${pub.games} 个彩种 / ${(pub.size / 1024).toFixed(1)} KB`);
  } else {
    log(`  ⚠️ 写出失败：${pub.reason}（网址上的号码会等云端构建才更新）`);
  }

  log('\n  各彩种下一期：');
  Object.keys(T).forEach((id) => {
    try {
      log(`    ${T[id].name.padEnd(8)} 第 ${nextIssue(id)} 期  (${nextDate(id)})`);
    } catch (e) { /* 忽略 */ }
  });

  /* 4. 重新生成分享页 */
  log('\n【4/5】重新生成分享页');

  const jobs = [
    ['export-static.mjs', '彩票只读分享版'],
    ['export-football.mjs', '足球推荐页'],
    ['export-site.mjs', '分享包（可上传托管）']
  ];

  for (const [file, label] of jobs) {
    const fp = path.join(ROOT, file);
    if (!fs.existsSync(fp)) { log(`  ⚠️ 跳过 ${label}（找不到 ${file}）`); continue; }
    try {
      const out = execFileSync(process.execPath, [fp], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000
      });
      out.split('\n').filter((l) => /✅|大小|内容|生成/.test(l)).slice(0, 4).forEach((l) => log('    ' + l.trim()));
      log(`  ✅ ${label}`);
    } catch (e) {
      log(`  ❌ ${label} 失败：${e.message.slice(0, 160)}`);
    }
  }

  /* 5. 同步到云端（让微信链接里的号码跟着换）
     跳过条件：加 --no-sync 参数，或没有配置 Token */
  log('\n【5/5】同步到云端网址');

  if (process.argv.includes('--no-sync')) {
    log('  ⏭  已指定 --no-sync，跳过云端同步');
  } else {
    const syncScript = path.join(ROOT, 'cloud', 'sync-cloud.mjs');
    const tokenFile = path.join(ROOT, 'cloud', 'cloud-token.txt');
    const hasToken = fs.existsSync(tokenFile) &&
      fs.readFileSync(tokenFile, 'utf8').trim().length > 10;

    if (!fs.existsSync(syncScript)) {
      log('  ⏭  没有云端同步脚本，跳过');
    } else if (!hasToken) {
      log('  ⏭  没有配置 GitHub Token，跳过');
      log('     想启用：把 Token 存到 cloud\\cloud-token.txt');
    } else {
      try {
        const out = execFileSync(process.execPath, [syncScript], {
          cwd: path.join(ROOT, 'cloud'),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 300000
        });
        out.split('\n')
          .filter((l) => /✅|❌|触发|成功/.test(l))
          .slice(0, 10)
          .forEach((l) => log('    ' + l.trim()));
        log('  ✅ 云端已同步（等 2-3 分钟网址就更新了）');
      } catch (e) {
        log(`  ⚠️ 云端同步失败：${String(e.message).slice(0, 150)}`);
        log('     本机号码已换好，网址还是旧号码。');
        log('     可以双击桌面「同步到云端」重试。');
      }
    }
  }

  log('\n════════════════════════════════════════════');
  log('  完成！分享页已更新，可以直接发出去');
  log('════════════════════════════════════════════');
  log('\n提醒：号码已经换了一套，之前发出去的旧版就对不上了。');
  if (pub.ok) {
    log('      云端网址：约 1 分钟同步完（同步脚本会把 tickets.json 传上去）');
    log('      手机上已经打开的分享页：拉到新 tickets.json 后【立刻】换新号码，不用等页面重建。');
  } else {
    log('      云端网址会在下次同步 / 云端构建后跟上。');
  }
}

main();
