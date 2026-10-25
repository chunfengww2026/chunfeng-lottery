// ============================================================
//  cloud-build.mjs —— 云端构建（GitHub Actions 里跑）
//
//  流程（按班次决定跑哪几步，见下面的 SLOT_PLAN）：
//    1. 抓开奖号码（多源链：一起彩 / 500 / 17500，官方 403 只作兜底）
//    2. 抓历史开奖（60 期，8 个彩种）
//    3. 抓足球赛事 + 比分（245qq）+ 竞彩列表/赔率（500.com）
//    4. 抓奖级奖金 + 专家数据（一起彩）
//    5. 附属抓取：文章正文 / 头条晒票 / 晒票图片 / 开机号+直播 / 体彩在售场次
//    6. 【出号】按算法摇号（纯 JS，在 vm 沙箱里跑，不依赖任何接口）
//    7. 热力图（开奖日 18:00 出图 / 02:00 与 21:00 清空）
//    8. 生成静态网页到 out/ + 数据新鲜度守护
//    9. 清理 72 小时缓存
//
//  【重要】「缺才补」摇号：本期已经有号码的彩种原样保留，保护已推送出去的号。
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
import { createRequire } from 'node:module';
/* 【最新开奖】从 draws.js 取各彩种最新一期开奖，写进 out/tickets.json 的 draws 字段。
   分享页拿到它就能就地重画顶部「最新开奖」区块（和 export-cloud-tickets.mjs 同一份实现）。 */
import { drawsFromDrawData } from './scripts/export-draws.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
/* 所有模块（games.js / build-*.mjs 等）都放在 scripts/ 子目录里 */
const MOD = path.join(ROOT, 'scripts');
const OUT = path.join(ROOT, 'out');

/* 【本次运行开始的时刻】用来判断「哪些页面是这一班真的重新生成过的」——
   云端每次都是全新 checkout，只有本次运行里写出来的文件，mtime 才会 >= 这个值。
   finishOutput() 靠它决定「发布新页面」还是「交给 workflow 从线上拉回兜底」。 */
const RUN_START_MS = Date.now();

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
      .filter((l) => /✅|❌|⚠️|写入|期|场|来源|占比|晒票|开奖日|OCR|票面照片|丢弃/.test(l))
      .slice(0, maxLines || 12)
      .forEach((l) => log('      ' + l.trim()));
    return true;
  } catch (e) {
    log(`  ❌ ${file} 失败：${String(e.message).slice(0, 200)}`);
    return false;
  }
}

/* ---------- 跑「可以失败」的子脚本（附属抓取：文章/头条/晒票/开机号/在售场次） ----------
   【为什么单独一个函数，不并进 run()】
     · run() 的返回值会进 results[]，任何 false 都会触发「把数据文件全部还原」。
     · 但附属抓取的退出码 10 表示「本轮没抓到新数据，保留上一次的文件」——
       这是【正常的容错结果】，不是失败，绝不该因此把开奖数据也一起还原。
   所以这里：退出码 10 → 视为成功（保留上次）；其它错误 → 只跳过这一步。 */
function runSoft(file, args) {
  const fp = path.join(MOD, file);
  if (!fs.existsSync(fp)) {
    log(`  ⚠️ 找不到 ${file} → 跳过这一步（不影响后面的步骤）`);
    return { ok: false, reason: 'missing' };
  }
  log(`  ▶ ${file} ${(args || []).join(' ')}`);
  try {
    const out = execFileSync(process.execPath, [fp, ...(args || [])], {
      cwd: MOD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000
    });
    out.split('\n')
      .filter((l) => /✅|❌|⚠️|写入|条|篇|张|场|期|保留|来源|退避/.test(l))
      .slice(0, 8)
      .forEach((l) => log('      ' + l.trim()));
    return { ok: true };
  } catch (e) {
    const code = (e && typeof e.status === 'number') ? e.status : null;

    /* 把子进程已经打出来的日志也带出来（最多 10 行），方便定位 */
    try {
      String((e && (e.stdout || '')) || '').split('\n')
        .filter((l) => /✅|❌|⚠️|退避|保留|失败/.test(l))
        .slice(0, 10)
        .forEach((l) => log('      ' + l.trim()));
    } catch (e2) { /* 忽略 */ }

    if (code === 10) {
      log('  ↩ 退出码 10 = 本轮没抓到新数据 →【保留上一次的数据】，继续跑后面的步骤');
      return { ok: true, kept: true };
    }
    log(`  ⚠️ 失败（${code === null ? '没有退出码' : '退出码 ' + code}）：${String(e.message).slice(0, 160)}`);
    log('     → 只跳过这一步，后面的步骤照常跑（开奖 / 号码 / 出页面都不受影响）');
    return { ok: false, code };
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
    USER_METHOD_RESULTS: (()=>{const req=createRequire(path.join(MOD,'core-pool.js'));return req('./user-method-results.cjs').buildUserMethodResults(MOD);})(),
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

  /* 【资料上云】把 materials-data.js 里的资料塞进 localStorage（cdd.materials.v1）：
     云端的 materialsFor() 只有从这里拿得到资料，否则渲染时资料是空的。
     （const 声明在 vm 里拿不到，用 globalThis 引一下） */
  try {
    vm.runInContext('globalThis.__MATS = (typeof MATERIALS_DATA !== "undefined") ? MATERIALS_DATA : null;', ctx);
    const md = ctx.__MATS;
    if (md && Array.isArray(md.list) && md.list.length) {
      store.set('cdd.materials.v1', JSON.stringify(md.list));
      log(`  ✔ 资料已载入沙箱：${md.list.length} 条`);
    } else {
      log('  · 资料为空（materials-data.js 里 list 是空的）');
    }
  } catch (e) { log('  ⚠️ 资料载入沙箱失败：' + e.message); }

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

   【密集班次】只看 cron 的形态，不看时刻：
     · 每 5 分钟（cron 分钟字段是 星号/5）   live-only      只更新比分：1 个请求，没比赛立刻退出
     · 每 30 分钟（cron 分钟字段是 星号/30） regular        常规：比分 + 竞彩 + 晒票 + 文章 + 开机号 + 出页面
                                                            + 缺才补摇 + 发布 tickets.json
   【密集班次为什么要「只看形态」】
     如果每 30 分钟那一班也按时刻升级成 full / heatmap-only / draw-update，
     同一分钟就会有两条 cron 同时干同一件重活（抓两遍、号码摇两遍、部署两次）。
     所以重活只交给下面这些【专用定时 cron】，密集班永远只干自己那份活。

   【定时班次】cron 分钟 + 实际北京时间 联合判断：
     · 02:00（UTC 18:00）  full           全量：抓全部数据（开奖/历史/足球/竞彩/奖级/专家）
                                          + 缺才补摇 + 清空热力图 + 清理缓存 + 发布
     · 18:00（UTC 10:00）  heatmap-only   只加热力图：抓晒票出图 + 抓足球 + 出页面；不摇号、不抓开奖
     · 21:00（UTC 13:00）  heatmap-off    只去掉热力图：清空热力图数据 + 重新出页面
     · 21:30 / 21:45（UTC 13:30 / 13:45）
                           draw-update    更新开奖号码：抓开奖（失败自动重试一次）→ 摇下一期
                                          → 出页面 → 发布
                           （两班互为重试：福彩 21:30 前后出号、体彩 21:45 前后出号，
                             抓不全时下一班 15 分钟后会再抓一遍）
     · 22:00（UTC 14:00）   draw-update    核对开奖 + 公布中奖（当天最后一次）
                                          用户 2026-10-20：「小喇叭和历史开奖要自己在晚上22点
                                          抓取开奖记录核对我的资料自行公布」。
                                          动作与 21:30/21:45 完全一样（同一个 SLOT_PLAN），
                                          三班互为重试；22:00 这班是兜底：
                                          慢开奖的彩种漏了，这一班补上 → 重新比对推荐号存档
                                          → 中了就更新历史开奖 + 小喇叭，不需要人管。
     · 23:00（UTC 15:00）   draw-update    刷新青蛙号码池（用户 2026-10-20：
                                           「青蛙号码池设置开奖后23点就自动刷新」）。
                                           号码池 = 双色球/大乐透「核心算法 20 码」，
                                           用【期号当种子】，所以期号一变池子就变。
                                           期号只由「抓到新开奖」驱动 —— 21:30 / 21:45 /
                                           22:00 三班都漏了的彩种，这一班兜底补上，
                                           池子跟着换期刷新。
                                           动作仍复用 draw-update（同一套 SLOT_PLAN）：
                                           抓开奖（缺才补 + 有漏才补摇）→ 出页面（重算 20 码）
                                           → 发布 tickets.json。
     · 老式足球整点 cron（北京 00/02/04/06/08/12/14/16/18/20/22 点）
                           football-only  只抓足球 + 重新出足球页（现在足球由每 30 分钟那班负责，
                                          这条只是兜底）

   【判断方式】cron 形态 + 实际北京时间 联合判断。
   【不能】拿 cron 字符串做精确比较（一条 cron 可以是一串小时，
   同一个表达式在不同小时触发时班次完全不同 —— 这也是它原来会失效的原因）。
   ============================================================ */
const SLOT_AT = { '02:00': 'full', '18:00': 'heatmap-only', '21:00': 'heatmap-off', '21:30': 'draw-update', '21:40': 'draw-update', '21:50': 'draw-update', '21:45': 'draw-update', '22:00': 'draw-update', '23:00': 'draw-update' };
/* 足球的 12 个班次：每 2 小时整点（北京时间）—— 只给「老式定时 cron」兜底用，
   现在足球由「每 30 分钟常规班」负责，不再依赖这张表。 */
const FOOTBALL_BJ_HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

/* GitHub 的定时任务经常会延迟几分钟才真正跑，所以给一点容差
   （from/to 是相对班次时刻的分钟数；21:00 / 21:30 / 21:45 / 22:00 / 23:00 五条挨得近，
    靠「分钟必须在同一条 cron 里」那一关来区分，容差不能太宽。
    注意 02:00 / 18:00 / 21:00 / 22:00 / 23:00 这几条的分钟都是 0（21:30 是 30、21:45 是 45），
    所以它们只能靠「离哪个时刻更近 + 各自容差」分开 —— 彼此相距 60 分钟，不会混淆） */
const SLOT_TOLERANCE = {
  'full':         { from: -10, to: 90 },
  'heatmap-only': { from: -10, to: 90 },
  'heatmap-off':  { from: -10, to: 25 },
  'draw-update':  { from: -10, to: 20 }
};

const SLOT_LABEL = {
  'full': '全量更新（北京 02:00）',
  'regular': '常规更新（每 10 分钟 · 晒票 10 分钟一轮；文章/在售场次内部钉 30 分钟）',
  'live-only': '只更新比分（每 5 分钟 · 轻量）',
  'heatmap-only': '只加热力图（北京 18:00）',
  'heatmap-hour': '只加热力图（每小时 :07）',
  'heatmap-off': '只去掉热力图（北京 21:00）',
  'draw-update': '更新开奖号码 / 核对开奖并公布中奖 / 刷新青蛙号码池（北京 21:30 / 21:45 / 22:00 / 23:00）',
  'football-only': '只更新足球（老式足球定时班次）',
  'auto': '自动 / 手动触发（沿用原来的行为）'
};

/* 每个班次到底干什么 —— 一张表看清楚，避免再散落在 main() 里
   ------------------------------------------------------------
   dataFetch : true        抓开奖 + 历史 + 奖级（全量班）
               'draws-only' 只抓开奖号码（21:30 / 21:45 / 22:00 开奖班）
               'auto-guard' 只有开奖数据明显过期（> 20 小时）才抓（常规班兜底）
               'auto'      走 shouldFetch() 的 12 小时规则
               false       完全不抓
   football  : 抓足球比分（245qq）+ 竞彩列表赔率（500.com）
   extras    : 附属抓取：文章正文 / 头条晒票 / 晒票图片 / 开机号+直播 / 体彩在售场次
   liveScores: 只跑 update-football-live.mjs（1 个请求的比分班）
   roll      : force 强制重摇全部 / fill 缺才补 / skip 不摇
   heatmap   : build 出图 / purge 清空 / skip 不动 / auto 按时间自动判断
   cleanup   : 跑 cleanup-cache.mjs（72 小时缓存清理） */
const SLOT_PLAN = {
  /* 【全量班】抓全部数据 + 缺才补摇 + 清空热力图
     ⚠️ roll 用 fill 而不是 force：同一分钟会有两条 cron 都落到这一班
        （每 30 分钟那条 + 专用 0 18 那条），force 会把已经发布出去的号码摇两遍。 */
  'full':          { /* __ROLL2__ */ dataFetch: true,         football: true,  extras: true,  liveScores: false, roll: 'force', heatmap: 'skip', publishTickets: true,  exportStatic: true,   exportFootball: true,  cleanup: true  },
  /* 【常规班】每 30 分钟：比分 + 竞彩 + 晒票 + 文章 + 开机号 + 出页面 */
  'regular':       { dataFetch: 'auto-guard', football: true,  extras: true,  liveScores: false, roll: 'fill', heatmap: 'skip',  publishTickets: true,  exportStatic: true,   exportFootball: true,  cleanup: false },
  /* 【轻量班】每 5 分钟：只更新比分（1 个请求；没有进行中的比赛就立刻退出） */
  'live-only':     { dataFetch: false,        football: false, extras: false, liveScores: true,  roll: 'skip', heatmap: 'skip',  publishTickets: false, exportStatic: false,  exportFootball: false, cleanup: false },
  'heatmap-only':  { dataFetch: false,        football: true,  extras: true,  liveScores: false, roll: 'skip', heatmap: 'build', publishTickets: false, exportStatic: true,   exportFootball: true,  cleanup: false },
  'heatmap-off':   { dataFetch: false,        football: false, extras: false, liveScores: false, roll: 'skip', heatmap: 'skip', publishTickets: false, exportStatic: true,   exportFootball: false, cleanup: false },
  'draw-update':   { dataFetch: 'draws-only', football: false, extras: true,  liveScores: false, roll: 'fill', heatmap: 'skip',  publishTickets: true,  exportStatic: true,   exportFootball: true,  cleanup: false },
  'football-only': { dataFetch: 'auto',       football: true,  extras: false, liveScores: false, roll: 'skip', heatmap: 'skip',  publishTickets: false, exportStatic: 'auto', exportFootball: true,  cleanup: false },
  /* 【每小时热力图 · 轻班】用户 2026-10-17「每一小时更新一次」：
     只抓晒票 OCR + 出热力图 + 重出页面。不抓足球/文章/晒票列表（那些 10 分钟
     的常规班已经在抓，这里再抓一遍只会把源站问爆）、不摇号。 */
  'heatmap-hour':  { dataFetch: false,        football: false, extras: false, liveScores: false, roll: 'skip', heatmap: 'build', publishTickets: false, exportStatic: true,   exportFootball: false, cleanup: false },
  'auto':          { dataFetch: 'auto',       football: 'auto', extras: true, liveScores: false, roll: 'fill', heatmap: 'auto',  publishTickets: true,  exportStatic: true,   exportFootball: true,  cleanup: false }
};

/** 解析 cron 的「分钟 / 小时」字段（支持 5、5,10、1-5、星号/步长 三种写法）
 *  返回排好序的数组；解析不出来返回空数组 */
function parseCronField(spec, max) {
  const out = new Set();
  String(spec || '').split(',').forEach((raw) => {
    const part = raw.trim();
    if (!part) return;

    /* 通配符：*  → 整个区间（0..max） */
    if (part === '*') {
      for (let v = 0; v <= max; v++) out.add(v);
      return;
    }

    /* 星号/步长：星号/30 → 0,30 ；3-15/2 → 3,5,7… */
    const step = /^(.+?)\/(\d+)$/.exec(part);
    if (step) {
      const n = parseInt(step[2], 10);
      if (!n) return;
      let lo = 0, hi = max;
      if (step[1] !== '*') {
        const r = /^(\d+)-(\d+)$/.exec(step[1]);
        if (r) { lo = parseInt(r[1], 10); hi = parseInt(r[2], 10); }
        else {
          const v = parseInt(step[1], 10);
          if (isNaN(v)) return;
          lo = v; hi = max;
        }
      }
      for (let v = lo; v <= hi; v += n) out.add(v);
      return;
    }

    /* 区间：1-5 */
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      for (let v = +range[1]; v <= +range[2]; v++) out.add(v);
      return;
    }

    /* 单个数字 */
    const one = parseInt(part, 10);
    if (!isNaN(one)) out.add(one);
  });
  return Array.from(out).filter((n) => n >= 0 && n <= max).sort((a, b) => a - b);
}

/** 从 cron 表达式里解析出「分钟集合」「UTC 小时集合」，并识别两个密集班次
 *
 *  '0 0,4,6 * * *'            → minutes=[0]      hours=[0,4,6]  kind='custom'
 *  星号斜杠30 星号 星号 星号 星号 → minutes=[0,30]   hours=0..23   kind='every30'
 *  星号斜杠5  星号 星号 星号 星号 → minutes=[0,5..55] hours=0..23  kind='every5'
 *
 *  【为什么必须能解析 星号/30 和 星号/5】这两条 cron 的分钟字段不是纯数字，
 *  旧版用 parseInt('星号/30') 会得到 NaN → 整条 cron 被判成「读不懂」→
 *  班次全部退化成 auto，等于定时任务全废。这是最容易踩的坑，必须支持。
 *
 *  kind 的用途（把「密集班次」和「定时班次」分开）：
 *    · every5  → 轻量班：只更新比分（1 个请求，没比赛就立刻退出）
 *    · every30 → 常规班：比分 + 竞彩 + 晒票 + 文章 + 开机号 + 出页面
 *    · custom  → 定时班：按时刻判断（02:00 全量 / 18:00 热力图 / 21:00 去热力图 /
 *                21:30 与 21:45 开奖）—— 重活只由这些专用 cron 干，避免重复。 */
function parseCron(expr) {
  const f = String(expr || '').trim().split(/\s+/);
  if (f.length < 5) return null;

  const minutes = parseCronField(f[0], 59);
  const hours = parseCronField(f[1], 23);
  if (!minutes.length || !hours.length) return null;

  const allHours = hours.length === 24;
  /* 【错峰 5 分钟】2026-10-20：workflow 里加了一条「错峰」的 5 分钟 cron ——
     分钟字段写成 2,7,12,…57（12 个值、步长 5，但整体从 :02 起，
     为的是不在 :00 整点和其它 cron 撞 concurrency）。
     它不是 星号/5，所以老写法 minutes[i]===i*5 认不出来 → 会掉到下面的
     「定时班」判断里按北京小时误判成 football-only / auto，
     等于每 5 分钟跑一次带页面的班（绝对不行）。
     所以判据改成「个数 = 60/n 且步长恒为 n 且起点在 [0,n)」——
     星号/5（起点 0）和错峰版（起点 2）都能认成 every5 → live-only。 */
  const isStep = (n) => minutes.length === Math.ceil(60 / n)
    && minutes[0] >= 0 && minutes[0] < n
    && minutes.every((v, i) => v === minutes[0] + i * n);
  let kind = 'custom';
  if (allHours && isStep(5)) kind = 'every5';
  else if (allHours && isStep(10)) kind = 'every10';
  else if (allHours && isStep(30)) kind = 'every30';

  return { minute: minutes[0], minutes, hours, kind };
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
  const minuteOk = cron.minutes.indexOf(b.mm) >= 0;

  /* ---------- 【密集班次 1】每 5 分钟：只更新比分（最轻） ----------
     一次请求；没有进行中的比赛就立刻退出（脚本自己判断）。
     绝不做全量：不做 heatmap、不摇号、不抓开奖、不抓文章/晒票。 */
  if (cron.kind === 'every5') {
    return {
      type: 'live-only',
      why: `cron「${cronStr}」（每 5 分钟）+ 北京 ${b.hhmm} → 只更新比分（轻量班）`,
      bj: b, cron: cronStr, hourOk, minuteOk
    };
  }

  /* ---------- 【密集班次 2】每 10 分钟：常规班（晒票要 10 分钟一轮） ----------
     用户要求：「晒票…改成10分钟在全网获取一遍」。
     这一班和 every30 那班【完全同一套动作】（extras 里那两个不需要 10 分钟的
     步骤由脚本自己的 --min-gap 把关，见 update-articles-30min.cmd 的说明），
     所以这里直接复用 'regular' 班次计划，不新造一个 plan。
     ⚠️ 为什么可以两条 cron 都指向 regular：cloud-build 只发布【真的重新生成过】
        的页面，而且 workflow 上有 concurrency 去重，不会互相踩。 */
  if (cron.kind === 'every10') {
    return {
      type: 'regular',
      why: `cron「${cronStr}」（每 10 分钟）+ 北京 ${b.hhmm} → 常规班（晒票 10 分钟一轮）`,
      bj: b, cron: cronStr, hourOk, minuteOk
    };
  }

  /* ---------- 【密集班次 3】每 30 分钟：常规班 ----------
     比分 + 竞彩 + 晒票 + 文章 + 开机号 + 出页面 + 缺才补摇 + 发布。
     全量 / 热力图 / 开奖这些重活由专用定时 cron 负责，
     这里【不再】按时刻升级，否则同一分钟两条 cron 会把同一件重活干两遍。 */
  if (cron.kind === 'every30') {
    return {
      type: 'regular',
      why: `cron「${cronStr}」（每 30 分钟）+ 北京 ${b.hhmm} → 常规班（重活交给专用定时 cron）`,
      bj: b, cron: cronStr, hourOk, minuteOk
    };
  }

  /* ---------- 【每小时热力图】用户 2026-10-17 要求「热力图每小时更新一次」 ----------
     workflow 里那条 cron 是 '7 * * * *'（UTC :07 = 北京 :07）：
       · 排在 :07 是为了【避开 :00 那批「每5分钟 / 每10分钟 / 每30分钟」的密集班】，
         否则同一分钟五条 cron 一起触发，concurrency 会互相取消（实测风暴）。
       · 这一班只做热力图（抓晒票 OCR + 出图 + 重出页面），不摇号、不抓开奖。
     识别方式：分钟只有一个且等于 7（其他专用 cron 的分钟是 0 / 30 / 45）。 */
  if (cron.minutes.length === 1 && cron.minutes[0] === 7) {
    return {
      type: 'heatmap-hour',
      why: `cron「${cronStr}」（每小时 :07）+ 北京 ${b.hhmm} → 热力图轻班（每小时更新一次）`,
      bj: b, cron: cronStr, hourOk, minuteOk
    };
  }

  // A delayed runner still belongs to the schedule that triggered it.
  if (cron.hours.length === 1 && cron.minutes.length === 1) {
    const scheduled = String((cron.hours[0] + 8) % 24).padStart(2, '0') + ':' + String(cron.minutes[0]).padStart(2, '0');
    if (SLOT_AT[scheduled]) return { type: SLOT_AT[scheduled], why: '按触发 cron 识别 ' + scheduled + ' 班次（不受排队延迟影响）', bj: b, cron: cronStr, hourOk, minuteOk };
  }
  const bjMin = b.hh * 60 + b.mm;
  let best = null;
  Object.keys(SLOT_AT).forEach((at) => {
    const type = SLOT_AT[at];
    const seg = at.split(':');
    const atH = +seg[0];
    const atM = +seg[1];
    /* 【分钟必须先对上】21:30 那条 cron 的分钟是 30、21:45 那条是 45、
       21:00 那条是 0 —— 不靠分钟区分的话，
       北京 21:30 会被误判成 21:00 的「去热力图」班，21:45 又会被判成 21:30。
       【22:00 同一分钟=0 的四条怎么分】02:00 / 18:00 / 21:00 / 22:00 的分钟都是 0，
       所以光看分钟不够 —— 下面再按「离哪个时刻最近 + 那个班次的容差」挑 best，
       距离一样近才需要担心，而这四条相隔都是小时级（差 ≥ 60 分钟），不可能混淆。 */
    if (cron.minutes.indexOf(atM) < 0) return;
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
  if (plan.liveScores) {
    return '只跑实时比分（1 个请求；没有进行中的比赛就立刻退出）｜不抓开奖/不摇号/不发布 tickets.json'
      + '｜页面由那个脚本自己按需重出';
  }
  const bits = [];
  bits.push(plan.dataFetch === true ? '抓全部数据（开奖+历史+足球+奖级+专家）'
    : plan.dataFetch === 'draws-only' ? '只抓开奖号码'
    : plan.dataFetch === 'auto-guard' ? '开奖数据过期（>20 小时）才补抓'
    : plan.dataFetch === false ? '不抓开奖/历史（本班次不碰）'
    : '开奖/历史按 12 小时规则决定');
  if (plan.football === true) bits.push('抓足球 + 竞彩 ✅');
  else if (plan.football === false) bits.push('不抓足球');
  else bits.push('足球按 12 小时规则决定');
  if (plan.extras) bits.push('抓文章/头条/晒票/开机号/在售场次 ✅');
  else bits.push('不抓文章/晒票/开机号');
  bits.push(plan.roll === 'force' ? '强制重摇【全部彩种】'
    : plan.roll === 'fill' ? '号码缺才补摇'
    : '不摇号');
  bits.push(plan.heatmap === 'build' ? '热力图：抓晒票出图'
    : plan.heatmap === 'purge' ? '热力图：清空'
    : plan.heatmap === 'skip' ? '热力图：不动'
    : '热力图：按时间自动判断');
  bits.push(plan.publishTickets ? '发布 tickets.json' : '不发布 tickets.json');
  if (plan.cleanup) bits.push('清理 72 小时缓存');
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

  /* 【OCR 前置检查】热力图的主口径是「票面照片 OCR」。
     引擎（tesseract.js + WASM）和语言数据都放在 scripts/runtime/ocr/ 下，
     由本机 sync-cloud.mjs 一起同步过来 —— 云端完全离线可跑。
     这里只做「在不在」的检查并打日志；缺了也不会中断，
     build-heatmap.mjs 会自己降级成历史兜底口径。 */
  const ocrBase = path.join(MOD, 'runtime', 'ocr');
  const ocrNeed = [
    ['模块', path.join(MOD, 'ocr-tickets.mjs')],
    ['引擎', path.join(ocrBase, 'node_modules', 'tesseract.js', 'src', 'index.js')],
    ['WASM', path.join(ocrBase, 'node_modules', 'tesseract.js-core', 'index.js')],
    ['模型', path.join(ocrBase, 'tessdata', 'chi_sim.traineddata.gz')]
  ];
  const ocrMiss = ocrNeed.filter(([, p]) => !fs.existsSync(p)).map(([n]) => n);
  if (ocrMiss.length) {
    log(`  ⚠️ 票面照片 OCR 前置检查：缺 ${ocrMiss.join('、')} → 本次会降级成「近 30 期开奖频率」`);
    log(`     修复：本机跑一次 cloud\\sync-cloud.mjs 把 runtime/ocr 同步上来`);
  } else {
    log('  ✅ 票面照片 OCR 前置检查：模块 + 引擎 + WASM + 语言模型齐备（纯 JS，离线可跑）');
  }

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

  /* 【每小时热力图 · 轻班】用户 2026-10-17：
       「热力图…每一小时更新一次」+ 再加节流「同一小时只抓一次」。
     与 18:00 那班不同：不要求在开奖日、不清空数据、距上次成功不足 55 分钟就只重出页面。 */
  if (plan.type === 'heatmap-hour') {
    const lastMs = heatmapLastUpdatedMs();
    const mins = lastMs ? (Date.now() - lastMs) / 60000 : Infinity;
    if (mins < 55) {
      log(`  ⏭ 距上次成功抓取 ${mins.toFixed(0)} 分钟（<55）→ 本班只重出页面，不重抓晒票`);
      return;
    }
    log(`  → 每小时热力图班：抓晒票 → 出图（上次成功：${lastMs ? Math.round(mins) + ' 分钟前' : '无记录'}）`);
    /* --force：忽略「开奖日才出图」的老规矩 —— 用户要的是每小时都更新，
       而大乐透在非开奖日也有在售期次、晒票照样有。build-heatmap 会合并写回，
       不会把另一个彩种刚抓到的数据抹掉。 */
    run(script, ['ssq,dlt', '--force'], 40);
    return;
  }

  /* 班次明确要求「出图」：18:00 只加热力图班 */
  if (mode === 'build') {
    if (!games.length) {
      /* 【2026-10-17 改】改成每小时更新后，非开奖日【不再清空】——
         否则 18:00 那班会把每小时辛苦抓到的数据删掉。 */
      log('  → 今天不是开奖日：保留现有热力图数据（每小时更新，不再清空）');
      return;
    }
    log(`  → 是开奖日（${games.join('、')}）：抓当日晒票 → 出图`);
    run(script, [games.join(',')], 40);
    return;
  }

  /* auto：沿用原来的「按时间自动判断」 */
  if (!games.length) {
    /* 【2026-10-17 改】非开奖日不再清空（每小时更新后，数据要留着） */
    log('  → 今天不是开奖日：保留现有热力图数据（每小时更新，不再清空）');
  } else if (b.hh >= 18) {
    log(`  → 是开奖日（${games.join('、')}）且已到 18:00：抓当日晒票 → 出图`);
    run(script, [games.join(',')], 40);
  } else {
    log('  → 还没到北京时间 18:00：本班次【不生成】（每小时 :07 那班会生成并部署）');
  }
}

/* 【每小时热力图的节流基准】读 heatmap-data.js 里的 updated（北京时间文本）
   → 返回毫秒时间戳；读不到/解析失败返回 0 */
function heatmapLastUpdatedMs() {
  for (const base of [MOD, OUT, ROOT]) {
    const p = path.join(base, 'heatmap-data.js');
    try {
      if (!fs.existsSync(p)) continue;
      const t = fs.readFileSync(p, 'utf8');
      const m = t.match(/updated:\s*'([^']+)'/);
      if (!m) continue;
      /* 文件里是北京时间 'YYYY-MM-DD HH:MM' → 按 +08:00 解析成绝对时间 */
      const ms = Date.parse(String(m[1]).replace(' ', 'T') + ':00+08:00');
      if (isFinite(ms)) return ms;
    } catch (e) { /* 换下一个位置 */ }
  }
  return 0;
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

/* ============================================================
   【数据新鲜度守护】
   ------------------------------------------------------------
   用户最怕的一件事：电脑长期不开，网页【悄悄】变旧了还不知道。
   做法：直接读每个数据文件【自己写在里面的】更新时间字段（北京时间字符串），
   再和「现在」比 —— 超过预期就算「可能未更新」：
     · 构建日志里 ❌ / ⚠️ 明着报警（同时给 Actions 一条注解）
     · 网页顶部加一条醒目提示条（新元素，绝不碰原有倒计时和状态条）

   【为什么不用文件的修改时间】
     GitHub Actions 每次都是全新 checkout，所有文件的 mtime 都被刷成
     「刚刚」—— mtime 在云端完全不可信。数据文件里自带的 updated 字段
     是跟着内容走的，commit 回来也还在，才是可靠的依据。
   ============================================================ */
const FRESHNESS = [
  { file: 'draws.js',         label: '开奖号码',     maxH: 30, crit: true  },
  { file: 'history.js',       label: '历史开奖',     maxH: 30, crit: true  },
  { file: 'prize-data.js',    label: '奖级奖金',     maxH: 30, crit: false },
  { file: 'football.js',      label: '足球比分',     maxH: 4,  crit: false },
  { file: 'jc-data.js',       label: '竞彩赔率',     maxH: 4,  crit: false },
  { file: 'articles-data.js', label: '文章参考',     maxH: 4,  crit: false },
  { file: 'xysp-data.js',     label: '晒票栏',       maxH: 4,  crit: false },
  { file: 'kjh-data.js',      label: '开机号/直播',  maxH: 30, crit: false },
  { file: 'experts-data.js',  label: '专家数据',     maxH: 30, crit: false },
  { file: 'jc-official.js',   label: '体彩在售场次', maxH: 26, crit: false,
    note: '体彩官网在美国 IP 被拒（HTTP 567），云端抓不到，只能沿用本机同步过来的值' }
];

/** 把「2026-10-16 02:33(:09)」这样的北京时间字符串转成时间戳（和服务器时区无关） */
function parseBeijingStamp(s) {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5], +(m[6] || 0));
}

/** 从数据文件里抠出更新时间：优先 "updated" 字段，退而求其次找「更新时间/生成时间：」 */
function readDataStamp(file) {
  const p = path.join(MOD, file);
  if (!fs.existsSync(p)) return { stamp: '', missing: true };
  let head = '';
  try {
    head = fs.readFileSync(p, 'utf8').slice(0, 4000);
  } catch (e) {
    return { stamp: '', missing: false };
  }
  const m1 = /"updated"\s*:\s*"([^"]+)"/.exec(head);
  if (m1) return { stamp: m1[1], missing: false };
  const m2 = /(?:更新时间|生成时间)\s*[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2})/.exec(head);
  if (m2) return { stamp: m2[1], missing: false };
  return { stamp: '', missing: false };
}

/** 逐项体检，返回 [{file,label,maxH,crit,stamp,ageH,stale,missing}] */
function checkFreshness() {
  const now = Date.now();
  return FRESHNESS.map((it) => {
    const r = readDataStamp(it.file);
    const t = parseBeijingStamp(r.stamp);
    const ageH = t === null ? null : (now - t) / 3600000;
    return Object.assign({}, it, r, { ageH, stale: (ageH === null) || (ageH > it.maxH) });
  });
}

/** 体检结果 → 日志（❌/⚠️ 明着报警）+ Actions 注解 */
function reportFreshness(rows) {
  log('\n【数据新鲜度守护】每个数据文件自己的更新时间 vs 现在');
  rows.forEach((r) => {
    const ageTxt = r.ageH === null
      ? `读不到时间戳${r.stamp ? '（' + r.stamp + '）' : ''}`
      : `${r.ageH.toFixed(1)} 小时前（${r.stamp}）`;
    if (r.stale) {
      log(`  ${r.crit ? '❌' : '⚠️'} ${r.label}：最后更新 ${ageTxt}　预期 ≤ ${r.maxH} 小时`);
      if (r.note) log(`      说明：${r.note}`);
      /* Actions 界面上也会出现一条醒目注解 */
      console.log(`::${r.crit ? 'error' : 'warning'}::【数据可能未更新】${r.label}：最后更新 ${r.stamp || '未知'}，已超过预期 ${r.maxH} 小时`);
    } else {
      log(`  ✅ ${r.label}：${ageTxt}`);
    }
  });
  const stale = rows.filter((r) => r.stale);
  const crit = stale.filter((r) => r.crit);
  log(stale.length
    ? `  结论：${crit.length ? '❌' : '⚠️'} ${stale.length} 项数据可能未更新（${stale.map((r) => r.label).join('、')}）`
      + ' → 网页顶部会有醒目提示条'
    : '  结论：✅ 全部数据都在预期时间内（网页顶部会显示绿色的"云端自动更新正常"）');
  return { stale: stale.length, crit: crit.length };
}

/** 把提示条插进网页（新元素，独立 style/id，和原有倒计时/状态条完全无关） */
function injectFreshnessBanner(html, rows) {
  const b = beijingNow();
  const stale = rows.filter((r) => r.stale);
  const crit = stale.filter((r) => r.crit);
  const cls = crit.length ? 'bad' : (stale.length ? 'warn' : 'ok');
  const head = stale.length
    ? (crit.length ? '❌ 数据可能未更新' : '⚠️ 部分数据可能未更新')
    : '✅ 云端自动更新正常';
  const detail = stale.length
    ? stale.slice(0, 4).map((r) =>
        `${r.label} 最后更新 ${r.stamp || '未知'}（已 ${r.ageH === null ? '?' : r.ageH.toFixed(1)} 小时）`).join('　·　')
      + (stale.length > 4 ? `　·　另有 ${stale.length - 4} 项` : '')
    : `所有数据都在预期时间内　构建于 ${b.date} ${b.hhmm}`;

  const style = '<style id="roFreshGuardStyle">'
    + '.ro-fresh-guard{font:12px/1.6 -apple-system,"Microsoft YaHei",Arial,sans-serif;'
    + 'padding:7px 12px;text-align:center;letter-spacing:.2px;background:#15321f;color:#bfe9d2;'
    + 'border-bottom:1px solid #1f4a2e}'
    + '.ro-fresh-guard.warn{background:#4a3410;color:#ffe6b0;border-bottom-color:#7a5a1a}'
    + '.ro-fresh-guard.bad{background:#4a1414;color:#ffc9c9;border-bottom-color:#7a1a1a}'
    + '.ro-fresh-guard b{color:#fff;font-weight:700}'
    + '</style>';
  const bar = `<div class="ro-fresh-guard ${cls}" id="roFreshGuard"><b>${head}</b>　${detail}</div>`;

  let out = String(html);
  if (out.indexOf('id="roFreshGuard"') >= 0) return out;   /* 已经有了就不重复插 */
  out = out.replace('</head>', style + '</head>');
  out = out.replace(/<body([^>]*)>/, `<body$1>${bar}`);
  return out;
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
  log(`  春风 · 云端构建 · ${stamp()}`);
  log('════════════════════════════════════════════');

  const ALL_GAMES = ['ssq', 'fc3d', 'kl8', 'qlc', 'dlt', 'pl3', 'pl5', 'qxc'];

  /* ============================================================
     0. 先判断这一班是哪个班次（全量 / 热力图 / 去热力图 / 开奖 / 足球）
        这一步必须在最前面 —— 后面的每一步都要看它决定做不做。
     ============================================================ */
  const slot = resolveSlot();
  const plan = planForSlot(slot.type, slot.bj);
  if (QUICK) Object.assign(plan, {
    dataFetch: false, football: false, extras: false, liveScores: false,
    roll: 'skip', heatmap: 'skip', publishTickets: true,
    exportStatic: true, exportFootball: true, cleanup: false
  });

  log(`\n【班次】${plan.type} —— ${plan.label}`);
  log(`  判断依据：${slot.why}`);
  if (slot.cron) {
    log(`  cron = ${slot.cron}${slot.hourOk === false
      ? '  ⚠️ 这条 cron 里没有当前 UTC 小时（仍按实际北京时间判断）'
      : '  ✅ cron 与当前北京时间一致'}`);
  }
  log(`  现在：北京 ${slot.bj.date} ${slot.bj.hhmm} ${WEEK_CN[slot.bj.dow]}`);
  log(`  这一班要做：${describePlan(plan)}`);

  /* ============================================================
     【事先抓取】用户 2026-10-18：「所有抓取的功能都要事先抓取」「全部到云端」
     ------------------------------------------------------------
     · 只在【全量班】（北京 02:00）先跑一遍 prefetch-all.mjs：把 18 项抓取
       一次性抓完、写成数据文件；后面的分项步骤再跑一遍也是幂等的（只写数据，
       不碰页面模板），页面构建时只读现成数据。
     · --fast 跳过专家抓取（专家在下面自己的步骤里跑，避免重复那 5 分钟）。
     · 想临时关掉：环境变量 PREFETCH_ALL=0。
     · 抓取失败不阻断构建：用 runSoft，失败只记日志。
     ============================================================ */
  if (!QUICK && plan.type === 'full' && process.env.PREFETCH_ALL !== '0') {
    log('\n【事先抓取】prefetch-all.mjs --fast —— 先把全部数据抓下来，页面只读现成数据');
    const tPre = Date.now();
    runSoft('prefetch-all.mjs', ['--fast']);
    log(`  事先抓取结束（${((Date.now() - tPre) / 1000).toFixed(0)}s）`);
  }

  /* ============================================================
     【每 5 分钟那一班】只更新比分 —— 最轻的一班
     ------------------------------------------------------------
     只有 1 个请求（245qq 的「进行中」列表）：
       · 没有进行中的比赛 → 脚本自己立刻退出（不重写、不出页面、不同步）
       · 有比赛 → 只把比分/比赛时间写回 football.js，然后按需重出页面
     ⚠️ 用的是 --cloud-light：跳过本机同步、跳过晒票抓取、跳过 tickets 导出
        （晒票和 tickets 由每 30 分钟那一班负责，这里绝不重复抓）。
     ============================================================ */
  if (plan.liveScores) {
    log('\n【实时比分】本班次只更新比分（轻量班：不抓开奖、不摇号、不动号码）');
    if (process.argv.includes('--dry-run')) {
      log('\n【--dry-run】这一班的完整步骤：');
      log('  ✅ 会跑  【1】实时比分（update-football-live.mjs --cloud-light）：1 个请求');
      log('  ⏭  跳过  没有进行中的比赛 / 比分没变化 → 脚本自己退出，不重出页面、不部署');
      log('  ✅ 会跑  【2】数据新鲜度守护（体检 + 网页顶部提示条）');
      log('  ✅ 会跑  【3】整理输出到 out/ → 交给 workflow 部署');
      log('\n  班次类型：live-only');
      return;
    }
    const liveFp = path.join(MOD, 'update-football-live.mjs');
    if (!fs.existsSync(liveFp)) {
      log('  ⚠️ 找不到 update-football-live.mjs → 本班次什么都不做（不影响网站）');
    } else {
      let liveOut = '';
      try {
        liveOut = execFileSync(process.execPath, [liveFp, '--cloud-light'], {
          cwd: MOD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 480000
        });
      } catch (e) {
        liveOut = String((e && (e.stdout || '')) || '');
        log(`  ⚠️ 实时比分脚本退出异常（不影响网站，下一次 5 分钟班次会再来）：${String(e.message).slice(0, 140)}`);
      }
      String(liveOut).split('\n')
        .filter((l) => /✅|❌|⚠️|⚽|📝|💤|⏸|⏭|🔒|🛑|↩/.test(l))
        .slice(0, 16)
        .forEach((l) => log('    ' + l.trim()));
    }
    /* 页面已经由那个脚本按需重出（没有变化就不重出，省一次部署）——
       这里只负责把产物整理到 out/ 并加上新鲜度提示条 */
  /* __DRAW_WATCH__ 用户 2026-10-18：开奖后必须立刻公布（一直抓，抓到为止）
     5 分钟班先抓一次开奖号：期号变了 → 立刻重算播报 + 重出彩票页；没变则什么都不做。 */
  try {
    const drawsFp = path.join(MOD, 'draws.js');
    const sig = () => (fs.existsSync(drawsFp) ? String(fs.statSync(drawsFp).mtimeMs) : '0');
    const before = sig();
    if (fs.existsSync(path.join(MOD, 'build-draws.mjs'))) {
      try { run('build-draws.mjs', [], 12); } catch (e) { log('  ⚠️ 抓开奖号失败（下轮再试）：' + String(e.message).slice(0, 70)); }
      if (sig() !== before) {
        log('  🎯 开奖号有变化 → 立刻重算播报 + 重出彩票页');
        try { run('build-broadcast.mjs', [], 20); } catch (e) { log('  ⚠️ 播报失败：' + String(e.message).slice(0, 60)); }
        /* 【🔥 人气数字】重出彩票页之前先取一次不蒜子的数（页面要把它写死） */
        try { runSoft('fetch-busuanzi.mjs', []); } catch (e) { log('  ⚠️ 不蒜子取数失败（沿用上次的数）：' + String(e.message).slice(0, 60)); }
        try { run('export-static.mjs', []); } catch (e) { log('  ⚠️ 页面失败：' + String(e.message).slice(0, 60)); }
      } else { log('  ⏭ 开奖号没变化（继续等下一班）'); }
    }
  } catch (e) { log('  ⚠️ 开奖守护异常（不影响网站）：' + String(e.message).slice(0, 70)); }

    const freshRows = checkFreshness();
    reportFreshness(freshRows);
    finishOutput(freshRows);
    return;
  }

  const decision = shouldFetch();
  const histBefore = checkHistory(ALL_GAMES);

  /* 这一班抓什么：
       dataFetch = true         → 抓开奖 + 历史 + 奖级（全量班）
       dataFetch = 'draws-only' → 只抓开奖号码（21:30 / 21:45 / 22:00 开奖班）
       dataFetch = 'auto-guard' → 只有开奖数据明显过期（> 20 小时）才补抓（常规班兜底）
       dataFetch = false        → 完全不抓（18:00 热力图班 / 21:00 去热力图班）
       dataFetch = 'auto'       → 走原来 shouldFetch() 的 12 小时规则 */
  let doDraws, doHistory, doPrizes;
  if (plan.dataFetch === true) { doDraws = true; doHistory = true; doPrizes = true; }
  else if (plan.dataFetch === 'draws-only') { doDraws = true; doHistory = false; doPrizes = false; }
  else if (plan.dataFetch === 'auto-guard') {
    /* 【兜底保护】常规班（每 30 分钟）本来不抓开奖 ——
       但万一是「电脑关了一个月 + 21:30/21:45 那两班也被 GitHub 跳过了」，
       开奖数据就会一直旧着。所以这里加一道保险：
       开奖数据已经超过 20 小时没更新 → 本班顺手补抓一次。 */
    const dRow = checkFreshness().filter((r) => r.file === 'draws.js')[0];
    // During the draw window every regular ten-minute run must query sources.
    // File freshness alone cannot prove that today's draw has been retrieved.
    const drawWindow = beijingNow().hh >= 21;
    doDraws = drawWindow || !dRow || dRow.ageH === null || dRow.ageH > 20;
    doHistory = false; doPrizes = false;
    log(`  🛡  开奖数据兜底检查：draws.js ${dRow && dRow.ageH !== null ? dRow.ageH.toFixed(1) + ' 小时前更新' : '读不到时间戳'}`
      + ` → ${doDraws ? '开奖窗口或数据过期，本班补抓一次' : '窗口外且数据新鲜，本班不抓'}`);
  }
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
    mark(doDraws, '【1】抓开奖号码（build-draws.mjs，多源链：一起彩/500/17500）');
    mark(doHistory, '【2】抓历史开奖 60 期（build-history.mjs）');
    mark(doFootball, '【3】抓足球比分 + 竞彩赔率（build-football.mjs / build-jc.mjs）');
    mark(doPrizes, '【4】抓奖级奖金（build-prizes.mjs）+ 专家数据（build-experts.mjs）');
    mark(plan.extras, '【5】附属抓取：文章正文 / 头条晒票 / 晒票图片 / 开机号+直播 / 体彩在售场次');
    steps.push(plan.roll === 'skip'
      ? '  ⏭  跳过  【6】推荐号码：不重摇（号码原样保留）'
      : plan.roll === 'force'
        ? '  ✅ 会跑  【6】推荐号码：强制重摇【全部彩种】'
        : '  ✅ 会跑  【6】推荐号码：缺才补摇（已有号码的彩种不动）');
    mark(plan.publishTickets, '【7】发布 out/tickets.json（分享页准实时数据源）');
    steps.push(plan.heatmap === 'skip'
      ? '  ⏭  跳过  【8】热力图：本班次不动'
      : plan.heatmap === 'build'
        ? '  ✅ 会跑  【8】热力图：抓当日晒票 → 出图'
        : plan.heatmap === 'purge'
          ? '  ✅ 会跑  【8】热力图：清空热力图数据'
          : '  ✅ 会跑  【8】热力图：按时间自动判断（18:00 之后出图）');
    steps.push('  ✅ 会跑  【9】取不蒜子热度数字（fetch-busuanzi.mjs）→ busuanzi.json（抓不到沿用上次）');
    mark(plan.exportStatic === true || (plan.exportStatic === 'auto' && (doDraws || doHistory || doPrizes)),
      '【9】生成彩票页（export-static.mjs）→ 只读分享版.html');
    mark(plan.exportFootball, '【10】生成足球页（export-football.mjs）→ 足球推荐.html');
    steps.push('  ✅ 会跑  【11】数据新鲜度守护：体检每个数据文件的更新时间 + 网页顶部提示条 + 日志报警');
    mark(plan.cleanup, '【12】清理 72 小时缓存（cleanup-cache.mjs）');
    steps.push('  ✅ 会跑  【13】整理输出到 out/（index.html / football.html / tickets.json）→ 交给 workflow 部署到网页');

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
    /* jc-history.js 也一起备份：build-jc.mjs 每次都会往里追加已完场记录，
       抓取失败还原时不能把累积下来的历史一起丢掉。 */
    const DATA_FILES = ['history.js', 'draws.js', 'football.js', 'jc-data.js', 'jc-history.js', 'prize-data.js'];
    const backup = {};
    DATA_FILES.forEach((f) => {
      const p = path.join(MOD, f);
      if (fs.existsSync(p)) backup[f] = fs.readFileSync(p);
    });
    log(`  已备份 ${Object.keys(backup).length} 个数据文件`);

    const results = [];
    function protectedRun(file, args, files) {
      const before = new Map(files.map((f) => [f, fs.existsSync(path.join(MOD, f)) ? fs.readFileSync(path.join(MOD, f)) : null]));
      const ok = run(file, args);
      if (!ok) for (const [f, data] of before) {
        const target = path.join(MOD, f);
        if (data !== null) fs.writeFileSync(target, data);
        else if (fs.existsSync(target)) fs.unlinkSync(target);
      }
      return ok;
    }

    if (doDraws) {
      log('\n【1】抓开奖号码');
      let drawsOk = run('build-draws.mjs', []);
      /* 【重试到抓全】开奖是整条链上最要紧的数据：
         失败（多源都没抓到 / 号码校验不过）就立刻再试一次。
         另外 21:30 / 21:45 / 22:00 三班本身就是互为重试的第二、三、四次机会
         （22:00 那班还负责「核对推荐号存档 → 中了就公布」：历史开奖 + 小喇叭）。 */
      if (!drawsOk) {
        log('  ↩ 第 1 次没抓到 → 立刻重试一次（官方 403 / 体彩 567 时自动走一起彩/500/17500）');
        drawsOk = run('build-draws.mjs', []);
        if (drawsOk) log('  ✅ 重试成功');
      }
      results.push(drawsOk);
    } else {
      log('\n【1】抓开奖号码 —— 本班次跳过');
    }

    if (doHistory) {
      log('\n【2】抓历史开奖（60 期）');
      results.push(protectedRun('build-history.mjs', ['60'], ['history.js']));
    } else {
      log('\n【2】抓历史开奖 —— 本班次跳过');
    }

    if (doFootball) {
      log('\n【3】抓足球比分 + 竞彩赔率');
      results.push(protectedRun('build-football.mjs', [], ['football.js']));
      results.push(protectedRun('build-jc.mjs', [], ['jc-data.js', 'jc-history.js']));
      /* 【3b 已完场赛果 · 用户 2026-10-18「补已经踢完的比赛的赛果抓取」】
         紧跟 build-jc.mjs 之后：这一步抓「最近 48 小时完场」的终场/半场比分，
         写 jc-results.js，并把 jc-history.js 里【还空着 / 被中途快照冻住】的比分
         用终场比分补齐、修正（红黑靠它才算得对）。
         ⚠️ 必须在 jc-reco-build.mjs 与 export-football.mjs【之前】：
            那两个一个算红黑、一个把红黑内联进页面，顺序反了就是上一轮的旧数。
         ⚠️ 文件不存在就【跳过】而不是算失败：云端只跑同步上去的文件，
            这个脚本没进同步名单时 run() 会返回 false → anyFailed → 整批数据回滚，
            代价太大。所以先 existsSync 再跑。
         ⚠️ 抓不到时它自己【保留上一次的 jc-results.js / jc-history.js 不动】，
            并且默认 exit 0（不拖垮本链；要严格失败得自己加 --strict）。 */
      if (fs.existsSync(path.join(MOD, 'build-football-results.mjs'))) {
        results.push(run('build-football-results.mjs', []));
      } else {
        log('  ⏭ 没有 build-football-results.mjs（还没同步上来）→ 跳过已完场赛果这一步');
      }
    } else {
      log('\n【3】抓足球 + 竞彩 —— 本班次跳过');
    }

    if (doPrizes) {
      log('\n【4】抓奖级');
      results.push(protectedRun('build-prizes.mjs', [], ['prize-data.js']));
    /* 【专家数据】出号的组合逻辑靠它（抓一起彩的三胆/杀号/共识百分比）。
       以前云端没这一步 → experts-data.js 一直是旧的 → "按用户的方法出号"不生效。
       云端从美国访问 yiqicai.com 实测可达；抓不到也不影响（沿用旧的 experts-data.js）。 */
    /* 【全量专家 · 用户 2026-10-18「把专家的所有资料全部抓进来」】
       凌晨 2 点这一班用 --all：所有分类 / 每个彩种最多 200 位专家 / 每人 30 期历史。
       其它班次不动（默认 20 位，几分钟跑完）。全量一轮 2000+ 请求，只在云端跑。 */
    try { run('build-experts.mjs', ['--all']); }
    catch (e) { log('  ⚠️ 专家数据抓取失败（沿用上一次的 experts-data.js）：' + e.message); }
    } else {
      log('\n【4】抓奖级 + 专家数据 —— 本班次跳过');
    }

    /* ============================================================
       【专家 · 每小时抓一次】用户 2026-10-18 选择：「专家 每小时抠一次」
       ------------------------------------------------------------
       · 只认【每小时那一班】：HEATMAP_SLOT 传进来的就是 github.event.schedule，
         小时班的 cron 是 '7 * * * *'，其它班次一律不动。
       · 与【4】抓奖级解耦：这一班就算不抓奖级，也照样抓专家。
       · 用默认参数（每彩种 20 位，约 5~6 分钟）；抓不到就沿用上一次的 experts-data.js，
         不阻断构建、不弄坏页面。
       ============================================================ */
    if (slot.cron === '7 * * * *' || plan.type === 'heatmap-hour') {
      log('\n【专家·每小时】抓一次（每彩种 20 位，约 5~6 分钟）');
      const tExp = Date.now();
      try {
        run('build-experts.mjs', []);
        log(`  专家抓取完成（${((Date.now() - tExp) / 1000).toFixed(0)}s）`);
      } catch (e) {
        log('  ⚠️ 专家抓取失败（沿用上一次的 experts-data.js）：' + String(e.message).slice(0, 120));
      }
    }

    /* ============================================================
       【开奖后抓下一期 · 用户 2026-10-18】
       「必须抓到 抓不到就一直抓…设置开奖后就开始抓取下一期」
       ------------------------------------------------------------
       双色球 21:15 开奖 → 从北京时间 21:20 起，每 10 分钟那一班都抓一次
       「下一期」（只抓双色球：1 个彩种、约 35 秒、8 个请求），一直抓到源站挂出为止。
       抓到之后 experts-data.js 的 issue 会变成新期号，页面自动显示
       「下一期 2026xxx 期（源站已挂出）」。
       其它彩种不在这里抓（凌晨 2 点全量班已抓过），避免把源站问爆。
       ⚠️ 全部在云端跑：免费、你电脑不用开机、也不占本机计划任务。
       ============================================================ */
    try {
      const nowBj = new Date(Date.now() + 8 * 3600 * 1000);
      const hh = nowBj.getUTCHours();
      const mm = nowBj.getUTCMinutes();
      const afterDraw = (hh === 21 && mm >= 20) || hh === 22 || hh === 23 || (hh >= 0 && hh < 2);
      /* 【一直抓到齐 · 用户 2026-10-18】
         「程序改成一直抓取，直到某个彩种抓到为止就停了，等下一期开奖继续抓」
         · 每一班（10 分钟）都跑：--all --skip-done
         · --skip-done 会逐个彩种比对「源站期号 vs 本地期号 + 专家数 + 分类数」：
             已抓够（同期 · ≥20 位 · ≥10 个分类）→ 跳过，什么都不做（很便宜）
             没抓够 / 源站换期了 → 立刻抓
         · 所以：没抓够就一直抓；抓够了就安静等；下一期开奖（源站期号变了）自动继续抓。
         ⚠️ 全部在云端跑，免费、不占你电脑。 */
      if (slot.type === 'regular' || slot.type === 'live-only') {
        log('\n【4.5】专家数据：一直抓到齐（--all --skip-done）…');
        try { run('build-experts.mjs', ['--all', '--skip-done']); }
        catch (e) { log('  ⚠️ 专家抓取失败（沿用旧数据，下一班 10 分钟后再抓）：' + e.message); }
      }
    } catch (e) { log('  ⚠️ 下一期抓取调度出错（不影响页面）：' + e.message); }
    /* 【专家推荐 20 篇 · 每小时抓一次 · 用户 2026-10-18】
       竞彩页「晒票」下面那块。三个源合并去重取最新 20 篇：
         一起彩（专家总榜，覆盖全部 8 个彩种）✔ · 500 彩票 ✔ · 今日头条 ✗（JS 空壳，抓不到）
       每小时只跑一次：只在每小时的 0~9 分那一班跑（10 分钟一班 → 一小时一跑）。
       页面里【不出现任何来源站名/域名】（项目有「数据源留痕」断言）。 */
    try {
      if (slot.type === 'regular') {
        log('\n【4.6】抓专家推荐文章（每小时一次，取最新 20 篇）…');
        try { run('build-jc-articles.mjs', []); }
        catch (e) { log('  ⚠️ 文章抓取失败（沿用上一次的 jc-articles.js）：' + e.message); }
      }

    /* 【500 完场比分 · 用户 2026-10-21「加」】
       抓 live.500.com/wanchang.php（350KB / 238 场 / 191 个比分 ✔）
       按 <tr> 行解析 → 写 jc-scores.js → 页面 window.JC_SCORES ✔ */
    try { run('build-jc-scores.mjs', []); } catch (errS) { log('  ⚠️ 比分抓取失败（不影响页面）：' + errS.message); }
    /* 【名家图库 · 用户 2026-10-21「这一栏设置了实时抓取吧？」
       源：Bing 图片搜索（⚡ 纯 fetch ✗ 不需要浏览器 ✔ 云端能跑 ✔）
       每班抓一次：10 个名家 × 5 张 → 覆盖 imgs/mingjia/ ✔
       history 保留最近 24 条 ✔（见 mingjia-data.js 的 history ✗） */
    try { run('build-mingjia.mjs', ['--rotate=15']); } catch (e) { log('  ⚠️ 名家图库抓取失败：' + e.message); }
    } catch (e) { log('  ⚠️ 文章抓取调度出错（不影响页面）：' + e.message); }

    /* 检查抓取结果，坏了就还原 */
    const histAfter = checkHistory(ALL_GAMES);
    const anyFailed = results.some((r) => !r);

    if (!histAfter.ok && backup['history.js']) {
      fs.writeFileSync(path.join(MOD, 'history.js'), backup['history.js']);
      log('  ⚠️ 历史数据校验失败，仅还原 history.js，保留其他成功抓取的数据');
    }
    if (anyFailed) log('  ⚠️ 部分抓取未成功，已保留有效结果，下一轮继续补抓');
    else log('  ✅ 本轮抓取完成');

  } else {
    log('\n【1-4】本班次不需要抓取');
    log(`  ✅ 历史数据：${histBefore.detail}`);
  }

  /* ============================================================
     【5】附属抓取 —— 文章正文 / 头条晒票 / 晒票图片 / 开机号+直播 / 体彩在售场次
     ------------------------------------------------------------
     这四样是本机「文章-每30分钟 / 开机补抓 / 每日更新」负责的，
     云端实测（GitHub 美国 IP）也能访问，所以全部搬到云端自己做：
       · build-articles.mjs   一起彩专题页 → 文章列表 + 正文（网页「文章参考」）
       · build-xysp-tt.mjs    【今日头条】搜索页 → 【两个】缓存（一次抓完）：
                                xysp-tt-data.js  数字彩晒票（→ 分享页「晒票」栏的 games.tt）
                                xysp-jc-data.js  竞彩晒票（→ 竞彩页「晒票」区块）
                              ⚠️ 必须排在 build-xysp.mjs 之前：后者会把
                                 xysp-tt-data.js 并进 xysp-data.js 的 games.tt
       · build-xysp.mjs       一起彩晒票 → 图片外链（网页「晒票栏」，含头条那份）
       · build-kjh.mjs        一起彩 → 开机号 + 选号直播
       · build-jc-count.mjs   体彩官网在售场次 → jc-official.js
                              ⚠️ 体彩官网对美国 IP 返回 567，抓不到时
                                 脚本自己保留上一次的值（退出码 10），页面退回兜底算法

     【容错原则】任何一个失败都只跳过它自己：
       这里【不】把结果并进 results[]，所以绝不会触发「开奖数据被还原」。
       退出码 10（没抓到新数据 / 退避中）算正常，保留上一次的数据。
     ============================================================ */
  if (plan.extras) {
    log('\n【5】附属抓取：文章正文 / 头条晒票 / 晒票图片 / 开机号+直播 / 体彩在售场次');
    /* ⚠️ 文章 / 在售场次 加 --min-gap 30：
       云端现在有「每 10 分钟」那条 cron（晒票要 10 分钟一轮），
       这两个步骤不需要 10 分钟一次，靠 --min-gap 自己把间隔钉在 30 分钟
       （不足间隔时它们退出码 10 = 本轮跳过，runSoft 会把 10 当"保留上次"）。
       晒票那两个【不加】—— 它们就是要 10 分钟一轮。
       （注意：这段注释里不能直接写 cron 表达式，星号斜杠会提前结束块注释。） */
    const extraRows = [
      ['build-articles.mjs', ['--min-gap', '30'], '文章参考'],
      ['fetch-community-topics.mjs', ['--cloud', '--once', '--discussion-only'], '公开足球讨论帖'],
      ['fetch-mingjia-toutiao.mjs', [], '当期字谜资料'],
      ['fetch-mingjia-web.mjs', ['--min-gap','30'], '公开网站下一期图谜'],
      ['build-xysp-tt.mjs', [], '头条+竞彩晒票'],
      ['build-xysp.mjs', [], '晒票栏'],
      ['build-kjh.mjs', [], '开机号+直播'],
      ['build-jc-count.mjs', ['--min-gap', '30'], '体彩在售场次'],
      /* 【足球晒票 · 票面照片】尽力而为（2026-10-18 加）。
         实测云端访问这个源是 HTTP 405（阿里云 WAF），所以这里【预期就是抓不到】，
         脚本会自己退 10 → runSoft 记成「保留上次」，
         页面用的还是本机同步过来的 cloud/scripts/football-tickets.js。
         ⚠️ 那为什么还要排在名单里：
             ① 云端这条 cron 是 10 分钟一轮，和用户要的「实时」对得上；
             ② 哪天 WAF 放开了，云端不用改代码就自动开始出票面；
             ③ 它自己「抓不到绝不覆盖旧文件」，永远不会把同步过来的那份冲掉。 */
      ['fetch-football-tickets.mjs', [], '足球晒票'],
    ].map(([file, args, label]) => {
      const r = runSoft(file, args);
      return `${label}=${r.ok ? (r.kept ? '保留上次' : '✅') : '❌ 跳过'}`;
    });
    log('  附属抓取小结：' + extraRows.join('　'));
  } else {
    log('\n【5】附属抓取（文章/头条/晒票/开机号/在售场次）—— 本班次跳过');
  }

  /* 【12】清理 72 小时缓存（用户要求：抓取缓存只保留 72 小时）
     放在抓取之后、出页面之前 —— 清掉的都是已经用不到的旧文件。
     --dry 只报告不删；这里真删。失败不影响后续任何步骤。 */
  if (plan.cleanup) {
    log('\n【12】清理 72 小时缓存（cleanup-cache.mjs，KEEP_HOURS=72）');
    runSoft('cleanup-cache.mjs', []);
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
  /* 【推荐串存档】出页面【之前】跑一步：把这一期的推荐串存进 jc-reco-archive.js，
     并拿 jc-history.js 的终场比分回填红黑。
     · 它读 jc-data.js / jc-official.js / jc-history.js（都是同步上去的）
     · 纯本地计算、不联网、不调 AI → 放这里零成本
     · 必须在 export-football.mjs 之前：竞彩页要读这个存档显示
       「推荐串 红 X 黑 Y 命中率 Z%」和往期详情。 */
  {
    const r = runSoft('jc-reco-build.mjs', []);
    log(`  推荐串存档：${r.ok ? '✅ 已更新 jc-reco-archive.js' : '⚠️ 跳过（保留上次存档）'}`);
  }
  const doExportStatic = plan.exportStatic === true
    || (plan.exportStatic === 'auto' && (doDraws || doHistory || doPrizes));

  const exportList = [];
  /* 【新浪下一期参考】用户 2026-10-18：把「下一期参考」接进构建 ——
     build-sina-predict.mjs 抓媒体对【下一期】的公开预测（文章正文是 JS 渲染，用 headless Chrome）。
     ⚠️ 必须排在 export-static.mjs【之前】（页面构建时要读 sina-predict.json）。
     ⚠️ 源头还没发下一期时，这个脚本会 exit 0 且不写文件 → 页面那块自然不显示，不会弄坏构建。 */
  if (!QUICK && doExportStatic) exportList.push(['build-sina-predict.mjs', '新浪下一期参考（可选，抓不到就跳过）']);
  /* __MQ_EARLY__ 用户 2026-10-18：「喇叭要在抓取到开奖信息就公布」
     → 播报比对必须在【生成彩票页之前】跑，否则页面里的喇叭用的是上一轮的旧数据。 */
  exportList.push(['build-broadcast.mjs', '播报 · 中奖命中比对（先于出页面）']);
  if (doExportStatic) exportList.push(['export-static.mjs', '彩票页']);
  /* 【播报 · 中奖命中】用户 2026-10-17 批准挂进定时构建：
     拿我们自己算的号池（experts-data.js 的 games.<彩种>.pool）比开奖号，
     严格的包住判定 → 写 broadcast.json → 紧跟其后的 export-football.mjs 读它，
     把「命中一等奖/二等奖」接进播报条。
     ⚠️ 必须排在 export-football.mjs【之前】（页面构建时要读这个文件）。 */
  if (plan.exportFootball) exportList.push(['export-football.mjs', '足球页']);
  /* 【走势图】用户 2026-10-17：「留在近30期走势预选参考里面. 删除单独走势图独立页」
     → 走势图【不再有独立页面】，也不再需要单独跑一步生成器：
        它的样式/表格/脚本由 build-trend.mjs 出成片段，
        被 export-static.mjs import 进去，内联在分享页的
        <details class="ro-trend">（近 30 期走势 · 预选参考）里。
       所以这里【删掉原来那一行】：
         原来会往 exportList 里 push 一步「生成走势图页」的 build-trend.mjs。
       ⚠️ 跟着 export-static.mjs 走 → 老的开奖数据不会再被单独一次
          build-trend 覆盖（少一个"谁后跑谁赢"的顺序坑）。
         计划表里那个已经没人读的 exportTrend 标志也一并删了。 */
  /* 【分歧指 · 数据】用户 2026-10-17 第 2 步：详情页的分歧指要多家公司欧赔。
     jc-data.js 只有 500.com 一个源（一场一份欧赔），算不出分歧 ——
     这个脚本去球探 titan007 抓真·多公司欧赔（1x2d.titan007.com/{ScheduleID}.js，
     每场 320~370 家公司），算好离散度写 jc-divergence.js。
     【欧赔对比 · 用户 2026-10-17 第 3 步】同一次抓取还写出第二份文件 jc-titan.js：
      每场主流 12 家的 初盘/即时/返还率/凯利 明细（详情页「欧赔对比」那一档用）。
      ⚠️ 一个脚本两个出口 = 同一场只请求一次（一场 180~600 KB，抓两遍纯属浪费）。
     ⚠️ 必须排在 build-match.mjs【之前】：详情页在【构建时】就把这两份数据
        内嵌进 HTML（自包含，和 games 一样）。跑晚了这一班就只能显示「暂无」。
     ⚠️ 它自己带 20 分钟 min-gap（要 jc-divergence.js / jc-titan.js 两份都还新才跳过）：
        足球班次 30 分钟一班，不会把它连着抓两遍。
     ⚠️ 失败不影响后面：build-match.mjs 读不到文件就照旧显示「暂无」，
        绝不用单源硬造低/中/高，也绝不拿别场的数字顶（那是编数据）。 */
  if (!QUICK && plan.exportFootball) exportList.push(['build-odds-divergence.mjs', '分歧指 + 欧赔对比数据（球探 titan007 多公司欧赔）']);
  /* 【雷达寻胆 · 成交资金面】用户 2026-10-17 第 4 步：详情页要一个"自己算出来的胆"。
     这个脚本取【当天比分行】(比赛ID + 主客队名)，按队名 + 别名把我们的场次对上号，
     再问那场有没有成交资金数据（三项成交量/占比/成交价 + 挂单量 + 大小球），写 jc-bifa.js。
     ⚠️ 必须排在 build-match.mjs【之前】：详情页在【构建时】就把这份数据内嵌进 HTML。
     ⚠️【临场才有】：成交额是赛前才累积起来的 —— 距开赛太远、或打完很久之后都返回空。
        所以扫【当天的比分行】就够了，也正好覆盖"即将开赛 / 正在进行"那批。
     ⚠️ 它只读 jc-data.js / jc-history.js（决定要问哪几场），只写 jc-bifa.js。
     ⚠️ 失败 / 一场都没取到 → 【不覆盖旧文件】，build-match.mjs 读不到就降成
        欧赔+盘口+凯利三个维度（不是错，是少一档），绝不让整班挂掉。 */
  if (!QUICK && plan.exportFootball) exportList.push(['fetch-bifa.mjs', '雷达寻胆 · 成交资金面']);
  /* 【联赛积分榜】2026-10-18：详情页「综合模型」算埃罗概率要【真实积分差】，
     此前只有 jc-data.js 里每场的 [名次]，拿"名次 × 2"当积分差是代理值。
     这一步去 liansai.500.com 抓 15 个联赛的真实积分榜，写 jc-standings.js
     （按【队名】对齐（名次不能当键：竞彩列表的 [NN] 不是联赛榜名次）；build-match.mjs 用 loadVar 读它算埃罗）。
     ⚠️ 必须排在 build-match.mjs【之前】：详情页是【构建时】把这份数据内嵌进 HTML 的。
     ⚠️ 抓不到就【不覆盖旧文件】（本机那份可能还是好的），这一班沿用上一份数据；
        失败只记一行 ❌，不影响后面任何一步（和 fetch-bifa.mjs 同一档容错）。 */
  if (!QUICK && plan.exportFootball) exportList.push(['fetch-standings.mjs', '联赛积分榜数据（500.com）']);
  /* 【比赛详情页】用户 2026-10-17 第 1 步：竞彩页每张比赛卡片点进去看这场的数据。
     必须排在 export-football.mjs 之后（同一个班次，数据口径一致）：
     它读 jc-data.js + jc-official.js，把 games 数组内嵌进 比赛详情.html。
     ⚠️ 跟着 exportFootball 走：不出竞彩页的班次就没必要重出详情页。 */
  if (plan.exportFootball) exportList.push(['build-match.mjs', '比赛详情页']);
  /* 【Netlify 备用包 · 分享包/】2026-10-20 用户批准「export-site 也上云」。
     · export-site.mjs 全篇只用 path.dirname(fileURLToPath(import.meta.url)) 定位自己，
       读写都走 path.join ——【没有写死任何 Windows 盘符 / 反斜杠路径】，
       所以 Linux runner 上原样就能跑，产物落在 cloud/scripts/分享包/
       （结构与本机 D:\彩虹多多\分享包\ 一致：index.html / football.html /
         jc-reco-view.js / 使用说明.txt）。
     · ⚠️ 位置必须排在【最后】：它读 export-static.mjs 出的 只读分享版.html
       和 export-football.mjs 出的 足球推荐.html（后者读不到只会退化，不会报错）。
     · ⚠️ 只在【全量班】（北京 02:00，一天 1 次）跑：包里是 2.4 MB 页面，
       每 10 分钟写一遍纯属浪费；workflow 那边也【只在全量班】把它打成
       Actions artifact（名字「分享包」）供下载，别的班次不上传。
     · ⚠️ 产物【不进 git、不进 Pages】：一次 2.4 MB，提交回仓库会把仓库撑爆，
       塞进 site/ 则每班多传一份。失败只记一行 ❌，不影响任何页面。 */
  if (plan.type === 'full') exportList.push(['export-site.mjs', '分享包（Netlify 备用包）']);
  /* 【🔥 人气数字 · 构建时写死】用户 2026-10-20：「卜蒜子能不能永远都呈现
     就算我电脑关机了」→ 选 A：构建时取一次数、写进页面（静态数字）。
     · fetch-busuanzi.mjs 现场请求一次不蒜子（busuanzi.ibruce.info/busuanzi），
       把 site_uv 写进 cloud/scripts/busuanzi.json；
     · 紧接着 export-static.mjs 构建时把这个数【直接写进页面】，不依赖浏览器
       去连不蒜子 → 页面永远有数字，不会再出现「🔥 --」。
     · ⚠️ 必须排在 export-static.mjs【之前】（页面构建时要读这个 json）。
     · ⚠️ 它自己「抓不到就不覆盖旧文件 + 退出码永远 0」，
       所以这里用 runSoft：失败只记一行，绝不会拖垮整条构建链。 */
  if (!QUICK && !fs.existsSync(path.join(MOD, 'visitor-counter.js'))) {
    const r = runSoft('fetch-busuanzi.mjs', []);
    log(`  不蒜子热度：${r.ok ? '✅ 已取到最新数字 → busuanzi.json' : '⚠️ 跳过（沿用上一次的数）'}`);
  }
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

  /* 4. 复制到 out/ + 数据新鲜度守护 + 发布清单 */
  const freshRows = checkFreshness();
  reportFreshness(freshRows);
  finishOutput(freshRows);
}

/* ---------- 把产物整理到 out/（每个班次最后都要跑） ----------
   步骤：
     ① 只读分享版.html → out/index.html ；足球推荐.html → out/football.html
     ② 注入顶部导航（两个页面互跳）
     ③ 注入【数据新鲜度】提示条（新元素，不碰原有倒计时 / 状态条）
     ④ .nojekyll + 发布清单
   【为什么抽成函数】每 5 分钟那一班（live-only）自己在别处出完页面，
   最后也要走同一套整理 + 提示条，绝不能有两份实现。 */
function finishOutput(freshRows) {
  log('\n整理输出到 out/ ...');
  fs.mkdirSync(OUT, { recursive: true });

  /* 【只发布「这一班真的重新生成过」的页面】
     以前不管有没有重新生成，都无条件把 cloud/scripts/只读分享版.html
     拷成 out/index.html —— 万一这台构建里 export-static.mjs 失败了，
     拷过去的就是【上一版旧页面】，网站上会悄悄变旧，而且没人发现。

     现在：只看文件的修改时间有没有落在本次运行开始之后。
     （云端每次都是全新 checkout，所有文件 mtime = 开始时间；
       子进程在本次运行里写出来的文件 mtime 一定 >= 开始时间 —— 可靠。）
       · 是本次生成的 → 正常拷贝 + 发布
       · 不是（这一班没出这个页面 / 出页面失败）→ 把 out/ 里的旧文件删掉，
         workflow 那一步会发现 site/ 缺文件，自动从【线上当前那份】拉回来兜底，
         既不会把旧页面当成新页面发出去，也不会让站点 404。 */
  const pairs = [
    ['只读分享版.html', 'index.html'],
    ['足球推荐.html', 'football.html'],
    /* 【走势图 2026-10-17】原来这里还有一条 ['走势图.html', '走势图.html']。
       用户要求「删除单独走势图独立页」→ 页面本身已经不再生成，
       走势图内容内联进了 out/index.html 的折叠块里，所以这一条【删掉】：
       留着它只会每次都走一遍"文件不存在 → 删掉 out/ 里那份"的分支，
       还会让 workflow 的兜底列表继续去线上拉一个已经不存在的页面。 */
    /* 【比赛详情页】竞彩页每张卡片都指向 比赛详情.html?c=编号（__MATCH_DETAIL_LINK__）。
       同上面两条逻辑：只发布【本次真的重新生成过】的那一份；
       这一班没出 → 删掉 out/ 里那份，由 workflow 从线上拉回当前那份兜底。 */
    ['比赛详情.html', '比赛详情.html']
  ];
  pairs.forEach(([src, dst]) => {
    const sp = path.join(MOD, src);
    const op = path.join(OUT, dst);
    const fresh = fs.existsSync(sp) && fs.statSync(sp).mtimeMs >= RUN_START_MS;
    if (fresh) {
      fs.copyFileSync(sp, op);
      log(`  ✅ ${dst}  ${(fs.statSync(op).size / 1024).toFixed(1)} KB（本次重新生成）`);
      /* 【竞彩页 30 秒刷新】足球推荐.html 会定期去拉同目录的 jc-reco-view.js
         （不是 fetch，是 <script src>，所以本地 file:// 也能用）。
         它由 export-football.mjs 生成在 MOD（cloud/scripts/）里，
         这里必须【跟 football.html 同时】拷到 out/ —— 线上站点根目录就是 out/。
         ⚠️ 不跟着 football.html 发的话，线上的刷新会一直 404：
            前端拿不到文件时什么都不做（页面照旧是构建时那份数据），不会坏，
            但也不会自动更新 —— 属于"静默失效"，所以要在这里接上。 */
      if (dst === 'football.html') {
        const rv = path.join(MOD, 'jc-reco-view.js');
        if (fs.existsSync(rv)) {
          fs.copyFileSync(rv, path.join(OUT, 'jc-reco-view.js'));
          log(`  ✅ jc-reco-view.js ${(fs.statSync(rv).size / 1024).toFixed(1)} KB（竞彩页 30 秒刷新用）`);
        } else {
          log('  ℹ️ 没有 jc-reco-view.js（本班没跑 export-football.mjs？）→ 线上刷新这轮不生效');
        }
        /* 【往期推荐串 · 前端拉取】用户 2026-10-17 要求页面每 60 秒 fetch ./data/recommend.json，
           所以这份 JSON 必须和 football.html 一起发到 out/data/（线上站点根 /data/）。
           由 export-football.mjs 生成在 MOD/data/recommend.json。 */
        const rj = path.join(MOD, 'data', 'recommend.json');
        if (fs.existsSync(rj)) {
          const dj = path.join(OUT, 'data');
          fs.mkdirSync(dj, { recursive: true });
          fs.copyFileSync(rj, path.join(dj, 'recommend.json'));
          log(`  ✅ data/recommend.json ${(fs.statSync(rj).size / 1024).toFixed(1)} KB（往期推荐串 60 秒拉取用）`);
        } else {
          log('  ℹ️ 没有 data/recommend.json（本班没跑 export-football.mjs？）→ 前端拉取这轮不生效（页面保持烘好的那份）');
        }
      }
      return;
    }
    if (fs.existsSync(op)) { try { fs.unlinkSync(op); } catch (e) { /* 忽略 */ } }
    log(`  ⏭  ${dst}：本班次没有重新生成（${fs.existsSync(sp) ? '文件是上一版的' : '文件不存在'}）`
      + ' → 不发布旧页面，交给 workflow 从线上拉回当前那份兜底');
  });

  /* 顶部导航（两个页面互跳）
     ⚠️ 2026-10-17：原来是【三个】Tab（多一个「走势图」指向独立页 走势图.html）。
        用户要求「删除单独走势图独立页」→ 独立页不再发布，那个 Tab 点了必然 404，
        所以这里【只删不加】地去掉它：导航回到「彩票推荐 / 竞彩·足球」两栏。
        走势图内容现在内联在 index.html 的「近 30 期走势 · 预选参考」折叠块里，
        从首页即可展开 → 不丢入口。 */
  const NAV = `
<style>
/* ⚠️ 2026-10-17：这条原来是【深色】（rgba(15,17,21,0.96) 黑底 + #6b7488 灰字）。
     它是由云端 finishOutput 注入的、位置在样式表【最后】——
     所以连页面自己浅色主题里那条 .site-nav !important 都压不住它，
     实测线上竞彩页就是"米杏页面顶一条黑导航"。
     现在改成跟着页面一致的米杏色。 */
.site-nav { position: sticky; top: 0; z-index: 99; display: flex; background: rgba(247,239,225,0.96); backdrop-filter: blur(10px); border-bottom: 1px solid #e8d7bd; }
.site-nav a { flex: 1; text-align: center; padding: 13px 10px; font-size: 14px; font-weight: 600; color: #8a7a63; text-decoration: none; border-bottom: 2px solid transparent; }
.site-nav a.on { color: #1a8c5a; border-bottom-color: #1a8c5a; }
</style>
<div class="site-nav">
  <a href="index.html" class="__ACTIVE_INDEX__">彩票推荐</a>
  <a href="football.html" class="__ACTIVE_FB__">竞彩/足球</a>
</div>`;

  for (const [dst, active] of [['index.html', 'index'], ['football.html', 'fb']]) {
    const fp = path.join(OUT, dst);
    if (!fs.existsSync(fp)) continue;
    let html = fs.readFileSync(fp, 'utf8');
    /* ⚠️ 先删掉页面【自带】的顶部 Tab（.top-tabs），再注入 .site-nav。
       实测：线上彩票页曾经出现过【两条导航叠在一起】——
         · 页面自带的 .top-tabs（分享页 2 个 Tab）
         · 这里注入的 .site-nav
       而且页内那条在站上部分链接是死的（分享页那条 href="./"、
       href="足球推荐.html"，而站点上的文件名是 index.html / football.html）。
       本机分享包走 export-site.mjs 时已经这么删过了（那边有同一条正则），
       云端这条链路以前漏了 —— 现在两边行为一致。 */
    html = html.replace(/<div class="top-tabs">[\s\S]*?<\/div>\s*/, '');
    const nav = NAV.replace('__ACTIVE_INDEX__', active === 'index' ? 'on' : '')
                   .replace('__ACTIVE_FB__', active === 'fb' ? 'on' : '');
    html = html.replace('</head>', nav.split('<div class="site-nav">')[0] + '</head>');
    html = html.replace(/<body([^>]*)>/, `<body$1>${nav.split('</style>')[1]}`);
    /* 【数据新鲜度提示条】独立元素 + 独立 style，插在导航条之前 */
    /* html = injectFreshnessBanner(html, freshRows || []); */  /* __NO_FRESH_BANNER__ 用户要求去掉页面横幅 */
    fs.writeFileSync(fp, html, 'utf8');
  }

  /* ============================================================
     【链接改写】站点上的文件名 ≠ 本机文件名
     ------------------------------------------------------------
     本机：竞彩页的文件名是 足球推荐.html（export-football.mjs 写出来的）
     线上：它在上面 pairs 里被改名发布成 football.html
     → 任何页面里写死 href="足球推荐.html" 的链接，上线后都是【死链】。
       实测（2026-10-17）：线上直接打开 比赛详情.html，点「← 返回」→ 404。

     这里把 out/ 那几份页面里的 href="足球推荐.html" 统一改成 href="football.html"。
     ⚠️【只替换 href 的值】—— 详情页的返回键长这样：
         <a class="md-back" id="mdBack" role="button" href="足球推荐.html"
            onclick="if(history.length>1){history.back();return false}">
        onclick 必须原样保留：history.back() 是「从竞彩页点进来」时的首选返回路径，
        href 只是「直接打开详情页 / history 为空」时的兜底。改 href 不动 onclick。
     ⚠️ 正则只匹配 href="足球推荐.html" 这一小段，不碰 onclick、不碰别的文字。
     ⚠️ 覆盖三份页面：index/football 里本身没有这个 href
        （顶部 Tab 已经在上面按站点文件名重写过），多写一遍是幂等的 ——
        真要有，也正好一起修掉，不会再出现"只改了两份、漏了详情页"。
      ⚠️ 2026-10-17：原来这里还列了 走势图.html（第三个独立页）。用户要求
        「删除单独走势图独立页」→ 那一页不再发布，从名单里【删掉】，
        免得每次构建都对着一个不存在的文件打"没有这个 href（无需改写）"的日志。
      ⚠️ 静默失效自证：命中几处就打在日志里，0 处也打（说明这份页面本来就没有这个链接）。
     ============================================================ */
  {
    const LINK_FIX_FILES = ['index.html', 'football.html', '比赛详情.html'];
    LINK_FIX_FILES.forEach((dst) => {
      const fp = path.join(OUT, dst);
      if (!fs.existsSync(fp)) return;
      let html = fs.readFileSync(fp, 'utf8');
      const hit = html.split('href="足球推荐.html"').length - 1;
      if (!hit) { log(`  🔗 ${dst}：没有 href="足球推荐.html"（无需改写）`); return; }
      html = html.replace(/href="足球推荐\.html"/g, 'href="football.html"');
      fs.writeFileSync(fp, html, 'utf8');
      log(`  🔗 ${dst}：改写 ${hit} 处 href="足球推荐.html" → href="football.html"（onclick 原样保留）`);
    });
  }

  /* 首页跳转说明 */
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '', 'utf8');

  /* ============================================================
     【分享卡片 / 图标 / PWA】把图标文件也拷进 out/
     ------------------------------------------------------------
     文件来源：cloud/scripts/icons/（由本机的 make-icons.mjs 生成后
       sync-cloud.mjs 自动同步上来的 —— 它在 cloud/ 下面，所以会被
       collect() 直接收走，不用改 sync-cloud.mjs）。
     为什么在这里拷、而不是在 workflow 里拷：
       finishOutput() 是每一班（含 5 分钟那一班）最后都必跑的一步，
       拷到这里 out/ 就永远和 site/ 一致；
       另外两个页面的 <head> 用的就是这些文件名，缺一个就是死链。
     用 copyFileSync 覆盖式拷贝：文件是静态的，每班拷一遍成本可忽略。
     ============================================================ */
  /* ============================================================
     __RECO_OUT_COPY__ 【推荐串存档】把页面要用的文件也拷进 out/
     ------------------------------------------------------------
     页面（竞彩页）会加载这几个文件：
       jc-reco-view.js / jc-reco-data.js / jc-reco-archive.js / jc-reco-stats.json
     少任何一个 -> 线上 404 -> 30 秒刷新【静默失效】（不报错、不白屏，极难发现）
     来源：cloud/scripts/（sync-cloud.mjs 同步上来的）。
     ============================================================ */
  {
    const RECO_FILES = ['jc-reco-view.js', 'jc-reco-data.js', 'jc-reco-archive.js', 'jc-reco-stats.json'];
    const recoCopied = [];
    const recoMissing = [];
    RECO_FILES.forEach((f) => {
      const sp = path.join(MOD, f);
      if (!fs.existsSync(sp)) { recoMissing.push(f); return; }
      fs.copyFileSync(sp, path.join(OUT, f));
      recoCopied.push(f);
    });
    if (recoCopied.length) log('  ✅ 推荐串文件 ' + recoCopied.length + ' 个已拷入 out/（' + recoCopied.join(' / ') + '）');
    if (recoMissing.length) log('  ⚠️ 推荐串文件缺失 ' + recoMissing.length + ' 个：' + recoMissing.join(', ') + ' -> 线上会 404');
  }

  const ICON_SRC = path.join(MOD, 'icons');
  const ICON_FILES = [
    'favicon.ico',
    'icon.ico',
    'icon.svg',
    'icon-192.png',
    'icon-512.png',
    'apple-touch-icon.png',
    'share.png',
    /* PWA 清单两个文件名都发：manifest.json 是页面现在引用的那个，
       manifest.webmanifest 是旧版页面/老缓存还在引用的那个（缺了 404）。
       ⚠️ 名单要和 make-icons.mjs 的 PUBLISH、daily-update.yml 的 cp 循环一致。 */
    'manifest.json',
    'manifest.webmanifest'
  ];
  let iconCopied = 0;
  const iconMissing = [];
  ICON_FILES.forEach((f) => {
    const sp = path.join(ICON_SRC, f);
    if (!fs.existsSync(sp)) { iconMissing.push(f); return; }
    fs.copyFileSync(sp, path.join(OUT, f));
    iconCopied++;
  });
  if (iconMissing.length) {
    /* 不抛异常：图标缺失不该阻止当班页面发布（页面本身没问题），
       但一定要在日志里吼一声，不然静默 404 很久都没人发现。 */    log(`  ⚠️ 图标缺失 ${iconMissing.length} 个（cloud/scripts/icons/ 里没有）：${iconMissing.join(', ')}`);
    log('     → 本机跑一次 node make-icons.mjs 生成并同步即可');
  } else {
    log(`  ✅ 分享图标 ${iconCopied} 个已拷入 out/（favicon.ico / icon.svg / share.png / manifest.webmanifest …）`);
  }

  /* 【PWA · Service Worker】用户 2026-10-17：页面上要能「添加到桌面」。
     浏览器判定"可安装"要求：manifest + 图标 + 一个带 fetch 处理器的 SW。
     SW 必须放在【站点根】（和 index.html 同级），scope 才覆盖全站；
     它不在 icons/ 目录里（ICON_SRC），所以单独拷一遍。
     ⚠️ 这个 SW 是纯透传（fetch 一律走网络、不缓存），避免冻住 30 秒实时刷新。 */
  try {
    const swSrc = path.join(MOD, 'service-worker.js');
    if (fs.existsSync(swSrc)) {
      fs.copyFileSync(swSrc, path.join(OUT, 'service-worker.js'));
      log('  ✅ service-worker.js 已拷入 out/（纯透传，不缓存）');
    } else {
      log('  ⚠️ cloud/scripts/ 缺 service-worker.js → 线上不会弹原生安装框（按钮仍给引导提示）');
    }
  } catch (e) {
    log('  ⚠️ service-worker.js 拷贝失败：' + (e && e.message));
  }

  /* ============================================================
     【发布清单】把 out/ 里即将被 workflow 拷到 site/ 的文件逐个列出来
     （文件名 + 大小 + 修改时间）—— 用来证明「这一班确实有东西要发布」。
     workflow 的「把生成的网页放到站点目录」那一步拷的就是这几个文件。
     ============================================================ */
  const p = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  log('\n【发布清单】out/ 里会被发布到网页的文件：');
  [...['index.html', 'football.html', 'tickets.json'], ...ICON_FILES].forEach((f) => {
    const fp = path.join(OUT, f);
    if (!fs.existsSync(fp)) { log(`  ❌ ${f} 不存在 —— 这一项本次不会更新`); return; }
    const st = fs.statSync(fp);
    log(`  ✅ ${f}  ${(st.size / 1024).toFixed(1)} KB  修改于 ${fmt(st.mtime)}`);
  });

  /* 提示条真的插进去了吗？（自证，避免静默失效） */
  try {
    const hp = path.join(OUT, 'index.html');
    if (fs.existsSync(hp)) {
      const t = fs.readFileSync(hp, 'utf8');
      log(`  🔎 数据新鲜度提示条检查：${t.indexOf('id="roFreshGuard"') >= 0 ? '✅ 已在 index.html 顶部' : '❌ 没插进去'}`);
    }
  } catch (e) { /* 忽略 */ }

  log(`\n════════════════════════════════════════════`);
  log(`  完成 · ${stamp()}`);
  log(`  输出目录：${OUT}`);
  log('════════════════════════════════════════════');
}

/* ---------- 发布本期的号码 JSON（out/tickets.json） ----------
   两个用途：
     1. 分享页（out/index.html）启动后拉它 → 拉到新的就地重渲染，
        不用等云端重新构建整个页面（准实时同步的核心）。
        现在里面还带了 draws（各彩种最新一期开奖）——
        分享页顶部「最新开奖」区块以前是静态预渲染的，拿到它就能就地更新。
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

    /* 各彩种最新一期开奖：字段格式与 draws.js 里的完全一致
       （从同一个 scripts/ 目录取，和生成网页用的是同一份数据） */
    let draws = {};
    try {
      draws = drawsFromDrawData(MOD) || {};
    } catch (e) {
      log(`  ⚠️ 读取开奖数据失败（tickets.json 里不带 draws）：${String(e.message).slice(0, 120)}`);
      draws = {};
    }

    const payload = {
      updated: S.updated || stamp(),
      publishedAt: new Date().toISOString(),
      source: 'cloud',
      note: '云端自动生成的推荐号码，本机程序会自动下载并采用；分享页也会拉它做准实时更新',
      tickets: S.tickets || {},
      draws: draws
    };

    fs.writeFileSync(path.join(OUT, 'tickets.json'), JSON.stringify(payload), 'utf8');
    log(`  tickets.json 已发布（${Object.keys(payload.tickets).length} 个彩种，` +
        `${Object.keys(draws).length} 个彩种的开奖号码，updated=${payload.updated}）`);
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
    log(`  │   UTC 分钟=${c.minutes.join(',')}　UTC 小时=${c.hours.join(',')}　班次形态=${c.kind}`);
    log(`  │   ${'UTC 小时'.padEnd(10)}${'北京时间'.padEnd(12)}${'星期'.padEnd(6)}班次类型`);
    /* 【密集班次】每 5 分钟 / 每 30 分钟的 cron 覆盖 24 小时 × 全部分钟数，
       逐小时展开会刷屏 288 行，所以只演示「每个小时里会被触发的分钟」。 */
    const hoursToShow = c.kind === 'custom' ? c.hours.slice().sort((a, b) => a - b) : [null];
    const minutesToShow = c.kind === 'custom' ? c.minutes : c.minutes.slice(0, 3);

    hoursToShow.forEach((uh) => {
      minutesToShow.forEach((mm) => {
        const bjH = uh === null ? null : (uh + 8) % 24;
        const bjM = mm;
        const bjTxt = bjH === null
          ? `每小时 :${W(bjM)}…（共 ${c.minutes.length} 个分钟）`
          : `${W(bjH)}:${W(bjM)}`;
        const utcTxt = uh === null ? '每小时' : `${W(uh)}:${W(bjM)}`;

        /* 用真逻辑跑一遍：把「现在」和 cron 都喂给 resolveSlot() */
        const savedNow = process.env.HEATMAP_NOW;
        const savedSlot = process.env.HEATMAP_SLOT;
        if (bjH === null) {
          /* 密集班次：形态就决定了班次，随便取一个整点时刻演示 */
          process.env.HEATMAP_NOW = `2026-10-20T${W(12)}:${W(bjM)}`;
        } else {
          process.env.HEATMAP_NOW = `2026-10-20T${W(bjH)}:${W(bjM)}`;
        }
        process.env.HEATMAP_SLOT = cron;
        delete process.env.CLOUD_SLOT;
        let type = '?';
        try { type = resolveSlot().type; } catch (e) { type = 'ERR:' + e.message; }
        if (savedNow === undefined) delete process.env.HEATMAP_NOW; else process.env.HEATMAP_NOW = savedNow;
        if (savedSlot === undefined) delete process.env.HEATMAP_SLOT; else process.env.HEATMAP_SLOT = savedSlot;

        const isFb = bjH !== null && FOOTBALL.indexOf(bjH) >= 0;
        const note = SLOT_LABEL[type] ? SLOT_LABEL[type] : type;
        rows.push({ cron, uh: uh === null ? -1 : uh, bjH: bjH === null ? -1 : bjH, bjM, type });
        log(`  │   ${utcTxt.padEnd(10)}${bjTxt.padEnd(12)}${''.padEnd(6)}${type}  ← ${note}${isFb ? '  【足球班次】' : ''}`);
      });
    });
    if (c.kind !== 'custom' && c.minutes.length > 3) log(`  │   …（每分钟都触发，共 ${c.minutes.length} 个分钟）`);
    log('  └─');
  });

  /* 汇总：特殊班次（重活）覆盖检查 */
  log('');
  log('  ── 特殊班次（重活）检查 ──');
  ['full', 'heatmap-only', 'heatmap-off', 'draw-update'].forEach((t) => {
    const hit = rows.filter((r) => r.type === t);
    log(`   ${t.padEnd(14)} ${hit.length ? '✅ ' + hit.map((r) => `北京 ${W(r.bjH)}:${W(r.bjM)}`).join('、') : '❌ 没有'}`);
  });
  const dense = rows.filter((r) => r.type === 'regular' || r.type === 'live-only');
  log(`   ${'regular/live'.padEnd(14)} ✅ 常规班 ${rows.filter((r) => r.type === 'regular').length} 个采样点 · 轻量班 ${rows.filter((r) => r.type === 'live-only').length} 个采样点`);
  log(`   ${'football-only'.padEnd(14)} ${rows.filter((r) => r.type === 'football-only').length} 个采样点（老式足球 cron 兜底）`);

  /* 汇总：每个班次能覆盖到哪几样数据 —— 直接对应验收清单 */
  log('');
  log('  ── 每个班次负责的数据（对验收清单） ──');
  const order = ['full', 'regular', 'live-only', 'draw-update', 'heatmap-only', 'heatmap-off', 'auto'];
  order.forEach((t) => {
    const pl = SLOT_PLAN[t];
    if (!pl) return;
    const parts = [];
    if (pl.dataFetch === true) parts.push('开奖+历史+奖级+专家');
    else if (pl.dataFetch === 'draws-only') parts.push('开奖');
    else if (pl.dataFetch === 'auto-guard') parts.push('开奖(过期才补)');
    else if (pl.dataFetch === 'auto') parts.push('开奖/历史(按 12 小时规则)');
    if (pl.football === true) parts.push('足球比分+竞彩赔率');
    if (pl.extras) parts.push('文章+头条+晒票+开机号+在售场次');
    if (pl.liveScores) parts.push('实时比分(单独脚本)');
    if (pl.roll !== 'skip') parts.push(pl.roll === 'force' ? '强制重摇全部' : '缺才补摇');
    if (pl.heatmap !== 'skip') parts.push('热力图:' + pl.heatmap);
    if (pl.publishTickets) parts.push('tickets.json');
    if (pl.exportStatic) parts.push('彩票页');
    if (pl.exportFootball) parts.push('足球页');
    if (pl.cleanup) parts.push('72 小时缓存清理');
    log(`   ${t.padEnd(14)} ${parts.join(' + ')}`);
  });
  log('══════════════════════════════════════════════════════════════════════════════');
}

/* ---------- 命令行入口 ---------- */
if (process.argv.includes('--slot-table')) {
  printSlotTable();
} else {
  main();
}
