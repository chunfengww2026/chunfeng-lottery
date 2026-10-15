/* ============================================================
   build-xysp.mjs —— 抓「晒票」图片，产出 xysp-data.js
   ------------------------------------------------------------
   为什么要这个（用户原话）：
     「做。一直循环抓取24小时内的 保留24小时内的图片」
     背景：微信把 yiqicai.com 拉黑了，点链接跳过去打不开
           → 所以要把图片抓到【我们自己的页面】上直接显示。

   抓什么（手机版，服务端渲染，8 个彩种各一页，实测全部 HTTP 200）：
     https://m.yiqicai.com/xysp/ssqxysp   双色球
     https://m.yiqicai.com/xysp/dltxysp   大乐透
     https://m.yiqicai.com/xysp/fc3dxysp  福彩3D
     https://m.yiqicai.com/xysp/klbxysp   快乐8
     https://m.yiqicai.com/xysp/pl3xysp   排列3
     https://m.yiqicai.com/xysp/pl5xysp   排列5
     https://m.yiqicai.com/xysp/xqxcxysp  七星彩
     https://m.yiqicai.com/xysp/qlcxysp   七乐彩

   页面真实结构（实测）——一条晒票就是一块：
     <div class="lucky-tickets-x">
       <div class="lucky-user">
         <dl class="lucky-info">
           <dt class="lucky-name">昵称</dt>
           <dd class="lucky-msg-txt">10-15 22:37</dd>      ← 源站发布时间
         </dl>
       </div>
       <div class="lucky-msg">[26119期]中5块</div>          ← 描述（当标题用）
       <div class="lucky-pics">
         <img src="http://img02.17chdd.com/2026-10-15/xxx.jpg?width=814&amp;height=1800">
         ...（一条可能有 1~3 张图）
       </div>
     </div>
   只取 lucky-pics 里的图 —— 头像 / 广告 / 站标都在这个 div 外面，
   所以不会混进来。

   【图片不下载】图床没有防盗链（实测：不带 Referer / 带 m.yiqicai.com /
   带 github.io 三种都是 HTTP 200 + 真 JPEG + 字节数完全相同），
   而且支持 ?imageMogr2/thumbnail/360x 缩略（192377 B → 52104 B，
   Content-Type 还会被修正成 image/jpeg）。
   ⇒ 页面里只写【外链 URL】，所以页面体积几乎不变大。
   注意：图床是 http 的，但 https 同样能取（实测 200）
        → 一律写成 https，避免 https 页面被浏览器当混合内容拦掉。

   产出 xysp-data.js：
     const XYSP_DATA = {
       updated: '2026-10-16 03:30',
       games: {
         ssq: { name: '双色球', items: [ { img, thumb, title, url, at } ] },
         ...
       }
     };
     · at    = 这条晒票的【抓取时间】(ISO)，用于 24 小时过滤
     · img   = 原图 URL（点开看大图用）
     · thumb = 缩略图 URL（?imageMogr2/thumbnail/360x）
     · url   = 详情页 URL；源站列表页每条没有独立详情页 ⇒ 留空

   【保留 24 小时】不是每次覆盖清空，而是：
     1) 先读旧的 xysp-data.js
     2) 把新抓到的并进去（同一个 img 只留一条，保留【最早】的 at）
     3) 丢掉 at 早于 24 小时的
     4) 每个彩种只留最新的 MAX_PER_GAME 条
   ⇒ 每 30 分钟跑一次 + 24 小时自动过期 = 用户要的「一直循环、只留 24 小时」。

   安全 / 省成本：
     · 正常手机 User-Agent；8 个页面，请求间隔 >= 1.2s
     · 失败退避（照 update-football-smart.mjs 那套）：连续 N 轮全失败就停 2 小时
     · 抓不到不崩、也【不覆盖】上一次的 xysp-data.js（退出码 10）
     · 一律 UTF-8 无 BOM；绝不请求任何 AI，不涉及任何 token（0 token）
     · 只在这里用 fetch；生成的页面里没有任何抓取逻辑

   退出码：
     0  = 抓到并写入了新的 xysp-data.js（调用方可以继续出页面 + 同步）
     10 = 本轮跳过（退避中 / 抓不到）—— 保留上一次的数据，调用方别同步
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'xysp-data.js');
const LOG = path.join(ROOT, '_xysp.log');
const STATE = path.join(ROOT, '_xysp-backoff.json');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* 8 个彩种（顺序 = 页面上筛选按钮的显示顺序） */
const GAMES = [
  { key: 'ssq',  name: '双色球', url: 'https://m.yiqicai.com/xysp/ssqxysp' },
  { key: 'dlt',  name: '大乐透', url: 'https://m.yiqicai.com/xysp/dltxysp' },
  { key: 'fc3d', name: '福彩3D', url: 'https://m.yiqicai.com/xysp/fc3dxysp' },
  { key: 'kl8',  name: '快乐8',  url: 'https://m.yiqicai.com/xysp/klbxysp' },
  { key: 'pl3',  name: '排列3',  url: 'https://m.yiqicai.com/xysp/pl3xysp' },
  { key: 'pl5',  name: '排列5',  url: 'https://m.yiqicai.com/xysp/pl5xysp' },
  { key: 'qxc',  name: '七星彩', url: 'https://m.yiqicai.com/xysp/xqxcxysp' },
  { key: 'qlc',  name: '七乐彩', url: 'https://m.yiqicai.com/xysp/qlcxysp' }
];

/* 只保留 24 小时内的 */
const KEEP_HOURS = 72;
/* 每个彩种最多留几条（别让文件无限长大） */
const MAX_PER_GAME = 40;
/* 两个页面之间至少隔这么久（保护数据源） */
const GAP_MS = 1200;

/* 失败退避（写法照 update-football-smart.mjs） */
const FAIL_PAUSE_AFTER = 6;    // 连续全失败这么多次 → 暂停
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

function stamp(d) {
  const t = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ` +
    `${p(t.getHours())}:${p(t.getMinutes())}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 小工具 ---------- */
const stripTags = (s) => String(s).replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();

/**
 * 规范化一张晒票图片的 URL：
 *   · 把 HTML 实体还原（源页里是 &amp;height=…）
 *   · 去掉 ?width=…&height=… 那串显示尺寸参数（保留它反而干扰缩略参数）
 *   · 一律换成 https（图床 http/https 都能取；页面是 https，必须用 https，
 *     否则浏览器按「混合内容」直接拦截，图就白了）
 * 不是 http(s) 的（比如站内 /images/logo.png）一律返回空串
 * @param {string} raw 原始 src
 * @returns {string} 规范化后的 URL，认不出来返回空串
 */
function normImg(raw) {
  let u = String(raw || '').trim().replace(/&amp;/gi, '&');
  if (!/^https?:\/\//i.test(u)) return '';
  if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) return '';
  const q = u.indexOf('?');
  if (q >= 0) u = u.slice(0, q);
  u = u.replace(/^http:\/\//i, 'https://');
  return u;
}

/** 缩略图 URL：图床支持 imageMogr2，拿不到就退回原图（页面里 onerror 还会再兜一层） */
function thumbOf(img) {
  return img ? img + '?imageMogr2/thumbnail/360x' : '';
}

/* ============================================================
   解析一个彩种页 → 条目数组
   ============================================================ */
function parsePage(html, atIso) {
  const items = [];
  /* 一条晒票 = 从 <div class="lucky-tickets-x"> 开始的那一块。
     直接按这个开头切：每一段里【第一次】出现的 lucky-msg / lucky-pics
     就一定是这一条的（两者都排在块内很靠前的位置），
     所以不需要去猜块在哪里结束，也不会把下一段的内容混进来。 */
  const parts = String(html).split('<div class="lucky-tickets-x"');
  parts.shift();                       // 第一个元素是第一条之前的页面头

  for (const b of parts) {
    /* 描述（有什么抓什么；源站每条都有这一句） */
    const msgM = /<div class="lucky-msg"[^>]*>([\s\S]*?)<\/div>/.exec(b);
    const title = msgM ? stripTags(msgM[1]).slice(0, 120) : '';

    /* 图片：只认 lucky-pics 这个 div 里的（头像/广告都在它外面） */
    const picsM = /<div class="lucky-pics"[^>]*>([\s\S]*?)<\/div>/.exec(b);
    if (!picsM) continue;

    const IMG = /<img[^>]*\bsrc="([^"]+)"/gi;
    let im = null;
    while ((im = IMG.exec(picsM[1])) !== null) {
      const img = normImg(im[1]);
      if (!img) continue;
      if (items.some((x) => x.img === img)) continue;      // 本页内去重
      items.push({ img, thumb: thumbOf(img), title, url: '', at: atIso });
    }
  }
  return items;
}

/* ============================================================
   读旧数据 + 合并 + 24 小时过期 + 去重 + 数量上限
   ------------------------------------------------------------
   独立成函数，方便验收脚本直接拿假数据调它。
   ============================================================ */
function mergeAndPrune(oldData, freshByGame, nowMs) {
  const cutoff = nowMs - KEEP_HOURS * 3600 * 1000;
  const games = {};
  const stat = { kept: 0, dropped: 0, dupes: 0, added: 0 };

  for (const g of GAMES) {
    const bucket = new Map();          // img → 条目（保留最早的 at）

    const push = (it, count) => {
      const img = it && it.img ? String(it.img) : '';
      if (!img) return;
      const at = String(it.at || '');
      const t = Date.parse(at);
      if (!isFinite(t)) return;
      /* __RELAX_QXC_QLC__ 用户决定：七星彩 / 七乐彩 的晒票【不受 24 小时限制】。
   原因：这两个彩种源站上本来就更新慢（最新晒票可能超过 24 小时），
        严格 24 小时会让这两栏永远显示"暂无"。
   做法：这两个彩种跳过过期判断，只受 MAX_PER_GAME 上限约束（永远显示最新几张）。 */
      var RELAX_24H = ['qxc', 'qlc'];
      if (t < cutoff && RELAX_24H.indexOf(g.key) < 0) { stat.dropped++; return; }        // 超过 24 小时 → 丢（qxc/qlc 除外）
      const prev = bucket.get(img);
      if (prev) {
        /* 同一个 img 只留一条：at 保留【最早】那次，其余字段用最新的 */
        stat.dupes++;
        prev.title = it.title || prev.title;
        prev.thumb = it.thumb || prev.thumb;
        prev.url = it.url || prev.url;
        if (Date.parse(prev.at) > t) prev.at = at;
        return;
      }
      bucket.set(img, {
        img,
        thumb: it.thumb || thumbOf(img),
        title: it.title || '',
        url: it.url || '',
        at
      });
      if (count) stat.added++;
    };

    const oldList = (oldData && oldData.games && oldData.games[g.key] &&
      Array.isArray(oldData.games[g.key].items)) ? oldData.games[g.key].items : [];
    oldList.forEach((it) => push(it, false));
    const freshList = Array.isArray(freshByGame[g.key]) ? freshByGame[g.key] : [];
    freshList.forEach((it) => push(it, true));

    /* 最新的排在前面，再砍到上限 */
    const list = [...bucket.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    games[g.key] = { name: g.name, items: list.slice(0, MAX_PER_GAME) };
    stat.kept += games[g.key].items.length;
  }
  return { games, stat };
}

/** 从旧的 xysp-data.js 文本里抠出对象（文件是我们自己写的纯 JSON，直接 JSON.parse） */
function readOld(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const m = /const XYSP_DATA\s*=\s*(\{[\s\S]*\});/.exec(txt);
    if (!m) return null;
    return JSON.parse(m[1]);
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
  log(`⏸  退避中（连续全失败 ${st.failStreak} 次），还剩 ${left} 分钟，本轮跳过`);
  st.skips = (st.skips || 0) + 1;
  writeState(st);
  process.exit(10);
}

log('—— 本轮开始 ——');
st.runs = (st.runs || 0) + 1;

const roundIso = new Date(now).toISOString();
const freshByGame = {};
let httpOk = 0;
let firstErr = '';

for (let i = 0; i < GAMES.length; i++) {
  const g = GAMES[i];
  if (i > 0) await sleep(GAP_MS);            // 请求间隔 >= 1.2s
  try {
    const r = await fetch(g.url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://m.yiqicai.com/'
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    httpOk++;
    freshByGame[g.key] = parsePage(html, roundIso);
  } catch (e) {
    freshByGame[g.key] = [];
    const msg = String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 120);
    if (!firstErr) firstErr = `${g.name} ${msg}`;
    log(`   ⚠️ ${g.name} 抓取失败：${msg}`);
  }
}

const freshTotal = Object.values(freshByGame).reduce((n, a) => n + a.length, 0);
log(`   抓取结束：8 个页面成功 ${httpOk} 个 · 新解析到 ${freshTotal} 条图片`);

/* 2. 一条都没抓到 → 当失败处理（不覆盖旧文件） */
if (freshTotal === 0) {
  st.failStreak = (st.failStreak || 0) + 1;
  log(`⚠️  本轮零条（${firstErr || '全部页面都没解析到晒票'}）· 连续全失败 ${st.failStreak} 次`);
  log('    保留上一次的 xysp-data.js（页面显示上一轮 / 暂无）');
  if (st.failStreak >= FAIL_PAUSE_AFTER) {
    st.pausedUntil = now + PAUSE_MINUTES * 60000;
    st.failStreak = 0;
    log(`🛑 连续全失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停 ${PAUSE_MINUTES} 分钟（保护数据源）`);
  }
  st.skips = (st.skips || 0) + 1;
  st.lastRun = roundIso;
  writeState(st);
  process.exit(10);
}

/* 3. 合并旧数据 + 24 小时过期 + 去重 + 上限 */
const oldData = readOld(OUT);
const oldTotal = oldData && oldData.games
  ? Object.values(oldData.games).reduce((n, g) => n + ((g && g.items) ? g.items.length : 0), 0) : 0;
const { games, stat } = mergeAndPrune(oldData, freshByGame, now);

/* 4. 成功 → 写文件 */
st.failStreak = 0;
st.pausedUntil = 0;
st.ok = (st.ok || 0) + 1;
st.lastRun = roundIso;
writeState(st);

const data = { updated: stamp(new Date(now)), games };
const text =
  `/* ============================================================\n` +
  `   xysp-data.js —— 「晒票栏」图片数据（自动生成，请勿手动编辑）\n\n` +
  `   由 build-xysp.mjs 生成（每 30 分钟一次）。\n` +
  `   只保留最近 ${KEEP_HOURS} 小时内抓到的条目，每个彩种最多 ${MAX_PER_GAME} 条。\n` +
  `   图片是【外链】（图床没有防盗链），页面里不存图片本体。\n` +
  `   更新时间：${data.updated}\n` +
  `   ============================================================ */\n\n` +
  `const XYSP_DATA = ${JSON.stringify(data, null, 1)};\n`;
fs.writeFileSync(OUT, text, 'utf8');

log(`✅ 已写入 xysp-data.js（${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB）`);
log(`   旧数据 ${oldTotal} 条 → 合并后 ${stat.kept} 条` +
  `（丢弃过期 ${stat.dropped} 条 · 去重合并 ${stat.dupes} 条 · 本轮新加入 ${stat.added} 条 / 共抓到 ${freshTotal} 条）`);
GAMES.forEach((g) => {
  const items = games[g.key].items;
  log(`   ${g.name.padEnd(6)} ${String(items.length).padStart(2)} 条` +
    (items.length ? ` · 例：${items[0].img}` : ' · ⚠️ 24 小时内没有新的'));
});
log(`   合计 ${stat.kept} 条 · 更新时间 ${data.updated}`);
log('—— 本轮结束（有新数据）——');
process.exit(0);
