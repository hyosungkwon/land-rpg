// land-rpg / src/quests.js
// v3.3 수집 메타: 🎯 단계별 미션(목표 의식) · 🏆 업적(누적 보상) · 📖 도감(수집 재미).
// DOM/Canvas 의존 없음 → 헤드리스 검증 가능.
//   - 미션: 게임 흐름(사냥 → 장비 → 뽑기 → 부동산 → 보스 → 던전 → 전직)을 따라가는 순차 라인.
//           현재 미션 하나만 진행되고, 완료하면 보상(💰 골드 / 💎 강화석)을 직접 수령한다.
//   - 업적: 누적 조건(첫 매수·지역 수·전직·장비 등급·총 처치 …)을 달성하면 💎 또는 소폭 영구 스탯 보너스.
//   - 도감: 몬스터/보스 · 부동산 지역 · 장비 등급 · 펫. 수집률 마일스톤이 calcStats 에 소폭 영구 보너스로 반영된다.
import { MONSTERS, RARITIES, RARITY_IDS, RARITY_INDEX, EQUIP_SLOTS } from './data.js';
import { CITIES, CITY_BY_KEY } from './land.js';
import { PETS } from './meta.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const nowMs = () => Date.now();

/* ══════════════════════════ 🎯 단계별 미션 ══════════════════════════
 * type 은 questValue() 가 상태에서 읽는 측정 항목이다.
 *  - kills·bossKills·stage(maxStage·peakStage)·level·gacha·dungeon·job·equipLv : 누적/최고 기록(되돌아가지 않음)
 *  - cities·pyeong : 현재 보유 부동산
 * 보상은 💰 골드 / 💎 강화석. 한 줄로 이어지며, 수령하면 다음 미션이 열린다.
 */
export const QUESTS = [
  { id: 'm01', chapter: '첫걸음', title: '첫 사냥', desc: '몬스터 10마리 처치', type: 'kills', goal: 10, gold: 300, shards: 0 },
  { id: 'm02', chapter: '첫걸음', title: '초원 돌파', desc: '스테이지 3 도달', type: 'stage', goal: 3, gold: 500, shards: 0 },
  { id: 'm03', chapter: '장비와 땅', title: '장비 손질', desc: '장비 강화 1회', type: 'equipLv', goal: 1, gold: 0, shards: 5 },
  { id: 'm04', chapter: '장비와 땅', title: '첫 뽑기', desc: '장비 뽑기 1회', type: 'gacha', goal: 1, gold: 600, shards: 0 },
  { id: 'm05', chapter: '장비와 땅', title: '첫 매물', desc: '부동산 1곳 매수', type: 'cities', goal: 1, gold: 800, shards: 0 },
  { id: 'm06', chapter: '성장', title: '사냥꾼', desc: '몬스터 100마리 처치', type: 'kills', goal: 100, gold: 0, shards: 8 },
  { id: 'm07', chapter: '성장', title: '스테이지 8', desc: '스테이지 8 도달', type: 'stage', goal: 8, gold: 2000, shards: 0 },
  { id: 'm08', chapter: '성장', title: '보스 사냥', desc: '보스 5회 처치', type: 'bossKills', goal: 5, gold: 0, shards: 10 },
  { id: 'm09', chapter: '확장', title: '단련', desc: '장비 총 강화 10', type: 'equipLv', goal: 10, gold: 3000, shards: 0 },
  { id: 'm10', chapter: '확장', title: '세 곳의 건물주', desc: '부동산 3곳 보유', type: 'cities', goal: 3, gold: 0, shards: 12 },
  { id: 'm11', chapter: '확장', title: '황금 던전', desc: '황금 던전 1회 참여', type: 'dungeon', goal: 1, gold: 5000, shards: 0 },
  { id: 'm12', chapter: '도전', title: '스테이지 15', desc: '스테이지 15 도달', type: 'stage', goal: 15, gold: 0, shards: 15 },
  { id: 'm13', chapter: '도전', title: '100평', desc: '보유 100평 달성', type: 'pyeong', goal: 100, gold: 10000, shards: 0 },
  { id: 'm14', chapter: '도전', title: '전직', desc: '전직 1회 (왕국 기사)', type: 'job', goal: 1, gold: 0, shards: 20 },
  { id: 'm15', chapter: '도전', title: '스테이지 24', desc: '스테이지 24 도달', type: 'stage', goal: 24, gold: 30000, shards: 30 },
];

export const QUEST_IDS = QUESTS.map((q) => q.id);
const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q, i) => [q.id, { ...q, idx: i }]));

/* ══════════════════════════ 🏆 업적 ══════════════════════════
 * 누적 조건. 보상은 💎 강화석 또는 소폭 영구 스탯 보너스(atkPct/goldPct).
 * 영구 보너스는 수령(claimed)한 뒤 collectionBonus() 로 calcStats 에 반영된다.
 */
export const ACHIEVEMENTS = [
  { id: 'a_land1', icon: '🏠', title: '첫 부동산', desc: '부동산 1곳 매수', type: 'cities', goal: 1, shards: 5 },
  { id: 'a_land3', icon: '🏘️', title: '동네 건물주', desc: '부동산 3곳 보유', type: 'cities', goal: 3, shards: 8 },
  { id: 'a_land10', icon: '🏙️', title: '지역 재벌', desc: '부동산 10곳 보유', type: 'cities', goal: 10, shards: 15, goldPct: 2 },
  { id: 'a_pyeong100', icon: '📐', title: '100평', desc: '보유 100평 달성', type: 'pyeong', goal: 100, shards: 10 },
  { id: 'a_pyeong1000', icon: '🗺️', title: '1,000평', desc: '보유 1,000평 달성', type: 'pyeong', goal: 1000, shards: 20, atkPct: 1 },
  { id: 'a_job1', icon: '⚔️', title: '왕국 기사', desc: '전직 1단계 달성', type: 'job', goal: 1, shards: 10 },
  { id: 'a_job3', icon: '🐲', title: '드래곤 나이트', desc: '최종 전직 달성', type: 'job', goal: 3, shards: 30, atkPct: 2 },
  { id: 'a_rare', icon: '💎', title: '레어 장비', desc: '레어 이상 등급 획득', type: 'rarity', goal: 2, shards: 8 },
  { id: 'a_legend', icon: '🔥', title: '전설 장비', desc: '전설 등급 획득', type: 'rarity', goal: 4, shards: 25, atkPct: 1 },
  { id: 'a_gear20', icon: '🛡️', title: '단련', desc: '장비 총 강화 20', type: 'equipLv', goal: 20, shards: 10 },
  { id: 'a_gear100', icon: '⚒️', title: '명장', desc: '장비 총 강화 100', type: 'equipLv', goal: 100, shards: 30, goldPct: 2 },
  { id: 'a_kill100', icon: '🗡️', title: '백인 참', desc: '누적 100마리 처치', type: 'kills', goal: 100, shards: 6 },
  { id: 'a_kill1000', icon: '💥', title: '천인 참', desc: '누적 1,000마리 처치', type: 'kills', goal: 1000, shards: 15 },
  { id: 'a_boss10', icon: '👑', title: '보스 헌터', desc: '보스 10회 처치', type: 'bossKills', goal: 10, shards: 12 },
  { id: 'a_stage10', icon: '🏅', title: '스테이지 10', desc: '스테이지 10 도달', type: 'stage', goal: 10, shards: 8 },
  { id: 'a_stage25', icon: '🌟', title: '스테이지 25', desc: '스테이지 25 도달', type: 'stage', goal: 25, shards: 25, goldPct: 2 },
  { id: 'a_dungeon5', icon: '🔥', title: '던전 단골', desc: '황금 던전 5회 참여', type: 'dungeon', goal: 5, shards: 15 },
  { id: 'a_gacha50', icon: '🎁', title: '수집가', desc: '장비 뽑기 50회', type: 'gacha', goal: 50, shards: 15 },
  { id: 'a_codex50', icon: '📖', title: '도감 절반', desc: '도감 수집률 50%', type: 'codex', goal: 50, shards: 30, atkPct: 1 },
];

export const ACH_IDS = ACHIEVEMENTS.map((a) => a.id);
const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/* ══════════════════════════ 📖 도감 ══════════════════════════
 * 카테고리 가중치의 합이 100 → 수집률(%)은 카테고리별 비중의 합이다.
 *  몬스터를 다 모으면 30%, 지역을 다 모으면 40%, 장비 등급 20%, 펫 10%.
 */
export const CODEX_WEIGHTS = { monsters: 30, cities: 40, gear: 20, pets: 10 };

/** 수집률 마일스톤 — 가장 높은 단계의 보너스만 적용된다(작게 유지). */
export const CODEX_MILESTONES = [
  { pct: 10, atkPct: 1, goldPct: 0, label: '공격력 +1%' },
  { pct: 25, atkPct: 1, goldPct: 2, label: '공격력 +1% · 골드 +2%' },
  { pct: 50, atkPct: 2, goldPct: 3, label: '공격력 +2% · 골드 +3%' },
  { pct: 75, atkPct: 3, goldPct: 4, label: '공격력 +3% · 골드 +4%' },
  { pct: 100, atkPct: 5, goldPct: 5, label: '공격력 +5% · 골드 +5%' },
];

/** 몬스터 도감 전체 목록(일반 12 → 보스 7). */
export const MONSTER_IDS = Object.keys(MONSTERS);

/* ───────────── 도감 상태 보장 · 기록 ───────────── */

function ensureMonsters(state) {
  if (!state.codex || typeof state.codex !== 'object') state.codex = {};
  const c = state.codex;
  if (!c.monsters || typeof c.monsters !== 'object') c.monsters = {};
  if (!c.cities || typeof c.cities !== 'object') c.cities = {};
  if (!c.gear || typeof c.gear !== 'object') c.gear = {};
  return c;
}

const entry = (v) => (v && typeof v === 'object' ? v : null);

/** 몬스터를 마주쳤을 때(스폰) 기록 — 해금은 '만남'만으로도 된다. */
export function codexMeet(state, name) {
  if (!state || !MONSTERS[name]) return false;
  const c = ensureMonsters(state);
  const cur = entry(c.monsters[name]) || { m: 0, k: 0 };
  if (cur.m) return false;
  c.monsters[name] = { m: 1, k: Math.max(0, Math.floor(num(cur.k))) };
  return true;
}

/** 몬스터 처치 기록(도감 처치 수). */
export function codexKill(state, name, n = 1) {
  if (!state || !MONSTERS[name]) return 0;
  const c = ensureMonsters(state);
  const cur = entry(c.monsters[name]) || { m: 0, k: 0 };
  const add = Math.max(0, Math.floor(num(n, 1)) || 1);
  c.monsters[name] = { m: 1, k: Math.max(0, Math.floor(num(cur.k))) + add };
  return c.monsters[name].k;
}

/** 부동산 지역 도감 — 매수 시 기록. 매도해도 기록은 남는다(최대 보유 평수 갱신). */
export function codexCity(state, key, pyeong = 0, now = nowMs()) {
  if (!state || !CITY_BY_KEY[key]) return false;
  const c = ensureMonsters(state);
  const cur = entry(c.cities[key]) || { p: 0, t: now };
  const p = Math.max(0, Math.floor(num(pyeong)), Math.floor(num(cur.p)));
  const fresh = !entry(c.cities[key]);
  c.cities[key] = { p, t: Math.max(0, num(cur.t, now)) };
  return fresh;
}

/** 장비 등급 도감 — 뽑기/장착으로 획득한 등급을 기록. */
export function codexGear(state, rarityId, n = 1) {
  if (!state || !RARITY_IDS.includes(rarityId)) return 0;
  const c = ensureMonsters(state);
  const add = Math.max(1, Math.floor(num(n, 1)) || 1);
  c.gear[rarityId] = Math.max(0, Math.floor(num(c.gear[rarityId]))) + add;
  return c.gear[rarityId];
}

/* ───────────── 도감 집계 ───────────── */

/** 도감 수집 현황 + 마일스톤 보너스 */
export function codexStats(state) {
  const s = state && typeof state === 'object' ? state : {};
  const codex = s.codex && typeof s.codex === 'object' ? s.codex : {};
  const mons = codex.monsters && typeof codex.monsters === 'object' ? codex.monsters : {};
  const cityRec = codex.cities && typeof codex.cities === 'object' ? codex.cities : {};
  const gearRec = codex.gear && typeof codex.gear === 'object' ? codex.gear : {};

  let monsterSeen = 0;
  let monsterKills = 0;
  for (const name of MONSTER_IDS) {
    const e = entry(mons[name]);
    if (!e) continue;
    const k = Math.max(0, Math.floor(num(e.k)));
    monsterKills += k;
    if (e.m || k > 0) monsterSeen += 1;
  }

  // 지역: 기록(매수 이력) + 현재 보유를 합친다 → 매도해도 도감은 유지된다.
  const cityKeys = new Set(Object.keys(cityRec).filter((k) => !!CITY_BY_KEY[k]));
  const owned = s.land && s.land.owned && typeof s.land.owned === 'object' ? s.land.owned : {};
  for (const [k, v] of Object.entries(owned)) {
    if (CITY_BY_KEY[k] && num(v) > 0) cityKeys.add(k);
  }

  // 장비: 기록 + 현재 장착 등급
  const gearKeys = new Set(RARITY_IDS.filter((id) => num(gearRec[id]) > 0));
  const gr = s.gearRarity && typeof s.gearRarity === 'object' ? s.gearRarity : {};
  for (const slot of EQUIP_SLOTS) if (RARITY_IDS.includes(gr[slot])) gearKeys.add(gr[slot]);

  // 펫: 해금 목록이 곧 도감
  const pets = Array.isArray(s.pet && s.pet.unlocked) ? s.pet.unlocked.filter((id) => PETS.some((p) => p.id === id)) : [];

  const ratio = (a, b) => (b > 0 ? a / b : 0);
  const raw =
    CODEX_WEIGHTS.monsters * ratio(monsterSeen, MONSTER_IDS.length) +
    CODEX_WEIGHTS.cities * ratio(cityKeys.size, CITIES.length) +
    CODEX_WEIGHTS.gear * ratio(gearKeys.size, RARITY_IDS.length) +
    CODEX_WEIGHTS.pets * ratio(pets.length, PETS.length);
  const pct = clamp(Math.round(raw), 0, 100);

  let milestone = null;
  for (const m of CODEX_MILESTONES) if (pct >= m.pct) milestone = m;

  const total = MONSTER_IDS.length + CITIES.length + RARITY_IDS.length + PETS.length;
  return {
    monsters: { seen: monsterSeen, total: MONSTER_IDS.length, kills: monsterKills },
    cities: { seen: cityKeys.size, total: CITIES.length },
    gear: { seen: gearKeys.size, total: RARITY_IDS.length },
    pets: { seen: pets.length, total: PETS.length },
    seen: monsterSeen + cityKeys.size + gearKeys.size + pets.length,
    total,
    pct,
    milestone,
    next: CODEX_MILESTONES.find((m) => m.pct > pct) || null,
    bonus: milestone ? { atkPct: milestone.atkPct, goldPct: milestone.goldPct } : { atkPct: 0, goldPct: 0 },
  };
}

/** 도감 마일스톤 보너스(calcStats 용) */
export function codexBonus(state) {
  return codexStats(state).bonus;
}

/**
 * 수집 영구 보너스 = 도감 마일스톤 + 수령한 업적의 스탯 보너스.
 * calcStats 가 공격력·골드 배율에 더한다(기본 상태에서는 0 → 기존 밸런스 불변).
 */
export function collectionBonus(state) {
  const codex = codexBonus(state);
  let atkPct = codex.atkPct || 0;
  let goldPct = codex.goldPct || 0;
  const claimed = state && state.achievements && Array.isArray(state.achievements.claimed) ? state.achievements.claimed : [];
  for (const id of claimed) {
    const a = ACH_BY_ID[id];
    if (!a) continue;
    atkPct += num(a.atkPct);
    goldPct += num(a.goldPct);
  }
  return { atkPct, goldPct };
}

/* ══════════════════════════ 측정 · 진행도 ══════════════════════════ */

/** 현재 장비 강화 레벨 합(등급 보정 제외) */
export function equipLevelSum(state) {
  const e = (state && state.equip) || {};
  let sum = 0;
  for (const slot of EQUIP_SLOTS) sum += Math.max(0, Math.floor(num(e[slot])));
  return sum;
}

/** 보유 장비 최고 등급 인덱스(0 일반 ~ 4 전설) */
export function bestRarityIndex(state) {
  const s = state || {};
  let best = RARITY_INDEX[(s.gacha && s.gacha.best) || 'common'] || 0;
  const gr = s.gearRarity || {};
  for (const slot of EQUIP_SLOTS) best = Math.max(best, RARITY_INDEX[gr[slot]] || 0);
  return best;
}

/** 보유 지역 수·총 평수(portfolioOf 와 같은 기준, 가격 계산 없이) */
export function landCounts(state) {
  const owned = state && state.land && state.land.owned && typeof state.land.owned === 'object' ? state.land.owned : {};
  let cities = 0;
  let pyeong = 0;
  for (const v of Object.values(owned)) {
    const q = Math.floor(num(v));
    if (q > 0) {
      cities += 1;
      pyeong += q;
    }
  }
  return { cities, pyeong };
}

/** 미션/업적 공통 측정값 */
export function questValue(state, type) {
  const s = state && typeof state === 'object' ? state : {};
  switch (type) {
    case 'kills': return Math.max(0, Math.floor(num(s.totalKills)));
    case 'bossKills': return Math.max(0, Math.floor(num(s.bossKills)));
    case 'stage': return Math.max(1, Math.floor(num(s.maxStage, 1)), Math.floor(num(s.peakStage, 1)));
    case 'level': return Math.max(1, Math.floor(num(s.level, 1)));
    case 'gacha': return Math.max(0, Math.floor(num(s.gacha && s.gacha.total)));
    case 'dungeon': return Math.max(0, Math.floor(num(s.dungeon && s.dungeon.runs)));
    case 'job': return Math.max(0, Math.floor(num(s.jobTier)));
    case 'equipLv': return equipLevelSum(s);
    case 'rarity': return bestRarityIndex(s);
    case 'cities': return landCounts(s).cities;
    case 'pyeong': return landCounts(s).pyeong;
    case 'codex': return codexStats(s).pct;
    default: return 0;
  }
}

/** 업적 측정값(미션과 같은 표를 쓰되 이름만 분리) */
export function achValue(state, type) {
  return questValue(state, type);
}

/** 미션 상태(구조 보장) */
export function questStateOf(state) {
  if (!state || typeof state !== 'object') return { idx: 0, claimed: [], done: 0 };
  if (!state.quests || typeof state.quests !== 'object') state.quests = { idx: 0, claimed: [], done: 0 };
  const q = state.quests;
  if (!Array.isArray(q.claimed)) q.claimed = [];
  q.claimed = q.claimed.filter((id, i, arr) => QUEST_IDS.includes(id) && arr.indexOf(id) === i);
  let idx = clamp(Math.floor(num(q.idx)), 0, QUESTS.length);
  while (idx < QUESTS.length && q.claimed.includes(QUESTS[idx].id)) idx += 1;
  q.idx = idx;
  q.done = q.claimed.length;
  return q;
}

/** 현재 진행 중인 미션(모두 완료면 null) */
export function currentQuest(state) {
  const q = questStateOf(state);
  return QUESTS[q.idx] || null;
}

/** 미션 하나의 진행도: { q, cur, goal, done, pct } */
export function questProgress(state, id) {
  const q = id ? QUEST_BY_ID[id] : currentQuest(state);
  if (!q) return { q: null, cur: 0, goal: 0, done: false, pct: 0 };
  const goal = Math.max(1, num(q.goal));
  const cur = Math.max(0, questValue(state, q.type));
  return { q, cur, goal, done: cur >= goal, pct: clamp(cur / goal, 0, 1) };
}

/**
 * 현재 미션 보상 수령 → 다음 미션 열기.
 * @returns {{ok:boolean, reason?:string, quest?:object, gold?:number, shards?:number, next?:object|null}}
 */
export function claimQuest(state, id, now = nowMs()) {
  const st = questStateOf(state);
  const cur = QUESTS[st.idx];
  if (!cur) return { ok: false, reason: '모든 미션을 완료했습니다.' };
  if (id && id !== cur.id) return { ok: false, reason: '지금 진행 중인 미션이 아닙니다.' };
  const pr = questProgress(state, cur.id);
  if (!pr.done) return { ok: false, reason: '아직 목표를 달성하지 못했습니다.' };
  const gold = Math.max(0, Math.floor(num(cur.gold)));
  const shards = Math.max(0, Math.floor(num(cur.shards)));
  state.gold = Math.floor(num(state.gold) + gold);
  state.shards = Math.floor(num(state.shards) + shards);
  st.claimed = st.claimed.concat([cur.id]);
  st.done = st.claimed.length;
  st.idx = Math.min(QUESTS.length, st.idx + 1);
  state.quests = { ...st, at: Math.max(0, num(now)) };
  ensureMonsters(state); // 상태 구조 유지
  return { ok: true, quest: cur, gold, shards, next: QUESTS[st.idx] || null };
}

/* ══════════════════════════ 업적 수령 ══════════════════════════ */

export function achievementStateOf(state) {
  if (!state || typeof state !== 'object') return { claimed: [] };
  if (!state.achievements || typeof state.achievements !== 'object') state.achievements = { claimed: [] };
  const a = state.achievements;
  if (!Array.isArray(a.claimed)) a.claimed = [];
  a.claimed = a.claimed.filter((id, i, arr) => ACH_IDS.includes(id) && arr.indexOf(id) === i);
  return a;
}

/** 업적 전체 현황(UI/모달용) */
export function achievementStatus(state) {
  const a = achievementStateOf(state);
  return ACHIEVEMENTS.map((def) => {
    const goal = Math.max(1, num(def.goal));
    const cur = Math.max(0, achValue(state, def.type));
    const claimed = a.claimed.includes(def.id);
    return {
      ...def,
      cur,
      goal,
      pct: clamp(cur / goal, 0, 1),
      done: cur >= goal,
      claimed,
      claimable: !claimed && cur >= goal,
      bonusText: [def.atkPct ? `공격 +${def.atkPct}%` : '', def.goldPct ? `골드 +${def.goldPct}%` : '']
        .filter(Boolean)
        .join(' · '),
    };
  });
}

export function claimedAchievementCount(state) {
  return achievementStateOf(state).claimed.length;
}

/** 업적 보상 수령(강화석 + 영구 보너스는 claimed 기록으로 적용) */
export function claimAchievement(state, id) {
  const def = ACH_BY_ID[id];
  if (!def) return { ok: false, reason: '알 수 없는 업적입니다.' };
  const a = achievementStateOf(state);
  if (a.claimed.includes(def.id)) return { ok: false, reason: '이미 수령한 업적입니다.' };
  const cur = Math.max(0, achValue(state, def.type));
  if (cur < num(def.goal, 1)) return { ok: false, reason: '아직 달성하지 못한 업적입니다.' };
  const shards = Math.max(0, Math.floor(num(def.shards)));
  state.shards = Math.floor(num(state.shards) + shards);
  a.claimed = a.claimed.concat([def.id]);
  return { ok: true, achievement: def, shards };
}

/* ══════════════════════════ 저장 정규화 ══════════════════════════ */

/** 손상/구버전 저장 방어 — 미션 진행 상태 */
export function normalizeQuestState(raw) {
  const d = { idx: 0, claimed: [], done: 0, at: 0 };
  if (!raw || typeof raw !== 'object') return d;
  const claimed = Array.isArray(raw.claimed)
    ? raw.claimed.filter((id, i, arr) => QUEST_IDS.includes(id) && arr.indexOf(id) === i)
    : [];
  let idx = clamp(Math.floor(num(raw.idx)), 0, QUESTS.length);
  while (idx < QUESTS.length && claimed.includes(QUESTS[idx].id)) idx += 1;
  return { idx, claimed, done: claimed.length, at: Math.max(0, num(raw.at)) };
}

/** 손상/구버전 저장 방어 — 업적 수령 목록 */
export function normalizeAchievements(raw) {
  if (!raw || typeof raw !== 'object') return { claimed: [] };
  const claimed = Array.isArray(raw.claimed)
    ? raw.claimed.filter((id, i, arr) => ACH_IDS.includes(id) && arr.indexOf(id) === i)
    : [];
  return { claimed };
}

/** 손상/구버전 저장 방어 — 도감. 현재 보유/장착 상태를 함께 반영한다. */
export function normalizeCodex(raw, state, now = nowMs()) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const monsters = {};
  const rawM = src.monsters && typeof src.monsters === 'object' ? src.monsters : {};
  for (const name of MONSTER_IDS) {
    const e = entry(rawM[name]);
    if (!e) continue;
    const m = e.m ? 1 : 0;
    const k = Math.max(0, Math.floor(num(e.k)));
    if (!m && k <= 0) continue;
    monsters[name] = { m: m || (k > 0 ? 1 : 0), k };
  }
  const cities = {};
  const rawC = src.cities && typeof src.cities === 'object' ? src.cities : {};
  for (const [key, e0] of Object.entries(rawC)) {
    if (!CITY_BY_KEY[key]) continue;
    const e = entry(e0) || {};
    const p = Math.max(0, Math.floor(num(e.p)));
    cities[key] = { p, t: Math.max(0, num(e.t)) };
  }
  // 현재 보유 중인 지역도 도감에 반영(최대 보유 평수만 갱신)
  const owned = state && state.land && state.land.owned && typeof state.land.owned === 'object' ? state.land.owned : {};
  for (const [key, v] of Object.entries(owned)) {
    if (!CITY_BY_KEY[key]) continue;
    const pyeong = Math.max(0, Math.floor(num(v)));
    if (pyeong <= 0) continue;
    const cur = cities[key] || { p: 0, t: now };
    cities[key] = { p: Math.max(cur.p, pyeong), t: cur.t || now };
  }
  const gear = {};
  const rawG = src.gear && typeof src.gear === 'object' ? src.gear : {};
  for (const id of RARITY_IDS) {
    const n = Math.max(0, Math.floor(num(rawG[id])));
    if (n > 0) gear[id] = n;
  }
  // 현재 장착 등급도 획득 기록으로 인정
  const gr = state && state.gearRarity && typeof state.gearRarity === 'object' ? state.gearRarity : {};
  for (const slot of EQUIP_SLOTS) {
    const id = gr[slot];
    if (RARITY_IDS.includes(id) && !gear[id]) gear[id] = 1;
  }
  return { monsters, cities, gear };
}

/** UI용 도감 상세 목록 */
export function codexDetail(state) {
  const s = state && typeof state === 'object' ? state : {};
  const codex = s.codex && typeof s.codex === 'object' ? s.codex : {};
  const mons = codex.monsters && typeof codex.monsters === 'object' ? codex.monsters : {};
  const cityRec = codex.cities && typeof codex.cities === 'object' ? codex.cities : {};
  const gearRec = codex.gear && typeof codex.gear === 'object' ? codex.gear : {};
  const owned = s.land && s.land.owned && typeof s.land.owned === 'object' ? s.land.owned : {};
  const gr = s.gearRarity && typeof s.gearRarity === 'object' ? s.gearRarity : {};
  const pets = Array.isArray(s.pet && s.pet.unlocked) ? s.pet.unlocked : [];

  const monsters = MONSTER_IDS.map((name) => {
    const e = entry(mons[name]) || {};
    const kills = Math.max(0, Math.floor(num(e.k)));
    return {
      name,
      ko: (MONSTERS[name] && MONSTERS[name].ko) || name,
      boss: !!(MONSTERS[name] && MONSTERS[name].boss),
      met: !!(e.m || kills > 0),
      kills,
    };
  });

  const cityMap = new Map();
  for (const [key, e0] of Object.entries(cityRec)) {
    const city = CITY_BY_KEY[key];
    if (!city) continue;
    cityMap.set(key, { key, name: city.name, region: city.region, emoji: city.emoji, tierLabel: city.tierLabel, pyeong: Math.max(0, Math.floor(num((entry(e0) || {}).p))) });
  }
  for (const [key, v] of Object.entries(owned)) {
    const city = CITY_BY_KEY[key];
    if (!city || !(num(v) > 0)) continue;
    const prev = cityMap.get(key);
    cityMap.set(key, {
      key,
      name: city.name,
      region: city.region,
      emoji: city.emoji,
      tierLabel: city.tierLabel,
      pyeong: Math.max(prev ? prev.pyeong : 0, Math.floor(num(v))),
    });
  }
  const cities = [...cityMap.values()].sort((a, b) => b.pyeong - a.pyeong || a.name.localeCompare(b.name, 'ko'));

  const gear = RARITY_IDS.map((id) => {
    const r = RARITIES[RARITY_INDEX[id]];
    const slots = EQUIP_SLOTS.filter((slot) => gr[slot] === id);
    return {
      id,
      name: r.name,
      color: r.color,
      count: Math.max(0, Math.floor(num(gearRec[id]))),
      slots,
      got: Math.max(0, Math.floor(num(gearRec[id]))) > 0 || slots.length > 0,
    };
  });

  const petList = PETS.map((p) => ({
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    sprite: p.sprite,
    cond: p.cond,
    desc: p.desc,
    unlocked: pets.includes(p.id),
  }));

  return { monsters, cities, gear, pets: petList };
}
