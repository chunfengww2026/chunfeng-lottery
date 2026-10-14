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
function run(file, args, maxLines) {
  const fp = path.join(MOD, file);
  if (!fs.existsSync(fp)) { log(`  ⚠️ 找不到 ${file}`); return false; }
  log(`  ▶ ${file} ${(args || []).join(' ')}`);
  try {
    const out = execFileSync(process.execPath, [fp, ...(args || [])], {
      cwd: MOD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900000
    });
    out.split('\n')
      .filter((l) => /✅|❌|⚠️|写入|期|场|来源|占比|晒票|开奖日/.test(l))
      .slice(0, maxLines || 12)
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
    'render.js', 'prize-data.js', 'hit-check.js', 'materials-data.js', 'data-store.js',
    /* 【热力图】实票统计热力图的数据 + shouldShowHeatmap 判断 */
    'heatmap-data.js'
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

/* ---------- 实票统计热力图（开奖日 18:00 才生成） ----------
   用户要求：
     · 「开奖当日 18 点透露到网页」「平常不透露」「关机也要执行」
     · 双色球开奖日：周二 / 周四 / 周日；大乐透：周一 / 周三 / 周六（北京时间）

   这一步【独立判断】，绝不被 shouldFetch() / CLOUD_QUICK 跳过
   （所以调用点在 main() 里 `if (decision.fetch)` 的外面）：
     · 今天这两个彩种都不开奖            → 清空数据（--purge），页面不出现这张图
     · 今天开奖、但还没到北京时间 18:00   → 本班次不生成（18:00 那一班会生成并部署）
     · 已过 18:00，或本班次就是 18:00 定时 → 抓当日晒票 → 出图

   开关：
     · CLOUD_HEATMAP=0 或 --no-heatmap → 完全不跑
     · --heatmap-force                 → 忽略开奖日/时间判断，强制生成（本机调试）
   产出：heatmap-data.js（export-static.mjs 会把它内联进分享页） */
const HEATMAP_SCRIPTS = ['build-heatmap.mjs', 'heatmap.mjs', 'build-hotmap.mjs'];
/* 开奖日（0=周日），与 draw-data.js 的 DRAW_WEEKDAYS、heatmap-data.js 的
   HEATMAP_DRAW_DAYS 三处保持一致 */
const CHINA_DRAW_DAYS = { ssq: [0, 2, 4], dlt: [1, 3, 6] };
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 当前北京时间（不依赖服务器时区）
 *  【调试】设 HEATMAP_NOW=2026-10-16T18:05 可以把「现在」定格到某个时刻，
 *  用来验证开奖日/18:00 的判断（不设就是真实时间）。 */
function beijingNow() {
  let base = Date.now();
  const ov = String(process.env.HEATMAP_NOW || '').trim();
  if (ov) {
    const t = new Date(ov.replace(' ', 'T')).getTime();
    if (!isNaN(t)) base = t;
  }
  const u = new Date(base + 8 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return {
    hh: u.getUTCHours(),
    mm: u.getUTCMinutes(),
    dow: u.getUTCDay(),
    date: `${u.getUTCFullYear()}-${p(u.getUTCMonth() + 1)}-${p(u.getUTCDate())}`,
    hhmm: `${p(u.getUTCHours())}:${p(u.getUTCMinutes())}`
  };
}

/* ============================================================
   班次（slot）—— 一个 workflow 里挂了好几条 cron，每条干的事不一样
   ------------------------------------------------------------
   北京时间 → 班次类型（UTC = 北京 - 8）：
     · 02:00（UTC 18:00）  full           全量：抓全部数据 + 强制重摇 8 彩种 + 出图 + 发布
     · 18:00（UTC 10:00）  heatmap-only   只加热力图：抓晒票出图 + 抓足球；不重摇号、不抓开奖
     · 21:00（UTC 13:00）  heatmap-off    只去掉热力图：清空热力图数据 + 重新出页面
     · 21:40（UTC 13:40）  draw-update    更新开奖号码：抓开奖 → 摇下一期 → 出图 → 发布
     · 足球 10 班次（北京 00/02/04/06/08/12/14/18/20/22 点）
                          football-only  只抓足球 + 重新出足球页
                         （其中 02:00 → full、18:00 → heatmap-only）

   【判断方式】cron 表达式 + 实际触发的北京时间 联合判断。
   第一条 cron 是「一串小时」——同一个表达式在不同小时触发时班次完全不同，
   所以【不能】拿 cron 字符串做精确比较（这也是它原来会失效的原因）。
   ============================================================ */
const SLOT_AT = { '02:00': 'full', '18:00': 'heatmap-only', '21:00': 'heatmap-off', '21:40': 'draw-update' };
/* 足球的 10 个班次（北京时间的小时） */
const FOOTBALL_BJ_HOURS = [0, 2, 4, 6, 8, 12, 14, 18, 20, 22];

/* GitHub 的定时任务经常会延迟几分钟才真正跑，所以给一点容差
   （from/to 是相对班次时刻的分钟数；21:00 与 21:40 只差 40 分钟，所以容差必须收紧） */
const SLOT_TOLERANCE = {
  'full':         { from: -10, to: 90 },
  'heatmap-only': { from: -10, to: 90 },
  'heatmap-off':  { from: -10, to: 25 },
  'draw-update':  { from: -10, to: 20 }
};

const SLOT_LABEL = {
  'full': '全量更新（北京 02:00）',
  'heatmap-only': '只加热力图（北京 18:00）',
  'heatmap-off': '只去掉热力图（北京 21:00）',
  'draw-update': '更新开奖号码（北京 21:40）',
  'football-only': '只更新足球（足球 10 班次之一）',
  'auto': '自动 / 手动触发（沿用原来的行为）'
};

/* 每个班次到底干什么 —— 一张表看清楚，避免再散落在 main() 里 */
const SLOT_PLAN = {
  'full':          { dataFetch: true,         football: true,   roll: 'force', heatmap: 'purge', publishTickets: true,  exportStatic: true,   exportFootball: true  },
  'heatmap-only':  { dataFetch: false,        football: true,   roll: 'skip',  heatmap: 'build', publishTickets: false, exportStatic: true,   exportFootball: true  },
  'heatmap-off':   { dataFetch: false,        football: false,  roll: 'skip',  heatmap: 'purge', publishTickets: false, exportStatic: true,   exportFootball: false },
  'draw-update':   { dataFetch: 'draws-only', football: false,  roll: 'fill',  heatmap: 'skip',  publishTickets: true,  exportStatic: true,   exportFootball: true  },
  'football-only': { dataFetch: 'auto',       football: true,   roll: 'skip',  heatmap: 'skip',  publishTickets: false, exportStatic: 'auto', exportFootball: true  },
  'auto':          { dataFetch: 'auto',       football: 'auto', roll: 'fill',  heatmap: 'auto',  publishTickets: true,  exportStatic: true,   exportFootball: true  }
};

/** 从 cron 表达式里解析出「分钟」和「UTC 小时」集合
 *  '0 0,4,6,10,12,14,16,18,20,22 * * *' → { minute: 0, hours: [0,4,6,10,12,14,16,18,20,22] } */
function parseCron(expr) {
  const f = String(expr || '').trim().split(/\s+/);
  if (f.length < 5) return null;
  const minute = parseInt(f[0], 10);
  const hours = f[1].split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  if (isNaN(minute) || !hours.length) return null;
  return { minute, hours };
}

/**
 * 判断这一班是哪个班次
 *   ① CLOUD_SLOT 环境变量最优先（本机模拟 / 手动指定）
 *   ② 有 cron（定时触发）→ cron + 实际北京时间 联合判断
 *   ③ 没有 cron（手动触发 / 本机直接跑）→ auto（沿用原来的行为）
 */
function resolveSlot() {
  const b = beijingNow();

  const forced = String(process.env.CLOUD_SLOT || '').trim().toLowerCase();
  if (forced && SLOT_PLAN[forced]) {
    return { type: forced, why: `CLOUD_SLOT=${forced}（手动指定）`, bj: b, cron: '' };
  }

  const cronStr = String(process.env.HEATMAP_SLOT || '').trim();
  if (!cronStr) {
    return { type: 'auto', why: '没有 cron（手动触发 / 本机运行）', bj: b, cron: '' };
  }

  const cron = parseCron(cronStr);
  if (!cron) {
    return { type: 'auto', why: `读不懂 cron「${cronStr}」`, bj: b, cron: cronStr, hourOk: null };
  }

  /* cron 用的是 UTC；换算成北京小时后要确认这一班确实在这条 cron 里 */
  const utcHour = (b.hh - 8 + 24) % 24;
  const hourOk = cron.hours.indexOf(utcHour) >= 0;

  const bjMin = b.hh * 60 + b.mm;
  let best = null;
  Object.keys(SLOT_AT).forEach((at) => {
    const type = SLOT_AT[at];
    const seg = at.split(':');
    const atH = +seg[0];
    const atM = +seg[1];
    /* 【分钟必须先对上】21:40 那条 cron 的分钟是 40，22:00 那条是 0 ——
       不靠分钟区分的话，北京 22:00 的足球班次会被误判成 21:40 的「更新开奖」班。 */
    if (atM !== cron.minute) return;
    const atMin = atH * 60 + atM;
    const d = bjMin - atMin;
    const tol = SLOT_TOLERANCE[type] || { from: -10, to: 90 };
    if (d >= tol.from && d <= tol.to) {
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { type, d, at };
    }
  });

  if (best) {
    const drift = best.d === 0 ? '' : `（延迟 ${best.d} 分钟）`;
    return {
      type: best.type,
      why: `cron「${cronStr}」+ 北京 ${b.hhmm} → 命中 ${best.at} 班次${drift}`,
      bj: b, cron: cronStr, hourOk
    };
  }

  if (FOOTBALL_BJ_HOURS.indexOf(b.hh) >= 0) {
    return {
      type: 'football-only',
      why: `cron「${cronStr}」+ 北京 ${b.hhmm} → 不是特殊班次，但属于足球 10 班次`,
      bj: b, cron: cronStr, hourOk
    };
  }

  return {
    type: 'auto',
    why: `cron「${cronStr}」+ 北京 ${b.hhmm} → 不在任何已知班次，按自动处理`,
    bj: b, cron: cronStr, hourOk
  };
}

/** 把班次翻译成一张「这一班到底做什么」的计划表（环境变量 / 命令行可以覆盖） */
function planForSlot(type, b) {
  const plan = Object.assign({}, SLOT_PLAN[type] || SLOT_PLAN.auto);
  plan.type = type;
  plan.label = SLOT_LABEL[type] || type;
  /* 把「现在（北京时间）」挂在计划上 —— runHeatmapStep 要用同一个时刻，
     否则热力图判断和班次判断可能对不上（差一分钟就跨过开奖时刻）。 */
  plan.bj = b;

  /* 【强制重摇】开关：CLOUD_ROLL=force|fill|skip，或命令行 --force-roll / --no-roll */
  const rollEnv = String(process.env.CLOUD_ROLL || '').trim().toLowerCase();
  if (rollEnv === 'force' || rollEnv === 'fill' || rollEnv === 'skip') plan.roll = rollEnv;
  if (process.argv.includes('--force-roll')) plan.roll = 'force';
  if (process.argv.includes('--no-roll')) plan.roll = 'skip';

  /* 足球单独开关 */
  if (process.argv.includes('--no-football')) plan.football = false;
  if (process.argv.includes('--football')) plan.football = true;

  /* 这一班在不在足球 10 个点上 */
  plan.isFootballSlot = FOOTBALL_BJ_HOURS.indexOf(b.hh) >= 0;
  return plan;
}

/** 计划表 → 一行中文，写进日志，方便一眼确认这一班要干嘛 */
function describePlan(plan) {
  const bits = [];
  bits.push(plan.dataFetch === true ? '抓全部数据（开奖+历史+足球+奖级）'
    : plan.dataFetch === 'draws-only' ? '只抓开奖号码'
    : plan.dataFetch === false ? '不抓开奖/历史（本班次不碰）'
    : '开奖/历史按 12 小时规则决定');
  if (plan.football === true) bits.push('抓足球 ✅');
  else if (plan.football === false) bits.push('不抓足球');
  else bits.push('足球按 12 小时规则决定');
  bits.push(plan.roll === 'force' ? '强制重摇【全部彩种】'
    : plan.roll === 'fill' ? '号码缺才补摇'
    : '不摇号');
  bits.push(plan.heatmap === 'build' ? '热力图：抓晒票出图'
    : plan.heatmap === 'purge' ? '热力图：清空'
    : plan.heatmap === 'skip' ? '热力图：不动'
    : '热力图：按时间自动判断');
  bits.push(plan.publishTickets ? '发布 tickets.json' : '不发布 tickets.json');
  const ex = [];
  if (plan.exportStatic === true) ex.push('彩票页');
  else if (plan.exportStatic === 'auto') ex.push('彩票页(按需)');
  if (plan.exportFootball) ex.push('足球页');
  bits.push(ex.length ? '重新生成 ' + ex.join(' + ') : '不重新生成页面');
  return bits.join(' ｜ ');
}

function runHeatmapStep(plan) {
  const mode = plan.heatmap;
  const b = plan.bj;

  if (mode === 'skip') {
    log('\n【热力图】本班次不动热力图（' + plan.type + '）→ 跳过');
    return;
  }

  const flag = String(process.env.CLOUD_HEATMAP || '').trim();
  if (flag === '0' || process.argv.includes('--no-heatmap')) {
    log('\n【热力图】按开关跳过（CLOUD_HEATMAP=0 / --no-heatmap）');
    return;
  }

  const hit = HEATMAP_SCRIPTS.map((f) => path.join(MOD, f)).find((p) => fs.existsSync(p));
  if (!hit) {
    log('\n【热力图】脚本还没就绪（找 ' + HEATMAP_SCRIPTS.join(' / ') + '）→ 本步跳过');
    log('  ℹ️  注意：快速模式不会跳过这一步，脚本放进 scripts/ 后自动生效');
    return;
  }
  const script = path.basename(hit);
  const games = Object.keys(CHINA_DRAW_DAYS).filter((g) => CHINA_DRAW_DAYS[g].indexOf(b.dow) >= 0);
  const force = process.argv.includes('--heatmap-force');

  log(`\n【热力图】${script}（独立于抓取开关，照常执行）`);
  log(`  北京时间 ${b.date} ${b.hhmm} ${WEEK_CN[b.dow]}　班次=${plan.type}（${plan.label}）　热力图动作=${mode}`);
  log(`  开奖日判断：${games.length ? games.join('、') + ' 今天开奖' : '今天没有双色球/大乐透开奖'}`);

  if (force) {
    log('  ⚠️ --heatmap-force：忽略开奖日/时间判断，强制生成');
    run(script, ['all', '--force'], 40);
    return;
  }

  /* 班次明确要求「清空」：凌晨全量班 + 21:00 去热力图班 */
  if (mode === 'purge') {
    log('  → 清空热力图数据（页面上不会出现这张图），随后会重新生成页面');
    run(script, ['--purge']);
    return;
  }

  /* 班次明确要求「出图」：18:00 只加热力图班 */
  if (mode === 'build') {
    if (!games.length) {
      log('  → 今天不是开奖日：清空热力图数据（页面上不会出现这张图）');
      run(script, ['--purge']);
      return;
    }
    log(`  → 是开奖日（${games.join('、')}）：抓当日晒票 → 出图`);
    run(script, [games.join(',')], 40);
    return;
  }

  /* auto：沿用原来的「按时间自动判断」 */
  if (!games.length) {
    log('  → 今天不是开奖日：清空热力图数据（页面上不会出现这张图）');
    run(script, ['--purge']);
  } else if (b.hh >= 18) {
    log(`  → 是开奖日（${games.join('、')}）且已到 18:00：抓当日晒票 → 出图`);
    run(script, [games.join(',')], 40);
  } else {
    log('  → 还没到北京时间 18:00：本班次【不生成】（18:00 那一班会生成并部署）');
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

/* ---------- 把沙箱里的存档写回 saved-tickets.js ---------- */
function writeSavedTickets(ctx) {
  const savedPath = path.join(MOD, 'saved-tickets.js');
  const after = ctx.__load();
  const fileText =
    `/* ============================================================\n` +
    `   saved-tickets.js —— 推荐数据存档\n\n` +
    `   由云端构建自动写入。更新时间：${stamp()}\n` +
    `   ============================================================ */\n\n` +
    `const SAVED_TICKETS = ${JSON.stringify({ updated: stamp(), tickets: after }, null, 1)};\n`;
  fs.writeFileSync(savedPath, fileText, 'utf8');
  log('  ✅ 已写入 saved-tickets.js');
  return after;
}

/* ---------- 本期号码覆盖检查 ----------
   判断「某彩种本期有没有号码」，两个依据【取并集】：
     ① 存档里「本期开奖日」那条记录：有图 且 期号 == 下一期期号  → 算有
     ② allPeriodsOf() 里存在「未开奖 且 有图」的期次              → 算有
   为什么必须两个都看：
     · 只看 ②：开奖日当天，记录会被 hcFindDraw 按「日期相同」匹配成已开奖，
               于是明明已经摇了下一期号码，却被判成「没号码」→ 反复重摇。
     · 只看 ①：nextDrawDate 有些彩种会停在今天，拿到的可能是上一期已开奖的记录。
   返回：[{ gid, ok, issue }]
*/
function coverageOf(ctx) {
  const rows = [];
  Object.keys(ctx.__T).forEach((gid) => {
    let ok = false;
    let issue = '';
    try {
      const nd = ctx.__nextDate ? ctx.__nextDate(gid) : '';
      const ni = ctx.__nextIssue ? ctx.__nextIssue(gid) : '';
      const rec = (nd && ctx.__get) ? ctx.__get(gid, nd) : null;
      if (rec && rec.images && Object.keys(rec.images).length) {
        if (!ni || !rec.issue || String(rec.issue) === String(ni)) { ok = true; issue = rec.issue || ni; }
      }
    } catch (e) { /* 忽略 */ }
    if (!ok) {
      try {
        const periods = ctx.__all(gid);
        const cur = periods.filter((p) => !p.draw && p.images && Object.keys(p.images).length)[0];
        if (cur) { ok = true; issue = cur.issue || cur.date || ''; }
      } catch (e) { /* 忽略 */ }
    }
    rows.push({ gid, ok, issue });
  });
  return rows;
}

/** 本期还没有号码的彩种（「缺才补」就补这些） */
function missingGames(ctx) {
  return coverageOf(ctx).filter((r) => !r.ok).map((r) => r.gid);
}

/** 简报：每个彩种这一期有没有号码（不打印具体号码，日志干净） */
function rollSummary(ctx) {
  let rows = [];
  try { rows = coverageOf(ctx); } catch (e) { /* 忽略 */ }
  log('  · 本期号码覆盖：' + rows.map((r) => `${r.gid}${r.ok ? '✅' : '❌'}${r.issue ? '(' + r.issue + ')' : ''}`).join('  '));
}

/* ---------- 主流程 ---------- */
function main() {
  log('════════════════════════════════════════════');
  log(`  春风十里送大奖 · 云端构建 · ${stamp()}`);
  log('════════════════════════════════════════════');

  const ALL_GAMES = ['ssq', 'fc3d', 'kl8', 'qlc', 'dlt', 'pl3', 'pl5', 'qxc'];

  /* ============================================================
     0. 先判断这一班是哪个班次（全量 / 热力图 / 去热力图 / 开奖 / 足球）
        这一步必须在最前面 —— 后面的每一步都要看它决定做不做。
     ============================================================ */
  const slot = resolveSlot();
  const plan = planForSlot(slot.type, slot.bj);

  log(`\n【班次】${plan.type} —— ${plan.label}`);
  log(`  判断依据：${slot.why}`);
  if (slot.cron) {
    log(`  cron = ${slot.cron}${slot.hourOk === false
      ? '  ⚠️ 这条 cron 里没有当前 UTC 小时（仍按实际北京时间判断）'
      : '  ✅ cron 与当前北京时间一致'}`);
  }
  log(`  现在：北京 ${slot.bj.date} ${slot.bj.hhmm} ${WEEK_CN[slot.bj.dow]}`);
  log(`  这一班要做：${describePlan(plan)}`);

  const decision = shouldFetch();
  const histBefore = checkHistory(ALL_GAMES);

  /* 这一班抓什么：
       dataFetch = true         → 抓开奖 + 历史 + 奖级（全量班）
       dataFetch = 'draws-only' → 只抓开奖号码（21:40 开奖班）
       dataFetch = false        → 完全不抓（18:00 热力图班 / 21:00 去热力图班）
       dataFetch = 'auto'       → 走原来 shouldFetch() 的 12 小时规则 */
  let doDraws, doHistory, doPrizes;
  if (plan.dataFetch === true) { doDraws = true; doHistory = true; doPrizes = true; }
  else if (plan.dataFetch === 'draws-only') { doDraws = true; doHistory = false; doPrizes = false; }
  else if (plan.dataFetch === 'auto') { doDraws = decision.fetch; doHistory = decision.fetch; doPrizes = decision.fetch; }
  else { doDraws = false; doHistory = false; doPrizes = false; }

  /* 【足球】只要这一班是 10 个足球点之一就【一定】抓 ——
     绝不能被 shouldFetch() 的 12 小时规则跳过（足球赔率天天变）。 */
  /* 【本机测试用】--no-fetch：完全不抓数据（本机到彩票/赔率接口不通或太慢），
     只用现有数据跑「摇号 / 热力图 / 出页面」这些步骤，方便验收。 */
  const NO_FETCH = process.argv.includes('--no-fetch');
  if (NO_FETCH) {
    doDraws = false; doHistory = false; doPrizes = false;
    log('  ⚠️ --no-fetch（本机测试用）：本班次完全不抓数据');
  }

  const doFootball = !NO_FETCH
    && (plan.football === true || (plan.football === 'auto' && decision.fetch));

  log(`\n【数据来源】${decision.fetch ? '云端自己抓取' : '使用本机同步的数据'}`);
  log(`  原因：${decision.why}`);
  if (QUICK) log('  ⚡ 快速模式：跳过所有抓取，直接用同步过来的数据重新渲染（最快部署）');
  log(`  现有历史数据：${histBefore.detail}`);
  log(`  本班抓取计划：开奖=${doDraws ? '抓' : '不抓'}　历史=${doHistory ? '抓' : '不抓'}　足球=${doFootball ? '抓' : '不抓'}　奖级=${doPrizes ? '抓' : '不抓'}`);
  if (doFootball && !decision.fetch) {
    log('  ⚽ 足球班次：即使距上次同步不到 12 小时，足球也照抓（赔率天天变）');
  }

  /* ---------- 【验收用】--dry-run：只把「这一班要跑哪些步骤」列出来，不真跑 ---------- */
  if (process.argv.includes('--dry-run')) {
    const steps = [];
    const mark = (ok, text) => steps.push(`  ${ok ? '✅ 会跑  ' : '⏭  跳过 '} ${text}`);
    mark(doDraws, '【1/4】抓开奖号码（build-draws.mjs）');
    mark(doHistory, '【2/4】抓历史开奖 60 期（build-history.mjs）');
    mark(doFootball, '【3/4】抓足球 + 竞彩（build-football.mjs / build-jc.mjs）');
    mark(doPrizes, '【4/4】抓奖级奖金（build-prizes.mjs）');
    steps.push(plan.roll === 'skip'
      ? '  ⏭  跳过  【推荐号码】不重摇（号码原样保留）'
      : plan.roll === 'force'
        ? '  ✅ 会跑  【推荐号码】强制重摇【全部彩种】'
        : '  ✅ 会跑  【推荐号码】缺才补摇（已有号码的彩种不动）');
    mark(plan.publishTickets, '发布 out/tickets.json（分享页准实时数据源）');
    steps.push(plan.heatmap === 'skip'
      ? '  ⏭  跳过  【热力图】本班次不动热力图'
      : plan.heatmap === 'build'
        ? '  ✅ 会跑  【热力图】抓当日晒票 → 出图'
        : plan.heatmap === 'purge'
          ? '  ✅ 会跑  【热力图】清空热力图数据'
          : '  ✅ 会跑  【热力图】按时间自动判断（18:00 之后出图）');
    mark(plan.exportStatic === true || (plan.exportStatic === 'auto' && (doDraws || doHistory || doPrizes)),
      '生成彩票页（export-static.mjs）→ 只读分享版.html');
    mark(plan.exportFootball, '生成足球页（export-football.mjs）→ 足球推荐.html');
    steps.push('  ✅ 会跑  整理输出到 out/（index.html / football.html / tickets.json）→ 交给 workflow 部署到网页');

    log('\n【--dry-run】这一班的完整步骤：');
    steps.forEach((s) => log(s));
    log(`\n  班次类型：${plan.type}`);
    log(`  发布时间：workflow 会把 out/ 拷到 site/ 后由 deploy job 发布（deploy 用 if: always()，不会被跳过）`);
    return;
  }

  /* 1-4. 抓数据（按上面的计划） */
  if (doDraws || doHistory || doFootball || doPrizes) {
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

    const results = [];

    if (doDraws) {
      log('\n【1/4】抓开奖号码');
      results.push(run('build-draws.mjs', []));
    } else {
      log('\n【1/4】抓开奖号码 —— 本班次跳过');
    }

    if (doHistory) {
      log('\n【2/4】抓历史开奖（60 期）');
      results.push(run('build-history.mjs', ['60']));
    } else {
      log('\n【2/4】抓历史开奖 —— 本班次跳过');
    }

    if (doFootball) {
      log('\n【3/4】抓足球 + 竞彩');
      results.push(run('build-football.mjs', []));
      results.push(run('build-jc.mjs', []));
    } else {
      log('\n【3/4】抓足球 + 竞彩 —— 本班次跳过');
    }

    if (doPrizes) {
      log('\n【4/4】抓奖级');
      results.push(run('build-prizes.mjs', []));
    } else {
      log('\n【4/4】抓奖级 —— 本班次跳过');
    }

    /* 检查抓取结果，坏了就还原 */
    const histAfter = checkHistory(ALL_GAMES);
    const anyFailed = results.some((r) => !r);

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
    log('\n【1-4/4】本班次不需要抓取');
    log(`  ✅ 历史数据：${histBefore.detail}`);
  }

  /* ============================================================
     【和「快速模式」无关的步骤】
     从这里往下的东西，无论 decision.fetch 是 true 还是 false、
     无论 CLOUD_QUICK 是几，都【照常执行】：
       · 检查/补摇推荐号码（按班次决定摇不摇）
       · 发布 out/tickets.json（分享页的准实时数据源）
       · 热力图（runHeatmapStep，按班次决定出图/清空/不动）
       · 生成静态网页（每个班次都要重新出它该出的页面，否则网页不会变）
     ============================================================ */

  /* 载入存档 */
  log('\n【推荐号码】');
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
    ['__get', 'getTicket'],
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

  if (plan.roll === 'skip') {
    log(`  ⏭  本班次（${plan.type}）不重摇号码 —— 已推送出去的号原样保留`);
    rollSummary(ctx);

  } else if (plan.roll === 'force') {
    /* 【全量班】强制重摇【全部彩种】，不管本期是不是已经有号码 */
    log('  🔄 全量班次：强制重摇【全部彩种】本期号码（号码池来自 experts-data.js）');
    try {
      const stat = ctx.__roll({ force: true, keepExisting: false });
      log(`  ✅ 重摇了 ${stat.games} 个彩种 / ${stat.images} 张图 / ${stat.fields} 个字段`);
      writeSavedTickets(ctx);
      rollSummary(ctx);
    } catch (e) {
      log(`  ❌ 摇号失败：${e.message}`);
    }

  } else {
    /* 【缺才补】本期已经有号码的彩种原样保留，只补没有的 */
    let missing = [];
    try { missing = missingGames(ctx); } catch (e) { log(`  ⚠️ 检查失败：${e.message}`); }

    if (missing.length) {
      log(`  本期还没有号码的彩种：${missing.join(', ')}`);
      log('  → 只补这些（已有号码的彩种保持不动）');
      try {
        /* 【关键】必须传 only：不传的话 rollAllGames 会把 8 个彩种全部重摇一遍，
           已经推送出去、本期已经有号码的彩种也会被换号。 */
        const stat = ctx.__roll({ only: missing });
        log(`  ✅ 补摇完成：只补了 ${missing.length} 个彩种 / ${stat.images} 张图（其余彩种原样保留）`);
        writeSavedTickets(ctx);
        rollSummary(ctx);
      } catch (e) {
        log(`  ❌ 摇号失败：${e.message}`);
      }
    } else {
      log('  ✅ 所有彩种本期都有号码，未改动');
      rollSummary(ctx);
    }
  }

  /* ---------- 发布本期的号码 JSON ----------
     分享页启动后会去拉这个文件（tickets.json）：
     只要它比页面里的内联快照新，页面就【就地重渲染】成新号码 ——
     所以这一步必须在【生成网页之前】就做完：
     万一后面生成网页失败，网站上的号码照样是最新的，
     手机打开分享页也能拿到新号码（页面自带拉取+重渲染逻辑）。

     【注意】只加热力图（18:00）/ 去热力图（21:00）/ 只更新足球 这三个班次
     不重摇号码，所以也不发布 tickets.json —— 保证「不要更新其他的号码」。 */
  if (plan.publishTickets) {
    publishTicketsJson();
  } else {
    log(`  ⏭  本班次（${plan.type}）不发布 tickets.json —— 号码没变，保持原样`);
  }

  /* 热力图：按班次决定「出图 / 清空 / 不动」 */
  runHeatmapStep(plan);

  /* 3. 生成网页 ——
     【关键】每个班次都必须重新生成它该出的页面，
     否则「数据改了但网页没变」，等于这次班次白跑。 */
  log('\n生成静态网页 ...');
  const doExportStatic = plan.exportStatic === true
    || (plan.exportStatic === 'auto' && (doDraws || doHistory || doPrizes));

  const exportList = [];
  if (doExportStatic) exportList.push(['export-static.mjs', '彩票页']);
  if (plan.exportFootball) exportList.push(['export-football.mjs', '足球页']);
  if (!exportList.length) log('  ⏭  本班次不需要重新生成页面');

  for (const [file, label] of exportList) {
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

  /* ============================================================
     【发布清单】把 out/ 里即将被 workflow 拷到 site/ 的文件逐个列出来
     （文件名 + 大小 + 修改时间）—— 用来证明「这一班确实有东西要发布」。
     workflow 的「把生成的网页放到站点目录」那一步拷的就是这几个文件。
     ============================================================ */
  const p = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  log('\n【发布清单】out/ 里会被发布到网页的文件：');
  ['index.html', 'football.html', 'tickets.json'].forEach((f) => {
    const fp = path.join(OUT, f);
    if (!fs.existsSync(fp)) { log(`  ❌ ${f} 不存在 —— 这一项本次不会更新`); return; }
    const st = fs.statSync(fp);
    log(`  ✅ ${f}  ${(st.size / 1024).toFixed(1)} KB  修改于 ${fmt(st.mtime)}`);
  });

  log(`\n════════════════════════════════════════════`);
  log(`  完成 · ${stamp()}`);
  log(`  班次：${plan.type}（${plan.label}）`);
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

/* ============================================================
   【验收用】--slot-table：把 workflow 里每条 cron 的每一班都列出来，
   标出它对应的北京时间 + 会被判成哪种班次。
   直接读 .github/workflows/daily-update.yml，避免和 workflow 写重复两套。
   ============================================================ */
function readCronsFromWorkflow() {
  const wf = path.join(ROOT, '..', '.github', 'workflows', 'daily-update.yml');
  if (!fs.existsSync(wf)) return [];
  const out = [];
  fs.readFileSync(wf, 'utf8').split('\n').forEach((line) => {
    const m = /-\s*cron:\s*'([^']+)'/.exec(line);
    if (m) out.push(m[1].trim());
  });
  return out;
}

function printSlotTable() {
  const W = (n) => String(n).padStart(2, '0');
  const crons = readCronsFromWorkflow();

  log('══════════════════════════════════════════════════════════════════════════════');
  log('  on.schedule —— 全部 cron 及对应的北京时间 / 班次类型');
  log('══════════════════════════════════════════════════════════════════════════════');

  if (!crons.length) { log('  ❌ 没读到 cron（找不到 .github/workflows/daily-update.yml）'); return; }

  const FOOTBALL = FOOTBALL_BJ_HOURS.slice();
  const rows = [];

  crons.forEach((cron) => {
    const c = parseCron(cron);
    if (!c) { log(`  ⚠️ 读不懂这条 cron：${cron}`); return; }
    log('');
    log(`  ┌─ cron: '${cron}'`);
    log(`  │   UTC 分钟=${W(c.minute)}　UTC 小时=${c.hours.join(',')}`);
    log(`  │   ${'UTC 小时'.padEnd(10)}${'北京时间'.padEnd(12)}${'星期'.padEnd(6)}班次类型`);
    c.hours.slice().sort((a, b) => a - b).forEach((uh) => {
      const bjH = (uh + 8) % 24;
      const bjM = c.minute;
      /* 用真逻辑跑一遍：把「现在」和 cron 都喂给 resolveSlot() */
      const savedNow = process.env.HEATMAP_NOW;
      const savedSlot = process.env.HEATMAP_SLOT;
      process.env.HEATMAP_NOW = `2026-10-20T${W(bjH)}:${W(bjM)}`;
      process.env.HEATMAP_SLOT = cron;
      delete process.env.CLOUD_SLOT;
      let type = '?';
      try { type = resolveSlot().type; } catch (e) { type = 'ERR:' + e.message; }
      if (savedNow === undefined) delete process.env.HEATMAP_NOW; else process.env.HEATMAP_NOW = savedNow;
      if (savedSlot === undefined) delete process.env.HEATMAP_SLOT; else process.env.HEATMAP_SLOT = savedSlot;

      const isFb = FOOTBALL.indexOf(bjH) >= 0;
      const note = SLOT_LABEL[type] ? SLOT_LABEL[type] : type;
      rows.push({ cron, uh, bjH, bjM, type });
      log(`  │   ${String(W(uh) + ':00').padEnd(10)}${(W(bjH) + ':' + W(bjM)).padEnd(12)}${''.padEnd(6)}${type}  ← ${note}${isFb ? '  【足球班次】' : ''}`);
    });
    log('  └─');
  });

  /* 汇总：确认 10 个足球点都在 */
  log('');
  log('  ── 足球 10 个时间点覆盖检查（北京时间 00/02/04/06/08/12/14/18/20/22）──');
  const covered = new Set(rows.map((r) => r.bjH));
  const lines = FOOTBALL_BJ_HOURS.map((h) => {
    const ok = covered.has(h);
    const r = rows.filter((x) => x.bjH === h)[0];
    return `   北京 ${W(h)}:${r ? W(r.bjM) : '??'}  ${ok ? '✅' : '❌ 没有排班'}  ${r ? r.type : ''}`;
  });
  lines.forEach((l) => log(l));
  const miss = FOOTBALL_BJ_HOURS.filter((h) => !covered.has(h));
  log(`  结论：${miss.length ? '❌ 缺 ' + miss.map((h) => W(h) + ':00').join(', ') : '✅ 10 个足球时间点全部有排班'}`);

  /* 汇总：特殊班次 */
  log('');
  log('  ── 特殊班次检查 ──');
  ['full', 'heatmap-only', 'heatmap-off', 'draw-update'].forEach((t) => {
    const hit = rows.filter((r) => r.type === t);
    log(`   ${t.padEnd(14)} ${hit.length ? '✅ ' + hit.map((r) => `北京 ${W(r.bjH)}:${W(r.bjM)}（UTC ${W(r.uh)}:${W(r.bjM)}）`).join('、') : '❌ 没有'}`);
  });
  const fbOnly = rows.filter((r) => r.type === 'football-only');
  log(`   ${'football-only'.padEnd(14)} ${fbOnly.length} 班：` + (fbOnly.length ? fbOnly.map((r) => `北京 ${W(r.bjH)}:${W(r.bjM)}`).join('、') : '无'));
  log('══════════════════════════════════════════════════════════════════════════════');
}

/* ---------- 命令行入口 ---------- */
if (process.argv.includes('--slot-table')) {
  printSlotTable();
} else {
  main();
}
