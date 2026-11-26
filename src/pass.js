// land-rpg / src/pass.js
// v6.4.0 🎖️ 영지 성장 패스(무료 30단계 · KST 월간 시즌) · 🏷️ 칭호(타이틀 20종).
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
import { stageGoldBase } from './data.js';
import { acquireGear, randomItemOfRarity } from './gear.js';
import { CITIES, portfolioOf, landmarkSummary } from './land.js';
import { birthState } from './rebirth.js';
import { citadelEffects } from './citadel.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const PASS_MAX_LV = 30;
export const PASS_XP_PER_LV = 100;

/** KST 기준 월간 시즌 키 (예: '2026-11') */
export function passSeasonKey(now = Date.now()) {
  const d = new Date(now + 9 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function defaultPass(now = Date.now()) {
  return {
    season: passSeasonKey(now),
    xp: 0,
    claimed: [],
    totalClaimed: 0,
  };
}

export function normalizePass(raw, now = Date.now()) {
  const season = passSeasonKey(now);
  const d = defaultPass(now);
  if (!raw || typeof raw !== 'object') return d;
  d.totalClaimed = Math.max(0, Math.floor(num(raw.totalClaimed, 0)));
  if (raw.season === season) {
    d.xp = Math.max(0, Math.floor(num(raw.xp, 0)));
    if (Array.isArray(raw.claimed)) {
      d.claimed = [...new Set(raw.claimed.map((n) => Math.floor(num(n, 0))).filter((n) => n >= 1 && n <= PASS_MAX_LV))].sort((a, b) => a - b);
    }
  }
  return d;
}

/** 패스 경험치 추가 (월이 바뀌었으면 자동 새 시즌 시작) */
export function addPassXp(state, amount, now = Date.now()) {
  const add = Math.max(0, Math.floor(num(amount, 0)));
  if (!state || add <= 0) return 0;
  const season = passSeasonKey(now);
  if (!state.pass || state.pass.season !== season) state.pass = normalizePass(state.pass, now);
  state.pass.xp = Math.min(PASS_MAX_LV * PASS_XP_PER_LV, (state.pass.xp || 0) + add);
  return state.pass.xp;
}

/** 단계별 무료 보상 정의 */
export function passRewardFor(state, lv) {
  const n = clamp(Math.floor(num(lv, 1)), 1, PASS_MAX_LV);
  const refStage = Math.max(1, Math.floor(num(state && (state.peakStage || state.maxStage || state.stage), 1)));
  const gold = Math.max(200, Math.round(stageGoldBase(refStage) * (20 + n * 5)));
  const shards = 12 + n * 4;
  const milestone = n % 5 === 0;
  const points = milestone ? 3 + Math.floor(n / 5) * 2 : 0;
  const medals = milestone ? 1 : 0;
  const legend = n === 15 || n === 30;
  return { lv: n, gold, shards, points, medals, legend, milestone };
}

/** UI용 패스 현황 */
export function passInfo(state, now = Date.now()) {
  const p = normalizePass(state && state.pass, now);
  const lv = clamp(Math.floor(p.xp / PASS_XP_PER_LV), 0, PASS_MAX_LV);
  const curXp = lv >= PASS_MAX_LV ? PASS_XP_PER_LV : p.xp % PASS_XP_PER_LV;
  const claimedSet = new Set(p.claimed);
  const tiers = [];
  let readyCount = 0;
  for (let i = 1; i <= PASS_MAX_LV; i++) {
    const rw = passRewardFor(state, i);
    const claimed = claimedSet.has(i);
    const claimable = i <= lv && !claimed;
    if (claimable) readyCount += 1;
    tiers.push({ ...rw, reached: i <= lv, claimed, claimable });
  }
  return {
    season: p.season,
    xp: p.xp,
    lv,
    maxLv: PASS_MAX_LV,
    curXp,
    needXp: PASS_XP_PER_LV,
    pct: clamp(curXp / PASS_XP_PER_LV, 0, 1),
    readyCount,
    claimedCount: p.claimed.length,
    totalClaimed: p.totalClaimed,
    tiers,
  };
}

/** 패스 1단계 보상 수령 */
export function claimPassTier(state, lv, now = Date.now(), rng = Math.random) {
  if (!state) return { ok: false, reason: '잘못된 상태입니다.' };
  const season = passSeasonKey(now);
  if (!state.pass || state.pass.season !== season) state.pass = normalizePass(state.pass, now);
  const n = clamp(Math.floor(num(lv, 0)), 1, PASS_MAX_LV);
  const curLv = clamp(Math.floor((state.pass.xp || 0) / PASS_XP_PER_LV), 0, PASS_MAX_LV);
  if (n > curLv) return { ok: false, reason: `패스 Lv.${n} 달성 후 수령할 수 있습니다.` };
  if (state.pass.claimed.includes(n)) return { ok: false, reason: '이미 수령한 단계입니다.' };

  const rw = passRewardFor(state, n);
  state.gold = Math.max(0, Math.floor(num(state.gold, 0))) + rw.gold;
  state.shards = Math.max(0, Math.floor(num(state.shards, 0))) + rw.shards;
  if (rw.points > 0) {
    const rb = birthState(state);
    rb.points = (rb.points || 0) + rw.points;
    rb.totalPoints = (rb.totalPoints || 0) + rw.points;
  }
  if (rw.medals > 0) {
    if (!state.invasion || typeof state.invasion !== 'object') state.invasion = { wins: 0, medals: 0, lastBlock: -1, booms: {}, last: null };
    state.invasion.medals = Math.max(0, Math.floor(num(state.invasion.medals, 0))) + rw.medals;
  }
  let item = null;
  let acq = null;
  if (rw.legend) {
    const picked = randomItemOfRarity('legend', rng);
    if (picked) {
      acq = acquireGear(state, picked.id, { autoEquip: true, now, source: 'pass', rollAffix: true, rng });
      item = picked;
    }
  }
  state.pass.claimed.push(n);
  state.pass.claimed.sort((a, b) => a - b);
  state.pass.totalClaimed = (state.pass.totalClaimed || 0) + 1;
  return { ok: true, ...rw, item, acq };
}

/** 수령 가능한 패스 보상 일괄 수령 */
export function claimAllPassTiers(state, now = Date.now(), rng = Math.random) {
  const info = passInfo(state, now);
  const targets = info.tiers.filter((t) => t.claimable).map((t) => t.lv);
  if (!targets.length) return { ok: false, reason: '수령할 패스 보상이 없습니다.' };
  let gold = 0;
  let shards = 0;
  let points = 0;
  let medals = 0;
  const items = [];
  for (const lv of targets) {
    const r = claimPassTier(state, lv, now, rng);
    if (r.ok) {
      gold += r.gold;
      shards += r.shards;
      points += r.points;
      medals += r.medals;
      if (r.item) items.push(r.item);
    }
  }
  return { ok: true, count: targets.length, gold, shards, points, medals, items };
}

/* ────────────────────────────── 🏷️ 칭호(타이틀) 20종 ────────────────────────────── */
const GANGNAM_KEY = (() => {
  const c = CITIES.find((x) => x.name === '강남구');
  return c ? c.key : '';
})();

export const TITLES = [
  { id: 'novice',       icon: '🗡️', name: '영지의 첫 발',   cond: '기본 해금',               bonus: {},                      check: () => true },
  { id: 'hunter100',    icon: '⚔️', name: '백전 사냥꾼',    cond: '누적 처치 100마리',       bonus: { atkPct: 1 },           check: (s) => (s.totalKills || 0) >= 100 },
  { id: 'hunter5k',     icon: '💀', name: '천하무적',       cond: '누적 처치 5,000마리',     bonus: { atkPct: 2 },           check: (s) => (s.totalKills || 0) >= 5000 },
  { id: 'stage20',      icon: '🏔️', name: '초월의 문턱',    cond: '최고 스테이지 S20',       bonus: { atkPct: 1.5 },         check: (s) => Math.max(s.peakStage || 1, s.maxStage || 1) >= 20 },
  { id: 'stage50',      icon: '♾️', name: '무한 돌파자',    cond: '최고 스테이지 S50',       bonus: { atkPct: 3 },           check: (s) => Math.max(s.peakStage || 1, s.maxStage || 1) >= 50 },
  { id: 'stage100',     icon: '👑', name: '전설의 정복자',  cond: '최고 스테이지 S100',      bonus: { atkPct: 5 },           check: (s) => Math.max(s.peakStage || 1, s.maxStage || 1) >= 100 },
  { id: 'godjob',       icon: '🐉', name: '불멸의 용신',    cond: '상위 전직 6단계 용신',    bonus: { atkPct: 3, hpPct: 3 }, check: (s) => Math.max(s.jobTier || 0, (s.records && s.records.peakJobTier) || 0) >= 5 },
  { id: 'rebirth1',     icon: '✨', name: '초월자',         cond: '환생 1회 달성',           bonus: { goldPct: 2 },          check: (s) => ((s.rebirth && s.rebirth.count) || 0) >= 1 },
  { id: 'rebirth5',     icon: '🌟', name: '윤회의 지배자',  cond: '환생 5회 달성',           bonus: { atkPct: 2, goldPct: 3 }, check: (s) => ((s.rebirth && s.rebirth.count) || 0) >= 5 },
  { id: 'land1',        icon: '🏠', name: '첫 건물주',      cond: '부동산 1곳 매수',         bonus: { goldPct: 1 },          check: (s) => Object.keys((s.land && s.land.owned) || {}).length >= 1 },
  { id: 'land25',       icon: '🏢', name: '전국 순회왕',    cond: '부동산 25곳 보유',        bonus: { goldPct: 2.5 },        check: (s) => Object.keys((s.land && s.land.owned) || {}).length >= 25 },
  { id: 'gangnam',      icon: '💎', name: '강남 건물주',    cond: '강남구 1평 이상 보유',    bonus: { goldPct: 3 },          check: (s) => !!(GANGNAM_KEY && ((s.land && s.land.owned && s.land.owned[GANGNAM_KEY]) || 0) >= 1) },
  { id: 'landmark5',    icon: '🏛️', name: '도시 설계자',    cond: '랜드마크 5개 건설',       bonus: { atkPct: 2, goldPct: 2 }, check: (s) => landmarkSummary(s).count >= 5 },
  { id: 'tower10',      icon: '🗼', name: '탑의 도전자',    cond: '도전의 탑 10층 클리어',   bonus: { critPct: 1 },          check: (s) => ((s.tower && s.tower.best) || 0) >= 10 },
  { id: 'tower50',      icon: '🌩️', name: '심층 정복자',    cond: '도전의 탑 50층 클리어',   bonus: { atkPct: 3, critPct: 1.5 }, check: (s) => ((s.tower && s.tower.best) || 0) >= 50 },
  { id: 'defender',     icon: '🛡️', name: '영지 수호자',    cond: '영지 침공 방어 1승',      bonus: { hpPct: 2.5 },          check: (s) => ((s.invasion && s.invasion.wins) || 0) >= 1 },
  { id: 'expeditioner', icon: '🧭', name: '대탐험가',       cond: '영지 파견 5회 완료',      bonus: { dropPct: 3 },          check: (s) => ((s.expedition && s.expedition.completed) || 0) >= 5 },
  { id: 'citadel15',    icon: '🏰', name: '성채의 군주',    cond: '영지 성채 총 Lv.15',      bonus: { atkPct: 2, hpPct: 2 }, check: (s) => citadelEffects(s).totalLv >= 15 },
  { id: 'relic6',       icon: '🏺', name: '고대 수집가',    cond: '고대 유물 6종 수집',      bonus: { atkPct: 2, dropPct: 2 }, check: (s) => Object.keys((s.relics && s.relics.owned) || {}).length >= 6 },
  { id: 'asset10m',     icon: '💰', name: '억만장자',       cond: '총자산 1,000만 골드',     bonus: { goldPct: 4 },          check: (s) => Math.max((s.land && s.land.bestAsset) || 0, portfolioOf(s).totalAsset) >= 10_000_000 },
];

export const TITLE_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));

export function defaultTitles() {
  return { equipped: null };
}

export function normalizeTitles(raw) {
  const id = raw && typeof raw === 'object' && typeof raw.equipped === 'string' && TITLE_BY_ID[raw.equipped] ? raw.equipped : null;
  return { equipped: id };
}

export function titleBonusText(t) {
  const b = (t && t.bonus) || {};
  const parts = [];
  if (b.atkPct) parts.push(`공격 +${b.atkPct}%`);
  if (b.hpPct) parts.push(`체력 +${b.hpPct}%`);
  if (b.goldPct) parts.push(`골드 +${b.goldPct}%`);
  if (b.critPct) parts.push(`치명 +${b.critPct}%`);
  if (b.dropPct) parts.push(`드랍 +${b.dropPct}%`);
  return parts.length ? parts.join(' · ') : '장식 칭호';
}

export function titleStatus(state) {
  const eq = state && state.titles ? state.titles.equipped : null;
  const list = TITLES.map((t) => ({
    ...t,
    unlocked: !!t.check(state || {}),
    equipped: eq === t.id,
    bonusText: titleBonusText(t),
  }));
  const unlockedCount = list.filter((x) => x.unlocked).length;
  const active = list.find((x) => x.equipped && x.unlocked) || null;
  return { list, unlockedCount, total: TITLES.length, active };
}

export function equipTitle(state, id) {
  if (!state) return { ok: false, reason: '잘못된 상태입니다.' };
  if (!state.titles || typeof state.titles !== 'object') state.titles = defaultTitles();
  if (!id || id === 'none' || state.titles.equipped === id) {
    state.titles.equipped = null;
    return { ok: true, title: null, cleared: true };
  }
  const def = TITLE_BY_ID[id];
  if (!def) return { ok: false, reason: '알 수 없는 칭호입니다.' };
  if (!def.check(state)) return { ok: false, reason: `해금 조건 미달: ${def.cond}` };
  state.titles.equipped = id;
  return { ok: true, title: def, cleared: false };
}

/** 현재 장착 칭호의 스탯 보너스 (미장착 시 모두 0) */
export function titleBonus(state) {
  const id = state && state.titles && state.titles.equipped;
  const def = id && TITLE_BY_ID[id];
  if (!def || !def.check(state)) return { atkPct: 0, hpPct: 0, goldPct: 0, critPct: 0, dropPct: 0, title: null };
  const b = def.bonus || {};
  return {
    atkPct: b.atkPct || 0,
    hpPct: b.hpPct || 0,
    goldPct: b.goldPct || 0,
    critPct: b.critPct || 0,
    dropPct: b.dropPct || 0,
    title: def,
  };
}
