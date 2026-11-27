// land-rpg / app.js
// 앱 부트스트랩: 로컬 상태 로드(=게스트) → 전투/렌더/UI 연결 → 루프 → 자동 저장.
// v3: 로그인·클라우드·Firebase 없음. 네트워크 대기 없이 즉시 시작하고 오프라인에서도 완전 동작.
import { APP_VERSION, ECON, EQUIP, EQUIP_MAX_LV, SKILLS, SAVE_KEY, stageDef, RARITIES, RARITY_INDEX, spriteSrc, enhanceCost } from './src/data.js';
import {
  loadState, saveState, offlineSummary, applyOffline, tryEnhance, tryUpgradeSkill, setSkillRune as setSkillRuneState,
  exchangeShards, pullGear, recordNews, enhanceMaxCount, normalizeState, compareGear, skillCdOf,
} from './src/state.js';
import {
  gearItem, gearIcon, gearOptionList, equippedItem, equippedRarity, gearOwned, gearOptionSummary,
  equipGear, dismantleGear, bulkDismantle, dismantleTargets, dismantleValue, itemScore, GEAR_OPTS,
  normalizeAutoMode, autoDismantleLabel,
  saveGearPreset as saveGearPresetState, applyGearPreset as applyGearPresetState, awakenSlot as awakenSlotState,
  gearSetOf, gearSetStatus, gearSetBonusText, gearAffixInfo, gearReforgeCost, reforgeGear as reforgeGearState,
  applyRecommendedBuild as applyRecommendedBuildState,
  MYTHIC_COST, MYTHIC_BONUS_LV, MYTHIC_OPT_PCT, toggleGearLock as toggleGearLockState, transcendGear as transcendGearState,
} from './src/gear.js';

const GEAR_OPT_LABEL = (k) => (GEAR_OPTS[k] ? `${GEAR_OPTS[k].icon} ${GEAR_OPTS[k].name}` : k);
import { encodeSave, decodeSave, summarizeSave } from './src/savecode.js';
import {
  CLOUD, CloudSync, buildCloudDoc, cloudSummary, compareSaves, rankEntryOf, normalizeRankKey,
  sanitizeNick, nickOf, formatAsset,
} from './src/cloud.js';
import { Battle } from './src/combat.js';
import {
  computeBuffs, portfolioOf, accrueRent, claimRent, applyTrade, quoteTrade, maxBuyQty, priceInfo,
  CITY_BY_KEY, formatGold, LAND, LANDMARK, landmarkQuote, buildLandmark as buildLandmarkState,
  LAND_MANAGER, toggleFavoriteCity, landManagerUnlocked,
} from './src/land.js';
import {
  LIMIT_ORDER_MAX, addLimitOrder as addLimitOrderState, cancelLimitOrder as cancelLimitOrderState,
  processLimitOrders, recordAssetSnapshot,
} from './src/orders.js';
import {
  planAutoInvest, executeAutoInvest, planBulkLandmarks, executeBulkLandmarks,
} from './src/portfolio-ops.js';
import { activeNews, newsCovers, SETS_BY_ID } from './src/region.js';
import {
  startExpedition, claimExpedition, claimAllExpeditions, cancelExpedition,
} from './src/expedition.js';
import { upgradeCitadel as upgradeCitadelState } from './src/citadel.js';
import {
  BANK_PLAN_BY_KEY, openDeposit as openDepositState, claimDeposit as claimDepositState,
  cancelDeposit as cancelDepositState, buildMegaProject as buildMegaProjectState,
} from './src/bank.js';
import {
  upgradeKnight as upgradeKnightState, attackRaidBoss as attackRaidBossState, claimRaidPhase as claimRaidPhaseState,
} from './src/guild.js';
import { collectTodoSummary, claimAllReady } from './src/hub.js';
import {
  summonRelic as summonRelicState, toggleEquipRelic as toggleEquipRelicState, upgradeRelic as upgradeRelicState,
} from './src/relics.js';
import {
  cutGem as cutGemState, mergeGem as mergeGemState, socketGem as socketGemState,
  unsocketGem as unsocketGemState, craftThemeGear as craftThemeGearState,
} from './src/gems.js';
import { AUCTION, auctionStatus, bidQuote, applyAuctionBid } from './src/auction.js';
import { Renderer } from './src/render.js';
import { UI } from './src/ui.js';
import { GameSound } from './src/sound.js';
import {
  PET_SPRITES, PET_EVO_SPRITES, DUNGEON, petDef, syncPets as syncPetUnlocks, equipPet, equipSubPet as equipSubPetState, upgradePet,
  promoteJob as promoteJobState, dungeonState, startDungeonCooldown,
  PETS, evolvePet as evolvePetState, petEvolveInfo, petStageInfo, petSkillOf, JOB_COUNT, isUpperJob,
  battleSpeedUnlocked, nextBattleSpeed,
} from './src/meta.js';
import {
  TOWER_FLOORS, TOWER_MAX_FLOOR, TOWER_GIMMICKS, towerFloor, towerProgress, towerGimmickText,
  towerGoalText, towerRewardText, towerUnlocked, towerGimmicks, towerLockReason,
  TOWER_FIXED_FLOOR, towerSweepClaim, towerSweepText, towerSweepInfo,
} from './src/tower.js';
import {
  DAILY, dailyInfo, dailyBossFor, dailyGradeText,
  claimAttendance as claimAttendanceState, claimWeeklyMilestone as claimWeeklyMilestoneState,
} from './src/daily.js';
import {
  claimQuest as claimQuestState, claimAchievement as claimAchievementState,
  achievementStatus, claimedAchievementCount, codexStats, codexDetail, codexCity, codexGear,
  trackDailyQuest, claimDailyQuest as claimDailyQuestState, claimDailyQuestBonus as claimDailyQuestBonusState,
} from './src/quests.js';
import {
  addPassXp, claimPassTier as claimPassTierState, claimAllPassTiers as claimAllPassTiersState,
  equipTitle as equipTitleState,
} from './src/pass.js';
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
    this.renderer.dmgNumbersOn = this.s.dmgNumbers !== false; // v7.5.0 데미지 숫자 표시 설정
    this.renderer.dmgStyle = this.s.dmgStyle === 'full' ? 'full' : 'simple'; // v8.1.0 피해 숫자 '간단' 기본
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
    // ☁️ v4.8 선택적 클라우드 세이브·랭킹 — 객체만 만들고 SDK 는 사용자가 켤 때 동적 로드한다
    this.cloud = new CloudSync({ onChange: () => this.onCloudChange() });
    this.lastCloudUpload = 0;
    this._rankKey = '';
    this._cloudCmp = null;
    this._cloudHold = false; // 클라우드가 앞서는데 사용자가 아직 고르지 않음 → 자동 저장 중지
    this._cloudBusy = false;
    this._cloudAuthBusy = false;
    this._cloudResumeStarted = false;
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
      if (subParam && ['battle', 'challenge', 'mission'].includes(subParam)) this.ui.huntSub = subParam;
    } catch (e) { /* ignore */ }
    this.ui.render();
    this.checkNews(now);
    this.bindAudioUnlock();
    this.bindCanvasTap();
    // PWA 바로가기(?tab=land&sub=buff) — 부동산 서브 탭까지 바로 열기
    try {
      const qs = new URLSearchParams((typeof location !== 'undefined' && location.search) || '');
      const landSub = qs.get('sub');
      if (qs.get('tab') === 'land' && landSub && ['home', 'market', 'event'].includes(landSub)) {
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
    // ☁️ v4.8: 클라우드를 켜 둔 사용자만 — 게스트 화면이 뜬 뒤에 조용히 세션을 되살린다
    this.startCloudResume();
  }

  /** v7.7.0 전투 캔버스 탭 번개 일격 바인딩 */
  bindCanvasTap() {
    const cv = document.getElementById('battle');
    if (!cv || cv._tapBound) return;
    cv._tapBound = true;
    cv.style.cursor = 'pointer';
    cv.addEventListener('pointerdown', (e) => {
      if (!this.battle || !this.renderer) return;
      this.sound.unlock();
      const wx = this.renderer.screenToWorldX(e.clientX);
      const res = this.battle.tapStrike(wx, Date.now());
      if (res && res.ok) this.sound.hit(false);
    });
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
        recordAssetSnapshot(this.s, now);
        // v6.0.0 🎯 지정가 예약 매매 자동 체결 감시
        if (this.s.land && Array.isArray(this.s.land.orders) && this.s.land.orders.length) {
          const fills = processLimitOrders(this.s, now);
          if (fills.length) {
            this.buffs = computeBuffs(this.s, now);
            this.battle.refreshStats(now);
            this.checkPets(now);
            this.save(true);
            this.sound.coin('gold');
            for (const f of fills) {
              const verb = f.side === 'buy' ? '매수' : '매도';
              this.ui.toast(`🎯 지정가 ${verb} 체결! ${f.cityName} ${f.qty.toLocaleString()}평 (💰${formatGold(f.total)})`, 'gold');
              this.ui.addLog(`🎯 <b>지정가 ${verb} 체결</b> · ${esc(f.cityName)} ${f.qty.toLocaleString()}평 · 💰${formatGold(f.total)}`);
            }
            this.ui.renderIfNeeded();
          }
        }
        // v5.1.0 🤖 영지 관리인: 보유 10곳 이상 + 켜짐이면 5분마다 미수령 임대수익 자동 수령
        if (this.s.land && this.s.land.autoRent && landManagerUnlocked(this.s)
          && now - (this.s.land.autoRentAt || 0) >= LAND_MANAGER.everyMs
          && (this.s.land.accruedRent || 0) >= 1) {
          const got = claimRent(this.s);
          if (got >= 1) {
            this.s.land.autoRentAt = now;
            this.s.records.totalRent = (this.s.records.totalRent || 0) + got;
            trackDailyQuest(this.s, 'rent', 1, now);
            this.ui.addLog(`🤖 <b>영지 관리인</b> 임대 자동 수령 · 💰+${got.toLocaleString()}`);
          }
        }
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
      this.battle.daily = null; // 일일 보스 중 예외가 나도 스테이지 사냥으로 복귀
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
        if (ev.auto) {
          // ♻️ v4.7 자동분해 — 토스트는 5초에 한 번만 묶어서 알린다(드랍이 몰려도 화면을 가리지 않게)
          this.ui.addLog(`♻️ <b>${esc(ev.ko)}</b> 자동분해 → 💎${ev.shards}`);
          this._autoDust = (this._autoDust || 0) + (ev.shards || 0);
          this._autoN = (this._autoN || 0) + 1;
          if (!this._autoToastAt || now - this._autoToastAt > 5000) {
            this._autoToastAt = now;
            this.ui.toast(`♻️ 장비 ${this._autoN}개 자동분해 · 💎+${this._autoDust}`, 'green');
            this._autoN = 0;
            this._autoDust = 0;
          }
          this.ui.renderIfNeeded();
        } else if (ev.duplicate) {
          this.ui.addLog(`🎒 <b>${esc(ev.ko)}</b> 중복 획득 → 💎${ev.shards}`);
        } else {
          this.ui.addLog(`🎒 <b>${esc(ev.ko)}</b> 획득 (${rar.name})${ev.equipped ? ' · 자동 장착' : ' · 인벤토리 보관'}`);
          if ((RARITY_INDEX[ev.rarity] || 0) >= 2 || ev.isBoss) {
            this.ui.toast(`🎒 ${rar.name} ${ev.ko}!${ev.equipped ? ' 자동 장착' : ' 획득'}`, 'gold');
          }
          this.sound.gacha(rar.id);
          this.ui.renderIfNeeded();
        }
      } else if (ev.t === 'ultimate') {
        // 🐉 v4.7 상위 전직 궁극기 — 로그·토스트·스크린리더 안내
        this.ui.addLog(`🐉 <b>${esc(ev.ko)}</b> 발동! ${ev.hits}명 · ⚔️${(ev.dmg || 0).toLocaleString()}`);
        this.ui.toast(`🐉 궁극기 ${esc(ev.ko)}! ${ev.hits}명에게 ${(ev.dmg || 0).toLocaleString()} 피해`, 'gold');
        this.ui.announce(`궁극기 ${ev.ko} 발동 — ${ev.hits}명`);
        this.sound.gacha('legend');
        this.ui.renderIfNeeded();
      } else if (ev.t === 'levelUp') {
        this.ui.toast(`⬆️ 레벨 업! Lv.${ev.level}`, 'green');
        this.ui.addLog(`<b>레벨 업</b> Lv.${ev.level} · 체력 완충`);
        this.ui.renderIfNeeded();
        this.sound.levelUp();
      } else if (ev.t === 'stageClear') {
        addPassXp(this.s, 15, now);
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
      } else if (ev.t === 'treasureSpawn') {
        this.ui.toast('💰 보물 고블린 출현! 도망치기 전에 처치하세요!', 'gold');
        this.ui.addLog('💰 <b>보물 고블린</b> 출현 — 처치 시 대량 골드 · 💎강화석 · 확정 장비 드랍');
      } else if (ev.t === 'treasureKill') {
        this.sound.fanfare();
        this.ui.toast(`💰 보물 고블린 처치! 💰${(ev.gold || 0).toLocaleString()} · 💎${ev.shards || 0}${ev.item ? ` · 🎒${ev.item}` : ''}`, 'gold');
        this.ui.addLog(`💰 <b>보물 고블린</b> 처치 · 💰${(ev.gold || 0).toLocaleString()} 💎${ev.shards || 0}${ev.item ? ` · ${esc(ev.item)}` : ''}`);
      } else if (ev.t === 'treasureFlee') {
        this.ui.addLog('💨 보물 고블린이 황금을 들고 도망쳤습니다…');
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
      } else if (ev.t === 'phoenixRevive') {
        this.sound.fanfare();
        this.ui.toast(`🔥 불사조의 깃털 발동! 즉시 부활 (HP ${ev.hp.toLocaleString()})`, 'gold');
        this.ui.addLog(`🔥 <b>불사조의 깃털</b> 발동 — 치명상에서 즉시 부활 + 보호막`);
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
      } else if (ev.t === 'dailyStart') {
        this.ui.addLog(`🌟 <b>일일 보스 ${esc(ev.ko)}</b> ${esc(ev.title)} — 30초 누적 피해 도전`);
        this.ui.toast(`🌟 일일 보스 ${ev.ko} — 30초 타임어택! (남은 ${ev.left}회)`, 'gold');
        this.sound.boss();
        this.ui.renderIfNeeded();
      } else if (ev.t === 'dailyEnd') {
        this.battle.refreshStats();
        this.checkPets(now);
        this.save(true);
        this.sound.fanfare();
        const gains = [ev.gold ? `💰+${ev.gold.toLocaleString()}` : '', ev.shards ? `💎+${ev.shards}` : '', ev.points ? `✨+${ev.points}P` : ''].filter(Boolean).join(' ');
        this.ui.addLog(`🌟 <b>일일 보스 ${ev.gradeLabel}등급</b> · 피해 ${ev.dmg.toLocaleString()} · ${gains}`);
        this.showDailyResult(ev);
        this.ui.renderIfNeeded();
      } else if (ev.t === 'riftStart') {
        this.ui.addLog(`🌀 <b>무한 균열</b> 입장 — 웨이브 1 시작!`);
        this.ui.toast('🌀 무한 균열 입장! 3웨이브마다 축복 카드를 고르세요', 'gold');
        this.sound.boss();
        this.ui.renderIfNeeded();
      } else if (ev.t === 'riftPick') {
        this.sound.fanfare();
        this.openRiftPickModal();
        this.ui.renderIfNeeded();
      } else if (ev.t === 'riftEnd') {
        this.battle.refreshStats();
        this.save(true);
        if (ev.waves > 0) {
          addPassXp(this.s, Math.min(120, ev.waves * 12), now);
          this.sound.fanfare();
        } else {
          this.sound.ui();
        }
        const gains = [
          ev.gold ? `💰+${ev.gold.toLocaleString()}` : '',
          ev.shards ? `💎+${ev.shards}` : '',
          ev.points ? `✨+${ev.points}P` : '',
          ev.bonusGem ? `${ev.bonusGem.icon}${ev.bonusGem.name}` : '',
          ev.bonusMedal ? '🏅훈장 +1' : '',
        ].filter(Boolean).join(' ');
        this.ui.addLog(`🌀 <b>무한 균열 종료</b> · ${ev.waves}웨이브 돌파${ev.isBest ? ' (신기록!)' : ''}${gains ? ` · ${gains}` : ''}`);
        this.ui.modal({
          title: `🌀 무한 균열 정산 (${ev.waves}W 돌파)`,
          sub: ev.isBest ? `🏆 최고 기록 경신! (최고 W${ev.bestWave})` : `최고 기록 W${ev.bestWave} · 선택한 축복 ${ev.cards.length}장`,
          body: `<div class="modal-rewards">
                   <div class="rw"><div class="e">💰</div><div class="v">+${ev.gold.toLocaleString()}</div><div class="k">골드</div></div>
                   <div class="rw"><div class="e">💎</div><div class="v">+${ev.shards}</div><div class="k">강화석</div></div>
                   <div class="rw"><div class="e">✨</div><div class="v">+${ev.points}P</div><div class="k">초월석</div></div>
                 </div>
                 ${ev.bonusGem || ev.bonusMedal ? `<div class="tiny" style="text-align:center;color:var(--gold);margin-bottom:6px">추가 보상: ${ev.bonusGem ? `${ev.bonusGem.icon} ${esc(ev.bonusGem.name)} Lv.1 ` : ''}${ev.bonusMedal ? '🏅 방어 훈장 +1' : ''}</div>` : ''}`,
          actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
        });
        this.ui.renderIfNeeded();
      } else if (ev.t === 'feverStart') {
        this.sound.chord([523.25, 659.25, 783.99, 1046.5], 0.14, 0.08);
        this.ui.toast('🔥 FEVER TIME! 15초간 공속 +25% · 치명타 +15% · 골드 +30%', 'gold');
      } else if (ev.t === 'invasionStart') {
        this.ui.addLog(`🚨 <b>${esc(ev.cityName)} 방어전</b> 시작 — ${esc(ev.waveName)} (${ev.goal}마리 격파)`);
        this.ui.toast(`🚨 ${ev.cityName} 방어전! ${Math.round(ev.duration / 1000)}초 안에 마물 격퇴`, 'gold');
        this.sound.boss();
        this.ui.renderIfNeeded();
      } else if (ev.t === 'invasionEnd') {
        this.battle.refreshStats();
        this.buffs = computeBuffs(this.s);
        this.checkPets(now);
        this.save(true);
        if (ev.how === 'clear') {
          addPassXp(this.s, 45, now);
          this.sound.fanfare();
          const gains = [`💰+${ev.gold.toLocaleString()}`, `💎+${ev.shards}`, ev.points ? `✨+${ev.points}P` : '', `🎉임대 +${ev.boomPct}%(30분)`].filter(Boolean).join(' ');
          this.ui.addLog(`🏅 <b>${esc(ev.cityName)} 방어 성공!</b> · ${gains}`);
          this.ui.modal({
            title: `🏅 ${esc(ev.cityName)} 방어 성공!`,
            sub: `${esc(ev.waveName)} 격퇴 · 방어 훈장 🏅${ev.medals}`,
            body: `<div class="modal-rewards">
                     <div class="rw"><div class="e">💰</div><div class="v">+${ev.gold.toLocaleString()}</div><div class="k">골드</div></div>
                     <div class="rw"><div class="e">💎</div><div class="v">+${ev.shards}</div><div class="k">강화석</div></div>
                     <div class="rw"><div class="e">🎉</div><div class="v">+${ev.boomPct}%</div><div class="k">임대 30분</div></div>
                   </div>
                   ${ev.points ? `<div class="tiny" style="text-align:center;color:var(--gold);margin-bottom:6px">✨ 초월석 +${ev.points}P 추가 획득!</div>` : ''}
                   <div class="note"><b>${esc(ev.cityName)}</b>에 30분간 <b>호황 버프(임대수익 +${ev.boomPct}%)</b>가 적용되었습니다!</div>`,
            actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
          });
        } else {
          this.sound.ui();
          this.ui.toast(`🚨 ${ev.cityName} 방어 실패(${ev.how === 'dead' ? '전투 불능' : '시간 초과'}) · 매물 피해 없이 재도전 가능`, 'red');
          this.ui.addLog(`🚨 <b>${esc(ev.cityName)}</b> 방어 실패(${ev.how === 'dead' ? '전투 불능' : '시간 초과'}) · 재도전 가능`);
        }
        this.ui.renderIfNeeded();
      } else if (ev.t === 'towerEnd') {
        this.battle.refreshStats();
        this.checkPets(now);
        this.save(true);
        if (ev.how === 'clear') {
          addPassXp(this.s, 45, now);
          this.sound.fanfare();
          const gains = [ev.gold ? `💰+${ev.gold.toLocaleString()}` : '', ev.shards ? `💎+${ev.shards}` : '', ev.points ? `✨+${ev.points}P` : '', ev.item ? `🎒${ev.item.name}` : '', ev.autoItem ? `♻️${ev.autoItem}` : '']
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
    // v8.2.0 — 호재로 시세(→자산→건물주 골드 버프)가 바뀌면 전투 버프도 다시 계산한다.
    //  (예전에는 3분마다 카드끼리 버프 수치가 1%p씩 어긋나 보였다)
    if (had) {
      try {
        this.buffs = computeBuffs(this.s, now);
        this.battle.refreshStats(now);
      } catch (e) { /* ignore */ }
    }
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
            this.ui.render();
            this.save(true);
            if (ups > 0) this.battle.refreshStats();
            // v8.2.0 복귀 동선 통일 — 10분 이상 자리를 비웠으면 부트와 같은 '방치 보상 + 오늘의 할 일' 모달,
            // 짧은 복귀는 토스트 한 줄에 허브 대기 건수까지 붙인다.
            if (away >= 10 * 60 * 1000) {
              this.showOfflinePopup(summary, ups);
            } else {
              let todoN = 0;
              try { todoN = collectTodoSummary(this.s, this.battle && this.battle.stats).totalClaimable; } catch (e) { todoN = 0; }
              this.ui.toast(`🌙 방치 보상 +💰${summary.gold.toLocaleString()}${todoN > 0 ? ` · 📋 할 일 ${todoN}건 대기` : ''}`, 'gold');
            }
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

  /* ───────────── ☁️ v4.8 클라우드 세이브 · 🏆 랭킹 ─────────────
   * 게스트가 기본이다. 아래 코드는 사용자가 설정 탭에서 클라우드를 켰을 때만 실제로 돈다.
   * 실패·오프라인·시간 초과는 상태 문구로만 남기고, 게스트 저장(localStorage)은 계속된다.
   */
  cloudEnabled() {
    return !!(this.s && this.s.cloud && this.s.cloud.enabled === true);
  }

  cloudSummary(now = Date.now()) {
    try {
      return cloudSummary(this.s, now);
    } catch (e) {
      return null;
    }
  }

  /** 클라우드 상태가 바뀌면 HUD 배지·설정 카드만 다시 그린다 */
  onCloudChange() {
    try {
      this.ui.syncCloud();
    } catch (e) { /* 부팅 중 UI 가 없을 수 있다 */ }
  }

  startCloudResume() {
    // 주기 저장 타이머 — 조건(켜짐·로그인·온라인·60초)을 만족할 때만 실제 전송
    this._cloudTimer = setInterval(() => this.cloudTick(), 15000);
    if (!this.cloudEnabled() && !this.cloud.hasPendingRedirect()) return;
    setTimeout(() => this.cloudResume(), CLOUD.resumeDelayMs);
  }

  /** 로그인 세션 복원 — 실패해도 게스트로 그대로 둔다(무한 로딩 없음) */
  async cloudResume() {
    if (this._cloudResumeStarted) return;
    this._cloudResumeStarted = true;
    const c = this.cloud;
    try {
      const done = await c.completeRedirect();
      if (done && done.ok) {
        await this.afterCloudLogin({ silent: false });
        return;
      }
      if (!this.cloudEnabled()) { this.ui.syncCloud(); return; }
      const ok = await c.restoreSession();
      if (!ok) { this.ui.syncCloud(); return; }
      this.s.cloud.uid = c.uid;
      this.s.cloud.email = (c.user && c.user.email) || this.s.cloud.email || '';
      this.save();
      this.ui.syncCloud();
      await this.cloudCheckRemote({ silent: true });
    } catch (e) {
      this.ui.syncCloud();
    }
  }

  /** 60초 주기 저장 */
  async cloudTick() {
    const c = this.cloud;
    if (!this.cloudEnabled() || !c.signedIn || c.busy || this._cloudBusy) return;
    if (this._cloudHold) return; // 더 앞선 클라우드 세이브를 덮어쓰지 않는다 — 사용자가 고를 때까지 대기
    if (this.s.cloud && this.s.cloud.autoSync === false) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const now = Date.now();
    if (now - Math.max(this.lastCloudUpload, (this.s.cloud && this.s.cloud.lastSync) || 0) < CLOUD.autoSyncMs) return;
    await this.cloudUpload({ silent: true });
  }

  /** Google 로그인 — 팝업 → 차단되면 리다이렉트 */
  async cloudSignIn() {
    this.sound.unlock();
    if (this._cloudAuthBusy) return;
    this._cloudAuthBusy = true;
    this.ui.syncCloud('connecting');
    try {
      // 이미 이 브라우저에 Google 세션이 남아 있으면 팝업 없이 바로 이어 붙인다
      if (this.cloud.signedIn) {
        await this.afterCloudLogin({ silent: false });
        return;
      }
      let r = await this.cloud.signIn();
      if (!r.ok && r.retryRedirect) {
        this.ui.toast('로그인 창이 막혀 있어 이동식 로그인으로 바꿉니다', '');
        const rd = await this.cloud.signInRedirect();
        if (rd.ok) {
          this.ui.toast('Google 로그인 화면으로 이동합니다…', 'gold');
          return;
        }
        r = rd;
      }
      if (!r.ok) {
        this.ui.toast(`로그인하지 못했습니다 — ${r.message}`, 'red');
        this.ui.syncCloud();
        return;
      }
      await this.afterCloudLogin({ silent: false });
    } finally {
      this._cloudAuthBusy = false;
      this.ui.syncCloud();
    }
  }

  async cloudSignOut() {
    await this.cloud.signOut();
    this.s.cloud.enabled = false;
    this.s.cloud.lastSync = 0;
    this.save(true);
    this.lastCloudUpload = 0;
    this._rankKey = '';
    this._cloudResumeStarted = false;
    this.ui.syncCloud();
    this.ui.toast('☁️ 클라우드 연결을 끊었습니다 — 이 기기 저장은 그대로', '');
  }

  /** 로그인 직후 — 설정 저장 → 클라우드와 진행도 비교 → (비었으면) 조용히 올리기 */
  async afterCloudLogin({ silent = false } = {}) {
    const c = this.cloud;
    this.s.cloud.enabled = true;
    this.s.cloud.uid = c.uid;
    this.s.cloud.email = (c.user && c.user.email) || this.s.cloud.email || '';
    if (!nickOf(this.s)) this.s.cloud.nick = sanitizeNick('', c.uid);
    this.save(true);
    this.ui.syncCloud();
    if (!silent) {
      const who = c.user && (c.user.name || c.user.email) ? `${c.user.name || c.user.email} · ` : '';
      this.ui.toast(`☁️ ${who}클라우드 연결됨`, 'green');
    }
    const r = await c.readSave();
    if (!r.ok) {
      if (!silent) this.ui.toast(`☁️ 클라우드를 읽지 못했습니다 — ${r.message}`, 'red');
      return null;
    }
    const loaded = r.loaded || {};
    if (!loaded.doc) {
      // 클라우드가 비어 있다 → 잃을 것이 없으니 조용히 올린다
      await this.cloudUpload({ silent });
      return { action: 'upload', why: 'cloud-empty' };
    }
    const cmp = compareSaves(this.cloudSummary(), loaded.summary);
    this._cloudCmp = cmp;
    // 비교 모달에서 바로 복원할 수 있게 읽어 둔 세이브를 보관(복원 가능할 때만)
    this._cloudLoad = loaded.restorable ? loaded : null;
    cmp.restorable = !!loaded.restorable;
    // 클라우드가 더 앞서거나 양쪽이 충돌하면, 사용자가 고르기 전까지 자동 저장을 멈춘다
    this._cloudHold = cmp.action === 'download' || cmp.action === 'conflict';
    if (cmp.action === 'same') {
      if (!silent) this.ui.toast('☁️ 클라우드와 같은 진행도입니다');
      return cmp;
    }
    if (silent) {
      if (this._cloudHold) {
        this.ui.toast('☁️ 클라우드에 더 앞선 세이브가 있습니다 — 설정 ☁️ 카드에서 불러올 수 있어요', 'gold');
      }
      return cmp;
    }
    this.openCloudSyncModal(cmp);
    return cmp;
  }

  /** 처음 연결·세션이 복원된 뒤 — 덮어쓰지 않고 알리기만 한다 */
  async cloudCheckRemote({ silent = true } = {}) {
    const r = await this.cloud.readSave();
    if (!r.ok || !r.loaded || !r.loaded.doc) return null;
    const loaded = r.loaded;
    const cmp = compareSaves(this.cloudSummary(), loaded.summary);
    this._cloudCmp = cmp;
    this._cloudLoad = loaded.restorable ? loaded : null;
    cmp.restorable = !!loaded.restorable;
    this._cloudHold = cmp.action === 'download' || cmp.action === 'conflict';
    this.ui.syncCloud();
    if (silent) {
      if (this._cloudHold) {
        this.ui.toast('☁️ 클라우드에 더 앞선 세이브가 있습니다 — 설정 ☁️ 카드에서 불러올 수 있어요', 'gold');
      }
    } else if (cmp.action === 'same') {
      this.ui.toast('☁️ 클라우드와 같은 진행도입니다');
    } else {
      this.openCloudSyncModal(cmp);
    }
    return cmp;
  }

  /** 로컬·클라우드 비교 → 사용자가 고르는 모달(자동 덮어쓰기 없음) */
  openCloudSyncModal(cmp) {
    const cur = this.cloudSummary() || {};
    const cl = (cmp && cmp.cloud) || {};
    const rec = cmp && cmp.recommend === 'cloud' ? 'cloud' : 'local';
    const row = (icon, label, a, b) => `<div class="sp-row"><span class="sp-k">${icon} ${label}</span><b class="sp-a">${a}</b><b class="sp-b">${b}</b></div>`;
    const why = cmp && cmp.action === 'conflict'
      ? '양쪽 모두 다른 시점에 플레이했습니다. 어느 쪽을 남길지 골라 주세요.'
      : rec === 'cloud'
        ? '클라우드 세이브가 더 앞서 있습니다.'
        : '이 기기 세이브가 더 앞서 있습니다.';
    const canLoad = !!(cmp && cmp.restorable && this._cloudLoad);
    const noteLoad = canLoad ? '' : '<br><b>클라우드 기록은 예전 형식이라 불러올 수 없습니다</b> — 이 기기 세이브를 올리면 대체됩니다.';
    const actions = [{ label: '나중에', onClick: () => {} }];
    if (canLoad) {
      actions.push({ label: '📥 클라우드 불러오기', style: rec === 'cloud' ? 'primary' : 'ghost', onClick: () => this.cloudRestore() });
    }
    actions.push({ label: '📤 이 기기 올리기', style: rec === 'local' || !canLoad ? 'primary' : 'ghost', onClick: () => this.cloudUpload({ silent: false }) });
    this.ui.modal({
      title: '☁️ 클라우드 세이브 확인',
      sub: '이 기기 ↔ 클라우드 · 덮어쓰기 전에 한 번 확인합니다',
      body: `<div class="save-preview">
               <div class="sp-row sp-head"><span class="sp-k">항목</span><b class="sp-a">이 기기</b><b class="sp-b">클라우드</b></div>
               ${row('⭐', '레벨', cur.level || 1, cl.level || 1)}
               ${row('🏔️', '최고 스테이지', `S${cur.stage || 1}`, `S${cl.stage || 1}`)}
               ${row('💰', '총자산', formatAsset(cur.totalAsset || 0), formatAsset(cl.totalAsset || 0))}
               ${row('🏢', '보유 지역', `${cur.cities || 0}곳`, `${cl.cities || 0}곳`)}
               ${row('♾️', '환생', `${cur.rebirth || 0}회`, `${cl.rebirth || 0}회`)}
             </div>
             <div class="note">${why}<br>어느 쪽을 골라도 지금 세이브는 <b>직전 세이브</b>로 보관되어 설정 탭에서 되돌릴 수 있습니다.${noteLoad}</div>`,
      actions,
    });
  }

  /** 클라우드로 올리기 · 랭킹 갱신 */
  async cloudUpload({ silent = false } = {}) {
    const c = this.cloud;
    if (!c.signedIn) {
      if (!silent) this.ui.toast('먼저 Google 로그인을 해 주세요');
      return { ok: false, code: 'no-user' };
    }
    if (this._cloudBusy) return { ok: false, code: 'busy' };
    if (silent && this._cloudHold) return { ok: false, code: 'hold' }; // 비교 전에는 조용히 올리지 않는다
    this._cloudBusy = true;
    try {
      this.save(true);
      const doc = buildCloudDoc(this.s, { uid: c.uid, nick: nickOf(this.s), now: Date.now() });
      const r = await c.writeSave(doc);
      if (!r.ok) {
        if (!silent) this.ui.toast(`☁️ 저장하지 못했습니다 — ${r.message}`, 'red');
        this.ui.syncCloud();
        return r;
      }
      this.lastCloudUpload = r.at || Date.now();
      this._cloudHold = false; // 올리기로 결정(또는 직접 저장) → 자동 저장 재개
      this.s.cloud.enabled = true;
      this.s.cloud.uid = c.uid;
      this.s.cloud.lastSync = this.lastCloudUpload;
      this.save();
      this.cloudPushRank({ silent: true });
      if (!silent) this.ui.toast('☁️ 클라우드에 저장했습니다', 'green');
      this.ui.syncCloud();
      return r;
    } finally {
      this._cloudBusy = false;
    }
  }

  /** 랭킹 참여 — 진행도가 바뀔 때만 쓴다 */
  async cloudPushRank({ silent = true } = {}) {
    const c = this.cloud;
    if (!c.signedIn) return null;
    const entry = rankEntryOf(this.s, { uid: c.uid, nick: nickOf(this.s), now: Date.now() });
    const key = `${entry.name}|${entry.stage}|${entry.totalAsset}|${entry.level}|${entry.towerBest}|${entry.dailyBest}`;
    if (key === this._rankKey) return null;
    this._rankKey = key;
    const r = await c.writeRank(entry);
    if (!r.ok) {
      this._rankKey = '';
      if (!silent) this.ui.toast(`🏆 랭킹 등록 실패 — ${r.message}`, 'red');
      return r;
    }
    if (this.cloud.rank.all && this.cloud.rank.all.length) this.cloudRank(this.cloud.rank.key, { quiet: true });
    return r;
  }

  /** 불러오기 — 확인 모달 → 복원(직전 세이브 보관) */
  async openCloudLoad() {
    if (!this.cloud.signedIn) {
      this.ui.toast('클라우드 세이브를 불러오려면 Google 로그인이 필요합니다');
      return;
    }
    if (this._cloudBusy) return;
    this._cloudBusy = true;
    this.cloud.emit('connecting');
    let r;
    try {
      r = await this.cloud.readSave();
    } finally {
      this._cloudBusy = false;
    }
    this.cloud.emit(this.cloud.signedIn ? 'online' : 'guest');
    if (!r || !r.ok) {
      this.ui.toast(`☁️ 불러오지 못했습니다 — ${(r && r.message) || '알 수 없는 오류'}`, 'red');
      this.ui.syncCloud();
      return;
    }
    const loaded = r.loaded || {};
    if (!loaded.doc) {
      this.ui.toast('☁️ 클라우드에 저장된 세이브가 없습니다');
      this.ui.syncCloud();
      return;
    }
    if (!loaded.restorable) {
      this.ui.toast('☁️ 예전 형식의 기록이라 복원할 수 없습니다', 'red');
      return;
    }
    this._cloudLoad = loaded;
    const cur = this.cloudSummary() || {};
    const cl = loaded.summary || {};
    const row = (icon, label, a, b) => `<div class="sp-row"><span class="sp-k">${icon} ${label}</span><b class="sp-a">${a}</b><b class="sp-b">${b}</b></div>`;
    this.ui.modal({
      title: '📥 클라우드 세이브 불러오기',
      sub: '이 기기 진행도와 비교한 뒤 복원합니다',
      body: `<div class="save-preview">
               <div class="sp-row sp-head"><span class="sp-k">항목</span><b class="sp-a">이 기기</b><b class="sp-b">클라우드</b></div>
               ${row('⭐', '레벨', cur.level || 1, cl.level || 1)}
               ${row('🏔️', '최고 스테이지', `S${cur.stage || 1}`, `S${cl.stage || 1}`)}
               ${row('💰', '총자산', formatAsset(cur.totalAsset || 0), formatAsset(cl.totalAsset || 0))}
               ${row('🏢', '보유 지역', `${cur.cities || 0}곳`, `${cl.cities || 0}곳`)}
               ${row('♾️', '환생', `${cur.rebirth || 0}회`, `${cl.rebirth || 0}회`)}
             </div>
             <div class="note">복원하면 지금 세이브는 <b>직전 세이브</b>로 보관됩니다. 클라우드 세이브는 지워지지 않습니다.</div>`,
      actions: [
        { label: '취소', onClick: () => {} },
        { label: '📥 불러오기', style: 'primary', onClick: () => this.cloudRestore() },
      ],
    });
  }

  cloudRestore() {
    const loaded = this._cloudLoad;
    this._cloudLoad = null;
    if (!loaded || !loaded.doc || !loaded.doc.save) {
      this.ui.toast('불러올 클라우드 세이브가 없습니다', 'red');
      return;
    }
    let next;
    try {
      next = normalizeState(loaded.doc.save, Date.now());
    } catch (e) {
      this.ui.toast('클라우드 세이브를 읽지 못했습니다', 'red');
      return;
    }
    this.writePrevSave(JSON.parse(JSON.stringify(this.s)));
    next.cloud = {
      ...(next.cloud || {}),
      enabled: true,
      uid: this.cloud.uid || (loaded.doc.uid || ''),
      email: this.s.cloud.email || '',
      nick: (next.cloud && next.cloud.nick) || nickOf(this.s),
      autoSync: this.s.cloud.autoSync !== false,
      lastSync: Number(loaded.doc.ts) || Date.now(),
    };
    try {
      saveState(STORAGE, next);
    } catch (e) {
      this.ui.toast('세이브를 저장하지 못했습니다 (저장 공간 부족)', 'red');
      return;
    }
    this.prevSave = this.readPrevSave();
    this.applySaveState(next);
    this._cloudHold = false; // 클라우드에서 불러왔으니 자동 저장 재개
    this.lastCloudUpload = next.cloud.lastSync;
    this._rankKey = '';
    this.ui.toast(`☁️ 클라우드 세이브를 불러왔습니다 — Lv.${next.level} · S${Math.max(next.peakStage || 1, next.maxStage || 1)}`, 'green');
    this.ui.syncCloud();
  }

  /** 랭킹 보기/새로고침 — 게스트도 볼 수 있는 공개 보드 (v5.0 4종 지표) */
  async cloudRank(key = 'stage', opts = {}) {
    const metric = normalizeRankKey(key);
    this.ui.syncCloud('connecting');
    const r = await this.cloud.readRank(metric);
    if (!r.ok) {
      if (!opts.quiet) this.ui.toast(`🏆 랭킹을 불러오지 못했습니다 — ${r.message}`, 'red');
      this.ui.syncCloud();
      return r;
    }
    this.ui.syncCloud();
    return r;
  }

  /** 랭킹 닉네임 저장 */
  async cloudSaveNick() {
    const el = document.getElementById('cloudNick');
    const raw = el ? el.value : '';
    const prev = nickOf(this.s);
    const nick = sanitizeNick(raw, this.cloud.uid || this.s.cloud.uid || '');
    this.s.cloud.nick = nick;
    this.save(true);
    this._rankKey = '';
    this.ui.syncCloud();
    const fallback = raw && raw.trim().length >= 2 ? '' : ' (2자 이상 입력하면 그 이름으로 바뀝니다)'; 
    this.ui.toast(`🏆 랭킹 닉네임: ${nick}${fallback}`, 'gold');
    if (this.cloud.signedIn && nick !== prev) { await this.cloudUpload({ silent: true }); }
  }

  cloudToggleAuto() {
    this.s.cloud.autoSync = this.s.cloud.autoSync === false;
    this.save();
    this.ui.syncCloud();
    this.ui.toast(this.s.cloud.autoSync ? '☁️ 60초 자동 저장 켜짐' : '☁️ 자동 저장 꺼짐 (수동 저장만)');
  }

  /* ───────────── 사용자 액션 ───────────── */
  makeActions() {
    return {
      castSkill: (key) => {
        const ok = this.battle.castSkill(key, Date.now());
        if (!ok) {
          const cd = skillCdOf(key, this.buffs) || SKILLS[key].cd;
          const left = Math.max(0, this.s.skills[key].last + cd - Date.now());
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
      // v7.8.0: 실시간 DPS/딜 비중 미터기 초기화
      resetDpsMeter: () => {
        if (this.battle && typeof this.battle.resetMeter === 'function') this.battle.resetMeter(Date.now());
        this.ui._lastMeterAt = 0;
        this.ui.refreshLive(Date.now());
        this.ui.toast('📊 DPS 미터기 초기화 — 새 세팅 측정을 시작합니다');
      },
      // v7.5.0: 전투 데미지 숫자 표시 토글
      toggleDmgNumbers: () => {
        this.s.dmgNumbers = this.s.dmgNumbers === false;
        this.renderer.dmgNumbersOn = this.s.dmgNumbers;
        if (!this.s.dmgNumbers) {
          this.renderer.floaters = this.renderer.floaters.filter((f) => f.kind === 'gold' || f.kind === 'heal');
        }
        this.save();
        this.ui.render();
        this.ui.toast(this.s.dmgNumbers ? '🔢 데미지 숫자 켜짐' : '데미지 숫자 꺼짐');
      },
      // v8.1.0: 피해 숫자 밀도('간단' 기본 / '자세히')
      setDmgStyle: (style) => {
        this.s.dmgStyle = style === 'full' ? 'full' : 'simple';
        if (this.s.dmgStyle === 'full' && this.s.dmgNumbers === false) this.s.dmgNumbers = true;
        this.renderer.dmgStyle = this.s.dmgStyle;
        this.renderer.dmgNumbersOn = this.s.dmgNumbers !== false;
        this.save();
        this.ui.render();
        this.ui.toast(this.s.dmgStyle === 'full' ? '🔢 피해 숫자 — 자세히 (모든 타격)' : '🔢 피해 숫자 — 간단 (K/M 축약 · 밀도 낮춤)');
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
          trackDailyQuest(this.s, 'enhance', r.done);
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
      setSkillRune: (key, runeId) => {
        const r = setSkillRuneState(this.s, key, runeId);
        if (!r.ok) {
          this.ui.toast(r.reason || '룬을 변경할 수 없습니다', 'red');
          return;
        }
        this.save(true);
        this.sound.ui();
        this.ui.toast(
          r.cleared ? `🔮 ${SKILLS[key].name} 기본 형태로 복원` : `🔮 ${r.rune.icon} ${r.rune.name} 룬 장착 · ${r.rune.short}`,
          r.cleared ? '' : 'gold',
        );
        this.ui.render();
      },

      buyShards: (n) => {
        const mode = n === 'max' || n === 'all' ? 'max' : Math.floor(Number(n) || 0);
        const r = exchangeShards(this.s, mode);
        if (!r.ok) {
          this.ui.toast(r.reason || '골드가 부족합니다', 'red');
          return;
        }
        this.save(true);
        this.sound.ui();
        const tail = r.short ? ` · 보유 골드로 가능한 만큼 (최대 ${r.max.toLocaleString()}개)` : '';
        this.ui.toast(`💎 강화석 ${r.n.toLocaleString()}개 교환 (💰${r.cost.toLocaleString()})${tail}`, 'green');
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

      /* ── ♻️ v4.7 장비 자동분해 기준 ── */
      setGearAuto: (mode) => {
        if (!this.s.gear) return;
        const m = normalizeAutoMode(mode);
        if (this.s.gear.autoDismantle === m) return;
        this.s.gear.autoDismantle = m;
        this.save(true);
        this.sound.ui();
        this.ui.toast(
          m === 'off' ? '♻️ 자동분해 꺼짐 — 새 장비는 모두 보관됩니다' : `♻️ 자동분해 — ${autoDismantleLabel(this.s)} 장비는 즉시 💎`,
          m === 'off' ? '' : 'green',
        );
        this.ui.render();
      },

      /* ── 🗂️🔥 v4.10 장비 프리셋 · 부위 각성 ── */
      saveGearPreset: (idx) => {
        this.sound.unlock();
        const r = saveGearPresetState(this.s, idx);
        if (!r.ok) {
          this.ui.toast(r.reason || '프리셋을 저장할 수 없습니다', 'red');
          return;
        }
        this.save(true);
        this.sound.ui();
        this.ui.toast(`💾 ${r.meta.icon} ${r.meta.name} 프리셋 저장 (${r.count}부위)`, 'green');
        this.ui.render();
      },
      applyGearPreset: (idx) => {
        this.sound.unlock();
        const r = applyGearPresetState(this.s, idx);
        if (!r.ok) {
          this.ui.toast(r.reason || '프리셋을 적용할 수 없습니다', 'red');
          return;
        }
        this.battle.refreshStats();
        this.save(true);
        this.sound.ui();
        const miss = r.missing ? ` (미보유 ${r.missing}부위 제외)` : '';
        this.ui.toast(`🗂️ ${r.meta.icon} ${r.meta.name} 프리셋 장착! (${r.applied}부위${miss})`, 'gold');
        this.ui.render();
      },
      applyRecommendedGear: (mode) => {
        this.sound.unlock();
        const r = applyRecommendedBuildState(this.s, mode);
        if (!r.ok) {
          this.ui.toast(r.reason || '추천 세팅을 적용할 수 없습니다', 'red');
          return;
        }
        this.battle.refreshStats();
        this.save(true);
        this.sound.ui();
        this.ui.toast(
          r.changed > 0
            ? `✨ ${r.meta.icon} ${r.meta.name} 추천 세팅 장착 (${r.changed}부위 변경)`
            : `✨ 이미 최적의 ${r.meta.name} 세팅을 장착 중입니다`,
          r.changed > 0 ? 'gold' : '',
        );
        this.ui.render();
      },
      awakenGear: (slot) => {
        this.sound.unlock();
        const r = awakenSlotState(this.s, slot, EQUIP_MAX_LV);
        if (!r.ok) {
          this.ui.toast(r.reason || '각성할 수 없습니다', 'red');
          return;
        }
        this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        const def = EQUIP[slot];
        this.ui.toast(`🔥 ${def.icon} ${def.name} 각성 ★${r.lv}! (💎${r.spent.shards.toLocaleString()} · 💰${formatGold(r.spent.gold)})`, 'gold');
        this.ui.addLog(`🔥 <b>${def.name} 각성 ★${r.lv}</b> — 부위 강화 +5강 · 고유 옵션 +8%`);
        this.ui.render();
      },
      /* ── v6.2.0: 💠 보석 소켓 · 🔨 테마 장비 제작 공방 ── */
      cutGem: (type) => {
        this.sound.unlock();
        const r = cutGemState(this.s, type);
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.save(true);
        this.sound.ui();
        this.ui.toast(`💠 ${r.gem.icon} ${r.gem.name} Lv.${r.lv} 세공 완료!${r.lucky ? ' ✨대성공!' : ''}`, r.lucky ? 'gold' : 'green');
        this.ui.render();
      },
      mergeGem: (type, lv) => {
        this.sound.unlock();
        const r = mergeGemState(this.s, type, lv);
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.save(true);
        this.sound.levelUp();
        this.ui.toast(`💠 ${r.gem.icon} ${r.gem.name} Lv.${r.fromLv} → Lv.${r.toLv} 합성 성공!`, 'gold');
        this.ui.render();
      },
      socketGem: (slot, type, lv) => {
        const r = socketGemState(this.s, slot, type, lv);
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.buffs = computeBuffs(this.s);
        this.battle.refreshStats();
        this.save(true);
        this.sound.ui();
        this.ui.toast(`💠 ${EQUIP[slot].name} 소켓에 ${r.gem.icon} ${r.gem.name} Lv.${r.lv} 장착!`, 'green');
        this.ui.render();
      },
      unsocketGem: (slot) => {
        const r = unsocketGemState(this.s, slot);
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.buffs = computeBuffs(this.s);
        this.battle.refreshStats();
        this.save(true);
        this.sound.ui();
        this.ui.toast(`💠 ${EQUIP[slot].name} 보석 해제 (가방 보관)`);
        this.ui.render();
      },
      craftThemeGear: (setId, rarity) => {
        this.sound.unlock();
        const r = craftThemeGearState(this.s, setId, rarity, Date.now());
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        if (r.acq && r.acq.equipped) this.battle.refreshStats();
        this.save(true);
        this.sound.gacha(rarity);
        this.ui.toast(`🔨 ${r.set.icon} ${r.item.name} (${rarity === 'legend' ? '전설' : '영웅'}) 제작 완료!`, 'gold');
        this.ui.addLog(`🔨 <b>${esc(r.item.name)}</b> 테마 공방 제작 완료`);
        this.ui.render();
      },

      /* ── 🐉 v4.7 상위 전직 궁극기 · 자동 시전 토글 ── */
      castUltimate: () => {
        this.sound.unlock();
        const r = this.battle.castUltimate(Date.now());
        if (!r.ok) {
          this.ui.toast(r.reason || '궁극기를 시전할 수 없습니다');
          return;
        }
        this.ui.renderIfNeeded();
      },
      toggleAutoUlt: () => {
        this.s.autoUlt = this.s.autoUlt === false;
        this.save();
        this.ui.toast(this.s.autoUlt ? '🐉 궁극기 자동 발동 켜짐' : '궁극기 자동 발동 꺼짐 — 직접 시전만');
        this.ui.render();
      },
      toggleAutoSkill: () => {
        this.s.autoSkill = this.s.autoSkill === false;
        this.save();
        this.ui.toast(this.s.autoSkill ? '✨ 스킬 자동 시전 켜짐' : '스킬 자동 시전 꺼짐 — 터치로만 시전');
        this.ui.render();
      },

      /* ── 부동산 ── */
      landTrade: (key, side) => this.openLandTrade(key, side),
      landSheet: (key) => this.openLandSheet(key),
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
      landFav: (key) => {
        const r = toggleFavoriteCity(this.s, key);
        if (!r.ok) {
          this.ui.toast(r.reason || '관심 매물을 변경할 수 없습니다', 'red');
          return;
        }
        this.save();
        this.sound.ui();
        this.ui.toast(r.fav ? `⭐ ${r.city.name} 관심 매물 등록 (${r.count}곳)` : `${r.city.name} 관심 매물 해제`);
        this.ui.render();
      },
      openLimitOrder: (cityKey, defaultSide) => this.openLimitOrderModal(cityKey, defaultSide),
      openAutoInvest: (mode) => this.openAutoInvestModal(mode),
      openBulkLandmarks: () => this.openBulkLandmarksModal(),
      cancelLimitOrder: (orderId) => {
        const r = cancelLimitOrderState(this.s, orderId);
        if (!r.ok) {
          this.ui.toast(r.reason || '주문을 취소할 수 없습니다', 'red');
          return;
        }
        this.save(true);
        this.sound.ui();
        this.ui.toast(`🎯 ${r.city ? r.city.name : '지정가'} 예약 주문 취소`);
        this.ui.render();
      },
      landMapRegion: (setId) => {
        if (!SETS_BY_ID[setId]) return;
        this.s.land.regionFilter = setId;
        this.s.land.tier = 'all';
        this.s.land.q = '';
        this.s.land.page = 1;
        this.s.land.sub = 'market';
        this.save();
        this.sound.ui();
        this.ui.toast(`🗺️ ${SETS_BY_ID[setId].name} 매물로 이동`, 'gold');
        this.ui.render();
      },
      landRegionClear: () => {
        this.s.land.regionFilter = 'all';
        this.s.land.page = 1;
        this.save();
        this.ui.render();
      },
      /* ── v5.9.0 🧭 펫 영지 파견 ── */
      expStart: (petId, setId, durKey) => {
        this.sound.unlock();
        const r = startExpedition(this.s, petId, setId, durKey, Date.now());
        if (!r.ok) {
          this.ui.toast(r.reason || '파견을 출발할 수 없습니다', 'red');
          return;
        }
        this.ui.expPick.petId = '';
        this.save(true);
        this.sound.ui();
        this.ui.toast(`🧭 ${r.pet.emoji} ${r.pet.name} → ${r.region.name} ${r.dur.label} 파견 출발!`, 'green');
        this.ui.addLog(`🧭 <b>${esc(r.pet.name)}</b> ${esc(r.region.name)} ${r.dur.label} 파견 출발`);
        this.ui.render();
      },
      expClaim: (slotId) => {
        this.sound.unlock();
        const r = claimExpedition(this.s, slotId, Date.now());
        if (!r.ok) {
          this.ui.toast(r.reason || '보상을 수령할 수 없습니다', 'red');
          return;
        }
        if (r.acq && r.acq.equipped) this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        const gains = [
          `💰${formatGold(r.gold)}`,
          `💎${r.shards}`,
          r.points ? `✨${r.points}P` : '',
          r.item ? `🎒${r.item.name}` : '',
        ].filter(Boolean).join(' ');
        this.ui.toast(`${r.great ? '🌟 대성공! ' : '🧭 파견 완료 · '}${r.petName} (${gains})`, 'gold');
        this.ui.addLog(`🧭 <b>${esc(r.petName)}</b> ${esc(r.region.name)} 파견 ${r.great ? '🌟대성공' : '완료'} · ${gains}`);
        this.ui.render();
      },
      expClaimAll: () => {
        this.sound.unlock();
        const r = claimAllExpeditions(this.s, Date.now());
        if (!r.ok) {
          this.ui.toast(r.reason || '완료된 파견이 없습니다', 'red');
          return;
        }
        this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        const gains = [
          `💰${formatGold(r.gold)}`,
          `💎${r.shards}`,
          r.points ? `✨${r.points}P` : '',
          r.items.length ? `🎒장비 ${r.items.length}개` : '',
        ].filter(Boolean).join(' ');
        this.ui.toast(`🧭 파견 ${r.count}건 일괄 수령${r.greats ? ` (🌟대성공 ${r.greats})` : ''} · ${gains}`, 'gold');
        this.ui.addLog(`🧭 <b>파견 ${r.count}건 일괄 수령</b> · ${gains}`);
        this.ui.render();
      },
      expCancel: (slotId) => {
        const r = cancelExpedition(this.s, slotId);
        if (!r.ok) {
          this.ui.toast(r.reason || '철수할 수 없습니다', 'red');
          return;
        }
        this.save(true);
        this.sound.ui();
        this.ui.toast(`🧭 ${r.pet ? r.pet.name : '펫'} 파견 철수 완료`);
        this.ui.render();
      },
      /* ── v5.12.0 🏰 영지 성채 ── */
      upgradeCitadel: (id) => {
        this.sound.unlock();
        const r = upgradeCitadelState(this.s, id);
        if (!r.ok) {
          this.ui.toast(r.reason || '증축할 수 없습니다', 'red');
          return;
        }
        this.buffs = computeBuffs(this.s);
        this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        this.ui.toast(`🏰 ${r.def.icon} ${r.def.name} Lv.${r.lv} 증축! · ${r.def.effect(r.lv)}`, 'gold');
        this.ui.addLog(`🏰 <b>${esc(r.def.name)} Lv.${r.lv}</b> 증축 · ${esc(r.def.effect(r.lv))}`);
        this.ui.render();
      },
      toggleAutoRent: () => {
        if (!landManagerUnlocked(this.s)) {
          this.ui.toast(`보유 지역 ${LAND_MANAGER.minCities}곳 이상 달성 시 해금됩니다`, 'red');
          return;
        }
        this.s.land.autoRent = !this.s.land.autoRent;
        this.s.land.autoRentAt = Date.now();
        this.save(true);
        this.sound.ui();
        this.ui.toast(this.s.land.autoRent ? '🤖 영지 관리인 켜짐 — 5분마다 임대 자동 수령' : '영지 관리인 꺼짐');
        this.ui.render();
      },
      landSearch: (q) => {
        this.s.land.q = String(q || '').slice(0, 30);
        this.s.land.page = 1;
        this.ui.updateLandList();
      },
      claimRent: () => this.claimRentNow(),
      rentInfo: () => this.openClaimRent(),
      auctionBid: () => this.openAuctionBid(),
      auctionInfo: () => this.openAuctionInfo(),
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
                   <div class="rw"><div class="e">🏅</div><div class="v">${r.to.tier + 1}/${JOB_COUNT}</div><div class="k">전직 단계</div></div>
                 </div>
                 <div class="note">${esc(r.to.line)}<br>영구 보너스는 즉시 적용되었습니다.${isUpperJob(r.to.tier) ? '<br><b>상위 전직</b> — 캐릭터 오라와 카드 배지가 새 칭호 색으로 바뀝니다.' : ''}</div>`,
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

      equipSubPet: (id) => {
        const r = equipSubPetState(this.s, id === 'none' ? null : id);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        this.battle.refreshStats();
        this.save();
        this.sound.ui();
        this.ui.toast(r.cleared ? '🐾 보조 펫 동행 해제' : `🐾 보조 펫 ${r.pet.emoji} ${r.pet.name} 동행 (패시브·타격 50%)`, 'green');
        this.ui.render();
      },

      cycleSpeed: () => {
        if (!battleSpeedUnlocked(this.s)) {
          this.ui.toast('⚡ 전투 배속은 환생 1회 달성 시 해금됩니다', 'red');
          return;
        }
        const next = nextBattleSpeed(this.s);
        this.s.battleSpeed = next;
        this.save();
        this.sound.ui();
        this.ui.toast(`⚡ 전투 배속 ×${next}${next > 1 ? ' (일일 보스는 ×1 고정)' : ''}`, next > 1 ? 'gold' : '');
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

      /** 🧹 v4.5 일일 소탕 — 최고 층 보상을 하루 한 번 즉시 수령 */
      claimTowerSweep: () => {
        const now = Date.now();
        const r = towerSweepClaim(this.s, now);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        trackDailyQuest(this.s, 'challenge', 1, now);
        this.save(true);
        this.sound.fanfare();
        this.renderer.onEvents([{ t: 'towerEnd', how: 'clear', n: r.floor }], Date.now());
        this.ui.toast(`🧹 ${r.floor}층 소탕 · 💰+${r.gold.toLocaleString()} 💎+${r.shards}`, 'gold');
        this.ui.addLog(`🧹 <b>${r.floor}층 일일 소탕</b> — 💰+${r.gold.toLocaleString()} 💎+${r.shards}`);
        this.ui.render();
      },

      /** 🌟 v4.5 일일 보스 — 30초 타임어택 입장 */
      enterDaily: () => {
        this.sound.unlock();
        const now = Date.now();
        const r = this.battle.startDailyBoss(now);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        this.save(true);
        this.sound.boss();
        this.ui.toast(`🌟 일일 보스 ${r.boss.ko} — 30초 타임어택!`, 'gold');
        this.ui.addLog(`🌟 <b>일일 보스 ${esc(r.boss.ko)}</b> ${esc(r.boss.title)} · 30초 누적 피해 도전`);
        this.ui.render();
      },

      /** 🚨 v5.11 영지 침공 방어전 입장 */
      enterInvasion: () => {
        this.sound.unlock();
        const now = Date.now();
        const r = this.battle.startInvasion(now);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        this.save(true);
        this.ui.render();
      },

      /** 🌀 v6.7 무한 균열 로그라이크 입장 · 3택 1 축복 · 정산 귀환 */
      enterRift: () => {
        this.sound.unlock();
        const r = this.battle.startRift(Date.now());
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.save(true);
        this.ui.render();
      },
      openRiftPick: () => this.openRiftPickModal(),
      pickRiftCard: (cardId) => {
        this.sound.unlock();
        const r = this.battle.pickRiftCard(cardId, Date.now());
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.ui.closeModal();
        this.sound.levelUp();
        this.ui.toast(`🃏 축복 획득: ${r.card.icon} ${r.card.name} — W${r.wave} 시작!`, 'gold');
        this.ui.addLog(`🃏 균열 축복 <b>${esc(r.card.name)}</b> (${esc(r.card.desc)}) 선택 → W${r.wave}`);
        this.ui.render();
      },
      retreatRift: () => {
        if (this.battle.rift) {
          this.ui.closeModal();
          this.battle.endRift(Date.now(), 'retreat');
        }
      },

      /** 🏦 v6.8 영지 은행 정기 예금 · 🏗️ 메가 프로젝트 */
      bankOpen: (planKey) => {
        this.sound.unlock();
        const plan = BANK_PLAN_BY_KEY[planKey];
        const amt = plan && (this.s.gold || 0) >= plan.minGold * 2 ? 0.5 : (plan ? plan.minGold : 10000);
        const r = openDepositState(this.s, planKey, amt, Date.now());
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.save(true);
        this.sound.coin('gold');
        this.ui.toast(`🏦 ${r.plan.title} 개설! 💰${formatGold(r.slot.principal)} 예치 (만기 이자 +💰${formatGold(r.interest)})`, 'gold');
        this.ui.addLog(`🏦 <b>${esc(r.plan.title)}</b> 💰${formatGold(r.slot.principal)} 예치 (+${r.plan.ratePct}%)`);
        this.ui.render();
      },
      bankClaim: (id) => {
        this.sound.unlock();
        const r = claimDepositState(this.s, id, Date.now());
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        addPassXp(this.s, 30, Date.now());
        this.save(true);
        this.sound.fanfare();
        this.ui.toast(`🏦 만기 수령! 💰${formatGold(r.payout)} (이자 +💰${formatGold(r.interest)})`, 'gold');
        this.ui.addLog(`🏦 정기 예금 만기 수령 💰${formatGold(r.payout)} (이자 +💰${formatGold(r.interest)})`);
        this.ui.render();
      },
      bankCancel: (id) => {
        this.sound.unlock();
        const r = cancelDepositState(this.s, id);
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.save(true);
        this.sound.ui();
        this.ui.toast(`🏦 예금 중도 해지 — 원금 💰${formatGold(r.principal)} 반환`);
        this.ui.render();
      },
      megaBuild: (id) => {
        this.sound.unlock();
        const r = buildMegaProjectState(this.s, id);
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.buffs = computeBuffs(this.s);
        this.battle.refreshStats();
        addPassXp(this.s, 60, Date.now());
        this.save(true);
        this.sound.fanfare();
        this.ui.toast(`🏗️ ${r.def.icon} ${r.def.name} Lv.${r.lv} 완공!`, 'gold');
        this.ui.addLog(`🏗️ 메가 프로젝트 <b>${esc(r.def.name)} Lv.${r.lv}</b> 완공 (${esc(r.def.effect(r.lv))})`);
        this.ui.render();
      },

      /** 🛡️ v6.9 영지 기사단 · 🐉 주간 거대 레이드 토벌전 */
      upgradeKnight: (id) => {
        this.sound.unlock();
        const r = upgradeKnightState(this.s, id);
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.battle.refreshStats();
        this.save(true);
        this.sound.levelUp();
        this.ui.toast(`🛡️ ${r.def.icon} ${r.def.name} ${r.recruited ? '영입 완료!' : `Lv.${r.lv} 승급!`} (${r.def.effect(r.lv)})`, 'gold');
        this.ui.addLog(`🛡️ 기사단 <b>${esc(r.def.name)} Lv.${r.lv}</b> (${esc(r.def.effect(r.lv))})`);
        this.ui.render();
      },
      attackRaid: () => {
        this.sound.unlock();
        const now = Date.now();
        const r = attackRaidBossState(this.s, this.battle.stats, now);
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        addPassXp(this.s, r.defeated ? 80 : 35, now);
        try { trackDailyQuest(this.s, 'challenge', 1, now); } catch (e) { /* ignore */ }
        this.save(true);
        if (r.defeated) this.sound.fanfare();
        else this.sound.hit(r.crit);
        this.ui.toast(`🐉 합동 공격! ${r.crit ? '💥치명 ' : ''}${r.dmg.toLocaleString()} 피해 (${r.pct.toFixed(1)}%) · 💰+${formatGold(r.gold)} 💎+${r.shards}`, 'gold');
        this.ui.addLog(`🐉 <b>${esc(r.boss.name)}</b> 레이드 피해 ${r.dmg.toLocaleString()} (${r.pct.toFixed(1)}%)`);
        this.ui.render();
      },
      claimRaidPhase: (idx) => {
        this.sound.unlock();
        const r = claimRaidPhaseState(this.s, idx, Date.now());
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        const gains = [
          `💰+${formatGold(r.gold)}`, `💎+${r.shards}`,
          r.points ? `✨+${r.points}P` : '',
          r.medals ? `🏅+${r.medals}` : '',
          r.bonusGem ? `${r.bonusGem.icon}${r.bonusGem.name} Lv.${r.bonusGem.lv}` : '',
          r.item ? `👑${r.item.name}` : '',
        ].filter(Boolean).join(' · ');
        this.ui.toast(`🎁 레이드 ${r.phase.label} 보상: ${gains}`, 'gold');
        this.ui.addLog(`🎁 레이드 <b>${esc(r.phase.label)}</b> 수령 (${gains})`);
        this.ui.render();
      },

      /** 📋 v7.0.0 오늘의 할 일 원탭 통합 수령 허브 */
      openTodoHub: () => {
        const now = Date.now();
        const sum = collectTodoSummary(this.s, this.battle && this.battle.stats, now);
        const listHtml = sum.items.length
          ? `<div class="todo-list">${sum.items.map((it) => `
              <div class="todo-row">
                <span>${it.icon} <b>${esc(it.label)}</b></span>
                <small>${esc(it.detail)}</small>
              </div>`).join('')}</div>`
          : '<div class="tiny dim" style="margin:8px 0">지금 수령 대기 중인 보상이 없습니다.</div>';
        const alertHtml = sum.alerts.length
          ? `<div class="cmp-sec">바로 출격 가능한 이벤트</div>
             <div class="row gap6" style="flex-wrap:wrap;margin-top:6px">${sum.alerts.map((a) => `
               <button class="btn small ghost" type="button" data-action="${a.action}">${a.icon} ${esc(a.label)}</button>`).join('')}</div>`
          : '';
        const actions = [];
        if (sum.totalClaimable > 0) {
          actions.push({ label: `⚡ 전체 보상 일괄 수령 (${sum.totalClaimable}건)`, style: 'primary', onClick: () => this.actions.claimAllTodo() });
        }
        actions.push({ label: '닫기', style: 'ghost', onClick: () => {} });
        this.ui.modal({
          title: '📋 오늘의 할 일 허브',
          sub: sum.totalClaimable > 0 ? `지금 받을 수 있는 보상 ${sum.totalClaimable}건을 한 번에 정리합니다.` : '모든 보상을 수령했습니다!',
          body: `${listHtml}${alertHtml}`,
          actions,
        });
      },
      claimAllTodo: () => {
        this.sound.unlock();
        const now = Date.now();
        const r = claimAllReady(this.s, this.battle && this.battle.stats, now);
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.buffs = computeBuffs(this.s);
        this.battle.refreshStats();
        this.save(true);
        this.sound.chord('claimAll');
        const gains = [
          r.goldDelta ? `💰+${formatGold(r.goldDelta)}` : '',
          r.shardsDelta ? `💎+${r.shardsDelta}` : '',
          r.pointsDelta ? `✨+${r.pointsDelta}P` : '',
          r.medalsDelta ? `🏅+${r.medalsDelta}` : '',
        ].filter(Boolean).join(' · ');
        this.ui.toast(`⚡ 일괄 수령 완료 (${r.count}건)! ${gains}`, 'gold');
        this.ui.addLog(`📋 <b>오늘의 할 일 일괄 수령</b> (${r.claimed.join(', ')})`);
        this.ui.render();
      },

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

      /* ── v6.1.0: 🏺 고대 유물(아티팩트) ── */
      summonRelic: (mode) => {
        this.sound.unlock();
        const r = summonRelicState(this.s, mode);
        if (!r.ok) {
          this.ui.toast(r.reason || '감정할 수 없습니다', 'red');
          return;
        }
        this.buffs = computeBuffs(this.s);
        this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        this.ui.toast(
          r.isNew
            ? `🏺 신규 유물 획득! ${r.relic.icon} ${r.relic.name} — ${r.relic.effect(r.lv)}`
            : `🏺 ${r.relic.icon} ${r.relic.name} 파편 +1 (보유 ${r.frags}개)`,
          'gold',
        );
        this.ui.addLog(`🏺 <b>${esc(r.relic.name)}</b> ${r.isNew ? '신규 획득' : `파편 +1 (${r.frags})`}`);
        this.ui.render();
      },
      equipRelic: (id) => {
        const r = toggleEquipRelicState(this.s, id);
        if (!r.ok) {
          this.ui.toast(r.reason || '장착할 수 없습니다', 'red');
          return;
        }
        this.buffs = computeBuffs(this.s);
        this.battle.refreshStats();
        this.save(true);
        this.sound.ui();
        this.ui.toast(`🏺 ${r.relic.icon} ${r.relic.name} ${r.equipped ? '장착!' : '해제'}`, r.equipped ? 'green' : '');
        this.ui.render();
      },
      upgradeRelic: (id) => {
        this.sound.unlock();
        const r = upgradeRelicState(this.s, id);
        if (!r.ok) {
          this.ui.toast(r.reason || '강화할 수 없습니다', 'red');
          return;
        }
        this.buffs = computeBuffs(this.s);
        this.battle.refreshStats();
        this.save(true);
        this.sound.levelUp();
        this.ui.toast(`🏺 ${r.relic.icon} ${r.relic.name} Lv.${r.lv} 강화! (${r.paid})`, 'gold');
        this.ui.addLog(`🏺 <b>${esc(r.relic.name)} Lv.${r.lv}</b> 강화 (${r.paid})`);
        this.ui.render();
      },

      /* ── v3.3: 🎯 미션 · 🏆 업적 · 📖 도감 · v5.4 출석/주간 보스 ── */
      claimAttendance: () => {
        this.sound.unlock();
        const r = claimAttendanceState(this.s, Date.now());
        if (!r.ok) {
          this.ui.toast(r.reason || '출석 보상을 받을 수 없습니다', 'red');
          return;
        }
        if (r.acq && r.acq.equipped) this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        const gains = [
          r.item ? `👑 ${r.item.name}${r.acq && r.acq.duplicate ? ` (중복 → 💎${r.acq.shards})` : ''}` : '',
          r.gold ? `💰${r.gold.toLocaleString()}` : '',
          r.shards ? `💎${r.shards.toLocaleString()}` : '',
          r.points ? `✨${r.points}P` : '',
        ].filter(Boolean).join(' ');
        this.ui.toast(`🗓️ ${r.day}일차 출석 보상 · ${gains}`, 'gold');
        this.ui.addLog(`🗓️ <b>${r.day}일차 출석</b> 완료 · ${gains}`);
        this.ui.render();
      },

      claimWeeklyMilestone: (idx) => {
        this.sound.unlock();
        const r = claimWeeklyMilestoneState(this.s, idx, Date.now());
        if (!r.ok) {
          this.ui.toast(r.reason || '주간 보상을 받을 수 없습니다', 'red');
          return;
        }
        if (r.acq && r.acq.equipped) this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        const gains = [
          r.item ? `👑 ${r.item.name}${r.acq && r.acq.duplicate ? ` (중복 → 💎${r.acq.shards})` : ''}` : '',
          r.gold ? `💰${r.gold.toLocaleString()}` : '',
          r.shards ? `💎${r.shards.toLocaleString()}` : '',
          r.points ? `✨${r.points}P` : '',
        ].filter(Boolean).join(' ');
        this.ui.toast(`🏆 주간 보스 ${r.label} 보상 · ${gains}`, 'gold');
        this.ui.addLog(`🏆 <b>주간 보스 ${esc(r.label)}</b> 수령 · ${gains}`);
        this.ui.render();
      },

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
          r.points ? `✨${r.points}P` : '',
        ].filter(Boolean).join(' ');
        this.ui.toast(`🎯 미션 완료 · ${gains}`, 'gold');
        this.ui.addLog(`🎯 <b>${esc(r.quest.title)}</b> 완료 · ${gains}${r.next ? ` → 다음: ${esc(r.next.title)}` : ' · 모든 미션 완료!'}`);
        this.ui.render();
      },

      /* ── v4.9.0: 📅 일일 퀘스트 ── */
      claimDailyQuest: (id) => {
        this.sound.unlock();
        const r = claimDailyQuestState(this.s, id, Date.now());
        if (!r.ok) {
          this.ui.toast(r.reason || '보상을 받을 수 없습니다', 'red');
          return;
        }
        addPassXp(this.s, 40, Date.now());
        this.save(true);
        this.sound.levelUp();
        const gains = `💰${r.gold.toLocaleString()} 💎${r.shards}`;
        this.ui.toast(`📅 일일 퀘스트 완료 · ${r.quest.title} (${gains}) · 패스 +40XP`, 'gold');
        this.ui.addLog(`📅 <b>${esc(r.quest.title)}</b> 완료 · ${gains}`);
        this.ui.render();
      },
      /* ── v6.4.0: 🎖️ 영지 성장 패스 · 🏷️ 칭호 ── */
      claimPass: (lv) => {
        this.sound.unlock();
        const r = claimPassTierState(this.s, lv, Date.now());
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        if (r.acq && r.acq.equipped) this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        const gains = [`💰${formatGold(r.gold)}`, `💎${r.shards}`, r.points ? `✨${r.points}P` : '', r.medals ? `🏅${r.medals}` : '', r.item ? `👑${r.item.name}` : ''].filter(Boolean).join(' ');
        this.ui.toast(`🎖️ 패스 Lv.${r.lv} 수령 · ${gains}`, 'gold');
        this.ui.render();
      },
      claimAllPass: () => {
        this.sound.unlock();
        const r = claimAllPassTiersState(this.s, Date.now());
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.battle.refreshStats();
        this.save(true);
        this.sound.fanfare();
        const gains = [`💰${formatGold(r.gold)}`, `💎${r.shards}`, r.points ? `✨${r.points}P` : '', r.medals ? `🏅${r.medals}` : '', r.items.length ? `👑전설 ${r.items.length}개` : ''].filter(Boolean).join(' ');
        this.ui.toast(`🎖️ 패스 ${r.count}단계 일괄 수령 · ${gains}`, 'gold');
        this.ui.render();
      },
      equipTitle: (id) => {
        const r = equipTitleState(this.s, id);
        if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
        this.battle.refreshStats();
        this.save(true);
        this.sound.ui();
        this.ui.toast(r.cleared ? '🏷️ 칭호 장착 해제' : `🏷️ ${r.title.icon} ${r.title.name} 칭호 장착!`, r.cleared ? '' : 'gold');
        this.ui.render();
      },

      claimDailyQuestBonus: () => {
        this.sound.unlock();
        const r = claimDailyQuestBonusState(this.s, Date.now());
        if (!r.ok) {
          this.ui.toast(r.reason || '올클리어 보너스를 받을 수 없습니다', 'red');
          return;
        }
        this.save(true);
        this.sound.fanfare();
        const gains = `💰${r.gold.toLocaleString()} 💎${r.shards} ✨${r.points}P`;
        this.ui.toast(`🎁 일일 퀘스트 올클리어! · ${gains}`, 'gold');
        this.ui.addLog(`🎁 <b>일일 퀘스트 올클리어</b> · ${gains}`);
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
      /* ── v4.8 ☁️ 클라우드 세이브 · 🏆 랭킹 ── */
      cloudSignIn: () => this.cloudSignIn(),
      cloudSignOut: () => this.cloudSignOut(),
      cloudSaveNow: () => this.cloudUpload({ silent: false }),
      cloudLoadNow: () => this.openCloudLoad(),
      cloudToggleAuto: () => this.cloudToggleAuto(),
      cloudNickSave: () => this.cloudSaveNick(),
      cloudRank: (key) => this.cloudRank(key),
      cloudRankRefresh: () => this.cloudRank((this.cloud.rank && this.cloud.rank.key) || 'stage'),
      cloudCompare: () => (this._cloudCmp ? this.openCloudSyncModal(this._cloudCmp) : this.cloudCheckRemote({ silent: false })),
    };
  }

  /* ───────────── 부동산 거래 모달 ───────────── */
  /** v8.1.0 📋 매물 행 탭 액션시트 — 229개 목록의 행마다 붙어 있던 매수/매도/예약 3버튼을 한 번에 접는다 */
  openLandSheet(key) {
    const city = CITY_BY_KEY[key];
    if (!city) return;
    const now = Date.now();
    const held = Math.floor(Number(this.s.land.owned[key]) || 0);
    const info = priceInfo(city, now);
    const remain = Math.max(0, city.supply - held);
    const affordable = this.s.gold >= info.price;
    const hourly = city.rentPerMin * 60;
    const fav = Array.isArray(this.s.land.favorites) && this.s.land.favorites.includes(key);
    const tr = info.trend >= 0 ? `▲${info.trend.toFixed(1)}%` : `▼${Math.abs(info.trend).toFixed(1)}%`;
    const body = `
      <div class="tsum">
        <div><span>현재가</span><b>💰${Math.round(info.price).toLocaleString()}/평 ${tr}</b></div>
        <div><span>보유 · 잔여</span><b>${held.toLocaleString()}평 · ${remain.toLocaleString()}평</b></div>
        <div><span>평당 시간 임대</span><b>+💰${Math.round(hourly).toLocaleString()}/h</b></div>
        <div><span>보유 골드</span><b>💰${formatGold(this.s.gold)}</b></div>
        <div><span>체감 위치</span><b>${esc(info.bandLabel || '보통')} (${Math.round((info.bandPos != null ? info.bandPos : 0.5) * 100)}%)</b></div>
      </div>
      <div class="sheet-acts">
        <button class="btn ${affordable && remain > 0 ? 'primary' : 'ghost'} block" type="button" data-action="land-trade" data-value="${key}" data-side="buy" ${affordable && remain > 0 ? '' : 'disabled'}>🏠 매수${affordable ? '' : ' — 골드 부족'}</button>
        <button class="btn ${held > 0 ? 'ghost' : 'ghost'} block" type="button" data-action="land-trade" data-value="${key}" data-side="sell" ${held > 0 ? '' : 'disabled'}>💰 매도${held > 0 ? '' : ' — 보유 없음'}</button>
        <button class="btn ghost block" type="button" data-action="land-order-open" data-value="${key}" data-side="buy">🎯 지정가 예약</button>
      </div>
      <button class="mini ghost block" style="margin-top:8px" type="button" data-action="land-fav" data-value="${key}">${fav ? '★ 관심 해제' : '☆ 관심 등록'}</button>`;
    this.ui.modal({
      title: `${city.emoji} ${esc(city.name)}`,
      sub: `${esc(city.region)} · ${esc(city.tierLabel || '')} · 거래세 ${(LAND.feeRate * 100).toFixed(1)}%`,
      body,
      actions: [{ label: '닫기', style: 'ghost', onClick: () => {} }],
    });
  }

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
    if (side === 'buy') {
      codexCity(this.s, key, this.s.land.owned[key]); // 📖 지역 도감 기록(매도해도 유지)
      trackDailyQuest(this.s, 'invest', 1);
    }
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
    trackDailyQuest(this.s, 'invest', 1);
    this.save(true);
    this.sound.levelUp();
    const city = CITY_BY_KEY[key];
    const nm = city ? city.name : '지역';
    this.ui.toast(`🏛️ ${nm} Lv.${r.level} ${r.name} 건설 · 임대수익 +${r.rentPct}% (💰${r.spent.toLocaleString()})`, 'gold');
    this.ui.addLog(`🏛️ <b>${nm}</b> Lv.${r.level} ${r.name} · 임대수익 +${r.rentPct}%`);
    this.ui.render();
  }

  /* ───────────── 🔨 급매 경매 (v4.6) ───────────── */
  /** 낙찰 확인 모달 — 현재 입찰가·보너스·규칙을 보여 주고 결정하게 한다 */
  openAuctionBid() {
    const now = Date.now();
    const q = bidQuote(this.s, now);
    const a = auctionStatus(this.s, now);
    const lot = q.lot || a.lot;
    const city = lot.city;
    const body = `
      <div class="tsum">
        <div><span>매물</span><b>${city.emoji} ${esc(city.name)} ${lot.qty.toLocaleString()}평</b></div>
        <div><span>현재 입찰가</span><b class="gold">💰${q.price.toLocaleString()}</b></div>
        <div><span>시세</span><b>💰${lot.marketValue.toLocaleString()} (-${a.discountPct}%)</b></div>
        <div><span>보너스</span><b>${lot.bonusText}</b></div>
      </div>
      <div class="note" style="margin-top:9px">${
        q.ok
          ? `낙찰하면 <b>${lot.qty.toLocaleString()}평</b>이 바로 내 것이 되고, 임대수익이 즉시 붙습니다.<br>낙찰 후 골드 <b>💰${q.after.toLocaleString()}</b> · 거래세 없음`
          : `<span style="color:var(--red)">${esc(q.reason || '')}</span>`
      }<br><span class="dim">입찰가는 <b>${AUCTION.liveMs / 60000}분</b> 동안 시세까지 오릅니다 — 지금 낙찰할수록 쌉니다.</span></div>`;
    this.ui.modal({
      title: '🔨 급매 경매 낙찰',
      sub: `${city.name} ${lot.qty}평 · 💰${q.price.toLocaleString()} · 남은 ${Math.max(0, Math.ceil(a.leftMs / 1000))}초`,
      body,
      actions: [
        { label: '취소', onClick: () => {} },
        { label: q.ok ? `낙찰 · 💰${q.price.toLocaleString()}` : '낙찰 불가', style: 'primary', onClick: () => this.doAuctionBid() },
      ],
    });
  }

  doAuctionBid() {
    this.sound.unlock();
    const now = Date.now();
    const r = applyAuctionBid(this.s, now);
    if (!r.ok) {
      this.ui.toast(r.reason || '낙찰할 수 없습니다', 'red');
      this.ui.render();
      return;
    }
    this.buffs = computeBuffs(this.s);
    this.battle.refreshStats();
    try { codexCity(this.s, r.key, this.s.land.owned[r.key]); } catch (e) { /* ignore */ }
    trackDailyQuest(this.s, 'invest', 1, now);
    this.save(true);
    try { this.sound.coin('gold'); } catch (e) { /* ignore */ }
    this.ui.toast(
      `🔨 낙찰! ${r.city.emoji}${r.city.name} ${r.qty.toLocaleString()}평 · 💰${r.price.toLocaleString()} (시세 -${r.discountPct}%)`,
      'gold',
    );
    if (r.bonusGiven) this.ui.toast(`🎁 ${r.bonusGiven}`, 'green');
    this.ui.addLog(`🔨 <b>${r.city.name}</b> ${r.qty.toLocaleString()}평 낙찰 · 💰${r.price.toLocaleString()} · ${r.bonusText}`);
    this.checkPets();
    this.ui.render();
  }

  /** 경매 규칙 + 낙찰 내역 */
  openAuctionInfo() {
    const a = auctionStatus(this.s, Date.now());
    const log = Array.isArray(a.log) ? a.log : [];
    const rows = log.length
      ? log
        .map((e) => `<div class="kv"><span class="k">🏠 ${esc(e.name || (CITY_BY_KEY[e.key] || {}).name || '지역')} ${Math.floor(Number(e.qty) || 0).toLocaleString()}평</span><span class="v">💰${formatGold(e.price)} <span class="dim">(시세 -${Math.round((1 - (e.price / Math.max(1, e.market))) * 100)}%)</span></span></div>`)
        .join('')
      : '<div class="empty">아직 낙찰한 매물이 없습니다.</div>';
    this.ui.modal({
      title: '🔨 급매 경매 내역',
      sub: `낙찰 ${a.totals.bids}건 · 아낀 골드 💰${formatGold(a.totals.saved)} · 사용 💰${formatGold(a.totals.spend)}`,
      body: `<div class="note">
        <b>${AUCTION.everyMs / 60000}분마다</b> 새 매물이 열리고, 앞 <b>${AUCTION.liveMs / 60000}분</b>만 입찰할 수 있습니다.
        입찰가는 시간이 지나면 시세까지 오르므로 <b>일찍 낙찰할수록 유리</b>합니다.
        한 경매당 <b>1회</b>만 낙찰할 수 있고, 거래세는 붙지 않습니다.
        매물마다 <b>특별 보너스</b>(특별 임대 계약 · 강화석 · 캐시백)가 따라옵니다.
      </div>
      <div style="margin-top:8px">${rows}</div>`,
      actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
    });
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
    trackDailyQuest(this.s, 'rent', 1);
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
      this.renderer.dmgNumbersOn = this.s.dmgNumbers !== false;
      this.renderer.dmgStyle = this.s.dmgStyle === 'full' ? 'full' : 'simple';
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
      const itemCards = (d.gearItems || [])
        .map((it) => {
          const def = gearItem(it.id);
          return `<div class="cx-g ${it.got ? '' : 'lock'} r-${it.rarity}">
            <div class="cx-g-ico">${def ? gearIcon(def, 28) : '🎒'}</div>
            <div class="cx-g-n">${it.got ? esc(it.name) : '???'}</div>
            <div class="cx-g-k">${it.equipped ? '장착 중' : it.got ? `×${Math.max(1, it.count)}` : '미획득'}</div>
          </div>`;
        })
        .join('');
      body = `<div class="codex-sum">장비 등급 ${c.gear.seen}/${c.gear.total} · 카탈로그 ${c.gearItems.seen}/${c.gearItems.total}종</div>
        <div class="codex-gear">${d.gear
        .map(
          (g) => `<div class="kv"><span class="k"><span class="rb ${g.id}">${g.name}</span></span><span class="v">${
            g.got
              ? `획득 ${g.count > 1 ? `${g.count}회` : '✓'}${g.slots.length ? ` · 장착 ${g.slots.map((sl) => EQUIP[sl].icon).join('')}` : ''}`
              : '미획득'
          }</span></div>`,
        )
        .join('')}</div>
        <div class="cx-gear-grid" style="margin-top:9px">${itemCards}</div>
        <div class="note" style="margin-top:10px">뽑기·사냥 드랍으로 획득한 35종 장비가 모두 기록됩니다. 전설은 40회 안에 1개 확정(천장).</div>`;
    } else {
      body = `<div class="codex-sum">펫 ${c.pets.seen}/${c.pets.total} · 진화 단계 ${c.petEvos.seen}/${c.petEvos.total}</div>
        <div class="codex-pets">${d.pets
        .map(
          (p) => `<div class="cx-pet ${p.unlocked ? '' : 'lock'}">
            <img src="assets/sprites/pet/${p.sprite}.png" alt="" loading="lazy">
            <div class="cx-pet-mid">
              <b>${p.emoji} ${esc(p.name)}</b>
              <span>${p.unlocked ? `진화 ${p.evo === 2 ? '★★ 신수' : p.evo === 1 ? '★ 각성' : '기본'} · 동행 가능` : `🔒 ${esc(p.cond)}`}</span>
              <div class="cx-pet-stages">${(p.stages || []).map((st) => `<span class="cx-st ${st.unlocked ? 'on' : ''}">${st.stage === 0 ? '기본' : st.stage === 1 ? '★각성' : '★★신수'} ${esc(st.name)}</span>`).join('')}</div>
            </div>
          </div>`,
        )
        .join('')}</div>
        <div class="note" style="margin-top:10px">부동산 조건으로 해금(4종)하고, 강화 Lv.5/Lv.10에서 ★각성·★★신수로 진화합니다(총 12단계).</div>`;
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
          : item.auto
            ? `♻️ 자동분해 +💎${item.shards}`
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

    const rowObj = gearOwned(s).find((x) => x.uid === id);
    const isMythic = !!(rowObj && rowObj.mythic);
    const isLocked = !!(rowObj && rowObj.locked);
    const af = rowObj && rowObj.affix ? gearAffixInfo(rowObj.affix) : null;
    const rfCost = gearReforgeCost(it);
    const affixBox = `<div class="cmp-sec">잠재 접두사 <small>강화석 재련으로 변경 가능</small></div>
      <div class="af-box">${af
        ? `<b>✨ ${esc(af.name)}</b><span>${esc(af.text)}</span>`
        : '<span class="dim">잠재 옵션 없음 — 아래 재련 버튼으로 각인할 수 있습니다</span>'}</div>`;
    const mythicBox = it.rarity === 'legend'
      ? `<div class="mythic-box${isMythic ? ' on' : ''}">
          ${isMythic
            ? `✨ <b>신화 초월 완료</b> — 부위 강화 <b>+${MYTHIC_BONUS_LV}강 상당</b> · 고유/잠재 옵션 <b>+${MYTHIC_OPT_PCT}%</b> · 신화 오라 적용`
            : `✨ <b>신화 초월 가능</b> — 💰${formatGold(MYTHIC_COST.gold)} · 💎${MYTHIC_COST.shards} · ✨${MYTHIC_COST.points}P → 강화 +${MYTHIC_BONUS_LV}강 상당 & 옵션 +${MYTHIC_OPT_PCT}%`}
        </div>`
      : '';

    const itSet = gearSetOf(it);
    const setBox = itSet ? (() => {
      const st = gearSetStatus(s).find((x) => x.id === itSet.id);
      const cnt = st ? st.count : 0;
      const lines = itSet.tiers.map((t) => {
        const on = cnt >= t.need;
        return `<div class="gset-tier${on ? ' on' : ''}"><b>${t.need}세트</b><span>${esc(gearSetBonusText(t.opts))}</span></div>`;
      }).join('');
      return `<div class="cmp-sec">테마 세트 <small>${itSet.icon} ${itSet.name} · 현재 ${cnt}부위 장착</small></div>
        <div class="gset-modal" style="--sc:${itSet.color}">${lines}</div>`;
    })() : '';

    const body = `
      <div class="cmp-head">
        <span class="cmp-ico">${gearIcon(it, 54)}</span>
        <span class="cmp-title">
          <span class="cmp-name">${isLocked ? '🔒 ' : ''}${esc(it.name)} ${isMythic ? '<span class="rb mythic">✨신화</span>' : `<span class="rb ${r.id}">${r.name}</span>`}${itSet ? `<span class="gset-tag" style="--sc:${itSet.color}">${itSet.icon}${itSet.name}</span>` : ''}</span>
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
      ${affixBox}
      ${mythicBox}
      ${setBox}
      <div class="cmp-sec">장착하면 달라지는 것</div>
      <div class="cmp-stats">${stats || '<div class="tiny dim">스탯 변화 없음</div>'}</div>`;

    const actions = [];
    if (!isOn) {
      actions.push({ label: `⚔️ 장착하기`, style: 'primary', onClick: () => this.actions.equipGearItem(id) });
    }
    if (it.rarity === 'legend' && !isMythic) {
      actions.push({
        label: `✨ 신화 초월`,
        style: 'gold',
        keepOpen: true,
        onClick: () => this.transcendGearItem(id),
      });
    }
    actions.push({
      label: isLocked ? '🔓 잠금 해제' : '🔒 잠금 보호',
      style: 'ghost',
      keepOpen: true,
      onClick: () => this.toggleGearLockItem(id),
    });
    actions.push({
      label: `🔮 재련 · 💎${rfCost}`,
      style: 'ghost',
      keepOpen: true,
      onClick: () => this.reforgeGearItem(id),
    });
    if (!isLocked) {
      actions.push({
        label: `♻️ 분해 · 💎${dismantleValue(it)}`,
        style: 'ghost',
        onClick: () => this.confirmDismantleGear(id),
      });
    }
    actions.push({ label: '닫기', style: 'ghost', onClick: () => {} });
    this.ui.modal({ title: '⚔️ 장비 비교', sub: isOn ? '장착 중' : '장착하면 아래 수치만큼 바뀝니다(부위 강화 레벨은 그대로)', body, actions });
  }

  openRiftPickModal() {
    const r = this.battle && this.battle.rift;
    if (!r || !Array.isArray(r.picking) || !r.picking.length) return;
    const body = `<div class="rift-picks">${r.picking.map((c) => `
      <button class="rift-pick-btn" style="--rc:${c.color}" type="button" data-action="rift-pick" data-value="${c.id}">
        <span class="rp-ico">${c.icon}</span>
        <span><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></span>
      </button>`).join('')}</div>`;
    this.ui.modal({
      title: `🃏 균열 축복 선택 (W${r.wavesCleared} 돌파!)`,
      sub: '3장의 축복 카드 중 1장을 고르면 다음 웨이브가 시작됩니다.',
      body,
      actions: [{ label: '나중에 고르기 (일시정지)', style: 'ghost', onClick: () => {} }],
    });
  }

  toggleGearLockItem(uid) {
    const r = toggleGearLockState(this.s, uid);
    if (!r.ok) { this.ui.toast(r.reason || '변경할 수 없습니다', 'red'); return; }
    this.save(true);
    this.ui.toast(r.locked ? `🔒 ${r.item.name} 잠금 보호 설정` : `🔓 ${r.item.name} 잠금 해제`);
    this.ui.render();
    this.openGearItem(uid);
  }

  transcendGearItem(uid) {
    this.sound.unlock();
    const r = transcendGearState(this.s, uid);
    if (!r.ok) { this.ui.toast(r.reason || '초월할 수 없습니다', 'red'); return; }
    this.battle.refreshStats();
    this.save(true);
    this.sound.gacha('legend');
    this.ui.toast(`✨ 신화 초월 완료! ${r.item.name} (+${MYTHIC_BONUS_LV}강 상당 · 옵션 +${MYTHIC_OPT_PCT}%)`, 'gold');
    this.ui.addLog(`✨ <b>${esc(r.item.name)}</b> 신화 초월! (💰${formatGold(r.spent.gold)} · 💎${r.spent.shards} · ✨${r.spent.points}P)`);
    this.ui.render();
    this.openGearItem(uid);
  }

  reforgeGearItem(uid) {
    this.sound.unlock();
    const r = reforgeGearState(this.s, uid);
    if (!r.ok) {
      this.ui.toast(r.reason || '재련할 수 없습니다', 'red');
      return;
    }
    this.battle.refreshStats();
    this.save(true);
    this.sound.levelUp();
    this.ui.toast(`🔮 잠재 재련 완료 — ✨${r.affix.name} (${r.affix.text})`, 'gold');
    this.ui.addLog(`🔮 <b>${esc(r.item.name)}</b> 재련 → ✨${esc(r.affix.name)} ${esc(r.affix.text)} (💎${r.spent})`);
    this.ui.render();
    this.openGearItem(uid);
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

  /* ───────────── 🌟 일일 보스 결과 (v4.5) · 🗼 도전의 탑 결과·층 선택 (v4.2) ───────────── */
  /** 일일 보스 결과 모달 — 등급·누적 피해·보상 */
  showDailyResult(ev) {
    const rw = [
      { e: '💰', v: ev.gold.toLocaleString(), k: '골드' },
      { e: '💎', v: ev.shards.toLocaleString(), k: '강화석' },
    ];
    if (ev.points) rw.push({ e: '✨', v: `+${ev.points}P`, k: '초월석' });
    rw.push({ e: '⚔️', v: ev.dmg.toLocaleString(), k: '누적 피해' });
    const how = ev.how === 'dead' ? '전투 불능' : ev.how === 'kill' ? '보스 격파!' : '30초 종료';
    this.ui.modal({
      title: `🌟 일일 보스 · ${ev.gradeLabel}등급`,
      sub: `${ev.ko} · ${how} · 기본 화력 대비 ${Math.round((ev.ratio || 0) * 100)}%`,
      body: `<div class="daily-result-grade" style="color:${ev.gradeColor || '#ffd76a'}">${ev.gradeLabel}<small>${ev.isBest ? ' 최고 기록 갱신' : `${ev.bestGrade} 최고`}</small></div>
             <div class="modal-rewards">${rw.map((r) => `<div class="rw"><div class="e">${r.e}</div><div class="v">${esc(r.v)}</div><div class="k">${r.k}</div></div>`).join('')}</div>
             <div class="note" style="margin-top:9px">보상은 이미 반영되었습니다. 오늘 남은 도전 <b>${ev.left}회</b> · 매일 00:00(KST)에 다시 채워집니다.<br>원래 스테이지 자동사냥으로 복귀했습니다.</div>`,
      actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
    });
  }

  /** 층 클리어 결과 모달 — 최초 클리어면 보상, 재도전이면 소액 보상 */
  showTowerResult(ev) {
    const def = towerFloor(ev.n);
    const rw = [
      { e: '💰', v: ev.gold.toLocaleString(), k: '골드' },
      { e: '💎', v: ev.shards.toLocaleString(), k: '강화석' },
    ];
    if (ev.points) rw.push({ e: '✨', v: `+${ev.points}P`, k: '초월석' });
    if (ev.item) rw.push({ e: '🎒', v: ev.item.name, k: '장비' });
    // v4.7: 자동분해 기준 이하 장비는 이름 대신 변환된 강화석을 보여 준다
    if (ev.autoItem) rw.push({ e: '♻️', v: `${ev.autoItem} +💎`, k: '자동분해' });
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

  /** 층 선택 모달 — 클리어/도전 가능/잠금 상태와 기믹·보상을 한눈에 (v4.5: 심층 11층+ 창) */
  showTowerFloors() {
    const tp = towerProgress(this.s);
    const row = (f) => {
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
          <div class="tf-rew">최초 ${esc(towerRewardText(this.s, f.n))} · 최고 S${f.minStage}${f.deep ? ' · 심층' : ''}</div>
        </div>
        <div class="tf-act">
          <span class="tiny">${state}</span>
          ${open ? `<button class="mini ${cleared ? '' : 'up'}" type="button" data-action="tower" data-value="${f.n}" ${this.battle && (this.battle.tower || this.battle.daily) ? 'disabled' : ''}>${cleared ? '재도전' : '도전'}</button>` : '<button class="mini" type="button" disabled>잠김</button>'}
        </div>
      </div>`;
    };
    const rows = TOWER_FLOORS.map(row).join('');
    // 심층 창 — 진행 지점 앞뒤 12층만 보여 준다(200층을 한 화면에 그리지 않는다)
    const from = Math.max(TOWER_FIXED_FLOOR + 1, Math.min(Math.max(1, tp.best), TOWER_MAX_FLOOR - 11));
    const deep = [];
    for (let n = from; n <= Math.min(TOWER_MAX_FLOOR, from + 11); n++) {
      const f = towerFloor(n);
      if (f) deep.push(row(f));
    }
    this.ui.modal({
      title: '🗼 도전의 탑 · 층 선택',
      sub: `최고 ${tp.best}층 / ${tp.max}층 · ${tp.allCleared ? '모든 층 클리어!' : `다음 ${tp.next}층`} · 패배해도 잃는 것은 없습니다`,
      body: `<div class="tower-list">${rows}
             <div class="tower-sec">♾️ 심층 구간 — ${from}~${Math.min(TOWER_MAX_FLOOR, from + 11)}층 (5층마다 기믹 +1 · 보상 증가)</div>
             ${deep.join('')}</div>
             <div class="note" style="margin-top:9px">층마다 <b>기믹</b>이 다릅니다 — 다굴·포격·광폭·재생·타임어택·철벽. 장비 조합(흡혈·방어·범위 베기)을 시험해 보세요.<br>11층부터는 <b>자동 생성되는 심층</b>으로, 올라갈수록 적이 강해지고 보상도 커집니다.</div>`,
      actions: [{ label: '닫기', style: 'ghost', onClick: () => {} }],
    });
  }

  /** ⚡ v6.3.0 원탭 분산 투자 미리보기 및 일괄 집행 */
  openAutoInvestModal(mode = 'roi') {
    const now = Date.now();
    const plan = planAutoInvest(this.s, mode, 0.85, now);
    if (!plan.ok) {
      this.ui.toast(plan.reason || '분산 투자 견적을 만들 수 없습니다', 'red');
      return;
    }
    const listHtml = plan.items.map((it) => `<div class="kv"><span class="k">${it.city.emoji} ${esc(it.city.name)} <b>${it.qty.toLocaleString()}평</b> <small class="dim">(${esc(it.note)})</small></span><span class="v">💰${formatGold(it.cost)}</span></div>`).join('');
    this.ui.modal({
      title: `⚡ ${plan.meta.icon} ${esc(plan.meta.title)}`,
      sub: `${plan.count}곳 · 총 ${plan.totalPyeong.toLocaleString()}평 일괄 매수 견적`,
      body: `${listHtml}
             <div class="kv" style="margin-top:6px"><span class="k">총 매수액 (거래세 포함)</span><span class="v" style="color:var(--gold)">💰${formatGold(plan.totalSpend)}</span></div>
             <div class="kv"><span class="k">매수 후 잔여 골드</span><span class="v">💰${formatGold(plan.afterGold)}</span></div>
             <div class="note" style="margin-top:8px">${esc(plan.meta.desc)}</div>`,
      actions: [
        { label: '취소', onClick: () => {} },
        {
          label: `⚡ ${plan.count}곳 일괄 매수`,
          style: 'primary',
          onClick: () => {
            const r = executeAutoInvest(this.s, mode, 0.85, Date.now());
            if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
            this.buffs = computeBuffs(this.s);
            this.battle.refreshStats();
            this.checkPets(Date.now());
            trackDailyQuest(this.s, 'invest', r.count);
            this.save(true);
            this.sound.fanfare();
            this.ui.toast(`⚡ ${r.meta.title} 완료! ${r.count}곳 ${r.totalPyeong.toLocaleString()}평 (💰${formatGold(r.totalSpend)})`, 'gold');
            this.ui.addLog(`⚡ <b>${esc(r.meta.title)}</b> · ${r.count}곳 ${r.totalPyeong.toLocaleString()}평 매수`);
            this.ui.render();
          },
        },
      ],
    });
  }

  /** 🏛️ v6.3.0 랜드마크 일괄 증축 미리보기 및 실행 */
  openBulkLandmarksModal() {
    const plan = planBulkLandmarks(this.s, Date.now());
    if (!plan.ok) {
      this.ui.toast(plan.reason || '증축 가능한 랜드마크가 없습니다', 'red');
      return;
    }
    const listHtml = plan.items.slice(0, 12).map((it) => `<div class="kv"><span class="k">${it.city.emoji} ${esc(it.city.name)} ${it.icon} Lv.${it.lv}→Lv.${it.next}</span><span class="v">💰${formatGold(it.cost)}</span></div>`).join('');
    this.ui.modal({
      title: `🏛️ 랜드마크 일괄 증축 (${plan.count}곳)`,
      sub: '저렴한 지역부터 보유 골드로 한 번에 증축합니다',
      body: `${listHtml}${plan.count > 12 ? `<div class="tiny dim" style="margin-top:4px">외 ${plan.count - 12}곳 포함</div>` : ''}
             <div class="kv" style="margin-top:6px"><span class="k">총 건설 비용</span><span class="v" style="color:var(--gold)">💰${formatGold(plan.totalSpend)}</span></div>
             <div class="kv"><span class="k">증축 후 잔여 골드</span><span class="v">💰${formatGold(plan.afterGold)}</span></div>`,
      actions: [
        { label: '취소', onClick: () => {} },
        {
          label: `🏛️ ${plan.count}곳 일괄 증축`,
          style: 'primary',
          onClick: () => {
            const r = executeBulkLandmarks(this.s, Date.now());
            if (!r.ok) { this.ui.toast(r.reason, 'red'); return; }
            this.buffs = computeBuffs(this.s);
            this.battle.refreshStats();
            this.save(true);
            this.sound.fanfare();
            this.ui.toast(`🏛️ 랜드마크 ${r.count}곳 일괄 증축 완료! (💰${formatGold(r.totalSpend)})`, 'gold');
            this.ui.addLog(`🏛️ <b>랜드마크 ${r.count}곳 일괄 증축</b> · 💰${formatGold(r.totalSpend)}`);
            this.ui.render();
          },
        },
      ],
    });
  }

  /** 🎯 v6.0.0 관심 매물 지정가 예약 매매 등록 모달 */
  openLimitOrderModal(cityKey, defaultSide = 'buy') {
    const city = CITY_BY_KEY[cityKey];
    if (!city) return;
    const now = Date.now();
    const info = priceInfo(city, now);
    const held = Math.floor(Number((this.s.land && this.s.land.owned && this.s.land.owned[cityKey]) || 0));
    let side = defaultSide === 'sell' && held > 0 ? 'sell' : 'buy';
    let targetPrice = Math.max(1, Math.round(info.price * (side === 'buy' ? 0.90 : 1.12)));
    let qty = side === 'sell' ? Math.max(1, Math.min(10, held)) : 10;

    const renderBody = () => {
      const presets = side === 'buy'
        ? [['-15% 저점', 0.85], ['-10%', 0.90], ['-5%', 0.95], ['현재가', 1.0]]
        : [['+5%', 1.05], ['+10%', 1.10], ['+15% 고점', 1.15], ['+20%', 1.20]];
      const qtys = side === 'sell'
        ? [1, 10, 50, held].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i)
        : [1, 10, 50, 100];
      return `
        <div class="kv"><span class="k">현재 시세</span><span class="v">💰${info.price.toLocaleString()}/평 (${esc(info.bandLabel || '보통')})</span></div>
        <div class="kv"><span class="k">보유 평수</span><span class="v">${held.toLocaleString()}평 · 보유 골드 💰${formatGold(this.s.gold)}</span></div>
        <div class="chips" style="margin:8px 0 6px" id="ordSideRow">
          <button class="chip${side === 'buy' ? ' on' : ''}" type="button" data-ord-side="buy">🔵 지정가 매수</button>
          <button class="chip${side === 'sell' ? ' on' : ''}" type="button" data-ord-side="sell" ${held < 1 ? 'disabled' : ''}>🔴 지정가 매도</button>
        </div>
        <div class="tiny dim" style="margin-top:4px">목표가 (골드/평) — ${side === 'buy' ? '현재가가 이 가격 이하일 때 체결' : '현재가가 이 가격 이상일 때 체결'}</div>
        <input id="ordPriceIn" class="cloud-nick-in" style="width:100%;margin-top:4px" type="number" min="1" value="${targetPrice}">
        <div class="chips" style="margin-top:5px" id="ordPricePresets">
          ${presets.map(([lbl, mul]) => `<button class="chip" type="button" data-ord-pmul="${mul}">${lbl}</button>`).join('')}
        </div>
        <div class="tiny dim" style="margin-top:8px">예약 수량 (평)</div>
        <input id="ordQtyIn" class="cloud-nick-in" style="width:100%;margin-top:4px" type="number" min="1" value="${qty}">
        <div class="chips" style="margin-top:5px" id="ordQtyPresets">
          ${qtys.map((n) => `<button class="chip" type="button" data-ord-qty="${n}">${n === held && side === 'sell' ? `전량 ${n}` : `${n}평`}</button>`).join('')}
        </div>
        <div class="note" style="margin-top:8px">접속 중 시세가 목표가에 도달하면 자동으로 체결됩니다(최대 ${LIMIT_ORDER_MAX}건).</div>`;
    };

    const open = () => {
      this.ui.modal({
        title: `🎯 ${city.emoji} ${esc(city.name)} 지정가 예약`,
        sub: `${esc(city.region)} · 시세 변동 자동 체결`,
        body: renderBody(),
        actions: [
          { label: '취소', onClick: () => {} },
          {
            label: '🎯 예약 등록',
            style: 'primary',
            onClick: () => {
              const pEl = document.getElementById('ordPriceIn');
              const qEl = document.getElementById('ordQtyIn');
              const tp = Math.floor(Number((pEl && pEl.value) || targetPrice) || 0);
              const qn = Math.floor(Number((qEl && qEl.value) || qty) || 0);
              const r = addLimitOrderState(this.s, { cityKey, side, targetPrice: tp, qty: qn }, Date.now());
              if (!r.ok) {
                this.ui.toast(r.reason || '예약을 등록할 수 없습니다', 'red');
                return;
              }
              this.save(true);
              this.sound.ui();
              this.ui.toast(`🎯 ${city.name} ${side === 'buy' ? '매수' : '매도'} 예약 등록 (💰${tp.toLocaleString()}/평 · ${qn}평)`, 'gold');
              this.ui.render();
            },
          },
        ],
      });
      const card = this.ui.el.modalCard;
      if (!card) return;
      card.querySelectorAll('[data-ord-side]').forEach((btn) => {
        btn.addEventListener('click', () => {
          side = btn.dataset.ordSide === 'sell' ? 'sell' : 'buy';
          targetPrice = Math.max(1, Math.round(info.price * (side === 'buy' ? 0.90 : 1.12)));
          qty = side === 'sell' ? Math.max(1, Math.min(10, held)) : 10;
          open();
        });
      });
      card.querySelectorAll('[data-ord-pmul]').forEach((btn) => {
        btn.addEventListener('click', () => {
          targetPrice = Math.max(1, Math.round(info.price * Number(btn.dataset.ordPmul || 1)));
          const pEl = document.getElementById('ordPriceIn');
          if (pEl) pEl.value = String(targetPrice);
        });
      });
      card.querySelectorAll('[data-ord-qty]').forEach((btn) => {
        btn.addEventListener('click', () => {
          qty = Math.max(1, Math.floor(Number(btn.dataset.ordQty || 1)));
          const qEl = document.getElementById('ordQtyIn');
          if (qEl) qEl.value = String(qty);
        });
      });
    };
    open();
  }

  showOfflinePopup(summary, levelUps) {
    const h = Math.floor(summary.sec / 3600);
    const m = Math.floor((summary.sec % 3600) / 60);
    const away = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    // v4.7: 얼마나 쉬었고 시간당 얼마나 벌었는지 한눈에 — 보상 카드 위에 요약 줄을 둔다
    const hours = Math.max(summary.sec / 3600, 1 / 60);
    const perHour = Math.round(summary.gold / hours);
    const capLeft = Math.max(0, ECON.offlineCapHours * 3600 - summary.sec);
    const capLine = summary.capped
      ? `최대 <b>${ECON.offlineCapHours}시간</b>까지만 정산됩니다 — 더 긴 방치는 이만큼씩만 쌓입니다.`
      : `계속 자리를 비우면 <b>${Math.floor(capLeft / 3600)}시간 ${Math.floor((capLeft % 3600) / 60)}분</b> 더 쌓입니다 (최대 ${ECON.offlineCapHours}시간).`;
    // v8.2.0 — 복귀 안내에서 바로 '오늘의 할 일 허브'로: 방치 보상 + 허브 + 개별 카드 3중 동선을 한 번에 끝낸다
    let todo = { totalClaimable: 0, items: [] };
    try {
      todo = collectTodoSummary(this.s, this.battle && this.battle.stats, Date.now());
    } catch (e) { todo = { totalClaimable: 0, items: [] }; }
    const n = todo.totalClaimable;
    const todoRows = todo.items.slice(0, 3)
      .map((it) => `<div class="ret-row"><span>${it.icon} ${esc(it.label)}</span><small>${esc(it.detail)}</small></div>`)
      .join('');
    const hubBlock = `<div class="ret-hub${n > 0 ? ' ready' : ''}">
        <div class="ret-hub-h">📋 오늘의 할 일 ${n > 0 ? `<b>${n}건</b> 수령 대기` : '<span class="dim">— 모두 수령 완료</span>'}</div>
        ${todoRows || '<div class="tiny dim" style="margin-top:3px">지금 챙길 보상은 없습니다. 사냥을 계속하면 채워집니다.</div>'}
        <div class="tiny dim" style="margin-top:4px">출석·패스·일일퀘·미션·탑 소탕·은행·파견·레이드를 <b>허브에서 한 번에</b> 받습니다.</div>
      </div>`;
    const actions = n > 0
      ? [
        { label: `📋 오늘의 할 일 ${n}건 챙기기`, style: 'primary', onClick: () => this.ui.gotoTodoHub() },
        { label: '닫기', style: 'ghost', onClick: () => {} },
      ]
      : [{ label: '확인', style: 'primary', onClick: () => {} }];
    this.ui.modal({
      title: '🌙 방치 보상',
      sub: `${away} 동안 사냥을 계속했습니다 · 시간당 💰${perHour.toLocaleString()}${summary.capped ? ` (최대 ${ECON.offlineCapHours}시간 정산)` : ''}`,
      body: `<div class="kv"><span class="k">자리 비운 시간</span><span class="v">${away}</span></div>
             <div class="kv"><span class="k">시간당 골드</span><span class="v">💰${perHour.toLocaleString()}/h</span></div>
             <div class="kv"><span class="k">정산 비율</span><span class="v">접속 중 사냥의 ${Math.round(ECON.offlineRate * 100)}%</span></div>
             <div class="modal-rewards">
               <div class="rw"><div class="e">💰</div><div class="v">${summary.gold.toLocaleString()}</div><div class="k">골드</div></div>
               <div class="rw"><div class="e">✨</div><div class="v">${summary.exp.toLocaleString()}</div><div class="k">경험치</div></div>
               <div class="rw"><div class="e">💎</div><div class="v">${summary.shards.toLocaleString()}</div><div class="k">강화석</div></div>
             </div>
             ${levelUps > 0 ? `<div class="note" style="color:var(--green)">⬆️ 레벨 업 +${levelUps} · 스탯이 상승했습니다.</div>` : ''}
             <div class="note">보상은 이미 반영되었습니다. ${capLine}</div>
             ${hubBlock}`,
      actions,
    });
  }
}

const app = new App();
window.LAND_RPG = app; // 디버깅/검증용
app.boot();
