#!/usr/bin/env python3
"""land-rpg v3 통합 경제 밸런스 시뮬레이션 (QuickJS 로 실제 게임 코드 실행)

실제 src/data.js · land-data.js · land.js · state.js · combat.js 를 그대로 이어붙여
여러 플레이 스타일 봇을 돌리고 스테이지별 소요 시간을 비교한다.

  active     : 강화 + 부동산 매수 + 임대수령 (적극 플레이어)
  gear-only  : 강화만 (부동산 무시)
  land-only  : 부동산만 (강화 무시)
  passive    : 손대지 않고 방치

사용: python3 tools/balance_sim.py [--hours 2] [--scenario active]
"""
import atexit
import json
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
        "rl.on('line', (line) => {\n"
        "  if (!line) return;\n"
        "  try {\n"
        "    const msg = JSON.parse(line);\n"
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

        def eval(self, code):
            self._p.stdin.write(json.dumps({"code": code}) + "\n")
            self._p.stdin.flush()
            out = self._p.stdout.readline()
            if not out:
                raise RuntimeError(self._p.stderr.read() or "node context exited")
            res = json.loads(out)
            if not res.get("ok"):
                raise RuntimeError(res.get("err", "js eval error"))
            return res.get("val")

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
FILES = ["src/data.js", "src/gear.js", "src/gems.js", "src/land-data.js", "src/region.js", "src/synergy.js", "src/land.js", "src/auction.js", "src/orders.js", "src/portfolio-ops.js", "src/rebirth.js", "src/meta.js", "src/expedition.js", "src/invasion.js", "src/citadel.js", "src/relics.js", "src/daily.js", "src/tower.js", "src/quests.js", "src/pass.js", "src/rift.js", "src/state.js", "src/combat.js"]


def strip_module(src):
    src = re.sub(r"^import\s+[^;]+;", "", src, flags=re.M | re.S)
    src = re.sub(r"^export\s+(?=(const|let|var|function|class|async))", "", src, flags=re.M)
    return src.replace("export default ", "")


def module_js(src):
    """ES 모듈 → 함수 스코프로 감싼 조각(export 이름만 전역에 노출)."""
    names = re.findall(r"^export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)", src, flags=re.M)
    body = strip_module(src).replace('"use strict";', "")
    tail = ";\n".join(f"exports.{n} = {n}" for n in names)
    return "(function(exports){\n" + body + "\n;" + tail + ";\n})(__m);\nObject.assign(globalThis, __m);"


def read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()


def bundle(files):
    return "\nglobalThis.__m = globalThis.__m || {};\n" + "\n".join(module_js(read(f)) for f in files)


SIM = r"""
(function (hours, doBuy, doEnhance, doShop) {
  const rng = (function (seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  })(7);

  const s = defaultState(0);
  let buffs = computeBuffs(s, 0);
  const b = new Battle(s, () => buffs, rng, 0);
  let t = 0;
  const DT = 50;
  const END = hours * 3600 * 1000;

  const marks = [];
  const spin = [];
  let lastStage = s.stage;
  let bossStarts = 0, bossFails = 0, deaths = 0, rentClaims = 0, rentTotal = 0, buys = 0;
  const failBy = {};
  let lastBuy = 0, lastRent = 0, lastEnh = 0, lastShop = 0;
  let lastMarkT = 0;
  const stageTimes = [];

  const slots = ['weapon', 'armor', 'weapon', 'helmet', 'ring', 'amulet'];
  let slotIdx = 0;

  function buyLoop() {
    const ranked = CITIES.slice().sort((a, c) => (c.rentPerMin / c.base) - (a.rentPerMin / a.base));
    const buildings = s.land ? Object.keys(s.land.owned).filter((k) => s.land.owned[k] >= 3).length : 0;
    // 1) 건물(3평 이상) 40곳까지는 폭을 넓혀 공격력 버프 확보
    if (buildings < 40) {
      let left = Math.floor(s.gold * 0.5);
      let guard = 0;
      for (const c of ranked) {
        if (left < c.base * 3) continue;
        if ((s.land.owned[c.key] || 0) >= 3) continue;
        const q = Math.max(3, Math.min(20, Math.floor(left * 0.4 / c.base)));
        if (applyTrade(s, c.key, 'buy', q, t).ok) buys++;
        left = Math.floor(s.gold * 0.25);
        if (++guard > 4) break;
      }
    } else if (s.gold > 6000) {
      // 2) 이후에는 회수 좋은 지역에 깊게 매수 → 임대수익 극대화
      const c = ranked[0];
      const q = Math.floor((s.gold * 0.4) / c.base);
      if (q > 0 && applyTrade(s, c.key, 'buy', q, t).ok) buys++;
    }
    buffs = computeBuffs(s, t);
    b.refreshStats(t);
  }

  while (t < END) {
    b.tick(DT, t);
    t += DT;
    const evs = b.drainEvents();
    for (const ev of evs) {
      if (ev.t === 'bossStart') bossStarts++;
      else if (ev.t === 'bossFail') { bossFails++; failBy[ev.why + '@' + s.stage] = (failBy[ev.why + '@' + s.stage] || 0) + 1; }
      else if (ev.t === 'playerDeath') deaths++;
    }
    if (doEnhance && t - lastEnh >= 5000) {
      lastEnh = t;
      for (let i = 0; i < 3; i++) {
        const slot = slots[slotIdx % slots.length];
        if (tryEnhance(s, slot, s.shards > 200 ? 10 : 1).done > 0) slotIdx++;
        else break;
      }
      b.refreshStats(t);
    }
    if (doBuy) {
      if (t - lastRent >= 60000) {
        lastRent = t;
        accrueRent(s, t, 1);
        if (s.land.accruedRent >= 1) {
          const got = claimRent(s);
          rentClaims++; rentTotal += got;
          buffs = computeBuffs(s, t);
          b.refreshStats(t);
        }
      }
      if (t - lastBuy >= 10000) { lastBuy = t; buyLoop(); }
    }
    if (doShop && t - lastShop >= 5000) {
      lastShop = t;
      const price = shardPrice(s);
      if (s.gold > price * 2) buyShards(s, Math.floor((s.gold * 0.6) / price));
    }
    if (s.stage !== lastStage) {
      stageTimes.push({ stage: s.stage - 1, sec: Math.round((t - lastMarkT) / 1000) });
      lastMarkT = t;
      marks.push({ t: Math.round(t / 1000), to: s.stage, level: s.level, atk: b.stats.atk, buff: buffs.atkPct });
      lastStage = s.stage;
    }
    if (t % (10 * 60000) < DT) {
      const p = portfolioOf(s, t);
      spin.push({
        min: Math.round(t / 60000), stage: s.stage, lv: s.level, atk: b.stats.atk,
        gold: s.gold, shards: s.shards, asset: Math.round(p.totalAsset),
        cities: p.cities, pyeong: p.pyeong, incomeHr: Math.round(p.incomePerHour),
        atkBuff: buffs.atkPct, goldBuff: buffs.goldPct, hpBuff: buffs.hpPct, critBuff: buffs.critPct, dropBuff: buffs.dropPct,
        eq: Object.values(s.equip).reduce((a, c) => a + c, 0),
      });
    }
  }
  const p = portfolioOf(s, t);
  return JSON.stringify({
    hours, marks, stageTimes, spin, bossStarts, bossFails, deaths, rentClaims, rentTotal, buys, failBy,
    end: {
      stage: s.stage, level: s.level, gold: s.gold, shards: s.shards, asset: Math.round(p.totalAsset),
      cities: p.cities, pyeong: p.pyeong, incomeHr: Math.round(p.incomePerHour),
      atk: b.stats.atk, hp: b.stats.hpMax, dps: b.stats.dps,
      equip: s.equip, incomeMin: Math.round(p.incomePerMin),
      buffs: { atk: buffs.atkPct, gold: buffs.goldPct, hp: buffs.hpPct, crit: buffs.critPct, drop: buffs.dropPct },
    },
  });
})"""


def run(ctx, hours, do_buy, do_enhance, do_shop):
    return json.loads(ctx.eval(
        f"({SIM})({json.dumps(hours)}, {str(do_buy).lower()}, {str(do_enhance).lower()}, {str(do_shop).lower()})"
    ))


def stage_at(marks, minutes):
    """해당 분에 도달해 있던 스테이지"""
    st = 1
    for m in marks:
        if m["t"] <= minutes * 60:
            st = m["to"]
    return st


def main():
    hours = 2.0
    only = None
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--hours" and i + 1 < len(args):
            hours = float(args[i + 1])
        if a == "--scenario" and i + 1 < len(args):
            only = args[i + 1]

    ctx = quickjs.Context()
    ctx.eval(bundle(FILES))

    scenarios = [
        ("active", True, True, True),
        ("gear-only", False, True, True),
        ("land-only", True, False, False),
        ("passive", False, False, False),
    ]

    results = {}
    for name, buy, enh, shop in scenarios:
        if only and name != only:
            continue
        r = run(ctx, hours, buy, enh, shop)
        results[name] = r
        print(f"\n■ {name} ({hours:g}시간)")
        print("  분  스테이지  Lv  공격력   보유골드      총자산      지역 평수    임대/h  장비  버프(공/골/체/치/드)")
        for row in r["spin"]:
            print(
                f"  {row['min']:>3}   S{row['stage']:<5} Lv{row['lv']:<3} {row['atk']:>6} {row['gold']:>11,} {row['asset']:>12,} "
                f"{row['cities']:>3}곳 {row['pyeong']:>7,} {row['incomeHr']:>9,} {row['eq']:>4}  "
                f"+{row['atkBuff']}/{row['goldBuff']}/{row['hpBuff']}/{row['critBuff']}/{row['dropBuff']}%"
            )
        print("  클리어:", " ".join(f"S{m['to']}@{m['t']}s" for m in r["marks"][:32]))
        print(
            f"  보스 {r['bossStarts']}회 · 실패 {r['bossFails']}회 · 사망 {r['deaths']}회 · "
            f"임대수령 {r['rentClaims']}회({r['rentTotal']:,}골드) · 매수 {r['buys']}건"
        )
        if r["failBy"]:
            print("  실패 상세:", json.dumps(r["failBy"], ensure_ascii=False))
        print("  최종:", json.dumps(r["end"], ensure_ascii=False))

    if len(results) > 1:
        print("\n■ 요약 (도달 스테이지)")
        print("  시나리오      5분   10분   20분   30분   60분   120분  보스실패")
        for name, r in results.items():
            cells = "  ".join(f"S{stage_at(r['marks'], m):<4}" for m in (5, 10, 20, 30, 60, 120))
            print(f"  {name:<12} {cells}  {r['bossFails']}회")


if __name__ == "__main__":
    main()
