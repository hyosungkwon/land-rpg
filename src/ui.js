// land-rpg / src/ui.js
// 하단 탭 UI · HUD · 토스트/모달. 상태는 app.js 를 통해 읽고, 조작은 actions 로 넘긴다.
import { ECON, EQUIP, EQUIP_MAX_LV, SKILLS, skillCost, enhanceCost } from './data.js';
import { expNeed, exchangeStatus, skillEffect } from './state.js';
import { buffProgress, dividendReward, formatMan } from './property.js';

const esc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('ko-KR');
const pct = (v) => `${Math.max(0, Math.min(100, v)).toFixed(0)}%`;
const hhmmss = (d = new Date()) =>
  [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');

export class UI {
  constructor(app) {
    this.app = app; // { s, battle, cloud, buffs, prop, actions... }
    this.tab = 'hunt';
    this.el = {
      hud: document.getElementById('hud'),
      gold: document.getElementById('goldVal'),
      shard: document.getElementById('shardVal'),
      badge: document.getElementById('syncBadge'),
      syncLabel: document.getElementById('syncLabel'),
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

    document.body.addEventListener('click', (e) => {
      if (!e.target || !e.target.closest) return;
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.closest('#panel') || btn.closest('#modalCard') || btn.closest('.stage')) {
        this.handleAction(btn);
      }
    });

    this.el.quick.addEventListener('click', (e) => {
      const b = e.target.closest('.q');
      if (!b) return;
      this.app.actions.castSkill(b.dataset.skill);
    });

    this.el.bossBtn.addEventListener('click', () => this.app.actions.challengeBoss());

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
      case 'cast': actions.castSkill(v); break;
      case 'upgrade-skill': actions.upgradeSkill(v); break;
      case 'enhance': actions.enhance(btn.dataset.slot, 1); break;
      case 'enhance10': actions.enhance(btn.dataset.slot, 10); break;
      case 'login': actions.signIn(); break;
      case 'logout': actions.signOut(); break;
      case 'sync': actions.refreshCloud(); break;
      case 'claim-dividend': actions.claimDividend(); break;
      case 'exchange-max': {
        const inp = document.getElementById('exchangeGold');
        if (inp) inp.value = String(this.app.actions.maxExchangeGold());
        break;
      }
      case 'exchange-fill': {
        const inp = document.getElementById('exchangeGold');
        if (inp) inp.value = String(v);
        break;
      }
      case 'exchange': {
        const inp = document.getElementById('exchangeGold');
        actions.exchange(inp ? Number(inp.value) : 0);
        break;
      }
      case 'cloud-save': actions.pushCloud(); break;
      case 'cloud-load': actions.pullCloud(); break;
      case 'reset': actions.resetGame(); break;
      case 'close-modal': this.closeModal(); break;
      case 'rank-refresh': actions.refreshCloud(); break;
      default: break;
    }
  }

  setTab(tab) {
    if (!tab || tab === this.tab) {
      if (tab) this.render();
      return;
    }
    this.tab = tab;
    [...this.el.tabbar.querySelectorAll('.tab')].forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.el.panel.scrollTop = 0;
    this.render();
  }

  /* ───────────── 상태 접근 ───────────── */
  get s() { return this.app.s; }
  get battle() { return this.app.battle; }
  get cloud() { return this.app.cloud; }

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

    // 200ms 마다 패널 내 숫자 갱신
    if (now - this.lastLive > 200) {
      this.lastLive = now;
      this.refreshPanelLive(now);
    }
  }

  refreshPanelLive(now) {
    const s = this.s;
    const b = this.battle;
    document.querySelectorAll('[data-live]').forEach((el) => {
      const k = el.dataset.live;
      if (k === 'gold') el.textContent = fmt(s.gold);
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
      }
    });
  }

  setSync(info) {
    this.el.badge.dataset.kind = info.kind || 'guest';
    this.el.syncLabel.textContent = info.label;
    this.el.badge.title = info.detail || '';
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
    setTimeout(() => this.el.boot.remove(), 400);
  }

  /* ───────────── 패널 렌더 ───────────── */
  render() {
    const scroll = this.el.panel.scrollTop;
    this.el.panelInner.innerHTML = this.template();
    this.el.panel.scrollTop = scroll;
    this.lastLive = 0;
  }

  template() {
    if (this.tab === 'gear') return tplGear(this);
    if (this.tab === 'land') return tplLand(this);
    if (this.tab === 'more') return tplMore(this);
    return tplHunt(this);
  }
}

/* ══════════════════════════ 사냥/스킬 ══════════════════════════ */
function tplHunt(ui) {
  const s = ui.s;
  const b = ui.battle;
  const st = b.stats;
  const buffs = ui.app.buffs || {};
  const remain = Math.max(0, (b.boss ? ECON.normalKillsPerStage : ECON.normalKillsPerStage - s.killsInStage));
  const ready = s.bossReady && !b.boss;

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
      ? `<div class="tiny" style="margin-top:9px;color:var(--green)">🏢 건물주 버프 적용 중 · 공격 +${buffs.atkPct}% · 골드 +${buffs.goldPct}% · 체력 +${buffs.hpPct}% · 드롭 +${buffs.dropPct}%</div>`
      : `<div class="tiny dim" style="margin-top:9px">🏢 부동산을 연동하면 영구 버프가 붙습니다.</div>`;

  const logs = ui.logs.length
    ? ui.logs
        .slice(0, 20)
        .map((l) => `<div class="log-item"><span class="t">${l.t}</span><span>${l.text}</span></div>`)
        .join('')
    : `<div class="log-item"><span class="t">—</span><span class="dim">아직 기록이 없습니다.</span></div>`;

  return `
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
function tplGear(ui) {
  const s = ui.s;
  const st = ui.battle.stats;
  const total = Object.values(s.equip).reduce((a, b) => a + b, 0);

  const rows = Object.entries(EQUIP)
    .map(([slot, def]) => {
      const lv = s.equip[slot];
      const maxed = lv >= EQUIP_MAX_LV;
      const cost = enhanceCost(lv);
      const cur = def.per * lv;
      const next = def.per * (lv + 1);
      const unitText = (v) => (slot === 'ring' ? `${v.toFixed(1)}%` : slot === 'amulet' ? `+${Math.round(v)}%` : `+${fmt(v)}`);
      return `
      <div class="gear-row">
        <div class="g-ico">${def.icon}</div>
        <div class="g-mid">
          <div class="g-name">${def.name}<span class="lv">+${lv}</span></div>
          <div class="g-stat">${def.stat} ${unitText(cur)}${maxed ? ' · 최대' : ` → <b style="color:var(--green)">${unitText(next)}</b>`}</div>
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
      강화는 <b>실패 없이 100% 성공</b>합니다. 강화석은 사냥 드롭·보스 처치·부동산 배당으로 모입니다.
      ${s.equip.ring === 0 ? '<br>반지는 치명타 확률, 부적은 골드 획득량을 올립니다.' : ''}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">📈</span>부위별 효과</div></div>
    <div class="kv"><span class="k">⚔️ 무기</span><span class="v">공격력 +${EQUIP.weapon.per}/강화</span></div>
    <div class="kv"><span class="k">🛡️ 갑옷</span><span class="v">체력 +${EQUIP.armor.per}/강화</span></div>
    <div class="kv"><span class="k">🪖 투구</span><span class="v">체력 +${EQUIP.helmet.per}/강화</span></div>
    <div class="kv"><span class="k">💍 반지</span><span class="v">치명타 +${EQUIP.ring.per}%/강화</span></div>
    <div class="kv"><span class="k">🧿 부적</span><span class="v">골드 +${EQUIP.amulet.per}%/강화</span></div>
  </div>`;
}

/* ══════════════════════════ 부동산 연계 ══════════════════════════ */
function tplLand(ui) {
  const s = ui.s;
  const cloud = ui.cloud;
  const prop = ui.app.prop;
  const buffs = ui.app.buffs || {};
  const status = cloud.statusInfo();
  const signedIn = status.signedIn;
  const connected = !!(prop && prop.connected);

  const accountCard = !signedIn
    ? `<div class="card">
        <div class="card-head"><div class="card-title"><span class="t-ico">🏢</span>부동산 계정</div><span class="tiny dim">${esc(status.label)}</span></div>
        <div class="tiny muted" style="line-height:1.6;margin-bottom:11px">
          구글 계정으로 로그인하면 <b>korea-land-4e0c2</b> 부동산 데이터를 읽어
          건물주 버프를 받고, 모은 골드를 부동산 현금으로 환전할 수 있습니다.
        </div>
        <button class="btn primary block" data-action="login">Google 로그인</button>
        <div class="note" style="margin-top:9px">로그인 없이도 게임은 localStorage 로 정상 진행됩니다.</div>
      </div>`
    : `<div class="card">
        <div class="card-head">
          <div class="card-title"><span class="t-ico">🏢</span>${esc(prop?.nickname || status.nickname || '내 부동산')}</div>
          <span class="tiny dim">${connected ? '연동됨' : '데이터 없음'}</span>
        </div>
        ${connected
          ? `<div class="kv"><span class="k">보유 현금</span><span class="v gold">₩${fmt(prop.cash)}</span></div>
             <div class="kv"><span class="k">최고 자산</span><span class="v">₩${formatMan(prop.bestAsset)}</span></div>
             <div class="kv"><span class="k">보유 지역</span><span class="v">${prop.buildings}곳</span></div>
             <div class="kv"><span class="k">총 보유 면적</span><span class="v">${fmt(prop.totalPyeong)}평</span></div>
             <div class="kv"><span class="k">미수령 배당</span><span class="v gold">₩${fmt(prop.pendingIncome)}</span></div>`
          : `<div class="note warn">계정은 로그인됐지만 부동산 상태를 읽지 못했습니다. 땅을 한 번이라도 보유한 계정인지 확인해 주세요.</div>`}
        <div class="row gap6" style="margin-top:10px">
          <button class="btn small ghost wide" data-action="sync">새로고침</button>
          <button class="btn small ghost wide" data-action="logout">로그아웃</button>
        </div>
      </div>`;

  const buffRows = (() => {
    const pr = buffProgress(prop);
    const rows = [
      ['⚔️ 공격력', buffs.atkPct, pr.atk],
      ['💰 골드 획득', buffs.goldPct, pr.gold],
      ['❤️ 체력', buffs.hpPct, pr.hp],
      ['💎 드롭률', buffs.dropPct, pr.drop],
    ];
    return rows
      .map(
        ([label, val, p]) => `
      <div class="buff-row">
        <div class="buff-head"><b>${label}</b><span>+${val}%</span></div>
        <div class="prog" style="margin-top:5px"><i style="width:${p.pct * 100}%"></i></div>
        <div class="buff-next">${esc(p.next)}</div>
      </div>`,
      )
      .join('');
  })();

  const div = dividendReward(prop?.pendingIncome || 0, s.claim.dividendWatermark);
  const st = exchangeStatus(s);
  const maxGold = Math.floor(st.remain / st.rate);

  return `
  ${accountCard}

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏗️</span>건물주 버프</div>
      <span class="tiny dim">${buffs.active ? '적용 중' : '미적용'}</span>
    </div>
    ${buffRows}
    <div class="note" style="margin-top:9px">부동산 → RPG 는 <b>영구 패시브</b>입니다. 보유 지역·자산이 늘면 즉시 강해집니다.</div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🎁</span>배당 → 강화석</div>
      <span class="tiny dim">₩${fmt(ECON.dividendShardPer)}당 💎1</span>
    </div>
    <div class="kv"><span class="k">미수령 배당</span><span class="v gold">₩${fmt(div.pending)}</span></div>
    <div class="kv"><span class="k">환산 가능 강화석</span><span class="v" style="color:var(--blue)">💎 ${fmt(div.shards)}</span></div>
    <button class="btn ${div.shards > 0 ? 'green' : 'ghost'} block" style="margin-top:10px" data-action="claim-dividend" ${div.shards > 0 ? '' : 'disabled'}>
      ${div.shards > 0 ? `강화석 ${fmt(div.shards)}개 수령` : '수령할 배당이 없습니다'}
    </button>
    <div class="note" style="margin-top:9px">배당 원본은 건드리지 않고, <b>수령 기록 이후 늘어난 금액</b>만 강화석으로 환산합니다.</div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">💱</span>골드 → 부동산 현금</div>
      <span class="tiny dim">1골드 = ₩${st.rate}</span>
    </div>
    <div class="row tiny" style="margin-bottom:8px">
      <span class="muted">보유 골드 <b data-live="gold" style="color:var(--gold)">${fmt(s.gold)}</b></span>
      <span class="dim">오늘 환전 ₩${fmt(st.used)} / ₩${fmt(st.cap)}</span>
    </div>
    <div class="input-row">
      <input id="exchangeGold" type="number" inputmode="numeric" min="0" step="100" placeholder="환전할 골드" ${signedIn ? '' : 'disabled'}>
      <button class="btn small ghost" data-action="exchange-max" ${signedIn ? '' : 'disabled'}>최대</button>
    </div>
    <div class="chips" style="margin-top:7px">
      ${[500, 5000, 50000].map((g) => `<button class="chip" data-action="exchange-fill" data-value="${g}">${fmt(g)}</button>`).join('')}
      <button class="chip" data-action="exchange-fill" data-value="${maxGold}">한도까지 ${fmt(maxGold)}</button>
    </div>
    <button class="btn primary block" style="margin-top:9px" data-action="exchange" ${signedIn ? '' : 'disabled'}>
      환전하기 <span class="cost">(최소 ${fmt(st.minGold)}골드)</span>
    </button>
    <div class="kv" style="margin-top:6px"><span class="k">남은 한도</span><span class="v gold">₩${fmt(st.remain)}</span></div>
    <div class="note warn" style="margin-top:9px">
      환전은 부동산 계정의 <b>users/{uid}/state/cash</b> 에 실제로 반영됩니다.
      인플레 방지를 위해 <b>1일 ₩${fmt(ECON.exchangeDailyCap)}</b> 한도가 적용됩니다.
    </div>
  </div>

  ${!connected
    ? `<div class="card"><div class="card-head"><div class="card-title"><span class="t-ico">🔄</span>동기화 상태</div></div>
        <div class="kv"><span class="k">현재 모드</span><span class="v">${esc(status.label)}</span></div>
        <div class="tiny muted" style="margin-top:6px;line-height:1.6">${esc(status.detail || '')}</div>
        <div class="note" style="margin-top:9px">rpg/$uid 보안 규칙이 아직 반영되지 않아도 게임 진행은 localStorage 에 안전하게 저장됩니다.</div>
      </div>`
    : ''}`;
}

/* ══════════════════════════ 랭킹/설정 ══════════════════════════ */
function tplMore(ui) {
  const s = ui.s;
  const cloud = ui.cloud;
  const status = cloud.statusInfo();
  const mins = Math.floor((s.records.playMs || 0) / 60000);

  const rankings = (cloud.rankings || []).slice(0, 10);
  const me = cloud.prop?.nickname;
  const rankRows = rankings.length
    ? rankings
        .map(
          (r, i) => `<div class="rank-row ${me && r.name === me ? 'me' : ''}">
            <span class="no ${i < 3 ? 'top' : ''}">${i + 1}</span>
            <span class="nm">${esc(r.name)}${r.isAI ? ' <span class="dim tiny">BOT</span>' : ''}</span>
            <span class="vl">₩${formatMan(r.asset)}</span>
          </div>`,
        )
        .join('')
    : `<div class="tiny dim">로그인하면 부동산 자산 랭킹을 불러옵니다.</div>`;

  const rpgRanks = (cloud.rpgRankings || []).length
    ? cloud.rpgRankings
        .slice(0, 10)
        .map(
          (r, i) => `<div class="rank-row">
            <span class="no ${i < 3 ? 'top' : ''}">${i + 1}</span>
            <span class="nm">${esc(r.name)}</span>
            <span class="vl">S${r.stage} · Lv.${r.level}</span>
          </div>`,
        )
        .join('')
    : `<div class="tiny dim">rpg_rankings 규칙이 반영되면 다른 플레이어 기록이 표시됩니다.</div>`;

  return `
  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">🏆</span>내 기록</div><span class="tiny dim">${esc(s.nickname || status.nickname || '플레이어')}</span></div>
    <div class="stat-grid">
      <div class="stat atk"><div class="k">최고 스테이지</div><div class="v">S${s.maxStage}</div></div>
      <div class="stat hp"><div class="k">총 처치</div><div class="v">${fmt(s.totalKills)}</div></div>
      <div class="stat crit"><div class="k">보스 처치</div><div class="v">${fmt(s.bossKills)}</div></div>
      <div class="stat gold"><div class="k">누적 골드</div><div class="v">${formatMan(s.records.totalGold || 0)}</div></div>
      <div class="stat"><div class="k">플레이 시간</div><div class="v">${mins < 60 ? `${mins}분` : `${Math.floor(mins / 60)}시간 ${mins % 60}분`}</div></div>
      <div class="stat"><div class="k">보유 골드</div><div class="v">${formatMan(s.gold)}</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏙️</span>부동산 자산 랭킹</div>
      <button class="btn small ghost" data-action="rank-refresh">새로고침</button>
    </div>
    ${rankRows}
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">⚔️</span>RPG 랭킹</div><span class="tiny dim">최고 스테이지</span></div>
    ${rpgRanks}
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">⚙️</span>설정</div><span class="tiny dim">v${'1.0.0'}</span></div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">자동 보스 전환</span>
      <button class="switch ${s.autoBoss ? 'on' : ''}" data-action="toggle-auto"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">화면 이펙트</span>
      <button class="switch ${s.effects ? 'on' : ''}" data-action="toggle-effects"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">저장 모드</span>
      <span class="tiny" style="color:${status.kind === 'sync' ? 'var(--green)' : 'var(--gold)'}">${esc(status.label)}</span>
    </div>
    <div class="row gap6" style="margin-top:10px">
      <button class="btn small ghost wide" data-action="cloud-save" ${status.signedIn ? '' : 'disabled'}>클라우드 저장</button>
      <button class="btn small ghost wide" data-action="cloud-load" ${status.signedIn ? '' : 'disabled'}>불러오기</button>
    </div>
    <button class="btn small block" style="margin-top:8px;color:#ffb3b3;border-color:rgba(255,107,107,0.3)" data-action="reset">게임 초기화</button>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">ℹ️</span>앱 정보</div></div>
    <div class="kv"><span class="k">버전</span><span class="v">1.0.0 (프로토타입)</span></div>
    <div class="kv"><span class="k">부동산 프로젝트</span><span class="v">korea-land-4e0c2</span></div>
    <div class="kv"><span class="k">저장 위치</span><span class="v">${status.kind === 'sync' ? 'rpg/' + esc(status.uid || '') : 'localStorage'}</span></div>
    <div class="note" style="margin-top:9px">
      방치 보상은 최대 <b>${ECON.offlineCapHours}시간</b>까지 정산됩니다.
      화면을 닫아도 자동으로 저장됩니다.
    </div>
  </div>`;
}
