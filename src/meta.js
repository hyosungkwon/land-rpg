// land-rpg / src/meta.js
// v3.2 메타 성장: 🐾 부동산 연계 펫(동료) · 🔥 전직/각성 · 황금 던전(보스 러시)의 정의와 계산.
// DOM/Canvas 의존 없음 → 헤드리스 검증 가능.
//   - 펫: 부동산(지역 수·평수·총자산) 조건을 만족하면 자동 해금. 장착한 펫이 전투에 동행한다.
//     v4.2: 진화 3단계(기본 → 각성 → 신수)와 펫별 고유 스킬(패시브 + 액티브)을 함께 정의한다.
//   - 전직: 레벨 + 최고 스테이지 조건으로 6단계(v4.4에서 5·6단계 추가). 전직 시 영구 공격력·체력 배율.
//   - 던전: 10분 쿨타임마다 무료 1회 또는 강화석으로 즉시 입장. 30초 동안 입힌 피해·처치로 보상.
import { ECON, stageGoldBase, monsterBaseHp } from './data.js';
import { portfolioOf, formatGold } from './land.js';
import { rebirthBonus } from './rebirth.js';

/* ────────────────────────────── 🐾 펫 ──────────────────────────────
 * dmgPct: 매 1.5초 함께 공격할 때 주인공 공격력 대비 피해 비율
 * atkPct / goldPct: 동행 중 영구 패시브(%)
 */
export const PET_ATTACK_MS = 1500;
// v5.3.0 보조 펫 슬롯(2마리 동행) · 전투 배속(×1 / ×1.5 / ×2)
export const SUB_PET_REQ = { rebirth: 1, cities: 20 };
export const SUB_PET_RATE = 0.5;
export const SUB_PET_ATTACK_MS = 2100;
export const BATTLE_SPEEDS = [1, 1.5, 2];

/** 보조 펫 슬롯 해금 여부 — 환생 1회 이상 또는 보유 지역 20곳 이상 */
export function subPetUnlocked(state) {
  if (!state || typeof state !== 'object') return false;
  const rb = Math.max(0, Math.floor(Number(state.rebirth && state.rebirth.count) || 0));
  if (rb >= SUB_PET_REQ.rebirth) return true;
  const owned = state.land && state.land.owned && typeof state.land.owned === 'object' ? state.land.owned : {};
  let cities = 0;
  for (const k of Object.keys(owned)) if (Math.floor(Number(owned[k]) || 0) > 0) cities += 1;
  return cities >= SUB_PET_REQ.cities;
}

/** 전투 배속 해금 여부 — 환생 1회 이상 */
export function battleSpeedUnlocked(state) {
  return Math.max(0, Math.floor(Number(state && state.rebirth && state.rebirth.count) || 0)) >= 1;
}

/** 전투 배속 정규화(1 / 1.5 / 2) */
export function normalizeBattleSpeed(v) {
  const n = Number(v);
  return BATTLE_SPEEDS.includes(n) ? n : 1;
}

/** 현재 실제 적용되는 전투 배속(미해금이면 항상 1) */
export function effectiveBattleSpeed(state) {
  return battleSpeedUnlocked(state) ? normalizeBattleSpeed(state && state.battleSpeed) : 1;
}

/** 다음 배속 값 순환 (1 → 1.5 → 2 → 1) */
export function nextBattleSpeed(state) {
  const cur = normalizeBattleSpeed(state && state.battleSpeed);
  const idx = BATTLE_SPEEDS.indexOf(cur);
  return BATTLE_SPEEDS[(idx + 1) % BATTLE_SPEEDS.length];
}

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
    // v4.2 진화 3단계 — 이름·스프라이트·크기가 단계마다 달라진다
    evo: {
      names: ['꼬마 늑대', '은빛 늑대', '달빛 수호랑'],
      sprites: ['pet_wolf', 'pet_wolf_awaken', 'pet_wolf_divine'],
      scale: [1, 1.18, 1.36],
      colors: ['#9fc6ff', '#bfe0ff', '#e8f4ff'],
    },
    skill: {
      name: '사냥의 본능',
      icon: '🌙',
      type: 'crit',
      desc: '동행 중 치명타 확률이 오르고, 가끔 3연속 물기를 터뜨립니다.',
      active: { name: '삼연 물기', kind: 'multi', cdMs: 9000, hits: 3, mul: 0.7 },
    },
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
    evo: {
      names: ['불여우', '화염 구미호', '태양의 구미호'],
      sprites: ['pet_fox', 'pet_fox_awaken', 'pet_fox_divine'],
      scale: [1, 1.18, 1.36],
      colors: ['#ff9a5c', '#ffb347', '#ffd76a'],
    },
    skill: {
      name: '불꽃 꼬리',
      icon: '🔥',
      type: 'splash',
      desc: '함께 공격할 때 옆의 적까지 태우고, 가끔 불꽃 폭풍을 부릅니다.',
      active: { name: '불꽃 폭풍', kind: 'splash', cdMs: 10000, hits: 1, mul: 1.6 },
    },
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
    evo: {
      names: ['황금 부엉이', '금빛 현자', '황금 신조'],
      sprites: ['pet_owl', 'pet_owl_awaken', 'pet_owl_divine'],
      scale: [1, 1.18, 1.36],
      colors: ['#ffd76a', '#ffe89a', '#fff3cf'],
    },
    skill: {
      name: '황금 깃털',
      icon: '🪶',
      type: 'gold',
      desc: '동행 중 골드 획득이 오르고, 가끔 황금비를 뿌려 골드를 두 배로 만듭니다.',
      active: { name: '황금비', kind: 'gold', cdMs: 20000, durMs: 8000, mul: 1.0 },
    },
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
    evo: {
      names: ['아기 드래곤', '비룡', '천공의 용신'],
      sprites: ['pet_dragon', 'pet_dragon_awaken', 'pet_dragon_divine'],
      scale: [1, 1.18, 1.36],
      colors: ['#c78fff', '#d9b0ff', '#f0e0ff'],
    },
    skill: {
      name: '용의 숨결',
      icon: '🐲',
      type: 'boss',
      desc: '보스에게 추가 피해를 주고, 가끔 화염 브레스로 전방을 쓸어버립니다.',
      active: { name: '화염 브레스', kind: 'breath', cdMs: 12000, hits: 1, mul: 2.4 },
    },
  },
  // v5.8.0 신규 동료 펫 2종 (방어·드랍 특화 / 공속·치명피해 특화)
  {
    id: 'golem',
    name: '크리스탈 골렘',
    emoji: '💎',
    sprite: 'pet_golem',
    color: '#6ff0e8',
    dmgPct: 0.95,
    atkPct: 6,
    goldPct: 4,
    unlock: { type: 'pyeong', n: 500 },
    cond: '보유 500평 이상',
    desc: '단단한 수정 몸체로 방어와 보석을 끌어옵니다.',
    evo: {
      names: ['크리스탈 골렘', '사파이어 수호자', '다이아몬드 정령왕'],
      sprites: ['pet_golem', 'pet_golem_awaken', 'pet_golem_divine'],
      scale: [1, 1.18, 1.36],
      colors: ['#6ff0e8', '#7cc4ff', '#d8f8ff'],
    },
    skill: {
      name: '수정 갑옷',
      icon: '💎',
      type: 'guard',
      desc: '동행 중 피해 감소와 강화석 드랍이 오르고, 가끔 수정 충격파를 터뜨립니다.',
      active: { name: '수정 충격파', kind: 'splash', cdMs: 11000, hits: 1, mul: 1.9 },
    },
  },
  {
    id: 'hawk',
    name: '천둥 매',
    emoji: '🦅',
    sprite: 'pet_hawk',
    color: '#ffe36a',
    dmgPct: 1.35,
    atkPct: 10,
    goldPct: 5,
    unlock: { type: 'cities', n: 25 },
    cond: '보유 지역 25곳 이상',
    desc: '번개 날개로 누구보다 빠르게 적을 급습합니다.',
    evo: {
      names: ['천둥 매', '폭풍 매', '천공 뇌조'],
      sprites: ['pet_hawk', 'pet_hawk_awaken', 'pet_hawk_divine'],
      scale: [1, 1.18, 1.36],
      colors: ['#ffe36a', '#9fe0ff', '#fff6c4'],
    },
    skill: {
      name: '뇌전의 날개',
      icon: '⚡',
      type: 'storm',
      desc: '동행 중 공격 속도와 치명타 피해가 오르고, 가끔 번개 4연격을 퍼붓습니다.',
      active: { name: '번개 연격', kind: 'multi', cdMs: 9500, hits: 4, mul: 0.75 },
    },
  },
];

export const PET_BY_ID = Object.fromEntries(PETS.map((p, i) => [p.id, { ...p, tier: i }]));
export const PET_IDS = PETS.map((p) => p.id);
export const PET_SPRITES = PETS.map((p) => p.sprite);
/** v4.2: 진화 단계별 스프라이트까지 포함한 프리로드 목록(기본 4 + 각성 4 + 신수 4) */
export const PET_EVO_SPRITES = PETS.reduce((out, p) => {
  const list = [p.sprite, ...((p.evo && p.evo.sprites) || [])];
  for (const s of list) if (s && out.indexOf(s) < 0) out.push(s);
  return out;
}, []);

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

/* ────────────────────────────── 🐾 펫 진화 (v4.2) ──────────────────────────────
 * 기본 → 각성 → 신수 3단계.
 *  - 조건: 펫 강화 레벨(Lv.5 각성 / Lv.10 신수) + 강화석·골드
 *  - 효과: 동행 피해·공격력 패시브 ×1.5 / ×2.1, 골드 보너스 증가, 스프라이트·크기·오라 변화
 *  - 고유 스킬: 각성부터 해금(패시브 + 주기적 액티브)
 */
export const PET_EVO_MAX = 2;

export const PET_EVO_STAGES = [
  { stage: 0, key: 'base', label: '기본', badge: '', mul: 1, lv: 0 },
  { stage: 1, key: 'awaken', label: '각성', badge: '★', mul: 1.5, lv: 5 },
  { stage: 2, key: 'divine', label: '신수', badge: '★★', mul: 2.1, lv: 10 },
];

/** 진화 단계 정의(0~2) */
export function evoStageDef(stage) {
  const s = Math.max(0, Math.min(PET_EVO_MAX, Math.floor(Number(stage) || 0)));
  return PET_EVO_STAGES[s];
}

/** 해당 펫의 진화 단계(0 기본 · 1 각성 · 2 신수) */
export function petEvo(state, id) {
  const v = state && state.pet && state.pet.evo && state.pet.evo[id];
  return Math.max(0, Math.min(PET_EVO_MAX, Math.floor(Number(v) || 0)));
}

/** 진화 배율(동행 피해·공격력 패시브) */
export function petEvoMul(state, id) {
  return evoStageDef(petEvo(state, id)).mul;
}

/** 진화 단계의 이름/스프라이트/크기/색 */
export function petStageInfo(state, id) {
  const def = petDef(id);
  const stage = petEvo(state, id);
  const evo = (def && def.evo) || {};
  const pick = (arr, fallback) => (Array.isArray(arr) && arr[stage] != null ? arr[stage] : fallback);
  return {
    stage,
    def: evoStageDef(stage),
    name: pick(evo.names, def ? def.name : ''),
    sprite: pick(evo.sprites, def ? def.sprite : ''),
    scale: Number(pick(evo.scale, 1)) || 1,
    color: pick(evo.colors, def ? def.color : '#9fc6ff'),
  };
}

/** 다음 진화 비용 — 최대 단계면 null */
export function petEvoCost(state, id) {
  const def = petDef(id);
  if (!def) return null;
  const stage = petEvo(state, id);
  if (stage >= PET_EVO_MAX) return null;
  const tier = def.tier || 0;
  if (stage === 0) return { shards: 80 + tier * 40, gold: 6000 * (tier + 1) };
  return { shards: 320 + tier * 120, gold: 30000 * (tier + 1) };
}

/**
 * 진화 가능 여부 — UI·검증 공용
 * { stage, next, max, can, needLv, lv, lvOk, cost, shardsOk, goldOk, reason, pct }
 */
export function petEvolveInfo(state, id) {
  const def = petDef(id);
  if (!def) return { stage: 0, next: null, max: true, can: false, reason: '알 수 없는 펫입니다.' };
  const stage = petEvo(state, id);
  const next = stage >= PET_EVO_MAX ? null : evoStageDef(stage + 1);
  const lv = petLevel(state, id);
  if (!next) return { stage, next: null, max: true, can: false, lv, needLv: 0, lvOk: true, reason: '최종 진화 완료', pct: 1 };
  const cost = petEvoCost(state, id) || { shards: 0, gold: 0 };
  const lvOk = lv >= next.lv;
  const shardsOk = Math.max(0, Math.floor(Number(state && state.shards) || 0)) >= cost.shards;
  const goldOk = Math.max(0, Math.floor(Number(state && state.gold) || 0)) >= cost.gold;
  const can = lvOk && shardsOk && goldOk;
  const reason = !lvOk ? `강화 Lv.${next.lv} 필요` : !shardsOk ? `강화석 ${cost.shards} 필요` : !goldOk ? `골드 ${cost.gold.toLocaleString('ko-KR')} 필요` : '진화 가능';
  const pct = Math.max(0, Math.min(1, Math.min(lv / Math.max(1, next.lv), cost.shards ? (Math.max(0, Number(state.shards) || 0) / cost.shards) : 1)));
  return { stage, next, max: false, can, lv, needLv: next.lv, lvOk, cost, shardsOk, goldOk, reason, pct };
}

/** 진화 실행(강화석·골드 소모) */
export function evolvePet(state, id) {
  const def = petDef(id);
  if (!def) return { ok: false, reason: '알 수 없는 펫입니다.' };
  const unlocked = (state.pet && state.pet.unlocked) || [];
  if (!unlocked.includes(id)) return { ok: false, reason: '아직 해금되지 않은 펫입니다.' };
  const info = petEvolveInfo(state, id);
  if (info.max) return { ok: false, reason: '최종 진화 완료', max: true };
  if (!info.can) return { ok: false, reason: info.reason };
  state.shards = Math.max(0, Math.floor(state.shards - info.cost.shards));
  state.gold = Math.max(0, Math.floor(state.gold - info.cost.gold));
  if (!state.pet.evo || typeof state.pet.evo !== 'object') state.pet.evo = {};
  state.pet.evo[id] = info.next.stage;
  return { ok: true, stage: info.next.stage, def: info.next, spent: info.cost, name: petStageInfo(state, id).name, skill: petSkillOf(state, id) };
}

/* ────────────────────────────── 🐾 펫 고유 스킬 (v4.2) ──────────────────────────────
 * 각성(★)부터 해금. 단계가 오를수록 수치가 커진다.
 *  - crit  : 치명타 확률 +4%p/단계
 *  - splash: 함께 공격이 옆의 적까지(1+단계 마리)
 *  - gold  : 골드 획득 +15%/단계 · 액티브 '황금비' 동안 +100%
 *  - boss  : 보스 추가 피해 +8%/단계
 */
export const PET_SKILL_RULES = {
  critPerStage: 4, // %p
  splashPerStage: 1, // 마리
  goldPerStage: 15, // %
  bossPerStage: 8, // %
  dmgRedPerStage: 4, // %p (v5.8 크리스탈 골렘)
  dropPerStage: 10, // % (v5.8 크리스탈 골렘)
  atkSpdPerStage: 6, // % (v5.8 천둥 매)
  critDmgPerStage: 14, // % (v5.8 천둥 매)
  goldBurstDur: 8000,
};

/** 펫 고유 스킬(해금 전이면 stage 0 정보만) */
export function petSkillOf(state, id) {
  const def = petDef(id);
  if (!def || !def.skill) return null;
  const stage = petEvo(state, id);
  const sk = def.skill;
  return {
    ...sk,
    stage,
    unlocked: stage >= 1,
    name: sk.name,
    activeName: sk.active ? sk.active.name : '',
    cdMs: sk.active ? sk.active.cdMs : 0,
    text: petSkillText(def, stage),
  };
}

/** 고유 스킬 효과 한 줄(단계 반영) */
export function petSkillText(def, stage) {
  const s = Math.max(0, Math.min(PET_EVO_MAX, Math.floor(Number(stage) || 0)));
  if (!def || !def.skill) return '';
  if (s <= 0) return '각성(★)에서 해금';
  const t = def.skill.type;
  if (t === 'crit') return `치명타 +${PET_SKILL_RULES.critPerStage * s}%p · ${def.skill.active.name} (${Math.round(def.skill.active.cdMs / 1000)}초) 3연타`;
  if (t === 'splash') return `광역 타격 ${1 + s}마리 · ${def.skill.active.name} (${Math.round(def.skill.active.cdMs / 1000)}초)`;
  if (t === 'gold') return `골드 +${PET_SKILL_RULES.goldPerStage * s}% · ${def.skill.active.name} ${Math.round(def.skill.active.durMs / 1000)}초 골드 2배`;
  if (t === 'boss') return `보스 추가 피해 +${PET_SKILL_RULES.bossPerStage * s}% · ${def.skill.active.name} (${Math.round(def.skill.active.cdMs / 1000)}초) 광역`;
  if (t === 'guard') return `피해 감소 +${PET_SKILL_RULES.dmgRedPerStage * s}%p · 강화석 드랍 +${PET_SKILL_RULES.dropPerStage * s}% · ${def.skill.active.name}`;
  if (t === 'storm') return `공격 속도 +${PET_SKILL_RULES.atkSpdPerStage * s}% · 치명 피해 +${PET_SKILL_RULES.critDmgPerStage * s}% · ${def.skill.active.name} 4연격`;
  return '';
}

/** 진화를 반영한 펫 패시브 스탯(calcStats·전투 공용) */
export function petPassive(state, id) {
  const def = petDef(id);
  if (!def) return { critPct: 0, goldPct: 0, splash: 1, bossDmgPct: 0, dmgRedPct: 0, dropPct: 0, atkSpdPct: 0, critDmgPct: 0, stage: 0 };
  const stage = petEvo(state, id);
  const t = def.skill ? def.skill.type : '';
  const on = stage >= 1;
  return {
    stage,
    critPct: on && t === 'crit' ? PET_SKILL_RULES.critPerStage * stage : 0,
    goldPct: on && t === 'gold' ? PET_SKILL_RULES.goldPerStage * stage : 0,
    splash: on && t === 'splash' ? 1 + PET_SKILL_RULES.splashPerStage * stage : 1,
    bossDmgPct: on && t === 'boss' ? PET_SKILL_RULES.bossPerStage * stage : 0,
    dmgRedPct: on && t === 'guard' ? PET_SKILL_RULES.dmgRedPerStage * stage : 0,
    dropPct: on && t === 'guard' ? PET_SKILL_RULES.dropPerStage * stage : 0,
    atkSpdPct: on && t === 'storm' ? PET_SKILL_RULES.atkSpdPerStage * stage : 0,
    critDmgPct: on && t === 'storm' ? PET_SKILL_RULES.critDmgPerStage * stage : 0,
  };
}

/** 함께 공격 피해 비율(강화 레벨·진화 단계 반영) */
export function petDmgPct(state, id) {
  const def = petDef(id);
  if (!def) return 0;
  return def.dmgPct * (1 + 0.1 * (petLevel(state, id) - 1)) * petEvoMul(state, id);
}

/** 동행 패시브 공격력(%)입니다(강화 레벨·진화 단계 반영). */
export function petAtkPct(state, id) {
  const def = petDef(id);
  if (!def) return 0;
  return Math.round(def.atkPct * (1 + 0.1 * (petLevel(state, id) - 1)) * petEvoMul(state, id) * 10) / 10;
}

/** 동행 중 골드 획득(%): 기본 goldPct + 진화·고유 스킬 */
export function petGoldPct(state, id) {
  const def = petDef(id);
  if (!def) return 0;
  const stage = petEvo(state, id);
  return Math.round((def.goldPct * (1 + 0.4 * stage) + petPassive(state, id).goldPct) * 10) / 10;
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
    return { ok: false, reason: `강화석이 부족합니다. (필요 💎${cost})`, need: cost };
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

/** 장착된 보조 펫 정의(미해금·미장착·주펫과 동일하면 null) */
export function subPet(state) {
  if (!subPetUnlocked(state)) return null;
  const ps = state && state.pet;
  if (!ps || !ps.sub || ps.sub === ps.equipped) return null;
  const unlocked = Array.isArray(ps.unlocked) ? ps.unlocked : [];
  if (!unlocked.includes(ps.sub)) return null;
  return petDef(ps.sub);
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
  if (!raw.evo || typeof raw.evo !== 'object') raw.evo = {};
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
  // v4.2: 진화 단계는 해금된 펫만 남겨 그대로 보존한다
  const evo = {};
  for (const id of unlocked) {
    const v = Math.max(0, Math.min(PET_EVO_MAX, Math.floor(Number(raw.evo[id]) || 0)));
    if (v > 0) evo[id] = v;
  }
  let equipped = beforeEquipped;
  if (!raw.chosen) equipped = best;
  else if (!equipped || !have.has(equipped)) equipped = best;
  // 자동 장착 상태에서 더 높은 펫이 새로 열리면 함께 올려준다
  if (!raw.chosen && best && petTier(best) > petTier(equipped)) equipped = best;

  const sub = raw.sub && have.has(raw.sub) && raw.sub !== equipped ? raw.sub : null;
  state.pet = { equipped, sub, unlocked, chosen: !!raw.chosen, levels, evo };
  return { newly, equipped, changed: newly.length > 0 || equipped !== beforeEquipped };
}

/** 직접 장착/교체. 해금된 펫만 가능. 보조 펫과 겹치면 서로 자리를 바꾼다. */
export function equipPet(state, id) {
  const def = petDef(id);
  if (!def) return { ok: false, reason: '알 수 없는 펫입니다.' };
  const unlocked = (state.pet && state.pet.unlocked) || [];
  if (!unlocked.includes(id)) return { ok: false, reason: '아직 해금되지 않은 펫입니다.' };
  if (state.expedition && Array.isArray(state.expedition.active) && state.expedition.active.some((x) => x && x.petId === id)) {
    return { ok: false, reason: '파견 중인 펫은 복귀 후 동행할 수 있습니다.' };
  }
  const prevEq = state.pet && state.pet.equipped ? state.pet.equipped : null;
  let nextSub = state.pet && state.pet.sub ? state.pet.sub : null;
  if (nextSub === id) {
    nextSub = prevEq && prevEq !== id && unlocked.includes(prevEq) && subPetUnlocked(state) ? prevEq : null;
  }
  state.pet = { ...(state.pet || {}), equipped: id, sub: nextSub, unlocked: unlocked.slice(), chosen: true };
  return { ok: true, pet: def, sub: nextSub };
}

/** v5.3.0 보조 펫 장착/해제 (id=null|'none' 이면 해제) */
export function equipSubPet(state, id) {
  if (!subPetUnlocked(state)) {
    return { ok: false, reason: `환생 ${SUB_PET_REQ.rebirth}회 또는 보유 지역 ${SUB_PET_REQ.cities}곳 달성 시 해금됩니다.` };
  }
  if (!id || id === 'none') {
    state.pet = { ...(state.pet || {}), sub: null };
    return { ok: true, pet: null, cleared: true };
  }
  const def = petDef(id);
  if (!def) return { ok: false, reason: '알 수 없는 펫입니다.' };
  const unlocked = (state.pet && state.pet.unlocked) || [];
  if (!unlocked.includes(id)) return { ok: false, reason: '아직 해금되지 않은 펫입니다.' };
  if (state.pet && state.pet.equipped === id) return { ok: false, reason: '이미 주 동행 중인 펫입니다.' };
  if (state.expedition && Array.isArray(state.expedition.active) && state.expedition.active.some((x) => x && x.petId === id)) {
    return { ok: false, reason: '파견 중인 펫은 복귀 후 보조 배치할 수 있습니다.' };
  }
  state.pet = { ...(state.pet || {}), sub: id, unlocked: unlocked.slice() };
  return { ok: true, pet: def, cleared: false };
}

/* ────────────────────────────── 🔥 전직/각성 ──────────────────────────────
 * v4.4: 4단계(드래곤 나이트) 위에 상위 전직 2단계를 더했다.
 *  - 5단계 드래곤 로드(Lv.65 · S32) · 6단계 용신(Lv.85 · S40) — ∞ 구간(S31+)의 장기 목표.
 *  - atkPct/hpPct 는 **이전 단계를 포함한 누적 배율**(calcStats 는 현재 단계만 곱합)이라
 *    단계가 올라갈수록 배율 차이가 곧 성장폭이 된다(4→5 +45%p/+32%p, 5→6 +70%p/+48%p).
 *  - badge·color 는 전직 카드와 전투 오라(render.js drawJobAura)가 함께 쓴다.
 */
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
    line: '용의 기운을 받아들인 각성. 전장을 지배합니다.',
  },
  {
    tier: 4,
    name: '드래곤 로드',
    badge: '🐉',
    color: '#ff4d8d',
    lv: 65,
    stage: 32,
    atkPct: 115,
    hpPct: 82,
    line: '용의 심장을 나눠 가진 군주. ∞ 구간의 짐승도 고개를 숙입니다.',
  },
  {
    tier: 5,
    name: '용신',
    badge: '👑',
    color: '#ffe9a8',
    lv: 85,
    stage: 40,
    atkPct: 185,
    hpPct: 130,
    line: '용의 계보 끝에 선 신. 전장 자체가 그의 영역이 됩니다.',
  },
];

export const JOB_MAX = JOBS.length - 1;
export const JOB_COUNT = JOBS.length;

/** 상위 전직(5단계부터)인가 — 카드·오라 강조에 쓴다 */
export function isUpperJob(tier) {
  return Math.floor(Number(tier) || 0) >= 4;
}

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
    return { cur, next: null, canPromote: false, levelOk: true, stageOk: true, pctLv: 1, pctStage: 1, lvLeft: 0, stageLeft: 0, reason: '최종 전직 완료' };
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
    lvLeft: Math.max(0, next.lv - lv),
    stageLeft: Math.max(0, next.stage - stage),
    reason: !levelOk && !stageOk
      ? `Lv.${next.lv} · S${next.stage} 필요`
      : !levelOk ? `Lv.${next.lv} 필요` : !stageOk ? `스테이지 ${next.stage} 필요` : '전직 가능',
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
  const b = buffs || {};
  const pet = equippedPet(state);
  const goldMult = Number.isFinite(Number(run && run.goldMult)) && Number(run.goldMult) > 0
    ? Number(run.goldMult)
    : 1 + ((b.goldPct || 0) + (b.setGoldPct || 0) + (b.landmarkGoldPct || 0) + (b.synGoldPct || 0) + rb.goldPct + (pet ? petGoldPct(state, pet.id) : 0)) / 100;
  const dropMult = Number.isFinite(Number(run && run.dropMult)) && Number(run.dropMult) > 0
    ? Number(run.dropMult)
    : 1 + ((b.dropPct || 0) + (b.setDropPct || 0) + (b.synDropPct || 0) + rb.shardPct) / 100;
  const gold = Math.max(0, Math.round(base * units * goldMult * swing));
  const shards = Math.max(0, Math.round((3 + kills * DUNGEON.shardPerKill + bosses * DUNGEON.bossShards + (dmg / unitHp) * 0.4) * dropMult));
  return { gold, shards, units: Math.round(units * 100) / 100 };
}
