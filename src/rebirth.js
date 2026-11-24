// land-rpg / src/rebirth.js
// v3.5 ♾️ 환생(초월) — 사냥 회차만 새로 시작하고 부동산·펫·장비 등급은 그대로 가져간다.
//   - 해금: 최고 스테이지(현재 회차) S20 이상.
//   - 환생 시 도달 스테이지에 따라 초월석(환생 포인트)을 받고, 그 포인트로 영구 특성 6종을 올린다.
//   - 초기화: 레벨·현재/최고 스테이지·보유 골드·장비 강화 레벨·전직 단계 (사냥 회차)
//   - 유지:   부동산·랜드마크·임대수익 · 동료 펫 · 장비 등급 · 업적·도감·미션 · 초월석·특성
// DOM 의존 없음 → 헤드리스 검증 가능.
import { ECON } from './data.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ────────────────────────────── 규칙 ────────────────────────────── */
export const REBIRTH = {
  stageReq: 20, // 이 스테이지 이상 도달하면 환생 가능
  pointBase: 2, // 초월석 = pointBase × (스테이지-19)^pointExp
  pointExp: 1.35, // 계단식(지수) 가속
  minPoints: 3, // S20 최소 지급
};

/* ────────────────────── 환생 후 중간 스테이지 점프 (v4.1) ──────────────────────
 * “직전까지 한 번에”는 막고, 직전 최고 스테이지의 일부 구간까지만 골라 시작한다.
 *  - 상한 = floor(직전 최고 × 0.55)  → 최고의 50~60% 선
 *  - 선택지 = S1 + 5스테이지 단위 + 상한 자체(5단위로 안 멁어지면 마지막에 붙인다)
 *  - 점프 시작은 최소한의 레벨·골드만 보정한다(장비 등급·특성은 원래 유지된다)
 */
export const REBIRTH_JUMP = {
  ratio: 0.55, // 직전 최고 대비 상한 비율
  step: 5, // 선택지 스테이지 간격
  levelPerStage: 1.5, // 점프 1스테이지당 시작 레벨 보정
  goldPerStage: 120, // 점프 1스테이지당 시작 골드 보정
};

/** 도달 스테이지 → 이번 환생으로 받는 초월석 */
export function rebirthPointsFor(stage) {
  const s = Math.max(0, Math.floor(num(stage, 0)));
  const n = s - (REBIRTH.stageReq - 1); // S20 → 1, S21 → 2 …
  if (n <= 0) return 0;
  return Math.max(REBIRTH.minPoints, Math.round(REBIRTH.pointBase * Math.pow(n, REBIRTH.pointExp)));
}

/* ────────────────────────────── 영구 특성 7종 ──────────────────────────────
 * 포인트로 레벨을 올리고, 효과는 calcStats·전투·보상에 영구 반영된다.
 *  atk       공격력 +4%/Lv        gold   골드 획득 +5%/Lv
 *  hp        최대 체력 +5%/Lv      shard  강화석 획득 +6%/Lv
 *  startGold 환생 직후 시작 골드  critDmg 치명타 피해 +3%p/Lv
 *  guard     피해 감소 +2%p/Lv (v3.8)  — 고스테이지 다굴을 버티는 핵심
 *  regen     초당 회복 +0.12%/s/Lv (v3.8)
 */
export const REBIRTH_TRAITS = [
  {
    id: 'atk', name: '초월의 검', icon: '⚔️', per: 4, unit: '%', maxLv: 20,
    desc: '공격력이 영구히 오릅니다.', effect: (lv) => `공격력 +${lv * 4}%`,
  },
  {
    id: 'guard', name: '초월의 수호', icon: '🛡️', per: 2, unit: '%p', maxLv: 20,
    desc: '받는 피해가 영구히 줄어든다 — 몰려드는 무리를 버팁니다.',
    effect: (lv) => `피해 감소 +${lv * 2}%p`,
  },
  {
    id: 'hp', name: '초월의 심장', icon: '❤️', per: 5, unit: '%', maxLv: 20,
    desc: '최대 체력이 영구히 오릅니다.', effect: (lv) => `최대 체력 +${lv * 5}%`,
  },
  {
    id: 'regen', name: '초월의 생명', icon: '🌿', per: 0.12, unit: '%/s', maxLv: 20,
    desc: '자연 회복이 빨라져 오래 버팁니다.',
    effect: (lv) => `초당 회복 +${(lv * 0.12).toFixed(2)}%/s`,
  },
  {
    id: 'gold', name: '초월의 금고', icon: '💰', per: 5, unit: '%', maxLv: 20,
    desc: '사냥·임대 등 모든 골드 획득이 늘어납니다.', effect: (lv) => `골드 획득 +${lv * 5}%`,
  },
  {
    id: 'shard', name: '초월의 결정', icon: '💎', per: 6, unit: '%', maxLv: 20,
    desc: '몬스터·보스가 주는 강화석이 늘어납니다.', effect: (lv) => `강화석 획득 +${lv * 6}%`,
  },
  {
    id: 'startGold', name: '초월의 자본', icon: '🪙', per: 500, unit: '', maxLv: 20,
    desc: '환생 직후 시작 골드가 늘어 첫 매물·강화가 빨라집니다.', effect: (lv) => `시작 골드 +${lv * 500}`,
  },
  {
    id: 'critDmg', name: '초월의 일격', icon: '🎯', per: 3, unit: '%p', maxLv: 20,
    desc: '치명타가 터질 때 피해 배율이 오릅니다.', effect: (lv) => `치명타 피해 +${lv * 3}%p`,
  },
];

export const REBIRTH_TRAIT_IDS = REBIRTH_TRAITS.map((t) => t.id);
export const TRAIT_BY_ID = Object.fromEntries(REBIRTH_TRAITS.map((t) => [t.id, t]));

/** 특성 1레벨 올리는 비용 (초월석). 레벨이 높을수록 비싸진다. */
export const TRAIT_COST_BASE = 3;
export const TRAIT_COST_STEP = 2;

export function traitCost(lv) {
  const cur = clamp(Math.floor(num(lv, 0)), 0, 999);
  return TRAIT_COST_BASE + TRAIT_COST_STEP * cur;
}

/** 특성 최대 레벨까지 드는 총 초월석 */
export function traitTotalCost(def, toLv) {
  const max = Math.max(0, Math.floor(num(def && def.maxLv, 0)));
  const target = clamp(Math.floor(num(toLv, max)), 0, max);
  let sum = 0;
  for (let i = 0; i < target; i++) sum += traitCost(i);
  return sum;
}

/** 상태에서 환생 정보 꺼내기(구조 보장) */
export function birthState(state) {
  if (!state || typeof state !== 'object') {
    return { count: 0, points: 0, totalPoints: 0, traits: {}, bestStage: 1, at: 0 };
  }
  if (!state.rebirth || typeof state.rebirth !== 'object') {
    state.rebirth = { count: 0, points: 0, totalPoints: 0, traits: {}, bestStage: 1, at: 0 };
  }
  const rb = state.rebirth;
  if (!rb.traits || typeof rb.traits !== 'object') rb.traits = {};
  return rb;
}

/** 특성 레벨 */
export function traitLevel(state, id) {
  const rb = birthState(state);
  const def = TRAIT_BY_ID[id];
  const max = def ? def.maxLv : 0;
  return clamp(Math.floor(num(rb.traits[id], 0)), 0, max);
}

/** 현재 초월석 */
export function rebirthPoints(state) {
  return Math.max(0, Math.floor(num(birthState(state).points, 0)));
}

/** 환생 보너스 합계 — calcStats·보상 계산이 그대로 쓴다 */
export function rebirthBonus(state) {
  const rb = birthState(state);
  let atkPct = 0;
  let goldPct = 0;
  let hpPct = 0;
  let shardPct = 0;
  let startGold = 0;
  let critDmgAdd = 0;
  let guardPct = 0;
  let regenPct = 0;
  let totalLv = 0;
  for (const def of REBIRTH_TRAITS) {
    const lv = traitLevel(state, def.id);
    if (lv <= 0) continue;
    totalLv += lv;
    if (def.id === 'atk') atkPct = lv * def.per;
    else if (def.id === 'gold') goldPct = lv * def.per;
    else if (def.id === 'hp') hpPct = lv * def.per;
    else if (def.id === 'shard') shardPct = lv * def.per;
    else if (def.id === 'startGold') startGold = lv * def.per;
    else if (def.id === 'critDmg') critDmgAdd = (lv * def.per) / 100;
    else if (def.id === 'guard') guardPct = lv * def.per;
    else if (def.id === 'regen') regenPct = lv * def.per;
  }
  return {
    atkPct,
    goldPct,
    hpPct,
    shardPct,
    critDmgAdd,
    startGold,
    guardPct,
    regenPct,
    totalLv,
    count: Math.max(0, Math.floor(num(rb.count, 0))),
    points: Math.max(0, Math.floor(num(rb.points, 0))),
  };
}

/** 환생 직후 시작 골드 = 기본 시작 골드 + 초월의 자본 */
export function rebirthStartGold(state) {
  return Math.max(0, Math.floor(ECON.startGold + rebirthBonus(state).startGold));
}

/* ──────────────────────── 환생 점프 시작 스테이지 ──────────────────────── */

/** 직전 회차 최고 스테이지 — 이번 회차 maxStage 와 역대 bestStage 중 큰 쪽
 *  (peakStage 는 미션·업적용 누적 기록이라 점프 상한 계산에 쓰지 않는다 — 한 번 찍은
 *   최고 기록으로 다음 회차를 통째로 건너뛰지 못하게 하려는 의도다.) */
export function rebirthPrevBest(state) {
  const s = state && typeof state === 'object' ? state : {};
  const rb = birthState(s);
  return Math.max(
    1,
    Math.floor(num(s.maxStage, 1)),
    Math.floor(num(rb.bestStage, 1)),
  );
}

/** 선택할 수 있는 최대 시작 스테이지 — 직전 최고의 55%(최소 1) */
export function rebirthJumpCap(state) {
  return Math.max(1, Math.floor(rebirthPrevBest(state) * REBIRTH_JUMP.ratio));
}

/** 시작 스테이지 선택지: S1 + 5단위 + 상한. 상한을 넘는 값은 절대 나오지 않는다. */
export function rebirthStartOptions(state) {
  const cap = rebirthJumpCap(state);
  const out = [{ stage: 1, label: 'S1', note: '처음부터' }];
  for (let s = REBIRTH_JUMP.step; s <= cap; s += REBIRTH_JUMP.step) {
    out.push({ stage: s, label: `S${s}`, note: '건너뛰기' });
  }
  const last = out[out.length - 1].stage;
  if (cap > 1 && cap > last) out.push({ stage: cap, label: `S${cap}`, note: '상한' });
  return out;
}

/** 요청 스테이지를 규칙 안으로 정규화 — 숫자가 아니면 S1, 상한 초과는 상한으로 깎는다. */
export function rebirthJumpStage(state, want) {
  const cap = rebirthJumpCap(state);
  const v = Math.floor(num(want, 1));
  if (!isFinite(v) || v <= 1) return 1;
  return Math.min(v, cap);
}

/** 점프 시작 보정 — 레벨·골드만 최소한으로 올린다 */
export function rebirthJumpBonus(startStage) {
  const s = Math.max(1, Math.floor(num(startStage, 1)));
  if (s <= 1) return { level: 1, gold: 0 };
  return {
    level: 1 + Math.floor((s - 1) * REBIRTH_JUMP.levelPerStage),
    gold: Math.floor((s - 1) * REBIRTH_JUMP.goldPerStage),
  };
}

/** 환생 가능 여부·예정 포인트·진행도 */
export function rebirthStatus(state) {  const s = state && typeof state === 'object' ? state : {};
  const rb = birthState(s);
  const stage = Math.max(1, Math.floor(num(s.maxStage, 1)));
  const need = REBIRTH.stageReq;
  const can = stage >= need;
  const gain = rebirthPointsFor(stage);
  const points = Math.max(0, Math.floor(num(rb.points, 0)));
  return {
    can,
    stage,
    need,
    gain,
    points,
    count: Math.max(0, Math.floor(num(rb.count, 0))),
    totalPoints: Math.max(0, Math.floor(num(rb.totalPoints, 0))),
    bestStage: Math.max(1, Math.floor(num(rb.bestStage, 1))),
    pct: clamp(stage / need, 0, 1),
    reason: can ? '환생 가능' : `최고 스테이지 S${need} 도달 필요 (현재 S${stage})`,
  };
}

/* ────────────────────────────── 실행 ────────────────────────────── */

/**
 * 환생 실행. 조건 미달이면 아무것도 바꾸지 않고 거부한다.
 * @param {object} state 저장 상태
 * @param {number} now 시각
 * @param {{startStage?:number}} [opts] v4.1: 중간 스테이지 시작(생략하면 S1 — 기존 동작 그대로)
 * @returns {{ok:boolean, reason?:string, points?:number, from?:object, startGold?:number, count?:number, stage?:number, level?:number, start?:number, jump?:object}}
 */
export function doRebirth(state, now = Date.now(), opts = {}) {
  if (!state || typeof state !== 'object') return { ok: false, reason: '저장 상태가 없습니다.' };
  const st = rebirthStatus(state);
  if (!st.can) return { ok: false, reason: st.reason };
  const rb = birthState(state);
  // v4.1: 시작 스테이지 — 규칙(직전 최고의 55%) 안으로 정규화된다. 생략하면 S1.
  const start = rebirthJumpStage(state, opts && opts.startStage);
  const jump = rebirthJumpBonus(start);
  const from = {
    level: Math.max(1, Math.floor(num(state.level, 1))),
    stage: Math.max(1, Math.floor(num(state.stage, 1))),
    maxStage: st.stage,
    gold: Math.max(0, Math.floor(num(state.gold, 0))),
    jobTier: Math.max(0, Math.floor(num(state.jobTier, 0))),
    equip: { ...(state.equip || {}) },
    shards: Math.max(0, Math.floor(num(state.shards, 0))),
  };

  // 1) 기록 · 초월석 (유지)
  rb.count = Math.max(0, Math.floor(num(rb.count, 0))) + 1;
  rb.points = Math.max(0, Math.floor(num(rb.points, 0))) + st.gain;
  rb.totalPoints = Math.max(0, Math.floor(num(rb.totalPoints, 0))) + st.gain;
  rb.bestStage = Math.max(Math.max(1, Math.floor(num(rb.bestStage, 1))), st.stage);
  rb.at = Math.max(0, num(now, 0));
  state.peakStage = Math.max(
    Math.max(1, Math.floor(num(state.peakStage, 1))),
    Math.max(1, Math.floor(num(state.maxStage, 1))),
    st.stage,
  );

  // 2) 초기화 — 사냥 회차만
  state.level = jump.level;
  state.exp = 0;
  state.stage = start;
  state.maxStage = start;
  state.killsInStage = 0;
  state.bossReady = false;
  state.jobTier = 0;
  state.jobAt = Math.max(0, num(now, 0));
  state.hp = null;
  if (state.equip && typeof state.equip === 'object') {
    for (const k of Object.keys(state.equip)) state.equip[k] = 0;
  }
  state.gold = rebirthStartGold(state) + jump.gold;
  if (state.skills && typeof state.skills === 'object') {
    for (const k of Object.keys(state.skills)) {
      if (state.skills[k] && typeof state.skills[k] === 'object') state.skills[k].last = 0;
    }
  }

  return {
    ok: true,
    points: st.gain,
    from,
    startGold: state.gold,
    count: rb.count,
    stage: state.stage,
    level: state.level,
    start,
    jump,
  };
}

/**
 * 영구 특성 1레벨 업그레이드(초월석 소모).
 * @returns {{ok:boolean, reason?:string, max?:boolean, id?:string, level?:number, cost?:number, points?:number, nextCost?:number}}
 */
export function upgradeTrait(state, id) {
  const def = TRAIT_BY_ID[id];
  if (!def) return { ok: false, reason: '알 수 없는 특성입니다.' };
  const rb = birthState(state);
  const lv = traitLevel(state, id);
  if (lv >= def.maxLv) return { ok: false, reason: '최대 레벨입니다.', max: true };
  const cost = traitCost(lv);
  const have = Math.max(0, Math.floor(num(rb.points, 0)));
  if (have < cost) return { ok: false, reason: `초월석이 부족합니다. (필요 ${cost}P)`, need: cost };
  rb.points = have - cost;
  rb.traits[id] = lv + 1;
  return {
    ok: true,
    id,
    name: def.name,
    level: lv + 1,
    cost,
    points: rb.points,
    nextCost: lv + 1 < def.maxLv ? traitCost(lv + 1) : 0,
    max: lv + 1 >= def.maxLv,
  };
}

/** 저장 정규화 — 손상/구버전 저장 방어 */
export function normalizeRebirth(raw) {
  const d = { count: 0, points: 0, totalPoints: 0, traits: {}, bestStage: 1, at: 0 };
  if (!raw || typeof raw !== 'object') return d;
  const traits = {};
  const rawTraits = raw.traits && typeof raw.traits === 'object' ? raw.traits : {};
  for (const def of REBIRTH_TRAITS) {
    const lv = clamp(Math.floor(num(rawTraits[def.id], 0)), 0, def.maxLv);
    if (lv > 0) traits[def.id] = lv;
  }
  const count = Math.max(0, Math.floor(num(raw.count, 0)));
  return {
    count,
    points: Math.max(0, Math.floor(num(raw.points, 0))),
    totalPoints: Math.max(0, Math.floor(num(raw.totalPoints, 0))),
    traits,
    bestStage: Math.max(1, Math.floor(num(raw.bestStage, 1))),
    at: Math.max(0, num(raw.at, 0)),
  };
}

/** 특성 한 줄 요약(UI) */
export function traitSummary(state) {
  const b = rebirthBonus(state);
  const parts = [];
  if (b.atkPct) parts.push(`공격 +${b.atkPct}%`);
  if (b.guardPct) parts.push(`피해감소 +${b.guardPct}%p`);
  if (b.hpPct) parts.push(`체력 +${b.hpPct}%`);
  if (b.regenPct) parts.push(`회복 +${b.regenPct.toFixed(2)}%/s`);
  if (b.goldPct) parts.push(`골드 +${b.goldPct}%`);
  if (b.shardPct) parts.push(`강화석 +${b.shardPct}%`);
  if (b.critDmgAdd) parts.push(`치명피해 +${Math.round(b.critDmgAdd * 100)}%p`);
  if (b.startGold) parts.push(`시작 골드 +${b.startGold.toLocaleString('ko-KR')}`);
  return parts.length ? parts.join(' · ') : '없음';
}
