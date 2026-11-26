// land-rpg / src/land.js
// 전국 229개 시군구 부동산 엔진 (순수 함수 · DOM/네트워크 의존 없음).
//
// v3 통합 경제:
//   - 화폐는 게임 골드(💰) 하나. 매수/매도/임대수익 모두 같은 골드로 오간다(별도 환전 없음).
//   - 매물 가격 = 원본 korea-land 시세를 RPG 골드 스케일로 압축
//       (군 120~2,000골드/평 … 시 1,700~42,800 … 구 7,200~200,000골드/평)
//   - 임대수익 = 매물 가치의 분당 일정 비율(군이 회수 빠르고, 구가 느린 원작 성격 유지)
//   - 시세는 모든 기기가 같은 순간 같은 가격을 보도록 시간 기반 결정론 모델을 쓴다.
//   - 수익/거래 규칙(지분 구간별 한계 수익 배율)은 원작과 동일.
//   - v3.0.6: 장기 방치 복리 스노우볼 완화 — 접속 중 회수 5.5~11.9시간, 오프라인은 온라인의 25%.
import { LAND_TIERS, LAND_TRAITS, TIER_INCOME_MULTS } from './land-data.js';
import { PROP_BUFFS } from './data.js';
import {
  activeNews, newsForCity, citySetId, regionSetBuffs, regionSetStatus, buffText,
} from './region.js';
import { landSynergy } from './synergy.js';

export const LAND = {
  priceScale: 0.1, // 원본 시세(원/평) → 골드/평 (10분의 1)
  tierPriceMults: [1, 2, 4], // 군·시·구 프리미엄
  rentRatePerMin: 0.002, // 매물 가치의 분당 임대수익(0.2% → 시간당 12%, 회수 약 8.3시간)
  tierRentMults: [1.5, 1.0, 0.7], // 회수 속도: 군 5.6시간(18%/h) · 시 8.3시간(12%/h) · 구 11.9시간(8.4%/h)
  feeRate: 0.003, // 거래세 0.3%
  dailySwing: 0.08, // 일일 기준가 흔들림 ±8%
  swing: 0.12, // 장중 파동 ±12% (지역 특성에 따라 확대)
  band: 0.3, // 일일 기준가 대비 상·하한 ±30%
  floorOfBase: 0.3, // 초기가의 30% 절대 하한
  rentOfflineRate: 0.25, // 오프라인 임대 수익 = 접속 중의 25%(실제 시간당 2.1~4.5%)
  rentCapHours: 12,
  leaseCapPct: 60, // 경매 특별 임대 계약 상한(한 지역 누적, v4.6)
  seasonMs: 6 * 3600 * 1000, // 계절 특성 6시간 로테이션
  seasonChance: 0.2,
};

/* ─────────────── 🏛️ 랜드마크 (v3.4.0) ───────────────
 * 보유 지역(5평 이상)에 골드를 투자해 Lv.1~3 건설·업그레이드.
 * 레벨에 따라 그 지역의 임대수익이 +30% / +70% / +120% 로 크게 오르고,
 * 랜드마크를 보유한 수만큼 건물주 보너스(공격력·골드)가 소폭 붙는다.
 */
export const LANDMARK = {
  minPyeong: 5, // 건설에 필요한 최소 보유 평수
  maxLevel: 3,
  levels: [
    { lv: 1, name: '상가', icon: '🏬', rentPct: 30, costMul: 0.35 },
    { lv: 2, name: '타워', icon: '🏢', rentPct: 70, costMul: 0.9 },
    { lv: 3, name: '메가 랜드마크', icon: '🏙️', rentPct: 120, costMul: 2.2 },
  ],
  atkPerLandmark: 1, // 랜드마크 1개당 공격력 +1%
  atkCap: 15,
  goldPerLandmark: 0.5, // 랜드마크 1개당 골드 획득 +0.5%
  goldCap: 10,
};

const DAY = 86400000;
const KST = 9 * 3600000;
const HOUR = 3600000;

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || d);

/* ─────────────── 도시 인덱스 ─────────────── */
export const CITIES = [];
export const CITY_BY_KEY = Object.create(null);

(function buildIndex() {
  LAND_TIERS.forEach((td, ti) => {
    td.regions.forEach((reg, ri) => {
      reg.cities.forEach((city, ci) => {
        const key = `${ti}_${ri}_${ci}`;
        const tierPriceMult = LAND.tierPriceMults[ti] ?? 1;
        const base = Math.max(10, Math.round(city.p * LAND.priceScale * tierPriceMult));
        const tierRentMult = LAND.tierRentMults[ti] ?? 1;
        const row = {
          key,
          tier: ti,
          tierLabel: td.label,
          region: reg.name,
          name: city.n,
          emoji: city.e || '🏠',
          base, // 골드/평 (일일 기준가의 중심)
          rentPerMin: base * LAND.rentRatePerMin * tierRentMult, // 평당 분당 임대수익(골드)
          supply: city.ms || 10000,
          trait: city.trait || null,
        };
        CITIES.push(row);
        CITY_BY_KEY[key] = row;
      });
    });
  });
})();

export const TIER_LABELS = LAND_TIERS.map((t) => t.label);

/* ─────────────── 결정론적 난수 ─────────────── */
export function seededRandom(seed) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/* ─────────────── 지역 특성 / 계절 특성 ─────────────── */
export function seasonalTraitKey(city, now = Date.now()) {
  if (!city) return null;
  const block = Math.floor(now / LAND.seasonMs);
  const seed = hashString(city.key + block);
  if (seededRandom(seed) <= 1 - LAND.seasonChance) return null;
  const keys = Object.keys(LAND_TRAITS);
  return keys[Math.floor(seededRandom(seed + 7) * keys.length)] || null;
}

export function traitInfo(key) {
  const t = key && LAND_TRAITS[key];
  return t ? { key, ...t } : null;
}

/* ─────────────── 가격 ─────────────── */
function dayIndexOf(now) {
  // 매일 09:00(KST)에 일일 기준가 갱신 — 원작 updateMarket 과 같은 경계
  return Math.floor((now + KST - 9 * HOUR) / DAY);
}

/** 가격(골드/평) + 일일 기준가 + 추세(%) */
export function priceInfo(city, now = Date.now()) {
  if (!city) return { price: 0, daily: 0, trend: 0, swingPct: 0, season: null };
  const day = dayIndexOf(now);
  const dailyDrift = (seededRandom(hashString(city.key) + day * 7919) - 0.5) * 2 * LAND.dailySwing;
  const daily = city.base * (1 + dailyDrift);

  const season = seasonalTraitKey(city, now);
  const traits = [city.trait, season].filter(Boolean);
  let amp = LAND.swing;
  if (traits.includes('GROWTH')) amp *= 1.5;
  if (traits.includes('TECH_VALLEY')) amp *= 2;

  const ph = seededRandom(hashString(city.key + '#phase')) * Math.PI * 2;
  let wave =
    0.5 * Math.sin((now * 2 * Math.PI) / (37 * 60000) + ph) +
    0.3 * Math.sin((now * 2 * Math.PI) / (11 * 60000) + ph * 1.7) +
    0.2 * Math.sin((now * 2 * Math.PI) / (5 * HOUR) + ph * 0.6);
  if (traits.includes('SAFE_HAVEN') && wave < 0) wave *= 0.5;

  let price = daily * (1 + wave * amp);
  price = Math.min(daily * (1 + LAND.band), Math.max(daily * (1 - LAND.band), price));
  price = Math.max(Math.round(city.base * LAND.floorOfBase), Math.round(price));

  // v3.4.0: 호재 뉴스가 적용된 지역은 시세가 한 번 더 보정된다(밴드 위에 가산).
  const news = newsForCity(city.key, now);
  if (news && news.pricePct > 0) price = Math.round(price * (1 + news.pricePct / 100));

  // v5.1.0: 일일 시세 밴드(±30%) 내 현재 위치(0=저점 ~ 1=고점)
  const lo = daily * (1 - LAND.band);
  const hi = daily * (1 + LAND.band);
  const bandPos = hi > lo ? Math.max(0, Math.min(1, (price - lo) / (hi - lo))) : 0.5;
  const bandLabel = bandPos <= 0.25 ? '저점' : bandPos >= 0.75 ? '고점' : '보통';

  return {
    price,
    daily: Math.round(daily),
    trend: daily > 0 ? ((price - daily) / daily) * 100 : 0,
    swingPct: amp * 100,
    bandPos: Math.round(bandPos * 1000) / 1000,
    bandLabel,
    season,
    news: news || null,
  };
}

export function priceOf(city, now = Date.now()) {
  return priceInfo(city, now).price;
}

/* ─────────────── 수익 ─────────────── */
/** 지분 구간별 한계 수익 배율 (원작 getOwnershipIncomeMult 와 동일) */
export function ownershipMult(qty, supply) {
  if (!supply || !(qty > 0)) return 1.0;
  const brackets = [
    { upTo: 0.2, rate: 1.0 },
    { upTo: 0.4, rate: 0.5 },
    { upTo: 0.6, rate: 0.2 },
    { upTo: 0.8, rate: 0.08 },
    { upTo: 1.0, rate: 0.02 },
  ];
  let totalEffective = 0;
  let prev = 0;
  let remaining = qty;
  for (const b of brackets) {
    const cap = b.upTo * supply;
    const inBracket = Math.min(remaining, cap - prev);
    prev = cap;
    if (inBracket <= 0) continue;
    totalEffective += inBracket * b.rate;
    remaining -= inBracket;
    if (remaining <= 0) break;
  }
  return totalEffective / qty;
}

/** 수익 배율: 세무 전략 도시 +20%, 관광 중심 +30% */
export function incomeTraitMod(city, now = Date.now()) {
  let m = 1;
  for (const t of [city.trait, seasonalTraitKey(city, now)]) {
    if (t === 'HIGH_TAX') m *= LAND_TRAITS.HIGH_TAX.mod; // 1.2
    else if (t === 'TOURISM_HUB') m *= LAND_TRAITS.TOURISM_HUB.mod; // 1.3
  }
  return m;
}

/** 보유 수량 전체의 분당 임대수익 (골드) */
export function incomePerMinOf(city, qty, ownedQty = qty, now = Date.now(), rentMul = 1) {
  if (!city || !(qty > 0)) return 0;
  const mul = Number(rentMul) > 0 ? Number(rentMul) : 1;
  return qty * city.rentPerMin * incomeTraitMod(city, now) * ownershipMult(ownedQty, city.supply) * mul;
}

/** 그 지역에 걸린 임대수익 배율(권역 세트 · 랜드마크 · 호재 뉴스) */
export function cityRentMul(state, key, now = Date.now(), setBuffs = null, news = null) {
  const owned = ((state || {}).land || {}).owned || {};
  const sb = setBuffs || regionSetBuffs(owned);
  const setId = citySetId(key);
  const setPct = setId && sb.rentBySet ? (sb.rentBySet[setId] || 0) : 0;
  const lm = landmarkRentMul(landmarkLevel(state, key));
  const newsMul = news ? 1 + (news.rentPct || 0) / 100 : 1;
  const leaseMul = 1 + leasePctOf(state, key) / 100; // v4.6 경매 특별 임대
  const boomEnd = state && state.invasion && state.invasion.booms ? Number(state.invasion.booms[key]) || 0 : 0;
  const boomMul = boomEnd > now ? 1.5 : 1; // v5.11 침공 방어 성공 호황 +50%
  return (1 + setPct / 100) * lm * newsMul * leaseMul * boomMul;
}

/* ─────────────── 🏷️ 경매 특별 임대 계약 (v4.6) ─────────────── */
/** 경매로 얻은 특별 임대 계약(%) — 그 지역 임대수익에 영구 가산된다 */
export function leasePctOf(state, key) {
  const m = state && state.land && state.land.lease;
  if (!m || typeof m !== 'object' || !key) return 0;
  const v = Number(m[key]);
  return isFinite(v) && v > 0 ? Math.min(LAND.leaseCapPct, v) : 0;
}

/* ─────────────── 🏛️ 랜드마크 ─────────────── */
/** 그 지역의 랜드마크 레벨(0 = 없음) */
export function landmarkLevel(state, key) {
  const lms = state && state.land && state.land.landmarks;
  if (!lms || typeof lms !== 'object') return 0;
  const lv = Math.floor(num(lms[key]));
  return Math.max(0, Math.min(LANDMARK.maxLevel, lv));
}

/** 랜드마크 레벨 → 임대수익 배율 */
export function landmarkRentMul(level) {
  const lv = Math.max(0, Math.min(LANDMARK.maxLevel, Math.floor(Number(level) || 0)));
  if (!lv) return 1;
  return 1 + LANDMARK.levels[lv - 1].rentPct / 100;
}

/** 랜드마크 건설/업그레이드 견적 */
export function landmarkQuote(state, key, now = Date.now()) {
  const city = CITY_BY_KEY[key];
  if (!city) return { ok: false, reason: '알 수 없는 지역입니다.' };
  const s = state || {};
  const held = Math.floor(num((((s.land || {}).owned) || {})[key]));
  const level = landmarkLevel(state, key);
  const gold = Math.max(0, num(s.gold));
  if (level >= LANDMARK.maxLevel) {
    return { ok: false, reason: '이미 최대 레벨입니다.', city, held, level, max: true };
  }
  if (held < LANDMARK.minPyeong) {
    return {
      ok: false,
      reason: `${LANDMARK.minPyeong}평 이상 보유해야 랜드마크를 세울 수 있습니다. (보유 ${held.toLocaleString()}평)`,
      city, held, level, minPyeong: LANDMARK.minPyeong,
    };
  }
  const next = LANDMARK.levels[level];
  const cost = Math.max(1, Math.round(held * city.base * next.costMul));
  if (gold < cost) {
    return {
      ok: false,
      reason: `골드가 부족합니다. (필요 💰${cost.toLocaleString()})`,
      city, held, level, cost, need: cost, gold,
    };
  }
  return {
    ok: true, city, held, level, next: level + 1, name: next.name, icon: next.icon,
    cost, rentPct: next.rentPct, gold, after: gold - cost,
  };
}

/** 랜드마크 건설/업그레이드 실행 */
export function buildLandmark(state, key, now = Date.now()) {
  const q = landmarkQuote(state, key, now);
  if (!q.ok) return q;
  const land = state.land;
  state.gold = Math.floor(num(state.gold) - q.cost);
  if (!land.landmarks || typeof land.landmarks !== 'object') land.landmarks = {};
  land.landmarks[key] = q.next;
  land.landmarkSpend = num(land.landmarkSpend) + q.cost;
  return { ok: true, ...q, level: q.next, spent: q.cost };
}

/** 랜드마크 보유 수 → 건물주 소폭 보너스 */
export function landmarkSummary(state) {
  const lms = state && state.land && state.land.landmarks;
  const owned = ((state && state.land && state.land.owned) || {});
  const levels = [0, 0, 0];
  let count = 0;
  if (lms && typeof lms === 'object') {
    for (const [key, raw] of Object.entries(lms)) {
      if (!(Math.floor(num(owned[key])) > 0)) continue;
      const lv = Math.max(0, Math.min(LANDMARK.maxLevel, Math.floor(num(raw))));
      if (!lv) continue;
      levels[lv - 1] += 1;
      count += 1;
    }
  }
  const round1 = (v) => Math.round(v * 10) / 10;
  return {
    count,
    levels,
    atkPct: Math.min(LANDMARK.atkCap, round1(count * LANDMARK.atkPerLandmark)),
    goldPct: Math.min(LANDMARK.goldCap, round1(count * LANDMARK.goldPerLandmark)),
  };
}

/* ─────────────── 통합 상태의 land 부분 기본값 ─────────────── */
export const LAND_FAV_MAX = 20;
export const LAND_MANAGER = { minCities: 10, everyMs: 5 * 60 * 1000 };

export function defaultLand(now = Date.now()) {
  return {
    owned: {}, // { cityKey: pyeong }
    totalCost: {}, // { cityKey: 골드 }
    landmarks: {}, // { cityKey: Lv.1~3 } — v3.4.0
    landmarkSpend: 0, // 랜드마크 누적 투자(골드)
    // v4.6: 경매 특별 임대 계약 { cityKey: % } · 급매 경매 기록
    lease: {},
    auction: { done: -1, bids: 0, spend: 0, saved: 0, log: [] },
    // v5.1: 관심 매물(최대 20곳) · 영지 관리인 임대 자동 수령
    favorites: [],
    autoRent: false,
    autoRentAt: 0,
    accruedRent: 0, // 미수령 임대수익(골드)
    rentAt: now, // 마지막 임대 적립 시각
    bestAsset: 0, // 최고 부동산 평가액
    tradeCount: 0,
    taxPaid: 0,
    assetHistory: [], // [{t, v}] 1분 간격
    totalRentClaimed: 0,
    sub: 'home', // home | market | buff
    q: '',
    tier: 'all',
    sort: 'roi',
    page: 1,
  };
}

/** 관심 매물 여부 */
export function isFavoriteCity(state, key) {
  const fav = state && state.land && Array.isArray(state.land.favorites) ? state.land.favorites : [];
  return fav.includes(key);
}

/** 관심 매물 등록/해제 (최대 20곳) */
export function toggleFavoriteCity(state, key) {
  if (!state || !CITY_BY_KEY[key]) return { ok: false, reason: '알 수 없는 지역입니다.' };
  if (!state.land || typeof state.land !== 'object') state.land = defaultLand();
  const fav = Array.isArray(state.land.favorites) ? state.land.favorites.filter((k) => !!CITY_BY_KEY[k]) : [];
  const idx = fav.indexOf(key);
  if (idx >= 0) {
    fav.splice(idx, 1);
    state.land.favorites = fav;
    return { ok: true, fav: false, count: fav.length, city: CITY_BY_KEY[key] };
  }
  if (fav.length >= LAND_FAV_MAX) {
    return { ok: false, reason: `관심 매물은 최대 ${LAND_FAV_MAX}곳까지 등록할 수 있습니다.` };
  }
  fav.push(key);
  state.land.favorites = fav;
  return { ok: true, fav: true, count: fav.length, city: CITY_BY_KEY[key] };
}

/** 영지 관리인(임대 자동 수령) 해금 여부 — 보유 10곳 이상 */
export function landManagerUnlocked(state) {
  const owned = state && state.land && state.land.owned && typeof state.land.owned === 'object' ? state.land.owned : {};
  let cnt = 0;
  for (const v of Object.values(owned)) if (Math.floor(num(v)) > 0) cnt += 1;
  return cnt >= LAND_MANAGER.minCities;
}

/* ─────────────── 포트폴리오 ─────────────── */
/** 통합 상태 → 화면/계산용 요약 (골드 기준) */
export function portfolioOf(state, now = Date.now()) {
  const s = state && typeof state === 'object' ? state : {};
  const land = s.land && typeof s.land === 'object' ? s.land : {};
  const gold = Math.max(0, num(s.gold));
  const owned = land.owned && typeof land.owned === 'object' ? land.owned : {};
  const totalCost = land.totalCost && typeof land.totalCost === 'object' ? land.totalCost : {};
  const landmarks = land.landmarks && typeof land.landmarks === 'object' ? land.landmarks : {};
  const setBuffs = regionSetBuffs(owned); // 권역 세트 버프(임대수익 배율 포함)

  let value = 0;
  let incomePerMin = 0;
  let pyeong = 0;
  let cities = 0;
  const holdings = [];
  const unknown = [];

  for (const [key, qtyRaw] of Object.entries(owned)) {
    const qty = Math.floor(num(qtyRaw));
    if (!(qty > 0)) continue;
    pyeong += qty;
    cities += 1;
    const city = CITY_BY_KEY[key];
    if (!city) {
      unknown.push({ key, qty });
      continue;
    }
    const info = priceInfo(city, now);
    const lm = Math.max(0, Math.min(LANDMARK.maxLevel, Math.floor(num(landmarks[key]))));
    const setId = citySetId(key);
    const setRentPct = setId ? (setBuffs.rentBySet[setId] || 0) : 0;
    const news = info.news || null;
    const leasePct = leasePctOf(s, key);
    const boomEnd = s && s.invasion && s.invasion.booms ? Number(s.invasion.booms[key]) || 0 : 0;
    const boomPct = boomEnd > now ? 50 : 0;
    const rentMul = (1 + setRentPct / 100) * landmarkRentMul(lm)
      * (news ? 1 + (news.rentPct || 0) / 100 : 1) * (1 + leasePct / 100) * (1 + boomPct / 100);
    const income = incomePerMinOf(city, qty, qty, now, rentMul);
    const v = qty * info.price;
    const cost = num(totalCost[key]);
    value += v;
    incomePerMin += income;
    holdings.push({
      key,
      city,
      qty,
      price: info.price,
      daily: info.daily,
      trend: info.trend,
      bandPos: info.bandPos,
      bandLabel: info.bandLabel,
      value: v,
      cost,
      avgCost: qty > 0 && cost > 0 ? Math.round(cost / qty) : info.price,
      profit: cost > 0 ? v - cost : null,
      profitPct: cost > 0 ? Math.round(((v - cost) / cost) * 1000) / 10 : null,
      incomePerMin: income,
      incomePerHour: income * 60,
      roiPerHour: v > 0 ? (income * 60 * 100) / v : 0,
      landmark: lm,
      setId,
      setRentPct,
      leasePct,
      boomPct,
      rentMul,
      news,
    });
  }
  holdings.sort((a, b) => b.value - a.value);

  return {
    gold,
    cash: gold, // 호환용 별칭
    landValue: value,
    totalAsset: gold + value,
    pyeong,
    cities,
    regions: cities,
    incomePerMin,
    incomePerHour: incomePerMin * 60,
    accruedRent: Math.max(0, num(land.accruedRent)),
    holdings,
    unknown,
    land,
    setBuffs,
    news: activeNews(now),
  };
}

/** 보유 매물에서 나오는 영구 버프 */
export function computeBuffs(state, now = Date.now()) {
  const p = portfolioOf(state, now);
  const B = PROP_BUFFS;
  // '건물(보유 지역)' = 한 지역에서 cityMinPyeong 평 이상 보유
  const buildings = p.holdings.filter((h) => h.qty >= B.cityMinPyeong).length;
  const atkPct = Math.min(B.atkCap, Math.floor(buildings * B.atkPerCity * 10) / 10);
  const hpPct = Math.min(B.hpCap, Math.floor(p.pyeong / B.hpPerPyeong) * B.hpPer);
  const goldPct = Math.min(B.goldCap, Math.floor(p.landValue / B.goldPerAsset) * B.goldPer);
  const critPct = Math.min(B.critCap, Math.floor(buildings / B.critPerCities) * B.critPer);
  const dropPct = Math.min(B.dropCap, Math.floor(p.pyeong / B.dropPerPyeong) * B.dropPer);

  // v3.4.0: 권역 세트 · 랜드마크 보너스는 '건물주 버프'와 별도 항목으로 가산된다.
  const sets = p.setBuffs || regionSetBuffs(p.land && p.land.owned);
  const lm = landmarkSummary(state);
  // v4.6: 랜드마크·권역 완성 → 전투 시너지(치명타 피해·쿨감·보스 피해·경험치·공/골드/드롭)
  const syn = landSynergy(state, p.land && p.land.owned);
  const setAtkPct = sets.atkPct || 0;
  const setGoldPct = sets.goldPct || 0;
  const setDropPct = sets.dropPct || 0;
  const setHpPct = sets.hpPct || 0;
  const setCritPct = sets.critPct || 0;
  return {
    atkPct,
    hpPct,
    goldPct,
    critPct,
    dropPct,
    buildings,
    cities: p.cities,
    totalPyeong: p.pyeong,
    landValue: p.landValue,
    // 권역 세트
    setAtkPct,
    setGoldPct,
    setDropPct,
    setHpPct,
    setCritPct,
    setRentPct: sets.rentBySet || {},
    setCount: sets.activeCount || 0,
    setTotal: sets.total || 0,
    sets: sets.sets || regionSetStatus(p.land && p.land.owned),
    // 랜드마크
    landmarkCount: lm.count,
    landmarkAtkPct: lm.atkPct,
    landmarkGoldPct: lm.goldPct,
    landmarkLevels: lm.levels,
    // v4.6 부동산 전투 시너지(랜드마크 + 권역 완성) — 사냥 탭·부동산 탭 공통 표시
    syn,
    synAtkPct: syn.atkPct,
    synGoldPct: syn.goldPct,
    synDropPct: syn.dropPct,
    synCritDmgPct: syn.critDmgPct,
    synCdrPct: syn.cdrPct,
    synBossDmgPct: syn.bossDmgPct,
    synExpPct: syn.expPct,
    synText: syn.text,
    synLandmarkLevels: syn.landmark.levels,
    synMega: syn.landmark.mega,
    synCompleteSets: syn.region.count,
    active: atkPct + hpPct + goldPct + critPct + dropPct > 0
      || setAtkPct + setGoldPct + setDropPct + setHpPct + setCritPct > 0 || lm.count > 0
      || syn.active,
  };
}

/** 다음 버프 단계까지 진행도(UI 게이지용) */
export function buffProgress(state, now = Date.now()) {
  const p = portfolioOf(state, now);
  const B = PROP_BUFFS;
  const buildings = p.holdings.filter((h) => h.qty >= B.cityMinPyeong).length;
  const cap = (v, max) => Math.min(1, max > 0 ? v / max : 0);
  const citiesToNext = Math.ceil((buildings + 1) / B.critPerCities) * B.critPerCities;
  const pyeongToNext = (Math.floor(p.pyeong / B.hpPerPyeong) + 1) * B.hpPerPyeong;
  const assetToNext = (Math.floor(p.landValue / B.goldPerAsset) + 1) * B.goldPerAsset;
  return {
    atk: {
      pct: cap(buildings * B.atkPerCity, B.atkCap),
      next: buildings * B.atkPerCity >= B.atkCap ? '최대치' : `건물(3평 이상 보유 지역) ${buildings + 1}곳 → 공격력 +${B.atkPerCity}%`,
    },
    hp: {
      pct: cap(p.pyeong / B.hpPerPyeong, B.hpCap),
      next: p.pyeong / B.hpPerPyeong >= B.hpCap ? '최대치' : `${pyeongToNext.toLocaleString()}평 도달 시 +${B.hpPer}%`,
    },
    gold: {
      pct: cap(p.landValue / B.goldPerAsset, B.goldCap),
      next: p.landValue / B.goldPerAsset >= B.goldCap ? '최대치' : `매물 평가 ${formatGold(assetToNext)} 도달 시 +${B.goldPer}%`,
    },
    crit: {
      pct: cap(Math.floor(buildings / B.critPerCities) * B.critPer, B.critCap),
      next: Math.floor(buildings / B.critPerCities) * B.critPer >= B.critCap ? '최대치' : `건물 ${citiesToNext}곳 → 치명타 +${B.critPer}%`,
    },
    drop: {
      pct: cap(p.pyeong / B.dropPerPyeong, B.dropCap),
      next: p.pyeong / B.dropPerPyeong >= B.dropCap ? '최대치' : `${((Math.floor(p.pyeong / B.dropPerPyeong) + 1) * B.dropPerPyeong).toLocaleString()}평 도달 시 +${B.dropPer}%`,
    },
  };
}

/* ─────────────── 거래 ─────────────── */
/** 현재 골드/보유량 기준 견적. side = 'buy' | 'sell' */
export function quoteTrade(key, side, qty, state, now = Date.now()) {
  const city = CITY_BY_KEY[key];
  const q = Math.floor(num(qty));
  const s = state || {};
  const land = s.land || {};
  const owned = land.owned && typeof land.owned === 'object' ? land.owned : {};
  const held = Math.floor(num(owned[key]));
  const gold = Math.max(0, num(s.gold));
  if (!city) return { ok: false, reason: '알 수 없는 지역입니다.' };
  if (!(q > 0)) return { ok: false, reason: '수량을 1평 이상 입력해 주세요.' };
  const info = priceInfo(city, now);
  const total = info.price * q;
  const fee = Math.floor(total * LAND.feeRate);

  if (side === 'buy') {
    const remaining = Math.max(0, city.supply - held);
    if (q > remaining) return { ok: false, reason: `잔여 공급이 부족합니다. (최대 ${remaining.toLocaleString()}평)`, remaining };
    if (gold < total + fee) {
      return { ok: false, reason: `골드가 부족합니다. (필요 💰${(total + fee).toLocaleString()})`, need: total + fee, gold };
    }
    return { ok: true, side, city, qty: q, price: info.price, total, fee, net: -(total + fee), after: gold - total - fee, held, remaining };
  }
  if (side === 'sell') {
    if (held < q) return { ok: false, reason: `보유 면적이 부족합니다. (보유 ${held.toLocaleString()}평)`, held };
    return { ok: true, side, city, qty: q, price: info.price, total, fee, net: total - fee, after: gold + total - fee, held, remaining: 0 };
  }
  return { ok: false, reason: '알 수 없는 거래 유형입니다.' };
}

/** 현재 골드로 살 수 있는 최대 평수 */
export function maxBuyQty(key, state, now = Date.now()) {
  const city = CITY_BY_KEY[key];
  if (!city) return 0;
  const s = state || {};
  const held = Math.floor(num(((s.land || {}).owned || {})[key]));
  const price = priceOf(city, now);
  const gold = Math.max(0, num(s.gold));
  const bySupply = Math.max(0, city.supply - held);
  const byGold = price > 0 ? Math.floor(gold / (price * (1 + LAND.feeRate))) : 0;
  return Math.max(0, Math.min(bySupply, byGold));
}

/**
 * 매수/매도 반영. state 를 제자리에서 갱신하고 결과를 돌려준다.
 * 반환: { ok, reason, quote }
 */
export function applyTrade(state, key, side, qty, now = Date.now()) {
  const quote = quoteTrade(key, side, qty, state, now);
  if (!quote.ok) return { ok: false, reason: quote.reason };
  const s = state;
  const land = s.land;
  const q = quote.qty;
  const held = Math.floor(num(land.owned[key]));

  if (side === 'buy') {
    s.gold = Math.floor(num(s.gold) - quote.total - quote.fee);
    land.owned[key] = held + q;
    land.totalCost[key] = num(land.totalCost[key]) + quote.total;
  } else {
    s.gold = Math.floor(num(s.gold) + quote.total - quote.fee);
    const left = held - q;
    if (left > 0) {
      land.owned[key] = left;
      const cost = num(land.totalCost[key]);
      if (cost > 0) land.totalCost[key] = Math.round((cost * left) / held);
    } else {
      delete land.owned[key];
      delete land.totalCost[key];
      // 전량 매도 → 그 지역 랜드마크·경매 특별 임대 계약도 함께 정리(지역이 없으면 유지되지 않는다)
      if (land.landmarks && typeof land.landmarks === 'object') delete land.landmarks[key];
      if (land.lease && typeof land.lease === 'object') delete land.lease[key];
    }
  }
  land.taxPaid = num(land.taxPaid) + quote.fee;
  land.tradeCount = Math.floor(num(land.tradeCount)) + 1;

  const p = portfolioOf(s, now);
  const history = Array.isArray(land.assetHistory) ? land.assetHistory.slice(-288) : [];
  const lastT = history.length ? num(history[history.length - 1].t) : 0;
  if (now - lastT >= 60000) history.push({ t: now, v: Math.floor(p.totalAsset) });
  land.assetHistory = history;

  land.bestAsset = Math.max(num(land.bestAsset), Math.floor(p.totalAsset));
  return { ok: true, quote, portfolio: p };
}

/* ─────────────── 임대 수익 적립 ─────────────── */
/** elapsed(ms) 동안의 임대 수익(골드). rate 1=접속 중, 0.25=오프라인 */
export function rentAccrual(incomePerMin, elapsedMs, rate = 1) {
  const ms = Math.max(0, Math.min(elapsedMs, LAND.rentCapHours * HOUR));
  return Math.max(0, (num(incomePerMin) / 60000) * ms * Math.max(0, rate));
}

/**
 * 임대수익 적립: state.land.rentAt → now.
 * 반환: 이번에 적립된 골드
 */
export function accrueRent(state, now = Date.now(), rate = 1) {
  const land = state && state.land;
  if (!land) return 0;
  const from = Number(land.rentAt) || 0;
  if (!from) {
    land.rentAt = now;
    return 0;
  }
  const income = portfolioOf(state, now).incomePerMin;
  const gain = rentAccrual(income, now - from, rate);
  if (gain > 0) land.accruedRent = Math.max(0, num(land.accruedRent) + gain);
  land.rentAt = now;
  return gain;
}

/** 임대수익 수령 → 골드로 전환 */
export function claimRent(state) {
  const land = state && state.land;
  if (!land) return 0;
  const amt = Math.floor(Math.max(0, num(land.accruedRent)));
  if (amt < 1) return 0;
  land.accruedRent = Math.max(0, num(land.accruedRent) - amt);
  state.gold = Math.floor(num(state.gold) + amt);
  land.totalRentClaimed = num(land.totalRentClaimed) + amt;
  land.rentAt = Date.now();
  return amt;
}

/* ─────────────── 표기 ─────────────── */
/** 골드 축약 표기: 12,345 → "1.2만" / 3,400,000 → "340만" / 12,000,000 → "1,200만" */
export function formatGold(n) {
  const v = Math.floor(Number(n) || 0);
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}억`;
  if (abs >= 1e6) return `${Math.round(v / 1e4).toLocaleString()}만`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(1)}만`;
  return v.toLocaleString('ko-KR');
}

export function formatWon(n) {
  return formatGold(n);
}
