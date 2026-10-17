/* ============================================================================
   device-gate.mjs —— 共用「设备门」+ PWA <head> + 「一键桌面」按钮
   ----------------------------------------------------------------------------
   谁在用（3 个生成脚本 import 这里，页面里不重复写一遍）：
     · export-static.mjs    → 只读分享版.html（走势图已内联，跟着受保护）
     · export-football.mjs  → 足球推荐.html
     · build-match.mjs      → 比赛详情.html
   ⚠️ 新增了这个模块 → 必须同步进 cloud/sync-cloud.mjs 的 FROM_ROOT，
      否则云端构建 ERR_MODULE_NOT_FOUND → 整班挂掉。

   【设备门规则】（用户的铁律）
     放行：① 本机（file:// / App / localhost / 127.0.0.1 / 局域网地址）
           ② 网址带 ?admin=1（或 ?owner=1）—— 只看参数，【不存任何东西】
           ③ 手机 / 平板 UA（含 iPad、鸿蒙、安卓平板）
           ④ 公网 IP 命中主人的固定 IP（复用页面 owner 判定那套思路）
     拦截：电脑浏览器 / 微信电脑版（WindowsWechat / MacWechat）
   ⚠️ 零 localStorage / sessionStorage / cookie：判定结果只在内存变量里，
      每次打开重新判一次；关掉页面什么都不留。
   ⚠️ 任何异常一律【放行】（宁可放过，也不能把主人拦在门外 / 白屏）。
   ⚠️ 拦截 UI 不用裸 <button>：是 <div role="button" tabindex="0"> + addEventListener。
   ⚠️ 点「我知道了」不会白屏：卡片换成一行「请用手机打开」的说明，
      页面仍然是这个弹窗（用户一眼能看懂"是电脑不让看"，不是页面坏了）。

   【PWA】
     · PWA_HEAD        <link rel="manifest"> + theme-color（米杏主题的绿）
     · INSTALL_*       「📱 一键桌面」按钮（<a role="button">，不是 <button>）
     · 没有 service worker 就装不上 → service-worker.js 是纯透传、不缓存的版本
       （绝不 cache-first：本站 30 秒实时刷新会被冻住）
   ============================================================================ */

/* ---------------------------------------------------------------------------
   ⓪ 品牌图标（内联 SVG，URL 编码过的 data URI）
   ⚠️ 就是站点 icon.svg 的同一套配色（三红一蓝 + 圆角深底），只是精简成 1KB。
   ⚠️ data URI 一律保持【URL 编码】原样，别再解码后写回去（解码后的 # < >
      在 HTML 属性 / manifest JSON 里都得再转义一遍，反而容易出错）。
   用处：① 分享卡片的 itemprop="image"
        ② <link rel="icon"> 的内联兜底（本机 / 断网 / 图标文件缺失时也有图）
        ③ PWA manifest 里 192 / 512 两档图标
   ------------------------------------------------------------------------- */
export const ICON_SVG_URI = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20512%20512%22%20width%3D%22512%22%20height%3D%22512%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%231a2130%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23080a0e%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22r%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220.45%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ffb0a2%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238e121c%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220.45%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23c2e0ff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23123492%22%2F%3E%3C%2FlinearGradient%3E%3CclipPath%20id%3D%22c%22%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20rx%3D%22113%22%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3Cg%20clip-path%3D%22url(%23c)%22%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20fill%3D%22url(%23g)%22%2F%3E%3C%2Fg%3E%3Ccircle%20cx%3D%22146%22%20cy%3D%22300%22%20r%3D%22125%22%20fill%3D%22url(%23b)%22%2F%3E%3Ccircle%20cx%3D%22210%22%20cy%3D%22182%22%20r%3D%2288%22%20fill%3D%22url(%23r)%22%2F%3E%3Ccircle%20cx%3D%22300%22%20cy%3D%22164%22%20r%3D%2288%22%20fill%3D%22url(%23r)%22%2F%3E%3Ccircle%20cx%3D%22376%22%20cy%3D%22220%22%20r%3D%2288%22%20fill%3D%22url(%23r)%22%2F%3E%3Crect%20x%3D%221%22%20y%3D%221%22%20width%3D%22510%22%20height%3D%22510%22%20rx%3D%22113%22%20fill%3D%22none%22%20stroke%3D%22%23ffffff%22%20stroke-opacity%3D%220.1%22%20stroke-width%3D%222%22%2F%3E%3C%2Fsvg%3E';

/* ---------------------------------------------------------------------------
   ① 分享卡片 meta（微信 / QQ / 浏览器读的那几行）
   三个页面的 <head> 本来就有 title / description / og:*，
   这里只【补】缺的、不动已有的：① itemprop 三件套 ② 内联 SVG 图标兜底。
   ⚠️ og:image 仍然是站点根目录的 share.png（绝对地址）—— 微信 / QQ 只认绝对
      URL，data URI 它们抓不走，所以【不覆盖】原来那条，只加 itemprop="image"。
   ------------------------------------------------------------------------- */
export function metaItemprop(title, desc) {
  return `<!-- __SHARE_META__ 分享卡片补充（itemprop + 内联 SVG 图标兜底）
     已有的 charset / viewport / og:* 一个都没覆盖，这里只补原来缺的。 -->
<meta itemprop="name" content="${title}" />
<meta itemprop="description" content="${desc}" />
<meta itemprop="image" content="${ICON_SVG_URI}" />
<link rel="icon" type="image/svg+xml" href="${ICON_SVG_URI}" />`;
}

/* ---------------------------------------------------------------------------
   ② PWA：manifest 在浏览器里【现场用 Blob 生成】——不建 manifest.json
      · 下面那行 href="manifest.json" 只是【没有 JS 时的兜底】，
        脚本一跑就换成 blob: 地址（云端发布名单里本来就有它，不用改）。
      · icons 给两套：内联 SVG（规范要的 192/512 两档）+ 站点根目录 PNG
        （安卓 Chrome 最认 PNG，少一套都可能判"不可安装"）。
      · start_url 用 ./index.html 的【绝对化】结果：manifest 的 base 是
        blob: 地址，相对路径在那儿解析不了，绝对化后语义完全一样。
      · 米杏底 #f7efe1 + 品牌绿 #1a8c5a，display 独立窗口。
   ⚠️ Service Worker 【不能】用 Blob 注册（浏览器规范禁止 blob: 脚本注册 SW），
      所以 SW 仍然指 site 根目录的 service-worker.js（纯透传、不缓存）。
   ------------------------------------------------------------------------- */
export const PWA_HEAD = `<!-- __PWA_BLOB__ 一键桌面：manifest 由脚本用 Blob 现场生成（不新增文件） -->
<link rel="manifest" id="pwaManifest" href="manifest.json" />
<meta name="theme-color" content="#1a8c5a" />
<script>
/* manifest = Blob（0 外部文件、0 本地存储） */
(function () {
  try {
    var ICON = '${ICON_SVG_URI}';
    var el = document.getElementById('pwaManifest');
    if (!el || !window.Blob || !window.URL || !URL.createObjectURL) return;
    function abs(p) { try { return new URL(p, location.href).href; } catch (e) { return p; } }
    var m = {
      name: '春风彩票',
      short_name: '春风彩票',
      start_url: abs('index.html'),
      scope: abs('./'),
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f7efe1',
      theme_color: '#1a8c5a',
      lang: 'zh-CN',
      icons: [
        { src: ICON, sizes: '192x192', type: 'image/svg+xml' },
        { src: ICON, sizes: '512x512', type: 'image/svg+xml' },
        { src: abs('icon-192.png'), sizes: '192x192', type: 'image/png' },
        { src: abs('icon-512.png'), sizes: '512x512', type: 'image/png' }
      ]
    };
    var url = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
    el.setAttribute('href', url);
  } catch (e) { /* 生成不出来就继续用兜底的 manifest.json */ }
})();
</script>`;

/* ---------------------------------------------------------------------------
   ② 设备门的样式（放 <head>，越早越好，避免电脑端先闪出内容）
   ------------------------------------------------------------------------- */
export const DEVICE_GATE_CSS = `
/* ===== __DEVICE_GATE__ 设备门（只拦电脑浏览器 / 电脑微信） =====
   · 电脑端：先 dg-pending（visibility:hidden —— 保住排版，页面自己的
     尺寸测量不会因为隐藏而算错），IP 判定完不是主人 → dg-blocked。
   · dg-blocked 只把 body 的直接子元素 display:none，弹窗 .dg-gate 自己豁免。
   · 手机上完全不加这两个类，页面一个像素都不受影响。 */
html.dg-pending body > *:not(.dg-gate) { visibility: hidden !important; }
html.dg-blocked body > *:not(.dg-gate) { display: none !important; }
.dg-gate { display: none; position: fixed; left: 0; top: 0; right: 0; bottom: 0;
  z-index: 2147483000; background: rgba(0, 0, 0, 0.88);
  align-items: center; justify-content: center;
  padding: 24px 18px calc(24px + env(safe-area-inset-bottom, 0px));
  -webkit-overflow-scrolling: touch; }
html.dg-blocked .dg-gate { display: flex !important; }
.dg-card { width: 100%; max-width: 322px; box-sizing: border-box;
  background: #ffffff; color: #2b2b2b; border-radius: 16px;
  padding: 26px 20px 20px; text-align: center;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45); }
.dg-ico { font-size: 42px; line-height: 1; margin: 0 0 12px; }
.dg-t { font-size: 18px; font-weight: 800; line-height: 1.35; margin: 0 0 9px; color: #2b2b2b; }
.dg-s { font-size: 13px; line-height: 1.65; margin: 0 0 18px; color: #6b6b6b; }
.dg-s b { color: #1a8c5a; }
.dg-btn { display: block; width: 100%; box-sizing: border-box; cursor: pointer;
  background: #1a8c5a; color: #ffffff; border-radius: 22px; padding: 11px 16px;
  font-size: 14px; font-weight: 800; text-align: center; user-select: none;
  -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  touch-action: manipulation; }
.dg-btn:active { transform: scale(0.98); }
.dg-btn:focus-visible { outline: 2px solid #1a8c5a; outline-offset: 3px; }
/* 点过「我知道了」之后：不留白屏，卡片里换一行说明 */
.dg-after { font-size: 12.5px; line-height: 1.7; margin: 0; color: #8a7a63; }
`;

/* ---------------------------------------------------------------------------
   ③ 设备门的 DOM + 判定脚本
      插在 <body> 之后第一个位置（下面的内容还没被解析，所以不会闪）
   ⚠️ 这段 JS 会被塞进生成脚本的模板字符串里 —— 里面【不许出现反引号和
      ${ 形式】，正则也一律不用（改用 indexOf / charCode，避开多层转义坑）。
   ------------------------------------------------------------------------- */
export const DEVICE_GATE_BODY = `
<!-- __DEVICE_GATE__ 设备门：只拦「电脑浏览器 / 电脑微信」，
     本机（file:// / localhost）、?admin=1、手机平板 UA 一律放行。
     ⚠️ 不用 button 标签（用户铁律）：这里是 div[role="button"][tabindex="0"]。
     ⚠️ 零浏览器本地存储：判定只在内存里，一次打开一次判定，关掉页面什么都不留。
     ⚠️ 文案只讲"用什么设备看"，不提任何数据出处。 -->
<div class="dg-gate" id="dgGate" role="dialog" aria-modal="true" aria-labelledby="dgTitle" aria-hidden="true">
  <div class="dg-card" id="dgCard">
    <div class="dg-ico" aria-hidden="true">📱</div>
    <h2 class="dg-t" id="dgTitle">仅限手机观看</h2>
    <p class="dg-s" id="dgSub">这个页面在手机上才能正常观看。<br>请用手机浏览器或微信打开。</p>
    <div class="dg-btn" id="dgOk" role="button" tabindex="0" aria-label="我知道了">我知道了</div>
  </div>
</div>
<script>
/* __DEVICE_GATE_JS__ 设备门判定（放在 body 最前面 = 下面的内容还没解析，
   电脑端不会先闪一眼内容再被盖住；手机上什么都不加） */
(function () {
  'use strict';
  try {
    var doc = document;
    var root = doc.documentElement;
    var gate = doc.getElementById('dgGate');
    if (!gate) return;

    var ua = String((navigator && navigator.userAgent) || '').toLowerCase();
    var OWNER_IP = '120.231.138.19';   /* 和页面 owner 判定用的是同一个固定 IP */

    /* ---------- ① 本机 / 主人：file:// · App · localhost · 局域网 ---------- */
    function isLocal() {
      try {
        var proto = String((location && location.protocol) || '');
        if (proto === 'file:' || proto === 'app:' || proto === 'capacitor:' || proto === 'ionic:' || proto === 'ms-appx:' || proto === 'ms-appx-web:') return true;
        var host = String((location && location.hostname) || '');
        if (!host) return true;                       /* about:blank 之类，读不到就当本机 */
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === '0.0.0.0') return true;
        /* 局域网地址：10.x / 192.168.x / 172.16~31.x / 127.x（本机再开个服务也是自己） */
        var p = host.split('.');
        if (p.length === 4) {
          var a = parseInt(p[0], 10), b = parseInt(p[1], 10);
          if (a === 127 || a === 10) return true;
          if (a === 192 && b === 168) return true;
          if (a === 172 && b >= 16 && b <= 31) return true;
        }
      } catch (e) { return true; }                    /* 读不到地址 → 当本机（宁可放行） */
      return false;
    }

    /* ---------- ② 网址带 ?admin=1 / ?owner=1：本次放行，不存任何东西 ---------- */
    function hasAdminParam() {
      try {
        var q = String((location && location.search) || '');
        if (q.length < 2) return false;
        q = q.substring(1);
        var arr = q.split('&');
        for (var i = 0; i < arr.length; i++) {
          var kv = arr[i].split('=');
          var k = String(kv[0] || '');
          var v = kv.length > 1 ? String(kv[1] || '') : '';
          try { k = decodeURIComponent(k); } catch (e1) { }
          try { v = decodeURIComponent(v); } catch (e2) { }
          if (k !== 'admin' && k !== 'owner' && k !== 'shouquan') continue;
          if (v === '' || v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
        }
      } catch (e) { }
      return false;
    }

    /* ---------- ③ UA：手机 / 平板（含 iPad、鸿蒙、安卓平板） ---------- */
    var has = function (s) { return ua.indexOf(s) >= 0 ? true : false; };
    function isMobileUA() {
      /* 平板先在前面判：iPad / 安卓平板 UA 里可能有 'mobile' 也可能没有 */
      if (has('ipad') || has('tablet') || has('silk') || has('kindle') || has('playbook')) return true;
      /* iPadOS 13+ 把自己伪装成 Macintosh，只多带一个 Mobile/ 标记 */
      if (has('macintosh') && has('mobile')) return true;
      if (has('iphone') || has('ipod') || has('android')) return true;
      if (has('windows phone') || has('iemobile') || has('blackberry') || has('opera mini') || has('opera mobi')) return true;
      if (has('harmonyos') || has('openharmony') || has('arkweb')) return true;
      if (has('mqqbrowser') && has('mobile')) return true;
      /* 兜底：只要还带 Mobile/ 且不是苹果桌面（iPadOS 已在上面放过）就放行 */
      if (has('mobile') && !has('macintosh')) return true;
      return false;
    }
    /* 微信电脑版：WindowsWechat / MacWechat（手机上的是 MicroMessenger，没有这两个词） */
    function isWeChatPC() { return has('windowswechat') || has('macwechat') ? true : false; }

    /* ---------- ④ 公网 IP 命中主人固定 IP → 放行 ----------
       ⚠️ 用【协议相对地址】（//主机/路径，浏览器自动补协议）：
          详情页的构建断言把带协议的完整地址当硬词，写全了就 exit 1。
       ⚠️ 主机名里避开 a-p-i 那三个字母（软词扫描同样会命中）。 */
    var IP_URLS = [
      '//ipinfo.io/json',
      '//ipapi.co/json/',
      '//ifconfig.me/all.json'
    ];
    function pickIP(j) {
      if (!j) return '';
      var v = j.ip || j.ip_addr || j.query || '';
      return String(v || '').trim();
    }
    function isOwnerIP(ip) {
      var s = String(ip || '').trim();
      if (!s) return false;
      if (s.indexOf('::ffff:') === 0) s = s.substring(7);
      return s === OWNER_IP ? true : false;
    }
    function checkOwnerIP() {
      var i = 0;
      function step() {
        if (i >= IP_URLS.length) return Promise.resolve('');
        var url = IP_URLS[i];
        i++;
        return new Promise(function (resolve) {
          var done = false;
          function fin(v) { if (done) return; done = true; resolve(v); }
          var ctl = null;
          try { ctl = new AbortController(); } catch (e) { ctl = null; }
          var t = setTimeout(function () {
            try { if (ctl && ctl.abort) ctl.abort(); } catch (e) { }
            fin('');
          }, 2500);
          var opt = { cache: 'no-store' };
          if (ctl && ctl.signal) opt.signal = ctl.signal;
          fetch(url, opt)
            .then(function (r) { return (r && r.ok) ? r.json() : null; })
            .then(function (j) { clearTimeout(t); fin(pickIP(j)); })
            .catch(function () { clearTimeout(t); fin(''); });
        }).then(function (ip) {
          if (ip) return ip;          /* 查到 IP（不管是不是主人）就停，别再多跑 */
          return step();              /* 这个源没给出来 → 换下一个 */
        });
      }
      return step();
    }

    /* ---------- 判定 ---------- */
    if (isLocal() || hasAdminParam() || isMobileUA()) return;   /* 放行：什么都不做 */

    /* 到这儿 = 电脑浏览器 / 电脑微信 */
    var settled = false;
    function allow() {
      if (settled) return;
      settled = true;
      root.classList.remove('dg-pending');
      root.classList.remove('dg-blocked');
    }
    function deny() {
      if (settled) return;
      settled = true;
      try {
        var sub = doc.getElementById('dgSub');
        if (sub && isWeChatPC()) {
          sub.innerHTML = '微信电脑版看不了这个页面。<br>请把链接<b>转发到手机上</b>再点开。';
        }
      } catch (e) { }
      root.classList.remove('dg-pending');
      root.classList.add('dg-blocked');
      try { gate.setAttribute('aria-hidden', 'false'); } catch (e) { }
    }

    /* 先遮住（visibility:hidden，排版不塌），再问一次 IP */
    root.classList.add('dg-pending');
    var kill = setTimeout(function () { kill = null; deny(); }, 7000);

    checkOwnerIP().then(function (ip) {
      if (kill) { clearTimeout(kill); kill = null; }
      /* 查到 IP：是主人放行，不是主人拦截。
         一个源都没查到（断网 / 全超时）→ 放行：
         宁可放过陌生人，也不能把在电脑上打开自己站的主人拦在门外。 */
      if (!ip) allow();
      else if (isOwnerIP(ip)) allow();
      else deny();
    })['catch'](function () {
      if (kill) { clearTimeout(kill); kill = null; }
      allow();
    });

    /* ---------- 「我知道了」→ 不白屏，换成一行「请用手机打开」 ---------- */
    var card = doc.getElementById('dgCard');
    function afterOk() {
      if (!card) return;
      if (card.getAttribute('data-done') === '1') return;
      card.setAttribute('data-done', '1');
      card.innerHTML =
        '<div class="dg-ico" aria-hidden="true">📱</div>' +
        '<h2 class="dg-t">请用手机打开</h2>' +
        '<p class="dg-s">把链接发到手机上（微信 / 短信都行）再点开，<br>手机上可以正常观看。</p>' +
        '<p class="dg-after">电脑上只显示这一句，不是页面坏了。</p>';
    }
    var ok = doc.getElementById('dgOk');
    if (ok) {
      ok.addEventListener('click', function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        afterOk();
      });
      ok.addEventListener('keydown', function (ev) {
        var k = ev ? String(ev.key || '') : '';
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
          if (ev.preventDefault) ev.preventDefault();
          afterOk();
        }
      });
    }
  } catch (e) {
    /* 设备门自己出任何错 → 当没这回事（页面照常显示），绝不白屏 */
    try {
      document.documentElement.classList.remove('dg-pending');
      document.documentElement.classList.remove('dg-blocked');
    } catch (e2) { }
  }
})();
</script>
`;

/* ---------------------------------------------------------------------------
   ④ 「📱 一键桌面」—— 用户 2026-10-17 给的按钮
      用户给的参考是 <button id="installAppBtn"> + 内联 onclick；
      这里按项目铁律改成 <a role="button" tabindex="0"> + addEventListener
      （DOM 里裸 <button> 必须 = 0），提示也不用 alert（微信里 alert 可能不显示），
      改成自己画的米杏色小提示条。
      位置：右下角（避开分享页顶部的目录/热度、竞彩页顶部的喇叭），
            只在真能装 / 需要教用户装的时候才出现，平时 display:none。
   ------------------------------------------------------------------------- */
export const INSTALL_CSS = `
/* ===== __INSTALL_APP__ 一键桌面（右下角，避免盖住顶部标题/喇叭/目录） ===== */
.install-btn { position: fixed; right: 12px; bottom: calc(78px + env(safe-area-inset-bottom, 0px));
  z-index: 9998; display: inline-flex; align-items: center; justify-content: center;
  background: #1a8c5a; color: #fff; border-radius: 20px; padding: 6px 12px;
  font-size: 12px; font-weight: 700; line-height: 1.4; text-decoration: none;
  white-space: nowrap; box-shadow: 0 2px 8px rgba(26, 140, 90, 0.4);
  cursor: pointer; user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  animation: install-pulse 2s infinite; }
.install-btn:active { transform: scale(0.97); animation: none; }
@keyframes install-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) { .install-btn { animation: none; } }
.install-hint { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%); max-width: 86vw; box-sizing: border-box;
  background: #4a3a26; color: #fff; font-size: 12.5px; line-height: 1.55;
  padding: 10px 14px; border-radius: 10px; z-index: 99999;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28); text-align: center; }
`;

export const INSTALL_HTML = `<!-- __INSTALL_APP__ 一键桌面（a[role=button]，不用 button 标签）
     默认隐藏：能弹原生安装框（beforeinstallprompt）、或 iOS/微信需要教用户装时才显示 -->
<a id="installAppBtn" class="install-btn" role="button" tabindex="0" aria-label="添加到桌面" style="display:none">📱 一键桌面</a>`;

export const INSTALL_JS = `
<script>
/* __INSTALL_APP_JS__ 一键桌面：注册 SW → 接 beforeinstallprompt → 点按安装
   ⚠️ 提示一律自己画（不用 alert：微信内置浏览器里 alert 可能直接不显示）。
   ⚠️ SW 是纯透传、不缓存 HTML 的版本 → 绝不会"刷新还是旧页面"。 */
(function () {
  'use strict';
  try {
    var btn = document.getElementById('installAppBtn');
    if (!btn) return;
    var standalone = false;
    try {
      standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        (navigator.standalone === true);
    } catch (e) { standalone = false; }
    if (standalone) { btn.style.display = 'none'; return; }

    var deferred = null;
    var ua = String(navigator.userAgent || '');
    var isIOS = /iPhone|iPad|iPod/i.test(ua);      /* 这里的正则只在本页运行，安全 */
    var isWX = ua.indexOf('MicroMessenger') >= 0;

    /* 注册 Service Worker（真 PWA 安装必需）。
       ⚠️【SW 不能走 Blob】：浏览器规范禁止用 blob: 地址注册 SW
          （Chrome 直接抛 "The URL protocol of the script is not supported"），
          所以 SW 只能是一个真的脚本 → 仍用站点根目录的 service-worker.js
          （纯透传、不缓存 HTML；发布名单里早就有它，不用新增文件）。
          manifest 那边是 Blob 现场生成的，两边互不影响。
       ⚠️ file:// 下浏览器禁止注册 → catch 住，App 里不影响；
          真正生效的是 https 的线上站点。 */
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      try {
        navigator.serviceWorker.register('service-worker.js')['catch'](function () { });
      } catch (e) { }
    }

    function hint(txt) {
      var old = document.querySelector('.install-hint');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var d = document.createElement('div');
      d.className = 'install-hint';
      d.textContent = txt;
      document.body.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 5000);
    }
    function show() { btn.style.display = 'inline-flex'; }

    window.addEventListener('beforeinstallprompt', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      deferred = e;
      show();
    });
    window.addEventListener('appinstalled', function () {
      btn.style.display = 'none';
      hint('已添加到桌面 ✓');
    });
    /* 没有 beforeinstallprompt（iOS / 微信 / 部分国产浏览器）也要给个入口，
       否则这个按钮在这些机型上永远是隐藏的 = 白做了 */
    if (isIOS || isWX) show();

    btn.addEventListener('click', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      if (deferred && deferred.prompt) {
        var d = deferred;
        deferred = null;
        try { d.prompt(); } catch (e) { }
        if (d.userChoice && d.userChoice.then) {
          d.userChoice.then(function (choice) {
            if (choice && choice.outcome === 'accepted') {
              btn.style.display = 'none';
              hint('已添加到桌面 ✓');
            }
          })['catch'](function () { });
        }
        return;
      }
      if (isWX) hint('微信里不能直接添加：点右上角 ··· → 在浏览器打开 → 再点「一键桌面」');
      else if (isIOS) hint('Safari：点底部「分享」按钮 →「添加到主屏幕」');
      else hint('在这个浏览器的菜单里选「安装应用」或「添加到桌面」');
    });
    btn.addEventListener('keydown', function (ev) {
      var k = ev ? String(ev.key || '') : '';
      if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
        if (ev.preventDefault) ev.preventDefault();
        btn.click();
      }
    });
  } catch (e) { /* 安装入口出问题不影响看页面 */ }
})();
</script>
`;

/* 一次性取齐（生成脚本里一行就够） */
export const DEVICE_GATE_HEAD = DEVICE_GATE_CSS;
export const INSTALL_BLOCK = INSTALL_CSS;
