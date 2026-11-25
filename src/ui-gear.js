// land-rpg / src/ui-gear.js
// v5.0.0 장비 탭 카드 UI 모듈 — 뽑기 · 5부위 슬롯/프리셋 · 보유 인벤토리/자동분해
import { EQUIP, EQUIP_SLOTS, RARITIES, RARITY_INDEX, GACHA, gachaCost } from './data.js';
import {
  GEAR_ITEMS, GEAR_FILTERS, gearIcon, gearList, gearOwned, gearOptionList,
  equippedItem, equippedRarity, gearCollection, gearSlotCounts, dismantleValue,
  dismantleTargets, AUTO_DISMANTLE_MODES, autoDismantleLabel, normalizeAutoMode,
  GEAR_PRESET_NAMES, GEAR_AWAKEN_BONUS_LV, awakenLevel, gearPresetSummary,
  gearSetOf, gearSetStatus, gearSetBonusText,
} from './gear.js';
import { esc, fmt } from './ui-fmt.js';

export const rarityBadge = (id) => {
  const r = RARITIES[RARITY_INDEX[id] || 0];
  return `<span class="rb ${r.id}">${r.name}</span>`;
};

export const rarityName = (id) => (RARITIES[RARITY_INDEX[id] || 0] || RARITIES[0]).name;

const setBadge = (item) => {
  const st = gearSetOf(item);
  return st ? `<span class="gset-tag" style="--sc:${st.color}">${st.icon}${st.name}</span>` : '';
};

const slotUid = (s, slot) => {
  const uid = s.gear && s.gear.equipped ? s.gear.equipped[slot] : null;
  return uid ? Number(uid) : 0;
};

export const optChips = (item, max = 3) => {
  const list = gearOptionList(item);
  if (!list.length) return '<span class="opt dim">고유 옵션 없음</span>';
  return list.slice(0, max).map((o) => `<span class="opt">${esc(o.text)}</span>`).join('');
};

/** ⚔️ 현재 장착 중인 5부위 슬롯 카드 + v4.10 원탭 프리셋 3슬롯 */
export function gearSlotCards(s) {
  const presets = GEAR_PRESET_NAMES.map((m) => {
    const ps = gearPresetSummary(s, m.id);
    return `<div class="gp-slot${ps.active ? ' on' : ''}">
      <button class="gp-apply" type="button" data-action="gear-preset-apply" data-value="${m.id}" ${ps.saved ? '' : 'disabled'}>${m.icon} ${m.name}<small>${ps.saved ? `${ps.owned}/${ps.saved}` : '비어있음'}</small></button>
      <button class="gp-save" type="button" data-action="gear-preset-save" data-value="${m.id}" title="현재 장착을 ${m.name} 프리셋에 저장">💾</button>
    </div>`;
  }).join('');

  const rows = EQUIP_SLOTS.map((slot) => {
    const def = EQUIP[slot];
    const it = equippedItem(s, slot);
    const rid = equippedRarity(s, slot);
    const lv = s.equip[slot];
    const awk = awakenLevel(s, slot);
    const uid = slotUid(s, slot);
    const idAttr = it && uid ? ` data-action="gear-item" data-value="${uid}"` : ' disabled';
    return `
      <button class="gslot${it ? ' on' : ' empty'}" type="button"${idAttr}>
        <span class="gs-ico">${it ? gearIcon(it, 40) : `<b class="gs-none">${def.icon}</b>`}</span>
        <span class="gs-mid">
          <span class="gs-name">${it ? esc(it.name) : `${def.name} 없음`}${rarityBadge(rid)}${it ? setBadge(it) : ''}${awk > 0 ? `<span class="awk-badge">🔥★${awk}</span>` : ''}</span>
          <span class="gs-sub">${def.icon} ${def.name} <b class="lv">+${lv}</b>${awk > 0 ? ` · 각성 +${awk * GEAR_AWAKEN_BONUS_LV}강` : ''}${it ? '' : ' · 뽑기·사냥으로 획득'}</span>
          <span class="gs-opts">${it ? optChips(it, 2) : '<span class="opt dim">장착하면 고유 옵션이 붙습니다</span>'}</span>
        </span>
      </button>`;
  }).join('');

  // v5.2.0: 테마 세트 효과 요약 스트립
  const sets = gearSetStatus(s);
  const activeSets = sets.filter((st) => st.active);
  const setPills = sets
    .filter((st) => st.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((st) => `<span class="gset-pill${st.active ? ' on' : ''}" style="--sc:${st.color}">
      <b>${st.icon} ${st.name} ${st.count}세트</b>
      <small>${st.active ? esc(gearSetBonusText(st.mods)) : `다음 ${st.nextTier.need}세트: ${esc(gearSetBonusText(st.nextTier.opts))}`}</small>
    </span>`)
    .join('');
  const setBar = `<div class="gset-bar">
    <div class="gset-head"><span>🛡️ 테마 세트 효과</span><small class="dim">${activeSets.length ? `${activeSets.map((x) => `${x.icon}${x.name} ${x.activeTier}세트`).join(' · ')} 발동` : '같은 테마 2부위 이상 장착 시 발동'}</small></div>
    ${setPills ? `<div class="gset-list">${setPills}</div>` : ''}
  </div>`;

  return `
  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">⚔️</span>장착 중 <small>5부위</small></div>
      <span class="tiny dim">프리셋 1탭 전환 · 장비 눌러 비교</span>
    </div>
    <div class="gear-presets">${presets}</div>
    ${setBar}
    <div class="gear-slots">${rows}</div>
  </div>`;
}

/** 🎒 보유 장비 인벤토리 — 자동분해 기준 · 필터 · 그리드 · 일괄 분해 */
export function gearInventory(s) {
  const g = s.gear || {};
  const filter = GEAR_FILTERS.includes(g.filter) ? g.filter : 'all';
  const owned = gearOwned(s);
  const list = gearList(s, filter);
  const col = gearCollection(s);
  const counts = gearSlotCounts(s);
  const lowTargets = dismantleTargets(s, 'low');
  const commonTargets = dismantleTargets(s, 'common');
  const autoMode = normalizeAutoMode(g.autoDismantle);
  const autoTargets = dismantleTargets(s, 'threshold');
  const autoStat = g.auto && typeof g.auto === 'object' ? g.auto : { count: 0, shards: 0 };
  const shardsOf = (rows) => rows.reduce((a, r) => a + dismantleValue(r.def), 0);

  const filterChips = GEAR_FILTERS.map((f) => {
    const label = f === 'all' ? '전체' : EQUIP[f].name;
    const n = f === 'all' ? owned.length : owned.filter((r) => r.def.slot === f).length;
    return `<button class="chip${f === filter ? ' on' : ''}" type="button" data-action="gear-filter" data-value="${f}" aria-pressed="${f === filter}">${label} ${n}</button>`;
  }).join('');

  const autoChips = AUTO_DISMANTLE_MODES.map((m) =>
    `<button class="chip ga${autoMode === m.id ? ' on' : ''}" type="button" data-action="gear-auto" data-value="${m.id}" aria-pressed="${autoMode === m.id}">${m.label}</button>`,
  ).join('');
  const autoBox = `
    <div class="gear-auto${autoMode === 'off' ? ' off' : ''}">
      <div class="ga-head">
        <span class="ga-title">♻️ 자동분해 <b>${esc(autoDismantleLabel(s))}</b></span>
        <span class="tiny dim" data-live="auto-dust">${autoStat.count ? `누적 ${fmt(autoStat.count)}개 · 💎${fmt(autoStat.shards)}` : '기준 이하 장비 → 즉시 강화석'}</span>
      </div>
      <div class="chips ga-chips">${autoChips}</div>
      <div class="tiny dim ga-note">${autoMode === 'off'
        ? '끔 — 새 장비는 모두 인벤토리에 보관됩니다.'
        : `사냥·보스·뽑기에서 <b>${esc(autoDismantleLabel(s))}</b> 장비가 나오면 바로 💎로 바뀝니다. <span class="dim">장착 중·자동 장착되는 장비는 제외</span>`}</div>
    </div>`;

  const cards = list.length
    ? list.map((row) => `
      <button class="inv-card${row.equipped ? ' on' : ''}" type="button" data-action="gear-item" data-value="${row.uid}">
        <span class="iv-top">
          <span class="iv-ico">${gearIcon(row.def, 38)}</span>
          <span class="iv-tag">${row.equipped ? '<i class="iv-eq">장착중</i>' : rarityBadge(row.def.rarity)}</span>
        </span>
        <span class="iv-name">${esc(row.def.name)}</span>
        <span class="iv-rar">${rarityBadge(row.def.rarity)}${setBadge(row.def)}<b class="iv-slot">${EQUIP[row.def.slot].icon}${EQUIP[row.def.slot].name}</b></span>
        <span class="iv-opts">${optChips(row.def, 2)}</span>
      </button>`).join('')
    : `<div class="inv-empty">
        <b>${filter === 'all' ? '아직 보유한 장비가 없습니다' : `${EQUIP[filter].name} 장비가 없습니다`}</b>
        <span>🎁 뽑기 · 몬스터 처치 · 보스 처치로 장비를 모아 보세요.<br>장착보다 낮은 등급이나 중복은 자동으로 강화석이 됩니다.</span>
      </div>`;

  const bulkLow = lowTargets.length
    ? `<button class="chip danger" type="button" data-action="gear-bulk" data-value="low">낮은 등급 일괄 분해 ${lowTargets.length}개 · 💎${fmt(shardsOf(lowTargets))}</button>`
    : '';
  const bulkCommon = commonTargets.length
    ? `<button class="chip" type="button" data-action="gear-bulk" data-value="common">일반 등급 일괄 분해 ${commonTargets.length}개 · 💎${fmt(shardsOf(commonTargets))}</button>`
    : '';
  const bulkAuto = autoMode !== 'off' && autoTargets.length
    ? `<button class="chip danger" type="button" data-action="gear-bulk" data-value="threshold">♻️ ${esc(autoDismantleLabel(s))} 일괄 분해 ${autoTargets.length}개 · 💎${fmt(shardsOf(autoTargets))}</button>`
    : '';

  return `
  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🎒</span>보유 장비 <small>${owned.length}/${GEAR_ITEMS.length}종</small></div>
      <span class="tiny dim">도감 ${col.seen}/${col.total}종</span>
    </div>
    ${autoBox}
    <div class="chips gear-filters">${filterChips}</div>
    <div class="inv-grid">${cards}</div>
    ${(bulkAuto || bulkLow || bulkCommon)
      ? `<div class="gear-tools">${bulkAuto}${bulkLow}${bulkCommon}</div>`
      : '<div class="tiny dim" style="margin-top:8px">분해할 장비가 없습니다 — 장착보다 낮은 등급이 모이면 일괄 분해 버튼이 생깁니다.</div>'}
    <div class="note" style="margin-top:9px">
      카드를 누르면 <b>지금 장착한 장비와 옵션을 나란히 비교</b>하고 그 자리에서 <b>장착</b>하거나 <b>강화석으로 분해</b>할 수 있습니다.
      강화 레벨은 <b>부위</b>에 남으므로 새 장비로 갈아껴도 강화 수치가 사라지지 않습니다.
      ${EQUIP_SLOTS.map((slot) => `${EQUIP[slot].icon}${EQUIP[slot].name} ${counts[slot].have}/${counts[slot].total}`).join(' · ')}
    </div>
  </div>`;
}

export function gachaCard(ui) {
  const s = ui.s;
  const g = s.gacha || { pity: 0, total: 0, best: 'common', cur: 'gold' };
  const cur = g.cur === 'shards' ? 'shards' : 'gold';
  const unit = cur === 'shards' ? '💎' : '💰';
  const c1 = gachaCost(cur, 1);
  const c10 = gachaCost(cur, 10);
  const can1 = (s[cur] || 0) >= c1.amount;
  const can10 = (s[cur] || 0) >= c10.amount;
  const pity = Math.max(0, Math.min(GACHA.pityLegend - 1, Math.floor(g.pity || 0)));
  const left = GACHA.pityLegend - pity;
  const col = gearCollection(s);

  const rates = RARITIES.map(
    (r) => `<span class="rate-chip"><span class="rb ${r.id}">${r.name}</span><b>${r.weight}%</b></span>`,
  ).join('');

  return `
  <div class="card gacha-card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🎁</span>장비 뽑기 <small>일반 → 전설 · ${col.total}종</small></div>
      <span class="tiny dim">최고 <b style="color:var(--gold)">${rarityName(g.best)}</b></span>
    </div>
    <div class="rates">${rates}</div>
    <div class="row" style="margin-top:8px">
      <span class="tiny muted">천장까지 <b style="color:var(--gold)">${left}회</b> <span class="dim">· ${GACHA.pityLegend}회 내 전설 확정</span></span>
      <span class="tiny dim">누적 ${fmt(g.total)}회 · 수집 ${col.seen}/${col.total}</span>
    </div>
    <div class="prog" style="margin-top:5px"><i style="width:${(pity / GACHA.pityLegend) * 100}%"></i></div>
    <div class="row gap8" style="margin-top:9px">
      <div class="chips grow" style="margin:0">
        <button class="chip ${cur === 'gold' ? 'on' : ''}" data-action="gacha-cur" data-value="gold">💰 골드</button>
        <button class="chip ${cur === 'shards' ? 'on' : ''}" data-action="gacha-cur" data-value="shards">💎 강화석</button>
      </div>
      <span class="tiny dim">보유 ${unit}<b style="color:var(--txt)" data-live="${cur}">${fmt(s[cur])}</b></span>
    </div>
    <div class="gacha-btns">
      <button class="btn gacha-btn" data-action="gacha" data-value="1" ${can1 ? '' : 'disabled'}>
        🎁 1회<small>${unit}${fmt(c1.amount)}</small>
      </button>
      <button class="btn gacha-btn ten" data-action="gacha" data-value="10" ${can10 ? '' : 'disabled'}>
        🎉 10회 연속<small>${unit}${fmt(c10.amount)} · 레어+ 보장</small>
      </button>
    </div>
    <div class="note" style="margin-top:9px">
      같은 등급 안에서도 <b>이름·모양·고유 옵션이 다른 ${col.total}종</b>이 나옵니다.
      등급이 더 높으면 <b>자동 장착</b>, 같은 등급은 <b>인벤토리에 보관</b>(직접 비교·장착), 중복은 <b>강화석으로 자동 분해</b>됩니다.
      검기 색과 오라는 장착한 <b>무기 종류</b>를 따라갑니다.
    </div>
  </div>`;
}
