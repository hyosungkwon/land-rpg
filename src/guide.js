// land-rpg / src/guide.js
// v7.9.0 🧭 전투력(CP) 원천 분석기 & 가성비 성장 내비게이션 Top 3. DOM 의존 없음.
import { EQUIP, EQUIP_SLOTS, SKILLS, SKILL_UPGRADE_MAX, RARITY_INDEX, skillCost } from './data.js';
import { calcStats, enhanceCostFor } from './state.js';
import { gearMods, gearOwned, equippedItem, isMythicSlot } from './gear.js';
import { gemEffects } from './gems.js';
import { relicEffects, RELIC_SLOTS } from './relics.js';
import { guildEffects, KNIGHTS, knightLevel, knightCost } from './guild.js';
import { rebirthStatus, rebirthBonus } from './rebirth.js';
import { jobOf, equippedPet, subPet, petDmgPct, petEvo } from './meta.js';
import { citadelEffects } from './citadel.js';
import { megaEffects } from './bank.js';
import { titleStatus } from './pass.js';
import { landBuffTotals } from './land.js';

/** 종합 전투력(CP) + 6대 성장 원천별 기여도(%) 분석 */
export function computeCpBreakdown(state, buffs = {}) {
  const st = calcStats(state, buffs);
  const cp = Math.max(
    1,
    Math.round(
      (st.dps || 0) * 1.4
      + (st.hpMax || 0) * 0.25
      + (st.dmgReduce || 0) * 1200
      + Math.max(0, (st.critDmg || 2) - 1.5) * 260,
    ),
  );

  // 1) 레벨 · 전직
  const job = jobOf(state);
  const sBase = Math.max(10, (state.level || 1) * 4 + (job.tier || 0) * 35);

  // 2) 장비 · 강화 · 신화 · 보석
  let eqLvSum = 0;
  let rarSum = 0;
  let mythicCnt = 0;
  for (const sl of EQUIP_SLOTS) {
    eqLvSum += Math.max(0, Number(state.equip && state.equip[sl]) || 0);
    const it = equippedItem(state, sl);
    if (it) rarSum += (RARITY_INDEX[it.rarity] || 0) + 1;
    if (isMythicSlot(state, sl)) mythicCnt += 1;
  }
  const gmod = gearMods(state);
  const gem = gemEffects(state);
  const sGear = Math.max(
    0,
    eqLvSum * 3.2 + rarSum * 10 + mythicCnt * 45
    + (gmod.atkPct || 0) + (gmod.hpPct || 0) * 0.7 + (gmod.critDmg || 0) * 0.8 + (gmod.bossDmg || 0) * 0.7
    + (gem.atkPct || 0) * 1.5 + (gem.hpPct || 0) + (gem.critDmg || 0),
  );

  // 3) 부동산 · 성채 · 메가 프로젝트
  const lt = landBuffTotals(buffs);
  const cit = citadelEffects(state);
  const mg = megaEffects(state);
  const sLand = Math.max(
    0,
    (lt.atkPct || 0) * 1.6 + (lt.hpPct || 0) * 1.1 + (lt.critPct || 0) * 2.5 + (lt.critDmgPct || 0) * 0.9 + (lt.bossDmgPct || 0) * 0.9
    + (cit.atkPct || 0) * 1.4 + (cit.hpPct || 0) + (mg.atkPct || 0) * 1.5 + (mg.bossDmgPct || 0) * 1.2,
  );

  // 4) 펫 · 고대 유물 · 영지 기사단
  const eqPet = equippedPet(state);
  const sPet = subPet(state);
  const pDmg = eqPet ? petDmgPct(state, eqPet.id) : 0;
  const spDmg = sPet ? petDmgPct(state, sPet.id) * 0.5 : 0;
  const evoLv = eqPet ? petEvo(state, eqPet.id) : 0;
  const rel = relicEffects(state);
  const gld = guildEffects(state);
  const sComp = Math.max(
    0,
    (pDmg + spDmg) * 45 + evoLv * 24
    + (rel.atkPct || 0) * 1.5 + (rel.bossDmgPct || 0) * 1.2 + (rel.critDmgPct || 0)
    + (gld.atkPct || 0) * 1.6 + (gld.hpPct || 0) + (gld.critDmgPct || 0) * 0.8,
  );

  // 5) 스킬 · 룬 · 칭호
  let skLv = 0;
  let runeCnt = 0;
  if (state.skills) {
    for (const k of Object.keys(SKILLS)) {
      const sk = state.skills[k];
      if (sk) {
        skLv += Math.max(0, Number(sk.lv) || 0);
        if (sk.rune) runeCnt += 1;
      }
    }
  }
  const tit = titleStatus(state).active;
  const sSkill = Math.max(0, skLv * 3.5 + runeCnt * 20 + (tit ? 18 : 0));

  // 6) 환생 · 초월 특성
  const rb = rebirthBonus(state);
  const sRebirth = Math.max(0, (rb.totalLv || 0) * 12 + ((state.rebirth && state.rebirth.count) || 0) * 15);

  const raw = [
    { id: 'gear', icon: '⚔️', label: '장비·보석', color: '#ff8a4d', score: sGear },
    { id: 'base', icon: '🌟', label: '레벨·전직', color: '#6fd3ff', score: sBase },
    { id: 'land', icon: '🏢', label: '부동산·성채', color: '#5ee1a3', score: sLand },
    { id: 'comp', icon: '🐾', label: '펫·유물·기사단', color: '#c084fc', score: sComp },
    { id: 'skill', icon: '💥', label: '스킬·룬·칭호', color: '#ffd76a', score: sSkill },
    { id: 'rebirth', icon: '♾️', label: '환생·초월', color: '#ff6ba8', score: sRebirth },
  ];
  const totalScore = raw.reduce((a, x) => a + x.score, 0) || 1;
  const sources = raw
    .map((x) => ({ ...x, pct: Math.round((x.score / totalScore) * 100) }))
    .sort((a, b) => b.score - a.score);
  return { cp, stats: st, sources };
}

/** 지금 보유 재화·빈 슬롯·해금 상태를 분석해 가장 효율 좋은 성장 행동 Top 3 추천 */
export function recommendGrowth(state, buffs = {}, now = Date.now()) {
  const recs = [];
  const gold = Math.max(0, Number(state.gold) || 0);
  const shards = Math.max(0, Number(state.shards) || 0);
  const medals = Math.max(0, Math.floor(Number(state.invasion && state.invasion.medals) || 0));

  // 1) 장착 비어있는 부위가 있는데 가방에 해당 부위 장비가 있음
  const owned = gearOwned(state);
  const emptyWearable = EQUIP_SLOTS.filter((sl) => !equippedItem(state, sl) && owned.some((r) => r.def.slot === sl));
  if (emptyWearable.length > 0) {
    recs.push({
      id: 'equip-empty',
      prio: 100,
      icon: '🎒',
      title: `빈 장비 슬롯 ${emptyWearable.length}곳 장착 가능`,
      detail: `${EQUIP[emptyWearable[0]].name} 등 보유 장비를 바로 장착하세요`,
      tag: '즉시 상승',
      jumpTab: 'gear',
      jumpSub: '',
    });
  }

  // 2) 빈 보석 소켓 + 보유 보석 있음
  const gs = state.gems || {};
  const bagGems = Object.values(gs.bag || {}).reduce((a, n) => a + (Number(n) || 0), 0);
  const emptySockets = EQUIP_SLOTS.filter((sl) => !(gs.sockets && gs.sockets[sl])).length;
  if (bagGems > 0 && emptySockets > 0) {
    recs.push({
      id: 'gem-socket',
      prio: 95,
      icon: '💠',
      title: `빈 보석 소켓 ${emptySockets}곳 장착 가능`,
      detail: `보유 보석 ${bagGems}개를 장착하면 영구 스탯이 즉시 오릅니다`,
      tag: '무료 스탯',
      jumpTab: 'gear',
      jumpSub: '',
    });
  }

  // 3) 고대 유물 빈 슬롯 또는 무료 감정(훈장)
  const rel = state.relics || { owned: {}, equipped: [] };
  const ownedRelics = Object.keys(rel.owned || {}).length;
  const eqRelics = Array.isArray(rel.equipped) ? rel.equipped.length : 0;
  if (ownedRelics > eqRelics && eqRelics < RELIC_SLOTS) {
    recs.push({
      id: 'relic-equip',
      prio: 92,
      icon: '🏺',
      title: `고대 유물 슬롯 비어 있음 (${eqRelics}/${RELIC_SLOTS})`,
      detail: '보유 중인 유물을 장착해 영구 패시브를 활성화하세요',
      tag: '무료 스탯',
      jumpTab: 'hunt',
      jumpSub: 'growth',
    });
  } else if (medals >= 1) {
    recs.push({
      id: 'relic-summon',
      prio: 84,
      icon: '🏺',
      title: `방어 훈장 ${medals}개로 고대 유물 감정`,
      detail: '새 유물 획득 또는 기존 유물 강화 파편을 얻을 수 있습니다',
      tag: '훈장 사용',
      jumpTab: 'hunt',
      jumpSub: 'growth',
    });
  }

  // 4) 환생 가능 또는 미사용 초월석 3P 이상
  const rb = rebirthStatus(state);
  if (rb.can) {
    recs.push({
      id: 'rebirth-go',
      prio: 88,
      icon: '♾️',
      title: `환생 가능! 초월석 +${rb.gain}P 획득`,
      detail: '부동산·장비·펫·유물은 유지되며 영구 배율이 크게 상승합니다',
      tag: '초월 도약',
      jumpTab: 'hunt',
      jumpSub: 'growth',
    });
  } else if (rb.points >= 3) {
    recs.push({
      id: 'rebirth-trait',
      prio: 82,
      icon: '✨',
      title: `미사용 초월석 ${rb.points}P 투자 가능`,
      detail: '환생 영구 특성으로 공격력·골드·생명을 영구 강화하세요',
      tag: '영구 강화',
      jumpTab: 'hunt',
      jumpSub: 'growth',
    });
  }

  // 5) 장비 강화 여유 (가장 저렴한 무기/갑옷 기준)
  const wLv = Number(state.equip && state.equip.weapon) || 0;
  const aLv = Number(state.equip && state.equip.armor) || 0;
  const wCost = enhanceCostFor(state, wLv);
  const aCost = enhanceCostFor(state, aLv);
  if (shards >= Math.min(wCost, aCost)) {
    const pickW = wCost <= aCost;
    recs.push({
      id: 'enhance-gear',
      prio: 80,
      icon: '🔨',
      title: `${pickW ? `무기 +${wLv + 1}` : `갑옷 +${aLv + 1}`} 강화 가능`,
      detail: `강화석 💎${shards.toLocaleString()} 보유 (필요 💎${pickW ? wCost : aCost})`,
      tag: '고효율 강화',
      jumpTab: 'gear',
      jumpSub: '',
    });
  }

  // 6) 스킬 레벨업 가능
  let bestSkill = null;
  if (state.skills) {
    for (const [k, def] of Object.entries(SKILLS)) {
      const lv = Number(state.skills[k] && state.skills[k].lv) || 0;
      if (lv >= SKILL_UPGRADE_MAX) continue;
      const c = skillCost(lv);
      if (shards >= c && (!bestSkill || c < bestSkill.cost)) bestSkill = { key: k, name: def.name, lv, cost: c };
    }
  }
  if (bestSkill) {
    recs.push({
      id: 'skill-up',
      prio: 76,
      icon: '💥',
      title: `${bestSkill.name} Lv.${bestSkill.lv + 1} 강화 가능`,
      detail: `강화석 💎${bestSkill.cost}로 즉시 전투 화력을 올릴 수 있습니다`,
      tag: '스킬 강화',
      jumpTab: 'hunt',
      jumpSub: 'skill',
    });
  }

  // 7) 영지 기사단 영입/강화 가능
  for (const kn of KNIGHTS) {
    const lv = knightLevel(state, kn.id);
    const c = knightCost(lv);
    if (c && gold >= c.gold && shards >= c.shards && medals >= c.medals) {
      recs.push({
        id: 'knight-up',
        prio: 74,
        icon: kn.icon,
        title: `${kn.name} ${lv > 0 ? `Lv.${lv + 1} 강화` : '영입'} 가능`,
        detail: `${kn.desc} · 환생 후에도 영구 유지`,
        tag: '기사단',
        jumpTab: 'hunt',
        jumpSub: 'growth',
      });
      break;
    }
  }

  // 8) 부동산 투자 추천 (건물주 버프)
  const ownedCities = Object.values((state.land && state.land.owned) || {}).filter((n) => n > 0).length;
  if (gold >= 500 && (ownedCities < 5 || gold >= 25000)) {
    recs.push({
      id: 'buy-land',
      prio: ownedCities === 0 ? 90 : 72,
      icon: '🏢',
      title: ownedCities === 0 ? '첫 부동산 매수로 영구 버프 개방' : '보유 골드로 부동산 분산 투자',
      detail: ownedCities === 0
        ? '1평만 사도 영구 공격·골드 버프와 시간당 임대수익이 시작됩니다'
        : `현재 ${ownedCities}곳 보유 중 · 권역 세트 완성 시 추가 보너스`,
      tag: '영구 버프',
      jumpTab: 'land',
      jumpSub: '',
    });
  }

  recs.sort((a, b) => b.prio - a.prio);
  const top3 = recs.slice(0, 3);
  if (!top3.length) {
    top3.push({
      id: 'keep-hunting',
      prio: 10,
      icon: '⚔️',
      title: '사냥·특수 던전으로 재화 수집',
      detail: '피버 타임·캔버스 탭 일격과 황금 던전/무한 균열로 골드와 강화석을 모으세요',
      tag: '진행 중',
      jumpTab: 'hunt',
      jumpSub: 'growth',
    });
  }
  return top3;
}
