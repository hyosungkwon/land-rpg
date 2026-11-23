// land-rpg / src/state.js
// 게임 상태 · 저장 · 성장 계산. DOM 의존 없음.
import {
  ECON, EQUIP, EQUIP_MAX_LV, SKILLS, SKILL_UPGRADE_MAX,
  SAVE_KEY, SAVE_VERSION, enhanceCost, skillCost, skillPowerMul,
} from './data.js';

const nowMs = () => Date.now();

export function defaultState(now = nowMs()) {
  return {
    ver: SAVE_VERSION,
    uid: null,
    nickname: '',
    createdAt: now,
    lastActiveAt: now,
    level: 1,
    exp: 0,
    gold: ECON.startGold,
    shards: ECON.startShards,
    hp: null, // null = 최대치
    equip: { weapon: 0, armor: 0, helmet: 0, ring: 0, amulet: 0 },
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
    exchange: { day: '', used: 0 },
    claim: { dividendWatermark: 0 },
    // 부동산 게임 UI/임대수익 적립 상태 (사냥 진행도와 별개)
    land: { sub: 'home', q: '', tier: 'all', sort: 'roi', page: 1, accruedRent: 0, rentAt: now },
    records: { totalGold: 0, playMs: 0, firstPlay: now },
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
  s.exchange = { ...d.exchange, ...(raw.exchange || {}) };
  s.claim = { ...d.claim, ...(raw.claim || {}) };
  s.land = { ...d.land, ...(raw.land || {}) };
  s.land.accruedRent = Math.max(0, num(s.land.accruedRent, 0));
  s.land.rentAt = num(s.land.rentAt, now);
  s.land.page = Math.max(1, Math.floor(num(s.land.page, 1)));
  if (!['home', 'market', 'rpg'].includes(s.land.sub)) s.land.sub = 'home';
  if (!['all', '0', '1', '2', 'owned'].includes(String(s.land.tier))) s.land.tier = 'all';
  if (!['roi', 'price', 'trend', 'name'].includes(s.land.sort)) s.land.sort = 'roi';
  s.land.q = typeof s.land.q === 'string' ? s.land.q.slice(0, 30) : '';
  s.records = { ...d.records, ...(raw.records || {}) };

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

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
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

const NO_BUFF = { atkPct: 0, goldPct: 0, hpPct: 0, dropPct: 0 };

/** 파생 스탯. buffs 는 property.js 의 부동산 버프 결과. */
export function calcStats(s, buffs = NO_BUFF) {
  const b = { ...NO_BUFF, ...(buffs || {}) };
  const L = s.level;
  const e = s.equip;
  const baseAtk = 12 + 3.2 * L + 0.06 * L * L;
  const equipAtk = EQUIP.weapon.per * e.weapon;
  const atk = (baseAtk + equipAtk) * (1 + b.atkPct / 100);
  const hpMax = (120 + 22 * L + EQUIP.armor.per * e.armor + EQUIP.helmet.per * e.helmet) * (1 + b.hpPct / 100);
  const crit = Math.min(0.35, 0.05 + (EQUIP.ring.per / 100) * e.ring);
  const critDmg = 2.0;
  const goldMult = 1 + (EQUIP.amulet.per / 100) * e.amulet + b.goldPct / 100;
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
  const hp = ECON.monsterHpBase * Math.pow(ECON.monsterHpGrowth, s - 1) * (isBoss ? ECON.bossHpMul : 1) * variant;
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

/* ────────────────────────────── 환전 ────────────────────────────── */

export function dayKey(now = nowMs()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function exchangeStatus(s, now = nowMs()) {
  if (s.exchange.day !== dayKey(now)) {
    s.exchange.day = dayKey(now);
    s.exchange.used = 0;
  }
  const remain = Math.max(0, ECON.exchangeDailyCap - s.exchange.used);
  const maxGold = Math.floor(remain / ECON.exchangeRate);
  return {
    rate: ECON.exchangeRate,
    cap: ECON.exchangeDailyCap,
    used: s.exchange.used,
    remain,
    maxGold,
    minGold: ECON.exchangeMinGold,
  };
}

/** 환전 요청 검증 (실제 반영은 UI/파이어베이스 성공 후 commitExchange) */
export function validateExchange(s, gold, now = nowMs()) {
  const st = exchangeStatus(s, now);
  const g = Math.floor(num(gold, 0));
  if (!(g > 0)) return { ok: false, reason: '환전할 골드를 입력해 주세요.' };
  if (g < st.minGold) return { ok: false, reason: `최소 ${st.minGold.toLocaleString()} 골드부터 환전할 수 있습니다.` };
  if (g > s.gold) return { ok: false, reason: '보유 골드가 부족합니다.' };
  const cash = g * st.rate;
  if (cash > st.remain) return { ok: false, reason: `오늘 환전 한도가 부족합니다. (남은 한도 ₩${st.remain.toLocaleString()})` };
  return { ok: true, gold: g, cash, status: st };
}

export function commitExchange(s, gold) {
  const cash = gold * ECON.exchangeRate;
  s.gold -= gold;
  s.exchange.used += cash;
  return cash;
}
