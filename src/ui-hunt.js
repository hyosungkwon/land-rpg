// land-rpg / src/ui-hunt.js
// v7.0.0 사냥/성장 메타 카드 UI 분리 모듈 — 고대 유물 · 무한 균열 · 영지 기사단/거대 레이드 · 성장 패스 · 칭호 20종
import { formatGold } from './land.js';
import { RELICS, RELIC_BY_ID, RELIC_SLOTS, RELIC_MAX_LV, RELIC_SUMMON_COST, relicLevel } from './relics.js';
import { passInfo, titleStatus } from './pass.js';
import { riftStatus, RIFT_CARD_BY_ID } from './rift.js';
import { KNIGHTS, knightLevel, knightCost, guildEffects, raidStatus } from './guild.js';
import { computeCpBreakdown, recommendGrowth } from './guide.js';
import { seasonChallengeStatus } from './season.js';
import { esc, fmt, mmss } from './ui-fmt.js';

/* ───────────── 🏺 고대 유물(아티팩트 12종 · v6.1.0) ───────────── */
export function relicCard(ui) {
  const s = ui.s;
  const rs = s.relics || { owned: {}, frags: {}, equipped: [], summons: 0 };
  const eq = Array.isArray(rs.equipped) ? rs.equipped : [];
  const ownedCount = Object.keys(rs.owned || {}).length;
  const medals = Math.max(0, Math.floor(Number(s.invasion && s.invasion.medals) || 0));
  const pts = Math.max(0, Math.floor(Number(s.rebirth && s.rebirth.points) || 0));

  const slots = Array.from({ length: RELIC_SLOTS }, (_, i) => {
    const id = eq[i];
    const def = id && RELIC_BY_ID[id];
    const lv = def ? relicLevel(s, id) : 0;
    if (!def) return `<div class="r-slot"><span class="ri">➕</span><span>빈 슬롯 ${i + 1}</span></div>`;
    return `<div class="r-slot on" style="--rc:${def.color}"><span class="ri">${def.icon}</span><b>${esc(def.name)} Lv.${lv}</b><span>${esc(def.effect(lv))}</span></div>`;
  }).join('');

  const items = RELICS.map((def) => {
    const lv = relicLevel(s, def.id);
    const have = lv >= 1;
    const on = eq.includes(def.id);
    const frags = Math.max(0, Math.floor(Number(rs.frags && rs.frags[def.id]) || 0));
    const canUp = have && lv < RELIC_MAX_LV && (frags >= lv || pts >= lv * 4);
    const upLbl = lv >= RELIC_MAX_LV ? 'MAX' : frags >= lv ? `강화 (파편 ${frags}/${lv})` : `강화 (✨${lv * 4}P)`;
    return `
    <div class="r-item${on ? ' on' : ''}${have ? '' : ' lock'}" style="--rc:${def.color}">
      <div class="r-head"><span>${def.icon} ${esc(def.name)}</span><span class="lv">${have ? `Lv.${lv}` : '미보유'}</span></div>
      <div class="r-fx">${have ? esc(def.effect(lv)) : esc(def.desc)}</div>
      ${have ? `<div class="r-acts">
        <button class="mini ${on ? 'on' : 'equip'}" type="button" data-action="relic-equip" data-value="${def.id}">${on ? '해제' : '장착'}</button>
        <button class="mini ${canUp ? 'up' : ''}" type="button" data-action="relic-upgrade" data-value="${def.id}" ${canUp ? '' : 'disabled'}>${upLbl}</button>
      </div>` : ''}
    </div>`;
  }).join('');

  return `
  <div class="card relic-card" id="relicCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏺</span>고대 유물<small>${ownedCount}/${RELICS.length} 수집 · 장착 ${eq.length}/${RELIC_SLOTS}</small></div>
      <span class="tiny dim">🏅훈장 ${medals} · ✨${pts}P</span>
    </div>
    <div class="relic-slots">${slots}</div>
    <div class="row gap6" style="margin-top:8px">
      <button class="btn small ${medals >= 1 ? 'primary' : 'ghost'} wide" type="button" data-action="relic-summon" data-value="medal" ${medals >= 1 ? '' : 'disabled'}>🏺 감정 (${RELIC_SUMMON_COST.medal.label})</button>
      <button class="btn small ${pts >= 6 && s.gold >= 50000 ? 'blue' : 'ghost'} wide" type="button" data-action="relic-summon" data-value="points" ${pts >= 6 && s.gold >= 50000 ? '' : 'disabled'}>${RELIC_SUMMON_COST.points.label}</button>
      <button class="btn small ghost wide" type="button" data-action="relic-summon" data-value="shards" ${s.shards >= 120 && s.gold >= 50000 ? '' : 'disabled'}>${RELIC_SUMMON_COST.shards.label}</button>
    </div>
    <div class="relic-grid">${items}</div>
  </div>`;
}

/* ───────────── 🌀 무한 균열 로그라이크 웨이브 (v6.7.0) ───────────── */
export function riftCard(ui) {
  const s = ui.s;
  const b = ui.battle;
  const now = Date.now();
  const st = riftStatus(s, now);
  const live = b && b.rift;
  const busy = !!(b && (b.rift || b.invasion || b.tower || b.dungeon || b.daily || b.boss));
  const pickedTags = live && live.cards && live.cards.length
    ? `<div class="rift-tags">${live.cards.map((id) => {
      const c = RIFT_CARD_BY_ID[id];
      return c ? `<span class="tag" style="border-color:${c.color}66;color:${c.color}">${c.icon} ${esc(c.name)}</span>` : '';
    }).join('')}</div>`
    : '';
  const bodyBtn = live
    ? `<div class="row gap6" style="margin-top:7px">
        ${live.picking ? '<button class="btn small primary wide" type="button" data-action="rift-pick-open">🃏 축복 카드 선택</button>' : ''}
        <button class="btn small ghost wide" type="button" data-action="rift-retreat">🚪 정산 귀환 (W${live.wavesCleared} 보상)</button>
      </div>`
    : `<button class="btn small ${st.ready && !busy ? 'primary' : 'ghost'} block" style="margin-top:7px" type="button" data-action="rift-start" ${!st.ready || busy ? 'disabled' : ''}>
        ${st.ready ? '🌀 무한 균열 입장 (무료)' : `⏱ 재입장 대기 (${mmss(st.leftMs)})`}
      </button>`;
  return `
  <div class="card rift-card${live ? ' live' : ''}" id="riftCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🌀</span>무한 균열<small>로그라이크 · 최고 W${st.bestWave}</small></div>
      <span class="tiny" style="color:${live ? 'var(--gold)' : st.ready ? 'var(--green)' : 'var(--dim)'}">${live ? `W${live.wave} 진행 중` : st.ready ? '입장 가능' : mmss(st.leftMs)}</span>
    </div>
    <div class="tiny muted">${
      live
        ? `현재 <b style="color:var(--gold)">웨이브 ${live.wave}</b> (${live.waveKills}/${live.waveGoal}) · 클리어 ${live.wavesCleared}W · 축복 ${live.cards.length}장`
        : `3웨이브마다 <b>3택 1 축복 카드</b>를 조합해 한계까지 돌파! W6+ 💠보석 · W9+ 🏅훈장 · 3W마다 ✨초월석 지급`
    }</div>
    ${pickedTags}
    ${bodyBtn}
  </div>`;
}

/* ───────────── 🛡️ 영지 기사단 · 🐉 주간 거대 레이드 토벌전 (v6.9.0) ───────────── */
export function guildRaidCard(ui) {
  const s = ui.s;
  const eff = guildEffects(s);
  const st = raidStatus(s, ui.battle && ui.battle.stats, Date.now());
  const medals = Math.max(0, Math.floor(Number(s.invasion && s.invasion.medals) || 0));

  const phaseBtns = st.phases.map((ph) => `
    <div class="rp-chip${ph.claimed ? ' done' : ph.claimable ? ' ready' : ''}">
      <div>${ph.pct}%</div>
      <small>${ph.claimed ? '수령✓' : ph.claimable ? '🎁 대기' : ph.legend ? '👑전설' : ph.medals ? '🏅훈장' : ph.points ? `✨${ph.points}P` : `💎${ph.shards}`}</small>
    </div>`).join('');

  const knCells = KNIGHTS.map((k) => {
    const lv = knightLevel(s, k.id);
    const cost = knightCost(lv);
    const can = !!(cost && (s.gold || 0) >= cost.gold && (s.shards || 0) >= cost.shards && medals >= cost.medals);
    return `
    <div class="kn-cell${lv > 0 ? ' on' : ''}" style="--kc:${k.color}">
      <div class="r-head"><span>${k.icon} ${esc(k.name)}</span><span class="lv">${lv > 0 ? `Lv.${lv}` : '미영입'}</span></div>
      <div class="r-fx">${lv > 0 ? esc(k.effect(lv)) : esc(k.desc)}</div>
      ${cost
        ? `<button class="mini ${can ? 'up' : ''}" type="button" data-action="knight-up" data-value="${k.id}" ${can ? '' : 'disabled'}>${lv > 0 ? '강화' : '영입'} 💰${formatGold(cost.gold)} 💎${cost.shards}${cost.medals ? ` 🏅${cost.medals}` : ''}</button>`
        : '<button class="mini on" type="button" disabled>MAX</button>'}
    </div>`;
  }).join('');

  return `
  <div class="card guild-card" id="guildRaidCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🛡️</span>영지 기사단 · 거대 레이드<small>용병 ${eff.recruited}/${KNIGHTS.length} · 토벌 ${st.clears}회</small></div>
      <span class="tiny dim">합동 ×${eff.raidBonusMul.toFixed(2)}</span>
    </div>
    <div class="raid-box">
      <div class="row">
        <span style="font-size:12px;font-weight:900;color:${st.boss.color}">${st.boss.icon} ${esc(st.boss.name)} <small class="dim">(${esc(st.boss.title)})</small></span>
        <span class="tiny" style="color:var(--gold)">${st.pct.toFixed(1)}% 격파</span>
      </div>
      <div class="prog tiny-prog${st.defeated ? ' gold' : ''}" style="margin-top:5px"><i style="width:${st.pct}%"></i></div>
      <div class="row tiny dim" style="margin-top:4px">
        <span>누적 피해 ${fmt(st.damage)} / ${fmt(st.maxHp)}</span>
        <span>오늘 출격 <b>${st.leftTickets}/${st.maxTickets}</b></span>
      </div>
      <button class="btn small ${!st.defeated && st.leftTickets > 0 ? 'primary' : 'ghost'} block" style="margin-top:7px" type="button" data-action="raid-attack" ${st.defeated || st.leftTickets <= 0 ? 'disabled' : ''}>
        ${st.defeated ? '🏆 이번 주 거대 보스 완전 토벌!' : st.leftTickets > 0 ? `⚔️ 기사단 합동 일제 공격! (남은 ${st.leftTickets}회)` : '⏱ 오늘 출격 완료 · 내일 자정 충전'}
      </button>
      <div class="raid-phases">${phaseBtns}</div>
      ${st.readyCount > 0 ? `<div class="claim-note ready"><span>🎁 레이드 ${st.readyCount}개 상자 수령 대기</span><button class="mini ghost js-todo" type="button" data-action="goto-todo">📋 할 일</button></div>` : ''}
    </div>
    <div class="knight-grid">${knCells}</div>
  </div>`;
}

/* ───────────── 🎖️ 영지 성장 패스(무료 30단계) · 🏷️ 칭호(20종 · v6.4.0) ───────────── */
export function passCard(ui) {
  const p = passInfo(ui.s, Date.now());
  const cells = p.tiers.map((t) => {
    const cls = `${t.milestone ? 'ms ' : ''}${t.claimed ? 'done' : t.claimable ? 'ready' : ''}`;
    const rw = t.legend
      ? `👑전설<br>✨${t.points}P 🏅1`
      : t.milestone
        ? `✨${t.points}P 🏅1<br>💎${t.shards}`
        : `💰${formatGold(t.gold)}<br>💎${t.shards}`;
    return `<div class="pass-cell ${cls}">
      <b>Lv.${t.lv}${t.claimed ? ' ✓' : ''}</b>
      <span>${t.claimable ? '🎁 수령 대기' : rw}</span>
    </div>`;
  }).join('');
  return `
  <div class="card pass-card${p.readyCount ? ' ready' : ''}" id="passCard" data-fold="pass">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🎖️</span>영지 성장 패스<small>${p.season} · 무료 Lv.${p.lv}/${p.maxLv}</small></div>
      ${p.readyCount > 0
        ? '<button class="mini up" type="button" data-action="goto-todo">📋 ' + p.readyCount + '단계 수령</button>'
        : `<span class="tiny dim">${p.curXp}/${p.needXp} XP</span>`}
    </div>
    <div class="prog tiny-prog${p.readyCount ? ' gold' : ''}" style="margin:4px 0 4px"><i style="width:${Math.round(p.pct * 100)}%"></i></div>
    <div class="pass-strip">${cells}</div>
    <div class="tiny dim" style="margin-top:4px">사냥·일일퀘·파견·방어전·강화로 무료 XP 획득 · Lv.15/30 전설 확정 · 5단계마다 ✨초월석·🏅훈장 · 수령은 📋 오늘의 할 일에서</div>
  </div>`;
}

export function titleCard(ui) {
  const ts = titleStatus(ui.s);
  const chips = ts.list.map((t) => `
    <button class="title-chip${t.equipped ? ' on' : ''}${t.unlocked ? '' : ' lock'}" type="button" data-action="title-equip" data-value="${t.id}" ${t.unlocked ? '' : 'disabled'}>
      <span>${t.icon} ${esc(t.name)}${t.equipped ? ' ✓' : ''}</span>
      <small>${t.unlocked ? esc(t.bonusText) : `🔒 ${esc(t.cond)}`}</small>
    </button>`).join('');
  return `
  <div class="card title-card" id="titleCard" data-fold="titles">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏷️</span>칭호<small>${ts.unlockedCount}/${ts.total} 해금</small></div>
      <span class="tiny" style="color:${ts.active ? 'var(--gold)' : 'var(--dim)'}">${ts.active ? `${ts.active.icon} ${esc(ts.active.name)}` : '미장착'}</span>
    </div>
    <div class="tiny dim">장착한 칭호의 보너스가 적용되며, 🏆 클라우드 랭킹 닉네임 옆에도 함께 표시됩니다.</div>
    <div class="title-grid">${chips}</div>
  </div>`;
}

/* ───────────── 🧭 전투력(CP) 원천 분석기 & 가성비 성장 내비 (v7.9.0) ─────────────
 * v8.0.0: '전투 정보' 카드 안쪽 블록으로도 쓸 수 있게 cpGuideInner 로 분리(카드 껍데기 없음).
 */
export function cpGuideInner(ui) {
  const s = ui.s;
  const buffs = (ui.app && ui.app.buffs) || {};
  const bd = computeCpBreakdown(s, buffs);
  const recs = recommendGrowth(s, buffs, Date.now());
  const segs = bd.sources
    .filter((x) => x.pct > 0)
    .map((x) => `<i style="width:${Math.max(4, x.pct)}%;background:${x.color}" title="${x.label} ${x.pct}%"></i>`)
    .join('');
  const chips = bd.sources
    .filter((x) => x.pct > 0)
    .map((x) => `<span class="cp-chip"><b style="color:${x.color}">${x.icon}${x.label}</b> ${x.pct}%</span>`)
    .join('');
  const recRows = recs.map((r) => `
    <div class="gd-row">
      <span class="gd-ico">${r.icon}</span>
      <span class="gd-mid">
        <b>${esc(r.title)} <i class="gd-tag">${esc(r.tag)}</i></b>
        <small>${esc(r.detail)}</small>
      </span>
      <button class="mini up" type="button" data-action="guide-jump" data-value="${r.jumpTab}:${r.jumpSub || ''}">이동 →</button>
    </div>`).join('');
  return `
    <div class="gd-head"><b>🧭 전투력 분석</b><span class="tiny dim">CP ${fmt(bd.cp)} · 추천 Top ${recs.length}</span></div>
    <div class="dm-bar" style="margin:2px 0 6px">${segs}</div>
    <div class="cp-chips">${chips}</div>
    <div class="gd-list">${recRows}</div>`;
}

export function cpGuideCard(ui) {
  const s = ui.s;
  const buffs = (ui.app && ui.app.buffs) || {};
  const bd = computeCpBreakdown(s, buffs);
  const recs = recommendGrowth(s, buffs, Date.now());
  return `
  <div class="card guide-card" id="cpGuideCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🧭</span>전투력 분석 · 성장 내비<small>CP ${fmt(bd.cp)}</small></div>
      <span class="tiny" style="color:var(--gold)">추천 Top ${recs.length}</span>
    </div>
    ${cpGuideInner(ui)}
  </div>`;
}

/* ───────────── 🏆 월간 시즌 도전(8종) · 명예 트로피 진열장 (v8.5.0) ───────────── */
export function seasonCard(ui) {
  const st = seasonChallengeStatus(ui.s, Date.now());
  const rows = st.items.map((it) => `
    <div class="sn-row${it.claimed ? ' done' : it.claimable ? ' ready' : ''}">
      <span class="sn-ico">${it.icon}</span>
      <span class="sn-mid">
        <b>${esc(it.name)} <small>${Math.min(it.cur, it.goal)}/${it.goal}</small></b>
        <span>${esc(it.desc)} · ✨${it.points}P 💎${it.shards}${it.medals ? ` 🏅${it.medals}` : ''}</span>
      </span>
      <span class="sn-st">${it.claimed ? '완료✓' : it.claimable ? '🎁대기' : `${Math.round(it.pct * 100)}%`}</span>
    </div>`).join('');
  const trophyHtml = st.trophies.length
    ? `<div class="sn-trophies">${st.trophies.map((t) => `<span class="tag">${t.icon} ${esc(t.month)} ${esc(t.name)}</span>`).join('')}</div>`
    : '<div class="tiny dim" style="margin-top:6px">🏅 4개 달성 시 실버 트로피 · 8개 올클리어 시 그랜드 마스터 트로피 영구 진열</div>';
  return `
  <div class="card season-card${st.readyCount ? ' ready' : ''}" id="seasonCard" data-fold="season">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏆</span>월간 시즌 도전<small>${st.month} · ${st.doneCount}/${st.total} · 트로피 ${st.trophies.length}</small></div>
      ${st.readyCount > 0
        ? `<button class="mini up" type="button" data-action="goto-todo">📋 ${st.readyCount}건 수령</button>`
        : `<span class="tiny dim">매월 1일 KST 갱신</span>`}
    </div>
    <div class="sn-list">${rows}</div>
    ${trophyHtml}
  </div>`;
}
