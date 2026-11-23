// land-rpg / app.js
// 앱 부트스트랩: 상태 로드 → 전투/렌더/UI 연결 → 루프 → Firebase 연동.
import { APP_VERSION, ECON, EQUIP, SKILLS, stageDef } from './src/data.js';
import {
  loadState, saveState, defaultState, offlineSummary, applyOffline, tryEnhance,
  tryUpgradeSkill, validateExchange, commitExchange, exchangeStatus,
} from './src/state.js';
import { Battle } from './src/combat.js';
import { CLOUD } from './src/firebase.js';
import { normalizeProperty, computeBuffs, dividendReward, EMPTY_PROP } from './src/property.js';
import { Renderer } from './src/render.js';
import { UI } from './src/ui.js';

const STORAGE = (() => {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
})();

class App {
  constructor() {
    this.s = loadState(STORAGE);
    this.prop = { ...EMPTY_PROP };
    this.buffs = computeBuffs(this.prop);
    this.cloud = CLOUD;
    this.battle = new Battle(this.s, () => this.buffs);
    this.renderer = new Renderer(document.getElementById('battle'));
    this.renderer.setBattle(this.battle);
    this.renderer.effects = this.s.effects !== false;
    this.ui = new UI(this);
    this.actions = this.makeActions();
    this.lastTs = 0;
    this.lastSave = 0;
    this.lastCloud = 0;
    this.lastRank = 0;
    this.startedAt = Date.now();
    this.offlineChecked = new Date(this.s.lastActiveAt).toDateString();
    this.hiddenAt = 0;
  }

  async boot() {
    this.ui.init();
    this.renderer
      .preload(['warrior', ...this.stageMonsterNames(this.s.stage), stageDef(this.s.stage).boss])
      .then(() => this.renderer.resize());

    this.ui.setSync({ kind: 'guest', label: '로컬 저장', detail: '부동산 연동 전' });
    this.cloud.onStatus((info) => this.ui.setSync(info));

    // 오프라인 정산 (최대 12시간)
    const summary = offlineSummary(this.s, Date.now(), this.buffs);
    if (summary.sec >= 60 && (summary.gold || summary.exp || summary.shards)) {
      const ups = applyOffline(this.s, summary);
      this.save(true);
      setTimeout(() => this.showOfflinePopup(summary, ups), 450);
    }

    this.ui.render();
    // PWA 바로가기(?tab=land) 지원
    try {
      const tabParam = new URLSearchParams((typeof location !== 'undefined' && location.search) || '').get('tab');
      if (tabParam && ['hunt', 'gear', 'land', 'more'].includes(tabParam)) this.ui.setTab(tabParam);
    } catch (e) { /* ignore */ }
    this.ui.refreshLive(Date.now());
    requestAnimationFrame((ts) => this.loop(ts));
    setTimeout(() => this.ui.hideBoot(), 220);

    this.bindLifecycle();
    this.registerSW();

    // Firebase 는 첫 프레임 뒤에 지연 초기화 (초기 로딩 속도 보호)
    setTimeout(() => this.initCloud(), 1400);
  }

  stageMonsterNames(stage) {
    const d = stageDef(stage);
    return [...d.normals, d.boss];
  }

  /* ───────────── 메인 루프 ───────────── */
  loop(ts) {
    const now = Date.now();
    const dt = this.lastTs ? Math.min(200, ts - this.lastTs) : 16;
    this.lastTs = ts;

    this.battle.tick(dt, now);
    const events = this.battle.drainEvents();
    if (events.length) {
      this.renderer.onEvents(events);
      this.handleEvents(events, now);
    }
    this.renderer.frame(ts);
    this.ui.refreshLive(now);

    // 자동 저장 / 클라우드 동기화
    this.s.records.playMs = (this.s.records.playMs || 0) + dt;
    if (now - this.lastSave > 8000) {
      this.lastSave = now;
      this.save();
    }
    if (now - this.lastCloud > 45000 && this.cloud.signedIn) {
      this.lastCloud = now;
      this.pushCloud(true);
    }
    if (now - this.lastRank > 120000 && this.cloud.signedIn && this.s.maxStage > 1) {
      this.lastRank = now;
      this.cloud.publishRanking(this.s).catch(() => {});
    }

    requestAnimationFrame((t) => this.loop(t));
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
        this.ui.render();
      } else if (ev.t === 'stageClear') {
        this.ui.toast(`🏅 스테이지 ${ev.stage} 클리어! 💎+${ev.bonus}`, 'gold');
        this.ui.addLog(`<b>스테이지 ${ev.stage} 클리어</b> → ${ev.next} (보너스 💎${ev.bonus})`);
        this.ui.render();
        this.save(true);
        this.renderer.preload(this.stageMonsterNames(this.s.stage)).catch(() => {});
        if (this.cloud.signedIn) this.cloud.publishRanking(this.s).catch(() => {});
      } else if (ev.t === 'bossStart') {
        this.ui.addLog(`⚔️ <b>${ev.ko}</b> 등장 — ${ECON.bossTimeLimitMs / 1000}초 제한`);
      } else if (ev.t === 'bossFail') {
        const why = ev.why === 'timeout' ? '시간 초과' : '전투 불능';
        this.ui.toast(`보스 퇴치 실패 (${why}) · 조금 더 강해져서 재도전`, 'red');
        this.ui.addLog(`보스 <b>${ev.ko}</b> 실패(${why}) · ${ECON.bossRetryKills}마리 더 처치하면 재도전`);
        this.ui.render();
      } else if (ev.t === 'playerDeath') {
        this.ui.addLog('💀 전투 불능 — 3초 후 부활');
      } else if (ev.t === 'revive') {
        this.ui.addLog('✨ 부활했습니다');
      }
    }
  }

  save(immediate = false) {
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
        this.save(true);
        if (this.cloud.signedIn) this.pushCloud(true).catch(() => {});
      } else {
        const away = Date.now() - (this.hiddenAt || Date.now());
        if (away > 120000) {
          // 백그라운드에 있던 시간도 방치 보상으로 정산
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
    window.addEventListener('beforeunload', () => {
      this.save(true);
      if (this.cloud.signedIn && this.cloud.writable) this.cloud.saveRpg(this.cloudPayload());
    });
    window.addEventListener('online', () => {
      if (this.cloud.status === 'offline') this.initCloud();
    });
    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => this.renderer.resize(), 120);
    });
  }

  registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ───────────── Firebase ───────────── */
  async initCloud() {
    try {
      await this.cloud.init();
      await this.afterCloudChange();
    } catch (e) {
      this.ui.setSync({ kind: 'error', label: '연동 오류', detail: String(e && e.message) });
    }
  }

  async afterCloudChange() {
    this.syncProperty();
    this.ui.render();
    if (this.cloud.signedIn) {
      this.s.uid = this.cloud.uid;
      if (!this.s.nickname) this.s.nickname = this.prop.nickname || this.cloud.nickname || '';
      const cloudSave = this.cloud.lastRpg;
      if (cloudSave && cloudSave.savedAt && cloudSave.savedAt > (this.s.lastActiveAt || 0) - 500 && (cloudSave.stage || cloudSave.level)) {
        this.offerCloudLoad(cloudSave);
      }
      this.save(true);
    }
  }

  syncProperty() {
    const raw = this.cloud.prop;
    const pending = raw ? raw._pendingIncome || 0 : 0;
    this.prop = raw ? normalizeProperty(raw, pending) : { ...EMPTY_PROP };
    this.buffs = computeBuffs(this.prop);
    this.battle.refreshStats();
    this.ui.render();
  }

  offerCloudLoad(cloudSave) {
    if (this._offeredCloud) return;
    this._offeredCloud = true;
    const diff = (cloudSave.stage || 1) - this.s.stage;
    if (Math.abs(diff) < 1 && (cloudSave.level || 1) <= this.s.level) return; // 비슷하면 굳이 묻지 않음
    this.ui.modal({
      title: '☁️ 클라우드 저장 발견',
      sub: `rpg/${this.cloud.uid} 에 저장된 기록이 있습니다.`,
      body: `<div class="kv"><span class="k">클라우드</span><span class="v">S${cloudSave.stage} · Lv.${cloudSave.level}</span></div>
             <div class="kv"><span class="k">이 기기</span><span class="v">S${this.s.stage} · Lv.${this.s.level}</span></div>
             <div class="note" style="margin-top:10px">불러오면 이 기기의 진행도가 클라우드 기록으로 바뀝니다.</div>`,
      actions: [
        { label: '나중에', onClick: () => {} },
        { label: '불러오기', style: 'primary', onClick: () => this.applyCloudSave(cloudSave) },
      ],
    });
  }

  applyCloudSave(cloud) {
    const keepUid = this.cloud.uid;
    const fresh = loadState({
      getItem: () => JSON.stringify(cloud),
      setItem: () => {},
    });
    fresh.uid = keepUid;
    fresh.lastActiveAt = Date.now();
    this.s = fresh;
    this.battle = new Battle(this.s, () => this.buffs || {});
    this.renderer.setBattle(this.battle);
    this.ui.app.s = this.s;
    this.ui.app.battle = this.battle;
    this.save(true);
    this.ui.toast('☁️ 클라우드 기록을 불러왔습니다', 'green');
    this.ui.render();
  }

  cloudPayload() {
    const s = this.s;
    return {
      version: APP_VERSION,
      savedAt: Date.now(),
      nickname: this.prop.nickname || this.cloud.nickname || s.nickname || '',
      level: s.level, exp: s.exp, gold: s.gold, shards: s.shards,
      equip: s.equip, skills: s.skills, stage: s.stage, killsInStage: s.killsInStage,
      totalKills: s.totalKills, bossKills: s.bossKills, maxStage: s.maxStage,
      autoBoss: s.autoBoss, exchange: s.exchange, claim: s.claim, records: s.records,
      createdAt: s.createdAt,
    };
  }

  async pushCloud(silent = false) {
    if (!this.cloud.signedIn) {
      if (!silent) this.ui.toast('로그인하면 클라우드에 저장할 수 있습니다', 'red');
      return false;
    }
    const r = await this.cloud.saveRpg(this.cloudPayload());
    if (!silent) {
      if (r.ok) this.ui.toast('☁️ 클라우드 저장 완료', 'green');
      else this.ui.toast('rpg 쓰기 규칙이 없어 로컬에 저장했습니다 (database.rules.json 참고)', 'red');
    }
    return r.ok;
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
      signIn: async () => {
        this.ui.toast('구글 로그인 창을 여는 중…');
        const r = await this.cloud.signIn();
        if (!r.ok) {
          this.ui.toast('로그인에 실패했습니다. 팝업 차단을 확인해 주세요.', 'red');
          return;
        }
        if (r.redirect) return;
        await this.afterCloudChange();
        this.ui.toast(`🏢 ${this.prop.nickname || '부동산'} 계정 연동 완료`, 'gold');
      },
      signOut: async () => {
        await this.cloud.signOut();
        this.prop = { ...EMPTY_PROP };
        this.buffs = computeBuffs(this.prop);
        this.battle.refreshStats();
        this.ui.render();
        this.ui.toast('로그아웃했습니다 (로컬 저장으로 계속)');
      },
      refreshCloud: async () => {
        if (!this.cloud.signedIn) {
          this.ui.toast('먼저 구글 로그인이 필요합니다');
          return;
        }
        await this.cloud.refreshProperty();
        await this.cloud.loadRankings().catch(() => {});
        this.syncProperty();
        this.ui.toast('부동산 정보를 새로고침했습니다', 'green');
      },
      claimDividend: () => {
        if (!this.prop.connected) {
          this.ui.toast('부동산 데이터가 없습니다', 'red');
          return;
        }
        if (this.prop.pendingIncome < this.s.claim.dividendWatermark) {
          this.s.claim.dividendWatermark = this.prop.pendingIncome;
          this.save();
        }
        const div = dividendReward(this.prop.pendingIncome, this.s.claim.dividendWatermark);
        if (div.shards <= 0) {
          this.ui.toast('새로 늘어난 배당이 없습니다');
          return;
        }
        this.ui.modal({
          title: '🎁 배당 → 강화석',
          sub: `미수령 배당 ₩${div.pending.toLocaleString()} 중 늘어난 ₩${div.delta.toLocaleString()}을(를) 강화석으로 환산합니다.`,
          body: `<div class="modal-rewards">
                   <div class="rw"><div class="e">💎</div><div class="v">${div.shards}</div><div class="k">강화석</div></div>
                   <div class="rw"><div class="e">🏢</div><div class="v">${this.prop.buildings}</div><div class="k">보유 지역</div></div>
                   <div class="rw"><div class="e">📐</div><div class="v">${this.prop.totalPyeong.toLocaleString()}</div><div class="k">보유 평수</div></div>
                 </div>
                 <div class="note">원본 배당은 부동산 앱에서 그대로 수령할 수 있습니다. 여기서는 읽기만 합니다.</div>`,
          actions: [
            { label: '취소', onClick: () => {} },
            {
              label: '수령',
              style: 'primary',
              onClick: () => {
                this.s.shards += div.shards;
                this.s.claim.dividendWatermark = div.pending;
                this.save(true);
                this.ui.toast(`💎 강화석 ${div.shards}개 수령`, 'gold');
                this.ui.render();
              },
            },
          ],
        });
      },
      maxExchangeGold: () => {
        const st = exchangeStatus(this.s);
        return Math.max(0, Math.min(this.s.gold, Math.floor(st.remain / st.rate)));
      },
      exchange: (gold) => {
        if (!this.cloud.signedIn) {
          this.ui.toast('부동산 환전은 구글 로그인 후 사용할 수 있습니다', 'red');
          return;
        }
        const v = validateExchange(this.s, gold);
        if (!v.ok) {
          this.ui.toast(v.reason, 'red');
          return;
        }
        this.ui.modal({
          title: '💱 골드 환전',
          sub: '부동산 계정의 현금으로 실제 반영됩니다.',
          body: `<div class="kv"><span class="k">소모 골드</span><span class="v">💰 ${v.gold.toLocaleString()}</span></div>
                 <div class="kv"><span class="k">받을 현금</span><span class="v gold">₩${v.cash.toLocaleString()}</span></div>
                 <div class="kv"><span class="k">오늘 사용/한도</span><span class="v">₩${v.status.used.toLocaleString()} / ₩${v.status.cap.toLocaleString()}</span></div>`,
          actions: [
            { label: '취소', onClick: () => {} },
            { label: '환전', style: 'primary', onClick: () => this.doExchange(v.gold, v.cash) },
          ],
        });
      },
      pushCloud: () => this.pushCloud(false),
      pullCloud: async () => {
        if (!this.cloud.signedIn) return;
        const cloud = await this.cloud.loadRpg();
        if (!cloud) {
          this.ui.toast('클라우드에 저장된 기록이 없습니다');
          return;
        }
        this.ui.modal({
          title: '☁️ 클라우드 불러오기',
          sub: `S${cloud.stage || 1} · Lv.${cloud.level || 1} 기록으로 덮어씁니다.`,
          actions: [
            { label: '취소', onClick: () => {} },
            { label: '불러오기', style: 'primary', onClick: () => this.applyCloudSave(cloud) },
          ],
        });
      },
      resetGame: () => {
        this.ui.modal({
          title: '⚠️ 게임 초기화',
          sub: '이 기기의 진행도가 모두 사라집니다. 되돌릴 수 없습니다.',
          actions: [
            { label: '취소', onClick: () => {} },
            {
              label: '초기화',
              style: 'primary',
              onClick: () => {
                try { STORAGE && STORAGE.removeItem('land_rpg_state_v1'); } catch (e) { /* ignore */ }
                location.reload();
              },
            },
          ],
        });
      },
    };
  }

  async doExchange(gold, cash) {
    if (this._exchanging) return;
    this._exchanging = true;
    const beforeCash = Number(this.prop.cash) || 0;
    let ok = false;
    try {
      const r = await this.cloud.addCash(cash);
      ok = r.ok;
      if (!ok) {
        // 응답이 유실됐을 수 있으니 실제 현금을 다시 읽어 확인한다(중복 환전 방지)
        await this.cloud.refreshProperty();
        const after = Number(this.cloud.prop && this.cloud.prop.cash) || 0;
        ok = after >= beforeCash + cash;
      }
    } finally {
      this._exchanging = false;
    }
    if (!ok) {
      this.ui.toast('보안 규칙으로 현금 반영에 실패했습니다. database.rules.json 반영 후 다시 시도해 주세요.', 'red');
      this.ui.render();
      return;
    }
    commitExchange(this.s, gold);
    this.save(true);
    if (this.cloud.prop) this.cloud.prop.cash = r.cash == null ? (this.cloud.prop.cash || 0) : r.cash;
    this.syncProperty();
    this.ui.toast(`💱 ₩${cash.toLocaleString()} 환전 완료 (골드 -${gold.toLocaleString()})`, 'gold');
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
