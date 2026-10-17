/* ============================================================
   service-worker.js —— 只为了满足「可安装（Installable）」要求
   ------------------------------------------------------------
   ⚠️ 这个 SW 【故意不缓存任何东西】：
      本站页面在跑 30 秒实时刷新、数据靠 CDN 更新，
      一旦 SW 做缓存（cache-first / precache），数字就会被冻在旧版本上。
      所以 fetch 一律走网络（fetch(request) 原样透传），
      只提供"存在一个 fetch 处理器"这个安装条件。
   ⚠️ file:// 打开时 SW 注册会失败（浏览器不允许）—— 页面里已经 catch 住，不影响使用；
      真正需要 SW 的是 https 上的线上站点。
   ============================================================ */

self.addEventListener('install', function () {
  /* 不等旧版本用完了：新 SW 立刻进入等待 → activate 里 claim 接管 */
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (!req) return;
  /* 非 GET（POST/PUT 等）不进 SW，交给浏览器 */
  if (req.method && req.method !== 'GET') return;
  /* 透传：走网络，不查缓存、不写缓存。
     离线时返回 504，页面自己的逻辑（重试/占位）照常处理。 */
  event.respondWith(
    fetch(req).catch(function () {
      return new Response('', { status: 504, statusText: 'Service Unavailable (offline)' });
    })
  );
});
