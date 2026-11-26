// land-rpg / src/bank.js
// v6.8.0 🏦 영지 은행(정기 예금 · 복리 이자) · 🏗️ 전국 메가 프로젝트 4종(국가 인프라, 환생 영구 유지).
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
import { birthState } from './rebirth.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);

/* ────────────────────────────── 🏦 영지 은행 ────────────────────────────── */
export const BANK_MAX_SLOTS = 3;
export const BANK_PLANS = [
  { key: 'short', label: '1시간', title: '단기 예금', ms: 1 * 3600 * 1000,  ratePct: 8,  minGold: 10000 },
  { key: 'mid',   label: '4시간', title: '중기 예금', ms: 4 * 3600 * 1000,  ratePct: 22, minGold: 50000 },
  { key: 'long',  label: '12시간', title: '장기 예금', ms: 12 * 3600 * 1000, ratePct: 50, minGold: 150000 },
];
export const BANK_PLAN_BY_KEY = BANK_PLANS.reduce((m, p) => { m[p.key] = p; return m; }, {});

export function defaultBank() {
  return {
    deposits: [], // [{ id, planKey, principal, ratePct, startedAt, maturesAt }]
    totalInterest: 0,
    count: 0,
  };
}

export function normalizeBank(raw) {
  const d = defaultBank();
  if (!raw || typeof raw !== 'object') return d;
  const list = Array.isArray(raw.deposits) ? raw.deposits : [];
  const deposits = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const plan = BANK_PLAN_BY_KEY[x.planKey];
    const principal = Math.floor(num(x.principal, 0));
    const startedAt = Math.floor(num(x.startedAt, 0));
    const maturesAt = Math.floor(num(x.maturesAt, startedAt + (plan ? plan.ms : 3600000)));
    if (!plan || principal <= 0) continue;
    deposits.push({
      id: typeof x.id === 'string' && x.id ? x.id.slice(0, 24) : `dep_${deposits.length + 1}_${startedAt}`,
      planKey: plan.key,
      principal,
      ratePct: plan.ratePct,
      startedAt,
      maturesAt: Math.max(startedAt + 1000, maturesAt),
    });
    if (deposits.length >= BANK_MAX_SLOTS) break;
  }
  return {
    deposits,
    totalInterest: Math.max(0, Math.floor(num(raw.totalInterest, 0))),
    count: Math.max(0, Math.floor(num(raw.count, 0))),
  };
}

export function bankStatus(state, now = Date.now()) {
  const b = (state && state.bank) || defaultBank();
  const list = Array.isArray(b.deposits) ? b.deposits : [];
  let readyCount = 0;
  let totalPrincipal = 0;
  const slots = list.map((dep) => {
    const plan = BANK_PLAN_BY_KEY[dep.planKey] || BANK_PLANS[0];
    const span = Math.max(1, dep.maturesAt - dep.startedAt);
    const leftMs = Math.max(0, dep.maturesAt - now);
    const pct = Math.max(0, Math.min(1, (now - dep.startedAt) / span));
    const ready = leftMs <= 0;
    if (ready) readyCount += 1;
    totalPrincipal += dep.principal;
    const interest = Math.round(dep.principal * (dep.ratePct / 100));
    return { ...dep, plan, leftMs, pct, ready, interest, payout: dep.principal + interest };
  });
  return {
    slots,
    maxSlots: BANK_MAX_SLOTS,
    readyCount,
    totalPrincipal,
    totalInterest: Math.max(0, Math.floor(num(b.totalInterest, 0))),
    count: Math.max(0, Math.floor(num(b.count, 0))),
  };
}

/** 정기 예금 개설 (amountOrRatio <= 1 이면 보유 골드 비율, > 1 이면 고정 금액) */
export function openDeposit(state, planKey, amountOrRatio = 0.5, now = Date.now()) {
  if (!state) return { ok: false, reason: '상태 정보가 없습니다.' };
  const plan = BANK_PLAN_BY_KEY[planKey];
  if (!plan) return { ok: false, reason: '알 수 없는 예금 상품입니다.' };
  if (!state.bank || typeof state.bank !== 'object') state.bank = defaultBank();
  if (!Array.isArray(state.bank.deposits)) state.bank.deposits = [];
  if (state.bank.deposits.length >= BANK_MAX_SLOTS) {
    return { ok: false, reason: `예금은 최대 ${BANK_MAX_SLOTS}계좌까지 동시에 보유할 수 있습니다.` };
  }
  const gold = Math.max(0, Math.floor(num(state.gold, 0)));
  const rawAmt = Number(amountOrRatio);
  const principal = rawAmt > 0 && rawAmt <= 1 ? Math.floor(gold * rawAmt) : Math.floor(rawAmt);
  if (principal < plan.minGold) {
    return { ok: false, reason: `${plan.title} 최소 예치금은 💰${plan.minGold.toLocaleString()}입니다.` };
  }
  if (principal > gold) {
    return { ok: false, reason: '보유 골드가 부족합니다.' };
  }
  state.gold = Math.max(0, gold - principal);
  const slot = {
    id: `dep_${Math.floor(now)}_${state.bank.deposits.length + 1}`,
    planKey: plan.key,
    principal,
    ratePct: plan.ratePct,
    startedAt: Math.floor(now),
    maturesAt: Math.floor(now) + plan.ms,
  };
  state.bank.deposits.push(slot);
  return { ok: true, slot, plan, interest: Math.round(principal * (plan.ratePct / 100)) };
}

/** 만기 예금 원금+이자 수령 */
export function claimDeposit(state, id, now = Date.now()) {
  if (!state || !state.bank || !Array.isArray(state.bank.deposits)) return { ok: false, reason: '예금 정보가 없습니다.' };
  const idx = state.bank.deposits.findIndex((d) => d.id === id);
  if (idx < 0) return { ok: false, reason: '예금 계좌를 찾을 수 없습니다.' };
  const dep = state.bank.deposits[idx];
  if (now < dep.maturesAt) return { ok: false, reason: '아직 만기가 되지 않았습니다.' };
  const interest = Math.round(dep.principal * (dep.ratePct / 100));
  const payout = dep.principal + interest;
  state.bank.deposits.splice(idx, 1);
  state.gold = Math.max(0, Math.floor(num(state.gold, 0))) + payout;
  state.bank.totalInterest = Math.max(0, Math.floor(num(state.bank.totalInterest, 0))) + interest;
  state.bank.count = Math.max(0, Math.floor(num(state.bank.count, 0))) + 1;
  return { ok: true, principal: dep.principal, interest, payout };
}

/** 중도 해지 — 원금 100% 안전 반환(이자 없음) */
export function cancelDeposit(state, id) {
  if (!state || !state.bank || !Array.isArray(state.bank.deposits)) return { ok: false, reason: '예금 정보가 없습니다.' };
  const idx = state.bank.deposits.findIndex((d) => d.id === id);
  if (idx < 0) return { ok: false, reason: '예금 계좌를 찾을 수 없습니다.' };
  const [dep] = state.bank.deposits.splice(idx, 1);
  state.gold = Math.max(0, Math.floor(num(state.gold, 0))) + dep.principal;
  return { ok: true, principal: dep.principal };
}

/* ────────────────────────────── 🏗️ 전국 메가 프로젝트 4종 ────────────────────────────── */
export const MEGA_MAX_LV = 3;
export const MEGA_PROJECTS = [
  {
    id: 'ktx', icon: '🚄', name: 'KTX 고속철도', color: '#69c0ff', reqCities: 8,
    desc: '전역 임대수익 +6%/Lv · 영지 파견 시간 -5%/Lv',
    effect: (lv) => `전역 임대 +${lv * 6}% · 파견 시간 -${lv * 5}%`,
    costs: [
      { gold: 200000, shards: 100, points: 0 },
      { gold: 800000, shards: 260, points: 8 },
      { gold: 2500000, shards: 550, points: 20 },
    ],
  },
  {
    id: 'datacenter', icon: '🌐', name: 'AI 데이터센터', color: '#b98bff', reqCities: 12,
    desc: '호재 뉴스 효과 +15%/Lv · 골드 획득 +5%/Lv',
    effect: (lv) => `호재 효과 +${lv * 15}% · 골드 +${lv * 5}%`,
    costs: [
      { gold: 250000, shards: 120, points: 0 },
      { gold: 950000, shards: 300, points: 10 },
      { gold: 3000000, shards: 620, points: 22 },
    ],
  },
  {
    id: 'skytower', icon: '🗼', name: '대한민국 스카이타워', color: '#ffcf5c', reqCities: 15,
    desc: '공격력 +6%/Lv · 최대 체력 +8%/Lv',
    effect: (lv) => `공격력 +${lv * 6}% · 최대 체력 +${lv * 8}%`,
    costs: [
      { gold: 300000, shards: 140, points: 0 },
      { gold: 1100000, shards: 340, points: 12 },
      { gold: 3500000, shards: 680, points: 24 },
    ],
  },
  {
    id: 'tradeport', icon: '🚢', name: '국제 무역항', color: '#5ee1a3', reqCities: 18,
    desc: '거래세 감면 -15%/Lv · 드롭률 +5%/Lv',
    effect: (lv) => `거래세 -${lv * 15}% · 드롭률 +${lv * 5}%`,
    costs: [
      { gold: 350000, shards: 160, points: 0 },
      { gold: 1250000, shards: 360, points: 12 },
      { gold: 4000000, shards: 720, points: 26 },
    ],
  },
];
export const MEGA_BY_ID = MEGA_PROJECTS.reduce((m, p) => { m[p.id] = p; return m; }, {});

export function defaultMega() {
  return { ktx: 0, datacenter: 0, skytower: 0, tradeport: 0 };
}

export function normalizeMega(raw) {
  const out = defaultMega();
  if (!raw || typeof raw !== 'object') return out;
  for (const p of MEGA_PROJECTS) {
    out[p.id] = Math.max(0, Math.min(MEGA_MAX_LV, Math.floor(num(raw[p.id], 0))));
  }
  return out;
}

export function megaLevel(state, id) {
  const m = state && state.mega;
  return m ? Math.max(0, Math.min(MEGA_MAX_LV, Math.floor(num(m[id], 0)))) : 0;
}

export function megaEffects(state) {
  const ktx = megaLevel(state, 'ktx');
  const dc = megaLevel(state, 'datacenter');
  const sky = megaLevel(state, 'skytower');
  const port = megaLevel(state, 'tradeport');
  return {
    rentPct: ktx * 6,
    expTimePct: ktx * 5,
    newsBoostPct: dc * 15,
    goldPct: dc * 5,
    atkPct: sky * 6,
    hpPct: sky * 8,
    feeReducePct: port * 15,
    dropPct: port * 5,
    totalLv: ktx + dc + sky + port,
    maxTotalLv: MEGA_PROJECTS.length * MEGA_MAX_LV,
  };
}

export function megaQuote(state, id) {
  const def = MEGA_BY_ID[id];
  if (!def) return { ok: false, reason: '알 수 없는 메가 프로젝트입니다.' };
  const lv = megaLevel(state, id);
  const owned = (state && state.land && state.land.owned) || {};
  const cities = Object.values(owned).filter((q) => Math.floor(num(q, 0)) > 0).length;
  if (lv >= MEGA_MAX_LV) return { ok: true, def, lv, max: true, can: false, cities, cost: null };
  const cost = def.costs[lv];
  const unlocked = cities >= def.reqCities;
  const gold = Math.max(0, Math.floor(num(state && state.gold, 0)));
  const shards = Math.max(0, Math.floor(num(state && state.shards, 0)));
  const pts = Math.max(0, Math.floor(num(state && state.rebirth && state.rebirth.points, 0)));
  const can = unlocked && gold >= cost.gold && shards >= cost.shards && pts >= cost.points;
  return { ok: true, def, lv, max: false, unlocked, cities, cost, can };
}

export function buildMegaProject(state, id) {
  const q = megaQuote(state, id);
  if (!q.ok) return q;
  if (q.max) return { ok: false, reason: '이미 최종 단계까지 완공했습니다.' };
  if (!q.unlocked) return { ok: false, reason: `보유 지역 ${q.def.reqCities}곳 이상부터 착공할 수 있습니다. (현재 ${q.cities}곳)` };
  const c = q.cost;
  if (Math.floor(num(state.gold, 0)) < c.gold) return { ok: false, reason: `골드가 부족합니다. (필요 💰${c.gold.toLocaleString()})` };
  if (Math.floor(num(state.shards, 0)) < c.shards) return { ok: false, reason: `강화석이 부족합니다. (필요 💎${c.shards})` };
  const rb = birthState(state);
  if (Math.floor(num(rb.points, 0)) < c.points) return { ok: false, reason: `초월석이 부족합니다. (필요 ✨${c.points}P)` };
  state.gold = Math.max(0, Math.floor(num(state.gold, 0)) - c.gold);
  state.shards = Math.max(0, Math.floor(num(state.shards, 0)) - c.shards);
  if (c.points > 0) rb.points = Math.max(0, Math.floor(num(rb.points, 0)) - c.points);
  if (!state.mega || typeof state.mega !== 'object') state.mega = defaultMega();
  state.mega[id] = q.lv + 1;
  return { ok: true, id, def: q.def, lv: q.lv + 1, spent: c };
}
