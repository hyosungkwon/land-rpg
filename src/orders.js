// land-rpg / src/orders.js
// v6.0.0 📈 투자 대시보드(자산 추이·수익 분석) · 🎯 지정가 예약 매매(자동 체결).
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
import { CITY_BY_KEY, priceInfo, portfolioOf, applyTrade } from './land.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);

export const LIMIT_ORDER_MAX = 8;
export const LIMIT_LOG_MAX = 10;
export const ASSET_SNAP_MS = 5 * 60 * 1000; // 5분마다 자산 스냅샷 자동 기록

/** 지정가 주문·체결 로그 정규화 */
export function normalizeOrders(rawOrders, rawLog) {
  const orders = [];
  if (Array.isArray(rawOrders)) {
    for (const o of rawOrders) {
      if (orders.length >= LIMIT_ORDER_MAX) break;
      if (!o || typeof o !== 'object') continue;
      const cityKey = typeof o.cityKey === 'string' && CITY_BY_KEY[o.cityKey] ? o.cityKey : '';
      const side = o.side === 'sell' ? 'sell' : o.side === 'buy' ? 'buy' : '';
      const targetPrice = Math.max(1, Math.floor(num(o.targetPrice, 0)));
      const qty = Math.max(1, Math.floor(num(o.qty, 0)));
      if (!cityKey || !side || !(targetPrice > 0) || !(qty > 0)) continue;
      orders.push({
        id: typeof o.id === 'string' && o.id ? o.id.slice(0, 32) : `ord_${orders.length}_${Math.floor(num(o.createdAt, 0))}`,
        cityKey,
        side,
        targetPrice,
        qty,
        createdAt: Math.max(0, Math.floor(num(o.createdAt, 0))),
      });
    }
  }
  const orderLog = [];
  if (Array.isArray(rawLog)) {
    for (const row of rawLog.slice(0, LIMIT_LOG_MAX)) {
      if (!row || typeof row !== 'object') continue;
      orderLog.push({
        at: Math.max(0, Math.floor(num(row.at, 0))),
        cityKey: typeof row.cityKey === 'string' ? row.cityKey : '',
        cityName: typeof row.cityName === 'string' ? row.cityName.slice(0, 24) : '',
        side: row.side === 'sell' ? 'sell' : 'buy',
        qty: Math.max(1, Math.floor(num(row.qty, 1))),
        price: Math.max(1, Math.floor(num(row.price, 1))),
        total: Math.max(0, Math.floor(num(row.total, 0))),
      });
    }
  }
  return { orders, orderLog };
}

/** 지정가 예약 주문 등록 */
export function addLimitOrder(state, { cityKey, side, targetPrice, qty }, now = Date.now()) {
  if (!state || !state.land) return { ok: false, reason: '잘못된 상태입니다.' };
  const city = CITY_BY_KEY[cityKey];
  if (!city) return { ok: false, reason: '알 수 없는 지역입니다.' };
  if (side !== 'buy' && side !== 'sell') return { ok: false, reason: '매수 또는 매도를 선택해 주세요.' };
  const tp = Math.floor(num(targetPrice, 0));
  const q = Math.floor(num(qty, 0));
  if (!(tp > 0)) return { ok: false, reason: '목표가는 1골드 이상이어야 합니다.' };
  if (!(q > 0)) return { ok: false, reason: '수량은 1평 이상이어야 합니다.' };
  if (!Array.isArray(state.land.orders)) state.land.orders = [];
  if (state.land.orders.length >= LIMIT_ORDER_MAX) {
    return { ok: false, reason: `지정가 주문은 최대 ${LIMIT_ORDER_MAX}건까지 등록할 수 있습니다.` };
  }
  if (side === 'sell') {
    const held = Math.floor(num((state.land.owned || {})[cityKey], 0));
    if (held < 1) return { ok: false, reason: '보유 중인 매물만 지정가 매도를 걸 수 있습니다.' };
  }
  const order = {
    id: `ord_${Math.floor(now)}_${state.land.orders.length}_${Math.floor(Math.random() * 1000)}`,
    cityKey,
    side,
    targetPrice: tp,
    qty: q,
    createdAt: Math.floor(now),
  };
  state.land.orders.push(order);
  return { ok: true, order, city };
}

/** 지정가 주문 취소 */
export function cancelLimitOrder(state, orderId) {
  const list = state && state.land && Array.isArray(state.land.orders) ? state.land.orders : [];
  const idx = list.findIndex((x) => x && x.id === orderId);
  if (idx < 0) return { ok: false, reason: '해당 주문을 찾을 수 없습니다.' };
  const [removed] = list.splice(idx, 1);
  return { ok: true, order: removed, city: CITY_BY_KEY[removed.cityKey] || null };
}

/**
 * 지정가 예약 매매 자동 점검 및 체결 실행.
 *  - 매수: 현재 시세 <= 목표가 && 골드 충분 시 자동 체결
 *  - 매도: 현재 시세 >= 목표가 && 보유 평수 >= 1 시 자동 체결(보유량 한도)
 */
export function processLimitOrders(state, now = Date.now()) {
  const list = state && state.land && Array.isArray(state.land.orders) ? state.land.orders : [];
  if (!list.length) return [];
  if (!Array.isArray(state.land.orderLog)) state.land.orderLog = [];
  const executed = [];
  const keep = [];
  for (const o of list) {
    const city = o && CITY_BY_KEY[o.cityKey];
    if (!city) continue;
    const info = priceInfo(city, now);
    const curPrice = info.price;
    const hit = o.side === 'buy' ? curPrice <= o.targetPrice : curPrice >= o.targetPrice;
    if (!hit) {
      keep.push(o);
      continue;
    }
    let execQty = o.qty;
    if (o.side === 'sell') {
      const held = Math.floor(num((state.land.owned || {})[o.cityKey], 0));
      if (held < 1) continue; // 이미 전량 매도된 경우 주문 정리
      execQty = Math.min(execQty, held);
    }
    const r = applyTrade(state, o.cityKey, o.side, execQty, now);
    if (r && r.ok) {
      const rec = {
        at: Math.floor(now),
        cityKey: o.cityKey,
        cityName: city.name,
        side: o.side,
        qty: execQty,
        price: r.price,
        total: r.total,
      };
      state.land.orderLog.unshift(rec);
      if (state.land.orderLog.length > LIMIT_LOG_MAX) state.land.orderLog.length = LIMIT_LOG_MAX;
      executed.push({ ...rec, order: o, city, fee: r.fee });
    } else {
      // 골드 부족 등 일시적 미체결이면 주문을 유지한다
      keep.push(o);
    }
  }
  state.land.orders = keep;
  return executed;
}

/** 5분 주기 자산 추이 스냅샷 기록 (최대 288칸 = 24시간) */
export function recordAssetSnapshot(state, now = Date.now()) {
  if (!state || !state.land) return false;
  if (!Array.isArray(state.land.assetHistory)) state.land.assetHistory = [];
  const hist = state.land.assetHistory;
  const last = hist.length ? hist[hist.length - 1] : null;
  if (last && now - num(last.t, 0) < ASSET_SNAP_MS) return false;
  const p = portfolioOf(state, now);
  const val = Math.floor(p.totalAsset);
  hist.push({ t: Math.floor(now), v: val });
  if (hist.length > 288) hist.splice(0, hist.length - 288);
  state.land.bestAsset = Math.max(num(state.land.bestAsset, 0), val);
  return true;
}

/** 📈 투자 대시보드 & 사냥/임대 수익 분석 리포트 */
export function investmentReport(state, now = Date.now()) {
  const p = portfolioOf(state, now);
  const huntGold = Math.max(0, Math.floor(num(state && state.records && state.records.totalGold, 0)));
  const rentGold = Math.max(0, Math.floor(num(state && state.land && state.land.totalRentClaimed, 0)));
  const totalEarned = huntGold + rentGold;
  const huntPct = totalEarned > 0 ? Math.round((huntGold / totalEarned) * 100) : 50;
  const rentPct = totalEarned > 0 ? 100 - huntPct : 50;

  let totalCost = 0;
  let totalHoldVal = 0;
  for (const h of p.holdings) {
    if (h.cost > 0) {
      totalCost += h.cost;
      totalHoldVal += h.value;
    }
  }
  const unrealizedPnl = totalCost > 0 ? Math.round(totalHoldVal - totalCost) : 0;
  const unrealizedPct = totalCost > 0 ? Math.round(((totalHoldVal - totalCost) / totalCost) * 1000) / 10 : 0;

  const rawHist = (state && state.land && Array.isArray(state.land.assetHistory)) ? state.land.assetHistory : [];
  const series = rawHist
    .filter((pt) => pt && isFinite(pt.t) && isFinite(pt.v))
    .slice(-48)
    .map((pt) => ({ t: pt.t, v: Math.max(0, Math.floor(pt.v)) }));
  const curVal = Math.floor(p.totalAsset);
  if (!series.length || series[series.length - 1].v !== curVal) {
    series.push({ t: Math.floor(now), v: curVal });
  }
  const deltaAsset = series.length >= 2 ? series[series.length - 1].v - series[0].v : 0;
  const deltaPct = series.length >= 2 && series[0].v > 0
    ? Math.round((deltaAsset / series[0].v) * 1000) / 10
    : 0;

  const topHoldings = p.holdings
    .filter((h) => h.profitPct != null)
    .slice()
    .sort((a, b) => (b.profit || 0) - (a.profit || 0))
    .slice(0, 3);

  const orders = (state && state.land && Array.isArray(state.land.orders) ? state.land.orders : []).map((o) => {
    const city = CITY_BY_KEY[o.cityKey];
    const info = city ? priceInfo(city, now) : { price: 0, bandLabel: '보통' };
    const diffPct = info.price > 0 ? Math.round(((o.targetPrice - info.price) / info.price) * 1000) / 10 : 0;
    return { ...o, city, curPrice: info.price, bandLabel: info.bandLabel, diffPct };
  }).filter((o) => !!o.city);

  return {
    totalAsset: p.totalAsset,
    cash: p.gold,
    landValue: p.landValue,
    bestAsset: Math.max(num(state && state.land && state.land.bestAsset, 0), p.totalAsset),
    incomePerHour: p.incomePerHour,
    huntGold,
    rentGold,
    huntPct,
    rentPct,
    totalCost,
    unrealizedPnl,
    unrealizedPct,
    series,
    deltaAsset,
    deltaPct,
    topHoldings,
    orders,
    orderLog: (state && state.land && Array.isArray(state.land.orderLog)) ? state.land.orderLog.slice(0, 5) : [],
  };
}
