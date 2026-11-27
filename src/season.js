// land-rpg / src/season.js
// v8.5.0 📈 S70+ 일일 영지 배당(초월석·훈장·보석) · 🏆 월간 시즌 도전(8종) & 영구 명예 트로피 진열장.
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
import { portfolioOf } from './land.js';
import { regionSetStatus } from './region.js';
import { GEMS, defaultGems } from './gems.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);

/** KST 날짜 키 (YYYY-MM-DD) — 비공개 내부 헬퍼(전역 충돌 방지) */
function seasonDayKey(now = Date.now()) {
  const d = new Date(now + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** KST 월간 시즌 키 (YYYY-MM) */
export function seasonMonthKey(now = Date.now()) {
  const d = new Date(now + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/* ────────────────── 📈 일일 영지 배당 등급 (S70+ 부동산 가치 유지) ────────────────── */
export const DIVIDEND_TIERS = [
  { tier: 1, name: '초보 영주', icon: '🏡', minVal: 50000,     minCities: 3,   shards: 15,  points: 1,  medals: 0, gemLv: 0 },
  { tier: 2, name: '지역 자산가', icon: '🏘️', minVal: 300000,   minCities: 10,  shards: 35,  points: 2,  medals: 0, gemLv: 0 },
  { tier: 3, name: '광역 영주', icon: '🏙️', minVal: 1500000,   minCities: 25,  shards: 70,  points: 4,  medals: 1, gemLv: 0 },
  { tier: 4, name: '전국 대지주', icon: '🏛️', minVal: 8000000,  minCities: 50,  shards: 140, points: 7,  medals: 1, gemLv: 1 },
  { tier: 5, name: '영지 재벌', icon: '👑', minVal: 30000000,  minCities: 90,  shards: 260, points: 12, medals: 2, gemLv: 2 },
  { tier: 6, name: '제국 총독', icon: '🌟', minVal: 100000000, minCities: 140, shards: 450, points: 20, medals: 3, gemLv: 2 },
];

/* ────────────────── 🏆 월간 시즌 도전 (8종) ────────────────── */
export const SEASON_CHALLENGES = [
  { id: 's_stage',   icon: '🏔️', name: '스테이지 돌파', desc: '최고 스테이지 S30 도달',   goal: 30, points: 5,  shards: 60,  medals: 0, val: (s) => Math.max(s.peakStage || 1, s.maxStage || 1) },
  { id: 's_stage70', icon: '🔥', name: '무한 원정대',   desc: '최고 스테이지 S70 도달',   goal: 70, points: 12, shards: 120, medals: 1, val: (s) => Math.max(s.peakStage || 1, s.maxStage || 1) },
  { id: 's_tower',   icon: '🗼', name: '도전의 탑 정복', desc: '도전의 탑 15층 클리어',    goal: 15, points: 6,  shards: 80,  medals: 0, val: (s) => Math.floor(num(s.tower && s.tower.best, 0)) },
  { id: 's_rift',    icon: '🌀', name: '무한 균열 돌파', desc: '무한 균열 6웨이브 돌파',   goal: 6,  points: 8,  shards: 80,  medals: 1, val: (s) => Math.floor(num(s.rift && s.rift.bestWave, 0)) },
  { id: 's_raid',    icon: '🐉', name: '거대 레이드 토벌', desc: '거대 레이드 1회 이상 토벌', goal: 1,  points: 10, shards: 100, medals: 1, val: (s) => Math.floor(num(s.guild && s.guild.raid && s.guild.raid.clears, 0)) },
  { id: 's_land',    icon: '🏙️', name: '전국 영지 확장', desc: '부동산 15개 지역 보유',    goal: 15, points: 6,  shards: 80,  medals: 0, val: (s) => Object.values((s.land && s.land.owned) || {}).filter((n) => n > 0).length },
  { id: 's_set',     icon: '🗺️', name: '권역 세트 지배', desc: '권역 세트 2곳 이상 완성',  goal: 2,  points: 10, shards: 100, medals: 1, val: (s) => regionSetStatus(s.land && s.land.owned).filter((x) => x.complete).length },
  { id: 's_rebirth', icon: '♾️', name: '초월의 경지',    desc: '환생 누적 2회 달성',      goal: 2,  points: 8,  shards: 100, medals: 0, val: (s) => Math.floor(num(s.rebirth && s.rebirth.count, 0)) },
];

export function defaultSeason(now = Date.now()) {
  return {
    month: seasonMonthKey(now),
    claimed: [],
    divDate: '',
    divCount: 0,
    trophies: [], // 영구 보관 명예 트로피 ({ month, grade, icon, name })
  };
}

export function normalizeSeason(raw, now = Date.now()) {
  const d = defaultSeason(now);
  if (!raw || typeof raw !== 'object') return d;
  d.divDate = typeof raw.divDate === 'string' ? raw.divDate.slice(0, 10) : '';
  d.divCount = Math.max(0, Math.floor(num(raw.divCount, 0)));
  if (raw.month === d.month && Array.isArray(raw.claimed)) {
    const valid = new Set(SEASON_CHALLENGES.map((c) => c.id));
    d.claimed = [...new Set(raw.claimed.filter((id) => typeof id === 'string' && valid.has(id)))];
  }
  if (Array.isArray(raw.trophies)) {
    const seen = new Set();
    d.trophies = [];
    for (const t of raw.trophies) {
      if (!t || typeof t !== 'object' || typeof t.month !== 'string' || typeof t.grade !== 'string') continue;
      const k = `${t.month}:${t.grade}`;
      if (seen.has(k)) continue;
      seen.add(k);
      d.trophies.push({
        month: t.month.slice(0, 7),
        grade: t.grade === 'grand' ? 'grand' : 'silver',
        icon: t.grade === 'grand' ? '👑' : '🥈',
        name: t.grade === 'grand' ? '그랜드 마스터' : '시즌 실버',
      });
      if (d.trophies.length >= 24) break;
    }
  }
  return d;
}

/** 현재 영지 배당 등급·수령 가능 여부 조회 */
export function estateDividendInfo(state, now = Date.now()) {
  const pf = portfolioOf(state, now);
  const val = Math.max(0, Math.floor(num(pf.landValue, 0)));
  const cities = Math.max(0, Math.floor(num(pf.cities, 0)));
  let cur = null;
  let next = DIVIDEND_TIERS[0];
  for (let i = 0; i < DIVIDEND_TIERS.length; i++) {
    const t = DIVIDEND_TIERS[i];
    if (val >= t.minVal || cities >= t.minCities) {
      cur = t;
      next = DIVIDEND_TIERS[i + 1] || null;
    } else {
      next = t;
      break;
    }
  }
  const today = seasonDayKey(now);
  const sec = state && state.season ? state.season : defaultSeason(now);
  const claimedToday = sec.divDate === today;
  const canClaim = !!(cur && !claimedToday);
  return { cur, next, landValue: val, cities, today, claimedToday, canClaim, count: sec.divCount || 0 };
}

/** 일일 영지 배당 수령 (초월석·강화석·훈장·보석 지급) */
export function claimEstateDividend(state, now = Date.now(), rng = Math.random) {
  if (!state) return { ok: false, reason: '상태 없음' };
  if (!state.season) state.season = defaultSeason(now);
  const info = estateDividendInfo(state, now);
  if (!info.cur) return { ok: false, reason: '영지 3곳 이상 또는 자산 5만 이상부터 해금됩니다' };
  if (info.claimedToday) return { ok: false, reason: '오늘 영지 배당을 이미 받았습니다' };
  const t = info.cur;
  state.shards = Math.max(0, (state.shards || 0) + t.shards);
  if (t.points > 0 && state.rebirth) {
    state.rebirth.points = (state.rebirth.points || 0) + t.points;
    state.rebirth.totalPoints = (state.rebirth.totalPoints || 0) + t.points;
  }
  if (t.medals > 0 && state.invasion) {
    state.invasion.medals = (state.invasion.medals || 0) + t.medals;
  }
  let gem = null;
  if (t.gemLv > 0) {
    if (!state.gems || !state.gems.bag) state.gems = defaultGems();
    const pick = GEMS[Math.floor(rng() * GEMS.length) % GEMS.length] || GEMS[0];
    if (!Array.isArray(state.gems.bag[pick.id])) state.gems.bag[pick.id] = [0, 0, 0, 0, 0];
    const idx = Math.max(0, Math.min(4, t.gemLv - 1));
    state.gems.bag[pick.id][idx] = (state.gems.bag[pick.id][idx] || 0) + 1;
    gem = { id: pick.id, name: pick.name, icon: pick.icon, lv: t.gemLv };
  }
  state.season.divDate = info.today;
  state.season.divCount = (state.season.divCount || 0) + 1;
  return { ok: true, tier: t, shards: t.shards, points: t.points, medals: t.medals, gem };
}

/** 월간 시즌 도전 진행도 & 영구 명예 트로피 현황 */
export function seasonChallengeStatus(state, now = Date.now()) {
  const month = seasonMonthKey(now);
  const sec = state && state.season && state.season.month === month
    ? state.season
    : normalizeSeason(state && state.season, now);
  const claimedSet = new Set(sec.claimed || []);
  const items = SEASON_CHALLENGES.map((c) => {
    const cur = Math.max(0, Math.floor(num(c.val(state), 0)));
    const done = cur >= c.goal;
    const claimed = claimedSet.has(c.id);
    const claimable = done && !claimed;
    return { ...c, cur, done, claimed, claimable, pct: Math.min(1, cur / Math.max(1, c.goal)) };
  });
  const readyCount = items.filter((x) => x.claimable).length;
  const doneCount = items.filter((x) => x.done).length;
  const claimedCount = items.filter((x) => x.claimed).length;
  const trophies = Array.isArray(sec.trophies) ? sec.trophies : [];
  return { month, items, readyCount, doneCount, claimedCount, total: items.length, trophies };
}

/** 달성한 월간 시즌 도전 보상 일괄 수령 + 4개/8개 달성 시 영구 트로피 진열 */
export function claimSeasonChallenges(state, now = Date.now()) {
  if (!state) return { ok: false, count: 0 };
  const month = seasonMonthKey(now);
  if (!state.season || state.season.month !== month) state.season = normalizeSeason(state.season, now);
  const st = seasonChallengeStatus(state, now);
  let count = 0;
  let shards = 0;
  let points = 0;
  let medals = 0;
  for (const it of st.items) {
    if (!it.claimable) continue;
    state.season.claimed.push(it.id);
    count += 1;
    shards += it.shards || 0;
    points += it.points || 0;
    medals += it.medals || 0;
  }
  if (count === 0) return { ok: false, count: 0 };
  state.shards = (state.shards || 0) + shards;
  if (points > 0 && state.rebirth) {
    state.rebirth.points = (state.rebirth.points || 0) + points;
    state.rebirth.totalPoints = (state.rebirth.totalPoints || 0) + points;
  }
  if (medals > 0 && state.invasion) {
    state.invasion.medals = (state.invasion.medals || 0) + medals;
  }
  // 트로피 자동 수여 (4개 실버 · 8개 그랜드 마스터)
  const totalClaimed = state.season.claimed.length;
  const ensureTrophy = (grade, icon, name) => {
    if (!state.season.trophies.some((t) => t.month === month && t.grade === grade)) {
      state.season.trophies.push({ month, grade, icon, name });
    }
  };
  if (totalClaimed >= 4) ensureTrophy('silver', '🥈', '시즌 실버');
  if (totalClaimed >= SEASON_CHALLENGES.length) ensureTrophy('grand', '👑', '그랜드 마스터');
  return { ok: true, count, shards, points, medals, trophies: state.season.trophies.length };
}
