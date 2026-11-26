// land-rpg / src/data.js
// 밸런스·몬스터·장비·스킬 정의. DOM 의존 없음(헤드리스 테스트 가능).
// v3: 게스트 전용 통합 경제 — 골드 하나로 사냥과 부동산을 함께 굴린다.

export const APP_VERSION = '6.5.0';
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
  playerRange: 620, // 공격 사거리(월드 단위) — 부채꼴로 붙은 몬스터 무리까지 닿게
  playerX: 200, // 플레이어 고정 x (왼쪽 고정 — 오른쪽은 몬스터 무리 자리)
  spawnX: 900, // 몬스터 등장 x (화면 오른쪽 끝 — 금방 무리로 합류)
  maxMonsters: 6, // v3.8: 화면에 쌓이는 최대 수(다굴)
  spawnMs: 900, // v3.8: 계속 몰려오는 스폰 주기
  reviveMs: 3000, // 사망 후 부활 대기
  // v4.3 부활 가호 — 부활 직후 잠깐 받는 피해를 크게 줄여 무리에 다시 눌리지 않게 한다.
  reviveGraceMs: 3500, // 가호 지속(ms) — 상단 배너에 남은 시간이 표시된다
  reviveGraceReduce: 0.4, // 가호 중 받는 피해 배율(0.4 = 60% 경감)
  shakeMax: 12, // 화면 흔들림 상한 — 과하지 않게
  shakeTrim: 0.87, // 흔들림 감쇠
  bossTimeLimitMs: 60000,

  // 웨이브 / 보스
  normalKillsPerStage: 10, // 10마리 처치마다 보스 도전 가능
  bossRetryKills: 4, // 보스 실패 후 재도전까지 필요한 처치 수
  autoBossDelayMs: 1400,

  // 몬스터 성장 (v3 리밸런싱: 초반 완만, 10스테이지부터 가팔라짐)
  monsterHpBase: 52,
  monsterHpGrowth: 1.17, // v3.8: 다굴 — 한 마리 처치는 빠르게, 대신 계속 몰려온다
  monsterHpLateBoost: 0.03, // 10스테이지 이후 추가 성장(장비·건물주 버프 요구)
  monsterAtkBase: 4,
  monsterAtkGrowth: 1.135,
  monsterAtkLateBoost: 0.08, // v3.8: S14부터 스테이지당 +8% 추가 — 다굴 피해가 실제로 아프게
  monsterAtkLateFrom: 14,
  monsterAttackMs: 1500,

  // 보상
  goldBase: 7,
  goldGrowth: 1.15,
  expBase: 11,
  expGrowth: 1.135,
  bossHpMul: 4.2,
  bossAtkMul: 1.12,
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

/* ────────────────────────────── 무한 스테이지 확장 (v3.5 → v4.4 리밸런싱) ──────────────────────────────
 * S1~30은 기존 곡선을 **그대로** 쓴다(회귀 테스트·밸런스 유지).
 * S31부터는 '∞ 확장 구간'으로 넘어간다. v3.5~v4.3은 완만한 곡선(체력 ×1.035)이라
 * S30만 넘기면 전설 장비·환생 특성·펫 진화를 갖춘 빌드가 수십 스테이지를 순식간에 지나갔다.
 *
 * v4.4: S31+ 성장률을 S30 직전 곡선(체력 ×1.17~1.20 / 공격 ×1.135~1.21)에 가깝게 끌어올려,
 *       ∞ 구간에서도 '한 스테이지씩 벽을 밀어 올리는' 긴장감을 되살린다.
 *  - 체력 ×1.08 / 공격 ×1.05 / 골드 ×1.075 / 경험치 ×1.055 (스테이지당)
 *  - 체력이 공격보다 가파르므로(×1.08 대 ×1.05) 스테이지가 오를수록 처치는 느려지고
 *    맞는 피해는 상대적으로 무거워진다 → 방어·회복·흡혈·순간딜(강격·브레스)이 계속 필요하다.
 *  - 골드·경험치를 체력보다 조금 낮게(×1.075·×1.055) 두어 보상은 성장에 맞춰 오르되
 *    상위 구간의 강화석 시세가 너무 싸지지 않게 한다.
 *  - 스테이지 목록·테마·보스는 기존 STAGES/THEMES 순환을 그대로 이어 무한히 정의된다.
 *  - 이 구간의 진행 동력은 레벨·상위 전직(5·6단계)·환생 특성·펫 진화·장비 강화 네 가지다.
 */
export const INFINITE = {
  baseStage: 30, // 이 스테이지까지는 기존 곡선
  startStage: 31, // 여기부터 ∞ 확장 구간(UI 배지)
  hpGrowth: 1.08,
  atkGrowth: 1.05,
  goldGrowth: 1.075,
  expGrowth: 1.055,
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

/** 일반 몬스터 1마리 기준 공격력(보스 배율 제외)
 *  v3.8: S14부터 스테이지당 +8% 추가 — 여러 마리가 동시에 때리는 다굴에서 방어/체력이 필요해진다.
 *  (S1~13은 기존 곡선 그대로 → 초반 진행이 막히지 않는다) */
export function monsterBaseAtk(stage) {
  const s = Math.max(1, Math.floor(Number(stage) || 1));
  if (s <= INFINITE.baseStage) {
    const late = 1 + Math.min(ECON.monsterAtkLateBoost * Math.max(0, s - ECON.monsterAtkLateFrom), 1.6);
    return ECON.monsterAtkBase * Math.pow(ECON.monsterAtkGrowth, s - 1) * late;
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
  // 일반 몬스터 23종
  //  · 초원
  Slime: { ko: '슬라임', boss: false },
  Goblin: { ko: '고블린', boss: false },
  Kobold: { ko: '코볼트', boss: false },
  //  · 고목림
  Orc: { ko: '오크', boss: false },
  Werewolf: { ko: '웨어울프', boss: false },
  Harpy: { ko: '하피', boss: false },
  //  · 폐허
  Skeleton: { ko: '스켈레톤', boss: false },
  Zombie: { ko: '좀비', boss: false },
  //  · 공통 대형
  Cyclops: { ko: '사이클롭스', boss: false },
  Minotaur: { ko: '미노타우로스', boss: false },
  Golem: { ko: '골렘', boss: false },
  Drake: { ko: '드레이크', boss: false },
  //  · 모래벌 (v3.8 신규)
  Scorpion: { ko: '스콜피온', boss: false },
  Mummy: { ko: '미라', boss: false },
  Sandworm: { ko: '샌드웜', boss: false },
  //  · 지하 동굴 (v3.8 신규)
  Batling: { ko: '동굴 박쥐', boss: false },
  CaveSpider: { ko: '거대 거미', boss: false },
  //  · 용암 지대 (v3.8 신규)
  FireImp: { ko: '파이어 임프', boss: false },
  MagmaGolem: { ko: '용암 골렘', boss: false },
  //  · 빙원 (v3.8 신규)
  IceWolf: { ko: '아이스 울프', boss: false },
  FrostWisp: { ko: '서리 정령', boss: false },
  //  · 심연 (v3.8 신규)
  ShadowWraith: { ko: '그림자 망령', boss: false },
  AbyssEye: { ko: '심연의 눈', boss: false },
  //  · v5.7 신규 일반 몬스터 6종 (보물 고블린 포함)
  TreasureGoblin: { ko: '보물 고블린', boss: false },
  Lizardman: { ko: '리자드맨', boss: false },
  Gargoyle: { ko: '가고일', boss: false },
  DarkElf: { ko: '다크엘프', boss: false },
  FrostGolem: { ko: '서리 골렘', boss: false },
  AbyssKnight: { ko: '심연 기사', boss: false },
  // 보스 16종 (v3.8: +5, v5.7: +4)
  SlimeKing: { ko: '슬라임 킹', boss: true },
  Troll: { ko: '트롤', boss: true },
  Cerberus: { ko: '케르베로스', boss: true },
  DeathLord: { ko: '데스로드', boss: true },
  RedDragon: { ko: '레드드래곤', boss: true },
  VoidWalker: { ko: '보이드 워커', boss: true },
  Seraphim: { ko: '세라핌', boss: true },
  Anubis: { ko: '아누비스', boss: true },
  CaveTroll: { ko: '동굴 트롤', boss: true },
  Ifrit: { ko: '이프리트', boss: true },
  IceGiant: { ko: '아이스 자이언트', boss: true },
  AbyssLord: { ko: '아비스 로드', boss: true },
  LichKing: { ko: '리치 킹', boss: true },
  Phoenix: { ko: '피닉스', boss: true },
  Kraken: { ko: '크라켄', boss: true },
  Behemoth: { ko: '베히모스', boss: true },
};

/* ────────────────────────────── v5.7.0 엘리트 변종 · 보물 고블린 ────────────────────────────── */
export const ELITE_CHANCE = 0.08;
export const ELITE_TRAITS = [
  { id: 'iron', name: '철갑', icon: '🛡️', color: '#7cc4ff', hpMul: 1.9, atkMul: 1.15, dmgReduce: 0.25, rewardMul: 3 },
  { id: 'swift', name: '신속', icon: '⚡', color: '#ffe36a', hpMul: 1.5, atkMul: 1.25, speedMul: 1.35, rewardMul: 3 },
  { id: 'frenzy', name: '광폭', icon: '🔥', color: '#ff6b57', hpMul: 1.65, atkMul: 1.45, rewardMul: 3.2 },
  { id: 'regen', name: '재생', icon: '🩸', color: '#5ee1a3', hpMul: 1.8, atkMul: 1.15, regenPct: 0.03, rewardMul: 3.2 },
];
export const TREASURE_GOBLIN = {
  name: 'TreasureGoblin',
  chance: 0.025,
  minStage: 2,
  durationMs: 12000,
  hpMul: 1.8,
  goldMul: 12,
  shards: 6,
};

/* ────────────────────────────── 몬스터 모션 (v3.7) ──────────────────────────────
 * 스프라이트는 1장뿐이라, 렌더러가 종류별 '움직임 문법'으로 살아 있는 느낌을 만든다.
 *  - slime  : 통통 튀는 점프 + 착지 스쿼시 & 스트레치(그림자 크기 연동)
 *  - flyer  : 공중 호버링 + 날갯짓(신축·기울기) + 지면에서 떨어진 그림자
 *  - walker : 좌우 걸음 바운스 + 앞쪽 기울기 + 발걸음 먼지
 */
export const MONSTER_MOTION = {
  // 슬라임류
  Slime: 'slime',
  SlimeKing: 'slime',
  // ・사구에서 기어나와 덮치는 샌드웜
  Sandworm: 'slime',
  // 비행 · 부유형
  Harpy: 'flyer',
  Drake: 'flyer',
  RedDragon: 'flyer',
  Seraphim: 'flyer',
  VoidWalker: 'flyer',
  Batling: 'flyer',
  FrostWisp: 'flyer',
  FireImp: 'flyer',
  ShadowWraith: 'flyer',
  AbyssEye: 'flyer',
  Ifrit: 'flyer',
  // 보행 · 돌격형
  Goblin: 'walker',
  Kobold: 'walker',
  Skeleton: 'walker',
  Zombie: 'walker',
  Orc: 'walker',
  Werewolf: 'walker',
  Golem: 'walker',
  Minotaur: 'walker',
  Cyclops: 'walker',
  Troll: 'walker',
  Cerberus: 'walker',
  DeathLord: 'walker',
  Scorpion: 'walker',
  Mummy: 'walker',
  CaveSpider: 'walker',
  MagmaGolem: 'walker',
  IceWolf: 'walker',
  Anubis: 'walker',
  CaveTroll: 'walker',
  IceGiant: 'walker',
  AbyssLord: 'walker',
  // v5.7 신규 10종
  TreasureGoblin: 'walker',
  Lizardman: 'walker',
  Gargoyle: 'flyer',
  DarkElf: 'walker',
  FrostGolem: 'walker',
  AbyssKnight: 'walker',
  LichKing: 'flyer',
  Phoenix: 'flyer',
  Kraken: 'slime',
  Behemoth: 'walker',
};

/** 몬스터 이름 → 모션 아키타입(모르면 보행형) */
export function monsterMotion(name) {
  return MONSTER_MOTION[name] || 'walker';
}

/* 공격 방식 — 근접(할퀴기/내려찍기/물기)과 원거리 투사체(화염구·깃털·암흑·신성·산성).
 * kind: melee | ranged,  move: claw | slam | bite | fire | feather | dark | holy | acid
 * 색은 렌더러의 전조 오라·궤적·투사체 색으로 그대로 쓰인다. */
export const MONSTER_ATTACKS = {
  Slime: { kind: 'melee', move: 'slam', color: '#7fe0b0' },
  Goblin: { kind: 'melee', move: 'claw', color: '#ffcf6a' },
  Kobold: { kind: 'melee', move: 'claw', color: '#ffd166' },
  Orc: { kind: 'melee', move: 'slam', color: '#ffa94d' },
  Skeleton: { kind: 'melee', move: 'claw', color: '#e8eef6' },
  Zombie: { kind: 'melee', move: 'bite', color: '#a6e07f' },
  Werewolf: { kind: 'melee', move: 'claw', color: '#ff8a5c' },
  Cyclops: { kind: 'melee', move: 'slam', color: '#ffb066' },
  Minotaur: { kind: 'melee', move: 'slam', color: '#ff9b4d' },
  Golem: { kind: 'melee', move: 'slam', color: '#c8b08a' },
  Harpy: { kind: 'ranged', move: 'feather', proj: 'feather', color: '#9fe0ff' },
  Drake: { kind: 'ranged', move: 'fire', proj: 'fire', color: '#ff8a3d' },
  SlimeKing: { kind: 'ranged', move: 'acid', proj: 'acid', color: '#8ef0a8' },
  Troll: { kind: 'melee', move: 'slam', color: '#b7e07f' },
  Cerberus: { kind: 'melee', move: 'bite', color: '#ff7a5c' },
  DeathLord: { kind: 'ranged', move: 'dark', proj: 'dark', color: '#b98bff' },
  RedDragon: { kind: 'ranged', move: 'fire', proj: 'fire', color: '#ff6a3d' },
  VoidWalker: { kind: 'ranged', move: 'dark', proj: 'dark', color: '#c78fff' },
  Seraphim: { kind: 'ranged', move: 'holy', proj: 'holy', color: '#ffe9a8' },
  // v3.8 신규
  Scorpion: { kind: 'melee', move: 'claw', color: '#f0a24a' },
  Mummy: { kind: 'melee', move: 'slam', color: '#e8d3a8' },
  Sandworm: { kind: 'melee', move: 'bite', color: '#e6b06a' },
  Batling: { kind: 'ranged', move: 'sonic', proj: 'sonic', color: '#9fb4ff' },
  CaveSpider: { kind: 'melee', move: 'bite', color: '#b99bff' },
  FireImp: { kind: 'ranged', move: 'fire', proj: 'fire', color: '#ff8a3d' },
  MagmaGolem: { kind: 'melee', move: 'slam', color: '#ff6a2a' },
  IceWolf: { kind: 'melee', move: 'bite', color: '#a8e6ff' },
  FrostWisp: { kind: 'ranged', move: 'ice', proj: 'ice', color: '#bfeaff' },
  ShadowWraith: { kind: 'ranged', move: 'dark', proj: 'dark', color: '#b98bff' },
  AbyssEye: { kind: 'ranged', move: 'dark', proj: 'dark', color: '#c78fff' },
  Anubis: { kind: 'melee', move: 'claw', color: '#f0c883' },
  CaveTroll: { kind: 'melee', move: 'slam', color: '#9fd17f' },
  Ifrit: { kind: 'ranged', move: 'fire', proj: 'fire', color: '#ff7a2a' },
  IceGiant: { kind: 'melee', move: 'slam', color: '#a8e6ff' },
  AbyssLord: { kind: 'ranged', move: 'dark', proj: 'dark', color: '#c78fff' },
  // v5.7 신규 10종
  TreasureGoblin: { kind: 'melee', move: 'claw', color: '#ffd76a' },
  Lizardman: { kind: 'melee', move: 'claw', color: '#5ee1a3' },
  Gargoyle: { kind: 'ranged', move: 'dark', proj: 'dark', color: '#a8b6c8' },
  DarkElf: { kind: 'ranged', move: 'dark', proj: 'dark', color: '#b98bff' },
  FrostGolem: { kind: 'melee', move: 'slam', color: '#8fe3ff' },
  AbyssKnight: { kind: 'melee', move: 'slam', color: '#9f78ff' },
  LichKing: { kind: 'ranged', move: 'dark', proj: 'dark', color: '#7fd3ff' },
  Phoenix: { kind: 'ranged', move: 'fire', proj: 'fire', color: '#ff8a3d' },
  Kraken: { kind: 'ranged', move: 'acid', proj: 'acid', color: '#5ecbff' },
  Behemoth: { kind: 'melee', move: 'slam', color: '#ff5a3d' },
};

/** 몬스터 이름 → 공격 정의(모르면 근접 할퀴기) */
export function monsterAttack(name) {
  return MONSTER_ATTACKS[name] || { kind: 'melee', move: 'claw', color: '#ffd166' };
}

/* 플레이어 캐릭터 3프레임 (대기 / 공격 / 스킬) */
export const HERO_FRAMES = {
  idle: 'hero_idle',
  attack: 'hero_attack',
  skill: 'hero_skill',
};

/* ────────────────────────────── 스테이지 ──────────────────────────────
 * v3.8: 8개 테마 × 3스테이지 = 24스테이지로 확장. THEMES 길이(8)와 나뉘어떨어져
 *       (24 % 8 = 0) 스테이지를 계속 돌아도 배경 테마와 몬스터 구성이 어긋나지 않는다.
 *       (이전에는 20스테이지 × 8테마가 어긋나 S21부터 배경과 몹이 따로 놀았다)
 */
export const STAGES = [
  // ・초원
  { normals: ['Slime', 'Goblin', 'Kobold'], boss: 'SlimeKing' },
  // ・고목림
  { normals: ['Kobold', 'Werewolf', 'Harpy'], boss: 'Troll' },
  // ・폐허
  { normals: ['Skeleton', 'Zombie', 'Orc'], boss: 'Cerberus' },
  // ・모래벌
  { normals: ['Scorpion', 'Mummy', 'Sandworm'], boss: 'Anubis' },
  // ・지하 동굴
  { normals: ['Batling', 'CaveSpider', 'Goblin'], boss: 'CaveTroll' },
  // ・용암 지대
  { normals: ['FireImp', 'MagmaGolem', 'Drake'], boss: 'Ifrit' },
  // ・빙원
  { normals: ['IceWolf', 'FrostWisp', 'Werewolf'], boss: 'IceGiant' },
  // ・심연
  { normals: ['ShadowWraith', 'AbyssEye', 'Skeleton'], boss: 'AbyssLord' },
  // ・초원
  { normals: ['Slime', 'Kobold', 'Cyclops'], boss: 'SlimeKing' },
  // ・고목림
  { normals: ['Werewolf', 'Orc', 'Harpy'], boss: 'Troll' },
  // ・폐허
  { normals: ['Skeleton', 'Zombie', 'Minotaur'], boss: 'DeathLord' },
  // ・모래벌
  { normals: ['Scorpion', 'Sandworm', 'Mummy'], boss: 'Anubis' },
  // ・지하 동굴
  { normals: ['Batling', 'CaveSpider', 'Golem'], boss: 'CaveTroll' },
  // ・용암 지대
  { normals: ['FireImp', 'MagmaGolem', 'Drake'], boss: 'RedDragon' },
  // ・빙원
  { normals: ['IceWolf', 'FrostWisp', 'Cyclops'], boss: 'IceGiant' },
  // ・심연
  { normals: ['ShadowWraith', 'AbyssEye', 'Minotaur'], boss: 'VoidWalker' },
  // ・초원
  { normals: ['Slime', 'Goblin', 'Lizardman'], boss: 'SlimeKing' },
  // ・고목림
  { normals: ['Werewolf', 'Lizardman', 'Harpy'], boss: 'Troll' },
  // ・폐허
  { normals: ['Gargoyle', 'DarkElf', 'Minotaur'], boss: 'Seraphim' },
  // ・모래벌
  { normals: ['Mummy', 'Scorpion', 'Lizardman'], boss: 'Behemoth' },
  // ・지하 동굴
  { normals: ['CaveSpider', 'Gargoyle', 'Golem'], boss: 'Kraken' },
  // ・용암 지대
  { normals: ['Drake', 'FireImp', 'MagmaGolem'], boss: 'Phoenix' },
  // ・빙원
  { normals: ['FrostWisp', 'IceWolf', 'FrostGolem'], boss: 'LichKing' },
  // ・심연
  { normals: ['AbyssEye', 'DarkElf', 'AbyssKnight'], boss: 'AbyssLord' },
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
    tier: s <= STAGES.length ? 'normal' : s < INFINITE.startStage ? 'loop' : 'infinity',
  };
}

/** 스프라이트 경로. 히어로 3프레임은 assets/sprites/ 루트, 몬스터/보스/펫/이펙트는 하위 폴더. */
export function spriteSrc(name) {
  if (typeof name === 'string' && name.indexOf('pet_') === 0) return `assets/sprites/pet/${name}.png`;
  if (typeof name === 'string' && name.indexOf('fx_') === 0) return `assets/sprites/fx/${name}.png`;
  if (name === 'warrior' || name === 'hero_idle') return 'assets/sprites/hero_idle.png';
  if (name === 'hero_attack') return 'assets/sprites/hero_attack.png';
  if (name === 'hero_skill') return 'assets/sprites/hero_skill.png';
  const m = MONSTERS[name];
  return m && m.boss ? `assets/sprites/boss/${name}.png` : `assets/sprites/monster/${name}.png`;
}

/* ────────────────────────────── 전투 배경 (v4.1) ──────────────────────────────
 * 테마 8종마다 SD 2D 판타지 횡스크롤 배경 일러스트를 assets/bg/<id>.webp 로 둔다.
 *  · 960×640 WebP(장당 30~90KB) — 모바일 캐시 부담을 줄인 크기.
 *  · 렌더러는 '비율 유지 + 넘치는 쪽 잘라내기(cover)'로 그린다 → 캔버스 비율이 달라도
 *    지면선이 캐릭터 발밑(groundY)에 그대로 맞는다.
 *  · 파일이 없거나 로딩 전이면 기존 그라데이션 배경이 그대로 폴백으로 쓰인다.
 */
export const BG_DIR = 'assets/bg';
export function bgSrc(themeId) {
  return `${BG_DIR}/${themeId}.webp`;
}

/** 하위 호환용 별칭 */
export const monsterSrc = spriteSrc;
export function monsterKo(name) {
  return (MONSTERS[name] || {}).ko || name;
}

/* ────────────────────────────── 방어 · 회복 (v3.8) ──────────────────────────────
 * 다굴 전투에서 '버티는 힘'을 만드는 스탯.
 *  - 방어(피해 감소): 갑옷·투구 강화에서 나온다(등급 환산 레벨 포함). 최대 80%.
 *  - 회복: 초당 최대 체력의 1.2% 자연 회복. 환생 특성 '생명'으로 더 올린다.
 */
export const DEF = {
  armorPer: 0.35, // 갑옷 강화 1당 피해 감소 +0.35%
  helmetPer: 0.22, // 투구 강화 1당 +0.22%
  cap: 0.8, // 피해 감소 상한 80%
  regenBase: 0.012, // 초당 최대 체력 대뱄 자연 회복
};

/* ────────────────────────────── 장비 5부위 ──────────────────────────────
 * v4.0: 부위 이름·강화 효과는 그대로 두고, 그 위에 '장비 종류·고유 옵션·인벤토리'(src/gear.js)가 얹힌다.
 *  · 강화 레벨(s.equip)은 부위에 남는다 → 어떤 장비로 갈아껴도 강화 수치가 유지된다.
 *  · gearRarity 는 장착 아이템의 등급을 그대로 비추는 값(렌더러·도감 호환).
 */
export const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'ring', 'amulet'];
export const EQUIP_MAX_LV = 100;

export const EQUIP = {
  weapon: { name: '무기', icon: '⚔️', stat: '공격력', per: 3.2, unit: '', desc: '강화 1당 공격력 +3.2' },
  armor: { name: '갑옷', icon: '🛡️', stat: '체력·방어', per: 55, defPer: 0.35, unit: '', desc: '강화 1당 최대 체력 +55 · 피해 감소 +0.35%' },
  helmet: { name: '투구', icon: '🪖', stat: '체력·방어', per: 36, defPer: 0.22, unit: '', desc: '강화 1당 최대 체력 +36 · 피해 감소 +0.22%' },
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

/* ────────────────────────────── v5.10.0 스킬 룬 각성 ──────────────────────────────
 * 각 기본 스킬이 Lv.3에 도달하면 2가지 룬 중 1개를 자유롭게 장착·전환할 수 있다.
 * 미선택(null) 시 기존 기본 효과 그대로 유지(기존 밸런스 100% 호환).
 */
export const SKILL_RUNE_UNLOCK_LV = 3;
export const SKILL_RUNES = {
  strike: [
    { id: 'lightning', name: '번개 강격', icon: '⚡', color: '#7fd3ff', short: '2연타(총 124%) · 치명 +20%p', hits: 2, hitMul: 0.62, critAdd: 0.20 },
    { id: 'execute',   name: '처형 일격', icon: '🩸', color: '#ff5f7e', short: '보스 피해 +40% · 흡혈 15%', bossAdd: 0.40, lifesteal: 0.15 },
  ],
  whirl: [
    { id: 'flame', name: '화염 회오리', icon: '🔥', color: '#ff8a47', short: '4초 화상(초당 공격력 38%)', burnMs: 4000, burnMul: 0.38 },
    { id: 'frost', name: '서리 검풍',   icon: '❄️', color: '#9be7ff', short: '4초 빙결(적 공속 -35% · 이속 -30%)', slowMs: 4000, slowAtkMul: 1.35, slowMoveMul: 0.70 },
  ],
  berserk: [
    { id: 'fury', name: '광전사',      icon: '⚔️', color: '#ff4d4d', short: '지속 중 공속 +25% · 치명피해 +35%p', atkSpdMul: 0.80, critDmgAdd: 0.35 },
    { id: 'iron', name: '불굴의 투지', icon: '🛡️', color: '#ffd76a', short: '지속 중 피해감소 +18%p · 흡혈 +8%p', reduceAdd: 0.18, lifestealAdd: 0.08 },
  ],
  heal: [
    { id: 'shield', name: '성광 보호막', icon: '✨', color: '#ffe38a', short: '초과 회복 + 체력 12% 보호막(8초)', shieldMs: 8000, shieldBase: 0.12 },
    { id: 'bless',  name: '축복의 빛',   icon: '🌟', color: '#b98bff', short: '6초 공격 +22% · 쿨타임 1.2초 단축', blessMs: 6000, blessAtk: 0.22, cdTrimMs: 1200 },
  ],
};

export function skillRuneDef(key, runeId) {
  const list = SKILL_RUNES[key];
  if (!Array.isArray(list) || !runeId) return null;
  return list.find((r) => r.id === runeId) || null;
}

/** 현재 적용 중인 스킬 룬 정의(Lv.3 미만 또는 미선택 시 null) */
export function skillRuneOf(state, key) {
  const sk = state && state.skills && state.skills[key];
  if (!sk || (sk.lv || 0) < SKILL_RUNE_UNLOCK_LV || !sk.rune) return null;
  return skillRuneDef(key, sk.rune);
}
/* ────────────────────────────── 상위 전직 궁극기 (v4.7) ──────────────────────────────
 * 5단계 드래곤 로드부터 열리는 다섯 번째 필살기.
 *  - 기존 4개 스킬 퀵슬롯은 그대로 두고, 전투 화면에 전용 궁극기 버튼을 따로 둔다.
 *  - 조건이 차면 자동으로 발동하고(설정에서 끌 수 있다), 직접 눌러도 시전된다.
 *  - mul 은 공격력 배율(모든 적에게), dur/bonus 는 발동 뒤 한동안의 공격력 버프, heal 은 최대 체력 대비 회복.
 */
export const ULTIMATES = [
  {
    tier: 4, id: 'ult_dragon', name: '용의 심판', icon: '🐉', key: 'ultimate',
    cd: 45000, mul: 8.5, dur: 5000, bonus: 0.5, heal: 0.12, color: '#ff4d8d', burst: '#ff8fb0',
    desc: '전장의 모든 적에게 850% 피해 · 5초간 공격력 +50% · 체력 12% 회복',
  },
  {
    tier: 5, id: 'ult_god', name: '용신 강림', icon: '👑', key: 'ultimate',
    cd: 36000, mul: 13, dur: 6000, bonus: 0.7, heal: 0.2, color: '#ffe9a8', burst: '#fff6c4',
    desc: '전장의 모든 적에게 1300% 피해 · 6초간 공격력 +70% · 체력 20% 회복',
  },
];
export const ULT_MIN_TIER = ULTIMATES[0].tier; // 궁극기 해금 전직 단계(5단계 드래곤 로드)

/** 현재 전직 단계에 맞는 궁극기(없으면 null = 아직 해금 전) */
export function ultimateOf(state) {
  const t = Math.max(0, Math.floor(Number(state && state.jobTier) || 0));
  if (t < ULT_MIN_TIER) return null;
  let pick = null;
  for (const u of ULTIMATES) if (u.tier <= t) pick = u;
  return pick;
}

/** 궁극기 실효 쿨타임 — 부동산 시너지 + 영지 성채 마법탑 쿨감(상한 40%)을 반영한다 */
export function ultCdOf(state, buffs) {
  const u = ultimateOf(state);
  if (!u) return 0;
  const towLv = Math.max(0, Math.min(10, Math.floor(Number(state && state.citadel && state.citadel.levels && state.citadel.levels.tower) || 0)));
  const cdr = Math.min(0.4, Math.max(0, (Number((buffs || {}).synCdrPct) || 0) + towLv * 1.2) / 100);
  return u.cd * (1 - cdr);
}

/** 궁극기 남은 쿨타임(ms) — 아직 한 번도 쓰지 않았으면 0(바로 사용 가능) */
export function ultLeftMs(state, buffs, now = Date.now()) {
  if (!ultimateOf(state)) return 0;
  const last = Math.max(0, Number(state && state.ult && state.ult.last) || 0);
  if (last <= 0) return 0;
  return Math.max(0, last + ultCdOf(state, buffs) - now);
}

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
