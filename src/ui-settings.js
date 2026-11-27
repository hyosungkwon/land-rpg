// land-rpg / src/ui-settings.js
// v8.6.0 설정 탭 UI 분리 모듈 — 클라우드·랭킹·세이브 백업·게임 설정·통합 정보 카드·설치 링크
import { APP_VERSION, ECON } from './data.js';
import { CITIES, portfolioOf, formatGold, landmarkSummary } from './land.js';
import { regionSetBuffs } from './region.js';
import { PETS, petDef, petEvo, petStageInfo, jobOf } from './meta.js';
import { towerProgress } from './tower.js';
import { DAILY } from './daily.js';
import {
  QUESTS, ACHIEVEMENTS, questStateOf, codexStats, achievementStatus, claimedAchievementCount,
} from './quests.js';
import { rebirthStatus, traitSummary } from './rebirth.js';
import { GEAR_ITEMS } from './gear.js';
import { cloudCard, rankCard } from './ui-cloud.js';
import { rarityName } from './ui-gear.js';
import { esc, fmt } from './ui-fmt.js';

const isOpen = (ui, id) => !(ui && ui.collapsed && typeof ui.collapsed.has === 'function' && ui.collapsed.has(id));

export function installCard(ui) {
  const st = ui.install;
  if (!st || st.hidden) return '';
  return `
  <button class="btn small ghost block install-link" type="button" data-action="install">📲 홈 화면에 앱으로 설치 <small>${st.canPrompt ? '원클릭' : '방법 안내'}</small></button>`;
}

export function tplSettings(ui) {
  const s = ui.s;
  const mins = Math.floor((s.records.playMs || 0) / 60000);
  const p = portfolioOf(s);
  const c = codexStats(s);
  const qs = questStateOf(s);
  const achClaimed = claimedAchievementCount(s);
  const achReady = achievementStatus(s).filter((a) => a.claimable).length;
  const setB = regionSetBuffs(s.land.owned);
  const lms = landmarkSummary(s);
  const prevSave = (ui.app && ui.app.prevSave) || null;
  const tp = towerProgress(s);
  const petEvoCount = PETS.filter((d) => petEvo(s, d.id) > 0).length;
  const rb = rebirthStatus(s);

  const infoOpen = isOpen(ui, 'info');
  const infoCard = `
  <div class="card info-card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">📊</span>정보<small>v${APP_VERSION}</small></div>
      <span class="tiny dim">Lv.${s.level} · S${Math.max(s.peakStage || 1, s.maxStage || 1)} · ♾️${rb.count}회</span>
    </div>
    <div class="kv"><span class="k">최고 스테이지</span><span class="v">S${s.peakStage || s.maxStage} · 이번 회차 S${s.maxStage}</span></div>
    <div class="kv"><span class="k">플레이 시간</span><span class="v">${mins < 60 ? `${mins}분` : `${Math.floor(mins / 60)}시간 ${mins % 60}분`}</span></div>
    <div class="kv"><span class="k">총자산</span><span class="v">💰${formatGold(p.totalAsset)}</span></div>
    <div class="card-body${infoOpen ? '' : ' hidden'}" id="fold-info">
    <div class="kv"><span class="k">총 처치 · 보스</span><span class="v">${fmt(s.totalKills)} · ${fmt(s.bossKills)}</span></div>
    <div class="kv"><span class="k">누적 사냥 골드</span><span class="v">${formatGold(s.records.totalGold || 0)}</span></div>
    <div class="kv"><span class="k">뽑기 횟수</span><span class="v">${fmt((s.gacha && s.gacha.total) || 0)}회 · 최고 ${rarityName((s.gacha && s.gacha.best) || 'common')}</span></div>
    <div class="kv"><span class="k">미션 완료</span><span class="v">${qs.done}/${QUESTS.length}</span></div>
    <div class="kv"><span class="k">버전</span><span class="v">${APP_VERSION} · 게스트 통합</span></div>
    <div class="kv"><span class="k">전직</span><span class="v">${jobOf(s).badge} ${esc(jobOf(s).name)}</span></div>
    <div class="kv"><span class="k">환생 · 특성</span><span class="v">♾️ ${rb.count}회 · 초월석 ${fmt(rb.points)}P · ${esc(traitSummary(s))}</span></div>
    <div class="kv"><span class="k">동료 펫</span><span class="v">${petDef(s.pet && s.pet.equipped) ? `${petDef(s.pet.equipped).emoji} ${esc(petStageInfo(s, s.pet.equipped).name)}` : '없음'} · ★${petEvoCount}마리 / ${PETS.length}종</span></div>
    <div class="kv"><span class="k">황금 던전</span><span class="v">${fmt((s.dungeon && s.dungeon.runs) || 0)}회 · 최고 피해 ${fmt((s.dungeon && s.dungeon.best) || 0)}</span></div>
    <div class="kv"><span class="k">도전의 탑</span><span class="v">🗼 최고 ${tp.best}/${tp.max}층 · 도전 ${fmt((s.tower && s.tower.runs) || 0)}회</span></div>
    <div class="kv"><span class="k">일일 보스</span><span class="v">🌟 최고 ${fmt((s.dailyBoss && s.dailyBoss.best) || 0)} 피해 · 오늘 ${(s.dailyBoss && s.dailyBoss.used) || 0}/${DAILY.attempts}회</span></div>
    <div class="kv"><span class="k">장비</span><span class="v">${GEAR_ITEMS.length}종 장비 · 5부위 인벤토리</span></div>
    <div class="kv"><span class="k">도감 · 업적</span><span class="v">수집 ${c.pct}% · 업적 ${achClaimed}/${ACHIEVEMENTS.length}${achReady ? ` (⚡${achReady})` : ''}</span></div>
    <div class="kv"><span class="k">경제</span><span class="v">골드 하나 (사냥 = 부동산)</span></div>
    <div class="kv"><span class="k">부동산</span><span class="v">전국 ${CITIES.length}개 시군구 · 권역 세트 ${setB.activeCount || 0}/${setB.total || 7}</span></div>
    <div class="kv"><span class="k">랜드마크</span><span class="v">🏛️ ${lms.count}개 · 임대 보너스</span></div>
    <div class="kv"><span class="k">호재 뉴스</span><span class="v">3분마다 갱신 · 기록 ${(s.news && s.news.seen ? s.news.seen.length : 0)}종</span></div>
    <div class="kv"><span class="k">저장 위치</span><span class="v">localStorage</span></div>
    <div class="note" style="margin-top:9px">
      방치 보상은 최대 <b>${ECON.offlineCapHours}시간</b>까지 정산됩니다. 화면을 닫아도 자동으로 저장됩니다.
    </div>
    </div>
    <button class="mini ghost block info-toggle" type="button" data-action="toggle-fold" data-value="info" aria-expanded="${infoOpen ? 'true' : 'false'}"><i class="cv">${infoOpen ? '▾' : '▸'}</i> 전체 기록 · 앱 정보</button>
    <div class="row gap6" style="margin-top:7px">
      <button class="mini ghost wide" type="button" data-action="guide-jump" data-value="gear:job">✨ 전직·환생</button>
      <button class="mini ghost wide" type="button" data-action="open-codex" data-value="monster">📖 도감</button>
      <button class="mini ghost wide" type="button" data-action="open-achievements">🏆 업적 ${achReady ? '⚡' : ''}</button>
    </div>
  </div>`;

  return `
  ${cloudCard(ui)}

  ${rankCard(ui)}

  <div class="card save-card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">💾</span>세이브 코드 백업<small>기기 이동 · 복원</small></div>
      <span class="tiny dim">Lv.${s.level} · S${Math.max(s.peakStage || 1, s.maxStage || 1, s.stage || 1)}</span>
    </div>
    <div class="tiny muted">기기를 바꾸거나 브라우저 데이터를 지울 때, 지금 진행도를 <b>코드 한 줄</b>로 보관합니다.</div>
    <div class="save-meta">
      <span>⭐ Lv.<b>${s.level}</b></span>
      <span>🏔️ S<b>${Math.max(s.peakStage || 1, s.maxStage || 1)}</b></span>
      <span>🏢 <b>${p.cities}</b>곳</span>
      <span>♾️ <b>${rb.count}</b>회</span>
    </div>
    <div class="row gap6" style="margin-top:9px">
      <button class="btn small blue wide" type="button" data-action="save-export">📤 내보내기 (복사)</button>
      <button class="btn small ghost wide" type="button" data-action="save-import">📥 불러오기 (복원)</button>
    </div>
    ${prevSave
      ? `<button class="btn small ghost block save-undo" type="button" data-action="save-undo">↩️ 직전 세이브로 복구 <small>Lv.${prevSave.level} · S${prevSave.stage} · ${prevSave.cities}곳</small></button>`
      : ''}
    <div class="tiny dim" style="margin-top:6px">복원은 <b>미리보기 → 확인</b> 순서로 실행되고, 잘못된 코드는 기존 세이브를 건드리지 않습니다.</div>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">⚙️</span>게임 설정</div><span class="tiny dim">v${APP_VERSION} · 이 기기에 자동 저장</span></div>
    <div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">자동 진행</span>
      <div class="sw-group">
        <span class="sw-item"><small>보스</small><button class="switch sm ${s.autoBoss ? 'on' : ''}" data-action="toggle-auto" aria-label="자동 보스 전환"></button></span>
        <span class="sw-item"><small>스킬</small><button class="switch sm ${s.autoSkill !== false ? 'on' : ''}" data-action="toggle-auto-skill" aria-label="스킬 자동 시전 전환"></button></span>
        <span class="sw-item"><small>궁극</small><button class="switch sm ${s.autoUlt !== false ? 'on' : ''}" data-action="toggle-auto-ult" aria-label="궁극기 자동 발동 전환"></button></span>
      </div>
    </div>
    <div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">화면 이펙트</span>
      <button class="switch ${s.effects ? 'on' : ''}" data-action="toggle-effects"></button>
    </div>
    <div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">화면 흔들림 <span class="dim">타격감</span></span>
      <button class="switch ${s.screenShake !== false ? 'on' : ''}" data-action="toggle-shake" aria-label="화면 흔들림 전환"></button>
    </div>
    <div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">데미지 숫자 표시 <span class="dim">K/M/B 축약</span></span>
      <button class="switch ${s.dmgNumbers !== false ? 'on' : ''}" data-action="toggle-dmg-numbers" aria-label="데미지 숫자 표시 전환"></button>
    </div>
    <div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">피해 숫자 밀도 <span class="dim">기본 '간단'</span></span>
      <div class="chips dmg-chips">
        <button class="chip ${s.dmgStyle !== 'full' ? 'on' : ''}" type="button" data-action="dmg-style" data-value="simple">간단</button>
        <button class="chip ${s.dmgStyle === 'full' ? 'on' : ''}" type="button" data-action="dmg-style" data-value="full">자세히</button>
      </div>
    </div>
    <div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">효과음 <span class="dim">타격·코인·보스·뽑기</span></span>
      <button class="switch ${s.soundOn !== false ? 'on' : ''}" data-action="toggle-sound" aria-label="효과음 전환"></button>
    </div>
    <div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">배경음(BGM) <span class="dim">평원·보스·피버 신스</span></span>
      <button class="switch ${s.bgmOn === true ? 'on' : ''}" data-action="toggle-bgm" aria-label="배경음 전환"></button>
    </div>
    <div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">절전 방치 모드 <span class="dim">🌙 OLED 배터리 절약</span></span>
      <button class="btn small ghost" type="button" data-action="toggle-sleep">🌙 켜기</button>
    </div>
    <button class="btn small block" style="margin-top:8px;color:#ffb3b3;border-color:rgba(255,107,107,0.3)" data-action="reset">게임 초기화</button>
  </div>

  ${infoCard}

  ${installCard(ui)}`;
}
