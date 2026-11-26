// land-rpg / src/ui.js
// 하단 탭 UI · HUD · 토스트/모달. 상태는 app.js 를 통해 읽고, 조작은 actions 로 넘긴다.
// v3: 게스트 전용 — 로그인/클라우드 UI 없이 [사냥/스킬 | 장비/강화 | 부동산 | 설정].
import {
  APP_VERSION, ECON, EQUIP, EQUIP_SLOTS, EQUIP_MAX_LV, SKILLS, SKILL_UPGRADE_MAX, skillCost, enhanceCost,
  SKILL_RUNES, SKILL_RUNE_UNLOCK_LV, skillRuneOf,
  RARITIES, RARITY_INDEX, GACHA, gachaCost, rarityBonusLv,
  ULTIMATES, ULT_MIN_TIER, ultimateOf, ultCdOf, ultLeftMs,
} from './data.js';
import { expNeed, skillEffect, shardPrice, enhanceMaxCount, maxShardsBuy, SHARD_BULK, skillCdOf } from './state.js';
import {
  CITIES, LAND, portfolioOf, computeBuffs, buffProgress, formatGold,
  CITY_BY_KEY, LANDMARK, landmarkLevel, landmarkQuote, landmarkSummary,
  LAND_MANAGER, isFavoriteCity, landManagerUnlocked,
} from './land.js';
import {
  AUCTION, auctionStatus, auctionLot, auctionBonusText,
} from './auction.js';
import { planBulkLandmarks } from './portfolio-ops.js';
import {
  LAND_SYNERGY, landSynergy, landBuffTotals, landBuffTotalsText, nextLandmarkStep,
} from './synergy.js';
import {
  activeNews, newsCovers, regionSetStatus, regionSetBuffs, buffText,
} from './region.js';
import {
  isPetDispatched, expeditionStatus,
} from './expedition.js';
import {
  PETS, DUNGEON, PET_MAX_LV, petDef, petProgress, petLevel, petAtkPct, petDmgPct,
  petUpgradeCost, jobOf, jobProgress, dungeonState, JOB_COUNT, isUpperJob,
  PET_EVO_MAX, petEvo, petStageInfo, petEvolveInfo, petSkillOf, petSkillText, petGoldPct, evoStageDef,
  SUB_PET_REQ, subPetUnlocked, subPet, battleSpeedUnlocked, effectiveBattleSpeed,
} from './meta.js';
import {
  TOWER_FLOORS, TOWER_MAX_FLOOR, TOWER_FIXED_FLOOR, TOWER_GIMMICKS, towerFloor, towerProgress, towerGimmickText,
  towerGoalText, towerRewardText, towerGimmicks, towerUnlocked, towerLockReason, towerSweepInfo, towerSweepText,
} from './tower.js';
import {
  DAILY, dailyInfo, dailyBossFor, dailyGradeText,
  attendanceInfo, weeklyBossInfo,
} from './daily.js';
import {
  QUESTS, ACHIEVEMENTS, questStateOf, currentQuest, questProgress, codexStats,
  achievementStatus, claimedAchievementCount, dailyQuestStatus,
} from './quests.js';
import { passInfo } from './pass.js';
import { raidStatus } from './guild.js';
import { collectTodoSummary } from './hub.js';
import {
  GEAR_ITEMS, GEAR_SETS, GEAR_FILTERS, GEAR_SET_FILTERS, GEAR_OPTS, GEAR_DROP,
  gearIcon, gearItem, gearList, gearOwned, gearOptionList, gearOptionSummary,
  equippedItem, equippedRarity, gearCollection, gearSlotCounts, dismantleValue,
  dismantleTargets, AUTO_DISMANTLE_MODES, autoDismantleIdx, autoDismantleLabel, normalizeAutoMode,
  GEAR_PRESET_NAMES, GEAR_AWAKEN_MAX, GEAR_AWAKEN_BONUS_LV, GEAR_AWAKEN_OPT_PCT,
  awakenLevel, awakenCost, gearPresetSummary,
} from './gear.js';
import {
  GEMS, GEM_BY_ID, GEM_MAX_LV, GEM_MERGE_NEED, GEM_CUT_COST, THEME_CRAFT_COST, gemEffects,
} from './gems.js';
import {
  REBIRTH, REBIRTH_TRAITS, rebirthStatus, rebirthBonus, traitLevel, traitCost, traitSummary,
} from './rebirth.js';
import { esc, fmt, compact, pct, hhmmss, mmss } from './ui-fmt.js';
import { cloudCard, rankCard } from './ui-cloud.js';
import { rarityBadge, rarityName, gearSlotCards, gearInventory, gachaCard } from './ui-gear.js';
import {
  paybackText, trendHtml, traitBadge,
  invasionCard, regionMapCard, expeditionCard, investDashboardCard, limitOrdersCard, citadelCard,
  bankCard, megaProjectCard, buildMarketList, tplLandMarket,
} from './ui-land.js';
import { bankStatus } from './bank.js';
import { invasionStatus } from './invasion.js';
import { computeCpBreakdown, recommendGrowth } from './guide.js';
import {
  relicCard, riftCard, guildRaidCard, passCard, titleCard, cpGuideInner,
} from './ui-hunt.js';

/** v6.5.0 전투 캔버스 상단 실시간 버프 HUD 바 항목 생성 */
export function activeBuffPills(b, now = Date.now()) {
  if (!b) return [];
  const pills = [];
  if (b.berserkUntil > now) {
    const left = ((b.berserkUntil - now) / 1000).toFixed(1);
    const label = b.berserkRune === 'fury' ? `광전사 ${left}s` : b.berserkRune === 'iron' ? `불굴 ${left}s` : `광폭 ${left}s`;
    pills.push({ id: 'berserk', icon: b.berserkRune === 'iron' ? '🛡️' : '🔥', label, cls: 'atk' });
  }
  if (b.player && b.player.shield > 0 && b.player.shieldUntil > now) {
    pills.push({ id: 'shield', icon: '✨', label: `보호막 ${fmt(b.player.shield)}`, cls: 'def' });
  }
  if (b.blessUntil > now) {
    pills.push({ id: 'bless', icon: '🌟', label: `축복 ${((b.blessUntil - now) / 1000).toFixed(1)}s`, cls: 'atk' });
  }
  if (b.petGoldUntil > now) {
    pills.push({ id: 'goldRain', icon: '🪙', label: `황금비 ${((b.petGoldUntil - now) / 1000).toFixed(1)}s`, cls: 'gold' });
  }
  if (b.ultUntil > now) {
    pills.push({ id: 'ult', icon: '⚡', label: `궁극 ${((b.ultUntil - now) / 1000).toFixed(1)}s`, cls: 'ult' });
  }
  if (b.player && b.player.graceUntil > now) {
    pills.push({ id: 'grace', icon: '🛡️', label: `가호 ${((b.player.graceUntil - now) / 1000).toFixed(1)}s`, cls: 'def' });
  }
  return pills;
}

export class UI {
  constructor(app) {
    this.app = app; // { s, battle, buffs, actions ... }
    this.tab = 'hunt';
    this.huntSub = 'battle'; // 사냥 탭 서브 탭 (전투/도전/미션 · 세션 유지)
    this.growthFilter = 'all'; // v5.5 전직·환생 탭 영역 필터('all' | 'challenge' | 'growth')
    this.gearSub = 'equip'; // v8.0.0 성장 탭 서브 탭('equip' | 'job' | 'collect')
    this.landHoldAll = false; // v4.3 부동산 탭 보유 매물 펼치기(기본은 6곳까지)
    // v8.0.0: 섹션 칩 필터 제거 — 카드 접힘 상태만 세션에 기억한다
    this.collapsed = new Set(DEFAULT_COLLAPSED);
    this.expPick = { petId: '', setId: '', durKey: 'short' }; // v5.9 펫 파견 선택 상태
    this.gemSlot = 'weapon'; // v6.2 보석 장착 대상 부위
    this._lastBuffHtml = '';
    this.el = {
      hud: document.getElementById('hud'),
      gold: document.getElementById('goldVal'),
      shard: document.getElementById('shardVal'),
      asset: document.getElementById('assetVal'),
      rentHr: document.getElementById('rentHr'),
      assetBadge: document.getElementById('assetBadge'),
      stageNum: document.getElementById('stageNum'),
      themeName: document.getElementById('themeName'),
      stageSpeedBtn: document.getElementById('stageSpeedBtn'),
      todoBtn: document.getElementById('todoBtn'),
      todoCount: document.getElementById('todoCount'),
      battleBuffBar: document.getElementById('battleBuffBar'),
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
      srLive: document.getElementById('srLive'),
      modalRoot: document.getElementById('modalRoot'),
      modalCard: document.getElementById('modalCard'),
      boot: document.getElementById('boot'),
      offlinePill: document.getElementById('offlinePill'),
      soundBtn: document.getElementById('soundBtn'),
      soundIco: document.getElementById('soundIco'),
      settingsTabDot: document.getElementById('settingsTabDot'),
      installBtn: document.getElementById('installBtn'),
      huntTabDot: document.getElementById('huntTabDot'),
      gearTabDot: document.getElementById('gearTabDot'),
      landTabDot: document.getElementById('landTabDot'),
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
      // v4.7: 다섯 번째 슬롯은 상위 전직 궁극기
      if (b.dataset.skill === 'ultimate') this.app.actions.castUltimate();
      else this.app.actions.castSkill(b.dataset.skill);
    });

    this.el.bossBtn.addEventListener('click', () => this.app.actions.challengeBoss());

    if (this.el.soundBtn) {
      this.el.soundBtn.addEventListener('click', () => this.app.actions.toggleSound());
    }
    this.syncSound();
    this.syncCloud();

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
      case 'toggle-shake': actions.toggleShake(); break;
      case 'toggle-dmg-numbers': actions.toggleDmgNumbers(); break;
      case 'reset-dps-meter': actions.resetDpsMeter(); break;
      case 'guide-jump': {
        const [tTab, tSub] = String(v || '').split(':');
        if (tTab === 'hunt') this.huntSub = ['battle', 'challenge', 'mission'].includes(tSub) ? tSub : 'battle';
        if (tTab === 'gear') this.gearSub = ['equip', 'job', 'collect'].includes(tSub) ? tSub : 'equip';
        if (tTab === 'land' && tSub) this.s.land.sub = tSub === 'buff' ? 'event' : tSub;
        if (tTab) this.setTab(tTab);
        break;
      }
      case 'toggle-sound': actions.toggleSound(); break;
      case 'gacha': actions.pullGacha(Number(v) || 1); break;
      case 'gacha-cur': actions.gachaCur(v); break;
      case 'cast': actions.castSkill(v); break;
      case 'upgrade-skill': actions.upgradeSkill(v); break;
      case 'skill-rune': actions.setSkillRune(btn.dataset.skill, v); break;
      case 'enhance': actions.enhance(btn.dataset.slot, 1); break;
      case 'enhance5': actions.enhance(btn.dataset.slot, 5); break;
      case 'enhance10': actions.enhance(btn.dataset.slot, 10); break;
      case 'enhancemax': actions.enhance(btn.dataset.slot, 'max'); break;
      case 'buy-shards': actions.buyShards(v); break;
      case 'hunt-sub': this.setHuntSub(v); break;
      case 'growth-filter': this.setGrowthFilter(v); break;
      case 'gear-sub': this.setGearSub(v); break;
      case 'gear-filter': this.setGearFilter(v); break;
      case 'gear-set-filter': this.setGearSetFilter(v); break;
      case 'gear-item': actions.openGearItem(Number(v)); break;
      case 'gear-result-item': actions.openGearByItemId(v); break;
      case 'gear-equip': actions.equipGearItem(Number(v)); break;
      case 'gear-dismantle': actions.dismantleGearItem(Number(v)); break;
      case 'gear-bulk': actions.bulkDismantleGear(v); break;
      case 'gear-auto': actions.setGearAuto(v); break;
      case 'gear-preset-apply': actions.applyGearPreset(Number(v)); break;
      case 'gear-preset-save': actions.saveGearPreset(Number(v)); break;
      case 'gear-recommend': actions.applyRecommendedGear(v); break;
      case 'gear-awaken': actions.awakenGear(btn.dataset.slot || v); break;
      case 'gem-slot': this.gemSlot = EQUIP_SLOTS.includes(v) ? v : 'weapon'; this.render(); break;
      case 'gem-cut': actions.cutGem(v); break;
      case 'gem-merge': actions.mergeGem(btn.dataset.gem, Number(v) || 1); break;
      case 'gem-socket': actions.socketGem(this.gemSlot || 'weapon', btn.dataset.gem, Number(v) || 1); break;
      case 'gem-unsocket': actions.unsocketGem(v); break;
      case 'theme-craft': actions.craftThemeGear(btn.dataset.set, v); break;
      case 'cast-ult': actions.castUltimate(); break;
      case 'toggle-auto-skill': actions.toggleAutoSkill(); break;
      case 'toggle-auto-ult': actions.toggleAutoUlt(); break;
      case 'open-log': this.showLog(); break;
      case 'open-pets': this.gearSub = 'collect'; this.setTab('gear'); break;
      case 'land-sub': this.setLandSub(v); break;
      case 'toggle-fold': this.toggleFold(v); break;
      case 'land-hold-all': this.landHoldAll = !this.landHoldAll; this.render(); break;
      case 'landmark': actions.openLandmark(v); break;
      case 'land-trade': actions.landTrade(v, btn.dataset.side); break;
      case 'land-more': actions.landMore(); break;
      case 'land-sort': actions.landSort(v); break;
      case 'land-tier': actions.landTier(v); break;
      case 'land-fav': actions.landFav(v); break;
      case 'land-order-open': actions.openLimitOrder(v, btn.dataset.side || 'buy'); break;
      case 'land-order-cancel': actions.cancelLimitOrder(v); break;
      case 'land-auto-invest': actions.openAutoInvest(v); break;
      case 'land-bulk-lm': actions.openBulkLandmarks(); break;
      case 'land-map-region': actions.landMapRegion(v); break;
      case 'land-region-clear': actions.landRegionClear(); break;
      case 'exp-pick-pet': this.expPick.petId = v; this.render(); break;
      case 'exp-pick-region': this.expPick.setId = v; this.render(); break;
      case 'exp-pick-dur': this.expPick.durKey = v; this.render(); break;
      case 'exp-start': actions.expStart(this.expPick.petId, this.expPick.setId, this.expPick.durKey); break;
      case 'exp-claim': actions.expClaim(v); break;
      case 'exp-claim-all': actions.expClaimAll(); break;
      case 'exp-cancel': actions.expCancel(v); break;
      case 'citadel-up': actions.upgradeCitadel(v); break;
      case 'bank-open': actions.bankOpen(v); break;
      case 'bank-claim': actions.bankClaim(v); break;
      case 'bank-cancel': actions.bankCancel(v); break;
      case 'mega-build': actions.megaBuild(v); break;
      case 'toggle-auto-rent': actions.toggleAutoRent(); break;
      case 'claim-rent': actions.claimRent(); break;
      case 'rent-info': actions.rentInfo(); break;
      case 'auction-bid': actions.auctionBid(); break;
      case 'auction-info': actions.auctionInfo(); break;
      case 'save-export': actions.saveExport(); break;
      case 'save-import': actions.saveImport(); break;
      case 'save-undo': actions.saveUndo(); break;
      case 'promote': actions.promoteJob(); break;
      case 'rebirth': actions.rebirth(); break;
      case 'rebirth-start': actions.pickRebirthStart(v); break;
      case 'rebirth-traits': actions.openRebirthTraits(); break;
      case 'rebirth-trait': actions.upgradeRebirthTrait(v); break;
      case 'relic-summon': actions.summonRelic(v); break;
      case 'relic-equip': actions.equipRelic(v); break;
      case 'relic-upgrade': actions.upgradeRelic(v); break;
      case 'pet-equip': actions.equipPet(v); break;
      case 'pet-sub': actions.equipSubPet(v); break;
      case 'pet-upgrade': actions.upgradePet(v); break;
      case 'pet-evolve': actions.evolvePet(v); break;
      case 'cycle-speed': actions.cycleSpeed(); break;
      case 'dungeon': actions.enterDungeon(v); break;
      case 'tower': actions.enterTower(Number(v) || 0); break;
      case 'tower-floors': actions.openTowerFloors(); break;
      case 'tower-sweep': actions.claimTowerSweep(); break;
      case 'daily': actions.enterDaily(); break;
      case 'invasion': actions.enterInvasion(); break;
      case 'rift-start': actions.enterRift(); break;
      case 'rift-pick-open': actions.openRiftPick(); break;
      case 'rift-pick': actions.pickRiftCard(v); break;
      case 'rift-retreat': actions.retreatRift(); break;
      case 'knight-up': actions.upgradeKnight(v); break;
      case 'raid-attack': actions.attackRaid(); break;
      case 'raid-claim': actions.claimRaidPhase(Number(v)); break;
      case 'open-todo': actions.openTodoHub(); break;
      case 'todo-claim-all': actions.claimAllTodo(); break;
      case 'claim-attendance': actions.claimAttendance(); break;
      case 'claim-weekly-milestone': actions.claimWeeklyMilestone(Number(v)); break;
      case 'claim-quest': actions.claimQuest(v); break;
      case 'claim-daily-quest': actions.claimDailyQuest(v); break;
      case 'claim-daily-quest-bonus': actions.claimDailyQuestBonus(); break;
      case 'claim-achievement': actions.claimAchievement(v); break;
      case 'pass-claim': actions.claimPass(Number(v)); break;
      case 'pass-claim-all': actions.claimAllPass(); break;
      case 'title-equip': actions.equipTitle(v); break;
      case 'open-codex': actions.openCodex(v || 'monster'); break;
      case 'open-achievements': actions.openAchievements(); break;
      case 'reset': actions.resetGame(); break;
      case 'install': actions.install(); break;
      /* ── v4.8 ☁️ 클라우드 세이브 · 🏆 랭킹 ── */
      case 'cloud-signin': actions.cloudSignIn(); break;
      case 'cloud-signout': actions.cloudSignOut(); break;
      case 'cloud-save': actions.cloudSaveNow(); break;
      case 'cloud-load': actions.cloudLoadNow(); break;
      case 'cloud-auto': actions.cloudToggleAuto(); break;
      case 'cloud-nick': actions.cloudNickSave(); break;
      case 'cloud-rank': actions.cloudRank(v || 'stage'); break;
      case 'cloud-compare': actions.cloudCompare(); break;
      case 'cloud-rank-refresh': actions.cloudRankRefresh(); break;
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

  /** 사냥 탭 서브 탭 전환 — 저장 데이터는 건드리지 않고 세션에서만 기억한다 */
  setHuntSub(sub) {
    const ok = HUNT_SUBS.map(([k]) => k);
    this.huntSub = ok.includes(sub) ? sub : 'battle';
    this.el.panel.scrollTop = 0;
    this.render();
  }

  /** 장비 인벤토리 필터(전체/무기/갑옷/투구/반지/아뮬렛) — 세션 UI 상태 */
  setGearFilter(f) {
    if (!this.s.gear) return;
    this.s.gear.filter = GEAR_FILTERS.includes(f) ? f : 'all';
    this.render();
  }

  /** v5.5 장비 인벤토리 테마 세트 필터 */
  setGearSetFilter(f) {
    if (!this.s.gear) return;
    this.s.gear.setFilter = GEAR_SET_FILTERS.includes(f) ? f : 'all';
    this.render();
  }

  /** v5.5 장비 탭 서브 탭 전환 */
  setGearSub(sub) {
    const ok = GEAR_SUBS.map(([k]) => k);
    this.gearSub = ok.includes(sub) ? sub : 'equip';
    this.el.panel.scrollTop = 0;
    this.render();
  }

  /** v5.5 전직·환생 탭 영역 필터(전체 / 도전 / 성장) */
  setGrowthFilter(f) {
    this.growthFilter = ['all', 'challenge', 'growth'].includes(f) ? f : 'all';
    this.render();
  }

  /** v5.5 장비 탭 서브 배지 · 하단 장비 탭 알림 점 동기화 */
  syncGearBadges() {
    let b;
    try {
      b = gearBadges(this);
    } catch (e) {
      return;
    }
    document.querySelectorAll('[data-gbadge]').forEach((el) => {
      const v = b[el.dataset.gbadge] || 0;
      el.classList.toggle('on', v > 0);
      const txt = v > 9 ? '9+' : String(v || '');
      if (el.textContent !== txt) el.textContent = txt;
    });
    if (this.el.gearTabDot) {
      this.el.gearTabDot.classList.toggle('hidden', !(b.enhance + b.bag));
    }
  }

  /** 서브 탭 배지·하단 사냥 탭 알림 점을 현재 상태로 맞춘다 */
  syncHuntBadges() {
    let b;
    try {
      b = huntBadges(this);
    } catch (e) {
      return;
    }
    document.querySelectorAll('[data-badge]').forEach((el) => {
      const v = b[el.dataset.badge] || 0;
      el.classList.toggle('on', v > 0);
      const txt = v > 9 ? '9+' : String(v || '');
      if (el.textContent !== txt) el.textContent = txt;
    });
    if (this.el.huntTabDot) {
      this.el.huntTabDot.classList.toggle('hidden', !(b.skill + b.growth + b.quest));
    }
  }

  /** 부동산 서브 탭 배지·하단 부동산 탭 점 — 받을 임대수익·진화 가능한 펜 */
  syncLandBadges() {
    let b;
    try {
      b = landBadges(this);
    } catch (e) {
      return;
    }
    document.querySelectorAll('[data-lbadge]').forEach((el) => {
      const v = b[el.dataset.lbadge] || 0;
      el.classList.toggle('on', v > 0);
      const txt = v > 9 ? '9+' : String(v || '');
      if (el.textContent !== txt) el.textContent = txt;
    });
    if (this.el.landTabDot) {
      this.el.landTabDot.classList.toggle('hidden', !(b.home + b.buff));
    }
  }

  setLandSub(sub) {
    const ok = LAND_SUBS.map(([k]) => k);
    const want = sub === 'buff' ? 'event' : sub; // v7.x 저장/딥링크 호환
    this.s.land.sub = ok.includes(want) ? want : 'home';
    this.s.land.page = 1;
    this.el.panel.scrollTop = 0;
    this.render();
  }

  /** v8.0.0 카드 접힘/펼침 — 세션 상태만 바꾸고 DOM 만 토글(스크롤·입력 유지) */
  toggleFold(id) {
    if (!id) return;
    const open = !this.collapsed.has(id);
    if (open) this.collapsed.add(id); else this.collapsed.delete(id);
    const body = document.getElementById(`fold-${id}`);
    if (body) body.classList.toggle('hidden', !open);
    document.querySelectorAll(`[data-action="toggle-fold"][data-value="${id}"]`).forEach((h) => {
      h.setAttribute('aria-expanded', open ? 'true' : 'false');
      const cv = h.querySelector('.cv');
      if (cv) cv.textContent = open ? '▾' : '▸';
    });
    return open;
  }

  /** v6.5.0 전투 캔버스 상단 실시간 버프 HUD 바 갱신 */
  refreshBuffBar(now) {
    const bar = this.el.battleBuffBar;
    if (!bar) return;
    const pills = activeBuffPills(this.battle, now);
    const html = pills.map((p) => `<span class="sb-pill ${p.cls}">${p.icon} ${esc(p.label)}</span>`).join('');
    if (html === this._lastBuffHtml) return;
    this._lastBuffHtml = html;
    bar.innerHTML = html;
    bar.classList.toggle('hidden', pills.length === 0);
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

    setT(this.el.gold, compact(s.gold));
    setT(this.el.shard, compact(s.shards));

    const def = b.def;
    // v4.2: 탑 도전 중에는 스테이지 칩 대신 층 이름을 보여 준다 · v5.11 영지 방어전
    if (b.rift) {
      const left = (Math.max(0, b.rift.ends - now) / 1000).toFixed(1);
      setT(this.el.stageNum, `🌀 균열 W${b.rift.wave}${b.rift.isBossWave ? ' 👑' : ''}`);
      setT(this.el.themeName, b.rift.picking ? '🃏 축복 카드 선택 대기' : `${b.rift.waveKills}/${b.rift.waveGoal} · ${left}초`);
    } else if (b.invasion && b.invasion.city) {
      const done = b.invasion.kills + b.invasion.bossKills;
      const left = (Math.max(0, b.invasion.ends - now) / 1000).toFixed(1);
      setT(this.el.stageNum, `🚨 ${b.invasion.city.name} 방어전`);
      setT(this.el.themeName, `${done}/${b.invasion.goal} · ${left}초`);
    } else if (b.tower && b.tower.floor) {
      setT(this.el.stageNum, `🗼 탑 ${b.tower.n}층`);
      setT(this.el.themeName, b.tower.floor.name);
    } else {
      setT(this.el.stageNum, `스테이지 ${s.stage}${def.infinite ? ' ∞' : ''}`);
      setT(this.el.themeName, def.themeName);
    }

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

    // 퀵 스킬 쿨타임 (v4.7: 다섯 번째 = 상위 전직 궁극기)
    const ultDef = ultimateOf(s);
    [...this.el.quick.querySelectorAll('.q')].forEach((q) => {
      const key = q.dataset.skill;
      if (key === 'ultimate') {
        q.classList.toggle('hidden', !ultDef);
        if (!ultDef) return;
        const ucd = ultCdOf(s, this.app.buffs);
        const uleft = ultLeftMs(s, this.app.buffs, now);
        q.querySelector('.q-cd').style.height = `${ucd ? Math.min(100, (uleft / ucd) * 100) : 0}%`;
        q.classList.toggle('ready', uleft <= 0);
        const ico = q.querySelector('.q-ico');
        if (ico && ico.textContent !== ultDef.icon) ico.textContent = ultDef.icon;
        q.setAttribute('aria-label', `${ultDef.name} 시전`);
        return;
      }
      const cd = skillCdOf(key, this.app.buffs) || SKILLS[key].cd;
      const sk = s.skills[key];
      const left = Math.max(0, (sk.last + cd) - now);
      const ratio = left / cd;
      q.querySelector('.q-cd').style.height = `${ratio * 100}%`;
      q.classList.toggle('ready', left <= 0);
    });

    // 250ms 마다 패널/헤더 내 숫자 갱신
    if (now - this.lastLive > 250) {
      this.lastLive = now;
      this.refreshHeader();
      this.refreshBuffBar(now);
      this.refreshPanelLive(now);
      // 서브 탭 배지는 조금 느슨하게(0.9초) — 다른 탭에 있어도 보상/성장 알림이 갱신된다
      if (now - (this._badgeAt || 0) > 900) {
        this._badgeAt = now;
        this.syncHuntBadges();
        this.syncGearBadges();
        this.syncLandBadges();
      }
    }
  }

  refreshHeader() {
    const p = portfolioOf(this.s);
    const setT = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
    // v8.0.0 B2 — 상단 HUD 는 축약형(1.84억 / 127만) + 전체 값은 title/aria 로
    const pyeongTxt = compact(p.pyeong);
    const rentTxt = `+${compact(p.incomePerHour)}/h`;
    setT(this.el.asset, pyeongTxt);
    setT(this.el.rentHr, rentTxt);
    if (this.el.assetBadge) {
      const full = `보유 ${fmt(p.pyeong)}평 · 시간당 +${fmt(p.incomePerHour)} 골드 · ${p.cities}곳`;
      if (this.el.assetBadge.getAttribute('title') !== full) this.el.assetBadge.setAttribute('title', full);
      if (this.el.assetBadge.getAttribute('aria-label') !== full) this.el.assetBadge.setAttribute('aria-label', full);
    }
    const goldTxt = compact(this.s.gold);
    const shardTxt = compact(this.s.shards);
    setT(this.el.gold, goldTxt);
    setT(this.el.shard, shardTxt);
    const goldWrap = this.el.gold && this.el.gold.parentElement;
    if (goldWrap) goldWrap.setAttribute('title', `골드 ${fmt(this.s.gold)}`);
    const shardWrap = this.el.shard && this.el.shard.parentElement;
    if (shardWrap) shardWrap.setAttribute('title', `강화석 ${fmt(this.s.shards)}`);
    const on = this.s.soundOn !== false;
    if (this.el.soundIco && this.el.soundIco.textContent !== (on ? '🔊' : '🔇')) this.el.soundIco.textContent = on ? '🔊' : '🔇';
    if (this.el.soundBtn) {
      this.el.soundBtn.classList.toggle('off', !on);
      this.el.soundBtn.setAttribute('aria-label', on ? '효과음 끄기' : '효과음 켜기');
    }
    // v5.5 캔버스 상단 전투 배속 미니 칩 — 환생 1회 해금 이후 어느 탭에서든 원탭 전환
    if (this.el.stageSpeedBtn) {
      const unl = battleSpeedUnlocked(this.s);
      const spd = effectiveBattleSpeed(this.s);
      this.el.stageSpeedBtn.classList.toggle('hidden', !unl);
      this.el.stageSpeedBtn.classList.toggle('on', unl && spd > 1);
      const txt = `⚡×${spd}`;
      if (this.el.stageSpeedBtn.textContent !== txt) this.el.stageSpeedBtn.textContent = txt;
    }
    // v7.0.0 📋 오늘의 할 일 원탭 허브 배지 갱신
    if (this.el.todoBtn) {
      let cnt = 0;
      try {
        cnt = collectTodoSummary(this.s, this.battle && this.battle.stats).totalClaimable;
      } catch (e) { cnt = 0; }
      const show = cnt > 0 && ((this.s && this.s.totalKills > 0) || cnt >= 2);
      this.el.todoBtn.classList.toggle('hidden', !show);
      if (this.el.todoCount) {
        const t = cnt > 9 ? '9+' : String(cnt);
        if (this.el.todoCount.textContent !== t) this.el.todoCount.textContent = t;
      }
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

  syncCloud(hint) {
    const c = this.app && this.app.cloud;
    if (!c) return;
    // 설정 탭 알림 점 — 클라우드를 켜 둔 상태에서 문제가 생겼을 때만
    const on = !!(this.s && this.s.cloud && this.s.cloud.enabled);
    const bad = on && (c.status === 'error' || c.status === 'offline');
    if (this.el.settingsTabDot) this.el.settingsTabDot.classList.toggle('hidden', !bad);
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
    // 🔨 경매 카드용 — 이번 틱에 한 번만 계산해 data-live 여러 요소가 함께 쓴다
    const aucNow = this.tab === 'land' ? auctionStatus(s, now) : null;
    // ⚡ 실시간 DPS(초당 공격력) — 이번 틱에 한 번만 계산
    const dpsNow = this.tab === 'hunt' ? dpsSnapshot(b, now) : null;
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
        if (key === 'ultimate') {
          // v4.7 궁극기 — 해금 전에는 0, 해금 뒤에는 실효 쿨타임 기준
          const ucd = ultCdOf(s, this.app.buffs);
          const uleft = ultLeftMs(s, this.app.buffs, now);
          el.style.width = ucd ? `${Math.min(100, (uleft / ucd) * 100)}%` : '0%';
        } else {
          const cd = skillCdOf(key, this.app.buffs) || SKILLS[key].cd;
          const left = Math.max(0, s.skills[key].last + cd - now);
          el.style.width = `${(left / cd) * 100}%`;
        }
      } else if (k.startsWith('cast-')) {
        const key = k.slice(5);
        if (key === 'ultimate') {
          const uleft = ultLeftMs(s, this.app.buffs, now);
          el.textContent = uleft > 0 ? `${(uleft / 1000).toFixed(1)}초` : '시전';
          el.disabled = uleft > 0;
        } else {
          const cd = skillCdOf(key, this.app.buffs) || SKILLS[key].cd;
          const left = Math.max(0, s.skills[key].last + cd - now);
          el.textContent = left > 0 ? `${(left / 1000).toFixed(1)}초` : '시전';
          el.disabled = left > 0;
        }
      } else if (k === 'dps') {
        const d = dpsNow || dpsSnapshot(b, now);
        el.textContent = fmt(d.base);
      } else if (k === 'live-dps') {
        const d = dpsNow || dpsSnapshot(b, now);
        el.textContent = fmt(d.value);
      } else if (k === 'dps-src') {
        const d = dpsNow || dpsSnapshot(b, now);
        el.textContent = d.src;
      } else if (k === 'dps-buffs') {
        const d = dpsNow || dpsSnapshot(b, now);
        el.textContent = d.buffText;
        el.classList.toggle('hidden', !d.buffText);
      } else if (k === 'dps-hero') {
        const d = dpsNow || dpsSnapshot(b, now);
        el.classList.toggle('boost', d.boost);
      } else if (k === 'dps-meter') {
        if (!this._lastMeterAt || now - this._lastMeterAt >= 450) {
          this._lastMeterAt = now;
          el.innerHTML = dpsMeterInner(b, now);
        }
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
      } else if (k === 'tower-run') {
        const t = b && b.tower;
        const last = s.tower && s.tower.last;
        const bestN = Math.max(0, Math.floor(Number(s.tower && s.tower.best) || 0));
        el.textContent = t
          ? `진행 중 · ${(Math.max(0, t.ends - now) / 1000).toFixed(1)}초`
          : last
            ? (last.how === 'clear' ? `최근 ${last.n}층 클리어` : `최근 ${last.n}층 ${last.how === 'dead' ? '패배' : '시간 초과'}`)
            : bestN > 0 ? `최고 ${bestN}층` : '1층부터 도전';
      } else if (k === 'tower-last') {
        const t = b && b.tower;
        const last = s.tower && s.tower.last;
        el.innerHTML = t
          ? `<b style="color:var(--blue)">진행 중</b> · ${t.n}층 ${esc(t.floor.name)} · ${(Math.max(0, t.ends - now) / 1000).toFixed(1)}초 남음`
          : last
            ? (last.how === 'clear'
              ? `최근 ${last.n}층 클리어 · 💰${fmt(last.gold)} 💎${last.shards}${last.points ? ` ✨${last.points}P` : ''}`
              : `최근 ${last.n}층 ${last.how === 'dead' ? '패배(전투 불능)' : '패배(시간 초과)'} · 언제든 재도전`)
            : '1층부터 차례대로 — 패배해도 잃는 것은 없습니다';
      } else if (k === 'tower-free') {
        el.disabled = !!(b && (b.tower || b.dungeon || b.daily || b.boss || b.invasion));
      } else if (k === 'inv-left') {
        const iv = b && b.invasion;
        const st = invasionStatus(s, now);
        el.textContent = iv ? `방어 중 · ${(Math.max(0, iv.ends - now) / 1000).toFixed(1)}초` : st.available ? '🚨 침공 경보!' : `다음 경보 ${mmss(st.nextMs)}`;
      } else if (k === 'inv-run') {
        const iv = b && b.invasion;
        if (!iv) return;
        el.innerHTML = `<b style="color:var(--gold)">방어 중</b> · ${esc(iv.city.name)} · ${iv.kills + iv.bossKills}/${iv.goal} 격파 · ${(Math.max(0, iv.ends - now) / 1000).toFixed(1)}초 남음`;
      } else if (k === 'daily-free') {
        const di = dailyInfo(s, now);
        el.disabled = !!(b && b.daily) || di.left <= 0;
      } else if (k === 'daily-left') {
        const d = b && b.daily;
        const di = dailyInfo(s, now);
        el.textContent = d ? `진행 중 · ${(Math.max(0, d.ends - now) / 1000).toFixed(1)}초` : `남은 도전 ${di.left}/${DAILY.attempts}`;
      } else if (k === 'daily-run') {
        const d = b && b.daily;
        const di = dailyInfo(s, now);
        const last = di.last;
        el.innerHTML = d
          ? `<b style="color:var(--gold)">진행 중</b> · 누적 피해 ${fmt(d.dmg)} · ${(Math.max(0, d.ends - now) / 1000).toFixed(1)}초 남음`
          : last
            ? `최근 ${esc(dailyGradeText(last.grade, last.ratio))} · 피해 ${fmt(last.dmg)} · 💰${fmt(last.gold)} 💎${fmt(last.shards)}${last.points ? ` ✨${last.points}P` : ''}`
            : `오늘의 보스 · 30초 동안 누적 피해로 등급 보상`;
      } else if (k === 'sweep-state') {
        const sw = towerSweepInfo(s, now);
        el.textContent = sw.available ? '오늘 소탕 가능' : sw.best < 1 ? '최고 층부터 열림' : '오늘 소탕 완료';
      } else if (k === 'sweep-btn') {
        const sw = towerSweepInfo(s, now);
        el.disabled = !sw.available;
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
      } else if (k === 'news-left') {
        const n = activeNews(now);
        el.textContent = n ? mmss(n.endsAt - now) : '—';
      } else if (k === 'news-prog') {
        const n = activeNews(now);
        const span = n ? Math.max(1, n.endsAt - n.startsAt) : 1;
        el.style.width = `${n ? Math.min(100, Math.max(0, ((now - n.startsAt) / span) * 100)) : 0}%`;
      } else if (k === 'news-own') {
        const n = activeNews(now);
        el.textContent = newsOwnShort(s, n);
      } else if (k === 'auc-price') {
        if (!aucNow) return;
        el.textContent = `💰${fmt(aucNow.price)}`;
      } else if (k === 'auc-disc') {
        if (!aucNow) return;
        el.textContent = `시세 -${aucNow.discountPct}%`;
      } else if (k === 'auc-left') {
        if (!aucNow) return;
        el.textContent = mmss(aucNow.phase === 'live' ? aucNow.leftMs : aucNow.nextMs);
      } else if (k === 'auc-prog') {
        if (!aucNow) return;
        el.style.width = `${Math.round(aucNow.progress * 100)}%`;
      } else if (k.startsWith('exp-left-')) {
        const id = k.slice(9);
        const slot = (s.expedition && Array.isArray(s.expedition.active)) ? s.expedition.active.find((x) => x && x.id === id) : null;
        if (!slot) return;
        const left = Math.max(0, slot.endsAt - now);
        el.textContent = left <= 0 ? '탐험 완료!' : hhmmss(left);
      } else if (k.startsWith('exp-prog-')) {
        const id = k.slice(9);
        const slot = (s.expedition && Array.isArray(s.expedition.active)) ? s.expedition.active.find((x) => x && x.id === id) : null;
        if (!slot) return;
        const span = Math.max(1, slot.endsAt - slot.startedAt);
        const ratio = Math.min(100, Math.max(0, ((now - slot.startedAt) / span) * 100));
        el.style.width = `${ratio}%`;
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

    // 🔨 경매 입찰 버튼은 입찰가·골드에 따라 실시간으로 문구/활성화가 바뀐다
    const aucBtn = document.querySelector('[data-live="auc-btn"]');
    if (aucBtn && aucNow) {
      const on = aucNow.canBid && s.gold >= aucNow.price;
      if (aucBtn.disabled === on) aucBtn.disabled = !on;
      const label = on ? `🔨 지금 낙찰 · 💰${fmt(aucNow.price)}` : (aucNow.canBid ? `골드 부족 · 💰${fmt(aucNow.price)}` : '경매 마감');
      if (aucBtn.textContent !== label) aucBtn.textContent = label;
    }

    // 📰 3분마다 호재가 바뀌면 부동산 탭을 다시 그린다(배지·시세·임대수익 갱신)
    if (this.tab === 'land') {
      const news = activeNews(now);
      if (news && this._newsKey !== news.key) {
        const had = this._newsKey !== undefined;
        this._newsKey = news.key;
        if (had) this.render();
      }
      // 🔨 경매 시간이 열리거나 닫히면 카드를 다시 그린다(버튼·매물 교체)
      const aucKey = `${aucNow.block}:${aucNow.phase}`;
      if (this._aucKey !== aucKey) {
        const hadAuc = this._aucKey !== undefined;
        this._aucKey = aucKey;
        if (hadAuc) this.render();
      }
    }
  }

  /* ───────────── 토스트 / 모달 ───────────── */
  /** 스크린리더 알림 — 캔버스로만 그리는 연출(보스 등장·부활)을 함께 전한다 */
  announce(text) {
    const el = this.el.srLive;
    if (!el || !text) return;
    el.textContent = '';
    clearTimeout(this._srTimer);
    this._srTimer = setTimeout(() => { el.textContent = text; }, 40);
  }

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

  /** 📜 전투 기록 — 사냥 화면 공간을 아끼려고 모달로 띄운다 */
  showLog() {
    const rows = this.logs.length
      ? this.logs
          .slice(0, 20)
          .map((l) => `<div class="log-item"><span class="t">${l.t}</span><span>${l.text}</span></div>`)
          .join('')
      : '<div class="log-item"><span class="t">—</span><span class="dim">아직 기록이 없습니다.</span></div>';
    this.modal({
      title: '📜 전투 기록',
      sub: '최근 20건 · 사냥 중에도 계속 쌓입니다',
      body: `<div class="log-list tall" id="logList">${rows}</div>`,
      actions: [{ label: '닫기', style: 'primary', onClick: () => {} }],
    });
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
    const keep = active && (active.id === 'landSearch' || active.id === 'cloudNick')
      ? { id: active.id, value: active.value, pos: active.selectionStart }
      : null;
    this.el.panelInner.innerHTML = this.template();
    this.applyFolds();
    this.el.panel.scrollTop = scroll;
    if (keep) {
      const n = document.getElementById(keep.id);
      if (n) {
        n.value = keep.value;
        n.focus();
        try { n.setSelectionRange(keep.pos, keep.pos); } catch (e) { /* ignore */ }
      }
    }
    this.lastLive = 0;
    this.refreshHeader();
  }

  /** data-fold 가 붙은 카드에 ▸ 토글을 달고 본문을 접을 수 있게 감싼다 (v8.0.0) */
  applyFolds() {
    const collapsed = (this.collapsed = this.collapsed || new Set(DEFAULT_COLLAPSED));
    this.el.panelInner.querySelectorAll('.card[data-fold]').forEach((card) => {
      const id = card.dataset.fold;
      if (!id || card.dataset.foldDone === '1') return;
      const head = card.querySelector('.card-head');
      if (!head) return;
      card.dataset.foldDone = '1';
      const open = !collapsed.has(id);
      head.classList.add('fold-head');
      head.dataset.action = 'toggle-fold';
      head.dataset.value = id;
      head.setAttribute('role', 'button');
      head.setAttribute('tabindex', '0');
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      head.setAttribute('aria-controls', `fold-${id}`);
      head.insertAdjacentHTML('beforeend', `<i class="cv">${open ? '▾' : '▸'}</i>`);
      const body = document.createElement('div');
      body.className = `card-body${open ? '' : ' hidden'}`;
      body.id = `fold-${id}`;
      while (head.nextSibling) body.appendChild(head.nextSibling);
      card.appendChild(body);
    });
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
    if (c) c.textContent = `${built.total}개 지역 · ${built.shown}개 표시 · 가격은 실시간 변동(±30% 일일 밴드) + 호재 보정`;
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
  // v4.4: 5·6단계 상위 전직 — 카드 테두리·배지를 칭호 색으로 강조
  const curTop = isUpperJob(cur.tier);
  const step = `${cur.tier + 1}/${JOB_COUNT}`;

  if (!n) {
    return `
  <div class="card job-card done${curTop ? ' top' : ''}" style="--jc:${cur.color}">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">${cur.badge}</span>${esc(cur.name)}<small>최종 전직 · ${step}</small></div>
      <span class="job-badge${curTop ? ' hi' : ''}" style="--jc:${cur.color}">${jobBonusText(cur)}</span>
    </div>
    <div class="tiny muted" style="margin-top:2px">전직 완료 — 영구 <b>공격 +${cur.atkPct}% · 체력 +${cur.hpPct}%</b> 적용 중</div>
    ${ultimateOf(s) ? `<div class="tiny" style="margin-top:3px;color:${ultimateOf(s).color}">${ultimateOf(s).icon} 궁극기 <b>${esc(ultimateOf(s).name)}</b> 사용 가능 · 사냥 탭에서 시전</div>` : ''}
  </div>`;
  }

  const nextTop = isUpperJob(n.tier);
  return `
  <div class="card job-card ${pr.canPromote ? 'ready' : ''}${curTop ? ' top' : ''}" style="--jc:${cur.color}">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">${cur.badge}</span>${esc(cur.name)}<small>전직 ${step}${nextTop ? ' · 상위 전직' : ''}</small></div>
      <span class="job-badge${curTop ? ' hi' : ''}" style="--jc:${cur.color}">${jobBonusText(cur)}</span>
    </div>
    <div class="row tiny" style="margin-top:3px;gap:6px">
      <span class="ellip muted">다음 <b style="color:${n.color}">${n.badge} ${esc(n.name)}</b> <span class="dim">${jobBonusText(n)}</span></span>
      <span style="flex:0 0 auto;color:var(--sub)"><span style="color:${pr.levelOk ? 'var(--green)' : 'var(--sub)'}">Lv.${s.level}${pr.levelOk ? '' : `/${n.lv}`}</span> · <span style="color:${pr.stageOk ? 'var(--green)' : 'var(--sub)'}">S${s.maxStage}${pr.stageOk ? '' : `/${n.stage}`}</span></span>
    </div>
    <div class="prog" style="margin-top:4px"><i style="width:${Math.min(pr.pctLv, pr.pctStage) * 100}%"></i></div>
    ${pr.canPromote
      ? `<button class="btn primary block promote-btn${nextTop ? ' upper' : ''}" data-action="promote" style="margin-top:7px;min-height:34px" data-live="promote">✨ 전직 가능! ${n.badge} ${esc(n.name)}</button>`
      : `<div class="tiny dim ellip" style="margin-top:5px">${esc(pr.reason)}${nextTop && (pr.lvLeft > 0 || pr.stageLeft > 0) ? ` · 남은 ${pr.lvLeft > 0 ? pr.lvLeft + '레벨' : ''}${pr.lvLeft > 0 && pr.stageLeft > 0 ? ' · ' : ''}${pr.stageLeft > 0 ? pr.stageLeft + '스테이지' : ''}` : ''}</div>`}
    ${!ultimateOf(s) && n.tier >= ULT_MIN_TIER ? `<div class="tiny" style="margin-top:3px;color:var(--gold)">🐉 이 전직을 마치면 <b>궁극기 ${esc(ULTIMATES[0].name)}</b> 해금</div>` : ''}
  </div>`;
}

/* ══════════════════════════ ♾️ 환생(초월) · 영구 특성 (v3.5) ══════════════════════════ */
function rebirthCard(ui) {
  const s = ui.s;
  const st = rebirthStatus(s);
  const b = rebirthBonus(s);
  const totalLv = b.totalLv;
  const maxLv = REBIRTH_TRAITS.reduce((a, t) => a + t.maxLv, 0);
  return `
  <div class="card rebirth-card ${st.can ? 'ready' : ''}">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">♾️</span>환생 (초월)<small>${st.count > 0 ? `${st.count}회차` : `S${st.need} 해금`}</small></div>
      <span class="rb-points" data-live="rb-points">초월석 <b>${fmt(st.points)}</b>P</span>
    </div>
    <div class="row tiny" style="margin-top:1px">
      <span style="color:${st.can ? 'var(--gold)' : 'var(--sub)'}">이번 회차 최고 <b>S${st.stage}</b> / S${st.need}</span>
      <span class="dim">환생 시 <b style="color:var(--gold)">+${st.gain}P</b></span>
    </div>
    <div class="prog${st.can ? ' gold' : ''}" style="margin-top:4px"><i style="width:${st.pct * 100}%"></i></div>
    <div class="row gap6" style="margin-top:7px">
      <button class="btn small ${st.can ? 'primary' : 'ghost'} wide" type="button" data-action="rebirth" style="min-height:34px" ${st.can ? '' : 'disabled'}>
        ♾️ ${st.can ? `환생하기 · +${st.gain}P` : '환생 · 조건 미달'}
      </button>
      <button class="btn small ghost wide" type="button" data-action="rebirth-traits" style="min-height:34px">✨ 영구 특성 <b style="color:var(--gold)">${totalLv}/${maxLv}</b></button>
    </div>
    <div class="tiny ellip" style="margin-top:5px;color:${totalLv ? 'var(--blue)' : 'var(--dim)'}">${totalLv ? `초월 특성 — ${traitSummary(s)}` : `사냥만 초기화 · 부동산·펫·장비·업적은 유지 (특성 0/${maxLv})`}</div>
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
      <div class="card-title"><span class="t-ico">🔥</span>황금 던전<small>보스 러시 30초 · 골드·강화석</small></div>
      <span class="tiny" style="color:var(--gold)" data-live="dungeon-cd">${ds.ready ? '무료 입장 가능' : `무료까지 ${mmss(ds.leftMs)}`}</span>
    </div>
    <div class="row gap6" style="margin-top:1px">
      <button class="btn small ${ds.ready ? 'primary' : 'ghost'} wide" data-action="dungeon" data-value="free" data-live="dungeon-free" style="min-height:34px" ${ds.ready && !d ? '' : 'disabled'}>🔥 무료 입장</button>
      <button class="btn small blue wide" data-action="dungeon" data-value="shards" style="min-height:34px" ${!d && ds.canPay ? '' : 'disabled'}>💎${DUNGEON.shardCost} 즉시 입장</button>
    </div>
    <div class="tiny dim ellip" style="margin-top:5px" data-live="dungeon-run">${
      d
        ? `<b style="color:var(--gold)">진행 중</b> · 남은 ${(Math.max(0, d.ends - now) / 1000).toFixed(1)}초 · 처치 ${d.kills + d.bossKills}`
        : last
          ? `최근 보상 💰${fmt(last.gold)} · 💎${last.shards} · 최고 피해 ${fmt(s.dungeon.best)}`
          : '쿨타임 10분 · 최고 피해 기록 없음'
    }</div>
  </div>`;
}

/* ══════════════════════════ 🗼 도전의 탑 (v4.2) ══════════════════════════
 * 층 타일 10개로 진행도를 한눈에 보여 주고, 바로 다음 층 도전 / 층 선택 모달로 이어진다.
 */
function towerCard(ui) {
  const s = ui.s;
  const b = ui.battle;
  const now = Date.now();
  const tp = towerProgress(s);
  const running = b && b.tower;
  const last = s.tower && s.tower.last;
  const entryN = running ? running.n : (tp.next || tp.max);
  const def = towerFloor(entryN);
  const deep = tp.best > TOWER_FIXED_FLOOR;
  const sw = towerSweepInfo(s, now);
  const tiles = TOWER_FLOORS.map((f) => {
    const cleared = tp.cleared.includes(f.n);
    const open = cleared || f.n === 1 || tp.cleared.includes(f.n - 1);
    const cls = cleared ? 'done' : open ? 'open' : 'lock';
    const g = towerGimmicks(f);
    return `<i class="tf ${cls}${running && running.n === f.n ? ' now' : ''}" title="${f.n}층 ${esc(f.name)} · ${esc(towerGimmickText(f))}">${cleared ? '✓' : f.n}${g.length ? `<em>${g[0].icon}</em>` : ''}</i>`;
  }).join('');
  const lastLine = running
    ? `<b style="color:var(--blue)">진행 중</b> · ${running.n}층 ${esc(running.floor.name)} · ${(Math.max(0, running.ends - now) / 1000).toFixed(1)}초 남음`
    : last
      ? (last.how === 'clear'
        ? `최근 ${last.n}층 클리어 · 💰${fmt(last.gold)} 💎${last.shards}${last.points ? ` ✨${last.points}P` : ''}`
        : `최근 ${last.n}층 ${last.how === 'dead' ? '패배(전투 불능)' : '패배(시간 초과)'} · 언제든 재도전`)
      : '1층부터 차례대로 — 패배해도 잃는 것은 없습니다';
  const canEnter = entryN > 0 && towerUnlocked(s, entryN);
  const lockWhy = canEnter ? '' : (entryN > 0 ? towerLockReason(s, entryN) : '');
  return `
  <div class="card tower-card${tp.allCleared ? ' done' : ''}">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🗼</span>도전의 탑<small>최고 ${tp.best}층 · ♾️ ${tp.max}층까지</small></div>
      <span class="tiny" style="color:var(--blue)" data-live="tower-run">${running ? `진행 중 · ${(Math.max(0, running.ends - now) / 1000).toFixed(1)}초` : last ? (last.how === 'clear' ? `최근 ${last.n}층 클리어` : `최근 ${last.n}층 ${last.how === 'dead' ? '패배' : '시간 초과'}`) : tp.best > 0 ? `최고 ${tp.best}층` : '1층부터 도전'}</span>
    </div>
    <div class="tower-tiles">${tiles}</div>
    <div class="tower-deep${deep ? ' on' : ''}">
      <span>♾️ 심층</span>
      <b>${deep ? `최고 ${tp.best}층` : '11층부터 무한'}</b>
      <span class="dim">${tp.next ? `다음 ${tp.next}층` : '모든 층 클리어'}</span>
      <button class="mini sweep" type="button" data-action="tower-sweep" data-live="sweep-btn" ${sw.available ? '' : 'disabled'}>🧹 ${sw.available ? '일일 소탕' : '소탕 완료'}</button>
    </div>
    ${def ? `
    <div class="tower-next">
      <b>${def.n}층 ${esc(def.name)}</b>
      <span class="dim">${esc(towerGoalText(def))}</span>
    </div>
    <div class="tiny ellip" style="color:var(--blue)">${esc(towerGimmickText(def))}</div>
    <div class="tiny dim ellip" style="margin-top:2px">최초 클리어 ${towerRewardText(s, def.n)}${def.deep ? ' · 심층(보상 증가)' : ''}</div>` : `<div class="tiny" style="color:var(--gold)">🗼 모든 층 클리어! 재도전·일일 소탕으로 골드·강화석을 계속 모을 수 있습니다.</div>`}
    <div class="row gap6" style="margin-top:7px">
      <button class="btn small ${running || !canEnter ? 'ghost' : 'blue'} wide" type="button" data-action="tower" data-value="${entryN}" data-live="tower-free" style="min-height:34px" ${running || !canEnter ? 'disabled' : ''}>${running ? '🗼 도전 중' : !canEnter ? `🔒 ${esc(lockWhy)}` : `🗼 ${entryN}층 도전`}</button>
      <button class="btn small ghost wide" type="button" data-action="tower-floors" style="min-height:34px">층 선택 ▸</button>
    </div>
    <div class="tiny dim ellip" style="margin-top:5px" data-live="tower-last">${lastLine}</div>
    <div class="tiny ellip" style="margin-top:2px" data-live="sweep-state">${sw.available ? `🧹 일일 소탕 가능 — ${esc(towerSweepText(s))}` : sw.best < 1 ? '🧹 일일 소탕 — 최고 층을 클리어하면 열립니다' : '🧹 오늘 소탕 완료 · 내일 00:00(KST)에 다시'}</div>
  </div>`;
}

/* ══════════════════════════ 🌟 일일 보스 (v4.5) ══════════════════════════
 * 30초 타임어택 · 하루 2회. 누적 피해로 S~D 등급 → 골드·강화석·초월석.
 */
function dailyBossCard(ui) {
  const s = ui.s;
  const b = ui.battle;
  const now = Date.now();
  const di = dailyInfo(s, now);
  const d = b && b.daily;
  const last = di.last;
  const boss = di.boss;
  const best = di.best > 0 ? `${di.grade.icon} ${di.bestGrade} · ${fmt(di.best)} 피해` : '기록 없음';
  return `
  <div class="card daily-card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🌟</span>일일 보스<small>30초 타임어택 · 하루 ${DAILY.attempts}회</small></div>
      <span class="tiny" style="color:var(--gold)" data-live="daily-left">${d ? `진행 중 · ${(Math.max(0, d.ends - now) / 1000).toFixed(1)}초` : `남은 도전 ${di.left}/${DAILY.attempts}`}</span>
    </div>
    <div class="daily-head">
      <span class="daily-boss">${esc(boss.ko)}</span>
      <span class="tiny dim ellip">${esc(boss.title)} · 등급 S~D 보상</span>
    </div>
    <div class="row gap6" style="margin-top:5px">
      <button class="btn small ${di.left > 0 && !d ? 'primary' : 'ghost'} wide" type="button" data-action="daily" data-live="daily-free" style="min-height:34px" ${d || di.left <= 0 ? 'disabled' : ''}>${d ? '🌟 도전 중' : di.left > 0 ? `🌟 도전 (${di.left}회 남음)` : '오늘 도전 완료'}</button>
    </div>
    <div class="tiny ellip" style="margin-top:5px" data-live="daily-run">${
      d
        ? `<b style="color:var(--gold)">진행 중</b> · 누적 피해 ${fmt(d.dmg)} · ${(Math.max(0, d.ends - now) / 1000).toFixed(1)}초 남음`
        : last
          ? `최근 ${esc(dailyGradeText(last.grade, last.ratio))} · 피해 ${fmt(last.dmg)} · 💰${fmt(last.gold)} 💎${fmt(last.shards)}${last.points ? ` ✨${last.points}P` : ''}`
          : '30초 동안 누적 피해로 등급 보상 — 패배해도 받은 피해만큼 지급'
    }</div>
    <div class="tiny dim ellip" style="margin-top:2px">${di.best > 0 ? `최고 ${esc(best)}` : '최고 기록 없음'} · 매일 00:00(KST) 횟수 리셋</div>
    ${weeklyBossBox(s, now)}
  </div>`;
}

/** 🌟 v5.4.0 주간 보스 챌린지(KST 월~일 누적 마일스톤) */
function weeklyBossBox(s, now) {
  const wb = weeklyBossInfo(s, now);
  const daysLeft = Math.floor(wb.resetMs / 86400000);
  const hrsLeft = Math.floor((wb.resetMs % 86400000) / 3600000);
  const score = Math.round(wb.totalRatio * 100);
  const maxScore = Math.round(wb.maxGoal * 100);
  const pills = wb.milestones.map((m) => {
    const rw = m.rarity === 'legend'
      ? `👑전설 · 💎${m.shards} · ✨${m.points}P`
      : `💰${formatGold(m.gold)} · 💎${m.shards} · ✨${m.points}P`;
    const cls = m.claimed ? 'done' : m.claimable ? 'ready' : '';
    const act = m.claimable ? ` data-action="claim-weekly-milestone" data-value="${m.idx}"` : ' disabled';
    return `<button class="wb-ms ${cls}" type="button"${act}>
      <span class="wb-t"><b>${m.label}</b><small>${Math.round(m.goal * 100)}점</small></span>
      <span class="wb-r">${m.claimed ? '수령 완료 ✓' : m.claimable ? `🎁 받기 (${rw})` : rw}</span>
    </button>`;
  }).join('');
  return `
  <div class="wb-box${wb.readyCount ? ' ready' : ''}">
    <div class="wb-head">
      <span>🏆 주간 보스 챌린지 <small>${score}/${maxScore}점 (${wb.runs}회)</small></span>
      <small class="dim">${daysLeft}일 ${hrsLeft}시간 후 리셋</small>
    </div>
    <div class="prog tiny-prog${wb.readyCount ? ' gold' : ''}" style="margin:5px 0 6px"><i style="width:${wb.pct * 100}%"></i></div>
    <div class="wb-grid">${pills}</div>
  </div>`;
}

function petCard(ui) {
  const s = ui.s;
  const ps = s.pet || { equipped: null, sub: null, unlocked: [] };
  const unlockedIds = Array.isArray(ps.unlocked) ? ps.unlocked : [];
  const equipped = petDef(ps.equipped);
  const subUnlocked = subPetUnlocked(s);
  const subDef = subPet(s);

  const rows = PETS.map((def) => {
    const unlocked = unlockedIds.includes(def.id);
    const on = ps.equipped === def.id;
    const isSub = !!(subDef && subDef.id === def.id);
    const onExp = unlocked && isPetDispatched(s, def.id);
    const pr = petProgress(s, def.id);
    const lv = petLevel(s, def.id);
    const cost = petUpgradeCost(lv);
    const maxed = lv >= PET_MAX_LV;
    // v4.2: 진화 단계·고유 스킬
    const info = petStageInfo(s, def.id);
    const stage = info.stage || 0;
    const evo = petEvolveInfo(s, def.id);
    const skill = petSkillOf(s, def.id);
    const badge = stage >= 2 ? '★★' : stage >= 1 ? '★' : '';
    const evolveBtn = !unlocked
      ? ''
      : evo.max
        ? '<button class="mini evo max" type="button" disabled>신수</button>'
        : `<button class="mini evo ${evo.can ? 'ready' : ''}" type="button" data-action="pet-evolve" data-value="${def.id}" ${evo.can ? '' : 'disabled'}>${evo.next.badge}진화</button>`;
    const subBtn = !unlocked || on || !subUnlocked || onExp
      ? ''
      : isSub
        ? '<button class="mini sub on" type="button" data-action="pet-sub" data-value="none">보조해제</button>'
        : `<button class="mini sub" type="button" data-action="pet-sub" data-value="${def.id}">보조</button>`;
    const evoLine = !unlocked
      ? ''
      : evo.max
        ? `<div class="pet-evo done">${esc(info.def.label)} 완료 · ${esc(petSkillText(def, stage))}</div>`
        : `<div class="pet-evo${evo.can ? ' ready' : ''}">→ ${evo.next.badge} ${esc(petStageInfo({ pet: { evo: { [def.id]: evo.next.stage } } }, def.id).name)} · Lv.${evo.lv}/${evo.needLv} · 💎${evo.cost.shards} · 💰${fmt(evo.cost.gold)}${evo.can ? ' ✓' : ` <span class="dim">(${esc(evo.reason)})</span>`}</div>`;
    return `
      <div class="pet-row ${on ? 'on' : isSub ? 'sub-on' : ''} ${unlocked ? '' : 'lock'}">
        <img class="pet-thumb s${stage}" src="assets/sprites/pet/${info.sprite || def.sprite}.png" alt="" loading="lazy">
        <div class="pet-mid">
          <div class="pet-name">${def.emoji} ${esc(info.name || def.name)}${badge ? `<span class="evo-badge s${stage}">${badge}</span>` : ''}<span class="lv">Lv.${lv}</span>${on ? '<span class="pet-on">동행 중</span>' : isSub ? '<span class="pet-sub-tag">보조 50%</span>' : onExp ? '<span class="pet-exp-tag">🧭 파견 중</span>' : ''}</div>
          <div class="pet-desc">${esc(def.desc)}</div>
          <div class="pet-stats">공격 ${Math.round(petDmgPct(s, def.id) * 100)}% · 공격력 +${petAtkPct(s, def.id)}%${petGoldPct(s, def.id) ? ` · 골드 +${petGoldPct(s, def.id)}%` : ''}</div>
          ${skill ? `<div class="pet-skill">${skill.icon} <b>${esc(skill.name)}</b> — ${esc(petSkillText(def, stage))}</div>` : ''}
          ${evoLine}
          ${unlocked ? '' : `<div class="pet-cond">🔒 ${esc(def.cond)} · ${pr.text}</div><div class="prog tiny-prog"><i style="width:${pr.pct * 100}%"></i></div>`}
        </div>
        <div class="s-actions pet-acts">
          ${on
            ? '<button class="mini on" type="button" disabled>동행</button>'
            : onExp
              ? '<button class="mini" type="button" disabled>파견중</button>'
              : unlocked
                ? `<button class="mini equip" type="button" data-action="pet-equip" data-value="${def.id}">교체</button>`
                : '<button class="mini" type="button" disabled>잠김</button>'}
          ${subBtn}
          ${unlocked
            ? maxed
              ? '<button class="mini" type="button" disabled>MAX</button>'
              : `<button class="mini up" type="button" data-action="pet-upgrade" data-value="${def.id}" ${s.shards < cost ? 'disabled' : ''}>💎${cost}</button>`
            : ''}
          ${evolveBtn}
        </div>
      </div>`;
  }).join('');

  const evoCount = PETS.filter((d) => petEvo(s, d.id) > 0).length;
  const headRight = equipped
    ? `주 ${equipped.emoji}${subDef ? ` · 보조 ${subDef.emoji}` : subUnlocked ? ' · 보조 비어있음' : ''}`
    : '동행 없음';
  return `
  <div class="card pet-card" id="petCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🐾</span>내 동료 펫<small>${unlockedIds.length}/${PETS.length} 해금 · ★진화 ${evoCount}</small></div>
      <span class="tiny dim">${headRight}</span>
    </div>
    <div class="sub-pet-bar${subUnlocked ? ' on' : ''}">
      <span>🐾 보조 펫 슬롯</span>
      <small>${subUnlocked
        ? (subDef ? `${subDef.emoji} ${esc(petStageInfo(s, subDef.id).name)} 동행 중 · 패시브·지원 타격 50%` : '해금됨 — 아래 펫에서 [보조]를 눌러 2마리 동행')
        : `🔒 환생 ${SUB_PET_REQ.rebirth}회 또는 보유 지역 ${SUB_PET_REQ.cities}곳 달성 시 해금`}</small>
    </div>
    ${rows}
    <div class="note" style="margin-top:9px">
      부동산이 자라면 <b>자동 해금</b>됩니다. 주 펫은 <b>1.5초마다 함께 공격</b>하고, 보조 펫은 <b>2.1초마다 50% 지원 타격 + 패시브 50%</b>를 더합니다.<br>
      강화(💎) 1단계는 동행 피해·공격력 <b>+10%</b>(최대 Lv.${PET_MAX_LV}). <b>★각성(★) → 신수(★★)</b>는 강화 Lv.5·10과 강화석·골드로 진화하며,
      동행 피해 <b>×1.5 → ×2.1</b> 과 <b>고유 스킬</b>이 붙습니다.
    </div>
  </div>`;
}

/* ══════════════════════════ 🎯 미션 · 📖 도감 · 🏆 업적 (v3.3) ══════════════════════════ */
function questCard(ui) {
  const s = ui.s;
  const qs = questStateOf(s);
  const q = currentQuest(s);
  const c = codexStats(s);
  const achClaimed = claimedAchievementCount(s);
  const achReady = achievementStatus(s).filter((a) => a.claimable).length;

  const footer = `
    <div class="row gap6 q-foot">
      <button class="btn small ghost wide" type="button" data-action="open-codex" data-value="monster">📖 도감 <b style="color:var(--gold)">${c.pct}%</b></button>
      <button class="btn small ghost wide" type="button" data-action="open-achievements">🏆 업적 <b style="color:var(--green)">${achClaimed}/${ACHIEVEMENTS.length}</b>${achReady ? '<i class="q-alert"></i>' : ''}</button>
    </div>`;

  if (!q) {
    return `
  <div class="card quest-card done">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🎯</span>미션<small>시즌 완료</small></div>
      <span class="tiny" style="color:var(--gold)">${qs.done}/${QUESTS.length}</span>
    </div>
    <div class="tiny muted">모든 미션을 완료했습니다 🎉 도감과 업적을 계속 모아 보세요.</div>
    ${footer}
  </div>`;
  }

  const pr = questProgress(s, q.id);
  const reward = [
    q.gold ? `💰${q.gold.toLocaleString()}` : '',
    q.shards ? `💎${q.shards}` : '',
    q.points ? `✨${q.points}P` : '',
  ].filter(Boolean).join(' ');
  return `
  <div class="card quest-card ${pr.done ? 'ready' : ''}">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🎯</span>미션<small>${esc(q.chapter)} · ${qs.idx + 1}/${QUESTS.length}</small></div>
      <span class="tiny dim">완료 ${qs.done}개</span>
    </div>
    <div class="q-row">
      <div class="q-mid">
        <div class="q-name">${esc(q.title)}</div>
        <div class="q-desc">${esc(q.desc)}</div>
      </div>
      <div class="q-num">${Math.min(pr.cur, pr.goal).toLocaleString()}<span>/${pr.goal.toLocaleString()}</span></div>
    </div>
    <div class="prog${pr.done ? ' gold' : ''}" style="margin-top:6px"><i style="width:${pr.pct * 100}%"></i></div>
    <button class="btn block q-claim ${pr.done ? 'ready' : 'ghost'}" type="button" data-action="claim-quest" data-value="${q.id}" ${pr.done ? '' : 'disabled'}>
      ${pr.done ? `🎁 보상 받기 · ${reward}` : `진행 중 · 보상 ${reward}`}
    </button>
    ${footer}
  </div>`;
}

/* ══════════════════════════ 접힘/펼침 카드 헬퍼 (v8.0.0) ══════════════════════════
 * 3층 내비(하단 탭 → 서브 탭 → 섹션 칩 11개)를 없애고, 카드 헤더의 ▸ 한 번으로 접는다.
 * 접힘 상태는 세션 UI 상태(ui.collapsed)에만 둔다 — 저장 데이터·기존 기능 불변.
 */
const DEFAULT_COLLAPSED = [
  'battle-detail', 'gems', 'shards', 'craft', 'gacha', 'inventory', 'gear-info',
  'invest-dash', 'region-set', 'landmark', 'synergy', 'buff-detail', 'expedition', 'trade-rec',
  'pass', 'codex', 'info',
];
const isCardOpen = (ui, id) => !(ui && ui.collapsed && typeof ui.collapsed.has === 'function' && ui.collapsed.has(id));

/** 접히는 본문 — 접힌 상태에서도 DOM 에는 남긴다(실시간 data-live 갱신 유지) */
function foldBody(ui, id, html) {
  const open = isCardOpen(ui, id);
  return `<div class="card-body${open ? '' : ' hidden'}" id="fold-${id}">${html}</div>`;
}

/* ══════════════════════════ 사냥 — 서브 탭 (v8.0.0 재편) ══════════════════════════
 *  - battle   : 전투 정보 1장(기본 1줄 요약 + 접어서 스탯·DPS·CP 분석) · 스킬 · 펫 1줄
 *  - challenge: 침공 방어전 · 황금 던전 · 도전의 탑 · 일일 보스 · 무한 균열 · 주간 레이드
 *  - mission  : 오늘의 할 일 허브 · 출석 · 성장 패스 · 순차 미션 · 일일 퀘스트 · 도감
 */
const HUNT_SUBS = [
  ['battle', '⚔️', '전투'],
  ['challenge', '🏆', '도전'],
  ['mission', '📋', '미션'],
];

/** 서브 탭 배지 — 지금 누르면 보상을 받거나 바로 성장할 수 있는 항목 수 */
function huntBadges(ui) {
  const s = ui.s;
  const q = currentQuest(s);
  const questReady = !!(q && questProgress(s, q.id).done);
  const dqReady = dailyQuestStatus(s).readyCount;
  const achReady = achievementStatus(s).filter((a) => a.claimable).length;
  // v5.4: 주간 보스 마일스톤 · 7일 출석 체크(새 게임 0초 시점에는 과도한 알림 방지)
  const weeklyReady = weeklyBossInfo(s).readyCount;
  const att = attendanceInfo(s);
  const attReady = att.canClaim && (s.totalKills > 0 || att.total > 0) ? 1 : 0;
  const passReady = passInfo(s).readyCount;
  const raidReady = raidStatus(s, ui.battle && ui.battle.stats).readyCount;
  // 던전 '무료 입장 가능'은 10분마다 계속 켜지므로 배지에서 뺀다(탭 안에서 바로 보임) — 상시 점등 방지
  return {
    battle: 0,
    challenge: weeklyReady + raidReady,
    mission: (questReady ? 1 : 0) + dqReady + achReady + attReady + passReady,
  };
}

/** 현재 서브 탭 키 — 알 수 없는 값이면 전투로 복구한다 */
function huntSubOf(ui) {
  const k = ui && ui.huntSub;
  return HUNT_SUBS.some(([id]) => id === k) ? k : 'battle';
}

function huntSubBar(ui) {
  const sub = huntSubOf(ui);
  const b = huntBadges(ui);
  return `<div class="subtabs hunt-subbar" role="tablist" aria-label="사냥 서브 탭">${HUNT_SUBS.map(
    ([k, ico, label]) => `
    <button class="subtab ${sub === k ? 'active' : ''}" type="button" role="tab" aria-selected="${sub === k}" data-action="hunt-sub" data-value="${k}">${ico} ${label}<i class="nb ${b[k] ? 'on' : ''}" data-badge="${k}">${b[k] > 9 ? '9+' : b[k] || ''}</i></button>`,
  ).join('')}</div>`;
}

/* ───────────── 💪 스킬·스탯 ───────────── */
/** v4.8.1 실시간 DPS(초당 공격력) 스냅샷 — 실측(최근 5초) + 기본 이론치 + 활성 버프 */
function dpsSnapshot(b, now = Date.now()) {
  const base = b
    ? (typeof b.effectiveDps === 'function' ? b.effectiveDps(now) : (b.stats ? Number(b.stats.dps) || 0 : 0))
    : 0;
  const measured = b && typeof b.liveDps === 'function' ? b.liveDps(now) : 0;
  const dead = !!(b && b.player && b.player.dead);
  const hasLive = measured > 0;
  const value = hasLive ? measured : (dead ? 0 : base);
  const src = hasLive ? '최근 5초 실측' : (dead ? '전투 불능' : '기본 기준');
  const buffs = [];
  if (b && b.berserkUntil > now) buffs.push('🔥광폭');
  if (b && b.blessUntil > now) buffs.push('🌟축복');
  if (b && b.player && b.player.shield > 0 && b.player.shieldUntil > now) buffs.push('✨보호막');
  if (b && b.ultUntil > now) buffs.push('⚡궁극');
  if (b && b.feverUntil > now) buffs.push('🔥피버');
  return { value, base, src, hasLive, boost: buffs.length > 0, buffText: buffs.join(' ') };
}

/** v7.8.0 실시간 딜 비중 & 분당 골드/강화석(GPM/SPM) 미터기 HTML */
function dpsMeterInner(b, now = Date.now()) {
  const m = b && typeof b.dpsBreakdown === 'function' ? b.dpsBreakdown(now) : null;
  if (!m) return '';
  const activeParts = m.parts.filter((p) => p.dmg > 0);
  const segs = activeParts.length
    ? activeParts.map((p) => `<i style="width:${Math.max(4, p.pct)}%;background:${p.color}" title="${p.label} ${p.pct}%"></i>`).join('')
    : '<i style="width:100%;background:rgba(255,255,255,0.12)"></i>';
  const chips = activeParts.length
    ? activeParts.slice(0, 4).map((p) => `<span class="dm-chip"><b style="color:${p.color}">${p.icon}${p.label}</b> ${p.pct}%</span>`).join('')
    : '<span class="dm-chip dim">전투 데이터 수집 중…</span>';
  return `
    <div class="dm-top">
      <span class="dm-kpi">🎯 실측 치명 <b>${m.critRate}%</b> · 💰 <b>${fmt(m.gpm)}</b>/분 · 💎 <b>${fmt(m.spm)}</b>/분</span>
      <button class="dm-rst" type="button" data-action="reset-dps-meter" title="측정 초기화">🔄</button>
    </div>
    <div class="dm-bar">${segs}</div>
    <div class="dm-chips">${chips}</div>`;
}

function battleInfoCard(ui) {
  const s = ui.s;
  const b = ui.battle;
  const st = b.stats;
  const buffs = ui.app.buffs || {};
  const dps = dpsSnapshot(b, Date.now());
  const bd = computeCpBreakdown(s, buffs);
  const top = recommendGrowth(s, buffs, Date.now())[0];

  const stat = (cls, k, v, unit = '') => `
    <div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}${unit ? `<small>${unit}</small>` : ''}</div></div>`;

  // v8.0.0: 부동산 버프 합계는 '전투 요약 1줄'로만 — 상세 내역은 부동산 → 영지
  const tot = landBuffTotals(buffs);
  const hasLand = buffs.active || tot.atkPct || tot.goldPct || tot.critDmgPct || tot.cdrPct || tot.bossDmgPct || tot.expPct;
  const landLine = hasLand
    ? `<span class="bi-land-k">🏘️ 부동산 버프</span><span class="bi-land-v">${landBuffTotalsText(buffs)}</span><span class="dim">· ${buffs.buildings || 0}곳</span>`
    : `<span class="bi-land-k">🏘️ 부동산 버프</span><span class="dim">매물을 사면 사냥에 영구 버프 — <b style="color:var(--gold)">부동산 → 매물</b></span>`;

  const spdUnlocked = battleSpeedUnlocked(s);
  const spdVal = effectiveBattleSpeed(s);
  const spdBtn = `<button class="spd-btn${spdVal > 1 ? ' on' : ''}${spdUnlocked ? '' : ' lock'}" type="button" data-action="cycle-speed" aria-label="전투 배속 전환">${spdUnlocked ? `⚡ ×${spdVal}` : '🔒 ×2'}</button>`;

  const detail = `
    <div class="sec-lbl">전투 스탯</div>
    <div class="dps-hero${dps.boost ? ' boost' : ''}" data-live="dps-hero">
      <div class="dps-left">
        <div class="dps-k">⚡ 실시간 DPS <small>(초당 공격력)</small></div>
        <div class="dps-v"><b data-live="live-dps">${fmt(dps.value)}</b><small>/초</small><span class="dps-buffs${dps.buffText ? '' : ' hidden'}" data-live="dps-buffs">${esc(dps.buffText)}</span></div>
      </div>
      <div class="dps-right">
        <div class="dps-base">기본 <b data-live="dps">${fmt(dps.base)}</b>/초</div>
        <div class="dps-src" data-live="dps-src">${dps.src}</div>
      </div>
    </div>
    <div class="dps-meter" data-live="dps-meter">${dpsMeterInner(b, Date.now())}</div>
    <div class="stat-grid four">
      ${stat('atk', '공격력', fmt(st.atk))}
      ${stat('hp', '최대 체력', fmt(st.hpMax))}
      ${stat('def', '피해 감소', Math.round((st.dmgReduce || 0) * 100), '%')}
      ${stat('regen', '자연 회복', ((st.hpRegen || 0) * 100).toFixed(2), '%/s')}
      ${stat('crit', '치명타', (st.crit * 100).toFixed(1), '%')}
      ${stat('gold', '골드 획득', `+${Math.round((st.goldMult - 1) * 100)}`, '%')}
      ${stat('', '강화석 드롭', `+${Math.round((st.dropMult - 1) * 100)}`, '%')}
      ${stat('', '공격 속도', (1000 / st.attackMs).toFixed(2), '회/초')}
      ${st.critDmg > 2 ? stat('crit', '치명타 피해', `×${st.critDmg.toFixed(2)}`, '') : ''}
      ${st.skillCdr > 0 ? stat('', '스킬 쿨감', `${Math.round(st.skillCdr * 100)}`, '%') : ''}
      ${st.bossDmgPct > 0 ? stat('', '보스 피해', `+${Math.round(st.bossDmgPct * 100)}`, '%') : ''}
      ${st.expMult > 1 ? stat('', '경험치 획득', `+${Math.round((st.expMult - 1) * 100)}`, '%') : ''}
    </div>
    <div class="bi-guide">${cpGuideInner(ui)}</div>`;

  return `
  <div class="card stats-card" id="battleInfoCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">📊</span>전투 정보<small>${esc(b.def.themeName)} · S${s.stage}${b.def.infinite ? '<span class="inf-badge">∞</span>' : ''}</small></div>
      <div class="row gap6">
        ${spdBtn}
        <button class="switch sm ${s.autoBoss ? 'on' : ''}" data-action="toggle-auto" aria-label="자동 보스 전환"></button>
      </div>
    </div>
    <button class="bi-sum" type="button" data-action="toggle-fold" data-value="battle-detail" aria-expanded="${isCardOpen(ui, 'battle-detail')}">
      <span class="bi-kpi">⚡ <b data-live="live-dps">${fmt(dps.value)}</b><small>/초</small></span>
      <span class="bi-kpi">🧭 CP <b>${fmt(bd.cp)}</b></span>
      <span class="bi-next ellip">🎯 ${top ? `${top.icon} ${esc(top.title)}` : '사냥 계속'}</span>
      <i class="cv">${isCardOpen(ui, 'battle-detail') ? '▾' : '▸'}</i>
    </button>
    <div class="bi-land">${landLine}</div>
    ${foldBody(ui, 'battle-detail', detail)}
  </div>`;
}

function huntSkillCard(ui) {
  const s = ui.s;
  const cells = Object.entries(SKILLS)
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
      const maxed = sk.lv >= SKILL_UPGRADE_MAX;
      const runes = SKILL_RUNES[key] || [];
      const activeRune = skillRuneOf(s, key);
      const runeUnlocked = (sk.lv || 0) >= SKILL_RUNE_UNLOCK_LV;
      const runeRow = runes.length
        ? `<div class="sc-runes">${runes.map((r) => `<button class="rune-chip${activeRune && activeRune.id === r.id ? ' on' : ''}" style="--rc:${r.color}" type="button" data-action="skill-rune" data-skill="${key}" data-value="${r.id}" ${runeUnlocked ? '' : 'disabled'} title="${esc(r.short)}">${runeUnlocked ? `${r.icon} ${esc(r.name)}` : `🔒 Lv.${SKILL_RUNE_UNLOCK_LV}`}</button>`).join('')}</div>${activeRune ? `<div class="sc-rune-desc">${activeRune.icon} ${esc(activeRune.short)}</div>` : ''}`
        : '';
      return `
      <div class="skill-cell">
        <button class="sc-cast" type="button" data-action="cast" data-value="${key}" aria-label="${def.name} 시전">
          <span class="s-ico" style="color:${activeRune ? activeRune.color : def.color}">${activeRune ? activeRune.icon : def.icon}</span>
          <span class="sc-mid">
            <span class="sc-name">${activeRune ? esc(activeRune.name) : def.name}<span class="lv">Lv.${sk.lv}</span></span>
            <span class="sc-effect">${detail} · ${def.cd / 1000}s</span>
          </span>
        </button>
        <button class="btn small ${maxed ? 'ghost' : 'blue'} sc-up" data-action="upgrade-skill" data-value="${key}" aria-label="${def.name} 강화" ${maxed || s.shards < cost ? 'disabled' : ''}>
          ${maxed ? 'MAX' : `💎${cost}`}
        </button>
        ${runeRow}
        <i class="cd-bar"><i data-live="cd-${key}"></i></i>
      </div>`;
    })
    .join('');

  return `
  <div class="card skill-card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">✨</span>스킬 <small>터치하면 즉시 · 자동 시전</small></div>
      <div class="row gap6">
        <span class="tiny dim">자동</span>
        <button class="switch sm ${s.autoSkill !== false ? 'on' : ''}" data-action="toggle-auto-skill" aria-label="스킬 자동 시전 전환"></button>
        <span class="tiny dim">💎 <b data-live="shards">${fmt(s.shards)}</b></span>
        <button class="mini log-btn" type="button" data-action="open-log" aria-label="전투 기록 열기">📜</button>
      </div>
    </div>
    <div class="skill-grid">${cells}</div>
    ${ultPanel(ui)}
  </div>`;
}

/** 🐉 v4.7 상위 전직 궁극기 카드 — 해금 전에는 잠금 안내만 */
function ultPanel(ui) {
  const s = ui.s;
  const u = ultimateOf(s);
  const next = ULTIMATES[0];
  if (!u) {
    const pr = jobProgress(s);
    return `
    <div class="ult-card locked">
      <div class="ult-head">
        <span class="ult-ico">🔒</span>
        <span class="ult-name">궁극기 <b>${next.name}</b><span class="lv">전직 ${ULT_MIN_TIER + 1}단계</span></span>
      </div>
      <div class="ult-desc dim">5단계 <b>🐉 드래곤 로드</b>(Lv.65 · S32)에 오르면 다섯 번째 필살기가 열립니다. 지금 ${pr.next ? `다음 전직까지 ${pr.reason}` : '최종 전직'}</div>
    </div>`;
  }
  const cd = ultCdOf(s, ui.app && ui.app.buffs);
  const left = ultLeftMs(s, ui.app && ui.app.buffs);
  const casts = Math.max(0, Math.floor(Number(s.ult && s.ult.casts) || 0));
  return `
  <div class="ult-card" style="--uc:${u.color};--ub:${u.burst || u.color}">
    <div class="ult-head">
      <span class="ult-ico">${u.icon}</span>
      <span class="ult-name">궁극기 <b>${esc(u.name)}</b><span class="lv">${esc(jobOf(s).name)}</span></span>
      <button class="btn small blue ult-cast" type="button" data-action="cast-ult" data-live="cast-ultimate">${left > 0 ? `${(left / 1000).toFixed(1)}초` : '시전'}</button>
    </div>
    <div class="ult-desc">${esc(u.desc)}</div>
    <i class="cd-bar"><i data-live="cd-ultimate"></i></i>
    <div class="ult-foot">
      <span class="tiny dim">쿨 ${Math.round(cd / 1000)}초 · 누적 ${fmt(casts)}회</span>
      <span class="tiny dim" style="display:inline-flex;align-items:center;gap:6px">자동 발동
        <button class="switch sm ${s.autoUlt !== false ? 'on' : ''}" data-action="toggle-auto-ult" aria-label="궁극기 자동 발동 전환"></button>
      </span>
    </div>
  </div>`;
}

/** ⚔️ 전투 — 전투 정보 1장(접힘) + 스킬 + 펫 1줄 */
function tplHuntBattle(ui) {
  return `${battleInfoCard(ui)}${huntSkillCard(ui)}${petLine(ui)}`;
}

/** 📋 오늘의 할 일 허브 — 미션 탭 첫 카드(개별 화면 대신 한 곳에서 일괄 수령) */
function todoHubCard(ui) {
  const now = Date.now();
  let sum = { totalClaimable: 0, items: [], alerts: [] };
  try {
    sum = collectTodoSummary(ui.s, ui.battle && ui.battle.stats, now);
  } catch (e) { /* ignore */ }
  const rows = sum.items.length
    ? sum.items.slice(0, 8).map((it) => `
      <div class="todo-row"><span>${it.icon} <b>${esc(it.label)}</b></span><small>${esc(it.detail)}</small></div>`).join('')
    : '<div class="tiny dim" style="margin:6px 0">지금 수령 대기 중인 보상이 없습니다 — 사냥을 계속하면 채워집니다.</div>';
  const alerts = sum.alerts.length
    ? `<div class="row gap6 wrap" style="margin-top:6px">${sum.alerts.slice(0, 3).map((a) => `<button class="mini ghost" type="button" data-action="${a.action}">${a.icon} ${esc(a.label)}</button>`).join('')}</div>`
    : '';
  const n = sum.totalClaimable;
  return `
  <div class="card todo-card${n > 0 ? ' ready' : ''}" id="todoHubCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">📋</span>오늘의 할 일<small>${n > 0 ? `${n}건 수령 가능` : '모두 수령 완료'}</small></div>
      <button class="btn small ${n > 0 ? 'green' : 'ghost'} todo-all" type="button" data-action="todo-claim-all" ${n > 0 ? '' : 'disabled'}>⚡ 일괄 수령</button>
    </div>
    <div class="todo-list">${rows}</div>
    ${alerts}
    <div class="tiny dim" style="margin-top:6px">출석·패스·일일퀘·미션·탑 소탕·은행·파견·레이드 보상을 여기서 한 번에 받습니다.</div>
  </div>`;
}

/* ───────────── ✨ 전직·환생 ───────────── */
/** 동료 펫 — 사냥 탭에서는 한 줄 요약만 두고, 강화·교체는 부동산 탭 '건물주 버프'의 펫 카드에서 한다 */
function petLine(ui) {
  const s = ui.s;
  const ps = s.pet || { equipped: null, unlocked: [] };
  const unlockedIds = Array.isArray(ps.unlocked) ? ps.unlocked : [];
  const equipped = petDef(ps.equipped);
  const subDef = subPet(s);
  // v4.2: 진화 단계·고유 스킬 한 줄 요약
  const info = equipped ? petStageInfo(s, equipped.id) : null;
  const stage = info ? info.stage : 0;
  const skill = equipped ? petSkillOf(s, equipped.id) : null;
  const evoCount = PETS.filter((d) => petEvo(s, d.id) > 0).length;
  const badge = stage >= 2 ? '★★' : stage >= 1 ? '★' : '';
  const subTxt = subDef ? ` · 보조 ${subDef.emoji} ${esc(petStageInfo(s, subDef.id).name)}` : '';
  const ex = expeditionStatus(s);
  const expLine = ex.readyCount > 0
    ? `<div class="tiny" style="margin-top:3px;color:var(--gold)">🧭 <b>영지 파견 ${ex.readyCount}팀 탐험 완료!</b> · 관리에서 보상 수령</div>`
    : ex.activeCount > 0
      ? `<div class="tiny dim" style="margin-top:2px">🧭 영지 파견 ${ex.activeCount}/${ex.maxSlots}팀 탐험 중</div>`
      : '';
  return `
  <div class="card pet-line" id="petCard">
    <div class="row">
      <div class="grow ellip">
        <div class="card-title"><span class="t-ico">🐾</span>동료 펫<small>${unlockedIds.length}/${PETS.length} 해금 · ★진화 ${evoCount}</small></div>
        <div class="tiny dim ellip" style="margin-top:3px">${equipped ? `동행 ${equipped.emoji} ${badge ? `<b style="color:var(--gold)">${badge}</b> ` : ''}${esc(info.name)}${subTxt}` : '동행 중인 펫이 없습니다 — 부동산이 자라면 자동 해금'} · 교체·보조·진화는 성장 → 수집 · 파견은 부동산 → 영지</div>
        ${skill ? `<div class="tiny ellip" style="margin-top:2px;color:${stage >= 1 ? 'var(--blue)' : 'var(--dim)'}">${skill.icon} <b>${esc(skill.name)}</b> — ${esc(petSkillText(equipped, stage))}</div>` : ''}
        ${expLine}
      </div>
      <button class="btn small ghost" type="button" data-action="open-pets" style="min-height:32px">관리 ▸</button>
    </div>
  </div>`;
}

/* ───────────── 🏺 유물 · 🌀 무한 균열 · 🛡️ 기사단/레이드 (v7.0.0: ui-hunt.js 분리) ───────────── */

/** 🏆 도전 — 침공 방어전·던전·탑·일일 보스·무한 균열·주간 레이드 */
function tplHuntChallenge(ui) {
  return `${invasionCard(ui)}${dungeonCard(ui)}${towerCard(ui)}${dailyBossCard(ui)}${riftCard(ui)}${guildRaidCard(ui)}`;
}

/* ───────────── 📅 일일 퀘스트 (v4.9.0 · KST 자정 리셋) ───────────── */
function dailyQuestCard(ui) {
  const dq = dailyQuestStatus(ui.s);
  const h = Math.floor(dq.resetMs / 3600000);
  const m = Math.floor((dq.resetMs % 3600000) / 60000);
  const rows = dq.items.map((it) => `
    <div class="dq-row ${it.claimed ? 'done' : it.claimable ? 'ready' : ''}">
      <div class="dq-ico">${it.icon}</div>
      <div class="dq-mid">
        <div class="dq-t">${esc(it.title)} <small>${Math.min(it.cur, it.goal)}/${it.goal}</small></div>
        <div class="dq-d">${esc(it.desc)} · 💰${formatGold(it.gold)} 💎${it.shards}</div>
        <div class="prog tiny-prog${it.claimable ? ' gold' : ''}"><i style="width:${it.pct * 100}%"></i></div>
      </div>
      <div class="dq-act">${
        it.claimed
          ? '<span class="tiny" style="color:var(--green)">완료 ✓</span>'
          : it.claimable
            ? `<button class="btn small primary" type="button" data-action="claim-daily-quest" data-value="${it.id}">수령</button>`
            : '<span class="tiny dim">진행</span>'
      }</div>
    </div>`).join('');
  const b = dq.bonus;
  const bonusLabel = dq.bonusClaimed
    ? '🎁 오늘 올클리어 보너스 수령 완료 ✓'
    : dq.bonusReady
      ? `🎁 올클리어 보너스 받기 · 💰${formatGold(b.gold)} 💎${b.shards} ✨${b.points}P`
      : `🎁 올클리어 (${dq.claimedCount}/${dq.total}) · 💰${formatGold(b.gold)} 💎${b.shards} ✨${b.points}P`;
  return `
  <div class="card dq-card${dq.readyCount ? ' ready' : ''}">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">📅</span>일일 퀘스트<small>${dq.claimedCount}/${dq.total} · ${h}시간 ${m}분 후 리셋</small></div>
    </div>
    <div class="dq-list">${rows}</div>
    <button class="btn block dq-bonus ${dq.bonusReady ? 'ready' : 'ghost'}" type="button" data-action="claim-daily-quest-bonus" ${dq.bonusReady ? '' : 'disabled'}>${bonusLabel}</button>
  </div>`;
}

/* ───────────── 🎯 미션·도감 ───────────── */
function codexCard(ui) {
  const s = ui.s;
  const c = codexStats(s);
  const achClaimed = claimedAchievementCount(s);
  const achReady = achievementStatus(s).filter((a) => a.claimable).length;
  const cell = (ico, label, seen, total) => `
    <div class="cx-cell"><span>${ico} ${label}</span><b>${seen}<small>/${total}</small></b></div>`;
  const next = c.next;
  return `
  <div class="card codex-card" data-fold="codex">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">📖</span>도감·업적<small>수집 ${c.pct}%</small></div>
      <span class="tiny dim">업적 <b style="color:var(--green)">${achClaimed}/${ACHIEVEMENTS.length}</b></span>
    </div>
    <div class="cx-grid">
      ${cell('👾', '몬스터', c.monsters.seen, c.monsters.total)}
      ${cell('🏙️', '지역', c.cities.seen, c.cities.total)}
      ${cell('🎒', '장비', c.gear.seen, c.gear.total)}
      ${cell('🐾', '펫', c.pets.seen, c.pets.total)}
    </div>
    <div class="tiny dim" style="margin-top:6px">⚔️ 장비 도감 <b style="color:var(--txt)">${c.gearItems.seen}/${c.gearItems.total}종</b> · 🌟 펫 진화 <b style="color:var(--txt)">${c.petEvos.seen}/${c.petEvos.total}단계</b></div>
    <div class="tiny ellip" style="margin-top:4px;color:${next ? 'var(--sub)' : 'var(--gold)'}">${
      next
        ? `다음 마일스톤 <b style="color:var(--txt)">${next.pct}%</b> · 공격 +${next.atkPct}% · 골드 +${next.goldPct}%`
        : '모든 도감 마일스톤을 달성했습니다 🎉'
    }</div>
    ${achReady ? `<div class="tiny" style="margin-top:3px;color:var(--green)">🏆 지금 받을 수 있는 업적 보상 <b>${achReady}</b>개 — 위 <b>업적</b> 버튼에서 수령</div>` : ''}
  </div>`;
}

/* ───────────── 🗓️ 7일 출석 체크 (v5.4.0 · KST 자정 리셋) ───────────── */
function attendanceCard(ui) {
  const att = attendanceInfo(ui.s);
  const h = Math.floor(att.resetMs / 3600000);
  const m = Math.floor((att.resetMs % 3600000) / 60000);
  const cells = att.days.map((d) => {
    const rw = d.rarity === 'legend'
      ? `👑전설<br>💎${d.shards} ✨${d.points}P`
      : `💰${formatGold(d.gold)}<br>💎${d.shards}${d.points ? ` ✨${d.points}P` : ''}`;
    const cls = `${d.done ? 'done' : ''}${d.current ? ' cur' : ''}${d.day === 7 ? ' big' : ''}`;
    return `<div class="att-cell ${cls}">
      <span class="att-day">${d.label}${d.done ? ' ✓' : ''}</span>
      <span class="att-ico">${d.icon}</span>
      <span class="att-rw">${rw}</span>
    </div>`;
  }).join('');
  return `
  <div class="card att-card${att.canClaim ? ' ready' : ''}">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🗓️</span>7일 출석 체크<small>누적 ${att.total}일 · 7일차 전설 확정</small></div>
      <span class="tiny dim">${att.claimedToday ? `${h}시간 ${m}분 후 다음 출석` : `${att.nextDay}일차 수령 가능`}</span>
    </div>
    <div class="att-grid">${cells}</div>
    <button class="btn block ${att.canClaim ? 'primary' : 'ghost'}" style="margin-top:8px" type="button" data-action="claim-attendance" ${att.canClaim ? '' : 'disabled'}>${
      att.canClaim ? `🗓️ ${att.nextDay}일차 출석 보상 받기` : '✅ 오늘 출석 완료 · 내일 00:00(KST)에 다시'
    }</button>
  </div>`;
}

/* ───────────── 🎖️ 패스 · 🏷️ 칭호 (v7.0.0: ui-hunt.js 분리) ───────────── */

function tplHuntMission(ui) {
  return `${todoHubCard(ui)}${attendanceCard(ui)}${passCard(ui)}${questCard(ui)}${dailyQuestCard(ui)}${codexCard(ui)}`;
}

/* ══════════════════════════ 사냥/스킬 (본문) ══════════════════════════ */
function tplHunt(ui) {
  const sub = huntSubOf(ui);
  const body = sub === 'challenge' ? tplHuntChallenge(ui) : sub === 'mission' ? tplHuntMission(ui) : tplHuntBattle(ui);
  return `${huntSubBar(ui)}${body}`;
}

/* ══════════════════════════ 🎒 성장 (v8.0.0 — 장비/전직·환생/수집 3서브) ══════════════════════════
 *  - equip  : 장비 장착·강화 + 보석 + 강화석 + 테마 공방 + 뽑기·인벤토리(접힘)
 *  - job    : 전직 · 환생(초월) · 영구 특성
 *  - collect: 고대 유물 · 칭호 · 동료 펫(진화·교체)
 */
const GEAR_SUBS = [
  ['equip', '🎒', '장비'],
  ['job', '✨', '전직·환생'],
  ['collect', '🏺', '수집'],
];

function gearSubOf(ui) {
  if (!ui || ui.gearSub === undefined) return 'all'; // 레거시 헤드리스 호출 호환
  return GEAR_SUBS.some(([k]) => k === ui.gearSub) ? ui.gearSub : 'equip';
}

function gearBadges(ui) {
  const s = ui.s;
  const canEnhance = EQUIP_SLOTS.some((slot) => {
    const lv = s.equip[slot] || 0;
    if (lv < EQUIP_MAX_LV) return s.shards >= enhanceCost(lv);
    const ac = awakenCost(awakenLevel(s, slot));
    return !!(ac && s.shards >= ac.shards && s.gold >= ac.gold);
  });
  const canBulk = dismantleTargets(s, 'low').length > 0;
  const g = s.gacha || { cur: 'gold' };
  const cur = g.cur === 'shards' ? 'shards' : 'gold';
  const canPull10 = (s[cur] || 0) >= gachaCost(cur, 10).amount;
  const pr = jobProgress(s);
  const rb = rebirthStatus(s);
  const traitReady = REBIRTH_TRAITS.some((t) => traitLevel(s, t.id) < t.maxLv && rb.points >= traitCost(traitLevel(s, t.id)));
  const petEvoReady = PETS.filter((d) => (s.pet && s.pet.unlocked && s.pet.unlocked.includes(d.id)) && petEvolveInfo(s, d.id).can).length;
  const rel = s.relics || { owned: {}, equipped: [] };
  const relicReady = (Object.keys(rel.owned || {}).length > (Array.isArray(rel.equipped) ? rel.equipped.length : 0) || canBulk) ? 1 : 0;
  return {
    equip: (canEnhance ? 1 : 0) + (canBulk ? dismantleTargets(s, 'low').length : 0) + (canPull10 ? 1 : 0),
    job: (pr.canPromote ? 1 : 0) + (rb.can ? 1 : 0) + (traitReady ? 1 : 0),
    collect: petEvoReady + relicReady,
  };
}

function gearSubBar(ui) {
  const sub = gearSubOf(ui);
  const active = sub === 'all' ? 'equip' : sub;
  const b = gearBadges(ui);
  return `<div class="subtabs hunt-subbar gear-subbar" role="tablist" aria-label="성장 서브 탭">${GEAR_SUBS.map(
    ([k, ico, label]) => `
    <button class="subtab ${active === k ? 'active' : ''}" type="button" role="tab" aria-selected="${active === k}" data-action="gear-sub" data-value="${k}">${ico} ${label}<i class="nb ${b[k] ? 'on' : ''}" data-gbadge="${k}">${b[k] > 9 ? '9+' : b[k] || ''}</i></button>`,
  ).join('')}</div>`;
}

function tplGear(ui) {
  const s = ui.s;
  const st = ui.battle.stats;
  const sub = gearSubOf(ui);
  const total = Object.values(s.equip).reduce((a, b) => a + b, 0);
  const price = shardPrice(s);
  const maxShards = maxShardsBuy(s);
  // v4.4: ×1 · ×10 · ×100 + 최대 — 못 사는 단위도 자리를 지켜(비활성) 가격을 비교할 수 있게
  const bulkBtns = SHARD_BULK.map((n) => {
    const cost = price * n;
    const can = cost <= s.gold;
    return `<button class="chip xchg${can ? '' : ' off'}" data-action="buy-shards" data-value="${n}" ${can ? '' : 'disabled'} title="${can ? `💎${n}개 · 💰${fmt(cost)}` : `골드 ${fmt(cost - s.gold)} 부족`}">×${n}<small>💰${fmt(cost)}</small></button>`;
  }).join('');

  const rows = Object.entries(EQUIP)
    .map(([slot, def]) => {
      const lv = s.equip[slot];
      const rid = equippedRarity(s, slot);
      const it = equippedItem(s, slot);
      const bonus = rarityBonusLv(rid);
      const awk = awakenLevel(s, slot);
      const awkBonus = awk * GEAR_AWAKEN_BONUS_LV;
      const maxed = lv >= EQUIP_MAX_LV;
      const cost = enhanceCost(lv);
      const effLv = lv + bonus + awkBonus;
      const cur = def.per * effLv;
      const next = def.per * (effLv + 1);
      const maxN = maxed ? 0 : enhanceMaxCount(s, slot);
      const unitText = (v) => (slot === 'ring' ? `${v.toFixed(1)}%` : slot === 'amulet' ? `+${Math.round(v)}%` : `+${fmt(v)}`);
      // v4.10 부위 각성 (+100강 도달 시 해금 · 환생 후에도 유지)
      const ac = awakenCost(awk);
      const canAwk = maxed && ac && s.shards >= ac.shards && s.gold >= ac.gold;
      const awkRow = maxed || awk > 0
        ? `<div class="g-awk">
            <span class="tiny">${awk > 0 ? `<b style="color:var(--gold)">🔥 각성 ★${awk}/${GEAR_AWAKEN_MAX}</b> · 부위 +${awkBonus}강 · 옵션 +${awk * GEAR_AWAKEN_OPT_PCT}%` : '🔥 +100강 도달 — 부위 각성 가능 (환생 유지)'}</span>
            ${ac
              ? `<button class="btn small ${canAwk ? 'primary' : 'ghost'}" type="button" data-action="gear-awaken" data-slot="${slot}" ${canAwk ? '' : 'disabled'}>🔥 각성 💎${fmt(ac.shards)} 💰${formatGold(ac.gold)}</button>`
              : '<span class="tiny" style="color:var(--gold)">최종 각성 MAX</span>'}
          </div>`
        : '';
      return `
      <div class="gear-row">
        <div class="g-top">
          <div class="g-ico">${it ? gearIcon(it, 38) : def.icon}</div>
          <div class="g-mid">
            <div class="g-name">${it ? esc(it.name) : def.name}${rarityBadge(rid)}<span class="lv">+${lv}</span>${awk > 0 ? `<span class="awk-badge">★${awk}</span>` : ''}</div>
            <div class="g-stat">${def.stat} ${unitText(cur)}${maxed ? ' · 최대' : ` → <b style="color:var(--green)">${unitText(next)}</b>`}</div>
            ${(bonus > 0 || awkBonus > 0) ? `<div class="g-rar">${[bonus > 0 ? `등급 보정 +${bonus}강` : '', awkBonus > 0 ? `각성 +${awkBonus}강` : ''].filter(Boolean).join(' · ')}</div>` : ''}
          </div>
        </div>
        <div class="g-acts">
          <button class="btn small blue" data-action="enhance" data-slot="${slot}" ${maxed || s.shards < cost ? 'disabled' : ''}>
            ${maxed ? 'MAX' : `+1 <span class="cost">💎${fmt(cost)}</span>`}
          </button>
          <button class="btn small ghost" data-action="enhance5" data-slot="${slot}" ${maxN < 1 ? 'disabled' : ''}>+5</button>
          <button class="btn small ghost" data-action="enhance10" data-slot="${slot}" ${maxN < 1 ? 'disabled' : ''}>+10</button>
          <button class="btn small ghost g-max" data-action="enhancemax" data-slot="${slot}" ${maxN < 1 ? 'disabled' : ''}>최대${maxN > 0 ? ` +${maxN}` : ''}</button>
        </div>
        ${awkRow}
      </div>`;
    })
    .join('');

  const enhanceCard = `
  <div class="card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🔨</span>장비 강화 <small>부위 공유</small></div>
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
      강화는 <b>실패 없이 100% 성공</b>합니다. 강화석은 사냥 드롭·보스 처치·스테이지 클리어·뽑기 분해로 모입니다.<br>
      <b>+5 · +10 · 최대</b>는 강화석이 닿는 만큼 한 번에 올립니다(모자라면 가능한 만큼만).
      ${s.equip.ring === 0 ? '<br>반지는 치명타 확률, 부적은 골드 획득량을 올립니다.' : ''}
    </div>
  </div>`;

  const infoCard = `
  <div class="card" data-fold="gear-info">
    <div class="card-head"><div class="card-title"><span class="t-ico">📈</span>부위별 효과</div><span class="tiny dim">등급 보정 포함</span></div>
    <div class="kv"><span class="k">⚔️ 무기</span><span class="v">공격력 +${EQUIP.weapon.per}/강화</span></div>
    <div class="kv"><span class="k">🛡️ 갑옷</span><span class="v">체력 +${EQUIP.armor.per}/강화</span></div>
    <div class="kv"><span class="k">🪖 투구</span><span class="v">체력 +${EQUIP.helmet.per}/강화</span></div>
    <div class="kv"><span class="k">💍 반지</span><span class="v">치명타 +${EQUIP.ring.per}%/강화</span></div>
    <div class="kv"><span class="k">🧿 부적</span><span class="v">골드 +${EQUIP.amulet.per}%/강화</span></div>
    <div class="kv"><span class="k">🏅 등급 보정</span><span class="v">일반 +0 · 고급 +4 · 레어 +9 · 영웅 +16 · 전설 +25강</span></div>
    <div class="kv"><span class="k">🎯 장비 옵션</span><span class="v">흡혈 · 공속 · 보스 추뎀 · 치명타 · 피해 감소 · 회복 · 골드/드랍 · 범위 베기 — 모두 실제 전투에 반영</span></div>
    <div class="kv"><span class="k">🎒 사냥 드랍</span><span class="v">몬스터 ${(GEAR_DROP.normalChance * 100).toFixed(1)}% · 보스 ${(GEAR_DROP.bossChance * 100).toFixed(0)}% (스테이지가 높을수록 고등급)</span></div>
  </div>`;

  const shardCard = `
  <div class="card" data-fold="shards">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">💱</span>강화석 구매 <small>골드 → 💎</small></div>
      <span class="tiny dim">시세 💰${fmt(price)}/개</span>
    </div>
    <div class="row tiny" style="margin-bottom:8px">
      <span class="muted">보유 골드 <b data-live="gold" style="color:var(--gold)">${fmt(s.gold)}</b></span>
      <span class="dim">최대 <b>${fmt(maxShards)}</b>개 교환 가능</span>
    </div>
    <div class="chips xchg-row">
      ${bulkBtns}
      <button class="chip xchg max" data-action="buy-shards" data-value="max" ${maxShards > 0 ? '' : 'disabled'}>
        <span class="lbl">최대 <b>${fmt(maxShards)}</b>개</span><small>${maxShards > 0 ? `💰${fmt(price * maxShards)}` : '골드 부족'}</small>
      </button>
    </div>
    <div class="note" style="margin-top:9px">
      임대수익으로 모은 골드를 강화석으로 바꿔 장비·펫 진화·스킬을 올릴 수 있습니다.
      <b>×100 · 최대</b>로 펫 ★★진화(한 마리 400~800개)에 필요한 강화석을 한 번에 마련하세요.
      시세는 <b>현재 스테이지 사냥 기대값</b>을 따라 오르내립니다.
    </div>
  </div>`;

  const landTipCard = `
  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">🏢</span>골드 쓰는 곳</div><span class="tiny dim">통합 경제</span></div>
    <div class="tiny muted" style="line-height:1.7">
      사냥으로 모은 <b>골드</b>는 전국 229개 시군구 <b>매물</b>을 사는 데 그대로 쓰입니다.
      보유 매물은 <b>임대수익(골드)</b>과 <b>건물주 영구 버프</b>를 돌려줍니다.
    </div>
    <button class="btn green block" style="margin-top:10px" data-action="tab" data-value="land">🏢 부동산 보러 가기</button>
  </div>`;

  const gemCard = (() => {
    const gs = s.gems || { bag: {}, sockets: {} };
    const socks = gs.sockets || {};
    const bag = gs.bag || {};
    const curSlot = EQUIP_SLOTS.includes(ui.gemSlot) ? ui.gemSlot : 'weapon';
    const ge = gemEffects(s);
    const sockCells = EQUIP_SLOTS.map((sl) => {
      const g = socks[sl];
      const def = g && GEM_BY_ID[g.type];
      const active = curSlot === sl;
      return `<button class="gs-cell${def ? ' on' : ''}" style="--gc:${def ? def.color : '#69c0ff'};${active ? 'outline:1.5px solid var(--gold)' : ''}" type="button" data-action="gem-slot" data-value="${sl}">
        <span class="gi">${def ? def.icon : EQUIP[sl].icon}</span>
        <span>${EQUIP[sl].name}${def ? ` Lv.${g.lv}` : ''}</span>
      </button>`;
    }).join('');
    const curG = socks[curSlot];
    const gemRows = GEMS.map((g) => {
      const counts = Array.isArray(bag[g.id]) ? bag[g.id] : [0, 0, 0, 0, 0];
      const pills = counts.map((cnt, i) => {
        const lv = i + 1;
        if (!cnt) return '';
        const mergeBtn = lv < GEM_MAX_LV && cnt >= GEM_MERGE_NEED
          ? `<button class="mini up" type="button" data-action="gem-merge" data-gem="${g.id}" data-value="${lv}">합성→Lv.${lv + 1}</button>`
          : '';
        return `<button class="mini equip" type="button" data-action="gem-socket" data-gem="${g.id}" data-value="${lv}">Lv.${lv}(${cnt}) 장착</button>${mergeBtn}`;
      }).filter(Boolean).join('');
      const canCut = s.shards >= GEM_CUT_COST.shards && s.gold >= GEM_CUT_COST.gold;
      return `<div class="gem-row">
        <div class="grow">
          <div class="tiny"><b>${g.icon} ${g.name}</b> <span class="dim">${g.desc(1)}</span></div>
          <div class="gem-lvs" style="margin-top:3px">${pills || '<span class="tiny dim">보유 없음</span>'}</div>
        </div>
        <button class="mini ${canCut ? 'up' : ''}" type="button" data-action="gem-cut" data-value="${g.id}" ${canCut ? '' : 'disabled'}>세공</button>
      </div>`;
    }).join('');
    return `
    <div class="card gem-card" id="gemSocketCard" data-fold="gems">
      <div class="card-head">
        <div class="card-title"><span class="t-ico">💠</span>보석 소켓<small>${ge.socketCount}/5 장착 · 세공 💎${GEM_CUT_COST.shards} 💰${formatGold(GEM_CUT_COST.gold)}</small></div>
        ${curG ? `<button class="mini ghost" type="button" data-action="gem-unsocket" data-value="${curSlot}">${EQUIP[curSlot].name} 해제</button>` : `<span class="tiny dim">대상: ${EQUIP[curSlot].name}</span>`}
      </div>
      <div class="gem-socks">${sockCells}</div>
      <div class="gem-bag">${gemRows}</div>
      <div class="tiny dim" style="margin-top:6px">같은 보석 <b>3개 합성 → 상위 Lv(최대 Lv.5)</b> · 세공 시 20% 확률로 Lv.2 등장 · 환생 유지</div>
    </div>`;
  })();

  const themeCraftCard = (() => {
    const ownedIds = new Set(((s.gear && s.gear.items) || []).map((x) => x.id));
    const canH = s.shards >= THEME_CRAFT_COST.hero.shards && s.gold >= THEME_CRAFT_COST.hero.gold;
    const canL = s.shards >= THEME_CRAFT_COST.legend.shards && s.gold >= THEME_CRAFT_COST.legend.gold;
    const rows = GEAR_SETS.map((st) => {
      const legPool = GEAR_ITEMS.filter((it) => it.set === st.id && it.rarity === 'legend');
      const haveLeg = legPool.filter((it) => ownedIds.has(it.id)).length;
      return `<div class="craft-row">
        <div>
          <div class="tiny"><b style="color:${st.color}">${st.icon} ${esc(st.name)}</b> <span class="dim">전설 ${haveLeg}/${legPool.length}</span></div>
          <div class="tiny dim">${esc(st.desc || '')}</div>
        </div>
        <div class="row gap6">
          <button class="mini ${canH ? 'equip' : ''}" type="button" data-action="theme-craft" data-set="${st.id}" data-value="hero" ${canH ? '' : 'disabled'}>영웅</button>
          <button class="mini ${canL ? 'up' : ''}" type="button" data-action="theme-craft" data-set="${st.id}" data-value="legend" ${canL ? '' : 'disabled'}>전설</button>
        </div>
      </div>`;
    }).join('');
    return `
    <div class="card craft-card" id="themeCraftCard" data-fold="craft">
      <div class="card-head">
        <div class="card-title"><span class="t-ico">🔨</span>테마 장비 제작 공방<small>미보유 우선 확정</small></div>
        <span class="tiny dim">영웅 💎${THEME_CRAFT_COST.hero.shards} · 전설 💎${THEME_CRAFT_COST.legend.shards}</span>
      </div>
      <div class="tiny muted">원하는 테마의 영웅(💰${formatGold(THEME_CRAFT_COST.hero.gold)})·전설(💰${formatGold(THEME_CRAFT_COST.legend.gold)}) 장비를 확정 제작합니다.</div>
      <div class="craft-grid">${rows}</div>
    </div>`;
  })();

  const bar = gearSubBar(ui);
  if (sub === 'equip') return `${bar}${gearSlotCards(s)}${enhanceCard}${gemCard}${shardCard}${themeCraftCard}${gachaCard(ui)}${gearInventory(s)}${infoCard}`;
  if (sub === 'job') return `${bar}${jobCard(ui)}${rebirthCard(ui)}`;
  if (sub === 'collect') return `${bar}${relicCard(ui)}${titleCard(ui)}${petCard(ui)}${landTipCard}`;
  return `${bar}${gachaCard(ui)}${themeCraftCard}${gearSlotCards(s)}${gearInventory(s)}${enhanceCard}${gemCard}${infoCard}${shardCard}${jobCard(ui)}${rebirthCard(ui)}${relicCard(ui)}${titleCard(ui)}${petCard(ui)}${landTipCard}`;
}

/* ══════════════════════════ 부동산 (v6.5.0 운영·분석·시장 카드는 ui-land.js 로 분리) ══════════════════════════ */

/* ══════════════════════════ 📰 호재 뉴스 · 🗺️ 권역 세트 · 🏛️ 랜드마크 (v3.4) ══════════════════════════ */
const newsOwnText = (s, n) => {
  if (!n) return '';
  const owned = (s.land && s.land.owned) || {};
  let hit = 0;
  let pyeong = 0;
  for (const [key, qty] of Object.entries(owned)) {
    if (newsCovers(n, key)) { hit += 1; pyeong += Math.floor(Number(qty) || 0); }
  }
  return hit > 0 ? `내 지역 ${hit}곳 ${fmt(pyeong)}평 적용 중` : `${n.targetLabel} · 내 보유 지역은 해당 없음`;
};

/** 압축 뉴스용 짧은 내 지역 문구 — 대상 라벨과 겹치지 않게 */
function newsOwnShort(s, n) {
  if (!n) return '';
  const owned = (s.land && s.land.owned) || {};
  let hit = 0;
  for (const key of Object.keys(owned)) if (newsCovers(n, key)) hit++;
  return hit > 0 ? `내 지역 ${hit}곳 적용` : '내 지역 해당 없음';
}

/** 매물 투자·버프 탭 상단 한 줄 뉴스 — 카드형 뉴스의 압축판 */
function newsSlim(ui) {
  const n = activeNews(Date.now());
  if (!n) return '';
  return `
  <div class="news-slim">
    <div class="ns-top">
      <span class="news-live">●</span>
      <span class="ns-kicker">📰 부동산 호재</span>
      <span class="ns-title">${n.icon} ${esc(n.title)}</span>
      <span class="ns-clock" data-live="news-left">${mmss(n.endsAt - Date.now())}</span>
    </div>
    <div class="ns-fx">${esc(n.targetLabel)} · <span class="up">시세 ▲${n.pricePct}%</span> · <span class="up">임대 ▲${n.rentPct}%</span> · <span data-live="news-own">${esc(newsOwnShort(ui.s, n))}</span></div>
    <div class="prog news-prog" style="margin-top:4px;height:2px"><i data-live="news-prog" style="width:${Math.min(100, Math.max(0, ((Date.now() - n.startsAt) / Math.max(1, n.endsAt - n.startsAt)) * 100))}%"></i></div>
  </div>`;
}

/* ══════════════════ 🚨 침공 · 🗺️ 지도 · 🧭 파견 · 📈 대시보드 · 🎯 예약 · 🏰 성채 (v6.5.0: ui-land.js 분리) ══════════════════ */

/** 건물주 버프 탭 — 권역 세트 전체 현황 */
function regionSetCard(ui) {
  const sets = regionSetStatus(ui.s.land.owned);
  const active = sets.filter((st) => st.level > 0).length;
  const rows = sets
    .map((st) => {
      const on = st.level > 0;
      const need = st.nextNeed;
      const w = need ? Math.min(100, (st.held / need) * 100) : 100;
      const buffLine = on
        ? `${buffText(st.buffs)}${st.complete ? ` <b style="color:var(--gold)">· 완성 ${st.masterText}</b>` : st.nextNeed ? ` <span class="dim">· 다음 ${st.nextNeed}곳</span>` : ' <span class="dim">· 최대</span>'}`
        : `${st.nextNeed}곳 모으면 ${buffText(st.nextBuffs)}`;
      return `
      <div class="set-row ${on ? 'on' : ''}">
        <div class="set-ico" style="--sc:${st.color}">${st.icon}</div>
        <div class="set-mid">
          <div class="set-name">${esc(st.name)}<span class="set-cnt">${st.held}곳${need ? ` / ${need}곳` : ''}</span>${on ? `<span class="set-lv">Lv.${st.level}</span>` : ''}${st.complete ? '<span class="set-lv" style="color:var(--gold)">완성</span>' : ''}</div>
          <div class="prog tiny-prog" style="margin-top:4px"><i style="width:${w}%;background:linear-gradient(90deg,#2c6ea8,${st.color})"></i></div>
          <div class="set-buff">${buffLine}</div>
        </div>
      </div>`;
    })
    .join('');
  return `
  <div class="card set-card" data-fold="region-set">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🗺️</span>권역 세트<small>${active}/${sets.length} 발동</small></div>
      <span class="tiny dim">지역 시너지</span>
    </div>
    <div class="tiny muted">같은 권역 지역을 여러 곳 보유하면 단계별로 세트 버프가 열립니다. 세트 <b>임대수익</b>은 그 권역 매물에만 적용됩니다.</div>
    ${rows}
  </div>`;
}

/** 건물주 버프 탭 — 랜드마크 현황 */
function landmarkCard(ui) {
  const s = ui.s;
  const lms = landmarkSummary(s);
  const map = s.land.landmarks && typeof s.land.landmarks === 'object' ? s.land.landmarks : {};
  const rows = Object.keys(map)
    .filter((k) => CITY_BY_KEY[k] && Math.floor(Number(s.land.owned[k]) || 0) > 0)
    .sort((a, b) => Math.floor(Number(map[b]) || 0) - Math.floor(Number(map[a]) || 0))
    .map((k) => {
      const city = CITY_BY_KEY[k];
      const lv = landmarkLevel(s, k);
      const def = LANDMARK.levels[lv - 1] || LANDMARK.levels[0];
      const next = lv < LANDMARK.maxLevel ? LANDMARK.levels[lv] : null;
      const q = next ? landmarkQuote(s, k) : null;
      const cost = q && q.cost ? q.cost : (next ? Math.round(Math.floor(Number(s.land.owned[k]) || 0) * city.base * next.costMul) : 0);
      return `
      <div class="lm-row">
        <div class="lm-ico">${def.icon}</div>
        <div class="lm-mid">
          <div class="lm-name">${city.emoji} ${esc(city.name)}<span class="lm-lv">Lv.${lv} ${esc(def.name)}</span></div>
          <div class="lm-line">임대수익 +${def.rentPct}% · ${fmt(Math.floor(Number(s.land.owned[k]) || 0))}평</div>
        </div>
        ${next
          ? `<button class="mini up" type="button" data-action="landmark" data-value="${k}">💰${formatGold(cost)}</button>`
          : '<span class="tiny" style="color:var(--gold)">MAX</span>'}
      </div>`;
    })
    .join('');
  return `
  <div class="card lm-card" data-fold="landmark">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏛️</span>랜드마크<small>${lms.count}개 건설</small></div>
      <span class="tiny dim">Lv.1~3</span>
    </div>
    <div class="tiny muted">보유 <b>${LANDMARK.minPyeong}평 이상</b> 지역에 골드를 투자해 <b>상가 → 타워 → 메가 랜드마크</b>로 올립니다. 레벨마다 그 지역 임대수익이 <b>+30% / +70% / +120%</b>로 커집니다.</div>
    ${rows || '<div class="empty">아직 랜드마크가 없습니다.<br>내 부동산 → 보유 매물의 <b>🏛️ 랜드마크</b> 버튼에서 건설하세요.</div>'}
    ${(() => {
      const blk = planBulkLandmarks(s);
      return blk.ok
        ? `<button class="btn small primary block" style="margin-top:8px" type="button" data-action="land-bulk-lm">🏛️ 가능 랜드마크 일괄 증축 (${blk.count}곳 · 💰${formatGold(blk.totalSpend)})</button>`
        : '';
    })()}
    <div class="kv" style="margin-top:8px"><span class="k">랜드마크 보너스</span><span class="v" style="color:var(--green)">공격력 +${lms.atkPct}% · 골드 +${lms.goldPct}%</span></div>
    <div class="kv"><span class="k">누적 투자</span><span class="v">💰${formatGold(s.land.landmarkSpend || 0)}</span></div>
  </div>`;
}

/* ══════════════════════════ 🏢 부동산 서브 탭 (v4.3) ══════════════════════════
 * 사냥 탭(v3.9)과 같은 톤의 3분할. 상단 요약 바(보유 평수·시간당 임대·미수령 수익·일괄 수령)는
 * 모든 서브 탭 맨 위에 그대로 남겨 '돈이 쌓였는지'를 어디서든 바로 보게 한다.
 *  - home  : 보유 매물 · 권역 세트 요약 · 거래 기록(수령은 요약 바에서)
 *  - market: 229개 시군구 검색·필터·정렬 + 매수/매도
 *  - buff  : 건물주 버프 · 동료 펫 · 권역 세트 · 랜드마크
 */
const LAND_SUBS = [
  ['home', '🏠', '영지'],
  ['market', '🛒', '매물'],
  ['event', '🎪', '이벤트'],
];

/** 현재 서브 탭 키 — 알 수 없는 값이면 '영지'로 복구 (v7.x 저장값 'buff' 는 'event' 로) */
function landSubOf(ui) {
  const k = ui && ui.s && ui.s.land && ui.s.land.sub;
  if (k === 'buff') return 'event';
  return LAND_SUBS.some(([id]) => id === k) ? k : 'home';
}

/** 서브 탭 배지 — (내 부동산) 2분치 이상 쌓인 임대수익 · (버프) 지금 진화 가능한 펫 */
function landBadges(ui) {
  const s = ui.s;
  let rentReady = 0;
  try {
    const p = portfolioOf(s);
    const enough = Math.max(1, Math.floor((p.incomePerMin || 0) * 2)); // 2분치 이상 쌓였을 때만 점등
    rentReady = p.accruedRent >= enough ? 1 : 0;
  } catch (e) { /* ignore */ }
  const unlocked = s.pet && Array.isArray(s.pet.unlocked) ? s.pet.unlocked : [];
  const petReady = PETS.filter((d) => unlocked.includes(d.id) && petEvolveInfo(s, d.id).can).length;
  const expReady = expeditionStatus(s).readyCount;
  const bankReady = bankStatus(s).readyCount;
  return { home: rentReady + bankReady, market: 0, event: petReady + expReady };
}

/** 서브 탭 바 — 스크롤해도 위에 붙고, 받을 것이 있으면 배지가 켜진다 */
function landTabBar(ui) {
  const sub = landSubOf(ui);
  const b = landBadges(ui);
  return `<div class="subtabs hunt-subbar land-subbar" role="tablist" aria-label="부동산 서브 탭">${LAND_SUBS.map(
    ([k, ico, label]) => `
    <button class="subtab ${sub === k ? 'active' : ''}" type="button" role="tab" aria-selected="${sub === k}" data-action="land-sub" data-value="${k}">${ico} ${label}<i class="nb ${b[k] ? 'on' : ''}" data-lbadge="${k}">${b[k] > 9 ? '9+' : b[k] || ''}</i></button>`,
  ).join('')}</div>`;
}

/** 부동산 탭 최상단 요약 바 — 보유 평수 · 시간당 임대 · 미수령 수익 · 일괄 수령 */
function landSummaryBar(ui) {
  const p = portfolioOf(ui.s);
  const claimable = p.accruedRent >= 1;
  const buffs = (ui.app && ui.app.buffs) || computeBuffs(ui.s);
  const tot = landBuffTotals(buffs);
  const hasBuff = buffs.active || tot.atkPct || tot.goldPct || tot.critDmgPct || tot.cdrPct || tot.bossDmgPct || tot.expPct;
  const totLine = hasBuff
    ? `<div class="ls-tot"><span class="ls-tot-k">🏘️ 전투 버프</span><span class="ls-tot-v">${landBuffTotalsText(buffs)}</span></div>`
    : '<div class="ls-tot"><span class="ls-tot-k">🏘️ 전투 버프</span><span class="ls-tot-v dim">매물을 사면 사냥에 영구 버프가 붙습니다</span></div>';
  return `
  <div class="card land-sum${claimable ? ' ready' : ''}">
    <div class="ls-top">
      <span class="ls-asset" data-live="asset">💰${formatGold(p.totalAsset)}</span>
      <span class="ls-meta"><b>${p.cities}</b>곳 · <b>${fmt(p.pyeong)}</b>평</span>
    </div>
    <div class="ls-mid">
      <span class="ls-k">미수령</span>
      <b class="ls-v" data-live="rent">💰${fmt(Math.floor(p.accruedRent))}</b>
      <span class="ls-inc">시간 <b data-live="income">+💰${formatGold(p.incomePerHour)}/h</b></span>
      <button class="mini ghost ls-info" type="button" data-action="rent-info">내역</button>
      <button class="btn small ${claimable ? 'green' : 'ghost'} ls-claim" type="button" data-action="claim-rent" data-live-rent-btn data-label="💤 일괄 수령" data-empty="적립 중…" ${claimable ? '' : 'disabled'}>
        ${claimable ? '💤 일괄 수령' : '적립 중…'}
      </button>
    </div>
    ${totLine}
  </div>`;
}

/* ───────────── 🔨 급매 경매 (v4.6) ─────────────
 * 20분마다 한 건, 앞 12분이 입찰 시간. 입찰가는 시간이 지나면 시세 쪽으로 오른다.
 * 한 경매당 한 번만 낙찰할 수 있고, 낙찰가에는 거래세가 붙지 않는다.
 */
function auctionCard(ui) {
  const now = Date.now();
  const a = auctionStatus(ui.s, now);
  const live = a.live && !a.done;
  // 경매 중·낙찰 완료 → 이번 매물 / 준비 시간 → 다음 매물 예고
  const lot = live || a.done ? a.lot : auctionLot(now + Math.max(1000, a.nextMs + 1000));
  const c = lot.city;
  const affordable = ui.s.gold >= a.price;
  const phase = a.done ? 'done' : live ? 'live' : 'gap';
  const tag = live ? '<span class="tag hot">🔨 입찰 중</span>' : a.done ? '<span class="tag lm">✅ 낙찰</span>' : '<span class="tag">🕐 준비</span>';
  const timer = live
    ? `마감까지 <b data-live="auc-left">${mmss(a.leftMs)}</b>`
    : `다음 경매 <b data-live="auc-left">${mmss(a.nextMs)}</b>`;

  const lotRow = `
    <div class="auc-lot">
      <div class="auc-ico">${c.emoji}</div>
      <div class="auc-mid">
        <div class="auc-name">${esc(c.name)}<span class="auc-region">${esc(c.region)} · ${esc(c.tierLabel)}</span>${tag}</div>
        <div class="auc-line"><b>${fmt(lot.qty)}평</b> · 시세 💰${fmt(lot.marketValue)} · <span class="auc-off">최저 -${lot.discountPct}%</span></div>
        <div class="auc-bonus">${lot.bonusText}</div>
      </div>
    </div>`;

  let body = '';
  if (live) {
    body = `
    ${lotRow}
    <div class="prog auc-prog"><i data-live="auc-prog" style="width:${Math.round(a.progress * 100)}%"></i></div>
    <div class="auc-price">
      <span class="k">현재 입찰가</span>
      <b class="v" data-live="auc-price">💰${fmt(a.price)}</b>
      <span class="auc-disc" data-live="auc-disc">시세 -${a.discountPct}%</span>
    </div>
    <button class="btn small gold block auc-bid" type="button" data-action="auction-bid" data-live="auc-btn" ${affordable ? '' : 'disabled'}>🔨 지금 낙찰 · 💰${fmt(a.price)}</button>
    <div class="tiny dim" style="margin-top:5px">늦게 낙찰할수록 입찰가가 시세 쪽으로 오릅니다 · 1건당 1회 낙찰 · 거래세 없음</div>`;
  } else if (a.done) {
    const last = a.log[0];
    body = `
    ${lotRow}
    <div class="auc-done">✅ 이번 경매 낙찰 완료${last ? ` · 💰${fmt(last.price)} (시세 -${Math.round((1 - last.price / Math.max(1, last.market)) * 100)}%)` : ''}</div>
    <div class="tiny dim" style="margin-top:5px">다음 매물은 새 경매가 열릴 때 공개됩니다.</div>`;
  } else {
    body = `
    <div class="auc-next">🔔 다음 매물 예고</div>
    ${lotRow}
    <div class="tiny dim" style="margin-top:5px">경매는 매 20분, 앞 12분만 열립니다. 골드를 모아 두세요.</div>`;
  }

  const saved = a.totals.saved;
  return `
  <div class="card auc-card ${phase}" id="auctionCard">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🔨</span>급매 경매<small>20분마다 · 거래세 없음</small></div>
      <span class="tiny ${live ? 'auc-live' : 'dim'}">${timer}</span>
    </div>
    ${body}
    <div class="auc-foot">
      <span class="tiny dim">낙찰 ${fmt(a.totals.bids)}건 · 아낀 골드 💰${formatGold(saved)}</span>
      <button class="mini ghost" type="button" data-action="auction-info">내역</button>
    </div>
  </div>`;
}

/* ───────────── 🏛️ 부동산 전투 시너지 카드 (v4.6) ───────────── */
function landSynergyCard(ui) {
  const buffs = (ui.app && ui.app.buffs) || computeBuffs(ui.s);
  const syn = buffs.syn || landSynergy(ui.s);
  const lm = syn.landmark;
  const rg = syn.region;
  const step = nextLandmarkStep(ui.s);
  const tot = landBuffTotals(buffs);
  const row = (icon, label, val, next, unit = '%', sign = '+', nextText = '랜드마크 레벨 +1') => `
    <div class="syn-row">
      <span class="syn-k">${icon} ${label}</span>
      <b class="syn-v">${sign}${val}${unit}</b>
      <span class="syn-n">${next > 0 ? `${nextText} → ${sign}${next}${unit}` : '상한'}</span>
    </div>`;
  const sets = regionSetStatus(ui.s.land.owned);
  const done = sets.filter((st) => st.complete);
  const closest = sets
    .filter((st) => !st.complete)
    .sort((a, b) => (b.held / Math.max(1, b.maxNeed)) - (a.held / Math.max(1, a.maxNeed)))
    .slice(0, 2);
  return `
  <div class="card syn-card" id="synergyCard" data-fold="synergy">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏛️</span>부동산 전투 시너지<small>랜드마크 · 권역 완성</small></div>
      <span class="tiny" style="color:${syn.active ? 'var(--green)' : 'var(--dim)'};white-space:nowrap">${syn.active ? `🏛️ ${lm.count}개 · 완성 ${rg.count}/${rg.total}` : '미적용'}</span>
    </div>
    <div class="tiny muted">랜드마크 레벨 합계 <b>${lm.levels}</b>${lm.mega > 0 ? ` (메가 ${lm.mega}개)` : ''} → 치명타 피해 · 쿨감 · 보스 피해. Lv.3 <b>메가 랜드마크</b> 1개당 경험치 +${LAND_SYNERGY.mega.expPct}%. 권역을 최대 단계까지 채우면 권역별 시너지가 열립니다.</div>
    ${row('💥', '치명타 피해', tot.critDmgPct, step.critDmgPct)}
    ${row('⏱️', '스킬 쿨감', tot.cdrPct, step.cdrPct, '%', '-')}
    ${row('👹', '보스 피해', tot.bossDmgPct, step.bossDmgPct)}
    ${row('📈', '경험치 획득', tot.expPct, step.expPct, '%', '+', '메가 랜드마크 +1')}
    <div class="syn-set">
      <div class="syn-set-h">🗺️ 권역 완성 <b>${rg.count}/${rg.total}</b></div>
      ${done.length
        ? `<div class="syn-chips">${done.map((st) => `<span class="syn-chip" style="--sc:${st.color}">${st.icon} ${esc(st.name)} · ${st.masterText}</span>`).join('')}</div>`
        : '<div class="tiny dim">아직 완성한 권역이 없습니다.</div>'}
      ${closest.length
        ? `<div class="tiny dim" style="margin-top:5px">${closest.map((st) => `${st.name} ${st.held}/${st.maxNeed}곳 → 완성 시 ${st.masterText}`).join('<br>')}</div>`
        : ''}
    </div>
    <button class="btn small ghost block" style="margin-top:8px" type="button" data-action="land-sub" data-value="market">🛒 매물·랜드마크 더 사러 가기</button>
  </div>`;
}

function tplLand(ui) {
  const sub = landSubOf(ui);
  const body = sub === 'market' ? tplLandMarketTab(ui) : sub === 'event' ? tplLandEvent(ui) : tplLandHome(ui);
  // v8.0.0: 어느 서브 탭이든 한 줄 압축 뉴스(카드형 118px 고정 크롬 제거)
  const news = newsSlim(ui);
  return `${landSummaryBar(ui)}${landTabBar(ui)}${news}${body}`;
}

/* ───────────── 🏠 영지 (v8.0.0) ─────────────
 * 첫 화면 고정 크롬(요약 111 + 서브탭 41 + 호재 카드 118 + 필터 칩 24 = 294px)을 없애고
 * 지도 + 접힘 카드 5장으로 정리했다. 보유 매물 목록은 '매물' 탭으로 옮겨 영지 첫 화면을 2~3화면으로 줄인다.
 */
function tplLandHome(ui) {
  return `${regionMapCard(ui)}
  ${investDashboardCard(ui)}
  ${regionSetCard(ui)}
  ${landmarkCard(ui)}
  ${landSynergyCard(ui)}
  ${landBuffDetailCard(ui)}
  ${expeditionCard(ui)}`;
}

/* ───────────── 🛒 매물 — 보유 매물 + 전국 시장 ───────────── */
function tplLandMarketTab(ui) {
  return `${holdingsCard(ui)}${tplLandMarket(ui)}`;
}

/* ───────────── 🎪 이벤트 — 경매·지정가·은행·성채·메가·거래 기록 ───────────── */
function tplLandEvent(ui) {
  return `${auctionCard(ui)}${limitOrdersCard(ui)}${bankCard(ui)}${citadelCard(ui)}${megaProjectCard(ui)}${tradeRecordCard(ui)}`;
}

function holdingsCard(ui) {
  const s = ui.s;
  const p = portfolioOf(s);
  // 보유 매물이 많을 때 세로 스크롤이 길어지지 않게 6곳부터 접어 둔다(펼치기 토글)
  const LIMIT = 6;
  const open = !!ui.landHoldAll;
  const rows = open ? p.holdings : p.holdings.slice(0, LIMIT);

  const holdings = rows.length
    ? rows
        .map((h) => {
          const payback = h.incomePerHour > 0 ? h.value / h.incomePerHour : 0;
          const lm = h.landmark || 0;
          const canLm = h.qty >= LANDMARK.minPyeong || lm > 0;
          const lmBtn = canLm
            ? `<button class="lm-chip ${lm ? 'on' : ''}" type="button" data-action="landmark" data-value="${h.city.key}">${lm ? `${LANDMARK.levels[lm - 1].icon} Lv.${lm}` : '🏛️ 랜드마크'}</button>`
            : '';
          const newsTag = h.news ? '<span class="tag hot">📈 호재</span>' : '';
          const boomTag = h.boomPct > 0 ? `<span class="tag boom">🎉 호황 +${h.boomPct}%</span>` : '';
          const leaseTag = h.leasePct > 0 ? `<span class="tag lease">🏷️ 임대 +${h.leasePct}%</span>` : '';
          const mulTag = h.rentMul > 1.001 ? `<span class="up">임대 ×${h.rentMul.toFixed(2)}</span>` : '';
          const fav = isFavoriteCity(s, h.city.key);
          const pnlTag = h.profitPct != null
            ? `<span class="pnl ${h.profitPct >= 0 ? 'up' : 'dn'}">${h.profitPct >= 0 ? '+' : ''}${h.profitPct.toFixed(1)}%</span>`
            : '';
          const bandPct = Math.round((h.bandPos != null ? h.bandPos : 0.5) * 100);
          return `<div class="hold${h.news ? ' hot' : ''}">
            <div class="h-ico">${h.city.emoji}</div>
            <div class="h-mid">
              <div class="h-name"><button class="fav-btn${fav ? ' on' : ''}" type="button" data-action="land-fav" data-value="${h.city.key}" aria-label="관심 매물">${fav ? '★' : '☆'}</button>${esc(h.city.name)}<span class="h-region">${esc(h.city.region)}</span>${traitBadge(h.city.trait)}${newsTag}${boomTag}${lmBtn}${leaseTag}</div>
              <div class="h-line"><b>${fmt(h.qty)}평</b><span class="dim"> · 평가 💰${formatGold(h.value)}</span>${pnlTag ? ` ${pnlTag}` : ''}${mulTag ? ` · ${mulTag}` : ''}</div>
              <div class="h-line dim">시간 +💰${formatGold(h.incomePerHour)} · 회수 ${paybackText(payback)} · ${trendHtml(h.trend)} <span class="band-pill ${h.bandLabel === '저점' ? 'lo' : h.bandLabel === '고점' ? 'hi' : ''}">${esc(h.bandLabel || '보통')} ${bandPct}%</span></div>
            </div>
            <div class="m-btns">
              <button class="mini buy" data-action="land-trade" data-value="${h.city.key}" data-side="buy">매수</button>
              <button class="mini sell" data-action="land-trade" data-value="${h.city.key}" data-side="sell">매도</button>
              <button class="mini ord" type="button" data-action="land-order-open" data-value="${h.city.key}" data-side="sell" aria-label="지정가 예약">🎯</button>
            </div>
          </div>`;
        })
        .join('')
    : `<div class="empty">아직 보유한 매물이 없습니다.<br>
         <button class="btn small blue" style="margin-top:8px" data-action="land-sub" data-value="market">매물 투자 하러 가기</button>
       </div>`;

  const more = p.holdings.length > LIMIT
    ? `<button class="btn small ghost block" style="margin-top:8px" type="button" data-action="land-hold-all">${open ? `접기 (상위 ${LIMIT}곳만)` : `전체 ${p.holdings.length}곳 보기`}</button>`
    : '';

  return `
  <div class="card hold-card">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">🏘️</span>보유 매물<small>${p.cities}곳 · ${fmt(p.pyeong)}평</small></div>
      <span class="tiny dim">시간 +💰${formatGold(p.incomePerHour)}</span>
    </div>
    ${holdings}
    ${more}
    ${(() => {
      const unlocked = landManagerUnlocked(s);
      const on = unlocked && !!(s.land && s.land.autoRent);
      return `<div class="land-mgr">
        <span class="tiny">🤖 <b>영지 관리인</b> <span class="dim">${unlocked ? '접속 중 5분마다 임대 자동 수령' : `보유 ${LAND_MANAGER.minCities}곳 달성 시 해금 (${p.cities}/${LAND_MANAGER.minCities})`}</span></span>
        <button class="switch sm ${on ? 'on' : ''}" type="button" data-action="toggle-auto-rent" aria-label="임대 자동 수령 전환" ${unlocked ? '' : 'disabled'}></button>
      </div>`;
    })()}
    <div class="row gap6" style="margin-top:9px">
      <button class="btn small ghost wide" type="button" data-action="land-sub" data-value="market">🛒 매물 투자</button>
      <button class="btn small ghost wide" type="button" data-action="land-sub" data-value="home">🏠 영지 지도</button>
    </div>
  </div>`;
}

function tradeRecordCard(ui) {
  const s = ui.s;
  const p = portfolioOf(s);
  const buffs = computeBuffs(s);
  return `
  <div class="card land-rec" data-fold="trade-rec">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">📋</span>거래 기록<small>거래세 ${(LAND.feeRate * 100).toFixed(1)}%</small></div>
      <span class="tiny" style="color:${buffs.active ? 'var(--green)' : 'var(--dim)'}">${buffs.active ? '건물주 버프 적용 중' : '버프 없음'}</span>
    </div>
    <div class="stat-grid four">
      <div class="stat"><div class="k">거래</div><div class="v">${fmt(p.land.tradeCount || 0)}<small>회</small></div></div>
      <div class="stat"><div class="k">누적 거래세</div><div class="v">${formatGold(p.land.taxPaid || 0)}</div></div>
      <div class="stat gold"><div class="k">누적 임대</div><div class="v">${formatGold(p.land.totalRentClaimed || 0)}</div></div>
      <div class="stat"><div class="k">최고 자산</div><div class="v">${formatGold(Math.max(p.land.bestAsset || 0, p.totalAsset))}</div></div>
    </div>
    <div class="tiny dim" style="margin-top:7px">임대수익은 접속 중 <b>100%</b> · 앱을 닫아둔 동안은 <b>${Math.round(LAND.rentOfflineRate * 100)}%</b>(최대 ${LAND.rentCapHours}시간) 적립 — 요약 바의 <b>일괄 수령</b>으로 받습니다.</div>
    ${(() => {
    const auc = (s.land && s.land.auction) || {};
    const bids = Math.max(0, Math.floor(Number(auc.bids) || 0));
    if (!bids) return '';
    return `<div class="kv" style="margin-top:7px"><span class="k">🔨 급매 경매 낙찰</span><span class="v">${bids}건 · 아낀 골드 💰${formatGold(Math.max(0, Number(auc.saved) || 0))}</span></div>`;
  })()}
  </div>`;
}

/* ───────────── 🛒 매물 투자 (v6.5.0: buildMarketList / tplLandMarket 는 ui-land.js 로 분리) ───────────── */

/* ───────────── ⚡ 건물주 버프 · 세트 · 펫 ───────────── */
/** ⚡ 건물주 버프 상세 — 영지 접힘 카드 1장 (합계는 영지 요약 바 1곳에서만) */
function landBuffDetailCard(ui) {
  const s = ui.s;
  const buffs = computeBuffs(s);
  const pr = buffProgress(s);
  const rows = [
    ['⚔️ 공격력', buffs.atkPct, pr.atk],
    ['💰 골드 획득', buffs.goldPct, pr.gold],
    ['❤️ 최대 체력', buffs.hpPct, pr.hp],
    ['🎯 치명타', buffs.critPct, pr.crit],
    ['💎 드롭률', buffs.dropPct, pr.drop],
  ]
    .map(
      ([label, val, p]) => `
      <div class="buff-row">
        <div class="buff-head"><b>${label}</b><span>+${Number(val).toFixed(1)}%</span></div>
        <div class="prog" style="margin-top:4px"><i style="width:${p.pct * 100}%"></i></div>
        <div class="buff-next">${esc(p.next)}</div>
      </div>`,
    )
    .join('');
  const atkAll = buffs.atkPct + (buffs.setAtkPct || 0) + (buffs.landmarkAtkPct || 0);
  const goldAll = Math.round((buffs.goldPct + (buffs.setGoldPct || 0) + (buffs.landmarkGoldPct || 0)) * 10) / 10;
  return `
  <div class="card buff-card" data-fold="buff-detail">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">⚡</span>건물주 버프<small>영구 패시브</small></div>
      <span class="tiny" style="color:${buffs.active ? 'var(--green)' : 'var(--dim)'}">${buffs.active ? `${buffs.buildings}곳 · 공격 +${atkAll}% · 골드 +${goldAll}%` : '미적용'}</span>
    </div>
    ${rows}
    <div class="tiny dim" style="margin-top:6px">매물을 사면 즉시 붙고, 팔면 그만큼 줄어듭니다. 매물 평가 ${formatGold(buffs.landValue)} · 권역 세트 ${buffs.setCount || 0}/${buffs.setTotal || 7} · 랜드마크 ${buffs.landmarkCount || 0}개</div>
    <button class="btn small blue block" style="margin-top:9px" type="button" data-action="land-sub" data-value="market">🛒 매물 더 사러 가기</button>
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

/* ══════════════════════════ ☁️ 클라우드 · 🏆 랭킹 (v5.0 모듈화: ui-cloud.js) ══════════════════════════ */

function tplSettings(ui) {
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

  // 정보 카드: '내 기록' + '앱 정보'를 1장으로 통합(기본 3줄, 나머지는 접힘)
  const infoCard = `
  <div class="card info-card" data-fold="info">
    <div class="card-head">
      <div class="card-title"><span class="t-ico">📊</span>내 기록 · 앱 정보<small>v${APP_VERSION}</small></div>
      <span class="tiny dim">Lv.${s.level} · S${Math.max(s.peakStage || 1, s.maxStage || 1)} · ♾️${rb.count}회</span>
    </div>
    <div class="kv"><span class="k">최고 스테이지</span><span class="v">S${s.peakStage || s.maxStage} · 이번 회차 S${s.maxStage}</span></div>
    <div class="kv"><span class="k">플레이 시간</span><span class="v">${mins < 60 ? `${mins}분` : `${Math.floor(mins / 60)}시간 ${mins % 60}분`}</span></div>
    <div class="kv"><span class="k">총자산</span><span class="v">💰${formatGold(p.totalAsset)}</span></div>
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
    <div class="row gap6" style="margin-top:9px">
      <button class="btn small ghost wide" type="button" data-action="open-codex" data-value="monster">📖 도감 열기</button>
      <button class="btn small ghost wide" type="button" data-action="open-achievements">🏆 업적 ${achClaimed}/${ACHIEVEMENTS.length}${achReady ? ' ⚡' : ''}</button>
    </div>
    <div class="note" style="margin-top:9px">
      방치 보상은 최대 <b>${ECON.offlineCapHours}시간</b>까지 정산됩니다. 화면을 닫아도 자동으로 저장됩니다.
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
    <div class="tiny dim" style="margin-top:7px">복원은 <b>레벨·최고 스테이지·보유 지역·환생</b>을 미리 보여 주고 확인 뒤에만 실행합니다. 잘못된 코드는 거부되고 기존 세이브는 그대로 남습니다.</div>
  </div>

  <div class="card">
    <div class="card-head"><div class="card-title"><span class="t-ico">⚙️</span>게임 설정</div><span class="tiny dim">v${APP_VERSION}</span></div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">자동 보스 전환</span>
      <button class="switch ${s.autoBoss ? 'on' : ''}" data-action="toggle-auto"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">스킬 자동 시전 <span class="dim">4종 · 터치 시전은 항상</span></span>
      <button class="switch ${s.autoSkill !== false ? 'on' : ''}" data-action="toggle-auto-skill" aria-label="스킬 자동 시전 전환"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">궁극기 자동 발동 <span class="dim">🐉 상위 전직</span></span>
      <button class="switch ${s.autoUlt !== false ? 'on' : ''}" data-action="toggle-auto-ult" aria-label="궁극기 자동 발동 전환"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">화면 이펙트</span>
      <button class="switch ${s.effects ? 'on' : ''}" data-action="toggle-effects"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">화면 흔들림 <span class="dim">타격감</span></span>
      <button class="switch ${s.screenShake !== false ? 'on' : ''}" data-action="toggle-shake" aria-label="화면 흔들림 전환"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">데미지 숫자 표시 <span class="dim">K/M/B 축약</span></span>
      <button class="switch ${s.dmgNumbers !== false ? 'on' : ''}" data-action="toggle-dmg-numbers" aria-label="데미지 숫자 표시 전환"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">효과음 <span class="dim">타격·코인·보스·뽑기</span></span>
      <button class="switch ${s.soundOn !== false ? 'on' : ''}" data-action="toggle-sound" aria-label="효과음 전환"></button>
    </div>
    <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <span class="tiny">저장 방식</span>
      <span class="tiny" style="color:var(--gold)">이 기기에 자동 저장 (로그인 없음)</span>
    </div>
    <div class="row gap6" style="margin-top:9px">
      <button class="btn small ghost wide" type="button" data-action="guide-jump" data-value="gear:job">✨ 전직·환생</button>
      <button class="btn small ghost wide" type="button" data-action="open-achievements">🏆 업적</button>
    </div>
    <button class="btn small block" style="margin-top:8px;color:#ffb3b3;border-color:rgba(255,107,107,0.3)" data-action="reset">게임 초기화</button>
  </div>

  ${installCard(ui)}

  ${infoCard}`;
}
