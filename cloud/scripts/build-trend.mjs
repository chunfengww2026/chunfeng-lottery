/* ============================================================
   build-trend.mjs —— 生成【走势图（表格版）】独立子页
   ------------------------------------------------------------
   产物：走势图.html —— 自包含单文件（数据 + 样式 + 脚本全内嵌，双击就能看）

   数据来源：history.js 的 DRAW_HISTORY（每彩种真开奖 60 期，取最近 N 期）
     · 只在【构建时】读一次，把快照内嵌进页面 → 页面零联网、零成本
     · 不写 localStorage、不调 AI、不抓网络

   代码来源（单一真源，不再手抄）：
     · trend-render.js  渲染内核（纯函数 renderTrendHtml / trAreaStats）
     · trend-mount.js   挂载 + 彩种切换
   这两个文件被【原文读进来】注入页面；页面和验收脚本跑的完全是同一份。

   ⚠️ 为什么这么拆（踩过的坑，都记在这）：
     最早是把内核"再手抄一份"写进 buildHtml 的模板字符串里，结果：
       ① 手抄版被整体转义，section 开头标签没插值、hidden 一个都没设上
       ② 往模板字符串里插值内核源码时，内核里的反引号会把外层模板提前截断
       ③ 把内核源码拼进 <script> 时，里面 renderTrendHtml 返回值中的
          "</script>" 字面量会让浏览器提前闭合 script 标签
     现在：内核与挂载各自独立成文件 → 构建时 readText → 只做一次
     "占位符 → 源码文本" 的字符串替换（split/join，不用 replace 以免
     $& 之类被当成替换模式）。转义只在一个地方做，逻辑一目了然。

   8 个彩种分区（按 history.js 里实测的 areas 键）：
     ssq 双色球 red 1-33 / blue 1-16      dlt 大乐透 front 1-35 / back 1-12
     qlc 七乐彩 main 1-30 / special 1-30  qxc 七星彩 front 0-9×6位 / back 0-14（第7位）
     kl8 快乐8  main 1-80                 fc3d 福彩3D / pl3 排列3 / pl5 排列5
   ⚠️ 数字型彩种（qxc/fc3d/pl3/pl5）的号码是【位】不是【集合】：0 是合法开出值，
      重复数字各算一次，所以不去重、不排序，保持官方开奖顺序。

   用法：
     node build-trend.mjs          # 默认最近 30 期
     node build-trend.mjs 20       # 改期数（10~60）
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { GAME_IDS, LOTTERY_SPEC } from './lottery-rules.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, '走势图.html');
const PERIODS = Math.max(10, Math.min(60, Number(process.argv[2]) || 30));

/* ---------- 彩种元数据（由 lottery-rules.mjs【派生】，不再手写第二份） ----------
   ⚠️ 这里的 pick = 【每期画几个号】= 规则表的 opens，【不是】玩法默认选号数。
      全项目只有快乐8 两者不同：走势图画 20 个（每期开奖数），
      玩法默认是「选十」（10 个）。以前手写这张表时 kl8 写 pick:20，
      很容易被读成"玩法选 20 个" —— 现在显式取 opens，语义落在字段名上。
   ⚠️ 位型标记（qxc/fc3d/pl3/pl5）来自规则表的 positional，只挂在主区。 */
export const TREND_GAMES = GAME_IDS.map((id) => {
  const spec = LOTTERY_SPEC[id];
  const areaOf = (a, withPositional) => {
    const o = { key: a.key, label: a.label, lo: a.min, hi: a.max, pick: a.opens };
    if (withPositional && spec.positional) o.positional = true;
    return o;
  };
  const row = { id, name: spec.name, main: areaOf(spec.areas[0], true) };
  if (spec.areas[1]) row.extra = areaOf(spec.areas[1], false);
  return row;
});

/* ---------- 读 history.js（真开奖） ---------- */
export function loadHistory() {
  const p = path.join(ROOT, 'history.js');
  if (!fs.existsSync(p)) throw new Error('找不到 history.js');
  const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
  vm.runInContext(fs.readFileSync(p, 'utf8') + '\nglobalThis.__H = DRAW_HISTORY;', c, { filename: 'history.js' });
  return c.__H;
}

/* ---------- 组装 payload（页面里的唯一数据源） ---------- */
export function buildPayload(hist, periods) {
  const N = periods || PERIODS;
  const games = [];
  for (const g of TREND_GAMES) {
    const all = (hist.games && hist.games[g.id]) || [];
    const slice = all.slice(0, N).reverse();          /* 数组最新在前 → 倒过来：旧 → 新 */
    const rows = slice.map((r) => {
      const a = r.areas || {};
      return {
        issue: String(r.issue),
        date: String(r.date || ''),
        nums: (a[g.main.key] || []).map(Number),
        extra: g.extra ? (a[g.extra.key] || []).map(Number) : []
      };
    });
    games.push({
      id: g.id, name: g.name,
      /* key 必须带上：验收脚本要拿它回 history.js 取真值对账 */
      main: { key: g.main.key, label: g.main.label, lo: g.main.lo, hi: g.main.hi,
              pick: g.main.pick, positional: !!g.main.positional },
      extra: g.extra ? { key: g.extra.key, label: g.extra.label, lo: g.extra.lo,
                         hi: g.extra.hi, pick: g.extra.pick } : null,
      rows,
      total: all.length
    });
  }
  return { updated: hist.updated || '', periods: N, games };
}

/* ============================================================
   读两个"单一真源"文件
   ============================================================ */
export const RENDER_SRC = fs.readFileSync(path.join(ROOT, 'trend-render.js'), 'utf8');
export const MOUNT_SRC = fs.readFileSync(path.join(ROOT, 'trend-mount.js'), 'utf8');

/* ============================================================
   页面外壳（米杏色，变量值和分享页 export-static.mjs 的 __LIGHT_THEME__ 一致）
   ------------------------------------------------------------
   __TREND_SCRIPT_BODY__ 是占位符：构建时替换成
     "数据快照 + 渲染内核 + 挂载逻辑"。
   ⚠️ 占位符必须写成拼出来的字符串，不能写成模板字符串里的 ${...}，
      否则模板解析时就会把它求值掉。
   ============================================================ */
const PLACEHOLDER = '__TREND_SCRIPT_BODY__';

export function buildHtml(payload) {
  const updated = payload.updated || '';
  const shell = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>春风大奖 · 走势图</title>
<meta name="description" content="春风大奖 · 走势图：8 个彩种最近 30 期开奖号码走势表（真实开奖数据）。仅供娱乐参考，不构成购彩建议；未成年人不得购买彩票。" />
<meta name="format-detection" content="telephone=no" />
<link rel="icon" type="image/svg+xml" href="icon.svg" />
<link rel="icon" type="image/x-icon" href="favicon.ico" />
<link rel="shortcut icon" href="favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
<meta name="theme-color" content="#f7efe1" />
<meta name="application-name" content="春风大奖" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="春风大奖" />
<style>
/* ============================================================
   走势图页 · 米杏色主题
   ============================================================ */
:root {
  --ro-bg: #f7efe1;
  --ro-card: #fdf6ea;
  --ro-sunken: #f3e6d0;
  --ro-line: #e8d7bd;
  --ro-line-soft: #efe2cc;
  --ro-fg: #4a3a26;
  --ro-fg2: #8a7a63;
  --ro-fg3: #a2937c;
  --ro-ok: #1a8c5a;
  --ro-link: #1f5fd6;
  --ro-warn: #b8860b;
  --ro-danger: #c0392b;
}
* { box-sizing: border-box; -webkit-text-size-adjust: 100%; }
html, body { margin: 0; background: var(--ro-bg); color: var(--ro-fg);
  font-family: "Microsoft YaHei", "PingFang SC", system-ui, -apple-system, sans-serif; }
.ro-wrap { max-width: 1180px; margin: 0 auto; padding: 0 12px 40px; }

/* ① 顶部 Tab（同款：未选中灰、选中绿 + 2px 短线） */
.top-tabs { display: flex; border-bottom: 1px solid var(--ro-line); margin-bottom: 2px; }
.top-tabs .tab { flex: 1; text-align: center; padding: 12px 8px; font-size: 14px;
  font-weight: 600; color: var(--ro-fg2); text-decoration: none; position: relative; }
.top-tabs .tab.on { color: var(--ro-ok); font-weight: 700; }
.top-tabs .tab.on::after { content: ''; position: absolute; left: 20%; right: 20%;
  bottom: 0; height: 2px; background: var(--ro-ok); border-radius: 2px; }

/* ② 主标题 */
.ro-top { padding: 22px 12px 8px; text-align: center; }
.ro-top h1 { margin: 0; font-size: 22px; font-weight: 800; color: var(--ro-ok); letter-spacing: 1px; }
.ro-top .sub { margin-top: 8px; font-size: 12px; color: var(--ro-fg2); }

/* ③ 提示条（米黄底） */
.ro-status { margin: 0 0 14px; border-radius: 10px; padding: 12px 14px; font-size: 13px;
  line-height: 1.8; background: #fff6dd; border: 1px solid #ffe08a; color: var(--ro-fg2); }
.ro-status b { color: #7a5c00; }
.ro-status .ro-st-time { color: var(--ro-danger); font-weight: 700; }

/* ④ 彩种切换条 */
.tr-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.tr-tab { flex: 0 0 auto; padding: 7px 13px; font-size: 13px; font-weight: 600;
  border-radius: 16px; text-decoration: none; color: var(--ro-fg2);
  background: var(--ro-card); border: 1px solid var(--ro-line); }
.tr-tab:hover { border-color: var(--ro-ok); }
.tr-tab.on { background: #e8f6ef; border-color: #b7e4cd; color: var(--ro-ok); }

/* ⑤ 每个彩种一块卡片 */
.tr-block { background: var(--ro-card); border: 1px solid var(--ro-line);
  border-radius: 12px; padding: 12px 12px 10px; margin: 0 0 16px; }
.tr-block[hidden] { display: none; }
.tr-head { padding: 0 2px 10px; }
.tr-title { margin: 0; font-size: 15px; font-weight: 800; color: var(--ro-fg); }
.tr-sub { margin-top: 5px; font-size: 12px; color: var(--ro-fg2); line-height: 1.7; }
.tr-sub b { color: var(--ro-fg); }

/* ⑥ 表格：横轴号码、纵轴期号；手机上能横向滑 */
.tr-scroll { overflow-x: auto; overflow-y: visible; -webkit-overflow-scrolling: touch;
  border: 1px solid var(--ro-line-soft); border-radius: 10px; background: #fffdf8;
  /* ⚠️ 必须是定位参考：走势连线的 SVG 覆盖层绝对定位在它里面，靠它对准表格 */
  position: relative; }
/* ⑨ 走势连线（用户 2026-10-17 要求：「加走势连线」，先双色球 + 大乐透）
   ------------------------------------------------------------
   挂载层量出每格中心后，在这里盖一层绝对定位的 SVG 画线。
   ⚠️ 覆盖层必须 pointer-events:none —— 否则会挡住下面的单元格，
      手指滑动/点按全失效（表格是能横向滚的）。 */
.tr-lines { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1; }
.tr-line { stroke-width: 1.4; stroke-linecap: round; fill: none; }
.tr-line-main { stroke: rgba(26, 140, 90, 0.55); }
.tr-line-extra { stroke: rgba(31, 95, 214, 0.55); }
/* 短线头 = 该号断开的区间边界（不是真连线，画淡一点、带虚线感） */
.tr-line-gap { stroke-opacity: 0.5; stroke-dasharray: 3 2.5; }
/* 说明：实线 = 相邻两期连续开出；虚线 = 中间隔了遗漏期（跨过去了） */

/* ⑩ 斜连（用户 2026-10-17 规则：|a-b| === 相隔期数）
   ------------------------------------------------------------
   用【金色】和竖向走势线（绿）区分开，一眼能分出两类线。
   ⚠️ 斜连默认只画"差1"那一档；"含间隔"那档线非常多（实测快乐8 可到
      3477 条，占格子 626%），由用户点开关自己开 —— 见 .tr-slantbtn。 */
.tr-slant { stroke: rgba(217, 163, 0, 0.75); stroke-width: 1.1; }
.tr-slant-extra { stroke: rgba(217, 140, 0, 0.75); }
/* 间隔斜连比"差1"更弱一点，免得抢眼糊成一片 */
.tr-slant-gapSlant { stroke-opacity: 0.5; stroke-dasharray: 4 2.5; }
/* 斜连开关（挂到彩种切换条那一行的右端） */
.tr-slantbtn { margin-left: auto; flex: 0 0 auto; font-size: 11.5px; font-weight: 700;
  color: #8a7a63; background: #fdf6ea; border: 1px solid #e8d7bd;
  border-radius: 20px; padding: 3px 10px; text-decoration: none; cursor: pointer; }
.tr-slantbtn.on { color: #b8860b; border-color: #f0dfa8; background: #fff6dd; }
.tr-table { border-collapse: separate; border-spacing: 0; table-layout: fixed;
  font-variant-numeric: tabular-nums; font-size: 12px; }
.tr-table th, .tr-table td { border-right: 1px solid var(--ro-line-soft);
  border-bottom: 1px solid var(--ro-line-soft); text-align: center; padding: 0; }
.tr-table thead th { position: sticky; top: 0; z-index: 3; background: var(--ro-sunken);
  color: var(--ro-fg2); font-weight: 700; font-size: 11px; height: 30px; }
.tr-th-issue { width: 76px; min-width: 76px; }
.tr-th-num { width: 22px; min-width: 22px; }
.tr-th-pos { width: 26px; min-width: 26px; }
.tr-th-extra { width: 20px; min-width: 20px; color: var(--ro-link); }
.tr-th-sep, .tr-td-sep { width: 7px; min-width: 7px; background: var(--ro-sunken);
  border-right: 2px solid var(--ro-line); }
.tr-th-tail, .tr-td-tail { width: 96px; min-width: 96px; border-right: 0; }
.tr-th-tail { font-size: 10px; }

/* 第 1 列【期号】横向也吸住，滑号码时不会看丢是哪一期 */
.tr-sticky { position: sticky; left: 0; z-index: 2; background: var(--ro-card);
  border-right: 1px solid var(--ro-line) !important; }
.tr-table thead .tr-sticky { z-index: 4; background: var(--ro-sunken); }

.tr-row:nth-child(even) td { background: #fbf3e6; }
.tr-row:nth-child(even) .tr-sticky { background: #fbf3e6; }
.tr-td-issue { height: 24px; line-height: 1.1; padding: 2px 4px !important; }
.tr-td-issue b { display: block; font-size: 11px; font-weight: 700; color: var(--ro-fg); }
.tr-td-issue i { display: block; font-style: normal; font-size: 9.5px; color: var(--ro-fg3); }
.tr-td-num { height: 24px; }
.tr-td-num.on { background: #d8efe2 !important; }
.tr-td-num s { display: inline-block; width: 11px; height: 11px; border-radius: 50%;
  background: var(--ro-ok); text-decoration: none; vertical-align: middle; }
.tr-td-extra s { background: var(--ro-link); }
.tr-row-last td { background: #fff6dd !important; }
.tr-row-last .tr-td-issue b { color: var(--ro-warn); }
.tr-td-tail { font-size: 11px; color: var(--ro-fg2); padding: 0 6px !important; text-align: left;
  white-space: nowrap; letter-spacing: .5px; }

/* 表尾三行：出现次数 / 当前遗漏 / 最大遗漏 */
.tr-table tfoot td { height: 22px; font-size: 11px; font-weight: 700;
  background: var(--ro-sunken); color: var(--ro-fg2); }
.tr-tf-label { text-align: left !important; padding: 0 6px !important; font-size: 10.5px;
  white-space: nowrap; }
.tr-td-freq { color: var(--ro-fg); }
.tr-td-gap.zero { color: var(--ro-danger); }
.tr-td-extra { color: var(--ro-link); }
.tr-table tfoot .tr-sticky { background: var(--ro-sunken); }

.tr-note { margin-top: 8px; font-size: 11.5px; color: var(--ro-fg3); line-height: 1.7; }

/* ⑦ 图例 */
.tr-legend { display: flex; flex-wrap: wrap; gap: 16px; margin: 4px 2px 18px;
  font-size: 11.5px; color: var(--ro-fg2); }
.tr-legend i { display: inline-block; width: 11px; height: 11px; border-radius: 3px;
  margin-right: 5px; vertical-align: middle; }
.tr-lg-on { background: #d8efe2; border: 1px solid #b7e4cd; }
.tr-lg-last { background: #fff6dd; border: 1px solid #ffe08a; }
.tr-lg-gap { background: #fffdf8; border: 1px solid var(--ro-line); }

/* ⑧ 页脚 */
.ro-foot { margin: 0 2px; font-size: 11px; color: var(--ro-fg3); line-height: 1.9; }
@media (max-width: 420px) {
  .ro-top h1 { font-size: 19px; }
  .tr-block { padding: 10px 8px 8px; }
  .tr-td-tail, .tr-th-tail { display: none; }
}
</style>
</head>
<body data-built="${updated}">
<div class="ro-wrap">

  <!-- 顶部 Tab：走势图页当前页带 .on；另外两个页面是同级静态页 -->
  <div class="top-tabs">
    <a class="tab" href="./">彩票推荐</a>
    <a class="tab" href="足球推荐.html">竞彩场次</a>
    <a class="tab on" href="走势图.html">走势图</a>
  </div>

  <div class="ro-top">
    <h1>春风十里送大奖</h1>
    <div class="sub">走势图 · 8 个彩种 · 最近 ${payload.periods} 期真实开奖</div>
  </div>

  <div class="ro-status">
    <b>只看数据，不荐号。</b>下面每一格都是历史开奖记录，不预测、不保证。
    <span class="ro-st-time">数据快照 ${updated}</span>
  </div>

  <div id="tr-root"></div>

  <div class="ro-foot">
    数据来源：本页自带的 history.js 快照（最近 ${payload.periods} 期）· 页面零联网、不调 AI · 仅供娱乐参考，不构成购彩建议；未成年人不得购买彩票。
  </div>
</div>

<script>
__TREND_SCRIPT_BODY__
</script>
</body>
</html>
`;
  /* 数据快照 + 渲染内核 + 挂载逻辑 */
  const body = [
    '/* 走势图数据快照 —— 构建时从 history.js 内嵌（本页唯一真数据源） */',
    'var TREND_DATA = ' + JSON.stringify(payload) + ';',
    '',
    RENDER_SRC,
    '',
    MOUNT_SRC
  ].join('\n');

  /* ⚠️ 唯一一处转义，而且【开始/结束标签都要转】：
     注入的脚本里含 '<script>' 与 '</script>' 字面量（内核代码里确实有）。
     HTML 的 script 数据状态规则：一旦在脚本文本里遇到 "<script"，
     解析器就会等一个配对的 "</script" 才结束 ——
     只转义结束标签的话，会出现"3 个 <script 只有 1 个 </script>"，
     后面的脚本全被吞成页面文本，表现成"整页没渲染、深链失效"（实测踩过）。
     两边都写成 "<\/script" 后：浏览器解析等价、脚本内容不变。
     用 split/join 而不是 replace，避免替换串里的 $& / $1 被当成替换模式。 */
  const safeBody = body.split('<script').join('<\\/script');

  const parts = shell.split(PLACEHOLDER);
  if (parts.length !== 2) throw new Error('页面模板里的脚本占位符数量异常：' + parts.length);
  return parts[0] + safeBody + parts[1];
}

/* ============================================================
   CLI：生成 走势图.html
   ============================================================ */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const hist = loadHistory();
  const payload = buildPayload(hist, PERIODS);

  /* 自检：8 个彩种都得有真数据，缺一个就报出来（不硬编、不用假数据） */
  let bad = 0;
  payload.games.forEach((g) => {
    const f = g.rows.reduce((a, r) => a + r.nums.length, 0);
    const okLen = g.rows.every((r) => r.nums.length === g.main.pick);
    console.log(`  ${g.id.padEnd(5)} ${g.name.padEnd(4)} ${String(g.rows.length).padStart(2)}期 ` +
      `${g.rows[0].issue}→${g.rows[g.rows.length - 1].issue} · 号码共 ${f} 个 · 每期个数${okLen ? '✅' : '❌'}` +
      (g.extra ? ` · ${g.extra.label} ${g.rows.reduce((a, r) => a + r.extra.length, 0)} 个` : ''));
    if (!okLen) bad++;
  });
  if (bad) { console.error(`\n❌ 有 ${bad} 个彩种每期号码个数和规则不符，已中止（不生成假页面）`); process.exit(1); }

  const html = buildHtml(payload);
  fs.writeFileSync(OUT, html, 'utf8');
  console.log(`\n✅ 已生成 ${OUT}（${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB · ` +
    `${payload.games.length} 彩种 · 每彩种 ${payload.periods} 期）`);
}
