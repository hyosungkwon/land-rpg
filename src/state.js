// land-rpg / src/state.js
// 게임 상태 · 저장 · 성장 계산. DOM 의존 없음.
// v3: 로그인/클라우드 없음. 골드 하나로 사냥 + 부동산을 함께 굴리는 통합 상태.
import {
  ECON, EQUIP, EQUIP_MAX_LV, SKILLS, SKILL_UPGRADE_MAX, DEF,
  SAVE_KEY, SAVE_VERSION, enhanceCost, skillCost, skillPowerMul,
  RARITIES, RARITY_INDEX, RARITY_IDS, GACHA, gachaCost, rarityBonusLv,
  stageGoldBase, stageExpBase, monsterBaseHp, monsterBaseAtk,
} from './data.js';
import {
  normalizeRebirth, rebirthBonus,
} from './rebirth.js';
import {
  newGearState, normalizeGear, syncGearRarity, gearMods, acquireGear, equippedRarity,
  shouldAutoEquip, randomItemOfRarity, gearItem, GEAR_BY_RARITY,
} from './gear.js';
import { defaultLand } from './land.js';
import { PET_IDS, PET_MAX_LV, JOB_MAX, jobOf, equippedPet, petLevel, petAtkPct } from './meta.js';
import {
  collectionBonus, normalizeQuestState, normalizeAchievements, normalizeCodex, equipLevelSum,
} from './quests.js';

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
    // v4.0 장비 인벤토리 — 부위별 아이템(종류·옵션·모양)과 장착 슬롯
    gear: newGearState(),
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
    // v3.3 수집 메타: 순차 미션 · 업적 수령 · 도감 기록
    quests: { idx: 0, claimed: [], done: 0, at: 0 },
    achievements: { claimed: [] },
    codex: { monsters: {}, cities: {}, gear: {} },
    // v3.4 부동산 전략: 호재 뉴스 기록(뉴스 자체는 시간 기반 결정론이라 저장하지 않는다)
    news: { seen: [], log: [], lastBlock: -1 },
    // v3.5 ♾️ 환생(초월): 회차 · 초월석 · 영구 특성. peakStage 는 환생 후에도 남는 역대 최고 기록
    rebirth: { count: 0, points: 0, totalPoints: 0, traits: {}, bestStage: 1, at: 0 },
    peakStage: 1,
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
  // v4.0: 장비 인벤토리 정규화 + v3 등급 저장본 마이그레이션(등급 → 그 등급의 장비 1종)
  s.gear = normalizeGear(raw.gear, s.gearRarity, now);
  syncGearRarity(s);
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
  s.land.landmarks = sanitizeLandmarks(s.land.landmarks, s.land.owned);
  s.land.landmarkSpend = Math.max(0, num(s.land.landmarkSpend, 0));
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
  const rawLevels = rawPet.levels && typeof rawPet.levels === 'object' ? rawPet.levels : {};
  const petLevels = {};
  for (const id of PET_IDS) {
    if (!petIds.includes(id)) continue;
    petLevels[id] = clamp(Math.floor(num(rawLevels[id], 1)), 1, PET_MAX_LV);
  }
  s.pet = {
    equipped: petIds.includes(rawPet.equipped) ? rawPet.equipped : null,
    unlocked: PET_IDS.filter((id) => petIds.includes(id)),
    chosen: rawPet.chosen === true,
    levels: petLevels,
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

  // v3.3: 미션/업적/도감 기본값 병합 (없는 저장본은 그대로 진행도 유지)
  s.quests = normalizeQuestState(raw.quests);
  s.achievements = normalizeAchievements(raw.achievements);
  s.codex = normalizeCodex(raw.codex, s, now);

  // v3.4: 호재 뉴스 기록 기본값 병합(기존 저장본은 빈 기록으로 시작)
  s.news = normalizeNews(raw.news);

  s.level = Math.max(1, Math.floor(num(s.level, 1)));
  s.exp = Math.max(0, num(s.exp, 0));
  s.gold = Math.max(0, Math.floor(num(s.gold, 0)));
  s.shards = Math.max(0, Math.floor(num(s.shards, 0)));
  s.stage = Math.max(1, Math.floor(num(s.stage, 1)));
  s.maxStage = Math.max(s.stage, Math.floor(num(s.maxStage, 1)));

  // v3.5: 환생 기록 정규화 · 역대 최고 스테이지(환생 후에도 남는 기록)
  s.rebirth = normalizeRebirth(raw.rebirth);
  s.peakStage = Math.max(
    1,
    Math.floor(num(s.peakStage, 1)),
    s.maxStage,
    Math.floor(num(s.rebirth.bestStage, 1)),
  );
  s.killsInStage = Math.max(0, Math.floor(num(s.killsInStage, 0)));
  s.totalKills = Math.max(0, Math.floor(num(s.totalKills, 0)));
  s.bossKills = Math.max(0, Math.floor(num(s.bossKills, 0)));
  for (const k of Object.keys(EQUIP)) s.equip[k] = clamp(Math.floor(num(s.equip[k], 0)), 0, EQUIP_MAX_LV);
  // v3.5: 환생으로 장비 강화·전직이 초기화되어도 미션·업적 진행도가 되돌아가지 않도록 역대 최고치를 기록한다.
  s.records.peakEquipLv = Math.max(
    Math.max(0, Math.floor(num(s.records.peakEquipLv, 0))),
    equipLevelSum(s),
  );
  s.records.peakJobTier = Math.max(
    Math.max(0, Math.floor(num(s.records.peakJobTier, 0))),
    Math.max(0, Math.floor(num(s.jobTier, 0))),
  );
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

/** 랜드마크: 보유한 지역의 Lv.1~3 만 남긴다 */
function sanitizeLandmarks(v, owned) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  const held = owned && typeof owned === 'object' ? owned : {};
  for (const [k, raw] of Object.entries(v)) {
    if (!(Math.floor(num(held[k], 0)) > 0)) continue;
    const lv = Math.min(3, Math.floor(num(raw, 0)));
    if (lv >= 1) out[k] = lv;
  }
  return out;
}

/** 호재 뉴스 기록(최근 8건 · 본 뉴스 id 목록) 정규화 */
function normalizeNews(v) {
  const raw = v && typeof v === 'object' ? v : {};
  const seen = Array.isArray(raw.seen)
    ? raw.seen.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 24).slice(-60)
    : [];
  const log = Array.isArray(raw.log)
    ? raw.log
      .filter((e) => e && typeof e === 'object' && typeof e.title === 'string')
      .slice(0, 8)
      .map((e) => ({
        id: typeof e.id === 'string' ? e.id.slice(0, 24) : '',
        block: Math.max(0, Math.floor(num(e.block, 0))),
        at: Math.max(0, num(e.at, 0)),
        icon: typeof e.icon === 'string' ? e.icon.slice(0, 8) : '📰',
        title: e.title.slice(0, 60),
        target: typeof e.target === 'string' ? e.target.slice(0, 20) : '',
        pricePct: Math.max(0, num(e.pricePct, 0)),
        rentPct: Math.max(0, num(e.rentPct, 0)),
      }))
    : [];
  return { seen, log, lastBlock: Math.max(-1, Math.floor(num(raw.lastBlock, -1))) };
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
  const add = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  // v3.4.0: 권역 세트 · 랜드마크 보너스는 건물주 버프와 별도로 더해진다.
  const extraAtk = add(b.setAtkPct) + add(b.landmarkAtkPct);
  const extraGold = add(b.setGoldPct) + add(b.landmarkGoldPct);
  const extraHp = add(b.setHpPct);
  const extraCrit = add(b.setCritPct);
  const extraDrop = add(b.setDropPct);
  const L = s.level;
  const e = s.equip;
  const gr = s.gearRarity || {};
  // 등급 보정: 장비 강화 레벨에 등급 환산 레벨을 더한다(전설 +25강 상당).
  const eLv = (slot) => e[slot] + rarityBonusLv(gr[slot]);
  // v4.0: 장착 장비의 고유 옵션 합계(흡혈·공속·보스 추뎀·치명타·방어·회복·골드·드랍·범위 베기)
  const gm = gearMods(s);
  const job = jobOf(s);
  const pet = equippedPet(s);
  const jobAtkMul = 1 + (job.atkPct || 0) / 100;
  const jobHpMul = 1 + (job.hpPct || 0) / 100;
  const petAtkMul = 1 + (pet ? petAtkPct(s, pet.id) : 0) / 100;
  // v3.3: 도감 수집률 마일스톤 + 수령한 업적의 소폭 영구 보너스(기본 0 → 기존 밸런스 불변)
  const col = collectionBonus(s);
  const colAtkMul = 1 + (col.atkPct || 0) / 100;
  // v3.5: 환생 영구 특성(초월석으로 올린 배율). 모두 0이면 기존 밸런스와 완전히 동일하다.
  const rb = rebirthBonus(s);
  const rbAtkMul = 1 + rb.atkPct / 100;
  const rbHpMul = 1 + rb.hpPct / 100;
  const baseAtk = 12 + 2.6 * L + 0.035 * L * L;
  const equipAtk = EQUIP.weapon.per * eLv('weapon');
  const atk = (baseAtk + equipAtk) * (1 + (b.atkPct + extraAtk + gm.atkPct) / 100) * jobAtkMul * petAtkMul * colAtkMul * rbAtkMul;
  const hpMax =
    (150 + 30 * L + EQUIP.armor.per * eLv('armor') + EQUIP.helmet.per * eLv('helmet'))
    * (1 + (b.hpPct + extraHp + gm.hpPct) / 100) * jobHpMul * rbHpMul;
  const crit = Math.min(0.5, 0.05 + (EQUIP.ring.per / 100) * eLv('ring') + (b.critPct + extraCrit + gm.critPct) / 100);
  const critDmg = 2.0 + rb.critDmgAdd + gm.critDmg / 100;
  // v3.8 방어·회복 — 다굴에서 버티는 힘. 갑옷/투구 강화(등급 환산 포함) + 환생 '수호' 특성 + v4 장비 옵션
  const defFromGear = EQUIP.armor.defPer * eLv('armor') + EQUIP.helmet.defPer * eLv('helmet');
  const dmgReduce = Math.min(DEF.cap, (defFromGear + (rb.guardPct || 0) + gm.dmgRed) / 100);
  const hpRegen = Math.min(0.1, DEF.regenBase + (rb.regenPct || 0) / 100 + gm.regen / 100);
  const goldMult =
    1 + (EQUIP.amulet.per / 100) * eLv('amulet') + (b.goldPct + extraGold + rb.goldPct + gm.goldPct) / 100 + (pet ? pet.goldPct / 100 : 0)
    + (col.goldPct || 0) / 100;
  const dropMult = 1 + (b.dropPct + extraDrop + rb.shardPct + gm.dropPct) / 100;
  // v4.0: 공격 속도 옵션 — 기본 공격 간격을 줄인다(하한 300ms · 최대 40% 단축)
  const attackMs = Math.max(300, (ECON.playerAttackMs - L * 2) * (1 - Math.min(0.4, gm.atkSpd / 100)));
  const lifesteal = Math.min(0.2, gm.lifesteal / 100); // 흡혈 상한 20%
  const bossDmgPct = gm.bossDmg / 100;
  const whirlDmgPct = gm.whirlDmg / 100;
  const dps = (atk / (attackMs / 1000)) * (1 + crit * (critDmg - 1));
  return {
    atk: Math.round(atk),
    hpMax: Math.round(hpMax),
    crit,
    critDmg,
    dmgReduce,
    hpRegen,
    goldMult,
    dropMult,
    attackMs,
    lifesteal,
    bossDmgPct,
    whirlDmgPct,
    dps: Math.round(dps),
    jobTier: job.tier,
    petId: pet ? pet.id : null,
    collectAtkPct: col.atkPct || 0,
    collectGoldPct: col.goldPct || 0,
    setAtkPct: extraAtk,
    setGoldPct: extraGold,
    setDropPct: extraDrop,
    // v3.5 환생 특성(UI 표시용)
    rebirthAtkPct: rb.atkPct,
    rebirthGoldPct: rb.goldPct,
    rebirthHpPct: rb.hpPct,
    rebirthShardPct: rb.shardPct,
    rebirthGuardPct: rb.guardPct || 0,
    rebirthRegenPct: rb.regenPct || 0,
    rebirthCount: rb.count,
    // v3.8 방어 기여도(UI 표시용)
    defFromGear: Math.round(defFromGear * 10) / 10,
    // v4.0 장비 옵션 기여도(UI 표시용)
    gearAtkPct: gm.atkPct,
    gearHpPct: gm.hpPct,
    gearCritPct: gm.critPct,
    gearCritDmgPct: gm.critDmg,
    gearDmgRedPct: gm.dmgRed,
    gearRegenPct: gm.regen,
    gearGoldPct: gm.goldPct,
    gearDropPct: gm.dropPct,
    gearAtkSpdPct: gm.atkSpd,
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
  const raw = stageGoldBase(stage) * ECON.shardShopFactor;
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
 * 장비 뽑기 (v4.0) — 등급을 먼저 뽑고, 그 등급 안에서 **여러 종류의 장비** 중 하나가 나온다.
 *  · 등급이 더 높은 장비는 자동 장착, 같은 등급은 인벤토리에 보관(비교 후 직접 장착).
 *  · 같은 아이템 중복은 강화석으로 자동 분해된다.
 * @returns {{ok:boolean, results?:Array, spent?:number, cur?:string, shards?:number, best?:string, pity?:number, pityLeft?:number, reason?:string}}
 */
export function pullGear(s, times = 1, rng = Math.random, now = nowMs()) {
  const n = times >= 10 ? 10 : 1;
  if (!s.gacha) s.gacha = { pity: 0, total: 0, best: 'common', legend: 0, cur: 'gold' };
  if (!s.gearRarity) s.gearRarity = { weapon: 'common', armor: 'common', helmet: 'common', ring: 'common', amulet: 'common' };
  if (!s.gear) s.gear = newGearState();
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

  // 2) 비용 차감 → 부위 → 종류 → 자동 장착/보관/분해
  s[pay.cur] -= pay.amount;
  const slots = Object.keys(s.gearRarity);
  const results = [];
  let dust = 0;
  let bestIdx = 0;
  let legends = 0;
  for (const idx of rolled) {
    const rarity = RARITIES[idx];
    const slot = slots[Math.floor(rng() * slots.length) % slots.length] || 'weapon';
    const pool = GEAR_BY_RARITY[rarity.id].filter((it) => it.slot === slot);
    const list = pool.length ? pool : GEAR_BY_RARITY[rarity.id];
    const item = list[Math.floor(rng() * list.length) % list.length] || randomItemOfRarity(rarity.id, rng);
    const prevRarity = equippedRarity(s, slot);
    const curIdx = RARITY_INDEX[prevRarity] || 0;
    const equip = shouldAutoEquip(s, item);
    const hadItem = !!equippedItemId(s, slot);
    const acq = acquireGear(s, item.id, { autoEquip: equip, now, source: 'gacha' });
    let shards = acq.shards || 0;
    let replaced = null;
    if (equip) {
      replaced = prevRarity;
      // v3식 '등급만' 있던 슬롯을 교체하면 그 등급은 분해된다(아이템이 있으면 인벤토리에 남는다)
      if (!hadItem && curIdx > 0) { shards += RARITIES[curIdx].dust; s.shards += RARITIES[curIdx].dust; }
    }
    if (shards > 0) dust += shards;
    if (idx > bestIdx) bestIdx = idx;
    if (idx === RARITIES.length - 1) legends += 1;
    results.push({
      slot,
      rarity: rarity.id,
      name: rarity.name,
      rarityName: rarity.name,
      itemId: item.id,
      itemName: item.name,
      equipped: equip,
      duplicate: !!acq.duplicate,
      replaced,
      shards,
    });
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

/** 슬롯에 장착된 아이템 uid(없으면 null) */
function equippedItemId(s, slot) {
  const g = s && s.gear;
  return g && g.equipped ? g.equipped[slot] || null : null;
}

/** 뽑기·미리보기용 비교 — 후보를 장착했다면 스탯이 어떻게 바뀌는지 */
export function compareGear(s, uid, buffs = NO_BUFF) {
  const g = s && s.gear;
  const row = g && Array.isArray(g.items) ? g.items.find((x) => x.uid === Math.floor(Number(uid))) : null;
  const it = row ? gearItem(row.id) : null;
  if (!it) return null;
  const before = calcStats(s, buffs);
  const prev = g.equipped[it.slot];
  g.equipped[it.slot] = row.uid;
  const after = calcStats(s, buffs);
  g.equipped[it.slot] = prev;
  const delta = {};
  for (const k of ['atk', 'hpMax', 'crit', 'critDmg', 'dmgReduce', 'hpRegen', 'goldMult', 'dropMult', 'attackMs', 'dps', 'lifesteal', 'bossDmgPct', 'whirlDmgPct']) {
    delta[k] = (after[k] || 0) - (before[k] || 0);
  }
  return { item: it, before, after, delta, equipped: prev === row.uid, slotRarity: equippedRarity(s, it.slot) };
}

/** 지금 보유 강화석으로 한 번에 올릴 수 있는 최대 강화 횟수 (0 ~ 남은 단계) */
export function enhanceMaxCount(s, slot) {
  if (!s || !(slot in EQUIP)) return 0;
  let lv = Math.max(0, Math.floor(num((s.equip || {})[slot], 0)));
  let shards = Math.max(0, num(s.shards, 0));
  let n = 0;
  while (lv < EQUIP_MAX_LV) {
    const cost = enhanceCost(lv);
    if (shards < cost) break;
    shards -= cost;
    lv += 1;
    n += 1;
  }
  return n;
}

export function tryEnhance(s, slot, times = 1) {
  if (!(slot in EQUIP)) return { ok: false, reason: '알 수 없는 부위입니다.' };
  const want = Math.max(0, Math.min(EQUIP_MAX_LV + 1, Math.floor(Number(times) || 0)));
  let done = 0;
  let spent = 0;
  for (let i = 0; i < want; i++) {
    if (s.equip[slot] >= EQUIP_MAX_LV) return { ok: done > 0, reason: '최대 강화 단계입니다.', done, spent, max: true };
    const cost = enhanceCost(s.equip[slot]);
    if (s.shards < cost) return { ok: done > 0, reason: '강화석이 부족합니다.', done, spent, need: cost };
    s.shards -= cost;
    s.equip[slot] += 1;
    spent += cost;
    done += 1;
  }
  if (s.records) {
    s.records.peakEquipLv = Math.max(Math.max(0, Math.floor(num(s.records.peakEquipLv, 0))), equipLevelSum(s));
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
  // v3.5: S1~30 기존 곱셈 순서 그대로, S31+ 는 ∞ 확장 곡선(data.js INFINITE)
  const hp = monsterBaseHp(s) * (isBoss ? ECON.bossHpMul : 1) * variant;
  const atk = monsterBaseAtk(s) * (isBoss ? ECON.bossAtkMul : 1);
  return { hp: Math.max(1, Math.round(hp)), atk: Math.max(1, Math.round(atk)) };
}

export function killReward(s, stage, isBoss, buffs, rng = Math.random) {
  const rb = rebirthBonus(s);
  const gold = Math.round(
    stageGoldBase(stage) * (isBoss ? ECON.bossGoldMul : 1)
      * (1 + (buffs?.goldPct || 0) / 100 + rb.goldPct / 100) * (0.92 + rng() * 0.16)
  );
  const exp = Math.round(
    stageExpBase(stage) * (isBoss ? ECON.bossExpMul : 1) * (0.95 + rng() * 0.1)
  );
  let shards = 0;
  const dropPct = (buffs?.dropPct || 0) + rb.shardPct;
  if (isBoss) shards = Math.round((ECON.bossShardBase + stage * ECON.bossShardPerStage) * (1 + dropPct / 100));
  else if (rng() < ECON.shardDropChance * (1 + dropPct / 100)) shards = 1;

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
  s.peakStage = Math.max(Math.max(1, Math.floor(num(s.peakStage, 1))), s.maxStage);
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
  const rb = rebirthBonus(s);
  const goldPerKill = stageGoldBase(s.stage) * (1 + (buffs?.goldPct || 0) / 100 + rb.goldPct / 100);
  const expPerKill = stageExpBase(s.stage);
  const gold = Math.floor(goldPerKill * kills * ECON.offlineRate);
  const exp = Math.floor(expPerKill * kills * ECON.offlineRate);
  const shards = Math.floor((sec / 3600) * 3 * (1 + (buffs?.dropPct || 0) / 100 + rb.shardPct / 100));
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

/* ────────────────────────────── 📰 호재 뉴스 기록 (v3.4.0) ────────────────────────────── */
/**
 * 지금 적용 중인 호재를 처음 보았을 때 기록한다(부동산 탭 '최근 호재' · 도감 아님).
 * 뉴스 자체는 시간 기반 결정론이라 저장하지 않고, 본 기록만 남긴다.
 * @returns {boolean} 새로 기록했으면 true
 */
export function recordNews(s, news, now = nowMs()) {
  if (!s || !news) return false;
  if (!s.news || typeof s.news !== 'object') s.news = { seen: [], log: [], lastBlock: -1 };
  if (s.news.lastBlock === news.block) return false;
  s.news.lastBlock = news.block;
  if (!Array.isArray(s.news.seen)) s.news.seen = [];
  if (!s.news.seen.includes(news.id)) s.news.seen.push(news.id);
  s.news.seen = s.news.seen.slice(-60);
  if (!Array.isArray(s.news.log)) s.news.log = [];
  s.news.log.unshift({
    id: news.id,
    block: news.block,
    at: now,
    icon: news.icon,
    title: news.title,
    target: news.targetLabel,
    pricePct: news.pricePct,
    rentPct: news.rentPct,
  });
  s.news.log = s.news.log.slice(0, 8);
  return true;
}
