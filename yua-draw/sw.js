/* yua-draw/sw.js — yua-draw 전용 서비스워커 (범위: /yua-draw/)
   상위 land-rpg 서비스워커가 이 폴더의 요청을 캐시우선으로 가로채지 않도록
   더 좁은 범위의 워커로 직접 처리한다. 항상 네트워크 우선 + 캐시는 오프라인 대비. */
const CACHE = 'yua-draw-v1';
const CORE = ['./', './index.html', './style.css?v=8', './topics.js?v=8', './app.js?v=8'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.indexOf('yua-draw-') === 0 && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && url.pathname.indexOf('/yua-draw/') === 0) {
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (e) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const idx = await cache.match('./index.html');
        if (idx) return idx;
      }
      return Response.error();
    }
  })());
});
