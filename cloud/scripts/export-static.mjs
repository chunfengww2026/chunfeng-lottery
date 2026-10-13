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
               'stats.js', 'templates.js', 'ticket-store.js', 'saved-tickets.js',
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
`, ctx);

const T = ctx.__T, G = ctx.__G, GROUPS = ctx.__GROUPS;
const render = ctx.__render, resolve = ctx.__resolve;
const getDraw = ctx.__getDraw, nextIssue = ctx.__nextIssue;
const nextDate = ctx.__nextDate, nextWeek = ctx.__nextWeek;

/* ============================================================
   DOM → HTML 字符串
   ============================================================ */
function toHtml(node) {
  if (!node) return '';
  if (node.tagName === '#TEXT') return escape(node._text || '');

  const tag = node.tagName.toLowerCase();
  const cls = node.className ? ` class="${node.className}"` : '';

  // 【关键】inline style 必须导出，否则网格列数等布局信息就丢了
  let cssText = '';
  try {
    const s = node.style;
    if (s) {
      cssText = (typeof s.cssText === 'string' && s.cssText) ? s.cssText : '';
      // 兜底：如果 cssText 为空但有驼峰属性，逐个拼
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
    }
  } catch (e) { cssText = ''; }

  const style = cssText ? ` style="${escape(cssText)}"` : '';

  let inner;
  if (node._html !== null && node._html !== undefined) inner = node._html;
  else if (node.children.length) inner = node.children.map(toHtml).join('');
  else inner = escape(node._text || '');

  // 自闭合标签
  if (['br', 'img', 'hr', 'input'].includes(tag)) return `<${tag}${cls}${style}>`;
  return `<${tag}${cls}${style}>${inner}</${tag}>`;
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

    // 渲染该彩种的所有模板图
    let imgsHtml = '';
    tpl.images.forEach((img) => {
      const resolved = resolve(id, img.key, null);
      const data = { issue, date, images: {} };
      data.images[img.key] = resolved.values;

      const dom = render(id, img.key, data);
      imgsHtml += `<div class="ro-imagewrap">${toHtml(dom)}</div>`;
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

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
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
<body>
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

<script>
/* ============================================================
   推荐图等比缩放
   ------------------------------------------------------------
   图片按 760px 设计宽度渲染，内部布局【完全不改】，
   手机上用 transform: scale() 整体缩小 ——
   这样和 App 里看到的一模一样，不会变形。
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

  /* 图片里的字体可能异步加载，多算几次更稳 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fit);
  } else {
    fit();
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
console.log(`   内容：${gameCount} 个彩种，${imgCount} 张图`);
console.log(`   生成时间：${todayStr}`);
console.log('\n这个文件可以直接发微信/QQ，对方点开就能看（只能看，不能改）。');
