// land-rpg / src/data.js
// 밸런스·몬스터·장비·스킬 정의. DOM 의존 없음(헤드리스 테스트 가능).
// v3: 게스트 전용 통합 경제 — 골드 하나로 사냥과 부동산을 함께 굴린다.

export const APP_VERSION = '3.6.0';
export const SAVE_KEY = 'land_rpg_unified_v3';
export const SAVE_VERSION = 3;

/* ────────────────────────────── 경제 상수 ──────────────────────────────
 * 밸런스 조정은 이 블록만 고치면 된다.
 *  - 골드(💰): 유일한 화폐. 사냥 보상 · 부동산 매수/매도 · 임대수익 모두 골드.
 *  - 강화석(💎): 장비/스킬 강화 재료. 사냥·보스·스테이지 보너스로만 얻는다.
 */
export const ECON = {
  startGold: 500, // 첫 매물(1평 120골드~)을 바로 살 수 있는 시작 자금
  startShards: 8,

  // 전투
  playerAttackMs: 620, // 기본 공격 간격
  playerRange: 340, // 공격 사거리(월드 단위) — 줄 서는 몬스터까지 닿게
  playerX: 250, // 플레이어 고정 x
  spawnX: 900, // 몬스터 등장 x
  maxMonsters: 2,
  reviveMs: 3000, // 사망 후 부활 대기
  bossTimeLimitMs: 60000,

  // 웨이브 / 보스
  normalKillsPerStage: 10, // 10마리 처치마다 보스 도전 가능
  bossRetryKills: 4, // 보스 실패 후 재도전까지 필요한 처치 수
  autoBossDelayMs: 1400,

  // 몬스터 성장 (v3 리밸런싱: 초반 완만, 10스테이지부터 가팔라짐)
  monsterHpBase: 52,
  monsterHpGrowth: 1.245,
  monsterHpLateBoost: 0.05, // 10스테이지 이후 추가 성장(장비·건물주 버프 요구)
  monsterAtkBase: 4,
  monsterAtkGrowth: 1.135,
  monsterAttackMs: 1500,

  // 보상
  goldBase: 7,
  goldGrowth: 1.2,
  expBase: 11,
  expGrowth: 1.15,
  bossHpMul: 3.6,
  bossAtkMul: 1.15,
  bossGoldMul: 6,
  bossExpMul: 5,
  bossShardBase: 3,
  bossShardPerStage: 0.5,
  shardDropChance: 0.18,
  shardShopFactor: 3, // 골드로 강화석을 살 때: 몬스터 3마리분 골드 = 강화석 1개

  // 레벨
  expNeedBase: 60,
  expNeedGrowth: 1.18,

  // 오프라인 정산
  offlineCapHours: 12,
  offlineRate: 0.5, // 방치 시 실제 획득의 50%
  offlineKillsPerSec: 0.22,
};

/* ────────────────────────────── 무한 스테이지 확장 (v3.5) ──────────────────────────────
 * S1~30은 기존 곡선을 **그대로** 쓴다(회귀 테스트·밸런스 유지).
 * S31부터는 '∞ 확장 구간'으로 넘어가며, 같은 지수 곡선을 그대로 이어 붙이면
 * 몬스터 체력이 감당 불가능해지므로 완만한 곡선으로 갈아탄다.
 *  - 체력 ×1.035 / 공격 ×1.028 / 골드 ×1.06 / 경험치 ×1.04 (스테이지당)
 *  - 스테이지 목록·테마·보스는 기존 STAGES/THEMES 순환을 그대로 이어 무한히 정의된다.
 *  - 환생 특성(영구 배율)이 이 구간을 밀어 올리는 성장 동력이다.
 */
export const INFINITE = {
  baseStage: 30, // 이 스테이지까지는 기존 곡선
  startStage: 31, // 여기부터 ∞ 확장 구간(UI 배지)
  hpGrowth: 1.035,
  atkGrowth: 1.028,
  goldGrowth: 1.06,
  expGrowth: 1.04,
};

/** ∞ 확장 구간인가 */
export function isInfiniteStage(stage) {
  return Math.floor(Number(stage) || 0) >= INFINITE.startStage;
}

/** 일반 몬스터 1마리 기준 체력(보스·변형 배율 제외) — S1~30은 기존 식과 동일 */
export function monsterBaseHp(stage) {
  const s = Math.max(1, Math.floor(Number(stage) || 1));
  if (s <= INFINITE.baseStage) {
    const late = 1 + Math.max(0, s - 10) * ECON.monsterHpLateBoost;
    return ECON.monsterHpBase * Math.pow(ECON.monsterHpGrowth, s - 1) * late;
  }
  return monsterBaseHp(INFINITE.baseStage) * Math.pow(INFINITE.hpGrowth, s - INFINITE.baseStage);
}

/** 일반 몬스터 1마리 기준 공격력(보스 배율 제외) */
export function monsterBaseAtk(stage) {
  const s = Math.max(1, Math.floor(Number(stage) || 1));
  if (s <= INFINITE.baseStage) {
    return ECON.monsterAtkBase * Math.pow(ECON.monsterAtkGrowth, s - 1);
  }
  return monsterBaseAtk(INFINITE.baseStage) * Math.pow(INFINITE.atkGrowth, s - INFINITE.baseStage);
}

/** 처치 기본 골드(보스 배율·배율 버프 제외) */
export function stageGoldBase(stage) {
  const s = Math.max(1, Math.floor(Number(stage) || 1));
  if (s <= INFINITE.baseStage) return ECON.goldBase * Math.pow(ECON.goldGrowth, s - 1);
  return stageGoldBase(INFINITE.baseStage) * Math.pow(INFINITE.goldGrowth, s - INFINITE.baseStage);
}

/** 처치 기본 경험치(보스 배율 제외) */
export function stageExpBase(stage) {
  const s = Math.max(1, Math.floor(Number(stage) || 1));
  if (s <= INFINITE.baseStage) return ECON.expBase * Math.pow(ECON.expGrowth, s - 1);
  return stageExpBase(INFINITE.baseStage) * Math.pow(INFINITE.expGrowth, s - INFINITE.baseStage);
}

/* ────────────────────────────── 테마 ────────────────────────────── */
export const THEMES = [
  { id: 'meadow', name: '초원', sky: ['#1b3b2f', '#2f6b4f'], far: '#204a3a', near: '#173d2e', ground: '#20402f', groundLine: '#2c5740', accent: '#8fe3a8' },
  { id: 'forest', name: '고목림', sky: ['#122a24', '#22503f'], far: '#1a3b31', near: '#102a23', ground: '#1b3329', groundLine: '#265039', accent: '#6fd39a' },
  { id: 'ruins', name: '폐허', sky: ['#241f2e', '#4a3d55'], far: '#322a3d', near: '#241e2e', ground: '#2b2536', groundLine: '#3d3450', accent: '#b79ce0' },
  { id: 'desert', name: '모래벌', sky: ['#3a2a17', '#7a5326'], far: '#5b3f20', near: '#42301a', ground: '#4a371f', groundLine: '#6b502d', accent: '#f0c883' },
  { id: 'cave', name: '지하 동굴', sky: ['#131a2b', '#22314f'], far: '#1a2439', near: '#121a2b', ground: '#182136', groundLine: '#283650', accent: '#7fb6ff' },
  { id: 'volcano', name: '용암 지대', sky: ['#2a1113', '#5c2320'], far: '#3d1a1a', near: '#2a1212', ground: '#331616', groundLine: '#54221f', accent: '#ff8a5c' },
  { id: 'ice', name: '빙원', sky: ['#152737', '#2f5a75'], far: '#1d3c50', near: '#142b3b', ground: '#1a3446', groundLine: '#2b5266', accent: '#a8e6ff' },
  { id: 'abyss', name: '심연', sky: ['#1a0f26', '#3a1c4d'], far: '#28143a', near: '#180d26', ground: '#221030', groundLine: '#3b2150', accent: '#c78fff' },
];

/* ────────────────────────────── 몬스터 도감 ──────────────────────────────
 * v2: image-generation 으로 새로 만든 통일된 SD 2D 판타지 스프라이트를 쓴다.
 *   일반: assets/sprites/monster/<Name>.png    보스: assets/sprites/boss/<Name>.png
 */
export const MONSTERS = {
  // 일반 몬스터 12종
  Slime: { ko: '슬라임', boss: false },
  Goblin: { ko: '고블린', boss: false },
  Kobold: { ko: '코볼트', boss: false },
  Orc: { ko: '오크', boss: false },
  Skeleton: { ko: '스켈레톤', boss: false },
  Zombie: { ko: '좀비', boss: false },
  Werewolf: { ko: '웨어울프', boss: false },
  Harpy: { ko: '하피', boss: false },
  Cyclops: { ko: '사이클롭스', boss: false },
  Minotaur: { ko: '미노타우로스', boss: false },
  Golem: { ko: '골렘', boss: false },
  Drake: { ko: '드레이크', boss: false },
  // 보스 7종
  SlimeKing: { ko: '슬라임 킹', boss: true },
  Troll: { ko: '트롤', boss: true },
  Cerberus: { ko: '케르베로스', boss: true },
  DeathLord: { ko: '데스로드', boss: true },
  RedDragon: { ko: '레드드래곤', boss: true },
  VoidWalker: { ko: '보이드 워커', boss: true },
  Seraphim: { ko: '세라핌', boss: true },
};

/* 플레이어 캐릭터 3프레임 (대기 / 공격 / 스킬) */
export const HERO_FRAMES = {
  idle: 'hero_idle',
  attack: 'hero_attack',
  skill: 'hero_skill',
};

/* ────────────────────────────── 스테이지 ────────────────────────────── */
export const STAGES = [
  { normals: ['Slime', 'Goblin', 'Kobold'], boss: 'SlimeKing' },
  { normals: ['Goblin', 'Kobold', 'Orc'], boss: 'Troll' },
  { normals: ['Kobold', 'Orc', 'Skeleton'], boss: 'Cerberus' },
  { normals: ['Orc', 'Skeleton', 'Zombie'], boss: 'DeathLord' },
  { normals: ['Skeleton', 'Zombie', 'Werewolf'], boss: 'RedDragon' },
  { normals: ['Zombie', 'Werewolf', 'Harpy'], boss: 'VoidWalker' },
  { normals: ['Werewolf', 'Harpy', 'Cyclops'], boss: 'Seraphim' },
  { normals: ['Harpy', 'Cyclops', 'Minotaur'], boss: 'SlimeKing' },
  { normals: ['Cyclops', 'Minotaur', 'Golem'], boss: 'Troll' },
  { normals: ['Minotaur', 'Golem', 'Drake'], boss: 'Cerberus' },
  { normals: ['Golem', 'Drake', 'Slime'], boss: 'DeathLord' },
  { normals: ['Drake', 'Slime', 'Goblin'], boss: 'RedDragon' },
  { normals: ['Slime', 'Kobold', 'Werewolf'], boss: 'VoidWalker' },
  { normals: ['Goblin', 'Orc', 'Harpy'], boss: 'Seraphim' },
  { normals: ['Kobold', 'Skeleton', 'Cyclops'], boss: 'SlimeKing' },
  { normals: ['Orc', 'Zombie', 'Minotaur'], boss: 'Troll' },
  { normals: ['Skeleton', 'Werewolf', 'Golem'], boss: 'Cerberus' },
  { normals: ['Zombie', 'Harpy', 'Drake'], boss: 'DeathLord' },
  { normals: ['Werewolf', 'Cyclops', 'Slime'], boss: 'RedDragon' },
  { normals: ['Harpy', 'Minotaur', 'Goblin'], boss: 'VoidWalker' },
  { normals: ['Cyclops', 'Golem', 'Kobold'], boss: 'Seraphim' },
];

/** 스테이지 번호(1부터) → 스테이지 정의. 21스테이지 이후는 순환하며 난이도만 계속 오른다. */
export function stageDef(stage) {
  const s = Math.max(1, Math.floor(stage));
  const base = STAGES[(s - 1) % STAGES.length];
  const theme = THEMES[(s - 1) % THEMES.length];
  const loop = Math.floor((s - 1) / STAGES.length);
  const infinite = s >= INFINITE.startStage;
  return {
    num: s,
    normals: base.normals,
    boss: base.boss,
    theme,
    themeName: theme.name + (loop > 0 ? ` ${loop + 1}` : '') + (infinite ? ' ∞' : ''),
    loop,
    infinite,
    tier: s <= 20 ? 'normal' : s < INFINITE.startStage ? 'loop' : 'infinity',
  };
}

/** 스프라이트 경로. 히어로 3프레임은 assets/sprites/ 루트, 몬스터/보스/펫은 하위 폴더. */
export function spriteSrc(name) {
  if (typeof name === 'string' && name.indexOf('pet_') === 0) return `assets/sprites/pet/${name}.png`;
  if (name === 'warrior' || name === 'hero_idle') return 'assets/sprites/hero_idle.png';
  if (name === 'hero_attack') return 'assets/sprites/hero_attack.png';
  if (name === 'hero_skill') return 'assets/sprites/hero_skill.png';
  const m = MONSTERS[name];
  return m && m.boss ? `assets/sprites/boss/${name}.png` : `assets/sprites/monster/${name}.png`;
}

/** 하위 호환용 별칭 */
export const monsterSrc = spriteSrc;
export function monsterKo(name) {
  return (MONSTERS[name] || {}).ko || name;
}

/* ────────────────────────────── 장비 5부위 ────────────────────────────── */
export const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'ring', 'amulet'];
export const EQUIP_MAX_LV = 100;

export const EQUIP = {
  weapon: { name: '무기', icon: '⚔️', stat: '공격력', per: 3.2, unit: '', desc: '강화 1당 공격력 +3.2' },
  armor: { name: '갑옷', icon: '🛡️', stat: '체력', per: 55, unit: '', desc: '강화 1당 최대 체력 +55' },
  helmet: { name: '투구', icon: '🪖', stat: '체력', per: 36, unit: '', desc: '강화 1당 최대 체력 +36' },
  ring: { name: '반지', icon: '💍', stat: '치명타', per: 0.5, unit: '%', desc: '강화 1당 치명타 확률 +0.5%' },
  amulet: { name: '부적', icon: '🧿', stat: '골드 획득', per: 2, unit: '%', desc: '강화 1당 골드 획득 +2%' },
};

/* ────────────────────────────── 장비 등급(뽑기) ──────────────────────────────
 * v3.1: 강화 레벨(0~100)은 그대로 두고, 장비 '등급'을 뽑기로 얻는다.
 *  - 등급은 강화 레벨에 준하는 보정(RARITY_BONUS_LV)을 더해 스탯을 올린다.
 *  - 일반=황금 / 고급=초록 / 레어=파랑 / 영웅=보라 / 전설=불타는 적금빛(파티클)
 *  - 오라·검기 색은 캐릭터에 장착된 등급에서 그대로 나온다(render.js).
 */
export const RARITIES = [
  {
    id: 'common', name: '일반', weight: 52, bonusLv: 0, dust: 2,
    color: '#ffcf5c', glow: 'rgba(255,207,92,0.55)',
    slash: { core: '#fff3cf', mid: '#ffd76a', glow: '#ffb347' },
  },
  {
    id: 'advanced', name: '고급', weight: 28, bonusLv: 4, dust: 6,
    color: '#5ee1a3', glow: 'rgba(94,225,163,0.55)',
    slash: { core: '#eafff4', mid: '#5ee1a3', glow: '#1f9c66' },
  },
  {
    id: 'rare', name: '레어', weight: 13, bonusLv: 9, dust: 14,
    color: '#69c0ff', glow: 'rgba(105,192,255,0.6)',
    slash: { core: '#eaf7ff', mid: '#69c0ff', glow: '#2f7fd8' },
  },
  {
    id: 'hero', name: '영웅', weight: 5.5, bonusLv: 16, dust: 30,
    color: '#b98bff', glow: 'rgba(185,139,255,0.62)',
    slash: { core: '#f3e8ff', mid: '#b98bff', glow: '#7d45e0' },
  },
  {
    id: 'legend', name: '전설', weight: 1.5, bonusLv: 25, dust: 70, fire: true,
    color: '#ff7a3d', glow: 'rgba(255,122,61,0.7)',
    slash: { core: '#fff2c4', mid: '#ff9a3d', glow: '#ff3b2f' },
  },
];

export const RARITY_INDEX = RARITIES.reduce((m, r, i) => { m[r.id] = i; return m; }, {});
export const RARITY_IDS = RARITIES.map((r) => r.id);

/** 등급 id → 강화 레벨 환산 보정 */
export function rarityBonusLv(id) {
  const r = RARITIES[RARITY_INDEX[id] || 0];
  return r ? r.bonusLv : 0;
}
export function rarityInfo(id) {
  return RARITIES[RARITY_INDEX[id] || 0];
}

/* ────────────────────────────── 뽑기 규칙 ──────────────────────────────
 * 골드 또는 강화석으로 1회/10회. 10회는 10% 할인 + 최소 레어 1개 보장.
 * 40회 안에 전설 1개 확정(천장). 중복은 강화석으로 자동 분해된다.
 */
export const GACHA = {
  goldCost: 600,
  shardCost: 10,
  tenDiscount: 0.9,
  pityLegend: 40,
  tenGuarantee: 'rare',
  maxSlotsPerPull: 10,
};

/** 뽑기 가격 계산 — cur: 'gold' | 'shards', times: 1 | 10 */
export function gachaCost(cur = 'gold', times = 1) {
  const n = times >= 10 ? 10 : 1;
  const key = cur === 'shards' ? 'shards' : 'gold';
  const unit = key === 'shards' ? GACHA.shardCost : GACHA.goldCost;
  const amount = Math.round(unit * n * (n === 10 ? GACHA.tenDiscount : 1));
  return { cur: key, n, amount };
}

export const ENHANCE_COST_BASE = 2;
export const ENHANCE_COST_GROWTH = 1.06;

export function enhanceCost(lv) {
  return Math.ceil(ENHANCE_COST_BASE * Math.pow(ENHANCE_COST_GROWTH, lv));
}

/* ────────────────────────────── 스킬 4종 ────────────────────────────── */
export const SKILLS = {
  strike: { name: '강격', icon: '💥', key: '1', cd: 5000, mul: 2.6, color: '#ffce54', desc: '단일 대상에게 260% 피해' },
  whirl: { name: '범위 베기', icon: '🌀', key: '2', cd: 9000, mul: 1.35, color: '#7fd3ff', desc: '화면 전체 적에게 135% 피해' },
  berserk: { name: '광폭', icon: '🔥', key: '3', cd: 22000, dur: 7000, bonus: 0.6, color: '#ff7a59', desc: '7초간 공격력 +60%' },
  heal: { name: '회복', icon: '💚', key: '4', cd: 16000, ratio: 0.28, color: '#7fe08a', desc: '최대 체력의 28% 회복' },
};
export const SKILL_UPGRADE_MAX = 20;
export const SKILL_COST_BASE = 6;
export const SKILL_COST_GROWTH = 1.3;

export function skillCost(lv) {
  return Math.ceil(SKILL_COST_BASE * Math.pow(SKILL_COST_GROWTH, lv));
}
/** 스킬 레벨 1당 효과 +12% */
export function skillPowerMul(lv) {
  return 1 + 0.12 * (lv || 0);
}

/* ────────────────────────────── 부동산 버프 ──────────────────────────────
 * 보유 매물(통합 상태의 land.owned)에서 계산하는 영구 패시브.
 *  - 공격력: 3평 이상 보유한 지역 1곳당 +1.5% (최대 60%)
 *  - 체력:   보유 50평당 +1% (최대 50%)
 *  - 골드:   보유 매물 평가액 3,000골드당 +1% (최대 60%)
 *  - 치명타: 건물 2곳당 +0.2% (최대 10%)
 *  - 드롭:   보유 500평당 +1% (최대 40%)
 */
export const PROP_BUFFS = {
  cityMinPyeong: 3, // 한 지역에서 3평 이상 보유해야 '건물(보유 지역)'로 인정
  atkPerCity: 1.5,
  atkCap: 60,
  hpPerPyeong: 50,
  hpPer: 1,
  hpCap: 50,
  goldPerAsset: 3000,
  goldPer: 1,
  goldCap: 60,
  critPerCities: 2,
  critPer: 0.2,
  critCap: 10,
  dropPerPyeong: 500,
  dropPer: 1,
  dropCap: 40,
};
