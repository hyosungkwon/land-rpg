// land-rpg / src/region.js
// v3.4.0 부동산 전략 데이터 — ① 권역 세트(지역 시너지) ② 호재/테마 뉴스 ③ 지역 인덱스.
// 순수 데이터·계산만 담당(DOM/네트워크 의존 없음). land.js 가 이 모듈을 읽어
// 시세 보정 · 임대수익 · 건물주 버프에 실제로 반영한다.
//
//  - 뉴스는 시간 기반 결정론 모델: 3분 블록마다 하나의 호재가 정해지고 3분 동안 지속된다.
//    (모든 기기가 같은 순간 같은 호재를 본다 — 시세 모델과 같은 방식)
//  - 권역 세트는 시/도·권역을 7개 권역으로 묶고, 그 권역에서 보유한 '지역 수'로 단계가 열린다.
import { LAND_TIERS } from './land-data.js';

export const NEWS_INTERVAL_MS = 3 * 60 * 1000; // 3분마다 새 호재 · 3분 지속

/* ─────────────── 결정론적 난수(land.js 와 같은 방식) ─────────────── */
const hashStr = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
};
const seeded = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

/* ══════════════════ ① 권역 세트 ══════════════════
 * 시/도 → 7개 권역. levels[i] = 그 단계에 필요한 '보유 지역 수'와 버프.
 *  - rentPct  : 그 권역 지역의 임대수익 배율(지역 시너지)
 *  - atk/gold/drop/hp/crit : 캐릭터 영구 버프(건물주 버프와 별도로 가산)
 */
export const REGION_SETS = [
  {
    id: 'seoul', name: '서울권', icon: '🏙️', color: '#69c0ff',
    line: '수도권 핵심 · 임대수익',
    levels: [
      { need: 3, buffs: { rentPct: 8 } },
      { need: 6, buffs: { rentPct: 16 } },
      { need: 10, buffs: { rentPct: 26 } },
    ],
    // v4.6 권역 완성(최대 단계) — 전투 시너지
    master: { critDmgPct: 6 },
  },
  {
    id: 'gyeonggi', name: '경기·인천권', icon: '🏭', color: '#5ee1a3',
    line: '산업 배후 · 공격력',
    levels: [
      { need: 3, buffs: { atkPct: 4 } },
      { need: 6, buffs: { atkPct: 8 } },
      { need: 10, buffs: { atkPct: 14 } },
    ],
    master: { atkPct: 5 },
  },
  {
    id: 'gangwon', name: '강원권', icon: '⛰️', color: '#a8e6ff',
    line: '관광·휴양 · 드롭률',
    levels: [
      { need: 2, buffs: { dropPct: 5 } },
      { need: 4, buffs: { dropPct: 10 } },
      { need: 7, buffs: { dropPct: 18 } },
    ],
    master: { dropPct: 6 },
  },
  {
    id: 'chungcheong', name: '충청권', icon: '🌾', color: '#ffcf5c',
    line: '교통 요충 · 골드 획득',
    levels: [
      { need: 3, buffs: { goldPct: 4 } },
      { need: 6, buffs: { goldPct: 8 } },
      { need: 10, buffs: { goldPct: 14 } },
    ],
    master: { goldPct: 5 },
  },
  {
    id: 'jeolla', name: '전라권', icon: '🌿', color: '#7fe08a',
    line: '식품·농업 · 임대수익',
    levels: [
      { need: 3, buffs: { rentPct: 5 } },
      { need: 6, buffs: { rentPct: 10 } },
      { need: 10, buffs: { rentPct: 18 } },
    ],
    master: { expPct: 5 },
  },
  {
    id: 'gyeongsang', name: '경상권', icon: '🚢', color: '#ff9a7a',
    line: '항만·제조 · 공격력',
    levels: [
      { need: 3, buffs: { atkPct: 3 } },
      { need: 6, buffs: { atkPct: 6 } },
      { need: 12, buffs: { atkPct: 12 } },
    ],
    master: { bossDmgPct: 6 },
  },
  {
    id: 'jeju', name: '제주권', icon: '🏝️', color: '#ffd76a',
    line: '관광 특화 · 골드+임대',
    levels: [
      { need: 1, buffs: { goldPct: 3, rentPct: 4 } },
      { need: 2, buffs: { goldPct: 7, rentPct: 10 } },
    ],
    master: { cdrPct: 4 },
  },
];

export const SETS_BY_ID = REGION_SETS.reduce((m, s) => { m[s.id] = s; return m; }, Object.create(null));

const BUFF_LABELS = {
  rentPct: '임대수익',
  atkPct: '공격력',
  goldPct: '골드 획득',
  hpPct: '최대 체력',
  critPct: '치명타',
  dropPct: '드롭률',
  // v4.6 부동산 → 전투 시너지(랜드마크 · 권역 완성)
  critDmgPct: '치명타 피해',
  cdrPct: '스킬 쿨감',
  bossDmgPct: '보스 피해',
  expPct: '경험치',
};
// 쿨타임 감소는 '줄어든다'는 뜻이라 '-'로 적는다(스킬 쿨감 -4%)
const BUFF_NEGATIVE = { cdrPct: true };

/** { rentPct: 8, atkPct: 4 } → "임대수익 +8% · 공격력 +4%" */
export function buffText(b) {
  if (!b || typeof b !== 'object') return '';
  return Object.keys(BUFF_LABELS)
    .filter((k) => Number(b[k]) > 0)
    .map((k) => `${BUFF_LABELS[k]} ${BUFF_NEGATIVE[k] ? '-' : '+'}${b[k]}%`)
    .join(' · ');
}

/* ─────────────── 도시 인덱스(land.js 와 같은 key 규칙) ─────────────── */
export const RCITIES = [];
export const RCITY_BY_KEY = Object.create(null);
export const RCITY_KEY_BY_NAME = Object.create(null);
export const TIER_NAMES = LAND_TIERS.map((t) => t.label);

/* 시/도·권역 → 권역 세트 id */
const REGION_SET_MAP = {
  '0|경기권': 'gyeonggi',
  '0|강원권': 'gangwon',
  '0|충청권': 'chungcheong',
  '0|전라권': 'jeolla',
  '0|경상권': 'gyeongsang',
  '1|경기권': 'gyeonggi',
  '1|강원권': 'gangwon',
  '1|충청권': 'chungcheong',
  '1|전라권': 'jeolla',
  '1|경상권': 'gyeongsang',
  '2|서울특별시': 'seoul',
  '2|인천광역시': 'gyeonggi',
  '2|부산광역시': 'gyeongsang',
  '2|대구광역시': 'gyeongsang',
  '2|울산광역시': 'gyeongsang',
  '2|광주광역시': 'jeolla',
  '2|대전광역시': 'chungcheong',
};

/* 광역시권의 군 지역 · 특별자치권은 이름으로 보정한다 */
const CITY_SET_OVERRIDE = {
  강화군: 'gyeonggi',
  옹진군: 'gyeonggi',
  기장군: 'gyeongsang',
  달성군: 'gyeongsang',
  군위군: 'gyeongsang',
  울주군: 'gyeongsang',
  세종시: 'chungcheong',
  제주시: 'jeju',
  서귀포시: 'jeju',
};

(function buildRegionIndex() {
  REGION_SETS.forEach((s) => { s.keyList = []; });
  LAND_TIERS.forEach((td, ti) => {
    td.regions.forEach((reg, ri) => {
      reg.cities.forEach((city, ci) => {
        const key = `${ti}_${ri}_${ci}`;
        const setName = CITY_SET_OVERRIDE[city.n] || REGION_SET_MAP[`${ti}|${reg.name}`] || null;
        const row = { key, name: city.n, tier: ti, region: reg.name, emoji: city.e || '🏠', setName };
        RCITIES.push(row);
        RCITY_BY_KEY[key] = row;
        if (!RCITY_KEY_BY_NAME[city.n]) RCITY_KEY_BY_NAME[city.n] = key;
        const def = setName && SETS_BY_ID[setName];
        if (def) def.keyList.push(key);
      });
    });
  });
})();

/** 도시 key → 권역 세트 id (없으면 null) */
export function citySetId(key) {
  const row = RCITY_BY_KEY[key];
  return row && row.setName ? row.setName : null;
}

/** 보유 지역(1평 이상) 기준 권역 세트 현황 — 7개 세트 전부 반환 */
export function regionSetStatus(owned) {
  const counts = Object.create(null);
  if (owned && typeof owned === 'object') {
    for (const [key, qty] of Object.entries(owned)) {
      const n = Math.floor(Number(qty) || 0);
      if (!(n > 0)) continue;
      const row = RCITY_BY_KEY[key];
      if (!row || !row.setName) continue;
      counts[row.setName] = (counts[row.setName] || 0) + 1;
    }
  }
  return REGION_SETS.map((def) => {
    const held = counts[def.id] || 0;
    let level = 0;
    for (let i = 0; i < def.levels.length; i++) if (held >= def.levels[i].need) level = i + 1;
    const cur = level > 0 ? def.levels[level - 1] : null;
    const next = level < def.levels.length ? def.levels[level] : null;
    const maxLevel = def.levels.length;
    const complete = level >= maxLevel;
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      color: def.color,
      line: def.line || '',
      held,
      total: def.keyList.length,
      level,
      maxLevel,
      // v4.6: 완성(=최대 단계)까지 필요한 지역 수 — 진행 안내용
      maxNeed: def.levels[maxLevel - 1] ? def.levels[maxLevel - 1].need : 0,
      complete,
      need: next ? next.need : null,
      nextNeed: next ? next.need : null,
      buffs: cur ? { ...cur.buffs } : {},
      nextBuffs: next ? { ...next.buffs } : null,
      buffText: buffText(cur ? cur.buffs : null),
      nextText: next ? `${next.need}곳 → ${buffText(next.buffs)}` : (cur ? '최대 달성' : ''),
      // v4.6: 권역 완성 보너스(최대 단계에서만 적용) — synergy.js 가 합산한다
      masterBuffs: def.master ? { ...def.master } : {},
      masterText: buffText(def.master),
    };
  });
}

/** 권역 세트가 주는 버프 합계 + 세트별 임대수익 배율 */
export function regionSetBuffs(owned) {
  const status = regionSetStatus(owned);
  const tot = { atkPct: 0, goldPct: 0, hpPct: 0, critPct: 0, dropPct: 0, rentBySet: Object.create(null) };
  for (const st of status) {
    if (!st.level) continue;
    const b = st.buffs;
    tot.atkPct += Number(b.atkPct) || 0;
    tot.goldPct += Number(b.goldPct) || 0;
    tot.hpPct += Number(b.hpPct) || 0;
    tot.critPct += Number(b.critPct) || 0;
    tot.dropPct += Number(b.dropPct) || 0;
    if (Number(b.rentPct) > 0) tot.rentBySet[st.id] = Number(b.rentPct);
  }
  tot.activeCount = status.filter((st) => st.level > 0).length;
  tot.total = status.length;
  tot.sets = status;
  return tot;
}

/* ══════════════════ ② 호재/테마 뉴스 ══════════════════
 * scope: 'set'(권역) | 'city'(지역 1곳) | 'tier'(군/시/구 섹터 전체)
 * pricePct: 시세 보정(%), rentPct: 임대수익 버프(%)
 */
export const NEWS_POOL = [
  { id: 'chip', icon: '🏭', title: '판교·용인 반도체 클러스터 착공', scope: 'set', target: 'gyeonggi', pricePct: 12, rentPct: 50, desc: '경기 남부 배후 수요가 몰립니다' },
  { id: 'gtx', icon: '🚄', title: 'GTX-A 전 구간 개통', scope: 'set', target: 'seoul', pricePct: 9, rentPct: 35, desc: '서울 전역 통근 시간이 줄어듭니다' },
  { id: 'jeju-tour', icon: '🏖️', title: '제주 관광객 사상 최대', scope: 'set', target: 'jeju', pricePct: 14, rentPct: 60, desc: '숙박·상권 임대 문의가 폭주합니다' },
  { id: 'gangwon-fest', icon: '🎿', title: '평창 동계 스포츠 축제 개최', scope: 'set', target: 'gangwon', pricePct: 10, rentPct: 45, desc: '리조트·숙소 예약률 최고치' },
  { id: 'busan-port', icon: '🚢', title: '부산항 스마트 항만 확장', scope: 'set', target: 'gyeongsang', pricePct: 8, rentPct: 40, desc: '물류 배후 창고 수요가 늘어납니다' },
  { id: 'chungcheong-ktx', icon: '🚉', title: '천안·아산 KTX 증편', scope: 'set', target: 'chungcheong', pricePct: 7, rentPct: 38, desc: '수도권 통근 수요가 유입됩니다' },
  { id: 'jeolla-food', icon: '🌾', title: '전라권 푸드 밸리 지정', scope: 'set', target: 'jeolla', pricePct: 9, rentPct: 42, desc: '식품 공장·창고 임대 수요' },
  { id: 'gangnam', icon: '🏗️', title: '강남 재건축 심의 통과', scope: 'city', target: '강남구', pricePct: 18, rentPct: 25, desc: '고급 주거 수요가 집중됩니다' },
  { id: 'songpa', icon: '🏟️', title: '잠실 스포츠·문화 복합단지 개장', scope: 'city', target: '송파구', pricePct: 15, rentPct: 30, desc: '유동인구가 크게 늘어납니다' },
  { id: 'suwon', icon: '💻', title: '수원 R&D 클러스터 유치', scope: 'city', target: '수원시', pricePct: 13, rentPct: 35, desc: '연구 인력 주거 수요' },
  { id: 'haeundae', icon: '🌊', title: '해운대 해변 리조트 개장', scope: 'city', target: '해운대구', pricePct: 16, rentPct: 40, desc: '관광 숙박 수요가 폭증합니다' },
  { id: 'jeonju', icon: '🎎', title: '전주 한옥마을 관광 특구 확대', scope: 'city', target: '전주시', pricePct: 12, rentPct: 38, desc: '상권 임대료가 오릅니다' },
  { id: 'gun-shimteo', icon: '🌻', title: '농촌 체류형 쉼터 사업 확대', scope: 'tier', target: 0, pricePct: 6, rentPct: 28, desc: '군 지역 체류 수요가 증가합니다' },
  { id: 'si-renewal', icon: '🏙️', title: '지방 중소도시 정비사업 추진', scope: 'tier', target: 1, pricePct: 7, rentPct: 24, desc: '시 지역 재개발 기대감' },
  { id: 'gu-office', icon: '🏢', title: '도심 오피스 공실률 최저', scope: 'tier', target: 2, pricePct: 8, rentPct: 22, desc: '구 지역 임대 수요 강세' },
];

let _newsCache = { block: -1, news: null };

/** 그 시각에 유효한 호재 뉴스(3분 블록마다 하나) — 모든 기기가 같은 값을 본다 */
export function activeNews(now = Date.now()) {
  const t = Number(now) || 0;
  const block = Math.floor(t / NEWS_INTERVAL_MS);
  if (_newsCache.block === block) return _newsCache.news;

  const seed = hashStr(`land-news:${block}`);
  const tpl = NEWS_POOL[Math.floor(seeded(seed) * NEWS_POOL.length) % NEWS_POOL.length];
  const news = {
    block,
    key: `n${block}`,
    id: tpl.id,
    icon: tpl.icon,
    title: tpl.title,
    desc: tpl.desc || '',
    scope: tpl.scope,
    pricePct: Math.max(0, Number(tpl.pricePct) || 0),
    rentPct: Math.max(0, Number(tpl.rentPct) || 0),
    startsAt: block * NEWS_INTERVAL_MS,
    endsAt: (block + 1) * NEWS_INTERVAL_MS,
    targetId: null,
    targetKey: null,
    targetLabel: '',
  };

  if (tpl.scope === 'set') {
    const def = SETS_BY_ID[tpl.target] || REGION_SETS[0];
    news.targetId = def.id;
    news.targetLabel = def.name;
  } else if (tpl.scope === 'city') {
    const key = RCITY_KEY_BY_NAME[tpl.target] || RCITIES[0].key;
    news.targetId = key;
    news.targetKey = key;
    news.targetLabel = RCITY_BY_KEY[key].name;
  } else {
    const tier = Math.max(0, Math.min(TIER_NAMES.length - 1, Math.floor(Number(tpl.target) || 0)));
    news.targetId = tier;
    news.targetLabel = TIER_NAMES[tier] || '전국';
  }

  _newsCache = { block, news };
  return news;
}

/** 이 뉴스가 해당 지역에 적용되는가 */
export function newsCovers(news, cityKey) {
  if (!news || !cityKey) return false;
  const row = RCITY_BY_KEY[cityKey];
  if (!row) return false;
  if (news.scope === 'set') return !!row.setName && row.setName === news.targetId;
  if (news.scope === 'city') return cityKey === news.targetKey;
  if (news.scope === 'tier') return row.tier === news.targetId;
  return false;
}

/** 지역에 적용 중인 호재(없으면 null) */
export function newsForCity(cityKey, now = Date.now()) {
  const n = activeNews(now);
  return n && newsCovers(n, cityKey) ? n : null;
}

/** 호재 시세 배율 */
export function newsPriceMul(cityKey, now = Date.now()) {
  const n = newsForCity(cityKey, now);
  return n ? 1 + n.pricePct / 100 : 1;
}

/** 호재 임대수익 배율 */
export function newsRentMul(cityKey, now = Date.now()) {
  const n = newsForCity(cityKey, now);
  return n ? 1 + n.rentPct / 100 : 1;
}

/** 남은 시간(ms) · 진행률(0~1) */
export function newsTimer(now = Date.now()) {
  const n = activeNews(now);
  if (!n) return { leftMs: 0, pct: 0 };
  const span = Math.max(1, n.endsAt - n.startsAt);
  return { leftMs: Math.max(0, n.endsAt - now), pct: Math.min(1, Math.max(0, (now - n.startsAt) / span)) };
}
