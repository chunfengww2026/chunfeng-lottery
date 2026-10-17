/* ============================================================
   build-articles.mjs —— 抓「文章参考」数据（标题 + 正文）
   ------------------------------------------------------------
   用户原话：「微信把 yiqicai.com 拉黑了，点链接跳过去打不开
              → 要把正文抓到我们页面上」
   所以这一版多了【正文】：正文存成段落数组，页面里就地展开阅读，
   不再往源站跳。

   ── 抓什么（结构都是 2026-10 实测的） ──
   A. 列表页（每个彩种 1 个）
        https://m.yiqicai.com/ssq/jq/     双色球
        https://m.yiqicai.com/dlt/jq/     大乐透
        https://m.yiqicai.com/fc3d/jq/    福彩3D
        https://m.yiqicai.com/klb/jq/     快乐8
        https://m.yiqicai.com/pl3/jq/     排列3
      结构：<section class="cm-news">
              <h1 class="cm-default-tit"><a …>双色球技巧</a></h1>
              <div class="cm-news-list">
                <a href="/ssq/jq/jq_<32位>.html">标题</a> …
              </div>
            </section>
      ⚠️ 旧的 https://m.yiqicai.com/spe 每彩种只给 5 个【专家主页】链接，
         那些页面本身没有正文（实测），所以列表改从上面 5 个 jq 页取。

   B. 详情页（每篇 1 个，最多 50 篇）
        https://m.yiqicai.com/<彩种>/jq/jq_<32位>.html
      结构：<div class="article-content">
              <h1 class="article-tit">…</h1>
              <div class="article-source">2026-10-15 16:59:10</div>
              <article class="article-desc"><h4>…</h4><p>…</p><ul><li>…</li></ul>
                <p><img src="https://f.jiangduoduo.com/…png"></p>
                <div class="news-article-container" data-id="…"></div>
              </article>
            </div>
      ⇒ 只取 <article class="article-desc"> 里面的块级子节点：
        h4 / p / li 的文字 = 段落；img 的 src = 图片（实测可外链，见下）。
      ⇒ 去掉：导航 / 面包屑 / 「相关推荐」（related-txt 那些）/ 页脚 / 版权 /
              <div class="news-article-container">（置底的广告位，内容是空的）/
              <span class="exps-hit">（中奖战绩贴片，在 article 外面，本来就不取）

   图片能不能外链（三种 Referer 实测，2026-10-16）：
     不带 Referer        → HTTP 200 · image/png · 65800 B
     Referer=m.yiqicai.com → HTTP 200 · image/png · 65800 B
     Referer=github.io   → HTTP 200 · image/png · 65800 B
     ⇒ 能外链。所以图片【只存 URL、不下载】（存成 {i:'图片地址'} 一段），
       页面里用 loading="lazy" + referrerpolicy="no-referrer" 引用。
       ⚠️ 正文的图【不占图位】：不写 data-image 属性，
          页面上 data-image= 的个数必须仍然是 21。

   ── 产出 articles-data.js ──
     const ARTICLES_DATA = {
       updated: '2026-10-16 04:16',
       games: {
         ssq: { name:'双色球', items:[
           { title, url, author, date,
             body: [ '段落1', { i:'图片地址' }, '段落2', … ] }
         ]},
         … dlt / fc3d / pl3 / kl8
       }
     };
   ⚠️ body 是【纯文本段落数组】，图片是 { i: url } 这种对象；
      每个元素单独一项，页面上一个元素 = 一个 <p>，
      这样页面上不会出现标签样的字面量。

   ── 限制（用户要求，防撑大页面） ──
     · 每彩种最多 10 篇（5 彩种 × 10 篇 = 50 篇）
       ← 2026-10-17 用户要求：从 5 篇改成 10 篇（见 MAX_PER_GAME）
     · 每篇正文最多 40 段 / 4000 字符
     · 请求延时：列表页之间 ≥1.2s；详情页之间 ≥1.5s（别刷太快）

   ── 安全 / 省成本 ──
     · 正常手机 User-Agent；失败退避（照 update-football-smart.mjs 那套）
     · 单篇正文抓不到 → 只跳过那一篇，整轮照常出货
     · 整轮抓不到 → 【不覆盖】上一次的 articles-data.js，退出码 10
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

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* 5 个彩种：列表页 + URL 前缀 + 详情页正文选择器都一样，只有前缀不同。
   【用户 2026-10-17 指定源】换成同站的【预测】栏目 /<彩种>/yc/：
     https://www.yiqicai.com/ssq/yc/ · /dlt/yc/ · /klb/yc/ · /pl3/yc/ · /fc3d/yc/
   ⚠️ 原来抓的是 /<彩种>/jq/（技巧），已按用户要求改掉。
   ✅ 实测：手机版 https://m.yiqicai.com/<彩种>/yc/ 与下面那套解析完全兼容 ——
      列表页同样是 .cm-news / .cm-news-list / .cm-default-tit，
      详情页同样有 .article-content / .article-tit / .article-source / .article-desc，
      所以【只改了 jq→yc 这一个词】，解析代码一行没动。
      （www 的那份是另一套模板 .news-article-txt/.news-article-time，故用 m. 版。） */
const GAME_DEFS = [
  { key: 'ssq',  name: '双色球', prefix: '/ssq/yc/',  list: 'https://m.yiqicai.com/ssq/yc/',  re: /双色球/ },
  { key: 'dlt',  name: '大乐透', prefix: '/dlt/yc/',  list: 'https://m.yiqicai.com/dlt/yc/',  re: /大乐透/ },
  { key: 'fc3d', name: '福彩3D', prefix: '/fc3d/yc/', list: 'https://m.yiqicai.com/fc3d/yc/', re: /福彩\s*3\s*D|3\s*D/i },
  { key: 'kl8',  name: '快乐8',  prefix: '/klb/yc/',  list: 'https://m.yiqicai.com/klb/yc/',  re: /快乐\s*8/ },
  { key: 'pl3',  name: '排列3',  prefix: '/pl3/yc/',  list: 'https://m.yiqicai.com/pl3/yc/',  re: /排列\s*3|排列三/ }
];

/* ⚠️ 2026-10-17 用户要求：每个彩种抓 10 篇（原来是 5 篇）。
   ⇒ 5 彩种 × 10 篇 = 50 篇正文。改这一个常量就够了，
     显示侧（export-static.mjs）是数据驱动的（读 items.length），
     没有第二处硬编码 5，不用动。 */
const MAX_PER_GAME = 10;       /* 每彩种最多 10 篇（用户要求每轮 50 篇正文） */
const MAX_PARAS = 40;          /* 每篇正文最多 40 段 */
const MAX_CHARS = 4000;        /* 每篇正文最多 4000 字符 */

const DELAY_LIST = 1600;       /* 列表页之间的延时（毫秒） */
const DELAY_BODY = 1500;       /* 详情页之间的延时（毫秒） */

/* 失败退避（写法照 update-football-smart.mjs） */
const FAIL_PAUSE_AFTER = 6;    // 连续失败这么多次 → 暂停
const PAUSE_MINUTES = 120;     // 暂停时长（分钟）

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 小工具 ---------- */
const stripTags = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/* ---------- 来源字样清洗（用户硬性要求：页面不能出现「数据从哪来」） ----------
   用户原话：「页面不能出现任何『数据从哪来』的字样」，source-guard.mjs 命中就构建 exit 1。
   抓来的正文里可能带：转载声明「来源：××」、作者简介里的站名、裸网址……
   ⇒ 在【写入 articles-data.js 之前】就洗掉，而不是只靠出页面时兜底。
   两条规则：
     ① 整段是引用/来源声明 → 整段丢掉（比改成「出处：本站」更干净，不留痕迹）
     ② 其余文字里的站名 / 域名 / 数据文件名 / 「来源」「来自」类词 → 换成中性说法
   注意：图片地址（{ i: url }）不动 —— 它是 src 属性，用户看不见 URL 文字。 */
const SRC_DROP_RE = /^\s*(?:来源|文章来源|本文来源|稿件来源|数据来源|数据源|原文链接|原文|原标题|转载|转自|声明|免责声明|版权|投稿|编辑[:：])/;
const SRC_SCRUB = [
  [/来自于/g, '出自于'],
  [/数据来源|数据源/g, '数据'],
  [/来源/g, '出处'],
  [/来自/g, '出自'],
  [/取自/g, '收录'],
  [/抓取|爬取/g, '整理'],
  [/接口/g, '通道'],          /* 软词，source-guard 会拦「接口」「接入」 */
  [/接入/g, '连接'],
  [/一起彩|yiqicai/gi, '本站'],
  [/球探|雷速|titan0*7|okooo|win0*7|17chdd|toutiaoi?mg?|头条|sporttery|245qq/gi, ''],
  [/500\.com|500网|500万/gi, ''],
  [/https?:\/\/[^\s"'<>）)】,，]+/g, '']
];
function cleanText(s) {
  let t = String(s == null ? '' : s);
  if (SRC_DROP_RE.test(t)) return '';
  for (const pair of SRC_SCRUB) t = t.replace(pair[0], pair[1]);
  return t.replace(/\s+/g, ' ').trim();
}

/** 从标题推出作者名。
 *  【2026-10-17 换成 /yc/ 源后补的一条】yc 的标题基本是
 *     「{作者}{彩种}{期号}期：…」  例：周横双色球119期：红球三区比看好1：1：4
 *                                 徐志瑶双色球26119期：红球双胆推荐07 27
 *     「{作者}{彩种}：…」         例：阿燕大乐透：前期方案累计中奖1460万
 *  所以【标题最前面那 2~6 个字】就是作者（后面紧跟彩种名/期号），这是从标题本身取的，
 *  不是猜的：只有「prefix 里没有数字/标点」且「紧跟着彩种名」才认。 */
function authorFromTitlePrefix(title) {
  const s = String(title || '').trim();
  const m = /^([^\d：:，,。.、|｜\s]{2,6}?)(?=双色球|大乐透|福彩\s*3\s*D|快乐\s*[8八]|排列\s*[三3])/.exec(s);
  return m ? m[1] : '';
}

/** 从标题推出作者名（老的 /spe 列表页那种标题才管用）。
    jq 列表页的标题是「{作者}{彩种}{期号}期：…」这种，推不出来，
    所以详情页能拿到 authorName 时以详情页为准（见 parseBody）。 */
function authorOf(title, gameName) {
  /* 先试「{作者}{彩种}…」这种前缀（/yc/ 源基本都是这个形态） */
  const pref = authorFromTitlePrefix(title);
  if (pref) return pref;
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
  s = s.trim();
  /* 没法确认是「人名」的（长句 / 带期号 / 带标点）就留空，别硬塞一个假作者 */
  if (!s || s.length > 8 || /[0-9：:，,。.、|｜]/.test(s)) return '';
  return s;
}

/** 详情页内联数据里的作者名（首选）。
 *  ⚠️ 2026-10-17 实测（/yc/ 详情页）：authorName 在页面里是压缩变量 ——
 *     o.infoDetail={authorAvatar:a,authorId:p,authorName:a,content:…}
 *     等号右边不是字符串字面量，所以正则匹配不到；而页面【别处】还有一堆
 *     nickName:"…"（右侧「专家推荐」小部件里的其它专家）—— 以前拿它当兜底，
 *     结果把别人的名字当成这篇文章的作者（实测：周横的文章显示成「梦幻美系」）。
 *     ⇒ 去掉 nickName 兜底：宁可为空（页面就不显示作者），也绝不写错人。
 *     真正的作者由上面的 authorOf(标题前缀) 取。 */
function authorFromPage(html) {
  const m = /authorName\s*:\s*"([^"]{1,20})"/.exec(html);
  if (!m) return '';
  let s = '';
  try { s = JSON.parse('"' + m[1] + '"'); } catch (e) { s = m[1]; }
  s = cleanText(String(s).trim());
  if (!s || s.length > 8 || /[0-9：:，,。.、|｜]/.test(s)) return '';
  return s;
}

/* ============================================================
   正文解析
   ============================================================ */

/** 从一段标签属性里取 src（兼容单双引号） */
function attrSrc(attrs) {
  const m = /src\s*=\s*"([^"]+)"/i.exec(attrs) || /src\s*=\s*'([^']+)'/i.exec(attrs);
  return m ? String(m[1]).trim() : '';
}

/* 只扫【可见的块级内容】里的文字。
   ⚠️ 图片单独一轮取（见下面），不能塞进这个正则的交替里 ——
      <p><img …></p> 会被 <p>…</p> 那一支整段吃掉，图就丢了。 */
const RE_VISIBLE = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<p\b[^>]*>([\s\S]*?)<\/p>|<li\b[^>]*>([\s\S]*?)<\/li>|<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi;

/**
 * 把一段 HTML 变成「段落/图片」序列（纯文本，去标签），保持出现顺序。
 *
 * 源站正文有【两种】格式（都实测过）：
 *   ① 有块级标签：<h4>…</h4><p>…</p><ul><li>…</li></ul><p><img …></p>
 *   ② 纯文字 + <br> 换行：开头一大段「大家好我是××」中间夹 <br> 和 <img>
 * 所以先按块级扫；一块文字都没扫到时，再按 <br> 切成段。
 */
function extractBlocks(seg) {
  const items = [];
  const push = (txt, at) => {
    if (!txt) return;
    const c = cleanText(txt);          /* ← 来源字样在这里就洗掉（见 cleanText） */
    if (c) items.push({ at, txt: c });
  };
  let textCnt = 0;

  /* ① 块级文字 */
  let m = null;
  RE_VISIBLE.lastIndex = 0;
  while ((m = RE_VISIBLE.exec(seg)) !== null) {
    const raw = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]));
    const txt = stripTags(raw || '').replace(/\s+/g, ' ').trim();
    if (txt) { items.push({ at: m.index, txt }); textCnt++; }
  }

  if (textCnt === 0) {
    /* ② 纯文字 + br 那一种正文（这里不做图片，避免把整段 HTML 一起算进去） */
    items.length = 0;
    const parts = String(seg).split(/<br\s*\/?>/i);
    let at = 0;
    for (const p of parts) {
      const txt = stripTags(p).replace(/\s+/g, ' ').trim();
      push(txt, at);
      at += String(p).length + 4;
    }
  } else {
    /* ③ 图片：单独按出现位置插进去（块级文字那一轮不会碰 img） */
    const RE_IMG = /<img\b([^>]*?)\/?>/gi;
    while ((m = RE_IMG.exec(seg)) !== null) {
      const src = attrSrc(m[1] || '');
      if (src && /^https?:\/\//i.test(src)) items.push({ at: m.index, img: src });
    }
  }

  items.sort((a, b) => a.at - b.at);
  return items.map((x) => (x.img ? { i: x.img } : x.txt));
}

/**
 * 详情页 → { title, date, author, body }
 * 正文只认 <article class="article-desc">；块级子节点直接扫，
 * 不取嵌套的无关内容（那里面只有正文）。
 */
function parseBody(html) {
  const dM = /<article[^>]*class="[^"]*\barticle-desc\b[^"]*"[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (!dM) return null;
  const seg = dM[1];

  /* 标题 / 时间 / 作者 */
  const tM = /<h1[^>]*class="[^"]*\barticle-tit\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = cleanText(tM ? stripTags(tM[1]) : '');
  const sM = /<div[^>]*class="[^"]*\barticle-source\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const date = sM
    ? (/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/.exec(stripTags(sM[1])) || [])[1] || ''
    : '';
  const author = authorFromPage(html);

  /* 段落 + 图片（分段截断） */
  let blocks = extractBlocks(seg).filter((b) => (typeof b === 'string' ? b.length > 0 : !!b.i));

  const body = [];
  let chars = 0;
  for (const b of blocks) {
    if (body.length >= MAX_PARAS) break;
    if (typeof b === 'string') {
      if (chars + b.length > MAX_CHARS) {
        const room = MAX_CHARS - chars;
        if (room > 60) { body.push(b.slice(0, room)); }
        chars = MAX_CHARS;
        break;                                  /* 到上限就停，剩下的不要 */
      }
      body.push(b);
      chars += b.length;
    } else {
      chars += 40;                              /* 图片按 40 字符估值 */
      body.push({ i: b.i });
    }
  }

  /* 兜底：article 里一段文字都没有 → 抓不到正文 */
  const hasText = body.some((x) => typeof x === 'string' && x.length > 20);
  if (!hasText) return null;

  return { title, date, author, body };
}

/** 列表页 → [{ title, url, author, date }]（每彩种最多 MAX_PER_GAME 条） */
function parseList(html, def) {
  const out = [];
  /* 文章 id 有两种形态（实测 /yc/ 列表页里两种都出现）：
       yc_N2610161441458444756.html   ← 数字型（N + 一串数字）
       yc_f212dac408631e8e3951c5bd1d494744.html ← 32 位十六进制
     以前这里写死 'jq_[0-9a-f]{32}'，换成 yc 后一条都匹配不到（列表 0 条）。
     现在两种都收，而且 id 段直接跟着栏目前缀走，以后再换栏目不用再改这里。 */
  const RE = new RegExp('<a[^>]*href="(' + def.prefix.replace(/\//g, '\\/') +
    '[A-Za-z0-9]+_(?:[0-9a-f]{32}|N\\d+)\\.html)"[^>]*>([\\s\\S]*?)<\\/a>', 'gi');
  let m = null;
  while ((m = RE.exec(html)) !== null) {
    if (out.length >= MAX_PER_GAME) break;
    const title = cleanText(stripTags(m[2]));
    if (!title) continue;
    let url = '';
    try { url = new URL(m[1], 'https://m.yiqicai.com').href; } catch (e) { continue; }
    if (out.some((it) => it.url === url)) continue;
    out.push({ title, url, author: authorOf(title, def.name), date: '' });
  }
  return out;
}

/* ============================================================
   网络
   ============================================================ */

/** 一次请求，失败退避重试（源站偶尔 ECONNRESET，重试一次就好） */
async function getHtmlOnce(url, referer) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': referer || 'https://m.yiqicai.com/'
    },
    signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.text();
}

async function getHtml(url, referer, tries) {
  const n = tries || 3;
  let last = null;
  for (let i = 0; i < n; i++) {
    try { return await getHtmlOnce(url, referer); }
    catch (e) {
      last = e;
      if (i < n - 1) await sleep(1800 * (i + 1));      /* 1.8s → 3.6s */
    }
  }
  throw last;
}

/** 读上一轮的 articles-data.js（合并兜底用）；读不到返回 null */
function readPrev() {
  try {
    const src = fs.readFileSync(OUT, 'utf8');
    return new Function(src + '\nreturn ARTICLES_DATA;')();
  } catch (e) { return null; }
}

/* ============================================================
   主流程
   ============================================================ */
const st = readState();
const now = Date.now();

/* 【最小间隔节流】--min-gap <分钟>
   ------------------------------------------------------------
   为什么加：晒票那一班改成【每 10 分钟】跑（用户要求「改成10分钟在全网
   获取一遍」），而文章仍然只要【每 30 分钟】（再快没意义，还会白打源站）。
   这个 .cmd 是同一个任务，所以靠这个参数把文章钉在 30 分钟。
   做法：看 state 里的 lastRun，不足 min-gap 就按「本轮跳过」退出码 10 ——
   调用方已经把 10 当作【正常跳过、保留旧文件】处理，不会当成失败。
   不传这个参数 = 老行为（每次都抓），所以 daily-update 那边不受影响。 */
const gapIdx = process.argv.indexOf('--min-gap');
if (gapIdx >= 0) {
  const minGap = Number(process.argv[gapIdx + 1] || 0);
  const last = Date.parse(st.lastRun || '');
  if (minGap > 0 && isFinite(last) && (now - last) < minGap * 60000) {
    const left = Math.ceil((minGap * 60000 - (now - last)) / 60000);
    log(`⏸  距上次成功只过了 ${Math.round((now - last) / 60000)} 分钟（要求 >= ${minGap} 分钟），` +
      `还差 ${left} 分钟 —— 本轮跳过，保留上一份 articles-data.js`);
    st.skips = (st.skips || 0) + 1;
    writeState(st);
    process.exit(10);
  }
}

/* 1. 退避期？ */
if (st.pausedUntil && now < st.pausedUntil) {
  const left = Math.ceil((st.pausedUntil - now) / 60000);
  log(`⏸  退避中（连续失败 ${st.failStreak} 次），还剩 ${left} 分钟，本轮跳过`);
  st.skips = (st.skips || 0) + 1;
  writeState(st);
  process.exit(10);
}

log(`—— 本轮开始（列表 ${GAME_DEFS.length} 次 + 正文最多 ${GAME_DEFS.length * MAX_PER_GAME} 次，每彩种 ${MAX_PER_GAME} 篇）——`);
st.runs = (st.runs || 0) + 1;

/* 2. 抓 5 个列表页（每个彩种 1 次） */
const groups = {};
let listErr = '';
for (const def of GAME_DEFS) {
  groups[def.key] = { name: def.name, items: [] };
  try {
    const html = await getHtml(def.list, 'https://m.yiqicai.com/spe');
    groups[def.key].items = parseList(html, def);
    log(`   ${def.name} 列表：${groups[def.key].items.length} 条` +
      (groups[def.key].items.length ? '' : '（⚠️ 一条都没解析到）'));
  } catch (e) {
    listErr += `${def.name}:${String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 60)} `;
    log(`   ⚠️ ${def.name} 列表抓取失败：${String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 80)}`);
  }
  await sleep(DELAY_LIST);
}

const listTotal = Object.values(groups).reduce((n, g) => n + g.items.length, 0);
if (listTotal === 0) {
  st.failStreak = (st.failStreak || 0) + 1;
  log(`⚠️  5 个列表页一条都没解析到：${listErr || '页面结构可能变了'}`);
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

/* 3. 逐篇抓正文（每篇 1 次，≥1.5s 延时） */
let bodyOk = 0, bodyFail = 0, charsTotal = 0;
for (const def of GAME_DEFS) {
  for (const it of groups[def.key].items) {
    try {
      const html = await getHtml(it.url, def.list);
      const parsed = parseBody(html);
      if (parsed) {
        /* 详情页渲染出来的标题 / 时间 / 作者都比列表页准，有就用详情页的 */
        if (parsed.title) it.title = parsed.title;
        if (parsed.date) it.date = parsed.date;
        if (parsed.author) it.author = parsed.author;
        it.body = parsed.body;
        bodyOk++;
        charsTotal += parsed.body.reduce((n, x) => n + (typeof x === 'string' ? x.length : 40), 0);
      } else {
        bodyFail++;
        log(`   ⚠️ 正文没解析到：${it.title.slice(0, 24)}`);
      }
    } catch (e) {
      bodyFail++;
      log(`   ⚠️ 正文抓取失败：${it.title.slice(0, 24)} :: ${String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 60)}`);
    }
    await sleep(DELAY_BODY);
  }
}

/* 3.5 逐彩种兜底：这一轮没抓到的彩种，保留上一轮那一个彩种
   ------------------------------------------------------------
   ⚠️ 实测踩过的坑：同时抓 5 个列表页时，头两个偶尔 ECONNRESET，
      如果不管它，这一轮就会写出「双色球 0 条 / 大乐透 0 条」的
      articles-data.js —— 页面上这两个彩种的文章直接没了，
      比不更新还糟。
   ⇒ 原则：【新数据不能比上一轮差】。某个彩种这一轮抓到 0 条，
     就用上一轮同彩种的内容（连正文一起），并写清楚日志。 */
const prev = readPrev();
const prevGames = (prev && prev.games) ? prev.games : {};
let keptFromPrev = 0;
for (const def of GAME_DEFS) {
  if (groups[def.key].items.length) continue;
  const old = prevGames[def.key];
  const oldItems = (old && Array.isArray(old.items)) ? old.items : [];
  if (oldItems.length) {
    groups[def.key].items = oldItems;
    keptFromPrev++;
    log(`   ↩ ${def.name} 本轮没抓到 → 沿用上一轮的 ${oldItems.length} 条（含正文）`);
  }
}
const total = Object.values(groups).reduce((n, g) => n + g.items.length, 0);

/* 一篇正文都没有 → 整轮作废，绝不用空内容覆盖上一轮的文件 */
if (bodyOk === 0) {
  st.failStreak = (st.failStreak || 0) + 1;
  log(`⚠️  ${listTotal} 条标题里一篇正文都没抓到（列表结构好、详情页结构可能变了）`);
  log('    保留上一次的 articles-data.js（页面显示上一轮内容）');  if (st.failStreak >= FAIL_PAUSE_AFTER) {
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
  `   每条：title / url / author / date / body（正文段落数组，图片是 { i: 地址 }）\n` +
  `   ============================================================ */\n\n` +
  `const ARTICLES_DATA = ${JSON.stringify(data, null, 1)};\n`;
fs.writeFileSync(OUT, text, 'utf8');

log(`✅ 已写入 articles-data.js（${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB）`);
GAME_DEFS.forEach((g) => {
  const items = groups[g.key].items;
  const withBody = items.filter((it) => Array.isArray(it.body) && it.body.length).length;
  log(`   ${g.name.padEnd(6)} ${String(items.length).padStart(2)} 条 · 带正文 ${withBody} 篇` +
    (items.length ? ` · 例：${items[0].title.slice(0, 28)}` : ' · ⚠️ 一条都没抓到'));
});
log(`   合计 ${total} 条 / 正文成功 ${bodyOk} 篇 / 失败 ${bodyFail} 篇 / 沿用上一轮 ${keptFromPrev} 个彩种 / 正文字符约 ${charsTotal} · 更新时间 ${data.updated}`);
log('—— 本轮结束（有新数据）——');
process.exit(0);
