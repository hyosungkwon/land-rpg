// land-rpg / src/relics.js
// v6.1.0 🏺 고대 유물(아티팩트) 12종 — 규칙을 바꾸는 특수 패시브 + 방어 훈장 소비처.
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
import { birthState } from './rebirth.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const RELIC_SLOTS = 3;
export const RELIC_MAX_LV = 5;

export const RELIC_SUMMON_COST = {
  medal: { medals: 1, label: '🏅 훈장 1개' },
  points: { points: 6, gold: 50000, label: '✨ 6P · 💰5만' },
  shards: { shards: 120, gold: 50000, label: '💎 120 · 💰5만' },
};

export const RELICS = [
  {
    id: 'hourglass', name: '시간의 모래시계', icon: '⏳', color: '#7fd3ff',
    desc: '치명타 적중 시 기본 스킬 쿨타임 단축',
    effect: (lv) => `치명타 시 쿨타임 -${(0.12 + 0.04 * lv).toFixed(2)}초`,
  },
  {
    id: 'phoenix', name: '불사조의 깃털', icon: '🔥', color: '#ff7a45',
    desc: '치명상 시 쿨타임마다 즉시 부활 + 4초 보호막',
    effect: (lv) => `즉시 부활(체력 ${40 + 6 * lv}% · 쿨 ${95 - 8 * lv}초)`,
  },
  {
    id: 'magnet', name: '황금 자석', icon: '🧲', color: '#ffcf5c',
    desc: '보물 고블린 출현 확률 증가 · 도주 시간 연장',
    effect: (lv) => `보물 고블린 출현 +${60 + 25 * lv}% · +${2 + lv}초`,
  },
  {
    id: 'scroll', name: '호재의 두루마리', icon: '📜', color: '#ffe38a',
    desc: '부동산 호재 뉴스의 임대 보너스 증폭',
    effect: (lv) => `호재 임대 보너스 +${20 + 10 * lv}% 증폭`,
  },
  {
    id: 'seal', name: '영주의 인장', icon: '🛡️', color: '#ff8a95',
    desc: '영지 침공 방어전 호황 시간 연장 · 보상 증가',
    effect: (lv) => `방어 호황 +${10 + 5 * lv}분 · 보상 +${15 + 5 * lv}%`,
  },
  {
    id: 'compass', name: '탐험가의 나침반', icon: '🧭', color: '#5ee1a3',
    desc: '펫 영지 파견 소요 시간 단축 · 대성공 확률 상승',
    effect: (lv) => `파견 시간 -${8 + 4 * lv}% · 대성공 +${4 + 2 * lv}%p`,
  },
  {
    id: 'crown', name: '제왕의 면류관', icon: '👑', color: '#ffd76a',
    desc: '공격력과 보스 추가 피해 영구 상승',
    effect: (lv) => `공격력 +${6 + 4 * lv}% · 보스 피해 +${6 + 4 * lv}%`,
  },
  {
    id: 'chalice', name: '불멸의 성배', icon: '🍷', color: '#e066ff',
    desc: '최대 체력과 흡혈 영구 상승',
    effect: (lv) => `체력 +${8 + 4 * lv}% · 흡혈 +${(1.5 + 0.8 * lv).toFixed(1)}%p`,
  },
  {
    id: 'dice', name: '행운의 주사위', icon: '🎲', color: '#69c0ff',
    desc: '강화석 드랍률과 치명타 확률 상승',
    effect: (lv) => `드랍률 +${10 + 6 * lv}% · 치명타 +${(2 + 1.5 * lv).toFixed(1)}%p`,
  },
  {
    id: 'ledger', name: '황금 원장', icon: '📒', color: '#ffcf5c',
    desc: '전체 임대수익과 사냥 골드 동시 증가',
    effect: (lv) => `임대수익 +${6 + 4 * lv}% · 사냥 골드 +${8 + 4 * lv}%`,
  },
  {
    id: 'horn', name: '전쟁의 뿔피리', icon: '📯', color: '#ff9a5c',
    desc: '동행 펫(주·보조)의 공격 위력 대폭 증가',
    effect: (lv) => `펫 공격 피해 +${12 + 8 * lv}%`,
  },
  {
    id: 'prism', name: '초월의 프리즘', icon: '🔮', color: '#b98bff',
    desc: '환생 초월석 획득량과 경험치 상승',
    effect: (lv) => `환생 초월석 +${10 + 6 * lv}% · 경험치 +${8 + 4 * lv}%`,
  },
];

export const RELIC_IDS = RELICS.map((r) => r.id);
export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export function defaultRelics() {
  return {
    owned: {},    // { id: lv (1..5) }
    frags: {},    // { id: duplicateCount }
    equipped: [], // max 3 ids
    summons: 0,
  };
}

export function normalizeRelics(raw) {
  const d = defaultRelics();
  if (!raw || typeof raw !== 'object') return d;
  const ro = raw.owned && typeof raw.owned === 'object' ? raw.owned : {};
  for (const id of RELIC_IDS) {
    const lv = clamp(Math.floor(num(ro[id], 0)), 0, RELIC_MAX_LV);
    if (lv >= 1) d.owned[id] = lv;
  }
  const rf = raw.frags && typeof raw.frags === 'object' ? raw.frags : {};
  for (const id of RELIC_IDS) {
    const f = Math.max(0, Math.floor(num(rf[id], 0)));
    if (f > 0 && d.owned[id]) d.frags[id] = f;
  }
  if (Array.isArray(raw.equipped)) {
    const seen = new Set();
    for (const id of raw.equipped) {
      if (d.equipped.length >= RELIC_SLOTS) break;
      if (typeof id === 'string' && d.owned[id] && !seen.has(id)) {
        seen.add(id);
        d.equipped.push(id);
      }
    }
  }
  d.summons = Math.max(0, Math.floor(num(raw.summons, 0)));
  return d;
}

export function relicLevel(state, id) {
  const lv = state && state.relics && state.relics.owned && state.relics.owned[id];
  return clamp(Math.floor(num(lv, 0)), 0, RELIC_MAX_LV);
}

/** 현재 장착된 유물들의 효과 합계 (미장착 시 모두 0 → 기존 밸런스 불변) */
export function relicEffects(state) {
  const out = {
    critCdTrimMs: 0,
    phoenixCdMs: 0,
    phoenixHpRatio: 0,
    goblinChanceMul: 1,
    goblinExtraMs: 0,
    newsRentBoost: 0,
    invBoomExtraMs: 0,
    invRewardMul: 1,
    expTimeReduce: 0,
    expGreatAdd: 0,
    atkPct: 0,
    bossDmgPct: 0,
    hpPct: 0,
    lifestealPct: 0,
    dropPct: 0,
    critPct: 0,
    rentPct: 0,
    goldPct: 0,
    petDmgPct: 0,
    rebirthPtsPct: 0,
    expPct: 0,
    equippedCount: 0,
  };
  const eq = state && state.relics && Array.isArray(state.relics.equipped) ? state.relics.equipped : [];
  for (const id of eq) {
    const lv = relicLevel(state, id);
    if (lv < 1) continue;
    out.equippedCount += 1;
    if (id === 'hourglass') out.critCdTrimMs = Math.round((0.12 + 0.04 * lv) * 1000);
    else if (id === 'phoenix') { out.phoenixCdMs = (95 - 8 * lv) * 1000; out.phoenixHpRatio = (40 + 6 * lv) / 100; }
    else if (id === 'magnet') { out.goblinChanceMul = 1 + (60 + 25 * lv) / 100; out.goblinExtraMs = (2 + lv) * 1000; }
    else if (id === 'scroll') out.newsRentBoost = (20 + 10 * lv) / 100;
    else if (id === 'seal') { out.invBoomExtraMs = (10 + 5 * lv) * 60 * 1000; out.invRewardMul = 1 + (15 + 5 * lv) / 100; }
    else if (id === 'compass') { out.expTimeReduce = (8 + 4 * lv) / 100; out.expGreatAdd = (4 + 2 * lv) / 100; }
    else if (id === 'crown') { out.atkPct += 6 + 4 * lv; out.bossDmgPct += 6 + 4 * lv; }
    else if (id === 'chalice') { out.hpPct += 8 + 4 * lv; out.lifestealPct += 1.5 + 0.8 * lv; }
    else if (id === 'dice') { out.dropPct += 10 + 6 * lv; out.critPct += 2 + 1.5 * lv; }
    else if (id === 'ledger') { out.rentPct += 6 + 4 * lv; out.goldPct += 8 + 4 * lv; }
    else if (id === 'horn') out.petDmgPct += 12 + 8 * lv;
    else if (id === 'prism') { out.rebirthPtsPct += 10 + 6 * lv; out.expPct += 8 + 4 * lv; }
  }
  return out;
}

/** 유물 감정(소환): mode = 'medal' | 'points' | 'shards' */
export function summonRelic(state, mode = 'medal', rng = Math.random) {
  if (!state || typeof state !== 'object') return { ok: false, reason: '잘못된 상태입니다.' };
  if (!state.relics || typeof state.relics !== 'object') state.relics = defaultRelics();
  const r = state.relics;
  const cost = RELIC_SUMMON_COST[mode];
  if (!cost) return { ok: false, reason: '알 수 없는 감정 방식입니다.' };

  if (mode === 'medal') {
    const have = Math.max(0, Math.floor(num(state.invasion && state.invasion.medals, 0)));
    if (have < cost.medals) return { ok: false, reason: `방어 훈장이 부족합니다 (필요 🏅${cost.medals})` };
    state.invasion.medals = have - cost.medals;
  } else if (mode === 'points') {
    const rb = birthState(state);
    if ((rb.points || 0) < cost.points) return { ok: false, reason: `초월석이 부족합니다 (필요 ✨${cost.points}P)` };
    if ((state.gold || 0) < cost.gold) return { ok: false, reason: `골드가 부족합니다 (필요 💰${cost.gold.toLocaleString()})` };
    rb.points -= cost.points;
    state.gold -= cost.gold;
  } else {
    if ((state.shards || 0) < cost.shards) return { ok: false, reason: `강화석이 부족합니다 (필요 💎${cost.shards})` };
    if ((state.gold || 0) < cost.gold) return { ok: false, reason: `골드가 부족합니다 (필요 💰${cost.gold.toLocaleString()})` };
    state.shards -= cost.shards;
    state.gold -= cost.gold;
  }

  const unowned = RELIC_IDS.filter((id) => !(r.owned[id] >= 1));
  let pickId;
  if (unowned.length && rng() < 0.75) {
    pickId = unowned[Math.floor(rng() * unowned.length) % unowned.length];
  } else {
    pickId = RELIC_IDS[Math.floor(rng() * RELIC_IDS.length) % RELIC_IDS.length];
  }
  const def = RELIC_BY_ID[pickId];
  const isNew = !(r.owned[pickId] >= 1);
  if (isNew) {
    r.owned[pickId] = 1;
    if (r.equipped.length < RELIC_SLOTS && !r.equipped.includes(pickId)) r.equipped.push(pickId);
  } else {
    r.frags[pickId] = (r.frags[pickId] || 0) + 1;
  }
  r.summons = (r.summons || 0) + 1;
  return { ok: true, id: pickId, relic: def, isNew, lv: r.owned[pickId], frags: r.frags[pickId] || 0 };
}

/** 유물 장착/해제 토글 (최대 3슬롯) */
export function toggleEquipRelic(state, id) {
  if (!state || !state.relics || !RELIC_BY_ID[id]) return { ok: false, reason: '알 수 없는 유물입니다.' };
  const r = state.relics;
  if (!(r.owned && r.owned[id] >= 1)) return { ok: false, reason: '아직 보유하지 않은 유물입니다.' };
  const idx = r.equipped.indexOf(id);
  if (idx >= 0) {
    r.equipped.splice(idx, 1);
    return { ok: true, equipped: false, relic: RELIC_BY_ID[id] };
  }
  if (r.equipped.length >= RELIC_SLOTS) {
    return { ok: false, reason: `유물은 최대 ${RELIC_SLOTS}개까지 장착할 수 있습니다. 기존 유물을 먼저 해제하세요.` };
  }
  r.equipped.push(id);
  return { ok: true, equipped: true, relic: RELIC_BY_ID[id] };
}

/** 유물 강화(Lv.1~5): 동일 파편 lv개 우선 소비, 부족 시 초월석 lv*4P 소비 */
export function upgradeRelic(state, id) {
  if (!state || !state.relics || !RELIC_BY_ID[id]) return { ok: false, reason: '알 수 없는 유물입니다.' };
  const r = state.relics;
  const lv = relicLevel(state, id);
  if (lv < 1) return { ok: false, reason: '보유하지 않은 유물입니다.' };
  if (lv >= RELIC_MAX_LV) return { ok: false, reason: '최대 레벨(Lv.5)에 도달했습니다.' };
  const needFrags = lv;
  const haveFrags = Math.max(0, Math.floor(num(r.frags && r.frags[id], 0)));
  const needPts = lv * 4;
  const rb = birthState(state);
  if (haveFrags >= needFrags) {
    r.frags[id] = haveFrags - needFrags;
    r.owned[id] = lv + 1;
    return { ok: true, id, relic: RELIC_BY_ID[id], lv: lv + 1, paid: `파편 ${needFrags}개` };
  }
  if ((rb.points || 0) >= needPts) {
    rb.points -= needPts;
    r.owned[id] = lv + 1;
    return { ok: true, id, relic: RELIC_BY_ID[id], lv: lv + 1, paid: `✨${needPts}P` };
  }
  return { ok: false, reason: `동일 파편 ${needFrags}개(보유 ${haveFrags}) 또는 초월석 ✨${needPts}P 필요` };
}
