#!/usr/bin/env python3
"""land-rpg v3.2.0 검증 (QuickJS + 정적 검사)

1) 모든 JS 파일 문법(파싱) 검사
2) 정적 검사 (Firebase/로그인 흔적 0, 저장 키 v3, sw 캐시 v3.1)
3) 통합 경제 단위 검증 (가격 스케일·매수/매도·임대·건물주 버프·강화석 시세·저장 정규화)
4) 장비 뽑기·등급·연출·효과음 검사 (v3.1)
5) 밸런스 시뮬레이션 (1~10 쾌적 / 10~22 장비·버프 필요 / 방치보다 적극 플레이가 앞섬)

사용: python3 tools/verify_v3.py
"""
import json
import os
import re
import sys

import quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ["src/data.js", "src/land-data.js", "src/land.js", "src/meta.js", "src/state.js", "src/combat.js"]
ALL_JS = ["app.js", "sw.js", "src/data.js", "src/land-data.js", "src/land.js", "src/meta.js", "src/state.js", "src/combat.js", "src/render.js", "src/ui.js", "src/sound.js"]

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
    ok("land-rpg-v3.2.0" in read("sw.js"), "SW 캐시 버전 v3.2.0")
    ok("APP_VERSION = '3.2.0'" in read("src/data.js"), "앱 버전 v3.2.0")
    ok(os.path.exists(os.path.join(ROOT, "src/sound.js")), "src/sound.js 존재")
    ok("'./src/sound.js'" in read("sw.js"), "sw.js 프리캐시에 sound.js 포함")
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
    ok("장비 뽑기" in tpl["gear"] and "10회 연속" in tpl["gear"], "장비 탭 상단 뽑기 카드", "")
    ok("천장" in tpl["gear"] and "자동 분해" in tpl["gear"], "뽑기 천장/분해 안내", "")
    ok("전설" in tpl["gear"] and "영웅" in tpl["gear"], "뽑기 확률 안내(전설·영웅)", "")
    ok("게임 초기화" in tpl["settings"] and "localStorage" in tpl["settings"], "설정 탭 구성", "")
    ok("효과음" in tpl["settings"], "설정 탭 효과음 토글", "")

    section("[5] 장비 뽑기 · 등급 연출 · 효과음 (v3.1)")
    rar = js(ctx, """
      return {
        names: RARITIES.map(r => r.name),
        ids: RARITIES.map(r => r.id),
        colors: RARITIES.map(r => r.color),
        bonus: RARITIES.map(r => r.bonusLv),
        weightSum: RARITIES.reduce((a, r) => a + r.weight, 0),
        fire: !!RARITIES[4].fire,
        legendSlash: RARITIES[4].slash.mid,
      };
    """)
    ok(rar["names"] == ["일반", "고급", "레어", "영웅", "전설"], "등급 5단계 순서", json.dumps(rar["names"], ensure_ascii=False))
    ok(rar["weightSum"] == 100, "등급 확률 합 100%", str(rar["weightSum"]))
    ok(len(set(rar["colors"])) == 5, "등급별 고유 색", json.dumps(rar["colors"]))
    ok(rar["bonus"] == [0, 4, 9, 16, 25], "등급 보정 레벨(+0/4/9/16/25)", json.dumps(rar["bonus"]))
    ok(rar["fire"] is True and rar["ids"][4] == "legend", "전설=불타는 적금빛 플래그", str(rar["fire"]))

    def rgb(h):
        return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

    cols = [rgb(x) for x in rar["colors"]]
    ok(cols[0][0] > 200 and cols[0][1] > 150 and cols[0][2] < 140, "일반=황금", str(rar["colors"][0]))
    ok(cols[1][1] == max(cols[1]) and cols[1][1] > cols[1][0], "고급=초록", str(rar["colors"][1]))
    ok(cols[2][2] == max(cols[2]) and cols[2][2] > cols[2][0], "레어=파랑", str(rar["colors"][2]))
    ok(cols[3][0] > 140 and cols[3][2] > 200 and cols[3][1] < cols[3][2], "영웅=보라", str(rar["colors"][3]))
    ok(cols[4][0] == max(cols[4]) and cols[4][1] < cols[4][0] and cols[4][2] < 120, "전설=적금빛", str(rar["colors"][4]))

    gc = js(ctx, """
      return {
        g1: gachaCost('gold', 1).amount, g10: gachaCost('gold', 10).amount,
        s1: gachaCost('shards', 1).amount, s10: gachaCost('shards', 10).amount,
      };
    """)
    ok(gc["g1"] == 600 and gc["g10"] == 5400 and gc["s1"] == 10 and gc["s10"] == 90, "뽑기 가격(골드/강화석·10% 할인)", json.dumps(gc))

    p1 = js(ctx, """
      const s = defaultState(0); s.gold = 1000; s.shards = 0;
      const atk0 = calcStats(s, {}).atk;
      const r = pullGear(s, 1, (function(){const a=[0.999,0.0];let i=0;return function(){return a[(i++)%a.length];};})());
      return { ok: r.ok, rarity: s.gearRarity.weapon, gold: s.gold, spent: r.spent, pity: s.gacha.pity,
               atk0, atk1: calcStats(s, {}).atk, equipped: r.results[0].equipped, best: s.gacha.best };
    """)
    ok(p1["ok"] and p1["gold"] == 400 and p1["spent"] == 600, "1회 뽑기 골드 차감", json.dumps(p1))
    ok(p1["rarity"] == "legend" and p1["equipped"] is True, "높은 등급 자동 장착", json.dumps(p1))
    ok(p1["atk1"] > p1["atk0"], "등급이 실제 스탯에 반영", f"공격력 {p1['atk0']} → {p1['atk1']}")
    ok(p1["pity"] == 0 and p1["best"] == "legend", "전설 획득 → 천장 초기화·최고등급 기록", json.dumps(p1))

    p2 = js(ctx, """
      const s = defaultState(0); s.gold = 5000; s.shards = 0; s.gearRarity.weapon = 'legend';
      const r = pullGear(s, 1, (function(){const a=[0.999,0.0];let i=0;return function(){return a[(i++)%a.length];};})());
      return { rarity: s.gearRarity.weapon, shards: s.shards, equipped: r.results[0].equipped, dust: r.results[0].shards };
    """)
    ok(p2["rarity"] == "legend" and p2["equipped"] is False, "동급 중복은 장착하지 않음", json.dumps(p2))
    ok(p2["shards"] == 70 and p2["dust"] == 70, "중복 장비 → 강화석 자동 분해", json.dumps(p2))

    p3 = js(ctx, """
      const s = defaultState(0); s.gold = 600; s.shards = 0; s.gearRarity.weapon = 'advanced';
      const r = pullGear(s, 1, (function(){const a=[0.999,0.0];let i=0;return function(){return a[(i++)%a.length];};})());
      return { rarity: s.gearRarity.weapon, shards: s.shards, equipped: r.results[0].equipped, replaced: r.results[0].replaced };
    """)
    ok(p3["rarity"] == "legend" and p3["equipped"] is True and p3["replaced"] == "advanced" and p3["shards"] == 6, "교체 장착 + 이전 등급 분해", json.dumps(p3))

    p4 = js(ctx, """
      const s = defaultState(0); s.gold = 5400; s.shards = 0;
      const r = pullGear(s, 10, () => 0);
      const idx = r.results.map(x => RARITY_INDEX[x.rarity]);
      return { ok: r.ok, len: r.results.length, gold: s.gold, maxIdx: Math.max.apply(null, idx), spent: r.spent,
               pity: s.gacha.pity, total: s.gacha.total, slots: r.results.every(x => !!EQUIP[x.slot]) };
    """)
    ok(p4["ok"] and p4["len"] == 10 and p4["gold"] == 0 and p4["spent"] == 5400, "10회 연속 뽑기(5,400골드)", json.dumps(p4))
    ok(p4["maxIdx"] >= 2, "10회 최소 레어 1개 보장", json.dumps(p4))
    ok(p4["pity"] == 10 and p4["total"] == 10 and p4["slots"] is True, "천장 카운터·부위 배정", json.dumps(p4))

    p5 = js(ctx, """
      const s = defaultState(0); s.gold = 600; s.gacha.pity = 39;
      const r = pullGear(s, 1, () => 0);
      return { rarity: r.results[0].rarity, pity: s.gacha.pity, left: r.pityLeft };
    """)
    ok(p5["rarity"] == "legend" and p5["pity"] == 0 and p5["left"] == 40, "40회 천장 → 전설 확정", json.dumps(p5))

    p6 = js(ctx, """
      const s = defaultState(0); s.gold = 100;
      const r = pullGear(s, 1);
      return { ok: r.ok, reason: r.reason, gold: s.gold, total: s.gacha.total };
    """)
    ok(p6["ok"] is False and p6["gold"] == 100 and p6["total"] == 0, "재화 부족 시 뽑기 거부", json.dumps(p6, ensure_ascii=False))

    p7 = js(ctx, """
      const s = defaultState(0); s.shards = 100; s.gacha.cur = 'shards';
      const r = pullGear(s, 1, (function(){const a=[0.999,0.0];let i=0;return function(){return a[(i++)%a.length];};})());
      return { cur: r.cur, spent: r.spent, shards: s.shards, rarity: s.gearRarity.weapon };
    """)
    ok(p7["cur"] == "shards" and p7["spent"] == 10 and p7["shards"] == 90 and p7["rarity"] == "legend", "강화석 결제 뽑기", json.dumps(p7))

    nv = js(ctx, """
      const old = { ver: 3, level: 16, exp: 120, gold: 12345, shards: 77,
        equip: { weapon: 7, armor: 3, helmet: 2, ring: 1, amulet: 4 }, skills: { strike: { lv: 2, last: 5 } },
        stage: 7, killsInStage: 4, maxStage: 7, bossReady: false,
        land: { owned: { '0_0_0': 3 }, accruedRent: 10 }, records: { totalGold: 900 } };
      const n = normalizeState(old, 0);
      const bad = normalizeState({ gearRarity: { weapon: 'dragon' }, gacha: { pity: 999, cur: 'cash', best: 'dragon', total: -5 }, soundOn: false }, 0);
      const was = normalizeState(JSON.parse(JSON.stringify(n)), 0);
      return {
        level: n.level, gold: n.gold, weapon: n.equip.weapon, owned: n.land.owned['0_0_0'],
        gr: n.gearRarity, pity: n.gacha.pity, cur: n.gacha.cur, sound: n.soundOn, stable: was.gold === n.gold && was.level === 16,
        badGr: bad.gearRarity.weapon, badPity: bad.gacha.pity, badCur: bad.gacha.cur, badBest: bad.gacha.best, badSound: bad.soundOn,
      };
    """)
    ok(nv["level"] == 16 and nv["gold"] == 12345 and nv["weapon"] == 7 and nv["owned"] == 3 and nv["stable"] is True, "기존 v3 저장 진행도 유지", json.dumps(nv.get("pity")))
    ok(nv["gr"]["weapon"] == "common" and nv["pity"] == 0 and nv["cur"] == "gold" and nv["sound"] is True, "신규 필드 기본값 병합", json.dumps(nv["gr"]))
    ok(nv["badGr"] == "common" and nv["badPity"] == 39 and nv["badCur"] == "gold" and nv["badBest"] == "common" and nv["badSound"] is False, "손상된 등급/천장/사운드 방어", json.dumps({k: nv[k] for k in ['badGr', 'badPity', 'badCur', 'badBest', 'badSound']}))

    rsrc = read("src/render.js")
    ok("BOSS APPEAR" in rsrc, "BOSS 등장 경고 배너 구현")
    ok("spawnLoot" in rsrc and "drawLoot" in rsrc and "onLoot" in rsrc, "코인/보석 자석 드롭 구현")
    ok("drawAura" in rsrc and "RARITIES" in rsrc and "drawSlash" in rsrc, "등급 오라·검기 색 구현")
    ok("rgba(70,6,0,0.92)" in rsrc and "crit" in rsrc, "크리티컬 강조 숫자 렌더")
    ssrc = read("src/sound.js")
    ok("AudioContext" in ssrc and "createOscillator" in ssrc and "createBuffer" in ssrc, "Web Audio 합성음 구현")
    ok(all(k in ssrc for k in ["hit(crit", "coin(kind", "boss()", "gacha(rarity", "unlock()"]), "효과음 5종·unlock 구현")
    ok("soundBtn" in read("index.html"), "상단 스피커 아이콘")
    ok("bindAudioUnlock" in read("app.js") and "toggleSound" in read("app.js") and "pullGacha" in read("app.js"), "첫 터치 unlock·효과음 토글·뽑기 액션 연결")
    ok("data-action=\"toggle-sound\"" in read("src/ui.js"), "설정 탭 효과음 스위치")


    section("[6] 🐾 펫 · 🔥 전직 · 황금 던전 (v3.2)")
    petdef = js(ctx, """
      return {
        ids: PETS.map(p => p.id),
        names: PETS.map(p => p.name),
        sprites: PETS.map(p => p.sprite),
        dmg: PETS.map(p => p.dmgPct),
        atk: PETS.map(p => p.atkPct),
        gold: PETS.map(p => p.goldPct),
        types: PETS.map(p => p.unlock.type + ':' + p.unlock.n),
        conds: PETS.map(p => p.cond),
      };
    """)
    ok(petdef["names"] == ["꼬마 늑대", "불여우", "황금 부엉이", "아기 드래곤"], "펫 4종 정의(이름 순서)", json.dumps(petdef["names"], ensure_ascii=False))
    ok(petdef["types"] == ["cities:1", "pyeong:100", "asset:50000", "cities:10"], "펫 해금 조건(지역1·100평·총자산5만·지역10)", json.dumps(petdef["types"]))
    ok(all(d > 0 for d in petdef["dmg"]) and max(petdef["dmg"]) == petdef["dmg"][3], "펫 피해 비율(최강은 아기 드래곤)", json.dumps(petdef["dmg"]))
    ok(all(s.startswith("pet_") for s in petdef["sprites"]), "펫 스프라이트 키", json.dumps(petdef["sprites"]))

    unlock = js(ctx, """
      const s = defaultState(0);
      const r0 = syncPets(s, 0);
      const sorted = CITIES.slice().sort((a, b) => a.base - b.base);
      const cheap = sorted[0];
      applyTrade(s, cheap.key, 'buy', 3, 0);
      const r1 = syncPets(s, 0);
      const afterWolf = { equipped: s.pet.equipped, newly: r1.newly.slice() };
      s.land.owned[cheap.key] = 120;
      const r2 = syncPets(s, 0);
      const afterFox = { equipped: s.pet.equipped, newly: r2.newly.slice(), asset: Math.round(portfolioOf(s, 0).totalAsset) };
      s.gold = 60000;
      const r3 = syncPets(s, 0);
      const afterOwl = { equipped: s.pet.equipped, newly: r3.newly.slice() };
      for (const c of sorted.slice(0, 10)) if (!s.land.owned[c.key]) s.land.owned[c.key] = 1;
      const r4 = syncPets(s, 0);
      const afterDragon = { equipped: s.pet.equipped, newly: r4.newly.slice(), unlocked: s.pet.unlocked.slice() };
      const manual = equipPet(s, 'wolf');
      const r5 = syncPets(s, 0);
      return { r0: r0.newly, afterWolf, afterFox, afterOwl, afterDragon, manual: manual.ok, chosen: s.pet.chosen, afterManual: s.pet.equipped, newly5: r5.newly };
    """)
    ok(unlock["r0"] == [] and unlock["afterWolf"]["newly"] == ["wolf"] and unlock["afterWolf"]["equipped"] == "wolf", "지역 1곳 → 꼬마 늑대 자동 해금·동행", json.dumps(unlock["afterWolf"], ensure_ascii=False))
    ok(unlock["afterFox"]["newly"] == ["fox"] and unlock["afterFox"]["equipped"] == "fox", "100평 → 불여우 해금·교체", json.dumps(unlock["afterFox"], ensure_ascii=False))
    ok(unlock["afterOwl"]["newly"] == ["owl"] and unlock["afterOwl"]["equipped"] == "owl", "총자산 5만 → 황금 부엉이 해금", json.dumps(unlock["afterOwl"], ensure_ascii=False))
    ok(unlock["afterDragon"]["newly"] == ["dragon"] and unlock["afterDragon"]["equipped"] == "dragon", "지역 10곳 → 아기 드래곤 해금", json.dumps(unlock["afterDragon"], ensure_ascii=False))
    ok(unlock["manual"] is True and unlock["afterManual"] == "wolf" and unlock["newly5"] == [], "직접 고른 펫은 자동 교체하지 않음", json.dumps({"manual": unlock["manual"], "eq": unlock["afterManual"]}, ensure_ascii=False))

    petstat = js(ctx, """
      const s = defaultState(0);
      s.level = 20;
      const base = calcStats(s, {});
      s.pet = { equipped: 'dragon', unlocked: ['wolf', 'dragon'], chosen: true };
      const withPet = calcStats(s, {});
      const pr = petProgress(s, 'fox', 0);
      return {
        atk0: base.atk, atk1: withPet.atk, gold0: base.goldMult, gold1: withPet.goldMult,
        petId: withPet.petId, prog: { pct: Math.round(pr.pct * 100), text: pr.text, ok: pr.ok },
      };
    """)
    ok(petstat["atk1"] > petstat["atk0"] and petstat["gold1"] > petstat["gold0"] and petstat["petId"] == "dragon", "펫 패시브가 실제 스탯·골드에 반영", json.dumps(petstat, ensure_ascii=False))
    ok(petstat["prog"]["ok"] is False and 0 <= petstat["prog"]["pct"] <= 100, "펫 해금 진행도 표시", json.dumps(petstat["prog"], ensure_ascii=False))

    job = js(ctx, """
      const s = defaultState(0);
      const p1 = jobProgress(s);
      s.level = 12; s.maxStage = 8;
      const p2 = jobProgress(s);
      const atk0 = calcStats(s, {}).atk;
      const hp0 = calcStats(s, {}).hpMax;
      const r1 = promoteJob(s, 1000);
      const atk1 = calcStats(s, {}).atk;
      const hp1 = calcStats(s, {}).hpMax;
      const early = promoteJob(s, 2000);
      s.level = 60; s.maxStage = 40;
      const r2 = promoteJob(s, 3000);
      const r3 = promoteJob(s, 4000);
      const r4 = promoteJob(s, 5000);
      return {
        names: JOBS.map(j => j.name), tiers: JOBS.map(j => j.tier),
        p1: p1.canPromote, p2: p2.canPromote, reason: p1.reason,
        ok1: r1.ok, tier1: r1.ok ? r1.to.tier : -1, atk0, atk1, hp0, hp1,
        early: early.ok, ok2: r2.ok, ok3: r3.ok, final: r4.ok, maxTier: s.jobTier,
        atkPct: JOBS[3].atkPct, hpPct: JOBS[3].hpPct,
      };
    """)
    ok(job["names"] == ["견습 기사", "왕국 기사", "성기사", "드래곤 나이트"] and job["tiers"] == [0, 1, 2, 3], "전직 4단계 정의", json.dumps(job["names"], ensure_ascii=False))
    ok(job["p1"] is False and job["p2"] is True, "전직 조건(레벨·스테이지) 판정", json.dumps({"p1": job["p1"], "p2": job["p2"]}))
    ok(job["ok1"] is True and job["tier1"] == 1 and job["atk1"] > job["atk0"] and job["hp1"] > job["hp0"], "전직 시 영구 공격력·체력 배율", f"{job['atk0']}→{job['atk1']} / {job['hp0']}→{job['hp1']}")
    ok(job["early"] is False and job["ok2"] is True and job["ok3"] is True and job["final"] is False and job["maxTier"] == 3, "전직은 단계별로만·최종 4단계", json.dumps({k: job[k] for k in ["early", "ok2", "ok3", "final", "maxTier"]}))

    dun = js(ctx, """
      const s = defaultState(0);
      const d0 = dungeonState(s, 1000);
      startDungeonCooldown(s, 1000);
      const d1 = dungeonState(s, 1000);
      const d2 = dungeonState(s, 1000 + DUNGEON.cooldownMs + 5);
      s.shards = DUNGEON.shardCost;
      const d3 = dungeonState(s, 2000);
      return {
        ready0: d0.ready, leftSec: Math.round(d1.leftMs / 1000), ready2: d2.ready,
        canPay: d3.canPay, cost: DUNGEON.shardCost, durSec: DUNGEON.durationMs / 1000, cdMin: DUNGEON.cooldownMs / 60000,
      };
    """)
    ok(dun["ready0"] is True and dun["leftSec"] == 600 and dun["ready2"] is True, "던전 무료 쿨타임 10분", json.dumps(dun))
    ok(dun["cost"] == 30 and dun["canPay"] is True and dun["durSec"] == 30, "던전 30초 제한 · 강화석 30 즉시 입장", json.dumps(dun))

    bats = js(ctx, """
      const rng = (function (seed) { let x = seed; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; })(5);
      const s = defaultState(0);
      s.stage = 3; s.maxStage = 3; s.bossReady = false; s.killsInStage = 0;
      const b = new Battle(s, () => ({}), rng, 0);
      const before = { gold: s.gold, shards: s.shards };
      const r = b.startDungeon(1000);
      const during = { inDungeon: b.inDungeon(), left: Math.round(b.dungeonLeft(1000) / 1000) };
      let t = 1000;
      const ev = {};
      for (let i = 0; i < 720; i++) {
        t += 50;
        b.tick(50, t);
        for (const e of b.drainEvents()) ev[e.t] = (ev[e.t] || 0) + 1;
      }
      const last = s.dungeon.last || {};
      return {
        ok: r.ok, end: ev.dungeonEnd || 0, start: ev.dungeonStart || 0, bossEv: ev.dungeonBoss || 0,
        kills: last.kills || 0, bosses: last.bossKills || 0, dmg: last.dmg || 0,
        goldGain: s.gold - before.gold, shardGain: s.shards - before.shards,
        stage: s.stage, dungeonNull: b.dungeon === null, monsters: b.monsters.length, runs: s.dungeon.runs,
        during,
      };
    """)
    ok(bats["ok"] is True and bats["start"] == 1 and bats["end"] == 1 and bats["during"]["inDungeon"] is True and bats["during"]["left"] == 30, "던전 입장 → 30초 후 자동 종료", json.dumps({k: bats[k] for k in ["ok", "start", "end"]}))
    ok(bats["kills"] + bats["bosses"] >= 4 and bats["dmg"] > 0 and bats["bossEv"] >= 1, "던전 처치·피해 집계 + 황금 보스 등장", json.dumps({k: bats[k] for k in ["kills", "bosses", "dmg", "bossEv"]}))
    ok(bats["goldGain"] > 0 and bats["shardGain"] >= 3, "던전 보상(대량 골드 + 강화석) 즉시 지급", json.dumps({k: bats[k] for k in ["goldGain", "shardGain"]}))
    ok(bats["stage"] == 3 and bats["dungeonNull"] is True and bats["monsters"] >= 1 and bats["runs"] == 1, "던전 종료 후 원래 스테이지 사냥 복귀", json.dumps({k: bats[k] for k in ["stage", "dungeonNull", "monsters", "runs"]}))

    petbat = js(ctx, """
      function run(petId) {
        const rng = (function (seed) { let x = seed; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; })(9);
        const s = defaultState(0);
        s.level = 15; s.stage = 5; s.maxStage = 5;
        if (petId) { s.pet = { equipped: petId, unlocked: ['wolf'], chosen: true }; }
        const b = new Battle(s, () => ({}), rng, 0);
        let t = 0, hits = 0, dmg = 0;
        for (let i = 0; i < 240; i++) {
          t += 50;
          b.tick(50, t);
          for (const e of b.drainEvents()) { if (e.t === 'petHit') { hits++; dmg += e.dmg; } }
        }
        return { hits, dmg, atk: b.stats.atk, active: !!b.activePet() };
      }
      return { none: run(null), wolf: run('wolf') };
    """)
    ok(petbat["none"]["hits"] == 0 and petbat["none"]["active"] is False, "펫 없으면 동행 공격 없음", json.dumps(petbat["none"]))
    ok(petbat["wolf"]["hits"] >= 2 and petbat["wolf"]["dmg"] > 0 and petbat["wolf"]["active"] is True, "펫이 1.5초마다 함께 공격", json.dumps(petbat["wolf"]))


    petup = js(ctx, """
      const s = defaultState(0);
      s.level = 20;
      s.shards = 100;
      s.pet = { equipped: 'wolf', unlocked: ['wolf'], chosen: true, levels: { wolf: 1 } };
      const atk0 = calcStats(s, {}).atk;
      const pct0 = petAtkPct(s, 'wolf');
      const c1 = petUpgradeCost(1);
      const r1 = upgradePet(s, 'wolf');
      const left = s.shards;
      const atk1 = calcStats(s, {}).atk;
      const pct1 = petAtkPct(s, 'wolf');
      const dm = petDmgPct(s, 'wolf');
      const bad = upgradePet(s, 'dragon');
      s.shards = 0;
      const poor = upgradePet(s, 'wolf');
      s.pet.levels.wolf = PET_MAX_LV;
      const maxed = upgradePet(s, 'wolf');
      return { c1, ok: r1.ok, lv: r1.lv, spent: r1.spent, left, atk0, atk1, pct0, pct1, dmgPct: Math.round(dm * 100),
               bad: bad.ok, poor: poor.ok, maxed: maxed.ok, maxFlag: !!maxed.max };
    """)
    ok(petup["ok"] is True and petup["lv"] == 2 and petup["spent"] == petup["c1"] and petup["left"] == 100 - petup["c1"], "펫 강화 — 강화석 소모·레벨 상승", json.dumps(petup))
    ok(petup["atk1"] > petup["atk0"] and petup["pct1"] > petup["pct0"] and petup["dmgPct"] > 55, "펫 강화가 공격 패시브·동행 피해에 반영", json.dumps({"atk0": petup["atk0"], "atk1": petup["atk1"], "pct0": petup["pct0"], "pct1": petup["pct1"], "dmgPct": petup["dmgPct"]}))
    ok(petup["bad"] is False and petup["poor"] is False and petup["maxed"] is False and petup["maxFlag"] is True, "미해금/강화석 부족/최대 레벨 거부", json.dumps({k: petup[k] for k in ["bad", "poor", "maxed", "maxFlag"]}))

    compat = js(ctx, """
      const old = { ver: 3, level: 40, gold: 7777, shards: 12, stage: 9, maxStage: 9,
        land: { owned: { '0_0_0': 5 } }, records: { totalGold: 100 } };
      const n = normalizeState(old, 0);
      const bad = normalizeState({ pet: { equipped: 'dragon', unlocked: ['fox'], chosen: 'yes' }, jobTier: 99, dungeonCooldown: -5, dungeon: { best: -3, runs: -1 } }, 0);
      return {
        level: n.level, gold: n.gold, pet: n.pet, job: n.jobTier, cd: n.dungeonCooldown, dun: n.dungeon,
        badPet: bad.pet, badJob: bad.jobTier, badCd: bad.dungeonCooldown, badBest: bad.dungeon.best, badRuns: bad.dungeon.runs,
      };
    """)
    ok(compat["level"] == 40 and compat["gold"] == 7777 and compat["pet"] == {"equipped": None, "unlocked": [], "chosen": False, "levels": {}} and compat["job"] == 0 and compat["cd"] == 0, "v3.1 저장 호환(펫·전직·던전 기본값 병합)", json.dumps(compat, ensure_ascii=False))
    ok(compat["badPet"] == {"equipped": None, "unlocked": ["fox"], "chosen": False, "levels": {"fox": 1}} and compat["badJob"] == 3 and compat["badCd"] == 0 and compat["badBest"] == 0 and compat["badRuns"] == 0, "손상된 펫/전직/던전 값 방어", json.dumps({k: compat[k] for k in ["badPet", "badJob", "badCd", "badBest", "badRuns"]}, ensure_ascii=False))

    tpl2 = js(ctx2, """
      const s = defaultState(0);
      s.gold = 60000; s.shards = 320; s.level = 12; s.stage = 7; s.maxStage = 8;
      for (const c of CITIES.slice(0, 5)) s.land.owned[c.key] = 40;
      s.pet = { equipped: 'fox', unlocked: ['wolf', 'fox'], chosen: true };
      s.dungeon = { best: 12345, runs: 2, last: { at: 0, gold: 999, shards: 12, kills: 8, bossKills: 1, dmg: 12345 } };
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(7), boss: null, dungeon: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {} };
      const hunt = __tpls.hunt(ui);
      s.land.sub = 'buff';
      const land = __tpls.land(ui);
      const set = __tpls.settings(ui);
      return { hunt, land, set, bad: /undefined|NaN|\\[object Object\\]/.test(hunt + land + set) };
    """)
    ok(tpl2["bad"] is False, "v3.2 템플릿에 undefined/NaN 누출 없음")
    ok("✨ 전직 가능!" in tpl2["hunt"] and "황금 던전" in tpl2["hunt"] and "내 동료 펫" in tpl2["hunt"], "사냥 탭에 전직·던전·펫 카드", "")
    ok("내 동료 펫" in tpl2["land"] and "동행 중" in tpl2["land"], "건물주 버프 탭에도 펫 카드", "")
    ok("전직" in tpl2["set"] and "황금 던전" in tpl2["set"], "설정 탭에 전직/던전 기록", "")

    rsrc2 = read("src/render.js")
    ok("drawPet" in rsrc2 and "drawDungeonHud" in rsrc2 and "drawPromoteBanner" in rsrc2, "펫 동행·던전 HUD·전직 배너 렌더 구현")
    ok("petHit" in read("src/combat.js") and "activePet" in read("src/combat.js") and "startDungeon" in read("src/combat.js"), "펫 동행 전투·던전 전투 구현")
    ok("fanfare()" in read("src/sound.js"), "전직 팡파르 효과음")
    ok(all(k in read("app.js") for k in ["promoteJob", "equipPet", "upgradePet", "enterDungeon", "checkPets", "showDungeonResult"]), "전직·펫·던전 액션 연결")
    ok(all(x in read("src/ui.js") for x in ['data-action="promote"', 'data-action="pet-equip"', 'data-action="pet-upgrade"', 'data-action="dungeon"']), "전직·펫·던전 버튼 연결")
    ok("'./src/meta.js'" in read("sw.js"), "sw.js 프리캐시에 meta.js 포함")
    pet_files = [f"assets/sprites/pet/pet_{n}.png" for n in ("wolf", "fox", "owl", "dragon")]
    ok(all(os.path.exists(os.path.join(ROOT, f)) for f in pet_files), "펫 스프라이트 4종 파일", ", ".join(f for f in pet_files if not os.path.exists(os.path.join(ROOT, f))))
    ok(all(f"'./{f}'" in read("sw.js") for f in pet_files), "sw.js 프리캐시에 펫 스프라이트 포함")
    try:
        from PIL import Image
        sizes = [Image.open(os.path.join(ROOT, f)).size for f in pet_files]
        alphas = [Image.open(os.path.join(ROOT, f)).getextrema()[3][0] for f in pet_files]
        ok(all(sz == (256, 256) for sz in sizes) and all(a == 0 for a in alphas), "펫 스프라이트 256px 투명 PNG", json.dumps({"sizes": sizes, "min_alpha": alphas}))
    except Exception as e:  # noqa: BLE001
        ok(False, "펫 스프라이트 검사", str(e))

    section("[7] 밸런스 시뮬레이션 (60분)")
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
