// land-rpg / src/meta.js
// v3.2 메타 성장: 🐾 부동산 연계 펫(동료) · 🔥 전직/각성 · 황금 던전(보스 러시)의 정의와 계산.
// DOM/Canvas 의존 없음 → 헤드리스 검증 가능.
//   - 펫: 부동산(지역 수·평수·총자산) 조건을 만족하면 자동 해금. 장착한 펫이 전투에 동행한다.
//   - 전직: 레벨 + 최고 스테이지 조건으로 4단계. 전직 시 영구 공격력·체력 배율.
//   - 던전: 10분 쿨타임마다 무료 1회 또는 강화석으로 즉시 입장. 30초 동안 입힌 피해·처치로 보상.
import { ECON, stageGoldBase, monsterBaseHp } from './data.js';
import { portfolioOf, formatGold } from './land.js';
import { rebirthBonus } from './rebirth.js';

/* ────────────────────────────── 🐾 펫 ──────────────────────────────
 * dmgPct: 매 1.5초 함께 공격할 때 주인공 공격력 대비 피해 비율
 * atkPct / goldPct: 동행 중 영구 패시브(%)
 */
export const PET_ATTACK_MS = 1500;

export const PETS = [
  {
    id: 'wolf',
    name: '꼬마 늑대',
    emoji: '🐺',
    sprite: 'pet_wolf',
    color: '#9fc6ff',
    dmgPct: 0.55,
    atkPct: 3,
    goldPct: 0,
    unlock: { type: 'cities', n: 1 },
    cond: '보유 지역 1곳 이상',
    desc: '주인 뒤에서 가볍게 물어뜯습니다.',
  },
  {
    id: 'fox',
    name: '불여우',
    emoji: '🦊',
    sprite: 'pet_fox',
    color: '#ff9a5c',
    dmgPct: 0.8,
    atkPct: 5,
    goldPct: 4,
    unlock: { type: 'pyeong', n: 100 },
    cond: '보유 100평 이상',
    desc: '불꽃 꼬리로 함께 벱니다.',
  },
  {
    id: 'owl',
    name: '황금 부엉이',
    emoji: '🦉',
    sprite: 'pet_owl',
    color: '#ffd76a',
    dmgPct: 0.7,
    atkPct: 4,
    goldPct: 10,
    unlock: { type: 'asset', n: 50000 },
    cond: '총자산 5만 골드 이상',
    desc: '황금 깃털이 골드를 끌어옵니다.',
  },
  {
    id: 'dragon',
    name: '아기 드래곤',
    emoji: '🐲',
    sprite: 'pet_dragon',
    color: '#c78fff',
    dmgPct: 1.2,
    atkPct: 8,
    goldPct: 6,
    unlock: { type: 'cities', n: 10 },
    cond: '보유 지역 10곳 이상',
    desc: '작은 숨결이지만 화력은 최강입니다.',
  },
];

export const PET_BY_ID = Object.fromEntries(PETS.map((p, i) => [p.id, { ...p, tier: i }]));
export const PET_IDS = PETS.map((p) => p.id);
export const PET_SPRITES = PETS.map((p) => p.sprite);

/** id → 펫 정의(+tier). 없으면 null */
export function petDef(id) {
  return (id && PET_BY_ID[id]) || null;
}

/* ── 펫 강화: 강화석으로 레벨 1~10, 레벨당 함께 공격·패스워드 효과 +10% ── */
export const PET_MAX_LV = 10;

/** 해당 펫의 강화 레벨(기본 1) */
export function petLevel(state, id) {
  const lv = state && state.pet && state.pet.levels && state.pet.levels[id];
  return Math.max(1, Math.min(PET_MAX_LV, Math.floor(Number(lv) || 1)));
}

/** 함께 공격 피해 비율(강화 레벨 반영) */
export function petDmgPct(state, id) {
  const def = petDef(id);
  if (!def) return 0;
  return def.dmgPct * (1 + 0.1 * (petLevel(state, id) - 1));
}

/** 동행 패시브 공격력(%)입니다(강화 레벨 반영). */
export function petAtkPct(state, id) {
  const def = petDef(id);
  if (!def) return 0;
  return Math.round(def.atkPct * (1 + 0.1 * (petLevel(state, id) - 1)) * 10) / 10;
}

/** 다음 강화 비용(강화석) — 최대치면 0 */
export function petUpgradeCost(lv) {
  const cur = Math.max(1, Math.min(PET_MAX_LV, Math.floor(Number(lv) || 1)));
  if (cur >= PET_MAX_LV) return 0;
  return Math.ceil(8 * Math.pow(1.4, cur - 1));
}

/** 펫 강화 실행(강화석 소모). */
export function upgradePet(state, id) {
  const def = petDef(id);
  if (!def) return { ok: false, reason: '알 수 없는 펫입니다.' };
  const unlocked = (state.pet && state.pet.unlocked) || [];
  if (!unlocked.includes(id)) return { ok: false, reason: '아직 해금되지 않은 펫입니다.' };
  const lv = petLevel(state, id);
  if (lv >= PET_MAX_LV) return { ok: false, reason: '최대 강화 단계입니다.', max: true };
  const cost = petUpgradeCost(lv);
  if (Math.max(0, Math.floor(state.shards || 0)) < cost) {
    return { ok: false, reason: `강화석이 부족힙니다. (필요 💎${cost})`, need: cost };
  }
  state.shards = Math.floor(state.shards - cost);
  if (!state.pet.levels || typeof state.pet.levels !== 'object') state.pet.levels = {};
  state.pet.levels[id] = lv + 1;
  return { ok: true, lv: lv + 1, spent: cost, cost: petUpgradeCost(lv + 1) };
}

/** 펫 티어(0부터). 장착/비교용 */
export function petTier(id) {
  const p = petDef(id);
  return p ? p.tier : -1;
}

/** 장착된 펫 정의(없으면 null) */
export function equippedPet(state) {
  const id = state && state.pet && state.pet.equipped;
  return petDef(id);
}

/** 펫 해금 조건 충족 여부 — portfolio 는 portfolioOf(state) 결과 */
export function petSatisfied(def, portfolio) {
  if (!def || !def.unlock || !portfolio) return false;
  const u = def.unlock;
  if (u.type === 'cities') return portfolio.cities >= u.n;
  if (u.type === 'pyeong') return portfolio.pyeong >= u.n;
  if (u.type === 'asset') return portfolio.totalAsset >= u.n;
  return false;
}

/** 해금 진행도: { ok, cur, need, pct, text } */
export function petProgress(state, id, now = Date.now()) {
  const def = petDef(id);
  if (!def) return { ok: false, cur: 0, need: 0, pct: 0, text: '—' };
  const p = portfolioOf(state, now);
  const u = def.unlock || { type: 'cities', n: 1 };
  const cur = u.type === 'cities' ? p.cities : u.type === 'pyeong' ? p.pyeong : p.totalAsset;
  const need = Math.max(1, u.n);
  const pct = Math.max(0, Math.min(1, cur / need));
  const fmtCur = u.type === 'asset' ? formatGold(cur) : Math.floor(cur).toLocaleString('ko-KR');
  const fmtNeed = u.type === 'asset' ? formatGold(need) : need.toLocaleString('ko-KR');
  return { ok: cur >= need, cur, need, pct, text: `${fmtCur} / ${fmtNeed}` };
}

/**
 * 부동산 조건을 다시 확인해 새로 해금된 펫을 state.pet 에 반영한다.
 * 사용자가 직접 고른 적이 없으면(chosen=false) 가장 높은 펫을 자동 장착한다.
 * @returns {{ newly: string[], equipped: string|null, changed: boolean }}
 */
export function syncPets(state, now = Date.now()) {
  if (!state.pet || typeof state.pet !== 'object') state.pet = { equipped: null, unlocked: [], chosen: false };
  const raw = state.pet;
  if (!raw.levels || typeof raw.levels !== 'object') raw.levels = {};
  const have = new Set(Array.isArray(raw.unlocked) ? raw.unlocked.filter((id) => !!PET_BY_ID[id]) : []);
  const beforeEquipped = PET_BY_ID[raw.equipped] ? raw.equipped : null;

  const p = portfolioOf(state, now);
  const newly = [];
  for (const def of PETS) {
    if (!have.has(def.id) && petSatisfied(def, p)) {
      have.add(def.id);
      newly.push(def.id);
    }
  }

  const unlocked = PETS.filter((d) => have.has(d.id)).map((d) => d.id);
  const best = unlocked.length ? unlocked[unlocked.length - 1] : null; // PETS 는 티어 오름차순
  const levels = {};
  for (const id of unlocked) levels[id] = petLevel(state, id);
  let equipped = beforeEquipped;
  if (!raw.chosen) equipped = best;
  else if (!equipped || !have.has(equipped)) equipped = best;
  // 자동 장착 상태에서 더 높은 펫이 새로 열리면 함께 올려준다
  if (!raw.chosen && best && petTier(best) > petTier(equipped)) equipped = best;

  state.pet = { equipped, unlocked, chosen: !!raw.chosen, levels };
  return { newly, equipped, changed: newly.length > 0 || equipped !== beforeEquipped };
}

/** 직접 장착/교체. 해금된 펫만 가능. */
export function equipPet(state, id) {
  const def = petDef(id);
  if (!def) return { ok: false, reason: '알 수 없는 펫입니다.' };
  const unlocked = (state.pet && state.pet.unlocked) || [];
  if (!unlocked.includes(id)) return { ok: false, reason: '아직 해금되지 않은 펫입니다.' };
  state.pet = { ...(state.pet || {}), equipped: id, unlocked: unlocked.slice(), chosen: true };
  return { ok: true, pet: def };
}

/* ────────────────────────────── 🔥 전직/각성 ────────────────────────────── */
export const JOBS = [
  {
    tier: 0,
    name: '견습 기사',
    badge: '🗡️',
    color: '#8ea2bb',
    lv: 1,
    stage: 1,
    atkPct: 0,
    hpPct: 0,
    line: '영지에서 첫 검을 든 초보 기사.',
  },
  {
    tier: 1,
    name: '왕국 기사',
    badge: '⚔️',
    color: '#69c0ff',
    lv: 12,
    stage: 8,
    atkPct: 18,
    hpPct: 12,
    line: '왕국이 인정한 정식 기사. 검격이 무거워집니다.',
  },
  {
    tier: 2,
    name: '성기사',
    badge: '✨',
    color: '#ffd76a',
    lv: 24,
    stage: 16,
    atkPct: 40,
    hpPct: 28,
    line: '성광을 두른 수호자. 사냥터의 흐름이 바뀝니다.',
  },
  {
    tier: 3,
    name: '드래곤 나이트',
    badge: '🐲',
    color: '#ff7a3d',
    lv: 36,
    stage: 24,
    atkPct: 70,
    hpPct: 50,
    line: '용의 기운을 받아들인 최종 각성. 전장을 지배합니다.',
  },
];

export const JOB_MAX = JOBS.length - 1;

/** 현재 전직 단계 정의 */
export function jobOf(state) {
  const t = Math.max(0, Math.min(JOB_MAX, Math.floor(Number(state && state.jobTier) || 0)));
  return JOBS[t];
}

/** 다음 전직 단계(없으면 null) */
export function nextJob(state) {
  const t = jobOf(state).tier;
  return JOBS[t + 1] || null;
}

/** 전직 진행도: { cur, next, canPromote, levelOk, stageOk, pctLv, pctStage, reason } */
export function jobProgress(state) {
  const cur = jobOf(state);
  const next = nextJob(state);
  if (!next) {
    return { cur, next: null, canPromote: false, levelOk: true, stageOk: true, pctLv: 1, pctStage: 1, reason: '최종 전직 완료' };
  }
  const lv = Math.max(1, Math.floor(Number(state.level) || 1));
  const stage = Math.max(1, Math.floor(Number(state.maxStage) || 1));
  const levelOk = lv >= next.lv;
  const stageOk = stage >= next.stage;
  return {
    cur,
    next,
    canPromote: levelOk && stageOk,
    levelOk,
    stageOk,
    pctLv: Math.max(0, Math.min(1, lv / next.lv)),
    pctStage: Math.max(0, Math.min(1, stage / next.stage)),
    reason: !levelOk ? `Lv.${next.lv} 필요` : !stageOk ? `스테이지 ${next.stage} 필요` : '전직 가능',
  };
}

/** 전직 실행. 조건 미달이면 거부한다. */
export function promoteJob(state, now = Date.now()) {
  const pr = jobProgress(state);
  if (!pr.next) return { ok: false, reason: '이미 최종 전직입니다.' };
  if (!pr.canPromote) return { ok: false, reason: pr.reason };
  state.jobTier = pr.next.tier;
  state.jobAt = now;
  // v3.5: 환생으로 전직 단계가 초기화되어도 미션·업적 진행도가 유지되게 역대 최고 기록을 남긴다.
  if (state.records && typeof state.records === 'object') {
    state.records.peakJobTier = Math.max(Math.floor(Number(state.records.peakJobTier) || 0), state.jobTier);
  }
  return { ok: true, from: pr.cur, to: pr.next };
}

/* ────────────────────────────── 🔥 황금 던전(보스 러시) ────────────────────────────── */
export const DUNGEON = {
  durationMs: 30000, // 30초 제한
  cooldownMs: 10 * 60 * 1000, // 10분마다 무료 1회
  shardCost: 30, // 강화석 즉시 입장
  maxMonsters: 4,
  spawnMs: 450,
  bossEvery: 5, // 5마리마다 보스(황금 보스)
  hpSecNormal: 0.85, // 예상 DPS 기준 일반 몹 처치 시간(초)
  hpSecBoss: 5.5, // 황금 보스 처치 시간(초)
  atkOfHpPct: 1.2, // 몹 공격력 = 플레이어 최대 체력의 1.2%
  goldMul: 7, // 처치 1마리 = 스테이지 기본 골드 × 7
  bossGoldMul: 3, // 보스는 일반의 3배
  damageGoldPerHp: 1, // 몬스터 체력 1마리분 피해 = 기본 골드 × 1
  shardPerKill: 1.2,
  bossShards: 4,
};

/** 무료 입장 가능 여부 */
export function dungeonState(state, now = Date.now()) {
  const next = Math.max(0, Number(state && state.dungeonCooldown) || 0);
  const leftMs = Math.max(0, next - now);
  const shards = Math.max(0, Math.floor(Number(state && state.shards) || 0));
  return {
    ready: leftMs <= 0,
    leftMs,
    cost: DUNGEON.shardCost,
    shards,
    canPay: shards >= DUNGEON.shardCost,
  };
}

/** 무료 입장 쿨타임 시작 */
export function startDungeonCooldown(state, now = Date.now()) {
  state.dungeonCooldown = now + DUNGEON.cooldownMs;
  return state.dungeonCooldown;
}

/**
 * 던전 종료 보상: 입힌 피해(몬스터 체력 환산) + 처치 수 기반.
 * @param run { kills, bossKills, dmg }
 */
export function dungeonReward(state, run, buffs = {}, rng = Math.random) {
  const stage = Math.max(1, Math.floor(Number(state.stage) || 1));
  const base = stageGoldBase(stage);
  const unitHp = Math.max(1, monsterBaseHp(stage));
  const rb = rebirthBonus(state);
  const kills = Math.max(0, Number(run && run.kills) || 0);
  const bosses = Math.max(0, Number(run && run.bossKills) || 0);
  const dmg = Math.max(0, Number(run && run.dmg) || 0);
  const units = kills * DUNGEON.goldMul + bosses * DUNGEON.goldMul * DUNGEON.bossGoldMul + (dmg / unitHp) * DUNGEON.damageGoldPerHp;
  const swing = typeof rng === 'function' ? 0.92 + rng() * 0.16 : 1;
  const gold = Math.max(0, Math.round(base * units * (1 + (buffs.goldPct || 0) / 100 + rb.goldPct / 100) * swing));
  const shards = Math.max(0, Math.round((3 + kills * DUNGEON.shardPerKill + bosses * DUNGEON.bossShards + (dmg / unitHp) * 0.4) * (1 + rb.shardPct / 100)));
  return { gold, shards, units: Math.round(units * 100) / 100 };
}
