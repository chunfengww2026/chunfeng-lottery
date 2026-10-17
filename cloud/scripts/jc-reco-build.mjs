/* ============================================================
   jc-reco-build.mjs —— 建/更新【推荐串存档】jc-reco-archive.js
   ------------------------------------------------------------
   它干三件事：
     ① 取「这一期的推荐串」——和 export-football.mjs 页面显示的【同一个源头、同一条规则】：
          体彩官方在售（jc-official.js 的 inSale 名单）
          × jc-data.js 里有推荐数据的
          × 信心 ≥ 55%
          → 按比赛时间升序
        ⚠️ 源头必须一致，否则存档里的"那一串"和页面当时显示的不是同一串，
           红黑结果就没有意义（这是这个文件存在的全部意义）。
     ② 合并进存档（幂等：同一组比赛只记一次，只刷新赔率/信心）
     ③ 拿 jc-history.js（已完场累积，含终场比分）回填比分与红黑，整串判红/黑/待定
        → 丢掉窗口外（比赛时间前后 48 小时，见 jc-reco-archive.js 的 RECO_KEEP_HOURS）的批次
        → 写 jc-reco-data.js（存档）+ jc-reco-stats.json（页面每 30 秒拉的统计）

   用法：
     node jc-reco-build.mjs            # 正常跑（读 jc-data / jc-official / jc-history）
     node jc-reco-build.mjs --dry      # 只算不写，打印结果
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const R = require(path.join(ROOT, 'jc-reco-archive.js'));
/* 【统计 JSON 的写出器】单场口径（红/黑 = 场次），页面 30 秒刷新那份也用它。
   ⚠️ 以前没人调用它 → jc-reco-stats.json 一直不存在，而 cloud-build.mjs 的
      RECO_FILES 里一直等着拷这个文件（清单里有、盘上没有）。
   ⚠️ 容错：云端同步清单目前不含 jc-reco-stats.mjs（本机才有）——
      缺了它不能让整个存档构建失败，所以这里 catch 掉，只是本次不写统计 JSON。 */
let writeStatsFile = null;
try {
  ({ writeStatsFile } = await import('./jc-reco-stats.mjs'));
} catch (e) {
  writeStatsFile = null;
}

const OUT = path.join(ROOT, 'jc-reco-data.js');
const DRY = process.argv.includes('--dry');
const REC_MIN = 58;                     /* 用户 2026-10-17：「推荐串战绩只算信心 ≥58% 的场次，低于 58% 的不算」*/

const log = (...a) => console.log(...a);

/* ---------- 读数据文件（和项目其它脚本同一套 vm 读法） ---------- */
function loadVar(file, varName) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return null;
  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + `\nglobalThis.__X = ${varName};`, c);
    return c.__X;
  } catch (e) {
    log(`  ⚠️ ${file} 解析失败：${e.message}`);
    return null;
  }
}

const dayOf = (s) => String(s || '').slice(0, 10).replace(/\//g, '-');

/* ============================================================
   ① 这一期的推荐串（源头与规则和页面完全一致）
   ============================================================ */
function currentRows(jc, official) {
  const games = (jc && Array.isArray(jc.games)) ? jc.games : [];
  const inSale = (official && Array.isArray(official.list)) ? official.list : null;

  /* 编号@日期 → 这场在 jc-data 里的推荐数据（和 export-football 的 REC_BY_KEY 同构） */
  const byKey = new Map();
  games.forEach((g) => {
    if (!g || !g.code || !g.reco || g.reco.confidence == null) return;
    const eu = g.odds && g.odds.europe && (g.odds.europe.live || g.odds.europe.open);
    const pick = g.reco.pick;
    byKey.set(`${g.code}@${dayOf(g.time)}`, {
      code: g.code,
      league: g.league || '',
      time: g.time || '',
      home: (g.home && g.home.name) || '',
      away: (g.away && g.away.name) || '',
      pick: pick || '',
      label: g.reco.label || { home: '主胜', draw: '平局', away: '客胜' }[pick] || '',
      odds: (eu && pick && eu[pick] != null) ? eu[pick] : null,
      conf: g.reco.confidence
    });
  });

  /* 在售名单：优先用体彩官方在售（和页面一样）；没有就退回 jc-data 全部 */
  let pool;
  if (inSale && inSale.length) {
    pool = inSale.map((r) => byKey.get(`${r.code}@${dayOf(r.time)}`)).filter(Boolean);
  } else {
    pool = Array.from(byKey.values());
  }

  return pool
    .filter((r) => r.conf >= REC_MIN)
    .sort((a, b) => {
      const ta = Date.parse(String(a.time || '').replace(/-/g, '/')) || 0;
      const tb = Date.parse(String(b.time || '').replace(/-/g, '/')) || 0;
      return (ta - tb) || (b.conf - a.conf);
    });
}

/* ============================================================
   主流程
   ============================================================ */
const jc = loadVar('jc-data.js', 'JC_DATA');
const official = loadVar('jc-official.js', 'JC_OFFICIAL');
const hist = loadVar('jc-history.js', 'JC_HISTORY');
const oldArch = loadVar('jc-reco-data.js', 'JC_RECO_DATA');

if (!jc) { log('❌ 读不到 jc-data.js，中止（不生成空存档）'); process.exit(1); }

const now = new Date();
const rows = currentRows(jc, official);
const settled = (hist && Array.isArray(hist.list)) ? hist.list : [];

log('══════════════════════════════════════════');
log('  推荐串存档 · 构建');
log('══════════════════════════════════════════');
log(`  北京时间现在：${R.bjStamp(now)}`);
log(`  数据：jc-data ${(jc.games || []).length} 场 · 官方在售 ${official && official.inSale != null ? official.inSale : '?'} 场` +
    ` · 已完场累积 ${settled.length} 场`);
log(`  本期推荐串（在售 × 信心 ≥${REC_MIN}%）：${rows.length} 场`);
rows.forEach((r) => log(`     ${r.code}  ${r.time}  ${r.home} vs ${r.away}  ${r.label}  ${r.conf}%  @${r.odds == null ? '—' : r.odds}`));

/* ② 合并 */
const snap = R.buildSnapshot(rows, { now, min: REC_MIN });
const merged = R.mergeArchive(oldArch || R.emptyArchive(), snap, { now });
log(`\n  合并：${merged.added ? '新增 1 批' : (merged.reason || '未新增')}` +
    (merged.updated ? ` · 刷新 ${merged.updated} 场` : ''));

/* ③ 回填 + 窗口 */
const enriched = R.enrichArchive(merged.archive, settled, { now });
log(`  回填：补上 ${enriched.filled} 场的终场比分 · 丢掉窗口外 ${enriched.dropped} 批`);
log(`  窗口：开赛时间前后 ${R.RECO_KEEP_HOURS} 小时内`);

const sum = R.summarize(enriched.archive);
log(`\n  汇总：共 ${sum.batches} 批 / ${sum.rows} 场`);
log(`        红 ${sum.red} · 黑 ${sum.black} · 待定 ${sum.pending}` +
    ` · 命中率 ${sum.rate == null ? '—（还没出结果）' : sum.rate + '%'}`);
enriched.archive.batches.forEach((b) => {
  log(`        [${b.verdict || '待定'}] ${b.at} · ${b.rows.length} 场 ` +
      `(${b.rows.filter((r) => r.hit === true).length} 中 / ${b.rows.filter((r) => r.hit === false).length} 负` +
      `${b.pending ? ' / ' + b.pending + ' 未打完' : ''})`);
});

if (DRY) {
  log('\n  （--dry：不写文件）');
} else {
  fs.writeFileSync(OUT, R.renderDataJs(enriched.archive, R.bjStamp(now)), 'utf8');
  log(`\n  ✅ 已写入 ${path.basename(OUT)}（${(fs.statSync(OUT).size / 1024).toFixed(1)} KB）`);
  /* ④ 顺手更新【统计 JSON】jc-reco-stats.json（单场口径）
     —— 页面靠 jc-reco-view.js 刷新，但 cloud-build 的 RECO_FILES 里也列了这个 JSON，
        必须真的存在，否则云端那一步一直在警告"文件缺失"。 */
  try {
    if (!writeStatsFile) throw new Error('本机缺少 jc-reco-stats.mjs（云端同步清单里也没有它）');
    const st = writeStatsFile({ archive: enriched.archive, now });
    log(st.ok
      ? `  ✅ 已更新 jc-reco-stats.json（单场口径 · 红 ${st.stats.red} 黑 ${st.stats.black}` +
        ` · 命中率 ${st.stats.rate == null ? '—' : st.stats.rate + '%'}）`
      : `  ⚠️ jc-reco-stats.json 未更新（${st.skipped ? '读不到存档' : '未知原因'}）`);
  } catch (e) {
    log(`  ⚠️ jc-reco-stats.json 更新失败：${e.message}`);
  }
}
