// land-rpg / src/land.js
// korea-land 부동산 게임 엔진 (순수 함수 · DOM/네트워크 의존 없음).
// - 지역/매물 데이터: src/land-data.js (원본 game.js 에서 자동 추출)
// - 가격: 일일 기준가(09:00 갱신, 원본과 같은 ±30% 밴드) + 시간 기반 결정론 파동
//   ※ v3 싱글모드 원본은 기기마다 시세를 따로 굴리므로 '공유 시세'가 없다.
//     여기서는 같은 데이터·같은 초기가·같은 거래 규칙을 쓰되, 모든 기기가
//     같은 순간 같은 가격을 보도록 시간 기반 결정론 모델을 쓴다.
// - 수익/거래 규칙(수수료 0.01%, 지분 구간별 한계 수익 배율, 오프라인 5%)은 원본과 동일.
import { LAND_TIERS, LAND_TRAITS, TIER_INCOME_MULTS } from './land-data.js';

export const LAND = {
  feeRate: 0.0001, // 거래세 0.01% (원본 confirmTrade 와 동일)
  dailySwing: 0.08, // 일일 기준가 흔들림 ±8%
  swing: 0.12, // 장중 파동 ±12% (지역 특성에 따라 확대)
  band: 0.3, // 일일 기준가 대비 상·하한 ±30% (원본과 동일)
  floorOfBase: 0.3, // 초기가의 30% 절대 하한 (원본과 동일)
  rentOfflineRate: 0.05, // 오프라인 임대 수익 5% (원본 calculateOfflineEarnings 와 동일)
  rentCapHours: 12,
  seasonMs: 6 * 3600 * 1000, // 계절 특성 6시간 로테이션 (원본과 동일)
  seasonChance: 0.2,
};

const DAY = 86400000;
const KST = 9 * 3600000;
const HOUR = 3600000;

/* ─────────────── 도시 인덱스 (원본 ck(t,r,c) 키 그대로) ─────────────── */
export const CITIES = [];
export const CITY_BY_KEY = Object.create(null);

(function buildIndex() {
  LAND_TIERS.forEach((td, ti) => {
    td.regions.forEach((reg, ri) => {
      reg.cities.forEach((city, ci) => {
        const key = `${ti}_${ri}_${ci}`;
        const row = {
          key,
          tier: ti,
          tierLabel: td.label,
          region: reg.name,
          name: city.n,
          emoji: city.e || '🏠',
          base: city.p,
          income: city.i, // 분당 임대수익(평당) — 원작 gameLoop 의 (i/60)/초
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

/* ─────────────── 결정론적 난수 (원작 seededRandom 과 동일) ─────────────── */
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

/** 가격 + 일일 기준가 + 추세(%) */
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

/** 수익 배율: 세무 전략 도시 +20%, 관광 중심 +30% (원작 gameLoop 과 동일) */
export function incomeTraitMod(city, now = Date.now()) {
  let m = 1;
  for (const t of [city.trait, seasonalTraitKey(city, now)]) {
    if (t === 'HIGH_TAX') m *= LAND_TRAITS.HIGH_TAX.mod; // 1.2
    else if (t === 'TOURISM_HUB') m *= LAND_TRAITS.TOURISM_HUB.mod; // 1.3
  }
  return m;
}

/** 보유 수량 전체의 분당 임대수익 (원) */
export function incomePerMinOf(city, qty, ownedQty = qty, now = Date.now()) {
  if (!city || !(qty > 0)) return 0;
  const tierMult = TIER_INCOME_MULTS[city.tier] ?? 1;
  return qty * city.income * tierMult * incomeTraitMod(city, now) * ownershipMult(ownedQty, city.supply);
}

/* ─────────────── 포트폴리오 ─────────────── */
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || d);

/** users/{uid}/state → 화면/계산용 요약 (원본 필드는 건드리지 않음) */
export function portfolioOf(raw, now = Date.now()) {
  const state = raw && typeof raw === 'object' ? raw : {};
  const cash = num(state.cash);
  const owned = state.owned && typeof state.owned === 'object' ? state.owned : {};
  const totalCost = state.totalCost && typeof state.totalCost === 'object' ? state.totalCost : {};

  let landValue = 0;
  let incomePerMin = 0;
  let pyeong = 0;
  let regions = 0;
  const holdings = [];
  const unknown = [];

  for (const [key, qtyRaw] of Object.entries(owned)) {
    const qty = Math.floor(num(qtyRaw));
    if (!(qty > 0)) continue;
    pyeong += qty;
    regions += 1;
    const city = CITY_BY_KEY[key];
    if (!city) {
      unknown.push({ key, qty });
      continue;
    }
    const info = priceInfo(city, now);
    const income = incomePerMinOf(city, qty, qty, now);
    const value = qty * info.price;
    const cost = num(totalCost[key]);
    landValue += value;
    incomePerMin += income;
    holdings.push({
      key,
      city,
      qty,
      price: info.price,
      daily: info.daily,
      trend: info.trend,
      value,
      cost,
      profit: cost > 0 ? value - cost : null,
      incomePerMin: income,
      incomePerHour: income * 60,
      roiPerHour: value > 0 ? (income * 60 * 100) / value : 0,
    });
  }
  holdings.sort((a, b) => b.value - a.value);

  return {
    connected: true,
    nickname: String(state.nickname || ''),
    cash,
    bestAsset: num(state.bestAsset),
    landValue,
    totalAsset: cash + landValue,
    pyeong,
    regions,
    incomePerMin,
    incomePerHour: incomePerMin * 60,
    holdings,
    unknown,
    raw: state,
  };
}

export const EMPTY_PORTFOLIO = {
  connected: false,
  nickname: '',
  cash: 0,
  bestAsset: 0,
  landValue: 0,
  totalAsset: 0,
  pyeong: 0,
  regions: 0,
  incomePerMin: 0,
  incomePerHour: 0,
  holdings: [],
  unknown: [],
  raw: null,
};

/* ─────────────── 거래 ─────────────── */
export function quoteTrade(key, side, qty, state, now = Date.now()) {
  const city = CITY_BY_KEY[key];
  const q = Math.floor(num(qty));
  const raw = state || {};
  const owned = raw.owned && typeof raw.owned === 'object' ? raw.owned : {};
  const held = Math.floor(num(owned[key]));
  if (!city) return { ok: false, reason: '알 수 없는 지역입니다.' };
  if (!(q > 0)) return { ok: false, reason: '수량을 1평 이상 입력해 주세요.' };
  const info = priceInfo(city, now);
  const total = info.price * q;
  const fee = Math.floor(total * LAND.feeRate);
  const cash = num(raw.cash);

  if (side === 'buy') {
    const remaining = Math.max(0, city.supply - held);
    if (q > remaining) return { ok: false, reason: `잔여 공급이 부족합니다. (최대 ${remaining.toLocaleString()}평)`, remaining };
    if (cash < total + fee) {
      return { ok: false, reason: `현금이 부족합니다. (필요 ₩${(total + fee).toLocaleString()})`, need: total + fee, cash };
    }
    return { ok: true, side, city, qty: q, price: info.price, total, fee, net: -(total + fee), after: cash - total - fee, held, remaining };
  }
  if (side === 'sell') {
    if (held < q) return { ok: false, reason: `보유 면적이 부족합니다. (보유 ${held.toLocaleString()}평)`, held };
    return { ok: true, side, city, qty: q, price: info.price, total, fee, net: total - fee, after: cash + total - fee, held, remaining: 0 };
  }
  return { ok: false, reason: '알 수 없는 거래 유형입니다.' };
}

/** 보유/현금 한도 안에서 살 수 있는 최대 평수 */
export function maxBuyQty(key, state, now = Date.now()) {
  const city = CITY_BY_KEY[key];
  if (!city) return 0;
  const raw = state || {};
  const held = Math.floor(num((raw.owned || {})[key]));
  const price = priceOf(city, now);
  const cash = num(raw.cash);
  const bySupply = Math.max(0, city.supply - held);
  const byCash = price > 0 ? Math.floor(cash / (price * (1 + LAND.feeRate))) : 0;
  return Math.max(0, Math.min(bySupply, byCash));
}

/**
 * users/{uid}/state 사본에 매수/매도 반영 (원본 필드는 그대로 보존).
 * 반환: { ok, reason, state, quote } — state 는 새 객체(입력은 변경하지 않음).
 */
export function applyTrade(baseState, key, side, qty, now = Date.now()) {
  const base = baseState && typeof baseState === 'object' ? baseState : {};
  const quote = quoteTrade(key, side, qty, base, now);
  if (!quote.ok) return { ok: false, reason: quote.reason, state: base };

  const q = quote.qty;
  const next = { ...base };
  const owned = { ...(base.owned || {}) };
  const totalCost = { ...(base.totalCost || {}) };
  const held = Math.floor(num(owned[key]));

  // 원작과 같은 방식으로 현금/보유/취득원가/거래세/거래횟수를 갱신
  if (side === 'buy') {
    next.cash = num(base.cash) - quote.total - quote.fee;
    owned[key] = held + q;
    totalCost[key] = num(totalCost[key]) + quote.total;
  } else {
    next.cash = num(base.cash) + quote.total - quote.fee;
    const left = held - q;
    if (left > 0) {
      owned[key] = left;
      // 남은 수량 비율로 취득원가 유지 (원작 confirmTrade 와 동일)
      const cost = num(totalCost[key]);
      if (cost > 0) totalCost[key] = Math.round((cost * left) / held);
    } else {
      delete owned[key];
      delete totalCost[key];
    }
  }
  next.owned = owned;
  next.totalCost = totalCost;
  next.krTax = num(base.krTax) + quote.fee;
  next.tradeCount = Math.floor(num(base.tradeCount)) + 1;

  // 자산 히스토리 (원작: 1분 간격, 최대 288개)
  const prices = portfolioOf(next, now);
  const history = Array.isArray(base.assetHistory) ? base.assetHistory.slice(-288) : [];
  const lastT = history.length ? num(history[history.length - 1].t) : 0;
  if (now - lastT >= 60000) history.push({ t: now, v: Math.floor(prices.totalAsset) });
  next.assetHistory = history;

  // 최고 자산 기록 (원작 bestAsset: 줄지 않음)
  next.bestAsset = Math.max(num(base.bestAsset), Math.floor(prices.totalAsset));

  return { ok: true, state: next, quote };
}

/* ─────────────── 임대 수익 적립 ─────────────── */
/** elapsed(ms) 동안의 임대 수익. rate 1=접속 중, 0.05=오프라인(원작과 동일) */
export function rentAccrual(incomePerMin, elapsedMs, rate = 1) {
  const ms = Math.max(0, Math.min(elapsedMs, LAND.rentCapHours * HOUR));
  return Math.max(0, (num(incomePerMin) / 60000) * ms * Math.max(0, rate));
}

export function formatWon(n) {
  const v = Math.floor(Number(n) || 0);
  if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(2)}조`;
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(2)}억`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
  return v.toLocaleString('ko-KR');
}
