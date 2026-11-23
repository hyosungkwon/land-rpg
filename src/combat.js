// land-rpg / src/combat.js
// 자동 전투 시뮬레이션. DOM·Canvas 의존 없음 → 헤드리스 검증 가능.
// 렌더러는 이 객체의 엔티티를 읽고, UI는 events 큐를 소비한다.
import { ECON, SKILLS, stageDef, monsterKo } from './data.js';
import {
  calcStats, currentHp, skillEffect, killReward, registerKill, clearStage,
} from './state.js';

const ATTACK_STOP_GAP = 78; // 이 거리에서 멈추고 때린다

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
    this.syncStage();
    this.spawnInitial(startAt);
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
    const variant = 0.9 + this.rng() * 0.2;
    const base = isBoss
      ? { hp: ECON.monsterHpBase * Math.pow(ECON.monsterHpGrowth, this.s.stage - 1) * ECON.bossHpMul,
          atk: ECON.monsterAtkBase * Math.pow(ECON.monsterAtkGrowth, this.s.stage - 1) * ECON.bossAtkMul }
      : { hp: ECON.monsterHpBase * Math.pow(ECON.monsterHpGrowth, this.s.stage - 1) * variant,
          atk: ECON.monsterAtkBase * Math.pow(ECON.monsterAtkGrowth, this.s.stage - 1) };
    const scale = isBoss ? 1.5 : 0.92 + this.rng() * 0.22;
    return {
      id: this.nextId++,
      name,
      ko: monsterKo(name),
      isBoss: !!isBoss,
      x: isBoss ? ECON.spawnX + 40 : ECON.spawnX + this.rng() * 90,
      y: 0,
      hp: Math.round(base.hp),
      maxHp: Math.round(base.hp),
      atk: Math.max(1, Math.round(base.atk)),
      scale,
      lastAttack: now,
      hitAt: 0,
      dying: 0,
      dead: false,
      born: now,
      animSeed: this.rng() * Math.PI * 2,
    };
  }

  spawnInitial(now) {
    const n = 2;
    for (let i = 0; i < n; i++) this.spawnNormal(now - (n - i) * 350);
    this.lastSpawn = now;
  }

  spawnNormal(now) {
    if (this.boss) return;
    const normals = this._def.normals;
    // 스테이지마다 처치 수 기준으로 몬스터 종류를 돌려가며 등장
    const pick = normals[(this.s.totalKills + this.monsters.length) % normals.length];
    const m = this.makeMonster(pick, false, now);
    this.monsters.push(m);
  }

  /* ───────────── 틱 ───────────── */
  tick(dtMs, now = Date.now()) {
    const dt = Math.min(250, Math.max(0, dtMs));
    this.time += dt;
    if (now - this.lastStatsAt > 500) this.refreshStats(now);

    if (this.player.dead) {
      if (now >= this.player.reviveAt) {
        this.player.dead = false;
        this.player.hp = Math.round(this.stats.hpMax * 0.5);
        this.emit({ t: 'revive' });
      }
      return;
    }

    this.regen(dt);
    this.autoSkills(now);
    this.updateMonsters(dt, now);
    this.attack(now);
    this.maybeSpawn(now);
    this.bossLogic(now);
  }

  regen(dt) {
    const perSec = this.stats.hpMax * 0.012;
    if (this.player.hp < this.stats.hpMax) {
      this.player.hp = Math.min(this.stats.hpMax, this.player.hp + (perSec * dt) / 1000);
    }
  }

  updateMonsters(dt, now) {
    const p = this.player;
    for (const m of this.monsters) {
      if (m.dead) continue;
      if (m.dying) {
        if (now - m.dying > 450) m.dead = true;
        continue;
      }
      const dist = m.x - p.x;
      const stop = ATTACK_STOP_GAP + (m.isBoss ? 30 : 0);
      if (dist > stop) {
        const speed = m.isBoss ? 46 : 62 + (m.scale - 1) * 40; // 월드단위/초
        m.x = Math.max(p.x + stop, m.x - (speed * dt) / 1000);
      } else if (now - m.lastAttack > ECON.monsterAttackMs) {
        m.lastAttack = now;
        m.lunge = 1;
        const raw = m.atk * (0.88 + this.rng() * 0.24);
        this.damagePlayer(raw, m, now);
      }
      if (m.lunge) m.lunge = Math.max(0, m.lunge - dt / 220);
    }
    this.monsters = this.monsters.filter((m) => !m.dead);
  }

  damagePlayer(raw, from, now) {
    if (this.player.dead) return;
    const dmg = Math.max(1, Math.round(raw));
    this.player.hp -= dmg;
    this.player.hurtAt = now;
    this.emit({ t: 'playerHurt', dmg, from: from.ko });
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.player.dead = true;
      this.player.reviveAt = now + ECON.reviveMs;
      this.emit({ t: 'playerDeath' });
      if (this.boss) this.failBoss(now, 'dead');
    }
  }

  /* ───────────── 공격 ───────────── */
  attack(now) {
    if (now - this.player.lastAttack < this.stats.attackMs) return;
    const target = this.targets().find((m) => m.x - this.player.x <= ECON.playerRange);
    if (!target) return;
    this.player.lastAttack = now;
    this.player.attackAnim = 1;
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
    for (const m of list) {
      if (m.dead || m.dying) continue;
      const { dmg, crit } = this.roll(mul, now);
      m.hp -= dmg;
      m.hitAt = now;
      this.emit({ t: 'hit', id: m.id, dmg, crit, x: m.x, isBoss: m.isBoss, kind });
      if (m.hp <= 0) this.killMonster(m, now);
    }
  }

  killMonster(m, now) {
    m.hp = 0;
    m.dying = now;
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
    if (m.isBoss) this.defeatBoss(now);
    else if (this.s.bossReady && !this.boss) this.bossReadyAt = now;
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
      const heal = Math.round(this.stats.hpMax * skillEffect('heal', sk.lv));
      this.player.hp = Math.min(this.stats.hpMax, this.player.hp + heal);
      this.emit({ t: 'skill', key, ko: def.name, heal, color: def.color });
      return true;
    }
    if (key === 'berserk') {
      sk.last = now;
      this.berserkUntil = now + def.dur;
      this.emit({ t: 'skill', key, ko: def.name, color: def.color, dur: def.dur });
      return true;
    }
    if (!alive.length) return false;
    if (key === 'whirl') {
      sk.last = now;
      const inRange = alive.filter((m) => m.x - this.player.x <= ECON.playerRange * 1.6);
      this.hit(inRange.length ? inRange : alive, skillEffect('whirl', sk.lv), 'whirl', now);
      this.emit({ t: 'skill', key, ko: def.name, color: def.color });
      return true;
    }
    if (key === 'strike') {
      const target = alive.find((m) => m.x - this.player.x <= ECON.playerRange) || alive[0];
      sk.last = now;
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
    if (this.monsters.filter((m) => !m.dead && !m.dying).length >= ECON.maxMonsters) return;
    if (now - this.lastSpawn < 750) return;
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
    this.boss = boss;
    this.monsters.push(boss);
    this.bossEnds = now + ECON.bossTimeLimitMs;
    this.s.bossReady = false;
    this.bossReadyAt = 0;
    this.emit({ t: 'bossStart', name: boss.name, ko: boss.ko });
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

  /** 저장용 hp 반영 */
  writeHp() {
    this.s.hp = Math.round(this.player.hp);
  }
}
