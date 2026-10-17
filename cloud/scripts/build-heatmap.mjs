// ============================================================
//  build-heatmap.mjs —— 「实票统计热力图」数据生成
//
//  产出的图长什么样（用户给的模板）：
//    顶部深红标题条：春风小店实票统计
//                   双色球 第 2026118 期 · 全网公开晒票号码占比
//    红球购买占比（完全降序）—— 红色系柱状图，33 根柱
//    蓝球购买占比（完全降序）—— 蓝色系柱状图，16 根柱
//
//  数据从哪来（按优先级）：
//    ① 主口径 OCR：一起彩「幸运晒票」页（www.yiqicai.com/xysp/ssqxysp、
//       /xysp/dltxysp）—— 下载【票面照片】，用 ocr-tickets.mjs 识别号码，
//       只留「期号 = 当期 + 号码合法 + 多个预处理变体识别一致」的票，
//       然后统计占比。source = 'ocr-xysp'。
//    ② 次口径 晒票文字：OCR 样本不够时，退回从晒票【正文文字】里提号码
//       （绝大多数帖子只有图片，所以这条通常是空的）。source = 'xysp-text'。
//    ③ 兜底口径：上面都不够时，用「近 30 期开奖号码频率」代替，
//       source = 'history-fallback'。—— 绝不假装成晒票统计。
//
//  用法：
//    node build-heatmap.mjs              自动：只处理「今天是它的开奖日」的彩种
//    node build-heatmap.mjs ssq          只处理双色球
//    node build-heatmap.mjs dlt          只处理大乐透
//    node build-heatmap.mjs ssq,dlt      两个都处理
//    node build-heatmap.mjs all          两个都处理
//    node build-heatmap.mjs --purge      不抓，只写出 games:{}（非开奖日清空用）
//    node build-heatmap.mjs ssq --force 忽略「今天是不是开奖日」的判断（调试用）
//    node build-heatmap.mjs ssq --no-ocr        跳过 OCR，直接走文字/兜底
//    node build-heatmap.mjs ssq --ocr-limit 6   本次最多识别 6 张票（调试提速）
//
//  输出：heatmap-data.js（程序生成，勿手改）
//
//  【免责】热力图只是「大家买了什么号 / 哪些号近 30 期出得多」的统计展示，
//          不是预测，也不能提高中奖概率。
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
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
   一起彩的晒票绝大多数是【图片】，所以主口径是 OCR 票面照片。 */
const MIN_SAMPLE_POSTS = 5;     // 至少 5 篇晒票有可用号码
const MIN_FRONT_TOTAL = 60;     // 前区号码出现总次数
const MIN_BACK_TOTAL = 12;      // 后区号码出现总次数
/* 【2026-10-18 下调 3 → 2】用户要求：宁可给「少量真晒票」，也不要退回开奖频率。
   2 张票确实样本很薄，所以下面会强制在 note 里写明「仅 N 张票样本」——
   数据是真的，但不许看起来很厚。 */
const MIN_OCR_TICKETS = 2;
/* 低于这个数就标「样本偏少」（页面 / 数据里都要带这句） */
const MIN_OCR_TICKETS_GOOD = 5;

/* OCR 参数 */
const OCR_MAX_IMAGES = 80;      // 一次最多识别多少张票（一起彩一页 10 篇，够用）
const OCR_CONCURRENCY = 4;      // 并发识别几张（本机 4 核够用；云端更高）
/* 【多翻几页】一起彩晒票页是分页的（/xysp/dltxysp/2、/3 …），
   只抓第 1 页永远只有 10 篇 / 约 12 张图。开奖日高峰期当期晒票会跨好几页，
   所以往下翻，直到某一页【没有当期帖】就停（后面只会更老）。 */
const OCR_MAX_PAGES = 3;
const IMG_TIMEOUT_MS = 30000;   // 图片下载超时（用户要求 30s）
const IMG_RETRY = 2;            // 图片下载失败重试 2 次

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

    /* 这一篇晒票里的票面照片（只取 lucky-pics 里的图，头像不算） */
    const picsBox = /<div[^>]*class="[^"]*lucky-pics[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(chunk);
    const imgTags = [...((picsBox ? picsBox[1] : '').match(/<img[^>]*>/gi) || [])];
    const images = imgTags.map((tag) => {
      const m = /(?:data-original|data-src|src)\s*=\s*["']([^"']+)["']/i.exec(tag);
      if (!m) return null;
      return decodeEntities(m[1]);
    }).filter(Boolean);

    posts.push({
      author: stripTags(nameM ? nameM[1] : ''),
      time,
      issue,
      text: msg,
      images,
      pics: images.length
    });
  });
  return posts;
}

/* ============================================================
   五之二、票面照片的识别与筛选
   ------------------------------------------------------------
   一起彩的晒票帖里会混进各种图：
     · 头像 / 站点 logo        → f.jiangduoduo.com、yiqicai.com、trust.hss.org.cn
     · 老帖子的无关图          → f.17chdd.com/年/月/日/大写哈希.png
     · 票面照片（要的就是它）  → img02.17chdd.com/年-月-日/uuid.jpg?width=&height=
   实测：候选图里有 3 成不是票（配图、大字图、儿童照），所以还要靠 OCR
   结果兜一层 —— 认不出「开奖期 + 合法号码行」的直接丢掉。
   ============================================================ */

/** 路径里带日期（2026-10-13）的 17chdd 图 === 候选票面照片 */
function looksLikeTicketPhoto(u) {
  const s = String(u || '');
  if (!/^https?:\/\//i.test(s)) return false;
  if (!/(^|\.)17chdd\.com\//i.test(s)) return false;
  if (/17chdd\.com\/(group\d|\d{4}\/\d{2}\/\d{2}\/[0-9A-F]{16,}\.)/i.test(s)) return false;   // 老帖哈希图
  const p = s.split('?')[0];
  return /\/\d{4}-\d{2}-\d{2}\//.test(p);
}

function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }

/** 下载一张图片（限流 + 30s 超时 + 重试 2 次），返回 { buf } 或 { buf:null, err } */
async function downloadImage(url, cacheDir) {
  const cacheFile = path.join(cacheDir, md5(url) + '.bin');
  if (fs.existsSync(cacheFile)) {
    try { return { buf: fs.readFileSync(cacheFile), cached: true }; } catch (e) { /* 缓存坏了就重下 */ }
  }
  let lastErr = null;
  for (let attempt = 0; attempt <= IMG_RETRY; attempt++) {
    if (attempt > 0) await sleep(politeDelay() + attempt * 400);
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': REFERER
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(IMG_TIMEOUT_MS)
      });
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1500) { lastErr = new Error('文件太小(' + buf.length + 'B)'); continue; }
      try { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cacheFile, buf); } catch (e) { /* 缓存失败不算错 */ }
      return { buf, cached: false };
    } catch (e) { lastErr = e; }
  }
  return { buf: null, err: lastErr ? lastErr.message : '未知错误' };
}

/**
 * OCR 口径：下载当期票面照片 → 识别 → 只留合法且期号正确的票
 * @returns {Promise<{ok:boolean, frontCounts:number[], backCounts:number[], tickets:Array, stats:Object, err?:string}>}
 */
async function ocrTickets(cfg, posts, expectIssue, opts) {
  const stats = {
    posts: posts.length, urls: 0, downloaded: 0, downloadFailed: 0, cacheHits: 0,
    recognized: 0, issueMatched: 0, tickets: [], ms: 0,
    unconfirmed: 0,                                   /* 号码读出来了、但票面期号认不出的票数 */
    kinds: { '单式票': 0, '复式票': 0, '胆拖票': 0 },   /* 票种拆分（复式/胆拖号码多，要让人看得见） */
    bandUsed: 0                                        /* 有多少张是靠「条带兜底」才认出来的 */
  };
  const frontCounts = new Array(cfg.frontMax + 1).fill(0);
  const backCounts = new Array(cfg.backMax + 1).fill(0);
  const tickets = [];

  /* ① 收集候选票面照片 URL（同一张图只下一次） */
  const urls = [];
  const seen = new Set();
  posts.forEach((p) => {
    (p.images || []).forEach((u) => {
      if (!looksLikeTicketPhoto(u)) return;
      const key = u.split('?')[0];
      if (seen.has(key)) return;
      seen.add(key);
      urls.push({ url: u, issue: p.issue, author: p.author });
    });
  });
  const limit = (opts && opts.limit) || OCR_MAX_IMAGES;
  stats.urls = urls.length;
  const use = urls.slice(0, limit);
  if (!use.length) return { ok: false, frontCounts, backCounts, tickets, stats, err: '页面上没有找到候选票面照片' };

  /* ② 加载 OCR 模块（缺依赖就优雅降级，不报错） */
  let ocr = null;
  try {
    ocr = await import('./ocr-tickets.mjs');
  } catch (e) {
    return { ok: false, frontCounts, backCounts, tickets, stats, err: 'OCR 模块导入失败：' + e.message };
  }
  const avail = ocr.ocrAvailable();
  if (!avail.ok) {
    return { ok: false, frontCounts, backCounts, tickets, stats, err: 'OCR 依赖不齐（缺 ' + avail.missing.join('/') + '）' };
  }

  const cacheDir = path.join(ROOT, '_ocr-cache');

  /* ③ 并发下载 + 识别 */
  const queue = use.slice();
  const t0 = Date.now();
  try { await ocr.getOcrWorker(); } catch (e) { return { ok: false, frontCounts, backCounts, tickets, stats, err: 'OCR 引擎启动失败：' + e.message }; }

  const workers = [];
  for (let i = 0; i < Math.min(OCR_CONCURRENCY, queue.length); i++) {
    workers.push((async () => {
      while (queue.length) {
        const item = queue.shift();
        const dl = await downloadImage(item.url, cacheDir);
        if (!dl.buf) { stats.downloadFailed++; log(`      ✗ 下载失败：…${String(item.url).slice(-46)}（${dl.err}）`); continue; }
        stats.downloaded++;
        if (dl.cached) stats.cacheHits++;
        await sleep(politeDelay() / 2);
        let r;
        try {
          r = await ocr.recognizeTicket(dl.buf, cfg.id, { expectIssue });
        } catch (e) {
          log(`      ✗ 识别异常：${e.message}`);
          continue;
        }
        if (!r.tickets.length || !r.ok) {
          log(`      · 丢弃（${r.reason}）…${String(item.url).slice(-38)}`);
          continue;
        }
        stats.recognized++;
        /* 【期号必须确认】票面上认不出期号，或者期号不是当期 → 这张票不进统计。
           为什么这么严：晒票板上一半的图是【上一期】的票（「可惜差点」「擦边」
           这种帖子晒的是刚开奖那期的票），实测 12 张里 10 张是 26118 的。
           如果「认不出期号」也算数，就会把 26118 的号码当成 26119 的购买占比
           —— 那就是编数据。宁可今晚一张都没有，也不能贴错期号。 */
        const confirmed = !!r.issue && !!ocr.sameIssue && ocr.sameIssue(r.issue, expectIssue);
        if (!confirmed) {
          stats.unconfirmed += r.tickets.length;
          log(`      · 丢弃（期号无法确认，识别为「${r.issue || '空'}」，只认当期 ${expectIssue}）…${String(item.url).slice(-38)}`);
          continue;
        }
        stats.issueMatched++;
        r.tickets.forEach((t) => {
          tickets.push({
            front: t.front, back: t.back, issue: r.issue,
            votes: t.votes, rate: t.rate, url: item.url, author: item.author,
            kind: t.kind || '单式票'
          });
          stats.tickets++;
          stats.kinds[t.kind || '单式票'] = (stats.kinds[t.kind || '单式票'] || 0) + 1;
          if (r.bandUsed) stats.bandUsed++;
          t.front.forEach((n) => { if (n >= 1 && n <= cfg.frontMax) frontCounts[n]++; });
          t.back.forEach((n) => { if (n >= 1 && n <= cfg.backMax) backCounts[n]++; });
        });
        const fmt = (t) => t.front.map((n) => String(n).padStart(2, '0')).join(' ') + '+' +
          t.back.map((n) => String(n).padStart(2, '0')).join(' ');
        log(`      ✅ 第 ${r.issue || '?'} 期 ${r.tickets.map(fmt).join(' / ')}`);
      }
    })());
  }
  await Promise.all(workers);
  try { await ocr.terminateOcr(); } catch (e) { /* 忽略 */ }
  stats.ms = Date.now() - t0;

  if (tickets.length < MIN_OCR_TICKETS) {
    return {
      ok: false, frontCounts, backCounts, tickets, stats,
      err: `期号确认的有效票只有 ${tickets.length} 张（需 ≥${MIN_OCR_TICKETS}）` +
        (stats.unconfirmed ? `；另有 ${stats.unconfirmed} 张号码读出来了但票面期号认不出/不是当期，已丢弃` : '') +
        (stats.recognized ? '' : '；本次没有任何图片通过号码识别')
    };
  }
  return { ok: true, frontCounts, backCounts, tickets, stats };
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
   五之三、多页抓晒票（第 2 页起）
   ------------------------------------------------------------
   一起彩的晒票页是【分页】的：/xysp/dltxysp、/xysp/dltxysp/2、/3 …
   以前只抓第 1 页 → 永远只有 10 篇、十几张图。
   现在：从第 1 页往下翻，某一页【一个当期帖都没有】就停
        （页面按时间倒序，后面只会更老，没必要再翻）。
   ============================================================ */

/** 这一篇晒票是不是「当期」的（页面上期号写法有 26119 / 2026119 两种） */
function isCurrentIssue(p, site, issue) {
  if (!p || !p.issue) return false;
  if (p.issue === site) return true;
  if (issue && p.issue === issue) return true;
  const seq = issueSeq(issue);
  if (seq && issueSeq(p.issue) === seq) return true;
  return false;
}

/** 抓 n 页晒票，返回去重后的帖子 + 每页统计 */
async function fetchPostsPaged(cfg, site, issue) {
  const out = [];
  const seen = new Set();
  const pages = [];
  for (let p = 1; p <= OCR_MAX_PAGES; p++) {
    const url = p === 1 ? cfg.url : String(cfg.url).replace(/\/+$/, '') + '/' + p;
    let html = null;
    try {
      html = await fetchHtml(url);
    } catch (e) {
      if (p === 1) throw e;
      log(`  ⚠️ 第 ${p} 页抓取失败（不影响已抓到的）：${e.message}`);
      break;
    }
    const list = parsePosts(html);
    let fresh = 0;
    list.forEach((x) => {
      const k = (x.author || '') + '|' + (x.time || '') + '|' + String(x.text || '').slice(0, 40);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(x);
      if (isCurrentIssue(x, site, issue)) fresh++;
    });
    pages.push({ page: p, posts: list.length, current: fresh });
    log(`  · 第 ${p} 页：${list.length} 篇晒票（当期 ${fresh} 篇）`);
    if (!fresh) break;                     /* 这页没有当期帖 → 后面更老，收工 */
    if (p < OCR_MAX_PAGES) await sleep(politeDelay());
  }
  return { posts: out, pages };
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

/* 【顶掉「最新开奖」的时间窗】开奖日当天（北京时间）：
     18:00 起   → 热力图出现，【占据页面顶部「最新开奖」区块的位置】
     到 WINDOW_END → 换回「最新开奖」
   双色球（周二 / 周四 / 周日）：18:00 → 20:00
   大乐透（周一 / 周三 / 周六）：18:00 → 21:00

   用户 2026-10-15 原话：
     「在开双色球的时候 18 点更新到最新开奖位置覆盖住，过了 20 点就更新回来
       最新开奖；同样大乐透在 18 点更新过去，21 点更新回来最新开奖。」
   ⚠️ 这里的结束时刻【不是开奖时刻】，是用户指定的「换回最新开奖」时刻
      （所以大乐透 21:00 会晚于它 20:30 的开奖时刻 —— 已向用户说明）。
   与 draw-data.js 的 DRAW_WEEKDAYS / 上面的 HEATMAP_DRAW_DAYS 配套。 */
const HEATMAP_WINDOW_START = '18:00';
const HEATMAP_WINDOW_END = { ssq: '20:00', dlt: '21:00' };

/**
 * 把任意时刻转成「北京时间的墙上时钟」
 * @param {Date|string|number} [now] 不传就是当前时刻
 *
 * 【注意】之前这里写成「base 无效时才看 HEATMAP_NOW_OVERRIDE」，
 * 结果是：传了 now 也会被 override/真实时间顶掉，
 * 导致 shouldShowHeatmap(gid, '2026-10-15T18:00') 这种调用不可靠。
 * 现在把优先级写清楚：显式 now > HEATMAP_NOW_OVERRIDE > 真实时间。
 */
function heatmapBeijingNow(now) {
  var base = null;
  if (now !== undefined && now !== null) {
    var d = new Date(now);
    if (!isNaN(d.getTime())) base = d;
  }
  if (!base) {
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

/** 'HH:MM' → 当天第几分钟（0~1439）；写错/没配 → -1（表示不做时刻限制） */
function heatmapClockMinute(hhmm) {
  var seg = String(hhmm === undefined || hhmm === null ? '' : hhmm).split(':');
  var h = +seg[0], m = +seg[1];
  if (!isFinite(h) || !isFinite(m)) return -1;
  return h * 60 + m;
}

/**
 * 这张热力图现在该不该显示（= 该不该顶掉「最新开奖」区块）
 *   ① 必须有这个彩种的数据，数据就是【今天】生成的，而且真的有柱子数据
 *   ② 今天必须是这个彩种的开奖日
 *   ③ 必须已经过了 18:00（北京时间）
 *   ④ 【到点换回来】还没到当天的窗口结束时刻
 *      双色球 20:00 换回「最新开奖」 / 大乐透 21:00 换回「最新开奖」
 * 四个条件缺一不可 —— 18:00 出现（顶掉最新开奖），窗口结束就换回来。
 *
 * 【服务端 / 客户端 / App 共用这一个函数】
 *   · 服务端：export-static.mjs 预渲染时用它（heatmapVisible）
 *   · 客户端：分享页内联脚本用它（实时渲染 + 到点自动切换）
 *   · latest-draws.js 的 latestBlockMode() 也调它来决定区块里放哪一张
 *   → 时间窗口只有这一处定义，两边不可能漂移。
 */
function shouldShowHeatmap(gid, now) {
  var H = (typeof HEATMAP_DATA !== 'undefined' && HEATMAP_DATA && HEATMAP_DATA.games)
    ? HEATMAP_DATA.games[gid] : null;
  if (!H || !H.drawDate) return false;

  /* 【数据缺失就不要顶掉】只有标题条没有柱子的热力图等于空白区块，
     这种情况必须让「最新开奖」照常显示（宁可不出热力图，也不能留白）。 */
  if (!H.front || !H.front.items || !H.front.items.length) return false;

  var bj = heatmapBeijingNow(now);
  if (H.drawDate !== heatmapToday(now)) return false;

  var days = HEATMAP_DRAW_DAYS[gid];
  if (!days || days.indexOf(bj.getDay()) < 0) return false;

  var nowMin = bj.getHours() * 60 + bj.getMinutes();
  var startMin = heatmapClockMinute(HEATMAP_WINDOW_START);
  if (startMin < 0) startMin = 18 * 60;
  if (nowMin < startMin) return false;                   /* 18:00 之前不显示 */

  /* 【到点换回来】到当天的窗口结束时刻就撤下，区块换回「最新开奖」 */
  var endMin = heatmapClockMinute(HEATMAP_WINDOW_END[gid]);
  if (endMin >= 0 && nowMin >= endMin) return false;

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

/* ⚠️ key 必须由调用方传进来：
   从 heatmap-data.js 里「读回来」的条目【没有 id 字段】（产物里只存 name/issue/…），
   早先这里写 g.id → 合并写回时 ssq 会被写成 `undefined: {…}`（实测踩过：
   games 变成 {undefined, dlt}，双色球热力图直接消失）。 */
function gameLiteral(g, key) {
  const ocrLit = g.ocr
    ? `{ posts: ${g.ocr.posts}, urls: ${g.ocr.urls}, downloaded: ${g.ocr.downloaded}, downloadFailed: ${g.ocr.downloadFailed}, cacheHits: ${g.ocr.cacheHits}, recognized: ${g.ocr.recognized}, tickets: ${Array.isArray(g.ocr.tickets) ? g.ocr.tickets.length : (Number.isFinite(g.ocr.tickets) ? g.ocr.tickets : 0)}, secs: ${g.ocr.secs}, err: '${String(g.ocr.err || '').replace(/'/g, "\\'")}' }`
    : 'null';
  return [
    '    ' + String(key || g.id) + ': {',
    `      name: '${g.name}',`,
    `      issue: '${g.issue}',`,
    `      drawDate: '${g.drawDate}',`,
    `      madeAt: '${g.madeAt}',`,
    `      source: '${g.source}',`,
    `      sourceLabel: '${g.sourceLabel}',`,
    `      sampleCount: ${g.sampleCount},`,
    `      numberPosts: ${g.numberPosts},`,
    `      note: '${String(g.note || '').replace(/'/g, "\\'")}',`,
    `      ocr: ${ocrLit},`,
    `      front: ${areaLiteral(g.front)},`,
    `      back: ${areaLiteral(g.back)}`,
    '    }'
  ].join('\n');
}

/* 【读现有数据】用于「合并写回」：本次没跑的彩种保留原条目。
   读不到 / 解析失败就返回 {}（宁可只写本次的，也不报错中断） */
function readExistingGames() {
  try {
    if (!fs.existsSync(OUT)) return {};
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(OUT, 'utf8') + '\nglobalThis.__H = HEATMAP_DATA;', c);
    const H = c.__H;
    const G = (H && H.games) ? H.games : {};
    /* 补回 id（产物里不存 id）—— 合并写回时要靠它当 key；
       顺便把不认识的 key（历史脏数据，例如被写成 `undefined:` 的）丢掉，
       否则它会一层层被写回、永远留在文件里 */
    const clean = {};
    Object.keys(G).forEach((k) => {
      if (!CFG[k] || !G[k]) return;
      if (!G[k].id) G[k].id = k;
      clean[k] = G[k];
    });
    return clean;
  } catch (e) { return {}; }
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
     · ocr-xysp          = 一起彩「幸运晒票」页当期【票面照片 OCR】识别出的号码占比
     · xysp-text         = OCR 样本不够，改用晒票【正文文字】里提取到的号码
     · history-fallback  = 都不可用，改用「近 ${HISTORY_WINDOW} 期开奖号码频率」代替
   免责：只是「大家买了什么号」的统计展示，不构成购彩建议，也不能预测中奖。
   ============================================================ */

const HEATMAP_DATA = {
  updated: '${nowBj.stamp}',
  source: '${src}',
  games: {
${Object.keys(games).map((k) => gameLiteral(games[k], k)).join(',\n')}${Object.keys(games).length ? '\n' : ''}  }
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
  let pageInfo = [];
  let fetchErr = null;
  try {
    log(`  → 抓晒票页：${cfg.url}（最多翻 ${OCR_MAX_PAGES} 页）`);
    const res = await fetchPostsPaged(cfg, site, issue);
    posts = res.posts;
    pageInfo = res.pages;
    log(`  ✅ 共 ${posts.length} 篇晒票（翻了 ${pageInfo.length} 页）`);
  } catch (e) {
    fetchErr = e;
    log(`  ❌ 抓取失败（不中断）：${e.message}`);
  }

  /* 按「期号」过滤，只留当期 */
  const matched = posts.filter((p) => isCurrentIssue(p, site, issue));

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

  const textEnough = numberPosts >= MIN_SAMPLE_POSTS &&
                     frontTotal >= MIN_FRONT_TOTAL &&
                     backTotal >= MIN_BACK_TOTAL;

  let source, sourceLabel, note, sampleCount, fCounts, bCounts;
  let ocrInfo = null;

  /* ============================================================
     主口径：票面照片 OCR
     ------------------------------------------------------------
     只对「当期」的帖子做（期号 = 页面 [NNNNN期] 或项目 nextIssueFor）；
     每张图都要通过：开奖期 = 当期、号码个数/范围/去重全合法、
     多个预处理变体识别结果一致。任何一条不满足就丢掉这张。
     ============================================================ */
  if (opts && opts.ocr !== false && matched.length) {
    log(`  → 票面照片 OCR（当期 ${matched.length} 篇晒票，最多识别 ${(opts && opts.ocrLimit) || OCR_MAX_IMAGES} 张）`);
    let ocrRes = null;
    try {
      /* 注意：这里的期号要用【完整期号】(2026118)，不是页面写法 (26118) ——
         票面上印的是完整的「开奖期：2026118」。 */
      ocrRes = await ocrTickets(cfg, matched, issue || site, { limit: (opts && opts.ocrLimit) || OCR_MAX_IMAGES });
    } catch (e) {
      log(`  ⚠️ OCR 过程异常（不中断）：${e.message}`);
      ocrRes = null;
    }
    if (ocrRes) {
      const s = ocrRes.stats;
      ocrInfo = { ...s, ok: ocrRes.ok, err: ocrRes.err || '', tickets: Array.isArray(ocrRes.tickets) ? ocrRes.tickets : [] };
      log(`  · OCR 统计：候选图 ${s.urls} 张 → 下载成功 ${s.downloaded}（失败 ${s.downloadFailed}，缓存命中 ${s.cacheHits}）→ 有效票 ${s.tickets} 张（耗时 ${(s.ms / 1000).toFixed(1)}s）`);
      if (ocrRes.ok) {
        source = 'ocr-xysp';
        sampleCount = s.tickets;
        fCounts = ocrRes.frontCounts;
        bCounts = ocrRes.backCounts;
        /* 【票种拆分】复式 / 胆拖 票一张能带 7～20 个号，必须让人知道
           「占比」里有多少来自大票，否则会被误读成「很多人买这个号」。 */
        const kindText = (() => {
          const k = s.kinds || {};
          const parts = [];
          if (k['单式票']) parts.push(`单式 ${k['单式票']} 张`);
          if (k['复式票']) parts.push(`复式 ${k['复式票']} 张`);
          if (k['胆拖票']) parts.push(`胆拖 ${k['胆拖票']} 张`);
          return parts.length ? '：' + parts.join(' / ') : '';
        })();
        /* 【样本量提示】票少的时候必须写在图头上，不许让人以为样本很厚 */
        const thin = s.tickets < MIN_OCR_TICKETS_GOOD
          ? `　仅 ${s.tickets} 张票样本 · 样本偏少，仅供参照`
          : '';
        const pagesText = pageInfo.length > 1 ? `（翻 ${pageInfo.length} 页）` : '';
        sourceLabel = s.tickets < MIN_OCR_TICKETS_GOOD
          ? `全网公开晒票照片识别（仅 ${s.tickets} 张票样本）`
          : '全网公开晒票照片识别';
        note = `识别自一起彩幸运晒票页第 ${site} 期公开票面照片${pagesText}（有效票 ${s.tickets} 张${kindText}）${thin}`;
        log(`  ✅ OCR 口径可用 → 用它出图（${s.tickets} 张有效票${kindText}）${thin ? ' ⚠️' + thin.trim() : ''}`);
      } else {
        log(`  ⚠️ OCR 口径不可用：${ocrRes.err} → 回退`);
      }
    } else {
      log(`  ⚠️ OCR 没有结果 → 回退`);
    }
  } else if (opts && opts.ocr === false) {
    log(`  · 已指定 --no-ocr：跳过票面照片 OCR`);
  }

  if (!source) {
    if (textEnough) {
      source = 'xysp-text';
      sourceLabel = '全网公开晒票（文字）';
      note = `摘自一起彩幸运晒票页第 ${site} 期公开晒票文字`;
      sampleCount = matched.length;
      fCounts = frontCounts;
      bCounts = backCounts;
      log(`  ✅ 晒票文字样本够用 → 用它出图（${matched.length} 篇）`);
    } else {
      if (fetchErr) log(`  ⚠️ 抓取失败，走兜底口径`);
      else if (ocrInfo) {
        const n = Array.isArray(ocrInfo.tickets) ? ocrInfo.tickets.length : Number(ocrInfo.tickets) || 0;
        log(`  ⚠️ 晒票统计口径不足（期号确认的有效票 ${n} 张，需 ≥${MIN_OCR_TICKETS}；` +
            `号码读出来但期号认不出的 ${ocrInfo.unconfirmed || 0} 张），晒票文字也只有 ${numberPosts} 篇 → 走兜底口径`);
      } else log(`  ⚠️ 晒票样本不足（需 ≥${MIN_SAMPLE_POSTS} 篇 / 前区 ≥${MIN_FRONT_TOTAL} 次 / 后区 ≥${MIN_BACK_TOTAL} 次），走兜底口径`);

      const H = (opts && opts.history) || null;
      const fb = fallbackFromHistory(cfg, H);
      if (!fb) {
        log(`  ❌ 连兜底数据都没有（history.js 缺 ${cfg.id}）→ 本期不出这张图`);
        return null;
      }
      source = 'history-fallback';
      sourceLabel = `近 ${fb.drawCount} 期开奖频率`;
      note = `晒票样本不足，改用近 ${fb.drawCount} 期开奖号码频率（${fb.lastIssue}~${fb.firstIssue}）`;
      if (ocrInfo && matched.length) {
        const n = Array.isArray(ocrInfo.tickets) ? ocrInfo.tickets.length : 0;
        note += `（当期晒票 ${matched.length} 篇 / 候选票面 ${ocrInfo.urls || 0} 张，能确认期号的只有 ${n} 张）`;
      }
      sampleCount = fb.drawCount;
      fCounts = fb.frontCounts;
      bCounts = fb.backCounts;
      log(`  ✅ 兜底口径可用：近 ${fb.drawCount} 期（${fb.lastIssue}~${fb.firstIssue}）`);
    }
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
    numberPosts: source === 'ocr-xysp' ? sampleCount : numberPosts,
    note,
    /* OCR 过程的统计（下载几张 / 识别几张 / 期号匹配几张 / 最终几张），
       写进数据文件方便排查「今天为什么是兜底口径」 */
    ocr: ocrInfo
      ? {
        posts: ocrInfo.posts, urls: ocrInfo.urls, downloaded: ocrInfo.downloaded,
        downloadFailed: ocrInfo.downloadFailed, cacheHits: ocrInfo.cacheHits,
        recognized: ocrInfo.recognized, tickets: Array.isArray(ocrInfo.tickets) ? ocrInfo.tickets : [],
        kinds: ocrInfo.kinds || null, bandUsed: ocrInfo.bandUsed || 0, unconfirmed: ocrInfo.unconfirmed || 0,
        pages: pageInfo.map((x) => x.page), pageStats: pageInfo,
        secs: Math.round(ocrInfo.ms / 100) / 10, err: ocrInfo.err
      }
      : null,
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
  const noOcr = argv.includes('--no-ocr');
  const li = argv.indexOf('--ocr-limit');
  const ocrLimit = li >= 0 ? Math.max(1, parseInt(argv[li + 1], 10) || OCR_MAX_IMAGES) : OCR_MAX_IMAGES;
  /* 只把「彩种名」当位置参数，别把 --ocr-limit 后面的数字也当成彩种 */
  const args = argv.filter((a, i) => !a.startsWith('--') && !(li >= 0 && i === li + 1));

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
      /* 【不再写空文件】用户 2026-10-17：热力图改每小时更新后，
         一次「非开奖日」的调用会把别的彩种已抓到的数据一起抹掉（实测：
         跑 dlt 把 ssq 也清空了）→ 现在【保留现有数据、什么都不写】。 */
      log(`  今天（${WEEK_CN[nowBj.dow]}）不是所请求彩种的开奖日 → 保留现有数据，不写文件`);
      log(`  输出（未改动）：${OUT}`);
      log('════════════════════════════════════════════');
      return;
    }
  } else if (want.length) {
    log(`  ⚠️ --force：忽略开奖日判断（今天 ${WEEK_CN[nowBj.dow]}，开奖彩种：${todayDraw.join(',') || '无'}）`);
  }

  if (!want.length) {
    log('  没有要处理的彩种 → 保留现有数据，不写文件');
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
      entry = await buildGame(CFG[g], nowBj, { history: H, ocr: !noOcr, ocrLimit });
    } catch (e) {
      log(`  ❌ ${CFG[g].name} 处理失败（不中断）：${e.message}`);
    }
    if (entry) games[g] = entry;
    if (want.length > 1) await sleep(politeDelay());
  }

  /* 【合并写回】本次只更新跑到的彩种，其它彩种保留原数据 ——
     否则一次单彩种调用（或某个彩种抓取失败）就会把别的好数据抹掉。 */
  const src = writeFile(Object.assign({}, readExistingGames(), games), null);

  log('');
  log('────────────── 结果 ──────────────');
  Object.keys(games).forEach((g) => {
    const G = games[g];
    log(`${G.name} 第 ${G.issue} 期 · 开奖日 ${G.drawDate} · 来源 ${G.source}（${G.sourceLabel}）· 样本 ${G.sampleCount}`);
    if (G.ocr) {
      const nt = Array.isArray(G.ocr.tickets) ? G.ocr.tickets.length : G.ocr.tickets;   /* tickets 是数组，别直接打印 */
      log(`  OCR：候选图 ${G.ocr.urls} / 下载 ${G.ocr.downloaded}（失败 ${G.ocr.downloadFailed}、缓存 ${G.ocr.cacheHits}）` +
          ` / 期号匹配 ${G.ocr.recognized} / 最终有效票 ${nt} / 用时 ${G.ocr.secs}s` +
          (G.ocr.err ? ` / 降级原因：${G.ocr.err}` : ''));
      log(`  期号过滤：总下载 ${G.ocr.downloaded} → 号码合法+多變體一致 ${G.ocr.recognized} → 最终采用 ${nt}` +
          `（丢弃 ${Math.max(0, G.ocr.downloaded - G.ocr.recognized)} 张）`);
      if (G.ocr.kinds) {
        const k = G.ocr.kinds;
        log(`  票种：单式 ${k['单式票'] || 0} / 复式 ${k['复式票'] || 0} / 胆拖 ${k['胆拖票'] || 0}` +
            (G.ocr.bandUsed ? ` · 条带兜底救回 ${G.ocr.bandUsed} 张` : '') +
            (Array.isArray(G.ocr.pages) ? ` · 翻页 ${G.ocr.pages.join('/')}` : ''));
      }
    }
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
