// land-rpg / src/expedition.js
// v5.9.0 🧭 미장착 펫 영지 파견(탐험대) · 🗺️ 전국 권역 지도 데이터.
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
//   - 전투에 출전하지 않은 대기 펫(주·보조 제외)을 보유한 권역에 파견해
//     골드·강화석·초월석·장비를 탐색한다.
//   - 펫 레벨·진화 단계·해당 권역 보유 지역 수·랜드마크 레벨이 보상과 대성공 확률을 끌어올린다.
import { stageGoldBase } from './data.js';
import { acquireGear, randomItemOfRarity } from './gear.js';
import { REGION_SETS, SETS_BY_ID, RCITIES, citySetId, regionSetStatus, activeNews, newsCovers } from './region.js';
import { PETS, PET_IDS, petDef, petLevel, petEvo, petStageInfo } from './meta.js';
import { birthState } from './rebirth.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const EXPEDITION_MAX_SLOTS = 3;

/** 파견 기간 3단계 — 30분(정찰) / 2시간(탐사) / 6시간(원정) */
export const EXPEDITION_DURATIONS = [
  {
    key: 'short',
    label: '30분',
    title: '빠른 정찰',
    ms: 30 * 60 * 1000,
    goldMul: 35,
    shardsBase: 14,
    pointsBase: 0,
    gearChance: 0.08,
    greatBase: 0.15,
  },
  {
    key: 'mid',
    label: '2시간',
    title: '심층 탐사',
    ms: 2 * 60 * 60 * 1000,
    goldMul: 120,
    shardsBase: 46,
    pointsBase: 2,
    gearChance: 0.24,
    greatBase: 0.22,
  },
  {
    key: 'long',
    label: '6시간',
    title: '장기 원정',
    ms: 6 * 60 * 60 * 1000,
    goldMul: 300,
    shardsBase: 115,
    pointsBase: 5,
    gearChance: 0.55,
    greatBase: 0.30,
  },
];

export const EXPEDITION_DUR_BY_KEY = Object.fromEntries(EXPEDITION_DURATIONS.map((d) => [d.key, d]));

/** 권역별 파견 특화 보너스 */
export const EXPEDITION_REGION_BONUS = {
  seoul:       { label: '💰 골드 +35%',            goldMul: 1.35, shardMul: 1.0,  pointAdd: 0, gearAdd: 0,    greatAdd: 0 },
  gyeonggi:    { label: '💎 강화석 +30%',          goldMul: 1.0,  shardMul: 1.3,  pointAdd: 0, gearAdd: 0.05, greatAdd: 0 },
  gangwon:     { label: '🎒 장비 탐색 +18%p',      goldMul: 0.95, shardMul: 1.15, pointAdd: 0, gearAdd: 0.18, greatAdd: 0 },
  chungcheong: { label: '⚖️ 골드·강화석 +18%',     goldMul: 1.18, shardMul: 1.18, pointAdd: 0, gearAdd: 0,    greatAdd: 0 },
  jeolla:      { label: '✨ 초월석 +1 · 골드 +15%', goldMul: 1.15, shardMul: 1.0,  pointAdd: 1, gearAdd: 0,    greatAdd: 0 },
  gyeongsang:  { label: '💎 강화석 +20% · ✨ +1',  goldMul: 1.0,  shardMul: 1.2,  pointAdd: 1, gearAdd: 0,    greatAdd: 0 },
  jeju:        { label: '🌟 대성공 +12%p · ✨ +1', goldMul: 1.1,  shardMul: 1.1,  pointAdd: 1, gearAdd: 0.05, greatAdd: 0.12 },
};

/** 7개 권역별 전체 시군구 수 캐시 */
export const REGION_CITY_TOTALS = (() => {
  const out = {};
  for (const s of REGION_SETS) out[s.id] = 0;
  for (const c of RCITIES) {
    const id = citySetId(c.key);
    if (id && out[id] !== undefined) out[id] += 1;
  }
  return out;
})();

export function defaultExpeditions() {
  return {
    active: [], // [{ id, petId, setId, durKey, startedAt, endsAt }]
    completed: 0,
    greatCount: 0,
    totalGold: 0,
    totalShards: 0,
    totalPoints: 0,
    last: null,
  };
}

/** 저장 정규화 — 미해금/장착/중복 펫 및 손상된 슬롯 정리 */
export function normalizeExpeditions(raw, state, now = Date.now()) {
  const d = defaultExpeditions();
  if (!raw || typeof raw !== 'object') return d;
  const unlocked = (state && state.pet && Array.isArray(state.pet.unlocked)) ? state.pet.unlocked : [];
  const eq = state && state.pet ? state.pet.equipped : null;
  const sub = state && state.pet ? state.pet.sub : null;
  const seenPets = new Set();
  const active = [];
  if (Array.isArray(raw.active)) {
    for (const row of raw.active) {
      if (active.length >= EXPEDITION_MAX_SLOTS) break;
      if (!row || typeof row !== 'object') continue;
      const petId = typeof row.petId === 'string' && PET_IDS.includes(row.petId) ? row.petId : '';
      const setId = typeof row.setId === 'string' && SETS_BY_ID[row.setId] ? row.setId : '';
      const dur = EXPEDITION_DUR_BY_KEY[row.durKey];
      if (!petId || !setId || !dur) continue;
      if (!unlocked.includes(petId) || petId === eq || petId === sub || seenPets.has(petId)) continue;
      const startedAt = Math.max(0, Math.floor(num(row.startedAt, now)));
      const endsAt = Math.max(startedAt + 1000, Math.floor(num(row.endsAt, startedAt + dur.ms)));
      seenPets.add(petId);
      active.push({
        id: typeof row.id === 'string' && row.id ? row.id.slice(0, 32) : `${petId}_${startedAt}`,
        petId,
        setId,
        durKey: dur.key,
        startedAt,
        endsAt,
      });
    }
  }
  return {
    active,
    completed: Math.max(0, Math.floor(num(raw.completed, 0))),
    greatCount: Math.max(0, Math.floor(num(raw.greatCount, 0))),
    totalGold: Math.max(0, Math.floor(num(raw.totalGold, 0))),
    totalShards: Math.max(0, Math.floor(num(raw.totalShards, 0))),
    totalPoints: Math.max(0, Math.floor(num(raw.totalPoints, 0))),
    last: raw.last && typeof raw.last === 'object' ? raw.last : null,
  };
}

/** 해당 펫이 현재 파견 중인가 */
export function isPetDispatched(state, petId) {
  const list = state && state.expedition && Array.isArray(state.expedition.active) ? state.expedition.active : [];
  return list.some((x) => x && x.petId === petId);
}

/** 지금 파견 보낼 수 있는 대기 펫 목록(해금됨 · 주/보조 미장착 · 미파견) */
export function availableDispatchPets(state) {
  const unlocked = (state && state.pet && Array.isArray(state.pet.unlocked)) ? state.pet.unlocked : [];
  const eq = state && state.pet ? state.pet.equipped : null;
  const sub = state && state.pet ? state.pet.sub : null;
  return PETS.filter((p) => unlocked.includes(p.id) && p.id !== eq && p.id !== sub && !isPetDispatched(state, p.id));
}

/** 특정 권역 내 보유 랜드마크 총 레벨 합계 */
export function regionLandmarkLevels(state, setId) {
  const owned = (state && state.land && state.land.owned) || {};
  const lms = (state && state.land && state.land.landmarks) || {};
  let sum = 0;
  for (const [key, lvRaw] of Object.entries(lms)) {
    const lv = Math.floor(Number(lvRaw) || 0);
    if (lv <= 0 || !(Math.floor(Number(owned[key]) || 0) > 0)) continue;
    if (citySetId(key) === setId) sum += lv;
  }
  return sum;
}

/** 파견 예상 보상 · 대성공 확률 계산 (순수 함수) */
export function expeditionPreview(state, petId, setId, durKey) {
  const dur = EXPEDITION_DUR_BY_KEY[durKey] || EXPEDITION_DURATIONS[0];
  const rb = EXPEDITION_REGION_BONUS[setId] || EXPEDITION_REGION_BONUS.seoul;
  const lv = petLevel(state, petId);
  const evo = petEvo(state, petId);
  const sets = regionSetStatus((state && state.land && state.land.owned) || {});
  const regSt = sets.find((x) => x.id === setId);
  const held = regSt ? regSt.held : 0;
  const lmLv = regionLandmarkLevels(state, setId);

  // 펫 전력 배율: 레벨(+6%/Lv) + 진화(+35%/단계) + 권역 보유 지역(+3%/곳, 최대 +36%) + 랜드마크(+5%/Lv, 최대 +50%)
  const petMul = 1 + Math.max(0, lv - 1) * 0.06 + evo * 0.35;
  const landMul = 1 + Math.min(0.36, held * 0.03) + Math.min(0.50, lmLv * 0.05);
  const powerMul = Math.round(petMul * landMul * 100) / 100;

  const refStage = Math.max(1, Math.floor(Number((state && (state.peakStage || state.maxStage || state.stage)) || 1)));
  const goldBase = stageGoldBase(refStage);
  const gold = Math.max(100, Math.round(goldBase * dur.goldMul * powerMul * rb.goldMul));
  const shards = Math.max(4, Math.round(dur.shardsBase * powerMul * rb.shardMul));
  const points = dur.pointsBase > 0 ? Math.max(1, Math.round((dur.pointsBase + rb.pointAdd) * (1 + evo * 0.25))) : (rb.pointAdd > 0 && evo >= 1 ? 1 : 0);
  const gearChance = clamp(dur.gearChance + rb.gearAdd + evo * 0.05, 0, 0.9);
  const greatChance = clamp(dur.greatBase + evo * 0.08 + Math.min(0.20, lmLv * 0.02) + rb.greatAdd, 0.05, 0.75);

  return {
    dur,
    setId,
    petId,
    held,
    lmLv,
    powerMul,
    gold,
    shards,
    points,
    gearChance,
    greatChance,
    bonusLabel: rb.label,
  };
}

/** 파견 출발 */
export function startExpedition(state, petId, setId, durKey = 'short', now = Date.now()) {
  if (!state || typeof state !== 'object') return { ok: false, reason: '잘못된 상태입니다.' };
  if (!state.expedition || !Array.isArray(state.expedition.active)) state.expedition = defaultExpeditions();
  if (state.expedition.active.length >= EXPEDITION_MAX_SLOTS) {
    return { ok: false, reason: `최대 ${EXPEDITION_MAX_SLOTS}팀까지만 동시 파견할 수 있습니다.` };
  }
  const pDef = petDef(petId);
  if (!pDef) return { ok: false, reason: '알 수 없는 펫입니다.' };
  const unlocked = (state.pet && Array.isArray(state.pet.unlocked)) ? state.pet.unlocked : [];
  if (!unlocked.includes(petId)) return { ok: false, reason: '아직 해금되지 않은 펫입니다.' };
  if (state.pet.equipped === petId || state.pet.sub === petId) {
    return { ok: false, reason: '전투에 동행 중인 펫은 파견할 수 없습니다.' };
  }
  if (isPetDispatched(state, petId)) return { ok: false, reason: '이미 파견 중인 펫입니다.' };

  const regDef = SETS_BY_ID[setId];
  if (!regDef) return { ok: false, reason: '알 수 없는 권역입니다.' };
  const regSt = regionSetStatus((state.land && state.land.owned) || {}).find((x) => x.id === setId);
  if (!regSt || regSt.held < 1) return { ok: false, reason: `${regDef.name} 지역을 1곳 이상 보유해야 파견할 수 있습니다.` };

  const dur = EXPEDITION_DUR_BY_KEY[durKey];
  if (!dur) return { ok: false, reason: '잘못된 파견 기간입니다.' };

  const slot = {
    id: `${petId}_${Math.floor(now)}_${state.expedition.active.length}`,
    petId,
    setId,
    durKey: dur.key,
    startedAt: Math.floor(now),
    endsAt: Math.floor(now) + dur.ms,
  };
  state.expedition.active.push(slot);
  return { ok: true, slot, pet: pDef, region: regDef, dur, preview: expeditionPreview(state, petId, setId, dur.key) };
}

/** 파견 중도 철수(보상 없음 · 펫 즉시 복귀) */
export function cancelExpedition(state, slotId) {
  const active = state && state.expedition && Array.isArray(state.expedition.active) ? state.expedition.active : [];
  const idx = active.findIndex((x) => x && x.id === slotId);
  if (idx < 0) return { ok: false, reason: '진행 중인 파견을 찾을 수 없습니다.' };
  const [removed] = active.splice(idx, 1);
  return { ok: true, slot: removed, pet: petDef(removed.petId) };
}

/** 완료된 파견 1건 수령 */
export function claimExpedition(state, slotId, now = Date.now(), rng = Math.random) {
  if (!state || !state.expedition || !Array.isArray(state.expedition.active)) {
    return { ok: false, reason: '파견 정보가 없습니다.' };
  }
  const idx = state.expedition.active.findIndex((x) => x && x.id === slotId);
  if (idx < 0) return { ok: false, reason: '해당 파견을 찾을 수 없습니다.' };
  const slot = state.expedition.active[idx];
  if (now < slot.endsAt) return { ok: false, reason: '아직 탐험이 끝나지 않았습니다.' };

  const prev = expeditionPreview(state, slot.petId, slot.setId, slot.durKey);
  const great = rng() < prev.greatChance;
  const mul = great ? 1.6 : 1;
  const gold = Math.max(100, Math.round(prev.gold * mul));
  const shards = Math.max(4, Math.round(prev.shards * mul));
  const points = prev.points > 0 ? Math.max(1, Math.round(prev.points * (great ? 1.5 : 1))) : 0;

  state.gold = Math.max(0, Math.floor(num(state.gold, 0))) + gold;
  state.shards = Math.max(0, Math.floor(num(state.shards, 0))) + shards;
  if (points > 0) {
    const rb = birthState(state);
    rb.points = Math.max(0, Math.floor(num(rb.points, 0))) + points;
    rb.totalPoints = Math.max(0, Math.floor(num(rb.totalPoints, 0))) + points;
  }

  let item = null;
  let acq = null;
  const gearRoll = rng();
  if (gearRoll < Math.min(0.95, prev.gearChance * (great ? 1.35 : 1))) {
    const r = rng();
    const rarity = slot.durKey === 'long'
      ? (r < (great ? 0.25 : 0.12) ? 'legend' : r < 0.65 ? 'hero' : 'rare')
      : slot.durKey === 'mid'
        ? (r < (great ? 0.10 : 0.04) ? 'legend' : r < 0.45 ? 'hero' : 'rare')
        : (r < 0.25 ? 'hero' : r < 0.75 ? 'rare' : 'uncommon');
    const picked = randomItemOfRarity(rarity, rng);
    if (picked) {
      acq = acquireGear(state, picked.id, { autoEquip: true, now, rng, rollAffix: true });
      item = picked;
    }
  }

  state.expedition.active.splice(idx, 1);
  state.expedition.completed = (state.expedition.completed || 0) + 1;
  if (great) state.expedition.greatCount = (state.expedition.greatCount || 0) + 1;
  state.expedition.totalGold = (state.expedition.totalGold || 0) + gold;
  state.expedition.totalShards = (state.expedition.totalShards || 0) + shards;
  state.expedition.totalPoints = (state.expedition.totalPoints || 0) + points;
  state.expedition.last = {
    petId: slot.petId,
    setId: slot.setId,
    durKey: slot.durKey,
    great,
    gold,
    shards,
    points,
    itemId: item ? item.id : null,
    at: Math.floor(now),
  };

  return {
    ok: true,
    slot,
    pet: petDef(slot.petId),
    petName: petStageInfo(state, slot.petId).name,
    region: SETS_BY_ID[slot.setId],
    great,
    gold,
    shards,
    points,
    item,
    acq,
  };
}

/** 완료된 파견 일괄 수령 */
export function claimAllExpeditions(state, now = Date.now(), rng = Math.random) {
  const active = state && state.expedition && Array.isArray(state.expedition.active) ? state.expedition.active : [];
  const readyIds = active.filter((x) => x && now >= x.endsAt).map((x) => x.id);
  if (!readyIds.length) return { ok: false, reason: '완료된 파견이 없습니다.' };
  const results = [];
  let gold = 0;
  let shards = 0;
  let points = 0;
  let greats = 0;
  const items = [];
  for (const id of readyIds) {
    const r = claimExpedition(state, id, now, rng);
    if (r.ok) {
      results.push(r);
      gold += r.gold;
      shards += r.shards;
      points += r.points;
      if (r.great) greats += 1;
      if (r.item) items.push(r.item);
    }
  }
  return { ok: true, count: results.length, gold, shards, points, greats, items, results };
}

/** UI용 현재 파견 현황 요약 */
export function expeditionStatus(state, now = Date.now()) {
  const ex = (state && state.expedition) || defaultExpeditions();
  const active = Array.isArray(ex.active) ? ex.active : [];
  const slots = active.map((slot) => {
    const span = Math.max(1, slot.endsAt - slot.startedAt);
    const leftMs = Math.max(0, slot.endsAt - now);
    const pct = clamp(1 - leftMs / span, 0, 1);
    const ready = leftMs <= 0;
    const prev = expeditionPreview(state, slot.petId, slot.setId, slot.durKey);
    return {
      ...slot,
      pet: petDef(slot.petId),
      petInfo: petStageInfo(state, slot.petId),
      region: SETS_BY_ID[slot.setId],
      dur: EXPEDITION_DUR_BY_KEY[slot.durKey] || EXPEDITION_DURATIONS[0],
      leftMs,
      pct,
      ready,
      preview: prev,
    };
  });
  const sets = regionSetStatus((state && state.land && state.land.owned) || {});
  const ownedRegions = sets.filter((st) => st.held > 0);
  return {
    slots,
    activeCount: slots.length,
    readyCount: slots.filter((x) => x.ready).length,
    maxSlots: EXPEDITION_MAX_SLOTS,
    availablePets: availableDispatchPets(state),
    ownedRegions,
    totals: {
      completed: ex.completed || 0,
      greatCount: ex.greatCount || 0,
      totalGold: ex.totalGold || 0,
      totalShards: ex.totalShards || 0,
      totalPoints: ex.totalPoints || 0,
    },
    last: ex.last || null,
  };
}

/** 🗺️ 전국 7개 권역 지도용 집계 데이터 (점유율·호재·랜드마크·파견 펫) */
export function regionMapData(state, now = Date.now()) {
  const owned = (state && state.land && state.land.owned) || {};
  const sets = regionSetStatus(owned);
  const news = activeNews(now);
  const activeEx = (state && state.expedition && Array.isArray(state.expedition.active)) ? state.expedition.active : [];
  return sets.map((st) => {
    const total = REGION_CITY_TOTALS[st.id] || 1;
    const pct = clamp(st.held / total, 0, 1);
    const landmarks = regionLandmarkLevels(state, st.id);
    // 현재 호재 뉴스가 이 권역의 지역을 하나라도 덮는지 확인
    let hasNews = false;
    if (news) {
      if (news.scope === 'set' && news.target === st.id) hasNews = true;
      else if (news.scope === 'city') {
        const hit = RCITIES.find((c) => citySetId(c.key) === st.id && newsCovers(news, c.key));
        hasNews = !!hit;
      }
    }
    const pets = activeEx
      .filter((x) => x && x.setId === st.id)
      .map((x) => ({ id: x.petId, emoji: (petDef(x.petId) || {}).emoji || '🐾', ready: now >= x.endsAt }));
    return {
      ...st,
      total,
      pct,
      landmarks,
      hasNews,
      pets,
    };
  });
}
