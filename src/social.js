// land-rpg / src/social.js
// v8.18.0 🌐 멀티플레이 소셜 엔진 — 전 서버 월드 레이드 · 229시군구 명예 영주 · 주간 호재 투표 · 동맹 & 객원 용병 · 비동기 영주 결투장(아레나).
// DOM/네트워크 의존 없음 → 헤드리스/오프라인 게스트 완전 호환.
import { stageGoldBase } from './data.js';
import { CITY_BY_KEY } from './land.js';
import { REGION_SETS, SETS_BY_ID, RCITY_KEY_BY_NAME } from './region.js';
import { birthState } from './rebirth.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
const int = (v, d = 0) => Math.max(0, Math.floor(num(v, d)));
const KST_MS = 9 * 3600 * 1000;

export function socialDayKey(now = Date.now()) {
  const d = new Date(Math.floor(num(now, Date.now())) + KST_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function socialWeekKey(now = Date.now()) {
  const t = Math.floor(num(now, Date.now())) + KST_MS;
  const d = new Date(t);
  const dow = (d.getUTCDay() + 6) % 7;
  const mon = new Date(t - dow * 86400000);
  return `${mon.getUTCFullYear()}-W-${String(mon.getUTCMonth() + 1).padStart(2, '0')}${String(mon.getUTCDate()).padStart(2, '0')}`;
}

export function sanitizeAllyCode(raw) {
  const s = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return s.length >= 2 ? s : '';
}

export const ARENA_DAILY_MAX = 5;
export const ARENA_DURATION_MS = 25000;

export const WORLD_RAID_MILESTONES = [
  { dmg: 1_000_000,   label: '100만',  goldMul: 50,  shards: 40,  points: 2,  medals: 0 },
  { dmg: 10_000_000,  label: '1,000만', goldMul: 90,  shards: 90,  points: 5,  medals: 1 },
  { dmg: 50_000_000,  label: '5,000만', goldMul: 140, shards: 160, points: 9,  medals: 1 },
  { dmg: 200_000_000, label: '2억 돌파', goldMul: 220, shards: 260, points: 15, medals: 2 },
];

const npcCities = (pairs) => {
  const out = {};
  for (const [name, qty] of pairs) {
    const k = RCITY_KEY_BY_NAME[name];
    if (k && CITY_BY_KEY[k]) out[k] = qty;
  }
  return out;
};

/** 오프라인/게스트에서도 함께 즐기는 기본 NPC 영주 라이벌 5인 (온라인 유저 기록이 있으면 자동 병합·우선) */
export const NPC_RIVALS = [
  { uid: 'npc_gangnam', name: '강남대군',   level: 24, stage: 22, totalAsset: 680000,   allyCode: 'KOREA', raidDmg: 420000,   topCities: npcCities([['강남구', 120], ['서초구', 80]]),     snap: { dps: 680,   hpMax: 4200,   atk: 260,   rating: 1020 }, isNpc: true },
  { uid: 'npc_busan',   name: '해운대검성', level: 38, stage: 34, totalAsset: 2400000,  allyCode: 'KOREA', raidDmg: 1250000,  topCities: npcCities([['해운대구', 240], ['수영구', 140]]),  snap: { dps: 2200,  hpMax: 11500,  atk: 780,   rating: 1120 }, isNpc: true },
  { uid: 'npc_jeju',    name: '탐라재벌',   level: 54, stage: 48, totalAsset: 9500000,  allyCode: 'JEJU',  raidDmg: 3800000,  topCities: npcCities([['제주시', 380], ['서귀포시', 260]]),  snap: { dps: 6500,  hpMax: 28000,  atk: 2100,  rating: 1260 }, isNpc: true },
  { uid: 'npc_pangyo',  name: '판교마도사', level: 72, stage: 64, totalAsset: 28000000, allyCode: 'TECH',  raidDmg: 9400000,  topCities: npcCities([['성남시', 520], ['수원시', 310]]),    snap: { dps: 16500, hpMax: 62000,  atk: 5400,  rating: 1420 }, isNpc: true },
  { uid: 'npc_dragon',  name: '한반도용신', level: 92, stage: 82, totalAsset: 88000000, allyCode: 'CROWN', raidDmg: 24000000, topCities: npcCities([['송파구', 780], ['연수구', 540]]),    snap: { dps: 42000, hpMax: 140000, atk: 13500, rating: 1620 }, isNpc: true },
];

export function defaultSocial(now = Date.now()) {
  return {
    allyCode: '',
    voteWeek: socialWeekKey(now),
    voteRegion: '',
    worldWeek: socialWeekKey(now),
    worldClaimed: [],
    mercUid: '',
    mercName: '',
    mercAtkPct: 0,
    arenaDay: socialDayKey(now),
    arenaUsed: 0,
    arenaWins: 0,
    arenaRating: 1000,
  };
}

export function normalizeSocial(raw, now = Date.now()) {
  const d = defaultSocial(now);
  if (!raw || typeof raw !== 'object') return d;
  d.allyCode = sanitizeAllyCode(raw.allyCode);
  const wk = socialWeekKey(now);
  const dy = socialDayKey(now);
  if (raw.voteWeek === wk && typeof raw.voteRegion === 'string' && SETS_BY_ID[raw.voteRegion]) {
    d.voteRegion = raw.voteRegion;
  }
  if (raw.worldWeek === wk && Array.isArray(raw.worldClaimed)) {
    d.worldClaimed = [...new Set(raw.worldClaimed.map((v) => Math.floor(num(v, -1))).filter((v) => v >= 0 && v < WORLD_RAID_MILESTONES.length))].sort((a, b) => a - b);
  }
  d.mercUid = typeof raw.mercUid === 'string' ? raw.mercUid.slice(0, 64) : '';
  d.mercName = typeof raw.mercName === 'string' ? raw.mercName.slice(0, 20) : '';
  d.mercAtkPct = Math.max(0, Math.min(10, Math.round(num(raw.mercAtkPct, 0) * 10) / 10));
  d.arenaUsed = raw.arenaDay === dy ? Math.max(0, Math.min(ARENA_DAILY_MAX, int(raw.arenaUsed))) : 0;
  d.arenaWins = int(raw.arenaWins);
  d.arenaRating = Math.max(800, Math.min(9999, Math.floor(num(raw.arenaRating, 1000))));
  return d;
}

/** 클라우드 공개 랭킹 노드(rpg_rankings/{uid})에 함께 올라가는 컴팩트 소셜 페이로드 */
export function buildSocialPayload(state, stats = null, now = Date.now()) {
  const s = state && typeof state === 'object' ? state : {};
  const soc = normalizeSocial(s.social, now);
  const wk = socialWeekKey(now);
  const gRaid = s.guild && s.guild.raid;
  const raidDmg = gRaid && gRaid.week === wk ? int(gRaid.damage) : 0;

  // 보유 평수 상위 6개 지역만 공개(노드 용량 절약)
  const owned = (s.land && s.land.owned) || {};
  const topCities = {};
  Object.entries(owned)
    .filter(([k, q]) => CITY_BY_KEY[k] && int(q) > 0)
    .sort((a, b) => int(b[1]) - int(a[1]))
    .slice(0, 6)
    .forEach(([k, q]) => { topCities[k] = int(q); });

  const snap = {
    atk: int(stats && stats.atk, 30),
    hpMax: int(stats && stats.hpMax, 300),
    dps: int(stats && stats.dps, 50),
    jobTier: int(s.jobTier),
    rating: soc.arenaRating,
  };
  return {
    raidWeek: wk,
    raidDmg,
    topCities,
    allyCode: soc.allyCode,
    voteWeek: soc.voteWeek,
    voteRegion: soc.voteRegion,
    snap,
  };
}

/** 온라인 랭킹 행 + NPC + 내 로컬 상태를 하나의 소셜 풀로 정규화 */
function mergedPool(rows, state, now) {
  const wk = socialWeekKey(now);
  const myUid = (state && state.cloud && state.cloud.uid) || '__me__';
  const map = new Map();
  for (const npc of NPC_RIVALS) {
    map.set(npc.uid, { ...npc, raidWeek: wk, voteWeek: wk, voteRegion: npc.uid === 'npc_busan' ? 'gyeongsang' : npc.uid === 'npc_jeju' ? 'jeju' : 'seoul' });
  }
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (!r || !r.uid) continue;
      map.set(r.uid, r);
    }
  }
  if (state) {
    const pay = buildSocialPayload(state, null, now);
    const myName = (state.cloud && state.cloud.nick) || '나(영주)';
    const prev = map.get(myUid) || {};
    map.set(myUid, {
      ...prev,
      uid: myUid,
      name: prev.name || myName,
      level: int(state.level, 1),
      stage: Math.max(int(state.peakStage, 1), int(state.maxStage, 1)),
      totalAsset: int(prev.totalAsset, int(state.gold)),
      ...pay,
      isMe: true,
    });
  }
  return { pool: [...map.values()], myUid };
}

/* ────────────────── 1) 🐉 전 서버 공동 월드 레이드 ────────────────── */
export function computeWorldRaid(rows, state, now = Date.now()) {
  const wk = socialWeekKey(now);
  const soc = normalizeSocial(state && state.social, now);
  const { pool } = mergedPool(rows, state, now);
  const contrib = [];
  let totalDmg = 0;
  for (const r of pool) {
    if (r.raidWeek && r.raidWeek !== wk) continue;
    const d = int(r.raidDmg);
    if (d <= 0) continue;
    totalDmg += d;
    contrib.push({ uid: r.uid, name: r.name || '용사', dmg: d, isMe: !!r.isMe, isNpc: !!r.isNpc });
  }
  contrib.sort((a, b) => b.dmg - a.dmg);
  const maxGoal = WORLD_RAID_MILESTONES[WORLD_RAID_MILESTONES.length - 1].dmg;
  const pct = Math.min(100, Math.round((totalDmg / maxGoal) * 1000) / 10);
  const milestones = WORLD_RAID_MILESTONES.map((m, idx) => {
    const unlocked = totalDmg >= m.dmg;
    const claimed = soc.worldClaimed.includes(idx);
    return { ...m, idx, unlocked, claimed, claimable: unlocked && !claimed };
  });
  return {
    week: wk,
    totalDmg,
    maxGoal,
    pct,
    contributors: contrib.length,
    top: contrib.slice(0, 5),
    milestones,
    readyCount: milestones.filter((m) => m.claimable).length,
  };
}

export function claimWorldRaidMilestone(state, idx, rows = [], now = Date.now()) {
  if (!state) return { ok: false, reason: '상태 없음' };
  state.social = normalizeSocial(state.social, now);
  const wr = computeWorldRaid(rows, state, now);
  const ms = wr.milestones[idx];
  if (!ms) return { ok: false, reason: '알 수 없는 단계입니다.' };
  if (!ms.unlocked) return { ok: false, reason: '아직 전 서버 목표 피해에 도달하지 않았습니다.' };
  if (ms.claimed) return { ok: false, reason: '이미 수령한 보상입니다.' };

  const refStage = Math.max(1, int(state.peakStage || state.maxStage || state.stage, 1));
  const gold = Math.max(1000, Math.round(stageGoldBase(refStage) * ms.goldMul));
  state.gold = int(state.gold) + gold;
  state.shards = int(state.shards) + ms.shards;
  if (state.records) state.records.totalGold = (state.records.totalGold || 0) + gold;
  if (ms.points > 0) {
    const rb = birthState(state);
    rb.points = int(rb.points) + ms.points;
    rb.totalPoints = int(rb.totalPoints) + ms.points;
  }
  if (ms.medals > 0 && state.invasion) {
    state.invasion.medals = int(state.invasion.medals) + ms.medals;
  }
  state.social.worldClaimed.push(idx);
  return { ok: true, milestone: ms, gold, shards: ms.shards, points: ms.points, medals: ms.medals };
}

/* ────────────────── 2) 👑 전국 229시군구 명예 영주 & 주간 호재 투표 ────────────────── */
export function computeCityLords(rows, state, now = Date.now()) {
  const { pool, myUid } = mergedPool(rows, state, now);
  const byCity = Object.create(null);
  for (const r of pool) {
    const tc = r.topCities && typeof r.topCities === 'object' ? r.topCities : null;
    if (!tc) continue;
    for (const [key, qRaw] of Object.entries(tc)) {
      const qty = int(qRaw);
      if (qty <= 0 || !CITY_BY_KEY[key]) continue;
      const cur = byCity[key];
      if (!cur || qty > cur.qty) {
        byCity[key] = {
          cityKey: key,
          cityName: CITY_BY_KEY[key].name,
          uid: r.uid,
          name: r.name || '용사',
          qty,
          isMe: r.uid === myUid || !!r.isMe,
          isNpc: !!r.isNpc,
        };
      }
    }
  }
  const all = Object.values(byCity).sort((a, b) => b.qty - a.qty);
  const myCrowns = all.filter((x) => x.isMe).length;
  return { byCity, list: all, myCrowns };
}

export function computeRegionVotes(rows, state, now = Date.now()) {
  const wk = socialWeekKey(now);
  const soc = normalizeSocial(state && state.social, now);
  const { pool } = mergedPool(rows, state, now);
  const counts = {};
  for (const r of REGION_SETS) counts[r.id] = 0;
  let total = 0;
  for (const p of pool) {
    if (p.voteWeek && p.voteWeek !== wk) continue;
    if (p.voteRegion && counts[p.voteRegion] !== undefined) {
      counts[p.voteRegion] += 1;
      total += 1;
    }
  }
  const sorted = REGION_SETS.map((r) => ({ ...r, votes: counts[r.id] || 0 })).sort((a, b) => b.votes - a.votes);
  return { week: wk, list: sorted, winner: sorted[0] || null, total, myVote: soc.voteRegion };
}

export function voteRegionBoom(state, setId, now = Date.now()) {
  if (!state || !SETS_BY_ID[setId]) return { ok: false, reason: '알 수 없는 권역입니다.' };
  state.social = normalizeSocial(state.social, now);
  state.social.voteWeek = socialWeekKey(now);
  state.social.voteRegion = setId;
  return { ok: true, set: SETS_BY_ID[setId] };
}

/* ────────────────── 3) 🛡️ 소규모 동맹 & 객원 용병 ────────────────── */
export function setAllianceCode(state, rawCode, now = Date.now()) {
  if (!state) return { ok: false, reason: '상태 없음' };
  state.social = normalizeSocial(state.social, now);
  const code = sanitizeAllyCode(rawCode);
  if (!code && String(rawCode || '').trim() !== '') {
    return { ok: false, reason: '동맹 코드는 영문/숫자 2~8자로 입력해 주세요.' };
  }
  state.social.allyCode = code;
  return { ok: true, code };
}

export function computeAlliance(rows, state, now = Date.now()) {
  const soc = normalizeSocial(state && state.social, now);
  const code = soc.allyCode;
  if (!code) return { joined: false, code: '', members: [], count: 0, atkPct: 0, goldPct: 0 };
  const { pool } = mergedPool(rows, state, now);
  const members = pool
    .filter((r) => sanitizeAllyCode(r.allyCode) === code)
    .sort((a, b) => (b.stage || 0) - (a.stage || 0));
  const effN = Math.min(5, Math.max(1, members.length));
  return {
    joined: true,
    code,
    members,
    count: members.length,
    atkPct: effN * 2,
    goldPct: effN * 2,
  };
}

export function availableMercenaries(rows, state, now = Date.now()) {
  const soc = normalizeSocial(state && state.social, now);
  const { pool, myUid } = mergedPool(rows, state, now);
  return pool
    .filter((r) => r.uid !== myUid && !r.isMe)
    .map((r) => {
      const sameAlly = !!(soc.allyCode && sanitizeAllyCode(r.allyCode) === soc.allyCode);
      const atkPct = sameAlly ? 6 : 4;
      return {
        uid: r.uid,
        name: r.name || '객원 용사',
        level: int(r.level, 1),
        stage: int(r.stage, 1),
        sameAlly,
        atkPct,
        isNpc: !!r.isNpc,
      };
    })
    .sort((a, b) => (b.sameAlly ? 1 : 0) - (a.sameAlly ? 1 : 0) || b.stage - a.stage)
    .slice(0, 6);
}

export function hireMercenary(state, merc, now = Date.now()) {
  if (!state || !merc || !merc.uid) return { ok: false, reason: '용병 정보가 없습니다.' };
  state.social = normalizeSocial(state.social, now);
  if (state.social.mercUid === merc.uid) {
    state.social.mercUid = '';
    state.social.mercName = '';
    state.social.mercAtkPct = 0;
    return { ok: true, dismissed: true };
  }
  state.social.mercUid = String(merc.uid).slice(0, 64);
  state.social.mercName = String(merc.name || '객원 용사').slice(0, 20);
  state.social.mercAtkPct = Math.max(2, Math.min(8, Number(merc.atkPct) || 4));
  return { ok: true, dismissed: false, name: state.social.mercName, atkPct: state.social.mercAtkPct };
}

/** 소셜 영구 패시브 (동맹 보너스 + 고용한 객원 용병 보너스 · 미가입/미고용 시 0 → 기본 밸런스 불변) */
export function socialCombatBonus(state) {
  const soc = state && state.social;
  if (!soc || typeof soc !== 'object') return { atkPct: 0, goldPct: 0 };
  const allyBonus = soc.allyCode ? 4 : 0; // 동맹 소속 기본 보너스
  const mercAtk = soc.mercUid ? Math.max(0, Math.min(8, num(soc.mercAtkPct, 0))) : 0;
  return { atkPct: allyBonus + mercAtk, goldPct: allyBonus };
}

/* ────────────────── 4) ⚔️ 비동기 영주 결투장 (아레나) ────────────────── */
export function arenaStatus(state, rows = [], stats = null, now = Date.now()) {
  const soc = normalizeSocial(state && state.social, now);
  const { pool, myUid } = mergedPool(rows, state, now);
  const myDps = Math.max(40, int(stats && stats.dps, 100));
  const myHp = Math.max(300, int(stats && stats.hpMax, 600));
  const candidates = pool
    .filter((r) => r.uid !== myUid && !r.isMe)
    .map((r) => {
      const sn = r.snap && typeof r.snap === 'object' ? r.snap : {};
      const rating = Math.max(850, int(sn.rating, 980 + int(r.stage, 1) * 6));
      const dps = Math.max(30, int(sn.dps, Math.round(myDps * (0.75 + (int(r.stage, 1) % 5) * 0.14))));
      const hpMax = Math.max(250, int(sn.hpMax, Math.round(myHp * 1.6)));
      return {
        uid: r.uid,
        name: r.name || '도전자',
        level: int(r.level, 1),
        stage: int(r.stage, 1),
        rating,
        dps,
        hpMax,
        isNpc: !!r.isNpc,
      };
    });
  // 내 전투력에 가까운 상대 3인(쉬움·보통·강적)
  candidates.sort((a, b) => Math.abs(a.rating - soc.arenaRating) - Math.abs(b.rating - soc.arenaRating));
  const opponents = candidates.slice(0, 3).sort((a, b) => a.rating - b.rating);
  return {
    left: Math.max(0, ARENA_DAILY_MAX - soc.arenaUsed),
    max: ARENA_DAILY_MAX,
    used: soc.arenaUsed,
    wins: soc.arenaWins,
    rating: soc.arenaRating,
    opponents,
  };
}

export function consumeArenaTicket(state, now = Date.now()) {
  if (!state) return { ok: false, reason: '상태 없음' };
  state.social = normalizeSocial(state.social, now);
  if (state.social.arenaUsed >= ARENA_DAILY_MAX) {
    return { ok: false, reason: `오늘 결투장 도전 횟수(${ARENA_DAILY_MAX}회)를 모두 사용했습니다.` };
  }
  state.social.arenaUsed += 1;
  return { ok: true, left: ARENA_DAILY_MAX - state.social.arenaUsed };
}

export function settleArenaMatch(state, opp, won, now = Date.now()) {
  if (!state) return null;
  state.social = normalizeSocial(state.social, now);
  const refStage = Math.max(1, int(state.peakStage || state.maxStage || state.stage, 1));
  const gold = Math.max(400, Math.round(stageGoldBase(refStage) * (won ? 40 : 12)));
  const shards = won ? 28 : 8;
  const points = won ? 2 : 0;
  const ratingDelta = won ? 25 : -10;
  state.social.arenaRating = Math.max(800, state.social.arenaRating + ratingDelta);
  if (won) state.social.arenaWins += 1;
  state.gold = int(state.gold) + gold;
  state.shards = int(state.shards) + shards;
  if (state.records) state.records.totalGold = (state.records.totalGold || 0) + gold;
  if (points > 0) {
    const rb = birthState(state);
    rb.points = int(rb.points) + points;
    rb.totalPoints = int(rb.totalPoints) + points;
  }
  return {
    ok: true,
    won: !!won,
    opp,
    gold,
    shards,
    points,
    rating: state.social.arenaRating,
    ratingDelta,
    left: Math.max(0, ARENA_DAILY_MAX - state.social.arenaUsed),
  };
}
