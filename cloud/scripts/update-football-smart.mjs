/* ============================================================
   update-football-smart.mjs
   ------------------------------------------------------------
   用户选的方案 A：「每 30 分钟 + 只在有比赛时才抓 + 失败退避」

   为什么要这样（保护数据源，别被封）：
     · 500.com 每轮要抓 24 场赔率 = 24 次请求
     · 硬性每 30 分钟跑 = 48 轮 × 24 = 1,150 次/天（中等风险）
     · 但一天里真正有比赛的时间只有 6~10 小时
     · 所以：先花【1 次】轻量请求看有没有「进行中」的比赛
             有  → 才做完整抓取（24 次）
             没有 → 直接跳过（只花 1 次）
     · 再加【失败退避】：连续失败就停，别一直撞

   产物：写 _football-smart.log，并在 _football-backoff.json 记状态
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const LOG = path.join(ROOT, '_football-smart.log');
const STATE = path.join(ROOT, '_football-backoff.json');

/* 退避规则 */
const FAIL_PAUSE_AFTER = 10;          // 连续失败这么多次 → 暂停
const PAUSE_MINUTES = 120;            // 暂停时长
const SOFT_FAIL_LIMIT = 3;            // 单轮内连续失败这么多次 → 本轮放弃

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${m}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) { /* 忽略 */ }
};

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (e) { return { failStreak: 0, pausedUntil: 0, lastRun: '', runs: 0, skips: 0, fulls: 0 }; }
}
function writeState(s) { try { fs.writeFileSync(STATE, JSON.stringify(s, null, 1), 'utf8'); } catch (e) {} }

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

/* ---------- 1. 检查是否在退避期 ---------- */
const st = readState();
const now = Date.now();
if (st.pausedUntil && now < st.pausedUntil) {
  const left = Math.ceil((st.pausedUntil - now) / 60000);
  log(`⏸  退避中（连续失败 ${st.failStreak} 次），还剩 ${left} 分钟，本轮跳过`);
  st.skips = (st.skips || 0) + 1;
  writeState(st);
  process.exit(0);
}

/* ---------- 2. 轻量探测：有没有「进行中」的比赛 ---------- */
log('—— 本轮开始 ——');
const probe = await (async () => {
  try {
    const r = await fetch('https://new-jiko.sukeku.com/api/Game/GetRunballList?lang=zh', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'application/json',
        'Origin': 'https://m.245qq.com',
        'Referer': 'https://m.245qq.com/',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return { ok: false, err: 'HTTP ' + r.status };
    const j = await r.json();
    const arr = Array.isArray(j) ? j : [];
    return { ok: true, live: arr.length };
  } catch (e) {
    return { ok: false, err: String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 80) };
  }
})();

if (!probe.ok) {
  st.failStreak = (st.failStreak || 0) + 1;
  log(`⚠️  探测失败（${probe.err}）· 连续失败 ${st.failStreak} 次`);
  if (st.failStreak >= FAIL_PAUSE_AFTER) {
    st.pausedUntil = now + PAUSE_MINUTES * 60000;
    st.failStreak = 0;
    log(`🛑 连续失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停 ${PAUSE_MINUTES} 分钟（避免被封）`);
  }
  writeState(st);
  process.exit(0);
}

/* 探测成功 → 失败计数清零 */
st.failStreak = 0;

if (probe.live === 0) {
  log('💤 当前没有进行中的比赛 → 跳过完整抓取（本轮只花了 1 次请求）');
  st.skips = (st.skips || 0) + 1;
  st.lastRun = new Date().toISOString();
  writeState(st);
  process.exit(0);
}

log(`⚽ 有 ${probe.live} 场进行中 → 开始完整抓取`);

/* ---------- 3. 完整抓取 + 出页面 + 同步 ---------- */
const steps = [
  ['build-football.mjs', []],
  ['build-jc.mjs', []],
  ['export-football.mjs', []],
  ['export-static.mjs', []],
  ['export-cloud-tickets.mjs', []],
];

let softFail = 0;
for (const [file, args] of steps) {
  const r = runStep(file, args);
  if (r.ok) { log(`  ✅ ${file}`); softFail = 0; }
  else {
    softFail++;
    log(`  ❌ ${file} 失败：${r.err.slice(0, 160)}`);
    if (softFail >= SOFT_FAIL_LIMIT) { log(`  ⚠️ 本轮连续失败 ${softFail} 次 → 放弃本轮`); break; }
  }
}

/* 同步云端 */
const sync = runStep(path.join('cloud', 'sync-cloud.mjs'), []);
if (sync.ok) log('  ✅ 同步云端');
else {
  log(`  ❌ 同步失败：${sync.err.slice(0, 160)}`);
  st.failStreak = (st.failStreak || 0) + 1;
  if (st.failStreak >= FAIL_PAUSE_AFTER) {
    st.pausedUntil = now + PAUSE_MINUTES * 60000;
    st.failStreak = 0;
    log(`🛑 连续失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停 ${PAUSE_MINUTES} 分钟`);
  }
}

st.fulls = (st.fulls || 0) + 1;
st.lastRun = new Date().toISOString();
writeState(st);
log('—— 本轮结束 ——');
