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

/* ---------- 1. 退避中就直接跳过 ---------- */
if (st.pausedUntil && now < st.pausedUntil) {
  const left = Math.ceil((st.pausedUntil - now) / 60000);
  log(`⏸  退避中（连续失败 ${st.failStreak} 次），还剩 ${left} 分钟，本轮跳过`);
  st.skips = (st.skips || 0) + 1;
  writeState(st);
  process.exit(10);
}

/* 请求间隔：上一次跑得太近就补个延时（正常每小时一次，几乎不会触发） */
if (st.lastReqAt && now - st.lastReqAt < REQ_GAP_MS) {
  await new Promise((r) => setTimeout(r, REQ_GAP_MS - (now - st.lastReqAt)));
}

/* ---------- 2. 抓官方接口 ---------- */
log('—— 本轮开始（体彩官网在售场次）——');
let res = null;
try {
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
  res = { inSale: n, officialUpdate: String(v.lastUpdateTime || ''), list };
} catch (e) {
  const msg = String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 120);
  st.failStreak = (st.failStreak || 0) + 1;
  log(`⚠️  抓取失败（${msg}）· 连续失败 ${st.failStreak} 次`);
  if (st.failStreak >= FAIL_PAUSE_AFTER) {
    st.pausedUntil = now + PAUSE_MINUTES * 60000;
    st.failStreak = 0;
    log(`🛑 连续失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停 ${PAUSE_MINUTES} 分钟（保护数据源）`);
  }
  const old = readOld();
  log(`   ↩ 保留旧的 jc-official.js${old === null ? '（还没有旧文件，页面会自动退回 stat.upcoming + stat.live）' : `（上一次在售 ${old} 场）`}`);
  st.skips = (st.skips || 0) + 1;
  st.lastRun = new Date().toISOString();
  writeState(st);
  process.exit(10);
}

/* ---------- 3. 成功 → 写 jc-official.js ---------- */
const updated = stampMinute();
const body = `/* 自动生成，请勿手动编辑 · ${updated}
   数据源：体彩官网 webapi.sporttery.cn（getMatchCalculatorV1）
   inSale = 官方公布的【在售场次】，就是竞彩页「体彩竞彩在售 N 场」的那个 N。
   list   = 官方在售的每一场（码号 + 开赛时间），jc-reco-build.mjs 靠它做
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

st.failStreak = 0;
st.pausedUntil = 0;
st.ok = (st.ok || 0) + 1;
st.lastCount = res.inSale;
st.lastRun = new Date().toISOString();
writeState(st);

log(`✅ 官方在售 ${res.inSale} 场（明细 ${res.list.length} 场）· 官方更新 ${res.officialUpdate || '(无)'} · 已写入 jc-official.js（${updated}）`);
process.exit(0);
