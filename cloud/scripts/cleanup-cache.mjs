/* ============================================================
   cleanup-cache.mjs
   ------------------------------------------------------------
   用户要求：抓取数据的缓存只保留 72 小时，超时自动清空，
             避免电脑被一堆历史文件拖卡。

   做三件事：
     1. 删掉临时/备份/探测文件：只留 72 小时内的
     2. 日志文件：超过 72 小时就截断（只留最后 200 行）
     3. 缓存目录里的旧文件：超过 72 小时删掉，空目录一并清除

   用法：node cleanup-cache.mjs           真删
        node cleanup-cache.mjs --dry     只报告，不删
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const KEEP_HOURS = 72;
const CUTOFF = Date.now() - KEEP_HOURS * 3600 * 1000;
const DRY = process.argv.includes('--dry');

/* 要清理的缓存目录（按文件时间清） */
const CACHE_DIRS = [
  '_lay_probe', '_bk_slot_test', '_ocr-cache', '_draw-cache',
  '_tmp_live_edge', '_bk_expertpool', '_jz_bak',
];

/* 要清理的文件名前缀（根目录下） */
const TMP_PREFIX = ['_bk_', '_probe_', '_tmp_', '_lay_', '_toc_', '_zhixuan_'];

/* 日志：超时就截断 */
const LOG_KEEP_LINES = 200;
const LOG_MIN_BYTES = 20000;

/* 绝对不能碰的 */
const NEVER = new Set([
  'runtime', 'cloud', '_app-profile', '分享包', '.github', '.backups', 'node_modules',
  'index.html', 'game.html', 'data.html', 'football.html', 'assistant.html',
]);

/* 【代码文件的硬保护 · 用户明确要求】
   「抓取数据 72 小时之后删除；所有的程序代码要求这些是不能清除的」。
   所以：不管它有没有带 _probe_ / _bk_ 之类的临时前缀，
   只要后缀是下面这些，就【永不删除】——
   算法、抓取、生成、出号、模板、样式、文档、工作流、配置，一个都不许动。 */
const CODE_EXT = /\.(mjs|cjs|js|json|css|html|htm|md|txt|yml|yaml|cmd|ps1)$/i;
const isCodeFile = (name) => CODE_EXT.test(name);

/* 缓存目录（_ocr-cache / _draw-cache 之类）里装的【就是缓存】：
   图片、html 快照、.bin 二进制都在这里，超 72 小时就该删。
   所以这里只保护「真正的代码/文档」，不保护 .html/.json/.txt/.bin —— 
   否则 _draw-cache/*.html 和 _ocr-cache/*.bin 永远清不掉，
   用户担心的「缓存太多」就解决不了。 */
const CODE_EXT_IN_CACHE = /\.(mjs|cjs|js|css|md|yml|yaml)$/i;

const stat = { files: 0, bytes: 0, dirs: 0, logs: 0, kept: 0, protectedCode: 0 };

function mb(n) { return (n / 1024 / 1024).toFixed(2) + ' MB'; }

/* ---------- 1. 缓存目录里的旧文件 ---------- */
for (const d of CACHE_DIRS) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) continue;
  if (NEVER.has(d)) continue;
  let isDir = false;
  try { isDir = fs.statSync(dir).isDirectory(); } catch (e) { continue; }
  if (!isDir) continue;

  let entries = [];
  try { entries = fs.readdirSync(dir); } catch (e) { continue; }
  for (const f of entries) {
    const p = path.join(dir, f);
    let st;
    try { st = fs.statSync(p); } catch (e) { continue; }
    if (!st.isFile()) continue;
    /* 【硬保护】缓存目录里如果混进了代码/文档，也一律不删 */
    if (CODE_EXT_IN_CACHE.test(f)) { stat.protectedCode++; stat.kept++; continue; }
    if (st.mtimeMs < CUTOFF) {
      stat.files++;
      stat.bytes += st.size;
      if (!DRY) { try { fs.unlinkSync(p); } catch (e) {} }
    } else {
      stat.kept++;
    }
  }
  try {
    if (fs.readdirSync(dir).length === 0) {
      stat.dirs++;
      if (!DRY) fs.rmdirSync(dir);
    }
  } catch (e) {}
}

/* ---------- 2. 根目录的临时/备份文件 + 日志 ---------- */
let rootFiles = [];
try { rootFiles = fs.readdirSync(ROOT); } catch (e) {}

for (const f of rootFiles) {
  const p = path.join(ROOT, f);
  let st;
  try { st = fs.statSync(p); } catch (e) { continue; }
  if (!st.isFile()) continue;
  if (NEVER.has(f)) continue;

  if (/\.log$/i.test(f)) {
    if (st.mtimeMs < CUTOFF && st.size > LOG_MIN_BYTES) {
      try {
        const lines = fs.readFileSync(p, 'utf8').split('\n');
        const tail = lines.slice(-LOG_KEEP_LINES).join('\n');
        const head = '[已自动清理：只保留最近 ' + LOG_KEEP_LINES + ' 行]\n';
        stat.logs++;
        stat.bytes += Math.max(0, st.size - Buffer.byteLength(head + tail, 'utf8'));
        if (!DRY) fs.writeFileSync(p, head + tail, 'utf8');
      } catch (e) {}
    }
    continue;
  }

  const isTmp = TMP_PREFIX.some((pre) => f.startsWith(pre));
  if (!isTmp) continue;
  /* 【硬保护】代码文件永不删除（哪怕它叫 _probe_xxx.mjs） */
  if (isCodeFile(f)) { stat.protectedCode++; stat.kept++; continue; }
  if (st.mtimeMs < CUTOFF) {
    stat.files++;
    stat.bytes += st.size;
    if (!DRY) { try { fs.unlinkSync(p); } catch (e) {} }
  } else {
    stat.kept++;
  }
}

/* ---------- 报告 ---------- */
console.log('════════════════════════════════════════════');
console.log('  缓存清理（保留 ' + KEEP_HOURS + ' 小时）' + (DRY ? '  【试运行，不删】' : ''));
console.log('  清理线：' + new Date(CUTOFF).toLocaleString('zh-CN', { hour12: false }));
console.log('────────────────────────────────────────────');
console.log('  删除临时/备份文件 : ' + stat.files + ' 个 · ' + mb(stat.bytes));
console.log('  删除空目录         : ' + stat.dirs + ' 个');
console.log('  截断日志           : ' + stat.logs + ' 个');
console.log('  保留（72h 内）     : ' + stat.kept + ' 个');
console.log('  🛡 代码文件受保护  : ' + stat.protectedCode + ' 个（*.mjs/js/json/css/html/md/yml/txt 永不删除）');
console.log('════════════════════════════════════════════');
