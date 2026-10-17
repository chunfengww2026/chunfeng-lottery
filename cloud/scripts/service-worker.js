/* ============================================================
   service-worker.js —— PWA 启动加速版
   ------------------------------------------------------------
   用户 2026-10-18：「让网页和手机桌面进入更流畅」。
   上一版是【纯透传】：不缓存 → 每次从桌面图标打开都要重新下载
   整个 1.4 MB 的页面 + 图标 + 脚本 ✗ 启动慢。

   现在的策略（保证数据不旧）：
     · 静态资源（图标 / manifest / 字体 / CSS / JS）→ cache-first（秒开 ✓）
       —— 这些文件带内容指纹或很少变，缓存不会让页面显示旧数据
     · 页面 HTML → network-first（永远拿最新 ✓），断网才用缓存兜底
     · 其它一律直接过（不碰接口、不碰数据）
   ============================================================ */
const CACHE = 'cf-static-v2';
const STATIC_RE = /\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|css|js)$/i;

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  /* 清掉旧版本缓存 */
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('cf-static')).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   /* 外部图床不拦 */

  /* 静态资源：cache-first（秒开） */
  if (STATIC_RE.test(url.pathname)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const c = await caches.open(CACHE);
          c.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return hit || Response.error();
      }
    })());
    return;
  }

  /* 页面：network-first（永远拿最新数据），断网才用缓存 */
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    } catch (e) {
      const hit = await caches.match(req);
      if (hit) return hit;
      return new Response('离线状态：请联网后再打开', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
