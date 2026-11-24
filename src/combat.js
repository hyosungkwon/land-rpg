// land-rpg / src/combat.js
// 자동 전투 시뮬레이션. DOM·Canvas 의존 없음 → 헤드리스 검증 가능.
// 렌더러는 이 객체의 엔티티를 읽고, UI는 events 큐를 소비한다.
import { ECON, SKILLS, stageDef, monsterKo, monsterMotion, monsterAttack } from './data.js';
import {
  calcStats, currentHp, skillEffect, killReward, registerKill, clearStage, monsterStats,
} from './state.js';
import { DUNGEON, PET_ATTACK_MS, equippedPet, petDmgPct, dungeonReward } from './meta.js';
import { codexMeet, codexKill } from './quests.js';
import { tryGearDrop } from './gear.js';

const ATTACK_STOP_GAP = 380; // 보스가 멈추고 때리는 거리(캐릭터 스프라이트가 겹치지 않는 간격)
/* ── v3.8 다굴 슬롯 ──────────────────────────────────────────────
 * 몬스터는 '줄'이 아니라 캐릭터 앞쪽 부채꼴 슬롯을 하나씩 차지한다.
 *  - dx   : 플레이어 x 로부터의 거리(월드). 근접은 사거리(playerRange) 안쪽,
 *           원거리는 뒤쪽에서 투사체를 쏜다.
 *  - lane : 앞뒤 레인(-1 뒤 · 0 가운데 · 1 앞). 렌더러가 y 오프셋·깊이 스케일로 그린다.
 * 여러 마리가 각자 슬롯에 붙어 동시에 공격 → 실제로 다굴 피해가 누적된다.
 */
const MELEE_SLOTS = [
  { dx: 270, lane: 0 },
  { dx: 455, lane: -1 },
  { dx: 345, lane: 1 },
  { dx: 545, lane: 0 },
  { dx: 400, lane: 1 },
  { dx: 495, lane: -1 },
];
const RANGED_SLOTS = [
  { dx: 620, lane: -1 },
  { dx: 700, lane: 0 },
  { dx: 585, lane: 1 },
  { dx: 740, lane: 1 },
  { dx: 660, lane: 0 },
  { dx: 630, lane: -1 },
];
const LANE_DEPTH = 15; // 레인 1당 화면 y 오프셋(px) — 렌더러가 sc 를 곱해 쓴다
const SLOT_TOL = 26; // 슬롯 도착 판정(월드)
const WALK_SPEED = 205; // 몬스터 이동 속도(월드/초) — 6마리가 빠르게 채워진다
// v3.7 모션: 공격 '전조(windup)' 시간. 피해 판정 시점(monsterAttackMs 간격)은 그대로 두고
// 전조만 그 직전에 시작해 밸런스(DPS·클리어 시간·헤드리스 시뮬)를 건드리지 않는다.
const WINDUP_MELEE_MS = 300;
const WINDUP_RANGED_MS = 470;
const WINDUP_BOSS_EXTRA_MS = 90;
const HEAVY_EVERY = 3; // 보스는 3번째 공격마다 강공격 모션(피해량은 동일)

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
      dead: false,
      reviveAt: 0,
      attackAnim: 0,
      attackAt: 0,      // 마지막 공격 시작 시각(렌더러가 프레임 전환에 사용)
      attackKind: 'normal',
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
    this.lastSpawn = 0;
    this.lastRegen = 0;
    this.lastStatsAt = 0;
    this.time = 0;
    // v3.2: 동행 펫 애니메이션 시각 · 황금 던전(보스 러시) 상태
    this.petLast = 0;
    this.petAnimAt = 0;
    this.dungeon = null;
    this.syncStage();
    this.spawnInitial(startAt);
  }

  /** 장착된 동행 펫 정의(없으면 null) */
  activePet() {
    return equippedPet(this.s);
  }

  /** 황금 던전 진행 중인가 */
  inDungeon() {
    return !!this.dungeon;
  }

  /** 던전 남은 시간(ms) */
  dungeonLeft(now = Date.now()) {
    return this.dungeon ? Math.max(0, this.dungeon.ends - now) : 0;
  }

  get def() {
    return this._def;
  }

  syncStage() {
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
    for (let i = 0; i < n; i++) this.spawnNormal(now - (n - i) * 350);
    this.lastSpawn = now;
  }

  spawnNormal(now) {
    if (this.boss) return;
    if (this.monsters.filter((m) => !m.dead && !m.dying).length >= ECON.maxMonsters) return;
    const normals = this._def.normals;
    // 스테이지마다 처치 수 기준으로 몬스터 종류를 돌려가며 등장
    const pick = normals[(this.s.totalKills + this.monsters.length) % normals.length];
    const m = this.makeMonster(pick, false, now);
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
        this.player.graceUntil = now + 3500;
        this.emit({ t: 'revive' });
        this.spawnInitial(now);
      }
      return;
    }

    this.regen(dt);
    this.autoSkills(now);
    this.updateMonsters(dt, now);
    this.attack(now);
    this.petAttack(now);
    if (this.dungeon) {
      this.dungeonTick(now);
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

  updateMonsters(dt, now) {
    const p = this.player;
    const alive = this.assignSlots();
    for (const m of alive) {
      if (!Number.isFinite(m.x)) m.x = ECON.spawnX;
      if (!Number.isFinite(m.hp)) m.hp = m.maxHp;
      if (!Number.isFinite(m.slotX)) m.slotX = p.x + ATTACK_STOP_GAP;
      const standX = m.slotX;
      const dist = Math.abs(m.x - standX);
      const walking = dist > SLOT_TOL;

      if (walking) {
        const speed = m.isBoss ? 132 : WALK_SPEED + (m.scale - 1) * 60; // 월드단위/초
        const prevX = m.x;
        const step = (speed * dt) / 1000;
        m.x = m.x > standX ? Math.max(standX, m.x - step) : Math.min(standX, m.x + step);
        // 걸음/도약 위상 — 실제로 이동한 거리만 쌓아 정지하면 모션이 멈추게 한다
        m.walk = (Number.isFinite(m.walk) ? m.walk : 0) + Math.abs(m.x - prevX);
        m.moving = true;
        if (!m.windupBase) m.windupBase = windupFor(m);
        const eta = (Math.abs(m.x - standX) / speed) * 1000;
        // 도착 직전 마지막 걸음에서 전조를 시작한다 → 타격은 도착 순간.
        // 타격 예정 시각(도착 또는 공격 간격 도달)에 맞춰 시작해 전조가 너무 길게 남지 않게 한다.
        const dueW = (Number.isFinite(m.lastAttack) ? m.lastAttack : now) + ECON.monsterAttackMs;
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
        const heavy = !!m.isBoss && (m.attackSeq || 0) % HEAVY_EVERY === HEAVY_EVERY - 1;
        const wuTotal = m.windupBase + (heavy ? 170 : 0);
        const due = (Number.isFinite(m.lastAttack) ? m.lastAttack : now) + ECON.monsterAttackMs;
        // 1) 전조: 타격 시점 직전부터 움츠리며(원거리는 기를 모으며) 예고한다
        if (!m.windupAt && now >= due - wuTotal) {
          m.windupAt = now;
          m.windupDur = wuTotal;
          m.windupHeavy = heavy;
          this.emit({
            t: 'monsterWindup', id: m.id, ko: m.ko, x: m.x, isBoss: m.isBoss,
            kind: m.atkKind, move: m.moveKind, proj: m.projKind, color: m.atkColor,
            dur: wuTotal, heavy,
          });
        }
        // 2) 타격: 슬롯에 붙은 몬스터끼리 각자 1500ms 간격으로 때린다 → 다굴
        // 전조가 시작됐다면 반드시 전조를 마친 뒤에 때린다(슬롯 이동으로 전조가 늦게 시작된 경우 보정)
        const windupDone = !m.windupAt || now - m.windupAt >= wuTotal;
        if (now - m.lastAttack > ECON.monsterAttackMs && windupDone) {
          m.lastAttack = now;
          m.lunge = 1;
          m.lungeAt = now;
          m.strikeAt = now;
          m.windupAt = 0;
          m.attackSeq = (m.attackSeq || 0) + 1;
          const heavyNow = !!m.windupHeavy;
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
    // v3.8: 방어(피해 감소) 스탯 — 갑옷·투구 강화 + 환생 '수호' 특성
    const reduce = Math.max(0, Math.min(0.95, this.stats.dmgReduce || 0));
    const grace = this.player.graceUntil && now < this.player.graceUntil ? 0.4 : 1;
    const dmg = Math.max(1, Math.round(raw * (1 - reduce) * grace));
    this.player.hp -= dmg;
    this.player.hurtAt = now;
    this.emit({ t: 'playerHurt', dmg, from: from.ko, reduce: Math.round(reduce * 100), ...(info || {}) });
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.player.dead = true;
      this.player.reviveAt = now + ECON.reviveMs;
      this.emit({ t: 'playerDeath' });
      if (this.boss) this.failBoss(now, 'dead');
      if (this.dungeon) this.endDungeon(now); // 쓰러지면 던전 종료(그때까지의 보상 지급)
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

  /* ───────────── 공격 ───────────── */
  attack(now) {
    if (now - this.player.lastAttack < this.stats.attackMs) return;
    const target = this.targets().find((m) => m.x - this.player.x <= ECON.playerRange);
    if (!target) return;
    this.player.lastAttack = now;
    this.player.attackAnim = 1;
    this.player.attackAt = now;
    this.player.attackKind = 'normal';
    this.hit([target], 1, 'normal', now);
  }

  targets() {
    return this.monsters.filter((m) => !m.dead && !m.dying).sort((a, b) => a.x - b.x);
  }

  roll(rawMul, now) {
    let dmg = this.stats.atk * rawMul * (0.9 + this.rng() * 0.2);
    if (this.berserkUntil > now) dmg *= 1 + skillEffect('berserk', this.s.skills.berserk.lv);
    let crit = false;
    if (this.rng() < this.stats.crit) {
      crit = true;
      dmg *= this.stats.critDmg;
    }
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  }

  hit(list, mul, kind, now) {
    let hits = 0;
    let dealt = 0;
    for (const m of list) {
      if (m.dead || m.dying) continue;
      const { dmg: rawDmg, crit } = this.roll(mul, now);
      // v4.0 장비 옵션: 보스 추가 피해 · 범위 베기 피해
      let dmg = rawDmg;
      if (m.isBoss && this.stats.bossDmgPct > 0) dmg = Math.round(dmg * (1 + this.stats.bossDmgPct));
      if (kind === 'whirl' && this.stats.whirlDmgPct > 0) dmg = Math.round(dmg * (1 + this.stats.whirlDmgPct));
      m.hp -= dmg;
      m.hitAt = now;
      m.knock = Math.min(30, (m.knock || 0) + (crit ? 18 : 10));
      if (this.dungeon) this.dungeon.dmg += dmg;
      dealt += dmg;
      hits++;
      this.emit({ t: 'hit', id: m.id, dmg, crit, x: m.x, isBoss: m.isBoss, kind });
      if (m.hp <= 0) this.killMonster(m, now);
    }
    // v4.0 장비 옵션: 흡혈 — 입힌 피해의 일부를 되찾는다
    if (dealt > 0 && this.stats.lifesteal > 0 && !this.player.dead) {
      const heal = Math.round(dealt * this.stats.lifesteal);
      if (heal > 0 && this.player.hp < this.stats.hpMax) {
        this.player.hp = Math.min(this.stats.hpMax, this.player.hp + heal);
        this.emit({ t: 'lifesteal', heal });
      }
    }
    return hits;
  }

  killMonster(m, now) {
    m.hp = 0;
    m.dying = now;
    m.windupAt = 0;
    m.moving = false;
    // 📖 도감: 처치 수 기록(던전 몹 포함)
    try { codexKill(this.s, m.name); } catch (e) { /* ignore */ }
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
    const reward = killReward(this.s, this.s.stage, m.isBoss, this.buffs(), this.rng);
    registerKill(this.s, m.isBoss);
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
    // v4.0: 사냥·보스 처치로 장비가 드랍된다(보스 우대) — 파밍의 재미
    try {
      const drop = tryGearDrop(this.s, {
        isBoss: m.isBoss, stage: this.s.stage, buffs: this.buffs(), rng: this.rng, now,
      });
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
          isBoss: m.isBoss,
        });
        if (drop.equipped) this.refreshStats(now);
      }
    } catch (e) { /* 드랍 실패가 전투를 멈추지 않게 */ }
    if (m.isBoss) this.defeatBoss(now);
    else if (this.s.bossReady && !this.boss) this.bossReadyAt = now;
  }

  /* ───────────── 동행 펫 ───────────── */
  /** 1.5초마다 주인공 옆에서 함께 공격한다(펫 피해 + 치명타 가능). */
  petAttack(now) {
    const pet = this.activePet();
    if (!pet || this.player.dead) return;
    if (now - (this.petLast || 0) < PET_ATTACK_MS) return;
    const target = this.targets().find((m) => m.x - this.player.x <= ECON.playerRange);
    if (!target) return;
    this.petLast = now;
    this.petAnimAt = now;
    let dmg = this.stats.atk * petDmgPct(this.s, pet.id) * (0.9 + this.rng() * 0.2);
    if (this.berserkUntil > now) dmg *= 1 + skillEffect('berserk', this.s.skills.berserk.lv) * 0.5;
    let crit = false;
    if (this.rng() < this.stats.crit) {
      crit = true;
      dmg *= this.stats.critDmg;
    }
    dmg = Math.max(1, Math.round(dmg));
    target.hp -= dmg;
    target.hitAt = now;
    target.knock = Math.min(30, (target.knock || 0) + (crit ? 14 : 8));
    if (this.dungeon) this.dungeon.dmg += dmg;
    this.emit({ t: 'petHit', id: target.id, dmg, crit, x: target.x, pet: pet.id, ko: pet.name, color: pet.color });
    if (target.hp <= 0) this.killMonster(target, now);
  }

  /* ───────────── 스킬 ───────────── */
  autoSkills(now) {
    const sk = this.s.skills;
    const alive = this.targets();
    // 회복: 체력 65% 이하
    if (now - sk.heal.last >= SKILLS.heal.cd && this.player.hp / this.stats.hpMax < 0.65) this.castSkill('heal', now);
    // 광폭: 보스전 또는 적 2마리 이상
    if (now - sk.berserk.last >= SKILLS.berserk.cd && (this.boss || alive.length >= 2)) this.castSkill('berserk', now);
    // 범위 베기: 적 2마리 이상
    if (now - sk.whirl.last >= SKILLS.whirl.cd && alive.length >= 2) this.castSkill('whirl', now);
    // 강격: 적이 사거리 안에 있을 때
    if (now - sk.strike.last >= SKILLS.strike.cd && alive.some((m) => m.x - this.player.x <= ECON.playerRange)) this.castSkill('strike', now);
  }

  castSkill(key, now = Date.now()) {
    const def = SKILLS[key];
    const sk = this.s.skills[key];
    if (!def || !sk) return false;
    if (now - sk.last < def.cd) return false;
    if (this.player.dead) return false;
    const alive = this.targets();
    if (key === 'heal') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      const heal = Math.round(this.stats.hpMax * skillEffect('heal', sk.lv));
      this.player.hp = Math.min(this.stats.hpMax, this.player.hp + heal);
      this.emit({ t: 'skill', key, ko: def.name, heal, color: def.color });
      return true;
    }
    if (key === 'berserk') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.berserkUntil = now + def.dur;
      this.emit({ t: 'skill', key, ko: def.name, color: def.color, dur: def.dur });
      return true;
    }
    if (!alive.length) return false;
    if (key === 'whirl') {
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.player.attackAt = now;
      this.player.attackKind = 'whirl';
      const inRange = alive.filter((m) => m.x - this.player.x <= ECON.playerRange * 1.6);
      this.hit(inRange.length ? inRange : alive, skillEffect('whirl', sk.lv), 'whirl', now);
      this.emit({ t: 'skill', key, ko: def.name, color: def.color });
      return true;
    }
    if (key === 'strike') {
      const target = alive.find((m) => m.x - this.player.x <= ECON.playerRange) || alive[0];
      sk.last = now;
      this.player.skillAt = now;
      this.player.skillKey = key;
      this.player.attackAt = now;
      this.player.attackKind = 'strike';
      this.hit([target], skillEffect('strike', sk.lv), 'strike', now);
      this.emit({ t: 'skill', key, ko: def.name, color: def.color, x: target.x });
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
    if (now - this.lastSpawn < (ECON.spawnMs || 700)) return;
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
    if (alive < DUNGEON.maxMonsters && now - d.spawnAt >= DUNGEON.spawnMs) {
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
    const reward = dungeonReward(this.s, { kills: d.kills, bossKills: d.bossKills, dmg: d.dmg }, this.buffs(), this.rng);
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

  /** 저장용 hp 반영 */
  writeHp() {
    this.s.hp = Math.round(this.player.hp);
  }
}
