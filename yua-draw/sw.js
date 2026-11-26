/* yua-draw/sw.js — 2026-11-26 통합 이후: 이 경로는 안내 페이지로 바뀌었습니다.
   남아 있는 yua-draw 캐시를 지우고 스스로 등록을 해제합니다. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.indexOf('yua-draw-') === 0).map((k) => caches.delete(k)));
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
  })());
});
