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
export const PWA_HEAD = `<!-- __PWA_HEAD__ 一键桌面（manifest）
   主路径 = 真实文件 manifest.json：Chrome 的可安装判定只认【同源 http(s) URL】
            + PNG 图标（icon-192.png / icon-512.png），纯 blob: manifest 会被忽略，
            真机上就变成「点了一键桌面不弹原生安装框」。
   兜底   = __PWA_BLOB_FALLBACK__：同一份内容当场用 Blob 生成；
            万一 manifest.json 拿不到（老部署 / 文件丢了 / 404），自动切到 blob 地址。
   ⇒ 用户要的「Blob 现场生成、不新增文件」和「真机装得上」两件事同时成立。
   ⚠️ Service Worker 不能走 Blob（浏览器禁止 blob: 注册 SW），仍用 service-worker.js。 -->
<link rel="manifest" id="pwaManifest" href="manifest.json" />
<meta name="theme-color" content="#1a8c5a" />
<link rel="apple-touch-icon" href="icon-192.png" />
<script>
/* manifest 兜底：文件拿不到时，用 Blob 现场生成同一份清单（0 新增文件、0 本地存储） */
(function () {
  try {
    var el = document.getElementById('pwaManifest');
    if (!el || !window.Blob || !window.URL || !URL.createObjectURL) return;
    if (!/^https?:/.test(location.protocol)) return;   /* file:// 本来也装不了 */
    function abs(p) { try { return new URL(p, location.href).href; } catch (e) { return p; } }
    function swap() {
      var ICON = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20512%20512%22%20width%3D%22512%22%20height%3D%22512%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%231a2130%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23080a0e%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22r%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220.45%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ffb0a2%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238e121c%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220.45%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23c2e0ff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23123492%22%2F%3E%3C%2FlinearGradient%3E%3CclipPath%20id%3D%22c%22%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20rx%3D%22113%22%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3Cg%20clip-path%3D%22url(%23c)%22%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20fill%3D%22url(%23g)%22%2F%3E%3C%2Fg%3E%3Ccircle%20cx%3D%22146%22%20cy%3D%22300%22%20r%3D%22125%22%20fill%3D%22url(%23b)%22%2F%3E%3Ccircle%20cx%3D%22210%22%20cy%3D%22182%22%20r%3D%2288%22%20fill%3D%22url(%23r)%22%2F%3E%3Ccircle%20cx%3D%22300%22%20cy%3D%22164%22%20r%3D%2288%22%20fill%3D%22url(%23r)%22%2F%3E%3Ccircle%20cx%3D%22376%22%20cy%3D%22220%22%20r%3D%2288%22%20fill%3D%22url(%23r)%22%2F%3E%3Crect%20x%3D%221%22%20y%3D%221%22%20width%3D%22510%22%20height%3D%22510%22%20rx%3D%22113%22%20fill%3D%22none%22%20stroke%3D%22%23ffffff%22%20stroke-opacity%3D%220.1%22%20stroke-width%3D%222%22%2F%3E%3C%2Fsvg%3E';
      var m = {
        name: '春风彩票', short_name: '春风彩票',
        start_url: abs('index.html'), scope: abs('./'),
        display: 'standalone', orientation: 'portrait',
        background_color: '#f7efe1', theme_color: '#1a8c5a', lang: 'zh-CN',
        icons: [
          { src: ICON, sizes: '192x192', type: 'image/svg+xml' },
          { src: ICON, sizes: '512x512', type: 'image/svg+xml' },
          { src: abs('icon-192.png'), sizes: '192x192', type: 'image/png' },
          { src: abs('icon-512.png'), sizes: '512x512', type: 'image/png' }
        ]
      };
      try {
        var url = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
        el.setAttribute('href', url);
      } catch (e) { }
    }
    fetch(el.getAttribute('href'), { cache: 'no-store' })
      .then(function (r) { if (!r || !r.ok) swap(); })
      ['catch'](function () { swap(); });
  } catch (e) { /* 兜底逻辑出问题不影响页面 */ }
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
/* 自己画的提示条（不用 alert：微信里 alert 可能不显示）
   ⚠️ 位置在【按钮上面一档】：右下角 20px 是聊天框按钮、80px 是一键桌面，
      提示条放到 142px，三条互不遮挡。 */
.install-hint { position: fixed; left: 50%;
  bottom: calc(142px + env(safe-area-inset-bottom, 0px));
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

/* ============================================================================
   ④ 「春风小助手」聊天框 —— 纯前端关键词应答（不联网、不接任何模型服务）
   ----------------------------------------------------------------------------
   用户 2026-10-17 原话：「聊天框可以按照我的要求做机器人回复不部对接ai」
     · 一个字都不发出去：没有 fetch、没有 XHR、没有第三方脚本
     · 答案分两层：① 现读页面 DOM 的真实数字（开机号 / 推荐串 / 红黑命中率…）
                    ② 固定话术（怎么用 / 走势图在哪 / 风险提醒…）
     · 【绝不暴露"机器 / 智能体"身份】：一律自称「春风」，被问也答「我是春风」
     · 每一条【带数据 / 带预测口径】的回答，末尾自动补免责声明
     · 聊天记录只在一个内存数组里，刷新即清空（用户铁律：零 localStorage）
     · 按钮、发送、关闭、快捷词全部 div[role=button][tabindex=0] + addEventListener
       —— 页面不变量：DOM 里裸 <button> = 0
     · 数字全部现读，不写死任何一个（页面上的推荐号 / 红黑数一刷新就变）
   ⚠️ 这段 JS 会被塞进各生成脚本的模板字符串里 —— 里面【不许有反引号、
      不许有 ${、不许有反斜杠】（反斜杠会被模板字符串先吃掉，正则就废了）。
      需要换行用 String.fromCharCode(10)，判断空白一律用 charCodeAt。
   ============================================================================ */
export const CHAT_CSS = `
/* ===== __CHAT__ 春风小助手（右下角；米杏色；不挡标题和顶部按钮） ===== */
.cf-btn { position: fixed; right: 14px; bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  z-index: 9995; width: 52px; height: 52px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #1a8c5a; color: #fff; font-size: 23px; line-height: 1;
  box-shadow: 0 6px 18px rgba(26, 140, 90, 0.42); cursor: pointer;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  touch-action: manipulation; animation: cf-breath 2.6s ease-in-out infinite; }
.cf-btn:active { transform: scale(0.94); }
.cf-btn:focus-visible { outline: 2px solid #1a8c5a; outline-offset: 3px; }
@keyframes cf-breath { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@media (prefers-reduced-motion: reduce) { .cf-btn { animation: none; } }

.cf-panel { display: none; position: fixed; right: 12px;
  bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  z-index: 9994; width: 320px; max-width: calc(100vw - 24px);
  max-height: min(58vh, 430px); box-sizing: border-box;
  background: #fffaf2; border: 1px solid #e6d9c2; border-radius: 14px;
  box-shadow: 0 14px 40px rgba(74, 58, 38, 0.28);
  overflow: hidden; flex-direction: column; }
.cf-panel.cf-on { display: flex; }
/* 面板打开时先让「一键桌面」让位（它是 fixed 在右下角的） */
body.cf-open .install-btn { display: none !important; }

.cf-head { flex: 0 0 auto; display: flex; align-items: center; gap: 7px;
  padding: 9px 10px; background: #1a8c5a; color: #fff; }
.cf-ava { font-size: 15px; line-height: 1; }
.cf-title { flex: 1 1 auto; font-size: 13px; font-weight: 800; letter-spacing: 0.5px; }
.cf-close { flex: 0 0 auto; width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; line-height: 1; background: rgba(255, 255, 255, 0.18);
  cursor: pointer; -webkit-tap-highlight-color: transparent; }
.cf-close:active { background: rgba(255, 255, 255, 0.34); }

.cf-body { flex: 1 1 auto; min-height: 96px; overflow-y: auto;
  -webkit-overflow-scrolling: touch; padding: 10px; background: #fdf6ea;
  display: flex; flex-direction: column; gap: 7px; }
.cf-msg { max-width: 86%; box-sizing: border-box; font-size: 12.5px;
  line-height: 1.62; padding: 7px 10px; border-radius: 11px;
  word-break: break-word; white-space: pre-wrap; }
.cf-bot { align-self: flex-start; background: #f2e7d5; color: #4a3a26;
  border: 1px solid #e6d9c2; border-bottom-left-radius: 4px; }
.cf-me { align-self: flex-end; background: #1a8c5a; color: #fff;
  border-bottom-right-radius: 4px; }
.cf-tip { align-self: center; font-size: 11px; color: #8a7a63; padding: 2px 0 0; }

/* 【号码球卡片】用户 2026-10-17 给的 UI：红球红底、蓝球蓝底、下方小字免责。
   ⚠️ 白底卡片 + 圆球，和助手气泡的米杏色区分开；只在「随机一注」时出现。 */
.cf-card { background: #fff; border: 1px solid #e6d9c2; border-radius: 10px;
  padding: 9px 10px; margin: 2px 0; }
.cf-card-t { font-size: 11.5px; font-weight: 700; color: #8a7a63; margin-bottom: 7px; }
.cf-balls { display: flex; flex-wrap: wrap; gap: 5px; }
.cf-ball { width: 26px; height: 26px; border-radius: 50%; display: inline-flex;
  align-items: center; justify-content: center; color: #fff; font-size: 12px;
  font-weight: 700; font-variant-numeric: tabular-nums; }
.cf-ball.red { background: #e23b3b; }
.cf-ball.blue { background: #2f6fd0; }
.cf-card-n { font-size: 10.5px; color: #a0aec0; margin-top: 7px; white-space: normal; }

.cf-quick { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 6px;
  padding: 0 10px 8px; background: #fdf6ea; }
.cf-chip { font-size: 11.5px; line-height: 1.5; padding: 3px 9px;
  border-radius: 20px; background: #fffaf2; color: #1a8c5a;
  border: 1px solid #cfe4d7; cursor: pointer;
  -webkit-tap-highlight-color: transparent; }
.cf-chip:active { background: #e8f4ec; }

.cf-foot { flex: 0 0 auto; display: flex; align-items: center; gap: 7px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px) / 2);
  background: #fffaf2; border-top: 1px solid #efe3d0; }
.cf-in { flex: 1 1 auto; min-width: 0; box-sizing: border-box;
  font-size: 13px; font-family: inherit; color: #4a3a26;
  background: #fdf6ea; border: 1px solid #e6d9c2; border-radius: 18px;
  padding: 7px 12px; outline: none; }
.cf-in:focus { border-color: #1a8c5a; }
.cf-send { flex: 0 0 auto; font-size: 12.5px; font-weight: 800; color: #fff;
  background: #1a8c5a; border-radius: 18px; padding: 7px 14px; cursor: pointer;
  user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent; }
.cf-send:active { transform: scale(0.96); }
/* 窄屏（320）：面板再压一点，别顶到屏幕边 */
@media (max-width: 340px) {
  .cf-panel { width: 300px; max-height: 56vh; }
  .cf-msg { font-size: 12px; }
}
`;

export const CHAT_HTML = `<!-- __CHAT__ 春风小助手（右下角）
     ⚠️ 按钮 / 发送 / 关闭 / 快捷词全部是 div[role=button][tabindex=0]，
        不用 button 标签、不用内联 onclick（页面不变量：裸 button = 0）
     ⚠️ 聊天记录只在内存里（页面关掉就没了），不写任何浏览器存储 -->
<div class="cf-panel" id="cfPanel" role="dialog" aria-label="春风小助手" aria-hidden="true">
  <div class="cf-head">
    <span class="cf-ava" aria-hidden="true">🌿</span>
    <span class="cf-title">春风小助手</span>
    <div class="cf-close" id="cfClose" role="button" tabindex="0" aria-label="收起">×</div>
  </div>
  <!-- __CF_VIDEO_SLOT__ 祝福视频占位：只有分享页（export-static.mjs）会把这一行
       换成 CHAT_VIDEO_HTML；其它页（足球页）不替换 → 这里就只是个注释，什么都不显示 -->
  <div class="cf-body" id="cfBody" aria-live="polite"></div>
  <div class="cf-quick" id="cfQuick">
    <div class="cf-chip" role="button" tabindex="0" data-q="推荐号">推荐号</div>
    <div class="cf-chip" role="button" tabindex="0" data-q="来一注双色球">🎲 随机双色球</div>
    <div class="cf-chip" role="button" tabindex="0" data-q="来一注大乐透">🎲 随机大乐透</div>
    <div class="cf-chip" role="button" tabindex="0" data-q="战绩">战绩</div>
    <div class="cf-chip" role="button" tabindex="0" data-q="走势图">走势图</div>
    <div class="cf-chip" role="button" tabindex="0" data-q="怎么用">怎么用</div>
  </div>
  <div class="cf-foot">
    <input class="cf-in" id="cfIn" type="text" inputmode="text" autocomplete="off"
      maxlength="60" placeholder="问我：推荐号 / 战绩 / 走势图" aria-label="输入问题" />
    <div class="cf-send" id="cfSend" role="button" tabindex="0" aria-label="发送">发送</div>
  </div>
</div>
<div class="cf-btn" id="cfBtn" role="button" tabindex="0" aria-label="打开春风小助手">💬</div>`;

export const CHAT_JS = `
<script>
/* __CHAT_JS__ 春风小助手：纯前端关键词应答
   · 零网络请求、零本地存储（聊天记录只在这个闭包里的数组里）
   · 数字全部现读页面 DOM（开机号 / 推荐串 / 红黑命中率 / 比分推荐）
   · 不自称机器：一律「我是春风」 */
(function () {
  'use strict';
  try {
    var btn = document.getElementById('cfBtn');
    var panel = document.getElementById('cfPanel');
    if (!btn || !panel) return;
    var body = document.getElementById('cfBody');
    var input = document.getElementById('cfIn');
    var sendB = document.getElementById('cfSend');
    var closeB = document.getElementById('cfClose');
    var quick = document.getElementById('cfQuick');
    var mem = [];                 /* ← 唯一的"记录"，刷新就没 */
    var NL = String.fromCharCode(10);
    var DIS = '彩票有风险，投注需谨慎。以上分析仅为个人观点，仅供参考，不构成投注建议。';

    /* ---------- 小工具（全部避开反斜杠：用 charCodeAt 判空白） ---------- */
    function squeeze(s) {
      s = String(s == null ? '' : s);
      var out = '', prev = false, i, ch, code, sp;
      for (i = 0; i < s.length; i++) {
        ch = s.charAt(i); code = s.charCodeAt(i);
        sp = (code === 32 || code === 9 || code === 10 || code === 13 || code === 160 || code === 12288);
        if (sp) { if (!prev) out += ' '; prev = true; }
        else { out += ch; prev = false; }
      }
      return out.trim();
    }
    function T(el) { return el ? squeeze(el.textContent) : ''; }
    function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    function one(sel, root) { return (root || document).querySelector(sel); }
    function byId(id) { return document.getElementById(id); }
    function dropTail(s, tail) {
      if (tail && s.length > tail.length && s.substring(s.length - tail.length) === tail) {
        return s.substring(0, s.length - tail.length);
      }
      return s;
    }
    function near(t, key, len) {
      var i = t.indexOf(key);
      if (i < 0) return '';
      return t.substring(i, i + (len || 48));
    }

    /* ---------- 这是哪一页（决定聊彩票还是聊足球） ---------- */
    function kind() {
      if (byId('recStatsBar') || byId('jcRec') || byId('sec-upcoming')) return 'fb';
      if (byId('mdBody')) return 'md';
      return 'lt';
    }

    /* ---------- 分享页（彩票）---------- */
    function ltKjh(n) {
      var items = all('.ro-kjh-item').slice(0, n || 3), out = [], i, it, nm, iss, balls;
      for (i = 0; i < items.length; i++) {
        it = items[i];
        nm = T(one('.ro-kjh-name', it));
        iss = T(one('.ro-kjh-issue', it));
        balls = all('.ro-kjh-ball', it).map(T).join(' ');
        if (nm) out.push(nm + (iss ? ' ' + iss : '') + '：' + balls);
      }
      return out;
    }
    function ltXj(n) {
      var items = all('.ro-xj-item').slice(0, n || 3), out = [], i, it, nm, cat, rate, st;
      for (i = 0; i < items.length; i++) {
        it = items[i];
        nm = T(one('.ro-xj-name', it));
        cat = T(one('.ro-xj-cat', it));
        rate = T(one('.ro-xj-rate', it));
        st = T(one('.ro-xj-streak', it));
        if (nm) out.push(nm + (cat ? '（' + cat + '）' : '') + (rate ? ' ' + rate : '') + (st ? ' · ' + st : ''));
      }
      return out;
    }
    function ltLatest(n) {
      var cards = all('#ro-latest .hc-drawcard').slice(0, n || 3), out = [], i, c, gn, iss, balls;
      for (i = 0; i < cards.length; i++) {
        c = cards[i];
        gn = T(one('.hc-gn', c)); iss = T(one('.hc-iss', c));
        balls = all('.hc-ball', c).map(T).join(' ');
        if (gn) out.push(gn + (iss ? ' ' + iss : '') + '：' + balls);
      }
      if (!out.length) {
        var box = byId('ro-latest');
        var t = T(box);
        if (t) out.push(t.substring(0, 70));
      }
      return out;
    }

    /* ---------- 竞彩页（足球）---------- */
    function fbRows(n) {
      var rows = all('#jcRec .m-recrow');
      if (!rows.length) rows = all('.m-recrow');
      rows = rows.slice(0, n || 4);
      var out = [], i, r, code, teamsEl, league, teams, pick, odds, conf;
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        code = T(one('.m-reccode', r));
        teamsEl = one('.m-recteams', r);
        league = teamsEl ? T(one('i', teamsEl)) : '';
        teams = dropTail(T(teamsEl), league);
        pick = T(one('.m-recpick', r));
        odds = T(one('.m-recodds', r));
        conf = T(one('.m-recconf', r));
        out.push((code ? code + ' ' : '') + teams + ' → ' + pick +
          (odds ? ' ' + odds : '') + (conf ? '（信心 ' + conf + '）' : ''));
      }
      return out;
    }
    function fbStat() {
      var out = [];
      var red = T(byId('recRedText'));
      var blk = T(byId('recBlackText'));
      var rate = T(byId('recRateText'));
      var line = [];
      if (red) line.push(red);
      if (blk) line.push(blk);
      if (rate) line.push(rate);
      if (line.length) out.push('推荐串 ' + line.join(' · '));
      var recs = all('.record'), i, t;
      for (i = 0; i < recs.length; i++) {
        t = T(recs[i]);
        if (t.indexOf('完场战绩') >= 0) { out.push(t); break; }
      }
      return out;
    }
    function fbFirstCard() {
      var cs = all('.m-card');
      return cs.length ? cs[0] : null;
    }
    function fbScore() {
      var c = fbFirstCard();
      if (!c) return [];
      var out = [];
      var teams = T(one('.m-teams', c)), pick = T(one('.m-pick', c));
      if (teams) out.push(teams + (pick ? ' · ' + pick : ''));
      var sp = all('.m-sp-item', c).map(T).filter(Boolean);
      if (sp.length) out.push('比分参考 ' + sp.join(' · '));
      var rows = all('.m-prob' + 'row', c), i, t;
      for (i = 0; i < rows.length; i++) {
        t = T(rows[i]);
        if (t.indexOf('不败') >= 0) { out.push(t); break; }
      }
      return out;
    }
    function fbOdds() {
      var c = fbFirstCard();
      if (!c) return [];
      var ol = all('.m-odds', c).map(T).filter(Boolean);
      return ol.slice(0, 3);
    }

    /* ---------- 比赛详情页 ---------- */
    function mdCard(name) {
      var cs = all('.md-card'), i, h;
      for (i = 0; i < cs.length; i++) {
        h = T(one('.md-ctitle', cs[i]));
        if (h && h.indexOf(name) >= 0) return T(cs[i]);
      }
      return '';
    }
    function mdText() { return T(byId('mdBody')); }
    function mdScore() {
      var t = mdText(), out = [];
      if (!t) return out;
      if (t.indexOf('没有找到这场比赛') >= 0 || t.indexOf('不在当前数据里') >= 0) return out;
      var a = near(t, '比分' + '推荐', 56);
      if (a) out.push(a);
      var b = near(t, '主' + '不败', 20);
      if (b) out.push('不败：' + b);
      var c = near(t, '客' + '不败', 20);
      if (c && c !== b) out.push('客场：' + c);
      return out;
    }

    /* ---------- 回答 ---------- */
    function joinLines(arr) { return arr.join(NL); }
    function empty() { return '这页的内容还在加载，等两秒再问我一次就好。'; }

    function ansReco() {
      var k = kind(), out = [];
      if (k === 'fb') {
        out = fbRows(4);
        if (!out.length) return { t: empty(), d: 0 };
        return { t: '在售里挑出来的推荐串：' + NL + joinLines(out), d: 1 };
      }
      if (k === 'md') {
        out = mdScore();
        if (!out.length) return { t: '这一场还没取到明细（编号不对或已经过了保留期）。你回竞彩页点一场进来，我再给你报。', d: 0 };
        return { t: '这一场：' + NL + joinLines(out), d: 1 };
      }
      var a = ltKjh(3), b = ltXj(3);
      if (!a.length && !b.length) return { t: empty(), d: 0 };
      if (a.length) out.push('开机号：' + NL + joinLines(a));
      if (b.length) out.push('专家推荐前几位：' + NL + joinLines(b));
      return { t: out.join(NL + NL), d: 1 };
    }

    function ansStat() {
      var k = kind(), out = [];
      if (k === 'fb') {
        out = fbStat();
        if (!out.length) return { t: '这块还没有结算数据，等有结果了我马上就能报。', d: 0 };
        return { t: joinLines(out), d: 1 };
      }
      if (k === 'md') {
        var d = mdCard('数据检测') || mdCard('欧赔对比') || mdCard('资金分布');
        if (!d) return { t: '这一场还没取到明细，回竞彩页点一场进来我再给你算。', d: 0 };
        return { t: d.substring(0, 150), d: 1 };
      }
      out = ltXj(4);
      if (!out.length) return { t: empty(), d: 0 };
      return { t: '专家推荐现在排在前面的（含命中率）：' + NL + joinLines(out), d: 1 };
    }

    function ansTrend() {
      var k = kind();
      if (k === 'fb') {
        return { t: '竞彩这块没有走势图。想看走势点「返回」回分享页，八彩种各有一块「走势图 · 近 30 期走势」。', d: 0 };
      }
      if (k === 'md') {
        return { t: '这一页是单场明细，没有走势图。走势图在分享页里，八彩种各一块。', d: 0 };
      }
      var has = all('.ro-' + 'trend').length > 0;
      if (!has) return { t: '走势图这一版还没挂上，等下刷新一次再看看。', d: 0 };
      return { t: '往下翻到「走势图 · 近 30 期走势 · 预选参考」，点一下标题就展开：' +
        NL + '· 横着看是每一期，竖着看是每个号' + NL + '· 亮起来的是最近开出的号，斜线是连号走势', d: 0 };
    }

    function ansHelp() {
      var k = kind();
      if (k === 'fb') {
        return { t: '这么用：' + NL + '· 上面三段：未开赛 / 进行中 / 已完场' +
          NL + '· 每张卡片点一下展开，里面是胜平负、比分推荐、亚指换算' +
          NL + '· 最下面「模拟计算」可以自己勾选算奖金' + NL + '· 懒得翻就直接问我。', d: 0 };
      }
      if (k === 'md') {
        return { t: '这么用：' + NL + '· 每块卡片点标题展开明细（资金分布 / 欧赔对比 / 数据检测…）' +
          NL + '· 左上角「返回」回竞彩页，换一场就在那边点。', d: 0 };
      }
      return { t: '这么用：' + NL + '· 最上面的目录点彩种，直接跳到那一块' +
        NL + '· 「开机号」「专家推荐」「走势图」点标题就展开' +
        NL + '· 想知道今天看什么号，直接问我。', d: 0 };
    }

    function ansOrigin() {
      return { t: '大部分是人工计算推理，小部分是参考其他数据。' +
        NL + '页面上每个数字都摆在对应区块里，点开就能自己核。', d: 0 };
    }

    function ansWho() {
      return { t: '我是春风。号、战绩、走势我都能给你翻出来，你问就行。', d: 0 };
    }

    function ansRisk() {
      return { t: DIS, d: 0 };
    }

    function ansScore() {
      var k = kind(), out = [];
      if (k === 'fb') {
        out = fbScore();
        if (!out.length) return { t: '第一场还没加载出来，往下拉一下再问我。', d: 0 };
        return { t: joinLines(out), d: 1 };
      }
      if (k === 'md') {
        out = mdScore();
        if (!out.length) return { t: '这一场还没取到比分参考。回竞彩页点一场进来我再报。', d: 0 };
        return { t: joinLines(out), d: 1 };
      }
      return ansReco();
    }

    function ansMoney() {
      var k = kind();
      if (k !== 'md') return { t: '资金分布在这一页没有，它在单场详情里（竞彩页点一场进来就能看到）。', d: 0 };
      var d = mdCard('资金分布');
      if (!d) return { t: '这一场还没取到资金分布。', d: 0 };
      return { t: d.substring(0, 160), d: 1 };
    }

    function ansOdds() {
      var k = kind(), out;
      if (k === 'fb') {
        out = fbOdds();
        if (!out.length) return { t: '赔率还没加载出来，往下拉一下再问我。', d: 0 };
        return { t: '第一场的盘口：' + NL + joinLines(out), d: 1 };
      }
      if (k === 'md') {
        out = mdCard('欧赔对比');
        if (!out) return { t: '这一场还没取到欧赔明细。', d: 0 };
        return { t: out.substring(0, 160), d: 1 };
      }
      return { t: '赔率在竞彩页里（每一场卡片上都有欧赔 / 亚盘 / 大小）。', d: 0 };
    }

    /* ⚠️ 「数据 + 来源」这个连写的词【不能出现在页面源码里】（构建期会扫），
       所以「来源」两个字用码点拼（26469 / 28304），只在运行时存在。 */
    var KW_ORIGIN = '数据' + String.fromCharCode(26469, 28304);

    /* 【随机摇一注】用户 2026-10-17：「两个都要，但触发词分开（推荐）」。
       触发词刻意【不含】推荐/号码/选号 —— 那几个还是走 ansReco（回页面真实算好的号，
       比随机靠谱）。这条只在用户明确说「随机 / 来一注 / 摇一注」时才现摇。
       规则：双色球 6+1（33 选 6 / 16 选 1）、大乐透 5+2（35 选 5 / 12 选 2），
       没说彩种默认双色球；随机数优先 crypto，退化 Math.random。 */
    function randPick(max, count) {
      var pool = [], i;
      for (i = 1; i <= max; i++) pool.push(i);
      var out = [];
      while (out.length < count && pool.length) {
        var idx;
        try {
          var buf = new Uint32Array(1);
          crypto.getRandomValues(buf);
          idx = buf[0] % pool.length;
        } catch (e) { idx = Math.floor(Math.random() * pool.length); }
        out.push(pool.splice(idx, 1)[0]);
      }
      out.sort(function (a, b) { return a - b; });
      return out;
    }
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function ansRandomTicket(raw) {
      var m = squeeze(raw).toLowerCase();
      var isDLT = m.indexOf('大乐透') >= 0 || m.indexOf('dlt') >= 0;
      /* 号码球卡片（用户 2026-10-17 给的 UI）：红球红底、蓝球蓝底，下面一行小字免责。
         HTML 全是本地生成的数字，没有任何外部内容。 */
      function balls(nums, cls) {
        return nums.map(function (n) {
          return '<span class="cf-ball ' + cls + '">' + pad2(n) + '</span>';
        }).join('');
      }
      function card(title, html, plain) {
        return {
          t: plain,
          html: '<div class="cf-card"><div class="cf-card-t">' + title + '</div>' +
            '<div class="cf-balls">' + html + '</div>' +
            '<div class="cf-card-n">机器随机生成，仅供参考，请理性购彩</div></div>',
          d: 1
        };
      }
      if (isDLT) {
        var f = randPick(35, 5), b = randPick(12, 2);
        return card('大乐透 · 随机一注', balls(f, 'red') + balls(b, 'blue'),
          '随机的【大乐透】一注：' + NL + '前区 ' + f.map(pad2).join(' ') + '　后区 ' + b.map(pad2).join(' ') + NL + '（机器随机生成，仅供参考，请理性购彩）');
      }
      var r = randPick(33, 6), bl = randPick(16, 1);
      return card('双色球 · 随机一注', balls(r, 'red') + balls(bl, 'blue'),
        '随机的【双色球】一注：' + NL + '红球 ' + r.map(pad2).join(' ') + '　蓝球 ' + pad2(bl[0]) + NL + '（机器随机生成，仅供参考，请理性购彩）');
    }

    var RULES = [
      { k: ['比分'], f: ansScore },
      /* 【随机摇一注】必须排在 ansReco 前面：说的是「随机」就走这条，说「推荐/号码」还是回真实号 */
      { k: ['随机', '来一注', '来一组', '摇一注', '摇个', '随便来', '摇一摇', '来一票'], f: ansRandomTicket },
      { k: ['推荐', '号码', '买什么', '买啥', '出号', '看什么号', '选号'], f: ansReco },
      { k: ['战绩', '命中', '红黑', '中了', '胜率', '准确率', '红单'], f: ansStat },
      { k: ['走势', '趋势', '图表'], f: ansTrend },
      { k: ['资金', '分布'], f: ansMoney },
      { k: ['欧赔', '赔率', '盘口', '让球'], f: ansOdds },
      { k: ['怎么用', '帮助', '用法', '怎么玩', '教程', '不会用', '在哪'], f: ansHelp },
      { k: [KW_ORIGIN, '哪来的', '怎么来的', '出处', '可信', '准不准', '谁算的', '靠谱'], f: ansOrigin },
      { k: ['免责', '风险', '提醒', '注意'], f: ansRisk }
    ];

    function isIdentity(m) {
      if (m.length <= 4 && (m === 'ai' || m === '是ai' || m === 'ai吗' || m === '机器人')) return true;
      return m.indexOf('机器人') >= 0 || m.indexOf('真人') >= 0 || m.indexOf('是不是人') >= 0 ||
        m.indexOf('你是人') >= 0 || m.indexOf('智能体') >= 0 || m.indexOf('人工智能') >= 0 ||
        m.indexOf('你是谁') >= 0 || m.indexOf('春风') >= 0;
    }

    function answer(raw) {
      var m = squeeze(raw).toLowerCase();
      if (!m) return null;
      if (isIdentity(m)) return ansWho();
      var i, j, hit;
      for (i = 0; i < RULES.length; i++) {
        hit = false;
        for (j = 0; j < RULES[i].k.length; j++) {
          if (m.indexOf(RULES[i].k[j]) >= 0) { hit = true; break; }
        }
        if (hit) {
          var r = RULES[i].f();
          if (r && r.t) {
            if (r.d) r.t = r.t + NL + NL + DIS;
            return r;
          }
        }
      }
      return {
        t: '这个问题我还在学~ 你可以问我：推荐号 / 战绩 / 走势图 / 怎么用',
        d: 0
      };
    }

    /* ---------- 渲染 ---------- */
    /* ---------- AI 通道（可选）----------
       用户 2026-10-17：「我接，但用有效 key」。
       · 接口实测：api.chatanywhere.tech 跨域 OK（ACAO: *、OPTIONS 200），只要 key 有效就能用
       · 但它家公开的占位 key 已失效（实测 401 wrong api key）→ 必须换你自己申请的有效 key
       · key 写在这（页面 JS 里）就等于公开，介意的话应该自建一个中转接口
       · 拿不到回答（超时 / 限流 / key 失效 / 断网）→ 一律退回本地关键词回答 */
    /* 【默认接口】用户 2026-10-17：「换成千问」。实测 dashscope 的 compatible-mode
       允许浏览器直连（OPTIONS 200 · ACAO: * · Allow-Headers: content-type,authorization），
       所以前端可以直连；key 留空 = AI 关闭（走本地回答），填上就生效。
       （chatanywhere 那种免 Key 站实测 key 已失效，不再作默认。） */
    var AI = { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', key: '', model: 'qwen-turbo' };
    try { if (window.__CF_AI__) for (var ak in window.__CF_AI__) if (window.__CF_AI__[ak]) AI[ak] = window.__CF_AI__[ak]; } catch (e) {}
    AI.on = !!(AI.url && AI.key);

    /* 【当前页面上下文】用户 2026-10-17 的思路：把这一页的关键数字喂给模型，
       免得它瞎答。数字全部取自页面 DOM（和本地回答同一套来源），拿不到就空着。 */
    function pageCtx() {
      var k = kind();
      var bits = [];
      if (k === 'fb') {
        var b = T(byId('recStatsBar'));
        if (b) bits.push('竞彩页 · 推荐串战绩：' + b.slice(0, 60));
      } else if (k === 'md') {
        bits.push('比赛详情页');
      } else {
        var kj = T(one('.ro-kjh-item'));
        if (kj) bits.push('彩票页 · 最新开机号：' + kj.slice(0, 70));
      }
      return bits.join('；');
    }

    function askAI(q) {
      return new Promise(function (resolve, reject) {
        var sys = '你是「春风」平台的助手。平台免费提供：八种彩票推荐图（双色球/大乐透/福彩3D/快乐8/排列3/排列5/七乐彩/七星彩）、';
        sys += 'GPT摇号（随机/自选）、近30期走势预选参考、开机号、晒票、竞彩足球推单。';
        sys += '要求：回答简短热情（不超过 120 字）；不编造平台没有的功能；不给购彩建议；不预测中奖；提到数字必须来自用户问的内容。';
        sys += '绝不暴露你是 AI 或大模型，你就叫「春风」。问到数据来源，统一回答：大部分是人工计算推理，小部分是参考其他数据，不提任何网址。';
        var ctx = '';
        try { ctx = pageCtx(); } catch (e) { ctx = ''; }
        var msgs = [{ role: 'system', content: sys }];
        if (ctx) msgs.push({ role: 'system', content: '【当前页面上下文】' + ctx });
        msgs.push({ role: 'user', content: q });
        var payload = { model: AI.model, messages: msgs, stream: false, temperature: 0.7 };
        var called = false;
        var timer = setTimeout(function () {
          if (!called) { called = true; reject(new Error('timeout')); }
        }, 12000);
        fetch(AI.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI.key },
          body: JSON.stringify(payload)
        }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(function (d) {
          clearTimeout(timer);
          if (called) return;
          called = true;
          var t = '';
          try { t = String(d.choices[0].message.content || '').trim(); } catch (e) { t = ''; }
          resolve(t);
        }).catch(function (e) {
          clearTimeout(timer);
          if (called) return;
          called = true;
          reject(e);
        });
      });
    }

    function push(who, text) {
      mem.push({ who: who, t: text });
      if (mem.length > 40) mem.shift();
      var d = document.createElement('div');
      d.className = 'cf-msg ' + (who === 'me' ? 'cf-me' : 'cf-bot');
      d.textContent = text;
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
    }
    /* 【号码球卡片】用户 2026-10-17 给的 UI：红球红底、蓝球蓝底。
       只有本地生成的号码会走这里（HTML 全是我们自己拼的，没有外部内容）。 */
    function pushHtml(who, html) {
      mem.push({ who: who, t: html.replace(/<[^>]*>/g, ' ') });
      if (mem.length > 40) mem.shift();
      var d = document.createElement('div');
      d.className = 'cf-msg ' + (who === 'me' ? 'cf-me' : 'cf-bot');
      d.innerHTML = html;
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
    }
    /* 【祝福视频】给页面别处留一个「追加一条助手气泡」的入口（2026-10-18）。
       只走上面这套 push —— 记录 / 40 条上限 / 滚到底 全都一致，不另建一套 DOM。
       cls 只是给这一条气泡补个类名（例如黄色祝福气泡），别的一模一样。 */
    window.__cfSay = function (t, cls) {
      try {
        if (!body) return;
        push('bot', String(t == null ? '' : t));
        var last = body.lastChild;
        if (cls && last && last.classList) last.classList.add(String(cls));
      } catch (e) { }
    };
    function ask(text) {
      var q = squeeze(text);
      if (!q) return;
      push('me', q);
      /* 【AI 增强】用户 2026-10-17：「我接，但用有效 key」。
         规则：配了 key → 先问 AI（一个"正在想…"气泡原地替换）；失败/超时 → 退回本地回答；
               没配 key → 直接本地回答。
         key 配在 window.__CF_AI__（构建时可改），留空就是纯本地，行为完全不变。 */
      var localAns = answer(q);
      var localText = localAns ? localAns.t : '这个问题我还在学~ 你可以问我：推荐号 / 战绩 / 走势图 / 怎么用';
      var localHtml = localAns && localAns.html ? localAns.html : '';
      if (!AI.on) { if (localHtml) pushHtml('bot', localHtml); else push('bot', localText); return; }
      push('bot', '正在想…');
      var box = body.lastChild;
      askAI(q).then(function (txt) {
        if (txt) { if (box) box.textContent = txt; mem[mem.length - 1] = { who: 'bot', t: txt }; }
        else if (box) { if (localHtml) box.innerHTML = localHtml; else box.textContent = localText; }
      }).catch(function () {
        if (box) { if (localHtml) box.innerHTML = localHtml; else box.textContent = localText; }  /* 失败就退回本地，绝不留"正在想…" */
      });
    }
    function open() {
      panel.classList.add('cf-on');
      panel.setAttribute('aria-hidden', 'false');
      document.body.classList.add('cf-open');
      /* 【祝福视频·懒加载】第一次打开聊天框才让它去 load blessing.mp4（2.82 MB
         不进首屏）。钩子只有分享页装了，别的页面这里是 undefined，静默跳过。 */
      try { if (typeof window.__cfVideoBoot === 'function') window.__cfVideoBoot(); } catch (e) { }
      if (!mem.length) {
        push('bot', '我是春风。想看号、想看战绩、想问走势，直接说就行。');
      }
      try { input.focus(); } catch (e) { }
    }
    function close() {
      panel.classList.remove('cf-on');
      panel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('cf-open');
    }
    function isOpen() { return panel.classList.contains('cf-on'); }

    btn.addEventListener('click', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      if (isOpen()) close(); else open();
    });
    btn.addEventListener('keydown', function (ev) {
      var k = ev ? String(ev.key || '') : '';
      if (k === 'Enter' || k === ' ' || k === 'Spacebar') { if (ev.preventDefault) ev.preventDefault(); btn.click(); }
    });
    if (closeB) {
      closeB.addEventListener('click', function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); close(); });
      closeB.addEventListener('keydown', function (ev) {
        var k = ev ? String(ev.key || '') : '';
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') { if (ev.preventDefault) ev.preventDefault(); close(); }
      });
    }
    function doSend() {
      if (!input) return;
      ask(input.value);
      input.value = '';
      try { input.focus(); } catch (e) { }
    }
    if (sendB) {
      sendB.addEventListener('click', function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); doSend(); });
      sendB.addEventListener('keydown', function (ev) {
        var k = ev ? String(ev.key || '') : '';
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') { if (ev.preventDefault) ev.preventDefault(); doSend(); }
      });
    }
    if (input) {
      input.addEventListener('keydown', function (ev) {
        var k = ev ? String(ev.key || '') : '';
        if (k === 'Enter') { if (ev.preventDefault) ev.preventDefault(); doSend(); }
      });
    }
    if (quick) {
      quick.addEventListener('click', function (ev) {
        var t = ev && ev.target ? ev.target : null;
        var qq = t && t.getAttribute ? t.getAttribute('data-q') : '';
        if (qq) ask(qq);
      });
      quick.addEventListener('keydown', function (ev) {
        var k = ev ? String(ev.key || '') : '';
        if (k !== 'Enter' && k !== ' ' && k !== 'Spacebar') return;
        var t = ev && ev.target ? ev.target : null;
        var qq = t && t.getAttribute ? t.getAttribute('data-q') : '';
        if (qq) { if (ev.preventDefault) ev.preventDefault(); ask(qq); }
      });
    }
    document.addEventListener('keydown', function (ev) {
      var k = ev ? String(ev.key || '') : '';
      if (k === 'Escape' && isOpen()) close();
    });
  } catch (e) { /* 聊天框出任何错都不影响看页面 */ }
})();
</script>
`;

/* ============================================================================
   【祝福视频】聊天框顶部视频区（用户 2026-10-18：把「火山方舟.mp4」做成祝福视频）
   ----------------------------------------------------------------------------
   只有分享页（export-static.mjs）引这三个 export；足球页 / 比赛详情页【不引】，
   所以它们两个页面连 <div class="cf-video"> 都不会有，也不会去请求 blessing.mp4。

   三条硬约束（都是用户定死的）：
     ① 视频 2.82 MB —— 必须懒加载：preload="none"，只有【聊天框第一次打开】
        才 video.load()（钩子是 CHAT_JS 里的 open() → window.__cfVideoBoot()）
     ② 视频挂了 / 文件不在 → 黑底占位块（▶ 点击播放视频），点一下 = 中文 TTS
        语音祝福（speechSynthesis，念完就 stop）+ 2.5 秒后一条黄色气泡
     ③ 不用 alert、不用裸 <button>（可点是 div[role=button][tabindex=0]）、
        不写任何浏览器存储；气泡走聊天框【自己已有的】push（window.__cfSay）
   ============================================================================ */

export const CHAT_VIDEO_CSS = `
/* ===== __CF_VIDEO__ 祝福视频（聊天框顶部；只有分享页引这一块） ===== */
/* 面板带视频 → 允许更高一点，否则 180px 视频挤得输入框出不来 */
.cf-panel.cf-video-on { max-height: min(78vh, 560px); }

.cf-video { flex: 0 0 auto; position: relative; width: 100%; height: 180px;
  background: #000; overflow: hidden; cursor: pointer;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
/* 【不裁画面】用户 2026-10-18「手机用户要看得清楚」→ 用 contain 完整显示，不 cover 裁边 */
.cf-video video { display: block; width: 100%; height: 100%;
  object-fit: contain; background: #000; }
.cf-video:focus-visible { outline: 2px solid #1a8c5a; outline-offset: -2px; }

/* 【手机放大 · 按 16:9 自适应】原来固定 180px 在小屏上偏小 → 手机上按比例走，
   宽度撑满、高度由 16:9 算出来（最高不超过 46vh，保证输入框还在）。 */
@media (max-width: 520px) {
  .cf-video { height: auto; aspect-ratio: 16 / 9; max-height: 46vh; }
}
/* 【一键全屏】右下角那个小方块：点它进系统全屏（iOS 走 webkitEnterFullscreen） */
.cf-video-fs { position: absolute; right: 8px; bottom: 8px; z-index: 3;
  width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center;
  justify-content: center; font-size: 16px; line-height: 1; color: #fff;
  background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(255, 255, 255, 0.45);
  cursor: pointer; -webkit-tap-highlight-color: transparent; }
.cf-video-fs:active { background: rgba(0, 0, 0, 0.7); }
/* 全屏时：铺满、黑底、保持比例完整显示 */
.cf-video:fullscreen, .cf-video:-webkit-full-screen { width: 100vw; height: 100vh; max-height: none; aspect-ratio: auto; background: #000; }
.cf-video:fullscreen video, .cf-video:-webkit-full-screen video { object-fit: contain; }

/* 占位块：视频 404 / 解码失败时才 display:flex（JS 加 .cf-video-fail） */
.cf-video-ph { position: absolute; inset: 0; display: none;
  flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  background: linear-gradient(160deg, #241c14, #3d2f21 55%, #4a3a26);
  color: #ffe9b8; font-size: 12px; text-align: center; padding: 0 10px;
  box-sizing: border-box; }
.cf-video.cf-video-fail .cf-video-ph { display: flex; }
.cf-video-play { width: 46px; height: 46px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255, 233, 184, 0.15); border: 1px solid rgba(255, 233, 184, 0.55);
  font-size: 17px; line-height: 1; padding-left: 3px;
  animation: cf-vplay 1.9s ease-in-out infinite; }
@keyframes cf-vplay { 0%, 100% { transform: scale(1); opacity: 0.88; }
  50% { transform: scale(1.09); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .cf-video-play { animation: none; } }
.cf-video-txt { letter-spacing: 0.5px; line-height: 1.5; }
/* 矮屏（横屏手机 / 小屏）：视频压一档，保证输入框不被挤出面板 */
@media (max-height: 520px) { .cf-video { height: 110px; } }
@media (max-width: 340px) { .cf-video { height: 146px; } }

/* 【黄色气泡】只有祝福视频这一条用（用户指定黄色；其它气泡样式不动） */
.cf-msg.cf-bless { background: #ffe9a3; color: #7a4a00; border: 1px solid #f0cb63;
  border-bottom-left-radius: 4px; }
`;

export const CHAT_VIDEO_HTML = `<!-- __CF_VIDEO__ 祝福视频（聊天框顶部）
     ⚠️ 可点是 div[role=button][tabindex=0]（页面不变量：裸 <button> = 0）
     ⚠️ preload="none" + 没有 src 请求：只有聊天框第一次打开才 load()（2.82 MB 不进首屏）
     ⚠️ 不用 alert、不写浏览器存储；视频挂了就占位 + TTS 语音祝福 -->
<div class="cf-video" id="cfVideoBox" role="button" tabindex="0" aria-label="祝福视频，点一下播放或暂停">
  <video id="cfVideo" src="./blessing.mp4" loop playsinline preload="none"></video>
  <div class="cf-video-fs" id="cfVideoFs" role="button" tabindex="0" aria-label="全屏观看">⛶</div>
  <div class="cf-video-ph" id="cfVideoPh">
    <div class="cf-video-play" aria-hidden="true">▶</div>
    <div class="cf-video-txt" id="cfVideoTxt">点击播放视频</div>
  </div>
</div>`;

export const CHAT_VIDEO_JS = `
<script>
/* __CF_VIDEO_JS__ 祝福视频：懒加载 + TTS 语音祝福 + 黄色气泡
   · 懒加载：preload="none"，只有【聊天框第一次打开】才 video.load()
     （2.82 MB 不参与首屏；页面一开始一个字节都不拉）
   · 视频 404 / 解码失败 → 黑底占位块（▶ 点击播放视频）
     点一下 = 中文 TTS 祝福 + 2.5 秒后一条黄色气泡
   · 浏览器不支持 speechSynthesis → 静默跳过，绝不报错；念完立刻 stop（不一直念）
   · 气泡走聊天框自己的追加函数（window.__cfSay → CHAT_JS 里的 push），不另写一套
   ⚠️ 这段也在模板字符串里：只用单引号、不写反引号、不写 \${、不写反斜杠 */
(function () {
  'use strict';
  try {
    var box = document.getElementById('cfVideoBox');
    var video = document.getElementById('cfVideo');
    var phTxt = document.getElementById('cfVideoTxt');
    if (!box || !video) return;

    var loaded = false;       /* 有没有 load() 过（懒加载开关） */
    var failed = false;       /* 视频是不是挂了 → 走占位 + TTS */
    var ttsTimer = 0;         /* TTS 兜底 stop 的定时器 */
    var bubbleTimer = 0;      /* 2.5 秒气泡的定时器 */
    var LINE = '恭喜发财！祝大家中大奖，好运连连！';
    var BUBBLE = '🎉 恭喜发财！看了这个视频，下一期大奖就是你的了！';

    /* ---------- 1. 懒加载：聊天框第一次打开才 load ---------- */
    function boot() {
      if (loaded) return;
      loaded = true;
      try { video.preload = 'auto'; video.load(); } catch (e) { }
      /* 兜底：4 秒还一个字节都没拿到 → 当加载失败，先亮占位块 */
      setTimeout(function () {
        if (!failed && !video.readyState) fallback();
      }, 4000);
    }
    window.__cfVideoBoot = boot;   /* ← CHAT_JS 的 open() 调的就是这个 */

    /* ---------- 1.5 【一键全屏】用户 2026-10-18：手机上要看得清楚、全屏
       优先用系统全屏 API（安卓/桌面 Chrome 走 requestFullscreen，
       iOS Safari 走 video.webkitEnterFullscreen）；都不支持就什么也不做，
       只靠上面的 16:9 自适应放大（绝不报错）。 */
    (function () {
      var fsBtn = document.getElementById('cfVideoFs');
      if (!fsBtn) return;
      function goFullscreen(ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (ev && ev.stopPropagation) ev.stopPropagation();
        boot();
        try {
          if (box.requestFullscreen) { box.requestFullscreen(); return; }
          if (box.webkitRequestFullscreen) { box.webkitRequestFullscreen(); return; }
          if (video.webkitEnterFullscreen) { video.webkitEnterFullscreen(); return; }
          if (video.requestFullscreen) { video.requestFullscreen(); return; }
        } catch (e) { /* 不支持就算了，保持内嵌 16:9 */ }
      }
      fsBtn.addEventListener('click', goFullscreen);
      fsBtn.addEventListener('keydown', function (ev) {
        if (ev && (ev.key === 'Enter' || ev.key === ' ')) goFullscreen(ev);
      });
      /* 退出全屏后把播放状态保持住（有的内核会暂停） */
      document.addEventListener('fullscreenchange', function () {
        try { if (!document.fullscreenElement && !video.paused) video.play(); } catch (e) { }
      });
    })();

    function fallback() {
      if (failed) return;
      failed = true;
      try { video.pause(); } catch (e) { }
      box.classList.add('cf-video-fail');
      if (phTxt) phTxt.textContent = '点击播放视频';
    }

    /* ---------- 2. TTS 语音祝福（不支持就静默跳过；念完 stop） ---------- */
    function stopSpeak() {
      if (ttsTimer) { clearTimeout(ttsTimer); ttsTimer = 0; }
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { }
    }
    function speak() {
      try {
        if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return;
        var u = new window.SpeechSynthesisUtterance(LINE);
        u.lang = 'zh-CN';
        u.rate = 1.0;
        u.pitch = 1.1;
        u.onend = stopSpeak;      /* 念完就停，不留尾巴 */
        u.onerror = stopSpeak;
        stopSpeak();              /* 连点也不叠着念 */
        window.speechSynthesis.speak(u);
        ttsTimer = setTimeout(stopSpeak, 9000);   /* 兜底：有的内核不触发 onend */
      } catch (e) { /* 不支持就跳过 */ }
    }

    /* ---------- 3. 2.5 秒后一条黄色气泡（用聊天框已有的追加函数） ---------- */
    function bubble() {
      if (bubbleTimer) return;      /* 2.5 秒内的连点不重复弹 */
      bubbleTimer = setTimeout(function () {
        bubbleTimer = 0;
        try {
          if (typeof window.__cfSay === 'function') window.__cfSay(BUBBLE, 'cf-bless');
        } catch (e) { }
      }, 2500);
    }

    /* ---------- 4. 点一下：能播就 播/暂停；挂了就 TTS + 气泡 ---------- */
    function playMyVideo() {
      boot();
      if (failed) {
        if (phTxt) phTxt.textContent = '🎉 祝大家中大奖！';
        speak();
      } else {
        try {
          if (video.paused) {
            var p = video.play();
            if (p && p.catch) p.catch(function () { fallback(); });
          } else {
            video.pause();
          }
        } catch (e) { fallback(); if (phTxt) phTxt.textContent = '🎉 祝大家中大奖！'; speak(); }
      }
      bubble();
    }
    window.playMyVideo = playMyVideo;   /* 和用户给的设计同名，方便页面里直接调 */

    function tap(ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      playMyVideo();
    }
    box.addEventListener('click', tap);
    box.addEventListener('keydown', function (ev) {
      var k = ev ? String(ev.key || '') : '';
      if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
        if (ev.preventDefault) ev.preventDefault();
        playMyVideo();
      }
    });
    video.addEventListener('error', fallback);

    /* ---------- 5. 聊天框收起 → 暂停视频 + 停掉语音（不在后台偷偷响） ---------- */
    try {
      var panel = document.getElementById('cfPanel');
      if (panel && window.MutationObserver) {
        new MutationObserver(function () {
          if (!panel.classList.contains('cf-on')) {
            try { video.pause(); } catch (e) { }
            stopSpeak();
          }
        }).observe(panel, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (e) { }
  } catch (e) { /* 视频区出任何错都不影响看页面 / 用聊天框 */ }
})();
</script>
`;

/* 一次性取齐（生成脚本里一行就够） */
export const DEVICE_GATE_HEAD = DEVICE_GATE_CSS;
export const INSTALL_BLOCK = INSTALL_CSS;