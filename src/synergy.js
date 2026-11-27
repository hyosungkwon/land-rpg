// land-rpg / src/synergy.js
// v4.6.0 부동산 → 전투 시너지. 부동산 전략(랜드마크·권역 완성)이 사냥 전투에
// 실제로 힘을 보태도록 수치를 계산한다. 순수 계산만 담당(DOM/네트워크 의존 없음).
//
//  - 랜드마크 레벨 합계 → 치명타 피해 · 스킬 쿨타임 감소 · 보스 추가 피해
//      Lv.1 상가 +1레벨, Lv.2 타워 +2, Lv.3 메가 +3 … 합계가 클수록 강해지고 상한이 있다.
//  - Lv.3 메가 랜드마크 1개당 → 경험치 획득 +4% (최대 +20%)
//  - 권역 세트 최대 단계(완성) → 권역별 전투 시너지(REGION_SETS[i].master)
//
// land.js 의 computeBuffs 가 landSynergy(state) 를 읽어 스탯(buffs)에 실어 보내고,
// state.js 의 calcStats · killReward 가 그 값을 실제 전투에 반영한다.
import { regionSetStatus, buffText } from './region.js';

const num = (v, d = 0) => {
  if (typeof v === 'number' && isFinite(v)) return v;
  const n = Number(v);
  return isFinite(n) ? n : d;
};
const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ══════════════════ 랜드마크 전투 시너지 ══════════════════
 * 예) 메가 랜드마크 2개(Lv.3+3=6) + 타워 1개(2) = 레벨 합 8
 *     → 치명타 피해 +8% · 쿨감 -6.4% · 보스 피해 +6.4% · 경험치 +8%
 */
export const LAND_SYNERGY = {
  maxLevel: 3,
  // 랜드마크 '레벨 합계' 1당 상승치
  perLevel: { critDmgPct: 1, cdrPct: 0.8, bossDmgPct: 0.8 },
  // 상한 — 랜드마크를 아무리 세워도 이 이상은 오르지 않는다
  caps: { critDmgPct: 24, cdrPct: 12, bossDmgPct: 16 },
  // Lv.3 메가 랜드마크 1개당
  mega: { expPct: 4 },
  megaCaps: { expPct: 20 },
  cdrHardCap: 30, // 스킬 쿨타임 감소 총 상한(%) — 장비 옵션과 합쳐도 30%
};

/** 랜드마크 레벨 합계·메가 개수 → 전투 시너지 */
export function landmarkSynergy(state) {
  const land = (state && state.land) || {};
  const lms = land.landmarks && typeof land.landmarks === 'object' ? land.landmarks : {};
  const owned = land.owned && typeof land.owned === 'object' ? land.owned : {};
  let levels = 0;
  let count = 0;
  let mega = 0;
  const byLevel = [0, 0, 0];
  for (const [key, raw] of Object.entries(lms)) {
    if (!(Math.floor(num(owned[key])) > 0)) continue;
    const lv = clamp(Math.floor(num(raw)), 0, LAND_SYNERGY.maxLevel);
    if (!lv) continue;
    levels += lv;
    count += 1;
    byLevel[lv - 1] += 1;
    if (lv >= LAND_SYNERGY.maxLevel) mega += 1;
  }
  const per = LAND_SYNERGY.perLevel;
  const cap = LAND_SYNERGY.caps;
  const cap1 = (v, m) => round1(Math.min(m, v));
  return {
    levels,
    count,
    mega,
    byLevel,
    critDmgPct: cap1(levels * per.critDmgPct, cap.critDmgPct),
    cdrPct: cap1(levels * per.cdrPct, cap.cdrPct),
    bossDmgPct: cap1(levels * per.bossDmgPct, cap.bossDmgPct),
    expPct: cap1(mega * LAND_SYNERGY.mega.expPct, LAND_SYNERGY.megaCaps.expPct),
  };
}

/* ══════════════════ 권역 완성(세트 최대 단계) 시너지 ══════════════════ */
/** 권역 세트를 최대 단계까지 채웠을 때의 전투 시너지(세트별 정의는 region.js) */
export function regionCompleteSynergy(owned) {
  const sets = regionSetStatus(owned);
  const done = sets.filter((st) => st.maxLevel > 0 && st.level >= st.maxLevel);
  const buffs = {};
  for (const st of done) {
    const m = st.masterBuffs || {};
    for (const [k, v] of Object.entries(m)) if (Number(v) > 0) buffs[k] = round1((buffs[k] || 0) + Number(v));
  }
  return {
    count: done.length,
    total: sets.length,
    ids: done.map((st) => st.id),
    names: done.map((st) => st.name),
    sets: done,
    buffs,
    text: buffText(buffs),
  };
}

/* ══════════════════ 합계 ══════════════════ */
const PCT_KEYS = ['atkPct', 'goldPct', 'dropPct', 'critDmgPct', 'cdrPct', 'bossDmgPct', 'expPct'];

/**
 * 부동산 전투 시너지 합계 — 사냥 탭·부동산 탭이 같은 숫자를 보여 준다.
 * @param {object} state 통합 상태
 * @param {object} [owned] 보유 지역(없으면 state.land.owned)
 */
export function landSynergy(state, owned = null) {
  const hold = owned && typeof owned === 'object' ? owned : ((state && state.land && state.land.owned) || {});
  const lm = landmarkSynergy(state);
  const rg = regionCompleteSynergy(hold);
  const tot = { atkPct: 0, goldPct: 0, dropPct: 0, critDmgPct: 0, cdrPct: 0, bossDmgPct: 0, expPct: 0 };
  for (const k of PCT_KEYS) tot[k] = round1((lm[k] || 0) + (rg.buffs[k] || 0));
  tot.cdrPct = round1(Math.min(LAND_SYNERGY.cdrHardCap, tot.cdrPct));
  tot.landmark = lm;
  tot.region = rg;
  tot.text = buffText(tot);
  tot.parts = [];
  if (lm.levels > 0) tot.parts.push(`🏛️ 랜드마크 ${lm.count}개(Lv합 ${lm.levels})`);
  if (lm.mega > 0) tot.parts.push(`🏙️ 메가 ${lm.mega}개`);
  if (rg.count > 0) tot.parts.push(`🗺️ 권역 완성 ${rg.count}/${rg.total}`);
  tot.active = lm.levels > 0 || rg.count > 0;
  tot.count = lm.count + rg.count;
  return tot;
}

/** 짧은 한 줄 요약 — "치명타 피해 +8% · 쿨감 -6.4% · 보스 +6.4%" */
export function synergyLine(syn) {
  return syn ? syn.text : '';
}

/**
 * 부동산이 지금 주는 전투 버프 '합계' — 건물주 + 권역 세트 + 랜드마크 + v4.6 시너지.
 * 사냥 탭(스킬·스탯)과 부동산 탭(요약 바·시너지 카드)이 이 숫자를 그대로 쓴다.
 * @param {object} buffs computeBuffs(state) 결과
 */
export function landBuffTotals(buffs) {
  const b = buffs || {};
  const n = (v) => {
    const x = Number(v);
    return isFinite(x) ? x : 0;
  };
  return {
    atkPct: round1(n(b.atkPct) + n(b.setAtkPct) + n(b.landmarkAtkPct) + n(b.synAtkPct)),
    goldPct: round1(n(b.goldPct) + n(b.setGoldPct) + n(b.landmarkGoldPct) + n(b.synGoldPct)),
    hpPct: round1(n(b.hpPct) + n(b.setHpPct)),
    critPct: round1(n(b.critPct) + n(b.setCritPct)),
    dropPct: round1(n(b.dropPct) + n(b.setDropPct) + n(b.synDropPct)),
    critDmgPct: round1(n(b.synCritDmgPct)),
    cdrPct: round1(n(b.synCdrPct)),
    bossDmgPct: round1(n(b.synBossDmgPct)),
    expPct: round1(n(b.synExpPct)),
  };
}

/** 합계 → 한 줄 텍스트(0인 항목은 빠진다) */
export function landBuffTotalsText(buffs) {
  return buffText(landBuffTotals(buffs));
}

/** v8.1.0 — 요약 바 1줄용 축약: 앞 max개만 보여 주고 나머지는 '외 N'으로 접는다 */
export function landBuffTotalsShort(buffs, max = 2) {
  const full = landBuffTotalsText(buffs);
  if (!full) return '';
  const parts = full.split(' · ');
  if (parts.length <= max) return full;
  return `${parts.slice(0, max).join(' · ')} 외 ${parts.length - max}`;
}

/** 다음 랜드마크 한 칸이 주는 상승치(UI 진행 안내용) */
export function nextLandmarkStep(state) {
  const lm = landmarkSynergy(state);
  const per = LAND_SYNERGY.perLevel;
  const cap = LAND_SYNERGY.caps;
  const add = (cur, plus, max) => Math.max(0, round1(Math.min(max, cur + plus) - cur));
  return {
    levels: lm.levels,
    mega: lm.mega,
    critDmgPct: add(lm.critDmgPct, per.critDmgPct, cap.critDmgPct),
    cdrPct: add(lm.cdrPct, per.cdrPct, cap.cdrPct),
    bossDmgPct: add(lm.bossDmgPct, per.bossDmgPct, cap.bossDmgPct),
    expPct: lm.mega < LAND_SYNERGY.megaCaps.expPct / LAND_SYNERGY.mega.expPct ? LAND_SYNERGY.mega.expPct : 0,
  };
}
