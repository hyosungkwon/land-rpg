#!/usr/bin/env python3
"""land-rpg v3.0.0 게스트 통합판 검증 (QuickJS + 정적 검사)

1) 모든 JS 파일 문법(파싱) 검사
2) 게스트 전용 정적 검사 (Firebase/로그인 흔적 0, 저장 키 v3, sw 캐시 v3)
3) 통합 경제 단위 검증 (가격 스케일·매수/매도·임대·건물주 버프·강화석 시세·저장 정규화)
4) 밸런스 시뮬레이션 (1~10 쾌적 / 10~22 장비·버프 필요 / 방치보다 적극 플레이가 앞섬)

사용: python3 tools/verify_v3.py
"""
import json
import os
import re
import sys

import quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ["src/data.js", "src/land-data.js", "src/land.js", "src/state.js", "src/combat.js"]
ALL_JS = ["app.js", "sw.js", "src/data.js", "src/land-data.js", "src/land.js", "src/state.js", "src/combat.js", "src/render.js", "src/ui.js"]

passed = 0
failed = 0
failures = []


def ok(cond, label, detail=""):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        failures.append(label + (f" — {detail}" if detail else ""))
        print(f"  ✗ {label}" + (f" — {detail}" if detail else ""))


def section(t):
    print(f"\n■ {t}")


def read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()


def strip_module(src):
    src = re.sub(r"^import\s+[^;]+;", "", src, flags=re.M | re.S)
    src = re.sub(r"^export\s+(?=(const|let|var|function|class|async))", "", src, flags=re.M)
    return src.replace("export default ", "")


def module_js(src, extra=""):
    names = re.findall(r"^export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)", src, flags=re.M)
    body = strip_module(src).replace('"use strict";', "")
    tail = ";\n".join(f"exports.{n} = {n}" for n in names)
    return "(function(exports){\n" + body + "\n;" + tail + ";\n" + extra + "\n})(__m);\nObject.assign(globalThis, __m);"


def bundle(files, extras=None):
    extras = extras or {}
    return "\nglobalThis.__m = globalThis.__m || {};\n" + "\n".join(
        module_js(read(f), extras.get(f, "")) for f in files
    )


def js(ctx, expr):
    return json.loads(ctx.eval(f"JSON.stringify((function(){{ {expr} }})())"))


def main():
    ctx = quickjs.Context()

    section("[1] 문법 검사")
    for f in ALL_JS:
        try:
            ctx.eval("new Function(" + json.dumps(strip_module(read(f))) + ")")
            print(f"  syntax OK  {f}")
        except Exception as e:  # noqa: BLE001
            ok(False, f"문법 오류: {f}", str(e))

    section("[2] 게스트 전용 정적 검사")
    def strip_comments(src):
        return re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", src, flags=re.S))

    text_all = "\n".join(strip_comments(read(f)) for f in ALL_JS + ["index.html", "manifest.json"])
    for bad in ["firebase", "signInWithPopup", "Google 로그인", "gstatic", "firebaseio", "googleapis"]:
        ok(bad.lower() not in text_all.lower(), f"Firebase/로그인 흔적 없음: {bad}")
    ok("land_rpg_unified_v3" in read("src/data.js"), "저장 키 v3 분리")
    ok("land-rpg-v3.0.6" in read("sw.js"), "SW 캐시 버전 v3.0.6")
    ok(not os.path.exists(os.path.join(ROOT, "src/firebase.js")), "firebase.js 제거")
    ok(not os.path.exists(os.path.join(ROOT, "src/property.js")), "구 property.js 제거")
    sw = read("sw.js")
    core = re.findall(r"'\./([^']*)'", sw[sw.index("const CORE = "): sw.index("];", sw.index("const CORE = "))])
    core = ["./" + c if c else "./" for c in core]
    missing = [p for p in core if p != "./" and not os.path.exists(os.path.join(ROOT, p))]
    ok(not missing, "sw.js 프리캐시 파일 존재", ", ".join(missing))
    ok(not any("firebase" in p for p in core), "sw.js 프리캐시에 firebase 없음")
    ok("data-tab=\"settings\"" in read("index.html") and "data-tab=\"land\"" in read("index.html"), "탭 4종(사냥/장비/부동산/설정)")

    section("[3] 통합 경제 단위 검증")
    ctx.eval(bundle(FILES))
    r = js(ctx, """
      const s = defaultState(1000);
      return {
        key: SAVE_KEY, ver: s.ver, gold: s.gold, shards: s.shards, level: s.level, stage: s.stage,
        cities: CITIES.length, owned: Object.keys(s.land.owned).length,
      };
    """)
    ok(r["key"] == "land_rpg_unified_v3" and r["ver"] == 3, "새 저장 키/버전", json.dumps(r))
    ok(r["gold"] == 500 and r["shards"] == 8 and r["level"] == 1 and r["stage"] == 1 and r["owned"] == 0, "레벨1·스테이지1·골드500 새 시작", json.dumps(r))
    ok(r["cities"] == 229, "전국 229개 시군구", str(r["cities"]))

    pr = js(ctx, """
      const prices = CITIES.map(c => c.base);
      const sorted = CITIES.slice().sort((a,b)=>a.base-b.base);
      const gangnam = CITIES.find(c => c.name === '강남구');
      const s = defaultState(0);
      const cheap = sorted[0];
      return {
        min: Math.min(...prices), max: Math.max(...prices), gangnam: gangnam.base,
        cheapName: cheap.name, cheapBase: cheap.base,
        startMax: maxBuyQty(cheap.key, s, 0),
      };
    """)
    ok(pr["min"] <= 5000 and pr["cheapBase"] <= 5000, "최저 매물 5,000골드 이하", str(pr["cheapBase"]))
    ok(pr["gangnam"] >= 100000, "강남 등 고급 매물 수십만 골드", str(pr["gangnam"]))
    ok(pr["startMax"] >= 3, "시작 자금(500)으로 최소 3평 매수 가능", f"{pr['cheapName']} {pr['cheapBase']}/평 → {pr['startMax']}평")

    tr = js(ctx, """
      const s = defaultState(0);
      const c = CITIES.slice().sort((a,b)=>a.base-b.base)[0];
      const q = 3;
      const before = s.gold;
      const r = applyTrade(s, c.key, 'buy', q, 0);
      const p = portfolioOf(s, 0);
      const afterBuy = { gold: s.gold, owned: s.land.owned[c.key], value: Math.round(p.landValue), income: p.incomePerMin };
      const b = computeBuffs(s, 0);
      const sell = applyTrade(s, c.key, 'sell', q, 0);
      const p2 = portfolioOf(s, 0);
      return { ok: r.ok, total: r.quote.total, fee: r.quote.fee, before, afterBuy, buffs: b, sellOk: sell.ok, sellGold: s.gold, ownedAfterSell: s.land.owned[c.key] || 0, p2: Math.round(p2.totalAsset) };
    """)
    ok(tr["ok"] and tr["afterBuy"]["owned"] == 3, "매수 반영", json.dumps(tr["afterBuy"]))
    ok(tr["before"] - tr["afterBuy"]["gold"] == tr["total"] + tr["fee"], "매수 금액/수수료 차감")
    ok(tr["afterBuy"]["value"] > 0 and tr["afterBuy"]["income"] > 0, "매수 즉시 평가액·임대수익 발생", json.dumps(tr["afterBuy"]))
    ok(tr["buffs"]["atkPct"] > 0, "3평 매수 → 건물주 공격 버프 즉시 적용", str(tr["buffs"]["atkPct"]))
    ok(tr["sellOk"] and tr["ownedAfterSell"] == 0 and tr["sellGold"] > 0, "매도 반영", json.dumps({"g": tr["sellGold"]}))

    bf = js(ctx, """
      const s = defaultState(0);
      // 건물 40곳 × 3평 + 넓은 면적
      const cheap = CITIES.filter(c => c.base <= 3000).slice(0, 40);
      for (const c of cheap) { s.land.owned[c.key] = 3; }
      s.land.owned[cheap[0].key] = 12000;
      const b = computeBuffs(s, 0);
      const st0 = calcStats(s, { atkPct: 0, goldPct: 0, hpPct: 0, dropPct: 0, critPct: 0 });
      const st1 = calcStats(s, b);
      const pr = buffProgress(s, 0);
      return { b, atk0: st0.atk, atk1: st1.atk, hp0: st0.hpMax, hp1: st1.hpMax, crit0: st0.crit, crit1: st1.crit, next: pr.atk.next };
    """)
    ok(bf["b"]["atkPct"] == 60, "공격 버프 상한 60%", str(bf["b"]["atkPct"]))
    ok(bf["b"]["hpPct"] == 50 and bf["b"]["dropPct"] == 24, "체력/드롭 버프 계산", json.dumps(bf["b"]))
    ok(bf["atk1"] > bf["atk0"] and bf["hp1"] > bf["hp0"] and bf["crit1"] > bf["crit0"], "버프가 실제 스탯에 반영", json.dumps(bf))

    rent = js(ctx, """
      const s = defaultState(0);
      for (const c of CITIES.slice(0, 10)) s.land.owned[c.key] = 50;
      s.land.rentAt = 1000;
      const p = portfolioOf(s, 0);
      const g1 = accrueRent(s, 61000, 1);
      const num1 = s.land.accruedRent;
      const off = accrueRent(s, 121000, LAND.rentOfflineRate);
      const goldBefore = s.gold;
      const got = claimRent(s);
      return { income: Math.round(p.incomePerMin), g1: Math.round(g1), accrued: Math.round(num1), off: Math.round(off), goldGain: Math.round(s.gold - goldBefore), claimGot: Math.round(got), left: s.land.accruedRent };
    """)
    ok(abs(rent["g1"] - rent["income"]) <= 2, "1분 적립 = 분당 임대수익", json.dumps(rent))
    ok(rent["off"] > 0 and abs(rent["off"] - rent["g1"] * 0.25) <= 2, "오프라인 25% 적립", json.dumps(rent))
    tier = js(ctx, """
      return [0,1,2].map(ti => {
        const c = CITIES.find(c => c.tier === ti);
        return Math.round(c.rentPerMin * 60 / c.base * 1000) / 10;
      });
    """)
    ok(tier[0] == 18 and tier[1] == 12 and tier[2] == 8.4, "시간당 임대수익률 군 18%·시 12%·구 8.4%", json.dumps(tier))
    ok(rent["claimGot"] > 0 and rent["goldGain"] == rent["claimGot"] and rent["left"] < 1, "임대수익 수령 → 골드", json.dumps(rent))

    shop = js(ctx, """
      const s1 = defaultState(0); s1.stage = 1;
      const s2 = defaultState(0); s2.stage = 20;
      const p1 = shardPrice(s1), p2 = shardPrice(s2);
      s1.gold = 100000; s1.shards = 0;
      const r = buyShards(s1, 10);
      return { p1, p2, ok: r.ok, cost: r.cost, shards: s1.shards, gold: s1.gold };
    """)
    ok(shop["p2"] > shop["p1"], "강화석 시세는 스테이지에 따라 상승", json.dumps(shop))
    ok(shop["ok"] and shop["shards"] == 10 and shop["gold"] == 100000 - shop["cost"], "골드 → 강화석 구매", json.dumps(shop))

    sv = js(ctx, """
      const s = defaultState(1000);
      s.gold = 4321; s.land.owned['0_0_0'] = 7; s.land.accruedRent = 99.7;
      const raw = JSON.parse(JSON.stringify(s));
      const n = normalizeState(raw, 2000);
      const bad = normalizeState({ gold: -5, land: { owned: { a: -3, b: '4' } }, equip: { weapon: 999 } }, 2000);
      return { gold: n.gold, owned: n.land.owned['0_0_0'], rent: Math.round(n.land.accruedRent), badGold: bad.gold, badOwned: bad.land.owned, weapon: bad.equip.weapon, ver: n.ver };
    """)
    ok(sv["gold"] == 4321 and sv["owned"] == 7 and sv["rent"] == 100, "저장 정규화(정상값 유지)", json.dumps(sv))
    ok(sv["badGold"] == 0 and sv["badOwned"] == {"b": 4} and sv["weapon"] == 100, "저장 손상 방어", json.dumps(sv))

    sm = js(ctx, """
      const s = defaultState(0);
      s.stage = 1; s.killsInStage = 10; s.bossReady = true;
      const b = new Battle(s, () => ({}), (function(seed){let x=seed;return function(){x=(x*1664525+1013904223)>>>0;return x/4294967296;};})(3), 0);
      let t = 0, ev = {};
      for (let i=0;i<60000/50;i++){ t+=50; b.tick(50,t); for (const e of b.drainEvents()) ev[e.t]=(ev[e.t]||0)+1; }
      return { stage: s.stage, gold: s.gold, kills: s.totalKills, ev };
    """)
    ok(sm["kills"] > 5 and sm["ev"].get("monsterDeath", 0) > 5, "전투·보상 루프 동작", json.dumps(sm, ensure_ascii=False))

    section("[4] 탭 템플릿 렌더 검사 (DOM 없이)")
    ui_extras = {
        "src/ui.js": "exports.__tpls = { hunt: tplHunt, gear: tplGear, land: tplLand, settings: tplSettings, market: buildMarketList };"
    }
    ctx2 = quickjs.Context()
    ctx2.eval(bundle(FILES + ["src/ui.js"], ui_extras))
    tpl = js(ctx2, """
      const s = defaultState(0);
      s.gold = 90000; s.shards = 320; s.level = 12; s.stage = 7; s.maxStage = 7; s.killsInStage = 4;
      s.equip.weapon = 6; s.records.playMs = 1234567;
      for (const c of CITIES.slice(0, 5)) s.land.owned[c.key] = 40;
      s.land.accruedRent = 1234.5; s.land.bestAsset = 50000; s.land.tradeCount = 3; s.land.taxPaid = 120;
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(7), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {} };
      const out = {};
      for (const [k, fn] of Object.entries(__tpls)) {
        if (k === 'market') continue;
        let html = '';
        for (const sub of ['home', 'market', 'buff']) { s.land.sub = sub; html += fn(ui); }
        out[k] = html;
      }
      out.market = __tpls.market(ui).html;
      const emptyS = defaultState(0);
      const ui2 = { s: emptyS, battle: { stats: calcStats(emptyS, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: {} }, logs: [], tab: 'land', el: {} };
      out.emptyLand = __tpls.land(ui2);
      out.bad = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, /undefined|NaN|\[object Object\]/.test(v)]).filter(([, v]) => v));
      out.lens = Object.fromEntries(Object.entries(out).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, v.length]));
      return out;
    """)
    ok(not tpl["bad"], "템플릿에 undefined/NaN 누출 없음", json.dumps(tpl.get("bad"), ensure_ascii=False))
    ok(all(v > 200 for v in tpl["lens"].values()), "모든 탭/서브탭이 렌더됨", json.dumps(tpl["lens"]))
    ok("매물" in tpl["land"] and "건물주" in tpl["land"], "부동산 탭 구성", "")
    ok("강화석 구매" in tpl["gear"] and "장비 강화" in tpl["gear"], "장비 탭 구성", "")
    ok("게임 초기화" in tpl["settings"] and "localStorage" in tpl["settings"], "설정 탭 구성", "")

    section("[5] 밸런스 시뮬레이션 (60분)")
    import importlib.util
    spec = importlib.util.spec_from_file_location("bs", os.path.join(ROOT, "tools/balance_sim.py"))
    bs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bs)
    active = bs.run(ctx, 1.0, True, True, True)
    passive = bs.run(ctx, 1.0, False, False, False)
    s10 = bs.stage_at(active["marks"], 10)
    s22 = bs.stage_at(active["marks"], 30)
    ok(bs.stage_at(active["marks"], 5) >= 8, "5분 내 8스테이지 이상 (초반 쾌적)", f"S{bs.stage_at(active['marks'], 5)}")
    ok(s10 >= 12, "10분 내 12스테이지 (1~10 쾌적)", f"S{s10}")
    ok(s22 >= 20, "30분 내 20스테이지 (중반 돌파)", f"S{s22}")
    ok(active["end"]["stage"] > passive["end"]["stage"], "적극 플레이 > 방치", f"적극 S{active['end']['stage']} vs 방치 S{passive['end']['stage']}")
    ok(passive["end"]["stage"] <= 22, "방치는 22스테이지에서 막힘", f"S{passive['end']['stage']}")
    ok(passive["end"]["equip"]["weapon"] == 0 and passive["end"]["gold"] > 0, "방치 봇은 강화/매수 안 함(대조군)")
    fails = active["bossFails"]
    attempts = active["bossStarts"]
    ok(attempts > 20 and fails / max(1, attempts) < 0.75, "보스 실패율 과다 아님", f"{fails}/{attempts}")
    print(f"  · 적극: 5분 S{bs.stage_at(active['marks'], 5)} · 10분 S{s10} · 30분 S{s22} · 60분 S{active['end']['stage']} · 보스 {attempts}회/실패 {fails}회")
    print(f"  · 방치: 60분 S{passive['end']['stage']} · 보스 {passive['bossStarts']}회/실패 {passive['bossFails']}회")

    print(f"\n통과 {passed} / 실패 {failed}")
    if failures:
        print("실패 항목:\n - " + "\n - ".join(failures))
        return 1
    print("✅ v3 게스트 통합판 검증 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
