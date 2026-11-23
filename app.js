// land-rpg / app.js
// 앱 부트스트랩: 로컬 상태 로드(=게스트) → 전투/렌더/UI 연결 → 루프 → 자동 저장.
// v3: 로그인·클라우드·Firebase 없음. 네트워크 대기 없이 즉시 시작하고 오프라인에서도 완전 동작.
import { APP_VERSION, ECON, EQUIP, SKILLS, SAVE_KEY, stageDef, RARITIES, RARITY_INDEX, spriteSrc } from './src/data.js';
import {
  loadState, saveState, offlineSummary, applyOffline, tryEnhance, tryUpgradeSkill,
  shardPrice, buyShards, pullGear,
} from './src/state.js';
import { Battle } from './src/combat.js';
import {
  computeBuffs, portfolioOf, accrueRent, claimRent, applyTrade, quoteTrade, maxBuyQty,
  CITY_BY_KEY, formatGold, LAND,
} from './src/land.js';
import { Renderer } from './src/render.js';
import { UI } from './src/ui.js';
import { GameSound } from './src/sound.js';
import {
  PET_SPRITES, DUNGEON, petDef, syncPets as syncPetUnlocks, equipPet, upgradePet,
  promoteJob as promoteJobState, dungeonState, startDungeonCooldown,
} from './src/meta.js';
import {
  claimQuest as claimQuestState, claimAchievement as claimAchievementState,
  achievementStatus, claimedAchievementCount, codexStats, codexDetail, codexCity, codexGear,
} from './src/quests.js';

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

const esc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 📲 PWA 설치 완료 표시(브라우저로 다시 열었을 때 설치 버튼을 숨긴다)
const PWA_INSTALL_KEY = 'land_rpg_pwa_installed_v1';

class App {
  constructor() {
    // 구버전(v1/v2) 저장 키는 v3에서 쓰지 않는다 — 남아 있으면 함께 정리해 '싹 초기화'를 보장
    try {
      if (STORAGE && !STORAGE.getItem(SAVE_KEY)) STORAGE.removeItem('land_rpg_state_v1');
    } catch (e) { /* ignore */ }
    this.s = loadState(STORAGE);
    try { syncPetUnlocks(this.s); } catch (e) { /* ignore */ }
    this.buffs = computeBuffs(this.s);
    this.battle = new Battle(this.s, () => this.buffs);
    this.renderer = new Renderer(document.getElementById('battle'));
    this.renderer.setBattle(this.battle);
    this.renderer.effects = this.s.effects !== false;
    this.sound = new GameSound(this.s.soundOn !== false);
    this.renderer.onLoot = (kind) => this.sound.coin(kind);
    this.ui = new UI(this);
    this.actions = this.makeActions();
    this.lastTs = 0;
    this.lastSave = 0;
    this.lastRentTick = 0;
    this.startedAt = Date.now();
    this.hiddenAt = 0;
    // 📲 앱 설치 상태 — initInstall() 이 채운다(installApp 참고)
    this.deferredPrompt = null;
    this.install = { standalone: false, installed: false, canPrompt: false };
  }

  get prop() {
    return portfolioOf(this.s);
  }

  async boot() {
    this.ui.init();
    this.initInstall();
    this.renderer
      .preload(['hero_idle', 'hero_attack', 'hero_skill', ...PET_SPRITES, ...this.stageMonsterNames(this.s.stage)])
      .then(() => this.renderer.resize())
      .catch(() => {});

    const now = Date.now();
    this.checkPets(now);

    // 오프라인 임대수익 (접속 중의 25%만 적립)
    this.accrueRent(now, LAND.rentOfflineRate);

    // 오프라인 사냥 보상 (최대 12시간)
    const summary = offlineSummary(this.s, now, this.buffs);
    if (summary.sec >= 60 && (summary.gold || summary.exp || summary.shards)) {
      const ups = applyOffline(this.s, summary);
      this.save(true);
      setTimeout(() => this.showOfflinePopup(summary, ups), 450);
    }

    this.ui.render();
    this.bindAudioUnlock();
    // PWA 바로가기(?tab=land) 지원
    try {
      const tabParam = new URLSearchParams((typeof location !== 'undefined' && location.search) || '').get('tab');
      if (tabParam && ['hunt', 'gear', 'land', 'settings'].includes(tabParam)) this.ui.setTab(tabParam);
    } catch (e) { /* ignore */ }
    this.ui.refreshLive(Date.now());
    requestAnimationFrame((ts) => this.loop(ts));
    setTimeout(() => this.ui.hideBoot(), 160);

    this.bindLifecycle();
    this.registerSW();
  }

  stageMonsterNames(stage) {
    const d = stageDef(stage);
    return [...d.normals, d.boss];
  }

  /* ───────────── 메인 루프 ─────────────
   * 다음 프레임을 먼저 예약한 뒤 작업한다. 어느 한 단계에서 예외가 나도 루프가 멈추지 않는다.
   */
  loop(ts) {
    this._raf = requestAnimationFrame((t) => this.loop(t));
    const now = Date.now();
    const tsNum = typeof ts === 'number' && isFinite(ts) ? ts : now;
    let dt = this.lastTs ? tsNum - this.lastTs : 16;
    if (!isFinite(dt) || dt < 0) dt = 16;
    dt = Math.min(200, dt);
    this.lastTs = tsNum;

    let events = [];
    try {
      this.battle.tick(dt, now);
      events = this.battle.drainEvents();
    } catch (e) {
      this.reportError('battle', e);
      this.recoverBattle();
    }

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
      if (now - (this.lastPetCheck || 0) > 2000) {
        this.lastPetCheck = now;
        this.checkPets(now);
      }
    } catch (e) {
      this.reportError('save', e);
    }
  }

  /** 부동산 성장 → 펫 해금 확인 (해금되면 토스트 + 자동 동행) */
  checkPets(now = Date.now()) {
    let r;
    try {
      r = syncPetUnlocks(this.s, now);
    } catch (e) {
      return null;
    }
    if (!r.changed) return r;
    this.battle.refreshStats();
    this.save();
    if (r.newly.length) {
      for (const id of r.newly) {
        const def = petDef(id);
        if (!def) continue;
        this.ui.toast(`🐾 ${def.emoji} ${def.name} 해금!${r.equipped === id ? ' 동행 시작' : ''}`, 'gold');
        this.ui.addLog(`🐾 <b>${def.name}</b> 해금 · ${def.cond}`);
      }
      this.sound.levelUp();
      this.ui.renderIfNeeded();
    }
    return r;
  }

  /* ───────────── 오류 보고 · 자동복구 ───────────── */
  reportError(where, err) {
    const msg = (err && (err.message || err.name)) || String(err);
    this._errCounts = this._errCounts || {};
    const n = (this._errCounts[where] = (this._errCounts[where] || 0) + 1);
    if (this._lastErr !== msg) {
      this._lastErr = msg;
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
    try {
      this.battle.monsters = [];
      this.battle.boss = null;
      this.battle.dungeon = null; // 던전 중 예외가 나도 스테이지 사냥으로 복귀
      this.battle.events = [];
      this.battle.refreshStats(Date.now());
      if (!isFinite(this.battle.player.hp)) this.battle.player.hp = this.battle.stats.hpMax;
      this.battle.spawnInitial(Date.now());
    } catch (e) { /* ignore */ }
  }

  recoverRender(now) {
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
      if (ev.t === 'hit') {
        this.sound.hit(ev.crit);
        continue;
      } else if (ev.t === 'monsterDeath') {
        if (ev.dungeon) {
          if (ev.isBoss) this.ui.addLog(`👑 <b>${ev.ko}</b> 황금 보스 격파! (보상은 종료 시)`);
        } else if (ev.isBoss) {
          this.ui.addLog(`👑 <b>${ev.ko}</b> 처치! 💰${ev.gold.toLocaleString()} 💎${ev.shards}`);
        } else if (ev.shards > 0) {
          this.ui.addLog(`${ev.ko} 처치 · 💰${ev.gold} 💎${ev.shards}`);
        }
      } else if (ev.t === 'levelUp') {
        this.ui.toast(`⬆️ 레벨 업! Lv.${ev.level}`, 'green');
        this.ui.addLog(`<b>레벨 업</b> Lv.${ev.level} · 체력 완충`);
        this.ui.renderIfNeeded();
        this.sound.levelUp();
      } else if (ev.t === 'stageClear') {
        this.ui.toast(`🏅 스테이지 ${ev.stage} 클리어! 💎+${ev.bonus}`, 'gold');
        this.ui.addLog(`<b>스테이지 ${ev.stage} 클리어</b> → ${ev.next} (보너스 💎${ev.bonus})`);
        this.ui.renderIfNeeded();
        this.save(true);
        this.renderer.preload(this.stageMonsterNames(this.s.stage)).catch(() => {});
      } else if (ev.t === 'bossStart') {
        this.ui.addLog(`⚔️ <b>${ev.ko}</b> 등장 — ${ECON.bossTimeLimitMs / 1000}초 제한`);
        this.sound.boss();
      } else if (ev.t === 'bossFail') {
        const why = ev.why === 'timeout' ? '시간 초과' : '전투 불능';
        this.ui.toast(`보스 퇴치 실패 (${why}) · 조금 더 강해져서 재도전`, 'red');
        this.ui.addLog(`보스 <b>${ev.ko}</b> 실패(${why}) · ${ECON.bossRetryKills}마리 더 처치하면 재도전`);
        this.ui.renderIfNeeded();
      } else if (ev.t === 'playerDeath') {
        this.ui.addLog('💀 전투 불능 — 3초 후 부활');
      } else if (ev.t === 'revive') {
        this.ui.addLog('✨ 부활했습니다');
      } else if (ev.t === 'dungeonStart') {
        this.ui.addLog(`🔥 <b>황금 던전</b> 시작 — ${DUNGEON.durationMs / 1000}초 보스 러시`);
        this.ui.toast('🔥 황금 던전 시작! 30초간 몰아칩니다', 'gold');
        this.ui.renderIfNeeded();
      } else if (ev.t === 'dungeonBoss') {
        this.ui.addLog(`👑 <b>${ev.ko}</b> 황금 보스 등장!`);
      } else if (ev.t === 'dungeonEnd') {
        this.battle.refreshStats();
        this.checkPets(now);
        this.save(true);
        this.sound.gacha('hero');
        this.ui.addLog(
          `🔥 던전 완료 · 처치 ${ev.kills + ev.bossKills}마리(보스 ${ev.bossKills}) · 💰+${ev.gold.toLocaleString()} 💎+${ev.shards}`,
        );
        this.showDungeonResult(ev);
        this.ui.renderIfNeeded();
      }
    }
  }

  /* ───────────── 임대수익 적립 ───────────── */
  accrueRent(now, rate = 1) {
    return accrueRent(this.s, now, rate);
  }

  save(immediate = false) {
    if (this._resetting) return; // 초기화 직후(새로고침 전 beforeunload 저장)로 데이터가 되살아나지 않게
    this.battle.writeHp();
    this.s.lastActiveAt = Date.now();
    saveState(STORAGE, this.s);
    if (immediate) this.lastSave = Date.now();
  }

  /* ───────────── 수명주기 ───────────── */
  /** 모바일 브라우저 정책: 첫 터치/클릭/키 입력에서 AudioContext unlock */
  bindAudioUnlock() {
    const unlock = () => {
      try { this.sound.unlock(); } catch (e) { /* ignore */ }
    };
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((ev) => {
      document.addEventListener(ev, unlock, { passive: true });
    });
  }

  bindLifecycle() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.hiddenAt = Date.now();
        this.accrueRent(Date.now(), 1);
        this.save(true);
      } else {
        const away = Date.now() - (this.hiddenAt || Date.now());
        // 자리를 비운 동안의 임대수익은 접속 중의 25%만 적립
        const rent = this.accrueRent(Date.now(), LAND.rentOfflineRate);
        if (rent >= 1) this.ui.toast(`💤 방치 임대수익 +${formatGold(rent)} (${Math.round(LAND.rentOfflineRate * 100)}%)`, 'gold');
        if (away > 120000) {
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
    window.addEventListener('beforeunload', () => this.save(true));
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
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
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

    try {
      if (!navigator.serviceWorker.controller) return;
      let done = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (done) return;
        done = true; // 페이지당 한 번만
        this.save(true);
        setTimeout(() => location.reload(), 350);
      });
    } catch (e) { /* ignore */ }
  }

  /* ───────────── 📲 앱 설치 (PWA · 홈 화면에 추가) ───────────── */
  isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) { /* ignore */ }
    try {
      if (window.navigator && window.navigator.standalone === true) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  initInstall() {
    let flag = false;
    try { flag = !!(STORAGE && STORAGE.getItem(PWA_INSTALL_KEY) === '1'); } catch (e) { /* ignore */ }
    this.deferredPrompt = null;
    this.install = { standalone: this.isStandalone(), installed: flag, canPrompt: false };

    const markInstalled = (on) => {
      this.install.installed = on;
      try {
        if (!STORAGE) return;
        if (on) STORAGE.setItem(PWA_INSTALL_KEY, '1');
        else STORAGE.removeItem(PWA_INSTALL_KEY);
      } catch (e) { /* ignore */ }
    };

    // Chrome·삼성 인터넷: 설치 프롬프트를 잡아 두었다가 버튼 클릭 때 그대로 띄운다(원클릭 설치)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.install.canPrompt = true;
      if (this.install.installed) markInstalled(false); // 지웠다면 다시 설치할 수 있게
      this.ui.syncInstall();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.install.canPrompt = false;
      markInstalled(true);
      this.ui.syncInstall();
      this.ui.toast('📲 홈 화면에 설치 완료! 아이콘으로 바로 실행하세요', 'gold');
    });

    this.ui.syncInstall();
  }

  /** 📲 설치 버튼 클릭 — 프롬프트가 있으면 즉시 설치, 없으면 브라우저별 안내 모달 */
  async installApp() {
    const p = this.deferredPrompt;
    if (!p || typeof p.prompt !== 'function') {
      this.ui.showInstallGuide();
      return;
    }
    this.deferredPrompt = null;
    try {
      const prompted = p.prompt();
      if (prompted && typeof prompted.then === 'function') await prompted;
      let outcome = 'accepted';
      if (p.userChoice && typeof p.userChoice.then === 'function') {
        const choice = await p.userChoice;
        outcome = (choice && choice.outcome) || 'accepted';
      }
      this.install.canPrompt = false;
      this.ui.syncInstall();
      if (outcome === 'accepted') {
        this.ui.toast('📲 설치를 시작했습니다 — 홈 화면에서 확인하세요', 'gold');
      } else {
        this.ui.toast('설치를 취소했습니다 · 설정 탭에서 다시 시도할 수 있어요');
      }
    } catch (e) {
      this.install.canPrompt = false;
      this.ui.syncInstall();
      this.ui.showInstallGuide();
    }
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
      install: () => this.installApp(),
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
      toggleSound: () => {
        this.s.soundOn = this.s.soundOn === false;
        this.sound.setEnabled(this.s.soundOn);
        if (this.s.soundOn) {
          this.sound.unlock();
          this.sound.ui();
        }
        this.save();
        this.ui.render();
        this.ui.syncSound();
        this.ui.toast(this.s.soundOn ? '🔊 효과음 켜짐' : '🔇 효과음 꺼짐');
      },
      gachaCur: (cur) => {
        this.s.gacha.cur = cur === 'shards' ? 'shards' : 'gold';
        this.save();
        this.ui.render();
      },
      pullGacha: (times) => {
        this.sound.unlock();
        const n = Number(times) >= 10 ? 10 : 1;
        const r = pullGear(this.s, n, Math.random);
        if (!r.ok) {
          this.ui.toast(r.reason || '뽑기할 수 없습니다', 'red');
          return;
        }
        this.battle.refreshStats();
        this.save(true);
        this.sound.gacha(r.best);
        for (const item of r.results) codexGear(this.s, item.rarity); // 📖 장비 등급 도감
        this.ui.render();
        this.showGachaResult(r, n);
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

      buyShards: (n) => {
        const price = shardPrice(this.s);
        const count = n === 'max' ? Math.floor(this.s.gold / price) : Math.floor(Number(n) || 0);
        if (count <= 0) {
          this.ui.toast('골드가 부족합니다', 'red');
          return;
        }
        const r = buyShards(this.s, count);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        this.save(true);
        this.ui.toast(`💎 강화석 ${r.n}개 구매 (💰${r.cost.toLocaleString()})`, 'green');
        this.ui.render();
      },

      /* ── 부동산 ── */
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
      landSearch: (q) => {
        this.s.land.q = String(q || '').slice(0, 30);
        this.s.land.page = 1;
        this.ui.updateLandList();
      },
      claimRent: () => this.openClaimRent(),

      /* ── v3.2: 전직 · 펫 · 황금 던전 ── */
      promoteJob: () => {
        this.sound.unlock();
        const r = promoteJobState(this.s);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        this.renderer.onEvents(
          [{ t: 'promote', job: r.to.name, tier: r.to.tier, badge: r.to.badge, color: r.to.color }],
          Date.now(),
        );
        this.ui.addLog(
          `✨ <b>전직</b> ${r.from.name} → <b>${r.to.name}</b> · 공격 +${r.to.atkPct}% 체력 +${r.to.hpPct}%`,
        );
        this.ui.modal({
          title: `✨ 전직! ${r.to.badge} ${r.to.name}`,
          sub: `${r.from.name} → ${r.to.name} · 칭호 획득`,
          body: `<div class="modal-rewards">
                   <div class="rw"><div class="e">⚔️</div><div class="v">+${r.to.atkPct}%</div><div class="k">공격력</div></div>
                   <div class="rw"><div class="e">❤️</div><div class="v">+${r.to.hpPct}%</div><div class="k">최대 체력</div></div>
                   <div class="rw"><div class="e">🏅</div><div class="v">${r.to.tier + 1}/4</div><div class="k">전직 단계</div></div>
                 </div>
                 <div class="note">${esc(r.to.line)}<br>영구 보너스는 즉시 적용되었습니다.</div>`,
          actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
        });
        this.ui.render();
      },

      equipPet: (id) => {
        const r = equipPet(this.s, id);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        this.battle.refreshStats();
        this.save();
        this.sound.ui();
        this.ui.toast(`🐾 ${r.pet.emoji} ${r.pet.name} 동행 시작`, 'green');
        this.ui.render();
      },

      upgradePet: (id) => {
        const r = upgradePet(this.s, id);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        const def = petDef(id);
        this.battle.refreshStats();
        this.save(true);
        this.sound.levelUp();
        this.ui.toast(`🐾 ${def ? def.emoji : ''} ${def ? def.name : '펫'} Lv.${r.lv} 강화! (💎${r.spent})`, 'green');
        this.ui.addLog(`🐾 <b>${def ? def.name : '펫'}</b> 강화 Lv.${r.lv} (💎${r.spent})`);
        this.ui.render();
      },

      enterDungeon: (kind) => {
        this.sound.unlock();
        const now = Date.now();
        if (this.battle.dungeon) {
          this.ui.toast('이미 던전이 진행 중입니다');
          return;
        }
        const ds = dungeonState(this.s, now);
        const paid = kind === 'shards' && !ds.ready; // 무료가 가능하면 강화석을 쓰지 않는다
        if (!ds.ready && !paid) {
          this.ui.toast('무료 입장 준비 중입니다');
          return;
        }
        if (paid && !ds.canPay) {
          this.ui.toast(`강화석이 부족합니다 (💎${DUNGEON.shardCost} 필요)`, 'red');
          return;
        }
        const r = this.battle.startDungeon(now);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        if (paid) this.s.shards = Math.max(0, this.s.shards - DUNGEON.shardCost);
        else startDungeonCooldown(this.s, now);
        this.save(true);
        this.sound.boss();
        this.ui.toast(
          `🔥 황금 던전 입장! ${DUNGEON.durationMs / 1000}초 동안 몰아칩니다${paid ? ` (💎${DUNGEON.shardCost})` : ' (무료)'}`,
          'gold',
        );
        this.ui.render();
      },

      /* ── v3.3: 🎯 미션 · 🏆 업적 · 📖 도감 ── */
      claimQuest: (id) => {
        this.sound.unlock();
        const r = claimQuestState(this.s, id, Date.now());
        if (!r.ok) {
          this.ui.toast(r.reason || '미션 보상을 받을 수 없습니다', 'red');
          return;
        }
        this.save(true);
        this.sound.fanfare();
        const gains = [
          r.gold ? `💰${r.gold.toLocaleString()}` : '',
          r.shards ? `💎${r.shards.toLocaleString()}` : '',
        ].filter(Boolean).join(' ');
        this.ui.toast(`🎯 미션 완료 · ${gains}`, 'gold');
        this.ui.addLog(`🎯 <b>${esc(r.quest.title)}</b> 완료 · ${gains}${r.next ? ` → 다음: ${esc(r.next.title)}` : ' · 모든 미션 완료!'}`);
        this.ui.render();
      },

      claimAchievement: (id) => {
        this.sound.unlock();
        const r = claimAchievementState(this.s, id);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        this.battle.refreshStats(); // 영구 스탯 보너스 반영
        this.save(true);
        this.sound.levelUp();
        const bonus = r.achievement.atkPct || r.achievement.goldPct
          ? ` · 공격 +${r.achievement.atkPct || 0}% 골드 +${r.achievement.goldPct || 0}%`
          : '';
        this.ui.toast(`🏆 업적 달성 · ${r.achievement.icon} ${r.achievement.title} 💎${r.shards}${bonus}`, 'gold');
        this.ui.addLog(`🏆 <b>${esc(r.achievement.title)}</b> 수령 · 💎${r.shards}${bonus}`);
        this.ui.render();
        if (!this.ui.el.modalRoot.classList.contains('hidden')) this.showAchievements();
      },

      openCodex: (tab) => this.showCodex(tab),
      openAchievements: () => this.showAchievements(),

      resetGame: () => {
        this.ui.modal({
          title: '⚠️ 게임 초기화',
          sub: '이 기기의 진행도(레벨·골드·부동산)가 모두 사라집니다. 되돌릴 수 없습니다.',
          actions: [
            { label: '취소', onClick: () => {} },
            {
              label: '초기화',
              style: 'primary',
              onClick: () => {
                this._resetting = true;
                try {
                  STORAGE && STORAGE.removeItem(SAVE_KEY);
                  STORAGE && STORAGE.removeItem('land_rpg_state_v1'); // 구버전 키도 정리
                } catch (e) { /* ignore */ }
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
    const now = Date.now();
    const land = this.s.land;
    const held = Math.floor(Number(land.owned[key]) || 0);
    const max = side === 'buy' ? maxBuyQty(key, this.s, now) : held;
    if (max <= 0) {
      this.ui.toast(
        side === 'buy' ? '골드가 부족하거나 잔여 공급이 없습니다' : '보유한 매물이 없습니다',
        'red',
      );
      return;
    }
    const price = quoteTrade(key, side, 1, this.s, now).price;
    let qty = side === 'buy' ? Math.min(max, 10) : 1;
    const chips = side === 'buy'
      ? [1, 10, 100, 1000].filter((n) => n < max).concat([max])
      : [Math.floor(held / 2), held].filter((n, i, arr) => n > 0 && arr.indexOf(n) === i);

    const body = `
      <div class="tsum">
        <div><span>지역</span><b>${city.emoji} ${esc(city.name)} <i>${esc(city.region)}</i></b></div>
        <div><span>현재가</span><b>💰${price.toLocaleString()}/평</b></div>
        <div><span>${side === 'buy' ? '보유 / 잔여' : '보유'}</span><b>${held.toLocaleString()}평${side === 'buy' ? ` / ${Math.max(0, city.supply - held).toLocaleString()}평` : ''}</b></div>
        <div><span>보유 골드</span><b>💰${this.s.gold.toLocaleString()}</b></div>
      </div>
      <div class="input-row" style="margin-top:10px">
        <input id="landQty" type="number" inputmode="numeric" min="1" max="${max}" step="1" value="${qty}">
        <button class="btn small ghost" id="landQtyMax" type="button">최대</button>
      </div>
      <div class="chips" style="margin-top:7px" id="landQtyChips">
        ${chips.map((n) => `<button class="chip" type="button" data-q="${n}">${n === max && side === 'buy' ? `최대 ${n.toLocaleString()}평` : `${n.toLocaleString()}평`}</button>`).join('')}
      </div>
      <div class="note" id="landPrev" style="margin-top:9px"></div>`;

    this.ui.modal({
      title: side === 'buy' ? '🏠 매수' : '💰 매도',
      sub: `${city.name} · ${city.region} · 거래세 ${(LAND.feeRate * 100).toFixed(1)}%`,
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
      const quote = quoteTrade(key, side, q, this.s, Date.now());
      if (!quote.ok) {
        prev.innerHTML = `<span style="color:var(--red)">${esc(quote.reason)}</span>`;
        return;
      }
      prev.innerHTML =
        side === 'buy'
          ? `총 <b>💰${quote.total.toLocaleString()}</b> + 거래세 ${quote.fee.toLocaleString()}<br>거래 후 골드 <b>💰${quote.after.toLocaleString()}</b>`
          : `총 <b>💰${quote.total.toLocaleString()}</b> − 거래세 ${quote.fee.toLocaleString()}<br>받는 골드 <b class="gold">💰${(quote.total - quote.fee).toLocaleString()}</b> · 거래 후 💰${quote.after.toLocaleString()}`;
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

  doLandTrade(key, side, qty) {
    const city = CITY_BY_KEY[key];
    const q = Math.floor(Number(qty) || 0);
    if (!city || q <= 0) return;
    const r = applyTrade(this.s, key, side, q, Date.now());
    if (!r.ok) {
      this.ui.toast(`거래 실패: ${r.reason}`, 'red');
      return;
    }
    // 건물주 버프 즉시 반영
    this.buffs = computeBuffs(this.s);
    this.battle.refreshStats();
    if (side === 'buy') codexCity(this.s, key, this.s.land.owned[key]); // 📖 지역 도감 기록(매도해도 유지)
    this.save(true);
    this.ui.toast(
      `${side === 'buy' ? '🏠 매수' : '💰 매도'} ${city.emoji}${city.name} ${q.toLocaleString()}평 · 💰${r.quote.total.toLocaleString()}`,
      side === 'buy' ? 'green' : 'gold',
    );
    const b = this.buffs;
    if (side === 'buy' && b.active) {
      this.ui.toast(`🏢 건물주 버프 · 공격 +${b.atkPct}% · 골드 +${b.goldPct}% · 체력 +${b.hpPct}%`, 'gold');
    }
    this.checkPets(); // 거래로 지역·평수·총자산이 바뀌면 펫 해금 확인
    this.ui.render();
  }

  openClaimRent() {
    const amt = Math.floor(Number(this.s.land.accruedRent) || 0);
    if (amt < 1) {
      this.ui.toast('아직 쌓인 임대수익이 없습니다');
      return;
    }
    const p = portfolioOf(this.s);
    this.ui.modal({
      title: '💤 임대수익 수령',
      sub: `💰 ${amt.toLocaleString()}`,
      body: `<div class="note">보유 매물 ${p.cities}곳 · ${p.pyeong.toLocaleString()}평에서 쌓인 임대수익을 골드로 받습니다.<br>
        받은 골드는 바로 장비 강화 재료(강화석)나 추가 매물에 쓸 수 있습니다.</div>`,
      actions: [
        { label: '취소', onClick: () => {} },
        {
          label: '수령',
          style: 'primary',
          onClick: () => {
            const got = claimRent(this.s);
            this.s.records.totalRent = (this.s.records.totalRent || 0) + got;
            this.save(true);
            this.ui.toast(`💤 임대수익 💰${got.toLocaleString()} 수령`, 'gold');
            this.checkPets();
            this.ui.render();
          },
        },
      ],
    });
  }

  /* ───────────── 📖 도감 모달 ───────────── */
  showCodex(tab = 'monster') {
    const s = this.s;
    const c = codexStats(s);
    const d = codexDetail(s);
    const cur = ['monster', 'city', 'gear', 'pet'].includes(tab) ? tab : 'monster';
    const tabs = [
      ['monster', `🐾 몬스터 ${c.monsters.seen}/${c.monsters.total}`],
      ['city', `🏙️ 부동산 ${c.cities.seen}/${c.cities.total}`],
      ['gear', `🎒 장비 ${c.gear.seen}/${c.gear.total}`],
      ['pet', `🐉 펫 ${c.pets.seen}/${c.pets.total}`],
    ];
    const tabBar = `<div class="subtabs codex-tabs">${tabs
      .map(([k, l]) => `<button class="subtab ${cur === k ? 'active' : ''}" type="button" data-action="open-codex" data-value="${k}">${l}</button>`)
      .join('')}</div>`;

    let body = '';
    if (cur === 'monster') {
      body = `<div class="codex-grid">${d.monsters
        .map(
          (m) => `<div class="cx ${m.met ? '' : 'lock'} ${m.boss ? 'boss' : ''}">
            <img src="${spriteSrc(m.name)}" alt="" loading="lazy">
            <span class="cx-n">${m.met ? esc(m.ko) : '???'}</span>
            <span class="cx-k">${m.met ? (m.kills > 0 ? `×${m.kills.toLocaleString()}` : '✓') : '미해금'}</span>
          </div>`,
        )
        .join('')}</div>
        <div class="note" style="margin-top:10px">몬스터는 <b>마주치면</b> 해금되고, 처치 수가 함께 기록됩니다. 보스는 금빛 테두리.</div>`;
    } else if (cur === 'city') {
      body = d.cities.length
        ? `<div class="codex-city-list">${d.cities
            .map(
              (ct) => `<div class="kv"><span class="k">${ct.emoji} ${esc(ct.name)} <i class="dim">${esc(ct.region)}</i></span><span class="v">${ct.pyeong.toLocaleString()}평</span></div>`,
            )
            .join('')}</div>
          <div class="note" style="margin-top:10px">매수한 지역이 기록됩니다. <b>매도해도 도감 기록은 유지</b>되고, 역대 최대 보유 평수가 남습니다.</div>`
        : `<div class="empty">아직 매수한 지역이 없습니다.<br>부동산 탭에서 첫 매물을 사면 도감이 열립니다.</div>`;
    } else if (cur === 'gear') {
      body = `<div class="codex-gear">${d.gear
        .map(
          (g) => `<div class="kv"><span class="k"><span class="rb ${g.id}">${g.name}</span></span><span class="v">${
            g.got
              ? `획득 ${g.count > 1 ? `${g.count}회` : '✓'}${g.slots.length ? ` · 장착 ${g.slots.map((sl) => EQUIP[sl].icon).join('')}` : ''}`
              : '미획득'
          }</span></div>`,
        )
        .join('')}</div>
        <div class="note" style="margin-top:10px">장비 뽑기로 얻은 등급이 기록됩니다. 전설은 40회 안에 1개 확정(천장).</div>`;
    } else {
      body = `<div class="codex-pets">${d.pets
        .map(
          (p) => `<div class="cx-pet ${p.unlocked ? '' : 'lock'}">
            <img src="assets/sprites/pet/${p.sprite}.png" alt="" loading="lazy">
            <div class="cx-pet-mid"><b>${p.emoji} ${esc(p.name)}</b><span>${p.unlocked ? '해금 완료 · 동행 가능' : `🔒 ${esc(p.cond)}`}</span></div>
          </div>`,
        )
        .join('')}</div>
        <div class="note" style="margin-top:10px">부동산 조건을 채우면 자동으로 해금됩니다(4종).</div>`;
    }

    const milestone = c.milestone
      ? `마일스톤 <b>${c.milestone.pct}%</b> 달성 — ${c.milestone.label} 적용 중`
      : '아직 마일스톤 없음';
    const next = c.next ? `<br>다음 ${c.next.pct}% → ${c.next.label}` : '<br>모든 마일스톤 달성! 🎉';

    this.ui.modal({
      title: `📖 도감 <span class="tiny" style="color:var(--gold)">${c.pct}%</span>`,
      sub: `몬스터 ${c.monsters.seen}/${c.monsters.total} · 지역 ${c.cities.seen}/${c.cities.total} · 장비 ${c.gear.seen}/${c.gear.total} · 펫 ${c.pets.seen}/${c.pets.total}`,
      body: `${tabBar}<div style="margin-top:12px"></div>${body}
        <div class="note gold-note" style="margin-top:10px">수집률 <b>${c.pct}%</b> · ${milestone}${next}</div>`,
      actions: [{ label: '닫기', style: 'primary', onClick: () => {} }],
    });
  }

  /* ───────────── 🏆 업적 모달 ───────────── */
  showAchievements() {
    const list = achievementStatus(this.s);
    const claimed = claimedAchievementCount(this.s);
    const rows = list
      .map(
        (a) => `<div class="ach-row ${a.claimed ? 'done' : ''} ${a.claimable ? 'ready' : ''}">
          <div class="ach-ico">${a.icon}</div>
          <div class="ach-mid">
            <div class="ach-name">${esc(a.title)}<span class="dim"> ${esc(a.desc)}</span></div>
            <div class="prog tiny-prog"><i style="width:${a.pct * 100}%"></i></div>
            <div class="tiny dim">${Math.min(a.cur, a.goal).toLocaleString()} / ${a.goal.toLocaleString()}${a.bonusText ? ` · ${a.bonusText}` : ''}</div>
          </div>
          <div class="ach-act">${
            a.claimed
              ? '<span class="tiny" style="color:var(--green)">수령 ✓</span>'
              : a.claimable
                ? `<button class="btn small primary" type="button" data-action="claim-achievement" data-value="${a.id}">💎${a.shards} 수령</button>`
                : `<span class="tiny dim">💎${a.shards}</span>`
          }</div>
        </div>`,
      )
      .join('');
    this.ui.modal({
      title: '🏆 업적',
      sub: `${claimed}/${list.length} 수령 · 달성하면 💎 강화석 또는 소폭 영구 보너스를 받습니다.`,
      body: `<div class="ach-list">${rows}</div>`,
      actions: [{ label: '닫기', style: 'primary', onClick: () => {} }],
    });
  }

  showGachaResult(r, n) {
    const counts = {};
    for (const item of r.results) counts[item.rarity] = (counts[item.rarity] || 0) + 1;
    const summary = RARITIES.filter((x) => counts[x.id])
      .map((x) => `<span class="rate-chip"><span class="rb ${x.id}">${x.name}</span>×${counts[x.id]}</span>`)
      .join('');
    const rows = r.results
      .map((item) => {
        const def = EQUIP[item.slot];
        const tag = item.equipped
          ? item.replaced && item.shards
            ? `교체 장착 · 이전 분해 +💎${item.shards}`
            : 'NEW 자동 장착'
          : `중복 분해 +💎${item.shards}`;
        return `<div class="gr-row ${item.equipped ? '' : 'dust'}">
          <span class="ico">${def.icon}</span>
          <span class="nm">${def.name}</span>
          <span class="rb ${item.rarity}">${item.name}</span>
          <span class="tag">${tag}</span>
        </div>`;
      })
      .join('');
    const best = RARITIES[RARITY_INDEX[r.best] || 0];
    const unit = r.cur === 'shards' ? '💎' : '💰';
    this.ui.modal({
      title: '🎁 장비 뽑기 결과',
      sub: `${n}회 · ${unit}${r.spent.toLocaleString()} 사용 · 최고 ${best.name}`,
      body: `<div class="gr-sum">${summary}</div>
             <div class="gacha-result">${rows}</div>
             <div class="note" style="margin-top:9px">분해 💎+${r.shards} · 천장까지 ${r.pityLeft}회 · 누적 ${r.total}회</div>`,
      actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
    });
  }

  showDungeonResult(ev) {
    this.ui.modal({
      title: '🔥 황금 던전 완료',
      sub: `${ev.early ? '조기 종료' : `${DUNGEON.durationMs / 1000}초 종료`} · 처치 ${ev.kills + ev.bossKills}마리(보스 ${ev.bossKills})`,
      body: `<div class="modal-rewards">
               <div class="rw"><div class="e">💰</div><div class="v">${ev.gold.toLocaleString()}</div><div class="k">골드</div></div>
               <div class="rw"><div class="e">💎</div><div class="v">${ev.shards.toLocaleString()}</div><div class="k">강화석</div></div>
               <div class="rw"><div class="e">⚔️</div><div class="v">${ev.dmg.toLocaleString()}</div><div class="k">총 피해</div></div>
             </div>
             <div class="note" style="margin-top:9px">보상은 이미 반영되었습니다. 원래 스테이지 자동사냥으로 복귀했습니다.</div>`,
      actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
    });
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
