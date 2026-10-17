/* ============================================================
   build-trend.mjs —— 生成【走势图（表格版）】的内联片段
   ------------------------------------------------------------
   ⚠️ 2026-10-17 用户要求：「留在近30期走势预选参考里面. 删除单独走势图独立页」。
      所以本文件【不再产出任何独立 HTML 文件】，改成 export 一个片段函数
      renderTrendFragment(payload)，由 export-static.mjs 插进分享页的
      <details class="ro-trend">（「走势图 / 近 30 期走势 · 预选参考」）里。
      （方式 A：片段导出。原来那种"先生成独立页、export-static 再读文件内联"
        的写法有构建顺序依赖，现在 import 直接用 —— 只跑 export-static.mjs 就够。）

   数据来源：history.js 的 DRAW_HISTORY（每彩种真开奖 60 期，取最近 N 期）
     · 只在【构建时】读一次，把快照内嵌进页面 → 页面零联网、零成本
     · 不写 localStorage、不调 AI、不抓网络
     ⚠️ 页面上不能出现任何「数据从哪来」的字样：这条口径由 source-guard.mjs 兜底。
        以前是本文件自己 removeSourceWords + assertNoSourceTrace；
        现在片段是分享页的一部分，断言在 export-static.mjs 写文件前
        对整个页面跑一次（同一个模块、同一套词表，口径不变）。

   代码来源（单一真源，不再手抄）：
     · trend-render.js  渲染内核（纯函数 renderTrendHtml / trAreaStats）
     · trend-mount.js   挂载 + 彩种切换
   这两个文件被【原文读进来】注入片段；页面和验收脚本跑的完全是同一份。
   （内联后挂载层有 3 处要做「独立页 → 内联」适配：改 <title>、
     别把分享页滚到顶、别把 ?g= 写回分享页地址栏 —— 见 adaptMountForInline。
     trend-mount.js 本身【不动】，它是别的窗口也在读的单一真源。）

   ⚠️ 内联后和分享页【共用同一个 document / 全局作用域】，所以：
     · 整段脚本包在 IIFE 里（TREND_DATA / renderTrendHtml / trEsc 不污染全局）
     · 根节点 id 加前缀：tr-root → ro-trend-root
     · 样式表整张过 scopeTrendCss() 收进 .ro-trend-embed
       （分享页里也有一份 .ro-wrap / .ro-top / .ro-status / .ro-foot / .btn，
         不加前缀会把整个分享页一起改掉）
     · 片段里【没有】顶部那排页面标签（彩票推荐 / 竞彩·足球 / 走势图）：
       用户明确要求删掉；独立页时代 HTML 和样式就一起删了，内联版更不能加回来。

   ⚠️ 为什么把内核与挂载拆成独立文件（踩过的坑，都记在这）：
     最早是把内核"再手抄一份"写进模板字符串里，结果：
       ① 手抄版被整体转义，section 开头标签没插值、hidden 一个都没设上
       ② 往模板字符串里插值内核源码时，内核里的反引号会把外层模板提前截断
       ③ 把内核源码拼进 <script> 时，里面 renderTrendHtml 返回值中的
          "<script" 字面量会让浏览器提前闭合 script 标签
     现在：内核与挂载各自独立成文件 → 构建时 readText → 只做一次
     "占位符 → 源码文本" 的字符串替换（split/join，不用 replace 以免
     $& 之类被当成替换模式）。转义只在一个地方做，逻辑一目了然。

   8 个彩种分区（按 history.js 里实测的 areas 键）：
     ssq 双色球 red 1-33 / blue 1-16      dlt 大乐透 front 1-35 / back 1-12
     qlc 七乐彩 main 1-30 / special 1-30  qxc 七星彩 front 0-9×6位 / back 0-14（第7位）
     kl8 快乐8  main 1-80                 fc3d 福彩3D / pl3 排列3 / pl5 排列5
   ⚠️ 数字型彩种（qxc/fc3d/pl3/pl5）的号码是【位】不是【集合】：0 是合法开出值，
      重复数字各算一次，所以不去重、不排序，保持官方开奖顺序。

   用法（只作为模块被 export-static.mjs import，没有命令行入口）：
     import { loadHistory, buildPayload, renderTrendFragment } from './build-trend.mjs';
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { GAME_IDS, LOTTERY_SPEC } from './lottery-rules.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
/* 折块里固定展示最近 30 期（和分享页折叠块副标题「近 30 期走势 · 预选参考」对齐） */
export const TREND_PERIODS = 30;

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
  const N = periods || TREND_PERIODS;
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
   走势图互动层：工具栏 + 预选行 + 手画线
   ------------------------------------------------------------
   这是【只由 build-trend.mjs 注入】的一段页面脚本，附在 trend-mount.js 之后
   同一个 <script> 里（页面不变量：只有 1 对 <script> 标签）。

   ⚠️ 为什么不去改 trend-render.js / trend-mount.js：
      那两个是"单一真源"，别的窗口/别的验收脚本也在读；
      本轮的边界是「只改 build-trend.mjs 这一个文件」，
      所以这里用【锚点注入】：不改那两个文件，只在构建时把
        · 工具栏 <div> 插到每个彩种块的 .tr-head 前面
        · 预选行 <tr> 插到每张表 tbody 的第一行
      注入点全部是【唯一字符串】，下面 assertOnce 会当场校验，
      上游一改模板就会构建失败 —— 不会静默画出半截页面。

   四个按钮（都是 <div class="btn">，不是 <button>）：
     · 默认        不画线：只显示原本就有的自动走势连线（竖向 + 斜连）
     · 画线        进画线档；下面会多出一排【画法】子档（见下）
     · 清空画线    清掉所有手画线
     · 自动衍生预选 一键选出【近 N 期出现次数最多】的号（见 pickNumbers）

   画线的三种画法（用户 2026-10-17：「两种都要 就是个人想怎么画就怎么画」）：
     · 自由       手指/鼠标怎么拖怎么画（跟手），默认档
     · 直线       从起点拖到终点，只连一条直线（不跟手抖）
     · 逐点       点一个格子标一个点，再点一个自动和上一个点连成线
   三条都是 <div class="btn btn-sub">，只在「画线」档显示；手机上都是点/拖各触发一次。

   预选行：
     · 每个号码格点一下 = 选中（金色实心 .num.gold）/ 再点 = 取消（虚线空心 .num.empty）
     · 蓝球/后区那一行同样能点（用户的 if (isBlue) return 是没实现完，这里补上）
     · 自动衍生预选：主区选「该彩种每期开几个」那么多，第二区选「每期开几个」那么多
       （双色球 6 红 + 1 蓝 / 大乐透 5 前 + 2 后 / 快乐8 10 / 3D·排列3 3 / 排列5 5）
   零 localStorage：选中状态只活在内存里。
   ============================================================ */
const INTERACT_SRC = `
/* ============================================================
   走势图互动层（工具栏 / 预选行 / 手画线）
   ------------------------------------------------------------
   由 build-trend.mjs 注入，附在 trend-mount.js 之后（同一个 <script>）。
   依赖：TREND_DATA、renderTrendHtml；不依赖 trend-mount.js 里的局部变量
   （那些都在 IIFE 里，外面拿不到 —— 所以这里只用 document 查询 + 事件委托）。
   ============================================================ */
(function () {
  var SVGNS = 'http://www.w3.org/2000/svg';
  var root = document.getElementById('tr-root');
  if (!root) return;
  var toArr = function (nl) { return Array.prototype.slice.call(nl); };
  var qsa = function (sel, host) { return toArr((host || root).querySelectorAll(sel)); };

  /* 工具模式：none=默认（不画线） line=画线 */
  var mode = 'none';
  /* 手画线：按彩种存，每条是一串"格心坐标" */
  var strokes = {};
  /* 预选：按彩种存两个集合（号码"格子"的编号，位置彩种同号会出现多次 → 用编号） */
  var sel = {};
  var slugOf = function (s) { return String(s).replace(/[^A-Za-z0-9_-]/g, '_'); };

  function gameOf(id) {
    var g = null;
    (TREND_DATA.games || []).forEach(function (x) { if (x.id === id) g = x; });
    return g;
  }

  /* ============================================================
     ① 工具栏：每个彩种块一个（只有 .tr-block 是显示/隐藏的，放块里就跟着切）
     ============================================================ */
  var TOOLS = [
    { t: 'none', label: '默认', title: '默认：不画线，只显示自动走势连线' },
    { t: 'line', label: '画线', title: '在表格上按住拖动，画一条线' },
    { t: 'clear', label: '清空画线', title: '清掉手画的线' },
    { t: 'autoPreview', label: '自动衍生预选', title: '按近 N 期出现次数选号' }
  ];
  var DRAW_STYLES = [
    { s: 'free', label: '自由', title: '自由手拖：手指/鼠标怎么拖就怎么画（跟手）' },
    { s: 'straight', label: '直线', title: '直线：从起点拖到终点，只画一条直线' },
    { s: 'dots', label: '逐点', title: '逐点连线：点一个格子标一个点，自动和上一个点连成线' }
  ];
  var drawStyle = 'free';
  var btnEls = [];
  var styleEls = [];

  function mountToolbars() {
    qsa('.tr-preseltool').forEach(function (tb) {
      var gid = tb.getAttribute('data-tr-preseltool');
      var bar = document.createElement('div');
      bar.className = 'toolbar';
      bar.setAttribute('data-tr-toolbar', gid);
      bar.setAttribute('role', 'toolbar');
      TOOLS.forEach(function (t) {
        var b = document.createElement('div');
        b.className = 'btn';
        b.setAttribute('data-tool', t.t);
        b.setAttribute('data-tr-toolbar-for', gid);
        b.setAttribute('role', 'button');
        b.setAttribute('tabindex', '0');
        b.setAttribute('title', t.title);
        b.textContent = t.label;
        bar.appendChild(b);
        btnEls.push(b);
      });
      if (tb.parentNode && tb.parentNode.insertBefore) tb.parentNode.insertBefore(bar, tb);
      /* 提示行：告诉用户当前档位在干什么 */
      var h = document.createElement('div');
      h.className = 'tr-modehint';
      h.setAttribute('data-tr-modehint', gid);
      if (bar.parentNode && bar.parentNode.insertBefore) bar.parentNode.insertBefore(h, bar.nextSibling);
      /* 画法子档（自由 / 直线 / 逐点）：只在「画线」档显示，paintTools 里切 .on。
         做小了并单独一行，免得 8 个彩种的工具栏被挤爆。 */
      var row = document.createElement('div');
      row.className = 'drawstyles';
      row.setAttribute('data-tr-drawstyles', gid);
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', '画线画法');
      var lab = document.createElement('span');
      lab.className = 'drawstyles-label';
      lab.textContent = '画法';
      row.appendChild(lab);
      DRAW_STYLES.forEach(function (st) {
        var sb = document.createElement('div');
        sb.className = 'btn btn-sub';
        sb.setAttribute('data-tr-drawstyle', st.s);
        sb.setAttribute('data-tr-drawstyle-for', gid);
        sb.setAttribute('role', 'button');
        sb.setAttribute('tabindex', '0');
        sb.setAttribute('title', st.title);
        sb.textContent = st.label;
        row.appendChild(sb);
        styleEls.push(sb);
      });
      if (h.parentNode && h.parentNode.insertBefore) h.parentNode.insertBefore(row, h.nextSibling);
    });
    paintTools();
  }

  /* 按钮状态：当前档位高亮；"自动衍生预选"给个一次性的"已选中 N 个"反馈 */
  function paintTools() {
    btnEls.forEach(function (b) {
      var on = (b.getAttribute('data-tool') === mode);
      b.className = 'btn' + (on ? ' active' : '') +
        (b.getAttribute('data-tool') === 'autoPreview' && b.getAttribute('data-tr-done') === '1' ? ' done' : '');
    });
    /* 画法子档：只在「画线」档显示，当前画法高亮 */
    styleEls.forEach(function (b) {
      var on = (b.getAttribute('data-tr-drawstyle') === drawStyle);
      b.className = 'btn btn-sub' + (on ? ' active' : '');
    });
    qsa('[data-tr-drawstyles]').forEach(function (r) {
      r.className = 'drawstyles' + (mode === 'line' ? ' on' : '');
      r.setAttribute('data-tr-drawstyle-on', mode === 'line' ? '1' : '0');
    });
    qsa('[data-tr-modehint]').forEach(function (h) {
      h.textContent = mode !== 'line'
        ? '默认：只显示自动走势连线（竖向 + 斜连）。想自己画线请点「画线」。'
        : (drawStyle === 'straight'
            ? '画线中（直线）：从起点拖到终点，松手画一条直线；用「画法」可换自由 / 逐点。'
            : (drawStyle === 'dots'
                ? '画线中（逐点）：点一个格子标一个点，再点下一个自动连成线；用「画法」可换自由 / 直线。'
                : '画线中（自由）：按住鼠标 / 手指在表格上拖动，怎么拖怎么画；用「画法」可换直线 / 逐点。'));
    });
  }

  /* ============================================================
     ② 预选行：表头下面第一行，每格点一下选中/取消
     ============================================================ */
  function buildPreselRows() {
    qsa('[data-tr-table]').forEach(function (table) {
      var gid = table.getAttribute('data-tr-table');
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      var g = gameOf(gid);
      if (!g) return;
      if (!sel[gid]) sel[gid] = { main: {}, extra: {} };
      var cells = qsa('[data-tr-presel]', table);
      var headCell = null;
      toArr(tbody.children).forEach(function (tr) {
        toArr(tr.children).forEach(function (td) {
          if (td.getAttribute && td.getAttribute('data-tr-presel') === 'label') headCell = td;
        });
      });
      if (headCell) headCell.className = 'tr-td-issue tr-sticky tr-td-presel';
      cells.forEach(function (td) {
        var zone = td.getAttribute('data-tr-presel');
        if (zone === 'label') return;
        var isExtra = (zone === 'x');
        td.className = 'tr-td-presel tr-td-num' + (isExtra ? ' is-extra' : '');
        td.setAttribute('role', 'button');
        td.setAttribute('tabindex', '0');
        var wrap = document.createElement('span');
        wrap.className = 'num empty';
        td.appendChild(wrap);
        var key = td.getAttribute('data-tr-key');
        var on = !!(isExtra ? sel[gid].extra[key] : sel[gid].main[key]);
        paintCell(td, on);
      });
    });
  }

  function paintCell(td, on) {
    var wrap = td.querySelector('.num');
    if (!wrap) return;
    wrap.className = 'num ' + (on ? 'gold' : 'empty');
    td.setAttribute('data-tr-sel', on ? '1' : '0');
    td.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function toggleCell(td) {
    var table = td;
    while (table && table.getAttribute && !table.getAttribute('data-tr-table')) table = table.parentNode;
    if (!table || !table.getAttribute) return;
    var gid = table.getAttribute('data-tr-table');
    if (!sel[gid]) sel[gid] = { main: {}, extra: {} };
    var isExtra = (td.getAttribute('data-tr-presel') === 'x');
    var key = td.getAttribute('data-tr-key');
    var bag = isExtra ? sel[gid].extra : sel[gid].main;
    bag[key] = !bag[key];
    paintCell(td, bag[key]);
  }

  /* ============================================================
     ③ 自动衍生预选：near N 期出现次数最多的号
     ------------------------------------------------------------
     N = 该区【每期开几个】（= 规则表的 pick）：
       双色球 红6 / 蓝1 · 大乐透 前5 / 后2 · 快乐8 10 · 3D·排列3 3 · 排列5 5
     · freq 从页面自带的 TREND_DATA 现算，不再调后端、不联网
     · 次数相同按号码从小到大（确定性，方便验收对账）
     · 数字型彩种（3D/排列3/排列5）的 freq = 该数字在【任意一位】出现的次数，
       所以"出现次数最多的 3 个数字"就是它最热的 3 个候选号 —— 表里一格 = 一个数字。
     ============================================================ */
  function pickNumbers(arrs, lo, hi, pick) {
    var freq = {}, n;
    for (n = lo; n <= hi; n++) freq[n] = 0;
    (arrs || []).forEach(function (arr) {
      (arr || []).forEach(function (v) { if (freq[v] != null) freq[v]++; });
    });
    var list = [];
    for (n = lo; n <= hi; n++) list.push({ n: n, c: freq[n], idx: n - lo });
    list.sort(function (a, b) { return (b.c - a.c) || (a.idx - b.idx); });
    var want = Math.max(1, Math.min(pick || 1, list.length));
    return list.slice(0, want);
  }

  function autoPreview() {
    var report = [];
    qsa('[data-tr-table]').forEach(function (table) {
      var gid = table.getAttribute('data-tr-table');
      var g = gameOf(gid);
      if (!g) return;
      if (!sel[gid]) sel[gid] = { main: {}, extra: {} };
      sel[gid] = { main: {}, extra: {} };
      var hit = { main: [], extra: [] };
      var rows = g.rows || [];
      pickNumbers(rows.map(function (r) { return r.nums; }), g.main.lo, g.main.hi, g.main.pick)
        .forEach(function (x) { hit.main.push(x.n); sel[gid].main[x.idx] = 1; });
      if (g.extra) {
        pickNumbers(rows.map(function (r) { return r.extra; }), g.extra.lo, g.extra.hi, g.extra.pick)
          .forEach(function (x) { hit.extra.push(x.n); sel[gid].extra[x.idx] = 1; });
      }
      /* 把这一块的预选行重画成新选中状态 */
      qsa('[data-tr-presel]', table).forEach(function (td) {
        var zone = td.getAttribute('data-tr-presel');
        if (zone === 'label') return;
        var key = td.getAttribute('data-tr-key');
        var on = (zone === 'x') ? !!sel[gid].extra[key] : !!sel[gid].main[key];
        paintCell(td, on);
      });
      report.push({ game: gid, main: hit.main.join(' '), extra: hit.extra.join(' ') });
    });
    return report;
  }

  /* ============================================================
     ④ 手画线：在表格上拖动画线（SVG 覆盖层，和走势连线同一套坐标）
     ------------------------------------------------------------
     ⚠️ 为什么用 SVG 覆盖层：和现有走势连线一致，且能精确贴在格心上。
     ⚠️ 为什么格心要在每笔开头重新量：表格能横向滚动、第一列是吸住的，
        缓存坐标会在滚动后画歪。
     ⚠️ pointer-events 默认 none（不挡滑动/点选），只有画线模式才 auto。
     ============================================================ */
  function overlayOf(block) {
    var table = block.querySelector('[data-tr-table]');
    if (!table) return null;
    var host = table.parentNode;
    if (!host) return null;
    var svg = null;
    toArr(block.querySelectorAll('svg.tr-lines-draw')).forEach(function (s) {
      if (s.getAttribute('data-tr-draw-for') === block.getAttribute('data-tr-block')) svg = s;
    });
    if (!svg) {
      svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'tr-lines-draw');
      svg.setAttribute('data-tr-draw-for', block.getAttribute('data-tr-block'));
      svg.setAttribute('aria-hidden', 'true');
      host.appendChild(svg);
    }
    var box = table.getBoundingClientRect();
    svg.setAttribute('width', String(box.width || 0));
    svg.setAttribute('height', String(box.height || 0));
    svg.setAttribute('viewBox', '0 0 ' + (box.width || 0) + ' ' + (box.height || 0));
    return svg;
  }

  function measureCells(block) {
    var table = block.querySelector('[data-tr-table]');
    if (!table || !table.getBoundingClientRect) return null;
    var box = table.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    var cells = [];
    toArr(table.querySelectorAll('[data-tr-hit]')).forEach(function (td) {
      var r = td.getBoundingClientRect();
      if (!r || !r.width || !r.height) return;
      cells.push({
        td: td,
        x: r.left - box.left + r.width / 2,
        y: r.top - box.top + r.height / 2,
        l: r.left - box.left, rr: r.right - box.left,
        t: r.top - box.top, b: r.bottom - box.top
      });
    });
    return cells.length ? { box: box, cells: cells } : null;
  }

  function cellAt(m, x, y) {
    for (var i = 0; i < m.cells.length; i++) {
      var c = m.cells[i];
      if (x >= c.l && x <= c.rr && y >= c.t && y <= c.b) return c;
    }
    return null;
  }

  function renderStroke(block, pts, style) {
    var svg = overlayOf(block);
    if (!svg || !pts || !pts.length) return;
    /* 逐点档：每个点标一个实心圆点（不标的话"点了一个格子"看不见），
       点与点之间再用折线连起来。 */
    if (style === 'dots') {
      if (pts.length > 1) {
        var pl = document.createElementNS(SVGNS, 'polyline');
        pl.setAttribute('points', pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '));
        pl.setAttribute('class', 'tr-draw');
        svg.appendChild(pl);
      }
      pts.forEach(function (p) {
        var dot = document.createElementNS(SVGNS, 'circle');
        dot.setAttribute('cx', p.x.toFixed(1));
        dot.setAttribute('cy', p.y.toFixed(1));
        dot.setAttribute('r', '3.5');
        dot.setAttribute('class', 'tr-dot');
        svg.appendChild(dot);
      });
      return;
    }
    var el;
    if (pts.length === 1) {
      el = document.createElementNS(SVGNS, 'line');
      el.setAttribute('x1', (pts[0].x - 6).toFixed(1));
      el.setAttribute('y1', pts[0].y.toFixed(1));
      el.setAttribute('x2', (pts[0].x + 6).toFixed(1));
      el.setAttribute('y2', pts[0].y.toFixed(1));
    } else {
      el = document.createElementNS(SVGNS, 'polyline');
      el.setAttribute('points', pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '));
    }
    el.setAttribute('class', 'tr-draw');
    svg.appendChild(el);
  }

  function redrawBlock(block) {
    var gid = block.getAttribute('data-tr-block');
    var svg = null;
    toArr(block.querySelectorAll('svg.tr-lines-draw')).forEach(function (s) {
      if (s.getAttribute('data-tr-draw-for') === gid) svg = s;
    });
    if (svg) toArr(svg.childNodes).forEach(function (c) { if (svg.removeChild) svg.removeChild(c); });
    (strokes[gid] || []).forEach(function (st) { renderStroke(block, st.pts, st.style); });
  }

  function clearStrokes() {
    var n = 0;
    Object.keys(strokes).forEach(function (k) { n += strokes[k].length; });
    strokes = {};
    qsa('[data-tr-block]').forEach(function (b) {
      var gid = b.getAttribute('data-tr-block');
      toArr(b.querySelectorAll('svg.tr-lines-draw')).forEach(function (s) {
        if (s.getAttribute('data-tr-draw-for') === gid) toArr(s.childNodes).forEach(function (c) { if (s.removeChild) s.removeChild(c); });
      });
      b.setAttribute('data-tr-strokes', '0');
    });
    return n;
  }

  function activeBlock() {
    var list = qsa('[data-tr-block]').filter(function (b) { return !b.hasAttribute('hidden'); });
    return list[0] || null;
  }

  function applyMode() {
    qsa('[data-tr-block]').forEach(function (b) {
      var gid = b.getAttribute('data-tr-block');
      var on = (mode === 'line');
      b.className = 'tr-block' + (on ? ' tr-drawing' : '');
      /* 画线层可能还没建过（一笔没画时就没有 svg）→ 进画线模式先建出来，
         不然「画线」按下去没有任何视觉反馈，验收也量不到 pointer-events。 */
      if (on) overlayOf(b);
      toArr(b.querySelectorAll('svg.tr-lines-draw')).forEach(function (s) {
        if (s.getAttribute('data-tr-draw-for') === gid) s.setAttribute('class', 'tr-lines-draw' + (on ? ' on' : ''));
      });
    });
    paintTools();
  }

  /* 拖动画一笔 */
  var drag = null;
  function ptFrom(ev, box) {
    var cx = (ev && ev.clientX) || 0, cy = (ev && ev.clientY) || 0;
    return { x: cx - box.left, y: cy - box.top };
  }
  /* 往当前这一笔里加一个点。
     ⚠️ force=true 用于"真取到了格心"：格心可能离上一个点很近（相邻列），
        按像素距离过滤会把格心丢掉 → 线就不落在格子上了。
        所以只有"自由画（没落在任何格子里的原始坐标）"才按距离过滤，
        免得一条线存上万个点。 */
  function pushPoint(p, force) {
    if (!drag) return;
    var last = drag.pts[drag.pts.length - 1];
    if (last && !force) {
      var d = Math.sqrt((last.x - p.x) * (last.x - p.x) + (last.y - p.y) * (last.y - p.y));
      if (d < 5) return;
    }
    if (drag.pts.length > 1200) return;           /* 兜底，别让一笔无限长 */
    drag.pts.push(p);
  }
  /* 逐点连线：往这一彩种的【最后一条逐点链】上再接一个点；没有就新起一条。
     同一个格子连点两次不重复标；一条链最多 200 个点（兜底）。 */
  function addDot(block, pt) {
    var gid = block.getAttribute('data-tr-block');
    if (!strokes[gid]) strokes[gid] = [];
    var list = strokes[gid], chain = null;
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] && list[i].style === 'dots') { chain = list[i]; break; }
    }
    if (!chain) { chain = { style: 'dots', pts: [] }; list.push(chain); }
    var last = chain.pts[chain.pts.length - 1];
    if (last && Math.abs(last.x - pt.x) < 0.6 && Math.abs(last.y - pt.y) < 0.6) return;
    if (chain.pts.length >= 200) return;
    chain.pts.push({ x: pt.x, y: pt.y });
    block.setAttribute('data-tr-strokes', String(list.length));
    block.setAttribute('data-tr-dots', String(chain.pts.length));
    redrawBlock(block);
  }

  function onDown(block, ev) {
    if (mode !== 'line') return;
    if (ev && ev.cancelable && ev.preventDefault) ev.preventDefault();
    var m = measureCells(block);
    if (!m) return;
    var p = ptFrom(ev, m.box);
    var c = cellAt(m, p.x, p.y);
    var hit = c ? { x: c.x, y: c.y } : p;        /* 落在格子里 → 吸附到格心 */
    /* 逐点档：一次点击 = 标一个点，就在 onDown 里落好。
       ⚠️ 手机上只认 pointerdown / touchstart 这一路，touchend 不再补一次，
          所以不会"点一下标两个点"。 */
    if (drawStyle === 'dots') { addDot(block, hit); return; }
    drag = { block: block, pts: [hit], lastCell: c, style: drawStyle };
    redrawBlock(block);
    renderStroke(block, drag.pts, drag.style);
  }
  function onMove(block, ev) {
    if (!drag || drag.block !== block) return;
    if (ev && ev.cancelable && ev.preventDefault) ev.preventDefault();
    var table = block.querySelector('[data-tr-table]');
    if (!table || !table.getBoundingClientRect) return;
    var box = table.getBoundingClientRect();
    var p = ptFrom(ev, box);
    var m = measureCells(block);
    var c = m ? cellAt(m, p.x, p.y) : null;
    /* 直线档：这一笔只保留【起点 → 当前点】两个端点，拖到哪预览到哪 */
    if (drag.style === 'straight') {
      var a = drag.pts[0];
      var end = c ? { x: c.x, y: c.y } : p;
      if (a && Math.abs(a.x - end.x) < 0.6 && Math.abs(a.y - end.y) < 0.6) end = a;
      drag.pts = [a, end];
      drag.lastCell = c;
      redrawBlock(block);
      renderStroke(block, drag.pts, 'straight');
      return;
    }
    /* 自由档：落格吸格心；格子外按像素距离抽稀（免得一笔上万个点） */
    if (c && c === drag.lastCell) return;
    if (c) {
      pushPoint({ x: c.x, y: c.y }, true);        /* 吸附到格心 */
    } else {
      pushPoint(p, false);                        /* 格子外：自由画，按距离过滤 */
    }
    drag.lastCell = c;                            /* c 为 null 时也要记，否则回格子后不吸附 */
    redrawBlock(block);
    renderStroke(block, drag.pts, drag.style);
  }
  function onUp(block) {
    if (!drag || drag.block !== block) return;
    var gid = block.getAttribute('data-tr-block');
    if (!strokes[gid]) strokes[gid] = [];
    var pts = drag.pts.slice();
    /* 直线档没拖动（起终点重合）→ 只留一个点，和自由档"点一下"的表现一致 */
    if (drag.style === 'straight' && pts.length > 1) {
      var a = pts[0], b = pts[pts.length - 1];
      if (Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)) < 2) pts = [a];
    }
    if (pts.length) strokes[gid].push({ pts: pts, style: drag.style });
    block.setAttribute('data-tr-strokes', String(strokes[gid].length));
    drag = null;
    redrawBlock(block);
  }

  function hasPointer() { return typeof window !== 'undefined' && typeof window.PointerEvent === 'function'; }
  function hasTouch() { return typeof window !== 'undefined' && ('ontouchstart' in window); }
  var PTR = hasPointer();

  qsa('[data-tr-block]').forEach(function (block) {
    var host = (block.querySelector('[data-tr-table]') || {}).parentNode;
    if (!host || !host.addEventListener) return;
    if (PTR) {
      host.addEventListener('pointerdown', function (ev) { onDown(block, ev); }, { passive: false });
      host.addEventListener('pointermove', function (ev) { onMove(block, ev); }, { passive: false });
      host.addEventListener('pointerup', function (ev) { onUp(block, ev); });
      host.addEventListener('pointercancel', function (ev) { onUp(block, ev); });
    } else if (hasTouch()) {
      /* ⚠️ 只认触摸的机器（老 Android / 老 iOS WebView）：只绑 touch，
         再绑一套 mouse 会和触摸补发的 mousedown/mouseup/click 撞车。 */
      host.addEventListener('touchstart', function (ev) { onDown(block, ev.touches && ev.touches[0] || ev); }, { passive: false });
      host.addEventListener('touchmove', function (ev) { onMove(block, ev.touches && ev.touches[0] || ev); }, { passive: false });
      host.addEventListener('touchend', function (ev) { onUp(block, ev); });
      host.addEventListener('touchcancel', function (ev) { onUp(block, ev); });
    } else {
      host.addEventListener('mousedown', function (ev) { onDown(block, ev); });
      host.addEventListener('mousemove', function (ev) { onMove(block, ev); });
      host.addEventListener('mouseup', function (ev) { onUp(block, ev); });
    }
  });

  /* 移动端：手画到表格外也要收笔（否则线会一直粘着手指） */
  if (typeof window !== 'undefined' && window.addEventListener) {
    var endAll = function () { if (drag) onUp(drag.block); };
    window.addEventListener('pointerup', endAll);
    window.addEventListener('pointercancel', endAll);
    if (!hasPointer()) {
      window.addEventListener('mouseup', endAll);
      window.addEventListener('touchend', endAll);
      window.addEventListener('touchcancel', endAll);
    }
  }

  /* ============================================================
     ⑤ 事件委托：工具栏按钮 + 预选行点选
     ------------------------------------------------------------
     ⚠️ 用委托（不是每格绑定）：
        · 预选行格子很多（快乐8 一口 80 格），逐个绑事件太重
        · 彩种切换会重画连线覆盖层，委托不受影响
     ============================================================ */
  function toolClicked(t, btn) {
    if (t === 'none') { mode = 'none'; applyMode(); return; }
    if (t === 'line') { mode = (mode === 'line') ? 'none' : 'line'; applyMode(); return; }
    if (t === 'clear') {
      var n = clearStrokes();
      if (btn) {
        btn.setAttribute('data-tr-cleared', String(n));
        var old = btn.textContent;
        btn.textContent = '已清空 ' + n + ' 条';
        if (window.setTimeout) window.setTimeout(function () { btn.textContent = old; btn.removeAttribute('data-tr-cleared'); }, 1200);
      }
      return;
    }
    if (t === 'autoPreview') {
      var rep = autoPreview();
      /* 打印一次实例，肉眼/验收脚本都能查（不影响用户界面） */
      try {
        if (window.console && console.log) {
          console.log('[自动衍生预选] 近 ' + (TREND_DATA.periods || 0) + ' 期出现次数最多的号：');
          rep.forEach(function (r) {
            console.log('  ' + r.game + ' → ' + r.main + (r.extra ? '  +  ' + r.extra : ''));
          });
        }
      } catch (e) { /* 控制台不可用就算了 */ }
      window.__TREND_PRESEL_REPORT = rep;
      if (btn) btn.setAttribute('data-tr-done', '1');
      paintTools();
      if (btn && window.setTimeout) window.setTimeout(function () { btn.removeAttribute('data-tr-done'); paintTools(); }, 1600);
      return;
    }
  }

  /* 从事件目标往上找带某个属性的元素（按钮里的文字被点到，也能找到按钮本身） */
  function findUp(el, attr) {
    while (el && el.getAttribute) {
      if (el.getAttribute(attr) != null) return el;
      el = el.parentNode;
    }
    return null;
  }
  /* 切画法：自由 / 直线 / 逐点 */
  function applyStyle(s) {
    if (!s) return;
    drawStyle = s;
    if (mode !== 'line') mode = 'line';          /* 兜底：在别的档点到也切进画线 */
    applyMode();
  }

  root.addEventListener('click', function (ev) {
    if (isSyntheticAfterTouch(ev)) return;       /* 触摸已经在 touchend 里处理过 */
    var el = findUp(ev && ev.target, 'data-tool');
    if (!el) return;
    var t = el.getAttribute('data-tool');
    if (t) { if (ev.preventDefault) ev.preventDefault(); toolClicked(t, el); }
  });

  /* 画法档（自由 / 直线 / 逐点）：点一下就换画法（点文字也算，往上一层找按钮） */
  root.addEventListener('click', function (ev) {
    if (isSyntheticAfterTouch(ev)) return;       /* 触摸已经在 touchend 里处理过 */
    var el = findUp(ev && ev.target, 'data-tr-drawstyle');
    if (!el) return;
    if (ev.preventDefault) ev.preventDefault();
    applyStyle(el.getAttribute('data-tr-drawstyle'));
  });

  /* 浏览器的"补发鼠标事件"要挡掉：
     ① 能出 PointerEvent 的浏览器：pointerdown 里 preventDefault，本来就打断补发；
     ② 只有 touch 的老浏览器：touchstart 里 preventDefault，同样打断补发；
     ③ 裸鼠标桌面：不存在补发。
     eventLockUntil 是最后一道保险（万一某个浏览器还是补了 click，
     就用"刚处理过触摸"这个标志把它吃掉），实测不加保险时
     手指点一下预选格会"选中又立刻取消"（touchend + 补发 click 各 toggle 一次）。 */
  var touchAt = 0;
  /* 触摸起点 + 有没有真的拖动过（>8px 不当成"点击"：
     手指落在彩种条上往下滑页面，不能被判成"切换彩种"） */
  var touchX = 0, touchY = 0, touchMoved = false;
  function handlePreselTap(ev) {
    var el = ev && ev.target;
    while (el && el.getAttribute && el.getAttribute('data-tr-presel') == null) el = el.parentNode;
    if (!el || !el.getAttribute) return;
    var zone = el.getAttribute('data-tr-presel');
    if (zone === 'label') return;
    if (mode === 'line') return;                 /* 画线模式下别同时改预选 */
    toggleCell(el);
  }
  function isSyntheticAfterTouch(ev) {
    if (!touchAt) return false;
    var now = (ev && ev.timeStamp) || 0;
    return !now || (now - touchAt) < 800;
  }
  root.addEventListener('click', function (ev) {
    if (isSyntheticAfterTouch(ev)) return;
    handlePreselTap(ev);
  });
  root.addEventListener('touchend', function (ev) {
    touchAt = (ev && ev.timeStamp) || 0;
    /* ⚠️ 下面这条 preventDefault 会打断浏览器【补发的 click】——
       所以「工具栏按钮 / 画法档 / 预选格」的触摸动作必须在这里自己处理完，
       不能只等 click：实测（真机 + CDP 触摸）手指点按钮，click 不来 → 按钮没反应。
       桌面鼠标没有 touchAt，照旧走 click，互不干扰。 */
    if (ev && ev.cancelable && ev.preventDefault) ev.preventDefault();
    /* 手指移动位移：用来区分「点」和「滑」 */
    var t1 = ev && ev.changedTouches && ev.changedTouches[0];
    if (t1) {
      if (Math.abs(t1.clientX - touchX) > 8 || Math.abs(t1.clientY - touchY) > 8) touchMoved = true;
    }
    var toolEl = findUp(ev && ev.target, 'data-tool');
    if (toolEl) { toolClicked(toolEl.getAttribute('data-tool'), toolEl); return; }
    var styleEl = findUp(ev && ev.target, 'data-tr-drawstyle');
    if (styleEl) { applyStyle(styleEl.getAttribute('data-tr-drawstyle')); return; }
    /* 【彩种切换按钮】用户 2026-10-17 实测：「手机版本点不动这些按钮」
       （双色球 / 大乐透 / 七乐彩 / 七星彩 / 快乐8 / 福彩3D / 排列3 / 排列5）。
       根因：这几颗按钮的事件绑在 trend-mount.js 里，只有 click；
       而本层上面那条 preventDefault 把浏览器【补发的 click】打断了 →
       手机上 touchend 来了、click 永远不来 → 点了不切表格（桌面鼠标不受影响）。
       做法：触摸路径在这里替它触发一次 click（mount 自己的 click 处理器照常跑 show()），
       一次触摸只切一次（补发的 click 已被上面 preventDefault 挡掉）。
       真滑动（>8px）不切，免得滚页面时误切彩种。 */
    var tabEl = findUp(ev && ev.target, 'data-tr-tab');
    if (tabEl) {
      if (!touchMoved && tabEl.click) tabEl.click();
      return;
    }
    handlePreselTap(ev);
  });
  root.addEventListener('touchstart', function (ev) {
    var t0 = ev && ev.touches && ev.touches[0];
    if (t0) { touchX = t0.clientX; touchY = t0.clientY; touchMoved = false; }
    var el = ev && ev.target;
    while (el && el.getAttribute && el.getAttribute('data-tr-presel') == null) el = el.parentNode;
    if (el && el.getAttribute && el.getAttribute('data-tr-presel') !== 'label' &&
        mode !== 'line' && ev.cancelable && ev.preventDefault) ev.preventDefault();
  }, { passive: false });

  /* 键盘可达（桌面无障碍）：空格/回车切换 */
  root.addEventListener('keydown', function (ev) {
    var el = ev && ev.target;
    if (!el || !el.getAttribute) return;
    var t = el.getAttribute('data-tool');
    if (t && (ev.key === 'Enter' || ev.key === ' ')) { if (ev.preventDefault) ev.preventDefault(); toolClicked(t, el); return; }
    var s = el.getAttribute('data-tr-drawstyle');
    if (s && (ev.key === 'Enter' || ev.key === ' ')) {
      if (ev.preventDefault) ev.preventDefault();
      drawStyle = s;
      if (mode !== 'line') mode = 'line';
      applyMode();
      return;
    }
    if (el.getAttribute('data-tr-presel') != null && (ev.key === 'Enter' || ev.key === ' ')) {
      if (ev.preventDefault) ev.preventDefault();
      toggleCell(el);
    }
  });

  /* ============================================================
     ⑥ 收尾：建工具栏、建预选行、给验收脚本留几个可读标记
     ============================================================ */
  qsa('[data-tr-block]').forEach(function (b) { if (!b.hasAttribute('data-tr-strokes')) b.setAttribute('data-tr-strokes', '0'); });
  buildPreselRows();
  mountToolbars();
  applyMode();

  /* 验收/自检用：页面脚本跑完后把这些挂在 window 上（不写 localStorage） */
  window.__TREND_PRESEL = sel;
  window.__TREND_DRAW = {
    mode: function () { return mode; },
    style: function () { return drawStyle; },     /* free / straight / dots */
    strokes: function () { return strokes; },
    count: function () {
      var n = 0; Object.keys(strokes).forEach(function (k) { n += strokes[k].length; });
      return n;
    },
    autoPreview: autoPreview,
    clear: clearStrokes
  };
})();
`;

/* ============================================================
   构建时锚点注入：把工具栏 / 预选行"种"进渲染内核产出的 HTML 里
   ------------------------------------------------------------
   ⚠️ 不改 trend-render.js / trend-mount.js（它们是别的窗口也在读的单一真源），
      这里只对【读进来的源码文本】做一次唯一字符串替换：
        · '<div class="tr-head">'   ← 每个彩种块一块工具栏
        · '<td class="tr-td-sep">'  ← 第二区（蓝球/后区）的预选格
        · '</tbody>'                ← 预选行插在 tbody 最上面
      每个锚点在源码里都必须【恰好出现 1 次】，否则直接抛错、不生成页面。
   ============================================================ */
function assertOne(src, needle, label) {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error(`注入锚点「${label}」在源码里出现了 ${n} 次（必须恰好 1 次）：${needle}`);
  return src;
}

export function injectMarkers(src) {
  let s = src;
  /* 工具栏：插在彩种块的 .tr-head 前面。
     ⚠️ 这个锚点在 trend-render.js 里【就在一段字符串拼接的中间】
        （L.push('<div class="tr-head">');），所以插进去的东西必须是
        同一行、且是合法 JS（' + esc(g.id) + '）——
        在这里换行会把那个字符串拆断，整页脚本直接语法错误（踩过）。 */
  const TOOL_ANCHOR = '<div class="tr-head">';
  const TOOL_FIX = '<div class="tr-preseltool" data-tr-preseltool="\' + esc(g.id) + \'"></div>' + TOOL_ANCHOR;
  assertOne(s, TOOL_ANCHOR, '彩种块头');
  s = s.split(TOOL_ANCHOR).join(TOOL_FIX);

  /* 第二区分隔列：只认【表体】那一处（表尾三行里也有 <td class="tr-td-sep">，
     所以锚点必须带上下面的循环头，保证全局唯一） */
  /* ⚠️ 【数据行不再注入预选格】——用户看到的症状是"第二区整体右移一格 + 每行多一大块空白"。
     原来这里把 __trPreselExtra(g) 拼进了数据行的分隔列：
       L.push('<td class="tr-td-sep">' + __trPreselExtra(g) + '</td>');
     而 __trPreselExtra(g) 返回的是【一串 td】：
       '<td class="tr-td-sep"></td>' + 16 个 '<td class="tr-td-presel...">'
     于是一串 td 被拼进了另一个 td 内部 → 浏览器自动闭合外层 td →
     每个数据行多出 1 个空 sep + 16 个可见空格子。
     实测：表头 52 列 / 预选行 52 列 / 数据行 69 列，
           第二区起点 表头 937 vs 数据行 957（右移 20px），一行多 396px 死白。
     而预选行的格子由 __trPreselRow(g) 内部自己拼（它已经调了一次
     __trPreselExtra(g)），本来就对 —— 数据行这次注入纯属多余。
     所以：这里只做【锚点存在性检查】，不再替换。 */
  const SEP_BODY = "L.push('<td class=\"tr-td-sep\"></td>');\n        for (let i = 0; i < exCols; i++) {";
  assertOne(s, SEP_BODY, '第二区分隔列（表体）');

  /* 预选行：把  L.push('<tbody>');   改成   L.push('<tbody>' + 预选行 + '</tbody>');
     ⚠️ 这里踩过两次坑（都是手写替换串惹的）：
        ① 替换串引号不成对 → 整页 SyntaxError，8 块全不渲染；
        ② 替换串里多写一个闭合 tbody → tbody 提前关闭，30 期数据行全被挤到
           表格外面、预选行也少一格（tbody 只剩 1 行），却一点报错都不抛。
        正确写法：两端单引号都必须带上，且中间不能再出现闭合 tbody。
        下面这一行 + assertInjected 里的断言就是为这两件事兜底的。 */
  /* 预选行：放到 tbody 的【最后一行】—— 用户 2026-10-17 要求
     「预选号放到最新开奖一期的下面」。表体顺序是【老 → 新】，最新一期在最后，
     所以预选行就排在它下面。
     ⚠️ 这一改同时修掉一个真 bug（实测出来的）：
        预选行原来插在 tbody 开头，而 trend-mount.js 的 map 是按【DOM 行号】建的、
        trTrendLines 的 y1 用的是【数据行号】—— 两者只在「数据行的 DOM 行号 ==
        数据行号」时才对齐。放在开头时数据行 0 的 DOM 行号是 1，导致每条走势线
        （含斜连）整体上移一行；放到最后之后，数据行 DOM 行号就是 0..N-1，天然对齐。
     ⚠️ 闭合 tbody 的字符串只能剩 1 处：老写法多补了一个 '</tbody>'，
        tbody 被提前关闭（数据行被挤到表格外、tbody 只剩 1 行，还不报错）。 */
  const TB = "'</tbody>'";
  assertOne(s, TB, '表体结尾');
  s = s.split(TB).join("__trPreselRow(g) + '</tbody>'");
  return s;
}

/* ============================================================
   自检：注入是"字符串手术"，错了会【静默】生成半截页面
   （真踩过：把模板里的 '</tbody>' 写丢一个引号，
     生成出来是 ... __trPreselRow(g) + '__trPreselRow(g) ... 拼串错位 →
     预选行一渲染就把 tbody 提前关掉，后面 30 期数据行全跑到表格外面，
     页面看着"只剩一行"，却一点报错都没有）。
   这里asssert 的是【结构上能静态判定】的那几件事；
   "到底渲染出几行几列"由真浏览器验收（必须 31 行 / 表头 52 列）兜底。
   ============================================================ */
export function assertInjected(src, original) {
  const n = (s, t) => s.split(t).length - 1;
  const checks = [
    /* src = 注入后的渲染内核（不含 INJECT_SRC 那段注入脚本） */
    [n(src, "__trPreselRow(g) + '</tbody>'") === 1,
      "预选行拼接串完整：__trPreselRow(g) + '</tbody>'（插在表体最后 = 最新一期下面）"],
    /* '</tbody>' 应恰好 1 处：只有 rows.forEach 之后原有那一句。
       老写法（插在 tbody 开头）会多补一个闭合标签 → tbody 提前关闭、
       数据行跑到表格外；少写一处（引号不成对）→ 整页 SyntaxError、8 块全不渲染。 */
    [n(src, "'</tbody>'") === 1, "闭合 tbody 字符串恰好 1 处（不再多补）"],
    [n(original, '<div class="tr-head">') === 1 && n(src, '<div class="tr-head">') === 1,
      '工具栏占位插在 tr-head 前（注入后锚点仍是 1 个）'],
    [n(src, '__trPreselRow(g)') === 1 && n(original, '__trPreselRow(g)') === 0,
      '__trPreselRow(g) 只在 tbody 那一处被调用'],
    /* 【数据行不再注入预选格】__trPreselExtra(g) 只属于预选行 —— 由 INJECT_SRC 里的
       __trPreselRow(g) 内部调用一次；注入后的【渲染源码】里应当是 0 处。
       （原来断言是 1 处，那 1 处正是把数据行撑成 69 列的元凶。） */
    [n(src, '__trPreselExtra(g)') === 0 && n(original, '__trPreselExtra(g)') === 0,
      '渲染源码里不调用 __trPreselExtra(g)（数据行不再多出预选格）'],
    [n(src, 'svg.tr-lines') === n(original, 'svg.tr-lines') && n(src, 'tr-line') === n(original, 'tr-line'),
      '原有走势连线代码一字未动'],
  ];
  const bad = checks.filter((c) => !c[0]).map((c) => c[1]);
  if (bad.length) throw new Error('注入自检失败：\n  - ' + bad.join('\n  - '));
  return true;
}

/* 页面里真正干活的注入脚本（运行时用模板拼出预选行 HTML）
   ⚠️ 这段必须是【合法 JS 字符串拼接】——所以整段写成模板字符串（可读），
      而不是塞在数组里双层转义。拼出来的代码形如：
        return '<tr class="tr-row-presel">' + '<td ...>预选</td>' + ...
      这些单引号都是"生成代码"里的引号，不是这里的引号。 */
const INJECT_SRC = `
/* ===== build-trend.mjs 注入：预选行（运行时拼 HTML） ===== */
function __trMainCells(g) {
  var o = [];
  for (var i = g.main.lo; i <= g.main.hi; i++) {
    /* 【预选行也印号数】用户 2026-10-17：预选行也印上该列号数（和数据行同一个 .tr-ghost），
       这样点选时能看出自己在选几号。选中后是实心球，球会把号数盖住（和数据行一致）。 */
    o.push('<td class="tr-td-presel tr-td-num" data-tr-presel="m" data-tr-key="' + (i - g.main.lo) + '" data-tr-hit="0">' +
      '<i class="tr-ghost">' + i + '</i></td>');
  }
  return o.join('');
}
function __trExtraCells(g) {
  var o = [];
  if (!g.extra) return '';
  for (var i = g.extra.lo; i <= g.extra.hi; i++) {
    o.push('<td class="tr-td-presel tr-td-num is-extra" data-tr-presel="x" data-tr-key="' + (i - g.extra.lo) + '" data-tr-hit="0">' +
      '<i class="tr-ghost">' + i + '</i></td>');
  }
  return o.join('');
}
var __TREND_PRESEL_ROW__ = '';
var __TREND_PRESEL_EXTRA__ = '';
function __trPreselRow(g) {
  return '<tr class="tr-row-presel tr-row" data-tr-issue="__presel__" data-tr-presel-row="' + g.id + '">' +
    '<td class="tr-td-issue tr-sticky tr-td-presel" data-tr-presel="label">预选</td>' +
    __trMainCells(g) + __trPreselExtra(g) + '<td class="tr-td-tail"></td></tr>';
}
function __trPreselExtra(g) {
  return g.extra ? ('<td class="tr-td-sep"></td>' + __trExtraCells(g)) : '';
}
`;

/* ⚠️ 说明：__TREND_PRESEL_ROW__ / __TREND_PRESEL_EXTRA__ 两个标记必须
   【在 renderTrendHtml 里面】求值（那里才有 g），所以注入点写成
   "\' + __trPreselRow(g) + \'" —— 上面那两个同名 var 只是给标记留个名字，
   实际拼 HTML 用的是 __trPreselRow(g) / __trPreselExtra(g) 两个函数。 */

export function appendInteract(renderSrc) {
  const s = injectMarkers(renderSrc);
  assertOne(s, '__trPreselRow(g)', '预选行运行时调用');
  /* 【数据行不再注入预选格】__trPreselExtra(g) 只属于【预选行】——
     它由 INJECT_SRC 里的 __trPreselRow(g) 内部调用一次（那段在后面才追加，
     不在这个 s 里）。注入后的渲染源码里应当是 0 处。
     ⚠️ 原来这里断言"恰好 1 处"，那 1 处正是被拼进数据行分隔列、
        把数据行撑成 69 列（表头只有 52）的元凶：
        一串 <td> 被拼进另一个 <td> 内部，浏览器自动闭合外层 td →
        每个数据行多 1 个空 sep + 16 个可见空格，第二区整体右移 20px。 */
  if (s.split('__trPreselExtra(g)').length - 1 !== 0) {
    throw new Error('渲染源码里不应出现 __trPreselExtra(g)（它只属于预选行，见 INJECT_SRC 的 __trPreselRow）');
  }
  assertInjected(s, renderSrc);
  return s + '\n' + INJECT_SRC;
}

/* ============================================================
   样式表：原独立页（已按用户要求删除）的那张 <style>（值一个字不改）
   ------------------------------------------------------------
   ⚠️ 从 2026-10-17 起走势图【不再有独立页面】——
      用户原话：「留在近30期走势预选参考里面. 删除单独走势图独立页」。
      这张表改由 export-static.mjs 内联进分享页的 <details class="ro-trend">，
      所以必须先过 scopeTrendCss() 收作用域：
      分享页里本来就有一份 .ro-wrap / .ro-top / .ro-status / .ro-foot / .btn，
      不加前缀会把【整个分享页】一起改掉（.ro-wrap 会把页面挤窄、
      html/body 那条会把分享页刷成另一个底色）。样式值本身一个字不动，
      所以走势图那一块的外观和独立页完全一致。
   ============================================================ */
const TREND_CSS = `
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

/* ① 顶部那排页面标签 —— 用户 2026-10-17 要求【整排删除】，这里不再有那排标签。
      原因：这一块会被分享页内联进折叠块里，
      在折叠块里点那两个跳转标签会跳出分享页、体验很怪；
      而只剩它自己那一个也没意义、还白占一行 → HTML 和样式一起删。
      ⚠️ 别复活：删掉后这块最上面第一个可见元素就是下面 ② 那行小字。 */

/* ② 页眉小字（原来那行绿色大标题也按用户要求删了，只留这行说明）
      上边距给足：顶部 Tab 和大标题都没了，这里就是首屏第一块内容 */
.ro-top { padding: 18px 12px 10px; text-align: center; }
.ro-top .sub { margin-top: 0; font-size: 12px; color: var(--ro-fg2); }

/* ③ 提示条（米黄底） */
.ro-status { margin: 0 0 14px; border-radius: 10px; padding: 12px 14px; font-size: 13px;
  line-height: 1.8; background: #fff6dd; border: 1px solid #ffe08a; color: var(--ro-fg2); }
.ro-status b { color: #7a5c00; }
/* 原 .ro-status .ro-st-time（那行红色时间）随用户 2026-10-17 的要求一起去掉 */

/* ④ 彩种切换条
   【触摸友好】用户 2026-10-17 反馈「手机版本点不动这些按钮」：
   根因是互动层为了防止补发 click 把 touch 补发的 click 挡掉了（见互动层 touchend），
   这里再补两条：touch-action: manipulation 关掉双击缩放的等待；
   去掉点击高亮 + 禁止选中文字。事件侧已经在互动层里自己处理触摸，见那里的注释。 */
.tr-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.tr-tab { flex: 0 0 auto; padding: 7px 13px; font-size: 13px; font-weight: 600;
  border-radius: 16px; text-decoration: none; color: var(--ro-fg2);
  background: var(--ro-card); border: 1px solid var(--ro-line);
  min-height: 32px; display: inline-flex; align-items: center; justify-content: center;
  box-sizing: border-box; cursor: pointer;
  touch-action: manipulation; -webkit-tap-highlight-color: transparent;
  user-select: none; -webkit-user-select: none; }
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
/* 斜连开关（挂到彩种切换条那一行的右端）
   【触摸友好】用户 2026-10-17 反馈「这里点不动」（手机上看走势图，点这个斜连键没反应）。
   干净环境实测这个键是好的（命中测试在最上层、真实鼠标点击能换档：差1 → 差1+隔号 → 关），
   所以手机上"点不动"十有八九是触摸被当成滑动/双击缩放吃掉了 —— 这一行是横向可滚动的彩种条，
   小圆点在手指稍微一动时就会判成滚动，click 直接不触发。所以：
     · touch-action: manipulation → 关掉双击缩放等待、让轻点立刻算点击
     · 加高到 34px、左右内边距加大 → 手指更容易命中
     · user-select:none + 关掉点击高亮 → 不会出现"选中文字"的干扰 */
.tr-slantbtn { margin-left: auto; flex: 0 0 auto; font-size: 11.5px; font-weight: 700;
  color: #8a7a63; background: #fdf6ea; border: 1px solid #e8d7bd;
  border-radius: 20px; padding: 0 12px; min-height: 34px; display: inline-flex;
  align-items: center; justify-content: center; box-sizing: border-box;
  text-decoration: none; cursor: pointer;
  touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; }
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

/* 行底色：体行默认白，隔一行淡米色。
   ⚠️ 这里原来写的是 nth-child(even) —— 加了【预选行】（tbody 第 1 行）之后
      整列后的白色会整体错一行，所以改成"体行默认白 + nth-child(odd) 淡米色"，
      第 1 行（预选行）不是 .tr-row，不参与，也就不会串行。 */
.tr-row td { background: #fffdf8; }
.tr-row:nth-child(odd) td { background: #fbf3e6; }
.tr-row:nth-child(odd) .tr-sticky { background: #fbf3e6; }
.tr-td-issue { height: 24px; line-height: 1.1; padding: 2px 4px !important; }
.tr-td-issue b { display: block; font-size: 11px; font-weight: 700; color: var(--ro-fg); }
.tr-td-issue i { display: block; font-style: normal; font-size: 9.5px; color: var(--ro-fg3); }
.tr-td-num { height: 24px; }
.tr-td-num.on { background: #d8efe2 !important; }
/* 【背景板号数】用户 2026-10-17：「背景板要有浅色 很浅的号数」
   ------------------------------------------------------------
   每个格子里印上该列的号数，颜色很浅 —— 这样看某一列是几号
   不用抬头看表头。命中格有绿球，号数隐掉让位给球（经典走势图画法，
   避免数字和球叠在一起显脏）。
   ⚠️ 号数是 <i class="tr-ghost">，pointer-events:none —— 不挡点击/连线测量。 */
.tr-td-num { text-align: center; vertical-align: middle; }
.tr-ghost { font-style: normal; font-weight: 400; font-size: 9.5px;
  line-height: 1; color: #ded1b9; user-select: none; pointer-events: none;
  letter-spacing: 0; }
.tr-td-extra .tr-ghost { color: #d7d9e2; }          /* 第二区（蓝球）偏冷一点 */
.tr-td-num.on .tr-ghost { visibility: hidden; }      /* 命中格让位给球 */
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

/* ⑪ 工具栏（用户 2026-10-17 要求：走势图页加一排工具按钮）
   ------------------------------------------------------------
   四个按钮：默认 / 画线 / 清空画线 / 自动衍生预选。
   ⚠️ 用 <div class="btn">，不是按钮标签 —— 页面不变量要求"裸按钮标签 = 0"。 */
.toolbar { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.toolbar .btn, .drawstyles .btn { padding:5px 10px; border-radius:8px; background:#fdf6ea;
  border:1px solid #e8d7bd; font-size:12px; color:#4a3a26; cursor:pointer; }
.toolbar .btn.active, .drawstyles .btn.active { background:#1a8c5a; color:#fff; border-color:#1a8c5a; }
.toolbar .btn.done { background:#e8f6ef; border-color:#b7e4cd; color:#1a8c5a; }
.tr-modehint { margin:-4px 0 10px; font-size:11.5px; color:var(--ro-fg3); line-height:1.7; }
/* 画法子档（自由 / 直线 / 逐点）：只在「画线」档显示，做小一圈别挤爆工具栏 */
.drawstyles { display:none; flex-wrap:wrap; align-items:center; gap:6px; margin:-4px 0 10px; }
.drawstyles.on { display:flex; }
.drawstyles-label { font-size:11.5px; color:var(--ro-fg3); }
.drawstyles .btn { padding:3px 9px; border-radius:999px; font-size:11.5px; }

/* ⑫ 预选行（表头下面第一行，格子里点一下就是选中/取消）
   ------------------------------------------------------------
   选中 = 金色实心球；未选 = 虚线空心。
   ⚠️ 预选行也是 <tr data-tr-issue> + 每格 data-tr-hit ——
      走势连线（drawTrendLines）会照旧量到它，连线不会被这行顶歪。 */
.tr-th-presel { color:#8a6a00; font-size:11px; font-weight:800; }
.tr-td-presel { height:24px; cursor:pointer; }
.tr-td-presel .num { display:inline-block; width:16px; height:16px; border-radius:50%;
  vertical-align:middle; box-sizing:border-box; }
.tr-td-presel .num.empty { border:1.5px dashed #c9b48c; background:transparent; }
.tr-td-presel .num.gold { background:#d9a300; border:1.5px solid #b8860b; }
.tr-td-presel.is-extra .num.empty { border-color:#a9c0ef; }
.tr-td-presel.is-extra .num.gold { background:#1f5fd6; border-color:#1a4cae; }

/* ⑬ 手画的线（SVG 覆盖层，画在自动走势连线上面）
   ------------------------------------------------------------
   ⚠️ 默认 pointer-events:none —— 不能挡住表格的横向滑动和点选。
      只有「画线」模式下由脚本改成 auto，画完/切回默认再改回 none。 */
svg.tr-lines-draw { position:absolute; top:0; left:0; pointer-events:none; z-index:2; }
svg.tr-lines-draw.on { pointer-events:auto; }
.tr-draw { stroke:#c0392b; stroke-width:2; fill:none; stroke-linecap:round; stroke-linejoin:round; }
.tr-dot { fill:#c0392b; stroke:#fff; stroke-width:1; }   /* 逐点档标的那个点 */
.tr-draw-line { position:absolute; top:0; left:0; pointer-events:none; z-index:2; }
/* 画线模式：手指拖动只画线，不滚动（否则线画不出来） */
.tr-block.tr-drawing .tr-scroll { touch-action:none; }

/* ⑧ 页脚 */
.ro-foot { margin: 0 2px; font-size: 11px; color: var(--ro-fg3); line-height: 1.9; }
@media (max-width: 420px) {
  .tr-block { padding: 10px 8px 8px; }
  .tr-td-tail, .tr-th-tail { display: none; }
}
`;

/* 唯一字符串替换 + 当场断言「恰好命中 1 次」。
   和 injectMarkers 的 assertOne 同一个思路：上游一改就构建失败，
   绝不静默生成半截页面。 */
function swapOnce(src, needle, repl, label) {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error(`内联适配锚点「${label}」命中 ${n} 次（必须恰好 1 次）：${needle}`);
  return src.split(needle).join(repl);
}

/* ============================================================
   给整张样式表加作用域前缀
   ------------------------------------------------------------
   ① :root / * / html, body / .ro-wrap 这 4 条不是「加前缀」能解决的，
      逐条显式改（见下面 ①②③④）
   ② 其余规则统一前缀 .ro-trend-embed（已经带前缀的整条跳过）
   ⚠️ 只动【选择器】：注释原样抄、声明体一个字不改、@media 递归进去处理。
   ============================================================ */
function mapSelectors(css, fn) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    /* 注释：原样抄（CSS 注释里带着 __LAYOUT__ 那类标记和设计说明，不能动） */
    if (css.startsWith('/*', i)) {
      const e = css.indexOf('*/', i + 2);
      const seg = css.slice(i, e < 0 ? n : e + 2);
      out += seg;
      i += seg.length;
      continue;
    }
    /* @media … { … }：prelude 原样、块内递归 */
    if (css[i] === '@') {
      const b = css.indexOf('{', i);
      if (b < 0) { out += css.slice(i); break; }
      let depth = 1, j = b + 1;
      while (j < n && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      out += css.slice(i, b + 1) + mapSelectors(css.slice(b + 1, j - 1), fn) + '}';
      i = j;
      continue;
    }
    /* 普通规则：{ 之前是选择器，到下一个 } 是声明体 */
    const b = css.indexOf('{', i);
    if (b < 0) { out += css.slice(i); break; }
    const e = css.indexOf('}', b);
    const bodyEnd = e < 0 ? n : e;
    out += fn(css.slice(i, b)) + css.slice(b, bodyEnd + 1);
    i = bodyEnd + 1;
  }
  return out;
}

export function scopeTrendCss(css) {
  let s = css;
  /* ① :root { --ro-* } → 挂到片段根上。
        这些变量本来就是继承的，收进片段后连「分享页改了同名变量」
        都影响不到走势图这一块（分享页自己也定义了 --ro-*）。 */
  s = swapOnce(s, ':root {', '.ro-trend-embed {', 'CSS :root');
  /* ② 全局重置：原来作用于独立页的整个文档，内联后会把分享页的字号一起改掉 */
  s = swapOnce(s,
    '* { box-sizing: border-box; -webkit-text-size-adjust: 100%; }',
    '.ro-trend-embed, .ro-trend-embed * { box-sizing: border-box; }',
    'CSS 全局重置');
  /* ③ html, body：内联后会给【整个分享页】设米杏底 + 去掉页边距。
        字体族/前景色保留（走势图这一块要和独立页同款），背景和 margin 丢掉。 */
  s = swapOnce(s,
    'html, body { margin: 0; background: var(--ro-bg); color: var(--ro-fg);\n' +
    '  font-family: "Microsoft YaHei", "PingFang SC", system-ui, -apple-system, sans-serif; }',
    '.ro-trend-embed { color: var(--ro-fg); font-family: "Microsoft YaHei", "PingFang SC", ' +
    'system-ui, -apple-system, sans-serif; }',
    'CSS html/body');
  /* ④ .ro-wrap：原独立页的最外层容器（也是分享页主容器的类名）。
        换成片段根，并把【独立页那份米杏底】给回来 —— 折叠块卡片本身是
        --ro-card（浅一档），这样走势图这一块和原来嵌在独立页里看到的一样，
        是「米杏面板 + 浅色卡片」，层次不会糊成一片。 */
  s = swapOnce(s,
    '.ro-wrap { max-width: 1180px; margin: 0 auto; padding: 0 12px 40px; }',
    '.ro-trend-embed { padding: 0 0 14px; background: var(--ro-bg); border-radius: 10px; }',
    'CSS .ro-wrap');
  /* ⑤ 其余规则统一加前缀（逗号分组逐个加；已经带前缀的跳过） */
  return mapSelectors(s, (sel) => sel.split(',').map((one) => {
    const t = one.trim();
    if (!t || t.startsWith('.ro-trend-embed')) return one;
    return ' .ro-trend-embed ' + t + ' ';
  }).join(','));
}

/* ① 根节点 id 统一加前缀：tr-root → ro-trend-root。
      分享页里没有 tr-root（实测逐个数过），但分享页自己一堆 #article /
      #mask / #owner-badge 之类的 id，加前缀是双保险。
      挂载层和互动层【各有一处】getElementById('tr-root')，都得跟着改：
      漏一处 = 块渲染不出来（挂载层拿到 null）或工具栏/预选行全不挂。 */
function renameRootId(src, label) {
  return swapOnce(src,
    "document.getElementById('tr-root')",
    "document.getElementById('ro-trend-root')",
    label);
}

/* ============================================================
   内联适配：挂载层里那几处「只有独立页才说得通」的东西
   ------------------------------------------------------------
   trend-mount.js 是别的窗口/别的验收脚本也在读的【单一真源】，
   所以【不改那个文件】—— 只对内联出来的这份文本做唯一字符串替换，
   上游一改（换个写法）就当场抛错，不会静默失效。
   ① <title> 那一句：独立页拿它当自检标记；内联后它会改掉【分享页】的标题
      → 换成折叠块要用的「补画连线」钩子（顺带把它挂出去给内联壳调用）
   ② 深链那一跳会把分享页滚回顶部：彩种切换条在页面中段，跳顶很难用
   ③ 不把 ?g=xxx 写回分享页地址栏（会把分享页自己的 hash / 参数弄丢）
   ============================================================ */
export function adaptMountForInline(src) {
  let s = src;
  s = swapOnce(s,
    "document.title = '走势图 OK · ' + TREND_DATA.games.length + '彩种/' + TREND_DATA.periods + '期';",
    '/* 内联版：不改分享页标题；改成「展开折叠块时补画连线」的钩子 */\n' +
    '  window.__roTrendRedraw = function () { drawAll(); if (curId) drawOne(curId); };',
    '挂载层 document.title');
  s = swapOnce(s,
    'if (window.scrollTo) { try { window.scrollTo(0, 0); } catch (e) {} }',
    '/* 内联版：不滚分享页 */',
    '挂载层 scrollTo');
  s = swapOnce(s,
    "window.history.replaceState(null, '', '?g=' + id);",
    '/* 内联版：不动分享页的地址栏 */',
    '挂载层 replaceState');
  return s;
}

/* ============================================================
   片段外壳：内联给分享页 <details class="ro-trend"> 的那一块
   ------------------------------------------------------------
   产物结构（export-static.mjs 插在 .ro-trend-body 里）：
     <style>  作用域收好的走势图样式  </style>
     <div class="ro-trend-embed">
       页眉小字 · 免责声明 · #ro-trend-root（渲染内核挂这里）· 页脚
     </div>
     <script> 数据快照 + 渲染内核 + 挂载 + 互动层 </script>

   ⚠️ 这里【没有】顶部那排页面标签（彩票推荐 / 竞彩·足球 / 走势图）——
      用户 2026-10-17 明确要求删掉；独立页时代就从 HTML 和样式里一起删了，
      内联版更不能加回来（那排标签在折叠块里点会跳出分享页）。
   ⚠️ 整段脚本包一层 IIFE：内联后和分享页【共用同一个 document / 全局】，
      不包的话 TREND_DATA / renderTrendHtml / trEsc / esc 这些名字会污染
      分享页的全局（分享页自己也有 esc / root / tabs 这类短名字）。
      对外的入口都带前缀：window.__roTrend（本块）/ window.__TREND_PRESEL
      · window.__TREND_DRAW（互动层自己挂的验收入口，原来就有）。
   ⚠️ 根节点 id 也带前缀：tr-root → ro-trend-root
      （分享页里 tr-root / ssq… 这些 id 实测均不存在，加前缀是双保险）。
   ============================================================ */
const EMBED_CLASS = 'ro-trend-embed';

export function renderTrendFragment(payload) {
  const updated = payload.updated || '';
  const N = payload.periods;
  const body = [
    '(function () {',
    '/* 走势图数据快照 —— 构建时生成并内嵌（本块唯一真数据） */',
    'var TREND_DATA = ' + JSON.stringify(payload) + ';',
    '',
    appendInteract(RENDER_SRC),
    '',
    renameRootId(adaptMountForInline(MOUNT_SRC), '挂载层根节点 id'),
    '',
    renameRootId(INTERACT_SRC, '互动层根节点 id'),
    '',
    '/* 验收 / 调试入口（带前缀，不和分享页的全局撞名） */',
    'window.__roTrend = {',
    '  data: TREND_DATA,',
    '  periods: TREND_DATA.periods,',
    '  render: renderTrendHtml,',
    '  redraw: function () { if (typeof window.__roTrendRedraw === "function") window.__roTrendRedraw(); }',
    '};',
    '',
    '/* ===== 内联版：折叠块展开时补画走势连线 =====',
    '   独立页整页一打开就是可见的，量得到每格坐标；',
    '   内联后 <details> 默认【收起】→ 里面的表格 getBoundingClientRect 全是 0，',
    '   挂载层会（按设计）跳过画线。所以这里在【展开时】补画一次。',
    '   锁定：不写 localStorage、不改地址栏、只在 open 时画。 */',
    '(function () {',
    '  var box = document.getElementById("ro-trend");',
    '  if (!box || !box.addEventListener) return;',
    '  var redraw = window.__roTrend.redraw;',
    '  box.addEventListener("toggle", function () { if (box.open) window.setTimeout(redraw, 30); });',
    '  if (box.open) redraw();',
    '})();',
    '})();'
  ].join('\n');

  /* ⚠️ 唯一一处转义：注入的脚本里含 '<script' 字面量（内核源码里确实有）。
      不转的话浏览器会按 HTML 的 script 数据状态规则提前结束脚本标签。 */
  const safeBody = body.split('<script').join('<\\/script');

  const markup = [
    '<div class="' + EMBED_CLASS + '" data-tr-embed="1" data-built="' + updated + '">',
    '  <div class="ro-top">',
    '    <div class="sub">走势图 · 8 个彩种 · 最近 ' + N + ' 期真实开奖</div>',
    '  </div>',
    '  <div class="ro-status">',
    '    <b>只看数据，不荐号。</b>下面每一格都是历史开奖记录，不预测、不保证。',
    '  </div>',
    '  <div id="ro-trend-root"></div>',
    '  <div class="ro-foot">',
    '    本块数据：构建时生成的快照（最近 ' + N + ' 期，页面自带、打开即用）· 页面零联网、不调 AI · 仅供娱乐参考，不构成购彩建议；未成年人不得购买彩票。',
    '  </div>',
    '</div>'
  ].join('\n');

  const out = '<style>\n' + scopeTrendCss(TREND_CSS) + '\n</style>\n' + markup +
    '\n<script>\n' + safeBody + '\n</script>';
  /* 内联后【不该出现】的东西在这里硬失败，不留到线上 */
  assertInlineFragment(out, '走势图内联片段');
  return out;
}

/* ============================================================
   自检（导出给 export-static.mjs 用 / 也能单独跑）
   ------------------------------------------------------------
   「内联后不能出现的东西」在这里硬失败，不留到线上：
     · 顶部那排页面标签（彩票推荐 / 竞彩·足球 / 走势图）
     · 「在新页面打开走势图」这类跳独立页的链接
     · 指向 走势图.html 的任何链接
   ============================================================ */
export function assertInlineFragment(html, label) {
  const bad = [
    [/class="top-tabs"/, '顶部那排页面标签（.top-tabs）'],
    [/href="走势图\.html"/, '指向 走势图.html 的链接'],
    [/在新页面打开走势图/, '「在新页面打开走势图」链接'],
    [/<iframe/i, 'iframe'],
    [/getElementById\('tr-root'\)/, '旧的根节点 id（tr-root 没加前缀）'],
    [/<\/script>[\s\S]*<\/script>/, '多余的 </script>']
  ];
  const hit = bad.filter((b) => b[0].test(html)).map((b) => b[1]);
  if (hit.length) throw new Error(`走势图片段自检失败（${label || '片段'}）：出现了 ${hit.join(' / ')}`);
  if (!html.includes('id="ro-trend-root"')) throw new Error('走势图片段自检失败：没有 id="ro-trend-root"');
  const pairs = html.split('<script').length - 1;
  const closes = html.split('</script>').length - 1;
  if (pairs !== closes) throw new Error(`走势图片段自检失败：<script> ${pairs} 个 / </script> ${closes} 个 不成对`);
  return true;
}
