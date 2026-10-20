/* ============================================================
   build-jc-count.mjs
   ------------------------------------------------------------
   「体彩竞彩在售 N 场」这一行的 N —— 用体彩官网公布的【真实】数字。

   用户原话：「上面竞猜在售多少场，一小时抓一下数据，提供真实数据，
              体彩在售的场次」
             网址 https://www.sporttery.cn/jc/jsq/zqspf/
             用户还说「竞猜不做」—— 所以本脚本只取【在售名单】，
             赔率 / 亚指 / 推荐 / 比分 / 竞猜逻辑一律不碰。

   【为什么要带清单（2026-10-18 修）】
     以前这里只写 inSale 一个数字，jc-official.js 里没有 list →
     jc-reco-build.mjs 的「官方在售 ∩ 推荐」那一段永远拿到 null，
     过滤从未生效（退化成取 jc-data 全部场次，连已完场的都算进"本期推荐串"）。
     现在顺带写出官方在售的【竞彩编号 + 开赛时间】，那段过滤才真正生效。

   【数据源】用户给的那个网页本身就是调这个官方接口渲染的，
             所以直接抓接口最准（1 次请求，很轻）：
     https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=hhad,had&channel=c

             实测 HTTP 200 · JSON · success:true · errorCode:"0"
             · value.totalCount     = 在售场次（页面上那个 N）
             · value.lastUpdateTime = 官方最后更新时间
             · 比赛在 value.matchInfoList[].subMatchList[]

   【500 兜底（2026-10-21 加）】
     云端（GitHub Actions，美国 IP）访问 webapi.sporttery.cn 一直 HTTP 567，
     这个脚本就永远抓不到 → jc-official.js 停在旧的那一天 →
     jc-reco-build.mjs 的「官方在售 ∩ 推荐」把新场次全挡在外面（页面空）。
     ⚠️ 退避一旦生效，老逻辑连兜底一起跳过，所以【退避只拦体彩那一次请求】。
     兜底数据源（云端实测可用，GB2312 页面）：
       https://live.500.com/jczq.php?e=YYYY-MM-DD   <- 竞彩在售名单（编号+时间+主客）
     做法：抓【北京今天 + 明天】两天，按编号合并去重（跨零点的场次两页都会出现），
           再生成和体彩官网【完全相同结构】的 jc-official.js（list 里只写 code/time）。
     两条路都失败 → 照老逻辑保留旧文件、退出码 10（绝不覆盖）。

   【产物】jc-official.js（UTF-8 无 BOM）：
     const JC_OFFICIAL = {
      "updated": "2026-10-16 04:00",          <- 我们抓到的时刻
      "inSale": 12,                           <- 官方在售场次
      "officialUpdate": "2026-10-15 21:53:14",<- 官方最后更新
      "list": [ { "code": "周六001", "time": "2026-10-17 14:00" }, ... ]
     };
     list = 官方在售的每一场（竞彩编号 + 开赛时间）。
       ⚠️ 只写 code/time 两个字段：jc-reco-build.mjs 用「编号@日期」对齐
          jc-data.js 里的推荐数据（和页面用 sp.list 对齐的口径一模一样）。
       ⚠️ 时间取官方 matchDate + matchTime，不拿 500.com 的时间 ——
          跨零点的场次两边日期可能差一天，会整场对不上。
     读取方：export-football.mjs / jc-reco-build.mjs 的
             loadVar('jc-official.js', 'JC_OFFICIAL')
             （和它们读 jc-data.js / jc-history.js / football.js 是同一套写法）

   【安全 / 省成本（照 update-football-smart.mjs 那套）】
     · 正常桌面浏览器 User-Agent + Referer: https://www.sporttery.cn/
     · 失败退避：连续失败 FAIL_PAUSE_AFTER 次 → 暂停 PAUSE_MINUTES 分钟
     · 抓不到【绝不覆盖】旧的 jc-official.js，保留上一次的数字
     · 绝不传任何 token / 不调 AI（0 成本）

   退出码：
     0  = 抓到了，写入了新的 jc-official.js
     10 = 本轮跳过（退避中 / 抓不到）—— 保留旧文件，调用方别慌
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'jc-official.js');
const LOG = path.join(ROOT, '_jc-count.log');
const STATE = path.join(ROOT, '_jc-count-backoff.json');

const API = 'https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=hhad,had&channel=c';

/* 【自测用】JC_COUNT_API 可以把这个地址指到别处（比如死端口），
   用来演练「抓不到时保留旧文件 + 退出码 10」这条路，不碰真接口。
   DSH_JC_ROOT 和 export-football.mjs 保持一致：只换数据目录。 */
const API_URL = process.env.JC_COUNT_API || API;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

/* 失败退避（写法照 update-football-smart.mjs / build-articles.mjs） */
const FAIL_PAUSE_AFTER = 6;    // 连续失败这么多次 → 暂停
const PAUSE_MINUTES = 120;     // 暂停时长（分钟）
const REQ_GAP_MS = 1500;       // 两次请求之间至少隔这么久（别刷太快）
const TIMEOUT_MS = 25000;

/* 【500 兜底】体彩官网抓不到时改抓这个（见文件头「500 兜底」）
   JC_500_BASE 只是自测钩子（照 JC_COUNT_API 的写法）：自测时指到死端口
   就能演练"兜底也失败 → 保留旧文件 + 退出码 10"这条路，不碰真站点。 */
const F500 = (d) => `${process.env.JC_500_BASE || 'https://live.500.com/jczq.php'}?e=${d}`;
const BJ_OFFSET_MS = 8 * 3600 * 1000;   // 北京时间（云端 TZ 不一定设了，自己算，不依赖环境）

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${m}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) { /* 忽略 */ }
};

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (e) { return { failStreak: 0, pausedUntil: 0, lastRun: '', runs: 0, skips: 0, ok: 0, lastCount: 0 }; }
}
function writeState(s) { try { fs.writeFileSync(STATE, JSON.stringify(s, null, 1), 'utf8'); } catch (e) { /* 忽略 */ } }

/* 本地时间 "YYYY-MM-DD HH:mm" —— 和 jc-data.js / articles-data.js 的写法一致 */
function stampMinute(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 读旧的 jc-official.js（抓不到时用来确认「旧文件还在」） */
function readOld() {
  try {
    const m = /"inSale"\s*:\s*(\d+)/.exec(fs.readFileSync(OUT, 'utf8'));
    return m ? Number(m[1]) : null;
  } catch (e) { return null; }
}

/* ============================================================
   500.com 兜底（体彩官网 567 时用）
   ============================================================ */
const p2 = (n) => String(n).padStart(2, '0');

/* 北京日期 "YYYY-MM-DD"，offsetDays=0 今天 / 1 明天。
   ⚠️ 一律从 UTC 时间戳 +8h 推，跟运行机器的时区无关（云端是 UTC）。 */
function bjDate(offsetDays = 0) {
  const d = new Date(Date.now() + BJ_OFFSET_MS + offsetDays * 86400000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/* 500 的页面是 GB2312/GBK（<meta charset=gb2312>）。Node 自带 ICU 能解；
   万一这个 node 没编 ICU，退回 utf8 也只会让中文变问号，编号/时间照样能解析。 */
function decode500(buf, ctype) {
  const head = buf.subarray(0, 600).toString('latin1');
  const isGbk = /charset\s*=\s*["']?(gb2312|gbk|gb18030)/i.test(head) ||
    /gb2312|gbk|gb18030/i.test(String(ctype || ''));
  if (isGbk) {
    for (const label of ['gb18030', 'gbk']) {
      try { return new TextDecoder(label).decode(buf); } catch (e) { /* 换下一个 */ }
    }
  }
  return buf.toString('utf8');
}

const clean = (s) => String(s || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/\s+/g, ' ')
  .trim();

/* 返回这一页的【生效期号】（页面 sel_expect 的第一项）；取不到返回 ''。
   用途：500 的 ?e= 传一个还没开卖的日期时会【回落】到当前期，
        靠它判断"这页到底是不是今天/明天那一期"，防止写进隔了好几天的数据。 */
function pageExpect(txt) {
  const seg = txt.slice(Math.max(0, txt.indexOf('id="sel_expect"')), txt.indexOf('id="sel_expect"') + 800);
  const m = /<option value="(\d{4}-\d{2}-\d{2})"/.exec(seg) ||
    /<option value="(\d{4}-\d{2}-\d{2})" selected/.exec(txt);
  return m ? m[1] : '';
}

/* 解析 500 的 jczq.php：一行 = 竞彩编号（周三001）+ 开赛时间（10-21 18:00）
   + 主队 + 客队。baseDate = 我们请求的 ?e= 日期，用来补年份（页面只给月-日）。
   返回 [{ code, time, home, away, status }]，time 已经补成和体彩官网一样的
   "YYYY-MM-DD HH:mm:ss"（只写到 jc-official.js 的 code/time，主客只用来打日志）。 */
function parse500(txt, baseDate) {
  const head = txt.indexOf('id="table_match"');
  if (head < 0) return [];
  const seg = txt.slice(head);
  const base = Date.parse(baseDate + 'T00:00:00Z');
  const rows = [];
  const trRe = /<tr id="a\d+"[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(seg)) !== null) {
    const inner = m[1];
    const tds = [...inner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    if (tds.length < 8) continue;
    const code = (clean(tds[0]).match(/周[一二三四五六日]\s*\d{3}/) || [])[0];
    if (!code) continue;
    const tm = /(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/.exec(clean(tds[3]));
    if (!tm) continue;
    const mm = Number(tm[1]), dd = Number(tm[2]), hh = Number(tm[3]), mi = Number(tm[4]);
    /* 补年份：在 base 的前后一年里挑离 base 最近的那一年（跨年 12-31 / 01-01 也不会错） */
    const baseY = Number(baseDate.slice(0, 4));
    let year = baseY, best = Infinity;
    for (const y of [baseY - 1, baseY, baseY + 1]) {
      const diff = Math.abs(Date.UTC(y, mm - 1, dd) - base);
      if (diff < best) { best = diff; year = y; }
    }
    rows.push({
      code,
      time: `${year}-${p2(mm)}-${p2(dd)} ${p2(hh)}:${p2(mi)}:00`,
      home: clean((tds[5].match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]),
      away: clean((tds[7].match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]),
      status: clean(tds[4])
    });
  }
  return rows;
}

/* 500 兜底主流程：今天 + 明天 两页 → 合并去重（按编号）→ 和体彩官网同结构。
   返回 { inSale, officialUpdate, list } 或 null（= 兜底也失败，调用方保留旧文件）。
   ⚠️ 只要有一页拿到且解析出场次就算成功；两页都失败才算失败。 */
async function fetch500() {
  const days = [bjDate(0), bjDate(1)];
  log(`   ↳ 体彩官网这轮没拿到 → 500.com 兜底（抓北京 ${days[0]} + ${days[1]} 两期，合并去重）`);
  const byCode = new Map();
  let okPages = 0;
  for (const day of days) {
    let txt;
    try {
      const r = await fetch(F500(day), {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Referer': 'https://live.500.com/'
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      txt = decode500(Buffer.from(await r.arrayBuffer()), r.headers.get('content-type'));
      okPages++;
    } catch (e) {
      const msg = String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 120);
      log(`      ⚠️ ${day} 抓取失败（${msg}）`);
      continue;
    }
    /* 只认「今天/明天 ±2 天」的期号：?e= 传没开卖的日期时 500 会回落到当前期，
       回落到好几期之前的数据就是脏数据，宁可不写。 */
    const eff = pageExpect(txt);
    if (eff) {
      const diffDays = Math.round((Date.parse(eff + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000);
      if (Math.abs(diffDays) > 2) {
        log(`      ⚠️ ${day} 这一页实际是 ${eff} 那一期（差 ${diffDays} 天）→ 跳过，不用脏数据`);
        continue;
      }
    }
    const rows = parse500(txt, day);
    /* 已完场（状态"完"）的已经不是"在售"了，体彩官网的 totalCount 也会掉下来 → 剔掉 */
    const alive = rows.filter((x) => !/^完/.test(x.status));
    const done = rows.length - alive.length;
    log(`      · ${day}：解析 ${rows.length} 场${done ? `（完场 ${done} 场已剔）` : ''} → 留 ${alive.length} 场` +
      (alive.length ? `，如 ${alive[0].code} ${alive[0].time} ${alive[0].home} vs ${alive[0].away}` : ''));
    for (const row of alive) {
      const prev = byCode.get(row.code);
      if (!prev) { byCode.set(row.code, row); continue; }
      if (prev.time !== row.time) {
        log(`      ⚠️ ${row.code} 两页时间不一致（${prev.time} / ${row.time}）→ 用先抓到的`);
      }
    }
  }
  if (!okPages) return null;
  /* 按编号排序，输出顺序和体彩官网一致（周三001 → 周三013） */
  const list = Array.from(byCode.values())
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map((r) => ({ code: r.code, time: r.time }));
  if (!list.length) {
    log('      ⚠️ 500 两天都解析不出场次（多半还没开新一期）→ 当兜底失败');
    return null;
  }
  log(`   ✅ 500 兜底拿到 ${list.length} 场：${list[0].code}（${list[0].time}）… ${list[list.length - 1].code}`);
  /* officialUpdate 留空：这是 500 的名单，没有"体彩官方最后更新时间"这种东西，
     不编造。页面那边 INSALE_STAMP 本来就优先用我们自己写的 updated。 */
  return { inSale: list.length, officialUpdate: '', list };
}


const st = readState();
const now = Date.now();

/* 【最小间隔节流】--min-gap <分钟>
   ------------------------------------------------------------
   晒票那一班改成每 10 分钟跑之后，用这个参数把「在售场次」钉回 30 分钟
   （体彩官网没必要 10 分钟问一次）。
   不足间隔就按「本轮跳过」退出码 10 —— 调用方把 10 当【正常跳过】处理。
   不传参数 = 老行为（每次都抓），所以 daily-update / cloud-build 不受影响。 */
const gapIdx = process.argv.indexOf('--min-gap');
if (gapIdx >= 0) {
  const minGap = Number(process.argv[gapIdx + 1] || 0);
  const last = Date.parse(st.lastRun || '');
  if (minGap > 0 && isFinite(last) && (now - last) < minGap * 60000) {
    const left = Math.ceil((minGap * 60000 - (now - last)) / 60000);
    log(`⏸  距上次成功只过了 ${Math.round((now - last) / 60000)} 分钟（要求 >= ${minGap} 分钟），` +
      `还差 ${left} 分钟 —— 本轮跳过，保留上一份 jc-official.js`);
    st.skips = (st.skips || 0) + 1;
    writeState(st);
    process.exit(10);
  }
}

/* ---------- 1. 退避中 → 只跳过【体彩官网那一次请求】，500 兜底照走 ----------
   ⚠️ 以前这里是直接 exit 10 整轮跳过。云端体彩官网天天 567，
      一进退避就等于兜底也跟着停了，jc-official.js 永远停在旧的一天
      → 「官方在售 ∩」把新场次全挡在外面。所以改成只拦那一次请求。 */
const paused = !!(st.pausedUntil && now < st.pausedUntil);
if (paused) {
  const left = Math.ceil((st.pausedUntil - now) / 60000);
  log(`⏸  体彩官网退避中（连续失败 ${st.failStreak} 次），还剩 ${left} 分钟 —— 本轮跳过体彩官网，只走 500 兜底`);
}

/* 请求间隔：上一次跑得太近就补个延时（正常每小时一次，几乎不会触发） */
if (st.lastReqAt && now - st.lastReqAt < REQ_GAP_MS) {
  await new Promise((r) => setTimeout(r, REQ_GAP_MS - (now - st.lastReqAt)));
}

/* ---------- 2. 抓官方接口（原逻辑，一行没改，只抽成函数） ---------- */
async function fetchSporttery() {
  const r = await fetch(API_URL, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json,text/plain,*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://www.sporttery.cn/',
      'Origin': 'https://www.sporttery.cn'
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  st.lastReqAt = Date.now();
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j && j.success === false) throw new Error('success=false errorCode=' + j.errorCode);
  const v = (j && j.value) || {};
  const n = Number(v.totalCount);
  if (!Number.isFinite(n) || n < 0) throw new Error('totalCount 不是一个数字：' + JSON.stringify(v.totalCount));
  /* 【在售清单】value.matchInfoList[].subMatchList[] —— 官方在售的每一场。
     只留 code + time（对齐用，见文件头）；没有编号/时间的行跳过。
     ⚠️ 不去重、不补 500.com 的场次：这是【官方】的名单，原样照抄。 */
  const list = [];
  (Array.isArray(v.matchInfoList) ? v.matchInfoList : []).forEach((grp) => {
    const subs = grp && Array.isArray(grp.subMatchList) ? grp.subMatchList : [];
    subs.forEach((m) => {
      if (!m) return;
      const code = String(m.matchNumStr || '').trim();
      const time = [String(m.matchDate || ''), String(m.matchTime || '')].filter(Boolean).join(' ').trim();
      if (!code || !time) return;
      list.push({ code, time });
    });
  });
  return { inSale: n, officialUpdate: String(v.lastUpdateTime || ''), list };
}

/* ---------- 2. 先试体彩官网（原逻辑不变：成功就用它的） ---------- */
log('—— 本轮开始（体彩官网在售场次）——');
let res = null;
let src = 'sporttery';
if (paused) {
  /* 退避中：这一次请求不发，直接去 500 兜底（见上面第 1 步的注释） */
} else {
  try {
    res = await fetchSporttery();
  } catch (e) {
    const msg = String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 120);
    st.failStreak = (st.failStreak || 0) + 1;
    log(`⚠️  体彩官网抓取失败（${msg}）· 连续失败 ${st.failStreak} 次`);
    if (st.failStreak >= FAIL_PAUSE_AFTER) {
      st.pausedUntil = now + PAUSE_MINUTES * 60000;
      st.failStreak = 0;
      log(`🛑 连续失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停体彩官网 ${PAUSE_MINUTES} 分钟（保护数据源；500 兜底照走）`);
    }
  }
}

/* ---------- 2.5 【新增】体彩官网失败 → 500.com 兜底 ----------
   云端（美国 IP）体彩官网固定 567，这条路是云端唯一能出名单的途径。 */
if (!res) {
  res = await fetch500();
  if (res) src = '500';
}

/* ---------- 2.6 两个源都没拿到 → 保留旧的（原逻辑） ---------- */
if (!res) {
  const old = readOld();
  log(`   ↩ 保留旧的 jc-official.js${old === null ? '（还没有旧文件，页面会自动退回 stat.upcoming + stat.live）' : `（上一次在售 ${old} 场）`}`);
  st.skips = (st.skips || 0) + 1;
  st.lastRun = new Date().toISOString();
  writeState(st);
  process.exit(10);
}

/* ---------- 3. 成功 → 写 jc-official.js（结构体例和原来一模一样） ---------- */
const updated = stampMinute();
const SRC_NOTE = src === '500'
  ? '500.com live.500.com/jczq.php（体彩官网抓不到时的兜底，结构与体彩官网一致）'
  : '体彩官网 webapi.sporttery.cn（getMatchCalculatorV1）';
const body = `/* 自动生成，请勿手动编辑 · ${updated}
   数据源：${SRC_NOTE}
   inSale = 官方公布的【在售场次】，就是竞彩页「体彩竞彩在售 N 场」的那个 N。
   list   = 官方在售的每一场（编号 + 开赛时间），jc-reco-build.mjs 靠它做
            「官方在售 ∩ 推荐」过滤；只写 code/time 两个字段。
   该文件由 build-jc-count.mjs 每小时抓一次；抓不到时不会覆盖本文件。 */
const JC_OFFICIAL = {
 "updated": ${JSON.stringify(updated)},
 "inSale": ${res.inSale},
 "officialUpdate": ${JSON.stringify(res.officialUpdate)},
 "list": ${JSON.stringify(res.list, null, 1)}
};
`;
/* 【清单自检】官方在售 N 场 vs 明细条数：不一致要留痕（多半是接口结构变了），
   但仍然按解析出来的明细写 —— 过滤宁可按"明细里真有这场"走。 */
if (res.list.length !== res.inSale) {
  log(`⚠️ 官方在售 ${res.inSale} 场，明细只解析出 ${res.list.length} 场（差 ${res.inSale - res.list.length} 场）`);
}
fs.writeFileSync(OUT, body, 'utf8');

/* 体彩官网成功了才清退避；500 兜底成功不动它 —— 让体彩官网继续休息，
   下一轮还是先试体彩、失败再兜底（退避只影响那一次请求）。 */
if (src !== '500') {
  st.failStreak = 0;
  st.pausedUntil = 0;
}
st.ok = (st.ok || 0) + 1;
st.lastCount = res.inSale;
st.lastSource = src;
st.lastRun = new Date().toISOString();
writeState(st);

log(`✅ 在售 ${res.inSale} 场（明细 ${res.list.length} 场）· 来源=${src === '500' ? '500.com 兜底' : '体彩官网'} · 官方更新 ${res.officialUpdate || '(无)'} · 已写入 jc-official.js（${updated}）`);
process.exit(0);
