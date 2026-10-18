/* ============================================================
   prefetch-all.mjs —— 所有抓取【事先跑完】，页面只读现成数据
   ------------------------------------------------------------
   用户 2026-10-18：「所有抓取的功能都要事先抓取」
   · 只抓数据、只写数据文件，【不】重建页面、【不】同步（同步由 sync-cloud 单独做）
   · 每一步独立超时、失败不影响后面；结果写 _prefetch.log
   · 用法：
       node prefetch-all.mjs            全量（含专家，约 10~15 分钟）
       node prefetch-all.mjs --fast     跳过专家抓取（约 3~5 分钟）
       node prefetch-all.mjs --only=build-kjh.mjs,...
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(ROOT, '_prefetch.log');
const args = process.argv.slice(2);
const fast = args.includes('--fast');
const onlyArg = args.find((a) => a.startsWith('--only='));

/* 顺序有讲究：先开奖号码/历史，再派生出价级、开机号、热力图、文章、专家、竞彩 */
const PLAN = [
  ['build-history.mjs', '开奖历史（历史页/走势/算法底座）', 300],
  ['build-prizes.mjs', '奖级奖金', 180],
  ['build-kjh.mjs', '开机号 / 选号直播', 180],
  ['build-heatmap.mjs', '热力图数据', 240],
  ['build-articles.mjs', '文章参考（彩票）', 300],
  ['build-jc-articles.mjs', '文章参考（竞彩）', 240],
  ['build-xysp.mjs', '晒票数据（主）', 300],
  ['build-xysp-tt.mjs', '晒票数据（头条）', 300],
  ['build-baidu-share.mjs', '百度票图样本', 240],
  ['build-football.mjs', '足球赛程/数据', 300],
  ['fetch-football-tickets.mjs', '竞彩实票', 240],
  ['fetch-standings.mjs', '积分榜', 180],
  ['update-football-live.mjs', '比分实时', 240],
  ['build-odds-divergence.mjs', '分歧指 / 欧赔对比', 300],
  ['fetch-bifa.mjs', '成交资金面', 240],
  ['build-jc-count.mjs', '竞彩场次统计', 180],
  ['build-sina-predict.mjs', '下一期参考（拿不到会自动跳过）', 240],
  ['build-experts.mjs', '专家号池（最慢，放最后）', 600]
];

const steps = onlyArg
  ? PLAN.filter((p) => onlyArg.slice(7).split(',').map((s) => s.trim()).includes(p[0]))
  : PLAN.filter((p) => !(fast && p[0] === 'build-experts.mjs'));

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (s) => { const line = '[' + stamp() + '] ' + s; console.log(line); try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) {} };

log('══ 预抓取开始 · ' + steps.length + ' 步（' + (fast ? 'fast' : '全量') + '）══');
const t0 = Date.now();
const results = [];
for (const [file, label, timeout] of steps) {
  if (!fs.existsSync(path.join(ROOT, file))) { log('⏭  跳过 ' + file + '（文件不存在）'); results.push([file, 'skip']); continue; }
  const s0 = Date.now();
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, file)], { cwd: ROOT, encoding: 'utf8', timeout: timeout * 1000, maxBuffer: 1 << 26 });
    const tail = out.split('\n').filter((l) => l.trim()).slice(-1)[0] || '';
    log('✅ ' + file.padEnd(30) + ((Date.now() - s0) / 1000).toFixed(0).padStart(4) + 's  ' + label + ' · ' + tail.trim().slice(0, 60));
    results.push([file, 'ok']);
  } catch (e) {
    const err = String((e && e.stderr) || (e && e.message) || '').split('\n').filter((l) => /Error|❌|失败/.test(l))[0] || '';
    log('❌ ' + file.padEnd(30) + ((Date.now() - s0) / 1000).toFixed(0).padStart(4) + 's  ' + label + ' · ' + err.trim().slice(0, 90));
    results.push([file, 'fail']);
  }
}
const ok = results.filter((r) => r[1] === 'ok').length;
const fail = results.filter((r) => r[1] === 'fail').length;
log('══ 预抓取结束：成功 ' + ok + ' · 失败 ' + fail + ' · 用时 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's ══');
if (fail) log('   失败清单：' + results.filter((r) => r[1] === 'fail').map((r) => r[0]).join(', '));
process.exit(fail ? 1 : 0);
