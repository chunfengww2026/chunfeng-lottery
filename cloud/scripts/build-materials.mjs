// ============================================================
//  build-materials.mjs —— 把资料导成 materials-data.js
//
//  资料存在浏览器 localStorage 里，Node 读不到。
//  所以这里从 Chromium 的 localStorage（LevelDB）里找。
//  找不到就保留已有文件 / 生成空文件。
//
//  用法：node build-materials.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'materials-data.js');

const log = (...a) => console.log(...a);

/** 从 Chromium 的 leveldb 里粗提资料（尽力而为） */
function tryReadLocalStorage() {
  const profile = path.join(ROOT, '_app-profile');
  if (!fs.existsSync(profile)) return null;

  // 找到 Local Storage/leveldb 目录
  const candidates = [
    path.join(profile, 'Default', 'Local Storage', 'leveldb'),
    path.join(profile, 'Local Storage', 'leveldb')
  ];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => /\.(log|ldb)$/.test(f));
    for (const f of files) {
      const p = path.join(dir, f);
      let buf;
      try { buf = fs.readFileSync(p); } catch (e) { continue; }

      const text = buf.toString('latin1');

      // 找 cdd.materials.v1 后面的 JSON
      const key = 'cdd.materials.v1';
      let idx = text.indexOf(key);
      while (idx >= 0) {
        const chunk = text.slice(idx + key.length, idx + key.length + 200000);
        // 从第一个 [ 开始，配对括号
        const start = chunk.indexOf('[');
        if (start >= 0) {
          let depth = 0, end = -1;
          for (let i = start; i < chunk.length; i++) {
            if (chunk[i] === '[' || chunk[i] === '{') depth++;
            else if (chunk[i] === ']' || chunk[i] === '}') {
              depth--;
              if (depth === 0) { end = i + 1; break; }
            }
          }
          if (end > 0) {
            const raw = chunk.slice(start, end);
            try {
              const arr = JSON.parse(raw);
              if (Array.isArray(arr)) return arr;
            } catch (e) { /* 继续找 */ }
          }
        }
        idx = text.indexOf(key, idx + 1);
      }
    }
  }
  return null;
}

/** 读现有的 materials-data.js */
function readExisting() {
  if (!fs.existsSync(OUT)) return null;
  try {
    const src = fs.readFileSync(OUT, 'utf8');
    const m = /const MATERIALS_DATA\s*=\s*(\{[\s\S]*\});?\s*$/.exec(src);
    if (!m) return null;
    return JSON.parse(m[1]);
  } catch (e) { return null; }
}

function main() {
  log('════════════════════════════════════════════');
  log('  春风 · 资料导出');
  log('════════════════════════════════════════════\n');

  let list = tryReadLocalStorage();
  let from = '浏览器缓存';

  if (!list) {
    const old = readExisting();
    if (old && Array.isArray(old.list)) {
      list = old.list;
      from = '已有文件';
    }
  }

  if (!list) {
    list = [];
    from = '新建（空）';
  }

  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

  const js = `/* 自动生成，请勿手动编辑 · ${stamp} */\n` +
    `const MATERIALS_DATA = ${JSON.stringify({ updated: stamp, list }, null, 1)};\n`;

  fs.writeFileSync(OUT, js, 'utf8');

  log(`  来源：${from}`);
  log(`  资料条数：${list.length}`);
  list.slice(0, 6).forEach((m) => {
    const g = (m.games && m.games.length) ? m.games.join('/') : '通用';
    log(`    [${g}] ${String(m.text || '').replace(/\s+/g, ' ').slice(0, 50)}`);
  });
  if (list.length > 6) log(`    ...另有 ${list.length - 6} 条`);

  log(`\n✅ 已写入 ${OUT}`);
  log(`   ${(Buffer.byteLength(js, 'utf8') / 1024).toFixed(1)} KB · ${stamp}`);
}

main();
