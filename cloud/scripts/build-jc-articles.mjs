/* ============================================================
   build-jc-articles.mjs —— 竞彩/彩票「专家推荐」文章抓取
   用户 2026-10-18：「竞彩晒票下面新增：专家推荐 / 文章要有 20 篇 /
     去抓取今日头条和一起彩和 www.500.com / 一小时抓一次 / 按时间顺序一直抓」

   实测（2026-10-18）：
     · 一起彩 /ex/          → 200 / 133KB ✔ 有专家推荐（可用）
     · www.500.com          → 200 / 301KB ✔（GBK 编码，专家分析入口可用）
     · m.500.com            → 200 / 95KB  ✔（手机版兜底）
     · 今日头条             → 200 / 31KB ✗ 纯 JS 渲染，HTML 里没有文章（抓不到）
   所以：一起彩 + 500 两源合并，头条抓不到就在数据里标着（页面不展示空源）。
   产出 jc-articles.js：{ updated, sources:[{name,ok,count,note}], list:[{title,url,source,time,tag}] }
   只保留最新 20 篇，按时间倒序（时间解析不出来的排最后，不丢）。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'jc-articles.js');
const KEEP = 20;

/* ============================================================
   【本机 backoff 闸门】--min-interval=<分钟>   （2026-10-18 加）
   ------------------------------------------------------------
   为什么加：本机 update-football-smart.mjs 是【每 30 分钟】一轮，这一步要打
   3 个源站（一起彩 / 500 / 头条）。云端设计是「每小时抓一次」，本机没必要
   每 30 分钟都去问一遍 —— 文章一小时也就新增几篇。
   规则：
     · 距上次【成功】< N 分钟 → 立刻跳过：打印原因、exit 0、【不动 jc-articles.js】
     · 不传 --min-interval → 闸门关闭，行为与以前【完全一致】（云端不传）
     · --force-run → 忽略闸门，本次一定真跑
   状态文件：./_backoff-build-jc-articles.json
   ⚠️ 只有【真正写成功】才记 lastSuccess；异常退出不记 → 下一轮还会再试。
   ============================================================ */
const MIN_INTERVAL_MIN = (() => {
  const m = process.argv.slice(2).find((a) => a.startsWith('--min-interval='));
  if (!m) return 0;
  const n = parseInt(m.slice('--min-interval='.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
})();
const FORCE_RUN = process.argv.slice(2).includes('--force-run');
const GATE_FILE = path.join(ROOT, '_backoff-build-jc-articles.json');
function readGate() { try { return JSON.parse(fs.readFileSync(GATE_FILE, 'utf8')) || {}; } catch (e) { return {}; } }
function gateShouldSkip() {
  if (!MIN_INTERVAL_MIN || FORCE_RUN) return false;
  const last = Number(readGate().lastSuccess) || 0;
  if (!last) return false;
  const gone = (Date.now() - last) / 60000;
  if (gone >= MIN_INTERVAL_MIN) return false;
  const ago = gone < 60 ? `${Math.round(gone)} 分钟前` : `${(gone / 60).toFixed(1)} 小时前`;
  console.log(`  ⏭  跳过：距上次成功 ${ago}（闸门 ${MIN_INTERVAL_MIN} 分钟）→ 保留现有 jc-articles.js 不动`);
  try {
    const st = readGate();
    st.lastSkip = Date.now();
    st.skips = (Number(st.skips) || 0) + 1;
    fs.writeFileSync(GATE_FILE, JSON.stringify(st, null, 1), 'utf8');
  } catch (e) { /* 忽略 */ }
  return true;
}
function gateMarkSuccess() {
  if (!MIN_INTERVAL_MIN) return;
  try {
    const st = readGate();
    st.lastSuccess = Date.now();
    st.lastSuccessText = new Date().toLocaleString('zh-CN', { hour12: false });
    st.minIntervalMin = MIN_INTERVAL_MIN;
    st.skips = Number(st.skips) || 0;
    fs.writeFileSync(GATE_FILE, JSON.stringify(st, null, 1), 'utf8');
  } catch (e) { /* 忽略 */ }
}
/* 闸门判断（本脚本是顶层直跑，所以在抓取之前就判） */
if (gateShouldSkip()) process.exit(0);

const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const UA_M = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function get(url, { ua = UA_PC, gbk = false } = {}) {
  /* signal 超时：实测源站会突然不回包（连接一直挂着、10 分钟不动）→
     整个构建卡死、这一小时的数据就不更新了。20s 拿不到就按失败处理，
     每个源外面都有 try/catch，单源失败不影响其它源。 */
  const r = await fetch(url, { headers: { 'User-Agent': ua, Referer: url, 'Accept-Language': 'zh-CN,zh;q=0.9' }, signal: AbortSignal.timeout(20000) });
  const buf = Buffer.from(await r.arrayBuffer());
  let text = buf.toString('utf8');
  if (gbk || text.indexOf('\ufffd') >= 0) {
    try { text = new TextDecoder('gbk').decode(buf); } catch (e) { /* 保持 utf8 */ }
  }
  return { status: r.status, text };
}

const strip = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/* 时间：抓「10-18 09:30」「2026-10-18 09:30」「2 小时前」「昨天 21:00」这类 */
function parseTime(s) {
  const t = String(s || '');
  let m = t.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  m = t.match(/(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) { const y = new Date().getFullYear(); return new Date(y, +m[1] - 1, +m[2], +m[3], +m[4]).getTime(); }
  m = t.match(/(\d+)\s*分钟前/); if (m) return Date.now() - +m[1] * 60000;
  m = t.match(/(\d+)\s*小时前/); if (m) return Date.now() - +m[1] * 3600000;
  m = t.match(/(\d+)\s*天前/); if (m) return Date.now() - +m[1] * 86400000;
  m = t.match(/昨天\s*(\d{1,2}):(\d{2})/);
  if (m) { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(+m[1], +m[2], 0, 0); return d.getTime(); }
  m = t.match(/今天\s*(\d{1,2}):(\d{2})/);
  if (m) { const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); return d.getTime(); }
  return 0;
}

/* ============================================================
   __ART_BODY__ 抓「正文」（用户 2026-10-20：「免费资料可以点击观看 你要抓取到具体资料」）
   ------------------------------------------------------------
   实测（2026-10-20 · 本机跑出来的真数据）：
     · 搜索结果 JSON 里就有文章地址："article_url":"https://toutiao.com/group/<id>/"
       （以前只抠了 "title"，url 一律空着 → 页面「看原文」点不动、正文更没有）
     · 电脑版 www.toutiao.com/group/<id>/ → 200 / 72KB 但【没有正文】（纯 JS 渲染 ✗）
     · 手机版 m.toutiao.com/group/<id>/  → 200 / 45~79KB，<article> 里是【真正文】✔
       实测 5/5 条拿到正文，800~3600 字
     · 会反爬：连续请求偶发 ECONNRESET → 每条间隔 1.2s，失败重试 3 次
   产出：每条带 body（正文，≤3200 字）+ desc（搜索页 abstract 摘要）+ url
   ⚠️ 正文会原样打到页面上 → 必须先 sanitizeBody：去网址 / 去「来源：xxx」行 / 去站名，
      否则分享页的「留痕断言」会把整个构建拦红（那是硬失败）。
   ============================================================ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function unescJson(s) {
  return String(s || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (x, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/\\n/g, '\n').replace(/\\t/g, ' ').replace(/\\"/g, '"').replace(/\\\//g, '/');
}
const stripTags = (s) => unescJson(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (x, d) => String.fromCharCode(+d))
  .replace(/&#[xX]([0-9a-fA-F]+);/g, (x, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();

/* 正文清洗：只留人话。分享页不许出现「数据从哪来」的痕迹（source-guard 硬断言）。 */
const SITE_SCRUB = [
  [/今日头条/g, ''], [/头条/g, ''], [/一起彩/g, ''], [/500\.com/gi, ''], [/500网/g, ''],
  [/球探/g, ''], [/雷速/g, ''], [/titan0*7/gi, ''], [/okooo/gi, ''],
  [/(?:数据)?来源/g, ''], [/来自/g, ''], [/取自/g, ''], [/接口/g, ''], [/接入/g, ''],
  [/\bAPI\b/g, ''], [/百家号/g, ''], [/网易号/g, ''], [/搜狐号/g, '']
];
function sanitizeBody(s) {
  let t = String(s || '');
  t = t.replace(/https?:\/\/[^\s"'<>）)】,，]+/g, ' ');            /* 裸网址 */
  t = t.replace(/[（(【\[]?\s*(?:原标题|责任编辑|编辑|声明|免责声明)\s*[:：]?[^\n]{0,40}[)）】\]]?/g, ' ');
  t = t.replace(/[（(【\[]?\s*(?:来源|出处)\s*[:：][^\n]{0,20}[)）】\]]?/g, ' ');
  for (const [re, to] of SITE_SCRUB) t = t.replace(re, to);
  return t.split('\n')
    .map((x) => x.replace(/[ \t\u3000]{2,}/g, ' ').trim())
    .filter((x) => x.length > 1)
    .join('\n')
    .trim();
}

/* 从搜索结果 JSON 里抠出【一条一条】的：标题 + 链接 + 摘要 + 时间
   实测结构（2026-10-20）：每条结果里有
     "title":"…" / "abstract":"…" / "datetime":"2026-10-19 16:51:56"
     "article_url":"https://toutiao.com/group/<id>/"（有的条目是 /item/<id>/）
     "share_url":"…" / "id":"<id>"
   配对办法：按 "id":"<数字>" 切【条】—— 每条 title/摘要在前、id 在最后；
     区间里必须出现 article_url / share_url 才算一条结果（过滤掉页面其它 JSON 块）。
   ⚠️ 一个 gid 只会存一条（article_url 和 share_url 会各命中一次）。 */
function parseToutiaoItems(html, game, kw) {
  const out2 = [];
  const idRe = /"id"\s*:\s*"(\d{15,})"/g;
  const seen = {};
  let m, prev = 0;
  const lastOf = (seg, key) => {
    const re2 = new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"', 'g');
    let x, v = '';
    while ((x = re2.exec(seg))) v = x[1];
    return v ? stripTags(v) : '';
  };
  const numOf = (seg, key) => {
    const x = seg.match(new RegExp('"' + key + '"\\s*:\\s*"?(\\d{9,13})"?'));
    return x ? Number(x[1]) : 0;
  };
  /* 标题要挑：一段区间里可能有好几个 "title"（还有 emphasized.title 和嵌套块的），
     取【最后一个长度像标题的】（5~60 字）。
     实测踩过：只取最后一个，会把 150 多字的摘要当成标题显示出来（页面上很丑）。 */
  const titleOf = (seg) => {
    const re2 = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let x, best = '';
    while ((x = re2.exec(seg))) {
      const v = stripTags(x[1]);
      if (v.length >= 5 && v.length <= 60) best = v;
    }
    return best;
  };
  while ((m = idRe.exec(html))) {
    const gid = m[1];
    const seg = html.slice(prev, m.index);
    prev = m.index + m[0].length;
    if (seen[gid]) continue;
    if (!/article_url|share_url/.test(seg)) continue;   /* 不是搜索结果条目 */
    seen[gid] = 1;
    const title = titleOf(seg);
    if (!title) continue;
    const abs = lastOf(seg, 'abstract');
    const dt = lastOf(seg, 'datetime');
    const ts = numOf(seg, 'publish_time') || numOf(seg, 'create_time') || numOf(seg, 'display_time');
    out2.push({
      gid,
      title,
      url: 'https://m.toutiao.com/group/' + gid + '/',
      desc: abs.slice(0, 300),
      time: dt || (ts ? new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-') : ''),
      game,
      tag: kw
    });
  }
  return out2;
}

/* 抓一篇正文：手机版 m.toutiao.com 才有真内容（电脑版是 SPA 空壳）
   返回 { title, body } —— title 用【文章自己的 <title>】，
   这样「标题 ↔ 正文」一定对得上（搜索页 JSON 里标题和链接的配对偶尔会串行）。 */
async function fetchToutiaoBody(gid) {
  const url = 'https://m.toutiao.com/group/' + gid + '/';
  /* __ART_20__ 单篇最多试 2 次、每次 9s（原来 3 次 × 20s：一条卡死的条目能拖 60s，
     20 条下来整轮构建会被拖爆）。实测正常 0.5s 就回包。 */
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA_M, 'Accept-Language': 'zh-CN,zh;q=0.9', Referer: 'https://m.toutiao.com/' },
        signal: AbortSignal.timeout(9000)
      });
      if (r.ok) {
        const t = Buffer.from(await r.arrayBuffer()).toString('utf8');
        const at = stripTags((t.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '')
          .replace(/\s*[-_|]\s*今日头条\s*$/, '').trim();
        const art = t.match(/<article[\s\S]*?<\/article>/);
        if (art) {
          const ps = [...art[0].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
            .map((x) => stripTags(x[1])).filter((s) => s.length > 2);
          const plain = (ps.length ? ps.join('\n') : stripTags(art[0])).replace(/视频加载中\.{0,3}/g, '').trim();
          if (plain.length > 60) return { title: at, body: sanitizeBody(plain).slice(0, 3200) };
        } else {
          /* 微头条模板（/w/<id>）：页面里【没有 <article>】，整篇只在 <meta og:title> 里
             （源站自己给的截断预览，实测 gid 1879490145592451）。
             拿到的就是作者自己那段话 → 当【摘要】用；绝不编内容。 */
          const og = stripTags((t.match(/<meta[^>]+property="og:title"[^>]*content="([\s\S]*?)"/) || [])[1] || '');
          if (og.length > 120) return { title: at, body: '', desc: sanitizeBody(og).slice(0, 300) };
        }
      }
    } catch (e) { /* ECONNRESET → 等一下重试 */ }
    await sleep(1200 * (attempt + 1));
  }
  return { title: '', body: '' };
}

/* ---------- 源 1：一起彩 专家推荐【8 个彩种全抓】 ----------
   用户 2026-10-18：「所有的彩种都抓」
   /ex/ 是总列表，但只给一页；按彩种分别抓 /ex/{game}ex/ 才能覆盖全部 8 个彩种。 */
const GAMES = [
  ['ssq', '双色球'], ['dlt', '大乐透'], ['fc3d', '福彩3D'], ['kl8', '快乐8'],
  ['pl3', '排列3'], ['pl5', '排列5'], ['qxc', '七星彩'], ['qlc', '七乐彩']
];
async function fromYiqicai() {
  /* 实测：分彩种的 /ex/{slug}ex/ 页面抓不到卡片（返回空壳），
     而总列表 /ex/ 一次就给 100+ 位专家、且覆盖 8 个彩种。
     所以只请求一次，从专家链接里的 tjsy_{彩种}_{id} 判断他属于哪个彩种。 */
  const { status, text } = await get('https://www.yiqicai.com/ex/');
  if (status !== 200 || text.length < 5000) throw new Error('页面异常 ' + status + '/' + text.length);
  const CN = { ssq: '双色球', dlt: '大乐透', fc3d: '福彩3D', kl8: '快乐8', pl3: '排列3', pl5: '排列5', qxc: '七星彩', qlc: '七乐彩' };
  const list = [];
  const hitGames = new Set();
  const re = /<a[^>]+href="(\/ex\/[^"]+tjsy_([a-z0-9]+)_\d+[^"]*)"[^>]*>([\s\S]{0,400}?)<\/a>/g;
  let m;
  let cnt = 0;
  while ((m = re.exec(text))) {
    const url = 'https://www.yiqicai.com' + m[1];
    const slug = (m[2] || '').toLowerCase();
    const body = m[3];
    const name = strip((body.match(/class="exp-name"[^>]*>([^<]+)/) || [])[1] || body).slice(0, 40);
    const hit = (body.match(/近10中\s*(\d+)/) || [])[1] || '';
    if (!name) continue;
    const cn = CN[slug] || '';
    if (cn) hitGames.add(cn);
    list.push({
      title: (cn ? `【${cn}】` : '') + `专家「${name}」` + (hit ? ` · 近10中 ${hit} 期` : '') + ' · 免费推荐',
      url,
      source: '一起彩',
      time: 0,
      tag: '专家',
      game: slug
    });
    cnt++;
    if (cnt > 200) break;
  }
  if (!list.length) throw new Error('没解析出专家卡片');
  return { list, note: `${list.length} 位专家 · 覆盖 ${hitGames.size}/8 个彩种` };
}

/* ---------- 源 2：500 彩票 专家分析 ---------- */
async function from500() {
  const pages = [
    ['https://m.500.com/', UA_M],
    ['https://www.500.com/', UA_PC]
  ];
  let lastErr = null;
  for (const [url, ua] of pages) {
    try {
      const { status, text } = await get(url, { ua, gbk: true });
      if (status !== 200 || text.length < 5000) throw new Error('页面异常 ' + status + '/' + text.length);
      const list = [];
      /* 500 的条目一般是 <a href="...">标题</a> 旁边带时间；只收带「专家/分析/推荐/预测/胆码」标题的链接 */
      const re = /<a[^>]+href="(https?:\/\/[^"]*500\.com[^"]*|\/[^"]*)"[^>]*>([\s\S]{4,120}?)<\/a>/g;
      let m;
      while ((m = re.exec(text))) {
        const title = strip(m[2]);
        if (title.length < 8 || title.length > 60) continue;
        if (!/专家|分析|推荐|预测|胆码|杀号|方案|竞彩|大乐透|双色球|福彩|体彩/.test(title)) continue;
        const href = m[1].startsWith('http') ? m[1] : 'https://www.500.com' + m[1];
        if (!/500\.com/.test(href)) continue;
        list.push({ title, url: href, source: '500彩票', time: parseTime(title), tag: '资讯' });
        if (list.length > 120) break;
      }
      if (!list.length) throw new Error('没解析出文章链接');
      return { list, note: `来自 ${url}` };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('500 抓不到');
}

/* ---------- 源 3：今日头条（实测不可用，但保留探测，好让页面能显示"暂不支持"） ---------- */
/* ---------- 源 3：今日头条（用户 2026-10-19 给的 so.toutiao.com 入口 · 实测可抓） ----------
   实测数据：
     https://so.toutiao.com/search?dvpf=pc&source=input&keyword=双色球推荐&enable_druid_v2=1
     → 200 / 527KB / 「双色球」239 次 / JSON 里 9 条真标题 ✔
   ⚠️ 之前的 https://www.toutiao.com/search 和 m.toutiao.com 才是空壳 ✗（我测错地址了）
   ⚠️ 会反爬（连续请求被 ECONNRESET）→ 每次请求间隔 5 秒 + 最多重试 2 次 */
async function fromToutiao() {
  /* 【按开奖期号抓 · 用户 2026-10-19「根据开奖时间抓取对应的资料」】
     从 history.js 读每个彩种的最新期号 → 关键词带上期号
     （例如「双色球2026120期推荐」，比笼统的「双色球推荐」更贴当期）
     云端每小时跑一次 → 开奖后下一班就能抓到当期内容 */
  var issueMap = { ssq: '', dlt: '' };
  try {
    const hf = path.join(ROOT, 'history.js');
    if (fs.existsSync(hf)) {
      const hctx = vm.createContext({});
      vm.runInContext(fs.readFileSync(hf, 'utf8') + '\n;globalThis.__H=DRAW_HISTORY;', hctx);
      const gg = (hctx.__H && hctx.__H.games) || {};
      /* 【下一期】= 最新【已开奖】期号 + 1（用户要的是「根据下一期开什么奖抓什么」）
         ⚠️ 2026-10-20 修：这里原来少 import vm → 整个 try 抛 ReferenceError 被吞掉，
            结果关键词一直是「双色球期推荐」（没有期号），等于没按下一期抓。
         期号规则：双色球 2026119 → 2026120、大乐透 26119 → 26120，都是 +1。 */
      const nextIssue = (arr) => {
        const a = Array.isArray(arr) ? arr : [];
        for (const it of a) {
          const n = parseInt(String((it && it.issue) || ''), 10);
          if (Number.isFinite(n) && n > 0) return String(n + 1);
        }
        return '';
      };
      issueMap.ssq = nextIssue(gg.ssq);
      issueMap.dlt = nextIssue(gg.dlt);
      console.log('  · 下一期期号：双色球 ' + (issueMap.ssq || '?') + ' · 大乐透 ' + (issueMap.dlt || '?'));
    }
  } catch (e) { console.log('  ⚠️ 读下一期期号失败（关键词退回不带期号）：' + e.message.slice(0, 60)); }

  const KW = [
    { kw: '双色球' + (issueMap.ssq || '') + '期推荐', game: 'ssq' },
    { kw: '双色球推荐', game: 'ssq' },
    { kw: '大乐透' + (issueMap.dlt || '') + '期推荐', game: 'dlt' },
    { kw: '大乐透推荐', game: 'dlt' }
  ];
  console.log('  · 头条关键词（按期号）：' + KW.map(function (x) { return x.kw; }).join(' / '));
  const out = [];
  /* ============================================================
     __ART_20__ 翻页（用户 2026-10-21：「文章资料抓二十条，最好都带正文」）
     ------------------------------------------------------------
     实测（2026-10-21 本机）：一页搜索只解析出 4~8 条（标题+链接+摘要），
     20 条正文需要【约 35~40 条候选】（正文成功率约 9 成，抓不到的用摘要顶上）。
     所以每个关键词翻 2 页（page_num=0 / 1）→ 4 词 × 2 页 = 8 次搜索，
     去重后长期稳定 35~44 条候选 ✔（page_num=2 也有货，但耗时多 15s，先不用）。
     · 搜索页之间隔 1.5s（反爬：实测 1.5s 连发 12 次没被限流；5s 太慢）
     ============================================================ */
  const PAGES = [0, 1];
  const seenGid = {};
  /* 标题里明写彩种的以标题为准（feed 常把「福彩3D」塞进大乐透关键词结果里） */
  const titleGame = (t) => {
    if (/双色球/.test(t)) return 'ssq';
    if (/大乐透/.test(t)) return 'dlt';
    if (/快乐8|快乐八/.test(t)) return 'kl8';
    if (/福彩3D|3D第|3d第/.test(t)) return 'fc3d';
    if (/排列[3三五]/.test(t)) return 'pl';
    if (/七星彩/.test(t)) return 'qxc';
    if (/七乐彩/.test(t)) return 'qlc';
    return '';
  };
  /* 只收「双色球 / 大乐透」的（免费资料按下一期彩种 3+3 → 10+10 轮流取）；
     带 #话题# 边、太短的标题是搜索页的杂项，直接扔掉（页面显示出来很难看） */
  const cleanTitle = (t) => String(t || '').replace(/^#+/, '').replace(/#+$/, '').replace(/\s+/g, ' ').trim();
  for (const item of KW) {
    for (const page of PAGES) {
      const url = 'https://so.toutiao.com/search?dvpf=pc&source=input&keyword=' +
        encodeURIComponent(item.kw) + '&enable_druid_v2=1&page_num=' + page + '&pd=synthesis';
      let html = null;
      for (let attempt = 0; attempt < 2 && !html; attempt++) {
        try {
          const r = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
              'Referer': 'https://so.toutiao.com/',
              'Accept-Language': 'zh-CN,zh;q=0.9'
            },
            signal: AbortSignal.timeout(20000)
          });
          if (r.ok) html = Buffer.from(await r.arrayBuffer()).toString('utf8');
        } catch (e) { /* ECONNRESET → 等一会儿重试 */ }
        if (!html) await sleep(3000);
      }
      if (!html) { console.log('  ✗ 头条（' + item.kw + ' p' + page + '）：重试后仍失败'); continue; }

      /* __ART_BODY__ 先按「一条一条」解析：标题 + 原文链接 + 摘要（+ 时间） */
      const items = parseToutiaoItems(html, item.game, item.kw);
      let kept = 0;
      for (const it of items) {
        if (seenGid[it.gid]) continue;
        seenGid[it.gid] = 1;
        const t = cleanTitle(it.title);
        if (t.length < 8 || t.length > 70) continue;
        if (!/双色球|大乐透/.test(t)) continue;          /* 只留下一期两个彩种 */
        const g = titleGame(t) || item.game;
        if (g !== 'ssq' && g !== 'dlt') continue;
        out.push({
          title: t,
          url: it.url,
          source: '今日头条',
          time: it.time || '',
          tag: item.kw,
          game: g,
          author: '',
          desc: it.desc,
          gid: it.gid
        });
        kept++;
      }
      console.log('  ✓ 头条（' + item.kw + ' p' + page + '）：解析 ' + items.length + ' 条 → 采用 ' + kept + ' 条');
      /* 兜底：万一搜索页改版、链接抠不出来 → 老办法只收标题（页面不会突然空掉） */
      if (!items.length && page === 0) {
        const titles = [];
        const re = /"title"\s*:\s*"((?:[^"\\]|\\.){6,80})"/g;
        let m;
        while ((m = re.exec(html)) && titles.length < 12) {
          const s = stripTags(m[1]);
          if (s && !/^(首页|登录|注册|下载|更多|搜索)$/.test(s) && titles.indexOf(s) < 0) titles.push(s);
        }
        console.log('  ✓ 头条（' + item.kw + '）：' + titles.length + ' 条标题（只拿到标题，没有链接）');
        titles.forEach((tt) => out.push({
          title: tt,
          url: '',
          source: '今日头条',
          time: '',
          tag: item.kw,
          game: item.game,
          author: '',
          desc: ''
        }));
      }
      await sleep(1500);   /* 反爬：两次搜索之间隔 1.5s */
    }
  }
  /* 必须返回 { list, note } —— 调用方读 r.list.length；返回纯数组会报 undefined.length ✗ */
  const ng = { ssq: 0, dlt: 0 };
  out.forEach((x) => { if (ng[x.game] !== undefined) ng[x.game]++; });
  return { list: out, note: out.length ? (out.length + ' 条候选（双色球 ' + ng.ssq + ' / 大乐透 ' + ng.dlt + '）') : '没抓到' };
}

/* ---------- 主流程 ---------- */
const sources = [];
const all = [];
for (const [name, fn] of [['一起彩', fromYiqicai], ['500彩票', from500], ['今日头条', fromToutiao]]) {
  try {
    const r = await fn();
    sources.push({ name, ok: true, count: r.list.length, note: r.note || '' });
    all.push(...r.list);
    console.log(`  ✅ ${name}：${r.list.length} 条 ${r.note || ''}`);
  } catch (e) {
    sources.push({ name, ok: false, count: 0, note: e.message.slice(0, 80) });
    console.log(`  ✗ ${name}：${e.message.slice(0, 80)}`);
  }
}

/* 去重（同 url / 同标题）+ 排序（时间新的在前，无时间排最后）+ 取前 20 */
const seen = new Set();
const uniq = all.filter((x) => {
  const k = x.url + '|' + x.title;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
uniq.sort((a, b) => (b.time || 0) - (a.time || 0));
const list = uniq.slice(0, KEEP);

/* ============================================================
   __TOUTIAO_LIST__ 用户 2026-10-20：「免费资料是不是抓取的我给的头条资料
   根据下一期开什么奖抓什么 实时抓取」
   ------------------------------------------------------------
   问题：上面的 list 只留最新 20 篇，而「一起彩」有 107 篇、排序又稳定 → 20 篇里
         一条头条都进不去，青蛙家园的「免费资料」永远只剩一起彩的专家页。
   办法：单独存一份【头条全量】toutiao:[]，带 game（ssq / dlt）和关键词 tag，
         让 export-static.mjs 的免费资料能【按下一期彩种】筛。
   ⚠️ list 一个字都不动 —— export-football.mjs 那边还照旧读 list。
   ============================================================ */
const toutiaoList = uniq.filter((x) => x && x.source === '今日头条').slice(0, 60);

/* ============================================================
   __ART_BODY__ 给「免费资料」真正会展示的那几条抓正文
   ------------------------------------------------------------
   用户 2026-10-21：「文章资料抓二十条，最好都带正文」
   ------------------------------------------------------------
   · 目标：双色球 10 条 + 大乐透 10 条 = 20 条【带正文】
   · 两个彩种【轮流】抓（不然前 10 次全花在双色球上）
   · 抓不到正文的条目留着 desc（搜索页摘要），页面照样能点开看摘要
   · 逐条间隔 0.7s（头条反爬：连发会 ECONNRESET；实测 0.7s 稳定）
   · 最多试 40 条 / 总耗时上限 110s：源站有单条卡死（20s 不回包）的情况，
     加上硬上限，宁可这次少几条，也不能把整轮构建拖住。
   · list 与 toutiao 里是【同一批对象引用】→ 抓到的 body 两边都有
   ============================================================ */
const BODY_PER_GAME = 12;          /* 每个彩种抓 12 条正文 → 留 2 条余量（去重/改回彩种会吃掉几条） */
const BODY_WANT = 20;              /* 页面「免费资料」显示 20 条（双色球 10 + 大乐透 10） */
const BODY_MAX_TRIES = 40;         /* 最多试 40 条（成功率约 9 成，24 条正文够） */
const BODY_DEADLINE_MS = 110000;   /* 正文抓取总预算 110s */
const bodyStat = { tried: 0, ok: 0, fail: 0, want: BODY_WANT };
const bodyOk = { ssq: 0, dlt: 0 };
const triedSet = new Set();
const bodyTargets = [];
let bodyStart = Date.now();
let bodyStop = '';
while (bodyStat.ok < BODY_PER_GAME * 2 && bodyStat.tried < BODY_MAX_TRIES) {
  if (Date.now() - bodyStart > BODY_DEADLINE_MS) { bodyStop = '时间预算用完'; break; }
  /* 轮流挑下一个：当前哪个彩种【正文最少】就先抓它（自带均衡 + 有上限） */
  let pick = null;
  let pickG = '';
  for (const g of ['ssq', 'dlt']) {
    if (bodyOk[g] >= BODY_PER_GAME) continue;
    if (pick && bodyOk[g] >= bodyOk[pickG]) continue;
    for (const it of toutiaoList) {
      if (!it || !it.gid || it.body || it.game !== g || triedSet.has(it.gid)) continue;
      pick = it; pickG = g; break;
    }
  }
  if (!pick) {
    /* 某个彩种候选耗尽 → 退一步：抓剩下任意双色球/大乐透的（页面按彩种轮流取，多抓不亏） */
    for (const it of toutiaoList) {
      if (!it || !it.gid || it.body || triedSet.has(it.gid)) continue;
      if (it.game !== 'ssq' && it.game !== 'dlt') continue;
      pick = it; pickG = it.game; break;
    }
  }
  if (!pick) { bodyStop = '候选用完'; break; }
  triedSet.add(pick.gid);
  bodyStat.tried++;
  const got = await fetchToutiaoBody(pick.gid);
  if (got.body) {
    pick.body = got.body;
    bodyStat.ok++;
    if (bodyOk[pickG] !== undefined) bodyOk[pickG]++;
    /* 标题改用文章自己的标题 → 「点开的正文」和「看到的标题」一定是同一篇 */
    if (got.title && got.title.length >= 4) pick.title = got.title;
  } else {
    bodyStat.fail++;
    /* 抓不到正文：至少把源站自己给的预览塞进 desc（微头条模板走这条） */
    if (!String(pick.desc || '').trim() && got.desc) pick.desc = got.desc;
    if (!String(pick.desc || '').trim() && !pick.body) {
      /* 正文和摘要都没有 → 这条【不往页面塞】（用户：都没有 → 不给，
         页面就少一行，不能出现点不动的死标题） */
      pick.drop = true;
    }
  }
  bodyTargets.push(pick);
  console.log(`    ${got.body ? '✔' : '✗'} [${pickG} ${bodyOk[pickG] || 0}/${BODY_PER_GAME}] 正文 ${String(got.body.length).padStart(4)} 字 / 摘要 ${String((pick.desc || '').length).padStart(3)} 字  ${String(pick.title).slice(0, 26)}`);
  await sleep(700);
}
/* 抓完把【有正文的】排到 toutiao 最前面：export-static 的免费资料按数组顺序取，
   排在后面的会先被 desc-only 的条目挤掉 */
toutiaoList.sort((a, b) => ((b.body ? 1 : 0) - (a.body ? 1 : 0)) ||
  ((b.desc ? 1 : 0) - (a.desc ? 1 : 0)));
for (const it of toutiaoList) if (it && it.drop) it.drop = true;
console.log(`  · 正文合计：成功 ${bodyStat.ok}/${bodyStat.tried} 条（双色球 ${bodyOk.ssq} · 大乐透 ${bodyOk.dlt}）` + (bodyStop ? ' · 提前结束：' + bodyStop : ''));

/* __ART_20__ 只有【有正文或摘要】的才写进 toutiao：用户要求「都没有 → 不给」，
   页面上绝不能出现点不动的死标题（原来那些微头条模板条目就是这个问题） */
const ttFinal = toutiaoList.filter((x) => x && (String(x.body || '').trim() || String(x.desc || '').trim()));
bodyStat.ok = ttFinal.filter((x) => x && x.body).length;
bodyStat.withDesc = ttFinal.filter((x) => x && !x.body && x.desc).length;
bodyStat.games = bodyOk;
bodyStat.sec = Math.round((Date.now() - bodyStart) / 1000);

const out = {
  updated: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
  sources,
  total: uniq.length,
  bodies: bodyStat,
  list,
  toutiao: ttFinal
};
const js = `/* jc-articles.js —— 竞彩专家推荐文章（build-jc-articles.mjs 生成，勿手改）
   抓取时间：${out.updated} · 合并去重后 ${uniq.length} 篇，取最新 ${list.length} 篇
   头条单列：${ttFinal.length} 条（其中带正文 ${bodyStat.ok} 条 · 免费资料按「下一期彩种」从中筛 20 条） */
const JC_ARTICLES = ${JSON.stringify(out, null, 1)};
`;
fs.writeFileSync(OUT, js, 'utf8');
/* 【backoff 闸门】写成功 → 记下这次成功时间 */
gateMarkSuccess();
console.log(`\n✅ 已写入 jc-articles.js（${(Buffer.byteLength(js) / 1024).toFixed(1)} KB，${list.length} 篇）`);

/* ============================================================
   【顺便写 materials-data.js · 用户 2026-10-19「抓最近的 每一小时更新」】
   云端每小时会跑本脚本 → 「免费资料（点标题看原文）」区块也跟着更新
   字段和 data-store.js 的 addMaterial() 一致：id / text / time / url / games
   ============================================================ */
try {
  const mlist = list.slice(0, 20).map((a, i) => ({
    id: 'm' + (i + 1),
    text: String(a.title || a.text || '').slice(0, 120),
    time: String(a.time || out.updated || ''),
    url: String(a.url || ''),
    games: Array.isArray(a.games) ? a.games : [],
    author: String(a.author || '').slice(0, 30)
  })).filter((x) => x.text);
  const mjs = '/* materials-data.js —— 资料存档（build-jc-articles.mjs 自动写入，勿手改） */\n' +
    'const MATERIALS_DATA = ' + JSON.stringify({ updated: out.updated || '', list: mlist }, null, 1) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'materials-data.js'), mjs, 'utf8');
  console.log('  ✅ materials-data.js 已同步写入 ' + mlist.length + ' 条（免费资料区块会自动更新）');
} catch (e) {
  console.log('  ⚠️ 写 materials-data.js 失败（不影响正文）：' + e.message);
}
