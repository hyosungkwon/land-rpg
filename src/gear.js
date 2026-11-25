// land-rpg / src/gear.js — ⚔️ v4.0.0 장비 시스템 대개편
//  · 5부위 × 5등급 × 여러 종류 = 35종 카탈로그 (이름 · 모양(SVG) · 고유 옵션)
//  · 옵션은 calcStats(state.js)와 전투(combat.js: 흡혈·보스 추뎀·범위 베기·공속)에 실제로 반영된다.
//  · 인벤토리(보유 목록) · 장착 · 분해 · 일괄 분해 · 사냥/보스 드랍. DOM 의존 없음.
import { EQUIP_SLOTS, RARITIES, RARITY_INDEX, RARITY_IDS } from './data.js';

/* ────────────────────────────── 고유 옵션 정의 ──────────────────────────────
 * 모든 값은 % 단위. 장착한 아이템들의 옵션이 부위와 무관하게 합산된다.
 *  - atkPct   : 공격력 +%          hpPct   : 최대 체력 +%
 *  - critPct  : 치명타 확률 +%     critDmg : 치명타 피해 +%
 *  - dmgRed   : 피해 감소 +%       regen   : 초당 자연 회복 +%
 *  - goldPct  : 골드 획득 +%       dropPct : 강화석/장비 드랍 +%
 *  - atkSpd   : 공격 속도 +%       lifesteal: 입힌 피해의 %만큼 HP 회복
 *  - bossDmg  : 보스에게 주는 피해 +%
 *  - whirlDmg : 범위 베기 피해 +%
 */
export const GEAR_OPTS = {
  atkPct: { name: '공격력', icon: '⚔️', unit: '%' },
  hpPct: { name: '체력', icon: '❤️', unit: '%' },
  critPct: { name: '치명타 확률', icon: '🎯', unit: '%' },
  critDmg: { name: '치명타 피해', icon: '💥', unit: '%' },
  dmgRed: { name: '피해 감소', icon: '🛡️', unit: '%' },
  regen: { name: '자연 회복', icon: '💚', unit: '%' },
  goldPct: { name: '골드 획득', icon: '💰', unit: '%' },
  dropPct: { name: '강화석 드랍', icon: '💎', unit: '%' },
  atkSpd: { name: '공격 속도', icon: '⚡', unit: '%' },
  lifesteal: { name: '흡혈', icon: '🩸', unit: '%' },
  bossDmg: { name: '보스 추가 피해', icon: '👑', unit: '%' },
  whirlDmg: { name: '범위 베기 피해', icon: '🌀', unit: '%' },
};
export const GEAR_OPT_KEYS = Object.keys(GEAR_OPTS);

/* ────────────────────────────── 아이콘 (SVG) ──────────────────────────────
 * 아이템마다 모양(form)과 색(tint·accent·gem)이 달라 한눈에 구분된다.
 * 34px 기준으로 그려지며, 등급이 높으면 뒤에 은은한 광휘가 깔린다.
 */
const SVG_HEAD = (size, label) =>
  `<svg class="gsvg" viewBox="0 0 32 32" width="${size}" height="${size}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">`;

const FORMS = {
  /* 검: 곧은 날 + 가드 + 손잡이 + 보석 */
  sword: (c, a, g) => `
    <path d="M16 2.6 19.4 7.6V19.6h-6.8V7.6Z" fill="${c}"/>
    <path d="M16 2.6 19.4 7.6h-6.8Z" fill="${a}" opacity=".85"/>
    <path d="M16 5.4v13.4" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.1"/>
    <rect x="9.2" y="19.6" width="13.6" height="2.6" rx="1.3" fill="${a}"/>
    <rect x="14.6" y="22.2" width="2.8" height="6" rx="1.4" fill="#5a4632"/>
    <circle cx="16" cy="29.4" r="1.7" fill="${g}"/>`,
  /* 대검: 넓은 날 + 홈 + 큰 가드 */
  greatsword: (c, a, g) => `
    <path d="M16 1.8 21 8v11.6H11V8Z" fill="${c}"/>
    <path d="M16 4.2v12.6" stroke="${a}" stroke-width="1.6" opacity=".8"/>
    <path d="M11.6 8.2 9.6 10.4h12.8l-2-2.2Z" fill="${a}" opacity=".7"/>
    <rect x="7.4" y="19.6" width="17.2" height="3" rx="1.5" fill="${a}"/>
    <circle cx="16" cy="21.1" r="1.5" fill="${g}"/>
    <rect x="14.4" y="22.6" width="3.2" height="6.2" rx="1.6" fill="#4a3a2a"/>`,
  /* 도끼: 자루 + 초승달 날 */
  axe: (c, a, g) => `
    <rect x="14.4" y="4.4" width="3.2" height="24.4" rx="1.6" fill="${a}"/>
    <path d="M17.6 5.2c6.8 1.2 10.6 5.4 10.6 10.4s-3.8 8.8-10.6 9.6c3.2-2.4 4.8-5.6 4.8-9.6s-1.6-7.6-4.8-10.4Z" fill="${c}"/>
    <path d="M17.6 8.6c4 1.6 6 4 6 7s-2 5.4-6 6.4c1.8-1.8 2.6-4 2.6-6.4s-.8-5-2.6-7Z" fill="${a}" opacity=".55"/>
    <circle cx="16" cy="7.2" r="1.4" fill="${g}"/>`,
  /* 창: 긴 자루 + 잎사귀 날 + 술 */
  spear: (c, a, g) => `
    <rect x="15.1" y="8.4" width="2.6" height="21.4" rx="1.3" fill="${a}"/>
    <path d="M16.4 1.6 20.4 9.4h-8Z" fill="${c}"/>
    <path d="M16.4 3.6v5.4" stroke="#ffffff" stroke-opacity=".6" stroke-width=".9"/>
    <path d="M13.4 10.4c-2.6 1.8-2.6 4.4 0 6.2" stroke="${g}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <circle cx="16.4" cy="16.2" r="1.3" fill="${g}"/>`,
  /* 결정검: 뾰족뾰족한 얼음 날 */
  crystal: (c, a, g) => `
    <path d="M16 .9 19.2 6.2 21 11.4l-2.2 1.8.9 3.4-3.7 2.6-3.7-2.6.9-3.4-2.2-1.8 1.8-5.2Z" fill="${c}"/>
    <path d="M16 2.4 17.8 6.6 16 8.4 14.2 6.6Z" fill="#ffffff" opacity=".62"/>
    <path d="M12.2 12.6 16 15.2l3.8-2.6" stroke="${a}" stroke-width="1.3" fill="none"/>
    <rect x="9.6" y="19.2" width="12.8" height="2.4" rx="1.2" fill="${a}"/>
    <rect x="14.7" y="21.6" width="2.6" height="6.6" rx="1.3" fill="#334255"/>
    <circle cx="16" cy="29.6" r="1.6" fill="${g}"/>`,
  /* 용살검: 톱니 날 + 용 이빨 장식 */
  fang: (c, a, g) => `
    <path d="M16 1.4 20.6 7.6v11c0 2.4-4.6 4.6-4.6 4.6s-4.6-2.2-4.6-4.6v-11Z" fill="${c}"/>
    <path d="M12.8 6.4 14.6 8.2 12.8 10l1.8 1.8-1.8 1.8 1.8 1.8" stroke="#ffffff" stroke-opacity=".5" stroke-width="1.1" fill="none"/>
    <path d="M7.8 15.4c2.4-.6 3.6 1 3.2 3.4-2.4.5-3.6-1.1-3.2-3.4Z" fill="${a}"/>
    <path d="M24.2 15.4c-2.4-.6-3.6 1-3.2 3.4 2.4.5 3.6-1.1 3.2-3.4Z" fill="${a}"/>
    <rect x="9" y="23" width="14" height="2.6" rx="1.3" fill="${a}"/>
    <circle cx="16" cy="24.3" r="1.6" fill="${g}"/>
    <rect x="14.6" y="25.6" width="2.8" height="5" rx="1.4" fill="#3b2a1c"/>`,
  /* 가죽 갑옷: 어깨끈 + 몸통 */
  vest: (c, a, g) => `
    <path d="M11 4.6 16 7l5-2.4 3.4 2.2-1.4 5.2v13.4H9V12L7.6 6.8Z" fill="${c}"/>
    <path d="M16 7v17.2" stroke="${a}" stroke-width="1.4" opacity=".7"/>
    <path d="M11 4.6 9.6 10l2.2 1.2L13 8Z" fill="${a}" opacity=".85"/>
    <path d="M21 4.6 22.4 10l-2.2 1.2L19 8Z" fill="${a}" opacity=".85"/>
    <circle cx="16" cy="14.6" r="1.8" fill="${g}"/>`,
  /* 사슬 갑옷: 고리 패턴 */
  chain: (c, a, g) => `
    <path d="M10.4 4.8 16 7.4l5.6-2.6 2.6 2-1.2 4.6v14H9v-14L7.8 6.8Z" fill="${c}"/>
    <g stroke="${a}" stroke-width="1.1" fill="none" opacity=".85">
      <path d="M11 12h10M11 15.4h10M11 18.8h10M11 22.2h10"/>
      <path d="M13.4 10.4v14M16 10.4v14M18.6 10.4v14"/>
    </g>
    <circle cx="16" cy="6.6" r="1.3" fill="${g}"/>`,
  /* 판금 갑옷: 가슴 판 + 어깨 방패 */
  plate: (c, a, g) => `
    <path d="M16 3.4 24 6.2v8.2c0 6.2-4.6 11-8 12.8-3.4-1.8-8-6.6-8-12.8V6.2Z" fill="${c}"/>
    <path d="M16 6.2v18.4c2.6-2 5.2-5.6 5.2-9.6V7.6Z" fill="${a}" opacity=".35"/>
    <path d="M11.4 12.6 16 15l4.6-2.4v3.2L16 18.4l-4.6-2.6Z" fill="${a}"/>
    <circle cx="16" cy="8.6" r="1.7" fill="${g}"/>`,
  /* 비늘 갑옷: 비늘 3줄 */
  scale: (c, a, g) => `
    <path d="M16 3.2 23.6 6v8.6c0 6-4.2 10.6-7.6 12.4-3.4-1.8-7.6-6.4-7.6-12.4V6Z" fill="${c}"/>
    <g fill="${a}" opacity=".78">
      <path d="M9.4 10.2c1.2 1.4 2.8 1.4 4 0 1.2 1.4 2.8 1.4 4 0 1.2 1.4 2.8 1.4 4 0v1.7c-1.2 1.4-2.8 1.4-4 0-1.2 1.4-2.8 1.4-4 0-1.2 1.4-2.8 1.4-4 0Z"/>
      <path d="M9.4 14.6c1.2 1.4 2.8 1.4 4 0 1.2 1.4 2.8 1.4 4 0 1.2 1.4 2.8 1.4 4 0v1.7c-1.2 1.4-2.8 1.4-4 0-1.2 1.4-2.8 1.4-4 0-1.2 1.4-2.8 1.4-4 0Z"/>
      <path d="M9.4 19c1.2 1.4 2.8 1.4 4 0 1.2 1.4 2.8 1.4 4 0 1.2 1.4 2.8 1.4 4 0v1.7c-1.2 1.4-2.8 1.4-4 0-1.2 1.4-2.8 1.4-4 0-1.2 1.4-2.8 1.4-4 0Z"/>
    </g>
    <circle cx="16" cy="6.8" r="1.6" fill="${g}"/>`,
  /* 망토: 후드 + 흘러내리는 자락 */
  cloak: (c, a, g) => `
    <path d="M16 3.4c3.6 0 6 2.6 6 5.8 0 2-1 3.4-1 5.6 0 4 2.4 8.4 3.6 12.6H7.4C8.6 23.2 11 18.8 11 14.8c0-2.2-1-3.6-1-5.6 0-3.2 2.4-5.8 6-5.8Z" fill="${c}"/>
    <path d="M16 3.4c-2.6 0-4.4 2.4-4.4 5.2 0 2 1 3.2 1 5.4 0 3.4-1.4 7.2-2.6 10.8h3.2c1-3.6 2-7.4 2-10.8Z" fill="${a}" opacity=".4"/>
    <path d="M13.6 10.4c1.6-1.2 3.2-1.2 4.8 0" stroke="${a}" stroke-width="1.3" fill="none"/>
    <circle cx="16" cy="11.6" r="1.5" fill="${g}"/>`,
  /* 천/가죽 모자 */
  cap: (c, a, g) => `
    <path d="M8.4 18.6c0-5 3.4-8.6 7.6-8.6s7.6 3.6 7.6 8.6Z" fill="${c}"/>
    <rect x="6.4" y="18.4" width="19.2" height="3.2" rx="1.6" fill="${a}"/>
    <path d="M16 10.4v8" stroke="${a}" stroke-width="1.1" opacity=".6"/>
    <circle cx="16" cy="19.9" r="1.3" fill="${g}"/>`,
  /* 철 투구: 챙 + 눈 슬릿 + 깃 */
  helm: (c, a, g) => `
    <path d="M9 19.4V14c0-4.2 3.2-7.4 7-7.4s7 3.2 7 7.4v5.4Z" fill="${c}"/>
    <rect x="7.6" y="19.2" width="16.8" height="3.2" rx="1.6" fill="${a}"/>
    <path d="M11.4 13.6h9.2v2.2h-9.2Z" fill="#10161f" opacity=".82"/>
    <path d="M16 6.4V3.2" stroke="${g}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="20.8" r="1.2" fill="${g}"/>`,
  /* 두건: 그림자 진 얼굴 */
  hood: (c, a, g) => `
    <path d="M16 4.2c4.6 0 8 3.8 8 8.4 0 4.4-2.4 7.2-8 9.4-5.6-2.2-8-5-8-9.4 0-4.6 3.4-8.4 8-8.4Z" fill="${c}"/>
    <path d="M16 8.4c2.8 0 4.8 2.2 4.8 4.8 0 2.4-1.6 4-4.8 5.4-3.2-1.4-4.8-3-4.8-5.4 0-2.6 2-4.8 4.8-4.8Z" fill="#0b0f16" opacity=".62"/>
    <path d="M11.4 20.4c2.8 1.4 6.4 1.4 9.2 0" stroke="${a}" stroke-width="1.5" fill="none"/>
    <circle cx="16" cy="13.4" r="1.3" fill="${g}"/>`,
  /* 뿔 투구 */
  horned: (c, a, g) => `
    <path d="M9.4 19.6v-5.4c0-4 2.8-7 6.6-7s6.6 3 6.6 7v5.4Z" fill="${c}"/>
    <path d="M9.6 12.4C7 11 5.4 8.8 5.8 6c2.8.6 5 2.6 6 5.4Z" fill="${a}"/>
    <path d="M22.4 12.4C25 11 26.6 8.8 26.2 6c-2.8.6-5 2.6-6 5.4Z" fill="${a}"/>
    <path d="M12 14h8v2h-8Z" fill="#10161f" opacity=".8"/>
    <rect x="8.4" y="19.4" width="15.2" height="2.8" rx="1.4" fill="${a}"/>
    <circle cx="16" cy="20.8" r="1.3" fill="${g}"/>`,
  /* 왕관 */
  crown: (c, a, g) => `
    <path d="M6.4 21.4 8 11l4.6 4L16 7l3.4 8 4.6-4 1.6 10.4Z" fill="${c}"/>
    <rect x="6.4" y="21" width="19.2" height="3.2" rx="1.4" fill="${a}"/>
    <circle cx="16" cy="7.4" r="1.8" fill="${g}"/>
    <circle cx="8.6" cy="11.6" r="1.3" fill="${g}"/>
    <circle cx="23.4" cy="11.6" r="1.3" fill="${g}"/>`,
  /* 반지(단순) */
  band: (c, a, g) => `
    <ellipse cx="16" cy="18.4" rx="7.4" ry="7.6" fill="none" stroke="${c}" stroke-width="3.4"/>
    <ellipse cx="16" cy="18.4" rx="7.4" ry="7.6" fill="none" stroke="${a}" stroke-width="1" opacity=".7"/>
    <path d="M16 5.6 18.4 8.8 16 12l-2.4-3.2Z" fill="${g}"/>`,
  /* 보석 반지 */
  gem: (c, a, g) => `
    <ellipse cx="16" cy="19.4" rx="7" ry="7" fill="none" stroke="${c}" stroke-width="3"/>
    <path d="M16 4.2 21 9l-5 6.6L11 9Z" fill="${g}"/>
    <path d="M16 4.2 18 9l-2 2.2L14 9Z" fill="#ffffff" opacity=".6"/>
    <path d="M11 9h10" stroke="${a}" stroke-width="1"/>
    <circle cx="9.4" cy="21.6" r="1.3" fill="${a}"/>`,
  /* 인장 반지 */
  seal: (c, a, g) => `
    <ellipse cx="16" cy="19.6" rx="6.6" ry="6.8" fill="none" stroke="${c}" stroke-width="3.2"/>
    <path d="M10.4 10.2h11.2l-1.2 5.8H11.6Z" fill="${a}"/>
    <path d="M13.4 12.2h5.2v2h-5.2Z" fill="#10161f" opacity=".7"/>
    <circle cx="16" cy="8" r="1.5" fill="${g}"/>`,
  /* 부적: 종이 + 끈 */
  talisman: (c, a, g) => `
    <path d="M11 5.4h10v21H11Z" fill="${c}"/>
    <path d="M13.4 8.4h5.2M13.4 12h5.2M13.4 15.6h5.2M13.4 19.2h3.4" stroke="${a}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M16 2.4v3" stroke="${g}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="16" cy="23.4" r="1.4" fill="${g}"/>`,
  /* 펜던트: 사슬 + 물방울 보석 */
  pendant: (c, a, g) => `
    <path d="M8.6 6.4C10.6 3.6 13 2.4 16 2.4s5.4 1.2 7.4 4" stroke="${a}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M16 10.6c3.6 3 5.4 5.6 5.4 8.4 0 3.2-2.4 5.4-5.4 5.4s-5.4-2.2-5.4-5.4c0-2.8 1.8-5.4 5.4-8.4Z" fill="${c}"/>
    <path d="M16 13.2c2.2 2 3.2 3.8 3.2 5.8 0 2-1.4 3.4-3.2 3.4s-3.2-1.4-3.2-3.4c0-2 1-3.8 3.2-5.8Z" fill="${g}" opacity=".85"/>
    <circle cx="16" cy="9.4" r="1.4" fill="${a}"/>`,
  /* 수정 구슬 */
  orb: (c, a, g) => `
    <circle cx="16" cy="16" r="9" fill="${c}"/>
    <circle cx="13" cy="13" r="3.2" fill="#ffffff" opacity=".45"/>
    <ellipse cx="16" cy="16" rx="12" ry="4" fill="none" stroke="${a}" stroke-width="1.6" opacity=".8" transform="rotate(-18 16 16)"/>
    <circle cx="16" cy="16" r="3.4" fill="${g}" opacity=".85"/>`,
  /* 별 부적 */
  star: (c, a, g) => `
    <path d="M16 3.6 19 11l7.8.6-6 5.2 1.8 7.6L16 20.4l-6.6 4 1.8-7.6-6-5.2L13 11Z" fill="${c}"/>
    <path d="M16 8.2l1.6 4 4.2.3-3.2 2.8 1 4-3.6-2.2-3.6 2.2 1-4-3.2-2.8 4.2-.3Z" fill="${g}" opacity=".8"/>
    <path d="M16 3.6V1.4" stroke="${a}" stroke-width="1.6" stroke-linecap="round"/>`,
  /* 성배 */
  grail: (c, a, g) => `
    <path d="M9.4 5.4h13.2c0 6-2.6 9.6-6.6 9.6S9.4 11.4 9.4 5.4Z" fill="${c}"/>
    <path d="M9.4 7.4h13.2" stroke="${a}" stroke-width="1.4"/>
    <path d="M16 15v7.4" stroke="${a}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M11.4 26.4c0-2.2 2-3.6 4.6-3.6s4.6 1.4 4.6 3.6Z" fill="${a}"/>
    <circle cx="16" cy="8.6" r="2" fill="${g}" opacity=".9"/>
    <path d="M8.4 5.4c-1.4 3 .2 5.4 2.6 6.2M23.6 5.4c1.4 3-.2 5.4-2.6 6.2" stroke="${a}" stroke-width="1.2" fill="none"/>`,
  /* v5.6 신규 SVG 모양 10종: 카타나 · 대낫 · 신궁 · 전투망치 · 로브 · 이지스 · 서클릿 · 바이저 · 문장반지 · 성유물 */
  katana: (c, a, g) => `
    <path d="M22.8 2.4C19.6 7.4 17 13 15 19.6l-2.6-.8C14.6 12.2 17.6 6.8 21 2.2Z" fill="${c}"/>
    <path d="M21.8 3.2c-2.6 4.4-4.8 9.2-6.6 15" stroke="#ffffff" stroke-opacity=".55" stroke-width="1" fill="none"/>
    <rect x="9.8" y="19.2" width="7.4" height="2.4" rx="1.2" fill="${a}" transform="rotate(14 13.5 20.4)"/>
    <path d="M12.6 21.4 10.6 28.6" stroke="#4a3a2a" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="10.2" cy="29.4" r="1.4" fill="${g}"/>`,
  scythe: (c, a, g) => `
    <path d="M15 4.4 17.4 29" stroke="${a}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M15.4 5.2C22 3.8 27 6.8 28.4 12.6c-4-2.4-8.4-2.8-13-1.4Z" fill="${c}"/>
    <path d="M16.2 6.8c4.8-.6 8.4 1 10.6 4" stroke="#ffffff" stroke-opacity=".5" stroke-width="1" fill="none"/>
    <circle cx="15.2" cy="6.8" r="1.8" fill="${g}"/>`,
  bow: (c, a, g) => `
    <path d="M11 4.4C22.4 7.6 22.4 24.4 11 27.6" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M11 5.2v21.6" stroke="${a}" stroke-width="1.2" opacity=".85"/>
    <path d="M7.6 16h16.6" stroke="${g}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M22.6 13.4 26.4 16l-3.8 2.6Z" fill="${g}"/>`,
  hammer: (c, a, g) => `
    <rect x="14.6" y="12.4" width="2.8" height="16.6" rx="1.4" fill="${a}"/>
    <rect x="6.4" y="4.6" width="19.2" height="9" rx="2.2" fill="${c}"/>
    <rect x="8.6" y="6.2" width="14.8" height="2.2" rx="1" fill="#ffffff" opacity=".4"/>
    <circle cx="16" cy="9.2" r="2" fill="${g}"/>`,
  robe: (c, a, g) => `
    <path d="M11 4.4 16 7.4l5-3 3.4 3.4-2 5.4 2.4 13.6H7.2l2.4-13.6-2-5.4Z" fill="${c}"/>
    <path d="M16 7.4v19.4" stroke="${a}" stroke-width="2" opacity=".8"/>
    <path d="M11 4.4 16 11l5-6.6" fill="none" stroke="${a}" stroke-width="1.4"/>
    <circle cx="16" cy="12.4" r="1.8" fill="${g}"/>`,
  aegis: (c, a, g) => `
    <path d="M16 2.8 25 6.4v8.8c0 6.8-5 12-9 14-4-2-9-7.2-9-14V6.4Z" fill="${c}"/>
    <path d="M16 5.6 22.4 8.2v6.6c0 5-3.4 8.8-6.4 10.4-3-1.6-6.4-5.4-6.4-10.4V8.2Z" fill="none" stroke="${a}" stroke-width="1.6"/>
    <path d="M16 7.6v15.4M10.8 14h10.4" stroke="${a}" stroke-width="1.5" opacity=".8"/>
    <circle cx="16" cy="14" r="2.3" fill="${g}"/>`,
  circlet: (c, a, g) => `
    <path d="M6.4 19.6c0-5.4 4.2-9.6 9.6-9.6s9.6 4.2 9.6 9.6" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M16 5.2 19 10.6 16 13.8 13 10.6Z" fill="${g}"/>
    <circle cx="10.2" cy="13.4" r="1.4" fill="${a}"/>
    <circle cx="21.8" cy="13.4" r="1.4" fill="${a}"/>`,
  visor: (c, a, g) => `
    <path d="M8.6 20.6V13c0-4.4 3.4-7.8 7.4-7.8s7.4 3.4 7.4 7.8v7.6l-7.4 3.8Z" fill="${c}"/>
    <path d="M10.6 13.6h10.8l-1.2 3.2h-8.4Z" fill="#10161f" opacity=".85"/>
    <path d="M16 5.2v8.4" stroke="${a}" stroke-width="1.8"/>
    <circle cx="16" cy="8.4" r="1.6" fill="${g}"/>`,
  signet: (c, a, g) => `
    <ellipse cx="16" cy="19.6" rx="7.2" ry="7" fill="none" stroke="${c}" stroke-width="3.4"/>
    <polygon points="16,5 21.4,9.6 19.6,15.6 12.4,15.6 10.6,9.6" fill="${a}"/>
    <circle cx="16" cy="10.6" r="2.2" fill="${g}"/>`,
  relic: (c, a, g) => `
    <path d="M16 3.2 24.4 11.6 16 28 7.6 11.6Z" fill="${c}"/>
    <path d="M16 6.4 21.4 11.8 16 23.4 10.6 11.8Z" fill="none" stroke="${a}" stroke-width="1.5"/>
    <circle cx="16" cy="13" r="2.6" fill="${g}"/>`,
};

/** 아이템 아이콘 SVG 문자열 */
export function gearIcon(item, size = 34) {
  const it = typeof item === 'string' ? gearItem(item) : item;
  if (!it) return '';
  const r = RARITIES[RARITY_INDEX[it.rarity] || 0];
  const form = FORMS[it.form] || FORMS.sword;
  const glow = (RARITY_INDEX[it.rarity] || 0) >= 3
    ? `<circle cx="16" cy="16" r="14.6" fill="${r.color}" opacity=".16"/>`
    : `<circle cx="16" cy="16" r="14.2" fill="${it.tint}" opacity=".09"/>`;
  return `${SVG_HEAD(size, `${it.name} (${r.name})`)}${glow}${form(it.tint, it.accent || '#8b98a6', it.gem || '#ffcf5c')}</svg>`;
}

/* ────────────────────────────── 장비 카탈로그 (35종) ──────────────────────────────
 * 부위별 7종 = 일반 2 · 고급 1 · 레어 1 · 영웅 2 · 전설 1 → 모든 부위에 모든 등급이 있다.
 * 같은 등급 안에서도 이름·모양·옵션이 달라 '무엇이 나왔는지'가 곧 재미가 된다.
 *  · fx 는 무기 검기 색(render.js). 없으면 등급 기본 색을 쓴다.
 */
export const GEAR_ITEMS = [
  /* ⚔️ 무기 */
  { id: 'w_iron', slot: 'weapon', rarity: 'common', set: 'guardian', name: '철검', form: 'sword', tint: '#cfd8e3', accent: '#8b98a6', gem: '#ffcf5c', opts: { atkPct: 3 }, desc: '병사가 처음 쥐는 무난한 검' },
  { id: 'w_steel', slot: 'weapon', rarity: 'common', set: 'storm', name: '강철 장검', form: 'greatsword', tint: '#b9c6d6', accent: '#7c8b9c', gem: '#9fe0ff', opts: { critPct: 3 }, desc: '길이로 치명타를 노리는 검' },
  { id: 'w_axe', slot: 'weapon', rarity: 'advanced', set: 'dragon', name: '학살자의 도끼', form: 'axe', tint: '#e0614f', accent: '#6b4a2a', gem: '#ffd166', opts: { bossDmg: 9, whirlDmg: 6 }, desc: '보스와 무리를 함께 베는 도끼' },
  { id: 'w_flame', slot: 'weapon', rarity: 'rare', set: 'dragon', name: '화염검', form: 'sword', tint: '#ff8a3d', accent: '#b23a12', gem: '#ffe06a', opts: { atkPct: 7, bossDmg: 6 }, desc: '날이 붉게 달아오른 검', fx: { core: '#fff3cf', mid: '#ff8a3d', glow: '#ff3b2f' } },
  { id: 'w_frost', slot: 'weapon', rarity: 'hero', set: 'abyss', name: '빙결검', form: 'crystal', tint: '#8fe3ff', accent: '#3f8fc4', gem: '#e6faff', opts: { atkSpd: 9, critPct: 6 }, desc: '얼음 결정이 빠르게 파고든다', fx: { core: '#f2fdff', mid: '#8fe3ff', glow: '#2f8fd8' } },
  { id: 'w_thunder', slot: 'weapon', rarity: 'hero', set: 'storm', name: '천둥창', form: 'spear', tint: '#ffe36a', accent: '#8a6b1f', gem: '#fff6c4', opts: { atkSpd: 13, critDmg: 14 }, desc: '번개처럼 연달아 찌른다', fx: { core: '#fffbe0', mid: '#ffe36a', glow: '#c79a1a' } },
  { id: 'w_dragon', slot: 'weapon', rarity: 'legend', set: 'dragon', name: '드래곤슬레이어', form: 'fang', tint: '#ff5a3d', accent: '#ffcf5c', gem: '#ffe9a8', opts: { atkPct: 16, bossDmg: 22, lifesteal: 6, whirlDmg: 12 }, desc: '용을 베어 그 힘을 빨아들인다', fx: { core: '#fff2c4', mid: '#ff9a3d', glow: '#ff2f1f' } },
  /* v5.6 신규 무기 4종 */
  { id: 'w_katana', slot: 'weapon', rarity: 'rare', set: 'storm', name: '질풍 카타나', form: 'katana', tint: '#b7f0ff', accent: '#3d7fa8', gem: '#ffe36a', opts: { atkSpd: 8, critPct: 5 }, desc: '바람을 가르는 얇은 도신', fx: { core: '#f0fdff', mid: '#7fd3ff', glow: '#2a9df4' } },
  { id: 'w_hammer', slot: 'weapon', rarity: 'hero', set: 'guardian', name: '타이탄 해머', form: 'hammer', tint: '#d8c592', accent: '#5f6f85', gem: '#7cc4ff', opts: { hpPct: 12, dmgRed: 6, atkPct: 9 }, desc: '묵직한 일격으로 전선을 지킨다', fx: { core: '#fff8dc', mid: '#7cc4ff', glow: '#3b82f6' } },
  { id: 'w_stormbow', slot: 'weapon', rarity: 'legend', set: 'storm', name: '뇌전 신궁', form: 'bow', tint: '#ffe36a', accent: '#5ecbff', gem: '#ffffff', opts: { atkSpd: 18, critPct: 10, critDmg: 22 }, desc: '번개 화살이 쉴 새 없이 쏟아진다', fx: { core: '#ffffff', mid: '#ffe36a', glow: '#38bdf8' } },
  { id: 'w_scythe', slot: 'weapon', rarity: 'legend', set: 'abyss', name: '심연의 대낫', form: 'scythe', tint: '#9c78ff', accent: '#442b88', gem: '#ff6ba8', opts: { atkPct: 18, lifesteal: 8, whirlDmg: 22 }, desc: '어둠을 베어 생명력을 거둬들인다', fx: { core: '#f5e8ff', mid: '#b98bff', glow: '#6d28d9' } },

  /* 🛡️ 갑옷 */
  { id: 'a_leather', slot: 'armor', rarity: 'common', set: 'storm', name: '가죽갑옷', form: 'vest', tint: '#a9743f', accent: '#6b4a2a', gem: '#ffcf5c', opts: { hpPct: 3 }, desc: '가볍게 몸을 감싸는 갑옷' },
  { id: 'a_chain', slot: 'armor', rarity: 'common', set: 'guardian', name: '사슬갑옷', form: 'chain', tint: '#9aa6b4', accent: '#5f6b7a', gem: '#9fe0ff', opts: { dmgRed: 3 }, desc: '고리가 충격을 나눠 받는다' },
  { id: 'a_plate', slot: 'armor', rarity: 'advanced', set: 'guardian', name: '강철갑옷', form: 'plate', tint: '#b3c0cf', accent: '#6f7d8d', gem: '#ffd166', opts: { hpPct: 6, dmgRed: 2 }, desc: '두꺼운 판금으로 버틴다' },
  { id: 'a_guard', slot: 'armor', rarity: 'rare', set: 'guardian', name: '수호자 판금', form: 'plate', tint: '#d8c07a', accent: '#8a6f2f', gem: '#ffe9a8', opts: { dmgRed: 6, hpPct: 8 }, desc: '지키는 자의 갑옷' },
  { id: 'a_scale', slot: 'armor', rarity: 'hero', set: 'dragon', name: '용비늘갑옷', form: 'scale', tint: '#4fb68a', accent: '#1f7a58', gem: '#b6ffd9', opts: { dmgRed: 8, hpPct: 11, regen: 2 }, desc: '비늘이 스스로 상처를 덮는다' },
  { id: 'a_holy', slot: 'armor', rarity: 'hero', set: 'fortune', name: '성기사의 성갑', form: 'plate', tint: '#e8eef6', accent: '#c8a54a', gem: '#fff2c4', opts: { hpPct: 14, regen: 4, dmgRed: 5 }, desc: '빛이 감돌아 상처가 아문다' },
  { id: 'a_abyss', slot: 'armor', rarity: 'legend', set: 'abyss', name: '심연의 망토', form: 'cloak', tint: '#5a3fa8', accent: '#b98bff', gem: '#e6d6ff', opts: { hpPct: 18, dmgRed: 12, lifesteal: 4 }, desc: '심연이 대신 맞아 준다' },
  /* v5.6 신규 갑옷 4종 */
  { id: 'a_windmail', slot: 'armor', rarity: 'rare', set: 'storm', name: '질풍 경갑', form: 'vest', tint: '#6fd3ff', accent: '#2a6f9c', gem: '#ffe36a', opts: { atkSpd: 6, hpPct: 7 }, desc: '깃털처럼 가벼운 바람 갑옷' },
  { id: 'a_goldrobe', slot: 'armor', rarity: 'rare', set: 'fortune', name: '황금 상단 로브', form: 'robe', tint: '#f0c869', accent: '#8a5f14', gem: '#5ee1a3', opts: { goldPct: 10, dropPct: 6 }, desc: '재물을 부르는 황금빛 예복' },
  { id: 'a_aegis', slot: 'armor', rarity: 'legend', set: 'guardian', name: '이지스 성갑', form: 'aegis', tint: '#8ec8ff', accent: '#ffe36a', gem: '#ffffff', opts: { hpPct: 24, dmgRed: 15, regen: 5, lifesteal: 4 }, desc: '절대 뚫리지 않는 수호신의 방패 갑옷' },
  { id: 'a_dragonlord', slot: 'armor', rarity: 'legend', set: 'dragon', name: '용왕의 비늘갑옷', form: 'scale', tint: '#e04832', accent: '#ffcf5c', gem: '#fff0b3', opts: { hpPct: 18, bossDmg: 18, atkPct: 10 }, desc: '고대 용왕의 숨결이 서린 비늘갑옷' },

  /* 🪖 투구 */
  { id: 'h_cloth', slot: 'helmet', rarity: 'common', set: 'fortune', name: '천 투구', form: 'cap', tint: '#b89560', accent: '#7a5c34', gem: '#ffcf5c', opts: { hpPct: 2 }, desc: '머리를 덮는 두꺼운 천' },
  { id: 'h_iron', slot: 'helmet', rarity: 'common', set: 'guardian', name: '철 투구', form: 'helm', tint: '#a9b6c6', accent: '#6a7686', gem: '#9fe0ff', opts: { dmgRed: 2 }, desc: '정면을 지키는 철모' },
  { id: 'h_hood', slot: 'helmet', rarity: 'advanced', set: 'storm', name: '사냥꾼의 두건', form: 'hood', tint: '#4f7a5a', accent: '#2f4f38', gem: '#b6ffd9', opts: { critPct: 5 }, desc: '급소를 노리는 시야' },
  { id: 'h_horn', slot: 'helmet', rarity: 'rare', set: 'guardian', name: '뿔달린 투구', form: 'horned', tint: '#c2a06a', accent: '#7a5c34', gem: '#ffd166', opts: { hpPct: 7, dmgRed: 3 }, desc: '뿔이 적의 공격을 흘려보낸다' },
  { id: 'h_crown', slot: 'helmet', rarity: 'hero', set: 'fortune', name: '왕관', form: 'crown', tint: '#ffcf5c', accent: '#b8860b', gem: '#ff7a3d', opts: { goldPct: 10, hpPct: 8 }, desc: '주변의 재물이 모여든다' },
  { id: 'h_dragon', slot: 'helmet', rarity: 'hero', set: 'dragon', name: '용의 투구', form: 'horned', tint: '#d94f3d', accent: '#7a2118', gem: '#ffe9a8', opts: { dmgRed: 7, hpPct: 10 }, desc: '용의 두개골을 깎아 만든 투구' },
  { id: 'h_abyss', slot: 'helmet', rarity: 'legend', set: 'abyss', name: '심연의 왕관', form: 'crown', tint: '#6f4fd8', accent: '#b98bff', gem: '#e6d6ff', opts: { critPct: 8, dmgRed: 10, regen: 3 }, desc: '어둠이 급소를 가려 준다' },
  /* v5.6 신규 투구 4종 */
  { id: 'h_visor', slot: 'helmet', rarity: 'rare', set: 'dragon', name: '용기사 바이저', form: 'visor', tint: '#d96f4a', accent: '#7a2c18', gem: '#ffd166', opts: { bossDmg: 8, hpPct: 6 }, desc: '보스의 약점을 포착하는 시야' },
  { id: 'h_stormcirc', slot: 'helmet', rarity: 'hero', set: 'storm', name: '폭풍의 서클릿', form: 'circlet', tint: '#9fe0ff', accent: '#ffe36a', gem: '#ffffff', opts: { atkSpd: 10, critDmg: 14 }, desc: '전광석화처럼 판단을 가속한다' },
  { id: 'h_paladin', slot: 'helmet', rarity: 'legend', set: 'guardian', name: '수호신의 투구', form: 'visor', tint: '#d8e8ff', accent: '#5a9be0', gem: '#ffe36a', opts: { hpPct: 20, dmgRed: 12, regen: 4, critPct: 6 }, desc: '성스러운 빛으로 치명상을 막는다' },
  { id: 'h_midas', slot: 'helmet', rarity: 'legend', set: 'fortune', name: '미다스의 황금관', form: 'crown', tint: '#ffe066', accent: '#d98218', gem: '#5ee1a3', opts: { goldPct: 24, dropPct: 16, critPct: 8 }, desc: '손끝에 닿는 전리품을 황금으로 바꾼다' },

  /* 💍 반지 */
  { id: 'r_copper', slot: 'ring', rarity: 'common', set: 'guardian', name: '구리 반지', form: 'band', tint: '#c08457', accent: '#8a5a34', gem: '#ffcf5c', opts: { critPct: 2 }, desc: '손끝이 조금 가벼워진다' },
  { id: 'r_silver', slot: 'ring', rarity: 'common', set: 'fortune', name: '은 반지', form: 'band', tint: '#cdd6e0', accent: '#8b98a6', gem: '#9fe0ff', opts: { goldPct: 4 }, desc: '재물을 부르는 은빛' },
  { id: 'r_ruby', slot: 'ring', rarity: 'advanced', set: 'dragon', name: '루비 반지', form: 'gem', tint: '#c9a24a', accent: '#8a6f2f', gem: '#ff4d6a', opts: { critDmg: 9 }, desc: '붉은 빛이 치명타를 키운다' },
  { id: 'r_sharp', slot: 'ring', rarity: 'rare', set: 'storm', name: '예리한 인장', form: 'seal', tint: '#b3c0cf', accent: '#6f7d8d', gem: '#ffd166', opts: { critPct: 6, critDmg: 8 }, desc: '급소를 정확히 파고든다' },
  { id: 'r_storm', slot: 'ring', rarity: 'hero', set: 'storm', name: '폭풍의 인장', form: 'gem', tint: '#7aa8d8', accent: '#3f6d9c', gem: '#9fe0ff', opts: { atkSpd: 12, critPct: 6 }, desc: '손이 폭풍처럼 빨라진다' },
  { id: 'r_sage', slot: 'ring', rarity: 'hero', set: 'abyss', name: '현자의 반지', form: 'seal', tint: '#8f7fd8', accent: '#5a4aa8', gem: '#e6d6ff', opts: { lifesteal: 5, regen: 4 }, desc: '체력을 되찾으며 끈질기게 버틴다' },
  { id: 'r_eye', slot: 'ring', rarity: 'legend', set: 'dragon', name: '드래곤의 눈', form: 'gem', tint: '#ffcf5c', accent: '#b8860b', gem: '#ff7a3d', opts: { critPct: 12, critDmg: 25, lifesteal: 5 }, desc: '용의 눈이 급소를 꿰뚫는다' },
  /* v5.6 신규 반지 4종 */
  { id: 'r_guard', slot: 'ring', rarity: 'rare', set: 'guardian', name: '철벽의 인장', form: 'signet', tint: '#95b8d8', accent: '#4a6b8a', gem: '#bfeaff', opts: { dmgRed: 5, hpPct: 8 }, desc: '단단한 방어 문장이 새겨진 반지' },
  { id: 'r_fortune', slot: 'ring', rarity: 'hero', set: 'fortune', name: '황금 상인의 반지', form: 'signet', tint: '#ffd76a', accent: '#9c6f18', gem: '#5ee1a3', opts: { goldPct: 14, dropPct: 10 }, desc: '거상의 행운이 깃든 인장 반지' },
  { id: 'r_tempest', slot: 'ring', rarity: 'legend', set: 'storm', name: '태풍의 고리', form: 'gem', tint: '#6fd3ff', accent: '#ffe36a', gem: '#ffffff', opts: { atkSpd: 16, critPct: 12, critDmg: 18 }, desc: '손끝에서 태풍이 휘몰아친다' },
  { id: 'r_titan', slot: 'ring', rarity: 'legend', set: 'guardian', name: '불멸의 수호링', form: 'signet', tint: '#c5deff', accent: '#3d7cc4', gem: '#ffd76a', opts: { hpPct: 18, dmgRed: 10, regen: 5, lifesteal: 4 }, desc: '거인의 불굴의 생명력이 깃든 반지' },

  /* 🧿 부적 */
  { id: 'm_wood', slot: 'amulet', rarity: 'common', set: 'guardian', name: '나무 부적', form: 'talisman', tint: '#c9a878', accent: '#8a5a34', gem: '#ffcf5c', opts: { goldPct: 3 }, desc: '행운을 빌어 둔 나무 패' },
  { id: 'm_silver', slot: 'amulet', rarity: 'common', set: 'fortune', name: '은 부적', form: 'pendant', tint: '#cdd6e0', accent: '#8b98a6', gem: '#9fe0ff', opts: { dropPct: 4 }, desc: '전리품이 잘 모인다' },
  { id: 'm_clover', slot: 'amulet', rarity: 'advanced', set: 'fortune', name: '행운의 클로버', form: 'pendant', tint: '#5ee1a3', accent: '#1f9c66', gem: '#b6ffd9', opts: { goldPct: 8 }, desc: '네 잎이 골드를 부른다' },
  { id: 'm_crystal', slot: 'amulet', rarity: 'rare', set: 'abyss', name: '마력의 수정', form: 'orb', tint: '#69c0ff', accent: '#2f7fd8', gem: '#eaf7ff', opts: { atkPct: 7, regen: 2 }, desc: '마력이 체력을 감싼다' },
  { id: 'm_ember', slot: 'amulet', rarity: 'hero', set: 'dragon', name: '불꽃의 성흔', form: 'pendant', tint: '#ff7a3d', accent: '#b23a12', gem: '#ffe06a', opts: { bossDmg: 12, atkPct: 6 }, desc: '보스에게 불꽃이 옮겨붙는다' },
  { id: 'm_star', slot: 'amulet', rarity: 'hero', set: 'fortune', name: '별의 성표', form: 'star', tint: '#ffe36a', accent: '#b8860b', gem: '#fff6c4', opts: { dropPct: 12, goldPct: 10 }, desc: '별빛이 전리품을 끌어모은다' },
  { id: 'm_grail', slot: 'amulet', rarity: 'legend', set: 'abyss', name: '심연의 성배', form: 'grail', tint: '#6f4fd8', accent: '#b98bff', gem: '#e6d6ff', opts: { goldPct: 20, dropPct: 18, whirlDmg: 20 }, desc: '심연이 부와 회오리를 내린다' },
  /* v5.6 신규 부적 4종 */
  { id: 'm_stormrel', slot: 'amulet', rarity: 'rare', set: 'storm', name: '번개 성유물', form: 'relic', tint: '#7fd3ff', accent: '#ffe36a', gem: '#ffffff', opts: { atkSpd: 8, critPct: 5 }, desc: '짜릿한 전류가 흐르는 고대 유물' },
  { id: 'm_guardrel', slot: 'amulet', rarity: 'hero', set: 'guardian', name: '수호의 성유물', form: 'relic', tint: '#9ecbff', accent: '#4d7cb8', gem: '#ffe9a8', opts: { hpPct: 14, dmgRed: 7, regen: 3 }, desc: '치명타격을 완화하는 수호 유물' },
  { id: 'm_phoenix', slot: 'amulet', rarity: 'legend', set: 'dragon', name: '불사조의 심장', form: 'star', tint: '#ff6a3d', accent: '#ffd76a', gem: '#fff5cc', opts: { atkPct: 16, bossDmg: 20, regen: 5 }, desc: '타오르는 재생의 불꽃을 품은 보석' },
  { id: 'm_midas', slot: 'amulet', rarity: 'legend', set: 'fortune', name: '황금신의 성배', form: 'grail', tint: '#ffd76a', accent: '#d98218', gem: '#5ee1a3', opts: { goldPct: 28, dropPct: 22, atkPct: 10, whirlDmg: 15 }, desc: '황금과 전리품이 끝없이 넘쳐흐른다' },
];

/* ────────────────────────────── v5.2.0 장비 테마 세트 효과 (5종 · 2/3/4세트) ──────────────────────────────
 * 같은 테마의 장비를 2·3·4부위 장착할 때마다 누적 보너스가 발동된다.
 * 5종 모두 4부위 이상에 걸쳐 분포해 2+2 / 2+3 / 4세트 조합이 모두 가능하다.
 */
export const GEAR_SETS = [
  {
    id: 'dragon', icon: '🐉', name: '용살자', color: '#ff7a3d',
    tiers: [
      { need: 2, opts: { bossDmg: 12, atkPct: 8 } },
      { need: 3, opts: { critDmg: 20, lifesteal: 3 } },
      { need: 4, opts: { bossDmg: 20, atkPct: 15 } },
    ],
  },
  {
    id: 'abyss', icon: '🌌', name: '심연', color: '#b98bff',
    tiers: [
      { need: 2, opts: { lifesteal: 3, dmgRed: 5 } },
      { need: 3, opts: { whirlDmg: 18, hpPct: 12 } },
      { need: 4, opts: { atkPct: 16, critDmg: 24 } },
    ],
  },
  {
    id: 'guardian', icon: '🛡️', name: '수호자', color: '#7cc4ff',
    tiers: [
      { need: 2, opts: { hpPct: 10, dmgRed: 4 } },
      { need: 3, opts: { regen: 3, dmgRed: 6 } },
      { need: 4, opts: { hpPct: 18, atkPct: 12 } },
    ],
  },
  {
    id: 'storm', icon: '⚡', name: '폭풍', color: '#ffe36a',
    tiers: [
      { need: 2, opts: { atkSpd: 8, critPct: 4 } },
      { need: 3, opts: { critDmg: 18, atkPct: 8 } },
      { need: 4, opts: { atkSpd: 10, whirlDmg: 20 } },
    ],
  },
  {
    id: 'fortune', icon: '🍀', name: '황금', color: '#5ee1a3',
    tiers: [
      { need: 2, opts: { goldPct: 15, dropPct: 10 } },
      { need: 3, opts: { goldPct: 20, atkPct: 8 } },
      { need: 4, opts: { dropPct: 20, goldPct: 25 } },
    ],
  },
];
export const GEAR_SET_BY_ID = GEAR_SETS.reduce((m, st) => { m[st.id] = st; return m; }, {});
export const GEAR_SET_FILTERS = ['all', ...GEAR_SETS.map((st) => st.id)];

/* ────────────────────────────── v5.6.0 장비 접두사(잠재 옵션) · 재련 ──────────────────────────────
 * 드랍/뽑기/보상으로 얻은 장비에 랜덤 잠재 옵션 1줄이 붙으며, 강화석으로 언제든 재련(리롤)할 수 있다.
 */
export const GEAR_AFFIXES = [
  { id: 'fierce', name: '맹렬한', key: 'atkPct', vals: [2, 4, 6, 9, 13] },
  { id: 'sturdy', name: '견고한', key: 'hpPct', vals: [3, 5, 8, 12, 16] },
  { id: 'keen', name: '예리한', key: 'critPct', vals: [1, 2, 4, 6, 8] },
  { id: 'brutal', name: '잔혹한', key: 'critDmg', vals: [4, 7, 11, 16, 22] },
  { id: 'swift', name: '신속한', key: 'atkSpd', vals: [2, 4, 6, 8, 11] },
  { id: 'vampiric', name: '흡혈의', key: 'lifesteal', vals: [1, 1, 2, 3, 4] },
  { id: 'slayer', name: '학살의', key: 'bossDmg', vals: [3, 6, 9, 13, 18] },
  { id: 'greedy', name: '탐욕의', key: 'goldPct', vals: [4, 7, 11, 16, 22] },
];
export const GEAR_AFFIX_BY_ID = GEAR_AFFIXES.reduce((m, a) => { m[a.id] = a; return m; }, {});
export const GEAR_REFORGE_COST = [5, 10, 20, 35, 55]; // 일반 → 전설 강화석 비용

/** 등급별 잠재 재련 비용(강화석) */
export function gearReforgeCost(item) {
  const it = typeof item === 'string' ? gearItem(item) : item;
  if (!it) return 10;
  return GEAR_REFORGE_COST[ridx(it.rarity)] || 10;
}

/** 랜덤 잠재 옵션 생성 (prevId 와 다른 접두사 우선 선택) */
export function rollGearAffix(rarityId, rng = Math.random, prevId = null) {
  const idx = ridx(rarityId);
  const pool = prevId ? GEAR_AFFIXES.filter((a) => a.id !== prevId) : GEAR_AFFIXES;
  const pick = pool[Math.floor(rng() * pool.length) % pool.length] || GEAR_AFFIXES[0];
  return { id: pick.id, val: pick.vals[idx] || pick.vals[0] };
}

/** 저장된 affix 정규화(없거나 손상이면 null) */
export function normalizeAffix(raw, rarityId) {
  if (!raw || typeof raw !== 'object') return null;
  const def = GEAR_AFFIX_BY_ID[raw.id];
  if (!def) return null;
  const maxVal = def.vals[Math.min(def.vals.length - 1, ridx(rarityId))] || def.vals[def.vals.length - 1];
  const val = Math.max(1, Math.min(maxVal, Math.floor(Number(raw.val) || maxVal)));
  return { id: def.id, val };
}

/** affix 표시 객체 { id, name, key, val, text } (없으면 null) */
export function gearAffixInfo(affix) {
  if (!affix || !GEAR_AFFIX_BY_ID[affix.id]) return null;
  const def = GEAR_AFFIX_BY_ID[affix.id];
  return { id: def.id, name: def.name, key: def.key, val: affix.val, text: gearOptText(def.key, affix.val) };
}

/** 장착 슬롯의 아이템 행({ uid, id, at, affix? }) */
export function equippedRow(s, slot) {
  const g = s && s.gear;
  if (!g || !g.items) return null;
  const uid = g.equipped && g.equipped[slot];
  if (!uid) return null;
  return g.items.find((x) => x.uid === uid) || null;
}

/** v5.6 잠재 재련 — 강화석을 써서 해당 장비의 접두사(잠재 옵션)를 새로 뽑는다 */
export function reforgeGear(s, uid, rng = Math.random) {
  const g = s && s.gear;
  if (!g || !Array.isArray(g.items)) return { ok: false, reason: '장비 정보가 없습니다.' };
  const row = g.items.find((x) => x.uid === Math.floor(Number(uid)));
  const it = row ? gearItem(row.id) : null;
  if (!it) return { ok: false, reason: '장비를 찾을 수 없습니다.' };
  const cost = gearReforgeCost(it);
  if (Math.floor(Number(s.shards) || 0) < cost) {
    return { ok: false, reason: `강화석이 부족합니다. (필요 💎${cost})`, cost };
  }
  s.shards = Math.floor(s.shards - cost);
  const prevId = row.affix && row.affix.id ? row.affix.id : null;
  row.affix = rollGearAffix(it.rarity, rng, prevId);
  return { ok: true, uid: row.uid, item: it, affix: gearAffixInfo(row.affix), spent: cost };
}

/** 아이템이 속한 테마 세트 정의(없으면 null) */
export function gearSetOf(item) {
  const it = typeof item === 'string' ? gearItem(item) : item;
  return (it && it.set && GEAR_SET_BY_ID[it.set]) || null;
}

/** 세트 보너스 옵션 객체 → 읽기 좋은 문자열 */
export function gearSetBonusText(opts, sep = ' · ') {
  if (!opts || typeof opts !== 'object') return '';
  return GEAR_OPT_KEYS
    .filter((k) => typeof opts[k] === 'number' && opts[k] > 0)
    .map((k) => gearOptText(k, opts[k]))
    .join(sep);
}

export const GEAR_BY_ID = GEAR_ITEMS.reduce((m, it) => { m[it.id] = it; return m; }, {});
export const GEAR_BY_SLOT = EQUIP_SLOTS.reduce((m, slot) => {
  m[slot] = GEAR_ITEMS.filter((it) => it.slot === slot);
  return m;
}, {});
export const GEAR_BY_RARITY = RARITY_IDS.reduce((m, id) => {
  m[id] = GEAR_ITEMS.filter((it) => it.rarity === id);
  return m;
}, {});

/** id → 아이템 정의(없으면 null) */
export function gearItem(id) {
  return (typeof id === 'string' && GEAR_BY_ID[id]) || null;
}
/** 등급 id → 등급 인덱스 */
function ridx(id) {
  return RARITY_INDEX[id] || 0;
}
/** 분해 시 나오는 강화석 */
export function dismantleValue(item) {
  const it = typeof item === 'string' ? gearItem(item) : item;
  if (!it) return 0;
  return RARITIES[ridx(it.rarity)].dust;
}
/** 옵션 한 줄 텍스트 */
export function gearOptText(key, val) {
  const def = GEAR_OPTS[key];
  if (!def) return '';
  return `${def.icon} ${def.name} +${val}${def.unit}`;
}
/** 아이템 옵션 목록 [{key, value, text}] — 정의된 순서대로 */
export function gearOptionList(item) {
  const it = typeof item === 'string' ? gearItem(item) : item;
  if (!it || !it.opts) return [];
  return GEAR_OPT_KEYS.filter((k) => typeof it.opts[k] === 'number' && it.opts[k] > 0)
    .map((k) => ({ key: k, value: it.opts[k], text: gearOptText(k, it.opts[k]) }));
}
/** 아이템 옵션 요약 문자열 */
export function gearOptionSummary(item, sep = ' · ') {
  return gearOptionList(item).map((o) => o.text).join(sep);
}
/** 자동 장착·정렬에 쓰는 힘 점수(등급 우선, 같은 등급이면 옵션 합) */
export function itemScore(item) {
  const it = typeof item === 'string' ? gearItem(item) : item;
  if (!it) return 0;
  let sum = 0;
  for (const k of GEAR_OPT_KEYS) sum += Math.max(0, Number(it.opts && it.opts[k]) || 0);
  return ridx(it.rarity) * 1000 + sum;
}

/* ────────────────────────────── 자동분해 등급 기준 (v4.7) ──────────────────────────────
 * 방치 중 인벤토리가 넘치지 않도록, 설정 등급 이하의 새 장비를 들어오는 즉시 강화석으로 바꾼다.
 *  - 'off'       : 끔(기본 — 기존 저장본을 건드리지 않는 안전한 기본값)
 *  - 'common'    : 일반 이하
 *  - 'advanced'  : 고급 이하
 *  - 'rare'      : 레어 이하
 *  - 'hero'      : 영웅 이하
 * 제외 대상: ① 지금 장착 중인 장비 ② 기준보다 높은 등급 ③ 자동 장착되는 장비(현재 등급보다 높음)
 */
export const AUTO_DISMANTLE_MODES = [
  { id: 'off', label: '끔', short: '끔' },
  { id: 'common', label: '일반 이하', short: '일반' },
  { id: 'advanced', label: '고급 이하', short: '고급' },
  { id: 'rare', label: '레어 이하', short: '레어' },
  { id: 'hero', label: '영웅 이하', short: '영웅' },
];
export const AUTO_DISMANTLE_IDS = AUTO_DISMANTLE_MODES.map((m) => m.id);

/** 저장값을 안전한 모드 id 로 정리한다(모르는 값은 끔) */
export function normalizeAutoMode(v) {
  return AUTO_DISMANTLE_IDS.includes(v) ? v : 'off';
}

/** 자동분해 기준 등급 인덱스(끔이면 -1) */
export function autoDismantleIdx(s) {
  const mode = normalizeAutoMode(s && s.gear && s.gear.autoDismantle);
  return mode === 'off' ? -1 : RARITY_INDEX[mode];
}

/** 자동분해 기준의 표시 이름('레어 이하' / '끔') */
export function autoDismantleLabel(s) {
  const mode = normalizeAutoMode(s && s.gear && s.gear.autoDismantle);
  const m = AUTO_DISMANTLE_MODES.find((x) => x.id === mode) || AUTO_DISMANTLE_MODES[0];
  return m.label;
}

/* ────────────────────────────── 상태 ────────────────────────────── */
export const GEAR_MAX_ITEMS = 120; // 인벤토리 상한 — 넘치면 가장 약한(미장착) 장비부터 자동 분해
export const GEAR_FILTERS = ['all', ...EQUIP_SLOTS];

/* ────────────────────────────── v4.10.0 장비 프리셋 · 부위 각성 ────────────────────────────── */
export const GEAR_PRESET_NAMES = [
  { id: 0, icon: '⚔️', name: '사냥' },
  { id: 1, icon: '👑', name: '보스' },
  { id: 2, icon: '🗼', name: '탑' },
];
export const GEAR_PRESET_COUNT = GEAR_PRESET_NAMES.length;
export const GEAR_AWAKEN_MAX = 10;
export const GEAR_AWAKEN_BONUS_LV = 5; // 각성 1단계당 부위 강화 +5강 상당
export const GEAR_AWAKEN_OPT_PCT = 8;  // 각성 1단계당 장착 장비 고유 옵션 +8% 증폭

export function emptyPreset() {
  return { weapon: null, armor: null, helmet: null, ring: null, amulet: null };
}
export function emptyAwaken() {
  return { weapon: 0, armor: 0, helmet: 0, ring: 0, amulet: 0 };
}

export function newGearState() {
  return {
    items: [],                       // [{ uid, id, at }]
    equipped: { weapon: null, armor: null, helmet: null, ring: null, amulet: null },
    nextUid: 1,
    filter: 'all',                   // UI 필터(세이브 코드에는 담지 않는다)
    seen: {},                        // { itemId: 획득 횟수 } — 수집 현황
    drops: 0,                        // 사냥 드랍 획득 수
    bulk: 0,                         // 일괄 분해로 정리한 수
    autoDismantle: 'off',            // v4.7 자동분해 등급 기준
    auto: { count: 0, shards: 0 },   // v4.7 자동분해 누적(건수 · 강화석)
    presets: [emptyPreset(), emptyPreset(), emptyPreset()], // v4.10 장비 프리셋 3슬롯
    activePreset: -1,                // 마지막 적용 프리셋(-1 = 없음)
    awaken: emptyAwaken(),           // v4.10 부위 각성 레벨(0~10, 환생 시 영구 유지)
  };
}

/** 저장본 정규화 — 손상 값 방어 + v3 등급 저장본을 해당 등급 장비로 마이그레이션 */
export function normalizeGear(raw, legacyRarity, now = 0) {
  const g = newGearState();
  const src = raw && typeof raw === 'object' ? raw : {};
  const used = new Set();
  const list = Array.isArray(src.items) ? src.items : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const def = gearItem(row.id);
    if (!def) continue;
    let uid = Math.floor(Number(row.uid));
    if (!isFinite(uid) || uid <= 0 || used.has(uid)) uid = used.size + 1;
    while (used.has(uid)) uid += 1;
    used.add(uid);
    const cleanRow = { uid, id: def.id, at: Math.max(0, Number(row.at) || 0) };
    const af = normalizeAffix(row.affix, def.rarity);
    if (af) cleanRow.affix = af;
    g.items.push(cleanRow);
    if (g.items.length >= GEAR_MAX_ITEMS) break;
  }
  const eq = src.equipped && typeof src.equipped === 'object' ? src.equipped : {};
  for (const slot of EQUIP_SLOTS) {
    const uid = Math.floor(Number(eq[slot]));
    const row = g.items.find((x) => x.uid === uid);
    g.equipped[slot] = row && gearItem(row.id).slot === slot ? row.uid : null;
  }
  g.nextUid = Math.max(1, Math.floor(Number(src.nextUid) || 0), used.size ? Math.max(...used) + 1 : 1);
  for (const row of g.items) {
    if (row.uid >= g.nextUid) g.nextUid = row.uid + 1;
  }
  g.filter = GEAR_FILTERS.includes(src.filter) ? src.filter : 'all';
  const seen = src.seen && typeof src.seen === 'object' ? src.seen : {};
  for (const [id, n] of Object.entries(seen)) {
    if (!gearItem(id)) continue;
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (v > 0) g.seen[id] = v;
  }
  g.drops = Math.max(0, Math.floor(Number(src.drops) || 0));
  g.bulk = Math.max(0, Math.floor(Number(src.bulk) || 0));
  // v4.7: 자동분해 기준·누적 — 없는 저장본은 '끔'으로 시작한다(아이템을 조용히 지우지 않는다)
  g.autoDismantle = normalizeAutoMode(src.autoDismantle);
  const rawAuto = src.auto && typeof src.auto === 'object' ? src.auto : {};
  g.auto = {
    count: Math.max(0, Math.floor(Number(rawAuto.count) || 0)),
    shards: Math.max(0, Math.floor(Number(rawAuto.shards) || 0)),
  };
  // v4.10: 장비 프리셋 3슬롯 정규화
  const rawPresets = Array.isArray(src.presets) ? src.presets : [];
  g.presets = [];
  for (let i = 0; i < GEAR_PRESET_COUNT; i++) {
    const p = rawPresets[i] && typeof rawPresets[i] === 'object' ? rawPresets[i] : {};
    const clean = emptyPreset();
    for (const slot of EQUIP_SLOTS) {
      const id = typeof p[slot] === 'string' ? p[slot] : null;
      const def = id ? gearItem(id) : null;
      clean[slot] = def && def.slot === slot ? def.id : null;
    }
    g.presets.push(clean);
  }
  const ap = Math.floor(Number(src.activePreset));
  g.activePreset = Number.isFinite(ap) && ap >= 0 && ap < GEAR_PRESET_COUNT ? ap : -1;
  // v4.10: 부위 각성 레벨(0~10) 정규화
  const rawAwk = src.awaken && typeof src.awaken === 'object' ? src.awaken : {};
  g.awaken = emptyAwaken();
  for (const slot of EQUIP_SLOTS) {
    g.awaken[slot] = Math.max(0, Math.min(GEAR_AWAKEN_MAX, Math.floor(Number(rawAwk[slot]) || 0)));
  }

  // v3 → v4 마이그레이션: 등급만 있던 저장본을 '그 등급의 장비'로 바꿔 끼운다.
  // (강화 레벨 s.equip 은 부위에 남아 있으므로 그대로 이어진다)
  if (!g.items.length) {
    const legacy = legacyRarity && typeof legacyRarity === 'object' ? legacyRarity : {};
    for (const slot of EQUIP_SLOTS) {
      const rid = legacy[slot];
      if (!RARITY_IDS.includes(rid) || rid === 'common') continue;
      const pool = GEAR_BY_SLOT[slot].filter((it) => it.rarity === rid);
      if (!pool.length) continue;
      // 같은 등급 중 무기=공격 계열, 방어구=생존 계열 등 부위 성격에 맞는 첫 아이템
      const pick = pool[0];
      const uid = g.nextUid++;
      g.items.push({ uid, id: pick.id, at: Math.max(0, now) });
      g.equipped[slot] = uid;
      g.seen[pick.id] = (g.seen[pick.id] || 0) + 1;
    }
  }
  return g;
}

/** 장착 아이템(정의) — 없으면 null */
export function equippedItem(s, slot) {
  const g = s && s.gear;
  if (!g || !g.items) return null;
  const uid = g.equipped && g.equipped[slot];
  if (!uid) return null;
  const row = g.items.find((x) => x.uid === uid);
  return row ? gearItem(row.id) : null;
}

/** 장착 슬롯의 등급 — 아이템이 없으면 v3 호환용 gearRarity 값을 따른다 */
export function equippedRarity(s, slot) {
  const it = equippedItem(s, slot);
  if (it) return it.rarity;
  const gr = (s && s.gearRarity) || {};
  return RARITY_IDS.includes(gr[slot]) ? gr[slot] : 'common';
}

/** 슬롯에 아이템 없이 '등급만' 있는 v3식 상태인가 */
function implicitRarity(s, slot) {
  return !equippedItem(s, slot) && equippedRarity(s, slot) !== 'common';
}

/** gearRarity(등급 미러)를 장착 아이템에 맞춘다 — 렌더러·도감·기존 로직이 그대로 동작한다 */
export function syncGearRarity(s) {
  if (!s) return;
  if (!s.gearRarity || typeof s.gearRarity !== 'object') {
    s.gearRarity = { weapon: 'common', armor: 'common', helmet: 'common', ring: 'common', amulet: 'common' };
  }
  for (const slot of EQUIP_SLOTS) s.gearRarity[slot] = equippedRarity(s, slot);
}

/** 보유 아이템 목록(장착 여부 포함) */
export function gearOwned(s) {
  const g = s && s.gear;
  if (!g || !Array.isArray(g.items)) return [];
  return g.items.map((row) => {
    const def = gearItem(row.id);
    if (!def) return null;
    return { ...row, def, equipped: g.equipped[def.slot] === row.uid };
  }).filter(Boolean);
}

/** 인벤토리 표시용 정렬 — 장착 → 등급 높은 순 → 부위 순 → 이름 (v5.5 테마 필터 지원) */
export function gearList(s, filter = 'all', setFilter = 'all') {
  const slotOrder = (slot) => EQUIP_SLOTS.indexOf(slot);
  const sf = GEAR_SET_FILTERS.includes(setFilter) ? setFilter : 'all';
  return gearOwned(s)
    .filter((row) => (filter === 'all' || row.def.slot === filter) && (sf === 'all' || row.def.set === sf))
    .sort((a, b) => {
      if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
      const d = itemScore(b.def) - itemScore(a.def);
      if (d) return d;
      const s2 = slotOrder(a.def.slot) - slotOrder(b.def.slot);
      return s2 || a.def.name.localeCompare(b.def.name);
    });
}

/** 같은 아이템을 이미 가지고 있는가 */
function hasItem(s, id) {
  return s.gear.items.some((row) => row.id === id);
}

/** 자동 장착 판정 — 등급이 더 높거나, 비어 있는 슬롯이면 장착 */
export function shouldAutoEquip(s, item) {
  const it = typeof item === 'string' ? gearItem(item) : item;
  if (!it) return false;
  const cur = ridx(equippedRarity(s, it.slot));
  const next = ridx(it.rarity);
  if (next > cur) return true;
  return next === cur && !equippedItem(s, it.slot) && !implicitRarity(s, it.slot);
}

/**
 * 장비 획득 — 인벤토리에 넣고, 조건이 맞으면 자동 장착한다.
 * 중복(같은 아이템)은 즉시 강화석으로 분해. 상한을 넘으면 가장 약한 미장착 장비부터 정리.
 * @returns {{ ok:boolean, uid?:number, item?:object, equipped?:boolean, duplicate?:boolean, shards?:number, overflow?:number }}
 */
export function acquireGear(s, itemId, { autoEquip = true, now = 0, source = 'drop', rollAffix = false, rng = Math.random } = {}) {
  const it = gearItem(itemId);
  if (!s || !it) return { ok: false };
  if (!s.gear) s.gear = newGearState();
  if (!Array.isArray(s.gear.items)) s.gear.items = [];
  if (!s.gear.equipped) s.gear.equipped = newGearState().equipped;

  s.gear.seen[it.id] = Math.max(0, Math.floor(Number(s.gear.seen[it.id]) || 0)) + 1;
  if (source === 'drop') s.gear.drops = Math.max(0, Math.floor(Number(s.gear.drops) || 0)) + 1;

  if (hasItem(s, it.id)) {
    const shards = dismantleValue(it);
    s.shards = Math.max(0, Math.floor(Number(s.shards) || 0)) + shards;
    if (s.records) s.records.gearDust = Math.max(0, Number(s.records.gearDust) || 0) + shards;
    return { ok: true, item: it, duplicate: true, equipped: false, shards };
  }

  const equip = autoEquip && shouldAutoEquip(s, it);
  // v4.7 자동분해 — 기준 등급 이하이고, 장착/자동 장착 대상이 아니면 인벤토리에 넣지 않고 즉시 강화석으로
  const autoIdx = autoDismantleIdx(s);
  if (!equip && autoIdx >= 0 && ridx(it.rarity) <= autoIdx) {
    const shards = dismantleValue(it);
    s.shards = Math.max(0, Math.floor(Number(s.shards) || 0)) + shards;
    if (s.records) s.records.gearDust = Math.max(0, Number(s.records.gearDust) || 0) + shards;
    if (!s.gear.auto || typeof s.gear.auto !== 'object') s.gear.auto = { count: 0, shards: 0 };
    s.gear.auto.count = Math.max(0, Math.floor(Number(s.gear.auto.count) || 0)) + 1;
    s.gear.auto.shards = Math.max(0, Math.floor(Number(s.gear.auto.shards) || 0)) + shards;
    return { ok: true, item: it, duplicate: false, equipped: false, auto: true, shards };
  }

  const uid = Math.max(1, Math.floor(Number(s.gear.nextUid) || 1));
  s.gear.nextUid = uid + 1;
  const newRow = { uid, id: it.id, at: Math.max(0, Number(now) || 0) };
  if (rollAffix) newRow.affix = rollGearAffix(it.rarity, rng);
  s.gear.items.push(newRow);
  if (equip) s.gear.equipped[it.slot] = uid;

  let overflow = 0;
  if (s.gear.items.length > GEAR_MAX_ITEMS) {
    const victim = s.gear.items
      .filter((row) => !Object.values(s.gear.equipped).includes(row.uid))
      .sort((a, b) => itemScore(gearItem(a.id)) - itemScore(gearItem(b.id)))[0];
    if (victim) {
      s.gear.items = s.gear.items.filter((row) => row !== victim);
      const shards = dismantleValue(victim.id);
      s.shards = Math.max(0, Math.floor(Number(s.shards) || 0)) + shards;
      overflow = 1;
    }
  }
  syncGearRarity(s);
  return { ok: true, uid, item: it, equipped: equip, duplicate: false, shards: 0, overflow };
}

/** 장착 — 같은 부위의 기존 장비는 인벤토리에 남는다(강화 레벨은 부위에 남아 공유) */
export function equipGear(s, uid) {
  const g = s && s.gear;
  if (!g) return { ok: false, reason: '장비 정보가 없습니다.' };
  const row = g.items.find((x) => x.uid === Math.floor(Number(uid)));
  const it = row ? gearItem(row.id) : null;
  if (!it) return { ok: false, reason: '장비를 찾을 수 없습니다.' };
  const prev = g.equipped[it.slot];
  if (prev === row.uid) return { ok: false, reason: '이미 장착 중입니다.', noop: true };
  g.equipped[it.slot] = row.uid;
  syncGearRarity(s);
  return { ok: true, item: it, prevUid: prev || null };
}

/** 분해 — 장착 중이면 슬롯이 비고(등급 common) 강화석이 들어온다 */
export function dismantleGear(s, uid) {
  const g = s && s.gear;
  if (!g) return { ok: false, reason: '장비 정보가 없습니다.' };
  const target = Math.floor(Number(uid));
  const row = g.items.find((x) => x.uid === target);
  const it = row ? gearItem(row.id) : null;
  if (!it) return { ok: false, reason: '장비를 찾을 수 없습니다.' };
  const wasEquipped = g.equipped[it.slot] === row.uid;
  g.items = g.items.filter((x) => x.uid !== row.uid);
  if (wasEquipped) g.equipped[it.slot] = null;
  const shards = dismantleValue(it);
  s.shards = Math.max(0, Math.floor(Number(s.shards) || 0)) + shards;
  if (s.records) s.records.gearDust = Math.max(0, Number(s.records.gearDust) || 0) + shards;
  syncGearRarity(s);
  return { ok: true, item: it, shards, wasEquipped };
}

/** 일괄 분해 — mode: 'low'(장착보다 낮은 등급) | 'common'(일반 등급) | 'threshold'(자동분해 기준 이하) */
export function dismantleTargets(s, mode = 'low') {
  const rows = gearOwned(s).filter((row) => !row.equipped);
  if (mode === 'common') return rows.filter((row) => row.def.rarity === 'common');
  if (mode === 'threshold') {
    const idx = autoDismantleIdx(s);
    return idx < 0 ? [] : rows.filter((row) => ridx(row.def.rarity) <= idx);
  }
  return rows.filter((row) => ridx(row.def.rarity) < ridx(equippedRarity(s, row.def.slot)));
}

export function bulkDismantle(s, mode = 'low') {
  const targets = dismantleTargets(s, mode);
  if (!targets.length) return { ok: false, count: 0, shards: 0, reason: '분해할 장비가 없습니다.' };
  let shards = 0;
  const ids = new Set(targets.map((row) => row.uid));
  for (const row of targets) shards += dismantleValue(row.def);
  s.gear.items = s.gear.items.filter((row) => !ids.has(row.uid));
  s.shards = Math.max(0, Math.floor(Number(s.shards) || 0)) + shards;
  s.gear.bulk = Math.max(0, Math.floor(Number(s.gear.bulk) || 0)) + targets.length;
  if (s.records) s.records.gearDust = Math.max(0, Number(s.records.gearDust) || 0) + shards;
  syncGearRarity(s);
  return { ok: true, count: targets.length, shards, items: targets.map((row) => row.def) };
}

/** 부위 각성 레벨(0~10) */
export function awakenLevel(s, slot) {
  const v = s && s.gear && s.gear.awaken && s.gear.awaken[slot];
  return Math.max(0, Math.min(GEAR_AWAKEN_MAX, Math.floor(Number(v) || 0)));
}

/** 각성 1단계 비용(강화석 + 골드) — 최대치면 null */
export function awakenCost(lv) {
  const cur = Math.max(0, Math.floor(Number(lv) || 0));
  if (cur >= GEAR_AWAKEN_MAX) return null;
  return {
    shards: Math.round(120 * Math.pow(1.45, cur)),
    gold: Math.round(50000 * Math.pow(1.65, cur)),
  };
}

/** 부위 각성 실행 — +100강 도달 부위만 가능(각성 레벨은 환생 후에도 영구 유지) */
export function awakenSlot(s, slot, maxEquipLv = 100) {
  if (!s || !EQUIP_SLOTS.includes(slot)) return { ok: false, reason: '알 수 없는 부위입니다.' };
  if (!s.gear) s.gear = newGearState();
  if (!s.gear.awaken || typeof s.gear.awaken !== 'object') s.gear.awaken = emptyAwaken();
  const eqLv = Math.max(0, Math.floor(Number((s.equip || {})[slot]) || 0));
  if (eqLv < maxEquipLv) return { ok: false, reason: `강화 +${maxEquipLv}강 달성 후 각성할 수 있습니다.` };
  const lv = awakenLevel(s, slot);
  if (lv >= GEAR_AWAKEN_MAX) return { ok: false, reason: '이미 최종 각성 단계입니다.', max: true };
  const cost = awakenCost(lv);
  if (Math.floor(Number(s.shards) || 0) < cost.shards) {
    return { ok: false, reason: `강화석이 부족합니다. (필요 💎${cost.shards.toLocaleString()})`, cost };
  }
  if (Math.floor(Number(s.gold) || 0) < cost.gold) {
    return { ok: false, reason: `골드가 부족합니다. (필요 💰${cost.gold.toLocaleString()})`, cost };
  }
  s.shards = Math.floor(s.shards - cost.shards);
  s.gold = Math.floor(s.gold - cost.gold);
  s.gear.awaken[slot] = lv + 1;
  return { ok: true, slot, lv: lv + 1, spent: cost, max: lv + 1 >= GEAR_AWAKEN_MAX };
}

/** 프리셋에 현재 장착 장비 5부위 저장 */
export function saveGearPreset(s, idx) {
  const i = Math.floor(Number(idx));
  if (!s || !Number.isFinite(i) || i < 0 || i >= GEAR_PRESET_COUNT) return { ok: false, reason: '잘못된 프리셋 슬롯입니다.' };
  if (!s.gear) s.gear = newGearState();
  if (!Array.isArray(s.gear.presets)) s.gear.presets = [emptyPreset(), emptyPreset(), emptyPreset()];
  while (s.gear.presets.length < GEAR_PRESET_COUNT) s.gear.presets.push(emptyPreset());
  const snap = emptyPreset();
  let count = 0;
  for (const slot of EQUIP_SLOTS) {
    const it = equippedItem(s, slot);
    snap[slot] = it ? it.id : null;
    if (it) count += 1;
  }
  if (count === 0) return { ok: false, reason: '장착 중인 장비가 없습니다.' };
  s.gear.presets[i] = snap;
  s.gear.activePreset = i;
  return { ok: true, idx: i, count, preset: snap, meta: GEAR_PRESET_NAMES[i] };
}

/** 프리셋 원탭 적용 — 보유 중인 장비 일괄 장착 */
export function applyGearPreset(s, idx) {
  const i = Math.floor(Number(idx));
  if (!s || !Number.isFinite(i) || i < 0 || i >= GEAR_PRESET_COUNT) return { ok: false, reason: '잘못된 프리셋 슬롯입니다.' };
  const g = s.gear;
  const snap = g && Array.isArray(g.presets) ? g.presets[i] : null;
  if (!snap || !EQUIP_SLOTS.some((slot) => !!snap[slot])) {
    return { ok: false, reason: '저장된 프리셋이 비어 있습니다. 먼저 💾 저장을 눌러 주세요.' };
  }
  let applied = 0;
  let missing = 0;
  for (const slot of EQUIP_SLOTS) {
    const wantId = snap[slot];
    if (!wantId) continue;
    const row = (g.items || []).find((x) => x.id === wantId);
    if (!row) {
      missing += 1;
      continue;
    }
    g.equipped[slot] = row.uid;
    applied += 1;
  }
  if (applied === 0) return { ok: false, reason: '프리셋에 저장된 장비를 현재 보유하고 있지 않습니다.' };
  g.activePreset = i;
  syncGearRarity(s);
  return { ok: true, idx: i, applied, missing, meta: GEAR_PRESET_NAMES[i] };
}

/** 프리셋 슬롯 요약(UI용) */
export function gearPresetSummary(s, idx) {
  const i = Math.floor(Number(idx));
  const meta = GEAR_PRESET_NAMES[i] || GEAR_PRESET_NAMES[0];
  const g = s && s.gear;
  const snap = g && Array.isArray(g.presets) && g.presets[i] ? g.presets[i] : emptyPreset();
  let saved = 0;
  let owned = 0;
  for (const slot of EQUIP_SLOTS) {
    if (!snap[slot]) continue;
    saved += 1;
    if ((g.items || []).some((x) => x.id === snap[slot])) owned += 1;
  }
  return { idx: i, ...meta, saved, owned, active: !!(g && g.activePreset === i) };
}

/** 장착 중인 테마 세트별 발동 현황 */
export function gearSetStatus(s) {
  const counts = {};
  for (const st of GEAR_SETS) counts[st.id] = 0;
  if (s && s.gear) {
    for (const slot of EQUIP_SLOTS) {
      const it = equippedItem(s, slot);
      if (it && it.set && counts[it.set] !== undefined) counts[it.set] += 1;
    }
  }
  return GEAR_SETS.map((st) => {
    const count = counts[st.id] || 0;
    const activeTiers = st.tiers.filter((t) => count >= t.need);
    const nextTier = st.tiers.find((t) => count < t.need) || null;
    const mods = {};
    for (const t of activeTiers) {
      for (const [k, v] of Object.entries(t.opts || {})) {
        mods[k] = (mods[k] || 0) + v;
      }
    }
    return {
      ...st,
      count,
      active: activeTiers.length > 0,
      activeTier: activeTiers.length ? activeTiers[activeTiers.length - 1].need : 0,
      activeTiers,
      nextTier,
      mods,
    };
  });
}

/** 활성화된 장비 세트 효과 옵션 합계 */
export function gearSetMods(s) {
  const out = {};
  for (const k of GEAR_OPT_KEYS) out[k] = 0;
  for (const st of gearSetStatus(s)) {
    if (!st.active) continue;
    for (const [k, v] of Object.entries(st.mods)) {
      if (out[k] !== undefined && isFinite(v) && v > 0) out[k] += v;
    }
  }
  return out;
}

/** 장착 아이템 옵션 합계 — calcStats 가 읽는다 (v4.10 부위 각성 +8%/Lv · v5.2 테마 세트 · v5.6 잠재 접두사 포함) */
export function gearMods(s) {
  const out = {};
  for (const k of GEAR_OPT_KEYS) out[k] = 0;
  if (!s || !s.gear) return out;
  for (const slot of EQUIP_SLOTS) {
    const row = equippedRow(s, slot);
    const it = row ? gearItem(row.id) : null;
    if (!it || !it.opts) continue;
    const mul = 1 + (awakenLevel(s, slot) * GEAR_AWAKEN_OPT_PCT) / 100;
    for (const k of GEAR_OPT_KEYS) {
      const v = Number(it.opts[k]);
      if (isFinite(v) && v > 0) out[k] += Math.round(v * mul * 10) / 10;
    }
    const af = row.affix ? gearAffixInfo(row.affix) : null;
    if (af && out[af.key] !== undefined && af.val > 0) {
      out[af.key] += Math.round(af.val * mul * 10) / 10;
    }
  }
  const sm = gearSetMods(s);
  for (const k of GEAR_OPT_KEYS) {
    if (sm[k] > 0) out[k] = Math.round((out[k] + sm[k]) * 10) / 10;
  }
  return out;
}

/** 수집 현황 — 종류 기준 */
export function gearCollection(s) {
  const seen = s && s.gear && s.gear.seen ? s.gear.seen : {};
  const count = Object.keys(seen).filter((id) => gearItem(id) && Math.floor(Number(seen[id]) || 0) > 0).length;
  return { seen: count, total: GEAR_ITEMS.length };
}

/** 슬롯별 보유 종류 수(도감식 표시) */
export function gearSlotCounts(s) {
  const out = {};
  for (const slot of EQUIP_SLOTS) out[slot] = { have: 0, total: GEAR_BY_SLOT[slot].length };
  for (const row of gearOwned(s)) out[row.def.slot].have += 1;
  return out;
}

/* ────────────────────────────── 드랍 ──────────────────────────────
 * 사냥으로도 장비가 나온다(보스 우대). 스테이지가 높을수록 좋은 등급이 나올 확률이 오른다.
 */
export const GEAR_DROP = {
  normalChance: 0.006, // 일반 몬스터 1마리당
  bossChance: 0.15,    // 보스 처치
  stageBoostPer: 0.015, // 스테이지 1당 고등급 가중치 증가
  stageBoostCap: 1.6,
  bossTierBoost: 0.35, // 보스는 고등급 가중치를 한 단계 더 밀어 준다
};

/** 드랍 등급 인덱스 — 스테이지·보스에 따라 고등급 가중치를 키운 가중치 뽑기 */
export function rollDropRarityIdx(stage, isBoss, rng = Math.random) {
  const s = Math.max(1, Math.floor(Number(stage) || 1));
  const boost = Math.min(GEAR_DROP.stageBoostCap, 1 + (s - 1) * GEAR_DROP.stageBoostPer + (isBoss ? GEAR_DROP.bossTierBoost : 0));
  const weights = RARITIES.map((r, i) => r.weight * Math.pow(boost, i));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return 0;
}

/** 해당 등급에서 아이템 하나(부위 균등) */
export function randomItemOfRarity(rarityId, rng = Math.random) {
  const pool = GEAR_BY_RARITY[rarityId] || [];
  if (!pool.length) return null;
  // 부위를 먼저 균등하게 뽑고 그 부위에서 하나 → 부위 편중을 막는다
  const slot = EQUIP_SLOTS[Math.floor(rng() * EQUIP_SLOTS.length) % EQUIP_SLOTS.length];
  const inSlot = pool.filter((it) => it.slot === slot);
  const list = inSlot.length ? inSlot : pool;
  return list[Math.floor(rng() * list.length) % list.length] || pool[0];
}

/**
 * 사냥 드랍 판정 — { isBoss, stage, buffs, rng } → 획득 결과 또는 null
 * buffs.dropPct(강화석 드랍 보너스)가 장비 드랍 확률도 함께 올린다.
 */
export function tryGearDrop(s, { isBoss = false, stage = 1, buffs = null, dropMult = null, rng = Math.random, now = 0 } = {}) {
  const b = buffs || {};
  const gm = gearMods(s);
  const mult = Number.isFinite(Number(dropMult)) && Number(dropMult) > 0
    ? Number(dropMult)
    : 1 + (Math.max(0, Number(b.dropPct) || 0) + Math.max(0, Number(b.setDropPct) || 0) + Math.max(0, Number(b.synDropPct) || 0) + Math.max(0, Number(gm.dropPct) || 0)) / 100;
  const chance = (isBoss ? GEAR_DROP.bossChance : GEAR_DROP.normalChance) * mult;
  if (rng() >= chance) return null;
  const idx = rollDropRarityIdx(stage, isBoss, rng);
  const it = randomItemOfRarity(RARITIES[idx].id, rng);
  if (!it) return null;
  const res = acquireGear(s, it.id, { autoEquip: true, now, source: 'drop', rollAffix: true, rng });
  return res.ok ? { ...res, isBoss } : null;
}
