// land-rpg / src/combat.js
// 자동 전투 시뮬레이션. DOM·Canvas 의존 없음 → 헤드리스 검증 가능.
// 렌더러는 이 객체의 엔티티를 읽고, UI는 events 큐를 소비한다.
import { ECON, SKILLS, stageDef, monsterKo } from './data.js';
import {
  calcStats, currentHp, skillEffect, killReward, registerKill, clearStage, monsterStats,
} from './state.js';
import { DUNGEON, PET_ATTACK_MS, equippedPet, petDmgPct, dungeonReward } from './meta.js';

const ATTACK_STOP_GAP = 260; // 이 거리에서 멈추고 때린다(캐릭터 스프라이트가 겹치지 않는 간격)
const QUEUE_GAP = 300; // 뒤에 줄 서는 몬스터가 벌어지는 간격

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
    const variant = 0.9 + this.rng() * 0.2;
    const base = monsterStats(this.s.stage, isBoss, variant);
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
      knock: 0,      // 피격 넉백(월드 단위)
      lungeAt: 0,    // 캐릭터를 향해 돌진한 시각
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
    // 같은 위치에서 겹쳐 나오지 않도록 오른쪽 몬스터 뒤로 최소 간격을 띄운다.
    // 이미 줄이 길면(화면 밖) 잠시 대기 → 화면 밖 몬스터의 체력바만 떠 보이는 현상 방지
    const right = this.monsters.reduce((mx, o) => (o.x > mx ? o.x : mx), 0);
    if (right > 780) return;
    if (m.x < right + 150) m.x = right + 150;
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
        this.emit({ t: 'revive' });
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
    const perSec = this.stats.hpMax * 0.012;
    if (this.player.hp < this.stats.hpMax) {
      this.player.hp = Math.min(this.stats.hpMax, this.player.hp + (perSec * dt) / 1000);
    }
  }

  updateMonsters(dt, now) {
    const p = this.player;
    // 앞에서부터 줄을 세운다: 가장 앞 몬스터만 캐릭터 옆에 붙고, 나머지는 뒤에 대기
    const alive = this.monsters
      .filter((m) => !m.dead && !m.dying)
      .sort((a, b) => (b.isBoss ? 1 : 0) - (a.isBoss ? 1 : 0) || a.x - b.x);
    let ahead = p.x + ATTACK_STOP_GAP;
    for (const m of alive) {
      if (!Number.isFinite(m.x)) m.x = ECON.spawnX;
      if (!Number.isFinite(m.hp)) m.hp = m.maxHp;
      const standX = ahead + (m.isBoss ? 60 : 0);
      ahead = standX + QUEUE_GAP * (m.isBoss ? 1.5 : 1);
      const dist = m.x - p.x;
      if (m.x > standX + 2) {
        const speed = m.isBoss ? 62 : 96 + (m.scale - 1) * 40; // 월드단위/초
        m.x = Math.max(standX, m.x - (speed * dt) / 1000);
      } else if (dist <= ATTACK_STOP_GAP + (m.isBoss ? 100 : 40) && now - m.lastAttack > ECON.monsterAttackMs) {
        m.lastAttack = now;
        m.lunge = 1;
        m.lungeAt = now;
        const raw = m.atk * (0.88 + this.rng() * 0.24);
        this.damagePlayer(raw, m, now);
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
      if (this.dungeon) this.endDungeon(now); // 쓰러지면 던전 종료(그때까지의 보상 지급)
    }
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
    for (const m of list) {
      if (m.dead || m.dying) continue;
      const { dmg, crit } = this.roll(mul, now);
      m.hp -= dmg;
      m.hitAt = now;
      m.knock = Math.min(30, (m.knock || 0) + (crit ? 18 : 10));
      if (this.dungeon) this.dungeon.dmg += dmg;
      hits++;
      this.emit({ t: 'hit', id: m.id, dmg, crit, x: m.x, isBoss: m.isBoss, kind });
      if (m.hp <= 0) this.killMonster(m, now);
    }
    return hits;
  }

  killMonster(m, now) {
    m.hp = 0;
    m.dying = now;
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
