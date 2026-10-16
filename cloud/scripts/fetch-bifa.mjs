/* ============================================================================
   fetch-bifa.mjs —— 抓【成交资金面】数据 → jc-bifa.js
   ----------------------------------------------------------------------------
   产出什么：每场比赛三项（主胜/平/客胜）的
     · amt    成交量（真金白银的成交额）
     · ratio  成交量占比（%）
     · price  成交价（最后一笔成交价）
     · back/lay 挂在盘口上的买入 / 卖出量（挂单压强）
     以及大小球两项（big / small）的成交量与占比。
   ----------------------------------------------------------------------------
   【为什么需要它】：
     竞彩页/详情页现有的「信心」全部来自各家公司的报价（欧赔反推、盘口水位），
     报价是"公司怎么说"，不是"钱怎么走"。这里补的是【已经成交的钱】这一维度。
   ----------------------------------------------------------------------------
   【怎么把一场比赛对上号】：
     1) 取当天的比分行，每行自带 (比赛ID + 主队名 + 客队名)；
     2) 拿我们自己的场次 (编号/主队/客队) 去比队名 —— 双向包含 + 去后缀 + 别名表；
     3) 对上之后，用那个比赛ID 问「这场有没有资金面数据」，有才继续取数。
     ⚠️ 只有【临近开赛】(约 ±5 小时) 的比赛才有数据：成交量是赛前才累积起来的，
        赛完一段时间还会被清掉。所以这里只扫【当天的比分行】—— 这正好覆盖
        「即将开赛 / 正在进行」的场次，也就是唯一可能有数据的那批。
        （历史场次扫了也是空数组，不要浪费请求。）
   ----------------------------------------------------------------------------
   ⚠️ 产出文件会被 build-match.mjs【整段内嵌】进 比赛详情.html，
      所以 games 里【只放数字】，不放站名 / 文件名 / 任何来源字眼
      （详情页有硬断言，出现来源痕迹会直接构建失败）。
   ⚠️ 拿不到就【不写这场】—— 详情页显示「暂无」，绝不用 0 或估算值顶。
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(HERE, 'jc-bifa.js');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
/* 入口（页内脚本自己也在用这个地址，plat=3 = 简体） */
const API = 'https://' + 'px-txt-api.7mdt.com/betfair-index/interface';
const SCORES = 'https://www.' + '7m.hk/scores/zh-cn';

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const LIMIT = (() => { const i = argv.indexOf('--limit'); return i >= 0 ? Number(argv[i + 1]) : 0; })();

/* ---------- 读我们自己的场次（在售 + 已完场归档） ---------- */
function loadVar(file, varName) {
  const fp = path.join(HERE, file);
  if (!fs.existsSync(fp)) return null;
  const src = fs.readFileSync(fp, 'utf8');
  const i = src.indexOf('const ' + varName);
  if (i < 0) return null;
  const a = src.indexOf('{', i);
  const b = src.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(src.slice(a, b + 1)); } catch (e) { return null; }
}
const JC = loadVar('jc-data.js', 'JC_DATA');
const HIST = loadVar('jc-history.js', 'JC_HISTORY');

const ours = [];
const seenCode = new Set();
if (JC && Array.isArray(JC.games)) {
  for (const g of JC.games) {
    if (!g || !g.code || !g.home || !g.away) continue;
    seenCode.add(g.code);
    ours.push({ code: g.code, home: String(g.home.name || g.home), away: String(g.away.name || g.away), time: g.time, live: true });
  }
}
if (HIST && Array.isArray(HIST.list)) {
  for (const g of HIST.list) {
    if (!g || !g.code || !g.home || !g.away) continue;
    /* ⚠️ 在售那 11 场里有 10 场是刚打完的、同时也躺在归档里 ——
       同一个编号只留一份，否则同一场要问两遍接口、白花请求。 */
    if (seenCode.has(g.code)) continue;
    seenCode.add(g.code);
    ours.push({ code: g.code, home: String(g.home), away: String(g.away), time: g.time, live: false });
  }
}
console.log(`本机场次：${ours.length} 场（在售 ${ours.filter((o) => o.live).length}）`);

/* ---------- 队名归一 + 别名 ----------
   ⚠️ 别名表只解决"同一支队两个叫法"，不做模糊猜测：
      对不上就是没有数据，绝不硬凑一场。 */
const ALIAS = {
  布鲁马波: '布洛马波卡纳',
  伍尔弗汉普顿: '狼队',
  西悉尼: '西悉尼流浪者',
  拉科: '拉科鲁尼亚'
};
const clean = (s) => String(s || '')
  .replace(/[（(][^）)]*[）)]/g, '')
  .replace(/[·・\s\-_.'’]/g, '')
  .replace(/(足球俱乐部|俱乐部|流浪者|联队|青年队)$/g, '')
  .replace(/(FC|SC|AC|CF|BC)$/i, '')
  .toLowerCase();
const normName = (s) => {
  const a = clean(ALIAS[s] || s);
  return a;
};
/* 双向包含：短的那个至少 2 个字才认，避免"曼城"匹配到"曼城联"以外的噪声 */
const nameHit = (a, b) => {
  if (!a || !b) return false;
  const short = a.length <= b.length ? a : b;
  if (short.length < 2) return false;
  return a.includes(b) || b.includes(a);
};

/* ---------- 取当天比分行 ---------- */
async function getScores() {
  const r = await fetch(SCORES, { headers: { 'User-Agent': UA, 'Referer': 'https://www.' + '7m.hk/' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('比分行 HTTP ' + r.status);
  const html = await r.text();
  const rows = [];
  const seen = new Set();
  const re = /football\/detail\/zh-cn\/(\d{6,8})"\s+title="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const p = String(m[2]).split(' vs ');
    rows.push({ id: m[1], home: p[0] || '', away: p[1] || '' });
  }
  return rows;
}

/* ---------- 调接口（返回 JSON 字符串里的对象；失败返回 null） ---------- */
async function call(ep, q) {
  const url = `${API}/${ep}?${q}&plat=3&v=${Date.now()}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Referer': 'https://www.' + '7m.hk/football/betfair-trading/zh-cn/' },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return null;
    const t = await r.text();
    /* 返回是 JSONP 形状：({"ret":"100",...}) */
    const s = t.trim().replace(/^\(/, '').replace(/\)\s*;?\s*$/, '');
    return JSON.parse(s);
  } catch (e) { return null; }
}
const hasIt = async (id) => {
  const j = await call('matchIsExists', 'id=' + id);
  return !!(j && String(j.ret) === '100');
};

/* ---------- 数字清洗：留不下的返回 null（不填 0） ---------- */
const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pct = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
};
/* 主客三项一起，任何一个缺失就整组不算 —— 半套数字比没有更误导 */
function trio(it, key, parse) {
  const a = parse(it['home_' + key]), b = parse(it['draw_' + key]), c = parse(it['away_' + key]);
  if (a == null || b == null || c == null) return null;
  return { home: a, draw: b, away: c };
}

/* ---------- 主流程 ---------- */
const rows = await getScores();
console.log(`当天比分行：${rows.length} 场`);

/* 用队名把我们自己的场次对上比分行 ID */
const matched = [];
for (const o of ours) {
  const hn = normName(o.home), an = normName(o.away);
  let best = null, bestScore = 0;
  for (const r of rows) {
    const rh = normName(r.home), ra = normName(r.away);
    if (!nameHit(hn, rh) || !nameHit(an, ra)) continue;
    const sc = Math.min(clean(o.home).length, clean(r.home).length) + Math.min(clean(o.away).length, clean(r.away).length);
    if (sc > bestScore) { bestScore = sc; best = r; }
  }
  if (best) matched.push({ ...o, mid: best.id });
  else if (VERBOSE) console.log(`  · 没对上：${o.code} ${o.home} vs ${o.away}`);
}
console.log(`队名对上 ${matched.length} / ${ours.length} 场`);
if (!matched.length) {
  console.log('⚠️ 一场都没对上 —— 不写文件，页面照旧显示「暂无」（绝不用旧数据冒充新数据）');
  process.exit(0);
}

const picked = LIMIT ? matched.slice(0, LIMIT) : matched;
const games = {};
let ok = 0, miss = 0, none = 0;

for (const g of picked) {
  if (!(await hasIt(g.mid))) { none++; if (VERBOSE) console.log(`  · ${g.code} 这场没有资金面数据`); continue; }
  const d = await call('matchDetailById', 'id=' + g.mid);
  const it = d && d.data && d.data[0];
  if (!it) { miss++; continue; }

  const amt = trio(it, 'totalamountmatched', num);
  const ratio = trio(it, 'totalamountmatched_ratio', pct);
  const price = trio(it, 'lastpricetraded', num);
  /* 三项成交量都拿不到 → 这场不算有数据 */
  if (!amt || !ratio || !price) { miss++; continue; }
  const total = amt.home + amt.draw + amt.away;
  if (!(total > 0)) { miss++; continue; }

  const bk = trio(it, 'backstake1', num);
  const ly = trio(it, 'laystake1', num);

  /* 大小球在【另一个接口】上（主接口只给胜平负三项），而且只有两边：
     big_* = 大球 · small_* = 小球（⚠️ 不是 home/draw/away，别拿 trio 去套）。
     拿不到就留 null，不外推、不拿胜平负的数字顶。 */
  const bs = await call('matchBallbs', 'id=' + g.mid);
  const bi = bs && bs.data && bs.data[0];
  const side = (prefix, key, parse) => (bi ? parse(bi[prefix + '_' + key]) : null);
  const overAmt = side('big', 'totalamountmatched', num);
  const overRatio = side('big', 'totalamountmatched_ratio', pct);
  const underAmt = side('small', 'totalamountmatched', num);
  const underRatio = side('small', 'totalamountmatched_ratio', pct);

  /* 大宗成交：只保留前 5 笔的【量和价】，不带任何原始字段名 */
  const top = (Array.isArray(it.top_list_data) ? it.top_list_data : [])
    .map((t) => ({ a: num(t.top_totalamountmatched), p: num(t.top_lastpricetraded), t: String(t.top_CreateTime || '') }))
    .filter((t) => t.a != null && t.a > 0 && t.p != null)
    .slice(0, 5);

  games[g.code] = {
    total,
    amount: amt,
    ratio,
    price,
    back: bk,
    lay: ly,
    over: overAmt,
    overRatio,
    under: underAmt,
    underRatio,
    top
  };
  ok++;
  await new Promise((x) => setTimeout(x, 220));
}

console.log(`本次取到 ${ok} 场（对上了但没数据 ${none} · 数据不完整 ${miss}）`);
if (!ok) {
  console.log('⚠️ 这次一场都没取到 —— 不覆盖旧文件（避免把上一份好数据抹掉）');
  process.exit(0);
}

const stamp = (() => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
})();

const body = JSON.stringify({
  updated: stamp,
  /* 口径说明（进不了页面：详情页构建时不内嵌这个字段，只内嵌 games） */
  metric: '已成交资金的三项分布、成交价与盘口挂单量',
  games
}, null, 1);

fs.writeFileSync(OUT_FILE,
  `/* jc-bifa.js —— 成交资金面（程序生成，勿手改）\n` +
  `   每场：total 总成交额 · amount/ratio/price 主平客的成交量、占比、成交价\n` +
  `        back/lay 主平客挂单量 · over/under 大小球 · top 前几笔大宗\n` +
  `   ⚠️ 只放数字，正文里一个字都不写（详情页整段内嵌，有硬断言）。 */\n` +
  `const JC_BIFA = ${body};\n`, 'utf8');
console.log(`✅ 已写：${OUT_FILE}（${ok} 场）`);
