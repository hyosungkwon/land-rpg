/* kids-app/sw.js — 🌟 유아의 놀이터 전용 서비스워커 (범위: /kids-app/)
   상위 land-rpg 서비스워커가 이 폴더의 HTML을 자기 캐시(index.html)에 덮어쓰지 않도록
   더 좁은 범위의 워커로 직접 처리한다. 네트워크 우선 + 캐시는 오프라인 대비.
   v4 (2026-11-26): 친구 교감(pet.js) 추가 — 캐시 목록에 pet.js 포함 */
const CACHE = 'kids-app-v4';
const CORE = [
  './',
  './index.html',
  './style.css',
  './js/data.js',
  './js/topics.js',
  './js/core.js',
  './js/draw.js',
  './js/puzzle.js',
  './js/fun.js',
  './js/music.js',
  './js/art.js',
  './js/learn.js',
  './js/fishing.js',
  './js/pet.js'
];

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
    await Promise.all(keys.filter((k) => k.indexOf('kids-app-') === 0 && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/kids-app/') !== 0) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // 화면(HTML)은 항상 서버에 확인해서, 새로 배포한 화면이 바로 보이게 한다.
      const fresh = await fetch(req, req.mode === 'navigate' ? { cache: 'no-cache' } : undefined);
      if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
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
