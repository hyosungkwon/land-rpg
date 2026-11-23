// land-rpg / src/ui.js
// 하단 탭 UI · HUD · 토스트/모달. 상태는 app.js 를 통해 읽고, 조작은 actions 로 넘긴다.
// v3: 게스트 전용 — 로그인/클라우드 UI 없이 [사냥/스킬 | 장비/강화 | 부동산 | 설정].
import {
  APP_VERSION, ECON, EQUIP, EQUIP_MAX_LV, SKILLS, skillCost, enhanceCost,
  RARITIES, RARITY_INDEX, GACHA, gachaCost, rarityBonusLv,
} from './data.js';
import { expNeed, skillEffect, shardPrice } from './state.js';
import {
  CITIES, LAND, portfolioOf, computeBuffs, buffProgress, formatGold, priceInfo,
} from './land.js';
import {
  PETS, DUNGEON, PET_MAX_LV, petDef, petProgress, petLevel, petAtkPct, petDmgPct,
  petUpgradeCost, jobOf, jobProgress, dungeonState,
} from './meta.js';

const esc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('ko-KR');
const pct = (v) => `${Math.max(0, Math.min(100, v)).toFixed(0)}%`;
const hhmmss = (d = new Date()) =>
  [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
const mmss = (ms) => {
  const sec = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

export class UI {
  constructor(app) {
    this.app = app; // { s, battle, buffs, actions ... }
    this.tab = 'hunt';
    this.el = {
      hud: document.getElementById('hud'),
      gold: document.getElementById('goldVal'),
      shard: document.getElementById('shardVal'),
      asset: document.getElementById('assetVal'),
      rentHr: document.getElementById('rentHr'),
      assetBadge: document.getElementById('assetBadge'),
      stageNum: document.getElementById('stageNum'),
      themeName: document.getElementById('themeName'),
      bossBtn: document.getElementById('bossBtn'),
      bossCount: document.getElementById('bossCount'),
      killDots: document.getElementById('killDots'),
      hpFill: document.getElementById('hpFill'),
      hpText: document.getElementById('hpText'),
      expFill: document.getElementById('expFill'),
      expText: document.getElementById('expText'),
      quick: document.getElementById('quickSkills'),
      panel: document.getElementById('panel'),
      panelInner: document.getElementById('panelInner'),
      tabbar: document.getElementById('tabbar'),
      toastRoot: document.getElementById('toastRoot'),
      modalRoot: document.getElementById('modalRoot'),
      modalCard: document.getElementById('modalCard'),
      boot: document.getElementById('boot'),
      offlinePill: document.getElementById('offlinePill'),
      soundBtn: document.getElementById('soundBtn'),
      soundIco: document.getElementById('soundIco'),
      installBtn: document.getElementById('installBtn'),
    };
    this.logs = [];
    this.lastLive = 0;
    this._cache = {};
  }

  /* ───────────── 초기 바인딩 ───────────── */
  init() {
    this.el.killDots.innerHTML = Array.from({ length: ECON.normalKillsPerStage }, () => '<i></i>').join('');

    this.el.tabbar.addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      this.setTab(b.dataset.tab);
    });

    // 상단 내 부동산 요약 → 부동산 탭
    this.el.assetBadge.addEventListener('click', () => this.setTab('land'));

    // 부동산 매물 검색 — 목록 영역만 갱신해 입력 포커스를 유지한다
    this._searchTimer = 0;
    this.el.panelInner.addEventListener('input', (e) => {
      const el = e.target;
      if (!el || el.id !== 'landSearch') return;
      const v = el.value;
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.app.actions.landSearch(v), 180);
    });

    document.body.addEventListener('click', (e) => {
      if (!e.target || !e.target.closest) return;
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.closest('#panel') || btn.closest('#modalCard') || btn.closest('.stage') || btn.closest('#hud')) {
        this.handleAction(btn);
      }
    });

    this.el.quick.addEventListener('click', (e) => {
      const b = e.target.closest('.q');
      if (!b) return;
      this.app.actions.castSkill(b.dataset.skill);
    });

    this.el.bossBtn.addEventListener('click', () => this.app.actions.challengeBoss());

    if (this.el.soundBtn) {
      this.el.soundBtn.addEventListener('click', () => this.app.actions.toggleSound());
    }
    this.syncSound();

    this.el.modalRoot.addEventListener('click', (e) => {
      if (e.target.closest('[data-modal-close]')) this.closeModal();
    });
  }

  handleAction(btn) {
    const a = btn.dataset.action;
    const v = btn.dataset.value;
    const actions = this.app.actions;
    switch (a) {
      case 'tab': this.setTab(v); break;
      case 'boss': actions.challengeBoss(); break;
      case 'toggle-auto': actions.toggleAutoBoss(); break;
      case 'toggle-effects': actions.toggleEffects(); break;
      case 'toggle-sound': actions.toggleSound(); break;
      case 'gacha': actions.pullGacha(Number(v) || 1); break;
      case 'gacha-cur': actions.gachaCur(v); break;
      case 'cast': actions.castSkill(v); break;
      case 'upgrade-skill': actions.upgradeSkill(v); break;
      case 'enhance': actions.enhance(btn.dataset.slot, 1); break;
      case 'enhance10': actions.enhance(btn.dataset.slot, 10); break;
      case 'buy-shards': actions.buyShards(v); break;
      case 'land-sub': this.setLandSub(v); break;
      case 'land-trade': actions.landTrade(v, btn.dataset.side); break;
      case 'land-more': actions.landMore(); break;
      case 'land-sort': actions.landSort(v); break;
      case 'land-tier': actions.landTier(v); break;
      case 'claim-rent': actions.claimRent(); break;
      case 'promote': actions.promoteJob(); break;
      case 'pet-equip': actions.equipPet(v); break;
      case 'pet-upgrade': actions.upgradePet(v); break;
      case 'dungeon': actions.enterDungeon(v); break;
      case 'reset': actions.resetGame(); break;
      case 'install': actions.install(); break;
      case 'close-modal': this.closeModal(); break;
      default: break;
    }
  }

  setTab(tab) {
    if (!tab || tab === this.tab) {
      if (tab) {
        this.el.panel.scrollTop = 0;
        this.render();
      }
      return;
    }
    this.tab = tab;
    [...this.el.tabbar.querySelectorAll('.tab')].forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.el.panel.scrollTop = 0;
    this.render();
  }

  setLandSub(sub) {
    const ok = ['home', 'market', 'buff'];
    this.s.land.sub = ok.includes(sub) ? sub : 'home';
    this.s.land.page = 1;
    this.el.panel.scrollTop = 0;
    this.render();
  }

  /* ───────────── 상태 접근 ───────────── */
  get s() { return this.app.s; }
  get battle() { return this.app.battle; }

  /* ───────────── HUD (매 프레임) ───────────── */
  refreshLive(now) {
    const b = this.battle;
    const s = this.s;
    if (!b) return;
    const st = b.stats;
    const hp = Math.max(0, b.player.hp);
    const hpPct = hp / st.hpMax;
    const setW = (el, v) => { if (el && el.style.width !== v) el.style.width = v; };
    const setT = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };

    setW(this.el.hpFill, pct(hpPct * 100));
    this.el.hpFill.parentElement.classList.toggle('low', hpPct < 0.3);
    setT(this.el.hpText, `${fmt(hp)} / ${fmt(st.hpMax)}`);

    const need = expNeed(s.level);
    setW(this.el.expFill, pct((s.exp / need) * 100));
    setT(this.el.expText, `Lv.${s.level} · ${((s.exp / need) * 100).toFixed(1)}%`);

    setT(this.el.gold, fmt(s.gold));
    setT(this.el.shard, fmt(s.shards));

    const def = b.def;
    setT(this.el.stageNum, `스테이지 ${s.stage}`);
    setT(this.el.themeName, def.themeName);

    // 처치 게이지
    const dots = this.el.killDots.children;
    const filled = b.boss ? ECON.normalKillsPerStage : Math.min(ECON.normalKillsPerStage, s.killsInStage);
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < filled);

    // 보스 버튼
    const btn = this.el.bossBtn;
    const ready = s.bossReady && !b.boss;
    btn.classList.toggle('ready', ready);
    btn.classList.toggle('busy', !!b.boss);
    const remainKills = Math.max(0, ECON.normalKillsPerStage - s.killsInStage);
    setT(this.el.bossCount, b.boss ? '전투' : ready ? '도전' : String(remainKills));

    // 퀵 스킬 쿨타임
    [...this.el.quick.querySelectorAll('.q')].forEach((q) => {
      const key = q.dataset.skill;
      const def2 = SKILLS[key];
      const sk = s.skills[key];
      const left = Math.max(0, (sk.last + def2.cd) - now);
      const ratio = left / def2.cd;
      q.querySelector('.q-cd').style.height = `${ratio * 100}%`;
      q.classList.toggle('ready', left <= 0);
    });

    // 250ms 마다 패널/헤더 내 숫자 갱신
    if (now - this.lastLive > 250) {
      this.lastLive = now;
      this.refreshHeader();
      this.refreshPanelLive(now);
    }
  }

  refreshHeader() {
    const p = portfolioOf(this.s);
    const setT = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
    setT(this.el.asset, p.pyeong.toLocaleString());
    setT(this.el.rentHr, `+${formatGold(p.incomePerHour)}/h`);
    const on = this.s.soundOn !== false;
    if (this.el.soundIco && this.el.soundIco.textContent !== (on ? '🔊' : '🔇')) this.el.soundIco.textContent = on ? '🔊' : '🔇';
    if (this.el.soundBtn) {
      this.el.soundBtn.classList.toggle('off', !on);
      this.el.soundBtn.setAttribute('aria-label', on ? '효과음 끄기' : '효과음 켜기');
    }
  }

  syncSound() {
    this.refreshHeader();
  }

  /* ───────────── 📲 앱 설치 (PWA) ───────────── */
  /** app.js 의 설치 상태를 화면에 반영한다 — standalone/설치완료면 헤더·설정 카드를 숨김 */
  syncInstall() {
    const st = (this.app && this.app.install) || {};
    this.install = {
      standalone: !!st.standalone,
      installed: !!st.installed,
      canPrompt: !!st.canPrompt,
      hidden: !!st.standalone || !!st.installed,
    };
    const btn = this.el.installBtn;
    if (btn) {
      btn.classList.toggle('hidden', this.install.hidden);
      btn.classList.toggle('prompt', this.install.canPrompt);
      btn.setAttribute('aria-hidden', this.install.hidden ? 'true' : 'false');
    }
    if (this.tab === 'settings') this.render();
  }

  /** 설치 프롬프트가 없는 환경(인앱 브라우저 등)에서 보여 주는 단계별 안내 */
  showInstallGuide() {
    this.modal({
      title: '📲 홈 화면에 앱으로 설치',
      sub: '주소창 없이 전체 화면으로 열리고, 홈 화면 아이콘으로 바로 시작합니다.',
      body: `<div class="install-steps">
               <div class="step"><b>1</b><span>화면 <b>오른쪽 위 ⋮</b> (또는 <b>≡</b>) 메뉴를 엽니다.</span></div>
               <div class="step"><b>2</b><span><b>삼성 인터넷</b>(또는 <b>Chrome</b>)<b>으로 열기</b>를 선택합니다.<i>카카오톡·네이버 등 인앱 브라우저로 열려 있으면 먼저 이 단계가 필요합니다.</i></span></div>
               <div class="step"><b>3</b><span>주소창의 <b>↓ 아이콘</b>을 누르거나 <b>≡ → 현재 페이지 추가 → 홈 화면</b>을 선택합니다.</span></div>
             </div>
             <div class="note" style="margin-top:10px">설치하면 홈 화면의 <b>⚔️ 영지 RPG</b> 아이콘으로 바로 실행됩니다. 저장 데이터는 그대로 유지됩니다.</div>
             <div class="tiny dim" style="margin-top:7px">아이폰은 Safari에서 <b>공유 → 홈 화면에 추가</b>를 선택하세요.</div>`,
      actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
    });
  }

  refreshPanelLive(now) {
    const s = this.s;
    const b = this.battle;
    const p = portfolioOf(s);
    document.querySelectorAll('[data-live]').forEach((el) => {
      const k = el.dataset.live;
      if (k === 'gold') el.textContent = fmt(s.gold);
      else if (k === 'gold-c') el.textContent = formatGold(s.gold);
      else if (k === 'shards') el.textContent = fmt(s.shards);
      else if (k === 'level') el.textContent = `Lv.${s.level}`;
      else if (k === 'stage') el.textContent = String(s.stage);
      else if (k === 'kill') el.textContent = String(Math.min(ECON.normalKillsPerStage, s.killsInStage));
      else if (k.startsWith('cd-')) {
        const key = k.slice(3);
        const left = Math.max(0, s.skills[key].last + SKILLS[key].cd - now);
        el.style.width = `${(left / SKILLS[key].cd) * 100}%`;
      } else if (k.startsWith('cast-')) {
        const key = k.slice(5);
        const left = Math.max(0, s.skills[key].last + SKILLS[key].cd - now);
        el.textContent = left > 0 ? `${(left / 1000).toFixed(1)}초` : '시전';
        el.disabled = left > 0;
      } else if (k === 'dps') {
        el.textContent = fmt(b ? b.stats.dps : 0);
      } else if (k === 'dungeon-cd') {
        const ds = dungeonState(s, now);
        el.textContent = ds.ready ? '무료 입장 가능' : `무료까지 ${mmss(ds.leftMs)}`;
      } else if (k === 'dungeon-free') {
        const ds = dungeonState(s, now);
        el.disabled = !ds.ready || !!(b && b.dungeon);
      } else if (k === 'dungeon-run') {
        const d = b && b.dungeon;
        const last = s.dungeon && s.dungeon.last;
        el.innerHTML = d
          ? `<b style="color:var(--gold)">진행 중</b> · 남은 ${(Math.max(0, d.ends - now) / 1000).toFixed(1)}초 · 처치 ${d.kills + d.bossKills}`
          : last
            ? `최근 보상 💰${fmt(last.gold)} · 💎${last.shards} · 최고 피해 ${fmt(s.dungeon.best)}`
            : `쿨타임 10분 · 최고 피해 기록 없음`;
      } else if (k === 'rent') {
        el.textContent = `💰${fmt(Math.floor(s.land.accruedRent || 0))}`;
      } else if (k === 'rent-c') {
        el.textContent = formatGold(p.accruedRent);
      } else if (k === 'asset') {
        el.textContent = `💰${formatGold(p.totalAsset)}`;
      } else if (k === 'landvalue') {
        el.textContent = `💰${formatGold(p.landValue)}`;
      } else if (k === 'income') {
        el.textContent = `+💰${formatGold(p.incomePerHour)}/h`;
      }
    });
    // 임대수령 버튼은 적립액에 따라 실시간으로 활성/문구가 바뀐다
    const rentBtn = document.querySelector('[data-live-rent-btn]');
    if (rentBtn) {
      const on = s.land.accruedRent >= 1;
      const label = on ? rentBtn.dataset.label || '수령' : rentBtn.dataset.empty || '쌓이는 중…';
      if (rentBtn.textContent.trim() !== label) rentBtn.textContent = label;
      if (rentBtn.disabled === on) rentBtn.disabled = !on;
      if (rentBtn.dataset.label) { // 부동산 탭 버튼만 색을 바꾼다(사냥 탭 버튼은 ghost 유지)
        rentBtn.classList.toggle('green', on);
        rentBtn.classList.toggle('ghost', !on);
      }
    }
  }

  /* ───────────── 토스트 / 모달 ───────────── */
  toast(msg, kind = '') {
    const div = document.createElement('div');
    div.className = `toast ${kind}`;
    div.innerHTML = msg;
    this.el.toastRoot.appendChild(div);
    setTimeout(() => div.remove(), 2300);
    while (this.el.toastRoot.children.length > 4) this.el.toastRoot.firstChild.remove();
  }

  modal({ title, sub = '', body = '', actions = [], dismissible = true }) {
    this.el.modalCard.innerHTML = `
      <h3>${title}</h3>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
      <div class="modal-body">${body}</div>
      <div class="modal-actions">
        ${actions
          .map(
            (a, i) =>
              `<button class="btn ${a.style || 'ghost'}" data-modal-act="${i}" type="button">${a.label}</button>`,
          )
          .join('')}
      </div>`;
    this.el.modalRoot.classList.remove('hidden');
    this.el.modalCard.querySelectorAll('[data-modal-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.modalAct);
        const act = actions[idx];
        if (!act) return;
        if (act.keepOpen !== true) this.closeModal();
        if (typeof act.onClick === 'function') act.onClick();
      });
    });
    this._dismissible = dismissible;
  }

  closeModal() {
    this.el.modalRoot.classList.add('hidden');
    this.el.modalCard.innerHTML = '';
  }

  addLog(text, kind = '') {
    const item = { t: hhmmss(), text, kind };
    this.logs.unshift(item);
    if (this.logs.length > 40) this.logs.pop();
    const list = document.getElementById('logList');
    if (list && this.tab === 'hunt') {
      const div = document.createElement('div');
      div.className = 'log-item';
      div.innerHTML = `<span class="t">${item.t}</span><span>${text}</span>`;
      list.prepend(div);
      while (list.children.length > 24) list.lastChild.remove();
    }
  }

  hideBoot() {
    this.el.boot.classList.add('out');
    setTimeout(() => { if (this.el.boot.parentNode) this.el.boot.remove(); }, 400);
  }

  /* ───────────── 패널 렌더 ───────────── */
  render() {
    const scroll = this.el.panel.scrollTop;
    const active = document.activeElement;
    const keep = active && active.id === 'landSearch'
      ? { value: active.value, pos: active.selectionStart }
      : null;
    this.el.panelInner.innerHTML = this.template();
    this.el.panel.scrollTop = scroll;
    if (keep) {
      const n = document.getElementById('landSearch');
      if (n) {
        n.focus();
        try { n.setSelectionRange(keep.pos, keep.pos); } catch (e) { /* ignore */ }
      }
    }
    this.lastLive = 0;
    this.refreshHeader();
  }

  /** 레벨업·클리어로 패널을 다시 그릴 필요가 없는 탭(부동산)에서는 건너뛴다. */
  renderIfNeeded() {
    if (this.tab === 'land') return;
    this.render();
  }

  /** 매물 목록만 다시 그린다(검색어 입력 중 포커스 유지) */
  updateLandList() {
    const list = document.getElementById('landList');
    if (!list) {
      this.render();
      return;
    }
    const built = buildMarketList(this);
    list.innerHTML = built.html;
    const c = document.getElementById('landCount');
    if (c) c.textContent = `${built.total}개 지역 · ${built.shown}개 표시 · 가격은 실시간 변동(±30% 일일 밴드)`;
  }

  template() {
    if (this.tab === 'gear') return tplGear(this);
    if (this.tab === 'land') return tplLand(this);
    if (this.tab === 'settings') return tplSettings(this);
    return tplHunt(this);
  }
}

/* ══════════════════════════ ✨ 전직 · 🔥 던전 · 🐾 펫 ══════════════════════════ */
const jobBonusText = (j) =>
  j && (j.atkPct || j.hpPct) ? `공격 +${j.atkPct}% · 체력 +${j.hpPct}%` : '기본 성능';

function jobCard(ui) {
  const s = ui.s;
  const pr = jobProgress(s);
  const cur = pr.cur;
  const n = pr.next;

  if (!n) {
    return `
  <div class="card job-card done">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">${cur.badge}</span>${esc(cur.name)}<small>최종 전직</small></div>
      <span class="job-badge" style="--jc:${cur.color}">${jobBonusText(cur)}</span>
    </div>
    <div class="tiny muted">${esc(cur.line)}</div>
    <div class="note" style="margin-top:8px">전직 ${cur.tier + 1}/4 완료 · 영구 <b>공격 +${cur.atkPct}% · 체력 +${cur.hpPct}%</b> 적용 중</div>
  </div>`;
  }

  return `
  <div class="card job-card ${pr.canPromote ? 'ready' : ''}">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">${cur.badge}</span>${esc(cur.name)}<small>전직 ${cur.tier + 1}/4</small></div>
      <span class="job-badge" style="--jc:${cur.color}">${jobBonusText(cur)}</span>
    </div>
    <div class="row" style="margin-top:2px">
      <span class="tiny muted">다음 <b style="color:${n.color}">${n.badge} ${esc(n.name)}</b></span>
      <span class="tiny dim">${jobBonusText(n)}</span>
    </div>
    <div class="row tiny" style="margin-top:7px">
      <span style="color:${pr.levelOk ? 'var(--green)' : 'var(--sub)'}">Lv.${s.level} / ${n.lv}</span>
      <span style="color:${pr.stageOk ? 'var(--green)' : 'var(--sub)'}">스테이지 ${s.maxStage} / ${n.stage}</span>
    </div>
    <div class="prog" style="margin-top:5px"><i style="width:${Math.min(pr.pctLv, pr.pctStage) * 100}%"></i></div>
    ${pr.canPromote
      ? `<button class="btn primary block promote-btn" data-action="promote" style="margin-top:9px" data-live="promote">✨ 전직 가능! ${n.badge} ${esc(n.name)}</button>`
      : `<div class="note" style="margin-top:8px">${esc(pr.reason)} · 조건을 채우면 <b>✨ 전직 가능!</b> 버튼이 나타납니다.</div>`}
  </div>`;
}

function dungeonCard(ui) {
  const s = ui.s;
  const b = ui.battle;
  const now = Date.now();
  const ds = dungeonState(s, now);
  const d = b && b.dungeon;
  const last = s.dungeon && s.dungeon.last;
  return `
  <div class="card dungeon-card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🔥</span>황금 던전<small>보스 러시 30초</small></div>
      <span class="tiny" style="color:var(--gold)" data-live="dungeon-cd">${ds.ready ? '무료 입장 가능' : `무료까지 ${mmss(ds.leftMs)}`}</span>
    </div>
    <div class="tiny muted">30초 동안 몰려오는 황금 몹과 보스를 때려 <b>대량 골드 + 강화석</b>을 즉시 받습니다. 끝나면 원래 스테이지 자동사냥으로 복귀합니다.</div>
    <div class="row gap6" style="margin-top:9px">
      <button class="btn small ${ds.ready ? 'primary' : 'ghost'} wide" data-action="dungeon" data-value="free" data-live="dungeon-free" ${ds.ready && !d ? '' : 'disabled'}>🔥 무료 입장</button>
      <button class="btn small blue wide" data-action="dungeon" data-value="shards" ${!d && ds.canPay ? '' : 'disabled'}>💎${DUNGEON.shardCost} 즉시 입장</button>
    </div>
    <div class="tiny dim" style="margin-top:7px" data-live="dungeon-run">${
      d
        ? `<b style="color:var(--gold)">진행 중</b> · 남은 ${(Math.max(0, d.ends - now) / 1000).toFixed(1)}초 · 처치 ${d.kills + d.bossKills}`
        : last
          ? `최근 보상 💰${fmt(last.gold)} · 💎${last.shards} · 최고 피해 ${fmt(s.dungeon.best)}`
          : '쿨타임 10분 · 최고 피해 기록 없음'
    }</div>
  </div>`;
}

function petCard(ui) {
  const s = ui.s;
  const ps = s.pet || { equipped: null, unlocked: [] };
  const unlockedIds = Array.isArray(ps.unlocked) ? ps.unlocked : [];
  const equipped = petDef(ps.equipped);

  const rows = PETS.map((def) => {
    const unlocked = unlockedIds.includes(def.id);
    const on = ps.equipped === def.id;
    const pr = petProgress(s, def.id);
    const lv = petLevel(s, def.id);
    const cost = petUpgradeCost(lv);
    const maxed = lv >= PET_MAX_LV;
    return `
      <div class="pet-row ${on ? 'on' : ''} ${unlocked ? '' : 'lock'}">
        <img class="pet-thumb" src="assets/sprites/pet/${def.sprite}.png" alt="" loading="lazy">
        <div class="pet-mid">
          <div class="pet-name">${def.emoji} ${esc(def.name)}<span class="lv">Lv.${lv}</span>${on ? '<span class="pet-on">동행 중</span>' : ''}</div>
          <div class="pet-desc">${esc(def.desc)}</div>
          <div class="pet-stats">공격 ${Math.round(petDmgPct(s, def.id) * 100)}% · 공격력 +${petAtkPct(s, def.id)}%${def.goldPct ? ` · 골드 +${def.goldPct}%` : ''}</div>
          ${unlocked ? '' : `<div class="pet-cond">🔒 ${esc(def.cond)} · ${pr.text}</div><div class="prog tiny-prog"><i style="width:${pr.pct * 100}%"></i></div>`}
        </div>
        <div class="s-actions pet-acts">
          ${on
            ? '<button class="mini on" type="button" disabled>동행</button>'
            : unlocked
              ? `<button class="mini equip" type="button" data-action="pet-equip" data-value="${def.id}">교체</button>`
              : '<button class="mini" type="button" disabled>잠김</button>'}
          ${unlocked
            ? maxed
              ? '<button class="mini" type="button" disabled>MAX</button>'
              : `<button class="mini up" type="button" data-action="pet-upgrade" data-value="${def.id}" ${s.shards < cost ? 'disabled' : ''}>💎${cost}</button>`
            : ''}
        </div>
      </div>`;
  }).join('');

  return `
  <div class="card pet-card" id="petCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🐾</span>내 동료 펫<small>${unlockedIds.length}/${PETS.length} 해금</small></div>
      <span class="tiny dim">${equipped ? `동행 ${equipped.emoji} ${esc(equipped.name)}` : '동행 없음'}</span>
    </div>
    ${rows}
    <div class="note" style="margin-top:9px">
      부동산이 자라면 <b>자동 해금</b>됩니다. 장착한 펫은 <b>1.5초마다 함께 공격</b>하고, 동행 중에는 패시브가 적용됩니다.
      강화(💎) 1단계마다 함께 공격·공격력 패시브가 <b>+10%</b>씩 오릅니다(최대 Lv.${PET_MAX_LV}).
    </div>
  </div>`;
}

/* ══════════════════════════ 사냥/스킬 ══════════════════════════ */
function tplHunt(ui) {
  const s = ui.s;
  const b = ui.battle;
  const st = b.stats;
  const buffs = ui.app.buffs || {};
  const remain = Math.max(0, (b.boss ? ECON.normalKillsPerStage : ECON.normalKillsPerStage - s.killsInStage));
  const ready = s.bossReady && !b.boss;
  const p = portfolioOf(s);

  const stat = (cls, k, v, unit = '') => `
    <div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}${unit ? `<small>${unit}</small>` : ''}</div></div>`;

  const skillRows = Object.entries(SKILLS)
    .map(([key, def]) => {
      const sk = s.skills[key];
      const power = skillEffect(key, sk.lv);
      const detail =
        key === 'strike' || key === 'whirl'
          ? `위력 ${Math.round(power * 100)}%`
          : key === 'berserk'
            ? `공격력 +${Math.round(power * 100)}% · ${def.dur / 1000}초`
            : `체력 ${Math.round(power * 100)}% 회복`;
      const cost = skillCost(sk.lv);
      const maxed = sk.lv >= 20;
      return `
      <div class="skill-row">
        <div class="s-ico" style="color:${def.color}">${def.icon}</div>
        <div class="s-mid">
          <div class="s-name">${def.name}<span class="lv">Lv.${sk.lv}</span></div>
          <div class="s-desc">${detail} · 재사용 ${def.cd / 1000}s</div>
          <div class="cd-bar"><i data-live="cd-${key}"></i></div>
        </div>
        <div class="s-actions">
          <button class="btn small ghost" data-action="cast" data-value="${key}" data-live="cast-${key}">시전</button>
          <button class="btn small ${maxed ? 'ghost' : 'blue'}" data-action="upgrade-skill" data-value="${key}" ${maxed || s.shards < cost ? 'disabled' : ''}>
            ${maxed ? 'MAX' : `💎${cost}`}
          </button>
        </div>
      </div>`;
    })
    .join('');

  const buffLine =
    buffs.active
      ? `<div class="tiny" style="margin-top:9px;color:var(--green)">🏢 건물주 버프 · 공격 +${buffs.atkPct}% · 골드 +${buffs.goldPct}% · 체력 +${buffs.hpPct}% · 치명타 +${buffs.critPct}% · 드롭 +${buffs.dropPct}%</div>`
      : `<div class="tiny dim" style="margin-top:9px">🏢 부동산을 사면 영구 버프가 붙습니다. <b style="color:var(--gold)">부동산 탭 → 매물 투자</b></div>`;

  const logs = ui.logs.length
    ? ui.logs
        .slice(0, 20)
        .map((l) => `<div class="log-item"><span class="t">${l.t}</span><span>${l.text}</span></div>`)
        .join('')
    : `<div class="log-item"><span class="t">—</span><span class="dim">아직 기록이 없습니다.</span></div>`;

  return `
  ${jobCard(ui)}
  ${dungeonCard(ui)}

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🗺️</span>${esc(b.def.themeName)} 사냥터<small>Lv.${s.level}</small></div>
      <span class="tiny dim">스테이지 <b data-live="stage" style="color:var(--txt)">${s.stage}</b></span>
    </div>
    <div class="row gap8">
      <div class="grow">
        <div class="tiny muted" style="margin-bottom:5px">
          ${ready ? '<b style="color:var(--gold)">보스 도전 준비 완료!</b>' : `보스까지 <b>${remain}</b>마리`}
          <span class="dim"> · 총 처치 ${fmt(s.totalKills)}</span>
        </div>
        <div class="prog"><i style="width:${(Math.min(ECON.normalKillsPerStage, s.killsInStage) / ECON.normalKillsPerStage) * 100}%"></i></div>
      </div>
      <button class="btn small ${ready ? 'primary' : 'ghost'}" data-action="boss" ${ready ? '' : 'disabled'}>
        ${b.boss ? '보스 전투 중' : '보스 도전'}
      </button>
    </div>
    <div class="row" style="margin-top:10px">
      <span class="tiny muted">10마리 처치마다 자동 보스</span>
      <button class="switch ${s.autoBoss ? 'on' : ''}" data-action="toggle-auto" aria-label="자동 보스 전환"></button>
    </div>
  </div>

  <div class="card land-hint">
    <div class="row">
      <div class="lh-label">내 부동산 · ${p.cities}곳 ${fmt(p.pyeong)}평</div>
      <span class="tiny" style="color:var(--gold)" data-live="income">+💰${formatGold(p.incomePerHour)}/h</span>
    </div>
    <div class="row" style="margin-top:4px">
      <span class="tiny dim">미수령 임대수익 <b data-live="rent" style="color:var(--green)">💰${fmt(Math.floor(p.accruedRent))}</b></span>
      <button class="btn small ghost" data-action="claim-rent" data-live-rent-btn ${p.accruedRent >= 1 ? '' : 'disabled'}>수령</button>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">📊</span>전투 스탯</div>
      <span class="tiny dim">예상 DPS <b data-live="dps" style="color:var(--sub)">${fmt(st.dps)}</b></span>
    </div>
    <div class="stat-grid">
      ${stat('atk', '공격력', fmt(st.atk))}
      ${stat('hp', '최대 체력', fmt(st.hpMax))}
      ${stat('crit', '치명타', (st.crit * 100).toFixed(1), '%')}
      ${stat('gold', '골드 획득', `+${Math.round((st.goldMult - 1) * 100)}`, '%')}
      ${stat('', '강화석 드롭', `+${Math.round((st.dropMult - 1) * 100)}`, '%')}
      ${stat('', '공격 속도', (1000 / st.attackMs).toFixed(2), '회/초')}
    </div>
    ${buffLine}
  </div>

  ${petCard(ui)}

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">✨</span>스킬 <small>자동 시전</small></div>
      <span class="tiny dim">💎 <b data-live="shards">${fmt(s.shards)}</b></span>
    </div>
    ${skillRows}
    <div class="note" style="margin-top:9px">스킬은 쿨타임마다 자동으로 나갑니다. 터치하면 즉시 시전(수동).</div>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">📜</span>전투 기록</div><span class="tiny dim">최근 20</span></div>
    <div class="log-list" id="logList">${logs}</div>
  </div>`;
}

/* ══════════════════════════ 장비/강화 ══════════════════════════ */
const rarityBadge = (id) => {
  const r = RARITIES[RARITY_INDEX[id] || 0];
  return `<span class="rb ${r.id}">${r.name}</span>`;
};

const rarityName = (id) => (RARITIES[RARITY_INDEX[id] || 0] || RARITIES[0]).name;

function gachaCard(ui) {
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

  const equipped = Object.entries(EQUIP)
    .map(([slot, def]) => `<span class="eq-chip">${def.icon}${rarityBadge(s.gearRarity[slot])}</span>`)
    .join('');

  const rates = RARITIES.map(
    (r) => `<span class="rate-chip"><span class="rb ${r.id}">${r.name}</span><b>${r.weight}%</b></span>`,
  ).join('');

  return `
  <div class="card gacha-card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🎁</span>장비 뽑기 <small>일반 → 전설</small></div>
      <span class="tiny dim">최고 <b style="color:var(--gold)">${rarityName(g.best)}</b></span>
    </div>
    <div class="rates">${rates}</div>
    <div class="row" style="margin-top:8px">
      <span class="tiny muted">천장까지 <b style="color:var(--gold)">${left}회</b> <span class="dim">· ${GACHA.pityLegend}회 내 전설 확정</span></span>
      <span class="tiny dim">누적 ${fmt(g.total)}회</span>
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
    <div class="equipped">${equipped}</div>
    <div class="note" style="margin-top:9px">
      더 높은 등급은 <b>자동 장착</b>, 중복·교체된 장비는 <b>강화석으로 자동 분해</b>됩니다.
      등급은 강화 레벨에 <b>보정</b>으로 더해지고, 발밑 <b>오라</b>와 <b>검기 색</b>이 장착 등급을 따라갑니다.
    </div>
  </div>`;
}

function tplGear(ui) {
  const s = ui.s;
  const st = ui.battle.stats;
  const total = Object.values(s.equip).reduce((a, b) => a + b, 0);
  const price = shardPrice(s);
  const maxShards = Math.floor(s.gold / price);

  const rows = Object.entries(EQUIP)
    .map(([slot, def]) => {
      const lv = s.equip[slot];
      const rid = s.gearRarity[slot];
      const bonus = rarityBonusLv(rid);
      const maxed = lv >= EQUIP_MAX_LV;
      const cost = enhanceCost(lv);
      const effLv = lv + bonus;
      const cur = def.per * effLv;
      const next = def.per * (effLv + 1);
      const unitText = (v) => (slot === 'ring' ? `${v.toFixed(1)}%` : slot === 'amulet' ? `+${Math.round(v)}%` : `+${fmt(v)}`);
      return `
      <div class="gear-row">
        <div class="g-ico">${def.icon}</div>
        <div class="g-mid">
          <div class="g-name">${def.name}${rarityBadge(rid)}<span class="lv">+${lv}</span></div>
          <div class="g-stat">${def.stat} ${unitText(cur)}${maxed ? ' · 최대' : ` → <b style="color:var(--green)">${unitText(next)}</b>`}</div>
          ${bonus > 0 ? `<div class="g-rar">등급 보정 +${bonus}강 상당</div>` : ''}
        </div>
        <div class="s-actions">
          <button class="btn small blue" data-action="enhance" data-slot="${slot}" ${maxed || s.shards < cost ? 'disabled' : ''}>
            ${maxed ? 'MAX' : `💎${cost}`}
          </button>
          <button class="btn small ghost" data-action="enhance10" data-slot="${slot}" ${maxed ? 'disabled' : ''}>×10</button>
        </div>
      </div>`;
    })
    .join('');

  return `
  ${gachaCard(ui)}

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🎒</span>장비 강화 <small>5부위</small></div>
      <span class="tiny dim">총 강화 <b style="color:var(--txt)">${total}</b>/${EQUIP_MAX_LV * 5}</span>
    </div>
    <div class="row gap8">
      <div class="stat gold grow" style="margin:0">
        <div class="k">보유 강화석</div>
        <div class="v">💎 <span data-live="shards">${fmt(s.shards)}</span></div>
      </div>
      <div class="stat atk grow" style="margin:0">
        <div class="k">현재 공격력 / 체력</div>
        <div class="v">${fmt(st.atk)} <small>/ ${fmt(st.hpMax)}</small></div>
      </div>
    </div>
    <div style="margin-top:10px">${rows}</div>
    <div class="note" style="margin-top:10px">
      강화는 <b>실패 없이 100% 성공</b>합니다. 강화석은 사냥 드롭·보스 처치·스테이지 클리어·뽑기 분해로 모입니다.
      ${s.equip.ring === 0 ? '<br>반지는 치명타 확률, 부적은 골드 획득량을 올립니다.' : ''}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">📈</span>부위별 효과</div><span class="tiny dim">등급 보정 포함</span></div>
    <div class="kv"><span class="k">⚔️ 무기</span><span class="v">공격력 +${EQUIP.weapon.per}/강화</span></div>
    <div class="kv"><span class="k">🛡️ 갑옷</span><span class="v">체력 +${EQUIP.armor.per}/강화</span></div>
    <div class="kv"><span class="k">🪖 투구</span><span class="v">체력 +${EQUIP.helmet.per}/강화</span></div>
    <div class="kv"><span class="k">💍 반지</span><span class="v">치명타 +${EQUIP.ring.per}%/강화</span></div>
    <div class="kv"><span class="k">🧿 부적</span><span class="v">골드 +${EQUIP.amulet.per}%/강화</span></div>
    <div class="kv"><span class="k">🏅 등급 보정</span><span class="v">일반 +0 · 고급 +4 · 레어 +9 · 영웅 +16 · 전설 +25강</span></div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">💱</span>강화석 구매 <small>골드 → 💎</small></div>
      <span class="tiny dim">시세 💰${fmt(price)}/개</span>
    </div>
    <div class="row tiny" style="margin-bottom:8px">
      <span class="muted">보유 골드 <b data-live="gold" style="color:var(--gold)">${fmt(s.gold)}</b></span>
      <span class="dim">최대 ${fmt(maxShards)}개</span>
    </div>
    <div class="chips">
      ${[1, 10, 50].filter((n) => price * n <= s.gold).map((n) => `<button class="chip" data-action="buy-shards" data-value="${n}">${n}개 · 💰${fmt(price * n)}</button>`).join('')}
      <button class="chip" data-action="buy-shards" data-value="max" ${maxShards > 0 ? '' : 'disabled'}>최대 ${fmt(maxShards)}개</button>
    </div>
    <div class="note" style="margin-top:9px">
      임대수익으로 모은 골드를 강화석으로 바꿔 장비를 올릴 수 있습니다. 시세는 <b>현재 스테이지 사냥 기대값</b>을 따라 오르내립니다.
    </div>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">🏢</span>골드 쓰는 곳</div><span class="tiny dim">통합 경제</span></div>
    <div class="tiny muted" style="line-height:1.7">
      사냥으로 모은 <b>골드</b>는 전국 229개 시군구 <b>매물</b>을 사는 데 그대로 쓰입니다.
      보유 매물은 <b>임대수익(골드)</b>과 <b>건물주 영구 버프</b>를 돌려줍니다.
    </div>
    <button class="btn green block" style="margin-top:10px" data-action="tab" data-value="land">🏢 부동산 보러 가기</button>
  </div>`;
}

/* ══════════════════════════ 부동산 ══════════════════════════ */

const paybackText = (hours) => {
  if (!isFinite(hours) || hours <= 0) return '—';
  const min = hours * 60;
  if (min < 90) return `${Math.max(1, Math.round(min))}분`;
  if (hours < 48) return `${hours.toFixed(1)}시간`;
  return `${Math.round(hours / 24)}일`;
};

const trendHtml = (t) => {
  const up = t >= 0;
  const v = Math.abs(t);
  return `<span class="trend ${up ? 'up' : 'down'}">${up ? '▲' : '▼'}${v.toFixed(1)}%</span>`;
};

const TRAIT_VIEW = {
  CHEAP_BUILD: { icon: '🔨', n: '건축 특구' },
  HIGH_TAX: { icon: '💰', n: '세무 도시' },
  GROWTH: { icon: '🚀', n: '성장' },
  SAFE_HAVEN: { icon: '🛡️', n: '안전' },
  FREE_TRADE: { icon: '🤝', n: '자유 무역' },
  TOURISM_HUB: { icon: '🏖️', n: '관광' },
  TECH_VALLEY: { icon: '💻', n: '테크' },
};

const traitBadge = (key) => {
  const info = key && TRAIT_VIEW[key];
  return info ? `<span class="tag">${info.icon} ${info.n}</span>` : '';
};

function landTabBar(ui) {
  const sub = (ui.s.land && ui.s.land.sub) || 'home';
  const tabs = [
    ['home', '🏠 내 부동산'],
    ['market', '🛒 매물 투자'],
    ['buff', '⚡ 건물주 버프'],
  ];
  return `<div class="subtabs">${tabs
    .map(([k, l]) => `<button class="subtab ${sub === k ? 'active' : ''}" data-action="land-sub" data-value="${k}">${l}</button>`)
    .join('')}</div>`;
}

function tplLand(ui) {
  const sub = (ui.s.land && ui.s.land.sub) || 'home';
  if (sub === 'market') return landTabBar(ui) + tplLandMarket(ui);
  if (sub === 'buff') return landTabBar(ui) + tplLandBuff(ui);
  return landTabBar(ui) + tplLandHome(ui);
}

/* ───────────── 🏠 내 부동산 ───────────── */
function tplLandHome(ui) {
  const s = ui.s;
  const p = portfolioOf(s);
  const buffs = computeBuffs(s);

  const holdings = p.holdings.length
    ? p.holdings
        .map((h) => {
          const payback = h.incomePerHour > 0 ? h.value / h.incomePerHour : 0;
          return `<div class="hold">
            <div class="h-ico">${h.city.emoji}</div>
            <div class="h-mid">
              <div class="h-name">${esc(h.city.name)}<span class="h-region">${esc(h.city.region)}</span>${traitBadge(h.city.trait)}</div>
              <div class="h-line"><b>${fmt(h.qty)}평</b><span class="dim"> · ${trendHtml(h.trend)}</span></div>
              <div class="h-line dim">평가 💰${formatGold(h.value)} · 시간 +💰${formatGold(h.incomePerHour)} · 회수 ${paybackText(payback)}</div>
            </div>
            <div class="m-btns">
              <button class="mini buy" data-action="land-trade" data-value="${h.city.key}" data-side="buy">매수</button>
              <button class="mini sell" data-action="land-trade" data-value="${h.city.key}" data-side="sell">매도</button>
            </div>
          </div>`;
        })
        .join('')
    : `<div class="empty">아직 보유한 매물이 없습니다.<br>
         <button class="btn small blue" style="margin-top:8px" data-action="land-sub" data-value="market">매물 투자 하러 가기</button>
       </div>`;

  return `
  <div class="card land-hero">
    <div class="row">
      <div class="lh-label">내 총자산 (골드 + 매물)</div>
      <span class="tiny dim">게스트</span>
    </div>
    <div class="lh-total" data-live="asset">💰${formatGold(p.totalAsset)}</div>
    <div class="lh-sub">보유 골드 <b data-live="gold">${fmt(p.gold)}</b> · 매물 평가 <b data-live="landvalue">💰${formatGold(p.landValue)}</b></div>
    <div class="lgrid">
      <div><span>보유 지역</span><b>${p.cities}곳</b></div>
      <div><span>총 면적</span><b>${fmt(p.pyeong)}평</b></div>
      <div><span>시간당 임대</span><b class="gold" data-live="income">+💰${formatGold(p.incomePerHour)}</b></div>
      <div><span>최고 자산</span><b>💰${formatGold(Math.max(p.land.bestAsset || 0, p.totalAsset))}</b></div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">💤</span>미수령 임대수익</div>
      <span class="tiny dim">시간 +💰${formatGold(p.incomePerHour)}</span>
    </div>
    <div class="rent-num" data-live="rent">💰${fmt(Math.floor(p.accruedRent))}</div>
    <button class="btn ${p.accruedRent >= 1 ? 'green' : 'ghost'} block" style="margin-top:8px" data-action="claim-rent" data-live-rent-btn data-label="임대수익 수령" data-empty="쌓이는 중…" ${p.accruedRent >= 1 ? '' : 'disabled'}>
      ${p.accruedRent >= 1 ? '임대수익 수령' : '쌓이는 중…'}
    </button>
    <div class="note" style="margin-top:9px">
      접속 중에는 <b>100%</b>, 앱을 닫아둔 동안은 <b>${Math.round(LAND.rentOfflineRate * 100)}%</b>(최대 ${LAND.rentCapHours}시간)만 적립됩니다.
      수령한 골드는 바로 추가 매수·장비 강화에 쓸 수 있습니다.
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏘️</span>보유 매물</div>
      <span class="tiny dim">${p.holdings.length}건 · ${fmt(p.pyeong)}평</span>
    </div>
    ${holdings}
    <div class="row gap6" style="margin-top:10px">
      <button class="btn small ghost wide" data-action="land-sub" data-value="market">매물 투자</button>
      <button class="btn small ghost wide" data-action="land-sub" data-value="buff">건물주 버프</button>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">📋</span>거래 기록</div><span class="tiny dim">거래세 ${(LAND.feeRate * 100).toFixed(1)}%</span></div>
    <div class="kv"><span class="k">거래 횟수</span><span class="v">${fmt(p.land.tradeCount || 0)}회</span></div>
    <div class="kv"><span class="k">누적 거래세</span><span class="v">💰${formatGold(p.land.taxPaid || 0)}</span></div>
    <div class="kv"><span class="k">누적 수령 임대</span><span class="v gold">💰${formatGold(p.land.totalRentClaimed || 0)}</span></div>
    <div class="kv"><span class="k">건물주 버프</span><span class="v" style="color:${buffs.active ? 'var(--green)' : 'var(--dim)'}">${buffs.active ? '적용 중' : '없음'}</span></div>
  </div>`;
}

/* ───────────── 🛒 매물 투자 ───────────── */
function buildMarketList(ui) {
  const s = ui.s;
  const owned = s.land.owned || {};
  const now = Date.now();
  const q = String(s.land.q || '').trim();
  const tier = s.land.tier || 'all';
  const sort = s.land.sort || 'roi';
  const page = Math.max(1, Math.floor(Number(s.land.page) || 1));

  const rows = [];
  for (const c of CITIES) {
    const held = Math.floor(Number(owned[c.key]) || 0);
    if (tier === 'owned') {
      if (held <= 0) continue;
    } else if (tier !== 'all' && String(c.tier) !== String(tier)) continue;
    if (q && !(c.name.includes(q) || c.region.includes(q) || c.tierLabel.includes(q))) continue;
    const info = priceInfo(c, now);
    const hourlyPerPyeong = c.rentPerMin * 60;
    rows.push({ c, info, held, hourlyPerPyeong, payback: hourlyPerPyeong > 0 ? info.price / hourlyPerPyeong : 0 });
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
        .map(({ c, info, held, hourlyPerPyeong, payback }) => {
          const seasonal = info.season ? traitBadge(info.season) : '';
          const remain = Math.max(0, c.supply - held);
          const affordable = gold >= info.price;
          const onePyeongIncome = c.rentPerMin * 60;
          return `<div class="mkt">
            <div class="m-ico">${c.emoji}</div>
            <div class="m-mid">
              <div class="m-name">${esc(c.name)}<span class="m-region">${esc(c.region)}</span>${traitBadge(c.trait)}${seasonal}</div>
              <div class="m-line"><b>💰${fmt(info.price)}</b><span class="dim">/평</span> ${trendHtml(info.trend)}</div>
              <div class="m-line dim">평당 시간 +💰${fmt(onePyeongIncome)} · 회수 ${paybackText(c.base / hourlyPerPyeong)}${held > 0 ? ` · <b class="own">보유 ${fmt(held)}평</b>` : ''}</div>
              <div class="m-line dim">잔여 ${fmt(remain)}평${!affordable ? ' · <span style="color:var(--dim)">골드 부족</span>' : ''}</div>
            </div>
            <div class="m-btns">
              <button class="mini buy" data-action="land-trade" data-value="${c.key}" data-side="buy" ${affordable ? '' : 'disabled'}>매수</button>
              <button class="mini sell" data-action="land-trade" data-value="${c.key}" data-side="sell" ${held > 0 ? '' : 'disabled'}>매도</button>
            </div>
          </div>`;
        })
        .join('') + (shown.length < rows.length
      ? `<button class="btn small ghost block" style="margin-top:10px" data-action="land-more">더 보기 (${shown.length}/${rows.length})</button>`
      : '')
    : `<div class="empty">조건에 맞는 매물이 없습니다.</div>`;

  return { total: rows.length, shown: shown.length, html };
}

function tplLandMarket(ui) {
  const s = ui.s;
  const tier = s.land.tier || 'all';
  const sort = s.land.sort || 'roi';
  const list = buildMarketList(ui);

  const chips = [
    ['all', '전체'],
    ['0', '군'],
    ['1', '시'],
    ['2', '구'],
    ['owned', '보유'],
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
  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🛒</span>매물 투자</div>
      <span class="tiny dim">보유 골드 <b class="gold" data-live="gold">${fmt(s.gold)}</b></span>
    </div>
    <div class="srch">
      <span>🔎</span>
      <input id="landSearch" type="text" inputmode="search" autocomplete="off" placeholder="지역·시군구 검색 (예: 강남, 경기권)" value="${esc(s.land.q || '')}">
    </div>
    <div class="chips" style="margin-top:8px">${chips}</div>
    <div class="chips" style="margin-top:5px">${sorts}</div>
    <div class="tiny dim" style="margin-top:8px" id="landCount">${list.total}개 지역 · ${list.shown}개 표시 · 가격은 실시간 변동(±30% 일일 밴드)</div>
  </div>

  <div class="card" style="padding-top:2px" id="landList">${list.html}</div>

  <div class="note">
    매수·매도는 같은 <b>골드</b>로 바로 됩니다. 거래세 ${(LAND.feeRate * 100).toFixed(1)}%,
    한 지역 지분이 커질수록 평당 수익이 줄어드는 원작 규칙 그대로입니다.
  </div>`;
}

/* ───────────── ⚡ 건물주 버프 ───────────── */
function tplLandBuff(ui) {
  const s = ui.s;
  const buffs = computeBuffs(s);
  const pr = buffProgress(s);

  const rows = [
    ['⚔️ 공격력', buffs.atkPct, pr.atk, '보유 지역 1곳당 +1.5%'],
    ['💰 골드 획득', buffs.goldPct, pr.gold, '매물 평가액이 커질수록'],
    ['❤️ 최대 체력', buffs.hpPct, pr.hp, '보유 200평당 +1%'],
    ['🎯 치명타', buffs.critPct, pr.crit, '보유 지역 2곳당 +0.2%'],
    ['💎 드롭률', buffs.dropPct, pr.drop, '보유 1,000평당 +1%'],
  ]
    .map(
      ([label, val, p, hint]) => `
      <div class="buff-row">
        <div class="buff-head"><b>${label}</b><span>+${Number(val).toFixed(1)}%</span></div>
        <div class="prog" style="margin-top:5px"><i style="width:${p.pct * 100}%"></i></div>
        <div class="buff-next">${esc(p.next)} <span class="dim">· ${hint}</span></div>
      </div>`,
    )
    .join('');

  return `
  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">⚡</span>건물주 버프</div>
      <span class="tiny dim">${buffs.active ? '적용 중' : '미적용'}</span>
    </div>
    ${rows}
    <div class="note" style="margin-top:9px">
      부동산 → RPG 는 <b>영구 패시브</b>입니다. 매물을 사는 즉시 캐릭터에 반영되고, 팔면 그만큼 줄어듭니다.
    </div>
    <button class="btn blue block" style="margin-top:10px" data-action="land-sub" data-value="market">매물 더 사러 가기</button>
  </div>

  ${petCard(ui)}

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">🧮</span>현재 적용 수치</div></div>
    <div class="kv"><span class="k">보유 지역</span><span class="v">${buffs.cities}곳</span></div>
    <div class="kv"><span class="k">보유 면적</span><span class="v">${fmt(buffs.totalPyeong)}평</span></div>
    <div class="kv"><span class="k">매물 평가액</span><span class="v">💰${formatGold(buffs.landValue)}</span></div>
    <div class="kv"><span class="k">공격력</span><span class="v" style="color:var(--green)">+${buffs.atkPct}%</span></div>
    <div class="kv"><span class="k">골드 획득</span><span class="v" style="color:var(--green)">+${buffs.goldPct}%</span></div>
    <div class="kv"><span class="k">최대 체력</span><span class="v" style="color:var(--green)">+${buffs.hpPct}%</span></div>
    <div class="kv"><span class="k">치명타</span><span class="v" style="color:var(--green)">+${buffs.critPct}%</span></div>
    <div class="kv"><span class="k">드롭률</span><span class="v" style="color:var(--green)">+${buffs.dropPct}%</span></div>
  </div>`;
}

/* ══════════════════════════ 설정 ══════════════════════════ */
function installCard(ui) {
  const st = ui.install;
  if (!st || st.hidden) return '';
  return `
  <div class="card install-card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">📲</span>홈 화면에 앱으로 설치<small>${st.canPrompt ? '원클릭 설치' : '방법 안내'}</small></div>
    </div>
    <div class="tiny muted">주소창 없이 전체 화면으로 실행되고, 홈 화면 아이콘으로 바로 시작합니다. 오프라인에서도 동작합니다.</div>
    <button class="btn primary block" style="margin-top:9px" data-action="install">📲 ${st.canPrompt ? '한 번에 앱으로 설치' : '앱으로 설치하는 방법'}</button>
    <div class="tiny dim" style="margin-top:7px">설치 창이 뜨지 않으면 삼성 인터넷·Chrome 메뉴에서 <b>현재 페이지 추가 → 홈 화면</b>을 선택하세요.</div>
  </div>`;
}

function tplSettings(ui) {
  const s = ui.s;
  const mins = Math.floor((s.records.playMs || 0) / 60000);
  const p = portfolioOf(s);

  return `
  ${installCard(ui)}
  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">🏆</span>내 기록</div><span class="tiny dim">게스트</span></div>
    <div class="stat-grid">
      <div class="stat atk"><div class="k">최고 스테이지</div><div class="v">S${s.maxStage}</div></div>
      <div class="stat hp"><div class="k">총 처치</div><div class="v">${fmt(s.totalKills)}</div></div>
      <div class="stat crit"><div class="k">보스 처치</div><div class="v">${fmt(s.bossKills)}</div></div>
      <div class="stat gold"><div class="k">누적 사냥 골드</div><div class="v">${formatGold(s.records.totalGold || 0)}</div></div>
      <div class="stat"><div class="k">플레이 시간</div><div class="v">${mins < 60 ? `${mins}분` : `${Math.floor(mins / 60)}시간 ${mins % 60}분`}</div></div>
      <div class="stat"><div class="k">총자산</div><div class="v">💰${formatGold(p.totalAsset)}</div></div>
      <div class="stat gold"><div class="k">뽑기 횟수</div><div class="v">${fmt((s.gacha && s.gacha.total) || 0)}회</div></div>
      <div class="stat crit"><div class="k">최고 장비 등급</div><div class="v">${rarityName((s.gacha && s.gacha.best) || 'common')}</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">⚙️</span>설정</div><span class="tiny dim">v${APP_VERSION}</span></div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">자동 보스 전환</span>
      <button class="switch ${s.autoBoss ? 'on' : ''}" data-action="toggle-auto"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">화면 이펙트</span>
      <button class="switch ${s.effects ? 'on' : ''}" data-action="toggle-effects"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">효과음 <span class="dim">타격·코인·보스·뽑기</span></span>
      <button class="switch ${s.soundOn !== false ? 'on' : ''}" data-action="toggle-sound" aria-label="효과음 전환"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">저장 방식</span>
      <span class="tiny" style="color:var(--gold)">이 기기에 자동 저장 (로그인 없음)</span>
    </div>
    <button class="btn small block" style="margin-top:10px;color:#ffb3b3;border-color:rgba(255,107,107,0.3)" data-action="reset">게임 초기화</button>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">ℹ️</span>앱 정보</div></div>
    <div class="kv"><span class="k">버전</span><span class="v">${APP_VERSION} · 게스트 통합</span></div>
    <div class="kv"><span class="k">전직</span><span class="v">${jobOf(s).badge} ${esc(jobOf(s).name)}</span></div>
    <div class="kv"><span class="k">동료 펫</span><span class="v">${petDef(s.pet && s.pet.equipped) ? `${petDef(s.pet.equipped).emoji} ${esc(petDef(s.pet.equipped).name)}` : '없음'}</span></div>
    <div class="kv"><span class="k">황금 던전</span><span class="v">${fmt((s.dungeon && s.dungeon.runs) || 0)}회 · 최고 피해 ${fmt((s.dungeon && s.dungeon.best) || 0)}</span></div>
    <div class="kv"><span class="k">장비</span><span class="v">5부위 강화 + 등급 뽑기</span></div>
    <div class="kv"><span class="k">경제</span><span class="v">골드 하나 (사냥 = 부동산)</span></div>
    <div class="kv"><span class="k">부동산</span><span class="v">전국 ${CITIES.length}개 시군구</span></div>
    <div class="kv"><span class="k">저장 위치</span><span class="v">localStorage</span></div>
    <div class="note" style="margin-top:9px">
      방치 보상은 최대 <b>${ECON.offlineCapHours}시간</b>까지 정산됩니다.
      화면을 닫아도 자동으로 저장됩니다.
    </div>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">📖</span>이렇게 하면 빠릅니다</div></div>
    <div class="tiny muted" style="line-height:1.9">
      1. 사냥으로 <b>골드</b>를 모읍니다.<br>
      2. 부동산 탭에서 <b>회수 빠른(군 지역)</b> 매물부터 삽니다 — 첫 매물은 1분 안쪽.<br>
      3. 보유 지역이 늘면 <b>공격력 +1.5%/곳</b> 버프가 붙어 사냥이 빨라집니다.<br>
      4. 쌓인 <b>임대수익</b>을 수령해 매물을 늘리거나 강화석 재료를 모읍니다.<br>
      5. 10스테이지부터는 장비 강화 + 건물주 버프를 함께 챙겨야 보스가 뚫립니다.
    </div>
  </div>`;
}
