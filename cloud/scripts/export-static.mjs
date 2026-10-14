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
               'render.js', 'prize-data.js', 'hit-check.js',
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
`, ctx);

const T = ctx.__T, G = ctx.__G, GROUPS = ctx.__GROUPS;
const render = ctx.__render, resolve = ctx.__resolve;
const getDraw = ctx.__getDraw, nextIssue = ctx.__nextIssue;
const nextDate = ctx.__nextDate, nextWeek = ctx.__nextWeek;
const getTicket = ctx.__getTicket;
const shouldShowHeatmap = ctx.__shouldShowHeatmap;
const HEATMAP = ctx.__heatmapData;

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
      const balls = [];
      Object.keys(draw.areas).forEach((k) => {
        (draw.areas[k] || []).forEach((n) => {
          balls.push(`<span class="ro-ball">${String(n).padStart(2, '0')}</span>`);
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
         不是该彩种的开奖日 / 数据不是今天的 / 还没到 18:00
         → 整张图不渲染、不占位（用户原话「不开的时候就不出」）。
         判断口径和客户端 shouldShowHeatmap 完全一致。 */
      if (img.key === 'heatmap' && !heatmapVisible(id)) {
        console.log(`  · 热力图跳过：${G[id] ? G[id].name : id}（${heatmapWhy(id)}）`);
        return;
      }
      /* 【关键·同源】调用方式和 App 的 renderImagesInto 完全一致：
           manual   = getTicket(gameId, nextDrawDate(gameId)).images[key]
           resolved = resolveTemplateValues(gameId, key, manual)
           data     = { issue, date, images: { [key]: resolved.values } }
         以前这里第三个参数传的是 null，等于把「手动录入」整层丢掉 ——
         App 用手动录入的号、网页用自动算的号，10 张图全都不一样。
         现在两边输入一模一样，输出才可能一模一样。 */
      const manual = manualValuesFor(id, date, img.key);
      const resolved = resolve(id, img.key, manual);
      const data = { issue, date, images: {} };
      data.images[img.key] = resolved.values;

      const dom = render(id, img.key, data);
      /* 图位：data-game / data-image 告诉页尾的实时渲染脚本该填哪张图。
         里面的内容是预渲染兜底 —— JS 没跑或渲染失败时，页面依然有图。 */
      imgsHtml +=
        `<div class="ro-imagewrap" data-game="${id}" data-image="${img.key}">` +
        toHtml(dom) +
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

/* ---- 顶部：最新开奖 ---- */
if (typeof buildLatestHtml === 'function') {
  try {
    latestSecHtml = buildLatestHtml();
  } catch (e) {
    console.log('  ❌ 最新开奖生成失败：' + e.message);
  }
}

/* ---- 底部：中奖栏（带图上圈选）---- */
if (typeof buildWinHtml === 'function') {
  try {
    hitSecHtml = buildWinHtml({
      renderImage: (gameId, imageKey, values, draw) => {
        // 渲染推荐图，然后把中奖号码圈出来
        const dom = render(gameId, imageKey, { images: { [imageKey]: values } });
        if (typeof highlightImage === 'function') {
          try { highlightImage(dom, gameId, draw, null); } catch (e) { /* 忽略高亮失败 */ }
        }
        return toHtml(dom);
      }
    });
    hitSecCss = (typeof ctx.hitSectionCss === 'function') ? ctx.hitSectionCss() : '';
    winCount = (hitSecHtml.match(/class="hw-card/g) || []).length;
    console.log(`  · 中奖栏：${winCount} 注中奖${winCount ? '' : '（未中奖则不显示）'}`);
  } catch (e) {
    console.log(`  ❌ 中奖栏生成出错：${e.message}`);
    if (e.stack) console.log('     ' + e.stack.split('\n').slice(1, 3).join('\n     '));
  }
}

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
  function renderSlot(slot) {
    var gid = slot.getAttribute('data-game');
    var key = slot.getAttribute('data-image');
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
         （数据必须是今天的 + 今天是开奖日 + 已过北京时间 18:00）。
         ============================================================ */
      if (slot.getAttribute('data-image') === 'heatmap') {
        var hg = slot.getAttribute('data-game');
        var show = false;
        try {
          show = (typeof shouldShowHeatmap === 'function') && shouldShowHeatmap(hg);
        } catch (e) { show = false; }
        if (!show) {
          /* 整块拿掉，不留占位、不留空白 */
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

  /* 拉一次服务器上的号码文件 */
  function pullTickets() {
    return fetch('tickets.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return applyRemoteTickets(j); })
      .catch(function () { return false; });   /* 打不开服务器（离线/被墙）就继续用内联快照 */
  }

  var firstPull = pullTickets();
  window.__roLivePromise = firstPull;

  /* ============================================================
     【自动刷新】页面开着的时候，隔一段时间自动去服务器看有没有新数据
     ------------------------------------------------------------
     为什么需要：
       云端在固定时间更新（凌晨 2:00 全量 / 18:00 热力图 /
       21:40 抓开奖、摇下一期号）。如果你手机上的页面一直开着，
       以前只能【手动刷新】才看得到新内容。
     现在：
       每 90 秒自己拉一次 tickets.json，发现服务器数据更新了
       就地重渲染（推荐图 + 最新开奖），不用你动手。
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
    }, AUTO_MS);

    /* 页面从后台切回前台时也立刻拉一次（手机切回来马上就是新的） */
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          try { pullTickets(); } catch (e) {}
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
