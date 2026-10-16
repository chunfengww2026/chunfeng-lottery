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

  /* ⚠️ querySelectorAll 返回的是 NodeList，只有 forEach 没有 some/filter/slice。
     最初直接写 tabs.some(...) → 带 ?g= 深链时抛
     "tabs.some is not a function"，后面的"隐藏其它块 / 写标题"全没执行，
     表现成"深链失效、8 块全露"（实测踩过）。统一转成真数组。 */
  var toArr = function (nl) { return Array.prototype.slice.call(nl); };
  var blocks = toArr(root.querySelectorAll('[data-tr-block]'));
  var tabs = toArr(root.querySelectorAll('[data-tr-tab]'));

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
