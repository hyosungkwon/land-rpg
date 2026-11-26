// land-rpg / src/guild.js
// v6.9.0 🛡️ 영지 기사단(용병 4인 영입·육성) · 🐉 주간 거대 레이드 토벌전(오프라인·게스트 협동 토벌).
// DOM/네트워크 의존 없음 → 헤드리스 검증 가능.
import { stageGoldBase } from './data.js';
import { birthState } from './rebirth.js';
import { acquireGear, randomItemOfRarity } from './gear.js';
import { GEMS, defaultGems } from './gems.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(Number(v)) ? Number(v) : d);
const KST_MS = 9 * 3600 * 1000;

function guildDayKey(now = Date.now()) {
  const d = new Date(Math.floor(num(now, Date.now())) + KST_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function guildWeekKey(now = Date.now()) {
  const t = Math.floor(num(now, Date.now())) + KST_MS;
  const d = new Date(t);
  const dow = (d.getUTCDay() + 6) % 7; // 월=0 .. 일=6
  const mon = new Date(t - dow * 86400000);
  const y = mon.getUTCFullYear();
  const m = String(mon.getUTCMonth() + 1).padStart(2, '0');
  const day = String(mon.getUTCDate()).padStart(2, '0');
  return `${y}-W-${m}${day}`;
}

/* ────────────────────────────── 🛡️ 영지 기사단 (용병 4인) ────────────────────────────── */
export const KNIGHT_MAX_LV = 10;
export const KNIGHTS = [
  {
    id: 'paladin', icon: '🛡️', name: '성기사 아서', role: '수호 탱커', color: '#69c0ff', raidMul: 1.1,
    desc: '최대 체력 +4%/Lv · 피해 감소 +1%/Lv',
    effect: (lv) => `체력 +${lv * 4}% · 방어 +${lv}%`,
  },
  {
    id: 'archer', icon: '🏹', name: '명사수 실비아', role: '치명 궁수', color: '#5ee1a3', raidMul: 1.25,
    desc: '치명타 +0.8%/Lv · 치명 피해 +4%/Lv',
    effect: (lv) => `치명 +${(lv * 0.8).toFixed(1)}% · 치피 +${lv * 4}%`,
  },
  {
    id: 'mage', icon: '🔮', name: '대마도사 멀린', role: '화력 마법', color: '#b98bff', raidMul: 1.3,
    desc: '공격력 +4%/Lv · 스킬 쿨감 +0.8%/Lv',
    effect: (lv) => `공격 +${lv * 4}% · 쿨감 +${(lv * 0.8).toFixed(1)}%`,
  },
  {
    id: 'merchant', icon: '💰', name: '대상인 마르코', role: '영지 보급', color: '#ffcf5c', raidMul: 0.9,
    desc: '골드 획득 +5%/Lv · 드롭률 +3%/Lv',
    effect: (lv) => `골드 +${lv * 5}% · 드롭 +${lv * 3}%`,
  },
];
export const KNIGHT_BY_ID = KNIGHTS.reduce((m, k) => { m[k.id] = k; return m; }, {});

export function knightCost(lv) {
  const cur = Math.max(0, Math.floor(num(lv, 0)));
  if (cur >= KNIGHT_MAX_LV) return null;
  return {
    gold: Math.round(60000 * Math.pow(1.65, cur)),
    shards: Math.round(45 * Math.pow(1.4, cur)),
    medals: cur >= 5 ? 1 : 0,
  };
}

/* ────────────────────────────── 🐉 주간 거대 레이드 토벌전 ────────────────────────────── */
export const RAID_DAILY_TICKETS = 3;
export const RAID_BOSSES = [
  { id: 'bahamut', icon: '🐉', name: '심연의 고룡 바하무트', color: '#ff6b6b', title: '고대 용왕' },
  { id: 'surtur',  icon: '🔥', name: '화산 군주 수르트',     color: '#ff9248', title: '화염 거인' },
  { id: 'freya',   icon: '❄️', name: '빙결의 여제 프레이야', color: '#69c0ff', title: '만년설 지배자' },
  { id: 'lich',    icon: '💀', name: '망자의 황제 리치로드', color: '#b98bff', title: '불사의 군주' },
];

export const RAID_PHASES = [
  { pct: 25,  label: '1페이즈 (25%)',  goldMul: 60,  shards: 60,  points: 0,  medals: 0, gemLv: 0, legend: false },
  { pct: 50,  label: '2페이즈 (50%)',  goldMul: 90,  shards: 120, points: 6,  medals: 0, gemLv: 0, legend: false },
  { pct: 75,  label: '3페이즈 (75%)',  goldMul: 130, shards: 200, points: 10, medals: 1, gemLv: 2, legend: false },
  { pct: 100, label: '완전 토벌!',      goldMul: 200, shards: 320, points: 15, medals: 2, gemLv: 0, legend: true },
];

export function defaultGuild(now = Date.now()) {
  return {
    knights: { paladin: 0, archer: 0, mage: 0, merchant: 0 },
    raid: {
      week: guildWeekKey(now),
      day: guildDayKey(now),
      usedToday: 0,
      damage: 0,
      maxHp: 0,
      claimed: [], // [0, 1, 2, 3]
      attacks: 0,
      clears: 0,
    },
  };
}

export function normalizeGuild(raw, now = Date.now()) {
  const d = defaultGuild(now);
  if (!raw || typeof raw !== 'object') return d;
  const srcK = raw.knights && typeof raw.knights === 'object' ? raw.knights : {};
  for (const k of KNIGHTS) {
    d.knights[k.id] = Math.max(0, Math.min(KNIGHT_MAX_LV, Math.floor(num(srcK[k.id], 0))));
  }
  const srcR = raw.raid && typeof raw.raid === 'object' ? raw.raid : {};
  const wk = guildWeekKey(now);
  const dy = guildDayKey(now);
  d.raid.clears = Math.max(0, Math.floor(num(srcR.clears, 0)));
  if (srcR.week === wk) {
    d.raid.damage = Math.max(0, Math.floor(num(srcR.damage, 0)));
    d.raid.maxHp = Math.max(0, Math.floor(num(srcR.maxHp, 0)));
    d.raid.attacks = Math.max(0, Math.floor(num(srcR.attacks, 0)));
    d.raid.claimed = Array.isArray(srcR.claimed)
      ? [...new Set(srcR.claimed.map((v) => Math.floor(num(v, -1))).filter((v) => v >= 0 && v < RAID_PHASES.length))].sort((a, b) => a - b)
      : [];
    d.raid.usedToday = srcR.day === dy ? Math.max(0, Math.min(RAID_DAILY_TICKETS, Math.floor(num(srcR.usedToday, 0)))) : 0;
  }
  return d;
}

export function knightLevel(state, id) {
  const k = state && state.guild && state.guild.knights;
  return k ? Math.max(0, Math.min(KNIGHT_MAX_LV, Math.floor(num(k[id], 0)))) : 0;
}

/** 영지 기사단 합산 패시브 (미영입 시 전부 0 → 기본 밸런스 불변) */
export function guildEffects(state) {
  const pal = knightLevel(state, 'paladin');
  const arc = knightLevel(state, 'archer');
  const mag = knightLevel(state, 'mage');
  const mer = knightLevel(state, 'merchant');
  const recruited = (pal > 0 ? 1 : 0) + (arc > 0 ? 1 : 0) + (mag > 0 ? 1 : 0) + (mer > 0 ? 1 : 0);
  const totalLv = pal + arc + mag + mer;
  // 기사단 레이드 협동 배율 (용병 영입·레벨에 따라 합동 공격력 증폭)
  const raidBonusMul = 1 + pal * 0.11 + arc * 0.125 + mag * 0.13 + mer * 0.09;
  return {
    atkPct: mag * 4,
    hpPct: pal * 4,
    dmgRedPct: pal * 1,
    critPct: Math.round(arc * 0.8 * 10) / 10,
    critDmgPct: arc * 4,
    cdrPct: Math.round(mag * 0.8 * 10) / 10,
    goldPct: mer * 5,
    dropPct: mer * 3,
    recruited,
    totalLv,
    maxTotalLv: KNIGHTS.length * KNIGHT_MAX_LV,
    raidBonusMul,
  };
}

/** 용병 영입 / 레벨업 */
export function upgradeKnight(state, id) {
  const def = KNIGHT_BY_ID[id];
  if (!state || !def) return { ok: false, reason: '알 수 없는 기사입니다.' };
  if (!state.guild || typeof state.guild !== 'object') state.guild = defaultGuild();
  const lv = knightLevel(state, id);
  if (lv >= KNIGHT_MAX_LV) return { ok: false, reason: '이미 최고 등급입니다.' };
  const cost = knightCost(lv);
  if (Math.floor(num(state.gold, 0)) < cost.gold) return { ok: false, reason: `골드가 부족합니다. (필요 💰${cost.gold.toLocaleString()})` };
  if (Math.floor(num(state.shards, 0)) < cost.shards) return { ok: false, reason: `강화석이 부족합니다. (필요 💎${cost.shards})` };
  const medals = Math.max(0, Math.floor(num(state.invasion && state.invasion.medals, 0)));
  if (medals < cost.medals) return { ok: false, reason: `방어 훈장이 부족합니다. (필요 🏅${cost.medals})` };
  state.gold = Math.max(0, Math.floor(num(state.gold, 0)) - cost.gold);
  state.shards = Math.max(0, Math.floor(num(state.shards, 0)) - cost.shards);
  if (cost.medals > 0) state.invasion.medals = Math.max(0, medals - cost.medals);
  state.guild.knights[id] = lv + 1;
  return { ok: true, id, def, lv: lv + 1, recruited: lv === 0, spent: cost };
}

/** 주간 레이드 보스 결정 + 현재 상태 조회 */
export function raidStatus(state, stats = null, now = Date.now()) {
  const g = normalizeGuild(state && state.guild, now);
  const wk = g.raid.week;
  let hash = 0;
  for (let i = 0; i < wk.length; i++) hash = (hash * 31 + wk.charCodeAt(i)) >>> 0;
  const boss = RAID_BOSSES[hash % RAID_BOSSES.length];
  const dps = Math.max(50, Math.round(num(stats && stats.dps, 100)));
  const maxHp = g.raid.maxHp > 0 ? g.raid.maxHp : Math.max(10000, Math.round(dps * 90));
  const damage = Math.min(maxHp, g.raid.damage);
  const pct = Math.min(100, Math.round((damage / Math.max(1, maxHp)) * 1000) / 10);
  const leftTickets = Math.max(0, RAID_DAILY_TICKETS - g.raid.usedToday);
  const phases = RAID_PHASES.map((ph, idx) => {
    const claimed = g.raid.claimed.includes(idx);
    const unlocked = pct >= ph.pct;
    return { ...ph, idx, claimed, unlocked, claimable: unlocked && !claimed };
  });
  const readyCount = phases.filter((p) => p.claimable).length;
  return {
    boss,
    week: wk,
    maxHp,
    damage,
    hpLeft: Math.max(0, maxHp - damage),
    pct,
    defeated: damage >= maxHp,
    leftTickets,
    maxTickets: RAID_DAILY_TICKETS,
    attacks: g.raid.attacks,
    clears: g.raid.clears,
    phases,
    readyCount,
  };
}

/** 🐉 영지 기사단 합동 일제 공격 실행 */
export function attackRaidBoss(state, stats, now = Date.now(), rng = Math.random) {
  if (!state) return { ok: false, reason: '상태 정보가 없습니다.' };
  state.guild = normalizeGuild(state.guild, now);
  const st = raidStatus(state, stats, now);
  if (st.defeated) return { ok: false, reason: '이번 주 거대 레이드 보스를 이미 완전 토벌했습니다!' };
  if (st.leftTickets <= 0) return { ok: false, reason: '오늘 레이드 출격 횟수(3회)를 모두 사용했습니다.' };

  const eff = guildEffects(state);
  const dps = Math.max(50, Math.round(num(stats && stats.dps, 100)));
  const critRoll = rng() < 0.25 ? 1.35 : 0.92 + rng() * 0.2;
  const dmg = Math.max(500, Math.round(dps * 20 * eff.raidBonusMul * critRoll));

  if (state.guild.raid.maxHp <= 0) state.guild.raid.maxHp = st.maxHp;
  state.guild.raid.damage = Math.min(state.guild.raid.maxHp, state.guild.raid.damage + dmg);
  state.guild.raid.usedToday += 1;
  state.guild.raid.attacks += 1;
  const defeatedNow = state.guild.raid.damage >= state.guild.raid.maxHp;
  if (defeatedNow) state.guild.raid.clears += 1;

  // 출격 즉시 소량 참여 보상
  const refStage = Math.max(1, Math.floor(num(state.peakStage || state.maxStage || state.stage, 1)));
  const gold = Math.max(500, Math.round(stageGoldBase(refStage) * 28));
  const shards = 20 + eff.recruited * 6;
  state.gold = Math.max(0, Math.floor(num(state.gold, 0))) + gold;
  state.shards = Math.max(0, Math.floor(num(state.shards, 0))) + shards;
  if (state.records) state.records.totalGold = (state.records.totalGold || 0) + gold;

  return {
    ok: true,
    boss: st.boss,
    dmg,
    crit: critRoll > 1.3,
    gold,
    shards,
    pct: Math.min(100, Math.round((state.guild.raid.damage / Math.max(1, state.guild.raid.maxHp)) * 1000) / 10),
    defeated: defeatedNow,
    leftTickets: Math.max(0, RAID_DAILY_TICKETS - state.guild.raid.usedToday),
  };
}

/** 레이드 페이즈 보상 수령 */
export function claimRaidPhase(state, phaseIdx, now = Date.now(), rng = Math.random) {
  if (!state) return { ok: false, reason: '상태 정보가 없습니다.' };
  state.guild = normalizeGuild(state.guild, now);
  const idx = Math.floor(num(phaseIdx, -1));
  const st = raidStatus(state, null, now);
  const ph = st.phases[idx];
  if (!ph) return { ok: false, reason: '잘못된 페이즈입니다.' };
  if (ph.claimed) return { ok: false, reason: '이미 수령한 보상입니다.' };
  if (!ph.unlocked) return { ok: false, reason: `레이드 진행도 ${ph.pct}% 달성 후 수령할 수 있습니다.` };

  const refStage = Math.max(1, Math.floor(num(state.peakStage || state.maxStage || state.stage, 1)));
  const gold = Math.max(1000, Math.round(stageGoldBase(refStage) * ph.goldMul));
  state.gold = Math.max(0, Math.floor(num(state.gold, 0))) + gold;
  state.shards = Math.max(0, Math.floor(num(state.shards, 0))) + ph.shards;
  if (state.records) state.records.totalGold = (state.records.totalGold || 0) + gold;
  if (ph.points > 0) {
    const rb = birthState(state);
    rb.points = Math.max(0, Math.floor(num(rb.points, 0))) + ph.points;
    rb.totalPoints = Math.max(0, Math.floor(num(rb.totalPoints, 0))) + ph.points;
  }
  if (ph.medals > 0) {
    if (!state.invasion || typeof state.invasion !== 'object') state.invasion = { wins: 0, medals: 0, lastBlock: -1, booms: {}, last: null };
    state.invasion.medals = Math.max(0, Math.floor(num(state.invasion.medals, 0))) + ph.medals;
  }
  let bonusGem = null;
  if (ph.gemLv > 0) {
    const gem = GEMS[Math.floor(rng() * GEMS.length) % GEMS.length] || GEMS[0];
    if (!state.gems || typeof state.gems !== 'object') state.gems = defaultGems();
    if (!state.gems.bag[gem.id]) state.gems.bag[gem.id] = [0, 0, 0, 0, 0];
    state.gems.bag[gem.id][ph.gemLv - 1] = Math.min(999, (state.gems.bag[gem.id][ph.gemLv - 1] || 0) + 1);
    bonusGem = { ...gem, lv: ph.gemLv };
  }
  let item = null;
  if (ph.legend) {
    const pick = randomItemOfRarity('legend', rng);
    if (pick) {
      const r = acquireGear(state, pick.id, { autoEquip: false, now, source: 'raid', rollAffix: true, rng });
      if (r.ok) item = r.item;
    }
  }
  state.guild.raid.claimed.push(idx);
  return { ok: true, phase: ph, gold, shards: ph.shards, points: ph.points, medals: ph.medals, bonusGem, item };
}
