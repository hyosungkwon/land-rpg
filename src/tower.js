// land-rpg / src/tower.js
// v4.2 🗼 도전의 탑 — 층마다 다른 기믹으로 스펙·장비 조합을 시험하는 영구 진행 콘텐츠.
//   · 10층 고정. 층마다 테마·기믹·목표(처치 수/보스)·제한 시간이 다르다.
//   · 몬스터 체력은 '내 DPS × 목표 처치 시간', 공격력은 '내 최대 체력 × 비율'로 잡는다
//     → 스테이지가 올라가도 난이도가 흐려지지 않고, 빌드(방어·흡혈·범위·순간딜)가 그대로 시험된다.
//   · 최초 클리어에만 골드·강화석·초월석·장비를 지급하고, 재도전은 소액 보상만 준다.
//   · 패배/시간 초과 시에도 잃는 것은 없고 원래 사냥 스테이지로 안전하게 돌아간다(무한 재도전).
// DOM 의존 없음 → 헤드리스 검증 가능.
import { stageGoldBase, RARITIES, RARITY_INDEX, THEMES } from './data.js';
import { rebirthBonus } from './rebirth.js';
import { randomItemOfRarity } from './gear.js';

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

export const TOWER_MAX_FLOOR = TOWER_FLOORS.length;
export const TOWER_BY_N = TOWER_FLOORS.reduce((m, f) => { m[f.n] = f; return m; }, {});

/** 층 번호 → 정의(없으면 null) */
export function towerFloor(n) {
  const k = Math.floor(Number(n) || 0);
  return TOWER_BY_N[k] || null;
}

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
  return def.bossOnly ? `${def.boss} 격파 · ${sec}초` : `${def.goal}마리 처치 · ${sec}초`;
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
  return { cleared: [], best: 0, runs: 0, fails: 0, last: null };
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
  return {
    cleared,
    best: Math.max(0, Math.min(TOWER_MAX_FLOOR, Math.max(Math.floor(num(raw.best, 0)), bestCleared))),
    runs: Math.max(0, Math.floor(num(raw.runs, 0))),
    fails: Math.max(0, Math.floor(num(raw.fails, 0))),
    last,
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

/** 입장 가능 여부 — 1층은 항상, n층은 n-1층 클리어 + 최고 스테이지 조건이 필요하다 */
export function towerUnlocked(state, n) {
  const k = Math.floor(Number(n) || 0);
  if (k < 1 || k > TOWER_MAX_FLOOR) return false;
  const maxStage = Math.max(1, Math.floor(Number(state && state.maxStage) || 1));
  const need = Math.max(1, Math.floor(Number(TOWER_BY_N[k].minStage) || 1));
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
 * { max, clearedCount, cleared, best, next, nextDef, allCleared, pct }
 */
export function towerProgress(state) {
  const cleared = clearedFloors(state);
  const best = Math.max(0, Math.min(TOWER_MAX_FLOOR, Math.max(Math.floor(Number(state && state.tower && state.tower.best) || 0), cleared.length ? cleared[cleared.length - 1] : 0)));
  let next = 1;
  for (let i = 1; i <= TOWER_MAX_FLOOR; i++) if (!cleared.includes(i)) { next = i; break; }
  const allCleared = cleared.length >= TOWER_MAX_FLOOR;
  return {
    max: TOWER_MAX_FLOOR,
    clearedCount: cleared.length,
    cleared,
    best,
    next: allCleared ? 0 : next,
    nextDef: allCleared ? null : towerFloor(next),
    allCleared,
    pct: cleared.length / TOWER_MAX_FLOOR,
  };
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
