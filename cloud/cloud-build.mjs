// ============================================================
//  cloud-build.mjs —— 云端构建（GitHub Actions 里跑）
//
//  流程：
//    1. 抓开奖号码（官方接口）
//    2. 抓历史开奖（60 期，8 个彩种）
//    3. 抓足球赛事 + 比分
//    4. 抓奖级奖金
//    5. 读取/初始化推荐号码（保存在 saved-tickets.js）
//    6. 生成静态网页到 out/
//
//  【重要】不会重摇推荐号码，保护已推送出去的号。
//
//  用法：node cloud-build.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
/* 所有模块（games.js / build-*.mjs 等）都放在 scripts/ 子目录里 */
const MOD = path.join(ROOT, 'scripts');
const OUT = path.join(ROOT, 'out');

const log = (...a) => console.log(...a);

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ---------- 跑子脚本（抓数据） ---------- */
function run(file, args) {
  const fp = path.join(MOD, file);
  if (!fs.existsSync(fp)) { log(`  ⚠️ 找不到 ${file}`); return false; }
  log(`  ▶ ${file}`);
  try {
    const out = execFileSync(process.execPath, [fp, ...(args || [])], {
      cwd: MOD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900000
    });
    out.split('\n')
      .filter((l) => /✅|❌|⚠️|写入|期|场/.test(l))
      .slice(0, 12)
      .forEach((l) => log('      ' + l.trim()));
    return true;
  } catch (e) {
    log(`  ❌ ${file} 失败：${String(e.message).slice(0, 200)}`);
    return false;
  }
}

/* ---------- 迷你 DOM（给渲染器用） ---------- */
function makeDom() {
  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = []; this.attrs = {}; this._text = ''; this._html = null;
      this.className = ''; this.dataset = {};
      const self = this;
      this.style = new Proxy({ cssText: '' }, {
        set(t, k, v) {
          t[k] = v;
          if (k !== 'cssText') {
            const kebab = String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
            const cur = t.cssText || '';
            const re = new RegExp(`(^|;)\\s*${kebab}\\s*:[^;]*`, 'i');
            if (re.test(cur)) t.cssText = cur.replace(re, `$1 ${kebab}:${v}`);
            else t.cssText = (cur ? cur.replace(/;?\s*$/, ';') : '') + `${kebab}:${v}`;
          }
          return true;
        },
        get(t, k) {
          if (k === 'setProperty') return (n, v) => {
            const cur = t.cssText || '';
            t.cssText = (cur ? cur.replace(/;?\s*$/, ';') : '') + `${n}:${v}`;
          };
          if (k === 'getPropertyValue') return (n) => {
            const m = new RegExp(`${n}\\s*:\\s*([^;]+)`, 'i').exec(t.cssText || '');
            return m ? m[1].trim() : '';
          };
          return t[k];
        }
      });
    }
    set textContent(v) { this._text = String(v); this.children = []; this._html = null; }
    get textContent() { return this._html ? this._html.replace(/<[^>]*>/g, '') : (this._text || this.children.map((c) => c.textContent || '').join('')); }
    set innerHTML(v) { this._html = String(v); this.children = []; this._text = ''; }
    get innerHTML() { return this._html !== null ? this._html : ''; }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute(k, v) { this.attrs[k] = v; if (String(k).toLowerCase() === 'style') this.style.cssText = String(v); }
    addEventListener() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
    getBoundingClientRect() { return { width: 760, height: 100, left: 0, top: 0 }; }
  }
  return {
    createElement: (t) => new El(t),
    createTextNode: (t) => { const e = new El('#text'); e.textContent = t; return e; },
    addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => []
  };
}

/* ---------- 建沙箱并加载所有模块 ---------- */
function makeSandbox(store) {
  const dom = makeDom();
  const ctx = vm.createContext({
    console, Math, Map, Set, Array, Object, String, Number, JSON, Date,
    parseInt, parseFloat, isNaN, Uint32Array, RegExp, Error, Infinity,
    document: dom,
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

  const FILES = [
    'games.js', 'draws.js', 'history.js', 'draw-data.js', 'algo.js',
    'stats.js', 'templates.js', 'ticket-store.js', 'saved-tickets.js',
    'render.js', 'prize-data.js', 'hit-check.js', 'materials-data.js', 'data-store.js'
  ];
  for (const f of FILES) {
    const p = path.join(MOD, f);
    if (!fs.existsSync(p)) { log(`  ⚠️ 缺少 ${f}`); continue; }
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }
    catch (e) { log(`  ❌ 加载 ${f} 失败：${e.message}`); }
  }
  return ctx;
}

/* ---------- 主流程 ---------- */
function main() {
  log('════════════════════════════════════════════');
  log(`  春风十里送大奖 · 云端构建 · ${stamp()}`);
  log('════════════════════════════════════════════');

  /* 1. 抓数据 */
  log('\n【1/4】抓开奖号码');
  run('build-draws.mjs', []);

  log('\n【2/4】抓历史开奖（60 期）');
  run('build-history.mjs', ['60']);

  log('\n【3/4】抓足球 + 竞彩 + 奖级');
  run('build-football.mjs', []);
  run('build-jc.mjs', []);
  run('build-prizes.mjs', []);

  /* 2. 载入存档，检查是否有推荐号码 */
  log('\n【4/4】检查推荐号码');
  const store = new Map();
  const savedPath = path.join(MOD, 'saved-tickets.js');
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
    log(`  已有存档：${Object.keys(saved.tickets).length} 个彩种`);
  }

  const ctx = makeSandbox(store);

  /* 逐个取用，缺哪个就跳过哪个，不让整个流程崩掉 */
  const NEED = [
    ['__all', 'allPeriodsOf'],
    ['__roll', 'rollAllGames'],
    ['__load', 'loadTickets'],
    ['__T', 'TEMPLATES'],
    ['__nextIssue', 'nextIssueFor'],
    ['__nextDate', 'nextDrawDate']
  ];
  NEED.forEach(([alias, fn]) => {
    try {
      vm.runInContext(`globalThis.${alias} = (typeof ${fn} === 'function' || typeof ${fn} === 'object') ? ${fn} : undefined;`, ctx);
    } catch (e) {
      log(`  ⚠️ 取不到 ${fn}：${e.message}`);
    }
  });

  if (!ctx.__T) {
    log('  ❌ 模板未加载，无法继续生成网页');
    process.exit(1);
  }

  /* 看哪些彩种本期没号码 */
  const missing = [];
  try {
    Object.keys(ctx.__T).forEach((gid) => {
      let has = false;
      try {
        const periods = ctx.__all(gid);
        has = periods.some((p) => !p.draw && p.images && Object.keys(p.images).length);
      } catch (e) { /* 视为没有 */ }
      if (!has) missing.push(gid);
    });
  } catch (e) { log(`  ⚠️ 检查失败：${e.message}`); }

  if (missing.length) {
    log(`  本期还没有号码的彩种：${missing.join(', ')}`);
    log('  → 自动补摇一套（云端首次运行需要）');
    try {
      const stat = ctx.__roll({ force: false });
      log(`  ✅ 摇了 ${stat.rolled || stat.games} 个彩种 / ${stat.images} 张图`);
      const after = ctx.__load();
      const fileText =
        `/* ============================================================\n` +
        `   saved-tickets.js —— 推荐数据存档\n\n` +
        `   由云端构建自动写入。更新时间：${stamp()}\n` +
        `   ============================================================ */\n\n` +
        `const SAVED_TICKETS = ${JSON.stringify({ updated: stamp(), tickets: after }, null, 1)};\n`;
      fs.writeFileSync(savedPath, fileText, 'utf8');
      log('  ✅ 已写入 saved-tickets.js');
    } catch (e) {
      log(`  ❌ 摇号失败：${e.message}`);
    }
  } else {
    log('  ✅ 所有彩种本期都有号码，未改动');
  }

  /* 3. 生成网页 */
  log('\n生成静态网页 ...');
  for (const [file, label] of [
    ['export-static.mjs', '彩票页'],
    ['export-football.mjs', '足球页']
  ]) {
    const fp = path.join(MOD, file);
    if (!fs.existsSync(fp)) { log(`  ⚠️ 跳过 ${label}`); continue; }
    try {
      const out = execFileSync(process.execPath, [fp], {
        cwd: MOD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000
      });
      out.split('\n').filter((l) => /✅|大小|内容|比赛|中奖栏/.test(l)).slice(0, 4).forEach((l) => log('    ' + l.trim()));
      log(`  ✅ ${label}`);
    } catch (e) {
      log(`  ❌ ${label} 失败：${String(e.message).slice(0, 160)}`);
    }
  }

  /* 4. 复制到 out/ 并生成入口页 */
  log('\n整理输出到 out/ ...');
  fs.mkdirSync(OUT, { recursive: true });

  const pairs = [
    ['只读分享版.html', 'index.html'],
    ['足球推荐.html', 'football.html']
  ];
  pairs.forEach(([src, dst]) => {
    const sp = path.join(MOD, src);
    if (!fs.existsSync(sp)) { log(`  ⚠️ 缺少 ${src}`); return; }
    fs.copyFileSync(sp, path.join(OUT, dst));
    log(`  ✅ ${dst}  ${(fs.statSync(sp).size / 1024).toFixed(1)} KB`);
  });

  /* 顶部导航（两个页面互跳） */
  const NAV = `
<style>
.site-nav { position: sticky; top: 0; z-index: 99; display: flex; background: rgba(15,17,21,0.96); backdrop-filter: blur(10px); border-bottom: 1px solid #262d3a; }
.site-nav a { flex: 1; text-align: center; padding: 13px 10px; font-size: 14px; font-weight: 600; color: #6b7488; text-decoration: none; border-bottom: 2px solid transparent; }
.site-nav a.on { color: #47e0a0; border-bottom-color: #47e0a0; }
</style>
<div class="site-nav">
  <a href="index.html" class="__ACTIVE_INDEX__">彩票推荐</a>
  <a href="football.html" class="__ACTIVE_FB__">足球竞彩</a>
</div>`;

  for (const [dst, active] of [['index.html', 'index'], ['football.html', 'fb']]) {
    const fp = path.join(OUT, dst);
    if (!fs.existsSync(fp)) continue;
    let html = fs.readFileSync(fp, 'utf8');
    const nav = NAV.replace('__ACTIVE_INDEX__', active === 'index' ? 'on' : '')
                   .replace('__ACTIVE_FB__', active === 'fb' ? 'on' : '');
    html = html.replace('</head>', nav.split('<div class="site-nav">')[0] + '</head>');
    html = html.replace(/<body([^>]*)>/, `<body$1>${nav.split('</style>')[1]}`);
    fs.writeFileSync(fp, html, 'utf8');
  }

  /* 首页跳转说明 */
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '', 'utf8');

  log(`\n════════════════════════════════════════════`);
  log(`  完成 · ${stamp()}`);
  log(`  输出目录：${OUT}`);
  log('════════════════════════════════════════════');
}

main();
