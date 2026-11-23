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
  seasonMs: 6 * 3600 * 1000, // 계절 특성 6시간 로테이션
  seasonChance: 0.2,
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

  return {
    price,
    daily: Math.round(daily),
    trend: daily > 0 ? ((price - daily) / daily) * 100 : 0,
    swingPct: amp * 100,
    season,
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
export function incomePerMinOf(city, qty, ownedQty = qty, now = Date.now()) {
  if (!city || !(qty > 0)) return 0;
  return qty * city.rentPerMin * incomeTraitMod(city, now) * ownershipMult(ownedQty, city.supply);
}

/* ─────────────── 통합 상태의 land 부분 기본값 ─────────────── */
export function defaultLand(now = Date.now()) {
  return {
    owned: {}, // { cityKey: pyeong }
    totalCost: {}, // { cityKey: 골드 }
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

/* ─────────────── 포트폴리오 ─────────────── */
/** 통합 상태 → 화면/계산용 요약 (골드 기준) */
export function portfolioOf(state, now = Date.now()) {
  const s = state && typeof state === 'object' ? state : {};
  const land = s.land && typeof s.land === 'object' ? s.land : {};
  const gold = Math.max(0, num(s.gold));
  const owned = land.owned && typeof land.owned === 'object' ? land.owned : {};
  const totalCost = land.totalCost && typeof land.totalCost === 'object' ? land.totalCost : {};

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
    const income = incomePerMinOf(city, qty, qty, now);
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
      value: v,
      cost,
      profit: cost > 0 ? v - cost : null,
      incomePerMin: income,
      incomePerHour: income * 60,
      roiPerHour: v > 0 ? (income * 60 * 100) / v : 0,
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
    active: atkPct + hpPct + goldPct + critPct + dropPct > 0,
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
      next: `건물 ${citiesToNext}곳 → 치명타 +${B.critPer}%`,
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
