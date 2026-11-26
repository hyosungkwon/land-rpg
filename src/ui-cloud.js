// land-rpg / src/ui-cloud.js
// v5.0.0 ☁️ 클라우드 세이브 · 🏆 4종 랭킹 보드 UI 모듈(최고 스테이지 · 총자산 · 도전의 탑 · 일일 보스)
import {
  CLOUD, normalizeRankKey, cloudStatusText, rankOf, rankValueText, rankMetricLabel, sanitizeNick, nickOf,
} from './cloud.js';
import { esc, relTime } from './ui-fmt.js';
import { TITLE_BY_ID } from './pass.js';

/** ☁️ 클라우드 세이브 카드 — 기본은 꺼짐(게스트). 켜고 싶은 사람만 로그인한다. */
export function cloudCard(ui) {
  const app = ui.app || {};
  const c = app.cloud || {};
  const s = ui.s;
  const st = cloudStatusText(c);
  // 게스트가 기본 — '켜짐'은 이 앱에서 사용자가 켠 경우(s.cloud.enabled)만 뜻한다.
  const enabled = !!(s.cloud && s.cloud.enabled === true);
  const signed = enabled && !!c.uid;
  const hasSession = !enabled && !!c.uid; // 예전에 로그인한 Google 세션이 브라우저에 남아 있는 경우
  const uid = c.uid || (s.cloud && s.cloud.uid) || '';
  const email = (c.user && (c.user.email || c.user.name)) || (s.cloud && s.cloud.email) || 'Google 계정';
  const last = relTime((s.cloud && s.cloud.lastSync) || c.lastSync || 0);

  if (signed) {
    return `
  <div class="card cloud-card on" id="cloudCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">☁️</span>클라우드 세이브<small>${esc(email)}</small></div>
      <span class="tiny" style="color:var(--gold)">${st.label}</span>
    </div>
    <div class="kv"><span class="k">계정</span><span class="v">${esc(email)}</span></div>
    <div class="kv"><span class="k">마지막 저장</span><span class="v">${last}</span></div>
    <div class="kv"><span class="k">저장 위치</span><span class="v">rpg/${esc(String(uid).slice(0, 6))}… · 나만 보기</span></div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">60초 자동 저장 <span class="dim">${(s.cloud && s.cloud.autoSync === false) ? '끔' : '켬'}</span></span>
      <button class="switch ${(s.cloud && s.cloud.autoSync !== false) ? 'on' : ''}" data-action="cloud-auto" aria-label="자동 저장 전환"></button>
    </div>
    ${(ui.app && ui.app._cloudHold) ? `<div class="note warn" style="margin-top:7px">⚠️ 클라우드에 더 앞선 세이브가 있습니다. 어느 쪽을 남길지 고르기 전까지 <b>자동 저장을 멈췄습니다</b>.</div>
    <button class="btn small primary block" style="margin-top:6px" type="button" data-action="cloud-compare">🔍 비교해서 고르기</button>` : ''}
    <div class="row gap6" style="margin-top:9px">
      <button class="btn small blue wide" type="button" data-action="cloud-save">☁️ 지금 저장</button>
      <button class="btn small ghost wide" type="button" data-action="cloud-load">📥 불러오기</button>
    </div>
    <button class="btn small ghost block" style="margin-top:6px" type="button" data-action="cloud-signout">로그아웃 (게스트로 계속)</button>
  </div>`;
  }

  const connecting = !hasSession && st.tone === 'warn';
  const btnLabel = hasSession ? '☁️ 이어서 클라우드 켜기' : connecting ? '☁️ 연결 중…' : '☁️ Google로 클라우드 켜기';
  return `
  <div class="card cloud-card" id="cloudCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">☁️</span>클라우드 세이브<small>선택</small></div>
      <span class="tiny" style="color:var(--dim)">${hasSession ? '게스트 (로그인 대기)' : '게스트 (이 기기에만 저장)'}</span>
    </div>
    <div class="tiny muted">지금은 <b>게스트</b> — 진행도는 이 기기에만 저장됩니다. 원하면 Google 로그인으로 세이브를 클라우드에 백업하고 🏆 랭킹에 참여할 수 있습니다.</div>
    ${hasSession ? '<div class="note" style="margin-top:7px">이 브라우저에 <b>Google 로그인 세션</b>이 남아 있습니다. 켜면 다시 로그인하지 않고 바로 연결됩니다.</div>' : ''}
    <button class="btn small primary block" style="margin-top:9px" type="button" data-action="cloud-signin" ${connecting ? 'disabled' : ''}>${btnLabel}</button>
    <div class="tiny dim" style="margin-top:7px">로그인은 선택입니다. 로그인하지 않아도 게임은 그대로 저장되고, 로그인·연결이 실패해도 게스트 저장은 계속됩니다.</div>
    ${st.tone === 'error' && c.lastError ? `<div class="note warn" style="margin-top:7px">⚠️ ${esc(c.lastError)}</div>` : ''}
  </div>`;
}

/** 🏆 랭킹 카드 — 공개 노드라 로그인 없이도 볼 수 있고, 참여하려면 로그인이 필요하다. (v5.0 4종 지표) */
export function rankCard(ui) {
  const app = ui.app || {};
  const c = app.cloud || {};
  const R = c.rank || { key: 'stage', rows: [], count: 0 };
  const key = normalizeRankKey(R.key);
  const signed = !!c.uid;
  const enabled = !!(ui.s.cloud && ui.s.cloud.enabled === true);
  const myUid = c.uid || '';
  const my = myUid ? rankOf(R.all || R.rows || [], myUid) : null;
  const count = R.count || (R.rows || []).length;
  const rows = (R.rows || []).map((r) => {
    const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '';
    const tDef = r.title && TITLE_BY_ID[r.title];
    const tBadge = tDef ? `<span class="rank-title">${tDef.icon}${esc(tDef.name)}</span>` : '';
    return `<div class="rank-row${r.uid === myUid ? ' me' : ''}">
      <span class="rank-pos${r.rank <= 3 ? ' top' : ''}">${medal || r.rank}</span>
      <span class="rank-name">${tBadge}${esc(r.name)}<small>Lv.${r.level}</small></span>
      <span class="rank-val">${rankValueText(key, r)}</span>
    </div>`;
  }).join('');
  const nickNow = sanitizeNick(nickOf(ui.s), myUid);
  const loaded = !!R.at;

  let body;
  if (R.loading) {
    body = '<div class="tiny muted" style="padding:9px 0">🏆 랭킹을 불러오는 중…</div>';
  } else if (R.error) {
    body = `<div class="note warn" style="margin-top:6px">⚠️ ${esc(R.error)}</div>
      <button class="btn small ghost block" style="margin-top:7px" type="button" data-action="cloud-rank-refresh">🔄 다시 시도</button>`;
  } else if (!rows) {
    body = loaded
      ? `<div class="tiny muted" style="padding:6px 0">아직 참가자가 없습니다 — 첫 기록의 주인공이 되어 보세요(☁️ 저장을 하면 자동 등록).</div>
      <button class="btn small ghost block" style="margin-top:7px" type="button" data-action="cloud-rank-refresh">🔄 새로고침</button>`
      : `<div class="tiny muted" style="padding:6px 0">${rankMetricLabel(key)} TOP ${CLOUD.topN}과 내 순위를 불러옵니다. 로그인 없이도 볼 수 있습니다.</div>
      <button class="btn small ghost block" style="margin-top:7px" type="button" data-action="cloud-rank-refresh">🏆 랭킹 불러오기</button>`;
  } else {
    body = `<div class="rank-list">${rows}</div>
      <div class="rank-me${my ? ' on' : ''}">${my
        ? `내 순위 <b>${my.rank}위</b> / ${count}명 · ${esc(my.name)} · ${rankValueText(key, my)}`
        : signed && enabled
          ? '아직 랭킹 기록이 없습니다 — ☁️ 저장을 한 번 하면 등록됩니다'
          : '☁️ 클라우드를 켜고 저장하면 내 기록도 랭킹에 올라갑니다'}</div>
      <button class="btn small ghost block" style="margin-top:7px" type="button" data-action="cloud-rank-refresh">🔄 새로고침</button>`;
  }

  return `
  <div class="card rank-card" id="rankCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏆</span>랭킹<small>공개 · TOP ${CLOUD.topN}</small></div>
      <span class="tiny dim">${R.at ? (count ? `${count}명 참가` : '참가자 없음') : '아직 안 불러옴'}</span>
    </div>
    <div class="chips" style="margin-bottom:6px">
      <button class="chip${key === 'stage' ? ' on' : ''}" type="button" data-action="cloud-rank" data-value="stage">🏔️ 최고 스테이지</button>
      <button class="chip${key === 'asset' ? ' on' : ''}" type="button" data-action="cloud-rank" data-value="asset">💰 총자산</button>
      <button class="chip${key === 'tower' ? ' on' : ''}" type="button" data-action="cloud-rank" data-value="tower">🗼 도전의 탑</button>
      <button class="chip${key === 'daily' ? ' on' : ''}" type="button" data-action="cloud-rank" data-value="daily">🌟 일일 보스</button>
    </div>
    ${body}
    ${signed && enabled ? `<div class="cloud-nick">
      <input id="cloudNick" class="cloud-nick-in" type="text" maxlength="${CLOUD.nickMax}" value="${esc(nickNow)}" placeholder="랭킹 닉네임 (2~${CLOUD.nickMax}자)" aria-label="랭킹 닉네임" autocomplete="off" spellcheck="false">
      <button class="btn small ghost" type="button" data-action="cloud-nick">저장</button>
    </div>` : '<div class="tiny dim" style="margin-top:7px">랭킹 닉네임은 클라우드를 켠 뒤 정할 수 있습니다 (실명이 그대로 노출되지 않도록 기본값은 무작위 이름입니다).</div>'}
  </div>`;
}
