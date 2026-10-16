/* ============================================================
   trend-mount.js —— 走势图页面的挂载 + 彩种切换
   ------------------------------------------------------------
   被 build-trend.mjs 内嵌进页面 <script>（readText 后注入），
   所以这里是普通脚本（无 import/export）。
   依赖页面里先有：TREND_DATA、renderTrendHtml。
   ============================================================ */
(function () {
  var root = document.getElementById('tr-root');
  root.innerHTML = renderTrendHtml(TREND_DATA);

  /* querySelectorAll 返回的是 NodeList，只有 forEach 没有 some/filter/slice。
     最初直接写 tabs.some(...) → 带 ?g= 深链时抛
     "tabs.some is not a function"，后面的"隐藏其它块 / 写标题"全没执行，
     表现成"深链失效、8 块全露"（实测踩过）。统一转成真数组。 */
  var toArr = function (nl) { return Array.prototype.slice.call(nl); };

  /* ============================================================
     【走势连线】把同一个号码跨期的绿点连起来
     ------------------------------------------------------------
     用户 2026-10-17 要求：「加走势连线」，先做双色球 + 大乐透。
     为什么放在挂载层而不是渲染层：
       连线要靠【真实单元格坐标】才能画准（吸住的期号列、每列宽度、
       手机上的缩放都会影响）。渲染层只出纯 HTML，量不到坐标；
       这里先用 getBoundingClientRect 量出每格中心，再画 SVG。
     ⚠️ 取不到坐标的环境（迷你 DOM 验收脚本里 rect 全是 0）→ 直接跳过，
        绝不因此抛异常。连线的【数据】另在 trend-render.js 里算，
        那部分是纯函数、能脱离浏览器单测。
     ============================================================ */

  /* ============================================================
     【走势连线】把同一个号码跨期的绿点连起来
     ------------------------------------------------------------
     用户 2026-10-17 要求：「加走势连线」，先做双色球 + 大乐透。
     为什么放在挂载层而不是渲染层：
       连线要靠【真实单元格坐标】才能画准（吸住的期号列、每列宽度、
       手机缩放都会影响）。渲染层只出纯 HTML，量不到坐标；
       这里先量出每格中心，再画 SVG 覆盖层。
     ⚠️ 量不到坐标就直接跳过（迷你 DOM 验收里 rect 全是 0），绝不抛异常、
        也绝不靠公式猜坐标 —— 宁可这条线不画，也不画错位置。
     ⚠️ 哪些号要连、连哪几期，是 trend-render.js 里的【纯函数】算的，
        那部分能脱离浏览器单测。
     ============================================================ */
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ============================================================
     【斜连】用户给了两条规则：
       ① 普通斜连：|a-b| = 1（相邻期）
       ② 隔号斜连：隔 gap 期、|a-b| = gap，且【中间期没开过这个方向的号】
          （001开1 → 002开2 → 003空 → 004开4 才算；中间开过就不算）
     ⚠️ 实测量级（30 期真实数据）：
         宽松版（不查中间）  双色球 573 / 快乐8 3477 条 → 糊
         严格版（隔号）      双色球 107 / 快乐8  471 条 → 能用
       所以做三档，默认【只画差1】：
         off   = 不画
         slant = 只画差 1（默认）
         gap   = 差 1 + 隔号斜连
     ============================================================ */
  var SLANT_MODES = ['off', 'slant', 'gap'];
  var SLANT_LABEL = { off: '斜连：关', slant: '斜连：差1', gap: '斜连：差1+隔号' };
  var slantMode = 'slant';

  function drawTrendLines(block) {
    var gid = block.getAttribute("data-tr-block");
    var game = null;
    (TREND_DATA.games || []).forEach(function (g) { if (g.id === gid) game = g; });
    if (!game) return 0;

    var table = block.querySelector("[data-tr-table]");
    if (!table || !table.querySelectorAll || !table.getBoundingClientRect) return 0;
    var box = table.getBoundingClientRect();
    if (!box || !box.width || !box.height) return 0;   /* 量不到 → 跳过 */

    /* 先清掉上一次画的覆盖层：切换彩种/切换斜连都会重画，不清就会越叠越多层。 */
    if (block.querySelectorAll) {
      toArr(block.querySelectorAll("svg.tr-lines")).forEach(function (old) {
        if (old.parentNode && old.parentNode.removeChild) old.parentNode.removeChild(old);
      });
    }

    /* ① 量每一行的号码格中心。只存量得到的格子（宽高为 0 的一律不算），
         所以后面查不到就是查不到 → 跳过，不用任何公式猜。 */
    var trs = toArr(table.querySelectorAll("[data-tr-issue]"));
    var map = {};
    trs.forEach(function (tr, ri) {
      toArr(tr.querySelectorAll("[data-tr-hit]")).forEach(function (td, ci) {
        var r = td.getBoundingClientRect();
        if (!r || !r.width || !r.height) return;
        map[ri + "," + ci] = {
          x: r.left - box.left + r.width / 2,
          y: r.top - box.top + r.height / 2
        };
      });
    });
    if (!Object.keys(map).length) return 0;

    /* ② 算连线数据（纯函数）。extra 区在主场号码之后，中间隔 1 列分隔列。 */
    var data = trTrendLines(TREND_DATA, gid);
    if (!data) return 0;
    var mainCols = game.main.hi - game.main.lo + 1;
    var colOf = function (line) {
      if (line.cls === "extra") return mainCols + 1 + (line.n - game.extra.lo);
      return line.n - game.main.lo;
    };

    /* ③ 画：每条线是一串竖线；相邻两期都有 → 实线，断开的 → 短线头 */
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "tr-lines");
    svg.setAttribute("data-tr-lines", gid);
    svg.setAttribute("width", String(box.width));
    svg.setAttribute("height", String(box.height));
    svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
    svg.setAttribute("aria-hidden", "true");

    var segCount = 0;
    data.main.concat(data.extra).forEach(function (line) {
      var ci = colOf(line);
      line.segs.forEach(function (sg) {
        var a = map[Math.floor(sg.y1) + "," + ci];
        var b = map[Math.ceil(sg.y2 - 1) + "," + ci];
        if (!a || !b) return;          /* 缺一格就不画这一段，不猜 */
        var el = document.createElementNS(SVGNS, "line");
        el.setAttribute("x1", a.x.toFixed(1));
        el.setAttribute("y1", a.y.toFixed(1));
        el.setAttribute("x2", b.x.toFixed(1));
        el.setAttribute("y2", b.y.toFixed(1));
        el.setAttribute("class", "tr-line tr-line-" + line.cls + (sg.solid ? "" : " tr-line-gap"));
        svg.appendChild(el);
        segCount++;
      });
    });

    /* ③b 斜连（用户规则：|a-b| === 相隔期数）。用不同颜色区分开。 */
    if (slantMode !== "off") {
      var sl = trSlantFor(TREND_DATA, gid, { includeGapSlant: slantMode === "gap" });
      if (sl) {
        var colOfNum = function (n, cls) {
          if (cls === "extra") return mainCols + 1 + (n - game.extra.lo);
          return n - game.main.lo;
        };
        sl.all.forEach(function (L) {
          /* 点名：第 i 期在自己列里命中 a、第 j 期命中 b（斜着差 gap 格） */
          var ca = colOfNum(L.a, L.cls), cb = colOfNum(L.b, L.cls);
          var ra = map[L.i + "," + ca], rb = map[L.j + "," + cb];
          /* 同列（a === b，gap 不可能为 0 所以不会发生）跳过；缺格跳过 */
          if (!ra || !rb) return;
          var el = document.createElementNS(SVGNS, "line");
          el.setAttribute("x1", ra.x.toFixed(1));
          el.setAttribute("y1", ra.y.toFixed(1));
          el.setAttribute("x2", rb.x.toFixed(1));
          el.setAttribute("y2", rb.y.toFixed(1));
          el.setAttribute("class", "tr-line tr-slant tr-slant-" + L.type + " tr-slant-" + L.cls);
          el.setAttribute("data-tr-slant-gap", String(L.gap));
          svg.appendChild(el);
          segCount++;
        });
      }
    }
    if (!segCount) return 0;

    /* 放进 .tr-scroll（定位参考层），跟着表格横向滚动 */
    var host = table.parentNode || block;
    if (!host.appendChild) return 0;
    host.appendChild(svg);
    return segCount;
  }

  var blocks = toArr(root.querySelectorAll("[data-tr-block]"));
  var tabs = toArr(root.querySelectorAll("[data-tr-tab]"));

  /* 当前显示的是哪个彩种（斜连开关切换时要知道该重画哪一个） */
  var curId = null;

  /* ============================================================
     斜连开关（点一下换一档：关 → 差1 → 含间隔 → 关 …）
     ------------------------------------------------------------
     为什么必须做成开关：实测量级差太大 ——
       只画差1：双色球 92 条（好看）
       连间隔一起：快乐8 3477 条（糊成一团）
     所以默认「差1」，用户想看更全的自己点。
     ============================================================ */
  var slantBtn = null;
  function paintSlantBtn() {
    if (!slantBtn) return;
    slantBtn.textContent = SLANT_LABEL[slantMode];
    slantBtn.setAttribute("data-tr-slant-mode", slantMode);
    var on = slantMode !== "off";
    slantBtn.className = "tr-slantbtn" + (on ? " on" : "");
  }
  function cycleSlant() {
    var k = SLANT_MODES.indexOf(slantMode);
    slantMode = SLANT_MODES[(k + 1) % SLANT_MODES.length];
    paintSlantBtn();
    /* 重画当前这块（档位变了，线要重算） */
    if (curId) drawOne(curId);
    else drawAll();
  }

  /* 画连线；线条数报到块上（data-tr-lines），验收脚本可直接读。
     单块失败不影响别的块，也不影响彩种切换。 */
  function drawAll() {
    blocks.forEach(function (b) {
      try {
        var n = drawTrendLines(b);
        if (n) b.setAttribute("data-tr-lines", String(n));
      } catch (e) { /* 忽略：画不出线不影响页面功能 */ }
    });
  }

  /* ⚠️ 隐藏的块量不到坐标 → 初始只画了【当前显示】的那一块。
     所以每次切换都要给刚显示出来的块补画一次（实测：不补的话，
     切到大乐透就是一片空白没有连线，但块上却写着 data-tr-lines）。
     已经画过的块再调一次是安全的：drawTrendLines 会先清掉旧的覆盖层。 */
  function drawOne(id) {
    blocks.forEach(function (b) {
      if (b.getAttribute("data-tr-block") !== id) return;
      try {
        var n = drawTrendLines(b);
        if (n) b.setAttribute("data-tr-lines", String(n));
      } catch (e) { /* 忽略 */ }
    });
  }

  drawAll();

  /* ============================================================
     斜连开关（点一下换一档：关 → 差1 → 含间隔 → 关 …）
     ------------------------------------------------------------
     为什么必须做成开关：实测量级差太大 ——
       只画差1：双色球 92 条（好看）
       连间隔一起：快乐8 3477 条（糊成一团）
     所以默认「差1」，用户想看更全的自己点。
     ⚠️ 顺序：必须等 drawAll/drawOne 都定义好再建按钮、绑事件。
     ============================================================ */
  var slantBtn = null;
  function paintSlantBtn() {
    if (!slantBtn) return;
    slantBtn.textContent = SLANT_LABEL[slantMode];
    slantBtn.setAttribute("data-tr-slant-mode", slantMode);
    slantBtn.className = "tr-slantbtn" + (slantMode !== "off" ? " on" : "");
  }
  function cycleSlant() {
    var k = SLANT_MODES.indexOf(slantMode);
    slantMode = SLANT_MODES[(k + 1) % SLANT_MODES.length];
    paintSlantBtn();
    /* 档位变了 → 当前这块的线要重算重画 */
    if (curId) drawOne(curId);
    else drawAll();
  }

  /* 把开关放进彩种切换条那一行（渲染层没有它，这里补一个） */
  (function mountSlantBtn() {
    var tabsBar = root.querySelector(".tr-tabs");
    if (!tabsBar || !document.createElement) return;
    slantBtn = document.createElement("a");
    slantBtn.setAttribute("href", "#");
    slantBtn.setAttribute("role", "button");
    slantBtn.setAttribute("title", "切换斜连显示：关 / 只差1 / 含间隔");
    slantBtn.className = "tr-slantbtn on";
    slantBtn.textContent = SLANT_LABEL[slantMode];
    slantBtn.setAttribute("data-tr-slant-mode", slantMode);
    if (slantBtn.addEventListener) {
      slantBtn.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        cycleSlant();
        return false;
      });
    }
    if (tabsBar.appendChild) tabsBar.appendChild(slantBtn);
  })();

  function show(id) {
    /* 用 setAttribute('hidden') 而不是 .hidden 属性：
       ① 真浏览器里 [hidden] 一定生效（CSS 里也写了兜底）
       ② 迷你 DOM 验收脚本能按属性查到，真的能验证"只显示一块" */
    blocks.forEach(function (b) {
      if (b.getAttribute('data-tr-block') === id) b.removeAttribute('hidden');
      else b.setAttribute('hidden', '');
    });
    tabs.forEach(function (t) {
      var on = (t.getAttribute('data-tr-tab') === id);
      t.className = 'tr-tab' + (on ? ' on' : '');
    });
    /* 记下当前彩种：斜连开关切换时要重画这一块 */
    curId = id;
    /* 刚显示出来的块现在才有坐标 → 补画连线（隐藏时量不到，跳过了） */
    drawOne(id);
    /* ⚠️ file:// 下 history.replaceState 会抛 SecurityError —— 必须吞掉异常，
       否则后面的"隐藏其它块 / 写标题"全都不执行（实测踩过：
       页面 8 块全露、标题也没改，看起来像脚本没跑）。
       不写 localStorage（用户明令）；这里只是把当前彩种写回地址栏方便返回。 */
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '?g=' + id);
      }
    } catch (e) { /* file:// 下静默失败即可，功能不受影响 */ }
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      show(t.getAttribute('data-tr-tab'));
    });
  });

  var first = tabs[0] && tabs[0].getAttribute('data-tr-tab');
  var want = first;

  /* ① 支持 ?g=kl8 深链（手机收藏 / 分享指定彩种 / 截图定位）。
     ⚠️ 用查询参数而不是 hash：各 section 的 id 就是彩种名，
        裸 #kl8 会被浏览器当成锚点自己跳转；而且 file:// 下改 hash 会有额外风险。
     不写 localStorage（用户明令），只读地址栏。 */
  var q = '';
  try { q = (window.location && window.location.search) ? String(window.location.search) : ''; } catch (e) { q = ''; }
  var m = /[?&]g=([a-z0-9]+)/i.exec(q);
  if (m) {
    var id0 = m[1];
    if (tabs.some(function (t) { return t.getAttribute('data-tr-tab') === id0; })) want = id0;
  }

  /* ② 兼容老的 #g=kl8 形式（不强求，读不到就用默认） */
  if (!m) {
    var hash = '';
    try { hash = (window.location && window.location.hash) ? String(window.location.hash) : ''; } catch (e) { hash = ''; }
    var m2 = /^#g=([a-z0-9]+)/i.exec(hash);
    if (m2 && tabs.some(function (t) { return t.getAttribute('data-tr-tab') === m2[1]; })) want = m2[1];
  }

  if (want) {
    show(want);
    if (window.scrollTo) { try { window.scrollTo(0, 0); } catch (e) {} }
  }

  /* 自检标记：验收脚本读它 */
  document.title = '走势图 OK · ' + TREND_DATA.games.length + '彩种/' + TREND_DATA.periods + '期';
})();
