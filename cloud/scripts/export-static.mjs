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
               'materials-data.js', 'data-store.js'];

for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.log(`  ⚠️ 缺少 ${f}`); continue; }
  try {
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  } catch (e) {
    console.log(`  ❌ 加载 ${f} 失败：${e.message}`);
  }
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
`, ctx);

const T = ctx.__T, G = ctx.__G, GROUPS = ctx.__GROUPS;
const render = ctx.__render, resolve = ctx.__resolve;
const getDraw = ctx.__getDraw, nextIssue = ctx.__nextIssue;
const nextDate = ctx.__nextDate, nextWeek = ctx.__nextWeek;
const getTicket = ctx.__getTicket;

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
   竞彩（体彩在售比赛）段落
   ============================================================ */
function buildJcSection() {
  /* ---------- 1. 取竞彩在售清单（拿编号与 fid） ---------- */
  const p = path.join(ROOT, 'jc-data.js');
  if (!fs.existsSync(p)) return { html: '', count: 0, reco: null };

  let J = null;
  try {
    const jctx = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + '\nglobalThis.__J = JC_DATA;', jctx);
    J = jctx.__J;
  } catch (e) { return { html: '', count: 0, reco: null }; }

  if (!J || !Array.isArray(J.games) || !J.games.length) return { html: '', count: 0, reco: null };

  /* 竞彩信息表。
     注意：500.com 与 245qq 用的是两套不同的比赛 ID，
     不能按 gid 配，只能按【队名 + 日期】配。 */
  const normName = (s) => String(s || '')
    .replace(/[\s\-·.()（）]/g, '')
    .replace(/(足球队|俱乐部|后备队|女足|U\d+|FC|SC|CF|AC|BK|IF|FK|SV|SK|CS)/gi, '')
    .toLowerCase();

  const dayOf = (t) => String(t || '').slice(0, 10);

  const jcInfo = {};
  const jcIndex = [];   // 用于配对
  J.games.forEach((g) => {
    const rec = {
      gid: String(g.gid),
      code: g.code || '',
      handicap: g.handicap || null,
      homeRank: (g.home && g.home.rank) || null,
      awayRank: (g.away && g.away.rank) || null,
      homeName: (g.home && g.home.name) || '',
      awayName: (g.away && g.away.name) || '',
      day: dayOf(g.time),
      odds: g.odds || null,
      reco: g.reco || null
    };
    jcInfo[rec.gid] = rec;
    jcIndex.push(rec);
  });

  /** 给一场 football 比赛找对应的竞彩记录 */
  function findJc(g) {
    const fh = normName(g.home && g.home.name);
    const fa = normName(g.away && g.away.name);
    const fd = dayOf(g.time);
    if (!fh || !fa) return null;

    // 1) 队名匹配 + 同一天
    let hit = jcIndex.find((x) =>
      dayOf(x.homeName ? '' : '') === '' &&
      (normName(x.homeName).includes(fh) || fh.includes(normName(x.homeName))) &&
      (normName(x.awayName).includes(fa) || fa.includes(normName(x.awayName)))
    );
    if (hit) return hit;

    // 2) 队名匹配（不限定日期，差一天也算）
    hit = jcIndex.find((x) => {
      const xh = normName(x.homeName), xa = normName(x.awayName);
      if (!xh || !xa) return false;
      const hOk = xh.includes(fh) || fh.includes(xh);
      const aOk = xa.includes(fa) || fa.includes(xa);
      if (!hOk || !aOk) return false;
      // 日期相差不超过 1 天
      const d1 = new Date(x.day + 'T00:00:00').getTime();
      const d2 = new Date(fd + 'T00:00:00').getTime();
      return Math.abs(d1 - d2) <= 86400000;
    });
    if (hit) return hit;

    // 3) 只匹配主队
    hit = jcIndex.find((x) => {
      const xh = normName(x.homeName);
      return xh && (xh.includes(fh) || fh.includes(xh));
    });
    return hit || null;
  }

  /* ---------- 2. 从 football.js 取这些比赛的实时状态与比分 ---------- */
  const merged = [];
  const fp = path.join(ROOT, 'football.js');
  if (fs.existsSync(fp)) {
    try {
      const fctx = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
      vm.runInContext(fs.readFileSync(fp, 'utf8') + '\nglobalThis.__F = FOOTBALL_DATA;', fctx);
      const F = fctx.__F;
      if (F && F.lists) {
        ['upcoming', 'live', 'finished'].forEach((kind) => {
          (F.lists[kind] || []).forEach((g) => {
            const info = jcInfo[String(g.gid)];
            if (!info) return;   // 只保留竞彩涵盖的比赛
            merged.push({
              gid: g.gid,
              kind,
              code: info.code,
              handicap: info.handicap,
              league: g.league,
              time: g.time,
              minute: g.minute,
              home: g.home,
              away: g.away,
              homeRank: info.homeRank,
              awayRank: info.awayRank,
              odds: g.odds,
              reco: g.reco,
              result: g.result
            });
          });
        });
      }
    } catch (e) { /* 忽略，回退到 jc-data */ }
  }

  /* 若 football.js 没配到，退回 jc-data.js 本身 */
  if (!merged.length) {
    J.games.forEach((g) => {
      merged.push({
        gid: g.gid,
        kind: 'upcoming',
        code: g.code,
        handicap: g.handicap,
        league: g.league ? { name: g.league } : null,
        time: g.time,
        minute: 0,
        home: g.home,
        away: g.away,
        homeRank: g.home && g.home.rank,
        awayRank: g.away && g.away.rank,
        odds: g.odds,
        reco: g.reco,
        result: null
      });
    });
  }

  /* ---------- 3. 汇总推荐分布 ---------- */
  const reco = { home: 0, draw: 0, away: 0, none: 0 };
  const stats = { upcoming: 0, live: 0, finished: 0, hit: 0, miss: 0 };

  merged.forEach((g) => {
    if (g.reco) reco[g.reco.pick]++; else reco.none++;
    stats[g.kind] = (stats[g.kind] || 0) + 1;
    if (g.result) { if (g.result.hit) stats.hit++; else stats.miss++; }
  });

  /* ---------- 4. 渲染卡片 ---------- */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const oddSpan = (label, v, on) =>
    (v === null || v === undefined || v === '') ? '' :
    `<span class="j-ov${on ? ' on' : ''}">${label}${v}</span>`;

  function renderCard(g) {
    const r = g.reco;
    const res = g.result;
    const eu = g.odds && g.odds.europe;
    const euV = eu && (eu.live || eu.open);
    const as = g.odds && g.odds.asian;
    const asV = as && (as.live || as.open);
    const ou = g.odds && g.odds.overunder;
    const ouV = ou && (ou.live || ou.open);

    const hc = g.handicap ? `<span class="j-hc">(${g.handicap})</span>` : '';
    const hs = g.home ? g.home.score : null;
    const as_ = g.away ? g.away.score : null;
    const hasScore = hs !== null && hs !== undefined && as_ !== null && as_ !== undefined;

    /* 状态标签 */
    let st = '';
    if (g.kind === 'live') {
      st = `<span class="j-st live">${g.minute ? g.minute + "'" : '进行中'}</span>`;
    } else if (g.kind === 'finished') {
      st = `<span class="j-st fin">完场</span>`;
    }

    return (
      `<div class="j-card${res ? (res.hit ? ' win' : ' lose') : ''}">` +
      `<div class="j-top">` +
      (g.code ? `<span class="j-code">${esc(g.code)}</span>` : '') +
      `<span class="j-league">${esc(g.league ? g.league.name : '')}</span>` +
      st +
      `<span class="j-time">${(g.time || '').slice(5)}</span>` +
      `</div>` +
      `<div class="j-teams">` +
      `<span class="j-team home">${g.homeRank ? `<i>[${g.homeRank}]</i>` : ''}${esc(g.home ? g.home.name : '?')}${hc}</span>` +
      `<span class="j-vs${g.kind === 'live' ? ' live' : ''}">${hasScore ? hs + ' - ' + as_ : 'VS'}</span>` +
      `<span class="j-team away">${esc(g.away ? g.away.name : '?')}${g.awayRank ? `<i>[${g.awayRank}]</i>` : ''}</span>` +
      `</div>` +
      (euV
        ? `<div class="j-odds"><span class="j-ol">欧赔</span>` +
          oddSpan('主 ', euV.home, r && r.pick === 'home') +
          oddSpan('平 ', euV.draw, r && r.pick === 'draw') +
          oddSpan('客 ', euV.away, r && r.pick === 'away') +
          `</div>`
        : '') +
      (asV
        ? `<div class="j-odds"><span class="j-ol">亚盘</span>` +
          oddSpan('', asV.line, false) +
          oddSpan('主 ', asV.home, false) +
          oddSpan('客 ', asV.away, false) +
          `</div>`
        : '') +
      (ouV
        ? `<div class="j-odds"><span class="j-ol">大小</span>` +
          oddSpan('', ouV.line, false) +
          oddSpan('大 ', ouV.over, false) +
          oddSpan('小 ', ouV.under, false) +
          `</div>`
        : '') +
      (r
        ? `<div class="j-reco">` +
          `<span class="j-pick">推荐 <b>${esc(r.label)}</b></span>` +
          (res ? `<span class="m-rb ${res.hit ? 'hit' : 'miss'}">${res.hit ? '红' : '黑'}</span>` : '') +
          `<span class="j-conf">${res ? '最终 ' + esc(res.actualLabel) + '（' + res.score + '）' : '信心 ' + r.confidence + '%'}</span>` +
          `<span class="j-probs">` +
          `<i class="${r.pick === 'home' ? 'on' : ''}">主${r.prob.home}%</i>` +
          `<i class="${r.pick === 'draw' ? 'on' : ''}">平${r.prob.draw}%</i>` +
          `<i class="${r.pick === 'away' ? 'on' : ''}">客${r.prob.away}%</i>` +
          `</span></div>`
        : '<div class="j-reco"><span class="j-noodds">暂无赔率</span></div>') +
      `</div>`
    );
  }

  /* 分组：未开赛 / 进行中 / 已完场 */
  const order = [['upcoming', '未开赛'], ['live', '进行中'], ['finished', '已完场']];
  let cards = '';
  order.forEach(([kind, label]) => {
    const arr = merged.filter((g) => g.kind === kind);
    if (!arr.length) return;
    // 完场按时间倒序（最新在前）
    if (kind === 'finished') arr.sort((a, b) => String(b.time).localeCompare(String(a.time)));
    else arr.sort((a, b) => String(a.time).localeCompare(String(b.time)));

    cards += `<div class="j-subhead">${label}<span class="j-subcount">${arr.length}</span></div>`;
    arr.forEach((g) => { cards += renderCard(g); });
  });

  const settled = stats.hit + stats.miss;

  const html =
    `<section class="ro-game">` +
    `<div class="ro-gamehead">` +
    `<h2>竞彩 · 推胜负平</h2>` +
    `<div class="ro-meta">体彩在售 ${merged.length} 场 · 更新于 ${J.updated}</div>` +
    `</div>` +
    `<div class="j-stat">` +
    `<div class="h"><b>${reco.home}</b><span>推荐主胜</span></div>` +
    `<div class="d"><b>${reco.draw}</b><span>推荐平局</span></div>` +
    `<div class="a"><b>${reco.away}</b><span>推荐客胜</span></div>` +
    `</div>` +
    (settled
      ? `<div class="j-record">` +
        `<span class="jr-t">完场战绩</span>` +
        `<span class="jr-h">红 ${stats.hit}</span>` +
        `<span class="jr-m">黑 ${stats.miss}</span>` +
        `<span class="jr-r">命中率 ${(stats.hit / settled * 100).toFixed(1)}%</span>` +
        `<span class="jr-n">（推荐胜负平比对最终比分）</span>` +
        `</div>`
      : '') +
    cards +
    `<div class="j-note">推荐由博彩公司赔率反推概率得出（市场共识换算），不构成购彩建议。</div>` +
    `</section>`;

  return { html, count: J.games.length, reco };
}

const jcSec = buildJcSection();

/* ============================================================
   组装完整 HTML
   ============================================================ */

/* ---------- 生成状态条 HTML（此时 T/G 已加载） ---------- */
if (status.allReady) {
  const rows = Object.keys(T).map((id) => {
    const nm = G[id] ? G[id].name : id;
    return `<span class="ro-st-item"><b>${nm}</b> 第 ${nextIssue(id)} 期</span>`;
  }).join('');

  statusHtml =
    `<div class="ro-status ok">` +
    `<div class="ro-st-head"><span class="ro-st-dot"></span>下一期推荐已更新</div>` +
    `<div class="ro-st-time">更新时间：${status.savedTime || status.nowStamp}</div>` +
    `<div class="ro-st-list">${rows}</div>` +
    `</div>`;
} else {
  const reason = status.missing.length
    ? `还缺这些彩种：${status.missing.join('、')}`
    : `数据已 ${status.hoursOld !== null ? Math.round(status.hoursOld) + ' 小时' : '很久'}未更新`;

  statusHtml =
    `<div class="ro-status warn">` +
    `<div class="ro-st-head"><span class="ro-st-dot"></span>下一期推荐暂未更新</div>` +
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
  'render.js',       // renderTicketImage ← App 用的同一个函数
  'experts-data.js', // 专家数据（data-store 依赖）
  'expert-pool.js',  // 专家池
  'data-store.js'    // resolveTemplateValues（三路合并）
];

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
  if (!code) { inlineMissing.push(f); continue; }
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

    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
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
      }
    } catch (e) { /* 忽略 */ }

    return ok;
  }

  window.__roRenderAll = renderAll;

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

  /* 页面上当前这份号码的时间（用来判断服务器那份是不是更新） */
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

    var remoteTime = normTime(j.publishedAt || j.updated);
    if (!remoteTime) return false;
    if (remoteTime <= appliedTime) return false;        /* 服务器的不新，不动 */

    /* 内容一模一样（只是重新构建了一遍）就不必重渲染，省一次 10 张图 */
    var same = false;
    try { same = JSON.stringify(SAVED_TICKETS.tickets || {}) === JSON.stringify(j.tickets); } catch (e) { same = false; }

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

    appliedTime = remoteTime;
    window.__roLiveRemoteTime = remoteTime;
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
        document.body.setAttribute('data-tickets-time', remoteTime);
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

  /* 补拉：本机刚摇完号时，云端可能还在部署中（约 1 分钟），
     第一次拉到的还是旧的。隔几秒再补拉几次 ——
     这样「号码刚摇完就打开网址」的人也不用手动刷新，页面自己会跟上。
     只要有一次拿到更新的数据就停，最多补拉三次。
     （间隔放在 window 上，方便自测/排查时改短。） */
  if (!window.__roLiveRetryDelays) window.__roLiveRetryDelays = [8000, 25000, 60000];

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

/* ---- 竞彩卡片 ---- */
.j-stat { display: flex; gap: 8px; margin-bottom: 18px; }
.j-stat div {
  flex: 1; text-align: center; padding: 9px 6px;
  background: #161a21; border: 1px solid #262d3a; border-radius: 10px;
}
.j-stat b { display: block; font-size: 18px; font-weight: 800; margin-bottom: 2px; }
.j-stat span { font-size: 11px; color: #6b7488; }
.j-stat .h b { color: #6ea8fe; }
.j-stat .d b { color: #f0b429; }
.j-stat .a b { color: #47e0a0; }

.j-card {
  background: #161a21; border: 1px solid #262d3a; border-radius: 12px;
  padding: 12px 14px; margin-bottom: 10px;
}
.j-top { display: flex; align-items: center; gap: 9px; font-size: 11.5px; margin-bottom: 9px; }
.j-code {
  background: #2a3346; color: #8ab0f5; padding: 2px 8px;
  border-radius: 5px; font-weight: 700; font-size: 11px;
}
.j-league { color: #8b93a1; font-weight: 600; }
.j-time { color: #6b7488; font-family: Consolas, monospace; margin-left: auto; }
.j-hc { color: #f0575c; font-size: 11px; margin-left: 3px; }

.j-teams { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.j-team { flex: 1; min-width: 0; font-size: 14px; color: #e8eaed; line-height: 1.4; word-break: break-word; }
.j-team.home { text-align: right; }
.j-team.away { text-align: left; }
.j-team i { font-style: normal; font-size: 10.5px; color: #5a6272; margin: 0 3px; }
.j-vs {
  flex-shrink: 0; min-width: 40px; text-align: center;
  font-size: 12px; color: #5a6272; font-family: Consolas, monospace;
}

.j-odds { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #8b93a1; margin-bottom: 6px; font-family: Consolas, monospace; }
.j-ol { color: #5a6272; min-width: 32px; font-family: "Microsoft YaHei", sans-serif; font-size: 11px; }
.j-ov { padding: 2px 8px; border-radius: 5px; background: #0f1115; border: 1px solid #1e2430; }
.j-ov.on { background: rgba(71,224,160,0.13); border-color: rgba(71,224,160,0.4); color: #47e0a0; font-weight: 600; }

.j-reco {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-top: 10px; padding-top: 10px; border-top: 1px dashed #262d3a; font-size: 12.5px;
}
.j-pick { color: #c8cfda; }
.j-pick b { color: #47e0a0; font-size: 15px; font-weight: 800; margin-left: 3px; }
.j-conf { color: #8b93a1; font-size: 11.5px; }
.j-noodds { color: #454d5c; font-size: 11.5px; }
.j-probs { margin-left: auto; display: flex; gap: 6px; }
.j-probs i { font-style: normal; font-size: 11px; color: #5a6272; padding: 2px 7px; border-radius: 4px; background: #0f1115; }
.j-probs i.on { color: #47e0a0; background: rgba(71,224,160,0.12); font-weight: 700; }

.j-note { font-size: 11px; color: #454d5c; margin-top: 12px; line-height: 1.8; }

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
    <div class="sub">生成时间 ${nowStamp} · 共 ${gameCount} 个彩种 / ${imgCount} 张图</div>
  </div>

  ${statusHtml}

  ${latestSecHtml}

  <div class="ro-divider"><span>彩票推荐图</span></div>

  ${sectionsHtml}

  <div class="ro-divider"><span>竞彩 · 体彩在售</span></div>

  ${jcSec.html}

  ${hitSecHtml}

  <div class="ro-foot">
    本页面为只读分享版，仅供观看，无法修改。<br>
    彩票有风险，投注需谨慎。以上内容仅为个人分析，不构成购彩建议，请理性参与。
  </div>

</div>

${inlineScriptsHtml}
<script>
/* ============================================================
   【自愈】发现自己是缓存旧版就自动强制刷新
   ------------------------------------------------------------
   手机浏览器（尤其微信内置）会把页面缓存很久，
   导致「电脑上更新了、手机上还是旧的」。
   这段代码拿云端的号码文件时间戳和页面上显示的时间戳对比，
   不一样就带一个【每次都不相同】的尾巴重新加载 ——
   这样就一定能拿到最新版，用户什么都不用做。
   ============================================================ */
(function () {
  try {
    var shown = document.body.getAttribute('data-built') || '';
    if (!shown) return;

    /* 防止无限刷新：同一分钟内只自愈一次 */
    var last = Number(sessionStorage.getItem('cdd.selfheal') || 0);
    if (last && Date.now() - last < 60000) return;

    fetch('tickets.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        var remote = String(j.publishedAt || j.updated || '').replace('T', ' ').slice(0, 16);
        var mine = shown.slice(0, 16);
        if (!remote || !mine) return;
        /* 云端发布时间比页面生成时间晚 → 我是旧的 */
        if (remote > mine) {
          sessionStorage.setItem('cdd.selfheal', String(Date.now()));
          var u = location.pathname + '?t=' + Date.now();
          location.replace(u);
        }
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
