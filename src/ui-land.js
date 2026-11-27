// land-rpg / src/ui-land.js
// v6.5.0: 부동산 탭 운영·분석 카드(침공·전국 지도·펫 파견·투자 대시보드·지정가 예약·성채·229개 매물 시장) 및 모바일 390px 필터 바 분리 모듈
// v8.2.0: 영지 화면 맨 위 부동산→사냥 시너지 대시보드(landSynergyDashCard) + 원탭 분산투자 + 침공 출격 대기 사유
import {
  CITIES, LAND, priceInfo, LANDMARK, landmarkLevel, landmarkRentMul, leasePctOf, formatGold,
  portfolioOf, computeBuffs,
} from './land.js';
import { LIMIT_ORDER_MAX, investmentReport } from './orders.js';
import { citySetId, regionSetBuffs, regionSetStatus, SETS_BY_ID } from './region.js';
import { landBuffTotals } from './synergy.js';
import {
  EXPEDITION_DURATIONS, expeditionStatus, expeditionPreview, regionMapData,
} from './expedition.js';
import { invasionStatus } from './invasion.js';
import { CITADEL_FACILITIES, CITADEL_MAX_LV, citadelEffects, citadelUpgradeQuote } from './citadel.js';
import { BANK_PLANS, bankStatus, MEGA_PROJECTS, MEGA_MAX_LV, megaEffects, megaQuote } from './bank.js';
import { petStageInfo } from './meta.js';
import { estateDividendInfo } from './season.js';
import { esc, fmt, hhmmss, mmss } from './ui-fmt.js';

export const paybackText = (hours) => {
  if (!isFinite(hours) || hours <= 0) return '—';
  const min = hours * 60;
  if (min < 90) return `${Math.max(1, Math.round(min))}분`;
  if (hours < 48) return `${hours.toFixed(1)}시간`;
  return `${Math.round(hours / 24)}일`;
};

export const trendHtml = (t) => {
  const up = t >= 0;
  const v = Math.abs(t);
  return `<span class="trend ${up ? 'up' : 'down'}">${up ? '▲' : '▼'}${v.toFixed(1)}%</span>`;
};

export const TRAIT_VIEW = {
  CHEAP_BUILD: { icon: '🔨', n: '건축 특구' },
  HIGH_TAX: { icon: '💰', n: '세무 도시' },
  GROWTH: { icon: '🚀', n: '성장' },
  SAFE_HAVEN: { icon: '🛡️', n: '안전' },
  FREE_TRADE: { icon: '🤝', n: '자유 무역' },
  TOURISM_HUB: { icon: '🏖️', n: '관광' },
  TECH_VALLEY: { icon: '💻', n: '테크' },
};

export const traitBadge = (key) => {
  const info = key && TRAIT_VIEW[key];
  return info ? `<span class="tag">${info.icon} ${info.n}</span>` : '';
};

/* v8.0.0: v6.5 의 모바일 섹션 필터 칩(3층 내비)은 제거 — 3서브 탭(영지/매물/이벤트)으로 대체 */

/* ══════════════════ 🏘️ 부동산 → 사냥 시너지 대시보드 (v8.2.0) ══════════════════
 * 영지 화면 맨 위 한 장 — "지금 내 영지가 사냥에 무엇을 주는가"를 네 줄로 끝낸다.
 *   ① 보유 영지 N곳 · M평        ② 사냥 전투 버프(공격·골드·치명 …)
 *   ③ 시간당 임대수익 · 회수 시간  ④ 다음 권역 세트 완성까지 남은 곳
 * 그리고 그 자리에서 사냥 골드를 부동산으로 붙이는 **원탭 분산투자** 3종.
 * 숫자는 요약 바·전투 스탯·시너지 상세 카드와 같은 landBuffTotals() 를 쓴다(불일치 0).
 */
const DASH_BUFF_ROWS = [
  ['atkPct', '⚔️', '공격'],
  ['goldPct', '💰', '골드'],
  ['critPct', '💥', '치명'],
  ['critDmgPct', '🎯', '치명피해'],
  ['cdrPct', '⏱️', '쿨감', '-'],
  ['bossDmgPct', '👹', '보스'],
  ['expPct', '📈', '경험'],
  ['hpPct', '❤️', '체력'],
  ['dropPct', '🎒', '드롭'],
];

export function landSynergyDashCard(ui) {
  const s = ui.s;
  const p = portfolioOf(s);
  const buffs = (ui.app && ui.app.buffs) || computeBuffs(s);
  const tot = landBuffTotals(buffs);
  const held = p.cities || 0;
  const sets = regionSetStatus(s.land && s.land.owned);
  const doneSets = sets.filter((st) => st.complete);
  // 다음 세트 = 완성(maxNeed)까지 가장 적게 남은 권역
  const next = sets
    .filter((st) => !st.complete)
    .map((st) => Object.assign({}, st, { left: Math.max(0, st.maxNeed - st.held) }))
    .sort((a, b) => a.left - b.left || b.held / Math.max(1, b.maxNeed) - a.held / Math.max(1, a.maxNeed))[0] || null;

  const chips = DASH_BUFF_ROWS
    .filter(([k]) => Number(tot[k]) > 0)
    .map(([k, ico, label, sign]) => `<span class="dash-buff">${ico} ${label} <b>${sign || '+'}${tot[k]}%</b></span>`)
    .join('');
  const buffBlock = chips
    ? `<div class="dash-buffs">${chips}</div>`
    : `<div class="dash-buffs empty">아직 전투 버프가 없습니다 — 아래 <b>원탭 분산투자</b>로 첫 매물을 사면 공격·골드 버프가 바로 붙습니다.</div>`;

  const nextBlock = next
    ? `<div class="dash-next">
        <div class="dash-next-top">
          <span class="dash-next-k">🗺️ 다음 세트</span>
          <span class="dash-next-name" style="color:${next.color}">${next.icon} ${esc(next.name)}</span>
          <span class="dash-next-cnt"><b>${next.held}</b>/${next.maxNeed}곳</span>
        </div>
        <div class="prog tiny-prog" style="margin-top:4px"><i style="width:${Math.round((next.held / Math.max(1, next.maxNeed)) * 100)}%;background:linear-gradient(90deg,#2c6ea8,${next.color})"></i></div>
        <div class="dash-next-sub">
          <span><b class="gold">${next.left}곳</b> 더 사면 완성 → ${esc(next.masterText || '전투 시너지')}</span>
          <button class="mini ghost" type="button" data-action="land-map-region" data-value="${next.id}">매물 ▸</button>
        </div>
        ${next.nextNeed ? `<div class="dash-next-step tiny dim">다음 단계 ${next.nextNeed}곳 → ${esc(next.nextText.split('→ ')[1] || '')}</div>` : ''}
      </div>`
    : `<div class="dash-next done">🗺️ <b>모든 권역 세트 완성 ${doneSets.length}/${sets.length}</b> · 완성 시너지가 전투에 모두 적용 중입니다.</div>`;

  const dv = estateDividendInfo(s);
  const divLine = dv.cur
    ? `<div class="dash-div${dv.canClaim ? ' ready' : ''}">
        <span>${dv.cur.icon} <b>영지 배당 T${dv.cur.tier} (${dv.cur.name})</b> · ✨${dv.cur.points}P 💎${dv.cur.shards}${dv.cur.medals ? ` 🏅${dv.cur.medals}` : ''}${dv.cur.gemLv ? ` 💠Lv.${dv.cur.gemLv}` : ''}</span>
        ${dv.canClaim ? '<button class="mini up" type="button" data-action="goto-todo">📋 수령</button>' : '<span class="tiny dim">오늘 수령✓</span>'}
      </div>`
    : `<div class="dash-div"><span>🏡 <b>일일 영지 배당</b> · 영지 3곳+ 또는 자산 5만+ 달성 시 매일 ✨초월석·🏅훈장·💠보석 지급</span></div>`;

  return `
  <div class="card land-dash" id="landSynergyDash">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏘️</span>부동산 → 사냥 시너지<small>${held}곳 · ${fmt(p.pyeong)}평</small></div>
      <span class="tiny dim">사냥 골드 → 매물 → 더 강한 사냥</span>
    </div>
    <div class="dash-rent">
      <span class="dash-rent-k">시간당 임대</span>
      <b class="dash-rent-v" data-live="income">+💰${formatGold(p.incomePerHour)}/h</b>
      <span class="dash-rent-acc">회수 <b>${paybackText(p.incomePerHour > 0 ? p.landValue / p.incomePerHour : 0)}</b></span>
    </div>
    ${buffBlock}
    ${divLine}
    ${nextBlock}
    <div class="dash-invest">
      <div class="dash-invest-h">⚡ 원탭 분산투자 <small class="dim">보유 골드 💰${formatGold(s.gold)} · 견적 확인 후 매수</small></div>
      <div class="dash-invest-btns">
        <button class="btn small ghost" type="button" data-action="land-auto-invest" data-value="region">🗺️ 권역 채우기</button>
        <button class="btn small ghost" type="button" data-action="land-auto-invest" data-value="roi">💰 ROI TOP5</button>
        <button class="btn small ghost" type="button" data-action="land-auto-invest" data-value="dip">📉 저점 매수</button>
      </div>
    </div>
  </div>`;
}

/* ══════════════════ 🚨 영지 침공 방어전 (v5.11.0) ══════════════════ */
export function invasionCard(ui) {
  const s = ui.s;
  const b = ui.battle;
  const now = Date.now();
  const st = invasionStatus(s, now);
  const live = b && b.invasion;
  const busy = !!(b && (b.invasion || b.tower || b.dungeon || b.daily || b.boss));
  // v8.2.0 — 다른 전투가 돌고 있어 출격이 막힌 이유를 버튼과 바로 아래에 그대로 적는다
  const busyWhy = !b ? '' : b.invasion ? '침공 방어전' : b.boss ? '보스전' : b.tower ? '도전의 탑' : b.dungeon ? '황금 던전' : b.daily ? '일일 보스' : '';
  const blocked = !!(st.available && busy && !live && busyWhy);
  const boomsHtml = st.activeBooms.length
    ? `<div class="inv-booms">${st.activeBooms.slice(0, 3).map((bm) => `<span class="tag boom">🎉 ${esc(bm.city.name)} 임대 +${bm.pct}% (${mmss(bm.leftMs)})</span>`).join('')}</div>`
    : '';
  if (!st.hasLand) {
    return `
    <div class="card inv-card" id="invasionCard">
      <div class="card-head">
        <div class="card-title"><span class="t-ico">🚨</span>영지 침공 방어전<small>부동산 × 전투</small></div>
        <span class="tiny dim">매물 1곳부터 해금</span>
      </div>
      <div class="tiny dim">부동산을 1곳 이상 매수하면 30분마다 침공 경보가 열립니다. 방어에 성공하면 <b>30분간 해당 지역 임대수익 +50%</b>와 대량 보상을 받습니다.</div>
    </div>`;
  }
  const rw = st.reward;
  const rwText = rw ? `💰${formatGold(rw.gold)} · 💎${rw.shards}${rw.points ? ` · ✨${rw.points}P` : ''} · 🎉임대 +${rw.boomPct}%(30분)` : '';
  return `
  <div class="card inv-card${live ? ' live' : st.won ? ' won' : ''}" id="invasionCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🚨</span>영지 침공 방어전<small>훈장 🏅${st.medals} · 35초</small></div>
      <span class="tiny" style="color:${st.available || live ? '#ff9fa8' : 'var(--dim)'}" data-live="inv-left">${live ? `방어 중 · ${(Math.max(0, live.ends - now) / 1000).toFixed(1)}초` : st.available ? '🚨 침공 경보!' : `다음 경보 ${mmss(st.nextMs)}`}</span>
    </div>
    <div class="inv-head">
      <span class="inv-city">${st.city.emoji} ${esc(st.city.name)}${st.landmarkLv ? ` <span class="tag lm">🏛️Lv.${st.landmarkLv}</span>` : ''}</span>
      <span class="inv-wave">${esc(st.wave.name)} · 보스 ${esc(st.wave.bossKo)}</span>
    </div>
    <div class="tiny ellip" style="margin-top:4px" data-live="inv-run">${
      live
        ? `<b style="color:var(--gold)">방어 중</b> · ${esc(live.city.name)} · ${live.kills + live.bossKills}/${live.goal} 격파`
        : st.available
          ? `승리 보상: <b style="color:var(--gold)">${rwText}</b>`
          : `✅ 이번 침공 방어 완료! · 다음 경보까지 ${mmss(st.nextMs)}`
    }</div>
    ${boomsHtml}
    <button class="btn small ${st.available && !busy ? 'primary' : 'ghost'} block" style="margin-top:7px" type="button" data-action="invasion" ${!st.available || busy ? 'disabled' : ''}>
      ${live ? '🚨 방어전 진행 중' : blocked ? `⏳ ${busyWhy} 진행 중 · 출격 대기` : st.available ? `⚔️ ${esc(st.city.name)} 방어 출격!` : '✅ 방어 완료 · 다음 경보 대기'}
    </button>
    ${blocked ? `<div class="tiny inv-busy" data-live="inv-busy">⏳ ${busyWhy}이(가) 끝나면 바로 출격할 수 있습니다 (경보는 그동안 유지됩니다)</div>` : ''}
    <div class="tiny dim" style="margin-top:4px">무시하거나 패배해도 보유 매물에는 피해가 없습니다 · 승리 시 30분 호황</div>
  </div>`;
}

/* ══════════════════ 🗺️ 전국 권역 지도 · 🧭 펫 영지 파견 (v5.9.0 · v8.0.0 실제 한반도형) ══════════════════
 * v8.0.0 B4: 손으로 찍은 5~6각형(가로 320×246)을 버리고 **남한 실제 비율(세로형)** 7권역으로 교체.
 *  - viewBox 340×400 · 6개 권역 폴리곤이 빈틈없이 맞물린다(겹침 0).
 *  - 서울은 폴리곤이 아니라 **경기 밖 콜아웃 배지**로 분리 → 경기·인천 글자와 절대 겹치지 않는다.
 *  - 모든 권역에 `보유/전체` + 완주 ★ 를 11.5~12px 로 표시(카드 폭 342px 기준 화면 11px 이상).
 */
const REGION_MAP_SHAPES = {
  gyeonggi:    { pts: '75,30 110,24 150,18 168,40 172,80 158,104 120,112 86,104 58,92 78,66', lx: 116, ly: 70 },
  gangwon:     { pts: '150,18 190,14 232,10 272,8 300,6 310,40 300,75 312,110 300,150 280,160 250,150 215,140 185,120 158,104 172,80 168,40', lx: 240, ly: 86 },
  chungcheong: { pts: '58,92 86,104 120,112 158,104 185,120 200,145 165,170 155,205 120,190 85,180 66,168 52,140 68,118', lx: 120, ly: 152 },
  gyeongsang:  { pts: '185,120 215,140 250,150 280,160 300,150 290,185 300,215 288,248 268,262 240,272 215,266 195,278 170,268 160,240 155,205 165,170 200,145', lx: 226, ly: 203 },
  jeolla:      { pts: '66,168 85,180 120,190 155,205 160,240 170,268 148,282 128,272 105,282 80,272 58,282 40,262 48,240 62,215 50,190', lx: 104, ly: 226 },
  jeju:        { pts: '80,296 140,294 162,310 138,332 92,330 72,308', lx: 112, ly: 308 },
};
/** 서울권 — 경기 폴리곤 위가 아니라 왼쪽 여백의 콜아웃 배지 + 지시선 */
const SEOUL_CALLOUT = { x: 2, y: 44, w: 64, h: 38, cx: 34, toX: 92, toY: 78 };

export function regionMapCard(ui) {
  const now = Date.now();
  const data = regionMapData(ui.s, now);
  const totalHeld = data.reduce((a, r) => a + r.held, 0);
  const totalAll = data.reduce((a, r) => a + r.total, 0);
  const byId = {};
  for (const r of data) byId[r.id] = r;

  const fillOf = (r) => (r.held > 0 ? (0.24 + Math.min(0.58, r.pct * 0.7)).toFixed(2) : '0.12');
  const strokeOf = (r) => (r.hasNews ? '#ffcf5c' : r.complete ? r.color : r.held > 0 ? r.color : 'rgba(255,255,255,0.34)');
  const widthOf = (r) => (r.hasNews ? '2.4' : r.complete ? '2' : '1.2');

  const polys = data
    .map((r) => {
      const sh = REGION_MAP_SHAPES[r.id];
      if (!sh) return '';
      const name = esc(r.name.replace('권', ''));
      const cnt = `${r.held}/${r.total}${r.complete ? ' ★' : ''}`;
      const cntY = sh.one ? 0 : sh.ly + 16;
      return `
      <g class="rmap-poly${r.hasNews ? ' news' : ''}${r.complete ? ' done' : ''}" data-action="land-map-region" data-value="${r.id}" role="button" tabindex="0" aria-label="${name} ${cnt} — ${r.name} 매물 보기">
        <polygon points="${sh.pts}" fill="${r.color}" fill-opacity="${fillOf(r)}" stroke="${strokeOf(r)}" stroke-width="${widthOf(r)}" stroke-linejoin="round"/>
        ${sh.one
          ? `<text class="rmap-lbl" x="${sh.lx}" y="${sh.ly}" text-anchor="middle">${name}</text>
             <text class="rmap-cnt" x="${sh.lx}" y="${sh.ly + 15}" text-anchor="middle">${cnt}</text>`
          : `<text class="rmap-lbl" x="${sh.lx}" y="${sh.ly}" text-anchor="middle">${name}</text>
             <text class="rmap-cnt" x="${sh.lx}" y="${cntY}" text-anchor="middle">${cnt}</text>`}
      </g>`;
    })
    .join('');

  // 서울 콜아웃 배지 — 폴리곤과 분리해 글자 겹침을 구조적으로 없앤다
  const se = byId.seoul || { held: 0, total: 1, complete: false, hasNews: false, color: '#69c0ff' };
  const seCnt = `${se.held}/${se.total}${se.complete ? ' ★' : ''}`;
  const seoul = `
    <g class="rmap-poly rmap-seoul${se.hasNews ? ' news' : ''}" data-action="land-map-region" data-value="seoul" role="button" tabindex="0" aria-label="서울 ${seCnt} — 서울권 매물 보기">
      <line x1="${SEOUL_CALLOUT.x + SEOUL_CALLOUT.w}" y1="${SEOUL_CALLOUT.y + 18}" x2="${SEOUL_CALLOUT.toX}" y2="${SEOUL_CALLOUT.toY}" stroke="${se.color}" stroke-width="1" stroke-dasharray="3 3" opacity="0.75"/>
      <circle cx="${SEOUL_CALLOUT.toX}" cy="${SEOUL_CALLOUT.toY}" r="2.4" fill="${se.color}"/>
      <rect x="${SEOUL_CALLOUT.x}" y="${SEOUL_CALLOUT.y}" width="${SEOUL_CALLOUT.w}" height="${SEOUL_CALLOUT.h}" rx="9" fill="${se.color}" fill-opacity="${se.held > 0 ? '0.2' : '0.08'}" stroke="${se.color}" stroke-width="${se.held > 0 ? '1.6' : '1.1'}"/>
      <text class="rmap-lbl" x="${SEOUL_CALLOUT.cx}" y="${SEOUL_CALLOUT.y + 17}" text-anchor="middle">서울</text>
      <text class="rmap-cnt" x="${SEOUL_CALLOUT.cx}" y="${SEOUL_CALLOUT.y + 31}" text-anchor="middle">${seCnt}</text>
    </g>`;

  return `
  <div class="card map-card" id="regionMapCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🗺️</span>전국 영지 지도<small>7권역 · ${totalHeld}/${totalAll}곳 보유</small></div>
      <span class="tiny dim">권역 탭 → 바로 투자</span>
    </div>
    <div class="rmap-wrap">
      <svg class="rmap-svg" viewBox="0 0 340 340" aria-label="대한민국 7권역 영지 지도">${polys}${seoul}</svg>
    </div>
    ${(() => {
      const built = MEGA_PROJECTS.filter((p) => (ui.s && ui.s.mega && ui.s.mega[p.id] > 0));
      return built.length
        ? `<div class="inv-booms" style="margin:6px 0 2px">${built.map((p) => `<span class="tag lm">${p.icon} ${esc(p.name)} Lv.${ui.s.mega[p.id]}</span>`).join('')}</div>`
        : '';
    })()}
  </div>`;
}

export function expeditionCard(ui) {
  const s = ui.s;
  const now = Date.now();
  const st = expeditionStatus(s, now);
  const pick = ui.expPick || { petId: '', setId: '', durKey: 'short' };
  const availPets = st.availablePets;
  const ownedRegs = st.ownedRegions;
  const selPet = availPets.find((p) => p.id === pick.petId) || availPets[0] || null;
  const selReg = ownedRegs.find((r) => r.id === pick.setId) || ownedRegs[0] || null;
  const selDur = EXPEDITION_DURATIONS.find((d) => d.key === pick.durKey) || EXPEDITION_DURATIONS[0];
  if (ui.expPick) {
    ui.expPick.petId = selPet ? selPet.id : '';
    ui.expPick.setId = selReg ? selReg.id : '';
    ui.expPick.durKey = selDur.key;
  }

  const slotRows = st.slots.length
    ? st.slots.map((sl) => `
      <div class="exp-slot${sl.ready ? ' ready' : ''}">
        <div class="exp-ico">${sl.pet ? sl.pet.emoji : '🐾'}</div>
        <div class="exp-mid">
          <div class="exp-head">
            <span>${esc(sl.petInfo.name)} → ${sl.region ? `${sl.region.icon} ${esc(sl.region.name)}` : ''} <span class="dim">(${sl.dur.label})</span></span>
            <small data-live="exp-left-${sl.id}">${sl.ready ? '탐험 완료!' : hhmmss(sl.leftMs)}</small>
          </div>
          <div class="prog tiny-prog${sl.ready ? ' gold' : ''}" style="margin-top:4px"><i data-live="exp-prog-${sl.id}" style="width:${Math.round(sl.pct * 100)}%"></i></div>
          <div class="exp-sub">예상 💰${formatGold(sl.preview.gold)} · 💎${sl.preview.shards}${sl.preview.points ? ` · ✨${sl.preview.points}P` : ''} · 🌟대성공 ${Math.round(sl.preview.greatChance * 100)}%</div>
        </div>
        <div class="exp-acts">
          ${sl.ready
            ? `<button class="mini ghost js-todo" type="button" data-action="goto-todo" aria-label="오늘의 할 일로 이동">📋 수령</button>`
            : `<button class="mini ghost" type="button" data-action="exp-cancel" data-value="${sl.id}">철수</button>`}
        </div>
      </div>`).join('')
    : '<div class="tiny dim" style="margin-top:5px">현재 파견 중인 팀이 없습니다. 전투에 나가지 않은 대기 펫을 보유 권역에 보내 보상을 챙기세요!</div>';

  const canSend = st.activeCount < st.maxSlots && selPet && selReg;
  const prev = selPet && selReg ? expeditionPreview(s, selPet.id, selReg.id, selDur.key) : null;
  const form = st.activeCount >= st.maxSlots
    ? '<div class="tiny dim" style="margin-top:7px">최대 파견 팀(3/3)이 모두 탐험 중입니다.</div>'
    : !availPets.length
      ? '<div class="tiny dim" style="margin-top:7px">파견 가능한 대기 펫이 없습니다 (주·보조 동행 외 해금 펫 필요).</div>'
      : !ownedRegs.length
        ? '<div class="tiny dim" style="margin-top:7px">매물을 1곳 이상 매수해야 해당 권역에 파견할 수 있습니다.</div>'
        : `<div class="exp-form">
            <div class="exp-lbl">1) 대기 펫 선택</div>
            <div class="chips">${availPets.map((p) => `<button class="chip${selPet && selPet.id === p.id ? ' on' : ''}" type="button" data-action="exp-pick-pet" data-value="${p.id}">${p.emoji} ${esc(petStageInfo(s, p.id).name)}</button>`).join('')}</div>
            <div class="exp-lbl">2) 파견 권역 선택</div>
            <div class="chips">${ownedRegs.map((r) => `<button class="chip${selReg && selReg.id === r.id ? ' on' : ''}" type="button" data-action="exp-pick-region" data-value="${r.id}">${r.icon} ${esc(r.name)} (${r.held})</button>`).join('')}</div>
            <div class="exp-lbl">3) 파견 기간</div>
            <div class="chips">${EXPEDITION_DURATIONS.map((d) => `<button class="chip${selDur.key === d.key ? ' on' : ''}" type="button" data-action="exp-pick-dur" data-value="${d.key}">${d.label} · ${d.title}</button>`).join('')}</div>
            ${prev ? `<div class="exp-prev">예상 보상: <b>💰${formatGold(prev.gold)}</b> · <b>💎${prev.shards}</b>${prev.points ? ` · <b>✨${prev.points}P</b>` : ''} · 🎒장비 ${Math.round(prev.gearChance * 100)}%<br><span class="dim">권역 특화 ${prev.bonusLabel} · 펫/랜드마크 전력 ×${prev.powerMul.toFixed(2)} · 🌟대성공 ${Math.round(prev.greatChance * 100)}% (×1.6)</span></div>` : ''}
            <button class="btn small green block" type="button" data-action="exp-start" ${canSend ? '' : 'disabled'}>🧭 ${selPet.emoji} ${esc(petStageInfo(s, selPet.id).name)} → ${esc(selReg.name)} (${selDur.label}) 출발</button>
          </div>`;

  return `
  <div class="card exp-card${st.readyCount ? ' ready' : ''}" id="expeditionCard" data-fold="expedition">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🧭</span>영지 파견 (탐험대)<small>${st.activeCount}/${st.maxSlots}팀 · 완료 ${st.totals.completed}회</small></div>
      ${st.readyCount > 0
        ? `<button class="mini up" type="button" data-action="goto-todo">📋 ${st.readyCount}팀 수령</button>`
        : `<span class="tiny dim">대성공 ${st.totals.greatCount}회</span>`}
    </div>
    <div class="exp-slots">${slotRows}</div>
    ${form}
  </div>`;
}

/* ══════════════════ 📈 투자 대시보드 · 🎯 지정가 예약 매매 (v6.0.0) ══════════════════ */
function assetChartSvg(series) {
  const pts = Array.isArray(series) && series.length ? series : [{ t: 0, v: 0 }];
  const w = 300;
  const h = 72;
  const pad = 6;
  const vals = pts.map((p) => p.v);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = Math.max(1, maxV - minV);
  const coords = pts.map((p, i) => {
    const x = pts.length === 1 ? w / 2 : pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.v - minV) / span) * (h - pad * 2);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  });
  const line = coords.length === 1
    ? `${pad},${coords[0][1]} ${w - pad},${coords[0][1]}`
    : coords.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `${coords[0][0]},${h - pad} ${line} ${coords[coords.length - 1][0]},${h - pad}`;
  const last = coords[coords.length - 1];
  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="총자산 추이 그래프">
    <defs><linearGradient id="ag60" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#69c0ff" stop-opacity="0.38"/><stop offset="100%" stop-color="#69c0ff" stop-opacity="0.02"/></linearGradient></defs>
    <polygon points="${area}" fill="url(#ag60)"/>
    <polyline points="${line}" fill="none" stroke="#69c0ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="#ffcf5c"/>
  </svg>`;
}

export function investDashboardCard(ui) {
  const rep = investmentReport(ui.s, Date.now());
  const pnlSign = rep.unrealizedPnl >= 0 ? '+' : '';
  const pnlCls = rep.unrealizedPnl >= 0 ? 'up' : 'dn';
  const topRows = rep.topHoldings.length
    ? rep.topHoldings.map((h) => `<div class="kv"><span class="k">${h.city.emoji} ${esc(h.city.name)} (${fmt(h.qty)}평)</span><span class="v"><span class="pnl ${h.profitPct >= 0 ? 'up' : 'dn'}">${h.profitPct >= 0 ? '+' : ''}${h.profitPct.toFixed(1)}%</span> · 💰${formatGold(h.value)}</span></div>`).join('')
    : '<div class="tiny dim" style="margin-top:5px">매물을 매수하면 보유 수익률 상위 지역이 표시됩니다.</div>';
  return `
  <div class="card invdash-card" id="investDashboardCard" data-fold="invest-dash">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">📈</span>투자 대시보드<small>자산 추이 · 수익 분석</small></div>
      <span class="tiny" style="color:${rep.deltaAsset >= 0 ? 'var(--green)' : '#ff8a8a'}">${rep.deltaAsset >= 0 ? '▲' : '▼'}${Math.abs(rep.deltaPct).toFixed(1)}%</span>
    </div>
    <div class="chart-wrap">
      ${assetChartSvg(rep.series)}
      <div class="row tiny dim" style="margin-top:3px"><span>최근 기록 ${rep.series.length}개 (5분 주기)</span><span>현재 💰${formatGold(rep.totalAsset)}</span></div>
    </div>
    <div class="stat-grid" style="margin-top:8px">
      <div class="stat gold"><div class="k">평가 손익</div><div class="v"><span class="pnl ${pnlCls}">${pnlSign}${rep.unrealizedPct.toFixed(1)}%</span> <small>${pnlSign}${formatGold(rep.unrealizedPnl)}</small></div></div>
      <div class="stat"><div class="k">보유 현금 / 부동산</div><div class="v">${formatGold(rep.cash)} <small>/ ${formatGold(rep.landValue)}</small></div></div>
    </div>
    <div class="split-bar" aria-label="사냥 대 임대 수익 비율"><span class="sb-hunt" style="width:${rep.huntPct}%"></span><span class="sb-rent" style="width:${rep.rentPct}%"></span></div>
    <div class="split-leg"><span>⚔️ 사냥 누적 💰${formatGold(rep.huntGold)} (${rep.huntPct}%)</span><span>🏢 임대 누적 💰${formatGold(rep.rentGold)} (${rep.rentPct}%)</span></div>
    ${topRows}
  </div>`;
}

export function limitOrdersCard(ui) {
  const rep = investmentReport(ui.s, Date.now());
  const rows = rep.orders.length
    ? rep.orders.map((o) => {
      const diffTxt = o.diffPct === 0 ? '현재가 도달' : `${o.diffPct > 0 ? '+' : ''}${o.diffPct.toFixed(1)}%`;
      return `
      <div class="ord-row">
        <span class="ord-side ${o.side}">${o.side === 'buy' ? '매수' : '매도'}</span>
        <div class="ord-mid">
          <div class="ord-t">${o.city.emoji} ${esc(o.city.name)} · <b>${fmt(o.qty)}평</b></div>
          <div class="ord-s">목표 💰${fmt(o.targetPrice)}/평 (현재 💰${fmt(o.curPrice)} · ${diffTxt})</div>
        </div>
        <button class="mini ghost" type="button" data-action="land-order-cancel" data-value="${o.id}">취소</button>
      </div>`;
    }).join('')
    : '<div class="tiny dim" style="margin-top:4px">등록된 지정가 예약이 없습니다. 보유 매물·매물 투자 목록의 <b>🎯 예약</b> 버튼으로 자동 매매를 걸어 두세요!</div>';
  const logs = rep.orderLog.length
    ? `<div class="tiny dim" style="margin-top:7px">최근 체결: ${rep.orderLog.slice(0, 2).map((l) => `${esc(l.cityName)} ${l.side === 'buy' ? '매수' : '매도'} ${fmt(l.qty)}평 (💰${formatGold(l.total)})`).join(' · ')}</div>`
    : '';
  return `
  <div class="card ord-card" id="limitOrdersCard" data-fold="orders">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🎯</span>지정가 예약 매매<small>${rep.orders.length}/${LIMIT_ORDER_MAX}건 · 자동 체결</small></div>
      <span class="tiny dim">접속 중 실시간 감시</span>
    </div>
    <div class="ord-list">${rows}</div>
    ${logs}
  </div>`;
}

/* ══════════════════ 🏰 영지 성채 (영구 시설 5종 · v5.12.0) ══════════════════ */
export function citadelCard(ui) {
  const s = ui.s;
  const eff = citadelEffects(s);
  const rows = CITADEL_FACILITIES.map((f) => {
    const q = citadelUpgradeQuote(s, f.id);
    const lv = q.lv || 0;
    const costTxt = q.max
      ? '최종 증축 완료'
      : `💰${formatGold(q.cost.gold)} · 💎${fmt(q.cost.shards)}${q.cost.points ? ` · ✨${q.cost.points}P` : ''}`;
    return `
    <div class="cit-row${q.can ? ' ready' : ''}">
      <div class="cit-ico" style="--cc:${f.color}">${f.icon}</div>
      <div class="cit-mid">
        <div class="cit-name">${esc(f.name)}<span class="lv">Lv.${lv}/${CITADEL_MAX_LV}</span></div>
        <div class="cit-fx">${lv > 0 ? esc(f.effect(lv)) : esc(f.desc)}</div>
        <div class="cit-cost">${q.max ? '<span style="color:var(--gold)">MAX</span>' : `다음 Lv.${lv + 1}: ${costTxt}`}</div>
      </div>
      <div class="cit-act">
        ${q.max
          ? '<button class="mini on" type="button" disabled>MAX</button>'
          : `<button class="btn small ${q.can ? 'primary' : 'ghost'}" type="button" data-action="citadel-up" data-value="${f.id}" ${q.can ? '' : 'disabled'}>${lv > 0 ? '증축' : '건설'}</button>`}
      </div>
    </div>`;
  }).join('');
  return `
  <div class="card cit-card" id="citadelCard" data-fold="citadel">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏰</span>영지 성채<small>총 Lv.${eff.totalLv}/${eff.maxTotalLv} · 환생 유지</small></div>
      <span class="tiny dim">영구 시설 5종</span>
    </div>
    <div class="tiny muted">골드·강화석·초월석으로 영지 본부를 증축합니다. 모든 시설은 <b>환생 후에도 영구 유지</b>됩니다.</div>
    <div class="cit-list">${rows}</div>
  </div>`;
}

/* ══════════════════ 🏦 영지 은행 (정기 예금 · v6.8.0) ══════════════════ */
export function bankCard(ui) {
  const s = ui.s;
  const now = Date.now();
  const st = bankStatus(s, now);
  const slotHtml = st.slots.length
    ? st.slots.map((sl) => `
      <div class="bank-row${sl.ready ? ' ready' : ''}">
        <div class="ord-mid">
          <div class="ord-t">🏦 ${esc(sl.plan.title)} (${sl.plan.label} · <b>+${sl.ratePct}%</b>) · 💰${formatGold(sl.principal)}</div>
          <div class="ord-s">${sl.ready ? `만기 도달! 수령액 💰${formatGold(sl.payout)} (+💰${formatGold(sl.interest)}) — 📋 오늘의 할 일에서 수령` : `남은 ${hhmmss(sl.leftMs)} · 예상 이자 +💰${formatGold(sl.interest)}`}</div>
          <div class="prog tiny-prog${sl.ready ? ' gold' : ''}" style="margin-top:3px"><i style="width:${Math.round(sl.pct * 100)}%"></i></div>
        </div>
        ${sl.ready
          ? `<button class="mini ghost js-todo" type="button" data-action="goto-todo" aria-label="오늘의 할 일로 이동">📋 할 일</button>`
          : `<button class="mini ghost" type="button" data-action="bank-cancel" data-value="${sl.id}">해지</button>`}
      </div>`).join('')
    : '<div class="tiny dim" style="margin-top:4px">여유 골드를 정기 예금에 예치해 복리 이자를 받으세요. 중도 해지 시 원금은 100% 반환됩니다.</div>';
  const full = st.slots.length >= st.maxSlots;
  const planBtns = BANK_PLANS.map((p) => {
    const can = !full && (s.gold || 0) >= p.minGold * 2;
    const canMin = !full && (s.gold || 0) >= p.minGold;
    return `<button class="btn small ${canMin ? 'ghost' : 'ghost'} wide" type="button" data-action="bank-open" data-value="${p.key}" ${canMin ? '' : 'disabled'}>${p.label} +${p.ratePct}%<small style="display:block;font-size:9px;opacity:.75">${can ? '골드 50%' : `최소 ${formatGold(p.minGold)}`}</small></button>`;
  }).join('');
  return `
  <div class="card bank-card${st.readyCount ? ' ready' : ''}" id="bankCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏦</span>영지 은행<small>${st.slots.length}/${st.maxSlots}계좌 · 누적 이자 💰${formatGold(st.totalInterest)}</small></div>
      <span class="tiny dim">${st.readyCount ? `🎁 만기 ${st.readyCount}건` : '중도해지 원금보장'}</span>
    </div>
    <div class="ord-list">${slotHtml}</div>
    <div class="row gap6" style="margin-top:8px">${planBtns}</div>
  </div>`;
}

/* ══════════════════ 🏗️ 전국 메가 프로젝트 4종 (v6.8.0) ══════════════════ */
export function megaProjectCard(ui) {
  const s = ui.s;
  const eff = megaEffects(s);
  const rows = MEGA_PROJECTS.map((p) => {
    const q = megaQuote(s, p.id);
    const lv = q.lv || 0;
    const costTxt = q.max
      ? '완공 완료'
      : !q.unlocked
        ? `🔒 보유 지역 ${p.reqCities}곳 달성 시 해금 (현재 ${q.cities}곳)`
        : `다음 Lv.${lv + 1}: 💰${formatGold(q.cost.gold)} · 💎${q.cost.shards}${q.cost.points ? ` · ✨${q.cost.points}P` : ''}`;
    return `
    <div class="cit-row${q.can ? ' ready' : ''}">
      <div class="cit-ico" style="--cc:${p.color}">${p.icon}</div>
      <div class="cit-mid">
        <div class="cit-name">${esc(p.name)}<span class="lv">Lv.${lv}/${MEGA_MAX_LV}</span></div>
        <div class="cit-fx">${lv > 0 ? esc(p.effect(lv)) : esc(p.desc)}</div>
        <div class="cit-cost">${q.max ? '<span style="color:var(--gold)">MAX</span>' : costTxt}</div>
      </div>
      <div class="cit-act">
        ${q.max
          ? '<button class="mini on" type="button" disabled>완공</button>'
          : `<button class="btn small ${q.can ? 'primary' : 'ghost'}" type="button" data-action="mega-build" data-value="${p.id}" ${q.can ? '' : 'disabled'}>${lv > 0 ? '증축' : '착공'}</button>`}
      </div>
    </div>`;
  }).join('');
  return `
  <div class="card mega-card" id="megaProjectCard" data-fold="mega">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏗️</span>전국 메가 프로젝트<small>총 Lv.${eff.totalLv}/${eff.maxTotalLv} · 환생 유지</small></div>
      <span class="tiny dim">국가 인프라 4종</span>
    </div>
    <div class="tiny muted">전국 영지망을 연결하는 초대형 국가 인프라입니다. 완공된 프로젝트는 <b>전국 영지 지도</b>에 표시되며 환생 후에도 유지됩니다.</div>
    <div class="cit-list">${rows}</div>
  </div>`;
}

/* ───────────── 🛒 매물 투자 (전국 229개 시군구) ───────────── */
export function buildMarketList(ui) {
  const s = ui.s;
  const owned = s.land.owned || {};
  const now = Date.now();
  const q = String(s.land.q || '').trim();
  const tier = s.land.tier || 'all';
  const rf = s.land.regionFilter && SETS_BY_ID[s.land.regionFilter] ? s.land.regionFilter : 'all';
  const sort = s.land.sort || 'roi';
  const page = Math.max(1, Math.floor(Number(s.land.page) || 1));

  const rows = [];
  const favSet = new Set(Array.isArray(s.land.favorites) ? s.land.favorites : []);
  const setB = regionSetBuffs(owned);
  for (const c of CITIES) {
    const held = Math.floor(Number(owned[c.key]) || 0);
    if (rf !== 'all' && citySetId(c.key) !== rf) continue;
    if (tier === 'owned') {
      if (held <= 0) continue;
    } else if (tier === 'fav') {
      if (!favSet.has(c.key)) continue;
    } else if (tier !== 'all' && String(c.tier) !== String(tier)) continue;
    if (q && !(c.name.includes(q) || c.region.includes(q) || c.tierLabel.includes(q))) continue;
    const info = priceInfo(c, now);
    const lm = landmarkLevel(s, c.key);
    const setId = citySetId(c.key);
    const setPct = setId ? (setB.rentBySet[setId] || 0) : 0;
    const rentMul = (1 + setPct / 100) * landmarkRentMul(lm) * (1 + leasePctOf(s, c.key) / 100)
      * (info.news ? 1 + info.news.rentPct / 100 : 1);
    const hourlyPerPyeong = c.rentPerMin * 60 * rentMul;
    rows.push({ c, info, held, hourlyPerPyeong, lm, rentMul, payback: hourlyPerPyeong > 0 ? info.price / hourlyPerPyeong : 0 });
  }

  if (sort === 'price') rows.sort((a, b) => a.info.price - b.info.price);
  else if (sort === 'trend') rows.sort((a, b) => b.info.trend - a.info.trend);
  else if (sort === 'name') rows.sort((a, b) => a.c.name.localeCompare(b.c.name, 'ko'));
  else rows.sort((a, b) => a.payback - b.payback || a.info.price - b.info.price);

  const PAGE = 20;
  const shown = rows.slice(0, page * PAGE);
  const gold = s.gold;

  const html = shown.length
    ? shown
        .map(({ c, info, held, hourlyPerPyeong, payback, lm, rentMul }) => {
          const seasonal = info.season ? traitBadge(info.season) : '';
          const remain = Math.max(0, c.supply - held);
          const affordable = gold >= info.price;
          const onePyeongIncome = c.rentPerMin * 60 * (rentMul || 1);
          const newsTag = info.news ? '<span class="tag hot">📈 호재</span>' : '';
          const lmTag = lm > 0 ? `<span class="tag lm">${LANDMARK.levels[lm - 1].icon} Lv.${lm}</span>` : '';
          const lease = leasePctOf(s, c.key);
          const leaseTag = lease > 0 ? `<span class="tag lease">🏷️ 임대 +${lease}%</span>` : '';
          const mulTag = rentMul > 1.001 ? ` · <b class="up">임대 ×${rentMul.toFixed(2)}</b>` : '';
          const fav = favSet.has(c.key);
          const bandPct = Math.round((info.bandPos != null ? info.bandPos : 0.5) * 100);
          return `<div class="mkt${info.news ? ' hot' : ''}" data-action="land-sheet" data-value="${c.key}" role="button" tabindex="0" aria-label="${esc(c.name)} 매수·매도·예약 열기">
            <div class="m-ico">${c.emoji}</div>
            <div class="m-mid">
              <div class="m-name"><button class="fav-btn${fav ? ' on' : ''}" type="button" data-action="land-fav" data-value="${c.key}" aria-label="관심 매물">${fav ? '★' : '☆'}</button>${esc(c.name)}<span class="m-region">${esc(c.region)}</span>${traitBadge(c.trait)}${seasonal}${newsTag}${lmTag}${leaseTag}</div>
              <div class="m-line"><b>💰${fmt(info.price)}</b><span class="dim">/평</span> ${trendHtml(info.trend)} <span class="band-pill ${info.bandLabel === '저점' ? 'lo' : info.bandLabel === '고점' ? 'hi' : ''}">${esc(info.bandLabel || '보통')}</span><span class="band-bar"><i style="left:${bandPct}%"></i></span>${held > 0 ? ` <b class="own">보유 ${fmt(held)}평</b>` : ''}</div>
              <div class="m-line dim">평당 +💰${fmt(onePyeongIncome)}/h · 회수 ${paybackText(c.base / hourlyPerPyeong)} · 잔여 ${fmt(remain)}평${!affordable ? ' · <span style="color:var(--dim)">골드 부족</span>' : ''}${mulTag}</div>
            </div>
            <i class="m-go" aria-hidden="true">⋯</i>
          </div>`;
        })
        .join('') + (shown.length < rows.length
      ? `<button class="btn small ghost block" style="margin-top:10px" data-action="land-more">더 보기 (${shown.length}/${rows.length})</button>`
      : '')
    : `<div class="empty">조건에 맞는 매물이 없습니다.</div>`;

  return { total: rows.length, shown: shown.length, html };
}

export function tplLandMarket(ui) {
  const s = ui.s;
  const tier = s.land.tier || 'all';
  const sort = s.land.sort || 'roi';
  const list = buildMarketList(ui);

  const favCount = Array.isArray(s.land.favorites) ? s.land.favorites.length : 0;
  const chips = [
    ['all', '전체'],
    ['0', '군'],
    ['1', '시'],
    ['2', '구'],
    ['owned', '보유'],
    ['fav', `⭐ 관심${favCount ? ` ${favCount}` : ''}`],
  ]
    .map(([k, l]) => `<button class="chip ${String(tier) === k ? 'on' : ''}" data-action="land-tier" data-value="${k}">${l}</button>`)
    .join('');

  const sorts = [
    ['roi', '회수 빠른순'],
    ['price', '가격 낮은순'],
    ['trend', '급등순'],
    ['name', '이름순'],
  ]
    .map(([k, l]) => `<button class="chip ${sort === k ? 'on' : ''}" data-action="land-sort" data-value="${k}">${l}</button>`)
    .join('');

  return `
  <div class="card mkt-head">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🛒</span>매물 투자<small>전국 ${CITIES.length}개 시군구</small></div>
      <span class="tiny dim">보유 골드 <b class="gold" data-live="gold">${fmt(s.gold)}</b></span>
    </div>
    <div class="srch">
      <span>🔎</span>
      <input id="landSearch" type="text" inputmode="search" autocomplete="off" placeholder="지역·시군구 검색 (예: 강남, 경기권)" value="${esc(s.land.q || '')}">
    </div>
    <div class="chips" style="margin-top:8px">${chips}</div>
    <div class="chips" style="margin-top:5px">${sorts}</div>
    <div class="dash-invest-h" style="margin-top:8px">⚡ 원탭 분산투자 <small class="dim">보유 골드로 바로 · 견적 확인 후 매수</small></div>
    <div class="row gap6" style="margin-top:5px">
      <button class="btn small ghost wide" type="button" data-action="land-auto-invest" data-value="region">🗺️ 권역 채우기</button>
      <button class="btn small ghost wide" type="button" data-action="land-auto-invest" data-value="roi">💰 ROI TOP5</button>
      <button class="btn small ghost wide" type="button" data-action="land-auto-invest" data-value="dip">📉 저점 매수</button>
    </div>
    ${s.land.regionFilter && SETS_BY_ID[s.land.regionFilter]
      ? `<div class="mkt-reg-pill"><span>🗺️ 권역 필터: ${SETS_BY_ID[s.land.regionFilter].icon} <b>${esc(SETS_BY_ID[s.land.regionFilter].name)}</b></span><button class="mini ghost" type="button" data-action="land-region-clear">✕ 전체 보기</button></div>`
      : ''}
    <div class="tiny dim" style="margin-top:8px" id="landCount">${list.total}개 지역 · ${list.shown}개 표시 · 가격은 실시간 변동(±30% 일일 밴드) + 호재 보정</div>
  </div>

  <div class="card" style="padding-top:2px" id="landList">${list.html}</div>

  <div class="note">
    매수·매도는 같은 <b>골드</b>로 바로 됩니다. 거래세 ${(LAND.feeRate * 100).toFixed(1)}%,
    한 지역 지분이 커질수록 평당 수익이 줄어드는 원작 규칙 그대로입니다.
  </div>`;
}
