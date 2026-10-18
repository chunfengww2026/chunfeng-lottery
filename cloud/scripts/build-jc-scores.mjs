/* ============================================================
   build-jc-scores.mjs —— 500 完场比分（按 <tr> 行解析，用户 2026-10-19）
   ------------------------------------------------------------
   之前用「全页正则 + 邻近文字」会串到隔壁场（罗马读出 0:1 ✗）。
   现在改成：按 <tr> 切行，一行 = 一场比赛，行内取「队名 / 比分 / 队名」。
   验收标准：罗马 vs 热那亚 必须读出 2:0（半场 0:0 不算）。
   产出 jc-scores.js：{ updated, count, map: { "主队|客队": "2:0" } }
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'jc-scores.js');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* 我们的比赛（"A vs B"） */
function collectPairs() {
  const set = new Set();
  for (const f of ['data/recommend.json', 'jc-reco-data.js', 'jc-reco-archive.js']) {
    if (!fs.existsSync(f)) continue;
    try {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/["']?teams["']?\s*:\s*["']([^"']+)["']/g)) {
        const p = m[1].split(/\s+vs\s+/i);
        if (p.length === 2 && p[0].trim() && p[1].trim()) set.add(p[0].trim() + '|' + p[1].trim());
      }
    } catch (e) { }
  }
  return [...set];
}

const pairs = collectPairs();
const r = await fetch('https://live.500.com/wanchang.php', { headers: { 'User-Agent': UA, Referer: 'https://www.500.com/' } });
const buf = Buffer.from(await r.arrayBuffer());
let html = buf.toString('utf8');
if (html.indexOf('\ufffd') >= 0) { try { html = new TextDecoder('gbk').decode(buf); } catch (e) { } }
console.log(`  完场页 HTTP ${r.status} · ${Math.round(html.length / 1024)}KB · 我们的比赛 ${pairs.length} 组`);

/* 按 <tr> 切行：一行 = 一场 */
const rows = html.split(/<tr[\s>]/i).slice(1);
console.log(`  共 ${rows.length} 个 <tr> 行`);

const map = {};
let rowsWithScore = 0;
for (const tr of rows) {
  if (tr.indexOf('完') < 0 && tr.indexOf('完场') < 0) continue;   /* 只要完场的行 */
  /* 行内去标签 → 纯文本（500 的比分数值分散在 span 里，必须先去标签） */
  const txt = tr.replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!txt) continue;

  /* 比分：行内第一个「a - b」（单位数，两边 ≤ 9）。日期像 10-18 是两位数，天然排除。 */
  const sc = txt.match(/(?<!\d)(\d)\s*-\s*(\d)(?!\d)/);
  if (!sc) continue;
  rowsWithScore++;
  const final = sc[1] + ':' + sc[2];

  /* 队名：中文/字母、长度 2~12、不是纯数字、不在比分两侧的噪声里 */
  const toks = txt.split(/[\s|]+/).filter((s) => /^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·]{1,11}$/.test(s));
  /* 去掉常见噪声词 */
  const NOISE = /^(完|完场|析|亚|欧|情|红|黑|中|主|客|平|半|全场|第\d+轮|联赛)$/;
  const names = toks.filter((s) => !NOISE.test(s));
  if (names.length < 2) continue;
  /* 行内通常顺序：… 联赛 轮次 时间 完 [排名] 主队 比分 客队 [排名] …
     取「比分位置前面最后两个像队名的」和「后面第一个」 */
  const scIdx = txt.indexOf(sc[0]);
  const before = txt.slice(0, scIdx).split(/[\s|]+/).filter((s) => /^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·]{1,11}$/.test(s) && !NOISE.test(s));
  const after = txt.slice(scIdx + sc[0].length).split(/[\s|]+/).filter((s) => /^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·]{1,11}$/.test(s) && !NOISE.test(s));
  if (!before.length || !after.length) continue;
  const home = before[before.length - 1];
  const away = after[0];
  if (home === away) continue;
  map[home + '|' + away] = final;
}

/* 用我们的比赛去对（双向都试，主客顺序以 500 为准） */
const out = {};
let hit = 0;
for (const p of pairs) {
  const [a, b] = p.split('|');
  if (map[a + '|' + b]) { out[a + '|' + b] = map[a + '|' + b]; hit++; }
  else if (map[b + '|' + a]) { out[a + '|' + b] = map[b + '|' + a]; hit++; }
}

const data = { updated: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'), count: hit, map: out };
fs.writeFileSync(OUT, `/* jc-scores.js —— 500 完场比分（build-jc-scores.mjs 生成，勿手改）
   ${data.updated} · 命中 ${hit}/${pairs.length} 组 · 全站解析 ${rowsWithScore} 行有比分 */
const JC_SCORES = ${JSON.stringify(data, null, 1)};
`, 'utf8');

console.log(`  全站 ${rowsWithScore} 行有比分 · 我们的比赛命中 ${hit}/${pairs.length} 组`);
const roma = Object.entries(out).filter(([k]) => /罗马/.test(k));
console.log('  ★ 罗马相关：', roma.length ? roma.map(([k, v]) => k + ' = ' + v).join(' · ') : '(没匹配到)');
console.log('  样例：', Object.entries(out).slice(0, 6).map(([k, v]) => k + '=' + v).join(' · '));
