/* ============================================================
   fetch-zx-news.mjs —— 「智讯」资讯抓取器（独立运行，绝不进主构建链路）
   ------------------------------------------------------------
   产物：zx-news.json  →  export-static.mjs 的【智讯】卡优先读它

   为什么要多源 + 重试：
     · 500 的资讯频道（zx.500.com）实测是腾讯 EdgeOne 防护
         - 无头 Chrome           → HTTP 567「请求已被拦截」（硬拦截）
         - 无头 Chrome + 真 UA   → 「Security Verification」真人验证页
         - 纯 fetch（本机/云端）  → 988B 或 16KB 验证页
       所以【不把 500 当唯一来源】，只在有本机浏览器的时侯顺手试一把。
     · 真正稳定的是普通 HTTP 就能取的资讯站：
         新浪彩票 sports.sina.com.cn/lottery/  ← 主力（4 个彩种全覆盖，几百条带日期链接）
         中彩网   www.zhcw.com/xinwen/ + /     ← 备源
       这两个在 GitHub 美国 IP 上也是纯 HTTP 就能拿到，不依赖浏览器。

   用法：
     node fetch-zx-news.mjs                 本机：多源 + 抓不到一直重试（默认 30 轮）
     node fetch-zx-news.mjs --cloud         云端：纯 HTTP，20 轮 / 10 分钟封顶
     node fetch-zx-news.mjs --once          只跑 1 轮
     node fetch-zx-news.mjs --probe         只探源，不写文件
     node fetch-zx-news.mjs --no-browser    不试 500（云端默认就走这条）
     node fetch-zx-news.mjs --rounds=50 --interval=20 --timeout=900

   退出码：0 已写入有效数据 · 1 本轮全失败（保留上次的 zx-news.json）· 2 超时
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'zx-news.json');

/* ---------- 参数 ---------- */
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
const USE_BROWSER = !has('--no-browser') && !CLOUD;
const ROUNDS = ONCE ? 1 : numOf('--rounds', CLOUD ? 20 : 30);
const INTERVAL = numOf('--interval', CLOUD ? 30 : 20);      /* 秒 */
const TIMEOUT = numOf('--timeout', CLOUD ? 540 : 1800);     /* 秒 */

const t0 = Date.now();
const el = () => Math.round((Date.now() - t0) / 1000);
const log = (...a) => console.log('[zx ' + el() + 's]', ...a);

/* 进程硬超时：超时退出码 2，绝不无限挂着 */
const killer = setTimeout(() => {
  log('⏱ 到 ' + TIMEOUT + 's 上限，本轮收工（保留上次数据）');
  process.exit(2);
}, TIMEOUT * 1000);
killer.unref && killer.unref();

/* ---------- 页面禁用词（页面上一个字都不许出现） ----------
   站名也算：页面上只能说「最新资讯」「每期更新」，不能出现任何站名。 */
const BANNED = ['500', '抓取', '来源', '新浪', '中彩'];
function pageSafe(s) {
  const t = String(s || '');
  for (const w of BANNED) if (t.includes(w)) return false;
  return true;
}

/* ---------- 文本清洗 ---------- */
function decodeEnt(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
function clean(s) {
  return decodeEnt(String(s || '').replace(/<[^>]*>/g, ' '))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- 彩种分类（页面只有这 4 个药丸） ---------- */
const GIDS = ['ssq', 'dlt', 'fc3d', 'pl3'];
const GNAME = { ssq: '双色球', dlt: '大乐透', fc3d: '福彩3D', pl3: '排列3' };
const RULES = [
  ['ssq', /双色球/],
  ['dlt', /大乐透/],
  ['fc3d', /福彩\s*3\s*D|福彩3D|(^|[^0-9])3D\s*(游戏|玩法|开奖|第|预测|推荐)/i],
  ['pl3', /排列\s*3|排列三|排三/],
];
function classify(title) {
  for (const [gid, re] of RULES) if (re.test(title)) return gid;
  return null;
}

/* ---------- 来源表 ---------- */
/* need: http = 普通 fetch（云端也能跑）；browser = 必须真浏览器（仅本机试） */
const SOURCES = [
  { id: 'sina', name: '新浪彩票', url: 'https://sports.sina.com.cn/lottery/', need: 'http' },
  /* 同一个站点的另一个入口：主入口抽风时这条还能顶一下（实测同样是 200 / 300KB+） */
  { id: 'sina2', name: '新浪彩票', url: 'https://sports.sina.com.cn/lottery/index.shtml', need: 'http' },
  /* 下面两个【本机能过、GitHub 美国 IP 过不去】（实测 cloud 那次 TypeError），
     留着当本机备份：云端失败不影响结果，脚本会记一条 ERR 继续用新浪。 */
  { id: 'zhcw-news', name: '彩票资讯', url: 'https://www.zhcw.com/xinwen/', need: 'http' },
  { id: 'zhcw-home', name: '彩票资讯', url: 'https://www.zhcw.com/', need: 'http' },
  { id: 'zx-500', name: '资讯频道', url: 'https://zx.500.com/jczq/', need: 'browser' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

/* ---------- 普通 HTTP（带重试：单次挂掉不算失败） ---------- */
async function fetchHttp(url, timeoutMs, tries) {
  const n = tries || 3;
  let last = null;
  for (let i = 1; i <= n; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || 20000);
    try {
      const r = await fetch(url, {
        signal: ctl.signal,
        redirect: 'follow',
        headers: {
          'user-agent': UA,
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'cache-control': 'no-cache',
        },
      });
      const buf = Buffer.from(await r.arrayBuffer());
      let html = buf.toString('utf8');
      /* 中文站常见 GBK：按 meta 判一下，避免乱码标题 */
      if (/charset\s*=\s*["']?(gb2312|gbk|gb18030)/i.test(html.slice(0, 3000))) {
        try { html = new TextDecoder('gbk').decode(buf); } catch (e) { /* 保持 utf8 */ }
      }
      return { ok: r.ok, status: r.status, html: html, len: buf.length };
    } catch (e) {
      last = e;
      if (i < n) await new Promise((res) => setTimeout(res, 1200 * i));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last || new Error('fetch failed');
}

/* ---------- 真浏览器（CDP，仅本机） ----------
   用途：给需要过反爬/渲染的来源留一条路。
   注意：500 用 --headless=new 会被 567 硬拦，加真 UA 会掉到真人验证页，
        所以它永远会失败 —— 这里只如实记录，不重试浪费配额。 */
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
function findChrome() {
  for (const p of CHROME_PATHS) { try { if (fs.existsSync(p)) return p; } catch (e) {} }
  return null;
}

async function fetchBrowser(url, waitMs) {
  const exe = findChrome();
  if (!exe) return { ok: false, status: 'NO_BROWSER', html: '', len: 0 };
  const port = 9500 + Math.floor(Math.random() * 300);
  const ud = path.join(os.tmpdir(), 'zxfetch_' + Date.now() + '_' + Math.floor(Math.random() * 1e4));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const proc = spawn(exe, [
    '--headless=new', '--remote-debugging-port=' + port,
    '--user-data-dir=' + ud, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-blink-features=AutomationControlled',
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });

  let out = { ok: false, status: 'BROWSER_FAIL', html: '', len: 0 };
  try {
    let ver = null;
    for (let i = 0; i < 60 && !ver; i++) {
      try { ver = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json(); }
      catch (e) { await sleep(250); }
    }
    if (!ver) throw new Error('cdp not ready');

    let tgt;
    try { tgt = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json(); }
    catch (e) { tgt = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank')).json(); }

    const ws = new WebSocket(tgt.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error('ws error'));
      setTimeout(() => rej(new Error('ws timeout')), 15000);
    });
    let id = 0; const pend = new Map();
    ws.onmessage = (ev) => {
      try { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } } catch (e) {}
    };
    const send = (method, params) => {
      const mid = ++id;
      ws.send(JSON.stringify({ id: mid, method: method, params: params || {} }));
      return new Promise((res, rej) => {
        pend.set(mid, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
        setTimeout(() => { if (pend.has(mid)) { pend.delete(mid); rej(new Error('timeout ' + method)); } }, 30000);
      });
    };
    await send('Page.enable');
    await send('Network.enable');
    await send('Runtime.enable');
    /* 抹掉 headless 指纹 + 用真 UA */
    await send('Network.setUserAgentOverride', {
      userAgent: UA, acceptLanguage: 'zh-CN,zh;q=0.9', platform: 'Win32',
    });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'Object.defineProperty(navigator,"webdriver",{get:()=>undefined});',
    });
    const nav = await send('Page.navigate', { url: url });
    await sleep(waitMs || 6000);
    const ev = await send('Runtime.evaluate', {
      expression: 'JSON.stringify({t:document.title,h:document.documentElement.outerHTML})',
      returnByValue: true,
    });
    const v = JSON.parse(ev.result.value);
    const cookies = await send('Network.getCookies', { urls: [url] });
    out.html = v.h || '';
    out.len = Buffer.byteLength(out.html, 'utf8');
    out.status = nav.errorText || v.t || 'ok';
    out.ok = !!out.html && !/Security Verification|请求已被拦截|验证连接安全性/.test(v.t || '');
    out.cookies = (cookies.cookies || []).map((c) => c.name);
    try { ws.close(); } catch (e) {}
  } catch (e) {
    out.status = 'BROWSER_ERR:' + String((e && e.message) || e).slice(0, 60);
  } finally {
    try { proc.kill(); } catch (e) {}
    await sleep(200);
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
  }
  return out;
}

/* ---------- 从 HTML 抽资讯 ---------- */
function extract(html, baseUrl) {
  const items = [];
  const NAV = /^(更多|首页|登录|注册|下载|返回|上一页|下一页|关于我们|广告服务|联系我们|English|网站地图|版权声明|免责声明)/;
  const re = /<a([^>]*?)href=["']([^"']+)["']([^>]*?)>([\s\S]{4,160}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[2];
    if (!href || /^(javascript:|mailto:|#)/i.test(href)) continue;
    const title = clean(m[4]);
    if (title.length < 8 || title.length > 90) continue;
    if (NAV.test(title)) continue;

    let abs;
    try { abs = new URL(href, baseUrl).href; } catch (e) { continue; }
    if (!/^https?:/i.test(abs)) continue;

    /* 日期：链接里带 /2026-10-19/ 或 2026/10/19，其次才是标题里的 */
    let date = '';
    let dm = abs.match(/(20\d\d)[-/](\d{1,2})[-/](\d{1,2})/);
    if (!dm) dm = title.match(/(20\d\d)[-/年](\d{1,2})[-/月](\d{1,2})/);
    if (dm) {
      const y = dm[1], mo = String(dm[2]).padStart(2, '0'), d = String(dm[3]).padStart(2, '0');
      if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) date = y + '-' + mo + '-' + d;
    }
    if (!date) continue;                       /* 没日期的不收（用户要日期） */

    const gid = classify(title);
    if (!gid) continue;                        /* 分不出彩种的不收（页面只有 4 个药丸） */
    if (!pageSafe(title)) continue;            /* 页面禁用词：直接丢掉这条 */
    items.push({ gid: gid, title: title, date: date, url: abs });
  }
  return items;
}

/* ---------- 一轮抓取 ---------- */
async function round(n) {
  const got = new Map();     /* gid -> items */
  const stat = [];
  for (const s of SOURCES) {
    const useBrowser = s.need === 'browser';
    if (useBrowser && !USE_BROWSER) { stat.push(s.id + ':skip'); continue; }
    try {
      const r = useBrowser ? await fetchBrowser(s.url, 6000) : await fetchHttp(s.url, 20000);
      let items = [];
      if (r.ok && r.html) items = extract(r.html, s.url);
      stat.push(s.id + ':' + (r.status || '?') + '/' + (r.len || 0) + 'B/' + items.length);
      if (!items.length && useBrowser) {
        log('  · ' + s.id + ' → ' + r.status + '（' + r.len + 'B，反爬页，无正文）');
        continue;
      }
      for (const it of items) {
        if (!got.has(it.gid)) got.set(it.gid, []);
        got.get(it.gid).push(it);
      }
    } catch (e) {
      stat.push(s.id + ':ERR(' + String((e && e.name) || e).slice(0, 20) + ')');
    }
  }
  /* 去重 + 按日期倒序 + 每个彩种最多 8 条 */
  const games = {};
  const seen = new Set();
  const seenUrl = new Set();
  for (const gid of GIDS) {
    const arr = (got.get(gid) || [])
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .filter((it) => {
        const k = gid + '|' + it.title;
        if (seen.has(k)) return false;
        seen.add(k);
        /* 同一个链接换个标题也算重复（新浪同一条稿子会挂两个标题） */
        const ku = gid + '|' + it.url;
        if (seenUrl.has(ku)) return false;
        seenUrl.add(ku);
        return true;
      })
      .slice(0, 8)
      .map((it) => ({ title: it.title, date: it.date, url: it.url }));
    if (arr.length) games[gid] = arr;
  }
  log('轮 ' + n + ' → ' + stat.join('  ') + ' ⇒ ' + GIDS.map((g) => g + '=' + ((games[g] || []).length)).join(' '));
  return games;
}

/* ---------- 读上次的（失败就保它，绝不写空） ---------- */
function loadPrev() {
  try {
    if (!fs.existsSync(OUT)) return null;
    const d = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    if (!d || !d.games || typeof d.games !== 'object') return null;
    return d;
  } catch (e) { return null; }
}

/* ---------- 合并：【并集】不是替换 ----------
   规则：新抓的 + 上次的，按链接去重（新抓的优先），日期倒序，每彩种留 8 条。
   好处：某个源偶尔抽风少给几条时，绝不会把已经抓到的好数据冲掉；
        超过 45 天的旧闻自动淘汰，不会一直挂着老标题。 */
const STALE_DAYS = 45;
function daysOld(dateStr) {
  const t = Date.parse(String(dateStr) + 'T00:00:00Z');
  if (!isFinite(t)) return 1e9;
  return (Date.now() - t) / 86400000;
}

function merge(prev, fresh) {
  const games = {};
  let fromPrev = 0;
  for (const gid of GIDS) {
    const nw = (fresh && fresh[gid]) || [];
    const old = (prev && prev.games && prev.games[gid]) || [];
    const freshUrls = new Set(nw.map((x) => x.url));
    const seen = new Set();
    const out = [];
    for (const it of nw.concat(old)) {
      if (!it || !it.title || !it.date) continue;
      if (!pageSafe(it.title)) continue;
      if (daysOld(it.date) > STALE_DAYS) continue;
      const k = it.url || it.title;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    /* 日期倒序；同日期时 Array.sort 稳定 → 新抓的排前面 */
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const top = out.slice(0, 8);
    if (top.length) games[gid] = top;
    fromPrev += top.filter((x) => x.url && !freshUrls.has(x.url)).length;
  }
  const count = Object.keys(games).reduce((s, g) => s + games[g].length, 0);
  return { games: games, count: count, carried: fromPrev };
}

function validate(games) {
  const gids = Object.keys(games || {});
  const count = gids.reduce((s, g) => s + games[g].length, 0);
  return count >= 4 && gids.length >= 2;
}

/* ---------- 落盘（内容没变就不写，免得每小时一次空提交） ---------- */
function writeOut(games, sourceTag) {
  const prev = loadPrev();
  const body = {
    updated: new Date().toISOString(),
    note: '智讯资讯（标题+日期+链接+彩种）· 页面只读标题与日期',
    source: sourceTag,
    count: Object.keys(games).reduce((s, g) => s + games[g].length, 0),
    games: games,
  };
  /* 内容指纹：只比 games，不含 updated，避免无意义提交 */
  const fp = (o) => JSON.stringify(o && o.games ? o.games : {});
  if (prev && fp(prev) === fp(body)) {
    /* 内容一样：只刷新 updated，不制造 diff */
    log('内容与上次一致（' + body.count + ' 条），不写文件');
    return { changed: false, count: body.count };
  }
  fs.writeFileSync(OUT, JSON.stringify(body, null, 2) + '\n', 'utf8');
  log('✅ 已写 zx-news.json：' + body.count + ' 条 / ' +
    Object.keys(games).map((g) => GNAME[g] + ' ' + games[g].length).join('、'));
  return { changed: true, count: body.count };
}

/* ============================================================
   主流程
   ============================================================ */
(async function main() {
  log('模式：' + (CLOUD ? '云端' : '本机') +
    ' · 浏览器=' + (USE_BROWSER ? '可用' : '不用') +
    ' · 轮数=' + ROUNDS + ' · 间隔=' + INTERVAL + 's · 上限=' + TIMEOUT + 's');

  const prev = loadPrev();
  if (prev) log('上次数据：' + (prev.count || 0) + ' 条（抓不到就保它）');

  /* 跨轮累积：某轮某个源抽风，后面几轮补回来，绝不用「这一轮的空」去覆盖上一轮的好 */
  const acc = {};
  const addTo = (src) => {
    for (const g of Object.keys(src || {})) {
      if (!acc[g]) acc[g] = [];
      for (const it of src[g]) acc[g].push(it);
    }
  };

  let best = null;
  for (let n = 1; n <= ROUNDS; n++) {
    let fresh = {};
    try { fresh = await round(n); } catch (e) { log('轮 ' + n + ' 异常：' + (e && e.message)); }
    addTo(fresh);

    const merged = merge(prev, acc);
    if (validate(merged.games)) best = merged;

    const covered = GIDS.filter((g) => (acc[g] || []).length > 0);
    if (covered.length >= GIDS.length) {
      log('4 个彩种全抓到，收工');
      break;
    }
    if (n < ROUNDS) {
      log('只抓到 ' + covered.length + '/4 个彩种（' + covered.join(',') + '），' +
        INTERVAL + 's 后再来（不满意就一直抓）');
      await new Promise((r) => setTimeout(r, INTERVAL * 1000));
    }
  }
  if (best && best.carried) log('（其中 ' + best.carried + ' 条来自上次的数据，保留不丢）');

  if (PROBE) {
    log('--probe：只探源，不写文件');
    process.exit(best ? 0 : 1);
  }

  if (!best) {
    log('❌ 本轮全失败 → 不覆盖 zx-news.json（保留上次的）');
    process.exit(1);
  }

  writeOut(best.games, CLOUD ? 'cloud' : 'local');
  clearTimeout(killer);
  process.exit(0);
})().catch((e) => {
  log('❌ 未捕获异常：' + (e && e.stack || e));
  process.exit(1);
});
