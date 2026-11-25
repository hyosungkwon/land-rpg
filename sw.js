// land-rpg / sw.js — 오프라인 캐시 (게스트 전용: 네트워크가 없어도 처음부터 끝까지 플레이)
const VERSION = 'land-rpg-v5.4.0';
// 같은 릴리스 안에서 자산을 고친 경우 BUILD 를 올린다 → 열린 탭이 새 캐시로 넘어온다.
const BUILD = 'r1';
const CACHE = `${VERSION}-${BUILD}`;
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
  './src/ui-fmt.js',
  './src/ui-cloud.js',
  './src/ui-gear.js',
  './src/ui.js',
  './src/sound.js',
  './src/land.js',
  './src/synergy.js',
  './src/auction.js',
  './src/land-data.js',
  './src/region.js',
  './src/meta.js',
  './src/tower.js',
  './src/daily.js',
  './src/gear.js',
  './src/quests.js',
  './src/rebirth.js',
  './src/savecode.js',
  './src/cloud.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  // 🖼️ 테마 전투 배경 8종 (v4.1 — 960×640 WebP, 장당 30~90KB)
  './assets/bg/meadow.webp',
  './assets/bg/forest.webp',
  './assets/bg/ruins.webp',
  './assets/bg/desert.webp',
  './assets/bg/cave.webp',
  './assets/bg/volcano.webp',
  './assets/bg/ice.webp',
  './assets/bg/abyss.webp',
  // 플레이어 3프레임 (대기 / 공격 / 스킬)
  './assets/sprites/hero_idle.png',
  './assets/sprites/hero_attack.png',
  './assets/sprites/hero_skill.png',
  // 🐾 동료 펫 4종 (v3.2)
  './assets/sprites/pet/pet_wolf.png',
  './assets/sprites/pet/pet_fox.png',
  './assets/sprites/pet/pet_owl.png',
  './assets/sprites/pet/pet_dragon.png',
  // 🐾 펫 진화 스프라이트 8종 (v4.2 — 각성 4 · 신수 4)
  './assets/sprites/pet/pet_wolf_awaken.png',
  './assets/sprites/pet/pet_wolf_divine.png',
  './assets/sprites/pet/pet_fox_awaken.png',
  './assets/sprites/pet/pet_fox_divine.png',
  './assets/sprites/pet/pet_owl_awaken.png',
  './assets/sprites/pet/pet_owl_divine.png',
  './assets/sprites/pet/pet_dragon_awaken.png',
  './assets/sprites/pet/pet_dragon_divine.png',
  // 몬스터 공격 이펙트 2종 (v3.7 — 추가 광원 합성용)
  './assets/sprites/fx/fx_claw.png',
  './assets/sprites/fx/fx_burst.png',
  // 일반 몬스터 23종 (v3.8: 모래벌·동굴·용암·빙원·심연 11종 추가)
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
  './assets/sprites/monster/Scorpion.png',
  './assets/sprites/monster/Mummy.png',
  './assets/sprites/monster/Sandworm.png',
  './assets/sprites/monster/Batling.png',
  './assets/sprites/monster/CaveSpider.png',
  './assets/sprites/monster/FireImp.png',
  './assets/sprites/monster/MagmaGolem.png',
  './assets/sprites/monster/IceWolf.png',
  './assets/sprites/monster/FrostWisp.png',
  './assets/sprites/monster/ShadowWraith.png',
  './assets/sprites/monster/AbyssEye.png',
  // 보스 12종 (v3.8: 5종 추가)
  './assets/sprites/boss/SlimeKing.png',
  './assets/sprites/boss/Troll.png',
  './assets/sprites/boss/Cerberus.png',
  './assets/sprites/boss/DeathLord.png',
  './assets/sprites/boss/RedDragon.png',
  './assets/sprites/boss/VoidWalker.png',
  './assets/sprites/boss/Seraphim.png',
  './assets/sprites/boss/Anubis.png',
  './assets/sprites/boss/CaveTroll.png',
  './assets/sprites/boss/Ifrit.png',
  './assets/sprites/boss/IceGiant.png',
  './assets/sprites/boss/AbyssLord.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache:'reload' 로 브라우저 HTTP 캐시를 건너뛰고 항상 최신 파일을 담는다.
      await Promise.all(
        CORE.map((url) =>
          fetch(new Request(url, { cache: 'reload' }))
            .then((res) => (res && res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      // 구버전 앱이 열려 있으면 새 버전으로 한 번 넘긴다(구버전 자동 새로고침 코드가 없는 경우 대비).
      try {
        const list = await self.clients.matchAll({ type: 'window' });
        for (const c of list) {
          if (c.url && c.url.indexOf(self.registration.scope) === 0 && c.navigate) {
            c.navigate(c.url).catch(() => {});
          }
        }
      } catch (e) { /* ignore */ }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  // 외부(CDN 등) 요청은 그대로 네트워크로 보낸다.
  if (url.origin !== self.location.origin) return;

  // 페이지 이동: 네트워크 우선, 실패 시 캐시된 index.html (오프라인 실행)
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put('./index.html', fresh.clone()).catch(() => {});
          return fresh;
        } catch (e) {
          const cache = await caches.open(CACHE);
          return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
        }
      })()
    );
    return;
  }

  // 정적 자산: 캐시 우선 + 백그라운드 갱신
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
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
