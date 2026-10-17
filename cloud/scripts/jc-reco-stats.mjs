/* ============================================================
   jc-reco-stats.mjs —— 生成【推荐串战绩 JSON】jc-reco-stats.json
   ------------------------------------------------------------
   用户要的页面形态（竞彩页顶部「推荐串」那条）：
       推荐串  红 N  黑 M  命中率 X%  （推荐串比对最终比分 · 前后 24 小时 · 还有 K 组没打完）

   为什么要有这个文件（而不是让页面自己去算）：
     网站是【静态托管】（GitHub Pages），没有后端、也不许用 localStorage。
     页面只能 fetch 一个已经生成好的小 JSON。所以：
       ① 构建时（本机 / 云端）由本文件算好 → 写 jc-reco-stats.json
       ② 页面 fetch('jc-reco-stats.json?t=' + Date.now()) 每 30 秒一次
          → 拉到就更新那四个数字；拉不到就保留上一次（只在内存里）

   【口径 · 按单场判定】（用户 2026-10-17 明确要求）
     · red   = 【已完场】且推荐选项命中过的场次数
     · black = 【已完场】且没中的场次数
     · rate  = red / (red + black)；一场都没结算 → "—"（字符串，绝不用 0 冒充"算过了"）
     · unfinished = 还没打完的【组数】（一批推荐里只要还有一场没结算就算一组）
                   页面备注就写「还有 K 组没打完」/ K=0 时写「实时更新」
     ⚠️ 红/黑【不是按整串】判（不是"全中才算红"）。整串口径仍然保留在
        jc-reco-archive.js 的 summarize() 里，给「往期详情」用。

   【数据来源】jc-reco-data.js（推荐串存档，jc-reco-build.mjs 的产物）。
     本文件【只读】它，不写它 —— 代码和数据必须分家（踩过坑，见 jc-reco-archive.js 头部）。

   用法：
     node jc-reco-stats.mjs            # 读 jc-reco-data.js → 写 jc-reco-stats.json
     node jc-reco-stats.mjs --dry      # 只打印，不写文件
   也可以被 import（jc-reco-build.mjs / export-football.mjs 都走这条路，
   保证「页面上的数字」和「JSON 里的数字」永远是同一次计算出来的）。
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** 数据目录：默认 = 脚本所在目录；DSH_JC_ROOT 可指到夹具目录（自测用，不碰真数据） */
export function dataRoot() {
  return process.env.DSH_JC_ROOT ? path.resolve(process.env.DSH_JC_ROOT) : SCRIPT_DIR;
}

let _kernel = null;
/** 计算内核 jc-reco-archive.js（纯函数，Node 侧 require / 浏览器侧 vm，双模式） */
export function kernel() {
  if (_kernel) return _kernel;
  const p = path.join(SCRIPT_DIR, 'jc-reco-archive.js');
  if (!fs.existsSync(p)) throw new Error('缺少计算内核 jc-reco-archive.js');
  _kernel = require(p);
  return _kernel;
}

/** 读一个「const XXX = {...};」形式的数据文件（和项目其它脚本同一套 vm 读法） */
export function loadVar(file, varName, root) {
  const p = path.join(root || dataRoot(), file);
  if (!fs.existsSync(p)) return null;
  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + `\nglobalThis.__X = ${varName};`, c);
    return c.__X;
  } catch (e) {
    return null;
  }
}

/**
 * 算出一份统计（纯函数，不碰磁盘）
 * @param {object} archive 存档对象 { updated, batches:[{rows:[{hit,time,...}]}] }
 * @returns {object} matchStats 的结果 + 已经渲染好的 JSON 文本
 */
export function statsFromArchive(archive, now) {
  const R = kernel();
  const arch = (archive && Array.isArray(archive.batches)) ? archive : R.emptyArchive();
  /* 用户 2026-10-17：「推荐串战绩指信心 ≥58% 的场次，低于 58% 的不算」→ 统计时带上门槛 */
  const st = R.matchStats(arch, { min: 58 });
  const updated = R.bjStamp(now);
  return { stats: st, json: R.renderStatsJson(st, updated), updated };
}

/** 从存档文件 jc-reco-data.js 读出来再算 */
export function statsFromFile(root) {
  const arch = loadVar('jc-reco-data.js', 'JC_RECO_DATA', root);
  return statsFromArchive(arch);
}

/**
 * 写 jc-reco-stats.json
 * @param {{root?:string, archive?:object, dry?:boolean}} opt
 *   archive 给了就直接用（jc-reco-build.mjs 传它刚算好的那份，避免二次读盘）
 * @returns {{ok:boolean, out:string, json:string, stats:object, skipped?:boolean}}
 */
export function writeStatsFile(opt) {
  const o = opt || {};
  const root = o.root || dataRoot();
  const out = path.join(root, 'jc-reco-stats.json');
  let res;
  if (o.archive) {
    res = statsFromArchive(o.archive, o.now);
  } else {
    const arch = loadVar('jc-reco-data.js', 'JC_RECO_DATA', root);
    if (!arch) {
      /* ⚠️ 读不到存档 ≠ 没有结果。这时候【不写文件】，保留上一次那份，
         绝不出一个 red:0 / black:0 的假报告（用户明令「别编数据」）。 */
      return { ok: false, out, json: '', stats: null, skipped: true };
    }
    res = statsFromArchive(arch, o.now);
  }
  if (!o.dry) fs.writeFileSync(out, res.json, 'utf8');
  return { ok: true, out, json: res.json, stats: res.stats, updated: res.updated };
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const DRY = process.argv.includes('--dry');
  const log = (...a) => console.log(...a);
  const root = dataRoot();

  log('══════════════════════════════════════════');
  log('  推荐串战绩 · 生成 jc-reco-stats.json');
  log('══════════════════════════════════════════');

  const r = writeStatsFile({ root, dry: DRY });
  if (!r.ok) {
    log('  ⚠️ 读不到 jc-reco-data.js（存档还没生成）→ 本次不写 jc-reco-stats.json');
    log('     页面会继续显示上一次那份，不会变成「红 0 / 黑 0」的假数据。');
    process.exit(0);
  }
  const s = r.stats;
  log(`  数据源：jc-reco-data.js（${s.batches} 批 / ${s.rows} 场）`);
  log(`  按单场判定：红 ${s.red} · 黑 ${s.black} · 命中率 ` +
    (s.rate == null ? '—（还没出结果）' : s.rate + '%'));
  log(`  没打完：${s.unfinished} 组 / ${s.pendingMatches} 场` +
    `（页面备注写「还有 ${s.unfinished} 组没打完」）`);
  log(DRY ? '  （--dry：不写文件）' : `  ✅ 已写入 ${r.out}`);
  log(r.json);
}
