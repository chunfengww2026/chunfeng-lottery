/* ============================================================
   fetch-standings.mjs —— 【联赛积分榜】数据（jc-standings.js）
   ------------------------------------------------------------
   【为什么要这份文件】
     比赛详情页的「综合模型」那一档要算埃罗概率，埃罗要的是【联赛积分差】。
     此前只有 jc-data.js 里每场的 [名次]，名次差 × 2 折算成"积分差"——那是代理，
     不是真积分。这份文件把每个联赛的【真实积分榜】抓下来（名次 + 胜平负 +
     进球/失球 + 积分），详情页就能直接用【真实积分差】算埃罗。

   【为什么不用队名匹配】
     队名两边的写法不一样（一侧「曼城」，积分榜「曼彻斯特城」）——
     靠字面相似度去猜队名，猜错一次就是一场比赛的埃罗全错。
     所以主键用【名次】：详情的比赛卡片本来就有 [名次]（在售场次每场都有），
     积分榜第一列就是名次 → 名次 → 积分，一一对应，零猜测。
     队名只在"同一联赛、同一名次"能对上时作二次校验；对不上就按名次取，
     并在数据里如实标 matched:'rank'（详情页据此说明"按名次对齐"）。

   【抓法（本机与云端都实测过）】
     ① 联赛首页   /zuqiu-<联赛id>/            → 里面带一个 /zuqiu-<id>/jifen-<阶段id>/ 链接
     ② 积分榜页   .../jifen-<阶段id>/         → tbody#hot_score_tbody 里就是整张积分榜
     两个页面都是 GB2312，解码用 gbk（Node 自带 full-icu，TextDecoder('gbk') 可用）。
     ⚠️ 联赛 id 就是 jc-data.js 里每场的 sid（实测 14 个联赛全部对得上）。

   【输出】jc-standings.js（页面构建时由 build-match.mjs 用 loadVar 读）
     { updated, note, leagues: { "<联赛id>": { name, season, stage, teams: [[名次,积分,场次,胜,平,负,进球,失球,队名], ...] } } }
     ⚠️ teams 用【短数组】而不是对象：15 个联赛 × 20 队，写成对象要 3 倍体积。
     列顺序固定：0 名次 · 1 积分 · 2 场次 · 3 胜 · 4 平 · 5 负 · 6 进球 · 7 失球 · 8 队名
     （队名只用于"同一联赛里按名次取不到"时作二次校验，页面不显示）
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(HERE, 'jc-standings.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BASE = 'https://liansai.500.com';

/* 五大联赛 + 常出现在竞彩里的联赛。表里没有的联赛（小联赛 / 杯赛）
   抓不到积分榜就算了 —— 页面那一场退回"名次折算"，如实标出来。 */
const FIXED = [
  ['19906', '英超'], ['19947', '西甲'], ['19826', '意甲'], ['19951', '德甲'],
  ['19835', '法甲'], ['19895', '日职'], ['19554', 'K1联赛'], ['19603', '中超'],
  ['20046', '澳超'], ['19935', '英冠'], ['19878', '荷甲'], ['19471', '美职联'],
  ['19507', '挪超'], ['19506', '芬超']
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, tries = 3) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Referer': BASE + '/'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(25000)
      });
      const buf = Buffer.from(await res.arrayBuffer());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let txt = '';
      try { txt = new TextDecoder('gbk').decode(buf); } catch (e) { txt = buf.toString('utf8'); }
      return txt;
    } catch (e) {
      last = e;
      await sleep(600 * (i + 1));
    }
  }
  throw last || new Error('抓取失败');
}

const stripTags = (s) => String(s)
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* ① 联赛首页 → 积分榜链接（形如 /zuqiu-19906/jifen-27953/）+ 赛季名 */
function findStage(html) {
  const m = /\/zuqiu-\d+\/jifen-(\d+)\//.exec(html);
  const season = (/(\d{4}\/\d{4})赛季/.exec(html) || [])[1] || '';
  return { stage: m ? m[1] : null, season };
}

/* ② 积分榜页 → [[名次,积分,场次,胜,平,负,进球,失球], ...]
   表格是 <tbody id="hot_score_tbody">，一行一队：
     td[1]=名次 td[2]=球队 td[3]=赛 td[4]=胜 td[5]=平 td[6]=负
     td[7]=进球 td[8]=失球 td[9]=净胜 td[10..14]=均得/均失/胜率/平率/负率 td[15]=积分 */
function parseStandings(html) {
  const i = html.indexOf('hot_score_tbody');
  if (i < 0) return null;
  const end = html.indexOf('</tbody>', i);
  const seg = end > i ? html.slice(i, end) : html.slice(i);
  const rows = seg.match(/<tr[\s\S]*?<\/tr>/g) || [];
  const out = [];
  rows.forEach((tr) => {
    const td = (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map(stripTags);
    if (td.length < 16) return;
    const rank = +td[1], pts = +td[15], p = +td[3];
    if (!Number.isFinite(rank) || rank <= 0) return;
    if (!Number.isFinite(pts) || pts < 0) return;
    if (!Number.isFinite(p) || p < 0) return;
    const g = (k) => { const v = +td[k]; return Number.isFinite(v) ? v : 0; };
    /* 队名只作二次校验（同一联赛里按名次取不到时才用），页面不显示 */
    out.push([rank, pts, p, g(4), g(5), g(6), g(7), g(8), String(td[2] || '').slice(0, 20)]);
  });
  /* 名次必须连续从 1 开始 —— 缺行说明表格结构变了，宁可不存这一档 */
  for (let k = 0; k < out.length; k++) if (out[k][0] !== k + 1) return null;
  return out.length >= 6 ? out : null;
}

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function fetchLeague(id, name) {
  const homeUrl = `${BASE}/zuqiu-${id}/`;
  const home = await getText(homeUrl);
  const st = findStage(home);
  if (!st.stage) return { id, name, err: '联赛页没有积分榜链接' };
  const jfUrl = `${BASE}/zuqiu-${id}/jifen-${st.stage}/`;
  const html = await getText(jfUrl);
  const teams = parseStandings(html);
  if (!teams) return { id, name, err: '积分榜解析失败（表结构或行数不对）' };
  return { id, name, season: st.season, stage: st.stage, teams };
}

async function main() {
  /* 联赛清单：固定的常驻联赛 + jc-data.js 里出现过的 sid（去重） */
  const list = FIXED.map((x) => ({ id: x[0], name: x[1] }));
  const known = new Set(list.map((x) => x.id));
  try {
    const src = fs.readFileSync(path.join(HERE, 'jc-data.js'), 'utf8');
    const ids = [...src.matchAll(/"sid":\s*"(\d+)"/g)].map((m) => m[1]);
    ids.forEach((id) => { if (!known.has(id)) { known.add(id); list.push({ id, name: id }); } });
  } catch (e) { /* 没有 jc-data.js 就只抓固定那几个 */ }

  const leagues = {};
  let ok = 0;
  for (const it of list) {
    try {
      const r = await fetchLeague(it.id, it.name);
      if (r.err) { console.log(`  ⚠️ ${it.id} ${it.name}：${r.err}`); continue; }
      leagues[it.id] = { name: r.name, season: r.season, stage: r.stage, teams: r.teams };
      ok++;
      console.log(`  ✅ ${it.id} ${it.name} ${r.season}：${r.teams.length} 队（榜首 ${r.teams[0][1]} 分 / 末位 ${r.teams[r.teams.length - 1][1]} 分）`);
    } catch (e) {
      console.log(`  ❌ ${it.id} ${it.name}：${String(e.message).slice(0, 70)}`);
    }
    await sleep(400);
  }

  /* 上一份已有的数据（用来"这一轮没抓到的联赛沿用旧值"，绝不清空） */
  let prev = null;
  try {
    const src = fs.readFileSync(OUT_FILE, 'utf8');
    const i = src.indexOf('const JC_STANDINGS');
    const a = src.indexOf('{', i), b = src.lastIndexOf('}');
    if (i >= 0 && a >= 0 && b > a) prev = JSON.parse(src.slice(a, b + 1));
  } catch (e) { prev = null; }

  if (!ok) {
    /* 一个联赛都没抓到（云端美国 IP 被拦、或站点整体改了结构）：
       ⚠️【不覆盖旧文件、也不 exit 1】——
          旧的那一份通常还是好的，页面上照旧能用；这一步只是"本班没拿到新的"。
          云端构建/本机链都是"失败只记一行"的容错，这里主动 exit 0 免得刷红字。 */
    console.log('⚠️ fetch-standings.mjs：这一轮一个联赛都没抓到 → jc-standings.js 保持原样（沿用上一份）');
    process.exit(0);
  }

  /* 部分联赛失败：把上一份里这些联赛的旧值接回去（宁可旧，也不要少一个联赛） */
  let carried = 0;
  if (prev && prev.leagues) {
    Object.keys(prev.leagues).forEach((id) => {
      if (!leagues[id]) { leagues[id] = prev.leagues[id]; carried++; }
    });
  }

  const obj = {
    updated: nowStr(),
    note: '每行的列顺序：[名次,积分,场次,胜,平,负,进球,失球,队名]',
    leagues
  };
  const body = JSON.stringify(obj, null, 0);
  fs.writeFileSync(OUT_FILE,
    '/* 自动生成，请勿手动编辑 · ' + obj.updated + ' */\n'
    + 'const JC_STANDINGS = ' + body + ';\n', 'utf8');
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`✅ jc-standings.js 已生成  ${kb} KB · ${ok}/${list.length} 个联赛本轮更新`
    + (carried ? ' · ' + carried + ' 个联赛沿用上一份' : '')
    + ' · 数据时间 ' + obj.updated);
}

main().catch((e) => {
  /* ⚠️ 整体抓取异常也【不覆盖旧文件、不 exit 1】：这一步是"有更好、没有也能跑"，
     绝不让它把整班构建 / 整条本机链拖垮（旧数据照旧被 build-match 读走）。 */
  console.log('⚠️ fetch-standings.mjs 出错：' + (e && e.message) + ' → jc-standings.js 保持原样');
  process.exit(0);
});
