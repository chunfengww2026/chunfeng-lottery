/* ============================================================
   build-articles.mjs —— 抓「文章参考」数据
   ------------------------------------------------------------
   抓什么：
     手机版专题页 https://m.yiqicai.com/spe （服务端渲染，标题全在；
     电脑版 /spe 是 JS 渲染，抓不到标题 —— 已实测）。

   页面真实结构（2026-10 实测）：
     <div class="expert-topic-content">
       <section class="cm-news">
         <h2 class="cm-default-tit"><a href="javascript:void(0);">双色球</a></h2>
         <div class="cm-news-list">
           <a href="/spe/ssq_mj">马姐双色球推荐</a>
           ...
         </div>
       </section>
       ... 共 5 个 section：双色球 / 大乐透 / 快乐8 / 福彩3D / 排列3
     </div>

   定位方式：
     · 彩种分类 = 每个 <section class="cm-news"> 里 <h2> 的文字
     · 标题 + 链接 = 该 section 里 <div class="cm-news-list"> 下的每个 <a>
     · 作者 = 从标题里剥掉结尾的「推荐/预测/技巧/分析/综合预测」和彩种名
       （如「马姐双色球推荐」→ 马姐）—— 页面本身没有独立的作者字段
     · 时间 = 该页不提供发布时间，date 留空字符串（有什么抓什么）

   产出：articles-data.js
     const ARTICLES_DATA = {
       updated: '2026-10-16 02:00',
       games: {
         ssq:  { name: '双色球', items: [ { title, url, author, date } ] },
         dlt:  { name: '大乐透', items: [ ... ] },
         fc3d: { name: '福彩3D', items: [ ... ] },
         pl3:  { name: '排列三', items: [ ... ] },
         kl8:  { name: '快乐8',  items: [ ... ] }
       }
     };

   安全 / 省成本：
     · 每轮只发【1 次】请求（这一页就是全部 5 个彩种的列表）
     · 正常手机 User-Agent；失败退避（照 update-football-smart.mjs 那套）
     · 抓不到不崩、也【不覆盖】上一次的 articles-data.js
     · 一律 UTF-8 无 BOM；不涉及任何 token

   退出码：
     0  = 抓到并写入了新的 articles-data.js（调用方可以继续出页面 + 同步）
     10 = 本轮跳过（退避中 / 抓取失败）—— 保留上一次的数据，调用方别同步
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'articles-data.js');
const LOG = path.join(ROOT, '_articles.log');
const STATE = path.join(ROOT, '_articles-backoff.json');

const SOURCE = 'https://m.yiqicai.com/spe';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* 每个彩种最多留几条（别太长；源页每彩种给 5 条） */
const MAX_PER_GAME = 8;

/* 失败退避（写法照 update-football-smart.mjs） */
const FAIL_PAUSE_AFTER = 6;    // 连续失败这么多次 → 暂停
const PAUSE_MINUTES = 120;     // 暂停时长（分钟）

/* 用户点名的 5 个彩种，顺序就是页面上的显示顺序 */
const GAME_DEFS = [
  { key: 'ssq',  name: '双色球', re: /双色球/ },
  { key: 'dlt',  name: '大乐透', re: /大乐透/ },
  { key: 'fc3d', name: '福彩3D', re: /福彩\s*3\s*D|3\s*D/i },
  { key: 'pl3',  name: '排列三', re: /排列\s*3|排列三/ },
  { key: 'kl8',  name: '快乐8',  re: /快乐\s*8/ }
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

/* ---------- 小工具 ---------- */
const stripTags = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/** 从标题推出作者名：剥掉结尾的「推荐/预测/技巧/分析…」和彩种名 */
function authorOf(title, gameName) {
  let s = String(title || '').trim();
  const SUFFIX = ['综合预测', '号码推荐', '号码预测', '推荐', '预测', '技巧', '分析', '杀号', '定胆', '精选'];
  for (const suf of SUFFIX) {
    if (s.length > suf.length && s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  const names = [gameName, '福彩3D', '福彩3d', '排列3', '排列三', '快乐8', '双色球', '大乐透', '3D', '3d']
    .filter(Boolean).sort((a, b) => b.length - a.length);
  for (const n of names) {
    if (s.length > n.length && s.endsWith(n)) { s = s.slice(0, -n.length); break; }
  }
  return s.trim();
}

/** 彩种名 → key（认不出来返回 ''） */
function gameKeyOf(name) {
  const hit = GAME_DEFS.find((g) => g.re.test(String(name || '')));
  return hit ? hit.key : '';
}

/* ============================================================
   抓取 + 解析
   ============================================================ */
function parseArticles(html) {
  const groups = {};
  GAME_DEFS.forEach((g) => { groups[g.key] = { name: g.name, items: [] }; });

  const SECTION_RE = /<section[^>]*class="[^"]*\bcm-news\b[^"]*"[^>]*>([\s\S]*?)<\/section>/g;
  let sec = null;
  while ((sec = SECTION_RE.exec(html)) !== null) {
    const body = sec[1];

    /* 彩种名：这个 section 里 <h2 …cm-default-tit…> 的文字 */
    const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(body);
    const gameName = h2 ? stripTags(h2[1]) : '';
    const key = gameKeyOf(gameName);
    if (!key) continue;

    /* 文章列表：<div class="cm-news-list"> 里的每个 <a> */
    const listM = /<div[^>]*class="[^"]*cm-news-list[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(body);
    const listHtml = listM ? listM[1] : body;

    const A_RE = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let a = null;
    while ((a = A_RE.exec(listHtml)) !== null) {
      const href = a[1];
      const title = stripTags(a[2]);
      if (!title) continue;
      if (!href || /^javascript:/i.test(href) || href === '#') continue;

      let url = '';
      try { url = new URL(href, SOURCE).href; } catch (e) { continue; }
      if (!/^https?:/i.test(url)) continue;

      if (groups[key].items.some((it) => it.url === url)) continue;   // 去重
      if (groups[key].items.length >= MAX_PER_GAME) continue;         // 每个彩种最多 8 条

      groups[key].items.push({
        title,
        url,
        author: authorOf(title, gameName),
        date: ''            /* 该页面没有发布时间，有什么抓什么 → 留空 */
      });
    }
  }
  return groups;
}

/* ============================================================
   主流程
   ============================================================ */
const st = readState();
const now = Date.now();

/* 1. 退避期？ */
if (st.pausedUntil && now < st.pausedUntil) {
  const left = Math.ceil((st.pausedUntil - now) / 60000);
  log(`⏸  退避中（连续失败 ${st.failStreak} 次），还剩 ${left} 分钟，本轮跳过`);
  st.skips = (st.skips || 0) + 1;
  writeState(st);
  process.exit(10);
}

log('—— 本轮开始 ——');
st.runs = (st.runs || 0) + 1;

/* 2. 抓（只 1 次请求） */
let html = '';
let err = '';
try {
  const r = await fetch(SOURCE, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://m.yiqicai.com/'
    },
    signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) err = 'HTTP ' + r.status;
  else html = await r.text();
} catch (e) {
  err = String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 120);
}

/* 3. 解析 + 判定 */
let groups = null;
let total = 0;
if (!err) {
  try {
    groups = parseArticles(html);
    total = Object.values(groups).reduce((n, g) => n + g.items.length, 0);
  } catch (e) {
    err = '解析异常 ' + String(e.message).slice(0, 120);
  }
}
if (!err && total === 0) err = '页面结构变了 / 一条都没解析到（HTML ' + Buffer.byteLength(html, 'utf8') + ' B）';

if (err) {
  st.failStreak = (st.failStreak || 0) + 1;
  log(`⚠️  抓取失败：${err} · 连续失败 ${st.failStreak} 次`);
  log('    保留上一次的 articles-data.js（页面显示上一轮内容）');
  if (st.failStreak >= FAIL_PAUSE_AFTER) {
    st.pausedUntil = now + PAUSE_MINUTES * 60000;
    st.failStreak = 0;
    log(`🛑 连续失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停 ${PAUSE_MINUTES} 分钟（保护数据源）`);
  }
  st.skips = (st.skips || 0) + 1;
  st.lastRun = new Date().toISOString();
  writeState(st);
  process.exit(10);
}

/* 4. 成功 → 写文件 */
st.failStreak = 0;
st.pausedUntil = 0;
st.ok = (st.ok || 0) + 1;
st.lastRun = new Date().toISOString();
writeState(st);

const data = { updated: stamp(), games: groups };
const text =
  `/* ============================================================\n` +
  `   articles-data.js —— 「文章参考」数据（自动生成，请勿手动编辑）\n\n` +
  `   由 build-articles.mjs 生成。\n` +
  `   更新时间：${data.updated}\n` +
  `   ============================================================ */\n\n` +
  `const ARTICLES_DATA = ${JSON.stringify(data, null, 1)};\n`;
fs.writeFileSync(OUT, text, 'utf8');

log(`✅ 已写入 articles-data.js（${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB）`);
GAME_DEFS.forEach((g) => {
  const items = groups[g.key].items;
  log(`   ${g.name.padEnd(6)} ${String(items.length).padStart(2)} 条` +
    (items.length ? ` · 例：${items[0].title}` : ' · ⚠️ 一条都没抓到'));
});
log(`   合计 ${total} 条 · 更新时间 ${data.updated}`);
log('—— 本轮结束（有新数据）——');
process.exit(0);
