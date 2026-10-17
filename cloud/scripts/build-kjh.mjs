/* ============================================================
   build-kjh.mjs —— 抓「开机号」+「选号直播」数据
   ------------------------------------------------------------
   产物：kjh-data.js（const KJH_DATA = { … }）

   抓什么（2026-10-16 实测，两个源都是服务端渲染，能直接抓到）：

   ① 开机号  https://m.yiqicai.com/kjh      （手机版，结构最干净）
      页面真实结构（下面 KJH_ITEM 就是照这个切块的）：
        <div class="cm-lotto-x lotto-time-x">
          <div class="lotto-time-issue">
            <h3 class="time-tit">双色球<span class="start-num-issue">第26119期</span></h3>
          </div>
          <div class="draw-ball">
            <div class="draw-label">开机号</div>
            <div class="draw-ball-info">
              <div class="time-ball">
                <em>02</em><em>03</em><em>05</em><em>15</em><em>29</em><em>33</em>
                <em class="blue-ball">16</em>            ← 带 blue-ball 的是蓝球/特别号
              </div>
              <dl class="lotto-data-row">
                <dd>和值: 87</dd><dd>奇偶: 5:1</dd><dd>大小: 2:4</dd><dd>跨度: 31</dd>
              </dl>
            </div>
          </div>
          <dl class="time-count"><dt>开奖时间</dt>
            <dd>2026年10月18日 星期日 21:15</dd></dl>
        </div>
      定位口径（全部按 class 名，不依赖 data-v-xxxx 那种会变的编译哈希）：
        · 一个彩种 = class="cm-lotto-x"  … 实测 8 个：双色球 / 超级大乐透 /
          福彩3D / 快乐8 / 排列3 / 排列5 / 七星彩 / 七乐彩
        · 彩种名   = <h3 class="time-tit"> 里、<span class="start-num-issue"> 前的文字
        · 期号     = class="start-num-issue" 里的「第NNNNN期」
        · 号码     = class="time-ball" 里的 <em>；class 含 blue-ball 的算蓝球
        · 附加     = class="lotto-data-row" 里的 <dd>（和值/奇偶/大小/跨度）
        · 开奖时间 = class="time-count" 里的 <dd>（是这个彩种的下一期开奖时间）
      【试机号】没有：m.yiqicai.com/kjh 里唯一一处「试机号」是导航链接
      「3D试机号 /kj/fc3dkj/sjh.html」，不属于开机号数据，所以本文件的
      每个彩种都【不带试机号字段】—— 有就填、没有就留空，这里是没有。

   ② 选号直播  https://m.yiqicai.com/live  （桌面版；手机版条目不是链接）
      页面真实结构：
        <div class="live-adx-lg">当前暂无直播</div>          ← 开播状态
        <h1>精彩回放</h1> <a class="cm-radius-btn" href="/live/list/">更多直播</a>
        <div class="live-list">
          <a href="/live/list/history90864.html" target="_blank" class="live-item">
            <div class="live-picture" style="background-image:url(...)">
              <span class="live-top-tag"><span class="view-num">194人看过</span></span></div>
            <div class="live-anchor">
              <div class="live-anchor-avatar" style="background-image:url(...)"></div>
              <dl class="live-anchor-info">
                <dt class="live-anchor-name">快乐八小义</dt>
                <dd class="live-anchor-lotto">快乐8</dd>
                <dd class="live-anchor-txt">小义快乐八260期分析：小车选五复七中6</dd>
              </dl></div>
          </a>…
      所以「选号直播」能抓到的是【回放列表】（标题/主播/彩种/看过人数/详情页链接）
      ＋【当前有没有直播在播】。真正的直播画面是站点自己的播放器，
      抓不到也不该抓 —— 页面上的处理：本区块列出抓到的回放，
      并给一个「打开直播页」外链，要真的看直播就点它。
      条目里的封面图是 inline background-image，本文件【只取文字、不取图】：
      不下载、不外链图片 → 网页图位数量（data-image）一个不增。

   更新频率：每天 2 点一次（跟着 daily-update.mjs）。
     开机号本来就是每天开奖前的一次性号码，一天一变；
     直播回放列表也是低频变化。用户明确要求「每天2点抓取更新就好了」。

   稳：
     · 两个源各 1 次请求，之间延时 DELAY_MS，用正常 User-Agent
     · 失败退避：照 update-football-smart.mjs 的写法
         - 单个源失败 → 该部分【保留上一次】kjh-data.js 里的内容
         - 两个源【全失败】→ 记一次失败；连续 FAIL_PAUSE_AFTER 轮全失败 → 暂停
     · 抓不到不崩，也不覆盖上一次的 kjh-data.js
     · 一律 UTF-8 无 BOM；不涉及任何 token，脚本里没有任何密钥

   退出码：
     0  = 抓到并写入了新的 kjh-data.js（调用方可以继续出页面 + 同步）
     10 = 本轮跳过（退避中 / 两个源全失败）—— 保留上一次数据，调用方别同步
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'kjh-data.js');
const LOG = path.join(ROOT, '_kjh.log');
const STATE = path.join(ROOT, '_kjh-backoff.json');

const KJH_URL = 'https://m.yiqicai.com/kjh';
const LIVE_URL = 'https://m.yiqicai.com/live';
const LIVE_HOME = 'https://m.yiqicai.com/live';

/* 正常浏览器 UA：手机版页面用手机 UA，桌面版页面用桌面 UA */
const UA_M = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_D = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* 两个请求之间的延时（ms）—— 只有 2 个请求，别把人家站点打痛 */
const DELAY_MS = 1200;

/* 失败退避（写法照 update-football-smart.mjs） */
const FAIL_PAUSE_AFTER = 6;    // 连续这么多轮【两个源都失败】→ 暂停
const PAUSE_MINUTES = 120;     // 暂停时长（分钟）

/* 回放列表最多留几条：源页一屏 12 条，全留（纯文字，页面上就是 12 行） */
const MAX_LIVE = 12;

/* 彩种名 → 页面用的 key（顺序 = 页面上「开机号」区块的顺序） */
const GAME_ORDER = ['ssq', 'dlt', 'fc3d', 'kl8', 'pl3', 'pl5', 'qxc', 'qlc'];
const NAME2KEY = {
  '双色球': 'ssq',
  '大乐透': 'dlt', '超级大乐透': 'dlt',
  '福彩3D': 'fc3d', '福彩3d': 'fc3d', '3D': 'fc3d',
  '快乐8': 'kl8',
  '排列3': 'pl3', '排列三': 'pl3',
  '排列5': 'pl5', '排列五': 'pl5',
  '七星彩': 'qxc',
  '七乐彩': 'qlc'
};
/* 数字彩（每位 1 个数字，0 就是「0」不能写成「00」） */
const DIGIT_GAMES = { fc3d: 1, pl3: 1, pl5: 1 };

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

const stripTags = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/* ---------- 一次带重试的抓取 ---------- */
async function grab(url, ua, referer) {
  let err = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    err = '';
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Referer': referer
        },
        signal: AbortSignal.timeout(25000)
      });
      if (!r.ok) err = 'HTTP ' + r.status;
      else return { ok: true, html: await r.text() };
    } catch (e) {
      err = String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 100);
    }
    if (attempt === 1) { log(`   ↻ ${url} 第 1 次失败（${err}），1.5 秒后重试`); await sleep(1500); }
  }
  return { ok: false, err };
}

/* ============================================================
   ① 解析「开机号」页
   ============================================================ */
function parseKjh(html) {
  const games = {};
  /* 按彩种切块：每块的起点就是这个 class。
     注意同时存在 cm-lotto-x 与 lotto-time-x，按前者切即可。 */
  const chunks = String(html).split('<div class="cm-lotto-x');
  chunks.shift();                                  // 第 0 段是列表头

  for (const c of chunks) {
    /* 彩种名 = <h3 class="time-tit"> 里、<span class="start-num-issue"> 之前 */
    const nm = /<h3 class="time-tit">\s*([\s\S]*?)<span class="start-num-issue"/.exec(c);
    if (!nm) continue;
    const name = stripTags(nm[1]);
    const key = NAME2KEY[name];
    if (!key) continue;

    /* 必须是「开机号」那一块（页面上这块也可能出现别的 label） */
    const labelM = /class="draw-label"[^>]*>([\s\S]*?)<\/div>/.exec(c);
    const label = labelM ? stripTags(labelM[1]) : '';

    /* 期号 */
    const iss = /class="start-num-issue"[^>]*>\s*第\s*(\d+)\s*期/.exec(c);
    const issue = iss ? iss[1] : '';

    /* 号码：time-ball 里的 <em>；class 含 blue-ball 的算蓝球 */
    const ballM = /class="time-ball"[^>]*>([\s\S]*?)<\/div>/.exec(c);
    const ballHtml = ballM ? ballM[1] : '';
    const nums = [];
    const blue = [];
    const EM = /<em([^>]*)>([\s\S]*?)<\/em>/g;
    let em = null;
    while ((em = EM.exec(ballHtml)) !== null) {
      const cls = em[1] || '';
      let v = stripTags(em[2]);
      if (!/^\d+$/.test(v)) continue;
      /* 数字彩每位只写 1 个数字：0 就是「0」，不能写「00」 */
      if (DIGIT_GAMES[key]) v = String(Number(v));
      if (/blue-ball/.test(cls)) blue.push(v);
      else nums.push(v);
    }

    /* 附加数据：和值 / 奇偶 / 大小 / 跨度 */
    const rowM = /class="lotto-data-row"[^>]*>([\s\S]*?)<\/dl>/.exec(c);
    const extra = [];
    if (rowM) {
      const DD = /<dd[^>]*>([\s\S]*?)<\/dd>/g;
      let dd = null;
      while ((dd = DD.exec(rowM[1])) !== null) {
        const t = stripTags(dd[1]);
        if (t) extra.push(t);
      }
    }

    /* 该彩种的下一期开奖时间 */
    const tm = /class="time-count"[^>]*>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/.exec(c);
    const time = tm ? stripTags(tm[1]) : '';

    games[key] = { name, issue, nums, blue, extra, time, label };
  }
  return games;
}

/* ============================================================
   ② 解析「选号直播」页
   ============================================================ */
function parseLive(html) {
  const src = String(html);

  /* 开播状态：live-adx-lg 里的文字（实测没在播时是「当前暂无直播」） */
  const stM = /class="live-adx-lg"[^>]*>([\s\S]*?)<\/div>/.exec(src);
  const statusText = stM ? stripTags(stM[1]) : '';
  const onAir = !!(statusText && !/暂无直播/.test(statusText));

  const items = [];
  /* 条目：<a href="…" target="_blank" class="live-item" …>…</a>
     href 在 class 之前，所以必须整条匹配，不能只按 class 切。 */
  const ITEM = /<a\s+href="([^"]+)"[^>]*class="live-item"[^>]*>([\s\S]*?)<\/a>/g;
  let m = null;
  while ((m = ITEM.exec(src)) !== null) {
    if (items.length >= MAX_LIVE) break;
    const href = m[1];
    const body = m[2];

    const pick = (cls, tail) => {
      const re = new RegExp('class="' + cls + '"[^>]*>([\\s\\S]*?)' + tail);
      const r = re.exec(body);
      return r ? stripTags(r[1]) : '';
    };

    const url = /^https?:\/\//i.test(href) ? href : ('https://m.yiqicai.com' + href);
    const item = {
      url,
      name: pick('live-anchor-name', '<'),
      game: pick('live-anchor-lotto', '<'),
      text: pick('live-anchor-txt', '<'),
      see: pick('view-num', '<')
    };
    if (!item.text && !item.name) continue;
    items.push(item);
  }

  return { onAir, statusText: statusText || (onAir ? '正在直播' : '当前暂无直播'), items, home: LIVE_HOME };
}

/* ============================================================
   读上一次的数据（某个源失败时用它兜底）
   ============================================================ */
function readPrev() {
  try {
    const t = fs.readFileSync(OUT, 'utf8');
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i < 0 || j < 0) return null;
    return JSON.parse(t.slice(i, j + 1));
  } catch (e) { return null; }
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

const prev = readPrev();
const prevGames = (prev && prev.games) ? prev.games : {};
const prevLive = (prev && prev.live) ? prev.live : null;

/* 2. 抓开机号 */
const rKjh = await grab(KJH_URL, UA_M, 'https://m.yiqicai.com/');
let games = {};
let kjhOk = false;
if (rKjh.ok) {
  try {
    games = parseKjh(rKjh.html);
    kjhOk = Object.keys(games).length > 0;
  } catch (e) { log(`   ⚠️ 开机号解析异常：${e.message}`); }
}
if (!kjhOk) log(`   ✗ 开机号抓取失败（${rKjh.err || '0 个彩种 / 结构变了'}）→ 保留上一次`);
else log(`   ✓ 开机号 ${Object.keys(games).length} 个彩种`);

/* 3. 【已停用】抓选号直播 —— 用户 2026-10-17：
   「把选号直播改为热力图」→ 页面不再显示选号直播（换成热力图区块），
   所以这一段抓取【不再执行】（省一个请求、少一个可能失败的源）。
   ⚠️ 保留 LIVE_URL / parseLive / 下面的 live 变量：kjh-data.js 里旧字段照旧写空，
      以后要恢复只把下面三行注释去掉、并把 liveOk 判定接回去即可。 */
let live = null;                    /* 旧字段：现在恒为 null（页面不再用） */
let liveOk = true;                  /* 不抓了 → 不算失败（否则整轮会被判失败） */
void LIVE_URL;

/* 4. 判定：两个源全失败才算整轮失败 */
if (!kjhOk && !liveOk) {
  st.failStreak = (st.failStreak || 0) + 1;
  log(`⚠️  两个源都没抓到 · 连续失败 ${st.failStreak} 轮`);
  log('    保留上一次的 kjh-data.js（页面显示上一轮内容）');
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

/* 5. 合并：失败的那一半用上一次的（上一次也没有就留空） */
if (!kjhOk) games = prevGames;
if (!liveOk) live = prevLive || { onAir: false, statusText: '当前暂无直播', items: [], home: LIVE_HOME };

/* 按固定顺序排列彩种（抓到的按页面顺序，没抓到的省略） */
const ordered = {};
GAME_ORDER.forEach((k) => { if (games[k]) ordered[k] = games[k]; });
Object.keys(games).forEach((k) => { if (!ordered[k]) ordered[k] = games[k]; });

/* 直播回放按看过人数排一下（源页本身就是新的在前，这里只保证稳定） */
if (live && Array.isArray(live.items)) {
  live.items = live.items.slice(0, MAX_LIVE);
}

const data = {
  updated: stamp(),
  games: ordered,
  live: live || { onAir: false, statusText: '当前暂无直播', items: [], home: LIVE_HOME }
};

st.failStreak = 0;
st.pausedUntil = 0;
st.ok = (st.ok || 0) + 1;
st.lastRun = new Date().toISOString();
writeState(st);

const text =
  `/* ============================================================\n` +
  `   kjh-data.js —— 「开机号」+「选号直播」数据（自动生成，请勿手动编辑）\n\n` +
  `   由 build-kjh.mjs 生成（每天 2 点一次，跟着 daily-update.mjs）。\n` +
  `   更新时间：${data.updated}\n` +
  `   开机号 ${Object.keys(ordered).length} 个彩种 · 回放 ${(data.live.items || []).length} 条。\n` +
  `   只有文字，没有图片（不下载、不外链图片）。\n` +
  `   ============================================================ */\n\n` +
  `const KJH_DATA = ${JSON.stringify(data, null, 1)};\n`;
fs.writeFileSync(OUT, text, 'utf8');

log(`✅ 已写入 kjh-data.js（${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB）`);
GAME_ORDER.forEach((k) => {
  const g = ordered[k];
  if (!g) return;
  log(`   ${g.name} 第${g.issue}期  ${g.nums.join(' ')}` +
    (g.blue.length ? ` 蓝 ${g.blue.join(' ')}` : '') +
    (g.extra.length ? `  (${g.extra.join(' · ')})` : ''));
});
log(`   更新时间 ${data.updated}`);
log('—— 本轮结束（有新数据）——');
process.exit(0);
