// land-rpg / src/tower.js
// v4.2 🗼 도전의 탑 — 층마다 다른 기믹으로 스펙·장비 조합을 시험하는 영구 진행 콘텐츠.
//   · 1~10층은 손으로 만든 고정 층. 층마다 테마·기믹·목표(처치 수/보스)·제한 시간이 다르다.
//   · v4.5: 11층부터는 자동 생성되는 무한 확장 구간(TOWER_MAX_FLOOR=200).
//     5층마다 한 단계씩 강해지고(계단식), 보스 층에는 기믹이 3개 겹친다. 보상도 층마다 커진다.
//   · 최고 층을 하루 한 번 '일일 소탕'으로 되돌릴 수 있어 재도전 동기가 끊기지 않는다.
//   · 몬스터 체력은 '내 DPS × 목표 처치 시간', 공격력은 '내 최대 체력 × 비율'로 잡는다
//     → 스테이지가 올라가도 난이도가 흐려지지 않고, 빌드(방어·흡혈·범위·순간딜)가 그대로 시험된다.
//   · 최초 클리어에만 골드·강화석·초월석·장비를 지급하고, 재도전은 소액 보상만 준다.
//   · 패배/시간 초과 시에도 잃는 것은 없고 원래 사냥 스테이지로 안전하게 돌아간다(무한 재도전).
// DOM 의존 없음 → 헤드리스 검증 가능.
import { stageGoldBase, RARITIES, RARITY_INDEX, THEMES, monsterKo } from './data.js';
import { rebirthBonus } from './rebirth.js';
import { randomItemOfRarity } from './gear.js';
import { kstDateKey, kstResetMs } from './daily.js';

/* ────────────────────────────── 층별 기믹 ──────────────────────────────
 * 각 기믹은 전투에 실제로 적용된다(combat.js 의 towerTick · hit · damagePlayer).
 *  swarm      다굴 웨이브   : 화면 상한이 9마리까지 → 범위 베기·흡혈이 없으면 녹는다
 *  barrage    원거리 포격   : 모두 원거리에서 쏜다 → 방어·체력으로 버텨야 한다
 *  frenzy     광폭 보스     : 10초마다 보스 공격력 +25% → 빠르게 끝내야 한다
 *  regen      재생의 벽     : 초당 최대 체력 20% 회복 → 순간 화력(강격·브레스)이 필요
 *  timeattack 타임어택     : 제한 시간이 짧다 → 화력 총량 시험
 *  guard      철벽 진형     : 받는 피해 45% 감소 → 오래 때리는 빌드가 유리
 */
export const TOWER_GIMMICKS = {
  swarm: { id: 'swarm', name: '다굴 웨이브', icon: '👥', color: '#8fe3a8', desc: '최대 9마리가 몰려와 동시에 때립니다.' },
  barrage: { id: 'barrage', name: '원거리 포격', icon: '🏹', color: '#7fd3ff', desc: '모두 뒤쪽에서 투사체를 쏩니다.' },
  frenzy: { id: 'frenzy', name: '광폭 보스', icon: '🔥', color: '#ff8a5c', desc: '10초마다 보스 공격력 +25%.' },
  regen: { id: 'regen', name: '재생의 벽', icon: '♻️', color: '#a8e6ff', desc: '초당 최대 체력 20% 회복 — 순간 화력이 필요합니다.' },
  timeattack: { id: 'timeattack', name: '타임어택', icon: '⏱️', color: '#ffd76a', desc: '짧은 제한 시간 안에 목표 처치.' },
  guard: { id: 'guard', name: '철벽 진형', icon: '🛡️', color: '#c8b08a', desc: '받는 피해 45% 감소.' },
};

export const TOWER_GIMMICK_IDS = Object.keys(TOWER_GIMMICKS);

/* 기믹 수치 — combat.js 가 그대로 참조한다(검증에서 수치 확인) */
export const TOWER_RULES = {
  guardReduce: 0.45, // 철벽 진형: 플레이어가 주는 피해 감소
  regenPerSec: 0.2, // 재생의 벽: 몬스터 초당 최대 체력 회복 비율(지속딜만으로는 못 잡는다)
  frenzyEveryMs: 10000, // 광폭: 상승 주기
  frenzyStep: 0.25, // 광폭: 1회당 공격력 증가율
  bossAtkMul: 1.6, // 보스 공격력 배율(일반 대비)
  repeatRate: 0.35, // 재도전(2회차 이후) 보상 비율
  sweepRate: 0.7, // 일일 소탕(최고 층 1회) — 최초 클리어 보상의 70%, 초월석·장비는 없음
};

/* ────────────────────────────── 층 정의 ──────────────────────────────
 * theme   : THEMES 의 id (배경·조명이 그대로 바뀐다)
 * gimmicks: 위 기믹 id 배열(2개 이상이면 동시 적용)
 * goal    : 처치 목표(보스 층은 1)
 * killSec : 내 DPS 기준 일반 몹 1마리 처치 목표 시간(초)
 * bossSec : 보스 1마리 처치 목표 시간(초)
 * atkOfHp : 몬스터 1대 피해 = 내 최대 체력의 %(일반)
 * reward  : 최초 클리어 보상 — 골드 = 스테이지 기본 골드 × goldMul · 강화석 · 초월석 · 장비 등급
 */
export const TOWER_FLOORS = [
  {
    n: 1, name: '첫 관문', theme: 'meadow', gimmicks: ['swarm'],
    minStage: 1,
    goal: 12, timeLimitMs: 60000, maxAlive: 8, spawnMs: 520, killSec: 1.5, atkOfHp: 0.9,
    normals: ['Slime', 'Goblin', 'Kobold'], boss: null,
    tip: '몰려오는 무리를 범위 베기로 쓸어내세요.',
    reward: { goldMul: 200, shards: 35, points: 0 },
  },
  {
    n: 2, name: '원거리 사격장', theme: 'forest', gimmicks: ['barrage'],
    minStage: 2,
    goal: 9, timeLimitMs: 55000, maxAlive: 6, spawnMs: 900, killSec: 1.6, atkOfHp: 1.5,
    normals: ['Harpy', 'Batling', 'FrostWisp'], boss: null,
    tip: '포격은 피할 수 없습니다 — 방어·체력으로 버티세요.',
    reward: { goldMul: 240, shards: 45, points: 0 },
  },
  {
    n: 3, name: '광폭의 왕좌', theme: 'ruins', gimmicks: ['frenzy'],
    minStage: 4,
    goal: 1, timeLimitMs: 50000, maxAlive: 1, spawnMs: 900, killSec: 2.4, bossSec: 16, atkOfHp: 4.0,
    normals: ['Skeleton'], boss: 'Cerberus', bossOnly: true,
    tip: '시간이 지날수록 아파집니다. 강격·광폭으로 밀어붙이세요.',
    reward: { goldMul: 300, shards: 55, points: 2 },
  },
  {
    n: 4, name: '재생의 벽', theme: 'cave', gimmicks: ['regen'],
    minStage: 6,
    goal: 10, timeLimitMs: 65000, maxAlive: 6, spawnMs: 850, killSec: 2.2, atkOfHp: 1.6,
    normals: ['CaveSpider', 'Golem', 'Batling'], boss: null,
    tip: '조금씩 깎으면 회복됩니다 — 한 번에 크게 넣으세요.',
    reward: { goldMul: 360, shards: 60, points: 0 },
  },
  {
    n: 5, name: '스물여섯 초', theme: 'desert', gimmicks: ['timeattack'],
    minStage: 8,
    goal: 9, timeLimitMs: 26000, maxAlive: 6, spawnMs: 700, killSec: 1.4, atkOfHp: 1.3,
    normals: ['Scorpion', 'Mummy', 'Sandworm'], boss: null,
    tip: '26초. 화력 총량이 전부입니다.',
    reward: { goldMul: 420, shards: 70, points: 0, item: 'rare' },
  },
  {
    n: 6, name: '철벽 진형', theme: 'volcano', gimmicks: ['guard'],
    minStage: 10,
    goal: 11, timeLimitMs: 70000, maxAlive: 6, spawnMs: 800, killSec: 2.0, atkOfHp: 1.7,
    normals: ['MagmaGolem', 'FireImp', 'Drake'], boss: null,
    tip: '피해가 45% 깎입니다 — 오래 때리는 빌드가 유리합니다.',
    reward: { goldMul: 500, shards: 80, points: 3 },
  },
  {
    n: 7, name: '무리의 파도', theme: 'ice', gimmicks: ['swarm', 'guard'],
    minStage: 13,
    goal: 16, timeLimitMs: 80000, maxAlive: 9, spawnMs: 420, killSec: 1.6, atkOfHp: 1.3,
    normals: ['IceWolf', 'FrostWisp', 'Cyclops'], boss: null,
    tip: '아홉 마리가 철벽으로 몰려옵니다. 흡혈이 필요합니다.',
    reward: { goldMul: 600, shards: 95, points: 0 },
  },
  {
    n: 8, name: '포격과 광폭', theme: 'abyss', gimmicks: ['barrage', 'frenzy'],
    minStage: 16,
    goal: 1, timeLimitMs: 60000, maxAlive: 1, spawnMs: 900, killSec: 2.4, bossSec: 20, atkOfHp: 5.2,
    normals: ['AbyssEye'], boss: 'AbyssLord', bossOnly: true,
    tip: '쏘면서 강해지는 보스 — 버티는 사이에 끝내야 합니다.',
    reward: { goldMul: 720, shards: 110, points: 4 },
  },
  {
    n: 9, name: '재생 타임어택', theme: 'ruins', gimmicks: ['regen', 'timeattack'],
    minStage: 19,
    goal: 12, timeLimitMs: 45000, maxAlive: 7, spawnMs: 620, killSec: 1.9, atkOfHp: 1.7,
    normals: ['ShadowWraith', 'Skeleton', 'Minotaur'], boss: null,
    tip: '회복하는 적을 45초 안에 — 순간 폭딜이 답입니다.',
    reward: { goldMul: 860, shards: 130, points: 0 },
  },
  {
    n: 10, name: '탑의 정점', theme: 'abyss', gimmicks: ['guard', 'frenzy'],
    minStage: 22,
    goal: 1, timeLimitMs: 80000, maxAlive: 1, spawnMs: 900, killSec: 2.4, bossSec: 22, atkOfHp: 5.0,
    normals: ['AbyssEye'], boss: 'VoidWalker', bossOnly: true,
    tip: '철벽 + 광폭. 탑의 주인이 기다립니다.',
    reward: { goldMul: 1200, shards: 200, points: 6, item: 'legend' },
  },
];

/* ────────────────────────────── ♾️ 11층+ 무한 확장 (v4.5) ──────────────────────────────
 * 고정 10층 뒤로는 같은 규칙으로 층을 만들어 쓴다(결정론 — 같은 층은 항상 같은 정의).
 *   · 5층마다 '한 단계' 강해진다: 적 공격력·처치 목표 시간·클리어 보상이 계단식으로 오른다.
 *   · 기믹은 6종을 돌려 가며 2개씩, 5층마다(보스 층) 3개가 겹친다.
 *   · 테마·몬스터 구성도 돌아가므로 심층은 매번 다른 배경에서 싸운다.
 * 몬스터 체력은 여전히 '내 DPS × 처치 목표 시간'이라 스테이지와 무관하게 빌드만 시험한다.
 */
const DEEP_NAMES = [
  '끝없는 회랑', '별이 꺼진 정원', '봉인된 제단', '시간의 나선', '심연의 성문', '용암의 왕좌',
  '서리 감옥', '공허의 종탑', '천둥의 계단', '빛바랜 신전', '균열의 심장', '무한의 정점',
];
const DEEP_THEMES = ['abyss', 'ice', 'volcano', 'ruins', 'desert', 'cave', 'forest', 'meadow'];
const DEEP_GROUPS = [
  ['ShadowWraith', 'AbyssEye', 'Skeleton'],
  ['IceWolf', 'FrostWisp', 'Cyclops'],
  ['MagmaGolem', 'FireImp', 'Drake'],
  ['AbyssEye', 'ShadowWraith', 'Minotaur'],
  ['Scorpion', 'Mummy', 'Sandworm'],
  ['CaveSpider', 'Golem', 'Batling'],
];
const DEEP_BOSSES = ['AbyssLord', 'VoidWalker', 'Cerberus', 'DeathLord', 'IceGiant', 'Ifrit', 'Seraphim', 'Anubis'];
const DEEP_STEP_EVERY = 5; // 5층마다 한 단계
const DEEP_BASE_MIN_STAGE = 22; // 10층(탑의 정점)과 같은 스테이지 조건 — 이후는 빌드 싸움

export const TOWER_FIXED_FLOOR = TOWER_FLOORS.length; // 손으로 만든 고정 층 수(10)
export const TOWER_MAX_FLOOR = 200; // 무한 확장 포함 최대 층(생성 상한)
export const TOWER_DEEP = {
  stepEvery: DEEP_STEP_EVERY,
  minStage: DEEP_BASE_MIN_STAGE,
  baseKillSec: 1.85, // 11층 일반 몹 처치 목표 시간(초)
  stepKillSec: 0.1, // 한 단계당 +0.1초
  baseBossSec: 18, // 11층 보스 처치 목표 시간(초)
  stepBossSec: 1.6, // 한 단계당 +1.6초
  baseAtkOfHp: 1.05, // 11층 몹 1대 = 내 최대 체력의 1.05%
  stepAtkOfHp: 0.16, // 한 단계당 +0.16%p
  baseGoldMul: 1300, // 11층 골드 배율(스테이지 기본 골드 ×)
  stepGoldMul: 110, // 층마다 +110
  baseShards: 220,
  stepShards: 16,
};

const DEEP_CACHE = new Map();

/** 11층 이상 층 정의(11~TOWER_MAX_FLOOR). 범위 밖이면 null */
export function towerDeepFloor(n) {
  const k = Math.floor(Number(n) || 0);
  if (!(k > TOWER_FIXED_FLOOR) || k > TOWER_MAX_FLOOR) return null;
  if (DEEP_CACHE.has(k)) return DEEP_CACHE.get(k);
  const c = k - TOWER_FIXED_FLOOR; // 11층 = 1
  const idx = c - 1;
  const step = Math.floor(idx / DEEP_STEP_EVERY); // 5층마다 한 단계
  const bossOnly = c % DEEP_STEP_EVERY === 0; // 15·20·25… 보스 층
  const gim = TOWER_GIMMICK_IDS;
  const gimmicks = bossOnly
    ? [gim[idx % 6], gim[(idx + 2) % 6], gim[(idx + 4) % 6]]
    : [gim[idx % 6], gim[(idx + 2) % 6]];
  const goal = bossOnly ? 1 : 10 + (idx % 4) * 2;
  const killSec = DEEP.killSec(c, step);
  const bossSec = DEEP.bossSec(step);
  const atkOfHp = DEEP.atkOfHp(step);
  const timeLimitMs = bossOnly
    ? Math.max(35000, 60000 - step * 1800)
    : Math.max(40000, 72000 - step * 2200);
  const def = {
    n: k,
    name: DEEP_NAMES[idx % DEEP_NAMES.length],
    theme: DEEP_THEMES[idx % DEEP_THEMES.length],
    gimmicks,
    minStage: DEEP_BASE_MIN_STAGE,
    goal,
    timeLimitMs,
    maxAlive: bossOnly ? 1 : 6 + (idx % 3),
    spawnMs: bossOnly ? 900 : 820 - (idx % 3) * 90,
    killSec,
    bossSec,
    atkOfHp,
    normals: DEEP_GROUPS[idx % DEEP_GROUPS.length],
    boss: bossOnly ? DEEP_BOSSES[step % DEEP_BOSSES.length] : null,
    bossOnly,
    deep: true,
    tip: bossOnly
      ? '세 기믹이 겹치는 심층 보스 — 빌드를 총동원하세요.'
      : `${DEEP_STEP_EVERY}층마다 기믹이 하나 더 겹치고 적이 강해집니다.`,
    reward: {
      goldMul: DEEP.goldMul(c),
      shards: DEEP.shards(c),
      points: bossPoints(bossOnly, c),
      item: bossOnly ? (k % 20 === 0 ? 'legend' : 'rare') : (c % 3 === 0 ? 'rare' : null),
    },
  };
  DEEP_CACHE.set(k, def);
  return def;
}

/* 심층 수치 — 검증·UI 가 같은 식을 참조한다 */
export const DEEP = {
  killSec: (c, step) => Math.round((TOWER_DEEP.baseKillSec + step * TOWER_DEEP.stepKillSec + (c % DEEP_STEP_EVERY) * 0.02) * 100) / 100,
  bossSec: (step) => TOWER_DEEP.baseBossSec + step * TOWER_DEEP.stepBossSec,
  atkOfHp: (step) => Math.round((TOWER_DEEP.baseAtkOfHp + step * TOWER_DEEP.stepAtkOfHp) * 100) / 100,
  goldMul: (c) => TOWER_DEEP.baseGoldMul + c * TOWER_DEEP.stepGoldMul,
  shards: (c) => TOWER_DEEP.baseShards + c * TOWER_DEEP.stepShards,
};

/** 심층 보스 층 초월석 — 5층마다 6P, 위로 갈수록 조금씩 더 */
function bossPoints(bossOnly, c) {
  if (!bossOnly) return 0;
  return 6 + Math.floor(c / 5);
}

/** 층 번호 → 정의(고정 1~10 · 자동 생성 11~200 · 없으면 null) */
export function towerFloor(n) {
  const k = Math.floor(Number(n) || 0);
  return TOWER_BY_N[k] || towerDeepFloor(k) || null;
}

export const TOWER_BY_N = TOWER_FLOORS.reduce((m, f) => { m[f.n] = f; return m; }, {});

/** 층 정의 → 기믹 정의 배열 */
export function towerGimmicks(def) {
  const list = (def && Array.isArray(def.gimmicks) ? def.gimmicks : []).map((id) => TOWER_GIMMICKS[id]).filter(Boolean);
  return list;
}

/** 층 정의에 기믹 id 가 포함되는가 */
export function towerHas(def, id) {
  return !!(def && Array.isArray(def.gimmicks) && def.gimmicks.includes(id));
}

/** 층 기믹 한 줄 텍스트("👥 다굴 웨이브 · 🛡️ 철벽 진형") */
export function towerGimmickText(def) {
  const g = towerGimmicks(def);
  return g.length ? g.map((x) => `${x.icon} ${x.name}`).join(' · ') : '기믹 없음';
}

/** 층 목표 텍스트("12마리 처치 · 60초") */
export function towerGoalText(def) {
  if (!def) return '—';
  const sec = Math.round(def.timeLimitMs / 1000);
  return def.bossOnly ? `${monsterKo(def.boss)} 격파 · ${sec}초` : `${def.goal}마리 처치 · ${sec}초`;
}

/**
 * 층 정의를 stageDef 와 같은 모양으로 바꾼다 — 렌더러·HUD 가 테마/몬스터 구성을 그대로 읽는다.
 * themeName 에 층 이름이 들어가 전투 화면 HUD 가 '도전의 탑 7층 · 무리의 파도'로 바뀐다.
 */
export function towerStageDef(n) {
  const def = towerFloor(n);
  if (!def) return null;
  const theme = THEMES.find((t) => t.id === def.theme) || THEMES[0];
  return {
    num: def.n,
    normals: def.normals,
    boss: def.boss || def.normals[0],
    bossOnly: !!def.bossOnly,
    theme,
    themeName: `도전의 탑 ${def.n}층 · ${def.name}`,
    loop: 0,
    infinite: false,
    tier: 'tower',
    tower: true,
    floor: def,
    gimmicks: def.gimmicks.slice(),
  };
}

/* ────────────────────────────── 저장 상태 ────────────────────────────── */
export function defaultTowerState() {
  return { cleared: [], best: 0, runs: 0, fails: 0, last: null, sweep: { date: '', floor: 0, gold: 0, shards: 0, at: 0 } };
}

/** state.tower 보장(없거나 손상되면 새로 만든다) */
export function towerState(state) {
  if (!state || typeof state !== 'object') return defaultTowerState();
  if (!state.tower || typeof state.tower !== 'object') state.tower = defaultTowerState();
  return state.tower;
}

/** 저장본 → 정상화된 탐 기록(층 번호 1~10 · 중복 제거 · 숫자 보정) */
export function normalizeTowerState(raw) {
  const base = defaultTowerState();
  if (!raw || typeof raw !== 'object') return base;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
  const cleared = Array.isArray(raw.cleared)
    ? [...new Set(raw.cleared.map((v) => Math.floor(num(v, 0))).filter((n) => n >= 1 && n <= TOWER_MAX_FLOOR))].sort((a, b) => a - b)
    : [];
  const lastRaw = raw.last && typeof raw.last === 'object' ? raw.last : null;
  const last = lastRaw && Math.floor(num(lastRaw.n, 0)) >= 1
    ? {
      at: Math.max(0, num(lastRaw.at, 0)),
      n: Math.max(1, Math.min(TOWER_MAX_FLOOR, Math.floor(num(lastRaw.n, 1)))),
      how: typeof lastRaw.how === 'string' ? lastRaw.how.slice(0, 12) : 'clear',
      kills: Math.max(0, Math.floor(num(lastRaw.kills, 0))),
      bossKills: Math.max(0, Math.floor(num(lastRaw.bossKills, 0))),
      dmg: Math.max(0, Math.round(num(lastRaw.dmg, 0))),
      gold: Math.max(0, Math.floor(num(lastRaw.gold, 0))),
      shards: Math.max(0, Math.floor(num(lastRaw.shards, 0))),
      points: Math.max(0, Math.floor(num(lastRaw.points, 0))),
    }
    : null;
  const bestCleared = cleared.length ? cleared[cleared.length - 1] : 0;
  const rawSweep = raw.sweep && typeof raw.sweep === 'object' ? raw.sweep : {};
  const sweep = {
    date: typeof rawSweep.date === 'string' ? rawSweep.date.slice(0, 10) : '',
    floor: Math.max(0, Math.min(TOWER_MAX_FLOOR, Math.floor(num(rawSweep.floor, 0)))),
    gold: Math.max(0, Math.floor(num(rawSweep.gold, 0))),
    shards: Math.max(0, Math.floor(num(rawSweep.shards, 0))),
    at: Math.max(0, num(rawSweep.at, 0)),
  };
  return {
    cleared,
    best: Math.max(0, Math.min(TOWER_MAX_FLOOR, Math.max(Math.floor(num(raw.best, 0)), bestCleared))),
    runs: Math.max(0, Math.floor(num(raw.runs, 0))),
    fails: Math.max(0, Math.floor(num(raw.fails, 0))),
    last,
    sweep,
  };
}

/** 클리어한 층 목록(1~MAX, 중복 없이 정렬) */
export function clearedFloors(state) {
  const raw = state && state.tower && Array.isArray(state.tower.cleared) ? state.tower.cleared : [];
  const set = new Set(raw.map((v) => Math.floor(Number(v) || 0)).filter((n) => n >= 1 && n <= TOWER_MAX_FLOOR));
  return [...set].sort((a, b) => a - b);
}

/** 해당 층 클리어 기록이 있는가 */
export function towerCleared(state, n) {
  return clearedFloors(state).includes(Math.floor(Number(n) || 0));
}

/** 입장 가능 여부 — 1층은 항상, n층은 n-1층 클리어 + 최고 스테이지 조건이 필요하다(심층 포함) */
export function towerUnlocked(state, n) {
  const k = Math.floor(Number(n) || 0);
  if (k < 1 || k > TOWER_MAX_FLOOR) return false;
  const def = towerFloor(k);
  if (!def) return false;
  const maxStage = Math.max(1, Math.floor(Number(state && state.maxStage) || 1));
  const need = Math.max(1, Math.floor(Number(def.minStage) || 1));
  if (maxStage < need) return false;
  if (k === 1) return true;
  return towerCleared(state, k - 1);
}

/** 입장이 안 되는 이유(가능하면 '') */
export function towerLockReason(state, n) {
  const k = Math.floor(Number(n) || 0);
  const def = towerFloor(k);
  if (!def) return '없는 층입니다.';
  const maxStage = Math.max(1, Math.floor(Number(state && state.maxStage) || 1));
  if (maxStage < (def.minStage || 1)) return `최고 스테이지 ${def.minStage} 필요`;
  if (k > 1 && !towerCleared(state, k - 1)) return `${k - 1}층을 먼저 클리어해야 합니다.`;
  return '';
}

/**
 * 탑 진행 요약 — UI·검증 공용
 * { max, fixed, clearedCount, cleared, best, deep, next, nextDef, allCleared, pct }
 */
export function towerProgress(state) {
  const cleared = clearedFloors(state);
  const best = Math.max(0, Math.min(TOWER_MAX_FLOOR, Math.max(Math.floor(Number(state && state.tower && state.tower.best) || 0), cleared.length ? cleared[cleared.length - 1] : 0)));
  let next = 1;
  for (let i = 1; i <= TOWER_MAX_FLOOR; i++) if (!cleared.includes(i)) { next = i; break; }
  const allCleared = cleared.length >= TOWER_MAX_FLOOR;
  return {
    max: TOWER_MAX_FLOOR,
    fixed: TOWER_FIXED_FLOOR,
    clearedCount: cleared.length,
    cleared,
    best,
    deep: best > TOWER_FIXED_FLOOR,
    next: allCleared ? 0 : next,
    nextDef: allCleared ? null : towerFloor(next),
    allCleared,
    pct: cleared.length / TOWER_MAX_FLOOR,
  };
}

/* ────────────────────────────── 🧹 일일 소탕 (v4.5) ──────────────────────────────
 * 하루 한 번, 지금까지 오른 '최고 층'을 다시 돌지 않고 한 번에 털어 골드·강화석을 받는다.
 * 심층(11층+)으로 갈수록 소탕 보상도 커져 매일 접속할 이유가 된다. 초월석·장비는 없다(직접 도전 몫).
 */
export function towerSweepInfo(state, now = Date.now()) {
  const st = towerState(state);
  const date = kstDateKey(now);
  const best = Math.max(0, Math.min(TOWER_MAX_FLOOR, Math.floor(Number(st.best) || 0)));
  const claimed = !!(st.sweep && st.sweep.date === date);
  return {
    date,
    best,
    claimed,
    available: best >= 1 && !claimed,
    floor: best,
    resetMs: kstResetMs(now),
    last: st.sweep && st.sweep.date ? st.sweep : null,
  };
}

/** 일일 소탕 실행 — 최고 층 1회분(최초 보상의 70%)을 즉시 지급한다 */
export function towerSweepClaim(state, now = Date.now()) {
  const info = towerSweepInfo(state, now);
  if (info.best < 1) return { ok: false, reason: '아직 클리어한 층이 없습니다.' };
  if (info.claimed) return { ok: false, reason: '오늘 소탕 보상은 이미 받았습니다 — 내일 00:00(KST)에 다시 열립니다.' };
  const def = towerFloor(info.best);
  if (!def) return { ok: false, reason: '소탕할 층이 없습니다.' };
  const stage = Math.max(1, Math.floor(Number(state && state.stage) || 1));
  const rb = rebirthBonus(state);
  const r = def.reward || {};
  const gold = Math.max(0, Math.round(stageGoldBase(stage) * (r.goldMul || 200) * TOWER_RULES.sweepRate * (1 + rb.goldPct / 100)));
  const shards = Math.max(0, Math.round((r.shards || 30) * TOWER_RULES.sweepRate * (1 + rb.shardPct / 100)));
  state.gold = Math.floor((Number(state.gold) || 0) + gold);
  state.shards = Math.floor((Number(state.shards) || 0) + shards);
  if (state.records) state.records.totalGold = (Number(state.records.totalGold) || 0) + gold;
  const st = towerState(state);
  st.sweep = { date: info.date, floor: info.best, gold, shards, at: now };
  return { ok: true, floor: info.best, name: def.name, gold, shards, date: info.date };
}

/** 소탕 버튼 한 줄 텍스트 — "🧹 12층 소탕 💰12,400 💎150" */
export function towerSweepText(state) {
  const info = towerSweepInfo(state);
  if (info.best < 1) return '최고 층부터 열립니다';
  const def = towerFloor(info.best);
  const stage = Math.max(1, Math.floor(Number(state && state.stage) || 1));
  const rb = rebirthBonus(state);
  const r = (def && def.reward) || {};
  const gold = Math.round(stageGoldBase(stage) * (r.goldMul || 200) * TOWER_RULES.sweepRate * (1 + rb.goldPct / 100));
  const shards = Math.round((r.shards || 30) * TOWER_RULES.sweepRate * (1 + rb.shardPct / 100));
  return `${info.best}층 소탕 💰${gold.toLocaleString('ko-KR')} 💎${shards}`;
}

/* ────────────────────────────── 보상 ────────────────────────────── */
/**
 * 층 클리어 보상 계산.
 *  - 최초 클리어: 골드(스테이지 기본 골드 × goldMul) · 강화석 · 초월석 · (지정 층은) 장비
 *  - 재도전: 골드·강화석 35%, 초월석·장비는 없음
 * @param {{first?:boolean, rng?:Function}} opts
 */
export function towerReward(state, n, opts = {}) {
  const def = towerFloor(n);
  if (!def) return null;
  const first = opts.first !== false;
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const stage = Math.max(1, Math.floor(Number(state && state.stage) || 1));
  const rb = rebirthBonus(state);
  const r = def.reward || {};
  const rate = first ? 1 : TOWER_RULES.repeatRate;
  const gold = Math.max(0, Math.round(stageGoldBase(stage) * (r.goldMul || 200) * rate * (1 + rb.goldPct / 100)));
  const shards = Math.max(0, Math.round((r.shards || 30) * rate * (1 + rb.shardPct / 100)));
  const points = first ? Math.max(0, Math.floor(Number(r.points) || 0)) : 0;
  let item = null;
  if (first && r.item) item = randomItemOfRarity(r.item, rng);
  return { gold, shards, points, item, first, floor: def.n };
}

/** 보상 미리보기 텍스트 — "💰12,400 💎70 ✨2P 🎒레어" */
export function towerRewardText(state, n) {
  const def = towerFloor(n);
  if (!def) return '—';
  const r = def.reward || {};
  const parts = [];
  const rb = rebirthBonus(state);
  const stage = Math.max(1, Math.floor(Number(state && state.stage) || 1));
  parts.push(`💰${Math.round(stageGoldBase(stage) * (r.goldMul || 200) * (1 + rb.goldPct / 100)).toLocaleString('ko-KR')}`);
  if (r.shards) parts.push(`💎${Math.round(r.shards * (1 + rb.shardPct / 100))}`);
  if (r.points) parts.push(`✨${r.points}P`);
  if (r.item) {
    const rar = RARITIES[RARITY_INDEX[r.item] || 0];
    if (rar) parts.push(`🎒${rar.name}`);
  }
  return parts.join(' ');
}
