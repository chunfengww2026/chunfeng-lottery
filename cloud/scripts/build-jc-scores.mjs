/* ============================================================
   build-jc-scores.mjs —— 用 500 完场页，按【我们自己的比赛】精确回填比分
   用户 2026-10-19：「足球比赛结果实时抓取 www.500.com」
   ------------------------------------------------------------
   不做全站解析（实测会把日期/联赛当队名），改成：
     对每一条历史记录，用「主队名 … 客队名」在页面里定位，
     取两队之间出现的第一个「a - b」= 终场比分。
   产出 jc-scores.js：{ updated, count, map: { "主|客": "2:0" } }
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'jc-scores.js');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* ① 收集我们自己所有的比赛（从存档 / recommend.json） */
function collectMatches() {
  const out = [];
  const files = ['data/recommend.json', 'jc-reco-data.js', 'jc-reco-archive.js'];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    try {
      if (f.endsWith('.json')) {
        const j = JSON.parse(fs.readFileSync(f, 'utf8'));
        for (const g of (j.history || [])) for (const m of (g.matches || [])) if (m.teams) out.push(String(m.teams));
      } else {
        const src = fs.readFileSync(f, 'utf8');
        for (const m of src.matchAll(/"teams"\s*:\s*"([^"]+)"/g)) out.push(m[1]);
        for (const m of src.matchAll(/teams:\s*'([^']+)'/g)) out.push(m[1]);
      }
    } catch (e) { /* 跳过坏文件 */ }
  }
  /* 只保留 "A vs B" 形式，去重 */
  const set = new Set();
  for (const t of out) {
    const m = String(t).split(/\s+vs\s+/i);
    if (m.length === 2 && m[0].trim() && m[1].trim()) set.add(m[0].trim() + '|' + m[1].trim());
  }
  return [...set];
}

const pairs = collectMatches();
console.log(`  我们的比赛：${pairs.length} 组`);

const r = await fetch('https://live.500.com/wanchang.php', { headers: { 'User-Agent': UA, Referer: 'https://www.500.com/' } });
const buf = Buffer.from(await r.arrayBuffer());
let text = buf.toString('utf8');
if (text.indexOf('\ufffd') >= 0) { try { text = new TextDecoder('gbk').decode(buf); } catch (e) { } }
console.log(`  完场页 HTTP ${r.status} · ${Math.round(text.length / 1024)}KB`);
/* 【关键】整页先去标签变成纯文本：500 的比分数值是分开在 <span> 里的，
   带标签时 "2 - 0" 中间夹着标签，正则匹配不到，只会匹配到纯文本的半场 "0 - 0" —— 之前就是这么判错的。 */
const plain = text.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const map = {};
let hit = 0, miss = 0;
for (const p of pairs) {
  const [home, away] = p.split('|');
  let i = -1, done = false;
  while (!done && (i = plain.indexOf(home, i + 1)) >= 0) {
    const seg = plain.slice(Math.max(0, i - 300), i + 360);
    if (seg.indexOf(away) < 0) continue;
    const sc = [...seg.matchAll(/(\d)\s*-\s*(\d)/g)].map((m) => m[1] + ':' + m[2]);
    if (!sc.length) continue;
    map[home + '|' + away] = sc[0];   /* 第一个 = 终场（后面出现的 0-0 是半场） */
    hit++; done = true;
  }
  if (!done) miss++;
}

const out = { updated: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'), count: hit, map };
fs.writeFileSync(OUT, `/* jc-scores.js —— 完场比分表（build-jc-scores.mjs 生成，勿手改）
   时间：${out.updated} · 命中 ${hit} 场 / 共 ${pairs.length} 组 */
const JC_SCORES = ${JSON.stringify(out, null, 1)};
`, 'utf8');
console.log(`✅ 已写入 jc-scores.js：命中 ${hit} 场 · 未匹配 ${miss} 组`);
const roma = Object.entries(map).filter(([k]) => /罗马/.test(k));
console.log('   罗马相关：', roma.length ? roma.map(([k, v]) => k + '=' + v).join(' · ') : '(没匹配到)');
