#!/usr/bin/env python3
"""land-rpg v4.8.0 검증 (QuickJS + 정적 검사)

1) 모든 JS 파일 문법(파싱) 검사
2) 정적 검사 (Firebase/로그인 흔적 0, 저장 키 v3, sw 캐시 v3.5)
3) 통합 경제 단위 검증 (가격 스케일·매수/매도·임대·건물주 버프·강화석 시세·저장 정규화)
4) 장비 뽑기·등급·연출·효과음 검사 (v3.1)
5) 밸런스 시뮬레이션 (1~10 쾌적 / 10~22 장비·버프 필요 / 방치보다 적극 플레이가 앞섬)
6) 펫·전직·던전 (v3.2) · 미션·업적·도감 (v3.3) · 호재 뉴스·권역 세트·랜드마크 (v3.4)
7) ♾️ 환생·초월 특성·무한 스테이지 (v3.5)
8) 💾 세이브 코드 인코딩/디코딩·체크섬·손상 거부·일괄 강화·빠른 매수 (v3.6)
9) 🏃 몬스터 이동·공격·피격·사망 모션 · 투사체 · 이펙트 (v3.7)
10) ⚔️ 다굴 전투 · 방어/회복 스탯 · 신규 몬스터 16종 · 테마 정렬 스테이지 (v3.8)
11) ⚔️ v4.0 장비 종류·옵션·장착 인벤토리 (카탈로그 35종·드랍·비교·분해·세이브 마이그레이션)
12) 🖼️ v4.1 테마 전투 배경 8종(에셋·프리캐시·렌더러) · ♾️ 환생 후 중간 스테이지 선택 점프

사용: python3 tools/verify_v3.py
"""
import atexit
import json
import math
import os
import re
import subprocess
import sys

try:
    import quickjs
except ImportError:
    _NODE_RUNNER = (
        "const vm = require('vm');\n"
        "const rl = require('readline').createInterface({ input: process.stdin });\n"
        "const sandbox = { console, Math, Date, JSON, Number, String, Boolean, Array, Object, RegExp, Error, TypeError, RangeError, SyntaxError, Set, Map, WeakMap, WeakSet, Promise, Symbol, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout };\n"
        "sandbox.globalThis = sandbox;\n"
        "const ctx = vm.createContext(sandbox);\n"
        "async function flushMicro() {\n"
        "  for (let i = 0; i < 64; i++) await new Promise((r) => setImmediate(r));\n"
        "}\n"
        "rl.on('line', async (line) => {\n"
        "  if (!line) return;\n"
        "  try {\n"
        "    const msg = JSON.parse(line);\n"
        "    if (msg.op === 'drain') {\n"
        "      await flushMicro();\n"
        "      process.stdout.write(JSON.stringify({ ok: true, val: false }) + '\\n');\n"
        "      return;\n"
        "    }\n"
        "    const v = vm.runInContext(msg.code, ctx);\n"
        "    const outVal = (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') ? v : null;\n"
        "    process.stdout.write(JSON.stringify({ ok: true, val: outVal }) + '\\n');\n"
        "  } catch (e) {\n"
        "    process.stdout.write(JSON.stringify({ ok: false, err: String(e && (e.stack || e.message) || e) }) + '\\n');\n"
        "  }\n"
        "});\n"
    )

    class _NodeContext:
        def __init__(self):
            self._p = subprocess.Popen(
                ["node", "-e", _NODE_RUNNER],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
            )
            atexit.register(self.close)

        def _req(self, payload):
            self._p.stdin.write(json.dumps(payload) + "\n")
            self._p.stdin.flush()
            out = self._p.stdout.readline()
            if not out:
                raise RuntimeError(self._p.stderr.read() or "node context exited")
            res = json.loads(out)
            if not res.get("ok"):
                raise RuntimeError(res.get("err", "js eval error"))
            return res.get("val")

        def eval(self, code):
            return self._req({"op": "eval", "code": code})

        def execute_pending_job(self):
            return bool(self._req({"op": "drain"}))

        def close(self):
            if self._p and self._p.poll() is None:
                try:
                    self._p.stdin.close()
                    self._p.terminate()
                except Exception:
                    pass

    class quickjs:  # type: ignore[no-redef]
        Context = _NodeContext

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPECTED_VER = "8.12.0"
FILES = ["src/data.js", "src/gear.js", "src/gems.js", "src/land-data.js", "src/region.js", "src/synergy.js", "src/land.js", "src/auction.js", "src/orders.js", "src/portfolio-ops.js", "src/rebirth.js", "src/meta.js", "src/expedition.js", "src/invasion.js", "src/citadel.js", "src/relics.js", "src/daily.js", "src/tower.js", "src/quests.js", "src/pass.js", "src/rift.js", "src/bank.js", "src/guild.js", "src/season.js", "src/hub.js", "src/state.js", "src/guide.js", "src/combat.js", "src/savecode.js", "src/cloud.js"]
ALL_JS = ["app.js", "sw.js", "src/data.js", "src/gear.js", "src/gems.js", "src/land-data.js", "src/region.js", "src/synergy.js", "src/land.js", "src/auction.js", "src/orders.js", "src/portfolio-ops.js", "src/rebirth.js", "src/meta.js", "src/expedition.js", "src/invasion.js", "src/citadel.js", "src/relics.js", "src/daily.js", "src/tower.js", "src/quests.js", "src/pass.js", "src/rift.js", "src/bank.js", "src/guild.js", "src/season.js", "src/hub.js", "src/state.js", "src/guide.js", "src/combat.js", "src/savecode.js", "src/cloud.js", "src/render.js", "src/ui-fmt.js", "src/ui-cloud.js", "src/ui-gear.js", "src/ui-land.js", "src/ui-hunt.js", "src/ui-settings.js", "src/ui.js", "src/sound.js"]

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


def drain(ctx, rounds=2000):
    """QuickJS 의 마이크로태스크 큐를 비운다(비동기 테스트용)"""
    for _ in range(rounds):
        try:
            if not ctx.execute_pending_job():
                break
        except Exception:  # noqa: BLE001
            break


def main():
    ctx = quickjs.Context()

    section("[1] 문법 검사")
    for f in ALL_JS:
        try:
            ctx.eval("new Function(" + json.dumps(strip_module(read(f))) + ")")
            print(f"  syntax OK  {f}")
        except Exception as e:  # noqa: BLE001
            ok(False, f"문법 오류: {f}", str(e))

    section("[2] 게스트 기본 · 선택적 클라우드 정적 검사")
    def strip_comments(src):
        return re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", src, flags=re.S))

    # 클라우드/Firebase 문자열은 src/cloud.js 한 곳에만 있어야 한다(부팅 경로 오염 방지)
    guest_only = [f for f in ALL_JS if f != "src/cloud.js"] + ["index.html", "manifest.json"]
    text_guest = "\n".join(strip_comments(read(f)) for f in guest_only)
    for bad in ["firebase", "signInWithPopup", "gstatic", "firebaseio", "googleapis"]:
        ok(bad.lower() not in text_guest.lower(), f"클라우드 밖에서 Firebase 흔적 없음: {bad}")
    cloud_raw = read("src/cloud.js")
    ok("gstatic.com/firebasejs" in cloud_raw and "firebase-database.js" in cloud_raw, "클라우드 코드는 cloud.js 안에서만 SDK 를 불러온다")
    ok(
        re.search(r"import\(`\$\{base\}/firebase-app\.js`\)", cloud_raw) is not None
        and re.search(r"^import\s+[^;]*gstatic", cloud_raw, flags=re.M) is None,
        "Firebase SDK 는 동적 import(부팅 경로에 없음)",
    )
    app_src = strip_comments(read("app.js"))
    ok("startCloudResume" in app_src and "if (!this.cloudEnabled() && !this.cloud.hasPendingRedirect()) return;" in app_src, "세션 복원도 클라우드를 켓을 때만")
    ok("setInterval(() => this.cloudTick(), 15000)" in app_src, "주기 저장은 조건 검사형 타이머")
    ok("land_rpg_unified_v3" in read("src/data.js"), "저장 키 v3 분리")
    ok(f"land-rpg-v{EXPECTED_VER}" in read("sw.js"), f"SW 캐시 버전 v{EXPECTED_VER}")
    ok(f"APP_VERSION = '{EXPECTED_VER}'" in read("src/data.js"), f"앱 버전 v{EXPECTED_VER}")
    ok("'./src/expedition.js'" in read("sw.js"), "sw.js 프리캐시에 expedition.js 포함")
    ok("'./src/invasion.js'" in read("sw.js"), "sw.js 프리캐시에 invasion.js 포함")
    ok("'./src/citadel.js'" in read("sw.js"), "sw.js 프리캐시에 citadel.js 포함")
    ok("'./src/orders.js'" in read("sw.js"), "sw.js 프리캐시에 orders.js 포함")
    ok("'./src/relics.js'" in read("sw.js"), "sw.js 프리캐시에 relics.js 포함")
    ok("'./src/gems.js'" in read("sw.js"), "sw.js 프리캐시에 gems.js 포함")
    ok("'./src/portfolio-ops.js'" in read("sw.js"), "sw.js 프리캐시에 portfolio-ops.js 포함")
    ok("'./src/pass.js'" in read("sw.js"), "sw.js 프리캐시에 pass.js 포함")
    ok("'./src/rift.js'" in read("sw.js"), "sw.js 프리캐시에 rift.js 포함")
    ok("'./src/bank.js'" in read("sw.js"), "sw.js 프리캐시에 bank.js 포함")
    ok("'./src/guild.js'" in read("sw.js"), "sw.js 프리캐시에 guild.js 포함")
    ok("'./src/hub.js'" in read("sw.js"), "sw.js 프리캐시에 hub.js 포함")
    ok("'./src/ui-hunt.js'" in read("sw.js"), "sw.js 프리캐시에 ui-hunt.js 포함")
    ok("'./src/ui-land.js'" in read("sw.js"), "sw.js 프리캐시에 ui-land.js 포함")
    ok("'./src/cloud.js'" in read("sw.js"), "sw.js 프리캐시에 cloud.js 포함")
    ok("'./src/synergy.js'" in read("sw.js"), "sw.js 프리캐시에 synergy.js 포함")
    ok("'./src/auction.js'" in read("sw.js"), "sw.js 프리캐시에 auction.js 포함")
    ok(os.path.exists(os.path.join(ROOT, "src/savecode.js")), "src/savecode.js 존재")
    ok("'./src/savecode.js'" in read("sw.js"), "sw.js 프리캐시에 savecode.js 포함")
    ok("'./src/gear.js'" in read("sw.js"), "sw.js 프리캐시에 gear.js 포함")
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
        "src/ui.js": (
            "exports.__tpls = { hunt: tplHunt, gear: tplGear, land: tplLand, settings: tplSettings, market: buildMarketList, map: regionMapCard };"
            "exports.__HUNT_SUBS = HUNT_SUBS.map(([k]) => k);"
            "exports.__huntSub = (ui, sub) => { ui.huntSub = sub; return tplHunt(ui); };"
            "exports.__gearSub = (ui, sub) => { ui.gearSub = sub; return tplGear(ui); };"
            "exports.__GEAR_SUBS = GEAR_SUBS.map(([k]) => k);"
            "exports.__gearBadges = (ui) => gearBadges(ui);"
            "exports.__huntAll = (ui) => __HUNT_SUBS.map((k) => __huntSub(ui, k)).join('');"
            "exports.__badges = (ui) => huntBadges(ui);"
            "exports.__LAND_SUBS = LAND_SUBS.map(([k]) => k);"
            "exports.__LAND_LABELS = LAND_SUBS.map(([k, i, l]) => i + ' ' + l);"
            "exports.__landSub = (ui, sub) => { ui.s.land.sub = sub; return tplLand(ui); };"
            "exports.__map = (ui) => regionMapCard(ui);"
            "exports.__lbadges = (ui) => landBadges(ui);"
        )
    }
    ctx2 = quickjs.Context()
    ctx2.eval(bundle(FILES + ["src/ui-fmt.js", "src/ui-cloud.js", "src/ui-gear.js", "src/ui-land.js", "src/ui-hunt.js", "src/ui-settings.js", "src/ui.js"], ui_extras))
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
        if (k === 'hunt') html = __huntAll(ui);
        else for (const sub of ['home', 'market', 'buff']) { s.land.sub = sub; html += fn(ui); }
        out[k] = html;
      }
      out.market = __tpls.market(ui).html;
      const emptyS = defaultState(0);
      const ui2 = { s: emptyS, battle: { stats: calcStats(emptyS, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: {} }, logs: [], tab: 'land', el: {} };
      out.emptyLand = __tpls.land(ui2);
      out.bad = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, /undefined|NaN|\\[object Object\\]/.test(v)]).filter(([, v]) => v));
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
    ok("세이브 코드 백업" in tpl["settings"] and 'data-action="save-export"' in tpl["settings"] and 'data-action="save-import"' in tpl["settings"], "설정 탭 💾 세이브 코드 백업 카드(내보내기·불러오기)", "")
    ok("일괄 수령" in tpl["land"] and 'data-action="rent-info"' in tpl["land"], "부동산 탭 임대수익 일괄 수령 UI", "")
    ok(all(x in tpl["gear"] for x in ['data-action="enhance"', 'data-action="enhance5"', 'data-action="enhance10"', 'data-action="enhancemax"']), "장비 탭 일괄 강화(+1·+5·+10·최대) 버튼", "")
    ok("최대 +" in tpl["gear"], "장비 최대 강화 버튼에 가능 횟수 표시", "")

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
      return { rarity: s.gearRarity.weapon, shards: s.shards, equipped: r.results[0].equipped,
               dust: r.results[0].shards, items: s.gear.items.length, dup: r.results[0].duplicate };
    """)
    ok(p2["rarity"] == "legend" and p2["equipped"] is False, "동급은 자동 장착하지 않음(비교 후 직접 장착)", json.dumps(p2))
    ok(p2["items"] == 1 and p2["shards"] == 0 and p2["dup"] is False, "동급 장비는 인벤토리에 보관(v4 — 갈아끼울 수 있게)", json.dumps(p2))

    p2b = js(ctx, """
      const s = defaultState(0); s.gold = 3000; s.shards = 0;
      const r1 = pullGear(s, 1, () => 0);
      const id = r1.results[0].itemId;
      const s2 = defaultState(0); s2.gold = 3000; s2.shards = 0;
      acquireGear(s2, id); acquireGear(s2, id);
      const again = acquireGear(s2, id);
      return { id, shards: s2.shards, dup: again.duplicate, items: s2.gear.items.length };
    """)
    ok(p2b["dup"] is True and p2b["items"] == 1 and p2b["shards"] == 2 + 2, "같은 아이템 중복 획득 → 강화석 자동 분해", json.dumps(p2b))

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
    ok("data-action=\"toggle-sound\"" in read("src/ui.js") + read("src/ui-settings.js"), "설정 탭 효과음 스위치")


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
    ok(petdef["names"] == ["꼬마 늑대", "불여우", "황금 부엉이", "아기 드래곤", "크리스탈 골렘", "천둥 매"], "펫 6종 정의(이름 순서)", json.dumps(petdef["names"], ensure_ascii=False))
    ok(petdef["types"] == ["cities:1", "pyeong:100", "asset:50000", "cities:10", "pyeong:500", "cities:25"], "펫 해금 조건(지역1·100평·총자산5만·지역10·500평·지역25)", json.dumps(petdef["types"]))
    ok(all(d > 0 for d in petdef["dmg"]) and max(petdef["dmg"]) == petdef["dmg"][5], "펫 피해 비율(최강은 천둥 매)", json.dumps(petdef["dmg"]))
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
      const r4 = promoteJob(s, 5000);          // 4단계(드래곤 나이트): Lv.65 필요 → 거부
      const p4 = jobProgress(s);
      s.level = 70;
      const atk3 = calcStats(s, {}).atk;       // 같은 레벨(70)에서 비교
      const r5 = promoteJob(s, 6000);          // 5단계(드래곤 로드)
      const tier5 = s.jobTier;
      const atk4 = calcStats(s, {}).atk;
      const hp4 = calcStats(s, {}).hpMax;
      const p6 = jobProgress(s);               // 6단계: S40 충족 · Lv.85 부족
      // S40 은 충족하고 레벨도 90인 5단계 상태 → 6단계 전직 가능
      const s40 = defaultState(0); s40.jobTier = 4; s40.level = 90; s40.maxStage = 40;
      const s40ok = jobProgress(s40).canPromote;
      // 레벨은 90인데 S31 → 5단계의 S32 조건에서 막힌다
      const noStage = defaultState(0); noStage.jobTier = 3; noStage.level = 90; noStage.maxStage = 31;
      const noStageProg = jobProgress(noStage);
      s.level = 90;
      const hpBefore6 = calcStats(s, {}).hpMax;
      const r6 = promoteJob(s, 7000);          // 6단계(용신)
      const atk5 = calcStats(s, {}).atk;
      const hp5 = calcStats(s, {}).hpMax;
      const r7 = promoteJob(s, 8000);
      const pe = jobProgress(s);
      return {
        names: JOBS.map(j => j.name), tiers: JOBS.map(j => j.tier), badges: JOBS.map(j => j.badge),
        req: JOBS.map(j => [j.lv, j.stage]), pct: JOBS.map(j => [j.atkPct, j.hpPct]),
        p1: p1.canPromote, p2: p2.canPromote, reason: p1.reason,
        ok1: r1.ok, tier1: r1.ok ? r1.to.tier : -1, atk0, atk1, hp0, hp1,
        early: early.ok, ok2: r2.ok, ok3: r3.ok, atk3,
        r4: r4.ok, r4reason: r4.reason, p4reason: p4.reason, p4lvLeft: p4.lvLeft,
        r5: r5.ok, tierAfter5: tier5, atk4, hp4, p6reason: p6.reason, p6lvLeft: p6.lvLeft,
        s40ok, noStageOk: noStageProg.canPromote, noStageReason: noStageProg.reason,
        r6: r6.ok, atk5, hp5, hpBefore6, r7: r7.ok, maxTier: s.jobTier, jobMax: JOB_MAX, jobCount: JOB_COUNT,
        doneReason: pe.reason, doneNext: pe.next, upper: [isUpperJob(0), isUpperJob(3), isUpperJob(4), isUpperJob(5)],
      };
    """)
    ok(job["names"] == ["견습 기사", "왕국 기사", "성기사", "드래곤 나이트", "드래곤 로드", "용신"] and job["tiers"] == [0, 1, 2, 3, 4, 5], "전직 6단계 정의(4단계 + 상위 전직 2단계)", json.dumps(job["names"], ensure_ascii=False))
    ok(job["req"] == [[1, 1], [12, 8], [24, 16], [36, 24], [65, 32], [85, 40]] and job["pct"][4] == [115, 82] and job["pct"][5] == [185, 130], "상위 전직 조건(Lv.65·S32 / Lv.85·S40)과 누적 배율", json.dumps({"req": job["req"], "pct": job["pct"]}))
    ok(job["badges"][4:] == ["🐉", "👑"] and job["upper"] == [False, False, True, True] and job["jobMax"] == 5 and job["jobCount"] == 6, "상위 전직 배지·isUpperJob·단계 상한", json.dumps({"b": job["badges"][4:], "u": job["upper"], "max": job["jobMax"]}, ensure_ascii=False))
    ok(job["p1"] is False and job["p2"] is True, "전직 조건(레벨·스테이지) 판정", json.dumps({"p1": job["p1"], "p2": job["p2"]}))
    ok(job["ok1"] is True and job["tier1"] == 1 and job["atk1"] > job["atk0"] and job["hp1"] > job["hp0"], "전직 시 영구 공격력·체력 배율", f"{job['atk0']}→{job['atk1']} / {job['hp0']}→{job['hp1']}")
    ok(job["early"] is False and job["ok2"] is True and job["ok3"] is True, "전직은 단계별로만", json.dumps({k: job[k] for k in ["early", "ok2", "ok3"]}))
    ok(job["r4"] is False and "Lv.65" in job["r4reason"] and job["p4lvLeft"] == 5, "5단계 전직은 Lv.65 전까지 거부(남은 5레벨 안내)", json.dumps({"ok": job["r4"], "why": job["r4reason"], "left": job["p4lvLeft"]}, ensure_ascii=False))
    ok(job["r5"] is True and job["tierAfter5"] == 4 and job["atk4"] > job["atk3"] * 1.25 and job["hp4"] > job["hp1"] * 1.2, "5단계 전직 — 같은 레벨에서도 영구 배율 상승", f"{job['atk3']}→{job['atk4']} / {job['hp4']}")
    ok("Lv.85" in job["p6reason"] and job["p6lvLeft"] == 15 and job["s40ok"] is True, "6단계 진행도 — S40 충족 · Lv.85까지 15레벨", json.dumps({"why": job["p6reason"], "left": job["p6lvLeft"], "s40": job["s40ok"]}, ensure_ascii=False))
    ok(job["noStageOk"] is False and "32" in job["noStageReason"], "5단계는 Lv.90이라도 S32가 없으면 거부", json.dumps({"why": job["noStageReason"]}, ensure_ascii=False))
    ok(job["r6"] is True and job["maxTier"] == 5 and job["atk5"] > job["atk4"] * 1.25 and job["hp5"] > job["hpBefore6"] * 1.15, "6단계(용신) 전직 — 최종 단계·배율 상승", f"{job['atk4']}→{job['atk5']} / {job['hpBefore6']}→{job['hp5']}")
    ok(job["r7"] is False and job["doneNext"] is None and job["doneReason"] == "최종 전직 완료", "최종(6단계) 이후 전직 없음")

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
    ok(compat["level"] == 40 and compat["gold"] == 7777 and compat["pet"] == {"equipped": None, "sub": None, "unlocked": [], "chosen": False, "levels": {}, "evo": {}} and compat["job"] == 0 and compat["cd"] == 0, "v3.1 저장 호환(펫·전직·던전 기본값 병합 · v4.2 evo · v5.3 sub 포함)", json.dumps(compat, ensure_ascii=False))
    ok(compat["badPet"] == {"equipped": None, "sub": None, "unlocked": ["fox"], "chosen": False, "levels": {"fox": 1}, "evo": {}} and compat["badJob"] == 5 and compat["badCd"] == 0 and compat["badBest"] == 0 and compat["badRuns"] == 0, "손상된 펫/전직/던전 값 방어", json.dumps({k: compat[k] for k in ["badPet", "badJob", "badCd", "badBest", "badRuns"]}, ensure_ascii=False))

    tpl2 = js(ctx2, """
      const s = defaultState(0);
      s.gold = 60000; s.shards = 320; s.level = 12; s.stage = 7; s.maxStage = 8;
      for (const c of CITIES.slice(0, 5)) s.land.owned[c.key] = 40;
      s.pet = { equipped: 'fox', unlocked: ['wolf', 'fox'], chosen: true };
      s.dungeon = { best: 12345, runs: 2, last: { at: 0, gold: 999, shards: 12, kills: 8, bossKills: 1, dmg: 12345 } };
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(7), boss: null, dungeon: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {} };
      const hunt = __huntAll(ui);
      const job = __gearSub(ui, 'job');
      const collect = __gearSub(ui, 'collect');
      s.land.sub = 'home';
      const land = __tpls.land(ui);
      const set = __tpls.settings(ui);
      return { hunt, job, collect, land, set, bad: /undefined|NaN|\\[object Object\\]/.test(hunt + job + collect + land + set) };
    """)
    ok(tpl2["bad"] is False, "v3.2 템플릿에 undefined/NaN 누출 없음")
    ok("✨ 전직 가능!" in tpl2["job"], "성장 → 전직·환생 탭에 전직 카드(v8)", "")
    ok("황금 던전" in tpl2["hunt"] and "동료 펫" in tpl2["hunt"], "사냥 탭에 도전·펫 카드(v8: 도전/전투 서브)", "")
    ok("동료 펫" in tpl2["collect"], "성장 → 수집 탭에 펫 카드(v8)", "")
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
    ok("📲 홈 화면에 앱으로 설치" in uijs + read("src/ui-settings.js") and 'data-action="install"' in uijs + read("src/ui-settings.js"), "설정 탭 상단 📲 설치 카드")
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
    ok(passive["end"]["stage"] <= 30, "방치는 30스테이지 안에서 막힘", f"S{passive['end']['stage']}")
    ok(passive["end"]["equip"]["weapon"] == 0 and passive["end"]["gold"] > 0, "방치 봇은 강화/매수 안 함(대조군)")
    fails = active["bossFails"]
    attempts = active["bossStarts"]
    ok(attempts > 20 and fails / max(1, attempts) < 0.6, "보스 실패율 과다 아님(다굴 재밸런싱)", f"{fails}/{attempts}")
    print(f"  · 적극: 5분 S{bs.stage_at(active['marks'], 5)} · 10분 S{s10} · 30분 S{s22} · 60분 S{active['end']['stage']} · 보스 {attempts}회/실패 {fails}회 · 사망 {active['deaths']}회")
    print(f"  · 방치: 60분 S{passive['end']['stage']} · 보스 {passive['bossStarts']}회/실패 {passive['bossFails']}회 · 사망 {passive['deaths']}회")
    # v3.8 다굴: S20 이후 생존 스탯(방어·체력·회복)을 챙기지 않으면 실제로 쓰러진다
    ok(active["deaths"] > 0, "S20+ 다굴에서 실제 사망 발생(생존 스탯 동기)", f"사망 {active['deaths']}회")
    ok(active["end"]["stage"] >= 26 and bs.stage_at(active["marks"], 5) >= 8, "다굴 리밸런싱 후에도 성장 곡선 유지", f"5분 S{bs.stage_at(active['marks'], 5)} · 60분 S{active['end']['stage']}")

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
    ok(len(qdef["ids"]) == 30 and len(set(qdef["ids"])) == 30, "미션 30단계 정의(중복 없음)", str(len(qdef["ids"])))
    ok(set(qdef["types"]) >= {"kills", "stage", "equipLv", "gacha", "cities", "bossKills", "dungeon", "pyeong", "job"}, "미션에 사냥·강화·뽑기·매수·던전·전직 흐름 포함", json.dumps(sorted(set(qdef["types"]))))
    ok(all(p > 0 for p in qdef["pay"]) and all(g >= 1 for g in qdef["goals"]), "모든 미션에 1 이상 목표·골드/강화석 보상", json.dumps(qdef["pay"]))
    ok(any(v > 0 for v in qdef["golds"]) and any(v > 0 for v in qdef["shards"]), "미션 보상에 💰 골드·💎 강화석 모두 존재")
    ok(len(qdef["achIds"]) == 36 and len(set(qdef["achIds"])) == 36, "업적 36종 정의(중복 없음)", str(len(qdef["achIds"])))
    ok(all(s > 0 for s in qdef["achShards"]) and qdef["achAtk"] >= 2 and qdef["achGold"] >= 2, "업적 보상 = 💎 + 영구 스탯 보너스", json.dumps({"atk": qdef["achAtk"], "gold": qdef["achGold"]}))
    ok(qdef["weights"] == [30, 40, 20, 10] and qdef["milestones"] == [10, 25, 50, 75, 100], "도감 가중치 합 100 · 마일스톤 5단계", json.dumps(qdef["weights"]))
    ok(qdef["monsters"] == 50 and qdef["bosses"] == 17 and qdef["petIds"] == ["wolf", "fox", "owl", "dragon", "golem", "hawk"], "도감 몬스터 50종(보스 17)·펫 6종", json.dumps({"m": qdef["monsters"], "b": qdef["bosses"]}))

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
      s.totalKills = 5000; s.maxStage = 50; s.peakStage = 50; s.stage = 50; s.bossKills = 40; s.level = 90;
      s.equip.weapon = 40; s.equip.armor = 20;
      s.gacha.total = 60; s.jobTier = 5;
      s.dungeon = { best: 1000, runs: 3, last: null };
      s.rebirth.count = 1; s.tower.best = 25; s.dailyBoss.runs = 1; s.land.auction.bids = 1;
      s.pet.unlocked = ['wolf']; s.pet.evo = { wolf: 1 };
      for (const c of CITIES.slice(0, 6)) s.land.owned[c.key] = 30;
      for (const c of CITIES.filter(x => citySetId(x.key) === 'jeju')) s.land.owned[c.key] = 10;
      s.land.landmarks[CITIES[0].key] = 3;
      const gold0 = s.gold, shards0 = s.shards;
      const claimed = [];
      const reasons = [];
      for (let i = 0; i < 40; i++) {
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
    ok(chain["n"] == 30 and chain["cur"] is None and chain["reasons"] == [] and chain["done"] == 30, "조건이 차면 30단계 연속 수령 → 시즌 완료", json.dumps(chain, ensure_ascii=False))
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
    ok(cxr["monsterTotal"] == 50 and cxr["monstersMet"] == 1 and cxr["petsUnlocked"] == 0, "도감 상세 목록(50종·펫 6종)", json.dumps({"met": cxr["monstersMet"]}))

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
    ok(nq["badIdx"] == 30 and nq["badClaimed"] == ["m01"] and nq["badAch"] == ["a_land1"], "손상된 미션/업적 값 방어", json.dumps({"idx": nq["badIdx"], "c": nq["badClaimed"]}))
    ok(nq["badMonsters"] == {"Slime": {"m": 1, "k": 0}} and nq["badCities"] == ["0_0_0"] and "legend" not in nq["badGear"] and "rare" not in nq["badGear"], "손상된 도감 값 방어(알 수 없는 키·음수 제거)", json.dumps({"m": nq["badMonsters"], "c": nq["badCities"], "g": nq["badGear"]}, ensure_ascii=False))
    ok(nq["stable"] is True and 5 <= nq["pct"] < 30, "정규화 반복해도 안정 · 보유 지역이 도감 수집률에 반영", f"pct={nq['pct']}")

    tpl3 = js(ctx2, """
      const s = defaultState(0);
      s.gold = 20000; s.shards = 100; s.totalKills = 10; s.maxStage = 3;
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(3), boss: null, dungeon: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const hunt = __huntAll(ui);
      const settings = __tpls.settings(ui);
      const done = defaultState(0);
      done.quests = { idx: QUESTS.length, claimed: QUESTS.map(q => q.id), done: QUESTS.length, at: 0 };
      const ui2 = { s: done, battle: { stats: calcStats(done, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: {} }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const huntDone = __huntSub(ui2, 'mission');
      return {
        hunt, settings, huntDone,
        bad: /undefined|NaN|\\[object Object\\]/.test(hunt + settings + huntDone),
      };
    """)
    ok(tpl3["bad"] is False, "v3.3 템플릿에 undefined/NaN 누출 없음")
    ok("🎯" in tpl3["hunt"] and "goto-todo" in tpl3["hunt"] and "claim-note" in tpl3["hunt"], "사냥 탭 — 미션 카드·진행도 + 허브 수령 동선(v8.1.0)", "")
    ok('data-action="open-codex"' in tpl3["hunt"] and 'data-action="open-achievements"' in tpl3["hunt"], "사냥 탭 — 도감·업적 진입 버튼", "")
    ok("도감 · 업적" in tpl3["settings"] and 'data-action="open-codex"' in tpl3["settings"], "설정 탭 — 도감·업적 바로가기 링크(v8.1.0 다이어트)", "")
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
    ok(all(x in uisrc2 for x in ['data-action="goto-todo"', 'data-action="open-codex"', 'data-action="open-achievements"', "case 'claim-achievement'"]) and 'data-action="claim-achievement"' in appsrc2, "미션·업적·도감 버튼 연결(ui.js·app.js) — 미션 보상은 허브로")
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
      out.hunt = __huntSub(ui, 'battle');
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
    ok('data-live="news-left"' in tpl4["home"] and 'data-live="news-prog"' in tpl4["home"], "뉴스 남은 시간·진행 바 실시간 갱신(압축 뉴스)", "")
    ok("권역 세트" in tpl4["home"] and "서울권" in tpl4["home"], "영지 탭에 권역 세트 현황(v8)", "")
    ok("랜드마크" in tpl4["home"] and "Lv.2" in tpl4["home"], "영지 탭에 랜드마크 현황(v8)", "")
    ok('data-action="landmark"' in tpl4["market"], "보유 매물에서 랜드마크 건설/업그레이드 버튼(v8: 매물 탭)", "")
    ok("아직 랜드마크가 없습니다" in tpl4["emptyHome"] and "📰 부동산 호재" in tpl4["emptyHome"], "새 게임에서도 뉴스·랜드마크 카드가 깨지지 않음", "")
    ok("📰" in tpl4["home"], "부동산 탭에 현재 호재 요약", "")

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
    ok(all(x in uisrc3 for x in ["newsSlim", "regionSetCard", "regionMapCard", "landmarkCard", 'data-action="landmark"']), "뉴스·세트·랜드마크·지도 UI 구현")
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
    ok(len(rbd["ids"]) == 8 and len(set(rbd["ids"])) == 8 and all(v == 20 for v in rbd["maxLv"]) and "guard" in rbd["ids"] and "regen" in rbd["ids"], "영구 특성 8종(방어·회복 포함, 각 Lv.1~20)", json.dumps(rbd["ids"]))
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
        ratio31: monsterBaseHp(31) / monsterBaseHp(30), ratio30: monsterBaseHp(30) / monsterBaseHp(29),
        growth: [INFINITE.hpGrowth, INFINITE.atkGrowth, INFINITE.goldGrowth, INFINITE.expGrowth] };
    """)
    ok(inf["diff"] == [], "S1~30 몬스터 수치가 기존과 완전히 동일(회귀 없음)", json.dumps(inf["diff"]))
    ok(inf["bad"] == 0 and inf["inf"] == [False, True, True, True, True, True], "S31·S50·S100·S250·S1000 스테이지 정의(몬스터·보스·테마)", json.dumps(inf["inf"]))
    ok("∞" in inf["theme"] and inf["tier"][3] == "infinity", "무한 구간 표기(∞ · tier)", inf["theme"])
    ok(all(inf["hp"][i] < inf["hp"][i + 1] for i in range(len(inf["hp"]) - 1)) and inf["ratio31"] < inf["ratio30"] and abs(inf["ratio31"] - 1.08) < 0.0001, "S31 이후 무한 곡선(체력 ×1.08 · 단조 증가)", json.dumps({"hp": inf["hp"], "r31": round(inf["ratio31"], 4), "r30": round(inf["ratio30"], 4)}))
    ok(all(inf["atk"][i] < inf["atk"][i + 1] for i in range(2)) and all(inf["gold"][i] < inf["gold"][i + 1] for i in range(2)) and all(inf["exp"][i] < inf["exp"][i + 1] for i in range(2)), "공격·골드·경험치도 무한 구간에서 계속 성장", json.dumps({"a": inf["atk"], "g": inf["gold"], "e": inf["exp"]}))
    ok(abs(inf["boss"]["hp"] - inf["normal"]["hp"] * 4.2) <= 2 and inf["gold"][2] < 1000000, "보스 배율 유지 · 골드 인플레 억제", json.dumps({"b": inf["boss"]["hp"], "n": inf["normal"]["hp"], "g100": inf["gold"][2]}))
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
      const hunt = __huntAll(ui);
      const set = __tpls.settings(ui);
      const lowS = defaultState(0);
      const ui2 = { s: lowS, battle: { stats: calcStats(lowS, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: computeBuffs(lowS, 0) }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const low = __gearSub(ui2, 'job');
      const jobRich = __gearSub(ui, 'job');
      const deepS = defaultState(0);
      deepS.stage = 100; deepS.maxStage = 100; deepS.level = 70;
      const ui3 = { s: deepS, battle: { stats: calcStats(deepS, {}), def: stageDef(100), boss: null, player: { hp: 1 } }, app: { buffs: computeBuffs(deepS, 0) }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const deepHunt = __huntSub(ui3, 'battle');
      return { hunt, set, low, jobRich, deepHunt, bad: /undefined|NaN|\\[object Object\\]/.test(hunt + set + low + jobRich + deepHunt) };
    """)
    ok(tpl5["bad"] is False, "v3.5 템플릿에 undefined/NaN 누출 없음")
    ok("환생 (초월)" in tpl5["jobRich"] and 'data-action="rebirth"' in tpl5["jobRich"] and 'data-action="rebirth-traits"' in tpl5["jobRich"], "성장 → 전직·환생 탭에 환생 카드·버튼(v8)", "")
    ok("환생하기 · +" in tpl5["jobRich"] and "초월석" in tpl5["jobRich"] and "초월 특성" in tpl5["jobRich"], "환생 카드에 예정 포인트·획득 특성 요약", "")
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

    section("[12] 💾 세이브 코드 백업 · 복원 · 편의성 (v3.6.0)")
    sc = js(ctx, """
      const s = defaultState(1700000000000);
      s.level = 42; s.gold = 1234567; s.shards = 600; s.stage = 30; s.maxStage = 30; s.peakStage = 30;
      s.equip = { weapon: 21, armor: 10, helmet: 4, ring: 2, amulet: 1 };
      s.gearRarity = { weapon: 'hero', armor: 'rare', helmet: 'advanced', ring: 'common', amulet: 'legend' };
      s.jobTier = 2;
      s.pet = { equipped: 'dragon', unlocked: ['wolf', 'fox', 'owl', 'dragon'], chosen: true, levels: { wolf: 5, fox: 3, owl: 2, dragon: 7 } };
      s.quests = { idx: 6, claimed: QUESTS.slice(0, 6).map((q) => q.id), done: 6, at: 1 };
      s.achievements = { claimed: ACHIEVEMENTS.slice(0, 2).map((a) => a.id) };
      s.codex.cities[CITIES[0].key] = { p: 40, t: 5 };
      s.rebirth = { count: 2, points: 30, totalPoints: 120, traits: { atk: 3, gold: 2 }, bestStage: 30, at: 1 };
      s.memo = '한글 ⚔️ 복원 테스트 ✅';
      for (const c of CITIES.slice(0, 4)) s.land.owned[c.key] = 50;
      s.land.accruedRent = 777;
      s.land.assetHistory = [{ t: 1, v: 100 }, { t: 2, v: 200 }];
      s.land.q = '서울'; s.land.page = 3; s.land.sort = 'price'; s.land.sub = 'market';
      const code = encodeSave(s);
      const d = decodeSave(code);
      const n = d.state;
      return {
        prefix: code.indexOf('LANDRPG3:') === 0,
        len: code.length,
        ok: d.ok,
        same: {
          level: n.level, gold: n.gold, shards: n.shards, stage: n.stage, peak: n.peakStage,
          equip: n.equip.weapon, rarity: n.gearRarity.weapon, job: n.jobTier, pet: n.pet.equipped,
          petLv: n.pet.levels.dragon, quests: n.quests.done, ach: n.achievements.claimed.length,
          codexCity: n.codex.cities[CITIES[0].key] ? n.codex.cities[CITIES[0].key].p : 0,
          codexGear: n.codex.gear.legend || 0, rebirth: n.rebirth.count, traits: n.rebirth.traits.atk,
          memo: n.memo, owned: Object.keys(n.land.owned).length, rent: Math.round(n.land.accruedRent),
        },
        compact: {
          hist: n.land.assetHistory.length, page: n.land.page, q: n.land.q,
          sort: n.land.sort, sub: n.land.sub,
          freshActive: n.lastActiveAt > 1700000000000, freshRent: n.land.rentAt > 1700000000000,
        },
        orig: { hist: s.land.assetHistory.length, page: s.land.page, q: s.land.q, sub: s.land.sub },
        summary: d.summary,
      };
    """)
    ok(sc["prefix"] is True and sc["ok"] is True, "세이브 코드 LANDRPG3 형식으로 인코딩·디코딩", str(sc.get("len")))
    ok(sc["len"] < 3000, "세이브 코드 길이 3KB 미만(중반 세이브)", str(sc["len"]))
    same = sc["same"]
    ok(same["level"] == 42 and same["gold"] == 1234567 and same["shards"] == 600 and same["stage"] == 30 and same["peak"] == 30, "레벨·골드·강화석·스테이지 왕복 보존", json.dumps(same, ensure_ascii=False))
    ok(same["equip"] == 21 and same["rarity"] == "hero" and same["job"] == 2, "장비 강화·등급·전직 왕복 보존", json.dumps(same, ensure_ascii=False))
    ok(same["pet"] == "dragon" and same["petLv"] == 7 and same["quests"] == 6 and same["ach"] == 2, "펫·미션·업적 왕복 보존", json.dumps(same, ensure_ascii=False))
    ok(same["codexCity"] == 50 and same["codexGear"] >= 1, "도감(지역 평수·장비 등급) 왕복 보존", json.dumps(same, ensure_ascii=False))
    ok(same["rebirth"] == 2 and same["traits"] == 3 and same["owned"] == 4 and same["rent"] == 777, "환생·부동산·임대수익 왕복 보존", json.dumps(same, ensure_ascii=False))
    ok(same["memo"] == "한글 ⚔️ 복원 테스트 ✅", "UTF-8(한글·이모지) 안전 인코딩", same["memo"])
    c = sc["compact"]
    ok(c["hist"] == 0 and c["page"] == 1 and c["q"] == "" and c["sort"] == "roi" and c["sub"] == "home", "코드에는 화면 상태·자산 그래프를 담지 않음", json.dumps(c, ensure_ascii=False))
    ok(c["freshActive"] is True and c["freshRent"] is True, "복원 시각 기준으로 방치·임대 시계가 새로 시작", json.dumps(c, ensure_ascii=False))
    ok(sc["orig"]["hist"] == 2 and sc["orig"]["page"] == 3 and sc["orig"]["sub"] == "market", "인코딩이 원본 저장본을 바꾸지 않음", json.dumps(sc["orig"], ensure_ascii=False))
    sm = sc["summary"]
    ok(sm["level"] == 42 and sm["stage"] == 30 and sm["cities"] == 4 and sm["rebirth"] == 2, "미리보기 요약(레벨·최고 스테이지·보유 지역·환생)", json.dumps(sm, ensure_ascii=False))

    bad = js(ctx, """
      const s = defaultState(0); s.level = 9;
      const code = encodeSave(s);
      const flip = (c, i) => c.slice(0, i) + (c[i].toLowerCase() === 'a' ? 'b' : 'a') + c.slice(i + 1);
      const pick = (r) => ({ ok: r.ok, code: r.code || '', reason: r.reason || '', hasState: !!r.state });
      return {
        payload: pick(decodeSave(flip(code, Math.floor(code.length / 2)))),
        checksum: pick(decodeSave(flip(code, code.length - 1))),
        cut: pick(decodeSave(code.slice(0, 30))),
        empty: pick(decodeSave('')),
        spaces: pick(decodeSave('   ')),
        plain: pick(decodeSave('안녕하세요 그냥 텍스트')),
        v2: pick(decodeSave('LANDRPG2:aaaa.bbbbbbbb')),
        json: pick(decodeSave(encodePayload('not json'))),
        shape: pick(decodeSave(encodePayload('[1,2,3]'))),
        num: pick(decodeSave(encodePayload('42'))),
        wrappedOk: decodeSave(' ' + code.slice(0, 40) + '\\n' + code.slice(40) + ' \\n').ok,
        good: decodeSave(code).ok,
      };
    """)
    ok(bad["payload"]["ok"] is False and bad["payload"]["code"] == "checksum" and not bad["payload"]["hasState"], "한 글자만 바뀐 코드는 체크섬으로 거부", json.dumps(bad["payload"], ensure_ascii=False))
    ok(bad["checksum"]["ok"] is False and bad["checksum"]["code"] == "checksum", "체크섬만 바뀐 코드도 거부", json.dumps(bad["checksum"], ensure_ascii=False))
    ok(bad["cut"]["ok"] is False and bad["cut"]["code"] == "format", "잘린 코드 거부", json.dumps(bad["cut"], ensure_ascii=False))
    ok(bad["empty"]["ok"] is False and bad["spaces"]["ok"] is False and bad["empty"]["code"] == "empty", "빈 입력 거부", json.dumps(bad["empty"], ensure_ascii=False))
    ok(bad["plain"]["ok"] is False and bad["plain"]["code"] == "prefix" and not bad["plain"]["hasState"], "세이브 코드가 아닌 텍스트 거부", json.dumps(bad["plain"], ensure_ascii=False))
    ok(bad["v2"]["ok"] is False and bad["v2"]["code"] == "prefix", "다른 버전(LANDRPG2) 코드 거부", json.dumps(bad["v2"], ensure_ascii=False))
    ok(bad["json"]["ok"] is False and bad["json"]["code"] == "json", "체크섬이 맞아도 JSON 이 아니면 거부", json.dumps(bad["json"], ensure_ascii=False))
    ok(bad["shape"]["ok"] is False and bad["shape"]["code"] == "shape" and bad["num"]["ok"] is False, "객체가 아닌 세이브 데이터 거부", json.dumps(bad["shape"], ensure_ascii=False))
    ok(bad["wrappedOk"] is True and bad["good"] is True, "줄바꿈·공백이 섞여 붙여넣어도 복원 가능", json.dumps(bad, ensure_ascii=False))

    hard = js(ctx, """
      const raw = { ver: 3, level: -5, gold: -100, shards: -3, stage: 0, maxStage: 0,
        equip: { weapon: 999, armor: -4 }, gearRarity: { weapon: 'nope' },
        rebirth: { count: -2, points: -10, traits: { atk: 99, hack: 5 } },
        land: { owned: { nope: 5, '11110': -3 }, landmarks: { '11110': 9 } },
        pet: { equipped: 'dragon', unlocked: ['dragon', 'alien'], levels: { dragon: 99 } } };
      const d = decodeSave(encodePayload(JSON.stringify(raw)));
      return { ok: d.ok, level: d.state.level, gold: d.state.gold, shards: d.state.shards,
               stage: d.state.stage, weapon: d.state.equip.weapon, armor: d.state.equip.armor,
               rarity: d.state.gearRarity.weapon, rebirth: d.state.rebirth.count,
               traits: Object.keys(d.state.rebirth.traits).join(','), owned: Object.keys(d.state.land.owned).length,
               pet: d.state.pet.equipped, petLv: d.state.pet.levels.dragon,
               negOwned: Object.prototype.hasOwnProperty.call(d.state.land.owned, '11110') };
    """)
    ok(hard["ok"] is True and hard["level"] == 1 and hard["gold"] == 0 and hard["shards"] == 0 and hard["stage"] == 1, "손상 값(음수 레벨·골드·스테이지)은 정규화로 정리", json.dumps(hard, ensure_ascii=False))
    ok(hard["weapon"] == 100 and hard["armor"] == 0 and hard["rarity"] == "common", "장비 강화 상한·음수·미지 등급 정리", json.dumps(hard, ensure_ascii=False))
    ok(hard["rebirth"] == 0 and hard["traits"] == "atk" and hard["owned"] == 1 and hard["negOwned"] is False, "환생·특성·부동산 손상 값 정리", json.dumps(hard, ensure_ascii=False))
    ok(hard["pet"] == "dragon" and hard["petLv"] == 10, "펫 레벨 상한 정리(99 → 10)", json.dumps(hard, ensure_ascii=False))

    enh = js(ctx, """
      const s = defaultState(0);
      s.shards = 5000;
      const maxAll = enhanceMaxCount(s, 'weapon');
      const r5 = tryEnhance(s, 'weapon', 5);
      const after5 = s.equip.weapon;
      const shards5 = s.shards;
      const rest = enhanceMaxCount(s, 'weapon');
      const rMax = tryEnhance(s, 'weapon', rest);
      const poor = defaultState(0);
      poor.shards = 1;
      const rPoor = tryEnhance(poor, 'weapon', 5);
      const cap = defaultState(0);
      cap.shards = 100000;
      cap.equip.weapon = 99;
      const capMax = enhanceMaxCount(cap, 'weapon');
      const rCap = tryEnhance(cap, 'weapon', 5);
      const slotless = enhanceMaxCount(s, 'cape');
      const part = defaultState(0);
      part.shards = 7;
      const rPart = tryEnhance(part, 'weapon', 5);
      return {
        maxAll, after5, r5: [r5.ok, r5.done], rest, rMax: [rMax.ok, rMax.done, !!rMax.max],
        lv: s.equip.weapon, shards: s.shards, shards5,
        poor: [rPoor.ok, rPoor.done, rPoor.reason], capMax, capLv: cap.equip.weapon, rCap: [rCap.ok, rCap.done, !!rCap.max],
        slotless, capped: s.equip.weapon <= 100,
        partial: [rPart.ok, rPart.done, rPart.reason], partialLv: part.equip.weapon,
      };
    """)
    ok(enh["maxAll"] > 10 and enh["maxAll"] == enh["after5"] + enh["rest"], "+1~최대까지 일괄 강화 가능 횟수 계산", json.dumps(enh, ensure_ascii=False))
    ok(enh["after5"] == 5 and enh["r5"] == [True, 5], "+5 버튼이 5강을 한 번에 올림", json.dumps(enh["r5"], ensure_ascii=False))
    ok(enh["rMax"][0] is True and enh["rMax"][1] > 0 and enh["lv"] == enh["maxAll"] and enh["shards"] >= 0, "최대 강화가 강화석이 닿는 만큼 한 번에 올림", json.dumps(enh, ensure_ascii=False))
    ok(enh["poor"] == [False, 0, "강화석이 부족합니다."], "강화석 부족 시 +5도 아무것도 바꾸지 않고 실패", json.dumps(enh["poor"], ensure_ascii=False))
    ok(enh["partial"] == [True, 2, "강화석이 부족합니다."] and enh["partialLv"] == 2, "강화석이 5강에 못 미치면 가능한 만큼만 올림(+2)", json.dumps(enh["partial"], ensure_ascii=False))
    ok(enh["capMax"] == 1 and enh["capLv"] == 100 and enh["rCap"] == [True, 1, True], "100강 상한에서 최대 1강만 오르고 MAX 표시", json.dumps(enh, ensure_ascii=False))
    ok(enh["slotless"] == 0, "알 수 없는 부위는 0강", str(enh["slotless"]))

    trade = js(ctx, """
      const s = defaultState(0);
      s.gold = 200000;
      const key = CITIES.slice().sort((a, b) => a.base - b.base)[0].key;
      const max = maxBuyQty(key, s, 0);
      const q1 = quoteTrade(key, 'buy', 1, s, 0);
      const q10 = quoteTrade(key, 'buy', 10, s, 0);
      const q50 = quoteTrade(key, 'buy', 50, s, 0);
      const qMax = quoteTrade(key, 'buy', max, s, 0);
      const over = quoteTrade(key, 'buy', 100000, s, 0);
      return { max, ok: [q1.ok, q10.ok, q50.ok, qMax.ok], over: [over.ok, over.reason],
               total50: q50.ok ? q50.total + q50.fee : 0 };
    """)
    ok(trade["max"] > 50 and all(trade["ok"]), "빠른 매수 단위(+1·+10·+50·최대) 견적이 모두 유효", json.dumps(trade, ensure_ascii=False))
    ok(trade["over"][0] is False, "잔여 공급을 넘는 수량은 거부", json.dumps(trade["over"], ensure_ascii=False))

    appsrc6 = read("app.js")
    uisrc6 = read("src/ui.js")
    css6 = read("style.css")
    scsrc = read("src/savecode.js")
    ok(all(x in scsrc for x in ["SAVE_CODE_PREFIX", "encodeSave", "decodeSave", "summarizeSave", "saveChecksum", "utf8Encode", "utf8Decode"]), "savecode.js 구성(인코딩·디코딩·체크섬·요약)", "")
    ok("LANDRPG3:" in scsrc and "Math.imul" in scsrc, "코드 접두사 LANDRPG3 · FNV-1a 체크섬", "")
    ok(all(x in appsrc6 for x in ["encodeSave", "decodeSave", "summarizeSave", "copySaveCode", "previewSaveCode", "restoreSaveCode", "applySaveState", "openSaveUndo", "navigator.clipboard", "execCommand"]), "앱 — 내보내기(클립보드+폴백)·미리보기·복원·되돌리기 연결", "")
    ok("claimRentNow" in appsrc6 and "rentInfo" in appsrc6, "임대수익 원탭 일괄 수령 + 내역 모달", "")
    ok("[1, 10, 50, 100, 1000]" in appsrc6, "매수 모달 빠른 수량 버튼(+1·+10·+50·최대)", "")
    ok(all(x in uisrc6 + read("src/ui-settings.js") for x in ['data-action="save-export"', 'data-action="save-import"', 'data-action="save-undo"', 'data-action="enhance5"', 'data-action="enhancemax"', 'data-action="rent-info"', "case 'save-export'", "case 'enhancemax'"]), "UI 액션 연결(백업·강화·임대)", "")
    ok(all(x in css6 for x in [".save-card", ".save-code", ".save-preview", ".g-acts", ".rent-meta"]), "v3.6 세이브·일괄 강화 CSS", "")
    ok("lang-rpg" not in css6, "CSS 깨짐 없음", "")


    section("[13] 🏃 몬스터 이동·공격·피격·사망 모션 · 투사체 (v3.7.0)")
    mod = js(ctx, """
      const names = Object.keys(MONSTERS);
      const missingMotion = names.filter((n) => !MONSTER_MOTION[n]);
      const missingAtk = names.filter((n) => !MONSTER_ATTACKS[n]);
      const arch = names.reduce((m, n) => { const a = MONSTER_MOTION[n]; m[a] = (m[a] || 0) + 1; return m; }, {});
      const ranged = names.filter((n) => MONSTER_ATTACKS[n].kind === 'ranged');
      const melee = names.filter((n) => MONSTER_ATTACKS[n].kind === 'melee');
      return {
        total: names.length, missingMotion, missingAtk, arch,
        ranged, melee, badProj: ranged.filter((n) => !MONSTER_ATTACKS[n].proj),
        moves: [...new Set(names.map((n) => MONSTER_ATTACKS[n].move))].sort(),
        fallback: [monsterMotion('Unknown'), monsterAttack('Unknown').kind, monsterAttack('Unknown').move],
        sprite: [spriteSrc('fx_claw'), spriteSrc('fx_burst'), spriteSrc('Slime'), spriteSrc('SlimeKing')],
      };
    """)
    ok(mod["total"] == 50 and mod["missingMotion"] == [] and mod["missingAtk"] == [], "50종 몬스터 모두 이동/공격 모션 정의", json.dumps({"missing": mod["missingMotion"] + mod["missingAtk"]}))
    ok(mod["arch"] == {"slime": 4, "flyer": 14, "walker": 32}, "슬라임 4 · 비행 14 · 보행 32 아키타입 분류", json.dumps(mod["arch"]))
    ok(len(mod["ranged"]) == 20 and len(mod["melee"]) == 30 and mod["badProj"] == [], "원거리 20종(투사체 보유) · 근접 30종", json.dumps({"r": mod["ranged"], "bad": mod["badProj"]}, ensure_ascii=False))
    ok(set(mod["moves"]) == {"claw", "slam", "bite", "fire", "feather", "dark", "holy", "acid", "ice", "sonic"}, "공격 모션 10종(할퀴기·내려찍기·물기·화염·깃털·암흑·신성·산성·얼음·음파)", json.dumps(mod["moves"]))
    ok(mod["fallback"] == ["walker", "melee", "claw"], "알 수 없는 이름은 보행·근접 할퀴기로 폴백", json.dumps(mod["fallback"]))
    ok(mod["sprite"] == ["assets/sprites/fx/fx_claw.png", "assets/sprites/fx/fx_burst.png", "assets/sprites/monster/Slime.png", "assets/sprites/boss/SlimeKing.png"], "이펙트/몬스터/보스 스프라이트 경로", json.dumps(mod["sprite"]))

    fx_files = ["assets/sprites/fx/fx_claw.png", "assets/sprites/fx/fx_burst.png"]
    ok(all(os.path.exists(os.path.join(ROOT, f)) for f in fx_files), "이펙트 스프라이트 2종 파일 존재", ", ".join(f for f in fx_files if not os.path.exists(os.path.join(ROOT, f))))
    ok(all(f"'./{f}'" in read("sw.js") for f in fx_files), "sw.js 프리캐시에 이펙트 스프라이트 포함")
    try:
        from PIL import Image
        metas = []
        for f in fx_files:
            im = Image.open(os.path.join(ROOT, f))
            metas.append([im.size, im.mode, os.path.getsize(os.path.join(ROOT, f))])
        ok(all(m[0] == (320, 320) and m[1] == "RGB" for m in metas), "이펙트 스프라이트 320px RGB(합성용)", json.dumps(metas))
        ok(all(m[2] < 200000 for m in metas), "이펙트 스프라이트 용량 200KB 미만(모바일 캐시 부담 없음)", json.dumps([m[2] for m in metas]))
    except Exception as e:  # noqa: BLE001
        ok(False, "이펙트 스프라이트 검사", str(e))

    mono = js(ctx, """
      const s = defaultState(0);
      s.stage = 7; s.maxStage = 7; s.level = 8; s.totalKills = 0; s.killsInStage = 0; s.bossReady = false;
      const rng = (function (seed) { let x = seed >>> 0; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; })(99);
      const b = new Battle(s, () => ({}), rng, 0);
      const evs = [];
      let t = 0;
      for (let i = 0; i < Math.round(30000 / 16); i++) {
        b.tick(16, t);
        for (const ev of b.drainEvents()) evs.push(Object.assign({}, ev, { at: t }));
        t += 16;
      }
      const attacks = evs.filter((e) => e.t === 'monsterAttack');
      const windups = evs.filter((e) => e.t === 'monsterWindup');
      const hurts = evs.filter((e) => e.t === 'playerHurt');
      let ordered = true;
      let minLead = 1e9;
      let maxLead = 0;
      let cadence = 1e9;
      const last = {};
      for (const a of attacks) {
        const w = windups.filter((x) => x.id === a.id && x.at <= a.at).pop();
        if (!w) { ordered = false; continue; }
        minLead = Math.min(minLead, a.at - w.at);
        maxLead = Math.max(maxLead, a.at - w.at);
        if (last[a.id] != null) cadence = Math.min(cadence, a.at - last[a.id]);
        last[a.id] = a.at;
      }
      const m = b.monsters[0];
      return {
        attacks: attacks.length, windups: windups.length, hurts: hurts.length, ordered,
        minLead, maxLead, cadence,
        kinds: [...new Set(attacks.map((a) => a.kind))].sort(),
        moves: [...new Set(attacks.map((a) => a.move))].sort(),
        rangedHurts: hurts.filter((h) => h.ranged).length,
        projHurts: hurts.filter((h) => h.proj).length,
        durs: [...new Set(windups.map((w) => w.dur))].sort((a, b) => a - b),
        walk: b.monsters.filter((x) => (x.walk || 0) > 0).length,
        moving: b.monsters.filter((x) => x.moving).length,
        fields: m ? ['arch', 'atkKind', 'moveKind', 'walk', 'windupAt', 'windupDur', 'strikeAt', 'attackSeq'].filter((k) => k in m) : [],
      };
    """)
    ok(mono["attacks"] > 5 and mono["windups"] >= mono["attacks"], "몬스터 공격 이벤트 + 전조 이벤트 발생", json.dumps({"a": mono["attacks"], "w": mono["windups"]}))
    ok(mono["ordered"] is True and 240 <= mono["minLead"] and mono["maxLead"] <= 820, "모든 공격은 전조(240~820ms) 뒤에 들어간다", json.dumps({"min": mono["minLead"], "max": mono["maxLead"]}))
    ok(mono["cadence"] >= 1500, "공격 간격은 기존 1500ms 이상 유지(밸런스 불변)", str(mono["cadence"]))
    ok(mono["hurts"] == mono["attacks"], "공격 1회 = 피해 1회(전조가 피해를 중복/누락시키지 않음)", json.dumps({"a": mono["attacks"], "h": mono["hurts"]}))
    ok(mono["rangedHurts"] > 0 and mono["projHurts"] > 0, "원거리 공격은 투사체 정보를 실어 보낸다", json.dumps({"r": mono["rangedHurts"], "p": mono["projHurts"]}))
    ok("ranged" in mono["kinds"] and "melee" in mono["kinds"], "근접/원거리 공격이 모두 발생", json.dumps(mono["kinds"]))
    ok(set(mono["moves"]) <= {"claw", "slam", "bite", "feather", "fire", "acid", "dark", "holy", "ice", "sonic"} and len(mono["moves"]) >= 2, "공격별 모션 종류가 이벤트에 실린다", json.dumps(mono["moves"]))
    ok(set([300, 470]) <= set(mono["durs"]) and set(mono["durs"]) <= {300, 390, 470, 560, 640, 730}, "전조 길이 = 근접 300ms · 원거리 470ms(+보스 보정)", json.dumps(mono["durs"]))
    ok(mono["walk"] > 0 and "arch" in mono["fields"] and "windupAt" in mono["fields"], "몬스터가 이동 거리(walk)·전조·모션 상태를 갖는다", json.dumps(mono["fields"]))

    csrc7 = read("src/combat.js")
    rsrc7 = read("src/render.js")
    ok(all(x in csrc7 for x in ["WINDUP_MELEE_MS", "WINDUP_RANGED_MS", "monsterWindup", "monsterAttack", "windupBase", "m.walk", "m.moving", "HEAVY_EVERY"]), "전투 — 전조/이동/강공격 상태 구현")
    ok(all(x in rsrc7 for x in ["monsterMotion", "monsterAttack", "drawWindup", "stepDust", "drawPuffs", "spawnProjectile", "drawProjectiles", "projectileImpact", "deathFx", "drawBossRoar", "flushDelayedHits", "worldFromScreen"]), "렌더러 — 이동/공격/투사체/사망 연출 구현")
    ok(all(x in rsrc7 for x in ["arch === 'slime'", "arch === 'flyer'", "const STEP = 22", "const HOP = 92", "shadowK", "squash".replace('squash', 'sx *=')]), "렌더러 — 슬라임 도약·비행 호버·보행 바운스·그림자 연동")
    ok(all(x in rsrc7 for x in ["fx_claw", "fx_burst", "globalCompositeOperation = 'lighter'"]), "AI 이펙트 스프라이트를 가산 합성으로 얹는다")
    ok("monsterWindup" in read("src/render.js") and "delayedHits" in read("src/render.js"), "전조 이벤트·투사체 도착 지연 피해 표시")
    ok("'./assets/sprites/fx/fx_claw.png'" in read("sw.js") and "monsterWindup" in read("src/combat.js"), "SW 캐시 · 이벤트 연결 확인")

    section("[14] ⚔️ 다굴 전투 · 방어/회복 스탯 · 신규 몬스터 (v3.8.0)")

    # ── 1) 다굴: 여러 마리가 동시에 붙어 때린다 ──
    crowd = js(ctx, """
      const s = defaultState(0);
      s.stage = 26; s.maxStage = 26; s.level = 44; s.jobTier = 3;
      for (const k of Object.keys(s.equip)) s.equip[k] = 40;
      const rng = (function (seed) { let x = seed >>> 0; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; })(5);
      const b = new Battle(s, () => ({}), rng, 0);
      const evs = [];
      let t = 0;
      let maxAlive = 0;
      for (let i = 0; i < Math.round(40000 / 16); i++) {
        b.tick(16, t); t += 16;
        for (const ev of b.drainEvents()) evs.push(Object.assign({}, ev, { at: t }));
        const alive = b.monsters.filter((m) => !m.dead && !m.dying);
        if (alive.length > maxAlive) maxAlive = alive.length;
      }
      const attacks = evs.filter((e) => e.t === 'monsterAttack');
      // 같은 1.6초 창 안에 서로 다른 몬스터가 때린 최대 수
      let best = 0;
      for (const a of attacks) {
        const set = new Set(attacks.filter((x) => x.at >= a.at && x.at < a.at + 1600).map((x) => x.id));
        if (set.size > best) best = set.size;
      }
      const hurt = evs.filter((e) => e.t === 'playerHurt');
      return {
        maxAlive, maxTogether: best, attacks: attacks.length, hurts: hurt.length,
        kinds: [...new Set(attacks.map((a) => a.kind))].sort(),
        reduce: Math.round((b.stats.dmgReduce || 0) * 100),
        slots: [...new Set(b.monsters.map((m) => Math.round(m.slotX)))].sort((a, b2) => a - b2),
        lanes: [...new Set(b.monsters.map((m) => m.lane))].sort(),
      };
    """)
    ok(crowd["maxAlive"] >= 5, "무리가 화면에 5마리 이상 쌓인다(다굴)", json.dumps({"max": crowd["maxAlive"]}))
    ok(crowd["maxTogether"] >= 3, "서로 다른 몬스터 여러 마리가 같은 순간에 동시 공격", json.dumps({"동시": crowd["maxTogether"], "공격": crowd["attacks"]}))
    ok(crowd["hurts"] == crowd["attacks"], "동시 공격도 1회당 피해 1회로 정확히 들어간다", json.dumps({"a": crowd["attacks"], "h": crowd["hurts"]}))
    ok("melee" in crowd["kinds"] and "ranged" in crowd["kinds"], "근접 다굴 + 원거리 투사체가 함께 온다", json.dumps(crowd["kinds"]))
    ok(len(crowd["slots"]) >= 3 and len(crowd["lanes"]) >= 2, "몬스터가 앞뒤 레인·서로 다른 슬롯에 부채꼴로 배치", json.dumps({"slots": crowd["slots"], "lanes": crowd["lanes"]}))

    # ── 2) 방어(피해 감소)·회복 스탯과 damagePlayer 반영 ──
    defense = js(ctx, """
      const base = defaultState(0); base.level = 40; base.jobTier = 2;
      const plain = calcStats(base, {});
      const armored = defaultState(0); armored.level = 40; armored.jobTier = 2;
      armored.equip = { weapon: 0, armor: 60, helmet: 60, ring: 0, amulet: 0 };
      const stArm = calcStats(armored, {});
      const maxed = defaultState(0); maxed.level = 40;
      maxed.equip = { weapon: 0, armor: 100, helmet: 100, ring: 0, amulet: 0 };
      maxed.gearRarity = { weapon: 'common', armor: 'legend', helmet: 'legend', ring: 'common', amulet: 'common' };
      maxed.rebirth = { count: 3, points: 0, totalPoints: 99, traits: { guard: 20 }, bestStage: 30, at: 0 };
      const stMax = calcStats(maxed, {});
      const regen = defaultState(0); regen.rebirth = { count: 1, points: 0, totalPoints: 9, traits: { regen: 10 }, bestStage: 21, at: 0 };
      const stRegen = calcStats(regen, {});

      // 같은 피해를 방어 0 / 방어 26% / 방어 상한으로 받았을 때
      function take(st) {
        const s = defaultState(0); s.level = 40;
        const b = new Battle(s, () => ({}), () => 0.5, 0);
        b.stats = st;
        b.player.hp = st.hpMax;
        const before = b.player.hp;
        b.damagePlayer(1000, { ko: '테스트' }, 1000, {});
        return Math.round(before - b.player.hp);
      }
      return {
        plainReduce: Math.round(plain.dmgReduce * 100), plainRegen: plain.hpRegen,
        armReduce: Math.round(stArm.dmgReduce * 100), maxReduce: Math.round(stMax.dmgReduce * 100),
        regenUp: Math.round(stRegen.hpRegen * 1000) / 1000,
        dmg0: take(plain), dmg26: take(stArm), dmgCap: take(stMax),
        hpArm: stArm.hpMax > plain.hpMax,
        regenField: 'hpRegen' in plain && 'dmgReduce' in plain,
      };
    """)
    ok(defense["plainReduce"] == 0 and defense["regenField"] is True, "방어·회복 스탯이 calcStats에 있다(기본 방어 0)", json.dumps({k: defense[k] for k in ["plainReduce", "regenField"]}))
    ok(defense["armReduce"] >= 25 and defense["hpArm"] is True, "갑옷·투구 강화 → 피해 감소 + 체력 상승", json.dumps({"r": defense["armReduce"]}))
    ok(defense["maxReduce"] == 80, "피해 감소 상한 80% (장비+환생 특성 합산)", json.dumps({"r": defense["maxReduce"]}))
    ok(defense["dmg0"] == 1000 and defense["dmg26"] < defense["dmg0"] and defense["dmgCap"] == 200, "damagePlayer가 방어율대로 경감한다(1000 → 200)", json.dumps({"0": defense["dmg0"], "26": defense["dmg26"], "cap": defense["dmgCap"]}))
    ok(abs(defense["regenUp"] - 0.024) < 0.001, "환생 '생명' 특성으로 초당 회복이 늘어난다(1.2% → 2.4%)", json.dumps({"regen": defense["regenUp"]}))

    # ── 3) 사망 → 무리 흩어짐 · 부활 가호 ──
    death = js(ctx, """
      const s = defaultState(0);
      s.stage = 27; s.maxStage = 27; s.level = 55; s.jobTier = 3;
      for (const k of Object.keys(s.equip)) s.equip[k] = 20;
      const rng = (function (seed) { let x = seed >>> 0; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; })(9);
      const b = new Battle(s, () => ({}), rng, 0);
      const evs = [];
      let t = 0;
      let beforeDeath = -1, afterDeath = -1, revived = false, grace = 0, lastCrowd = 0;
      for (let i = 0; i < Math.round(90000 / 16); i++) {
        const crowdNow = b.monsters.filter((m) => !m.dead && !m.dying).length;
        if (crowdNow > lastCrowd) lastCrowd = crowdNow;
        b.tick(16, t); t += 16;
        for (const ev of b.drainEvents()) {
          evs.push(ev);
          if (ev.t === 'playerDeath') beforeDeath = b.monsters.filter((m) => !m.dead && !m.dying).length;
          if (ev.t === 'revive') { revived = true; grace = Math.max(0, (b.player.graceUntil || 0) - t); afterDeath = b.monsters.filter((m) => !m.dead && !m.dying).length; }
        }
      }
      const deaths = evs.filter((e) => e.t === 'playerDeath').length;
      return { deaths, beforeDeath, afterDeath, revived, grace: Math.round(grace), lastCrowd, scatterImpl: typeof b.scatterMonsters === 'function' };
    """)
    ok(death["deaths"] > 0, "S27·방어 미비 상태에서 실제로 사망한다(다굴 압박)", json.dumps({"deaths": death["deaths"]}))
    ok(death["scatterImpl"] is True and death["lastCrowd"] >= 3 and death["beforeDeath"] == 0 and death["afterDeath"] <= 2, "쓰러지면 무리가 흩어지고 부활 시 소수부터 다시 몰린다", json.dumps({k: death[k] for k in ["lastCrowd", "beforeDeath", "afterDeath"]}))
    ok(death["revived"] is True and death["grace"] > 2000, "부활 직후 가호(3.5초)가 걸린다", json.dumps({"grace": death["grace"]}))

    # ── 4) 신규 몬스터·보스 16종: 이미지·모션·공격·도감·스테이지·프리캐시 ──
    NEW_MONSTERS = ["Scorpion", "Mummy", "Sandworm", "Batling", "CaveSpider",
                    "FireImp", "MagmaGolem", "IceWolf", "FrostWisp", "ShadowWraith", "AbyssEye"]
    NEW_BOSSES = ["Anubis", "CaveTroll", "Ifrit", "IceGiant", "AbyssLord"]
    newmeta = js(ctx, """
      const names = %s;
      const bosses = %s;
      return {
        inCatalog: names.every((n) => MONSTERS[n] && MONSTERS[n].boss === false),
        bossesIn: bosses.every((n) => MONSTERS[n] && MONSTERS[n].boss === true),
        motion: names.concat(bosses).filter((n) => !MONSTER_MOTION[n]),
        atk: names.concat(bosses).filter((n) => !MONSTER_ATTACKS[n]),
        proj: names.concat(bosses).filter((n) => MONSTER_ATTACKS[n] && MONSTER_ATTACKS[n].kind === 'ranged' && !MONSTER_ATTACKS[n].proj),
        paths: names.concat(bosses).map((n) => spriteSrc(n)),
        total: Object.keys(MONSTERS).length,
        bossesTotal: Object.keys(MONSTERS).filter((n) => MONSTERS[n].boss).length,
      };
    """ % (json.dumps(NEW_MONSTERS), json.dumps(NEW_BOSSES)))
    ok(newmeta["inCatalog"] and newmeta["bossesIn"], "신규 일반 11종 + 보스 5종이 도감(MONSTERS)에 등록")
    ok(newmeta["total"] == 50 and newmeta["bossesTotal"] == 17, "몬스터 총 50종(일반 33 · 보스 17)", json.dumps({"t": newmeta["total"], "b": newmeta["bossesTotal"]}))
    ok(not newmeta["motion"] and not newmeta["atk"] and not newmeta["proj"], "신규 16종 모두 이동 모션·공격(투사체) 정의", json.dumps(newmeta["motion"] + newmeta["atk"] + newmeta["proj"]))
    ok(all(p.startswith("assets/sprites/monster/") for p in newmeta["paths"][:len(NEW_MONSTERS)]) and all(p.startswith("assets/sprites/boss/") for p in newmeta["paths"][len(NEW_MONSTERS):]), "스프라이트 경로가 일반/보스 폴더로 갈린다", json.dumps(newmeta["paths"][:2]))

    sprite_files = [(p, 256) for p in newmeta["paths"][:len(NEW_MONSTERS)]] + [(p, 384) for p in newmeta["paths"][len(NEW_MONSTERS):]]
    missing = [p for p, _ in sprite_files if not os.path.exists(os.path.join(ROOT, p))]
    ok(not missing, "신규 스프라이트 16개 파일 존재", ", ".join(missing))
    try:
        from PIL import Image
        bad_size, bad_mode, heavy = [], [], []
        for p, size in sprite_files:
            fp = os.path.join(ROOT, p)
            im = Image.open(fp)
            if im.size != (size, size):
                bad_size.append((p, im.size))
            if im.mode != "RGBA":
                bad_mode.append(p)
            if os.path.getsize(fp) > 260000:
                heavy.append((p, os.path.getsize(fp)))
            # 투명 배경 확인(모서리 알파 0)
            if im.convert("RGBA").getpixel((0, 0))[3] != 0:
                bad_mode.append(p + ":corner")
        ok(not bad_size, "신규 스프라이트 규격(일반 256px · 보스 384px)", json.dumps(bad_size))
        ok(not bad_mode, "신규 스프라이트 RGBA 투명 배경", json.dumps(bad_mode))
        ok(not heavy, "신규 스프라이트 용량 260KB 이하", json.dumps(heavy))
    except Exception as e:  # noqa: BLE001
        ok(False, "신규 스프라이트 이미지 검사", str(e))
    ok(all(f"'./{p}'" in read("sw.js") for p, _ in sprite_files), "sw.js 프리캐시에 신규 스프라이트 16개 포함")

    stages = js(ctx, """
      const defs = [];
      for (let s = 1; s <= 40; s++) defs.push(stageDef(s));
      const badNormals = defs.filter((d) => !d.normals.every((n) => MONSTERS[n])).length;
      const badBoss = defs.filter((d) => !MONSTERS[d.boss] || !MONSTERS[d.boss].boss).length;
      // 테마 정렬: STAGES 길이가 THEMES 길이의 배수여야 스테이지를 돌아도 배경과 몹이 어긋나지 않는다
      const themeOf = {};
      for (let s = 1; s <= 48; s++) {
        const d = stageDef(s);
        const key = d.normals.join(',');
        themeOf[key] = themeOf[key] || d.theme.id;
        d.__ok = true;
      }
      const seenBoss = new Set();
      for (let s = 1; s <= STAGES.length; s++) seenBoss.add(stageDef(s).boss);
      const themePairs = new Set();
      for (let s = 1; s <= 48; s++) { const d = stageDef(s); themePairs.add(d.normals.join(',') + '|' + d.theme.id); }
      return {
        badNormals, badBoss,
        stages: STAGES.length, themes: THEMES.length,
        aligned: STAGES.length % THEMES.length === 0,
        themePairs: [...themePairs].length,
        stagesPerTheme: STAGES.length / THEMES.length,
        bossesUsed: seenBoss.size,
        uniqueNormals: new Set(STAGES.flatMap((d) => d.normals)).size,
        thematic: Object.keys(themeOf).length,
      };
    """)
    ok(stages["badNormals"] == 0 and stages["badBoss"] == 0, "모든 스테이지의 몬스터·보스가 도감에 존재", json.dumps(stages))
    ok(stages["aligned"] is True and stages["stagesPerTheme"] == 3, "8개 테마 × 3스테이지 = 24스테이지(테마 정렬)", json.dumps({"s": stages["stages"], "t": stages["themes"]}))
    ok(stages["bossesUsed"] == 17, "17종 보스가 모두 스테이지에 등장", json.dumps({"bosses": stages["bossesUsed"]}))
    ok(stages["uniqueNormals"] == 32, "32종 일반 필드 몬스터가 모두 스테이지에 등장(보물 고블린은 이벤트 스폰)", json.dumps({"normals": stages["uniqueNormals"]}))

    codex_new = js(ctx, """
      const s = defaultState(0);
      const before = codexStats(s).monsters.seen;
      for (const n of %s) codexMeet(s, n);
      const st = codexStats(s);
      return { before, monsters: st.monsters, pct: st.pct };
    """ % json.dumps(NEW_MONSTERS + NEW_BOSSES))
    ok(codex_new["before"] == 0 and codex_new["monsters"]["seen"] == 16, "신규 16종을 만나면 도감에 기록된다", json.dumps(codex_new["monsters"]))

    src_combat = read("src/combat.js")
    src_render = read("src/render.js")
    src_state = read("src/state.js")
    src_data = read("src/data.js")
    ok(all(x in src_combat for x in ["MELEE_SLOTS", "RANGED_SLOTS", "assignSlots", "scatterMonsters", "graceUntil", "maxMonsters"]), "전투 — 슬롯 배정·무리 흩어짐·부활 가호 구현")
    ok(all(x in src_state for x in ["dmgReduce", "hpRegen", "DEF.cap", "guardPct"]), "상태 — 방어(피해 감소)·회복 스탯 계산")
    ok(all(x in src_data for x in ["monsterAtkLateBoost", "monsterAtkLateFrom", "export const DEF", "bossHpMul: 4.2"]), "데이터 — 다굴용 공격 곡선·방어 상수")
    ok(all(x in src_render for x in ["crowdK", "lane", "showBar", "kind === 'ice'", "kind === 'sonic'", "graceUntil"]), "렌더러 — 무리 축소·레인 깊이·얼음/음파 투사체·부활 가호 연출")
    ok("피해 감소" in read("src/ui.js") and "자연 회복" in read("src/ui.js"), "스탯 화면에 피해 감소·자연 회복 표시")

    section("[15] 💪 사냥/스킬 서브 탭 · 한 화면 밀도 (v3.9.0)")
    subs = js(ctx2, """
      const s = defaultState(0);
      s.gold = 20000; s.shards = 120; s.level = 12; s.stage = 7; s.maxStage = 8; s.totalKills = 321;
      s.land.owned[CITIES[0].key] = 10; // 침공 카드가 출격 버튼을 그리도록 매물 1곳 보유
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(7), boss: null, dungeon: null, player: { hp: 100 } }, app: { buffs }, logs: [{ t: '00:01', text: '테스트 로그', kind: '' }], tab: 'hunt', el: {} };
      const out = {};
      for (const k of __HUNT_SUBS) out[k] = __huntSub(ui, k);
      out.fallback = __huntSub(ui, 'bogus');
      out.keys = __HUNT_SUBS;
      out.bad = Object.fromEntries(Object.entries(out).filter(([k, v]) => typeof v === 'string' && /undefined|NaN|\\[object Object\\]/.test(v)).map(([k]) => [k, true]));
      out.badgeAttrs = __HUNT_SUBS.map((k) => (out[k].match(new RegExp('data-badge="' + k + '"')) || []).length);
      return out;
    """)
    ok(subs["keys"] == ["battle", "challenge", "mission"], "사냥 탭 서브 탭 3종(전투/도전/미션) — v8.0.0 2층 내비", json.dumps(subs["keys"], ensure_ascii=False))
    ok(all(x in subs["battle"] for x in ["⚔️ 전투", "🏆 도전", "📋 미션", 'data-action="hunt-sub"']), "서브 탭 버튼 3개 렌더·전환 액션 연결")
    ok(all(x in subs["battle"] for x in ["전투 정보", "전투 스탯", "피해 감소", "자연 회복", "골드 획득", "강화석 드롭", "강격", "전투 기록", "CP", 'data-action="toggle-auto"']), "전투 탭 — 전투 정보 1장(스탯·DPS·CP) + 스킬 + 펫 1줄")
    ok("dps-hero" in subs["battle"] and "toggle-fold" in subs["battle"] and 'data-live="live-dps"' in subs["battle"], "전투 정보 1줄 요약 + 접어서 DPS/스탯 펼치기")
    ok(all(x in subs["challenge"] for x in ["영지 침공 방어전", "황금 던전", "도전의 탑", "일일 보스", "무한 균열", "기사단", 'data-action="invasion"', 'data-action="dungeon"', 'data-action="tower"', 'data-action="daily"', 'data-action="rift-start"', 'data-action="raid-attack"']), "도전 탭 — 침공·던전·탑·일일보스·균열·레이드 6종")
    ok(all(x in subs["mission"] for x in ["오늘의 할 일", "7일 출석 체크", "영지 성장 패스", "미션", "도감·업적", 'data-action="todo-claim-all"', 'data-action="goto-todo"', 'data-action="open-codex"', 'data-action="open-achievements"']), "미션 탭 — 할 일 허브 + 출석·패스·미션·도감(v8.1.0 수령 일원화)")
    ok("황금 던전" not in subs["battle"] and "전투 정보" not in subs["challenge"] and "todo-claim-all" not in subs["battle"] and "황금 던전" not in subs["mission"] and "todo-claim-all" not in subs["challenge"], "각 서브 탭이 자기 카드만 싣는다(중복·스크롤 방지)")
    ok('class="subtab active" type="button" role="tab" aria-selected="true" data-action="hunt-sub" data-value="battle"' in subs["fallback"], "잘못된 서브 값은 전투로 복구")
    ok(subs["bad"] == {}, "서브 탭 3종에 undefined/NaN 누출 없음", json.dumps(subs["bad"]))
    ok(subs["badgeAttrs"] == [1, 1, 1], "세 서브 탭 모두 알림 배지 자리 보유", json.dumps(subs["badgeAttrs"]))

    badges = js(ctx2, """
      const s = defaultState(0);
      s.level = 40; s.stage = 40; s.maxStage = 40; s.totalKills = 1000;
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(40), boss: null, dungeon: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {} };
      const now = __badges(ui);
      const fresh = defaultState(0);
      const ui2 = { s: fresh, battle: { stats: calcStats(fresh, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: {} }, logs: [], tab: 'hunt', el: {} };
      const zero = __badges(ui2);
      const html = __huntSub(ui, 'mission');
      return { now, zero, html };
    """)
    ok(badges["now"]["mission"] >= 1, "미션 보상 수령 가능 → 미션 탭 배지", json.dumps(badges["now"]))
    ok('class="nb on" data-badge="mission">' in badges["html"], "배지가 서브 탭 버튼에 실제로 표시됨")
    ok(badges["zero"]["mission"] == 0 and badges["zero"]["challenge"] == 0, "새 게임: 배지 없음(던전 무료 입장은 상시 점등 방지를 위해 제외)", json.dumps(badges["zero"]))

    uisrc39 = read("src/ui.js")
    ok(all(x in uisrc39 for x in ["this.huntSub = 'battle'", "setHuntSub", "syncHuntBadges", "data-badge", "tplHuntBattle", "tplHuntChallenge", "tplHuntMission", "toggleFold"]), "서브 탭 상태·배지·카드 접힘 구현(ui.js)")
    ok("this.huntSub = ok.includes(sub) ? sub : 'battle'" in uisrc39 and "save(" not in uisrc39.split("setHuntSub(sub) {")[1].split("setLandSub")[0], "서브 탭 전환은 저장 데이터를 건드리지 않는다(세션 유지)")
    ok("case 'hunt-sub': this.setHuntSub(v); break;" in uisrc39, "서브 탭 클릭 → setHuntSub 연결")
    ok("case 'toggle-fold': this.toggleFold(v); break;" in uisrc39 and "applyFolds()" in uisrc39, "카드 헤더 ▸ 클릭 → 접힘 토글")
    appsrc39 = read("app.js")
    ok("subParam" in appsrc39 and "['battle', 'challenge', 'mission'].includes(subParam)" in appsrc39, "?tab=hunt&sub=challenge URL 파라미터 지원")
    idxsrc = read("index.html")
    ok('id="huntTabDot"' in idxsrc, "하단 사냥 탭 알림 점 요소")
    css39 = read("style.css")
    ok(all(x in css39 for x in [".hunt-subbar", ".stat-grid.four", ".skill-grid", ".skill-cell", ".pet-line", ".cx-grid", ".subtab .nb.on", ".tab .tab-dot", ".switch.sm", ".bi-sum"]), "압축 레이아웃 CSS(서브 탭·4열 스탯·스킬·펫 스트립·배지·전투 요약)")

    section("[16] ⚔️ v4.0 장비 종류 · 고유 옵션 · 장착 인벤토리")

    # ── 1) 카탈로그: 5부위 × 5등급 × 여러 종류 ──
    cat = js(ctx, """
      const slots = ['weapon', 'armor', 'helmet', 'ring', 'amulet'];
      const perSlot = {};
      for (const sl of slots) {
        const list = GEAR_BY_SLOT[sl];
        perSlot[sl] = {
          n: list.length,
          rarities: RARITY_IDS.filter(r => list.some(it => it.rarity === r)),
          names: list.map(it => it.name),
          icons: list.map(it => gearIcon(it, 32)),
          optKeys: list.map(it => Object.keys(it.opts || {})),
          descs: list.map(it => !!it.desc),
        };
      }
      const all = GEAR_ITEMS;
      return {
        total: all.length,
        ids: all.map(it => it.id),
        names: all.map(it => it.name),
        forms: all.map(it => it.form),
        icons: all.map(it => gearIcon(it, 32)),
        descs: all.every(it => typeof it.desc === 'string' && it.desc.length > 3),
        perSlot,
        rarities: RARITY_IDS,
        hasAllRarity: RARITY_IDS.every(r => all.some(it => it.rarity === r)),
        eachSlotAll: slots.every(sl => perSlot[sl].rarities.length === 5),
        eachSlotOpts: slots.every(sl => perSlot[sl].optKeys.every(k => k.length > 0)),
        legendOpts: (GEAR_BY_RARITY['legend'] || []).map(it => it.opts),
        optKeys: GEAR_OPT_KEYS.slice(),
        optMeta: Object.keys(GEAR_OPTS).every(k => !!GEAR_OPTS[k].name && !!GEAR_OPTS[k].icon),
      };
    """)
    ok(cat["total"] >= 55, "장비 카탈로그 55종 이상(부위별 11종)", f"{cat['total']}종")
    ok(all(cat["perSlot"][sl]["n"] >= 11 for sl in cat["perSlot"]), "부위별 11종 이상", json.dumps({k: v["n"] for k, v in cat["perSlot"].items()}))
    ok(len(set(cat["ids"])) == cat["total"], "아이템 id 중복 없음", str(len(set(cat["ids"]))))
    ok(len(set(cat["names"])) == cat["total"], "아이템 이름 모두 다름", str(len(set(cat["names"]))))
    ok(len(set(cat["icons"])) == cat["total"], "아이템마다 다른 모양(SVG) — 35종 모두 구분됨", str(len(set(cat["icons"]))))
    ok(all(x in cat["icons"][0] for x in ["<svg", "viewBox=\"0 0 32 32\""]), "아이콘이 인라인 SVG 로 그려짐", cat["icons"][0][:60])
    ok(cat["eachSlotAll"] is True, "모든 부위에 5등급(일반~전설)이 모두 존재", json.dumps({k: v["rarities"] for k, v in cat["perSlot"].items()}, ensure_ascii=False))
    ok(cat["descs"] is True and cat["eachSlotOpts"] is True, "모든 장비에 설명·고유 옵션 존재")
    ok(len(cat["optKeys"]) >= 9 and cat["optMeta"] is True, "고유 옵션 9종 이상(흡혈·공속·보스추뎀·치명·방어·회복·골드·드랍·범위)",
       json.dumps(cat["optKeys"], ensure_ascii=False))
    ok(all(o.get("lifesteal") or o.get("bossDmg") or o.get("whirlDmg") or o.get("atkSpd") or o.get("critPct") or o.get("critDmg") for o in cat["legendOpts"]), "전설 장비는 전투 체감 옵션 보유", json.dumps(cat["legendOpts"], ensure_ascii=False))

    # ── 2) 고유 옵션이 실제 스탯·전투에 반영 ──
    opt = js(ctx, """
      const mk = (ids) => { const s = defaultState(0); s.level = 30; for (const id of ids) acquireGear(s, id, { autoEquip: true }); return s; };
      const base = mk([]);
      const st0 = calcStats(base, {});
      const dragon = mk(['w_dragon']);
      const stD = calcStats(dragon, {});
      const frost = mk(['w_frost']);
      const stF = calcStats(frost, {});
      const guard = mk(['a_abyss', 'h_abyss']);
      const stG = calcStats(guard, {});
      const amulet = mk(['m_grail']);
      const stA = calcStats(amulet, {});
      const mods = gearMods(mk(['w_dragon', 'a_abyss', 'h_crown', 'r_eye', 'm_grail']));
      return {
        base: { atk: st0.atk, amp: st0.attackMs, crit: st0.crit, cd: st0.critDmg, red: st0.dmgReduce, regen: st0.hpRegen, gold: st0.goldMult, drop: st0.dropMult, ls: st0.lifesteal, boss: st0.bossDmgPct, whirl: st0.whirlDmgPct },
        dragon: { atk: stD.atk, ls: stD.lifesteal, boss: stD.bossDmgPct, whirl: stD.whirlDmgPct },
        frost: { amp: stF.attackMs, crit: stF.crit },
        guard: { red: stG.dmgReduce, regen: stG.hpRegen, ls: stG.lifesteal },
        amulet: { gold: stA.goldMult, drop: stA.dropMult, whirl: stA.whirlDmgPct },
        mods,
        sumKeys: GEAR_OPT_KEYS.filter(k => mods[k] > 0),
      };
    """)
    ok(opt["dragon"]["atk"] > opt["base"]["atk"] and abs(opt["dragon"]["ls"] - 0.06) < 1e-6, "공격력·흡혈 옵션이 calcStats 에 반영", json.dumps(opt["dragon"]))
    ok(abs(opt["dragon"]["boss"] - 0.22) < 1e-6 and abs(opt["dragon"]["whirl"] - 0.12) < 1e-6, "보스 추가 피해·범위 베기 옵션 반영", json.dumps(opt["dragon"]))
    ok(opt["frost"]["amp"] < opt["base"]["amp"] and opt["frost"]["crit"] > opt["base"]["crit"], "공격 속도 옵션 → 공격 간격 단축", json.dumps({"b": opt["base"]["amp"], "f": opt["frost"]["amp"]}))
    ok(opt["guard"]["red"] > opt["base"]["red"] and opt["guard"]["regen"] > opt["base"]["regen"], "피해 감소·자연 회복 옵션 반영", json.dumps(opt["guard"]))
    ok(opt["amulet"]["gold"] > opt["base"]["gold"] and opt["amulet"]["drop"] > opt["base"]["drop"], "골드 획득·강화석 드랍 옵션 반영", json.dumps(opt["amulet"]))
    ok(len(opt["sumKeys"]) >= 9 and opt["mods"]["critDmg"] > 0, "슬롯 5부위 옵션이 합산됨", json.dumps(opt["mods"], ensure_ascii=False))

    battleopt = js(ctx, """
      const mk = (ids) => { const s = defaultState(0); s.level = 30; for (const id of ids) acquireGear(s, id); return s; };
      const plain = mk([]);
      const geared = mk(['w_dragon']);
      const rngF = () => 0.5;
      function dmgOf(s, kind, isBoss) {
        const b = new Battle(s, () => ({}), rngF, 0);
        b.stats = calcStats(s, {});
        b.player.hp = 500; b.stats.hpMax = 2000;
        const m = { id: 1, ko: 'T', isBoss: !!isBoss, hp: 1e9, maxHp: 1e9, x: 400, dead: false, dying: 0, knock: 0 };
        b.monsters = [m];
        b.hit([m], 1, kind, 1000);
        const ev = b.drainEvents().filter(e => e.t === 'hit')[0];
        return { dmg: ev ? ev.dmg : 0, hp: b.player.hp };
      }
      const n0 = dmgOf(plain, 'normal', false).dmg;
      const n1 = dmgOf(geared, 'normal', false).dmg;
      const b1 = dmgOf(geared, 'normal', true).dmg;
      const plainBoss = dmgOf(plain, 'normal', true).dmg;
      // 흡혈: 피해를 입히면 HP 가 회복된다
      const b = new Battle(geared, () => ({}), rngF, 0);
      b.stats = calcStats(geared, {});
      b.stats.hpMax = 4000;
      b.player.hp = 100;
      const m = { id: 2, ko: 'T', isBoss: false, hp: 1e9, maxHp: 1e9, x: 400, dead: false, dying: 0, knock: 0 };
      b.monsters = [m];
      b.hit([m], 1, 'normal', 1000);
      const healed = b.player.hps || b.player.hp;
      const healEv = b.drainEvents().filter(e => e.t === 'lifesteal').length;
      // 범위 베기: m_grail 의 whirlDmg 20%
      const wh = mk(['m_grail']);
      const wNormal = dmgOf(wh, 'normal', false).dmg;
      const wWhirl = dmgOf(wh, 'whirl', false).dmg;
      return { n0, n1, b1, plainBoss, healed, healEv, wNormal, wWhirl, atk: b.stats.atk };
    """)
    ok(battleopt["n1"] > battleopt["n0"], "장비 공격력 옵션이 실제 피해량을 올린다", f"{battleopt['n0']} → {battleopt['n1']}")
    ok(battleopt["b1"] > battleopt["n1"] and abs((battleopt["b1"] / max(1, battleopt["n1"])) - 1.22) < 0.03, "보스 추가 피해 옵션이 보스에게만 +22%", f"일반 {battleopt['n1']} vs 보스 {battleopt['b1']}")
    ok(battleopt["healed"] > 100 and battleopt["healEv"] >= 1, "흡혈 옵션이 전투에서 HP 를 회복시킨다", f"100 → {battleopt['healed']}")
    ok(battleopt["wWhirl"] > battleopt["wNormal"] and abs((battleopt["wWhirl"] / max(1, battleopt["wNormal"])) - 1.2) < 0.03, "범위 베기 피해 옵션이 광역기에 반영", f"{battleopt['wNormal']} → {battleopt['wWhirl']}")

    # ── 3) 인벤토리 · 장착 · 분해 · 강화 레벨 공유 ──
    inv = js(ctx, """
      const s = defaultState(0); s.shards = 500; s.level = 20;
      const before = equippedRarity(s, 'weapon');
      const a1 = acquireGear(s, 'w_iron');            // 빈 슬롯 → 자동 장착
      const a2 = acquireGear(s, 'w_flame');           // 더 높은 등급 → 자동 교체
      const ownedAfter = gearOwned(s).length;
      const keepsOld = gearOwned(s).some(r => r.def.id === 'w_iron' && !r.equipped);
      const a3 = acquireGear(s, 'w_flame');           // 중복 → 분해
      const lv0 = s.equip.weapon;
      tryEnhance(s, 'weapon', 3);
      const lv1 = s.equip.weapon;
      const eq2 = equipGear(s, gearOwned(s).find(r => r.def.id === 'w_iron').uid); // 갈아끼워도
      const lv2 = s.equip.weapon;                     // 강화 레벨은 부위에 남는다
      const grAfterSwap = s.gearRarity.weapon;
      const cur = equippedItem(s, 'weapon');
      const dm = dismantleGear(s, gearOwned(s).find(r => r.def.id === 'w_iron').uid);
      const slotEmpty = s.gear.equipped.weapon === null && equippedRarity(s, 'weapon') === 'common';
      const dupShards = a3.shards;
      return {
        before, a1eq: a1.equipped, a2eq: a2.equipped, ownedAfter, keepsOld, dup: !!a3.duplicate, dupShards,
        lv0, lv1, lv2, eq2ok: eq2.ok, grAfterSwap, curName: cur && cur.name, dmShards: dm.shards, slotEmpty,
        gr: s.gearRarity, shards: s.shards,
      };
    """)
    ok(inv["before"] == "common" and inv["a1eq"] is True, "빈 슬롯은 첫 장비를 자동 장착", json.dumps(inv, ensure_ascii=False))
    ok(inv["a2eq"] is True and inv["keepsOld"] is True and inv["ownedAfter"] == 2, "더 높은 등급은 자동 교체 · 이전 장비는 인벤토리 보관", json.dumps({k: inv[k] for k in ["a2eq", "keepsOld", "ownedAfter"]}))
    ok(inv["dup"] is True and inv["dupShards"] == 14, "같은 아이템 중복 → 강화석 자동 분해(레어 14)", json.dumps({"dup": inv["dup"], "shards": inv["dupShards"]}))
    ok(inv["lv1"] == inv["lv0"] + 3 and inv["lv2"] == inv["lv1"], "강화 레벨은 부위에 남아 장비를 갈아껴도 유지", json.dumps({k: inv[k] for k in ["lv0", "lv1", "lv2"]}))
    ok(inv["eq2ok"] is True and inv["grAfterSwap"] == "common" and inv["curName"] == "철검", "직접 장착하면 등급 미러(gearRarity)도 함께 바뀐다", json.dumps({"gr": inv["grAfterSwap"], "name": inv["curName"]}, ensure_ascii=False))
    ok(inv["dmShards"] == 2 and inv["slotEmpty"] is True, "분해하면 슬롯이 비고(일반) 강화석이 들어온다", json.dumps({"s": inv["dmShards"], "empty": inv["slotEmpty"]}))

    cmp = js(ctx, """
      const s = defaultState(0); s.level = 30;
      acquireGear(s, 'w_axe'); acquireGear(s, 'w_iron');
      const axeUid = gearOwned(s).find(r => r.def.id === 'w_axe').uid;
      const sword = gearOwned(s).find(r => r.def.id === 'w_iron');
      const c = compareGear(s, sword.uid, {});
      const restored = s.gearRarity.weapon === 'advanced' && s.gear.equipped.weapon === axeUid;
      const same = compareGear(s, axeUid, {});
      return {
        before: c.before.atk, after: c.after.atk, atk: c.delta.atk, critD: c.delta.crit,
        bossD: c.delta.bossDmgPct, whirl: c.delta.whirlDmgPct, restored,
        sameAtk: same.delta.atk, item: c.item.name,
      };
    """)
    ok(cmp["atk"] < 0 and cmp["after"] < cmp["before"], "비교: 낮은 등급으로 바꾸면 등급 보정까지 계산해 공격력 감소", json.dumps({k: cmp[k] for k in ["before", "after", "atk"]}))
    ok(cmp["bossD"] < 0 and cmp["whirl"] < 0, "비교: 잃는 옵션(보스 추뎀·범위 베기)이 음수로 표시", json.dumps({k: cmp[k] for k in ["bossD", "whirl"]}))
    ok(cmp["restored"] is True and cmp["sameAtk"] == 0, "비교는 상태를 바꾸지 않는다(장착·등급 원상 복구)", json.dumps({"restored": cmp["restored"], "same": cmp["sameAtk"]}))

    bulk = js(ctx, """
      const s = defaultState(0); s.level = 20;
      acquireGear(s, 'w_iron'); acquireGear(s, 'a_leather'); acquireGear(s, 'h_cloth');
      acquireGear(s, 'w_dragon'); acquireGear(s, 'a_scale'); acquireGear(s, 'r_copper'); acquireGear(s, 'm_wood');
      const before = gearOwned(s);
      const tCommon = dismantleTargets(s, 'common');
      const tLow = dismantleTargets(s, 'low');
      const expShards = tCommon.reduce((a, r) => a + dismantleValue(r.def), 0);
      const eqBefore = before.filter(r => r.equipped).length;
      const r = bulkDismantle(s, 'common');
      const after = gearOwned(s);
      const eqAfter = after.filter(x => x.equipped).length;
      const removedEquipped = tCommon.filter(t => t.equipped).length;
      const anyEquippedLeft = after.every(x => !x.equipped || !tCommon.some(t => t.uid === x.uid));
      return {
        total: before.length, tCommon: tCommon.length, tLow: tLow.length, lowLe: tCommon.length,
        count: r.count, shards: r.shards, expShards,
        left: after.length, eqBefore, eqAfter, removedEquipped, anyEquippedLeft,
        names: tCommon.map(t => t.def.name), equippedNames: after.filter(x => x.equipped).map(x => x.def.name),
      };
    """)
    ok(bulk["tCommon"] >= 2 and bulk["count"] == bulk["tCommon"] and bulk["shards"] == bulk["expShards"],
       "일반 등급 일괄 분해 — 대상 수·강화석이 정확히 계산됨", json.dumps(bulk, ensure_ascii=False))
    ok(bulk["tLow"] <= bulk["tCommon"] and bulk["lowLe"] == bulk["tCommon"], "'낮은 등급' 대상은 일반 등급 일괄 대상의 부분집합", json.dumps({"low": bulk["tLow"], "common": bulk["tCommon"]}))
    ok(bulk["eqAfter"] == bulk["eqBefore"] and bulk["removedEquipped"] == 0 and bulk["left"] == bulk["total"] - bulk["count"],
       "일괄 분해가 장착 장비는 건드리지 않는다", json.dumps({"eq0": bulk["eqBefore"], "eq1": bulk["eqAfter"], "left": bulk["left"]}))

    # ── 4) 뽑기: 등급 안에서 종류가 다양하게 ──
    gvar = js(ctx, """
      const s = defaultState(0); s.gold = 500000;
      let seed = 987654321; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const slotSeen = {}; const raritySeen = {}; let pulls = 0, equipped = 0, dropped = 0;
      for (let i = 0; i < 30; i++) {
        const r = pullGear(s, 10, rng, i);
        pulls += 10;
        for (const it of r.results) {
          slotSeen[it.slot] = (slotSeen[it.slot] || 0) + 1;
          raritySeen[it.rarity] = (raritySeen[it.rarity] || 0) + 1;
          if (it.equipped) equipped++;
          if (it.itemId) dropped++;
        }
      }
      const kinds = new Set(Object.keys(s.gear.seen));
      return { pulls, kinds: kinds.size, slotSeen, raritySeen, equipped, items: s.gear.items.length, totalKinds: GEAR_ITEMS.length, gr: s.gearRarity, shards: s.shards, pity: s.gacha.pity };
    """)
    ok(gvar["pulls"] == 300 and gvar["kinds"] >= 25, "300회 뽑기로 25종 이상 수집(등급 안 종류 다양화)", f"{gvar['kinds']}/{gvar['totalKinds']}종")
    ok(all(gvar["slotSeen"].get(sl, 0) > 0 for sl in ["weapon", "armor", "helmet", "ring", "amulet"]), "5부위가 모두 나온다", json.dumps(gvar["slotSeen"], ensure_ascii=False))
    ok(all(gvar["raritySeen"].get(r, 0) > 0 for r in ["common", "advanced", "rare", "hero", "legend"]), "5등급이 모두 나온다", json.dumps(gvar["raritySeen"], ensure_ascii=False))
    ok(gvar["items"] <= gvar["totalKinds"] and gvar["equipped"] >= 5, "인벤토리는 종류 수를 넘지 않고 5부위가 채워진다", json.dumps({"items": gvar["items"], "eq": gvar["equipped"]}))

    # ── 5) 사냥·보스 드랍 ──
    drops = js(ctx, """
      const s = defaultState(0);
      const r = (v) => () => v;
      const normalHit = tryGearDrop(s, { isBoss: false, stage: 3, rng: r(0), now: 1 });
      const missNormal = tryGearDrop(s, { isBoss: false, stage: 3, rng: r(0.5), now: 2 });
      const bossHit = tryGearDrop(s, { isBoss: true, stage: 3, rng: r(0.1), now: 3 });
      const missBoss = tryGearDrop(s, { isBoss: true, stage: 3, rng: r(0.9), now: 4 });
      // 등급 분포: 스테이지가 높을수록 고등급이 잘 나온다
      function avgIdx(stage, isBoss) {
        let seed = 4242; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        let sum = 0; const N = 3000;
        for (let i = 0; i < N; i++) sum += rollDropRarityIdx(stage, isBoss, rng);
        return sum / N;
      }
      // 처치 드랍: 몬스터를 잡으면 gearDrop 이벤트가 나온다(운 좋은 rng)
      const s2 = defaultState(0); s2.level = 5;
      const b = new Battle(s2, () => ({}), r(0), 0);
      const m = { id: 9, ko: '슬라임', isBoss: false, hp: 1, maxHp: 1, x: 300, dead: false, dying: 0, knock: 0 };
      b.monsters = [m];
      b.hit([m], 50, 'normal', 1000);
      const evs = b.drainEvents().map(e => e.t);
      return {
        normalHit: normalHit && normalHit.item ? normalHit.item.id : null,
        missNormal: !!missNormal,
        bossHit: bossHit && bossHit.item ? bossHit.item.name : null,
        missBoss: !!missBoss,
        avgLow: avgIdx(1, false), avgMid: avgIdx(15, false), avgHigh: avgIdx(30, false), avgBoss: avgIdx(15, true),
        gearDropEvent: evs.indexOf('gearDrop') >= 0, evNames: evs,
        dropConst: GEAR_DROP,
        dropped: s2.gear.drops,
      };
    """)
    ok(drops["normalHit"] is not None and drops["missNormal"] is False, "일반 몬스터 드랍 판정(0.6%)", json.dumps({"hit": drops["normalHit"], "miss": drops["missNormal"]}))
    ok(drops["bossHit"] is not None and drops["missBoss"] is False, "보스 드랍 판정(15% 우대)", json.dumps({"hit": drops["bossHit"], "miss": drops["missBoss"]}))
    ok(drops["avgLow"] < drops["avgMid"] < drops["avgHigh"] and drops["avgBoss"] > drops["avgMid"], "스테이지·보스일수록 고등급이 잘 나온다",
       json.dumps({k: round(drops[k], 2) for k in ["avgLow", "avgMid", "avgHigh", "avgBoss"]}))
    ok(drops["gearDropEvent"] is True and drops["dropped"] >= 1, "처치 시 gearDrop 이벤트가 발생하고 인벤토리에 들어간다", json.dumps(drops["evNames"], ensure_ascii=False))

    # ── 6) v3 세이브 마이그레이션 ──
    mig = js(ctx, """
      const old = {
        ver: 3, level: 22, exp: 90, gold: 4321, shards: 55,
        equip: { weapon: 9, armor: 5, helmet: 4, ring: 3, amulet: 2 },
        gearRarity: { weapon: 'legend', armor: 'hero', helmet: 'common', ring: 'rare', amulet: 'advanced' },
        stage: 9, maxStage: 9, killsInStage: 3, skills: { strike: { lv: 2, last: 0 } },
        land: { owned: { '0_0_0': 2 }, accruedRent: 5 }, records: { totalGold: 777 },
      };
      // v3 와 완전히 같은 상태(장비 아이템 없이 등급만)의 스탯
      const v3like = normalizeState(JSON.parse(JSON.stringify(old)), 0);
      v3like.gear.items = []; v3like.gear.equipped = { weapon: null, armor: null, helmet: null, ring: null, amulet: null };
      const statV3 = calcStats(v3like, {});
      const n = normalizeState(old, 0);
      const statNow = calcStats(n, {});
      const again = normalizeState(JSON.parse(JSON.stringify(n)), 0);
      const items = n.gear.items.map(r => ({ id: r.id, uid: r.uid }));
      return {
        equip: n.equip, gr: n.gearRarity, level: n.level, gold: n.gold, shards: n.shards, owned: n.land.owned['0_0_0'],
        items, equipped: n.gear.equipped, count: items.length,
        statV3: { atk: statV3.atk, hp: statV3.hpMax, crit: statV3.crit, red: statV3.dmgReduce, gold: statV3.goldMult },
        statNow: { atk: statNow.atk, hp: statNow.hpMax, crit: statNow.crit, red: statNow.dmgReduce, gold: statNow.goldMult },
        idempotent: again.gear.items.length === items.length && json(again.gear.equipped) === json(n.gear.equipped),
        names: items.map(r => GEAR_BY_ID[r.id].name),
      };
      function json(o) { return JSON.stringify(o); }
    """)
    ok(mig["count"] == 4 and all(mig["equipped"][s] for s in ["weapon", "armor", "ring", "amulet"]) and mig["equipped"]["helmet"] is None,
       "v3 세이브: 등급이 있던 4부위가 그 등급 장비로 마이그레이션", json.dumps(mig["names"], ensure_ascii=False))
    ok(mig["equip"] == {"weapon": 9, "armor": 5, "helmet": 4, "ring": 3, "amulet": 2}, "기존 강화 레벨 그대로 유지", json.dumps(mig["equip"]))
    ok(mig["gr"] == {"weapon": "legend", "armor": "hero", "helmet": "common", "ring": "rare", "amulet": "advanced"}, "기존 등급 그대로 유지", json.dumps(mig["gr"]))
    ok(mig["level"] == 22 and mig["gold"] == 4321 and mig["shards"] == 55 and mig["owned"] == 2, "레벨·골드·강화석·부동산 진행도 유지", json.dumps({k: mig[k] for k in ["level", "gold", "shards", "owned"]}))
    ok(mig["statNow"]["atk"] >= mig["statV3"]["atk"] and mig["statNow"]["hp"] >= mig["statV3"]["hp"] and mig["statNow"]["red"] >= mig["statV3"]["red"],
       "마이그레이션 후 스탯이 줄지 않는다(장비 옵션은 보너스)", json.dumps({"v3": mig["statV3"], "now": mig["statNow"]}))
    ok(mig["idempotent"] is True, "정규화를 반복해도 장비가 중복 생성되지 않는다", str(mig["idempotent"]))

    badgear = js(ctx, """
      const s = normalizeState({
        gear: {
          items: [{ uid: 3, id: 'w_dragon' }, { uid: 3, id: 'w_flame' }, { uid: 'x', id: 'nope' }, null, { id: 'a_plate' }, { uid: 99, id: 'm_grail' }],
          equipped: { weapon: 3, armor: 99, helmet: 12345, ring: null, amulet: 'x' },
          nextUid: -5, filter: 'bogus', seen: { w_dragon: 2, nope: 5 }, drops: -3,
        },
      }, 0);
      const uids = s.gear.items.map(r => r.uid);
      return {
        uids, eq: s.gear.equipped, uniq: new Set(uids).size === uids.length, nextUid: s.gear.nextUid,
        filter: s.gear.filter, seen: s.gear.seen, drops: s.gear.drops, gr: s.gearRarity,
        armorSlot: s.gear.equipped.armor === null,
        weaponName: equippedItem(s, 'weapon') ? equippedItem(s, 'weapon').name : null,
      };
    """)
    ok(badgear["uniq"] is True and len(badgear["uids"]) == 4, "손상된 장비 목록 정리(중복 uid·미지 아이템 제거)", json.dumps(badgear["uids"]))
    ok(badgear["armorSlot"] is True and badgear["weaponName"] is not None, "다른 부위 아이템을 장착한 손상 값은 비우고, 맞는 부위만 유지", json.dumps(badgear["eq"], ensure_ascii=False))
    ok(badgear["filter"] == "all" and badgear["drops"] == 0 and badgear["seen"] == {"w_dragon": 2} and badgear["nextUid"] > max(badgear["uids"]), "필터·드랍 수·도감 기록 방어", json.dumps({"f": badgear["filter"], "s": badgear["seen"], "n": badgear["nextUid"]}, ensure_ascii=False))

    codegear = js(ctx, """
      const s = defaultState(0); s.level = 12; s.gold = 9000;
      acquireGear(s, 'w_frost'); acquireGear(s, 'a_guard'); acquireGear(s, 'r_eye');
      const code = encodeSave(s);
      const back = decodeSave(code, 0);
      const before = gearOwned(s).map(r => r.uid + ':' + r.def.id + ':' + (r.equipped ? 1 : 0)).sort().join(',');
      const after = back.ok ? gearOwned(back.state).map(r => r.uid + ':' + r.def.id + ':' + (r.equipped ? 1 : 0)).sort().join(',') : '';
      return { ok: back.ok, same: before === after, len: code.length, n: back.ok ? gearOwned(back.state).length : 0 };
    """)
    ok(codegear["ok"] is True and codegear["same"] is True and codegear["n"] == 3, "세이브 코드에 장비 인벤토리·장착이 담긴다", json.dumps(codegear))

    # ── 7) UI · 렌더 · 연결 ──
    ui_gear = js(ctx2, """
      const s = defaultState(0); s.level = 18; s.gold = 32000; s.shards = 210;
      acquireGear(s, 'w_dragon'); acquireGear(s, 'a_leather'); acquireGear(s, 'r_copper'); acquireGear(s, 'm_wood'); acquireGear(s, 'h_iron');
      acquireGear(s, 'w_iron'); acquireGear(s, 'w_steel'); acquireGear(s, 'a_chain');
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(3), boss: null, dungeon: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'gear', el: {} };
      const html = __tpls.gear(ui);
      s.gear.filter = 'weapon';
      const filtered = __tpls.gear(ui);
      const empty = defaultState(0);
      const ui2 = { s: empty, battle: { stats: calcStats(empty, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: {} }, logs: [], tab: 'gear', el: {} };
      const emptyHtml = __tpls.gear(ui2);
      return {
        html, filtered, emptyHtml,
        bad: /undefined|NaN|\\[object Object\\]/.test(html + filtered + emptyHtml),
        slots: (html.match(/class=\"gslot/g) || []).length,
        inv: (html.match(/class=\"inv-card/g) || []).length,
        filters: (html.match(/data-action=\"gear-filter\"/g) || []).length,
        itemBtns: (html.match(/data-action=\"gear-item\"/g) || []).length,
        eqBadge: (html.match(/iv-eq/g) || []).length,
        svgs: (html.match(/<svg/g) || []).length,
        emptyInv: emptyHtml.indexOf('아직 보유한 장비가 없습니다') >= 0,
        filteredNames: (filtered.match(/inv-card/g) || []).length,
      };
    """)
    ok(ui_gear["bad"] is False, "장비 탭에 undefined/NaN 누출 없음")
    ok(ui_gear["slots"] == 5, "장착 5부위 슬롯 카드 렌더", str(ui_gear["slots"]))
    ok(ui_gear["inv"] == 8 and ui_gear["eqBadge"] == 5, "보유 장비 그리드 + 장착중 표시", json.dumps({"inv": ui_gear["inv"], "eq": ui_gear["eqBadge"]}))
    ok(ui_gear["filters"] == 6, "부위별 필터 6종(전체+5부위)", str(ui_gear["filters"]))
    ok(ui_gear["filteredNames"] == 3, "필터를 고르면 그 부위만 보인다(무기 3종)", str(ui_gear["filteredNames"]))
    ok(ui_gear["svgs"] >= 13 and ui_gear["itemBtns"] >= 8, "장비마다 SVG 아이콘 + 클릭(비교) 버튼", json.dumps({"svg": ui_gear["svgs"], "btn": ui_gear["itemBtns"]}))
    ok(ui_gear["emptyInv"] is True, "장비가 없을 때 안내 문구", str(ui_gear["emptyInv"]))
    ok(all(x in ui_gear["html"] for x in ["장착 중", "보유 장비", "일반 등급 일괄 분해", "강화석 구매", "장비 강화"]), "장비 탭 구성(장착·인벤·일괄 분해·강화)", "")

    appsrc = read("app.js")
    ok(all(x in appsrc for x in ["openGearItem", "equipGearItem", "confirmDismantleGear", "confirmBulkDismantle", "compareGear"]), "장비 비교·장착·분해 액션 구현(app.js)")
    ok(all(x in read("src/ui.js") for x in ['case \'gear-item\'', 'case \'gear-equip\'', 'case \'gear-dismantle\'', 'case \'gear-bulk\'', 'case \'gear-filter\'', 'setGearFilter']), "장비 카드 클릭 → 비교/장착/분해 연결(ui.js)")
    ok(all(x in read("src/render.js") for x in ["equippedItem", "_rar.pal", "_rar.tint", "gearDrop", "lifesteal"]), "무기 종류별 검기 색·오라 + 드랍/흡혈 연출(render.js)")
    ok(all(x in read("src/combat.js") for x in ["bossDmgPct", "whirlDmgPct", "lifesteal", "tryGearDrop", "gearDrop"]), "전투에 흡혈·보스 추뎀·범위 베기·드랍 반영(combat.js)")
    ok(all(x in read("src/state.js") for x in ["gearMods", "normalizeGear", "syncGearRarity", "compareGear"]), "상태에 장비 옵션·마이그레이션·비교 반영(state.js)")
    css4 = read("style.css")
    ok(all(x in css4 for x in [".gear-slots", ".gslot", ".inv-grid", ".inv-card", ".cmp-vs", ".cmp-opts", ".cmp-stats", ".iv-eq", ".gsvg"]), "v4 장비 UI CSS(슬롯·그리드·비교 모달)")
    ok("장비 시스템" in read("README.md") and "4.7.0" in read("README.md"), "README 최신 버전 반영")

    # ══════════════════════════════════════════════════════════════════════
    section("[17] 🖼️ v4.1 테마 배경 · ♾️ 환생 중간 스테이지 점프")
    themes = js(ctx, "return THEMES.map(t => ({ id: t.id, name: t.name }))")
    ok(len(themes) == 8 and [t["id"] for t in themes] == ["meadow", "forest", "ruins", "desert", "cave", "volcano", "ice", "abyss"], "테마 8종 정의", json.dumps([t["id"] for t in themes]))

    # 1) 배경 에셋 — 파일 존재 · WebP 시그니처 · 크기(20~200KB) · sw 프리캐시
    bg_rows = []
    for t in themes:
        p = os.path.join(ROOT, "assets", "bg", t["id"] + ".webp")
        exists = os.path.exists(p)
        head = open(p, "rb").read(12) if exists else b""
        kb = round(os.path.getsize(p) / 1024, 1) if exists else 0
        bg_rows.append({"id": t["id"], "exists": exists, "webp": head[:4] == b"RIFF" and head[8:12] == b"WEBP", "kb": kb})
    ok(all(r["exists"] for r in bg_rows), "배경 8종 에셋 존재", json.dumps([r["id"] for r in bg_rows if not r["exists"]]))
    ok(all(r["webp"] for r in bg_rows), "배경 8종 WebP 형식", "")
    ok(all(20 <= r["kb"] <= 200 for r in bg_rows), "배경 용량 20~200KB(모바일 캐시 부담 최소)", json.dumps([r["kb"] for r in bg_rows]))
    oksize = 0
    for r in bg_rows:
        p = os.path.join(ROOT, "assets", "bg", r["id"] + ".webp")
        data = open(p, "rb").read(30)
        # VP8X / VP8 可変 헤더에서 가로 크기 추출(간단 파싱)
        w = 0
        if data[12:16] == b"VP8X":
            w = (data[24] | (data[25] << 8) | (data[26] << 16)) + 1
        elif data[12:16] == b"VP8 ":
            w = (((data[27] << 8) | data[26])) & 0x3FFF
        if w == 960:
            oksize += 1
    ok(oksize == 8, "배경 8종 가로 960px(모바일 리사이즈 기준)", str(oksize))
    swsrc = read("sw.js")
    ok(all(f"'./assets/bg/{t['id']}.webp'" in swsrc for t in themes), "sw.js 프리캐시에 배경 8종 포함", "")
    rjs = read("src/render.js")
    ok("bgSrc" in rjs and "buildThemeBg" in rjs and "drawThemeBg" in rjs and "preloadBackgrounds" in rjs, "렌더러 — 배경 로드·합성·페이드인 구현", "")
    ok("Math.max(W / iw, H / ih)" in rjs or "cover" in rjs, "렌더러 — 비율 유지 cover 크롭(찌그러짐 없음)", "")
    ok("paintBackground" in rjs and "그라데이션" in rjs, "배경 로딩 전 그라데이션 폴백 유지", "")
    ok('bgSrc(themeId)' in read("src/data.js") or "export function bgSrc" in read("src/data.js"), "data.js — 테마 배경 경로 헬퍼", "")

    # 2) 환생 점프 — 상한·선택지·실행
    jmp = js(ctx, """
      const mk = (maxStage, best) => { const s = defaultState(0); s.maxStage = maxStage; s.stage = maxStage; s.level = 40; s.gold = 900000; s.rebirth.bestStage = best; return s; };
      const a = mk(34, 1);
      const capA = rebirthJumpCap(a);
      const optsA = rebirthStartOptions(a).map(o => o.stage);
      const pick = {};
      for (const o of rebirthStartOptions(a)) pick[o.stage] = o.label;
      // 실행 — S15 점프
      const s = mk(34, 1);
      const r = doRebirth(s, 1000, { startStage: 15 });
      const b1 = new Battle(s, () => ({}), (function(seed){let x=seed;return function(){x=(x*1664525+1013904223)>>>0;return x/4294967296;};})(3), 0);
      // 상한 초과 요청·쓰레기 값
      const over = mk(34, 1); const rOver = doRebirth(over, 1000, { startStage: 999 });
      const junk = mk(34, 1); const rJunk = doRebirth(junk, 1000, { startStage: 'abc' });
      const zero = mk(34, 1); const rZero = doRebirth(zero, 1000, { startStage: 0 });
      // 기본 호출(인자 생략) = 기존 동작
      const plain = mk(25, 1); const rPlain = doRebirth(plain, 1000);
      // 직전 최고가 낮을 때(첫 환생 S20) — 상한 11
      const low = mk(20, 1); const capLow = rebirthJumpCap(low); const optsLow = rebirthStartOptions(low).map(o => o.stage);
      // 점프 시작 상태
      return {
        capA, optsA, pick,
        ok: r.ok, stage: s.stage, maxStage: s.maxStage, level: s.level, gold: s.gold, startGold: r.startGold,
        start: r.start, jumpLevel: r.jump.level, jumpGold: r.jump.gold, kills: s.killsInStage, bossReady: s.bossReady,
        exp: s.exp, equip0: s.equip.weapon, peak: s.peakStage, best: s.rebirth.bestStage, count: s.rebirth.count,
        theme: b1.def.theme.id, themeName: b1.def.themeName, monsters: b1.monsters.map(m => m.name), num: b1.def.num,
        overStart: rOver.start, junkStart: rJunk.start, zeroStart: rZero.start,
        plainStage: plain.stage, plainLevel: plain.level, plainGold: plain.gold, plainStart: rPlain.start,
        capLow, optsLow, prevBest: rebirthPrevBest(mk(34, 1)),
        bonus1: rebirthJumpBonus(1), bonus13: rebirthJumpBonus(13),
        cap20: rebirthJumpCap(mk(20, 1)), cap50: rebirthJumpCap(mk(50, 1)), cap100: rebirthJumpCap(mk(100, 1)),
      };
    """)
    ok(jmp["prevBest"] == 34 and jmp["capA"] == 18, "점프 상한 = 직전 최고 × 0.55 (S34 → S18)", json.dumps({"best": jmp["prevBest"], "cap": jmp["capA"]}))
    ok(jmp["optsA"] == [1, 5, 10, 15, 18], "선택지 = S1 + 5단위 + 상한", json.dumps(jmp["optsA"]))
    ok(jmp["optsLow"] == [1, 5, 10, 11] and jmp["capLow"] == 11, "S20 첫 환생 — S11까지만(S1 초과 상한 준수)", json.dumps(jmp["optsLow"]))
    ok(jmp["cap20"] == 11 and jmp["cap50"] == 27 and jmp["cap100"] == 55, "상한 비례(20→11 · 50→27 · 100→55)", json.dumps([jmp["cap20"], jmp["cap50"], jmp["cap100"]]))
    ok(max(jmp["optsA"]) < jmp["prevBest"] and all(1 <= s <= jmp["capA"] for s in jmp["optsA"]), "직전 최고까지 한 번에 가는 선택지는 없음", json.dumps({"max": max(jmp["optsA"]), "best": jmp["prevBest"]}))
    ok(jmp["ok"] is True and jmp["start"] == 15 and jmp["stage"] == 15 and jmp["maxStage"] == 15, "S15 점프 — 현재·최고 스테이지가 S15로 시작", json.dumps({k: jmp[k] for k in ["start", "stage", "maxStage"]}))
    ok(jmp["level"] == 22 and jmp["gold"] == 2180 and jmp["jumpLevel"] == 22 and jmp["jumpGold"] == 1680, "점프 보정 — Lv.22 · 💰2,180 (레벨 1.5/스테이지 · 골드 120/스테이지)", json.dumps({"lv": jmp["level"], "gold": jmp["gold"]}))
    ok(jmp["exp"] == 0 and jmp["kills"] == 0 and jmp["bossReady"] is False and jmp["equip0"] == 0, "점프 시작 웨이브·강화 상태 초기화(보스 게이지 꼬임 없음)", json.dumps({k: jmp[k] for k in ["exp", "kills", "bossReady", "equip0"]}))
    ok(jmp["num"] == 15 and jmp["theme"] == "ice" and "빙원" in jmp["themeName"] and "IceWolf" in jmp["monsters"], "S15 테마·몬스터가 바로 등장(빙원)", json.dumps({"theme": jmp["theme"], "mon": jmp["monsters"]}))
    ok(jmp["overStart"] == jmp["capA"] and jmp["junkStart"] == 1 and jmp["zeroStart"] == 1, "상한 초과 요청은 상한으로 깎고, 숫자가 아니면 S1", json.dumps({k: jmp[k] for k in ["overStart", "junkStart", "zeroStart"]}))
    ok(jmp["plainStage"] == 1 and jmp["plainLevel"] == 1 and jmp["plainGold"] == 500 and jmp["plainStart"] == 1, "인자 생략 시 기존 동작(S1·Lv.1·💰500) 유지", json.dumps({k: jmp[k] for k in ["plainStage", "plainLevel", "plainGold"]}))
    ok(jmp["bonus1"] == {"level": 1, "gold": 0} and jmp["bonus13"] == {"level": 19, "gold": 1440}, "점프 보정식 — S1은 보정 0 · S13은 Lv.19/💰1,440", json.dumps({"b1": jmp["bonus1"], "b13": jmp["bonus13"]}))
    ok(jmp["peak"] == 34 and jmp["best"] == 34 and jmp["count"] == 1, "점프해도 역대 기록·환생 횟수는 유지", json.dumps({k: jmp[k] for k in ["peak", "best", "count"]}))

    appsrc6 = read("app.js")
    uisrc6 = read("src/ui.js")
    css6 = read("style.css")
    ok(all(x in appsrc6 for x in ["pickRebirthStart", "rebirthStartOptions", "rebirthJumpCap", "rebirthPrevBest", "rebirthJumpBonus", "rebirthJumpStage"]), "환생 모달 — 시작 스테이지 선택·상한 안내(app.js)", "")
    ok("data-action=\"rebirth-start\"" in appsrc6 and "jump-chip" in appsrc6, "시작 스테이지 선택 칩 UI", "")
    ok("case 'rebirth-start'" in uisrc6, "rebirth-start 액션 연결(ui.js)", "")
    ok(all(x in css6 for x in [".rb-jump", ".jump-chip", ".rb-jump-opts", ".rb-jump-pick"]), "v4.1 환생 점프 CSS", "")
    ok(all(x in read("src/rebirth.js") for x in ["REBIRTH_JUMP", "rebirthJumpCap", "rebirthStartOptions", "rebirthJumpStage", "rebirthJumpBonus", "rebirthPrevBest"]), "rebirth.js — 점프 규칙 모듈", "")
    ok("preloadBackgrounds" in appsrc6, "app.js — 부팅 시 테마 배경 프리로드", "")


    section("[18] 🗼 v4.2 도전의 탑 · 🐾 펫 진화·고유 스킬")
    tw = js(ctx, """
      const RNG=(seed)=>{let x=seed;return function(){x=(x*1664525+1013904223)>>>0;return x/4294967296;};};
      function mk(floor, clearedUpto, opts) {
        opts = opts || {};
        const s = defaultState(0);
        s.level = opts.level || 30;
        s.stage = opts.stage || 12;
        s.maxStage = opts.maxStage || Math.max(opts.stage || 12, 24);
        const q = opts.bare ? 0 : (opts.eq == null ? 30 : opts.eq);
        const r = opts.bare ? 'common' : (opts.rar || 'rare');
        s.equip = { weapon:q, armor:q, helmet:q, ring:q, amulet:q };
        s.gearRarity = { weapon:r, armor:r, helmet:r, ring:r, amulet:r };
        s.tower = { cleared: Array.from({length: clearedUpto||0}, (_,i)=>i+1), best: clearedUpto||0, runs: 0, fails: 0, last: null };
        const b = new Battle(s, () => ({}), RNG(opts.seed || 3), 0);
        return { s, b };
      }
      function run(floor, clearedUpto, opts, ticks) {
        const { s, b } = mk(floor, clearedUpto, opts);
        const r0 = b.startTower(floor, 1000);
        const gold0 = s.gold, shards0 = s.shards, items0 = s.gear.items.length;
        let t = 1000, ev = null, stageAtEnd = null, goldAtEnd = null, shardsAtEnd = null, itemsAtEnd = 0, minPct = 100, maxAlive = 0, themeAtEnd = null, themeInTower = b.def.theme.id;
        for (let i = 0; i < (ticks || 2200); i++) {
          t += 50; b.tick(50, t);
          for (const e of b.drainEvents()) if (e.t === 'towerEnd') {
            ev = e; stageAtEnd = s.stage; goldAtEnd = s.gold - gold0; shardsAtEnd = s.shards - shards0; itemsAtEnd = s.gear.items.length - items0; themeAtEnd = b.def.theme.id;
          }
          if (b.tower) {
            minPct = Math.min(minPct, 100 * b.player.hp / b.stats.hpMax);
            maxAlive = Math.max(maxAlive, b.monsters.filter(m => !m.dead && !m.dying).length);
          }
        }
        return {
          ok: r0.ok, reason: r0.reason, how: s.tower.last && s.tower.last.how,
          ev: ev, stageAtEnd, goldAtEnd, shardsAtEnd, minPct: Math.round(minPct), maxAlive, themeInTower, themeAtEnd,
          towerNull: b.tower === null, monsters: b.monsters.length, itemsDelta: itemsAtEnd,
          cleared: s.tower.cleared, best: s.tower.best, runs: s.tower.runs, fails: s.tower.fails,
          points: ev && ev.points, item: ev && ev.item, next: ev && ev.next, first: ev && ev.first,
          gold: ev && ev.gold, shards: ev && ev.shards,
          retry: (function(){ try { return b.startTower(floor, t + 1000).ok; } catch(e) { return false; } })(),
        };
      }

      const defs = {
        floors: TOWER_FLOORS.map(f => f.n),
        names: TOWER_FLOORS.map(f => f.name),
        mins: TOWER_FLOORS.map(f => f.minStage),
        goals: TOWER_FLOORS.map(f => f.goal),
        limits: TOWER_FLOORS.map(f => Math.round(f.timeLimitMs / 1000)),
        bossOnly: TOWER_FLOORS.filter(f => f.bossOnly).map(f => f.n),
        bosses: TOWER_FLOORS.filter(f => f.bossOnly).map(f => f.boss),
        points: TOWER_FLOORS.filter(f => (f.reward.points||0) > 0).map(f => f.n),
        pointVals: TOWER_FLOORS.filter(f => (f.reward.points||0) > 0).map(f => f.reward.points),
        itemFloors: TOWER_FLOORS.filter(f => f.reward.item).map(f => f.n + ':' + f.reward.item),
        gimIds: TOWER_GIMMICK_IDS.slice(),
        allGim: TOWER_FLOORS.map(f => f.gimmicks),
        themeOk: TOWER_FLOORS.every(f => THEMES.some(t => t.id === f.theme)),
        themeName: towerStageDef(7).themeName,
        themeId: towerStageDef(7).theme.id,
        rules: TOWER_RULES,
        max: TOWER_MAX_FLOOR,
        fixed: TOWER_FIXED_FLOOR,
        gimText: towerGimmickText(TOWER_FLOORS[6]),
        goalText: towerGoalText(TOWER_FLOORS[2]),
        rewardText: towerRewardText(defaultState(0), 3),
      };

      const p0 = towerProgress(defaultState(0));
      const uStart = [towerUnlocked(defaultState(0), 1), towerUnlocked(defaultState(0), 2)];
      const su = defaultState(0);
      su.maxStage = 3; su.tower.cleared = [1]; su.tower.best = 1;
      const prog = towerProgress(su);
      const gate = { two: towerUnlocked(su, 2), three: towerUnlocked(su, 3), why3: towerLockReason(su, 3) };
      su.maxStage = 4; su.tower.cleared = [1, 2];
      const gate2 = { three: towerUnlocked(su, 3) };
      const bad = normalizeState({ tower: { cleared: [1,1,99,-3,'2','x'], best: 99, runs: -5, fails: 'a', last: { n: 3, how: 'clear', gold: -1, dmg: -2 } } }, 0).tower;
      const oldSave = normalizeState({ level: 5, pet: { unlocked: ['wolf'], equipped: 'wolf', levels: { wolf: 3 } } }, 0);

      const rStage1 = defaultState(0);
      const first = towerReward(rStage1, 3, { first: true, rng: () => 0.5 });
      const again = towerReward(rStage1, 3, { first: false, rng: () => 0.5 });
      const item5 = towerReward(rStage1, 5, { first: true, rng: () => 0.5 });
      const item10 = towerReward(rStage1, 10, { first: true, rng: () => 0.5 });
      const lowS = defaultState(0); lowS.stage = 2;
      const highS = defaultState(0); highS.stage = 20;
      const goldLow = towerReward(lowS, 1, { first: true, rng: () => 0.5 }).gold;
      const goldHigh = towerReward(highS, 1, { first: true, rng: () => 0.5 }).gold;

      const ent = mk(1, 0, { maxStage: 3 });
      const e0 = ent.b.startTower(1, 1000);
      const evStart = ent.b.drainEvents().filter(e => e.t === 'towerStart');
      const entry = {
        ok: e0.ok, n: ent.b.tower && ent.b.tower.n, theme: ent.b.def.theme.id, themeName: ent.b.def.themeName,
        monsters: ent.b.monsters.length, goal: ent.b.tower && ent.b.tower.goal, sec: ent.b.tower && Math.round((ent.b.tower.ends - 1000) / 1000),
        hpFull: ent.b.player.hp === ent.b.stats.hpMax, starts: evStart.length, gimmicks: evStart[0] && evStart[0].gimmicks,
        dupOk: ent.b.startTower(1, 1000).ok, dunOk: ent.b.startDungeon(1000).ok, bossOk: ent.b.challengeBoss(1000),
      };
      const lockb = mk(2, 0, { maxStage: 2 });
      const lockRes = lockb.b.startTower(2, 1000);

      const swarm = run(7, 6, { seed: 3 }, 900);
      const bar = mk(2, 1, { seed: 3 });
      bar.b.startTower(2, 1000);
      const barrage = bar.b.monsters.map(m => ({ ranged: m.atkKind === 'ranged', gap: m.attackGap || 0, proj: !!m.projKind }));
      const regenRun = mk(4, 3, { seed: 3 });
      regenRun.b.startTower(4, 1000);
      const rm = regenRun.b.monsters[0];
      rm.maxHp = 100000; rm.hp = 50000;
      regenRun.b.towerTick(2000);
      const regenHp = Math.round(rm.hp);
      const guardRun = mk(6, 5, { seed: 3 });
      guardRun.b.startTower(6, 1000);
      guardRun.b.roll = () => ({ dmg: 1000, crit: false });
      const gm = guardRun.b.monsters[0];
      gm.maxHp = 1e9; gm.hp = 1e9;
      const gBefore = gm.hp;
      guardRun.b.emit = () => {};
      guardRun.b.hit([gm], 1, 'normal', 1200);
      const guardDmg = gBefore - gm.hp;
      const plainRun = mk(4, 3, { seed: 3 });
      plainRun.b.startTower(4, 1000);
      plainRun.b.roll = () => ({ dmg: 1000, crit: false });
      const pm = plainRun.b.monsters[0];
      pm.maxHp = 1e9; pm.hp = 1e9;
      const pBefore = pm.hp;
      plainRun.b.emit = () => {};
      plainRun.b.hit([pm], 1, 'normal', 1200);
      const plainDmg = pBefore - pm.hp;
      const fre = mk(3, 2, { seed: 3 });
      fre.b.startTower(3, 1000);
      const boss0 = fre.b.monsters[0];
      const atk0 = boss0.atk;
      fre.b.towerTick(11000);
      const frenzy = { isBoss: !!boss0.isBoss, atk0, atk1: boss0.atk, step: fre.b.tower.frenzyStep, count: fre.b.monsters.length };

      const c1 = run(1, 0, { seed: 11 });
      const c1again = run(1, 1, { seed: 11 });
      const c3 = run(3, 2, { seed: 5 });
      const c5 = run(5, 4, { seed: 9 });
      const failBare = run(10, 9, { seed: 4, level: 8, stage: 22, maxStage: 22, bare: true });
      const winStrong = run(10, 9, { seed: 4, level: 30, stage: 24, maxStage: 24, eq: 40, rar: 'legend' });
      const to = mk(5, 4, { seed: 2 });
      to.b.startTower(5, 1000);
      to.b.attack = () => {}; to.b.petAttack = () => {}; to.b.petSkillTick = () => {}; to.b.autoSkills = () => {}; to.b.castSkill = () => false;
      let tt = 1000, toEv = null;
      for (let i = 0; i < 700; i++) { tt += 50; to.b.tick(50, tt); for (const e of to.b.drainEvents()) if (e.t === 'towerEnd') toEv = e; }
      const timeout = { how: to.s.tower.last && to.s.tower.last.how, gold: toEv && toEv.gold, cleared: to.s.tower.cleared, fails: to.s.tower.fails, retry: to.b.startTower(5, tt + 1000).ok, stage: to.s.stage };

      return { defs, p0, uStart, prog, gate, gate2, bad, oldTower: oldSave.tower, oldPetEvo: oldSave.pet.evo,
               first, again, item5: item5.item && item5.item.rarity, item10: item10.item && item10.item.rarity, goldLow, goldHigh,
               entry, lockRes: { ok: lockRes.ok, reason: lockRes.reason },
               swarm, barrage, regenHp, guardDmg, plainDmg, frenzy,
               c1, c1again, c3, c5, failBare, winStrong, timeout };
    """)
    d42 = tw["defs"]
    ok(d42["floors"] == list(range(1, 11)) and d42["max"] == 200 and d42["fixed"] == 10, "고정 10층 + 심층 11~200층 정의", json.dumps([d42["floors"], d42["max"], d42["fixed"]]))
    ok(d42["names"][0] == "첫 관문" and d42["names"][6] == "무리의 파도" and d42["names"][9] == "탑의 정점", "층 이름", json.dumps(d42["names"], ensure_ascii=False))
    ok(d42["gimIds"] == ["swarm", "barrage", "frenzy", "regen", "timeattack", "guard"], "기믹 6종(다굴·포격·광폭·재생·타임어택·철벽)", json.dumps(d42["gimIds"]))
    ok(all(all(g in d42["gimIds"] for g in f) for f in d42["allGim"]) and len({g for f in d42["allGim"] for g in f}) == 6, "모든 층 기믹이 정의된 6종 안에서 쓰임", json.dumps(d42["allGim"]))
    ok(d42["themeOk"] and d42["themeName"] == "도전의 탑 7층 · 무리의 파도" and d42["themeId"] == "ice", "층 테마 = 실제 배경 테마(7층 빙원)", json.dumps([d42["themeOk"], d42["themeName"]], ensure_ascii=False))
    ok(d42["bossOnly"] == [3, 8, 10] and d42["bosses"] == ["Cerberus", "AbyssLord", "VoidWalker"], "보스 층 3·8·10층", json.dumps([d42["bossOnly"], d42["bosses"]]))
    ok(d42["mins"] == [1, 2, 4, 6, 8, 10, 13, 16, 19, 22], "층별 최소 스테이지(1·2·4·6·8·10·13·16·19·22)", json.dumps(d42["mins"]))
    ok(all(20 <= v <= 90 for v in d42["limits"]) and d42["limits"][4] == 26, "제한 시간 20~90초(5층 타임어택 26초)", json.dumps(d42["limits"]))
    ok(all(g > 0 for g in d42["goals"]) and d42["points"] == [3, 6, 8, 10] and d42["pointVals"] == [2, 3, 4, 6], "처치 목표·초월석 보상 층(3·6·8·10 → 2·3·4·6P)", json.dumps([d42["goals"], d42["pointVals"]]))
    ok(d42["itemFloors"] == ["5:rare", "10:legend"], "장비 보상 층(5층 레어 · 10층 전설)", json.dumps(d42["itemFloors"]))
    ok(d42["rules"]["guardReduce"] == 0.45 and d42["rules"]["regenPerSec"] == 0.2 and d42["rules"]["frenzyEveryMs"] == 10000 and d42["rules"]["repeatRate"] == 0.35, "기믹 수치(철벽 45% · 재생 20%/s · 광폭 10초 · 재도전 35%)", json.dumps(d42["rules"]))
    ok("👥 다굴 웨이브" in d42["gimText"] and "🛡️ 철벽 진형" in d42["gimText"], "기믹 한 줄 텍스트", d42["gimText"])
    ok("초" in d42["goalText"] and ("격파" in d42["goalText"] or "처치" in d42["goalText"]), "목표 텍스트(보스 격파·처치 수 + 제한 시간)", d42["goalText"])
    ok("💎" in d42["rewardText"] and "✨" in d42["rewardText"], "보상 미리보기 텍스트(강화석·초월석)", d42["rewardText"])

    p0 = tw["p0"]
    ok(p0["max"] == 200 and p0["clearedCount"] == 0 and p0["next"] == 1 and p0["pct"] == 0 and p0["deep"] is False, "초기 진행도 — 0/200 · 다음 1층", json.dumps({k: p0[k] for k in ["max", "clearedCount", "next", "pct"]}))
    ok(tw["uStart"] == [True, False], "1층은 항상 열림, 2층은 잠김", json.dumps(tw["uStart"]))
    ok(tw["prog"]["clearedCount"] == 1 and tw["prog"]["next"] == 2 and tw["prog"]["best"] == 1, "1층 클리어 후 진행도", json.dumps({k: tw["prog"][k] for k in ["clearedCount", "next", "best"]}))
    ok(tw["gate"]["two"] is True and tw["gate"]["three"] is False and tw["gate"]["why3"] == "최고 스테이지 4 필요", "최고 스테이지 게이트(3층 = S4)", json.dumps(tw["gate"], ensure_ascii=False))
    ok(tw["gate2"]["three"] is True, "스테이지가 오르면 잠금 해제", json.dumps(tw["gate2"]))
    bad = tw["bad"]
    ok(bad["cleared"] == [1, 2, 99] and bad["best"] == 99 and bad["runs"] == 0 and bad["fails"] == 0, "저장 기록 정규화(중복·음수·상한 200 방어 · 심층 99층 유지)", json.dumps(bad, ensure_ascii=False))
    ok(bad["last"]["n"] == 3 and bad["last"]["gold"] == 0 and bad["last"]["dmg"] == 0, "지난 도전 기록 정규화", json.dumps(bad["last"], ensure_ascii=False))
    ok(tw["oldTower"]["cleared"] == [] and tw["oldTower"]["best"] == 0 and tw["oldTower"]["last"] is None and tw["oldTower"]["sweep"]["date"] == "" and tw["oldPetEvo"] == {}, "기존(v4.1) 세이브 호환 — 탑·소탕·펫 진화 기본값", json.dumps([tw["oldTower"], tw["oldPetEvo"]], ensure_ascii=False))

    first, again = tw["first"], tw["again"]
    ok(first["first"] is True and first["points"] == 2 and first["item"] is None, "3층 최초 클리어 — 초월석 2P", json.dumps({k: first[k] for k in ["first", "points", "gold", "shards"]}))
    ok(again["first"] is False and again["points"] == 0 and again["gold"] == round(first["gold"] * 0.35) and again["shards"] < first["shards"], "재도전은 35% 보상(초월석 없음)", json.dumps({"first": first["gold"], "again": again["gold"]}))
    ok(tw["item5"] == "rare" and tw["item10"] == "legend", "층별 장비 보상 등급", json.dumps([tw["item5"], tw["item10"]]))
    ok(tw["goldLow"] < tw["goldHigh"], "보상 골드가 스테이지에 비례", json.dumps([tw["goldLow"], tw["goldHigh"]]))

    entry = tw["entry"]
    ok(entry["ok"] is True and entry["n"] == 1 and entry["theme"] == "meadow" and entry["themeName"] == "도전의 탑 1층 · 첫 관문", "탑 입장 — 층 테마로 배경 전환", json.dumps({k: entry[k] for k in ["ok", "n", "theme", "themeName"]}, ensure_ascii=False))
    ok(entry["monsters"] == 2 and entry["goal"] == 12 and entry["sec"] == 60 and entry["hpFull"] is True, "입장 직후 웨이브·목표·시간·체력 완충", json.dumps({k: entry[k] for k in ["monsters", "goal", "sec", "hpFull"]}))
    ok(entry["starts"] == 1 and entry["gimmicks"] == ["swarm"], "towerStart 이벤트(기믹 포함)", json.dumps(entry["gimmicks"]))
    ok(entry["dupOk"] is False and entry["dunOk"] is False and entry["bossOk"] is False, "탑 중 중복 입장·던전·보스 도전 거부", json.dumps({k: entry[k] for k in ["dupOk", "dunOk", "bossOk"]}))
    ok(tw["lockRes"]["ok"] is False and "층을 먼저" in tw["lockRes"]["reason"], "잠긴 층 입장 거부 사유(앞 층 클리어 필요)", tw["lockRes"]["reason"])

    ok(tw["swarm"]["maxAlive"] >= 8, "👥 다굴 웨이브 — 동시 8마리 이상", json.dumps({"maxAlive": tw["swarm"]["maxAlive"], "how": tw["swarm"]["how"]}))
    ok(all(b["ranged"] and b["gap"] == 1200 and b["proj"] for b in tw["barrage"]), "🏹 원거리 포격 — 전원 원거리·공격 간격 1.2초", json.dumps(tw["barrage"]))
    ok(tw["regenHp"] == 70000, "♻️ 재생의 벽 — 1초에 최대 체력 20% 회복", json.dumps({"hp": tw["regenHp"]}))
    ok(tw["guardDmg"] == 550 and tw["plainDmg"] == 1000, "🛡️ 철벽 진형 — 주는 피해 45% 감소", json.dumps({"guard": tw["guardDmg"], "plain": tw["plainDmg"]}))
    ok(tw["frenzy"]["isBoss"] is True and tw["frenzy"]["count"] == 1 and tw["frenzy"]["atk1"] == round(tw["frenzy"]["atk0"] * 1.25), "🔥 광폭 보스 — 10초마다 공격력 +25%", json.dumps(tw["frenzy"]))

    c1 = tw["c1"]
    ok(c1["how"] == "clear" and c1["first"] is True and c1["next"] == 2, "1층 클리어 — 최초 보상·다음 층 해제", json.dumps({k: c1[k] for k in ["how", "first", "next"]}))
    ok(c1["cleared"] == [1] and c1["best"] == 1 and c1["runs"] == 1 and c1["points"] == 0, "클리어 기록(cleared·best·runs)", json.dumps({k: c1[k] for k in ["cleared", "best", "runs"]}))
    ok(c1["goldAtEnd"] > 0 and c1["shardsAtEnd"] >= 35, "클리어 보상 즉시 지급(골드·강화석 35)", json.dumps({"gold": c1["goldAtEnd"], "shards": c1["shardsAtEnd"]}))
    ok(c1["themeInTower"] == "meadow" and c1["towerNull"] is True and c1["themeAtEnd"] != "meadow" and c1["monsters"] >= 1, "클리어 후 원래 스테이지 테마·사냥으로 복귀", json.dumps({k: c1[k] for k in ["themeInTower", "themeAtEnd", "monsters"]}))
    ok(c1["stageAtEnd"] == 12, "탑 안에서는 스테이지가 오르지 않음", json.dumps({"stage": c1["stageAtEnd"]}))
    ok(tw["c1again"]["first"] is False and tw["c1again"]["gold"] < c1["gold"] and tw["c1again"]["cleared"] == [1] and tw["c1again"]["runs"] == 1, "재도전 클리어 — 소액 보상·기록 중복 없음", json.dumps({k: tw["c1again"][k] for k in ["first", "gold", "cleared", "runs"]}))
    ok(tw["c3"]["points"] == 2 and tw["c3"]["cleared"] == [1, 2, 3], "보스 층(3층) — 초월석 2P 지급·연속 해제", json.dumps({k: tw["c3"][k] for k in ["points", "cleared"]}))
    ok(tw["c5"]["item"] and tw["c5"]["item"]["rarity"] == "rare" and tw["c5"]["itemsDelta"] == 1, "5층 — 레어 장비 지급(인벤토리 +1)", json.dumps({"item": tw["c5"]["item"], "delta": tw["c5"]["itemsDelta"]}, ensure_ascii=False))
    fb = tw["failBare"]
    ok(fb["how"] in ("dead", "timeout") and fb["goldAtEnd"] == 0 and fb["fails"] == 1 and fb["cleared"] == list(range(1, 10)), "패배 — 보상 없음·기록 유지", json.dumps({k: fb[k] for k in ["how", "goldAtEnd", "fails"]}))
    ok(fb["towerNull"] is True and fb["monsters"] >= 1 and fb["stageAtEnd"] == 22 and fb["retry"] is True, "패배 후 원래 스테이지 사냥 복귀·즉시 재도전 가능", json.dumps({k: fb[k] for k in ["towerNull", "monsters", "stageAtEnd", "retry"]}, ensure_ascii=False))
    ws = tw["winStrong"]
    ok(ws["how"] == "clear" and ws["points"] == 6 and ws["minPct"] > 5, "10층은 강한 빌드만 클리어(초월석 6P)", json.dumps({k: ws[k] for k in ["how", "points", "minPct"]}))
    ok(fb["minPct"] < ws["minPct"], "약한 빌드는 10층에서 무너지고 강한 빌드는 버팀", json.dumps({"bare": fb["minPct"], "strong": ws["minPct"]}))
    to = tw["timeout"]
    ok(to["how"] == "timeout" and to["gold"] == 0 and to["cleared"] == [1, 2, 3, 4] and to["fails"] == 1 and to["retry"] is True, "시간 초과 실패 — 보상 없음·기록 그대로·재도전 가능", json.dumps(to, ensure_ascii=False))

    pet42 = js(ctx, """
      const s = defaultState(0);
      s.level = 20; s.stage = 8; s.maxStage = 8;
      s.pet = { equipped: 'wolf', unlocked: ['wolf'], chosen: true, levels: { wolf: 3 }, evo: {} };
      s.shards = 1000; s.gold = 100000;
      const stages = PET_EVO_STAGES.map(x => ({ label: x.label, mul: x.mul, lv: x.lv, badge: x.badge }));
      const base = petStageInfo(s, 'wolf');
      const infoLow = petEvolveInfo(s, 'wolf');
      s.pet.levels.wolf = 5;
      const noShard = (function(){ const c = defaultState(0); c.pet = { equipped:'wolf', unlocked:['wolf'], chosen:true, levels:{wolf:5}, evo:{} }; c.gold = 100000; c.shards = 10; return petEvolveInfo(c, 'wolf'); })();
      const noGold = (function(){ const c = defaultState(0); c.pet = { equipped:'wolf', unlocked:['wolf'], chosen:true, levels:{wolf:5}, evo:{} }; c.shards = 1000; c.gold = 10; return petEvolveInfo(c, 'wolf'); })();
      const lockedPet = (function(){ const c = defaultState(0); return evolvePet(c, 'dragon'); })();
      const lockedInfo = (function(){ const c = defaultState(0); return petEvolveInfo(c, 'wolf').lv; })();
      const atk0 = calcStats(s, {}).atk, dmg0 = petDmgPct(s, 'wolf'), crit0 = calcStats(s, {}).crit;
      const ref10 = defaultState(0);
      ref10.pet = { equipped: 'wolf', unlocked: ['wolf'], chosen: true, levels: { wolf: 10 }, evo: {} };
      const dmgBase10 = petDmgPct(ref10, 'wolf');
      const sk0 = petSkillOf(s, 'wolf');
      const r1 = evolvePet(s, 'wolf');
      const info1 = petStageInfo(s, 'wolf');
      const atk1 = calcStats(s, {}).atk, dmg1 = petDmgPct(s, 'wolf'), crit1 = calcStats(s, {}).crit;
      const sk1 = petSkillOf(s, 'wolf');
      const cost1 = r1.ok ? r1.spent : null;
      s.pet.levels.wolf = 10;
      const r2 = evolvePet(s, 'wolf');
      const info2 = petStageInfo(s, 'wolf');
      const dmg2 = petDmgPct(s, 'wolf');
      const r3 = evolvePet(s, 'wolf');
      const goldBefore = s.gold;
      const owl = (function(){
        const c = defaultState(0); c.pet = { equipped:'owl', unlocked:['owl'], chosen:true, levels:{owl:10}, evo:{ owl: 0 } };
        const g0 = petGoldPct(c, 'owl');
        c.pet.evo.owl = 2;
        const g1 = petGoldPct(c, 'owl');
        return { g0, g1, txt: petSkillText({ skill: { type: 'gold', name: 'x', active: { name: 'y', cdMs: 1000, durMs: 8000 } } }, 2) };
      })();
      const dragonBoss = (function(){
        const c = defaultState(0); c.level = 20;
        c.pet = { equipped:'dragon', unlocked:['dragon'], chosen:true, levels:{dragon:10}, evo:{ dragon: 2 } };
        const st = calcStats(c, {});
        const c0 = defaultState(0); c0.level = 20;
        const st0 = calcStats(c0, {});
        return { boss: Math.round(st.bossDmgPct * 1000) / 10, base: st0.bossDmgPct, stage: st.petStage };
      })();
      // syncPets 가 진화를 지우지 않는가
      const sp = defaultState(0);
      sp.pet = { equipped: 'wolf', unlocked: ['wolf'], chosen: true, levels: { wolf: 5 }, evo: { wolf: 1 } };
      CITIES.slice(0, 2).forEach(c => { sp.land.owned[c.key] = 40; });
      syncPets(sp, 0);
      const kept = sp.pet.evo.wolf;
      const norm = normalizeState({ pet: { unlocked: ['wolf', 'fox'], equipped: 'wolf', levels: { wolf: 9 }, evo: { wolf: 9, fox: -2, dragon: 2, xxx: 1 } } }, 0);
      return { stages, base: { stage: base.stage, name: base.name, sprite: base.sprite, scale: base.scale },
               infoLow: { can: infoLow.can, reason: infoLow.reason, needLv: infoLow.needLv },
               noShard: noShard.reason, noGold: noGold.reason, lockedPet: { ok: lockedPet.ok, reason: lockedPet.reason }, lockedInfo,
               atk0, atk1, dmg0, dmg1, dmg2, dmgBase10, crit0, crit1,
               sk0: { unlocked: sk0.unlocked, text: sk0.text }, sk1: { unlocked: sk1.unlocked, name: sk1.name, activeName: sk1.activeName, text: sk1.text },
               r1: { ok: r1.ok, stage: r1.stage, name: r1.name, cost: cost1 },
               r2ok: r2.ok, stage2name: info2.name, sprite2: info2.sprite, r3: { ok: r3.ok, max: !!r3.max },
               goldAfter: s.gold, shardsAfter: s.shards, evo: s.pet.evo, owl, dragonBoss, kept, norm: { evo: norm.pet.evo, unlocked: norm.pet.unlocked } };
    """)
    ok([x["label"] for x in pet42["stages"]] == ["기본", "각성", "신수"] and [x["mul"] for x in pet42["stages"]] == [1, 1.5, 2.1] and [x["lv"] for x in pet42["stages"]] == [0, 5, 10], "펫 진화 3단계(기본·각성·신수 / ×1 · ×1.5 · ×2.1)", json.dumps(pet42["stages"], ensure_ascii=False))
    ok(pet42["base"]["stage"] == 0 and pet42["base"]["name"] == "꼬마 늑대" and pet42["base"]["sprite"] == "pet_wolf" and pet42["base"]["scale"] == 1, "기본 단계 — 원래 이름·스프라이트", json.dumps(pet42["base"], ensure_ascii=False))
    ok(pet42["infoLow"]["can"] is False and "Lv.5" in pet42["infoLow"]["reason"], "진화 조건 — 펫 강화 레벨", json.dumps(pet42["infoLow"], ensure_ascii=False))
    ok("강화석" in (pet42["noShard"] or "") and "골드" in (pet42["noGold"] or ""), "진화 조건 — 강화석·골드 부족 안내", json.dumps([pet42["noShard"], pet42["noGold"]], ensure_ascii=False))
    ok(pet42["lockedPet"]["ok"] is False and "해금" in pet42["lockedPet"]["reason"] and pet42["lockedInfo"] == 1, "미해금 펫은 진화 불가", json.dumps(pet42["lockedPet"], ensure_ascii=False))
    ok(pet42["r1"]["ok"] is True and pet42["r1"]["stage"] == 1 and pet42["r1"]["name"] == "은빛 늑대", "각성 진화 — 이름·단계 변화", json.dumps(pet42["r1"], ensure_ascii=False))
    ok(pet42["r1"]["cost"] == {"shards": 80, "gold": 6000} and pet42["shardsAfter"] == 600 and pet42["goldAfter"] == 64000, "진화 비용 차감(💎80 · 💰6,000 → 💎320 · 💰30,000)", json.dumps({"cost": pet42["r1"]["cost"], "shards": pet42["shardsAfter"], "gold": pet42["goldAfter"]}))
    ok(pet42["dmg1"] > pet42["dmg0"] and abs(pet42["dmg1"] / pet42["dmg0"] - 1.5) < 0.01 and pet42["atk1"] > pet42["atk0"], "각성 — 동행 피해 ×1.5 · 공격 패시브 상승", json.dumps({"d0": round(pet42["dmg0"], 3), "d1": round(pet42["dmg1"], 3), "atk0": pet42["atk0"], "atk1": pet42["atk1"]}))
    ok(pet42["crit1"] > pet42["crit0"], "늑대 고유 스킬 — 치명타 패시브가 스탯에 반영", json.dumps({"c0": pet42["crit0"], "c1": pet42["crit1"]}))
    ok(pet42["sk0"]["unlocked"] is False and pet42["sk1"]["unlocked"] is True and pet42["sk1"]["activeName"] == "삼연 물기" and "치명타" in pet42["sk1"]["text"], "고유 스킬 해금(각성) — 삼연 물기", json.dumps(pet42["sk1"], ensure_ascii=False))
    ok(pet42["r2ok"] is True and pet42["stage2name"] == "달빛 수호랑" and pet42["sprite2"] == "pet_wolf_divine" and abs(pet42["dmg2"] / pet42["dmgBase10"] - 2.1) < 0.02, "신수 진화 — ×2.1 · 전용 스프라이트", json.dumps({"name": pet42["stage2name"], "sprite": pet42["sprite2"]}, ensure_ascii=False))
    ok(pet42["r3"]["ok"] is False and pet42["r3"]["max"] is True, "최종 진화 이후 거부", json.dumps(pet42["r3"]))
    ok(pet42["owl"]["g1"] > pet42["owl"]["g0"], "황금 부엉이 — 진화 시 골드 패시브 증가", json.dumps(pet42["owl"]["g0"], ensure_ascii=False))
    ok(pet42["dragonBoss"]["boss"] > 0 and pet42["dragonBoss"]["base"] == 0 and pet42["dragonBoss"]["stage"] == 2, "아기 드래곤 — 보스 추가 피해 패시브", json.dumps(pet42["dragonBoss"], ensure_ascii=False))
    ok(pet42["kept"] == 1, "syncPets 가 진화 단계를 지우지 않음", json.dumps({"kept": pet42["kept"]}))
    ok(pet42["norm"]["evo"] == {"wolf": 2, "fox": 0} or pet42["norm"]["evo"] in ({"wolf": 2}, {"wolf": 2, "fox": 0}), "진화 저장 정규화(범위·미해금 제거)", json.dumps(pet42["norm"], ensure_ascii=False))

    petbat42 = js(ctx, """
      const RNG=(seed)=>{let x=seed;return function(){x=(x*1664525+1013904223)>>>0;return x/4294967296;};};
      function scene(petId, stage, count) {
        const s = defaultState(0);
        s.level = 30; s.stage = 10; s.maxStage = 10;
        s.pet = { equipped: petId, unlocked: [petId], chosen: true, levels: { [petId]: 10 }, evo: stage ? { [petId]: stage } : {} };
        const b = new Battle(s, () => ({}), RNG(7), 0);
        b.monsters = [];
        for (let i = 0; i < count; i++) {
          const m = b.makeMonster('Slime', false, 0);
          m.x = 300 + i * 40; m.maxHp = 1e9; m.hp = 1e9; m.lastAttack = 1e9;
          b.monsters.push(m);
        }
        b.petSkillAt = -1e9;
        return { s, b };
      }
      function cast(petId, stage, count) {
        const { s, b } = scene(petId, stage, count);
        const ev = [];
        b.emit = (e) => ev.push(e);
        b.petSkillTick(1000);
        const sk = ev.filter(e => e.t === 'petSkill')[0] || null;
        const hits = ev.filter(e => e.t === 'petHit').length;
        const hurt = b.monsters.filter(m => m.hp < 1e9).length;
        return { sk: sk && { kind: sk.kind, active: sk.active, hits: sk.hits, dmg: sk.dmg, dur: sk.dur || 0 }, hits, hurt };
      }
      const wolf0 = cast('wolf', 0, 3);
      const wolf2 = cast('wolf', 2, 3);
      const fox2 = cast('fox', 2, 3);
      const owl2 = cast('owl', 2, 3);
      const drg2 = cast('dragon', 2, 3);
      // 황금비 — 골드 2배가 실제 처치 보상에 붙는가
      const go = (function(){
        const { s, b } = scene('owl', 2, 1);
        b.petGoldUntil = 999999;
        const g0 = s.gold;
        const m = b.monsters[0]; m.hp = 1; m.maxHp = 1;
        b.emit = () => {};
        b.hit([m], 1, 'normal', 1200);
        const withBuff = s.gold - g0;
        const { s: s2, b: b2 } = scene('owl', 0, 1);
        const g1 = s2.gold;
        const m2 = b2.monsters[0]; m2.hp = 1; m2.maxHp = 1;
        b2.emit = () => {};
        b2.hit([m2], 1, 'normal', 1200);
        return { withBuff, plain: s2.gold - g1 };
      })();
      return { wolf0, wolf2, fox2, owl2, drg2, go };
    """)
    ok(petbat42["wolf0"]["sk"] is None and petbat42["wolf0"]["hits"] == 0, "기본 단계에서는 고유 스킬이 발동하지 않음", json.dumps(petbat42["wolf0"]))
    ok(petbat42["wolf2"]["sk"] and petbat42["wolf2"]["sk"]["kind"] == "multi" and petbat42["wolf2"]["sk"]["hits"] == 3 and petbat42["wolf2"]["hurt"] == 1, "삼연 물기 — 한 대상 3연타", json.dumps(petbat42["wolf2"]))
    ok(petbat42["fox2"]["sk"] and petbat42["fox2"]["sk"]["kind"] == "splash" and petbat42["fox2"]["hurt"] == 3, "불꽃 폭풍 — 3마리 광역", json.dumps(petbat42["fox2"]))
    ok(petbat42["owl2"]["sk"] and petbat42["owl2"]["sk"]["kind"] == "gold" and petbat42["owl2"]["sk"]["dur"] == 8000, "황금비 — 8초 골드 2배 버프", json.dumps(petbat42["owl2"]))
    ok(petbat42["drg2"]["sk"] and petbat42["drg2"]["sk"]["kind"] == "breath" and petbat42["drg2"]["hurt"] == 3, "화염 브레스 — 전방 광역", json.dumps(petbat42["drg2"]))
    ok(petbat42["go"]["withBuff"] > petbat42["go"]["plain"], "황금비 동안 처치 골드가 실제로 늘어남", json.dumps(petbat42["go"]))

    tpl42 = js(ctx2, """
      const s = defaultState(0);
      s.level = 20; s.stage = 12; s.maxStage = 14; s.gold = 200000; s.shards = 800;
      for (const c of CITIES.slice(0, 4)) s.land.owned[c.key] = 40;
      s.pet = { equipped: 'wolf', unlocked: ['wolf', 'fox'], chosen: true, levels: { wolf: 6, fox: 3 }, evo: { wolf: 1 } };
      s.dungeon = { best: 0, runs: 0, last: null };
      s.tower = { cleared: [1, 2, 3], best: 3, runs: 4, fails: 1, last: { at: 0, n: 4, how: 'timeout', kills: 6, bossKills: 0, dmg: 1200, gold: 0, shards: 0, points: 0 } };
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(12), boss: null, dungeon: null, tower: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {}, install: { standalone: false, installed: false, canPrompt: false, hidden: true } };
      const growth = __huntSub(ui, 'challenge');
      const petHtml = __gearSub(ui, 'collect');
      s.land.sub = 'buff';
      const land = __tpls.land(ui);
      const settings = __tpls.settings(ui);
      const badges = __badges(ui);
      // 진행 중 상태
      const running = { s, battle: { stats: calcStats(s, buffs), def: stageDef(12), boss: null, dungeon: null, tower: { n: 4, floor: TOWER_FLOORS[3], ends: Date.now() + 30000, t0: Date.now(), kills: 3, bossKills: 0, goal: 10, dmg: 0 }, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const growing = __huntSub(running, 'challenge');
      return { growth, petHtml, land, settings, badges, growing, tiles: (growth.match(/class=\\"tf /g) || []).length,
               bad: /undefined|NaN|\\[object Object\\]/.test(growth + petHtml + land + settings + growing) };
    """)
    ok(tpl42["bad"] is False, "v4.2 템플릿에 undefined/NaN 누출 없음")
    ok("도전의 탑" in tpl42["growth"] and "tower-tiles" in tpl42["growth"] and tpl42["tiles"] == 10, "전직·환생 탭에 도전의 탑 카드(층 타일 10개)", json.dumps({"tiles": tpl42["tiles"]}))
    ok("4층 재생의 벽" in tpl42["growth"] and "♻️ 재생의 벽" in tpl42["growth"] and "층 선택" in tpl42["growth"], "다음 층·기믹·층 선택 버튼", "")
    ok('data-action="tower"' in tpl42["growth"] and 'data-action="tower-floors"' in tpl42["growth"], "탑 입장·층 선택 버튼 연결", "")
    ok("진행 중" in tpl42["growing"] and "4층 재생의 벽" in tpl42["growing"] and "🗼 도전 중" in tpl42["growing"], "도전 중 카드 표시", "")
    ok("동료 펫" in tpl42["petHtml"] and "pet-evolve" in tpl42["petHtml"] and "사냥의 본능" in tpl42["petHtml"], "성장 → 수집 탭 — 펫 카드에 진화 버튼·고유 스킬(v8)", "")
    ok("은빛 늑대" in tpl42["petHtml"] and "★" in tpl42["petHtml"], "진화 단계 이름·배지 표시", "")
    ok("도전의 탑" in tpl42["settings"] and "동료 펫" in tpl42["settings"], "설정 탭(내 기록·앱 정보)에 탑·펫 진화 기록", "")
    ok(tpl42["badges"]["challenge"] >= 0, "도전 서브 탭 배지 계산", json.dumps(tpl42["badges"]))

    rsrc42 = read("src/render.js")
    csrc42 = read("src/combat.js")
    usrc42 = read("src/ui.js")
    asrc42 = read("app.js")
    css42 = read("style.css")
    ok(all(x in rsrc42 for x in ["drawTowerHud", "drawTowerMarkers", "drawTowerBanner", "petSkill", "petStageInfo"]), "render.js — 탑 HUD·기믹 표식·펫 진화/스킬 연출", "")
    ok(all(x in csrc42 for x in ["startTower", "endTower", "towerTick", "petSkillTick", "startDungeon", "TOWER_RULES.guardReduce"]), "combat.js — 탑 전투·펫 액티브 구현", "")
    ok(all(x in usrc42 for x in ['data-action="tower"', 'data-action="tower-floors"', 'data-action="pet-evolve"', "tower-tiles"]), "ui.js — 탑 카드·펫 진화 버튼", "")
    ok(all(x in asrc42 for x in ["enterTower", "openTowerFloors", "evolvePet", "showTowerResult", "showTowerFloors"]), "app.js — 탑 입장/층 선택/결과·펫 진화 액션", "")
    ok('assets/sprites/pet/${info.sprite}.png' in asrc42, "진화 결과 모달 — 진화 스프라이트 경로(.png)", "")
    ok(all(x in css42 for x in [".tower-card", ".tower-tiles", ".tower-floor", ".pet-evo", ".mini.evo"]), "style.css — v4.2 스타일", "")
    ok("'./src/tower.js'" in read("sw.js") and f"land-rpg-v{EXPECTED_VER}" in read("sw.js") and f"APP_VERSION = '{EXPECTED_VER}'" in read("src/data.js"), f"버전·서비스워커({EXPECTED_VER} · cloud 프리캐시)", "")
    pkg_ok = (not os.path.exists(os.path.join(ROOT, "package.json"))) or ('"version": "' in read("package.json"))
    ok(pkg_ok, "package.json 버전 확인(없으면 클론 환경으로 통과)", "")
    evo_files = [f"assets/sprites/pet/pet_{n}_{s}.png" for n in ("wolf", "fox", "owl", "dragon") for s in ("awaken", "divine")]
    ok(all(os.path.exists(os.path.join(ROOT, f)) for f in evo_files), "펫 진화 스프라이트 8종 파일", ", ".join(f for f in evo_files if not os.path.exists(os.path.join(ROOT, f))))
    ok(all(f"'./{f}'" in read("sw.js") for f in evo_files), "sw.js 프리캐시에 진화 스프라이트 포함", "")
    try:
        from PIL import Image
        sizes = [Image.open(os.path.join(ROOT, f)).size for f in evo_files]
        alphas = [Image.open(os.path.join(ROOT, f)).getextrema()[3][0] for f in evo_files]
        ok(all(sz == (256, 256) for sz in sizes) and all(a == 0 for a in alphas), "진화 스프라이트 256px 투명 PNG", json.dumps({"sizes": sizes, "min_alpha": alphas}))
    except Exception as e:  # noqa: BLE001
        ok(False, "진화 스프라이트 검사", str(e))

    section("[19] 🏢 v4.3 부동산 서브 탭 정리 · ⚔️ 전투 연출 마감")

    # ── 1) 부동산 탭: 서브 탭 3종 + 모든 서브 탭 최상단 요약 바 ──
    land43 = js(ctx2, """
      const s = defaultState(0);
      s.gold = 400000; s.level = 18; s.stage = 9; s.maxStage = 10; s.shards = 900;
      const cs = CITIES.filter(c => c.base <= 6000).slice(0, 12);
      cs.forEach((c, i) => { s.land.owned[c.key] = 6 + i; });
      s.land.accruedRent = 5000;
      s.land.tradeCount = 7; s.land.taxPaid = 210; s.land.totalRentClaimed = 12345; s.land.bestAsset = 999999;
      s.pet = { equipped: 'wolf', unlocked: ['wolf', 'fox'], chosen: true, levels: { wolf: 10, fox: 3 }, evo: {} };
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(9), boss: null, dungeon: null, tower: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'land', el: {}, install: { hidden: true }, landHoldAll: false };
      const out = { keys: __LAND_SUBS, labels: __LAND_LABELS };
      for (const k of __LAND_SUBS) out[k] = __landSub(ui, k);
      out.fallback = __landSub(ui, 'bogus');
      out.badges = __lbadges(ui);
      out.all = __LAND_SUBS.map(k => out[k]).join('');
      out.shown = (out.market.match(/class="hold/g) || []).length;
      out.lens = Object.fromEntries(__LAND_SUBS.map(k => [k, out[k].length]));
      out.order = { sum: out.market.indexOf('land-sum'), bar: out.market.indexOf('land-subbar'), news: out.market.indexOf('news-slim'), list: out.market.indexOf('landList') };
      ui.landHoldAll = true;
      const all_open = __landSub(ui, 'market');
      out.open = (all_open.match(/class="hold/g) || []).length;
      out.bad = /undefined|NaN|\\[object Object\\]/.test(out.all + out.fallback + all_open);
      return out;
    """)
    ok(land43["keys"] == ["home", "market", "event"], "부동산 서브 탭 3종(영지/매물/이벤트) — v8.0.0 2층 내비 · 저장값 'buff'는 event 로 마이그레이션", json.dumps(land43["keys"]))
    ok(all(x in land43["home"] for x in ["🏠 영지", "🛒 매물", "🎪 이벤트", 'data-action="land-sub"']), "서브 탭 라벨 — 영지 / 매물 / 이벤트")
    ok(land43["home"].count('data-action="land-sub"') >= 3 and 'class="subtabs hunt-subbar land-subbar"' in land43["home"], "서브 탭 버튼 3개 + 사냥 탭과 같은 sticky 바")
    ok(all(('data-lbadge="%s"' % k) in land43["home"] for k in ["home", "market", "event"]), "세 서브 탭 모두 알림 배지 자리")
    ok(all(all(x in land43[k] for x in ["land-sum", "미수령", "일괄 수령", 'data-action="claim-rent"', 'data-action="rent-info"']) for k in ["home", "market", "event"]), "모든 서브 탭 최상단 요약 바(보유 평수·시간당 임대·미수령·일괄 수령)")
    ok(all(land43[k].count('data-action="claim-rent"') == 1 for k in ["home", "market", "event"]), "일괄 수령 버튼은 탭당 하나(중복 카드 제거)", json.dumps({k: land43[k].count('data-action="claim-rent"') for k in land43["keys"]}))
    ok(0 <= land43["order"]["sum"] < land43["order"]["bar"] < land43["order"]["news"] < land43["order"]["list"], "요약 바 → 서브 탭 → 압축 뉴스 → 매물 목록 순서", json.dumps(land43["order"]))
    ok("land-hero" not in land43["all"] and "rent-card" not in land43["all"] and "lh-total" not in land43["all"], "중복 대형 카드(총자산 히어로·미수령 카드) 제거 — 스크롤 절약")
    ok(all(x in land43["home"] for x in ["전국 영지 지도", "rmap-svg", "권역 세트", "랜드마크", "건물주 버프", "영지 파견"]), "영지 탭 — 한반도 지도·권역 세트·랜드마크·건물주 버프·파견(접힘 카드)")
    ok("섹션 chip" not in land43["all"] and 'data-action="land-home-filter"' not in land43["all"] and 'data-action="land-buff-filter"' not in land43["all"], "섹션 필터 칩(3층 내비) 제거")
    ok('data-action="land-hold-all"' in land43["market"] and land43["shown"] == 6 and land43["open"] == 12, "매물 탭 보유 12곳 중 6곳만 보이고 펼치기 토글로 전체", json.dumps({"shown": land43["shown"], "open": land43["open"]}))
    ok(all(x in land43["market"] for x in ['id="landSearch"', 'data-action="land-tier"', 'data-action="land-sort"', "229", "landList", "보유 매물"]), "매물 탭 — 보유 매물 + 229개 지역 검색·필터·정렬 목록")
    ok(all(x in land43["event"] for x in ["급매 경매", "지정가 예약", "영지 은행", "영지 성채", "전국 메가 프로젝트", "거래 기록"]), "이벤트 탭 — 경매·지정가·은행·성채·메가·거래 기록")
    ok('class="subtab active" type="button" role="tab" aria-selected="true" data-action="land-sub" data-value="home"' in land43["fallback"], "잘못된 서브 값은 영지로 복구")
    ok(land43["bad"] is False, "v4.3 부동산 템플릿에 undefined/NaN 누출 없음")
    ok(land43["badges"]["home"] == 1 and land43["badges"]["event"] >= 0 and land43["badges"]["market"] == 0, "미수령 임대수익 → 영지 배지 · 진화/파견 → 이벤트 배지", json.dumps(land43["badges"]))

    landbadge = js(ctx2, """
      const fresh = defaultState(0);
      const mk = (s) => ({ s, battle: { stats: calcStats(s, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: computeBuffs(s, 0) }, logs: [], tab: 'land', el: {}, install: { hidden: true } });
      const zero = __lbadges(mk(fresh));
      const s2 = defaultState(0);
      const cheap = CITIES.slice().sort((a, b) => a.base - b.base)[0];
      s2.land.owned[cheap.key] = 3;
      s2.land.accruedRent = 1; // 2분치에 한참 못 미치는 금액
      const tiny = __lbadges(mk(s2));
      s2.land.accruedRent = 5000;
      const ready = __lbadges(mk(s2));
      return { zero, tiny, ready };
    """)
    ok(landbadge["zero"] == {"home": 0, "market": 0, "event": 0}, "새 게임: 부동산 배지 없음", json.dumps(landbadge["zero"]))
    ok(landbadge["tiny"]["home"] == 0 and landbadge["ready"]["home"] == 1, "2분치 미만은 점등하지 않는다(상시 점등 방지)", json.dumps(landbadge))

    # ── 2) 부동산 서브 탭 상태·배지 배선 ──
    usrc43 = read("src/ui.js")
    asrc43 = read("app.js")
    stsrc43 = read("src/state.js")
    idxsrc43 = read("index.html")
    ok(all(x in usrc43 for x in ["LAND_SUBS", "landSubOf", "landBadges", "landSummaryBar", "newsSlim", "syncLandBadges", "case 'land-hold-all'"]), "ui.js — 부동산 서브 탭·요약 바·배지 구현")
    ok("this.s.land.sub = ok.includes(want) ? want : 'home'" in usrc43 and "const ok = LAND_SUBS.map(([k]) => k)" in usrc43 and "sub === 'buff' ? 'event' : sub" in usrc43, "서브 탭 전환은 기존 저장 필드(land.sub)만 쓴다('buff'→'event' 마이그레이션)")
    ok('id="landTabDot"' in idxsrc43 and 'data-tab="land"' in idxsrc43, "하단 부동산 탭 알림 점 요소")
    ok("['home', 'market', 'event'].includes(landSub)" in asrc43 and "qs.get('tab') === 'land'" in asrc43, "?tab=land&sub=market 바로가기 지원")
    ok(all(x in stsrc43 for x in ["screenShake: true", "s.screenShake = s.screenShake !== false"]), "state.js — 화면 흔들림 설정 기본값·정규화")
    shake_nv = js(ctx, """
      return {
        def: defaultState(0).screenShake,
        off: normalizeState({ screenShake: false }).screenShake,
        on: normalizeState({ screenShake: true }).screenShake,
        junk: normalizeState({ screenShake: 'no' }).screenShake,
      };
    """)
    ok(shake_nv["def"] is True and shake_nv["off"] is False and shake_nv["on"] is True and shake_nv["junk"] is True, "화면 흔들림 저장 호환(끈 상태 유지·손상 값은 켜짐)", json.dumps(shake_nv))

    # ── 3) 부활 가호 — 3.5초 · 피해 60% 경감 (실제 전투) ──
    grace = js(ctx, """
      const s = defaultState(0);
      s.level = 30; s.stage = 10; s.maxStage = 10; s.equip = { weapon: 0, armor: 0, helmet: 0, ring: 0, amulet: 0 };
      const b = new Battle(s, () => ({}), () => 0.5, 0);
      b.player.hp = 10;
      b.damagePlayer(9999, { ko: '테스트' }, 0, {});
      const reviveAt = b.player.reviveAt;
      const deadHp = b.player.hp;
      b.player.reviveAt = 0;
      b.tick(16, 1);
      const evs = b.drainEvents().filter((e) => e.t === 'revive');
      const graceMs = b.player.graceUntil - 1;
      const hpAtRevive = b.player.hp;
      const before = b.player.hp;
      b.damagePlayer(100, { ko: '테스트' }, 2, {});
      const dmgGrace = before - b.player.hp;
      b.player.graceUntil = 0;
      const hp2 = b.player.hp;
      b.damagePlayer(100, { ko: '테스트' }, 999999, {});
      const dmgPlain = hp2 - b.player.hp;
      return { constMs: ECON.reviveGraceMs, reduce: ECON.reviveGraceReduce, reviveMs: reviveAt, graceMs, deadHp,
               hpAtRevive, maxHp: Math.round(b.stats.hpMax), dmgGrace, dmgPlain,
               ev: evs[0] || null, evCount: evs.length };
    """)
    ok(grace["constMs"] == 3500 and grace["reduce"] == 0.4 and grace["reviveMs"] == 3000, "부활 대기 3초 · 가호 3.5초 · 경감 60% 상수", json.dumps({k: grace[k] for k in ["constMs", "reduce", "reviveMs"]}))
    ok(grace["graceMs"] == 3500 and grace["evCount"] == 1 and grace["ev"]["graceMs"] == 3500 and grace["ev"]["reducePct"] == 60, "부활 시 3.5초 가호 + 이벤트에 지속·경감률 전달", json.dumps(grace["ev"]))
    ok(grace["hpAtRevive"] == grace["maxHp"] // 2 and grace["dmgGrace"] * 2.5 == grace["dmgPlain"], "가호 중 피해가 정확히 40%(100 → 40) — 화면 표시와 실제 피해 일치", json.dumps({"grace": grace["dmgGrace"], "plain": grace["dmgPlain"], "hp": grace["hpAtRevive"]}))

    # ── 4) 전투 연출 — 보스 등장 · 가호 표시 · 타격감 ──
    rsrc43 = read("src/render.js")
    csrc43 = read("src/combat.js")
    ok(all(x in csrc43 for x in ["ECON.reviveGraceMs", "ECON.reviveGraceReduce"]), "combat.js — 가호 상수를 ECON 에서 읽는다(연출·검증과 한 곳)")
    ok(all(x in rsrc43 for x in ["drawGrace", "drawGraceBanner", "drawImpacts", "addImpact", "ECON.reviveGraceMs", "ECON.reviveGraceReduce"]), "render.js — 가호 보호막·빛 고리·상단 배너·타격 임팩트")
    boss_alert = rsrc43[rsrc43.index("BOSS APPEAR"):rsrc43.index("drawAura(ctx, px, gy, h, sc, now)")]
    ok(all(x in boss_alert for x in ["const DUR = 2400", "bossName", "⏱", "제한", "rgba(180,0,20", "26)"]), "보스 등장 배너 — 경고 띠·비네트·보스 이름·제한 시간(2.4초)", str(len(boss_alert)))
    ok("this.bossAlert = now" in rsrc43 and "this.bossRoar" in rsrc43 and "this.redFlash = Math.max(this.redFlash, 0.3)" in rsrc43, "보스 등장 시 붉은 플래시·충격파·포효 연출", "")
    ok(all(x in rsrc43 for x in ["if (this.shake > 0.15 && this.shakeOn)", "ECON.shakeMax", "ECON.shakeTrim"]), "화면 흔들림 상한·감쇠 + 설정(shakOn) 반영")
    ok("this.impacts.length > 16" in rsrc43 and "globalCompositeOperation = 'lighter'" in rsrc43, "타격 임팩트는 최대 16개(가벼운 렌더) · 가산 합성")
    ok("bossHit ? 1.28 : 1" in rsrc43 and "addFloater(ev.x, ev.dmg, ev.crit, ev.kind, null, bossHit ? 1.28 : 1, now)" in rsrc43, "보스 타격 — 피해 숫자 1.28배 강조")
    ok(all(x in rsrc43 for x in ["this.shake = Math.max(this.shake, bossHit ? 2.2 : 1.2)", "bossHit ? 7 : 5.4"]), "일반 타격 흔들림 완화 · 치명타·보스만 강하게(과하지 않게)")
    ok("this.impacts = [];" in rsrc43 and "this.drawImpacts(ctx, t)" in rsrc43 and "this.drawGraceBanner(ctx, W, t)" in rsrc43, "프레임 루프에 임팩트·가호 배너 연결", "")
    ok(all(x in rsrc43 for x in ["🛡 부활 가호 · 피해", "경감", "toFixed(1)}초"]), "가호 상단 배너 문구(피해 경감률·남은 초)", "")
    ok("const DUR = 2400" in rsrc43 and "this.bossAlert = 0" in rsrc43, "보스 배너 종료 시 상태 정리", "")

    stsrc43x = read("src/state.js")
    ok("screenShake" in stsrc43x and "effects: true" in stsrc43x, "설정 기본값(이펙트·흔들림)", "")
    ok("toggleShake" in asrc43 and "renderer.shakeOn" in asrc43 and "case 'toggle-shake'" in usrc43, "설정 토글 — 화면 흔들림만 끄기(app.js·ui.js)")
    ok("화면 흔들림" in usrc43 + read("src/ui-settings.js") and 'data-action="toggle-shake"' in usrc43 + read("src/ui-settings.js"), "설정 탭에 화면 흔들림 스위치", "")

    # ── 5) 접근성 — 캔버스 연출을 스크린리더에도 ──
    ok('id="srLive"' in idxsrc43 and "aria-live=\"assertive\"" in idxsrc43, "스크린리더 라이브 영역(index.html)")
    ok("announce(text)" in usrc43 and "srLive" in usrc43, "ui.js — announce() 구현")
    ok(all(x in asrc43 for x in ["ui.announce(`보스 등장", "ui.announce('전투 불능", "ui.announce(`부활"]) and "ev.reducePct" in asrc43, "app.js — 보스 등장·전투 불능·부활 가호를 음성/스크린리더로도 알림")
    ok(".sr-only" in read("style.css"), "style.css — .sr-only(화면 밖 전용)")

    css43 = read("style.css")
    ok(all(x in css43 for x in [".land-sum", ".ls-v", ".ls-claim", ".news-slim", ".ns-title", ".land-subbar", ".land-rec", ".buff-now"]), "style.css — v4.3 부동산 요약 바·압축 뉴스·서브 탭", "")
    ok(f"land-rpg-v{EXPECTED_VER}" in read("sw.js") and f"'{EXPECTED_VER}'" in read("src/data.js"), f"버전·캐시 v{EXPECTED_VER}", "")

    section("[20] ⚔️ v4.4 S31+ 무한 구간 리밸런싱 · 강화석 대량 교환 · 상위 전직")

    # ── 1) 성장률 ──
    inf44 = js(ctx, """
      const legacyHp = (s) => {
        const late = 1 + Math.max(0, s - 10) * ECON.monsterHpLateBoost;
        return ECON.monsterHpBase * Math.pow(ECON.monsterHpGrowth, s - 1) * late;
      };
      const legacyAtk = (s) => {
        const late = 1 + Math.min(ECON.monsterAtkLateBoost * Math.max(0, s - ECON.monsterAtkLateFrom), 1.6);
        return ECON.monsterAtkBase * Math.pow(ECON.monsterAtkGrowth, s - 1) * late;
      };
      const diff = [];
      for (let st = 1; st <= 30; st++) {
        if (Math.round(monsterBaseHp(st)) !== Math.round(legacyHp(st))) diff.push('hp' + st);
        if (Math.round(monsterBaseAtk(st)) !== Math.round(legacyAtk(st))) diff.push('atk' + st);
        if (Math.round(stageGoldBase(st)) !== Math.round(ECON.goldBase * Math.pow(ECON.goldGrowth, st - 1))) diff.push('g' + st);
        if (Math.round(stageExpBase(st)) !== Math.round(ECON.expBase * Math.pow(ECON.expGrowth, st - 1))) diff.push('e' + st);
      }
      const r = (f, a, b) => f(b) / f(a);
      return {
        diff,
        g: [INFINITE.hpGrowth, INFINITE.atkGrowth, INFINITE.goldGrowth, INFINITE.expGrowth],
        ratios: [r(monsterBaseHp, 30, 31), r(monsterBaseAtk, 30, 31), r(stageGoldBase, 30, 31), r(stageExpBase, 30, 31)],
        hp: [30, 31, 35, 40, 45, 50].map(st => Math.round(monsterBaseHp(st))),
        s45: r(monsterBaseHp, 30, 45), s60: r(monsterBaseHp, 30, 60),
        hard: monsterBaseHp(31) > monsterBaseHp(30) * 1.07 && monsterBaseAtk(31) > monsterBaseAtk(30) * 1.04,
      };
    """)
    ok(inf44["diff"] == [], "S1~30 몬스터·골드·경험치가 v4.3과 완전히 동일(회귀 없음)", json.dumps(inf44["diff"]))
    ok(inf44["g"] == [1.08, 1.05, 1.075, 1.055], "S31+ 성장률 상향 — 체력 ×1.08 · 공격 ×1.05 · 골드 ×1.075 · 경험치 ×1.055", json.dumps(inf44["g"]))
    ok(all(abs(inf44["ratios"][i] - inf44["g"][i]) < 0.0001 for i in range(4)) and inf44["hard"], "S31 진입부터 새 성장률이 그대로 적용", json.dumps({"r": inf44["ratios"], "g": json.dumps(inf44['g'])}))
    ok(abs(inf44["s45"] - math.pow(1.08, 15)) < 0.01 and abs(inf44["s60"] - math.pow(1.08, 30)) < 0.05, "S45 체력 ×3.17 · S60 ×10.06 (S30 대비) — 후반일수록 벽", json.dumps({"s45": round(inf44["s45"], 2), "s60": round(inf44["s60"], 2)}))

    # ── 2) 실제 전투: 긴장감 · v4.3 대비 확실히 어려워졌는가 ──
    V44_BUILD = """
      const s = defaultState(0);
      s.level = 55; s.stage = 31; s.maxStage = 31;
      s.gearRarity = { weapon: 'legend', armor: 'hero', helmet: 'hero', ring: 'rare', amulet: 'rare' };
      s.equip = { weapon: 40, armor: 30, helmet: 25, ring: 20, amulet: 20 };
      s.jobTier = 3;
      s.pet = { equipped: 'wolf', unlocked: ['wolf'], chosen: true, levels: { wolf: 10 }, evo: { wolf: 2 } };
      s.rebirth = { count: 2, points: 0, totalPoints: 120, traits: { atk: 8, hp: 6 }, bestStage: 31, at: 0 };
      for (const c of CITIES.slice().sort((a, b) => a.base - b.base).slice(0, 8)) s.land.owned[c.key] = 30;
    """
    V44_SIM = """
      (function (hpG, atkG, goldG, expG, mins) {
        INFINITE.hpGrowth = hpG; INFINITE.atkGrowth = atkG;
        INFINITE.goldGrowth = goldG; INFINITE.expGrowth = expG;
        const rng = (function (seed) { let x = seed; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; })(21);
        __BUILD__
        const buffs = computeBuffs(s, 0);
        const b = new Battle(s, () => buffs, rng, 0);
        let t = 0, clears = 0, fails = 0, deaths = 0;
        for (let i = 0; i < mins * 60 * 20; i++) {
          t += 50; b.tick(50, t);
          for (const ev of b.drainEvents()) {
            if (ev.t === 'stageClear') clears++;
            else if (ev.t === 'bossFail') fails++;
            else if (ev.t === 'playerDeath') deaths++;
          }
        }
        return { stage: s.stage, clears, fails, deaths, atk: calcStats(s, buffs).atk, hp: calcStats(s, buffs).hpMax };
      })
    """.replace("__BUILD__", V44_BUILD)
    new_curve = js(ctx, "return " + V44_SIM.strip() + "(INFINITE.hpGrowth, INFINITE.atkGrowth, INFINITE.goldGrowth, INFINITE.expGrowth, 30)")
    ctx3 = quickjs.Context()
    ctx3.eval(bundle(FILES))
    old_curve = json.loads(ctx3.eval("JSON.stringify(" + V44_SIM + "(1.035, 1.028, 1.06, 1.04, 30))"))
    ok(new_curve["stage"] >= 45 and new_curve["clears"] >= 10, "v4.4 곡선에서도 S31+ 를 계속 밀고 올라간다(3단계 빌드·30분)", json.dumps(new_curve))
    ok(new_curve["fails"] + new_curve["deaths"] > 0, "S31+ 에 긴장감 — 보스 실패·사망이 실제로 발생", json.dumps(new_curve))
    ok(new_curve["stage"] <= old_curve["stage"] - 8, "같은 빌드·같은 시간에 v4.3보다 확실히 느리다(완만함 해소)", json.dumps({"v44": new_curve["stage"], "v43": old_curve["stage"]}, ensure_ascii=False))

    # ── 3) 강화석 대량 교환 ──
    exch = js(ctx, """
      const s = defaultState(0);
      s.stage = 30;
      const price = shardPrice(s);
      s.gold = price * 250 + 7;
      const max = maxShardsBuy(s);
      const counts = [shardBuyCount(s, 1), shardBuyCount(s, '10'), shardBuyCount(s, '100'), shardBuyCount(s, 'max'), shardBuyCount(s, 0), shardBuyCount(s, 'x')];
      const shards0 = s.shards, gold0 = s.gold;
      const r10 = exchangeShards(s, '10');
      const afterTen = { gold: s.gold, shards: s.shards, n: r10.n, cost: r10.cost, short: r10.short };
      const poor = defaultState(0); poor.gold = 5; poor.shards = 3;
      const rp = exchangeShards(poor, '100');
      const mid = defaultState(0); mid.stage = 30; mid.gold = price * 40; mid.shards = 0;
      const r100 = exchangeShards(mid, 100);
      const rmax = exchangeShards(mid, 'max');
      const rmax2 = exchangeShards(mid, 'max');
      const capMax = exchangeShards(s, 'max');   // 250 - 10 = 240개 살 수 있는 골드
      return {
        bulk: SHARD_BULK, price, max, counts, gold0, shards0,
        afterTen, ok10: r10.ok,
        rp: { ok: rp.ok, gold: poor.gold, shards: poor.shards, n: rp.n },
        r100: { ok: r100.ok, n: r100.n, want: r100.want, short: r100.short, gold: mid.gold, shards: mid.shards },
        rmax: { ok: rmax.ok, n: rmax.n }, rmax2: { ok: rmax2.ok },
        capMax: { ok: capMax.ok, n: capMax.n, gold: s.gold, shards: s.shards, price },
      };
    """)
    ok(exch["bulk"] == [1, 10, 100], "교환 단위 ×1 · ×10 · ×100", json.dumps(exch["bulk"]))
    ok(exch["max"] == 250 and exch["counts"] == [1, 10, 100, 250, 0, 0], "최대 = 보유 골드 / 시세 · 잘못된 모드 0", json.dumps({"max": exch["max"], "c": exch["counts"]}))
    ok(exch["ok10"] is True and exch["afterTen"]["n"] == 10 and exch["afterTen"]["gold"] == exch["gold0"] - exch["price"] * 10 and exch["afterTen"]["shards"] == exch["shards0"] + 10, "×10 교환 — 골드 차감·강화석 증가", json.dumps(exch["afterTen"]))
    ok(exch["rp"]["ok"] is False and exch["rp"]["gold"] == 5 and exch["rp"]["shards"] == 3, "골드 부족 시 거부(상태 불변)", json.dumps(exch["rp"]))
    ok(exch["r100"]["ok"] is True and exch["r100"]["n"] == 40 and exch["r100"]["want"] == 100 and exch["r100"]["short"] is True and exch["r100"]["gold"] == 0, "×100 요청에 골드가 모자라면 살 수 있는 만큼만(40) · short 표시", json.dumps(exch["r100"]))
    ok(exch["rmax"]["ok"] is False and exch["rmax"]["n"] == 0 and exch["rmax2"]["ok"] is False and exch["capMax"]["n"] == 240 and exch["capMax"]["gold"] == 7, "최대 교환은 남은 골드까지만 · 골드 소진 뒤엔 거부", json.dumps({"n": exch["capMax"]["n"], "left": exch["capMax"]["gold"], "again": exch["rmax2"]["ok"]}))

    tpl44 = js(ctx2, """
      const s = defaultState(0);
      s.stage = 30;
      const price = shardPrice(s);
      s.gold = price * 120;
      const ui = { s, battle: { stats: calcStats(s, computeBuffs(s, 0)), def: stageDef(30), boss: null, dungeon: null, player: { hp: 1 } },
        app: { buffs: computeBuffs(s, 0) }, logs: [], tab: 'gear', el: {}, install: { hidden: true } };
      const rich = __tpls.gear(ui);
      const poorS = defaultState(0); poorS.stage = 30; poorS.gold = shardPrice(poorS) * 5;
      const ui2 = { ...ui, s: poorS, battle: { ...ui.battle, stats: calcStats(poorS, {}) } };
      const poor = __tpls.gear(ui2);
      return {
        rich, poor,
        has1: rich.includes('data-value="1"'), has10: rich.includes('data-value="10"'),
        has100: rich.includes('data-value="100"'), hasMax: rich.includes('data-value="max"'),
        maxText: rich.includes('최대 <b>120</b>개'), poor100off: poor.includes('data-value="100" disabled'),
        bad: rich.includes('undefined') || rich.includes('NaN') || poor.includes('undefined') || poor.includes('NaN'),
      };
    """)
    ok(tpl44["has1"] and tpl44["has10"] and tpl44["has100"] and tpl44["hasMax"] and "×1" in tpl44["rich"] and "×100" in tpl44["rich"], "강화석 교환 UI — ×1 · ×10 · ×100 · 최대 버튼", json.dumps({k: tpl44[k] for k in ["has1", "has10", "has100", "hasMax"]}))
    ok(tpl44["maxText"] and "교환 가능" in tpl44["rich"], "보유 골드 기준 최대 교환 개수 안내", "")
    ok(tpl44["poor100off"] is True, "골드가 모자란 단위는 비활성(disabled)", "")
    ok(tpl44["bad"] is False, "교환 카드에 undefined/NaN 누출 없음", "")

    # ── 4) 상위 전직 연출·UI·저장 ──
    rsrc44 = read("src/render.js")
    ok(all(x in rsrc44 for x in ["drawJobAura", "syncJob", "isUpperJob", "setLineDash"]), "render.js — 전직 오라(문양·빛기둥·후광) 구현", "")
    player_part = rsrc44[rsrc44.index("drawPlayer(ctx, now, dt)"):rsrc44.index("── 검기 아크 ──", rsrc44.index("drawPlayer(ctx, now, dt)"))]
    ok(player_part.index("this.drawJobAura(") < player_part.index("this.drawAura("), "전직 오라는 장비 등급 오라보다 아래층에 그린다(색 구분)", "")
    aura_body = rsrc44[rsrc44.index("drawJobAura(ctx, px, gy, h, sc, now) {"):rsrc44.index("  groundY() {")]
    ok("globalCompositeOperation = 'lighter'" in aura_body and "ellipse" in aura_body and "createLinearGradient" in aura_body, "전직 오라 — 가산 합성·문양·빛기둥으로 캐릭터를 해치지 않는다", "")
    usrc44 = read("src/ui.js")
    ok(all(x in usrc44 for x in ["JOB_COUNT", "isUpperJob", "상위 전직", "job-badge", "' hi' : ''", "promote-btn"]) and "/4" not in usrc44, "ui.js — 전직 카드 단계 표기 6단계·상위 전직 강조", "")
    asrc44 = read("app.js")
    ok(all(x in asrc44 for x in ["exchangeShards", "buyShards:", "JOB_COUNT", "isUpperJob"]), "app.js — 교환 액션·전직 모달 6단계 연결", "")
    ok("${JOB_COUNT}" in asrc44 and "상위 전직" in asrc44, "전직 모달 — n/6 표기와 상위 전직 안내", "")
    css44 = read("style.css")
    ok(all(x in css44 for x in [".chip.xchg", ".xchg-row", ".job-card.top", ".promote-btn.upper"]), "style.css — 교환 버튼·상위 전직 카드 스타일", "")

    job44 = js(ctx, """
      const keep4 = normalizeState({ ver: 3, jobTier: 4, level: 70, maxStage: 33, gold: 10 }, 0);
      const keep5 = normalizeState({ ver: 3, jobTier: 5, level: 90, maxStage: 41, gold: 10 }, 0);
      const over = normalizeState({ ver: 3, jobTier: 99, gold: 10 }, 0);
      const junk = normalizeState({ ver: 3, jobTier: 'dragon', gold: 10 }, 0);
      const old3 = normalizeState({ ver: 3, jobTier: 3, level: 52, maxStage: 27, gold: 10 }, 0);
      const st4 = calcStats({ ...defaultState(0), level: 70, jobTier: 4 }, {});
      const st3 = calcStats({ ...defaultState(0), level: 70, jobTier: 3 }, {});
      return { keep4: keep4.jobTier, keep5: keep5.jobTier, over: over.jobTier, junk: junk.jobTier, old3: old3.jobTier,
        name4: jobOf(keep4).name, name5: jobOf(keep5).name, atk3: st3.atk, atk4: st4.atk,
        hp3: st3.hpMax, hp4: st4.hpMax, peak: keep4.records.peakJobTier };
    """)
    ok(job44["keep4"] == 4 and job44["keep5"] == 5 and job44["over"] == 5 and job44["junk"] == 0 and job44["old3"] == 3, "저장 호환 — jobTier 0~5 보존·상한 정리", json.dumps({k: job44[k] for k in ["keep4", "keep5", "over", "junk", "old3"]}))
    ok(job44["name4"] == "드래곤 로드" and job44["name5"] == "용신", "저장본의 상위 전직 칭호가 그대로 복원", json.dumps({"n4": job44["name4"], "n5": job44["name5"]}, ensure_ascii=False))
    ok(job44["atk4"] > job44["atk3"] * 1.26 and job44["hp4"] > job44["hp3"] * 1.2 and job44["peak"] == 4, "상위 전직 배율이 실제 스탯·역대 기록에 반영", json.dumps({k: job44[k] for k in ["atk3", "atk4", "hp3", "hp4", "peak"]}))

    section("[21] 🗼 v4.5 도전의 탑 무한 확장 · 🌟 일일 보스")
    tw45 = js(ctx, """
      const RNG=(seed)=>{let x=seed;return function(){x=(x*1664525+1013904223)>>>0;return x/4294967296;};};
      const clearedTo = (n) => Array.from({length:n}, (_, i) => i + 1);
      function mk(clearedUpto, opts) {
        opts = opts || {};
        const s = defaultState(0);
        s.level = opts.level || 40;
        s.stage = opts.stage || 24;
        s.maxStage = opts.maxStage || 30;
        const q = opts.eq == null ? 40 : opts.eq;
        const r = opts.rar || 'legend';
        s.equip = { weapon:q, armor:q, helmet:q, ring:q, amulet:q };
        s.gearRarity = { weapon:r, armor:r, helmet:r, ring:r, amulet:r };
        s.tower = { cleared: clearedTo(clearedUpto), best: clearedUpto, runs: 0, fails: 0, last: null,
                    sweep: { date: '', floor: 0, gold: 0, shards: 0, at: 0 } };
        const b = new Battle(s, () => ({}), RNG(opts.seed || 7), 0);
        return { s, b };
      }
      function runTower(floor, opts, ticks) {
        const { s, b } = mk(floor - 1, opts);
        const r0 = b.startTower(floor, 1000);
        const gold0 = s.gold, shards0 = s.shards, items0 = s.gear.items.length;
        let t = 1000, ev = null, minPct = 100;
        for (let i = 0; i < (ticks || 2600); i++) {
          t += 50; b.tick(50, t);
          for (const e of b.drainEvents()) if (e.t === 'towerEnd') ev = e;
          if (b.tower) minPct = Math.min(minPct, 100 * b.player.hp / b.stats.hpMax);
          if (ev) break;
        }
        return {
          ok: r0.ok, how: s.tower.last && s.tower.last.how, first: ev && ev.first, next: ev && ev.next,
          points: ev && ev.points, item: ev && ev.item && ev.item.rarity, gold: ev && ev.gold,
          goldGain: s.gold - gold0, shardsGain: s.shards - shards0, itemsDelta: s.gear.items.length - items0,
          clearedTail: s.tower.cleared.slice(-2), best: s.tower.best, minPct: Math.round(minPct),
          retryNext: (function(){ try { return b.startTower(ev ? ev.next : floor, t + 1000).ok; } catch (e) { return false; } })(),
        };
      }

      const defs = [11, 12, 15, 20, 25, 50, 100, 200].map((n) => {
        const f = towerFloor(n);
        return {
          n, name: f.name, deep: !!f.deep, themeOk: THEMES.some((t) => t.id === f.theme),
          gims: f.gimmicks.length, bossOnly: !!f.bossOnly, boss: !!f.boss, mins: f.minStage,
          atk: f.atkOfHp, killSec: f.killSec, goal: f.goal, limit: Math.round(f.timeLimitMs / 1000),
          goldMul: f.reward.goldMul, shards: f.reward.shards, points: f.reward.points, item: f.reward.item || null,
        };
      });
      const edge = { f201: towerFloor(201), f0: towerFloor(0), f10deep: !!towerFloor(10).deep, max: TOWER_MAX_FLOOR, fixed: TOWER_FIXED_FLOOR };
      const gimSet = new Set();
      for (let n = 11; n <= 22; n++) for (const g of towerFloor(n).gimmicks) gimSet.add(g);
      const scaling = [11, 16, 21, 31, 51, 101].map((n) => ({ n, atk: towerFloor(n).atkOfHp, gold: towerFloor(n).reward.goldMul, kill: towerFloor(n).killSec, limit: Math.round(towerFloor(n).timeLimitMs / 1000) }));

      const gate = (function () {
        const s = defaultState(0);
        s.maxStage = 24; s.tower.cleared = clearedTo(10); s.tower.best = 10;
        const a = { f11: towerUnlocked(s, 11), f12: towerUnlocked(s, 12), why12: towerLockReason(s, 12) };
        s.tower.cleared = clearedTo(11); s.tower.best = 11;
        const b = { f12: towerUnlocked(s, 12), f13: towerUnlocked(s, 13) };
        const low = defaultState(0);
        low.maxStage = 20; low.tower.cleared = clearedTo(10); low.tower.best = 10;
        const c = { f11: towerUnlocked(low, 11), why: towerLockReason(low, 11) };
        return { a, b, c };
      })();

      const st = defaultState(0); st.stage = 24;
      const r10 = towerReward(st, 10, { first: true, rng: () => 0.5 });
      const r11 = towerReward(st, 11, { first: true, rng: () => 0.5 });
      const r11again = towerReward(st, 11, { first: false, rng: () => 0.5 });
      const r15 = towerReward(st, 15, { first: true, rng: () => 0.5 });
      const r20 = towerReward(st, 20, { first: true, rng: () => 0.5 });
      const r101 = towerReward(st, 101, { first: true, rng: () => 0.5 });
      const rewardText = towerRewardText(st, 15);
      const stageDef11 = towerStageDef(11);
      const progress = (function () {
        const s = defaultState(0); s.maxStage = 24; s.tower.cleared = clearedTo(13); s.tower.best = 13;
        const p = towerProgress(s);
        return { best: p.best, deep: p.deep, next: p.next, max: p.max, fixed: p.fixed, clearedCount: p.clearedCount };
      })();

      const c11 = runTower(11, { seed: 7 }, 2600);
      const c15 = runTower(15, { seed: 7 }, 3000);
      const c101 = runTower(101, { seed: 7, level: 60, stage: 30, maxStage: 34 }, 2000);

      // ── 일일 보스 ──
      const T0 = Date.UTC(2026, 10, 25, 5, 0, 0); // 2026-11-25 14:00 KST
      const keyA = kstDateKey(Date.UTC(2026, 10, 24, 14, 59, 59)); // KST 23:59:59
      const keyB = kstDateKey(Date.UTC(2026, 10, 24, 15, 0, 0));   // KST 다음 날 00:00
      const reset1 = kstResetMs(Date.UTC(2026, 10, 24, 14, 59, 59));
      const reset2 = kstResetMs(T0);
      const fresh = dailyInfo(defaultState(0), T0);
      const gradeIds = [dailyGradeAt(1.7).id, dailyGradeAt(1.3).id, dailyGradeAt(1.0).id, dailyGradeAt(0.7).id, dailyGradeAt(0.1).id];
      const ds0 = defaultState(0); ds0.stage = 24;
      const dS = dailyReward(ds0, { dmg: 0, dps: 1000, ratio: 1.6 }, () => 0.5);
      const dA = dailyReward(ds0, { dmg: 0, dps: 1000, ratio: 1.3 }, () => 0.5);
      const dC = dailyReward(ds0, { dmg: 0, dps: 1000, ratio: 0.7 }, () => 0.5);
      const dD = dailyReward(ds0, { dmg: 0, dps: 1000, ratio: 0.05 }, () => 0.5);

      function mkDaily(opts) {
        opts = opts || {};
        const { s, b } = mk(0, opts);
        const r0 = b.startDailyBoss(opts.now || T0);
        return { s, b, r0 };
      }
      const st1 = mkDaily({});
      const entry = {
        ok: st1.r0.ok, left0: dailyInfo(st1.s, T0).left, used: st1.s.dailyBoss.used,
        ko: st1.r0.boss && st1.r0.boss.ko, title: st1.r0.boss && st1.r0.boss.title, theme: st1.b.def.theme.id,
        themeName: st1.b.def.themeName, monsters: st1.b.monsters.length, bossIsBoss: !!(st1.b.daily && st1.b.daily.boss.isBoss),
        bossHp: st1.b.daily && st1.b.daily.boss.maxHp, dps: st1.b.stats.dps, hpFull: st1.b.player.hp === st1.b.stats.hpMax,
        towerReject: st1.b.startTower(1, T0).ok, dunReject: st1.b.startDungeon(T0).ok, bossReject: st1.b.challengeBoss(T0),
        starts: st1.b.drainEvents().filter((e) => e.t === 'dailyStart').length,
      };
      // 한 판 끝까지(30초) — 자동 전투로 피해가 쌓이고 등급·보상이 나온다
      function playDaily(opts) {
        const { s, b, r0 } = mkDaily(opts || {});
        let t = (opts && opts.now) || T0, ev = null;
        const gold0 = s.gold, shards0 = s.shards;
        for (let i = 0; i < 900; i++) {
          t += 50; b.tick(50, t);
          for (const e of b.drainEvents()) if (e.t === 'dailyEnd') ev = e;
          if (ev) break;
        }
        return {
          ok: r0.ok, ev: ev, dmg: ev && ev.dmg, grade: ev && ev.grade, ratio: ev && ev.ratio,
          goldGain: s.gold - gold0, shardsGain: s.shards - shards0, points: ev && ev.points,
          used: s.dailyBoss.used, left: dailyInfo(s, t).left, best: s.dailyBoss.best, bestGrade: s.dailyBoss.bestGrade,
          isBest: ev && ev.isBest, stage: s.stage, monsters: b.monsters.length, dailyNull: b.daily === null,
          themeBack: b.def.theme.id,
          secondOk: (function(){ try { const r = b.startDailyBoss(t + 1000); if (r.ok) b.endDailyBoss(t + 1100, 'timeout'); return r.ok; } catch (e) { return false; } })(),
          third: (function(){ try { return b.startDailyBoss(t + 1000).ok; } catch (e) { return false; } })(),
          thirdReason: (function(){ try { return b.startDailyBoss(t + 1000).reason; } catch (e) { return String(e); } })(),
        };
      }
      const play1 = playDaily({});
      const play2 = playDaily({});
      // 쓰러지면 그때까지의 피해로 종료(보상 지급)
      const deadRun = (function () {
        const { s, b } = mkDaily({});
        b.daily.dmg = 5000;
        b.damagePlayer(1e9, { ko: '테스트' }, T0 + 1000);
        const ev = b.drainEvents().filter((e) => e.t === 'dailyEnd')[0];
        return { how: ev && ev.how, dmg: ev && ev.dmg, gold: ev && ev.gold, grade: ev && ev.grade, dailyNull: b.daily === null };
      })();

      const resetState = {
        stale: normalizeDailyState({ date: '2026-01-01', used: 2, best: 12345, bestGrade: 'A', runs: 9, last: { at: 5, dmg: 12345, grade: 'A', gold: 10, shards: 3, points: 1, ratio: 1.3 } }, T0),
        same: normalizeDailyState({ date: kstDateKey(T0), used: 1, best: 900, bestGrade: 'B' }, T0),
        junk: normalizeDailyState({ date: kstDateKey(T0), used: 99, best: -5, bestGrade: 'Z', last: { grade: 'Z' } }, T0),
        none: normalizeDailyState(null, T0),
      };

      // ── 일일 소탕 ──
      const sweepState = (function () {
        const s = defaultState(0); s.stage = 24; s.tower.cleared = clearedTo(12); s.tower.best = 12;
        const before = { gold: s.gold, shards: s.shards };
        const info0 = towerSweepInfo(s, T0);
        const c1 = towerSweepClaim(s, T0);
        const gainGold = s.gold - before.gold;
        const info1 = towerSweepInfo(s, T0);
        const c2 = towerSweepClaim(s, T0);
        const c3 = towerSweepClaim(s, T0 + 86400000);
        const info2 = towerSweepInfo(s, T0 + 86400000);
        const first = towerReward(s, 12, { first: true, rng: () => 0.5 });
        return {
          available: info0.available, floor: info0.floor, ok: c1.ok, gold: c1.gold, shards: c1.shards,
          gainGold, claimed: info1.claimed, availableAfter: info1.available,
          again: c2.ok, nextDay: c3.ok, nextClaimed: info2.claimed, firstGold: first.gold, firstShards: first.shards,
          text: towerSweepText(s),
        };
      })();
      const emptySweep = (function () {
        const s = defaultState(0);
        return { available: towerSweepInfo(s, T0).available, claim: towerSweepClaim(s, T0).ok };
      })();

      // ── 세이브 호환 ──
      const oldSave = normalizeState({ ver: 3, level: 30, stage: 24, maxStage: 30,
        tower: { cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], best: 13, runs: 7, fails: 2, last: null },
        dungeon: { best: 100, runs: 1, last: null } }, T0);
      const junkTower = normalizeTowerState({ cleared: [1, 1, 11, 11, 201, -2, '13'], best: 999, sweep: { date: 5, floor: '12', gold: -3 } });

      return { defs, edge, gimSet: [...gimSet], scaling, gate, r10, r11, r11again, r15, r20, r101, rewardText,
               stageDef11: { name: stageDef11.themeName, theme: stageDef11.theme.id, tower: !!stageDef11.tower },
               progress, c11, c15, c101,
               kst: { keyA, keyB, reset1, reset2, fresh: { left: fresh.left, used: fresh.used, best: fresh.best, boss: fresh.boss.ko, title: fresh.boss.title, resetMs: fresh.resetMs } },
               gradeIds, dS: { grade: dS.grade.id, gold: dS.gold, shards: dS.shards, points: dS.points, ratio: dS.ratio },
               dA: { grade: dA.grade.id, gold: dA.gold, shards: dA.shards, points: dA.points },
               dC: { grade: dC.grade.id, gold: dC.gold, shards: dC.shards, points: dC.points },
               dD: { grade: dD.grade.id, gold: dD.gold, shards: dD.shards, points: dD.points },
               entry, play1, play2, deadRun, resetState, sweepState, emptySweep,
               oldSave: { daily: oldSave.dailyBoss, tower: oldSave.tower, deepCleared: oldSave.tower.cleared.length, best: oldSave.tower.best },
               junkTower };
    """)
    d45 = tw45["defs"]
    ok([x["n"] for x in d45] == [11, 12, 15, 20, 25, 50, 100, 200] and tw45["edge"]["max"] == 200 and tw45["edge"]["fixed"] == 10, "심층 11~200층 자동 생성(상한 200)", json.dumps([x["n"] for x in d45]))
    ok(tw45["edge"]["f201"] is None and tw45["edge"]["f0"] is None and tw45["edge"]["f10deep"] is False, "범위 밖 층 없음 · 고정 10층은 심층 아님", json.dumps(tw45["edge"]))
    ok(all(x["deep"] and x["themeOk"] and x["mins"] == 22 for x in d45), "심층 테마 유효 · 최소 스테이지 S22", json.dumps([(x["n"], x["themeOk"], x["mins"]) for x in d45]))
    ok(all(x["gims"] == 2 for x in d45 if not x["bossOnly"]) and all(x["gims"] == 3 and x["boss"] for x in d45 if x["bossOnly"]), "심층 일반 2기믹 · 보스 층 3기믹+보스", json.dumps([(x["n"], x["gims"], x["bossOnly"]) for x in d45]))
    ok([x["n"] for x in d45 if x["bossOnly"]] == [15, 20, 25, 50, 100, 200], "5층마다 심층 보스 층(15·20·25…)", json.dumps([x["n"] for x in d45 if x["bossOnly"]]))
    ok(len(tw45["gimSet"]) == 6, "심층 기믹 로테이션이 6종을 모두 사용", json.dumps(tw45["gimSet"]))
    sc45 = tw45["scaling"]
    ok(all(sc45[i]["atk"] < sc45[i + 1]["atk"] for i in range(len(sc45) - 1)) and all(sc45[i]["gold"] < sc45[i + 1]["gold"] for i in range(len(sc45) - 1)), "계단식 강화 — 층이 오를수록 공격력·보상 증가", json.dumps([(x["n"], x["atk"], x["gold"]) for x in sc45]))
    ok(sc45[0]["limit"] >= 60 and sc45[-1]["limit"] >= 35 and sc45[-1]["kill"] > sc45[0]["kill"], "심층 제한 시간 35초 이상 · 처치 목표 시간 증가", json.dumps([(x["n"], x["limit"], x["kill"]) for x in sc45]))
    gate = tw45["gate"]
    ok(gate["a"]["f11"] is True and gate["a"]["f12"] is False and "11층" in gate["a"]["why12"], "10층 클리어 후 11층만 열림", json.dumps(gate["a"], ensure_ascii=False))
    ok(gate["b"]["f12"] is True and gate["b"]["f13"] is False, "심층도 한 층씩 해제", json.dumps(gate["b"]))
    ok(gate["c"]["f11"] is False and gate["c"]["why"] == "최고 스테이지 22 필요", "스테이지 S22 미만이면 심층 잠김", json.dumps(gate["c"], ensure_ascii=False))
    ok(tw45["r11"]["gold"] > tw45["r10"]["gold"] and tw45["r11"]["shards"] > tw45["r10"]["shards"] and tw45["r101"]["gold"] > tw45["r11"]["gold"], "심층 보상이 10층·아래 층보다 크다", json.dumps({"r10": tw45["r10"]["gold"], "r11": tw45["r11"]["gold"], "r101": tw45["r101"]["gold"]}))
    ok(tw45["r11again"]["points"] == 0 and tw45["r11again"]["item"] is None and tw45["r11again"]["gold"] == round(tw45["r11"]["gold"] * 0.35), "심층 재도전은 35%·초월석/장비 없음", json.dumps({"first": tw45["r11"]["gold"], "again": tw45["r11again"]["gold"]}))
    ok(tw45["r15"]["points"] == 7 and (tw45["r15"]["item"] or {}).get("rarity") == "rare" and tw45["r20"]["points"] == 8 and (tw45["r20"]["item"] or {}).get("rarity") == "legend", "심층 보스 층 초월석·장비 보상(15층 7P·20층 전설)", json.dumps({"r15": [tw45["r15"]["points"], (tw45["r15"]["item"] or {}).get("rarity")], "r20": [tw45["r20"]["points"], (tw45["r20"]["item"] or {}).get("rarity")]}))
    ok("💎" in tw45["rewardText"] and "✨" in tw45["rewardText"], "심층 보상 미리보기 텍스트", tw45["rewardText"])
    ok(tw45["stageDef11"]["name"] == "도전의 탑 11층 · 끝없는 회랑" and tw45["stageDef11"]["tower"] is True, "심층 층 정의 → 전투 테마/HUD 변환", json.dumps(tw45["stageDef11"], ensure_ascii=False))
    ok(tw45["progress"]["best"] == 13 and tw45["progress"]["deep"] is True and tw45["progress"]["next"] == 14 and tw45["progress"]["max"] == 200, "진행도 — 심층 최고 13층·다음 14층", json.dumps(tw45["progress"]))

    c11 = tw45["c11"]
    ok(c11["ok"] is True and c11["how"] == "clear" and c11["first"] is True and c11["next"] == 12, "11층 진입·클리어 — 다음 12층 해제", json.dumps({k: c11[k] for k in ["ok", "how", "first", "next"]}))
    ok(c11["clearedTail"] == [10, 11] and c11["best"] == 11 and c11["goldGain"] > 0 and c11["shardsGain"] >= 220, "11층 클리어 기록·보상 지급(강화석 220+)", json.dumps({k: c11[k] for k in ["clearedTail", "best", "goldGain", "shardsGain"]}))
    ok(c11["retryNext"] is True, "클리어 후 12층 바로 도전 가능", json.dumps({"retry": c11["retryNext"]}))
    c15 = tw45["c15"]
    ok(c15["ok"] is True and c15["how"] == "clear" and c15["points"] == 7 and c15["item"] == "rare" and c15["itemsDelta"] == 1, "15층 심층 보스 클리어 — 7P·레어 장비", json.dumps({k: c15[k] for k in ["ok", "how", "points", "item", "itemsDelta"]}))
    c101 = tw45["c101"]
    ok(c101["ok"] is True and c101["how"] in ("clear", "dead", "timeout"), "101층(고층) 진입·전투·복귀", json.dumps({k: c101[k] for k in ["ok", "how", "minPct"]}))

    kst = tw45["kst"]
    ok(kst["keyA"] == "2026-11-24" and kst["keyB"] == "2026-11-25", "KST 자정 경계 — 날짜 키", json.dumps([kst["keyA"], kst["keyB"]]))
    ok(kst["reset1"] == 1000 and 0 < kst["reset2"] <= 86400000, "다음 자정(KST)까지 남은 시간", json.dumps([kst["reset1"], kst["reset2"]]))
    ok(kst["fresh"]["left"] == 2 and kst["fresh"]["used"] == 0 and kst["fresh"]["best"] == 0 and kst["fresh"]["boss"], "새 세이브 — 도전 2회·오늘의 보스", json.dumps(kst["fresh"], ensure_ascii=False))
    ok(tw45["gradeIds"] == ["S", "A", "B", "C", "D"], "등급 경계 S/A/B/C/D", json.dumps(tw45["gradeIds"]))
    dS, dA, dC, dD = tw45["dS"], tw45["dA"], tw45["dC"], tw45["dD"]
    ok(dS["grade"] == "S" and dS["points"] == 3 and dS["shards"] == 70 and dS["gold"] > dA["gold"] > dC["gold"] > dD["gold"], "등급별 보상 — S는 초월석 3P·강화석 70", json.dumps([dS, dA, dC, dD]))
    ok(dC["points"] == 0 and dD["points"] == 0 and dD["shards"] == 6, "C·D 등급은 초월석 없음", json.dumps([dC, dD]))

    entry = tw45["entry"]
    ok(entry["ok"] is True and entry["left0"] == 1 and entry["used"] == 1 and entry["starts"] == 1, "일일 보스 입장 — 도전 1회 차감·남은 1회", json.dumps({k: entry[k] for k in ["ok", "left0", "used", "starts"]}))
    ok(entry["monsters"] == 1 and entry["bossIsBoss"] is True and entry["bossHp"] >= entry["dps"] * 150 * 0.98 and entry["hpFull"] is True, "보스 1마리(체력 = DPS×150초)·체력 완충", json.dumps({k: entry[k] for k in ["monsters", "bossHp", "dps", "hpFull"]}))
    ok(entry["towerReject"] is False and entry["dunReject"] is False and entry["bossReject"] is False, "일일 보스 중 탑·던전·스테이지 보스 거부", json.dumps({k: entry[k] for k in ["towerReject", "dunReject", "bossReject"]}))
    ok("일일 보스" in entry["themeName"] and entry["theme"], "일일 보스 테마/HUD 라벨", json.dumps([entry["themeName"], entry["theme"]], ensure_ascii=False))

    play1 = tw45["play1"]
    ok(play1["ok"] is True and play1["ev"] is not None and play1["dmg"] > 0 and play1["grade"] in list("SABCD"), "일일 보스 30초 전투 — 누적 피해·등급 산출", json.dumps({k: play1[k] for k in ["dmg", "grade", "ratio"]}))
    ok(play1["goldGain"] > 0 and play1["shardsGain"] > 0 and play1["points"] >= 0 and play1["goldGain"] == play1["ev"]["gold"], "보상 즉시 지급(골드·강화석·초월석)", json.dumps({k: play1[k] for k in ["goldGain", "shardsGain", "points"]}))
    ok(play1["best"] == play1["dmg"] and play1["isBest"] is True and play1["bestGrade"] == play1["grade"] and play1["left"] == 1, "최고 피해·등급 기록·남은 횟수 1", json.dumps({k: play1[k] for k in ["best", "bestGrade", "isBest", "left"]}))
    ok(play1["dailyNull"] is True and play1["monsters"] >= 1 and play1["stage"] == 24, "종료 후 원래 스테이지 사냥 복귀", json.dumps({k: play1[k] for k in ["dailyNull", "monsters", "stage", "themeBack"]}))
    ok(play1["secondOk"] is True, "두 번째 도전 가능", json.dumps({"second": play1["secondOk"]}))
    ok(play1["third"] is False and "모두 사용" in (play1["thirdReason"] or ""), "세 번째 도전은 거부(하루 2회)", json.dumps({"third": play1["third"], "why": play1["thirdReason"]}, ensure_ascii=False))
    play2 = tw45["play2"]
    ok(play2["used"] == 1 and play2["left"] == 1 and play2["third"] is False, "두 번째 판도 같은 규칙(1회 차감)", json.dumps({k: play2[k] for k in ["used", "left", "third"]}))
    dead = tw45["deadRun"]
    ok(dead["how"] == "dead" and dead["dmg"] == 5000 and dead["gold"] >= 0 and dead["dailyNull"] is True, "전투 불능 — 그때까지의 피해로 종료·보상", json.dumps(dead, ensure_ascii=False))

    rs = tw45["resetState"]
    ok(rs["stale"]["date"] == "2026-11-25" and rs["stale"]["used"] == 0 and rs["stale"]["best"] == 12345 and rs["stale"]["bestGrade"] == "A", "날짜가 바뀌면 횟수만 리셋(최고 기록 유지)", json.dumps(rs["stale"], ensure_ascii=False))
    ok(rs["same"]["used"] == 1 and rs["same"]["best"] == 900, "같은 날짜면 사용 횟수 유지", json.dumps(rs["same"], ensure_ascii=False))
    ok(rs["junk"]["used"] == 2 and rs["junk"]["best"] == 0 and rs["junk"]["bestGrade"] == "D" and rs["junk"]["last"] is None, "손상된 일일 보스 기록 정규화(상한·음수·등급)", json.dumps(rs["junk"], ensure_ascii=False))
    ok(rs["none"]["used"] == 0 and rs["none"]["date"] == "2026-11-25", "기록 없음 → 오늘 날짜·0회", json.dumps(rs["none"], ensure_ascii=False))

    swp = tw45["sweepState"]
    ok(swp["available"] is True and swp["floor"] == 12 and swp["ok"] is True and swp["gold"] > 0 and swp["shards"] > 0, "일일 소탕 — 최고 12층 보상 지급", json.dumps({k: swp[k] for k in ["available", "floor", "gold", "shards"]}))
    ok(swp["gainGold"] == swp["gold"] and swp["claimed"] is True and swp["availableAfter"] is False and swp["again"] is False, "소탕은 하루 1회(중복 거부)", json.dumps({k: swp[k] for k in ["gainGold", "claimed", "again"]}))
    ok(swp["nextDay"] is True and swp["nextClaimed"] is True, "다음 날 다시 소탕 가능", json.dumps({"next": swp["nextDay"]}))
    ok(swp["gold"] < swp["firstGold"] and swp["shards"] < swp["firstShards"], "소탕은 최초 클리어보다 적다(70%)", json.dumps({"sweep": [swp["gold"], swp["shards"]], "first": [swp["firstGold"], swp["firstShards"]]}))
    ok(tw45["emptySweep"]["available"] is False and tw45["emptySweep"]["claim"] is False, "클리어한 층이 없으면 소탕 불가", json.dumps(tw45["emptySweep"]))

    old = tw45["oldSave"]
    ok(old["daily"]["date"] == "2026-11-25" and old["daily"]["used"] == 0 and old["daily"]["best"] == 0 and old["daily"]["last"] is None, "v4.4 세이브 → 일일 보스 기본값 마이그레이션", json.dumps(old["daily"], ensure_ascii=False))
    ok(old["tower"]["sweep"]["date"] == "" and old["tower"]["sweep"]["floor"] == 0, "v4.4 세이브 → 탑 소탕 기본값", json.dumps(old["tower"]["sweep"]))
    ok(old["deepCleared"] == 13 and old["best"] == 13, "v4.4 세이브의 심층 기록 보존", json.dumps({"n": old["deepCleared"], "best": old["best"]}))
    jt = tw45["junkTower"]
    ok(jt["cleared"] == [1, 11, 13] and jt["best"] == 200 and jt["sweep"]["floor"] == 12 and jt["sweep"]["gold"] == 0, "탑 저장 정규화 — 심층 중복 제거·상한 200·소탕 손상 방어", json.dumps(jt, ensure_ascii=False))

    # ── v4.5 화면·배선 ──
    tpl45 = js(ctx2, """
      const s = defaultState(0);
      s.level = 45; s.stage = 24; s.maxStage = 30; s.gold = 2000000; s.shards = 800;
      s.tower = { cleared: Array.from({length: 12}, (_, i) => i + 1), best: 12, runs: 9, fails: 1,
                  last: { at: 0, n: 13, how: 'timeout', kills: 7, bossKills: 0, dmg: 9000, gold: 0, shards: 0, points: 0 },
                  sweep: { date: '', floor: 0, gold: 0, shards: 0, at: 0 } };
      s.dailyBoss = { date: kstDateKey(Date.now()), used: 1, best: 51234, bestGrade: 'A', bestDate: '', runs: 3,
                      last: { at: Date.now(), dmg: 51234, grade: 'A', how: 'timeout', gold: 12000, shards: 45, points: 2, ratio: 1.25 } };
      for (const c of CITIES.slice(0, 4)) s.land.owned[c.key] = 40;
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(24), boss: null, dungeon: null, tower: null, daily: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', el: {}, install: { hidden: true } };
      const growth = __huntSub(ui, 'challenge');
      const settings = __tpls.settings(ui);
      const running = { ...ui, battle: { ...ui.battle, daily: { t0: Date.now(), ends: Date.now() + 20000, dmg: 12345, ko: '보이드 워커', title: '공허의 방랑자', floor: null } } };
      const growing = __huntSub(running, 'challenge');
      return { growth, settings, growing, tiles: (growth.match(/class="tf /g) || []).length,
               bad: /undefined|NaN|\\[object Object\\]/.test(growth + settings + growing) };
    """)
    ok(tpl45["bad"] is False, "v4.5 템플릿에 undefined/NaN 누출 없음")
    ok("일일 보스" in tpl45["growth"] and 'data-action="daily"' in tpl45["growth"] and "30초 타임어택" in tpl45["growth"], "사냥→성장 탭에 일일 보스 카드·도전 버튼", "")
    ok("도전의 탑" in tpl45["growth"] and tpl45["tiles"] == 10 and "tower-deep" in tpl45["growth"] and "심층" in tpl45["growth"], "도전의 탑 카드 — 고정 10타일 + 심층 표시", json.dumps({"tiles": tpl45["tiles"]}))
    ok('data-action="goto-todo"' in tpl45["growth"] and "소탕" in tpl45["growth"], "탑 카드 소탕 상태 → 허브 수령 동선(v8.1.0)", "")
    ok("최고 12층" in tpl45["growth"] and "13층" in tpl45["growth"] and "최고" in tpl45["growth"], "심층 진행·다음 층 표시", "")
    ok("진행 중" in tpl45["growing"] and ("12345" in tpl45["growing"] or "12,345" in tpl45["growing"]) and "일일 보스" in tpl45["growing"], "일일 보스 진행 중 카드(누적 피해)", "")
    ok("일일 보스" in tpl45["settings"] and ("51234" in tpl45["settings"] or "51,234" in tpl45["settings"]) and "최고 12/200층" in tpl45["settings"], "설정 기록에 일일 보스·심층 최고 층", "")

    usrc45 = read("src/ui.js"); asrc45 = read("app.js"); rsrc45 = read("src/render.js"); css45 = read("style.css")
    ok(os.path.exists(os.path.join(ROOT, "src/daily.js")) and "'./src/daily.js'" in read("sw.js"), "src/daily.js 존재 · 서비스워커 프리캐시", "")
    ok(all(x in usrc45 for x in ['data-action="daily"', 'data-action="goto-todo"', "dailyBossCard", "tower-deep"]), "ui.js — 일일 보스 카드·소탕 허브 동선", "")
    ok(all(x in asrc45 for x in ["enterDaily", "claimTowerSweep", "showDailyResult", "dailyEnd", "dailyStart", "towerSweepClaim"]), "app.js — 일일 보스 입장·결과·소탕 액션", "")
    ok(all(x in rsrc45 for x in ["drawDailyHud", "dailyStart", "dailyEnd", "dailyGradeAt"]), "render.js — 일일 보스 HUD·연출", "")
    ok(all(x in css45 for x in [".daily-card", ".daily-result-grade", ".tower-deep", ".mini.sweep", ".tower-sec"]), "style.css — 일일 보스·심층 스타일", "")
    ok(all(x in read("src/combat.js") for x in ["startDailyBoss", "endDailyBoss", "dailyTick", "consumeDailyAttempt", "recordDailyRun"]), "combat.js — 일일 보스 전투 구현", "")
    ok(all(x in read("src/tower.js") for x in ["towerDeepFloor", "TOWER_MAX_FLOOR = 200", "towerSweepClaim", "sweepRate"]), "tower.js — 심층 생성·일일 소탕", "")


    readme44 = read("README.md")
    ok(all(x in readme44 for x in ["v4.5.0", "드래곤 로드", "용신", "×100", "심층", "일일 보스", "일일 소탕"]) and "×1.08" in readme44, "README — v4.5 심층·일일 보스·소탕 + v4.4 내용 유지", "")

    section("[22] 🏛️ v4.6 부동산 전투 시너지 · 🔨 급매 경매")

    # ── 1) 상수 ──
    syn46 = js(ctx, """
      const lv = LAND_SYNERGY;
      return {
        every: AUCTION.everyMs, live: AUCTION.liveMs,
        per: lv.perLevel, caps: lv.caps, mega: lv.mega, megaCaps: lv.megaCaps,
        discount: [AUCTION.discountMin, AUCTION.discountMax],
      };
    """)
    ok(syn46["every"] == 1200000 and syn46["live"] == 720000, "급매 경매 20분 주기 · 입찰 12분", json.dumps([syn46["every"], syn46["live"]]))
    ok(syn46["per"] == {"critDmgPct": 1, "cdrPct": 0.8, "bossDmgPct": 0.8} and syn46["caps"] == {"critDmgPct": 24, "cdrPct": 12, "bossDmgPct": 16}, "랜드마크 레벨당 상승치·상한", json.dumps(syn46["per"]))
    ok(syn46["mega"] == {"expPct": 4} and syn46["megaCaps"] == {"expPct": 20}, "메가 랜드마크 1개당 경험치 +4%(최대 20%)", json.dumps(syn46["mega"]))
    ok(syn46["discount"] == [0.3, 0.45], "경매 최저 입찰 할인 30~45%", json.dumps(syn46["discount"]))

    # ── 2) 랜드마크 전투 시너지 ──
    lm46 = js(ctx, """
      const mk = (levels, qty = 10) => {
        const s = defaultState(0);
        const cs = CITIES.slice(0, 20);
        levels.forEach((lv, i) => { s.land.owned[cs[i].key] = qty; s.land.landmarks[cs[i].key] = lv; });
        return landmarkSynergy(s);
      };
      const none = landmarkSynergy(defaultState(0));
      const a = mk([3, 2]);
      const b = mk([3, 3, 1]);
      const c = mk([2]);
      // 보유 0평이면 랜드마크는 집계되지 않는다
      const ghost = defaultState(0);
      ghost.land.landmarks[CITIES[5].key] = 3;
      const ghostSyn = landmarkSynergy(ghost);
      // 상한 — Lv.3 10개(레벨 합 30)
      const capS = defaultState(0);
      CITIES.slice(0, 10).forEach((cc) => { capS.land.owned[cc.key] = 5; capS.land.landmarks[cc.key] = 3; });
      const cap = landmarkSynergy(capS);
      return { none, a, b, c, ghost: ghostSyn, cap };
    """)
    ok(lm46["none"]["levels"] == 0 and lm46["none"]["critDmgPct"] == 0 and lm46["none"]["expPct"] == 0, "랜드마크 없으면 전투 시너지 0")
    ok(lm46["a"]["levels"] == 5 and lm46["a"]["count"] == 2 and lm46["a"]["mega"] == 1 and lm46["a"]["critDmgPct"] == 5 and lm46["a"]["cdrPct"] == 4 and lm46["a"]["bossDmgPct"] == 4 and lm46["a"]["expPct"] == 4, "메가+타워(레벨 합 5) → 치명피해 +5% · 쿨감 -4% · 보스 +4% · 경험치 +4%", json.dumps(lm46["a"]))
    ok(lm46["b"]["levels"] == 7 and lm46["b"]["mega"] == 2 and lm46["b"]["critDmgPct"] == 7 and lm46["b"]["cdrPct"] == 5.6 and lm46["b"]["expPct"] == 8, "메가 2개+상가 → 레벨 합 7 · 경험치 +8%", json.dumps(lm46["b"]))
    ok(lm46["c"]["levels"] == 2 and lm46["c"]["mega"] == 0 and lm46["c"]["expPct"] == 0 and lm46["c"]["critDmgPct"] == 2, "타워(Lv.2)만 있으면 경험치 보너스 없음(치명피해만)", json.dumps(lm46["c"]))
    ok(lm46["ghost"]["levels"] == 0 and lm46["ghost"]["count"] == 0, "보유 0평 지역의 랜드마크는 집계 제외")
    ok(lm46["cap"]["levels"] == 30 and lm46["cap"]["critDmgPct"] == 24 and lm46["cap"]["cdrPct"] == 12 and lm46["cap"]["bossDmgPct"] == 16 and lm46["cap"]["expPct"] == 20, "레벨 합 30 — 치명피해 24 · 쿨감 12 · 보스 16 · 경험치 20 상한", json.dumps(lm46["cap"]))

    # ── 3) 권역 완성 시너지 ──
    rg46 = js(ctx, """
      const owned = (setId, n) => {
        const s = defaultState(0);
        CITIES.filter((c) => citySetId(c.key) === setId).slice(0, n).forEach((c) => { s.land.owned[c.key] = 5; });
        return s;
      };
      const seoul10 = owned('seoul', 10);
      const seoul3 = owned('seoul', 3);
      const jeju2 = owned('jeju', 2);
      const both = defaultState(0);
      Object.assign(both.land.owned, seoul10.land.owned, jeju2.land.owned);
      const rs = regionCompleteSynergy(seoul10.land.owned);
      const rp = regionCompleteSynergy(seoul3.land.owned);
      const rj = regionCompleteSynergy(jeju2.land.owned);
      const rb = regionCompleteSynergy(both.land.owned);
      const status = regionSetStatus(seoul10.land.owned).find((x) => x.id === 'seoul');
      const gy = owned('gyeonggi', 10);
      const rg = regionCompleteSynergy(gy.land.owned);
      const ga = owned('gangwon', 7);
      const gd = regionCompleteSynergy(ga.land.owned);
      const gs = owned('gyeongsang', 12);
      const gb = regionCompleteSynergy(gs.land.owned);
      const cc = owned('chungcheong', 10);
      const gc = regionCompleteSynergy(cc.land.owned);
      const jl = owned('jeolla', 10);
      const gj = regionCompleteSynergy(jl.land.owned);
      return { seoul: rs, partial: rp, jeju: rj, both: rb,
               complete: status.complete, master: status.masterBuffs, masterText: status.masterText,
               all: { gyeonggi: rg.buffs, gangwon: gd.buffs, gyeongsang: gb.buffs, chungcheong: gc.buffs, jeolla: gj.buffs } };
    """)
    ok(rg46["seoul"]["count"] == 1 and rg46["seoul"]["ids"] == ["seoul"] and rg46["seoul"]["buffs"] == {"critDmgPct": 6}, "서울권 완성 → 치명타 피해 +6%", json.dumps(rg46["seoul"]["buffs"]))
    ok(rg46["partial"]["count"] == 0 and rg46["partial"]["buffs"] == {}, "서울 3곳(Lv.1)로는 완성 보너스 없음")
    ok(rg46["jeju"]["count"] == 1 and rg46["jeju"]["buffs"] == {"cdrPct": 4}, "제주권 완성(2곳) → 스킬 쿨감 -4%", json.dumps(rg46["jeju"]["buffs"]))
    ok(rg46["both"]["count"] == 2 and rg46["both"]["buffs"] == {"critDmgPct": 6, "cdrPct": 4} and "치명타 피해 +6%" in rg46["both"]["text"], "두 권역 완성 → 시너지 합산", json.dumps(rg46["both"]["buffs"]))
    ok(rg46["complete"] is True and rg46["master"] == {"critDmgPct": 6} and "치명타 피해" in rg46["masterText"], "세트 현황이 완성 여부·완성 보너스를 알려 준다", json.dumps(rg46["masterText"], ensure_ascii=False))
    allm = rg46["all"]
    ok(allm["gyeonggi"] == {"atkPct": 5} and allm["gangwon"] == {"dropPct": 6} and allm["gyeongsang"] == {"bossDmgPct": 6} and allm["chungcheong"] == {"goldPct": 5} and allm["jeolla"] == {"expPct": 5}, "권역별 완성 시너지(경기 공격·강원 드롭·경상 보스·충청 골드·전라 경험치)", json.dumps(allm))

    # ── 4) 합계 · 텍스트 ──
    tot46 = js(ctx, """
      const s = defaultState(0);
      const seoul = CITIES.filter((c) => citySetId(c.key) === 'seoul').slice(0, 10);
      seoul.forEach((c, i) => { s.land.owned[c.key] = 10; s.land.landmarks[c.key] = i < 2 ? 3 : 2; });
      const syn = landSynergy(s);
      return {
        crit: syn.critDmgPct, cdr: syn.cdrPct, boss: syn.bossDmgPct, exp: syn.expPct, atk: syn.atkPct,
        text: syn.text, active: syn.active, parts: syn.parts.length,
        lmLevels: syn.landmark.levels, mega: syn.landmark.mega, complete: syn.region.count, count: syn.count,
      };
    """)
    ok(tot46["lmLevels"] == 22 and tot46["mega"] == 2 and tot46["complete"] == 1, "랜드마크 레벨 합 22 · 메가 2 · 완성 권역 1", json.dumps({k: tot46[k] for k in ["lmLevels", "mega", "complete"]}))
    ok(tot46["crit"] == 28 and tot46["cdr"] == 12 and tot46["boss"] == 16 and tot46["exp"] == 8, "랜드마크 상한(24) + 서울권 완성(6) = 치명피해 28 · 쿨감 12 · 보스 16 · 경험치 8", json.dumps({k: tot46[k] for k in ["crit", "cdr", "boss", "exp"]}))
    ok(tot46["active"] is True and tot46["parts"] == 3 and "치명타 피해 +28%" in tot46["text"] and "스킬 쿨감 -12%" in tot46["text"] and "보스 피해 +16%" in tot46["text"] and "경험치 +8%" in tot46["text"], "시너지 한 줄 요약 문구", tot46["text"])

    # ── 5) computeBuffs · calcStats 반영 ──
    st46 = js(ctx, """
      const base = defaultState(0); base.level = 40;
      const baseS = calcStats(base, {});
      const g = defaultState(0); g.level = 40;
      CITIES.filter((c) => citySetId(c.key) === 'gyeonggi').slice(0, 10).forEach((c) => { g.land.owned[c.key] = 5; });
      const gb = computeBuffs(g, 0);
      const gs = calcStats(g, gb);
      const l = defaultState(0); l.level = 40;
      const c0 = CITIES[3];
      l.land.owned[c0.key] = 10; l.land.landmarks[c0.key] = 3; l.land.landmarks[CITIES[4].key] = 3; l.land.owned[CITIES[4].key] = 5;
      const lb = computeBuffs(l, 0);
      const ls = calcStats(l, lb);
      const plain = calcStats(l, {});
      const noSyn = computeBuffs(base, 0);
      return {
        base: { atk: baseS.atk, critDmg: baseS.critDmg, boss: baseS.bossDmgPct, cdr: baseS.skillCdr, exp: baseS.expMult },
        g: { synAtk: gb.synAtkPct, setAtk: gb.setAtkPct, complete: gb.synCompleteSets, text: gb.synText, active: gb.active, atk0: baseS.atk, atk1: gs.atk },
        l: { levels: lb.synLandmarkLevels, mega: lb.synMega, crit: lb.synCritDmgPct, cdr: lb.synCdrPct, boss: lb.synBossDmgPct, exp: lb.synExpPct, text: lb.synText },
        ls: { critDmg: ls.critDmg, boss: ls.bossDmgPct, cdr: ls.skillCdr, exp: ls.expMult, synCrit: ls.synCritDmgPct, synBoss: ls.synBossDmgPct, synAtk: ls.synAtkPct, atk: ls.atk, atkPlain: plain.atk },
        noSyn: { active: noSyn.active, crit: noSyn.synCritDmgPct, text: noSyn.synText },
      };
    """)
    ok(st46["g"]["synAtk"] == 5 and st46["g"]["complete"] == 1 and st46["g"]["active"] is True, "경기권 완성 → 부동산 시너지 공격력 +5%", json.dumps(st46["g"], ensure_ascii=False))
    ok(st46["g"]["atk1"] > st46["g"]["atk0"], "완성 시너지가 실제 공격력에 반영", json.dumps({"before": st46["g"]["atk0"], "after": st46["g"]["atk1"]}))
    ok(st46["l"]["levels"] == 6 and st46["l"]["mega"] == 2 and st46["l"]["crit"] == 6 and st46["l"]["cdr"] == 4.8 and st46["l"]["boss"] == 4.8 and st46["l"]["exp"] == 8, "메가 2개(레벨 합 6) → 치명피해 6 · 쿨감 4.8 · 보스 4.8 · 경험치 8", json.dumps(st46["l"]))
    ok(abs(st46["ls"]["critDmg"] - 2.06) < 1e-9 and abs(st46["ls"]["boss"] - 0.048) < 1e-9 and abs(st46["ls"]["cdr"] - 0.048) < 1e-9 and abs(st46["ls"]["exp"] - 1.08) < 1e-9, "calcStats — 치명타 피해 ×2.06 · 보스 +4.8% · 쿨감 4.8% · 경험치 ×1.08", json.dumps(st46["ls"]))
    ok(st46["noSyn"]["active"] is False and st46["noSyn"]["crit"] == 0 and st46["noSyn"]["text"] == "", "부동산이 없으면 시너지 0(기존 밸런스 불변)")

    # ── 6) 경험치 시너지 — 사냥 보상·오프라인 정산 ──
    exp46 = js(ctx, """
      const mk = () => { const s = defaultState(0); s.level = 20; s.gold = 0; s.records = { totalGold: 0 }; return s; };
      const a = mk(); const b = mk();
      const r0 = killReward(a, 10, false, {}, () => 0.5);
      const r1 = killReward(b, 10, false, { synExpPct: 8 }, () => 0.5);
      const off = mk(); off.stage = 5; off.lastActiveAt = 0;
      const o0 = offlineSummary(off, 3600 * 1000, {});
      const o1 = offlineSummary(off, 3600 * 1000, { synExpPct: 8 });
      return { e0: r0.exp, e1: r1.exp, g0: r0.gold, g1: r1.gold,
               off0: o0.exp, off1: o1.exp, offGold0: o0.gold, offGold1: o1.gold };
    """)
    ok(exp46["e1"] == round(exp46["e0"] * 1.08) and exp46["g1"] == exp46["g0"], "경험치 +8% 시너지가 처치 보상 경험치에만 적용(골드는 그대로)", json.dumps(exp46))
    ok(exp46["off1"] == math.floor(exp46["off0"] * 1.08) or abs(exp46["off1"] - exp46["off0"] * 1.08) <= 1, "오프라인 정산 경험치에도 같은 시너지", json.dumps({"a": exp46["off0"], "b": exp46["off1"]}))
    ok(exp46["offGold1"] == exp46["offGold0"], "오프라인 골드는 시너지와 무관", json.dumps({"a": exp46["offGold0"], "b": exp46["offGold1"]}))

    # ── 7) 스킬 쿨감 — 계산·실제 전투 ──
    cd46 = js(ctx, """
      const base = skillCdOf('strike', {});
      const cdr = skillCdOf('strike', { synCdrPct: 12 });
      const cap = skillCdOf('strike', { synCdrPct: 90 });
      const heal = SKILLS.heal.cd;
      const elapsed = Math.round(heal * 0.9);
      const s1 = defaultState(0); s1.level = 30; s1.stage = 5; s1.skills.heal.last = -elapsed;
      const s2 = defaultState(0); s2.level = 30; s2.stage = 5; s2.skills.heal.last = -elapsed;
      const b1 = new Battle(s1, () => ({ synCdrPct: 12 }), () => 0.5, 0);
      const b2 = new Battle(s2, () => ({}), () => 0.5, 0);
      const withCdr = b1.castSkill('heal', 0);
      const without = b2.castSkill('heal', 0);
      return { base, cdr, cap, strike: SKILLS.strike.cd, heal, elapsed, withCdr, without,
               statsCdr: calcStats(s1, { synCdrPct: 12 }).skillCdr };
    """)
    ok(abs(cd46["cdr"] - cd46["base"] * 0.88) < 1e-9 and cd46["base"] == cd46["strike"], "쿨감 12% → 스킬 쿨타임 88%", json.dumps({k: cd46[k] for k in ["base", "cdr", "strike"]}))
    ok(abs(cd46["cap"] - cd46["base"] * 0.6) < 1e-9, "쿨감은 40%에서 멈춘다", json.dumps({"base": cd46["base"], "cap": cd46["cap"]}))
    ok(cd46["withCdr"] is True and cd46["without"] is False, "실제 전투 — 쿨감이 있으면 90% 시점에 시전 가능, 없으면 불가", json.dumps({"with": cd46["withCdr"], "without": cd46["without"]}))
    ok(abs(cd46["statsCdr"] - 0.12) < 1e-9, "전투 스탯에 쿨감이 실린다", json.dumps({"cdr": cd46["statsCdr"]}))

    # ── 8) 경매 매물 결정론·구성 ──
    lot46 = js(ctx, """
      const a = auctionLot(0), a2 = auctionLot(5000);
      const b = auctionLot(AUCTION.everyMs + 1000);
      const kinds = {}; const bad = [];
      let minQ = 1e9, maxQ = 0;
      for (let i = 1; i <= 200; i++) {
        const t = i * AUCTION.everyMs + 1000;
        const lot = auctionLot(t);
        if (!CITY_BY_KEY[lot.key] || lot.block !== i) bad.push('key' + i);
        if (!(lot.qty >= 1 && lot.qty <= (AUCTION.qtyByTier[lot.city.tier] || 20))) bad.push('qty' + i);
        if (!(lot.startBid > 0 && lot.startBid < lot.marketValue)) bad.push('bid' + i);
        if (lot.discountPct < 28 || lot.discountPct > 47) bad.push('disc' + i);
        if (!BONUS_KINDS.includes(lot.bonusKind) || !lot.bonusText) bad.push('kind' + i);
        if (lot.endsAt - lot.start !== AUCTION.liveMs) bad.push('live' + i);
        kinds[lot.bonusKind] = (kinds[lot.bonusKind] || 0) + 1;
        minQ = Math.min(minQ, lot.qty); maxQ = Math.max(maxQ, lot.qty);
      }
      return { same: a.key === a2.key && a.qty === a2.qty && a.startBid === a2.startBid && a.marketValue === a2.marketValue,
               nextBlock: b.block, nextDiff: b.key !== a.key || b.qty !== a.qty || b.startBid !== a.startBid,
               first: { block: a.block, qty: a.qty, mv: a.marketValue, bid: a.startBid, disc: a.discountPct, kind: a.bonusKind, text: a.bonusText, tier: a.city.tier },
               bad: bad.slice(0, 5), kinds, minQ, maxQ };
    """)
    ok(lot46["same"] is True and lot46["nextBlock"] == 1 and lot46["nextDiff"] is True, "같은 20분 블록은 같은 매물 · 다음 블록은 새 매물", json.dumps({"same": lot46["same"], "next": lot46["nextBlock"]}))
    ok(not lot46["bad"], "200개 매물 모두 유효(지역·평수·입찰가·할인·보너스·시간)", json.dumps(lot46["bad"]))
    ok(all(k in lot46["kinds"] for k in ["lease", "shards", "cash"]) and sum(lot46["kinds"].values()) == 200, "세 가지 특별 보너스가 모두 등장", json.dumps(lot46["kinds"]))
    ok(lot46["first"]["bid"] < lot46["first"]["mv"] and lot46["first"]["disc"] >= 28, "최저 입찰가는 시세보다 싸다", json.dumps(lot46["first"], ensure_ascii=False))

    # ── 9) 경매 단계·입찰가 상승 ──
    phase46 = js(ctx, """
      const s = defaultState(0);
      const block = 12345, t0 = block * AUCTION.everyMs;
      const at0 = auctionStatus(s, t0);
      const mid = auctionStatus(s, t0 + AUCTION.liveMs / 2);
      const late = auctionStatus(s, t0 + AUCTION.liveMs - 1000);
      const gap = auctionStatus(s, t0 + AUCTION.liveMs + 60000);
      const doneS = defaultState(0); doneS.land.auction.done = block;
      const done = auctionStatus(doneS, t0 + 60000);
      return {
        phase0: at0.phase, price0: at0.price, startBid: at0.lot.startBid, market: at0.lot.marketValue,
        midPhase: mid.phase, midPrice: mid.price, midProg: mid.progress, midDisc: mid.discountPct,
        latePrice: late.price, gapPhase: gap.phase, gapPrice: gap.price, gapNext: gap.nextMs, gapLive: gap.live,
        donePhase: done.phase, doneCan: done.canBid, left0: at0.leftMs, canBid0: at0.canBid,
        doneNext: done.nextMs, gapNext2: gap.nextMs, at0Next: at0.nextMs,
      };
    """)
    ok(phase46["phase0"] == "live" and phase46["canBid0"] is True and phase46["price0"] == phase46["startBid"] and phase46["left0"] == 720000, "경매 시작 — 최저 입찰가로 열리고 12분 남음", json.dumps({k: phase46[k] for k in ["phase0", "price0", "startBid", "left0"]}))
    ok(phase46["midPhase"] == "live" and phase46["midPrice"] > phase46["startBid"] and phase46["midPrice"] < phase46["market"] and 0 < phase46["midProg"] < 1, "중반 — 입찰가가 시세 쪽으로 오른다", json.dumps({k: phase46[k] for k in ["midPrice", "market"]}))
    ok(phase46["latePrice"] > phase46["midPrice"] and phase46["midDisc"] < 45, "늦게 낙찰할수록 비싸다(할인 감소)", json.dumps({"mid": phase46["midPrice"], "late": phase46["latePrice"]}))
    ok(phase46["gapPhase"] == "gap" and phase46["gapLive"] is False and phase46["gapPrice"] == phase46["market"] and 0 < phase46["gapNext"] <= 480000, "입찰 종료 후 준비 시간 — 다음 경매까지 카운트다운", json.dumps({k: phase46[k] for k in ["gapNext", "gapPrice"]}))
    ok(phase46["donePhase"] == "done" and phase46["doneCan"] is False, "이번 경매 낙찰 후에는 입찰 불가", json.dumps({"phase": phase46["donePhase"]}))
    ok(phase46["at0Next"] == 1200000 and 0 < phase46["doneNext"] < 1200000 and phase46["gapNext"] <= 480000, "낙찰 완료·준비 시간에도 '다음 경매' 카운트다운이 남는다(0:00 고정 없음)", json.dumps({"at0": phase46["at0Next"], "done": phase46["doneNext"], "gap": phase46["gapNext"]}))

    # ── 10) 입찰 견적 거부 사유 ──
    quote46 = js(ctx, """
      const s = defaultState(0);
      const t = 12345 * AUCTION.everyMs + 1000;
      const lot = auctionLot(t);
      const poor = bidQuote(s, t);
      const rich = defaultState(0); rich.gold = 1e9;
      const okq = bidQuote(rich, t);
      const closed = bidQuote(rich, t + AUCTION.liveMs + 1000);
      const doneS = defaultState(0); doneS.gold = 1e9; doneS.land.auction.done = lot.block;
      const doneQ = bidQuote(doneS, t);
      const supS = defaultState(0); supS.gold = 1e9; supS.land.owned[lot.key] = lot.city.supply;
      const supQ = bidQuote(supS, t);
      return { poor: { ok: poor.ok, reason: poor.reason, need: poor.need, gold: poor.gold, price: poor.price },
               okq: { ok: okq.ok, price: okq.price, after: okq.after, gold: okq.gold },
               closed: { ok: closed.ok, closed: closed.closed, reason: closed.reason },
               done: { ok: doneQ.ok, done: doneQ.done },
               supply: { ok: supQ.ok, reason: supQ.reason } };
    """)
    ok(quote46["poor"]["ok"] is False and "골드가 부족" in quote46["poor"]["reason"] and quote46["poor"]["need"] == quote46["poor"]["price"], "골드 부족 → 필요 금액 안내", json.dumps(quote46["poor"], ensure_ascii=False))
    ok(quote46["okq"]["ok"] is True and quote46["okq"]["after"] == quote46["okq"]["gold"] - quote46["okq"]["price"], "충분한 골드 → 낙찰가·낙찰 후 골드 계산")
    ok(quote46["closed"]["ok"] is False and quote46["closed"]["closed"] is True, "경매 시간이 아니면 낙찰 불가")
    ok(quote46["done"]["ok"] is False and quote46["done"]["done"] is True, "이미 낙찰한 경매는 다시 낙찰 불가")
    ok(quote46["supply"]["ok"] is False and "공급" in quote46["supply"]["reason"], "잔여 공급이 없으면 낙찰 불가", quote46["supply"]["reason"])

    # ── 11) 낙찰 실행 — 매물·보너스·기록 ──
    bid46 = js(ctx, """
      const findBlock = (kind) => {
        for (let i = 1; i <= 5000; i++) {
          if (auctionLot(i * AUCTION.everyMs + 1000).bonusKind === kind) return i;
        }
        return -1;
      };
      const run = (kind) => {
        const block = findBlock(kind);
        const t = block * AUCTION.everyMs + 1000;
        const lot = auctionLot(t);
        const s = defaultState(0); s.gold = 1e9; s.shards = 0;
        const q = bidQuote(s, t);
        const r = applyAuctionBid(s, t);
        const again = applyAuctionBid(s, t);
        const p = portfolioOf(s, t);
        return {
          kind, block, ok: r.ok, price: r.price, market: r.marketValue, saved: r.saved,
          goldAfter: s.gold, goldExpect: 1e9 - q.price, shards: s.shards, bonusValue: lot.bonusValue,
          owned: s.land.owned[lot.key], qty: lot.qty, held: r.held,
          bids: s.land.auction.bids, spend: s.land.auction.spend, savedTotal: s.land.auction.saved,
          done: s.land.auction.done, logN: s.land.auction.log.length, logKey: s.land.auction.log[0].key,
          logPrice: s.land.auction.log[0].price, logSaved: s.land.auction.log[0].saved,
          lease: s.land.lease[lot.key] || 0, trade: s.land.tradeCount, cost: s.land.totalCost[lot.key],
          againOk: again.ok, againReason: again.reason,
          holdingIncome: p.holdings.filter((h) => h.key === lot.key).map((h) => Math.round(h.incomePerHour)),
          bonusGiven: r.bonusGiven, bonusText: r.bonusText,
        };
      };
      const lease = run('lease'), shards = run('shards'), cash = run('cash');
      // 특별 임대 계약이 실제 임대수익에 반영되는지
      const key = CITIES[0].key;
      const s1 = defaultState(0); s1.land.owned[key] = 5; s1.land.lease[key] = 25;
      const s2 = defaultState(0); s2.land.owned[key] = 5;
      const withLease = cityRentMul(s1, key, 0), noLease = cityRentMul(s2, key, 0);
      return { lease, shards, cash, leaseRatio: withLease / noLease };
    """)
    lmb = bid46["lease"]
    ok(lmb["ok"] is True and lmb["owned"] == lmb["qty"] and lmb["held"] == lmb["qty"] and lmb["trade"] == 1, "낙찰 → 평수가 즉시 내 것이 된다", json.dumps({k: lmb[k] for k in ["owned", "qty", "trade"]}))
    ok(lmb["goldAfter"] == lmb["goldExpect"] and lmb["spend"] == lmb["price"] and lmb["cost"] == lmb["price"], "낙찰가만큼 골드 차감(거래세 없음)", json.dumps({k: lmb[k] for k in ["goldAfter", "price"]}))
    ok(lmb["done"] == lmb["block"] and lmb["bids"] == 1 and lmb["logN"] == 1 and lmb["logKey"] and lmb["logPrice"] == lmb["price"] and lmb["logSaved"] == lmb["saved"], "경매 기록 — 1건·낙찰가·아낀 골드", json.dumps({k: lmb[k] for k in ["done", "bids", "logSaved"]}))
    ok(lmb["saved"] == lmb["market"] - lmb["price"] and lmb["savedTotal"] == lmb["saved"], "아낀 골드 = 시세 − 낙찰가", json.dumps({"saved": lmb["saved"], "market": lmb["market"]}))
    ok(lmb["againOk"] is False and "이미 낙찰" in (lmb["againReason"] or ""), "같은 경매 두 번 낙찰 불가", lmb["againReason"])
    ok(lmb["kind"] == "lease" and lmb["lease"] == 25 and abs(bid46["leaseRatio"] - 1.25) < 1e-9, "특별 임대 계약 +25% → 그 지역 임대수익 1.25배", json.dumps({"lease": lmb["lease"], "ratio": round(bid46["leaseRatio"], 4)}))
    smb = bid46["shards"]
    ok(smb["kind"] == "shards" and smb["shards"] == smb["bonusValue"] and smb["lease"] == 0, "강화석 보너스 매물 → 강화석 즉시 지급", json.dumps({"shards": smb["shards"], "bonus": smb["bonusValue"]}))
    cmb = bid46["cash"]
    ok(cmb["kind"] == "cash" and cmb["goldAfter"] == cmb["goldExpect"] + round(cmb["price"] * 0.15), "캐시백 매물 → 낙찰가의 15% 즉시 환급", json.dumps({"gold": cmb["goldAfter"], "expect": cmb["goldExpect"], "price": cmb["price"]}))

    # ── 12) 저장 호환 · 정규화 ──
    nv46 = js(ctx, """
      const oldSave = normalizeState({ ver: 3, level: 12, gold: 900, land: { owned: { [CITIES[0].key]: 7 } } });
      const none = normalizeState({ ver: 3, level: 1 });
      const junk = normalizeState({ ver: 3, land: {
        owned: { [CITIES[0].key]: 2, [CITIES[1].key]: 0 },
        auction: { done: -7, bids: -3, spend: 'x', saved: -9, log: [
          { key: 'bogus/key' }, null,
          { at: 5, block: 3, key: CITIES[0].key, qty: '4', price: 100, market: 200, saved: 100, bonusKind: 'nonsense', bonusText: 'x' },
        ] },
        lease: { [CITIES[0].key]: 999, [CITIES[1].key]: 20, bogus: 5 },
      } });
      const s = defaultState(0); s.gold = 1e9;
      const t = 777 * AUCTION.everyMs + 1000;
      applyAuctionBid(s, t);
      const back = normalizeState(JSON.parse(JSON.stringify(s)));
      return {
        old: { auction: oldSave.land.auction, lease: oldSave.land.lease, owned: oldSave.land.owned[CITIES[0].key] },
        none: { auction: none.land.auction, lease: none.land.lease },
        junk: { auction: junk.land.auction, lease: junk.land.lease },
        round: { done: back.land.auction.done, bids: back.land.auction.bids, logN: back.land.auction.log.length,
                 logKey: back.land.auction.log[0] && back.land.auction.log[0].key, price: back.land.auction.log[0] && back.land.auction.log[0].price,
                 sameDone: back.land.auction.done === s.land.auction.done,
                 ownedBack: back.land.owned[Object.keys(s.land.owned)[0]], ownedRaw: s.land.owned[Object.keys(s.land.owned)[0]],
                 gold: back.gold === s.gold },
        names: { city0: CITIES[0].name, key0: CITIES[0].key },
      };
    """)
    ok(nv46["old"]["auction"] == {"done": -1, "bids": 0, "spend": 0, "saved": 0, "log": []} and nv46["old"]["lease"] == {} and nv46["old"]["owned"] == 7, "v4.5 세이브 → 경매·임대 필드 기본값 마이그레이션(보유 매물 유지)", json.dumps(nv46["old"], ensure_ascii=False))
    ok(nv46["none"]["auction"]["done"] == -1 and nv46["none"]["lease"] == {}, "새 게임 기본값", json.dumps(nv46["none"], ensure_ascii=False))
    jk = nv46["junk"]
    ok(jk["auction"]["done"] == -1 and jk["auction"]["bids"] == 0 and jk["auction"]["spend"] == 0 and jk["auction"]["saved"] == 0, "손상된 경매 기록 정규화(음수·문자)", json.dumps(jk["auction"], ensure_ascii=False))
    nm = nv46["names"]
    ok(len(jk["auction"]["log"]) == 1 and jk["auction"]["log"][0]["name"] == nm["city0"] and jk["auction"]["log"][0]["qty"] == 4 and jk["auction"]["log"][0]["bonusKind"] == "lease", "경매 로그 — 잘못된 항목 제거·지역명 복원", json.dumps(jk["auction"]["log"], ensure_ascii=False))
    ok(jk["lease"] == {nm["key0"]: 60}, "특별 임대 계약 정규화 — 보유 지역만, 상한 60%", json.dumps(jk["lease"], ensure_ascii=False))
    ok(nv46["round"]["sameDone"] is True and nv46["round"]["bids"] == 1 and nv46["round"]["logN"] == 1 and nv46["round"]["logKey"] and nv46["round"]["gold"] is True and nv46["round"]["ownedBack"] == nv46["round"]["ownedRaw"], "낙찰 후 세이브 저장·복원(경매 기록·평수 유지)", json.dumps(nv46["round"], ensure_ascii=False))

    # ── 13) 화면 — 경매 카드 · 시너지 카드 · 사냥 탭 합계 ──
    tpl46 = js(ctx2, """
      const realNow = Date.now;
      const block = 12345, start = block * AUCTION.everyMs;
      const build = (extra) => {
        const s = defaultState(0);
        s.gold = 100000000; s.level = 40; s.stage = 20; s.maxStage = 22;
        const seoul = CITIES.filter((c) => citySetId(c.key) === 'seoul').slice(0, 10);
        seoul.forEach((c, i) => { s.land.owned[c.key] = 10; s.land.landmarks[c.key] = i < 2 ? 3 : 1; });
        if (extra) extra(s);
        return s;
      };
      const mkUi = (s) => {
        const buffs = computeBuffs(s, start);
        return { s, battle: { stats: calcStats(s, buffs), def: stageDef(20), boss: null, dungeon: null, tower: null, daily: null, player: { hp: 100 } },
                 app: { buffs }, logs: [], tab: 'land', el: {}, install: { hidden: true }, landHoldAll: false };
      };
      Date.now = () => start + 1000;
      const liveS = build();
      const liveUi = mkUi(liveS);
      const home = __landSub(liveUi, 'event');
      const buffTab = __landSub(liveUi, 'home');
      const hunt = __huntSub(liveUi, 'battle');
      const a = auctionStatus(liveS, start + 1000);
      // Intl 미지원 샌드박스에서도 동작하는 천단위 콤마(앱 ui-fmt 의 group 과 같은 규칙)
      const priceText = String(a.price).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const lotName = a.lot.city.name;
      Date.now = () => start + AUCTION.liveMs + 60000;
      const gapUi = mkUi(build());
      const gap = __landSub(gapUi, 'event');
      Date.now = () => start + 60000;
      const doneUi = mkUi(build((s) => { s.land.auction.done = block; }));
      const done = __landSub(doneUi, 'event');
      Date.now = realNow;
      return {
        home, buffTab, hunt, gap, done, priceText, lotName,
        buy: (home.match(/data-action="auction-bid"/g) || []).length,
        gapBuy: (gap.match(/data-action="auction-bid"/g) || []).length,
        doneBuy: (done.match(/data-action="auction-bid"/g) || []).length,
        synRows: (buffTab.match(/class="syn-row"/g) || []).length,
        bad: /undefined|NaN|\\[object Object\\]/.test(home + buffTab + hunt + gap + done),
      };
    """)
    ok('data-action="auction-bid"' in tpl46["home"] and "급매 경매" in tpl46["home"] and tpl46["buy"] == 1, "부동산 이벤트 탭 — 급매 경매 카드와 낙찰 버튼 1개(v8)", str(tpl46["buy"]))
    ok(tpl46["lotName"] in tpl46["home"] and tpl46["priceText"] in tpl46["home"] and "시세 -" in tpl46["home"] and "auc-prog" in tpl46["home"], "경매 카드 — 매물·현재 입찰가·할인율·진행 바", json.dumps({"lot": tpl46["lotName"], "price": tpl46["priceText"]}, ensure_ascii=False))
    ok("다음 매물 예고" in tpl46["gap"] and "다음 경매" in tpl46["gap"] and tpl46["gapBuy"] == 0, "준비 시간 — 다음 매물 예고·카운트다운(낙찰 버튼 없음)", "")
    ok("낙찰 완료" in tpl46["done"] and tpl46["doneBuy"] == 0, "낙찰 후 — 완료 표시·추가 낙찰 버튼 없음", "")
    ok("부동산 전투 시너지" in tpl46["buffTab"] and "권역 완성" in tpl46["buffTab"] and tpl46["synRows"] == 4, "영지 탭 — 시너지 카드(4개 지표·권역 완성)", json.dumps({"rows": tpl46["synRows"]}))
    ok("부동산 버프" in tpl46["hunt"] and "공격 +" in tpl46["hunt"] and "외 " in tpl46["hunt"], "사냥 탭 전투 정보 — 부동산 전투 버프 합계 한 줄(3항목+외 N, v8)", "")
    ok(tpl46["bad"] is False, "v4.6 템플릿에 undefined/NaN 누출 없음")

    # ── 14) 배선·스타일 ──
    usrc46 = read("src/ui.js"); asrc46 = read("app.js"); css46 = read("style.css")
    stsrc46 = read("src/state.js"); csrc46 = read("src/combat.js"); lsrc46 = read("src/land.js")
    ausrc46 = read("src/auction.js"); sysrc46 = read("src/synergy.js"); rgsrc46 = read("src/region.js")
    ok(all(x in usrc46 for x in ["auctionCard", "landSynergyCard", "data-action=\"auction-bid\"", "'auction-info'", "syn-row", "ls-tot", "landBuffTotalsText"]), "ui.js — 경매 카드·시너지 카드·합계 줄", "")
    ok(all(x in asrc46 for x in ["openAuctionBid", "doAuctionBid", "openAuctionInfo", "auctionBid:", "auctionInfo:", "applyAuctionBid"]), "app.js — 낙찰 확인·실행·내역 액션", "")
    ok(all(x in css46 for x in [".auc-card", ".auc-prog", ".auc-price", ".auc-bid", ".syn-card", ".syn-row", ".syn-chip", ".syn-total", ".ls-tot", ".tag.lease", ".btn.gold"]), "style.css — 경매·시너지 스타일", "")
    ok(all(x in stsrc46 for x in ["normalizeAuctionState", "sanitizeLease", "s.land.auction", "skillCdOf", "synCritDmgPct", "synExpPct"]), "state.js — 경매/임대 정규화·시너지 스탯 반영", "")
    ok(all(x in csrc46 for x in ["skillCdOf", "skillCdOf(key, this.buffs()"]), "combat.js — 스킬 쿨감을 실제 쿨타임에 적용", "")
    ok(all(x in lsrc46 for x in ["landSynergy", "leasePctOf", "synText", "auction: {", "lease: {}"]), "land.js — 시너지·특별 임대를 버프·기본값에 포함", "")
    ok(all(x in ausrc46 for x in ["AUCTION", "auctionLot", "auctionStatus", "bidQuote", "applyAuctionBid", "normalizeAuctionState", "defaultAuctionState"]), "auction.js — 경매 엔진", "")
    ok(all(x in sysrc46 for x in ["LAND_SYNERGY", "landmarkSynergy", "regionCompleteSynergy", "landSynergy", "landBuffTotals", "nextLandmarkStep"]), "synergy.js — 시너지 계산", "")
    ok(all(x in rgsrc46 for x in ["master:", "masterBuffs", "masterText", "critDmgPct", "bossDmgPct"]) and "cdrPct: 4" in rgsrc46, "region.js — 권역 완성 보너스 정의", "")

    readme46 = read("README.md")
    ok(all(x in readme46 for x in ["v4.6 ", "부동산 전투 시너지", "급매 경매", "특별 임대"]), "README — v4.6 시너지·경매 섹션 유지", "")


    section("[23] ♻️ v4.7 장비 자동분해 · 🐉 상위 전직 궁극기 · 방치 편의")

    # ── 1) 버전·정적 배선 ──
    ok(f"APP_VERSION = '{EXPECTED_VER}'" in read("src/data.js") and f"land-rpg-v{EXPECTED_VER}" in read("sw.js"), f"v{EXPECTED_VER} 버전·서비스워커 캐시 갱신", "")
    idx47 = read("index.html")
    ok(all(f'data-skill="{k}"' in idx47 for k in ["strike", "whirl", "berserk", "heal"]), "기존 4개 퀵슬롯 레이아웃 유지", "")
    ok('data-skill="ultimate"' in idx47 and 'class="q ult hidden"' in idx47, "다섯 번째 퀵슬롯(궁극기) — 해금 전 숨김", "")
    css47 = read("style.css")
    ok(all(x in css47 for x in [".q.ult", ".q.ult.ready", ".gear-auto", ".gear-auto .ga-chips", ".ult-card", ".ult-card.locked"]), "style.css — 궁극기 버튼·자동분해·궁극기 카드 스타일", "")
    gsrc47 = read("src/gear.js")
    ok(all(x in gsrc47 for x in ["AUTO_DISMANTLE_MODES", "autoDismantleIdx", "normalizeAutoMode", "auto: { count: 0, shards: 0 }"]), "gear.js — 자동분해 모드·상태", "")
    ok("auto: !!acq.auto" in read("src/state.js") and "autoSkill" in read("src/state.js") and "autoUlt" in read("src/state.js"), "state.js — 자동분해 결과·자동 시전 토글 저장", "")
    ok("auto: !!drop.auto" in read("src/combat.js") and "castUltimate" in read("src/combat.js") and "ultLeftMs" in read("src/combat.js"), "combat.js — 드랍 자동분해 플래그·궁극기 시전", "")
    ok("ultUntil" in read("src/combat.js") and "ultBonus" in read("src/combat.js"), "combat.js — 궁극기 발동 뒤 공격력 버프", "")
    ok(all(x in read("src/render.js") for x in ["ev.t === 'ultimate'", "f.key === 'ultimate'", "drawFx"]), "render.js — 궁극기 연출(빛기둥·회전 문양·파동)", "")
    ok(all(x in read("app.js") for x in ["setGearAuto", "castUltimate", "toggleAutoUlt", "toggleAutoSkill", "시간당 골드", "정산 비율"]), "app.js — 자동분해/궁극기 액션·방치 보상 요약", "")
    ok("autoItem" in read("src/combat.js") and "autoItem" in read("app.js") and "autoShards" in read("src/combat.js"), "도전의 탑 보상 장비도 자동분해되면 결과 화면에 강화석으로 표시", "")

    # ── 2) 자동분해: 등급별 필터링·제외 규칙 ──
    au47 = js(ctx, """
      const FULL = ['w_dragon', 'a_abyss', 'h_abyss', 'r_eye', 'm_grail']; // 전설 5부위 장착
      const armed = () => { const s = defaultState(0); for (const id of FULL) acquireGear(s, id, { now: 0 }); return s; };
      const off = defaultState(0);
      const offRes = acquireGear(off, 'a_leather', { now: 0 }); // 끔(기본) — 빈 갑옷 슬롯이라 자동 장착
      const offKept = acquireGear(off, 'a_chain', { now: 0 });  // 끔 — 보관

      const s = armed();
      s.gear.autoDismantle = 'advanced';
      const items0 = s.gear.items.length, sh0 = s.shards;
      const lowr = acquireGear(s, 'a_plate', { now: 0 });      // 고급 이하 → 자동분해
      const keepr = acquireGear(s, 'a_guard', { now: 0 });     // 레어 → 보관
      const hi = acquireGear(s, 'h_crown', { now: 0 });        // 영웅 → 보관
      const afterAuto = { items: s.gear.items.length, shards: s.shards, auto: { ...s.gear.auto } };

      // 자동 장착되는 장비는 자동분해하지 않는다 (빈 슬롯 = 일반 이하라도 장착 우선)
      const s2 = defaultState(0);
      s2.gear.autoDismantle = 'rare';
      const eq = acquireGear(s2, 'a_leather', { now: 0 });
      // 기준보다 높은 등급은 그대로 보관
      const s3 = armed(); s3.gear.autoDismantle = 'common';
      const above = acquireGear(s3, 'a_plate', { now: 0 });
      const onlyCommon = acquireGear(s3, 'h_cloth', { now: 0 });
      // 영웅 이하 = 전설만 보관
      const s4 = armed(); s4.gear.autoDismantle = 'hero';
      const heroDust = acquireGear(s4, 'w_thunder', { now: 0 });
      const legendKept = acquireGear(s4, 'w_dragon', { now: 0 }); // 중복 → duplicate
      // 장착 중인 장비는 기준 이하 일괄분해 대상에서 빠진다
      const s5 = armed();
      acquireGear(s5, 'm_clover', { now: 0 }); // 고급 — 기준을 켜기 전에 보관
      acquireGear(s5, 'h_cloth', { now: 0 });  // 일반
      s5.gear.autoDismantle = 'hero';
      const thr = dismantleTargets(s5, 'threshold').map((r) => r.def.id).sort();
      const equippedIds = Object.values(s5.gear.equipped).map((u) => { const row = s5.gear.items.find((x) => x.uid === u); return row ? row.id : ''; });
      return {
        offMode: off.gear.autoDismantle, offEquipped: offRes.equipped, offKept: !offKept.auto && offKept.ok,
        lowAuto: !!lowr.auto, lowShards: lowr.shards, keepAuto: !!keepr.auto, common: !!above.auto,
        hiAuto: !!hi.auto, afterAuto, dupLike: !!legendKept.duplicate,
        eqEquipped: eq.equipped, eqAuto: !!eq.auto,
        commonAuto: !!onlyCommon.auto, heroAuto: !!heroDust.auto, legendKept: !legendKept.auto,
        thr, equippedIds, items: [s.gear.items.length - items0, s.shards - sh0],
      };
    """)
    ok(au47["offMode"] == "off" and au47["offEquipped"] is True and au47["offKept"] is True, "기본값 '끔' — 기존 저장본처럼 새 장비를 조용히 지우지 않는다", json.dumps({k: au47[k] for k in ["offMode", "offEquipped", "offKept"]}))
    ok(au47["lowAuto"] is True and au47["lowShards"] == 6 and au47["keepAuto"] is False and au47["hiAuto"] is False, "기준(고급) 이하만 자동분해 — 레어·영웅은 보관", json.dumps({"low": au47["lowShards"], "keep": au47["keepAuto"], "hi": au47["hiAuto"]}))
    ok(au47["items"] == [2, au47["lowShards"]] and au47["afterAuto"]["auto"]["count"] == 1 and au47["afterAuto"]["auto"]["shards"] == au47["lowShards"], "자동분해 — 인벤토리 미추가·강화석 증가·누적 카운터", json.dumps(au47["afterAuto"]))
    ok(au47["eqEquipped"] is True and au47["eqAuto"] is False, "빈 슬롯에 자동 장착되는 장비는 분해하지 않는다", json.dumps({"eq": au47["eqEquipped"], "auto": au47["eqAuto"]}))
    ok(au47["common"] is False and au47["commonAuto"] is True and au47["heroAuto"] is True and au47["legendKept"] is True, "등급 경계 — 일반 기준은 고급 이상 보관 · 영웅 기준은 전설만 보관", json.dumps({k: au47[k] for k in ["common", "commonAuto", "heroAuto", "legendKept"]}))
    ok(au47["thr"] == ["h_cloth", "m_clover"] and all(x not in au47["thr"] for x in au47["equippedIds"]), "기준 이하 일괄분해 대상 — 장착 중 장비 제외", json.dumps({"thr": au47["thr"], "eq": au47["equippedIds"]}, ensure_ascii=False))

    # ── 3) 자동분해: 사냥 드랍·뽑기 경로 ──
    drop47 = js(ctx, """
      const RNG = (seed) => { let x = seed; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
      const s = defaultState(0);
      for (const id of ['w_dragon', 'a_abyss', 'h_abyss', 'r_eye', 'm_grail']) acquireGear(s, id, { now: 0 });
      s.stage = 40; s.gear.autoDismantle = 'hero';
      const rng = RNG(99);
      let drops = 0, autos = 0, items0 = s.gear.items.length;
      for (let i = 0; i < 400; i++) {
        const d = tryGearDrop(s, { isBoss: true, stage: 40, buffs: { dropPct: 0 }, rng, now: 0 });
        if (d) { drops++; if (d.auto) autos++; }
      }
      const dropState = { drops, autos, items: s.gear.items.length - items0, auto: { ...s.gear.auto }, shards: s.shards };

      const g = defaultState(0);
      for (const id of ['w_dragon', 'a_abyss', 'h_abyss', 'r_eye', 'm_grail']) acquireGear(g, id, { now: 0 });
      g.gear.autoDismantle = 'hero';
      g.gold = 100000; g.gacha.cur = 'gold';
      const r = pullGear(g, 10, RNG(5));
      const autoRows = r.results.filter((x) => x.auto).length;
      return { dropState, pull: { ok: r.ok, n: r.results.length, autoRows, shards: r.shards,
        everyTagged: r.results.every((x) => x.auto || x.duplicate || x.equipped), items: g.gear.items.length } };
    """)
    ok(drop47["dropState"]["drops"] > 30 and drop47["dropState"]["autos"] > 0, "사냥·보스 드랍 — 자동분해 기준 이하가 실제로 즉시 변환", json.dumps(drop47["dropState"]))
    ok(drop47["dropState"]["auto"]["count"] == drop47["dropState"]["autos"] and drop47["dropState"]["auto"]["shards"] > 0, "드랍 자동분해 누적 — 건수·강화석이 저장 상태에 남는다", json.dumps(drop47["dropState"]["auto"]))
    ok(drop47["pull"]["ok"] is True and drop47["pull"]["n"] == 10 and drop47["pull"]["autoRows"] > 0 and drop47["pull"]["everyTagged"], "뽑기 10회 — 자동분해된 결과가 항목별로 표시", json.dumps(drop47["pull"]))

    # ── 4) 궁극기: 해금·발동·피해·쿨타임 ──
    ult47 = js(ctx, """
      const RNG = (seed) => { let x = seed; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
      const s = defaultState(0); s.jobTier = 4; s.level = 70; s.stage = 33; s.maxStage = 33;
      const b = new Battle(s, () => ({}), RNG(7), 0);
      const def = ultimateOf(s), atk = b.stats.atk, hpMax = b.stats.hpMax;
      const before = b.targets().length;
      b.player.hp = Math.round(hpMax * 0.5);
      const r = b.castUltimate(1000);
      const evs = b.drainEvents();
      const ev = evs.filter((e) => e.t === 'ultimate')[0] || null;
      const hitKinds = evs.filter((e) => e.t === 'hit' && e.kind === 'ultimate').length;
      const left = ultLeftMs(s, {}, 1200);
      const again = b.castUltimate(1200);
      const t5 = { ...s, jobTier: 5 };
      const t3 = { ...s, jobTier: 3 };
      const cdBase = ultCdOf(s, {});
      const cdCut = ultCdOf(s, { synCdrPct: 10 });
      return { name: def && def.name, mul: def && def.mul, ok: r.ok, hits: r.hits, dmg: r.dmg, atk,
        before, hitKinds, ev: ev && { hits: ev.hits, dmg: ev.dmg, name: ev.ko, tier: ev.tier, icon: ev.icon },
        casts: s.ult.casts, left, againOk: again.ok, reason: again.reason,
        hp: Math.round(b.player.hp), healed: b.player.hp >= hpMax * 0.5,
        ultUntil: b.ultUntil, ultBonus: b.ultBonus, critDmg: b.stats.critDmg,
        t5: ultimateOf(t5).name, t3: ultimateOf(t3), cdBase, cdCut,
        minTier: ULT_MIN_TIER, defs: ULTIMATES.map((u) => [u.tier, u.name, u.cd, u.mul]) };
    """)
    ok(ult47["t3"] is None and ult47["t5"] == "용신 강림" and ult47["minTier"] == 4 and ult47["name"] == "용의 심판", "궁극기 해금 — 전직 5단계부터(6단계는 용신 강림)", json.dumps({"t3": ult47["t3"], "t5": ult47["t5"], "name": ult47["name"]}, ensure_ascii=False))
    ok(ult47["ok"] is True and ult47["hits"] == ult47["before"] and ult47["hitKinds"] == ult47["hits"], "궁극기 발동 — 전장의 모든 적 타격", json.dumps({"hits": ult47["hits"], "before": ult47["before"]}))
    ok(ult47["dmg"] >= ult47["atk"] * ult47["mul"] * ult47["hits"] * 0.85 and ult47["dmg"] <= ult47["atk"] * ult47["mul"] * ult47["hits"] * ult47["critDmg"] * 1.15, "궁극기 피해 — 공격력 × 배율(치명타 포함) 범위", json.dumps({"dmg": ult47["dmg"], "atk": ult47["atk"], "mul": ult47["mul"]}))
    ok(ult47["ev"] and ult47["ev"]["name"] == "용의 심판" and ult47["ev"]["tier"] == 4 and ult47["ev"]["dmg"] == ult47["dmg"], "궁극기 이벤트 — 이름·단계·총 피해 전달(연출·로그)", json.dumps(ult47["ev"], ensure_ascii=False))
    ok(ult47["casts"] == 1 and ult47["left"] > 40000 and ult47["againOk"] is False, "궁극기 쿨타임 — 발동 뒤 재사용 차단", json.dumps({"casts": ult47["casts"], "left": ult47["left"], "again": ult47["againOk"]}))
    ok(ult47["healed"] is True and ult47["ultBonus"] == 0.5 and ult47["ultUntil"] > 1000, "궁극기 부가 효과 — 회복·공격력 버프 지속", json.dumps({"hp": ult47["hp"], "bonus": ult47["ultBonus"]}))
    ok(ult47["cdBase"] == 45000 and abs(ult47["cdCut"] - 40500) < 0.01, "궁극기 쿨타임 — 부동산 시너지 쿨감 반영", json.dumps({"base": ult47["cdBase"], "cut": ult47["cdCut"]}))

    # ── 5) 자동 시전 토글 ──
    auto47 = js(ctx, """
      const RNG = (seed) => { let x = seed; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
      const run = (opts, ticks) => {
        const s = defaultState(0); s.jobTier = 4; s.level = 70; s.stage = 33; s.maxStage = 33;
        s.autoSkill = opts.skill; s.autoUlt = opts.ult;
        const b = new Battle(s, () => ({}), RNG(13), 0);
        let t = 0;
        const c = { ult: 0, skill: 0 };
        for (let i = 0; i < ticks; i++) {
          t += 50; b.tick(50, t);
          for (const e of b.drainEvents()) { if (e.t === 'ultimate') c.ult++; else if (e.t === 'skill') c.skill++; }
        }
        return { ...c, casts: s.ult.casts };
      };
      const off = run({ skill: false, ult: false }, 1200);   // 60초
      const on = run({ skill: true, ult: true }, 1200);
      const ultOnly = run({ skill: false, ult: true }, 1200);
      return { off, on, ultOnly };
    """)
    ok(auto47["off"]["ult"] == 0 and auto47["off"]["skill"] == 0, "자동 시전 토글 끔 — 스킬·궁극기 모두 손으로만", json.dumps(auto47["off"]))
    ok(auto47["on"]["ult"] >= 1 and auto47["on"]["skill"] > 10 and auto47["on"]["casts"] == auto47["on"]["ult"], "자동 시전 켬 — 스킬·궁극기 자동 발동", json.dumps(auto47["on"]))
    ok(auto47["ultOnly"]["ult"] >= 1 and auto47["ultOnly"]["skill"] == 0, "궁극기만 자동 — 스킬 자동을 꺼도 궁극기는 발동", json.dumps(auto47["ultOnly"]))

    # ── 6) 저장 호환·마이그레이션 ──
    mig47 = js(ctx, """
      const full = { ...defaultState(0) };
      delete full.autoSkill; delete full.autoUlt; delete full.ult;
      delete full.gear.autoDismantle; delete full.gear.auto;
      full.jobTier = 4; full.level = 70; full.maxStage = 33;
      const mig = normalizeState(JSON.parse(JSON.stringify(full)), 0);
      const kept = normalizeState({ ver: 3, jobTier: 5, autoSkill: false, autoUlt: false, ult: { last: 900, casts: 7 },
        gear: { items: [{ uid: 1, id: 'w_dragon', at: 0 }], equipped: { weapon: 1 }, autoDismantle: 'rare', auto: { count: 5, shards: 70 } } }, 0);
      const bad = normalizeState({ ver: 3, autoSkill: 'no', autoUlt: 0, ult: { last: -5, casts: 'x' },
        gear: { autoDismantle: 'zzz', auto: { count: -3, shards: 'NaN' } } }, 0);
      const v46 = { ver: 3, level: 40, stage: 24, maxStage: 24, gold: 1234, jobTier: 3,
        gear: { items: [{ uid: 3, id: 'w_flame', at: 0 }, { uid: 4, id: 'a_guard', at: 0 }], equipped: { weapon: 3 }, nextUid: 5, seen: { w_flame: 1 }, drops: 2, bulk: 1 } };
      const back = normalizeState(v46, 0);
      return { mig: [mig.autoSkill, mig.autoUlt, mig.ult, mig.gear.autoDismantle, mig.gear.auto],
        kept: [kept.autoSkill, kept.autoUlt, kept.ult, kept.gear.autoDismantle, kept.gear.auto, kept.jobTier],
        bad: [bad.autoSkill, bad.autoUlt, bad.ult, bad.gear.autoDismantle, bad.gear.auto],
        v46: [back.gear.items.length, back.gear.equipped.weapon, back.gold, back.jobTier] };
    """)
    ok(mig47["mig"] == [True, True, {"last": 0, "casts": 0}, "off", {"count": 0, "shards": 0}], "v4.6 저장본 → 새 설정 기본값(자동 시전 켬 · 자동분해 끔) 마이그레이션", json.dumps(mig47["mig"]))
    ok(mig47["kept"] == [False, False, {"last": 900, "casts": 7}, "rare", {"count": 5, "shards": 70}, 5], "저장된 토글·궁극기 상태·자동분해 설정 보존", json.dumps(mig47["kept"]))
    ok(mig47["bad"] == [True, True, {"last": 0, "casts": 0}, "off", {"count": 0, "shards": 0}], "손상 값 방어 — 잘못된 토글·음수·문자 정리", json.dumps(mig47["bad"]))
    ok(mig47["v46"] == [2, 3, 1234, 3], "기존 장비 인벤토리·장착·골드·전직 그대로 유지", json.dumps(mig47["v46"]))

    # ── 7) UI — 자동분해 설정·궁극기 카드·설정 토글 ──
    tpl47 = js(ctx2, """
      const mk = (s) => { const buffs = computeBuffs(s, 0); return { s, battle: { stats: calcStats(s, buffs), def: stageDef(s.stage), boss: null, player: { hp: 100 } },
        app: { buffs }, logs: [], tab: 'gear', el: {}, install: { hidden: true } }; };
      const s = defaultState(0); s.jobTier = 4; s.level = 70; s.stage = 33; s.maxStage = 33; s.gold = 90000; s.shards = 300;
      for (const id of ['w_dragon', 'a_abyss', 'h_abyss', 'r_eye', 'm_grail']) acquireGear(s, id, { now: 0 });
      acquireGear(s, 'a_plate', { now: 0 });   // 고급 — 기준을 켜기 전에 보관
      acquireGear(s, 'h_cloth', { now: 0 });   // 일반
      acquireGear(s, 'a_guard', { now: 0 });   // 레어
      s.gear.autoDismantle = 'advanced';
      s.gear.auto = { count: 12, shards: 180 };
      const ui = mk(s);
      ui.huntSub = 'skill';
      const gear = __tpls.gear(ui), hunt = __tpls.hunt(ui), settings = __tpls.settings(ui);
      const s0 = defaultState(0); const ui0 = mk(s0); ui0.huntSub = 'skill';
      const hunt0 = __tpls.hunt(ui0), gear0 = __tpls.gear(ui0);
      const s5 = { ...s, jobTier: 5 }; const hunt5 = __tpls.hunt(mk(s5));
      return { gear, hunt, settings, hunt0, gear0, hunt5,
        chips: ['off', 'common', 'advanced', 'rare', 'hero'].map((m) => gear.includes('data-action="gear-auto" data-value="' + m + '"')),
        bulk: gear.includes('data-value="threshold"'), stat: gear.includes('누적 12개') && gear.includes('💎180'),
        modeText: gear.includes('고급 이하'), offText: gear0.includes('끔 — 새 장비는 모두 인벤토리에 보관됩니다'),
        ultName: hunt.includes('용의 심판') && hunt.includes('data-action="cast-ult"') && hunt.includes('data-action="toggle-auto-ult"'),
        ult5: hunt5.includes('용신 강림'), ultLocked: hunt0.includes('드래곤 로드') && !hunt0.includes('data-action="cast-ult"'),
        autoSkill: hunt.includes('data-action="toggle-auto-skill"') && settings.includes('스킬 자동 시전'),
        autoUlt: settings.includes('궁극기 자동 발동') && settings.includes('data-action="toggle-auto-ult"'),
        bad: /undefined|NaN/.test(gear + hunt + settings + hunt0 + gear0 + hunt5) };
    """)
    ok(tpl47["chips"] == [True] * 5 and tpl47["modeText"] and tpl47["offText"], "장비 탭 — 자동분해 5단계 칩(끔·일반·고급·레어·영웅)과 상태 문구", json.dumps({"chips": tpl47["chips"]}))
    ok(tpl47["stat"] is True and tpl47["bulk"] is True, "장비 탭 — 누적 자동분해 건수·강화석·기준 이하 일괄분해 버튼", "")
    ok(tpl47["ultName"] is True and tpl47["ult5"] is True and tpl47["ultLocked"] is True, "사냥 탭 — 궁극기 카드(시전·자동 발동) / 용신 강림 / 해금 전 잠금 안내", "")
    ok(tpl47["autoSkill"] is True and tpl47["autoUlt"] is True, "설정·스킬 카드 — 자동 시전·궁극기 자동 발동 토글", "")
    ok(tpl47["bad"] is False, "v4.7 템플릿에 undefined/NaN 누출 없음")

    readme47 = read("README.md")
    ok(all(x in readme47 for x in ["v4.7.0", "자동분해", "궁극기", "용의 심판"]), "README — v4.7 자동분해·궁극기 반영", "")

    # ══════════════════════════ [24] v4.8 ☁️ 클라우드 세이브 · 🏆 랭킹 ══════════════════════════
    section("[24] ☁️ v4.8 선택적 클라우드 세이브 · 🏆 랭킹")

    # ── 1) 닉네임 · 요약 · 문서 직렬화 ──
    cl_a = js(ctx, """
      const s = defaultState(1000);
      s.level = 42; s.stage = 18; s.maxStage = 18; s.peakStage = 21;
      s.gold = 123456;
      s.land.owned[CITIES[0].key] = 30; s.land.owned[CITIES[1].key] = 12;
      s.lastActiveAt = 5000;
      s.cloud.nick = '효성왕';
      const sum = cloudSummary(s, 5000);
      const doc = buildCloudDoc(s, { uid: 'uid-abc', now: 7000 });
      const before = s.gold;
      doc.save.gold = 1;                    // 문서의 save 는 사본이어야 한다
      const n1 = defaultNick('uid-abc'); const n2 = defaultNick('uid-abc');
      const digits = n1.slice(2);
      return {
        nick: [n1, n1 === n2, n1.slice(0, 2), digits.length, String(Number(digits)) === digits],
        clean: [sanitizeNick('  효성  왕  ', 'u'), sanitizeNick('a', 'u').slice(0, 2),
                sanitizeNick('', 'u').slice(0, 2), sanitizeNick('가나다라마바사아자차카타파하', 'u').length],
        html: /[<>&"']/.test(sanitizeNick('<b>효성</b> & "친구"', 'u')),
        sum: [sum.level, sum.stage, sum.cities, sum.ts, sum.totalAsset > before],
        doc: [doc.kind, doc.v, doc.uid, doc.nick, doc.level, doc.stage, doc.ts, doc.save.gold, before],
        size: JSON.stringify(doc).length,
      };
    """)
    ok(cl_a["nick"][0].startswith("용사") and cl_a["nick"][1] and cl_a["nick"][3] == 4 and cl_a["nick"][4], "기본 닉네임 — 같은 uid 는 같은 '용사####' (실명 미노출)", json.dumps(cl_a["nick"], ensure_ascii=False))
    ok(cl_a["clean"][0] == "효성 왕" and cl_a["clean"][3] == 12 and not cl_a["html"], "닉네임 정리 — 공백 접기·12자 제한·HTML 문자 제거", json.dumps(cl_a["clean"], ensure_ascii=False))
    ok(cl_a["clean"][1] == "용사" and cl_a["clean"][2] == "용사", "1자·빈 닉네임은 기본 이름으로 대체", json.dumps(cl_a["clean"][:3], ensure_ascii=False))
    ok(cl_a["sum"] == [42, 21, 2, 5000, True], "세이브 요약 — 역대 최고 스테이지·보유 지역·총자산", json.dumps(cl_a["sum"]))
    ok(cl_a["doc"][:6] == ["land_rpg_save", EXPECTED_VER, "uid-abc", "효성왕", 42, 21] and cl_a["doc"][7] == 1 and cl_a["doc"][8] == 123456, "클라우드 문서 — 형식·버전·uid·닉네임·요약 + 원본 세이브는 그대로", json.dumps(cl_a["doc"], ensure_ascii=False))
    ok(0 < cl_a["size"] < 200000, "클라우드 문서 크기 RTDB 한도 안(200KB 미만)", str(cl_a["size"]))

    # ── 2) 문서 해석(신형·v2 옛 페이로드·손상) ──
    cl_b = js(ctx, """
      const s = defaultState(0); s.level = 9; s.stage = 3; s.maxStage = 3; s.peakStage = 7; s.gold = 900;
      const doc = buildCloudDoc(s, { uid: 'u1', now: 1000, nick: '테스터' });
      const a = readCloudDoc(JSON.parse(JSON.stringify(doc)));
      const b = readCloudDoc({ level: 33, stage: 17, kills: 317, name: 'HyosungK', time: 1795426582912, uid: 'old' });
      const c = readCloudDoc(null);
      const d = readCloudDoc('nope');
      const e = readCloudDoc({ save: { level: 5, stage: 4, gold: 10 } });
      return {
        a: [a.ok, a.restorable, a.summary.level, a.summary.stage, a.summary.nick, a.summary.totalAsset > 0],
        b: [b.ok, b.restorable, b.summary.level, b.summary.stage, b.summary.ts],
        c: [c.ok, c.doc === null, c.restorable],
        d: d.ok, e: [e.ok, e.restorable, e.summary.stage],
      };
    """)
    ok(cl_b["a"][:5] == [True, True, 9, 7, "테스터"] and cl_b["a"][5], "문서 읽기 — v4.8 형식은 요약·복원 가능", json.dumps(cl_b["a"], ensure_ascii=False))
    ok(cl_b["b"] == [True, False, 33, 17, 1795426582912], "옛 rpg 기록(stage/level/time)도 읽어 랭킹용 요약으로 변환", json.dumps(cl_b["b"]))
    ok(cl_b["c"] == [True, True, False] and cl_b["d"] is False, "빈 값은 정상(세이브 없음), 손상 값은 거부", json.dumps(cl_b))
    ok(cl_b["e"] == [True, True, 4], "save 만 있는 예전 문서도 복원 가능", json.dumps(cl_b["e"]))

    # ── 3) 진행도 비교 · 충돌 판정 ──
    cl_c = js(ctx, """
      const P = (stage, asset, level) => ({ stage: stage, totalAsset: asset, level: level || 1, ts: 0 });
      const L = (o) => ({ stage: o.stage || 1, totalAsset: o.totalAsset || 0, level: o.level || 1, ts: o.ts || 0 });
      const cp = [compareProgress(P(20, 100), P(18, 900)), compareProgress(P(18, 900), P(20, 100)),
                  compareProgress(P(20, 1000), P(20, 1005)), compareProgress(P(20, 1000), P(20, 1200)),
                  compareProgress(P(20, 1000, 9), P(20, 1000, 12))];
      const empty = compareSaves(L({ stage: 5, totalAsset: 100, ts: 1000 }), null);
      const same = compareSaves(L({ stage: 5, totalAsset: 100, ts: 1000 }), { stage: 5, totalAsset: 100, ts: 1000 });
      const localAhead = compareSaves(L({ stage: 9, ts: 1000 }), { stage: 5, ts: 2000 });
      const cloudAhead = compareSaves(L({ stage: 5, ts: 3000 }), { stage: 9, ts: 1000 });
      const conflict = compareSaves(L({ stage: 5, ts: 900000 }), { stage: 9, ts: 1000 });
      const cloudNewer = compareSaves(L({ stage: 5, ts: 1000 }), { stage: 5, ts: 300000 });
      const localNewer = compareSaves(L({ stage: 5, ts: 900000 }), { stage: 5, ts: 1000 });
      return {
        cp: cp,
        acts: [empty.action, empty.why, same.action, localAhead.action, cloudAhead.action, conflict.action, cloudNewer.action, localNewer.action],
        rec: [conflict.why, cloudAhead.recommend, localAhead.recommend],
        delta: [cloudAhead.delta.stage, cloudNewer.delta.stage],
      };
    """)
    ok(cl_c["cp"] == [1, -1, 0, -1, -1], "진행도 비교 — 스테이지 → 총자산(1% 오차 무시) → 레벨", json.dumps(cl_c["cp"]))
    ok(cl_c["acts"] == ["upload", "cloud-empty", "same", "upload", "download", "conflict", "download", "upload"], "충돌 판정 — 비었음/같음/로컬앞섬/클라우드앞섬/양쪽 플레이/최신 우선", json.dumps(cl_c["acts"]))
    ok(cl_c["rec"] == ["cloud-ahead-but-local-newer", "cloud", "local"], "충돌 시 추천 — 더 앞선 쪽을 기본으로", json.dumps(cl_c["rec"]))
    ok(cl_c["delta"] == [4, 0], "차이 요약(스테이지 단위)", json.dumps(cl_c["delta"]))

    # ── 4) 랭킹 정렬·순위·표기 ──
    cl_d = js(ctx, """
      const map = {
        a: { name: '알파', level: 70, stage: 40, totalAsset: 200, time: 10 },
        b: { name: '베타', level: 60, stage: 30, totalAsset: 900, time: 20 },
        c: { name: '감마', level: 65, stage: 30, totalAsset: 500, time: 30 },
        d: { name: '델타', level: 10, stage: 5, totalAsset: 50, time: 5 },
        old: { name: 'HyosungK', level: 33, stage: 17, kills: 317, time: 1795426582912 },
        junk: { nope: 1 },
      };
      const byStage = rankRows(map, 'stage', { limit: 3 });
      const byAsset = rankRows(map, 'asset', { limit: 3 });
      const many = {};
      for (let i = 0; i < 25; i += 1) many['u' + i] = { name: '유' + i, level: 1, stage: i + 1, totalAsset: i, time: i };
      const top = rankRows(many, 'stage');
      const me = rankOf(byStage.all, 'c');
      return {
        ranks: byStage.all.map((r) => r.rank + '/' + r.uid),
        count: [byStage.count, top.rows.length, top.all.length],
        assetFirst: byAsset.rows.map((r) => r.uid + ':' + r.value),
        top1: top.rows[0].uid, topLast: top.rows[19].uid,
        me: me ? [me.rank, me.name] : null,
        old: normalizeRankRow(map.old, 'old'),
        values: [rankValueText('stage', { stage: 24 }), rankValueText('asset', { totalAsset: 1.2e12 }), rankValueText('asset', { totalAsset: 5.5e8 })],
        fmt: [formatAsset(1.2e12), formatAsset(5.5e8), formatAsset(1234)],
      };
    """)
    ok(cl_d["ranks"] == ["1/a", "2/b", "2/c", "4/old", "5/d"], "랭킹 정렬 — 최고 스테이지 내림차순(동점은 같은 순위 1·2·2·4·5)", json.dumps(cl_d["ranks"], ensure_ascii=False))
    ok(cl_d["count"] == [5, 20, 25], "랭킹 — 참가자 수는 전체, 표시는 TOP 20", json.dumps(cl_d["count"]))
    ok(cl_d["assetFirst"] == ["b:900", "c:500", "a:200"], "총자산 정렬 — 금액 기준", json.dumps(cl_d["assetFirst"]))
    ok(cl_d["top1"] == "u24" and cl_d["topLast"] == "u5", "25명 중 TOP 20 절단", json.dumps([cl_d["top1"], cl_d["topLast"]]))
    ok(cl_d["me"] == [2, "감마"], "내 순위 조회(동점 포함 전체 기준)", json.dumps(cl_d["me"], ensure_ascii=False))
    ok(cl_d["old"] == {"uid": "old", "name": "HyosungK", "level": 33, "stage": 17, "gold": 0, "totalAsset": 0, "cities": 0, "rebirth": 0, "towerBest": 0, "dailyBest": 0, "dailyGrade": "D", "title": "", "time": 1795426582912, "hasAsset": False, "hasTower": False, "hasDaily": False}, "옛 랭킹 항목 정규화(없는 값은 0 · 총자산/탑/일일 없음 표시)", json.dumps(cl_d["old"], ensure_ascii=False))
    ok(cl_d["values"] == ["S24", "💰1.20조", "💰5.50억"], "랭킹 값 표기 — S24 · 조/억 축약", json.dumps(cl_d["values"], ensure_ascii=False))
    ok(js(ctx, "return rankValueText('asset', { totalAsset: 0, hasAsset: false });") == "—", "총자산 기록이 없는 옛 항목은 '—' (0으로 보이지 않게)")
    ok(cl_d["fmt"][:2] == ["1.20조", "5.50억"] and cl_d["fmt"][2].replace(",", "") == "1234", "총자산 포맷 — 조·억·원 단위", json.dumps(cl_d["fmt"], ensure_ascii=False))

    # ── 5) 상태 문구 · 오류 문구 · 유틸 ──
    cl_e = js(ctx, """
      const st = ['guest', 'connecting', 'online', 'offline', 'error'].map((k) => cloudStatusText({ status: k }).label);
      const errs = [describeAuthError('auth/unauthorized-domain'), describeAuthError('timeout'),
                    describeAuthError('auth/popup-blocked'), describeNetError({ code: 'PERMISSION_DENIED' }),
                    describeNetError({ code: 'timeout' }), describeNetError({ code: 'sdk' })];
      const strip = stripUndefined({ a: 1, b: undefined, c: NaN, d: 1, e: { x: 2, y: undefined }, f: [1, undefined, 3] });
      const s = defaultState(0); s.level = 12; s.stage = 5; s.maxStage = 5; s.peakStage = 9;
      const entry = rankEntryOf(s, { uid: 'u1', now: 777 });
      return { st, errs, strip: JSON.stringify(strip),
               metrics: [rankMetricLabel('stage'), rankMetricLabel('asset')],
               entry: [entry.name.slice(0, 2), entry.stage, entry.level, entry.time, entry.v, entry.uid] };
    """)
    ok(cl_e["st"] == ["게스트 (이 기기에만 저장)", "연결 중…", "클라우드 연결됨", "오프라인 — 게스트 저장 중", "클라우드 오류"], "상태 문구 — 게스트/연결중/연결됨/오프라인/오류", json.dumps(cl_e["st"], ensure_ascii=False))
    ok(cl_e["errs"][0].startswith("이 주소가") and "응답이 없습니다" in cl_e["errs"][1] and cl_e["errs"][3].startswith("권한") and "시간 초과" in cl_e["errs"][4] and "라이브러리" in cl_e["errs"][5], "오류 문구 — 승인 도메인/시간 초과/권한/라이브러리", json.dumps(cl_e["errs"], ensure_ascii=False))
    ok(cl_e["strip"] == '{"a":1,"d":1,"e":{"x":2},"f":[1,3]}', "RTDB 전송 전 undefined·NaN 제거", cl_e["strip"])
    ok(cl_e["metrics"] == ["최고 스테이지", "총자산"], "랭킹 지표 이름", json.dumps(cl_e["metrics"], ensure_ascii=False))
    ok(cl_e["entry"] == ["용사", 9, 12, 777, EXPECTED_VER, "u1"], "랭킹 등록 항목 — 역대 최고·레벨·시각·버전", json.dumps(cl_e["entry"], ensure_ascii=False))

    # ── 6) 세이브 호환 · 마이그레이션 ──
    mig48 = js(ctx, """
      const v47 = { ver: 3, level: 44, stage: 26, maxStage: 26, peakStage: 31, gold: 777, soundOn: false };
      const a = normalizeState(v47, 5000);
      const b = normalizeState({ ...v47, cloud: { enabled: 'yes', nick: '가나다라마바사아자차카타파하', autoSync: 'no', lastSync: -50, uid: 5 } }, 5000);
      const d = defaultState(0);
      const raw = JSON.parse(JSON.stringify(a));
      return { a: [a.cloud.enabled, a.cloud.autoSync, a.cloud.nick, a.level, a.peakStage, a.gold, a.soundOn],
               b: [b.cloud.enabled, b.cloud.autoSync, b.cloud.nick.length, b.cloud.lastSync, b.cloud.uid],
               d: [d.cloud.enabled, d.cloud.autoSync, d.cloud.nick],
               key: SAVE_KEY, ver: raw.ver };
    """)
    ok(mig48["a"] == [False, True, "", 44, 31, 777, False], "v4.7 저장본 → 클라우드 기본 꺼짐, 기존 진행도 그대로", json.dumps(mig48["a"], ensure_ascii=False))
    ok(mig48["b"] == [False, True, 12, 0, ""], "손상된 클라우드 설정 방어(문자·음수·타입)", json.dumps(mig48["b"], ensure_ascii=False))
    ok(mig48["d"] == [False, True, ""] and mig48["key"] == "land_rpg_unified_v3" and mig48["ver"] == 3, "새 세이브는 게스트 기본값 · 저장 키/버전 유지", json.dumps(mig48, ensure_ascii=False))

    # ── 7) CloudSync — 로그인·저장·랭킹·실패 경로(가짜 SDK) ──
    ctx3 = quickjs.Context()
    ctx3.eval(bundle(FILES))
    ctx3.eval("""
      globalThis.__out = {};
      globalThis.__never = function () { return 0; };
      globalThis.__nowTimer = function (fn) { fn(); return 0; };
      globalThis.__sdk = function (store, opts) {
        opts = opts || {};
        const calls = [];
        const sdk = {
          auth: {}, db: {},
          GoogleAuthProvider: function () { this.setCustomParameters = function () {}; },
          onAuthStateChanged: function (auth, cb) { auth._cb = cb; },
          signInWithPopup: async function (auth) {
            if (opts.popupError) { const e = new Error('popup'); e.code = opts.popupError; throw e; }
            const u = { uid: opts.uid || 'uid-1', displayName: '테스터', email: 't@example.com', photoURL: '' };
            if (auth._cb) auth._cb(u);
            return { user: u };
          },
          signInWithRedirect: async function () { calls.push('redirect'); },
          getRedirectResult: async function () { return { user: { uid: 'uid-r', displayName: '복귀', email: 'r@e.com' } }; },
          signOut: async function (auth) { if (auth._cb) auth._cb(null); },
          ref: function (db, path) { return { path: path }; },
          get: async function (r) {
            calls.push(['get', r.path]);
            if (opts.failGet) { const e = new Error('denied'); e.code = opts.failGet; throw e; }
            if (opts.hangGet) return new Promise(function () {});
            const v = store[r.path];
            return { exists: function () { return v !== undefined && v !== null; }, val: function () { return v === undefined ? null : v; } };
          },
          set: async function (r, val) {
            calls.push(['set', r.path, val]);
            if (opts.failSet) { const e = new Error('denied'); e.code = opts.failSet; throw e; }
            store[r.path] = val;
            return true;
          },
          _calls: calls,
        };
        return sdk;
      };
    """)
    ctx3.eval("""
      const store1 = {};
      __out.c1 = new CloudSync({ loadSdk: async () => __sdk(store1), setTimeout: __never, now: () => 1000 });
      __out.c1.signIn().then((r) => { __out.signIn = [r.ok, __out.c1.status, __out.c1.uid, __out.c1.user.email]; });

      __out.c2 = new CloudSync({ loadSdk: async () => __sdk({}, { popupError: 'auth/popup-blocked' }), setTimeout: __never });
      __out.c2.signIn().then((r) => { __out.popup = [r.ok, !!r.retryRedirect, r.code, __out.c2.status, __out.c2.signedIn]; });

      __out.c3 = new CloudSync({ loadSdk: async () => { throw new Error('Failed to fetch'); }, setTimeout: __never });
      __out.c3.signIn().then((r) => { __out.sdkFail = [r.ok, __out.c3.status, __out.c3.signedIn, /라이브러리/.test(r.message)]; });

      __out.c4 = new CloudSync({ loadSdk: async () => __sdk({}), setTimeout: __never });
      __out.c4.readSave('uid-1').then((r) => { __out.emptySave = [r.ok, r.loaded.doc === null, r.loaded.restorable]; });

      __out.c5 = new CloudSync({ loadSdk: async () => __sdk({}, { failGet: 'PERMISSION_DENIED' }), setTimeout: __never });
      __out.c5.readSave('uid-1').then((r) => { __out.denied = [r.ok, /권한/.test(r.message), __out.c5.status]; });

      const store6 = {};
      __out.c6 = new CloudSync({ loadSdk: async () => __sdk(store6), setTimeout: __never, now: () => 5000 });
      __out.c6.writeSave({ uid: 'u9', ts: 4, kind: 'land_rpg_save', level: 3 }).then((r) => {
        __out.write = [r.ok, __out.c6.lastSync, __out.c6.status, store6['rpg/u9'].uid, store6['rpg/u9'].ts, store6['rpg/u9'].level];
      });

      __out.c7 = new CloudSync({ loadSdk: async () => __sdk({}), setTimeout: __never });
      __out.c7.writeSave({}).then((r) => { __out.noUser = [r.ok, r.code]; });

      const store8 = {};
      __out.c8 = new CloudSync({ loadSdk: async () => __sdk(store8), setTimeout: __never });
      __out.c8.writeRank({ uid: 'u8', name: '테스터', stage: 3 }).then(() => { __out.rank = store8['rpg_rankings/u8'].name; });

      const store9 = { rpg_rankings: { a: { name: 'A', level: 5, stage: 10, totalAsset: 100, time: 1 }, b: { name: 'B', level: 3, stage: 7, totalAsset: 900, time: 2 } } };
      __out.c9 = new CloudSync({ loadSdk: async () => __sdk(store9), setTimeout: __never });
      __out.c9.readRank('asset').then((r) => { __out.rankBoard = [r.ok, __out.c9.rank.rows[0].uid, __out.c9.rank.count, __out.c9.rank.key]; });

      __out.c10 = new CloudSync({ loadSdk: async () => __sdk({}, { failGet: 'boom' }), setTimeout: __never });
      __out.c10.readRank('stage').then((r) => { __out.rankFail = [r.ok, __out.c10.rank.loading, !!__out.c10.rank.error]; });

      __out.c11 = new CloudSync({ loadSdk: async () => __sdk({}), setTimeout: __never });
      __out.c11.signIn().then(() => __out.c11.signOut()).then(() => { __out.signOut = [__out.c11.status, __out.c11.uid, __out.c11.signedIn]; });

      let loads = 0;
      __out.c12 = new CloudSync({ loadSdk: async () => { loads += 1; return __sdk({}); }, setTimeout: __never });
      __out.c12.completeRedirect().then((r) => { __out.noPending = [r.ok, r.code, loads]; });

      const flags = {};
      const flagStore = { get: (k) => flags[k], set: (k, v) => { flags[k] = v; }, remove: (k) => { delete flags[k]; } };
      __out.c13 = new CloudSync({ loadSdk: async () => __sdk({}), setTimeout: __never, flagStore: flagStore });
      __out.c13.hasPendingRedirect() && (__out.badFlag = true);
      __out.c13.signInRedirect().then(() => __out.c13.completeRedirect()).then((r) => {
        __out.redirect = [r.ok, __out.c13.uid, __out.c13.hasPendingRedirect()];
      });

      __out.c14 = new CloudSync({ loadSdk: async () => { throw new Error('offline'); }, setTimeout: __never });
      __out.c14.restoreSession(100).then((v) => { __out.restore = [v, __out.c14.signedIn]; });

      __out.c15 = new CloudSync({ loadSdk: async () => __sdk({}, { hangGet: true }), setTimeout: __nowTimer });
      __out.c15.readSave('u1').then((r) => { __out.hang = [r.ok, r.code, /시간 초과/.test(r.message), __out.c15.status]; });

      let loadCount = 0;
      __out.c16 = new CloudSync({ loadSdk: async () => { loadCount += 1; return __sdk({}); }, setTimeout: __never });
      __out.guestOnly = [__out.c16.status, __out.c16.signedIn, loadCount];
    """)
    drain(ctx3)
    cl_f = json.loads(ctx3.eval("JSON.stringify(__out)"))
    ok(cl_f["signIn"] == [True, "online", "uid-1", "t@example.com"], "Google 로그인 성공 — online 상태·uid·계정 표시", json.dumps(cl_f["signIn"]))
    ok(cl_f["popup"] == [False, True, "auth/popup-blocked", "error", False], "팝업 차단 — 리다이렉트 안내, 로그인 안 된 채 게스트 유지", json.dumps(cl_f["popup"]))
    ok(cl_f["sdkFail"] == [False, "offline", False, True], "SDK 로드 실패(오프라인) — 게스트 폴백 + 안내 문구", json.dumps(cl_f["sdkFail"]))
    ok(cl_f["emptySave"] == [True, True, False], "빈 클라우드 — 오류 아님(세이브 없음)", json.dumps(cl_f["emptySave"]))
    ok(cl_f["denied"] == [False, True, "error"], "권한 거부 — 문장으로 안내(크래시 없음)", json.dumps(cl_f["denied"]))
    ok(cl_f["write"] == [True, 5000, "online", "u9", 4, 3], "클라우드 저장 — rpg/{uid} 경로·타임스탬프 유지", json.dumps(cl_f["write"]))
    ok(cl_f["noUser"] == [False, "no-user"], "로그인 없이 저장 시도 — 조용히 거부", json.dumps(cl_f["noUser"]))
    ok(cl_f["rank"] == "테스터", "랭킹 쓰기 — rpg_rankings/{uid}", cl_f["rank"])
    ok(cl_f["rankBoard"] == [True, "b", 2, "asset"], "랭킹 읽기 — 총자산 정렬·참가자 수", json.dumps(cl_f["rankBoard"]))
    ok(cl_f["rankFail"] == [False, False, True], "랭킹 실패 — 로딩 종료 + 오류 문구", json.dumps(cl_f["rankFail"]))
    ok(cl_f["signOut"] == ["guest", "", False], "로그아웃 — 게스트로 복귀", json.dumps(cl_f["signOut"]))
    ok(cl_f["noPending"] == [False, "no-pending", 0], "리다이렉트 표시가 없으면 네트워크를 쓰지 않는다", json.dumps(cl_f["noPending"]))
    ok(cl_f["redirect"] == [True, "uid-r", False], "이동식 로그인 복귀 — 표시 1회 소모 후 로그인 완료", json.dumps(cl_f["redirect"]))
    ok(cl_f["restore"] == [False, False], "세션 복원 실패 — 무한 대기 없이 게스트 유지", json.dumps(cl_f["restore"]))
    ok(cl_f["hang"] == [False, "timeout", True, "offline"], "응답 없는 서버 — 시간 초과로 끊고 게스트 유지(로딩 없음)", json.dumps(cl_f["hang"]))
    ok(cl_f["guestOnly"] == ["guest", False, 0], "객체 생성만으로는 SDK·네트워크를 건드리지 않는다", json.dumps(cl_f["guestOnly"]))

    # ── 8) 설정 탭 UI — 클라우드 카드 · 랭킹 카드 ──
    ui48 = js(ctx2, """
      const mk = (cloud) => { const s = defaultState(0); const buffs = computeBuffs(s, 0);
        return { s, battle: { stats: calcStats(s, buffs), def: stageDef(s.stage), boss: null, player: { hp: 100 } },
          app: { buffs, cloud }, logs: [], tab: 'settings', el: {}, install: { hidden: true } }; };
      const guest = { status: 'guest', rank: { key: 'stage', rows: [], all: [], count: 0, at: 0, loading: false, error: '' } };
      const g = __tpls.settings(mk(guest));
      const rows = [
        { rank: 1, uid: 'a', name: '강자', level: 70, stage: 40, totalAsset: 1.2e12, time: 1 },
        { rank: 2, uid: 'uid-1', name: '나', level: 42, stage: 30, totalAsset: 5e8, time: 2 },
        { rank: 2, uid: 'b', name: '동점', level: 41, stage: 30, totalAsset: 4e8, time: 3 },
      ];
      const on = { status: 'online', uid: 'uid-1', user: { name: '효성', email: 'h@e.com' }, lastSync: 1000,
        rank: { key: 'stage', rows: rows, all: rows, count: 3, at: 5, loading: false, error: '' } };
      const ui = mk(on);
      ui.s.cloud.nick = '효성왕';
      ui.s.cloud.enabled = true;
      const o = __tpls.settings(ui);
      // 세션만 남고 이 앱에서 클라우드를 끔(게스트) 상태 — '연결됨'으로 보이면 안 된다
      const sessionOnly = __tpls.settings(mk({ status: 'online', uid: 'uid-9', user: { email: 'x@e.com' },
        rank: { key: 'stage', rows: [], all: [], count: 0, at: 0, loading: false, error: '' } }));
      const loading = __tpls.settings(mk({ status: 'connecting', rank: { key: 'asset', rows: [], all: [], count: 0, at: 0, loading: true, error: '' } }));
      const err = __tpls.settings(mk({ status: 'error', lastError: '권한이 없습니다', rank: { key: 'stage', rows: [], all: [], count: 0, at: 1, loading: false, error: '권한이 없습니다' } }));
      return {
        guest: [g.includes('data-action=\"cloud-signin\"'), g.includes('게스트'), g.includes('Google로 클라우드 켜기'), g.includes('data-action=\"cloud-save\"')],
        on: [o.includes('data-action=\"cloud-save\"'), o.includes('data-action=\"cloud-load\"'), o.includes('data-action=\"cloud-signout\"'),
             o.includes('data-action=\"cloud-auto\"'), o.includes('id=\"cloudNick\"'), o.includes('value=\"효성왕\"'), o.includes('h@e.com')],
        rank: [o.includes('🥇'), o.includes('rank-row me'), o.includes('내 순위'), o.includes('S40'), o.includes('data-action=\"cloud-rank\" data-value=\"asset\"')],
        emptyGuest: [g.includes('🏆 랭킹 불러오기'), g.includes('data-action=\"cloud-rank-refresh\"')],
        loading: loading.includes('불러오는 중'),
        holdOff: g.includes('data-action=\"cloud-compare\"'),
        sessionOnly: [sessionOnly.includes('이어서 클라우드 켜기'), sessionOnly.includes('로그인 세션'), sessionOnly.includes('data-action=\"cloud-save\"'), sessionOnly.includes('id=\"cloudNick\"')],
        err: err.includes('다시 시도'),
        order: g.indexOf('cloud-card') < g.indexOf('세이브 코드 백업'),
        hold: __tpls.settings((() => { const m = mk(on); m.s.cloud.enabled = true; m.app._cloudHold = true; return m; })()).includes('data-action=\"cloud-compare\"'),
        bad: /undefined|NaN/.test(g + o + loading + err),
      };
    """)
    ok(ui48["guest"][:3] == [True, True, True] and ui48["guest"][3] is False, "설정 탭(게스트) — 로그인 유도만 있고 저장 버튼은 없다", json.dumps(ui48["guest"]))
    ok(all(ui48["on"]), "설정 탭(연결됨) — 저장·불러오기·로그아웃·자동저장·닉네임 입력", json.dumps(ui48["on"]))
    ok(all(ui48["rank"]), "랭킹 카드 — 메달·내 행 강조·내 순위·총자산·지표 전환", json.dumps(ui48["rank"]))
    ok(all(ui48["emptyGuest"]) and ui48["loading"] and ui48["err"], "랭킹 카드 — 빈 목록/불러오는 중/오류 상태", json.dumps({"e": ui48["emptyGuest"], "l": ui48["loading"], "x": ui48["err"]}))
    ok(ui48["hold"] is True and ui48["holdOff"] is False, "비교 대기 상태 — 카드에 '비교해서 고르기' 안내(게스트에는 없음)")
    ok(ui48["order"], "클라우드 카드는 설정 탭 맨 위(설정 탭을 열면 바로 보임)")
    ok(ui48["sessionOnly"] == [True, True, False, False], "세션만 남은 브라우저 — 게스트 카드 + '이어서 켜기'(저장 버튼·닉네임 없음)", json.dumps(ui48["sessionOnly"]))
    ok(ui48["bad"] is False, "v4.8 설정 템플릿에 undefined/NaN 누출 없음")

    # ── 9) 화면·서비스워커 · 문서 배선 ──
    idx48 = read("index.html")
    ok('data-tab="settings"' in idx48 and 'id="settingsTabDot"' in idx48, "설정 탭 — 클라우드 문제 알림 점(상단 HUD 레이아웃은 그대로)")
    ok("gstatic" not in idx48 and "firebase" not in idx48.lower(), "index.html 에 외부 SDK 스크립트 없음(부팅 가벼움)")
    sw48 = read("sw.js")
    ok("'./src/cloud.js'" in sw48 and "firebase" not in sw48.lower(), "SW — cloud.js 만 프리캐시(Firebase CDN 은 캐시하지 않음)")
    asrc48 = read("app.js")
    ok(all(x in asrc48 for x in ["cloudUpload", "openCloudLoad", "cloudRestore", "cloudPushRank", "cloudTick", "cloudSignIn"]), "app.js — 저장·불러오기·복원·랭킹·주기 저장 배선")
    ok("applySaveState(next)" in asrc48 and "writePrevSave" in asrc48, "클라우드 복원도 직전 세이브 보관 경로를 쓴다")
    ok("if (this._cloudHold) return;" in asrc48 and "_cloudHold = cmp.action === 'download'" in asrc48, "클라우드가 앞설 때 자동 저장이 덮어쓰지 않는다(결정 전 정지)")
    css48 = read("style.css")
    ok(all(x in css48 for x in [".cloud-card", ".rank-row", ".rank-pos", ".rank-me", ".cloud-nick-in"]), "style.css — v4.8 클라우드·랭킹 스타일")
    readme48 = read("README.md")
    ok(all(x in readme48 for x in ["v4.8.0", "클라우드", "랭킹", "rpg_rankings"]), "README — v4.8 클라우드·랭킹 문서화")

    # ── 10) v4.8.1 스탯 창 상단 실시간 DPS(초당 공격력) ──
    dps481 = js(ctx, """
      const s = defaultState(0); s.level = 15; s.stage = 5; s.maxStage = 5;
      const b = new Battle(s, () => ({}), () => 0.5, 0);
      const base0 = b.effectiveDps(0);
      const live0 = b.liveDps(0);
      let t = 0;
      for (let i = 0; i < 120; i++) { t += 50; b.tick(50, t); }
      const liveCombat = b.liveDps(t);
      b.berserkUntil = t + 5000;
      const baseZerk = b.effectiveDps(t + 100);
      const expired = b.liveDps(t + 6000);
      return { base0, live0, liveCombat, baseZerk, expired };
    """)
    ok(dps481["live0"] == 0 and dps481["liveCombat"] > 0 and dps481["expired"] == 0, "실시간 DPS — 전투 중 실측 집계 · 5초 경과 후 만료", json.dumps(dps481))
    ok(dps481["baseZerk"] > dps481["base0"], "기본 DPS — 광폭 활성 시 즉시 반영", json.dumps(dps481))
    dps_ui = js(ctx2, """
      const s = defaultState(0); const buffs = computeBuffs(s, 0);
      const b = { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 }, liveDps: () => 1234, effectiveDps: () => 567, berserkUntil: 0, ultUntil: 0 };
      const ui = { s, battle: b, app: { buffs }, logs: [], tab: 'hunt', huntSub: 'skill', el: {}, install: { hidden: true } };
      const h = __tpls.hunt(ui);
      return {
        hasHero: h.includes('class="dps-hero"') && h.includes('실시간 DPS') && h.includes('초당 공격력') && h.includes('data-live="live-dps"') && h.includes('1,234') && h.includes('567'),
        onTop: 0 <= h.indexOf('dps-hero') && h.indexOf('dps-hero') < h.indexOf('stat-grid four'),
        bad: /undefined|NaN/.test(h),
      };
    """)
    ok(dps_ui["hasHero"] and dps_ui["onTop"] and not dps_ui["bad"], "스탯 창 맨 위 실시간 DPS 배너 렌더·배치 순서", json.dumps(dps_ui))
    ok(".dps-hero" in css48 and ".dps-v" in css48, "style.css — 실시간 DPS 배너 스타일")

    # ── 11) v4.8.2 핫픽스 회귀 검증 ──
    section("v4.8.2 핫픽스 (보상 실반영·일일 보스 펫/자동스킬·클라우드 복원·환생 탑·임대 정리)")
    hf482 = js(ctx, """
      // 1) goldMult / dropMult 실반영 — 부적 강화 + 장비 옵션 + 펫 + 오프라인 + 던전
      const s0 = defaultState(1000); s0.stage = 10; s0.maxStage = 10;
      const s1 = defaultState(1000); s1.stage = 10; s1.maxStage = 10;
      s1.equip.amulet = 50; // +100% 골드
      acquireGear(s1, 'm_grail', { autoEquip: true, now: 1000 }); // 골드 +20% · 드랍 +18% · 전설 +25강(=+50%)
      s1.pet.unlocked = ['owl']; s1.pet.equipped = 'owl'; s1.pet.evo = { owl: 2 };
      const kr0 = killReward(s0, 10, true, {}, () => 0.5);
      const kr1 = killReward(s1, 10, true, {}, () => 0.5);
      const off0 = offlineSummary(s0, 1000 + 3600 * 1000, {});
      const off1 = offlineSummary(s1, 1000 + 3600 * 1000, {});
      const st1 = calcStats(s1, {});
      const dg0 = dungeonReward(s0, { kills: 10, bossKills: 2, dmg: 5000 }, {}, () => 0.5);
      const dg1 = dungeonReward(s1, { kills: 10, bossKills: 2, dmg: 5000, goldMult: st1.goldMult, dropMult: st1.dropMult }, {}, () => 0.5);

      // 2) 일일 보스 — 펫 피해 누적 + 광폭·궁극기 자동 시전
      const sd = defaultState(0); sd.level = 70; sd.stage = 32; sd.maxStage = 32; sd.jobTier = 4;
      sd.pet.unlocked = ['dragon']; sd.pet.equipped = 'dragon'; sd.pet.evo = { dragon: 1 };
      const bd = new Battle(sd, () => ({}), () => 0.5, 30000);
      bd.startDailyBoss(30000);
      const beforeDailyDmg = bd.daily.dmg;
      const petDealt = bd.petHitTarget(bd.daily.boss, 500, 30500, 'hit', petDef('dragon'));
      const afterPetDmg = bd.daily.dmg;
      bd.autoSkills(31000);
      const dailyAuto = { zerk: bd.berserkUntil > 31000, ult: sd.ult.casts > 0 };

      // 3) 도전의 탑 보스 층(3층) — 광폭·궁극기 자동 시전 + 환생 후 peakStage 로 10·11층 유지
      const stw = defaultState(0); stw.level = 70; stw.stage = 25; stw.maxStage = 25; stw.peakStage = 25; stw.jobTier = 4;
      stw.tower.cleared = [1, 2];
      const btw = new Battle(stw, () => ({}), () => 0.5, 30000);
      btw.startTower(3, 30000);
      btw.autoSkills(31000);
      const towerBossAuto = { zerk: btw.berserkUntil > 31000, ult: stw.ult.casts > 0 };
      const srb = defaultState(0); srb.maxStage = 30; srb.peakStage = 30; srb.stage = 30;
      srb.tower.cleared = [1,2,3,4,5,6,7,8,9,10]; srb.tower.best = 10;
      srb.ult.last = 999999;
      doRebirth(srb, 5000);
      const afterRebirth = {
        maxStage: srb.maxStage, peakStage: srb.peakStage, ultLast: srb.ult.last,
        f10: towerUnlocked(srb, 10), f11: towerUnlocked(srb, 11), why11: towerLockReason(srb, 11),
      };

      // 4) 전량 매도 시 경매 특별 임대 정리 + 경매 낙찰 시 bestAsset/assetHistory 갱신 + 치명타 최대치 표기
      const sl = defaultState(0); sl.gold = 5000000;
      const cityKey = CITIES[0].key;
      applyTrade(sl, cityKey, 'buy', 10, 1000);
      sl.land.lease = { [cityKey]: 25 };
      sl.land.landmarks = { [cityKey]: 1 };
      applyTrade(sl, cityKey, 'sell', 10, 2000);
      const leaseCleaned = !sl.land.lease[cityKey] && !sl.land.landmarks[cityKey];

      const sauc = defaultState(0); sauc.gold = 5000000;
      const aucT = 1000 * 60 * 20 * 1000 + 5000; // 라이브 구간 시작 직후
      const aucRes = applyAuctionBid(sauc, aucT);
      const aucTracked = aucRes.ok && sauc.land.bestAsset > 0 && sauc.land.assetHistory.length > 0;

      const scrit = defaultState(0);
      for (let i = 0; i < 105; i++) scrit.land.owned[CITIES[i].key] = 3;
      const critProg = buffProgress(scrit, 0).crit;

      return {
        kr0, kr1, off0, off1, dg0, dg1,
        petDealt, beforeDailyDmg, afterPetDmg, dailyAuto, towerBossAuto,
        afterRebirth, leaseCleaned, aucTracked, critProg,
      };
    """)
    ok(hf482["kr1"]["gold"] > hf482["kr0"]["gold"] * 2 and hf482["kr1"]["shards"] > hf482["kr0"]["shards"], "goldMult/dropMult — 사냥 처치 골드·강화석에 실제 반영", json.dumps({"kr0": hf482["kr0"], "kr1": hf482["kr1"]}))
    ok(hf482["off1"]["gold"] > hf482["off0"]["gold"] * 2 and hf482["off1"]["shards"] >= hf482["off0"]["shards"], "goldMult/dropMult — 오프라인 정산에 실제 반영", json.dumps({"off0": hf482["off0"], "off1": hf482["off1"]}))
    ok(hf482["dg1"]["gold"] > hf482["dg0"]["gold"] * 2 and hf482["dg1"]["shards"] > hf482["dg0"]["shards"], "goldMult/dropMult — 황금 던전 보상에 실제 반영", json.dumps({"dg0": hf482["dg0"], "dg1": hf482["dg1"]}))
    ok(hf482["petDealt"] > 0 and hf482["afterPetDmg"] == hf482["beforeDailyDmg"] + hf482["petDealt"], "일일 보스 — 펫 피해가 daily.dmg 에 누적됨", json.dumps({"pet": hf482["petDealt"], "dmg": hf482["afterPetDmg"]}))
    ok(hf482["dailyAuto"]["zerk"] and hf482["dailyAuto"]["ult"], "일일 보스 — 광폭·궁극기 자동 시전 동작", json.dumps(hf482["dailyAuto"]))
    ok(hf482["towerBossAuto"]["zerk"] and hf482["towerBossAuto"]["ult"], "도전의 탑 보스 층 — 광폭·궁극기 자동 시전 동작", json.dumps(hf482["towerBossAuto"]))
    ok(hf482["afterRebirth"]["f10"] and hf482["afterRebirth"]["f11"] and hf482["afterRebirth"]["ultLast"] == 0, "환생 후 peakStage 기준 탑 해금 유지 · 궁극기 쿨타임 초기화", json.dumps(hf482["afterRebirth"]))
    ok(hf482["leaseCleaned"], "전량 매도 시 경매 특별 임대 계약(land.lease) 즉시 정리")
    ok(hf482["aucTracked"], "급매 경매 낙찰 시 bestAsset·assetHistory 갱신")
    ok(hf482["critProg"]["next"] == "최대치", "건물주 치명타 버프 상한 도달 시 '최대치' 표시", json.dumps(hf482["critProg"]))
    ok("this._cloudLoad = loaded.restorable ? loaded : null;" in asrc48 and "cmp.restorable = !!loaded.restorable;" in asrc48 and "skillCdOf(key, this.buffs)" in asrc48, "app.js — cloudCheckRemote 복원 상태 연동 · 수동 스킬 쿨타임 쿨감 반영")
    ok("부족힙니다" not in read("src/meta.js"), "src/meta.js — 사용자 노출 오타 수정")
    ok(not any(os.path.exists(os.path.join(ROOT, d)) for d in ("assets/boss", "assets/char", "assets/monster")), "미사용 레거시 자산 폴더(boss/char/monster) 정리 완료")

    # ── 12) v4.9.0 후반 메타(미션 30단계 · 업적 36종 · 도감 v2 · 일일 퀘스트) ──
    section("v4.9.0 후반 메타 · 일일 퀘스트 · 도감 v2")
    q49 = js(ctx, """
      const s = defaultState(1000);
      s.quests.idx = 16; // m17 첫 환생
      s.quests.claimed = QUESTS.slice(0, 16).map(q => q.id);
      s.rebirth.count = 1;
      const m17 = claimQuest(s, 'm17', 2000);
      const ptsAfterM17 = s.rebirth.points;

      // 신규 업적 측정(탑/일일보스 S/펫 진화/장비 35종/경매/랜드마크/권역)
      const sa = defaultState(1000);
      sa.maxStage = 100; sa.peakStage = 100; sa.jobTier = 5; sa.rebirth.count = 5;
      sa.tower.best = 100; sa.dailyBoss.bestGrade = 'S'; sa.land.auction.bids = 5;
      sa.pet.unlocked = ['wolf', 'fox']; sa.pet.evo = { wolf: 2, fox: 1 };
      for (const it of GEAR_ITEMS) sa.gear.seen[it.id] = 1;
      const achList = achievementStatus(sa);
      const newReady = ['a_stage100', 'a_job5', 'a_rebirth5', 'a_tower100', 'a_dailyS', 'a_petDivine', 'a_auction5', 'a_gearAll']
        .every((id) => achList.find((x) => x.id === id && x.claimable));

      // 도감 v2: 장비 35종 + 펫 진화 12단계
      const cx = codexStats(sa);
      const cd = codexDetail(sa);

      // 일일 퀘스트 5종 진행 · 수령 · 올클리어 보너스 · 다음날 KST 리셋
      const day1 = Date.UTC(2026, 10, 25, 3, 0, 0); // KST 12:00
      const day2 = Date.UTC(2026, 10, 25, 16, 0, 0); // KST 다음날 01:00
      const sdq = defaultState(day1); sdq.stage = 10;
      trackDailyQuest(sdq, 'kills', 60, day1);
      trackDailyQuest(sdq, 'enhance', 3, day1);
      trackDailyQuest(sdq, 'rent', 1, day1);
      trackDailyQuest(sdq, 'challenge', 1, day1);
      trackDailyQuest(sdq, 'invest', 1, day1);
      const stReady = dailyQuestStatus(sdq, day1);
      const claimedOk = DAILY_QUEST_IDS.every((id) => claimDailyQuest(sdq, id, day1).ok);
      const dupFail = !claimDailyQuest(sdq, 'dq_kill', day1).ok;
      const bonusOk = claimDailyQuestBonus(sdq, day1);
      const bonusDup = !claimDailyQuestBonus(sdq, day1).ok;
      const resetNext = dailyQuestStatus(sdq, day2);

      // v4.8 구버전 세이브 마이그레이션
      const oldMigrated = normalizeState({ ver: 3, level: 20, stage: 12 }, day1);

      return {
        qCount: QUESTS.length, aCount: ACHIEVEMENTS.length,
        m17Ok: m17.ok, m17Pts: m17.points, ptsAfterM17,
        newReady,
        gearItems: cx.gearItems, petEvos: cx.petEvos,
        detailGearLen: cd.gearItems.length, detailPetStages: cd.pets[0].stages.length,
        dqReadyCount: stReady.readyCount, claimedOk, dupFail,
        bonusOk: bonusOk.ok && bonusOk.points === 3 && bonusOk.shards === 60, bonusDup,
        resetCleared: resetNext.claimedCount === 0 && !resetNext.bonusClaimed && resetNext.items[0].cur === 0,
        oldDqDate: oldMigrated.dailyQuests.date,
      };
    """)
    ok(q49["qCount"] == 30 and q49["aCount"] == 36, "v4.9.0 미션 30단계 · 업적 36종 확장", json.dumps({"q": q49["qCount"], "a": q49["aCount"]}))
    ok(q49["m17Ok"] and q49["m17Pts"] == 3 and q49["ptsAfterM17"] == 3, "후반 미션 초월석(✨) 보상 지급", json.dumps({"pts": q49["ptsAfterM17"]}))
    ok(q49["newReady"], "후반 업적(S100·용신·환생·탑100·일일S·신수·경매·장비35종) 판정 정확")
    ok(q49["gearItems"] == {"seen": 55, "total": 55} and q49["petEvos"] == {"seen": 5, "total": 18} and q49["detailGearLen"] == 55 and q49["detailPetStages"] == 3, "도감 v2 — 장비 55종 · 펫 진화 18단계 집계", json.dumps({"g": q49["gearItems"], "p": q49["petEvos"]}))
    ok(q49["dqReadyCount"] == 5 and q49["claimedOk"] and q49["dupFail"] and q49["bonusOk"] and q49["bonusDup"], "일일 퀘스트 5종 수령 · 중복 거부 · 올클리어 보너스(💎60·✨3P)", json.dumps({"r": q49["dqReadyCount"], "b": q49["bonusOk"]}))
    ok(q49["resetCleared"] and len(q49["oldDqDate"]) == 10, "일일 퀘스트 KST 자정 리셋 · 구버전 세이브 마이그레이션")

    dq_ui = js(ctx2, """
      const s = defaultState(Date.now());
      trackDailyQuest(s, 'kills', 60);
      const buffs = computeBuffs(s, 0);
      const b = { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 }, liveDps: () => 0, effectiveDps: () => 100 };
      const ui = { s, battle: b, app: { buffs }, logs: [], tab: 'hunt', huntSub: 'mission', el: {}, install: { hidden: true } };
      const h = __huntSub(ui, 'mission');
      const badges = __badges(ui);
      return {
        hasDq: h.includes('일일 퀘스트') && h.includes('claim-note') && h.includes('올클리어'),
        hasCodexV2: h.includes('장비 도감') && h.includes('펫 진화'),
        badgeQuest: badges.mission,
        bad: /undefined|NaN|\\[object Object\\]/.test(h),
      };
    """)
    ok(dq_ui["hasDq"] and dq_ui["hasCodexV2"] and dq_ui["badgeQuest"] >= 1 and not dq_ui["bad"], "사냥→미션 탭 일일 퀘스트 카드·도감 v2 요약·알림 배지 렌더", json.dumps(dq_ui))

    # ── 13) v4.10.0 장비 프리셋 3슬롯 · 부위 각성(+100강 이후) ──
    section("v4.10.0 장비 프리셋 3슬롯 · 부위 각성/재련")
    g410 = js(ctx, """
      const s = defaultState(1000);
      s.gold = 5000000; s.shards = 5000;
      const a1 = acquireGear(s, 'w_dragon', { autoEquip: true, now: 1000 });
      const a2 = acquireGear(s, 'r_eye', { autoEquip: true, now: 1000 });
      const a3 = acquireGear(s, 'w_thunder', { autoEquip: false, now: 1000 });
      const a4 = acquireGear(s, 'r_sage', { autoEquip: false, now: 1000 });
      // 프리셋 0(사냥) 저장 → 다른 장비 장착 → 프리셋 1(보스) 저장 → 프리셋 0 원탭 복원
      const sv0 = saveGearPreset(s, 0);
      equipGear(s, a3.uid); equipGear(s, a4.uid);
      const sv1 = saveGearPreset(s, 1);
      const ap0 = applyGearPreset(s, 0);
      const eqAfter0 = [equippedItem(s, 'weapon').id, equippedItem(s, 'ring').id];
      const ap1 = applyGearPreset(s, 1);
      const eqAfter1 = [equippedItem(s, 'weapon').id, equippedItem(s, 'ring').id];
      const emptyFail = !applyGearPreset(s, 2).ok;

      // 부위 각성: +100강 미만 거부 → +100강 도달 시 성공 → 공격력 & 고유 옵션 상승 → 환생 후 유지
      s.equip.weapon = 99;
      const awkLow = awakenSlot(s, 'weapon', 100);
      s.equip.weapon = 100;
      const beforeStats = calcStats(s, {});
      const beforeMods = gearMods(s);
      const awk1 = awakenSlot(s, 'weapon', 100);
      const afterStats = calcStats(s, {});
      const afterMods = gearMods(s);
      s.maxStage = 25; s.stage = 25;
      doRebirth(s, 5000);
      const awkAfterRebirth = awakenLevel(s, 'weapon');
      const normBad = normalizeState({ gear: { awaken: { weapon: 99, armor: -3 }, activePreset: 9 } }, 0);
      return {
        sv0: sv0.ok && sv0.count === 2, sv1: sv1.ok && sv1.count === 2,
        ap0: ap0.ok && ap0.applied === 2, ap1: ap1.ok && ap1.applied === 2,
        eqAfter0, eqAfter1, emptyFail,
        awkLowOk: awkLow.ok, awk1Ok: awk1.ok && awk1.lv === 1,
        atkUp: afterStats.atk > beforeStats.atk,
        optUp: afterMods.atkSpd > beforeMods.atkSpd,
        awkAfterRebirth,
        normAwk: [normBad.gear.awaken.weapon, normBad.gear.awaken.armor, normBad.gear.activePreset],
      };
    """)
    ok(g410["sv0"] and g410["sv1"] and g410["ap0"] and g410["ap1"] and g410["eqAfter0"] == ["w_dragon", "r_eye"] and g410["eqAfter1"] == ["w_thunder", "r_sage"] and g410["emptyFail"], "장비 프리셋 3슬롯 저장·원탭 전환·빈 슬롯 거부", json.dumps(g410))
    ok(not g410["awkLowOk"] and g410["awk1Ok"] and g410["atkUp"] and g410["optUp"], "부위 각성 — +100강 게이트 · 스탯 & 고유 옵션(+8%) 동시 상승", json.dumps({"atkUp": g410["atkUp"], "optUp": g410["optUp"]}))
    ok(g410["awkAfterRebirth"] == 1 and g410["normAwk"] == [10, 0, -1], "부위 각성 환생 영구 유지 · 손상 값 정규화", json.dumps({"rb": g410["awkAfterRebirth"], "norm": g410["normAwk"]}))

    g410_ui = js(ctx2, """
      const s = defaultState(1000);
      s.equip.weapon = 100; s.gold = 500000; s.shards = 500;
      acquireGear(s, 'w_dragon', { autoEquip: true, now: 1000 });
      saveGearPreset(s, 0);
      const buffs = computeBuffs(s, 0);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'gear', el: {}, install: { hidden: true } };
      const h = __tpls.gear(ui);
      return {
        hasPresets: h.includes('class="gear-presets"') && h.includes('data-action="gear-preset-apply"') && h.includes('data-action="gear-preset-save"'),
        hasAwaken: h.includes('data-action="gear-awaken"') && h.includes('부위 각성 가능'),
        bad: /undefined|NaN|\\[object Object\\]/.test(h),
      };
    """)
    ok(g410_ui["hasPresets"] and g410_ui["hasAwaken"] and not g410_ui["bad"], "장비 탭 — 프리셋 3슬롯 바 · +100강 부위 각성 버튼 렌더", json.dumps(g410_ui))

    # ── 14) v5.0.0 랭킹 4종 확장(도전의 탑 · 일일 보스) · UI 모듈 분리 ──
    section("v5.0.0 랭킹 4종 확장 · UI 모듈화(ui-fmt/ui-cloud/ui-gear)")
    r50 = js(ctx, """
      const s = defaultState(1000);
      s.maxStage = 45; s.peakStage = 45; s.tower.best = 64; s.dailyBoss.best = 1250000; s.dailyBoss.bestGrade = 'S';
      const e = rankEntryOf(s, { uid: 'u1', nick: '영주왕', now: 2000 });
      const map = {
        u1: e,
        u2: { name: '탑장인', level: 50, stage: 30, totalAsset: 10000, towerBest: 120, dailyBest: 500000, time: 10 },
        u3: { name: '옛기록', level: 40, stage: 35, totalAsset: 20000, time: 5 },
      };
      const byTower = rankRows(map, 'tower');
      const byDaily = rankRows(map, 'daily');
      return {
        keys: RANK_KEYS,
        entryFields: [e.towerBest, e.dailyBest, e.dailyGrade],
        towerTop: byTower.rows.map(r => [r.uid, r.rank, rankValueText('tower', r)]),
        dailyTop: byDaily.rows.map(r => [r.uid, r.rank, rankValueText('daily', r)]),
        labels: [rankMetricLabel('tower'), rankMetricLabel('daily')],
      };
    """)
    ok(r50["keys"] == ["stage", "asset", "tower", "daily"] and r50["entryFields"] == [64, 1250000, "S"], "랭킹 4종 키 · 탑 최고 층/일일 보스 피해 등록 항목", json.dumps(r50["entryFields"]))
    ok(r50["towerTop"][0][0] == "u2" and r50["towerTop"][0][2] == "🗼120층" and r50["towerTop"][2][2] == "—", "도전의 탑 랭킹 정렬 · 옛 기록 '—' 처리", json.dumps(r50["towerTop"], ensure_ascii=False))
    ok(r50["dailyTop"][0][0] == "u1" and r50["dailyTop"][0][2].startswith("🌟") and r50["dailyTop"][2][2] == "—", "일일 보스 랭킹 정렬 · 옛 기록 '—' 처리", json.dumps(r50["dailyTop"], ensure_ascii=False))
    ok(r50["labels"] == ["도전의 탑", "일일 보스"], "랭킹 지표 한글 라벨(도전의 탑 · 일일 보스)")

    ui50 = js(ctx2, """
      const s = defaultState(0); const buffs = computeBuffs(s, 0);
      const cloud = { status: 'guest', rank: { key: 'tower', rows: [{ rank: 1, uid: 'a', name: '탑왕', level: 80, stage: 50, towerBest: 99, hasTower: true }], count: 1, at: 5 } };
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 } }, app: { buffs, cloud }, logs: [], tab: 'settings', el: {}, install: { hidden: true } };
      const h = __tpls.settings(ui);
      return {
        has4Tabs: ['stage', 'asset', 'tower', 'daily'].every((k) => h.includes('data-action="cloud-rank" data-value="' + k + '"')),
        hasTowerVal: h.includes('🗼99층'),
        bad: /undefined|NaN|\\[object Object\\]/.test(h),
      };
    """)
    ok(ui50["has4Tabs"] and ui50["hasTowerVal"] and not ui50["bad"], "랭킹 카드 — 4종 탭(스테이지/총자산/도전의 탑/일일 보스) 렌더", json.dumps(ui50))
    sw50 = read("sw.js")
    ok(all(os.path.exists(os.path.join(ROOT, f)) and f"'./{f}'" in sw50 for f in ("src/ui-fmt.js", "src/ui-cloud.js", "src/ui-gear.js")), "UI 모듈 분리(ui-fmt/ui-cloud/ui-gear) 파일 존재 · sw.js 프리캐시 포함")

    # ── 15) v5.1.0 부동산 관심 매물 · 시세 위치/수익률 · 영지 관리인 ──
    section("v5.1.0 부동산 관심 매물 · 시세 지표 · 영지 관리인")
    l51 = js(ctx, """
      const s = defaultState(1000); s.gold = 9000000;
      const c0 = CITIES[0];
      const pi = priceInfo(c0, 1000);
      applyTrade(s, c0.key, 'buy', 10, 1000);
      s.land.totalCost[c0.key] = Math.round(pi.price * 10 * 0.8); // +25% 수익 시뮬레이션
      const pf = portfolioOf(s, 1000);
      const h0 = pf.holdings[0];
      const f1 = toggleFavoriteCity(s, c0.key);
      const isFav1 = isFavoriteCity(s, c0.key);
      const f2 = toggleFavoriteCity(s, c0.key);
      const isFav2 = isFavoriteCity(s, c0.key);
      const mgrBefore = landManagerUnlocked(s);
      for (let i = 1; i < 10; i++) s.land.owned[CITIES[i].key] = 1;
      const mgrAfter = landManagerUnlocked(s);
      const norm = normalizeState({ land: { favorites: [c0.key, 'bogus', c0.key], tier: 'fav', autoRent: true } }, 0);
      return {
        bandOk: pi.bandPos >= 0 && pi.bandPos <= 1 && ['저점', '보통', '고점'].includes(pi.bandLabel),
        pnlOk: h0.profitPct > 20 && h0.profit > 0 && h0.avgCost > 0,
        favToggle: f1.ok && f1.fav && isFav1 && f2.ok && !f2.fav && !isFav2,
        mgr: [mgrBefore, mgrAfter],
        norm: [norm.land.favorites, norm.land.tier, norm.land.autoRent],
      };
    """)
    ok(l51["bandOk"] and l51["pnlOk"], "시세 밴드 위치(저점/보통/고점) · 보유 수익률(%) 계산", json.dumps(l51))
    ok(l51["favToggle"] and l51["mgr"] == [False, True] and l51["norm"] == [[l51["norm"][0][0]], "fav", True], "관심 매물 토글 · 영지 관리인 10곳 해금 · 저장 정규화", json.dumps(l51))

    ui51 = js(ctx2, """
      const s = defaultState(1000); s.gold = 9000000;
      for (let i = 0; i < 10; i++) applyTrade(s, CITIES[i].key, 'buy', 3, 1000);
      toggleFavoriteCity(s, CITIES[0].key);
      const buffs = computeBuffs(s, 1000);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'land', el: {}, install: { hidden: true } };
      const home = __landSub(ui, 'market');
      const yard = __landSub(ui, 'home');
      s.land.tier = 'fav';
      const marketFav = __landSub(ui, 'market');
      return {
        hasHome: home.includes('data-action="land-fav"') && home.includes('data-action="toggle-auto-rent"') && home.includes('영지 관리인') && home.includes('band-pill'),
        hasYard: yard.includes('rmap-svg') && yard.includes('전국 영지 지도'),
        hasFavFilter: marketFav.includes('data-value="fav"') && marketFav.includes('band-bar') && (marketFav.match(/class="mkt/g) || []).length === 1,
        bad: /undefined|NaN|\\[object Object\\]/.test(home + marketFav),
      };
    """)
    ok(ui51["hasHome"] and ui51["hasYard"] and ui51["hasFavFilter"] and not ui51["bad"], "매물 탭(보유·관리인·시세 게이지)·영지 탭(한반도 지도)·즐겨찾기 필터 렌더(v8)", json.dumps(ui51))

    # ── 16) v5.2.0 장비 테마 세트 효과 (5종 · 2/3/4세트) ──
    section("v5.2.0 장비 테마 세트 효과")
    g52 = js(ctx, """
      const allHaveSet = GEAR_ITEMS.every((it) => !!gearSetOf(it));
      const slotsPerSet = {};
      for (const st of GEAR_SETS) {
        slotsPerSet[st.id] = new Set(GEAR_ITEMS.filter((it) => it.set === st.id).map((it) => it.slot)).size;
      }
      const s0 = defaultState(1000); s0.level = 30;
      const m0 = gearSetMods(s0);
      acquireGear(s0, 'w_dragon', { autoEquip: true });
      const m1 = gearSetMods(s0);
      const st1 = calcStats(s0, {});
      acquireGear(s0, 'a_scale', { autoEquip: true });
      const m2 = gearSetMods(s0);
      const st2 = calcStats(s0, {});
      acquireGear(s0, 'h_dragon', { autoEquip: true });
      const m3 = gearSetMods(s0);
      acquireGear(s0, 'r_eye', { autoEquip: true });
      const m4 = gearSetMods(s0);
      const dStatus = gearSetStatus(s0).find((x) => x.id === 'dragon');
      return {
        allHaveSet,
        setCount: GEAR_SETS.length,
        minSlots: Math.min(...Object.values(slotsPerSet)),
        m0Boss: m0.bossDmg, m1Boss: m1.bossDmg,
        m2Boss: m2.bossDmg, m2Atk: m2.atkPct,
        m3Crit: m3.critDmg, m3Ls: m3.lifesteal,
        m4Boss: m4.bossDmg, m4Atk: m4.atkPct,
        tier: dStatus.activeTier, count: dStatus.count,
        bossUp: st2.bossDmgPct > st1.bossDmgPct,
      };
    """)
    ok(g52["allHaveSet"] and g52["setCount"] == 5 and g52["minSlots"] >= 4, "35종 장비 전부 5종 테마 세트 배정 · 각 세트 4부위 이상", json.dumps(g52))
    ok(g52["m0Boss"] == 0 and g52["m1Boss"] == 0 and g52["m2Boss"] == 12 and g52["m2Atk"] == 8 and g52["m3Crit"] == 20 and g52["m4Boss"] == 32 and g52["tier"] == 4 and g52["bossUp"], "용살자 2/3/4세트 누적 발동 · calcStats 반영", json.dumps(g52))

    ui52 = js(ctx2, """
      const s = defaultState(1000);
      acquireGear(s, 'w_dragon', { autoEquip: true });
      acquireGear(s, 'a_scale', { autoEquip: true });
      const html = gearSlotCards(s) + gearInventory(s);
      return {
        hasBar: html.includes('gset-bar') && html.includes('테마 세트 효과') && html.includes('용살자 2세트') && html.includes('gset-tag'),
        bad: /undefined|NaN|\\[object Object\\]/.test(html),
      };
    """)
    ok(ui52["hasBar"] and not ui52["bad"], "장착 슬롯·인벤토리 카드 — 테마 세트 태그·발동 요약 렌더", json.dumps(ui52))

    # ── 17) v5.3.0 보조 펫 슬롯(2마리 동행) · 전투 배속 토글 ──
    section("v5.3.0 보조 펫 슬롯 · 전투 배속 토글")
    m53 = js(ctx, """
      const s = defaultState(1000); s.level = 30;
      s.pet.unlocked = ['wolf', 'fox', 'owl'];
      s.pet.equipped = 'wolf';
      const lockedSub = equipSubPet(s, 'owl');
      const lockedSpd = effectiveBattleSpeed(s);
      s.battleSpeed = 2;
      const lockedSpdStill1 = effectiveBattleSpeed(s);
      s.rebirth.count = 1;
      const st0 = calcStats(s, {});
      const eqSub = equipSubPet(s, 'owl');
      const st1 = calcStats(s, {});
      // 주펫과 같은 펫을 보조로 지정하면 거부, 주펫을 보조펫으로 교체하면 자리 스왑
      const sameFail = equipSubPet(s, 'wolf');
      equipPet(s, 'owl');
      const swapped = [s.pet.equipped, s.pet.sub];
      // 전투에서 보조 펫 지원 타격 발동 & 배속 ×2 시 일반 타격 횟수 증가
      s.stage = 15; s.maxStage = 15;
      const b1 = new Battle(s, () => ({}), () => 0.5, 0);
      s.battleSpeed = 1;
      let hits1 = 0, subHits = 0;
      for (let t = 100; t <= 10000; t += 100) {
        b1.tick(100, t);
        for (const e of b1.drainEvents()) {
          if (e.t === 'hit') hits1++;
          if (e.t === 'petHit' && e.kind === 'sub') subHits++;
        }
      }
      const s2 = JSON.parse(JSON.stringify(s)); s2.battleSpeed = 2;
      const b2 = new Battle(s2, () => ({}), () => 0.5, 0);
      let hits2 = 0;
      for (let t = 100; t <= 10000; t += 100) {
        b2.tick(100, t);
        for (const e of b2.drainEvents()) if (e.t === 'hit') hits2++;
      }
      // 일일 보스 중에는 배속 ×1 고정
      b2.daily = { ends: 999999, dmg: 0 };
      const dailySpd = b2.speed();
      const norm = normalizeState({ pet: { unlocked: ['wolf', 'owl'], equipped: 'wolf', sub: 'wolf' }, battleSpeed: 9 }, 0);
      return {
        lockedSub: lockedSub.ok,
        lockedSpd: [lockedSpd, lockedSpdStill1],
        eqSub: eqSub.ok && st1.atk > st0.atk && st1.goldMult > st0.goldMult,
        sameFail: sameFail.ok,
        swapped,
        subHits,
        hits: [hits1, hits2],
        dailySpd,
        norm: [norm.pet.sub, norm.battleSpeed],
      };
    """)
    ok(not m53["lockedSub"] and m53["lockedSpd"] == [1, 1] and m53["eqSub"] and not m53["sameFail"] and m53["swapped"] == ["owl", "wolf"], "보조 펫 해금 게이트 · 패시브 50% · 주/보조 스왑", json.dumps(m53))
    ok(m53["subHits"] > 0 and m53["hits"][1] > m53["hits"][0] and m53["dailySpd"] == 1 and m53["norm"] == [None, 1], "보조 펫 지원 타격 · 배속 ×2 전투 가속 · 일일 보스 ×1 고정 · 저장 정규화", json.dumps(m53))

    ui53 = js(ctx2, """
      const s = defaultState(1000);
      s.rebirth.count = 1; s.battleSpeed = 1.5;
      s.pet.unlocked = ['wolf', 'owl']; s.pet.equipped = 'wolf'; s.pet.sub = 'owl';
      const buffs = computeBuffs(s, 1000);
      const b = new Battle(s, () => buffs, () => 0.5, 1000);
      const ui = { s, battle: b, app: { buffs }, logs: [], tab: 'hunt', huntSub: 'battle', el: {}, install: { hidden: true } };
      const huntHtml = __huntSub(ui, 'battle');
      const buffHtml = __gearSub(ui, 'collect');
      return {
        hasSpd: huntHtml.includes('data-action="cycle-speed"') && huntHtml.includes('×1.5'),
        hasSubPet: buffHtml.includes('보조 펫 슬롯') && buffHtml.includes('data-action="pet-sub"') && buffHtml.includes('보조 50%'),
        bad: /undefined|NaN|\\[object Object\\]/.test(huntHtml + buffHtml),
      };
    """)
    ok(ui53["hasSpd"] and ui53["hasSubPet"] and not ui53["bad"], "사냥 스탯 배속 토글 · 펫 카드 보조 슬롯 UI 렌더", json.dumps(ui53))

    # ── 18) v5.4.0 7일 출석 체크 · 주간 보스 챌린지 ──
    section("v5.4.0 7일 출석 체크 · 주간 보스 챌린지")
    d54 = js(ctx, """
      const dayMs = 86400000;
      // 2026-11-23 03:00 UTC = 2026-11-23 12:00 KST (월요일)
      const mon = Date.UTC(2026, 10, 23, 3, 0, 0);
      const s = defaultState(mon); s.stage = 10;
      const r1 = claimAttendance(s, mon, () => 0.1);
      const dup = claimAttendance(s, mon + 3600000, () => 0.1);
      let r7 = null;
      for (let i = 1; i <= 6; i++) {
        r7 = claimAttendance(s, mon + i * dayMs, () => 0.2);
      }
      // 8일차에는 다시 1일차로 순환
      const r8 = claimAttendance(s, mon + 7 * dayMs, () => 0.1);

      // 주간 보스 챌린지: 같은 주 월~일 누적 → 마일스톤 수령 → 다음 주 월요일 자동 리셋
      const sw = defaultState(mon); sw.stage = 12;
      const wkMon = kstWeekKey(mon);
      const wkSun = kstWeekKey(mon + 6 * dayMs);
      const wkNext = kstWeekKey(mon + 7 * dayMs);
      recordWeeklyBoss(sw, 50000, 1.6, mon);
      const m0 = claimWeeklyMilestone(sw, 0, mon, () => 0.2);
      const m0Dup = claimWeeklyMilestone(sw, 0, mon, () => 0.2);
      const m3Early = claimWeeklyMilestone(sw, 3, mon, () => 0.2);
      recordWeeklyBoss(sw, 300000, 3.0, mon + dayMs);
      recordWeeklyBoss(sw, 300000, 3.0, mon + 2 * dayMs);
      recordWeeklyBoss(sw, 300000, 3.0, mon + 3 * dayMs);
      const m3 = claimWeeklyMilestone(sw, 3, mon + 3 * dayMs, () => 0.2);
      const resetNext = weeklyBossInfo(sw, mon + 7 * dayMs);
      return {
        r1: r1.ok && r1.day === 1 && r1.gold > 0 && r1.shards > 0,
        dup: dup.ok,
        r7: r7 && r7.ok && r7.day === 7 && r7.item && r7.item.rarity === 'legend' && r7.points === 5,
        r8: r8.ok && r8.day === 1 && r8.total === 8,
        wkSame: wkMon === wkSun && wkMon !== wkNext,
        m0: m0.ok && m0.shards > 0 && m0.points === 2,
        m0Dup: m0Dup.ok,
        m3Early: m3Early.ok,
        m3: m3.ok && m3.item && m3.item.rarity === 'legend' && m3.points === 8,
        resetNext: resetNext.runs === 0 && resetNext.totalRatio === 0 && resetNext.week === wkNext,
      };
    """)
    ok(d54["r1"] and not d54["dup"] and d54["r7"] and d54["r8"], "7일 출석 체크 — 하루 1회 제한 · 7일차 전설 확정 · 8일차 1일차 순환", json.dumps(d54))
    ok(d54["wkSame"] and d54["m0"] and not d54["m0Dup"] and not d54["m3Early"] and d54["m3"] and d54["resetNext"], "주간 보스 챌린지 — KST 월~일 누적 · 1~4단계 보상(최종 전설) · 차주 월요일 자동 리셋", json.dumps(d54))

    ui54 = js(ctx2, """
      const now = Date.UTC(2026, 10, 23, 3, 0, 0);
      const s = defaultState(now); s.totalKills = 5;
      recordWeeklyBoss(s, 99999, 2.0, now);
      const buffs = computeBuffs(s, now);
      const b = new Battle(s, () => buffs, () => 0.5, now);
      const ui = { s, battle: b, app: { buffs }, logs: [], tab: 'hunt', huntSub: 'mission', el: {}, install: { hidden: true } };
      const qHtml = __huntSub(ui, 'mission');
      const gHtml = __huntSub(ui, 'challenge');
      return {
        hasAtt: qHtml.includes('7일 출석 체크') && qHtml.includes('claim-note') && qHtml.includes('일차'),
        hasWb: gHtml.includes('주간 보스 챌린지') && gHtml.includes('claim-note') && gHtml.includes('수령 대기'),
        bad: /undefined|NaN|\\[object Object\\]/.test(qHtml + gHtml),
      };
    """)
    ok(ui54["hasAtt"] and ui54["hasWb"] and not ui54["bad"], "미션·도감 탭 출석 카드 · 일일 보스 주간 챌린지 UI 렌더", json.dumps(ui54))

    # ── 19) v5.5.0 모바일 UI 개편 (장비 3서브 탭 · 테마 필터 · 도전 필터 · 캔버스 배속 칩) ──
    section("v5.5.0 모바일 UI 개편")
    ui55 = js(ctx2, """
      const s = defaultState(1000); s.shards = 200; s.gold = 100000;
      acquireGear(s, 'w_dragon', { autoEquip: true });
      acquireGear(s, 'a_abyss', { autoEquip: true });
      acquireGear(s, 'w_iron', { autoEquip: false });
      const b = new Battle(s, () => ({}), () => 0.5, 1000);
      const ui = { s, battle: b, app: { buffs: {} }, logs: [], tab: 'gear', gearSub: 'equip', el: {}, install: { hidden: true } };
      const gEquip = __gearSub(ui, 'equip');
      const gJob = __gearSub(ui, 'job');
      const gCollect = __gearSub(ui, 'collect');
      s.gear.setFilter = 'dragon';
      const dragOnly = gearList(s, 'all', 'dragon');
      const gb = __gearBadges(ui);
      const hChal = __huntSub(ui, 'challenge');
      return {
        eqOk: gEquip.includes('gear-subbar') && gEquip.includes('장비 강화') && gEquip.includes('inv-grid') && gEquip.includes('data-fold="inventory"'),
        jobOk: gJob.includes('전직') && gJob.includes('환생 (초월)') && !gJob.includes('inv-grid'),
        colOk: gCollect.includes('고대 유물') && gCollect.includes('칭호') && !gCollect.includes('inv-grid'),
        dragOnlyLen: dragOnly.length,
        dragOnlyId: dragOnly[0] ? dragOnly[0].def.id : '',
        gb,
        keys: __GEAR_SUBS,
        chalOk: hChal.includes('황금 던전') && hChal.includes('도전의 탑') && !hChal.includes('전직 단계'),
        bad: /undefined|NaN|\\[object Object\\]/.test(gEquip + gJob + gCollect + hChal),
      };
    """)
    idx55 = read("index.html")
    ok(ui55["keys"] == ["equip", "job", "collect"] and ui55["eqOk"] and ui55["jobOk"] and ui55["colOk"] and not ui55["bad"], "성장 3서브 탭(장비 / 전직·환생 / 수집) 분리 렌더 — 장비 탭은 접힘 카드로 통합(v8)", json.dumps(ui55))
    ok(ui55["dragOnlyLen"] == 1 and ui55["dragOnlyId"] == "w_dragon" and ui55["gb"]["equip"] >= 1 and ui55["chalOk"], "인벤토리 테마 세트 필터 · 장비 알림 배지 · 사냥 도전 탭", json.dumps(ui55))
    ok('id="stageSpeedBtn"' in idx55 and 'id="gearTabDot"' in idx55, "index.html 캔버스 배속 칩 · 장비 탭 알림 점 추가")

    # ── 20) v5.6.0 장비 55종 대확장 · 잠재 접두사 & 재련 ──
    section("v5.6.0 장비 55종 대확장 · 잠재 접두사 · 재련")
    g56 = js(ctx, """
      const total = GEAR_ITEMS.length;
      const legendsBySet = {};
      for (const st of GEAR_SETS) legendsBySet[st.id] = GEAR_ITEMS.filter((it) => it.rarity === 'legend' && it.set === st.id).length;
      const iconsUnique = new Set(GEAR_ITEMS.map((it) => gearIcon(it))).size;
      const s = defaultState(1000); s.level = 30; s.shards = 200;
      const acq = acquireGear(s, 'w_stormbow', { autoEquip: true, rollAffix: true, rng: () => 0.0 });
      const row = equippedRow(s, 'weapon');
      const af1 = gearAffixInfo(row.affix);
      const mods1 = gearMods(s);
      const rf = reforgeGear(s, row.uid, () => 0.5);
      const af2 = gearAffixInfo(row.affix);
      const norm = normalizeState({ gear: { items: [{ uid: 1, id: 'w_scythe', affix: { id: 'fierce', val: 999 } }], equipped: { weapon: 1 } } }, 0);
      return {
        total,
        iconsUnique,
        allSetsHaveLegend: Object.values(legendsBySet).every((n) => n >= 2),
        legendsBySet,
        af1Ok: acq.ok && !!af1 && af1.id === 'fierce' && mods1.atkPct >= af1.val,
        rfOk: rf.ok && !!af2 && af2.id !== af1.id && s.shards === 200 - gearReforgeCost('w_stormbow'),
        normClamp: norm.gear.items[0].affix.val,
      };
    """)
    ok(g56["total"] == 55 and g56["iconsUnique"] == 55 and g56["allSetsHaveLegend"], "장비 55종(전부 고유 SVG) · 5종 테마 모두 전설 2부위 이상 보유", json.dumps(g56))
    ok(g56["af1Ok"] and g56["rfOk"] and g56["normClamp"] == 13, "잠재 접두사 롤·gearMods 반영·재련 리롤(강화석 차감)·저장 정규화", json.dumps(g56))

    # ── 21) v5.7.0 몬스터 45종(신규 10종 스프라이트) · 엘리트 4종 · 보물 고블린 ──
    section("v5.7.0 몬스터 45종 · 엘리트 4종 · 보물 고블린")
    m57 = js(ctx, """
      const s = defaultState(1000); s.stage = 10; s.maxStage = 10; s.level = 30; s.totalKills = 5;
      // rng = 0.01 → 보물 고블린 확정 출현
      const b1 = new Battle(s, () => ({}), () => 0.01, 0);
      b1.monsters = [];
      b1.spawnNormal(1000);
      const tg = b1.monsters[0];
      const gold0 = s.gold, shards0 = s.shards, items0 = s.gear.items.length;
      b1.killMonster(tg, 2000);
      const tgKillEv = b1.drainEvents().find((e) => e.t === 'treasureKill');
      // 보물 고블린 시간 초과 도주 테스트
      b1.monsters = [];
      b1.spawnNormal(5000);
      b1.updateMonsters(100, 5000 + TREASURE_GOBLIN.durationMs + 50, 1);
      const tgFlee = b1.drainEvents().some((e) => e.t === 'treasureFlee');
      // rng = 0.05 → 보물 고블린(0.025) 스킵, 엘리트(0.08) 확정 출현
      const b2 = new Battle(s, () => ({}), () => 0.05, 0);
      b2.monsters = [];
      b2.spawnNormal(1000);
      const el = b2.monsters[0];
      return {
        tgOk: !!(tg && tg.treasure && tg.name === 'TreasureGoblin'),
        tgReward: !!(tgKillEv && s.gold > gold0 && s.shards > shards0 && (s.gear.items.length > items0 || s.shards >= shards0 + TREASURE_GOBLIN.shards)),
        tgFlee,
        elOk: !!(el && el.elite && ELITE_TRAITS.some((t) => t.id === el.elite.id)),
        traitsCount: ELITE_TRAITS.length,
      };
    """)
    ok(m57["tgOk"] and m57["tgReward"] and m57["tgFlee"], "보물 고블린 출현 · 처치 대량 보상/확정 드랍 · 시간 초과 도주", json.dumps(m57))
    ok(m57["elOk"] and m57["traitsCount"] == 4, "엘리트 몬스터 4종(철갑/신속/광폭/재생) 스폰·능력 강화", json.dumps(m57))
    new_m_files = [
        ("assets/sprites/monster/TreasureGoblin.png", (256, 256)),
        ("assets/sprites/monster/Lizardman.png", (256, 256)),
        ("assets/sprites/monster/Gargoyle.png", (256, 256)),
        ("assets/sprites/monster/DarkElf.png", (256, 256)),
        ("assets/sprites/monster/FrostGolem.png", (256, 256)),
        ("assets/sprites/monster/AbyssKnight.png", (256, 256)),
        ("assets/sprites/boss/LichKing.png", (384, 384)),
        ("assets/sprites/boss/Phoenix.png", (384, 384)),
        ("assets/sprites/boss/Kraken.png", (384, 384)),
        ("assets/sprites/boss/Behemoth.png", (384, 384)),
    ]
    sw57 = read("sw.js")
    ok(all(os.path.exists(os.path.join(ROOT, f)) and f"'./{f}'" in sw57 for f, _ in new_m_files), "신규 몬스터/보스 10종 PNG 존재 · sw.js 프리캐시 동기화")
    try:
        from PIL import Image
        ok(all(Image.open(os.path.join(ROOT, f)).size == sz and Image.open(os.path.join(ROOT, f)).getextrema()[3][0] == 0 for f, sz in new_m_files), "신규 몬스터 256px · 보스 384px 투명 RGBA PNG 검증")
    except Exception as e:
        ok(False, "신규 스프라이트 이미지 검사", str(e))

    # ── 22) v5.8.0 신규 동료 펫 2종(크리스탈 골렘 · 천둥 매) · 원탭 추천 장비 세팅 ──
    section("v5.8.0 신규 동료 펫 2종 · 원탭 추천 장비 세팅")
    p58 = js(ctx, """
      const s = defaultState(1000); s.level = 30; s.rebirth.count = 1;
      for (let i = 0; i < 25; i++) s.land.owned[CITIES[i].key] = 25;
      syncPets(s, 1000);
      const hasBoth = s.pet.unlocked.includes('golem') && s.pet.unlocked.includes('hawk');
      s.pet.equipped = 'golem'; s.pet.evo.golem = 2;
      const stG = calcStats(s, {});
      s.pet.equipped = 'hawk'; s.pet.evo.hawk = 2; s.pet.sub = 'golem';
      const stHG = calcStats(s, {});
      // 원탭 추천 세팅: 보스(dragon) vs 탑(guardian) 장비 보유 시 각 모드에 맞는 장비 선택
      for (const id of ['w_dragon', 'w_hammer', 'a_aegis', 'a_dragonlord', 'h_paladin', 'h_midas', 'r_eye', 'r_titan', 'm_phoenix', 'm_midas']) {
        acquireGear(s, id, { autoEquip: false });
      }
      const rb = applyRecommendedBuild(s, 'boss');
      const bossW = equippedItem(s, 'weapon').id;
      const rt = applyRecommendedBuild(s, 'tower');
      const towerA = equippedItem(s, 'armor').id;
      const rh = applyRecommendedBuild(s, 'hunt');
      const huntM = equippedItem(s, 'amulet').id;
      return {
        petCount: PETS.length,
        hasBoth,
        golemStats: stG.dmgReduce > 0 && stG.dropMult > 1.15,
        hawkStats: stHG.critDmg > 2.25 && stHG.attackMs < calcStats(defaultState(1000), {}).attackMs,
        recOk: rb.ok && rt.ok && rh.ok && bossW === 'w_dragon' && towerA === 'a_aegis' && huntM === 'm_midas',
        picks: { bossW, towerA, huntM },
      };
    """)
    ok(p58["petCount"] == 6 and p58["hasBoth"] and p58["golemStats"] and p58["hawkStats"], "신규 펫 2종(크리스탈 골렘·천둥 매) 해금 · 방어/드랍/공속/치명피해 패시브 반영", json.dumps(p58))
    ok(p58["recOk"], "원탭 추천 장비 세팅(보스→용살자 · 탑→이지스 · 사냥→황금신 성배)", json.dumps(p58["picks"]))
    new_pet_files = [f"assets/sprites/pet/pet_{n}{suf}.png" for n in ("golem", "hawk") for suf in ("", "_awaken", "_divine")]
    sw58 = read("sw.js")
    ok(all(os.path.exists(os.path.join(ROOT, f)) and f"'./{f}'" in sw58 for f in new_pet_files), "신규 펫 6종 PNG 존재 · sw.js 프리캐시 동기화")
    try:
        from PIL import Image
        ok(all(Image.open(os.path.join(ROOT, f)).size == (256, 256) and Image.open(os.path.join(ROOT, f)).getextrema()[3][0] == 0 for f in new_pet_files), "신규 펫 6종 256px 투명 RGBA PNG 검증")
    except Exception as e:
        ok(False, "신규 펫 스프라이트 검사", str(e))

    # ── 23) v5.9.0 🧭 펫 영지 파견 · 🗺️ 전국 권역 지도 ──
    section("v5.9.0 펫 영지 파견 · 전국 권역 지도")
    ex59 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.stage = 20; s.maxStage = 20; s.peakStage = 20;
      // 3개 권역에 매물 + 랜드마크 배치, 펫 4종 해금 (wolf 주 · fox 보조 → owl, dragon 대기)
      const seoulC = CITIES.find((c) => citySetId(c.key) === 'seoul');
      const jejuC = CITIES.find((c) => citySetId(c.key) === 'jeju');
      const gangwonC = CITIES.find((c) => citySetId(c.key) === 'gangwon');
      s.land.owned[seoulC.key] = 20;
      s.land.owned[jejuC.key] = 10;
      s.land.owned[gangwonC.key] = 10;
      s.land.landmarks[seoulC.key] = 2;
      s.pet.unlocked = ['wolf', 'fox', 'owl', 'dragon'];
      s.pet.equipped = 'wolf';
      s.pet.sub = 'fox';
      s.pet.evo.owl = 1;
      s.pet.evo.dragon = 2;
      s.rebirth.count = 1;
      const avail = availableDispatchPets(s).map((p) => p.id);
      // 장착 중인 펫 파견 거부 · 미보유 권역 거부
      const denyEq = startExpedition(s, 'wolf', 'seoul', 'short', now);
      const denyReg = startExpedition(s, 'owl', 'jeolla', 'short', now);
      // 정상 파견 2팀 출발
      const st1 = startExpedition(s, 'owl', 'seoul', 'short', now);
      const st2 = startExpedition(s, 'dragon', 'jeju', 'mid', now);
      // 파견 중인 펫 장착 거부
      const denyEquipBusy = equipPet(s, 'owl');
      const denySubBusy = equipSubPet(s, 'dragon');
      // 조기 수령 거부
      const denyEarly = claimExpedition(s, st1.slot.id, now + 1000);
      // 시간 경과 후 수령 (대성공 강제 rng=0.01)
      const gold0 = s.gold, shards0 = s.shards, pts0 = s.rebirth.points;
      const cl1 = claimExpedition(s, st1.slot.id, st1.slot.endsAt + 100, () => 0.01);
      const clAll = claimAllExpeditions(s, st2.slot.endsAt + 100, () => 0.01);
      // 중도 철수 검증
      const st3 = startExpedition(s, 'owl', 'gangwon', 'long', now);
      const can3 = cancelExpedition(s, st3.slot.id);
      // 권역 지도 데이터 7권역 합 229
      const mapD = regionMapData(s, now);
      const mapSum = mapD.reduce((a, r) => a + r.total, 0);
      // 정규화(손상·중복·장착 펫 제거)
      const norm = normalizeState({
        pet: { unlocked: ['wolf', 'owl'], equipped: 'wolf', sub: null },
        expedition: { active: [
          { id: 'bad1', petId: 'wolf', setId: 'seoul', durKey: 'short', startedAt: now, endsAt: now + 60000 },
          { id: 'ok1', petId: 'owl', setId: 'seoul', durKey: 'short', startedAt: now, endsAt: now + 60000 },
          { id: 'dup', petId: 'owl', setId: 'jeju', durKey: 'short', startedAt: now, endsAt: now + 60000 },
        ] },
      }, now);
      return {
        avail,
        denyOk: !denyEq.ok && !denyReg.ok && !denyEquipBusy.ok && !denySubBusy.ok && !denyEarly.ok,
        startOk: st1.ok && st2.ok,
        claimOk: cl1.ok && cl1.great && clAll.ok && clAll.count === 1 && s.gold > gold0 && s.shards > shards0 && s.rebirth.points > pts0,
        cancelOk: st3.ok && can3.ok && s.expedition.active.length === 0,
        mapOk: mapD.length === 7 && mapSum === 229,
        normLen: norm.expedition.active.length,
        normId: norm.expedition.active[0] ? norm.expedition.active[0].petId : '',
      };
    """)
    ui59 = js(ctx2, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      const jejuC = CITIES.find((c) => citySetId(c.key) === 'jeju');
      s.land.owned[jejuC.key] = 10;
      s.pet.unlocked = ['wolf', 'owl']; s.pet.equipped = 'wolf';
      const buffs = computeBuffs(s, now);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'land', expPick: { petId: '', setId: '', durKey: 'short' }, el: {}, install: { hidden: true } };
      const hHome = __landSub(ui, 'home');
      const hBuff = __landSub(ui, 'home');
      s.land.regionFilter = 'jeju';
      const hMkt = __landSub(ui, 'market');
      return {
        uiOk: hHome.includes('regionMapCard') && hHome.includes('<svg') && hHome.includes('expeditionCard') && hMkt.includes('mkt-reg-pill') && hMkt.includes('제주권'),
        bad: /undefined|NaN|\\[object Object\\]/.test(hHome + hBuff + hMkt),
      };
    """)
    ok(ex59["avail"] == ["owl", "dragon"] and ex59["denyOk"] and ex59["startOk"], "미장착 대기 펫 파견 출발 · 장착/미보유/조기수령/파견중장착 차단", json.dumps(ex59))
    ok(ex59["claimOk"] and ex59["cancelOk"] and ex59["normLen"] == 1 and ex59["normId"] == "owl", "파견 완료·일괄 수령(대성공·초월석/장비)·중도 철수·세이브 정규화", json.dumps(ex59))
    ok(ex59["mapOk"] and ui59["uiOk"] and not ui59["bad"], "전국 7권역 SVG 지도(229개 시군구)·영지 파견 UI·권역 마켓 필터 렌더", json.dumps(ui59))

    # ── 24) v5.10.0 🔮 기본 스킬 4종 룬 각성 ──
    section("v5.10.0 기본 스킬 4종 룬 각성")
    r510 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.level = 20; s.stage = 10; s.maxStage = 10;
      // Lv.3 미만 시 룬 장착 거부
      const denyLow = setSkillRune(s, 'strike', 'lightning');
      for (const k of Object.keys(SKILLS)) s.skills[k].lv = 3;
      const b = new Battle(s, () => ({}), () => 0.5, now);
      b.monsters = [b.makeMonster('Goblin', false, now)];
      b.monsters[0].hp = 50000; b.monsters[0].maxHp = 50000; b.monsters[0].x = 400;
      // 1) 강격 — 번개 2연타
      setSkillRune(s, 'strike', 'lightning');
      b.drainEvents();
      b.castSkill('strike', now);
      const lightningHits = b.drainEvents().filter((e) => e.t === 'hit').length;
      // 2) 강격 — 처형 흡혈
      setSkillRune(s, 'strike', 'execute');
      s.skills.strike.last = 0;
      b.player.hp = Math.round(b.stats.hpMax * 0.4);
      const hpBeforeEx = b.player.hp;
      b.castSkill('strike', now + 100);
      const execHealed = b.player.hp > hpBeforeEx;
      // 3) 범위 베기 — 화염 화상 도트 & 서리 둔화
      setSkillRune(s, 'whirl', 'flame');
      b.castSkill('whirl', now + 200);
      const hpBeforeBurn = b.monsters[0].hp;
      b.updateMonsters(100, now + 800, 1);
      const burnTicked = b.monsters[0].hp < hpBeforeBurn;
      setSkillRune(s, 'whirl', 'frost');
      s.skills.whirl.last = 0;
      b.castSkill('whirl', now + 900);
      const frosted = b.monsters[0].slowUntil > now + 900;
      // 4) 광폭 — 광전사 & 불굴
      setSkillRune(s, 'berserk', 'fury');
      b.castSkill('berserk', now + 1000);
      const furyOn = b.berserkRune === 'fury' && b.effectiveDps(now + 1050) > b.stats.dps * 1.8;
      setSkillRune(s, 'berserk', 'iron');
      s.skills.berserk.last = 0;
      b.castSkill('berserk', now + 1100);
      const ironOn = b.berserkRune === 'iron';
      // 5) 회복 — 성광 보호막(흡수) & 축복(공격+쿨감)
      setSkillRune(s, 'heal', 'shield');
      b.player.hp = b.stats.hpMax;
      b.castSkill('heal', now + 1200);
      const shieldAmt = b.player.shield;
      const hpPreDmg = b.player.hp;
      b.damagePlayer(50, b.monsters[0], now + 1300);
      const shieldAbsorbed = shieldAmt > 0 && b.player.hp === hpPreDmg && b.player.shield < shieldAmt;
      setSkillRune(s, 'heal', 'bless');
      s.skills.heal.last = 0;
      s.skills.strike.last = now + 1000;
      b.castSkill('heal', now + 1400);
      const blessOk = b.blessUntil > now + 1400 && s.skills.strike.last < now + 1000;
      // 6) 정규화
      const norm = normalizeState({ skills: { strike: { lv: 5, last: 0, rune: 'lightning' }, whirl: { lv: 5, last: 0, rune: 'bogus' } } }, now);
      return {
        denyLow: !denyLow.ok,
        lightningHits,
        execHealed,
        burnTicked,
        frosted,
        furyOn,
        ironOn,
        shieldAbsorbed,
        blessOk,
        normOk: norm.skills.strike.rune === 'lightning' && norm.skills.whirl.rune === null,
      };
    """)
    ui510 = js(ctx2, """
      const s = defaultState(1000);
      s.skills.strike.lv = 3; s.skills.strike.rune = 'lightning';
      const b = new Battle(s, () => ({}));
      const ui = { s, battle: b, app: { buffs: {} }, logs: [], tab: 'hunt', huntSub: 'skill', el: {}, install: { hidden: true } };
      const html = __huntSub(ui, 'skill');
      return {
        ok: html.includes('sc-runes') && html.includes('번개 강격') && html.includes('data-action="skill-rune"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(html),
      };
    """)
    ok(r510["denyLow"] and r510["lightningHits"] == 2 and r510["execHealed"], "강격 룬(Lv.3 해금 게이트 · 번개 2연타 · 처형 흡혈)", json.dumps(r510))
    ok(r510["burnTicked"] and r510["frosted"] and r510["furyOn"] and r510["ironOn"], "범위 베기 룬(화염 도트·서리 둔화) · 광폭 룬(광전사·불굴)", json.dumps(r510))
    ok(r510["shieldAbsorbed"] and r510["blessOk"] and r510["normOk"] and ui510["ok"] and not ui510["bad"], "회복 룬(성광 보호막 흡수·축복 쿨감) · 정규화 · 스킬 룬 UI 렌더", json.dumps({ **r510, **ui510 }))

    # ── 25) v5.11.0 🚨 영지 침공 방어전 ──
    section("v5.11.0 영지 침공 방어전")
    iv511 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.stage = 22; s.maxStage = 22; s.peakStage = 22; s.level = 30;
      const b0 = new Battle(s, () => ({}), () => 0.5, now);
      const denyNoLand = b0.startInvasion(now);
      // 매물 + 랜드마크 보유
      const c1 = CITIES[0];
      s.land.owned[c1.key] = 20;
      s.land.landmarks[c1.key] = 2;
      const rentBefore = portfolioOf(s, now).incomePerMin;
      const st0 = invasionStatus(s, now);
      const gold0 = s.gold, shards0 = s.shards, pts0 = s.rebirth.points;
      const b = new Battle(s, () => computeBuffs(s, now), () => 0.5, now);
      const started = b.startInvasion(now);
      const denyDup = b.startDungeon(now);
      // 9마리 모두 격파 시뮬
      let guard = 0;
      let t = now;
      while (b.inInvasion() && guard < 300) {
        t += 100;
        b.invasionTick(t);
        for (const m of b.monsters.slice()) {
          if (!m.dead && !m.dying) b.killMonster(m, t);
        }
        guard++;
      }
      const evEnd = b.drainEvents().find((e) => e.t === 'invasionEnd');
      const rentAfter = portfolioOf(s, t).incomePerMin;
      const stAfter = invasionStatus(s, t);
      const denyAgain = b.startInvasion(t);
      const nextBlockOk = invasionStatus(s, now + INVASION.intervalMs + 1000).available;
      // 정규화: 만료/미보유 boom 정리
      const norm = normalizeState({ land: { owned: { [c1.key]: 5 } }, invasion: { wins: 3, medals: 3, lastBlock: 5, booms: { [c1.key]: now + 60000, bad_key: now + 60000 } } }, now);
      return {
        denyNoLand: !denyNoLand.ok,
        st0Ok: st0.hasLand && st0.available && st0.city.key === c1.key && st0.landmarkLv === 2,
        startedOk: started.ok && !denyDup.ok,
        cleared: !b.inInvasion() && !!evEnd && evEnd.how === 'clear',
        rewardsOk: s.gold > gold0 && s.shards > shards0 && s.rebirth.points > pts0 && s.invasion.wins === 1 && s.invasion.medals === 1,
        boomRentRatio: Math.round((rentAfter / Math.max(0.0001, rentBefore)) * 100) / 100,
        blockLock: !stAfter.available && !denyAgain.ok && nextBlockOk,
        normBoomKeys: Object.keys(norm.invasion.booms),
      };
    """)
    ui511 = js(ctx2, """
      const now = Date.now();
      const s = defaultState(now);
      s.land.owned[CITIES[0].key] = 20;
      s.invasion.booms[CITIES[0].key] = now + 600000;
      const buffs = computeBuffs(s, now);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'land', expPick: { petId: '', setId: '', durKey: 'short' }, growthFilter: 'challenge', el: {}, install: { hidden: true } };
      const home = __landSub(ui, 'home');
      const chal = __huntSub(ui, 'challenge');
      return {
        ok: chal.includes('invasionCard') && chal.includes('임대 +50%') && chal.includes('호황'),
        bad: /undefined|NaN|\\[object Object\\]/.test(home + chal),
      };
    """)
    ok(iv511["denyNoLand"] and iv511["st0Ok"] and iv511["startedOk"] and iv511["cleared"], "영지 침공 경보(랜드마크 우선) · 35초 방어전 출격·9마리 격파 승리 · 중복 모드 차단", json.dumps(iv511))
    ok(iv511["rewardsOk"] and abs(iv511["boomRentRatio"] - 1.5) < 0.05 and iv511["blockLock"] and len(iv511["normBoomKeys"]) == 1, "승리 보상(골드·강화석·초월석·훈장) · 해당 지역 임대 +50% 호황 실반영 · 블록 쿨타임·정규화", json.dumps(iv511))
    ok(ui511["ok"] and not ui511["bad"], "영지 침공 방어전 카드(사냥 도전)·호황 배지(부동산 영지 뉴스/침공) 렌더 — v8 배치", json.dumps(ui511))

    # ── 26) v5.12.0 🏰 영지 성채 (영구 시설 5종) ──
    section("v5.12.0 영지 성채 영구 시설 5종")
    c512 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.stage = 25; s.maxStage = 25; s.peakStage = 25; s.level = 30;
      s.land.owned[CITIES[0].key] = 50;
      s.pet.unlocked = ['wolf', 'fox', 'owl']; s.pet.equipped = 'wolf'; s.pet.sub = 'fox'; s.rebirth.count = 1;
      const baseAtk = calcStats(s, computeBuffs(s, now)).atk;
      const baseEnh = enhanceCostFor(s, 50);
      const baseCd = skillCdOf('strike', {}, s);
      const basePow = skillEffect('strike', 5, s);
      const baseOff = offlineSummary({ ...s, lastActiveAt: now - 16 * 3600 * 1000 }, now, {});
      const baseExp = expeditionPreview(s, 'owl', citySetId(CITIES[0].key), 'short');
      const baseFee = quoteTrade(CITIES[0].key, 'buy', 100, { ...s, gold: 9e9 }, now).fee;
      const baseRent = portfolioOf(s, now).incomePerMin;
      const baseAuc = auctionStatus(s, now).price;
      // 자원 부족 시 거부
      const denyPoor = upgradeCitadel(s, 'forge');
      // 5개 시설 모두 Lv.6으로 증축 (초월석 포함)
      s.gold = 9e9; s.shards = 9e6; s.rebirth.points = 500;
      for (const id of CITADEL_IDS) {
        for (let i = 0; i < 6; i++) {
          const r = upgradeCitadel(s, id);
          if (!r.ok) throw new Error('upgrade fail: ' + id + ' ' + r.reason);
        }
      }
      const eff = citadelEffects(s);
      const nextAtk = calcStats(s, computeBuffs(s, now)).atk;
      const nextEnh = enhanceCostFor(s, 50);
      const nextCd = skillCdOf('strike', {}, s);
      const nextPow = skillEffect('strike', 5, s);
      const nextOff = offlineSummary({ ...s, lastActiveAt: now - 16 * 3600 * 1000 }, now, {});
      const nextExp = expeditionPreview(s, 'owl', citySetId(CITIES[0].key), 'short');
      const nextFee = quoteTrade(CITIES[0].key, 'buy', 100, { ...s, gold: 9e9 }, now).fee;
      const nextRent = portfolioOf(s, now).incomePerMin;
      const nextAuc = auctionStatus(s, now).price;
      // 환생 후 영구 유지 확인
      doRebirth(s, now);
      const keptAfterRebirth = citadelEffects(s).totalLv === 30;
      const norm = normalizeState({ citadel: { levels: { forge: 99, tower: -3, alchemy: 4 } } }, now);
      return {
        denyPoor: !denyPoor.ok,
        totalLv: eff.totalLv,
        forgeOk: nextAtk > baseAtk && nextEnh < baseEnh,
        towerOk: nextCd < baseCd && nextPow > basePow,
        alchemyOk: nextOff.gold > baseOff.gold && nextOff.sec > baseOff.sec,
        barracksOk: nextExp.gold > baseExp.gold && eff.subPetRateAdd > 0.1,
        exchangeOk: nextFee < baseFee && nextRent > baseRent && nextAuc < baseAuc,
        keptAfterRebirth,
        normOk: norm.citadel.levels.forge === 10 && norm.citadel.levels.tower === 0 && norm.citadel.levels.alchemy === 4,
      };
    """)
    ui512 = js(ctx2, """
      const s = defaultState(Date.now());
      s.gold = 999999; s.shards = 999;
      const buffs = computeBuffs(s);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'land', expPick: { petId: '', setId: '', durKey: 'short' }, el: {}, install: { hidden: true } };
      const html = __landSub(ui, 'buff');
      return {
        ok: html.includes('citadelCard') && html.includes('대장간') && html.includes('거래소 본부') && html.includes('data-action="citadel-up"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(html),
      };
    """)
    ok(c512["denyPoor"] and c512["totalLv"] == 30 and c512["forgeOk"] and c512["towerOk"], "영지 성채 건설/증축(초월석 포함) · 대장간(강화할인/공격) · 마법탑(쿨감/스킬위력)", json.dumps(c512))
    ok(c512["alchemyOk"] and c512["barracksOk"] and c512["exchangeOk"], "연금술실(방치효율/상한) · 펫 훈련소(파견/보조펫) · 거래소 본부(거래세/경매/임대)", json.dumps(c512))
    ok(c512["keptAfterRebirth"] and c512["normOk"] and ui512["ok"] and not ui512["bad"], "환생 후 영구 유지 · 세이브 정규화 · 성채 카드 UI 렌더", json.dumps({ **c512, **ui512 }))

    # ── 27) v6.0.0 📈 투자 대시보드 · 🎯 지정가 예약 매매 ──
    section("v6.0.0 투자 대시보드 · 지정가 예약 매매")
    o60 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.gold = 1_000_000;
      s.records.totalGold = 200_000;
      s.land.totalRentClaimed = 50_000;
      const c = CITIES[0];
      const curP = priceInfo(c, now).price;
      // 미보유 지정가 매도 거부
      const denySell = addLimitOrder(s, { cityKey: c.key, side: 'sell', targetPrice: curP * 2, qty: 5 }, now);
      // 미달 매수 주문 등록 (현재가보다 훨씬 낮음) → 미체결 유지
      const ordWait = addLimitOrder(s, { cityKey: c.key, side: 'buy', targetPrice: Math.max(1, Math.floor(curP * 0.5)), qty: 5 }, now);
      const fillsWait = processLimitOrders(s, now);
      // 체결 매수 주문 등록 (현재가 이상 목표가) → 즉시 자동 체결
      const ordBuy = addLimitOrder(s, { cityKey: c.key, side: 'buy', targetPrice: curP + 100, qty: 10 }, now);
      const fillsBuy = processLimitOrders(s, now);
      // 체결 매도 주문 등록 (현재가 이하 목표가) → 즉시 자동 체결
      const ordSell = addLimitOrder(s, { cityKey: c.key, side: 'sell', targetPrice: Math.max(1, curP - 100), qty: 4 }, now);
      const fillsSell = processLimitOrders(s, now);
      // 대기 주문 취소
      const canWait = cancelLimitOrder(s, ordWait.order.id);
      // 스냅샷 기록 + 투자 리포트
      recordAssetSnapshot(s, now + 600_000);
      const rep = investmentReport(s, now + 600_000);
      // 정규화
      const norm = normalizeState({ land: { orders: [{ cityKey: c.key, side: 'buy', targetPrice: 500, qty: 3 }, { cityKey: 'bad', side: 'buy', targetPrice: 100, qty: 1 }] } }, now);
      return {
        denySell: !denySell.ok,
        waitKept: ordWait.ok && fillsWait.length === 0 && s.land.orders.length === 0 && canWait.ok,
        buyFilled: ordBuy.ok && fillsBuy.length === 1 && fillsBuy[0].qty === 10,
        sellFilled: ordSell.ok && fillsSell.length === 1 && fillsSell[0].qty === 4 && s.land.owned[c.key] === 6,
        logLen: s.land.orderLog.length,
        repOk: rep.huntPct === 80 && rep.rentPct === 20 && rep.series.length >= 1 && rep.totalAsset > 0,
        normLen: norm.land.orders.length,
      };
    """)
    ui60 = js(ctx2, """
      const now = Date.now();
      const s = defaultState(now);
      s.gold = 500000;
      const c = CITIES[0];
      applyTrade(s, c.key, 'buy', 5, now);
      addLimitOrder(s, { cityKey: c.key, side: 'buy', targetPrice: Math.max(1, Math.floor(priceInfo(c, now).price * 0.85)), qty: 5 }, now);
      const buffs = computeBuffs(s, now);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'land', expPick: { petId: '', setId: '', durKey: 'short' }, el: {}, install: { hidden: true } };
      const home = __landSub(ui, 'home');
      const mkt = __landSub(ui, 'market');
      const event = __landSub(ui, 'event');
      return {
        ok: home.includes('investDashboardCard') && home.includes('chart-svg') && event.includes('limitOrdersCard') && mkt.includes('data-action="land-sheet"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(home + mkt),
      };
    """)
    ok(o60["denySell"] and o60["waitKept"] and o60["buyFilled"] and o60["sellFilled"] and o60["logLen"] == 2, "지정가 예약 매매(등록·대기·매수/매도 자동 체결·취소·체결 로그)", json.dumps(o60))
    ok(o60["repOk"] and o60["normLen"] == 1 and ui60["ok"] and not ui60["bad"], "투자 대시보드(SVG 추이 그래프·사냥/임대 비율·평가손익) · 세이브 정규화 · UI 렌더", json.dumps({ **o60, **ui60 }))

    # ── 28) v6.1.0 🏺 고대 유물(아티팩트 12종) ──
    section("v6.1.0 고대 유물 12종 · 방어 훈장 감정")
    rl61 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.stage = 25; s.maxStage = 25; s.peakStage = 25; s.level = 30;
      s.invasion.medals = 2;
      s.rebirth.points = 50;
      s.gold = 500000;
      s.land.owned[CITIES[0].key] = 20;
      // 방어 훈장으로 유물 감정
      const sum1 = summonRelic(s, 'medal', () => 0.0);
      const sum2 = summonRelic(s, 'points', () => 0.0);
      // 강화 (파편 또는 초월석)
      const up1 = upgradeRelic(s, sum1.id);
      // ⏳ 모래시계(치명타 쿨감) + 🔥 불사조(치명상 부활) 실전 검증
      s.relics.owned = { hourglass: 3, phoenix: 3, crown: 3, ledger: 3, prism: 3 };
      s.relics.equipped = ['hourglass', 'phoenix', 'crown'];
      const b = new Battle(s, () => computeBuffs(s, now), () => 0.0, now); // rng=0 → 100% 치명타
      b.monsters = [b.makeMonster('Goblin', false, now)];
      b.monsters[0].hp = 99999; b.monsters[0].maxHp = 99999; b.monsters[0].x = 300;
      s.skills.strike.last = now;
      b.hit([b.monsters[0]], 1, 'normal', now);
      const cdTrimmed = s.skills.strike.last < now;
      // 불사조 즉시 부활
      b.player.hp = 10;
      b.damagePlayer(99999, b.monsters[0], now + 100);
      const phoenixSaved = !b.player.dead && b.player.hp > 10 && b.player.shield > 0;
      // 📒 원장 임대 + 🔮 프리즘 환생 초월석
      const baseRent = portfolioOf({ ...s, relics: defaultRelics() }, now).incomePerMin;
      const baseRbPts = rebirthStatus({ ...s, relics: defaultRelics() }).gain;
      s.relics.equipped = ['ledger', 'prism'];
      const boostedRent = portfolioOf(s, now).incomePerMin;
      const boostedRbPts = rebirthStatus(s).gain;
      // 4번째 슬롯 초과 장착 거부 + 정규화
      s.relics.equipped = ['hourglass', 'phoenix', 'crown'];
      const deny4 = toggleEquipRelic(s, 'ledger');
      const norm = normalizeState({ relics: { owned: { crown: 99, bad: 2 }, equipped: ['crown', 'crown', 'phoenix', 'bad'] } }, now);
      return {
        count: RELICS.length,
        summonOk: sum1.ok && sum2.ok && s.invasion.medals === 1 && up1.ok,
        cdTrimmed,
        phoenixSaved,
        rentAndRbOk: boostedRent > baseRent && boostedRbPts > baseRbPts,
        deny4: !deny4.ok,
        normOk: norm.relics.owned.crown === 5 && norm.relics.equipped.length === 1 && norm.relics.equipped[0] === 'crown',
      };
    """)
    ui61 = js(ctx2, """
      const s = defaultState(Date.now());
      s.invasion.medals = 2;
      s.relics.owned = { hourglass: 2 }; s.relics.equipped = ['hourglass'];
      const b = new Battle(s, () => ({}));
      const ui = { s, battle: b, app: { buffs: {} }, logs: [], tab: 'gear', gearSub: 'collect', el: {}, install: { hidden: true } };
      const html = __gearSub(ui, 'collect');
      return {
        ok: html.includes('relicCard') && html.includes('시간의 모래시계') && html.includes('data-action="relic-summon"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(html),
      };
    """)
    ok(rl61["count"] == 12 and rl61["summonOk"] and rl61["deny4"] and rl61["normOk"], "고대 유물 12종 · 방어 훈장/초월석 감정·강화 · 3슬롯 상한·정규화", json.dumps(rl61))
    ok(rl61["cdTrimmed"] and rl61["phoenixSaved"] and rl61["rentAndRbOk"] and ui61["ok"] and not ui61["bad"], "유물 특수 효과(모래시계 쿨감·불사조 부활·원장 임대·프리즘 환생) 및 UI 렌더", json.dumps({ **rl61, **ui61 }))

    # ── 29) v6.2.0 💠 보석 소켓 · 🔨 테마 장비 제작 공방 ──
    section("v6.2.0 보석 소켓 · 테마 장비 제작 공방")
    gm62 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.gold = 2_000_000; s.shards = 3000;
      const baseSt = calcStats(s, {});
      // 루비 3개 세공 → Lv.2 합성 → 무기 장착
      const c1 = cutGem(s, 'ruby', () => 0.9);
      const c2 = cutGem(s, 'ruby', () => 0.9);
      const c3 = cutGem(s, 'ruby', () => 0.9);
      const m1 = mergeGem(s, 'ruby', 1);
      const sk1 = socketGem(s, 'weapon', 'ruby', 2);
      // 사파이어 Lv.2 세공(lucky rng=0.05) → 반지 장착
      const cSap = cutGem(s, 'sapphire', () => 0.05);
      const sk2 = socketGem(s, 'ring', 'sapphire', 2);
      const nextSt = calcStats(s, computeBuffs(s, now));
      // 해제 후 가방 반환 확인
      const un1 = unsocketGem(s, 'weapon');
      // 테마 전설 확정 제작 (드래곤 테마)
      const cr1 = craftThemeGear(s, 'dragon', 'legend', now, () => 0.0);
      const cr2 = craftThemeGear(s, 'dragon', 'legend', now, () => 0.0);
      const norm = normalizeState({ gems: { sockets: { weapon: { type: 'ruby', lv: 99 }, armor: { type: 'bad', lv: 1 } } } }, now);
      return {
        cutMergeOk: c1.ok && c2.ok && c3.ok && m1.ok && m1.toLv === 2 && cSap.ok && cSap.lucky,
        socketStatOk: sk1.ok && sk2.ok && nextSt.atk > baseSt.atk && nextSt.critDmg > baseSt.critDmg && nextSt.skillCdr > 0,
        unsocketOk: un1.ok && s.gems.sockets.weapon === null && s.gems.bag.ruby[1] === 1,
        craftOk: cr1.ok && cr2.ok && cr1.item.set === 'dragon' && cr1.item.rarity === 'legend' && cr1.item.id !== cr2.item.id,
        normOk: norm.gems.sockets.weapon.lv === 5 && norm.gems.sockets.armor === null,
      };
    """)
    ui62 = js(ctx2, """
      const s = defaultState(Date.now()); s.gold = 500000; s.shards = 1000;
      const b = new Battle(s, () => ({}));
      const ui = { s, battle: b, app: { buffs: {} }, logs: [], tab: 'gear', gearSub: 'enhance', gemSlot: 'weapon', el: {}, install: { hidden: true } };
      const hEnh = __gearSub(ui, 'enhance');
      const hGac = __gearSub(ui, 'gacha');
      return {
        ok: hEnh.includes('gemSocketCard') && hGac.includes('themeCraftCard') && hGac.includes('data-action="theme-craft"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(hEnh + hGac),
      };
    """)
    ok(gm62["cutMergeOk"] and gm62["socketStatOk"] and gm62["unsocketOk"], "보석 세공(대성공)·3합성(Lv.1→5)·5부위 소켓 장착/해제·스탯 실반영", json.dumps(gm62))
    ok(gm62["craftOk"] and gm62["normOk"] and ui62["ok"] and not ui62["bad"], "테마 장비 확정 제작(미보유 우선)·정규화·보석/공방 UI 렌더", json.dumps({ **gm62, **ui62 }))

    # ── 30) v6.3.0 ⚡ 원탭 부동산 분산 투자 · 🏛️ 랜드마크 일괄 증축 ──
    section("v6.3.0 원탭 부동산 분산 투자 · 랜드마크 일괄 증축")
    po63 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.gold = 5_000_000;
      const pReg = planAutoInvest(s, 'region', 0.8, now);
      const rReg = executeAutoInvest(s, 'region', 0.8, now);
      const rRoi = executeAutoInvest(s, 'roi', 0.5, now);
      const rDip = executeAutoInvest(s, 'dip', 0.5, now);
      // 5평 이상 지역 3곳 확보 후 랜드마크 일괄 증축
      for (let i = 0; i < 3; i++) s.land.owned[CITIES[i].key] = 10;
      s.gold = 5_000_000;
      const pLm = planBulkLandmarks(s, now);
      const rLm = executeBulkLandmarks(s, now);
      return {
        regOk: pReg.ok && rReg.ok && rReg.count >= 2 && rReg.totalPyeong >= 6,
        roiDipOk: rRoi.ok && rRoi.count >= 1 && rDip.ok && rDip.count >= 1,
        lmOk: pLm.ok && pLm.count >= 3 && rLm.ok && rLm.count >= 3 && landmarkSummary(s).count >= 3,
      };
    """)
    ui63 = js(ctx2, """
      const now = Date.now();
      const s = defaultState(now); s.gold = 5_000_000;
      s.land.owned[CITIES[0].key] = 10;
      const buffs = computeBuffs(s, now);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'land', expPick: { petId: '', setId: '', durKey: 'short' }, el: {}, install: { hidden: true } };
      const hMkt = __landSub(ui, 'market');
      const hBuff = __landSub(ui, 'home');
      return {
        ok: hMkt.includes('data-action="land-auto-invest"') && hBuff.includes('data-action="land-bulk-lm"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(hMkt + hBuff),
      };
    """)
    ok(po63["regOk"] and po63["roiDipOk"] and po63["lmOk"], "원탭 분산 투자 3전략(권역 세트·ROI TOP5·저점 매수) 및 랜드마크 일괄 증축 실행", json.dumps(po63))
    ok(ui63["ok"] and not ui63["bad"], "원탭 투자 버튼(매물 탭) 및 일괄 랜드마크 버튼(영지 탭) 렌더", json.dumps(ui63))

    # ── 31) v6.4.0 🎖️ 영지 성장 패스(무료 30단계) · 🏷️ 칭호(20종) ──
    section("v6.4.0 영지 성장 패스 30단계 · 칭호 20종")
    pt64 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.stage = 25; s.maxStage = 25; s.peakStage = 25; s.totalKills = 200;
      addPassXp(s, 1550, now); // Lv.15 도달 (Lv.15 전설 확정 + 5/10/15 마일스톤)
      const pi = passInfo(s, now);
      const c1 = claimPassTier(s, 1, now);
      const cAll = claimAllPassTiers(s, now, () => 0.1);
      const nextMonth = now + 35 * 86400 * 1000;
      const normReset = normalizePass(s.pass, nextMonth);
      // 칭호 20종: 미해금 거부, 해금 장착 → 스탯 반영 + 랭킹 entry 포함
      const denyLock = equipTitle(s, 'stage100');
      const baseAtk = calcStats(s, {}).atk;
      const eqOk = equipTitle(s, 'stage20');
      const nextAtk = calcStats(s, {}).atk;
      const rk = rankEntryOf(s, { uid: 'u1', now });
      return {
        passOk: pi.lv === 15 && pi.readyCount === 15 && c1.ok && cAll.ok && cAll.count === 14 && cAll.items.length === 1 && cAll.medals === 3,
        seasonResetOk: normReset.xp === 0 && normReset.claimed.length === 0 && normReset.totalClaimed === 15,
        titleCount: TITLES.length,
        titleOk: !denyLock.ok && eqOk.ok && nextAtk > baseAtk && rk.title === 'stage20',
      };
    """)
    ui64 = js(ctx2, """
      const s = defaultState(Date.now());
      addPassXp(s, 250, Date.now());
      const b = new Battle(s, () => ({}));
      const ui = { s, battle: b, app: { buffs: {} }, logs: [], tab: 'hunt', huntSub: 'mission', el: {}, install: { hidden: true } };
      const html = __huntSub(ui, 'mission') + __gearSub(ui, 'collect');
      return {
        ok: html.includes('passCard') && html.includes('titleCard') && html.includes('data-action="goto-todo"') && html.includes('data-action="title-equip"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(html),
      };
    """)
    ok(pt64["passOk"] and pt64["seasonResetOk"], "영지 성장 패스 30단계(XP·마일스톤 초월석/훈장·Lv.15 전설·일괄수령·월간 리셋)", json.dumps(pt64))
    ok(pt64["titleCount"] == 20 and pt64["titleOk"] and ui64["ok"] and not ui64["bad"], "칭호 20종(해금/장착/스탯반영/랭킹표시) 및 패스·칭호 UI 렌더", json.dumps({ **pt64, **ui64 }))

    # ── 32) v6.5.0 📱 모바일 390px 레이아웃 개편 · ⚡ 전투 버프 HUD · 🧩 UI 모듈 분리(ui-land.js) ──
    section("v6.5.0 모바일 390px 필터 · 전투 버프 HUD · ui-land.js 분리")
    ui65 = js(ctx2, """
      const now = Date.now();
      const s = defaultState(now);
      s.land.owned[CITIES[0].key] = 10;
      const buffs = computeBuffs(s, now);
      const b = {
        stats: calcStats(s, buffs), def: stageDef(1), boss: null,
        player: { hp: 100, shield: 420, shieldUntil: now + 5000, graceUntil: now + 2400 },
        berserkUntil: now + 4200, berserkRune: 'fury',
        blessUntil: now + 3100, petGoldUntil: now + 6000, ultUntil: now + 5500,
      };
      const emptyPills = activeBuffPills({ player: { hp: 100, shield: 0, shieldUntil: 0, graceUntil: 0 }, berserkUntil: 0, blessUntil: 0, petGoldUntil: 0, ultUntil: 0 }, now);
      const pills = activeBuffPills(b, now);
      const ui = { s, battle: b, app: { buffs }, logs: [], tab: 'land', expPick: { petId: '', setId: '', durKey: 'short' }, el: {}, install: { hidden: true } };
      const homeAll = __landSub(ui, 'home');
      const homeHold = __landSub(ui, 'market');
      const homeInv = __landSub(ui, 'home');
      const buffCit = __landSub(ui, 'event');
      const buffPet = __landSub(ui, 'home');
      return {
        emptyLen: emptyPills.length,
        pillIds: pills.map((p) => p.id),
        // v8.0.0: 섹션 필터 칩 → 3서브 탭으로 대체(영지=지도·대시보드 / 매물=보유·시장 / 이벤트=성채·은행)
        homeFilterOk: homeHold.length > 0 && homeHold.includes('보유 매물') && !homeHold.includes('investDashboardCard') && homeInv.includes('investDashboardCard') && homeInv.includes('regionMapCard'),
        buffFilterOk: buffCit.includes('citadelCard') && !buffCit.includes('expeditionCard') && buffPet.includes('expeditionCard') && !buffPet.includes('citadelCard'),
        bad: /undefined|NaN|\\[object Object\\]/.test(homeHold + homeInv + buffCit + buffPet),
      };
    """)
    ok(ui65["emptyLen"] == 0 and ui65["pillIds"] == ["berserk", "shield", "bless", "goldRain", "ult", "grace"], "전투 캔버스 실시간 버프 HUD(6종 활성 칩 · 비활성 시 숨김)", json.dumps(ui65["pillIds"]))
    ok(ui65["homeFilterOk"] and ui65["buffFilterOk"] and not ui65["bad"], "부동산 3서브 탭(영지/매물/이벤트) 콘텐츠 분리 및 렌더 정상 — v8.0.0 필터 칩 대체", json.dumps(ui65))
    ok('id="battleBuffBar"' in read("index.html") and os.path.exists(os.path.join(ROOT, "src/ui-land.js")) and ".stage-buffs" in read("style.css"), "index.html #battleBuffBar · src/ui-land.js 모듈 분리 · style.css 버프 HUD 스타일")

    # ── 33) v6.6.0 ✨ 장비 신화 초월 · 🔒 장비 잠금 보호 ──
    section("v6.6.0 장비 신화 초월 · 장비 잠금 보호")
    my66 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.gold = 1_000_000; s.shards = 1000; s.rebirth.points = 50;
      const comId = GEAR_BY_RARITY.common[0].id;
      const aLeg = acquireGear(s, 'w_dragon', { autoEquip: true, now });
      const aCom = acquireGear(s, comId, { autoEquip: false, now });
      // 일반 등급은 신화 초월 거부
      const denyCom = transcendGear(s, aCom.uid);
      // 잠금 시 단건 분해 & 일괄 분해 모두 차단
      const lk1 = toggleGearLock(s, aCom.uid);
      const denyDis = dismantleGear(s, aCom.uid);
      const bulkBlocked = dismantleTargets(s, 'common').length === 0;
      const lk2 = toggleGearLock(s, aCom.uid);
      const bulkAllowed = dismantleTargets(s, 'common').length === 1;
      // 전설 신화 초월 → 스탯 상승(+12강 상당 & 옵션 +35%) + 자동 잠금
      const stBefore = calcStats(s, {});
      const tr = transcendGear(s, aLeg.uid);
      const stAfter = calcStats(s, {});
      const denyDup = transcendGear(s, aLeg.uid);
      // 정규화: 전설만 mythic 유지, 일반 mythic은 제거
      const norm = normalizeState({
        gear: { items: [{ uid: 1, id: 'w_dragon', mythic: true, locked: true }, { uid: 2, id: comId, mythic: true, locked: true }] },
      }, now);
      return {
        denyCom: !denyCom.ok,
        lockOk: lk1.ok && lk1.locked && !denyDis.ok && bulkBlocked && lk2.ok && !lk2.locked && bulkAllowed,
        mythicOk: tr.ok && !denyDup.ok && isMythicSlot(s, 'weapon') && stAfter.atk > stBefore.atk && stAfter.bossDmgPct > stBefore.bossDmgPct,
        normOk: norm.gear.items[0].mythic === true && norm.gear.items[0].locked === true && !norm.gear.items[1].mythic && norm.gear.items[1].locked === true,
      };
    """)
    ui66 = js(ctx2, """
      const s = defaultState(Date.now()); s.gold = 1_000_000; s.shards = 1000; s.rebirth.points = 50;
      const a = acquireGear(s, 'w_dragon', { autoEquip: true });
      transcendGear(s, a.uid);
      const b = new Battle(s, () => ({}));
      const ui = { s, battle: b, app: { buffs: {} }, logs: [], tab: 'gear', gearSub: 'bag', el: {}, install: { hidden: true } };
      const html = __gearSub(ui, 'bag') + __gearSub(ui, 'enhance');
      return {
        ok: html.includes('rb mythic') && html.includes('✨신화') && html.includes('🔒'),
        bad: /undefined|NaN|\\[object Object\\]/.test(html),
      };
    """)
    ok(my66["denyCom"] and my66["lockOk"], "장비 잠금 보호(단건/일괄 분해 차단·해제 복구) 및 비전설 초월 거부", json.dumps(my66))
    ok(my66["mythicOk"] and my66["normOk"] and ui66["ok"] and not ui66["bad"], "전설 → 신화 초월(+12강 상당·옵션 +35%·자동 잠금·정규화·UI 배지) 및 캔버스 신화 오라", json.dumps({ **my66, **ui66 }))
    ok("hasMythic" in read("src/render.js") and "transcendGearItem" in read("app.js"), "render.js 신화 오라/검기 · app.js 초월/잠금 모달 연결")

    # ── 34) v6.7.0 🌀 무한 균열 로그라이크 웨이브 던전 · 3택 1 축복 카드 ──
    section("v6.7.0 무한 균열 로그라이크 던전 · 3택 1 축복 카드")
    rf67 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.stage = 20; s.maxStage = 20; s.peakStage = 20; s.level = 30;
      const b = new Battle(s, () => ({}), () => 0.5, now);
      const st = b.startRift(now);
      // 웨이브 1~3 클리어 시뮬 → W3 클리어 시 3택 1 축복 선택(picking) 진입
      let t = now;
      let guard = 0;
      while (b.inRift() && !b.rift.picking && guard < 200) {
        t += 100;
        b.riftTick(t);
        for (const m of b.monsters.slice()) {
          if (!m.dead && !m.dying) b.killMonster(m, t);
        }
        guard++;
      }
      const picked3 = !!(b.rift && b.rift.picking && b.rift.picking.length === 3 && b.rift.wavesCleared === 3);
      const pickRes = picked3 ? b.pickRiftCard(b.rift.picking[0].id, t) : { ok: false };
      // 웨이브 4~6 추가 돌파 후 정산 귀환 → 골드·강화석·초월석·보석 지급
      guard = 0;
      while (b.inRift() && !b.rift.picking && guard < 200) {
        t += 100;
        b.riftTick(t);
        for (const m of b.monsters.slice()) {
          if (!m.dead && !m.dying) b.killMonster(m, t);
        }
        guard++;
      }
      const g0 = s.gold, sh0 = s.shards, pt0 = s.rebirth.points;
      const ended = b.endRift(t, 'retreat');
      const cdAfter = riftStatus(s, t + 1000).ready;
      const norm = normalizeState({ rift: { bestWave: 12, runs: 3, totalWaves: 28, lastAt: now } }, now);
      return {
        startOk: st.ok && picked3 && pickRes.ok && pickRes.wave === 4,
        rewardOk: !!ended && ended.waves === 6 && s.gold > g0 && s.shards > sh0 && s.rebirth.points > pt0 && !!ended.bonusGem && s.rift.bestWave === 6,
        cdLock: !cdAfter,
        normOk: norm.rift.bestWave === 12 && norm.rift.runs === 3,
      };
    """)
    ui67 = js(ctx2, """
      const s = defaultState(Date.now());
      const b = new Battle(s, () => ({}));
      const ui = { s, battle: b, app: { buffs: {} }, logs: [], tab: 'hunt', huntSub: 'challenge', el: {}, install: { hidden: true } };
      const html = __huntSub(ui, 'challenge');
      return {
        ok: html.includes('riftCard') && html.includes('무한 균열') && html.includes('data-action="rift-start"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(html),
      };
    """)
    ok(rf67["startOk"] and rf67["rewardOk"] and rf67["cdLock"] and rf67["normOk"], "무한 균열 웨이브 진행·W3 3택 1 축복 카드·W6 보석/초월석 정산·쿨타임·정규화", json.dumps(rf67))
    ok(ui67["ok"] and not ui67["bad"], "무한 균열 도전 카드 UI 렌더 정상", json.dumps(ui67))

    # ── 35) v6.8.0 🏦 영지 은행(정기 예금) · 🏗️ 전국 메가 프로젝트 4종 ──
    section("v6.8.0 영지 은행 · 전국 메가 프로젝트 4종")
    bk68 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.gold = 10_000_000; s.shards = 5000; s.rebirth.points = 100;
      for (let i = 0; i < 18; i++) s.land.owned[CITIES[i].key] = 10;
      // 1) 정기 예금 개설 → 조기 수령 거부 → 중도 해지 원금 100% 복구
      const gStart = s.gold;
      const d1 = openDeposit(s, 'short', 100000, now);
      const denyEarly = claimDeposit(s, d1.slot.id, now + 1000);
      const can1 = cancelDeposit(s, d1.slot.id);
      const restored = s.gold === gStart;
      // 2) 만기 수령 → 원금 + 22% 이자 지급
      const d2 = openDeposit(s, 'mid', 200000, now);
      const cl2 = claimDeposit(s, d2.slot.id, d2.slot.maturesAt + 10);
      // 3) 메가 프로젝트 4종 건설 → 임대/공격/거래세 실반영 + 환생 유지
      const baseRent = portfolioOf(s, now).incomePerMin;
      const baseAtk = calcStats(s, {}).atk;
      const baseFee = quoteTrade(CITIES[0].key, 'buy', 10, s, now).fee;
      const bKtx = buildMegaProject(s, 'ktx');
      const bSky = buildMegaProject(s, 'skytower');
      const bPort = buildMegaProject(s, 'tradeport');
      const nextRent = portfolioOf(s, now).incomePerMin;
      const nextAtk = calcStats(s, {}).atk;
      const nextFee = quoteTrade(CITIES[0].key, 'buy', 10, s, now).fee;
      s.maxStage = 25; s.stage = 25;
      doRebirth(s, now);
      const keptAfterRebirth = megaEffects(s).totalLv === 3;
      const norm = normalizeState({ mega: { ktx: 99, skytower: -1 } }, now);
      return {
        bankOk: d1.ok && !denyEarly.ok && can1.ok && restored && d2.ok && cl2.ok && cl2.interest === 24000 && cl2.bonusShards === 45 && s.bank.totalInterest === 24000,
        megaOk: bKtx.ok && bSky.ok && bPort.ok && nextRent > baseRent && nextAtk > baseAtk && nextFee < baseFee && keptAfterRebirth,
        normOk: norm.mega.ktx === 3 && norm.mega.skytower === 0,
      };
    """)
    ui68 = js(ctx2, """
      const s = defaultState(Date.now()); s.gold = 500000;
      for (let i = 0; i < 10; i++) s.land.owned[CITIES[i].key] = 5;
      s.mega.ktx = 1;
      const buffs = computeBuffs(s);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(1), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'land', expPick: { petId: '', setId: '', durKey: 'short' }, el: {}, install: { hidden: true } };
      const home = __landSub(ui, 'home');
      const buff = __landSub(ui, 'event');
      return {
        ok: buff.includes('bankCard') && home.includes('KTX 고속철도 Lv.1') && buff.includes('megaProjectCard') && buff.includes('data-action="mega-build"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(home + buff),
      };
    """)
    ok(bk68["bankOk"] and bk68["megaOk"] and bk68["normOk"], "영지 은행(예치·조기차단·중도해지 원금보장·만기이자) · 메가 프로젝트(임대/공격/거래세·환생유지·정규화)", json.dumps(bk68))
    ok(ui68["ok"] and not ui68["bad"], "영지 은행·메가 프로젝트 카드 및 지도 배지 UI 렌더", json.dumps(ui68))

    # ── 36) v6.9.0 🛡️ 영지 기사단(용병 4인) · 🐉 주간 거대 레이드 토벌전 ──
    section("v6.9.0 영지 기사단 · 주간 거대 레이드 토벌전")
    gd69 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.level = 20; s.gold = 5_000_000; s.shards = 3000; s.invasion.medals = 5;
      const baseSt = calcStats(s, {});
      // 용병 4인 영입 → 공격·체력·치명·쿨감·골드 모두 상승 + 합동 배율 증가
      const u1 = upgradeKnight(s, 'paladin');
      const u2 = upgradeKnight(s, 'archer');
      const u3 = upgradeKnight(s, 'mage');
      const u4 = upgradeKnight(s, 'merchant');
      const nextSt = calcStats(s, {});
      // 레이드 일제 공격 3회 → 일일 티켓 소진 → 4회차 거부, 페이즈 보상 수령
      const a1 = attackRaidBoss(s, nextSt, now, () => 0.1);
      const a2 = attackRaidBoss(s, nextSt, now, () => 0.1);
      const a3 = attackRaidBoss(s, nextSt, now, () => 0.1);
      const a4 = attackRaidBoss(s, nextSt, now, () => 0.1);
      const stAfter = raidStatus(s, nextSt, now);
      const c0 = claimRaidPhase(s, 0, now, () => 0.2);
      const c3 = stAfter.defeated ? claimRaidPhase(s, 3, now, () => 0.2) : { ok: false };
      // 다음 주 자동 리셋 확인(기사단 레벨 유지)
      const nextWk = normalizeGuild(s.guild, now + 8 * 86400 * 1000);
      return {
        knightsOk: u1.ok && u2.ok && u3.ok && u4.ok && nextSt.atk > baseSt.atk && nextSt.hpMax > baseSt.hpMax && nextSt.crit > baseSt.crit && nextSt.skillCdr > baseSt.skillCdr && nextSt.goldMult > baseSt.goldMult,
        raidOk: a1.ok && a2.ok && a3.ok && !a4.ok && c0.ok && (!stAfter.defeated || (c3.ok && !!c3.item)),
        weekResetOk: nextWk.knights.mage === 1 && nextWk.raid.damage === 0 && nextWk.raid.usedToday === 0,
      };
    """)
    ui69 = js(ctx2, """
      const s = defaultState(Date.now());
      const b = new Battle(s, () => ({}));
      const ui = { s, battle: b, app: { buffs: {} }, logs: [], tab: 'hunt', huntSub: 'challenge', el: {}, install: { hidden: true } };
      const html = __huntSub(ui, 'challenge');
      return {
        ok: html.includes('guildRaidCard') && html.includes('성기사 아서') && html.includes('data-action="raid-attack"') && html.includes('data-action="knight-up"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(html),
      };
    """)
    ok(gd69["knightsOk"] and gd69["raidOk"] and gd69["weekResetOk"], "영지 기사단 4인 영입/스탯반영 · 주간 거대 레이드 합동 공격/페이즈 보상/주간 리셋", json.dumps(gd69))
    ok(ui69["ok"] and not ui69["bad"], "영지 기사단·거대 레이드 UI 카드 렌더 정상", json.dumps(ui69))

    # ── 37) v7.0.0 📋 오늘의 할 일 원탭 허브 · 🎬 전투 연출 2.0 · 🧩 ui-hunt.js 분리 ──
    section("v7.0.0 오늘의 할 일 원탭 허브 · 전투 연출 2.0 · ui-hunt.js 분리")
    hb70 = js(ctx, """
      const now = 1_700_000_000_000;
      const s = defaultState(now);
      s.gold = 200000; s.land.owned[CITIES[0].key] = 10; s.land.accruedRent = 5000;
      openDeposit(s, 'short', 50000, now - 4000 * 1000); // 이미 만기된 예금
      addPassXp(s, 350, now); // 패스 Lv.3 수령 가능
      trackDailyQuest(s, 'kills', 60, now); // 일일퀘 1건 완료
      const before = collectTodoSummary(s, calcStats(s, {}), now);
      const res = claimAllReady(s, calcStats(s, {}), now, () => 0.2);
      const after = collectTodoSummary(s, calcStats(s, {}), now);
      return {
        beforeCnt: before.totalClaimable,
        claimOk: res.ok && res.count >= 5 && res.goldDelta > 50000 && res.shardsDelta > 0,
        afterCnt: after.totalClaimable,
      };
    """)
    ok(hb70["beforeCnt"] >= 5 and hb70["claimOk"] and hb70["afterCnt"] == 0, "오늘의 할 일 원탭 일괄 수령(임대·만기예금·출석·일일퀘·패스 동시 정산 후 0건)", json.dumps(hb70))
    ok('id="todoBtn"' in read("index.html") and "drawCombo" in read("src/render.js") and "drawBossWarning" in read("src/render.js") and "chord(" in read("src/sound.js") and os.path.exists(os.path.join(ROOT, "src/ui-hunt.js")), "HUD #todoBtn · 전투 연출 2.0(콤보·보스 강공격 경고·사운드 화음) · src/ui-hunt.js 분리")

    # ── 38) v7.1.0 👾 2.5D 원근 몬스터 배치 · 대규모 웨이브 · 동적 스폰 가속 ──
    section("v7.1.0 2.5D 원근 몬스터 배치 · 대규모 웨이브 · 동적 스폰 가속")
    csrc71 = read("src/combat.js")
    rsrc71 = read("src/render.js")
    ok("LANE_DEPTH = 25" in csrc71 and "laneAlpha" in rsrc71 and "gy + 2 + depth" in rsrc71, "2.5D 원근 깊이(LANE_DEPTH=25·앞뒤 레인 스케일/명암·발끝 그림자 접지)")
    ok(js(ctx, "return RIFT.maxAlive === 8 && RIFT.normalPerWave === 6 && INVASION.maxAlive === 7;") is True, "특수 모드 대규모 웨이브(균열 8마리/6웨이브 · 침공 7마리 · 동적 스폰 가속)")

    # ── 39) v7.2.0 🌄 패럴랙스 지면 스크롤 · 스테이지 행군 전환 · 특수 모드 전용 캔버스 분위기 ──
    section("v7.2.0 패럴랙스 행군 · 특수 모드 캔버스 분위기")
    rsrc72 = read("src/render.js")
    ok(all(x in rsrc72 for x in ["drawModeBackdrop", "drawAtmosphere", "marchUntil", "scrollX", "b.rift", "b.invasion", "b.dungeon", "b.tower"]), "render.js — 패럴랙스 지면 스크롤·스테이지 행군·균열/침공/던전/탑 전용 캔버스 분위기")

    # ── 40) v7.3.0 ⚔️ 영웅 진화 외형 · 타격감 2.0(히트스톱·잔상·보스 폭발) · 기사단 지원 사격 ──
    section("v7.3.0 영웅 진화 외형 · 타격감 2.0 · 기사단 지원 사격")
    rsrc73 = read("src/render.js")
    ok(all(x in rsrc73 for x in ["drawHeroEvolution", "hitstopUntil", "spawnAfterimages", "drawAfterimages", "drawKnightSupport", "drawBossKillFx"]), "render.js — 전직 날개/소드 비트 · 시각 히트스톱 · 잔상 · 기사단 지원 사격 · 보스 격파 폭발")

    # ── 41) v7.4.0 🔥 몬스터 상태이상 비주얼 · 엘리트/보물 고블린 강조 · 파편 처치 연출 ──
    section("v7.4.0 상태이상 비주얼 · 엘리트/고블린 강조 · 파편 처치 연출")
    rsrc74 = read("src/render.js")
    ok(all(x in rsrc74 for x in ["drawBurnFx", "drawFrostFx", "spawnLightning", "drawLightnings", "spawnKillShards", "drawKillShards"]), "render.js — 화상 불꽃·빙결 결정·번개 연쇄 전기선·처치 파편 분산·엘리트/고블린 강조")

    # ── 42) v7.5.0 🔢 데미지 숫자 축약(K/M/B) · 상단 안전 구역 · 데미지 숫자 표시 토글 ──
    section("v7.5.0 데미지 숫자 축약 · 상단 안전 구역 · 데미지 숫자 토글")
    st75 = js(ctx, """
      const d = defaultState(0);
      const keepOff = normalizeState({ dmgNumbers: false }, 0);
      const migrateOld = normalizeState({}, 0);
      const badVal = normalizeState({ dmgNumbers: 'bad' }, 0);
      return { def: d.dmgNumbers, keepOff: keepOff.dmgNumbers, migrateOld: migrateOld.dmgNumbers, badVal: badVal.dmgNumbers };
    """)
    ok(st75["def"] is True and st75["keepOff"] is False and st75["migrateOld"] is True and st75["badVal"] is True, "dmgNumbers 기본값/저장 유지/구버전 마이그레이션/손상 방어", json.dumps(st75))
    rsrc75 = read("src/render.js")
    asrc75 = read("app.js")
    usrc75 = read("src/ui.js") + read("src/ui-settings.js")
    ok(all(x in rsrc75 for x in ["function fmtDmg(", "this.dmgNumbersOn", "topBusy", "b.invasion || b.rift"]), "render.js — K/M/B 데미지 축약·dmgNumbersOn 토글·상단 안전 구역(콤보/가호 배너)")
    ok("toggleDmgNumbers" in asrc75 and "this.renderer.dmgNumbersOn" in asrc75 and 'data-action="toggle-dmg-numbers"' in usrc75 and "case 'toggle-dmg-numbers':" in usrc75, "app.js · ui.js — 설정 탭 데미지 숫자 표시 토글 배선")

    # ── 43) v7.6.0 🎨 55종 장비 일러스트 WebP · 신규 몬스터/보스 5종 스프라이트 ──
    section("v7.6.0 55종 장비 일러스트 · 신규 몬스터/보스 5종")
    sw76 = read("sw.js")
    g76 = js(ctx, """
      const ids = GEAR_ITEMS.map((it) => it.id);
      const htmls = GEAR_ITEMS.map((it) => gearIcon(it, 40));
      const allImg = htmls.every((h, i) => h.includes(`assets/items/${ids[i]}.webp`) && h.includes('<svg'));
      const newM = ['CrystalGolem', 'LavaHound', 'SandGolem', 'VampireKnight', 'StormTitan'];
      const monOk = newM.every((n) => MONSTERS[n] && MONSTER_MOTION[n] && MONSTER_ATTACKS[n]);
      return { ids, allImg, monOk };
    """)
    missing_items = [iid for iid in g76["ids"] if not os.path.exists(os.path.join(ROOT, f"assets/items/{iid}.webp")) or f"'./assets/items/{iid}.webp'" not in sw76]
    ok(g76["allImg"] and not missing_items, "장비 55종 WebP 일러스트 존재 · gearIcon <img>+SVG 폴백 · sw.js 프리캐시 동기화", ", ".join(missing_items[:5]))
    new_m76 = [
        ("assets/sprites/monster/CrystalGolem.png", (256, 256)),
        ("assets/sprites/monster/LavaHound.png", (256, 256)),
        ("assets/sprites/monster/SandGolem.png", (256, 256)),
        ("assets/sprites/monster/VampireKnight.png", (256, 256)),
        ("assets/sprites/boss/StormTitan.png", (384, 384)),
    ]
    ok(g76["monOk"] and all(os.path.exists(os.path.join(ROOT, f)) and f"'./{f}'" in sw76 for f, _ in new_m76), "신규 몬스터 4종 + 보스 1종(폭풍 타이탄) 정의·PNG·sw.js 프리캐시 동기화")
    try:
        from PIL import Image
        ok(all(Image.open(os.path.join(ROOT, f)).size == sz and Image.open(os.path.join(ROOT, f)).getextrema()[3][0] == 0 for f, sz in new_m76), "v7.6 신규 스프라이트 256px/384px 투명 RGBA PNG 규격 검증")
    except Exception as e:
        ok(False, "v7.6 신규 스프라이트 규격 검증", str(e))

    # ── 44) v7.7.0 🔥 피버 타임 & 캔버스 탭 번개 일격 ──
    section("v7.7.0 피버 타임 & 캔버스 탭 번개 일격")
    fv77 = js(ctx, """
      const s = defaultState(1000); s.level = 15; s.stage = 3;
      const b = new Battle(s, () => ({}), () => 0.5, 1000);
      const t0 = b.tapStrike(450, 1500);
      const tCd = b.tapStrike(450, 1600); // 350ms 쿨타임 거부
      b.addFever(100, 2000);
      const active = b.isFever(2500);
      const evs = b.drainEvents();
      const feverEv = evs.some((e) => e.t === 'feverStart');
      const tapEv = evs.some((e) => e.t === 'tapStrike');
      const ended = !b.isFever(2000 + FEVER.durationMs + 10);
      return { t0: t0.ok && t0.dmg > 0, tCd: !tCd.ok && tCd.reason === 'cooldown', active, feverEv, tapEv, ended };
    """)
    ok(fv77["t0"] and fv77["tCd"] and fv77["tapEv"], "캔버스 탭 번개 일격(즉시 피해 · 350ms 쿨타임 · 이벤트 발생)", json.dumps(fv77))
    ok(fv77["active"] and fv77["feverEv"] and fv77["ended"], "피버 게이지 100% → 15초 피버 타임 자동 발동 및 만료", json.dumps(fv77))
    ok("drawFeverHud" in read("src/render.js") and "drawTapBolts" in read("src/render.js") and "bindCanvasTap" in read("app.js"), "render.js · app.js — 피버 게이지/오라·탭 번개 연출·포인터 바인딩")

    # ── 45) v7.8.0 📊 실시간 DPS 미터기 & 딜 비중 · GPM/SPM 분석 HUD ──
    section("v7.8.0 실시간 DPS 미터기 & 딜 비중 분석 HUD")
    dm78 = js(ctx, """
      const s = defaultState(1000); s.level = 15;
      const b = new Battle(s, () => ({}), () => 0.1, 1000);
      b.recordDamage(500, 2000, 'normal', true, 1, 1);
      b.recordDamage(300, 2200, 'skill', false, 1, 0);
      b.recordDamage(200, 2400, 'pet', true, 1, 1);
      b.recordGain(1200, 6, 2500);
      const bd = b.dpsBreakdown(3000);
      const top = bd.parts[0];
      b.resetMeter(4000);
      const after = b.dpsBreakdown(4100);
      return {
        totalDmg: bd.totalDmg,
        topKey: top.key,
        topPct: top.pct,
        critRate: bd.critRate,
        gpm: bd.gpm,
        spm: bd.spm,
        resetZero: after.totalDmg === 0 && after.gpm === 0,
      };
    """)
    ok(dm78["totalDmg"] == 1000 and dm78["topKey"] == "normal" and dm78["topPct"] == 50 and dm78["critRate"] == 67 and dm78["gpm"] > 0 and dm78["spm"] > 0 and dm78["resetZero"], "딜 비중(평타/스킬/펫)·실측 치명률·GPM/SPM·초기화 정상", json.dumps(dm78))
    ok('data-live="dps-meter"' in read("src/ui.js") and 'reset-dps-meter' in read("src/ui.js") and 'resetDpsMeter' in read("app.js"), "ui.js · app.js — 실시간 딜 비중 HUD 및 초기화 버튼 배선")

    # ── 46) v7.9.0 🧭 전투력(CP) 원천 분석기 & 가성비 성장 내비게이션 ──
    section("v7.9.0 전투력(CP) 원천 분석기 & 가성비 성장 내비")
    gd79 = js(ctx, """
      const s = defaultState(1000);
      s.level = 20; s.gold = 30000; s.shards = 150;
      const bd = computeCpBreakdown(s, {});
      const recs = recommendGrowth(s, {}, 1000);
      return {
        cpOk: bd.cp > 0 && bd.sources.length === 6 && bd.sources.reduce((a, x) => a + x.pct, 0) >= 96,
        recCount: recs.length,
        hasLand: recs.some((r) => r.id === 'buy-land'),
        hasJump: recs.every((r) => !!r.jumpTab && !!r.title),
      };
    """)
    ok(gd79["cpOk"] and gd79["recCount"] == 3 and gd79["hasLand"] and gd79["hasJump"], "CP 6대 원천 분해(%) · 가성비 성장 추천 Top 3 · 바로가기 탭 생성 정상", json.dumps(gd79))
    ok("cpGuideInner" in read("src/ui.js") and "'./src/guide.js'" in read("sw.js") and 'case \'guide-jump\':' in read("src/ui.js"), "ui.js · sw.js — CP 분석을 전투 정보 카드에 통합 렌더 · guide-jump 배선 · guide.js 프리캐시")

    # ── 47) v8.0.0 🧹 2층 내비 · 카드 다이어트 · P0 버그 · 실제 한반도 지도 ──
    section("v8.0.0 2층 내비 · 카드 접힘 · P0 버그 · 실제 한반도 지도")
    import subprocess as _sp
    chi = _sp.run([sys.executable, os.path.join(ROOT, "tools", "check_imports.py")], capture_output=True, text=True)
    ok(chi.returncode == 0 and "✓" in chi.stdout, "정적 모듈 정합성 검사(check_imports.py) — import/export 누락 0", (chi.stdout or chi.stderr).strip()[:200])
    ok(os.path.exists(os.path.join(ROOT, "tools/check_imports.py")), "tools/check_imports.py 존재(v7.9.1 invasionStatus·landBuffTotals 사고 재발 차단)")

    v80 = js(ctx2, """
      const s = defaultState(0);
      // 제주권 2곳 보유 → 권역 완주(★) 표시 경로까지 검증
      CITIES.filter((c) => citySetId(c.key) === 'jeju').slice(0, 2).forEach((c) => { s.land.owned[c.key] = 5; });
      const ward = normalizeState({ ver: 3, land: { sub: 'buff' } }, 0);
      const ward2 = normalizeState({ ver: 3, land: { sub: 'event' } }, 0);
      const ui = { s, battle: { stats: calcStats(s, {}), def: stageDef(1), boss: null, player: { hp: 1 } }, app: { buffs: {} }, logs: [], tab: 'land', el: {}, install: { hidden: true } };
      s.land.sub = 'home'; const home = __tpls.land(ui);
      s.land.sub = 'market'; const mkt = __tpls.land(ui);
      s.land.sub = 'event'; const evt = __tpls.land(ui);
      const map = __tpls.map(ui);
      const badges = __lbadges(ui);
      return {
        keys: { hunt: __HUNT_SUBS, gear: __GEAR_SUBS, land: __LAND_SUBS },
        oldSubMigrated: ward.land.sub, newSubKept: ward2.land.sub,
        fmtComma: fmt(1234), fmtBig: fmt(1234567),
        compactGold: compact(183626587), compactPyeong: compact(1279000),
        mapRegions: (map.match(/data-action="land-map-region"/g) || []).length,
        mapCounts: (map.match(/class="rmap-cnt"/g) || []).length,
        mapViewBox: (map.match(/viewBox="0 0 (\\d+) (\\d+)"/) || []).slice(1),
        mapSeoulCallout: map.includes('rmap-seoul') && map.includes('서울'),
        mapStar: map.includes('★'),
        lashed: !evt.includes('현재 적용 수치') && evt.includes('bankCard') && mkt.includes('hold-card') && mkt.includes('landList'),
        buffOnce: (home + mkt + evt).split('부동산 전투 버프 합계').length - 1,
        chips: (home + mkt + evt).includes('land-home-filter'),
        badges,
        bad: /undefined|NaN|\\[object Object\\]/.test(home + mkt + evt + map),
      };
    """)
    ok(v80["keys"]["hunt"] == ["battle", "challenge", "mission"] and v80["keys"]["gear"] == ["equip", "job", "collect"] and v80["keys"]["land"] == ["home", "market", "event"] and v80["bad"] is False, "하단 4탭 → 서브 탭 2층 내비(사냥 3 · 성장 3 · 부동산 3 · 설정 단일)", json.dumps(v80["keys"]))
    ok(v80["oldSubMigrated"] == "event" and v80["newSubKept"] == "event", "v7.x 저장 land.sub='buff' → 'event' 마이그레이션(세이브 호환)")
    ok(v80["fmtComma"] == "1,234" and v80["fmtBig"] == "1,234,567", "Intl 비의존 천단위 구분(fmt) — QuickJS·구형 웹뷰 동일", json.dumps([v80["fmtComma"], v80["fmtBig"]]))
    ok(v80["compactGold"] == "1.84억" and v80["compactPyeong"] == "127만", "상단 HUD 축약 표기(1.84억 / 127만) — 잘림 없음", json.dumps([v80["compactGold"], v80["compactPyeong"]]))
    ok(v80["mapRegions"] >= 7 and v80["mapCounts"] == 7 and v80["mapSeoulCallout"] and v80["mapStar"], "한반도 지도 — 7권역 + 서울 콜아웃 + 전 권역 보유/전체·★ 표시", json.dumps({k: v80[k] for k in ["mapRegions", "mapCounts", "mapSeoulCallout"]}))
    ok(len(v80["mapViewBox"]) == 2 and v80["mapViewBox"] == ["340", "340"], "지도 viewBox 340×340 — 남한 실제 비율(세로형) + 아래 빈 공간 제거", json.dumps(v80["mapViewBox"]))
    ok(v80["lashed"] and v80["buffOnce"] <= 1 and v80["chips"] is False, "카드 통폐합 — 부동산 버프 합계 1곳 · '현재 적용 수치' 중복 카드/섹션 칩 제거", json.dumps({"once": v80["buffOnce"], "chips": v80["chips"]}))

    css80 = read("style.css")
    hud80 = read("src/ui.js")
    ok(".rmap-lbl {\n  font-size: 12.5px" in css80 and ".rmap-cnt {\n  font-size: 12px" in css80, "지도 라벨 12px 이상(화면 11px+) CSS")
    ok("max-width: 210px" not in css80.split(".badge {")[1].split("}")[0] and ".badge b { flex: 0 0 auto" in css80, "HUD 평수 b 는 줄어들지 않음(flex:0 0 auto) — 말줄임 제거")
    ok("top: calc(env(safe-area-inset-top) + var(--hud-h) + 6px)" in css80 and "bottom: calc(var(--tab-h)" not in css80, "토스트는 HUD 아래 1줄 배너(하단 버튼 안 가림)")
    ok("compact(p.pyeong)" in hud80 and "compact(this.s.gold)" in hud80 and "title" in hud80, "HUD 값 축약 + 전체 값은 title/aria")
    ok("case 'toggle-fold': this.toggleFold(v); break;" in hud80 and "applyFolds()" in hud80 and "DEFAULT_COLLAPSED" in hud80, "카드 ▸ 접기 — 기본 접힘 목록·DOM 토글(재렌더 없이)")
    idx80 = read("index.html")
    ok("<b>사냥</b>" in idx80 and "<b>성장</b>" in idx80 and "<b>부동산</b>" in idx80 and "<b>설정</b>" in idx80, "하단 탭 라벨 — 사냥/성장/부동산/설정")

    # ── 48) v8.1.0 💸 보상 수령 일원화 · 설정 다이어트 · 매물 액션시트 · 전투 HUD 1줄 ──
    section("v8.1.0 보상 수령 일원화 · 설정 정보 카드 · 매물 액션시트 · 전투 HUD 1줄")
    st81 = js(ctx, """
      const d = defaultState(0);
      const keep = normalizeState({ dmgStyle: 'full' }, 0);
      const bad = normalizeState({ dmgStyle: 'x' }, 0);
      const legacy = normalizeState({ dmgNumbers: false }, 0);
      return { def: d.dmgStyle, keep: keep.dmgStyle, bad: bad.dmgStyle, legacy: legacy.dmgStyle, legacyOff: legacy.dmgNumbers };
    """)
    ok(st81["def"] == "simple" and st81["keep"] == "full" and st81["bad"] == "simple" and st81["legacy"] == "simple", "피해 숫자 밀도 dmgStyle 기본 '간단' · 저장 유지 · 손상/구버전 마이그레이션", json.dumps(st81))

    ui81 = js(ctx2, """
      const now = Date.now();
      const s = defaultState(now);
      s.gold = 500000; s.stage = 7; s.level = 12; s.maxStage = 7; s.peakStage = 7;
      for (const c of CITIES.slice(0, 6)) s.land.owned[c.key] = 30;
      trackDailyQuest(s, 'kills', 200);
      recordWeeklyBoss(s, 99999, 2.0, now);
      addPassXp(s, 400, now);
      const buffs = computeBuffs(s, now);
      const ui = { s, battle: { stats: calcStats(s, buffs), def: stageDef(7), boss: null, player: { hp: 100 } }, app: { buffs }, logs: [], tab: 'hunt', huntSub: 'mission', el: {}, install: { canPrompt: true, hidden: false } };
      const mission = __huntSub(ui, 'mission');
      const challenge = __huntSub(ui, 'challenge');
      s.land.sub = 'event'; const event = __tpls.land(ui);
      s.land.sub = 'market'; const mkt = __tpls.land(ui);
      const list = __tpls.market(ui).html;
      const settings = __tpls.settings(ui);
      const gone = ['claim-attendance', 'claim-daily-quest', 'claim-quest', 'pass-claim', 'claim-weekly-milestone'];
      const landGone = ['bank-claim', 'exp-claim', 'exp-claim-all'];
      return {
        missionClaims: gone.filter((a) => mission.includes('data-action="' + a + '"')),
        landClaims: landGone.filter((a) => event.includes('data-action="' + a + '"')),
        towerSweep: challenge.includes('data-action="tower-sweep"'),
        raidClaim: challenge.includes('data-action="raid-claim"'),
        hub: mission.includes('todoHubCard') && mission.includes('data-action="todo-claim-all"'),
        jump: (mission + challenge + event + settings).includes('data-action="goto-todo"'),
        infoHead: settings.indexOf('총자산') < settings.indexOf('id="fold-info"') && settings.indexOf('id="fold-info"') < settings.indexOf('총 처치'),
        infoFold: settings.includes('data-action="toggle-fold" data-value="info"'),
        installLine: (settings.match(/data-action="install"/g) || []).length,
        installCard: settings.includes('install-card'),
        dmgChips: settings.includes('data-action="dmg-style" data-value="simple"') && settings.includes('data-action="dmg-style" data-value="full"'),
        mktSheet: (list.match(/data-action="land-sheet"/g) || []).length,
        mktTrade: (list.match(/data-action="land-trade"/g) || []).length,
        holdSheet: mkt.includes('data-action="land-sheet"'),
        bad: /undefined|NaN|\\[object Object\\]/.test(mission + challenge + event + mkt + list + settings),
      };
    """)
    ok(ui81["missionClaims"] == [] and ui81["landClaims"] == [] and ui81["towerSweep"] is False and ui81["raidClaim"] is False, "개별 '받기' 버튼 제거 — 출석·패스·일일퀘·미션·주간보스·레이드·탑소탕·은행·파견", json.dumps({k: ui81[k] for k in ["missionClaims", "landClaims", "towerSweep", "raidClaim"]}))
    ok(ui81["hub"] and ui81["jump"] and ui81["bad"] is False, "오늘의 할 일 허브 원탭 일괄 수령 + 각 카드의 허브 바로가기(goto-todo)", json.dumps({"hub": ui81["hub"], "jump": ui81["jump"], "bad": ui81["bad"]}))
    ok(ui81["infoHead"] and ui81["infoFold"], "설정 정보 카드 — 기본 3줄 + ▸ 펼치기(내 기록+앱 정보 1장)", json.dumps({"head": ui81["infoHead"], "fold": ui81["infoFold"]}))
    ok(ui81["installLine"] == 1 and ui81["installCard"] is False and ui81["dmgChips"], "설치 카드 → 설정 하단 1줄 링크 · 피해 숫자 밀도 칩(간단/자세히)", json.dumps({k: ui81[k] for k in ["installLine", "installCard", "dmgChips"]}))
    ok(ui81["mktSheet"] >= 5 and ui81["mktTrade"] == 0 and ui81["holdSheet"], "매물·보유 목록 행 탭 액션시트(land-sheet) — 행마다 매수/매도/예약 3버튼 제거", json.dumps({k: ui81[k] for k in ["mktSheet", "mktTrade", "holdSheet"]}))
    ok("case 'land-sheet': actions.landSheet(v); break;" in read("src/ui.js"), "ui.js — land-sheet 클릭 배선(행 탭 → 액션시트)", "")
    app81 = read("app.js"); idx81 = read("index.html"); css81 = read("style.css"); r81 = read("src/render.js")
    ok("openLandSheet(key)" in app81 and "landSheet: (key) => this.openLandSheet(key)" in app81 and "지정가 예약" in app81 and 'data-action="land-trade"' in app81, "app.js — 매물 액션시트(매수·매도·지정가 예약) 모달", "")
    ok(idx81.index('class="stage-bottom"') < idx81.index('id="battleBuffBar"') and idx81.count('id="battleBuffBar"') == 1, "전투 상단 버프 pill → 캔버스 하단 1줄(킬도트와 같은 줄)", "")
    ok(".sb-line {" in css81 and ".killbar { flex: 0 0 64px" in css81, "style.css — 버프 pill + 킬도트 1줄(sb-line) 배치", "")
    ok("this.dmgStyle = 'simple'" in r81 and "cap = simple ? 14 : 40" in r81 and "mergeMs = simple ? 320 : 190" in r81, "render.js — 피해 숫자 '간단' 기본(합치기 320ms · 최대 14개 · 작은 크기)", "")
    ok("case 'dmg-style': actions.setDmgStyle(v); break;" in read("src/ui.js") and "setDmgStyle: (style)" in app81, "ui.js · app.js — 피해 숫자 밀도 설정 배선", "")

    hub81 = js(ctx, """
      const now = Date.now();
      const s = defaultState(now);
      s.tower = { ...s.tower, best: 5, cleared: [1, 2, 3, 4, 5] };
      const sum = collectTodoSummary(s, null, now);
      const listed = sum.items.some((i) => i.id === 'towerSweep');
      const r = claimAllReady(s, null, now);
      return { listed, claimed: r.claimed, sweepGone: towerSweepInfo(s, now).available, gold: s.gold > 0 };
    """)
    ok(hub81["listed"] and any('탑' in c for c in hub81["claimed"]) and hub81["sweepGone"] is False and hub81["gold"], "허브가 탑 일일 소탕을 목록에 올리고 일괄 수령한다(towerSweepInfo.available 필드 불일치 수정)", json.dumps(hub81, ensure_ascii=False))


    # ── 49) v8.2.0 🏘️ 부동산↔사냥 시너지 대시보드 · 원탭 분산투자 · 복귀 허브 동선 · 침공 대기 사유 ──
    section("v8.2.0 시너지 대시보드 · 방치 복귀 허브 동선 · 침공 비활성 사유")
    dash82 = js(ctx2, """
      const now = Date.now();
      function mkState(n, gold) {
        const s = defaultState(now);
        s.gold = gold; s.level = 14; s.stage = 9; s.maxStage = 9;
        for (const c of CITIES.slice(0, n)) s.land.owned[c.key] = 20;
        s.land.accruedRent = 456.7;
        return s;
      }
      const s = mkState(6, 250000);
      const buffs = computeBuffs(s, now);
      const p = portfolioOf(s, now);
      const ui = { s, battle: { stats: calcStats(s, buffs), boss: null }, app: { buffs } };
      const home = __landSub(ui, 'home');
      const dash = landSynergyDashCard(ui);
      s.land.sub = 'market'; const mktTab = __landSub(ui, 'market');
      // 다음 세트: 남은 곳이 가장 적은 미완성 권역
      const sets = regionSetStatus(s.land.owned).filter((st) => !st.complete)
        .map((st) => ({ id: st.id, left: st.maxNeed - st.held }))
        .sort((a, b) => a.left - b.left);
      const nextId = sets[0] ? sets[0].id : null;
      // 빈 상태: 버프 0 · 원탭 버튼은 그대로
      const s0 = defaultState(now);
      const ui0 = { s: s0, battle: { stats: calcStats(s0, {}), boss: null }, app: { buffs: computeBuffs(s0, now) } };
      const empty = landSynergyDashCard(ui0);
      // 침공 카드 — 다른 전투가 돌고 있을 때 사유
      const inv = (b) => invasionCard({ s, battle: b, app: { buffs } });
      const invFree = inv({ invasion: null, boss: null, tower: null, dungeon: null, daily: null });
      const invBoss = inv({ invasion: null, boss: { ko: '슬라임 킹' } });
      const invTower = inv({ invasion: null, boss: null, tower: { floor: 4 } });
      const invDungeon = inv({ invasion: null, boss: null, tower: null, dungeon: { id: 'gold' } });
      const invDaily = inv({ invasion: null, boss: null, tower: null, dungeon: null, daily: { boss: 'x' } });
      const mkt = tplLandMarket(ui);
      return {
        homeFirst: home.trim().indexOf('landSynergyDash') > 0 && home.trim().indexOf('landSynergyDash') < home.indexOf('regionMapCard'),
        rent: dash.includes('시간당 임대') && dash.includes('data-live="income"'),
        buffs: ['공격', '골드', '치명'].every((k) => dash.includes(k)) && dash.includes('dash-buff'),
        nextId, nextInDash: !!nextId && dash.includes('data-value="' + nextId + '"') && dash.includes('더 사면 완성'),
        invest: ['region', 'roi', 'dip'].every((m) => dash.includes('data-action="land-auto-invest" data-value="' + m + '"')),
        emptyOk: empty.includes('원탭 분산투자') && empty.includes('아직 전투 버프가 없습니다'),
        freeReady: invFree.includes('방어 출격!') && !invFree.includes('출격 대기'),
        bossWhy: invBoss.includes('⏳ 보스전 진행 중 · 출격 대기') && invBoss.includes('inv-busy'),
        towerWhy: invTower.includes('⏳ 도전의 탑 진행 중 · 출격 대기'),
        dungeonWhy: invDungeon.includes('⏳ 황금 던전 진행 중 · 출격 대기'),
        dailyWhy: invDaily.includes('⏳ 일일 보스 진행 중 · 출격 대기'),
        mktHead: mkt.includes('⚡ 원탭 분산투자') && mkt.includes('data-action="land-auto-invest"'),
        summaryDedup: !home.includes('ls-tot') && mktTab.includes('ls-tot'),
        bad: /undefined|NaN|\\[object Object\\]/.test(dash + empty + invFree + invBoss + invTower + invDungeon + invDaily + mkt),
        rentHr: Math.round(p.incomePerHour),
      };
    """)
    ok(dash82["homeFirst"], "영지 화면 맨 위에 시너지 대시보드(지도보다 먼저)", json.dumps({k: dash82[k] for k in ["homeFirst"]}))
    ok(dash82["rent"] and dash82["buffs"], "대시보드 — 시간당 임대수익 + 전투 버프(공격·골드·치명 …) 한 카드", json.dumps({k: dash82[k] for k in ["rent", "buffs"]}))
    ok(dash82["nextInDash"], "대시보드 — 다음 권역 세트(남은 곳)와 그 권역 매물 바로가기", json.dumps(dash82.get("nextId")))
    ok(dash82["invest"] and dash82["mktHead"], "원탭 분산투자(권역 채우기·ROI TOP5·저점 매수) — 영지 대시보드 + 매물 전면", "")
    ok(dash82["summaryDedup"], "영지 탭은 요약 바 버프 줄을 빼고 대시보드 칩으로만(중복 1곳) — 매물·이벤트 탭은 유지", "")
    ok(dash82["emptyOk"], "매물 0곳 상태에서도 대시보드가 원탭 분산투자로 안내", "")
    ok(dash82["freeReady"] and dash82["bossWhy"] and dash82["towerWhy"] and dash82["dungeonWhy"] and dash82["dailyWhy"], "침공 출격 비활성 사유 — 보스전·탑·던전·일일 보스 문구 표시", json.dumps({k: dash82[k] for k in ["freeReady", "bossWhy", "towerWhy", "dungeonWhy", "dailyWhy"]}))
    ok(dash82["bad"] is False, "v8.2.0 카드에 undefined/NaN 누출 없음", "")
    app82 = read("app.js")
    css82 = read("style.css")
    ok("collectTodoSummary(this.s, this.battle && this.battle.stats, Date.now())" in app82 and "ret-hub" in app82 and "this.ui.gotoTodoHub()" in app82, "app.js — 방치 복귀 모달에 '오늘의 할 일' 대기 건수 + 허브 바로가기(복귀 동선 통일)", "")
    ok("away >= 10 * 60 * 1000" in app82 and "할 일 ${todoN}건 대기" in app82, "10분 이상 복귀는 같은 모달 · 짧은 복귀는 허브 건수 토스트", "")
    ok(all(x in css82 for x in [".land-dash {", ".dash-buffs", ".dash-next", ".dash-invest-btns", ".ret-hub", ".inv-busy"]), "style.css — 대시보드·복귀 허브·침공 사유 스타일", "")
    ok("landSynergyDashCard" in read("src/ui.js") and "landSynergyDashCard" in read("src/ui-land.js") and "landBuffTotals" in read("src/ui-land.js"), "ui.js·ui-land.js — 대시보드 배선 + 같은 landBuffTotals 숫자", "")
    ok("호재로 시세" in app82 and "this.buffs = computeBuffs(this.s, now);" in app82[app82.find("checkNews(now = Date.now())"):app82.find("ownedInNews(news)")], "checkNews — 호재로 시세가 바뀌면 전투 버프 재계산(카드마다 1%p 어깋나던 원인)", "")

    # ── 50) v8.3.0 🌙 OLED 절전 방치 모드 · 🎵 Web Audio 적응형 신스 BGM ──
    section("v8.3.0 OLED 절전 방치 모드 & 적응형 신스 BGM")
    bg83 = js(ctx, """
      const d = defaultState(0);
      const on = normalizeState({ bgmOn: true }, 0);
      const old = normalizeState({}, 0);
      const bad = normalizeState({ bgmOn: 'yes' }, 0);
      return { def: d.bgmOn, on: on.bgmOn, old: old.bgmOn, bad: bad.bgmOn };
    """)
    ok(bg83["def"] is False and bg83["on"] is True and bg83["old"] is False and bg83["bad"] is False, "bgmOn 기본값(false)·저장 유지·구버전 마이그레이션·손상 방어", json.dumps(bg83))
    ok('id="sleepOverlay"' in read("index.html") and 'id="sleepBtn"' in read("index.html") and "toggleSleep(" in read("app.js") and "setBgmMood(" in read("src/sound.js") and "case 'toggle-bgm':" in read("src/ui.js"), "index.html · app.js · sound.js · ui.js — OLED 절전 방치 모드 및 적응형 신스 BGM 배선")

    # ── 51) v8.4.0 ⚡ 신규 액티브 스킬 6종(총 10종) · 나만의 4슬롯 스킬 덱 & 프리셋 ──
    section("v8.4.0 신규 스킬 6종(총 10종) · 4슬롯 스킬 덱 & 프리셋")
    sk84 = js(ctx, """
      const now = 100000;
      const s = defaultState(now);
      s.level = 30; s.stage = 8; s.shards = 200;
      const total = Object.keys(SKILLS).length;
      // 구버전 세이브 마이그레이션
      const old = normalizeState({ skills: { strike: { lv: 4, last: 0 } } }, now);
      const oldDeckOk = Array.isArray(old.skillDeck) && old.skillDeck.join(',') === DEFAULT_SKILL_DECK.join(',') && !!old.skills.meteor && !!old.skills.execute;
      // 덱 슬롯 교체 · 중복 교환 · 프리셋 적용
      const eq1 = setSkillDeckSlot(s, 0, 'meteor');
      const eqSwap = setSkillDeckSlot(s, 1, 'meteor'); // 이미 슬롯 0에 있으면 0↔1 교환
      const pr = applySkillDeckPreset(s, 'boss');
      // 전투에서 신규 스킬 6종 모두 시전 검증
      const b = new Battle(s, () => ({}), () => 0.3, now);
      const casts = {};
      for (const k of ['aegis', 'thunder', 'meteor', 'frostnova', 'vampstrike', 'execute']) {
        if (b.targets().length < 2) { b.spawnNormal(now); b.spawnNormal(now); }
        s.skills[k].last = 0;
        casts[k] = b.castSkill(k, now + 50000);
      }
      const shieldUp = b.player.shield > 0 && b.aegisUntil > now + 50000;
      return {
        total,
        oldDeckOk,
        eq1: eq1.ok && eq1.deck[0] === 'meteor',
        eqSwap: eqSwap.ok && eqSwap.deck[1] === 'meteor' && eqSwap.deck[0] !== 'meteor',
        pr: pr.ok && s.skillDeck.join(',') === 'strike,execute,berserk,vampstrike',
        allCast: Object.values(casts).every(Boolean),
        shieldUp,
      };
    """)
    ok(sk84["total"] == 10 and sk84["oldDeckOk"], "스킬 총 10종(신규 6종) · 구버전 세이브 기본 4슬롯 덱/신규 스킬 안전 마이그레이션", json.dumps(sk84))
    ok(sk84["eq1"] and sk84["eqSwap"] and sk84["pr"], "4슬롯 스킬 덱 슬롯 장착·위치 교환·프리셋 원탭 전환", json.dumps(sk84))
    ok(sk84["allCast"] and sk84["shieldUp"], "신규 6종 스킬(뇌전·메테오·절대영도·불굴방벽·흡혈검무·그림자처형) 전투 실발동", json.dumps(sk84))
    ok('id="skillDeckBar"' in read("src/ui.js") and "skill-deck-equip" in read("src/ui.js") and "skill-deck-preset" in read("src/ui.js") and "f.key === 'meteor'" in read("src/render.js"), "ui.js · render.js — 스킬 덱 편성 UI·퀵슬롯 연동·신규 6종 캔버스 이펙트")

    # ── 52) v8.5.0 📈 S70+ 일일 영지 배당 · 🏆 월간 시즌 도전 & 영구 명예 트로피 ──
    section("v8.5.0 S70+ 일일 영지 배당 & 월간 시즌 도전·트로피")
    sn85 = js(ctx, """
      const now = 1700000000000;
      const s = defaultState(now);
      s.peakStage = 75; s.maxStage = 75; s.tower.best = 20; s.rift.bestWave = 8;
      s.guild.raid.clears = 1; s.rebirth.count = 3;
      for (const c of CITIES.slice(0, 30)) s.land.owned[c.key] = 30;
      const dv0 = estateDividendInfo(s, now);
      const sc0 = seasonChallengeStatus(s, now);
      const sum = collectTodoSummary(s, calcStats(s, {}), now);
      const all = claimAllReady(s, calcStats(s, {}), now, () => 0.2);
      const dv1 = estateDividendInfo(s, now);
      const sc1 = seasonChallengeStatus(s, now);
      // 다음 달 리셋 시 트로피는 영구 유지
      const nextMonth = normalizeSeason(s.season, now + 40 * 86400 * 1000);
      return {
        divCan: dv0.canClaim && dv0.cur && dv0.cur.tier >= 3,
        scReady: sc0.readyCount >= 6,
        hubHas: sum.items.some((x) => x.id === 'dividend') && sum.items.some((x) => x.id === 'season'),
        claimedOk: all.ok && !dv1.canClaim && sc1.readyCount === 0 && sc1.trophies.length >= 1,
        trophyKept: nextMonth.trophies.length === sc1.trophies.length && nextMonth.claimed.length === 0,
      };
    """)
    ok(sn85["divCan"] and sn85["scReady"] and sn85["hubHas"], "영지 배당 등급·월간 시즌 도전 달성·오늘의 할 일 허브 집계", json.dumps(sn85))
    ok(sn85["claimedOk"] and sn85["trophyKept"], "허브 원탭 수령(배당+시즌 도전)·트로피 영구 보관·월간 리셋 정상", json.dumps(sn85))
    ok("'./src/season.js'" in read("sw.js") and "seasonCard" in read("src/ui.js") and "estateDividendInfo" in read("src/ui-land.js"), "sw.js · ui.js · ui-land.js — season.js 프리캐시·대시보드 배당·시즌 카드 배선")

    # ── 53) v8.6.0 🎨 스킬 10종·궁극기·기사단 4인·트로피 아트워크 · 🧱 ui-settings.js 분리 ──
    section("v8.6.0 스킬·기사단·트로피 아트워크 & ui-settings.js 분리")
    sw86 = read("sw.js")
    art86 = (
        [f"assets/skills/{k}.webp" for k in ["strike", "whirl", "berserk", "heal", "thunder", "meteor", "frostnova", "aegis", "vampstrike", "execute", "ult_dragon", "ult_god"]]
        + [f"assets/knights/{k}.webp" for k in ["paladin", "archer", "mage", "merchant"]]
        + [f"assets/trophies/{k}.webp" for k in ["silver", "grand"]]
    )
    miss86 = [f for f in art86 if not os.path.exists(os.path.join(ROOT, f)) or f"'./{f}'" not in sw86]
    ok(not miss86, "스킬 10종·궁극기 2종·기사단 4인·트로피 2종(18종) WebP 존재 및 sw.js 프리캐시 동기화", ", ".join(miss86[:5]))
    ok(os.path.exists(os.path.join(ROOT, "src/ui-settings.js")) and "'./src/ui-settings.js'" in sw86 and "assets/skills/" in read("src/ui.js") and "assets/knights/" in read("src/ui-hunt.js"), "ui-settings.js 분리·프리캐시 · 스킬/기사단/트로피 WebP UI 연결")

    # ── 54) v8.7.0 🎬 영웅 4단 콤보 액션 스프라이트 & 몬스터 아키타입별 자유 모션 ──
    section("v8.7.0 영웅 4단 콤보 액션 스프라이트 & 몬스터 자유 전투 모션")
    sw87 = read("sw.js")
    rnd87 = read("src/render.js")
    cmb87 = read("src/combat.js")
    app87 = read("app.js")
    hero87 = ["hero_attack2", "hero_jump", "hero_dash"]
    miss87 = [
        f for f in hero87
        if not os.path.exists(os.path.join(ROOT, f"assets/sprites/{f}.png"))
        or f"'./assets/sprites/{f}.png'" not in sw87
        or f"'{f}'" not in app87
    ]
    ok(not miss87, "영웅 추가 액션 프레임 3종(상단베기·점프강타·돌진) PNG 존재 · sw.js 프리캐시 · app.js 프리로드", ", ".join(miss87))
    act87 = js(ctx, """
      const now = 50000;
      const s = defaultState(now);
      const b = new Battle(s, () => ({}), () => 0.4, now);
      if (!b.targets().length) b.spawnNormal(now);
      b.targets()[0].x = ECON.playerX + 280;
      b.targets()[0].hp = 999999;
      const seq0 = b.player.attackSeq || 0;
      b.player.lastAttack = 0;
      b.attack(now + 2000, 1);
      const seq1 = b.player.attackSeq || 0;
      b.player.lastAttack = 0;
      b.attack(now + 4000, 1);
      const seq2 = b.player.attackSeq || 0;
      const paths = ['hero_attack2', 'hero_jump', 'hero_dash'].map((n) => spriteSrc(n));
      return {
        seqOk: seq1 === seq0 + 1 && seq2 === seq0 + 2,
        targetOk: Number.isFinite(b.player.targetX) && b.player.targetX === ECON.playerX + 280,
        pathsOk: paths.join(',') === 'assets/sprites/hero_attack2.png,assets/sprites/hero_jump.png,assets/sprites/hero_dash.png',
      };
    """)
    ok(act87["seqOk"] and act87["targetOk"] and act87["pathsOk"], "combat.js 콤보 시퀀스/타겟 추적 · data.js spriteSrc 영웅 6프레임 매핑", json.dumps(act87))
    ok(
        all(x in rnd87 for x in ["heroVisX", "heroVisY", "hero_attack2", "hero_jump", "hero_dash", "slashStyle = 'thrust'", "slashStyle = 'up'", "slashStyle = 'plunge'", "skKey === 'execute'", "dyWeave", "atkReach"]),
        "render.js — 영웅 4단 콤보·스킬별 자유 이동(처형 백스탭/회오리/공중시전) & 몬스터 아키타입별 위빙·스웁·도약 모션",
    )

    # ── 55) v8.8.0 ⚖️ 밸런스 리마스터 · 멀린/모래시계 시너지 수정 · 신규 6종 스킬 룬 12종 ──
    section("v8.8.0 밸런스 리마스터 · 시너지 누락 수정 · 신규 6종 스킬 룬 12종")
    bal88 = js(ctx, """
      const now = 200000;
      const s = defaultState(now);
      s.level = 180;
      s.equip = { weapon: 50, armor: 50, helmet: 50, ring: 100, amulet: 50 };
      s.guild.knights.archer = 10; // 치명 +8% (총 63% → 13%p 초과 치명타 전환)
      s.guild.knights.mage = 10; // 쿨감 8%
      s.gems.sockets.weapon = { type: 'sapphire', lv: 5 }; // 쿨감 6%, 공속 10%
      const bf = computeBuffs(s, now);
      const st = calcStats(s, bf);
      const cdBase = skillCdOf('meteor', {}, null);
      const cdWith = skillCdOf('meteor', bf, s);
      // 신규 6종 스킬 룬 12종 모두 존재 & 장착/발동 확인
      const newKeys = ['thunder', 'meteor', 'frostnova', 'aegis', 'vampstrike', 'execute'];
      const runeCount = newKeys.reduce((a, k) => a + (SKILL_RUNES[k] ? SKILL_RUNES[k].length : 0), 0);
      for (const k of newKeys) { s.skills[k].lv = 5; s.skills[k].rune = SKILL_RUNES[k][0].id; }
      s.skillDeck = ['meteor', 'execute', 'aegis', 'vampstrike'];
      const b = new Battle(s, () => bf, () => 0.2, now);
      if (b.targets().length < 3) { b.spawnNormal(now); b.spawnNormal(now); b.spawnNormal(now); }
      // aegis 반사 방벽 룬 공격 버프 & execute 약점 간파 쿨타임 반환
      const castAegis = b.castSkill('aegis', now + 50000);
      const thornsUp = b.thornsUntil > now + 50000 && b.thornsAtk >= 0.25;
      // 시간의 모래시계 유물이 장착 덱(meteor 등 신규 스킬) 쿨타임 단축
      s.relics.owned.hourglass = 5; s.relics.equipped = ['hourglass'];
      s.skills.meteor.last = now + 50000;
      b.hit([b.targets()[0]], 1, 'normal', now + 50100, { critAdd: 0.99 });
      const trimmed = s.skills.meteor.last < now + 50000;
      return {
        gldCdrOk: bf.gldCdrPct === 8 && cdWith < cdBase * 0.90,
        overCritOk: st.crit === 0.5 && st.overCritPct > 0 && st.critDmg > 2.0,
        atkSpdOk: st.attackMs < 300 && st.attackMs >= 200,
        runeCount,
        thornsUp: castAegis && thornsUp,
        trimmed,
      };
    """)
    ok(bal88["gldCdrOk"] and bal88["trimmed"], "대마도사 멀린 쿨감 실반영 · 시간의 모래시계 장착 덱 신규 스킬 쿨단축", json.dumps(bal88))
    ok(bal88["overCritOk"] and bal88["atkSpdOk"], "초과 치명타→치명피해 자동 전환 · Lv.160+ 공속 옵션 정상 반영(최소 200ms)", json.dumps(bal88))
    ok(bal88["runeCount"] == 12 and bal88["thornsUp"], "신규 스킬 6종 Lv.3 룬 12종 정의 및 전투 효과 실발동", json.dumps(bal88))

    # ── 56) v8.9.0 🏦 영지 은행 펀드 · 👑 대지주 스케일 보너스 · 🏛️ 영지 인프라 통합 ──
    section("v8.9.0 영지 은행 펀드 · 대지주 자산 보너스 · 영지 인프라 통합")
    eco89 = js(ctx, """
      const now = 300000;
      const s = defaultState(now);
      s.gold = 500000;
      const sh0 = s.shards;
      const pt0 = s.rebirth.points;
      const dL = openDeposit(s, 'long', 200000, now);
      const clL = claimDeposit(s, dL.slot.id, dL.slot.maturesAt + 10);
      const tLow = tycoonBonus(200000);
      const tMid = tycoonBonus(5000000);
      const tMax = tycoonBonus(200000000);
      // 대지주 보너스 computeBuffs/calcStats 실반영
      for (const c of CITIES.slice(0, 30)) s.land.owned[c.key] = 50;
      const bf = computeBuffs(s, now);
      const st = calcStats(s, bf);
      return {
        fundOk: clL.ok && clL.interest === 50000 && clL.bonusShards === 120 && clL.bonusPoints === 2 && s.shards === sh0 + 120 && s.rebirth.points === pt0 + 2,
        tycoonScale: tLow.tier === 0 && tMid.tier >= 3 && tMax.tier === 6 && tMax.atkPct === 24 && tMax.bossPct === 18,
        applied: bf.tycoon && bf.tycoon.tier >= 1 && st.bossDmgPct >= bf.tycoonBossPct / 100,
      };
    """)
    ok(eco89["fundOk"], "영지 은행 장기 펀드 만기 시 이자 25% + 💎120 + ✨2P 정상 지급", json.dumps(eco89))
    ok(eco89["tycoonScale"] and eco89["applied"], "후반 대지주 자산 보너스(50만~1억+) 로그 스케일 및 전투 스탯 실반영", json.dumps(eco89))
    ok("estateInfraCard" in read("src/ui-land.js") and "estateInfraCard" in read("src/ui.js") and "대지주 자산 보너스" in read("src/ui-land.js"), "ui-land.js · ui.js — 영지 인프라 통합 요약 및 대지주 보너스 대시보드 배선")

    # ── 57) v8.10.0 🔥 보스 HP 50% 광폭화 · ⚠️ 위험 장판 & ⚡ 타이밍 탭 반격 카운터 ──
    section("v8.10.0 보스 광폭화 페이즈 & 타이밍 탭 반격 카운터")
    boss810 = js(ctx, """
      const now = 400000;
      const s = defaultState(now);
      s.stage = 3; s.bossReady = true;
      const b = new Battle(s, () => ({}), () => 0.3, now);
      b.startBoss(now);
      const boss = b.boss;
      boss.hp = Math.round(boss.maxHp * 0.55);
      // 1) HP 50% 이하 진입 → 광폭화 이벤트 발생
      b.hit([boss], 10, 'normal', now + 100);
      const ev1 = b.drainEvents();
      const enraged = !!boss.enraged && ev1.some((e) => e.t === 'bossEnrage');
      // 2) 강공격 전조 중 캔버스 탭 → 퍼펙트 반격 카운터 + 가드 50% 경감
      boss.hp = boss.maxHp;
      boss.windupAt = now + 200;
      boss.windupDur = 500;
      boss.windupHeavy = true;
      boss.heavy = true;
      boss.countered = false;
      const res = b.tapStrike(boss.x, now + 350);
      const ev2 = b.drainEvents();
      return {
        enraged,
        counterOk: res.ok && res.counter === true && !boss.windupHeavy && b.counterGuardUntil > now + 350 && ev2.some((e) => e.t === 'tapCounter'),
      };
    """)
    ok(boss810["enraged"], "보스 HP 50% 이하 진입 시 광폭화(bossEnrage) 발동", json.dumps(boss810))
    ok(boss810["counterOk"], "보스 강공격 전조 중 캔버스 탭 → 퍼펙트 반격(tapCounter)·강공격 저지·카운터 가드 발동", json.dumps(boss810))
    ok("ev.t === 'tapCounter'" in read("src/render.js") and "ev.t === 'bossEnrage'" in read("src/render.js") and "지금 탭→반격" in read("src/render.js"), "render.js — 보스 광폭 오라·위험 장판·퍼펙트 반격 카운터 캔버스 연출")

    # ── 58) v8.11.0 🐾 펫 아키타입별 자유 모션 & 🛡️ 영지 기사단 4인 전원 캔버스 출격 ──
    section("v8.11.0 펫 아키타입별 자유 모션 & 영지 기사단 4인 전원 출격")
    rnd811 = read("src/render.js")
    ok(
        all(x in rnd811 for x in ["pet.id === 'dragon'", "pet.id === 'golem'", "dashDist", "hasPal", "hasMer", "kind: 'shield'", "kind: 'coin'"]),
        "render.js — 펫 비행 스웁/맹수 도약/골렘 슬램 자유 모션 & 기사단 4인(아서·실비아·멀린·마르코) 전원 캔버스 출격",
    )

    # ── 59) v8.12.0 🎬 연속 교전 콤보 · 물리 관성 · 리본 검기 · hero_run.png ──
    section("v8.12.0 연속 교전 콤보 · 물리 관성 · 리본 검기 · 추격 달리기")
    rnd812 = read("src/render.js")
    ok(
        os.path.exists(os.path.join(ROOT, "assets/sprites/hero_run.png"))
        and "'./assets/sprites/hero_run.png'" in read("sw.js")
        and "'hero_run'" in read("app.js"),
        "hero_run.png 존재 · sw.js 프리캐시 · app.js 프리로드 동기화",
    )
    ok(
        all(x in rnd812 for x in ["engageX", "inComboHold", "drawSwordTrail", "_prevHeroFrame", "heroVx", "m.__visX", "hero_run"]),
        "render.js — 적 앞 교전 유지·잔심 콤보 연결·크로스페이드·리본 검기·몬스터 물리 보간 구현",
    )

    print(f"\n통과 {passed} / 실패 {failed}")
    if failures:
        print("실패 항목:\n - " + "\n - ".join(failures))
        return 1
    print("✅ v4 게스트 통합판 검증 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
