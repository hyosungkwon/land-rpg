// land-rpg / src/ui-social.js
// v8.18.0 🌐 멀티플레이 소셜 컴팩트 카드 (월드 레이드 · 229시군구 명예 영주 · 동맹/객원 용병 · 영주 결투장 아레나)
import {
  computeWorldRaid, computeCityLords, computeRegionVotes,
  computeAlliance, availableMercenaries, arenaStatus,
} from './social.js';
import { formatGold } from './land.js';
import { esc, fmt } from './ui-fmt.js';

/** 🌐 사냥 → 함께 탭: 1장의 컴팩트 4세그먼트 멀티플레이 허브 */
export function socialHubView(ui) {
  const s = ui.s;
  const app = ui.app || {};
  const b = ui.battle;
  const now = Date.now();
  const rows = (app.cloud && app.cloud.rank && (app.cloud.rank.all || app.cloud.rank.rows)) || [];
  const onlineCount = rows.length;
  const sec = ['world', 'lords', 'ally', 'arena'].includes(ui.socialSec) ? ui.socialSec : 'world';

  const wr = computeWorldRaid(rows, s, now);
  const ar = arenaStatus(s, rows, b && b.stats, now);

  const seg = `<div class="seg-bar seg-4" role="tablist">
    <button class="seg-btn${sec === 'world' ? ' on' : ''}" type="button" data-action="social-sec" data-value="world">🐉 월드${wr.readyCount ? `(${wr.readyCount})` : ''}</button>
    <button class="seg-btn${sec === 'lords' ? ' on' : ''}" type="button" data-action="social-sec" data-value="lords">👑 영주</button>
    <button class="seg-btn${sec === 'ally' ? ' on' : ''}" type="button" data-action="social-sec" data-value="ally">🛡️ 동맹</button>
    <button class="seg-btn${sec === 'arena' ? ' on' : ''}" type="button" data-action="social-sec" data-value="arena">⚔️ 결투(${ar.left})</button>
  </div>`;

  const syncBar = `<div class="soc-sync">
    <span>🌐 ${onlineCount > 0 ? `실시간 영주 <b>${onlineCount}명</b> 연결됨` : '게스트/오프라인 모드 (NPC 영주 참여 중)'}</span>
    <button class="mini ghost" type="button" data-action="social-refresh">🔄 갱신</button>
  </div>`;

  let body = '';
  if (sec === 'world') {
    const msHtml = wr.milestones.map((m) => `
      <button class="rp-chip${m.claimed ? ' done' : m.claimable ? ' ready' : ''}" type="button" data-action="world-raid-claim" data-value="${m.idx}" ${m.claimable ? '' : 'disabled'}>
        <div>${m.label}</div>
        <small>${m.claimed ? '수령✓' : m.claimable ? '🎁 받기!' : `✨${m.points}P 💎${m.shards}`}</small>
      </button>`).join('');
    const topHtml = wr.top.map((t, i) => `
      <div class="soc-row${t.isMe ? ' me' : ''}">
        <span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} <b>${esc(t.name)}</b>${t.isNpc ? ' <small class="dim">NPC</small>' : ''}</span>
        <span style="color:var(--gold)">${formatGold(t.dmg)}</span>
      </div>`).join('');
    body = `
    <div class="card soc-card">
      <div class="card-head">
        <div class="card-title"><span class="t-ico">🐉</span>전 서버 공동 월드 레이드<small>${wr.week} · ${wr.contributors}명 참여</small></div>
        <span class="tiny" style="color:var(--gold)">${wr.pct.toFixed(1)}%</span>
      </div>
      <div class="prog tiny-prog gold" style="margin:4px 0"><i style="width:${wr.pct}%"></i></div>
      <div class="row tiny dim"><span>서버 누적 피해 <b>${formatGold(wr.totalDmg)}</b></span><span>목표 ${formatGold(wr.maxGoal)}</span></div>
      <div class="raid-phases" style="margin-top:8px">${msHtml}</div>
      <div class="tiny dim" style="margin-top:8px">💡 도전 탭의 <b>거대 레이드 실시간 토벌전</b> 피해가 전 서버 게이지에 자동 합산됩니다.</div>
      <div class="soc-list" style="margin-top:8px">${topHtml}</div>
    </div>`;
  } else if (sec === 'lords') {
    const cl = computeCityLords(rows, s, now);
    const rv = computeRegionVotes(rows, s, now);
    const lordRows = cl.list.slice(0, 8).map((l) => `
      <div class="soc-row${l.isMe ? ' me' : ''}">
        <span>👑 <b>${esc(l.cityName)}</b> <small class="dim">· ${esc(l.name)}</small></span>
        <span>${fmt(l.qty)}평</span>
      </div>`).join('');
    const voteChips = rv.list.map((r) => `
      <button class="chip${rv.myVote === r.id ? ' on' : ''}" type="button" data-action="region-vote" data-value="${r.id}">${r.icon} ${r.name} <b>${r.votes}</b></button>`).join('');
    body = `
    <div class="card soc-card">
      <div class="card-head">
        <div class="card-title"><span class="t-ico">👑</span>전국 명예 영주 · 호재 투표<small>내 왕관 ${cl.myCrowns}곳</small></div>
        <span class="tiny dim">매수 1위 → 영주 등극</span>
      </div>
      <div class="soc-list">${lordRows || '<div class="tiny dim">아직 등록된 영주가 없습니다.</div>'}</div>
      <div class="soc-vote">
        <div class="row" style="margin-bottom:5px"><span class="tiny"><b>🗳️ 주간 특별 호재 투표</b> <span class="dim">1위: ${rv.winner ? `${rv.winner.icon}${rv.winner.name}` : '—'}</span></span></div>
        <div class="chips" style="margin:0">${voteChips}</div>
      </div>
    </div>`;
  } else if (sec === 'ally') {
    const al = computeAlliance(rows, s, now);
    const mercs = availableMercenaries(rows, s, now);
    const curMerc = s.social && s.social.mercUid ? s.social.mercUid : '';
    const memHtml = al.joined
      ? al.members.slice(0, 6).map((m) => `<div class="soc-row${m.isMe ? ' me' : ''}"><span>🛡️ <b>${esc(m.name)}</b></span><span class="tiny dim">S${m.stage || 1} · Lv.${m.level || 1}</span></div>`).join('')
      : '<div class="tiny dim" style="margin:6px 0">친구와 같은 2~8자 영문/숫자 동맹 코드를 입력하면 같은 동맹으로 묶입니다(공격·골드 +4% 기본, 동맹원 수에 비례 증폭).</div>';
    const mercHtml = mercs.map((m) => {
      const on = curMerc === m.uid;
      return `<div class="soc-row${on ? ' me' : ''}">
        <span>${m.sameAlly ? '🛡️' : '🤝'} <b>${esc(m.name)}</b> <small class="dim">S${m.stage} · 공격 +${m.atkPct}%</small></span>
        <button class="mini ${on ? 'on' : 'up'}" type="button" data-action="merc-hire" data-value="${esc(m.uid)}">${on ? '해제' : '지원 고용'}</button>
      </div>`;
    }).join('');
    body = `
    <div class="card soc-card">
      <div class="card-head">
        <div class="card-title"><span class="t-ico">🛡️</span>동맹 · 객원 용병<small>${al.joined ? `[${esc(al.code)}] ${al.count}명` : '미가입'}</small></div>
        <span class="tiny" style="color:var(--gold)">${al.joined ? `공격 +${al.atkPct}% · 골드 +${al.goldPct}%` : '코드로 합류'}</span>
      </div>
      <div class="cloud-nick" style="margin-top:0">
        <input id="allyCodeIn" class="cloud-nick-in" type="text" maxlength="8" value="${esc(al.code)}" placeholder="동맹 코드 (예: KOREA)" autocomplete="off" spellcheck="false">
        <button class="btn small primary" type="button" data-action="ally-join">저장</button>
      </div>
      <div class="soc-list" style="margin-top:6px">${memHtml}</div>
      <div class="tiny" style="margin:10px 0 4px"><b>🤝 객원 용병 출격</b> <span class="dim">선택한 영주가 전투 캔버스에 직접 지원 출격!</span></div>
      <div class="soc-list">${mercHtml}</div>
    </div>`;
  } else {
    const liveArena = !!(b && b.arena);
    const busy = !!(b && (b.arena || b.raid || b.rift || b.invasion || b.tower || b.dungeon || b.daily || b.boss));
    const oppHtml = ar.opponents.map((o) => `
      <div class="soc-row">
        <span>⚔️ <b>${esc(o.name)}</b> <small class="dim">S${o.stage} · 레이팅 ${o.rating}${o.isNpc ? ' · NPC' : ''}</small></span>
        <button class="mini ${ar.left > 0 && !busy ? 'up' : ''}" type="button" data-action="arena-fight" data-value="${esc(o.uid)}" ${ar.left > 0 && !busy ? '' : 'disabled'}>${liveArena ? '대전중' : '도전'}</button>
      </div>`).join('');
    body = `
    <div class="card soc-card">
      <div class="card-head">
        <div class="card-title"><span class="t-ico">⚔️</span>영주 결투장 (아레나)<small>레이팅 ${ar.rating} · ${ar.wins}승</small></div>
        <span class="tiny" style="color:var(--gold)">오늘 ${ar.left}/${ar.max}회</span>
      </div>
      <div class="tiny dim" style="margin-bottom:6px">다른 영주의 전투 스냅샷과 <b>전투 캔버스에서 1:1 실시간 대결</b>! 승리 시 💰골드 · 💎28 · ✨2P 획득.</div>
      <div class="soc-list">${oppHtml}</div>
    </div>`;
  }

  return `${syncBar}${seg}${body}`;
}
