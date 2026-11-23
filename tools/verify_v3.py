#!/usr/bin/env python3
"""land-rpg v3.5.0 검증 (QuickJS + 정적 검사)

1) 모든 JS 파일 문법(파싱) 검사
2) 정적 검사 (Firebase/로그인 흔적 0, 저장 키 v3, sw 캐시 v3.5)
3) 통합 경제 단위 검증 (가격 스케일·매수/매도·임대·건물주 버프·강화석 시세·저장 정규화)
4) 장비 뽑기·등급·연출·효과음 검사 (v3.1)
5) 밸런스 시뮬레이션 (1~10 쾌적 / 10~22 장비·버프 필요 / 방치보다 적극 플레이가 앞섬)
6) 펫·전직·던전 (v3.2) · 미션·업적·도감 (v3.3) · 호재 뉴스·권역 세트·랜드마크 (v3.4)
7) ♾️ 환생·초월 특성·무한 스테이지 (v3.5)

사용: python3 tools/verify_v3.py
"""
import json
import os
import re
import sys

import quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ["src/data.js", "src/land-data.js", "src/region.js", "src/land.js", "src/rebirth.js", "src/meta.js", "src/quests.js", "src/state.js", "src/combat.js"]
ALL_JS = ["app.js", "sw.js", "src/data.js", "src/land-data.js", "src/region.js", "src/land.js", "src/rebirth.js", "src/meta.js", "src/quests.js", "src/state.js", "src/combat.js", "src/render.js", "src/ui.js", "src/sound.js"]

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
    ok("land-rpg-v3.5.0" in read("sw.js"), "SW 캐시 버전 v3.5.0")
    ok("APP_VERSION = '3.5.0'" in read("src/data.js"), "앱 버전 v3.5.0")
    ok("'./src/rebirth.js'" in read("sw.js"), "sw.js 프리캐시에 rebirth.js 포함")
    ok("'./src/region.js'" in read("sw.js"), "sw.js 프리캐시에 region.js 포함")
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
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(7), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {}, install: { standalone: false, installed: false, canPrompt: true, hidden: false } };
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
    ok("홈 화면에 앱으로 설치" in tpl["settings"] and 'data-action="install"' in tpl["settings"], "설정 탭 상단 앱 설치 카드", "")

    hidden_install = js(ctx2, """
      const s = defaultState(0);
      const mk = (inst) => ({ s, battle: { stats: calcStats(s, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: {} }, logs: [], tab: 'settings', el: {}, install: inst });
      const none = __tpls.settings(mk(undefined));
      const standalone = __tpls.settings(mk({ standalone: true, installed: false, canPrompt: false, hidden: true }));
      const installed = __tpls.settings(mk({ standalone: false, installed: true, canPrompt: false, hidden: true }));
      return { none: none.indexOf('홈 화면에 앱으로 설치') >= 0, standalone: standalone.indexOf('홈 화면에 앱으로 설치') >= 0, installed: installed.indexOf('홈 화면에 앱으로 설치') >= 0 };
    """)
    ok(hidden_install["standalone"] is False and hidden_install["installed"] is False, "standalone·설치 완료 시 설치 카드 숨김", json.dumps(hidden_install))
    ok(hidden_install["none"] is False, "설치 상태 정보가 없으면 카드를 그리지 않음(다른 탭·테스트 안전)", json.dumps(hidden_install))

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

    section("[7] 📲 앱 설치 (PWA · v3.2.1)")
    appjs = read("app.js")
    uijs = read("src/ui.js")
    html = read("index.html")
    css = read("style.css")
    ok("'beforeinstallprompt'" in appjs and "e.preventDefault()" in appjs and "this.deferredPrompt = e" in appjs, "beforeinstallprompt → preventDefault → deferredPrompt 보관")
    ok("display-mode: standalone" in appjs and "navigator.standalone" in appjs, "standalone(이미 앱으로 실행 중) 판별")
    ok("'appinstalled'" in appjs and "syncInstall" in appjs and "설치 완료" in appjs, "appinstalled → 완료 토스트·버튼 숨김")
    ok("p.prompt()" in appjs and "userChoice" in appjs and "outcome" in appjs, "클릭 시 deferredPrompt.prompt() 원클릭 설치·결과 처리")
    ok("installApp" in appjs and "install: () => this.installApp()" in appjs, "설치 액션 연결(app.js)")
    ok('id="installBtn"' in html and 'data-action="install"' in html, "상단 헤더 📲 설치 버튼")
    ok('class="install-btn hidden"' in html, "헤더 설치 버튼은 기본 숨김(상태에 따라 표시)")
    ok('case \'install\'' in uijs and "syncInstall()" in uijs and "showInstallGuide()" in uijs, "설치 버튼 핸들러·상태 반영·안내(ui.js)")
    ok("📲 홈 화면에 앱으로 설치" in uijs and 'data-action="install"' in uijs, "설정 탭 상단 📲 설치 카드")
    ok(all(x in uijs for x in ["삼성 인터넷", "Chrome", "현재 페이지 추가", "홈 화면", "⋮"]), "프롬프트 없는 환경(인앱·이미 설치) 단계별 안내")
    ok(".install-btn" in css and ".install-card" in css and ".install-steps" in css, "설치 버튼·카드·안내 CSS")
    ok("display: none !important" in css and ".install-btn.prompt" in css, "설치 상태별 표시/숨김 스타일")

    section("[8] 밸런스 시뮬레이션 (60분)")
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

    section("[9] 🎯 미션 · 🏆 업적 · 📖 도감 (v3.3.0)")
    qdef = js(ctx, """
      return {
        ids: QUESTS.map(q => q.id),
        types: QUESTS.map(q => q.type),
        goals: QUESTS.map(q => q.goal),
        pay: QUESTS.map(q => q.gold + q.shards),
        golds: QUESTS.map(q => q.gold),
        shards: QUESTS.map(q => q.shards),
        achIds: ACHIEVEMENTS.map(a => a.id),
        achShards: ACHIEVEMENTS.map(a => a.shards),
        achAtk: ACHIEVEMENTS.filter(a => a.atkPct > 0).length,
        achGold: ACHIEVEMENTS.filter(a => a.goldPct > 0).length,
        weights: [CODEX_WEIGHTS.monsters, CODEX_WEIGHTS.cities, CODEX_WEIGHTS.gear, CODEX_WEIGHTS.pets],
        milestones: CODEX_MILESTONES.map(m => m.pct),
        monsters: MONSTER_IDS.length,
        bosses: MONSTER_IDS.filter(n => MONSTERS[n].boss).length,
        petIds: PETS.map(p => p.id),
      };
    """)
    ok(len(qdef["ids"]) == 15 and len(set(qdef["ids"])) == 15, "미션 15단계 정의(중복 없음)", str(len(qdef["ids"])))
    ok(set(qdef["types"]) >= {"kills", "stage", "equipLv", "gacha", "cities", "bossKills", "dungeon", "pyeong", "job"}, "미션에 사냥·강화·뽑기·매수·던전·전직 흐름 포함", json.dumps(sorted(set(qdef["types"]))))
    ok(all(p > 0 for p in qdef["pay"]) and all(g >= 1 for g in qdef["goals"]), "모든 미션에 1 이상 목표·골드/강화석 보상", json.dumps(qdef["pay"]))
    ok(any(v > 0 for v in qdef["golds"]) and any(v > 0 for v in qdef["shards"]), "미션 보상에 💰 골드·💎 강화석 모두 존재")
    ok(len(qdef["achIds"]) == 19 and len(set(qdef["achIds"])) == 19, "업적 19종 정의(중복 없음)", str(len(qdef["achIds"])))
    ok(all(s > 0 for s in qdef["achShards"]) and qdef["achAtk"] >= 2 and qdef["achGold"] >= 2, "업적 보상 = 💎 + 영구 스탯 보너스", json.dumps({"atk": qdef["achAtk"], "gold": qdef["achGold"]}))
    ok(qdef["weights"] == [30, 40, 20, 10] and qdef["milestones"] == [10, 25, 50, 75, 100], "도감 가중치 합 100 · 마일스톤 5단계", json.dumps(qdef["weights"]))
    ok(qdef["monsters"] == 19 and qdef["bosses"] == 7 and qdef["petIds"] == ["wolf", "fox", "owl", "dragon"], "도감 몬스터 19종(보스 7)·펫 4종", json.dumps({"m": qdef["monsters"], "b": qdef["bosses"]}))

    mq = js(ctx, """
      const s = defaultState(0);
      const p0 = questProgress(s, 'm01');
      const c0 = claimQuest(s, 'm01');
      s.totalKills = 10;
      const p1 = questProgress(s);
      const gold0 = s.gold, shards0 = s.shards;
      const c1 = claimQuest(s, 'm01');
      const after = { gold: s.gold - gold0, shards: s.shards - shards0, idx: s.quests.idx, claimed: s.quests.claimed.slice(), done: s.quests.done };
      const again = claimQuest(s, 'm01');
      const wrong = claimQuest(s, 'm05');
      const cur = currentQuest(s);
      return {
        p0: p0.done, p0cur: p0.cur, c0: c0.ok,
        p1cur: p1.cur, p1done: p1.done, c1: c1.ok, gain: [c1.gold, c1.shards],
        next: c1.next ? c1.next.id : null, after,
        again: again.ok, wrong: wrong.ok, curId: cur ? cur.id : null,
      };
    """)
    ok(mq["p0"] is False and mq["p0cur"] == 0 and mq["c0"] is False, "목표 미달 미션은 수령 거부", json.dumps({"p0": mq["p0"], "c0": mq["c0"]}))
    ok(mq["p1cur"] == 10 and mq["p1done"] is True and mq["c1"] is True and mq["gain"] == [300, 0], "첫 미션 진행도·보상(💰300)", json.dumps(mq["gain"]))
    ok(mq["after"] == {"gold": 300, "shards": 0, "idx": 1, "claimed": ["m01"], "done": 1} and mq["next"] == "m02", "수령 → 보상 지급·다음 미션 열림", json.dumps(mq["after"]))
    ok(mq["again"] is False and mq["wrong"] is False and mq["curId"] == "m02", "중복 수령·다른 미션 수령 거부", json.dumps({"again": mq["again"], "wrong": mq["wrong"], "cur": mq["curId"]}))

    chain = js(ctx, """
      const s = defaultState(0);
      s.totalKills = 5000; s.maxStage = 30; s.stage = 30; s.bossKills = 40; s.level = 40;
      s.equip.weapon = 40; s.equip.armor = 20;
      s.gacha.total = 60; s.jobTier = 2;
      s.dungeon = { best: 1000, runs: 3, last: null };
      for (const c of CITIES.slice(0, 6)) s.land.owned[c.key] = 30;
      const gold0 = s.gold, shards0 = s.shards;
      const claimed = [];
      const reasons = [];
      for (let i = 0; i < 30; i++) {
        const q = currentQuest(s);
        if (!q) break;
        const r = claimQuest(s, q.id);
        if (!r.ok) { reasons.push(q.id + ':' + r.reason); break; }
        claimed.push(q.id);
      }
      const payG = s.gold - gold0, payS = s.shards - shards0;
      const want = QUESTS.reduce((a, q) => a + q.gold, 0) + QUESTS.reduce((a, q) => a + q.shards, 0);
      return {
        n: claimed.length, reasons, cur: currentQuest(s), done: s.quests.done,
        payG, payS, allPay: QUESTS.reduce((a, q) => a + q.gold, 0), allPayS: QUESTS.reduce((a, q) => a + q.shards, 0),
      };
    """)
    ok(chain["n"] == 15 and chain["cur"] is None and chain["reasons"] == [] and chain["done"] == 15, "조건이 차면 15단계 연속 수령 → 시즌 완료", json.dumps(chain, ensure_ascii=False))
    ok(chain["payG"] == chain["allPay"] and chain["payS"] == chain["allPayS"], "미션 보상 합계 정확히 지급", json.dumps({"g": chain["payG"], "s": chain["payS"]}))

    ach = js(ctx, """
      const s = defaultState(0);
      const first0 = achievementStatus(s).find(a => a.id === 'a_land1');
      const cheap = CITIES.slice().sort((a, b) => a.base - b.base)[0];
      applyTrade(s, cheap.key, 'buy', 3, 0);
      const first1 = achievementStatus(s).find(a => a.id === 'a_land1');
      const shards0 = s.shards;
      const r = claimAchievement(s, 'a_land1');
      const again = claimAchievement(s, 'a_land1');
      const notYet = claimAchievement(s, 'a_kill1000');
      const bogus = claimAchievement(s, 'zzz');
      return {
        before: [first0.cur, first0.done, first0.claimable],
        after: [first1.cur, first1.done, first1.claimable],
        ok: r.ok, shards: r.shards, gain: s.shards - shards0,
        again: again.ok, notYet: notYet.ok, bogus: bogus.ok,
        count: claimedAchievementCount(s), claimed: s.achievements.claimed.slice(),
      };
    """)
    ok(ach["after"] == [1, True, True] and ach["before"][2] is False, "첫 매수 → '첫 부동산' 업적 달성·수령 가능", json.dumps(ach["after"]))
    ok(ach["ok"] is True and ach["gain"] == 5 and ach["shards"] == 5, "업적 보상 💎5 지급", json.dumps({"gain": ach["gain"]}))
    ok(ach["again"] is False and ach["notYet"] is False and ach["bogus"] is False and ach["count"] == 1, "중복·미달성·알 수 없는 업적 거부", json.dumps({"again": ach["again"], "notYet": ach["notYet"]}))

    abonus = js(ctx, """
      const s = defaultState(0);
      s.level = 20;
      for (const c of CITIES.slice(0, 3)) s.land.owned[c.key] = 400; // 1,200평
      const atk0 = calcStats(s, {}).atk;
      const gold0 = calcStats(s, {}).goldMult;
      const cAtk = claimAchievement(s, 'a_pyeong1000');
      const atk1 = calcStats(s, {}).atk;
      for (const c of CITIES.slice(3, 10)) s.land.owned[c.key] = 3; // 10곳
      const cGold = claimAchievement(s, 'a_land10');
      const gold1 = calcStats(s, {}).goldMult;
      return { atkOk: cAtk.ok, atk0, atk1, goldOk: cGold.ok, gold0, gold1 };
    """)
    ok(abonus["atkOk"] is True and abonus["atk1"] > abonus["atk0"], "업적 영구 공격 보너스가 calcStats 에 반영", f"{abonus['atk0']}→{abonus['atk1']}")
    ok(abonus["goldOk"] is True and abonus["gold1"] > abonus["gold0"], "업적 영구 골드 보너스가 calcStats 에 반영", f"{abonus['gold0']}→{abonus['gold1']}")

    cxr = js(ctx, """
      const s = defaultState(0);
      const c0 = codexStats(s);
      codexMeet(s, 'Slime');
      codexKill(s, 'Slime', 3);
      codexKill(s, 'Slime');
      const c1 = codexStats(s);
      const cheap = CITIES.slice().sort((a, b) => a.base - b.base)[0];
      applyTrade(s, cheap.key, 'buy', 5, 0);
      codexCity(s, cheap.key, 5, 0);
      applyTrade(s, cheap.key, 'sell', 5, 0);
      const d1 = codexDetail(s);
      codexGear(s, 'legend');
      const c2 = codexStats(s);
      const d2 = codexDetail(s);
      return {
        pct0: c0.pct, met0: c0.monsters.seen,
        slime: s.codex.monsters.Slime, seen1: c1.monsters.seen, kills: c1.monsters.kills,
        ownedAfterSell: Object.keys(s.land.owned).length,
        cityNames: d1.cities.map(x => x.name), cityPyeong: d1.cities.length ? d1.cities[0].pyeong : -1,
        gearGot: d2.gear.filter(g => g.got).map(g => g.id), pct2: c2.pct,
        monstersMet: d2.monsters.filter(m => m.met).length, monsterTotal: d2.monsters.length,
        petsUnlocked: d2.pets.filter(p => p.unlocked).length,
      };
    """)
    ok(cxr["pct0"] < 10 and cxr["met0"] == 0 and cxr["slime"] == {"m": 1, "k": 4}, "몬스터 도감 — 만남·처치 수 기록", json.dumps(cxr["slime"]))
    ok(cxr["ownedAfterSell"] == 0 and len(cxr["cityNames"]) == 1 and cxr["cityPyeong"] == 5, "부동산 도감 — 매도해도 지역·최대 평수 기록 유지", json.dumps(cxr["cityNames"], ensure_ascii=False))
    ok("legend" in cxr["gearGot"] and "common" in cxr["gearGot"], "장비 등급 도감 — 획득 등급 기록", json.dumps(cxr["gearGot"]))
    ok(cxr["monsterTotal"] == 19 and cxr["monstersMet"] == 1 and cxr["petsUnlocked"] == 0, "도감 상세 목록(19종·펫 4종)", json.dumps({"met": cxr["monstersMet"]}))

    msb = js(ctx, """
      const s = defaultState(0);
      s.level = 20;
      const base = calcStats(s, {});
      const b0 = collectionBonus(s);
      for (const n of MONSTER_IDS) codexMeet(s, n);
      const c1 = codexStats(s);
      const after = calcStats(s, {});
      const b1 = collectionBonus(s);
      for (const c of CITIES) codexCity(s, c.key, 1, 0);
      for (const r of RARITY_IDS) codexGear(s, r);
      s.pet = { equipped: null, unlocked: PETS.map(p => p.id), chosen: true, levels: {} };
      const c2 = codexStats(s);
      const b2 = collectionBonus(s);
      return {
        b0, atk0: base.atk, gold0: base.goldMult,
        pct1: c1.pct, ms1: c1.milestone ? c1.milestone.pct : -1, atk1: after.atk, gold1: after.goldMult, b1,
        pct2: c2.pct, seen: c2.seen, total: c2.total, ms2: c2.milestone ? c2.milestone.pct : -1, b2,
      };
    """)
    ok(msb["b0"] == {"atkPct": 0, "goldPct": 0}, "새 게임(수집 10% 미만)은 수집 보너스 0 → 기존 밸런스 불변", json.dumps(msb["b0"]))
    ok(msb["pct1"] >= 30 and msb["ms1"] == 25 and msb["b1"]["atkPct"] == 1 and msb["atk1"] > msb["atk0"] and msb["gold1"] > msb["gold0"], "몬스터 도감 완성 → 수집률 30%↑·공격/골드 보너스", json.dumps({"pct": msb["pct1"], "b": msb["b1"]}))
    ok(msb["pct2"] == 100 and msb["ms2"] == 100 and msb["b2"]["atkPct"] == 5 and msb["b2"]["goldPct"] == 5 and msb["seen"] == msb["total"], "도감 100% → 마일스톤 최종 보너스", json.dumps({"pct": msb["pct2"], "b": msb["b2"], "seen": msb["seen"]}))

    nq = js(ctx, """
      const old = { ver: 3, level: 22, gold: 9000, shards: 40, maxStage: 12, totalKills: 900,
        equip: { weapon: 8 }, gearRarity: { weapon: 'hero' }, land: { owned: { '0_0_0': 12 } },
        pet: { equipped: 'wolf', unlocked: ['wolf'], chosen: true } };
      const n = normalizeState(old, 0);
      const bad = normalizeState({
        quests: { idx: 999, claimed: ['m01', 'zzz', 'm01'] },
        achievements: { claimed: ['a_land1', 'nope'] },
        codex: {
          monsters: { Slime: { m: 1, k: -5 }, Dragon: { m: 1, k: 3 } },
          cities: { zzz: { p: 3 }, '0_0_0': { p: 4 } },
          gear: { legend: -2, rare: 'x' },
        },
      }, 0);
      const stable = normalizeState(JSON.parse(JSON.stringify(n)), 0);
      return {
        level: n.level, gold: n.gold, quests: n.quests, ach: n.achievements.claimed,
        codexMonsters: n.codex.monsters, codexCities: Object.keys(n.codex.cities), codexGear: n.codex.gear,
        badIdx: bad.quests.idx, badClaimed: bad.quests.claimed, badAch: bad.achievements.claimed,
        badMonsters: bad.codex.monsters, badCities: Object.keys(bad.codex.cities), badGear: bad.codex.gear,
        stable: stable.gold === n.gold && stable.quests.idx === n.quests.idx && Object.keys(stable.codex.cities).length === Object.keys(n.codex.cities).length,
        pct: codexStats(n).pct,
      };
    """)
    ok(nq["level"] == 22 and nq["gold"] == 9000 and nq["quests"] == {"idx": 0, "claimed": [], "done": 0, "at": 0}, "v3.2 저장 호환 — 미션/업적 기본값 병합·진행도 유지", json.dumps(nq["quests"], ensure_ascii=False))
    ok(nq["codexCities"] == ["0_0_0"] and nq["codexGear"].get("hero") == 1 and nq["codexMonsters"] == {}, "도감 기본값 — 현재 보유 지역·장착 등급 반영", json.dumps({"c": nq["codexCities"], "g": nq["codexGear"]}))
    ok(nq["badIdx"] == 15 and nq["badClaimed"] == ["m01"] and nq["badAch"] == ["a_land1"], "손상된 미션/업적 값 방어", json.dumps({"idx": nq["badIdx"], "c": nq["badClaimed"]}))
    ok(nq["badMonsters"] == {"Slime": {"m": 1, "k": 0}} and nq["badCities"] == ["0_0_0"] and "legend" not in nq["badGear"] and "rare" not in nq["badGear"], "손상된 도감 값 방어(알 수 없는 키·음수 제거)", json.dumps({"m": nq["badMonsters"], "c": nq["badCities"], "g": nq["badGear"]}, ensure_ascii=False))
    ok(nq["stable"] is True and 5 <= nq["pct"] < 30, "정규화 반복해도 안정 · 보유 지역이 도감 수집률에 반영", f"pct={nq['pct']}")

    tpl3 = js(ctx2, """
      const s = defaultState(0);
      s.gold = 20000; s.shards = 100; s.totalKills = 10; s.maxStage = 3;
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(3), boss: null, dungeon: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const hunt = __tpls.hunt(ui);
      const settings = __tpls.settings(ui);
      const done = defaultState(0);
      done.quests = { idx: 15, claimed: QUESTS.map(q => q.id), done: 15, at: 0 };
      const ui2 = { s: done, battle: { stats: calcStats(done, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: {} }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const huntDone = __tpls.hunt(ui2);
      return {
        hunt, settings, huntDone,
        bad: /undefined|NaN|\\[object Object\\]/.test(hunt + settings + huntDone),
      };
    """)
    ok(tpl3["bad"] is False, "v3.3 템플릿에 undefined/NaN 누출 없음")
    ok("🎯" in tpl3["hunt"] and "claim-quest" in tpl3["hunt"] and "보상 받기" in tpl3["hunt"], "사냥 탭 — 미션 카드·진행도·보상 수령 버튼", "")
    ok('data-action="open-codex"' in tpl3["hunt"] and 'data-action="open-achievements"' in tpl3["hunt"], "사냥 탭 — 도감·업적 진입 버튼", "")
    ok("도감 · 업적" in tpl3["settings"] and "도감 열기" in tpl3["settings"], "설정 탭 — 도감·업적 카드", "")
    ok("시즌 완료" in tpl3["huntDone"], "미션 모두 완료 시 완료 상태 표시", "")

    qsrc = read("src/quests.js")
    uisrc2 = read("src/ui.js")
    appsrc2 = read("app.js")
    css2 = read("style.css")
    cbsrc = read("src/combat.js")
    stsrc = read("src/state.js")
    ok(os.path.exists(os.path.join(ROOT, "src/quests.js")), "src/quests.js 존재")
    ok("'./src/quests.js'" in read("sw.js"), "sw.js 프리캐시에 quests.js 포함")
    ok(all(x in qsrc for x in ["QUESTS", "ACHIEVEMENTS", "codexStats", "claimQuest", "claimAchievement", "collectionBonus"]), "quests.js 모듈 구성")
    ok(all(x in appsrc2 for x in ["claimQuest", "claimAchievement", "showCodex", "showAchievements", "codexGear", "codexCity"]), "미션·업적·도감 액션 연결(app.js)")
    ok(all(x in uisrc2 for x in ['data-action="claim-quest"', 'data-action="open-codex"', 'data-action="open-achievements"', "case 'claim-achievement'"]) and 'data-action="claim-achievement"' in appsrc2, "미션·업적·도감 버튼 연결(ui.js·app.js)")
    ok("questCard" in uisrc2 and "tplHunt" in uisrc2, "사냥 탭 미션 카드 렌더")
    ok("codexMeet" in cbsrc and "codexKill" in cbsrc, "전투 중 몬스터 도감 해금·처치 기록")
    ok("collectionBonus" in stsrc and "normalizeQuestState" in stsrc and "normalizeCodex" in stsrc, "state 저장 정규화·calcStats 수집 보너스")
    ok(all(x in css2 for x in [".quest-card", ".q-claim.ready", ".codex-grid", ".ach-row"]), "미션·도감·업적 CSS")
    ok("qPulse" in css2, "보상 수령 버튼 반짝임 애니메이션")

    section("[10] 📰 호재 뉴스 · 🗺️ 권역 세트 · 🏛️ 랜드마크 (v3.4.0)")
    news = js(ctx, """
      const a = activeNews(0), a2 = activeNews(120000), b = activeNews(180000);
      const covered = RCITIES.filter(r => newsCovers(a, r.key)).length;
      const t60 = newsTimer(60000);
      return {
        interval: NEWS_INTERVAL_MS,
        same: a.key === a2.key && a.block === a2.block,
        nextBlock: b.block, nextDiff: b.key !== a.key,
        scope: a.scope, target: a.targetLabel, title: a.title, icon: a.icon,
        price: a.pricePct, rent: a.rentPct, starts: a.startsAt, ends: a.endsAt,
        covered, total: RCITIES.length,
        leftSec: Math.round(t60.leftMs / 1000), pct: Math.round(t60.pct * 100),
        poolSize: NEWS_POOL.length,
      };
    """)
    ok(news["interval"] == 180000, "호재 뉴스 3분 주기", str(news["interval"]))
    ok(news["same"] is True and news["nextBlock"] == 1 and news["nextDiff"] is True, "같은 3분 블록은 같은 뉴스 · 다음 블록은 새 뉴스", json.dumps({"same": news["same"], "next": news["nextBlock"]}))
    ok(0 < news["covered"] < news["total"], "뉴스는 일부 지역(권역·지역·섹터)에만 적용", f"{news['covered']}/{news['total']}")
    ok(news["price"] > 0 and news["rent"] > 0 and len(news["title"]) > 3, "호재는 시세·임대수익 보정을 함께 준다", json.dumps({"p": news["price"], "r": news["rent"]}, ensure_ascii=False))
    ok(news["starts"] == 0 and news["ends"] == 180000 and news["leftSec"] == 120 and 25 <= news["pct"] <= 40, "뉴스 지속 3분 · 남은 시간·진행률", json.dumps({"left": news["leftSec"], "pct": news["pct"]}))
    ok(news["poolSize"] >= 10, "호재 뉴스 풀 다양성", str(news["poolSize"]))

    fx = js(ctx, """
      const news = activeNews(0);
      const coveredKey = RCITIES.find(r => newsCovers(news, r.key)).key;
      const uncoveredKey = RCITIES.find(r => !newsCovers(news, r.key) && citySetId(r.key) !== citySetId(coveredKey)).key;
      const cCity = CITY_BY_KEY[coveredKey], uCity = CITY_BY_KEY[uncoveredKey];
      const cInfo = priceInfo(cCity, 0), uInfo = priceInfo(uCity, 0);
      const mLo = Math.round(cInfo.daily * (1 - LAND.band) * (1 + news.pricePct / 100));
      const mHi = Math.round(cInfo.daily * (1 + LAND.band) * (1 + news.pricePct / 100));
      const uLo = Math.round(uInfo.daily * (1 - LAND.band)), uHi = Math.round(uInfo.daily * (1 + LAND.band));
      const s = defaultState(0);
      s.land.owned[coveredKey] = 20;
      const p = portfolioOf(s, 0);
      const setB = regionSetBuffs(s.land.owned);
      const expectMul = (1 + (setB.rentBySet[citySetId(coveredKey)] || 0) / 100) * (1 + news.rentPct / 100);
      const base = incomePerMinOf(cCity, 20, 20, 0);
      return {
        cNews: !!cInfo.news, uNews: !!uInfo.news,
        priceOk: cInfo.price >= mLo - 1 && cInfo.price <= mHi + 1,
        uPriceOk: uInfo.price >= uLo - 1 && uInfo.price <= uHi + 1,
        mul: newsPriceMul(coveredKey, 0), mulU: newsPriceMul(uncoveredKey, 0),
        rentMul: newsRentMul(coveredKey, 0), expectMul,
        ratio: base > 0 ? p.incomePerMin / base : 0,
        holdingNews: !!p.holdings[0].news,
        label: cInfo.news ? cInfo.news.targetLabel : '',
      };
    """)
    ok(fx["cNews"] is True and fx["uNews"] is False, "호재 지역만 배지·보정 대상(비호재 지역은 그대로)", json.dumps({"c": fx["cNews"], "u": fx["uNews"]}))
    ok(fx["priceOk"] is True and fx["uPriceOk"] is True, "호재 지역 시세에 보정 적용 · 비호재 지역은 밴드 유지", json.dumps({"p": fx["priceOk"], "u": fx["uPriceOk"]}))
    ok(abs(fx["mul"] - fx["rentMul"]) > -1 and fx["mul"] > 1 and fx["mulU"] == 1, "호재 시세 배율은 적용 지역만 1 초과", json.dumps({"a": fx["mul"], "b": fx["mulU"]}))
    ok(fx["holdingNews"] is True and abs(fx["ratio"] - fx["expectMul"]) < fx["expectMul"] * 0.01 and fx["ratio"] > 1, "호재 임대수익 버프가 실제 임대 계산에 반영", json.dumps({"ratio": round(fx["ratio"], 4), "e": round(fx["expectMul"], 4)}))

    sts = js(ctx, """
      const s = defaultState(0);
      const seoul3 = CITIES.filter(c => citySetId(c.key) === 'seoul').slice(0, 3);
      for (const c of seoul3) s.land.owned[c.key] = 5;
      const st1 = regionSetStatus(s.land.owned);
      const se1 = st1.find(x => x.id === 'seoul');
      const b1 = regionSetBuffs(s.land.owned);
      const p1 = portfolioOf(s, 0);
      const base = seoul3.reduce((a, c) => a + incomePerMinOf(c, 5, 5, 0), 0);
      const nMul = newsCovers(activeNews(0), seoul3[0].key) ? 1 + activeNews(0).rentPct / 100 : 1;
      const seoul10 = CITIES.filter(c => citySetId(c.key) === 'seoul').slice(0, 10);
      for (const c of seoul10) s.land.owned[c.key] = 5;
      const se3 = regionSetStatus(s.land.owned).find(x => x.id === 'seoul');
      const sg = defaultState(0);
      sg.level = 20;
      for (const c of CITIES.filter(x => citySetId(x.key) === 'gyeonggi').slice(0, 3)) sg.land.owned[c.key] = 1;
      const gb = computeBuffs(sg, 0);
      const sj = defaultState(0);
      sj.land.owned[CITIES.find(c => citySetId(c.key) === 'jeju').key] = 2;
      const jb = regionSetBuffs(sj.land.owned);
      return {
        count: REGION_SETS.length,
        names: REGION_SETS.map(d => d.name),
        needs: REGION_SETS.map(d => d.levels.map(l => l.need)),
        coverage: REGION_SETS.reduce((a, d) => a + d.keyList.length, 0),
        totalCities: CITIES.length,
        lv: se1.level, held: se1.held, need: se1.nextNeed, rent1: se1.buffs.rentPct, text: se1.buffText,
        active: b1.activeCount, rentMap: b1.rentBySet.seoul,
        inc: Math.round(p1.incomePerMin), base: Math.round(base), nMul,
        lv3: se3.level, rent3: se3.buffs.rentPct, next3: se3.nextNeed,
        propAtk: gb.atkPct, setAtk: gb.setAtkPct,
        atkG0: calcStats(sg, {}).atk, atkG1: calcStats(sg, gb).atk,
        jejuLv: regionSetStatus(sj.land.owned).find(x => x.id === 'jeju').level, jejuGold: jb.goldPct,
        zero: regionSetBuffs({}).activeCount,
      };
    """)
    ok(sts["count"] == 7 and sts["coverage"] == sts["totalCities"] == 229, "권역 세트 7개 · 전국 229개 지역 누락 없이 매핑", f"{sts['coverage']}/{sts['totalCities']}")
    ok(sts["names"] == ["서울권", "경기·인천권", "강원권", "충청권", "전라권", "경상권", "제주권"], "권역 세트 이름(서울·경기인천·강원·충청·전라·경상·제주)", json.dumps(sts["names"], ensure_ascii=False))
    ok(all(0 < n[0] and all(a < b for a, b in zip(n, n[1:])) for n in sts["needs"]) and sts["needs"][0] == [3, 6, 10], "세트 필요 지역 수가 단계마다 증가(서울 3/6/10)", json.dumps(sts["needs"]))
    ok(sts["lv"] == 1 and sts["held"] == 3 and sts["need"] == 6 and sts["rent1"] == 8 and "임대수익" in sts["text"], "서울 3곳 → 서울권 Lv.1 임대수익 +8%", json.dumps({"lv": sts["lv"], "rent": sts["rent1"]}, ensure_ascii=False))
    ok(sts["active"] == 1 and sts["rentMap"] == 8, "세트 버프 집계(임대수익 배율)", json.dumps({"a": sts["active"], "r": sts["rentMap"]}))
    ok(abs(sts["inc"] / max(1, sts["base"]) - 1.08 * sts["nMul"]) < 0.012 and sts["inc"] > sts["base"], "세트 임대수익이 실제 임대 계산에 반영", json.dumps({"inc": sts["inc"], "base": sts["base"], "n": round(sts["nMul"], 3)}))
    ok(sts["lv3"] == 3 and sts["rent3"] == 26 and sts["next3"] is None, "서울 10곳 → Lv.3 임대수익 +26%", json.dumps({"lv": sts["lv3"], "r": sts["rent3"]}))
    ok(sts["propAtk"] == 0 and sts["setAtk"] == 4 and sts["atkG1"] > sts["atkG0"], "경기·인천권 공격 버프가 calcStats 에 반영(건물주 버프와 분리)", json.dumps({"set": sts["setAtk"], "a0": sts["atkG0"], "a1": sts["atkG1"]}))
    ok(sts["jejuLv"] == 1 and sts["jejuGold"] == 3, "제주권은 1곳부터 발동", json.dumps({"lv": sts["jejuLv"], "g": sts["jejuGold"]}))
    ok(sts["zero"] == 0, "보유 지역이 없으면 세트 버프 0(신규 밸런스 불변)", str(sts["zero"]))

    lmr = js(ctx, """
      const s = defaultState(0);
      s.gold = 2000000; s.level = 20;
      const cheap = CITIES.slice().sort((a, b) => a.base - b.base)[0];
      s.land.owned[cheap.key] = 3;
      const q3 = landmarkQuote(s, cheap.key, 0);
      s.land.owned[cheap.key] = 500;
      const q1 = landmarkQuote(s, cheap.key, 0);
      const g0 = s.gold;
      const r1 = buildLandmark(s, cheap.key, 0);
      const lv1 = landmarkLevel(s, cheap.key);
      const inc1 = portfolioOf(s, 0).incomePerMin;
      const r2 = buildLandmark(s, cheap.key, 0);
      const inc2 = portfolioOf(s, 0).incomePerMin;
      const r3 = buildLandmark(s, cheap.key, 0);
      const inc3 = portfolioOf(s, 0).incomePerMin;
      const goldAfterBuild = s.gold;
      const r4 = buildLandmark(s, cheap.key, 0);
      const sum = landmarkSummary(s);
      const b = computeBuffs(s, 0);
      const nMul = newsCovers(activeNews(0), cheap.key) ? 1 + activeNews(0).rentPct / 100 : 1;
      const base = incomePerMinOf(cheap, 500, 500, 0);
      const spent = g0 - goldAfterBuild;
      const poor = defaultState(0); poor.gold = 10; poor.land.owned[cheap.key] = 500;
      const qp = landmarkQuote(poor, cheap.key, 0);
      const sell = applyTrade(s, cheap.key, 'sell', s.land.owned[cheap.key], 0);
      return {
        reasons: [q3.ok, q1.ok, r1.ok, r2.ok, r3.ok, r4.ok, !!r4.max],
        levels: [lv1, r2.level, r3.level],
        rentPct: LANDMARK.levels.map(l => l.rentPct), names: LANDMARK.levels.map(l => l.name),
        minPyeong: LANDMARK.minPyeong, maxLevel: LANDMARK.maxLevel,
        cost1: q1.cost, formula1: Math.round(500 * cheap.base * 0.35),
        inc1, inc2, inc3, base, nMul,
        sum, setAtk: b.setAtkPct, lmAtk: b.landmarkAtkPct, lmGold: b.landmarkGoldPct,
        atk0: calcStats(s, {}).atk, atk1: calcStats(s, b).atk,
        spent, gold: goldAfterBuild, poor: qp.ok, poorReason: qp.reason,
        sellOk: sell.ok, lmAfterSell: s.land.landmarks[cheap.key] || 0, ownedAfter: s.land.owned[cheap.key] || 0,
        maxReason: r4.reason,
      };
    """)
    ok(lmr["rentPct"] == [30, 70, 120] and lmr["names"] == ["상가", "타워", "메가 랜드마크"], "랜드마크 3단계 임대수익 +30/70/120%", json.dumps({"r": lmr["rentPct"], "n": lmr["names"]}, ensure_ascii=False))
    ok(lmr["minPyeong"] == 5 and lmr["reasons"][0] is False and lmr["reasons"][1] is True, "5평 미만 건설 불가 · 5평 이상 견적 성립", json.dumps({"min": lmr["minPyeong"], "r": lmr["reasons"][:2]}))
    ok(lmr["cost1"] == lmr["formula1"] and lmr["levels"] == [1, 2, 3], "건설 비용 = 보유평 × 기준가 × 계수 · Lv.1→2→3", json.dumps({"c": lmr["cost1"], "f": lmr["formula1"], "lv": lmr["levels"]}))
    ok(abs(lmr["inc1"] / lmr["base"] - 1.3 * lmr["nMul"]) < 0.01 and abs(lmr["inc3"] / lmr["base"] - 2.2 * lmr["nMul"]) < 0.01 and lmr["inc3"] > lmr["inc2"] > lmr["inc1"], "랜드마크 레벨이 임대수익에 실제 반영(+30/70/120%)", json.dumps({"i1": round(lmr["inc1"], 2), "i3": round(lmr["inc3"], 2), "base": round(lmr["base"], 2)}))
    ok(lmr["sum"]["count"] == 1 and lmr["sum"]["levels"] == [0, 0, 1] and lmr["lmAtk"] == 1 and lmr["lmGold"] == 0.5, "랜드마크 보유 수 보너스(공격 +1% · 골드 +0.5%)", json.dumps({"s": lmr["sum"], "a": lmr["lmAtk"], "g": lmr["lmGold"]}, ensure_ascii=False))
    ok(lmr["atk1"] > lmr["atk0"] and lmr["setAtk"] == 0, "랜드마크 보너스가 calcStats 에 반영", f"{lmr['atk0']}→{lmr['atk1']}")
    ok(lmr["poor"] is False and "골드" in lmr["poorReason"], "골드 부족 시 건설 거부", lmr["poorReason"])
    ok(lmr["reasons"][4] is True and lmr["reasons"][5] is False and lmr["reasons"][6] is True and "최대" in lmr["maxReason"], "Lv.3 까지 건설 후 최대 레벨", lmr["maxReason"])
    ok(lmr["sellOk"] is True and lmr["ownedAfter"] == 0 and lmr["lmAfterSell"] == 0, "전량 매도 시 랜드마크 정리", json.dumps({"own": lmr["ownedAfter"], "lm": lmr["lmAfterSell"]}))
    ok(lmr["spent"] > 0 and abs(lmr["gold"] - (2000000 - lmr["spent"])) < 1, "랜드마크 투자 골드 차감", json.dumps({"spent": lmr["spent"]}))

    nsv = js(ctx, """
      const old = { ver: 3, level: 30, gold: 5000, shards: 12, maxStage: 10,
        equip: { weapon: 9 }, gearRarity: { weapon: 'rare' },
        land: { owned: { '0_0_0': 6 }, accruedRent: 5 },
        quests: { idx: 3, claimed: ['m01', 'm02', 'm03'], done: 3, at: 0 },
        pet: { equipped: 'wolf', unlocked: ['wolf'], chosen: true } };
      const n = normalizeState(old, 0);
      const bad = normalizeState({
        gold: 100,
        land: { owned: { '0_0_0': 6 }, landmarks: { '0_0_0': 9, zzz: 2, '1_0_0': 3 }, landmarkSpend: -50 },
        news: { seen: [1, 'chip', '0123456789012345678901234567890'], log: [{ title: 't', block: 2 }, 'bad', { id: 5 }], lastBlock: -999 },
      }, 0);
      const stable = normalizeState(JSON.parse(JSON.stringify(n)), 0);
      return {
        level: n.level, gold: n.gold, owned: n.land.owned['0_0_0'], lm: n.land.landmarks, spend: n.land.landmarkSpend,
        news: n.news, quest: n.quests.idx, pet: n.pet.equipped, weapon: n.equip.weapon,
        badLm: bad.land.landmarks, badSeen: bad.news.seen, badBlock: bad.news.lastBlock,
        badLog: bad.news.log.length, badSpend: bad.land.landmarkSpend, badGold: bad.gold,
        stable: stable.news.lastBlock === n.news.lastBlock
          && Object.keys(stable.land.landmarks).length === Object.keys(n.land.landmarks).length
          && stable.gold === n.gold,
      };
    """)
    ok(nsv["level"] == 30 and nsv["gold"] == 5000 and nsv["owned"] == 6 and nsv["quest"] == 3 and nsv["pet"] == "wolf" and nsv["weapon"] == 9, "v3.3 저장 호환 — 기존 진행도 그대로 유지", json.dumps({k: nsv[k] for k in ["level", "gold", "quest", "pet"]}, ensure_ascii=False))
    ok(nsv["lm"] == {} and nsv["spend"] == 0 and nsv["news"] == {"seen": [], "log": [], "lastBlock": -1}, "새 필드(news·landmarks) 기본값 병합", json.dumps(nsv["news"], ensure_ascii=False))
    ok(nsv["badLm"] == {"0_0_0": 3} and nsv["badSpend"] == 0 and nsv["badGold"] == 100, "손상된 랜드마크 값 방어(레벨 상한·미보유 제거)", json.dumps(nsv["badLm"]))
    ok(nsv["badSeen"] == ["chip"] and nsv["badBlock"] == -1 and nsv["badLog"] == 1, "손상된 뉴스 기록 방어", json.dumps({"s": nsv["badSeen"], "b": nsv["badBlock"], "l": nsv["badLog"]}, ensure_ascii=False))
    ok(nsv["stable"] is True, "정규화 반복해도 안정")

    rn = js(ctx, """
      const s = defaultState(0);
      const n1 = activeNews(0);
      const a = recordNews(s, n1, 1000);
      const b = recordNews(s, n1, 2000);
      const n2 = activeNews(NEWS_INTERVAL_MS);
      const c = recordNews(s, n2, NEWS_INTERVAL_MS);
      return { a, b, c, seen: s.news.seen.length, log: s.news.log.length, last: s.news.lastBlock, top: s.news.log[0].title };
    """)
    ok(rn["a"] is True and rn["b"] is False and rn["c"] is True and rn["seen"] >= 2 and rn["log"] == 2 and rn["last"] == 1, "호재를 한 번만 기록 · 다음 호재 누적", json.dumps(rn, ensure_ascii=False))

    tpl4 = js(ctx2, """
      const s = defaultState(0);
      s.gold = 500000; s.level = 15; s.stage = 5;
      const seoul = CITIES.filter(c => citySetId(c.key) === 'seoul');
      for (const c of seoul.slice(0, 4)) s.land.owned[c.key] = 20;
      s.land.landmarks[seoul[0].key] = 2;
      s.land.landmarkSpend = 12345;
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(5), boss: null, dungeon: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'land', el: {}, install: { hidden: true } };
      const out = {};
      for (const sub of ['home', 'market', 'buff']) { s.land.sub = sub; out[sub] = __tpls.land(ui); }
      out.hunt = __tpls.hunt(ui);
      out.marketList = __tpls.market(ui).html;
      const empty = defaultState(0);
      const ui2 = { s: empty, battle: { stats: calcStats(empty, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: computeBuffs(empty, 0) }, logs: [], tab: 'land', el: {}, install: { hidden: true } };
      empty.land.sub = 'buff';
      out.emptyBuff = __tpls.land(ui2);
      out.emptyHome = (empty.land.sub = 'home', __tpls.land(ui2));
      out.bad = /undefined|NaN|\\[object Object\\]/.test(Object.values(out).filter(v => typeof v === 'string').join('\\n'));
      return out;
    """)
    ok(tpl4["bad"] is False, "v3.4 템플릿에 undefined/NaN 누출 없음")
    ok(all("📰 부동산 호재" in tpl4[k] for k in ["home", "market", "buff"]), "부동산 탭 상단 뉴스 배너(모든 서브탭)", "")
    ok("data-live=\"news-left\"" in tpl4["home"] and "data-live=\"news-prog\"" in tpl4["home"], "뉴스 남은 시간·진행 바 실시간 갱신", "")
    ok("권역 세트" in tpl4["home"] and "권역 세트" in tpl4["buff"] and "서울권" in tpl4["buff"], "내 부동산·건물주 버프 탭에 권역 세트 현황", "")
    ok("랜드마크" in tpl4["buff"] and "Lv.2" in tpl4["buff"], "건물주 버프 탭에 랜드마크 현황", "")
    ok('data-action=\"landmark\"' in tpl4["home"] and 'data-action=\"landmark\"' in tpl4["buff"], "랜드마크 건설/업그레이드 버튼", "")
    ok("아직 랜드마크가 없습니다" in tpl4["emptyBuff"] and "📰 부동산 호재" in tpl4["emptyHome"], "새 게임에서도 뉴스·랜드마크 카드가 깨지지 않음", "")
    ok("📰" in tpl4["hunt"], "사냥 탭에 현재 호재 요약", "")

    regsrc = read("src/region.js")
    uisrc3 = read("src/ui.js")
    appsrc3 = read("app.js")
    stsrc2 = read("src/state.js")
    lsrc = read("src/land.js")
    css3 = read("style.css")
    ok(os.path.exists(os.path.join(ROOT, "src/region.js")), "src/region.js 존재")
    ok(all(x in regsrc for x in ["REGION_SETS", "NEWS_POOL", "activeNews", "newsCovers", "regionSetStatus", "regionSetBuffs"]), "region.js 모듈 구성")
    ok(all(x in lsrc for x in ["LANDMARK", "landmarkQuote", "buildLandmark", "landmarkSummary", "landmarkRentMul"]), "land.js 랜드마크 엔진")
    ok("news" in lsrc and "pricePct" in lsrc and "setAtkPct" in lsrc, "시세·임대수익에 뉴스·세트 반영")
    ok(all(x in stsrc2 for x in ["recordNews", "normalizeNews", "sanitizeLandmarks", "setAtkPct"]), "state.js 저장 정규화·세트 보너스 반영")
    ok(all(x in appsrc3 for x in ["checkNews", "openLandmark", "doBuildLandmark", "recordNews", "ownedInNews"]), "뉴스·랜드마크 액션 연결(app.js)")
    ok(all(x in uisrc3 for x in ["newsBanner", "regionSetCard", "regionSetMini", "landmarkCard", 'data-action="landmark"']), "뉴스·세트·랜드마크 UI 구현")
    ok(all(x in css3 for x in [".news-card", ".tag.hot", ".lm-chip", ".set-row", ".lm-step"]), "v3.4 뉴스·세트·랜드마크 CSS")

    section("[11] ♾️ 환생(초월) · 무한 스테이지 (v3.5.0)")
    rbd = js(ctx, """
      return {
        need: REBIRTH.stageReq,
        ids: REBIRTH_TRAITS.map(t => t.id),
        names: REBIRTH_TRAITS.map(t => t.name),
        maxLv: REBIRTH_TRAITS.map(t => t.maxLv),
        points: [18, 19, 20, 21, 25, 30, 50, 100].map(s => rebirthPointsFor(s)),
        mono: (function () { let bad = 0; let prev = -1; for (let s = 1; s <= 150; s++) { const p = rebirthPointsFor(s); if (p < prev) bad++; prev = p; } return bad; })(),
        totalCost: traitTotalCost(REBIRTH_TRAITS[0], 20),
        costs: [0, 1, 5, 19].map(l => traitCost(l)),
      };
    """)
    ok(rbd["need"] == 20 and rbd["points"][:3] == [0, 0, 3], "환생 해금 S20 · S20 지급 3P", json.dumps(rbd["points"][:3]))
    ok(len(rbd["ids"]) == 6 and len(set(rbd["ids"])) == 6 and all(v == 20 for v in rbd["maxLv"]), "영구 특성 6종(각 Lv.1~20)", json.dumps(rbd["ids"]))
    ok(rbd["mono"] == 0 and rbd["points"][4] > rbd["points"][3] and rbd["points"][5] > rbd["points"][4] * 1.5 and rbd["points"][7] > rbd["points"][6] * 2, "스테이지가 높을수록 지수·계단식으로 포인트 증가", json.dumps(rbd["points"]))
    ok(rbd["costs"] == [3, 5, 13, 41] and rbd["totalCost"] == 440, "특성 비용 = 3 + 2×레벨 · 만렙 총 440P", json.dumps({"c": rbd["costs"], "t": rbd["totalCost"]}))

    rbr = js(ctx, """
      const s = defaultState(0);
      s.level = 42; s.exp = 500; s.stage = 25; s.maxStage = 25;
      s.gold = 123456; s.shards = 777;
      s.equip = { weapon: 40, armor: 20, helmet: 10, ring: 5, amulet: 3 };
      s.gearRarity = { weapon: 'legend', armor: 'rare', helmet: 'advanced', ring: 'common', amulet: 'hero' };
      s.gacha = { pity: 7, total: 30, best: 'legend', legend: 1, cur: 'gold' };
      s.jobTier = 2;
      s.skills.strike.lv = 5;
      s.pet = { equipped: 'fox', unlocked: ['wolf', 'fox'], chosen: true, levels: { wolf: 3, fox: 2 } };
      const cheap = CITIES.slice().sort((a, b) => a.base - b.base);
      s.land.owned[cheap[0].key] = 30; s.land.owned[cheap[1].key] = 10;
      s.land.landmarks[cheap[0].key] = 2; s.land.landmarkSpend = 5000; s.land.accruedRent = 321;
      s.quests = { idx: 5, claimed: ['m01', 'm02', 'm03', 'm04', 'm05'], done: 5, at: 0 };
      s.achievements = { claimed: ['a_land1'] };
      s.codex.monsters = { Slime: 12 };
      s.dungeon = { best: 4321, runs: 2, last: null };
      const low = defaultState(0); low.maxStage = 19; low.stage = 19;
      const lowStatus = rebirthStatus(low);
      const lowTry = doRebirth(low, 1000);
      const before = rebirthStatus(s);
      const r = doRebirth(s, 5000);
      const land = portfolioOf(s, 0);
      return {
        lowCan: lowStatus.can, lowTry: lowTry.ok, lowStage: low.stage, lowLevel: low.level, lowGold: low.gold,
        can: before.can, gain: r.ok ? r.points : 0, fromStage: r.from.maxStage, fromLevel: r.from.level,
        count: s.rebirth.count, points: s.rebirth.points, totalPoints: s.rebirth.totalPoints, best: s.rebirth.bestStage, at: s.rebirth.at,
        level: s.level, exp: s.exp, stage: s.stage, maxStage: s.maxStage, kills: s.killsInStage, bossReady: s.bossReady,
        job: s.jobTier, gold: s.gold, startGold: rebirthStartGold(s), hp: s.hp, equip: s.equip,
        shards: s.shards, skill: s.skills.strike.lv, gear: s.gearRarity, gacha: s.gacha.total, pet: s.pet,
        cities: Object.keys(s.land.owned).length, pyeong: land.pyeong, landmark: s.land.landmarks[cheap[0].key],
        rent: s.land.accruedRent, spend: s.land.landmarkSpend, quest: s.quests.idx, ach: s.achievements.claimed.length,
        codex: s.codex.monsters.Slime, dungeon: s.dungeon.runs, peak: s.peakStage,
        gainFormula: rebirthPointsFor(25),
      };
    """)
    ok(rbr["lowCan"] is False and rbr["lowTry"] is False and rbr["lowStage"] == 19 and rbr["lowLevel"] == 1 and rbr["lowGold"] == 500, "S20 미만은 환생 거부(상태 불변)", json.dumps({k: rbr[k] for k in ["lowCan", "lowTry", "lowStage", "lowLevel"]}))
    ok(rbr["can"] is True and rbr["gain"] == rbr["gainFormula"] and rbr["count"] == 1 and rbr["points"] == rbr["gain"] and rbr["totalPoints"] == rbr["gain"] and rbr["best"] == 25 and rbr["at"] == 5000, "환생 → 초월석 지급·회차/기록 누적", json.dumps({k: rbr[k] for k in ["gain", "count", "points", "best", "at"]}))
    ok(rbr["level"] == 1 and rbr["exp"] == 0 and rbr["stage"] == 1 and rbr["maxStage"] == 1 and rbr["kills"] == 0 and rbr["bossReady"] is False and rbr["job"] == 0 and rbr["hp"] is None, "초기화 — 레벨·스테이지·전직·전투 상태", json.dumps({k: rbr[k] for k in ["level", "exp", "stage", "maxStage", "job", "hp"]}))
    ok(rbr["equip"] == {"weapon": 0, "armor": 0, "helmet": 0, "ring": 0, "amulet": 0}, "초기화 — 장비 강화 0강", json.dumps(rbr["equip"]))
    ok(rbr["gold"] == 500 and rbr["startGold"] == 500, "초기화 — 보유 골드가 시작 골드로", json.dumps({"g": rbr["gold"]}))
    ok(rbr["shards"] == 777 and rbr["skill"] == 5 and rbr["gear"]["weapon"] == "legend" and rbr["gacha"] == 30, "유지 — 강화석·스킬 레벨·장비 등급·뽑기 기록", json.dumps({k: rbr[k] for k in ["shards", "skill", "gacha"]}))
    ok(rbr["pet"]["equipped"] == "fox" and rbr["pet"]["levels"] == {"wolf": 3, "fox": 2} and rbr["pet"]["unlocked"] == ["wolf", "fox"], "유지 — 동료 펫 해금·레벨", json.dumps(rbr["pet"], ensure_ascii=False))
    ok(rbr["cities"] == 2 and rbr["pyeong"] == 40 and rbr["landmark"] == 2 and rbr["rent"] == 321 and rbr["spend"] == 5000, "유지 — 부동산·랜드마크·임대수익", json.dumps({k: rbr[k] for k in ["cities", "pyeong", "landmark", "rent"]}))
    ok(rbr["quest"] == 5 and rbr["ach"] == 1 and rbr["codex"] == 12 and rbr["dungeon"] == 2 and rbr["peak"] == 25, "유지 — 미션·업적·도감·던전 기록(peakStage)", json.dumps({k: rbr[k] for k in ["quest", "ach", "codex", "dungeon", "peak"]}))

    rbt = js(ctx, """
      const plain = defaultState(0); plain.level = 30;
      const base = calcStats(plain, {});
      const s = defaultState(0); s.level = 30;
      s.rebirth = { count: 1, points: 2, totalPoints: 2, traits: {}, bestStage: 30, at: 0 };
      const poor = upgradeTrait(s, 'atk');
      s.rebirth.points = 5;
      const c1 = upgradeTrait(s, 'atk');
      const level1 = traitLevel(s, 'atk');
      s.rebirth.points = 9999;
      for (let i = 0; i < 40; i++) upgradeTrait(s, 'atk');
      const maxLv = traitLevel(s, 'atk');
      const maxTry = upgradeTrait(s, 'atk');
      const atkOnly = calcStats(s, {});
      for (const id of ['hp', 'gold', 'shard', 'critDmg', 'startGold']) for (let i = 0; i < 20; i++) upgradeTrait(s, id);
      const bonus = rebirthBonus(s);
      const full = calcStats(s, {});
      const startGold = rebirthStartGold(s);
      const bad = upgradeTrait(s, 'nope');
      const old = defaultState(0); old.maxStage = 30; old.stage = 20;
      const r = doRebirth(old, 1000);
      return {
        poor: poor.ok, c1: c1.ok, level1, cost1: c1.cost, left1: c1.points,
        maxLv, maxTry: maxTry.ok, maxFlag: !!maxTry.max, bad: bad.ok,
        baseAtk: base.atk, atkOnly: atkOnly.atk, atkPctMax: bonus.atkPct,
        baseHp: base.hpMax, hp: full.hpMax, hpPct: bonus.hpPct, goldPct: bonus.goldPct, shardPct: bonus.shardPct,
        baseGoldMul: base.goldMult, goldMul: full.goldMult, baseDrop: base.dropMult, drop: full.dropMult,
        critDmg: full.critDmg, totalLv: bonus.totalLv, startGold,
        rbGold: old.gold, rbStart: rebirthStartGold(old),
      };
    """)
    ok(rbt["poor"] is False and rbt["c1"] is True and rbt["level1"] == 1 and rbt["cost1"] == 3 and rbt["left1"] == 2, "특성 업그레이드 — 초월석 소모·레벨 상승", json.dumps({k: rbt[k] for k in ["poor", "c1", "level1", "cost1", "left1"]}))
    ok(rbt["maxLv"] == 20 and rbt["maxTry"] is False and rbt["maxFlag"] is True and rbt["bad"] is False, "특성 Lv.20 상한 · 알 수 없는 특성 거부", json.dumps({k: rbt[k] for k in ["maxLv", "maxTry", "maxFlag", "bad"]}))
    ok(rbt["atkPctMax"] == 80 and rbt["atkOnly"] > rbt["baseAtk"] * 1.75 and rbt["atkOnly"] < rbt["baseAtk"] * 1.85, "공격 특성 만렙 +80% 가 calcStats 에 반영", f"{rbt['baseAtk']}→{rbt['atkOnly']}")
    ok(rbt["hpPct"] == 100 and rbt["hp"] > rbt["baseHp"] * 1.95, "체력 특성 +100% 가 최대 체력에 반영", f"{rbt['baseHp']}→{rbt['hp']}")
    ok(abs((rbt["goldMul"] - rbt["baseGoldMul"]) - 1.0) < 0.001 and abs((rbt["drop"] - rbt["baseDrop"]) - 1.2) < 0.001 and rbt["critDmg"] == 2.6, "골드 +100% · 강화석 +120% · 치명타 피해 +0.6", json.dumps({"g": rbt["goldMul"], "d": rbt["drop"], "c": rbt["critDmg"]}))
    ok(rbt["totalLv"] == 120 and rbt["startGold"] == 10500 and rbt["rbGold"] == rbt["rbStart"], "시작 골드 특성 → 환생 직후 골드 10,500", json.dumps({"lv": rbt["totalLv"], "s": rbt["startGold"], "g": rbt["rbGold"]}))

    rbs = js(ctx, """
      const old = { ver: 3, level: 30, gold: 900, shards: 5, stage: 12, maxStage: 12,
        land: { owned: { '0_0_0': 6 } }, quests: { idx: 6, claimed: [] } };
      const n = normalizeState(old, 0);
      const bad = normalizeState({ rebirth: { count: -3, points: 'x', totalPoints: '9', traits: { atk: 99, nope: 4, hp: '2' }, bestStage: 0, at: -1 }, peakStage: -5, maxStage: 3 }, 0);
      const keep = normalizeState({ maxStage: 3, stage: 2, peakStage: 44, rebirth: { count: 2, points: 10, totalPoints: 20, traits: { atk: 3 }, bestStage: 40, at: 5 } }, 0);
      const stable = normalizeState(JSON.parse(JSON.stringify(keep)), 0);
      return {
        level: n.level, gold: n.gold, maxStage: n.maxStage, peak: n.peakStage, rebirth: n.rebirth,
        bad: bad.rebirth, badPeak: bad.peakStage, badGold: bad.gold,
        keepPeak: keep.peakStage, keepMax: keep.maxStage, keepQuest: questValue(keep, 'stage'),
        stable: stable.rebirth.count === keep.rebirth.count && stable.peakStage === keep.peakStage && JSON.stringify(stable.rebirth) === JSON.stringify(keep.rebirth),
      };
    """)
    ok(rbs["level"] == 30 and rbs["gold"] == 900 and rbs["maxStage"] == 12 and rbs["peak"] == 12 and rbs["rebirth"] == {"count": 0, "points": 0, "totalPoints": 0, "traits": {}, "bestStage": 1, "at": 0}, "v3.4 저장 호환 — 기존 진행도 유지 + rebirth 기본값", json.dumps(rbs["rebirth"], ensure_ascii=False))
    ok(rbs["bad"]["count"] == 0 and rbs["bad"]["points"] == 0 and rbs["bad"]["traits"] == {"atk": 20, "hp": 2} and rbs["bad"]["bestStage"] == 1 and rbs["bad"]["at"] == 0 and rbs["badPeak"] == 3, "손상된 환생 기록 방어(음수·미지 특성·레벨 상한)", json.dumps(rbs["bad"], ensure_ascii=False))
    ok(rbs["keepPeak"] == 44 and rbs["keepMax"] == 3 and rbs["keepQuest"] == 44, "환생 후 미션·업적 진행도는 peakStage 로 유지", json.dumps({"p": rbs["keepPeak"], "q": rbs["keepQuest"]}))
    ok(rbs["stable"] is True, "환생 기록 정규화 반복해도 안정")

    inf = js(ctx, """
      const legacyHp = (s) => {
        const late = 1 + Math.max(0, s - 10) * ECON.monsterHpLateBoost;
        return ECON.monsterHpBase * Math.pow(ECON.monsterHpGrowth, s - 1) * late;
      };
      const diff = [];
      for (let s = 1; s <= 30; s++) {
        if (Math.round(monsterBaseHp(s)) !== Math.round(legacyHp(s))) diff.push('hp' + s);
        if (monsterStats(s, false, 1).hp !== Math.round(legacyHp(s))) diff.push('m' + s);
      }
      const defs = [30, 31, 50, 100, 250, 1000].map(s => stageDef(s));
      const bad = defs.filter(d => !d || !Array.isArray(d.normals) || d.normals.length !== 3 || !MONSTERS[d.boss] || !d.theme || !d.themeName).length;
      const hp = [29, 30, 31, 50, 100, 1000].map(s => Math.round(monsterBaseHp(s)));
      const atk = [30, 50, 100].map(s => Math.round(monsterBaseAtk(s)));
      const gold = [30, 50, 100].map(s => Math.round(stageGoldBase(s)));
      const exp = [30, 50, 100].map(s => Math.round(stageExpBase(s)));
      return { diff, bad, inf: defs.map(d => !!d.infinite), theme: defs[3].themeName, tier: defs.map(d => d.tier),
        hp, atk, gold, exp, boss: monsterStats(50, true, 1), normal: monsterStats(50, false, 1),
        ratio31: monsterBaseHp(31) / monsterBaseHp(30), ratio30: monsterBaseHp(30) / monsterBaseHp(29) };
    """)
    ok(inf["diff"] == [], "S1~30 몬스터 수치가 기존과 완전히 동일(회귀 없음)", json.dumps(inf["diff"]))
    ok(inf["bad"] == 0 and inf["inf"] == [False, True, True, True, True, True], "S31·S50·S100·S250·S1000 스테이지 정의(몬스터·보스·테마)", json.dumps(inf["inf"]))
    ok("∞" in inf["theme"] and inf["tier"][3] == "infinity", "무한 구간 표기(∞ · tier)", inf["theme"])
    ok(all(inf["hp"][i] < inf["hp"][i + 1] for i in range(len(inf["hp"]) - 1)) and inf["ratio31"] < inf["ratio30"] and abs(inf["ratio31"] - 1.035) < 0.0001, "S31 이후 완만한 무한 곡선(체력 단조 증가)", json.dumps({"hp": inf["hp"], "r31": round(inf["ratio31"], 4), "r30": round(inf["ratio30"], 4)}))
    ok(all(inf["atk"][i] < inf["atk"][i + 1] for i in range(2)) and all(inf["gold"][i] < inf["gold"][i + 1] for i in range(2)) and all(inf["exp"][i] < inf["exp"][i + 1] for i in range(2)), "공격·골드·경험치도 무한 구간에서 계속 성장", json.dumps({"a": inf["atk"], "g": inf["gold"], "e": inf["exp"]}))
    ok(abs(inf["boss"]["hp"] - inf["normal"]["hp"] * 3.6) <= 2 and inf["gold"][2] < 1000000, "보스 배율 유지 · 골드 인플레 억제", json.dumps({"b": inf["boss"]["hp"], "n": inf["normal"]["hp"], "g100": inf["gold"][2]}))
    ok(inf["hp"][4] > inf["hp"][3] * 5, "S100 은 S50 보다 한 단계 더 깊은 구간", json.dumps({"s50": inf["hp"][3], "s100": inf["hp"][4]}))

    deep = js(ctx, """
      const rng = (function (seed) { let x = seed; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; })(11);
      const s = defaultState(0);
      s.level = 60; s.stage = 50; s.maxStage = 50;
      s.gearRarity = { weapon: 'legend', armor: 'legend', helmet: 'legend', ring: 'legend', amulet: 'legend' };
      s.equip = { weapon: 80, armor: 80, helmet: 80, ring: 80, amulet: 80 };
      s.jobTier = 3;
      s.pet = { equipped: 'dragon', unlocked: ['wolf', 'fox', 'owl', 'dragon'], chosen: true, levels: { wolf: 10, fox: 10, owl: 10, dragon: 10 } };
      s.rebirth = { count: 3, points: 0, totalPoints: 300, traits: { atk: 20, hp: 20, gold: 10, critDmg: 10 }, bestStage: 50, at: 0 };
      for (const c of CITIES.slice().sort((a, b) => a.base - b.base).slice(0, 20)) s.land.owned[c.key] = 60;
      const buffs = computeBuffs(s, 0);
      const b = new Battle(s, () => buffs, rng, 0);
      let t = 0; let clears = 0; let fails = 0; let deaths = 0;
      for (let i = 0; i < 4000; i++) {
        t += 50; b.tick(50, t);
        for (const e of b.drainEvents()) {
          if (e.t === 'stageClear') clears++;
          if (e.t === 'bossFail') fails++;
          if (e.t === 'playerDeath') deaths++;
        }
      }
      return { clears, fails, deaths, stage: s.stage, dps: calcStats(s, buffs).dps };
    """)
    ok(deep["clears"] >= 1 and deep["stage"] > 50 and deep["fails"] == 0, "환생 빌드로 S50 이후 무한 구간을 실제로 돌파(전투 시뮬레이션)", json.dumps(deep))

    tpl5 = js(ctx2, """
      const s = defaultState(0);
      s.level = 26; s.stage = 25; s.maxStage = 25;
      s.rebirth = { count: 1, points: 120, totalPoints: 300, traits: { atk: 5, gold: 3 }, bestStage: 25, at: 0 };
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(25), boss: null, dungeon: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const hunt = __tpls.hunt(ui);
      const set = __tpls.settings(ui);
      const lowS = defaultState(0);
      const ui2 = { s: lowS, battle: { stats: calcStats(lowS, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: computeBuffs(lowS, 0) }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const low = __tpls.hunt(ui2);
      const deepS = defaultState(0);
      deepS.stage = 100; deepS.maxStage = 100; deepS.level = 70;
      const ui3 = { s: deepS, battle: { stats: calcStats(deepS, {}), def: stageDef(100), boss: null, player: { hp: 1 } }, app: { buffs: computeBuffs(deepS, 0) }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const deepHunt = __tpls.hunt(ui3);
      return { hunt, set, low, deepHunt, bad: /undefined|NaN|\\[object Object\\]/.test(hunt + set + low + deepHunt) };
    """)
    ok(tpl5["bad"] is False, "v3.5 템플릿에 undefined/NaN 누출 없음")
    ok("환생 (초월)" in tpl5["hunt"] and 'data-action="rebirth"' in tpl5["hunt"] and 'data-action="rebirth-traits"' in tpl5["hunt"], "사냥 탭에 환생 카드·버튼", "")
    ok("환생하기 · +" in tpl5["hunt"] and "초월석" in tpl5["hunt"] and "초월 특성" in tpl5["hunt"], "환생 카드에 예정 포인트·획득 특성 요약", "")
    ok("S20 해금" in tpl5["low"] and "환생 · 조건 미달" in tpl5["low"], "S20 미만에서는 잠금 상태로 안내", "")
    ok("환생" in tpl5["set"] and "초월석" in tpl5["set"], "설정 탭에도 환생 카드·기록", "")
    ok("∞" in tpl5["deepHunt"] and "inf-badge" in tpl5["deepHunt"], "S31+ 스테이지에 ∞ 배지 표시", "")

    rbm = js(ctx, """
      const s = defaultState(0);
      s.maxStage = 25; s.stage = 25; s.level = 12; s.shards = 500;
      tryEnhance(s, 'weapon', 5);
      tryEnhance(s, 'armor', 4);
      promoteJob(s, 500);
      const before = { eq: questValue(s, 'equipLv'), job: questValue(s, 'job') };
      const n = normalizeState(JSON.parse(JSON.stringify(s)), 0);
      const saved = { eq: questValue(n, 'equipLv'), job: questValue(n, 'job'), peakEq: n.records.peakEquipLv, peakJob: n.records.peakJobTier };
      const r = doRebirth(n, 1000);
      const after = { eq: questValue(n, 'equipLv'), job: questValue(n, 'job'), equip: n.equip.weapon, jobTier: n.jobTier, level: n.level };
      return { before, saved, after, ok: r.ok };
    """)
    ok(rbm["before"]["eq"] == 9 and rbm["saved"]["eq"] == 9 and rbm["saved"]["peakEq"] == 9 and rbm["saved"]["job"] == 1, "강화·전직이 역대 최고치로 기록됨", json.dumps(rbm["saved"], ensure_ascii=False))
    ok(rbm["ok"] is True and rbm["after"]["equip"] == 0 and rbm["after"]["jobTier"] == 0 and rbm["after"]["eq"] == 9 and rbm["after"]["job"] == 1, "환생 후에도 장비·전직 기반 미션 진행도 유지", json.dumps(rbm["after"], ensure_ascii=False))

    rbsrc = read("src/rebirth.js")
    uisrc5 = read("src/ui.js")
    appsrc5 = read("app.js")
    stsrc5 = read("src/state.js")
    css5 = read("style.css")
    ok(os.path.exists(os.path.join(ROOT, "src/rebirth.js")) and all(x in rbsrc for x in ["REBIRTH", "REBIRTH_TRAITS", "rebirthPointsFor", "doRebirth", "upgradeTrait", "normalizeRebirth", "rebirthBonus"]), "rebirth.js 모듈 구성", "")
    ok(all(x in stsrc5 for x in ["normalizeRebirth", "rebirthBonus", "peakStage", "peakEquipLv", "peakJobTier", "monsterBaseHp", "stageGoldBase"]), "state.js — 환생 정규화·특성 스탯·무한 스케일 연결", "")
    ok(all(x in appsrc5 for x in ["openRebirthConfirm", "doRebirth", "showRebirthTraits", "doUpgradeRebirthTrait", "rebirth: () => this.openRebirthConfirm()", 'data-action="rebirth-trait"']), "환생 액션·특성 버튼 연결(app.js)", "")
    ok(all(x in uisrc5 for x in ['data-action="rebirth"', 'data-action="rebirth-traits"', "case 'rebirth-trait'", "rebirthCard", "inf-badge"]), "환생·특성·∞ UI 구현(ui.js)", "")
    ok(all(x in css5 for x in [".rebirth-card", ".rb-list", ".trait-row", ".inf-badge", ".rb-points"]), "v3.5 환생·특성 CSS", "")

    print(f"\n통과 {passed} / 실패 {failed}")
    if failures:
        print("실패 항목:\n - " + "\n - ".join(failures))
        return 1
    print("✅ v3 게스트 통합판 검증 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
