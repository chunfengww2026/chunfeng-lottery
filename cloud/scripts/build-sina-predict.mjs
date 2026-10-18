/* ============================================================
   build-sina-predict.mjs —— 抓「下一期」大乐透预测（新浪彩票）
   ------------------------------------------------------------
   目的：补上「专家推荐停在已开奖期」的缺口 —— 开奖前 1~2 天媒体会发
         下一期预测奖号，抓下来做「下一期参考」。

   实测要点（2026-10-18）：
     · 列表页 index_1.shtml 是最新一页；GBK 编码，必须 TextDecoder('gbk') ✗ 否则乱码
     · 期号短写：「118期」= 2026118
     · 【文章正文是 JS 渲染的】✗ 直接 fetch 拿不到号码（只有 2519 字外壳）
       ⇒ 必须用 headless Chrome 渲染后取 innerText ✓

   用法：
     node build-sina-predict.mjs                → 最新一期 + 1
     node build-sina-predict.mjs --issue 118    → 强制期号（测试解析）
     node build-sina-predict.mjs --max 3        → 最多 3 篇
     node build-sina-predict.mjs --headed       → 显示浏览器（调试）
   产出：sina-predict.json
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const dec = new TextDecoder('gbk');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const MAX_ARTICLES = Number(arg('--max', '5'));
const HEADED = process.argv.includes('--headed');

function loadConst(file, name) {
  const ctx = { console, window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8') + '\n;__O__=(typeof ' + name + '!=="undefined")?' + name + ':null;', ctx);
  return ctx.__O__;
}
let nextShort = '';
try {
  const iss = String(loadConst('draws.js', 'DRAW_DATA').games.dlt.issue || '');
  const n = parseInt(iss.slice(-3), 10);
  if (isFinite(n)) nextShort = String(n + 1);
} catch (e) {}
const FORCE = arg('--issue', '');
if (FORCE) nextShort = FORCE;
if (!nextShort) { console.log('  ❌ 定不下一期期号（无 --issue 且读不到 draws.js）'); process.exit(1); }
console.log('  目标期号（短写）：' + nextShort + ' 期' + (FORCE ? '（--issue 强制）' : '（最新开奖 +1）'));

/* ---------- ① 列表页：GBK 直连，找目标期号文章 ---------- */
async function getText(u) {
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://sports.sina.com.cn/' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return dec.decode(Buffer.from(await r.arrayBuffer()));
}
const articles = [];
const seen = new Set();
for (let p = 1; p <= 3 && articles.length < MAX_ARTICLES; p++) {
  let html;
  try { html = await getText('https://roll.sports.sina.com.cn/s_lotto_all/4/index_' + p + '.shtml'); } catch (e) { console.log('  ⚠️ 列表第 ' + p + ' 页失败：' + e.message); continue; }
  const links = [...html.matchAll(/<a[^>]+href="([^"]*sina\.com\.cn\/l\/[^"]*)"[^>]*>([\s\S]{0,90}?)<\/a>/g)]
    .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() }))
    .filter((x) => x.text.length > 8);
  for (const x of links) {
    if (seen.has(x.href)) continue;
    if (!x.text.includes(nextShort + '期')) continue;
    if (!/预测|推荐|胆码|分析/.test(x.text)) continue;
    seen.add(x.href);
    articles.push(x);
    if (articles.length >= MAX_ARTICLES) break;
  }
  console.log('  列表第 ' + p + ' 页：累计 ' + articles.length + ' 篇 ' + nextShort + ' 期文章');
}
if (!articles.length) {
  console.log('\n  ⚠️ 源头还没有 ' + nextShort + ' 期文章（开奖前 1~2 天才发）→ 本次不写文件');
  process.exit(0);
}

/* ---------- ② 文章页：headless Chrome 渲染后取正文 ---------- */
const CHROME = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser'].filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) { console.log('  ❌ 找不到 Chrome（云端 ubuntu-latest 自带，本机需装）'); process.exit(1); }
const PORT = 9950 + (Date.now() % 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(CHROME, [HEADED ? '' : '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--disable-component-update', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(process.env.TEMP || '.', '_sina_' + Date.now()),
  '--window-size=430,900', 'about:blank'].filter(Boolean), { stdio: 'ignore' });

let ws = null, id = 0;
const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('超时 ' + m)); } }, 60000);
});
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r && r.result ? r.result.value : null; };

function parseNums(text) {
  const flat = String(text).replace(/\s+/g, ' ');
  /* ⚠️ 必须在「后区」处截断：否则前区那一段会一路吃进后区的号（实测踩过） */
  const near = (label, max, stop) => {
    const i = flat.indexOf(label);
    if (i < 0) return [];
    let seg = flat.slice(i, i + 90);
    if (stop) { const j = seg.indexOf(stop); if (j > 0) seg = seg.slice(0, j); }
    return [...new Set((seg.match(/\d{1,2}/g) || []).map(Number).filter((n) => n >= 1 && n <= max))].slice(0, 8);
  };
  let front = near('前区', 35, '后区');
  let back = near('后区', 12);
  if (front.length < 3) {
    front = [...new Set((flat.match(/\b\d{2}\b/g) || []).map(Number).filter((n) => n >= 1 && n <= 35))].slice(0, 5);
  }
  if (back.length < 1) {
    back = [...new Set((flat.match(/\b\d{2}\b/g) || []).map(Number).filter((n) => n >= 1 && n <= 12))].slice(-2);
  }
  /* 后区最多 4 个（作者常给 2~4 个候选），前区最多 7 个 */
  return { front: front.slice(0, 7), back: back.slice(0, 4) };
}

const rows = [];
try {
  let t = null;
  for (let i = 0; i < 50 && !t; i++) {
    await sleep(400);
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); t = (l || []).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); } catch (e) {}
  }
  if (!t) throw new Error('CDP 没起来');
  ws = new WebSocket(t.webSocketDebuggerUrl);
  ws.onmessage = (e2) => { const m = JSON.parse(e2.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setUserAgentOverride', { userAgent: UA });
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 2, mobile: true });

  for (const a of articles) {
    try {
      await send('Page.navigate', { url: a.href });
      await sleep(3200);
      await ev('(function(){window.scrollTo(0, document.body.scrollHeight);return 1;})()');
      await sleep(900);
      const text = await ev('document.body.innerText');
      const nums = parseNums(text || '');
      rows.push({ url: a.href, title: a.text, front: nums.front, back: nums.back, chars: (text || '').length });
      console.log('   · ' + a.text.slice(0, 34) + '  前 ' + (nums.front.join(' ') || '—') + '  后 ' + (nums.back.join(' ') || '—') + '  (' + (text || '').length + ' 字)');
    } catch (e) { console.log('   · ' + a.text.slice(0, 34) + '  ❌ ' + e.message); }
  }
} catch (e) { console.log('  ❌ ' + e.message); } finally { try { child.kill(); } catch (e) {} }

const out = {
  updated: new Date(Date.now() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 16),
  game: 'dlt', issueShort: nextShort, count: rows.length, rows
};
fs.writeFileSync(path.join(ROOT, 'sina-predict.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('\n  ✅ 已写 sina-predict.json（' + rows.length + ' 篇 · ' + nextShort + ' 期）');
