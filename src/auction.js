// land-rpg / src/auction.js
// v4.6.0 🔨 급매 경매 — 부동산 탭에서 20분마다 한 건씩 열리는 특수 매물 이벤트.
//
//  · 경매는 20분 블록마다 새 매물이 정해진다(시간 기반 결정론 — 새로고침해도 같은 매물).
//  · 블록 앞 12분이 경매 시간(입찰 가능), 뒤 8분은 '다음 경매 준비' 시간이다.
//  · 입찰가는 시간이 지나면 시세 쪽으로 계단식(연속)으로 올라간다.
//      → 일찍 낙찰할수록 싸고, 늦게 낙찰하면 시세에 가까워진다(경쟁 입찰의 맛).
//  · 낙찰가에는 거래세가 붙지 않고, 매물마다 특별 보너스(특별 임대 계약 · 강화석 · 캐시백)가 따라온다.
//  · 한 경매당 한 번만 낙찰할 수 있고, 결과는 땅.land.auction 에 남는다(세이브 호환).
//
// 순수 계산만 담당(DOM/네트워크 의존 없음) — 헤드리스 검증 가능.
import { CITIES, CITY_BY_KEY, priceInfo, portfolioOf } from './land.js';

export const AUCTION = {
  everyMs: 20 * 60 * 1000, // 20분마다 새 경매
  liveMs: 12 * 60 * 1000, // 그중 12분이 입찰 시간
  discountMin: 0.3, // 최저 입찰가 할인(시세 대비)
  discountMax: 0.45,
  targetMin: 45000, // 매물 규모(골드) — 이 예산에 맞춰 평수를 정한다
  targetMax: 120000,
  qtyByTier: [30, 20, 10], // 군·시·구 최대 평수
  leasePct: 25, // 특별 임대 계약 — 그 지역 임대수익 영구 +25%
  shardBase: 40,
  shardPerTier: 30,
  shardVar: 30,
  cashPct: 15, // 낙찰가의 15% 캐시백
  logMax: 6,
};

const num = (v, d = 0) => {
  if (typeof v === 'number' && isFinite(v)) return v;
  const n = Number(v);
  return isFinite(n) ? n : d;
};

const hashStr = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
};
const seeded = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

/** 지금 시각이 속한 경매 블록 번호 */
export function auctionBlockOf(now = Date.now()) {
  return Math.floor(Math.max(1, Number(now) || 0) / AUCTION.everyMs);
}

export const BONUS_KINDS = ['lease', 'shards', 'cash'];

/** 보너스 표기 — "🏷️ 특별 임대 +25% 영구" */
export function auctionBonusText(kind, value) {
  const v = Math.max(0, Math.round(Number(value) || 0));
  if (kind === 'lease') return `🏷️ 특별 임대 +${v}% 영구`;
  if (kind === 'shards') return `💎 강화석 +${v.toLocaleString()}`;
  if (kind === 'cash') return `💰 낙찰가 ${v}% 캐시백`;
  return '';
}

/**
 * 그 시각의 경매 매물 — 모든 기기가 같은 순간 같은 매물을 본다.
 * @returns {{block:number,start:number,endsAt:number,key:string,city:object,qty:number,
 *   basePrice:number,marketValue:number,startBid:number,discountPct:number,
 *   bonusKind:string,bonusValue:number,bonusText:string}}
 */
export function auctionLot(now = Date.now()) {
  const block = auctionBlockOf(now);
  const start = block * AUCTION.everyMs;
  const seed = hashStr(`land-auction:${block}`);
  const city = CITIES[Math.floor(seeded(seed) * CITIES.length) % CITIES.length] || CITIES[0];
  // 매물 시세는 블록 시작 시점 기준으로 고정 — 경매 중에 기준가가 흔들리지 않는다
  const basePrice = Math.max(1, priceInfo(city, start).price);
  const target = AUCTION.targetMin + seeded(seed + 1) * (AUCTION.targetMax - AUCTION.targetMin);
  const tierQty = AUCTION.qtyByTier[city.tier] || AUCTION.qtyByTier[1];
  const qty = Math.max(1, Math.min(tierQty, Math.floor(target / basePrice)));
  const discount = AUCTION.discountMin + seeded(seed + 2) * (AUCTION.discountMax - AUCTION.discountMin);
  const marketValue = Math.max(1, Math.round(basePrice * qty));
  const startBid = Math.max(1, Math.round(marketValue * (1 - discount)));
  const r = seeded(seed + 3);
  const bonusKind = r < 0.4 ? 'lease' : r < 0.7 ? 'shards' : 'cash';
  let bonusValue = 0;
  if (bonusKind === 'lease') bonusValue = AUCTION.leasePct;
  else if (bonusKind === 'shards') {
    bonusValue = Math.round(AUCTION.shardBase + city.tier * AUCTION.shardPerTier + seeded(seed + 4) * AUCTION.shardVar);
  } else bonusValue = AUCTION.cashPct; // % — 낙찰 시점 입찰가 기준으로 환급
  return {
    block,
    start,
    endsAt: start + AUCTION.liveMs,
    key: city.key,
    city,
    qty,
    basePrice,
    marketValue,
    startBid,
    discountPct: Math.round((1 - startBid / marketValue) * 100),
    bonusKind,
    bonusValue,
    bonusText: auctionBonusText(bonusKind, bonusValue),
  };
}

/**
 * 지금 경매 상태(가격·남은 시간·낙찰 여부).
 * @param {object} state 통합 상태
 * @param {number} [now]
 */
export function auctionStatus(state, now = Date.now()) {
  const t = Number(now) || 0;
  const lot = auctionLot(t);
  const st = (state && state.land && state.land.auction) || null;
  const elapsed = Math.max(0, t - lot.start);
  const live = elapsed < AUCTION.liveMs;
  const done = !!(st && Math.floor(num(st.done, -1)) === lot.block);
  const progress = live ? Math.min(1, elapsed / AUCTION.liveMs) : 1;
  // 입찰가는 최저가 → 시세까지 오른다(경쟁 입찰). 시간이 지날수록 싸게 살 수 없다.
  // v5.12 영지 성채 '거래소 본부' 경매 할인(-1.5%/Lv, 최대 -15%)
  const exLv = Math.max(0, Math.min(10, Math.floor(Number(state && state.citadel && state.citadel.levels && state.citadel.levels.exchange) || 0)));
  const citDisc = 1 - Math.min(0.15, exLv * 0.015);
  const rawPrice = live
    ? Math.max(lot.startBid, Math.round(lot.startBid + (lot.marketValue - lot.startBid) * progress))
    : lot.marketValue;
  const price = Math.max(1, Math.round(rawPrice * citDisc));
  const discountPct = Math.round((1 - price / lot.marketValue) * 100);
  const leftMs = live ? Math.max(0, AUCTION.liveMs - elapsed) : 0;
  // 다음 경매(다음 20분 블록)까지 — 낙찰 완료·준비 시간 모두 같은 기준으로 센다
  const nextMs = Math.max(0, AUCTION.everyMs - elapsed);
  return {
    block: lot.block,
    lot,
    live,
    done,
    phase: done ? 'done' : live ? 'live' : 'gap',
    price,
    discountPct,
    progress,
    leftMs,
    nextMs,
    canBid: live && !done,
    log: st && Array.isArray(st.log) ? st.log : [],
    totals: {
      bids: st ? Math.max(0, Math.floor(num(st.bids))) : 0,
      spend: st ? Math.max(0, num(st.spend)) : 0,
      saved: st ? Math.max(0, num(st.saved)) : 0,
    },
  };
}

/**
 * 낙찰 견적 — 골드·잔여 공급·경매 시간을 확인한다.
 * @returns {{ok:boolean, reason?:string, price?:number, need?:number, gold?:number, ...}}
 */
export function bidQuote(state, now = Date.now()) {
  const s = state || {};
  const a = auctionStatus(s, now);
  const lot = a.lot;
  const gold = Math.max(0, num(s.gold));
  const held = Math.floor(num((((s.land || {}).owned) || {})[lot.key]));
  const remaining = Math.max(0, lot.city.supply - held);
  const base = { lot, block: a.block, price: a.price, gold, held, remaining, bonusKind: lot.bonusKind, bonusValue: lot.bonusValue };
  if (a.done) return { ok: false, reason: '이번 경매는 이미 낙찰했습니다. 다음 매물을 기다려 주세요.', done: true, ...base };
  if (!a.live) return { ok: false, reason: '지금은 경매 시간이 아닙니다. 다음 경매를 기다려 주세요.', closed: true, ...base };
  if (lot.qty > remaining) return { ok: false, reason: `잔여 공급이 부족합니다. (최대 ${remaining.toLocaleString()}평)`, ...base };
  if (gold < a.price) return { ok: false, reason: `골드가 부족합니다. (필요 💰${a.price.toLocaleString()})`, need: a.price, ...base };
  return { ok: true, ...base, after: gold - a.price };
}

/**
 * 낙찰 실행 — 골드를 내고 매물(평수)을 받는다. 보너스도 즉시 적용.
 * state 를 제자리에서 갱신한다. 거래세는 붙지 않는다(특수 매물).
 * @returns {{ok:boolean, reason?:string, ...}}
 */
export function applyAuctionBid(state, now = Date.now()) {
  const q = bidQuote(state, now);
  if (!q.ok) return q;
  const s = state;
  const land = s.land;
  const lot = q.lot;
  const held = Math.floor(num(land.owned[lot.key]));
  s.gold = Math.floor(num(s.gold) - q.price);
  land.owned[lot.key] = held + lot.qty;
  land.totalCost[lot.key] = num(land.totalCost[lot.key]) + q.price;
  land.tradeCount = Math.floor(num(land.tradeCount)) + 1;

  // ── 특별 보너스 ──
  let bonusGiven = '';
  if (lot.bonusKind === 'lease') {
    if (!land.lease || typeof land.lease !== 'object') land.lease = {};
    const before = Math.max(0, num(land.lease[lot.key]));
    land.lease[lot.key] = Math.min(60, Math.round((before + lot.bonusValue) * 10) / 10);
    bonusGiven = `특별 임대 +${Math.round((land.lease[lot.key] - before) * 10) / 10}% (누적 ${land.lease[lot.key]}%)`;
  } else if (lot.bonusKind === 'shards') {
    s.shards = Math.floor(num(s.shards) + lot.bonusValue);
    bonusGiven = `강화석 +${lot.bonusValue}`;
  } else if (lot.bonusKind === 'cash') {
    const back = Math.max(0, Math.round(q.price * (lot.bonusValue / 100)));
    s.gold = Math.floor(num(s.gold) + back);
    bonusGiven = `캐시백 +${back.toLocaleString()}골드`;
  }

  if (!land.auction || typeof land.auction !== 'object') {
    land.auction = { done: -1, bids: 0, spend: 0, saved: 0, log: [] };
  }
  const saved = Math.max(0, lot.marketValue - q.price);
  land.auction.done = lot.block;
  land.auction.bids = Math.max(0, Math.floor(num(land.auction.bids))) + 1;
  land.auction.spend = Math.max(0, num(land.auction.spend)) + q.price;
  land.auction.saved = Math.max(0, num(land.auction.saved)) + saved;
  const log = Array.isArray(land.auction.log) ? land.auction.log.slice(0, AUCTION.logMax - 1) : [];
  log.unshift({
    at: now,
    block: lot.block,
    key: lot.key,
    name: lot.city.name,
    qty: lot.qty,
    price: q.price,
    market: lot.marketValue,
    saved,
    bonusKind: lot.bonusKind,
    bonusText: lot.bonusText,
  });
  land.auction.log = log.slice(0, AUCTION.logMax);

  const p = portfolioOf(s, now);
  const history = Array.isArray(land.assetHistory) ? land.assetHistory.slice(-288) : [];
  const lastT = history.length ? num(history[history.length - 1].t) : 0;
  if (now - lastT >= 60000) history.push({ t: now, v: Math.floor(p.totalAsset) });
  land.assetHistory = history;
  land.bestAsset = Math.max(num(land.bestAsset), Math.floor(p.totalAsset));

  return {
    ok: true,
    block: lot.block,
    key: lot.key,
    city: lot.city,
    qty: lot.qty,
    price: q.price,
    marketValue: lot.marketValue,
    saved,
    discountPct: Math.round((1 - q.price / lot.marketValue) * 100),
    bonusKind: lot.bonusKind,
    bonusValue: lot.bonusValue,
    bonusText: lot.bonusText,
    bonusGiven,
    held: land.owned[lot.key],
    gold: s.gold,
    shards: s.shards,
  };
}

/* ─────────────── 저장 정규화 ─────────────── */
export function defaultAuctionState() {
  return { done: -1, bids: 0, spend: 0, saved: 0, log: [] };
}

/** v4.5 이전 저장본의 land.auction → 기본값. 손상 값은 잘라 낸다 */
export function normalizeAuctionState(v) {
  const d = defaultAuctionState();
  if (!v || typeof v !== 'object') return d;
  const out = { ...d };
  out.done = Math.max(-1, Math.floor(num(v.done, -1)));
  out.bids = Math.max(0, Math.floor(num(v.bids)));
  out.spend = Math.max(0, num(v.spend));
  out.saved = Math.max(0, num(v.saved));
  const log = Array.isArray(v.log) ? v.log : [];
  out.log = log
    .filter((e) => e && typeof e === 'object' && typeof e.key === 'string' && CITY_BY_KEY[e.key])
    .slice(0, AUCTION.logMax)
    .map((e) => ({
      at: Math.max(0, num(e.at)),
      block: Math.max(0, Math.floor(num(e.block))),
      key: e.key,
      name: CITY_BY_KEY[e.key].name,
      qty: Math.max(0, Math.floor(num(e.qty))),
      price: Math.max(0, num(e.price)),
      market: Math.max(0, num(e.market)),
      saved: Math.max(0, num(e.saved)),
      bonusKind: BONUS_KINDS.includes(e.bonusKind) ? e.bonusKind : 'lease',
      bonusText: typeof e.bonusText === 'string' ? e.bonusText.slice(0, 40) : '',
    }));
  return out;
}
