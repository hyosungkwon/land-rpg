// land-rpg / sw.js — 오프라인 캐시 (방치형 RPG 는 네트워크 없이도 플레이 가능해야 함)
// Firebase/CDN 요청은 캐시하지 않고 네트워크로 그대로 보낸다.
const VERSION = 'land-rpg-v1.0.2';
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./src/data.js",
  "./src/state.js",
  "./src/combat.js",
  "./src/render.js",
  "./src/ui.js",
  "./src/firebase.js",
  "./src/property.js",
  "./assets/char/warrior.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./assets/monster/AncientDragon.png",
  "./assets/monster/AncientOne.png",
  "./assets/monster/Basilisk.png",
  "./assets/monster/Behemoth.png",
  "./assets/monster/Beholder.png",
  "./assets/monster/BlackKnight.png",
  "./assets/monster/Bugbear.png",
  "./assets/monster/Cerberus.png",
  "./assets/monster/ChaosOverlord.png",
  "./assets/monster/Cockatrice.png",
  "./assets/monster/Cyclops.png",
  "./assets/monster/DeathKnight.png",
  "./assets/monster/DeathLord.png",
  "./assets/monster/DemiGod.png",
  "./assets/monster/DragonLord.png",
  "./assets/monster/Drake.png",
  "./assets/monster/FrostGiant.png",
  "./assets/monster/Gargoyle.png",
  "./assets/monster/Ghoul.png",
  "./assets/monster/GiantAnt.png",
  "./assets/monster/GiantWorm.png",
  "./assets/monster/Goblin.png",
  "./assets/monster/Golem.png",
  "./assets/monster/Harpy.png",
  "./assets/monster/Kobold.png",
  "./assets/monster/Kraken.png",
  "./assets/monster/Leviathan.png",
  "./assets/monster/Lich.png",
  "./assets/monster/Lizardman.png",
  "./assets/monster/Minotaur.png",
  "./assets/monster/Ogre.png",
  "./assets/monster/Orc.png",
  "./assets/monster/Phoenix.png",
  "./assets/monster/RedDragon.png",
  "./assets/monster/Scorpion.png",
  "./assets/monster/ShadowKnight.png",
  "./assets/monster/Skeleton.png",
  "./assets/monster/Slime.png",
  "./assets/monster/Succubus.png",
  "./assets/monster/Tiamat.png",
  "./assets/monster/Troll.png",
  "./assets/monster/Werewolf.png",
  "./assets/monster/WorldEater.png",
  "./assets/monster/Wyvern.png",
  "./assets/monster/Zombie.png",
  "./assets/boss/AbyssalHorror.png",
  "./assets/boss/CelestialGuard.png",
  "./assets/boss/DarkTitan.png",
  "./assets/boss/Seraphim.png",
  "./assets/boss/SlimeKing.png",
  "./assets/boss/SoulReaper.png",
  "./assets/boss/VoidWalker.png"
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
