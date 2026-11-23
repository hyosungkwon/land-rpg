// land-rpg / sw.js — 오프라인 캐시 (방치형 RPG 는 네트워크 없이도 플레이 가능해야 함)
// Firebase/CDN 요청은 캐시하지 않고 네트워크로 그대로 보낸다.
const VERSION = 'land-rpg-v2.0.4';
const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './src/data.js',
  './src/state.js',
  './src/combat.js',
  './src/render.js',
  './src/ui.js',
  './src/firebase.js',
  './src/property.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  // 플레이어 3프레임 (대기 / 공격 / 스킬)
  './assets/sprites/hero_idle.png',
  './assets/sprites/hero_attack.png',
  './assets/sprites/hero_skill.png',
  // 일반 몬스터 12종
  './assets/sprites/monster/Slime.png',
  './assets/sprites/monster/Goblin.png',
  './assets/sprites/monster/Kobold.png',
  './assets/sprites/monster/Orc.png',
  './assets/sprites/monster/Skeleton.png',
  './assets/sprites/monster/Zombie.png',
  './assets/sprites/monster/Werewolf.png',
  './assets/sprites/monster/Harpy.png',
  './assets/sprites/monster/Cyclops.png',
  './assets/sprites/monster/Minotaur.png',
  './assets/sprites/monster/Golem.png',
  './assets/sprites/monster/Drake.png',
  // 보스 7종
  './assets/sprites/boss/SlimeKing.png',
  './assets/sprites/boss/Troll.png',
  './assets/sprites/boss/Cerberus.png',
  './assets/sprites/boss/DeathLord.png',
  './assets/sprites/boss/RedDragon.png',
  './assets/sprites/boss/VoidWalker.png',
  './assets/sprites/boss/Seraphim.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // 개별 add: 한 파일이 실패해도 나머지는 캐시된다.
      await Promise.all(CORE.map((url) => cache.add(url).catch(() => null)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// 새 버전이 설치되면 대기 중인 SW 를 즉시 활성화하고 열려 있는 모든 탭을 새 버전으로 넘긴다.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const PASSTHROUGH = [
  'firebaseio.com', 'googleapis.com', 'gstatic.com', 'firebaseapp.com',
  'google-analytics', 'googletagmanager.com',
];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) {
    if (PASSTHROUGH.some((h) => url.hostname.includes(h))) return; // 브라우저 기본 처리
    return;
  }

  // 페이지 이동: 네트워크 우선, 실패 시 캐시된 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(VERSION);
          cache.put('./index.html', fresh.clone()).catch(() => {});
          return fresh;
        } catch (e) {
          const cache = await caches.open(VERSION);
          return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
        }
      })()
    );
    return;
  }

  // 정적 자산: 캐시 우선 + 백그라운드 갱신
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) {
        fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return Response.error();
      }
    })()
  );
});
