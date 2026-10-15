// ============================================================
//  export-only.mjs —— 只重新生成分享页，绝不改动任何号码
//
//  用途：自动更新（计划任务）在刷新数据后调用它，
//        把最新数据渲染成网页。
//
//  【重要】本脚本不摇号、不写 saved-tickets.js，
//          推荐号码保持原样。
//
//  用法：node export-only.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeCloudTickets } from './export-cloud-tickets.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log(...a);

/* 只做「生成网页」这件事，不做任何数据改动 */
const jobs = [
  ['export-static.mjs',    '彩票只读分享版'],
  ['export-football.mjs',  '足球推荐页'],
  ['export-site.mjs',      '分享包（可上传托管）']
];

log('════════════════════════════════════════════');
log('  只重新生成分享页（不改动号码）');
log('════════════════════════════════════════════');

let fail = 0;

for (const [file, label] of jobs) {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) { log(`  ⚠️ 跳过 ${label}（找不到 ${file}）`); continue; }
  try {
    const out = execFileSync(process.execPath, [fp], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000
    });
    out.split('\n')
      .filter((l) => /✅|大小|内容|比赛|中奖栏/.test(l))
      .slice(0, 5)
      .forEach((l) => log('    ' + l.trim()));
    log(`  ✅ ${label}`);
  } catch (e) {
    fail++;
    log(`  ❌ ${label} 失败：${String(e.message).slice(0, 180)}`);
  }
}

log('════════════════════════════════════════════');
log(fail ? `  完成，但有 ${fail} 项失败` : '  完成，分享页已更新（号码未改动）');
log('════════════════════════════════════════════');

/* 顺手把当前号码重新发布成 cloud/out/tickets.json：
   分享页会拉这个文件做【准实时】更新，内容必须跟 saved-tickets.js 一致。
   注意：这里只是「重发一遍现有号码」，不改任何号码。 */
const pub = writeCloudTickets({ root: ROOT });
if (pub.ok) {
  log(`  📤 已刷新 cloud/out/tickets.json（updated=${pub.updated} / publishedAt=${pub.publishedAt}）`);
} else {
  log(`  ⚠️ cloud/out/tickets.json 未刷新：${pub.reason}`);
}
