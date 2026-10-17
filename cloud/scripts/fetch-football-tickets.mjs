/* ============================================================
   fetch-football-tickets.mjs —— 抓「竞彩足球晒票 / 实单」票面图，产出 football-tickets.js
   ------------------------------------------------------------
   用户原话：「做足球晒票/晒单实时抓取」（Python 参考给了 3 个源，要求先探测再写）

   【第 0 步探测结论】（2026-10-18，本机 + 云端美国 IP 各实测一轮）：
     ┌──────────────────────┬─────────────────────┬──────────────────────┐
     │ 源                   │ 本机                │ 云端（美国 eastus）  │
     ├──────────────────────┼─────────────────────┼──────────────────────┤
     │ 33633 竞彩（本文件用）│ ✅ 200 / 70 KB      │ ❌ 405（阿里云 WAF） │
     │ 懂球帝               │ ⚠️ 200 但纯 JS 空壳 │ ❌ 403 Forbidden     │
     │ 头条搜索             │ ⚠️ 200 但 0 条结果  │ ⚠️ 200 但 0 条结果   │
     └──────────────────────┴─────────────────────┴──────────────────────┘
     ⇒ 只有「竞彩实票」这一个源真能抓到内容，而且【只在本机能抓】。
       所以本文件的定位和 build-xysp.mjs 完全一样：
         【本机抓】→ 写 football-tickets.js → 跟着 sync 上云 → 云端只渲染不抓。
       云端那一班调用本文件会拿到 405，脚本按「抓不到就跳过」退 10，
       绝不覆盖上一次的数据（页面照旧用同步上去的那份）。

   【为什么头条/懂球帝不能用】（都实测过，别再试）
     · 头条搜索 so.toutiao.com：200、1.4 MB，但 HTML 里【0 条结果】
       （abstract / article_url / image_url 字段出现 0 次，可见正文 70 字节），
       结果是浏览器里 JS 二次请求 tsearch.toutiaoapi.com 才有的 → 服务端拿不到。
     · 懂球帝 m.dongqiudi.com：200、262 KB，同样 JS 空壳（0 张图、正文 563 字节）；
       云端更直接 403 Forbidden。

   【票面图：只存外链，不下载】
     图床实测：不带 Referer / 带本站 / 带 github.io 三种都是 200 + image/webp，
     字节数完全一样（32 KB）→ 没有防盗链，页面直接 <img src="外链"> 就行。
     缩略参数（?imageMogr2/thumbnail/360x）这家不支持（字节数不变）→ 不拼。

   【标题：一律中性化，页面不能出现任何站名】
     源站每条票的标题就是「昵称 + 第N期 + 某某实票 + 站名」，直接搬会把站名带上页。
     所以这里【不搬原标题】，自己拼一个中性标题：`20261017期 · 10-17 21:28`。
     昵称也不进标题（昵称同样是用户自由填的，可能带站名）。
     SITE_WORDS 那一步是第二道保险：万一以后改了拼法，也会把站名洗掉。

   产出 football-tickets.js：
     window.FB_TICKETS = [ { source, title, url, image_url, published_at, fetched_at } ];
     window.FB_TICKETS_UPDATED = '2026-10-18 06:30';

   去重 / 滚动窗口：
     · key = md5(source|url|image_url)，存进 _football-tickets-state.json 的 seen
     · 只保留【最新 60 条】，按 published_at 倒序
     · 超过 KEEP_DAYS 天的丢掉

   退出码：
     0  = 抓到并写了新的 football-tickets.js
     10 = 本轮跳过（抓不到 / 全失败）—— 保留上一次的数据，调用方别同步
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'football-tickets.js');
const STATE = path.join(ROOT, '_football-tickets-state.json');
const LOG = path.join(ROOT, '_football-tickets.log');

const MAX_ITEMS = 60;      /* 页面只放最新 60 条（滚动窗口，防止无限增长） */
const KEEP_DAYS = 7;       /* 超过 7 天的票不再留着 */
const SEEN_MAX = 3000;     /* seen 集合上限，防止状态文件膨胀 */
const MAX_FAIL = 6;        /* 连续 6 轮全失败 → 停 2 小时（照 update-football-smart.mjs 那套） */

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* 竞彩实票列表页。两种排序各 20 条、交集 10 条 → 并集 30 条，一趟拿满。
   实测没有分页（?page=2 返回同一页），所以别去拼页码。 */
const PAGES = [
  { name: 'jingcai', url: 'https://m.33633.cn/jingcai/' },
  { name: 'jingcai-hot', url: 'https://m.33633.cn/jingcai?sort=0' },
];

/* 站名 / 域名 —— 标题里出现就洗掉（第二道保险，页面铁律：不能出现站名） */
const SITE_WORDS = [
  '牛票票', '33633', 'niupiaopiao', '懂球帝', 'dongqiudi', '今日头条', '头条',
  'toutiao', '彩宝网', '天齐网', '宝彩网', '一起彩', 'yiqicai', 'cpyc', '8300',
];

const log = (...a) => {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch { }
};

function md5(s) { return crypto.createHash('md5').update(s, 'utf8').digest('hex'); }
function unesc(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
const stripTags = (s) => unesc(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/* 站名中性化：能整段删的就删，剩下的把域名换掉 */
function neutral(s) {
  let t = stripTags(s);
  for (const w of SITE_WORDS) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    t = t.replace(re, ' ');
  }
  return t.replace(/\s+/g, ' ').replace(/^[\s·\-—|,，、]+|[\s·\-—|,，、]+$/g, '').trim();
}

/* 本地时间 → 'YYYY-MM-DDTHH:mm:ss+08:00'（北京时间；源站就是北京时间） */
function iso(bj) { return bj ? bj.replace(' ', 'T') + ':00+08:00' : ''; }

/* ---------- 解析一页 ---------- */
function parsePage(html, pageName, nowMs) {
  const out = [];
  /* 每条 = <div class="item"> … 下一个 item / 页尾之前 */
  const chunks = html.split('<div class="item">');
  chunks.shift();                       /* 第一段是 item 之前的内容 */

  for (const raw of chunks) {
    /* ① 详情链接（票的详情页） */
    const mTopic = /href="(\/topic\/(\d+)\.html)"/.exec(raw);
    if (!mTopic) continue;
    const rel = mTopic[1], topicId = mTopic[2];

    /* ② 票面图：只认 .img_wrap 里的第一张（头像在 .userinfo 里，不在这里，
          所以不会把头像当票面图） */
    const mWrap = /<div class="img_wrap[^"]*">([\s\S]*?)<\/div>/.exec(raw);
    if (!mWrap) continue;
    const mImg = /<img\b[^>]*?(?:data-src|data-original|src)="([^"]+)"/i.exec(mWrap[1]);
    if (!mImg) continue;
    const imageUrl = unesc(mImg[1]).trim();
    if (!/^https?:\/\//i.test(imageUrl)) continue;

    /* ③ 描述行：<p class="detail"><span>竞彩</span><span>20261017期</span><span>10-17 21:28</span></p>
          —— 玩法 / 期号 / 发布时间 */
    const spans = [];
    const mDetail = /<p class="detail">([\s\S]*?)<\/p>/.exec(raw);
    if (mDetail) {
      const re = /<span[^>]*>([\s\S]*?)<\/span>/g;
      let m;
      while ((m = re.exec(mDetail[1]))) { const v = stripTags(m[1]); if (v) spans.push(v); }
    }
    const kind = spans[0] || '竞彩';
    const issue = spans.find((s) => /^\d{6,8}期$/.test(s)) || '';
    const timeStr = spans.find((s) => /^\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}$/.test(s)) || '';

    /* ④ 发布时间：期号给【年】，描述行给【月-日 时:分】→ 拼出完整北京时间。
          期号缺失时退回「今年」。（源站不给年份，这是唯一可靠的办法） */
    let pubBj = '';
    const mTime = /^(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(timeStr);
    if (mTime) {
      const mm = String(mTime[1]).padStart(2, '0');
      const dd = String(mTime[2]).padStart(2, '0');
      const hh = String(mTime[3]).padStart(2, '0');
      const mi = mTime[4];
      let year = '';
      const mIssue = /^(\d{4})(\d{2})(\d{2})期$/.exec(issue);
      if (mIssue) year = mIssue[1];
      if (!year) {
        /* 没期号：用今年的年份；但如果这个月-日在未来 3 天以上，说明是去年的（跨年） */
        const y = new Date(nowMs + 8 * 3600e3).getUTCFullYear();
        year = String(y);
        const guess = Date.parse(`${year}-${mm}-${dd}T${hh}:${mi}:00+08:00`);
        if (isFinite(guess) && guess - nowMs > 3 * 86400e3) year = String(y - 1);
      }
      pubBj = `${year}-${mm}-${dd} ${hh}:${mi}`;
    }

    /* ⑤ 中性标题：绝不搬原标题（原标题带站名）。期号 + 时间就是最好的中性描述。 */
    const parts = [];
    if (issue) parts.push(issue);
    if (timeStr) parts.push(timeStr);
    const title = neutral(parts.join(' · ')) || '竞彩实票';

    out.push({
      source: 'fb',
      title,
      url: 'https://m.33633.cn' + rel,
      image_url: imageUrl,
      published_at: iso(pubBj),
      fetched_at: new Date(nowMs).toISOString(),
      /* 下面两个只在内部排序/去重用，写文件时去掉 */
      _kind: neutral(kind),
      _pubMs: pubBj ? Date.parse(pubBj.replace(' ', 'T') + ':00+08:00') || 0 : 0,
      _page: pageName,
      _topic: topicId,
    });
  }
  return out;
}

/* ---------- 读上一次的产出（抓不到时保留它） ---------- */
function readOld() {
  try {
    const s = fs.readFileSync(OUT, 'utf8');
    const m = /var FB_TICKETS = (\[[\s\S]*?\]);/.exec(s) || /window\.FB_TICKETS\s*=\s*(\[[\s\S]*?\]);/.exec(s);
    return m ? JSON.parse(m[1]) : [];
  } catch { return []; }
}
function readState() {
  try { const j = JSON.parse(fs.readFileSync(STATE, 'utf8')); return { seen: j.seen || {}, fails: j.fails || 0, coolUntil: j.coolUntil || 0 }; }
  catch { return { seen: {}, fails: 0, coolUntil: 0 }; }
}
function writeState(st) {
  fs.writeFileSync(STATE, JSON.stringify({
    updated: new Date().toISOString(),
    fails: st.fails, coolUntil: st.coolUntil,
    seen: st.seen,
  }, null, 0), 'utf8');
}

/* ---------- 主流程 ---------- */
async function main() {
  const nowMs = Date.now();
  const st = readState();

  /* 退避中：直接跳过，别去撞墙 */
  if (st.coolUntil && nowMs < st.coolUntil) {
    const left = Math.round((st.coolUntil - nowMs) / 60000);
    log(`跳过：退避中，还有 ${left} 分钟（连续失败 ${st.fails} 轮）`);
    process.exit(10);
  }

  const got = [];
  let okPages = 0;
  for (const pg of PAGES) {
    try {
      const r = await fetch(pg.url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': 'https://m.33633.cn/',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) { log(`${pg.name}: HTTP ${r.status}（云端常见 405 WAF）`); continue; }
      const html = await r.text();
      const items = parsePage(html, pg.name, nowMs);
      log(`${pg.name}: HTTP 200 · ${Buffer.byteLength(html)} 字节 · 解析出 ${items.length} 条`);
      if (items.length) { okPages++; got.push(...items); }
      await new Promise((res) => setTimeout(res, 1200));   /* 两个页之间停 1.2s，别打太急 */
    } catch (e) {
      log(`${pg.name}: FAIL ${e.name === 'TimeoutError' ? '超时' : e.message}`);
    }
  }

  if (!okPages) {
    st.fails = (st.fails || 0) + 1;
    if (st.fails >= MAX_FAIL) { st.coolUntil = nowMs + 2 * 3600e3; st.fails = 0; log('连续全失败，退避 2 小时'); }
    writeState(st);
    log(`本轮抓不到任何条目 → 跳过（保留上一次 ${OUT} 不动，退出码 10）`);
    process.exit(10);
  }
  st.fails = 0; st.coolUntil = 0;

  /* 合并：上一轮的 + 这一轮的，按 key 去重（同一条票两轮都出现 → 只留一条，取最早的 fetched_at） */
  const old = readOld();
  const map = new Map();   /* key → item */
  const keyOf = (it) => md5(`fb|${it.url}|${it.image_url}`);

  /* 合并规则（⚠️ 这里踩过一次坑，写清楚）：
       ① 上一轮窗口里的票【无条件保留】—— 它们是"已经在页面上"的，
          不能因为 seen 里有记录就丢掉（第一版就是把 seen 当过滤器用，
          结果窗口里的 30 条全被自己挡掉，写出 0 条）。
       ② 本轮新抓的：已在窗口里 → 合并（升级发布时间、保留最早的 fetched_at）；
          不在窗口里、但 seen 里【有】→ 说明它早就滚出窗口了，不再捡回来；
          都没有 → 新增。
       ③ seen 的职责只有一个：【别把滚出去的老票又捡回来】。 */
  const putOld = (it) => {
    const k = keyOf(it);
    const cur = map.get(k);
    if (!cur) { map.set(k, it); return; }
    if ((it._pubMs || 0) > (cur._pubMs || 0)) { cur._pubMs = it._pubMs; cur.published_at = it.published_at; cur.title = it.title; }
    if (it.fetched_at && (!cur.fetched_at || it.fetched_at < cur.fetched_at)) cur.fetched_at = it.fetched_at;
  };
  const putNew = (it) => {
    const k = keyOf(it);
    if (map.has(k)) { putOld(it); return; }   /* 已在窗口里 → 合并 */
    if (st.seen[k]) return;                   /* 滚出过窗口的老票 → 不再捡回来 */
    map.set(k, it);
  };

  /* ① 上一轮窗口里的票：全部保留（带上 _pubMs，老文件没这个字段就从 published_at 反推） */
  for (const it of old) {
    if (!it || !it.url || !it.image_url) continue;
    const pubMs = Date.parse(it.published_at || '') || 0;
    putOld({ ...it, source: it.source || 'fb', _pubMs: pubMs, _kind: '竞彩', _page: 'old', _topic: '' });
  }
  /* ② 本轮新抓的 */
  for (const it of got) putNew(it);

  /* 过滤：超过 KEEP_DAYS 天的丢掉 */
  const cutoff = nowMs - KEEP_DAYS * 86400e3;
  let items = [...map.entries()]
    .filter(([, it]) => !it._pubMs || it._pubMs >= cutoff)
    .map(([k, it]) => ({ k, it }));

  /* 排序：新票在前（published_at 倒序；同一时间按抓到的顺序） */
  items.sort((a, b) => (b.it._pubMs || 0) - (a.it._pubMs || 0));

  const kept = items.slice(0, MAX_ITEMS);

  /* seen 只记【落选的老票】，越靠前越新 —— 超过 SEEN_MAX 就砍掉最老的 */
  const seenList = Object.entries(st.seen).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, SEEN_MAX);
  st.seen = Object.fromEntries(seenList);
  for (const { k } of kept) st.seen[k] = (st.seen[k] || 0) || nowMs;

  /* 写文件：去掉内部字段 */
  const clean = kept.map(({ it }) => ({
    source: it.source || 'fb',
    title: neutral(it.title) || '竞彩实票',
    url: String(it.url || ''),
    image_url: String(it.image_url || ''),
    published_at: String(it.published_at || ''),
    fetched_at: String(it.fetched_at || ''),
  }));

  if (!clean.length) {
    writeState(st);
    log('过滤后 0 条 → 跳过（不动旧文件，退出码 10）');
    process.exit(10);
  }

  const stamp = new Date(nowMs + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  /* ⚠️【为什么要写两遍】页面侧要的是 window.FB_TICKETS（用户给的格式），
     但 export-football.mjs 的 loadVar() 是把文件丢进 node 的 vm 里跑、
     再取 `globalThis.FB_TICKETS` —— vm 里【没有 window】，
     只写 window.FB_TICKETS 会 "window is not defined" → 整块读不到。
     所以：先定义裸变量（vm 认这个），再挂到 window 上（浏览器认那个）。 */
  const body =
    '/* 足球晒票 · 票面图外链（本机抓，云端只渲染不抓）\n' +
    '   ⚠️ 页面不出现任何出处字样；标题一律中性化（见 fetch-football-tickets.mjs） */\n' +
    'var FB_TICKETS = ' + JSON.stringify(clean, null, 0) + ';\n' +
    "var FB_TICKETS_UPDATED = '" + stamp + "';\n" +
    "if (typeof window !== 'undefined') {\n" +
    '  window.FB_TICKETS = FB_TICKETS;\n' +
    '  window.FB_TICKETS_UPDATED = FB_TICKETS_UPDATED;\n' +
    '}\n';
  fs.writeFileSync(OUT, body, 'utf8');
  writeState(st);

  log(`✅ 写入 ${path.basename(OUT)}：${clean.length} 条（本轮新增 ${got.length} 条原始 / 窗口 ${MAX_ITEMS}）`);
  clean.slice(0, 3).forEach((it, i) => log(`   [${i}] ${it.title} | ${it.image_url.slice(0, 90)}`));
}

main().catch((e) => { log('❌ 未捕获异常：' + (e && e.stack || e)); process.exit(10); });
