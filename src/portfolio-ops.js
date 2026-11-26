// land-rpg / src/portfolio-ops.js
// v6.3.0 ⚡ 원탭 부동산 포트폴리오 분산 투자 · 🏛️ 랜드마크 일괄 증축.
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
import {
  CITIES, LAND, LANDMARK, priceInfo, quoteTrade, applyTrade,
  landmarkLevel, landmarkQuote, buildLandmark,
} from './land.js';
import { citySetId, regionSetStatus } from './region.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);

export const AUTO_INVEST_MODES = {
  region: { id: 'region', icon: '🗺️', title: '권역 세트 채우기', desc: '완성에 가장 가까운 권역의 미보유 지역을 3평씩 일괄 매수' },
  roi:    { id: 'roi',    icon: '💰', title: '임대 ROI TOP 5 분산', desc: '회수 속도가 가장 빠른 상위 5개 지역에 분산 매수' },
  dip:    { id: 'dip',    icon: '📉', title: '저점 급락 매물 매수', desc: '일일 밴드 하위 30% 저점 매물 상위 5곳에 분산 매수' },
};

/** 원탭 분산 투자 견적 생성 (실제 매수는 하지 않음) */
export function planAutoInvest(state, mode = 'roi', budgetRatio = 0.85, now = Date.now()) {
  const meta = AUTO_INVEST_MODES[mode];
  if (!state || !meta) return { ok: false, reason: '알 수 없는 투자 전략입니다.' };
  const gold = Math.max(0, Math.floor(num(state.gold, 0)));
  const budget = Math.floor(gold * Math.min(1, Math.max(0.1, Number(budgetRatio) || 0.85)));
  if (budget < 100) return { ok: false, reason: '투자 가능한 골드가 부족합니다.' };

  const owned = (state.land && state.land.owned) || {};
  const feeMult = 1 + LAND.feeRate;
  const items = [];
  let left = budget;

  if (mode === 'region') {
    const sets = regionSetStatus(owned)
      .filter((st) => !st.complete)
      .sort((a, b) => (b.held / Math.max(1, b.maxNeed)) - (a.held / Math.max(1, a.maxNeed)));
    if (!sets.length) return { ok: false, reason: '모든 권역 세트를 이미 완성했습니다!' };
    const targetSet = sets[0];
    const candidates = CITIES
      .filter((c) => citySetId(c.key) === targetSet.id && Math.floor(num(owned[c.key], 0)) < 3)
      .map((c) => ({ c, info: priceInfo(c, now) }))
      .sort((a, b) => a.info.price - b.info.price);
    for (const { c, info } of candidates) {
      const held = Math.floor(num(owned[c.key], 0));
      const needQty = Math.max(1, 3 - held);
      const remain = Math.max(0, c.supply - held);
      const qty = Math.min(needQty, remain);
      if (qty < 1) continue;
      const q = quoteTrade(c.key, 'buy', qty, { ...state, gold: left }, now);
      if (!q.ok) continue;
      items.push({ city: c, key: c.key, qty, price: q.price, total: q.total, fee: q.fee, cost: q.total + q.fee, note: targetSet.name });
      left -= q.total + q.fee;
      if (items.length >= 10) break;
    }
    if (!items.length) return { ok: false, reason: `${targetSet.name} 매수에 필요한 골드가 부족합니다.` };
  } else {
    let pool = CITIES.map((c) => {
      const info = priceInfo(c, now);
      const held = Math.floor(num(owned[c.key], 0));
      const remain = Math.max(0, c.supply - held);
      const hourly = c.rentPerMin * 60;
      const payback = hourly > 0 ? info.price / hourly : 99999;
      return { c, info, held, remain, payback };
    }).filter((x) => x.remain > 0 && x.info.price * feeMult <= budget);

    if (mode === 'dip') {
      const dips = pool.filter((x) => (x.info.bandPos != null ? x.info.bandPos : 0.5) <= 0.30);
      pool = (dips.length ? dips : pool).sort((a, b) => (a.info.bandPos || 0.5) - (b.info.bandPos || 0.5) || a.payback - b.payback);
    } else {
      pool.sort((a, b) => a.payback - b.payback || a.info.price - b.info.price);
    }

    const picks = pool.slice(0, 5);
    if (!picks.length) return { ok: false, reason: '예산 안에서 매수 가능한 매물이 없습니다.' };
    const perSlot = Math.floor(budget / picks.length);
    for (const p of picks) {
      const unitCost = Math.max(1, Math.ceil(p.info.price * feeMult));
      const qty = Math.min(p.remain, Math.floor(Math.min(left, Math.max(perSlot, unitCost)) / unitCost));
      if (qty < 1) continue;
      const q = quoteTrade(p.c.key, 'buy', qty, { ...state, gold: left }, now);
      if (!q.ok) continue;
      items.push({ city: p.c, key: p.c.key, qty, price: q.price, total: q.total, fee: q.fee, cost: q.total + q.fee, note: p.info.bandLabel || '보통' });
      left -= q.total + q.fee;
    }
    if (!items.length) return { ok: false, reason: '예산 안에서 분산 매수할 수 있는 매물이 없습니다.' };
  }

  const totalSpend = items.reduce((a, x) => a + x.cost, 0);
  const totalFee = items.reduce((a, x) => a + x.fee, 0);
  const totalPyeong = items.reduce((a, x) => a + x.qty, 0);
  return {
    ok: true,
    mode,
    meta,
    items,
    count: items.length,
    totalPyeong,
    totalSpend,
    totalFee,
    afterGold: Math.max(0, gold - totalSpend),
  };
}

/** 원탭 분산 투자 실행 */
export function executeAutoInvest(state, mode = 'roi', budgetRatio = 0.85, now = Date.now()) {
  const plan = planAutoInvest(state, mode, budgetRatio, now);
  if (!plan.ok) return plan;
  const fills = [];
  let totalSpend = 0;
  let totalPyeong = 0;
  for (const it of plan.items) {
    const r = applyTrade(state, it.key, 'buy', it.qty, now);
    if (r && r.ok) {
      fills.push({ city: it.city, qty: it.qty, cost: r.total + r.fee });
      totalSpend += r.total + r.fee;
      totalPyeong += it.qty;
    }
  }
  if (!fills.length) return { ok: false, reason: '매수를 체결하지 못했습니다.' };
  return { ok: true, mode, meta: plan.meta, count: fills.length, totalPyeong, totalSpend, fills };
}

/** 🏛️ 랜드마크 일괄 증축 견적(저렴한 곳부터 가능한 만큼) */
export function planBulkLandmarks(state, now = Date.now()) {
  if (!state || !state.land) return { ok: false, count: 0, items: [], totalSpend: 0, reason: '잘못된 상태입니다.' };
  const owned = state.land.owned || {};
  let left = Math.max(0, Math.floor(num(state.gold, 0)));
  const candidates = [];
  for (const [key, qtyRaw] of Object.entries(owned)) {
    const qty = Math.floor(num(qtyRaw, 0));
    if (qty < LANDMARK.minPyeong) continue;
    const lv = landmarkLevel(state, key);
    if (lv >= LANDMARK.maxLevel) continue;
    const q = landmarkQuote({ ...state, gold: 1e15 }, key, now);
    if (q && q.ok) candidates.push({ key, city: q.city, lv, next: q.next, name: q.name, icon: q.icon, cost: q.cost });
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const items = [];
  for (const c of candidates) {
    if (left < c.cost) break;
    items.push(c);
    left -= c.cost;
    if (items.length >= 25) break;
  }
  const totalSpend = items.reduce((a, x) => a + x.cost, 0);
  if (!items.length) {
    return { ok: false, count: 0, items: [], totalSpend: 0, reason: '지금 골드로 증축 가능한 랜드마크가 없습니다.' };
  }
  return {
    ok: true,
    count: items.length,
    items,
    totalSpend,
    afterGold: Math.max(0, Math.floor(num(state.gold, 0)) - totalSpend),
  };
}

/** 🏛️ 랜드마크 일괄 증축 실행 */
export function executeBulkLandmarks(state, now = Date.now()) {
  const plan = planBulkLandmarks(state, now);
  if (!plan.ok) return plan;
  const results = [];
  let totalSpend = 0;
  for (const it of plan.items) {
    const r = buildLandmark(state, it.key, now);
    if (r && r.ok) {
      results.push(r);
      totalSpend += r.spent;
    }
  }
  if (!results.length) return { ok: false, reason: '증축을 실행하지 못했습니다.' };
  return { ok: true, count: results.length, totalSpend, results };
}
