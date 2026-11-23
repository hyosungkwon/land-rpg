// land-rpg / app.js
// 앱 부트스트랩: 로컬 상태 로드(=게스트) → 전투/렌더/UI 연결 → 루프 → 자동 저장.
// v3: 로그인·클라우드·Firebase 없음. 네트워크 대기 없이 즉시 시작하고 오프라인에서도 완전 동작.
import { APP_VERSION, ECON, EQUIP, SKILLS, SAVE_KEY, stageDef } from './src/data.js';
import {
  loadState, saveState, offlineSummary, applyOffline, tryEnhance, tryUpgradeSkill,
  shardPrice, buyShards,
} from './src/state.js';
import { Battle } from './src/combat.js';
import {
  computeBuffs, portfolioOf, accrueRent, claimRent, applyTrade, quoteTrade, maxBuyQty,
  CITY_BY_KEY, formatGold, LAND,
} from './src/land.js';
import { Renderer } from './src/render.js';
import { UI } from './src/ui.js';

// 구형 Safari / 삼성 인터넷 대비 CanvasRenderingContext2D.roundRect 폴리필
(() => {
  try {
    const P = typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype;
    if (!P || typeof P.roundRect === 'function') return;
    P.roundRect = function (x, y, w, h, r) {
      const rr = Math.min(typeof r === 'number' ? r : 0, Math.abs(w) / 2, Math.abs(h) / 2);
      this.beginPath();
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
    };
  } catch (e) { /* ignore */ }
})();

const STORAGE = (() => {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
})();

const esc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class App {
  constructor() {
    // 구버전(v1/v2) 저장 키는 v3에서 쓰지 않는다 — 남아 있으면 함께 정리해 '싹 초기화'를 보장
    try {
      if (STORAGE && !STORAGE.getItem(SAVE_KEY)) STORAGE.removeItem('land_rpg_state_v1');
    } catch (e) { /* ignore */ }
    this.s = loadState(STORAGE);
    this.buffs = computeBuffs(this.s);
    this.battle = new Battle(this.s, () => this.buffs);
    this.renderer = new Renderer(document.getElementById('battle'));
    this.renderer.setBattle(this.battle);
    this.renderer.effects = this.s.effects !== false;
    this.ui = new UI(this);
    this.actions = this.makeActions();
    this.lastTs = 0;
    this.lastSave = 0;
    this.lastRentTick = 0;
    this.startedAt = Date.now();
    this.hiddenAt = 0;
  }

  get prop() {
    return portfolioOf(this.s);
  }

  async boot() {
    this.ui.init();
    this.renderer
      .preload(['hero_idle', 'hero_attack', 'hero_skill', ...this.stageMonsterNames(this.s.stage)])
      .then(() => this.renderer.resize())
      .catch(() => {});

    const now = Date.now();

    // 오프라인 임대수익 (원작과 같이 5%만 적립)
    this.accrueRent(now, LAND.rentOfflineRate);

    // 오프라인 사냥 보상 (최대 12시간)
    const summary = offlineSummary(this.s, now, this.buffs);
    if (summary.sec >= 60 && (summary.gold || summary.exp || summary.shards)) {
      const ups = applyOffline(this.s, summary);
      this.save(true);
      setTimeout(() => this.showOfflinePopup(summary, ups), 450);
    }

    this.ui.render();
    // PWA 바로가기(?tab=land) 지원
    try {
      const tabParam = new URLSearchParams((typeof location !== 'undefined' && location.search) || '').get('tab');
      if (tabParam && ['hunt', 'gear', 'land', 'settings'].includes(tabParam)) this.ui.setTab(tabParam);
    } catch (e) { /* ignore */ }
    this.ui.refreshLive(Date.now());
    requestAnimationFrame((ts) => this.loop(ts));
    setTimeout(() => this.ui.hideBoot(), 160);

    this.bindLifecycle();
    this.registerSW();
  }

  stageMonsterNames(stage) {
    const d = stageDef(stage);
    return [...d.normals, d.boss];
  }

  /* ───────────── 메인 루프 ─────────────
   * 다음 프레임을 먼저 예약한 뒤 작업한다. 어느 한 단계에서 예외가 나도 루프가 멈추지 않는다.
   */
  loop(ts) {
    this._raf = requestAnimationFrame((t) => this.loop(t));
    const now = Date.now();
    const tsNum = typeof ts === 'number' && isFinite(ts) ? ts : now;
    let dt = this.lastTs ? tsNum - this.lastTs : 16;
    if (!isFinite(dt) || dt < 0) dt = 16;
    dt = Math.min(200, dt);
    this.lastTs = tsNum;

    let events = [];
    try {
      this.battle.tick(dt, now);
      events = this.battle.drainEvents();
    } catch (e) {
      this.reportError('battle', e);
      this.recoverBattle();
    }

    try {
      if (events.length) this.renderer.onEvents(events, now);
    } catch (e) {
      this.reportError('effects', e);
    }
    try {
      this.renderer.frame(now);
      this._lastFrameOk = now;
    } catch (e) {
      this.reportError('render', e);
      this.recoverRender(now);
    }
    try {
      if (events.length) this.handleEvents(events, now);
      this.ui.refreshLive(now);
    } catch (e) {
      this.reportError('ui', e);
    }

    try {
      this.s.records.playMs = (this.s.records.playMs || 0) + dt;
      if (now - this.lastRentTick >= 1000) {
        this.lastRentTick = now;
        this.accrueRent(now, 1);
      }
      if (now - this.lastSave > 8000) {
        this.lastSave = now;
        this.save();
      }
    } catch (e) {
      this.reportError('save', e);
    }
  }

  /* ───────────── 오류 보고 · 자동복구 ───────────── */
  reportError(where, err) {
    const msg = (err && (err.message || err.name)) || String(err);
    this._errCounts = this._errCounts || {};
    const n = (this._errCounts[where] = (this._errCounts[where] || 0) + 1);
    if (this._lastErr !== msg) {
      this._lastErr = msg;
      try { console.warn(`[land-rpg] ${where} error:`, err); } catch (e) { /* ignore */ }
    }
    if (n === 3) this.showErrorBadge(`${where}: ${msg}`);
  }

  showErrorBadge(text) {
    try {
      if (!this._badgeEl) {
        const el = document.createElement('div');
        el.id = 'errBadge';
        el.style.cssText =
          'position:fixed;left:8px;bottom:70px;z-index:9999;max-width:80vw;padding:6px 10px;' +
          'border-radius:10px;background:rgba(150,20,30,.88);color:#fff;font-size:11px;' +
          'line-height:1.35;font-family:system-ui,sans-serif;pointer-events:none;opacity:.92';
        document.body.appendChild(el);
        this._badgeEl = el;
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); this._badgeEl = null; }, 6000);
      }
      this._badgeEl.textContent = `⚠ ${String(text).slice(0, 90)}`;
    } catch (e) { /* ignore */ }
  }

  recoverBattle() {
    try {
      this.battle.monsters = [];
      this.battle.boss = null;
      this.battle.events = [];
      this.battle.refreshStats(Date.now());
      if (!isFinite(this.battle.player.hp)) this.battle.player.hp = this.battle.stats.hpMax;
      this.battle.spawnInitial(Date.now());
    } catch (e) { /* ignore */ }
  }

  recoverRender(now) {
    const since = now - (this._lastFrameOk || 0);
    try {
      const ctx = this.renderer.ctx;
      ctx.restore && ctx.setTransform(this.renderer.dpr, 0, 0, this.renderer.dpr, 0, 0);
      this.renderer.shake = 0;
      this.renderer.bgKey = '';
    } catch (e) { /* ignore */ }
    if (since > 2500) {
      try { this.renderer.resize(); } catch (e) { /* ignore */ }
    }
  }

  handleEvents(events, now) {
    for (const ev of events) {
      if (ev.t === 'monsterDeath') {
        if (ev.isBoss) {
          this.ui.addLog(`👑 <b>${ev.ko}</b> 처치! 💰${ev.gold.toLocaleString()} 💎${ev.shards}`);
        } else if (ev.shards > 0) {
          this.ui.addLog(`${ev.ko} 처치 · 💰${ev.gold} 💎${ev.shards}`);
        }
      } else if (ev.t === 'levelUp') {
        this.ui.toast(`⬆️ 레벨 업! Lv.${ev.level}`, 'green');
        this.ui.addLog(`<b>레벨 업</b> Lv.${ev.level} · 체력 완충`);
        this.ui.renderIfNeeded();
      } else if (ev.t === 'stageClear') {
        this.ui.toast(`🏅 스테이지 ${ev.stage} 클리어! 💎+${ev.bonus}`, 'gold');
        this.ui.addLog(`<b>스테이지 ${ev.stage} 클리어</b> → ${ev.next} (보너스 💎${ev.bonus})`);
        this.ui.renderIfNeeded();
        this.save(true);
        this.renderer.preload(this.stageMonsterNames(this.s.stage)).catch(() => {});
      } else if (ev.t === 'bossStart') {
        this.ui.addLog(`⚔️ <b>${ev.ko}</b> 등장 — ${ECON.bossTimeLimitMs / 1000}초 제한`);
      } else if (ev.t === 'bossFail') {
        const why = ev.why === 'timeout' ? '시간 초과' : '전투 불능';
        this.ui.toast(`보스 퇴치 실패 (${why}) · 조금 더 강해져서 재도전`, 'red');
        this.ui.addLog(`보스 <b>${ev.ko}</b> 실패(${why}) · ${ECON.bossRetryKills}마리 더 처치하면 재도전`);
        this.ui.renderIfNeeded();
      } else if (ev.t === 'playerDeath') {
        this.ui.addLog('💀 전투 불능 — 3초 후 부활');
      } else if (ev.t === 'revive') {
        this.ui.addLog('✨ 부활했습니다');
      }
    }
  }

  /* ───────────── 임대수익 적립 ───────────── */
  accrueRent(now, rate = 1) {
    return accrueRent(this.s, now, rate);
  }

  save(immediate = false) {
    if (this._resetting) return; // 초기화 직후(새로고침 전 beforeunload 저장)로 데이터가 되살아나지 않게
    this.battle.writeHp();
    this.s.lastActiveAt = Date.now();
    saveState(STORAGE, this.s);
    if (immediate) this.lastSave = Date.now();
  }

  /* ───────────── 수명주기 ───────────── */
  bindLifecycle() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.hiddenAt = Date.now();
        this.accrueRent(Date.now(), 1);
        this.save(true);
      } else {
        const away = Date.now() - (this.hiddenAt || Date.now());
        // 자리를 비운 동안의 임대수익은 5%만 적립
        const rent = this.accrueRent(Date.now(), LAND.rentOfflineRate);
        if (rent >= 1) this.ui.toast(`💤 방치 임대수익 +${formatGold(rent)} (5%)`, 'gold');
        if (away > 120000) {
          const summary = offlineSummary({ ...this.s, lastActiveAt: this.hiddenAt }, Date.now(), this.buffs);
          if (summary.gold > 0) {
            const ups = applyOffline(this.s, summary);
            this.ui.toast(`🌙 방치 보상 +💰${summary.gold.toLocaleString()}`, 'gold');
            this.ui.render();
            this.save(true);
            if (ups > 0) this.battle.refreshStats();
          }
        }
        this.hiddenAt = 0;
        this.battle.refreshStats();
      }
    });
    window.addEventListener('beforeunload', () => this.save(true));
    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => this.renderer.resize(), 120);
    });
  }

  registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
        reg.update && reg.update().catch(() => {});
      })
      .catch(() => {});

    try {
      if (!navigator.serviceWorker.controller) return;
      let done = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (done) return;
        done = true; // 페이지당 한 번만
        this.save(true);
        setTimeout(() => location.reload(), 350);
      });
    } catch (e) { /* ignore */ }
  }

  /* ───────────── 사용자 액션 ───────────── */
  makeActions() {
    return {
      castSkill: (key) => {
        const ok = this.battle.castSkill(key, Date.now());
        if (!ok) {
          const left = Math.max(0, this.s.skills[key].last + SKILLS[key].cd - Date.now());
          this.ui.toast(left > 0 ? `${SKILLS[key].name} 재사용 대기 ${(left / 1000).toFixed(1)}초` : '지금은 시전할 수 없습니다');
        }
      },
      challengeBoss: () => {
        const b = this.battle;
        if (b.boss) {
          this.ui.toast('이미 보스와 전투 중입니다');
          return;
        }
        if (!this.s.bossReady) {
          const need = Math.max(0, ECON.normalKillsPerStage - this.s.killsInStage);
          this.ui.toast(`보스 도전까지 ${need}마리 남았습니다`);
          return;
        }
        if (b.challengeBoss(Date.now())) this.ui.render();
      },
      toggleAutoBoss: () => {
        this.s.autoBoss = !this.s.autoBoss;
        this.save();
        this.ui.toast(this.s.autoBoss ? '10마리마다 보스 자동 도전' : '보스 자동 도전 꺼짐');
        this.ui.render();
      },
      toggleEffects: () => {
        this.s.effects = !this.s.effects;
        this.renderer.effects = this.s.effects;
        this.save();
        this.ui.render();
      },
      enhance: (slot, times) => {
        const r = tryEnhance(this.s, slot, times);
        if (r.done > 0) {
          this.ui.toast(`${EQUIP[slot].icon} ${EQUIP[slot].name} +${this.s.equip[slot]} (💎${r.spent})`, 'green');
          this.battle.refreshStats();
          this.save();
          this.ui.render();
        } else {
          this.ui.toast(r.reason || '강화할 수 없습니다', 'red');
        }
      },
      upgradeSkill: (key) => {
        const r = tryUpgradeSkill(this.s, key);
        if (r.ok) {
          this.ui.toast(`${SKILLS[key].name} Lv.${r.lv} (💎${r.spent})`, 'green');
          this.save();
          this.ui.render();
        } else {
          this.ui.toast(r.reason || '강화할 수 없습니다', 'red');
        }
      },

      buyShards: (n) => {
        const price = shardPrice(this.s);
        const count = n === 'max' ? Math.floor(this.s.gold / price) : Math.floor(Number(n) || 0);
        if (count <= 0) {
          this.ui.toast('골드가 부족합니다', 'red');
          return;
        }
        const r = buyShards(this.s, count);
        if (!r.ok) {
          this.ui.toast(r.reason, 'red');
          return;
        }
        this.save(true);
        this.ui.toast(`💎 강화석 ${r.n}개 구매 (💰${r.cost.toLocaleString()})`, 'green');
        this.ui.render();
      },

      /* ── 부동산 ── */
      landTrade: (key, side) => this.openLandTrade(key, side),
      landMore: () => {
        this.s.land.page = Math.max(1, Math.floor(Number(this.s.land.page) || 1)) + 1;
        this.ui.render();
      },
      landSort: (k) => {
        this.s.land.sort = k;
        this.s.land.page = 1;
        this.save();
        this.ui.render();
      },
      landTier: (k) => {
        this.s.land.tier = k;
        this.s.land.page = 1;
        this.save();
        this.ui.render();
      },
      landSearch: (q) => {
        this.s.land.q = String(q || '').slice(0, 30);
        this.s.land.page = 1;
        this.ui.updateLandList();
      },
      claimRent: () => this.openClaimRent(),
      resetGame: () => {
        this.ui.modal({
          title: '⚠️ 게임 초기화',
          sub: '이 기기의 진행도(레벨·골드·부동산)가 모두 사라집니다. 되돌릴 수 없습니다.',
          actions: [
            { label: '취소', onClick: () => {} },
            {
              label: '초기화',
              style: 'primary',
              onClick: () => {
                this._resetting = true;
                try {
                  STORAGE && STORAGE.removeItem(SAVE_KEY);
                  STORAGE && STORAGE.removeItem('land_rpg_state_v1'); // 구버전 키도 정리
                } catch (e) { /* ignore */ }
                location.reload();
              },
            },
          ],
        });
      },
    };
  }

  /* ───────────── 부동산 거래 모달 ───────────── */
  openLandTrade(key, side) {
    const city = CITY_BY_KEY[key];
    if (!city) return;
    const now = Date.now();
    const land = this.s.land;
    const held = Math.floor(Number(land.owned[key]) || 0);
    const max = side === 'buy' ? maxBuyQty(key, this.s, now) : held;
    if (max <= 0) {
      this.ui.toast(
        side === 'buy' ? '골드가 부족하거나 잔여 공급이 없습니다' : '보유한 매물이 없습니다',
        'red',
      );
      return;
    }
    const price = quoteTrade(key, side, 1, this.s, now).price;
    let qty = side === 'buy' ? Math.min(max, 10) : 1;
    const chips = side === 'buy'
      ? [1, 10, 100, 1000].filter((n) => n < max).concat([max])
      : [Math.floor(held / 2), held].filter((n, i, arr) => n > 0 && arr.indexOf(n) === i);

    const body = `
      <div class="tsum">
        <div><span>지역</span><b>${city.emoji} ${esc(city.name)} <i>${esc(city.region)}</i></b></div>
        <div><span>현재가</span><b>💰${price.toLocaleString()}/평</b></div>
        <div><span>${side === 'buy' ? '보유 / 잔여' : '보유'}</span><b>${held.toLocaleString()}평${side === 'buy' ? ` / ${Math.max(0, city.supply - held).toLocaleString()}평` : ''}</b></div>
        <div><span>보유 골드</span><b>💰${this.s.gold.toLocaleString()}</b></div>
      </div>
      <div class="input-row" style="margin-top:10px">
        <input id="landQty" type="number" inputmode="numeric" min="1" max="${max}" step="1" value="${qty}">
        <button class="btn small ghost" id="landQtyMax" type="button">최대</button>
      </div>
      <div class="chips" style="margin-top:7px" id="landQtyChips">
        ${chips.map((n) => `<button class="chip" type="button" data-q="${n}">${n === max && side === 'buy' ? `최대 ${n.toLocaleString()}평` : `${n.toLocaleString()}평`}</button>`).join('')}
      </div>
      <div class="note" id="landPrev" style="margin-top:9px"></div>`;

    this.ui.modal({
      title: side === 'buy' ? '🏠 매수' : '💰 매도',
      sub: `${city.name} · ${city.region} · 거래세 ${(LAND.feeRate * 100).toFixed(1)}%`,
      body,
      actions: [
        { label: '취소', onClick: () => {} },
        { label: side === 'buy' ? '매수 확정' : '매도 확정', style: 'primary', onClick: () => this.doLandTrade(key, side, qty) },
      ],
    });

    const inp = document.getElementById('landQty');
    const prev = document.getElementById('landPrev');
    const refresh = () => {
      const q = Math.max(1, Math.min(max, Math.floor(Number(inp.value) || 1)));
      qty = q;
      const quote = quoteTrade(key, side, q, this.s, Date.now());
      if (!quote.ok) {
        prev.innerHTML = `<span style="color:var(--red)">${esc(quote.reason)}</span>`;
        return;
      }
      prev.innerHTML =
        side === 'buy'
          ? `총 <b>💰${quote.total.toLocaleString()}</b> + 거래세 ${quote.fee.toLocaleString()}<br>거래 후 골드 <b>💰${quote.after.toLocaleString()}</b>`
          : `총 <b>💰${quote.total.toLocaleString()}</b> − 거래세 ${quote.fee.toLocaleString()}<br>받는 골드 <b class="gold">💰${(quote.total - quote.fee).toLocaleString()}</b> · 거래 후 💰${quote.after.toLocaleString()}`;
    };
    inp.addEventListener('input', refresh);
    inp.addEventListener('change', () => {
      inp.value = String(Math.max(1, Math.min(max, Math.floor(Number(inp.value) || 1))));
      refresh();
    });
    document.getElementById('landQtyMax').addEventListener('click', () => {
      inp.value = String(max);
      refresh();
    });
    document.getElementById('landQtyChips').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-q]');
      if (!b) return;
      inp.value = b.dataset.q;
      refresh();
    });
    refresh();
  }

  doLandTrade(key, side, qty) {
    const city = CITY_BY_KEY[key];
    const q = Math.floor(Number(qty) || 0);
    if (!city || q <= 0) return;
    const r = applyTrade(this.s, key, side, q, Date.now());
    if (!r.ok) {
      this.ui.toast(`거래 실패: ${r.reason}`, 'red');
      return;
    }
    // 건물주 버프 즉시 반영
    this.buffs = computeBuffs(this.s);
    this.battle.refreshStats();
    this.save(true);
    this.ui.toast(
      `${side === 'buy' ? '🏠 매수' : '💰 매도'} ${city.emoji}${city.name} ${q.toLocaleString()}평 · 💰${r.quote.total.toLocaleString()}`,
      side === 'buy' ? 'green' : 'gold',
    );
    const b = this.buffs;
    if (side === 'buy' && b.active) {
      this.ui.toast(`🏢 건물주 버프 · 공격 +${b.atkPct}% · 골드 +${b.goldPct}% · 체력 +${b.hpPct}%`, 'gold');
    }
    this.ui.render();
  }

  openClaimRent() {
    const amt = Math.floor(Number(this.s.land.accruedRent) || 0);
    if (amt < 1) {
      this.ui.toast('아직 쌓인 임대수익이 없습니다');
      return;
    }
    const p = portfolioOf(this.s);
    this.ui.modal({
      title: '💤 임대수익 수령',
      sub: `💰 ${amt.toLocaleString()}`,
      body: `<div class="note">보유 매물 ${p.cities}곳 · ${p.pyeong.toLocaleString()}평에서 쌓인 임대수익을 골드로 받습니다.<br>
        받은 골드는 바로 장비 강화 재료(강화석)나 추가 매물에 쓸 수 있습니다.</div>`,
      actions: [
        { label: '취소', onClick: () => {} },
        {
          label: '수령',
          style: 'primary',
          onClick: () => {
            const got = claimRent(this.s);
            this.s.records.totalRent = (this.s.records.totalRent || 0) + got;
            this.save(true);
            this.ui.toast(`💤 임대수익 💰${got.toLocaleString()} 수령`, 'gold');
            this.ui.render();
          },
        },
      ],
    });
  }

  showOfflinePopup(summary, levelUps) {
    const h = Math.floor(summary.sec / 3600);
    const m = Math.floor((summary.sec % 3600) / 60);
    const away = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    this.ui.modal({
      title: '🌙 방치 보상',
      sub: `${away} 동안 사냥을 계속했습니다.${summary.capped ? ` (최대 ${ECON.offlineCapHours}시간까지만 정산)` : ''}`,
      body: `<div class="modal-rewards">
               <div class="rw"><div class="e">💰</div><div class="v">${summary.gold.toLocaleString()}</div><div class="k">골드</div></div>
               <div class="rw"><div class="e">✨</div><div class="v">${summary.exp.toLocaleString()}</div><div class="k">경험치</div></div>
               <div class="rw"><div class="e">💎</div><div class="v">${summary.shards.toLocaleString()}</div><div class="k">강화석</div></div>
             </div>
             ${levelUps > 0 ? `<div class="note">레벨 업 +${levelUps} · 스탯이 상승했습니다.</div>` : `<div class="note">보상은 이미 반영되었습니다.</div>`}`,
      actions: [{ label: '확인', style: 'primary', onClick: () => {} }],
    });
  }
}

const app = new App();
window.LAND_RPG = app; // 디버깅/검증용
app.boot();
