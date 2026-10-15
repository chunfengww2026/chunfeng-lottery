/* ============================================================
   build-xysp.mjs —— 抓「晒票栏」数据
   ------------------------------------------------------------
   抓什么：
     一起彩晒票频道（服务端渲染，能抓到）：
       主列表   https://www.yiqicai.com/xysp          （「热门」，混彩种）
       彩种子页 https://www.yiqicai.com/xysp/<g>xysp  （按彩种，每页 10 条）
     主列表是混彩种的，没法标彩种；所以这里【只抓 8 个彩种子页】，
     每个彩种留最新的几条 —— 抓下来的每条都能明确标上是哪个彩种。

   页面真实结构（2026-10 实测，见下面的 ITEM_RE）：
     <div class="tickets-list">
       <div class="tickets-list-col">
         <div class="lucky-tickets-x">                     ← 一条晒票
           <div class="lucky-user">
             <div class="lucky-avatar"><img src="头像"></div>
             <dl class="lucky-info">
               <dt class="lucky-name">高人出山</dt>          ← 昵称
               <dd class="lucky-msg-txt">10-15 23:46</dd>    ← 时间（无年份）
             </dl>
           </div>
           <div class="lucky-msg">[26275期]这是命不好吗😳</div>   ← 文字（期号+描述）
           <div class="lucky-pics"><img src="票图URL">…</div>      ← 票图（1~N 张）
         </div>
         …
       </div>
     </div>

   定位方式（全部按 class 名，不依赖 data-v-xxxx 那种会变的编译哈希）：
     · 一条晒票   = class="lucky-tickets-x"
     · 彩种       = 抓的是哪个彩种子页（条目自己没有彩种字段）
     · 昵称       = class="lucky-name"
     · 时间       = class="lucky-msg-txt"（形如 10-15 23:46，没有年份）
     · 文字/标题  = class="lucky-msg"
     · 图片       = class="lucky-pics" 里的 <img src>
     · 详情页     = 【源站没有「单条晒票」的详情页】
                    页面里的 /xysp/ 链接只有 8 个彩种 + 分页。
                    所以 url 记「该彩种的晒票列表页」——点开就能看到这一条。

   【图片 · 外链不下载】实测结论（2026-10-16）：
     · 两个图床都不做 Referer 防盗链：不带 Referer / 带一起彩 Referer /
       带 github.io Referer，三种都是 HTTP 200 + 真 JPEG，字节数完全一样。
     · http:// 的图床【也支持 https】→ 页面用 https，不会被浏览器当混合内容拦掉。
     · 图床支持腾讯云万象缩略参数 ?imageMogr2/thumbnail/360x：
         原图 1080x2412 / 220868 B  →  缩略 360x804 / 40993 B（约 1/5.4）
       而且加了缩略参数后 Content-Type 从 application/octet-stream 变成
       image/jpeg（老图床原图那个 octet-stream 有的浏览器会不认）。
     ⇒ 页面里一律用 https + ?imageMogr2/thumbnail/360x 外链，不下载、不内联，
       页面本身体积几乎不增长（只是多了十几 KB 的 HTML 标签）。

   省成本 / 稳：
     · 每个彩种最多 MAX_PER_GAME 条，总数不超过 MAX_TOTAL 条
     · 彩种之间延时 DELAY_MS，只抓 8 个彩种子页（不抓主列表、不翻页）
     · 失败退避：照 update-football-smart.mjs 的写法
         - 单个彩种抓失败 → 本轮跳过它，别的彩种照常（不算整轮失败）
         - 8 个彩种【全失败】 → 记一次失败；连续 FAIL_PAUSE_AFTER 轮全失败 → 暂停
     · 抓不到不崩、也【不覆盖】上一次的 xysp-data.js（页面显示上一轮内容）
     · 一律 UTF-8 无 BOM；不涉及任何 token，脚本里没有任何密钥

   退出码：
     0  = 抓到并写入了新的 xysp-data.js（调用方可以继续出页面 + 同步）
     10 = 本轮跳过（退避中 / 8 个彩种全失败）—— 保留上一次的数据，调用方别同步
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'xysp-data.js');
const LOG = path.join(ROOT, '_xysp.log');
const STATE = path.join(ROOT, '_xysp-backoff.json');

const ORIGIN = 'https://www.yiqicai.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* 每个彩种最多留几条 × 8 个彩种 = 最多 32 条。
   为什么是 4：手机窄屏两列、宽屏三列，32 张 ≈ 11 行，
   加起来的标签体积约 15 KB —— 页面（约 1.06 MB）几乎不变大。
   再多的收益不大，只会让页面变长（图片是外链，懒加载）。 */
const MAX_PER_GAME = 4;
const MAX_TOTAL = 32;

/* 彩种之间延时（ms）—— 8 个请求，别把人家站点打痛 */
const DELAY_MS = 700;

/* 失败退避（写法照 update-football-smart.mjs） */
const FAIL_PAUSE_AFTER = 6;    // 连续这么多轮【全军覆没】→ 暂停
const PAUSE_MINUTES = 120;     // 暂停时长（分钟）

/* 缩略图参数：腾讯云万象，实测把 1080x2412 / 220 KB 压到 360x804 / 41 KB，
   并且把 Content-Type 修正成 image/jpeg。 */
const THUMB_Q = 'imageMogr2/thumbnail/360x';

/* 要抓的彩种子页（顺序 = 页面上「晒票栏」的彩种分组顺序） */
const GAMES = [
  { key: 'ssq',  name: '双色球', page: '/xysp/ssqxysp' },
  { key: 'dlt',  name: '大乐透', page: '/xysp/dltxysp' },
  { key: 'fc3d', name: '福彩3D', page: '/xysp/fc3dxysp' },
  { key: 'kl8',  name: '快乐8',  page: '/xysp/klbxysp' },
  { key: 'pl3',  name: '排列3',  page: '/xysp/pl3xysp' },
  { key: 'pl5',  name: '排列5',  page: '/xysp/pl5xysp' },
  { key: 'qxc',  name: '七星彩', page: '/xysp/xqxcxysp' },
  { key: 'qlc',  name: '七乐彩', page: '/xysp/qlcxysp' }
];

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${m}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) { /* 忽略 */ }
};

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (e) { return { failStreak: 0, pausedUntil: 0, lastRun: '', runs: 0, skips: 0, ok: 0 }; }
}
function writeState(s) { try { fs.writeFileSync(STATE, JSON.stringify(s, null, 1), 'utf8'); } catch (e) {} }

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}`;
}

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

/* ---------- 小工具 ---------- */
const stripTags = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/** 源站图片 → 页面能直接外链的 https 缩略图
 *  ① 强制 https（http 图在 https 页面上会被浏览器当混合内容拦掉）
 *  ② 丢掉源站那个只是缓存键的 ?width=&height=
 *  ③ 加上缩略参数（实测有效，体积约 1/5，Content-Type 也变正确） */
function thumbUrl(raw) {
  const s = String(raw || '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  let u;
  try { u = new URL(s.replace(/^http:/i, 'https:')); } catch (e) { return ''; }
  u.search = '';
  u.hash = '';
  return u.href + '?' + THUMB_Q;
}

/** 源站时间「10-15 23:46」（无年份）→ 可排序的时间戳。
 *  当作最近 12 个月内的日期：算出来的时间比现在晚 30 天以上，
 *  就认为它是去年的（跨年那几天不会把顺序排乱）。 */
function timeKey(mmddhhmm) {
  const m = /(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(String(mmddhhmm || ''));
  if (!m) return 0;
  const now = new Date();
  let d = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]),
    Number(m[3]), Number(m[4]));
  if (d.getTime() - now.getTime() > 30 * 86400000) d = new Date(now.getFullYear() - 1, Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4]));
  return d.getTime();
}

/* ============================================================
   解析一页晒票
   ============================================================ */
function parsePage(html, game) {
  const items = [];
  /* 按条切开：每条的起点就是这个 class */
  const chunks = String(html).split('<div class="lucky-tickets-x"');
  chunks.shift();                                   // 第 0 段是列表头，不是条目

  for (const c of chunks) {
    /* 昵称 */
    const nm = /class="lucky-name"[^>]*>([\s\S]*?)<\/dt>/.exec(c);
    const author = nm ? stripTags(nm[1]) : '';

    /* 时间（无年份，形如 10-15 23:46） */
    const tm = /class="lucky-msg-txt"[^>]*>([\s\S]*?)<\/dd>/.exec(c);
    const time = tm ? stripTags(tm[1]) : '';

    /* 文字 / 标题。注意要用 class="lucky-msg" 带引号，
       否则会连 lucky-msg-txt 一起匹配上。 */
    const ms = /class="lucky-msg"[^>]*>([\s\S]*?)<\/div>/.exec(c);
    const title = ms ? stripTags(ms[1]) : '';

    /* 票图：lucky-pics 里的第一张（多的不要，页面只放缩略图） */
    const picsM = /class="lucky-pics"[^>]*>([\s\S]*?)<\/div>/.exec(c);
    const picsHtml = picsM ? picsM[1] : '';
    const all = [];
    const IMG_RE = /<img[^>]*\bsrc="([^"]+)"/g;
    let im = null;
    while ((im = IMG_RE.exec(picsHtml)) !== null) {
      const t = thumbUrl(im[1]);
      if (t) all.push(t);
    }
    if (!all.length) continue;                      // 没有票图的条目直接丢

    items.push({
      game: game.key,
      gameName: game.name,
      title: title || (game.name + '晒票'),
      author,
      time,
      t: timeKey(time),
      img: all[0],                                  // 缩略图（列表用）
      imgFull: all[0].replace(/\?.*$/, ''),         // 原图（备用，页面暂不用）
      url: ORIGIN + game.page                       // 源站该彩种的晒票列表页
    });
  }
  return items;
}

/* ============================================================
   主流程
   ============================================================ */
const st = readState();
const now = Date.now();

/* 1. 退避期？ */
if (st.pausedUntil && now < st.pausedUntil) {
  const left = Math.ceil((st.pausedUntil - now) / 60000);
  log(`⏸  退避中（连续失败 ${st.failStreak} 轮），还剩 ${left} 分钟，本轮跳过`);
  st.skips = (st.skips || 0) + 1;
  writeState(st);
  process.exit(10);
}

log('—— 本轮开始 ——');
st.runs = (st.runs || 0) + 1;

/* 2. 逐个彩种抓（每个彩种 1 次请求，之间延时） */
const picked = [];
const seenImg = new Set();
const gameStat = [];

for (let gi = 0; gi < GAMES.length; gi++) {
  const g = GAMES[gi];
  if (gi > 0) await sleep(DELAY_MS);

  /* 单个彩种最多试 2 次：实测第一轮前两个请求偶发 ECONNRESET
     （同一批里的后几个请求都正常，属于源站瞬时拒连），重试一次基本就稳。 */
  let html = '';
  let err = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    html = '';
    err = '';
    try {
      const r = await fetch(ORIGIN + g.page, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Referer': ORIGIN + '/xysp'
        },
        signal: AbortSignal.timeout(25000)
      });
      if (!r.ok) err = 'HTTP ' + r.status;
      else html = await r.text();
    } catch (e) {
      err = String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 100);
    }
    if (!err) break;
    if (attempt === 1) { log(`   ↻ ${g.name} 第 1 次失败（${err}），1.5 秒后重试`); await sleep(1500); }
  }

  if (err) { gameStat.push(`${g.name} ✗(${err})`); continue; }

  let items = [];
  try { items = parsePage(html, g); }
  catch (e) { gameStat.push(`${g.name} ✗(解析异常)`); continue; }

  if (!items.length) { gameStat.push(`${g.name} ✗(0 条 / 结构变了)`); continue; }

  /* 源页本身就是新的在前，先按时间再排一遍保险 */
  items.sort((a, b) => b.t - a.t);

  let kept = 0;
  for (const it of items) {
    if (kept >= MAX_PER_GAME) break;
    if (picked.length >= MAX_TOTAL) break;
    if (seenImg.has(it.img)) continue;
    seenImg.add(it.img);
    picked.push(it);
    kept++;
  }
  gameStat.push(`${g.name} ${kept} 条`);
}

/* 3. 判定：8 个彩种【全失败】才算整轮失败 */
if (!picked.length) {
  st.failStreak = (st.failStreak || 0) + 1;
  log(`⚠️  本轮一条都没抓到：${gameStat.join(' · ')}`);
  log(`    连续失败 ${st.failStreak} 轮`);
  log('    保留上一次的 xysp-data.js（页面显示上一轮内容）');
  if (st.failStreak >= FAIL_PAUSE_AFTER) {
    st.pausedUntil = now + PAUSE_MINUTES * 60000;
    st.failStreak = 0;
    log(`🛑 连续失败达 ${FAIL_PAUSE_AFTER} 轮 → 暂停 ${PAUSE_MINUTES} 分钟（保护数据源）`);
  }
  st.skips = (st.skips || 0) + 1;
  st.lastRun = new Date().toISOString();
  writeState(st);
  process.exit(10);
}

/* 4. 成功（哪怕只抓到一部分）→ 全量排序 + 写文件 */
picked.sort((a, b) => b.t - a.t);

st.failStreak = 0;
st.pausedUntil = 0;
st.ok = (st.ok || 0) + 1;
st.lastRun = new Date().toISOString();
writeState(st);

/* 把只给排序用的内部字段去掉，再写文件 */
const items = picked.map((it) => ({
  game: it.game, gameName: it.gameName, img: it.img,
  title: it.title, author: it.author, time: it.time,
  imgFull: it.imgFull, url: it.url
}));
const data = { updated: stamp(), count: items.length, items };

const text =
  `/* ============================================================\n` +
  `   xysp-data.js —— 「晒票栏」数据（自动生成，请勿手动编辑）\n\n` +
  `   由 build-xysp.mjs 生成（每 30 分钟一次）。\n` +
  `   更新时间：${data.updated}\n` +
  `   共 ${data.count} 条。图片是外链缩略图（不下载、不内联）。\n` +
  `   ============================================================ */\n\n` +
  `const XYSP_DATA = ${JSON.stringify(data, null, 1)};\n`;
fs.writeFileSync(OUT, text, 'utf8');

log(`✅ 已写入 xysp-data.js（${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB）`);
gameStat.forEach((s) => log('   ' + s));
log(`   合计 ${data.count} 条 · 更新时间 ${data.updated}`);
log('—— 本轮结束（有新数据）——');
process.exit(0);
