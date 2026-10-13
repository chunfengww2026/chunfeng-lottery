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

/* 【关键】强制用北京时间。GitHub 服务器是 UTC，不设这个的话，
   北京凌晨 2 点跑出来会算成前一天，日期类字段（公历/农历/干支/
   开奖日）全都差一天，网页和 App 就对不上了。 */
process.env.TZ = 'Asia/Shanghai';

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

/* ---------- 快速模式 ----------
   本机 sync-cloud.mjs 触发构建时会带上 quick=1（环境变量 CLOUD_QUICK=1），
   意思是「数据是刚同步过来的，别抓了，用同步的数据重新渲染 + 部署就行」。

   云端抓数据非常慢（build-football.mjs / build-jc.mjs 要抓几百场赔率），
   而抓取对中国彩票接口基本都会失败（福彩 403 / 体彩 567），
   所以同步后这次构建必须【跳过抓取】，这样 1 分钟内就能部署完。 */
const QUICK = process.env.CLOUD_QUICK === '1' || process.argv.includes('--quick');

/* ---------- 判断是否要抓数据 ----------
   本机刚刚同步过（sync-cloud.mjs 会写 sync-stamp.json），
   说明数据是最新最全的，云端直接拿来用就行 ——
   因为 GitHub 服务器在美国，抓中国彩票接口经常失败
   （实测大乐透抓到 0 期），会导致走势字段全空。

   只有距上次同步超过 12 小时（比如每天凌晨的定时任务），
   云端才自己去抓。 */
function shouldFetch() {
  if (QUICK) {
    return { fetch: false, why: '快速模式（CLOUD_QUICK=1）：同步后立即重建，不抓取' };
  }

  const stampPath = path.join(MOD, 'sync-stamp.json');
  if (!fs.existsSync(stampPath)) return { fetch: true, why: '没有同步记录（首次运行）' };

  try {
    const info = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
    const t = new Date(info.syncedAt).getTime();
    if (isNaN(t)) return { fetch: true, why: '同步记录格式不对' };

    const hours = (Date.now() - t) / 3600000;
    if (hours < 12) {
      return { fetch: false, why: `${hours.toFixed(2)} 小时前刚同步过，直接用同步的数据` };
    }
    return { fetch: true, why: `距上次同步 ${hours.toFixed(1)} 小时，需要自己抓` };
  } catch (e) {
    return { fetch: true, why: '同步记录读取失败' };
  }
}

/* ---------- 检查历史数据是否完整 ---------- */
function checkHistory(required) {
  const p = path.join(MOD, 'history.js');
  if (!fs.existsSync(p)) return { ok: false, missing: required, detail: '没有 history.js' };

  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + '\nglobalThis.__H = DRAW_HISTORY;', c);
    const H = (c.__H && c.__H.games) || {};
    const missing = required.filter((g) => !(H[g] && H[g].length >= 20));
    return { ok: missing.length === 0, missing, detail: missing.length ? `${missing.join(', ')} 期数不足` : '全部齐备' };
  } catch (e) {
    return { ok: false, missing: required, detail: '解析失败：' + e.message };
  }
}

/* ---------- 主流程 ---------- */
function main() {
  log('════════════════════════════════════════════');
  log(`  春风十里送大奖 · 云端构建 · ${stamp()}`);
  log('════════════════════════════════════════════');

  const ALL_GAMES = ['ssq', 'fc3d', 'kl8', 'qlc', 'dlt', 'pl3', 'pl5', 'qxc'];
  const decision = shouldFetch();
  const histBefore = checkHistory(ALL_GAMES);

  log(`\n【数据来源】${decision.fetch ? '云端自己抓取' : '使用本机同步的数据'}`);
  log(`  原因：${decision.why}`);
  if (QUICK) log('  ⚡ 快速模式：跳过所有抓取，直接用同步过来的数据重新渲染（最快部署）');
  log(`  现有历史数据：${histBefore.detail}`);

  /* 1-3. 抓数据（只在需要时） */
  if (decision.fetch) {
    /* 【保护】抓之前先备份数据文件。
       GitHub 服务器在美国，抓中国彩票接口会被拒绝
       （福彩 403 / 体彩 567），抓失败会用坏数据覆盖好数据。
       所以抓完检查，坏了就还原。 */
    const DATA_FILES = ['history.js', 'draws.js', 'football.js', 'jc-data.js', 'prize-data.js'];
    const backup = {};
    DATA_FILES.forEach((f) => {
      const p = path.join(MOD, f);
      if (fs.existsSync(p)) backup[f] = fs.readFileSync(p);
    });
    log(`  已备份 ${Object.keys(backup).length} 个数据文件`);

    log('\n【1/4】抓开奖号码');
    const r1 = run('build-draws.mjs', []);

    log('\n【2/4】抓历史开奖（60 期）');
    const r2 = run('build-history.mjs', ['60']);

    log('\n【3/4】抓足球 + 竞彩 + 奖级');
    const r3 = run('build-football.mjs', []);
    const r4 = run('build-jc.mjs', []);
    const r5 = run('build-prizes.mjs', []);

    /* 检查抓取结果，坏了就还原 */
    const histAfter = checkHistory(ALL_GAMES);
    const anyFailed = !r1 || !r2 || !r3 || !r4 || !r5;

    if (!histAfter.ok || anyFailed) {
      log('');
      log('  ⚠️ 抓取不顺利，正在还原成同步过来的数据：');
      if (anyFailed) log('     原因：有抓取脚本执行失败');
      if (!histAfter.ok) log(`     原因：历史数据不完整（${histAfter.detail}）`);

      let restored = 0;
      DATA_FILES.forEach((f) => {
        if (backup[f]) {
          fs.writeFileSync(path.join(MOD, f), backup[f]);
          restored++;
        }
      });
      log(`     已还原 ${restored} 个数据文件，页面会继续用上次同步的好数据`);

      /* 再确认一次 */
      const final = checkHistory(ALL_GAMES);
      log(`     还原后历史数据：${final.detail}`);
    } else {
      log(`\n  ✅ 历史数据完整：${histAfter.detail}`);
    }
  } else {
    log('\n【1-3/4】跳过抓取（使用本机同步的数据）');
    log(`  ✅ 历史数据：${histBefore.detail}`);
  }

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

  /* ---------- 发布本期的号码 JSON ----------
     分享页启动后会去拉这个文件（tickets.json）：
     只要它比页面里的内联快照新，页面就【就地重渲染】成新号码 ——
     所以这一步必须在【生成网页之前】就做完：
     万一后面生成网页失败，网站上的号码照样是最新的，
     手机打开分享页也能拿到新号码（页面自带拉取+重渲染逻辑）。 */
  publishTicketsJson();

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
  <a href="football.html" class="__ACTIVE_FB__">竞彩场次</a>
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

/* ---------- 发布本期的号码 JSON（out/tickets.json） ----------
   两个用途：
     1. 分享页（out/index.html）启动后拉它 → 拉到新的就地重渲染，
        不用等云端重新构建整个页面（准实时同步的核心）
     2. 本机程序 cloud-pull.js 下载它，把云端号码同步回本机
   所以它在【生成网页之前】就要写好：网页渲染失败也不影响号码更新。 */
function publishTicketsJson() {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const savedNow = path.join(MOD, 'saved-tickets.js');
    if (!fs.existsSync(savedNow)) { log('  ⚠️ 没有 saved-tickets.js，跳过 tickets.json'); return; }

    const c2 = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(savedNow, 'utf8') + '\nglobalThis.__S = SAVED_TICKETS;', c2);
    const S = c2.__S || {};

    const payload = {
      updated: S.updated || stamp(),
      publishedAt: new Date().toISOString(),
      source: 'cloud',
      note: '云端自动生成的推荐号码，本机程序会自动下载并采用；分享页也会拉它做准实时更新',
      tickets: S.tickets || {}
    };

    fs.writeFileSync(path.join(OUT, 'tickets.json'), JSON.stringify(payload), 'utf8');
    log(`  tickets.json 已发布（${Object.keys(payload.tickets).length} 个彩种，updated=${payload.updated}）`);
  } catch (e) {
    log(`  发布 tickets.json 失败：${e.message}`);
  }
}

main();
