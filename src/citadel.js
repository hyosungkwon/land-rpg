// land-rpg / src/citadel.js
// v5.12.0 🏰 영지 성채 — 영구 시설 5종 건설(환생 후에도 영구 유지).
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
//   - 대장간(강화 할인·공격) / 마법탑(쿨감·스킬 위력) / 연금술실(방치 효율·상한)
//     펫 훈련소(보조 펫·파견 보상) / 거래소 본부(거래세 감면·경매 할인·임대)
import { birthState } from './rebirth.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const CITADEL_MAX_LV = 10;

export const CITADEL_FACILITIES = [
  {
    id: 'forge',
    name: '대장간',
    icon: '🔨',
    color: '#ff9a5c',
    baseGold: 15000,
    baseShards: 22,
    desc: '장비 강화 비용 할인 · 공격력 영구 증가',
    effect: (lv) => `강화석 -${(lv * 2.5).toFixed(1)}% · 공격력 +${(lv * 1.5).toFixed(1)}%`,
  },
  {
    id: 'tower',
    name: '마법탑',
    icon: '🗼',
    color: '#b98bff',
    baseGold: 18000,
    baseShards: 26,
    desc: '스킬 쿨타임 단축 · 기본 스킬 위력 증가',
    effect: (lv) => `스킬 쿨감 -${(lv * 1.2).toFixed(1)}% · 스킬 위력 +${lv * 3}%`,
  },
  {
    id: 'alchemy',
    name: '연금술실',
    icon: '⚗️',
    color: '#5ee1a3',
    baseGold: 16000,
    baseShards: 20,
    desc: '오프라인 방치 보상 효율·최대 시간 확대',
    effect: (lv) => `방치 효율 +${lv * 2}%p · 상한 +${(lv * 0.6).toFixed(1)}시간`,
  },
  {
    id: 'barracks',
    name: '펫 훈련소',
    icon: '🐾',
    color: '#69c0ff',
    baseGold: 20000,
    baseShards: 24,
    desc: '보조 펫 효율 강화 · 영지 파견 보상 증가',
    effect: (lv) => `보조 펫 +${(lv * 2.5).toFixed(1)}%p · 파견 보상 +${lv * 4}%`,
  },
  {
    id: 'exchange',
    name: '거래소 본부',
    icon: '🏦',
    color: '#ffcf5c',
    baseGold: 24000,
    baseShards: 20,
    desc: '거래세 감면 · 급매 경매 할인 · 전체 임대수익 증가',
    effect: (lv) => `거래세 -${lv * 8}% · 경매 -${(lv * 1.5).toFixed(1)}% · 임대 +${lv * 2}%`,
  },
];

export const CITADEL_IDS = CITADEL_FACILITIES.map((f) => f.id);
export const CITADEL_BY_ID = Object.fromEntries(CITADEL_FACILITIES.map((f) => [f.id, f]));

export function defaultCitadel() {
  const levels = {};
  for (const id of CITADEL_IDS) levels[id] = 0;
  return { levels, totalSpendGold: 0, totalSpendShards: 0 };
}

export function normalizeCitadel(raw) {
  const d = defaultCitadel();
  if (!raw || typeof raw !== 'object') return d;
  const src = raw.levels && typeof raw.levels === 'object' ? raw.levels : {};
  for (const id of CITADEL_IDS) {
    d.levels[id] = clamp(Math.floor(num(src[id], 0)), 0, CITADEL_MAX_LV);
  }
  d.totalSpendGold = Math.max(0, Math.floor(num(raw.totalSpendGold, 0)));
  d.totalSpendShards = Math.max(0, Math.floor(num(raw.totalSpendShards, 0)));
  return d;
}

export function citadelLevel(state, id) {
  const v = state && state.citadel && state.citadel.levels && state.citadel.levels[id];
  return clamp(Math.floor(num(v, 0)), 0, CITADEL_MAX_LV);
}

/** 다음 레벨 건설/증축 비용 (Lv.5 이후부터 초월석 소량 요구) */
export function citadelCost(id, lv) {
  const def = CITADEL_BY_ID[id];
  const cur = clamp(Math.floor(num(lv, 0)), 0, CITADEL_MAX_LV);
  if (!def || cur >= CITADEL_MAX_LV) return null;
  return {
    gold: Math.round(def.baseGold * Math.pow(2.05, cur)),
    shards: Math.round(def.baseShards * Math.pow(1.42, cur)),
    points: cur >= 5 ? (cur - 4) * 4 : 0,
  };
}

/** 영지 성채 전체 효과 집계 (Lv.0 일 때 모든 수치 0 → 기존 밸런스 불변) */
export function citadelEffects(state) {
  const forge = citadelLevel(state, 'forge');
  const tower = citadelLevel(state, 'tower');
  const alchemy = citadelLevel(state, 'alchemy');
  const barracks = citadelLevel(state, 'barracks');
  const exchange = citadelLevel(state, 'exchange');
  return {
    forge,
    tower,
    alchemy,
    barracks,
    exchange,
    totalLv: forge + tower + alchemy + barracks + exchange,
    maxTotalLv: CITADEL_MAX_LV * CITADEL_IDS.length,
    forgeDiscount: Math.min(0.25, forge * 0.025),
    atkPct: Math.round(forge * 1.5 * 10) / 10,
    skillCdrPct: Math.round(tower * 1.2 * 10) / 10,
    skillPowerPct: tower * 3,
    offlineRateAdd: Math.round(alchemy * 0.02 * 1000) / 1000,
    offlineCapHoursAdd: Math.round(alchemy * 0.6 * 10) / 10,
    subPetRateAdd: Math.round(barracks * 0.025 * 1000) / 1000,
    expYieldPct: barracks * 4,
    tradeFeeDiscount: Math.min(0.8, exchange * 0.08),
    auctionDiscount: Math.min(0.15, exchange * 0.015),
    rentPct: exchange * 2,
  };
}

/** 업그레이드 가능 여부 견적 */
export function citadelUpgradeQuote(state, id) {
  const def = CITADEL_BY_ID[id];
  if (!def) return { ok: false, reason: '알 수 없는 시설입니다.' };
  const lv = citadelLevel(state, id);
  if (lv >= CITADEL_MAX_LV) return { ok: false, max: true, lv, def, reason: '최대 레벨에 도달했습니다.' };
  const cost = citadelCost(id, lv);
  const gold = Math.max(0, Math.floor(num(state && state.gold, 0)));
  const shards = Math.max(0, Math.floor(num(state && state.shards, 0)));
  const points = Math.max(0, Math.floor(num(state && state.rebirth && state.rebirth.points, 0)));
  const okGold = gold >= cost.gold;
  const okShards = shards >= cost.shards;
  const okPoints = points >= cost.points;
  const can = okGold && okShards && okPoints;
  const reason = !okGold
    ? `골드가 부족합니다 (필요 💰${cost.gold.toLocaleString()})`
    : !okShards
      ? `강화석이 부족합니다 (필요 💎${cost.shards.toLocaleString()})`
      : !okPoints
        ? `초월석이 부족합니다 (필요 ✨${cost.points}P)`
        : '건설 가능';
  return { ok: can, can, max: false, lv, next: lv + 1, def, cost, okGold, okShards, okPoints, reason };
}

/** 시설 건설/증축 실행 */
export function upgradeCitadel(state, id) {
  const q = citadelUpgradeQuote(state, id);
  if (!q.can) return { ok: false, reason: q.reason, quote: q };
  if (!state.citadel || typeof state.citadel !== 'object') state.citadel = defaultCitadel();
  if (!state.citadel.levels || typeof state.citadel.levels !== 'object') state.citadel.levels = defaultCitadel().levels;
  state.gold = Math.max(0, Math.floor(num(state.gold, 0) - q.cost.gold));
  state.shards = Math.max(0, Math.floor(num(state.shards, 0) - q.cost.shards));
  if (q.cost.points > 0) {
    const rb = birthState(state);
    rb.points = Math.max(0, Math.floor(num(rb.points, 0) - q.cost.points));
  }
  state.citadel.levels[id] = q.next;
  state.citadel.totalSpendGold = Math.max(0, Math.floor(num(state.citadel.totalSpendGold, 0))) + q.cost.gold;
  state.citadel.totalSpendShards = Math.max(0, Math.floor(num(state.citadel.totalSpendShards, 0))) + q.cost.shards;
  return { ok: true, id, def: q.def, lv: q.next, spent: q.cost, effects: citadelEffects(state) };
}
