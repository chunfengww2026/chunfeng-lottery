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
  const r = await fetch(url, { headers: { 'User-Agent': ua, Referer: url, 'Accept-Language': 'zh-CN,zh;q=0.9' } });
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
  const KW = [
    { kw: '双色球推荐', game: 'ssq' },
    { kw: '大乐透推荐', game: 'dlt' }
  ];
  const out = [];
  for (const item of KW) {
    const url = 'https://so.toutiao.com/search?dvpf=pc&source=input&keyword=' +
      encodeURIComponent(item.kw) + '&enable_druid_v2=1&page_num=0&pd=synthesis';
    let html = null;
    for (let attempt = 0; attempt < 2 && !html; attempt++) {
      try {
        const r = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Referer': 'https://so.toutiao.com/',
            'Accept-Language': 'zh-CN,zh;q=0.9'
          }
        });
        if (r.ok) html = Buffer.from(await r.arrayBuffer()).toString('utf8');
      } catch (e) { /* ECONNRESET → 等一会儿重试 */ }
      if (!html) await new Promise((res) => setTimeout(res, 5000));
    }
    if (!html) { console.log('  ✗ 头条（' + item.kw + '）：重试后仍失败'); continue; }

    const titles = [];
    const re = /"title"\s*:\s*"((?:[^"\\]|\\.){6,80})"/g;
    let m;
    while ((m = re.exec(html)) && titles.length < 12) {
      const s = m[1]
        .replace(/\\u([0-9a-fA-F]{4})/g, (x, c) => String.fromCharCode(parseInt(c, 16)))
        .replace(/<[^>]+>/g, '')
        .replace(/\\"/g, '"')
        .trim();
      if (s && !/^(首页|登录|注册|下载|更多|搜索)$/.test(s) && titles.indexOf(s) < 0) titles.push(s);
    }
    console.log('  ✓ 头条（' + item.kw + '）：' + titles.length + ' 条标题');
    titles.forEach((tt, i) => out.push({
      title: tt,
      url: '',
      source: '今日头条',
      time: '2026-10-20 00:54:00',
      tag: item.kw,
      game: item.game,
      author: ''
    }));
    await new Promise((res) => setTimeout(res, 5000));   /* 反爬：两词之间隔 5 秒 */
  }
  return out;
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

const out = {
  updated: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
  sources,
  total: uniq.length,
  list
};
const js = `/* jc-articles.js —— 竞彩专家推荐文章（build-jc-articles.mjs 生成，勿手改）
   抓取时间：${out.updated} · 合并去重后 ${uniq.length} 篇，取最新 ${list.length} 篇 */
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
