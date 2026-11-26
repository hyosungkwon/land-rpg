// land-rpg / src/rift.js
// v6.7.0 🌀 무한 균열 — 로그라이크 웨이브 던전 + 3웨이브마다 3택 1 축복 카드 선택.
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
import { stageGoldBase } from './data.js';
import { birthState } from './rebirth.js';
import { GEMS, defaultGems } from './gems.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);

export const RIFT = {
  cooldownMs: 10 * 60 * 1000, // 10분 쿨타임
  waveTimeMs: 22000,          // 웨이브당 제한 시간 22초 (클리어 시 갱신)
  normalPerWave: 6,           // v7.1.0 일반 웨이브 6마리 (대규모 웨이브 체감)
  bossWaveMinions: 4,         // 3배수 보스 웨이브: 잡몹 4 + 보스 1
  blessEvery: 3,              // 3웨이브 클리어마다 3택 1 축복 카드
  maxAlive: 8,
  spawnMs: 500,
};

export const RIFT_MONSTERS = [
  ['Goblin', 'Orc', 'Werewolf'],
  ['Skeleton', 'ShadowWraith', 'DarkElf'],
  ['FireImp', 'MagmaGolem', 'Drake'],
  ['IceWolf', 'FrostWisp', 'FrostGolem'],
  ['AbyssEye', 'AbyssKnight', 'Gargoyle'],
];
export const RIFT_BOSSES = ['Troll', 'LichKing', 'Ifrit', 'IceGiant', 'AbyssLord', 'Phoenix', 'Behemoth'];

export const RIFT_CARDS = [
  { id: 'atk',     icon: '⚔️', name: '분노의 칼날',   color: '#ff7a5c', desc: '균열 공격력 +35%',                     fx: { atkPct: 35 } },
  { id: 'spd',     icon: '⚡', name: '질풍의 서약',   color: '#69c0ff', desc: '공격 속도 +25%',                       fx: { spdPct: 25 } },
  { id: 'crit',    icon: '💥', name: '치명타 폭발',   color: '#ffcf5c', desc: '치명타 +15% · 치명 피해 +50%',         fx: { critPct: 15, critDmgPct: 50 } },
  { id: 'leech',   icon: '🩸', name: '흡혈 광란',     color: '#ff5e8a', desc: '즉시 체력 50% 회복 · 타격 시 흡혈 +4%', fx: { leechPct: 4, healNowPct: 50 } },
  { id: 'shield',  icon: '🛡️', name: '절대 방벽',     color: '#7fd3ff', desc: '체력 45% 보호막 · 피해 감소 +12%',     fx: { shieldNowPct: 45, dmgRedPct: 12 } },
  { id: 'chain',   icon: '🌩️', name: '번개 연쇄',     color: '#b98bff', desc: '타격 시 주변 모든 적에게 35% 번개 연쇄', fx: { chainPct: 35 } },
  { id: 'pet',     icon: '🐾', name: '펫 폭주',       color: '#5ee1a3', desc: '동행 펫 공격력 +80%',                  fx: { petPct: 80 } },
  { id: 'cdr',     icon: '⏳', name: '시간 가속',     color: '#9ad8ff', desc: '스킬 쿨타임 즉시 초기화 · 쿨감 +25%',  fx: { resetCd: true, cdrPct: 25 } },
  { id: 'execute', icon: '💀', name: '처형자의 낙인', color: '#ff9068', desc: '보스 및 체력 40% 이하 적 피해 +55%',   fx: { execPct: 55 } },
  { id: 'greed',   icon: '💰', name: '황금 폭풍',     color: '#ffd76a', desc: '이번 균열 골드·강화석 보상 +40%',      fx: { rewardPct: 40 } },
];
export const RIFT_CARD_BY_ID = RIFT_CARDS.reduce((m, c) => { m[c.id] = c; return m; }, {});

export function defaultRift() {
  return {
    bestWave: 0,
    runs: 0,
    totalWaves: 0,
    lastAt: 0,
    last: null,
  };
}

export function normalizeRift(raw) {
  const d = defaultRift();
  if (!raw || typeof raw !== 'object') return d;
  return {
    bestWave: Math.max(0, Math.floor(num(raw.bestWave, 0))),
    runs: Math.max(0, Math.floor(num(raw.runs, 0))),
    totalWaves: Math.max(0, Math.floor(num(raw.totalWaves, 0))),
    lastAt: Math.max(0, Math.floor(num(raw.lastAt, 0))),
    last: raw.last && typeof raw.last === 'object' ? raw.last : null,
  };
}

export function riftStatus(state, now = Date.now()) {
  const r = (state && state.rift) || defaultRift();
  const leftMs = r.lastAt > 0 ? Math.max(0, r.lastAt + RIFT.cooldownMs - now) : 0;
  return {
    ready: leftMs <= 0,
    leftMs,
    bestWave: Math.max(0, Math.floor(num(r.bestWave, 0))),
    runs: Math.max(0, Math.floor(num(r.runs, 0))),
    totalWaves: Math.max(0, Math.floor(num(r.totalWaves, 0))),
    last: r.last || null,
  };
}

/** 3택 1 축복 카드 3장 랜덤 추출(중복 없음) */
export function rollRiftChoices(rng = Math.random) {
  const pool = RIFT_CARDS.slice();
  const out = [];
  while (out.length < 3 && pool.length) {
    const idx = Math.floor(rng() * pool.length) % pool.length;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** 누적 선택된 축복 카드 합산 효과 */
export function riftCardMods(pickedIds) {
  const out = { atkPct: 0, spdPct: 0, critPct: 0, critDmgPct: 0, leechPct: 0, dmgRedPct: 0, chainPct: 0, petPct: 0, cdrPct: 0, execPct: 0, rewardPct: 0 };
  if (!Array.isArray(pickedIds)) return out;
  for (const id of pickedIds) {
    const def = RIFT_CARD_BY_ID[id];
    if (!def || !def.fx) continue;
    for (const k of Object.keys(out)) {
      if (def.fx[k]) out[k] += def.fx[k];
    }
  }
  return out;
}

/** 균열 종료 보상 계산 및 상태 지급 */
export function settleRiftReward(state, wavesCleared, pickedIds = [], now = Date.now(), rng = Math.random) {
  if (!state) return null;
  if (!state.rift || typeof state.rift !== 'object') state.rift = defaultRift();
  const waves = Math.max(0, Math.floor(num(wavesCleared, 0)));
  const mods = riftCardMods(pickedIds);
  const rewardMul = 1 + mods.rewardPct / 100;
  const refStage = Math.max(1, Math.floor(num(state.peakStage || state.maxStage || state.stage, 1)));

  const gold = waves > 0 ? Math.max(200, Math.round(stageGoldBase(refStage) * waves * 18 * rewardMul)) : 0;
  const shards = waves > 0 ? Math.round((8 + waves * 5) * rewardMul) : 0;
  const points = Math.floor(waves / 3);
  let bonusGem = null;
  let bonusMedal = 0;

  if (gold > 0) {
    state.gold = Math.max(0, Math.floor(num(state.gold, 0))) + gold;
    if (state.records) state.records.totalGold = (state.records.totalGold || 0) + gold;
  }
  if (shards > 0) state.shards = Math.max(0, Math.floor(num(state.shards, 0))) + shards;
  if (points > 0) {
    const rb = birthState(state);
    rb.points = Math.max(0, Math.floor(num(rb.points, 0))) + points;
    rb.totalPoints = Math.max(0, Math.floor(num(rb.totalPoints, 0))) + points;
  }
  if (waves >= 6) {
    const gem = GEMS[Math.floor(rng() * GEMS.length) % GEMS.length] || GEMS[0];
    if (!state.gems || typeof state.gems !== 'object') state.gems = defaultGems();
    if (!state.gems.bag[gem.id]) state.gems.bag[gem.id] = [0, 0, 0, 0, 0];
    state.gems.bag[gem.id][0] = Math.min(999, (state.gems.bag[gem.id][0] || 0) + 1);
    bonusGem = gem;
  }
  if (waves >= 9) {
    if (!state.invasion || typeof state.invasion !== 'object') state.invasion = { wins: 0, medals: 0, lastBlock: -1, booms: {}, last: null };
    state.invasion.medals = Math.max(0, Math.floor(num(state.invasion.medals, 0))) + 1;
    bonusMedal = 1;
  }

  const prevBest = Math.max(0, Math.floor(num(state.rift.bestWave, 0)));
  const isBest = waves > prevBest;
  state.rift.bestWave = Math.max(prevBest, waves);
  state.rift.runs = Math.max(0, Math.floor(num(state.rift.runs, 0))) + 1;
  state.rift.totalWaves = Math.max(0, Math.floor(num(state.rift.totalWaves, 0))) + waves;
  state.rift.lastAt = Math.floor(now);
  state.rift.last = { at: Math.floor(now), waves, gold, shards, points, cards: pickedIds.slice() };
  return { waves, gold, shards, points, bonusGem, bonusMedal, isBest, bestWave: state.rift.bestWave };
}
