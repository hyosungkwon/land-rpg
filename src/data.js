// land-rpg / src/data.js
// 밸런스·몬스터·장비·스킬 정의. DOM 의존 없음(헤드리스 테스트 가능).

export const APP_VERSION = '1.0.0';
export const SAVE_KEY = 'land_rpg_state_v1';
export const SAVE_VERSION = 1;

/* ────────────────────────────── 경제 상수 ──────────────────────────────
 * 밸런스 조정은 이 블록만 고치면 된다.
 */
export const ECON = {
  startGold: 300,
  startShards: 6,

  // 전투
  playerAttackMs: 620, // 기본 공격 간격
  playerRange: 130, // 공격 사거리(월드 단위)
  playerX: 250, // 플레이어 고정 x
  spawnX: 1000, // 몬스터 등장 x
  maxMonsters: 3,
  reviveMs: 3000, // 사망 후 부활 대기
  bossTimeLimitMs: 60000,

  // 웨이브 / 보스
  normalKillsPerStage: 10, // 10마리 처치마다 보스 도전 가능
  bossRetryKills: 4, // 보스 실패 후 재도전까지 필요한 처치 수
  autoBossDelayMs: 1400,

  // 몬스터 성장
  monsterHpBase: 55,
  monsterHpGrowth: 1.27,
  monsterAtkBase: 4,
  monsterAtkGrowth: 1.19,
  monsterAttackMs: 1500,

  // 보상
  goldBase: 7,
  goldGrowth: 1.2,
  expBase: 11,
  expGrowth: 1.17,
  bossHpMul: 9,
  bossAtkMul: 1.45,
  bossGoldMul: 6,
  bossExpMul: 5,
  bossShardBase: 3,
  bossShardPerStage: 0.5,
  shardDropChance: 0.18,

  // 레벨
  expNeedBase: 60,
  expNeedGrowth: 1.16,

  // 오프라인 정산
  offlineCapHours: 12,
  offlineRate: 0.5, // 방치 시 실제 획득의 50%
  offlineKillsPerSec: 0.22,

  // RPG → 부동산 환전 (인플레 방지)
  exchangeRate: 2, // 1 골드 = 2원
  exchangeDailyCap: 200000, // 하루 최대 ₩200,000
  exchangeMinGold: 500,

  // 부동산 → RPG 배당 보너스
  dividendShardPer: 30000, // 미수령 배당 ₩30,000 당 강화석 1개
  dividendShardMax: 500,
};

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
 * art: true 인 7종은 1408x768 보스 일러스트(assets/boss/)를 쓴다.
 */
export const MONSTERS = {
  Slime: { ko: '슬라임', art: false },
  Goblin: { ko: '고블린', art: false },
  Kobold: { ko: '코볼트', art: false },
  Orc: { ko: '오크', art: false },
  Werewolf: { ko: '웨어울프', art: false },
  Skeleton: { ko: '스켈레톤', art: false },
  Zombie: { ko: '좀비', art: false },
  Ghoul: { ko: '구울', art: false },
  Bugbear: { ko: '버그베어', art: false },
  Lizardman: { ko: '리자드맨', art: false },
  Harpy: { ko: '하피', art: false },
  Scorpion: { ko: '스콜피온', art: false },
  GiantAnt: { ko: '자이언트앤트', art: false },
  Cyclops: { ko: '사이클롭스', art: false },
  Minotaur: { ko: '미노타우로스', art: false },
  Troll: { ko: '트롤', art: false },
  Ogre: { ko: '오우거', art: false },
  Wyvern: { ko: '와이번', art: false },
  Golem: { ko: '골렘', art: false },
  Gargoyle: { ko: '가고일', art: false },
  Succubus: { ko: '서큐버스', art: false },
  Cerberus: { ko: '케르베로스', art: false },
  DeathKnight: { ko: '데스나이트', art: false },
  Drake: { ko: '드레이크', art: false },
  Beholder: { ko: '비홀더', art: false },
  Basilisk: { ko: '바실리스크', art: false },
  Cockatrice: { ko: '코카트리스', art: false },
  BlackKnight: { ko: '블랙나이트', art: false },
  DeathLord: { ko: '데스로드', art: false },
  Lich: { ko: '리치', art: false },
  RedDragon: { ko: '레드드래곤', art: false },
  FrostGiant: { ko: '프로스트자이언트', art: false },
  Phoenix: { ko: '피닉스', art: false },
  AncientDragon: { ko: '에인션트드래곤', art: false },
  ShadowKnight: { ko: '섀도우나이트', art: false },
  GiantWorm: { ko: '자이언트웜', art: false },
  Kraken: { ko: '크라켄', art: false },
  Behemoth: { ko: '베히모스', art: false },
  Tiamat: { ko: '티아마트', art: false },
  Leviathan: { ko: '리바이어던', art: false },
  DragonLord: { ko: '드래곤로드', art: false },
  DemiGod: { ko: '데미갓', art: false },
  ChaosOverlord: { ko: '카오스오버로드', art: false },
  AncientOne: { ko: '에인션트원', art: false },
  WorldEater: { ko: '월드이터', art: false },
  // ── 보스 일러스트 전용 ──
  SlimeKing: { ko: '슬라임 킹', art: true },
  DarkTitan: { ko: '다크 타이탄', art: true },
  VoidWalker: { ko: '보이드 워커', art: true },
  SoulReaper: { ko: '소울 리퍼', art: true },
  AbyssalHorror: { ko: '어비설 호러', art: true },
  CelestialGuard: { ko: '셀레스티얼 가드', art: true },
  Seraphim: { ko: '세라핌', art: true },
};

/* ────────────────────────────── 스테이지 ────────────────────────────── */
export const STAGES = [
  { normals: ['Slime', 'Goblin', 'Kobold'], boss: 'SlimeKing' },
  { normals: ['Orc', 'Werewolf', 'Skeleton'], boss: 'Bugbear' },
  { normals: ['Zombie', 'Ghoul', 'Lizardman'], boss: 'Minotaur' },
  { normals: ['Harpy', 'Scorpion', 'GiantAnt'], boss: 'Cyclops' },
  { normals: ['Lizardman', 'Harpy', 'Cyclops'], boss: 'Troll' },
  { normals: ['Scorpion', 'GiantAnt', 'Minotaur'], boss: 'Golem' },
  { normals: ['Ogre', 'Troll', 'Wyvern'], boss: 'Cerberus' },
  { normals: ['Golem', 'Gargoyle', 'Succubus'], boss: 'DeathLord' },
  { normals: ['Basilisk', 'Cockatrice', 'Drake'], boss: 'Beholder' },
  { normals: ['DeathKnight', 'Lich', 'DeathLord'], boss: 'BlackKnight' },
  { normals: ['RedDragon', 'FrostGiant', 'Phoenix'], boss: 'RedDragon' },
  { normals: ['Phoenix', 'AncientDragon', 'ShadowKnight'], boss: 'FrostGiant' },
  { normals: ['GiantWorm', 'Kraken', 'Behemoth'], boss: 'Phoenix' },
  { normals: ['Tiamat', 'Leviathan', 'DragonLord'], boss: 'Kraken' },
  { normals: ['DemiGod', 'AncientOne', 'WorldEater'], boss: 'DragonLord' },
  { normals: ['ChaosOverlord', 'DemiGod', 'WorldEater'], boss: 'ShadowKnight' },
  { normals: ['WorldEater', 'ChaosOverlord', 'AncientOne'], boss: 'DarkTitan' },
  { normals: ['Tiamat', 'Leviathan', 'Behemoth'], boss: 'VoidWalker' },
  { normals: ['DragonLord', 'ChaosOverlord', 'WorldEater'], boss: 'AbyssalHorror' },
  { normals: ['AncientOne', 'DemiGod', 'Behemoth'], boss: 'CelestialGuard' },
  { normals: ['WorldEater', 'Tiamat', 'Leviathan'], boss: 'SoulReaper' },
  { normals: ['ChaosOverlord', 'DragonLord', 'AncientOne'], boss: 'Seraphim' },
];

/** 스테이지 번호(1부터) → 스테이지 정의. 23스테이지 이후는 순환하며 난이도만 계속 오른다. */
export function stageDef(stage) {
  const s = Math.max(1, Math.floor(stage));
  const base = STAGES[(s - 1) % STAGES.length];
  const theme = THEMES[(s - 1) % THEMES.length];
  const loop = Math.floor((s - 1) / STAGES.length);
  return {
    num: s,
    normals: base.normals,
    boss: base.boss,
    theme,
    themeName: theme.name + (loop > 0 ? ` ${loop + 1}` : ''),
    loop,
  };
}

export function monsterSrc(name) {
  if (name === 'warrior') return 'assets/char/warrior.png'; // 플레이어 캐릭터는 char/ 에 있음
  const m = MONSTERS[name];
  return m && m.art ? `assets/boss/${name}.png` : `assets/monster/${name}.png`;
}
export function monsterKo(name) {
  return (MONSTERS[name] || {}).ko || name;
}

/* ────────────────────────────── 장비 5부위 ────────────────────────────── */
export const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'ring', 'amulet'];
export const EQUIP_MAX_LV = 50;

export const EQUIP = {
  weapon: { name: '무기', icon: '⚔️', stat: '공격력', per: 2.6, unit: '', desc: '강화 1당 공격력 +2.6' },
  armor: { name: '갑옷', icon: '🛡️', stat: '체력', per: 38, unit: '', desc: '강화 1당 최대 체력 +38' },
  helmet: { name: '투구', icon: '🪖', stat: '체력', per: 24, unit: '', desc: '강화 1당 최대 체력 +24' },
  ring: { name: '반지', icon: '💍', stat: '치명타', per: 0.5, unit: '%', desc: '강화 1당 치명타 확률 +0.5%' },
  amulet: { name: '부적', icon: '🧿', stat: '골드 획득', per: 2, unit: '%', desc: '강화 1당 골드 획득 +2%' },
};

export const ENHANCE_COST_BASE = 2;
export const ENHANCE_COST_GROWTH = 1.105;

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
 * 부동산 데이터(users/{uid}/state)에서 계산하는 영구 패시브.
 */
export const PROP_BUFFS = {
  atkPerBuilding: 2, // 서로 다른 지역 1곳당 공격력 +2%
  atkCap: 40,
  goldPerEok: 10, // 최고자산 1억당 골드 +10%
  goldCap: 100,
  hpPerPyeong: 0.05, // 보유 100평당 체력 +5% … (총평/2000)
  hpCap: 40,
  dropPerPyeong: 1, // 보유 500평당 드롭률 +1%
  dropPer500: 500,
  dropCap: 50,
};
