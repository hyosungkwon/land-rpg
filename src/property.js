// land-rpg / src/property.js
// korea-land-4e0c2 의 users/{uid}/state → RPG 영구 버프 계산.
// 순수 함수만 둔다(파이어베이스 접근은 firebase.js).
import { PROP_BUFFS, ECON } from './data.js';

export const EMPTY_PROP = {
  connected: false, // 로그인 + 부동산 데이터 읽기 성공
  nickname: '',
  cash: 0,
  bestAsset: 0,
  buildings: 0,
  totalPyeong: 0,
  pendingIncome: 0,
  raw: null,
};

/** RTDB users/{uid}/state 스냅샷을 RPG가 쓰는 형태로 정규화 */
export function normalizeProperty(stateVal, pendingIncome = 0) {
  if (!stateVal || typeof stateVal !== 'object') return { ...EMPTY_PROP, pendingIncome: Number(pendingIncome) || 0 };
  const owned = stateVal.owned && typeof stateVal.owned === 'object' ? stateVal.owned : {};
  let buildings = 0;
  let totalPyeong = 0;
  for (const [, qty] of Object.entries(owned)) {
    const q = Number(qty) || 0;
    if (q > 0) {
      buildings += 1;
      totalPyeong += q;
    }
  }
  return {
    connected: true,
    nickname: String(stateVal.nickname || ''),
    cash: Number(stateVal.cash) || 0,
    bestAsset: Number(stateVal.bestAsset) || 0,
    buildings,
    totalPyeong,
    pendingIncome: Number(pendingIncome) || 0,
    raw: stateVal,
  };
}

/** 부동산 → RPG 영구 패시브 버프 */
export function computeBuffs(prop) {
  const p = prop || EMPTY_PROP;
  if (!p.connected) {
    return {
      atkPct: 0, goldPct: 0, hpPct: 0, dropPct: 0,
      buildings: 0, totalPyeong: 0, bestAsset: 0, active: false,
    };
  }
  const B = PROP_BUFFS;
  const atkPct = Math.min(B.atkCap, p.buildings * B.atkPerBuilding);
  const goldPct = Math.min(B.goldCap, Math.floor(p.bestAsset / 100000000) * B.goldPerEok);
  const hpPct = Math.min(B.hpCap, Math.floor(p.totalPyeong / 100) * 5);
  const dropPct = Math.min(B.dropCap, Math.floor(p.totalPyeong / B.dropPer500) * B.dropPerPyeong);
  return {
    atkPct, goldPct, hpPct, dropPct,
    buildings: p.buildings,
    totalPyeong: p.totalPyeong,
    bestAsset: p.bestAsset,
    active: atkPct + goldPct + hpPct + dropPct > 0,
  };
}

/** 다음 버프 단계까지 진행도(UI 게이지용) */
export function buffProgress(prop) {
  const B = PROP_BUFFS;
  const p = prop || EMPTY_PROP;
  const cap = (v, max) => Math.min(1, max > 0 ? v / max : 0);
  const atkNext = p.buildings < B.atkCap / B.atkPerBuilding
    ? `다음 지역 +1곳 → 공격력 +${B.atkPerBuilding}%` : '최대치';
  const goldNext = p.bestAsset < B.goldCap * 1000000
    ? `다음 1억 자산 → 골드 +${B.goldPerEok}%` : '최대치';
  return {
    atk: { pct: cap(p.buildings * B.atkPerBuilding, B.atkCap), next: atkNext },
    gold: { pct: cap(Math.floor(p.bestAsset / 100000000) * B.goldPerEok, B.goldCap), next: goldNext },
    hp: { pct: cap(Math.floor(p.totalPyeong / 100) * 5, B.hpCap), next: `보유 100평당 체력 +5% (현재 ${p.totalPyeong.toLocaleString()}평)` },
    drop: { pct: cap(Math.floor(p.totalPyeong / B.dropPer500) * B.dropPerPyeong, B.dropCap), next: `보유 500평당 드롭 +1%` },
  };
}

/** 미수령 배당 → 강화석 환산 (워터마크 초과분만, 원본은 건드리지 않음) */
export function dividendReward(pendingIncome, watermark) {
  const pending = Math.max(0, Number(pendingIncome) || 0);
  const base = Math.max(0, Number(watermark) || 0);
  const delta = Math.max(0, pending - base);
  const shards = Math.min(ECON.dividendShardMax, Math.floor(delta / ECON.dividendShardPer));
  return { shards, delta, pending, base };
}

/** 보유 부동산 요약 문구 */
export function propertySummary(prop) {
  if (!prop || !prop.connected) return '부동산 계정이 연결되지 않았습니다.';
  return `${prop.nickname || '플레이어'} · 지역 ${prop.buildings}곳 · ${prop.totalPyeong.toLocaleString()}평`;
}

export function formatMan(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString();
}
