/* ============================================================
   fetch-community-topics.mjs —— 「社区热点」话题抓取（标题 + 时间 + 链接 + 正文）
   ------------------------------------------------------------
   用户原话（2026-10-21）：
     「我要免费抓取到其他网址的聊天分享信息」
     · 标题 + 时间 + 链接 → 当「社区热点」展示，最多 10 条
   用户后续（2026-10-21，第二轮）：
     「足球社区点不开资料」「我要别人自己发的图」
     → 用户澄清：【要帖子本身】= 别人在社区发的消息 + 截图，【不是】回复列表。
     → 所以【每条 topic 再抓一次帖子页】：
          · 正文文字（去标签，截前 500~800 字）
          · 正文里别人发的图（只【数张数】，不渲染 <img>：实测防盗链 403）
     · 【不抓回复/评论】【不抓评论里的图】（用户明确：评论 = 0）

   用户 2026-10-21（第三轮，最终定位）：
     「社区不抓中超国内的比赛消息」「主要抓接下来比赛竞彩的消息」
     → ① 主源全部换成【国际足球】板块（中国足球板块停用）
        ② 标题黑名单硬过滤（DOMESTIC：中超/中甲/足协杯/国足/亚冠 + 国内队名球员名）
        ③ 用 football.js 里「接下来比赛」的队名 + 竞彩信号词给每条打分、分数高的排前面
        ④ 超过 7 天的帖子整条丢掉，超过 48 小时的降权
   产物：community-topics.json
     { updated: '…', topics: [ { t, d, u, body, nimg, imgs }, … ] }   // 最多 20 条
       body = 正文纯文字（已按 source-guard 词表清过）· 抓不到 → ''（保留标题，不编）
       nimg = 正文里图片张数（页面只写「含 N 张图」）· imgs = 前 5 个图片地址（留档，不上页面）

   【图片防盗链 · 2026-10-21 实测，都做了】
     node fetch 不带 Referer      → HTTP 200
     node fetch 带第三方 Referer  → HTTP 403
     headless Chrome(本地 http 站) 里 <img src>        → HTTP 403（naturalWidth 0，显示不出来）
     同一个站里 <img referrerpolicy="no-referrer">     → 照样 403
     → 结论：【浏览器里显不出来】。所以页面【不放 <img>】，只写「[图] ×N」。

   【已实测的源】（2026-10-21 本机 plain fetch，无浏览器、无登录）
     ✅ 虎扑 · 足球话题区 bbs.hupu.com/topic       HTTP 200 · 50 条（国际话题最多，主源）
     ✅ 虎扑 · 巴萨专区   bbs.hupu.com/barcelona   HTTP 200 · 50 条（赛前讨论，贴近「接下来比赛」）
     ✅ 虎扑 · 皇马专区   bbs.hupu.com/realmadrid  HTTP 200 · 50 条（同上）
     ✅ 虎扑 · 足球场     bbs.hupu.com/soccer      HTTP 200 · 49 条（综合，含少量灌水）
     ✅ 新浪体育 国际足球 sports.sina.com.cn/global/ HTTP 200 · 120 条（新闻标题+链接，时间只有日期）
     ⛔ 虎扑 · 中国足球   bbs.hupu.com/china-soccer HTTP 200 · 49 条 —— 但【全是国内】，用户不要，已 on:false
     ⛔ 虎扑 · 国际足球版 bbs.hupu.com/all-soccer   HTTP 200 但列表是前端渲染的，HTML 里 0 条
     ⛔ premier / laliga / seriea / bundesliga / ligue1 / champions / worldfootball —— 都是
        「虎扑社区-虎扑网」落地页（268 KB、0 条），不是板块列表
     ❌ 贴吧足球吧 tieba.baidu.com/f?kw=足球          HTTP 403「百度安全验证」（反爬，换 UA/Referer/手机页都一样）
     ❌ 500 论坛   bbs.500.com                      DNS 都解析不到（ENOTFOUND，这个子站已经没了）
     ❌ 懂球帝     www.dongqiudi.com                HTTP 200 但列表是前端 JS 渲染的，HTML 里没有条目
     ❌ 网易体育   sports.163.com                   HTTP 200（1.8 MB），时间与标题对不齐，解析不可靠

   【行事原则】
     · 抓不到 → 【不写文件】→ 页面上还是上一次的好数据（绝不写空文件覆盖）
     · 多源能抓几个就合几个，按标题去重；排序 = 接下来比赛相关度 → 时间
     · 纯 HTTP，云端（美国 IP）也能跑；贴吧/500 就算抓不到也不影响其他源
     · 补正文是【串行 2 并发 + 200ms 间隔】：实测 3 并发太猛会被限流（返回 16 KB 空壳）

   用法：
     node fetch-community-topics.mjs              本机：抓一轮（失败重试 3 轮）
     node fetch-community-topics.mjs --cloud      云端：纯 HTTP，重试 5 轮 / 8 分钟封顶
     node fetch-community-topics.mjs --once       只抓 1 轮
     node fetch-community-topics.mjs --no-body    只抓标题+时间+链接（不补正文，快）
     node fetch-community-topics.mjs --probe      只探源（打印每个源 200/403/404），不写文件
   退出码：0 已写入 · 1 本轮全失败（保留旧文件）· 2 超时
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'community-topics.json');

const A = process.argv.slice(2);
const has = (f) => A.includes(f);
const numOf = (f, d) => {
  const hit = A.find((x) => x.startsWith(f + '='));
  const v = hit ? Number(hit.split('=')[1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : d;
};
const CLOUD = has('--cloud');
const PROBE = has('--probe');
const ONCE = has('--once');
const NOBODY = has('--no-body');
const ROUNDS = ONCE ? 1 : numOf('--rounds', CLOUD ? 5 : 3);
const GAP = numOf('--interval', CLOUD ? 20 : 8);          /* 轮间隔（秒） */
const TIMEOUT = numOf('--timeout', CLOUD ? 480 : 240);    /* 进程硬上限（秒） */

const t0 = Date.now();
const el = () => Math.round((Date.now() - t0) / 1000);
const log = (...a) => console.log('[社区 ' + el() + 's]', ...a);

const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const UA_MB = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* ---------- 通用抓取 ---------- */
async function grab(url, { ua = UA_PC, referer = '', ms = 18000 } = {}) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        'user-agent': ua,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...(referer ? { referer } : {}),
      },
    });
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: r.status === 200, status: r.status, html: buf.toString('utf8'), bytes: buf.length };
  } catch (e) {
    const code = e && e.cause ? String(e.cause.code || e.cause.message) : String(e.message || e);
    return { ok: false, status: 0, html: '', bytes: 0, err: code.slice(0, 40) };
  } finally { clearTimeout(tm); }
}

/* ---------- 标题清洗（用户要求：去掉网址、去掉「来源」字样） ---------- */
function cleanTitle(s) {
  let t = String(s == null ? '' : s);
  t = t.replace(/<[^>]*>/g, ' ');                                  /* 兜底去标签 */
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, ' ');
  t = t.replace(/(?:https?:\/\/|www\.)\S+/gi, ' ');                /* 去掉网址 */
  t = t.replace(/[（(【\[]?\s*(?:来源|取自|转自|原帖|via)\s*[:：]?\s*[^）)】\]]{0,20}[）)】\]]?/gi, ' ');  /* 去掉「来源：xxx」 */
  t = t.replace(/^(?:虎扑|贴吧|百度贴吧|新浪|新浪体育|网易|懂球帝|500)\s*[:：]?\s*/i, '');                  /* 开头的站名 */
  t = t.replace(/^(?:\[流言板\]|【流言板】|\[视频\]|【视频】|\[图\]|【图】|【多图】|\[多图\])\s*/g, '');      /* 论坛自带的栏目标签 */
  t = t.replace(/^[\s·・\-—|｜:：]+|[\s·・\-—|｜:：]+$/g, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t.slice(0, 60);
}

/* 【标题准入门槛】页面上不能出现站名 / 「来源」类字样（项目有 source-guard.mjs 的
   「数据源留痕断言」，可见文本里出现就会让整页构建失败）。
   抓到的标题里偶尔会带品牌词 → 这一条【整条丢掉】，不硬改（标题改了就变味了）。
   反正一次能抓两三百条，丢几条不影响。 */
const BANNED = /虎扑|贴吧|百度|新浪|网易|懂球帝|500|头条|一起彩|球探|雷速|titan007|okooo|sporttery|Betfair|必发|来源|取自|来自|数据源|接口|抓取|爬取|7m\b|17ch|245qq|bf_jc|\.js\b|https?:\/\//i;
function allowed(t) {
  return !!t && !BANNED.test(t);
}

/* 时间 → 毫秒（支持 "10-13 07:56" / "2026-10-20 09:48:59" / "3 小时前"） */
function toTs(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return 0;
  const now = Date.now();
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
  m = s.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (m) {
    const d = new Date(new Date().getFullYear(), +m[1] - 1, +m[2], +m[3], +m[4], 0);
    let ts = d.getTime();
    if (ts - now > 7 * 86400000) ts -= 365 * 86400000;            /* 跨年：12-31 的帖子在 1 月看 */
    return ts;
  }
  m = s.match(/(\d+)\s*分钟前/); if (m) return now - +m[1] * 60000;
  m = s.match(/(\d+)\s*小时前/); if (m) return now - +m[1] * 3600000;
  m = s.match(/(\d+)\s*天前/);   if (m) return now - +m[1] * 86400000;
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0).getTime();
  m = s.match(/(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(new Date().getFullYear(), +m[1] - 1, +m[2], 12, 0, 0);
    let ts = d.getTime();
    if (ts - now > 7 * 86400000) ts -= 365 * 86400000;
    return ts;
  }
  return 0;
}

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ---------- 解析：虎扑论坛列表页 ----------
   <li class="bbs-sl-web-post-body"> … <a href="/642646531.html" class="p-title">标题</a>
       … <div class="post-time">10-13 07:56</div> … </li>  */
function parseHupu(html, base) {
  const out = [];
  const lis = html.split(/<li class="bbs-sl-web-post-body"/).slice(1);
  for (const chunk of lis) {
    const a = chunk.match(/<a\s+href="(\/[0-9]+\.html)"[^>]*class="p-title"[^>]*>([\s\S]*?)<\/a>/);
    const tm = chunk.match(/<div class="post-time">([^<]*)<\/div>/);
    if (!a) continue;
    const t = cleanTitle(a[2]);
    if (t) out.push({ t, d: tm ? tm[1].trim() : '', u: base + a[1] });
  }
  return out;
}

/* ---------- 解析：新浪体育频道页 ----------
   <a href="https://sports.sina.com.cn/l/2026-10-20/doc-xxxx.shtml">标题</a>
   时间只能从链接里的日期取（频道页不显示时分） */
function parseSina(html) {
  const out = [];
  const re = /<a[^>]+href="(https?:\/\/[a-z0-9.]*sina\.com\.cn[^"]*?(?:doc-[a-z0-9]+|\/\d{4}-\d{2}-\d{2}\/[^"]*?)\.shtml)[^"]*"[^>]*>([\s\S]{4,80}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1];
    const t = cleanTitle(m[2]);
    if (!t || t.length < 6) continue;
    const dm = u.match(/(\d{4}-\d{2}-\d{2})/);
    out.push({ t, d: dm ? dm[1] : '', u });
    if (out.length >= 120) break;
  }
  return out;
}

/* ============================================================
   ② 帖子页：正文 + 正文图片张数
   ------------------------------------------------------------
   虎扑帖子页（bbs.hupu.com/<id>.html）的正文在：
     <div class="post-content_main-post-info__…">
       <div class="index_bbs-thread-comp__…">
         <div class="thread-content-detail">正文…</div>
         <div class="seo-dom">正文…（一模一样的一份复制品，别抓这段）</div>
   ⚠️ 两个坑（都实测踩过）：
     1) 正文开头常直接是 <p><div data-hupu-node="image"><p><img…>，
        用「切到第一个 </div>」会把正文切没 → 必须【按 div 深度配平】取整块。
     2) 少数帖子正文就是 <p></p>（只有标题）→ body 留空，【不编】。
   回复列表（post-reply-list / .post-reply-list-container）【一个字都不抓】。
   ============================================================ */

/* 按 div 深度配平：从 startIdx 的 <div …> 开始，返回它这一整块（含自身） */
function divSlice(html, startIdx) {
  if (startIdx < 0) return '';
  let depth = 0;
  const re = /<div\b[^>]*>|<\/div\s*>/gi;
  re.lastIndex = startIdx;
  let m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') {
      depth--;
      if (depth === 0) return html.slice(startIdx, m.index + m[0].length);
    } else depth++;
  }
  return html.slice(startIdx);
}

/* 去标签 → 纯文字（保留段落换行） */
function plainText(s) {
  return String(s == null ? '' : s)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { const n = parseInt(h, 16); return n >= 32 && n < 65536 ? String.fromCharCode(n) : ' '; })
    .replace(/&#(\d+);/g, (m, d) => { const n = +d; return n >= 32 && n < 65536 ? String.fromCharCode(n) : ' '; })
    .replace(/&[a-z]+;/gi, ' ');
}

/* 正文里「能上页面」的过滤：站名 / 「来源」/ 网址 / 接口 一个字都不能留
   （source-guard 扫【可见文本】，命中就整页构建失败） */
const BODY_BAD = /虎扑|贴吧|百度|新浪|网易|懂球帝|500|头条|一起彩|球探|雷速|titan007|okooo|sporttery|Betfair|必发|来源|取自|来自|数据源|接口|接入|抓取|爬取|爬楼|https?:\/\/|www\.|\bAPI\b/i;

/* 开头那句「虎扑10月20日讯」是发帖日期口吻，把站名去掉、保留「10月20日讯」 */
const DATELINE = /^\s*(?:虎扑|新浪|网易)\s*(\d{1,2}\s*月\s*\d{1,2}\s*日[讯电])/;

/* 正文截断：500~800 字，尽量切在句号处 */
function clipBody(s, max = 700, min = 380) {
  if (!s) return '';
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const cut = Math.max(head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'), head.lastIndexOf('\n'));
  return (cut >= min ? head.slice(0, cut + 1) : head).trim() + '…';
}

/* 正文清洗：逐行过滤（有站名/来源/网址的整行丢掉）+ 去掉空行/重复行 */
function cleanBody(raw) {
  const lines = plainText(raw)
    .split('\n')
    .map((L) => L.replace(/\s+/g, ' ').trim())
    .map((L) => L.replace(DATELINE, '$1'))
    .filter((L) => L && !BODY_BAD.test(L));
  const out = [];
  for (const L of lines) if (out[out.length - 1] !== L) out.push(L);
  return clipBody(out.join('\n'));
}

/* 正文块里的图片（只收真图，头像/表情/占位图不算；协议相对 // 补成 https） */
function imgsOf(block) {
  const imgs = [];
  const ire = /<img[^>]*\s(?:data-origin|src)="([^"]+)"/gi;
  let m;
  while ((m = ire.exec(block))) {
    let u = m[1];
    if (u.startsWith('//')) u = 'https:' + u;
    if (!/^https?:\/\//i.test(u)) continue;
    if (/def_man|avatar|placeholder|emoticon|\/games\/images\//i.test(u)) continue;
    if (/\.svg(?:[?#]|$)/i.test(u)) continue;
    if (!imgs.includes(u)) imgs.push(u);
  }
  return imgs.slice(0, 5);
}

/* 从整页 HTML 里取「主楼正文 + 主楼图片」；取不到 → 全空（保留标题，不编）
   两个版式都支持：
     ① 论坛帖子页   <div class="thread-content-detail">
     ② 体育文章页   <div class="article" id="artibody">（新浪那种，标题是新闻标题） */
function extractPost(html) {
  const re = /<div[^>]*class="[^"]*thread-content-detail[^"]*"[^>]*>/gi;
  const anchor = html.indexOf('post-content_main-post-info');
  let start = -1;
  if (anchor >= 0) { re.lastIndex = anchor; const m = re.exec(html); if (m) start = m.index; }
  if (start < 0) { re.lastIndex = 0; const m = re.exec(html); if (m) start = m.index; }  /* 老版式：没有 main-post-info 锚点 */
  if (start < 0) {
    const ai = html.indexOf('id="artibody"');
    if (ai >= 0) { const open = html.lastIndexOf('<div', ai); if (open >= 0) start = open; }
  }
  if (start < 0) return { body: '', imgs: [] };

  const block = divSlice(html, start);
  return { body: cleanBody(block), imgs: imgsOf(block) };
}

/* 补正文：并发 2 + 每条间隔 200ms（并发太猛会被限流，实测 3 并发时虎扑偶尔回 16 KB 空壳），
   单条 10s 上限，整体预算封顶（超了就不补，保留标题）。 */
async function fillBodies(topics) {
  if (NOBODY) { log('（--no-body：本轮不补正文）'); return; }
  const CONC = CLOUD ? 3 : 2;
  const deadline = Date.now() + (CLOUD ? 150 : 90) * 1000;
  let done = 0, ok = 0, imgs = 0;
  const tBody = Date.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* 页面偶尔返回半截（10~16 KB 空壳 = 被限流）→ 最多试 3 次，退避 800ms 起，UA 轮换 */
  const one = async (it) => {
    for (let k = 0; k < 3; k++) {
      if (Date.now() > deadline) return;
      if (k) await sleep(800 * k);
      const r = await grab(it.u, { ua: k % 2 ? UA_MB : UA_PC, referer: 'https://www.baidu.com/', ms: 12000 });
      if (!r.ok || r.html.length < 20000) continue;
      const got = extractPost(r.html);
      if (!got.body && !got.imgs.length) return;                              /* 真空帖：不编 */
      it.body = got.body;
      it.imgs = got.imgs;
      it.nimg = got.imgs.length;
      if (got.body) ok++;
      imgs += got.imgs.length;
      return;
    }
  };

  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONC, topics.length) }, async () => {
    while (true) {
      const k = i++;
      if (k >= topics.length) return;
      if (k >= CONC) await sleep(200);                                        /* 每 200ms 才发一次 */
      try { await one(topics[k]); } catch (e) { /* 一条挂了不影响别的 */ }
      done++;
      if (done % 5 === 0 || done === topics.length) log('  正文进度 ' + done + '/' + topics.length + '（有正文 ' + ok + ' 条 · 图 ' + imgs + ' 张）');
    }
  }));
  log('📄 正文：' + ok + '/' + topics.length + ' 条 · 正文图片 ' + imgs + ' 张 · 用时 ' + Math.round((Date.now() - tBody) / 1000) + 's');
}

/* ============================================================
   ③ 只留【国际足球】+「接下来比赛」优先
   ------------------------------------------------------------
   用户 2026-10-21（第三次）：「社区不抓中超国内的比赛消息」
                          「主要抓接下来比赛竞彩的消息」
     ✅ 要：英超/西甲/意甲/德甲/法甲/欧冠…、赛前分析、伤停、首发、盘口、看好
     ❌ 不要：中超/中甲/中乙/足协杯/国足/亚冠（国内球队）、纯八卦、赛后复盘（降权）
   做法：① 源换成【国际】板块；② 标题黑名单硬过滤；③ 用 football.js 里
        「接下来 30 场」的队名给每条帖子打分，分数高的排前面（命中不了就按时间兜底）。
   ============================================================ */

/* 国内足球黑名单（只按【精确的联赛名 / 队名 / 球员名】收，避免误伤「世界杯」这种词） */
const DOMESTIC = [
  '中超', '中甲', '中乙', '中冠', '足协杯', '国足', '中国男足', '中国女足', '中国国家队', '中国队',
  '中国足球', '亚冠', '亚足联', '亚洲杯预选', '全运会', '甲A', 'U23国足', 'U21国足', 'U19国足', 'U16国足', '国少',
  '上海海港', '上海申花', '山东泰山', '北京国安', '成都蓉城', '天津津门虎', '长春亚泰', '武汉三镇',
  '梅州客家', '青岛海牛', '青岛西海岸', '河南队', '浙江队', '大连英博', '大连人', '深圳新鹏城',
  '南通支云', '沧州雄狮', '云南玉昆', '广州队', '广州恒大', '江苏苏宁', '重庆两江',
  '海港', '申花', '泰山队', '国安', '蓉城', '津门虎', '亚泰', '三镇', '海牛', '西海岸',
  '武磊', '王大雷', '郑智', '李铁', '李霄鹏', '韦世豪', '张玉宁', '蒋光太', '颜骏凌', '刘殿座',
  '谢鹏飞', '吴曦', '朱辰杰', '徐新', '王上源', '刘洋', '谢文能', '拜合拉木', '李源一', '刘凯源', '彭显宸',
];
const DOMESTIC_RE = new RegExp(DOMESTIC.join('|'));

/* 灌水 / 游戏贴（虎扑「梦想训练营」「完美球队」这类，不是比赛消息） */
const SPAM_RE = /梦想训练营|完美球队|不败阵容|完美球员|冠军海报|云川训练营|云峰训练营|myteam|自建阵容|开档|存档/i;

/* 已经踢完 / 复盘的 → 降权（用户：赛后复盘可以少要点） */
const POST_MATCH_RE = /赛后|全场|战报|复盘|终场|集锦|回放|点评|评分|夺魁|夺冠回顾/;

/* 时效：超过 7 天的【整条丢掉】；超过 48 小时的降权（用户要的是「接下来比赛」） */
const AGE_MAX = 7 * 86400000;
const AGE_FRESH = 48 * 3600000;

/* 竞彩/赛前信号词 → 加分 */
const BET_RE = /盘口|让球|大小球|赔率|初盘|亚盘|欧赔|伤停|首发|阵容|预测|看好|比分|前瞻|对阵|开赛|主场|客场|交锋|竞彩|单关|串关|推荐|买定|稳胆|爆冷|冷门|轮换|缺阵|停赛|复出|赛前|大战|焦点战|直播/;

/* 繁 → 简的常用字（体彩官方队名里偶尔是繁体：埃因霍溫 / 祖雲達斯） */
const FOLD = { '溫': '温', '雲': '云', '達': '达', '蘭': '兰', '爾': '尔', '內': '内', '華': '华', '門': '门', '維': '维', '諾': '诺', '熱': '热', '萊': '莱', '爾': '尔', '競': '竞', '聯': '联', '聖': '圣', '薩': '萨', '羅': '罗', '馬': '马', '德': '德', '亞': '亚', '維': '维', '斯': '斯' };
const fold = (s) => String(s || '').replace(/[溫雲達蘭爾內華門維諾熱萊競聯聖薩羅馬亞]/g, (c) => FOLD[c] || c);

/* 官方队名 → 球迷常用叫法（虎扑标题里出现的是右边这些短名） */
const TEAM_ALIAS = {
  '巴黎圣日耳曼': ['巴黎', '大巴黎', 'PSG'], '巴塞罗那': ['巴萨', '巴塞'],
  '皇家马德里': ['皇马', '马德里'], '马德里竞技': ['马竞'], '曼彻斯特城': ['曼城'],
  '曼彻斯特联': ['曼联'], '利物浦': ['利物浦', '红军'], '阿森纳': ['阿森纳', '枪手'],
  '切尔西': ['切尔西', '蓝军'], '托特纳姆热刺': ['热刺'], '纽卡斯尔联': ['纽卡', '纽卡斯尔'],
  '阿斯顿维拉': ['维拉'], '布莱顿': ['布莱顿', '海鸥'], '西汉姆联': ['西汉姆', '铁锤帮'],
  '埃弗顿': ['埃弗顿'], '诺丁汉森林': ['诺丁汉', '森林'], '水晶宫': ['水晶宫'], '富勒姆': ['富勒姆'],
  '伯恩茅斯': ['伯恩茅斯'], '布伦特福德': ['布伦特福德'], '狼队': ['狼队'], '利兹联': ['利兹'],
  '拜仁慕尼黑': ['拜仁'], '多特蒙德': ['多特'], '勒沃库森': ['勒沃库森', '药厂'], '莱比锡红牛': ['莱比锡'],
  '法兰克福': ['法兰克福'], '斯图加特': ['斯图加特'], '云达不莱梅': ['不莱梅'], '门兴格拉德巴赫': ['门兴'],
  '国际米兰': ['国米'], 'AC米兰': ['AC米兰', '米兰'], '尤文图斯': ['尤文'], '那不勒斯': ['那不勒斯', '拿玻里'],
  '罗马': ['罗马'], '拉齐奥': ['拉齐奥'], '亚特兰大': ['亚特兰大'], '佛罗伦萨': ['佛罗伦萨', '紫百合'],
  '博洛尼亚': ['博洛尼亚'], '都灵': ['都灵'], '本菲卡': ['本菲卡'], '波尔图': ['波尔图'],
  '葡萄牙体育': ['葡体', '里斯本竞技'], '阿贾克斯': ['阿贾克斯', '贾府'], 'PSV埃因霍温': ['PSV', '埃因霍温'],
  '费耶诺德': ['费耶诺德'], '摩纳哥': ['摩纳哥'], '里昂': ['里昂'], '马赛': ['马赛'], '里尔': ['里尔'],
  '塞维利亚': ['塞维利亚'], '皇家社会': ['皇社', '皇家社会'], '皇家贝蒂斯': ['贝蒂斯'],
  '比利亚雷亚尔': ['比利亚雷亚尔', '黄潜'], '瓦伦西亚': ['瓦伦西亚'], '毕尔巴鄂竞技': ['毕尔巴鄂', '毕巴'],
  '赫塔菲': ['赫塔菲'], '塞尔塔': ['塞尔塔'], '奥萨苏纳': ['奥萨苏纳'], '赫罗纳': ['赫罗纳'],
  '凯尔特人': ['凯尔特人'], '格拉斯哥流浪者': ['流浪者'], '加拉塔萨雷': ['加拉塔萨雷'],
  '费内巴切': ['费内巴切'], '奥林匹亚科斯': ['奥林匹亚科斯'], '布拉迪斯拉发': ['布拉迪斯拉发'],
  '博多格林特': ['博多', '博多格林特'], '雅典AEK': ['AEK', '雅典'], '哥本哈根': ['哥本哈根'],
  '布鲁日': ['布鲁日'], '萨尔茨堡': ['萨尔茨堡'], '顿涅茨克矿工': ['矿工'], '泽尼特': ['泽尼特'],
  '布拉格斯巴达': ['布拉格斯巴达'], '帕纳辛奈科斯': ['帕纳辛奈科斯'], '贝尔格莱德红星': ['红星'],
  '斯图加特踢球者': ['斯图加特踢球者'], '朗斯': ['朗斯'], '南特': ['南特'], '雷恩': ['雷恩'],
  '尼斯': ['尼斯'], '斯特拉斯堡': ['斯特拉斯堡'], '蒙彼利埃': ['蒙彼利埃'], '图卢兹': ['图卢兹'],
  '沃尔夫斯堡': ['狼堡', '沃尔夫斯堡'], '霍芬海姆': ['霍芬海姆'], '弗赖堡': ['弗赖堡'], '美因茨': ['美因茨'],
  '奥格斯堡': ['奥格斯堡'], '柏林联合': ['柏林联'], '海登海姆': ['海登海姆'], '圣保利': ['圣保利'],
  '波鸿': ['波鸿'], '卡利亚里': ['卡利亚里'], '热那亚': ['热那亚'], '恩波利': ['恩波利'],
  '乌迪内斯': ['乌迪内斯'], '莱切': ['莱切'], '维罗纳': ['维罗纳'], '帕尔马': ['帕尔马'], '科莫': ['科莫'],
};

/* 读 football.js 里的【接下来比赛】队名（只读，不改） */
function loadFixtures() {
  const out = { teams: [], n: 0, src: '' };
  try {
    const f = path.join(ROOT, 'football.js');
    if (!fs.existsSync(f)) return out;
    const s = fs.readFileSync(f, 'utf8');
    const i = s.indexOf('const FOOTBALL_DATA');
    if (i < 0) return out;
    const j = s.indexOf('=', i);
    const data = JSON.parse(s.slice(j + 1).replace(/;\s*$/, ''));
    const lists = data && data.lists ? data.lists : {};
    const near = (t) => {
      const ts = Date.parse(String(t || '').replace(' ', 'T'));
      return Number.isFinite(ts) && ts > Date.now() - 4 * 3600 * 1000 && ts < Date.now() + 8 * 86400000;
    };
    const names = [];
    for (const key of ['live', 'upcoming']) {
      for (const m of (Array.isArray(lists[key]) ? lists[key] : [])) {
        if (!near(m.time)) continue;
        for (const side of [m.home, m.away]) {
          const nm = side && (side.name || side);
          if (nm && !names.includes(nm)) names.push(String(nm).trim());
        }
      }
    }
    out.teams = names;
    out.n = names.length;
    out.src = (data.updated || '');
    return out;
  } catch (e) { return out; }
}

/* 队名 → 标题里可能出现的写法（官方名 + 常用短名 + 去掉 U21/队 之类的变体） */
function aliasesOf(name) {
  const set = new Set();
  const push = (x) => { const v = String(x || '').trim(); if (v.length >= 2) set.add(v); };
  const base = fold(name).replace(/\s*(?:U\d{2}|女足|预备队)$/i, '').trim();
  push(base);
  for (const [k, v] of Object.entries(TEAM_ALIAS)) {
    if (base.includes(fold(k)) || fold(k).includes(base)) { push(base); v.forEach(push); }
  }
  if (/^皇家/.test(base)) push(base.replace(/^皇家/, ''));       /* 皇家马德里 → 马德里 */
  if (/队$/.test(base)) push(base.replace(/队$/, ''));
  if (/城$/.test(base)) push(base.replace(/^(.{2}).*城$/, '$1城')); /* 曼彻斯特城 → 曼城 */
  if (/联$/.test(base)) push(base.replace(/^(.{2}).*联$/, '$1联')); /* 曼彻斯特联 → 曼联 */
  return [...set];
}

/* 一条帖子的「接下来比赛」相关度：队名命中 + 竞彩信号词 − 赛后复盘 − 太旧 */
function makeScorer(fixtures) {
  const aliasList = [];
  for (const t of fixtures.teams) for (const a of aliasesOf(t)) if (!aliasList.includes(a)) aliasList.push(a);
  return (title, ts) => {
    const s = fold(title);
    let hit = '';
    for (const a of aliasList) if (a && s.includes(a) && a.length >= 2) { hit = a; break; }
    let score = 0;
    if (hit) score += 5;
    if (BET_RE.test(title)) score += 2;
    if (POST_MATCH_RE.test(title)) score -= 3;
    if (ts && Date.now() - ts > AGE_FRESH) score -= 3;                        /* 两天以前的降权 */
    return { score, hit };
  };
}

/* ---------- 源清单 ----------
   ⚠️ 主源全部换成【国际足球】板块（用户：社区不抓中超国内的比赛消息）。
   2026-10-21 实测（本机 plain fetch）：topic / barcelona / realmadrid / soccer 都有 50 条列表；
   all-soccer（国际足球版）是前端渲染的，HTML 里 0 条，暂不用；
   premier / laliga / seriea / bundesliga / ligue1 / champions / worldfootball 这些短名
   都是「虎扑社区-虎扑网」落地页（268 KB、0 条），不是板块列表 → 不用。
   贴吧 / 500 / 懂球帝 留着【故意不删】：跑的时候会打印状态，哪天能用了改 on:true 即可。 */
const SOURCES = [
  { id: 'hupu-topic', name: '虎扑·足球话题区', url: 'https://bbs.hupu.com/topic', on: true, football: true,
    parse: (h) => parseHupu(h, 'https://bbs.hupu.com') },
  { id: 'hupu-barcelona', name: '虎扑·巴萨专区', url: 'https://bbs.hupu.com/barcelona', on: true, football: true,
    parse: (h) => parseHupu(h, 'https://bbs.hupu.com') },
  { id: 'hupu-realmadrid', name: '虎扑·皇马专区', url: 'https://bbs.hupu.com/realmadrid', on: true, football: true,
    parse: (h) => parseHupu(h, 'https://bbs.hupu.com') },
  { id: 'hupu-soccer', name: '虎扑·足球场', url: 'https://bbs.hupu.com/soccer', on: true, football: true,
    parse: (h) => parseHupu(h, 'https://bbs.hupu.com') },
  { id: 'sina-global', name: '新浪体育·国际足球', url: 'https://sports.sina.com.cn/global/', on: true, football: true,
    parse: (h) => parseSina(h) },
  { id: 'hupu-china-soccer', name: '虎扑·中国足球（用户不要国内，已停用）', url: 'https://bbs.hupu.com/china-soccer', on: false, football: true,
    parse: (h) => parseHupu(h, 'https://bbs.hupu.com') },
  { id: 'hupu-bxj', name: '虎扑·步行街（不是足球，已停用）', url: 'https://bbs.hupu.com/bxj', on: false, football: false,
    parse: (h) => parseHupu(h, 'https://bbs.hupu.com') },
  { id: 'hupu-all-soccer', name: '虎扑·国际足球版（前端渲染，暂不可用）', url: 'https://bbs.hupu.com/all-soccer', on: false, football: true,
    parse: (h) => parseHupu(h, 'https://bbs.hupu.com') },
  { id: 'tieba-soccer', name: '贴吧·足球吧', url: 'https://tieba.baidu.com/f?kw=' + encodeURIComponent('足球') + '&ie=utf-8', on: false, football: true,
    parse: () => [] },
  { id: 'bbs-500', name: '500 论坛', url: 'https://bbs.500.com/', on: false, football: false,
    parse: () => [] },
  { id: 'dongqiudi', name: '懂球帝', url: 'https://www.dongqiudi.com/', on: false, football: true,
    parse: () => [] },
];

/* ---------- 一个源抓 + 解析 ---------- */
async function runSource(s) {
  const attempt = async (ua, tag) => {
    const r = await grab(s.url, { ua, referer: 'https://www.baidu.com/' });
    const items = r.ok ? s.parse(r.html) : [];
    return { ...r, items, tag };
  };
  let r = await attempt(UA_PC, 'PC');
  if (!r.ok || !r.items.length) r = await attempt(UA_MB, '手机');
  return r;
}

/* ---------- 一轮 ---------- */
const seenTitle = new Set();
const seenUrl = new Set();
const bag = [];
const report = [];

/* 【接下来比赛】队名表：从 football.js 读（只读）。读不到 → 打分为 0，纯按时间排。 */
const FX = loadFixtures();
const scoreOf = makeScorer(FX);
log('⚽ 接下来比赛：' + FX.n + ' 个队名（' + (FX.src || '无更新时间') + '）' + (FX.teams.length ? ' 例：' + FX.teams.slice(0, 6).join('、') : ''));

async function round(n) {
  log('第 ' + n + ' 轮开始（' + SOURCES.filter((s) => s.on).length + ' 个源）');
  let dropped = 0;
  for (const s of SOURCES) {
    if (!s.on || (has('--discussion-only') && !s.id.startsWith('hupu-'))) continue;
    const r = await runSource(s);
    const got = r.items.length;
    report.push({ name: s.name, status: r.status || 0, n: got, note: r.err || '' });
    log('  · ' + s.name + ' → HTTP ' + (r.status || 'ERR ' + (r.err || '')) + ' · 解析 ' + got + ' 条 · ' + r.bytes + 'B');
    for (const it of r.items) {
      const key = it.t.replace(/[\s\p{P}]/gu, '').slice(0, 30);
      if (!key || seenTitle.has(key) || seenUrl.has(it.u)) continue;
      if (!allowed(it.t)) continue;                                  /* 带站名/来源字样的整条丢掉 */
      if (DOMESTIC_RE.test(it.t) || SPAM_RE.test(it.t)) { dropped++; continue; }   /* 国内足球 / 灌水贴丢掉 */
      seenTitle.add(key);
      seenUrl.add(it.u);
      const ts = toTs(it.d);
      if (ts && Date.now() - ts > AGE_MAX) { dropped++; continue; }   /* 一周前的老贴不要 */
      const { score, hit } = scoreOf(it.t, ts);
      bag.push({ t: it.t, d: fmtTs(ts) || it.d, u: it.u, ts, football: s.football, fx: score, hit });
    }
  }
  log('  累计 ' + bag.length + ' 条 · 过滤国内/灌水 ' + dropped + ' 条 · 命中接下来比赛 ' + bag.filter((x) => x.hit).length + ' 条');
  return bag.length;
}

/* 进程硬上限 */
setTimeout(() => { log('⏱ 到 ' + TIMEOUT + 's 上限，本轮收工（保留上次数据）'); process.exit(2); }, TIMEOUT * 1000).unref?.();

let total = 0;
for (let i = 1; i <= ROUNDS; i++) {
  total = await round(i);
  if (total >= 20) break;
  if (i < ROUNDS) { log('  条数不够，' + GAP + 's 后再试'); await new Promise((r) => setTimeout(r, GAP * 1000)); }
}

/* ---------- 汇总：排序 + 取前 20 ----------
   排序规则（用户：主要抓接下来比赛竞彩的消息）：
     ① fx（命中接下来比赛的队名 + 竞彩信号词 − 赛后复盘）高的先
     ② 同分按时间新的先
   一条都命中不了 → 就按时间排（不空着，纯国际足球兜底）。 */
const byScore = (a, b) => ((b.fx || 0) - (a.fx || 0)) || ((b.ts || 0) - (a.ts || 0));
bag.sort(byScore);
if (bag.length > 20) {
  const fb = bag.filter((x) => x.football);
  const rest = bag.filter((x) => !x.football);
  bag.length = 0;
  bag.push(...fb.slice(0, 20));
  if (bag.length < 20) bag.push(...rest.slice(0, 20 - bag.length));
  bag.sort(byScore);
}
const topics = bag.slice(0, 20).map((x) => ({ t: x.t, d: x.d, u: x.u, body: '', nimg: 0, imgs: [] }));

log('========== 每源结果 ==========');
for (const r of report) log('  ' + r.name.padEnd(14) + ' HTTP ' + String(r.status || 'ERR').padEnd(4) + ' → ' + r.n + ' 条 ' + (r.note || ''));
log('========== 排序后前 10（fx = 接下来比赛相关度）==========');
bag.slice(0, 10).forEach((x, i) => log('  ' + (i + 1) + ' [fx ' + (x.fx || 0) + (x.hit ? ' 命中 ' + x.hit : '') + '] ' + x.t.slice(0, 34) + '  ' + x.d));

if (PROBE) {
  log('（--probe：只探源，不写文件）');
  process.exit(topics.length ? 0 : 1);
}

/* ---------- ② 逐条点进帖子页补正文（抓不到就留空，保留标题，不编） ---------- */
await fillBodies(topics);

/* ---------- 写文件：抓不到就【不写】，保留上一次 ---------- */
if (!topics.length) {
  log('❌ 本轮 0 条 —— 不写 community-topics.json（保留上一次的好数据）');
  process.exit(1);
}
const payload = { updated: fmtTs(Date.now()), topics };
fs.writeFileSync(OUT + '.tmp', JSON.stringify(payload, null, 2) + '\n', 'utf8');
fs.renameSync(OUT + '.tmp', OUT);
log('✅ 写入 ' + path.basename(OUT) + '：' + topics.length + ' 条（updated ' + payload.updated + '）');
for (const t of topics.slice(0, 3)) log('   · ' + t.t + '  ' + t.d + (t.body ? '  〔正文 ' + t.body.length + ' 字' + (t.nimg ? ' · 图 ' + t.nimg : '') + '〕' : '  〔无正文〕'));
process.exit(0);
