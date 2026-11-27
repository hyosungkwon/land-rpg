// land-rpg / src/combat.js
// 자동 전투 시뮬레이션. DOM·Canvas 의존 없음 → 헤드리스 검증 가능.
// 렌더러는 이 객체의 엔티티를 읽고, UI는 events 큐를 소비한다.
import {
  ECON, SKILLS, DEFAULT_SKILL_DECK, skillRuneOf, stageDef, monsterKo, monsterMotion, monsterAttack, THEMES, ultimateOf, ultLeftMs,
  ELITE_TRAITS, ELITE_CHANCE, TREASURE_GOBLIN, stageGoldBase, RARITIES,
} from './data.js';
import {
  calcStats, currentHp, skillEffect, killReward, registerKill, clearStage, monsterStats, skillCdOf, normalizeSkillDeck,
} from './state.js';
import {
  DUNGEON, PET_ATTACK_MS, SUB_PET_ATTACK_MS, SUB_PET_RATE,
  equippedPet, subPet, petDmgPct, dungeonReward, petEvo, petSkillOf, petPassive, petGoldPct,
  effectiveBattleSpeed,
} from './meta.js';
import { TOWER_RULES, TOWER_MAX_FLOOR, towerFloor, towerStageDef, towerHas, towerReward, towerCleared, towerState, towerUnlocked, towerLockReason } from './tower.js';
import { INVASION, invasionStatus, recordInvasionWin } from './invasion.js';
import { RIFT, RIFT_MONSTERS, RIFT_BOSSES, RIFT_CARD_BY_ID, riftStatus, rollRiftChoices, riftCardMods, settleRiftReward } from './rift.js';
import { relicEffects } from './relics.js';
import { DAILY, dailyBossFor, dailyInfo, consumeDailyAttempt, dailyReward, recordDailyRun, recordWeeklyBoss, dailyDpsCap } from './daily.js';
import { codexMeet, codexKill, trackDailyQuest } from './quests.js';
import { tryGearDrop, acquireGear, rollDropRarityIdx, randomItemOfRarity } from './gear.js';

const ATTACK_STOP_GAP = 380; // 보스가 멈추고 때리는 거리(캐릭터 스프라이트가 겹치지 않는 간격)
/* ── v3.8 다굴 슬롯 ──────────────────────────────────────────────
 * 몬스터는 '줄'이 아니라 캐릭터 앞쪽 부채꼴 슬롯을 하나씩 차지한다.
 *  - dx   : 플레이어 x 로부터의 거리(월드). 근접은 사거리(playerRange) 안쪽,
 *           원거리는 뒤쪽에서 투사체를 쏜다.
 *  - lane : 앞뒤 레인(-1 뒤 · 0 가운데 · 1 앞). 렌더러가 y 오프셋·깊이 스케일로 그린다.
 * 여러 마리가 각자 슬롯에 붙어 동시에 공격 → 실제로 다굴 피해가 누적된다.
 */
const MELEE_SLOTS = [
  { dx: 265, lane: 0 },
  { dx: 445, lane: -1 },
  { dx: 335, lane: 1 },
  { dx: 530, lane: 0 },
  { dx: 395, lane: 1 },
  { dx: 485, lane: -1 },
  { dx: 300, lane: -1 },
  { dx: 465, lane: 1 },
  { dx: 575, lane: -1 },
  { dx: 560, lane: 1 },
];
const RANGED_SLOTS = [
  { dx: 615, lane: -1 },
  { dx: 695, lane: 0 },
  { dx: 580, lane: 1 },
  { dx: 735, lane: 1 },
  { dx: 655, lane: 0 },
  { dx: 625, lane: -1 },
  { dx: 755, lane: -1 },
  { dx: 710, lane: 1 },
  { dx: 665, lane: -1 },
  { dx: 645, lane: 1 },
];
const LANE_DEPTH = 25; // v7.1.0: 2.5D 원근감 확장을 위한 레인 깊이(px)
const SLOT_TOL = 26; // 슬롯 도착 판정(월드)
const WALK_SPEED = 205; // 몬스터 이동 속도(월드/초) — 6마리가 빠르게 채워진다
// v3.7 모션: 공격 '전조(windup)' 시간. 피해 판정 시점(monsterAttackMs 간격)은 그대로 두고
// 전조만 그 직전에 시작해 밸런스(DPS·클리어 시간·헤드리스 시뮬)를 건드리지 않는다.
const WINDUP_MELEE_MS = 300;
const WINDUP_RANGED_MS = 470;
const WINDUP_BOSS_EXTRA_MS = 90;
const HEAVY_EVERY = 3; // 보스는 3번째 공격마다 강공격 모션(피해량은 동일)
const DPS_WINDOW_MS = 5000; // 실시간 DPS(초당 공격력) 슬라이딩 윈도우(5초)
const METER_WINDOW_MS = 15000; // v7.8.0 실시간 딜 비중 · GPM/SPM 슬라이딩 윈도우(15초)
export const DPS_BUCKETS = [
  { key: 'normal', label: '평타', icon: '⚔️', color: '#e2e8f0' },
  { key: 'skill', label: '스킬', icon: '💥', color: '#ff8a4d' },
  { key: 'pet', label: '펫', icon: '🐾', color: '#5ee1a3' },
  { key: 'dot', label: '연쇄/탭', icon: '⚡', color: '#6fd3ff' },
  { key: 'ult', label: '궁극기', icon: '🐉', color: '#c084fc' },
];
// v7.7.0 피버 타임 & 캔버스 탭 번개 일격 상수
export const FEVER = {
  max: 100,
  durationMs: 15000,
  spdMul: 0.8,
  critAdd: 0.15,
  goldBonus: 0.3,
  hitGain: 3,
  killGain: 6,
  tapGain: 5,
  tapCdMs: 350,
  tapDmgMul: 0.65,
};

/** 몬스터 공격 전조 길이(ms) */
function windupFor(m) {
  const a = monsterAttack(m.name);
  return (a.kind === 'ranged' ? WINDUP_RANGED_MS : WINDUP_MELEE_MS) + (m.isBoss ? WINDUP_BOSS_EXTRA_MS : 0);
}

export class Battle {
  constructor(state, getBuffs, rng = Math.random, startAt = Date.now()) {
    this.s = state;
    this.getBuffs = getBuffs || (() => ({}));
    this.rng = rng;
    this.events = [];
    this.monsters = [];
    this.nextId = 1;
    this.stats = calcStats(state, this.getBuffs());
    this.player = {
      x: ECON.playerX,
      hp: Math.max(1, Math.round(currentHp(state, this.stats))),
      shield: 0,        // v5.10 성광 보호막 잔량
      shieldUntil: 0,
      dead: false,
      reviveAt: 0,
      attackAnim: 0,
      attackAt: 0,      // 마지막 공격 시작 시각(렌더러가 프레임 전환에 사용)
      attackKind: 'normal',
      attackSeq: 0,     // v8.7.0 4단 콤보 액션 패턴 순환 카운터(시각 전용)
      targetX: ECON.playerX + 260,
      targetLane: 0,
      skillAt: 0,       // 마지막 스킬 발동 시각
      skillKey: '',
      hurtAt: 0,
      lastAttack: 0,
      born: Date.now(),
    };
    this.boss = null;
    this.bossEnds = 0;
    this.bossReadyAt = 0;
    this.berserkUntil = 0;
    this.berserkRune = null; // v5.10 광폭 룬('fury' | 'iron' | null)
    this.blessUntil = 0;     // v5.10 축복의 빛(+22% 공격)
    this.blessAtk = 0;
    this.aegisUntil = 0;     // v8.4.0 불굴의 방벽 피해 감소 지속 시각
    this.aegisReduce = 0;
    this.thornsUntil = 0;    // v8.8.0 반사 방벽 룬 공격력 보너스 지속 시각
    this.thornsAtk = 0;
    // v4.7 상위 전직 궁극기 — 발동 뒤 한동안 공격력 버프 · 직전 타격 총 피해(이벤트 표시용)
    this.ultUntil = 0;
    this.ultBonus = 0;
    this.lastHitDealt = 0;
    // v4.8.1 실시간 DPS 추적(최근 5초간 입힌 실제 피해 슬라이딩 윈도우) · v7.8.0 딜 비중/수익 미터기
    this.dmgLog = [];
    this.dpsStartAt = 0;
    this.meterLog = [];
    this.gainLog = [];
    this.meterStartAt = 0;
    this.lastSpawn = 0;
    this.lastRegen = 0;
    this.lastStatsAt = 0;
    this.time = 0;
    // v3.2: 동행 펫 애니메이션 시각 · v5.3 보조 펫 동행 · 황금 던전(보스 러시) 상태
    this.petLast = 0;
    this.petAnimAt = 0;
    this.subPetLast = 0;
    this.subPetAnimAt = 0;
    this.petSkillAt = 0; // v4.2 펫 액티브 스킬 마지막 발동
    this.petGoldUntil = 0; // v4.2 '황금비' 골드 2배 종료 시각
    this.dungeon = null;
    // v4.2 🗼 도전의 탑 상태(진행 중일 때만 객체)
    this.tower = null;
    // v4.5 🌟 일일 보스 상태(30초 타임어택 진행 중일 때만 객체)
    this.daily = null;
    // v5.11 🚨 영지 침공 방어전 상태
    this.invasion = null;
    // v6.7 🌀 무한 균열 로그라이크 상태
    this.rift = null;
    // v6.1 🔥 불사조의 깃털 즉시 부활 쿨타임
    this.phoenixAt = 0;
    // v7.7.0 🔥 피버 게이지 · 피버 타임 · 캔버스 탭 번개 일격
    this.fever = 0;
    this.feverUntil = 0;
    this.lastTapAt = 0;
    // v8.10.0 ⚡ 보스 강공격 타이밍 반격 카운터 가드
    this.counterGuardUntil = 0;
    this.syncStage();
    this.spawnInitial(startAt);
  }

  /** 장착된 동행 펫 정의(없으면 null) */
  activePet() {
    return equippedPet(this.s);
  }

  /** v5.3 장착된 보조 펫 정의(없거나 미해금이면 null) */
  subPet() {
    return subPet(this.s);
  }

  /** v5.3 적용 전투 배속 — 랭킹 공정성을 위해 일일 보스는 항상 ×1 */
  speed() {
    if (this.daily) return 1;
    return effectiveBattleSpeed(this.s);
  }

  /** 황금 던전 진행 중인가 */
  inDungeon() {
    return !!this.dungeon;
  }

  /** 🗼 도전의 탑 진행 중인가 */
  inTower() {
    return !!this.tower;
  }

  /** 🌟 일일 보스 진행 중인가 */
  inDaily() {
    return !!this.daily;
  }

  /** 🚨 영지 침공 방어전 진행 중인가 */
  inInvasion() {
    return !!this.invasion;
  }

  inRift() {
    return !!this.rift;
  }

  riftMods() {
    return this.rift ? riftCardMods(this.rift.cards) : null;
  }

  invasionLeft(now = Date.now()) {
    return this.invasion ? Math.max(0, this.invasion.ends - now) : 0;
  }

  /** 일일 보스 남은 시간(ms) */
  dailyLeft(now = Date.now()) {
    return this.daily ? Math.max(0, this.daily.ends - now) : 0;
  }

  /** 도전의 탑 남은 시간(ms) */
  towerLeft(now = Date.now()) {
    return this.tower ? Math.max(0, this.tower.ends - now) : 0;
  }

  /** 던전 남은 시간(ms) */
  dungeonLeft(now = Date.now()) {
    return this.dungeon ? Math.max(0, this.dungeon.ends - now) : 0;
  }

  get def() {
    return this._def;
  }

  syncStage() {
    // v4.2: 탑에 입장해 있으면 그 층의 테마·몬스터 구성을 쓴다(배경·HUD 가 함께 바뀐다)
    if (this.tower) {
      this._def = towerStageDef(this.tower.n) || stageDef(this.s.stage);
      return;
    }
    this._def = stageDef(this.s.stage);
  }

  buffs() {
    return this.getBuffs() || {};
  }

  refreshStats(now = Date.now()) {
    const before = this.stats ? this.stats.hpMax : null;
    this.stats = calcStats(this.s, this.buffs());
    if (before !== null && this.player.hp > this.stats.hpMax) this.player.hp = this.stats.hpMax;
    if (before !== null && this.stats.hpMax > before) this.player.hp += this.stats.hpMax - before;
    this.lastStatsAt = now;
  }

  emit(ev) {
    this.events.push(ev);
    if (this.events.length > 240) this.events.shift();
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /* ───────────── 스폰 ───────────── */
  makeMonster(name, isBoss, now) {
    const def = stageDef(this.s.stage);
    const atkDef = monsterAttack(name);
    const variant = 0.9 + this.rng() * 0.2;
    const base = monsterStats(this.s.stage, isBoss, variant);
    const scale = isBoss ? 1.5 : 0.92 + this.rng() * 0.22;
    // 📖 도감: 마주친 몬스터를 기록(해금은 만남만으로)
    try { codexMeet(this.s, name); } catch (e) { /* ignore */ }
    return {
      id: this.nextId++,
      name,
      ko: monsterKo(name),
      isBoss: !!isBoss,
      x: isBoss ? ECON.spawnX + 40 : ECON.spawnX + this.rng() * 70,
      y: 0,
      hp: Math.round(base.hp),
      maxHp: Math.round(base.hp),
      atk: Math.max(1, Math.round(base.atk)),
      scale,
      lastAttack: now,
      hitAt: 0,
      knock: 0,      // 피격 넉백(월드 단위)
      lungeAt: 0,    // 캐릭터를 향해 돌진한 시각
      dying: 0,
      dead: false,
      born: now,
      animSeed: this.rng() * Math.PI * 2,
      // v3.8 다굴: 차지할 슬롯(전투가 매 틱 갱신) · 앞뒤 레인
      slotX: ECON.spawnX,
      lane: 0,
      // v3.7 모션 상태 — 렌더러가 읽어 이동/공격/피격을 그린다
      arch: monsterMotion(name),
      atkKind: atkDef.kind,
      moveKind: atkDef.move,
      projKind: atkDef.proj || null,
      atkColor: atkDef.color,
      walk: 0,          // 이동 누적 거리(월드) — 걸음/도약 위상
      moving: false,
      windupAt: 0,      // 전조 시작 시각
      windupDur: 0,
      windupBase: 0,
      windupHeavy: false,
      strikeAt: 0,      // 실제 타격 시각
      attackSeq: 0,
    };
  }

  spawnInitial(now) {
    const n = 2;
    for (let i = 0; i < n; i++) this.spawnNormal(now - (n - i) * 350, false);
    this.lastSpawn = now;
  }

  spawnNormal(now, allowSpecial = true) {
    if (this.boss) return;
    if (this.monsters.filter((m) => !m.dead && !m.dying).length >= ECON.maxMonsters) return;
    // v5.7: 일반 사냥 중 확률적으로 💰 보물 고블린 또는 엘리트 변종 등장 (+ v6.1 황금 자석 유물)
    const inField = allowSpecial && !this.tower && !this.daily && !this.dungeon && !this.invasion && !this.rift && this.s.totalKills > 0;
    const rel = relicEffects(this.s);
    if (
      inField
      && this.s.stage >= TREASURE_GOBLIN.minStage
      && !this.monsters.some((x) => x.treasure && !x.dead && !x.dying)
      && this.rng() < TREASURE_GOBLIN.chance * (rel.goblinChanceMul || 1)
    ) {
      const tg = this.makeMonster(TREASURE_GOBLIN.name, false, now);
      tg.treasure = true;
      tg.gold = true;
      tg.hp = Math.max(1, Math.round(tg.maxHp * TREASURE_GOBLIN.hpMul));
      tg.maxHp = tg.hp;
      tg.atk = 1;
      tg.scale = 1.08;
      tg.fleeAt = now + TREASURE_GOBLIN.durationMs + (rel.goblinExtraMs || 0);
      this.monsters.push(tg);
      this.emit({ t: 'treasureSpawn', id: tg.id, ko: tg.ko, durationMs: TREASURE_GOBLIN.durationMs });
      return;
    }
    const normals = this._def.normals;
    // 스테이지마다 처치 수 기준으로 몬스터 종류를 돌려가며 등장
    const pick = normals[(this.s.totalKills + this.monsters.length) % normals.length];
    const m = this.makeMonster(pick, false, now);
    if (inField && this.s.stage >= 3 && this.rng() < ELITE_CHANCE) {
      const trait = ELITE_TRAITS[Math.floor(this.rng() * ELITE_TRAITS.length) % ELITE_TRAITS.length];
      m.elite = trait;
      m.maxHp = Math.max(1, Math.round(m.maxHp * trait.hpMul));
      m.hp = m.maxHp;
      m.atk = Math.max(1, Math.round(m.atk * trait.atkMul));
      m.scale = Math.round(m.scale * 1.22 * 100) / 100;
      if (trait.speedMul) m.attackGap = Math.max(600, Math.round(ECON.monsterAttackMs / trait.speedMul));
      this.emit({ t: 'eliteSpawn', id: m.id, ko: m.ko, trait: trait.name, icon: trait.icon, color: trait.color });
    }
    this.monsters.push(m);
  }

  /* ───────────── 틱 ───────────── */
  tick(dtMs, now = Date.now()) {
    // dt 가 NaN/음수/거대값이어도 전투가 깨지지 않게 방어한다(모바일 rAF 타임스탬프 이상 대응)
    const raw = Number(dtMs);
    const dt = Number.isFinite(raw) ? Math.min(250, Math.max(0, raw)) : 16;
    if (!Number.isFinite(now)) now = Date.now();
    this.time += dt;
    if (now - this.lastStatsAt > 500) this.refreshStats(now);

    if (this.player.dead) {
      if (now >= this.player.reviveAt) {
        this.player.dead = false;
        this.player.hp = Math.round(this.stats.hpMax * 0.5);
        // v3.8: 부활 직후 잠깐의 가호 — 흩어진 무리가 다시 몰리기 전에 숨을 돌린다
        this.player.graceUntil = now + ECON.reviveGraceMs;
        this.emit({ t: 'revive', graceMs: ECON.reviveGraceMs, reducePct: Math.round((1 - ECON.reviveGraceReduce) * 100) });
        this.spawnInitial(now);
      }
      return;
    }

    // v6.7 🌀 무한 균열 축복 카드 선택 대기 중에는 전투 일시정지
    if (this.rift && this.rift.picking) return;

    const spd = this.speed();
    const dtEff = dt * spd;
    this.regen(dtEff);
    this.autoSkills(now);
    this.updateMonsters(dtEff, now, spd);
    this.attack(now, spd);
    this.petAttack(now, spd);
    this.subPetAttack(now, spd);
    this.petSkillTick(now);
    if (this.daily) {
      this.dailyTick(now);
      return;
    }
    if (this.dungeon) {
      this.dungeonTick(now);
      return;
    }
    if (this.tower) {
      this.towerTick(now);
      return;
    }
    if (this.invasion) {
      this.invasionTick(now);
      return;
    }
    if (this.rift) {
      this.riftTick(now);
      return;
    }
    this.maybeSpawn(now);
    this.bossLogic(now);
  }

  regen(dt) {
    // v3.8: 자연 회복량은 스탯(기본 1.2%/s + 환생 '생명' 특성)에서 온다.
    const perSec = this.stats.hpMax * (this.stats.hpRegen || 0.012);
    if (this.player.hp < this.stats.hpMax) {
      this.player.hp = Math.min(this.stats.hpMax, this.player.hp + (perSec * dt) / 1000);
    }
  }

  /* ───────────── 다굴: 슬롯 배정 ─────────────
   * 살아 있는 몬스터를 도착 순서대로 근접/원거리 슬롯에 배정한다.
   *  - 근접: 캐릭터 앞 부채꼴(앞뒤 레인 포함)을 차지하고 동시에 달려든다.
   *  - 원거리: 뒤쪽 슬롯에서 투사체를 쏜다. 근접이 모두 쓰러지면 앞으로 나온다.
   */
  assignSlots() {
    const p = this.player;
    const alive = this.monsters
      .filter((m) => !m.dead && !m.dying)
      .sort((a, b) => (a.born || 0) - (b.born || 0) || a.id - b.id);
    let meleeCount = 0;
    for (const m of alive) if (!m.isBoss && m.atkKind !== 'ranged') meleeCount += 1;
    let mi = 0;
    let ri = 0;
    for (const m of alive) {
      if (m.isBoss) {
        m.slotX = p.x + ATTACK_STOP_GAP;
        m.lane = 0;
        continue;
      }
      const ranged = m.atkKind === 'ranged';
      const table = ranged && meleeCount > 0 ? RANGED_SLOTS : MELEE_SLOTS;
      const i = ranged ? ri++ : mi++;
      const slot = table[i % table.length];
      m.slotX = p.x + slot.dx;
      m.lane = slot.lane;
      m.slotRanged = ranged && meleeCount > 0;
    }
    return alive;
  }

  updateMonsters(dt, now, spd = 1) {
    const p = this.player;
    const alive = this.assignSlots();
    for (const m of alive) {
      if (m.treasure && m.fleeAt && now >= m.fleeAt) {
        m.dead = true;
        this.emit({ t: 'treasureFlee', id: m.id, ko: m.ko });
        continue;
      }
      if (m.elite && m.elite.regenPct > 0 && m.hp > 0 && m.hp < m.maxHp) {
        m.hp = Math.min(m.maxHp, m.hp + (m.maxHp * m.elite.regenPct * dt) / 1000);
      }
      // v5.10 화염 회오리 화상 도트 (0.5초마다 적용)
      if (m.burnUntil && now < m.burnUntil && m.burnDps > 0 && now - (m.burnTick || 0) >= 500) {
        m.burnTick = now;
        const bDmg = Math.max(1, Math.round(m.burnDps * 0.5));
        m.hp -= bDmg;
        m.hitAt = now;
        if (this.dungeon) this.dungeon.dmg += bDmg;
        if (this.tower) this.tower.dmg += bDmg;
        if (this.daily) { this.daily.dmg += bDmg; this.daily.hits = (this.daily.hits || 0) + 1; }
        this.recordDamage(bDmg, now, 'dot', false);
        this.emit({ t: 'hit', id: m.id, dmg: bDmg, crit: false, x: m.x, isBoss: m.isBoss, kind: 'burn' });
        if (m.hp <= 0) { this.killMonster(m, now); continue; }
      }
      const slowed = !!(m.slowUntil && now < m.slowUntil);
      const slowMove = slowed ? (m.slowMoveMul || 0.7) : 1;
      const slowAtk = slowed ? (m.slowAtkMul || 1.35) : 1;
      if (!Number.isFinite(m.x)) m.x = ECON.spawnX;
      if (!Number.isFinite(m.hp)) m.hp = m.maxHp;
      if (!Number.isFinite(m.slotX)) m.slotX = p.x + ATTACK_STOP_GAP;
      const standX = m.slotX;
      const dist = Math.abs(m.x - standX);
      const walking = dist > SLOT_TOL;

      if (walking) {
        const speed = (m.isBoss ? 132 : WALK_SPEED + (m.scale - 1) * 60) * slowMove; // 월드단위/초
        const prevX = m.x;
        const step = (speed * dt) / 1000;
        m.x = m.x > standX ? Math.max(standX, m.x - step) : Math.min(standX, m.x + step);
        // 걸음/도약 위상 — 실제로 이동한 거리만 쌓아 정지하면 모션이 멈추게 한다
        m.walk = (Number.isFinite(m.walk) ? m.walk : 0) + Math.abs(m.x - prevX);
        m.moving = true;
        if (!m.windupBase) m.windupBase = windupFor(m);
        const eta = (Math.abs(m.x - standX) / (speed * Math.max(1, spd))) * 1000;
        // 도착 직전 마지막 걸음에서 전조를 시작한다 → 타격은 도착 순간.
        // 타격 예정 시각(도착 또는 공격 간격 도달)에 맞춰 시작해 전조가 너무 길게 남지 않게 한다.
        const dueW = (Number.isFinite(m.lastAttack) ? m.lastAttack : now) + ((m.attackGap || ECON.monsterAttackMs) * slowAtk) / Math.max(1, spd);
        const strikeAt = Math.max(now + eta, dueW);
        if (!m.windupAt && strikeAt - now <= m.windupBase + 60) {
          m.windupAt = now;
          m.windupDur = m.windupBase;
          m.windupHeavy = false;
          this.emit({
            t: 'monsterWindup', id: m.id, ko: m.ko, x: m.x, isBoss: m.isBoss,
            kind: m.atkKind, move: m.moveKind, proj: m.projKind, color: m.atkColor,
            dur: m.windupBase, heavy: false,
          });
        } else if (m.windupAt && strikeAt - now > m.windupBase + 160) {
          m.windupAt = 0; // 늦어지면 전조 취소
        }
      } else {
        m.moving = false;
        if (!m.windupBase) m.windupBase = windupFor(m);
        const gap = ((m.attackGap || ECON.monsterAttackMs) * slowAtk) / Math.max(1, spd);
        const heavy = !!m.isBoss && (m.attackSeq || 0) % HEAVY_EVERY === HEAVY_EVERY - 1;
        const wuTotal = (m.windupBase + (heavy ? 170 : 0)) / Math.max(1, spd);
        const due = (Number.isFinite(m.lastAttack) ? m.lastAttack : now) + gap;
        // 1) 전조: 타격 시점 직전부터 움츠리며(원거리는 기를 모으며) 예고한다
        if (!m.windupAt && now >= due - wuTotal) {
          m.windupAt = now;
          m.windupDur = wuTotal;
          m.windupHeavy = heavy;
          m.heavy = heavy;
          m.countered = false;
          this.emit({
            t: 'monsterWindup', id: m.id, ko: m.ko, x: m.x, isBoss: m.isBoss,
            kind: m.atkKind, move: m.moveKind, proj: m.projKind, color: m.atkColor,
            dur: wuTotal, heavy,
          });
        }
        // 2) 타격: 슬롯에 붙은 몬스터끼리 각자 1500ms 간격으로 때린다 → 다굴
        // 전조가 시작됐다면 반드시 전조를 마친 뒤에 때린다(슬롯 이동으로 전조가 늦게 시작된 경우 보정)
        const windupDone = !m.windupAt || now - m.windupAt >= wuTotal;
        if (now - m.lastAttack > gap && windupDone) {
          m.lastAttack = now;
          m.lunge = 1;
          m.lungeAt = now;
          m.strikeAt = now;
          m.windupAt = 0;
          m.attackSeq = (m.attackSeq || 0) + 1;
          const heavyNow = !!m.windupHeavy;
          m.windupHeavy = false;
          m.heavy = false;
          this.emit({
            t: 'monsterAttack', id: m.id, ko: m.ko, x: m.x, isBoss: m.isBoss,
            kind: m.atkKind, move: m.moveKind, proj: m.projKind, color: m.atkColor, heavy: heavyNow,
          });
          const raw = m.atk * (0.88 + this.rng() * 0.24);
          this.damagePlayer(raw, m, now, {
            ranged: m.atkKind === 'ranged', move: m.moveKind, proj: m.projKind,
            color: m.atkColor, heavy: heavyNow,
          });
        }
      }
    }
    for (const m of this.monsters) {
      if (m.dead || m.dying) continue;
      if (m.knock > 0) m.knock = Math.max(0, m.knock - (dt / 1000) * 90);
      if (m.lunge) m.lunge = Math.max(0, m.lunge - dt / 220);
    }
    for (const m of this.monsters) {
      if (m.dying && now - m.dying > 450) m.dead = true;
    }
    this.monsters = this.monsters.filter((m) => !m.dead);
  }

  damagePlayer(raw, from, now, info) {
    if (this.player.dead) return;
    // v3.8: 방어(피해 감소) 스탯 — 갑옷·투구 강화 + 환생 '수호' 특성 + v5.10 불굴 룬 + v8.4.0 불굴의 방벽
    const ironAdd = this.berserkUntil > now && this.berserkRune === 'iron' ? 0.18 : 0;
    const aegisAdd = this.aegisUntil > now ? (this.aegisReduce || 0.20) : 0;
    const rm = this.riftMods();
    const riftRed = rm ? rm.dmgRedPct / 100 : 0;
    const reduce = Math.max(0, Math.min(0.95, (this.stats.dmgReduce || 0) + ironAdd + aegisAdd + riftRed));
    const grace = this.player.graceUntil && now < this.player.graceUntil ? ECON.reviveGraceReduce : 1;
    const counterMul = this.counterGuardUntil > now ? 0.5 : 1;
    const shockMul = from && from.shockUntil > now ? (from.shockMul || 0.8) : 1;
    let dmg = Math.max(1, Math.round(raw * shockMul * (1 - reduce) * grace * counterMul));
    // v5.10 성광 보호막 우선 흡수
    if (this.player.shield > 0 && this.player.shieldUntil > now) {
      const absorbed = Math.min(this.player.shield, dmg);
      this.player.shield -= absorbed;
      dmg -= absorbed;
      if (this.player.shield <= 0) this.player.shieldUntil = 0;
    } else if (this.player.shield > 0) {
      this.player.shield = 0;
      this.player.shieldUntil = 0;
    }
    this.player.hp -= dmg;
    this.player.hurtAt = now;
    this.emit({ t: 'playerHurt', dmg, from: from.ko, reduce: Math.round(reduce * 100), ...(info || {}) });
    if (this.player.hp <= 0) {
      // v6.1 🔥 불사조의 깃털 유물 — 치명상 시 쿨타임마다 즉시 부활 + 4초 보호막
      const rel = relicEffects(this.s);
      if (rel.phoenixCdMs > 0 && (!this.phoenixAt || now - this.phoenixAt >= rel.phoenixCdMs)) {
        this.phoenixAt = now;
        this.player.hp = Math.max(1, Math.round(this.stats.hpMax * rel.phoenixHpRatio));
        this.player.shield = Math.round(this.stats.hpMax * 0.25);
        this.player.shieldUntil = now + 4000;
        this.emit({ t: 'phoenixRevive', hp: this.player.hp });
        return;
      }
      this.player.hp = 0;
      this.player.dead = true;
      this.player.reviveAt = now + ECON.reviveMs;
      this.emit({ t: 'playerDeath' });
      if (this.boss) this.failBoss(now, 'dead');
      if (this.daily) this.endDailyBoss(now, 'dead'); // 쓰러져도 그때까지의 피해로 보상
      else if (this.dungeon) this.endDungeon(now); // 쓰러지면 던전 종료(그때까지의 보상 지급)
      else if (this.tower) this.endTower(now, 'dead'); // 탑에서 쓰러지면 패배 — 잃는 것 없이 복귀
      else if (this.invasion) this.endInvasion(now, 'dead'); // 침공 방어 실패 — 부동산 피해 없이 복귀
      else if (this.rift) this.endRift(now, 'dead'); // 균열 종료 — 도달 웨이브 보상 지급 후 복귀
      // v3.8: 쓰러지면 몰려든 무리가 흩어진다 — 부활 직후 바로 다시 눌리는 일 없이 숨을 돌린다
      else this.scatterMonsters(now);
    }
  }

  /** 쓰러진 뒤 무리 흩어짐(보상 없음) — 부활하면 다시 소수부터 몰려온다 */
  scatterMonsters(now) {
    for (const m of this.monsters) {
      if (m.dead || m.isBoss) continue;
      m.windupAt = 0;
      m.moving = false;
      m.dying = now;
      m.hp = 0;
    }
    this.lastSpawn = now;
  }

  /* ───────────── v7.7.0 피버 타임 & 캔버스 탭 일격 ───────────── */
  isFever(now = Date.now()) {
    return (this.feverUntil || 0) > now;
  }

  addFever(amount, now = Date.now()) {
    if (this.isFever(now) || !(amount > 0)) return;
    this.fever = Math.min(FEVER.max, (this.fever || 0) + amount);
    if (this.fever >= FEVER.max) {
      this.fever = 0;
      this.feverUntil = now + FEVER.durationMs;
      this.emit({ t: 'feverStart', until: this.feverUntil, durationMs: FEVER.durationMs });
    }
  }

  tapStrike(worldX, now = Date.now()) {
    if (this.player.dead || (this.rift && this.rift.picking)) return { ok: false, reason: 'busy' };
    if (now - (this.lastTapAt || 0) < FEVER.tapCdMs) return { ok: false, reason: 'cooldown' };
    const list = this.targets();
    if (!list.length) return { ok: false, reason: 'no_target' };
    let target = list[0];
    if (Number.isFinite(worldX)) {
      let best = Math.abs(target.x - worldX);
      for (const m of list) {
        const d = Math.abs(m.x - worldX);
        if (d < best) { best = d; target = m; }
      }
    }
    this.lastTapAt = now;
    // v8.10.0 ⚡ 보스 강공격 전조 중 캔버스 탭 → 퍼펙트 반격 카운터!
    const heavyBoss = list.find((m) => m.isBoss && (m.windupHeavy || m.heavy) && m.windupAt > 0 && !m.countered);
    if (heavyBoss) {
      heavyBoss.countered = true;
      heavyBoss.windupHeavy = false;
      heavyBoss.heavy = false;
      heavyBoss.windupAt = 0;
      heavyBoss.lastAttack = now; // 강공격 저지(1사이클 지연)
      this.counterGuardUntil = now + 2200;
      this.hit([heavyBoss], 2.2, 'tap', now, { critAdd: 0.99 });
      this.addFever(18, now);
      this.emit({ t: 'tapCounter', id: heavyBoss.id, ko: heavyBoss.ko, x: heavyBoss.x, dmg: this.lastHitDealt });
      return { ok: true, counter: true, id: heavyBoss.id, x: heavyBoss.x, dmg: this.lastHitDealt, fever: this.fever, feverActive: this.isFever(now) };
    }
    this.hit([target], FEVER.tapDmgMul, 'tap', now);
    this.addFever(FEVER.tapGain, now);
    this.emit({ t: 'tapStrike', x: target.x, dmg: this.lastHitDealt });
    return { ok: true, counter: false, id: target.id, x: target.x, dmg: this.lastHitDealt, fever: this.fever, feverActive: this.isFever(now) };
  }

  /* ───────────── 공격 ───────────── */
  attack(now, spd = 1) {
    const furyMul = this.berserkUntil > now && this.berserkRune === 'fury' ? 0.80 : 1;
    const feverSpd = this.isFever(now) ? FEVER.spdMul : 1;
    if (now - this.player.lastAttack < (this.stats.attackMs * furyMul * feverSpd) / Math.max(1, spd)) return;
    const target = this.targets().find((m) => m.x - this.player.x <= ECON.playerRange);
    if (!target) return;
    this.player.lastAttack = now;
    this.player.attackAnim = 1;
    this.player.attackAt = now;
    this.player.attackKind = 'normal';
    this.player.attackSeq = (this.player.attackSeq || 0) + 1;
    this.player.targetX = target.x;
    this.player.targetLane = target.lane || 0;
    this.hit([target], 1, 'normal', now);
  }

  targets() {
    return this.monsters.filter((m) => !m.dead && !m.dying).sort((a, b) => a.x - b.x);
  }

  roll(rawMul, now, extra = null) {
    let dmg = this.stats.atk * rawMul * (0.9 + this.rng() * 0.2);
    if (this.berserkUntil > now) dmg *= 1 + skillEffect('berserk', this.s.skills.berserk.lv);
    if (this.blessUntil > now && this.blessAtk > 0) dmg *= 1 + this.blessAtk;
    if (this.thornsUntil > now && this.thornsAtk > 0) dmg *= 1 + this.thornsAtk;
    // v4.7 궁극기 발동 직후의 공격력 버프
    if (this.ultUntil > now) dmg *= 1 + (this.ultBonus || 0);
    let crit = false;
    const feverCrit = this.isFever(now) ? FEVER.critAdd : 0;
    const critChance = Math.min(0.95, this.stats.crit + feverCrit + (extra && extra.critAdd ? extra.critAdd : 0));
    const furyCd = this.berserkUntil > now && this.berserkRune === 'fury' ? 0.35 : 0;
    if (this.rng() < critChance) {
      crit = true;
      dmg *= this.stats.critDmg + furyCd;
    }
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  }

  hit(list, mul, kind, now, extra = null) {
    let hits = 0;
    let dealt = 0;
    let critHits = 0;
    let mainDealt = 0;
    let chainDealt = 0;
    this.lastHitDealt = 0;
    const rm = this.riftMods();
    for (const m of list) {
      if (m.dead || m.dying) continue;
      const hitExtra = rm && (rm.critPct || rm.critDmgPct)
        ? { ...(extra || {}), critAdd: (extra && extra.critAdd ? extra.critAdd : 0) + rm.critPct / 100 }
        : extra;
      const { dmg: rawDmg, crit } = this.roll(mul, now, hitExtra);
      // v4.0 장비 옵션: 보스 추가 피해 · 범위 베기 피해 · v5.10 처형 룬 · v6.7 균열 축복
      let dmg = rawDmg;
      if (rm && rm.atkPct > 0) dmg = Math.round(dmg * (1 + rm.atkPct / 100));
      if (crit && rm && rm.critDmgPct > 0) dmg = Math.round(dmg * (1 + rm.critDmgPct / 200));
      if (rm && rm.execPct > 0 && (m.isBoss || m.hp <= m.maxHp * 0.4)) dmg = Math.round(dmg * (1 + rm.execPct / 100));
      const bossAdd = (this.stats.bossDmgPct || 0) + (extra && extra.bossAdd ? extra.bossAdd : 0);
      if (m.isBoss && bossAdd > 0) dmg = Math.round(dmg * (1 + bossAdd));
      if (kind === 'whirl' && this.stats.whirlDmgPct > 0) dmg = Math.round(dmg * (1 + this.stats.whirlDmgPct));
      // v4.2 도전의 탑 '철벽 진형' — 주는 피해가 45% 깎인다 · v5.7 철갑 엘리트 25% 경감
      if (this.tower && towerHas(this.tower.floor, 'guard')) dmg = Math.max(1, Math.round(dmg * (1 - TOWER_RULES.guardReduce)));
      if (m.elite && m.elite.dmgReduce) dmg = Math.max(1, Math.round(dmg * (1 - m.elite.dmgReduce)));
      m.hp -= dmg;
      m.hitAt = now;
      m.knock = Math.min(30, (m.knock || 0) + (crit ? 18 : 10));
      // v8.10.0 보스 HP 50% 이하 → 광폭화 페이즈 돌입 연출
      if (m.isBoss && !m.enraged && m.hp > 0 && m.hp <= m.maxHp * 0.5) {
        m.enraged = true;
        m.enragedAt = now;
        this.emit({ t: 'bossEnrage', id: m.id, ko: m.ko, x: m.x, color: m.atkColor || '#ff4d4d' });
      }
      if (this.dungeon) this.dungeon.dmg += dmg;
      if (this.tower) this.tower.dmg += dmg;
      if (this.daily) { this.daily.dmg += dmg; this.daily.hits = (this.daily.hits || 0) + 1; }
      dealt += dmg;
      mainDealt += dmg;
      if (crit) critHits++;
      hits++;
      // v6.7 🌩️ 균열 번개 연쇄 — 주변 모든 생존 몬스터에 추가 피해
      if (rm && rm.chainPct > 0 && kind !== 'chain') {
        const cDmg = Math.max(1, Math.round(dmg * (rm.chainPct / 100)));
        for (const o of this.monsters) {
          if (o === m || o.dead || o.dying) continue;
          o.hp -= cDmg;
          o.hitAt = now;
          dealt += cDmg;
          chainDealt += cDmg;
          this.emit({ t: 'hit', id: o.id, dmg: cDmg, crit: false, x: o.x, isBoss: o.isBoss, kind: 'chain' });
          if (o.hp <= 0) this.killMonster(o, now);
        }
      }
      // v6.1/v8.8.0 ⏳ 시간의 모래시계 유물 — 치명타 적중 시 현재 장착 덱(4슬롯 전체) 쿨타임 단축
      if (crit) {
        const trim = relicEffects(this.s).critCdTrimMs || 0;
        if (trim > 0 && this.s && this.s.skills) {
          for (const k of this.activeDeck()) {
            if (this.s.skills[k] && this.s.skills[k].last > 0) this.s.skills[k].last = Math.max(0, this.s.skills[k].last - trim);
          }
        }
      }
      this.emit({ t: 'hit', id: m.id, dmg, crit, x: m.x, isBoss: m.isBoss, kind });
      if (m.hp <= 0) this.killMonster(m, now);
    }
    // v4.0 장비 옵션 + v5.10 룬 흡혈 — 입힌 피해의 일부를 되찾는다
    const ironLs = this.berserkUntil > now && this.berserkRune === 'iron' ? 0.08 : 0;
    const riftLs = rm ? rm.leechPct / 100 : 0;
    const totalLs = (this.stats.lifesteal || 0) + ironLs + riftLs + (extra && extra.lifesteal ? extra.lifesteal : 0);
    if (dealt > 0 && totalLs > 0 && !this.player.dead) {
      const heal = Math.round(dealt * totalLs);
      if (heal > 0 && this.player.hp < this.stats.hpMax) {
        this.player.hp = Math.min(this.stats.hpMax, this.player.hp + heal);
        this.emit({ t: 'lifesteal', heal });
      }
    }
    this.lastHitDealt = dealt;
    if (hits > 0 && kind !== 'chain' && kind !== 'tap') this.addFever(FEVER.hitGain * Math.min(3, hits), now);
    const srcBucket = kind === 'ultimate' ? 'ult' : kind === 'normal' ? 'normal' : (kind === 'chain' || kind === 'burn' || kind === 'tap') ? 'dot' : 'skill';
    if (mainDealt > 0) this.recordDamage(mainDealt, now, srcBucket, critHits > 0, hits, critHits);
    if (chainDealt > 0) this.recordDamage(chainDealt, now, 'dot', false, 1, 0);
    return hits;
  }

  /** v4.8.1 실시간 DPS · v7.8.0 딜 비중/치명타율 집계 기록 */
  recordDamage(dmg, now = Date.now(), src = 'normal', crit = false, hitCount = 1, critCount = null) {
    const v = Number(dmg);
    if (!(v > 0) || !Number.isFinite(v)) return;
    if (!Array.isArray(this.dmgLog)) this.dmgLog = [];
    const cutoff = now - DPS_WINDOW_MS;
    while (this.dmgLog.length && this.dmgLog[0].t < cutoff) this.dmgLog.shift();
    if (!this.dmgLog.length) this.dpsStartAt = now;
    this.dmgLog.push({ t: now, d: v });
    // v7.8.0 15초 딜 비중·치명률 미터기 로그
    if (!Array.isArray(this.meterLog)) this.meterLog = [];
    const mCut = now - METER_WINDOW_MS;
    while (this.meterLog.length && this.meterLog[0].t < mCut) this.meterLog.shift();
    if (!this.meterStartAt) this.meterStartAt = now;
    const hc = Math.max(1, Math.floor(Number(hitCount) || 1));
    const cc = critCount !== null ? Math.max(0, Math.min(hc, Math.floor(Number(critCount) || 0))) : (crit ? hc : 0);
    this.meterLog.push({ t: now, d: v, src: src || 'normal', h: hc, c: cc });
  }

  /** v7.8.0 실시간 분당 골드/강화석(GPM/SPM) 집계용 획득 기록 */
  recordGain(gold = 0, shards = 0, now = Date.now()) {
    const g = Math.max(0, Number(gold) || 0);
    const sh = Math.max(0, Number(shards) || 0);
    if (!(g > 0 || sh > 0)) return;
    if (!Array.isArray(this.gainLog)) this.gainLog = [];
    const cut = now - METER_WINDOW_MS;
    while (this.gainLog.length && this.gainLog[0].t < cut) this.gainLog.shift();
    if (!this.meterStartAt) this.meterStartAt = now;
    this.gainLog.push({ t: now, g, sh });
  }

  /** v7.8.0 실시간 DPS 미터기 초기화(장비/룬 교체 후 벤치마크용) */
  resetMeter(now = Date.now()) {
    this.dmgLog = [];
    this.dpsStartAt = 0;
    this.meterLog = [];
    this.gainLog = [];
    this.meterStartAt = now;
  }

  /** v7.8.0 최근 15초 딜 비중 · 실측 치명률 · 분당 골드/강화석(GPM/SPM) 스냅샷 */
  dpsBreakdown(now = Date.now()) {
    const cut = now - METER_WINDOW_MS;
    if (!Array.isArray(this.meterLog)) this.meterLog = [];
    if (!Array.isArray(this.gainLog)) this.gainLog = [];
    while (this.meterLog.length && this.meterLog[0].t < cut) this.meterLog.shift();
    while (this.gainLog.length && this.gainLog[0].t < cut) this.gainLog.shift();
    const sums = { normal: 0, skill: 0, pet: 0, dot: 0, ult: 0 };
    let totalDmg = 0;
    let totalHits = 0;
    let totalCrits = 0;
    for (const e of this.meterLog) {
      const k = Object.prototype.hasOwnProperty.call(sums, e.src) ? e.src : 'normal';
      sums[k] += e.d;
      totalDmg += e.d;
      totalHits += e.h || 1;
      totalCrits += e.c || 0;
    }
    let gSum = 0;
    let shSum = 0;
    for (const g of this.gainLog) { gSum += g.g; shSum += g.sh; }
    const earliest = Math.min(
      this.meterLog.length ? this.meterLog[0].t : now,
      this.gainLog.length ? this.gainLog[0].t : now,
    );
    const baseAt = this.meterStartAt ? Math.max(cut, Math.min(this.meterStartAt, earliest)) : earliest;
    const spanSec = Math.max(1, Math.min(METER_WINDOW_MS / 1000, (now - baseAt) / 1000));
    const parts = DPS_BUCKETS.map((b) => ({
      ...b,
      dmg: sums[b.key],
      pct: totalDmg > 0 ? Math.round((sums[b.key] / totalDmg) * 100) : 0,
    })).sort((a, b) => b.dmg - a.dmg);
    return {
      dps: totalDmg / spanSec,
      totalDmg,
      spanSec,
      critRate: totalHits > 0 ? Math.round((totalCrits / totalHits) * 100) : 0,
      gpm: Math.round((gSum / spanSec) * 60),
      spm: Math.round((shSum / spanSec) * 60),
      parts,
    };
  }

  /** 현재 활성 공격 버프(광폭·축복·궁극기)가 반영된 기본 이론 DPS */
  effectiveDps(now = Date.now()) {
    let dps = this.stats ? Number(this.stats.dps) || 0 : 0;
    if (this.berserkUntil > now && this.s && this.s.skills && this.s.skills.berserk) {
      dps *= 1 + skillEffect('berserk', this.s.skills.berserk.lv);
      if (this.berserkRune === 'fury') dps *= 1.25;
    }
    if (this.blessUntil > now && this.blessAtk > 0) dps *= 1 + this.blessAtk;
    if (this.thornsUntil > now && this.thornsAtk > 0) dps *= 1 + this.thornsAtk;
    if (this.ultUntil > now && this.ultBonus > 0) {
      dps *= 1 + this.ultBonus;
    }
    if (this.isFever(now)) dps *= 1.25;
    return Math.max(0, dps);
  }

  /** 최근 5초간 실제 입힌 피해(스킬·치명타·펫·버프 포함) 기준 실시간 DPS */
  liveDps(now = Date.now()) {
    if (!Array.isArray(this.dmgLog) || !this.dmgLog.length) {
      this.dpsStartAt = 0;
      return 0;
    }
    const cutoff = now - DPS_WINDOW_MS;
    while (this.dmgLog.length && this.dmgLog[0].t < cutoff) this.dmgLog.shift();
    if (!this.dmgLog.length) {
      this.dpsStartAt = 0;
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < this.dmgLog.length; i++) sum += this.dmgLog[i].d;
    const baseAt = this.dpsStartAt || this.dmgLog[0].t;
    const spanMs = Math.min(DPS_WINDOW_MS, Math.max(1000, now - baseAt));
    return sum / (spanMs / 1000);
  }

  killMonster(m, now) {
    m.hp = 0;
    m.dying = now;
    m.windupAt = 0;
    m.moving = false;
    this.addFever(FEVER.killGain, now);
    // 📖 도감: 처치 수 기록(던전 몹 포함) · v4.9 일일 퀘스트 처치 누적
    try { codexKill(this.s, m.name); } catch (e) { /* ignore */ }
    try { trackDailyQuest(this.s, 'kills', 1, now); } catch (e) { /* ignore */ }
    // v4.5 🌟 일일 보스: 보스가 쓰러지면(이론상) 그 자리에서 종료 — 남은 시간은 버린다.
    if (this.daily) {
      this.emit({
        t: 'monsterDeath', id: m.id, name: m.name, ko: m.ko, isBoss: m.isBoss, x: m.x,
        gold: 0, exp: 0, shards: 0, levelUps: 0, daily: true,
      });
      this.endDailyBoss(now, 'kill');
      return;
    }
    // 황금 던전: 보상은 종료 시 한 번에 지급하고, 여기서는 처치 수만 센다.
    if (this.dungeon) {
      if (m.isBoss) this.dungeon.bossKills += 1;
      else this.dungeon.kills += 1;
      this.dungeon.monsters += 1;
      this.emit({
        t: 'monsterDeath', id: m.id, name: m.name, ko: m.ko, isBoss: m.isBoss, x: m.x,
        gold: 0, exp: 0, shards: m.isBoss ? 1 : 0, levelUps: 0, dungeon: true,
      });
      return;
    }
    // v4.2 도전의 탑: 처치 수만 세고, 보상은 층 클리어 때 한 번에 지급한다.
    if (this.tower) {
      if (m.isBoss) this.tower.bossKills += 1;
      else this.tower.kills += 1;
      this.emit({
        t: 'monsterDeath', id: m.id, name: m.name, ko: m.ko, isBoss: m.isBoss, x: m.x,
        gold: 0, exp: 0, shards: 0, levelUps: 0, tower: true,
      });
      const done = this.tower.kills + this.tower.bossKills;
      if (done >= this.tower.goal) this.endTower(now, 'clear');
      return;
    }
    // v5.11 🚨 영지 침공 방어전
    if (this.invasion) {
      if (m.isBoss) this.invasion.bossKills += 1;
      else this.invasion.kills += 1;
      this.emit({
        t: 'monsterDeath', id: m.id, name: m.name, ko: m.ko, isBoss: m.isBoss, x: m.x,
        gold: 0, exp: 0, shards: 0, levelUps: 0, invasion: true,
      });
      const done = this.invasion.kills + this.invasion.bossKills;
      if (done >= this.invasion.goal) this.endInvasion(now, 'clear');
      return;
    }
    // v6.7 🌀 무한 균열 로그라이크 웨이브
    if (this.rift) {
      this.rift.waveKills += 1;
      this.rift.totalKills += 1;
      this.emit({
        t: 'monsterDeath', id: m.id, name: m.name, ko: m.ko, isBoss: m.isBoss, x: m.x,
        gold: 0, exp: 0, shards: 0, levelUps: 0, rift: true,
      });
      if (this.rift.waveKills >= this.rift.waveGoal) {
        this.rift.wavesCleared += 1;
        const cleared = this.rift.wavesCleared;
        if (cleared % RIFT.blessEvery === 0) {
          const choices = rollRiftChoices(this.rng);
          this.rift.picking = choices;
          this.rift.pauseAt = now;
          this.emit({ t: 'riftPick', wave: cleared, choices });
        } else {
          this.startRiftWave(this.rift.wave + 1, now);
        }
      }
      return;
    }
    const reward = killReward(this.s, this.s.stage, m.isBoss, this.buffs(), this.rng);
    // v5.7 보물 고블린 / 엘리트 추가 보상
    if (m.treasure) {
      const bGold = Math.round(stageGoldBase(this.s.stage) * TREASURE_GOBLIN.goldMul * (this.stats.goldMult || 1));
      const bShards = Math.max(1, Math.round(TREASURE_GOBLIN.shards * (this.stats.dropMult || 1)));
      this.s.gold += bGold;
      this.s.shards += bShards;
      if (this.s.records) this.s.records.totalGold = (this.s.records.totalGold || 0) + bGold;
      reward.gold += bGold;
      reward.shards += bShards;
    } else if (m.elite) {
      const exGold = Math.round(reward.gold * Math.max(0, (m.elite.rewardMul || 3) - 1));
      const exShards = 2;
      this.s.gold += exGold;
      this.s.shards += exShards;
      if (this.s.records) this.s.records.totalGold = (this.s.records.totalGold || 0) + exGold;
      reward.gold += exGold;
      reward.shards += exShards;
    }
    // v4.2 황금 부엉이 '황금비' — 잠시 골드 획득 2배
    if (this.petGoldUntil > now && reward.gold > 0) {
      const extra = Math.round(reward.gold * 1.0);
      this.s.gold += extra;
      if (this.s.records) this.s.records.totalGold = (this.s.records.totalGold || 0) + extra;
      reward.gold += extra;
    }
    // v7.7.0 🔥 피버 타임 — 골드 획득 +30%
    if (this.isFever(now) && reward.gold > 0) {
      const fExtra = Math.round(reward.gold * FEVER.goldBonus);
      this.s.gold += fExtra;
      if (this.s.records) this.s.records.totalGold = (this.s.records.totalGold || 0) + fExtra;
      reward.gold += fExtra;
    }
    registerKill(this.s, m.isBoss);
    this.recordGain(reward.gold, reward.shards, now);
    this.emit({
      t: 'monsterDeath',
      id: m.id,
      name: m.name,
      ko: m.ko,
      isBoss: m.isBoss,
      x: m.x,
      gold: reward.gold,
      exp: reward.exp,
      shards: reward.shards,
      levelUps: reward.levelUps,
    });
    if (reward.levelUps > 0) {
      this.emit({ t: 'levelUp', level: this.s.level });
      this.refreshStats(now);
      this.player.hp = this.stats.hpMax; // 레벨업 시 완충
    }
    // v4.0: 사냥·보스 처치로 장비가 드랍된다(보스 우대) · v5.7 보물 고블린 확정 드랍 · 엘리트 3배
    try {
      let drop = null;
      if (m.treasure) {
        const rIdx = rollDropRarityIdx(this.s.stage, true, this.rng);
        const it = randomItemOfRarity(RARITIES[rIdx].id, this.rng);
        if (it) {
          const acq = acquireGear(this.s, it.id, { autoEquip: true, now, source: 'drop', rollAffix: true, rng: this.rng });
          if (acq.ok) drop = { ...acq, isBoss: false };
        }
        this.emit({ t: 'treasureKill', ko: m.ko, gold: reward.gold, shards: reward.shards, item: drop && drop.item ? drop.item.name : '' });
      } else {
        const mult = m.elite ? (this.stats.dropMult || 1) * 3 : this.stats.dropMult;
        drop = tryGearDrop(this.s, {
          isBoss: m.isBoss, stage: this.s.stage, buffs: this.buffs(), dropMult: mult, rng: this.rng, now,
        });
      }
      if (drop && drop.item) {
        this.emit({
          t: 'gearDrop',
          x: m.x,
          itemId: drop.item.id,
          name: drop.item.name,
          ko: drop.item.name,
          rarity: drop.item.rarity,
          slot: drop.item.slot,
          equipped: !!drop.equipped,
          duplicate: !!drop.duplicate,
          shards: drop.shards || 0,
          auto: !!drop.auto,          // v4.7 자동분해 → 강화석
          isBoss: m.isBoss,
        });
        if (drop.equipped) this.refreshStats(now);
      }
    } catch (e) { /* 드랍 실패가 전투를 멈추지 않게 */ }
    if (m.isBoss) this.defeatBoss(now);
    else if (this.s.bossReady && !this.boss) this.bossReadyAt = now;
  }

  /* ───────────── 동행 펫 ───────────── */
  /** 1.5초마다 주인공 옆에서 함께 공격한다(펫 피해 + 치명타 가능).
   *  v4.2: 불꽃 꼬리(각성+)는 옆의 적까지 함께 태운다. */
  petAttack(now, spd = 1) {
    const pet = this.activePet();
    if (!pet || this.player.dead) return;
    if (now - (this.petLast || 0) < PET_ATTACK_MS / Math.max(1, spd)) return;
    const inRange = this.targets().filter((m) => m.x - this.player.x <= ECON.playerRange);
    if (!inRange.length) return;
    this.petLast = now;
    this.petAnimAt = now;
    const pas = petPassive(this.s, pet.id);
    const splash = Math.max(1, Math.floor(pas.splash || 1));
    const list = inRange.slice(0, splash);
    const hornMul = 1 + (relicEffects(this.s).petDmgPct || 0) / 100;
    const base = this.stats.atk * petDmgPct(this.s, pet.id) * hornMul;
    const zerk = this.berserkUntil > now ? 1 + skillEffect('berserk', this.s.skills.berserk.lv) * 0.5 : 1;
    for (let i = 0; i < list.length; i++) {
      const mul = (i === 0 ? 1 : 0.65) * zerk;
      this.petHitTarget(list[i], base * mul * (0.9 + this.rng() * 0.2), now, 'hit', pet);
    }
  }

  /** v5.3 보조 펫 지원 타격 — 2.1초마다 50% 위력으로 가장 가까운 적 지원 공격 */
  subPetAttack(now, spd = 1) {
    const sp = this.subPet();
    if (!sp || this.player.dead) return;
    if (now - (this.subPetLast || 0) < SUB_PET_ATTACK_MS / Math.max(1, spd)) return;
    const target = this.targets().find((m) => m.x - this.player.x <= ECON.playerRange);
    if (!target) return;
    this.subPetLast = now;
    this.subPetAnimAt = now;
    const barLv = Math.max(0, Math.min(10, Math.floor(Number(this.s && this.s.citadel && this.s.citadel.levels && this.s.citadel.levels.barracks) || 0)));
    const subRate = SUB_PET_RATE + barLv * 0.025;
    const hornMul = 1 + (relicEffects(this.s).petDmgPct || 0) / 100;
    const base = this.stats.atk * petDmgPct(this.s, sp.id) * subRate * hornMul;
    const zerk = this.berserkUntil > now ? 1 + skillEffect('berserk', this.s.skills.berserk.lv) * 0.5 : 1;
    this.petHitTarget(target, base * zerk * (0.9 + this.rng() * 0.2), now, 'sub', sp);
  }

  /** 펫 1대 피해 적용 — 치명타·넉백·집계·처치까지 공통 처리 */
  petHitTarget(target, raw, now, kind, pet) {
    if (!target || target.dead || target.dying) return 0;
    let dmg = raw;
    let crit = false;
    if (target.isBoss && this.stats.bossDmgPct > 0) dmg *= 1 + this.stats.bossDmgPct; // 용의 숨결
    // v4.2 철벽 진형은 펫 피해에도 똑같이 적용된다 · v5.7 철갑 엘리트 25% 경감
    if (this.tower && towerHas(this.tower.floor, 'guard')) dmg *= 1 - TOWER_RULES.guardReduce;
    if (target.elite && target.elite.dmgReduce) dmg *= 1 - target.elite.dmgReduce;
    if (this.rng() < this.stats.crit) {
      crit = true;
      dmg *= this.stats.critDmg;
    }
    dmg = Math.max(1, Math.round(dmg));
    target.hp -= dmg;
    target.hitAt = now;
    target.knock = Math.min(30, (target.knock || 0) + (crit ? 14 : 8));
    if (this.dungeon) this.dungeon.dmg += dmg;
    if (this.tower) this.tower.dmg += dmg;
    if (this.daily) { this.daily.dmg += dmg; this.daily.hits = (this.daily.hits || 0) + 1; }
    if (dmg > 0) this.recordDamage(dmg, now, 'pet', crit, 1, crit ? 1 : 0);
    this.emit({ t: 'petHit', id: target.id, dmg, crit, x: target.x, pet: pet.id, ko: pet.name, color: pet.color, kind: kind || 'hit' });
    if (target.hp <= 0) this.killMonster(target, now);
    return dmg;
  }

  /** v4.2 펫 고유 액티브 — 각성(★)부터 주기적으로 발동한다 */
  petSkillTick(now) {
    const pet = this.activePet();
    if (!pet || this.player.dead) return;
    if (petEvo(this.s, pet.id) < 1) return;
    const sk = petSkillOf(this.s, pet.id);
    const act = sk && sk.active ? sk.active : null;
    if (!act) return;
    if (now - (this.petSkillAt || 0) < act.cdMs) return;
    if (act.kind === 'gold') {
      this.petSkillAt = now;
      this.petAnimAt = now;
      this.petGoldUntil = now + (act.durMs || 8000);
      this.emit({
        t: 'petSkill', pet: pet.id, ko: pet.name, skill: sk.name, active: act.name,
        kind: 'gold', color: pet.color, dur: act.durMs || 8000, hits: 0, dmg: 0,
      });
      return;
    }
    const inRange = this.targets().filter((m) => m.x - this.player.x <= ECON.playerRange * 1.5);
    if (!inRange.length) return;
    this.petSkillAt = now;
    this.petAnimAt = now;
    const hornMul = 1 + (relicEffects(this.s).petDmgPct || 0) / 100;
    const base = this.stats.atk * petDmgPct(this.s, pet.id) * hornMul;
    let total = 0;
    let hits = 0;
    if (act.kind === 'multi') {
      const target = inRange[0];
      for (let i = 0; i < Math.max(1, act.hits || 3); i++) {
        const d = this.petHitTarget(target, base * (act.mul || 0.7) * (0.9 + this.rng() * 0.2), now, 'skill', pet);
        if (!d) break;
        total += d;
        hits += 1;
      }
    } else {
      const list = act.kind === 'splash' ? inRange.slice(0, 3) : inRange;
      for (const m of list) {
        const d = this.petHitTarget(m, base * (act.mul || 1.6) * (0.9 + this.rng() * 0.2), now, 'skill', pet);
        if (!d) continue;
        total += d;
        hits += 1;
      }
    }
    this.emit({
      t: 'petSkill', pet: pet.id, ko: pet.name, skill: sk.name, active: act.name,
      kind: act.kind, color: pet.color, dmg: total, hits, x: inRange[0].x,
    });
  }

  /* ───────────── 스킬 (v8.4.0 10종 & 4슬롯 커스텀 덱 연동) ───────────── */
  activeDeck() {
    return normalizeSkillDeck(this.s && this.s.skillDeck ? this.s.skillDeck : DEFAULT_SKILL_DECK);
  }

  autoSkills(now) {
    const sk = this.s.skills;
    const alive = this.targets();
    // v4.6/v8.8.0 부동산 시너지 + 마법탑 + 사파이어 + 기사단 멀린 쿨감
    const cd = (key) => skillCdOf(key, this.buffs(), this.s);
    // v4.8.2: 스테이지 보스뿐 아니라 일일 보스·도전의 탑 보스 층도 보스전으로 판정
    const hasBoss = !!(this.boss || this.daily || alive.some((m) => m.isBoss));
    const inRange = alive.some((m) => m.x - this.player.x <= ECON.playerRange);
    const hpRatio = this.player.hp / Math.max(1, this.stats.hpMax);
    // v4.7: 설정에서 '스킬 자동 시전'을 끄면 손으로 누를 때만 나간다 · v8.4.0: 편성된 4슬롯 덱 기준
    if (this.s.autoSkill !== false) {
      for (const key of this.activeDeck()) {
        const st = sk && sk[key];
        if (!st || now - st.last < cd(key)) continue;
        if (key === 'heal' && hpRatio < 0.65) this.castSkill('heal', now);
        else if (key === 'aegis' && (hpRatio < 0.80 || hasBoss || alive.length >= 3)) this.castSkill('aegis', now);
        else if (key === 'berserk' && (hasBoss || alive.length >= 2)) this.castSkill('berserk', now);
        else if ((key === 'whirl' || key === 'meteor' || key === 'frostnova' || key === 'thunder') && (alive.length >= 2 || hasBoss)) this.castSkill(key, now);
        else if (key === 'vampstrike' && alive.length >= 1 && (hpRatio < 0.88 || alive.length >= 2 || hasBoss)) this.castSkill('vampstrike', now);
        else if ((key === 'strike' || key === 'execute') && inRange) this.castSkill(key, now);
      }
    }
    // v4.7 상위 전직 궁극기 — 보스전이거나 적이 여럿일 때 준비되면 자동 발동
    const u = ultimateOf(this.s);
    if (u && this.s.autoUlt !== false && !this.player.dead) {
      if (ultLeftMs(this.s, this.buffs(), now) <= 0 && (hasBoss || alive.length >= 2)) this.castUltimate(now);
    }
  }

  /**
   * v4.7 상위 전직 궁극기(5번째 필살기) 시전.
   *  - 전장의 모든 적에게 mul 배율 피해 → 발동 뒤 dur 동안 공격력 버프 · 일정량 회복
   *  - 해금 전(전직 4단계 미만)이면 거부하고, 쿨타임 중이면 남은 시간을 돌려준다.
   * @returns {{ ok:boolean, reason?:string, def?:object, hits?:number, dmg?:number, leftMs?:number }}
   */
  castUltimate(now = Date.now()) {
    const def = ultimateOf(this.s);
    if (!def) return { ok: false, reason: '상위 전직(드래곤 로드)에서 해금됩니다' };
    if (this.player.dead) return { ok: false, reason: '전투 불능 상태입니다' };
    if (!this.s.ult || typeof this.s.ult !== 'object') this.s.ult = { last: 0, casts: 0 };
    const u = this.s.ult;
    const leftMs = ultLeftMs(this.s, this.buffs(), now);
    if (leftMs > 0) return { ok: false, reason: `궁극기 재사용 대기 ${(leftMs / 1000).toFixed(1)}초`, leftMs };
    const alive = this.targets();
    if (!alive.length) return { ok: false, reason: '지금은 적이 없습니다' };

    u.last = now;
    u.casts = Math.max(0, Math.floor(Number(u.casts) || 0)) + 1;
    this.player.skillAt = now;
    this.player.skillKey = 'ultimate';
    this.player.attackAt = now;
    this.player.attackKind = 'ultimate';
    this.ultUntil = now + (def.dur || 0);
    this.ultBonus = def.bonus || 0;
    if (def.heal > 0 && this.player.hp < this.stats.hpMax) {
      this.player.hp = Math.min(this.stats.hpMax, this.player.hp + Math.round(this.stats.hpMax * def.heal));
    }
    const list = alive.slice();
    this.hit(list, def.mul, 'ultimate', now);
    const dmg = this.lastHitDealt || 0;
    this.emit({
      t: 'ultimate', key: 'ultimate', name: def.name, ko: def.name, icon: def.icon,
      tier: def.tier, color: def.color, burst: def.burst, dmg, hits: list.length,
      xs: list.map((m) => m.x),
    });
    return { ok: true, def, hits: list.length, dmg };
  }

  castSkill(key, now = Date.now()) {
    const def = SKILLS[key];
    const sk = this.s.skills[key];
    if (!def || !sk) return false;
    if (now - sk.last < skillCdOf(key, this.buffs(), this.s)) return false;
    if (this.player.dead) return false;
    const rune = skillRuneOf(this.s, key);
    const col = rune ? rune.color : def.color;
    const ko = rune ? rune.name : def.name;
    const alive = this.targets();
    if (key === 'heal') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      const heal = Math.round(this.stats.hpMax * skillEffect('heal', sk.lv, this.s));
      const beforeHp = this.player.hp;
      this.player.hp = Math.min(this.stats.hpMax, this.player.hp + heal);
      let shieldAdded = 0;
      if (rune && rune.id === 'shield') {
        const over = Math.max(0, beforeHp + heal - this.stats.hpMax);
        shieldAdded = Math.round(over + this.stats.hpMax * (rune.shieldBase || 0.12));
        this.player.shield = Math.min(this.stats.hpMax, (this.player.shieldUntil > now ? this.player.shield : 0) + shieldAdded);
        this.player.shieldUntil = now + (rune.shieldMs || 8000);
      } else if (rune && rune.id === 'bless') {
        this.blessUntil = now + (rune.blessMs || 6000);
        this.blessAtk = rune.blessAtk || 0.22;
        const trim = rune.cdTrimMs || 1200;
        for (const k of this.activeDeck()) {
          if (k === 'heal') continue;
          if (this.s.skills[k] && this.s.skills[k].last > 0) this.s.skills[k].last = Math.max(0, this.s.skills[k].last - trim);
        }
      }
      this.emit({ t: 'skill', key, ko, heal, shield: shieldAdded, rune: rune ? rune.id : null, color: col });
      return true;
    }
    if (key === 'berserk') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.berserkUntil = now + def.dur;
      this.berserkRune = rune ? rune.id : null;
      this.emit({ t: 'skill', key, ko, rune: rune ? rune.id : null, color: col, dur: def.dur });
      return true;
    }
    if (key === 'aegis') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      const sh = Math.round(this.stats.hpMax * skillEffect('aegis', sk.lv, this.s));
      const dur = (rune && rune.dur) || def.dur || 8000;
      this.player.shield = Math.min(this.stats.hpMax * 1.2, (this.player.shieldUntil > now ? this.player.shield : 0) + sh);
      this.player.shieldUntil = now + dur;
      this.aegisUntil = now + dur;
      this.aegisReduce = (rune && rune.reduceAdd) || def.reduceAdd || 0.20;
      if (rune && rune.id === 'thorns') {
        this.thornsUntil = now + dur;
        this.thornsAtk = rune.atkBonus || 0.25;
      } else if (rune && rune.id === 'sanctuary') {
        const healAmt = Math.round(this.stats.hpMax * (rune.healRatio || 0.15));
        this.player.hp = Math.min(this.stats.hpMax, this.player.hp + healAmt);
      }
      this.emit({ t: 'skill', key, ko, shield: sh, rune: rune ? rune.id : null, color: col, dur });
      return true;
    }
    if (!alive.length) return false;
    if (key === 'whirl') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.player.attackAt = now;
      this.player.attackKind = 'whirl';
      this.player.targetX = alive[0].x;
      this.player.targetLane = alive[0].lane || 0;
      const inRange = alive.filter((m) => m.x - this.player.x <= ECON.playerRange * 1.6);
      const list = inRange.length ? inRange : alive;
      this.hit(list, skillEffect('whirl', sk.lv, this.s), 'whirl', now);
      if (rune && rune.id === 'flame') {
        for (const m of list) {
          if (m.dead || m.dying) continue;
          m.burnUntil = now + (rune.burnMs || 4000);
          m.burnDps = Math.max(1, Math.round(this.stats.atk * (rune.burnMul || 0.38)));
          m.burnTick = now;
        }
      } else if (rune && rune.id === 'frost') {
        for (const m of list) {
          if (m.dead || m.dying) continue;
          m.slowUntil = now + (rune.slowMs || 4000);
          m.slowAtkMul = rune.slowAtkMul || 1.35;
          m.slowMoveMul = rune.slowMoveMul || 0.70;
        }
      }
      this.emit({ t: 'skill', key, ko, rune: rune ? rune.id : null, color: col });
      return true;
    }
    if (key === 'strike') {
      const target = alive.find((m) => m.x - this.player.x <= ECON.playerRange) || alive[0];
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.player.attackAt = now;
      this.player.attackKind = 'strike';
      this.player.targetX = target.x;
      this.player.targetLane = target.lane || 0;
      const power = skillEffect('strike', sk.lv, this.s);
      if (rune && rune.id === 'lightning') {
        const per = power * (rune.hitMul || 0.62);
        for (let i = 0; i < (rune.hits || 2); i++) {
          if (target.dead || target.dying) break;
          this.hit([target], per, 'strike', now, { critAdd: rune.critAdd || 0.20 });
        }
      } else if (rune && rune.id === 'execute') {
        this.hit([target], power, 'strike', now, { bossAdd: rune.bossAdd || 0.40, lifesteal: rune.lifesteal || 0.15 });
      } else {
        this.hit([target], power, 'strike', now);
      }
      this.emit({ t: 'skill', key, ko, rune: rune ? rune.id : null, color: col, x: target.x });
      return true;
    }
    // ── v8.4.0 신규 공격 스킬 5종 + v8.8.0 룬 각성 10종 (aegis 는 방어 버프로 상단에서 처리) ──
    if (key === 'thunder') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.player.attackAt = now;
      this.player.attackKind = 'strike';
      const maxT = (rune && rune.targets) || def.targets || 4;
      const list = alive.slice(0, maxT);
      this.player.targetX = list[0].x;
      this.player.targetLane = list[0].lane || 0;
      const extra = rune && rune.id === 'overload'
        ? { critAdd: rune.critAdd || 0.25, bossAdd: rune.bossAdd || 0.35 }
        : null;
      this.hit(list, skillEffect('thunder', sk.lv, this.s), 'thunder', now, extra);
      for (const m of list) {
        if (m.dead || m.dying) continue;
        m.shockUntil = now + (def.shockMs || 3000);
        m.shockMul = (rune && rune.shockMul) || def.shockMul || 0.8;
      }
      this.emit({ t: 'skill', key, ko, rune: rune ? rune.id : null, color: col, x: list[0].x, xs: list.map((m) => m.x) });
      return true;
    }
    if (key === 'meteor') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.player.attackAt = now;
      this.player.attackKind = 'whirl';
      const list = alive.slice();
      this.player.targetX = list[0].x;
      this.player.targetLane = list[0].lane || 0;
      const power = skillEffect('meteor', sk.lv, this.s);
      if (rune && rune.id === 'starfall') {
        for (let i = 0; i < (rune.hits || 2); i++) {
          this.hit(list, power * (rune.hitMul || 0.62), 'meteor', now, { critAdd: rune.critAdd || 0.15 });
        }
      } else {
        this.hit(list, power, 'meteor', now);
      }
      const bMs = (rune && rune.burnMs) || def.burnMs || 4000;
      const bMul = (rune && rune.burnMul) || def.burnMul || 0.42;
      for (const m of list) {
        if (m.dead || m.dying) continue;
        m.burnUntil = now + bMs;
        m.burnDps = Math.max(1, Math.round(this.stats.atk * bMul));
        m.burnTick = now;
      }
      this.emit({ t: 'skill', key, ko, rune: rune ? rune.id : null, color: col, x: list[0].x, xs: list.map((m) => m.x) });
      return true;
    }
    if (key === 'frostnova') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.player.attackAt = now;
      this.player.attackKind = 'whirl';
      const list = alive.slice();
      this.player.targetX = list[0].x;
      this.player.targetLane = list[0].lane || 0;
      const mul = skillEffect('frostnova', sk.lv, this.s) * ((rune && rune.mulBonus) || 1);
      const extra = rune && rune.critAdd ? { critAdd: rune.critAdd } : null;
      this.hit(list, mul, 'frostnova', now, extra);
      const sMs = (rune && rune.slowMs) || def.slowMs || 4500;
      for (const m of list) {
        if (m.dead || m.dying) continue;
        m.slowUntil = now + sMs;
        m.slowAtkMul = def.slowAtkMul || 1.55;
        m.slowMoveMul = def.slowMoveMul || 0.45;
      }
      if (rune && rune.id === 'glacier') {
        const sh = Math.round(this.stats.hpMax * (rune.shieldBase || 0.12));
        this.player.shield = Math.min(this.stats.hpMax * 1.2, (this.player.shieldUntil > now ? this.player.shield : 0) + sh);
        this.player.shieldUntil = now + (rune.shieldMs || 6000);
      }
      this.emit({ t: 'skill', key, ko, rune: rune ? rune.id : null, color: col, x: list[0].x });
      return true;
    }
    if (key === 'vampstrike') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.player.attackAt = now;
      this.player.attackKind = 'strike';
      const maxT = (rune && rune.targets) || def.targets || 3;
      const list = alive.slice(0, maxT);
      this.player.targetX = list[0].x;
      this.player.targetLane = list[0].lane || 0;
      const extra = {
        lifesteal: (rune && rune.lifesteal) || def.lifesteal || 0.35,
        bossAdd: (rune && rune.bossAdd) || 0,
        critAdd: (rune && rune.critAdd) || 0,
      };
      this.hit(list, skillEffect('vampstrike', sk.lv, this.s), 'vampstrike', now, extra);
      this.emit({ t: 'skill', key, ko, rune: rune ? rune.id : null, color: col, x: list[0].x });
      return true;
    }
    if (key === 'execute') {
      const lowPct = (rune && rune.lowHpPct) || 0.5;
      const target = alive.find((m) => m.isBoss) || alive.find((m) => m.hp <= m.maxHp * lowPct) || alive[0];
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.player.attackAt = now;
      this.player.attackKind = 'strike';
      this.player.targetX = target.x;
      this.player.targetLane = target.lane || 0;
      const lowBonus = target.hp <= target.maxHp * lowPct ? (def.lowHpMul || 1.5) : 1;
      const power = skillEffect('execute', sk.lv, this.s) * lowBonus;
      const extra = {
        critAdd: (rune && rune.critAdd) || def.critAdd || 0.30,
        bossAdd: def.bossAdd || 0.45,
      };
      if (rune && rune.id === 'phantom') {
        for (let i = 0; i < (rune.hits || 2); i++) {
          if (target.dead || target.dying) break;
          this.hit([target], power * (rune.hitMul || 0.61), 'execute', now, extra);
        }
      } else {
        this.hit([target], power, 'execute', now, extra);
      }
      if (rune && rune.id === 'bloodthirst' && (target.dead || target.dying || target.hp <= 0)) {
        const cdNow = skillCdOf('execute', this.buffs(), this.s);
        sk.last = Math.max(0, now - Math.round(cdNow * (rune.killCdRefund || 0.40)));
      }
      this.emit({ t: 'skill', key, ko, rune: rune ? rune.id : null, color: col, x: target.x });
      return true;
    }
    return false;
  }

  /* ───────────── 보스 ───────────── */
  maybeSpawn(now) {
    if (this.boss) return;
    if (this.s.bossReady && this.s.autoBoss) return; // 자동 보스 대기 중엔 스폰 중단(수동 모드는 계속 사냥)
    const alive = this.monsters.filter((m) => !m.dead && !m.dying).length;
    if (alive >= ECON.maxMonsters) return; // 상한까지 쌓이면 더 안 나온다(화면이 무리로 가득)
    if (now - this.lastSpawn < (ECON.spawnMs || 700) / Math.max(1, this.speed())) return;
    this.lastSpawn = now;
    this.spawnNormal(now);
  }

  bossLogic(now) {
    if (!this.boss) {
      if (this.s.bossReady && this.s.autoBoss) {
        if (!this.bossReadyAt) this.bossReadyAt = now;
        if (now - this.bossReadyAt > ECON.autoBossDelayMs) this.startBoss(now);
      }
      return;
    }
    if (now >= this.bossEnds) this.failBoss(now, 'timeout');
  }

  startBoss(now = Date.now()) {
    if (this.boss || !this.s.bossReady || this.player.dead) return false;
    if (this.tower) return false; // 탑 도전 중에는 스테이지 보스를 부르지 않는다
    if (this.daily) return false; // 일일 보스 중에도 마찬가지
    if (this.dungeon) return false;
    if (this.invasion) return false;
    const boss = this.makeMonster(this._def.boss, true, now);
    // v3.8: 보스전은 1:1 결투 — 잡몹 무리는 물러나 보스와 정면으로 붙는다
    this.monsters = this.monsters.filter((m) => m.dying);
    this.boss = boss;
    this.monsters.push(boss);
    this.bossEnds = now + ECON.bossTimeLimitMs;
    this.s.bossReady = false;
    this.bossReadyAt = 0;
    this.emit({ t: 'bossStart', name: boss.name, ko: boss.ko, x: boss.x, arch: boss.arch });
    return true;
  }

  failBoss(now, why) {
    if (!this.boss) return;
    const boss = this.boss;
    this.boss = null;
    boss.dead = true;
    this.monsters = this.monsters.filter((m) => m !== boss);
    this.s.killsInStage = Math.max(0, ECON.normalKillsPerStage - ECON.bossRetryKills);
    this.s.bossReady = false;
    this.bossReadyAt = 0;
    this.emit({ t: 'bossFail', why, ko: boss.ko });
  }

  defeatBoss(now) {
    const boss = this.boss;
    this.boss = null;
    if (boss) {
      boss.dead = true;
      this.monsters = this.monsters.filter((m) => m !== boss);
    }
    const prevStage = this.s.stage;
    const res = clearStage(this.s, prevStage);
    this.emit({ t: 'stageClear', stage: prevStage, next: res.nextStage, bonus: res.bonus, first: res.first });
    this.syncStage();
    // 새 스테이지 몬스터 정리 후 재스폰
    this.monsters = [];
    this.spawnInitial(now);
    this.refreshStats(now);
  }

  /** 수동 보스 도전 */
  challengeBoss(now = Date.now()) {
    return this.startBoss(now);
  }

  /* ───────────── 🔥 황금 던전 (보스 러시) ───────────── */
  /** 30초 제한 던전 시작. 스테이지 보스 전투 중이거나 이미 진행 중이면 거부. */
  startDungeon(now = Date.now()) {
    if (this.dungeon) return { ok: false, reason: '이미 던전이 진행 중입니다.' };
    if (this.tower) return { ok: false, reason: '도전의 탑 진행 중에는 입장할 수 없습니다.' };
    if (this.daily) return { ok: false, reason: '일일 보스 진행 중에는 입장할 수 없습니다.' };
    if (this.invasion) return { ok: false, reason: '영지 방어전 진행 중에는 입장할 수 없습니다.' };
    if (this.player.dead) return { ok: false, reason: '전투 불능 상태에서는 입장할 수 없습니다.' };
    if (this.boss) return { ok: false, reason: '스테이지 보스 전투 중에는 입장할 수 없습니다.' };
    this.dungeon = {
      t0: now,
      ends: now + DUNGEON.durationMs,
      dmg: 0,
      kills: 0,
      bossKills: 0,
      monsters: 0,
      spawnAt: now - DUNGEON.spawnMs,
    };
    this.monsters = [];
    this.bossReadyAt = 0;
    this.player.hp = this.stats.hpMax; // 입장 시 체력 완충
    try { trackDailyQuest(this.s, 'challenge', 1, now); } catch (e) { /* ignore */ }
    this.emit({ t: 'dungeonStart', ends: this.dungeon.ends, duration: DUNGEON.durationMs });
    return { ok: true };
  }

  dungeonTick(now) {
    const d = this.dungeon;
    if (!d) return;
    if (now >= d.ends) {
      this.endDungeon(now);
      return;
    }
    const alive = this.monsters.filter((m) => !m.dead && !m.dying).length;
    const gap = alive <= 2 ? Math.round(DUNGEON.spawnMs * 0.55) : DUNGEON.spawnMs;
    if (alive < DUNGEON.maxMonsters + 2 && now - d.spawnAt >= gap) {
      d.spawnAt = now;
      this.spawnDungeonMonster(now);
    }
  }

  /** 플레이어 DPS 기준으로 체력을 잡아 어느 스테이지에서든 "연타로 부수는" 맛을 낸다. */
  spawnDungeonMonster(now) {
    const d = this.dungeon;
    if (!d) return;
    const isBoss = d.monsters > 0 && d.monsters % DUNGEON.bossEvery === 0;
    const def = this._def || stageDef(this.s.stage);
    const name = isBoss ? def.boss : d.monsters % 2 === 0 ? 'Goblin' : def.normals[0] || 'Goblin';
    const m = this.makeMonster(name, isBoss, now);
    const dps = Math.max(1, this.stats.dps || 1);
    const hp = Math.max(1, Math.round(dps * (isBoss ? DUNGEON.hpSecBoss : DUNGEON.hpSecNormal) * (0.9 + this.rng() * 0.2)));
    m.maxHp = hp;
    m.hp = hp;
    m.atk = Math.max(1, Math.round((this.stats.hpMax * DUNGEON.atkOfHpPct) / 100));
    m.gold = true; // 황금 던전 표시(렌더러가 금빛 광휘로 그림)
    m.dungeon = true;
    m.x = ECON.spawnX + this.rng() * 80;
    m.lastAttack = now;
    this.monsters.push(m);
    if (isBoss) this.emit({ t: 'dungeonBoss', ko: m.ko });
  }

  /** 던전 종료 → 보상 지급 후 원래 스테이지 자동사냥으로 복귀 */
  endDungeon(now = Date.now()) {
    const d = this.dungeon;
    if (!d) return null;
    this.dungeon = null;
    const reward = dungeonReward(
      this.s,
      { kills: d.kills, bossKills: d.bossKills, dmg: d.dmg, goldMult: this.stats.goldMult, dropMult: this.stats.dropMult },
      this.buffs(),
      this.rng,
    );
    this.s.gold = Math.floor((this.s.gold || 0) + reward.gold);
    this.s.shards = Math.floor((this.s.shards || 0) + reward.shards);
    if (this.s.records) this.s.records.totalGold = (this.s.records.totalGold || 0) + reward.gold;
    if (!this.s.dungeon || typeof this.s.dungeon !== 'object') this.s.dungeon = { best: 0, runs: 0, last: null };
    this.s.dungeon.best = Math.max(Math.floor(this.s.dungeon.best || 0), Math.round(d.dmg));
    this.s.dungeon.runs = Math.max(0, Math.floor(this.s.dungeon.runs || 0)) + 1;
    this.s.dungeon.last = {
      at: now,
      gold: reward.gold,
      shards: reward.shards,
      kills: d.kills,
      bossKills: d.bossKills,
      dmg: Math.round(d.dmg),
    };
    // 원래 스테이지 자동사냥으로 매끄럽게 복귀
    this.monsters = [];
    this.boss = null;
    this.bossEnds = 0;
    this.bossReadyAt = 0;
    this.spawnInitial(now);
    this.refreshStats(now);
    this.emit({
      t: 'dungeonEnd',
      gold: reward.gold,
      shards: reward.shards,
      kills: d.kills,
      bossKills: d.bossKills,
      dmg: Math.round(d.dmg),
      early: now < d.ends,
    });
    return reward;
  }

  /* ───────────── 🗼 도전의 탑 (v4.2) ─────────────
   * 층마다 다른 기믹으로 스펙·장비 조합을 시험한다.
   *  - 몬스터 체력 = 내 DPS × 층별 목표 처치 시간, 공격력 = 내 최대 체력 × 층별 비율
   *    → 스테이지가 달라도 난이도가 흔들리지 않고 빌드만 시험된다.
   *  - 목표 달성 = 클리어(최초 1회 보상) · 쓰러짐/시간 초과 = 패배(잃는 것 없이 복귀)
   */
  startTower(floor, now = Date.now()) {
    if (this.tower) return { ok: false, reason: '이미 도전의 탑에 입장해 있습니다.' };
    if (this.daily) return { ok: false, reason: '일일 보스 진행 중에는 입장할 수 없습니다.' };
    if (this.invasion) return { ok: false, reason: '영지 방어전 진행 중에는 입장할 수 없습니다.' };
    if (this.dungeon) return { ok: false, reason: '황금 던전 진행 중에는 입장할 수 없습니다.' };
    if (this.boss) return { ok: false, reason: '스테이지 보스 전투 중에는 입장할 수 없습니다.' };
    if (this.player.dead) return { ok: false, reason: '전투 불능 상태에서는 입장할 수 없습니다.' };
    const def = towerFloor(floor);
    if (!def) return { ok: false, reason: '없는 층입니다.' };
    if (!towerUnlocked(this.s, def.n)) return { ok: false, reason: towerLockReason(this.s, def.n) || `${def.n - 1}층을 먼저 클리어해야 합니다.` };
    this.tower = {
      n: def.n,
      floor: def,
      t0: now,
      ends: now + def.timeLimitMs,
      dmg: 0,
      kills: 0,
      bossKills: 0,
      spawned: 0,
      goal: def.goal,
      spawnAt: now - def.spawnMs,
      lastTick: now,
      frenzyStep: 0,
      bossSpawned: false,
    };
    this.monsters = [];
    this.boss = null;
    this.bossEnds = 0;
    this.bossReadyAt = 0;
    this.syncStage();
    this.player.hp = this.stats.hpMax; // 입장 시 체력 완충
    try { trackDailyQuest(this.s, 'challenge', 1, now); } catch (e) { /* ignore */ }
    // 첫 웨이브 — 일반 층은 2마리, 보스 층은 보스 1마리
    this.spawnTowerMonster(now);
    if (!def.bossOnly) this.spawnTowerMonster(now - 300);
    this.emit({
      t: 'towerStart', n: def.n, name: def.name, gimmicks: def.gimmicks.slice(),
      ends: this.tower.ends, duration: def.timeLimitMs, goal: def.goal, bossOnly: !!def.bossOnly,
    });
    return { ok: true, floor: def };
  }

  /** 탑 몬스터 1마리 생성 */
  spawnTowerMonster(now) {
    const t = this.tower;
    if (!t) return null;
    const def = t.floor;
    if (def.bossOnly) {
      if (t.bossSpawned) return null;
      t.bossSpawned = true;
      return this.makeTowerMonster(def.boss, true, now);
    }
    const name = def.normals[t.spawned % def.normals.length];
    t.spawned += 1;
    return this.makeTowerMonster(name, false, now);
  }

  /** 탑 몬스터 — 체력은 내 DPS 기준, 공격력은 내 최대 체력 기준으로 정한다 */
  makeTowerMonster(name, isBoss, now) {
    const t = this.tower;
    const def = t.floor;
    const m = this.makeMonster(name, isBoss, now);
    const dps = Math.max(1, this.stats.dps || 1);
    const sec = isBoss ? (def.bossSec || 16) : (def.killSec || 1.8);
    const hp = Math.max(20, Math.round(dps * sec * (0.9 + this.rng() * 0.2)));
    m.maxHp = hp;
    m.hp = hp;
    const atkPct = (def.atkOfHp || 1) * (isBoss ? TOWER_RULES.bossAtkMul : 1);
    m.atk = Math.max(1, Math.round((this.stats.hpMax * atkPct) / 100));
    m.baseAtk = m.atk;
    m.tower = true;
    // 원거리 포격 — 사거리 밖에서 더 자주 쏜다
    if (towerHas(def, 'barrage')) {
      m.atkKind = 'ranged';
      m.attackGap = Math.round(ECON.monsterAttackMs * 0.8);
      if (!m.projKind) m.projKind = 'fire';
    }
    m.x = ECON.spawnX + this.rng() * 70;
    m.lastAttack = now;
    this.monsters.push(m);
    return m;
  }

  /** 기믹 처리 — 재생·광폭·스폰 */
  towerTick(now) {
    const t = this.tower;
    if (!t) return;
    if (now >= t.ends) {
      this.endTower(now, 'timeout');
      return;
    }
    const def = t.floor;
    const dtSec = Math.max(0, Math.min(1, (now - (t.lastTick || now)) / 1000));
    t.lastTick = now;
    // ♻️ 재생의 벽 — 살아 있는 몬스터가 초당 최대 체력의 3%를 되찾는다
    if (towerHas(def, 'regen')) {
      for (const m of this.monsters) {
        if (m.dead || m.dying) continue;
        if (m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * TOWER_RULES.regenPerSec * dtSec);
      }
    }
    // 🔥 광폭 보스 — 10초마다 보스 공격력 +25%
    if (towerHas(def, 'frenzy')) {
      const step = Math.floor((now - t.t0) / TOWER_RULES.frenzyEveryMs);
      if (step > t.frenzyStep) {
        t.frenzyStep = step;
        for (const m of this.monsters) {
          if (m.dead || m.dying || !m.isBoss) continue;
          const base = m.baseAtk || m.atk;
          m.atk = Math.max(1, Math.round(base * (1 + TOWER_RULES.frenzyStep * step)));
        }
        this.emit({ t: 'towerFrenzy', step, n: t.n });
      }
    }
    // 스폰 — 층별 상한까지
    const alive = this.monsters.filter((m) => !m.dead && !m.dying).length;
    if (alive < (def.maxAlive || 6) && now - t.spawnAt >= (def.spawnMs || 700)) {
      t.spawnAt = now;
      this.spawnTowerMonster(now);
    }
  }

  /**
   * 탑 종료 — 보상 지급(클리어·최초만 온전한 보상) 후 원래 스테이지 자동사냥으로 안전 복귀.
   * @param {'clear'|'dead'|'timeout'} how
   */
  endTower(now = Date.now(), how = 'timeout') {
    const t = this.tower;
    if (!t) return null;
    this.tower = null;
    const first = how === 'clear' && !towerCleared(this.s, t.n);
    let reward = null;
    let autoDust = 0; // v4.7: 탑 보상 장비가 자동분해 기준 이하일 때 받은 강화석
    if (how === 'clear') {
      reward = towerReward(this.s, t.n, { first, rng: this.rng });
      if (reward) {
        this.s.gold = Math.floor((this.s.gold || 0) + reward.gold);
        this.s.shards = Math.floor((this.s.shards || 0) + reward.shards);
        if (this.s.records) this.s.records.totalGold = (this.s.records.totalGold || 0) + reward.gold;
        if (reward.points > 0) {
          if (!this.s.rebirth || typeof this.s.rebirth !== 'object') {
            this.s.rebirth = { count: 0, points: 0, totalPoints: 0, traits: {}, bestStage: 1, at: 0 };
          }
          this.s.rebirth.points = Math.max(0, Math.floor(this.s.rebirth.points || 0)) + reward.points;
          this.s.rebirth.totalPoints = Math.max(0, Math.floor(this.s.rebirth.totalPoints || 0)) + reward.points;
        }
        if (reward.item) {
          try {
            const acq = acquireGear(this.s, reward.item.id, { autoEquip: true, now, source: 'tower' });
            if (acq && acq.auto) autoDust = acq.shards || 0;
          } catch (e) { /* 보상 실패가 복귀를 막지 않게 */ }
        }
      }
    }
    // 도전 기록
    const st = towerState(this.s);
    st.runs = Math.max(0, Math.floor(st.runs || 0)) + 1;
    if (how === 'clear') {
      const cleared = new Set(Array.isArray(st.cleared) ? st.cleared : []);
      cleared.add(t.n);
      st.cleared = [...cleared].filter((v) => v >= 1).sort((a, b) => a - b);
      st.best = Math.max(Math.floor(st.best || 0), t.n);
    } else {
      st.fails = Math.max(0, Math.floor(st.fails || 0)) + 1;
    }
    st.last = {
      at: now,
      n: t.n,
      how,
      kills: t.kills,
      bossKills: t.bossKills,
      dmg: Math.round(t.dmg),
      gold: reward ? reward.gold : 0,
      shards: reward ? reward.shards : 0,
      points: reward ? reward.points : 0,
    };
    // 몬스터 정리(진행 중에 피해를 받던 객체도 확실히 종료) 후 원래 스테이지 재스폰
    for (const m of this.monsters) {
      m.dead = true;
      m.dying = 0;
    }
    this.monsters = [];
    this.boss = null;
    this.bossEnds = 0;
    this.bossReadyAt = 0;
    this.syncStage();
    this.spawnInitial(now);
    this.refreshStats(now);
    this.emit({
      t: 'towerEnd',
      how,
      n: t.n,
      name: t.floor.name,
      first,
      goal: t.goal,
      kills: t.kills,
      bossKills: t.bossKills,
      dmg: Math.round(t.dmg),
      gold: reward ? reward.gold : 0,
      shards: reward ? reward.shards + autoDust : 0,
      points: reward ? reward.points : 0,
      item: reward && reward.item && !autoDust ? { id: reward.item.id, name: reward.item.name, rarity: reward.item.rarity, slot: reward.item.slot } : null,
      autoItem: autoDust && reward && reward.item ? reward.item.name : '',  // v4.7 자동분해된 보상 장비
      autoShards: autoDust,
      next: how === 'clear' && t.n < TOWER_MAX_FLOOR ? t.n + 1 : 0,
    });
    return reward;
  }

  /* ───────────── 🌟 일일 보스 (v4.5) ─────────────
   * 하루 2회, 30초 타임어택. 보스 한 마리에게 넣은 누적 피해로 S~D 등급을 매긴다.
   *  - 보스 체력 = 내 DPS × 150초 → 30초 안에 잡히지 않는다. 오직 '얼마나 넣었나'를 겨룬다.
   *  - 등급 기준 = 내 DPS × 30초 대비 비율 → 스테이지·스펙이 달라도 공정하다.
   *  - 보상은 골드·강화석·초월석을 즉시 지급하고 원래 사냥으로 복귀한다.
   */
  startDailyBoss(now = Date.now()) {
    if (this.daily) return { ok: false, reason: '이미 일일 보스에 도전 중입니다.' };
    if (this.invasion) return { ok: false, reason: '영지 방어전 진행 중에는 입장할 수 없습니다.' };
    if (this.dungeon) return { ok: false, reason: '황금 던전 진행 중에는 입장할 수 없습니다.' };
    if (this.tower) return { ok: false, reason: '도전의 탑 진행 중에는 입장할 수 없습니다.' };
    if (this.boss) return { ok: false, reason: '스테이지 보스 전투 중에는 입장할 수 없습니다.' };
    if (this.player.dead) return { ok: false, reason: '전투 불능 상태에서는 입장할 수 없습니다.' };
    const used = consumeDailyAttempt(this.s, now);
    if (!used.ok) return used;
    const bd = dailyBossFor(now);
    const base = stageDef(this.s.stage);
    const theme = THEMES.find((t) => t.id === bd.theme) || base.theme;
    const def = {
      ...base,
      theme,
      themeName: `일일 보스 · ${bd.title}`,
      boss: bd.key,
      bossOnly: true,
      tier: 'daily',
      daily: true,
    };
    this.daily = {
      t0: now,
      ends: now + DAILY.durationMs,
      dmg: 0,
      hits: 0,
      bossKills: 0,
      boss: null,
      key: bd.key,
      ko: bd.ko,
      title: bd.title,
      date: bd.date,
      def,
    };
    this.monsters = [];
    this.boss = null;
    this.bossEnds = 0;
    this.bossReadyAt = 0;
    this._def = def; // 배경·HUD 가 일일 보스 테마로 바뀐다
    this.player.hp = this.stats.hpMax; // 입장 시 체력 완충
    try { trackDailyQuest(this.s, 'challenge', 1, now); } catch (e) { /* ignore */ }
    // 보스 한 마리 — 바로 앞(캐릭터 사거리 밖)에서 시작해 곧 붙는다
    const m = this.makeMonster(bd.key, true, now);
    const dps = Math.max(1, this.stats.dps || 1);
    const hp = Math.max(1, Math.round(dps * DAILY.bossHpSec));
    m.maxHp = hp;
    m.hp = hp;
    m.atk = Math.max(1, Math.round((this.stats.hpMax * DAILY.atkOfHpPct) / 100));
    m.baseAtk = m.atk;
    m.attackGap = DAILY.attackGapMs;
    m.daily = true;
    m.x = ECON.playerX + 240;
    m.lastAttack = now;
    this.monsters.push(m);
    this.daily.boss = m;
    this.emit({
      t: 'dailyStart', ko: bd.ko, title: bd.title, key: bd.key, theme: bd.theme,
      ends: this.daily.ends, duration: DAILY.durationMs, date: bd.date, left: used.left,
    });
    return { ok: true, boss: bd, left: used.left };
  }

  dailyTick(now) {
    const d = this.daily;
    if (!d) return;
    if (!d.boss || d.boss.dead || d.boss.hp <= 0) {
      this.endDailyBoss(now, 'kill');
      return;
    }
    if (now >= d.ends) this.endDailyBoss(now, 'timeout');
  }

  /**
   * 일일 보스 종료 — 누적 피해로 등급·보상을 정해 즉시 지급하고 원래 사냥으로 복귀.
   * @param {'timeout'|'dead'|'kill'} how
   */
  endDailyBoss(now = Date.now(), how = 'timeout') {
    const d = this.daily;
    if (!d) return null;
    this.daily = null;
    const dps = Math.max(1, this.stats.dps || 1);
    const dmg = Math.max(0, Math.round(d.dmg));
    const reward = dailyReward(this.s, { dmg, dps, ratio: dmg / dailyDpsCap(dps) }, this.rng);
    this.s.gold = Math.floor((this.s.gold || 0) + reward.gold);
    this.s.shards = Math.floor((this.s.shards || 0) + reward.shards);
    if (this.s.records) this.s.records.totalGold = (this.s.records.totalGold || 0) + reward.gold;
    if (reward.points > 0) {
      if (!this.s.rebirth || typeof this.s.rebirth !== 'object') {
        this.s.rebirth = { count: 0, points: 0, totalPoints: 0, traits: {}, bestStage: 1, at: 0 };
      }
      this.s.rebirth.points = Math.max(0, Math.floor(this.s.rebirth.points || 0)) + reward.points;
      this.s.rebirth.totalPoints = Math.max(0, Math.floor(this.s.rebirth.totalPoints || 0)) + reward.points;
    }
    const rec = recordDailyRun(this.s, {
      dmg, grade: reward.grade.id, how, gold: reward.gold, shards: reward.shards,
      points: reward.points, ratio: reward.ratio,
    }, now);
    try { recordWeeklyBoss(this.s, dmg, reward.ratio, now); } catch (e) { /* ignore */ }
    // 몬스터 정리 후 원래 스테이지 사냥으로 복귀
    for (const m of this.monsters) {
      m.dead = true;
      m.dying = 0;
    }
    this.monsters = [];
    this.boss = null;
    this.bossEnds = 0;
    this.bossReadyAt = 0;
    this.syncStage();
    this.spawnInitial(now);
    this.refreshStats(now);
    const left = dailyInfo(this.s, now).left;
    this.emit({
      t: 'dailyEnd', how, ko: d.ko, key: d.key, title: d.title,
      dmg, grade: reward.grade.id, gradeLabel: reward.grade.label, gradeColor: reward.grade.color,
      ratio: reward.ratio, gold: reward.gold, shards: reward.shards, points: reward.points,
      isBest: rec.isBest, best: rec.best, bestGrade: rec.bestGrade, left,
    });
    return reward;
  }

  /* ───────────── 🚨 영지 침공 방어전 (v5.11.0) ───────────── */
  startInvasion(now = Date.now()) {
    if (this.invasion) return { ok: false, reason: '이미 영지 방어전이 진행 중입니다.' };
    if (this.tower) return { ok: false, reason: '도전의 탑 진행 중에는 입장할 수 없습니다.' };
    if (this.daily) return { ok: false, reason: '일일 보스 진행 중에는 입장할 수 없습니다.' };
    if (this.dungeon) return { ok: false, reason: '황금 던전 진행 중에는 입장할 수 없습니다.' };
    if (this.boss) return { ok: false, reason: '스테이지 보스 전투 중에는 입장할 수 없습니다.' };
    if (this.player.dead) return { ok: false, reason: '전투 불능 상태에서는 입장할 수 없습니다.' };
    const info = invasionStatus(this.s, now);
    if (!info.hasLand) return { ok: false, reason: '보유한 부동산이 있어야 침공 방어전에 참여할 수 있습니다.' };
    if (!info.available) return { ok: false, reason: '이번 침공은 이미 방어했습니다. 다음 경보를 기다려 주세요.' };

    this.invasion = {
      info,
      city: info.city,
      wave: info.wave,
      t0: now,
      ends: now + INVASION.durationMs,
      kills: 0,
      bossKills: 0,
      spawned: 0,
      bossSpawned: false,
      goal: INVASION.goal,
      spawnAt: now - INVASION.spawnMs,
    };
    this.monsters = [];
    this.boss = null;
    this.bossEnds = 0;
    this.bossReadyAt = 0;
    this.player.hp = this.stats.hpMax;
    try { trackDailyQuest(this.s, 'challenge', 1, now); } catch (e) { /* ignore */ }
    this.spawnInvasionMonster(now, false);
    this.spawnInvasionMonster(now - 200, false);
    this.emit({
      t: 'invasionStart',
      cityName: info.city.name,
      waveName: info.wave.name,
      bossKo: info.wave.bossKo,
      ends: this.invasion.ends,
      duration: INVASION.durationMs,
      goal: INVASION.goal,
    });
    return { ok: true, info };
  }

  spawnInvasionMonster(now, isBoss) {
    const inv = this.invasion;
    if (!inv) return null;
    const w = inv.wave;
    const name = isBoss ? w.boss : w.normals[inv.spawned % w.normals.length];
    if (!isBoss) inv.spawned += 1;
    else inv.bossSpawned = true;
    const m = this.makeMonster(name, isBoss, now);
    const dps = Math.max(1, this.stats.dps || 1);
    const sec = isBoss ? INVASION.hpSecBoss : INVASION.hpSecNormal;
    m.maxHp = Math.max(20, Math.round(dps * sec * (0.9 + this.rng() * 0.2)));
    m.hp = m.maxHp;
    const atkPct = INVASION.atkOfHpPct * (isBoss ? INVASION.bossAtkMul : 1);
    m.atk = Math.max(1, Math.round((this.stats.hpMax * atkPct) / 100));
    m.invasion = true;
    m.x = ECON.spawnX + this.rng() * 60;
    m.lastAttack = now;
    this.monsters.push(m);
    return m;
  }

  invasionTick(now) {
    const inv = this.invasion;
    if (!inv) return;
    if (now >= inv.ends) {
      this.endInvasion(now, 'timeout');
      return;
    }
    const alive = this.monsters.filter((m) => !m.dead && !m.dying).length;
    const gap = alive <= 2 ? Math.round(INVASION.spawnMs * 0.5) : INVASION.spawnMs;
    if (inv.spawned < INVASION.minionGoal) {
      if (alive < INVASION.maxAlive && now - inv.spawnAt >= gap) {
        inv.spawnAt = now;
        this.spawnInvasionMonster(now, false);
      }
    } else if (!inv.bossSpawned && inv.kills >= INVASION.minionGoal) {
      this.spawnInvasionMonster(now, true);
    }
  }

  endInvasion(now = Date.now(), how = 'clear') {
    const inv = this.invasion;
    if (!inv) return null;
    this.invasion = null;
    let res = null;
    if (how === 'clear') {
      res = recordInvasionWin(this.s, inv.info, now);
    }
    for (const m of this.monsters) {
      m.dead = true;
      m.dying = 0;
    }
    this.monsters = [];
    this.boss = null;
    this.bossEnds = 0;
    this.bossReadyAt = 0;
    this.syncStage();
    this.spawnInitial(now);
    this.refreshStats(now);
    this.emit({
      t: 'invasionEnd',
      how,
      cityName: inv.city.name,
      waveName: inv.wave.name,
      kills: inv.kills,
      bossKills: inv.bossKills,
      gold: res ? res.gold : 0,
      shards: res ? res.shards : 0,
      points: res ? res.points : 0,
      boomPct: res ? res.boomPct : 0,
      medals: res ? res.medals : 0,
    });
    return res;
  }

  /* ───────────── 🌀 무한 균열 로그라이크 웨이브 (v6.7.0) ───────────── */
  startRift(now = Date.now()) {
    if (this.rift) return { ok: false, reason: '이미 무한 균열이 진행 중입니다.' };
    if (this.invasion) return { ok: false, reason: '영지 방어전 진행 중에는 입장할 수 없습니다.' };
    if (this.tower) return { ok: false, reason: '도전의 탑 진행 중에는 입장할 수 없습니다.' };
    if (this.daily) return { ok: false, reason: '일일 보스 진행 중에는 입장할 수 없습니다.' };
    if (this.dungeon) return { ok: false, reason: '황금 던전 진행 중에는 입장할 수 없습니다.' };
    if (this.boss) return { ok: false, reason: '스테이지 보스 전투 중에는 입장할 수 없습니다.' };
    if (this.player.dead) return { ok: false, reason: '전투 불능 상태에서는 입장할 수 없습니다.' };
    const st = riftStatus(this.s, now);
    if (!st.ready) return { ok: false, reason: `균열 재입장까지 ${Math.ceil(st.leftMs / 1000)}초 남았습니다.` };

    this.rift = {
      wave: 0,
      wavesCleared: 0,
      waveKills: 0,
      waveGoal: 0,
      spawned: 0,
      bossSpawned: false,
      totalKills: 0,
      cards: [],
      picking: null,
      pauseAt: 0,
      ends: now + RIFT.waveTimeMs,
      spawnAt: now,
      t0: now,
    };
    this.monsters = [];
    this.boss = null;
    this.bossEnds = 0;
    this.bossReadyAt = 0;
    this.player.hp = this.stats.hpMax;
    try { trackDailyQuest(this.s, 'challenge', 1, now); } catch (e) { /* ignore */ }
    this.startRiftWave(1, now);
    this.emit({ t: 'riftStart', wave: 1, ends: this.rift.ends });
    return { ok: true, wave: 1 };
  }

  startRiftWave(wave, now = Date.now()) {
    const r = this.rift;
    if (!r) return;
    r.wave = wave;
    r.isBossWave = wave % RIFT.blessEvery === 0;
    r.waveKills = 0;
    r.spawned = 0;
    r.bossSpawned = false;
    r.waveGoal = r.isBossWave ? RIFT.bossWaveMinions + 1 : RIFT.normalPerWave;
    r.ends = now + RIFT.waveTimeMs;
    r.spawnAt = now - RIFT.spawnMs;
    this.monsters = [];
    this.spawnRiftMonster(now, false);
    this.spawnRiftMonster(now - 150, false);
    this.emit({ t: 'riftWave', wave, isBossWave: r.isBossWave, ends: r.ends });
  }

  spawnRiftMonster(now, isBoss) {
    const r = this.rift;
    if (!r) return null;
    const pool = RIFT_MONSTERS[(r.wave - 1) % RIFT_MONSTERS.length];
    const name = isBoss
      ? RIFT_BOSSES[Math.floor((r.wave - 1) / RIFT.blessEvery) % RIFT_BOSSES.length]
      : pool[r.spawned % pool.length];
    if (!isBoss) r.spawned += 1;
    else r.bossSpawned = true;
    const m = this.makeMonster(name, isBoss, now);
    const dps = Math.max(1, this.stats.dps || 1);
    const scale = 0.85 + r.wave * 0.34;
    m.maxHp = Math.max(20, Math.round(dps * scale * (isBoss ? 3.2 : 1.0) * (0.92 + this.rng() * 0.16)));
    m.hp = m.maxHp;
    const atkPct = (1.1 + r.wave * 0.24) * (isBoss ? 1.55 : 1);
    m.atk = Math.max(1, Math.round((this.stats.hpMax * atkPct) / 100));
    m.rift = true;
    m.x = ECON.spawnX + this.rng() * 60;
    m.lastAttack = now;
    this.monsters.push(m);
    return m;
  }

  pickRiftCard(cardId, now = Date.now()) {
    const r = this.rift;
    if (!r || !r.picking) return { ok: false, reason: '선택 대기 중인 축복 카드가 없습니다.' };
    const card = r.picking.find((c) => c.id === cardId) || RIFT_CARD_BY_ID[cardId];
    if (!card) return { ok: false, reason: '알 수 없는 축복 카드입니다.' };
    r.cards.push(card.id);
    r.picking = null;
    if (card.fx) {
      if (card.fx.healNowPct) {
        this.player.hp = Math.min(this.stats.hpMax, this.player.hp + Math.round(this.stats.hpMax * (card.fx.healNowPct / 100)));
      }
      if (card.fx.shieldNowPct) {
        this.player.shield = Math.max(this.player.shield || 0, Math.round(this.stats.hpMax * (card.fx.shieldNowPct / 100)));
        this.player.shieldUntil = now + 25000;
      }
      if (card.fx.resetCd && this.s && this.s.skills) {
        for (const k of ['strike', 'whirl', 'berserk', 'heal']) {
          if (this.s.skills[k]) this.s.skills[k].last = 0;
        }
      }
    }
    this.startRiftWave(r.wave + 1, now);
    this.emit({ t: 'riftPicked', card, wave: r.wave });
    return { ok: true, card, wave: r.wave };
  }

  riftTick(now) {
    const r = this.rift;
    if (!r || r.picking) return;
    if (now >= r.ends) {
      this.endRift(now, 'timeout');
      return;
    }
    const alive = this.monsters.filter((m) => !m.dead && !m.dying).length;
    const minNeed = r.isBossWave ? RIFT.bossWaveMinions : RIFT.normalPerWave;
    const gap = alive <= 2 ? Math.round(RIFT.spawnMs * 0.5) : RIFT.spawnMs;
    if (r.spawned < minNeed) {
      if (alive < RIFT.maxAlive && now - r.spawnAt >= gap) {
        r.spawnAt = now;
        this.spawnRiftMonster(now, false);
      }
    } else if (r.isBossWave && !r.bossSpawned && r.waveKills >= minNeed) {
      this.spawnRiftMonster(now, true);
    }
  }

  endRift(now = Date.now(), how = 'retreat') {
    const r = this.rift;
    if (!r) return null;
    this.rift = null;
    const res = settleRiftReward(this.s, r.wavesCleared, r.cards, now, this.rng);
    for (const m of this.monsters) {
      m.dead = true;
      m.dying = 0;
    }
    this.monsters = [];
    this.boss = null;
    this.bossEnds = 0;
    this.bossReadyAt = 0;
    this.syncStage();
    this.spawnInitial(now);
    this.refreshStats(now);
    this.emit({
      t: 'riftEnd',
      how,
      waves: res ? res.waves : 0,
      gold: res ? res.gold : 0,
      shards: res ? res.shards : 0,
      points: res ? res.points : 0,
      bonusGem: res ? res.bonusGem : null,
      bonusMedal: res ? res.bonusMedal : 0,
      isBest: res ? res.isBest : false,
      bestWave: res ? res.bestWave : 0,
      cards: r.cards.slice(),
    });
    return res;
  }

  /** 저장용 hp 반영 */
  writeHp() {
    this.s.hp = Math.round(this.player.hp);
  }
}
