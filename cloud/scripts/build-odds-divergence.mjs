/* ============================================================
   build-odds-divergence.mjs —— 【分歧指】数据（球探 titan007 多公司欧赔）
   ------------------------------------------------------------
   问题：详情页的「分歧指」以前永远是「暂无多家赔率数据，无法计算分歧」——
        因为 jc-data.js 只有 500.com 一个源，一场比赛只有【一份】欧赔，
        一份赔率自己跟自己的离散度恒等于 0，硬造低/中/高就是编数据。

   这一版接第二个源：球探 titan007 的【欧赔比较】接口
        https://1x2d.titan007.com/{ScheduleID}.js
   实测（2026-10-17 本机 + 云端）：HTTP 200 · 180~600 KB · 325~367 家公司，
   纯 JS 变量，含每家公司的【初盘 + 即时】欧赔、凯利、返还率。

   【怎么从我们的比赛找到 titan007 的 ScheduleID】—— 这一层是本题的难点
     我们的比赛只有 竞彩编号（周五001）/ 联赛 / 队名 / 开赛时间，没有 ScheduleID。
     titan007 的 ScheduleID 只出现在【赛程列表】里，实测两个入口都能列：

       ① 在售 / 未开赛：https://jc.titan007.com/xml/bf_jc.txt
          静态文件，`$` 分段：第一段是联赛表，第二段是赛程。
          一条一行用 `!` 分隔，字段用 `^` 分隔（字段含义逐字对齐
          jc.titan007.com/js/common.js 里 _glJC.schedule 构造函数）：
            [0] ScheduleID  [1] 开赛时间(北京时间, 月份 0 基)  [4] 竞彩编号(周五001)
            [5] sclassID    [7] 主队ID  [8] 主队名(cn,繁体,简体)
            [9] 客队ID      [10] 客队名
          实测：35 条，编号正好是 周五011 / 周六001…周日018。

       ② 已完场：https://jc.titan007.com/handle/JcResult.aspx?d=YYYY-MM-DD
          返回同样的 `$` + `!` + `^` 结构（按【竞彩销售日】查）。
          实测：d=2026-10-16 → 10 条（周五001/3041373 … 周五010/3013724）。

      两个入口合起来，我们库里 64 场里绝大多数都能拿到 ScheduleID。
      所以【不需要猜 ID、不需要硬编】—— 全部从上面两个列表按编号取。

   【怎么保证 ID 没取错】（编号每周循环，周五001 上周也有）
      · 只扫【最近 7 天】的 JcResult —— 7 天里每个星期几只出现一次，
        所以同一个编号不会撞上"上周那一场"。
      · 拿到 js 之后再用【队名 + 开赛时间】回验一次（verify()），
        对不上的场次一律丢弃并记到日志里，绝不硬塞数据。

   【分歧指怎么算】
     取每家公司【即时】欧赔的三个方向，各自算：
        均值 m = Σxᵢ/n
        标准差 s = √( Σ(xᵢ-m)² / n )        ← 总体标准差（就是这一批公司的全体）
        变异系数 cv = s / m                  ← 除以均值，消掉"主胜 1.5 / 客胜 8.0 量级不同"
     一档分歧大小看 cv（阈值见 CV_LEVELS，是按实测分布定的，不是拍的）。
     ⚠️ 我们【只搬真数据】：一家公司都没解析出来 → 这一场不写进文件，
        页面照旧显示「暂无多家赔率数据」，不填假数字。

   用法：
     node build-odds-divergence.mjs              正常抓（默认 min-gap 20 分钟）
     node build-odds-divergence.mjs --force      忽略 min-gap，强制重抓
     node build-odds-divergence.mjs --report     额外打印 cv 分布（调阈值用）
     node build-odds-divergence.mjs --limit 8    只抓前 8 场（调试用）
   写：jc-divergence.js
   ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(HERE, 'jc-divergence.js');

const FORCE = process.argv.includes('--force');
const REPORT = process.argv.includes('--report');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  const v = i >= 0 ? Number(process.argv[i + 1]) : 0;
  return Number.isFinite(v) && v > 0 ? v : 0;
})();
const MIN_GAP_MIN = 20;

/* titan007 认 Referer：不带给它也能通（实测），但给上更稳 */
const HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

/* 分歧档位：cv（变异系数）→ 低/中/高
   阈值来历：本机实测【全部 64 场 × 三个方向 = 192 个样本】的 cv 分布：
     主胜 p25=2.90 p50=4.11 p75=5.54 · 平局 p25=3.15 p50=3.64 p75=4.13 · 客胜 p25=2.95 p50=4.16 p75=5.62
   三个方向的四分之一位都在 2.9~3.2、四分之三位都在 4.1~5.6，
   所以把两条线放在 3.0% 和 5.5%：低/中/高大致落在 3 : 4.5 : 2.5 上，
   不会像"只按 3/6 切"那样 63% 全挤在「中」。
   ⚠️ 用 cv 而不是标准差：主胜赔率 1.5 和客胜赔率 8.0 的标准差天然差几倍，
      只看标准差会把"客胜分歧"永远判成高。
   ⚠️ 这是【相对档位】（这批公司相互之间意见有多大），不是胜率、不是推荐。 */
const CV_LEVELS = [
  { max: 0.030, level: '低' },
  { max: 0.055, level: '中' }
];
function cvLevel(cv) {
  if (cv == null || !Number.isFinite(cv)) return null;
  if (cv < CV_LEVELS[0].max) return '低';
  if (cv < CV_LEVELS[1].max) return '中';
  return '高';
}

const log = (...a) => console.log(...a);

/* ---------- 读我们自己的数据（和 build-match.mjs 同一套 loadVar） ---------- */
function loadVar(file, varName) {
  const fp = path.join(HERE, file);
  if (!fs.existsSync(fp)) return null;
  const src = fs.readFileSync(fp, 'utf8');
  const i = src.indexOf('const ' + varName);
  if (i < 0) return null;
  const a = src.indexOf('{', i);
  const b = src.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(src.slice(a, b + 1)); } catch (e) { return null; }
}

/* ---------- 队名归一：只留汉字/字母/数字，再去掉「足球俱乐部」这类通名 ---------- */
const GENERIC = /(足球俱乐部|足球会|俱乐部|足球隊|足球|俱乐部|FC|CF|SC|AC|SV|FK|BK|IF|SK|队|會|会)$/gi;
function normName(s) {
  let t = String(s == null ? '' : s).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
  t = t.replace(GENERIC, '');
  return t.toLowerCase();
}
/* 队名是否算同一支：完全相同 / 互相包含 / 前 2 个字相同（"西悉尼" vs "西悉尼流浪者"） */
function sameTeam(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))) return true;
  return x.slice(0, 2) === y.slice(0, 2) && x.length >= 2 && y.length >= 2;
}

/* ---------- titan007 时间串 "2026,10-1,17,22,30,00" → "2026-10-17 22:30" ----------
   月份是【减了 1 的写法】（10-1 表示第 9 个月，也就是 10 月）——实测确认：
   ScheduleID 2910927 的 MatchTime="2026,10-1,17,22,30,00"，就是 10 月 17 日。

   ⚠️【时区不一样，实测踩过】：
     · bf_jc.txt / JcResult.aspx 里的时间是【北京时间】（和竞彩官方一致）
     · 1x2d 的 {id}.js 里 var MatchTime= 是【UTC】，比北京时间早整整 8 小时
     证据（3 场独立吻合）：里昂 vs 水晶宫，js 写 2026-10-15 16:45，
     欧罗巴杯那个时段正是欧洲 18:45（=16:45 UTC）；JcResult 里同一场写
     2026-10-16 00:45（北京）。悉尼FC vs 西悉尼：js 09:00 / 我们 17:00（北京）。
     所以读 js 的 MatchTime 一定要 +8 小时再比，否则"队名全对、时间全不对"。 */
function titanTime(t) {
  const p = String(t || '').split(',');
  if (p.length < 6) return null;
  const y = Number(p[0]);
  const mo = Number(String(p[1]).includes('-1') ? Number(p[1].split('-')[0]) - 1 : p[1]) + 1;
  const d = Number(p[2]), hh = Number(p[3]), mm = Number(p[4]);
  if (![y, mo, d, hh, mm].every((v) => Number.isFinite(v))) return null;
  const P = (n) => String(n).padStart(2, '0');
  return `${y}-${P(mo)}-${P(d)} ${P(hh)}:${P(mm)}`;
}
/* 把 "YYYY-MM-DD HH:MM" 加 n 小时 → 同一个格式（跨天自动进位） */
function shiftHours(s, n) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + ':00');
  if (!Number.isFinite(d.getTime())) return null;
  d.setHours(d.getHours() + n);
  const P = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${P(d.getMonth() + 1)}-${P(d.getDate())} ${P(d.getHours())}:${P(d.getMinutes())}`;
}
/* 两个 "YYYY-MM-DD HH:MM" 差多少分钟；任一个读不出来 → null */
function minutesApart(a, b) {
  if (!a || !b) return null;
  const x = new Date(String(a).replace(' ', 'T') + ':00').getTime();
  const y = new Date(String(b).replace(' ', 'T') + ':00').getTime();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.abs(x - y) / 60000;
}

/* ============================================================
   【为什么不用 fetch】
   实测（本机 Windows + runtime/node.exe v24.21.0）：并发抓 8 个 1x2d 的 js 时，
   undici 内部抛 AssertionError: assert(!this.paused)（Parser.finish / onHttpSocketEnd）
   —— 这是【未捕获的 socket 事件里抛出来的】，try/catch 拦不住，直接整个进程崩掉。
   换成 node 自带的 https 模块就没有这条路径了：行为确定、还能自己控超时。
   （云端 Linux 的 Node 上 fetch 未必复现，但两边用同一份代码最稳。）
   ============================================================ */
import https from 'node:https';
import zlib from 'node:zlib';

function getTextOnce(url, referer, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: referer ? { ...HDR, Referer: referer } : HDR,
      timeout: timeoutMs
    }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        getTextOnce(next, referer, timeoutMs).then(resolve, reject);
        return;
      }
      if (code !== 200) { res.resume(); reject(new Error('HTTP ' + code)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          let buf = Buffer.concat(chunks);
          if (/gzip/i.test(res.headers['content-encoding'] || '')) buf = zlib.gunzipSync(buf);
          else if (/deflate/i.test(res.headers['content-encoding'] || '')) buf = zlib.inflateSync(buf);
          resolve(buf.toString('utf8'));
        } catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error('超时 ' + timeoutMs + 'ms')); });
    req.on('error', reject);
  });
}

/* 抓 1 次，失败重试 2 次（titan007 偶尔会断流） */
async function getText(url, referer) {
  let last = null;
  for (let i = 1; i <= 3; i++) {
    try { return await getTextOnce(url, referer, 45000); }
    catch (e) { last = e; if (i < 3) await new Promise((r) => setTimeout(r, 800 * i)); }
  }
  throw last || new Error('抓取失败');
}

/* ---------- ① 在售 / 未开赛赛程：bf_jc.txt ---------- */
function parseScheduleText(txt) {
  const seg = String(txt).split('$');
  const recs = (seg[1] || seg[0] || '').split('!').filter((x) => x.trim());
  const out = [];
  recs.forEach((rec) => {
    const a = rec.split('^');
    if (a.length < 11) return;
    const sid = parseInt(a[0], 10);
    if (!Number.isFinite(sid)) return;
    out.push({
      sid: String(sid),
      code: String(a[4] || '').trim(),
      time: titanTime(a[1]),
      home: (a[8] || '').split(',')[0],
      away: (a[10] || '').split(',')[0]
    });
  });
  return out;
}

async function scheduleIndex() {
  const idx = new Map();   /* code → 候选（编号唯一，最近 7 天里不会撞周） */
  const notes = [];
  let fromList = 0, fromResult = 0;

  try {
    const txt = await getText('https://jc.titan007.com/xml/bf_jc.txt', 'https://jc.titan007.com/');
    const recs = parseScheduleText(txt);
    recs.forEach((r) => { if (r.code && !idx.has(r.code)) { idx.set(r.code, r); fromList++; } });
    notes.push(`bf_jc.txt ${recs.length} 条（在售/未开赛）`);
  } catch (e) {
    notes.push(`bf_jc.txt 抓取失败：${String(e.message).slice(0, 80)}`);
  }

  /* ② 已完场：按【竞彩销售日】查最近 7 天 */
  const today = new Date();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  for (const d of days) {
    try {
      const txt = await getText('https://jc.titan007.com/handle/JcResult.aspx?d=' + d, 'https://jc.titan007.com/');
      const recs = parseScheduleText(txt);
      let add = 0;
      recs.forEach((r) => { if (r.code && !idx.has(r.code)) { idx.set(r.code, r); add++; fromResult++; } });
      if (add) notes.push(`JcResult ${d} → ${add} 场已完场`);
    } catch (e) {
      notes.push(`JcResult ${d} 失败：${String(e.message).slice(0, 60)}`);
    }
  }
  return { idx, notes, fromList, fromResult };
}

/* ---------- ③ 解析 1x2d 的 game 数组 ----------
   一条记录（`|` 分隔）字段（逐字段对过实数据，换算自洽才敢用）：
     [0] 公司ID  [1] 赔率记录ID  [2] 公司英文名
     [3][4][5]   初盘 主/平/客
     [6][7][8]   初盘 概率%   [9] 初盘返还率
     [10][11][12] 即时 主/平/客
     [13][14][15] 即时 概率% [16] 即时返还率
     [17][18][19] 即时凯利   [20] 更新时间  [21] 公司中文名
       [22][23] …  [24][25][26] 初盘凯利
   自洽校验：1/3+1/4+1/5 的归一化正好等于 [6][7][8]，100/Σ(1/赔率) 正好等于 [9]。
   我们只用 [3][4][5]（初盘）和 [10][11][12]（即时）。 */
function parseGameArray(src) {
  const m = /var game\s*=\s*Array\(([\s\S]*?)\)\s*;/m.exec(src);
  if (!m) return null;
  const rows = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let mm;
  while ((mm = re.exec(m[1])) !== null) {
    const f = mm[1].split('|');
    if (f.length < 13) continue;
    rows.push(f);
  }
  return rows;
}

function toOdds(f, i) {
  const v = Number(f[i]);
  return Number.isFinite(v) && v > 1.001 ? v : null;
}

/* ---------- ④ 离散度：均值 / 总体标准差 / 变异系数 ---------- */
function dispersion(values) {
  const xs = values.filter((v) => Number.isFinite(v));
  const n = xs.length;
  if (n < 2) return { n, mean: n ? xs[0] : null, sd: null, cv: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
  return { n, mean, sd, cv: mean > 0 ? sd / mean : null };
}

/* ---------- ⑤ 抓一场 ---------- */
async function fetchOne(cand) {
  const src = await getText('https://1x2d.titan007.com/' + cand.sid + '.js', 'https://1x2d.titan007.com/');
  const tid = (k) => (src.match(new RegExp('var ' + k + '="([^"]*)"')) || [])[1] || '';
  const tHome = tid('hometeam_cn') || tid('hometeam');
  const tAway = tid('guestteam_cn') || tid('guestteam');
  const tTime = titanTime(tid('MatchTime'));
  const rows = parseGameArray(src);
  return { src, tHome, tAway, tTime, rows, league: tid('matchname_cn') || '' };
}

/* 回验：这个 ScheduleID 是不是【我们这一场】
   ------------------------------------------------------------
   主键是【竞彩编号】：ID 本来就是从 titan007 自己的竞彩列表里按编号取的，
   只扫最近 7 天，同一编号 7 天里只会出现一次，不会撞上"上周那一场"。
   这里再校验一次，用的是两个独立信号：
     · 开赛时间：优先比 titan007 列表里的【北京时间】（和竞彩同源，最可靠）；
               列表里没有就用 js 里的 UTC 时间 +8 小时兜底。
     · 队名：500.com 和 titan007 的中文译名有时不同（实测"登博思" vs "邓伯什"、
            "布鲁马波" vs "布洛马波卡纳"），所以队名【只作辅助】，不作唯一判据。
   两个信号【都】对不上 → 丢弃这一场（不写假数据）。 */
function verify(ours, cand, t) {
  const nameOk = (sameTeam(ours.home, t.tHome) && sameTeam(ours.away, t.tAway))
    || (sameTeam(ours.home, t.tAway) && sameTeam(ours.away, t.tHome));
  const jsTimeBj = shiftHours(t.tTime, 8);          /* js 是 UTC → 北京 */
  const candGap = minutesApart(ours.time, cand.time);   /* 列表时间是北京，直接比 */
  const jsGap = minutesApart(ours.time, jsTimeBj);
  const timeGap = candGap !== null ? candGap : jsGap;
  const timeOk = timeGap !== null && timeGap <= 20;
  return { nameOk, timeOk, timeGap, candGap, jsGap, jsTimeBj, ok: nameOk || timeOk };
}

/* ---------- ⑥ 主流程 ---------- */
async function main() {
  /* min-gap：同一个数据文件 20 分钟内不重复抓（本机/云端一个班次里可能被调两次） */
  if (!FORCE && fs.existsSync(OUT_FILE)) {
    const age = (Date.now() - fs.statSync(OUT_FILE).mtimeMs) / 60000;
    if (age < MIN_GAP_MIN) {
      log(`⏭  跳过：jc-divergence.js 是 ${age.toFixed(1)} 分钟前刚生成的（< ${MIN_GAP_MIN} 分钟）`);
      log('   要强制重抓：node build-odds-divergence.mjs --force');
      return;
    }
  }

  const JC = loadVar('jc-data.js', 'JC_DATA');
  const HIST = loadVar('jc-history.js', 'JC_HISTORY');
  const list = [];
  (JC && Array.isArray(JC.games) ? JC.games : []).forEach((g) => list.push({
    code: g.code, home: (g.home || {}).name, away: (g.away || {}).name, time: g.time, league: g.league, from: 'sale'
  }));
  /* ⚠️ jc-history.js 的数组字段叫 list（不是 games）—— 和 build-match.mjs 保持一致 */
  (HIST && Array.isArray(HIST.list) ? HIST.list : []).forEach((g) => list.push({
    code: g.code, home: g.home, away: g.away, time: g.time, league: g.league, from: 'hist'
  }));
  const uniq = new Map();
  list.forEach((g) => { if (g.code && !uniq.has(g.code)) uniq.set(g.code, g); });
  let games = [...uniq.values()];
  if (LIMIT) games = games.slice(0, LIMIT);
  log(`【分歧指】我们的比赛 ${uniq.size} 场（去重后）${LIMIT ? `，本次只抓前 ${LIMIT} 场` : ''}`);

  log('  正在列 titan007 赛程（拿 ScheduleID）…');
  const { idx, notes, fromList, fromResult } = await scheduleIndex();
  notes.forEach((n) => log('    · ' + n));
  log(`  ScheduleID 索引：${idx.size} 个编号（在售 ${fromList} + 已完场 ${fromResult}）`);

  const matched = games.filter((g) => idx.has(g.code));
  const missing = games.filter((g) => !idx.has(g.code));
  log(`  编号能对上 titan007 的：${matched.length} / ${games.length}`);
  if (missing.length) log(`    对不上的编号：${missing.map((g) => g.code).join(' ')}`);

  const out = {};
  const rejected = [];
  const oneSignal = [];
  let done = 0;
  const CONC = 6;
  const queue = matched.slice();
  const rowsForReport = [];

  await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, async () => {
    while (queue.length) {
      const g = queue.shift();
      const cand = idx.get(g.code);
      try {
        const t = await fetchOne(cand);
        const v = verify(g, cand, t);
        if (!v.ok) {
          rejected.push(`${g.code}（${g.home} vs ${g.away} @${g.time}）↔ ${cand.sid} ` +
            `${t.tHome} vs ${t.tAway} @${v.jsTimeBj}（列表 ${cand.time}）` +
            ` 队名${v.nameOk ? '对' : '不对'} 时间差${v.timeGap === null ? '未知' : Math.round(v.timeGap) + '分'}`);
          continue;
        }
        if (!v.timeOk || !v.nameOk) {
          /* 只命中一个信号：记一笔，方便以后有人问"这个 ID 到底对不对" */
          oneSignal.push(`${g.code} 列表${cand.time} js(北京)${v.jsTimeBj} 我们${g.time} ` +
            `→ ${v.timeOk ? '时间对得上' : '时间差' + (v.timeGap === null ? '未知' : Math.round(v.timeGap) + '分')}、` +
            `${v.nameOk ? '队名对得上' : '队名译名不同（500.com 与 titan007 口径）'}`);
        }
        const rows = t.rows || [];
        const live = { home: [], draw: [], away: [] };
        const open = { home: [], draw: [], away: [] };
        let companies = 0;
        rows.forEach((f) => {
          const lh = toOdds(f, 10), ld = toOdds(f, 11), la = toOdds(f, 12);
          if (lh !== null && ld !== null && la !== null) {
            companies++;
            live.home.push(lh); live.draw.push(ld); live.away.push(la);
          }
          const oh = toOdds(f, 3), od = toOdds(f, 4), oa = toOdds(f, 5);
          if (oh !== null && od !== null && oa !== null) { open.home.push(oh); open.draw.push(od); open.away.push(oa); }
        });
        if (companies < 2) { rejected.push(`${g.code} 即时欧赔公司数只有 ${companies} 家（< 2，算不出分歧）`); continue; }

        const H = dispersion(live.home), D = dispersion(live.draw), A = dispersion(live.away);
        const OH = dispersion(open.home), OD = dispersion(open.draw), OA = dispersion(open.away);
        out[g.code] = {
          sid: cand.sid,
          match: `${t.tHome} vs ${t.tAway}`,
          league: t.league || g.league || '',
          time: v.jsTimeBj || cand.time || g.time || '',
          companies,
          records: rows.length,
          live: {
            home: { mean: +H.mean.toFixed(3), sd: +H.sd.toFixed(4), cv: +H.cv.toFixed(5), level: cvLevel(H.cv) },
            draw: { mean: +D.mean.toFixed(3), sd: +D.sd.toFixed(4), cv: +D.cv.toFixed(5), level: cvLevel(D.cv) },
            away: { mean: +A.mean.toFixed(3), sd: +A.sd.toFixed(4), cv: +A.cv.toFixed(5), level: cvLevel(A.cv) }
          },
          open: {
            home: { mean: +OH.mean.toFixed(3), cv: OH.cv == null ? null : +OH.cv.toFixed(5) },
            draw: { mean: +OD.mean.toFixed(3), cv: OD.cv == null ? null : +OD.cv.toFixed(5) },
            away: { mean: +OA.mean.toFixed(3), cv: OA.cv == null ? null : +OA.cv.toFixed(5) }
          }
        };
        rowsForReport.push({ code: g.code, companies, h: H.cv, d: D.cv, a: A.cv });
      } catch (e) {
        rejected.push(`${g.code} 抓取失败：${String(e.message).slice(0, 80)}`);
      }
      done++;
      if (done % 10 === 0 || done === matched.length) log(`    …已处理 ${done}/${matched.length}`);
    }
  }));

  const codes = Object.keys(out);
  if (!codes.length) {
    log('❌ 一场都没解析出来 —— 不写文件（页面继续显示「暂无多家赔率数据」，绝不用假数据顶）');
    if (rejected.length) log('   原因样本：\n     ' + rejected.slice(0, 10).join('\n     '));
    process.exitCode = 0;
    return;
  }

  const payload = {
    updated: new Date().toLocaleString('sv-SE').slice(0, 16),
    source: '球探 titan007',
    sourceUrl: 'https://1x2d.titan007.com/',
    metric: '即时欧赔变异系数 cv = 标准差 / 均值',
    levels: { 低: `< ${(CV_LEVELS[0].max * 100).toFixed(1)}%`, 中: `${(CV_LEVELS[0].max * 100).toFixed(1)}% ~ ${(CV_LEVELS[1].max * 100).toFixed(1)}%`, 高: `≥ ${(CV_LEVELS[1].max * 100).toFixed(1)}%` },
    note: '各家即时欧赔的离散度。cv 越小＝各家公司意见越一致（分歧低）。只用抓到的真数据，抓不到就不写这一场。',
    games: out
  };

  /* ⚠️ 手写 JSON 而不是 JSON.stringify(payload, null, 1)：
     loadVar() 是【切片 + JSON.parse】，字段顺序/缩进无所谓，
     但为了让这个文件在本机 git diff 里好看、和 jc-data.js 一样一行一个字段，统一用 1 空格缩进。 */
  const body = JSON.stringify(payload, null, 1);
  fs.writeFileSync(OUT_FILE, '/* 分歧指数据（球探 titan007 多公司欧赔）—— build-odds-divergence.mjs 生成，勿手改 */\nconst JC_DIVERGENCE = ' + body + ';\n', 'utf8');

  log(`✅ jc-divergence.js 已生成 ${(fs.statSync(OUT_FILE).size / 1024).toFixed(1)} KB`);
  log(`   有分歧指数据的比赛：${codes.length} 场（公司数中位 ` +
    `${rowsForReport.map((r) => r.companies).sort((a, b) => a - b)[Math.floor(rowsForReport.length / 2)]} 家）`);
  if (rejected.length) {
    log(`   丢弃 ${rejected.length} 场（队名/时间都对不上或抓失败）—— 一律不写假数据：`);
    rejected.slice(0, 8).forEach((r) => log('     · ' + r));
  }
  if (oneSignal.length) {
    log(`   ℹ️ ${oneSignal.length} 场只命中一个校验信号（仍采用，记下来备查）：`);
    oneSignal.slice(0, 5).forEach((r) => log('     · ' + r));
  }
  const sample = codes[0];
  const g = out[sample];
  log(`   样例 ${sample} ${g.match}：公司 ${g.companies} 家 · ` +
    `主胜分歧 ${g.live.home.level}(cv ${(g.live.home.cv * 100).toFixed(2)}%) / ` +
    `平局分歧 ${g.live.draw.level}(cv ${(g.live.draw.cv * 100).toFixed(2)}%) / ` +
    `客胜分歧 ${g.live.away.level}(cv ${(g.live.away.cv * 100).toFixed(2)}%)`);

  if (REPORT) {
    const pct = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
    [['主胜', 'h'], ['平局', 'd'], ['客胜', 'a']].forEach(([nm, k]) => {
      const arr = rowsForReport.map((r) => r[k]).filter((v) => Number.isFinite(v));
      log(`   [report] ${nm} cv%  min=${(Math.min(...arr) * 100).toFixed(2)} p25=${(pct(arr, 0.25) * 100).toFixed(2)} ` +
        `p50=${(pct(arr, 0.5) * 100).toFixed(2)} p75=${(pct(arr, 0.75) * 100).toFixed(2)} max=${(Math.max(...arr) * 100).toFixed(2)}`);
    });
    const dist = { 低: 0, 中: 0, 高: 0 };
    rowsForReport.forEach((r) => ['h', 'd', 'a'].forEach((k) => { const L = cvLevel(r[k]); if (L) dist[L]++; }));
    log(`   [report] 档位分布（三方向合计 ${rowsForReport.length * 3}）：低 ${dist['低']} · 中 ${dist['中']} · 高 ${dist['高']}`);
  }
}

main().catch((e) => {
  console.error('❌ build-odds-divergence.mjs 失败：' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
