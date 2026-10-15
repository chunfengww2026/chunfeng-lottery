/* ============================================================
   build-xysp-tt.mjs —— 抓【今日头条】的晒票内容，产出 xysp-tt-data.js
   ------------------------------------------------------------
   为什么要有它（用户原话）：
     「把【今日头条】的晒票内容抓下来，并入 只读分享页现有的「晒票」栏」

   它【不直接改】xysp-data.js —— 那是 build-xysp.mjs 的文件。
   分工（谁写哪个文件写死，避免两个进程互相覆盖）：
     · 本文件      → 只写 xysp-tt-data.js（头条专属缓存）
     · build-xysp.mjs → 唯一写 xysp-data.js 的人；
                        它跑的时候会 import 本文件里的 mergeTt()，
                        把 xysp-tt-data.js 合进 xysp-data.js 的 games.tt
   ⇒ 两个脚本可以在同一个任务里先后跑，也可以只跑其中一个，都不会把对方写坏。

   ── 抓什么（实测 2026-10-16，服务端渲染，用 iPhone UA）
     https://www.toutiao.com/search/?keyword=晒票
       → HTTP 200 · ~510 KB · 标题 + 图片都在 HTML 里，不需要 __INITIAL_STATE__
     HTTP 200 也验证了另外两个关键词（双色球晒票 / 大乐透晒票）。

   ── 标题 / 图从哪来（实测的真实结构）
     每一条搜索结果是一个
       <script data-druid-card-data-id="…" type="application/json" nonce='…-argus'>
         {…JSON…}
       </script>
     块（⚠️ "-argus" 是 nonce 的尾巴，【不是】id —— 拿 "-argus" 当 id 去切
       会一条都切不到，实测踩过）；里面 JSON 被反斜杠转义，形如：
       "title":{"marked":"…\u003cem\u003e晒票\u003c/em\u003e…","text":"真正的标题"}
       "image_url":"…~tplv-…:450:294.jpg?_iz=…&x-expires=…&x-signature=…"   ← 封面缩略图
       "large_image_url":"…~tplv-…:960:0.jpg?_iz=…&x-expires=…&x-signature=…" ← 封面大图
       "image_list":[{"url":"…:450:294.jpg?…x-signature=…","origin_width":…}, …]
       "title":"3D排列3第26272期晒票，单式、倍投各有选法…"                  ← 标题（纯字符串）
       "group_id":"7696868137202876982"  "datetime":"2026-10-15 20:19:22"
       "media_name":"优雅奶酪6hWlg9"
     ⇒ 解析方式：先按 id 以 -argus 结尾的 <script> 切块，
       再对每块 decodeJSONEscapes()（解 \u003c / \u0026 / \" 等）+ JSON.parse。
       拿不到 JSON 就当这一块没有 —— 绝不抛异常。

   ── ⚠️ 图片防盗链 / 尺寸（实测结论，别再改回去）
     · 只认【带 x-signature 签名的】~tplv 图（p*-sign.toutiaoimg.com 等）。
       这种图【没有防盗链】：不带 Referer / www.toutiao.com / github.io 三种
       都是 HTTP 200 + image/jpeg + 字节数完全相同（实测 63632 B）。
     · ❌ 搜索页里那批 ~cs.jpeg 聚合图（sf3-ttcdn-tos.pstatp.com / byteimg）
       是【验签】的，直接取一律 HTTP 403 + application/json。
       ⇒ 一律不采集（这是"图很多但一张都显示不出来"的坑，已经踩过）。
     · ❌ 绝不给头条图追加 ?imageMogr2/thumbnail/360x ——
       头条的 URL 本来就带 query，再拼一个 '?' 会变成第二个 '?'，
       签名失效 → HTTP 403（实测）。缩略图靠头条自带的 :450:294 变体，
       它只有 21 KB（原图 63 KB），已经够小，不需要我们再缩。
       ⇒ 所以本文件里的 thumb 一定是【头条自己给的 450 宽变体】，
          build-xysp.mjs 里的 thumbOf() 也已经加了保护：不给头条图拼参数。

   ── 保留 / 去重 / 上限（跟一起彩那套规则一致）
     · KEEP_HOURS = 72（at 早于 72 小时前的丢）
     · 按 img 去重（同一个 img 只留一条，保留【最早】的 at，
       字段用最新的 —— 跟 build-xysp.mjs 的规则完全一样）
     · MAX_TT = 60（头条单独设上限，不挤占 8 个彩种的 40 条）
     · 抓不到 → 【不覆盖】旧文件 + 退出码 10（调用方别同步）
     · 连续 6 轮全失败 → 停 120 分钟（退避状态写 _xysp-tt-backoff.json，
       跟一起彩的 _xysp-backoff.json 【分开】，互不影响）
     · 两个关键词页之间间隔 >= 1.2s

   0 token：这个文件不请求任何 AI、不读任何 token、不涉及任何密钥。

   退出码：
     0  = 解析到条目并写入了新的 xysp-tt-data.js
     10 = 本轮跳过（退避中 / 一条都没解析到）—— 保留上一次的 xysp-tt-data.js
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'xysp-tt-data.js');
const LOG = path.join(ROOT, '_xysp-tt.log');
const STATE = path.join(ROOT, '_xysp-tt-backoff.json');

export const TT_KEY = 'tt';
export const TT_NAME = '头条晒票';
export const TT_KEEP_HOURS = 72;
export const TT_MAX = 60;
const GAP_MS = 1200;
const FAIL_PAUSE_AFTER = 6;
const PAUSE_MINUTES = 120;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* 搜索入口。至少「晒票」；再加两个按彩种的（实测都是 HTTP 200）。
   ⚠️ 只加【页面真的能返回结果】的关键词，加多了只是白等 1.2s。 */
const SEARCHES = [
  { key: 'all', kw: '晒票' },
  { key: 'ssq', kw: '双色球 晒票' },
  { key: 'dlt', kw: '大乐透 晒票' }
];

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${m}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) { /* 忽略 */ }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (e) { return { failStreak: 0, pausedUntil: 0, lastRun: '', runs: 0, skips: 0, ok: 0 }; }
}
function writeState(s) { try { fs.writeFileSync(STATE, JSON.stringify(s, null, 1), 'utf8'); } catch (e) {} }

function stamp(d) {
  const t = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ` +
    `${p(t.getHours())}:${p(t.getMinutes())}`;
}

/* ---------- 小工具 ---------- */

/** 解 JSON 字符串里的 \uXXXX 转义（头条把 <em> 之类写成了 \u003c…）。
    ⚠️ 【只】解 \uXXXX，解完直接交给 JSON.parse。
       绝不要在这里手动解 \" / \\ —— 实测那样会把 JSON 结构本身弄坏
       （\" 是 JSON 的合法转义，JSON.parse 自己会处理；
         手动替换会把 " 漏进字符串里 → 直接 parse 失败）。 */
function unescapeJsonText(raw) {
  return String(raw).replace(/\\u([0-9a-fA-F]{4})/g,
    (m, h) => String.fromCharCode(parseInt(h, 16)));
}

/** 把一个 HTML 属性 / JSON 字符串里的内容洗成纯文本（去标签、还原实体、压空白） */
function plainText(s) {
  return String(s == null ? '' : s)
    .replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&').replace(/\\u002f/gi, '/')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/**
 * 头条图片 URL 认不认。
 * 只认 https + 图片后缀 + 【带 x-signature 签名】的那一批 ——
 * 没签名的（~cs.jpeg 聚合图）一律 HTTP 403，采了也是白采（实测）。
 * @param {string} raw
 * @returns {string} 规范化后的 URL，认不出来返回空串
 */
function normTtImg(raw) {
  let u = String(raw || '').trim().replace(/&amp;/gi, '&');
  if (!/^https:\/\//i.test(u)) return '';
  try {
    const h = new URL(u).host.toLowerCase();
    if (!/(toutiaoimg|pstatp|byteimg|toutiaostatic)\.com$/.test(h)) return '';
  } catch (e) { return ''; }
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) return '';
  /* 必须带签名：这种图才没有防盗链 */
  if (!/[?&]x-signature=/i.test(u)) return '';
  return u;
}

/* 标题里能认出来的彩种（认不出就留空，不硬猜） */
const GAME_HINTS = [
  { re: /双色球|双色球晒票/, name: '双色球' },
  { re: /大乐透/,            name: '大乐透' },
  { re: /福彩\s*3D|福彩3D|\b3D\b|3d、/, name: '福彩3D' },
  { re: /快乐8|快乐八/,      name: '快乐8'  },
  { re: /排列3|排列三/,      name: '排列3'  },
  { re: /排列5|排列五/,      name: '排列5'  },
  { re: /七星彩/,            name: '七星彩' },
  { re: /七乐彩/,            name: '七乐彩' }
];
function gameOfTitle(title) {
  const t = String(title || '');
  for (const g of GAME_HINTS) if (g.re.test(t)) return g.name;
  return '';
}

/* ============================================================
   解析一个搜索页 → 条目数组
   ------------------------------------------------------------
   每条搜索结果 = 一个 type="application/json" 的 <script> 块，内容是被转义的 JSON。
   独立成函数（不碰网络），方便验收脚本拿真 HTML 直接调。
   ============================================================ */
export function parseTtPage(html, atIso) {
  const items = [];
  /* ⚠️ 只按【卡片数据块】切：data-druid-card-data-id。
     用 "-argus" / id="…" 都切不到（那个是 nonce 的尾巴，见文件头说明）。 */
  const blocks = String(html).split(/<script[^>]*data-druid-card-data-id[^>]*>/i);
  blocks.shift();                       /* 第一个元素是第一个块之前的页面头 */

  for (const raw of blocks) {
    const end = raw.indexOf('</script>');
    const body = end >= 0 ? raw.slice(0, end) : raw;
    let obj = null;
    try { obj = JSON.parse(unescapeJsonText(body)); } catch (e) { continue; }
    const d = obj && obj.data;
    if (!d || typeof d !== 'object') continue;

    /* 标题实测是【纯字符串】(d.title === "3D排列3第26272期晒票，…")。
       但结构化卡片里也可能给成 {text,marked} —— 两种都吃，不猜错。 */
    const tRaw = (d.title && typeof d.title === 'object')
      ? (d.title.text || d.title.marked || '')
      : d.title;
    const title = plainText(tRaw).slice(0, 120);
    if (!title) continue;               /* 没标题的块（导航/底栏等）直接跳过 */

    const link = String(d.article_url || d.share_url || d.source_url || '');
    const author = plainText(d.media_name || (d.source && d.source.text) || '');
    const when = String(d.datetime || '');

    /* 图：大图（点开看）+ 450 宽缩略（网格里显示）。
       优先用 image_list（一条帖子可能有多张票），没有就退回封面单图。 */
    const big = normTtImg(d.large_image_url) || normTtImg(d.image_url);
    const list = Array.isArray(d.image_list) ? d.image_list : [];
    const urls = [];
    for (const li of list) {
      const u = normTtImg(li && li.url);
      if (u) urls.push(u);
    }
    if (!urls.length) {
      const u = normTtImg(d.image_url);
      if (u) urls.push(u);
    }
    /* 一条帖子最多出 6 张（一个帖子往往就是一组实票，多出几张更像"晒票栏"；
       上限 TT_MAX 兜底，不会无限长） */
    const use = [...new Set(urls)].slice(0, 6);
    if (!use.length && big) use.push(big);
    if (!use.length) continue;          /* 一张图都拿不到 → 这条没用 */

    for (const u of use) {
      if (items.some((x) => x.img === u)) continue;   /* 本页内去重 */
      items.push({
        img: u,                                     /* 缩略（450 宽，实测 21 KB） */
        thumb: u,
        big: big || u,                              /* 点开放大用的（960 宽） */
        title,
        url: link,
        at: atIso,
        src: 'tt',
        game: gameOfTitle(title),
        author,
        when
      });
    }
  }
  return items;
}

/* ============================================================
   合并旧数据 + 72 小时过期 + 去重 + 上限
   ------------------------------------------------------------
   规则跟 build-xysp.mjs 的 mergeAndPrune 完全一致：
     · 同一个 img 只留一条，at 保留【最早】那次，字段用最新的
     · at 早于 72 小时前的丢
     · 按 at 倒序，砍到 TT_MAX
   独立成函数，方便验收脚本拿假数据直接调（72 小时过滤那条测试就靠它）。
   @param {object|null} oldData   旧 xysp-tt-data.js 的内容
   @param {Array} fresh          本轮新解析到的条目
   @param {number} nowMs
   @returns {{items: Array, stat: {kept:number,dropped:number,dupes:number,added:number}}}
   ============================================================ */
export function mergeTt(oldData, fresh, nowMs) {
  const cutoff = nowMs - TT_KEEP_HOURS * 3600 * 1000;
  const bucket = new Map();
  const stat = { kept: 0, dropped: 0, dupes: 0, added: 0 };

  const push = (it, isFresh) => {
    const img = it && it.img ? String(it.img) : '';
    if (!img) return;
    const at = String(it.at || '');
    const t = Date.parse(at);
    if (!isFinite(t)) return;
    if (t < cutoff) { stat.dropped++; return; }          /* 超过 72 小时 → 丢 */
    const prev = bucket.get(img);
    if (prev) {
      stat.dupes++;
      prev.title = it.title || prev.title;
      prev.thumb = it.thumb || prev.thumb;
      prev.big = it.big || prev.big;
      prev.url = it.url || prev.url;
      prev.game = it.game || prev.game;
      prev.author = it.author || prev.author;
      prev.when = it.when || prev.when;
      if (Date.parse(prev.at) > t) prev.at = at;         /* 保留最早那次 */
      return;
    }
    bucket.set(img, {
      img,
      thumb: it.thumb || img,
      big: it.big || img,
      title: it.title || '',
      url: it.url || '',
      at,
      src: 'tt',
      game: it.game || '',
      author: it.author || '',
      when: it.when || ''
    });
    if (isFresh) stat.added++;
  };

  const oldList = (oldData && Array.isArray(oldData.items)) ? oldData.items : [];
  oldList.forEach((it) => push(it, false));
  (Array.isArray(fresh) ? fresh : []).forEach((it) => push(it, true));

  const items = [...bucket.values()]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, TT_MAX);
  stat.kept = items.length;
  return { items, stat };
}

/** 读旧的 xysp-tt-data.js（文件是我们自己写的纯 JSON，直接 JSON.parse） */
export function readTtOld(file) {
  try {
    const txt = fs.readFileSync(file || OUT, 'utf8');
    const m = /const XYSP_TT_DATA\s*=\s*(\{[\s\S]*\});/.exec(txt);
    if (!m) return null;
    return JSON.parse(m[1]);
  } catch (e) { return null; }
}

/** 把数据写成 xysp-tt-data.js 的文本（纯函数，方便测试直接比对） */
export function ttFileText(data) {
  return `/* ============================================================\n` +
    `   xysp-tt-data.js —— 「头条晒票」数据（自动生成，请勿手动编辑）\n\n` +
    `   由 build-xysp-tt.mjs 生成（跟着 30 分钟任务跑）。\n` +
    `   只保留最近 ${TT_KEEP_HOURS} 小时内抓到的条目，最多 ${TT_MAX} 条。\n` +
    `   ⚠️ 本文件【不直接】被页面读 —— build-xysp.mjs 会把它合进\n` +
    `      xysp-data.js 的 games.tt，页面只读 xysp-data.js。\n` +
    `   图片是【外链】（头条签名图没有防盗链），页面里不存图片本体。\n` +
    `   更新时间：${data.updated}\n` +
    `   ============================================================ */\n\n` +
    `const XYSP_TT_DATA = ${JSON.stringify(data, null, 1)};\n`;
}

/* ============================================================
   主流程（只有【直接运行本文件】时才跑；被 import 时不跑）
   ------------------------------------------------------------
   build-xysp.mjs 会 import 上面的 mergeTt / readTtOld / TT_* ——
   那时候绝不能在这里发请求、也不能 exit()，否则会把调用方一起干掉。
   ============================================================ */
export function isDirectRun() {
  try {
    const self = fileURLToPath(import.meta.url);
    const arg = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return !!arg && path.resolve(self) === arg;
  } catch (e) { return false; }
}

export async function runTtFetch() {
  const st = readState();
  const now = Date.now();

  if (st.pausedUntil && now < st.pausedUntil) {
    const left = Math.ceil((st.pausedUntil - now) / 60000);
    log(`⏸  头条退避中（连续全失败 ${st.failStreak} 次），还剩 ${left} 分钟，本轮跳过`);
    st.skips = (st.skips || 0) + 1;
    writeState(st);
    return { ok: false, skipped: true, fresh: [], httpOk: 0, failStreak: st.failStreak };
  }

  log('—— 头条本轮开始 ——');
  st.runs = (st.runs || 0) + 1;

  const roundIso = new Date(now).toISOString();
  const fresh = [];
  let httpOk = 0;
  let firstErr = '';

  for (let i = 0; i < SEARCHES.length; i++) {
    const s = SEARCHES[i];
    if (i > 0) await sleep(GAP_MS);                  /* 请求间隔 >= 1.2s */
    const url = 'https://www.toutiao.com/search/?keyword=' + encodeURIComponent(s.kw);
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9'
        },
        signal: AbortSignal.timeout(30000)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await r.text();
      httpOk++;
      const got = parseTtPage(html, roundIso);
      log(`   ${s.kw}：${got.length} 条`);
      fresh.push(...got);
    } catch (e) {
      const msg = String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 120);
      if (!firstErr) firstErr = `${s.kw} ${msg}`;
      log(`   ⚠️ 头条「${s.kw}」抓取失败：${msg}`);
    }
  }

  /* 跨关键词再去一次重（同一条帖子可能两个关键词都命中） */
  const uniq = new Map();
  for (const it of fresh) if (!uniq.has(it.img)) uniq.set(it.img, it);
  const freshList = [...uniq.values()];
  log(`   抓取结束：${SEARCHES.length} 个关键词成功 ${httpOk} 个 · 解析到 ${freshList.length} 条图片`);

  if (!freshList.length) {
    st.failStreak = (st.failStreak || 0) + 1;
    log(`⚠️  本轮零条（${firstErr || '页面里没解析到头条晒票'}）· 连续全失败 ${st.failStreak} 次`);
    log('    保留上一次的 xysp-tt-data.js');
    if (st.failStreak >= FAIL_PAUSE_AFTER) {
      st.pausedUntil = now + PAUSE_MINUTES * 60000;
      st.failStreak = 0;
      log(`🛑 连续全失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停 ${PAUSE_MINUTES} 分钟（保护数据源）`);
    }
    st.skips = (st.skips || 0) + 1;
    st.lastRun = roundIso;
    writeState(st);
    return { ok: false, skipped: false, fresh: [], httpOk, failStreak: st.failStreak, firstErr };
  }

  /* 合并旧数据 + 过期 + 去重 + 上限 */
  const oldData = readTtOld(OUT);
  const oldTotal = (oldData && Array.isArray(oldData.items)) ? oldData.items.length : 0;
  const { items, stat } = mergeTt(oldData, freshList, now);

  st.failStreak = 0;
  st.pausedUntil = 0;
  st.ok = (st.ok || 0) + 1;
  st.lastRun = roundIso;
  writeState(st);

  const data = { updated: stamp(new Date(now)), items };
  const text = ttFileText(data);
  fs.writeFileSync(OUT, text, 'utf8');

  log(`✅ 已写入 xysp-tt-data.js（${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB）`);
  log(`   旧数据 ${oldTotal} 条 → 合并后 ${stat.kept} 条` +
    `（丢弃过期 ${stat.dropped} 条 · 去重合并 ${stat.dupes} 条 · 本轮新加入 ${stat.added} 条 / 共解析 ${freshList.length} 条）`);
  log('—— 头条本轮结束（有新数据）——');
  return { ok: true, skipped: false, fresh: freshList, items, stat, httpOk, updated: data.updated };
}

/* ---------- 直接运行：跑完按退出码退出 ---------- */
if (isDirectRun()) {
  const r = await runTtFetch();
  process.exit(r.ok ? 0 : 10);
}
