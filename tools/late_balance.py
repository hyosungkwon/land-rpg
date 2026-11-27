#!/usr/bin/env python3
"""land-rpg 후반(S60+) 밸런스 점검 — 실제 게임 코드를 그대로 돌려 상위 빌드의
스테이지별 처치 시간(TTK)·보스 클리어 여부·수입(골드/강화석/임대)을 측정한다.

tools/balance_sim.py 는 새 게임(S1)에서 2시간을 돌려 초·중반 곡선을 본다.
이 스크립트는 그 반대편 — 환생 특성·상위 전직·전설 장비·부동산을 갖춘 빌드가
S60~S95 에서 '벽'에 막히거나 수치가 급격히 무너지지 않는지 확인한다.

사용: python3 tools/late_balance.py [--profile mid|high] [--hunt 30]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import balance_sim as bs  # noqa: E402  (QuickJS/Node 컨텍스트·번들러 재사용)

PROBE = r"""
(function (profile, stages, huntSecs) {
  const now = 1700000000000;
  const T0 = now;
  const raw = (x) => JSON.parse(JSON.stringify(x));

  function build(p) {
    const s = defaultState(now);
    s.level = p.level; s.stage = p.stage; s.maxStage = p.stage; s.peakStage = p.stage;
    s.jobTier = p.jobTier;
    s.gold = p.gold; s.shards = p.shards;
    for (const k of Object.keys(s.equip)) s.equip[k] = p.equipLv;
    for (const k of Object.keys(s.gearRarity)) s.gearRarity[k] = p.rarity;
    s.rebirth.count = p.rebirthCount || 3;
    s.rebirth.bestStage = p.stage;
    s.rebirth.points = 0;
    s.rebirth.traits = Object.assign({}, p.traits);
    // 부동산 — 평탄하게 여러 지역 보유(건물주 버프 상한까지)
    let i = 0;
    for (const c of CITIES) {
      if (i >= p.cities) break;
      s.land.owned[c.key] = p.pyeong;
      i += 1;
    }
    // 펫 — 전 종 해금 · 장비/스킬/성채/메가
    for (const d of PETS) {
      s.pet.unlocked.push(d.id);
      s.pet.levels[d.id] = p.petLv || 0;
      s.pet.evo[d.id] = p.petEvo || 0;
    }
    s.pet.equipped = PETS[0].id;
    s.pet.sub = PETS[1].id;
    s.pet.chosen = true;
    for (const k of Object.keys(s.skills)) s.skills[k].lv = p.skillLv || 0;
    for (const k of Object.keys(s.citadel.levels)) s.citadel.levels[k] = p.citadel || 0;
    for (const k of Object.keys(s.mega)) s.mega[k] = p.mega || 0;
    s.records.peakEquipLv = p.equipLv * 5;
    s.records.peakJobTier = p.jobTier;
    return s;
  }

  const out = [];
  for (const stage of stages) {
    // ── 1) 일반 사냥 구간: huntSecs 초 동안 처치 수·골드·사망을 잰다
    const s = build(Object.assign({}, profile, { stage }));
    const buffs = computeBuffs(s, now);
    const b = new Battle(s, () => buffs, (function (seed) {
      let x = seed >>> 0;
      return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
    })(11), now);
    let t = now;
    const killsBefore = s.totalKills;
    const goldBefore = s.gold;
    const shardsBefore = s.shards;
    let deaths = 0;
    let bossStarts = 0, bossFails = 0, bossWins = 0, bossTimeMs = 0, bossAt = 0;
    let bossPeakHp = 0;
    const dt = 50;
    const end = t + huntSecs * 1000;
    while (t < end) {
      t += dt;
      b.tick(dt, t);
      for (const ev of b.drainEvents()) {
        if (ev.t === 'playerDeath') deaths += 1;
        if (ev.t === 'bossStart') { bossStarts += 1; bossAt = t; bossPeakHp = b.boss ? b.boss.hp : 0; }
        if (ev.t === 'bossFail') { bossFails += 1; bossTimeMs = Math.max(bossTimeMs, t - bossAt); }
        if (ev.t === 'stageClear') { bossWins += 1; bossTimeMs = Math.max(bossTimeMs, t - bossAt); }
      }
    }
    const killed = s.totalKills - killsBefore;
    const p = portfolioOf(s, t);
    const stats = b.stats;

    // ── 1b) 보스전 단독 측정: 보스 준비 상태에서 최대 70초(제한 60초)
    const sb = build(Object.assign({}, profile, { stage }));
    sb.killsInStage = ECON.normalKillsPerStage;
    sb.bossReady = true;
    const bb = new Battle(sb, () => computeBuffs(sb, now), () => 0.5, now);
    let tb = now;
    let bStart = 0, bWin = false, bFail = false, bTime = 0, bDeaths = 0;
    while (tb < now + 75000) {
      tb += dt;
      bb.tick(dt, tb);
      for (const ev of bb.drainEvents()) {
        if (ev.t === 'bossStart') bStart = tb;
        if (ev.t === 'stageClear') { bWin = true; bTime = tb - bStart; break; }
        if (ev.t === 'bossFail') { bFail = true; bTime = tb - bStart; break; }
        if (ev.t === 'playerDeath') bDeaths += 1;
      }
      if (bWin || bFail) break;
    }

    out.push({
      stage,
      level: s.level,
      atk: Math.round(stats.atk),
      dps: Math.round(stats.dps || 0),
      hp: Math.round(stats.hpMax),
      monsterHp: Math.round(monsterBaseHp(stage)),
      bossHp: Math.round(monsterBaseHp(stage) * ECON.bossHpMul),
      secPerKill: killed > 0 ? Math.round((huntSecs / killed) * 100) / 100 : null,
      kills: killed,
      goldPerMin: Math.round((s.gold - goldBefore) / (huntSecs / 60)),
      shardsPerMin: Math.round(((s.shards - shardsBefore) / (huntSecs / 60)) * 10) / 10,
      rentPerHour: Math.round(p.incomePerHour),
      deaths,
      bossStarts, bossWins, bossFails,
      bossSec: bossTimeMs ? Math.round(bossTimeMs / 100) / 10 : null,
      cleared: s.stage - stage,
      soloBoss: { start: !!bStart, win: bWin, fail: bFail, sec: bTime ? Math.round(bTime / 100) / 10 : null, deaths: bDeaths },
      buffs: { atk: buffs.atkPct, gold: buffs.goldPct, crit: buffs.critPct, critDmg: stats.critDmgPct || 0 },
    });
  }

  // ── 2) 장비 성장 비용 곡선: +N강 1회 비용(강화석) vs 그 스테이지의 강화석 수입
  const costRows = [];
  for (const stage of stages) {
    const s = build(Object.assign({}, profile, { stage }));
    const row = { stage: stage };
    for (const lv of [50, 80, 90, 95, 99]) {
      s.equip.weapon = lv;
      row['cost' + lv] = Math.round(enhanceCostFor(s, lv));
    }
    s.equip.weapon = profile.equipLv;
    row.shardPrice = Math.round(shardPrice(s));
    costRows.push(row);
  }

  return JSON.stringify({ rows: out, costs: costRows });
})
"""


def main():
    profile_name = "mid"
    hunt = 30
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--profile" and i + 1 < len(args):
            profile_name = args[i + 1]
        if a == "--hunt" and i + 1 < len(args):
            hunt = float(args[i + 1])

    # level: 그 스테이지에서 흔히 도달하는 레벨대, equipLv: 강화 단계, cities: 보유 지역 수
    profiles = {
        "mid": {  # 2~3회차 · 전설 장비 · 상위 빌드 절반
            "level": 80, "jobTier": 5, "equipLv": 80, "rarity": "legend",
            "gold": 5_000_000, "shards": 20_000, "cities": 40, "pyeong": 20,
            "skillLv": 12, "citadel": 6, "mega": 2, "petLv": 6, "petEvo": 1,
            "traits": { "atk": 10, "hp": 8, "guard": 6, "regen": 6, "gold": 8, "shard": 6, "critDmg": 6, "startGold": 3 },
            "rebirthCount": 3,
        },
        "high": {  # 5회차+ · 만강 전설 · 상위 빌드 끝
            "level": 110, "jobTier": 5, "equipLv": 100, "rarity": "legend",
            "gold": 50_000_000, "shards": 120_000, "cities": 70, "pyeong": 30,
            "skillLv": 20, "citadel": 10, "mega": 4, "petLv": 10, "petEvo": 2,
            "traits": { "atk": 18, "hp": 16, "guard": 14, "regen": 12, "gold": 16, "shard": 14, "critDmg": 14, "startGold": 6 },
            "rebirthCount": 6,
        },
        "max": {  # 모든 영구 성장 최대 — 여기서 더 오를 곳이 없는 상태
            "level": 130, "jobTier": 5, "equipLv": 100, "rarity": "legend",
            "gold": 500_000_000, "shards": 1_000_000, "cities": 120, "pyeong": 40,
            "skillLv": 20, "citadel": 10, "mega": 4, "petLv": 10, "petEvo": 2,
            "traits": { "atk": 20, "hp": 20, "guard": 20, "regen": 20, "gold": 20, "shard": 20, "critDmg": 20, "startGold": 20 },
            "rebirthCount": 10,
        },
    }
    profile = profiles[profile_name]
    stages = [55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105]

    ctx = bs.quickjs.Context()
    ctx.eval(bs.bundle(bs.FILES))
    res = json.loads(ctx.eval(f"({PROBE})({json.dumps(profile)}, {json.dumps(stages)}, {hunt})"))

    print(f"■ 후반 밸런스 프로브 — profile={profile_name} (level {profile['level']} · +{profile['equipLv']}강 {profile['rarity']} · 용신 · 특성 atk {profile['traits']['atk']}Lv · {profile['cities']}곳×{profile['pyeong']}평)")
    print(f"  사냥 측정 {hunt:g}초/스테이지 · 장비 옵션(흡혈 등) 미포함 = 보수적 하한\n")
    print("  S    몬스터HP   보스HP    공격력     DPS     초/킬  분당골드  분당강화석  임대/h   사망  보스(승/패)  보스초  클리어  보스단독(승/패·초)")
    for r in res["rows"]:
        sb = r["soloBoss"]
        solo = f"{'승' if sb['win'] else '패' if sb['fail'] else '미시작'} {sb['sec'] if sb['sec'] is not None else '-'}s 사망{sb['deaths']}"
        print(
            f"  S{r['stage']:<3} {r['monsterHp']:>9,} {r['bossHp']:>9,} {r['atk']:>8,} {r['dps']:>7,} "
            f"{str(r['secPerKill']):>6} {r['goldPerMin']:>9,} {r['shardsPerMin']:>10} {r['rentPerHour']:>8,} "
            f"{r['deaths']:>4}  {r['bossWins']}/{r['bossFails']:<9} {str(r['bossSec']):>6}  {r['cleared']:>3}   {solo}"
        )
    print("\n■ 강화석 비용 곡선 (1회 강화 비용 · 그 스테이지 강화석 시세)")
    print("  S     +50강     +80강     +90강     +95강     +99강    시세(강화석 1개)")
    for c in res["costs"]:
        print(
            f"  S{c['stage']:<3} {c['cost50']:>9,} {c['cost80']:>9,} {c['cost90']:>9,} {c['cost95']:>9,} "
            f"{c['cost99']:>9,} {c['shardPrice']:>10,}"
        )


if __name__ == "__main__":
    main()
