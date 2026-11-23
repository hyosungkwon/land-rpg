// land-rpg / src/state.js
// 게임 상태 · 저장 · 성장 계산. DOM 의존 없음.
// v3: 로그인/클라우드 없음. 골드 하나로 사냥 + 부동산을 함께 굴리는 통합 상태.
import {
  ECON, EQUIP, EQUIP_MAX_LV, SKILLS, SKILL_UPGRADE_MAX,
  SAVE_KEY, SAVE_VERSION, enhanceCost, skillCost, skillPowerMul,
  RARITIES, RARITY_INDEX, RARITY_IDS, GACHA, gachaCost, rarityBonusLv,
} from './data.js';
import { defaultLand } from './land.js';
import { PET_IDS, JOB_MAX, jobOf, equippedPet } from './meta.js';

const nowMs = () => Date.now();

export function defaultState(now = nowMs()) {
  return {
    ver: SAVE_VERSION,
    guest: true,
    createdAt: now,
    lastActiveAt: now,
    level: 1,
    exp: 0,
    gold: ECON.startGold,
    shards: ECON.startShards,
    hp: null, // null = 최대치
    equip: { weapon: 0, armor: 0, helmet: 0, ring: 0, amulet: 0 },
    // v3.1 장비 등급(뽑기) — 부위별로 하나씩 장착된다.
    gearRarity: { weapon: 'common', armor: 'common', helmet: 'common', ring: 'common', amulet: 'common' },
    gacha: { pity: 0, total: 0, best: 'common', legend: 0, cur: 'gold' },
    soundOn: true,
    skills: {
      strike: { lv: 0, last: 0 },
      whirl: { lv: 0, last: 0 },
      berserk: { lv: 0, last: 0 },
      heal: { lv: 0, last: 0 },
    },
    stage: 1,
    killsInStage: 0,
    bossReady: false,
    totalKills: 0,
    bossKills: 0,
    maxStage: 1,
    autoBoss: true,
    effects: true,
    // v3.2 메타 성장: 펫 동료 · 전직 단계 · 황금 던전 쿨타임
    jobTier: 0,
    jobAt: 0,
    pet: { equipped: null, unlocked: [], chosen: false },
    dungeonCooldown: 0,
    dungeon: { best: 0, runs: 0, last: null },
    land: defaultLand(now),
    records: { totalGold: 0, totalRent: 0, playMs: 0, firstPlay: now },
    lastOffline: null,
  };
}

/** 저장본을 현재 스키마로 정규화 (누락 필드 보강, 손상 방어) */
export function normalizeState(raw, now = nowMs()) {
  const d = defaultState(now);
  if (!raw || typeof raw !== 'object') return d;
  const s = { ...d, ...raw };
  s.equip = { ...d.equip, ...(raw.equip || {}) };
  s.skills = { ...d.skills };
  for (const k of Object.keys(d.skills)) {
    const v = (raw.skills || {})[k];
    s.skills[k] = typeof v === 'object' && v ? { lv: num(v.lv, 0), last: num(v.last, 0) } : { lv: num(v, 0), last: 0 };
  }
  s.gearRarity = { ...d.gearRarity };
  for (const k of Object.keys(d.gearRarity)) {
    const v = raw.gearRarity && raw.gearRarity[k];
    s.gearRarity[k] = typeof v === 'string' && RARITY_IDS.includes(v) ? v : 'common';
  }
  s.gacha = { ...d.gacha, ...(raw.gacha && typeof raw.gacha === 'object' ? raw.gacha : {}) };
  s.gacha.pity = clamp(Math.floor(num(s.gacha.pity, 0)), 0, GACHA.pityLegend - 1);
  s.gacha.total = Math.max(0, Math.floor(num(s.gacha.total, 0)));
  s.gacha.legend = Math.max(0, Math.floor(num(s.gacha.legend, 0)));
  if (!RARITY_IDS.includes(s.gacha.best)) s.gacha.best = 'common';
  if (s.gacha.cur !== 'shards') s.gacha.cur = 'gold';
  s.soundOn = s.soundOn !== false;
  s.land = { ...d.land, ...(raw.land || {}) };
  s.land.owned = sanitizeOwned(s.land.owned);
  s.land.totalCost = sanitizeOwned(s.land.totalCost);
  s.land.accruedRent = Math.max(0, num(s.land.accruedRent, 0));
  s.land.rentAt = num(s.land.rentAt, now);
  s.land.bestAsset = Math.max(0, num(s.land.bestAsset, 0));
  s.land.tradeCount = Math.max(0, Math.floor(num(s.land.tradeCount, 0)));
  s.land.taxPaid = Math.max(0, num(s.land.taxPaid, 0));
  s.land.totalRentClaimed = Math.max(0, num(s.land.totalRentClaimed, 0));
  s.land.assetHistory = Array.isArray(s.land.assetHistory)
    ? s.land.assetHistory.filter((h) => h && isFinite(h.t) && isFinite(h.v)).slice(-288)
    : [];
  s.land.page = Math.max(1, Math.floor(num(s.land.page, 1)));
  if (!['home', 'market', 'buff'].includes(s.land.sub)) s.land.sub = 'home';
  if (!['all', '0', '1', '2', 'owned'].includes(String(s.land.tier))) s.land.tier = 'all';
  if (!['roi', 'price', 'trend', 'name'].includes(s.land.sort)) s.land.sort = 'roi';
  s.land.q = typeof s.land.q === 'string' ? s.land.q.slice(0, 30) : '';
  s.records = { ...d.records, ...(raw.records || {}) };

  // v3.2: 펫/전직/던전 기본값 병합 (없는 저장본은 그대로 진행도 유지)
  const rawPet = raw.pet && typeof raw.pet === 'object' ? raw.pet : {};
  const petIds = Array.isArray(rawPet.unlocked) ? rawPet.unlocked.filter((id) => PET_IDS.includes(id)) : [];
  s.pet = {
    equipped: petIds.includes(rawPet.equipped) ? rawPet.equipped : null,
    unlocked: PET_IDS.filter((id) => petIds.includes(id)),
    chosen: rawPet.chosen === true,
  };
  s.jobTier = clamp(Math.floor(num(raw.jobTier, 0)), 0, JOB_MAX);
  s.jobAt = Math.max(0, num(raw.jobAt, 0));
  s.dungeonCooldown = Math.max(0, num(raw.dungeonCooldown, 0));
  const rawDun = raw.dungeon && typeof raw.dungeon === 'object' ? raw.dungeon : {};
  s.dungeon = {
    best: Math.max(0, Math.floor(num(rawDun.best, 0))),
    runs: Math.max(0, Math.floor(num(rawDun.runs, 0))),
    last: rawDun.last && typeof rawDun.last === 'object' ? rawDun.last : null,
  };

  s.level = Math.max(1, Math.floor(num(s.level, 1)));
  s.exp = Math.max(0, num(s.exp, 0));
  s.gold = Math.max(0, Math.floor(num(s.gold, 0)));
  s.shards = Math.max(0, Math.floor(num(s.shards, 0)));
  s.stage = Math.max(1, Math.floor(num(s.stage, 1)));
  s.maxStage = Math.max(s.stage, Math.floor(num(s.maxStage, 1)));
  s.killsInStage = Math.max(0, Math.floor(num(s.killsInStage, 0)));
  s.totalKills = Math.max(0, Math.floor(num(s.totalKills, 0)));
  s.bossKills = Math.max(0, Math.floor(num(s.bossKills, 0)));
  for (const k of Object.keys(EQUIP)) s.equip[k] = clamp(Math.floor(num(s.equip[k], 0)), 0, EQUIP_MAX_LV);
  for (const k of Object.keys(SKILLS)) s.skills[k].lv = clamp(Math.floor(num(s.skills[k].lv, 0)), 0, SKILL_UPGRADE_MAX);
  s.bossReady = !!s.bossReady;
  s.autoBoss = s.autoBoss !== false;
  s.effects = s.effects !== false;
  s.lastActiveAt = num(s.lastActiveAt, now);
  return s;
}

function sanitizeOwned(v) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, raw] of Object.entries(v)) {
    const n = Math.floor(num(raw, 0));
    if (n > 0) out[k] = n;
  }
  return out;
}

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function loadState(storage, now = nowMs()) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultState(now);
    return normalizeState(JSON.parse(raw), now);
  } catch (e) {
    return defaultState(now);
  }
}

export function saveState(storage, s) {
  try {
    s.lastActiveAt = nowMs();
    if (storage) storage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch (e) {
    return false;
  }
}

/* ────────────────────────────── 성장 계산 ────────────────────────────── */

export function expNeed(level) {
  return Math.floor(ECON.expNeedBase * Math.pow(ECON.expNeedGrowth, Math.max(0, level - 1)));
}

export const NO_BUFF = { atkPct: 0, goldPct: 0, hpPct: 0, dropPct: 0, critPct: 0 };

/** 파생 스탯. buffs 는 land.js 의 computeBuffs 결과(건물주 버프).
 *  v3.2: 전직 단계(영구 공격력·체력 배율) + 동행 펫 패시브를 함께 반영한다. */
export function calcStats(s, buffs = NO_BUFF) {
  const b = { ...NO_BUFF, ...(buffs || {}) };
  const L = s.level;
  const e = s.equip;
  const gr = s.gearRarity || {};
  // 등급 보정: 장비 강화 레벨에 등급 환산 레벨을 더한다(전설 +25강 상당).
  const eLv = (slot) => e[slot] + rarityBonusLv(gr[slot]);
  const job = jobOf(s);
  const pet = equippedPet(s);
  const jobAtkMul = 1 + (job.atkPct || 0) / 100;
  const jobHpMul = 1 + (job.hpPct || 0) / 100;
  const petAtkMul = 1 + (pet ? pet.atkPct : 0) / 100;
  const baseAtk = 12 + 2.6 * L + 0.035 * L * L;
  const equipAtk = EQUIP.weapon.per * eLv('weapon');
  const atk = (baseAtk + equipAtk) * (1 + b.atkPct / 100) * jobAtkMul * petAtkMul;
  const hpMax =
    (150 + 30 * L + EQUIP.armor.per * eLv('armor') + EQUIP.helmet.per * eLv('helmet')) * (1 + b.hpPct / 100) * jobHpMul;
  const crit = Math.min(0.5, 0.05 + (EQUIP.ring.per / 100) * eLv('ring') + (b.critPct || 0) / 100);
  const critDmg = 2.0;
  const goldMult = 1 + (EQUIP.amulet.per / 100) * eLv('amulet') + b.goldPct / 100 + (pet ? pet.goldPct / 100 : 0);
  const dropMult = 1 + b.dropPct / 100;
  const attackMs = Math.max(300, ECON.playerAttackMs - L * 2);
  const dps = (atk / (attackMs / 1000)) * (1 + crit * (critDmg - 1));
  return {
    atk: Math.round(atk),
    hpMax: Math.round(hpMax),
    crit,
    critDmg,
    goldMult,
    dropMult,
    attackMs,
    dps: Math.round(dps),
    jobTier: job.tier,
    petId: pet ? pet.id : null,
  };
}

/** 현재 체력 (state.hp 가 null 이면 최대) */
export function currentHp(s, stats) {
  if (s.hp === null || s.hp === undefined) return stats.hpMax;
  return clamp(s.hp, 0, stats.hpMax);
}

export function addExp(s, amount) {
  if (!(amount > 0)) return 0;
  s.exp += amount;
  let ups = 0;
  let guard = 0;
  while (s.exp >= expNeed(s.level) && guard++ < 10000) {
    s.exp -= expNeed(s.level);
    s.level += 1;
    ups += 1;
  }
  return ups;
}

/* ────────────────────────────── 강화 ────────────────────────────── */

/** 강화석 시세: 현재 스테이지 사냥 기대값 기준 (골드/개) */
export function shardPrice(state) {
  const stage = Math.max(1, Math.floor(state.stage || 1));
  const goldPerKill = ECON.goldBase * Math.pow(ECON.goldGrowth, stage - 1);
  const raw = goldPerKill * ECON.shardShopFactor;
  const unit = raw >= 2000 ? 50 : raw >= 200 ? 10 : raw >= 50 ? 5 : 1;
  return Math.max(40, Math.round(raw / unit) * unit);
}

/** 골드 → 강화석 구매 */
export function buyShards(s, count) {
  const n = Math.floor(Number(count) || 0);
  if (!(n > 0)) return { ok: false, reason: '수량을 입력해 주세요.' };
  const price = shardPrice(s);
  const cost = price * n;
  if (s.gold < cost) return { ok: false, reason: `골드가 부족합니다. (필요 💰${cost.toLocaleString()})`, cost };
  s.gold -= cost;
  s.shards += n;
  return { ok: true, n, cost, price };
}

/* ────────────────────────────── 장비 뽑기 (v3.1) ────────────────────────────── */

/** 현재 장착 등급의 평균 인덱스(오라 색) · 무기 등급 인덱스(검기 색) */
export function gearRarityAvg(s) {
  const gr = (s && s.gearRarity) || {};
  const ids = Object.keys(gr);
  if (!ids.length) return 0;
  const sum = ids.reduce((a, k) => a + (RARITY_INDEX[gr[k]] || 0), 0);
  return Math.ceil(sum / ids.length - 1e-9);
}

export function weaponRarityIdx(s) {
  const gr = (s && s.gearRarity) || {};
  return RARITY_INDEX[gr.weapon] || 0;
}

/** 가중치 뽑기 — 0(일반) ~ 4(전설) 인덱스 반환 */
function rollRarityIdx(rng) {
  const total = RARITIES.reduce((a, r) => a + r.weight, 0);
  let x = rng() * total;
  for (let i = 0; i < RARITIES.length; i++) {
    x -= RARITIES[i].weight;
    if (x <= 0) return i;
  }
  return 0;
}

/**
 * 장비 뽑기. 등급이 더 높으면 자동 장착(이전 장비는 분해), 같거나 낮으면 자동 분해.
 * @returns {{ok:boolean, results?:Array, spent?:number, cur?:string, shards?:number, best?:string, pity?:number, pityLeft?:number, reason?:string}}
 */
export function pullGear(s, times = 1, rng = Math.random) {
  const n = times >= 10 ? 10 : 1;
  if (!s.gacha) s.gacha = { pity: 0, total: 0, best: 'common', legend: 0, cur: 'gold' };
  if (!s.gearRarity) s.gearRarity = { weapon: 'common', armor: 'common', helmet: 'common', ring: 'common', amulet: 'common' };
  const pay = gachaCost(s.gacha.cur, n);
  const have = Math.max(0, Math.floor(s[pay.cur] || 0));
  if (have < pay.amount) {
    return {
      ok: false,
      reason: `${pay.cur === 'shards' ? '강화석' : '골드'}이 부족합니다. (필요 ${pay.cur === 'shards' ? '💎' : '💰'}${pay.amount.toLocaleString()})`,
      need: pay.amount,
      cur: pay.cur,
    };
  }

  // 1) 등급 먼저 뽑는다(천장·10연차 보장을 적용한 뒤 장착/분해).
  const rolled = [];
  let pity = Math.max(0, Math.min(GACHA.pityLegend - 1, Math.floor(s.gacha.pity || 0)));
  for (let i = 0; i < n; i++) {
    let idx;
    if (pity >= GACHA.pityLegend - 1) idx = RARITIES.length - 1; // 천장 도달 → 전설 확정
    else idx = rollRarityIdx(rng);
    if (idx === RARITIES.length - 1) pity = 0;
    else pity += 1;
    rolled.push(idx);
  }
  const gIdx = RARITY_INDEX[GACHA.tenGuarantee] || 2;
  if (n === 10 && !rolled.some((i) => i >= gIdx)) rolled[n - 1] = gIdx; // 10회 최소 레어 보장

  // 2) 비용 차감 → 부위 배정 → 자동 장착/분해
  s[pay.cur] -= pay.amount;
  const slots = Object.keys(s.gearRarity);
  const results = [];
  let dust = 0;
  let bestIdx = 0;
  let legends = 0;
  for (const idx of rolled) {
    const rarity = RARITIES[idx];
    const slot = slots[Math.floor(rng() * slots.length)] || 'weapon';
    const curIdx = RARITY_INDEX[s.gearRarity[slot]] || 0;
    const equipped = idx > curIdx;
    let shards = 0;
    let replaced = null;
    if (equipped) {
      replaced = s.gearRarity[slot];
      s.gearRarity[slot] = rarity.id;
      if (curIdx > 0) shards += RARITIES[curIdx].dust; // 교체된 이전 장비 분해
    } else {
      shards += rarity.dust; // 중복 장비 분해
    }
    if (shards > 0) { s.shards += shards; dust += shards; }
    if (idx > bestIdx) bestIdx = idx;
    if (idx === RARITIES.length - 1) legends += 1;
    results.push({ slot, rarity: rarity.id, name: rarity.name, equipped, replaced, shards });
  }

  s.gacha.pity = pity;
  s.gacha.total += n;
  s.gacha.legend += legends;
  if (bestIdx > (RARITY_INDEX[s.gacha.best] || 0)) s.gacha.best = RARITIES[bestIdx].id;

  return {
    ok: true,
    results,
    spent: pay.amount,
    cur: pay.cur,
    shards: dust,
    best: RARITIES[bestIdx].id,
    pity,
    pityLeft: GACHA.pityLegend - pity,
    total: s.gacha.total,
  };
}

export function tryEnhance(s, slot, times = 1) {
  if (!(slot in EQUIP)) return { ok: false, reason: '알 수 없는 부위입니다.' };
  let done = 0;
  let spent = 0;
  for (let i = 0; i < times; i++) {
    if (s.equip[slot] >= EQUIP_MAX_LV) return { ok: done > 0, reason: '최대 강화 단계입니다.', done, spent, max: true };
    const cost = enhanceCost(s.equip[slot]);
    if (s.shards < cost) return { ok: done > 0, reason: '강화석이 부족합니다.', done, spent, need: cost };
    s.shards -= cost;
    s.equip[slot] += 1;
    spent += cost;
    done += 1;
  }
  return { ok: true, done, spent };
}

export function tryUpgradeSkill(s, key) {
  const def = SKILLS[key];
  const sk = s.skills[key];
  if (!def || !sk) return { ok: false, reason: '알 수 없는 스킬입니다.' };
  if (sk.lv >= SKILL_UPGRADE_MAX) return { ok: false, reason: '최대 레벨입니다.' };
  const cost = skillCost(sk.lv);
  if (s.shards < cost) return { ok: false, reason: '강화석이 부족합니다.', need: cost };
  s.shards -= cost;
  sk.lv += 1;
  return { ok: true, lv: sk.lv, spent: cost };
}

export function skillEffect(key, lv) {
  const def = SKILLS[key];
  const p = skillPowerMul(lv);
  if (!def) return 1;
  if (key === 'strike' || key === 'whirl') return def.mul * p;
  if (key === 'berserk') return def.bonus * p;
  if (key === 'heal') return def.ratio * p;
  return p;
}

/* ────────────────────────────── 보상 / 처치 ────────────────────────────── */

export function monsterStats(stage, isBoss, variant = 1) {
  const s = Math.max(1, stage);
  const late = 1 + Math.max(0, s - 10) * ECON.monsterHpLateBoost;
  const hp = ECON.monsterHpBase * Math.pow(ECON.monsterHpGrowth, s - 1) * late * (isBoss ? ECON.bossHpMul : 1) * variant;
  const atk = ECON.monsterAtkBase * Math.pow(ECON.monsterAtkGrowth, s - 1) * (isBoss ? ECON.bossAtkMul : 1);
  return { hp: Math.max(1, Math.round(hp)), atk: Math.max(1, Math.round(atk)) };
}

export function killReward(s, stage, isBoss, buffs, rng = Math.random) {
  const gold = Math.round(
    ECON.goldBase * Math.pow(ECON.goldGrowth, stage - 1) * (isBoss ? ECON.bossGoldMul : 1)
      * (1 + (buffs?.goldPct || 0) / 100) * (0.92 + rng() * 0.16)
  );
  const exp = Math.round(
    ECON.expBase * Math.pow(ECON.expGrowth, stage - 1) * (isBoss ? ECON.bossExpMul : 1) * (0.95 + rng() * 0.1)
  );
  let shards = 0;
  if (isBoss) shards = Math.round((ECON.bossShardBase + stage * ECON.bossShardPerStage) * (1 + (buffs?.dropPct || 0) / 100));
  else if (rng() < ECON.shardDropChance * (1 + (buffs?.dropPct || 0) / 100)) shards = 1;

  s.gold += gold;
  s.shards += shards;
  s.records.totalGold += gold;
  const ups = addExp(s, exp);
  return { gold, exp, shards, levelUps: ups };
}

/** 보스 처치 → 다음 스테이지 */
export function clearStage(s, stage) {
  const first = stage >= s.maxStage;
  s.bossKills += 1;
  s.stage = stage + 1;
  s.killsInStage = 0;
  s.bossReady = false;
  s.maxStage = Math.max(s.maxStage, s.stage);
  const bonus = first ? 10 + Math.floor(stage * 2) : Math.floor((10 + stage * 2) / 3);
  s.shards += bonus;
  return { first, bonus, nextStage: s.stage };
}

export function registerKill(s, isBoss) {
  s.totalKills += 1;
  if (!isBoss) {
    s.killsInStage += 1;
    if (s.killsInStage >= ECON.normalKillsPerStage) s.bossReady = true;
  }
  return s.killsInStage;
}

/* ────────────────────────────── 오프라인 정산 ────────────────────────────── */

export function offlineSummary(s, now = nowMs(), buffs = NO_BUFF) {
  const elapsed = Math.max(0, now - (s.lastActiveAt || now));
  const capMs = ECON.offlineCapHours * 3600 * 1000;
  const capped = elapsed > capMs;
  const ms = Math.min(elapsed, capMs);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return { ms, sec, capped, gold: 0, exp: 0, shards: 0 };
  const kills = sec * ECON.offlineKillsPerSec;
  const goldPerKill = ECON.goldBase * Math.pow(ECON.goldGrowth, s.stage - 1) * (1 + (buffs?.goldPct || 0) / 100);
  const expPerKill = ECON.expBase * Math.pow(ECON.expGrowth, s.stage - 1);
  const gold = Math.floor(goldPerKill * kills * ECON.offlineRate);
  const exp = Math.floor(expPerKill * kills * ECON.offlineRate);
  const shards = Math.floor((sec / 3600) * 3 * (1 + (buffs?.dropPct || 0) / 100));
  return { ms, sec, capped, gold, exp, shards };
}

export function applyOffline(s, summary) {
  s.gold += summary.gold;
  s.shards += summary.shards;
  s.records.totalGold += summary.gold;
  const levelUps = addExp(s, summary.exp);
  s.lastOffline = { at: nowMs(), ...summary, levelUps };
  return levelUps;
}
