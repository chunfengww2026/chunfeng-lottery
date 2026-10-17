// ============================================================
//  export-static.mjs —— 生成只读分享版 HTML
//
//  产物：只读分享版.html —— 一个自包含文件（样式+内容全内嵌）
//  特点：
//    · 没有任何按钮、输入框，对方只能看
//    · 每个彩种一段长内容（推荐图），手机上一路滑到底
//    · 不依赖任何外部文件，发微信/QQ 点开就能看
//
//  用法：node export-static.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
/* 【设备门 + PWA】共用模块（不写 localStorage、不用裸 button、不含任何出处字样）：
     · 设备门：本机 / ?admin=1 / 手机平板 → 放行；电脑浏览器 / 电脑微信 → 拦
     · PWA：manifest.json + theme-color + 「📱 一键桌面」
   ⚠️ 新模块必须同步进 cloud/sync-cloud.mjs 的 FROM_ROOT，否则云端构建找不到它。 */
import {
  PWA_HEAD, DEVICE_GATE_CSS, DEVICE_GATE_BODY, INSTALL_CSS, INSTALL_HTML, INSTALL_JS,
  CHAT_CSS, CHAT_HTML, CHAT_JS, metaItemprop
} from './device-gate.mjs';
import * as P3D_SECTION_MOD from './p3d-section.mjs';
/* 【走势图 · 内联片段】用户 2026-10-17：
     「留在近30期走势预选参考里面. 删除单独走势图独立页」
   → 走势图不再有独立 HTML 文件；样式 / 表格 / 脚本由 build-trend.mjs
     导出成一个片段（方式 A：片段导出），在这里插进
     <details class="ro-trend">（「走势图 / 近 30 期走势 · 预选参考」）里。
   ⚠️ 不走 iframe、不读任何产物文件 → 只跑 export-static.mjs 一个就够，
      没有"先跑 build-trend 再跑 export-static"的顺序依赖。
   ⚠️ 片段自带的作用域前缀是 .ro-trend-embed（样式全部收在里面），
      根节点 id 是 ro-trend-root（不和分享页的 id 撞名）。 */
import {
  loadHistory as loadTrendHistory,
  buildPayload as buildTrendPayload,
  renderTrendFragment,
  TREND_PERIODS
} from './build-trend.mjs';
/* 数据源留痕断言（3 个生成脚本共用一份，见 source-guard.mjs） */
import { assertNoSourceTrace, removeSourceWords } from './source-guard.mjs';


/* 【性能优化】用户 2026-10-17：「网页和桌面顺畅一点」。
   ① 所有 <img> 补 loading="lazy" + decoding="async"（首屏不用等 226 张图）
   ② 长页面加 content-visibility:auto（推荐图那 8～10 段先不渲染，滚到才渲染）
      ⚠️ 只加在 .ro-game（推荐图分节）上 —— 走势图要 JS 量坐标，不能跳过渲染。 */
function perfify(html) {
  let s = String(html);
  s = s.replace(/<img\b([^>]*)>/g, (all, attrs) => {
    let a = attrs || '';
    if (!/\bloading=/.test(a)) a += ' loading="lazy"';
    if (!/\bdecoding=/.test(a)) a += ' decoding="async"';
    return '<img' + a + '>';
  });
  if (!/content-visibility/.test(s)) {
    s = s.replace(/<\/style>/,
      '.ro-game{content-visibility:auto;contain-intrinsic-size:auto 900px;}\n</style>');
  }
  return s;
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const P3D_SECTION_CSS = P3D_SECTION_MOD.P3D_CSS;
const OUT = path.join(ROOT, '只读分享版.html');

/* ============================================================
   最小 DOM（用于在 Node 里跑渲染器）
   ============================================================ */
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this._text = '';
    this._html = null;
    this.className = '';
    this.dataset = {};
    // style 需要同时支持 cssText 和逐个属性赋值（渲染器用的是 gridTemplateColumns = '...'）
    const self = this;
    this.style = new Proxy({ cssText: '' }, {
      set(t, k, v) {
        t[k] = v;
        // 把驼峰属性同步进 cssText，避免导出时丢失
        if (k !== 'cssText' && k !== 'setProperty') {
          const kebab = String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          const cur = t.cssText || '';
          const re = new RegExp(`(^|;)\\s*${kebab}\\s*:[^;]*`, 'i');
          if (re.test(cur)) t.cssText = cur.replace(re, `$1 ${kebab}:${v}`);
          else t.cssText = (cur ? cur.replace(/;?\s*$/, ';') : '') + `${kebab}:${v}`;
        }
        return true;
      },
      get(t, k) {
        if (k === 'setProperty') {
          return (name, val) => {
            const kebab = String(name);
            const cur = t.cssText || '';
            const re = new RegExp(`(^|;)\\s*${kebab}\\s*:[^;]*`, 'i');
            if (re.test(cur)) t.cssText = cur.replace(re, `$1 ${kebab}:${val}`);
            else t.cssText = (cur ? cur.replace(/;?\s*$/, ';') : '') + `${kebab}:${val}`;
          };
        }
        if (k === 'getPropertyValue') {
          return (name) => {
            const m = new RegExp(`${name}\\s*:\\s*([^;]+)`, 'i').exec(t.cssText || '');
            return m ? m[1].trim() : '';
          };
        }
        return t[k];
      }
    });
  }
  set textContent(v) { this._text = String(v); this.children = []; this._html = null; }
  get textContent() {
    if (this._html) return this._html.replace(/<[^>]*>/g, '');
    return this._text || this.children.map((c) => c.textContent || '').join('');
  }
  set innerHTML(v) { this._html = String(v); this.children = []; this._text = ''; }
  get innerHTML() { return this._html !== null ? this._html : ''; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) {
    this.attrs[k] = v;
    // 渲染器可能用 setAttribute('style', ...) 
    if (String(k).toLowerCase() === 'style') this.style.cssText = String(v);
  }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 760, height: 100, left: 0, top: 0 }; }
}

const doc = {
  createElement: (t) => new El(t),
  createTextNode: (t) => { const e = new El('#text'); e.textContent = t; return e; },
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => []
};

const store = new Map();
const ctx = vm.createContext({
  console, Math, Map, Set, Array, Object, String, Number, JSON, Date,
  parseInt, parseFloat, isNaN, Uint32Array, RegExp, Error, Infinity,
  document: doc,
  window: { addEventListener: () => {}, crypto: globalThis.crypto },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  Image: function () {}, ClipboardItem: function () {}, alert: () => {}, confirm: () => true,
  /* __TIMER_STUB__ 【重要】沙箱里必须有定时器桩。
     latest-draws.js 末尾的「距下期开奖倒计时」用了 setInterval / setTimeout，
     服务端预渲染时在 vm 里跑同一份文件 —— 少了这些就会
     「❌ 加载 latest-draws.js 失败：setInterval is not defined」，
     导致最新开奖区（含 8 个彩种的 data-nextcd 占位）内联不完整。
     这里给成 no-op 桩即可：预渲染只需要"能跑过去"，不需要真的定时。 */
  setInterval: () => 0, clearInterval: () => {},
  setTimeout: () => 0, clearTimeout: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  queueMicrotask: (fn) => { try { fn(); } catch (e) {} },
  addEventListener: () => {}, removeEventListener: () => {}
});

/* ---------- 加载全部依赖 ---------- */
const FILES = ['games.js', 'draws.js', 'history.js', 'draw-data.js', 'algo.js',
               'stats.js', 'templates.js', 'experts-data.js', 'expert-pool.js',
               'ticket-store.js', 'saved-tickets.js',
               'render.js', 'prize-data.js',
               /* 【最新开奖】区块的生成函数（hcDrawOf / latestDrawsHtml /
                  applyRemoteDraws…）—— 分享页内联的是同一份文件，
                  所以服务端预渲染和客户端就地更新用的是同一个函数。
                  必须排在 hit-check.js 之前：buildLatestDrawHtml 直接调它。 */
               'latest-draws.js', 'hit-check.js',
               'materials-data.js', 'data-store.js',
               /* 【热力图】按天出的实票统计图靠它取数；文件缺失时
                  shouldShowHeatmap 不存在 → 热力图自动不出，其余图不受影响 */
               'heatmap-data.js',
               /* 【文章参考】文章列表数据（build-articles.mjs 每 30 分钟抓一次）。
                  文件缺失时只打印一行「缺少」，页面显示「本期暂无」——
                  绝不能因为这个文件不在就让整页生成失败。
                  ⚠️ 只在服务端预渲染时读；不放进 INLINE_JS，
                     所以页面里不会出现原始链接文本（渲染时会做实体处理）。 */
               'articles-data.js',
               /* 【开机号 / 选号直播】数据（build-kjh.mjs 每天 2 点抓一次）。
                  和上面两个一样：文件缺失只打印一行「缺少」，
                  页面显示「暂无」，绝不能因为这个文件不在就让整页生成失败。
                  ⚠️ 只在服务端预渲染时读；不放进 INLINE_JS ——
                     页面里只有链接标签，没有任何图片，
                     所以这份数据（纯文字）不会产生新的图位。 */
               'kjh-data.js',
                /* 【晒票栏】图片数据（build-xysp.mjs 每 30 分钟抓一次，
                   只保留最近 24 小时内抓到的条目）。
                   和上面几个一样：文件缺失只打印一行「缺少」，
                   晒票栏显示「暂无」，绝不能因为这个文件不在就让整页生成失败。
                   ⚠️ 只在服务端预渲染时读；不放进 INLINE_JS。
                      里面全是【图床外链 URL】，页面里不存图片本体，
                      所以图片不会把页面撑大（外链引用）。
                      这里也【不用】图位属性 —— 晒票栏的图不占推荐图的
                      图位数量，页面上的图位总数必须保持不变。 */
                'xysp-data.js'];

for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.log(`  ⚠️ 缺少 ${f}`); continue; }
  try {
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  } catch (e) {
    console.log(`  ❌ 加载 ${f} 失败：${e.message}`);
  }
}

/* ---------- 调试用：把「现在」定格到某个时刻 ----------
   HEATMAP_NOW=2026-10-15T18:30 时，热力图的时间判断会按这个时刻算 ——
   方便在非开奖日 / 18:00 前验证「该出的时候真的出、不该出的时候真的不出」。
   不设这个环境变量就是真实时间。 */
if (process.env.HEATMAP_NOW) {
  try {
    vm.runInContext('globalThis.HEATMAP_NOW_OVERRIDE = ' + JSON.stringify(process.env.HEATMAP_NOW) + ';', ctx);
    console.log(`  · 热力图时间已定格：HEATMAP_NOW=${process.env.HEATMAP_NOW}`);
  } catch (e) { console.log('  ⚠️ HEATMAP_NOW 设置失败：' + e.message); }
}

/* ---------- 调试：确认关键函数是否真的注入成功 ---------- */
try {
  const probe = vm.runInContext(
    'JSON.stringify({' +
    '  hit: typeof buildHitSectionHtml,' +
    '  css: typeof hitSectionCss,' +
    '  latest: typeof getLatestDraws,' +
    '  check: typeof checkAllHits,' +
    '  tpl: typeof TEMPLATES,' +
    '  games: typeof GAMES' +
    '})', ctx);
  console.log('  · 依赖检测：' + probe);
} catch (e) {
  console.log('  ❌ 依赖检测失败：' + e.message);
}

vm.runInContext(`
  globalThis.__T = TEMPLATES;
  globalThis.__G = GAMES;
  globalThis.__GROUPS = GROUPS;
  globalThis.__render = renderTicketImage;
  globalThis.__resolve = resolveTemplateValues;
  globalThis.__getDraw = getDraw;
  globalThis.__nextIssue = nextIssueFor;
  globalThis.__nextDate = nextDrawDate;
  globalThis.__nextWeek = nextDrawWeekday;
  globalThis.__getTicket = getTicket;
  globalThis.__shouldShowHeatmap = (typeof shouldShowHeatmap === 'function') ? shouldShowHeatmap : null;
  globalThis.__heatmapData = (typeof HEATMAP_DATA !== 'undefined') ? HEATMAP_DATA : null;
  /* 【热力图顶掉「最新开奖」】的三个共享函数（全部来自 latest-draws.js）——
     服务端预渲染和客户端就地重画用的是同一份，不会有第二套判断。 */
  globalThis.__latestBlockMode = (typeof latestBlockMode === 'function') ? latestBlockMode : null;
  globalThis.__latestBlockHtml = (typeof latestBlockHtml === 'function') ? latestBlockHtml : null;
  globalThis.__latestHeatmapSectionHtml = (typeof latestHeatmapSectionHtml === 'function') ? latestHeatmapSectionHtml : null;
  /* 【最新开奖】区块的稳定 id（来自 latest-draws.js）—— 客户端靠它定位替换 */
  globalThis.__latestDrawsId = (typeof LATEST_DRAWS_ID !== 'undefined') ? LATEST_DRAWS_ID : 'ro-latest';
  /* 【文章参考】区块的数据（来自 articles-data.js，build-articles.mjs 生成）。
     没有这个文件时是 null → 页面出「本期暂无」，不影响别的区块。 */
  globalThis.__articles = (typeof ARTICLES_DATA !== 'undefined') ? ARTICLES_DATA : null;
  /* 【开机号 / 选号直播】的数据（来自 kjh-data.js，build-kjh.mjs 每天 2 点生成）。
     没有这个文件时是 null → 页面出「暂无」，不影响别的区块。 */
  globalThis.__kjh = (typeof KJH_DATA !== 'undefined') ? KJH_DATA : null;
  /* 【晒票栏】的数据（来自 xysp-data.js，build-xysp.mjs 每 30 分钟抓一次、
      只保留 24 小时内的条目）。没有这个文件时是 null → 晒票栏显示「暂无」，
      不影响别的区块。 */
  globalThis.__xysp = (typeof XYSP_DATA !== 'undefined') ? XYSP_DATA : null;
  /* 【专家推荐】区块的数据（来自 experts-data.js，build-experts.mjs 生成）。
     ⚠️ 它是 const 声明 —— const 是词法绑定，跑完不会出现在 ctx 上，
        所以必须像这样显式挂到 globalThis 再取，别在主模块里直接引用。
     没有这个文件时是 null → 专家推荐整块不渲染（不显示空壳）。 */
  globalThis.__experts = (typeof EXPERTS_DATA !== 'undefined') ? EXPERTS_DATA : null;
  /* 【3D/排列三 手绘参考图】要用开奖历史（history.js 里的 DRAW_HISTORY）。
     它同样是 const 声明，所以照上面的办法显式挂到 globalThis 再取。
     取不到时是 null → 该区块整块不渲染（不显示空壳、更不放假数据）。 */
  globalThis.__hist = (typeof DRAW_HISTORY !== 'undefined') ? DRAW_HISTORY : null;
`, ctx);

const T = ctx.__T, G = ctx.__G, GROUPS = ctx.__GROUPS;
const render = ctx.__render, resolve = ctx.__resolve;
const getDraw = ctx.__getDraw, nextIssue = ctx.__nextIssue;
const nextDate = ctx.__nextDate, nextWeek = ctx.__nextWeek;
const getTicket = ctx.__getTicket;
const shouldShowHeatmap = ctx.__shouldShowHeatmap;
const HEATMAP = ctx.__heatmapData;
const latestBlockMode = ctx.__latestBlockMode;
const latestBlockHtmlFn = ctx.__latestBlockHtml;
const latestHeatmapSectionHtml = ctx.__latestHeatmapSectionHtml;
const LATEST_DRAWS_ID = ctx.__latestDrawsId || 'ro-latest';
/* 【文章参考】数据（articles-data.js；缺失时为 null） */
const ARTICLES = ctx.__articles;
/* 【开机号 / 选号直播】数据（kjh-data.js；缺失时为 null） */
const KJH = ctx.__kjh;
/* 【晒票栏】数据（xysp-data.js；缺失时为 null → 显示「暂无」） */
const XYSP = ctx.__xysp;
/* 【专家推荐】数据（experts-data.js；缺失时为 null → 整块不渲染） */
const EXPERTS = ctx.__experts;
/* 【开奖历史】（history.js）—— 3D/排列三 手绘参考图要用 */
const HIST = ctx.__hist;

/**
 * 热力图该不该出这张图
 * 口径：heatmap-data.js 里的 shouldShowHeatmap（开奖日 + 当天数据 + 已过 18:00）
 * 没有 heatmap-data.js / 没有该彩种数据 → 一律不出
 */
function heatmapVisible(gameId) {
  try {
    if (typeof shouldShowHeatmap !== 'function') return false;
    return !!shouldShowHeatmap(gameId);
  } catch (e) { return false; }
}

/** 给日志用的原因说明 */
function heatmapWhy(gameId) {
  try {
    const H = (HEATMAP && HEATMAP.games) ? HEATMAP.games[gameId] : null;
    if (typeof shouldShowHeatmap !== 'function') return '没有 heatmap-data.js';
    if (!H) return '数据里没有这个彩种';
    if (shouldShowHeatmap(gameId)) return '应显示';
    return `数据日期 ${H.drawDate}，当前不满足「开奖日 18:00 之后且数据是当天」`;
  } catch (e) { return '判断异常：' + e.message; }
}

/* ============================================================
   DOM → HTML 字符串
   ------------------------------------------------------------
   【必须和浏览器里的 dom.outerHTML 尽量一致】
   因为页面上「服务器端预渲染的兜底内容」和「浏览器实时渲染的结果」
   要能逐字符对上，序列化只要丢东西，两边就会不一样。

   要点：
     1. class / 内联 style / dataset(data-*) / setAttribute 全部导出
     2. innerHTML、textContent、children 三者可能【同时】存在，必须都拼进去：
          render.js 里  foot.innerHTML = '— 品牌 · 仅供参考 —';
                        foot.appendChild(免责声明 div);
        只认 innerHTML 的话，免责声明那一行就整段丢了。
        顺序：innerHTML（原样，里面本来就带标签）→ 文本 → 子节点
   ============================================================ */

/** 取内联样式文本（cssText 优先，其次把驼峰属性拼出来） */
function cssOf(node) {
  let cssText = '';
  try {
    const s = node.style;
    if (!s) return '';
    if (typeof s.cssText === 'string' && s.cssText) cssText = s.cssText;
    // 兜底：cssText 为空但有驼峰属性，逐个拼
    if (!cssText && typeof s === 'object') {
      const parts = [];
      Object.keys(s).forEach((k) => {
        if (k === 'cssText' || k === 'setProperty' || k === 'getPropertyValue') return;
        const v = s[k];
        if (v === undefined || v === null || v === '') return;
        const kebab = String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
        parts.push(`${kebab}:${v}`);
      });
      cssText = parts.join(';');
    }
  } catch (e) { cssText = ''; }
  return cssText;
}

/** 收集一个节点的全部属性（顺序固定，两边才能逐字符相同） */
function attrPairs(node) {
  const out = [];

  if (node.className) out.push(['class', String(node.className)]);

  // dataset → data-*
  if (node.dataset && typeof node.dataset === 'object') {
    Object.keys(node.dataset).forEach((k) => {
      const v = node.dataset[k];
      if (v === undefined || v === null) return;
      const name = 'data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
      out.push([name, String(v)]);
    });
  }

  // setAttribute 设过的（class/style 已经在别处处理，跳过避免重复）
  if (node.attrs && typeof node.attrs === 'object') {
    Object.keys(node.attrs).forEach((k) => {
      const lk = String(k).toLowerCase();
      if (lk === 'class' || lk === 'style') return;
      const v = node.attrs[k];
      if (v === undefined || v === null || v === false) return;
      out.push([k, String(v)]);
    });
  }

  const cssText = cssOf(node);
  if (cssText) out.push(['style', cssText]);

  return out;
}

function toHtml(node) {
  if (!node) return '';
  if (String(node.tagName).toUpperCase() === '#TEXT') return escape(node._text || '');

  const tag = String(node.tagName || 'div').toLowerCase();
  const attrs = attrPairs(node).map((p) => ` ${p[0]}="${escapeAttr(p[1])}"`).join('');

  let inner = '';
  // ① innerHTML（保持原样，里面自带标签/实体）
  if (node._html !== null && node._html !== undefined) inner += String(node._html);
  // ② textContent（如果之后又 appendChild 过，浏览器里文本节点在前）
  if (node._text) inner += escape(node._text);
  // ③ 子节点
  if (node.children && node.children.length) inner += node.children.map(toHtml).join('');

  // 自闭合标签
  if (['br', 'img', 'hr', 'input'].includes(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 属性值：还要转义引号 */
function escapeAttr(s) {
  return escape(s).replace(/"/g, '&quot;');
}

/**
 * 取「手动录入」那一层数据
 * 【关键】必须和 App 里这句完全一致：
 *     getTicket(gameId, nextDrawDate(gameId)) .images[imageKey]
 * 以前这里传的是 null，等于把「手动录入」整层丢掉，
 * 结果 App 用录入的号、网页用自动算的号 —— 10 张图全都不一样。
 */
function manualValuesFor(gameId, date, imageKey) {
  try {
    const entry = (typeof getTicket === 'function') ? getTicket(gameId, date) : null;
    return (entry && entry.images && entry.images[imageKey]) || null;
  } catch (e) {
    return null;
  }
}

/* ============================================================
   生成内容
   ============================================================ */
console.log('════════════════════════════════════════════');
console.log('  生成只读分享版');
console.log('════════════════════════════════════════════\n');

const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const nowStamp = `${todayStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

/* ---------- 组装完整 HTML ---------- */

/* ============================================================
   更新状态判断
   ------------------------------------------------------------
   检查存档文件（saved-tickets.js）是否覆盖了各彩种的下一期，
   并判断数据是否够新。给手机页顶部显示提示用。

   【开奖后立刻转黄】用户原话：
     「开奖后.公布了开奖号码.就要切换下一期暂未更新的模板」
   判断依据见下面 recOutdatedByDraw()。
   ============================================================ */

/* 【自测开关】STATUS_SIM_DRAW=ssq:2026119,kl8:2026275 …
   只在「状态判断」这一步，把看到的「最新开奖期号」换成给定值，
   用来在不开奖的日子里验证「开奖后转黄 / 出号后转绿」。
   页面上的开奖号码、推荐号码一律不动；不设这个变量时行为完全不变。 */
const SIM_DRAW_ISSUE = (() => {
  const out = {};
  const raw = String(process.env.STATUS_SIM_DRAW || '').trim();
  if (!raw) return out;
  raw.split(',').forEach((one) => {
    const i = one.indexOf(':');
    if (i < 0) return;
    const gid = one.slice(0, i).trim();
    const iss = one.slice(i + 1).trim();
    if (gid && iss) out[gid] = iss;
  });
  return out;
})();

/** 取期号里的数字（"2026118" → "2026118"）；一个数字都没有时返回 null */
function issueDigits(s) {
  const d = String(s === null || s === undefined ? '' : s).replace(/[^0-9]/g, '');
  return d || null;
}

/**
 * 这个彩种【存档里当前那份推荐】是不是「已经开过奖」的那一期
 * ------------------------------------------------------------
 * 口径：只看期号，不看时间。
 *   摇号写进存档的期号 = 摇号那一刻的「最新开奖期号 + 1」
 *   （ticket-store.js 用的是 nextIssueFor()），也就是这份推荐是给【下一期】做的。
 *   ⇒ 存档推荐期号 ≤ 最新开奖期号
 *         = 推荐所依据的那一期已经开奖公布 → 这份推荐过期、需要重出
 *         → 计入 missing → 顶部显示黄色「下一期推荐暂未更新」
 *   ⇒ 反过来：刚摇完号恒有「推荐期 = 最新开奖期 + 1」> 开奖期
 *         → 必然绿色。不会出现「重出完了还一直卡在黄色」。
 *
 * 为什么不用「生成时间 / 开奖日期」比：
 *   存档里的 date 是【要开奖的那一天】，不是生成时间。开奖日当天 2 点摇的号，
 *   date 就是当天；拿日期比会在当天开奖【之前】就误判成过期。
 *   期号口径没有这个歧义，而且和摇号写入用的是同一个字段。
 *
 * 保守（拿不准就不算过期，保持原来的判断，避免整页卡黄）：
 *   · 没有该彩种的开奖数据
 *   · 存档推荐 / 最新开奖任一侧没有期号
 *   · 两侧期号位数不同（跨年或数据源换了格式）
 *
 * @param {string} id  彩种 id
 * @param {object} rec 存档里「下一期」那条推荐 { issue, date, images }
 * @returns {boolean} true = 已开奖、需重出
 */
function recOutdatedByDraw(id, rec) {
  if (!rec) return false;

  let draw = null;
  try { draw = (typeof getDraw === 'function') ? getDraw(id) : null; } catch (e) { draw = null; }

  const drawIssue = SIM_DRAW_ISSUE[id] || (draw && draw.issue) || '';
  const ri = issueDigits(rec.issue);
  const di = issueDigits(drawIssue);
  if (!ri || !di) return false;                  /* 缺期号 → 拿不准，不动 */
  if (ri.length !== di.length) return false;     /* 跨年 / 换格式 → 拿不准，不动 */

  return Number(ri) <= Number(di);
}

function checkUpdateStatus() {
  // 读取存档
  let saved = { updated: null, tickets: {} };
  const sp = path.join(ROOT, 'saved-tickets.js');
  if (fs.existsSync(sp)) {
    try {
      const sctx = vm.createContext({ console, Object, Array, String, Number, Date, Math, JSON });
      vm.runInContext(fs.readFileSync(sp, 'utf8') + '\nglobalThis.__S = SAVED_TICKETS;', sctx);
      saved = sctx.__S || saved;
    } catch (e) { /* 忽略 */ }
  }

  const savedTime = saved.updated || null;
  const tickets = saved.tickets || {};

  // 数据是否够新（24 小时内算新）
  let stale = true;
  let hoursOld = null;
  if (savedTime) {
    const t = new Date(savedTime.replace(' ', 'T'));
    if (!isNaN(t.getTime())) {
      hoursOld = (now - t) / 3600000;
      stale = hoursOld > 24;
    }
  }

  // 各彩种是否都有下一期的推荐数据，以及那份推荐是不是已经开过奖了
  const missing = [];
  const rows = [];
  Object.keys(T).forEach((id) => {
    const wantDate = nextDate(id);
    const rec = tickets[id] && tickets[id][wantDate];
    const hasImgs = rec && rec.images && Object.keys(rec.images).length > 0;
    const nm = G[id] ? G[id].name : id;

    let verdict;
    if (!hasImgs) { missing.push(nm); verdict = '没有这一期的推荐'; }
    else if (recOutdatedByDraw(id, rec)) { missing.push(nm); verdict = '已开奖，需重出'; }
    else verdict = '有效';

    /* 自测表：最新开奖期号 / 存档推荐期号 / 判定（一行一个彩种） */
    let drawIssueNow = '';
    try { const d = getDraw(id); drawIssueNow = (d && d.issue) || ''; } catch (e) { drawIssueNow = ''; }
    const shown = SIM_DRAW_ISSUE[id] || drawIssueNow || '（无开奖数据）';
    rows.push(`     ${nm}：最新开奖 ${shown} / 存档推荐 ${(rec && rec.issue) || '（无）'}` +
              `（${wantDate}）→ ${verdict}`);
  });

  console.log('  · 开奖后状态判断（推荐期 ≤ 最新开奖期 → 需重出）：');
  rows.forEach((r) => console.log(r));

  const allReady = missing.length === 0 && !stale;

  return { savedTime, stale, hoursOld, missing, allReady, nowStamp };
}

const status = checkUpdateStatus();
console.log(`  · 状态条判定：${status.allReady ? '绿色 ok（已更新）' : '黄色 warn（下一期推荐暂未更新）'}` +
  (status.missing.length ? ` —— 需重出/缺：${status.missing.join('、')}` : ''));

/* ---------- 状态条 HTML（延后生成，此时 T/G 已可用） ---------- */
let statusHtml = '';

/* ============================================================
   【热力图顶掉「最新开奖」】这一页现在该放哪一张
   ------------------------------------------------------------
   用户原话：「在开双色球的时候 18 点更新到最新开奖位置覆盖住，过了 20 点
              就更新回来最新开奖；大乐透 18 点过去，21 点回来。」
   规则（北京时间，仅开奖日）：
     双色球 18:00 ≤ now < 20:00 → 双色球热力图占位
     大乐透 18:00 ≤ now < 21:00 → 大乐透热力图占位
     其余时刻                   → 「最新开奖」

   【判断只此一处】调 latest-draws.js 的 latestBlockMode()，它内部问的是
   heatmap-data.js 的 shouldShowHeatmap()（和客户端、App 同一个函数）。
   同一时刻只会有一个彩种在窗口内（ssq 与 dlt 的开奖日不相交）。

   【图只出现一次】窗口内的热力图【移到页面顶部】，彩种区块里那张
   「图三：实票统计」就【不再重复渲染】—— 同一张 760px 的图在手机屏上
   出现两次既浪费流量又会让用户以为出错了。所以：
     窗口内 → 顶部 1 张（21 个图位总数不变）
     窗口外 → 一张都不出（和以前「按天出」的规则一致）
   ============================================================ */
const blockMode = (typeof latestBlockMode === 'function')
  ? latestBlockMode()
  : { mode: 'latest', gameId: '' };
console.log(`  · 「最新开奖」区块形态 = ${blockMode.mode}` +
  (blockMode.gameId ? `（${G[blockMode.gameId] ? G[blockMode.gameId].name : blockMode.gameId} 热力图占位）` : '（最新开奖）'));

/**
 * 渲染某个彩种的某张模板图 → 内联 HTML
 * 【关键·同源】调用方式和 App 的 renderImagesInto 完全一致：
 *     manual   = getTicket(gameId, nextDrawDate(gameId)).images[key]
 *     resolved = resolveTemplateValues(gameId, key, manual)
 *     data     = { issue, date, images: { [key]: resolved.values } }
 * 以前这里第三个参数传的是 null，等于把「手动录入」整层丢掉 ——
 * App 用手动录入的号、网页用自动算的号，10 张图全都不一样。
 * 现在两边输入一模一样，输出才可能一模一样。
 * @returns {string} 渲染后的 DOM HTML；失败返回空串
 */
function renderImageHtml(id, imgKey) {
  try {
    const date = nextDate(id);
    const issue = nextIssue(id) || '';
    const manual = manualValuesFor(id, date, imgKey);
    const resolved = resolve(id, imgKey, manual);
    const data = { issue, date, images: {} };
    data.images[imgKey] = resolved.values;
    return toHtml(render(id, imgKey, data));
  } catch (e) {
    console.log(`  ⚠️ 渲染 ${id}/${imgKey} 失败：${e.message}`);
    return '';
  }
}

let sectionsHtml = '';
let gameCount = 0;
let imgCount = 0;

GROUPS.forEach((group) => {
  group.ids.forEach((id) => {
    const game = G[id];
    const tpl = T[id];
    if (!game || !tpl) return;

    gameCount++;

    const draw = getDraw(id);
    const issue = nextIssue(id) || '';
    const date = nextDate(id);
    const week = nextWeek(id);

    // 该彩种的开奖号码行
    let drawHtml = '';
    if (draw && draw.areas) {
      /* 【颜色区分】用户要求：「开奖的蓝球要区分出来」
         以前这里所有球都是 class="ro-ball"、没有颜色变体，
         所以双色球的蓝球看起来和红球一模一样。
         现在按区域给颜色：红球区 → red，蓝球/后区/特别号 → blue。
         区域名到颜色的对应（与 games.js 的 areas[].color 口径一致）：
           ssq red/blue · dlt front/back · qlc main/special · qxc front/back
           kl8 main · fc3d/pl3/pl5 main */
      const BLUE_AREAS = ['blue', 'back', 'special'];
      /* 【补零规则】数字彩（3D/排列3/排列5/七星彩）的号码是单个数字，
         0 显示成 0、不补零（用户要求）；其它彩种仍然补两位（4 → 04）。 */
      const DIGIT_GAMES = ['fc3d', 'pl3', 'pl5', 'qxc'];
      const isDigitGame = DIGIT_GAMES.indexOf(id) >= 0;
      const balls = [];
      Object.keys(draw.areas).forEach((k) => {
        const isBlue = BLUE_AREAS.indexOf(k) >= 0;
        (draw.areas[k] || []).forEach((n) => {
          const txt = isDigitGame ? String(n) : String(n).padStart(2, '0');
          balls.push(`<span class="ro-ball ${isBlue ? 'blue' : 'red'}">${txt}</span>`);
        });
      });
      drawHtml =
        `<div class="ro-drawblock">` +
        `<div class="ro-drawlabel">第 ${draw.issue} 期开奖</div>` +
        `<div class="ro-balls">${balls.join('')}</div>` +
        `</div>`;
    }

    // 渲染该彩种的所有模板图（服务器端预渲染 = 无 JS 时的兜底）
    let imgsHtml = '';
    tpl.images.forEach((img) => {
      /* 【按天出】实票统计热力图：
         它现在【只出现在页面顶部的「最新开奖」位置】（见上面的 blockMode），
         彩种区块里不再重复渲染第二张 —— 所以这里一律跳过：
           · 在窗口内 → 已经被顶部区块用了（同一张图，不会丢）
           · 不在窗口内 / 没有当日数据 → 本来就不该出
         判断口径和客户端 shouldShowHeatmap 完全一致。 */
      if (img.key === 'heatmap') {
        console.log(`  · 热力图位置：${G[id] ? G[id].name : id}（` +
          (heatmapVisible(id) && blockMode.gameId === id
            ? '已移到页面顶部「最新开奖」位置'
            : heatmapWhy(id)) + '）');
        return;
      }
      /* 【关键·同源】调用方式和 App 的 renderImagesInto 完全一致：
           manual   = getTicket(gameId, nextDrawDate(gameId)).images[key]
           resolved = resolveTemplateValues(gameId, key, manual)
           data     = { issue, date, images: { [key]: resolved.values } }
         以前这里第三个参数传的是 null，等于把「手动录入」整层丢掉 ——
         App 用手动录入的号、网页用自动算的号，10 张图全都不一样。
         现在两边输入一模一样，输出才可能一模一样。 */
      const dom = renderImageHtml(id, img.key);
      if (!dom) return;

      /* 图位：data-game / data-image 告诉页尾的实时渲染脚本该填哪张图。
         里面的内容是预渲染兜底 —— JS 没跑或渲染失败时，页面依然有图。

         【手机目录·锚点】图位前面多放一个空 <span id="ro-g-彩种-图名">：
         手机上的目录表格（见下面的 TOC_ROWS）每一格都链到它。
         锚点用【紧挨着的空 span】而不是直接给图位加 id ——
         图位的 class / data 属性一个字节都不动，并排脚本、实时渲染脚本
         和「按 class 找图位」的验收脚本都不受影响。
         data-ro-mob="" 是给页尾全屏查看层用的标记：
         只有带这个属性的图位才能被目录格子打开（实时渲染不会删掉它）。 */
      imgsHtml +=
        `<span class="ro-anchor" id="ro-g-${id}-${img.key}"></span>` +
        `<div class="ro-imagewrap" data-game="${id}" data-image="${img.key}" data-ro-mob="">` +
        dom +
        `</div>`;
      imgCount++;
    });

    sectionsHtml +=
      `<section class="ro-game">` +
      `<div class="ro-gamehead">` +
      `<h2>${game.name}</h2>` +
      `<div class="ro-meta">${date} ${week} · 第 ${issue} 期 · ${game.issuer}</div>` +
      `</div>` +
      drawHtml +
      imgsHtml +
      `</section>`;
  });
});

/* ============================================================
   【手机目录表格 · 方案 D】5 行 × 2 列
   ------------------------------------------------------------
   用户原话：「我的云端显示布局，上面有用表格截图布局 是实现不了吗？」
   用户已经在手机上确认选方案 D，顺序 / 文字就是下面这 10 格。

   为什么要有它：
     手机屏只有约 390px 宽，一张推荐图的设计宽度是 760px，
     两张并排每张只剩约 185px —— 号码根本看不清。
     所以手机上【不做真并排】，改成先看这张【文字目录表格】，
     点某一格 → 全屏看那一张（全屏层叫 ro-mob-view，见页尾脚本）。

   顺序 = 用户给的布局图：
     第1行 双色球推荐号 | 双色球五行图资料
     第2行 大乐透推荐号 | 大乐透五行图
     第3行 3D           | 快乐8
     第4行 排列三       | 排列五
     第5行 七乐彩       | 七星彩

   文字口径（用户明确要求）：
     · 双色球 / 大乐透的左格写「推荐号」（不是「推荐」）
     · 右边：双色球「五行图资料」、大乐透「五行图」，其余只写彩种名

   这里的 game/image 必须和页尾 __PAIR_V2__ 的 PAIRS 一一对应
   （下面有断言，不一致时生成日志里会直接报出来）。 */
const TOC_ROWS = [
  /* 【长名字拆两行】用户 2026-10-17：手机 335px 下「双色球 五行/绕胆/九转/九宫」会折 3 行
     → 撑破 56px 的格子（第三行被裁掉，看着就是"高矮不齐 + 空档"）。
     所以拆成【主标题 t】+【副标题 s】：一行放得下，格子自然整齐；没有 s 的就是单行格子。 */
  [{ t: '双色球推荐号',     g: 'ssq',  i: 'main' }, { t: '双色球 · 五行',  s: '绕胆/九转/九宫', g: 'ssq',  i: 'wuxing' }],
  [{ t: '大乐透推荐号',     g: 'dlt',  i: 'main' }, { t: '大乐透 · 五行',  s: '绕胆/九转/九宫', g: 'dlt',  i: 'wuxing' }],
  [{ t: '3D',               g: 'fc3d', i: 'main' }, { t: '快乐8',            g: 'kl8',  i: 'main'   }],
  [{ t: '排列三',           g: 'pl3',  i: 'main' }, { t: '排列五',           g: 'pl5',  i: 'main'   }],
  [{ t: '七乐彩',           g: 'qlc',  i: 'main' }, { t: '七星彩',           g: 'qxc',  i: 'main'   }]
];

/* 【自检】目录里每一格的锚点 id 在这份 HTML 里必须真的存在。
   注意要用【已经加了 id 的 sectionsHtml】判断，不能用原始 tpl.images ——
   qlc / qxc 的 wuxing 在模板里存在但按用户要求不渲染，
   只看模板会漏报。 */
let tocCheckedCount = 0;
let tocMissingCount = 0;
TOC_ROWS.forEach((row) => row.forEach((cell) => {
  const aid = `ro-g-${cell.g}-${cell.i}`;
  const hit = sectionsHtml.indexOf('id="' + aid + '"') >= 0;
  if (!hit) { tocMissingCount++; console.log(`  ⚠️ 目录格子「${cell.t}」找不到目标图位：${aid}`); }
  tocCheckedCount++;
}));
console.log(`  · 手机目录：${TOC_ROWS.length} 行 × 2 列 = ${tocCheckedCount} 格，` +
  `锚点缺失 ${tocMissingCount} 个`);

const tocHtml =
  /* 【__TOC_EQH__ 留痕】这里额外补一条【HTML 注释】形式的标记，原因：
     真正的等高规则写在下面的样式表里（56px 固定高 + grid-auto-rows），但那一段是
     <style> 里的 CSS 注释 —— 构建最后那道「留痕断言」会把 <style>/<script> 里的注释
     整体剥掉，标记会跟着消失（规则本身不受影响）。
     HTML 注释不在被剥的范围里，所以标记留在成品页上，改高度前能搜到它。
     ⚠️ 这条注释里【不写任何文件名/站名】。 */
  `<!-- __TOC_EQH__ 手机推荐图目录：卡片固定等高（56px）· grid-auto-rows:56px · 竖向 flex 居中 -->` +
  `<div class="ro-imgtoc-wrap">` +
  `<div class="ro-imgtoc-head">` +
  `<div class="ro-imgtoc-title">推荐图目录</div>` +
  `<div class="ro-imgtoc-sub">点一下，全屏看那张图</div>` +
  `</div>` +
  /* 【改成两列网格】用户 2026-10-17：「宽一点居中」。
     原来是 <table> + <td width:50%>：实测列宽被表格自身的布局规则钉住，
     渲染出来两列只占中间一段（右边空一大片），加 !important 也压不动。
     改成 grid 两列（1fr 1fr），宽度完全由我们掌控 —— 两列等宽、铺满、居中。
     ⚠️ 类名全部不变（.ro-imgtoc / .ro-toc-cell / .ro-toc-t / .ro-toc-s），
        点击照旧是 <a href="#…">，所以 CSS 和点击逻辑都不用跟着改。 */
  '<div class="ro-imgtoc">' +
  TOC_ROWS.map((row) => row.map((cell) =>
    /* 【主标题 + 副标题】长名字（五行/绕胆/九转/九宫）拆成两行小字，一行放得下，
       格子就不会被折 3 行撑破（用户 2026-10-17 要求）。点击照旧：整块都在 <a> 里。 */
    `<a class="ro-toc-cell${cell.s ? ' two-line' : ''}" href="#ro-g-${cell.g}-${cell.i}" ` +
    `data-ro-toc-game="${cell.g}" data-ro-toc-image="${cell.i}">` +
    `<b class="ro-toc-t">${cell.t}</b>` +
    (cell.s ? `<i class="ro-toc-s">${cell.s}</i>` : '') +
    `</a>`
  ).join('')).join('') +
  `</div>` +
  `</div>`;

/* ============================================================
   【文章参考】区块（用户新增需求 + 2026-10-16 改版）
   ------------------------------------------------------------
   数据：articles-data.js（build-articles.mjs 抓取，每小时 :16 一次）
   位置：紧跟【最新开奖】下面 —— 也就是原来「彩票推荐图」那条分隔条的位置
         （那条分隔条已被用户要求全局隐藏，这里不恢复它）
   布局：窄屏竖着一列一列排（每个彩种一块）；宽屏并排（自适应 2~3 列）

   【本次改版 · 用户原话】
     「微信把 yiqicai.com 拉黑了，点链接跳过去打不开
       → 要把正文抓到我们页面上」 → 方案 A：标题下【原地展开阅读】
     · 标题仍然是 <a>（页面不变量：不能出现 button 标签），
       href 是页内锚点 #ro-art-N（不写源站域名），点一下只展开、不跳转
     · 为什么用方案 A 而不是复用全屏层(ro-mob-view)：正文是长文本，
       全屏层是给看图用的（缩放/双指那套），塞文字要改它的层级与手势逻辑，
       风险大；原地展开零层级风险、段落读起来也顺。
     · 展开是【点哪篇展开哪篇、默认全部收起】，再点一次收起。
       scrollIntoView 只在展开时、且仅在正文顶端出到视口上方时才补,
       避免标题被顶出屏幕（收起不滚动，免得页面乱跳）。
     · 正文里的段落是【纯文本】，图片是 { i: 地址 } 那一种元素 ——
       那个元素单独一个 <p class="ro-art-img">，不是用户内容，
       所以页面上不会出现标签样的字面量。
     · 正文的图不写 data-image → 图位数量(data-image=)必须仍然是 21。
   ============================================================ */
const ART_SHORT_NAME = { ssq: '双色球', dlt: '大乐透', fc3d: '3D', pl3: '排三', kl8: '快乐8' };
const ART_ORDER = ['ssq', 'dlt', 'fc3d', 'pl3', 'kl8'];

/** 链接里避免出现来源字样。
    顺序很重要：先用 escapeAttr 转义，再把域名那串字母换成 HTML 实体 ——
    浏览器解析属性值时会把 &#97; 解码回 a，链接照样能打开；
    反过来先换实体再转义，& 会被二次转义成 &amp;#97; 就废了。 */
function articleHref(u) {
  return escapeAttr(String(u == null ? '' : u)).replace(/yiqicai/gi, 'yiqic&#97;i');
}

/* 文章参考 · 正文的每个元素单独一段（段落文字 / 图片）——
   HTML 里【不出现用户内容之外的标签样字面量】，所以这样铺开写。 */
function artBodyHtml(body) {
  if (!Array.isArray(body) || !body.length) return '';
  const segs = [];
  for (const seg of body) {
    if (seg && typeof seg === 'object') {
      const src = String(seg.i || '');
      if (!/^https:\/\//i.test(src)) continue;      /* 只认 https，免得混合内容被浏览器拦掉 */
      segs.push('<p class="ro-art-img">' +
        '<img src="' + escapeAttr(src) + '" alt="" loading="lazy" decoding="async"' +
        ' referrerpolicy="no-referrer"></p>');
    } else {
      const t = String(seg == null ? '' : seg).trim();
      if (!t) continue;
      segs.push('<p class="ro-art-p">' + escape(t) + '</p>');
    }
  }
  return segs.join('');
}

function buildArticlesHtml() {
  const data = (ARTICLES && ARTICLES.games) ? ARTICLES.games : null;
  const updated = (ARTICLES && ARTICLES.updated) ? String(ARTICLES.updated) : '';

  let total = 0;
  let artId = 0;                 /* 正文块的 id 序号，页面内唯一，和 data-ro-art 对应 */
  let bodyCnt = 0;               /* 带正文的篇数，日志用 */
  const groupsHtml = ART_ORDER.map((k) => {
    const g = data ? data[k] : null;
    const items = (g && Array.isArray(g.items)) ? g.items : [];
    total += items.length;
    const label = ART_SHORT_NAME[k] || (g && g.name) || k;

    const list = items.length
      ? '<ul class="ro-art-list">' + items.map((it) => {
          const meta = [];
          if (it.author) meta.push(`<span class="ro-art-author">${escape(it.author)}</span>`);
          if (it.date) meta.push(`<span class="ro-art-date">${escape(it.date)}</span>`);

          const body = Array.isArray(it.body) ? it.body : null;
          const hasBody = !!(body && body.length);
          if (hasBody) bodyCnt++;
          const id = ++artId;

          /* 正文：默认收起（CSS 里 display:none），点标题才展开 */
          const bodyHtml = hasBody
            ? `<div class="ro-art-body" id="ro-art-${id}" data-ro-art="${id}">` +
              artBodyHtml(body) +
              `<p class="ro-art-note">正文已存入本页，仅供阅读参考。</p>` +
              `</div>`
            : '';

          return `<li class="ro-art-item${hasBody ? '' : ' ro-art-nobody'}">` +
            `<a class="ro-art-link" href="#ro-art-${id}" data-ro-art="${id}">` +
            `${escape(it.title)}</a>` +
            (meta.length ? `<div class="ro-art-meta">${meta.join('')}</div>` : '') +
            bodyHtml +
            `</li>`;
        }).join('') + '</ul>'
      : '<div class="ro-art-empty">本期暂无</div>';

    /* __GROUP_COL__ 用户要求：每个彩种分组也能收起，并写「点击查看 / 点击收起」。
       默认【展开】（保持原来一眼看到文章的样子）；点一下收起。
       用 details/summary 原生折叠，不写 JS。
       提示文字由 CSS 按 [open] 切换：展开时「点击收起」/ 收起时「点击查看」。 */
    return `<details class="ro-art-group">` +   /* 用户要求：默认收起，点了才展开 */
      `<summary class="ro-art-gname">${escape(label)}<i>${items.length} 篇</i>` +
      `<span class="ro-art-tip" aria-hidden="true"></span></summary>` +
      list +
      `</details>`;
  }).join('');

  return `<section class="ro-articles" id="ro-articles">` +
    `<div class="ro-art-head">` +
    `<h2 class="ro-art-title">文章参考</h2>` +
    `<div class="ro-art-sub">每 30 分钟自动更新` +
    ` · <span id="__ART_CD__">更新倒计时 --:--</span>` +   /* __ART_CD__ 用户要求：改成更新倒计时 */
    `</div>` +
    `</div>` +
    `<div class="ro-art-groups">${groupsHtml}</div>` +
    `</section>`;
}

/* ---------- 【3D & 排列三 手绘参考图】区块 ----------
   用户 2026-10-17 给的完整规格；实现在 p3d-section.mjs（构建期把数据算好内联，
   页面运行时不需要分析器）。数据用 history.js 真开奖近 30 期。
   六码用用户给的 LIUMA_RECOMMEND_MAP（按彩种分开）。 */
const P3D = require(path.join(ROOT, 'p3d-analyzer.js'));
const p3dHtml = P3D_SECTION_MOD.buildP3DSectionHtml(HIST, P3D, {
  periods: 30,
  typeMap: {
    '3d':  { title: '3D 手绘参考图（民间算法）',    name: '福彩3D' },
    'pl3': { title: '排列三 手绘参考图（民间算法）', name: '排列三' }
  },
  liuMaMap: {
    '3d':  { goldDan: 5, silverDan: 2, tuoList: [0, 1, 3, 4] },
    'pl3': { goldDan: 4, silverDan: 7, tuoList: [1, 2, 5, 6] }
  }
});
console.log('  · 3D 手绘参考图：' + (p3dHtml
  ? '已生成（' + (Buffer.byteLength(p3dHtml, 'utf8') / 1024).toFixed(1) + ' KB）'
  : '无数据 → 整块不渲染'));

const articlesHtml = buildArticlesHtml();

/* ============================================================
   【专家推荐】区块（用户新增指令）
   ------------------------------------------------------------
   用户原话（逐字）：「专家推荐（可展开收起）」+ 给了结构：
     头部 = 👤 专家推荐 + 数量徽章 + ▾ 折叠箭头
     内容 = 列表（JS 动态渲染）+ 「已加载全部」
   数据来源：experts-data.js（build-experts.mjs 抓的一起彩专家统计）
     · 每个彩种取 games[g].stable（「稳定专家」榜，已按 score 排好）
     · 用户选择：按彩种分，每彩种显示稳定专家【前 10】
   ⚠️ 页面不变量：这一块【纯文字、不含任何图片】→ data-image 仍是 21。
   ⚠️ 折叠用原生 <details>/<summary>（和晒票 / GPT摇号同一套），
      页面里【不能出现裸 <button>】（用户铁律）。
   ⚠️ 数据缺失（没抓到 / 文件不在）时返回空字符串 —— 整块不渲染，
      不显示空壳、不编造专家。
   ============================================================ */
const EXPERT_SHORT = { ssq: '双色球', dlt: '大乐透', fc3d: '福彩3D', klb: '快乐8',
  pl3: '排列3', pl5: '排列5', xqxc: '七星彩', qlc: '七乐彩' };
function buildExpertsHtml() {
  const E = EXPERTS;
  if (!E || !E.games) return '';
  const order = ['ssq', 'dlt', 'qlc', 'xqxc', 'klb', 'fc3d', 'pl3', 'pl5'];
  let totalShown = 0;
  const groups = order.map((gid) => {
    const g = E.games[gid];
    if (!g) return '';
    /* 用户 2026-10-17：每位彩种展示的专家从 10 位扩到 20 位
       （build-experts.mjs 的 stableTop 同步改成 20，否则这里取不到那么多）。 */
    const list = Array.isArray(g.stable) ? g.stable.slice(0, 20) : [];
    if (!list.length) return '';
    totalShown += list.length;
    const rows = list.map((x, i) => {
      const pct = Math.round((x.hitRate10 || 0) * 100);
      const streak = x.curStreak || 0;
      const best = x.maxStreak || 0;
      const hitCls = x.lastHit ? ' hit' : ' miss';
      /* 【本轮改版】每行加上 data-ex-key → 点专家就【就地展开逐期明细】。
         ⚠️ key 规则和专家池模块:377 的【完全同一套】：gameId + '-' + idx。
            那边是 expertStableList() = g.stable 按 score 降序后取前 N；
            这里用 g.stable 原序取前 10 —— 实测 experts-data.js 里每个彩种的
            stable[] 本身【已经按 score 降序】排好（已核对 8 个彩种），
            所以两边的 idx 指向【同一位专家】，key 对得上。
         ⚠️ 展开/收起【没有第二套逻辑】：详情 DOM 的 id 就叫 ex-detail-<key>，
            内容和「稳定专家」面板用的是同一个函数 expertDetailHtml()
            （expert-pool.js:285，它挂在页面的全局作用域上，脚本已内联进本页）。
         ⚠️ 不能是裸 <div onclick>（键盘聚焦不到）、更不能是裸 <button>
            （页面不变量：button 标签 = 0）→ 用 <a role="button" tabindex="0">，
            和 expert-pool.js 里完全一样的写法。 */
      const exKey = gid + '-' + i;
      return '<div class="ro-xj-item">' +
        '<a class="ro-xj-row" role="button" tabindex="0"' +
        ' data-ex-key="' + escapeAttr(exKey) + '" aria-expanded="false">' +
        '<span class="ro-xj-rank">' + (i + 1) + '</span>' +
        '<span class="ro-xj-name">' + escape(x.name || '') + '</span>' +
        '<span class="ro-xj-cat">' + escape(x.cat || '') + '</span>' +
        '<span class="ro-xj-rate">命中 ' + pct + '%</span>' +
        '<span class="ro-xj-streak">连' + streak + ' · 最长' + best + '</span>' +
        '<span class="ro-xj-last' + hitCls + '">' + (x.lastHit ? '中' : '未中') + '</span>' +
        '</a>' +
        /* 详情默认 hidden（= 收起）；展开了再填内容（同一套 expertDetailHtml()） */
        '<div class="ro-xj-detail" id="ex-detail-' + escapeAttr(exKey) + '" hidden></div>' +
        '</div>';
    }).join('');
/* 【期号状态】把这一组专家「最新已出号的期次」标出来 + 说明下一期待出号。
   取该组所有专家 catLatest.issue 的最大值（就是源站最新那期），一个都没有就不显示。 */
function issueNote(list) {
  let iss = '';
  (list || []).forEach((e) => {
    const i = e && e.catLatest && e.catLatest.issue;
    if (i && (!iss || String(i) > String(iss))) iss = String(i);
  });
  if (!iss) return '';
  return '<span class="ro-xj-giss">' + escape(iss) + ' 期（已开奖）· 下一期待出号</span>';
}

    return '<div class="ro-xj-group">' +
      '<div class="ro-xj-ghead"><span class="ro-xj-gname">' +
      escape(EXPERT_SHORT[gid] || g.name || gid) + '</span>' +
      '<span class="ro-xj-gcount">' + list.length + ' 位</span>' +
      /* 【期号状态】用户 2026-10-17：「抓取下一期开奖的号码」→ 选了「标注清楚 + 等源站出号」。
         专家推荐表里最新的一期就是源站已出的那期（通常 = 最近已开奖期），
         下一期要等专家出号（开奖当天下午后才发）—— 这里只标事实，不预告号码。 */
      issueNote(list) + '</div>' +
      rows + '</div>';
  }).filter(Boolean).join('');
  if (!totalShown) return '';

  return '<details class="ro-xj">' +
    '<summary class="ro-xj-header">' +
    '<span class="ro-xj-icon" aria-hidden="true">👤</span>' +
    '<span class="ro-xj-title">专家推荐</span>' +
    '<span class="ro-xj-count">' + totalShown + '</span>' +
    '<span class="ro-xj-arrow" aria-hidden="true"></span>' +
    '</summary>' +
    /* 【文案】用户 2026-10-17 定稿：「数据来自于开发者自费」
       （中间被改成过「在线整理」，用户明确要求保持他说的这版，已写回） */
    '<div class="ro-xj-note">按彩种分 · 只取「稳定专家」前 20 位 · 数据来自于开发者自费</div>' +
    '<div class="ro-xj-list">' + groups + '</div>' +
    '<div class="ro-xj-more">已加载全部</div>' +
    '</details>';
}

const expertsHtml = buildExpertsHtml();
console.log(`  · 专家推荐：${E_EXPERT_BRIEF()}`);
function E_EXPERT_BRIEF() {
  const E = EXPERTS;
  if (!E || !E.games) return '无数据（区块不渲染）';
  const parts = [];
  Object.keys(E.games).forEach((k) => {
    const g = E.games[k];
    const n = Array.isArray(g.stable) ? Math.min(20, g.stable.length) : 0;
    if (n) parts.push((EXPERT_SHORT[k] || k) + ' ' + n);
  });
  return parts.length ? parts.join(' / ') : '无稳定专家';
}

/* __EXPERT_MARK__ 上面是专家推荐区块的构建函数 */
console.log(`  · 文章参考：${ART_ORDER.map((k) => {
  const g = ARTICLES && ARTICLES.games ? ARTICLES.games[k] : null;
  return ART_SHORT_NAME[k] + ' ' + ((g && g.items) ? g.items.length : 0) + ' 条';
}).join(' / ')}`);

/* ============================================================
   【晒票栏】区块（用户需求：直接显示晒票图片，页面内看图、不跳转）
   ------------------------------------------------------------
   用户原话：「做。一直循环抓取24小时内的 保留24小时内的图片」
   背景（用户说明）：「微信把 yiqicai.com 拉黑了，点链接跳过去打不开」
   ⇒ 所以要【在我们自己的页面里直接出图】，不再往源站跳。

   这一版跟上一版的区别（上一版是「8 个彩种入口格子、不显示图片」）：
     · 展开后是【图片网格】：每张卡片 = 缩略图 + 彩种名 +（有就显示）描述
     · 图片是【图床外链】—— 不把图片下载下来内联，
       所以页面体积几乎不变（这是选外链而不是下载的原因）
     · 上面一排彩种筛选（全部 + 8 个彩种 + 头条晒票）：点了只显示那一类，
       纯前端切换、不刷新页面、不重新请求
     · 点图片 → 放大看（能看清号码）：复用页尾已有的 ro-mob-view 全屏层
       （就是「推荐图目录」点开时用的那一层，自带 4 种关闭方式）
       —— 【不是】被用户删掉的那个旧放大器，也没有放大镜图标

   位置：紧跟在【推荐图目录】(.ro-imgtoc-wrap) 之后 —— 就是截图箭头处（不变）。
   数据：xysp-data.js（build-xysp.mjs 每 30 分钟抓一次，只保留 72 小时内的条目）。
         里面 games.tt = 今日头条的晒票（build-xysp-tt.mjs 抓，同一份文件里）。
         文件缺失时这一块显示「暂无」，绝不影响别的区块。
   折叠：仍然是原生 <details>/<summary>，【默认收起】，标题「晒票」（不变）。
         · <summary> 不是按钮标签 → 页面不变量「按钮标签数 = 0」不受影响
         · 右侧「展开 ▸ / 收起 ▾」用纯 CSS ::before/::after 跟着 [open] 变
   布局：手机 2 列、宽屏（>=620px）4 列。
   ⚠️ 这一块里【只用 <a>/<details>/<summary>/<img>】，不出任何按钮标签。
   ⚠️ 图片一律 loading="lazy" + referrerpolicy="no-referrer"
      （外链图床，不把来源 referrer 带过去、也不拖慢首屏）。
   ⚠️ 图片地址一律用 https：页面本身可能是 https 打开的，
      外链写成 http 会被浏览器按「混合内容」直接拦掉（图就白了）。
   ⚠️ 这里【不用】图位属性（data-image / data-ro-mob）——
      晒票栏的图（含头条的）不占推荐图的图位数量（不变量 = 21）。
   ⚠️ 页面可见文字里不出现来源字样。
   ============================================================ */

/* 8 个彩种 + 头条：key 必须和 xysp-data.js 里的 key 一致（顺序 = 筛选按钮顺序）
   ------------------------------------------------------------
   【头条晒票 · 第一版】用户原话：「把【今日头条】的晒票内容抓下来，并入只读
   分享页现有的「晒票」栏」+「筛选标签里加一个（比如「头条晒票」）」。
   【头条晒票 · 第二版（用户追加要求）】用户原话：
     「头条晒票的内容分发到各个对应的彩种地方」（配图圈的是「头条晒票」标签）
   ⇒ 现在的做法 = 分发 + 保留聚合视图（两个能力都要）：
     ① 抓取脚本按标题认出【所有】相关彩种 → 每条带 it.games = ['fc3d','pl3', …]
        （多彩种标题【多归属】：一条同时进 fc3d 和 pl3）
     ② 这里让【每张卡片都能被多个标签选中】：
        卡片上写 data-ro-xysp-games="fc3d pl3 dlt"（空格分隔，key 数组）
        筛选时用【包含判断】而不是相等判断 → 点「排列3」也能看到这条
     ③ 一张卡片只画一次（不是每个彩种画一张）⇒
        「全部」的可见数永远等于【去重后的条目总数】，不会重复计数
     ④ 认出彩种的走各彩种；【认不出彩种的】仍然留在「头条晒票」聚合标签里
        （it.games 为空 → 只有点「头条晒票」/「全部」才看得到，不会丢）
     ⑤ 标签顺序不变：全部 / 8 个彩种 / 头条晒票（头条放最后）
   ⚠️ 一起彩那 8 个彩种的数据【完全没动】：它们每条只有属于自己的那一个 key，
      data-ro-xysp-games 里就一个值 → 行为跟以前一模一样。
   头条卡片标题：<b>写它所属分类的名字</b>（在头条聚合里就是「头条晒票」），
   描述行以「彩种 · 标题」开头（例：「大乐透 · 10倍与11倍单式票…」）。 */
/* ⚠️ 用户最终要求：去掉「头条晒票」这个标签（标签从 10 个减到 9 个）。
   头条的内容【仍然存在】，只是全部通过 games 分发到各彩种里了
   （实测：头条条目 100% 都能认出彩种 —— 认不出的在抓取阶段就被
     "必须是票"那道闸挡掉了，所以 tt 聚合标签已经没有独占内容）。
   认不出彩种的条目（理论上不该有）仍然留在「全部」里，只是没有专属标签。 */
const XYSP_GAMES = [
  { key: 'ssq',  name: '双色球' },
  { key: 'dlt',  name: '大乐透' },
  { key: 'fc3d', name: '福彩3D' },
  { key: 'kl8',  name: '快乐8'  },
  { key: 'pl3',  name: '排列3'  },
  { key: 'pl5',  name: '排列5'  },
  { key: 'qxc',  name: '七星彩' },
  { key: 'qlc',  name: '七乐彩' }
];
const GAME_NAME = {};
XYSP_GAMES.forEach((g) => { GAME_NAME[g.key] = g.name; });

/* 【卡片上的时间点】用户要求「要会抓时间点」+「界面上可以显示」。
   选的是【相对时间】（比绝对值短、手机上一眼就懂），三种写法：
     · 有发布时间的：  「2 小时前」/「35 分钟前」/「刚刚」
     · 认得出彩种的：  再接一段「· 距开奖 3 小时」（有 nextAt 才加）
     · 都没有：        不加任何时间（绝不显示空白/乱码）
   ⚠️ 只用【相对时间】，不写具体时刻 —— 短、而且不受用户时区影响。
   ⚠️ 这些是服务端预渲染时算好的（页面是静态的），所以只会随每次重建更新；
      页面自己不会再算一遍（不新增任何页面脚本、不联网）。 */
function relTime(isoLike, nowMs) {
  const t = Date.parse(String(isoLike || ''));
  if (!isFinite(t)) return '';
  const d = nowMs - t;
  if (d < 0) return '刚刚';
  const min = Math.floor(d / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const h = Math.floor(min / 60);
  if (h < 24) return h + ' 小时前';
  const dd = Math.floor(h / 24);
  return dd + ' 天前';
}
/* 距下一次开奖还有多久（可能已开完 -> 显示"已开奖"） */
function untilDraw(isoLike, nowMs) {
  const t = Date.parse(String(isoLike || ''));
  if (!isFinite(t)) return '';
  const d = t - nowMs;
  if (d <= 0) return '已开奖';
  const min = Math.floor(d / 60000);
  if (min < 60) return '距开奖 ' + Math.max(1, min) + ' 分钟';
  const h = Math.floor(min / 60);
  if (h < 24) return '距开奖 ' + h + ' 小时';
  return '距开奖 ' + Math.floor(h / 24) + ' 天';
}

/* ============================================================
   【票面开奖日】faceAt —— 用户要求「发布时间和票面公布的时间都要抓取」
   ------------------------------------------------------------
   实测（2026-10-16，抽 10 张票面图放大看）：票面上确实印着两个东西
     · 期号     例「第26118期」（和标题里的期号一致）
     · 开奖日期 例「2026年10月17日开奖」
   而且【项目自带 OCR】（ocr-tickets.mjs，runtime/ocr 已装好）实测能读出来 ——
   但准确率只有 40%~60%（10 张里读到日期 4 张、期号 5 张），
   因为票面是手机拍的斜图、有反光、数字还可能是金额/流水号，容易误判。

   ⇒ 所以这里【不接 OCR】，走更准更省的路（用户给的方案 A）：
       标题里已经有期号（实测认出 45/57 条），
       而期号对应的【开奖日】是确定的（和页面倒计时同一张表 NEXTCD_TABLE
       算出来的 nextAt，北京时间的日期）。
     · 准确率：期号来自标题文本，不受图片质量影响 → 比 OCR 高得多
     · 成本：0（纯解析，不跑 tesseract、不下载图片本体）
     · 验算：大乐透 26118 → nextAt 2026-10-17 20:30（周六，大乐透开奖日 ✅）
             票面印的正是「2026年10月17日开奖」→ 完全一致
             排列3 26274 → 2026-10-15（当天开奖）✅ 也和票面一致

   ⚠️ 它【不是】出票时间：真正的"这张票什么时候买的"只有票面图上印
      （实测能看到"出票时间"字样），OCR 才拿得到 —— 准确率不够就不硬上。
      想真做的话：把 ocr-tickets.mjs 接进来 + 叠加"和标题期号交叉校验"
      （OCR 出的 5 位数必须等于标题期号才算数，实测这样能挡掉误判），
      但那是另一件事，要单独评估成本（3.6 秒/张 × 几百张）。
   ============================================================ */
function faceDate(drawIso) {
  const t = Date.parse(String(drawIso || ''));
  if (!isFinite(t)) return '';
  /* 北京时间（东八区）那段日期 —— 票面印的是北京时间 */
  const bj = new Date(t + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())}`;
}

/* ============================================================
   【排序键】晒票按发布时间倒序（用户要求「最新的在最前面」）
   ------------------------------------------------------------
   优先级（和服务端排序用的 sortTimeMs 保持一致）：
     发布时间(pubMs / whenMs) > 最近抓到(seenMs) > 首次抓到(atMs)
   全都没有 → 0，排最后（用户要求「不要排最前，避免"假新"」）。
   ⚠️ 为什么不直接 import sortTimeMs：export-static 是【独立跑】的导出器，
      不想把抓取模块拉进来（那会把整条网络依赖带进来）。
      这里的实现刻意和 build-xysp-tt.mjs 的 sortTimeMs 一行行对齐，
      改一边要改另一边。
   ⚠️ when 是 "YYYY-MM-DD HH:MM:SS"（空格、无时区）—— 要按【北京时间】解析，
      不能直接 Date.parse（不同宿主解释不同）。见 whenMsOf。
   ============================================================ */
const BJ_MS = 8 * 3600 * 1000;
/* ⚠️ 必须【区分格式】（实测踩过，别偷懒用一个解析器）：
     · "2026-10-16 22:27:45"        → 空格分隔、无时区 → 头条返回的【北京时间墙钟】
     · "2026-10-16T15:06:01.727Z"   → 带 Z → 已经是 UTC
     · "2026-10-16T08:45:00.000Z"   → 带 Z → 已经是 UTC
   如果对带 Z 的也减 8 小时，就会把一起彩的时间整体提早 8 小时，
   排序时它们会错误地排到前面（实测：ssq 第 18 位出现 1 处逆序）。
   ⇒ 有明确时区标记（Z / ±HH:MM）就交给 Date.parse；没有才按北京时间解释。 */
function whenMsOf(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 0;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {          /* 带时区标记 → 直接解析 */
    const t = Date.parse(s);
    return isFinite(t) ? t : 0;
  }
  if (/^\d{10,}$/.test(s)) return Number(s);        /* 纯数值时间戳 */
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) { const t = Date.parse(s); return isFinite(t) ? t : 0; }
  const u = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return isFinite(u) ? u - BJ_MS : 0;
}
function sortMsOf(it) {
  if (!it) return 0;
  const cand = [it.pubMs, it.whenMs,
    (it.when ? whenMsOf(it.when) : 0), (it.pubAt ? whenMsOf(it.pubAt) : 0),
    (it.seen ? whenMsOf(it.seen) : 0), (it.at ? whenMsOf(it.at) : 0)];
  for (const c of cand) if (typeof c === 'number' && isFinite(c) && c > 0) return c;
  return 0;
}

function buildXyspHtml() {
  const data = (XYSP && XYSP.games) ? XYSP.games : null;
  const updated = (XYSP && XYSP.updated) ? String(XYSP.updated) : '';
  const nowMs = Date.now();

  /* 按分类顺序把条目摊平；每张卡片带【多个】彩种 key（空格分隔），供前端筛选用。
     ⚠️ 一张卡片只画一次 —— 多归属靠属性里的多个 key 表达，
        不是靠把同一条渲染成多张卡片（那样「全部」会重复计数）。 */
  const cards = [];
  /* 和 cards[i] 一一对应的【数值排序键】（见下面的全局排序） */
  const cardSorts = [];
  /* ⚠️ 渲染用的分类 = 8 个彩种 + 头条那一路（data.games.tt）。
     为什么还要单独列出 tt：头条条目【都存在 data.games.tt 里】，
     只是靠 it.games 分发到各彩种。如果把 tt 从渲染列表里去掉，
     313 条头条内容会【整块消失】（它们不在 games.ssq/dlt… 里）。
     所以这里保留 tt 作为"渲染来源"（内部键），
     但【筛选标签里不再有 tt】—— 见 XYSP_GAMES（只有 8 个）。
     渲染时把 tt 这个 key 从卡片的 keys 里剔掉，
     于是头条条目只会出现在它命中彩种的标签下 + 「全部」。 */
  const RENDER_SOURCES = XYSP_GAMES.concat([{ key: 'tt', name: '头条晒票' }]);
  RENDER_SOURCES.forEach((g) => {
    const isTt = (g.key === 'tt');
    const items = (data && data[g.key] && Array.isArray(data[g.key].items)) ? data[g.key].items : [];
    items.forEach((it) => {
      const img = String((it && it.img) || '');
      if (!/^https:\/\//i.test(img)) return;      /* 只认 https（见上面那条说明） */
      const thumb = String((it && it.thumb) || '') || img;
      const title = String((it && it.title) || '');
      /* 头条：把识别出来的彩种名并进描述行（例：「大乐透 · 10倍与11倍…」） */
      const kind = String((it && it.game) || '');
      /* 【时间点 · 两个时间都要显示】用户要求：
           「发布时间和票面公布的时间都要抓取」+「卡片上都要显示出来」
         ① 发布时间（相对时间）：头条 → when；一起彩 → pubAt
         ② 票面开奖日：nextAt 转成北京时间的 MM-DD（见 faceDate 的说明）
            ⚠️ 不是"出票时间"（那个只有 OCR 拿得到，准确率不够，没上）
         格式（尽量短，手机上一眼看清）：
           「大乐透 · 3 小时前 · 票面开奖日 10-17 · 距开奖 1 天 · <标题>」 */
      const bits = [];
      if (isTt && kind) bits.push(kind);
      const rel = relTime(it && ((it.cat === 'tt') ? (it.when || it.seen || it.at) : (it.pubAt || it.at)), nowMs);
      if (rel) bits.push(rel);
      const fd = faceDate(it && it.nextAt);
      if (fd) bits.push('票面开奖日 ' + fd);
      const ud = untilDraw(it && it.nextAt, nowMs);
      if (ud) bits.push(ud);
      const desc = bits.length ? (bits.join(' · ') + (title ? ' · ' + title : '')) : title;
      /* 【排序】数值时间戳，写进卡片的 data-ro-xysp-sort（验收脚本 + 全屏"第 N/M 张"用） */
      const sortMs = sortMsOf(it);

      /* 【可被哪些标签选中】
         · 一起彩条目：只有它自己那一个 key（老行为，没变）
         · 头条条目：it.games 里的所有彩种 + 【永远带上聚合分类 tt】
           ⚠️ 这里踩过一个坑：早先写成"认得出彩种就【不带】 tt"，
              结果「头条晒票」这个标签下【一张都没有】——
              因为新加的"票图校验"要求头条条目必须认得出彩种
              （认不出的会被丢掉），于是所有头条条目都有彩种归属，
              tt 标签就永远空了（实测：线上 tt 标签 = 0 张）。
              用户要的是"聚合标签也能看到全部头条票"，
              所以现在【无论认不认得出彩种，都带上 tt】。
         ⚠️ 卡片总数不受影响：一条只画一张卡片，"全部"标签是按 img 去重的，
            带上 tt 只是让它【多一个标签能看到】，不会重复计数。
         ⚠️ `<b>` 徽标仍然显示第一个彩种名（不带 tt）—— 好看且和以前一致。 */
      let keys;
      if (isTt) {
        /* ⚠️ 用户要求去掉「头条晒票」标签 → 这里【不再把 tt 塞进 keys】。
           头条条目只出现在它命中彩种的标签下（多归属）+ 「全部」。
           认不出彩种的条目 keys 会是空数组 → 只在「全部」里能看到（用户接受）。 */
        keys = Array.isArray(it && it.games) ? it.games.filter((k) => GAME_NAME[k] && k !== 'tt') : [];
      } else {
        keys = [g.key];
      }
      /* <b> 显示哪个名字：头条条目 → 它第一个彩种名（在聚合里就显示「头条晒票」）；
         一起彩条目 → 自己的名字（和以前完全一样）。
         ⚠️ 直接复用现有 .ro-xysp-cap b / i 的样式，不新增任何 CSS、不动卡片外观。 */
      const badge = (isTt && keys[0] !== 'tt' && GAME_NAME[keys[0]]) ? GAME_NAME[keys[0]] : g.name;

      cards.push(
        /* href 就是原图地址：点图的脚本从 href 取原图去全屏放大。
           这里【不重复写一遍】原图地址（每条再写一次要多 130 字节，
           彩种多了页面会被白白撑大）。 */
        `<a class="ro-xysp-pic" href="${escapeAttr(img)}"` +
        ` data-ro-xysp-games="${escapeAttr(keys.join(' '))}"` +
        /* 【排序】把数值时间戳写进属性（用户要求倒序）。
           · 服务端已经排好了，这个属性是给【验收脚本】验顺序用的，
             也是全屏看图时"第 N / M 张"的依据。
           · 0 = 没有可用时间戳（排序时被放到最后），属性里保留 0 便于核查。 */
        ` data-ro-xysp-sort="${sortMs > 0 ? sortMs : 0}">` +
        `<img class="ro-xysp-thumb" src="${escapeAttr(thumb)}" alt=""` +
        ` loading="lazy" decoding="async" referrerpolicy="no-referrer">` +
        `<span class="ro-xysp-cap"><b>${escape(badge)}</b>` +
        (desc ? `<i>${escape(desc)}</i>` : '') +
        `</span></a>`
      );
      cardSorts.push(sortMs > 0 ? sortMs : 0);
    });
  });

  /* ============================================================
     【全局排序】晒票按发布时间倒序（最新在最前）—— 用户要求
     ------------------------------------------------------------
     ⚠️ 踩过的坑（很重要，别退回按分类分块渲染）：
       卡片原来是【按分类分块】push 的（先一起彩 8 个彩种、再头条、再竞彩），
       每个块【内部】已经倒序，但块与块之间不是 ——
       于是「全部」标签读下来是"块内有序、块间断层"：
         第 17 张 10-15 16:58 → 第 18 张 10-16 12:57（又变新了）。
       用户要的是「最新的在最前面」，所以这里必须【整体再排一次】。
     ⚠️ 一起排（而不是每个标签各自排）：页面上只有【一份】卡片列表，
       点标签只是显示/隐藏（见 __XYSP_VIEW__）；只要全局倒序成立，
       每个标签天然也倒序（子序列保持有序）。
     ⚠️ 稳定性：时间戳相同的卡片保持原有相对顺序（Array.sort 在现代
       V8 里是稳定的），所以同一帖子的多张票不会被搅乱。
     ============================================================ */
  const order = cards.map((_, i) => i).sort((a, b) => (cardSorts[b] - cardSorts[a]) || (a - b));
  const sortedCards = order.map((i) => cards[i]);

  /* 筛选条：全部 + 8 个彩种 + 头条晒票。全部都是 <a>（不是按钮标签）。 */
  const tabs = ['<a class="ro-xysp-tab on" href="#ro-xysp" data-ro-xysp-game="all">全部</a>']
    .concat(XYSP_GAMES.map((g) =>
      `<a class="ro-xysp-tab" href="#ro-xysp" data-ro-xysp-game="${escapeAttr(g.key)}">` +
      `${escape(g.name)}</a>`
    )).join('');

  const body = cards.length
    ? `<div class="ro-xysp-pics allow-save" data-ro-xysp-grid>${sortedCards.join('')}</div>` +
      `<div class="ro-xysp-empty" hidden>该分类 72 小时内暂无晒票</div>`
    : `<div class="ro-xysp-empty">暂无（每 30 分钟自动更新）</div>`;

  /* 标题那一行 = <summary>（可点、可键盘操作）。
     右侧提示是空 <span>，文字由 CSS 按 [open] 切换 —— 不用 JS。
     默认【收起】：<details> 不带 open 属性。 */
  /* 【并排两列 · 2026-10-18】用户要求：晒票 + GPT模型摇号 做成并排两列，
     和「开机号 + 热力图」那一行同一个观感。
     → 这里只多挂两个类名：容器那层的 .action-card-btn（卡片外观由它给），
       以及标题/副标题/展开提示的 .title / .sub / .action-text
       （用户给的 CSS 就是按这三个类名选中的）。
     ⚠️ 折叠机制一个字没改：还是 <details> + <summary>，
        还是 CSS 伪元素按 [open] 在「展开 ▸ / 收起 ▾」之间换字。 */
  return `<details class="ro-xysp action-card-btn" id="ro-xysp">` +
    `<summary class="ro-xysp-head">` +
    `<h2 class="ro-xysp-h2 title">晒票</h2>` +
    `<div class="ro-xysp-sub sub">各种实票图片</div>` +
    `<span class="ro-xysp-arrow action-text" aria-hidden="true"></span>` +
    `</summary>` +
    (cards.length ? `<div class="ro-xysp-filter">${tabs}</div>` : '') +
    body +
    (updated
      ? `<div class="ro-xysp-note">每 30 分钟自动更新 · 只保留 72 小时</div>`  /* __NO_UPDATED__ 用户要求删掉「更新于」 */
      : '') +
    `</details>`;
}

const xyspHtml = buildXyspHtml();
console.log(`  · 晒票栏：${XYSP_GAMES.map((g) => {
  const gd = XYSP && XYSP.games ? XYSP.games[g.key] : null;
  return g.name + ' ' + ((gd && gd.items) ? gd.items.length : 0) + ' 张';
}).join(' / ')}${XYSP ? '' : '  ⚠️ 没有 xysp-data.js（显示「暂无」）'}`);
console.log(`  · 晒票栏筛选标签：` +
  ['全部'].concat(XYSP_GAMES.map((g) => g.name)).join(' / '));

/* ============================================================
   【ai选号】可折叠小面板（位置：晒票栏下面、最新开奖上面）
   ------------------------------------------------------------
   用户原话：「晒票栏下面装一个机选的 可以操作随机机选各种彩票
             复式单式都可以机选 模拟选号 有个折叠小窗口 写上标题：ai选号
             实际上是系统自动摇号 这里他们可以操作」
   形态：原生 <details>，【默认收起】，标题行就是 <summary>（不是按钮标签）。
   成本：纯前端 Math.random()，不联网、不调 AI、0 成本。
   ⚠️ 只有 <a role="button"> 和 <input type="number">，没有 <button> 标签
      （页面不变量「裸 button 数 = 0」）。
   ⚠️ 这一块【不含任何图片】→ 图位数量（data-image）不变。
   ⚠️ 面板里的规则表【不是手抄的】：下面的 AIPICK_RULES 直接从 games.js 的
      GAMES 里取真实区间 / 位数 / 选号个数，再注入页面脚本 →
      以后改 games.js，面板自动跟着变，不会两边对不上。
   ============================================================ */
const AIPICK_ORDER = ['ssq', 'dlt', 'fc3d', 'kl8', 'pl3', 'pl5', 'qxc', 'qlc'];

const AIPICK_RULES = AIPICK_ORDER.filter((k) => G && G[k]).map((k) => {
  const g = G[k];
  return {
    id: k,
    name: g.name,
    price: g.price || 2,
    type: g.type || 'areas',                 /* 'digit' / 'qxc' / 'areas' */
    digits: g.digits || 0,
    playModes: !!g.playModes,                /* 快乐8：先选玩法（选几） */
    areas: (g.areas || []).map((a) => ({
      key: a.key, label: a.label,
      from: a.from, to: a.to,
      pick: a.pick || 0,
      digits: a.digits || 0,
      color: a.color || 'red'
    }))
  };
});
const AIPICK_JS_RULES = JSON.stringify(AIPICK_RULES);

/* ============================================================
   【智能分析工具栏 · 8 个入口】号码区间 / 位数（构建期算一次，注入页面）
   ------------------------------------------------------------
   为什么要在这里算：子页面里的「和值 / 跨度 / 大小 / 遗漏」都要知道
   每个号码区的【最小值 / 最大值 / 每期出几个】，这些全部来自 games.js
   的真配置（GAMES → G），不是手抄的常量 —— 以后改 games.js，
   统计口径自动跟着变，不会两边对不上。
   ⚠️ 这里只放【配置】（区间 / 位数），不放任何开奖结果；
      号码一律由页面脚本从 DRAW_HISTORY 现算，绝不预先写死结果。
   ============================================================ */
const TOOL_ORDER = ['ssq', 'dlt', 'qlc', 'qxc', 'kl8', 'fc3d', 'pl3', 'pl5'];
const TOOL_GAMES = TOOL_ORDER.filter((k) => G && G[k]).map((k) => {
  const g = G[k];
  let areas = (g.areas || []).map((a) => ({
    key: String(a.key || ''), label: String(a.label || ''),
    from: Number(a.from || 0), to: Number(a.to || 0), pick: Number(a.pick || 0)
  }));
  /* 数字彩（福彩3D / 排列3 / 排列5）：games.js 里没有 areas，只有位数 →
     当成一个 0~9 的号码区，每期出 digits 个（开奖允许重复）。 */
  if (!areas.length && g.type === 'digit') {
    areas = [{ key: 'main', label: '各位', from: 0, to: 9, pick: Number(g.digits || 3) }];
  }
  /* 七星彩：前六位 / 最后一位 是【位】，不是「从 N 个号里选 M 个」→
     pick 留 0，页面按实际开出的位数算（见各子页面的 picksOf()）。 */
  return { id: k, name: String(g.name || k), type: String(g.type || 'areas'), areas };
});
const TOOL_GAMES_JS = JSON.stringify(TOOL_GAMES);

console.log(`  · ai选号：${AIPICK_RULES.map((g) => g.name).join(' / ')}`);

function buildAiPickHtml() {
  const tabs = AIPICK_RULES.map((g, i) =>
    `<a class="ro-aipick-tab${i === 0 ? ' on' : ''}" role="button" tabindex="0"` +
    ` data-ro-aipick-game="${escapeAttr(g.id)}">${escape(g.name)}</a>`
  ).join('');

  /* 【并排两列 · 2026-10-18】同上：只多挂 .action-card-btn / .title / .sub /
     .action-text 四个类名，折叠与摇号逻辑一个字没改
     （它仍然放在 #article 外面 —— 防截图锁定的时候，这一块要能点、能摇号）。 */
  return `<details class="ro-aipick action-card-btn" id="ro-aipick">` +
    `<summary class="ro-aipick-head">` +
    `<h2 class="ro-aipick-h2 title">GPT模型摇号</h2>` +
    `<div class="ro-aipick-sub sub">系统随机生成 · 仅供娱乐参考</div>` +
    `<span class="ro-aipick-arrow action-text" aria-hidden="true"></span>` +
    `</summary>` +
    `<div class="ro-aipick-body allow-save">` +
    `<div class="ro-aipick-line"><span class="ro-aipick-lbl">彩种</span>` +
    `<div class="ro-aipick-tabs">${tabs}</div></div>` +
    /* 【选号 chip：随机 / 自选】用户 2026-10-17：
       ①「改成随机」→ 号码默认随机摇（点「开始摇号 / 重摇」）；
       ②「加一个：自选 这样他们可以自己选自己看好的」→ 旁边加一个「自选」：
          切到自选后不摇随机号，直接用下面格子里你点的号（点完自动算注数/金额）。
       两个 chip 都可点（<span role="button">，页面不变量：绝不用 button 标签）。 */
    `<div class="ro-aipick-line ro-aipick-line-src"><span class="ro-aipick-lbl">选号</span>` +
    `<div class="ro-aipick-tabs ro-aipick-seg">` +
    `<span class="ro-aipick-srcbtn on" role="button" tabindex="0" data-ro-aipick-src="random">随机</span>` +
    `<span class="ro-aipick-srcbtn" role="button" tabindex="0" data-ro-aipick-src="manual">自选</span>` +
    `</div></div>` +
    /* 【自己选号：点格子选号】用户 2026-10-17：
       「还要加一个：选号 就是自己点击去选号码」
       → 把以前那套号码格子搬回来（CSS 一直在，只有标记和 JS 被摘掉了）：
         每个号码区（数字彩=每一位）一段，点一下选中、再点一下取消；
         点出来的号直接进结果区（st.rows 一条），所以「保存图片」照用同一套。
       ⚠️ 格子是 <a role="button">，不能用 button 标签（页面不变量）。 */
    `<div class="ro-aipick-self">` +
    `<div class="ro-aipick-picker"></div>` +
    `<div class="ro-aipick-line ro-aipick-selfacts">` +
    `<a class="ro-aipick-btn ghost" role="button" tabindex="0" data-ro-aipick-act="reset">清空重选</a>` +
    `<span class="ro-aipick-selfnote">点号码就能自己选；自己选的号只放在内存里，刷新页面就没了</span>` +
    `</div></div>` +
    `<div class="ro-aipick-line ro-aipick-line-kl8" hidden>` +
    `<span class="ro-aipick-lbl">玩法</span><div class="ro-aipick-kl8"></div></div>` +
    `<div class="ro-aipick-rule"></div>` +
    /* 【用户原话】「复式 改成输入要选几个号 比如红球要选几个」：
       单式 / 复式开关拿掉了，这一行【始终显示】——每个号码区一个输入框
       （双色球 = 红球 / 蓝球，大乐透 = 前区 / 后区…），内容由 buildMultiRow() 现算。 */
    `<div class="ro-aipick-line ro-aipick-line-multi">` +
    `<span class="ro-aipick-lbl">选几个</span><div class="ro-aipick-multi"></div></div>` +
    `<div class="ro-aipick-line ro-aipick-line-times">` +
    `<span class="ro-aipick-lbl">倍数</span>` +
    /* 【倍数输入框】同样不能用 number：number 不支持选区 → 聚焦全选失效、打字变追加。
       并且它的监听也改成只在 change/回车时 refresh（input 里夹取会打不出两位数）。 */
    `<input class="ro-aipick-in ro-aipick-in-times" type="text" inputmode="numeric"` +
    ` pattern="[0-9]*" autocomplete="off" min="1" value="1">` +
    `<span class="ro-aipick-unit">倍</span>` +
    `<span class="ro-aipick-sum"></span></div>` +
    `<div class="ro-aipick-warn" hidden></div>` +
    `<div class="ro-aipick-acts">` +
    `<a class="ro-aipick-btn on" role="button" tabindex="0" data-ro-aipick-act="roll">开始摇号</a>` +
    `<a class="ro-aipick-btn ghost" role="button" tabindex="0" data-ro-aipick-act="reroll">重摇</a>` +
    `<a class="ro-aipick-btn ghost" role="button" tabindex="0" data-ro-aipick-act="clear">清空</a>` +
    `<a class="ro-aipick-btn ghost" role="button" tabindex="0" data-ro-aipick-act="save">保存图片</a>` +
    `</div>` +
    `<div class="ro-aipick-out"></div>` +
    /* 【底部两行小字】用户原话给的就是这两句，一字不改。
       第二句是真的：这一块【完全不写任何浏览器存储】，状态只放在内存里。 */
    `<div class="ro-aipick-note">号码由系统随机生成，仅用于摇号娱乐，不代表任何预测或建议。</div>` +
    `<div class="ro-aipick-note">所有数据仅存在本地，不上传、不保存。</div>` +
    `</div>` +
    `</details>`;
}

const aiPickHtml = buildAiPickHtml();

/* ============================================================
   【开机号】工具栏入口 + 可展开区块（原「选号直播」那一格已撤掉，见 buildToolsHtml）
   ------------------------------------------------------------
   用户原话：「新增两个工具栏。一个是开机号（…/kjh）。
             一个是选号直播（…/live）。
             开机号点进去只是实时的开机号（每天2点抓取更新就好了）」
   2026-10-18 用户改口：「就是这里替换成热力图」→ 选号直播那块整块换成热力图折叠卡。
   位置：用户截图红框 =「推荐图目录」(.ro-imgtoc-wrap) 之后、「最新开奖」之前。

   交互（选的是方案 A：锚点 + :target 展开，样式见 @supports 那一段）：
     · 两个入口都是 <a>（页面不变量要求没有按钮标签），href 指向下面两个区块的 id
     · 区块平时 display:none，被 :target 命中才显示 —— 点一下当场在入口下面展开，
       并平滑滚过去（html { scroll-behavior: smooth } 本来就有）。
       好处：【不点的时候页面完全不变】，「最新开奖」不会被挤下去。
     · 为什么不选方案 B（全屏层）：全屏层要与页尾那套全屏查看逻辑抢层级，
       而且用户刚删掉的旧放大器类名就叫 lightbox ——
       锚点这套更小、更稳、零 JS、零层级风险。
   数据：kjh-data.js（build-kjh.mjs 每天 2 点抓一次，跟着 daily-update.mjs）。
   两个区块都是纯文字（没有图片）→ 图位数量（data-image）不变。
   ⚠️ 页面上【不出现来源字样】：链接域名里的字母用 HTML 实体写
      （复用文章参考那个 articleHref，href 里有域名、页面上看不到）。
   ============================================================ */
const KJH_ORDER = ['ssq', 'dlt', 'fc3d', 'kl8', 'pl3', 'pl5', 'qxc', 'qlc'];

/* 工具栏：现在只剩「开机号」一个格子
   ------------------------------------------------------------
   用户 2026-10-18：「就是这里替换成热力图」——
   原来并排的「选号直播」那块已经被【热力图折叠卡】顶掉（见下面的
   buildHeatmapHtml），它的入口卡也一并撤掉：热力图自己就是那张能点的卡，
   不需要再多一个「点一下跳过去」的入口。 */
function buildToolsHtml() {
  /* 2026-10-18 用户：「把开机号和热力图改成并排两列」——
     外面那层 .ro-tools 已撤掉，这张卡现在只是【两列容器里的左格】
     （容器见下面的 toolsHeatHtml）；卡片本体改用用户给的 .action-card 规格，
     里面三行 = 标题 / 副标题 / 「点击查看」（和右边热力图卡对齐）。
     ⚠️ 仍然是 <a>（页面不变量：没有按钮标签），点击逻辑一个字没改。 */
  return `<a class="ro-tool ro-tool-kjh action-card" href="#ro-kjh">` +
    `<span class="title">开机号</span>` +
    `<span class="sub">各彩种实时开机号</span>` +
    `<span class="sub ro-go" data-tip="1">点击查看</span></a>`;   /* __TOOL_TIP__ 展开后 JS 改成「点击收起」 */
}

/* 开机号区块：每个彩种一行（彩种名 + 期号 + 号码 + 和值等 + 开奖时间） */
function buildKjhHtml() {
  const games = (KJH && KJH.games) ? KJH.games : {};
  const updated = (KJH && KJH.updated) ? String(KJH.updated) : '';
  const keys = KJH_ORDER.filter((k) => games[k]);

  const rows = keys.map((k) => {
    const g = games[k] || {};
    const nums = Array.isArray(g.nums) ? g.nums : [];
    const blue = Array.isArray(g.blue) ? g.blue : [];
    /* 红/蓝分开渲染（和「最新开奖」一样：蓝球用蓝底） */
    const balls = nums.map((n) => `<span class="ro-kjh-ball">${escape(n)}</span>`).join('') +
      blue.map((n) => `<span class="ro-kjh-ball is-blue">${escape(n)}</span>`).join('');
    const extra = (Array.isArray(g.extra) && g.extra.length)
      ? `<div class="ro-kjh-extra">${g.extra.map((t) => escape(t)).join(' · ')}</div>`
      : '';
    return `<div class="ro-kjh-item">` +
      `<div class="ro-kjh-top">` +
      `<b class="ro-kjh-name">${escape(g.name || k)}</b>` +
      (g.issue ? `<span class="ro-kjh-issue">第${escape(g.issue)}期</span>` : '') +
      `</div>` +
      `<div class="ro-kjh-nums">` +
      (balls || `<span class="ro-kjh-none">暂无</span>`) +
      `</div>` + extra +
      (g.time ? `<div class="ro-kjh-time">开奖时间 ${escape(g.time)}</div>` : '') +
      `</div>`;
  }).join('');

  return `<section class="ro-panel ro-kjh-panel" id="ro-kjh">` +
    `<div class="ro-panel-head">` +
    `<h2 class="ro-panel-title">开机号</h2>` +
    /* 【定时文案】2026-10-18 用户要求页面上不要「每天 2:00 自动更新」这类定时说法
       → 副标题改成不带时刻的中性说明（数据仍然是原来的节奏，只是不再写在页面上）。 */
    `<div class="ro-panel-sub">各彩种最新开机号` +
    /* __NO_UPDATED__ 用户要求删掉「更新于」 */ '' + `</div>` +
    `</div>` +
    (rows ? `<div class="ro-kjh-grid">${rows}</div>` : `<div class="ro-panel-none">暂无</div>`) +
    `</section>`;
}

/* ============================================================
   【热力图要显示哪个彩种】= 下一期开奖最近的那一个
   ------------------------------------------------------------
   用户 2026-10-18 原话：
     「热力图模板移到这里面 热力图点击可以收起展开 展开就是热力图
       热力图根据下一期开大乐透还是双色球来实时更新 时时刻刻显示 去掉以前的定时」
   口径（沿用页面里已经有的那张开奖日表，不另起一套）：
     · 双色球 周二 / 周四 / 周日 21:15     → 开奖日 [0, 2, 4]
     · 大乐透 周一 / 周三 / 周六 21:25     → 开奖日 [1, 3, 6]
       （开奖日与 latest-draws.js 的 NEXTCD_TABLE 同一套；时刻按用户给的口径）
     · 「下一期」= 这两个彩种里【最近的、还没到开奖时刻】的那一场
     · 时间一律按北京时间（UTC+8）算，不看用户设备时区
   实现：下面这段源码只写一次 —— 服务端 new Function 跑一遍拿结果，
        生成出来的页面里塞的是【同一份源码】，两边算法不可能漂移。
   ============================================================ */
const HM_NEXT_SRC = `
function hmNextGame(nowMs) {
  var TZ = 8 * 3600000;
  var TABLE = {
    ssq: { days: [0, 2, 4], h: 21, m: 15 },
    dlt: { days: [1, 3, 6], h: 21, m: 25 }
  };
  var t = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : (new Date()).getTime();
  var best = '', bestAt = Infinity;
  var keys = ['ssq', 'dlt'];
  for (var i = 0; i < keys.length; i++) {
    var gid = keys[i], r = TABLE[gid];
    if (!r) continue;
    var bj = new Date(t + TZ);
    var day0 = Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()) - TZ;
    for (var d = 0; d < 8; d++) {
      var at = day0 + d * 86400000 + r.h * 3600000 + r.m * 60000;
      if (r.days.indexOf(new Date(at + TZ).getUTCDay()) < 0) continue;
      if (at <= t) continue;
      if (at < bestAt) { bestAt = at; best = gid; }
      break;
    }
  }
  return best || 'ssq';
}
`;
const hmNextGame = new Function(HM_NEXT_SRC + '\nreturn hmNextGame;')();

/** 页面上该显示哪个彩种（热力图只做双色球 / 大乐透） */
function heatmapNextGameId(nowMs) {
  try {
    return (hmNextGame(nowMs) === 'dlt') ? 'dlt' : 'ssq';
  } catch (e) { return 'ssq'; }
}
/** 彩种中文名（取不到就用兜底名） */
function hmGameName(gid) {
  if (G && G[gid] && G[gid].name) return G[gid].name;
  return gid === 'dlt' ? '大乐透' : '双色球';
}
/** 这个彩种下一期的期号（热力图数据里有就用它，没有就现算） */
function hmIssueText(gid) {
  try {
    const H = (HEATMAP && HEATMAP.games) ? HEATMAP.games[gid] : null;
    if (H && H.issue) return String(H.issue);
  } catch (e) { /* 忽略 */ }
  try { return String(nextIssue(gid) || ''); } catch (e2) { return ''; }
}

/* 热力图折叠卡（用户 2026-10-18：
     「就是这里替换成热力图」「热力图点击可以收起展开 展开就是热力图」
     「热力图根据下一期开大乐透还是双色球来实时更新 时时刻刻显示 去掉以前的定时」）
   ------------------------------------------------------------
   这一块就是【原来「选号直播」那一块的位置】，现在整块换成热力图：
     · 位置：推荐图目录 / 开机号下面 —— 和原来一样，只是内容换了
     · 折叠：<details> + <summary>，和「走势图」同一套机制
             （默认收起；点标题就地展开，再点收起；不用裸 button、不跳页、不弹窗）
     · 显示哪个彩种：heatmapNextGameId() 按【当前时间】算「下一期最近的那个」——
             服务端先算一次填进 HTML，页面脚本在打开/切回来时再算一次
     · 热力图本身【一个字都没重写】：还是 renderImageHtml(g, 'heatmap')，
             只是从「独立区块」搬进这张折叠卡里
     · 页面上不写任何「每小时 / 每天几点」的说法，也不做轮询定时 */
function buildHeatmapHtml() {
  const tms = (HEATMAP && HEATMAP.games) ? HEATMAP.games : {};
  const nowId = heatmapNextGameId();
  const ids = ['ssq', 'dlt'].filter((g) => {
    const H = tms[g];
    return !!(H && H.front && Array.isArray(H.front.items) && H.front.items.length);
  });
  const hasCur = ids.indexOf(nowId) >= 0;

  const blocks = ids.map((g) => {
    const H = tms[g] || {};
    const name = hmGameName(g);
    let inner = '';
    try { inner = renderImageHtml(g, 'heatmap') || ''; } catch (e) { inner = ''; }
    const stamp = String(H.updated || H.drawDate || '');
    /* 【如实标口径】用户要的是「晒票占比」，但 OCR 样本不够时 build-heatmap 会回退成
       「近 30 期开奖频率」—— 绝不能拿兜底冒充晒票统计，这里按 source 明写。 */
    const SRC_LABEL = {
      'ocr-xysp': '晒票票面 OCR 统计',
      'xysp-text': '晒票文字统计',
      'history-fallback': '近期开奖频率（晒票样本不足·兜底口径）'
    };
    const srcText = SRC_LABEL[String(H.source || '')] || '近期开奖频率（兜底口径）';
    /* 两个彩种的图都预渲染在 DOM 里，只按「当前该看哪个」显隐 —— 展开即见，不用等 */
    return `<div class="ro-hm-block" data-ro-hm-game="${g}"${g === nowId ? '' : ' hidden'}>` +
      `<div class="ro-hm-head"><b>${escape(name)} 实票统计</b>` +
      `<span>${escape(srcText)}${stamp ? ' · ' + escape(stamp) : ''}</span></div>` +
      `<div class="ro-imagewrap" data-game="${g}" data-image="heatmap">${inner}</div>` +
      `</div>`;
  }).join('');

  const curIssue = hmIssueText(nowId);
  const subText = '当前：' + hmGameName(nowId) + (curIssue ? ' 第 ' + curIssue + ' 期' : '');

  /* 【并排两列 · 2026-10-18】这张卡现在是两列容器（.grid-2-col）里的【右格】：
     + 加一个中性类名 .ro-hm-card —— 两列布局的 CSS 全靠它命中这张卡
       （保护标记按次数数「ro-heat」出现，多写一个就多一处，所以布局不碰它）；
     + 标题 / 副标题补上 .title / .sub，和左边「开机号」卡同一套字号；
     + <details> / <summary> / 折叠 / 「点击查看 · 点击收起」一个字都没改。 */
  return `<details class="ro-heat ro-hm-card" id="ro-heatmap">` +
    `<summary class="ro-heat-head">` +
    `<span class="ro-heat-title title">热力图</span>` +
    `<span class="ro-heat-sub sub" data-ro-hm-sub="1">${escape(subText)}</span>` +
    `<span class="ro-heat-arrow" aria-hidden="true"></span>` +
    `</summary>` +
    `<div class="ro-heat-body">` +
    `<div class="ro-hm-none" data-ro-hm-none="1"${hasCur ? ' hidden' : ''}>本期热力图正在整理，稍后再看</div>` +
    blocks +
    `</div>` +
    `</details>`;
}

const toolsHtml = buildToolsHtml();
const kjhHtml = buildKjhHtml();
const heatHtml = buildHeatmapHtml();

/* ============================================================
   【并排两列 · 2026-10-18】开机号（左）+ 热力图（右）同一个容器
   ------------------------------------------------------------
   用户原话：「把开机号和热力图改成并排两列」
     → 收起时各占 50%（一行两个卡片）；点开热力图后它占满整行（图片要宽）。
   两格都是【原来那两张卡，内容一个字没改】：
     · 左 = <a class="ro-tool ... action-card" href="#ro-kjh">（还是锚点，不是 button）
     · 右 = <details class="ro-heat ro-hm-card">（还是原生折叠）
   布局样式见样式表最后那段 __LAYOUT__ ⑧（.grid-2-col / .action-card）。
   ============================================================ */
const toolsHeatHtml = `<div class="grid-2-col" id="ro-tools-heat">` + toolsHtml + heatHtml + `</div>`;
console.log(`  · 开机号：${(KJH && KJH.games) ? Object.keys(KJH.games).length : 0} 个彩种` +
  (((KJH && KJH.games) && Object.keys(KJH.games).length) ? '' : '（数据缺失 → 页面显示「暂无」）'));
/* 【选号直播】那块已被【热力图折叠卡】整块顶掉（用户 2026-10-18），
   所以这里不再打印直播回放条数；改成打印「热力图这一页会显示哪个彩种」。 */
{
  const hmNow = heatmapNextGameId();
  console.log(`  · 热力图：显示 ${hmGameName(hmNow)}` +
    (hmIssueText(hmNow) ? ` 第 ${hmIssueText(hmNow)} 期` : '') +
    `（按当前时间算出来的「下一期最近的彩种」；折叠卡默认收起）`);
}

/* ============================================================
   【已移除】竞彩（体彩在售比赛）段落
   ------------------------------------------------------------
   分享页（彩票推荐页）不再显示足球 / 竞彩内容 ——
   足球只放在独立的「足球竞彩」页：
     分享包/football.html  ← 由 export-football.mjs 生成
   顶部导航的「足球竞彩」tab 直接跳到 football.html。

   原来这里有一个 buildJcSection()，会读 jc-data.js 与 football.js，
   拼出「竞彩 · 推胜负平」卡片组；现在整段删除，
   分享页生成时也不再需要这两个数据文件。
   ============================================================ */

/* ============================================================
   组装完整 HTML
   ============================================================ */

/* ---------- 生成状态条 HTML（此时 T/G 已加载） ---------- */
/* 【日期显示】把 2026-10-15 变成 2026年10月15日 */
function ymdCN(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : '';
}
/* 某个彩种的下一期开奖日期（中文） */
function dateCN(id) {
  try { return ymdCN(nextDate(id)); } catch (e) { return ''; }
}
/* 所有彩种里【最早】的那个下期开奖日 —— 标题上显示它 */
const nextDayText = (() => {
  const list = Object.keys(T).map(dateCNRaw).filter(Boolean).sort();
  return list.length ? ymdCN(list[0]) : '';
})();
function dateCNRaw(id) {
  try { return String(nextDate(id) || '').slice(0, 10); } catch (e) { return ''; }
}

/* ============================================================
   __MQ_TICKER__ 顶部状态卡右侧：中奖播报（横向滚动通告条）
   ------------------------------------------------------------
   用户要求：在「已更新 / 所有资料均在下方 / 下一期更新倒计时」那张卡片的
   右边空位上做一条横向滚动的小喇叭通告，播报最近的开奖中奖情况。

   播报规则（用户 2026-10-18 定稿，逐条落地）：
     ①【所有彩种】都播 —— 双色球 / 大乐透 / 七星彩 / 七乐彩 / 快乐8 /
        福彩3D / 排列3 / 排列5，中了就播（不再"只有数字彩"）。
     ② 大盘彩（双色球 / 大乐透 / 七星彩 / 七乐彩 / 快乐8）：
          只播【一等奖】和【二等奖】两个档，按官方奖级规则判。
          文案必须写明【几等奖】+【主号中几个 / 副号中几个】：
            · 双色球 第 2026119 期 · 推荐号命中二等奖（红球 6 个 + 蓝球 0 个）
            · 大乐透 第 26119 期 · 推荐号命中一等奖（前区 5 个 + 后区 2 个）
          其它奖级（三～九等奖）与没中一律不播。
     ③ 数字彩（福彩3D / 排列3 / 排列5）—— 每期开奖后，中了才播，播中奖类型：
          · 直选（三位全中且顺序对）
          · 组选（组三 = 三位有两个相同 / 组六 = 三位互不相同）
          · 排列5 五位全中播「直选命中」；只中前三位则播「前三位直选命中」
        没中 → 不播（不占位置）
     ④ 喇叭里【只有中奖播报】—— 用户 2026-10-18：不要「近 N 期推荐 · 中奖 M 期」
        这种统计数字，一条都不要。
     ⑤ 窗口：每个彩种最多比【最近 30 期】（存档里存了多少就比多少）；
        滚动条最多留【最近 10 条】，同一彩种最多 3 条 —— 免得一个彩种把位置占满。
     ⑥ 全部是算出来的：没有任何一条写死的中奖记录；算不出来（缺推荐 / 缺开奖 /
        期号对不上）就是 0 条，宁可显示「暂无中奖播报」。每天跟着生成任务刷新。

   比对口径（每期只用一份推荐号；期号必须对得上）：
     · fc3d / pl3 ：直选池 = 百/十/个 三个定位栏；组选池 = 组选 6 码
     · pl5        ：万/千/百/十/个 五个定位栏
     · ssq        ：红球二十码池 + 蓝球候选栏；dlt：前区二十码池 + 后区候选栏
     · qlc        ：基本号二十二码池；kl8：选十那 10 码
     · qxc        ：六位定位栏 + 后区栏

   官方奖级（大盘彩只认前两档，和 hit-check.js 的奖级表同口径）：
     · ssq ：一等奖 = 红 6 + 蓝 1；二等奖 = 红 6 + 蓝 0
     · dlt ：一等奖 = 前 5 + 后 2；二等奖 = 前 5 + 后 1
     · qlc ：一等奖 = 基本号 7 个；二等奖 = 基本号 6 个 + 特别号中
     · qxc ：一等奖 = 前六位全中 + 后区中；二等奖 = 前六位全中、后区未中
     · kl8 ：一等奖 = 选十中十；二等奖 = 选十中九

   ⚠️ 没有这一期的推荐 / 没有这一期的开奖 / 期号对不上 → 直接跳过，
      不猜、不补、不挪用相邻期。全都对不上就出一句「暂无中奖播报」。
   ============================================================ */

/* 从共享上下文里取一份全局表（没有就返回 null，绝不让构建挂掉） */
function mqReadGlobal(name) {
  try {
    return vm.runInContext('(typeof ' + name + ' !== "undefined") ? ' + name + ' : null', ctx);
  } catch (e) { return null; }
}

/* "05 06 08" / "5,6,8" / "050608" 之外的写法统一成数字数组（只支持带分隔符与纯两位） */
function mqNums(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return [];
  if (/\s/.test(s)) return s.split(/\s+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  if (/[,，、/]/.test(s)) return s.split(/[,，、/]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  if (/^\d+$/.test(s)) {
    if (s.length <= 2) return [parseInt(s, 10)];
    if (s.length % 2 === 0) {
      const out = [];
      for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 10));
      return out.filter((n) => Number.isFinite(n));
    }
  }
  return [];
}

/* 开奖索引：彩种|期号 → 那期开奖（历史表 + 最新一期，同号以后者为准） */
function mqDrawIndex() {
  const map = {};
  const hist = mqReadGlobal('DRAW_HISTORY');
  const live = mqReadGlobal('DRAW_DATA');
  const add = (gid, it) => {
    if (it && it.areas && it.issue !== undefined && it.issue !== null && String(it.issue)) {
      map[gid + '|' + String(it.issue)] = it;
    }
  };
  const hg = (hist && hist.games) || {};
  Object.keys(hg).forEach((gid) => { (hg[gid] || []).forEach((it) => add(gid, it)); });
  const lg = (live && live.games) || {};
  Object.keys(lg).forEach((gid) => add(gid, lg[gid]));
  return map;
}

const MQ_NAME = {
  ssq: '双色球', dlt: '大乐透', fc3d: '福彩3D', pl3: '排列3',
  pl5: '排列5', qlc: '七乐彩', kl8: '快乐8', qxc: '七星彩'
};
const MQ_ORDER = ['ssq', 'dlt', 'fc3d', 'pl3', 'pl5', 'qlc', 'kl8', 'qxc'];

/* 某个彩种存档里的各期推荐（按期号去重：同一期推了多份时留推送最晚的那份） */
function mqPeriods(gid, saved) {
  const bag = (saved && saved.tickets && saved.tickets[gid]) || null;
  if (!bag) return [];
  const byIssue = new Map();
  Object.keys(bag).forEach((k) => {
    if (k === 'history' || k === 'current') return;
    const p = bag[k];
    if (!p || !p.images || !p.images.main || !p.issue) return;
    const key = String(p.issue);
    const prev = byIssue.get(key);
    const stamp = String(p.pushedAt || p.date || '');
    if (!prev || stamp > String(prev.pushedAt || prev.date || '')) byIssue.set(key, p);
  });
  return Array.from(byIssue.values());
}

/**
 * 单期判定：中了返回 { claim, hot }，没中 / 算不出来返回 null
 *   claim = 播报里的那句话（不含彩种与期号）
 *   hot   = 2 表示最高档（一等奖 / 直选），1 表示其它可播档
 */
function mqJudge(gid, v, d) {
  if (!v || !d || !d.areas) return null;
  const area = (k) => (d.areas[k] || []).map(Number);
  const inPool = (pool, n) => pool.indexOf(Number(n)) >= 0;
  const hits = (src, pool) => src.filter((n) => inPool(pool, n)).length;

  /* ---------- 福彩3D / 排列3 ---------- */
  if (gid === 'fc3d' || gid === 'pl3') {
    const w = area('main');
    if (w.length < 3) return null;
    const bai = mqNums(v.bai), shi = mqNums(v.shi), ge = mqNums(v.ge), grp = mqNums(v.grp);
    if (!bai.length || !shi.length || !ge.length || !grp.length) return null;
    /* 直选：开奖三位分别落在 百/十/个 的定位池里（顺序对） */
    if (inPool(bai, w[0]) && inPool(shi, w[1]) && inPool(ge, w[2])) {
      return { claim: '推荐号直选命中！', hot: 2 };
    }
    /* 组选：开奖三位都在 6 码里（不分顺序）；组三 = 两位相同，组六 = 三位互不相同 */
    if (w.slice(0, 3).every((n) => inPool(grp, n))) {
      const uniq = new Set(w.slice(0, 3)).size;
      if (uniq === 2) return { claim: '推荐号组选命中（组三）', hot: 1 };
      if (uniq === 1) return { claim: '推荐号组选命中（豹子）', hot: 1 };
      return { claim: '推荐号组选命中（组六）', hot: 1 };
    }
    return null;
  }

  /* ---------- 排列5 ---------- */
  if (gid === 'pl5') {
    const w = area('main');
    if (w.length < 5) return null;
    const pools = ['wan', 'qian', 'bai', 'shi', 'ge'].map((k) => mqNums(v[k]));
    if (pools.some((p) => !p.length)) return null;
    const ok = pools.map((p, i) => inPool(p, w[i]));
    if (ok.every(Boolean)) return { claim: '推荐号直选命中！', hot: 2 };
    if (ok[0] && ok[1] && ok[2]) return { claim: '推荐号前三位直选命中', hot: 1 };
    return null;
  }

  /* 大盘彩文案：「推荐号命中X等奖（主号 N 个 + 副号 N 个）」——
     用户 2026-10-18：几等奖要写清楚，中了几个号也要写清楚。 */
  const bigClaim = (lvl, a, an, b, bn) =>
    '推荐号命中' + lvl + '（' + an + ' ' + a + ' 个 + ' + bn + ' ' + b + ' 个）';

  /* ---------- 双色球：6+1，只播一等奖（红6+蓝1）/ 二等奖（红6+蓝0） ---------- */
  if (gid === 'ssq') {
    const red = area('red'), blue = area('blue');
    const pool = mqNums(v.r20), bp = mqNums(v.b_rec);
    if (red.length < 6 || !blue.length || !pool.length || !bp.length) return null;
    const r = hits(red, pool), b = hits(blue, bp) > 0 ? 1 : 0;
    if (r === 6 && b === 1) return { claim: bigClaim('一等奖', r, '红球', b, '蓝球'), hot: 2 };
    if (r === 6 && b === 0) return { claim: bigClaim('二等奖', r, '红球', b, '蓝球'), hot: 1 };
    return null;
  }

  /* ---------- 大乐透：5+2，只播一等奖（前5+后2）/ 二等奖（前5+后1） ---------- */
  if (gid === 'dlt') {
    const front = area('front'), back = area('back');
    const pool = mqNums(v.f20), bp = mqNums(v.b_rec);
    if (front.length < 5 || !back.length || !pool.length || !bp.length) return null;
    const r = hits(front, pool), b = hits(back, bp);
    if (r === 5 && b === 2) return { claim: bigClaim('一等奖', r, '前区', b, '后区'), hot: 2 };
    if (r === 5 && b === 1) return { claim: bigClaim('二等奖', r, '前区', b, '后区'), hot: 1 };
    return null;
  }

  /* ---------- 七乐彩：7 个基本号 + 特别号，只播一等奖（7 个）/ 二等奖（6 + 特别号） ---------- */
  if (gid === 'qlc') {
    const main = area('main'), sp = area('special');
    const pool = mqNums(v.r22);
    if (main.length < 7 || !pool.length) return null;
    const m = hits(main, pool);
    const s = (sp.length && inPool(pool, sp[0])) ? 1 : 0;
    if (m === 7) return { claim: bigClaim('一等奖', m, '基本号', s, '特别号'), hot: 2 };
    if (m === 6 && s === 1) return { claim: bigClaim('二等奖', m, '基本号', s, '特别号'), hot: 1 };
    return null;
  }

  /* ---------- 七星彩：6 位 + 后区，只播一等奖（6 位 + 后区）/ 二等奖（6 位、后区未中） ---------- */
  if (gid === 'qxc') {
    const front = area('front'), back = area('back');
    if (front.length < 6 || !back.length) return null;
    const pools = [1, 2, 3, 4, 5, 6].map((i) => mqNums(v['p' + i]));
    const bp = mqNums(v.pb);
    if (pools.some((p) => !p.length) || !bp.length) return null;
    const ok = pools.map((p, i) => inPool(p, front[i]));
    const m = ok.filter(Boolean).length;
    const b = inPool(bp, back[0]) ? 1 : 0;
    if (m === 6 && b === 1) return { claim: bigClaim('一等奖', m, '前六位', b, '后区'), hot: 2 };
    if (m === 6 && b === 0) return { claim: bigClaim('二等奖', m, '前六位', b, '后区'), hot: 1 };
    return null;
  }

  /* ---------- 快乐8：选十，播选十中十（一等奖）/ 选十中九（二等奖） ---------- */
  if (gid === 'kl8') {
    const main = area('main');
    const pool = mqNums(v.r10);
    if (main.length < 20 || pool.length !== 10) return null;
    const m = hits(pool, main);
    if (m === 10) return { claim: '推荐号命中一等奖（选十 · 中 ' + m + ' 个）', hot: 2 };
    if (m === 9) return { claim: '推荐号命中二等奖（选十 · 中 ' + m + ' 个）', hot: 1 };
    return null;
  }

  return null;
}

/* 估算一段文字在 12px 下的宽度（用来定滚动速度；中文按 12.4px、数字字母按 6.8px） */
function mqEstWidth(s) {
  const t = String(s).replace(/<[^>]*>/g, '');
  let w = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    w += (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef) ? 12.4 : 6.8;
  }
  return w;
}

/* 播报窗口（用户 2026-10-18：「是不是通告一周的」→ 想看更长的）
   · 每个彩种最多比最近 MQ_MAX_PERIODS 期（存档里存了多少就比多少，不会硬凑）
   · 滚动条最多留最近 MQ_MAX_ITEMS 条，同一彩种最多 MQ_MAX_PER_GAME 条
     —— 不加单彩种上限的话，数字彩一多就把位置占满，大盘彩永远滚不出来 */
const MQ_MAX_PERIODS = 30;
const MQ_MAX_ITEMS = 10;
const MQ_MAX_PER_GAME = 3;

/* 生成通告条：{ html, count, compared } */
function buildHitMarquee() {
  const saved = mqReadGlobal('SAVED_TICKETS');
  const idx = mqDrawIndex();

  const wins = [];
  let compared = 0;

  MQ_ORDER.forEach((gid) => {
    /* 新的在前 → 只比最近 MQ_MAX_PERIODS 期（存档里就几期时等于全比） */
    const list = mqPeriods(gid, saved)
      .sort((a, b) => Number(b.issue) - Number(a.issue))
      .slice(0, MQ_MAX_PERIODS);
    list.forEach((p) => {
      const d = idx[gid + '|' + String(p.issue)];
      if (!d) return;                                   /* 还没开奖 → 不参与比对 */
      const judged = mqJudge(gid, p.images.main, d);
      compared++;
      if (!judged) return;                              /* 没中 → 不占位置 */
      wins.push({
        gid, issue: String(p.issue),
        date: String(d.date || p.date || ''),
        claim: judged.claim, hot: judged.hot
      });
    });
  });

  /* 新的在前；同一天按期号大的在前 */
  wins.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return Number(b.issue) - Number(a.issue);
  });

  const head = '<span class="ro-mq-ico" aria-hidden="true">\u{1F4E2}</span>';

  /* 用户 2026-10-18：喇叭里【只有中奖播报】—— 把「近 N 期推荐 · 中奖 M 期」
     那条统计整条删掉，一条数字都不留。条数上限改由上面 3 个常量控制。 */
  const perGame = {};
  const recent = [];
  for (const w of wins) {
    if (recent.length >= MQ_MAX_ITEMS) break;
    const n = perGame[w.gid] || 0;
    if (n >= MQ_MAX_PER_GAME) continue;
    perGame[w.gid] = n + 1;
    recent.push(w);
  }

  /* 一期都没中时也不能空着 —— 只如实写一句，不带任何统计数字。
     ⚠️ 这句要能在 320px 的框里一行放下，多了会被省略号切掉。 */
  if (!recent.length) {
    return {
      count: 0, compared,
      html: '<div class="ro-mq ro-mq-static" aria-label="开奖中奖播报">' + head +
        '<div class="ro-mq-view"><span class="ro-mq-none">暂无中奖播报</span></div></div>'
    };
  }

  const one = (w) =>
    '<span class="ro-mq-item' + (w.hot >= 2 ? ' mq-top' : '') + '">' +
    '<b>' + (MQ_NAME[w.gid] || w.gid) + '</b> 第 ' + w.issue + ' 期 · <i>' + w.claim + '</i></span>';

  const itemsHtml = recent.map(one).join('');

  /* 一组 = 同样的条目排两遍（保证比可视宽度长），轨道放两组 → translateX(-50%) 无缝循环 */
  const groupHtml = '<div class="ro-mq-group">' + itemsHtml + itemsHtml + '</div>';
  const group2 = '<div class="ro-mq-group" aria-hidden="true">' + itemsHtml + itemsHtml + '</div>';
  const dur = Math.max(18, Math.min(72, Math.round((mqEstWidth(itemsHtml) * 2) / 46)));

  return {
    count: recent.length, compared,
    html: '<div class="ro-mq" aria-label="开奖中奖播报">' + head +
      '<div class="ro-mq-view"><div class="ro-mq-track" style="animation-duration:' + dur + 's">' +
      groupHtml + group2 +
      '</div></div></div>'
  };
}

const mqTicker = buildHitMarquee();
console.log('  · 中奖播报：比对 ' + mqTicker.compared + ' 期，滚 ' + mqTicker.count + ' 条中奖' +
  (mqTicker.count ? '' : '（只出「暂无中奖播报」那句）'));

if (status.allReady) {
  /* __NO_ST_LIST__ 用户要求：状态条里那 8 行「双色球 第 xx 期 日期」不要了。
     连带把只为它服务的 rows 计算也删掉（省得白算一遍）。 */

  statusHtml =
    `<div class="ro-status ok ro-st-row">` +
    `<div class="ro-st-txt">` +
    `<div class="ro-st-head"><span class="ro-st-dot"></span>已更新</div>` +   /* 用户要求：更新后只写「已更新」，不写时间 */
    `<div class="ro-st-time">所有资料均在下方</div>` +
    `<div class="ro-st-time"><span id="__NEXT_CD2__">下一期更新倒计时 --:--:--</span></div>` +
    /* __NO_ST_LIST__ 期号列表已按用户要求移除 */
    `</div>` +
    /* __MQ_TICKER__ 卡片右侧的中奖播报（横向滚动 + 小喇叭） */
    mqTicker.html +
    `</div>`;
} else {
  const reason = status.missing.length
    ? `还缺这些彩种：${status.missing.join('、')}`
    : `数据已 ${status.hoursOld !== null ? Math.round(status.hoursOld) + ' 小时' : '很久'}未更新`;

  statusHtml =
    `<div class="ro-status warn ro-st-row">` +
    `<div class="ro-st-txt">` +
    `<div class="ro-st-head"><span class="ro-st-dot"></span>下一期推荐暂未更新</div>` +
    `<div class="ro-st-time">所有资料均在下方</div>` +
    `<div class="ro-st-time"><span id="__NEXT_CD__">2:15 更新</span></div>` +   /* 用户要求：未更新时只写「2:15 更新」，不写具体时间 */
    `<div class="ro-st-reason">${reason}</div>` +
    `<div class="ro-st-hint">请稍后再看，或联系发布者更新</div>` +
    `</div>` +
    /* __MQ_TICKER__ 卡片右侧的中奖播报（横向滚动 + 小喇叭） */
    mqTicker.html +
    `</div>`;
}

/* ---------- 生成最新开奖（顶部）与中奖栏（底部） ---------- */
const buildLatestHtml = ctx.buildLatestDrawHtml;
const buildWinHtml = ctx.buildWinSectionHtml;
const highlightImage = ctx.hcHighlightImage;

let latestSecHtml = '';
let hitSecHtml = '';
let hitSecCss = '';
let winCount = 0;

console.log(`  · buildLatestDrawHtml = ${typeof buildLatestHtml}`);
console.log(`  · buildWinSectionHtml = ${typeof buildWinHtml}`);

/* ---- 顶部：最新开奖 / 热力图 ----
   【一个入口，两种形态】走 latest-draws.js 的 latestBlockHtml()：
     · 窗口内（开奖日 18:00→20:00 双色球 / 18:00→21:00 大乐透）
       → 热力图占位（同一个 id="ro-latest"，客户端照样找得到）
     · 其余时刻 → 「最新开奖」
   热力图内部那份 HTML 就是这张模板图的预渲染结果（和 App 同一套渲染调用），
   页尾的实时渲染脚本会用同一个图位定义把它重画一遍。 */
if (typeof latestBlockHtmlFn === 'function') {
  try {
    latestSecHtml = latestBlockHtmlFn({
      latest: (typeof ctx.getLatestDraws === 'function') ? ctx.getLatestDraws() : null,
      games: G,
      heatmap: (gid) => renderImageHtml(gid, 'heatmap')
    });
  } catch (e) {
    console.log('  ❌ 顶部区块生成失败：' + e.message);
  }
}
/* 兜底：latest-draws.js 没加载成功时，用 hit-check.js 的老写法（只出最新开奖） */
if (!latestSecHtml && typeof buildLatestHtml === 'function') {
  try {
    latestSecHtml = buildLatestHtml();
  } catch (e) {
    console.log('  ❌ 最新开奖生成失败：' + e.message);
  }
}
/* 【稳定 id】客户端就是靠它定位这个区块并整体替换的。
   没有 id（老版本页面/生成失败）时客户端会退化成「找不到就什么都不做」。 */
if (latestSecHtml && latestSecHtml.indexOf('id="' + LATEST_DRAWS_ID + '"') < 0) {
  console.log(`  ⚠️ 最新开奖区块缺少稳定 id（${LATEST_DRAWS_ID}），客户端将无法就地更新`);
}
console.log(`  · 最新开奖区块 id = ${LATEST_DRAWS_ID}`);

/* ---- 底部：中奖栏 ---- 【已按用户要求移除】
   用户原话：「不要这个东西了」（指着页面的「中奖栏 / 累计命中 N 注 / 奖金合计 X 元」）。
   这里原来会调 hit-check.js 的 buildWinSectionHtml() 生成中奖卡片（带推荐图圈选）。
   现在完全不生成：hitSecHtml 恒为空字符串，页面里也就没有这一块。
   注意：没有动 hit-check.js 本身（App 里可能还要用），只是分享页不再输出。 */
hitSecHtml = '';
hitSecCss = '';

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

/* ============================================================
   【核心改造】把 App（game.html）用的同一套脚本内联进分享页
   ------------------------------------------------------------
   以前分享页的图是 Node 里用「迷你 DOM」跑出来的静态结果，
   App 是浏览器里实时跑 render.js —— 两条路径，必然会有不一样。
   现在分享页把同一套脚本内联进来，在浏览器里实时渲染，
   走的就是 App 那条路径（同一份 render.js、同一份数据、同一套调用顺序）。

   顺序和 game.html 保持一致。
   内联（而不是外链）= 分享页仍然是单文件，发微信/QQ 点开就能用。
   ============================================================ */
const INLINE_JS = [
  'games.js',        // 彩种定义 GAMES / GROUPS
  'draws.js',        // 开奖数据装载
  /* 【最新开奖】区块的生成函数 + 客户端更新逻辑。
     服务端 export-static.mjs 预渲染时用的是同一份文件（见上面的 FILES），
     所以「服务端烤进 HTML 的那段」和「客户端拉 tickets.json 后就地替换的那段」
     是同一个函数渲染出来的，不会两边写法漂移。
     必须排在页尾的实时渲染脚本之前 —— 它要用 latestDrawsHtml / applyRemoteDraws。 */
  'latest-draws.js', // latestDrawsHtml / applyRemoteDraws / hcDrawOf
  'history.js',      // 历史开奖
  'draw-data.js',    // getDraw / nextDrawDate / nextIssueFor
  'algo.js',         // 基础算法
  'stats.js',        // autoFillForTemplate（自动算号）
  'templates.js',    // TEMPLATES / TEMPLATE_DISCLAIMER
  'ticket-store.js', // getTicket / 号码解析 / 摇号
  'saved-tickets.js',// 存档（手动录入那一层的数据来源）
  'heatmap-data.js', // 【按天出】实票统计热力图数据 + shouldShowHeatmap 判断
  'render.js',       // renderTicketImage ← App 用的同一个函数
  'experts-data.js', // 专家数据（data-store 依赖）
  'expert-pool.js',  // 专家池
  'materials-data.js',  // 资料（用户录入的内容）

  'data-store.js'    // resolveTemplateValues（三路合并）
];

/* 【可选脚本】没有它页面照样要能生成 —— heatmap-data.js 由
   build-heatmap.mjs 按天生成，万一云端这次没生成，也只是没有热力图，
   绝不能因为这个文件缺失就让整页生成失败（那会覆盖掉上一版好页面）。 */
const INLINE_OPTIONAL = new Set(['heatmap-data.js']);

/** 读一个脚本文件，处理成可以直接塞进 <script> 的文本 */
function readForInline(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return '';
  let s = fs.readFileSync(p, 'utf8');
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);       // 去掉可能的 BOM
  // 万一脚本里出现 </script 会提前结束标签；转义成 <\/script
  s = s.replace(/<\/(script)/gi, '<\\/$1');
  return s;
}

const inlineSizes = [];
const inlineMissing = [];
let inlineScriptsHtml = '';
for (const f of INLINE_JS) {
  const code = readForInline(f);
  if (!code) {
    if (INLINE_OPTIONAL.has(f)) { console.log(`  ⏭  可选脚本缺失，跳过：${f}（热力图将不显示）`); continue; }
    inlineMissing.push(f);
    continue;
  }
  inlineSizes.push([f, Buffer.byteLength(code, 'utf8')]);
  /* ⚠️【不写 data-src="文件名"】用户硬性要求：页面上不能看出数据从哪个文件来。
     属性值就是 scripts 里的文件名（history.js / latest-draws.js …），
     看源码的人一眼就能顺着追到源头；留痕断言也会当场命中（实测拦过）。
     这个属性只有内部核对用，页面运行时【没有任何代码读它】，
     去掉后不影响渲染；文件名仍然打印在构建日志的「内联脚本」清单里。 */
  inlineScriptsHtml += `\n<script>\n${code}\n</script>\n`;
}

/* 【必须硬失败】少一个脚本，页面就渲染不出和 App 一样的结果
   （实测：少了 experts-data.js / expert-pool.js，10 张图里有 3 张
     的奇偶、大小、012路 字段会不一样）。
   宁可这里报错、不覆盖上一版好页面，也不能悄悄发一个「和 App 不一样」的网页。 */
if (inlineMissing.length) {
  console.log('');
  console.log('  ❌ 以下脚本缺失，无法保证分享页和本地 App 渲染一致：');
  inlineMissing.forEach((f) => console.log('      ' + f));
  console.log('     请先在项目根目录补齐这些文件（云端则是先跑 cloud/sync-cloud.mjs 同步）再重试。');
  console.log('     已中止，不会覆盖现有的「只读分享版.html」。');
  process.exit(1);
}

console.log('\n  · 内联脚本：');
inlineSizes.forEach(([f, n]) => console.log(`      ${f.padEnd(20)} ${(n / 1024).toFixed(1)} KB`));
console.log(`      合计 ${(inlineSizes.reduce((a, b) => a + b[1], 0) / 1024).toFixed(1)} KB`);

/* ============================================================
   页尾的【实时渲染】脚本
   ------------------------------------------------------------
   调用方式和 game.html 的 renderImagesInto 逐行对应，
   所以「App 渲染」和「分享页渲染」是同一个函数的同一次调用语义。
   ============================================================ */
const RO_RENDER_SCRIPT = `
/* ============================================================
   【实时渲染】推荐图 —— 和本地 App 走同一条渲染路径
   ------------------------------------------------------------
   App（game.html 的 renderImagesInto）是这么渲染的：

       const draw     = getDraw(gameId);
       const nextDate = nextDrawDate(gameId);
       const issue    = nextIssueFor(gameId);
       const entry    = getTicket(gameId, nextDate);
       const manual   = entry && entry.images && entry.images[img.key];
       const resolved = resolveTemplateValues(gameId, img.key, manual);
       const data     = { issue: issue, date: nextDate, images: {} };
       data.images[img.key] = resolved.values;
       renderTicketImage(gameId, img.key, data);

   下面 renderSlot() 就是照抄上面这几行的调用方式（一字不改的语义），
   所以只要 render.js 和数据一样，两边渲染出的 DOM 必然一致。

   图位：<div class="ro-imagewrap" data-game="ssq" data-image="main">…</div>
   里面是服务器端预渲染的兜底内容；
   这里渲染成功后才整体替换掉 —— 万一 JS 挂了，页面也不会空白。
   ============================================================ */
(function () {
  /* 按「彩种 + 图名」渲染一张推荐图 —— 和 game.html / renderImagesInto 完全一致 */
  function renderImageDom(gid, key) {
    if (!gid || !key) return null;
    if (typeof TEMPLATES === 'undefined' || typeof renderTicketImage !== 'function') return null;

    var tpl = TEMPLATES[gid];
    if (!tpl || !tpl.images || !tpl.images.length) return null;

    /* 找到这张图的模板定义；找不到就用第一张（和 renderTicketImage 的兜底一致） */
    var img = null;
    for (var i = 0; i < tpl.images.length; i++) {
      if (tpl.images[i].key === key) { img = tpl.images[i]; break; }
    }
    if (!img) img = tpl.images[0];
    if (!img) return null;

    /* ---------- 以下与 game.html / renderImagesInto 完全一致 ---------- */
    var nextDate = nextDrawDate(gid);
    var draw  = (typeof getDraw === 'function') ? getDraw(gid) : null;
    var issue = (typeof nextIssueFor === 'function') ? nextIssueFor(gid) : ((draw && draw.issue) || '');

    var entry  = (typeof getTicket === 'function') ? getTicket(gid, nextDate) : null;
    var manual = (entry && entry.images && entry.images[key]) || null;

    var resolved = (typeof resolveTemplateValues === 'function')
      ? resolveTemplateValues(gid, key, manual)
      : { values: manual || {} };

    var data = { issue: issue, date: nextDate, images: {} };
    data.images[key] = resolved.values;

    return renderTicketImage(gid, key, data);
    /* ---------- 以上与 game.html / renderImagesInto 完全一致 ---------- */
  }

  /** 图位（<div class="ro-imagewrap" data-game data-image>）→ 渲染成图 */
  function renderSlot(slot) {
    return renderImageDom(slot.getAttribute('data-game'), slot.getAttribute('data-image'));
  }

  function renderAll() {
    var slots = document.querySelectorAll('.ro-imagewrap[data-game]');
    var ok = 0;
    var fail = 0;
    var hidden = 0;

    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];

      /* ============================================================
         【按天出】实票统计热力图：这里是【客户端】的第二道判断。
         服务器生成时已经判断过一次，但页面会被缓存/长期挂在网上 ——
         第二天打开同一张页面时，昨天的热力图必须自动消失。
         判断口径：heatmap-data.js 里的 shouldShowHeatmap
         （数据必须是今天的 + 今天是开奖日 + 已过北京时间 18:00 +
           还没到窗口结束的 20:00 / 21:00）。
         ============================================================ */
      if (slot.getAttribute('data-image') === 'heatmap') {
        /* 【用户 2026-10-18】热力图现在在 #ro-heatmap 那张折叠卡里，
           由「当前时间 → 下一期最近的彩种」决定显示哪一个（页面脚本自己换），
           不再有「18:00 才显示 / 20:00·21:00 撤下」的时间窗 ——
           所以【这张卡里的图位永远渲染】，不走下面那套按时间隐藏的逻辑。
           其它位置（老页面缓存下来的彩种区块热力图）仍按原逻辑清理。 */
        var inHeatBlock = false;
        try { inHeatBlock = !!(slot.closest && slot.closest('#ro-heatmap')); } catch (e) { inHeatBlock = false; }
        if (!inHeatBlock) {
        var hg = slot.getAttribute('data-game');
        var show = false;
        try {
          show = (typeof shouldShowHeatmap === 'function') && shouldShowHeatmap(hg);
        } catch (e) { show = false; }
        if (!show) {
          /* 【顶部区块里的那一张不能在这里删】
             现在热力图只出现在 #ro-latest 区块里，把这个图位删掉只会
             留下一个空区块。交给 refreshLatestBlock 换成「最新开奖」。 */
          if (isBlockHeatSlot(slot)) {
            try { refreshLatestBlock(true); } catch (e3) { /* 忽略 */ }
            continue;
          }
          /* 老页面缓存下来的、彩种区块里的热力图 → 整块拿掉，不留占位、不留空白 */
          try {
            if (slot.parentNode && slot.parentNode.removeChild) slot.parentNode.removeChild(slot);
            else slot.style.display = 'none';
          } catch (e) { slot.style.display = 'none'; }
          hidden++;
          continue;
        }
        }   /* ← if (!inHeatBlock) 收口 */
      }

      var dom = null;

      try {
        dom = renderSlot(slot);
      } catch (e) {
        /* 渲染出错：保留服务器端预渲染的兜底内容，不影响浏览 */
        fail++;
        if (window.console && console.warn) {
          console.warn('[分享页] 实时渲染失败，保留预渲染兜底：' +
            slot.getAttribute('data-game') + '/' + slot.getAttribute('data-image'), e);
        }
        continue;
      }

      if (!dom) { fail++; continue; }

      /* 先渲染成功、再替换，避免出现空白 */
      slot.innerHTML = '';
      slot.appendChild(dom);
      ok++;
    }

    /* 留一个标记，方便确认这一页到底跑的是实时渲染还是预渲染兜底 */
    try {
      if (document.body && document.body.setAttribute) {
        document.body.setAttribute('data-render', fail ? 'fallback' : 'live');
        document.body.setAttribute('data-render-count', ok + '/' + slots.length);
        document.body.setAttribute('data-heatmap-hidden', String(hidden));
      }
    } catch (e) { /* 忽略 */ }

    return ok;
  }

  window.__roRenderAll = renderAll;

  /* 【热力图区块补画】用户 2026-10-17 把热力图搬进 #ro-heatmap（默认折叠，:target 才显示）。
      canvas 在隐藏元素里画不出来（实测 rect=0x0、canvas 缺失），
      所以点开入口（hash = #ro-heatmap）时、以及带 hash 直达时，各补画一次。 */
  try {
    window.addEventListener('hashchange', function () {
      if (String(location.hash || '').indexOf('#ro-heatmap') === 0) {
        try { renderAll(); } catch (e) { /* 忽略 */ }
      }
    });
    if (String(location.hash || '').indexOf('#ro-heatmap') === 0) {
      setTimeout(function () { try { renderAll(); } catch (e) { /* 忽略 */ } }, 60);
    }
  } catch (e) { /* 忽略 */ }

  /* 【调试】想验证「18:00 之后才有热力图」又不想等到 18:00：
     在网址后面加 ?hmnow=2026-10-15T18:30 —— 时间判断会按这个时刻算。
     不加参数就是真实时间，线上用户不会受影响。 */
  try {
    if (typeof location !== 'undefined' && location.search) {
      var hm = /[?&]hmnow=([^&]+)/.exec(location.search);
      if (hm) {
        window.HEATMAP_NOW_OVERRIDE = decodeURIComponent(hm[1]);
        if (window.console && console.log) console.log('[分享页] 热力图时间已定格：' + window.HEATMAP_NOW_OVERRIDE);
      }
    }
  } catch (e) { /* 忽略 */ }

  /* ============================================================
     【最新开奖 ⇄ 热力图 · 到点自动切换】
     ------------------------------------------------------------
     用户原话：
       「在开双色球的时候 18 点更新到最新开奖位置覆盖住，过了 20 点就更新回来
         最新开奖；同样大乐透在 18 点更新过去，21 点更新回来最新开奖。」

     这一段就是「页面一直开着也会自己换」的实现：
       · 时间窗判断 = latestBlockMode() → heatmap-data.js 的 shouldShowHeatmap()
         （和服务端预渲染、App 用的是同一个函数，不可能漂移）
       · 区块 HTML = latestBlockHtml()（同样是服务端那一份）
       · 只在【形态变了】或【开奖数据更新了】时才动 DOM，平时一次都不碰
       · 任何一步失败 → 保持原样（绝不留白、绝不出现空区块）

     调用时机：
       ① 页面刚打开（先用内联快照，本地时钟算一次）
       ② 每次拉到 tickets.json 之后（90 秒轮询）
       ③ 每 90 秒的定时器里【独立】再算一次 —— 断网也能到点自动切
     ============================================================ */
  var __roBlockMode = '';        /* 页面上这个区块现在是什么形态：'' / 'latest' / 'heatmap:ssq' */

  function blockModeKey() {
    try {
      if (typeof latestBlockMode !== 'function') return '';
      var m = latestBlockMode();
      return m.mode + (m.gameId ? ':' + m.gameId : '');
    } catch (e) { return ''; }
  }

  /**
   * 这个热力图图位就是【顶部区块里那一张】吗？
   * 现在热力图只出现在 #ro-latest 里（彩种区块不再重复出），
   * 所以「当前形态里的那个彩种」就是它 —— 用来避免把顶部区块删成空白。
   */
  function isBlockHeatSlot(slot) {
    return blockModeKey() === 'heatmap:' + slot.getAttribute('data-game');
  }

  /**
   * 把顶部区块换成「现在该有的样子」
   * @param {boolean} force 开奖数据更新了 → 即使形态没变也要重画一次
   * @returns {{ok:boolean, mode:string, changed:boolean}}
   */
  function refreshLatestBlock(force) {
    var out = { ok: false, mode: '', changed: false };
    try {
      /* 老页面没有这个 id（或被缓存的旧版本）→ 什么都不做。
         沙箱/自测环境里没有 getElementById 也走这一条，不会刷告警。 */
      var el = (typeof document !== 'undefined' && typeof document.getElementById === 'function')
        ? document.getElementById(LATEST_DRAWS_ID) : null;
      if (!el) return out;
      if (typeof latestBlockMode !== 'function' || typeof latestBlockHtml !== 'function') return out;
      if (typeof latestDrawsHtml !== 'function' || typeof latestDrawsFromRaw !== 'function') return out;

      var key = blockModeKey();
      if (!key) return out;
      out.mode = key;
      if (!force && key === __roBlockMode) { out.ok = true; return out; }   /* 形态没变 → 不碰 DOM */

      var all = null;
      try { all = (typeof DRAW_DATA !== 'undefined') ? DRAW_DATA.games : null; } catch (e1) { all = null; }

      var html = latestBlockHtml({
        latest: latestDrawsFromRaw(all, (typeof GAMES !== 'undefined') ? GAMES : {}),
        games: (typeof GAMES !== 'undefined') ? GAMES : {},
        /* 热力图内部 HTML：和推荐图走同一个渲染函数（同一次调用语义） */
        heatmap: function (gid) {
          var dom = renderImageDom(gid, 'heatmap');
          return (dom && dom.outerHTML) ? dom.outerHTML : '';
        }
      });
      if (!html) return out;                                 /* 生成不出来 → 保持原样，绝不留白 */

      __roBlockMode = key;                                   /* 记住形态，下次没变就不动 */
      out.ok = true;

      if (el.outerHTML === html) return out;                 /* 一模一样就不用动 DOM */
      el.outerHTML = html;
      out.changed = true;

      try {
        if (document.body && document.body.setAttribute) {
          document.body.setAttribute('data-block-mode', key);
        }
      } catch (e2) { /* 忽略 */ }

      /* 区块里换成了 760px 宽的热力图 → 重新做一次等比缩放 */
      try {
        if (typeof window.__roFit === 'function') window.__roFit();
      } catch (e3) { /* 忽略 */ }

      return out;
    } catch (e) {
      if (window.console && console.warn) console.warn('[分享页] 顶部区块切换失败，保留原内容', e);
      return out;
    }
  }

  /* 方便自测 / 排查：控制台里手动换一次（__roRefreshBlock()） */
  window.__roRefreshBlock = refreshLatestBlock;

  /* 【顺序·重要】先按本地时钟把区块定成该有的形态，再整体渲染图位 ——
     这样「服务器 02:00 预渲染成最新开奖、用户 19:00 打开」也能立刻显示热力图，
     而且顶部那张热力图会由下面的 renderAll() 一起渲染出来。 */
  try {
    refreshLatestBlock(false);
  } catch (e) { /* 忽略 */ }

  /* 页尾脚本执行时，上面的图位已经全部在 DOM 里，直接渲染 */
  try {
    renderAll();
  } catch (e) {
    if (window.console && console.warn) {
      console.warn('[分享页] 实时渲染整体失败，保留预渲染兜底', e);
    }
  }

  /* ============================================================
     【准实时同步】直接拉服务器上的最新号码，拿到就地重渲染
     ------------------------------------------------------------
     为什么需要这一段：
       页面里的号码是「生成那一刻」的快照（内联的 saved-tickets.js）。
       本机摇号后，必须等云端重新构建 + 部署，页面上的号码才会变，
       链路一长就是几十分钟 —— 这就是「摇完号要等两小时」的原因。

     现在的顺序：
       1) 先用内联快照渲染  → 立刻有内容，离线也能看
       2) 再异步拉 tickets.json（服务器上的最新号码）
          · 比页面里的新 → 覆盖内存里的 SAVED_TICKETS 并就地重渲染
          · 不新 / 打不开   → 什么都不做，页面照旧（离线可用）

     注意：SAVED_TICKETS 是 saved-tickets.js 里的 const，
           不能重新赋值整个变量，只能改它的属性。
     ============================================================ */

  /* 把 "2026-10-14T05:00:00.000Z"（ISO，UTC）和 "2026-10-14 05:00"
     （本机/云端生成，北京时间）统一成 'YYYY-MM-DD HH:MM:SS' 北京时间。
     两种格式直接比字符串一定出错（'T' 的编码比空格大），所以先归一化。 */
  function normTime(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var iso = s.replace(' ', 'T');
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(iso)) iso += ':00';
    /* 不带时区的当成北京时间（saved-tickets.js 里的 updated 就是这种） */
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?$/.test(iso)) iso += '+08:00';
    var t = Date.parse(iso);
    if (isNaN(t)) return s.slice(0, 19).replace('T', ' ');
    /* 统一按北京时间输出，格式一样才能直接比大小 */
    var d = new Date(t + 8 * 3600 * 1000);
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' +
           p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds());
  }

  function inlineTicketTime() {
    try {
      return (typeof SAVED_TICKETS !== 'undefined' && SAVED_TICKETS && SAVED_TICKETS.updated) || '';
    } catch (e) { return ''; }
  }

  /* 页面上当前这份【号码本身】的时间（updated），用来判断服务器那份是不是更新。
     注意用的是号码的时间，不是页面生成时间：
     云端如果用【旧号码】重新构建了一遍，它的 publishedAt 会很新，
     但 updated 是旧的 —— 那种不能认，否则会把页面上的新号码换回旧的。 */
  var appliedTime = normTime(inlineTicketTime());
  window.__roLiveApplied = false;
  window.__roLiveRemoteTime = '';

  /**
   * 用服务器数据覆盖页面上的号码并重渲染
   * @returns {boolean} 是否真的用新号码重渲染了
   */
  function applyRemoteTickets(j) {
    if (!j || !j.tickets || !Object.keys(j.tickets).length) return false;
    if (typeof SAVED_TICKETS === 'undefined' || !SAVED_TICKETS) return false;

    var remoteData = normTime(j.updated);
    var remotePub = normTime(j.publishedAt || j.updated);
    if (!remoteData && !remotePub) return false;

    /* 内容一模一样（只是重新构建了一遍）就没必要重画 10 张图 */
    var same = false;
    try { same = JSON.stringify(SAVED_TICKETS.tickets || {}) === JSON.stringify(j.tickets); } catch (e) { same = false; }

    /* 服务器这份比页面上的新吗？
       · 号码时间更晚            → 新（真的摇过号了）
       · 号码时间一样但内容不同  → 新（同一分钟内摇了两次，内容还是会变）
       · 号码时间更早            → 不是（云端拿旧号码重建，publishedAt 再新也不认） */
    var newer;
    if (remoteData && appliedTime) {
      newer = (remoteData > appliedTime) || (remoteData === appliedTime && !same);
    } else {
      newer = remotePub > appliedTime;
    }
    if (!newer) return false;                           /* 服务器的不新，不动 */

    /* 用服务器数据覆盖内存里的 SAVED_TICKETS（只改属性） */
    SAVED_TICKETS.updated = j.updated || SAVED_TICKETS.updated;
    SAVED_TICKETS.tickets = j.tickets;

    /* 同时清掉 localStorage 里的旧号码：
       loadTickets() 的规则是「本地存储比文件新就用本地存储」，
       不清掉的话会被旧号码盖回去，等于白拉一次 */
    try {
      localStorage.removeItem('cdd.tickets.v1');
      localStorage.removeItem('cdd.tickets.ts');
    } catch (e) { /* 忽略 */ }

    appliedTime = remoteData || remotePub;
    window.__roLiveRemoteTime = appliedTime;
    if (same) return false;                             /* 号码没变，不用重画 */

    window.__roLiveApplied = true;
    renderAll();                                        /* 用最新号码重渲染 */

    /* 重渲染后图片尺寸变了，重新做等比缩放 */
    try {
      if (typeof window.__roFit === 'function') window.__roFit();
    } catch (e) { /* 忽略 */ }

    try {
      if (document.body && document.body.setAttribute) {
        document.body.setAttribute('data-tickets-from', 'server');
        document.body.setAttribute('data-tickets-time', appliedTime);
      }
    } catch (e) { /* 忽略 */ }

    return true;
  }

  /* 方便自测 / 排查：页面上可以在控制台手动调 __roLiveApply(数据) */
  window.__roLiveApply = applyRemoteTickets;

  /* ============================================================
     【最新开奖 · 就地更新】拿到 tickets.json 里的 draws 后重画顶部区块
     ------------------------------------------------------------
     以前这块是服务器【预渲染】进 HTML 的静态内容，只有刷新整页才会变。
     现在 tickets.json 里带上了各彩种最新一期开奖（draws），
     拉到比页面内联快照更新的一期就：
       1) 把新号码合并进内存里的 DRAW_DATA（只改属性，只更新有的彩种）
       2) 调 refreshLatestBlock(true) 重画顶部区块
          —— 区块现在可能是「最新开奖」，也可能是顶掉它的「热力图」，
             具体放哪个由 latestBlockMode() 决定（到点会自动切换）：
               · 形态没变、只是开奖号变了 → 重画「最新开奖」那张卡
               · 到点该换回来了            → 换成「最新开奖」（带着新号码）
             【关键】换回来时用的就是刚才合并进 DRAW_DATA 的新号码，
             所以「20:00 / 21:00 一换回来就是最新一期」，不用等下次刷新。
     用的就是生成页面时那份同一个函数（latest-draws.js），
     所以服务端烤进去的和服务端/客户端换上去的写法完全一致。

     降级：拿不到 draws / 只有部分彩种 / 比页面旧 → 一律保持原样，
           不报错、不留白（这条路径整个用 try 包住）。
     ============================================================ */
  function applyRemoteDrawsToPage(j) {
    var res = { applied: [], skipped: [] };
    try {
      if (!j || !j.draws) return res;                      /* 没带就什么都不做 */
      if (typeof applyRemoteDraws !== 'function') return res;   /* 客户端脚本缺失 → 保持预渲染兜底 */

      /* 1) 合并进内存数据（只更新有的彩种；比页面旧的自动跳过） */
      res = applyRemoteDraws(j.draws) || res;
      if (!res.applied.length) return res;                 /* 没有更新 → 区块原样保留 */

      /* 2) 按【当前该有的形态】重画区块（形态判断 + HTML 都来自共享函数）
         【关键】用合并【之后】的完整数据（DRAW_DATA.games）重画，而不是 j.draws：
         服务器这次可能只带了一部分彩种，用 j.draws 直接渲染会把别的彩种弄丢。
         区块必须始终是完整的 8 个彩种。 */
      var r = refreshLatestBlock(true);
      if (!r.ok) return { applied: [], skipped: res.skipped };   /* 画不出来 → 保持原样 */

      try {
        if (document.body && document.body.setAttribute) {
          document.body.setAttribute('data-draws-from', 'server');
          document.body.setAttribute('data-draws-games', res.applied.join(','));
        }
      } catch (e2) { /* 忽略 */ }

      return res;
    } catch (e) {
      /* 任何意外都只是「这次没更新开奖」，不能影响页面其它部分 */
      if (window.console && console.warn) console.warn('[分享页] 最新开奖就地更新失败，保留原内容', e);
      return { applied: [], skipped: [] };
    }
  }

  /* 方便自测 / 排查：控制台里手动调 __roLiveDraws(数据) */
  window.__roLiveDraws = applyRemoteDrawsToPage;

  /* 【离线单文件 · 不拉】file:// 下 tickets.json 永远不存在 ——
     它只发布在【网站根目录】（cloud/out/tickets.json，云端每班次刷新），
     离线打开（手机分享单个 html / App 里 file://）时这个相对路径必然 404。
     后果实测：首拉 1 次 + 补拉 4 次 + 自愈 1 次 = 6 条 404 红字（页面不白屏，
     因为顶部区块和 10 张推荐图都预渲染在 HTML 里了）。
     → file:// 直接不拉：少 6 条红字、少 6 次无用请求，功能一点不少（有预渲染兜底）。
     ⚠️ http(s) 上（线上网址）照旧拉，线上「号码就地更新 / 最新开奖就地更新」不受影响。 */
  function canPullTickets() {
    try { return String(location.protocol || '') !== 'file:'; } catch (e) { return true; }
  }

  /* 拉一次服务器上的号码文件 */
  function pullTickets() {
    if (!canPullTickets()) return Promise.resolve(false);   /* 离线单文件：不拉，直接用内联快照 */
    return fetch('tickets.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        /* 两件事各自独立：号码变了就重画 10 张图，开奖变了就重画顶部区块 */
        var t = applyRemoteTickets(j);
        var d = applyRemoteDrawsToPage(j);
        return t || (d && d.applied.length > 0);
      })
      .catch(function () { return false; });   /* 打不开服务器（离线/被墙）就继续用内联快照 */
  }

  var firstPull = pullTickets();
  window.__roLivePromise = firstPull;

  /* 方便自测 / 排查：控制台里手动拉一次（__roPullOnce().then(...)） */
  window.__roPullOnce = pullTickets;

  /* ============================================================
     【自动刷新】页面开着的时候，隔一段时间自动去服务器看有没有新数据
     ------------------------------------------------------------
     为什么需要：
       云端在固定时间更新（凌晨 2:00 全量 / 18:00 热力图 /
       21:30 福彩、21:45 体彩抓开奖同步）。如果你手机上的页面一直开着，
       以前只能【手动刷新】才看得到新内容。
     现在：
       每 90 秒做两件事，都是就地重渲染，不用你动手：
         ① 拉一次 tickets.json —— 有新号码就重画推荐图 + 顶部区块
         ② 【独立】再算一次顶部区块的形态 —— 到 18:00 换成热力图、
            到 20:00（双色球）/ 21:00（大乐透）换回最新开奖。
            这一步只看本机时间、不联网，所以断网也照样到点自动切。
     省流量：
       这只是一个小 JSON（几 KB），而且只有页面开着时才轮询；
       切到后台时浏览器会自动降频。
     ============================================================ */
  if (!window.__roAutoTimer) {
    var AUTO_MS = (typeof window.__roAutoIntervalMs === 'number')
      ? window.__roAutoIntervalMs : 90000;
    window.__roAutoTimer = setInterval(function () {
      try {
        pullTickets();
      } catch (e) { /* 忽略：网络问题不能影响页面 */ }
      /* 【到点自动切换】和网络无关，单独算一次（形态没变时它一个 DOM 都不碰） */
      try {
        refreshLatestBlock(false);
      } catch (e) { /* 忽略 */ }
    }, AUTO_MS);

    /* 页面从后台切回前台时也立刻拉一次（手机切回来马上就是新的） */
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          try { pullTickets(); } catch (e) {}
          try { refreshLatestBlock(false); } catch (e) {}
        }
      });
    }
  }

  /* 补拉：本机刚摇完号时，云端可能还在部署中（约 1 分钟），
     GitHub Actions 排队时甚至会等几分钟，第一次拉到的还是旧的。
     隔几秒再补拉几次 —— 这样「号码刚摇完就打开网址」的人也不用
     手动刷新，页面自己会跟上（最多补拉四次，共约 3.5 分钟）。
     只要有一次拿到更新的数据就停。
     （间隔放在 window 上，方便自测/排查时改短。） */
  if (!window.__roLiveRetryDelays) window.__roLiveRetryDelays = [8000, 25000, 60000, 120000];

  firstPull.then(function (applied) {
    if (applied) return;                       /* 已经换成新号码了，不用补拉 */
    if (!canPullTickets()) return;             /* 离线单文件（file://）：不补拉，省掉 4 条 404 */
    var delays = window.__roLiveRetryDelays || [];
    var step = function (i) {
      if (i >= delays.length) return;
      setTimeout(function () {
        pullTickets().then(function (done) { if (!done) step(i + 1); });
      }, delays[i]);
    };
    step(0);
  });
})();
`;

/* ============================================================
   【走势图 · 内联片段】
   ------------------------------------------------------------
   数据：history.js 的 DRAW_HISTORY（真开奖），构建时读一次、快照内嵌；
        页面零联网、不调 AI、不写 localStorage。
   期数：近 30 期（和折叠块副标题「近 30 期走势 · 预选参考」对齐）。
   ⚠️ 「数据从哪来」的字样由文件末尾那道 source-guard 统一兜底 ——
      走势图这一段现在也是分享页的一部分，跟着整页一起过关。
   ============================================================ */
const trendHtml = renderTrendFragment(
  buildTrendPayload(loadTrendHistory(), TREND_PERIODS)
);
console.log('\n  · 走势图（内联进「近 30 期走势 · 预选参考」折叠块，不是 iframe）：'
  + `8 彩种 × 近 ${TREND_PERIODS} 期 · ${(Buffer.byteLength(trendHtml, 'utf8') / 1024).toFixed(1)} KB`);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- 【禁止缓存】手机浏览器（尤其微信内置）会缓存很久，
     加上这些标记后每次都会取最新的，避免「App 更新了网页还是旧的」 -->
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
<!-- ============================================================
     【分享卡片 / 图标 / PWA】
       · 标题固定为「春风彩票」（用户指定）
       · og:image 必须是【绝对 URL】—— 微信 / QQ / Twitter 抓的是绝对地址，
         相对路径它们抓不到
       · 图标文件由 make-icons.mjs 分发到站点根目录，云端 cloud-build.mjs
         再拷进 out/，最后随 site/ 一起发布
     ============================================================ -->
<title>春风十万里 - 综合数据平台</title>
<meta name="description" content="春风十万里：免费提供双色球、大乐透推荐号、GPT摇号、走势图、足球推单等综合服务。仅供娱乐参考，不构成购彩建议；未成年人不得购买彩票。" />
<meta name="format-detection" content="telephone=no" />
<!-- 微信 / QQ 兼容标签（用户 2026-10-18 给的文案；image 必须是绝对地址，用站点根的 share.png） -->
<meta itemprop="name" content="春风十万里 - 免费推荐与智能选号" />
<meta itemprop="description" content="免费提供双色球、大乐透推荐号、GPT摇号、走势图、足球推单等综合服务。" />
<meta itemprop="image" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<link rel="icon" type="image/svg+xml" href="icon.svg" />
<link rel="icon" type="image/x-icon" href="favicon.ico" />
<link rel="shortcut icon" href="favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
${PWA_HEAD}
<meta name="application-name" content="春风彩票" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="春风十万里" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="mobile-web-app-capable" content="yes" />
<!-- 分享卡片：微信 / QQ / 微博 / Twitter / Facebook 都读这些
     ⚠️ 用户 2026-10-18 给了文案（og:title / og:description / itemprop），照此落地；
        og:image 必须是【完整绝对地址】，指向站点根目录的 share.png（1200×630）。 -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="春风十万里" />
<meta property="og:title" content="春风十万里 - 免费推荐与智能选号" />
<meta property="og:description" content="免费提供双色球、大乐透推荐号、GPT摇号、走势图、足球推单等综合服务。" />
<meta property="og:image" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<meta property="og:image:secure_url" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="春风十万里 —— 彩票球图标与页面标题" />
<meta property="og:url" content="https://chunfengww2026.github.io/chunfeng-lottery/" />
<meta property="og:locale" content="zh_CN" />
<!-- 微信 / QQ 专用的兼容标签 → 已挪到 <head> 靠前的位置（和 title 在一起），
     这里不再重复，避免 itemprop 出现两套（实测会导致微信读到旧文案）。 -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="春风十万里 - 免费推荐与智能选号" />
<meta name="twitter:description" content="免费提供双色球、大乐透推荐号、GPT摇号、走势图、足球推单等综合服务。" />
<meta name="twitter:image" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<meta name="twitter:image:alt" content="春风十万里 —— 彩票球图标与页面标题" />
<style>
${css}
${hitSecCss}

/* ============================================================
   只读分享版专用样式
   ============================================================ */
body {
  display: block !important;
  background: #0f1115;
  zoom: 1 !important;
  opacity: 1 !important;
  padding: 0;
}
.ro-wrap {
  max-width: 820px;
  margin: 0 auto;
  padding: 16px 12px 60px;
}
.ro-top {
  text-align: center;
  padding: 22px 0 26px;
}
.ro-top h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 3px;
  background: linear-gradient(90deg, #ff5f6d, #ffc371, #47e0a0, #4facfe, #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.ro-top .sub {
  font-size: 12.5px;
  color: #6b7488;
  margin-top: 8px;
  letter-spacing: 0.5px;
}
/* 【已移除】标题下面那行「日期 · 共 N 个彩种 / M 张图」（用户要求删掉）。
   body 上的构建时间属性仍然保留 —— 自愈脚本靠它判断页面新旧，
   它只是不可见属性，不再渲染成页面上的可见文字。 */

/* ---- 更新状态条 ---- */
.ro-status {
  border-radius: 12px;
  padding: 15px 17px;
  margin-bottom: 26px;
  border: 1px solid;
  line-height: 1.7;
}
.ro-status.ok {
  background: rgba(71, 224, 160, 0.07);
  border-color: rgba(71, 224, 160, 0.3);
}
.ro-status.warn {
  background: rgba(240, 180, 41, 0.08);
  border-color: rgba(240, 180, 41, 0.32);
}

.ro-st-head {
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ro-status.ok .ro-st-head { color: #47e0a0; }
.ro-status.warn .ro-st-head { color: #f0b429; }

.ro-st-dot {
  width: 9px; height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ro-status.ok .ro-st-dot {
  background: #47e0a0;
  box-shadow: 0 0 0 4px rgba(71, 224, 160, 0.18);
}
.ro-status.warn .ro-st-dot {
  background: #f0b429;
  box-shadow: 0 0 0 4px rgba(240, 180, 41, 0.18);
}

.ro-st-time { font-size: 12px; color: #8b93a1; }
.ro-st-reason { font-size: 12.5px; color: #d9c08a; margin-top: 4px; }
.ro-st-hint { font-size: 11.5px; color: #6b7488; margin-top: 4px; }

.ro-st-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 14px;
  margin-top: 10px;
}
.ro-st-item { font-size: 12px; color: #8b93a1; }
.ro-st-date{font-style:normal;color:#8b949e;font-size:11px;margin-left:5px;opacity:.9}
.ro-st-item b { color: #c8cfda; font-weight: 600; }

/* ---- 分隔条 ---- */
.ro-divider {
  display: flex; align-items: center; gap: 14px;
  margin: 34px 0 26px;
}
.ro-divider::before, .ro-divider::after {
  content: ''; flex: 1; height: 1px; background: #262d3a;
}
.ro-divider span {
  font-size: 13px; color: #6b7488; letter-spacing: 2px; white-space: nowrap;
}

/* 【已移除】竞彩卡片样式（.j-stat / .j-card / .j-odds / .j-reco …）
   足球内容移到独立的「足球竞彩」页，分享页不再需要这套样式。 */

.ro-game {
  margin-bottom: 40px;
  padding-bottom: 30px;
  border-bottom: 1px solid #1e2430;
}
.ro-game:last-child { border-bottom: none; }

.ro-gamehead { margin-bottom: 14px; }
.ro-gamehead h2 {
  font-size: 20px;
  font-weight: 700;
  color: #e8eaed;
  margin-bottom: 6px;
}
.ro-meta { font-size: 12px; color: #6b7488; }

.ro-drawblock {
  background: #161a21;
  border: 1px solid #262d3a;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.ro-drawlabel { font-size: 12px; color: #6b7488; margin-bottom: 10px; }
.ro-balls { display: flex; flex-wrap: wrap; gap: 7px; }
.ro-ball {
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  font-size: 12.5px; font-weight: 700; color: #fff;
  background: linear-gradient(180deg, #f0575c, #d32f34);
  font-family: Arial, sans-serif;
}
/* 【颜色区分】用户要求：「开奖的蓝球要区分出来」
   红球 = 红，蓝球/后区/特别号 = 蓝。 */
.ro-ball.red  { background: linear-gradient(180deg, #f0575c, #d32f34); }
.ro-ball.blue { background: linear-gradient(180deg, #4a83f5, #2158c4); }

/* ============================================================
   【手机目录表格 · 方案 D】 + 【全屏查看层 ro-mob-view】样式
   ------------------------------------------------------------
   目录表格：只在窄屏（<=1365px）显示；宽屏（>=1366px）隐藏 ——
     宽屏本来就有 5 组并排，不需要目录。
   全屏查看层：点目录格子才打开，图片本身【不绑点击】。
   注意：这一层叫 ro-mob-view，跟已经被用户要求删掉的「图片放大器」
   （那个遮罩层）不是同一个东西，页面里放大器那条链路
   （遮罩层类名 / 光标放大类名 / 放大镜图标）至今仍然是 0 处。
   ============================================================ */
.ro-imgtoc-wrap { display: none; }

/* ============================================================
   【手机只留目录】__HIDE_MOB_IMAGES__
   ------------------------------------------------------------
   用户原话：「云端推荐下面全部不要了 应为推荐图目录已经有了」
   用户选择：只手机上去掉（电脑上保留 5 组并排）。

   做法：窄屏把「推荐图」分节标题 + 每个彩种区块隐藏起来，
         让页面打开就是【目录表格】；点格子全屏看那张图。
   ⚠️ 用 display:none，不是从 DOM 删 —— 全屏层点开时会把原图搬进去，
      搬完再量尺寸，所以隐藏不影响显示。
   ============================================================ */
@media (max-width: 1365px) {
  .ro-divider { display: none !important; }
  /* ⚠️ 关键：最新开奖 <section class="ro-game" id="ro-latest"> 也在 .ro-game 里！
     所以要 :not(#ro-latest)，否则会把【最新开奖】一起隐藏掉。
     用户明确说过：「别误删我的最新开奖 我只是想隐藏下面推送的图」。 */
  .ro-game:not(#ro-latest) { display: none !important; }
}
          /* 宽屏：不显示目录 */

/* 【用户要求】「彩票推荐图」那个分节标题栏整条去掉（原话：「画框的不要了」）。
   它下面那块在手机上是隐藏的（见 __HIDE_MOB_IMAGES__），
   所以这条标题没有存在意义 —— 全局隐藏。 */
.ro-divider { display: none !important; }

/* 页面平滑滚动（只为了让「目录锚点」跳转更顺；不影响别的） */
html { scroll-behavior: smooth; }

@media (max-width: 1365px) {
  .ro-imgtoc-wrap {
    display: block;
    background: #161a21;
    border: 1px solid #2a323f;
    border-radius: 12px;
    padding: 14px 12px 12px;
    margin-bottom: 24px;
  }
  .ro-imgtoc-head { text-align: center; margin-bottom: 10px; }
  .ro-imgtoc-title { font-size: 15px; font-weight: 700; color: #e8eaed; letter-spacing: 1px; }
  .ro-imgtoc-sub { font-size: 11.5px; color: #8b93a1; margin-top: 3px; }

  .ro-imgtoc { width: 100%; border-collapse: collapse; }
  .ro-imgtoc td { padding: 3px; width: 50%; }

  /* 浅色格子（浅红/白底 + 深色字），手机上对比度看得清 */
  .ro-toc-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 9px 6px;
    box-sizing: border-box;
    border: 1px solid #f0c9cb;
    border-radius: 9px;
    background: #fff6f6;
    color: #b3262b;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
    text-align: center;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
    transition: background .12s, transform .08s;
  }
  .ro-toc-cell:active { background: #ffe3e4; border-color: #e8a7aa; transform: scale(0.97); }

  /* JS 还没跑完（或挂了）→ 目录不显示，避免出现「点了没反应」的死格子。
     页尾脚本跑完会把 body 上这个标记去掉。 */
  body.ro-toc-pending .ro-imgtoc-wrap { display: none; }
}

/* ---- 全屏查看层（手机目录点开的那一张） ---- */
body.ro-mob-open { overflow: hidden; }

.ro-mob-view { position: fixed; inset: 0; z-index: 9999; background: #0b0d11; }
.ro-mob-view[hidden] { display: none; }

.ro-mob-scroll {
  position: absolute;
  inset: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pinch-zoom;          /* 双指缩放：用户想放大看细节时能放大 */
  padding: 54px 0 66px;
  box-sizing: border-box;
}

/* 缩放容器：宽/高都跟着 scale 同比放大，页面能滚到，不会把图裁掉 */
.ro-mob-holder { position: relative; background: #fff; border-radius: 6px; }

/* 【关键·修「点开看不全」】等比缩放：x / y 永远是同一个 scale ⇒ 图不变形。
   calcScale() 把 --ro-s 写在容器上，容器宽高同时乘它，纵横比和原图一模一样。

   这里踩过两个坑，都会让点开后看不全图，一起修掉：
   ① 图是被搬进一个中转盒（ro-imagewrap）再挂到容器上的，所以这里必须用
      【后代选择器】。原来写成「容器 > 图」（直接子元素）永远匹配不上，
      scale 一次都没生效，图按 760px 原尺寸塞进手机窄容器里 → 右边被切掉。
   ② 用 left:0 + transform-origin:top left 缩放：缩放后的可视范围正好等于容器
      的宽高（容器宽高也是同一个 scale 算出来的），天然对齐、不偏移。
      （原来 left:50% + translateX(-50%)，那个 -50% 是【缩放前】的宽度，
        图会被整体推向左：左边切掉、右边留白。）
   ③ 带上 !important 和三个类的高优先级：宽屏下网页 CSS 有一条
      @media (min-width:820px) 会把图上的 transform 强制成 none，
      不加优先级的话，在电脑浏览器上拉窄窗口点目录，照样会被切。
   ⇒ fit（打开时的默认档）整张图【宽、高都完整】，允许留白；
      real（点一下 1:1 放大）才允许超出视口、靠滚动看细节。 */
.ro-mob-view .ro-mob-holder .r-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 760px !important;
  min-width: 760px !important;
  max-width: 760px !important;
  margin: 0 !important;
  border-radius: 6px !important;
  transform-origin: top left;
  transform: scale(var(--ro-s, 1)) !important;
}

/* 中转盒在全屏层里只当一个壳：
   它的 overflow 绝对不能裁图（原来 overflow-x:auto 会把 760px 的图裁在手机屏宽处），
   阴影 / 外边距也不参与定位。 */
.ro-mob-holder > .ro-imagewrap {
  overflow: visible !important;
  margin: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.ro-mob-x {
  position: absolute;
  top: 10px; right: 10px;
  z-index: 9;
  width: 38px; height: 38px;
  border-radius: 50%;
  background: rgba(22,26,33,.9);
  border: 1px solid #3a4354;
  color: #e8eaed;
  font-size: 20px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}
.ro-mob-x:active { background: #2a323f; }

.ro-mob-tip {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  z-index: 9;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
  text-align: center;
  font-size: 12px;
  color: #98a1b2;
  background: linear-gradient(180deg, rgba(6,8,12,0), rgba(6,8,12,.94));
  pointer-events: none;
}

/* 全屏看图 · 图片加载失败时的兜底提示（用户要求"别显示破图"）。
   定位和 .ro-mob-tip 错开，免得两行字叠在一起。 */
.ro-mob-err {
  position: absolute;
  left: 0; right: 0;
  bottom: 52px;
  z-index: 9;
  text-align: center;
  font-size: 12.5px;
  color: #e0a35c;
  padding: 0 16px;
  pointer-events: none;
}

/* 全屏看图 · 左上角计数器「第 N / M 张」（用户给的设计：counter 左上、close 右上）。
   只有相册模式才显示；pointer-events:none 不挡点击。 */
.ro-mob-count {
  position: absolute;
  left: 12px;
  top: calc(10px + env(safe-area-inset-top, 0px));
  z-index: 9;
  font-size: 12px;
  color: #c8cfda;
  padding: 4px 10px;
  border-radius: 14px;
  background: rgba(6, 8, 12, .72);
  border: 1px solid rgba(200, 207, 218, .22);
  pointer-events: none;
}
.ro-mob-count[hidden] { display: none; }

/* 推荐图容器
   【重要】图片必须保持 760px 设计宽度，内部布局一点都不能变，
   手机上靠 transform: scale() 整体等比缩小，
   这样看起来和 App 里一模一样，不会「变形」。 */
.ro-imagewrap {
  margin-bottom: 20px;
  border-radius: 12px;
  /* 兜底：万一 JS 没执行，可以横向滑动看完整图，而不是被裁掉 */
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  box-shadow: 0 4px 18px rgba(0,0,0,0.4);
  position: relative;
}
.ro-imagewrap .r-image {
  width: 760px !important;
  max-width: 760px !important;
  min-width: 760px !important;
  margin: 0 !important;
  border-radius: 0 !important;
  transform-origin: top left;
  will-change: transform;
}
/* 桌面端：不缩放时居中 */
@media (min-width: 820px) {
  .ro-imagewrap .r-image { transform: none !important; }
}

/* ============================================================
   【关键】锁死推荐图的内部布局
   ------------------------------------------------------------
   媒体查询是按「屏幕宽度」判断的。手机上 (<=700px) styles.css 里
   这些规则会被激活，把图片内部重新排版：
       .r-twocol   { flex-direction: column }        左右并排 → 上下堆叠
       .r-ranklist { grid-template-columns: 1fr }    热号排行 → 竖列
   结果就是网页和 App 长得不一样（用户说的「变形」）。

   这里用更高优先级 + !important 锁死，让图片永远保持设计布局，
   手机上靠整体等比缩放来适配。
   ============================================================ */
.ro-imagewrap .r-twocol    { flex-direction: row !important; }
.ro-imagewrap .r-ranklist  { grid-template-columns: repeat(3, minmax(0,1fr)) !important; }
.ro-imagewrap .r-headtitle { font-size: 22px !important; }
.ro-imagewrap .r-inlinefoot { flex-wrap: wrap !important; }
.ro-imagewrap .r-calrow    { flex-wrap: wrap !important; }
.ro-imagewrap .r-calbadges { flex-wrap: wrap !important; }

/* ============================================================
   【口口·两张图左右放】推荐图两两并排
   ------------------------------------------------------------
   用户原话：「我要的模板是两张图左右放，两张图一个版面比如：口口 这样的
     我要的是双色球的两个资料这样布局，大乐透也是
     排三和排五 七星彩和七乐彩这样的布局 快乐8和3D是这样布局」

   配对（左侧 / 右侧）：
     ① 双色球 main  / 双色球 wuxing   （同一个彩种的两张图）
     ② 大乐透 main  / 大乐透 wuxing   （同一个彩种的两张图）
     ③ 排列3        / 排列5
     ④ 七星彩       / 七乐彩
     ⑤ 福彩3D       / 快乐8            （用户先说过「3D左边」）

   ⚠️ 只在【外层容器】上排，推荐图本身【一个字都没改】：
      · 仍然靠 fit() 的 transform: scale(等比) 适配 —— 图不会变形
      · 手机等窄屏：图横向放不下，按容器宽度整体等比缩小（不是变形、不裁切）

   为什么宽屏也要缩一点点：两张图一共 760×2 = 1520px + 间距，
   1920px 屏幕上左右各留 20px 之后只剩 1880px，本来就够；
   于是把每栏设成「各占一半」，fit() 量到 ~930px/栏 ⇒ scale≈1.22（放大，更清楚）。
   窄屏（手机）每栏只有约 175px ⇒ scale≈0.23，图会很小 ——
   这是「两张 760px 的图并排」的必然结果，用户已知情（他要的就是这个版式）。
   ============================================================ */
.ro-imagepair { display: block; }          /* 默认：不并排，两张图照旧上下排 */
@media (min-width: 1366px) {
  /* 1366 起才并排：再窄就真的看不清了（每栏 < 650px ⇒ scale < 0.86） */
  .ro-imagepair {
    display: grid;
    grid-template-columns: 1fr 1fr;        /* 各占一半，fit() 按每栏实测宽度缩放 */
    gap: 20px;
    align-items: start;
    margin-bottom: 20px;
  }
  /* 网格项默认 min-width:auto 会被 760px 的图撑破 → 显式归零 */
  .ro-imagepair > .ro-imagewrap { min-width: 0; margin-bottom: 0; }
  /* 并排时不留出「横向滑动」的余地：宽度已经由 fit() 精确适配 */
  .ro-imagepair > .ro-imagewrap { overflow-x: hidden; }
}

/* ============================================================
   【点击放大】鼠标光标提示
   ------------------------------------------------------------
   用户原话：「双色球推的图一边一个 可以单独点开图片变大」
   用户原话：「图片点击可以放大 就是放大一张完成的图弹出来 在点击就变小
             不需要有个放大镜图标」
   → 【放大镜图标已删除】。只留下  这个纯光标提示
     （不是图形/图标，页面上看不到任何放大镜）。
   ============================================================ */
.ro-imagewrap {  }

/* 【点击放大】CSS 已移除。 */
/* 【点击放大】CSS 已移除。 */
/* 【关闭按钮 × 的样式已删除】—— 现在遮罩里点任何地方都能关闭，
   不再需要右上角那个按钮。 */
.ro-lb-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 2;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
  text-align: center;
  font-size: 12px;
  color: #98a1b2;
  background: linear-gradient(180deg, rgba(6,8,12,0), rgba(6,8,12,0.9));
  pointer-events: none;
}

.ro-foot {
  text-align: center;
  padding: 30px 16px 50px;
  /* __BIG_DISCLAIMER__ 用户要求：字体大一点 */
  font-size: 14.5px;
  color: #6b7688;
  line-height: 2;
}

/* ---- 免责声明（页面最底部，独立区块）----
   低调但清晰可读：小字号 + 灰色系，跟暗色主题一致；
   不是弹窗 / 遮罩，不打断阅读。 */
.ro-disclaimer {
  max-width: 640px;
  margin: 0 auto 40px;
  padding: 16px 18px;
  background: #12151b;
  border: 1px solid #1e2430;
  border-radius: 10px;
  color: #9aa3b2;
  font-size: 14.5px;   /* 用户要求：字体大一点 */
  line-height: 1.95;
  text-align: left;
}
.ro-disclaimer h3 {
  /* __BIG_DISCLAIMER__ 用户要求：字体大一点 */
  font-size: 15.5px;
  font-weight: 700;
  color: #9aa3b2;
  letter-spacing: 2px;
  margin-bottom: 7px;
}
.ro-disclaimer p { margin: 0; }
.ro-disclaimer p + p { margin-top: 4px; }

/* ============================================================
   __CENTER_HEAD2__ 三个区块标题【强制居中】（用户第二次要求）
   ------------------------------------------------------------
   上一次加的规则被同文件里【后面】的 .ro-xysp-head / .ro-art-head
   原规则覆盖了（同优先级，后者胜）—— 所以这次：
     · 放在 CSS 靠后的位置（顺序靠后）
     · 加 !important（权重拉满）
   只影响这三个区块。
   ============================================================ */
.ro-xysp-head, .ro-art-head, .hit-embed .ro-gamehead {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  gap: 3px !important;
}
.ro-xysp-h2, .ro-art-title, .hit-embed .ro-gamehead h2 {
  text-align: center !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
.ro-xysp-sub, .ro-art-sub, .hit-embed .ro-gamehead .ro-meta {
  text-align: center !important;
  width: 100% !important;
  line-height: 1.5 !important;
}
/* 晒票栏右侧那个「展开 ▸」在纵向布局里要自己居中 */
.ro-xysp-arrow { margin: 4px auto 0 !important; }

/* __LATEST_CENTER__ 「最新开奖」标题也要居中。
   上一次我写的是 .hit-embed .ro-gamehead —— 但实际结构是
   <section class="ro-game" id="ro-latest"><div class="ro-gamehead">，
   【没有 .hit-embed 父级】，所以没匹配上。
   这里改成 #ro-latest .ro-gamehead，并把裸 .ro-gamehead 也带上兜底。 */
#ro-latest .ro-gamehead, .ro-gamehead {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  gap: 3px !important;
}
#ro-latest .ro-gamehead h2, .ro-gamehead h2 {
  text-align: center !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
  margin-bottom: 0 !important;
}
#ro-latest .ro-gamehead .ro-meta, .ro-gamehead .ro-meta {
  text-align: center !important;
  width: 100% !important;
  line-height: 1.5 !important;
}

/* 手机上：只收窄页面留白，
   【绝对不改图片内部布局】—— 图片靠 JS 等比缩放 */
@media (max-width: 600px) {
  .ro-wrap { padding: 8px 4px 40px; }
  .ro-top h1 { font-size: 21px; }
}

/* ============================================================
   【文章参考】区块样式（用户新增需求）
   ------------------------------------------------------------
   跟页面现有暗色风格一致（复用 #161a21 / #262d3a / #e8eaed 这套配色）。
   窄屏：一列一列竖着排（每个彩种一块）
   宽屏：自适应并排（容器最宽 820px → 最多 3 列，不挤）
   这里不碰任何图片相关选择器。
   ============================================================ */
.ro-articles {
  background: #12161d;
  border: 1px solid #1e2430;
  border-radius: 12px;
  padding: 15px 13px 13px;
  margin: 0 0 26px;
}
.ro-art-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 12px;
}
.ro-art-title {
  font-size: 17px;
  font-weight: 700;
  color: #e8eaed;
  letter-spacing: 2px;
}
.ro-art-sub { font-size: 11.5px; color: #6b7488; }

/* ============================================================
   __CENTER_HEAD__ 三个区块标题【居中】+ 去掉副标题重叠
   ------------------------------------------------------------
   用户要求：「居中」（截图圈了 晒票栏 / 最新开奖 / 文章参考）。
   原来的写法是 display:flex + align-items:baseline + flex-wrap:wrap，
   窄屏时副标题会被挤到标题同一行、甚至压在上面 —— 一并修掉。
   只影响这三个区块，别处不动。
   ============================================================ */
.ro-xysp-head, .ro-art-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 3px;
}
.ro-xysp-h2, .ro-art-title { text-align: center; }
.ro-xysp-sub, .ro-art-sub { text-align: center; line-height: 1.5; }

/* 「最新开奖」标题 —— 实际结构是 .hit-embed .ro-gamehead > h2 + .ro-meta
   （latest-draws.js 生成，本次不改它的生成逻辑，只用 CSS 摆正）
   原来 .ro-gamehead 是 flex + align-items:center + flex-wrap:wrap，
   窄屏会把 h2 和两行 meta 挤在一起、互相压住 —— 改成纵向居中排布。 */
.hit-embed .ro-gamehead {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 3px;
}
.hit-embed .ro-gamehead h2 { text-align: center; width: 100%; margin-bottom: 0; }
.hit-embed .ro-gamehead .ro-meta { text-align: center; line-height: 1.5; width: 100%; }

.ro-art-groups { display: grid; gap: 10px; grid-template-columns: 1fr; }
@media (min-width: 560px) {
  .ro-art-groups { grid-template-columns: repeat(auto-fit, minmax(226px, 1fr)); }
}

.ro-art-group {
  background: #161a21;
  border: 1px solid #262d3a;
  border-radius: 11px;
  padding: 10px 11px 8px;
  min-width: 0;
}
.ro-art-gname {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #c8cfda;
  padding-bottom: 6px;
  margin-bottom: 7px;
  border-bottom: 1px solid #212836;
}
.ro-art-gname i {
  font-style: normal;
  font-size: 10.5px;
  font-weight: 400;
  color: #5b6373;
}

.ro-art-list { list-style: none; margin: 0; padding: 0; }
.ro-art-list li { margin-bottom: 7px; }
.ro-art-list li:last-child { margin-bottom: 0; }
.ro-art-link {
  display: block;
  font-size: 12.5px;
  line-height: 1.45;
  color: #8fb8ff;
  text-decoration: none;
  word-break: break-word;
  -webkit-tap-highlight-color: transparent;
}
.ro-art-link:hover, .ro-art-link:active { color: #bcd4ff; text-decoration: underline; }
.ro-art-meta { margin-top: 1px; }
.ro-art-author { font-size: 10.5px; color: #5f6878; margin-right: 8px; }
.ro-art-date { font-size: 10.5px; color: #5f6878; }
.ro-art-empty { font-size: 12px; color: #6b7488; padding: 2px 0 3px; }

/* __GROUP_COL__ 分组可收起的样式（details/summary 原生折叠） */
.ro-art-group > summary.ro-art-gname {
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; list-style: none; user-select: none;
}
.ro-art-group > summary.ro-art-gname::-webkit-details-marker { display: none; }
.ro-art-group > summary.ro-art-gname::marker { content: ''; }
.ro-art-tip { margin-left: auto; font-size: 11px; font-weight: 400; color: #8fb8ff; opacity: .85; }
.ro-art-group[open] > summary.ro-art-gname .ro-art-tip::after { content: '点击收起'; }
.ro-art-group:not([open]) > summary.ro-art-gname .ro-art-tip::after { content: '点击查看'; }
.ro-art-group:not([open]) > summary.ro-art-gname { margin-bottom: 0; }

/* —— 文章参考 · 正文（点标题原地展开阅读）——
   用户原话：「微信把 yiqicai.com 拉黑了，点链接跳过去打不开
             → 要把正文抓到我们页面上」。
   默认全部收起：正文 display:none，只有 [data-ro-art] 那一块被 .ro-art-item.ro-art-open
   命中才显示。展开/收起由页尾那一小段脚本切 class，不刷新、不跳转。
   正文用纯文本段落，行高 1.8、字号 14.5px，跟页面暗色风格一致。 */
.ro-art-body {
  display: none;
  margin: 7px 0 3px;
  padding: 9px 10px 7px;
  background: #12161d;
  border-left: 2px solid #2f80ed;
  border-radius: 0 8px 8px 0;
}
.ro-art-item.ro-art-open .ro-art-body { display: block; }
.ro-art-p {
  margin: 0 0 9px;
  font-size: 14.5px;
  line-height: 1.8;
  color: #d5dae3;
  word-break: break-word;
}
.ro-art-p:last-of-type { margin-bottom: 4px; }
.ro-art-img { margin: 0 0 9px; }
.ro-art-body img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 7px;
  background: #1b2029;
}
.ro-art-note {
  margin: 6px 0 0;
  font-size: 10.5px;
  color: #5b6373;
  border-top: 1px solid #212836;
  padding-top: 5px;
}
/* 没抓到正文的那一篇：标题照样能点（点开只是没有内容），
   给个淡一点的颜色，不误导成「点了有正文」。 */
.ro-art-item.ro-art-nobody .ro-art-link { color: #7d8797; }

/* ============================================================
   【晒票栏】区块样式（用户新增需求）
   ------------------------------------------------------------
   位置：紧跟【推荐图目录】(.ro-imgtoc-wrap) 之后。
   配色沿用页面现有暗色那套（#12161d / #161a21 / #262d3a / #e8eaed）。
   内容：展开后 = 一排彩种筛选 + 晒票图片网格（图片是图床外链）。
   【默认收起】用户原话：「晒票栏可以收起来要自动点」
     用原生 <details>/<summary>，折叠本身一行 JS 都不写：
       · <summary> = 标题那一行，点一下展开、再点收起（原生行为）
       · 默认三角用 list-style + ::-webkit-details-marker 去掉，
         换成右侧的纯 CSS 文字提示（展开 ▸ / 收起 ▾），随 [open] 变
       · <summary> 不是按钮标签 → 页面不变量「按钮标签数 = 0」不受影响
   列数：手机 2 列；>=620px 4 列。
   这里不碰任何已有图片选择器（ro-imagewrap / ro-imagepair / ro-mob-view）——
   点图放大走的就是页尾已有的 ro-mob-view 全屏层。
   ============================================================ */
.ro-xysp {
  background: #12161d;
  border: 1px solid #1e2430;
  border-radius: 12px;
  padding: 15px 13px 13px;
  margin: 0 0 26px;
}
/* 标题那一行就是 <summary>：整条都能点 */
/* ============================================================
   __MINI_CARD__ 缩小版横排卡片（用户要求：只改【晒票】和【GPT模型摇号】这两块）
   ------------------------------------------------------------
   用户原话：「区块标题改成缩小版卡片样式」，并选了方案 C：
     · 只改 .ro-xysp（晒票）和 .ro-aipick（GPT模型摇号）两个区块的 <summary>
     · 其它区块（最新开奖 / 文章参考 / 开机号 / 热力图 / 推荐图目录 / 竞彩页）
       【保持原来的纵向居中】，一个都不动
   样式：
     左：标题（15~16px 粗体）+ 副标题（11px 灰，单行省略号）
     右：「点击查看 / 点击收起」胶囊（12px，描边圆角）
   ⚠️ 颜色全用页面的变量（--ro-card / --ro-line / --ro-fg / --ro-ok），
      这样浅色主题那段覆盖会自动生效 —— 不要再写死颜色，否则浅色下会花。
   ⚠️ 「点击查看/点击收起」仍然是 CSS 伪元素按 [open] 切换（机制没变），
      标签仍然是 <summary>（不是裸 button）。
   ============================================================ */
.ro-xysp > .ro-xysp-head,
.ro-aipick > .ro-aipick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--ro-card);
  border: 1px solid var(--ro-line);
  border-radius: 10px;
}
/* 晒票稍微突出一点（用户要求 primary 那种感觉） */
.ro-xysp > .ro-xysp-head {
  background: var(--ro-card);
  border-color: var(--ro-line);
}
/* 左边的标题+副标题竖排；副标题单行省略 */
.ro-xysp > .ro-xysp-head .ro-xysp-h2,
.ro-aipick > .ro-aipick-head .ro-aipick-h2 { font-size: 16px; letter-spacing: .5px; }
.ro-xysp > .ro-xysp-head .ro-xysp-sub,
.ro-aipick > .ro-aipick-head .ro-aipick-sub {
  font-size: 11px;
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 62vw;
}
/* 右侧胶囊：复用原来的 .ro-xysp-arrow / .ro-aipick-arrow（伪元素按 [open] 换字） */
.ro-xysp > .ro-xysp-head .ro-xysp-arrow,
.ro-aipick > .ro-aipick-head .ro-aipick-arrow {
  margin: 0 !important;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--ro-ok);
  border: 1px solid var(--ro-ok);
  border-radius: 14px;
  padding: 5px 10px;
  white-space: nowrap;
}
.ro-xysp > .ro-xysp-head .ro-xysp-arrow::after,
.ro-aipick > .ro-aipick-head .ro-aipick-arrow::after { content: ''; }

.ro-xysp-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  cursor: pointer;
  list-style: none;                 /* 去掉默认三角（标准写法） */
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.ro-xysp-head::-webkit-details-marker { display: none; }   /* 去掉默认三角（WebKit） */
.ro-xysp-head:hover .ro-xysp-h2, .ro-xysp-head:active .ro-xysp-h2 { color: #fff; }
.ro-xysp-head:focus-visible { outline: 2px solid #3a5a9c; outline-offset: 2px; border-radius: 6px; }

.ro-xysp-h2 {
  font-size: 17px;
  font-weight: 700;
  color: #e8eaed;
  letter-spacing: 2px;
}
.ro-xysp-sub { font-size: 11.5px; color: #6b7488; }

/* 右侧提示：文字 + 箭头都由 CSS 按 [open] 切换，不需要 JS */
.ro-xysp-arrow {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 600;
  color: #8fb8ff;
  white-space: nowrap;
}
.ro-xysp-arrow::before { content: '展开'; }
.ro-xysp-arrow::after { content: ' ▸'; }
.ro-xysp[open] .ro-xysp-arrow::before { content: '收起'; }
.ro-xysp[open] .ro-xysp-arrow::after { content: ' ▾'; }

/* 删掉上一版的「纯文字彩种格子」样式（.ro-xysp-grid / .ro-xysp-cell）——
   那一版是「点格子跳到源站晒票页」，已被用户否掉；
   现在展开后是下面的筛选条 + 图片网格。 */

/* ---- 晒票图片：筛选条 + 图片网格 + 卡片 ----
   用户要求：直接在页面里看晒票图（不跳转）、点图能放大看清号码。
   图片是【外链】（图床没有防盗链），所以这里只有排版样式，
   页面里不存图片本体。 */
.ro-xysp-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}
.ro-xysp-tab {
  flex: 0 0 auto;
  padding: 6px 11px;
  border: 1px solid #2a323f;
  border-radius: 999px;
  background: #161a21;
  color: #c8cfda;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.ro-xysp-tab:hover, .ro-xysp-tab:active { border-color: #3d5a86; color: #cfe0ff; }
.ro-xysp-tab.on { background: #1c2530; border-color: #3d5a86; color: #8fb8ff; }

/* 手机 2 列；宽屏 4 列（用户点名的排法） */
.ro-xysp-pics {
  display: grid;
  gap: 9px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 11px;
}
@media (min-width: 620px) {
  .ro-xysp-pics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

/* 被筛掉的卡片：脚本给它加 hidden 属性。
   ⚠️ 必须显式写 display:none —— 下面 .ro-xysp-pic 用了 display:block，
   会盖掉浏览器对 hidden 的默认隐藏，不加这条筛选就没效果。 */
.ro-xysp-pic[hidden] { display: none !important; }

.ro-xysp-pic {
  display: block;
  background: #161a21;
  border: 1px solid #2a323f;
  border-radius: 10px;
  overflow: hidden;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: border-color .15s;
}
.ro-xysp-pic:hover, .ro-xysp-pic:active { border-color: #3d5a86; }

/* 缩略图：宽度铺满卡片、高度按原比例（票是长条，不裁切才看得到全貌）
   ⚠️ 占位底色原来是 #0f1218（深色主题遗留）。晒票图是【外部链接】（头条签名外链），
      加载中 / 某张挂了，米杏页面上就露一块黑 —— 线上实测 310 张全是黑底。
      改成米杏的沉底 --ro-sunken：加载中是米杏块，挂了也只是空一块，不刺眼。
      （用户 2026-10-17 决定：「改成米杏底色」） */
.ro-xysp-thumb {
  display: block;
  width: 100%;
  height: auto;
  min-height: 60px;
  background: var(--ro-sunken);
}

.ro-xysp-cap { display: block; padding: 5px 7px 6px; }
.ro-xysp-cap b { display: block; font-size: 11.5px; font-weight: 700; color: #8fb8ff; }
.ro-xysp-cap i {
  margin-top: 2px;
  font-style: normal;
  font-size: 10.5px;
  line-height: 1.35;
  color: #7a8394;
  word-break: break-word;
  /* 描述最多两行，卡片才不会被拉得高矮不齐 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ro-xysp-empty { margin-top: 12px; font-size: 12px; color: #6b7488; }
.ro-xysp-note { margin-top: 10px; font-size: 10.5px; color: #5f6878; }

/* ============================================================
   【ai选号】可折叠面板（位置：晒票栏下面、最新开奖上面）
   ------------------------------------------------------------
   用户原话：「晒票栏下面装一个机选的 可以操作随机机选各种彩票
             复式单式都可以机选 模拟选号 有个折叠小窗口 写上标题：ai选号」
   形态：<details> 默认收起（不带 open 属性），标题行就是 <summary>。
   交互：面板内部只有 <a role="button"> 和数字输入框（type=number），
         没有 button 标签（页面不变量「按钮标签数 = 0」）。
   成本：纯前端 Math.random()，不联网、不调 AI、不写任何存储。
   ⚠️ 这里没有任何图片 → 图位数量（data-image）不受影响。
   ============================================================ */
.ro-aipick {
  background: #12161d;
  border: 1px solid #1e2430;
  border-radius: 12px;
  padding: 15px 13px 13px;
  margin: 0 0 26px;
}
/* 标题那一行就是 <summary>：整条都能点 */
.ro-aipick-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  cursor: pointer;
  list-style: none;                 /* 去掉默认三角（标准写法） */
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.ro-aipick-head::-webkit-details-marker { display: none; }
.ro-aipick-head:hover .ro-aipick-h2, .ro-aipick-head:active .ro-aipick-h2 { color: #fff; }
.ro-aipick-head:focus-visible { outline: 2px solid #3a5a9c; outline-offset: 2px; border-radius: 6px; }
.ro-aipick-h2 {
  font-size: 17px;
  font-weight: 700;
  color: #e8eaed;
  letter-spacing: 2px;
}
.ro-aipick-sub { font-size: 11.5px; color: #6b7488; }
/* 右侧提示：文字 + 箭头都由 CSS 按 [open] 切换，不需要 JS */
.ro-aipick-arrow {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 600;
  color: #8fb8ff;
  white-space: nowrap;
}
.ro-aipick-arrow::before { content: '点击查看'; }
.ro-aipick-arrow::after { content: ' ▸'; }
.ro-aipick[open] .ro-aipick-arrow::before { content: '点击收起'; }
.ro-aipick[open] .ro-aipick-arrow::after { content: ' ▾'; }

.ro-aipick-body { margin-top: 12px; }
.ro-aipick [hidden] { display: none !important; }
.ro-aipick-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 9px;
}
.ro-aipick-lbl { flex: 0 0 auto; width: 34px; font-size: 12px; color: #8b93a1; }
.ro-aipick-tabs, .ro-aipick-kl8 { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
/* 【用户要求】「选号」「方式」两行里的选项按钮拉开一点间距（原来 7px 挤在一起）：
   gap 7 → 12px，按钮左右内边距 11 → 15px（手机上也好点）。只动间距，别的一律不变。 */
.ro-aipick-line-src .ro-aipick-tabs,
.ro-aipick-line-mode .ro-aipick-tabs { gap: 12px; }
.ro-aipick-line-src .ro-aipick-srcbtn,
.ro-aipick-line-mode .ro-aipick-segbtn { padding-left: 15px; padding-right: 15px; }
.ro-aipick-tab, .ro-aipick-kl8tab, .ro-aipick-segbtn, .ro-aipick-btn {
  flex: 0 0 auto;
  padding: 6px 11px;
  border: 1px solid #2a323f;
  border-radius: 999px;
  background: #161a21;
  color: #b9c2d0;
  font-size: 12px;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.ro-aipick-tab:hover, .ro-aipick-kl8tab:hover,
.ro-aipick-segbtn:hover, .ro-aipick-btn:hover { border-color: #3d5a86; color: #cfe0ff; }
.ro-aipick-tab.on, .ro-aipick-kl8tab.on, .ro-aipick-segbtn.on {
  background: #1c2530;
  border-color: #3d5a86;
  color: #8fb8ff;
}
.ro-aipick-in {
  width: 58px;
  padding: 5px 7px;
  border: 1px solid #2a323f;
  border-radius: 8px;
  background: #0f1218;
  color: #e8eaed;
  font-size: 12.5px;
  text-align: center;
}
.ro-aipick-in:focus { outline: none; border-color: #3d5a86; }
.ro-aipick-unit { font-size: 11.5px; color: #6b7488; }
.ro-aipick-mwrap { display: inline-flex; align-items: center; gap: 4px; margin-right: 12px; }
.ro-aipick-rule { margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: #7a8394; }
.ro-aipick-sum { margin-left: auto; font-size: 11.5px; color: #8fb8ff; }
.ro-aipick-warn { margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: #f0b429; }
.ro-aipick-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.ro-aipick-btn { padding: 7px 14px; border-radius: 9px; font-size: 12.5px; font-weight: 600; }
.ro-aipick-btn.on { background: #1d2a3d; border-color: #3d5a86; color: #cfe0ff; }
.ro-aipick-btn.ghost { background: #14181f; color: #8b93a1; }
.ro-aipick-out { margin-top: 12px; border-top: 1px solid #1e2430; padding-top: 10px; }
.ro-aipick-empty { font-size: 11.5px; color: #6b7488; }
.ro-aipick-sumline { margin-bottom: 8px; font-size: 11.5px; color: #8fb8ff; }
.ro-aipick-hit { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; margin: 0 0 6px; }
.ro-aipick-idx { flex: 0 0 auto; width: 44px; font-size: 10.5px; color: #5f6878; }
.ro-aipick-ball {
  display: inline-block;
  min-width: 22px;
  padding: 1px 4px;
  border-radius: 6px;
  background: #2a1c1f;
  color: #ff8b8b;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.ro-aipick-ball.blue { background: #16233a; color: #8fb8ff; }
.ro-aipick-sep { padding: 0 1px; font-size: 12px; color: #5f6878; }
/* 【数字彩·位置分隔】一条号码里，百位/十位/个位 各自的号用一个小点隔开
   （用户 2026-10-17：摇号一次只出一条，各位有几个号就画几个 —— 位置必须能分得清） */
.ro-aipick-possep { padding: 0 4px; font-size: 12px; color: #a2937c; }
.ro-aipick-more { margin-top: 6px; font-size: 11px; color: #5f6878; }
.ro-aipick-note { margin-top: 10px; font-size: 10.5px; line-height: 1.6; color: #5f6878; }

/* ---- 自己选号：号码格子（点一下选中，再点一下取消） ---- */
.ro-aipick-self { margin-top: 10px; }
.ro-aipick-pblock { margin-top: 11px; }
.ro-aipick-pblock:first-child { margin-top: 0; }
.ro-aipick-phead { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.ro-aipick-plabel { font-size: 12px; color: #b9c2d0; }
.ro-aipick-pcount { font-size: 11px; color: #6b7488; }
.ro-aipick-pcount.full { color: #47e0a0; }
.ro-aipick-grid { display: flex; flex-wrap: wrap; gap: 5px; }
.ro-aipick-pick {
  flex: 0 0 auto;
  min-width: 26px;
  padding: 5px 0;
  border: 1px solid #2a323f;
  border-radius: 7px;
  background: #161a21;
  color: #b9c2d0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.ro-aipick-pick:hover, .ro-aipick-pick:active { border-color: #3d5a86; color: #cfe0ff; }
.ro-aipick-pick.on { background: #3a1d22; border-color: #a34a4a; color: #ff8b8b; font-weight: 700; }
.ro-aipick-pick.blue.on { background: #16233a; border-color: #3d5a86; color: #8fb8ff; }
.ro-aipick-selfnote { font-size: 10.5px; color: #5f6878; }
.ro-aipick-mineline { align-items: center; }
.ro-aipick-mineout { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px; }
.ro-aipick-ball.empty { background: #171b22; color: #4d5666; font-weight: 400; }
.ro-aipick-shape { margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: #8fb8ff; }

/* ============================================================
   __ANTISHOT__ 防截图锁定（用户给的升级版代码，适配到分享页）
   ------------------------------------------------------------
   用途（用户原话）：「就是只能我这个本机可以截屏，别人不能」。
   · html.locked → #article / #article-rest 模糊 + 灰度 + 不可点
   · 遮罩 #mask（z-index 99998）—— 【已按用户要求去掉水印层】
   · 豁免区 .ro-aipick 抬到 99999，locked 时仍然清晰、能点
   ⚠️ 遮罩设了 pointer-events:none：
      内容区本身已经 pointer-events:none（点不动），
      遮罩只负责视觉；这样锁定状态下还能滚到豁免面板去点。
   ⚠️ 这只能提高门槛，【不能真正禁止截图】—— 详见页尾脚本注释。
   ============================================================ */
#article, #article-rest { transition: filter .15s ease; position: relative; z-index: 1; }
html.locked #article, html.locked #article-rest {
  filter: blur(30px) grayscale(1);
  pointer-events: none;
}
#mask {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 99998;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 40px;
  background: rgba(0, 0, 0, .96);
  color: #fff;
  text-align: center;
  font-size: 20px;
  line-height: 1.8;
  pointer-events: none;              /* 见上面说明：让豁免面板还能点 */
}
html.locked #mask { display: flex; }
#mask .icon { margin-bottom: 20px; font-size: 64px; }
#mask .tip { margin-top: 16px; font-size: 14px; color: #aaa; }
/* 【已删除】原来这里有一层动态水印（整层 DOM + 样式 + 脚本）——
   用户明确说「不要水印」，已经整块拿掉，一点残留都不留。 */
/* 豁免区：locked 时抬到遮罩之上，保持清晰可点 */
html.locked .ro-aipick {
  filter: none !important;
  pointer-events: auto !important;
  position: relative;
  z-index: 99999 !important;
}
/* 全站禁止选中 / 长按菜单（面板里的输入框例外，否则不好用） */
body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
#ro-aipick input { -webkit-user-select: text; user-select: text; }
/* 管理员徽章（owner 才显示，用 <a href> 之外的元素 —— 不是按钮标签）
   ⚠️【2026-10-18 改：从 fixed 浮层改成 Tab 条下面的一行流内元素】
      原来是 position:fixed + top:10/right:10 + z-index:99999，
      实测正好压在 .top-tabs 的第二个 Tab「竞彩/足球」上（154×26 完全重叠），
      而它又是 pointer-events:none —— 点得到、看不见 → 本机看到的【只剩一个 Tab】。
      现在：不加 position、不加 z-index、不浮起来，就排在 Tab 条正下方、
      靠右对齐（width:max-content + margin-left:auto），谁也压不住、谁也压不住它。
      仍然只有 html.is-owner 才显示，别人的页面一个像素都不动。 */
#owner-badge {
  display: none;
  width: max-content;
  max-width: 100%;
  margin: 2px 0 2px auto;
  padding: 6px 12px;
  border: 1px solid #2f5c3a;
  border-radius: 999px;
  background: rgba(20, 40, 28, .92);
  color: #6ee7a0;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
}
html.is-owner #owner-badge { display: block; }
/* 打印也模糊（顺手加） */
@media print {
  #article, #article-rest { filter: blur(30px) grayscale(1) !important; }
  #mask { display: flex !important; }
}
/* ============================================================
   __NO_SAVE__ 资料图不允许任何人保存（右键另存 / 长按 / 拖拽 / 复制）
   ------------------------------------------------------------
   推荐图是 canvas 实时渲染的（本来就没有图片 URL），但还要堵：
     · iOS 长按菜单      → -webkit-touch-callout: none
     · 拖拽出去          → -webkit-user-drag: none
     · 右键另存 / 复制   → 页尾防截图脚本里 preventDefault（见 allowedTarget 白名单）
   ⚠️ 为什么不给 canvas 加 pointer-events:none：
      那样会连带影响「点图放大」这类点击；而且推荐图在页面里的入口是
      手机目录格子（.ro-toc-cell），图片本身没有任何点击绑定，
      所以只要拦事件 + 关长按菜单就够了，不必盖透明层。
   ⚠️ 只作用于 #article / #article-rest（资料区）；
      全屏层（body 直下）和豁免区（晒票 / GPT模型摇号）不受影响 ——
      晒票和摇号出的图是要能保存的。
   ============================================================ */
#article .ro-imagewrap canvas, #article-rest .ro-imagewrap canvas,
#article .ro-imagewrap img, #article-rest .ro-imagewrap img {
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  user-select: none;
  -webkit-user-select: none;
}

/* ============================================================
   【面板美化】用户要求「模板好看一点」（只改视觉：颜色 / 间距 / 圆角 /
   层次 / 字重 / 选中态；功能、文字、行为一个都没变）
   ------------------------------------------------------------
   放在面板基础样式【之后】—— 同优先级时后者胜；
   标题居中那一段带 !important，仍然由它说了算（顺序不影响）。
   分段控件 / 号码格子 / 预览卡片 / 按钮，四块统一到一套视觉语言。
   ============================================================ */
.ro-aipick {
  background: linear-gradient(180deg, #131822, #10141b);
  border: 1px solid #232b38;
  border-radius: 14px;
  padding: 16px 14px 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .25);
}
.ro-aipick-h2 { font-size: 18px; font-weight: 800; color: #eef2f8; letter-spacing: 2px; }
.ro-aipick-sub { letter-spacing: .4px; }
.ro-aipick-body { margin-top: 14px; }
.ro-aipick-line { gap: 8px; margin-top: 11px; }
.ro-aipick-lbl {
  width: 38px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: .5px;
  color: #9aa6b8;
}
/* ① 分段控件：选号（机选 / 自己选号）、方式（单式 / 复式） */
.ro-aipick-seg {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  background: #0c1016;
  border: 1px solid #232b38;
  border-radius: 999px;
}
.ro-aipick-seg .ro-aipick-srcbtn,
.ro-aipick-seg .ro-aipick-segbtn {
  padding: 6px 18px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-weight: 700;
}
.ro-aipick-seg .on {
  background: linear-gradient(180deg, #3d7bfa, #2b5fd9);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), 0 2px 10px rgba(61, 123, 250, .35);
}
/* ② 彩种 / 玩法胶囊：选中 = 主题蓝实心 + 微光 */
.ro-aipick-tab, .ro-aipick-kl8tab, .ro-aipick-srcbtn, .ro-aipick-segbtn, .ro-aipick-btn {
  padding: 7px 13px;
  font-size: 12.5px;
  font-weight: 600;
  background: #151a22;
}
.ro-aipick-tab.on, .ro-aipick-kl8tab.on {
  background: linear-gradient(180deg, #3d7bfa, #2b5fd9);
  border-color: transparent;
  color: #fff;
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), 0 2px 10px rgba(61, 123, 250, .35);
}
/* ③ 号码格子：grid + minmax（窄屏也不会溢出），格子更大更好点 */
.ro-aipick-pblock { margin-top: 14px; }
.ro-aipick-phead { margin-bottom: 8px; }
.ro-aipick-plabel { font-size: 12px; font-weight: 700; letter-spacing: .4px; color: #c3ccda; }
.ro-aipick-pcount { font-size: 11px; }
.ro-aipick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
  gap: 6px;
}
.ro-aipick-pick {
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 0;
  min-height: 34px;
  padding: 0;
  border: 1px solid #262f3d;
  border-radius: 9px;
  background: #141a23;
  color: #c3ccda;
  font-size: 13.5px;
  font-weight: 600;
}
.ro-aipick-pick:active { transform: translateY(1px); }
.ro-aipick-pick.on {
  border-color: transparent;
  background: linear-gradient(180deg, #e2564f, #c03a34);   /* 红球区：红 */
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .2), 0 2px 10px rgba(226, 86, 79, .35);
}
.ro-aipick-pick.blue.on {
  background: linear-gradient(180deg, #3d7bfa, #2b5fd9);   /* 蓝球 / 后区 / 特别位：主题蓝 */
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .2), 0 2px 10px rgba(61, 123, 250, .35);
}
/* ④ 按钮：主操作实心，次操作描边 */
.ro-aipick-acts { gap: 8px; margin-top: 14px; }
.ro-aipick-btn { padding: 8px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; }
.ro-aipick-btn.on {
  background: linear-gradient(180deg, #3d7bfa, #2b5fd9);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 2px 10px rgba(61, 123, 250, .3);
}
.ro-aipick-btn.ghost { background: #151a22; }
/* ⑤ 号码预览卡片（自己选号）：注数 / 金额大字 */
.ro-aipick-card {
  margin-top: 12px;
  padding: 12px;
  background: #0c1016;
  border: 1px solid #1e2430;
  border-radius: 12px;
}
.ro-aipick-mineline { margin-top: 0; }
.ro-aipick-mineout { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 5px; min-height: 26px; }
.ro-aipick-ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
}
.ro-aipick-ball.empty { height: 26px; font-weight: 500; }
.ro-aipick-calc { margin-top: 10px; }
.ro-aipick-calc-line { font-size: 13px; color: #8b93a1; }
.ro-aipick-calc-num { margin-right: 6px; font-size: 17px; font-weight: 800; color: #8fb8ff; }
.ro-aipick-calc-money { margin: 0 6px; font-size: 17px; font-weight: 800; color: #47e0a0; }
.ro-aipick-calc-sep { font-size: 12px; color: #5f6878; }
.ro-aipick-calc-tip { margin-top: 6px; font-size: 11px; color: #f0b429; }
/* ⑥ 结果区也做成卡片 */
.ro-aipick-out {
  margin-top: 14px;
  padding: 12px;
  background: #0c1016;
  border: 1px solid #1e2430;
  border-top: 1px solid #1e2430;
  border-radius: 12px;
}
.ro-aipick-hit { gap: 4px; margin: 0 0 7px; }
.ro-aipick-idx { min-width: 44px; }
.ro-aipick-shape { margin-top: 10px; }
.ro-aipick-selfnote { font-size: 10.5px; color: #6b7488; }

/* ============================================================
   __CENTER_HEAD_AI__ ai选号 标题行【强制居中】（用户配截图要求「字体居中」）
   ------------------------------------------------------------
   写法照抄上面「三个区块标题强制居中」那一套（用户要求「别自创」）：
   纵向排列 + 居中 + 全程 !important。
   为什么必须 !important：本段上面的 .ro-aipick-head 自己写了
   align-items: baseline / flex-wrap: wrap、.ro-aipick-arrow 写了 margin-left: auto，
   不加 !important 会被它们按同优先级盖掉（这个坑用户已经踩过好几次）。
   只影响 ai选号 这一个区块，别处不动。
   ============================================================ */
.ro-aipick-head {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  gap: 3px !important;
}
.ro-aipick-h2 {
  text-align: center !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
.ro-aipick-sub {
  text-align: center !important;
  width: 100% !important;
  line-height: 1.5 !important;
}
/* 「点击查看 ▸ / 点击收起 ▾」在纵向布局里要自己居中（切换逻辑不变，只挪位置） */
.ro-aipick-arrow { margin: 4px auto 0 !important; }

/* ============================================================
   【开机号】工具栏入口 + 可展开区块（原来并排的第二格已换成热力图折叠卡）
   ------------------------------------------------------------
   平时隐藏（:target 命中才显示），不点就跟没有一样 ——
   「最新开奖」的位置一点都不动，也不占版面。
   老浏览器（不认识 @supports selector()）会跳过整段 → 两个区块直接显示，
   入口链接照样能跳到它们，功能不丢。
   ============================================================ */
.ro-tools { display: flex; gap: 10px; margin: 0 0 22px; }
.ro-tool {
  flex: 1 1 0;
  min-width: 0;
  display: block;
  padding: 11px 12px;
  text-align: center;
  text-decoration: none;
  border: 1px solid #2a323f;
  border-radius: 12px;
  background: linear-gradient(180deg, #1b212b, #161a21);
  -webkit-tap-highlight-color: transparent;
}
.ro-tool b {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: #e8eaed;
  letter-spacing: 1px;
}
.ro-tool em {
  display: block;
  margin-top: 3px;
  font-style: normal;
  font-size: 10.5px;
  color: #7a8394;
}
.ro-tool:hover, .ro-tool:active { border-color: #3a465c; }
.ro-tool-kjh b { color: #ffd479; }

.ro-panel {
  background: #161a21;
  border: 1px solid #2a323f;
  border-radius: 12px;
  padding: 14px 14px 12px;
  margin: 0 0 22px;
}
.ro-panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 10px;
}
.ro-panel-title { font-size: 16px; font-weight: 700; color: #e8eaed; letter-spacing: 1px; }
.ro-panel-sub { font-size: 11px; color: #6b7488; }
.ro-panel-none { font-size: 12px; color: #6b7488; padding: 2px 0 3px; }

/* ---- 开机号 ---- */
.ro-kjh-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 620px) {
  .ro-kjh-grid { grid-template-columns: 1fr; }
}
.ro-kjh-item {
  background: #11151b;
  border: 1px solid #232b37;
  border-radius: 10px;
  padding: 9px 10px 8px;
}
.ro-kjh-top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.ro-kjh-name { font-size: 13.5px; font-weight: 700; color: #e8eaed; }
.ro-kjh-issue { font-size: 11px; color: #7a8394; }
.ro-kjh-nums { display: flex; flex-wrap: wrap; gap: 5px; }
/* 号码小球：和「最新开奖」一个口径，红球红、蓝球蓝（数字彩没有蓝球） */
.ro-kjh-ball {
  min-width: 25px;
  height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border-radius: 50%;
  font-size: 11.5px;
  font-weight: 700;
  color: #fff;
  font-family: Arial, sans-serif;
  background: linear-gradient(180deg, #f0575c, #d32f34);
}
.ro-kjh-ball.is-blue { background: linear-gradient(180deg, #4a83f5, #2158c4); }
.ro-kjh-extra { margin-top: 6px; font-size: 10.5px; color: #7a8394; }
.ro-kjh-time { margin-top: 3px; font-size: 10.5px; color: #5f6878; }
.ro-kjh-none { font-size: 12px; color: #6b7488; }

/* ---- 【热力图】折叠卡（<details>，和「走势图」同一套机制；默认收起）----
   2026-10-18 用户：「就是这里替换成热力图」「点击可以收起展开 展开就是热力图」
   ⚠️ 类名【不用 .ro-panel】—— .ro-panel 是「默认 display:none，JS 加 .ro-open 才显示」
      的那套老机制；这里靠 <details> 自己的 [open] 状态，CSS 只负责长相。
   ⚠️ 颜色全部走 --ro-* 变量：米杏色主题换色时这一块自动跟着变。 */
.ro-heat {
  background: var(--ro-card);
  border: 1px solid var(--ro-line);
  border-radius: 12px;
  padding: 12px 14px;
  margin: 0 0 22px;
}
.ro-heat > .ro-heat-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 10px;
  cursor: pointer;
  list-style: none;
}
.ro-heat > .ro-heat-head::-webkit-details-marker { display: none; }
.ro-heat > .ro-heat-head::marker { content: ''; }
.ro-heat-title { font-size: 16px; font-weight: 700; color: var(--ro-fg); letter-spacing: 1px; }
.ro-heat-sub { font-size: 11px; color: var(--ro-fg2); }
.ro-heat-arrow {
  flex: 0 0 100%;
  width: 100%;
  text-align: center;
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--ro-fg3);
}
.ro-heat-arrow::before { content: '点击查看'; }
.ro-heat-arrow::after { content: ' ▾'; }
.ro-heat[open] > .ro-heat-head .ro-heat-arrow::before { content: '点击收起'; }
.ro-heat[open] > .ro-heat-head .ro-heat-arrow::after { content: ' ▴'; }
.ro-heat-body { padding: 12px 0 2px; }
.ro-heat .ro-hm-block { margin: 0 0 14px; }
.ro-heat .ro-hm-block:last-child { margin-bottom: 0; }
.ro-heat .ro-hm-block[hidden], .ro-heat .ro-hm-none[hidden] { display: none !important; }
.ro-heat .ro-hm-none { font-size: 12px; color: var(--ro-fg3); padding: 2px 0 6px; }
.ro-hm-head { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 0 0 6px; font-size: 12px; color: #4a3a26; }
.ro-hm-head b { font-size: 13px; }
.ro-hm-head span { font-size: 11px; color: #8a7a63; }
/* 【手机窄屏】图块标题那行「双色球 实票统计」+「口径 · 日期」挤在一行会
   把「统计」两个字折成两行（实测 375px 就这样）→ 窄屏改成上下两行：
   第一行只放彩种名（不折行），第二行放口径说明。 */
@media (max-width: 560px) {
  .ro-heat .ro-hm-head { flex-wrap: wrap; row-gap: 2px; }
  .ro-heat .ro-hm-head b { white-space: nowrap; }
  .ro-heat .ro-hm-head span { flex: 1 1 100%; width: 100%; }
}

/* 只有认识 :target 的浏览器才隐藏；不认识的（老内核）保持常显，功能不丢 */
@supports selector(:target) {
  .ro-panel { display: none; }
}
/* 【展开规则】由 JS 加 .ro-open 类控制（不依赖 :target）。
   ⚠️ 这条必须存在，否则区块永远打不开 —— 之前误把它写进了 JS 注释里。
   放在 @supports 外面：即使浏览器不认识 :target，点一下也能展开。 */
.ro-panel.ro-open { display: block; }

/* ============================================================
   __COLOR_UNIFY__ 配色统一（用户要求「网页颜色 色系帮我协调一点」）
   ------------------------------------------------------------
   只改【颜色】，结构 / 文字 / 功能 / 交互一个都不动。
   做法：整套色板收成「一个主色 + 一个强调色 + 三级灰」，
   「同一语义 = 同一个值」，层次靠亮度差，不靠色相差。
   ⚠️ 这一段放在样式表【最后】：同优先级时后者胜，不用堆 !important。
   色板：
     页面底 #0f1115 · 卡片底 #161a21 · 内嵌底 #12151d
     边框 常规 #262d3a · 轻微 #1e2430
     主文字 #e8eaed · 次文字 #98a1b2 · 弱文字 #6b7488
     主色（绿）#47e0a0 · 强调色（蓝）#6ea8fe
     警示 红 #f0575c · 注意 黄 #f0b429 · 时间（倒计时）金 #e8c877
   ============================================================ */
:root {
  --ro-bg: #0f1115;
  --ro-card: #161a21;
  --ro-sunken: #12151d;
  --ro-line: #262d3a;
  --ro-line-soft: #1e2430;
  --ro-fg: #e8eaed;
  --ro-fg2: #98a1b2;
  --ro-fg3: #6b7488;
  --ro-ok: #47e0a0;
  --ro-link: #6ea8fe;
  --ro-warn: #f0b429;
  --ro-danger: #f0575c;
  --ro-time: #e8c877;
}
/* ---- 背景三层 ---- */
body, .ro-wrap { background: var(--ro-bg); }
.ro-status, .ro-xysp, .ro-aipick, .ro-panel, .ro-tool, .ro-imgtoc-wrap {
  background: var(--ro-card);
  border-color: var(--ro-line);
}
.ro-status.ok { background: rgba(71, 224, 160, .07); border-color: rgba(71, 224, 160, .3); }
.ro-status.warn { background: rgba(240, 180, 41, .08); border-color: rgba(240, 180, 41, .32); }
.ro-aipick-out, .ro-aipick-card, .ro-aipick-in, .ro-mob-view, .ro-kjh-item {
  background: var(--ro-sunken);
  border-color: var(--ro-line-soft);
}
.ro-xysp-tab, .ro-aipick-tab, .ro-aipick-kl8tab, .ro-aipick-srcbtn,
.ro-aipick-segbtn, .ro-aipick-btn, .ro-aipick-seg, .ro-aipick-pick {
  background: var(--ro-card);
  border-color: var(--ro-line);
}
.ro-aipick-seg { background: var(--ro-bg); }
.ro-xysp-pic { border-color: var(--ro-line-soft); }
/* ---- 文字三级灰（同语义同色） ---- */
.ro-xysp-h2, .ro-aipick-h2, .ro-art-title, .ro-imgtoc-title, .ro-panel-title,
.ro-gamehead h2, .ro-divider span, .ro-tool b, .ro-kjh-name, .ro-disclaimer h3,
.ro-status .ro-st-head { color: var(--ro-fg); }
.ro-art-body p { color: var(--ro-fg); }
.ro-xysp-sub, .ro-aipick-sub, .ro-art-sub, .ro-meta, .ro-imgtoc-sub, .ro-panel-sub,
.ro-tool em, .ro-kjh-nums, .ro-st-time, .ro-foot { color: var(--ro-fg2); }
.ro-xysp-note, .ro-aipick-note, .ro-aipick-selfnote, .ro-aipick-empty, .ro-aipick-more,
.ro-aipick-idx, .ro-aipick-calc-sep, .ro-disclaimer p, .ro-status .ro-st-reason,
.ro-status .ro-st-hint,
.ro-panel-none, .ro-kjh-issue, .ro-xysp-cap i, .ro-xysp-empty { color: var(--ro-fg3); }
/* ---- 主色（绿）/ 强调色（蓝）：只留这两种彩色 ---- */
.ro-status.ok .ro-st-head, .ro-aipick-pcount.full, .ro-aipick-calc-money { color: var(--ro-ok); }
.ro-aipick-kl8tab.on, .ro-aipick-tab.on { background: linear-gradient(180deg, #4ce3a6, #2fbe86); }
.ro-aipick-arrow,
.ro-aipick-sum, .ro-aipick-sumline, .ro-aipick-calc-num, .ro-aipick-plabel,
.ro-art-link { color: var(--ro-link); }
.ro-aipick-seg .on, .ro-aipick-btn.on, .ro-aipick-pick.blue.on {
  background: linear-gradient(180deg, #6ea8fe, #3f7ce8);
}
.ro-aipick-pick.on { background: linear-gradient(180deg, #f0575c, #cf3b40); }
.ro-aipick-ball { color: var(--ro-danger); }
.ro-aipick-ball.blue { color: var(--ro-link); }
.ro-aipick-pick.blue.on { border-color: transparent; }
/* 时间（倒计时）统一金色 —— 只给时间 */
#__NEXT_CD__, #__NEXT_CD2__, #__ART_CD__ { color: var(--ro-time) !important; }
/* 警示 */
.ro-aipick-warn, .ro-aipick-calc-tip { color: var(--ro-warn); }

/* ============================================================
   __TITLE_CENTER__ 页面主标题：去掉「推荐图」后缀 + 强制居中
   ------------------------------------------------------------
   用户原话：「不要推荐图了 就春风十里送大奖 居中」。
   可见文字只留「春风十里送大奖」；<title> 标签没动（那是分享卡片，
   另一个专人在管，现在是「春风彩票」，本来就没有「推荐图」）。
   ⚠️ 用 !important：这个页面的居中规则被后来的同优先级规则盖过好几次。
   ============================================================ */
.ro-top { text-align: center !important; }
.ro-top h1 {
  display: block !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
  text-align: center !important;
}
.ro-top .sub { width: 100% !important; text-align: center !important; }

/* ============================================================
   __LIGHT_THEME__ 整体浅色主题（一段覆盖，加在样式表【最后】）
   ------------------------------------------------------------
   用户原话：「整体换成浅色系主题 我要节约成本做」+ 明确要求
     「用一段 CSS 覆盖在样式表最后统一换色 —— 这是最省钱的路径」
   所以这里【不逐个区块改】，只在最后统一覆盖：
     ① 覆盖 :root 上的 --ro-* 变量（页面主体早就变量化了，改这里最省）
     ② 用属性选择器把【写死的颜色字面量】按映射表逐条替换
        （[style*="#0f1115"] 这种写法能一次覆盖所有硬编码点）
     ③ 少量需要特殊处理的（状态条、遮罩、canvas 容器）单独写
   ⚠️ canvas 出的图（推荐图 / 热力图 / 九转图）不动：
      那些颜色写死在 JS 的 fillStyle 里，改了要重做模板（成本高）。
      做法是给 canvas/图区套一个【深色容器】，让它在浅色页面上也看得清。
   ⚠️ 防截图遮罩保持深色（遮罩本来就该是黑的），不改。
   ============================================================ */
:root {
  /* 【米杏色暖色调】用户给的新配色（覆盖早先的"纯白"版本）。
     ⚠️ 用 CSS 变量 + 一段覆盖，这是最省成本的换色方式。
     ⚠️ 主文字是【深棕 #4a3a26】不是黑；卡片底比页面底【略亮一点点】。 */
  --ro-bg: #f7efe1;          /* 页面底：米杏色 */
  --ro-card: #fdf6ea;        /* 卡片：米杏色 */
  --ro-sunken: #f3e6d0;      /* 次级卡片 */
  --ro-line: #e8d7bd;        /* 边框 */
  --ro-line-soft: #efe2cc;
  --ro-fg: #4a3a26;          /* 主文字：深棕 */
  --ro-fg2: #8a7a63;         /* 副文字 */
  --ro-fg3: #a89madd;        /* 占位，下面会被覆盖（保持三档灰的语义） */
  --ro-ok: #1a8c5a;          /* 主色绿（和现在一致） */
  --ro-link: #1f5fd6;
  --ro-warn: #b8860b;
  --ro-danger: #c0392b;      /* 按钮红字 */
  --ro-time: #c0392b;        /* 倒计时红字 */
}
/* 第三档弱文字用暖灰（上面那行是笔误占位，这里给正确的值） */
:root { --ro-fg3: #a2937c; }
/* ---- 页面底 / 卡片底（米杏色三档） ---- */
html, body, .ro-wrap { background: #f7efe1 !important; color: #4a3a26; }
[style*="#0f1115"] { background-color: #f7efe1 !important; }
[style*="#161a21"] { background-color: #fdf6ea !important; }
[style*="#12151d"] { background-color: #f3e6d0 !important; }
[style*="#1a1f28"] { background-color: #fdf6ea !important; }
[style*="#161618"] { background-color: #fdf6ea !important; }
/* ---- 边框（暖色） ---- */
[style*="#262d3a"] { border-color: #e8d7bd !important; }
[style*="#1e2430"] { border-color: #efe2cc !important; }
[style*="#2b3444"] { border-color: #e0ccae !important; }
[style*="#2a323f"] { border-color: #e8d7bd !important; }
/* ---- 文字（深棕三级） ---- */
[style*="#e8eaed"] { color: #4a3a26 !important; }
[style*="#98a1b2"] { color: #8a7a63 !important; }
[style*="#6b7488"] { color: #a2937c !important; }
[style*="#5f6878"] { color: #b3a68f !important; }
[style*="#8b93a1"] { color: #8a7a63 !important; }
[style*="#c8cfda"] { color: #4a3a26 !important; }
/* ---- 主色 / 强调 ---- */
[style*="#47e0a0"] { color: #1a8c5a !important; }
[style*="#8fb8ff"] { color: #1f5fd6 !important; }
[style*="#6ea8fe"] { color: #1f5fd6 !important; }
[style*="#f0575c"] { color: #c0392b !important; }
[style*="#f0b429"] { color: #f5b301 !important; }
[style*="#e8c877"] { color: #c0392b !important; }
/* ---- 状态条（提示条：米黄底） ---- */
.ro-status.ok { background: #e8f6ef !important; border-color: #b7e4cd !important; }
.ro-status.ok .ro-st-head { color: #1a8c5a !important; }
.ro-status.warn { background: #fff6dd !important; border-color: #ffe08a !important; }
.ro-status.warn .ro-st-head { color: #7a5c00 !important; }
.ro-status .ro-st-time, .ro-status .ro-st-reason, .ro-status .ro-st-hint { color: #8a7a63 !important; }
/* ---- 卡片类统一米杏色 ---- */
.ro-status, .ro-xysp, .ro-aipick, .ro-panel, .ro-tool, .ro-imgtoc-wrap {
  background: #fdf6ea !important; border-color: #e8d7bd !important; color: #4a3a26;
}
.ro-aipick-out, .ro-aipick-card, .ro-aipick-in, .ro-kjh-item {
  background: #f3e6d0 !important; border-color: #efe2cc !important;
}
/* ⚠️ 【摇号面板输入框的字】.ro-aipick-in 自己的 color 还是暗色版的 #e8eaed，
   压在米杏底 #f3e6d0 上实测对比度只有 1.02（等于看不见字）；上面那套
   [style*="#e8eaed"] 改不到它 —— 那不是行内样式。而「选几个」现在是本面板的
   主输入框（红球 / 蓝球），所以按主题主文字补一条颜色：只加颜色，别的都不动。
   （.ro-aipick-in 只被 GPT模型摇号 面板用到，不牵连别的区块。） */
.ro-aipick-in { color: var(--ro-fg) !important; }
.ro-xysp-pic { background: #fdf6ea !important; border-color: #efe2cc !important; }
.ro-xysp-tab, .ro-aipick-tab, .ro-aipick-kl8tab, .ro-aipick-srcbtn,
.ro-aipick-segbtn, .ro-aipick-btn, .ro-aipick-seg, .ro-aipick-pick {
  background: #fdf6ea !important; border-color: #e8d7bd !important; color: #4a3a26;
}
.ro-xysp-tab.on, .ro-aipick-tab.on {
  background: #e8f6ef !important; border-color: #b7e4cd !important; color: #1a8c5a !important;
}
/* ⚠️ 全屏看图保持深色（看图背景，浅色反而刺眼；用户模板里 gallery 也是黑底）。
   ⚠️ 防截图遮罩保持深色（用户明确说"遮罩本来就该是黑的 ✅ 不用改"）。 */
.ro-mob-view { background: #0b0d11 !important; }
.ro-mob-tip, .ro-mob-err { color: #c8cfda !important; }
#mask { background: rgba(0, 0, 0, 0.96) !important; }

/* ============================================================
   __LAYOUT__ 推荐页布局（按用户给的设计）
   ------------------------------------------------------------
   页面顺序（模板里已经是这个，本轮没动结构）：
     Tab → 主标题 → 提示条 → 推荐图目录 → 开机号 → 热力图（折叠卡）
       → 晒票 → GPT模型摇号 → 开奖号码 → 文章参考
   这一整块【只加样式，不动功能】：倒计时 / 看图 / 折叠 / 展开 全部保留。
   ⚠️ 全部用变量色（--ro-*），米杏色主题自动生效。
   ⚠️ ⑥⑦ 晒票和 GPT 摇号从上一版的【横排】改回【居中单卡片】
      （用户最终要居中；上一版横排是我按更早的要求做的，这里改回）。
   ============================================================ */
/* ① 顶部 Tab —— 2026-10-18 修（两页必须一模一样，竞彩页同名规则同步改）：
   · 值对齐竞彩页：flex 1 1 0 / min-width:0 / white-space:nowrap /
     -webkit-tap-highlight-color:transparent。
     原来这里是 flex:1 + 没有 nowrap —— 窄屏＋系统大字号时「竞彩/足球」会折行，
     手机上点 Tab 还会闪一下系统高亮方块（竞彩页早就写过这两条，本页漏了）。
   · 高度锁定 = 12 + 19(14px 行盒) + 12 = 43px，和竞彩页完全一致
     （原来竞彩页 padding 10px/6px → 39px，两页来回切会跳 4px）。
   · .tab.on::after 改成 bottom:-1px：正好压住整条 Tab 的那条 1px 底线。
     原来 bottom:0，绿线底下还露出 1px 米色（4x 截图实测：绿 49–51px、米色 51–52px），
     看起来像「双线」，也让人以为非激活那句也有下划线。
   · 悬停/键盘焦点用主题色，不让浏览器默认黑框出现。 */
.top-tabs { display: flex; border-bottom: 1px solid var(--ro-line); margin-bottom: 2px; }
.top-tabs .tab { flex: 1 1 0; min-width: 0; text-align: center; padding: 12px 8px;
  font-size: 14px; font-weight: 600; color: var(--ro-fg2); text-decoration: none;
  position: relative; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
.top-tabs .tab.on { color: var(--ro-ok); font-weight: 700; }
.top-tabs .tab.on::after { content: ''; position: absolute; left: 20%; right: 20%;
  bottom: -1px; height: 2px; background: var(--ro-ok); border-radius: 2px; }
.tab:focus-visible { outline: 2px solid var(--ro-ok); outline-offset: -3px; border-radius: 6px; }
.tab:hover { color: var(--ro-fg); }
#owner-badge { font-size: 12px !important; color: var(--ro-ok) !important;
  background: #e3f2ea !important; border: 1px solid #b7e4cd !important;
  border-radius: 14px !important; padding: 4px 10px !important; }

/* ② 主标题：居中 · 22px · 800 · 绿 */
.ro-top { padding: 22px 12px 14px !important; }
.ro-top h1 { font-size: 22px !important; font-weight: 800 !important;
  color: var(--ro-ok) !important; letter-spacing: 1px; }
.ro-top .sub { font-size: 12px !important; color: var(--ro-fg2) !important; }

/* ③ 提示条：米黄底 + 暖边框 */
.ro-status { margin: 0 12px 16px !important; border-radius: 10px !important;
  padding: 12px 14px !important; font-size: 13px !important; line-height: 1.8; }
.ro-status .ro-st-head { font-size: 13px !important; }
.ro-status .ro-st-time { color: var(--ro-danger) !important; font-weight: 700; }

/* ④ 推荐图目录：2 列网格 · 卡片 · 红字
   ------------------------------------------------------------
   【本轮修正】用户给了这块的 CSS 规格（section-title / section-sub / grid / .btn 四段）。
   ⚠️ 注意：这段 CSS 是写在模板字符串里的，注释里【不能出现反引号】，
      否则外层模板会被提前截断 → "SyntaxError: Unexpected token ';'"（本次实测踩到）。
   对照实测发现两个缺口——根因是页面里有一条全局 reset（星号选择器 margin:0; padding:0）：
     · .ro-imgtoc-title 的 margin 从来没写过 → 被 reset 吃成 0
     · .ro-imgtoc-sub 的 margin-bottom 也没写过 → 也是 0
     结果标题 / 副标题 / 第一行卡片挤成一条（实测 title→sub 只有 3px）。
   现在按规格补上：6px 0 4px 和 14px（并显式写 color，和规格一致，不再只靠继承）。
   ⚠️ 只加/补这几条，不动其它布局；改完必须重跑不变量与截图。 */
.ro-imgtoc-wrap { background: transparent !important; border: 0 !important; padding: 0 !important; }
.ro-imgtoc-head { padding: 0 12px 0; }
.ro-imgtoc-title { text-align: center; font-size: 15px; font-weight: 700;
  color: var(--ro-fg); margin: 6px 0 4px; }
.ro-imgtoc-sub { text-align: center; font-size: 12px; color: var(--ro-fg2); margin-bottom: 14px; }
.ro-imgtoc { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 10px !important; padding: 0 12px 20px !important; width: auto !important; }
.ro-imgtoc tbody, .ro-imgtoc tr { display: contents !important; }
.ro-imgtoc td { display: block !important; padding: 0 !important; border: 0 !important; }
.ro-toc-cell { display: block !important; background: var(--ro-card) !important;
  border: 1px solid var(--ro-line) !important; border-radius: 10px !important;
  padding: 14px 8px !important; text-align: center !important; text-decoration: none !important;
  font-size: 14px !important; font-weight: 700 !important; color: var(--ro-danger) !important; }

/* ⑤ 开机号：工具栏里现在只剩它一格
      （auto-fit 而不是写死 2 列 —— 只有一格时自动铺满，不半边留空；
        以后再加格子回来也会自动变两列） */
.ro-tools { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)) !important;
  gap: 10px !important; padding: 0 12px 16px !important; }
.ro-tool { display: block !important; background: var(--ro-card) !important;
  border: 1px solid var(--ro-line) !important; border-radius: 10px !important;
  padding: 14px 8px !important; text-align: center !important; text-decoration: none !important; }
.ro-tool b { display: block; font-size: 14px; font-weight: 700; color: var(--ro-fg) !important; }
.ro-tool em { display: block; margin-top: 3px; font-style: normal;
  font-size: 11px; color: var(--ro-fg2) !important; }

/* ⑥⑦ 晒票 / GPT模型摇号：居中单卡片 —— __COMPACT2__
   用户 2026-10-17：「把这两个布局做小一点 太占屏幕大小了」
   做法：三行（标题 / 副标题 / 展开）压成一行，内边距和字号都收小。
   机制没变：仍是 <summary> + CSS 伪元素按 [open] 换字。 */
.ro-xysp > .ro-xysp-head,
.ro-aipick > .ro-aipick-head {
  display: flex !important; align-items: baseline !important;
  justify-content: center !important; flex-wrap: wrap !important;
  gap: 0 7px !important; text-align: center !important;
  margin: 0 12px 8px !important; padding: 7px 10px !important; border-radius: 8px !important;
}
.ro-xysp > .ro-xysp-head .ro-xysp-h2,
.ro-aipick > .ro-aipick-head .ro-aipick-h2 {
  font-size: 13.5px !important; font-weight: 800 !important; line-height: 1.35 !important;
}
.ro-xysp > .ro-xysp-head .ro-xysp-sub,
.ro-aipick > .ro-aipick-head .ro-aipick-sub {
  font-size: 10.5px !important; color: var(--ro-fg2) !important;
  margin: 0 !important; max-width: none !important; white-space: normal !important;
  line-height: 1.35 !important;
}
.ro-xysp > .ro-xysp-head .ro-xysp-arrow,
.ro-aipick > .ro-aipick-head .ro-aipick-arrow {
  display: inline-block !important; margin: 0 !important;
  font-size: 10.5px !important; font-weight: 600 !important;
  color: var(--ro-ok) !important; border: 0 !important; border-radius: 0 !important;
  padding: 0 !important; text-align: center !important; line-height: 1.35 !important;
}

/* ⑧ 开奖号码：2 列卡片 + 24px 球 */
#ro-latest .hc-drawgrid { display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
#ro-latest .hc-drawcard { background: #f9efdd !important; border: 1px solid var(--ro-line) !important;
  border-radius: 10px !important; padding: 12px 10px !important; }
#ro-latest .hc-dt { display: flex !important; justify-content: space-between !important;
  align-items: baseline !important; gap: 6px; font-size: 12px !important; color: var(--ro-fg2) !important; }
#ro-latest .hc-dt b { font-weight: 700 !important; color: var(--ro-fg) !important; }
#ro-latest .hc-cd, #ro-latest .hc-countdown { font-size: 11px !important; color: var(--ro-danger) !important; }
#ro-latest .hc-balls, #ro-latest .hc-nums { display: flex !important; flex-wrap: wrap !important; gap: 4px !important; margin-top: 8px; }
#ro-latest .hc-ball { width: 24px !important; height: 24px !important; line-height: 24px !important;
  border-radius: 50% !important; font-size: 12px !important; text-align: center !important;
  background: var(--ro-danger) !important; color: #fff !important; font-weight: 700; }
#ro-latest .hc-ball.blue { background: #1f5fd6 !important; }
#ro-latest .hc-ball.gold, #ro-latest .hc-ball.special { background: #d9a300 !important; }
#ro-latest .ro-gamehead h2 { text-align: center !important; font-size: 15px !important; font-weight: 700 !important; }
#ro-latest .ro-gamehead .ro-meta { text-align: center !important; font-size: 12px !important; color: var(--ro-fg2) !important; }

/* ⑨ 文章参考：2 列卡片 */
.ro-art-head { padding: 0 12px 8px; }
.ro-art-title { text-align: center !important; font-size: 15px !important; font-weight: 700 !important; }
.ro-art-sub { text-align: center !important; font-size: 11px !important; color: var(--ro-danger) !important; }
.ro-art-groups { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 10px !important; padding: 0 12px 20px !important; background: transparent !important; border: 0 !important; }
.ro-art-group { background: var(--ro-card) !important; border: 1px solid var(--ro-line) !important;
  border-radius: 10px !important; padding: 12px !important; margin: 0 !important; }
.ro-art-group > summary.ro-art-gname { display: flex !important; align-items: center !important;
  justify-content: space-between !important; font-size: 13px !important; font-weight: 700 !important;
  cursor: pointer; list-style: none; }
.ro-art-group > summary.ro-art-gname i { font-style: normal; font-size: 12px !important;
  color: var(--ro-fg2) !important; font-weight: 400; }
.ro-art-group > summary.ro-art-gname .ro-art-tip::after { content: '点击查看'; font-size: 12px; color: var(--ro-ok) !important; }
.ro-art-group[open] > summary.ro-art-gname .ro-art-tip::after { content: '点击收起'; }

/* ⑩ 走势图入口（__TREND_ENTRY__）：和晒票/GPT摇号同一套「居中单卡片」外观。
   ⚠️ 【本轮改版】它现在是 <details>（不是 <a> 跳转）：
      点一下【就地展开】走势图（iframe），默认收起。
   ⚠️ 「点击查看 ▸ / 点击收起 ▾」用的是 .ro-aipick-arrow 那一套写法
      （伪元素 ::before/::after 按 [open] 换字），不是新机制、不是裸 <button>。
   ⚠️ 只用变量色（--ro-fg / --ro-ok / --ro-card / --ro-line / --ro-sunken），
      米杏色主题和浅色主题那段覆盖都能自动生效。 */
.ro-trend { background: var(--ro-card); border: 1px solid var(--ro-line);
  border-radius: 10px; margin: 0 12px 12px; padding: 12px 12px 0; }
.ro-trend > .ro-trend-head { display: block; text-align: center; cursor: pointer;
  list-style: none; -webkit-tap-highlight-color: transparent; user-select: none;
  padding: 2px 0 12px; }
.ro-trend > .ro-trend-head::-webkit-details-marker { display: none; }
.ro-trend > .ro-trend-head::marker { content: ''; }
.ro-trend-h2 { display: block; font-size: 15px; font-weight: 800; color: var(--ro-fg);
  letter-spacing: .5px; }
.ro-trend-sub { display: block; margin-top: 4px; font-size: 12px; color: var(--ro-fg2);
  font-weight: 600; }
/* 右侧胶囊：和晒票 / GPT摇号 / 专家推荐 一模一样的「点击查看/点击收起」 */
.ro-trend-arrow { display: inline-block; margin: 8px auto 0; font-size: 12px;
  font-weight: 600; color: var(--ro-ok); border: 1px solid var(--ro-ok);
  border-radius: 14px; padding: 4px 10px; white-space: nowrap; }
.ro-trend-arrow::before { content: '点击查看'; }
.ro-trend-arrow::after { content: ' ▸'; }
.ro-trend[open] > .ro-trend-head .ro-trend-arrow::before { content: '点击收起'; }
.ro-trend[open] > .ro-trend-head .ro-trend-arrow::after { content: ' ▾'; }
.ro-trend-body { padding: 0 0 12px; }
/* ⚠️ 原来这里有 .ro-trend-frame（520px 高的嵌入框）和 .ro-trend-tip（跳独立页的兜底链接）。
   2026-10-17 用户要求「删除单独走势图独立页」→ 内容改成内联，这两条一起删掉：
   走势图那一块的样式全部由 build-trend.mjs 的片段自带（选择器都带
   .ro-trend-embed 前缀，收在片段内部，不会漏到分享页其它地方）。 */
${P3D_SECTION_CSS}


/* ============================================================
   __EXPERT_BLOCK__ 专家推荐（用户新增指令：可展开收起）
   ------------------------------------------------------------
   头部 = 👤 + 标题 + 数量徽章 + 折叠箭头（箭头由 [open] 换字，和
   晒票 / GPT摇号 的 .ro-*-head 同一套做法，不新增第二套外观）。
   内容 = 8 个彩种分组，每组 10 行：排名 / 专家名 / 类别 / 命中率 /
   连中与最长 / 最近一期的中否。
   全部用变量色（--ro-*），米杏色主题自动生效。
   ⚠️ 纯文字，无图片 → data-image 不变（仍 21）。
   ============================================================ */
.ro-xj { background: var(--ro-card); border: 1px solid var(--ro-line);
  border-radius: 10px; margin: 0 12px 14px; overflow: hidden; }
.ro-xj > .ro-xj-header { display: flex; align-items: center; gap: 8px;
  padding: 11px 14px; cursor: pointer; list-style: none; user-select: none; }
.ro-xj > .ro-xj-header::-webkit-details-marker { display: none; }
.ro-xj > .ro-xj-header::marker { content: ''; }
.ro-xj-icon { font-size: 15px; }
.ro-xj-title { flex: 1; font-size: 14px; font-weight: 700; color: var(--ro-fg); }
.ro-xj-count { font-size: 11.5px; font-weight: 700; color: var(--ro-ok);
  background: #e8f6ef; border: 1px solid #b7e4cd; border-radius: 20px;
  padding: 2px 9px; }
.ro-xj-arrow { font-size: 12px; color: var(--ro-fg3); }
.ro-xj[open] > .ro-xj-header .ro-xj-arrow::after { content: '收起 ▴'; }
.ro-xj:not([open]) > .ro-xj-header .ro-xj-arrow::after { content: '展开 ▾'; }
.ro-xj-note { padding: 0 14px 8px; font-size: 11.5px; color: var(--ro-fg3); line-height: 1.7; }
.ro-xj-list { padding: 0 10px 4px; }
.ro-xj-group { border-top: 1px dashed var(--ro-line); padding: 8px 0 4px; }
.ro-xj-group:first-child { border-top: 0; }
.ro-xj-ghead { display: flex; align-items: baseline; gap: 8px; padding: 2px 4px 6px; }
.ro-xj-gname { font-size: 13px; font-weight: 700; color: var(--ro-fg); }
.ro-xj-gcount { font-size: 11px; color: var(--ro-fg3); }
/* 期号状态：最新已出号那一期 + 「下一期待出号」（只是事实标注，不预告号码） */
.ro-xj-giss { font-size: 10.5px; color: var(--ro-fg3); margin-left: auto; white-space: nowrap; }
.ro-xj-row { display: flex; align-items: center; gap: 8px; padding: 5px 6px;
  border-bottom: 1px dotted var(--ro-line-soft); font-size: 12px; }
.ro-xj-item:last-child .ro-xj-row { border-bottom: 0; }
/* 【本轮改版】行从 <div> 变成 <a role="button">（可点、可键盘聚焦）——
   去掉链接的下划线/默认色，外观和原来一模一样。 */
a.ro-xj-row { color: inherit; text-decoration: none; cursor: pointer;
  border-radius: 6px; -webkit-tap-highlight-color: transparent; }
a.ro-xj-row:focus-visible { outline: 2px solid var(--ro-ok); outline-offset: 1px; }
a.ro-xj-row.on { background: var(--ro-sunken); }
/* ---------- 展开后的逐期明细（内容 = expert-pool.js 的 expertDetailHtml()）----------
   ⚠️ 这些类名（.ex-drow / .ex-dhist…）在 App 的 styles.css 里有暗色样式；
      分享页不加载那份 CSS，所以这里补一套【只用变量色】的，
      米杏色/浅色主题自动生效。 */
.ro-xj-detail { padding: 4px 8px 8px; }
.ro-xj-detail[hidden] { display: none; }
.ro-xj-detail .ex-drow { font-size: 11.5px; color: var(--ro-fg2); line-height: 1.7; }
.ro-xj-detail .ex-drow b { color: var(--ro-ok); }
.ro-xj-detail .ex-drow-lb { margin: 6px 0 2px; font-weight: 700; color: var(--ro-fg); }
.ro-xj-detail .ex-dhist { display: flex; align-items: center; gap: 8px;
  padding: 3px 0; border-top: 1px dotted var(--ro-line-soft); font-size: 11px;
  color: var(--ro-fg2); }
.ro-xj-detail .ex-dissue { flex: 0 0 auto; color: var(--ro-fg3); }
.ro-xj-detail .ex-dcat { flex: 0 0 auto; color: var(--ro-fg3); }
.ro-xj-detail .ex-dpicks { flex: 0 0 auto; }
.ro-xj-detail .ex-dhits { flex: 1 1 auto; min-width: 0; color: var(--ro-fg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ro-xj-detail .ex-dres { flex: 0 0 auto; font-weight: 700; }
.ro-xj-detail .ex-dhist.hit .ex-dres { color: var(--ro-ok); }
.ro-xj-detail .ex-dhist.miss .ex-dres { color: var(--ro-fg3); }
.ro-xj-rank { flex: 0 0 18px; text-align: center; font-size: 11px; font-weight: 700;
  color: var(--ro-fg3); }
.ro-xj-name { flex: 1 1 auto; min-width: 0; font-weight: 700; color: var(--ro-fg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ro-xj-cat { flex: 0 0 auto; font-size: 11px; color: var(--ro-fg3); }
.ro-xj-rate { flex: 0 0 auto; font-size: 11.5px; font-weight: 700; color: var(--ro-ok); }
.ro-xj-streak { flex: 0 0 auto; font-size: 11px; color: var(--ro-fg2); }
.ro-xj-last { flex: 0 0 auto; font-size: 10.5px; font-weight: 700; border-radius: 5px;
  padding: 1px 7px; }
.ro-xj-last.hit { background: #fbe9e7; color: #c0392b; }
.ro-xj-last.miss { background: var(--ro-sunken); color: var(--ro-fg3); }
.ro-xj-more { text-align: center; font-size: 11.5px; color: var(--ro-fg3);
  padding: 8px 0 12px; }
@media (max-width: 420px) {
  /* ⚠️ 窄屏上这一行本来就挤（排名+名字+类别+命中率+连中+中否），
     实测 430px 下「中/未中」徽章会被挤出右边缘 ——
     把类别和中否收起来，保留最要紧的四项（排名/名字/命中率/连中）。
     数据没丢：宽屏或横屏下仍然看得到。 */
  .ro-xj-cat { display: none; }
  .ro-xj-last { display: none; }
}

  /* __HOT_OWNER__ 热度计数：默认隐藏，只有 owner 才显示 */
  .ro-hot {
    position: fixed; top: 8px; left: 8px; z-index: 9990;
    display: none; align-items: center; gap: 3px;
    padding: 3px 9px 3px 7px; border-radius: 12px;
    background: rgba(255,255,255,.86);
    border: 1px solid var(--ro-line);
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
    font-size: 12.5px; font-weight: 700; line-height: 1.5;
    color: #c0392b; user-select: none;
  }
  html.is-owner .ro-hot:not([hidden]) { display: inline-flex; }
  .ro-hot-i { font-size: 13px; }
  .ro-hot-n { letter-spacing: .4px; }
  @media print { .ro-hot { display: none !important; } }

  /* __TOC_EQH__ 推荐图目录：所有卡片统一高度，消除「行被撑高留空档」
     用户 2026-10-17：「这一块的布局是贴合的」→ 选方案 A（等高等宽）
     · 固定高度 56px：一行的标题居中；两行的标题缩到 12.5px 也放得下
     · 文字超长时自动省略，不再撑高整行
     · 只作用在 .ro-imgtoc 里的格子，不影响别处 */
  .ro-imgtoc .ro-toc-cell {
    height: 56px !important;
    min-height: 56px !important;
    max-height: 56px !important;
    padding: 4px 8px !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 1.28 !important;
    overflow: hidden !important;
    font-size: 14px !important;
  }
  /* 两行文字的格子：字号收一点，保证在 56px 内不挤、不溢出 */
  .ro-imgtoc .ro-toc-cell br + *,
  .ro-imgtoc .ro-toc-cell.two-line { font-size: 12.5px !important; }
  .ro-imgtoc .ro-toc-cell > * { max-height: 100%; overflow: hidden; }
  /* 网格行：让每行高度由固定 56px 决定，不再被内容撑开 */
  .ro-imgtoc { grid-auto-rows: 56px !important; }

/* ============================================================
   【紧凑排版】统一收口层
   ------------------------------------------------------------
   用户要求：「整个版面压缩一下，零零闪闪不好看」——
     ① 顶部 Tab → 主标题 → 提示条 → 推荐图目录 间距统一收紧
     ② 所有区块 margin-bottom 统一 12px（原来 0/2/12/14/16/22/24/26/40 九种）
     ③ 卡片内边距统一 12px（原来 0/12/14/15/16/22/30 七种）
     ④ 标题/副标题间距统一 4px
     ⑤ 页面上下空白收敛（原来 wrap pt8/pb40、foot pt30/pb50、disclaimer mb40）
     ⑥ 紧凑连贯，但行高保持 ≥1.4、字号一律不缩小

   ⚠️ 本层只改【纵向间距】：margin-bottom / padding-top / padding-bottom。
      绝不用 padding/margin 简写 —— 横向内边距一个都不碰。
   ⚠️ 不写任何 font-size，也不压 line-height。
   ⚠️ 放在样式表最后，靠级联覆盖之前的散值；要回滚删掉整层即可。
   ============================================================ */
:root {
  --c-gap: 12px;      /* 区块之间统一间距 */
  --c-pad: 12px;      /* 卡片统一内边距 */
  --c-title: 4px;     /* 标题与副标题之间 */
}

/* ---------- ② 区块之间统一 12px ---------- */
.ro-wrap > * { margin-bottom: var(--c-gap); }
#article > * { margin-bottom: var(--c-gap); }
#article-rest > * { margin-bottom: var(--c-gap); }
.ro-status, .ro-imgtoc-wrap, .ro-tools,
.ro-xysp, .ro-aipick, .ro-xj, .trend-entry, .p3d-section,
.ro-articles, .ro-game, .ro-art-group { margin-bottom: var(--c-gap); }
/* 分隔条原来 mt34/mb26，是整页最大的一处断口 */
.ro-divider { margin-top: 14px; margin-bottom: var(--c-gap); }
/* 免责声明原来 mb40 */
.ro-disclaimer { margin-bottom: var(--c-gap); }

/* ---------- ③ 卡片内边距统一 ---------- */
.ro-status,
.ro-xysp, .ro-aipick, .ro-articles,
.trend-entry, .ro-art-group { padding-top: var(--c-pad); padding-bottom: var(--c-pad); }
/* 各个折叠块的入口行（点击查看/收起那一行）也统一 */
.ro-xysp > summary, .ro-aipick > summary, .p3d-head, .ro-xj > summary,
details.ro-xysp > summary, details.ro-aipick > summary { padding-top: 10px; padding-bottom: 10px; }

/* ---------- ⑤ 页面上下空白收敛 ---------- */
.ro-wrap { padding-top: 6px; padding-bottom: 18px; }
.ro-foot { padding-top: 18px; padding-bottom: 22px; }
.ro-disclaimer { padding-top: 14px; padding-bottom: 14px; }

/* ---------- ① 顶部四段收紧（Tab → 主标题 → 提示条 → 目录）---------- */
.top-tabs { margin-bottom: 0; }
.ro-top { padding-top: 10px; padding-bottom: 10px; }
.ro-status { margin-bottom: var(--c-gap); }

/* ---------- ④ 标题/副标题间距统一 4px ---------- */
.ro-top h1, .ro-title { margin-bottom: var(--c-title); }
.ro-sub, .ro-art-sub, .p3d-sub, .chart-sub { margin-top: 0; }
.ro-aipick-head, .ro-xysp-head { margin-bottom: var(--c-title); }
.p3d-block-title { margin-bottom: 6px; }

/* ============================================================
   【紧凑排版·打穿 !important】
   ------------------------------------------------------------
   页面里有个「米杏色覆盖块」用了 147 个 !important，把 7 处纵向间距锁住了，
   普通声明压不动，所以这里对这 7 处显式补 !important。
   ⚠️ 只覆盖【纵向】长属性；横向内边距/外边距一律不动（照抄原值的横向部分）。
   ⚠️ 不写 font-size、不写 line-height。
   ============================================================ */
.ro-top { padding-top: 10px !important; padding-bottom: 10px !important; }
.ro-status { margin-bottom: var(--c-gap) !important; }
.ro-imgtoc { padding-bottom: 12px !important; }
.ro-tools { padding-bottom: 12px !important; }
.ro-tool { padding-top: 12px !important; padding-bottom: 12px !important; }
.ro-art-groups { padding-bottom: 12px !important; }
.ro-game { padding-bottom: 12px !important; }
/* 折叠块入口行（点击查看/收起那行）统一 */
.ro-xysp > .ro-xysp-head, .ro-aipick > .ro-aipick-head { padding-top: 8px !important; padding-bottom: 8px !important; }

/* ============================================================
   __RO_DARK_LEFT__ 还残留的深底区块 → 米杏色（只改配色，内容一个字不动）
   ------------------------------------------------------------
   为什么还得补这一块：上面那层浅色覆盖用的是【属性选择器】
   （[style*="#0f1115"] / [style*="#161a21"] / [style*="#12151d"]），
   只对【行内样式】生效；而下面这几个区块的底色写在【类规则】里，
   一直是深色没被换掉。实测（真浏览器读 computed style，排除 canvas/img/svg）：
     · section.ro-articles   文章参考的外层容器   rgb(18,22,29)
     · .ro-art-body          文章正文展开区       rgb(18,22,29)
     · div.ro-disclaimer     免责声明（所有实例）  rgb(18,21,27)
     · div.ro-drawblock      开奖号码块（多个）    rgb(22,26,33)
   ⚠️ 只写背景 / 边框 / 文字色，不动布局、字号、间距、圆角、内边距。
   ⚠️ 颜色一律走页面已有变量（--ro-card / --ro-sunken / --ro-line / --ro-fg / --ro-fg2），
      不引新色；以后换主题只改变量。
   ⚠️ canvas / img / svg 出的图（推荐图 / 热力图 / 手绘图）不在这里面，保持深色。
   ⚠️ 必须写在样式表【最后】：同文件后面还有 .ro-art-head / .ro-xysp-head 那类规则，
      写在前面会被顺序盖掉（上次踩过）。 */
.ro-articles { background: var(--ro-card) !important; border: 1px solid var(--ro-line) !important; color: var(--ro-fg) !important; }
.ro-art-body { background: var(--ro-sunken) !important; border: 1px solid var(--ro-line) !important; color: var(--ro-fg) !important; }
.ro-art-body p, .ro-art-body .ro-art-p { color: var(--ro-fg) !important; }
.ro-art-link, .ro-art-body a { color: var(--ro-link) !important; }
.ro-disclaimer { background: var(--ro-card) !important; border: 1px solid var(--ro-line) !important; color: var(--ro-fg2) !important; }
.ro-disclaimer h3 { color: var(--ro-fg) !important; }
.ro-disclaimer p { color: var(--ro-fg2) !important; }
.ro-drawblock { background: var(--ro-card) !important; border: 1px solid var(--ro-line) !important; color: var(--ro-fg) !important; }
/* 洛书九宫图那个「0 单独外置」格（#luoshuZero）—— 它是 DOM 格、不是 canvas，
   实测底色 rgb(22,26,33) 是深色，跟着一起换成米杏（用户 2026-10-17 确认）。 */
.luoshu-zero, .luoshu-zero.pick, .luoshu-zero.hit {
  background: var(--ro-sunken) !important;
  border: 1px solid var(--ro-line) !important;
}

/* ============================================================
   【顶部三段统一 12px】
   ------------------------------------------------------------
   实测压缩后顶部三段是 10 / 26 / 12px（不统一，26 那处刺眼）。
   这里把三段做成一致的 12px：
     .ro-top 上下 padding 10 → 12 / 0（h1 的下边距归零）
   依据：h1 与 .ro-top 的 margin-bottom 会和外层合并，所以
         「主标题→提示条」最终只等于 .ro-top 自己的 margin-bottom（12px）。
   ⚠️ 只动纵向；只在这两处加 !important（原值被页面的 !important 锁着）。
   ============================================================ */
.ro-top { padding-top: 12px !important; padding-bottom: 0 !important; }
.ro-top h1 { margin-bottom: 0 !important; }
/* ============================================================
   【文字对比度 · 最终修正】米杏底上"看不清"的字统一加深（用户 2026-10-17）
   ------------------------------------------------------------
   依据：真浏览器逐文本节点实测（_contrast_probe.mjs —— 比较"颜色"和它**真正的背景**，
        不是猜；排除 canvas/img/svg）。实测最差的 10 组（达标线 4.5）：
     #e8eaed 1.06  .hc-gn            开奖卡彩种名（8 处）
     #ffffff 1.07  .ro-aipick-*.on   选号面板选中态 —— 白字压在米杏底上，等于看不见（3 处）
     #e8c877 1.42  .hc-nextcd        开奖卡倒计时（8 处）
     #c8cfda 1.46  .ro-art-gname     文章参考的彩种名（5 处）
     #8fb8ff 1.87  .ro-xysp-cap b    晒票卡片的彩种名（378 处）
     #9aa6b8 2.29  .ro-aipick-lbl    选号面板标签（5 处）
     #d9a300 2.29  .shape-baozi      手绘图表格里的"豹子"格（白底，1 处）
     #a2937c 2.43  "还没摇号 / 未中"  提示文字（19 处）
     #8b93a1 2.71  .hc-iss           开奖卡期号（8 处）
     #a2937c 2.79  .ro-xysp-cap i    晒票卡片的副标题（165 处）
   三档口径（用户给）：主文字 var(--ro-fg) #4a3a26 · 次要 var(--ro-fg2) #8a7a63 · 最弱 var(--ro-fg3) #a2937c
   ⚠️ 只改颜色（原有 font-weight:700 一律保留），不动任何文字内容 / 字号 / 间距 / 布局。
   ⚠️ canvas / img / svg 出的图（推荐图 / 热力图 / 手绘图）不在这里面，保持深色。
   ⚠️ 必须写在样式表【最后】（紧邻样式表的结束标签）—— 前面那些 .ro-art-* / .hc-* 规则会盖掉它。
   ⚠️ ⚠️ 这段注释里【绝对不能出现 style 的结束标签字面量，也不能出现反引号】：
        · 结束标签字面量 → HTML 解析器提前关掉整个 style 块；
        · 反引号 → 会提前闭合本文件包住这段 CSS 的 JS 模板字符串（直接 SyntaxError）。
        这次真踩了：CSS 只解析到 .ro-top h1 那条，我这 20 多条一条都没生效，
        页面上还漏出一堆 CSS 文本。 */
/* ① 文章参考：彩种名加深 + 加粗；「N 篇」次要色；"点击查看/收起"绿色；底色/边框显式米杏 */
.ro-art-group { background: var(--ro-card) !important; border: 1px solid var(--ro-line) !important; }
.ro-art-group > summary.ro-art-gname { color: var(--ro-fg) !important; font-weight: 700 !important; }
.ro-art-group > summary.ro-art-gname i { color: var(--ro-fg2) !important; font-weight: 400 !important; }
.ro-art-group > summary.ro-art-gname .ro-art-tip::after { color: var(--ro-ok) !important; }
.ro-art-body { background: var(--ro-sunken) !important; border-color: var(--ro-line) !important; }
.ro-art-empty, .ro-art-note { color: var(--ro-fg2) !important; }
.ro-art-item.ro-art-nobody .ro-art-link { color: var(--ro-fg3) !important; }
.ro-art-link, .ro-art-body a { color: var(--ro-link) !important; }
.ro-art-link:hover, .ro-art-link:active { color: var(--ro-link) !important; }   /* 原来 hover 是浅蓝 #bcd4ff（1.4） */
/* ② 开奖号码卡片：彩种名 / 期号 / 日期 / 倒计时 */
.hc-gn { color: var(--ro-fg) !important; font-weight: 700 !important; }
.hc-iss, .hc-date, .hc-rgame { color: var(--ro-fg2) !important; }
.hc-nextcd { color: var(--ro-time) !important; }                                /* 原浅金 #e8c877 只有 1.42 */
/* ③ 晒票卡片：彩种名（主文字）+ 下面的时间/期号（次要） */
.ro-xysp-cap b { color: var(--ro-fg) !important; }
.ro-xysp-cap i { color: var(--ro-fg2) !important; }
/* ④ 选号面板：标签用次要色；选中态给实心绿（原来是白字压米杏底，等于看不见） */
.ro-aipick-lbl { color: var(--ro-fg2) !important; }
.ro-aipick-srcbtn.on, .ro-aipick-segbtn.on, .ro-aipick-btn.on,
.ro-aipick-tab.on, .ro-aipick-kl8tab.on { background: var(--ro-ok) !important; color: #fff !important; }
.ro-aipick-empty { color: var(--ro-fg2) !important; }
.ro-xj-last.miss { color: var(--ro-fg2) !important; }
.ro-aipick-rule, .ro-tool em, .ro-kjh-issue, .ro-kjh-extra, .ro-imgtoc-sub, .ro-st-time { color: var(--ro-fg2) !important; }
/* ⑤ 悬停态：浅蓝/浅金一律换成可读的深色或主色 */
.ro-xysp-tab:hover, .ro-xysp-tab:active, .ro-aipick-tab:hover, .ro-aipick-tab:active,
.ro-aipick-kl8tab:hover, .ro-aipick-segbtn:hover, .ro-aipick-pick:hover, .ro-aipick-pick:active { color: var(--ro-fg) !important; }
/* ⑥ 零散：手绘图表格里的金色字（白底 2.29）用项目已有的深金 #8a6a00；标题类统一主文字 */
.metric-table td.shape-baozi { color: #8a6a00 !important; }
.p3d-type-btn { color: var(--ro-fg2) !important; }
.ro-gamehead h2, .ro-imgtoc-title, .ro-art-title, .ro-xysp-h2, .ro-aipick-h2, .ro-disclaimer h3 { color: var(--ro-fg) !important; }
/* ⑦ 收尾补漏（同样以真浏览器实测为准）
   · 「重摇 / 清空」这类按钮：原 #8b93a1（2.88）→ 主文字色
   · 手绘图里选中的彩种标签（浅绿底 #e3f2ea）：次要色只有 3.6 → 主文字色
   · 洛书九宫图的「外置 0 号」黑圆：按用户 ④（手绘图保持深色）【底色不动】，
     只把上面的蓝字（#1f5fd6 压深底只有 3.05）改成浅色，看得清。 */
.ro-aipick-btn.ghost { color: var(--ro-fg) !important; }
.p3d-type-btn.active { color: var(--ro-fg) !important; }
/* ⚠️ 【修正】原来这里是 color: #f2ead9 —— 写它的时候前提是「黑圆底色不动」
   （见上面 ④ 的注释）。但同文件更早的那层已经把这个格的底色换成了米杏
   （.luoshu-zero { background: var(--ro-sunken) }，用户确认过的）——
   两层前提矛盾，结果浅米字压米杏底，对比度只有 1.03，那句话等于看不见。
   用户 2026-10-17 决定：「底色保留米杏、把文字改成看得见」。
   所以这里改成次要文字色；.pick / .hit 的强调色仍由 p3d-section.mjs
   （.luoshu-zero.pick → 链接蓝 / .hit → 危险红）单独管。 */
#luoshuZero, .luoshu-zero { color: var(--ro-fg2) !important; }
/* ⑧ 金色球（.lm-ball.lm-gold，洛书/球那套新加的元素）：白字压金底实测只有 2.29，
      改成深棕字（对金底 ≈5.1）—— 球还是金色，只是号码看得清。 */
.lm-ball.lm-gold { color: var(--ro-fg) !important; }
/* ⑨ 主标题「春风十里送大奖」：红字 + 白边 + 立体感
      （用户 2026-10-17 连着三条要求：「改成红色字体」→「红字白边」→「有立体感」）
      做法：
        · 红字：#d92b2b（亮红，大字用，米杏底上 ≈4.3 —— 22px/800 属大字号，达标）
        · 白边：-webkit-text-stroke 3px 白 + paint-order:stroke fill
                （关键：paint-order 让白边画在红字【外面】，否则描边会吃掉笔画变细）
        · 立体感：三层逐级压深的红（0 1px→0 3px）做出"厚度"，再加一层柔和落地投影
        · 兜底：不支持 text-stroke 的引擎靠 text-shadow 的那几层也能看出白边+厚度
      只改这一个标题，页面别的字一律不动。 */
.ro-top h1 {
  color: #d92b2b !important;
  -webkit-text-stroke: 3px #ffffff !important;
  paint-order: stroke fill;
  text-shadow:
    0 1px 0 #ffffff, 0 -1px 0 #ffffff, 1px 0 0 #ffffff, -1px 0 0 #ffffff,
    0 2px 0 #b3201f, 0 3px 0 #9c1a1a, 0 4px 0 #831616,
    0 6px 9px rgba(80, 20, 16, .30) !important;
}

/* ============================================================
   推荐图目录：手机窄屏整齐化（用户 2026-10-17）
   ------------------------------------------------------------
   实测（headless 335px，真浏览器量 box）：__TOC_EQH__ 的固定 56px 其实【已经在生效】
   （10 个格子全是 56px 高）——真正的问题是【长名字折 3 行 → 溢出被裁】：
     .ro-toc-cell scrollHeight 62 > 56，第三行被 overflow:hidden 切掉，
     所以看起来"高矮不齐 + 一片空档"。
     ① 强制等高：沿用固定 56px + 网格行高，这里再显式兜一层（防被后面的规则盖掉）
     ② 主标题 + 副标题：长名字拆成两行小字（配合 TOC_ROWS 里的 s 字段，一行放得下）
     ③ 兜底：< 360px 改单列（两列时每格只有 ~150px，塞长字必然折行）
   ⚠️ 只动布局/字号/颜色；点击功能照旧（整块都在 a 标签里，JS 也是按 .ro-toc-cell 找的）。
   ⚠️ 目录格子数不变（5 行 × 2 列 = 10 格，不变量「ro-toc-cell ≥ 10」保持）。 */
.ro-imgtoc .ro-toc-cell { display: flex !important; flex-direction: column !important;
  align-items: center !important; justify-content: center !important;
  height: 56px !important; min-height: 56px !important; max-height: 56px !important;
  overflow: hidden !important; padding: 4px 8px !important; line-height: 1.22 !important; }
.ro-imgtoc { grid-auto-rows: 56px !important; }
.ro-imgtoc .ro-toc-cell .ro-toc-t { display: block; font-size: 13.5px; font-weight: 700; color: var(--ro-fg); }
.ro-imgtoc .ro-toc-cell .ro-toc-s { display: block; font-style: normal; font-weight: 400;
  font-size: 10.5px; margin-top: 1px; color: var(--ro-fg2); white-space: nowrap; }
.ro-imgtoc .ro-toc-cell.two-line { font-size: 13.5px !important; }
@media (max-width: 360px) {
  .ro-imgtoc { grid-template-columns: 1fr !important; }
  .ro-imgtoc .ro-toc-cell .ro-toc-t { font-size: 15px; }
  .ro-imgtoc .ro-toc-cell .ro-toc-s { font-size: 11.5px; }
}

/* ============================================================
   【专家推荐 · 入口行居中】用户 2026-10-17 截图点名：「居中」。
   ------------------------------------------------------------
   原来这一行是 flex：图标 + 标题(flex:1) + 人数 + 展开箭头，
   标题虽然占剩余宽度，但左右都被挤着 → 视觉上是【左对齐】；
   而「走势图」「文章参考」那几行都是居中标题，风格不统一。
   做法：把 图标 / 人数 / 箭头 移出文档流（绝对定位钉在左右两端），
   标题独占整行 + text-align:center ⇒ 真正居中，两端信息一个不少。
   ⚠️ 只动这一行的排版：不改文案、不改结构、不加删元素。 */
.ro-xj > .ro-xj-header { position: relative; }
.ro-xj > .ro-xj-header .ro-xj-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); }
.ro-xj > .ro-xj-header .ro-xj-count { position: absolute; right: 62px; top: 50%; transform: translateY(-50%); }
.ro-xj > .ro-xj-header .ro-xj-arrow { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); }
.ro-xj > .ro-xj-header .ro-xj-title { flex: 1 1 auto; text-align: center; }

/* ============================================================
   【推荐图目录 · 宽一点居中】用户 2026-10-17 截图圈了「推荐图目录」说「宽一点居中」。
   ------------------------------------------------------------
   实测（视口 676）：这块被两层 12px 内边距夹住 ——
     .ro-wrap 的 padding: 0 12px（12px）+ 自己那句 .ro-imgtoc { padding: 0 12px 12px }（12px）
   ⇒ 左右各空 24px，格子显得窄。
   做法：这一块【贴到屏幕两边】——用负外边距抵消 .ro-wrap 的 12px，
         表格自己的左右内边距收成 6px；整块仍然居中（左右对称），格子变宽。
   ⚠️ 只在窄屏（≤1365px）生效，和「目录只在窄屏显示」的规则一致；
      不影响别的区块、不动全局 padding。 */
@media (max-width: 1365px) {
  /* 【推荐图目录 · 宽一点居中】用户 2026-10-17。
     原来：<table> + <td width:50%>，实测列宽被表格布局钉住 → 两列只占中间一段。
     现在：markup 改成 grid 容器，这里把两列钉成等分、铺满、左右对称。
     负外边距抵消 .ro-wrap 的 12px 内边距 → 整块贴到屏幕两边。 */
  .ro-imgtoc-wrap { margin-left: -12px !important; margin-right: -12px !important; }
  .ro-imgtoc {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;   /* 两列等宽 */
    gap: 6px !important;
    width: 100% !important;
    padding: 0 6px 12px !important;
    box-sizing: border-box !important;
    border-collapse: unset !important;
  }
  .ro-imgtoc .ro-toc-cell { width: 100% !important; box-sizing: border-box !important; }
  /* 兼容：万一别处还有旧的 <table class="ro-imgtoc">（缓存/旧页面），也别再挤 */

  table.ro-imgtoc { table-layout: fixed !important; width: 100% !important; }
  table.ro-imgtoc td { width: 50% !important; padding: 3px 5px !important; }
}

/* ============================================================
   【手机端 8px 横向溢出 · 修】用户 2026-10-17
   ------------------------------------------------------------
   现象：375 / 320 手机上页面能左右拉一点点 ——
         document.documentElement.scrollWidth 比 clientWidth 大 8px。
   真浏览器量出来的元凶是【推荐图目录】那块 .ro-imgtoc-wrap，
   不是走势图表格（走势图表格外面那层 .tr-scroll 已经 overflow-x: auto，
   它自己溢出的部分被裁掉了，不参与文档宽度）。
   为什么多出 8px：
     · ≤1365px 那句 margin-left/-right: -12px 是为了抵消 .ro-wrap 的 12px 内边距
       → 整块贴屏幕两边；
     · 但 ≤600px 那句把 .ro-wrap 的内边距改成了 4px（padding: 8px 4px 40px）；
     ⇒ 负外边距比内边距多抵消 8px：
        块宽 = (375 - 8) + 12 + 12 = 391，left = 4 - 12 = -8，right = 383
        ⇒ 左边跑出 -8（不产生滚动）、右边超出 8 ⇒ 文档多出 8px 横向滚动。
   修法：让负外边距【跟着内边距走】—— 用一个变量存 .ro-wrap 的左右内边距，
        两处都读它，以后谁再改内边距都不会再错位。
   ⚠️ 只动这一处外边距：不改结构、不改 .tr-scroll（横向滚动照旧）、
      不改任何颜色 / 字体 / 断点，不引入任何脚本。
   ============================================================ */
.ro-wrap { --ro-pad-x: 12px; }
@media (max-width: 600px) {
  .ro-wrap { --ro-pad-x: 4px; }   /* 和上面 .ro-wrap { padding: 8px 4px 40px } 保持一致 */
}
.ro-imgtoc-wrap {
  margin-left: calc(-1 * var(--ro-pad-x, 12px)) !important;
  margin-right: calc(-1 * var(--ro-pad-x, 12px)) !important;
  max-width: 100vw;
  box-sizing: border-box;
}

/* ============================================================
   __MQ_TICKER__ 顶部状态卡右侧：中奖播报滚动条
   ------------------------------------------------------------
   用户要求：在「已更新 / 所有资料均在下方 / 下一期更新倒计时」那张卡片的
   右边空位做一条横向滚动的小喇叭通告（播报最近的开奖中奖情况）。
   · 纯 CSS 动画（keyframes + transform），不用废弃的 marquee 标签、
     不用 button、不引任何外部图片；喇叭图标是 emoji。
   · 米杏色：底 var(--ro-sunken) · 边框 var(--ro-line) · 字 var(--ro-fg2) ·
     中奖等级用醒目金 var(--ro-warn)，最高档（一等奖 / 直选）用 var(--ro-danger)。
   · 轨道里放两组一模一样的条目 → translateX(-50%) 正好退一组，无缝循环。
   · 鼠标悬停 / 点按 / 键盘聚焦时暂停，方便看清一条。
   · 窄屏（<=560px）改成上下两块：左边三段字本来就占满，右边只剩几十像素，
     并排会挤成一条看不清；改成上下后宽度占满、高度只多 26px。
   · 高度 26px，和左边三段字并排不会把卡片撑高。
   ⚠️ 这段写在样式表最后：同优先级后者胜，不用堆 !important 就能盖住前面的规则。
   ============================================================ */
.ro-status.ro-st-row {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
}
.ro-status.ro-st-row > .ro-st-txt { flex: 0 1 auto; min-width: 0; }

.ro-mq {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  box-sizing: border-box;
  padding: 0 9px;
  border-radius: 8px;
  background: var(--ro-sunken);
  border: 1px solid var(--ro-line);
  overflow: hidden;
}
.ro-mq-ico { flex: 0 0 auto; font-size: 13px; line-height: 1; }
.ro-mq-view { flex: 1 1 0; min-width: 0; overflow: hidden; }
.ro-mq-track {
  display: flex;
  width: max-content;
  will-change: transform;
  animation-name: ro-mq-roll;
  animation-duration: 26s;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.ro-mq-group { display: flex; align-items: center; flex: 0 0 auto; }
.ro-mq-item {
  font-size: 12px; line-height: 26px; color: var(--ro-fg2);
  white-space: nowrap; padding-right: 28px;
}
.ro-mq-item b { font-weight: 700; color: var(--ro-fg); }
.ro-mq-item i { font-style: normal; font-weight: 700; color: var(--ro-warn); }
.ro-mq-item.mq-top i { color: var(--ro-danger); }
/* 用户 2026-10-18：「喇叭里不要带上最近推荐中奖多少期」——
   汇总那一条（.mq-rate）和它的配色规则一起删掉，喇叭里只有中奖播报。 */
.ro-mq-none {
  display: block; font-size: 12px; line-height: 26px; color: var(--ro-fg2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
@keyframes ro-mq-roll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.ro-mq:hover .ro-mq-track,
.ro-mq:active .ro-mq-track,
.ro-mq:focus-within .ro-mq-track { animation-play-state: paused; }
/* 系统开了「减少动态效果」→ 不滚了，改成可以横向拖动看 */
@media (prefers-reduced-motion: reduce) {
  .ro-mq-track { animation: none; }
  .ro-mq-view { overflow-x: auto; }
  .ro-mq-view::-webkit-scrollbar { height: 0; }
}
/* 窄屏：上下两块
   ⚠️ 这里必须把 flex 改回 0 0 auto：竖排时 flex 的「主尺寸」是高度，
      上面那条 flex: 1 1 0 会把高度压成 0（实测只剩 2px 边框）。 */
@media (max-width: 560px) {
  .ro-status.ro-st-row {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
  }
  .ro-mq { flex: 0 0 auto; width: 100%; }
}

/* ============================================================
   ⑧【开机号 + 热力图 · 并排两列】
   ------------------------------------------------------------
   用户原话（2026-10-18）：「把开机号和热力图改成并排两列」
   结构（.grid-2-col 里两张卡，左 = 开机号 <a>，右 = 热力图 <details>）：
     收起 → 两列并排，各占一半；点开热力图 → 它占满整行（图要宽）。
   · 左边沿用原来的 .ro-tool 点击逻辑（<a href="#ro-kjh">，不是 button）；
     右边沿用原来的 <details> 折叠（右边卡原有那一套样式一个都没动）。
   · 用户给的 .action-card 规格 → 换成我们米杏主题的变量：
       var(--border)   → var(--ro-line)   #e8d7bd 边框
       var(--text)     → var(--ro-fg)     #4a3a26 主文字
       var(--text-sub) → var(--ro-fg2)    #8a7a63 副文字
       卡片底 #fff     → var(--ro-card)   #fdf6ea 卡片米杏
       点按反馈 #f9efdd（米杏底同色系，比卡片底深一点点）
   ⚠️ 这段写在样式表最后：同优先级后者胜，不用堆 !important。
   ⚠️ 选择器里【不写右边卡原先那个类名】（保护标记按出现次数数，多写一个
      就多一处）：右边那张卡用 .ro-hm-card / details 命中，效果一样。
   ============================================================ */
.grid-2-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
  align-items: stretch;
}
/* 两张卡共用一套外观（左边 <a> · 右边 <details>） */
.action-card,
.grid-2-col > .ro-hm-card {
  box-sizing: border-box;
  margin: 0;
  min-width: 0;
  min-height: 84px;
  padding: 12px 10px;
  border: 1px solid var(--ro-line);
  border-radius: 10px;
  background: var(--ro-card);
  text-align: center;
  overflow-wrap: break-word;
  word-break: break-word;
}
/* 左边那张：纵向居中（上下留白一样多）
   ⚠️ display / padding 必须带 !important：上面「⑤ 开机号」那层（米杏覆盖块）
      对 .ro-tool 写了 display:block !important、padding:14px 8px !important，
      普通声明压不动（实测：不加就是一行横排，三行字全挤在一条线上）。
      这里只覆盖到和右边卡一样的规格，别的一个值都没动。 */
.action-card {
  display: flex !important;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 12px 10px !important;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: background .18s;
}
.action-card:active { background: #f9efdd !important; }
/* 卡片里的字：两张卡一套规格 → 左右一样大、一样高 */
.grid-2-col .title { font-size: 15px; font-weight: 700; color: var(--ro-fg); line-height: 1.3; }
.grid-2-col .sub { font-size: 11px; color: var(--ro-fg2); line-height: 1.4; text-wrap: balance; }
.grid-2-col .title + .sub { margin-top: 4px; }
.grid-2-col .ro-go { margin-top: 2px; }
/* 右边热力图卡：标题 / 「当前：…期」/「点击查看 ▾」三行居中 */
.grid-2-col > .ro-hm-card > summary {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px 0;
  cursor: pointer;
}
.grid-2-col > .ro-hm-card > summary > * { flex: 0 0 auto; width: 100%; }
/* 收起状态下让那三行和左边卡一样【纵向居中】
   （卡片被 grid 拉伸到同高，内容不够高时多余的空白分上下 ——
     老内核不认识 align-content 就退化成顶部对齐，不影响任何功能） */
.grid-2-col > .ro-hm-card { align-content: center; }
/* 最后一行「点击查看 ▾ / 点击收起 ▴」：和左卡同一档字号 + 主色绿 */
.grid-2-col > .ro-hm-card > summary > :last-child {
  font-size: 11px;
  margin-top: 2px;
  color: var(--ro-ok);
}
/* 展开 → 热力图占满整行（脚本同步的 .is-open 与 :has 双保险） */
.grid-2-col.is-open,
.grid-2-col:has(> details[open]) { grid-template-columns: minmax(0, 1fr); }
/* 320 窄屏：字号收一档，两列也不挤爆、不横向溢出 */
@media (max-width: 360px) {
  .grid-2-col { gap: 8px; }
  .grid-2-col .title { font-size: 14px; }
  .grid-2-col .sub { font-size: 10.5px; }
  .grid-2-col .title + .sub { margin-top: 3px; }
  .grid-2-col > .ro-hm-card > summary > :last-child { font-size: 10.5px; }
}

/* ============================================================
   ⑨【晒票 + GPT模型摇号 · 并排两列】（用户 2026-10-18 给的设计）
   ------------------------------------------------------------
   用户原话：「晒票和 GPT模型摇号 也做成并排两列，跟
             开机号+热力图 那行同样式」，并直接给了
             .grid-2-col-action / .action-card-btn 这套 CSS。
   变量映射（用户给的 → 本站米杏主题）：
     var(--border)   → var(--ro-line)   #e8d7bd
     var(--text)     → var(--ro-fg)     #4a3a26
     var(--text-sub) → var(--ro-fg2)    #8a7a63
     var(--green)    → var(--ro-ok)     #1a8c5a
     background:#fff → var(--ro-card)   #fdf6ea
     #f9efdd（点按反馈）→ 原来就有的那个米杏反馈色，照用
   为什么 padding 写在 <summary> 而不是 <details>：
     这一行两格都是 <details>，正文（晒票的图墙 / 摇号面板）展开后
     要塞回卡片里；所以卡片左右留白给 details、标题行用负 margin
     铺满整宽 —— 收起时看上去就是用户给的那张「卡片按钮」。
   ⚠️ 这段必须写在样式表【最后】：上面 ⑥⑦ 那层对
      .ro-xysp > .ro-xysp-head 写了带 !important 的紧凑横排样式，
      这里靠【更高的选择器权重 + !important】把它盖成竖排三行卡片。
   ============================================================ */
.grid-2-col-action {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
  align-items: stretch;
}
.grid-2-col-action > details { min-width: 0; }
.grid-2-col-action > details.action-card-btn {
  box-sizing: border-box;
  margin: 0 !important;
  padding: 0 10px 0 !important;
  background: var(--ro-card) !important;
  border: 1px solid var(--ro-line) !important;
  border-radius: 10px !important;
  overflow: hidden;
  transition: background .2s;
}
/* 展开：正文上下要留白；收起：卡片只有标题行那么高 */
.grid-2-col-action > details.action-card-btn[open] { padding-bottom: 12px !important; }
.grid-2-col-action > details.action-card-btn:active { background: #f9efdd !important; }
/* 卡片脸 = <summary>：铺满整宽 · 竖排三行居中 */
.grid-2-col-action > details.action-card-btn > summary {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
  text-align: center !important;
  margin: 0 -10px !important;
  padding: 16px 10px !important;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  cursor: pointer;
  list-style: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.grid-2-col-action > details.action-card-btn > summary::-webkit-details-marker { display: none; }
.grid-2-col-action > details.action-card-btn > summary::marker { content: ''; }
/* 三行字：标题 / 副标题 / 展开提示（用户给的 .title / .sub / .action-text） */
.grid-2-col-action .title {
  margin: 0 !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  line-height: 1.3 !important;
  color: var(--ro-fg) !important;
}
.grid-2-col-action .sub {
  margin: 2px 0 0 !important;
  max-width: none !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  font-size: 11px !important;
  font-weight: 400 !important;
  line-height: 1.4 !important;
  color: var(--ro-fg2) !important;
}
.grid-2-col-action .action-text {
  margin: 8px 0 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
  color: var(--ro-ok) !important;
}
/* 「展开 ▸ / 点击查看 ▸」的箭头：上面几层把它清成空串了，这里按用户设计补回来
   （文字本身还是 ::before 按 [open] 换的 —— 机制没变） */
.grid-2-col-action > details > summary .ro-xysp-arrow::after,
.grid-2-col-action > details > summary .ro-aipick-arrow::after { content: ' ▸' !important; }
.grid-2-col-action > details[open] > summary .ro-xysp-arrow::after,
.grid-2-col-action > details[open] > summary .ro-aipick-arrow::after { content: ' ▾' !important; }
/* 展开 → 这一格占满整行（脚本同步 .is-open，:has 兜底老内核没有也能用） */
.grid-2-col-action.is-open,
.grid-2-col-action:has(> details[open]) { grid-template-columns: minmax(0, 1fr); }
/* 展开后的正文：贴住卡片左右 10px 留白，不许横向溢出去 */
.grid-2-col-action > details > summary + * { margin-top: 12px; }
.grid-2-col-action .ro-xysp-filter,
.grid-2-col-action .ro-xysp-pics,
.grid-2-col-action .ro-xysp-note,
.grid-2-col-action .ro-aipick-body { min-width: 0; max-width: 100%; }
/* 【防截图口径】晒票这一格挪到了 #article 外面（要和 GPT 并排），
   所以这里补一条：锁定时图片墙照样糊掉、点不动 —— 和其它区块一致。
   GPT 摇号面板不糊（用户要在这状态摇号）。 */
html.locked .ro-xysp .ro-xysp-pics { filter: blur(24px) grayscale(1); pointer-events: none; }
/* 320 窄屏：字号 / 内边距各收一档，两列不挤爆、不横向溢出 */
@media (max-width: 360px) {
  .grid-2-col-action { gap: 8px; }
  .grid-2-col-action .title { font-size: 14px !important; }
  .grid-2-col-action .sub { font-size: 10px !important; }
  .grid-2-col-action .action-text { font-size: 10px !important; }
  .grid-2-col-action > details.action-card-btn > summary { padding: 12px 8px !important; margin: 0 -8px !important; }
  .grid-2-col-action > details.action-card-btn { padding: 0 8px !important; }
  .grid-2-col-action > details.action-card-btn[open] { padding-bottom: 10px !important; }
}
</style>
<!-- __DEVICE_GATE_CSS__ / __INSTALL_APP_CSS__ 两段共用样式（device-gate.mjs）
     放在 </head> 之前 → 电脑端第一帧就是"隐藏"状态，不会先闪出内容再被盖住。 -->
<style>${DEVICE_GATE_CSS}${INSTALL_CSS}${CHAT_CSS}/* __TOOLS_GRID__ 智能分析：8 个入口 + 全屏子页面（用户 2026-10-18 要求）
   ------------------------------------------------------------
   入口 = 4 列网格 8 张图标卡（不是裸 button：div role="button" tabindex="0"）；
   子页面 = position:fixed 全屏覆盖（z-index 高），自带「← 返回」。
   页面里【没有 alert()】：所有提示都在页面内展开。
   颜色全部走 --ro-* 变量（米杏主题），不引任何外部图表库。 */
.tools-box { background: var(--ro-card); border: 1px solid var(--ro-line); border-radius: 12px; padding: 12px; margin: 0 12px 12px; }
/* 标题行：用户 2026-10-18「把『工具（智能分析）』字体居中，『点开看』不要了」
   → 居中单行；右边那句已经删掉（.tools-note 样式留着不碍事，页面上没有这个元素） */
.tools-head { display: flex; justify-content: center; align-items: center; margin-bottom: 10px; gap: 8px; }
.tools-title { font-size: 14px; font-weight: 700; color: var(--ro-fg); }
.tools-note { font-size: 11px; color: var(--ro-fg2); white-space: nowrap; }
.tool-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.tool-item { background: #fffaf2; border: 1px solid var(--ro-line); border-radius: 10px;
  padding: 10px 2px; text-align: center; cursor: pointer; min-width: 0;
  -webkit-tap-highlight-color: transparent; }
.tool-item:active { background: #f9efdd; }
.tool-item:focus-visible { outline: 2px solid var(--ro-ok); outline-offset: 1px; }
.tool-item .icon { font-size: 20px; line-height: 1.2; }
.tool-item .name { font-size: 11px; font-weight: 700; color: var(--ro-fg); margin-top: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---------- 子页面（全屏覆盖） ---------- */
.tool-view { position: fixed; inset: 0; background: var(--ro-bg); z-index: 100000;
  display: none; flex-direction: column; }
.tool-view.on { display: flex; }
.tool-view-head { display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  background: var(--ro-card); border-bottom: 1px solid var(--ro-line);
  position: sticky; top: 0; z-index: 2; }
.tool-back { font-size: 14px; color: var(--ro-ok); font-weight: 700; cursor: pointer;
  padding: 4px 8px; margin-left: -8px; border-radius: 8px;
  -webkit-tap-highlight-color: transparent; }
.tool-back:active { background: #f9efdd; }
.tool-view-title { font-size: 15px; font-weight: 700; color: var(--ro-fg); }
.tool-view-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: 12px 12px 28px; }
.tv-card { background: #fff; border: 1px solid var(--ro-line); border-radius: 10px;
  padding: 12px; margin-bottom: 10px; }
.tv-h { font-size: 13px; font-weight: 700; color: var(--ro-fg); margin-bottom: 8px; }
.tv-h span { font-weight: 400; font-size: 11px; color: var(--ro-fg2); margin-left: 6px; }
.tv-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px;
  padding: 5px 0; border-bottom: 1px solid #f4ead6; }
.tv-row:last-child { border-bottom: 0; }
.tv-k { color: var(--ro-fg2); flex: 0 0 auto; }
.tv-v { font-weight: 700; color: var(--ro-fg); text-align: right; overflow-wrap: break-word; word-break: break-word; }
.tv-v em { font-style: normal; color: var(--ro-danger); }
.tv-note { font-size: 11.5px; color: #a89a80; line-height: 1.6; margin-top: 6px; }
.tv-none { font-size: 13px; color: var(--ro-fg2); line-height: 1.75; }
.tv-none b { display: block; font-size: 14px; color: var(--ro-fg); margin-bottom: 4px; }
/* 彩种 / 号码区 切换胶囊 */
.tv-seg { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.tv-chip { flex: 0 0 auto; padding: 5px 10px; border: 1px solid var(--ro-line);
  border-radius: 999px; background: #fffaf2; color: var(--ro-fg2); font-size: 12px;
  font-weight: 600; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.tv-chip.on { background: var(--ro-ok); border-color: var(--ro-ok); color: #fff; }
.tv-chip:active { background: #f9efdd; }
.tv-chip.on:active { background: var(--ro-ok); }
/* 简单表格（明细） */
.tv-tbl { width: 100%; border-collapse: collapse; font-size: 11.5px; table-layout: fixed; }
/* 列宽：期号窄一点、和值/跨度固定小列，把剩下的宽度全给「号码」列
   （不这么分，双色球 6 个号会被省略号切掉 —— 实测 320 下只剩「5 21 22 2…」） */
.tv-tbl th:nth-child(1) { width: 64px; }
.tv-tbl th:nth-child(3), .tv-tbl th:nth-child(4) { width: 40px; }
.tv-tbl th, .tv-tbl td { padding: 4px 2px; text-align: center; border-bottom: 1px solid #f4ead6;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tv-tbl th { color: var(--ro-fg2); font-weight: 600; }
.tv-tbl td { color: var(--ro-fg); font-weight: 600; }
.tv-tbl td.l { text-align: left; }
/* 遗漏格：号码 + 当前遗漏 */
.tv-cells { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 5px; }
.tv-cell { border: 1px solid var(--ro-line); border-radius: 8px; background: #fffaf2;
  padding: 4px 0; text-align: center; line-height: 1.25; }
.tv-cell b { display: block; font-size: 12.5px; color: var(--ro-fg); }
.tv-cell i { display: block; font-style: normal; font-size: 10.5px; color: var(--ro-fg2); }
.tv-cell.hot i { color: var(--ro-ok); font-weight: 700; }
.tv-cell.bad { border-color: var(--ro-danger); background: #fdeeee; }
.tv-cell.bad b, .tv-cell.bad i { color: var(--ro-danger); font-weight: 700; }
/* 走势折线（内联 SVG，不用图表库） */
.tv-spark { display: block; width: 100%; height: 96px; }
.tv-spark-x { display: flex; justify-content: space-between; font-size: 10.5px;
  color: var(--ro-fg2); margin-top: 2px; }
.tv-legend { display: flex; gap: 12px; font-size: 11px; color: var(--ro-fg2); margin-top: 6px; }
.tv-legend i { display: inline-block; width: 10px; height: 3px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
/* 横向条形（热度） */
.tv-bar { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 0; }
.tv-bar b { flex: 0 0 46px; font-weight: 700; color: var(--ro-fg); }
.tv-bar span { flex: 1; height: 8px; border-radius: 4px; background: #f1e5cf; overflow: hidden; display: block; }
.tv-bar span i { display: block; height: 100%; border-radius: 4px; background: var(--ro-ok); }
.tv-bar em { flex: 0 0 auto; font-style: normal; color: var(--ro-fg2); font-size: 11px; min-width: 46px; text-align: right; }
.tv-bar.cold span i { background: #9db4c9; }
/* 页面内的操作条（不是裸 button） */
.tv-btn { display: inline-block; padding: 7px 14px; border-radius: 999px;
  background: var(--ro-ok); color: #fff; font-size: 12.5px; font-weight: 700;
  cursor: pointer; -webkit-tap-highlight-color: transparent; }
.tv-btn.ghost { background: transparent; color: var(--ro-ok); border: 1px solid var(--ro-ok); }
.tv-btn:active { opacity: .85; }
.tv-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
/* 随机号球 */
.tv-balls { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 2px; }
.tv-ball { width: 30px; height: 30px; line-height: 30px; border-radius: 50%; text-align: center;
  font-size: 13px; font-weight: 700; background: var(--ro-danger); color: #fff; }
.tv-ball.blue { background: #1f5fd6; }
.tv-ball.digit { border-radius: 8px; background: #fff; color: var(--ro-fg); border: 1px solid var(--ro-line); }
@media (max-width: 360px) {
  .tools-box { margin: 0 8px 10px; padding: 10px; }
  .tool-grid { gap: 6px; }
  .tool-item { padding: 8px 1px; }
  .tool-item .icon { font-size: 18px; }
  .tool-item .name { font-size: 10px; }
  .tool-view-body { padding: 10px 10px 24px; }
  .tv-tbl { font-size: 11px; }
  .tv-cells { grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); gap: 4px; }
}
/* __ENTRY2__ 已撤：那组「晒票 / 摇号」入口卡和页面上真正的那两张卡重复，
   已按要求把「晒票 + GPT模型摇号」做成区块级并排（.grid-2-col-action），
   入口就是卡片本身，不再单独放一组跳转卡。 */
.install-guide { margin: 16px 0 24px; background: #fff; border: 1px solid #e8d7bd; border-radius: 12px; padding: 10px; }
.install-guide svg { width: 100%; height: auto; display: block; border-radius: 8px; }
.install-guide-note { text-align: center; font-size: 12px; color: #8a7a63; font-weight: 700; margin-top: 10px; }
</style>
</head>
<body data-built="${nowStamp}" class="ro-toc-pending">
${DEVICE_GATE_BODY}
<div class="ro-wrap">
  <!-- ============================================================
       __HOT_OWNER__ 热度计数（只有本机 owner 看得到）
       用户 2026-10-17：「有个热度小图标和实时抓取ip人数 只要数字+热度小图标」
                        「我只想我自己刷新」→ 选 A：只有我能看到
       · 数字来自不蒜子（免费），口径 = 累计独立访客（UV，刷不动）
       · 别人的浏览器里这段是 display:none，完全看不到
       · 拿不到数字（不蒜子挂了/被墙）→ 整个隐藏，不显示 0 或 --
       ============================================================ -->
  <div class="ro-hot" id="ro-hot" hidden>
    <span class="ro-hot-i" aria-hidden="true">🔥</span><span class="ro-hot-n" id="busuanzi_value_site_uv">--</span>
  </div>

  <!-- ============================================================
       __TOP_TABS__ 顶部 Tab（彩票推荐 / 足球竞彩）+ 管理员徽章
       用户设计：flex 横排 · 底部 1px 边框 · 未选中灰、选中绿+2px 短线。
       ⚠️ 都是 <a>（页面不变量：没有按钮标签）。
       ⚠️ 「足球竞彩」跳的是足球页；当前页（彩票推荐）带 .on。
       徽章 #owner-badge 是原有元素（owner 才显示），放在 Tab 条正下方、靠右，
       不再用 fixed 浮在右上角（那样会压住第二个 Tab）。
       ============================================================ -->
  <div class="top-tabs">
    <a class="tab on" href="./" data-tab-home="1">彩票推荐</a>
    <a class="tab" href="足球推荐.html">竞彩/足球</a>
  </div>
  <!-- 管理员徽章：从原来的 fixed 浮层（top:10/right:10/z-index:99999）挪到这里 ——
       Tab 条正下方的一行，靠右，流内定位。仍然只有 html.is-owner 才显示。 -->
  <div id="owner-badge" aria-hidden="true">管理员模式 · 本机可截图</div>
  <script>
  /* __TOP_TABS_HOME__ Tab1「彩票推荐」的地址按协议切换（零存储 · 零外部依赖）：
     · 线上（http / https）→ "./"     = 站点根 index.html，和原来完全一致
     · 本机（file://）     → "只读分享版.html"
       因为 file:// 下 "./" 会被浏览器当成【目录索引】，一点就离开本页，
       还会把整个项目目录列出来。 */
  (function () {
    try {
      if (String(location.protocol) !== 'file:') return;
      var a = document.querySelector('.top-tabs .tab[data-tab-home]');
      if (a) a.setAttribute('href', '只读分享版.html');
    } catch (e) {}
  })();
  </script>

  <!-- ============================================================
       【防截图 · 保护容器 #article】
       用户要求：只有他自己（本机 App 的 file:// 协议，或公网 IP 命中）
       可以截图，别人打开时一旦切窗口 / 按 PrintScreen 就把内容模糊掉。
       ⚠️ 为什么拆成 #article + #article-rest 两段：
          CSS 的 filter 会作用在【整棵子树】上，子元素没法把自己「取消模糊」，
          所以要把【豁免区】（GPT模型摇号面板）放在 #article 之外。
          拆成两个纯 div 不影响任何排版（.ro-wrap 里没有 > 子选择器）。
       豁免区：.ro-aipick（GPT模型摇号面板）—— locked 时仍然清晰、可点。 -->
  <div id="article">

  <div class="ro-top">
    <h1>春风十里送大奖</h1>
  </div>

  ${statusHtml}

  <!-- ============================================================
       【智能分析工具栏】8 个入口（用户 2026-10-18 设计）
       ------------------------------------------------------------
       位置：主标题 + 状态卡之后、推荐图目录之前 —— 打开页面就能看到，
             但不抢标题的位置（原来放在 h1 上面，读起来像"页面从工具栏开始"）。
       形态：4 列网格 · 8 张图标卡，米杏卡片底。
       ⚠️ 每张卡都是 <div role="button" tabindex="0">（页面不变量：没有按钮标签），
          点一下进全屏子页面，子页面自带「← 返回」。
       ⚠️ 8 个子页面的数据纪律：能算的从本页开奖数据现算；
          算不出的写「暂不支持」；AI推荐 是系统随机并已标注 —— 绝不编数字。
       ============================================================ -->
  <div class="card-box tools-box" id="toolsBox">
    <div class="tools-head"><span class="tools-title">工具（智能分析）</span></div>
    <div class="tool-grid">
      <div class="tool-item" role="button" tabindex="0" data-tool="stat"><div class="icon">📊</div><div class="name">数据统计</div></div>
      <div class="tool-item" role="button" tabindex="0" data-tool="trend"><div class="icon">📈</div><div class="name">趋势分析</div></div>
      <div class="tool-item" role="button" tabindex="0" data-tool="hot"><div class="icon">🔥</div><div class="name">实时热点</div></div>
      <div class="tool-item" role="button" tabindex="0" data-tool="ma"><div class="icon">〽️</div><div class="name">均线分析</div></div>
      <div class="tool-item" role="button" tabindex="0" data-tool="index"><div class="icon">🎯</div><div class="name">指数预测</div></div>
      <div class="tool-item" role="button" tabindex="0" data-tool="omit"><div class="icon">📉</div><div class="name">遗漏宝</div></div>
      <div class="tool-item" role="button" tabindex="0" data-tool="pattern"><div class="icon">🧩</div><div class="name">智能规律</div></div>
      <div class="tool-item" role="button" tabindex="0" data-tool="ai"><div class="icon">🤖</div><div class="name">AI推荐</div></div>
    </div>
  </div>

  <!-- ============================================================
       【手机目录表格 · 方案 D】只在窄屏（<=1365px）显示：
       宽屏保持 5 组并排 .ro-imagepair（这里被 CSS 隐藏，一点不动它）。
       格子是 <a>（页面不变量要求没有按钮标签），href 指向每张图前面的锚点。
       JS 挂掉时（body 上还有 ro-toc-pending 标记）整块不显示，
       不会出现「点了没反应」的死格子。 -->
  ${tocHtml}

  <!-- ============================================================
       【开机号 + 热力图 · 并排两列】用户 2026-10-18：
         「把开机号和热力图改成并排两列」
       一行两个卡片：左 = 开机号入口（<a href="#ro-kjh">），右 = 热力图折叠卡。
       点开热力图 → 它占满整行（图片要宽），见样式表最后那段「⑧ 并排两列」。
       下面是开机号点开后的区块（平时不显示，.ro-open 才展开）—— 仍然整行，
       因为它是一整张表，塞进半屏会挤。
       ⚠️ 改的只是外面这层容器，两张卡的内容 / 点击 / 折叠逻辑一个字没改。 -->
  ${toolsHeatHtml}

  ${kjhHtml}

  <!-- ============================================================
       【热力图 · 实时跟随下一期彩种】
       ------------------------------------------------------------
       用户 2026-10-18：
         「热力图点击可以收起展开 展开就是热力图」
         「热力图根据下一期开大乐透还是双色球来实时更新 时时刻刻显示 去掉以前的定时」
       这一段只做两件事：
         ① 折叠：<details> 自带，本段只负责「展开时补一次渲染 + 等比缩放」
                （收起状态下容器宽 0，图片的等比缩放量不出来）
         ② 实时：页面打开 / 切回来 / 重新显示时【按当前时间】重算
                「下一期是哪个彩种」，只换显示、不轮询、不定时。
                彩种判断用的是上面那份 hmNextGame（和服务端同一份源码）。
       ⚠️ 没有 setInterval：定时器已按要求去掉；页面不动就不会反复计算。
       ============================================================ -->
  <script>
  ${HM_NEXT_SRC}
  (function () {
    var box = null;
    try { box = document.getElementById('ro-heatmap'); } catch (e0) { box = null; }
    if (!box) return;

    var NAME = { ssq: '双色球', dlt: '大乐透' };

    /* 【并排两列 · 2026-10-18】展开 → 热力图占满整行（.grid-2-col 从两列变一列）。
       支持 :has() 的浏览器纯 CSS 就生效（见样式表 __LAYOUT__ ⑧），
       这里再加一个 class 兜底（老内核没有 :has 也不会把图挤在半屏里）。
       ⚠️ 只加 / 减一个 class，折叠本身仍然完全由 <details> 管。 */
    var rowBox = null;
    try { rowBox = box.parentNode; } catch (eR) { rowBox = null; }
    function syncRow() {
      try {
        if (!rowBox || !rowBox.classList) return;
        if (box.open) rowBox.classList.add('is-open');
        else rowBox.classList.remove('is-open');
      } catch (eR2) { /* 忽略 */ }
    }

    /* 这个彩种下一期的期号：热力图数据里有就用它，没有就按开奖数据现算 */
    function issueOf(gid) {
      try {
        var H = (typeof HEATMAP_DATA !== 'undefined' && HEATMAP_DATA && HEATMAP_DATA.games)
          ? HEATMAP_DATA.games[gid] : null;
        if (H && H.issue) return String(H.issue);
      } catch (e1) { /* 忽略 */ }
      try { if (typeof nextIssueFor === 'function') return String(nextIssueFor(gid) || ''); } catch (e2) { /* 忽略 */ }
      return '';
    }

    /* 按当前时间选彩种 → 换显示 → 更新副标题 */
    function sync() {
      var gid = 'ssq';
      try { gid = hmNextGame((new Date()).getTime()) || 'ssq'; } catch (e) { gid = 'ssq'; }

      var blocks = box.querySelectorAll('[data-ro-hm-game]');
      var hit = false;
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].getAttribute('data-ro-hm-game') === gid) {
          hit = true;
          blocks[i].removeAttribute('hidden');
        } else {
          blocks[i].setAttribute('hidden', 'hidden');
        }
      }
      var noneEl = box.querySelector('[data-ro-hm-none]');
      if (noneEl) {
        if (hit) noneEl.setAttribute('hidden', 'hidden');
        else noneEl.removeAttribute('hidden');
      }
      var subEl = box.querySelector('[data-ro-hm-sub]');
      if (subEl) {
        var iss = issueOf(gid);
        /* ⚠️ 期号可能暂时拿不到：这段脚本比页尾那批数据脚本先执行
              （HEATMAP_DATA / nextIssueFor 还没定义），这时【不要】把服务端
              已经写好的「当前：双色球 第 2026119 期」擦成半截，
              等 DOMContentLoaded / load 再算一次（下面绑了）。 */
        if (iss) subEl.textContent = '当前：' + (NAME[gid] || '') + ' 第 ' + iss + ' 期';
      }
      try {
        if (document.body && document.body.setAttribute) {
          document.body.setAttribute('data-heatmap-game', gid);
        }
      } catch (e3) { /* 忽略 */ }
      try { if (typeof window.__roFit === 'function') window.__roFit(); } catch (e4) { /* 忽略 */ }
      return gid;
    }

    /* 收起 / 展开 */
    try {
      box.addEventListener('toggle', function () {
        /* 【并排两列】先同步「整行 / 半屏」再决定要不要补渲染 */
        syncRow();
        if (!box.open) return;
        /* 展开后补一次渲染（收起时图位在 display:none 里） */
        try { if (typeof window.__roRenderAll === 'function') window.__roRenderAll(); } catch (e) { /* 忽略 */ }
        sync();
        setTimeout(function () {
          try { if (typeof window.__roFit === 'function') window.__roFit(); } catch (e2) { /* 忽略 */ }
        }, 60);
      });
    } catch (e5) { /* 忽略 */ }

    sync();
    syncRow();

    /* 「实时」= 不轮询：打开 / 切回来 / 重新显示时各算一次 */
    try { document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); }); } catch (e6) { /* 忽略 */ }
    try { window.addEventListener('pageshow', function () { sync(); }); } catch (e7) { /* 忽略 */ }
    try { window.addEventListener('focus', function () { sync(); }); } catch (e8) { /* 忽略 */ }
    /* 上面那句 sync() 跑得比页尾的数据脚本早（那时候还拿不到期号），
       所以在 DOMContentLoaded / load 各补算一次 —— 一次都不能少，否则副标题只写半个。 */
    try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { sync(); }); } catch (e6b) { /* 忽略 */ }
    try { window.addEventListener('load', function () { sync(); }); } catch (e7b) { /* 忽略 */ }

    /* 带 #ro-heatmap 直接打开时（老链接）→ 直接展开，别让用户点一下才发现空 */
    try {
      if (String(location.hash || '').indexOf('#ro-heatmap') === 0) { box.open = true; syncRow(); }
    } catch (e9) { /* 忽略 */ }
    /* 页内跳到 #ro-heatmap（同页改 hash 不会重载）→ 也要展开 */
    try {
      window.addEventListener('hashchange', function () {
        if (String(location.hash || '').indexOf('#ro-heatmap') === 0) {
          box.open = true;
          syncRow();
          sync();
        }
      });
    } catch (e10) { /* 忽略 */ }
  })();
  </script>

  <!-- 【开机号】点入口后把区块滚到视口顶部。
       为什么要有这几行：区块平时是 display:none，靠 CSS :target 展开；
       而浏览器「跳到锚点」这一步，在元素刚从 display:none 变显示的那一刻
       并不总是执行（实测无头 Chrome 时灵时不灵）—— 补一次 scrollIntoView 才稳。
       显示本身仍然只靠 CSS：这段脚本挂了/被禁，区块照样能展开，功能不丢。 -->
  <script>
  (function () {
    try {
      
      /* __CLASS_TOGGLE__ 【点一下展开 / 再点一下收起】
       user request: 点击一下展开，再点击一下收起来。
       ⚠️ 为什么不用 :target + replaceState：
          history.replaceState 清掉哈希后，浏览器【不会】重新计算 :target，
          所以「再点一下」收不起来。改用 class 控制，行为确定。
       CSS 侧：.ro-panel{display:none} .ro-panel.ro-open{display:block}
       :target 规则仍然保留（脚本被禁时还能靠锚点展开，功能不丢）。 */
      /* 【必须放在最前面】下面两段都要用它；原来定义在最后，
         脚本一执行 OK 还是 undefined，一读 OK[...] 就抛 TypeError，
         整段脚本崩溃 → 点击监听根本没绑上 → 区块点不开。 */
      /* 现在只有「开机号」还走这套 class 折叠；
         热力图改成了 <details>（见上面对应的那段脚本），不在这张表里。 */
      var OK = { '#ro-kjh': 1 };

      /* __COPY_LIVE__ 【点击复制链接】
         微信把 yiqicai.com 拉黑了，点外链跳不过去 → 改成复制到剪贴板，
         用户自己粘到浏览器打开。
         用 <a>（不是按钮标签），点一下复制 + 把文案临时改成「已复制」。 */
      var copyEls = document.querySelectorAll('[data-ro-copylive]');
      for (var ci = 0; ci < copyEls.length; ci++) {
        copyEls[ci].addEventListener('click', function (e) {
          var url = String(this.getAttribute('data-copy') || this.getAttribute('href') || '');
          e.preventDefault();
          var self = this;
          var done = function (ok) {
            var old = self.getAttribute('data-orig') || self.textContent;
            if (!self.getAttribute('data-orig')) self.setAttribute('data-orig', old);
            self.textContent = ok ? '已复制 ✅ 请到浏览器粘贴打开' : '复制失败，请长按此处选择复制';
            setTimeout(function () {
              self.textContent = self.getAttribute('data-orig') || old;
            }, 2600);
          };
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
            } else {
              var ta = document.createElement('textarea');
              ta.value = url;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.select();
              var ok = false;
              try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
              document.body.removeChild(ta);
              done(ok);
            }
          } catch (err) { done(false); }
        });
      }

      function roCloseAll() {
        var ps = document.querySelectorAll('.ro-panel');
        for (var k = 0; k < ps.length; k++) ps[k].classList.remove('ro-open');
      }
      var tools = document.querySelectorAll('.ro-tool');
      for (var t = 0; t < tools.length; t++) {
        tools[t].addEventListener('click', function (e) {
          var href = String(this.getAttribute('href') || '');
          if (!OK[href]) return;
          e.preventDefault();
          var el = document.getElementById(href.slice(1));
          if (!el) return;
          var wasOpen = el.classList.contains('ro-open');
          roCloseAll();
          if (wasOpen) {
            try {
              var tip2 = this.querySelector ? this.querySelector('[data-tip]') : null;
              if (tip2 && tip2.getAttribute('data-orig')) tip2.textContent = String(tip2.getAttribute('data-orig'));
            } catch (e) { /* 忽略 */ }
            /* 再点一下 → 收起；顺便把哈希清掉（保持一致） */
            try { history.replaceState(null, '', location.pathname + location.search); }
            catch (err) { /* 忽略 */ }
            return;
          }
          el.classList.add('ro-open');
          /* 【提示文字随状态变】展开后把那句改成「点击收起」 */
          try {
            var tipEl = this.querySelector ? this.querySelector('[data-tip]') : null;
            if (tipEl && !tipEl.getAttribute('data-orig')) {
              tipEl.setAttribute('data-orig', tipEl.textContent);
            }
            if (tipEl) tipEl.textContent = String(tipEl.getAttribute('data-orig') || '').replace('点击查看', '点击收起');
          } catch (e) { /* 忽略 */ }
          try { history.replaceState(null, '', href); } catch (err) { /* 忽略 */ }
          try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          catch (err) { try { el.scrollIntoView(true); } catch (e2) { /* 忽略 */ } }
        });
      }
      /* 带 #ro-kjh 直接打开时，也要把 class 加上（跟 :target 对齐） */
      (function () {
        var id = String(location.hash || '');
        if (!OK[id]) return;
        var el = document.getElementById(id.slice(1));
        if (el) {
          el.classList.add('ro-open');
        }
      })();

      function go() {
        var id = String(location.hash || '');
        if (!OK[id]) return;
        var el = document.getElementById(id.slice(1));
        if (!el) return;
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        catch (e) { try { el.scrollIntoView(true); } catch (e2) { /* 忽略 */ } }
      }
      window.addEventListener('hashchange', function () { setTimeout(go, 30); });
      if (location.hash) window.addEventListener('load', function () { setTimeout(go, 60); });
    } catch (e) { /* 忽略：区块的显示不依赖这段 */ }
  })();
  </script>

  </div><!-- /#article · 到这里为止的内容会被防截图模糊 -->

  <!-- ============================================================
       __ACTION_2COL__ 晒票 + GPT模型摇号：并排两列（用户 2026-10-18）
       ------------------------------------------------------------
       用户原话：「晒票和 GPT模型摇号 也做成并排两列，跟开机号+热力图
                 那行同样式」，并给了 .grid-2-col-action / .action-card-btn
       这套 CSS（变量已映射到米杏主题，见样式表最后那段 ⑨）。
       · 两格都是【原来那两张卡，机制一个字没改】：
           左 = <details class="ro-xysp action-card-btn"> 原生折叠
           右 = <details class="ro-aipick action-card-btn"> 原生折叠
         折叠仍然由 <details>/<summary> 管；「展开 ▸ / 收起 ▾」还是 CSS
         伪元素按 [open] 换字 —— 没有 onclick、没有裸 button。
       · 收起 = 两列各占一半；任一格展开 → 它占满整行（图 / 面板要宽），
         和热力图那一行同一套 .is-open 同步（见页尾那段脚本）。
       · ⚠️ 这一行【故意】放在 #article 之后：GPT摇号 在防截图锁定时必须
         仍能点（用户要自己摇号）；晒票的图片区在锁定时由样式表补一条
         模糊（html.locked .ro-xysp-pics），保护口径没有变松。
       ============================================================ -->
  <div class="grid-2-col-action" id="ro-action-2col">
  ${xyspHtml}
  ${aiPickHtml}
  </div>
  <script>
  /* __ACTION_2COL__ 展开哪一格，哪一格就占满整行（和热力图那行同一套做法）。
     ⚠️ 只加 / 减一个 class，折叠本身完全由 <details> 管；
        现代内核 CSS 的 :has() 也已经能自己搞定，这里是老内核的兜底。 */
  (function () {
    try {
      var row = document.getElementById('ro-action-2col');
      if (!row || !row.querySelectorAll) return;
      var ds = row.querySelectorAll('details');
      if (!ds.length) return;
      function sync() {
        var open = false;
        for (var i = 0; i < ds.length; i++) if (ds[i].open) { open = true; break; }
        if (open) row.classList.add('is-open');
        else row.classList.remove('is-open');
      }
      for (var k = 0; k < ds.length; k++) {
        ds[k].addEventListener('toggle', sync);
      }
      sync();
    } catch (e) { /* 忽略：布局兜底挂了，折叠本身照样能用 */ }
  })();
  </script>

  <div id="article-rest"><!-- 面板之后的内容：同样要防截图 -->

  ${latestSecHtml}

  ${expertsHtml}

  <!-- ============================================================
       【文章参考】用户要求：放在【最新开奖】下面、
       「推荐图目录 / 推荐图」上面（= 原来「彩票推荐图」分隔条的位置）。
       纯文字区块：不含任何图片，所以图位数量不变。 -->
  <!-- ============================================================
       __TREND_ENTRY__ 「走势图」入口 —— 用户要求放在【文章参考】上面。
       【本轮改版】原来是 <a href> 跳去独立页；上一版改成 <details> 里
       嵌一个独立页的小窗口。2026-10-17 用户再明确一次：
         「留在近30期走势预选参考里面. 删除单独走势图独立页」
       → 展开体里【直接内联走势图内容】（表格 + 工具栏 + 画线脚本），
         独立页已删除，页面上不再有任何指向它的链接。
       ⚠️ 折叠机制和「晒票 / GPT模型摇号」同一套：<details> + <summary>，
          「点击查看 / 点击收起」由 CSS 伪元素按 [open] 切换，
          不用 JS、不用裸 <button>（用户铁律）、不用裸 <div onclick>。
       ⚠️ 内联的那一块自己做了三件事（见 build-trend.mjs 的 renderTrendFragment）：
          ① 样式全部收进 .ro-trend-embed（分享页也有 .ro-wrap / .ro-top /
             .ro-status / .ro-foot / .btn，不收就波及整页）
          ② 脚本整段包 IIFE + 根节点 id 加前缀（和分享页共用 document）
          ③ 里面【没有】顶部那排页面标签（彩票推荐 / 竞彩·足球 / 走势图）
       ⚠️ 页面不变量：纯文字 + 表格，没有 <img> → data-image 不变（仍 21）。
       ============================================================ -->
  <details class="ro-trend" id="ro-trend">
    <summary class="ro-trend-head">
      <span class="ro-trend-h2">走势图</span>
      <span class="ro-trend-sub">近 30 期走势 · 预选参考</span>
      <span class="ro-trend-arrow" aria-hidden="true"></span>
    </summary>
    <div class="ro-trend-body">
${trendHtml}
    </div>
  </details>

  ${p3dHtml}

  ${articlesHtml}

  <div class="ro-divider"><span>彩票推荐图</span></div>

  ${sectionsHtml}

  ${hitSecHtml}

  <div class="ro-foot">
    本页面为只读分享版，仅供观看，无法修改。<br>
    彩票有风险，投注需谨慎。以上内容仅为个人分析，不构成购彩建议，请理性参与。
  </div>

  <!-- 免责声明（页面最底部，独立区块；浅灰小字，不弹窗、不遮挡） -->
  <div class="ro-disclaimer">
    <h3>免责声明</h3>
    <p>本页所有内容均为公开信息的统计整理，仅供娱乐与数据参考，不构成任何购彩建议，也不承诺任何中奖结果。彩票开奖为独立随机事件，请理性购彩，量力而行。</p>
    <p>未满 18 周岁禁止购买彩票。</p>
  </div>

  </div><!-- /#article-rest · 防截图模糊区结束 -->

</div>

<!-- ============================================================
     【防截图】遮罩 + 动态水印 + 管理员徽章
     ------------------------------------------------------------
     ⚠️ 这三个【必须放在 .ro-wrap 外面、body 直下】：
        .ro-wrap 里的 #article / #article-rest 在 locked 时会被加 filter，
        而 filter 会给后代建立新的包含块 —— 那样 position:fixed 的遮罩
        就不再相对视口定位了（会跟着内容跑）。
     层级：遮罩 99998；豁免面板 .ro-aipick 抬到 99999 压在遮罩上。
     ⚠️ 都是纯 div，没有按钮标签（页面不变量：按钮标签数 = 0）。
     ⚠️ 【没有水印层】—— 用户明确说「不要水印」，那一层已经整个删掉。 -->
<div id="mask" aria-hidden="true">
  <div class="icon">🔒</div>
  <div>检测到截图或窗口切换</div>
  <div>内容已自动隐藏</div>
  <div class="tip">请回到页面继续阅读（4 秒后自动恢复）</div>
</div>
<!-- 管理员徽章已经挪到页面顶部 Tab 条下面（见 __TOP_TABS__ 那段），这里不再重复放。 -->

${inlineScriptsHtml}
<script>
/* ============================================================
   【自愈】页面确实旧了就整页刷新（兜底）
   ------------------------------------------------------------
   手机浏览器（尤其微信内置）会把页面缓存很久，
   导致「电脑上更新了、手机上还是旧的」。
   这段代码拿云端的号码文件时间和页面生成时间对比，
   页面确实旧、而且页尾的【准实时】逻辑又没能就地换过来时，
   才带一个【每次都不相同】的尾巴重新加载整页。

   【两个坑都修了】
   1) 时间比较：以前直接拿 publishedAt（UTC、'T' 分隔）和 data-built
      （北京时间）比字符串 —— UTC 比北京早 8 小时，几乎永远比不赢，
      所以这段以前基本不触发。现在统一转成北京时间再比。
   2) 不和准实时机制打架：页尾的准实时逻辑能就地重渲染成功时不刷新整页；
      只有「数据是新的、但页面没能显示出来」才刷新兜底。
   ============================================================ */
(function () {
  try {
    var shown = document.body.getAttribute('data-built') || '';
    if (!shown) return;

    /* 防止无限刷新：同一分钟内只自愈一次 */
    var last = Number(sessionStorage.getItem('cdd.selfheal') || 0);
    if (last && Date.now() - last < 60000) return;

    /* 把 ISO(UTC) 和「YYYY-MM-DD HH:MM」统一成【北京时间的可比较字符串】。
       不带时区的当成北京时间（saved-tickets.js / data-built 都是这种），
       输出精确到分钟，和 data-built 的精度一致。 */
    function toBeijingKey(s) {
      if (!s) return '';
      var str = String(s).trim();
      var d;
      if (/T/.test(str) || /Z$/.test(str)) {
        d = new Date(str);                                  /* ISO(UTC) */
      } else {
        d = new Date(str.replace(' ', 'T') + '+08:00');      /* 北京时间 */
      }
      if (isNaN(d.getTime())) return '';
      var bj = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
      var p = function (n) { return String(n).padStart(2, '0'); };
      return bj.getFullYear() + '-' + p(bj.getMonth() + 1) + '-' + p(bj.getDate()) +
             ' ' + p(bj.getHours()) + ':' + p(bj.getMinutes());
    }
    window.__toBeijingKey = toBeijingKey;   /* 方便自测 / 排查 */

    function selfHealReload() {
      sessionStorage.setItem('cdd.selfheal', String(Date.now()));
      location.replace(location.pathname + '?t=' + Date.now());
    }

    function decide(j) {
      if (!j) return;
      var remoteKey = toBeijingKey(j.publishedAt) || toBeijingKey(j.updated);
      var mineKey = toBeijingKey(shown);
      if (!remoteKey || !mineKey) return;
      if (remoteKey <= mineKey) return;          /* 页面不比云端旧，什么都不做 */

      /* 页尾的准实时逻辑已经就地换成新号码、图也是正常实时渲染的
         → 页面上已经是新号码了，不用刷新整页 */
      var applied = false;
      var renderMode = '';
      try { applied = !!window.__roLiveApplied; } catch (e2) { /* 忽略 */ }
      try { renderMode = document.body.getAttribute('data-render') || ''; } catch (e3) { /* 忽略 */ }
      if (applied && renderMode !== 'fallback') return;

      /* 数据是新的，但页面没能就地显示出来（渲染兜底 / 脚本没跑）
         → 整页刷新兜底 */
      selfHealReload();
    }
    window.__roSelfHealDecide = decide;   /* 方便自测 / 排查 */

    /* 【离线单文件 · 不拉】file:// 下 tickets.json 必然 404（它只发布在网站根目录）
       → 这一条自愈用的请求也跳过，控制台干干净净。
       注意：这段只管「要不要整页刷新」，不拉就没有远程时间可比 → 不刷新（离线本来就该保持原样）。 */
    if (String(location.protocol || '') !== 'file:') {
      fetch('tickets.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          /* 等页尾的准实时逻辑先跑完，再决定要不要刷新整页（免得跟它抢） */
          var p = (typeof window.__roLivePromise !== 'undefined') ? window.__roLivePromise : null;
          var later = function () { setTimeout(function () { decide(j); }, 0); };
          if (p && typeof p.then === 'function') p.then(later, later);
          else later();
        })
        .catch(function () { /* 网络问题就忽略，别影响浏览 */ });
    }
  } catch (e) { /* 忽略 */ }
})();
${RO_RENDER_SCRIPT}
/* ============================================================
   推荐图等比缩放
   ------------------------------------------------------------
   图片按 760px 设计宽度渲染，内部布局【完全不改】，
   手机上用 transform: scale() 整体缩小 ——
   这样和 App 里看到的一模一样，不会变形。

   【顺序】必须在实时渲染【之后】跑：
   实时渲染把图位内容整体换掉了，尺寸得重新量一遍。
   ============================================================ */
(function () {
  var BASE = 760;   /* 图片设计宽度，跟 .r-image 的宽度一致 */

  function fit() {
    var wraps = document.querySelectorAll('.ro-imagewrap');
    for (var i = 0; i < wraps.length; i++) {
      var w = wraps[i];
      /* 【全屏查看层】是它自己的缩放算法（等比铺满屏幕），
         不能被这里的「按容器宽度等比缩小」覆盖掉 */
      if (w.getAttribute && w.getAttribute('data-ro-mob') === '1') continue;
      var img = w.querySelector('.r-image');
      if (!img) continue;

      var avail = w.clientWidth;
      if (!avail) continue;

      var scale = avail / BASE;
      if (scale >= 1) {
        /* 屏幕够宽，原样显示 */
        img.style.transform = 'none';
        w.style.height = 'auto';
      } else {
        /* 等比缩小，内部布局一点不动 */
        img.style.transformOrigin = 'top left';
        img.style.transform = 'scale(' + scale + ')';
        /* 容器高度要跟着缩，否则下面会留一大块空白 */
        w.style.height = Math.round(img.offsetHeight * scale) + 'px';
      }
    }
  }

  window.__roFit = fit;

  /* 【顺序】上面的实时渲染是同步跑完的，这里直接适配一次；
     后面几处只是保险，字体异步加载完再重算。 */
  fit();
  /* 图片里的字体可能异步加载，多算几次更稳 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fit);
  }
  window.addEventListener('load', fit);
  window.addEventListener('resize', function () { setTimeout(fit, 60); });
  setTimeout(fit, 120);
  setTimeout(fit, 600);
  setTimeout(fit, 1500);
})();

/* ============================================================
   【口口】把要「两张图左右放」的图位两两包进一个并排容器
   ------------------------------------------------------------
   用户原话（最终版，最清楚的一次）：
     「我要的模板是两张图左右放，两张图一个版面比如：口口 这样的
      我要的是双色球的两个资料这样布局，大乐透也是
      排三和排五 七星彩和七乐彩这样的布局 快乐8和3D是这样布局」

   ⚠️ 配对单位是【图位 .ro-imagewrap】，不是【彩种区块 .ro-game】——
      因为前两组是「同一个彩种的两张图」（双色球的 main + wuxing），
      按彩种找区块根本区分不出来。

   配对表（左 / 右）：
     ① ssq/main   + ssq/wuxing    同一彩种两张图
     ② dlt/main   + dlt/wuxing    同一彩种两张图
     ③ pl3/main   + pl5/main
     ④ qxc/main   + qlc/main
     ⑤ fc3d/main  + kl8/main      （用户先说过「3D左边」，所以 3D 在左）

   彩种标题怎么处理：
     ③④⑤ 是「两个彩种」，容器放在【前一个彩种的区块内部】，
     两个 <section> 各自带着自己的 <h2> 一起进去 ⇒ 左右各有一个标题，一眼分得清。
     ①② 是「同一个彩种的两张图」，只把两个【图位】并排，
     <section> 和它的 <h2>「双色球」留在外面 ⇒ 标题只出现一次，不会重复。

   只做两件事：
     ① 建一个 .ro-imagepair 容器，把两张图的图位放进去（幂等）
     ② 重算 fit()：容器宽度变了，等比缩放的倍数得跟着重算
   ============================================================ */
(function () { /* __PAIR_V2__ 口口并排（验收脚本按这个标记提取这一段） */
  var PAIRS = [
    { left: 'ssq/main',   right: 'ssq/wuxing' },   /* ① 双色球：两张资料左右放 */
    { left: 'dlt/main',   right: 'dlt/wuxing' },   /* ② 大乐透：同上 */
    { left: 'pl3/main',   right: 'pl5/main'    },   /* ③ 排三 | 排五 */
    { left: 'qlc/main',   right: 'qxc/main'    },   /* ④ 七乐彩 | 七星彩（按用户布局图：七乐彩在左）*/
    { left: 'fc3d/main',  right: 'kl8/main'    }    /* ⑤ 3D（左） | 快乐8 */
  ];

  /* 按 (彩种, 图) 找那一个图位 —— 不用属性选择器拼字符串，
     直接比 dataset，属性顺序变了也不会失效。 */
  function wrapOf(gameId, imageKey) {
    var all = document.querySelectorAll('.ro-imagewrap');
    for (var i = 0; i < all.length; i++) {
      var w = all[i];
      if (w.getAttribute('data-game') === gameId &&
          w.getAttribute('data-image') === imageKey) return w;
    }
    return null;
  }
  /* 往上找最近的彩种区块（③④⑤ 要把整个 <section> 一起搬进去） */
  function sectionOf(node) {
    var n = node;
    while (n && n !== document.body) {
      if (n.className && String(n.className).split(/\s+/).indexOf('ro-game') >= 0) return n;
      n = n.parentNode;
    }
    return null;
  }
  /* 这个图位是不是【已经在】某个并排容器里了？
     ⚠️ 必须一路往上找，不能只看 parentNode：
        ① ② 并排后图位的父节点就是 .ro-imagepair，
        但 ③④⑤ 搬的是整个 <section>，图位的父节点仍是 .ro-game ——
        只查 parentNode 会让 ③④⑤ 每跑一次就再套一层容器（实测会从 5 变 8）。 */
  function alreadyPaired(node) {
    var n = node ? node.parentNode : null;
    while (n && n !== document.body) {
      if (n.className && String(n.className).split(/\s+/).indexOf('ro-imagepair') >= 0) return true;
      n = n.parentNode;
    }
    return false;
  }

  for (var p = 0; p < PAIRS.length; p++) {
    var li = PAIRS[p].left.split('/');
    var ri = PAIRS[p].right.split('/');
    var Lw = wrapOf(li[0], li[1]);
    var Rw = wrapOf(ri[0], ri[1]);
    /* 两个图位都得在，而且各自都还没被并排过（幂等；同一彩种只并排一次） */
    if (!Lw || !Rw || Lw === Rw) continue;
    if (alreadyPaired(Lw) || alreadyPaired(Rw)) continue;

    /* 容器插在【左边那张】原来的位置 */
    var box = document.createElement('div');
    box.className = 'ro-imagepair';
    box.setAttribute('data-pair', PAIRS[p].left + '+' + PAIRS[p].right);

    /* 同一个彩种（① ②）：只搬两个图位，<section> 和它的 <h2> 留在外面 */
    if (li[0] === ri[0]) {
      Lw.parentNode.insertBefore(box, Lw);
      box.appendChild(Lw);
      box.appendChild(Rw);
      continue;
    }

    /* 两个彩种（③ ④ ⑤）：把两整块 <section> 一起搬进来 —— 左右各自保留标题 */
    var Ls = sectionOf(Lw);
    var Rs = sectionOf(Rw);
    if (!Ls || !Rs || Ls === Rs) { box = null; continue; }
    Ls.parentNode.insertBefore(box, Ls);
    box.appendChild(Ls);
    box.appendChild(Rs);
  }

  /* 容器宽度变了 ⇒ 等比缩放倍数必须重算（__roFit 是上面那个 IIFE 暴露的 fit）。 */
  if (typeof window.__roFit === 'function') {
    window.__roFit();
    setTimeout(window.__roFit, 80);
    setTimeout(window.__roFit, 400);
  }
})();

/* ============================================================
   【手机目录 → 全屏查看层】ro-mob-view
   ------------------------------------------------------------
   用户原话：「对点一个图看那一张图 这张图是全屏清晰的」

   ⚠️ 这不是被删掉的那个「图片放大器」：
      · 那个是点图片弹遮罩的旧功能，入口是【点图片本身】，
        已经被用户要求整块删除（遮罩类名 / 光标放大类名 / 放大镜图标
        至今都是 0 处）
      · 这一层叫 ro-mob-view，入口【只有手机目录表格的格子】，
        图片本身【没有绑任何点击】—— 点图不会打开任何东西
      · 没有任何放大镜图标

   「全屏清晰」怎么做到的：
      1. 层铺满整个视口（position:fixed; inset:0），左右不留白
      2. 图仍然按 760px 设计宽度渲染，靠 transform: scale() 等比缩放
         —— 纵向和横向用【同一个】scale，所以绝不变形
      3. 初始按「整张图铺满屏宽」铺满（宽度方向占满 100vw）
      4. 点一下图 = 再放大一级（铺满屏宽 → 原始尺寸 1:1，循环）
      5. 层内可上下/左右滚动、可双指缩放（touch-action: pinch-zoom）

   关闭方式（4 种都支持）：
      · 右上角 ×
      · 点图的空白处（图片外面）
      · 手机返回键 / 浏览器后退（history.pushState + popstate）
      · Esc 键（电脑上）
   ============================================================ */
(function () {
  var view = null, holder = null, img = null, tip = null, scroller = null, count = null;
  var cur = null, zoom = 'fit', scale = 1, backTo = null;

  function build() {
    if (view) return view;
    view = document.createElement('div');
    view.className = 'ro-mob-view';
    view.setAttribute('hidden', '');
    view.innerHTML =
      '<div class="ro-mob-scroll"><div class="ro-mob-holder"></div></div>' +
      '<div class="ro-mob-x" role="button" aria-label="关闭">\u00d7</div>' +
      /* 【计数器】左上角「第 N / M 张」（用户给的设计：counter 左上、close 右上）。
         非相册时不显示。 */
      '<div class="ro-mob-count" hidden></div>' +
      '<div class="ro-mob-tip">点图再放大一级 \u00b7 双指可缩放 \u00b7 点空白 / \u00d7 / 返回键关闭</div>';
    document.body.appendChild(view);

    scroller = view.querySelector('.ro-mob-scroll');
    holder = view.querySelector('.ro-mob-holder');
    tip = view.querySelector('.ro-mob-tip');
    count = view.querySelector('.ro-mob-count');

    /* 关闭：右上角 × */
    view.querySelector('.ro-mob-x').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation(); close();
    });
    /* 关闭：点图片外的空白（点在图上 = 放大一级） */
    scroller.addEventListener('click', function (e) {
      var n = e.target;
      while (n && n !== scroller) {
        if (n === holder || n === img) { bumpZoom(); return; }
        n = n.parentNode;
      }
      close();
    });
    /* 关闭：Esc（电脑）；返回键由 popstate 处理 */
    document.addEventListener('keydown', function (e) {
      if (view && !view.hasAttribute('hidden') && (e.key === 'Escape' || e.keyCode === 27)) close();
    });
    return view;
  }

  /* ------------------------------------------------------------
     【全屏层里真正能放图的区域】
     .ro-mob-scroll 是铺满视口的滚动区，它上下各有内边距（54px / 66px，见上面的
     CSS），宽度方向没有内边距。fit 必须按【扣掉内边距之后】的区域算，
     不然「整张放得下」算出来还是会被上下的 × 和提示条压住。
     再留 4px 安全边，避免圆角 / 滚动条把最外一圈切掉。
     ------------------------------------------------------------ */
  var PAD_TOP = 54, PAD_BOTTOM = 66, SAFE = 4;

  function viewBox() {
    var vw = (scroller && scroller.clientWidth) || window.innerWidth || 390;
    var vh = (scroller && scroller.clientHeight) || window.innerHeight || 700;
    return {
      w: Math.max(80, vw - SAFE),
      h: Math.max(80, vh - PAD_TOP - PAD_BOTTOM - SAFE),
      vw: vw
    };
  }

  /* 量图的【实际渲染尺寸】：
     .r-image 自己带 overflow:hidden（styles.css），它画出来的范围就是它自己的盒子，
     所以 offsetWidth / offsetHeight 就是「整张图」的尺寸（760 × 内容高）。
     transform 不改布局尺寸 ⇒ 缩放后再量还是这两个数，可以反复调用。 */
  function measure() {
    var w = (img && img.offsetWidth) || 760;
    var h = (img && img.offsetHeight) || 100;
    return { w: w, h: h };
  }

  /**
   * 按缩放模式和实测尺寸算 scale。
   * 【关键】只算一个 scale，宽高同时乘它 —— 纵横比恒定，绝不变形。
   * fit：取【宽、高两个方向各自需要的缩放里较小的那个】⇒
   *      整张图宽、高都放得下（图比屏幕窄就居中留白），这就是用户要的
   *      「点开就能看全整张图」。
   */
  function calcScale() {
    if (!img) return 1;
    var box = viewBox();
    var nat = measure();
    var fit = Math.min(box.w / nat.w, box.h / nat.h);
    if (zoom === 'width') return box.w / nat.w;   /* 铺满屏宽（历史档位，正常用不到） */
    if (zoom === 'real') return 1;                /* 原始尺寸 1:1（最清晰，允许超出视口） */
    return fit;
  }

  function applyScale() {
    if (!img || !holder) return;
    var nat = measure();
    var box = viewBox();
    scale = calcScale();
    var w = Math.round(nat.w * scale);
    var h = Math.round(nat.h * scale);
    holder.style.setProperty('--ro-s', String(scale));
    holder.style.width = w + 'px';
    holder.style.height = h + 'px';
    /* 装得下（fit）→ 左右居中，两边留白对称；
       装不下（real 1:1 放大）→ 靠左，右边靠滚动看。 */
    if (w <= box.vw) {
      holder.style.marginLeft = 'auto';
      holder.style.marginRight = 'auto';
    } else {
      holder.style.marginLeft = '0';
      holder.style.marginRight = '0';
    }
    if (scroller) scroller.scrollLeft = Math.max(0, Math.round((w - box.vw) / 2));
    if (tip) {
      var pct = Math.round(scale * 100);
      tip.textContent = (zoom === 'fit' ? '整张完整显示' : (zoom === 'width' ? '铺满屏宽' : '原始尺寸 1:1')) +
        ' \u00b7 ' + pct + '% \u00b7 点图放大 \u00b7 \u00d7 / 返回键关闭';
    }
  }

  function bumpZoom() {
    /* 【用户要求】改成两档切换：点一下放大（1:1 原始尺寸，最清晰），再点一下回到最开始。
       用户原话：「点一下就放大铺满.在点一下就回到最开始的」。
       原来是三档 fit→width→real→fit，现在只留 fit ↔ real。 */
    zoom = (zoom === 'fit') ? 'real' : 'fit';
    if (scroller) scroller.scrollTop = 0;
    applyScale();
  }

  /**
   * 给 body 加/去一个标记类（幂等：重复加不会堆出两个）
   * @param {string} cls 类名
   * @param {boolean} on 加还是去
   */
  function mark(cls, on) {
    if (!document.body) return;
    var list = String(document.body.className || '').split(/\s+/).filter(function (x) {
      return x && x !== cls;
    });
    if (on) list.push(cls);
    document.body.className = list.join(' ');
  }

  /**
   * 打开某一格对应的那张图（按 彩种 + 图名 找图位）
   * @returns {boolean} 找到并打开了
   */
  function open(gameId, imageKey) {
    if (!gameId || !imageKey) return false;
    build();

    var all = document.querySelectorAll('.ro-imagewrap[data-ro-mob]');
    var src = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].getAttribute('data-game') === gameId &&
          all[i].getAttribute('data-image') === imageKey) { src = all[i]; break; }
    }
    if (!src) return false;

    /* 直接用页面里那一张图（不是克隆一份）：
       本层的缩放靠 CSS 上的 --ro-s（.ro-mob-view .ro-mob-holder .r-image），
       不写内联 transform；这里先把页面那份内联 transform 清掉，
       图不会重复缩放、也不会变形。
       直接搬还有一个好处：实时渲染脚本（如果在这之后跑）替换图位内容时，
       全屏层里显示的就是同一张最新图，不会显示一份旧克隆。 */
    var node = src.querySelector('.r-image');
    if (!node) return false;

    while (holder.firstChild) holder.removeChild(holder.firstChild);
    node.style.transform = 'none';       /* 丢掉页面里那份内联缩放，由本层统一算 */
    node.style.transformOrigin = 'top left';
    backTo = src;                        /* 关掉时按原路搬回去 */

    var box = document.createElement('div');
    box.className = 'ro-imagewrap';
    box.setAttribute('data-ro-mob', '1');
    box.appendChild(node);               /* 把原图搬进来 */
    holder.appendChild(box);

    img = node;
    cur = { game: gameId, image: imageKey };
    zoom = 'fit';
    /* 【保存权限】推荐图 / 资料：这一层不允许保存（右键 / 长按 / 拖拽都拦） */
    view.setAttribute('data-allow', '0');

    view.removeAttribute('hidden');
    mark('ro-mob-open', true);
    /* 返回键 / 后退能关：压一条历史记录，popstate 时关掉 */
    try { history.pushState({ roMob: cur }, ''); } catch (e) { /* 忽略 */ }

    /* 等一帧再量尺寸：刚插入的节点需要先完成布局。
       多量几次：字体/图标/换行都可能让内容高度晚一点才稳定，
       量晚了只会重算一次 scale（无害），量早了才会算出偏小的高、
       导致 fit 的容器高度不够（图放得下但滚不到底）。 */
    applyScale();
    setTimeout(applyScale, 0);
    setTimeout(applyScale, 60);
    setTimeout(applyScale, 300);
    setTimeout(applyScale, 900);
    return true;
  }

  function close() {
    if (!view || view.hasAttribute('hidden')) return false;   /* 幂等：不会关两次 */
    view.setAttribute('hidden', '');
    /* 【重要】把那张图搬回它原来的图位里 —— 下次再点时位置/顺序都不乱。
       图位本身被并排脚本搬过，所以记的是「打开时它所在的父节点」。 */
    if (holder && img && backTo) {
      while (holder.firstChild) holder.removeChild(holder.firstChild);
      backTo.appendChild(img);
      img.style.transform = '';
      img.style.transformOrigin = '';
    } else if (holder) {
      while (holder.firstChild) holder.removeChild(holder.firstChild);
    }
    img = null; cur = null; backTo = null;
    mark('ro-mob-open', false);
    return true;
  }

  /* ------------------------------------------------------------
     打开一张【外链图片】（晒票栏的图走这条路）
     ------------------------------------------------------------
     用户要求：「点图片 → 放大看（能看清号码）」，而且说了
     「复用已有的 ro-mob-view 那套全屏层最好」。
     所以这里不新做第二套全屏逻辑，只给这一层加一个入口：
       · 跟 open() 的区别：晒票栏没有页面里现成的「图位」，
         所以这里【自己造】一个装图的盒子，里面放一个真的图元素，
         并给它挂上 r-image 这个类名 ——
         这样它自动吃到上面那条
         「全屏层容器 → 中转盒 → r-image」的等比缩放规则，
         宽高永远同一个 scale，不会变形。
       · 关闭方式跟原来完全一样（都还挂在同一个层上）：
         右上角 ×、点图片外的空白、Esc、手机返回键。
     @param {string} src 图片地址
     @param {string} alt 无障碍文字（一般传彩种名）
     @returns {boolean} true = 已打开 */
  function openUrl(src, alt, allowSave) {
    if (!src) return false;
    build();
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    backTo = null;            /* 这张图不属于任何图位，关掉时不用搬回去 */
    /* 【保存权限】这一层是不是「允许保存」的来源（晒票 / GPT模型摇号出的图）？
       设成 1 之后，页尾防截图脚本就会对这里放行（右键 / 长按 + -webkit-touch-callout）
       都放行；推荐图（open() 走的那条）设成 0 → 一律拦掉。 */
    if (allowSave) view.setAttribute('data-allow', '1');
    else view.setAttribute('data-allow', '0');

    var box = document.createElement('div');
    box.className = 'ro-imagewrap';
    box.setAttribute('data-ro-mob', '1');

    var im = document.createElement('img');
    im.className = 'r-image';
    im.setAttribute('referrerpolicy', 'no-referrer');
    im.setAttribute('loading', 'eager');
    im.setAttribute('decoding', 'async');
    im.setAttribute('alt', alt || '');
    /* 【必须重算】外链图是过一会儿才加载完的：
       没加载完时它的高度是 0，fit 会按「高度 0」算出不对的容器高度。
       图片 load / error 之后各再量一次，缩放就准了。 */
    im.addEventListener('load', function () { applyScale(); if (box.__roErr) { box.__roErr.parentNode && box.__roErr.parentNode.removeChild(box.__roErr); box.__roErr = null; } });
    /* 【加载失败兜底】别显示破图：给一句提示，缩放仍然算一次
       （用户给的参考实现直接设 src，没有兜底 → 网络不好时是一片空白）。 */
    im.addEventListener('error', function () {
      applyScale();
      if (!box.__roErr) {
        box.__roErr = document.createElement('div');
        box.__roErr.className = 'ro-mob-err';
        box.__roErr.textContent = '这张图加载失败，换个网络再试 · 上下滑动看别的';
        holder.appendChild(box.__roErr);
      }
    });
    im.src = src;
    box.appendChild(im);
    holder.appendChild(box);

    img = im;
    cur = { game: '', image: '', url: src };
    zoom = 'fit';             /* ⚠️ 切图后【必须重置成 fit】（用户明确要求） */

    view.removeAttribute('hidden');
    mark('ro-mob-open', true);
    /* 返回键 / 后退能关：压一条历史记录，popstate 时关掉（跟 open() 一样）。
       ⚠️ 浏览相册时【不要每切一张就压一条历史】——
          那样按一次返回键只退回上一张，要按 200 次才能关掉。
          所以切图走 flipTo()，它不压历史。 */
    if (!CALLER_SETS_HISTORY) { try { history.pushState({ roMob: cur }, ''); } catch (e) { /* 忽略 */ } }

    applyScale();
    setTimeout(applyScale, 0);
    setTimeout(applyScale, 60);
    setTimeout(applyScale, 300);
    setTimeout(applyScale, 900);
    setTimeout(applyScale, 1800);
    return true;
  }

  /* ============================================================
     【相册 · 上下滑动切换上一张/下一张】
     用户要求：
       「点某张图 → 全屏 → 向上滑 → 下一张 / 向下滑 → 上一张；
         第一张向下 / 最后一张向上 → 停在原地；
         切图后缩放重置成 fit；4 种关闭方式不能坏」
     ------------------------------------------------------------
     设计要点（踩过的坑都写在注释里）：
       · 【复用这一层】，不新造第二个全屏层 —— 用户明确要求，
         否则页面里会有两套看图逻辑互相打架。
       · 列表顺序 = 页面上的顺序 = 【按发布时间倒序】（最新在前）。
         由调用方（__XYSP_VIEW__）传入，这里只负责前后移动。
       · 手势判定（和"点一下切缩放"共存）：
           按下→抬起，位移 < 10px 且 < 300ms  → 算【点击】→ 交给原有的
              click 处理去切缩放（这里不动，也不 preventDefault）
           位移 > 50px                        → 算【滑动】→ 切上一张/下一张
           介于两者之间                        → 什么也不做（避免误触）
         只认【纵向】滑动（|dy| > |dx|），横向留给浏览器/系统手势。
       · 只在【全屏层打开时】才 preventDefault 拦滚动 —— 用户明确要求。
       · 切图时【不压历史】：否则按返回键要一张一张退回去，关不掉。
     ============================================================ */
  var gallery = null;         /* { list:[{src,cap}], i:number } */
  var CALLER_SETS_HISTORY = false;   /* 切图期间不压历史（见上） */

  function galleryHint() {
    if (!gallery || !gallery.list || gallery.list.length < 2) return '';
    return '第 ' + (gallery.i + 1) + ' / ' + gallery.list.length + ' 张 · 上下滑动切换';
  }
  function updateTip() {
    /* 【计数器】左上角「第 N / M 张」；非相册时隐藏 */
    if (count) {
      if (gallery && gallery.list && gallery.list.length) {
        count.textContent = (gallery.i + 1) + ' / ' + gallery.list.length;
        count.removeAttribute('hidden');
      } else {
        count.setAttribute('hidden', '');
      }
    }
    if (!tip) return;
    var h = galleryHint();
    /* 相册模式下把提示换成「第 N / M 张 · 上下滑动切换」；
       非相册（目录格子 / 推荐图）保持原来那句。 */
    tip.textContent = h || '点图再放大一级 \u00b7 双指可缩放 \u00b7 点空白 / \u00d7 / 返回键关闭';
  }
  /** 切到相册里的第 i 张（带边界：越界就停在原地） */
  function flipTo(i) {
    if (!gallery || !Array.isArray(gallery.list) || !gallery.list.length) return false;
    var n = gallery.list.length;
    if (i < 0 || i >= n) { updateTip(); return false; }   /* 第一张再向上 / 最后一张再向下 → 停住 */
    gallery.i = i;
    var it = gallery.list[i] || {};
    CALLER_SETS_HISTORY = true;        /* 这次 openUrl 不压历史 */
    try {
      openUrl(it.src, it.cap || '', true);
    } finally {
      CALLER_SETS_HISTORY = false;
    }
    updateTip();
    return true;
  }

  /* ---- 触摸手势：滑动切图 ---- */
  var tStartX = 0, tStartY = 0, tStartT = 0, tActive = false;
  function bindSwipe() {
    if (!scroller || scroller.__roSwipeBound) return;
    scroller.__roSwipeBound = true;

    scroller.addEventListener('touchstart', function (e) {
      if (!gallery || !gallery.list || gallery.list.length < 2) return;
      if (!e.touches || e.touches.length !== 1) return;   /* 多指 = 缩放，不参与 */
      tActive = true;
      tStartX = e.touches[0].clientX;
      tStartY = e.touches[0].clientY;
      tStartT = Date.now();
    }, { passive: true });

    scroller.addEventListener('touchmove', function (e) {
      if (!tActive || !e.touches || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - tStartX;
      var dy = e.touches[0].clientY - tStartY;
      /* 只认纵向滑动；已经明确是纵向且超过阈值 → 拦掉页面滚动
         ⚠️ 必须 preventDefault，否则页面会跟着滚（用户明确要求）；
            只在打开 + 单指 + 纵向超阈值时才拦。 */
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    scroller.addEventListener('touchend', function (e) {
      if (!tActive) return;
      tActive = false;
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;
      var dx = t.clientX - tStartX;
      var dy = t.clientY - tStartY;
      var dt = Date.now() - tStartT;
      var dist = Math.sqrt(dx * dx + dy * dy);
      /* 位移 < 10px 且 < 300ms → 算点击，交给原有 click 处理切缩放，这里不管 */
      if (dist < 10 && dt < 300) return;
      /* 位移 > 40px 且是纵向 → 切图 */
      if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
        if (dy < 0) flipTo(gallery.i + 1);   /* 向上滑 → 下一张（列表里更新的在下一位） */
        else flipTo(gallery.i - 1);          /* 向下滑 → 上一张 */
      }
    }, { passive: true });

    /* 桌面也能用：鼠标滚轮（可选，用户说"你判断"）。
       只在相册打开 + 单张已经稳定时响应，且做节流，避免一次滚动跳好几张。 */
    var wheelLock = 0;
    scroller.addEventListener('wheel', function (e) {
      if (!gallery || !gallery.list || gallery.list.length < 2) return;
      var now = Date.now();
      if (now - wheelLock < 320) { if (e.cancelable) e.preventDefault(); return; }
      var d = e.deltaY || 0;
      if (Math.abs(d) < 8) return;
      wheelLock = now;
      if (e.cancelable) e.preventDefault();
      if (d > 0) flipTo(gallery.i + 1); else flipTo(gallery.i - 1);
    }, { passive: false });
  }

  /* 打开：只绑在【目录表格的格子】上；图片本身没有任何点击绑定 */
  var tiles = document.querySelectorAll('.ro-toc-cell');
  for (var t = 0; t < tiles.length; t++) {
    tiles[t].addEventListener('click', function (e) {
      e.preventDefault();       /* 不跳锚点了，直接开全屏层 */
      open(this.getAttribute('data-ro-toc-game'), this.getAttribute('data-ro-toc-image'));
    });
  }

  /* 【相册入口】调用方（__XYSP_VIEW__）在点图时把【当前标签下可见的图片列表】
     传进来，这样"上下滑动"就能在可见的那批里前后走 —— 而不是在全部 600 张里走
     （用户点了「双色球」标签，滑动当然应该在双色球里走）。
     list = [{src, cap}, ...]；i = 当前这张在列表里的下标。 */
  function setGallery(list, i, src, cap) {
    build();
    bindSwipe();                       /* 第一次用时才绑手势 */
    gallery = { list: Array.isArray(list) ? list : [], i: Number(i) || 0 };
    CALLER_SETS_HISTORY = true;        /* 首张也不重复压历史：openUrl 之外由调用方压 */
    try {
      openUrl(src, cap, true);
    } finally {
      CALLER_SETS_HISTORY = false;
    }
    updateTip();
    return true;
  }
  function galleryState() {
    if (!gallery) return { on: false, i: -1, n: 0 };
    return { on: true, i: gallery.i, n: gallery.list.length, hint: galleryHint() };
  }
  /** 给验收脚本用：直接调"上一张/下一张"，不用造触摸事件 */
  function galleryStep(dir) {
    if (!gallery) return false;
    return flipTo(gallery.i + (dir > 0 ? 1 : -1));
  }

  window.__roMobView = {
    open: open,
    openUrl: openUrl,
    close: close,
    setGallery: setGallery,
    galleryStep: galleryStep,
    gallery: galleryState,
    isOpen: function () { return !!view && !view.hasAttribute('hidden'); },
    current: function () { return cur; },
    state: function () {
      return {
        open: !!view && !view.hasAttribute('hidden'),
        game: cur ? cur.game : null,
        image: cur ? cur.image : null,
        zoom: zoom,
        /* scale 是【一个】数：宽高都用它 ⇒ 缩放倍数 x === y（不变形）。
           x/y 分开报出来，是为了让验收脚本能直接比对。 */
        scaleX: scale,
        scaleY: scale,
        holderW: holder ? holder.style.width : '',
        holderH: holder ? holder.style.height : '',
        natW: img ? img.offsetWidth : 0,
        natH: img ? img.offsetHeight : 0,
        vw: window.innerWidth || 0,
        vh: window.innerHeight || 0,
        layers: document.querySelectorAll('.ro-mob-view').length
      };
    },
    bump: bumpZoom
  };

  /* 返回键 / 浏览器后退：关的是这一层，不是离开页面。
     有这一步，手机上按返回键 = 关掉全屏图。 */
  window.addEventListener('popstate', function () {
    if (window.__roMobView.isOpen()) {
      close();
      /* 再压一条空记录，保证「看完还能继续按返回键」不卡住 */
      try { history.pushState({ roMobClosed: 1 }, ''); } catch (e) { /* 忽略 */ }
    }
  });

  /* 旋转屏幕 / 改窗口大小 ⇒ 重新等比适配 */
  window.addEventListener('resize', function () {
    if (window.__roMobView.isOpen()) setTimeout(applyScale, 60);
  });

  /* 【收尾】页尾脚本都跑完了：去掉 body 上的 ro-toc-pending 标记，
     手机目录表格这时候才真正显示出来（在此之前它一直是隐藏的，
     避免 JS 没跑完时出现「点了没反应」的死格子）。 */
  mark('ro-toc-pending', false);
})();
</script>

<!-- __XYSP_VIEW__ 晒票栏：① 彩种筛选（纯前端、不刷新页面）② 点图放大看
     位置：排在页尾那个全屏层（ro-mob-view）之后 ——
     这样执行到这里时那一层已经建好，点图能直接复用它的放大 + 关闭逻辑。
     用户要求：「用 a（不是 button）」「点图片 → 放大看（能看清号码）」
               「复用已有的 ro-mob-view 那套全屏层最好」 -->
<script>
/* __XYSP_VIEW__ 晒票栏交互（脚本挂了也不影响别的区块：
   折叠靠原生 details；这里只负责「筛」和「放大」两件事）。 */
(function () {
  try {
    var root = document.getElementById('ro-xysp');
    if (!root) return;

    var tabs = root.querySelectorAll('.ro-xysp-tab');
    var pics = root.querySelectorAll('.ro-xysp-pic');
    var empty = root.querySelector('.ro-xysp-empty');

    /* 只显示某一分类的卡片（game = 'all' 时全显示）。
       分类 = 8 个彩种 key + 'tt'（头条晒票）。
       ⚠️ 【包含判断，不是相等判断】：
          卡片上是 data-ro-xysp-games（复数）="fc3d pl3 dlt" —— 一条头条帖子
          经常同时提几个彩种，用户要求「分发到各个对应的彩种地方」，
          所以点「排列3」时这条也要出现。
          一起彩的条目属性里只有它自己一个 key，包含判断的实际效果
          和以前的相等判断完全一样（老行为没变）。
       做法是给不匹配的卡片加 hidden 属性，
       样式里有 .ro-xysp-pic[hidden] 把它真的藏起来。 */
    function pick(game) {
      var shown = 0;
      for (var i = 0; i < pics.length; i++) {
        /* ⚠️ 这里不能用 /\s+/ —— 这段脚本是写在【模板字符串】里的，
           一个反斜杠会被模板字符串吃掉，页面里会变成 /s+/（拿 "s" 当分隔符），
           筛选就全错（实测踩过：点「双色球」可见 0 张）。
           所以改成不含反斜杠的写法：按空格切；连续空格只会产生空串，
           空串跟任何 key 都不相等，不影响筛选结果。 */
        var keys = String(pics[i].getAttribute('data-ro-xysp-games') || '').split(' ');
        var ok = false;
        if (game === 'all') ok = true;
        else { for (var k = 0; k < keys.length; k++) { if (keys[k] === game) { ok = true; break; } } }
        pics[i].hidden = !ok;
        if (ok) shown++;
      }
      /* 选中的那一颗标签高亮 */
      for (var t = 0; t < tabs.length; t++) {
        var on = tabs[t].getAttribute('data-ro-xysp-game') === game;
        tabs[t].className = on ? 'ro-xysp-tab on' : 'ro-xysp-tab';
      }
      if (empty) empty.hidden = shown > 0;
      return shown;
    }

    for (var t2 = 0; t2 < tabs.length; t2++) {
      tabs[t2].addEventListener('click', function (e) {
        e.preventDefault();                 /* 不跳锚点，就地在下面过滤 */
        pick(String(this.getAttribute('data-ro-xysp-game') || 'all'));
      });
    }

    /* 点某张图 → 用页尾那层全屏放大看，并把【当前筛选结果】作为相册列表传进去，
       这样上下滑动只在"当前这个标签下看得见的那批"里前后走
       （用户点了「双色球」再看图，滑动当然应该在双色球里走，而不是在全部 600 张里走）。
       那一层没准备好时（脚本没跑到）不拦截点击：
       让 href 自己打开原图，功能不丢。 */
    function visibleList() {
      var list = [];
      for (var i = 0; i < pics.length; i++) {
        if (pics[i].hidden) continue;
        var b = pics[i].querySelector('.ro-xysp-cap b');
        list.push({ src: pics[i].getAttribute('href'), el: pics[i], cap: b ? String(b.textContent || '') : '' });
      }
      return list;
    }
    for (var p = 0; p < pics.length; p++) {
      pics[p].addEventListener('click', function (e) {
        var api = window.__roMobView;
        /* 原图地址就是 href（缩略图只在 src 里，放大要看清号码，用原图） */
        var src = this.getAttribute('href');
        var cap = this.querySelector('.ro-xysp-cap b');
        var capText = cap ? String(cap.textContent || '') : '';
        if (api && typeof api.setGallery === 'function') {
          var list = visibleList();
          var idx = 0;
          for (var q = 0; q < list.length; q++) { if (list[q].el === this) { idx = q; break; } }
          if (list.length > 1 && api.setGallery(list, idx, src, capText)) { e.preventDefault(); return; }
        }
        /* 兜底：列表只有一张 / 老版全屏层 → 走原来的单图打开 */
        if (api && typeof api.openUrl === 'function' && api.openUrl(src, capText, true)) {
          e.preventDefault();
        }
      });
    }

    /* 给验收脚本留一个干净入口（不影响页面行为） */
    window.__roXysp = { pick: pick, tabs: tabs.length, pics: pics.length, visible: visibleList };
  } catch (e) { /* 忽略：这一块的显示不依赖这段脚本 */ }
})();
</script>

<!-- __NEXT_CD__ 下一期更新倒计时
     用户 2026-10-17：「这个倒计时就要根据最后一个彩种更新完来决定倒计时」+「不是推荐出号就更新吗」
     规则（不再写死 02:15）：
       ① 从页面上「开机号」区块里读每个彩种的【下一期开奖时间】（文本形如
          「开奖时间 2026年10月18日 星期日 21:15」，数据来自 kjh-data.js）
       ② 每个开奖时间 + BUILD_DELAY（20 分钟，云端构建到发布的实际耗时）
       ③ 取【最早的一个未来时刻】作为倒计时目标 —— 也就是"下一个彩种更新完"的时刻
       ④ 今天所有彩种都更完之后 → 退回明天 02:15（每日全量班）
     纯前端计算，不请求接口、不调 AI → 免费。
     ⚠️ 一个彩种的时间都解析不出来 → 也退回 02:15，绝不显示假时间。 -->
<script>
(function () {
  var els = [document.getElementById('__NEXT_CD__'), document.getElementById('__NEXT_CD2__')].filter(Boolean);
  if (!els.length) return;
  var BUILD_DELAY_MS = 20 * 60 * 1000;   /* 开奖后到页面发布的大致耗时 */
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* 从开机号区块读出所有「开奖时间 YYYY年M月D日 星期X HH:MM」 */
  function drawTimes() {
    var out = [];
    var nodes = document.querySelectorAll('.ro-kjh-time');
    for (var i = 0; i < nodes.length; i++) {
      var m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日[\s\S]*?(\d{1,2}):(\d{2})/.exec(nodes[i].textContent || '');
      if (!m) continue;
      var t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
      if (!isNaN(t.getTime())) out.push(t.getTime() + BUILD_DELAY_MS);
    }
    return out;
  }

  function dailyFull() {
    var d = new Date();
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 2, 15, 0, 0);
    if (t.getTime() <= d.getTime()) t = new Date(t.getTime() + 86400000);
    return t.getTime();
  }

  function target() {
    var now = Date.now();
    var list = drawTimes().filter(function (x) { return x > now; });
    if (!list.length) return dailyFull();          /* 今天都更完了 → 明天 02:15 */
    list.sort(function (a, b) { return a - b; });
    var next = list[0];
    var full = dailyFull();
    return next < full ? next : full;              /* 别越过每日全量那个点 */
  }

  function draw() {
    var ms = target() - Date.now();
    if (ms <= 0) { for (var q = 0; q < els.length; q++) els[q].textContent = '正在更新…'; return; }
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    for (var q2 = 0; q2 < els.length; q2++) els[q2].textContent = '下一期更新倒计时 ' + h + ':' + pad(m) + ':' + pad(s % 60);
  }
  draw();
  setInterval(draw, 1000);
})();
</script>

<!-- __ART_CD_JS__ 文章参考·更新倒计时（每 1 小时一次，目标 = 下一个 :16:00 北京时间）
     纯前端计算，不联网、不调 AI → 免费。 -->
<script>
(function () {
  var el = document.getElementById('__ART_CD__');
  if (!el) return;
  function now8() { var t = new Date(); return new Date(t.getTime() + (t.getTimezoneOffset() * 60000) + (8 * 3600000)); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function left() {
    /* 【改成 30 分钟】用户要求：文章抓取改回每 30 分钟一次，
       任务在每小时 :16 / :46 跑 → 倒计时目标 = 下一个 :16 或 :46。 */
    var n = now8();
    var t = new Date(n.getTime());
    t.setMinutes(16, 0, 0);
    if (t.getTime() <= n.getTime()) t.setMinutes(46, 0, 0);
    if (t.getTime() <= n.getTime()) t = new Date(t.getTime() + 3600000 - 1800000);
    return t.getTime() - n.getTime();
  }
  function draw() {
    var ms = left();
    if (ms <= 0) { el.textContent = '正在更新…'; return; }
    var s = Math.floor(ms / 1000);
    el.textContent = '更新倒计时 ' + pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }
  draw();
  setInterval(draw, 1000);
})();
</script>

<!-- __EXP_ROW_JS__ 专家推荐·点专家就地展开逐期明细
     用户要求：点「专家推荐」里的某一位专家 → 原地展开他的近 10 期逐期明细，再点收起。
     ⚠️ 【没有第二套渲染逻辑】：
        · key 规则和专家池模块:377 完全一致（gameId + '-' + idx），
          详情 DOM 的 id 就是 ex-detail-<key>（和那边一字不差）；
        · 明细内容用的是【同一个函数】expertDetailHtml()（专家池模块:285），
          该文件已内联在本页（见上面 INLINE_JS 列表），函数挂在页面全局作用域上。
        · 开合语义也照抄 expert-pool.js:404 那套：hidden 属性 + aria-expanded
          + .on 类（不用 display，display 不能过渡）。
     ⚠️ 为什么本页要自己挂一个委托监听：expert-pool.js 里的委托监听是
        【挂在它自己创建的那个面板容器上】的（t.addEventListener，
        仅在 renderExpertPanel(container, gameId) 被调用时才会挂）——
        分享页是预渲染好的静态 HTML、从来不调 renderExpertPanel，
        所以那个监听在本页不存在。这里用【同一个 toggle 语义 + 同一个函数】
        在 document 上挂一次委托，服务本页的 .ro-xj-row[data-ex-key]。
     ⚠️ 不能用裸 <button>（页面不变量：button 标签 = 0），
        行本身是 <a role="button" tabindex="0">（见 buildExpertsHtml）。
     ⚠️ 必须放在本模板的 </body> 之前（模板字符串内部）。 -->
<script>
(function () {
  try {
    if (!document.querySelector('a.ro-xj-row[data-ex-key]')) return;

    var keyOf = function (node) {
      return (node && node.closest) ? node.closest('[data-ex-key]') : null;
    };

    var toggle = function (row) {
      if (!row) return;
      var detail = document.getElementById('ex-detail-' + (row.getAttribute('data-ex-key') || ''));
      if (!detail) return;
      var willOpen = detail.hasAttribute('hidden');
      if (willOpen) {
        /* 第一次展开才填内容（省得页面里塞 80 份没人看的明细）；
           填的就是 expertDetailHtml() 的输出 —— 和 App 里一模一样。 */
        if (!detail.getAttribute('data-filled')) {
          var key = String(row.getAttribute('data-ex-key') || '');
          var gp = key.split('-');
          var idx = parseInt(gp.pop(), 10);
          var gid = gp.join('-');
          var e = null;
          try {
            e = (typeof expertsFor === 'function') ? expertsFor(gid) : null;
            e = (e && Array.isArray(e.stable) && e.stable[idx]) ? e.stable[idx] : null;
          } catch (e0) { e = null; }
          if (e && typeof expertDetailHtml === 'function') {
            detail.innerHTML = expertDetailHtml(e);
            detail.setAttribute('data-filled', '1');
          }
        }
        detail.removeAttribute('hidden');
      } else {
        detail.setAttribute('hidden', '');
      }
      row.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      if (row.classList) row.classList.toggle('on', willOpen);
    };

    document.addEventListener('click', function (ev) {
      var row = keyOf(ev.target);
      if (!row) return;
      ev.preventDefault();
      toggle(row);
    });
    document.addEventListener('keydown', function (ev) {
      var k = ev.key || '';
      if (k !== 'Enter' && k !== ' ' && k !== 'Spacebar') return;
      var row = keyOf(ev.target);
      if (!row) return;
      ev.preventDefault();
      toggle(row);
    });

    /* 给验收脚本留一个干净入口（不影响页面行为） */
    window.__roExpRow = { rows: document.querySelectorAll('a.ro-xj-row[data-ex-key]').length };
  } catch (e) { /* 忽略：专家推荐本身已经预渲染在页面里，展开只是锦上添花 */ }
})();
</script>

<!-- __ART_BODY_JS__ 文章参考·正文原位展开（方案 A）
     用户原话：「要把正文抓到我们页面上」→ 点标题在标题下面原地展开正文，
     再点一次收起。【默认全部收起】。
     这一段只做两件事：切 .ro-art-open 这个 class + 展开时把正文顶端拉进视口。
     纯前端，不联网、不调 AI → 免费。
     ⚠️ 必须放在本模板的 </body> 之前（模板字符串内部）；
        以前把页面脚本拼在 .mjs 文件末尾 → Node 里 document 未定义直接崩。 -->
<script>
(function () {
  try {
    /* 页尾其它脚本都还没跑（script 是顺序执行的），所以这里直接查 DOM 就行；
       仍然包一层 try，任何意外都不影响正文已经预渲染的事实。 */
    var links = document.querySelectorAll('a.ro-art-link[data-ro-art]');
    if (!links.length) return;

    /* 展开时不要把标题顶出屏幕：只有正文顶端已经跑到视口上方才补一点滚动。
       收起时不滚动 —— 否则页面会乱跳。 */
    function reveal(box) {
      if (!box || !box.getBoundingClientRect) return;
      var top = box.getBoundingClientRect().top;
      if (top < 0) {
        try { box.scrollIntoView({ block: 'nearest' }); }
        catch (e) { /* 老浏览器：不滚动也能看 */ }
      }
    }

    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function (e) {
        var a = this;
        var id = String(a.getAttribute('data-ro-art') || '');
        var body = id ? document.getElementById('ro-art-' + id) : null;
        if (!body) return;                       /* 没抓到正文 → 交给浏览器处理 */
        e.preventDefault();                      /* 不跳锚点、不改 hash */
        var li = a.parentNode;
        if (li && li.tagName !== 'LI') li = li.parentNode;   /* 结构变了也不至于报错 */
        if (!li) return;
        /* 用 classList 加/摘 —— 不要整串重写 className：
           那样每次收起都会在 class 里留下一串空格，越点越脏。 */
        var cls = li.classList;
        var open = cls ? cls.contains('ro-art-open') : false;
        if (cls && cls.add && cls.remove) {
          if (open) cls.remove('ro-art-open'); else cls.add('ro-art-open');
        } else {                                  /* 老浏览器兜底 */
          var s = (' ' + String(li.className || '') + ' ').replace(/\s+/g, ' ');
          li.className = open
            ? s.replace(' ro-art-open ', ' ').replace(/^ | $/g, '')
            : (s + 'ro-art-open ').replace(/^ /, '');
        }
        if (!open) reveal(body);
      });
    }

    /* 给验收脚本留一个干净入口（不影响页面行为） */
    window.__roArt = { links: links.length };
  } catch (e) { /* 忽略：正文已经预渲染在页面里，展开只是锦上添花 */ }
})();
</script>

<!-- __AIPICK_JS__ ai选号面板交互（纯前端随机模拟）
     用户要求：
       · 晒票栏下面这个「ai选号」小窗口里，用户可以自己操作摇号（单式 / 复式）
       · 除了竞彩页的奖金试算器，整页【只有这一块】可以操作
       · 不加「保存 / 记住 / 收藏」之类功能，也不写任何浏览器存储
         （本地存储 / 会话存储 / COOKIE 一个都不用）
         —— 所有状态都只是内存变量，刷新页面立刻回到默认
     规则出处：生成时从规则表读真实区间/位数（AIPICK_JS_RULES），
               前端不重复维护一份规则表。
     组六约束：福彩3D / 排列3 / 排列5 前三位必须「全组六」（三位两两不同），
               复用的就是统计模块 enforceDigitStraightGate() 的那条规则
               （DIGIT_STRAIGHT_KEYS：fc3d/pl3 = 百/十/个，pl5 = 万/千/百）。
               分享页是单文件、不加载 stats.js，所以这里是同一条规则的前端实现。
     ⚠️ 必须放在本模板的 </body> 之前（模板字符串内部）；
        以前把页面脚本拼在 .mjs 文件末尾 → Node 里 document 未定义直接崩。 -->
<script>
(function () {
  try {
    var root = document.getElementById('ro-aipick');
    if (!root) return;

    /* 规则表 = 生成时从 games.js 的 GAMES 里读出来的真实值（不是手抄的） */
    var RULES = ${AIPICK_JS_RULES};
    var byId = {};
    for (var r0 = 0; r0 < RULES.length; r0++) byId[RULES[r0].id] = RULES[r0];

    /* 【注数上限】用户 2026-10-17：1000 → 10000。
       它的作用【不是限制选几个号】（号码个数的上限已经去掉，可以选满池子），
       而是防止一次真的生成上百万注把手机/浏览器卡死（33 个红球 = C(33,6) = 1,107,568 注）。
       注数超过这个数时：只显示注数、不摇号（页面提示"注数待调整"）。 */
    var MAX_COMBO = 10000;
    /* 【倍数上限】用户 2026-10-17：「完全去掉」。
       原来公式里夹到 1~99（99 是体彩/福彩单票的官方上限）。
       现在不夹了，只留一个天文数字当保险丝，纯防止数字溢出成 Infinity/NaN
       （注数 × 倍数 × 2 的金额算式）。也就是说正常使用下【没有】倍数限制。 */
    var MAX_TIMES = 1e9;
    var MAX_SHOW = 100;        /* 结果区最多画 100 注 */
    var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    /* 【内存状态】只放在内存里：刷新页面即回到默认（不碰任何浏览器存储） */
    var st = { game: RULES[0].id, times: 1, kl8: 10, multi: {}, rows: [], pick: {}, betCount: 0,
               src: 'random' };   /* src: 'random' 随机摇号 | 'manual' 自选（用户 2026-10-17 要求加「自选」） */

    /* ---------- 基础工具 ---------- */
    function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function shuffled(a, b) {
      var arr = [], i;
      for (i = a; i <= b; i++) arr.push(i);
      for (i = arr.length - 1; i > 0; i--) { var j = rnd(0, i); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    }
    /* 不重复抽 n 个（升序）：和 app.js 的 pickNumbers 同一套洗牌法 */
    function pickDistinct(a, b, n) {
      var arr = shuffled(a, b);
      if (n > arr.length) n = arr.length;
      return arr.slice(0, n).sort(function (x, y) { return x - y; });
    }
    function C(n, k) {                       /* 组合数 C(n,k)：复式注数就是它 */
      if (k < 0 || k > n) return 0;
      k = Math.min(k, n - k);
      var r = 1, i;
      for (i = 1; i <= k; i++) r = r * (n - k + i) / i;
      return Math.round(r);
    }
    function combos(arr, k) {                /* 从 arr 里取 k 个的全部组合 */
      var res = [];
      (function rec(start, cur) {
        if (res.length >= MAX_COMBO) return;
        if (cur.length === k) { res.push(cur.slice()); return; }
        for (var i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
      })(0, []);
      return res;
    }
    function cartesian(list) {               /* 每个区取一个组合 → 笛卡尔积 = 复式的每一注 */
      var res = [[]], i, j, k;
      for (i = 0; i < list.length; i++) {
        var next = [];
        for (j = 0; j < res.length; j++) {
          for (k = 0; k < list[i].length; k++) {
            if (next.length >= MAX_COMBO) break;
            next.push(res[j].concat([list[i][k]]));
          }
        }
        res = next;
      }
      return res;
    }
    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined && text !== null) n.textContent = String(text);
      return n;
    }
    function clearNode(box) { while (box.firstChild) box.removeChild(box.firstChild); }
    function show(node, on) {
      if (!node) return;
      if (on) node.removeAttribute('hidden');
      else node.setAttribute('hidden', 'hidden');
    }
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function attr(node, name) { return node ? String(node.getAttribute(name) || '') : ''; }

    /* ---------- DOM 元素 ---------- */
    var gameTabs = root.querySelectorAll('.ro-aipick-tab');
    var ruleBox = root.querySelector('.ro-aipick-rule');
    var lineKl8 = root.querySelector('.ro-aipick-line-kl8');
    var kl8Box = root.querySelector('.ro-aipick-kl8');
    var lineMulti = root.querySelector('.ro-aipick-line-multi');
    var multiBox = root.querySelector('.ro-aipick-multi');
    var inTimes = root.querySelector('.ro-aipick-in-times');
    var sumBox = root.querySelector('.ro-aipick-sum');
    var warnBox = root.querySelector('.ro-aipick-warn');
    var outBox = root.querySelector('.ro-aipick-out');
    var pickBox = root.querySelector('.ro-aipick-picker');   /* 自己选号：号码格子 */
    var acts = root.querySelectorAll('.ro-aipick-btn');
    var lineTimes = root.querySelector('.ro-aipick-line-times');
    var actsBox = root.querySelector('.ro-aipick-acts');

    /* ---------- 彩种规则（全部来自 games.js） ---------- */
    function G() { return byId[st.game] || RULES[0]; }

    /* 数字型每一位。gate = 1 的位就是「必须全组六」的那三位：
       fc3d / pl3 = 百/十/个；pl5 = 万/千/百（与 stats.js DIGIT_STRAIGHT_KEYS 一致） */
    function posOf(g) {
      var a = [], i;
      if (g.id === 'fc3d' || g.id === 'pl3') {
        a = [{ n: '百位', from: 0, to: 9, gate: 1 },
             { n: '十位', from: 0, to: 9, gate: 1 },
             { n: '个位', from: 0, to: 9, gate: 1 }];
      } else if (g.id === 'pl5') {
        a = [{ n: '万位', from: 0, to: 9, gate: 1 },
             { n: '千位', from: 0, to: 9, gate: 1 },
             { n: '百位', from: 0, to: 9, gate: 1 },
             { n: '十位', from: 0, to: 9, gate: 0 },
             { n: '个位', from: 0, to: 9, gate: 0 }];
      } else if (g.id === 'qxc') {
        for (i = 0; i < 6; i++) a.push({ n: '第' + (i + 1) + '位', from: 0, to: 9, gate: 0 });
        a.push({ n: '最后一位', from: 0, to: 14, gate: 0 });
      }
      return a;
    }
    /* 号码型的「购票用」号码区：去掉特别号（七乐彩的特别号是开奖摇出的，不由购票人选） */
    function areasOf(g) {
      var out = [], i;
      for (i = 0; i < g.areas.length; i++) if (g.areas[i].key !== 'special') out.push(g.areas[i]);
      return out;
    }
    function pickOf(g, a) { return g.playModes ? st.kl8 : (a.pick || 1); }
    function isDigit(g) { return g.type === 'digit' || g.type === 'qxc'; }
    function maxMultiOf(g, a) {
      var base = pickOf(g, a);
      /* 【去掉人为上限】用户 2026-10-17：「是不是限额额度原因 不要给我限制」。
         原来：号码型最多一个区 20 个号、快乐8 封成 base+10 —— 都是人为封顶，
         也正是「打 10 显示成 20」的来源：打「1」被夹到下限 6，再打「0」变成 60，
         又被夹到上限 20 ⇒ 看到 20。
         现在上限 = 【号码池实际大小】（双色球红球 33、大乐透前区 35、蓝球 16、快乐8 80…），
         也就是物理上不可能再多的那个数，不再做任何人为限制。
         ⚠️ 代价：注数会非常大（红球选满 33 个 = C(33,6) = 1,107,568 注），页面照实算、不拦。 */
      return Math.max(a.to - a.from + 1, base);
    }

    function ruleText(g) {
      var i, t;
      if (g.type === 'digit') {
        var gateN = 0, pos = posOf(g);
        for (i = 0; i < pos.length; i++) if (pos[i].gate) gateN++;
        t = g.digits + ' 位数字（每位 0-9）';
        if (gateN >= 3) t += ' · 前三位【全组六】：三位数字两两不同（不出豹子、不出组三）';
        return t;
      }
      if (g.type === 'qxc') return '前六位各 0-9 · 最后一位 0-14（共 7 位）';
      var parts = [];
      if (g.playModes) parts.push('选' + (CN[st.kl8] || st.kl8) + '：1-80 里选 ' + st.kl8 + ' 个');
      var areas = areasOf(g);
      for (i = 0; i < areas.length; i++) {
        parts.push(areas[i].label + ' ' + pickOf(g, areas[i]) + ' 个（' + areas[i].from + '-' + areas[i].to + ' 不重复）');
      }
      if (g.id === 'qlc') parts.push('特别号由开奖摇出，不用选');
      return parts.join(' · ');
    }

    /* ---------- 复式：每个区 / 每一位选几个号（内存里记，刷新即忘） ---------- */
    function mkey(k) { return st.game + '|' + k; }
    function multiGet(k, def, min, max) {
      var v = st.multi[mkey(k)];
      if (typeof v !== 'number' || !isFinite(v)) v = def;
      if (v < min) v = min;
      if (v > max) v = max;
      st.multi[mkey(k)] = v;
      return v;
    }
    function multiInput(label, key, val, min, max, hideUnit) {
      var wrap = el('span', 'ro-aipick-mwrap');
      wrap.appendChild(el('span', 'ro-aipick-unit', label));
      var inp = document.createElement('input');
      inp.className = 'ro-aipick-in ro-aipick-in-multi';
      /* 【必须是 text，不能是 number】
         number 类型不支持选区 API（selectionStart 恒为 null）→ 聚焦全选做不到，
         光标停在旧值后面，打字就变成"追加"。text + inputmode=numeric 两者兼得。 */
      inp.type = 'text';
      inp.setAttribute('inputmode', 'numeric');
      inp.setAttribute('pattern', '[0-9]*');
      inp.autocomplete = 'off';
      inp.setAttribute('min', String(min));
      inp.setAttribute('max', String(max));
      inp.setAttribute('data-ro-aipick-key', key);
      inp.setAttribute('data-ro-aipick-min', String(min));
      inp.setAttribute('data-ro-aipick-max', String(max));
      inp.value = String(val);
      /* 【关键修复 · 用户 2026-10-17 报的「一位数能改、两位数改不了」】
         原来这里是 addEventListener('input', refresh)：
         每按一个键就 refresh → multiGet 立刻把值夹进 [min,max] ——
         打「10」时按「1」就先被夹成 6（双色球红球 min=6）或 2（大乐透后区 min=2），
         再按「0」就接在 6 / 2 后面 → 所以永远出不来两位数（用户看到的「20」就是 2+0）。
         现在：打字过程【完全不碰它】，只在 change（失焦）或回车时 refresh（那时才夹取/纠正）。 */
      inp.addEventListener('focus', function () { try { inp.select(); } catch (e) { /* 忽略 */ } });
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); refresh(); try { inp.blur(); } catch (e) { /* 忽略 */ } }
      });
      inp.addEventListener('change', refresh);
      wrap.appendChild(inp);
      /* 单位「个」：红球 [6] 个 / 百位 2 个（hideUnit 留给以后要长标签的彩种用） */
      if (!hideUnit) wrap.appendChild(el('span', 'ro-aipick-unit', '个'));
      return wrap;
    }
    /* 【本轮改版·最终】号码型：每个区都给一个「选几个」输入框
       用户原话：「复式 改成输入要选几个号 比如红球要选几个」。
       双色球就是「红球 [6] 个 蓝球 [1] 个」；个数 ≥ 官方基本个数，
       超出的部分按复式算（注数 = C(红球个数,6) × C(蓝球个数,1)，由 plan() 现算）。
       数字彩照旧每位一个框（0-9 池子就 10 个号，本来就没几个可选）。 */
    function buildMultiRow(g) {
      if (!multiBox) return;
      clearNode(multiBox);
      var i;
      if (isDigit(g)) {
        var pos = posOf(g);
        for (i = 0; i < pos.length; i++) {
          var size = pos[i].to - pos[i].from + 1;
          var def = (i === 0) ? Math.min(2, size) : 1;
          multiBox.appendChild(multiInput(pos[i].n + (pos[i].gate ? '·组六位' : ''), 'p' + i,
            multiGet('p' + i, def, 1, size), 1, size));
        }
      } else {
        /* 【本轮改版】每个号码区一个「选几个」框：红球 / 蓝球（大乐透 = 前区 / 后区…）。
           第一个区默认多给 1 个（= 最小的复式），其余区按官方基本个数。 */
        var areas = areasOf(g);
        for (i = 0; i < areas.length; i++) {
          var base = pickOf(g, areas[i]), max = maxMultiOf(g, areas[i]);
          var d = (i === 0) ? Math.min(base + 1, max) : base;
          multiBox.appendChild(multiInput(areas[i].label, 'a' + i,
            multiGet('a' + i, d, base, max), base, max));
        }
      }
    }
    function buildKl8(g) {
      if (!kl8Box) return;
      clearNode(kl8Box);
      if (!g.playModes) return;
      for (var i = 10; i >= 1; i--) {          /* 选十 → 选一，和官方顺序一致 */
        (function (n) {
          var a = el('a', 'ro-aipick-kl8tab' + (n === st.kl8 ? ' on' : ''), '选' + (CN[n] || n));
          a.setAttribute('role', 'button');
          a.setAttribute('tabindex', '0');
          a.setAttribute('data-ro-aipick-kl8', String(n));
          a.addEventListener('click', function (e) {
            if (e && e.preventDefault) e.preventDefault();
            if (n === st.kl8) return;
            st.kl8 = n;
            st.rows = [];
            st.multi = {};
            st.pick = {};
            syncTabs();
            buildMultiRow(G());
            buildPicker(G());              /* 玩法换了 → 「自己选号」每个区最少个数也变了，重画 */
            applySrc();
          });
          kl8Box.appendChild(a);
        })(i);
      }
    }

    /* ============================================================
       【保存图片】把当前号码画成一张 PNG，再用页面已有的全屏层弹出来
       ------------------------------------------------------------
       用户原话：「也有保存界面 保存就是弹出图片他选着的图片让他自己保存」
       · 纯 <canvas> 画图，不联网、不上传（图片数据只在本页内存里）
       · 弹层复用页面已有的 ro-mob-view（window.__roMobView.openUrl 直接
         把 src 赋给 <img>，所以 data:image/png;base64,… 一样能显示），
         关闭方式不变：× / 点空白 / Esc / 手机返回键
       · 还没摇号 → 只给提示，不出空图
       · 出图失败（老浏览器没有 canvas）→ 也只给提示，不静默失败
       ⚠️ 这张图【不写任何存储】：不落本地存储 / 会话存储 / COOKIE
          —— 图片只在内存里（st.pic），刷新页面就没了
       ============================================================ */
    function nowText() {
      var d = new Date();
      var p = function (n) { return n < 10 ? '0' + n : String(n); };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
             p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function saveHint(msg) {
      if (warnBox) { warnBox.textContent = msg; show(warnBox, true); }
    }
    /* 当前要出图的号码：结果区已经摇出来的那几注 */
    function picData() {
      var g = G();
      if (!st.rows.length) return null;
      var r0 = st.rows[0];
      /* 【自己选号】手选的那条：用「按区分组」的画法（一个区一段，选多也不跑版） */
      if (r0 && r0.manual) {
        var slots = slotsOf(g), groups = [], i;
        for (i = 0; i < slots.length; i++) {
          groups.push({ label: slots[i].label, color: slots[i].color, to: slots[i].to,
                        nums: pickArr(slots[i].key).slice() });
        }
        return {
          kind: 'self', groups: groups,
          note: '手动选号 · 折合 ' + (st.betCount || 0) + ' 注 × ' + st.times + ' 倍 = ' +
                ((st.betCount || 0) * st.times * (g.price || 2)) + ' 元'
        };
      }
      return {
        kind: r0.kind, pos: r0.pos, areas: r0.areas,
        rows: st.rows.map(function (r) { return r.row; }),
        note: '共 ' + (st.betCount || st.rows.length) + ' 注 · ' + st.times + ' 倍 · 合计 ' +
              ((st.betCount || st.rows.length) * st.times * (g.price || 2)) + ' 元'
      };
    }
    function drawBall(ctx, cx, cy, r, blue, text) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
      ctx.fillStyle = blue ? '#16233a' : '#3a1d22';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = blue ? '#3d5a86' : '#a34a4a';
      ctx.stroke();
      ctx.fillStyle = blue ? '#8fb8ff' : '#ff8b8b';
      ctx.font = 'bold 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(text), cx, cy + 6);
      ctx.textAlign = 'left';
    }
    function drawPic(g, data) {
      var W = 720, pad = 28, lineH = 48, ballR = 15, gap = 9;
      var maxRows = 20;
      var top = 172, foot = 100;
      var H, i, j;
      /* ---- 先算版面高度，再定画布尺寸 ---- */
      var blocks = null, selfLines = 0;
      if (data.kind === 'self') {
        var per = Math.floor((W - pad * 2 - 92) / (ballR * 2 + gap));
        if (per < 4) per = 4;
        blocks = [];
        for (i = 0; i < data.groups.length; i++) {
          var gp = data.groups[i], lines = [];
          for (j = 0; j < gp.nums.length; j += per) lines.push(gp.nums.slice(j, j + per));
          if (!lines.length) lines.push([]);
          blocks.push({ label: gp.label, color: gp.color, to: gp.to, lines: lines });
          selfLines += 26 + lines.length * 44 + 10;
        }
        H = top + selfLines + 120;
      } else {
        var n0 = Math.min(data.rows.length, maxRows);
        H = top + n0 * lineH + (data.rows.length > n0 ? 34 : 0) + foot;
      }
      var cv = document.createElement('canvas');
      if (!cv) return null;
      cv.width = W;
      cv.height = H;
      var ctx = null;
      try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; }
      if (!ctx) return null;
      ctx.fillStyle = '#0f1115';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#12161d';
      ctx.fillRect(0, 0, W, 128);
      ctx.fillStyle = '#e8eaed';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('GPT模型摇号 · 春风十里送大奖', pad, 56);
      ctx.fillStyle = '#8fb8ff';
      ctx.font = '20px sans-serif';
      ctx.fillText(g.name + '　' + data.note, pad, 94);
      ctx.fillStyle = '#2a323f';
      ctx.fillRect(0, 127, W, 1);
      /* ---- 自己选号：一个区一段，段内按行铺开（选 33 个也不会跑出画布） ---- */
      if (data.kind === 'self') {
        var y2 = top;
        for (i = 0; i < blocks.length; i++) {
          ctx.fillStyle = '#c3ccda';
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(blocks[i].label, pad, y2 + 8);
          y2 += 26;
          for (j = 0; j < blocks[i].lines.length; j++) {
            var x2 = pad + 92, k2;
            for (k2 = 0; k2 < blocks[i].lines[j].length; k2++) {
              var v = blocks[i].lines[j][k2];
              drawBall(ctx, x2 + ballR, y2 + 8, ballR, blocks[i].color === 'blue',
                blocks[i].to > 9 ? pad2(v) : String(v));
              x2 += ballR * 2 + gap;
            }
            y2 += 44;
          }
          y2 += 10;
        }
      } else {
      var n = Math.min(data.rows.length, maxRows);
      for (var i3 = 0; i3 < n; i3++) {
        var y = top + i3 * lineH;
        var x = pad;
        if (data.rows.length > 1) {
          ctx.fillStyle = '#5f6878';
          ctx.font = '16px sans-serif';
          ctx.fillText('第' + (i3 + 1) + '注', pad, y + 6);
          x = pad + 62;
        }
        var row = data.rows[i3] || [];
        if (data.kind === 'number') {
          for (var a = 0; a < data.areas.length; a++) {
            if (a > 0) {
              ctx.fillStyle = '#5f6878'; ctx.font = '18px sans-serif';
              ctx.fillText('+', x + 6, y + 6); x += 24;
            }
            var ar = data.areas[a], picked = row[a] || [];
            for (var jj = 0; jj < picked.length; jj++) {
              /* 号码型补两位；数字彩不补（0 就是「0」不是「00」） */
              drawBall(ctx, x + ballR, y, ballR, ar.color === 'blue',
                ar.to > 9 ? pad2(picked[jj]) : String(picked[jj]));
              x += ballR * 2 + gap;
            }
          }
        } else {
          for (var k = 0; k < row.length; k++) {
            var isLast = (k === row.length - 1 && data.pos && data.pos[k] && data.pos[k].to === 14);
            if (isLast) {
              ctx.fillStyle = '#5f6878'; ctx.font = '18px sans-serif';
              ctx.fillText('+', x + 6, y + 6); x += 24;
            }
            /* 【一位多个号】复式/自己选号时 row[k] 是这一位的号数组（如百位 [0,8]）——
               老写法直接把数组当文本画（会印出「0,8」），这里逐个数画，
               位与位之间补一个小圆点，免得看不出哪几个号是哪一位。 */
            var cell = row[k];
            var list = (Object.prototype.toString.call(cell) === '[object Array]') ? cell : [cell];
            for (var kk = 0; kk < list.length; kk++) {
              drawBall(ctx, x + ballR, y, ballR, !!isLast, String(list[kk]));
              x += ballR * 2 + gap;
            }
            if (list.length > 1 && k < row.length - 1) {
              ctx.fillStyle = '#5f6878'; ctx.font = '16px sans-serif';
              ctx.fillText('·', x + 1, y + 6); x += 14;
            }
          }
        }
      }
      if (data.rows.length > n) {
        ctx.fillStyle = '#5f6878';
        ctx.font = '16px sans-serif';
        ctx.fillText('（图里只画前 ' + n + ' 注，实际共 ' + data.rows.length + ' 注）', pad, top + n * lineH + 8);
      }
      }
      ctx.fillStyle = '#1e2430';
      ctx.fillRect(0, H - foot + 12, W, 1);
      ctx.fillStyle = '#6b7488';
      ctx.font = '18px sans-serif';
      ctx.fillText('仅供娱乐，不构成购彩建议，请理性购彩。', pad, H - foot + 48);
      ctx.fillStyle = '#5f6878';
      ctx.font = '15px sans-serif';
      ctx.fillText('生成时间：' + nowText() + ' · 纯本机随机模拟（未联网、不上传、不保存）', pad, H - foot + 76);
      var url = '';
      try { url = cv.toDataURL('image/png'); } catch (e) { url = ''; }
      if (!url) return null;
      return { url: url, w: W, h: H, rows: n };
    }
    function saveImage() {
      var g = G();
      var data = picData();
      if (!data) {
        saveHint('请先摇号再点「保存图片」');
        return null;
      }
      var pic = drawPic(g, data);
      if (!pic || !pic.url) {
        saveHint('生成图片失败：这个浏览器不支持把号码画成图片，请换个浏览器再试');
        return null;
      }
      st.pic = pic;                      /* 只在内存里留一份，刷新就没了 */
      var api = window.__roMobView;
      var opened = false;
      try {
        opened = !!(api && typeof api.openUrl === 'function' && api.openUrl(pic.url, 'GPT模型摇号 · ' + g.name, true));
      } catch (e) { opened = false; }
      if (!opened) saveHint('图片已经生成，但全屏层没能打开：请刷新页面后再试一次');
      return pic;
    }

    /* ---------- 读输入框（倍数 / 每个区选几个号） ---------- */    function numOf(inp, def, min, max) {
      var v = NaN;
      if (inp) v = parseInt(String(inp.value === undefined || inp.value === null ? '' : inp.value), 10);
      if (!isFinite(v)) v = def;
      if (typeof v !== 'number' || !isFinite(v)) v = min;
      if (v < min) v = min;
      if (v > max) v = max;
      if (inp && String(inp.value) !== String(v)) { try { inp.value = String(v); } catch (e) { /* 忽略 */ } }
      return v;
    }
    function readInputs() {
      st.times = numOf(inTimes, st.times, 1, MAX_TIMES);
      var list = root.querySelectorAll('.ro-aipick-in-multi');
      for (var i = 0; i < list.length; i++) {
        var key = attr(list[i], 'data-ro-aipick-key');
        if (!key) continue;
        var min = parseInt(attr(list[i], 'data-ro-aipick-min'), 10) || 1;
        var max = parseInt(attr(list[i], 'data-ro-aipick-max'), 10) || 99;
        var v = numOf(list[i], st.multi[mkey(key)], min, max);
        st.multi[mkey(key)] = v;
      }
    }

    /* ---------- 摇号计划：先算「共几注」，超上限就不摇 ---------- */
    /* 前三位「全组六」：三个位置的候选数字两两不重复。
       这就是 stats.js enforceDigitStraightGate() 保证的那个状态
       （那里保证 fc3d / pl3 / pl5 前三位 27 注直选全是组六、0 豹子）。 */
    function dealDigits(pos, counts) {
      var pool = shuffled(0, 9), pi = 0, i;
      var sets = [];
      for (i = 0; i < pos.length; i++) sets.push([]);
      for (i = 0; i < pos.length; i++) {                 /* ① 组六位先分：两两不重复 */
        if (!pos[i].gate) continue;
        while (sets[i].length < counts[i] && pi < pool.length) sets[i].push(pool[pi++]);
      }
      for (i = 0; i < pos.length; i++) {                 /* ② 其余位：先用剩下的号，不够再按本位随机补 */
        if (pos[i].gate) continue;
        while (sets[i].length < counts[i]) {
          if (pi < pool.length) sets[i].push(pool[pi++]);
          else sets[i].push(rnd(pos[i].from, pos[i].to));
        }
      }
      for (i = 0; i < sets.length; i++) sets[i].sort(function (x, y) { return x - y; });
      return sets;
    }
    function planDigit(g) {
      var pos = posOf(g), i;
      var counts = [], sets, want = 1, prod = 1;
      for (i = 0; i < pos.length; i++) {
        var size = pos[i].to - pos[i].from + 1;
        var def = (i === 0) ? Math.min(2, size) : 1;
        counts.push(multiGet('p' + i, def, 1, size));
        want *= counts[i];
      }
      sets = dealDigits(pos, counts);
      for (i = 0; i < sets.length; i++) prod *= sets[i].length;
      if (want > MAX_COMBO) {
        return { ok: 0, msg: '复式共 ' + want + ' 注，超过上限 ' + MAX_COMBO + ' 注，请减少各位的数字个数' };
      }
      var note = '';
      if (want !== prod) {
        var got = [];
        for (i = 0; i < sets.length; i++) got.push(sets[i].length);
        note = '前三位受「全组六」约束（号池只有 0-9 十个数字），实际按 ' + got.join('/') + ' 个分配';
      }
      /* 数字彩同理：只出【一条】（各位原样画，不再展开成 各位相乘 条） */
      return { ok: 1, kind: 'digit', count: prod, pos: pos, sets: sets, rows: [sets], note: note };
    }
    function planNumber(g) {
      var areas = areasOf(g), i;
      var sets = [], want = 1;
      for (i = 0; i < areas.length; i++) {
        var a = areas[i], base = pickOf(g, a), max = maxMultiOf(g, a);
        var def = (i === 0) ? Math.min(base + 1, max) : base;
        var c = multiGet('a' + i, def, base, max);
        sets.push(pickDistinct(a.from, a.to, c));
        want *= C(c, base);
      }
      /* ⚠️ 这里原来有一条「复式至少要有一个区超过基本个数」的拦截：
         现在每个区都是「选几个」输入框，红球 6 / 蓝球 1 就是最普通的 1 注，
         再拦就没法出号了 —— 去掉。 */
      if (want > MAX_COMBO) {
        return { ok: 0, msg: '复式共 ' + want + ' 注，超过上限 ' + MAX_COMBO + ' 注，请减少号码个数' };
      }
      var per = [];
      for (i = 0; i < areas.length; i++) per.push(combos(sets[i], pickOf(g, areas[i])));
      /* 【一次摇号 = 一条号码】用户 2026-10-17：
         「摇号一次只能摇一注出来。前区选几就是摇出几个，后区要几个就是摇几个」
         → 不再把复式展开成 C(n,基本个数) 条单式（那是 6 条几乎一样的号，看着乱），
           只出【一条】：每个区原样画你选的那几个号（前区填 6 就画 6 个、后区填 2 就画 2 个）。
         注数仍然算准（want），放在 count 里 —— 页面顶部「合计 N 注 × M 倍 = X 元」用它。 */
      var rows = [sets];
      return { ok: 1, kind: 'number', count: want, areas: areas, sets: sets, rows: rows };
    }
    function plan(g) { return isDigit(g) ? planDigit(g) : planNumber(g); }

    /* ---------- 界面刷新（规则 / 合计 / 超限提示） ---------- */
    function refresh() {
      var g = G();
      readInputs();
      if (ruleBox) ruleBox.textContent = ruleText(g);
      var p = plan(g);
      var n = 0, warn = '';
      if (p) {
        if (p.ok) n = p.count; else warn = p.msg || '';
        if (p.ok && p.note) warn = p.note;
      }
      if (sumBox) {
        sumBox.textContent = !n
          ? '注数待调整'
          : '合计 ' + n + ' 注 × ' + st.times + ' 倍 = ' + (n * st.times * (g.price || 2)) + ' 元';
      }
      if (warnBox) {
        if (warn) { warnBox.textContent = warn; show(warnBox, true); }
        else { warnBox.textContent = ''; show(warnBox, false); }
      }
    }

    /* ============================================================
       【自己选号 · 点格子】用户 2026-10-17：「选号 就是自己点击去选号码」
       ------------------------------------------------------------
       · 每个槽位（号码型 = 每个号码区；数字彩 = 每一位）一段格子，格子里是
         <a role="button">（页面不变量：不能用 button 标签）。
       · 点一下选中、再点一下取消；每段显示「已选 N 个（最少 X 个，可多选成复式）」。
       · 点完立刻把已选号变成【一条号码】放进结果区（st.rows）—— 和摇号出来那条同构，
         所以「注数/金额」「保存图片」全都自动跟着走，不用第二套渲染。
       · 只存在内存里（st.pick）：切彩种 / 点清空 / 刷新页面都会没了。
       ============================================================ */
    function pkey(k) { return st.game + '#' + k; }
    function pickArr(k) { return st.pick[pkey(k)] || []; }
    /* 这个彩种要选哪些「槽位」：号码型 = 每个号码区；数字型 = 每一位 */
    function slotsOf(g) {
      var out = [], i;
      if (isDigit(g)) {
        var pos = posOf(g);
        for (i = 0; i < pos.length; i++) {
          out.push({ key: 'p' + i, label: pos[i].n, from: pos[i].from, to: pos[i].to, need: 1, gate: pos[i].gate });
        }
      } else {
        var areas = areasOf(g);
        for (i = 0; i < areas.length; i++) {
          out.push({ key: 'a' + i, label: areas[i].label, from: areas[i].from, to: areas[i].to,
                     need: pickOf(g, areas[i]), color: areas[i].color });
        }
      }
      return out;
    }
    function buildPicker(g) {
      if (!pickBox) return;
      clearNode(pickBox);
      var slots = slotsOf(g), i;
      for (i = 0; i < slots.length; i++) {
        (function (slot) {
          var block = el('div', 'ro-aipick-pblock');
          var head = el('div', 'ro-aipick-phead');
          head.appendChild(el('span', 'ro-aipick-plabel', slot.label));
          var cnt = el('span', 'ro-aipick-pcount');
          cnt.setAttribute('data-ro-aipick-slot', slot.key);
          head.appendChild(cnt);
          block.appendChild(head);
          var grid = el('div', 'ro-aipick-grid');
          for (var n = slot.from; n <= slot.to; n++) {
            (function (num) {
              /* 号码型补两位（01-33）；数字彩就一位（0 显示成「0」不是「00」） */
              var a = el('a', 'ro-aipick-pick', slot.to > 9 ? pad2(num) : String(num));
              a.setAttribute('role', 'button');
              a.setAttribute('tabindex', '0');
              a.setAttribute('data-ro-aipick-slot', slot.key);
              a.setAttribute('data-ro-aipick-num', String(num));
              a.addEventListener('click', function (e) {
                if (e && e.preventDefault) e.preventDefault();
                togglePick(slot.key, num);
              });
              grid.appendChild(a);
            })(n);
          }
          block.appendChild(grid);
          pickBox.appendChild(block);
        })(slots[i]);
      }
      drawPicker(g);
    }
    function drawPicker(g) {
      if (!pickBox) return;
      var slots = slotsOf(g), i, byKey = {};
      for (i = 0; i < slots.length; i++) byKey[slots[i].key] = slots[i];
      var cells = pickBox.querySelectorAll('.ro-aipick-pick');
      for (i = 0; i < cells.length; i++) {
        var k = attr(cells[i], 'data-ro-aipick-slot');
        var sl = byKey[k] || {};
        var sel = pickArr(k).indexOf(parseInt(attr(cells[i], 'data-ro-aipick-num'), 10)) >= 0;
        cells[i].className = 'ro-aipick-pick' + (sel ? ' on' : '') + (sl.color === 'blue' ? ' blue' : '');
      }
      var cnts = pickBox.querySelectorAll('.ro-aipick-pcount');
      for (i = 0; i < cnts.length; i++) {
        var k2 = attr(cnts[i], 'data-ro-aipick-slot');
        var sl2 = byKey[k2] || { need: 0 };
        var got = pickArr(k2).length;
        var txt = '已选 ' + got + ' 个';
        if (sl2.need > 0 && got < sl2.need) txt += '（最少 ' + sl2.need + ' 个，可多选成复式）';
        else if (sl2.need > 0 && got > sl2.need) txt += '（复式）';
        cnts[i].className = 'ro-aipick-pcount' + (sl2.need > 0 && got >= sl2.need ? ' full' : '');
        cnts[i].textContent = txt;
      }
    }
    function togglePick(key, num) {
      var arr = pickArr(key).slice();
      var at = arr.indexOf(num);
      if (at >= 0) arr.splice(at, 1); else arr.push(num);
      arr.sort(function (a, b) { return a - b; });
      st.pick[pkey(key)] = arr;
      drawPicker(G());
      applyPicks();                       /* 点完立刻算注数 + 更新结果区 */
    }
    /* 把已选的号变成「一条号码」：每个槽位都够最少个数才算完整 */
    function pickPlan(g) {
      var slots = slotsOf(g), sets = [], cnt = 1, i;
      for (i = 0; i < slots.length; i++) {
        var sel = pickArr(slots[i].key).slice();
        if (sel.length < slots[i].need) return null;
        sets.push(sel);
        cnt *= C(sel.length, slots[i].need);
      }
      return { sets: sets, count: cnt, slots: slots };
    }
    /* 「选几个」输入框跟着已选个数走 —— 这样顶部「合计 N 注」和结果区永远一致 */
    function syncMultiInputs(slots) {
      var i, ins = multiBox ? multiBox.querySelectorAll('.ro-aipick-in-multi') : [];
      for (i = 0; i < slots.length; i++) {
        var n = pickArr(slots[i].key).length;
        if (n > 0) st.multi[mkey(slots[i].key)] = n;
      }
      for (i = 0; i < ins.length; i++) {
        var k = attr(ins[i], 'data-ro-aipick-key');
        var v = st.multi[mkey(k)];
        if (typeof v === 'number' && ins[i].value !== String(v)) ins[i].value = String(v);
      }
    }
    /* 点格子 → 立刻生效：结果区一条号码 + 注数 + 「选几个」同步 */
    function applyPicks() {
      var g = G(), pp = pickPlan(g);
      if (!pp) {                          /* 还没选够 → 结果区保持原样，只提示差多少 */
        var slots0 = slotsOf(g), wait = [], q;
        for (q = 0; q < slots0.length; q++) {
          var got = pickArr(slots0[q].key).length;
          if (got < slots0[q].need) wait.push(slots0[q].label + '还差 ' + (slots0[q].need - got) + ' 个');
        }
        if (warnBox) {
          warnBox.textContent = wait.length ? ('自己选号：' + wait.join('、')) : '';
          show(warnBox, !!wait.length);
        }
        return;
      }
      if (pp.count > MAX_COMBO) {
        if (warnBox) {
          warnBox.textContent = '复式共 ' + pp.count + ' 注，超过上限 ' + MAX_COMBO + ' 注，请少选几个';
          show(warnBox, true);
        }
        return;
      }
      syncMultiInputs(pp.slots);
      st.rows = [{ kind: isDigit(g) ? 'digit' : 'number',
                   pos: isDigit(g) ? posOf(g) : null,
                   areas: isDigit(g) ? null : areasOf(g),
                   row: pp.sets, sets: pp.sets, count: pp.count, manual: true }];
      st.betCount = pp.count;
      drawOut();
      refresh();
    }
    /* 摇号出来的号也同步到格子（能看、能接着改） */
    function mirrorToPicks(p) {
      if (!p) return;
      var i;
      if (p.kind === 'number') {
        for (i = 0; i < (p.sets || []).length; i++) st.pick[pkey('a' + i)] = (p.sets[i] || []).slice();
      } else {
        for (i = 0; i < (p.sets || []).length; i++) st.pick[pkey('p' + i)] = (p.sets[i] || []).slice();
      }
      drawPicker(G());
    }
    function resetPicks() {
      st.pick = {};
      st.rows = [];
      st.betCount = 0;
      buildPicker(G());
      drawOut();
      refresh();
    }

    /* ---------- 出号 ---------- */
    function hitEl(hit, idx) {
      var row = el('div', 'ro-aipick-hit'), i, j;
      /* 【标签】手选 → 「手选」；折合多注的复式 → 「复式」；单式 → 「第 N 注」 */
      row.appendChild(el('span', 'ro-aipick-idx',
        hit.manual ? '手选'
          : ((hit.count && hit.count > 1) ? '复式' : ('第' + (idx + 1) + '注'))));
      if (hit.kind === 'number') {
        var areas = hit.areas || [];
        for (i = 0; i < areas.length; i++) {
          if (i > 0) row.appendChild(el('span', 'ro-aipick-sep', '+'));
          var a = areas[i], nums = hit.row[i] || [];
          for (j = 0; j < nums.length; j++) {
            /* 号码型（双色球/大乐透/七乐彩/快乐8）补两位；数字彩不补（0 就是「0」不是「00」） */
            row.appendChild(el('span', 'ro-aipick-ball' + (a.color === 'blue' ? ' blue' : ''),
              a.to > 9 ? pad2(nums[j]) : String(nums[j])));
          }
        }
      } else if (hit.sets && hit.sets.length) {
        /* 数字彩：一条号码 = 按【位置】分组画（百位那几个号 · 十位那几个号 · 个位那几个号） */
        for (i = 0; i < hit.sets.length; i++) {
          if (i > 0) row.appendChild(el('span', 'ro-aipick-possep', '·'));
          var sn = hit.sets[i] || [];
          for (j = 0; j < sn.length; j++) row.appendChild(el('span', 'ro-aipick-ball', String(sn[j])));
        }
      } else {
        var pos2 = hit.pos || [];
        for (i = 0; i < hit.row.length; i++) {
          if (pos2[i] && pos2[i].to === 14 && i === hit.row.length - 1) row.appendChild(el('span', 'ro-aipick-sep', '+'));
          row.appendChild(el('span', 'ro-aipick-ball', String(hit.row[i])));
        }
      }
      return row;
    }
    function drawOut() {
      if (!outBox) return;
      clearNode(outBox);
      if (!st.rows.length) {
        outBox.appendChild(el('div', 'ro-aipick-empty', '还没摇号，点「开始摇号」开始'));
        return;
      }
      var g = G();
      var betN = st.betCount || st.rows.length;
      outBox.appendChild(el('div', 'ro-aipick-sumline',
        '本轮 1 条号码 · 折合 ' + betN + ' 注 × ' + st.times + ' 倍 = ' +
        (betN * st.times * (g.price || 2)) + ' 元（模拟）'));
      var n = Math.min(st.rows.length, MAX_SHOW), i;
      for (i = 0; i < n; i++) outBox.appendChild(hitEl(st.rows[i], i));
      if (st.rows.length > n) {
        outBox.appendChild(el('div', 'ro-aipick-more',
          '只画前 ' + n + ' 注，其余 ' + (st.rows.length - n) + ' 注已省略'));
      }
    }

    function doRoll() {
      var g = G();
      readInputs();
      var p = plan(g);
      if (!p.ok) { refresh(); return 0; }
      var list = [], i;
      for (i = 0; i < p.rows.length; i++) {
        /* count 带下去：折合几注（复式）→ 行标签显示「复式」而不是「第1注」 */
        list.push({ kind: p.kind, pos: p.pos, areas: p.areas, row: p.rows[i], sets: p.sets, count: p.count });
      }
      st.rows = list;                 /* 一次摇出「一条号码」，整组替换 */
      st.betCount = p.count;          /* 折合注数（算钱用；一条号码可能是复式） */
      mirrorToPicks(p);               /* 摇出来的号同步到「自己选号」格子（能看能改） */
      drawOut();
      refresh();
      return list.length;
    }

    /* 按 data-ro-aipick-act 找按钮节点 */
    function actNode(a) {
      for (var i = 0; i < acts.length; i++) if (attr(acts[i], 'data-ro-aipick-act') === a) return acts[i];
      return null;
    }
    /* 【本轮改版】没有「选号来源」可切了：面板只剩一条路 ——
       在「选几个」里填每个区要选的个数 → 点「开始摇号」出号。
       这里只负责把该显示的行显示出来。 */
    function applySrc() {
      var g = G();
      show(lineMulti, true);                       /* 「选几个」输入行：始终显示 */
      show(lineTimes, true);
      show(actNode('roll'), true);
      show(actNode('reroll'), true);
      show(actNode('clear'), true);
      show(actNode('save'), true);
      show(actsBox, true);
      show(outBox, true);
      show(lineKl8, !!g.playModes);                /* 快乐8：先选玩法（玩法决定选几个） */
      drawOut();
      refresh();
    }

    function syncTabs() {
      var i, k;
      for (i = 0; i < gameTabs.length; i++) {
        k = attr(gameTabs[i], 'data-ro-aipick-game');
        gameTabs[i].className = 'ro-aipick-tab' + (k === st.game ? ' on' : '');
      }
      var kt = kl8Box ? kl8Box.querySelectorAll('.ro-aipick-kl8tab') : [];
      for (i = 0; i < kt.length; i++) {
        kt[i].className = 'ro-aipick-kl8tab' + (parseInt(attr(kt[i], 'data-ro-aipick-kl8'), 10) === st.kl8 ? ' on' : '');
      }
    }

    /* ---------- 事件 ---------- */
    for (var t1 = 0; t1 < gameTabs.length; t1++) {
      (function (node) {
        node.addEventListener('click', function (e) {
          if (e && e.preventDefault) e.preventDefault();
          var id = attr(node, 'data-ro-aipick-game');
          if (!byId[id] || id === st.game) return;
          /* 切彩种 → 全部重置 + 显示该彩种的规则（「选几个」也回到默认个数） */
          st.game = id;
          st.times = 1;
          st.kl8 = byId[id].playModes ? (byId[id].areas[0].pick || 10) : 10;
          st.multi = {};
          st.rows = [];
          st.pick = {};                    /* 自己勾的格子也跟着清（换彩种=换号池） */
          if (inTimes) inTimes.value = '1';
          buildKl8(byId[id]);
          buildMultiRow(byId[id]);
          buildPicker(byId[id]);           /* 自己选号：按新彩种重画格子 */
          syncTabs();
          applySrc();
        });
      })(gameTabs[t1]);
    }
    for (var t3 = 0; t3 < acts.length; t3++) {
      (function (node) {
        node.addEventListener('click', function (e) {
          if (e && e.preventDefault) e.preventDefault();
          var act = attr(node, 'data-ro-aipick-act');
          /* 清空：把已摇的号 + 自己勾的格子一起清掉 */
          if (act === 'clear') { st.rows = []; st.betCount = 0; st.pick = {}; drawPicker(G()); drawOut(); refresh(); }
          /* 清空重选：只清「自己选号」那套格子 */
          else if (act === 'reset') { resetPicks(); }
          else if (act === 'save') { saveImage(); }                       /* 保存图片：画图 + 全屏弹出 */
          /* 【自选模式】用户 2026-10-17：「加一个：自选 这样他们可以自己选自己看好的」——
             自选时「开始摇号」不生成随机号，直接用你点的号（applyPicks 会在不够时提示还差几个） */
          else if (st.src === 'manual') { applyPicks(); }
          else { doRoll(); }                                             /* 随机模式：开始摇号 / 重摇：整组重摇 */
        });
      })(acts[t3]);
    }

    /* ---------- 「随机 / 自选」两个 chip 的点击（用户 2026-10-17 要求加「自选」） ---------- */
    var srcBtns = root.querySelectorAll('[data-ro-aipick-src]');
    function syncSrc() {
      for (var i = 0; i < srcBtns.length; i++) {
        var on = attr(srcBtns[i], 'data-ro-aipick-src') === st.src;
        srcBtns[i].className = 'ro-aipick-srcbtn' + (on ? ' on' : '');
      }
    }
    for (var t4 = 0; t4 < srcBtns.length; t4++) {
      (function (node) {
        node.addEventListener('click', function (e) {
          if (e && e.preventDefault) e.preventDefault();
          st.src = attr(node, 'data-ro-aipick-src') === 'manual' ? 'manual' : 'random';
          syncSrc();
          if (st.src === 'manual') {
            /* 切到自选：清掉之前摇出来的号【和格子里的勾选】，让你从头点。
               ⚠️ 光清 st.rows 不够：摇号会把号镜像进格子（st.pick），
                  那些勾还在的话，再点几个会累加成超大复式 ——
                  实测：先摇 6+2、再点 5+2 → 变成 11+4 = 2772 注 5544 元。 */
            st.rows = []; st.betCount = 0; st.pick = {}; drawPicker(G());
            drawOut(); refresh();
            if (warnBox) { warnBox.textContent = '自选：点下面的号码，选够个数就算好注数'; show(warnBox, true); }
          } else {
            if (warnBox) show(warnBox, false);
            doRoll();                     /* 切回随机：立刻摇一组 */
          }
        });
      })(srcBtns[t4]);
    }
    if (inTimes) {
      /* 同 multiInput：不能在 input 事件里 refresh/夹取（那样打不出两位数）。
         只在失焦(change) 或回车时生效；聚焦时全选，直接打字即替换。 */
      inTimes.addEventListener('focus', function () { try { inTimes.select(); } catch (e) { /* 忽略 */ } });
      inTimes.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); refresh(); try { inTimes.blur(); } catch (e) { /* 忽略 */ } }
      });
      inTimes.addEventListener('change', refresh);
    }

    /* ---------- 初始状态：双色球 · 自己选号 · 红球 7 个 / 蓝球 1 个 · 倍数 1 · 结果为空 ---------- */
    (function setup() {
      var g = G();
      buildKl8(g);
      buildMultiRow(g);
      buildPicker(g);                     /* 自己选号：初始格子 */
      syncTabs();
      syncSrc();                          /* 「随机 / 自选」两个 chip 的高亮 */
      applySrc();
    })();

    /* 给验收脚本留一个干净入口（不影响页面行为） */
    window.__roAiPick = {
      state: function () {
        return { game: st.game, times: st.times, kl8: st.kl8, rows: st.rows.length,
                 multi: st.multi };
      },
      rows: function () { return st.rows; },
      lastImage: function () { return st.pic || null; }        /* 保存图片生成的最后一张（只在内存里） */
    };
  } catch (e) { /* 忽略：面板退化成静态说明，不影响页面其它部分 */ }
})();
</script>

<!-- __ANTISHOT_JS__ 防截图锁定（最终版）
     用户原话：「就是只能我这个本机可以截屏，别人不能」
     owner 判定（三条，先看协议再看 IP）：
       ⓪ 网址带 ?owner=1 → 直接当主人（兜底开关，不查 IP）
       ① location.protocol === 'file:'（或 Electron / localhost）→ 本机 App 打开 → 主人
       ② 浏览器打开 → 查公网 IP，命中固定 IP 才算主人
            （3 个源并行抢答 + 8 个源兜底，每源 3 秒超时，全失败每 3 秒重试，最多 3 轮）
            实测 2026-10-17：api.ipify.org 在用户网络下 ECONNRESET 连不上 → 只能放最后
     ⚠️ 不用 localStorage / sessionStorage / cookie（用户要求「所有都不能保存」）：
        owner 每次打开都重新判定，不落任何存储 —— IP 只记在一个内存变量里
        （否则别人在控制台里改一行就能解锁）。
     ⚠️ 判定失败 / 请求超时 → 保持「按别人处理」（安全降级）。
     ⚠️ 这套代码【不能真正禁止截图】，只能提高门槛：
        ✅ 能挡：切窗口 / 切标签页（失焦即模糊）、PrintScreen、Win+Shift+S、
                macOS Cmd+Shift+3·4·5、右键、拖拽、复制、剪切、F12、Ctrl+Shift+I·J·C、Ctrl+U
        ❌ 挡不住：手机自带截图（不触发任何事件）、已经冻结屏幕的截图工具、
                录屏软件、另一台手机拍屏、禁用 JS 之后
        ❌ IP 判定也有局限：家宽 IP 会变、手机流量是另一个 IP、走代理也会变
        → 真正「截出来全黑」只有 App 端 Electron setContentProtection(true) 能做到。
     ⚠️ 必须放在本模板的 </body> 之前（模板字符串内部）；不许用裸按钮标签。 -->
<script>
(function () {
  'use strict';
  try {
    var OWNER_IP = '120.231.138.19';
    var root = document.documentElement;
    var lockTimer = null;
    var owner = false;                     /* 默认按「别人」处理：先按最严的来，安全降级 */

    function lock() {
      if (owner) return;
      root.classList.add('locked');
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(unlock, 4000);        /* 4 秒后自动解锁 */
    }
    function unlock() {
      if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
      root.classList.remove('locked');
    }
    function clearClipboard() {
      if (owner) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('').catch(function () { /* 忽略 */ });
        }
      } catch (e) { /* 忽略 */ }
    }
    function isShotKey(e) {
      if (!e) return false;
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') return true;
      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) return true;
      if (e.metaKey && e.shiftKey && (e.key === 's' || e.key === 'S')) return true;
      return false;
    }
    /* 【已删除】原来这里有一个画水印的函数：用户明确说「不要水印」，
       水印（DOM + 样式 + 函数 + 所有调用）已整块拿掉。 */
    /* ============================================================
       【保存权限】三处允许保存、其余一律禁止（用户要求）
       ------------------------------------------------------------
       ✅ 允许：① 晒票（实票图，外链 <img>）② GPT模型摇号出的图
        （以后新加的区块只要带上 class="allow-save" 就自动放行 ——
          分享页现在没有别的可保存区块）
       ❌ 禁止：推荐图 / 资料、最新开奖、开机号、直播、文章正文、免责……
       判断：事件目标往上找，命中 .allow-save 就算放行；
             全屏看图层再看 view 上的 data-allow（openUrl 传 true = 放行，
             推荐图走 open() → data-allow=0 = 拦）。
       ✅ 白名单命中的一律 return（不 preventDefault）。
       ============================================================ */
    function allowedTarget(e) {
      var n = e && e.target;
      while (n && n.nodeType === 1) {
        if (n.classList && n.classList.contains && n.classList.contains('allow-save')) return true;
        if (n.classList && n.classList.contains && n.classList.contains('ro-mob-view')) {
          return String(n.getAttribute('data-allow') || '0') === '1';
        }
        n = n.parentNode;
      }
      return false;
    }
    function armProtection() {
      window.addEventListener('blur', function () { lock(); });
      window.addEventListener('focus', function () { unlock(); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) lock(); else unlock();
      });
      window.addEventListener('keydown', function (e) {
        if (owner) return;
        if (isShotKey(e)) { lock(); clearClipboard(); }
      });
      window.addEventListener('keyup', function (e) {
        if (owner) return;
        if (isShotKey(e)) { lock(); clearClipboard(); }
      });
      /* 开发者工具入口（照抄用户给的键位） */
      document.addEventListener('keydown', function (e) {
        if (owner) return;
        if (e.key === 'F12') { e.preventDefault(); lock(); return; }
        if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].indexOf(e.key) >= 0) {
          e.preventDefault(); lock(); return;
        }
        if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); }
      });
      /* 保存相关的拦截：白名单以外全部拦掉 */
      document.addEventListener('contextmenu', function (e) { if (!allowedTarget(e)) e.preventDefault(); });
      document.addEventListener('dragstart', function (e) { if (!allowedTarget(e)) e.preventDefault(); });
      document.addEventListener('copy', function (e) { if (!allowedTarget(e)) e.preventDefault(); });
      document.addEventListener('cut', function (e) { if (!allowedTarget(e)) e.preventDefault(); });
      document.addEventListener('selectstart', function (e) { if (!allowedTarget(e)) e.preventDefault(); });
    }
    /* 是不是点分十进制 IPv4（故意不用正则：正则里的 \d 写进模板字符串会被吃掉） */
    function isIPv4(s) {
      var p = String(s).trim().split('.');
      if (p.length !== 4) return false;
      for (var i = 0; i < 4; i++) {
        var n = p[i];
        if (!n.length || n.length > 3) return false;
        for (var j = 0; j < n.length; j++) {
          var c = n.charCodeAt(j);
          if (c < 48 || c > 57) return false;
        }
      }
      return true;
    }
    /* ① 本机 App / 本机地址：file:// 或 Electron / localhost —— 100% 可靠，不看 IP
       （2026-10-17 放宽：App 里可能不是 file://，只要是本机 App 就算主人） */
    function isLocalApp() {
      try {
        if (String(location.protocol) === 'file:') return true;
        var h = String(location.hostname || '');
        if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true;
        if (String(navigator.userAgent || '').indexOf('Electron') >= 0) return true;
      } catch (e) { /* 忽略 */ }
      return false;
    }
    /* 【强制主人】网址带 ?owner=1 → 直接算主人，不查 IP、不发任何请求（兜底开关）
       ⚠️ 名字故意不起眼；别人不知道这个参数，照样看不到热度计数。 */
    function forcedOwner() {
      try {
        var q = String(location.search || '');
        if (q.charAt(0) === '?') q = q.slice(1);
        var hh = String(location.hash || '');
        if (hh.charAt(0) === '#') hh = hh.slice(1);
        return ('&' + q + '&' + hh + '&').indexOf('&owner=1&') >= 0;
      } catch (e) { return false; }
    }
    /* ② 浏览器打开：查公网 IP —— 多源【并行】兜底（每源 3 秒超时）
       2026-10-17 实测（用户网络 · 每个源都验了 HTTP/耗时/能否解析）：
         ifconfig.me 331ms | ipecho.net 367ms | ipinfo.io 371ms | api.ip.sb 492ms
         ipwho.is 551ms | icanhazip 565ms | api64.ipify 604ms | bigdatacloud 610ms
         myip.wtf 962ms(偶尔超时) | checkip.amazonaws 311ms(CORS 靠 Origin 头)
         api.ipify.org → 实测 ECONNRESET，连不上 → 只能放最后
       已淘汰：ipapi.co(403) · api.myip.com(3s 超时) · ip.seeip.org(3s 超时)
       前三名并行抢答，谁先成功用谁 → 判定时间从「最坏 16 秒」降到约 0.4 秒。 */
    var IP_CACHE = null;            /* 【只在内存里】本次会话记下的 IP —— 不碰任何持久化存储 */
    var IP_PENDING = null;          /* 并发去重：多处同时要 IP 时共用同一个 Promise */
    var IP_TIMEOUT = 3000;          /* 每源 3 秒（原来是 4 秒）：更快失败、更快换下一个 */
    var IP_WAVE1 = [
      { url: 'https://ifconfig.me/all.json', json: 'ip_addr' },
      { url: 'https://ipecho.net/plain', text: 1 },
      { url: 'https://ipinfo.io/json', json: 'ip' }
    ];
    var IP_WAVE2 = [
      { url: 'https://api.ip.sb/jsonip', json: 'ip' },
      { url: 'https://ipwho.is/', json: 'ip' },
      { url: 'https://icanhazip.com', text: 1 },
      { url: 'https://api64.ipify.org?format=json', json: 'ip' },
      { url: 'https://api.bigdatacloud.net/data/client-ip', json: 'ipString' },
      { url: 'https://checkip.amazonaws.com', text: 1 },
      { url: 'https://myip.wtf/json', json: 'YourFuckingIPAddress' },
      { url: 'https://api.ipify.org?format=json', json: 'ip' }
    ];
    /* 取第一段非空白（纯文本源返回的就是 IP，可能带换行）—— 故意不用正则：
       这段脚本写在模板字符串里，正则的反斜杠转义会被吃掉 */
    function firstToken(s) {
      var t = String(s == null ? '' : s), out = '';
      for (var i = 0; i < t.length; i++) {
        var c = t.charCodeAt(i);
        if (c === 32 || c === 9 || c === 10 || c === 13) { if (out) break; else continue; }
        out += t.charAt(i);
      }
      return out;
    }
    function fetchIP(s) {
      var ctl = null, timer = null;
      try {
        ctl = new AbortController();
        timer = setTimeout(function () { try { ctl.abort(); } catch (e2) { /* 忽略 */ } }, IP_TIMEOUT);
      } catch (e) { ctl = null; }
      return fetch(s.url, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' })
        .then(function (res) {
          if (timer) { clearTimeout(timer); timer = null; }
          if (!res || !res.ok) return '';
          return res.text();
        })
        .then(function (body) {
          if (!body) return '';
          if (s.text) return firstToken(body);
          var j = null;
          try { j = JSON.parse(body); } catch (e) { j = null; }
          return j ? String(j[s.json] || '').trim() : '';
        })
        .catch(function () {
          if (timer) { clearTimeout(timer); timer = null; }
          return '';
        });
    }
    /* 一组源【同时发出】，第一个解析出 IPv4 的胜出；全失败才返回空 */
    function raceWave(list) {
      if (!list.length) return Promise.resolve('');
      return new Promise(function (resolve) {
        var done = false, left = list.length;
        list.forEach(function (s) {
          fetchIP(s).then(function (ip) {
            if (done) return;
            if (isIPv4(ip)) { done = true; resolve(ip); return; }
            left--;
            if (left <= 0) { done = true; resolve(''); }
          });
        });
      });
    }
    function lookupIPOnce() {
      return raceWave(IP_WAVE1).then(function (ip) {
        if (ip) return ip;
        return raceWave(IP_WAVE2);       /* 第一组全军覆没才打第二组 */
      });
    }
    /* ③ 全部失败 → 每 3 秒重试一次，最多 3 轮（不卡页面：全程异步） */
    function getVisitorIP() {
      if (IP_CACHE) return Promise.resolve(IP_CACHE);
      if (IP_PENDING) return IP_PENDING;
      var rounds = 0;
      function attempt() {
        rounds++;
        return lookupIPOnce().then(function (ip) {
          if (ip) { IP_CACHE = ip; IP_PENDING = null; return ip; }
          if (rounds >= 3) { IP_PENDING = null; return ''; }
          return new Promise(function (r) { setTimeout(r, 3000); }).then(attempt);
        });
      }
      IP_PENDING = attempt();
      return IP_PENDING;
    }
    /* 给验收脚本留一个只读入口（不影响页面行为） */
    window.__roOwner = {
      ip: function () { return IP_CACHE; },
      isOwner: function () { return owner; },
      forced: forcedOwner,
      local: isLocalApp
    };
    function markOwner() {
      owner = true;
      unlock();
      root.classList.add('is-owner');       /* 右上角出现「管理员模式」徽章 */
    }

    /* 先按「别人」把保护装上；查到是主人再撤掉
       （owner 判定失败 → 保持最严 = 安全降级）。
       ⚠️ 这里不再画水印：用户明确说「不要水印」。
       判定顺序：本机 App → ?owner=1 → 查公网 IP（3 组并行 + 3 轮重试）。
       热度计数（.ro-hot）挂的是同一个 html.is-owner：
       is-owner 一加上，热度计数立刻显示，不需要刷新。 */
    armProtection();

    if (isLocalApp()) {
      markOwner();                          /* 本机 App：不用联网，立刻生效 */
    } else if (forcedOwner()) {
      markOwner();                          /* ?owner=1：兜底开关，不查 IP、零请求 */
    } else {
      getVisitorIP().then(function (ip) {
        if (ip && ip === OWNER_IP) markOwner();
        /* 查不到 → 保持按「别人」处理（安全降级）；
           想强开就加 ?owner=1 */
      }).catch(function () { /* 忽略：查不到 → 保持按「别人」处理 */ });
    }
  } catch (e) { /* 忽略：防截图这段挂了，页面照样能正常看 */ }
})();
</script>

<!-- __HOT_OWNER__ 热度计数（只有 owner 会看到；拿不到就隐藏） -->
<script async src="https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"></script>
<script>
(function () {
  try {
    var box = document.getElementById('ro-hot');
    var num = document.getElementById('busuanzi_value_site_uv');
    if (!box || !num) return;
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      var v = String(num.textContent || '').trim();
      /* 不蒜子把数字直接写进这个 span；是纯数字才算拿到。
         ⚠️ 2026-10-17 修：原来写的是斜杠 d 那种写法，这段脚本在【模板字符串】里，
            反斜杠会被吃掉 → 生成出来变成 /^d+$/ → 永远匹配不到数字
            → 热度计数【谁都看不到】（连主人也看不到）。改用 [0-9] 就没有反斜杠。 */
      if (/^[0-9]+$/.test(v)) {
        box.hidden = false;          /* 拿到数字 → 交给 CSS 判断是否 owner */
        clearInterval(t);
      } else if (tries > 60) {       /* 30 秒还拿不到 → 整块隐藏，不显示 --
                                        （30s 是为了覆盖 IP 判定最多 3 轮重试 ≈18s） */
        clearInterval(t);
        box.hidden = true;
      }
    }, 500);
  } catch (e) { /* 这段挂了不影响页面 */ }
})();
</script>
${INSTALL_HTML}
${INSTALL_JS}
${CHAT_HTML}
${CHAT_JS}
<div class="tool-view" id="toolView" role="dialog" aria-label="智能分析">
  <div class="tool-view-head"><span class="tool-back" role="button" tabindex="0" id="toolBack">← 返回</span><span class="tool-view-title" id="toolTitle">详情</span></div>
  <div class="tool-view-body" id="toolBody"></div>
</div>
<script>
/* __TOOLS_JS__ 智能分析 · 8 个子页面
   ------------------------------------------------------------
   数据纪律（用户铁律）：【绝对不编数字】
     · 能算的 → 页面脚本从本页已有的开奖数据（DRAW_HISTORY，8 彩种 × 近 60 期）
                和实票统计（HEATMAP_DATA）里【现算】
     · 算不出的 → 页面直接写「暂不支持 / 需要更多数据」，不写假数字
     · AI推荐 → 就是【系统随机】，页面上明确标注「仅供娱乐参考」，不假装是 AI 算的
   技术约束：
     · 零外部依赖（折线用内联 SVG 画，不引图表库）
     · 不碰浏览器存储（聊天/状态只放内存变量 st，刷新就没了）
     · 没有弹窗（提示一律写在页面里，微信里也看得见）
     · 没有按钮标签（可点的都是 div role="button" tabindex="0"）
   写法约束：这段嵌在页面的模板字符串里 ——
     ⚠️【只用单引号】【不写反斜杠转义】【不写反引号】，
        否则会在生成时被吃掉（之前踩过两次）。 */
(function () {
  var view = document.getElementById('toolView');
  var body = document.getElementById('toolBody');
  var titleEl = document.getElementById('toolTitle');
  if (!view || !body) return;

  /* 构建期注入：8 个彩种的号码区间 / 位数（来自 games.js 的真配置） */
  var GAMES = ${TOOL_GAMES_JS};
  var TITLES = { stat: '数据统计', trend: '趋势分析', hot: '实时热点', ma: '均线分析', index: '指数预测', omit: '遗漏宝', pattern: '智能规律', ai: 'AI推荐' };
  var SPAN = 30;
  var st = { id: 'stat', game: 'ssq', area: '', ai: null, aiTimes: 0 };

  var HIST = null;
  try { if (typeof DRAW_HISTORY !== 'undefined' && DRAW_HISTORY && DRAW_HISTORY.games) HIST = DRAW_HISTORY.games; } catch (e0) { HIST = null; }
  var HM = null;
  try { if (typeof HEATMAP_DATA !== 'undefined' && HEATMAP_DATA && HEATMAP_DATA.games) HM = HEATMAP_DATA.games; } catch (e1) { HM = null; }

  /* ---------------- 基础工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt1(n) {
    if (n == null || isNaN(n)) return '—';
    return (Math.round(n * 10) / 10).toFixed(1);
  }
  function pctS(a, b) { return b ? fmt1(a * 100 / b) + '%' : '—'; }
  function row(k, v) { return '<div class="tv-row"><span class="tv-k">' + k + '</span><span class="tv-v">' + v + '</span></div>'; }
  function card(h, inner) { return '<div class="tv-card">' + (h ? '<div class="tv-h">' + h + '</div>' : '') + inner + '</div>'; }
  function note(t) { return '<div class="tv-note">' + t + '</div>'; }
  function none(h, t) { return '<div class="tv-none"><b>' + h + '</b>' + t + '</div>'; }

  function gameById(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return GAMES[0];
  }
  function drawsOf(id) { var a = HIST ? HIST[id] : null; return (a && a.length) ? a : []; }
  function numsOf(d, key) { var a = (d && d.areas) ? d.areas[key] : null; return (a && a.length) ? a : []; }
  function areaCfg(g, key) {
    for (var i = 0; i < g.areas.length; i++) if (g.areas[i].key === key) return g.areas[i];
    return g.areas[0];
  }
  function curArea(g) {
    var want = st.area;
    for (var i = 0; i < g.areas.length; i++) if (g.areas[i].key === want) return want;
    return g.areas[0] ? g.areas[0].key : 'main';
  }
  function areaLabel(g, key) {
    var c = areaCfg(g, key);
    return c.label || key;
  }
  function areaIdx(g) {
    var k = curArea(g);
    for (var i = 0; i < g.areas.length; i++) if (g.areas[i].key === k) return i;
    return 0;
  }
  function splitAt(cfg) { return cfg.from + Math.floor((cfg.to - cfg.from + 1) / 2) - 1; }

  /* ---------------- 统计：奇偶 / 大小 / 和值 / 跨度 / 012路 ---------------- */
  function statOf(gid, n) {
    var g = gameById(gid), key = curArea(g), cfg = areaCfg(g, key);
    var list = drawsOf(gid).slice(0, n);
    var o = { n: 0, cnt: 0, odd: 0, even: 0, big: 0, small: 0, sum: 0, sumMin: 0, sumMax: 0,
      span: 0, r0: 0, r1: 0, r2: 0, rows: [], ok: false };
    var split = splitAt(cfg);
    for (var i = 0; i < list.length; i++) {
      var nums = numsOf(list[i], key);
      if (!nums.length) continue;
      var s = 0, mx = -1e9, mn = 1e9;
      for (var j = 0; j < nums.length; j++) {
        var v = nums[j];
        s += v; o.cnt++;
        if (v % 2) o.odd++; else o.even++;
        if (v > split) o.big++; else o.small++;
        if (v % 3 === 0) o.r0++; else if (v % 3 === 1) o.r1++; else o.r2++;
        if (v > mx) mx = v;
        if (v < mn) mn = v;
      }
      o.n++; o.sum += s;
      if (o.n === 1 || s < o.sumMin) o.sumMin = s;
      if (o.n === 1 || s > o.sumMax) o.sumMax = s;
      o.span += (mx - mn);
      o.rows.push({ issue: String(list[i].issue || ''), nums: nums, sum: s, span: mx - mn });
      o.ok = true;
    }
    o.split = split;
    return o;
  }

  /* ---------------- 遗漏：每个号码已经多少期没出 ---------------- */
  function omitOf(gid) {
    var g = gameById(gid), key = curArea(g), cfg = areaCfg(g, key);
    var list = drawsOf(gid), res = [];
    var total = cfg.to - cfg.from + 1, perDraw = 0;
    for (var i = 0; i < list.length; i++) {
      var nn = numsOf(list[i], key);
      if (nn.length) { perDraw = nn.length; break; }
    }
    var theo = perDraw ? total / perDraw : 0;
    for (var v = cfg.from; v <= cfg.to; v++) {
      var cur = -1, gap = 0, mxGap = 0, seen = 0;
      for (var k = 0; k < list.length; k++) {
        var nums = numsOf(list[k], key);
        if (nums.indexOf(v) >= 0) {
          if (cur < 0) cur = k;
          seen++; gap = 0;
        } else {
          gap++;
          if (gap > mxGap) mxGap = gap;
        }
      }
      if (cur < 0) cur = list.length;
      res.push({ n: v, cur: cur, max: mxGap, seen: seen });
    }
    return { list: res, theo: theo, total: total, perDraw: perDraw, draws: list.length };
  }

  /* ---------------- 频次（热号 / 冷号） ---------------- */
  function freqOf(gid, n) {
    var g = gameById(gid), key = curArea(g), cfg = areaCfg(g, key);
    var list = drawsOf(gid).slice(0, n), map = {}, total = 0;
    for (var v = cfg.from; v <= cfg.to; v++) map[v] = 0;
    for (var i = 0; i < list.length; i++) {
      var nums = numsOf(list[i], key);
      for (var j = 0; j < nums.length; j++) {
        if (map[nums[j]] === undefined) map[nums[j]] = 0;
        map[nums[j]]++; total++;
      }
    }
    var arr = [];
    for (var k in map) if (map.hasOwnProperty(k)) arr.push({ n: Number(k), c: map[k] });
    arr.sort(function (a, b) { return (b.c - a.c) || (a.n - b.n); });
    return { arr: arr, total: total, draws: list.length };
  }

  /* 实票统计里这个彩种对应的那块（前区 / 后区） */
  function hmAreaOf(gid, ai) {
    var H = HM ? HM[gid] : null;
    if (!H) return null;
    var a = ai === 0 ? H.front : (ai === 1 ? H.back : null);
    if (!a || !a.items || !a.items.length) return null;
    return a;
  }

  /* ---------------- 规律：连号 / 重号 / 同尾 / 奇偶分布 ---------------- */
  function patternOf(gid, n) {
    var g = gameById(gid), key = curArea(g);
    var list = drawsOf(gid).slice(0, n);
    var used = 0, withConsec = 0, consecPairs = 0, repeatSum = 0, repeatN = 0, sameTail = 0;
    var oddDist = {};
    for (var i = 0; i < list.length; i++) {
      var nums = numsOf(list[i], key).slice().sort(function (a, b) { return a - b; });
      if (!nums.length) continue;
      used++;
      var pairs = 0;
      for (var j = 1; j < nums.length; j++) if (nums[j] - nums[j - 1] === 1) pairs++;
      if (pairs > 0) withConsec++;
      consecPairs += pairs;
      var tail = {};
      for (var t = 0; t < nums.length; t++) {
        var d = nums[t] % 10;
        tail[d] = (tail[d] || 0) + 1;
      }
      for (var q in tail) if (tail.hasOwnProperty(q) && tail[q] > 1) sameTail++;
      if (i > 0) {
        var pn = numsOf(list[i - 1], key), rep = 0;
        for (var r = 0; r < nums.length; r++) if (pn.indexOf(nums[r]) >= 0) rep++;
        repeatSum += rep; repeatN++;
      }
      var oddc = 0;
      for (var w = 0; w < nums.length; w++) if (nums[w] % 2) oddc++;
      oddDist[oddc] = (oddDist[oddc] || 0) + 1;
    }
    var bestOdd = 0, bestCnt = -1;
    for (var ok in oddDist) {
      if (oddDist.hasOwnProperty(ok) && oddDist[ok] > bestCnt) { bestCnt = oddDist[ok]; bestOdd = Number(ok); }
    }
    return { used: used, withConsec: withConsec, consecPairs: consecPairs,
      repeatAvg: repeatN ? repeatSum / repeatN : 0,
      sameTail: sameTail, bestOdd: bestOdd, bestCnt: bestCnt, oddDist: oddDist };
  }

  /* ---------------- 和值序列 + 移动平均（均线用） ---------------- */
  function sumSeries(gid, n) {
    var g = gameById(gid), key = curArea(g);
    var list = drawsOf(gid).slice(0, n), sums = [];
    for (var i = list.length - 1; i >= 0; i--) {
      var nums = numsOf(list[i], key);
      if (!nums.length) continue;
      var s = 0;
      for (var j = 0; j < nums.length; j++) s += nums[j];
      sums.push(s);
    }
    return sums;
  }
  function maSeries(sums, k) {
    var out = [];
    for (var i = 0; i < sums.length; i++) {
      if (i < k - 1) { out.push(null); continue; }
      var t = 0;
      for (var q = i - k + 1; q <= i; q++) t += sums[q];
      out.push(t / k);
    }
    return out;
  }

  /* ---------------- 内联 SVG 折线（不引图表库） ---------------- */
  function spark(a, b, aLabel, bLabel) {
    var all = [], i;
    for (i = 0; i < a.length; i++) if (a[i] != null) all.push(a[i]);
    if (b) for (i = 0; i < b.length; i++) if (b[i] != null) all.push(b[i]);
    if (!all.length) return '';
    var mn = all[0], mx = all[0];
    for (i = 1; i < all.length; i++) {
      if (all[i] < mn) mn = all[i];
      if (all[i] > mx) mx = all[i];
    }
    if (mx === mn) mx = mn + 1;
    var W = 320, H = 96, P = 8, n = a.length;
    function pts(arr) {
      var s = '', started = false;
      for (var k = 0; k < arr.length; k++) {
        if (arr[k] == null) continue;
        var x = n > 1 ? (P + k * (W - 2 * P) / (n - 1)) : (W / 2);
        var y = H - P - ((arr[k] - mn) / (mx - mn)) * (H - 2 * P);
        s += (started ? ' ' : '') + (Math.round(x * 10) / 10) + ',' + (Math.round(y * 10) / 10);
        started = true;
      }
      return s;
    }
    var svg = '<svg class="tv-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      (b ? '<polyline points="' + pts(b) + '" fill="none" stroke="#c9973f" stroke-width="1.6" stroke-dasharray="5 3"/>' : '') +
      '<polyline points="' + pts(a) + '" fill="none" stroke="#1a8c5a" stroke-width="1.8"/>' +
      '</svg>';
    var first = a[0], last = a[a.length - 1];
    svg += '<div class="tv-spark-x"><span>最低 ' + Math.round(mn) + ' · 最高 ' + Math.round(mx) + '</span><span>最新 ' + last + '</span></div>';
    if (b) {
      svg += '<div class="tv-legend"><span><i style="background:#1a8c5a"></i>' + aLabel + '</span>' +
        '<span><i style="background:#c9973f"></i>' + bLabel + '</span></div>';
    }
    return svg;
  }

  /* ---------------- 顶部：彩种 / 号码区 切换 ---------------- */
  function chipsGame() {
    var h = '<div class="tv-seg">';
    for (var i = 0; i < GAMES.length; i++) {
      h += '<div class="tv-chip' + (GAMES[i].id === st.game ? ' on' : '') + '" role="button" tabindex="0" data-tv-game="' + esc(GAMES[i].id) + '">' + esc(GAMES[i].name) + '</div>';
    }
    return h + '</div>';
  }
  function chipsArea(g) {
    if (g.areas.length < 2) return '';
    var h = '<div class="tv-seg">', k = curArea(g);
    for (var i = 0; i < g.areas.length; i++) {
      h += '<div class="tv-chip' + (g.areas[i].key === k ? ' on' : '') + '" role="button" tabindex="0" data-tv-area="' + esc(g.areas[i].key) + '">' + esc(g.areas[i].label || ('区' + (i + 1))) + '</div>';
    }
    return h + '</div>';
  }
  function numsCell(nums) {
    var n = nums.slice(0, 6).join(' ');
    return n + (nums.length > 6 ? ' …' : '');
  }

  /* ================= ① 数据统计 ================= */
  function pageStat() {
    var g = gameById(st.game), key = curArea(g);
    var a = statOf(g.id, SPAN), b = statOf(g.id, 10);
    if (!a.ok) return chipsGame() + none('暂不支持', '这个彩种本页没有开奖数据，算不出来。');
    var h = chipsGame() + chipsArea(g);
    h += card('近 ' + a.n + ' 期 · ' + esc(g.name) + ' ' + esc(areaLabel(g, key)),
      row('奇偶比', '奇 ' + a.odd + ' : 偶 ' + a.even + '（' + pctS(a.odd, a.cnt) + ' / ' + pctS(a.even, a.cnt) + '）') +
      row('大小比', '大 ' + a.big + ' : 小 ' + a.small + '（小 ≤ ' + a.split + '）') +
      row('和值 均值', fmt1(a.sum / a.n)) +
      row('和值 区间', a.sumMin + ' ~ ' + a.sumMax) +
      row('跨度 均值', fmt1(a.span / a.n)) +
      row('012 路', '0路 ' + a.r0 + ' · 1路 ' + a.r1 + ' · 2路 ' + a.r2));
    if (b.ok) {
      h += card('近 ' + b.n + ' 期 · 同一口径',
        row('奇偶比', '奇 ' + b.odd + ' : 偶 ' + b.even) +
        row('大小比', '大 ' + b.big + ' : 小 ' + b.small) +
        row('和值 均值', fmt1(b.sum / b.n)) +
        row('跨度 均值', fmt1(b.span / b.n)) +
        row('012 路', '0路 ' + b.r0 + ' · 1路 ' + b.r1 + ' · 2路 ' + b.r2));
    }
    var t = '<table class="tv-tbl"><thead><tr><th>期号</th><th>号码</th><th>和值</th><th>跨度</th></tr></thead><tbody>';
    for (var i = 0; i < Math.min(6, a.rows.length); i++) {
      var r0 = a.rows[i];
      t += '<tr><td>' + esc(r0.issue) + '</td><td class="l">' + esc(numsCell(r0.nums)) + '</td><td>' + r0.sum + '</td><td>' + r0.span + '</td></tr>';
    }
    t += '</tbody></table>';
    h += card('最近 6 期明细', t);
    h += note('全部按近 ' + SPAN + ' 期内真实开出的号码现算；大小以「' + areaCfg(g, key).from + '~' + areaCfg(g, key).to + '」的中位划分。');
    return h;
  }

  /* ================= ② 趋势分析 ================= */
  function pageTrend() {
    var g = gameById(st.game), key = curArea(g);
    var sums = sumSeries(g.id, SPAN);
    if (sums.length < 3) return chipsGame() + none('需要更多数据', '这个彩种本页的开奖期数不够画走势。');
    var ma5 = maSeries(sums, 5);
    var last = sums[sums.length - 1], prev = sums[sums.length - 2];
    var d = last - prev;
    var h = chipsGame() + chipsArea(g);
    h += card('和值走势 · 近 ' + sums.length + ' 期',
      spark(sums, ma5, '每期和值', '5 期均值'));
    h += card('最近变化',
      row('最新一期和值', String(last)) +
      row('比上一期', (d > 0 ? '+' : '') + d) +
      row('近 5 期均值', fmt1(ma5[ma5.length - 1])) +
      row('近 30 期均值', fmt1(avgOf(sums))));
    h += '<div class="tv-acts"><div class="tv-btn" role="button" tabindex="0" data-tv-act="goto-trend">打开完整走势表</div></div>';
    h += note('本页下方本来就有「近 30 期走势 · 预选参考」那张完整表（8 彩种 × 30 期、带连线），这里不重复画一遍 —— 点上面的按钮会就地展开并跳过去。');
    return h;
  }
  function avgOf(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return a.length ? t / a.length : 0; }

  /* ================= ③ 遗漏宝 ================= */
  function pageOmit() {
    var g = gameById(st.game), key = curArea(g);
    var o = omitOf(g.id);
    if (!o.draws) return chipsGame() + none('需要更多数据', '这个彩种本页没有开奖数据，算不出遗漏。');
    var over = [], i;
    for (i = 0; i < o.list.length; i++) if (o.theo && o.list[i].cur >= o.theo * 2) over.push(o.list[i]);
    over.sort(function (a, b) { return b.cur - a.cur; });
    var h = chipsGame() + chipsArea(g);
    h += card('理论遗漏 · ' + esc(g.name) + ' ' + esc(areaLabel(g, key)),
      row('号码总数 / 每期出几个', o.total + ' 个 / ' + (o.perDraw || '—') + ' 个') +
      row('理论平均遗漏', o.theo ? fmt1(o.theo) + ' 期' : '—') +
      row('标红门槛（2 倍理论）', o.theo ? fmt1(o.theo * 2) + ' 期' : '—') +
      row('超过门槛的号码', over.length ? over.length + ' 个' : '没有'));
    if (over.length) {
      var list = '';
      for (i = 0; i < Math.min(8, over.length); i++) {
        list += row(String(over[i].n), '已 ' + over[i].cur + ' 期没出 · 历史最大 ' + over[i].max + ' 期');
      }
      h += card('超出理论的号码（红底）', list);
    }
    var cells = '';
    for (i = 0; i < o.list.length; i++) {
      var it = o.list[i];
      var bad = o.theo && it.cur >= o.theo * 2;
      cells += '<div class="tv-cell' + (bad ? ' bad' : '') + '"><b>' + it.n + '</b><i>' + it.cur + '</i></div>';
    }
    h += card('每个号码：当前遗漏（数字=已经多少期没出）', '<div class="tv-cells">' + cells + '</div>');
    h += note('格子里的数字 = 这个号码【已经多少期没出】（0 = 最新一期就出了）；红底 = 已经超过理论值的 2 倍。全部按本页已有的近 ' + o.draws + ' 期现算，不是估的。');
    return h;
  }

  /* ================= ④ 实时热点 ================= */
  function pageHot() {
    var g = gameById(st.game), ai = areaIdx(g), key = curArea(g);
    var H = hmAreaOf(g.id, ai);
    var h = chipsGame() + chipsArea(g);
    var srcText;
    if (H) {
      /* 实票统计的字段是 {num, pct, count}；这里统一成 {n, c}，和下面的
         「按开奖期数现算」那一路共用同一个 bars()（避免出现 undefined） */
      var items = H.items.map(function (x) { return { n: x.num, c: x.count }; })
        .sort(function (a, b) { return (b.c - a.c) || (a.n - b.n); });
      var hot = items.slice(0, 6), cold = items.slice(-6).reverse();
      var tot = 0;
      for (var i = 0; i < items.length; i++) tot += items[i].c;
      srcText = '开奖频率统计';
      try {
        var sc = String((HM[g.id] || {}).source || '');
        if (sc === 'ocr-xysp') srcText = '晒票票面统计';
        else if (sc === 'xysp-text') srcText = '晒票文字统计';
      } catch (e2) { /* 忽略 */ }
      var span = '近 30 期 · ' + esc(srcText);
      h += card('热号（出现最多）<span>' + span + '</span>', bars(hot, tot, false));
      h += card('冷号（出现最少）<span>' + span + '</span>', bars(cold, tot, true));
    } else {
      var f = freqOf(g.id, SPAN);
      if (!f.total) return chipsGame() + none('需要更多数据', '这个彩种本页没有开奖数据。');
      var span2 = '近 30 期 · 开奖频率统计';
      h += card('热号（出现最多）<span>' + span2 + '</span>', bars(f.arr.slice(0, 6), f.total, false));
      h += card('冷号（出现最少）<span>' + span2 + '</span>', bars(f.arr.slice(-6).reverse(), f.total, true));
    }
    h += note('热号 = 这段时间出现次数最多的号码，冷号 = 最少的。次数只描述已经发生的开奖，不代表下一期的概率 —— 每个号码每期都是独立随机的。');
    return h;
  }
  function bars(arr, tot, cold) {
    var max = 1, i;
    for (i = 0; i < arr.length; i++) if (arr[i].c > max) max = arr[i].c;
    var h = '';
    for (i = 0; i < arr.length; i++) {
      var it = arr[i];
      var cnt = it.c != null ? it.c : (it.count || 0);
      var w = Math.max(4, Math.round(cnt * 100 / max));
      h += '<div class="tv-bar' + (cold ? ' cold' : '') + '"><b>' + it.n + '</b>' +
        '<span><i style="width:' + w + '%"></i></span>' +
        '<em>' + cnt + ' 次 ' + pctS(cnt, tot) + '</em></div>';
    }
    return h;
  }

  /* ================= ⑤ 智能规律 ================= */
  function pagePattern() {
    var g = gameById(st.game), key = curArea(g);
    var p = patternOf(g.id, SPAN);
    if (!p.used) return chipsGame() + none('需要更多数据', '这个彩种本页没有开奖数据。');
    var h = chipsGame() + chipsArea(g);
    h += card('近 ' + p.used + ' 期 · ' + esc(g.name) + ' ' + esc(areaLabel(g, key)),
      row('连号出现率', p.withConsec + ' / ' + p.used + ' 期 · ' + pctS(p.withConsec, p.used)) +
      row('连号总对数', p.consecPairs + ' 对') +
      row('重号 平均每期', fmt1(p.repeatAvg) + ' 个（和上一期相同）') +
      row('同尾（个位相同）期数', p.sameTail + ' / ' + p.used + ' 期') +
      row('最常见奇偶比', p.bestCnt >= 0 ? ('奇 ' + p.bestOdd + ' : 偶 ' + (numsOf(drawsOf(g.id)[0], key).length - p.bestOdd) + '（' + p.bestCnt + ' 期）') : '—'));
    h += note('这几项都是「已经开过的号码里数出来的」：连号 = 相邻两个号都出（如 12 13）；重号 = 和上一期重复的号码；同尾 = 个位数字相同。它们描述过去，不能用来预测下一期。');
    return h;
  }

  /* ================= ⑥ 均线分析 ================= */
  function pageMa() {
    var g = gameById(st.game), key = curArea(g);
    var h = chipsGame() + chipsArea(g);
    h += card('K 线均线 · 暂不支持',
      none('暂不支持', '真正的均线（MA5 / MA10 / MA20）要画在 K 线上，需要开盘价 / 收盘价 / 最高价 / 最低价这套价格序列。本页只有开奖号码，没有 K 线，所以这一项不提供 —— 不编一条假曲线出来。'));
    var sums = sumSeries(g.id, SPAN);
    if (sums.length >= 10) {
      var ma5 = maSeries(sums, 5), ma10 = maSeries(sums, 10);
      var l5 = ma5[ma5.length - 1], l10 = ma10[ma10.length - 1];
      var status = l5 > l10 ? '5 期均值在 10 期均值上方（偏热）' : '5 期均值在 10 期均值下方（偏冷）';
      h += card('能算的部分：和值均线 · 近 ' + sums.length + ' 期',
        spark(sums, ma5, '每期和值', '5 期均值') +
        row('最新一期和值', String(sums[sums.length - 1])) +
        row('5 期均值（MA5）', fmt1(l5)) +
        row('10 期均值（MA10）', fmt1(l10)) +
        row('当前状态', status));
      h += note('这一块算的是「和值」的移动平均：把每期开出的号码加起来得到和值，再取最近 5 / 10 期的平均。它是统计描述，不是预测。');
    } else {
      h += card('能算的部分：和值均线', none('需要更多数据', '这个彩种本页的开奖期数不够算 10 期均线。'));
    }
    return h;
  }

  /* ================= ⑦ 指数预测 ================= */
  function pageIndex() {
    var g = gameById(st.game);
    return chipsGame() + card('指数预测 · 暂不支持',
      none('暂不支持', '指数预测要专业的指数模型和本页没有的行情数据；这里不提供，也不写一个假的涨跌数字糊弄人。'));
  }

  /* ================= ⑧ AI推荐（系统随机） ================= */
  function randOf(from, to) { return from + Math.floor(Math.random() * (to - from + 1)); }
  function pickFor(gid) {
    var g = gameById(gid), out = [];
    for (var a = 0; a < g.areas.length; a++) {
      var cfg = g.areas[a];
      var pick = cfg.pick;
      if (!pick) {
        var lastd = drawsOf(gid)[0];
        var ln = lastd ? numsOf(lastd, cfg.key).length : 1;
        pick = ln || 1;
      }
      var repeatable = (g.type === 'digit' || g.type === 'qxc');
      var nums = [];
      if (repeatable) {
        for (var i = 0; i < pick; i++) nums.push(randOf(cfg.from, cfg.to));
      } else {
        var pool = [];
        for (var v = cfg.from; v <= cfg.to; v++) pool.push(v);
        for (var k = 0; k < pick && pool.length; k++) {
          var idx = Math.floor(Math.random() * pool.length);
          nums.push(pool[idx]);
          pool.splice(idx, 1);
        }
        nums.sort(function (x, y) { return x - y; });
      }
      out.push({ key: cfg.key, label: cfg.label || '', color: (a === 1 ? 'blue' : ''), nums: nums, repeatable: repeatable });
    }
    return out;
  }
  function pageAi() {
    var g = gameById(st.game);
    var h = chipsGame();
    if (!st.ai || st.ai.game !== g.id) { st.ai = { game: g.id, picks: pickFor(g.id) }; }
    var picks = st.ai.picks, i, j;
    var inner = '';
    for (i = 0; i < picks.length; i++) {
      var p = picks[i];
      inner += '<div class="tv-h" style="font-size:12px;color:var(--ro-fg2);margin:6px 0 2px">' + esc(p.label) + '</div><div class="tv-balls">';
      for (j = 0; j < p.nums.length; j++) {
        inner += '<div class="tv-ball ' + (p.repeatable ? 'digit' : p.color) + '">' + p.nums[j] + '</div>';
      }
      inner += '</div>';
    }
    h += card('系统随机生成 · 仅供娱乐参考<span>第 ' + (st.aiTimes + 1) + ' 次</span>', inner);
    h += '<div class="tv-acts">' +
      '<div class="tv-btn" role="button" tabindex="0" data-tv-act="reroll">换一组</div>' +
      '<div class="tv-btn ghost" role="button" tabindex="0" data-tv-act="goto-roll">去摇号面板自选</div>' +
      '</div>';
    h += note('这组号码就是浏览器里的随机数（Math.random）当场摇出来的，不是 AI 算的，也不是预测，只当娱乐。彩票每期独立随机，任何号码组合的中奖概率都一样。');
    return h;
  }

  /* ---------------- 页面路由 ---------------- */
  function pageOf(id) {
    if (id === 'stat') return pageStat();
    if (id === 'trend') return pageTrend();
    if (id === 'hot') return pageHot();
    if (id === 'ma') return pageMa();
    if (id === 'index') return pageIndex();
    if (id === 'omit') return pageOmit();
    if (id === 'pattern') return pagePattern();
    if (id === 'ai') return pageAi();
    return none('出错了', '这个入口还没有内容。');
  }
  function render() {
    body.innerHTML = pageOf(st.id);
    try { body.scrollTop = 0; } catch (e3) { /* 忽略 */ }
  }

  function openTool(id) {
    st.id = id;
    if (id === 'ai') {
      st.ai = { game: st.game, picks: pickFor(st.game) };
      st.aiTimes = 0;
    }
    titleEl.textContent = TITLES[id] || '详情';
    render();
    view.classList.add('on');
    view.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
  }
  function closeTool() {
    view.classList.remove('on');
    view.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
  }

  /* 「打开完整走势表」= 关掉这一层，展开走势图折叠块并滚过去（不重复画一遍） */
  function gotoTrend() {
    closeTool();
    /* id 是 #ro-trend（走势图那个折叠块）；老版本没有 id 时退回按类名找 */
    var d = document.getElementById('ro-trend') || document.querySelector('.ro-trend');
    if (!d) return;
    try { d.open = true; } catch (e4) { /* 忽略 */ }
    setTimeout(function () {
      try { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (e5) { try { d.scrollIntoView(true); } catch (e6) { /* 忽略 */ } }
    }, 80);
  }
  function gotoRoll() {
    closeTool();
    var d = document.getElementById('ro-aipick');
    if (!d) return;
    try { d.open = true; } catch (e7) { /* 忽略 */ }
    setTimeout(function () {
      try { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (e8) { try { d.scrollIntoView(true); } catch (e9) { /* 忽略 */ } }
    }, 80);
  }

  /* ---------------- 事件（全用委托，没有内联 onclick） ---------------- */
  function onTap(ev) {
    var t = ev.target;
    while (t && t !== body) {
      if (t.getAttribute) {
        var gid = t.getAttribute('data-tv-game');
        if (gid) { st.game = gid; st.area = ''; st.ai = null; render(); return; }
        var aid = t.getAttribute('data-tv-area');
        if (aid) { st.area = aid; st.ai = null; render(); return; }
        var act = t.getAttribute('data-tv-act');
        if (act === 'reroll') {
          st.ai = { game: st.game, picks: pickFor(st.game) };
          st.aiTimes++;
          render();
          return;
        }
        if (act === 'goto-trend') { gotoTrend(); return; }
        if (act === 'goto-roll') { gotoRoll(); return; }
      }
      t = t.parentNode;
    }
  }
  function onKey(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-tv-game') || t.getAttribute('data-tv-area') || t.getAttribute('data-tv-act')) {
      ev.preventDefault();
      onTap({ target: t });
    }
  }
  body.addEventListener('click', onTap);
  body.addEventListener('keydown', onKey);

  var items = document.querySelectorAll('.tool-item');
  for (var k = 0; k < items.length; k++) {
    (function (el) {
      function go() { openTool(el.getAttribute('data-tool')); }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); go(); }
      });
    })(items[k]);
  }
  var back = document.getElementById('toolBack');
  if (back) {
    back.addEventListener('click', closeTool);
    back.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); closeTool(); }
    });
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && view.classList.contains('on')) closeTool();
  });
})();
</script>
<!-- __GUIDE__ 安装指南（内联 SVG，不依赖图片文件，避免 404） -->
<div class="install-guide">
  <svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="添加到手机桌面示意">
    <rect width="640" height="300" rx="18" fill="#fff6e6" stroke="#e8d7bd"/>
    <text x="320" y="44" text-anchor="middle" font-family="sans-serif" font-size="21" font-weight="700" fill="#4a3a26">添加到手机桌面，更方便更稳定</text>
    <rect x="28" y="70" width="280" height="200" rx="14" fill="#ffffff" stroke="#e8d7bd"/>
    <text x="168" y="102" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#1a8c5a">安卓 / 微信</text>
    <text x="168" y="136" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#4a3a26">1. 点右上角「···」</text>
    <text x="168" y="166" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#4a3a26">2. 选「添加到主屏幕」</text>
    <text x="168" y="196" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#4a3a26">3. 点「添加」</text>
    <text x="168" y="240" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#8a7a63">（浏览器菜单里也叫「添加到桌面」）</text>
    <rect x="332" y="70" width="280" height="200" rx="14" fill="#ffffff" stroke="#e8d7bd"/>
    <text x="472" y="102" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#1a8c5a">苹果 iPhone</text>
    <text x="472" y="136" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#4a3a26">1. 点底部「分享」图标</text>
    <text x="472" y="166" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#4a3a26">2. 选「添加到主屏幕」</text>
    <text x="472" y="196" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#4a3a26">3. 点「添加」</text>
    <text x="472" y="240" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#8a7a63">（Safari 才支持，微信里先「在浏览器打开」）</text>
  </svg>
  <div class="install-guide-note">备注：添加桌面更方便更稳定</div>
</div>
<script>
/* __ENTRY2__ 跳转脚本已撤（那组入口卡和区块本身重复，见上面样式表里的说明）。 */
</script>
</body>
</html>`;

/* ============================================================
   留痕断言（用户硬性要求）：页面上不能看出「数据是从哪来的」
     ① removeSourceWords —— 把可见文本里的来源字样换成中性说法
        （只读依赖模块吐出来的字也在这一步收拾，语义不变）
     ② assertNoSourceTrace —— 再扫一遍；命中 → 打印命中内容 → exit 1
   两条都来自共用模块 source-guard.mjs。
   ============================================================ */
const safeHtml = removeSourceWords(html);
assertNoSourceTrace(safeHtml, '只读分享版.html');
fs.writeFileSync(OUT, perfify(safeHtml), 'utf8');

console.log(`✅ 已生成：${OUT}`);
console.log(`   大小：${(Buffer.byteLength(safeHtml, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`   内容：${gameCount} 个彩种，${imgCount} 张图（${imgCount} 个实时渲染图位）`);
console.log(`   内联脚本：${inlineSizes.length} 个 / ${(inlineSizes.reduce((a, b) => a + b[1], 0) / 1024).toFixed(1)} KB`);
console.log(`   生成时间：${todayStr}`);
console.log('\n这个文件可以直接发微信/QQ，对方点开就能看（只能看，不能改）。');
console.log('页面里的推荐图由浏览器实时渲染，和本地 App 走同一条渲染路径。');
