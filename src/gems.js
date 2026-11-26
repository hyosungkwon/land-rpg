// land-rpg / src/gems.js
// v6.2.0 💠 장비 5부위 보석 소켓(Lv.1~5 합성) · 🔨 테마 장비 확정 제작 공방.
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
import { EQUIP_SLOTS } from './data.js';
import { GEAR_ITEMS, GEAR_SETS, acquireGear } from './gear.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const GEM_MAX_LV = 5;
export const GEM_MERGE_NEED = 3;
export const GEM_CUT_COST = { shards: 35, gold: 12000 };

export const GEMS = [
  { id: 'ruby',     name: '루비',     icon: '🔴', color: '#ff6b6b', desc: (lv) => `공격력 +${lv * 3}% · 치명피해 +${lv * 4}%` },
  { id: 'sapphire', name: '사파이어', icon: '🔵', color: '#69c0ff', desc: (lv) => `스킬 쿨감 -${(lv * 1.2).toFixed(1)}% · 공속 +${lv * 2}%` },
  { id: 'emerald',  name: '에메랄드', icon: '🟢', color: '#5ee1a3', desc: (lv) => `흡혈 +${(lv * 0.8).toFixed(1)}%p · 회복 +${(lv * 0.25).toFixed(2)}%/s` },
  { id: 'topaz',    name: '토파즈',   icon: '🟡', color: '#ffcf5c', desc: (lv) => `골드 +${lv * 4}% · 드랍률 +${lv * 5}%` },
  { id: 'diamond',  name: '다이아',   icon: '💎', color: '#d8f4ff', desc: (lv) => `체력 +${lv * 5}% · 피해감소 +${(lv * 1.5).toFixed(1)}%p` },
];

export const GEM_IDS = GEMS.map((g) => g.id);
export const GEM_BY_ID = Object.fromEntries(GEMS.map((g) => [g.id, g]));

export const THEME_CRAFT_COST = {
  hero:   { shards: 180, gold: 40000,  label: '영웅 확정' },
  legend: { shards: 550, gold: 200000, label: '전설 확정' },
};

export function defaultGems() {
  const bag = {};
  for (const id of GEM_IDS) bag[id] = [0, 0, 0, 0, 0];
  const sockets = {};
  for (const slot of EQUIP_SLOTS) sockets[slot] = null;
  return { bag, sockets, crafted: 0 };
}

export function normalizeGems(raw) {
  const d = defaultGems();
  if (!raw || typeof raw !== 'object') return d;
  if (raw.bag && typeof raw.bag === 'object') {
    for (const id of GEM_IDS) {
      const arr = Array.isArray(raw.bag[id]) ? raw.bag[id] : [];
      for (let i = 0; i < GEM_MAX_LV; i++) d.bag[id][i] = Math.max(0, Math.floor(num(arr[i], 0)));
    }
  }
  if (raw.sockets && typeof raw.sockets === 'object') {
    for (const slot of EQUIP_SLOTS) {
      const s = raw.sockets[slot];
      if (s && typeof s === 'object' && GEM_BY_ID[s.type]) {
        const lv = clamp(Math.floor(num(s.lv, 1)), 1, GEM_MAX_LV);
        d.sockets[slot] = { type: s.type, lv };
      }
    }
  }
  d.crafted = Math.max(0, Math.floor(num(raw.crafted, 0)));
  return d;
}

/** 보석 세공(Lv.1 제작 · 20% 확률로 Lv.2) */
export function cutGem(state, type, rng = Math.random) {
  if (!state || !GEM_BY_ID[type]) return { ok: false, reason: '알 수 없는 보석입니다.' };
  if ((state.shards || 0) < GEM_CUT_COST.shards) return { ok: false, reason: `강화석이 부족합니다 (필요 💎${GEM_CUT_COST.shards})` };
  if ((state.gold || 0) < GEM_CUT_COST.gold) return { ok: false, reason: `골드가 부족합니다 (필요 💰${GEM_CUT_COST.gold.toLocaleString()})` };
  if (!state.gems || !state.gems.bag) state.gems = defaultGems();
  state.shards -= GEM_CUT_COST.shards;
  state.gold -= GEM_CUT_COST.gold;
  const lv = rng() < 0.2 ? 2 : 1;
  state.gems.bag[type][lv - 1] = (state.gems.bag[type][lv - 1] || 0) + 1;
  return { ok: true, type, lv, gem: GEM_BY_ID[type], lucky: lv === 2 };
}

/** 보석 3개 합성 → 상위 1개 */
export function mergeGem(state, type, lv) {
  if (!state || !GEM_BY_ID[type]) return { ok: false, reason: '알 수 없는 보석입니다.' };
  const curLv = Math.floor(num(lv, 0));
  if (curLv < 1 || curLv >= GEM_MAX_LV) return { ok: false, reason: '합성할 수 없는 등급입니다.' };
  if (!state.gems || !state.gems.bag) state.gems = defaultGems();
  const have = state.gems.bag[type][curLv - 1] || 0;
  if (have < GEM_MERGE_NEED) return { ok: false, reason: `동일 보석 ${GEM_MERGE_NEED}개가 필요합니다 (보유 ${have}개)` };
  state.gems.bag[type][curLv - 1] = have - GEM_MERGE_NEED;
  state.gems.bag[type][curLv] = (state.gems.bag[type][curLv] || 0) + 1;
  return { ok: true, type, fromLv: curLv, toLv: curLv + 1, gem: GEM_BY_ID[type] };
}

/** 보석 소켓 장착 (기존 보석은 가방으로 자동 반환) */
export function socketGem(state, slot, type, lv) {
  if (!state || !EQUIP_SLOTS.includes(slot)) return { ok: false, reason: '알 수 없는 부위입니다.' };
  if (!GEM_BY_ID[type]) return { ok: false, reason: '알 수 없는 보석입니다.' };
  const targetLv = clamp(Math.floor(num(lv, 1)), 1, GEM_MAX_LV);
  if (!state.gems || !state.gems.bag) state.gems = defaultGems();
  const have = state.gems.bag[type][targetLv - 1] || 0;
  if (have < 1) return { ok: false, reason: '보유 중인 보석이 없습니다.' };
  const prev = state.gems.sockets[slot];
  if (prev && GEM_BY_ID[prev.type]) {
    state.gems.bag[prev.type][clamp(prev.lv, 1, GEM_MAX_LV) - 1] += 1;
  }
  state.gems.bag[type][targetLv - 1] -= 1;
  state.gems.sockets[slot] = { type, lv: targetLv };
  return { ok: true, slot, type, lv: targetLv, gem: GEM_BY_ID[type], prev };
}

/** 보석 소켓 해제 (가방으로 반환) */
export function unsocketGem(state, slot) {
  if (!state || !EQUIP_SLOTS.includes(slot) || !state.gems || !state.gems.sockets) {
    return { ok: false, reason: '해제할 보석이 없습니다.' };
  }
  const prev = state.gems.sockets[slot];
  if (!prev || !GEM_BY_ID[prev.type]) return { ok: false, reason: '장착된 보석이 없습니다.' };
  state.gems.bag[prev.type][clamp(prev.lv, 1, GEM_MAX_LV) - 1] += 1;
  state.gems.sockets[slot] = null;
  return { ok: true, slot, prev, gem: GEM_BY_ID[prev.type] };
}

/** 장착된 5부위 보석 효과 합계 */
export function gemEffects(state) {
  const out = {
    atkPct: 0, critDmgPct: 0, cdrPct: 0, atkSpdPct: 0,
    lifestealPct: 0, regenPct: 0, goldPct: 0, dropPct: 0,
    hpPct: 0, dmgRedPct: 0, socketCount: 0,
  };
  const socks = state && state.gems && state.gems.sockets;
  if (!socks || typeof socks !== 'object') return out;
  for (const slot of EQUIP_SLOTS) {
    const g = socks[slot];
    if (!g || !GEM_BY_ID[g.type]) continue;
    const lv = clamp(Math.floor(num(g.lv, 1)), 1, GEM_MAX_LV);
    out.socketCount += 1;
    if (g.type === 'ruby') { out.atkPct += lv * 3; out.critDmgPct += lv * 4; }
    else if (g.type === 'sapphire') { out.cdrPct += lv * 1.2; out.atkSpdPct += lv * 2; }
    else if (g.type === 'emerald') { out.lifestealPct += lv * 0.8; out.regenPct += lv * 0.25; }
    else if (g.type === 'topaz') { out.goldPct += lv * 4; out.dropPct += lv * 5; }
    else if (g.type === 'diamond') { out.hpPct += lv * 5; out.dmgRedPct += lv * 1.5; }
  }
  out.cdrPct = Math.round(out.cdrPct * 10) / 10;
  out.lifestealPct = Math.round(out.lifestealPct * 10) / 10;
  out.regenPct = Math.round(out.regenPct * 100) / 100;
  out.dmgRedPct = Math.round(out.dmgRedPct * 10) / 10;
  return out;
}

/** 🔨 테마 장비 확정 제작 공방 (미보유 장비 우선 지급) */
export function craftThemeGear(state, setId, rarity = 'legend', now = Date.now(), rng = Math.random) {
  if (!state || typeof state !== 'object') return { ok: false, reason: '잘못된 상태입니다.' };
  const setDef = GEAR_SETS.find((s) => s.id === setId);
  if (!setDef) return { ok: false, reason: '알 수 없는 테마 세트입니다.' };
  const cost = THEME_CRAFT_COST[rarity];
  if (!cost) return { ok: false, reason: '영웅 또는 전설 등급만 제작할 수 있습니다.' };
  if ((state.shards || 0) < cost.shards) return { ok: false, reason: `강화석이 부족합니다 (필요 💎${cost.shards})` };
  if ((state.gold || 0) < cost.gold) return { ok: false, reason: `골드가 부족합니다 (필요 💰${cost.gold.toLocaleString()})` };

  const pool = GEAR_ITEMS.filter((it) => it.set === setId && it.rarity === rarity);
  if (!pool.length) return { ok: false, reason: '해당 테마의 제작 가능 장비가 없습니다.' };
  const ownedIds = new Set(((state.gear && state.gear.items) || []).map((x) => x.id));
  const missing = pool.filter((it) => !ownedIds.has(it.id));
  const pickFrom = missing.length ? missing : pool;
  const picked = pickFrom[Math.floor(rng() * pickFrom.length) % pickFrom.length];

  state.shards -= cost.shards;
  state.gold -= cost.gold;
  if (!state.gems) state.gems = defaultGems();
  state.gems.crafted = (state.gems.crafted || 0) + 1;

  const acq = acquireGear(state, picked.id, { autoEquip: true, now, source: 'craft', rollAffix: true, rng });
  return { ok: true, item: picked, set: setDef, rarity, cost, acq, wasMissing: missing.length > 0 };
}
