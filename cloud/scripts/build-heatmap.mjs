// ============================================================
//  build-heatmap.mjs —— 「实票统计热力图」数据生成
//
//  产出的图长什么样（用户给的模板）：
//    顶部深红标题条：春风小店实票统计
//                   双色球 第 2026118 期 · 全网公开晒票号码占比
//    红球购买占比（完全降序）—— 红色系柱状图，33 根柱
//    蓝球购买占比（完全降序）—— 蓝色系柱状图，16 根柱
//
//  数据从哪来：
//    ① 主口径：一起彩「幸运晒票」页（www.yiqicai.com/xysp/ssqxysp、
//       /xysp/dltxysp）—— 抓当期的晒票文字，从文字里提取号码并统计占比。
//    ② 兜底口径：抓不到（或样本太少）时，用「近 30 期开奖号码频率」
//       代替，并在数据里把 source 标成 history-fallback。
//       —— 绝不假装成晒票统计。
//
//  用法：
//    node build-heatmap.mjs              自动：只处理「今天是它的开奖日」的彩种
//    node build-heatmap.mjs ssq          只处理双色球
//    node build-heatmap.mjs dlt          只处理大乐透
//    node build-heatmap.mjs ssq,dlt      两个都处理
//    node build-heatmap.mjs all          两个都处理
//    node build-heatmap.mjs --purge      不抓，只写出 games:{}（非开奖日清空用）
//    node build-heatmap.mjs ssq --force 忽略「今天是不是开奖日」的判断（调试用）
//
//  输出：heatmap-data.js（程序生成，勿手改）
//
//  【免责】热力图只是「大家买了什么号 / 哪些号近 30 期出得多」的统计展示，
//          不是预测，也不能提高中奖概率。
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'heatmap-data.js');

/* ============================================================
   一、彩种配置
   ============================================================ */
const CFG = {
  ssq: {
    id: 'ssq',
    name: '双色球',
    url: 'https://www.yiqicai.com/xysp/ssqxysp',
    frontLabel: '红球',
    backLabel: '蓝球',
    frontMax: 33,          // 红球 01-33
    backMax: 16,           // 蓝球 01-16
    frontKeys: ['red'],    // history.js / draws.js 里的区名
    backKeys: ['blue'],
    drawDays: [0, 2, 4]    // 周日 / 周二 / 周四
  },
  dlt: {
    id: 'dlt',
    name: '大乐透',
    url: 'https://www.yiqicai.com/xysp/dltxysp',
    frontLabel: '前区',
    backLabel: '后区',
    frontMax: 35,          // 前区 01-35
    backMax: 12,           // 后区 01-12
    frontKeys: ['front'],
    backKeys: ['back'],
    drawDays: [1, 3, 6]    // 周一 / 周三 / 周六
  }
};

const ALL_GAMES = ['ssq', 'dlt'];

/* 近 30 期（兜底口径的窗口） */
const HISTORY_WINDOW = 30;

/* 晒票样本「够不够用」的门槛。低于这个数就退回兜底口径 —— 
   一起彩的晒票绝大多数是【图片】+ 一两句闲聊，能提取到的号码非常少，
   样本太薄算出来的占比没有意义（会出现一堆 0%，看起来像图坏了）。 */
const MIN_SAMPLE_POSTS = 5;     // 至少 5 篇晒票有可用号码
const MIN_FRONT_TOTAL = 60;     // 前区号码出现总次数
const MIN_BACK_TOTAL = 12;      // 后区号码出现总次数

/* 抓取参数（用户要求） */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://www.yiqicai.com/xysp';
const TIMEOUT_MS = 25000;
const RETRY = 2;               // 失败重试 2 次

/* ============================================================
   二、时间（一律按北京时间算，不依赖服务器时区）
   ============================================================ */
function bj(d) {
  const t = (d ? new Date(d).getTime() : Date.now()) + 8 * 3600000;
  const u = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return {
    y: u.getUTCFullYear(),
    mo: u.getUTCMonth() + 1,
    d: u.getUTCDate(),
    hh: u.getUTCHours(),
    mi: u.getUTCMinutes(),
    dow: u.getUTCDay(),
    date: `${u.getUTCFullYear()}-${p(u.getUTCMonth() + 1)}-${p(u.getUTCDate())}`,
    stamp: `${u.getUTCFullYear()}-${p(u.getUTCMonth() + 1)}-${p(u.getUTCDate())} ${p(u.getUTCHours())}:${p(u.getUTCMinutes())}`,
    hhmm: `${p(u.getUTCHours())}:${p(u.getUTCMinutes())}`
  };
}

const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/* ============================================================
   三、读项目里已有的开奖数据（期号用 nextIssueFor，不自己拼）
   ============================================================ */
function loadDrawHelpers() {
  const store = new Map();
  const ctx = vm.createContext({
    console, Math, Map, Set, Array, Object, String, Number, JSON, Date,
    parseInt, parseFloat, isNaN, RegExp, Error, Infinity,
    document: { createElement: () => ({ style: {}, appendChild() {}, set textContent(v) {} }) },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    }
  });
  for (const f of ['games.js', 'draws.js', 'draw-data.js']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }
    catch (e) { log(`  ⚠️ 加载 ${f} 失败：${e.message}`); }
  }
  try {
    vm.runInContext(
      'globalThis.__ni = (typeof nextIssueFor === "function") ? nextIssueFor : null;' +
      'globalThis.__nd = (typeof nextDrawDate === "function") ? nextDrawDate : null;', ctx);
  } catch (e) { /* 忽略 */ }
  return { nextIssueFor: ctx.__ni, nextDrawDate: ctx.__nd };
}

const DRAW = loadDrawHelpers();

/** 项目期号 → 一起彩页面上的期号写法
 *  项目：双色球 2026118（7 位） / 大乐透 26117（5 位）
 *  页面：[26118期] / [26117期]  —— 年份只留后两位
 *  例：'2026118' → '26118'；'26117' → '26117'
 */
function siteIssue(issue) {
  const s = String(issue || '').trim();
  if (!/^\d{5,8}$/.test(s)) return s;
  const yearLen = s.length >= 7 ? 4 : 2;
  const year2 = s.slice(0, yearLen).slice(-2);
  const seq = s.slice(yearLen).replace(/^0+(?=\d)/, '');
  return year2 + seq;
}

/** 期号 → 期号里的序号（用于页面期号匹配，宽松一层） */
function issueSeq(issue) {
  const s = String(issue || '').trim();
  if (!/^\d{5,8}$/.test(s)) return '';
  const yearLen = s.length >= 7 ? 4 : 2;
  return s.slice(yearLen).replace(/^0+(?=\d)/, '');
}

/* ============================================================
   四、近 30 期开奖号码频率（兜底口径）
   ============================================================ */
function loadHistory() {
  const p = path.join(ROOT, 'history.js');
  if (!fs.existsSync(p)) return null;
  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + '\nglobalThis.__H = DRAW_HISTORY;', c);
    return c.__H || null;
  } catch (e) { log(`  ⚠️ history.js 解析失败：${e.message}`); return null; }
}

function fallbackFromHistory(cfg, H) {
  const list = (H && H.games && Array.isArray(H.games[cfg.id])) ? H.games[cfg.id] : null;
  if (!list || !list.length) return null;

  const rows = list.slice(0, HISTORY_WINDOW);
  const front = new Array(cfg.frontMax + 1).fill(0);
  const back = new Array(cfg.backMax + 1).fill(0);
  let used = 0;

  rows.forEach((r) => {
    const a = r && r.areas;
    if (!a) return;
    let hit = false;
    cfg.frontKeys.forEach((k) => (a[k] || []).forEach((n) => {
      if (n >= 1 && n <= cfg.frontMax) { front[n]++; hit = true; }
    }));
    cfg.backKeys.forEach((k) => (a[k] || []).forEach((n) => {
      if (n >= 1 && n <= cfg.backMax) { back[n]++; hit = true; }
    }));
    if (hit) used++;
  });

  if (!used) return null;

  return {
    frontCounts: front,
    backCounts: back,
    drawCount: used,
    firstIssue: rows[0] && rows[0].issue,
    lastIssue: rows[rows.length - 1] && rows[rows.length - 1].issue
  };
}

/* ============================================================
   五、抓一起彩晒票页
   ============================================================ */

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 400-800ms 之间的随机间隔，别把人家站点打疼 */
function politeDelay() { return 400 + Math.floor(Math.random() * 401); }

async function fetchHtml(url) {
  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY; attempt++) {
    if (attempt > 0) {
      log(`    ↻ 第 ${attempt} 次重试 ...`);
      await sleep(politeDelay() + attempt * 500);
    }
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Referer': REFERER
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      let text = buf.toString('utf8');
      // 站点可能是 GBK（老页面），先按 meta 探测一次
      if (/charset=["']?\s*(gb2312|gbk|gb18030)/i.test(text.slice(0, 3000))) {
        try { text = new TextDecoder('gb18030').decode(buf); } catch (e) { /* 就用 utf8 */ }
      }
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('抓取失败');
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * 从晒票列表页里切出每一条晒票
 * 页面结构（SSR，一起彩）：
 *   <div class="lucky-tickets-x">
 *     <dt class="lucky-name">作者</dt>
 *     <dd class="lucky-msg-txt">10-13 21:53</dd>
 *     <div class="lucky-msg">[26118期]正文</div>
 *     <div class="lucky-pics"><img ...></div>
 *   </div>
 */
function parsePosts(html) {
  const posts = [];
  const blocks = String(html).split(/<div[^>]*class="[^"]*lucky-tickets-x[^"]*"/i).slice(1);
  blocks.forEach((raw) => {
    const chunk = raw.slice(0, 8000);

    const nameM = /<dt[^>]*class="[^"]*lucky-name[^"]*"[^>]*>([\s\S]*?)<\/dt>/i.exec(chunk);
    const timeM = /<dd[^>]*class="[^"]*lucky-msg-txt[^"]*"[^>]*>([\s\S]*?)<\/dd>/i.exec(chunk);
    const msgM = /<div[^>]*class="[^"]*lucky-msg[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(chunk);

    const time = stripTags(timeM ? timeM[1] : '');
    let msg = stripTags(msgM ? msgM[1] : '');
    if (!msg) return;

    // 正文开头的 [26118期]
    let issue = '';
    const im = /^\s*[\[【]\s*(\d{3,8})\s*期\s*[\]】]/.exec(msg);
    if (im) { issue = im[1]; msg = msg.slice(im[0].length).trim(); }

    posts.push({
      author: stripTags(nameM ? nameM[1] : ''),
      time,
      issue,
      text: msg,
      pics: (chunk.match(/<img/gi) || []).length
    });
  });
  return posts;
}

/** '10-13 21:53' → { mo:10, d:13, yyyy:'2026' }（按当前年份猜，跨年时按去年算） */
function parsePostTime(t, nowBj) {
  const m = /(\d{1,2})\s*-\s*(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/.exec(String(t || ''));
  if (!m) return null;
  const mo = parseInt(m[1], 10), d = parseInt(m[2], 10);
  let y = nowBj.y;
  // 页面时间比"今天"大很多个月 → 一定是去年的帖子
  if (mo - nowBj.mo > 6) y -= 1;
  const p = (n) => String(n).padStart(2, '0');
  return {
    y, mo, d,
    ymd: `${y}-${p(mo)}-${p(d)}`,
    hh: m[3] ? parseInt(m[3], 10) : 0,
    mi: m[4] ? parseInt(m[4], 10) : 0
  };
}

/* ============================================================
   六、从晒票文字里提取号码
   ------------------------------------------------------------
   现实情况：一起彩的晒票绝大多数只发【票面照片】，
   文字里能提取到的号码非常少。所以这里宁可宽松（识别不了的
   号码按普通号码计入），但绝不去解读图片。
   规则：
     · “杀号”后面的号码不算购买号 → 丢弃
     · 出现 蓝/后区 关键字后 → 后面的号码算后区
     · 出现 红/前区/胆码/拖码 关键字后 → 后面的号码算前区
     · 没标区域的号码：落在前区范围就算前区
     · 每篇晒票里去重（一张票同一个号只算一次）
   ============================================================ */
function extractNumbers(text, cfg) {
  const front = new Set();
  const back = new Set();

  // 先按「区域关键字」把正文切成若干段
  const KEY_BACK = /(蓝球|篮球|蓝号|后区|蓝)/;
  const KEY_FRONT = /(红球|前区|胆码|拖码|胆|拖|号码|推荐|复式)/;
  const KEY_KILL = /(杀号|杀)/;

  let ctx = '';
  const tokens = String(text || '')
    .replace(/[\[\]【】]/g, ' ')
    .split(/(\s+|[，,、;；。！!？?：:（）()\-—→|/\\"'“”‘’]+)/);

  tokens.forEach((tk) => {
    if (!tk) return;
    const t = tk.trim();
    if (!t) return;

    if (KEY_KILL.test(t)) { ctx = 'kill'; return; }
    if (KEY_BACK.test(t)) { ctx = 'back'; return; }
    if (KEY_FRONT.test(t)) { ctx = 'front'; return; }

    const m = /^0*(\d{1,2})(?:码|号|个)?$/.exec(t);
    if (!m) return;
    const n = parseInt(m[1], 10);
    if (!Number.isInteger(n) || n <= 0) return;

    if (ctx === 'kill') return;                       // 杀号：不是买的号

    const inFront = n <= cfg.frontMax;
    const inBack = n <= cfg.backMax;

    if (ctx === 'back') {
      if (inBack) back.add(n);
      return;
    }
    if (ctx === 'front') {
      if (inFront) front.add(n);
      return;
    }
    // 没有区域标记：能当前区就当前区（宽松，宁多不漏）
    if (inFront) front.add(n);
  });

  return { front: [...front].sort((a, b) => a - b), back: [...back].sort((a, b) => a - b) };
}

/* ============================================================
   七、统计 → items（完全降序）
   ============================================================ */
function round2(n) { return Math.round(n * 100) / 100; }

function buildItems(counts, max) {
  const total = counts.reduce((a, b) => a + b, 0);
  const items = [];
  for (let n = 1; n <= max; n++) {
    const c = counts[n] || 0;
    items.push({ num: n, count: c, pct: total > 0 ? round2((c / total) * 100) : 0 });
  }
  // 占比从高到低；占比相同的按号码从小到大
  items.sort((a, b) => (b.pct - a.pct) || (a.num - b.num));
  return { items, total };
}

/* ============================================================
   八、生成 heatmap-data.js
   ============================================================ */

/* 客户端 / 服务端共用的判断逻辑（同时写进产物文件，两边永远一致） */
const HELPER_SRC = `
/* ---------- 开奖日 & 显示时机（客户端与服务端共用同一套判断） ---------- */
/* 各彩种开奖日（0=周日），与 draw-data.js 的 DRAW_WEEKDAYS 保持一致 */
const HEATMAP_DRAW_DAYS = { ssq: [0, 2, 4], dlt: [1, 3, 6] };

/**
 * 把任意时刻转成「北京时间的墙上时钟」
 * @param {Date|string|number} [now] 不传就是当前时刻
 */
function heatmapBeijingNow(now) {
  var base = (now === undefined || now === null) ? null : new Date(now);
  if (!base || isNaN(base.getTime())) {
    base = new Date();
    try {
      if (typeof HEATMAP_NOW_OVERRIDE !== 'undefined' && HEATMAP_NOW_OVERRIDE) {
        var o = new Date(HEATMAP_NOW_OVERRIDE);
        if (!isNaN(o.getTime())) base = o;
      }
    } catch (e) { /* 忽略 */ }
  }
  // UTC+8：把本地时区偏移补掉，返回值各字段即为北京时间
  return new Date(base.getTime() + (base.getTimezoneOffset() + 480) * 60000);
}

/** 北京时间的今天，'YYYY-MM-DD' */
function heatmapToday(now) {
  var d = heatmapBeijingNow(now);
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/**
 * 这张热力图现在该不该显示
 *   ① 必须有这个彩种的数据，且数据就是【今天】生成的
 *   ② 今天必须是这个彩种的开奖日
 *   ③ 必须已经过了 18:00（北京时间）
 * 三个条件缺一不可 —— 平常不透露，第二天自动消失。
 */
function shouldShowHeatmap(gid, now) {
  var H = (typeof HEATMAP_DATA !== 'undefined' && HEATMAP_DATA && HEATMAP_DATA.games)
    ? HEATMAP_DATA.games[gid] : null;
  if (!H || !H.drawDate) return false;

  var bj = heatmapBeijingNow(now);
  if (H.drawDate !== heatmapToday(now)) return false;

  var days = HEATMAP_DRAW_DAYS[gid];
  if (!days || days.indexOf(bj.getDay()) < 0) return false;

  if (bj.getHours() < 18) return false;

  return true;
}

/** 百分比文本：保留原始精度（2 位小数），去掉末尾多余的 0 */
function heatmapPctText(pct) {
  var v = Number(pct);
  if (!isFinite(v)) v = 0;
  var s = v.toFixed(2);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\\.$/, '');
  return s + '%';
}
`;

function jsNum(n) { return Number.isFinite(n) ? String(n) : '0'; }

function itemsLiteral(items) {
  return '[' + items.map((it) => `{ num: ${it.num}, pct: ${jsNum(it.pct)}, count: ${it.count} }`).join(', ') + ']';
}

function areaLiteral(area) {
  return `{ label: '${area.label}', color: '${area.color}', total: ${area.total}, items: ${itemsLiteral(area.items)} }`;
}

function gameLiteral(g) {
  return [
    '    ' + g.id + ': {',
    `      name: '${g.name}',`,
    `      issue: '${g.issue}',`,
    `      drawDate: '${g.drawDate}',`,
    `      madeAt: '${g.madeAt}',`,
    `      source: '${g.source}',`,
    `      sourceLabel: '${g.sourceLabel}',`,
    `      sampleCount: ${g.sampleCount},`,
    `      numberPosts: ${g.numberPosts},`,
    `      note: '${String(g.note || '').replace(/'/g, "\\'")}',`,
    `      front: ${areaLiteral(g.front)},`,
    `      back: ${areaLiteral(g.back)}`,
    '    }'
  ].join('\n');
}

function writeFile(games, meta) {
  const nowBj = bj();
  const list = Object.keys(games);
  const src = list.length === 0
    ? 'none'
    : (list.every((k) => games[k].source === games[list[0]].source) ? games[list[0]].source : 'mixed');

  const body =
`/* ============================================================
   heatmap-data.js —— 实票统计热力图数据（程序生成，勿手改）

   生成时间：${nowBj.stamp}
   生成脚本：build-heatmap.mjs
   本次彩种：${list.length ? list.join('、') : '（无：今天不是开奖日）'}
   数据来源：${src}

   口径说明：
     · yiqicai-xysp      = 一起彩「幸运晒票」页当期晒票里提取到的号码占比
     · history-fallback  = 晒票样本不足，改用「近 ${HISTORY_WINDOW} 期开奖号码频率」代替
   免责：只是「大家买了什么号」的统计展示，不构成购彩建议，也不能预测中奖。
   ============================================================ */

const HEATMAP_DATA = {
  updated: '${nowBj.stamp}',
  source: '${src}',
  games: {
${Object.keys(games).map((k) => gameLiteral(games[k])).join(',\n')}${Object.keys(games).length ? '\n' : ''}  }
};
${meta && meta.extraNote ? '\n/* ' + meta.extraNote + ' */\n' : ''}
${HELPER_SRC.trim()}
`;

  fs.writeFileSync(OUT, body, 'utf8');
  return src;
}

/* 把 HELPER_SRC 装进沙箱，供本脚本自己判断用（保证和产物里的逻辑一模一样） */
function helperFns() {
  const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math, isNaN, isFinite, Number });
  vm.runInContext('var HEATMAP_DATA = { games: {} };\n' + HELPER_SRC +
    '\nglobalThis.__f = { shouldShowHeatmap: shouldShowHeatmap, heatmapToday: heatmapToday, heatmapBeijingNow: heatmapBeijingNow, heatmapPctText: heatmapPctText };', c);
  return c.__f;
}
const HELPER = helperFns();

/* ============================================================
   九、处理单个彩种
   ============================================================ */
async function buildGame(cfg, nowBj, opts) {
  const issue = (DRAW.nextIssueFor && DRAW.nextIssueFor(cfg.id)) || '';
  const drawDate = (DRAW.nextDrawDate && DRAW.nextDrawDate(cfg.id)) || nowBj.date;
  const site = siteIssue(issue);
  const seq = issueSeq(issue);

  log('');
  log(`【${cfg.name}】第 ${issue} 期（页面写法 [${site}期]）· 开奖日 ${drawDate} ${WEEK_CN[new Date(drawDate + 'T00:00:00').getDay()] || ''}`);

  let posts = [];
  let fetchErr = null;
  try {
    log(`  → 抓晒票页：${cfg.url}`);
    const html = await fetchHtml(cfg.url);
    log(`  ✅ 页面 ${(html.length / 1024).toFixed(1)} KB`);
    posts = parsePosts(html);
    log(`  · 页面上共 ${posts.length} 篇晒票`);
  } catch (e) {
    fetchErr = e;
    log(`  ❌ 抓取失败（不中断）：${e.message}`);
  }

  /* 按「期号 + 当天」过滤，只留当期 */
  const matched = posts.filter((p) => {
    if (!p.issue) return false;
    if (p.issue === site) return true;
    if (issue && p.issue === issue) return true;
    if (seq && issueSeq(p.issue) === seq) return true;
    return false;
  });

  if (posts.length && !matched.length) {
    log(`  ⚠️ ${posts.length} 篇晒票里没有一篇是第 ${issue} 期的（页面上最新的是 ${posts.map((p) => p.issue).filter(Boolean).slice(0, 3).join('/')}）`);
  }
  const todayPosts = matched.filter((p) => {
    const t = parsePostTime(p.time, nowBj);
    return t && t.ymd === nowBj.date;
  });
  log(`  · 当期晒票 ${matched.length} 篇（其中今天发的 ${todayPosts.length} 篇）`);

  /* 提取号码 */
  const frontCounts = new Array(cfg.frontMax + 1).fill(0);
  const backCounts = new Array(cfg.backMax + 1).fill(0);
  let numberPosts = 0;
  matched.forEach((p) => {
    const got = extractNumbers(p.text, cfg);
    if (!got.front.length && !got.back.length) return;
    numberPosts++;
    got.front.forEach((n) => { frontCounts[n]++; });
    got.back.forEach((n) => { backCounts[n]++; });
  });

  const frontTotal = frontCounts.reduce((a, b) => a + b, 0);
  const backTotal = backCounts.reduce((a, b) => a + b, 0);
  log(`  · 能从文字里提出号码的晒票：${numberPosts} 篇 / 前区号码出现 ${frontTotal} 次 / 后区 ${backTotal} 次`);

  const enough = numberPosts >= MIN_SAMPLE_POSTS &&
                 frontTotal >= MIN_FRONT_TOTAL &&
                 backTotal >= MIN_BACK_TOTAL;

  let source, sourceLabel, note, sampleCount, fCounts, bCounts;

  if (enough) {
    source = 'yiqicai-xysp';
    sourceLabel = '全网公开晒票';
    note = `摘自一起彩幸运晒票页第 ${site} 期公开晒票文字`;
    sampleCount = matched.length;
    fCounts = frontCounts;
    bCounts = backCounts;
    log(`  ✅ 晒票样本够用 → 用它出图（${matched.length} 篇）`);
  } else {
    if (fetchErr) log(`  ⚠️ 抓取失败，走兜底口径`);
    else log(`  ⚠️ 晒票样本不足（需 ≥${MIN_SAMPLE_POSTS} 篇 / 前区 ≥${MIN_FRONT_TOTAL} 次 / 后区 ≥${MIN_BACK_TOTAL} 次），走兜底口径`);

    const H = (opts && opts.history) || null;
    const fb = fallbackFromHistory(cfg, H);
    if (!fb) {
      log(`  ❌ 连兜底数据都没有（history.js 缺 ${cfg.id}）→ 本期不出这张图`);
      return null;
    }
    source = 'history-fallback';
    sourceLabel = `近 ${fb.drawCount} 期开奖频率`;
    note = `晒票样本不足，改用近 ${fb.drawCount} 期开奖号码频率（${fb.lastIssue}~${fb.firstIssue}）`;
    sampleCount = fb.drawCount;
    fCounts = fb.frontCounts;
    bCounts = fb.backCounts;
    log(`  ✅ 兜底口径可用：近 ${fb.drawCount} 期（${fb.lastIssue}~${fb.firstIssue}）`);
  }

  const F = buildItems(fCounts, cfg.frontMax);
  const B = buildItems(bCounts, cfg.backMax);

  return {
    id: cfg.id,
    name: cfg.name,
    issue: issue || site,
    drawDate,
    madeAt: nowBj.stamp,
    source,
    sourceLabel,
    sampleCount,
    numberPosts,
    note,
    front: { label: cfg.frontLabel, color: 'red', total: F.total, items: F.items },
    back: { label: cfg.backLabel, color: 'blue', total: B.total, items: B.items }
  };
}

/* ============================================================
   十、主流程
   ============================================================ */
function log(...a) { console.log(...a); }

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const purge = argv.includes('--purge');
  const args = argv.filter((a) => !a.startsWith('--'));

  const nowBj = bj();
  log('════════════════════════════════════════════');
  log(`  实票统计热力图 · ${nowBj.stamp} ${WEEK_CN[nowBj.dow]}`);
  log('════════════════════════════════════════════');

  if (purge) {
    const src = writeFile({}, { extraNote: '本次为 --purge：今天不是任何彩种的开奖日，清空数据，页面上不会出现这张图' });
    log('  ✅ 已清空 heatmap-data.js（games: {}）');
    log(`  输出：${OUT}`);
    log('════════════════════════════════════════════');
    return;
  }

  /* 要处理哪些彩种 */
  let want = ALL_GAMES.slice();
  if (args.length) {
    const asked = args.join(',').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!asked.includes('all')) want = want.filter((g) => asked.includes(g));
  }

  /* 开奖日过滤（除非 --force） */
  const todayDraw = ALL_GAMES.filter((g) => CFG[g].drawDays.includes(nowBj.dow));
  if (!force) {
    const before = want.length;
    want = want.filter((g) => todayDraw.includes(g));
    if (before && !want.length) {
      log(`  今天（${WEEK_CN[nowBj.dow]}）不是双色球/大乐透的开奖日 → 本期不出这张图`);
      const src = writeFile({}, { extraNote: '今天不是开奖日，未生成任何彩种' });
      log('  ✅ 已写出空的 heatmap-data.js（games: {}）');
      log(`  输出：${OUT}`);
      log('════════════════════════════════════════════');
      return;
    }
  } else if (want.length) {
    log(`  ⚠️ --force：忽略开奖日判断（今天 ${WEEK_CN[nowBj.dow]}，开奖彩种：${todayDraw.join(',') || '无'}）`);
  }

  if (!want.length) {
    log('  没有要处理的彩种');
    writeFile({}, null);
    return;
  }

  if (nowBj.hh < 18 && !force) {
    log(`  ⚠️ 现在北京时间 ${nowBj.hhmm}，还没到 18:00（数据照常生成，客户端 18:00 前不显示）`);
  }

  const H = loadHistory();
  if (!H) log('  ⚠️ 读不到 history.js，兜底口径不可用');

  const games = {};
  for (const g of want) {
    let entry = null;
    try {
      entry = await buildGame(CFG[g], nowBj, { history: H });
    } catch (e) {
      log(`  ❌ ${CFG[g].name} 处理失败（不中断）：${e.message}`);
    }
    if (entry) games[g] = entry;
    if (want.length > 1) await sleep(politeDelay());
  }

  const src = writeFile(games, null);

  log('');
  log('────────────── 结果 ──────────────');
  Object.keys(games).forEach((g) => {
    const G = games[g];
    log(`${G.name} 第 ${G.issue} 期 · 开奖日 ${G.drawDate} · 来源 ${G.source}（${G.sourceLabel}）· 样本 ${G.sampleCount}`);
    log(`  ${G.front.label}（${G.front.items.length} 个号，共 ${G.front.total} 次）：`);
    log('    ' + G.front.items.map((it) => `${String(it.num).padStart(2, '0')}=${HELPER.heatmapPctText(it.pct)}`).join('  '));
    log(`  ${G.back.label}（${G.back.items.length} 个号，共 ${G.back.total} 次）：`);
    log('    ' + G.back.items.map((it) => `${String(it.num).padStart(2, '0')}=${HELPER.heatmapPctText(it.pct)}`).join('  '));
  });
  if (!Object.keys(games).length) log('  （没有任何彩种出图）');

  log('');
  log(`  ✅ 已写入 ${OUT}`);
  log(`     数据来源标记 source = ${src}`);
  log('════════════════════════════════════════════');
}

main().catch((e) => {
  log('❌ 生成失败：' + (e && e.stack ? e.stack : e));
  process.exit(0);   // 【重要】失败也不让上层流程中断
});
