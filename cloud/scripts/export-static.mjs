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
               'heatmap-data.js'];

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
   ============================================================ */

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

  // 各彩种是否都有下一期的推荐数据
  const missing = [];
  Object.keys(T).forEach((id) => {
    const wantDate = nextDate(id);
    const rec = tickets[id] && tickets[id][wantDate];
    const hasImgs = rec && rec.images && Object.keys(rec.images).length > 0;
    if (!hasImgs) missing.push(G[id] ? G[id].name : id);
  });

  const allReady = missing.length === 0 && !stale;

  return { savedTime, stale, hoursOld, missing, allReady, nowStamp };
}

const status = checkUpdateStatus();

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
         里面的内容是预渲染兜底 —— JS 没跑或渲染失败时，页面依然有图。 */
      imgsHtml +=
        `<div class="ro-imagewrap" data-game="${id}" data-image="${img.key}">` +
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
    `<div class="ro-st-head"><span class="ro-st-dot"></span>${nextDayText ? nextDayText + '已更新' : '下一期推荐已更新'}</div>` +
    `<div class="ro-st-time">所有资料均在下方</div>` +
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
    `<div class="ro-st-time">当前显示的是上一次的内容（${status.savedTime || '无记录'}）</div>` +
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
   → 【放大镜图标已删除】。只留下 cursor: zoom-in 这个纯光标提示
     （不是图形/图标，页面上看不到任何放大镜）。
   ============================================================ */
.ro-imagewrap { cursor: zoom-in; }

/* ============================================================
   【点击放大】全屏遮罩层（一次只看一张）
   ------------------------------------------------------------
   · 打开时把【这一张】图的 DOM 克隆进遮罩，容器沿用 .ro-imagewrap，
     所以「锁死 760px 内部布局」那几条规则照样管用 —— 不变形。
   · 缩放只是对这张图整体做 transform: scale()，
     宽高【始终同一个比例】，不会拉伸。
   · 图层比原图高：手机上手指能看清。
   · 支持双指缩放（pointer 事件）。
   · 【开关式】遮罩里点任何地方都关闭（用户：「在点击就变小」）；
     按下到抬起的位移超过 10px 才算拖动，不会误关。
   ============================================================ */
#ro-lightbox {
  position: fixed;
  left: 0; top: 0; right: 0; bottom: 0;
  z-index: 2147483000;
  background: rgba(6,8,12,0.95);
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y;   /* 单指仍可滚动；双指缩放自己接管 */
  cursor: zoom-out;
}
.ro-lb-inner {
  min-height: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 14px 8px 26px;
  box-sizing: border-box;
  cursor: default;
}
#ro-lightbox[data-zoom="fit"] .ro-lb-inner { align-items: center; }
/* 克隆进来的容器：对齐方式交给上面的 flex，自身不能有外边距；
   宽度 / 高度 / 图片 transform 全部由脚本按同一个比例算出来 */
.ro-lb-scope {
  margin: 0 !important;
  overflow: visible !important;
  box-shadow: none !important;
  border-radius: 6px !important;
  flex: 0 0 auto;
}
.ro-lb-scope .r-image { box-shadow: 0 8px 40px rgba(0,0,0,0.6); }
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
  font-size: 11.5px;
  color: #454d5c;
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
  color: #7c8598;
  font-size: 11.5px;
  line-height: 1.95;
  text-align: left;
}
.ro-disclaimer h3 {
  font-size: 12.5px;
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
</style>
</head>
<body data-built="${nowStamp}">
<div class="ro-wrap">

  <div class="ro-top">
    <h1>春风十里送大奖 · 推荐图</h1>
  </div>

  ${statusHtml}

  ${latestSecHtml}

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
      /* 【点击放大】遮罩层里那个容器有它自己的缩放算法，
         不能被这里的「按容器宽度等比缩小」覆盖掉 */
      if (w.getAttribute && w.getAttribute('data-ro-lb') === 'wrap') continue;
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
    { left: 'qxc/main',   right: 'qlc/main'    },   /* ④ 七星彩 | 七乐彩 */
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
   【点击放大】单张推荐图放大查看
   ------------------------------------------------------------
   用户原话：「双色球推的图一边一个 可以单独点开图片变大」

   只解决一件事：点哪一张，就只放大哪一张。

   【怎么放大】不重新画图，直接把这张图的 DOM 克隆一份放进遮罩层：
     · 克隆的容器沿用 .ro-imagewrap 类名 →
       「锁死 760px 内部布局」那几条 CSS 对它一样生效（不变形）
     · 放大只是给这一个克隆整体做 transform: scale(同一个倍数) →
       宽高始终同比例，绝不会拉伸
     · 内部布局一个像素都不动，和 App 里看到的一致
     · 图片在遮罩层里按真实尺寸裁剪，不设 max-width，
       所以放大后是「清晰可滚」而不是被压回去

   【一次只放大一张】打开时先清空旧内容、再把旧的遮罩整个删掉，
   所以连点两张也只可能剩下一张。

   【关闭】点图片外的空白处 / 点右上角关闭按钮 / 按 Esc —— 三种都行；
   点图片本身不关（方便放大后看细节）。

   【手机】默认比例 = 容器宽 / 760（>=1，手机上就是放大到能看清），
   双指可继续缩放，图片比一屏高时可以上下滚动。

   【不停留在旧 DOM 上】用的是事件委托 + 每次点击现场查找，
   所以「热力图被搬到页面顶部 #ro-latest」那种整块替换之后照样能点开；
   重渲染后图标回调一次 refreshIcons() 补齐。
   ============================================================ */
(function () {
  var BASE = 760;   /* 图片设计宽度，和 .r-image 一致（不许改） */

  var overlay = null;   /* 当前遮罩（null = 没打开） */
  var wrap = null;      /* 遮罩里那个容器 */
  var imgEl = null;     /* 放大中的那张图 */
  var baseScale = 1;    /* 打开时算出的默认比例 */
  var ratio = 1;        /* 图片原始宽高比（只用来核对，不用来计算尺寸） */
  var zoom = 1;         /* 当前倍数（相对 baseScale） */
  var fingers = {};     /* 双指缩放用：pointerId → {x,y} */
  var pinchStart = 0;
  var pinchFrom = 1;

  /* 【开关式点击】用户原话：
       「图片点击可以放大 就是放大一张完成的图弹出来 在点击就变小 不需要有个放大镜图标」
     所以遮罩里【点任何地方都关闭】。但不能「拖滚动条看图」也被误判成点击 ——
     只有 pointerdown 到 pointerup 位移 < TAP_SLOP(=10px) 才算「点了一下」。 */
  var TAP_SLOP = 10;
  var tapDown = null;    /* 按下时的 {x,y,id} */
  var tapMoved = false;  /* 按下后是否移动过（移动过 = 在拖/滑，不关） */
  var tapMulti = false;  /* 是否出现过第二根手指（双指缩放，不关） */

  function log(m) {
    /* 自测/排查用：window.__roLBLog 里有全部动作记录，
       线上用户不看控制台，不打日志 */
    try { (window.__roLBLog = window.__roLBLog || []).push(m); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 放大镜提示图标【已按要求移除】 ----------
     用户原话：「不需要有个放大镜图标」。
     这里保留同名空函数只是为了外面（以及验收脚本）还能调它，
     它【不会】往页面上加任何元素。 */
  function refreshIcons() { return 0; }

  /* ---------- 从事件目标往上找「推荐图容器」 ---------- */
  function wrapOf(node) {
    var n = node;
    while (n && n !== document) {
      if (n.classList && n.classList.contains && n.classList.contains('ro-imagewrap')) return n;
      if (n.getAttribute && n.getAttribute('data-ro-lb') === 'wrap') return null;   /* 遮罩里的不算 */
      n = n.parentNode;
    }
    return null;
  }

  /* ---------- 默认倍数：点开后一定比列表里那张大 ----------
     列表里那张图在手机上被整体等比缩小到容器宽度（约 vw-24 px），
     点开时把它放大到【屏幕宽度减去左右各 8px】：
       倍数 = 760 / (窗口宽 - 16)
       · 手机（390）→ 约 2.03 倍，由「一张屏宽不到的小图」变成「一眼看清」
       · 平板 / 电脑 → 结果 <= 1，统一按 1 倍（760px 设计宽度本身就是最佳显示）
     宽和高【用同一个倍数】，比例永远不变。 */
  function calcBase() {
    var vw = 0;
    try { vw = window.innerWidth || 0; } catch (e1) { vw = 0; }
    if (!vw) { try { vw = document.documentElement.clientWidth || 0; } catch (e2) { vw = 0; } }
    var avail = vw ? (vw - 16) : BASE;
    if (!(avail > 0)) avail = BASE;
    baseScale = BASE / avail;
    /* 兜底：量不到宽度 / 宽屏 → 1 倍（原始 760px 设计宽度），绝不缩小、绝不出现 0 或 NaN */
    if (!(baseScale >= 1)) baseScale = 1;
    return { vw: vw, avail: avail };
  }

  /* ---------- 设置倍数：宽度、高度、transform 用【同一个倍数】算 ---------- */
  function applyScale() {
    if (!wrap || !imgEl) return;
    var s = baseScale * zoom;
    var w = BASE * s;
    var h = imgEl.offsetHeight * s;           /* 高度 = 原始高度 × 同一个倍数 → 比例不变 */
    imgEl.style.transformOrigin = 'top left';
    imgEl.style.transform = 'scale(' + s + ')';
    wrap.style.width = Math.round(w) + 'px';
    wrap.style.height = Math.round(h) + 'px';
    try {
      if (overlay) overlay.setAttribute('data-zoom', Math.abs(s - 1) < 0.002 ? 'fit' : String(Math.round(s * 1000) / 1000));
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 打开：把【这一张】克隆进遮罩 ---------- */
  function open(srcWrap) {
    if (!srcWrap) return false;
    var src = srcWrap.querySelector ? srcWrap.querySelector('.r-image') : null;
    if (!src) return false;

    close(true);   /* 【一次只放大一张】先彻底清掉上一张 */

    var dim = calcBase();
    zoom = 1;

    overlay = document.createElement('div');
    overlay.id = 'ro-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '推荐图放大查看');
    overlay.setAttribute('data-ro-lb', 'overlay');

    var inner = document.createElement('div');
    inner.className = 'ro-lb-inner';

    /* 克隆：类名沿用 ro-imagewrap（内部布局锁依然生效），
       额外加 ro-lb-scope 让「遮罩专属样式」接手 */
    wrap = srcWrap.cloneNode(true);
    wrap.className = String(srcWrap.className || '') + ' ro-lb-scope';
    wrap.setAttribute('data-ro-lb', 'wrap');
    /* 清掉原页面上留下的测量/缩放内联样式，遮罩里由脚本重新算 */
    wrap.style.height = 'auto';
    wrap.style.overflow = 'visible';

    var oldHint = wrap.querySelector ? wrap.querySelector('[data-ro-lb="hint"]') : null;
    if (oldHint && oldHint.parentNode) oldHint.parentNode.removeChild(oldHint);

    imgEl = wrap.querySelector('.r-image');
    if (!imgEl) { overlay = null; wrap = null; return false; }
    imgEl.style.transform = 'none';
    imgEl.style.width = BASE + 'px';
    imgEl.style.minWidth = BASE + 'px';
    imgEl.style.maxWidth = BASE + 'px';

    var rw = imgEl.offsetWidth || BASE;
    var rh = imgEl.offsetHeight || BASE;
    ratio = rw ? (rh / rw) : 0;

    inner.appendChild(wrap);

    /* 【关闭按钮 × 已移除】用户要的是「再点一下就变小」——
       遮罩里点任何地方都能关，再放一个 × 反而容易和「点哪都关」重复。
       键盘用户仍然可以按 Esc 关闭（保留）。 */
    var bar = document.createElement('div');
    bar.className = 'ro-lb-bar';
    bar.setAttribute('data-ro-lb', 'bar');
    bar.textContent = '再点一下关闭 · 双指可缩放（电脑按 Esc 也可关闭）';

    overlay.appendChild(inner);
    overlay.appendChild(bar);
    document.body.appendChild(overlay);

    applyScale();

    try {
      document.body.setAttribute('data-ro-lb-open',
        (srcWrap.getAttribute('data-game') || '') + '/' + (srcWrap.getAttribute('data-image') || ''));
    } catch (e) { /* 忽略 */ }

    document.addEventListener('keydown', onKey, false);
    window.addEventListener('resize', onResize, false);
    window.addEventListener('pointerdown', onWinPointer, false);
    window.addEventListener('pointerup', onWinPointer, false);
    window.addEventListener('pointercancel', onWinPointer, false);

    log('open ' + srcWrap.getAttribute('data-game') + '/' + srcWrap.getAttribute('data-image') +
      ' baseScale=' + baseScale.toFixed(4) + ' vw=' + dim.vw + ' avail=' + dim.avail);
    return true;
  }

  /* ---------- 关闭 ---------- */
  function close(silent) {
    if (!overlay) return false;
    try {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    } catch (e) {
      if (overlay.style) overlay.style.display = 'none';
    }
    overlay = null; wrap = null; imgEl = null;
    fingers = {};
    try { document.body.removeAttribute('data-ro-lb-open'); } catch (e) { /* 忽略 */ }
    document.removeEventListener('keydown', onKey, false);
    window.removeEventListener('resize', onResize, false);
    window.removeEventListener('pointerdown', onWinPointer, false);
    window.removeEventListener('pointerup', onWinPointer, false);
    window.removeEventListener('pointercancel', onWinPointer, false);
    if (!silent) log('close');
    return true;
  }

  function onKey(e) {
    var k = e.key || '';
    if (k === 'Escape' || k === 'Esc' || e.keyCode === 27) { close(); }
  }

  function onResize() {
    if (!overlay) return;
    calcBase();
    applyScale();
    log('resize baseScale=' + baseScale.toFixed(4));
  }

  /* 【开关式】点一下 = 关闭
     用户要的：点图片本身也关、点放大后那张图也关、点空白也关 ——
     也就是遮罩里点任何地方都关。
     但「拖动滚动条看图」「双指缩放」不能误关：只认「按下到抬起几乎没动」的点击。 */
  function onTap() {
    close();
  }
  function onClick(e) {
    if (!overlay) return;
    if (e.defaultPrevented) return;
    /* 触摸/鼠标按下后如果移动过（在拖滚动条或滑动看图）→ 不当成点击 */
    if (tapMoved || tapMulti) { tapMoved = false; tapMulti = false; tapDown = null; return; }
    onTap();
  }

  /* ---------- 按下/抬起：判断这一次是不是「点了一下」（而不是拖动） ---------- */
  function onDocPointerDown(e) {
    if (!overlay) return;
    if (e.pointerId === undefined || e.pointerId === null) return;
    if (!tapDown) {
      tapDown = { x: e.clientX || 0, y: e.clientY || 0, id: e.pointerId };
      tapMoved = false;
      tapMulti = false;
    } else if (e.pointerId !== tapDown.id) {
      /* 第二根手指按下了 → 这是双指缩放，不是点击 */
      tapMulti = true;
    }
  }
  function onDocPointerMove(e) {
    if (!overlay || !tapDown) return;
    if (e.pointerId !== tapDown.id) return;
    var dx = (e.clientX || 0) - tapDown.x;
    var dy = (e.clientY || 0) - tapDown.y;
    if (Math.sqrt(dx * dx + dy * dy) > TAP_SLOP) tapMoved = true;
  }
  function onDocPointerUp(e) {
    if (e.pointerId === undefined || e.pointerId === null) return;
    if (tapDown && e.pointerId === tapDown.id) tapDown = null;
  }

  /* ---------- 双击缩放【已移除】 ----------
     用户要的是「点一下开、再点一下关」；双击会连着触发两次 click
     （开 → 立刻又关），和开关式打架，所以去掉了。
     手机上想看得更细仍然可以【双指缩放】—— 那个不冲突，保留。 */
  function onDblClick() { /* 什么都不做（占位，保持函数名便于验收脚本引用） */ }

  /* ---------- 双指缩放 ---------- */
  function dist() {
    var a = [], k;
    for (k in fingers) { if (fingers.hasOwnProperty(k)) a.push(fingers[k]); }
    if (a.length < 2) return 0;
    var dx = a[0].x - a[1].x, dy = a[0].y - a[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function fingerCount() {
    var n = 0, k;
    for (k in fingers) { if (fingers.hasOwnProperty(k)) n++; }
    return n;
  }
  function onWinPointer(e) {
    if (!overlay) { fingers = {}; pinchStart = 0; return; }
    var type = e.type;
    if (type === 'pointerdown') {
      if (e.pointerId === undefined || e.pointerId === null) return;
      fingers[e.pointerId] = { x: e.clientX || 0, y: e.clientY || 0 };
      if (fingerCount() === 2) { pinchStart = dist(); pinchFrom = zoom; }
      if (fingerCount() > 2) { /* 三指以上不处理，避免乱跳 */ pinchStart = 0; }
      return;
    }
    /* pointerup / pointercancel */
    if (e.pointerId !== undefined && e.pointerId !== null) delete fingers[e.pointerId];
    if (fingerCount() < 2) pinchStart = 0;
  }
  function onPointerMove(e) {
    if (!overlay) return;
    if (e.pointerId === undefined || e.pointerId === null) return;
    if (!fingers.hasOwnProperty(e.pointerId)) return;
    fingers[e.pointerId] = { x: e.clientX || 0, y: e.clientY || 0 };
    if (fingerCount() !== 2 || !pinchStart) return;
    var d = dist();
    if (!d) return;
    zoom = pinchFrom * (d / pinchStart);
    if (zoom < 1) zoom = 1;
    if (zoom > 8) zoom = 8;
    applyScale();
    log('pinch zoom=' + zoom.toFixed(3));
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    document.addEventListener('click', function (e) {
      /* 【开关式】遮罩开着时，这一下点击只用来「关闭」。
         ⚠️ 关掉之后必须给这次事件打个标记并直接返回 ——
            因为这条监听器是绑在 document 上的，点击会继续冒泡到这里，
            而 e.target 往往正是遮罩里那份【克隆图】（它也在 .ro-imagewrap 里），
            wrapOf 找得到、就会把刚关掉的遮罩又打开（实测：点图关不掉、来回闪）。
            用「事件级」标记而不是全局变量，多个 click 监听器之间也安全。 */
      if (overlay) {
        onClick(e);
        try { e.__roLbHandled = true; } catch (e2) { /* 忽略 */ }
        return;
      }
      if (e.__roLbHandled) return;

      /* 【关键】每次点击现场找容器 —— 热力图搬到顶部、区块整块被替换
         之后，图还是这张图，照样点得开 */
      var w = wrapOf(e.target);
      if (!w) return;
      if (!w.querySelector || !w.querySelector('.r-image')) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   /* 用户在做别的操作 */
      if (open(w)) { try { e.preventDefault(); } catch (e2) { /* 忽略 */ } }
    }, false);

    document.addEventListener('dblclick', onDblClick, false);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('pointermove', onDocPointerMove, true);
    document.addEventListener('pointerup', onDocPointerUp, true);
    document.addEventListener('pointercancel', onDocPointerUp, true);
    document.addEventListener('pointermove', onPointerMove, false);
    document.addEventListener('contextmenu', function (e) {
      /* 长按弹菜单很打断「点开看图」，遮罩打开时屏蔽掉 */
      if (overlay) { try { e.preventDefault(); } catch (e2) { /* 忽略 */ } }
    }, false);

    refreshIcons();
    /* 用户要求「不需要有个放大镜图标」→ refreshIcons 现在是空函数，
       这几处保留只是为了兼容旧调用（DOM 重建时调它不会加任何东西）。 */
    setTimeout(refreshIcons, 300);
    setTimeout(refreshIcons, 1200);
    window.addEventListener('load', refreshIcons, false);
    document.addEventListener('DOMContentLoaded', refreshIcons, false);
  }

  /* 给外面自测 / 排查用 */
  window.__roLB = {
    open: open,
    close: close,
    refreshIcons: refreshIcons,
    isOpen: function () { return !!overlay; },
    info: function () {
      if (!overlay || !imgEl) return null;
      return {
        game: wrap ? wrap.getAttribute('data-game') : '',
        image: wrap ? wrap.getAttribute('data-image') : '',
        w: imgEl.offsetWidth,
        h: imgEl.offsetHeight,
        scale: baseScale * zoom,
        zoom: zoom,
        ratio: ratio,
        overlays: document.querySelectorAll('#ro-lightbox').length,
        wraps: document.querySelectorAll('#ro-lightbox .ro-imagewrap').length,
        imgs: document.querySelectorAll('#ro-lightbox .r-image').length
      };
    }
  };

  bind();
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
