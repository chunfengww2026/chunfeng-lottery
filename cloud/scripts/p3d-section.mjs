/* ============================================================
   p3d-section.mjs —— 「3D & 排列三 手绘参考图」区块（构建期生成 HTML）
   ------------------------------------------------------------
   为什么单独一个文件：
     · 让 export-static.mjs 只加两行（import + 插一个占位），改动最小
     · 以后要接到 App 的 3D 页，直接用同一个 builder
     · 数据在【构建期】算好并内联 → 页面运行时不需要分析器，JS 更小

   用户 2026-10-17 给的完整规格（逐条落地）：
     · markup：p3d-title(#p3dTitle) / p3d-sub(#p3dSub) / p3d-type-row /
               p3d-type-btn(data-p3d) / 洛书九宫 / 位连线图 / 012路 / 指标栏
     · CSS：p3d-type-row flex + p3d-type-btn flex:1 等分撑满（原样采用）
     · 状态：currentP3DType = '3d' | 'pl3'
     · P3D_TYPE_MAP：title 与 name 是两个不同字符串
     · LIUMA_RECOMMEND_MAP：六码按彩种分开
     · 算法：P3D_Analyzer（012路=num%3、形态、和值/和尾/跨度）—— 核对无误

   ⚠️ 我对用户原稿做的修正（都在真数据上验证过）：
     ① 数据：示例 3 期 → history.js 真开奖近 30 期
     ② 洛书：【开奖命中 .hit（金实心）】和【六码圈选 .pick（蓝虚线）】分开。
        用户原稿两者共用 .hit，且 highlight 里"先 remove 所有 .hit"
        → 开奖命中被抹掉（实测：开奖 [2,8,7] 里 7 不在六码内，标记直接消失）。
     ③ 洛书用【静态基盘 + 标命中】；项目 stats.js 另有按上期旋转的动态盘，
        两者概念不同，没混用。
     ④ 位连线：一次取行按索引（原稿每取一格都 querySelectorAll，60 期时 O(n²)）
     ⑤ resize：200ms 防抖 + 只重画 SVG 线（原稿无防抖且重渲染整表）
     ⑥ 标题/副标题：用 TYPE_MAP.title 做标题（"3D 手绘参考图"），
        副标题写真实信息（原稿那句"示例数据仅作画图练习"与实际不符）
     ⑦ 事件：addEventListener + dataset.p3d（照用户）；但 active 高亮交给
        render 统一维护，避免有别的入口改状态时高亮脱钩
   ============================================================ */

/* ---------- CSS（用户给的原样 + 我补的断点/洛书双色） ---------- */
export const P3D_CSS = `
/* ============ 3D & 排列三 手绘参考图（用户 2026-10-17 规格） ============ */
/* 【可折叠】用户要求「这里可折叠可展开，就写『手绘参考图』」：
   .p3d-section 从 <section> 改成 <details>（原生折叠，和其它块同一套做法）。
   入口行 = .p3d-head（左泛称 + 右「点击查看/收起」）；内容全在 .p3d-body 里。
   ⚠️ 手绘纸张质感那层底纹从 .p3d-section 挪到了 .p3d-body ——
      留在外层的话，收起时入口行也会铺满格子纸，和别的入口行不一致。 */
.p3d-section {
  margin: 0 12px 14px;
  background: var(--ro-card);
  border: 1px solid var(--ro-line);
  border-radius: 10px;
}
.p3d-head {
  /* 【标题居中】用户 2026-10-17：「手绘参考图」原来左对齐 → 居中
     （和晒票 / GPT模型摇号那两个折叠入口行是同一套居中做法）。
     做法：标题撑满整行 + text-align:center；右端「点击查看/收起」绝对定位，
     这样标题落在【整行】正中，而不是被右侧提示挤得偏左。 */
  position: relative;
  display: flex; align-items: center; justify-content: center;
  gap: 10px; padding: 12px 14px; cursor: pointer;
  list-style: none; user-select: none; text-align: center;
}
.p3d-head::-webkit-details-marker { display: none; }
.p3d-head::marker { content: ''; }
/* 标题左右各留 56px：正好避开右端「点击查看/收起」（4 字 ×12px ≈ 48px），窄屏不重叠 */
.p3d-head-t { flex: 1 1 auto; padding: 0 56px; text-align: center;
  font-size: 14px; font-weight: 600; color: var(--ro-fg); }
/* 副标题「（民间算法）」：小字、常规字重，跟在主标题后面（用户 2026-10-18 改的名）*/
.p3d-head-sub { font-style: normal; font-size: 12px; font-weight: 400;
  color: var(--ro-fg2); margin-left: 4px; }
.p3d-head-tip { position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
  font-size: 12px; font-weight: 400; color: var(--ro-ok); white-space: nowrap; }
.p3d-section[open] > .p3d-head .p3d-head-tip::after { content: '点击收起'; }
.p3d-section:not([open]) > .p3d-head .p3d-head-tip::after { content: '点击查看'; }
.p3d-body {
  padding: 0 12px 12px;
  /* 手绘纸张质感 */
  background-image:
    linear-gradient(rgba(232, 215, 189, 0.25) 1px, transparent 1px),
    linear-gradient(90deg, rgba(232, 215, 189, 0.25) 1px, transparent 1px);
  background-size: 22px 22px;
}
.p3d-title { text-align: center; font-size: 18px; font-weight: 800;
  color: var(--ro-fg); letter-spacing: 1px; margin-bottom: 4px; }
.p3d-sub { text-align: center; font-size: 12px; color: var(--ro-fg2); margin-bottom: 8px; }
/* 彩种切换 —— 用户给的 CSS：flex:1 等分撑满（不是居中胶囊） */
.p3d-type-row { display: flex; gap: 8px; padding: 0 12px 10px; }
.p3d-type-btn { flex: 1; text-align: center; padding: 7px 0; border-radius: 14px;
  font-size: 12px; font-weight: 700; background: #fdf6ea; border: 1px solid #e8d7bd;
  color: #8a7a63; cursor: pointer; transition: all 0.2s; }
.p3d-type-btn.active { background: #e3f2ea; border-color: #1a8c5a; color: #1a8c5a; }

.p3d-top, .p3d-bottom { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; margin-bottom: 14px; }
.p3d-bottom { grid-template-columns: 1.4fr 1fr; }
/* ⚠️ 用户 CSS 没有断点：430px 下两列会把 5 列的位连线图挤坏 */
@media (max-width: 620px) { .p3d-top, .p3d-bottom { grid-template-columns: 1fr; } }

.p3d-block { background: #fff; border: 1px solid var(--ro-line); border-radius: 8px; padding: 10px 8px; }
.p3d-block-title { font-size: 13px; font-weight: 700; color: var(--ro-fg);
  margin-bottom: 8px; text-align: center; }

.luoshu-wrap { display: flex; flex-direction: column; align-items: center; }
.luoshu-table { border-collapse: separate; border-spacing: 4px; margin: 0 auto; }
.luoshu-table td { width: 42px; height: 42px; text-align: center; vertical-align: middle;
  font-size: 20px; font-weight: 700; color: var(--ro-fg); background: var(--ro-card);
  border: 1px solid var(--ro-line); border-radius: 6px; }
/* 开奖命中：金色实心 */
.luoshu-table td.hit { background: #ffd54a; border: 2px solid #d9a300; color: #7a4a00;
  box-shadow: 0 0 6px rgba(217, 163, 0, 0.6); }
/* 六码圈选：蓝色虚线（和开奖命中分开，否则分不清也互相覆盖） */
.luoshu-table td.pick { border: 2px dashed var(--ro-link); color: var(--ro-link); }
.luoshu-table td.hit.pick { border: 2px solid #d9a300;
  box-shadow: 0 0 0 2px rgba(31, 95, 214, .45), 0 0 6px rgba(217, 163, 0, .6); }
.luoshu-zero { font-size: 11px; color: var(--ro-fg2); margin-top: 6px; }
/* 动态盘说明：标明本盘偏移量 + 由上期哪一期推得（"每期自动变化"看得见） */
.luoshu-tip { font-size: 10.5px; color: var(--ro-fg3); margin-top: 3px; }
.luoshu-zero.hit { color: var(--ro-danger); font-weight: 700; }
.luoshu-zero.pick { color: var(--ro-link); font-weight: 700; }
.luoshu-legend { display: flex; gap: 12px; justify-content: center; margin-top: 8px;
  font-size: 10.5px; color: var(--ro-fg2); }
.luoshu-legend i { display: inline-block; width: 11px; height: 11px; border-radius: 3px;
  margin-right: 4px; vertical-align: -1px; }
.luoshu-legend .k-hit { background: #ffd54a; border: 1px solid #d9a300; }
.luoshu-legend .k-pick { background: #fff; border: 1px dashed var(--ro-link); }

.pos-chart-wrap { position: relative; overflow-x: auto; }
.pos-table { border-collapse: collapse; font-size: 11px; width: 100%; }
.pos-table th, .pos-table td { border: 1px solid var(--ro-line-soft); padding: 5px 4px;
  text-align: center; white-space: nowrap; }
.pos-table th { background: var(--ro-sunken); color: var(--ro-fg); font-weight: 700;
  position: sticky; top: 0; z-index: 2; }
.pos-table td.issue { color: var(--ro-fg); font-weight: 700; }
.pos-table .ball { display: inline-block; width: 18px; height: 18px; line-height: 18px;
  border-radius: 50%; font-size: 10px; font-weight: 700; color: #fff; }
.pos-table .ball.p1 { background: var(--ro-danger); }
.pos-table .ball.p2 { background: var(--ro-link); }
.pos-table .ball.p3 { background: var(--ro-ok); }
.pos-lines { position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible; }

.road-table, .metric-table { border-collapse: collapse; font-size: 11px; width: 100%; }
.road-table th, .road-table td, .metric-table th, .metric-table td {
  border: 1px solid var(--ro-line-soft); padding: 5px 4px; text-align: center; white-space: nowrap; }
.road-table th, .metric-table th { background: var(--ro-sunken); color: var(--ro-fg); font-weight: 700; }
.road-table td.road-0 { color: var(--ro-danger); font-weight: 700; }
.road-table td.road-1 { color: var(--ro-ok); font-weight: 700; }
.road-table td.road-2 { color: var(--ro-link); font-weight: 700; }
.road-table td.road-combo { color: var(--ro-fg); font-weight: 700; background: #fff6dd; }
.metric-table td.shape-zuliu { color: var(--ro-ok); font-weight: 700; }
.metric-table td.shape-zusan { color: var(--ro-danger); font-weight: 700; }
.metric-table td.shape-baozi { color: #d9a300; font-weight: 700; }

.p3d-summary { display: flex; flex-wrap: wrap; gap: 10px 16px; justify-content: center;
  font-size: 11.5px; color: var(--ro-fg2); margin-top: 8px; }
.p3d-summary b { color: var(--ro-fg); }
.p3d-note { text-align: center; font-size: 11px; color: var(--ro-fg2); margin-top: 8px; }
.p3d-scroll { max-height: 420px; overflow-y: auto; }

/* ============ 六码推荐（用户 2026-10-17：建在分享页 → 同日并入「手绘参考图」） ============
   用户原话：「把这个推荐融合到手绘参考图里面去」。
   所以这里不再是一张独立卡片（原来 .lm-section 自带 margin/背景/边框/圆角）；
   改成「手绘参考图」块【内部】的一块区域：只留一点内边距 + 一条虚线分隔。
   下面的 .lm-title / .lm-row / .lm-ball 等样式原样继续用。 */
.lm-inner { padding: 0 0 8px; margin: 0 0 8px; border-bottom: 1px dashed var(--ro-line-soft); }
.lm-title { text-align: center; font-size: 15px; font-weight: 800; color: var(--ro-fg); }
.lm-sub { text-align: center; font-size: 11.5px; color: var(--ro-fg2);
  margin: 4px 0 8px; }
.lm-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 0; border-top: 1px dashed var(--ro-line-soft); }
.lm-row:first-of-type { border-top: none; }
.lm-k { flex: 0 0 40px; font-size: 12px; font-weight: 700; color: var(--ro-fg2); }
.lm-balls { display: flex; gap: 6px; flex-wrap: wrap; }
.lm-ball { display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%; font-size: 13px; font-weight: 800;
  color: #fff; font-variant-numeric: tabular-nums; }
.lm-gold { background: #d9a300; box-shadow: 0 0 0 2px #fff6dd; }
.lm-silver { background: #8a7a63; box-shadow: 0 0 0 2px #efe2cc; }
.lm-tuo { background: var(--ro-ok); }
.lm-none { font-size: 11.5px; color: var(--ro-fg3); }
.lm-count { margin-left: auto; font-size: 11.5px; color: var(--ro-fg2); }
`;

/* ---------- 运行时的渲染脚本（数据已在构建期算好并内联） ---------- */
const P3D_JS = `
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var LUOSHU = P3D_SECTION.luoshu;
  var TYPE_MAP = P3D_SECTION.typeMap;
  var LIUMA_MAP = P3D_SECTION.liuMaMap;
  var DRAWS = P3D_SECTION.data;
  var META = P3D_SECTION.meta;
  var COLORS = ['#c0392b', '#1f5fd6', '#1a8c5a'];
  var currentP3DType = '3d';
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }
  function liuMaSetOf(key) {
    var rec = LIUMA_MAP[key] || {}, raw = [], seen = {}, out = [];
    if (rec.goldDan != null) raw.push(rec.goldDan);
    if (rec.silverDan != null) raw.push(rec.silverDan);
    (rec.tuoList || []).forEach(function (n) { raw.push(n); });
    raw.forEach(function (n) {
      var v = Number(n);
      if (v >= 0 && v <= 9 && !seen[v]) { seen[v] = 1; out.push(v); }
    });
    return out.sort(function (a, b) { return a - b; });
  }
  function paintTypeRow() {
    Array.prototype.slice.call(document.querySelectorAll('#p3dTypeRow .p3d-type-btn')).forEach(function (el) {
      var on = el.getAttribute('data-p3d') === currentP3DType;
      el.className = 'p3d-type-btn' + (on ? ' active' : '');
    });
  }
  function renderLuoshu(meta, liuSet) {
    var hitMap = meta.luoshuLast.cells || {}, html = '', r, c, v, cls;
    /* 【动态盘】用户 2026-10-17 定：不再用静态基盘，改用 stats.js 那套
       「输入上期开奖号、每期自动生成不同图表数据」——盘面整体按 offset 偏移。
       ⚠️ 所以这里的数字要从 meta.luoshuLast.grid 取，不能再用静态 LUOSHU；
          用静态的话命中格会全错（盘面都换了）。 */
    var grid = (meta.luoshuLast && meta.luoshuLast.grid) || LUOSHU;
    for (r = 0; r < grid.length; r++) {
      html += '<tr>';
      for (c = 0; c < grid[r].length; c++) {
        v = grid[r][c]; cls = [];
        if (hitMap[r + ',' + c]) cls.push('hit');
        if (liuSet[v]) cls.push('pick');
        html += '<td class="' + cls.join(' ') + '">' + v + '</td>';
      }
      html += '</tr>';
    }
    $('luoshuTable').innerHTML = html;
    var z = $('luoshuZero');
    var zeroHit = meta.luoshuLast.zero, zeroPick = !!liuSet[0];
    z.className = 'luoshu-zero' + (zeroHit ? ' hit' : '') + (zeroPick ? ' pick' : '');
    z.textContent = zeroHit ? '外置 0 号：【0】' : (zeroPick ? '外置 0 号（六码含 0）' : '0 单独外置');
    /* 标明这是动态盘：偏移量 + 由上期哪一期推得（让"每期不同"这件事看得见） */
    var tip = $('luoshuTip');
    if (tip) {
      var off = meta.luoshuLast.offset;
      tip.textContent = '本盘偏移 ' + (off == null ? '-' : off) +
        (meta.luoshuLast.prevIssue ? ' · 由上期 ' + meta.luoshuLast.prevIssue + ' 推得' : '') +
        ' · 每期自动变化';
    }
  }
  function renderTables(draws) {
    $('posTableBody').innerHTML = draws.map(function (d) {
      return '<tr><td class="issue">' + esc(d.issue) + '</td><td>' + d.bai + d.shi + d.ge + '</td>' +
        '<td><span class="ball p1">' + d.bai + '</span></td>' +
        '<td><span class="ball p2">' + d.shi + '</span></td>' +
        '<td><span class="ball p3">' + d.ge + '</span></td></tr>';
    }).join('');
    $('roadTableBody').innerHTML = draws.map(function (d) {
      return '<tr><td class="issue">' + esc(d.issue) + '</td><td>' + d.bai + d.shi + d.ge + '</td>' +
        '<td class="road-' + d.roadBai + '">' + d.roadBai + '</td>' +
        '<td class="road-' + d.roadShi + '">' + d.roadShi + '</td>' +
        '<td class="road-' + d.roadGe + '">' + d.roadGe + '</td>' +
        '<td class="road-combo">' + d.roadStr + '</td></tr>';
    }).join('');
    var shapeCls = { '组六': 'shape-zuliu', '组三': 'shape-zusan', '豹子': 'shape-baozi' };
    $('metricTableBody').innerHTML = draws.map(function (d) {
      return '<tr><td>' + d.sum + '</td><td>' + d.sumTail + '</td><td>' + d.span +
        '</td><td class="' + (shapeCls[d.shape] || '') + '">' + d.shape + '</td></tr>';
    }).join('');
  }
  function drawPosLines() {
    var svg = $('posLines'), table = $('posTable');
    if (!svg || !table || !table.getBoundingClientRect) return 0;
    var box = table.getBoundingClientRect();
    if (!box.width || !box.height) return 0;
    var trs = Array.prototype.slice.call(table.querySelectorAll('tbody tr')), map = {};
    trs.forEach(function (tr, ri) {
      Array.prototype.slice.call(tr.children).forEach(function (td, ci) {
        var ball = td.querySelector ? td.querySelector('.ball') : null;
        if (!ball) return;
        var b = ball.getBoundingClientRect();
        if (!b.width) return;
        map[ri + ',' + ci] = { x: b.left - box.left + b.width / 2, y: b.top - box.top + b.height / 2 };
      });
    });
    if (!Object.keys(map).length) return 0;
    svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
    svg.style.width = box.width + 'px'; svg.style.height = box.height + 'px';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var n = 0;
    [2, 3, 4].forEach(function (colIdx, posIdx) {
      var prev = null;
      trs.forEach(function (tr, ri) {
        var p = map[ri + ',' + colIdx];
        if (!p) { prev = null; return; }
        if (prev) {
          var el = document.createElementNS(NS, 'line');
          el.setAttribute('x1', prev.x.toFixed(1)); el.setAttribute('y1', prev.y.toFixed(1));
          el.setAttribute('x2', p.x.toFixed(1)); el.setAttribute('y2', p.y.toFixed(1));
          el.setAttribute('stroke', COLORS[posIdx]); el.setAttribute('stroke-width', '1.5');
          el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-opacity', '0.75');
          svg.appendChild(el); n++;
        }
        prev = p;
      });
    });
    return n;
  }
  /* 【六码推荐】渲染（用户 2026-10-17：建在分享页，与手绘图同步）
     ⚠️ 这里没有自己的彩种状态 —— 直接用 currentP3DType，两块永远一致。 */
  function renderLiuMa(key) {
    var rec = LIUMA_MAP[key] || {};
    var setArr = liuMaSetOf(key);
    var balls = function (list, cls) {
      return list.map(function (n) { return '<span class="lm-ball ' + cls + '">' + n + '</span>'; }).join('');
    };
    var gold = rec.goldDan == null ? [] : [rec.goldDan];
    var silver = rec.silverDan == null ? [] : [rec.silverDan];
    var tuo = rec.tuoList || [];
    $('lmBody').innerHTML =
      '<div class="lm-row"><span class="lm-k">金胆</span><span class="lm-balls">' +
        (gold.length ? balls(gold, 'lm-gold') : '<span class="lm-none">未给</span>') + '</span></div>' +
      '<div class="lm-row"><span class="lm-k">银胆</span><span class="lm-balls">' +
        (silver.length ? balls(silver, 'lm-silver') : '<span class="lm-none">未给</span>') + '</span></div>' +
      '<div class="lm-row"><span class="lm-k">拖码</span><span class="lm-balls">' +
        (tuo.length ? balls(tuo, 'lm-tuo') : '<span class="lm-none">未给</span>') +
        '</span><span class="lm-count">共 ' + setArr.length + ' 个号</span></div>';
    /* 六码推荐自己的按钮高亮 */
    Array.prototype.slice.call(document.querySelectorAll('#lmTypeRow .p3d-type-btn')).forEach(function (el) {
      var on = el.getAttribute('data-lm') === key;
      el.className = 'p3d-type-btn' + (on ? ' active' : '');
    });
  }

  function renderP3D() {
    var key = currentP3DType, meta = META[key], draws = DRAWS[key] || [];
    var setArr = liuMaSetOf(key), liuSet = {}, rec = LIUMA_MAP[key] || {};
    setArr.forEach(function (n) { liuSet[n] = 1; });
    $('p3dTitle').textContent = TYPE_MAP[key].title;
    $('p3dSub').textContent = '近 ' + meta.periods + ' 期真开奖 · 期号 ' + meta.first + ' → ' + meta.last +
      ' · 每期只填 3 个号码 | 圈号 + 连线 + 标路数';
    paintTypeRow();
    renderLiuMa(key);          /* 【六码推荐】和手绘图共用同一个彩种状态，一起重画 */
    renderLuoshu(meta, liuSet);
    renderTables(draws);
    var sc = meta.shapeCount;
    $('p3dSummary').innerHTML =
      '<span>形态分布：<b>' + sc['组六'] + '</b> 组六 · <b>' + sc['组三'] + '</b> 组三 · <b>' + sc['豹子'] + '</b> 豹子</span>' +
      '<span>和值 <b>' + meta.sumRange[0] + '~' + meta.sumRange[1] + '</b></span>' +
      '<span>跨度 <b>' + meta.spanRange[0] + '~' + meta.spanRange[1] + '</b></span>';
    $('p3dLiuma').innerHTML = '六码推荐：金胆 <b>' + rec.goldDan + '</b> · 银胆 <b>' + rec.silverDan +
      '</b> · 拖码 ' + (rec.tuoList || []).join(',') + '　（共 ' + setArr.length + ' 个号）';
    return drawPosLines();
  }
  Array.prototype.slice.call(document.querySelectorAll('#p3dTypeRow .p3d-type-btn')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset ? btn.dataset.p3d : btn.getAttribute('data-p3d');
      if (!TYPE_MAP[key] || key === currentP3DType) return;
      currentP3DType = key;
      renderP3D();
    });
  });
  /* 【六码推荐】的彩种按钮：走公开接口 window.P3DChart.switchTo(type)
     —— 就是用户给的 switchLiuyuan(type) 里那一行的写法。
     switchTo 内部会 renderP3D()，从而把六码推荐和手绘图一起刷新。 */
  Array.prototype.slice.call(document.querySelectorAll('#lmTypeRow .p3d-type-btn')).forEach(function (el) {
    el.addEventListener('click', function () {
      var key = el.getAttribute('data-lm');
      if (window.P3DChart) window.P3DChart.switchTo(key);
    });
  });

  renderP3D();

  /* 【折叠 → 展开时必须重画位连线】
     收起时内容没有布局，drawPosLines() 量到的宽高全是 0（它开头就是「拿不到宽度直接 return 0」），
     所以初始化那次画不出来；打开这一下不会触发 resize，
     不在 toggle 里补画的话，位连线图会一直是空的。 */
  var p3dSec = document.getElementById('p3dSection');
  if (p3dSec && p3dSec.addEventListener) {
    p3dSec.addEventListener('toggle', function () {
      setTimeout(function () { try { drawPosLines(); } catch (e) { /* 忽略 */ } }, 30);
    });
  }

  /* ============================================================
     对外接口 —— 给「六码推荐」之类的外部模块同步手绘图用
     ------------------------------------------------------------
     用户 2026-10-17 给的用法是：
       function switchLiuyuan(type) {
         ...六码推荐自己的渲染...
         currentP3DType = type;                                   // ← 直接改我的内部变量
         document.querySelectorAll('.p3d-type-btn').forEach(b => {
           b.classList.toggle('active', b.dataset.p3d === type);
         });
         renderP3D();
       }

     ⚠️ 这个写法有三处会出问题，所以改成走公开接口：
       ① currentP3DType 是我这个 IIFE 里的局部变量。外部函数在别的
          作用域里赋值，只会创建一个【新的全局变量】或改到别人同名变量，
          我这边的 currentP3DType 根本不会变 —— 图表不动，
          排查起来还很难看出原因（典型的隐式全局踩坑）。
       ② 外部直接调 renderP3D() 也不行：它同样在 IIFE 内，外部拿不到。
       ③ 没有【非法值防护】：万一传进来 'ssq' / undefined，
          renderP3D 里 TYPE_MAP[key].title 会直接抛 TypeError，
          整块图空白（用户看到的是"图没了"，不是报错）。
       ④ 用全局 .p3d-type-btn 选择器：同一页出现第二块时会互相干扰。

     所以这里暴露一个带校验的接口。外部只需：
       window.P3DChart.switchTo('pl3')      // 返回 true=成功，false=彩种不支持
       window.P3DChart.current()            // '3d' | 'pl3'
       window.P3DChart.types()              // ['3d','pl3']
     ============================================================ */
  window.P3DChart = {
    switchTo: function (key) {
      /* 非法彩种/空值一律拒绝，绝不让 renderP3D 拿到不存在的 key */
      if (!key || !Object.prototype.hasOwnProperty.call(TYPE_MAP, key)) return false;
      if (key === currentP3DType) return true;      /* 已经是这个彩种，幂等 */
      currentP3DType = key;
      renderP3D();                                  /* 内部会 paintTypeRow() 同步按钮高亮 */
      return true;
    },
    current: function () { return currentP3DType; },
    types: function () { return Object.keys(TYPE_MAP); },
    /* 让外部能判断图表是否已就绪（比如在它自己的 DOM 之前被调用） */
    ready: function () { return !!document.getElementById('p3dSection'); }
  };

  /* 顺手暴露给六码推荐那种"先渲染自己再同步别人"的典型调用姿势：
     外部这样写就够了 ——
       function switchLiuyuan(type) {
         ...六码推荐自己的渲染...
         if (window.P3DChart) window.P3DChart.switchTo(type);
       }
     （不用去碰 .p3d-type-btn 的高亮，switchTo 内部会同步） */

  var rz = null;
  window.addEventListener('resize', function () {
    if (rz) clearTimeout(rz);
    rz = setTimeout(drawPosLines, 200);
  });
})();
`;

/* ---------- 构建区块 HTML ---------- */
/**
 * @param {object} HIST history.js 的 DRAW_HISTORY
 * @param {object} P3D   p3d-analyzer.js 的内核
 * @param {object} o    { periods, luoMaMap, typeMap }
 * @returns {string}    没有数据时返回 ''（绝不渲染空壳）
 */
export function buildP3DSectionHtml(HIST, P3D, o) {
  const opt = o || {};
  const PERIODS = opt.periods == null ? 30 : opt.periods;
  const TYPE_MAP = opt.typeMap || {
    '3d': { title: '3D 手绘参考图（民间算法）', name: '福彩3D' },
    'pl3': { title: '排列三 手绘参考图（民间算法）', name: '排列三' }
  };
  const LIUMA_MAP = opt.liuMaMap || {
    '3d': { goldDan: 5, silverDan: 2, tuoList: [0, 1, 3, 4] },
    'pl3': { goldDan: 4, silverDan: 7, tuoList: [1, 2, 5, 6] }
  };

  const data = {}, meta = {};
  [['3d', 'fc3d'], ['pl3', 'pl3']].forEach(([key, histId]) => {
    const rows = ((HIST && HIST.games && HIST.games[histId]) || []).slice(0, PERIODS)
      .map((r) => ({ issue: r.issue, date: r.date, nums: (r.areas || {}).main }))
      .filter((r) => Array.isArray(r.nums) && r.nums.length >= 3)
      .reverse();
    if (!rows.length) return;
    const res = P3D.analyze(rows);
    data[key] = res.draws.map((d) => ({
      issue: d.issue, bai: d.bai, shi: d.shi, ge: d.ge,
      sum: d.sum, sumTail: d.sumTail, span: d.span, shape: d.shape,
      roadBai: d.roadBai, roadShi: d.roadShi, roadGe: d.roadGe, roadStr: d.roadStr
    }));
    meta[key] = {
      name: TYPE_MAP[key].name, periods: res.periods,
      first: res.first, last: res.last,
      shapeCount: res.shapeCount, sumRange: res.sumRange, spanRange: res.spanRange,
      luoshuLast: res.luoshuLast
    };
  });

  const keys = Object.keys(data);
  if (!keys.length) return '';       /* 没数据 → 整块不渲染，绝不放假数据 */

  const payload = {
    typeMap: TYPE_MAP, liuMaMap: LIUMA_MAP, luoshu: P3D.LUOSHU,
    data, meta
  };

  return `<details class="p3d-section" id="p3dSection">` +
    /* 【可折叠】用户要求：「这里可折叠可展开，就写『手绘参考图』」。
       入口行 = 泛称 + 括注小字「手绘参考图（民间算法）」（2026-10-18 改名）；
       里面 #p3dTitle 仍然是按彩种的标题
       （「3D 手绘参考图」/「排列三 手绘参考图」）——它由脚本按彩种切换，
       验收脚本也在断言它，所以保留。 */
    `<summary class="p3d-head">` +
      `<span class="p3d-head-t">手绘参考图<i class="p3d-head-sub">（民间算法）</i></span>` +
      `<span class="p3d-head-tip" aria-hidden="true"></span>` +
    `</summary>` +
    `<div class="p3d-body">` +
    `<div class="p3d-title" id="p3dTitle"></div>` +
    `<div class="p3d-sub" id="p3dSub"></div>` +
    `<div class="p3d-type-row" id="p3dTypeRow">` +
      `<div class="p3d-type-btn active" data-p3d="3d">${TYPE_MAP['3d'].name}</div>` +
      `<div class="p3d-type-btn" data-p3d="pl3">${TYPE_MAP['pl3'].name}</div>` +
    `</div>` +
    /* 【六码推荐 · 已并进来】用户 2026-10-17 截图 + 原话：「把这个推荐融合到手绘参考图里面去」。
       原来它是【外面并列的一个独立卡片】（.lm-section，自带标题 + 自己那排彩种按钮），
       现在放进 .p3d-body 里、跟着上面这一排 #p3dTypeRow 的彩种走 —— 不再有两个一模一样的切换条。
       ⚠️ id 保持 lmSection / lmBody：脚本 renderLiuMa() 就是往 #lmBody 里填金胆/银胆/拖码，
          它在 renderP3D() 里被调用，所以切彩种时六码和手绘图一起重画（本来就是共用一个状态）。
       ⚠️ 原来那排 data-lm 按钮已删除；renderLiuMa 里对 #lmTypeRow 的高亮查询会返回空数组，无害。 */
    `<div class="lm-inner" id="lmSection">` +
      `<div class="lm-title">六码推荐</div>` +
      `<div class="lm-sub">金胆 · 银胆 · 拖码 —— 共 6 个号（圈在下面的洛书九宫里）</div>` +
      `<div id="lmBody"></div>` +
    `</div>` +
    `<div class="p3d-top">` +
      `<div class="p3d-block"><div class="p3d-block-title">洛书九宫图</div>` +
        `<div class="luoshu-wrap"><table class="luoshu-table" id="luoshuTable"></table>` +
        `<div class="luoshu-zero" id="luoshuZero">0 单独外置</div>` +
        `<div class="luoshu-tip" id="luoshuTip"></div>` +
        `<div class="luoshu-legend"><span><i class="k-hit"></i>本期开奖命中</span>` +
        `<span><i class="k-pick"></i>六码圈选</span></div></div></div>` +
      `<div class="p3d-block"><div class="p3d-block-title">百/十/个位连线图</div>` +
        `<div class="pos-chart-wrap p3d-scroll">` +
        `<table class="pos-table" id="posTable">` +
        `<thead><tr><th>期号</th><th>奖号</th><th>百位</th><th>十位</th><th>个位</th></tr></thead>` +
        `<tbody id="posTableBody"></tbody></table>` +
        `<svg class="pos-lines" id="posLines"></svg></div></div>` +
    `</div>` +
    `<div class="p3d-bottom">` +
      `<div class="p3d-block"><div class="p3d-block-title">012路分区</div><div class="p3d-scroll">` +
        `<table class="road-table"><thead><tr><th>期号</th><th>奖号</th><th>百位路</th><th>十位路</th>` +
        `<th>个位路</th><th>路组合</th></tr></thead><tbody id="roadTableBody"></tbody></table></div></div>` +
      `<div class="p3d-block"><div class="p3d-block-title">指标记录栏</div><div class="p3d-scroll">` +
        `<table class="metric-table"><thead><tr><th>和值</th><th>和尾</th><th>跨度</th><th>形态</th></tr></thead>` +
        `<tbody id="metricTableBody"></tbody></table></div></div>` +
    `</div>` +
    `<div class="p3d-summary" id="p3dSummary"></div>` +
    `<div class="p3d-note" id="p3dLiuma"></div>` +
    `</div>` +
    `</details>` +
    `<script>var P3D_SECTION = ${JSON.stringify(payload)};<\/script>` +
    `<script>${P3D_JS}<\/script>`;
}
