// land-rpg / sw.js — 오프라인 캐시 (게스트 전용: 네트워크가 없어도 처음부터 끝까지 플레이)
const VERSION = 'land-rpg-v8.0.0';
// 같은 릴리스 안에서 자산을 고친 경우 BUILD 를 올린다 → 열린 탭이 새 캐시로 넘어온다.
const BUILD = 'r4';
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
  './src/ui-land.js',
  './src/ui-hunt.js',
  './src/ui.js',
  './src/sound.js',
  './src/land.js',
  './src/synergy.js',
  './src/auction.js',
  './src/orders.js',
  './src/portfolio-ops.js',
  './src/land-data.js',
  './src/region.js',
  './src/expedition.js',
  './src/invasion.js',
  './src/citadel.js',
  './src/relics.js',
  './src/meta.js',
  './src/tower.js',
  './src/daily.js',
  './src/gear.js',
  './src/gems.js',
  './src/quests.js',
  './src/pass.js',
  './src/rift.js',
  './src/bank.js',
  './src/guild.js',
  './src/hub.js',
  './src/guide.js',
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
  // 🐾 동료 펫 6종 (v3.2: 4종 · v5.8: 크리스탈 골렘 · 천둥 매 추가)
  './assets/sprites/pet/pet_wolf.png',
  './assets/sprites/pet/pet_fox.png',
  './assets/sprites/pet/pet_owl.png',
  './assets/sprites/pet/pet_dragon.png',
  './assets/sprites/pet/pet_golem.png',
  './assets/sprites/pet/pet_hawk.png',
  // 🐾 펫 진화 스프라이트 12종 (v4.2: 8종 · v5.8: 4종)
  './assets/sprites/pet/pet_wolf_awaken.png',
  './assets/sprites/pet/pet_wolf_divine.png',
  './assets/sprites/pet/pet_fox_awaken.png',
  './assets/sprites/pet/pet_fox_divine.png',
  './assets/sprites/pet/pet_owl_awaken.png',
  './assets/sprites/pet/pet_owl_divine.png',
  './assets/sprites/pet/pet_dragon_awaken.png',
  './assets/sprites/pet/pet_dragon_divine.png',
  './assets/sprites/pet/pet_golem_awaken.png',
  './assets/sprites/pet/pet_golem_divine.png',
  './assets/sprites/pet/pet_hawk_awaken.png',
  './assets/sprites/pet/pet_hawk_divine.png',
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
  // v5.7 신규 일반 몬스터 6종
  './assets/sprites/monster/TreasureGoblin.png',
  './assets/sprites/monster/Lizardman.png',
  './assets/sprites/monster/Gargoyle.png',
  './assets/sprites/monster/DarkElf.png',
  './assets/sprites/monster/FrostGolem.png',
  './assets/sprites/monster/AbyssKnight.png',
  // 보스 16종 (v3.8: +5, v5.7: +4)
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
  './assets/sprites/boss/AbyssLord.png',
  './assets/sprites/boss/LichKing.png',
  './assets/sprites/boss/Phoenix.png',
  './assets/sprites/boss/Kraken.png',
  './assets/sprites/boss/Behemoth.png',
  // v7.6 신규 일러스트 몬스터 4종 · 보스 1종
  './assets/sprites/monster/CrystalGolem.png',
  './assets/sprites/monster/LavaHound.png',
  './assets/sprites/monster/SandGolem.png',
  './assets/sprites/monster/VampireKnight.png',
  './assets/sprites/boss/StormTitan.png',
  // v7.6 장비 55종 고퀄리티 일러스트 아이콘 (WebP)
  './assets/items/w_iron.webp', './assets/items/w_steel.webp', './assets/items/w_axe.webp',
  './assets/items/w_flame.webp', './assets/items/w_frost.webp', './assets/items/w_thunder.webp',
  './assets/items/w_dragon.webp', './assets/items/w_katana.webp', './assets/items/w_hammer.webp',
  './assets/items/w_stormbow.webp', './assets/items/w_scythe.webp',
  './assets/items/a_leather.webp', './assets/items/a_chain.webp', './assets/items/a_plate.webp',
  './assets/items/a_guard.webp', './assets/items/a_scale.webp', './assets/items/a_holy.webp',
  './assets/items/a_abyss.webp', './assets/items/a_windmail.webp', './assets/items/a_goldrobe.webp',
  './assets/items/a_aegis.webp', './assets/items/a_dragonlord.webp',
  './assets/items/h_cloth.webp', './assets/items/h_iron.webp', './assets/items/h_hood.webp',
  './assets/items/h_horn.webp', './assets/items/h_crown.webp', './assets/items/h_dragon.webp',
  './assets/items/h_abyss.webp', './assets/items/h_visor.webp', './assets/items/h_stormcirc.webp',
  './assets/items/h_paladin.webp', './assets/items/h_midas.webp',
  './assets/items/r_copper.webp', './assets/items/r_silver.webp', './assets/items/r_ruby.webp',
  './assets/items/r_sharp.webp', './assets/items/r_storm.webp', './assets/items/r_sage.webp',
  './assets/items/r_eye.webp', './assets/items/r_guard.webp', './assets/items/r_fortune.webp',
  './assets/items/r_tempest.webp', './assets/items/r_titan.webp',
  './assets/items/m_wood.webp', './assets/items/m_silver.webp', './assets/items/m_clover.webp',
  './assets/items/m_crystal.webp', './assets/items/m_ember.webp', './assets/items/m_star.webp',
  './assets/items/m_grail.webp', './assets/items/m_stormrel.webp', './assets/items/m_guardrel.webp',
  './assets/items/m_phoenix.webp', './assets/items/m_midas.webp'
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
      await Promise.all(keys.filter((k) => k.startsWith('land-rpg-') && k !== CACHE).map((k) => caches.delete(k)));
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
  // 외부(CDN 등) 요청 및 독립 앱(/yua-draw/) 경로는 그대로 통과시킨다.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/yua-draw/')) return;
  // 독립 앱(/kids-app/)도 같은 이유로 그대로 통과시킨다.
  if (url.pathname.includes('/kids-app/')) return;

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
