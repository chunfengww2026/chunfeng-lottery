/* ============================================================
   update-football-live.mjs
   ------------------------------------------------------------
   用户要求：「足球每 5 分钟抓一次，只抓实时比赛数据，
             盘口 / 指数 / 亚指 / 推荐 一律不动」

   所以这个脚本【只做一件事】：把 245qq 的「进行中」列表里的
   比分 / 比赛时间，写回 football.js 里对应那几场比赛上。

   和 update-football-smart.mjs（每 30 分钟完整抓取）的分工：
     · update-football-smart.mjs → 完整抓取（含 build-jc.mjs 的 24 场
       赔率、亚指、盘口、指数、推荐），每 30 分钟一次
     · update-football-live.mjs  → 【只】更新比分，每 5 分钟一次
       —— 本文件一行都不会碰 jc-data.js

   为什么不给 update-football-smart.mjs 加 --live-only：
     那个脚本正在被「春风十里-足球-每30分钟」计划任务使用（生产路径），
     而且它的流程是「调 build-football.mjs 整体重写 football.js」，
     恰恰是本次要求【不能用】的做法（会把别的东西一起改）。
     单独一个文件 = 改动爆炸半径为零，30 分钟那条链路完全不受影响。

   ------------------------------------------------------------------
   省流量的做法（和 30 分钟版同一套思路）：
     1) 只发【1 个】请求：GetRunballList?lang=zh
        这个响应本身就是「进行中列表」，直接拿来用，不再发第二个请求
     2) 列表为空（没有进行中的比赛）→ 直接退出：不重写、不出页面、不同步
     3) 比分 / 分钟全都和上次一样（没有任何变化）→ 不重出页面、不同步
        （例外：上一轮写了数据但出页面/同步失败 → pendingRebuild 补做）
     4) 失败退避：连续失败 10 次 → 暂停 120 分钟

   ------------------------------------------------------------------
   产物：
     football.js            （只改 score / minute 这两类字段）
     _football-live.log     （运行日志）
     _football-live-backoff.json（退避状态）

   用法：node update-football-live.mjs
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const FB_JS = path.join(ROOT, 'football.js');
const JC_JS = path.join(ROOT, 'jc-data.js');

/* 测试钩子：只在自测脚本里用，正常计划任务不会设置这三个变量。
   FB_LIVE_API   —— 换成别的地址（用来真跑「失败退避」/「没有比赛」）
   FB_LIVE_STATE —— 换个退避状态文件（免得自测污染真实状态）
   FB_LIVE_LOG   —— 换个日志文件（免得自测污染真实日志） */
const API_URL = process.env.FB_LIVE_API
  || 'https://new-jiko.sukeku.com/api/Game/GetRunballList?lang=zh';
const LOG = process.env.FB_LIVE_LOG
  ? path.resolve(process.env.FB_LIVE_LOG)
  : path.join(ROOT, '_football-live.log');
const STATE = process.env.FB_LIVE_STATE
  ? path.resolve(process.env.FB_LIVE_STATE)
  : path.join(ROOT, '_football-live-backoff.json');

/* ============================================================
   --cloud-light —— 云端「每 5 分钟那一班」专用开关
   ------------------------------------------------------------
   云端每 5 分钟的班次【只许干一件事：更新比分】。本机跑的时候
   这个脚本还会顺带做三件"本机才该做"的事，云端必须全部关掉：

     · 关掉 cloud/sync-cloud.mjs（本机 → 云端的上传）
       云端自己就是云端，再调一次同步既没有 token 也毫无意义，
       而且失败会把 pendingRebuild 永远挂成 true → 每 5 分钟都白重建一次页面。
     · 关掉 build-xysp.mjs（晒票抓取）
       晒票由「每 30 分钟那一班」负责；5 分钟一次抓一起彩等于自己打自己，
       用户明确要求 5 分钟那班"只更新比分（轻量）"。
     · 关掉 export-cloud-tickets.mjs（tickets.json 导出）
       那个脚本在本机是写 项目根/cloud/out/tickets.json；
       在云端 scripts/ 目录里跑会算成 cloud/scripts/cloud/out/tickets.json（错的路径）。
       号码没变，云端也不需要重发 tickets.json。

   本机的计划任务【不传这个开关】，所以本机行为一个字节都没变。 */
const CLOUD_LIGHT = process.argv.includes('--cloud-light');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* 退避规则（和 30 分钟版一致） */
const FAIL_PAUSE_AFTER = 10;   // 连续失败这么多次 → 暂停
const PAUSE_MINUTES = 120;     // 暂停时长
const SOFT_FAIL_LIMIT = 3;     // 单轮内连续失败这么多次 → 本轮放弃

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${m}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) { /* 忽略 */ }
};

/* ============================================================
   【核心 1】只更新比分 / 比赛时间
   ------------------------------------------------------------
   只碰这些字段：home.score / away.score / minute
   其它字段（赔率 odds、推荐 reco、result、red、rank、kind…）
   一个都不动 —— 因为不碰 jc-data.js，页面上的赔率/亚指/盘口/指数
   本来就从 jc-data.js 来，天然不受影响。
   ============================================================ */
export const SCORE_LINE_RE = /^\s*"(score|minute)": -?\d+(\.\d+)?,?$/;
export const SCORE_LINE_NULL_RE = /^\s*"score": null,?$/;

/** football.js 里所有比赛拉平，并建 gid 索引 */
function flatten(data) {
  const out = [];
  const lists = (data && data.lists) || {};
  for (const key of ['upcoming', 'live', 'finished']) {
    const arr = Array.isArray(lists[key]) ? lists[key] : [];
    arr.forEach((g, i) => { if (g) out.push({ key, i, g }); });
  }
  return out;
}

/**
 * 把「进行中列表」的比分写进 football.js 的数据对象里（就地改，返回统计）
 * @param {object} data       FOOTBALL_DATA 对象
 * @param {Array}  liveArr    GetRunballList 的响应数组
 * @returns {{changed:Array, same:number, unmatched:number, skipped:number, finishedHit:number}}
 */
export function applyLiveScores(data, liveArr) {
  const idx = new Map();
  flatten(data).forEach((e) => {
    const k = String(e.g.gid);
    if (!idx.has(k)) idx.set(k, e);
  });

  const changed = [];
  let same = 0, unmatched = 0, skipped = 0, finishedHit = 0;

  (Array.isArray(liveArr) ? liveArr : []).forEach((it) => {
    if (!it || it.GID === undefined || it.GID === null) { skipped++; return; }
    const e = idx.get(String(it.GID));
    if (!e) { unmatched++; return; }

    /* 已经归到「已完场」的比赛不再被实时比分覆盖：
       完场比分由 30 分钟那条完整链路负责，这里只维护还在踢的。
       （也顺手挡掉 gid 撞车时误改历史记录的风险） */
    if (e.key === 'finished') { finishedHit++; return; }

    const hs = it.T1 ? it.T1.S : null;
    const as_ = it.T2 ? it.T2.S : null;
    if (hs === null || hs === undefined || as_ === null || as_ === undefined) { skipped++; return; }

    const g = e.g;
    if (!g.home || !g.away) { skipped++; return; }

    const minute = (it.TS === null || it.TS === undefined) ? (g.minute || 0) : it.TS;

    if (g.home.score === hs && g.away.score === as_ && g.minute === minute) { same++; return; }

    const before = `${g.home.score}-${g.away.score} ${g.minute}'`;
    g.home.score = hs;
    g.away.score = as_;
    g.minute = minute;
    changed.push({ gid: it.GID, list: e.key, before, after: `${hs}-${as_} ${minute}'` });
  });

  return { changed, same, unmatched, skipped, finishedHit };
}

/* ============================================================
   【核心 2】写回文件 —— 带「只许改比分行」的硬校验
   ------------------------------------------------------------
   football.js 是 build-football.mjs 用 JSON.stringify(.., null, 1)
   生成的，格式固定；我们用同样的参数序列化，未改动的部分字节完全一致。
   然后逐行比对：任何一行不同，都必须匹配
       "score": 数字 / "minute": 数字 / "score": null
   只要有一行不匹配 → 抛错，绝不出手写文件。
   ============================================================ */
const HEAD_RE = /^(\/\*[^\n]*\*\/\n)const FOOTBALL_DATA = ([\s\S]*);\n$/;

export function serializeFootball(data, head) {
  return head + 'const FOOTBALL_DATA = ' + JSON.stringify(data, null, 1) + ';\n';
}

/**
 * @returns {{text:string, changed:boolean, diffLines:number[], samples:Array}}
 */
export function patchFootballText(oldText, data) {
  const m = HEAD_RE.exec(oldText);
  if (!m) throw new Error('football.js 头部格式不是预期结构，为安全起见不写回');
  const head = m[1];
  const newText = serializeFootball(data, head);
  if (newText === oldText) return { text: oldText, changed: false, diffLines: [], samples: [] };

  const a = oldText.split('\n');
  const b = newText.split('\n');
  if (a.length !== b.length) {
    throw new Error(`行数变了（旧 ${a.length} / 新 ${b.length}）→ 说明不只是比分变了，拒绝写回`);
  }

  const diffLines = [];
  const samples = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const ok = SCORE_LINE_RE.test(b[i]) || SCORE_LINE_NULL_RE.test(b[i]);
    if (!ok) {
      throw new Error(`第 ${i + 1} 行出现【比分以外】的改动 → 拒绝写回：${JSON.stringify(a[i])} → ${JSON.stringify(b[i])}`);
    }
    diffLines.push(i + 1);
    if (samples.length < 6) samples.push(`第 ${i + 1} 行  ${a[i].trim()}  →  ${b[i].trim()}`);
  }
  return { text: newText, changed: true, diffLines, samples };
}

/* ---------- 读 football.js ---------- */
export function readFootball(file) {
  const p = file || FB_JS;
  const text = fs.readFileSync(p, 'utf8');
  const ctx = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
  vm.runInContext(text + '\nglobalThis.__FB = FOOTBALL_DATA;', ctx, { filename: 'football.js' });
  return { text, data: ctx.__FB };
}

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const md5file = (p) => { try { return md5(fs.readFileSync(p)); } catch (e) { return '(读不到)'; } };

/* ---------- 退避状态 ---------- */
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (e) { return { failStreak: 0, pausedUntil: 0, lastRun: '', runs: 0, skips: 0, changes: 0, rebuilds: 0, pendingRebuild: false }; }
}
function writeState(s) { try { fs.writeFileSync(STATE, JSON.stringify(s, null, 1), 'utf8'); } catch (e) { /* 忽略 */ } }

function runStep(file, args) {
  try {
    const out = execFileSync(NODE, [path.join(ROOT, file)].concat(args || []), {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 8 * 60 * 1000,
    });
    return { ok: true, out: String(out || '') };
  } catch (e) {
    return { ok: false, err: String((e && (e.message || e.stderr)) || e).slice(0, 400) };
  }
}

/* ---------- 抓「进行中」列表（唯一的一个请求）---------- */
export async function fetchLive(url) {
  try {
    const r = await fetch(url || API_URL, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Origin': 'https://m.245qq.com',
        'Referer': 'https://m.245qq.com/',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return { ok: false, err: 'HTTP ' + r.status };
    const j = await r.json();
    if (!Array.isArray(j)) return { ok: false, err: '响应不是数组' };
    return { ok: true, list: j };
  } catch (e) {
    return { ok: false, err: String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 120) };
  }
}

/* ============================================================
   主流程
   ============================================================ */
async function main() {
  const st = readState();
  const now = Date.now();

  /* 1. 退避期？ */
  if (st.pausedUntil && now < st.pausedUntil) {
    const left = Math.ceil((st.pausedUntil - now) / 60000);
    log(`⏸  退避中（连续失败 ${st.failStreak} 次），还剩 ${left} 分钟，本轮跳过`);
    st.skips = (st.skips || 0) + 1;
    writeState(st);
    return;
  }

  log('—— 本轮开始（只抓实时比分）——');
  const jcBefore = md5file(JC_JS);

  /* 2. 唯一的请求：进行中列表 */
  const r = await fetchLive(API_URL);
  if (!r.ok) {
    st.failStreak = (st.failStreak || 0) + 1;
    log(`⚠️  抓取失败（${r.err}）· 连续失败 ${st.failStreak} 次`);
    if (st.failStreak >= FAIL_PAUSE_AFTER) {
      st.pausedUntil = now + PAUSE_MINUTES * 60000;
      st.failStreak = 0;
      log(`🛑 连续失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停 ${PAUSE_MINUTES} 分钟（避免被封）`);
    }
    writeState(st);
    return;
  }

  st.failStreak = 0;

  /* 3. 没有进行中的比赛 → 通常直接退出（不重写、不出页面、不同步）
        ⚠️ __ADD_XYSP__ 用户要求晒票也每 5 分钟抓 —— 而 build-xysp.mjs 就在本任务的
           步骤里。如果晒票刚更新了却因为「没有比赛」直接退出，页面就永远不会重建。
           所以：晒票数据在最近 12 分钟内变过 → 照样继续往下走（重建 + 同步）。 */
  if (!r.list.length && !xyspChanged) {
    log('💤 当前没有进行中的比赛、晒票也没变 → 直接退出（不发多余请求、不出页面、不同步）');
    st.skips = (st.skips || 0) + 1;
    st.lastRun = new Date().toISOString();
    writeState(st);
    return;
  }
  if (!r.list.length && xyspChanged) {
    log('📸 没有进行中的比赛，但晒票有新数据 → 继续重建页面 + 同步');
  }

  /* 4. 读 football.js，只改比分 */
  let fb;
  try { fb = readFootball(FB_JS); }
  catch (e) {
    st.failStreak = (st.failStreak || 0) + 1;
    log(`❌ football.js 读取失败：${e.message}`);
    writeState(st);
    return;
  }

  const res = applyLiveScores(fb.data, r.list);
  log(`⚽ 进行中 ${r.list.length} 场 · 比分/时间有变化 ${res.changed.length} 场 · 没变化 ${res.same} 场 · ` +
      `football.js 里配不到 ${res.unmatched} 场 · 数据不全跳过 ${res.skipped} 场 · ` +
      `已归档完场不动 ${res.finishedHit} 场`);
  res.changed.slice(0, 12).forEach((c) => log(`   · gid=${c.gid} [${c.list}] ${c.before} → ${c.after}`));
  if (res.changed.length > 12) log(`   · …另有 ${res.changed.length - 12} 场`);

  /* 5. 写回 football.js（带「只许改比分行」硬校验） */
  let patched;
  try {
    patched = patchFootballText(fb.text, fb.data);
  } catch (e) {
    st.failStreak = (st.failStreak || 0) + 1;
    log(`🛑 写回前校验不通过 → 本轮不改任何文件：${e.message}`);
    writeState(st);
    return;
  }

  const wrote = patched.changed;
  if (wrote) {
    const before = md5file(FB_JS);
    fs.writeFileSync(FB_JS, patched.text, 'utf8');
    log(`📝 已写回 football.js（改动 ${patched.diffLines.length} 行，全部是 score / minute 字段）`);
    patched.samples.forEach((s) => log('   ' + s));
    log(`   football.js md5 ${before} → ${md5file(FB_JS)}`);
  } else {
    log('✅ football.js 无需改动（比分 / 时间与上次一致）');
  }

  /* 6. 出页面 + 同步 */
  if (!wrote && !st.pendingRebuild) {
    log('⏭  没有任何变化 → 不重出页面、不同步（省流量）');
    st.skips = (st.skips || 0) + 1;
    st.lastRun = new Date().toISOString();
    writeState(st);
    log('—— 本轮结束 ——');
    return;
  }
  if (!wrote && st.pendingRebuild) log('↩️  上一轮有改动但没出页面成功 → 本轮补做出页面');

  /* 【先记账，再干活】
     football.js 已经新了，接下来要出页面 + 同步 —— 这一步可能被外部打断
     （实测出现过：进程被 Ctrl+C / 被杀，日志停在 export-cloud-tickets 之后）。
     所以先把「欠一次重建」写进状态文件：
       · 正常跑完 → 下面会把它改回 false
       · 中途被打断 → 文件里留着 true，下一轮无条件补做
     不然会出现「比分是新的、页面是旧的，而且再也不补」的坏情况。 */
  /* __ADD_XYSP__ 【晒票变化检测】
     原来的逻辑：没有进行中的比赛 → 直接退出（不重建不同步）。
     但晒票是每 5 分钟一起抓的 —— 如果晒票有了新图却没重建，页面就永远是旧的。
     所以：只要 xysp-data.js 在最近 12 分钟内被改过，就照样重建 + 同步。 */
  var xyspChanged = false;
  try {
    var xyspFile = path.join(ROOT, 'xysp-data.js');
    if (fs.existsSync(xyspFile)) {
      var ageMs = Date.now() - fs.statSync(xyspFile).mtimeMs;
      xyspChanged = ageMs < 12 * 60 * 1000;
    }
  } catch (e) { /* 忽略 */ }

  st.pendingRebuild = true;
  writeState(st);

  const steps = [];
  /* 【推荐串红黑 · 每 5 分钟比对一次】用户要求「每 5 分钟的比分任务跑完，去比对」。
     ⚠️ 必须排在 export-football.mjs【之前】：它是纯本地计算（读 jc-data /
        jc-official / jc-history 回填红黑，写 jc-reco-data.js），不联网、不调 AI；
        页面再读它，这样重建出来的页面带的就是刚比对完的红黑。
     ⚠️ 它不抓任何东西 —— 云端「5 分钟那班只更新比分」的约束没有被破坏
        （唯一的网络请求还是那次比分抓取）。 */
  steps.push(['jc-reco-build.mjs', []]);
  /* 云端轻量班：不抓晒票（交给每 30 分钟那一班） */
  if (!CLOUD_LIGHT) steps.push(['build-xysp.mjs', []]);
  else log('  ☁️ 云端轻量班：跳过晒票抓取（build-xysp.mjs 由每 30 分钟那一班负责）');
  steps.push(['export-football.mjs', []]);
  steps.push(['export-static.mjs', []]);
  /* 云端轻量班：不导出 tickets.json（号码没变；路径也会算错） */
  if (!CLOUD_LIGHT) steps.push(['export-cloud-tickets.mjs', []]);
  else log('  ☁️ 云端轻量班：跳过 tickets.json 导出（号码没变，不用重发）');

  let softFail = 0, allOk = true;
  for (const [file, args] of steps) {
    const s = runStep(file, args);
    if (s.ok) { log(`  ✅ ${file}`); softFail = 0; }
    else {
      allOk = false;
      softFail++;
      log(`  ❌ ${file} 失败：${s.err.slice(0, 160)}`);
      if (softFail >= SOFT_FAIL_LIMIT) { log(`  ⚠️ 本轮连续失败 ${softFail} 次 → 放弃本轮`); break; }
    }
  }

  /* 同步云端（云端轻量班跳过：自己就是云端，而且没有 token） */
  let syncOk = true;
  if (CLOUD_LIGHT) {
    log('  ☁️ 云端轻量班：跳过「同步到云端」这一步（页面已在本机重新生成，随后由 workflow 直接部署）');
  } else if (softFail < SOFT_FAIL_LIMIT) {
    const sync = runStep(path.join('cloud', 'sync-cloud.mjs'), []);
    if (sync.ok) log('  ✅ 同步云端');
    else { syncOk = false; log(`  ❌ 同步失败：${sync.err.slice(0, 160)}`); }
  } else {
    syncOk = false;
  }

  /* 出页面 / 同步没做完 → 记下来，下一轮补做 */
  st.pendingRebuild = !(allOk && syncOk);
  if (st.pendingRebuild) {
    st.failStreak = (st.failStreak || 0) + 1;
    log(`⚠️  出页面/同步未全部成功 → pendingRebuild=true，下一轮补做（连续失败 ${st.failStreak} 次）`);
    if (st.failStreak >= FAIL_PAUSE_AFTER) {
      st.pausedUntil = now + PAUSE_MINUTES * 60000;
      st.failStreak = 0;
      log(`🛑 连续失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停 ${PAUSE_MINUTES} 分钟`);
    }
  }

  /* 7. 收尾：证明没碰赔率 */
  const jcAfter = md5file(JC_JS);
  log(`🔒 jc-data.js md5 跑前 ${jcBefore} / 跑后 ${jcAfter} → ${jcBefore === jcAfter ? '完全相同 ✅（赔率/亚指/盘口/指数一个字节都没动）' : '不一样 ❌ 有问题！'}`);

  st.changes = (st.changes || 0) + res.changed.length;
  st.rebuilds = (st.rebuilds || 0) + 1;
  st.lastRun = new Date().toISOString();
  writeState(st);
  log('—— 本轮结束 ——');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((e) => {
    console.error('❌ 出错了：', e && e.message);
    process.exitCode = 1;
  });
}
