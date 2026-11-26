// land-rpg / src/invasion.js
// v5.11.0 🚨 영지 침공 방어전 — 부동산 ↔ 전투 직접 융합.
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
//   - 30분 블록마다 보유 지역(랜드마크 보유지 우선)에 마물 침공 경보 발생.
//   - 35초 제한 방어전(잡몹 8 + 침공 보스 1) 승리 시:
//     · 해당 지역 30분 호황 버프(임대수익 +50%)
//     · 방어 훈장 + 대량 골드 + 강화석 + (조건 시) 초월석
//   - 무시하거나 패배해도 부동산 피해 없음(언제든 재도전).
import { stageGoldBase, monsterKo } from './data.js';
import { CITY_BY_KEY, landmarkLevel, seededRandom, hashString } from './land.js';
import { birthState } from './rebirth.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);

export const INVASION = {
  intervalMs: 30 * 60 * 1000, // 30분마다 새 침공 경보
  durationMs: 35000,          // 35초 제한 방어전
  minionGoal: 8,              // 잡몹 8마리 처치 후 침공 보스 등장
  goal: 9,                    // 총 9마리(잡몹 8 + 보스 1)
  maxAlive: 7,
  spawnMs: 560,
  hpSecNormal: 1.35,          // 내 DPS 기준 일반 침공 몹 처치 시간
  hpSecBoss: 7.5,             // 내 DPS 기준 침공 보스 처치 시간
  atkOfHpPct: 1.2,            // 몹 1회 공격 = 내 최대 체력의 1.2%
  bossAtkMul: 1.65,
  boomPct: 50,                // 방어 성공 시 해당 지역 임대수익 +50%
  boomDurMs: 30 * 60 * 1000,  // 호황 지속 30분
};

const INVASION_WAVES = [
  { name: '고블린 약탈단',   normals: ['Goblin', 'Kobold', 'Orc'],              boss: 'Troll' },
  { name: '용암 공성군',     normals: ['FireImp', 'MagmaGolem', 'Drake'],       boss: 'Ifrit' },
  { name: '서리 침략대',     normals: ['IceWolf', 'FrostWisp', 'FrostGolem'],   boss: 'IceGiant' },
  { name: '망령 습격대',     normals: ['Skeleton', 'ShadowWraith', 'DarkElf'],  boss: 'LichKing' },
  { name: '심연의 선봉대',   normals: ['AbyssEye', 'AbyssKnight', 'Gargoyle'],  boss: 'AbyssLord' },
  { name: '사막 약탈 군단',  normals: ['Scorpion', 'Mummy', 'Lizardman'],       boss: 'Anubis' },
];

export function defaultInvasion() {
  return {
    wins: 0,
    medals: 0,
    lastBlock: -1,
    booms: {}, // { cityKey: endsAtMs }
    last: null,
  };
}

/** 저장 정규화 — 만료된 호황·미보유 지역 정리 */
export function normalizeInvasion(raw, owned, now = Date.now()) {
  const d = defaultInvasion();
  if (!raw || typeof raw !== 'object') return d;
  const held = owned && typeof owned === 'object' ? owned : {};
  const booms = {};
  if (raw.booms && typeof raw.booms === 'object') {
    for (const [k, v] of Object.entries(raw.booms)) {
      const end = Math.floor(num(v, 0));
      if (CITY_BY_KEY[k] && Math.floor(num(held[k], 0)) > 0 && end > now) {
        booms[k] = end;
      }
    }
  }
  return {
    wins: Math.max(0, Math.floor(num(raw.wins, 0))),
    medals: Math.max(0, Math.floor(num(raw.medals, 0))),
    lastBlock: Math.floor(num(raw.lastBlock, -1)),
    booms,
    last: raw.last && typeof raw.last === 'object' ? raw.last : null,
  };
}

/** 해당 지역의 침공 방어 호황 버프(%) — 활성 시 50, 아니면 0 */
export function invasionBoomPct(state, cityKey, now = Date.now()) {
  const b = state && state.invasion && state.invasion.booms;
  if (!b || typeof b !== 'object' || !cityKey) return 0;
  return num(b[cityKey], 0) > now ? INVASION.boomPct : 0;
}

/** 현재 활성 호황 지역 목록 */
export function activeInvasionBooms(state, now = Date.now()) {
  const b = state && state.invasion && state.invasion.booms;
  if (!b || typeof b !== 'object') return [];
  const owned = (state && state.land && state.land.owned) || {};
  const out = [];
  for (const [k, end] of Object.entries(b)) {
    const endMs = Math.floor(num(end, 0));
    if (endMs > now && CITY_BY_KEY[k] && Math.floor(num(owned[k], 0)) > 0) {
      out.push({ key: k, city: CITY_BY_KEY[k], endsAt: endMs, leftMs: endMs - now, pct: INVASION.boomPct });
    }
  }
  return out.sort((a, b2) => b2.leftMs - a.leftMs);
}

/** 현재 침공 경보 상태 계산 (결정론적 30분 블록) */
export function invasionStatus(state, now = Date.now()) {
  const inv = (state && state.invasion) || defaultInvasion();
  const owned = (state && state.land && state.land.owned) || {};
  const keys = Object.keys(owned).filter((k) => CITY_BY_KEY[k] && Math.floor(num(owned[k], 0)) > 0).sort();
  const block = Math.floor(now / INVASION.intervalMs);
  const nextAt = (block + 1) * INVASION.intervalMs;
  const nextMs = Math.max(0, nextAt - now);
  const activeBooms = activeInvasionBooms(state, now);

  if (!keys.length) {
    return {
      hasLand: false,
      available: false,
      won: false,
      block,
      nextMs,
      city: null,
      landmarkLv: 0,
      wave: null,
      wins: inv.wins || 0,
      medals: inv.medals || 0,
      activeBooms,
      last: inv.last || null,
      reward: null,
    };
  }

  // 랜드마크 건설 지역이 있으면 우선 후보군으로 삼는다
  const lmKeys = keys.filter((k) => landmarkLevel(state, k) > 0);
  const pool = lmKeys.length ? lmKeys : keys;
  const pickIdx = Math.floor(seededRandom(hashString(`inv#${block}`) + pool.length * 31) * pool.length) % pool.length;
  const cityKey = pool[pickIdx];
  const city = CITY_BY_KEY[cityKey];
  const lmLv = landmarkLevel(state, cityKey);
  const waveIdx = Math.floor(seededRandom(hashString(`wave#${block}`)) * INVASION_WAVES.length) % INVASION_WAVES.length;
  const wave = INVASION_WAVES[waveIdx];
  const won = inv.lastBlock === block;

  const refStage = Math.max(1, Math.floor(num((state && (state.peakStage || state.maxStage || state.stage)), 1)));
  // v6.1 🛡️ 영주의 인장 유물 — 침공 호황 시간 연장 · 보상 증가
  const rEq = (state && state.relics && Array.isArray(state.relics.equipped)) ? state.relics.equipped : [];
  const sealLv = rEq.includes('seal') ? Math.max(0, Math.min(5, Math.floor(num(state.relics.owned && state.relics.owned.seal, 0)))) : 0;
  const sealMul = sealLv > 0 ? 1 + (15 + 5 * sealLv) / 100 : 1;
  const sealExtraMs = sealLv > 0 ? (10 + 5 * sealLv) * 60 * 1000 : 0;
  const gold = Math.max(300, Math.round(stageGoldBase(refStage) * (55 + lmLv * 25) * sealMul));
  const shards = Math.round((24 + lmLv * 12) * sealMul);
  const points = (lmLv >= 1 || refStage >= 20) ? (1 + lmLv) : 0;

  return {
    hasLand: true,
    available: !won,
    won,
    block,
    nextMs,
    city,
    cityKey,
    landmarkLv: lmLv,
    wave: { ...wave, bossKo: monsterKo(wave.boss) },
    wins: inv.wins || 0,
    medals: inv.medals || 0,
    activeBooms,
    last: inv.last || null,
    reward: { gold, shards, points, boomPct: INVASION.boomPct, boomDurMs: INVASION.boomDurMs + sealExtraMs },
  };
}

/** 침공 방어 승리 보상 지급 및 호황 버프 등록 */
export function recordInvasionWin(state, info, now = Date.now()) {
  if (!state || !info || !info.city || !info.reward) return null;
  if (!state.invasion || typeof state.invasion !== 'object') state.invasion = defaultInvasion();
  const inv = state.invasion;
  const { gold, shards, points, boomPct, boomDurMs } = info.reward;
  state.gold = Math.max(0, Math.floor(num(state.gold, 0))) + gold;
  state.shards = Math.max(0, Math.floor(num(state.shards, 0))) + shards;
  if (state.records) state.records.totalGold = (state.records.totalGold || 0) + gold;
  if (points > 0) {
    const rb = birthState(state);
    rb.points = Math.max(0, Math.floor(num(rb.points, 0))) + points;
    rb.totalPoints = Math.max(0, Math.floor(num(rb.totalPoints, 0))) + points;
  }
  inv.wins = Math.max(0, Math.floor(num(inv.wins, 0))) + 1;
  inv.medals = Math.max(0, Math.floor(num(inv.medals, 0))) + 1;
  inv.lastBlock = info.block;
  if (!inv.booms || typeof inv.booms !== 'object') inv.booms = {};
  inv.booms[info.city.key] = Math.floor(now) + boomDurMs;
  inv.last = {
    cityKey: info.city.key,
    cityName: info.city.name,
    waveName: info.wave ? info.wave.name : '',
    gold,
    shards,
    points,
    boomPct,
    at: Math.floor(now),
  };
  return {
    city: info.city,
    gold,
    shards,
    points,
    boomPct,
    boomDurMs,
    medals: inv.medals,
    wins: inv.wins,
  };
}
