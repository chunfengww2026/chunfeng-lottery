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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
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
  Image: function () {}, ClipboardItem: function () {}, alert: () => {}, confirm: () => true
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
  [{ t: '双色球推荐号',     g: 'ssq',  i: 'main' }, { t: '双色球 五行/绕胆/九转/九宫', g: 'ssq',  i: 'wuxing' }],
  [{ t: '大乐透推荐号',     g: 'dlt',  i: 'main' }, { t: '大乐透 五行/绕胆/九转/九宫',     g: 'dlt',  i: 'wuxing' }],
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
  `<div class="ro-imgtoc-wrap">` +
  `<div class="ro-imgtoc-head">` +
  `<div class="ro-imgtoc-title">推荐图目录</div>` +
  `<div class="ro-imgtoc-sub">点一下，全屏看那张图</div>` +
  `</div>` +
  `<table class="ro-imgtoc"><tbody>` +
  TOC_ROWS.map((row) => `<tr>` + row.map((cell) =>
    `<td><a class="ro-toc-cell" href="#ro-g-${cell.g}-${cell.i}" ` +
    `data-ro-toc-game="${cell.g}" data-ro-toc-image="${cell.i}">${cell.t}</a></td>`
  ).join('') + `</tr>`).join('') +
  `</tbody></table>` +
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
              `<p class="ro-art-note">正文已抓取到本页，仅供阅读参考。</p>` +
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

const articlesHtml = buildArticlesHtml();
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
     · 上面一排彩种筛选（全部 + 8 个彩种）：点了只显示该彩种的图，
       纯前端切换、不刷新页面、不重新请求
     · 点图片 → 放大看（能看清号码）：复用页尾已有的 ro-mob-view 全屏层
       （就是「推荐图目录」点开时用的那一层，自带 4 种关闭方式）
       —— 【不是】被用户删掉的那个旧放大器，也没有放大镜图标

   位置：紧跟在【推荐图目录】(.ro-imgtoc-wrap) 之后 —— 就是截图箭头处（不变）。
   数据：xysp-data.js（build-xysp.mjs 每 30 分钟抓一次，只保留 24 小时内的条目）。
         文件缺失时这一块显示「暂无」，绝不影响别的区块。
   折叠：仍然是原生 <details>/<summary>，【默认收起】，标题「晒票栏」（不变）。
         · <summary> 不是按钮标签 → 页面不变量「按钮标签数 = 0」不受影响
         · 右侧「展开 ▸ / 收起 ▾」用纯 CSS ::before/::after 跟着 [open] 变
   布局：手机 2 列、宽屏（>=620px）4 列。
   ⚠️ 这一块里【只用 <a>/<details>/<summary>/<img>】，不出任何按钮标签。
   ⚠️ 图片一律 loading="lazy" + referrerpolicy="no-referrer"
      （外链图床，不把来源 referrer 带过去、也不拖慢首屏）。
   ⚠️ 图片地址一律用 https：页面本身可能是 https 打开的，
      外链写成 http 会被浏览器按「混合内容」直接拦掉（图就白了）。
   ⚠️ 这里【不用】图位属性（data-image / data-ro-mob）——
      晒票栏的图不占推荐图的图位数量。
   ⚠️ 页面可见文字里不出现来源字样。
   ============================================================ */

/* 8 个彩种：key 必须和 xysp-data.js 里的 key 一致（顺序 = 筛选按钮顺序） */
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

function buildXyspHtml() {
  const data = (XYSP && XYSP.games) ? XYSP.games : null;
  const updated = (XYSP && XYSP.updated) ? String(XYSP.updated) : '';

  /* 按彩种顺序把条目摊平；每张卡片都带自己的彩种 key，供前端筛选用 */
  const cards = [];
  XYSP_GAMES.forEach((g) => {
    const items = (data && data[g.key] && Array.isArray(data[g.key].items)) ? data[g.key].items : [];
    items.forEach((it) => {
      const img = String((it && it.img) || '');
      if (!/^https:\/\//i.test(img)) return;      /* 只认 https（见上面那条说明） */
      const thumb = String((it && it.thumb) || '') || img;
      const title = String((it && it.title) || '');
      cards.push(
        /* href 就是原图地址：点图的脚本从 href 取原图去全屏放大。
           这里【不重复写一遍】原图地址（每条再写一次要多 130 字节，
           彩种多了页面会被白白撑大）。 */
        `<a class="ro-xysp-pic" href="${escapeAttr(img)}"` +
        ` data-ro-xysp-game="${escapeAttr(g.key)}">` +
        `<img class="ro-xysp-thumb" src="${escapeAttr(thumb)}" alt=""` +
        ` loading="lazy" decoding="async" referrerpolicy="no-referrer">` +
        `<span class="ro-xysp-cap"><b>${escape(g.name)}</b>` +
        (title ? `<i>${escape(title)}</i>` : '') +
        `</span></a>`
      );
    });
  });

  /* 筛选条：全部 + 8 个彩种。全部都是 <a>（不是按钮标签）。 */
  const tabs = ['<a class="ro-xysp-tab on" href="#ro-xysp" data-ro-xysp-game="all">全部</a>']
    .concat(XYSP_GAMES.map((g) =>
      `<a class="ro-xysp-tab" href="#ro-xysp" data-ro-xysp-game="${escapeAttr(g.key)}">` +
      `${escape(g.name)}</a>`
    )).join('');

  const body = cards.length
    ? `<div class="ro-xysp-pics" data-ro-xysp-grid>${cards.join('')}</div>` +
      `<div class="ro-xysp-empty" hidden>该彩种 24 小时内暂无晒票</div>`
    : `<div class="ro-xysp-empty">暂无（每 30 分钟自动更新）</div>`;

  /* 标题那一行 = <summary>（可点、可键盘操作）。
     右侧提示是空 <span>，文字由 CSS 按 [open] 切换 —— 不用 JS。
     默认【收起】：<details> 不带 open 属性。 */
  return `<details class="ro-xysp" id="ro-xysp">` +
    `<summary class="ro-xysp-head">` +
    `<h2 class="ro-xysp-h2">晒票栏</h2>` +
    `<div class="ro-xysp-sub">各彩种实票图片 · 实时更新 · 点击查看</div>` +
    `<span class="ro-xysp-arrow" aria-hidden="true"></span>` +
    `</summary>` +
    (cards.length ? `<div class="ro-xysp-filter">${tabs}</div>` : '') +
    body +
    (updated
      ? `<div class="ro-xysp-note">每 30 分钟自动更新 · 只保留 24 小时 · 更新于 ${escape(updated)}</div>`
      : '') +
    `</details>`;
}

const xyspHtml = buildXyspHtml();
console.log(`  · 晒票栏：${XYSP_GAMES.map((g) => {
  const gd = XYSP && XYSP.games ? XYSP.games[g.key] : null;
  return g.name + ' ' + ((gd && gd.items) ? gd.items.length : 0) + ' 张';
}).join(' / ')}${XYSP ? '' : '  ⚠️ 没有 xysp-data.js（显示「暂无」）'}`);

/* ============================================================
   【开机号 / 选号直播】两个工具栏入口 + 两个可展开区块
   ------------------------------------------------------------
   用户原话：「新增两个工具栏。一个是开机号（…/kjh）。
             一个是选号直播（…/live）。
             开机号点进去只是实时的开机号（每天2点抓取更新就好了）」
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

/* 两个入口按钮条：并排两个格子 */
function buildToolsHtml() {
  return `<div class="ro-tools">` +
    `<a class="ro-tool ro-tool-kjh" href="#ro-kjh">` +
    `<b>开机号</b><em data-tip="1">各彩种实时开机号 · 点击查看</em></a>` +   /* __TOOL_TIP__ 用户要求加「可收起」 */
    `<a class="ro-tool ro-tool-live" href="#ro-live">` +
    `<b>选号直播</b><em data-tip="1">直播与回放 · 点击查看</em></a>` +
    `</div>`;
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
    `<div class="ro-panel-sub">每天 2:00 自动更新` +
    (updated ? ` · 更新于 ${escape(updated)}` : '') + `</div>` +
    `</div>` +
    (rows ? `<div class="ro-kjh-grid">${rows}</div>` : `<div class="ro-panel-none">暂无</div>`) +
    `</section>`;
}

/* 选号直播区块：抓得到的是【回放列表】+【当前开播状态】，
   真正的直播画面在站点自己的播放器里，所以额外给一个「打开直播页」外链。 */
function buildLiveHtml() {
  const L = (KJH && KJH.live) ? KJH.live : null;
  const items = (L && Array.isArray(L.items)) ? L.items : [];
  const updated = (KJH && KJH.updated) ? String(KJH.updated) : '';
  const status = L ? String(L.statusText || (L.onAir ? '正在直播' : '当前暂无直播')) : '当前暂无直播';
  const home = (L && L.home) ? String(L.home) : 'https://m.yiqicai.com/live';

  const list = items.map((it) => {
    const meta = [];
    if (it.name) meta.push(`<span class="ro-live-name">${escape(it.name)}</span>`);
    if (it.game) meta.push(`<span class="ro-live-game">${escape(it.game)}</span>`);
    if (it.see) meta.push(`<span class="ro-live-see">${escape(it.see)}</span>`);
    return `<li><a class="ro-live-link" href="${articleHref(it.url)}" ` +
      `target="_blank" rel="noopener">` +
      `<span class="ro-live-txt">${escape(it.text || it.name || '直播回放')}</span>` +
      (meta.length ? `<span class="ro-live-meta">${meta.join('')}</span>` : '') +
      `</a></li>`;
  }).join('');

  return `<section class="ro-panel ro-live-panel" id="ro-live">` +
    `<div class="ro-panel-head">` +
    `<h2 class="ro-panel-title">选号直播</h2>` +
    `<div class="ro-panel-sub">${escape(status)} · 每天 2:00 自动更新` +
    (updated ? ` · 更新于 ${escape(updated)}` : '') + `</div>` +
    `</div>` +
    `<a class="ro-live-more" href="${articleHref(home)}" data-copy="${articleHref(home)}" data-ro-copylive="1" rel="noopener">` +   /* __COPY_LIVE__ 用户要求：改成点击复制链接 */
    `点击复制链接进浏览器查看</a>` +
    (list ? `<ul class="ro-live-list">${list}</ul>` : `<div class="ro-panel-none">暂无</div>`) +
    `</section>`;
}

const toolsHtml = buildToolsHtml();
const kjhHtml = buildKjhHtml();
const liveHtml = buildLiveHtml();
console.log(`  · 开机号：${(KJH && KJH.games) ? Object.keys(KJH.games).length : 0} 个彩种` +
  (((KJH && KJH.games) && Object.keys(KJH.games).length) ? '' : '（数据缺失 → 页面显示「暂无」）'));
console.log(`  · 选号直播：回放 ${(KJH && KJH.live && Array.isArray(KJH.live.items)) ? KJH.live.items.length : 0} 条` +
  `（开播状态：${(KJH && KJH.live && KJH.live.statusText) ? KJH.live.statusText : '当前暂无直播'}）`);

/* ============================================================
   【已移除】竞彩（体彩在售比赛）段落
   ------------------------------------------------------------
   分享页（彩票推荐页）不再显示足球 / 竞彩内容 ——
   足球只放在独立的「竞彩场次」页：
     分享包/football.html  ← 由 export-football.mjs 生成
   顶部导航的「竞彩场次」tab 直接跳到 football.html。

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

if (status.allReady) {
  const rows = Object.keys(T).map((id) => {
    const nm = G[id] ? G[id].name : id;
    const d = dateCN(id);
    return `<span class="ro-st-item"><b>${nm}</b> 第 ${nextIssue(id)} 期${d ? `<i class="ro-st-date">${d}</i>` : ''}</span>`;
  }).join('');

  statusHtml =
    `<div class="ro-status ok">` +
    `<div class="ro-st-head"><span class="ro-st-dot"></span>已更新</div>` +   /* 用户要求：更新后只写「已更新」，不写时间 */
    `<div class="ro-st-time">所有资料均在下方</div>` +
    `<div class="ro-st-time"><span id="__NEXT_CD2__">下一期更新倒计时 --:--:--</span></div>` +
    `<div class="ro-st-list">${rows}</div>` +
    `</div>`;
} else {
  const reason = status.missing.length
    ? `还缺这些彩种：${status.missing.join('、')}`
    : `数据已 ${status.hoursOld !== null ? Math.round(status.hoursOld) + ' 小时' : '很久'}未更新`;

  statusHtml =
    `<div class="ro-status warn">` +
    `<div class="ro-st-head"><span class="ro-st-dot"></span>下一期推荐暂未更新</div>` +
    `<div class="ro-st-time">所有资料均在下方</div>` +
    `<div class="ro-st-time"><span id="__NEXT_CD__">2:15 更新</span></div>` +   /* 用户要求：未更新时只写「2:15 更新」，不写具体时间 */
    `<div class="ro-st-reason">${reason}</div>` +
    `<div class="ro-st-hint">请稍后再看，或联系发布者更新</div>` +
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
  inlineScriptsHtml += `\n<script data-src="${f}">\n${code}\n</script>\n`;
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

  /* 拉一次服务器上的号码文件 */
  function pullTickets() {
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
<title>春风十里送大奖 · 推荐图</title>
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
   足球内容移到独立的「竞彩场次」页，分享页不再需要这套样式。 */

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
  /* __BIG_DISCLAIMER__ 用户要求：字体大一点 */
  font-size: 14.5px;
  line-height: 1.9;
  color: #98a1b2;
  background: #12151b;
  border: 1px solid #1e2430;
  border-radius: 10px;
  color: #7c8598;
  font-size: 11.5px;
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

/* 缩略图：宽度铺满卡片、高度按原比例（票是长条，不裁切才看得到全貌） */
.ro-xysp-thumb {
  display: block;
  width: 100%;
  height: auto;
  min-height: 60px;
  background: #0f1218;
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
   【开机号 / 选号直播】工具栏入口 + 两个可展开区块
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
.ro-tool-live b { color: #8fb8ff; }

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

/* ---- 选号直播 ---- */
.ro-live-more {
  display: inline-block;
  padding: 5px 12px;
  margin-bottom: 10px;
  border: 1px solid #2f3a4c;
  border-radius: 999px;
  font-size: 12px;
  color: #8fb8ff;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.ro-live-more:hover, .ro-live-more:active { border-color: #3a465c; color: #bcd4ff; }
.ro-live-list { list-style: none; margin: 0; padding: 0; }
.ro-live-list li { border-top: 1px solid #1e2430; }
.ro-live-list li:first-child { border-top: none; }
.ro-live-link {
  display: block;
  padding: 8px 0;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.ro-live-txt {
  display: block;
  font-size: 12.5px;
  line-height: 1.45;
  color: #c8cfda;
  word-break: break-word;
}
.ro-live-link:hover .ro-live-txt, .ro-live-link:active .ro-live-txt { color: #bcd4ff; }
.ro-live-meta { display: block; margin-top: 3px; }
.ro-live-name { font-size: 10.5px; color: #6b7488; margin-right: 8px; }
.ro-live-game { font-size: 10.5px; color: #7f8ba0; margin-right: 8px; }
.ro-live-see { font-size: 10.5px; color: #5f6878; }

/* 只有认识 :target 的浏览器才隐藏；不认识的（老内核）保持常显，功能不丢 */
@supports selector(:target) {
  .ro-panel { display: none; }
}
/* 【展开规则】由 JS 加 .ro-open 类控制（不依赖 :target）。
   ⚠️ 这条必须存在，否则区块永远打不开 —— 之前误把它写进了 JS 注释里。
   放在 @supports 外面：即使浏览器不认识 :target，点一下也能展开。 */
.ro-panel.ro-open { display: block; }
</style>
</head>
<body data-built="${nowStamp}" class="ro-toc-pending">
<div class="ro-wrap">

  <div class="ro-top">
    <h1>春风十里送大奖 · 推荐图</h1>
  </div>

  ${statusHtml}

  <!-- ============================================================
       【手机目录表格 · 方案 D】只在窄屏（<=1365px）显示：
       宽屏保持 5 组并排 .ro-imagepair（这里被 CSS 隐藏，一点不动它）。
       格子是 <a>（页面不变量要求没有按钮标签），href 指向每张图前面的锚点。
       JS 挂掉时（body 上还有 ro-toc-pending 标记）整块不显示，
       不会出现「点了没反应」的死格子。 -->
  ${tocHtml}

  <!-- ============================================================
       【开机号 / 选号直播】两个工具栏入口（用户截图红框处：推荐图目录下面）
       + 它们点开后的两个区块（平时不显示，:target 命中才展开）。
       两个入口都是 <a>，href 指向下面两个区块的 id。
       纯文字区块，没有图片 → 图位数量（data-image）不变。 -->
  ${toolsHtml}

  ${kjhHtml}

  ${liveHtml}

  <!-- 【开机号 / 选号直播】点入口后把区块滚到视口顶部。
       为什么要有这几行：区块平时是 display:none，靠 CSS :target 展开；
       而浏览器「跳到锚点」这一步，在元素刚从 display:none 变显示的那一刻
       并不总是执行（实测无头 Chrome 时灵时不灵）—— 补一次 scrollIntoView 才稳。
       显示本身仍然只靠 CSS：这段脚本挂了/被禁，两个区块照样能展开，功能不丢。 -->
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
      var OK = { '#ro-kjh': 1, '#ro-live': 1 };

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
              var tip2 = this.querySelector ? this.querySelector('em[data-tip]') : null;
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
            var tipEl = this.querySelector ? this.querySelector('em[data-tip]') : null;
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
      /* 带 #ro-kjh / #ro-live 直接打开时，也要把 class 加上（跟 :target 对齐） */
      (function () {
        var id = String(location.hash || '');
        if (!OK[id]) return;
        var el = document.getElementById(id.slice(1));
        if (el) el.classList.add('ro-open');
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

  <!-- ============================================================
       【晒票栏】用户要求：加在【推荐图目录】区块下面（截图箭头处）。
       （同处目录下方的还有「开机号 / 选号直播」那两个入口，由另一位
        负责人加的，排在前面 —— 这里不去动它们的顺序。）
       这一块现在会显示【晒票图片】（图床外链、不下载本体），
       卡片用自己的类名、不带图位属性，所以图位数量不变。 -->
  ${xyspHtml}

  ${latestSecHtml}

  <!-- ============================================================
       【文章参考】用户要求：放在【最新开奖】下面、
       「推荐图目录 / 推荐图」上面（= 原来「彩票推荐图」分隔条的位置）。
       纯文字区块：不含任何图片，所以图位数量不变。 -->
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

</div>

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
  var view = null, holder = null, img = null, tip = null, scroller = null;
  var cur = null, zoom = 'fit', scale = 1, backTo = null;

  function build() {
    if (view) return view;
    view = document.createElement('div');
    view.className = 'ro-mob-view';
    view.setAttribute('hidden', '');
    view.innerHTML =
      '<div class="ro-mob-scroll"><div class="ro-mob-holder"></div></div>' +
      '<div class="ro-mob-x" role="button" aria-label="关闭">\u00d7</div>' +
      '<div class="ro-mob-tip">点图再放大一级 \u00b7 双指可缩放 \u00b7 点空白 / \u00d7 / 返回键关闭</div>';
    document.body.appendChild(view);

    scroller = view.querySelector('.ro-mob-scroll');
    holder = view.querySelector('.ro-mob-holder');
    tip = view.querySelector('.ro-mob-tip');

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
  function openUrl(src, alt) {
    if (!src) return false;
    build();
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    backTo = null;            /* 这张图不属于任何图位，关掉时不用搬回去 */

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
    im.addEventListener('load', function () { applyScale(); });
    im.addEventListener('error', function () { applyScale(); });
    im.src = src;
    box.appendChild(im);
    holder.appendChild(box);

    img = im;
    cur = { game: '', image: '', url: src };
    zoom = 'fit';

    view.removeAttribute('hidden');
    mark('ro-mob-open', true);
    /* 返回键 / 后退能关：压一条历史记录，popstate 时关掉（跟 open() 一样） */
    try { history.pushState({ roMob: cur }, ''); } catch (e) { /* 忽略 */ }

    applyScale();
    setTimeout(applyScale, 0);
    setTimeout(applyScale, 60);
    setTimeout(applyScale, 300);
    setTimeout(applyScale, 900);
    setTimeout(applyScale, 1800);
    return true;
  }

  /* 打开：只绑在【目录表格的格子】上；图片本身没有任何点击绑定 */
  var tiles = document.querySelectorAll('.ro-toc-cell');
  for (var t = 0; t < tiles.length; t++) {
    tiles[t].addEventListener('click', function (e) {
      e.preventDefault();       /* 不跳锚点了，直接开全屏层 */
      open(this.getAttribute('data-ro-toc-game'), this.getAttribute('data-ro-toc-image'));
    });
  }

  window.__roMobView = {
    open: open,
    openUrl: openUrl,
    close: close,
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

    /* 只显示某一彩种的卡片（game = 'all' 时全显示）。
       做法是给不匹配的卡片加 hidden 属性，
       样式里有 .ro-xysp-pic[hidden] 把它真的藏起来。 */
    function pick(game) {
      var shown = 0;
      for (var i = 0; i < pics.length; i++) {
        var ok = (game === 'all') || (pics[i].getAttribute('data-ro-xysp-game') === game);
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

    /* 点某张图 → 用页尾那层全屏放大看。
       那一层没准备好时（脚本没跑到）不拦截点击：
       让 href 自己打开原图，功能不丢。 */
    for (var p = 0; p < pics.length; p++) {
      pics[p].addEventListener('click', function (e) {
        var api = window.__roMobView;
        /* 原图地址就是 href（缩略图只在 src 里，放大要看清号码，用原图） */
        var src = this.getAttribute('href');
        var cap = this.querySelector('.ro-xysp-cap b');
        if (api && typeof api.openUrl === 'function' &&
            api.openUrl(src, cap ? String(cap.textContent || '') : '')) {
          e.preventDefault();
        }
      });
    }

    /* 给验收脚本留一个干净入口（不影响页面行为） */
    window.__roXysp = { pick: pick, tabs: tabs.length, pics: pics.length };
  } catch (e) { /* 忽略：这一块的显示不依赖这段脚本 */ }
})();
</script>

<!-- __NEXT_CD__ 下一期更新倒计时（目标：每天 02:15，即 2 点全量任务一般跑完的时刻）
     纯前端 JS，不请求接口、不调 AI → 免费。 -->
<script>
(function () {
  var els = [document.getElementById('__NEXT_CD__'), document.getElementById('__NEXT_CD2__')].filter(Boolean);
  if (!els.length) return;   /* 【修正】原来写的是 if (!el)，但变量叫 els → 一直抛错，倒计时从来没画出来 */
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function target() {
    var d = new Date();
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 2, 15, 0, 0);
    if (t.getTime() <= d.getTime()) t = new Date(t.getTime() + 86400000);
    return t;
  }
  function draw() {
    var ms = target().getTime() - Date.now();
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
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');

console.log(`✅ 已生成：${OUT}`);
console.log(`   大小：${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`   内容：${gameCount} 个彩种，${imgCount} 张图（${imgCount} 个实时渲染图位）`);
console.log(`   内联脚本：${inlineSizes.length} 个 / ${(inlineSizes.reduce((a, b) => a + b[1], 0) / 1024).toFixed(1)} KB`);
console.log(`   生成时间：${todayStr}`);
console.log('\n这个文件可以直接发微信/QQ，对方点开就能看（只能看，不能改）。');
console.log('页面里的推荐图由浏览器实时渲染，和本地 App 走同一条渲染路径。');
