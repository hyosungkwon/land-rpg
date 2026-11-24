// land-rpg / app.js
// 앱 부트스트랩: 로컬 상태 로드(=게스트) → 전투/렌더/UI 연결 → 루프 → 자동 저장.
// v3: 로그인·클라우드·Firebase 없음. 네트워크 대기 없이 즉시 시작하고 오프라인에서도 완전 동작.
import { APP_VERSION, ECON, EQUIP, EQUIP_MAX_LV, SKILLS, SAVE_KEY, stageDef, RARITIES, RARITY_INDEX, spriteSrc, enhanceCost } from './src/data.js';
import {
  loadState, saveState, offlineSummary, applyOffline, tryEnhance, tryUpgradeSkill,
  shardPrice, buyShards, pullGear, recordNews, enhanceMaxCount, normalizeState, compareGear,
} from './src/state.js';
import {
  gearItem, gearIcon, gearOptionList, equippedItem, equippedRarity, gearOwned, gearOptionSummary,
  equipGear, dismantleGear, bulkDismantle, dismantleTargets, dismantleValue, itemScore, GEAR_OPTS,
} from './src/gear.js';

const GEAR_OPT_LABEL = (k) => (GEAR_OPTS[k] ? `${GEAR_OPTS[k].icon} ${GEAR_OPTS[k].name}` : k);
import { encodeSave, decodeSave, summarizeSave } from './src/savecode.js';
import { Battle } from './src/combat.js';
import {
  computeBuffs, portfolioOf, accrueRent, claimRent, applyTrade, quoteTrade, maxBuyQty,
  CITY_BY_KEY, formatGold, LAND, LANDMARK, landmarkQuote, buildLandmark as buildLandmarkState,
} from './src/land.js';
import { activeNews, newsCovers } from './src/region.js';
import { Renderer } from './src/render.js';
import { UI } from './src/ui.js';
import { GameSound } from './src/sound.js';
import {
  PET_SPRITES, PET_EVO_SPRITES, DUNGEON, petDef, syncPets as syncPetUnlocks, equipPet, upgradePet,
  promoteJob as promoteJobState, dungeonState, startDungeonCooldown,
  PETS, evolvePet as evolvePetState, petEvolveInfo, petStageInfo, petSkillOf,
} from './src/meta.js';
import {
  TOWER_FLOORS, TOWER_MAX_FLOOR, TOWER_GIMMICKS, towerFloor, towerProgress, towerGimmickText,
  towerGoalText, towerRewardText, towerUnlocked, towerGimmicks, towerLockReason,
} from './src/tower.js';
import {
  claimQuest as claimQuestState, claimAchievement as claimAchievementState,
  achievementStatus, claimedAchievementCount, codexStats, codexDetail, codexCity, codexGear,
} from './src/quests.js';
import {
  REBIRTH, REBIRTH_TRAITS, rebirthStatus, rebirthBonus, rebirthStartGold, rebirthPointsFor,
  doRebirth as doRebirthState, upgradeTrait as upgradeRebirthTraitState,
  traitLevel, traitCost, traitSummary,
  rebirthStartOptions, rebirthJumpCap, rebirthPrevBest, rebirthJumpBonus, rebirthJumpStage,
} from './src/rebirth.js';

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
// 💾 v3.6: 세이브 코드 복원 직전의 세이브를 보관하는 키(같은 저장 키 체계를 건드리지 않는다)
const PREV_SAVE_KEY = `${SAVE_KEY}_prev`;

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
    this.renderer.shakeOn = this.s.screenShake !== false; // v4.3 화면 흔들림 설정
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
    // 💾 v3.6: 복원 직전에 보관해 둔 세이브(설정 탭 '직전 세이브로 복구')
    this.prevSave = this.readPrevSave();
    this._pendingSave = null;
  }

  get prop() {
    return portfolioOf(this.s);
  }

  async boot() {
    this.ui.init();
    this.initInstall();
    // v4.1: 지금 테마 배경은 바로, 나머지 7종은 한가할 때 미리 받아 둔다
    this.renderer.preloadBackgrounds();
    this.renderer
      .preload(['hero_idle', 'hero_attack', 'hero_skill', 'fx_claw', 'fx_burst', ...PET_SPRITES, ...PET_EVO_SPRITES, ...this.stageMonsterNames(this.s.stage)])
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

    // PWA 바로가기(?tab=hunt&sub=growth) — 사냥 탭 서브 탭까지 바로 열기
    try {
      const subParam = new URLSearchParams((typeof location !== 'undefined' && location.search) || '').get('sub');
      if (subParam && ['skill', 'growth', 'quest'].includes(subParam)) this.ui.huntSub = subParam;
    } catch (e) { /* ignore */ }
    this.ui.render();
    this.checkNews(now);
    this.bindAudioUnlock();
    // PWA 바로가기(?tab=land&sub=buff) — 부동산 서브 탭까지 바로 열기
    try {
      const qs = new URLSearchParams((typeof location !== 'undefined' && location.search) || '');
      const landSub = qs.get('sub');
      if (qs.get('tab') === 'land' && landSub && ['home', 'market', 'buff'].includes(landSub)) {
        this.s.land.sub = landSub;
      }
    } catch (e) { /* ignore */ }
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
      if (now - (this.lastNewsCheck || 0) > 1000) {
        this.lastNewsCheck = now;
        this.checkNews(now);
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
      this.battle.tower = null; // 탑 도전 중 예외가 나도 스테이지 사냥으로 복귀
      this.battle.syncStage();
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
      } else if (ev.t === 'gearDrop') {
        // 🎒 v4.0 장비 드랍 — 인벤토리/자동 장착
        const rar = RARITIES[RARITY_INDEX[ev.rarity] || 0];
        if (ev.duplicate) {
          this.ui.addLog(`🎒 <b>${esc(ev.ko)}</b> 중복 획득 → 💎${ev.shards}`);
        } else {
          this.ui.addLog(`🎒 <b>${esc(ev.ko)}</b> 획득 (${rar.name})${ev.equipped ? ' · 자동 장착' : ' · 인벤토리 보관'}`);
          if ((RARITY_INDEX[ev.rarity] || 0) >= 2 || ev.isBoss) {
            this.ui.toast(`🎒 ${rar.name} ${ev.ko}!${ev.equipped ? ' 자동 장착' : ' 획득'}`, 'gold');
          }
          this.sound.gacha(rar.id);
          this.ui.renderIfNeeded();
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
        // v3.5: 환생 해금 · ∞ 무한 구간 돌파 안내
        if (ev.next === REBIRTH.stageReq) {
          this.ui.toast(`♾️ 환생(초월) 해금! 사냥 탭에서 초월할 수 있습니다`, 'gold');
          this.ui.addLog('♾️ <b>환생 해금</b> · 이제 사냥 회차를 새로 시작해 영구 특성을 모을 수 있습니다');
          this.sound.fanfare();
          this.ui.renderIfNeeded();
        } else if (ev.next === 31) {
          this.ui.toast('♾️ S31 — 무한 구간 돌입! 이후 스테이지는 끝없이 이어집니다', 'gold');
          this.ui.addLog('♾️ <b>S31 무한 구간</b> — 스테이지 상한 없이 계속 오릅니다');
          this.sound.fanfare();
        } else if (ev.next > 31 && ev.next % 10 === 0) {
          this.ui.toast(`♾️ S${ev.next} 돌파!`, 'gold');
        }
      } else if (ev.t === 'bossStart') {
        this.ui.addLog(`⚔️ <b>${ev.ko}</b> 등장 — ${ECON.bossTimeLimitMs / 1000}초 제한`);
        this.ui.announce(`보스 등장 — ${ev.ko} · ${ECON.bossTimeLimitMs / 1000}초 제한`);
        this.sound.boss();
      } else if (ev.t === 'bossFail') {
        const why = ev.why === 'timeout' ? '시간 초과' : '전투 불능';
        this.ui.toast(`보스 퇴치 실패 (${why}) · 조금 더 강해져서 재도전`, 'red');
        this.ui.addLog(`보스 <b>${ev.ko}</b> 실패(${why}) · ${ECON.bossRetryKills}마리 더 처치하면 재도전`);
        this.ui.renderIfNeeded();
      } else if (ev.t === 'playerDeath') {
        this.ui.addLog('💀 전투 불능 — 3초 후 부활');
        this.ui.announce('전투 불능 — 3초 뒤 부활합니다');
      } else if (ev.t === 'revive') {
        this.ui.addLog('✨ 부활했습니다');
        this.ui.announce(`부활 — ${Math.round((ev.graceMs || 0) / 100) / 10}초 동안 받는 피해 ${ev.reducePct || 0}% 경감`);
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
      } else if (ev.t === 'towerStart') {
        this.ui.addLog(
          `🗼 <b>도전의 탑 ${ev.n}층</b> ${esc(ev.name)} — ${(ev.gimmicks || []).map((id) => (TOWER_GIMMICKS[id] ? TOWER_GIMMICKS[id].name : id)).join(' · ')}`,
        );
        this.ui.toast(`🗼 ${ev.n}층 시작! ${ev.bossOnly ? '보스 격파' : `${ev.goal}마리 처치`} · ${Math.round(ev.duration / 1000)}초`, 'gold');
        this.sound.boss();
        this.ui.renderIfNeeded();
      } else if (ev.t === 'towerFrenzy') {
        this.ui.addLog(`🔥 ${ev.n}층 보스 광폭 — 공격력 상승(${ev.step}회)`);
      } else if (ev.t === 'towerEnd') {
        this.battle.refreshStats();
        this.checkPets(now);
        this.save(true);
        if (ev.how === 'clear') {
          this.sound.fanfare();
          const gains = [ev.gold ? `💰+${ev.gold.toLocaleString()}` : '', ev.shards ? `💎+${ev.shards}` : '', ev.points ? `✨+${ev.points}P` : '', ev.item ? `🎒${ev.item.name}` : '']
            .filter(Boolean).join(' ');
          this.ui.addLog(`🗼 <b>${ev.n}층 클리어</b>${ev.first ? ' (최초)' : ''} · ${gains}`);
          this.showTowerResult(ev);
        } else {
          this.sound.ui();
          this.ui.toast(
            `🗼 ${ev.n}층 ${ev.how === 'dead' ? '패배 — 전투 불능' : '패배 — 시간 초과'} · 원래 사냥으로 복귀했습니다`,
            'red',
          );
          this.ui.addLog(`🗼 ${ev.n}층 실패(${ev.how === 'dead' ? '전투 불능' : '시간 초과'}) · 처치 ${ev.kills + ev.bossKills} · 언제든 재도전`);
        }
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

  /* ───────────── 📰 호재 뉴스 (v3.4.0) ───────────── */
  /** 3분마다 바뀌는 호재를 기록하고, 내 보유 지역에 걸리면 알린다 */
  checkNews(now = Date.now()) {
    let n;
    try {
      n = activeNews(now);
    } catch (e) {
      return null;
    }
    if (!n) return null;
    if (this._newsKey === n.key) return n;
    const had = this._newsKey !== undefined;
    this._newsKey = n.key;
    try {
      if (recordNews(this.s, n, now)) this.save();
    } catch (e) { /* ignore */ }
    const hit = this.ownedInNews(n);
    if (had && hit > 0) {
      this.ui.toast(`📈 내 지역 호재! ${n.icon} ${n.title} · 임대 ▲${n.rentPct}%`, 'gold');
    }
    if (this.ui.tab === 'land') this.ui.render();
    return n;
  }

  /** 이 뉴스가 적용되는 내 보유 지역 수 */
  ownedInNews(news) {
    const owned = (this.s.land && this.s.land.owned) || {};
    let hit = 0;
    for (const key of Object.keys(owned)) {
      if (Math.floor(Number(owned[key]) || 0) > 0 && newsCovers(news, key)) hit += 1;
    }
    return hit;
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
      // v4.3: 화면 흔들림만 따로 끄기(이펙트는 그대로)
      toggleShake: () => {
        this.s.screenShake = this.s.screenShake === false;
        this.renderer.shakeOn = this.s.screenShake;
        this.renderer.shake = 0;
        this.save();
        this.ui.render();
        this.ui.toast(this.s.screenShake ? '📳 화면 흔들림 켜짐' : '화면 흔들림 꺼짐');
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
        if (!(slot in EQUIP)) return;
        const before = this.s.equip[slot];
        if (before >= EQUIP_MAX_LV) {
          this.ui.toast(`${EQUIP[slot].name}은(는) 이미 최대 강화입니다`);
          return;
        }
        const want = times === 'max'
          ? enhanceMaxCount(this.s, slot)
          : Math.max(1, Math.floor(Number(times) || 1));
        if (want <= 0) {
          this.ui.toast(`강화석이 부족합니다 (💎${enhanceCost(before)} 필요)`, 'red');
          return;
        }
        const r = tryEnhance(this.s, slot, want);
        if (r.done > 0) {
          const tail = r.max ? ' · 최대 도달' : r.done < want ? ' · 강화석 소진' : '';
          this.ui.toast(
            `${EQUIP[slot].icon} ${EQUIP[slot].name} +${before} → +${this.s.equip[slot]} (+${r.done}강 · 💎${r.spent}${tail})`,
            'green',
          );
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

      /* ── ⚔️ 장비 인벤토리 (v4.0) ── */
      openGearItem: (uid) => this.openGearItem(uid),
      openGearByItemId: (itemId) => {
        const row = gearOwned(this.s).find((x) => x.def.id === itemId);
        if (!row) {
          this.ui.toast('이미 분해된 장비입니다');
          return;
        }
        this.openGearItem(row.uid);
      },
      equipGearItem: (uid) => {
        const r = equipGear(this.s, uid);
        if (!r.ok) {
          if (!r.noop) this.ui.toast(r.reason || '장착할 수 없습니다', 'red');
          return;
        }
        this.battle.refreshStats();
        this.save(true);
        this.sound.ui();
        this.ui.toast(`${EQUIP[r.item.slot].icon} ${r.item.name} 장착!`, 'green');
        this.ui.render();
        this.openGearItem(uid);
      },
      dismantleGearItem: (uid) => this.confirmDismantleGear(uid),
      bulkDismantleGear: (mode) => this.confirmBulkDismantle(mode),

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
      claimRent: () => this.claimRentNow(),
      rentInfo: () => this.openClaimRent(),
      saveExport: () => this.openSaveExport(),
      saveImport: () => this.openSaveImport(),
      saveUndo: () => this.openSaveUndo(),
      openLandmark: (key) => this.openLandmark(key),

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
        }        const ds = dungeonState(this.s, now);
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

      /* ── v4.2: 🗼 도전의 탑 · 🐾 펫 진화 ── */
      enterTower: (n) => {
        this.sound.unlock();
        const now = Date.now();
        const r = this.battle.startTower(Number(n) || 0, now);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        this.ui.closeModal();
        this.save(true);
        this.sound.boss();
        this.ui.toast(`🗼 도전의 탑 ${r.floor.n}층 — ${r.floor.name}`, 'gold');
        this.ui.addLog(`🗼 <b>도전의 탑 ${r.floor.n}층</b> ${esc(r.floor.name)} · ${esc(towerGimmickText(r.floor))}`);
        this.ui.render();
      },
      openTowerFloors: () => this.showTowerFloors(),

      evolvePet: (id) => {
        this.sound.unlock();
        const r = evolvePetState(this.s, id);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        const def = petDef(id);
        const info = petStageInfo(this.s, id);
        this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        this.renderer.onEvents(
          [{ t: 'petEvolve', pet: id, name: info.name, stage: r.stage, color: info.color }],
          Date.now(),
        );
        this.ui.toast(`🐾 ${def ? def.emoji : ''} ${info.name} ${r.def.label} 진화!`, 'gold');
        this.ui.addLog(
          `🐾 <b>${esc(info.name)}</b> ${r.def.label} 진화 (💎${r.spent.shards} · 💰${r.spent.gold.toLocaleString()}) · ${esc(r.skill ? r.skill.name : '')}`,
        );
        this.ui.modal({
          title: `🐾 ${r.def.badge} ${esc(info.name)}`,
          sub: `${def ? def.name : ''} → ${info.name} · ${r.def.label} 단계`,
          body: `<div class="pet-evo-burst"><img src="assets/sprites/pet/${info.sprite}.png" alt=""></div>
                 <div class="modal-rewards">
                   <div class="rw"><div class="e">⚔️</div><div class="v">×${r.def.mul}</div><div class="k">동행 피해</div></div>
                   <div class="rw"><div class="e">💎</div><div class="v">-${r.spent.shards}</div><div class="k">강화석</div></div>
                   <div class="rw"><div class="e">💰</div><div class="v">-${r.spent.gold.toLocaleString()}</div><div class="k">골드</div></div>
                 </div>
                 <div class="note">${r.skill ? `<b>${r.skill.icon} ${esc(r.skill.name)}</b> — ${esc(r.skill.text)}` : ''}<br>동행 피해·패시브가 즉시 강해졌습니다.</div>`,
          actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
        });
        this.ui.render();
      },

      /* ── v3.5: ♾️ 환생(초월) · 영구 특성 ── */
      rebirth: () => this.openRebirthConfirm(),
      pickRebirthStart: (v) => this.pickRebirthStart(v),
      openRebirthTraits: () => this.showRebirthTraits(),
      upgradeRebirthTrait: (id) => this.doUpgradeRebirthTrait(id),

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
      ? [1, 10, 50, 100, 1000].filter((n) => n < max).concat([max])
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

  /* ───────────── 🏛️ 랜드마크 건설/업그레이드 (v3.4.0) ───────────── */
  openLandmark(key) {
    const city = CITY_BY_KEY[key];
    if (!city) return;
    const s = this.s;
    const q = landmarkQuote(s, key, Date.now());
    const held = Math.floor(Number(s.land.owned[key]) || 0);
    const lv = q.level || 0;
    const nextDef = lv < LANDMARK.maxLevel ? LANDMARK.levels[lv] : null;
    const rows = LANDMARK.levels
      .map((d) => {
        const cls = lv === d.lv ? 'cur' : lv > d.lv ? 'done' : '';
        return `<div class="lm-step ${cls}">
          <span class="lm-step-ico">${d.icon}</span>
          <span class="lm-step-n">Lv.${d.lv} ${esc(d.name)}</span>
          <span class="lm-step-b">임대수익 +${d.rentPct}%</span>
        </div>`;
      })
      .join('');
    const body = `
      <div class="tsum">
        <div><span>지역</span><b>${city.emoji} ${esc(city.name)} <i>${esc(city.region)}</i></b></div>
        <div><span>보유</span><b>${held.toLocaleString()}평</b></div>
        <div><span>랜드마크</span><b>${lv ? `Lv.${lv} ${esc(LANDMARK.levels[lv - 1].name)}` : '없음'}</b></div>
        <div><span>보유 골드</span><b>💰${s.gold.toLocaleString()}</b></div>
      </div>
      <div class="lm-levels">${rows}</div>
      <div class="note" style="margin-top:9px">${
        nextDef
          ? `다음 <b>Lv.${nextDef.lv} ${esc(nextDef.name)}</b> · 비용 ${q.cost ? `<b>💰${q.cost.toLocaleString()}</b>` : '계산 중'} · 임대수익 <b>+${nextDef.rentPct}%</b><br>${LANDMARK.minPyeong}평 이상 보유한 지역에만 건설할 수 있습니다.`
          : '최대 레벨입니다 — 이 지역 임대수익 +120%.'
      }<br>랜드마크 1개당 건물주 <b>공격력 +${LANDMARK.atkPerLandmark}%</b>(최대 +${LANDMARK.atkCap}%) · <b>골드 +${LANDMARK.goldPerLandmark}%</b>(최대 +${LANDMARK.goldCap}%)</div>`;
    this.ui.modal({
      title: `🏛️ ${esc(city.name)} 랜드마크`,
      sub: q.ok ? `${nextDef.icon} ${esc(nextDef.name)} 건설 · 💰${q.cost.toLocaleString()}` : (q.reason || ''),
      body,
      actions: [
        { label: '닫기', onClick: () => {} },
        { label: q.ok ? `건설 · 💰${q.cost.toLocaleString()}` : '건설 불가', style: 'primary', onClick: () => this.doBuildLandmark(key) },
      ],
    });
  }

  doBuildLandmark(key) {
    this.sound.unlock();
    const r = buildLandmarkState(this.s, key, Date.now());
    if (!r.ok) {
      this.ui.toast(r.reason || '랜드마크를 세울 수 없습니다', 'red');
      return;
    }
    this.buffs = computeBuffs(this.s);
    this.battle.refreshStats();
    this.save(true);
    this.sound.levelUp();
    const city = CITY_BY_KEY[key];
    const nm = city ? city.name : '지역';
    this.ui.toast(`🏛️ ${nm} Lv.${r.level} ${r.name} 건설 · 임대수익 +${r.rentPct}% (💰${r.spent.toLocaleString()})`, 'gold');
    this.ui.addLog(`🏛️ <b>${nm}</b> Lv.${r.level} ${r.name} · 임대수익 +${r.rentPct}%`);
    this.ui.render();
  }

  /* ───────────── 💤 임대수익 (v3.6: 원탭 일괄 수령) ───────────── */
  /** 보유한 모든 매물의 임대수익을 한 번에 수령한다(모달 없이 바로). */
  claimRentNow() {
    this.accrueRent(Date.now(), 1); // 방금까지 쌓인 분까지 반영
    const before = portfolioOf(this.s);
    const got = claimRent(this.s);
    if (got < 1) {
      this.ui.toast('아직 쌓인 임대수익이 없습니다');
      return;
    }
    this.s.records.totalRent = (this.s.records.totalRent || 0) + got;
    this.save(true);
    try { this.sound.coin('gold'); } catch (e) { /* ignore */ }
    this.ui.toast(
      `💤 임대수익 💰${got.toLocaleString()} 일괄 수령 · 보유 ${before.cities}곳 ${before.pyeong.toLocaleString()}평분`,
      'gold',
    );
    this.checkPets();
    this.ui.render();
  }

  /** 임대수익 내역 (지역별 시간당 임대 상위 + 합계) */
  openClaimRent() {
    const p = portfolioOf(this.s);
    const amt = Math.floor(Number(this.s.land.accruedRent) || 0);
    if (!p.cities) {
      this.ui.toast('보유한 매물이 없습니다 — 먼저 매물을 사면 임대수익이 쌓입니다');
      return;
    }
    const rows = p.holdings
      .slice()
      .sort((a, b) => b.incomePerHour - a.incomePerHour)
      .slice(0, 8)
      .map((h) => `<div class="kv"><span class="k">${h.city.emoji} ${esc(h.city.name)} <span class="dim">${Math.floor(h.qty).toLocaleString()}평</span></span><span class="v">+💰${formatGold(h.incomePerHour)}/h</span></div>`)
      .join('');
    const more = p.holdings.length > 8 ? `<div class="tiny dim" style="margin-top:4px">외 ${p.holdings.length - 8}곳</div>` : '';
    this.ui.modal({
      title: '💤 임대수익 내역',
      sub: `쌓인 금액 💰${amt.toLocaleString()}`,
      body: `<div class="tsum">
               <div><span>보유 지역</span><b>${p.cities}곳 · ${p.pyeong.toLocaleString()}평</b></div>
               <div><span>시간당 임대</span><b>+💰${formatGold(p.incomePerHour)}</b></div>
               <div><span>하루 임대</span><b>+💰${formatGold(p.incomePerHour * 24)}</b></div>
               <div><span>누적 수령</span><b class="gold">💰${formatGold(p.land.totalRentClaimed || 0)}</b></div>
             </div>
             <div class="note" style="margin-top:9px">모든 매물의 임대수익을 <b>한 번에</b> 받습니다. 수령 버튼은 부동산 탭 카드에서 바로 누를 수 있습니다.</div>
             <div style="margin-top:7px">${rows}${more}</div>`,
      actions: [
        { label: '닫기', onClick: () => {} },
        {
          label: amt >= 1 ? `💤 모두 수령 · 💰${amt.toLocaleString()}` : '아직 쌓이는 중',
          style: 'primary',
          onClick: () => this.claimRentNow(),
        },
      ],
    });
  }

  /* ───────────── 💾 세이브 코드 백업 / 복원 (v3.6) ───────────── */
  /** 복원 직전에 보관한 세이브의 원본 상태 */
  readPrevState() {
    try {
      const raw = STORAGE && STORAGE.getItem(PREV_SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const state = data && data.state ? data.state : data;
      return state && typeof state === 'object' && !Array.isArray(state) ? state : null;
    } catch (e) {
      return null;
    }
  }

  /** 복원 직전에 보관한 세이브의 요약(설정 탭 '직전 세이브로 복구' 노출 판단) */
  readPrevSave() {
    const state = this.readPrevState();
    if (!state) return null;
    try {
      return summarizeSave(state);
    } catch (e) {
      return null;
    }
  }

  /** 지금 세이브를 '직전 세이브'로 보관한다(덮어쓰기 사고 대비) */
  writePrevSave(state) {
    try {
      STORAGE && STORAGE.setItem(PREV_SAVE_KEY, JSON.stringify({ at: Date.now(), state }));
    } catch (e) { /* 저장 공간 부족 — 복원 자체는 계속한다 */ }
    try {
      this.prevSave = summarizeSave(state);
    } catch (e) {
      this.prevSave = null;
    }
    return this.prevSave;
  }

  openSaveExport() {
    this.save(true);
    let code = '';
    try {
      code = encodeSave(this.s);
    } catch (e) {
      code = '';
    }
    if (!code) {
      this.ui.toast('세이브 코드를 만들지 못했습니다', 'red');
      return;
    }
    const sum = summarizeSave(this.s);
    this.ui.modal({
      title: '📤 세이브 코드 내보내기',
      sub: `Lv.${sum.level} · S${sum.stage} · 보유 ${sum.cities}곳 · 환생 ${sum.rebirth}회`,
      body: `<div class="note">아래 코드 하나에 지금 진행도(레벨·장비·부동산·펫·미션·환생)가 모두 담깁니다. 복사해 메모·메일·다른 기기에 보관하세요.</div>
             <textarea id="saveCodeOut" class="save-code" readonly rows="6" spellcheck="false" autocomplete="off">${esc(code)}</textarea>
             <div class="save-code-meta"><span>${code.length.toLocaleString()}자</span><span>·</span><span>약 ${(code.length / 1024).toFixed(1)}KB</span><span>·</span><span>형식 LANDRPG3</span></div>
             <div class="tiny dim" style="margin-top:7px">코드를 잃으면 되살릴 수 없습니다. 복사가 안 되면 코드를 길게 눌러 전체 선택 후 복사하세요.</div>`,
      actions: [
        { label: '닫기', onClick: () => {} },
        { label: '📋 복사하기', style: 'primary', keepOpen: true, onClick: () => this.copySaveCode(code) },
      ],
    });
  }

  /** 클립보드 복사 — 권한이 막히면 텍스트 영역 선택 + execCommand 로 폴백 */
  async copySaveCode(code) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
        this.ui.toast('📋 세이브 코드를 복사했습니다', 'green');
        return;
      }
    } catch (e) { /* 권한 거부·미지원 → 아래 폴백 */ }
    const ta = document.getElementById('saveCodeOut');
    try {
      if (ta && document.execCommand) {
        ta.focus();
        ta.select();
        if (ta.setSelectionRange) ta.setSelectionRange(0, ta.value.length);
        if (document.execCommand('copy')) {
          this.ui.toast('📋 세이브 코드를 복사했습니다 (선택 복사)', 'green');
          return;
        }
      }
    } catch (e) { /* ignore */ }
    if (ta) {
      try {
        ta.focus();
        ta.select();
      } catch (e) { /* ignore */ }
    }
    this.ui.toast('복사 권한이 없습니다 — 코드를 길게 눌러 선택한 뒤 복사해 주세요', 'red');
  }

  openSaveImport(prefill = '') {
    this._pendingSave = null;
    this.ui.modal({
      title: '📥 세이브 코드 불러오기',
      sub: '붙여넣기 → 검증 → 미리보기 → 복원',
      body: `<textarea id="saveCodeIn" class="save-code" rows="6" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="LANDRPG3:...">${esc(prefill)}</textarea>
             <div class="tiny" id="saveCodeMsg" style="margin-top:6px">코드를 붙여넣고 <b>검증 · 미리보기</b>를 누르세요.</div>
             <div class="note" style="margin-top:9px">복원하면 지금 진행도가 코드의 세이브로 바뀝니다(되돌릴 수 없음).
             잘못된 코드·손상된 코드는 거부되고 <b>기존 세이브는 그대로</b> 남습니다.</div>`,
      actions: [
        { label: '취소', onClick: () => {} },
        { label: '🔍 검증 · 미리보기', style: 'primary', keepOpen: true, onClick: () => this.previewSaveCode() },
      ],
    });
    const ta = document.getElementById('saveCodeIn');
    if (ta) setTimeout(() => { try { ta.focus(); } catch (e) { /* ignore */ } }, 60);
  }

  /** 코드를 검증하고, 현재 세이브와 비교한 미리보기를 보여 준다(복원은 아직 안 함) */
  previewSaveCode() {
    const ta = document.getElementById('saveCodeIn');
    const code = ta ? ta.value : '';
    const d = decodeSave(code);
    const msg = document.getElementById('saveCodeMsg');
    if (!d.ok) {
      if (msg) msg.innerHTML = `<span style="color:var(--red)">⚠️ ${esc(d.reason || '읽을 수 없는 코드입니다')}</span>`;
      this.ui.toast(d.reason || '세이브 코드를 읽을 수 없습니다', 'red');
      return;
    }
    this._pendingSave = d.state;
    const next = d.summary;
    const cur = summarizeSave(this.s);
    const cmp = (icon, label, a, b, unit = '') => `<div class="sp-row">
        <span class="sp-k">${icon} ${label}</span>
        <b class="sp-a">${a.toLocaleString()}${unit}</b>
        <b class="sp-b">${b.toLocaleString()}${unit}</b>
      </div>`;
    this.ui.modal({
      title: '💾 세이브 복원 미리보기',
      sub: '지금 진행도와 비교한 뒤 복원하세요',
      body: `<div class="save-preview">
               <div class="sp-row sp-head"><span class="sp-k">항목</span><b class="sp-a">지금</b><b class="sp-b">코드</b></div>
               ${cmp('⭐', '레벨', cur.level, next.level)}
               ${cmp('🏔️', '최고 스테이지', cur.stage, next.stage)}
               ${cmp('🏢', '보유 지역', cur.cities, next.cities, '곳')}
               ${cmp('♾️', '환생', cur.rebirth, next.rebirth, '회')}
             </div>
             <div class="kv"><span class="k">💰 골드</span><span class="v">${cur.gold.toLocaleString()} → <b class="gold">${next.gold.toLocaleString()}</b></span></div>
             <div class="kv"><span class="k">💎 강화석</span><span class="v">${cur.shards.toLocaleString()} → <b class="gold">${next.shards.toLocaleString()}</b></span></div>
             <div class="kv"><span class="k">⚔️ 장비 총 강화</span><span class="v">+${cur.equipLv} → <b class="gold">+${next.equipLv}</b></span></div>
             <div class="note" style="margin-top:9px">복원하면 지금 세이브는 <b>직전 세이브</b>로 보관되어 설정 탭에서 되돌릴 수 있습니다.
             방치 보상·임대수익은 복원 시점부터 새로 쌓입니다.</div>`,
      actions: [
        { label: '뒤로', onClick: () => this.openSaveImport(code) },
        { label: `💾 복원 · Lv.${next.level}`, style: 'primary', onClick: () => this.restoreSaveCode() },
      ],
    });
  }

  restoreSaveCode() {
    const next = this._pendingSave;
    this._pendingSave = null;
    if (!next) {
      this.ui.toast('복원할 세이브가 없습니다 — 코드를 다시 검증해 주세요', 'red');
      return;
    }
    this.writePrevSave(JSON.parse(JSON.stringify(this.s))); // 지금 세이브를 직전 세이브로
    try {
      saveState(STORAGE, next);
    } catch (e) {
      this.ui.toast('세이브를 저장하지 못했습니다 (저장 공간 부족)', 'red');
      return;
    }
    try {
      this.applySaveState(next);
      try { this.sound.levelUp(); } catch (e) { /* ignore */ }
      this.ui.toast(`💾 세이브 복원 완료 — Lv.${next.level} · S${Math.max(next.peakStage || 1, next.maxStage || 1)}`, 'green');
    } catch (e) {
      this.reportError && this.reportError('restore', e);
      this.ui.toast('복원 중 문제가 있어 새로고침합니다', 'red');
      setTimeout(() => location.reload(), 700);
    }
  }

  openSaveUndo() {
    const state = this.readPrevState();
    if (!state) {
      this.ui.toast('되돌릴 직전 세이브가 없습니다');
      return;
    }
    let sum;
    try {
      sum = summarizeSave(state);
    } catch (e) {
      this.ui.toast('직전 세이브를 읽을 수 없습니다', 'red');
      return;
    }
    this.ui.modal({
      title: '↩️ 직전 세이브로 복구',
      sub: `Lv.${sum.level} · S${sum.stage} · 보유 ${sum.cities}곳 · 환생 ${sum.rebirth}회`,
      body: `<div class="note">세이브를 복원하기 직전에 보관해 둔 상태입니다. 지금 진행도는 이 세이브로 바뀌고, 지금 세이브는 다시 '직전 세이브'로 보관됩니다.</div>`,
      actions: [
        { label: '취소', onClick: () => {} },
        { label: '↩️ 복구', style: 'primary', onClick: () => this.undoPrevSave(state) },
      ],
    });
  }

  undoPrevSave(state) {
    if (!state || typeof state !== 'object') {
      this.ui.toast('되돌릴 직전 세이브가 없습니다');
      return;
    }
    let next;
    try {
      next = normalizeState(state, Date.now());
    } catch (e) {
      this.ui.toast('직전 세이브를 읽을 수 없습니다', 'red');
      return;
    }
    this.writePrevSave(JSON.parse(JSON.stringify(this.s)));
    try {
      saveState(STORAGE, next);
    } catch (e) {
      this.ui.toast('세이브를 저장하지 못했습니다 (저장 공간 부족)', 'red');
      return;
    }
    this.applySaveState(next);
    this.ui.toast(`↩️ 직전 세이브로 복구 — Lv.${next.level} · S${next.peakStage}`, 'green');
  }

  /** 로드된 세이브를 앱 전체(전투·렌더·UI)에 다시 연결한다 */
  applySaveState(next) {
    this.s = next;
    try { syncPetUnlocks(this.s); } catch (e) { /* ignore */ }
    this.buffs = computeBuffs(this.s);
    this.battle = new Battle(this.s, () => this.buffs);
    if (this.renderer && typeof this.renderer.setBattle === 'function') this.renderer.setBattle(this.battle);
    if (this.renderer) {
      this.renderer.effects = this.s.effects !== false;
      this.renderer.shakeOn = this.s.screenShake !== false;
    }
    try { this.sound.setEnabled(this.s.soundOn !== false); } catch (e) { /* ignore */ }
    this._newsKey = undefined;
    this.lastSave = Date.now();
    this.lastRentTick = 0;
    this.ui.render();
    this.ui.refreshLive(Date.now());
  }

  /* ───────────── ♾️ 환생(초월) 모달 ───────────── */
  /** v4.1: 시작 스테이지 선택지를 고른 뒤 모달을 다시 그린다(선택만 바뀌고 환생은 아직 아니다) */
  pickRebirthStart(v) {
    this.sound.unlock();
    const st = rebirthStatus(this.s);
    if (!st.can) return;
    const picked = rebirthJumpStage(this.s, Number(v));
    this._rbStart = picked;
    this.openRebirthConfirm();
  }

  openRebirthConfirm() {
    this.sound.unlock();
    if (this.battle && this.battle.dungeon) {
      this.ui.toast('🔥 황금 던전이 끝난 뒤에 환생할 수 있습니다');
      return;
    }
    const st = rebirthStatus(this.s);
    // v4.1: 시작 스테이지 — 직전 최고의 55%(rebirthJumpCap)까지만 고를 수 있다
    const opts = rebirthStartOptions(this.s);
    const cap = rebirthJumpCap(this.s);
    const prevBest = rebirthPrevBest(this.s);
    // 모달을 연 사이 스테이지가 올라 상한이 바뀔 수 있다 → 고른 값을 상한 안으로 당겨 유지한다(1로 되돌리지 않음)
    const want = Math.floor(Number(this._rbStart) || 1);
    const picked = want >= 1 && want <= cap ? want : 1;
    this._rbStart = picked;
    if (picked > 1 && !opts.some((o) => o.stage === picked)) {
      opts.push({ stage: picked, label: `S${picked}`, note: '선택' });
      opts.sort((a, b) => a.stage - b.stage);
    }
    const jump = rebirthJumpBonus(picked);
    const jumpTheme = picked > 1 ? stageDef(picked).theme.name : '초원';
    const startGold = rebirthStartGold(this.s) + jump.gold;
    const reset = [
      `캐릭터 레벨 → <b>Lv.${jump.level}</b> (현재 Lv.${this.s.level})`,
      `현재·최고 스테이지 → <b>S${picked}</b> (이번 회차 최고 S${st.stage})`,
      `보유 골드 → <b>💰${startGold.toLocaleString()}</b> (현재 💰${this.s.gold.toLocaleString()})`,
      `장비 강화 레벨 → <b>0강</b> (무기 +${this.s.equip.weapon}강 등)`,
      `전직 단계 → <b>🗡️ 견습 기사</b>`,
    ];
    const keep = [
      '부동산 · 랜드마크 · 임대수익',
      '동료 펫 (해금·레벨)',
      '장비 등급 (뽑기 결과)',
      '업적 · 도감 · 미션 진행',
      `초월석 ${st.points.toLocaleString()}P · 영구 특성`,
      '강화석 · 스킬 레벨',
    ];
    const list = (cls, title, items) =>
      `<div class="rb-list ${cls}"><h4>${title}</h4><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul></div>`;
    const chips = opts
      .map(
        (o) => `<button class="jump-chip ${o.stage === picked ? 'on' : ''}" type="button" data-action="rebirth-start" data-value="${o.stage}">
          <b>${o.label}</b><span>${o.stage > 1 ? esc(stageDef(o.stage).theme.name) : '처음부터'}</span>
        </button>`,
      )
      .join('');
    const jumpBox = st.can
      ? `<div class="rb-jump">
          <div class="rb-jump-head"><b>🏁 시작 스테이지</b><span>직전 최고 <b>S${prevBest}</b>의 55%인 <b>S${cap}</b>까지만 고를 수 있습니다</span></div>
          <div class="rb-jump-opts">${chips}</div>
          <div class="rb-jump-pick">${picked > 1
            ? `<b>S${picked} · ${esc(jumpTheme)}</b>에서 시작 · Lv.${jump.level} · 💰${(rebirthStartGold(this.s) + jump.gold).toLocaleString()}`
            : 'S1부터 천천히 다시 시작합니다.'}<br>
            <span class="dim">직전 최고까지 한 번에 건너뛰는 것은 막혀 있습니다. 점프한 만큼만 레벨·골드를 최소 보정합니다.</span></div>
        </div>`
      : '';
    const body = `
      <div class="rebirth-sum">
        <div><span>이번 회차 최고</span><b>S${st.stage}</b></div>
        <div><span>획득 초월석</span><b style="color:var(--gold)">+${st.gain}P</b></div>
        <div><span>시작 스테이지</span><b style="color:var(--accent,#8fe3a8)">S${picked}</b></div>
        <div><span>환생 횟수</span><b>${st.count} → ${st.count + 1}회</b></div>
      </div>
      ${jumpBox}
      <div class="rb-lists">
        ${list('reset', '↺ 초기화', reset)}
        ${list('keep', '🔒 유지', keep)}
      </div>
      <div class="note" style="margin-top:9px">${st.can
        ? '환생하면 이번 회차의 <b>사냥 성장만</b> 초기화되고, 부동산·펫·장비 등급은 그대로 남습니다. 되돌릴 수 없습니다.'
        : `<b>${esc(st.reason)}</b> — 조건을 채우면 초월석을 받고 환생할 수 있습니다.`}</div>`;
    this.ui.modal({
      title: '♾️ 환생 (초월)',
      sub: st.can ? `S${st.stage} 도달 · 초월석 +${st.gain}P · S${picked}부터` : st.reason,
      body,
      actions: st.can
        ? [
            { label: '취소', onClick: () => {} },
            { label: `♾️ 환생하기 · +${st.gain}P`, style: 'primary', onClick: () => this.doRebirth(picked) },
          ]
        : [
            { label: '닫기', onClick: () => {} },
            { label: '✨ 영구 특성', style: 'primary', onClick: () => this.showRebirthTraits() },
          ],
    });
  }

  doRebirth(startStage = 1) {
    this.sound.unlock();
    const start = rebirthJumpStage(this.s, startStage);
    const r = doRebirthState(this.s, Date.now(), { startStage: start });
    if (!r.ok) {
      this.ui.toast(r.reason || '환생할 수 없습니다', 'red');
      return;
    }
    this._rbStart = 1;
    // 사냥 회차가 초기화되므로 전투 인스턴스를 새로 만든다(부동산 버프·펫은 유지).
    this.buffs = computeBuffs(this.s);
    this.battle = new Battle(this.s, () => this.buffs);
    this.renderer.setBattle(this.battle);
    this.renderer.preload(this.stageMonsterNames(this.s.stage)).catch(() => {});
    this.save(true);
    this.sound.fanfare();
    this.renderer.onEvents(
      [{ t: 'promote', job: '환생 · 초월', tier: 0, badge: '♾️', color: '#b98bff' }],
      Date.now(),
    );
    const where = r.start > 1 ? `S${r.start} · ${stageDef(r.start).themeName}` : 'S1';
    this.ui.addLog(`♾️ <b>환생 ${r.count}회차</b> · 초월석 +${r.points}P · Lv.${r.level} · ${where} 새 회차 시작`);
    const kept = `부동산 ${Object.keys(this.s.land.owned || {}).length}곳 · 펫 ${(this.s.pet.unlocked || []).length}종 · 장비 등급 유지`;
    this.ui.modal({
      title: '♾️ 환생 완료',
      sub: `${r.count}회차 · 초월석 +${r.points}P`,
      body: `<div class="modal-rewards">
               <div class="rw"><div class="e">♾️</div><div class="v">${r.count}</div><div class="k">환생 횟수</div></div>
               <div class="rw"><div class="e">✨</div><div class="v">+${r.points}P</div><div class="k">초월석</div></div>
               <div class="rw"><div class="e">💰</div><div class="v">${r.startGold.toLocaleString()}</div><div class="k">시작 골드</div></div>
             </div>
             <div class="note" style="margin-top:9px">Lv.${r.level} · <b>${where}</b>에서 새 회차를 시작합니다. ${kept}.${r.start > 1
               ? `<br>🏁 직전 최고의 55% 상한 안에서 고른 점프입니다 — 장비 강화는 0강이니 초반 몇 판으로 다시 맞추면 됩니다.`
               : ''}<br>
             ✨ <b>영구 특성</b>을 올리면 다음 회차가 훨씬 빨라집니다.</div>`,
      actions: [
        { label: '닫기', onClick: () => {} },
        { label: '✨ 영구 특성 보기', style: 'primary', onClick: () => this.showRebirthTraits() },
      ],
    });
    this.checkPets();
    this.ui.render();
  }

  showRebirthTraits() {
    const s = this.s;
    const st = rebirthStatus(s);
    const b = rebirthBonus(s);
    const rows = REBIRTH_TRAITS.map((def) => {
      const lv = traitLevel(s, def.id);
      const maxed = lv >= def.maxLv;
      const cost = traitCost(lv);
      const can = !maxed && st.points >= cost;
      return `<div class="trait-row ${maxed ? 'max' : ''}">
        <div class="tr-ico">${def.icon}</div>
        <div class="tr-mid">
          <div class="tr-name">${esc(def.name)}<span class="lv">Lv.${lv}/${def.maxLv}</span></div>
          <div class="tr-desc">${esc(def.desc)}</div>
          <div class="prog tiny-prog"><i style="width:${(lv / def.maxLv) * 100}%"></i></div>
          <div class="tr-now">${lv > 0 ? esc(def.effect(lv)) : '효과 없음'}${maxed ? '' : ` → ${esc(def.effect(lv + 1))}`}</div>
        </div>
        <div class="tr-act">${
          maxed
            ? '<span class="tiny" style="color:var(--gold)">MAX</span>'
            : `<button class="btn small ${can ? 'primary' : 'ghost'}" type="button" data-action="rebirth-trait" data-value="${def.id}" ${can ? '' : 'disabled'}>✨${cost}P</button>`
        }</div>
      </div>`;
    }).join('');
    this.ui.modal({
      title: '✨ 초월 특성',
      sub: `초월석 ${st.points.toLocaleString()}P · 환생 ${st.count}회 · 특성 ${b.totalLv}레벨`,
      body: `<div class="trait-list">${rows}</div>
        <div class="note gold-note" style="margin-top:10px">특성은 <b>환생해도 유지</b>되는 영구 배율입니다.
        초월석은 환생할 때 도달 스테이지에 따라 <b>S20 +${rebirthPointsFor(20)}P · S30 +${rebirthPointsFor(30)}P · S50 +${rebirthPointsFor(50)}P</b>처럼 계단식으로 늘어납니다.
        ${st.can ? '' : `<br><b>${esc(st.reason)}</b>`}</div>`,
      actions: [{ label: '닫기', style: 'primary', onClick: () => {} }],
    });
  }

  doUpgradeRebirthTrait(id) {
    this.sound.unlock();
    const r = upgradeRebirthTraitState(this.s, id);
    if (!r.ok) {
      this.ui.toast(r.reason || '특성을 올릴 수 없습니다', 'red');
      return;
    }
    this.battle.refreshStats();
    this.save(true);
    this.sound.levelUp();
    this.ui.toast(`✨ ${r.name} Lv.${r.level} (초월석 -${r.cost}P)`, 'gold');
    this.ui.addLog(`✨ <b>${esc(r.name)}</b> Lv.${r.level} 강화 · 초월석 -${r.cost}P`);
    this.ui.render();
    if (!this.ui.el.modalRoot.classList.contains('hidden')) this.showRebirthTraits();
  }

  /* ───────────── 📖 도감 모달 ───────────── */
  showCodex(tab = 'monster') {
    const s = this.s;
    const c = codexStats(s);
    const d = codexDetail(s);
    const cur = ['monster', 'city', 'gear', 'pet'].includes(tab) ? tab : 'monster';
    const tabs = [
      ['monster', '🐾 몬스터'],
      ['city', '🏙️ 부동산'],
      ['gear', '🎒 장비'],
      ['pet', '🐉 펫'],
    ];
    const tabBar = `<div class="subtabs codex-tabs">${tabs
      .map(([k, l]) => `<button class="subtab ${cur === k ? 'active' : ''}" type="button" data-action="open-codex" data-value="${k}">${l}</button>`)
      .join('')}</div>`;

    let body = '';
    if (cur === 'monster') {
      body = `<div class="codex-sum">몬스터 ${c.monsters.seen}/${c.monsters.total} · 처치 ${c.monsters.kills.toLocaleString()}</div>
        <div class="codex-grid">${d.monsters
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
      body = `<div class="codex-sum">지역 ${c.cities.seen}/${c.cities.total} · 매수한 지역이 기록됩니다</div>
        ${d.cities.length
        ? `<div class="codex-city-list">${d.cities
            .map(
              (ct) => `<div class="kv"><span class="k">${ct.emoji} ${esc(ct.name)} <i class="dim">${esc(ct.region)}</i></span><span class="v">${ct.pyeong.toLocaleString()}평</span></div>`,
            )
            .join('')}</div>
          <div class="note" style="margin-top:10px"><b>매도해도 도감 기록은 유지</b>되고, 역대 최대 보유 평수가 남습니다.</div>`
        : `<div class="empty">아직 매수한 지역이 없습니다.<br>부동산 탭에서 첫 매물을 사면 도감이 열립니다.</div>`}`;
    } else if (cur === 'gear') {
      body = `<div class="codex-sum">장비 등급 ${c.gear.seen}/${c.gear.total}</div>
        <div class="codex-gear">${d.gear
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
      body = `<div class="codex-sum">펫 ${c.pets.seen}/${c.pets.total}</div>
        <div class="codex-pets">${d.pets
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
        const def = gearItem(item.itemId);
        const tag = item.equipped
          ? (item.replaced && item.shards ? `교체 장착 · 이전 분해 +💎${item.shards}` : 'NEW 자동 장착')
          : item.duplicate
            ? `중복 분해 +💎${item.shards}`
            : '인벤토리 보관 · 비교 후 장착';
        return `<div class="gr-row ${item.equipped ? '' : 'dust'}" ${def ? `data-action="gear-result-item" data-value="${def.id}"` : ''}>
          <span class="ico">${def ? gearIcon(def, 26) : '🎒'}</span>
          <span class="nm">${def ? esc(def.name) : esc(item.itemName || '')}</span>
          <span class="rb ${item.rarity}">${esc(item.rarityName || item.name)}</span>
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
             <div class="note" style="margin-top:9px">분해 💎+${r.shards} · 천장까지 ${r.pityLeft}회 · 누적 ${r.total}회<br>장착하지 않은 장비는 <b>장비 탭 → 보유 장비</b>에서 비교하고 교체할 수 있습니다.</div>`,
      actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
    });
  }

  /* ───────────── ⚔️ 장비 상세 · 비교 · 분해 (v4.0) ───────────── */
  /** 장비 카드 → 현재 장착 장비와 옵션·스탯을 나란히 비교 */
  openGearItem(uid) {
    const s = this.s;
    const id = Math.floor(Number(uid));
    const cmp = compareGear(s, id, this.buffs);
    if (!cmp) {
      this.ui.toast('장비를 찾을 수 없습니다', 'red');
      return;
    }
    const it = cmp.item;
    const r = RARITIES[RARITY_INDEX[it.rarity] || 0];
    const curItem = equippedItem(s, it.slot);
    const curRarity = equippedRarity(s, it.slot);
    const isOn = cmp.equipped;
    const lv = s.equip[it.slot] || 0;

    // 옵션 비교 — 두 장비에 나오는 옵션 키를 모두 보여 준다
    const keys = [...new Set([...gearOptionList(it).map((o) => o.key), ...gearOptionList(curItem).map((o) => o.key)])];
    const valOf = (item, k) => (item && item.opts && Number(item.opts[k]) ? Number(item.opts[k]) : 0);
    const optRows = keys.length
      ? keys.map((k) => {
        const a = valOf(it, k);
        const b = valOf(curItem, k);
        const d = a - b;
        const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
        return `<div class="cmp-opt">
          <span class="co-k">${esc(GEAR_OPT_LABEL(k))}</span>
          <span class="co-now">${b ? `+${b}${GEAR_OPTS[k].unit}` : '—'}</span>
          <span class="co-new ${cls}">${a ? `+${a}${GEAR_OPTS[k].unit}` : '—'}${d ? `<i>(${d > 0 ? '▲' : '▼'}${Math.abs(d)}${GEAR_OPTS[k].unit})</i>` : ''}</span>
        </div>`;
      }).join('')
      : '<div class="tiny dim">고유 옵션이 없는 기본 장비입니다.</div>';

    const d = cmp.delta;
    const stat = (label, v, fmtFn, inverse = false) => {
      const better = inverse ? v < 0 : v > 0;
      const cls = Math.abs(v) < 1e-9 ? 'same' : better ? 'up' : 'down';
      const arrow = Math.abs(v) < 1e-9 ? '—' : (v > 0 ? '▲' : '▼');
      return `<div class="cs"><span>${label}</span><b class="${cls}">${arrow}${Math.abs(v) < 1e-9 ? '' : fmtFn(Math.abs(v))}</b></div>`;
    };
    const pct1 = (v) => `${(v * 100).toFixed(1)}%`;
    const stats = [
      stat('공격력', d.atk, (v) => Math.round(v).toLocaleString()),
      stat('체력', d.hpMax, (v) => Math.round(v).toLocaleString()),
      stat('DPS', d.dps, (v) => Math.round(v).toLocaleString()),
      stat('치명타 확률', d.crit * 100, (v) => `${v.toFixed(1)}%p`),
      stat('치명타 피해', d.critDmg, (v) => `+${v.toFixed(2)}x`),
      stat('피해 감소', d.dmgReduce * 100, (v) => `${v.toFixed(1)}%p`),
      stat('골드 획득', d.goldMult * 100, (v) => `${v.toFixed(1)}%p`),
      stat('강화석 드랍', d.dropMult * 100, (v) => `${v.toFixed(1)}%p`),
      stat('공격 간격', d.attackMs, (v) => `${Math.round(v)}ms`, true),
      stat('흡혈', d.lifesteal * 100, (v) => `${v.toFixed(1)}%p`),
      stat('보스 추뎀', d.bossDmgPct * 100, (v) => `${v.toFixed(1)}%p`),
      stat('범위 베기', d.whirlDmgPct * 100, (v) => `${v.toFixed(1)}%p`),
    ].filter((html) => !html.includes('class="same">—')).join('');

    const body = `
      <div class="cmp-head">
        <span class="cmp-ico">${gearIcon(it, 54)}</span>
        <span class="cmp-title">
          <span class="cmp-name">${esc(it.name)} <span class="rb ${r.id}">${r.name}</span></span>
          <span class="cmp-sub">${EQUIP[it.slot].icon} ${EQUIP[it.slot].name} · ${esc(it.desc || '')} · 강화 +${lv} (부위 공유)</span>
        </span>
      </div>
      <div class="cmp-vs">
        <div class="cv-col now">
          <div class="cv-h">지금 장착</div>
          <div class="cv-body">${curItem ? gearIcon(curItem, 30) : '<span class="cv-none">—</span>'}</div>
          <div class="cv-n">${curItem ? esc(curItem.name) : '없음'} <span class="rb ${curRarity}">${RARITIES[RARITY_INDEX[curRarity] || 0].name}</span></div>
        </div>
        <div class="cv-col new">
          <div class="cv-h">이 장비</div>
          <div class="cv-body">${gearIcon(it, 30)}</div>
          <div class="cv-n">${esc(it.name)} <span class="rb ${r.id}">${r.name}</span></div>
        </div>
      </div>
      ${isOn ? '<div class="note" style="margin:0 0 8px">지금 장착 중인 장비입니다. 같은 부위의 다른 장비를 눌러 비교해 보세요.</div>' : ''}
      <div class="cmp-sec">고유 옵션 <small>지금 → 이 장비</small></div>
      <div class="cmp-opts">${optRows}</div>
      <div class="cmp-sec">장착하면 달라지는 것</div>
      <div class="cmp-stats">${stats || '<div class="tiny dim">스탯 변화 없음</div>'}</div>`;

    const actions = [];
    if (!isOn) {
      actions.push({ label: `⚔️ 장착하기`, style: 'primary', onClick: () => this.actions.equipGearItem(id) });
    }
    actions.push({
      label: `♻️ 분해 · 💎${dismantleValue(it)}`,
      style: 'ghost',
      onClick: () => this.confirmDismantleGear(id),
    });
    actions.push({ label: '닫기', style: 'ghost', onClick: () => {} });
    this.ui.modal({ title: '⚔️ 장비 비교', sub: isOn ? '장착 중' : '장착하면 아래 수치만큼 바뀝니다(부위 강화 레벨은 그대로)', body, actions });
  }

  confirmDismantleGear(uid) {
    const id = Math.floor(Number(uid));
    const row = gearOwned(this.s).find((x) => x.uid === id);
    if (!row) {
      this.ui.toast('장비를 찾을 수 없습니다', 'red');
      return;
    }
    const shards = dismantleValue(row.def);
    this.ui.modal({
      title: '♻️ 장비 분해',
      sub: `${row.def.name} (${RARITIES[RARITY_INDEX[row.def.rarity] || 0].name}) → 💎${shards}`,
      body: `<div class="cmp-head"><span class="cmp-ico">${gearIcon(row.def, 48)}</span><span class="cmp-title"><span class="cmp-name">${esc(row.def.name)}</span><span class="cmp-sub">${gearOptionSummary(row.def) || '고유 옵션 없음'}</span></span></div>
        ${row.equipped ? '<div class="note" style="margin-top:8px">⚠️ <b>장착 중인 장비</b>입니다. 분해하면 이 부위는 빈 상태가 됩니다(강화 레벨은 부위에 남습니다).</div>' : ''}
        <div class="note" style="margin-top:8px">분해하면 되돌릴 수 없습니다.</div>`,
      actions: [
        { label: `분해하고 💎${shards} 받기`, style: 'red', onClick: () => {
          const r = dismantleGear(this.s, id);
          if (!r.ok) { this.ui.toast(r.reason || '분해할 수 없습니다', 'red'); return; }
          this.battle.refreshStats();
          this.save(true);
          this.ui.toast(`♻️ ${r.item.name} 분해 · 💎+${r.shards}`, 'green');
          this.ui.render();
        } },
        { label: '취소', style: 'ghost', onClick: () => this.openGearItem(id) },
      ],
    });
  }

  confirmBulkDismantle(mode) {
    const m = mode === 'common' ? 'common' : 'low';
    const targets = dismantleTargets(this.s, m);
    if (!targets.length) {
      this.ui.toast('분해할 장비가 없습니다');
      return;
    }
    const shards = targets.reduce((a, row) => a + dismantleValue(row.def), 0);
    const label = m === 'common' ? '일반 등급' : '장착보다 낮은 등급';
    const rows = targets.slice(0, 8).map((row) => `<div class="gr-row dust"><span class="ico">${gearIcon(row.def, 24)}</span><span class="nm">${esc(row.def.name)}</span><span class="rb ${row.def.rarity}">${RARITIES[RARITY_INDEX[row.def.rarity] || 0].name}</span><span class="tag">💎${dismantleValue(row.def)}</span></div>`).join('');
    this.ui.modal({
      title: '♻️ 일괄 분해',
      sub: `${label} ${targets.length}개 → 💎${shards}`,
      body: `<div class="gacha-result">${rows}</div>${targets.length > 8 ? `<div class="tiny dim" style="margin-top:6px">…외 ${targets.length - 8}개</div>` : ''}
        <div class="note" style="margin-top:8px">장착 중인 장비는 대상에서 제외됩니다. 되돌릴 수 없습니다.</div>`,
      actions: [
        { label: `${targets.length}개 분해 · 💎${shards}`, style: 'red', onClick: () => {
          const r = bulkDismantle(this.s, m);
          if (!r.ok) { this.ui.toast(r.reason || '분해할 장비가 없습니다'); return; }
          this.save(true);
          this.ui.toast(`♻️ 장비 ${r.count}개 분해 · 💎+${r.shards}`, 'green');
          this.ui.render();
        } },
        { label: '취소', style: 'ghost', onClick: () => {} },
      ],
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

  /* ───────────── 🗼 도전의 탑 결과 · 층 선택 (v4.2) ───────────── */
  /** 층 클리어 결과 모달 — 최초 클리어면 보상, 재도전이면 소액 보상 */
  showTowerResult(ev) {
    const def = towerFloor(ev.n);
    const rw = [
      { e: '💰', v: ev.gold.toLocaleString(), k: '골드' },
      { e: '💎', v: ev.shards.toLocaleString(), k: '강화석' },
    ];
    if (ev.points) rw.push({ e: '✨', v: `+${ev.points}P`, k: '초월석' });
    if (ev.item) rw.push({ e: '🎒', v: ev.item.name, k: '장비' });
    rw.push({ e: '🗼', v: `${ev.n}층`, k: ev.first ? '최초 클리어' : '재도전' });
    this.ui.modal({
      title: `🗼 ${ev.n}층 클리어!`,
      sub: `${def ? def.name : ''} · ${ev.first ? '최초 클리어 보상을 받았습니다' : '재도전 보상(35%)'} · 처치 ${ev.kills + ev.bossKills}`,
      body: `<div class="modal-rewards">${rw.map((r) => `<div class="rw"><div class="e">${r.e}</div><div class="v">${esc(r.v)}</div><div class="k">${r.k}</div></div>`).join('')}</div>
             <div class="note" style="margin-top:9px">${ev.next ? `<b>${ev.next}층 ${esc((towerFloor(ev.next) || {}).name || '')}</b>이 열렸습니다.` : '🗼 마지막 층입니다 — 재도전으로 골드·강화석을 계속 모으세요.'}<br>원래 스테이지 자동사냥으로 복귀했습니다.</div>`,
      actions: [
        { label: '확인', style: 'primary', onClick: () => {} },
        ...(ev.next ? [{ label: `🗼 ${ev.next}층 도전`, style: 'blue', onClick: () => this.actions.enterTower(ev.next) }] : []),
      ],
    });
  }

  /** 층 선택 모달 — 클리어/도전 가능/잠금 상태와 기믹·보상을 한눈에 */
  showTowerFloors() {
    const tp = towerProgress(this.s);
    const rows = TOWER_FLOORS.map((f) => {
      const cleared = tp.cleared.includes(f.n);
      const open = towerUnlocked(this.s, f.n);
      const gims = towerGimmicks(f).map((g) => `${g.icon} ${g.name}`).join(' · ');
      const why = towerLockReason(this.s, f.n);
      const state = cleared ? '<b style="color:var(--green)">✓ 클리어</b>' : open ? '<b style="color:var(--blue)">도전 가능</b>' : `<span class="dim">🔒 ${esc(why)}</span>`;
      return `<div class="tower-floor ${cleared ? 'done' : open ? 'open' : 'lock'}">
        <div class="tf-n">${f.n}</div>
        <div class="tf-mid">
          <div class="tf-name">${esc(f.name)} <span class="tiny dim">${esc(towerGoalText(f))}</span></div>
          <div class="tf-gim">${esc(gims)}</div>
          <div class="tf-rew">최초 ${esc(towerRewardText(this.s, f.n))} · 최고 S${f.minStage}</div>
        </div>
        <div class="tf-act">
          <span class="tiny">${state}</span>
          ${open ? `<button class="mini ${cleared ? '' : 'up'}" type="button" data-action="tower" data-value="${f.n}" ${this.battle && this.battle.tower ? 'disabled' : ''}>${cleared ? '재도전' : '도전'}</button>` : '<button class="mini" type="button" disabled>잠김</button>'}
        </div>
      </div>`;
    }).join('');
    this.ui.modal({
      title: '🗼 도전의 탑 · 층 선택',
      sub: `${tp.clearedCount}/${tp.max}층 클리어 · ${tp.allCleared ? '모든 층 클리어!' : `다음 ${tp.next}층`} · 패배해도 잃는 것은 없습니다`,
      body: `<div class="tower-list">${rows}</div>
             <div class="note" style="margin-top:9px">층마다 <b>기믹</b>이 다릅니다 — 다굴·포격·광폭·재생·타임어택·철벽. 장비 조합(흡혈·방어·범위 베기)을 시험해 보세요.</div>`,
      actions: [{ label: '닫기', style: 'ghost', onClick: () => {} }],
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
