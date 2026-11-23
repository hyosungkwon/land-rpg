// land-rpg / app.js
// 앱 부트스트랩: 상태 로드 → 전투/렌더/UI 연결 → 루프 → Firebase 연동.
import { APP_VERSION, ECON, EQUIP, SKILLS, stageDef } from './src/data.js';
import {
  loadState, saveState, defaultState, offlineSummary, applyOffline, tryEnhance,
  tryUpgradeSkill, validateExchange, commitExchange, exchangeStatus,
} from './src/state.js';
import { Battle } from './src/combat.js';
import { CLOUD } from './src/firebase.js';
import { normalizeProperty, computeBuffs, dividendReward, EMPTY_PROP } from './src/property.js';
import { CITY_BY_KEY, quoteTrade, maxBuyQty, rentAccrual, formatWon, LAND } from './src/land.js';
import { Renderer } from './src/render.js';
import { UI } from './src/ui.js';

// 구형 Safari / 삼성 인터넷 대비 CanvasRenderingContext2D.roundRect 폴리필
(() => {
  try {
    const P = typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype;
    if (!P || typeof P.roundRect === 'function') return;
    P.roundRect = function (x, y, w, h, r) {
      const rr = Math.min(typeof r === 'number' ? r : 0, Math.abs(w) / 2, Math.abs(h) / 2);
      this.beginPath();
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
    };
  } catch (e) { /* ignore */ }
})();

const STORAGE = (() => {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
})();

const won = (n) => Math.floor(Number(n) || 0).toLocaleString('ko-KR');
const esc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class App {
  constructor() {
    this.s = loadState(STORAGE);
    this.prop = { ...EMPTY_PROP };
    this.buffs = computeBuffs(this.prop);
    this.cloud = CLOUD;
    this.battle = new Battle(this.s, () => this.buffs);
    this.renderer = new Renderer(document.getElementById('battle'));
    this.renderer.setBattle(this.battle);
    this.renderer.effects = this.s.effects !== false;
    this.ui = new UI(this);
    this.actions = this.makeActions();
    this.lastTs = 0;
    this.lastSave = 0;
    this.lastCloud = 0;
    this.lastRank = 0;
    this.lastRentTick = 0;
    this._rentSettled = false;
    this.startedAt = Date.now();
    this.offlineChecked = new Date(this.s.lastActiveAt).toDateString();
    this.hiddenAt = 0;
  }

  async boot() {
    this.ui.init();
    this.renderer
      .preload(['hero_idle', 'hero_attack', 'hero_skill', ...this.stageMonsterNames(this.s.stage)])
      .then(() => this.renderer.resize())
      .catch(() => {});

    this.ui.setSync({ kind: 'guest', label: '로컬 저장', detail: '부동산 연동 전' });
    this.cloud.onStatus((info) => this.ui.setSync(info));

    // 오프라인 정산 (최대 12시간)
    const summary = offlineSummary(this.s, Date.now(), this.buffs);
    if (summary.sec >= 60 && (summary.gold || summary.exp || summary.shards)) {
      const ups = applyOffline(this.s, summary);
      this.save(true);
      setTimeout(() => this.showOfflinePopup(summary, ups), 450);
    }

    this.ui.render();
    // PWA 바로가기(?tab=land) 지원
    try {
      const tabParam = new URLSearchParams((typeof location !== 'undefined' && location.search) || '').get('tab');
      if (tabParam && ['hunt', 'gear', 'land', 'more'].includes(tabParam)) this.ui.setTab(tabParam);
    } catch (e) { /* ignore */ }
    this.ui.refreshLive(Date.now());
    requestAnimationFrame((ts) => this.loop(ts));
    setTimeout(() => this.ui.hideBoot(), 220);

    this.bindLifecycle();
    this.registerSW();

    // Firebase 는 첫 프레임 뒤에 지연 초기화 (초기 로딩 속도 보호)
    setTimeout(() => this.initCloud(), 1400);
  }

  stageMonsterNames(stage) {
    const d = stageDef(stage);
    return [...d.normals, d.boss];
  }

  /* ───────────── 메인 루프 ─────────────
   * 중요: 다음 프레임을 먼저 예약한 뒤 작업한다. 어느 한 단계에서 예외가 나도
   * 루프가 영구히 멈추지 않고(모바일 '몹 오면 멈춤' 증상), 전투 시뮬레이션은 계속된다.
   */
  loop(ts) {
    this._raf = requestAnimationFrame((t) => this.loop(t));
    const now = Date.now();
    const tsNum = typeof ts === 'number' && isFinite(ts) ? ts : now;
    let dt = this.lastTs ? tsNum - this.lastTs : 16;
    if (!isFinite(dt) || dt < 0) dt = 16;
    dt = Math.min(200, dt);
    this.lastTs = tsNum;

    // 1) 전투 시뮬레이션
    let events = [];
    try {
      this.battle.tick(dt, now);
      events = this.battle.drainEvents();
    } catch (e) {
      this.reportError('battle', e);
      this.recoverBattle();
    }

    // 2) 연출 · 렌더 · UI (실패해도 전투는 계속)
    try {
      if (events.length) this.renderer.onEvents(events, now);
    } catch (e) {
      this.reportError('effects', e);
    }
    try {
      this.renderer.frame(now);
      this._lastFrameOk = now;
    } catch (e) {
      this.reportError('render', e);
      this.recoverRender(now);
    }
    try {
      if (events.length) this.handleEvents(events, now);
      this.ui.refreshLive(now);
    } catch (e) {
      this.reportError('ui', e);
    }

    // 3) 자동 저장 / 임대수익 적립 / 클라우드 동기화
    try {
      this.s.records.playMs = (this.s.records.playMs || 0) + dt;
      if (now - this.lastRentTick >= 1000) {
        this.lastRentTick = now;
        this.accrueRent(now, 1);
      }
      if (now - this.lastSave > 8000) {
        this.lastSave = now;
        this.save();
      }
      if (now - this.lastCloud > 45000 && this.cloud.signedIn) {
        this.lastCloud = now;
        this.pushCloud(true);
      }
      if (now - this.lastRank > 120000 && this.cloud.signedIn && this.s.maxStage > 1) {
        this.lastRank = now;
        this.cloud.publishRanking(this.s).catch(() => {});
      }
    } catch (e) {
      this.reportError('save', e);
    }
  }

  /* ───────────── 오류 보고 ·자동복구 ───────────── */
  reportError(where, err) {
    const msg = (err && (err.message || err.name)) || String(err);
    this._errCounts = this._errCounts || {};
    const n = (this._errCounts[where] = (this._errCounts[where] || 0) + 1);
    if (this._lastErr !== msg) {
      this._lastErr = msg;
      // 사용자에게는 짧게만, 자세한 내용은 개발자 도구로
      try { console.warn(`[land-rpg] ${where} error:`, err); } catch (e) { /* ignore */ }
    }
    if (n === 3) this.showErrorBadge(`${where}: ${msg}`);
  }

  showErrorBadge(text) {
    try {
      if (!this._badgeEl) {
        const el = document.createElement('div');
        el.id = 'errBadge';
        el.style.cssText =
          'position:fixed;left:8px;bottom:70px;z-index:9999;max-width:80vw;padding:6px 10px;' +
          'border-radius:10px;background:rgba(150,20,30,.88);color:#fff;font-size:11px;' +
          'line-height:1.35;font-family:system-ui,sans-serif;pointer-events:none;opacity:.92';
        document.body.appendChild(el);
        this._badgeEl = el;
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); this._badgeEl = null; }, 6000);
      }
      this._badgeEl.textContent = `⚠ ${String(text).slice(0, 90)}`;
    } catch (e) { /* ignore */ }
  }

  recoverBattle() {
    // 전투 상태가 깨졌으면 엔티티를 정리해 다시 돌아가게 한다(진행도는 유지).
    try {
      this.battle.monsters = [];
      this.battle.boss = null;
      this.battle.events = [];
      this.battle.refreshStats(Date.now());
      if (!isFinite(this.battle.player.hp)) this.battle.player.hp = this.battle.stats.hpMax;
      this.battle.spawnInitial(Date.now());
    } catch (e) { /* ignore */ }
  }

  recoverRender(now) {
    // 캔버스 상태(save/restore 불균형·깨진 변환)를 되돌리고 다음 프레임을 다시 그린다.
    const since = now - (this._lastFrameOk || 0);
    try {
      const ctx = this.renderer.ctx;
      ctx.restore && ctx.setTransform(this.renderer.dpr, 0, 0, this.renderer.dpr, 0, 0);
      this.renderer.shake = 0;
      this.renderer.bgKey = '';
    } catch (e) { /* ignore */ }
    if (since > 2500) {
      try { this.renderer.resize(); } catch (e) { /* ignore */ }
    }
  }

  handleEvents(events, now) {
    for (const ev of events) {
      if (ev.t === 'monsterDeath') {
        if (ev.isBoss) {
          this.ui.addLog(`👑 <b>${ev.ko}</b> 처치! 💰${ev.gold.toLocaleString()} 💎${ev.shards}`);
        } else if (ev.shards > 0) {
          this.ui.addLog(`${ev.ko} 처치 · 💰${ev.gold} 💎${ev.shards}`);
        }
      } else if (ev.t === 'levelUp') {
        this.ui.toast(`⬆️ 레벨 업! Lv.${ev.level}`, 'green');
        this.ui.addLog(`<b>레벨 업</b> Lv.${ev.level} · 체력 완충`);
        this.ui.render();
      } else if (ev.t === 'stageClear') {
        this.ui.toast(`🏅 스테이지 ${ev.stage} 클리어! 💎+${ev.bonus}`, 'gold');
        this.ui.addLog(`<b>스테이지 ${ev.stage} 클리어</b> → ${ev.next} (보너스 💎${ev.bonus})`);
        this.ui.render();
        this.save(true);
        this.renderer.preload(this.stageMonsterNames(this.s.stage)).catch(() => {});
        if (this.cloud.signedIn) this.cloud.publishRanking(this.s).catch(() => {});
      } else if (ev.t === 'bossStart') {
        this.ui.addLog(`⚔️ <b>${ev.ko}</b> 등장 — ${ECON.bossTimeLimitMs / 1000}초 제한`);
      } else if (ev.t === 'bossFail') {
        const why = ev.why === 'timeout' ? '시간 초과' : '전투 불능';
        this.ui.toast(`보스 퇴치 실패 (${why}) · 조금 더 강해져서 재도전`, 'red');
        this.ui.addLog(`보스 <b>${ev.ko}</b> 실패(${why}) · ${ECON.bossRetryKills}마리 더 처치하면 재도전`);
        this.ui.render();
      } else if (ev.t === 'playerDeath') {
        this.ui.addLog('💀 전투 불능 — 3초 후 부활');
      } else if (ev.t === 'revive') {
        this.ui.addLog('✨ 부활했습니다');
      }
    }
  }

  /* ───────────── 부동산 임대수익 적립 ─────────────
   * 원작과 동일: 접속 중에는 100%, 앱을 닫아둔 동안은 5%만 적립한다.
   * 적립값은 RPG 저장소(rpg/{uid})에 함께 저장되고, 수령할 때 DB cash 에 반영된다.
   */
  accrueRent(now, rate = 1) {
    const l = this.s.land;
    if (!l) return 0;
    const from = Number(l.rentAt) || 0;
    if (!from) {
      l.rentAt = now;
      return 0;
    }
    const elapsed = Math.max(0, now - from);
    const income = this.prop && this.prop.connected ? this.prop.incomePerMin : 0;
    const gain = rate >= 1 ? rentAccrual(income, elapsed, 1) : rentAccrual(income, elapsed, rate);
    if (gain > 0) l.accruedRent = (Number(l.accruedRent) || 0) + gain;
    l.rentAt = now;
    return gain;
  }

  save(immediate = false) {
    this.battle.writeHp();
    this.s.lastActiveAt = Date.now();
    saveState(STORAGE, this.s);
    if (immediate) this.lastSave = Date.now();
  }

  /* ───────────── 수명주기 ───────────── */
  bindLifecycle() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.hiddenAt = Date.now();
        this.accrueRent(Date.now(), 1);
        this.save(true);
        if (this.cloud.signedIn) this.pushCloud(true).catch(() => {});
      } else {
        const away = Date.now() - (this.hiddenAt || Date.now());
        // 자리를 비운 동안의 임대수익은 5%만 적립 (원작 오프라인 수익률)
        const rent = this.accrueRent(Date.now(), LAND.rentOfflineRate);
        if (rent >= 1) this.ui.toast(`💤 방치 임대수익 +₩${formatWon(rent)} (5%)`, 'gold');
        if (away > 120000) {
          // 백그라운드에 있던 시간도 방치 보상으로 정산
          const summary = offlineSummary({ ...this.s, lastActiveAt: this.hiddenAt }, Date.now(), this.buffs);
          if (summary.gold > 0) {
            const ups = applyOffline(this.s, summary);
            this.ui.toast(`🌙 방치 보상 +💰${summary.gold.toLocaleString()}`, 'gold');
            this.ui.render();
            this.save(true);
            if (ups > 0) this.battle.refreshStats();
          }
        }
        this.hiddenAt = 0;
        this.battle.refreshStats();
      }
    });
    window.addEventListener('beforeunload', () => {
      this.save(true);
      if (this.cloud.signedIn && this.cloud.writable) this.cloud.saveRpg(this.cloudPayload());
    });
    window.addEventListener('online', () => {
      if (this.cloud.status === 'offline') this.initCloud();
    });
    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => this.renderer.resize(), 120);
    });
  }

  registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // 새 버전이 대기 중이면 바로 활성화 요청(삼성 인터넷은 skipWaiting 만으로도 교체됨)
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // 설치가 끝나는 즉시(대기 상태 진입) 활성화 요청
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
        reg.update && reg.update().catch(() => {});
      })
      .catch(() => {});

    // 새 서비스 워커가 제어권을 가져가면(새 캐시 준비 완료) 한 번만 자동 새로고짐
    try {
      if (!navigator.serviceWorker.controller) return;
      let done = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (done) return;
        done = true; // 페이지당 한 번만 (새로고침 뒤에는 컨트롤러가 최신이라 다시 발생하지 않음)
        this.save(true);
        setTimeout(() => location.reload(), 350);
      });
    } catch (e) { /* ignore */ }
  }

  /* ───────────── Firebase ───────────── */
  async initCloud() {
    try {
      await this.cloud.init();
      await this.afterCloudChange();
    } catch (e) {
      this.ui.setSync({ kind: 'error', label: '연동 오류', detail: String(e && e.message) });
    }
  }

  async afterCloudChange() {
    this.syncProperty();
    this.ui.render();
    if (this.cloud.signedIn) {
      this.s.uid = this.cloud.uid;
      if (!this.s.nickname) this.s.nickname = this.prop.nickname || this.cloud.nickname || '';
      const cloudSave = this.cloud.lastRpg;
      if (cloudSave && cloudSave.savedAt && cloudSave.savedAt > (this.s.lastActiveAt || 0) - 500 && (cloudSave.stage || cloudSave.level)) {
        this.offerCloudLoad(cloudSave);
      }
      this.save(true);
    }
  }

  syncProperty() {
    const raw = this.cloud.prop;
    const pending = raw ? raw._pendingIncome || 0 : 0;
    this.prop = raw ? normalizeProperty(raw, pending) : { ...EMPTY_PROP };
    this.buffs = computeBuffs(this.prop);
    this.battle.refreshStats();
    // 로그인/새로고침 직후 한 번만: 앱을 닫아둔 동안의 임대수익을 5%로 정산
    if (this.prop.connected && !this._rentSettled) {
      this._rentSettled = true;
      const gain = this.accrueRent(Date.now(), LAND.rentOfflineRate);
      if (gain >= 100) this.ui.toast(`🏢 방치 중 임대수익 +₩${formatWon(gain)} 적립 (5%)`, 'gold');
    }
    this.ui.render();
  }

  offerCloudLoad(cloudSave) {
    if (this._offeredCloud) return;
    this._offeredCloud = true;
    const diff = (cloudSave.stage || 1) - this.s.stage;
    if (Math.abs(diff) < 1 && (cloudSave.level || 1) <= this.s.level) return; // 비슷하면 굳이 묻지 않음
    this.ui.modal({
      title: '☁️ 클라우드 저장 발견',
      sub: `rpg/${this.cloud.uid} 에 저장된 기록이 있습니다.`,
      body: `<div class="kv"><span class="k">클라우드</span><span class="v">S${cloudSave.stage} · Lv.${cloudSave.level}</span></div>
             <div class="kv"><span class="k">이 기기</span><span class="v">S${this.s.stage} · Lv.${this.s.level}</span></div>
             <div class="note" style="margin-top:10px">불러오면 이 기기의 진행도가 클라우드 기록으로 바뀝니다.</div>`,
      actions: [
        { label: '나중에', onClick: () => {} },
        { label: '불러오기', style: 'primary', onClick: () => this.applyCloudSave(cloudSave) },
      ],
    });
  }

  applyCloudSave(cloud) {
    const keepUid = this.cloud.uid;
    const fresh = loadState({
      getItem: () => JSON.stringify(cloud),
      setItem: () => {},
    });
    fresh.uid = keepUid;
    fresh.lastActiveAt = Date.now();
    this.s = fresh;
    this.battle = new Battle(this.s, () => this.buffs || {});
    this.renderer.setBattle(this.battle);
    this.ui.app.s = this.s;
    this.ui.app.battle = this.battle;
    this.save(true);
    this.ui.toast('☁️ 클라우드 기록을 불러왔습니다', 'green');
    this.ui.render();
  }

  cloudPayload() {
    const s = this.s;
    return {
      version: APP_VERSION,
      savedAt: Date.now(),
      nickname: this.prop.nickname || this.cloud.nickname || s.nickname || '',
      level: s.level, exp: s.exp, gold: s.gold, shards: s.shards,
      equip: s.equip, skills: s.skills, stage: s.stage, killsInStage: s.killsInStage,
      totalKills: s.totalKills, bossKills: s.bossKills, maxStage: s.maxStage,
      autoBoss: s.autoBoss, exchange: s.exchange, claim: s.claim, records: s.records,
      land: { accruedRent: s.land.accruedRent, rentAt: s.land.rentAt },
      createdAt: s.createdAt,
    };
  }

  async pushCloud(silent = false) {
    if (!this.cloud.signedIn) {
      if (!silent) this.ui.toast('로그인하면 클라우드에 저장할 수 있습니다', 'red');
      return false;
    }
    const r = await this.cloud.saveRpg(this.cloudPayload());
    if (!silent) {
      if (r.ok) this.ui.toast('☁️ 클라우드 저장 완료', 'green');
      else this.ui.toast('rpg 쓰기 규칙이 없어 로컬에 저장했습니다 (database.rules.json 참고)', 'red');
    }
    return r.ok;
  }

  /* ───────────── 사용자 액션 ───────────── */
  makeActions() {
    return {
      castSkill: (key) => {
        const ok = this.battle.castSkill(key, Date.now());
        if (!ok) {
          const left = Math.max(0, this.s.skills[key].last + SKILLS[key].cd - Date.now());
          this.ui.toast(left > 0 ? `${SKILLS[key].name} 재사용 대기 ${(left / 1000).toFixed(1)}초` : '지금은 시전할 수 없습니다');
        }
      },
      challengeBoss: () => {
        const b = this.battle;
        if (b.boss) {
          this.ui.toast('이미 보스와 전투 중입니다');
          return;
        }
        if (!this.s.bossReady) {
          const need = Math.max(0, ECON.normalKillsPerStage - this.s.killsInStage);
          this.ui.toast(`보스 도전까지 ${need}마리 남았습니다`);
          return;
        }
        if (b.challengeBoss(Date.now())) this.ui.render();
      },
      toggleAutoBoss: () => {
        this.s.autoBoss = !this.s.autoBoss;
        this.save();
        this.ui.toast(this.s.autoBoss ? '10마리마다 보스 자동 도전' : '보스 자동 도전 꺼짐');
        this.ui.render();
      },
      toggleEffects: () => {
        this.s.effects = !this.s.effects;
        this.renderer.effects = this.s.effects;
        this.save();
        this.ui.render();
      },
      enhance: (slot, times) => {
        const r = tryEnhance(this.s, slot, times);
        if (r.done > 0) {
          this.ui.toast(`${EQUIP[slot].icon} ${EQUIP[slot].name} +${this.s.equip[slot]} (💎${r.spent})`, 'green');
          this.battle.refreshStats();
          this.save();
          this.ui.render();
        } else {
          this.ui.toast(r.reason || '강화할 수 없습니다', 'red');
        }
      },
      upgradeSkill: (key) => {
        const r = tryUpgradeSkill(this.s, key);
        if (r.ok) {
          this.ui.toast(`${SKILLS[key].name} Lv.${r.lv} (💎${r.spent})`, 'green');
          this.save();
          this.ui.render();
        } else {
          this.ui.toast(r.reason || '강화할 수 없습니다', 'red');
        }
      },
      /* ── 부동산 게임 (내 자산 · 매물 투자) ── */
      landTrade: (key, side) => this.openLandTrade(key, side),
      landMore: () => {
        this.s.land.page = Math.max(1, Math.floor(Number(this.s.land.page) || 1)) + 1;
        this.ui.render();
      },
      landSort: (k) => {
        this.s.land.sort = k;
        this.s.land.page = 1;
        this.save();
        this.ui.render();
      },
      landTier: (k) => {
        this.s.land.tier = k;
        this.s.land.page = 1;
        this.save();
        this.ui.render();
      },
      refreshLand: async () => {
        if (!this.cloud.signedIn) {
          this.ui.toast('상단의 Google 로그인 후 이용할 수 있습니다', 'red');
          return;
        }
        await this.cloud.refreshProperty();
        this.syncProperty();
        this.ui.toast('부동산 정보를 새로고침했습니다', 'green');
      },
      claimRent: () => this.openClaimRent(),
      signIn: async () => {
        this.ui.toast('구글 로그인 창을 여는 중…');
        const r = await this.cloud.signIn();
        if (!r.ok) {
          this.ui.toast('로그인에 실패했습니다. 팝업 차단을 확인해 주세요.', 'red');
          return;
        }
        if (r.redirect) return;
        await this.afterCloudChange();
        this.ui.toast(`🏢 ${this.prop.nickname || '부동산'} 계정 연동 완료`, 'gold');
      },
      signOut: async () => {
        await this.cloud.signOut();
        this.prop = { ...EMPTY_PROP };
        this.buffs = computeBuffs(this.prop);
        this.battle.refreshStats();
        this.ui.render();
        this.ui.toast('로그아웃했습니다 (로컬 저장으로 계속)');
      },
      refreshCloud: async () => {
        if (!this.cloud.signedIn) {
          this.ui.toast('먼저 구글 로그인이 필요합니다');
          return;
        }
        await this.cloud.refreshProperty();
        await this.cloud.loadRankings().catch(() => {});
        this.syncProperty();
        this.ui.toast('부동산 정보를 새로고침했습니다', 'green');
      },
      claimDividend: () => {
        if (!this.prop.connected) {
          this.ui.toast('부동산 데이터가 없습니다', 'red');
          return;
        }
        if (this.prop.pendingIncome < this.s.claim.dividendWatermark) {
          this.s.claim.dividendWatermark = this.prop.pendingIncome;
          this.save();
        }
        const div = dividendReward(this.prop.pendingIncome, this.s.claim.dividendWatermark);
        if (div.shards <= 0) {
          this.ui.toast('새로 늘어난 배당이 없습니다');
          return;
        }
        this.ui.modal({
          title: '🎁 배당 → 강화석',
          sub: `미수령 배당 ₩${div.pending.toLocaleString()} 중 늘어난 ₩${div.delta.toLocaleString()}을(를) 강화석으로 환산합니다.`,
          body: `<div class="modal-rewards">
                   <div class="rw"><div class="e">💎</div><div class="v">${div.shards}</div><div class="k">강화석</div></div>
                   <div class="rw"><div class="e">🏢</div><div class="v">${this.prop.buildings}</div><div class="k">보유 지역</div></div>
                   <div class="rw"><div class="e">📐</div><div class="v">${this.prop.totalPyeong.toLocaleString()}</div><div class="k">보유 평수</div></div>
                 </div>
                 <div class="note">원본 배당은 부동산 앱에서 그대로 수령할 수 있습니다. 여기서는 읽기만 합니다.</div>`,
          actions: [
            { label: '취소', onClick: () => {} },
            {
              label: '수령',
              style: 'primary',
              onClick: () => {
                this.s.shards += div.shards;
                this.s.claim.dividendWatermark = div.pending;
                this.save(true);
                this.ui.toast(`💎 강화석 ${div.shards}개 수령`, 'gold');
                this.ui.render();
              },
            },
          ],
        });
      },
      maxExchangeGold: () => {
        const st = exchangeStatus(this.s);
        return Math.max(0, Math.min(this.s.gold, Math.floor(st.remain / st.rate)));
      },
      exchange: (gold) => {
        if (!this.cloud.signedIn) {
          this.ui.toast('부동산 환전은 구글 로그인 후 사용할 수 있습니다', 'red');
          return;
        }
        const v = validateExchange(this.s, gold);
        if (!v.ok) {
          this.ui.toast(v.reason, 'red');
          return;
        }
        this.ui.modal({
          title: '💱 골드 환전',
          sub: '부동산 계정의 현금으로 실제 반영됩니다.',
          body: `<div class="kv"><span class="k">소모 골드</span><span class="v">💰 ${v.gold.toLocaleString()}</span></div>
                 <div class="kv"><span class="k">받을 현금</span><span class="v gold">₩${v.cash.toLocaleString()}</span></div>
                 <div class="kv"><span class="k">오늘 사용/한도</span><span class="v">₩${v.status.used.toLocaleString()} / ₩${v.status.cap.toLocaleString()}</span></div>`,
          actions: [
            { label: '취소', onClick: () => {} },
            { label: '환전', style: 'primary', onClick: () => this.doExchange(v.gold, v.cash) },
          ],
        });
      },
      pushCloud: () => this.pushCloud(false),
      pullCloud: async () => {
        if (!this.cloud.signedIn) return;
        const cloud = await this.cloud.loadRpg();
        if (!cloud) {
          this.ui.toast('클라우드에 저장된 기록이 없습니다');
          return;
        }
        this.ui.modal({
          title: '☁️ 클라우드 불러오기',
          sub: `S${cloud.stage || 1} · Lv.${cloud.level || 1} 기록으로 덮어씁니다.`,
          actions: [
            { label: '취소', onClick: () => {} },
            { label: '불러오기', style: 'primary', onClick: () => this.applyCloudSave(cloud) },
          ],
        });
      },
      resetGame: () => {
        this.ui.modal({
          title: '⚠️ 게임 초기화',
          sub: '이 기기의 진행도가 모두 사라집니다. 되돌릴 수 없습니다.',
          actions: [
            { label: '취소', onClick: () => {} },
            {
              label: '초기화',
              style: 'primary',
              onClick: () => {
                try { STORAGE && STORAGE.removeItem('land_rpg_state_v1'); } catch (e) { /* ignore */ }
                location.reload();
              },
            },
          ],
        });
      },
    };
  }

  /* ───────────── 부동산 거래 모달 ───────────── */
  openLandTrade(key, side) {
    const city = CITY_BY_KEY[key];
    if (!city) return;
    if (!this.cloud.signedIn || !this.cloud.prop) {
      this.ui.toast('상단의 Google 로그인 후 이용할 수 있습니다', 'red');
      return;
    }
    const raw = this.cloud.prop;
    const now = Date.now();
    const held = Math.floor(Number((raw.owned || {})[key]) || 0);
    const max = side === 'buy' ? maxBuyQty(key, raw, now) : held;
    if (max <= 0) {
      this.ui.toast(side === 'buy' ? '현금이 부족하거나 잔여 공급이 없습니다' : '보유한 매물이 없습니다', 'red');
      return;
    }
    const price = quoteTrade(key, side, 1, raw, now).price;
    const cash = Number(raw.cash) || 0;
    let qty = side === 'buy' ? Math.min(max, 10) : 1;
    const chips = side === 'buy'
      ? [10, 100, 1000].filter((n) => n < max).concat([max])
      : [Math.floor(held / 2), held].filter((n, i, arr) => n > 0 && arr.indexOf(n) === i);

    const body = `
      <div class="tsum">
        <div><span>지역</span><b>${city.emoji} ${esc(city.name)} <i>${esc(city.region)}</i></b></div>
        <div><span>현재가</span><b>₩${won(price)}/평</b></div>
        <div><span>${side === 'buy' ? '보유 / 잔여' : '보유'}</span><b>${won(held)}평${side === 'buy' ? ` / ${won(Math.max(0, city.supply - held))}평` : ''}</b></div>
        <div><span>부동산 현금</span><b>₩${won(cash)}</b></div>
      </div>
      <div class="input-row" style="margin-top:10px">
        <input id="landQty" type="number" inputmode="numeric" min="1" max="${max}" step="1" value="${qty}">
        <button class="btn small ghost" id="landQtyMax" type="button">최대</button>
      </div>
      <div class="chips" style="margin-top:7px" id="landQtyChips">
        ${chips.map((n) => `<button class="chip" type="button" data-q="${n}">${n === max && side === 'buy' ? `최대 ${won(n)}평` : `${won(n)}평`}</button>`).join('')}
      </div>
      <div class="note" id="landPrev" style="margin-top:9px"></div>`;

    this.ui.modal({
      title: side === 'buy' ? '🏠 매수' : '💰 매도',
      sub: `${city.name} · ${city.region} · 거래세 0.01%`,
      body,
      actions: [
        { label: '취소', onClick: () => {} },
        { label: side === 'buy' ? '매수 확정' : '매도 확정', style: 'primary', onClick: () => this.doLandTrade(key, side, qty) },
      ],
    });

    const inp = document.getElementById('landQty');
    const prev = document.getElementById('landPrev');
    const refresh = () => {
      const q = Math.max(1, Math.min(max, Math.floor(Number(inp.value) || 1)));
      qty = q;
      const quote = quoteTrade(key, side, q, raw, now);
      if (!quote.ok) {
        prev.innerHTML = `<span style="color:var(--red)">${esc(quote.reason)}</span>`;
        return;
      }
      prev.innerHTML =
        side === 'buy'
          ? `총 <b>₩${won(quote.total)}</b> + 거래세 ₩${won(quote.fee)}<br>거래 후 현금 <b>₩${won(quote.after)}</b>`
          : `총 <b>₩${won(quote.total)}</b> − 거래세 ₩${won(quote.fee)}<br>받는 금액 <b class="gold">₩${won(quote.total - quote.fee)}</b> · 거래 후 현금 ₩${won(quote.after)}`;
    };
    inp.addEventListener('input', refresh);
    inp.addEventListener('change', () => {
      inp.value = String(Math.max(1, Math.min(max, Math.floor(Number(inp.value) || 1))));
      refresh();
    });
    document.getElementById('landQtyMax').addEventListener('click', () => {
      inp.value = String(max);
      refresh();
    });
    document.getElementById('landQtyChips').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-q]');
      if (!b) return;
      inp.value = b.dataset.q;
      refresh();
    });
    refresh();
  }

  async doLandTrade(key, side, qty) {
    const city = CITY_BY_KEY[key];
    const q = Math.floor(Number(qty) || 0);
    if (!city || q <= 0) return;
    if (this._trading) return;
    this._trading = true;
    this.ui.toast('거래 처리 중…');
    try {
      const r = await this.cloud.tradeLand(key, side, q);
      if (!r.ok) {
        this.ui.toast(r.reason === 'login' ? '로그인이 필요합니다' : `거래 실패: ${r.reason}`, 'red');
        return;
      }
      this.syncProperty();
      this.save(true);
      const total = r.quote ? r.quote.total : 0;
      this.ui.toast(
        `${side === 'buy' ? '🏠 매수' : '💰 매도'} ${city.emoji}${city.name} ${won(q)}평 · ₩${won(total)}`,
        side === 'buy' ? 'green' : 'gold',
      );
    } catch (e) {
      this.ui.toast('거래 중 오류가 발생했습니다', 'red');
    } finally {
      this._trading = false;
    }
  }

  openClaimRent() {
    const amt = Math.floor(Number(this.s.land.accruedRent) || 0);
    if (!this.cloud.signedIn) {
      this.ui.toast('상단의 Google 로그인 후 이용할 수 있습니다', 'red');
      return;
    }
    if (amt < 1) {
      this.ui.toast('아직 쌓인 임대수익이 없습니다');
      return;
    }
    this.ui.modal({
      title: '💤 임대수익 수령',
      sub: `₩${won(amt)}`,
      body: `<div class="note">수령하면 부동산 계정의 <b>users/{uid}/state/cash</b> 에 더해집니다.<br>RPG 골드와는 별개이며, 다른 부동산 필드는 그대로 보존됩니다.</div>`,
      actions: [
        { label: '취소', onClick: () => {} },
        { label: '수령', style: 'primary', onClick: () => this.doClaimRent(amt) },
      ],
    });
  }

  async doClaimRent(amt) {
    if (this._claiming) return;
    this._claiming = true;
    try {
      const r = await this.cloud.claimRent(amt);
      if (!r.ok) {
        this.ui.toast(r.reason === 'login' ? '로그인이 필요합니다' : String(r.reason || '수령에 실패했습니다'), 'red');
        return;
      }
      this.s.land.accruedRent = Math.max(0, (Number(this.s.land.accruedRent) || 0) - amt);
      this.s.land.rentAt = Date.now();
      this.syncProperty();
      this.save(true);
      this.ui.toast(`💤 임대수익 ₩${won(amt)} 수령 완료`, 'gold');
    } finally {
      this._claiming = false;
    }
  }

  async doExchange(gold, cash) {
    if (this._exchanging) return;
    this._exchanging = true;
    const beforeCash = Number(this.prop.cash) || 0;
    let ok = false;
    try {
      const r = await this.cloud.addCash(cash);
      ok = r.ok;
      if (!ok) {
        // 응답이 유실됐을 수 있으니 실제 현금을 다시 읽어 확인한다(중복 환전 방지)
        await this.cloud.refreshProperty();
        const after = Number(this.cloud.prop && this.cloud.prop.cash) || 0;
        ok = after >= beforeCash + cash;
      }
    } finally {
      this._exchanging = false;
    }
    if (!ok) {
      this.ui.toast('보안 규칙으로 현금 반영에 실패했습니다. database.rules.json 반영 후 다시 시도해 주세요.', 'red');
      this.ui.render();
      return;
    }
    commitExchange(this.s, gold);
    this.save(true);
    if (this.cloud.prop) this.cloud.prop.cash = r.cash == null ? (this.cloud.prop.cash || 0) : r.cash;
    this.syncProperty();
    this.ui.toast(`💱 ₩${cash.toLocaleString()} 환전 완료 (골드 -${gold.toLocaleString()})`, 'gold');
  }

  showOfflinePopup(summary, levelUps) {
    const h = Math.floor(summary.sec / 3600);
    const m = Math.floor((summary.sec % 3600) / 60);
    const away = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    this.ui.modal({
      title: '🌙 방치 보상',
      sub: `${away} 동안 사냥을 계속했습니다.${summary.capped ? ` (최대 ${ECON.offlineCapHours}시간까지만 정산)` : ''}`,
      body: `<div class="modal-rewards">
               <div class="rw"><div class="e">💰</div><div class="v">${summary.gold.toLocaleString()}</div><div class="k">골드</div></div>
               <div class="rw"><div class="e">✨</div><div class="v">${summary.exp.toLocaleString()}</div><div class="k">경험치</div></div>
               <div class="rw"><div class="e">💎</div><div class="v">${summary.shards.toLocaleString()}</div><div class="k">강화석</div></div>
             </div>
             ${levelUps > 0 ? `<div class="note">레벨 업 +${levelUps} · 스탯이 상승했습니다.</div>` : `<div class="note">보상은 이미 반영되었습니다.</div>`}`,
      actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
    });
  }
}

const app = new App();
window.LAND_RPG = app; // 디버깅/검증용
app.boot();
