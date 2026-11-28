// land-rpg / src/render.js
// 상단 Canvas 자동사냥 뷰 렌더러. 전투 로직은 combat.js, 여기서는 그리기만 한다.
// v2: 새 스프라이트(대기/공격/스킬 3프레임) + 검기 아크·타격 스파크·스킬 이펙트.
//     배경은 오프스크린 캔버스에 한 번만 그려 매 프레임 비용을 줄인다(모바일 발열/멈춤 방지).
import { ECON, THEMES, spriteSrc, bgSrc, RARITIES, RARITY_INDEX, monsterMotion, monsterAttack } from './data.js';
import { equippedItem, isMythicSlot, gearSetStatus } from './gear.js';
import { petStageInfo, jobOf, isUpperJob } from './meta.js';
import { TOWER_GIMMICKS, towerGimmicks } from './tower.js';
import { DAILY, dailyDpsCap, dailyGradeAt } from './daily.js';

const rnd = (seed) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) * (1 - clamp(t, 0, 1));
const FONT = 'system-ui, -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

/** v8.14.0 장비 테마 세트 5종 전용 리본 검기 · 타격 파티클 팔레트 */
const SET_FX_THEMES = {
  dragon:   { glow: '#ff4d1a', mid: '#ff9a3d', core: '#fff2c2', spark: '#ff6a2a', kind: 'flame' },
  abyss:    { glow: '#7b2cbf', mid: '#c084fc', core: '#f3e8ff', spark: '#d946ef', kind: 'void' },
  guardian: { glow: '#38bdf8', mid: '#9be7ff', core: '#f0f9ff', spark: '#7cc4ff', kind: 'crystal' },
  storm:    { glow: '#f59e0b', mid: '#7ff6ff', core: '#fffbe6', spark: '#ffe36a', kind: 'bolt' },
  fortune:  { glow: '#10b981', mid: '#ffd76a', core: '#ecfdf5', spark: '#5ee1a3', kind: 'star' },
};

/** v7.5.0 전투 데미지 숫자 축약 (12500 → 12.5K, 1500000 → 1.5M, 2300000000 → 2.3B) */
function fmtDmg(val) {
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '0';
    const sign = val < 0 ? '-' : '';
    const n = Math.round(Math.abs(val));
    if (n >= 1e9) return sign + (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (n >= 1e6) return sign + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (n >= 1e3) return sign + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return sign + String(n);
  }
  const s = String(val ?? '');
  const m = /^([+-]?)(\d+(?:\.\d+)?)$/.exec(s.trim());
  if (!m) return s;
  const n = Math.round(Number(m[2]));
  if (!Number.isFinite(n)) return s;
  if (n >= 1e9) return m[1] + (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (n >= 1e6) return m[1] + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e3) return m[1] + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return m[1] + String(n);
}

/** #rrggbb → rgba() */
function hexA(hex, a) {
  const h = String(hex || '#ffffff').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}

/** 둥근 사각형 경로(구형 브라우저 호환: arcTo 사용) */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.battle = null;
    this.theme = THEMES[0];
    this.dpr = 1;
    this.W = 0;
    this.H = 0;
    this.images = new Map(); // name -> Image | null
    this.white = new Map(); // name -> 흰 실루엣 canvas (피격 플래시용)
    this.floaters = [];
    this.sparks = [];
    this.rings = [];
    this.arcs = []; // 검기 아크 (월드 단위 x, 시작시각)
    this.fx = []; // 스킬 이펙트
    this.embers = [];
    this.drops = []; // 몬스터 사망 시 튀어오르는 금화/보석 (자석 드롭)
    // v3.7 몬스터 모션 — 투사체·먼지·지연 피해·보스 포효
    this.projectiles = []; // 몬스터 원거리 공격 투사체(화염구·깃털·암흑·신성·산성)
    this.puffs = []; // 발걸음/착지/사망 먼지·연기(화면 좌표)
    this.delayedHits = []; // 투사체가 도착할 때 표시할 피해 숫자/플래시
    this.bossRoar = null; // 보스 등장 포효 연출
    this.bossAlert = 0; // BOSS 등장 경고 시작 시각
    this.promote = 0; // ✨ 전직 팡파르 시작 시각
    this.promoteName = '';
    this.promoteBadge = '✨';
    this.promoteColor = '#ffd76a';
    this.petX = null; // 펫 화면 x(부드럽게 따라온다)
    this.petSkillFx = []; // v4.2 펫 고유 스킬 이펙트
    this.petEvolve = 0; // v4.2 진화 연출 시작 시각
    this.towerBanner = 0; // v4.2 도전의 탑 입장 배너
    this.onLoot = null; // (kind) => void  · 코인/보석이 캐릭터에 빨려 들어올 때
    this._rar = { weapon: 0, avg: 0, hasLegend: false };
    // v4.4 전직(칭호) 오라 — 장비 등급 오라와 별개로 단계별 문양·빛기둥·후광을 그린다
    this._job = { tier: 0, color: '#8ea2bb', badge: '', name: '', upper: false };
    this._jobTier = -1;
    this.shake = 0;
    this.shakeOn = true; // v4.3 설정 '화면 흔들림' — 끄면 흔들림만 멈춘다
    this.dmgNumbersOn = true; // v7.5.0 설정 '데미지 숫자 표시' — 끄면 전투 피해 숫자만 숨긴다
    this.dmgStyle = 'simple'; // v8.1.0 기본 '간단' — K/M 축약 + 밀도 조절로 캐릭터가 가려지지 않게
    this.impacts = []; // v4.3 타격 임팩트 플래시(별 모양)·보스/치명타 강조
    this.flash = 0; // 흰색 화면 플래시
    this.redFlash = 0; // 피격 붉은 플래시
    this.ambient = [];
    this.bgSeed = 1;
    this.time = 0;
    this.lastFrame = 0;
    this.renderScale = 1;
    this.effects = true;
    this.bg = null;
    this.bgKey = '';
    // v4.1 테마 배경 일러스트 (assets/bg/<id>.webp)
    this.bgImages = new Map(); // id -> Image (로딩 완료분만)
    this.bgRequested = Object.create(null); // 중복 요청 방지
    this.bgPhoto = null; // 테마 사진을 합성한 오프스크린 캔버스
    this.bgPhotoKey = '';
    this.bgFade = 1; // 사진 레이어 페이드인 (0→1)
    this.scrollX = 0; // v7.2.0 패럴랙스 지면/안개 스크롤 오프셋
    this.marchUntil = 0; // v7.2.0 스테이지 돌파 행군 연출 종료 시각
    this.hitstopUntil = 0; // v7.3.0 치명타/강격 시각 히트스톱
    this.afterimages = []; // v7.3.0 스킬 잔상
    this.knightShots = []; // v7.3.0 영지 기사단 캔버스 지원 사격
    this.lastKnightShot = 0;
    this.bossKillFx = null; // v7.3.0 보스 격파 폭발 연출
    this.lightnings = []; // v7.4.0 번개 연쇄/강격 지그재그 전기선
    this.tapBolts = []; // v7.7.0 캔버스 탭 번개 일격
    this.killShards = []; // v7.4.0 몬스터 처치 파편 분산 연출
    this.heroVisX = null; // v8.7.0 영웅 자유 이동 시각 X (스프링 보간)
    this.heroVisY = 0; // v8.7.0 영웅 레인 추적/회피 시각 Y 오프셋
    this.heroVx = 0; // v8.12.0 영웅 실제 이동 속도 X (관성 기울기·추격 달리기 연동)
    this.heroVy = 0; // v8.12.0 영웅 실제 이동 속도 Y
    this._heroFrame = 'hero_idle'; // v8.12.0 포즈 크로스페이드(75ms 모션 블러 전환)
    this._prevHeroFrame = null;
    this._heroFrameAt = 0;
    this._runDustAt = 0;
    this.swordTrail = []; // v8.12.0 연속 리본 검기 궤적 포인트
    this._heroMotionSeq = -1; // v8.7.0 콤보 착지 먼지·돌진 잔상 1회 트리거 추적
    this.resize();
    this.initAmbient();
  }

  setBattle(battle) {
    this.battle = battle;
    this.syncTheme();
  }

  syncTheme() {
    if (!this.battle) return;
    const t = this.battle.def && this.battle.def.theme;
    if (t && (!this.theme || t.id !== this.theme.id)) {
      this.theme = t;
      this.bgSeed = Math.max(1, THEMES.indexOf(t) + 1);
      this.initAmbient();
      this.bgKey = '';
      this.bgPhotoKey = '';
    } else if (t) {
      this.theme = t;
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.dpr = dpr;
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    if (this._lastW && this._lastW !== w) {
      const k = w / this._lastW;
      this.ambient = this.ambient.map((p) => ({ ...p, x: p.x * k }));
    }
    this._lastW = w;
    this.bgKey = '';
    this.bgPhotoKey = '';
  }

  /* ─────────── v4.1 테마 배경 이미지 ─────────── */
  /** 테마 배경 1장을 요청(비동기). 로드되면 다음 프레임에 사진 레이어를 다시 만든다. */
  loadThemeBg(id) {
    if (!id || this.bgImages.has(id) || this.bgRequested[id]) return;
    this.bgRequested[id] = true;
    try {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.bgImages.set(id, img);
        if (this.theme && this.theme.id === id) {
          this.bgKey = '';
          this.bgPhotoKey = '';
          this.bgFade = 0;
        }
      };
      img.onerror = () => { this.bgRequested[id] = false; }; // 다음 기회에 재시도
      img.src = bgSrc(id);
    } catch (e) {
      this.bgRequested[id] = false;
    }
  }

  /** 현재 테마는 바로, 나머지는 한가할 때 미리 받아 둔다(테마 전환 시 깜빡임 방지) */
  preloadBackgrounds() {
    if (!this.theme) return;
    this.loadThemeBg(this.theme.id);
    const rest = THEMES.map((t) => t.id).filter((id) => id !== this.theme.id);
    const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 900));
    idle(() => rest.forEach((id) => this.loadThemeBg(id)));
  }

  initAmbient() {
    const n = 26;
    const lists = {
      ice: { color: 'rgba(200,240,255,0.55)', size: [1, 2.4], vy: [12, 34], vx: [-8, 8] },
      volcano: { color: 'rgba(255,140,80,0.6)', size: [1, 3], vy: [-42, -16], vx: [-6, 6] },
      desert: { color: 'rgba(255,220,160,0.4)', size: [1, 2], vy: [6, 18], vx: [10, 26] },
      abyss: { color: 'rgba(200,140,255,0.5)', size: [1, 3], vy: [-16, -4], vx: [-10, 10] },
      cave: { color: 'rgba(140,190,255,0.45)', size: [1, 2.2], vy: [-14, -4], vx: [-6, 6] },
      ruins: { color: 'rgba(200,180,230,0.4)', size: [1, 2.4], vy: [-10, -2], vx: [-12, 4] },
      forest: { color: 'rgba(150,240,180,0.45)', size: [1, 2.4], vy: [-8, -2], vx: [-6, 10] },
      meadow: { color: 'rgba(190,255,210,0.45)', size: [1, 2.2], vy: [-6, 4], vx: [-8, 8] },
    };
    const cfg = lists[(this.theme && this.theme.id) || 'meadow'] || lists.meadow;
    this.ambient = Array.from({ length: n }, (_, i) => ({
      x: rnd(i + this.bgSeed) * 420,
      y: rnd(i * 3 + this.bgSeed) * 240,
      s: cfg.size[0] + rnd(i * 7) * (cfg.size[1] - cfg.size[0]),
      vy: cfg.vy[0] + rnd(i * 5) * (cfg.vy[1] - cfg.vy[0]),
      vx: cfg.vx[0] + rnd(i * 11) * (cfg.vx[1] - cfg.vx[0]),
      a: 0.3 + rnd(i * 13) * 0.6,
    }));
    this.ambientCfg = cfg;
  }

  /** 필요한 스프라이트를 미리 로드 */
  preload(names) {
    const uniq = [...new Set(names)];
    return Promise.all(
      uniq.map(
        (n) =>
          new Promise((resolve) => {
            const loaded = this.images.get(n);
            if (loaded) return resolve();
            const img = new Image();
            img.onload = () => {
              this.images.set(n, img);
              this.white.delete(n);
              resolve();
            };
            img.onerror = () => {
              this.images.set(n, null);
              resolve();
            };
            img.src = spriteSrc(n);
          }),
      ),
    );
  }

  image(name) {
    if (this.images.has(name)) return this.images.get(name);
    const img = new Image();
    img.onload = () => {
      this.images.set(name, img);
      this.white.delete(name);
    };
    img.onerror = () => this.images.set(name, null);
    img.src = spriteSrc(name);
    this.images.set(name, null);
    return null;
  }

  /** 피격 플래시용 흰 실루엣(캔버스). 실패하면 null → 일반 드로우로 폴백. */
  whiteOf(name, img) {
    if (!img) return null;
    if (this.white.has(name)) return this.white.get(name);
    let cv = null;
    try {
      const w = Math.max(1, Math.min(512, img.naturalWidth || img.width || 128));
      const h = Math.max(1, Math.min(512, img.naturalHeight || img.height || 128));
      cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const c = cv.getContext('2d');
      c.drawImage(img, 0, 0, w, h);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
    } catch (e) {
      cv = null;
    }
    this.white.set(name, cv);
    return cv;
  }

  /* ─────────── 이벤트 → 시각효과 ─────────── */
  onEvents(events, now = Date.now()) {
    for (const ev of events) {
      if (ev.t === 'hit') {
        const bossHit = !!ev.isBoss;
        // v7.0.0 콤보 히트 카운터(2.4초 내 연속 타격 집계)
        this.combo = (this.comboAt && now - this.comboAt < 2400) ? (this.combo || 0) + 1 : 1;
        this.comboAt = now;
        this.addFloater(ev.x, ev.dmg, ev.crit, ev.kind, null, bossHit ? 1.28 : 1, now);
        const stFx = this._rar && this._rar.setFx;
        const burstCol = stFx ? (ev.crit ? stFx.core : stFx.spark) : (ev.crit ? '#ffd76a' : '#fff1cf');
        this.burst(ev.x, burstCol, ev.crit ? 18 : 8, ev.isBoss);
        if (stFx && this.effects) {
          if (stFx.kind === 'bolt' && ev.crit) this.spawnLightning(ECON.playerX + 60, ev.x, stFx.mid, now);
          else if (stFx.kind === 'void' && ev.crit) this.rings.push({ x: ev.x, life: 1, r: 10, color: stFx.mid, wide: 1.5 });
          else if (this.embers.length < 150) {
            for (let k = 0; k < (ev.crit ? 4 : 2); k++) {
              this.embers.push({
                x: ev.x + (Math.random() - 0.5) * 26,
                y: this.groundY() - 32 * this.scale() + (Math.random() - 0.5) * 22 * this.scale(),
                vy: -42 - Math.random() * 52,
                life: 1,
                s: 1.8 + Math.random() * 2.2,
                color: k % 2 === 0 ? stFx.spark : stFx.mid,
              });
            }
          }
        }
        if (ev.crit) {
          this.burst(ev.x, '#ff6a4d', 7, false);
          this.rings.push({ x: ev.x, life: 1, r: 12, color: '#ffd76a', wide: 1.8 });
          this.addImpact(ev.x, { crit: true, boss: bossHit, color: '#ffe08a' }, now);
          this.shake = Math.max(this.shake, bossHit ? 7 : 5.4);
          this.flash = Math.max(this.flash, 0.2);
          this.hitstopUntil = Math.max(this.hitstopUntil || 0, now + 34);
        } else {
          this.addImpact(ev.x, { crit: false, boss: bossHit, color: bossHit ? '#ffcf6a' : '#fff1cf' }, now);
          this.shake = Math.max(this.shake, bossHit ? 2.2 : 1.2);
        }
        if (ev.kind === 'strike' || ev.kind === 'whirl' || ev.kind === 'ultimate') {
          this.spawnAfterimages(ev.kind, now);
        }
        if (ev.kind === 'strike') {
          this.fx.push({ key: 'strikeHit', x: ev.x, t0: now, dur: 380 });
          this.addImpact(ev.x, { crit: false, boss: bossHit, color: '#ffd166' }, now);
          this.flash = Math.max(this.flash, 0.18);
        }
        if (ev.kind === 'whirl') {
          this.rings.push({ x: ev.x, life: 1, r: 10, color: '#8fe4ff', wide: 1.2 });
        }
        // v7.4.0 번개 연쇄 / 번개 강격 지그재그 전기선
        if (ev.kind === 'chain' || (ev.kind === 'strike' && this.battle && this.battle.s && this.battle.s.skills && this.battle.s.skills.strike && this.battle.s.skills.strike.rune === 'lightning')) {
          this.spawnLightning(ev.kind === 'chain' ? (this._lastHitX || ECON.playerX + 120) : ECON.playerX + 40, ev.x, ev.kind === 'chain' ? '#c59bff' : '#7fd3ff', now);
        }
        this._lastHitX = ev.x;
      } else if (ev.t === 'monsterDeath') {
        this.spawnKillShards(ev.x, ev.isBoss ? '#ffd76a' : '#cde9ff', ev.isBoss ? 14 : 7, now);
      } else if (ev.t === 'tapStrike') {
        this.spawnTapBolt(ev.x, now);
        this.rings.push({ x: ev.x, life: 1, r: 10, color: '#7ff6ff', wide: 1.4 });
        this.shake = Math.max(this.shake, 2.4);
      } else if (ev.t === 'tapCounter') {
        // v8.10.0 ⚡ 보스 강공격 퍼펙트 반격 카운터 연출
        this.spawnTapBolt(ev.x, now);
        this.spawnTapBolt(ev.x - 18, now);
        this.spawnLightning(ECON.playerX + 40, ev.x, '#ffe066', now);
        this.rings.push({ x: ev.x, life: 1, r: 22, color: '#ffd76a', wide: 2.2 });
        this.rings.push({ x: ECON.playerX, life: 1, r: 18, color: '#7ff6ff', wide: 1.6 });
        this.addFloater(ev.x, '⚡ COUNTER!', true, 'skill', '#ffe066', 1.25, now);
        this.flash = Math.max(this.flash, 0.24);
        this.shake = Math.max(this.shake, 7.2);
        this.hitstopUntil = Math.max(this.hitstopUntil || 0, now + 48);
      } else if (ev.t === 'bossEnrage') {
        // v8.10.0 🔥 보스 HP 50% 광폭화 페이즈 돌입 연출
        this.rings.push({ x: ev.x, life: 1, r: 32, color: '#ff3b2f', wide: 2.4 });
        this.rings.push({ x: ev.x, life: 1, r: 18, color: '#ffb347', wide: 1.6 });
        this.addFloater(ev.x, '🔥 광폭화!', true, 'skill', '#ff6b57', 1.32, now);
        this.flash = Math.max(this.flash, 0.22);
        this.shake = Math.max(this.shake, 6.8);
      } else if (ev.t === 'bossBreak') {
        // v8.16.0 🛡️ 보스 브레이크(그로기) 파괴 연출
        this.rings.push({ x: ev.x, life: 1, r: 36, color: '#7ff6ff', wide: 2.8 });
        this.rings.push({ x: ev.x, life: 1, r: 22, color: '#ffe066', wide: 2.0 });
        this.addFloater(ev.x, '💥 BREAK! 피해 ×1.5', true, 'skill', '#7ff6ff', 1.36, now);
        this.flash = Math.max(this.flash, 0.28);
        this.shake = Math.max(this.shake, 8.2);
        this.hitstopUntil = Math.max(this.hitstopUntil || 0, now + 54);
      } else if (ev.t === 'ultEcho') {
        // v8.16.0 🌌 용신의 자리 궁극기 잔향 폭발 연출
        for (const ex of (ev.xs || [ECON.playerX + 260])) {
          this.rings.push({ x: ex, life: 1, r: 28, color: ev.color || '#c084fc', wide: 2.4 });
        }
        this.addFloater(ECON.playerX + 120, '🌌 용신 잔향!', true, 'skill', ev.color || '#c084fc', 1.24, now);
        this.flash = Math.max(this.flash, 0.2);
        this.shake = Math.max(this.shake, 5.5);
      } else if (ev.t === 'bossRetryRevive') {
        // v8.16.0 🌌 수호의 자리 보스 1회 부활 연출
        this.rings.push({ x: ECON.playerX, life: 1, r: 30, color: '#69c0ff', wide: 2.6 });
        this.addFloater(ECON.playerX, '🛡️ 수호 성좌 부활!', true, 'skill', '#69c0ff', 1.28, now);
        this.flash = Math.max(this.flash, 0.26);
      } else if (ev.t === 'feverStart') {
        this.flash = Math.max(this.flash, 0.26);
        this.shake = Math.max(this.shake, 4.4);
        this.rings.push({ x: ECON.playerX, life: 1, r: 18, color: '#ffd76a', wide: 2.2 });
      } else if (ev.t === 'playerHurt') {
        if (ev.ranged) {
          // 원거리: 투사체가 날아가 명중할 때 숫자·플래시를 보여 준다(약 0.24초 뒤)
          this.delayedHits.push({ at: now + 235, dmg: ev.dmg });
          this.shake = Math.max(this.shake, 1.2);
        } else {
          this.shake = Math.max(this.shake, ev.heavy ? 5.2 : 3.4);
          this.redFlash = Math.max(this.redFlash, 0.4);
          this.addFloater(ECON.playerX, ev.dmg, false, 'hurt', null, 1, now);
        }
      } else if (ev.t === 'monsterWindup') {
        // 공격 전조 — 기 모으기 불티 + (근거리) 바닥 경고 고리
        if (ev.kind === 'ranged') {
          for (let i = 0; i < (ev.heavy ? 14 : 7); i++) {
            const a = Math.random() * Math.PI * 2;
            this.embers.push({
              x: ev.x + Math.cos(a) * 34,
              y: this.groundY() - 46 * this.scale() + Math.sin(a) * 30 * this.scale(),
              vy: -18 - Math.random() * 26,
              life: 1,
              s: 1.2 + Math.random() * 1.8,
              color: ev.color || '#ffd76a',
            });
          }
        } else if (ev.isBoss) {
          this.shake = Math.max(this.shake, 1.4);
        }
      } else if (ev.t === 'monsterAttack') {
        this.monsterStrikeFx(ev, now);
      } else if (ev.t === 'monsterDeath') {
        this.burst(ev.x, ev.isBoss ? '#ffcf6a' : '#d7e2f2', ev.isBoss ? 34 : 16, true);
        if (ev.isBoss) {
          this.shake = 11;
          this.flash = Math.max(this.flash, 0.3);
        }
        if (ev.gold) this.addFloater(ev.x, `+${ev.gold}`, false, 'gold', null, 1, now);
        this.spawnLoot(ev, now);
        this.deathFx(ev, now);
      } else if (ev.t === 'skill') {
        this.fx.push({ key: ev.key, x: ev.x || ECON.playerX, t0: now, dur: ev.key === 'whirl' ? 560 : ev.key === 'strike' ? 420 : 760, color: ev.color });
        if (ev.key === 'whirl') {
          this.rings.push({ x: ECON.playerX, life: 1, r: 26, color: ev.color || '#8fe4ff', wide: 1.4 });
          this.shake = Math.max(this.shake, 3);
          this.flash = Math.max(this.flash, 0.12);
        }
        if (ev.key === 'strike') {
          this.rings.push({ x: ev.x || ECON.playerX, life: 1, r: 12, color: ev.color || '#ffd166', wide: 1 });
          this.shake = Math.max(this.shake, 4);
        }
        if (ev.key === 'heal') {
          this.rings.push({ x: ECON.playerX, life: 1, r: 18, color: ev.color || '#8ff0a4', wide: 1 });
          this.addFloater(ECON.playerX, `+${ev.heal || 0}`, false, 'heal', null, 1, now);
        }
        if (ev.key === 'berserk') {
          this.rings.push({ x: ECON.playerX, life: 1, r: 20, color: ev.color || '#ff7a59', wide: 1.6 });
          this.shake = Math.max(this.shake, 3);
          for (let i = 0; i < 18; i++) {
            this.embers.push({
              x: ECON.playerX + (Math.random() - 0.5) * 70,
              y: this.groundY() - Math.random() * 20,
              vy: -50 - Math.random() * 70,
              life: 1,
              s: 1.5 + Math.random() * 2.5,
            });
          }
        }
        // v8.4.0 신규 스킬 6종 캔버스 시각 연출
        if (ev.key === 'thunder') {
          this.shake = Math.max(this.shake, 3.6);
          this.flash = Math.max(this.flash, 0.14);
          let prev = ECON.playerX + 40;
          for (const tx of ev.xs || [ev.x || 520]) {
            this.spawnLightning(prev, tx, '#7ff6ff', now);
            this.rings.push({ x: tx, life: 1, r: 14, color: '#7ff6ff', wide: 1.3 });
            prev = tx;
          }
        } else if (ev.key === 'meteor') {
          this.shake = Math.max(this.shake, 6.2);
          this.flash = Math.max(this.flash, 0.22);
          for (const tx of (ev.xs && ev.xs.length ? ev.xs.slice(0, 4) : [520])) {
            this.fx.push({ key: 'meteor', x: tx, t0: now, dur: 640, color: '#ff6a3d' });
            this.rings.push({ x: tx, life: 1, r: 22, color: '#ff8a3d', wide: 1.7 });
          }
        } else if (ev.key === 'frostnova') {
          this.shake = Math.max(this.shake, 3.2);
          this.rings.push({ x: ECON.playerX + 120, life: 1, r: 34, color: '#9be7ff', wide: 2.0 });
          this.fx.push({ key: 'frostnova', x: ECON.playerX + 140, t0: now, dur: 680, color: '#9be7ff' });
        } else if (ev.key === 'aegis') {
          this.rings.push({ x: ECON.playerX, life: 1, r: 24, color: '#7cc4ff', wide: 1.6 });
          this.fx.push({ key: 'aegis', x: ECON.playerX, t0: now, dur: 760, color: '#7cc4ff' });
        } else if (ev.key === 'vampstrike') {
          this.shake = Math.max(this.shake, 3.5);
          this.fx.push({ key: 'vampstrike', x: ev.x || ECON.playerX + 260, t0: now, dur: 520, color: '#ff4d6a' });
          this.rings.push({ x: ECON.playerX, life: 1, r: 16, color: '#ff4d6a', wide: 1.2 });
        } else if (ev.key === 'execute') {
          this.shake = Math.max(this.shake, 5.5);
          this.flash = Math.max(this.flash, 0.16);
          this.fx.push({ key: 'execute', x: ev.x || 520, t0: now, dur: 460, color: '#c084fc' });
          this.rings.push({ x: ev.x || 520, life: 1, r: 18, color: '#c084fc', wide: 1.8 });
        }
      } else if (ev.t === 'ultimate') {
        // 🐉 v4.7 상위 전직 궁극기 — 전장을 가로지르는 빛기둥 · 회전 문양 · 적마다 충격 고리
        this.fx.push({ key: 'ultimate', x: ECON.playerX, t0: now, dur: 980, color: ev.color, burst: ev.burst });
        this.rings.push({ x: ECON.playerX, life: 1, r: 46, color: ev.burst || ev.color || '#ffe9a8', wide: 2.4 });
        this.rings.push({ x: ECON.playerX, life: 1, r: 24, color: ev.color || '#ff9a3d', wide: 1.6 });
        this.shake = Math.max(this.shake, 8.5);
        this.flash = Math.max(this.flash, 0.34);
        for (const x of ev.xs || []) {
          this.rings.push({ x, life: 1, r: 16, color: ev.burst || ev.color || '#ffe9a8', wide: 1.5 });
          this.burst(x, ev.color || '#ff9a3d', 9, true);
        }
        this.addFloater(ECON.playerX, `${ev.icon || '🐉'} ${ev.ko || '궁극기'}`, false, 'gold', ev.color || '#ffe9a8', 1.35, now);
      } else if (ev.t === 'lifesteal') {
        // 🩸 흡혈 — 캐릭터 발밑에 붉은 고리 + 회복 숫자
        this.rings.push({ x: ECON.playerX, life: 1, r: 14, color: '#ff6a7a', wide: 0.9 });
        this.addFloater(ECON.playerX, `+${ev.heal || 0}`, false, 'heal', null, 1, now);
      } else if (ev.t === 'gearDrop') {
        // 🎒 장비 드랍 — 등급 색 폭발 + 아이템 이름
        const rar = RARITIES[RARITY_INDEX[ev.rarity] || 0];
        this.burst(ev.x, rar.color, ev.isBoss ? 26 : 12, !!ev.isBoss);
        this.rings.push({ x: ev.x, life: 1, r: 18, color: rar.color, wide: 1.2 });
        this.addFloater(ev.x, ev.name || '장비', false, 'gold', rar.color, 1, now);
      } else if (ev.t === 'petHit') {
        // 동행 펫의 공격 — 펫 색의 작은 참격과 숫자
        this.addFloater(ev.x, ev.dmg, false, 'pet', ev.color, 1, now);
        this.burst(ev.x, ev.color || '#ffd76a', ev.crit ? 10 : 5, false);
        this.arcs.push({
          x: ev.x - 18,
          t0: now,
          dur: 300,
          dx: 0,
          y: 46,
          r: 26,
          a0: -1.0,
          sweep: 1.5,
          color: ev.color || '#ffd76a',
          alpha: 0.9,
          w: 4,
        });
      } else if (ev.t === 'petSkill') {
        // v4.2 펫 고유 스킬 — 종류별 연출
        this.petSkillFx.push({ kind: ev.kind, t0: now, x: ev.x || ECON.playerX, color: ev.color || '#ffd76a', dur: 620 });
        if (ev.kind === 'breath') {
          this.shake = Math.max(this.shake, 5);
          this.flash = Math.max(this.flash, 0.14);
          this.rings.push({ x: ev.x || ECON.playerX, life: 1, r: 24, color: ev.color || '#ff9a3d', wide: 1.6 });
          for (let i = 0; i < 22; i++) {
            this.embers.push({
              x: (ev.x || ECON.playerX) - 40 + Math.random() * 90,
              y: this.groundY() - 40 - Math.random() * 40,
              vy: -40 - Math.random() * 90,
              life: 1,
              s: 1.8 + Math.random() * 2.6,
              color: Math.random() < 0.5 ? '#ff9a3d' : (ev.color || '#ffd76a'),
            });
          }
        } else if (ev.kind === 'gold') {
          this.rings.push({ x: ECON.playerX, life: 1, r: 20, color: '#ffd76a', wide: 1.4 });
          this.addFloater(ECON.playerX, '골드 2배!', false, 'gold', null, 1, now);
          for (let i = 0; i < 16; i++) {
            this.embers.push({
              x: ECON.playerX + (Math.random() - 0.5) * 90,
              y: this.groundY() - Math.random() * 50,
              vy: -70 - Math.random() * 120,
              life: 1,
              s: 1.4 + Math.random() * 2.2,
              color: '#ffe08a',
            });
          }
        } else if (ev.kind === 'splash') {
          this.shake = Math.max(this.shake, 2.5);
          for (let i = 0; i < (ev.hits || 2); i++) {
            this.rings.push({ x: (ev.x || ECON.playerX) + i * 26, life: 1, r: 12 + i * 6, color: ev.color || '#ff9a5c', wide: 1.2 });
          }
        } else if (ev.kind === 'multi') {
          for (let i = 0; i < 3; i++) {
            this.arcs.push({
              x: (ev.x || ECON.playerX) - 16,
              t0: now + i * 70,
              dur: 230,
              dx: 0,
              y: 52,
              r: 30,
              a0: -1.1,
              sweep: 1.6,
              color: ev.color || '#cfe6ff',
              alpha: 0.95,
              w: 5,
            });
          }
        }
        if (ev.dmg) this.addFloater(ev.x || ECON.playerX, ev.dmg, false, 'pet', ev.color, 1, now);
      } else if (ev.t === 'petEvolve') {
        // 🐾 진화 연출 — 금빛 폭발 + 고리 3중 + 배너
        this.petEvolve = now;
        this.petEvolveName = ev.name || '진화';
        this.flash = Math.max(this.flash, 0.4);
        this.shake = Math.max(this.shake, 5);
        for (let i = 0; i < 3; i++) this.rings.push({ x: ECON.playerX, life: 1, r: 14 + i * 14, color: ev.color || '#ffd76a', wide: 1.7 });
        for (let i = 0; i < 30; i++) {
          this.embers.push({
            x: ECON.playerX - 40 + Math.random() * 90,
            y: this.groundY() - Math.random() * 40,
            vy: -110 - Math.random() * 150,
            life: 1,
            s: 1.6 + Math.random() * 2.6,
            color: Math.random() < 0.6 ? '#ffe08a' : (ev.color || '#fff3cf'),
          });
        }
      } else if (ev.t === 'towerStart') {
        // 🗼 탑 입장 — 층 색 플래시 + 위로 솟는 기운
        this.towerBanner = now;
        this.towerBannerName = `${ev.n}층 · ${ev.name}`;
        this.towerBannerGimmicks = (ev.gimmicks || []).slice();
        this.flash = Math.max(this.flash, 0.32);
        this.shake = Math.max(this.shake, 6);
        for (let i = 0; i < 3; i++) this.rings.push({ x: ECON.playerX, life: 1, r: 18 + i * 18, color: '#a8c6ff', wide: 1.6 });
        for (let i = 0; i < 26; i++) {
          this.embers.push({
            x: ECON.playerX + (Math.random() - 0.5) * 200,
            y: this.groundY() - Math.random() * 30,
            vy: -100 - Math.random() * 130,
            life: 1,
            s: 1.5 + Math.random() * 2.6,
            color: Math.random() < 0.5 ? '#cfe0ff' : '#8fb8ff',
          });
        }
      } else if (ev.t === 'towerFrenzy') {
        this.shake = Math.max(this.shake, 4);
        this.redFlash = Math.max(this.redFlash, 0.35);
      } else if (ev.t === 'towerEnd') {
        this.flash = Math.max(this.flash, ev.how === 'clear' ? 0.3 : 0.16);
        this.shake = Math.max(this.shake, ev.how === 'clear' ? 7 : 4);
        if (ev.how === 'clear') {
          for (let i = 0; i < 34; i++) {
            this.sparks.push({
              x: ECON.playerX + (Math.random() - 0.5) * 140,
              y: this.groundY() - 60 * this.scale(),
              life: 1,
              vx: (Math.random() - 0.5) * 280,
              vy: -130 - Math.random() * 170,
              color: Math.random() < 0.5 ? '#ffd76a' : '#cfe6ff',
              s: 2 + Math.random() * 2.4,
            });
          }
        }
      } else if (ev.t === 'dailyStart') {
        this.flash = Math.max(this.flash, 0.34);
        this.shake = Math.max(this.shake, 6);
        for (let i = 0; i < 3; i++) this.rings.push({ x: ECON.playerX, life: 1, r: 18 + i * 18, color: '#ffd76a', wide: 1.7 });
        for (let i = 0; i < 30; i++) {
          this.embers.push({
            x: ECON.playerX + (Math.random() - 0.5) * 220,
            y: this.groundY() - Math.random() * 40,
            vy: -100 - Math.random() * 150,
            life: 1,
            s: 1.5 + Math.random() * 2.6,
            color: Math.random() < 0.5 ? '#ffd76a' : '#ffe9b0',
          });
        }
      } else if (ev.t === 'stageClear') {
        // v7.2.0 스테이지 돌파 행군 전환(1.1초 가속 스크롤 + 바람결) · v7.3.0 보스 격파 폭발
        this.marchUntil = now + 1100;
        this.bossKillFx = { t0: now, dur: 520, x: ECON.playerX + 360 };
        this.flash = Math.max(this.flash, 0.34);
        this.shake = Math.max(this.shake, 9);
        for (let i = 0; i < 32; i++) {
          const a = (Math.PI * 2 * i) / 32;
          this.sparks.push({
            x: ECON.playerX + 340,
            y: this.groundY() - 56 * this.scale(),
            life: 1,
            vx: Math.cos(a) * (120 + Math.random() * 180),
            vy: Math.sin(a) * (110 + Math.random() * 140) - 40,
            color: i % 2 === 0 ? '#ffd76a' : '#ff7a5c',
            s: 2.2 + Math.random() * 2.2,
          });
        }
      } else if (ev.t === 'dailyEnd') {
        this.flash = Math.max(this.flash, 0.28);
        this.shake = Math.max(this.shake, 6);
        for (let i = 0; i < 34; i++) {
          this.sparks.push({
            x: ECON.playerX + (Math.random() - 0.5) * 140,
            y: this.groundY() - 60 * this.scale(),
            life: 1,
            vx: (Math.random() - 0.5) * 280,
            vy: -130 - Math.random() * 170,
            color: Math.random() < 0.5 ? '#ffd76a' : '#fff3cf',
            s: 2 + Math.random() * 2.4,
          });
        }
      } else if (ev.t === 'dungeonStart') {
        this.flash = Math.max(this.flash, 0.34);
        this.shake = Math.max(this.shake, 5);
        for (let i = 0; i < 26; i++) {
          this.embers.push({
            x: ECON.playerX + (Math.random() - 0.5) * 220,
            y: this.groundY() - Math.random() * 40,
            vy: -80 - Math.random() * 120,
            life: 1,
            s: 1.4 + Math.random() * 2.6,
            color: Math.random() < 0.5 ? '#ffd76a' : '#ff9a3d',
          });
        }
      } else if (ev.t === 'dungeonBoss') {
        this.shake = Math.max(this.shake, 5.5);
        this.flash = Math.max(this.flash, 0.16);
      } else if (ev.t === 'dungeonEnd') {
        this.flash = Math.max(this.flash, 0.26);
        this.shake = Math.max(this.shake, 6);
        for (let i = 0; i < 30; i++) {
          this.sparks.push({
            x: ECON.playerX + (Math.random() - 0.5) * 120,
            y: this.groundY() - 60 * this.scale(),
            life: 1,
            vx: (Math.random() - 0.5) * 260,
            vy: -120 - Math.random() * 160,
            color: Math.random() < 0.5 ? '#ffd76a' : '#fff3cf',
            s: 2 + Math.random() * 2.4,
          });
        }
      } else if (ev.t === 'promote') {
        // ✨ 전직 축하 팡파르: 금빛 고리 + 불티 + 화면 플래시 + 배너
        this.promote = now;
        this.promoteName = ev.job || '전직';
        this.promoteBadge = ev.badge || '✨';
        this.promoteColor = ev.color || '#ffd76a';
        this.flash = Math.max(this.flash, 0.42);
        this.shake = Math.max(this.shake, 7);
        for (let i = 0; i < 3; i++) this.rings.push({ x: ECON.playerX, life: 1, r: 16 + i * 16, color: ev.color || '#ffd76a', wide: 1.8 });
        for (let i = 0; i < 34; i++) {
          this.embers.push({
            x: ECON.playerX + (Math.random() - 0.5) * 130,
            y: this.groundY() - Math.random() * 30,
            vy: -110 - Math.random() * 150,
            life: 1,
            s: 1.6 + Math.random() * 2.8,
            color: Math.random() < 0.6 ? '#ffd76a' : ev.color || '#fff3cf',
          });
        }
      } else if (ev.t === 'bossStart') {
        this.shake = ECON.shakeMax;
        this.flash = Math.max(this.flash, 0.2);
        this.redFlash = Math.max(this.redFlash, 0.3); // 보스 등장 — 화면 테두리까지 붉게
        this.bossAlert = now;
        // 위압감 있는 등장: 발밑 충격파 + 지면 먼지 파도
        this.bossRoar = { t0: now, x: Number.isFinite(ev.x) ? ev.x : ECON.spawnX };
        const gyy = this.groundY();
        for (let i = 0; i < 20; i++) {
          this.puffs.push({
            x: this.worldX(Number.isFinite(ev.x) ? ev.x : ECON.spawnX) + (Math.random() - 0.5) * 70 * this.scale(),
            y: gyy - Math.random() * 6,
            r: (4 + Math.random() * 8) * this.scale(),
            vx: (Math.random() - 0.5) * 90,
            vy: -20 - Math.random() * 45,
            life: 1,
            color: 'rgba(255,190,140,0.42)',
          });
        }
        // 겁나는 붉은 기운이 위로 솟는다(보스 자리)
        for (let i = 0; i < 22; i++) {
          this.embers.push({
            x: (Number.isFinite(ev.x) ? ev.x : ECON.spawnX) + (Math.random() - 0.5) * 120,
            y: gyy - Math.random() * 40,
            vy: -90 - Math.random() * 130,
            life: 1,
            s: 1.6 + Math.random() * 2.6,
            color: Math.random() < 0.5 ? '#ff7a5c' : '#ffd76a',
          });
        }
        for (let i = 0; i < 3; i++) this.rings.push({ x: Number.isFinite(ev.x) ? ev.x : ECON.spawnX, life: 1, r: 20 + i * 20, color: i === 1 ? '#ffd76a' : '#ff7a5c', wide: 2.2 - i * 0.4 });
      } else if (ev.t === 'revive') {
        // ✨ v4.3 부활 가호 시작 — 캐릭터 발밑에서 푸른 빛 기둥이 솟는다
        this.flash = Math.max(this.flash, 0.12);
        const px = ECON.playerX;
        for (let i = 0; i < 3; i++) this.rings.push({ x: px, life: 1, r: 16 + i * 14, color: i === 1 ? '#cfe6ff' : '#8fd6ff', wide: 1.6 });
        for (let i = 0; i < 18; i++) {
          this.embers.push({
            x: px + (Math.random() - 0.5) * 60,
            y: this.groundY() - Math.random() * 26,
            vy: -70 - Math.random() * 100,
            life: 1,
            s: 1.4 + Math.random() * 2.2,
            color: Math.random() < 0.55 ? '#bfe8ff' : '#eaf6ff',
          });
        }
      } else if (ev.t === 'levelUp') {
        this.rings.push({ x: ECON.playerX, life: 1, r: 10, color: '#ffe08a', wide: 1.2 });
      }
    }
  }

  addFloater(x, text, crit, kind, color, boost, at) {
    if (!this.dmgNumbersOn && kind !== 'gold' && kind !== 'heal') return;
    const simple = this.dmgStyle !== 'full';
    const now = Number.isFinite(at) ? at : Date.now();
    // v3.8 다굴: 같은 순간에 여러 마리가 때리면 피해 숫자를 하나로 합쳐 읽기 쉽게 한다
    // v8.1.0 '간단' 모드: 합치는 창을 320ms 로 넓히고 표시 개수를 40→14로 줄인다
    if (kind === 'hurt' || kind === 'pet' || kind === 'burn' || kind === 'chain') {
      const mergeMs = simple ? 320 : 190;
      for (let i = this.floaters.length - 1; i >= 0 && i >= this.floaters.length - 6; i--) {
        const last = this.floaters[i];
        if (!last) break;
        if ((last.kind === 'hurt' || last.kind === 'pet' || last.kind === 'burn' || last.kind === 'chain') && now - (last.at || 0) < mergeMs) {
          last.sum = (last.sum || Number(last.raw) || 0) + (Number(text) || 0);
          last.raw = last.sum;
          last.text = fmtDmg(last.sum);
          last.crit = last.crit || !!crit;
          last.life = 1;
          last.at = now;
          return;
        }
      }
    }
    const rawNum = typeof text === 'number' ? text : Number(text);
    this.floaters.push({
      x: x + (Math.random() - 0.5) * 18,
      y: (Math.random() - 0.5) * 14,
      raw: Number.isFinite(rawNum) ? rawNum : 0,
      sum: (kind === 'hurt' || kind === 'pet' || kind === 'burn' || kind === 'chain') && Number.isFinite(rawNum) ? rawNum : 0,
      text: fmtDmg(text),
      crit,
      kind,
      color: color || null,
      boost: Number(boost) > 0 ? Number(boost) : 1, // v4.3 보스 타격 등 숫자 강조 배율
      life: 1,
      at: now,
      vx: (Math.random() - 0.5) * 32,
      vy: crit ? -86 : -62,
    });
    const cap = simple ? 14 : 40;
    if (this.floaters.length > cap) this.floaters.shift();
  }

  /* ─────────── v4.3 타격 임팩트 플래시 ───────────
   * 때린 자리에 짧고 짙은 '별' 모양 빛을 터뜨린다.
   *  - 일반: 작은 십자 · 치명타: 크고 금빛인 별 + 고리 · 보스: 두꺼운 잔상(보스 타격이 확실히 다르게 느껴진다)
   */
  addImpact(x, opts = {}, now) {
    if (!this.effects) return;
    const crit = !!opts.crit;
    const boss = !!opts.boss;
    this.impacts.push({
      x: Number.isFinite(x) ? x : ECON.playerX,
      t0: Number.isFinite(now) ? now : Date.now(),
      crit,
      boss,
      color: opts.color || (crit ? '#ffe08a' : '#fff1cf'),
      dur: crit || boss ? 260 : 170,
    });
    if (this.impacts.length > 16) this.impacts.splice(0, this.impacts.length - 16);
  }

  drawImpacts(ctx, now) {
    if (!this.impacts.length) return;
    const gy = this.groundY();
    const sc = this.scale();
    const keep = [];
    for (const it of this.impacts) {
      const age = now - it.t0;
      if (age < 0 || age > it.dur) continue;
      const k = age / it.dur; // 0→1
      const fade = 1 - k;
      const x = this.worldX(it.x);
      const y = gy - 46 * sc + (it.boss ? -6 : 0) * sc;
      const r = (it.crit ? 30 : it.boss ? 26 : 16) * sc * (0.55 + k * 0.85);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(x, y);
      // 중심 글로우
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, hexA(it.color, 0.55 * fade));
      g.addColorStop(0.45, hexA(it.color, 0.22 * fade));
      g.addColorStop(1, hexA(it.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      // 별 모양 빛살 (가로/세로 길고 대각선 짧게)
      const rays = it.crit ? 8 : 4;
      const len = r * (it.crit ? 1.9 : 1.35);
      ctx.strokeStyle = hexA('#ffffff', 0.75 * fade);
      ctx.lineWidth = (it.crit ? 2.6 : 1.6) * sc;
      for (let i = 0; i < rays; i++) {
        const a = (Math.PI * 2 * i) / rays + (it.boss ? Math.PI / 8 : 0);
        const l = i % 2 === 0 ? len : len * 0.55;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16);
        ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
        ctx.stroke();
      }
      // 충격 고리
      if (it.crit || it.boss) {
        ctx.strokeStyle = hexA(it.color, 0.8 * fade);
        ctx.lineWidth = (it.boss ? 2.4 : 1.8) * sc;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      keep.push(it);
    }
    this.impacts = keep;
  }

  burst(x, color, n, strong) {
    const cap = 150;
    for (let i = 0; i < n && this.sparks.length < cap; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (strong ? 90 : 60) + Math.random() * 150;
      this.sparks.push({
        x,
        y: this.groundY() - 44 * this.scale(),
        life: 1,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        color,
        s: 1.6 + Math.random() * 2.2,
      });
    }
  }

  /* ─────────── 코인/보석 자석 드롭 ───────────
   * 몬스터가 죽으면 금화·보석이 포물선으로 튀어오르고, 0.4초 뒤 캐릭터로 빨려 들어간다.
   */
  spawnLoot(ev, now = Date.now()) {
    if (!this.effects) return;
    const gy = this.groundY();
    const px = this.worldX(ev.x);
    const coins = ev.isBoss ? 9 : Math.max(2, Math.min(6, 1 + Math.round(Math.log10(Math.max(10, ev.gold || 10)) * 1.6)));
    for (let i = 0; i < coins; i++) this.pushDrop(px, gy, 'gold', now, i);
    const gems = Math.min(3, Math.max(0, ev.shards || 0));
    for (let i = 0; i < gems; i++) this.pushDrop(px, gy, 'gem', now, i + coins);
    if (this.drops.length > 60) this.drops.splice(0, this.drops.length - 60);
  }

  pushDrop(x, gy, kind, now, i) {
    const sc = this.scale();
    this.drops.push({
      kind,
      x: x + (Math.random() - 0.5) * 18 * sc,
      y: gy - 10 * sc,
      sx: null,
      sy: null,
      vx: (Math.random() - 0.5) * 190,
      vy: -210 - Math.random() * 120,
      t0: now + i * 22,
      delay: 400 + i * 26,
      spin: Math.random() * Math.PI * 2,
      pop: 0.85 + Math.random() * 0.4,
    });
  }

  drawLoot(ctx, dt, now) {
    if (!this.drops.length) return;
    const gy = this.groundY();
    const sc = this.scale();
    const tx = this.worldX(ECON.playerX);
    const ty = gy - 58 * sc;
    const keep = [];
    for (const d of this.drops) {
      const age = now - d.t0;
      if (age < 0) { keep.push(d); continue; }
      if (age < d.delay) {
        // 포물선으로 튀어오르는 구간
        d.x += (d.vx * dt) / 1000;
        d.vy += 620 * (dt / 1000);
        d.y += (d.vy * dt) / 1000;
        d.spin += (dt / 1000) * 7;
        if (d.y > gy - 3) {
          d.y = gy - 3;
          if (Math.abs(d.vy) < 40) d.vy = 0;
          else d.vy = -Math.abs(d.vy) * 0.42;
          d.vx *= 0.72;
        }
        this.drawLootIcon(ctx, d.x, d.y, d, sc);
        keep.push(d);
      } else {
        // 자석 구간: 캐릭터 쪽으로 가속하며 빨려 들어간다
        if (d.sx === null) { d.sx = d.x; d.sy = d.y; }
        const k = clamp((age - d.delay) / 300, 0, 1);
        const e = k * k;
        d.x = lerp(d.sx, tx, e);
        d.y = lerp(d.sy, ty, e) - Math.sin(Math.PI * k) * 26 * sc;
        d.spin += (dt / 1000) * 12;
        if (k >= 1) {
          if (this.onLoot) { try { this.onLoot(d.kind); } catch (err) { /* ignore */ } }
          for (let i = 0; i < 3; i++) {
            this.sparks.push({
              x: ECON.playerX + (Math.random() - 0.5) * 20,
              y: ty + (Math.random() - 0.5) * 20,
              life: 1, vx: (Math.random() - 0.5) * 70, vy: -30 - Math.random() * 50,
              color: d.kind === 'gem' ? '#9fd8ff' : '#ffe08a', s: 1.6 + Math.random() * 1.6,
            });
          }
          continue; // 수집 완료 → 목록에서 제거
        }
        // 자석 궤적 잔상
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = d.kind === 'gem' ? '#9fd8ff' : '#ffd76a';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 3.2 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        this.drawLootIcon(ctx, d.x, d.y, d, sc);
        keep.push(d);
      }
    }
    this.drops = keep;
  }

  drawLootIcon(ctx, x, y, d, sc) {
    const s = (d.kind === 'gem' ? 8.5 : 7.5) * sc * (d.pop || 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = d.kind === 'gem' ? 'rgba(120,200,255,0.85)' : 'rgba(255,200,80,0.85)';
    ctx.shadowBlur = 8 * sc;
    if (d.kind === 'gem') {
      const grd = ctx.createLinearGradient(0, -s, 0, s);
      grd.addColorStop(0, '#eaf8ff');
      grd.addColorStop(0.45, '#7fd3ff');
      grd.addColorStop(1, '#3b7bd8');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.78, -s * 0.18);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.78, -s * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(0, s);
      ctx.moveTo(-s * 0.78, -s * 0.18);
      ctx.lineTo(s * 0.78, -s * 0.18);
      ctx.stroke();
    } else {
      const grd = ctx.createRadialGradient(-s * 0.3, -s * 0.3, s * 0.15, 0, 0, s);
      grd.addColorStop(0, '#fff6cf');
      grd.addColorStop(0.55, '#ffd24a');
      grd.addColorStop(1, '#c98a08');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * (0.72 + Math.abs(Math.cos(d.spin)) * 0.28), s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,247,210,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * (0.4 + Math.abs(Math.cos(d.spin)) * 0.2), s * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ─────────── 👑 v4.3 보스 등장 연출 (BOSS APPEAR) ───────────
   * 2.4초 3단계: ① 붉은 경고 띠가 좌우로 흐르며 화면 가장자리가 어두워진다
   *              ② 금테 두른 경고판이 살짝 튀어 오르며 등장(보스 이름 큼게)
   *              ③ 남은 제한 시간·격파 보상 안내와 함께 부드럽게 사라진다
   * 어느 해상도에서도 390px 기준으로 글자가 겹치지 않게 배율을 맞춘다.
   */
  drawBossAlert(ctx, W, now) {
    if (!this.bossAlert) return;
    const DUR = 2400;
    const age = now - this.bossAlert;
    if (age < 0 || age > DUR) { this.bossAlert = 0; return; }
    const inK = easeOut(clamp(age / 300, 0, 1));
    const outK = clamp((DUR - age) / 420, 0, 1);
    const alpha = Math.min(inK, outK);
    const sc = Math.min(1.2, Math.max(0.85, W / 390));
    // 오른쪽 퀵 스킬 버튼(약 48px)을 가리지 않는 폭
    const w = Math.min(W * 0.74, 290);
    const hgt = 82 * Math.min(1.1, sc);
    const x = (W - w) / 2;
    // 살짝 튀어 오르는 등장(overshoot)
    const pop = age < 340 ? 0.88 + 0.12 * easeOut(age / 340) + 0.03 * Math.sin((age / 340) * Math.PI) : 1;
    const y = lerp(-hgt - 14, this.H * 0.42 - hgt / 2, inK);
    const pulse = 0.62 + 0.38 * Math.sin(age / 85);
    const boss = this.battle && this.battle.boss;
    const bossName = boss && boss.ko ? boss.ko : '보스';
    ctx.save();

    // ① 화면 가장자리 붉은 비네트 — 위협감
    if (age < 1100) {
      const vk = 1 - clamp(age / 1100, 0, 1);
      const vg = ctx.createRadialGradient(W / 2, this.H * 0.45, this.H * 0.18, W / 2, this.H * 0.45, this.H * 0.72);
      vg.addColorStop(0, 'rgba(180,0,20,0)');
      vg.addColorStop(0.65, `rgba(150,0,18,${0.12 * vk})`);
      vg.addColorStop(1, `rgba(110,0,14,${0.5 * vk})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, this.H);
    }

    // ① 경고 띠 — 위·아래를 가로지르는 빗금 (천천히 흐른다)
    ctx.globalAlpha = alpha * 0.85;
    const bandH = 15 * sc;
    for (const by of [0, this.H - bandH]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, by, W, bandH);
      ctx.clip();
      ctx.fillStyle = 'rgba(28,4,8,0.9)';
      ctx.fillRect(0, by, W, bandH);
      ctx.fillStyle = 'rgba(228,42,52,0.85)';
      const off = (now / 26) % 26;
      for (let sx = -40; sx < W + 40; sx += 26) {
        ctx.beginPath();
        ctx.moveTo(sx + off, by);
        ctx.lineTo(sx + off + 9, by);
        ctx.lineTo(sx + off + 9 - bandH, by + bandH);
        ctx.lineTo(sx + off - bandH, by + bandH);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = alpha;

    // ② 경고판
    ctx.translate(W / 2, y + hgt / 2);
    ctx.scale(pop, pop);
    ctx.translate(-W / 2, -(y + hgt / 2));
    ctx.shadowColor = 'rgba(255,40,40,0.9)';
    ctx.shadowBlur = 26 * pulse;
    const g = ctx.createLinearGradient(x, y, x, y + hgt);
    g.addColorStop(0, 'rgba(206,24,32,0.97)');
    g.addColorStop(0.48, 'rgba(118,8,16,0.97)');
    g.addColorStop(1, 'rgba(176,16,26,0.97)');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, hgt, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,210,130,${0.6 + 0.35 * pulse})`;
    ctx.lineWidth = 2.2;
    roundRect(ctx, x + 1, y + 1, w - 2, hgt - 2, 11);
    ctx.stroke();
    // 안쪽 얇은 선
    ctx.strokeStyle = 'rgba(255,240,200,0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 5, y + 5, w - 10, hgt - 10, 8);
    ctx.stroke();

    ctx.textAlign = 'center';
    // 경고 문구
    ctx.fillStyle = '#ffe6c0';
    ctx.font = `900 ${Math.round(11 * sc)}px ${FONT}`;
    ctx.fillText('⚠  B O S S   A P P E A R  ⚠', x + w / 2, y + 16 * sc + 4);
    // 보스 한글 이름(가장 크게)
    ctx.shadowColor = 'rgba(255,120,60,0.95)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#fff8ef';
    ctx.font = `900 ${Math.round(23 * sc)}px ${FONT}`;
    ctx.fillText(bossName, x + w / 2, y + hgt * 0.58);
    ctx.shadowBlur = 0;
    // 제한 시간·안내
    ctx.fillStyle = 'rgba(255,228,205,0.95)';
    ctx.font = `800 ${Math.round(10.5 * sc)}px ${FONT}`;
    const limit = Math.round(ECON.bossTimeLimitMs / 1000);
    ctx.fillText(`⏱ ${limit}초 제한 · 격파하면 다음 스테이지로`, x + w / 2, y + hgt - 9 * sc);
    ctx.restore();
  }

  /* ─────────── 장비 등급 색 (오라·검기) + v4.0 무기 종류 색 ─────────── */
  syncRarity() {
    const s = this.battle && this.battle.s;
    const gr = s && s.gearRarity;
    if (!gr) { this._rar = { weapon: 0, avg: 0, hasLegend: false, weaponGear: null, pal: null }; return this._rar; }
    const wItem = s ? equippedItem(s, 'weapon') : null;
    const hasMythic = !!(s && ['weapon', 'armor', 'helmet', 'ring', 'amulet'].some((k) => isMythicSlot(s, k)));
    const wMythic = !!(s && isMythicSlot(s, 'weapon'));
    // v8.14.0 활성 장비 테마 세트(2피스 이상 우선, 없으면 무기 테마) 감지
    const activeSets = s ? gearSetStatus(s).filter((x) => x.count >= 2).sort((a, b) => b.count - a.count) : [];
    const setId = activeSets.length ? activeSets[0].id : (wItem && wItem.set && SET_FX_THEMES[wItem.set] ? wItem.set : '');
    const setFx = setId && SET_FX_THEMES[setId] ? SET_FX_THEMES[setId] : null;
    const key = `${gr.weapon}|${gr.armor}|${gr.helmet}|${gr.ring}|${gr.amulet}|${wItem ? wItem.id : '-'}|${hasMythic ? 1 : 0}${wMythic ? 1 : 0}|${setId}`;
    if (this._rarKey === key) return this._rar;
    this._rarKey = key;
    const ids = Object.keys(gr);
    const sum = ids.reduce((a, k) => a + (RARITY_INDEX[gr[k]] || 0), 0);
    const wIdx = RARITY_INDEX[gr.weapon] || 0;
    this._rar = {
      weapon: wIdx,
      avg: ids.length ? Math.ceil(sum / ids.length - 1e-9) : 0,
      hasLegend: ids.some((k) => gr[k] === 'legend'),
      hasMythic,
      weaponGear: wItem,
      setId,
      setFx,
      // 무기·테마 세트 고유 검기 색(신화 초월 > 테마 세트 > 무기 고유 > 등급)
      pal: wMythic
        ? { glow: '#ff4d9e', mid: '#ffcf5c', core: '#fff7fb' }
        : setFx
          ? { glow: setFx.glow, mid: setFx.mid, core: setFx.core }
          : wItem && wItem.fx ? wItem.fx : (RARITIES[wIdx] || RARITIES[0]).slash,
      tint: wMythic ? '#ff5ca8' : setFx ? setFx.mid : wItem ? wItem.tint : null,
    };
    return this._rar;
  }

  /* ─────────── v8.15.0 🏰 전투 배경 연동 '내 영지 스카이라인' 시각화 ───────────
   * 보유 영지 수 · 성채 레벨 · 메가 프로젝트(KTX·스카이타워·AI데이터센터·무역항)에 따라
   * 원경 지평선 위에 내 영지 실루엣과 불빛·달리는 KTX 열차가 실제로 세워진다.
   */
  drawEstateSkyline(ctx, W, H, now) {
    if (!this.battle || !this.battle.s) return;
    const s = this.battle.s;
    const owned = (s.land && s.land.owned) || {};
    let cities = 0;
    for (const q of Object.values(owned)) if (q > 0) cities += 1;
    const citLv = Object.values((s.citadel && s.citadel.levels) || {}).reduce((a, v) => a + (Number(v) || 0), 0);
    const mega = s.mega || {};
    const hasMega = (mega.ktx || 0) > 0 || (mega.skytower || 0) > 0 || (mega.datacenter || 0) > 0 || (mega.tradeport || 0) > 0;
    if (cities <= 0 && citLv <= 0 && !hasMega) return;

    const gy = this.groundY();
    const sc = this.scale();
    const hy = gy - 4 * sc;
    ctx.save();
    ctx.globalAlpha = 0.42;

    // 1) 보유 영지 도시 스카이라인 (보유 지역 수에 비례해 최대 10동 점진적 성장)
    if (cities > 0) {
      const cnt = Math.min(10, Math.max(1, Math.ceil(cities / 4)));
      for (let i = 0; i < cnt; i++) {
        const bx = W * (0.14 + i * 0.072);
        const bw = (11 + (i % 3) * 5) * sc;
        const bh = (16 + ((i * 13) % 24) + Math.min(18, cities * 0.25)) * sc;
        ctx.fillStyle = 'rgba(12, 18, 34, 0.72)';
        ctx.fillRect(bx, hy - bh, bw, bh);
        const winA = 0.45 + 0.25 * Math.sin(now / 900 + i * 1.7);
        ctx.fillStyle = `rgba(255, 224, 130, ${winA.toFixed(2)})`;
        for (let wy = hy - bh + 4 * sc; wy < hy - 4 * sc; wy += 6 * sc) {
          ctx.fillRect(bx + 2.5 * sc, wy, 2 * sc, 2.2 * sc);
          if (bw > 12 * sc) ctx.fillRect(bx + bw - 4.5 * sc, wy, 2 * sc, 2.2 * sc);
        }
      }
    }

    // 2) 🏰 영지 성채 (좌측 원경 성곽 + 쌍첨탑)
    if (citLv > 0) {
      const cx = W * 0.09;
      const ch = (26 + Math.min(24, citLv * 0.7)) * sc;
      const cw = 30 * sc;
      ctx.fillStyle = 'rgba(18, 24, 44, 0.82)';
      ctx.fillRect(cx - cw * 0.5, hy - ch * 0.65, cw, ch * 0.65);
      ctx.fillRect(cx - cw * 0.52, hy - ch * 0.9, 8 * sc, ch * 0.9);
      ctx.fillRect(cx + cw * 0.52 - 8 * sc, hy - ch * 0.9, 8 * sc, ch * 0.9);
      ctx.beginPath();
      ctx.moveTo(cx - 7 * sc, hy - ch * 0.65);
      ctx.lineTo(cx, hy - ch * 1.12);
      ctx.lineTo(cx + 7 * sc, hy - ch * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 207, 92, 0.78)';
      ctx.fillRect(cx - 1.5 * sc, hy - ch * 0.5, 3 * sc, 5 * sc);
    }

    // 3) 🗼 대한민국 스카이타워 (초고층 첨탑 + 정상 비콘)
    if ((mega.skytower || 0) > 0) {
      const tx = W * 0.66;
      const th = (54 + (mega.skytower || 1) * 14) * sc;
      ctx.fillStyle = 'rgba(16, 26, 48, 0.85)';
      ctx.beginPath();
      ctx.moveTo(tx - 10 * sc, hy);
      ctx.lineTo(tx - 2.5 * sc, hy - th);
      ctx.lineTo(tx + 2.5 * sc, hy - th);
      ctx.lineTo(tx + 10 * sc, hy);
      ctx.closePath();
      ctx.fill();
      const pulse = 0.5 + 0.5 * Math.sin(now / 320);
      ctx.fillStyle = `rgba(255, 215, 106, ${(0.55 + 0.45 * pulse).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(tx, hy - th - 2 * sc, (2.2 + 1.4 * pulse) * sc, 0, Math.PI * 2);
      ctx.fill();
    }

    // v8.16.0 🎆 내 지역 호재 발동 중 스카이라인 축하 불꽃놀이 & 황금 야경
    const nb = this.battle && typeof this.battle.buffs === 'function' ? this.battle.buffs().newsBattle : null;
    if (nb) {
      const fCol = nb.color || '#ffd76a';
      ctx.globalAlpha = 0.65;
      for (let i = 0; i < 3; i++) {
        const phase = ((now / 1400) + i * 0.37) % 1;
        const fx = W * (0.24 + i * 0.26);
        const fy = hy - (44 + i * 11) * sc;
        const rad = phase * 18 * sc;
        const a = Math.max(0, 1 - phase);
        ctx.strokeStyle = fCol;
        ctx.globalAlpha = a * 0.72;
        ctx.lineWidth = 1.4 * sc;
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + i * 0.4;
          ctx.beginPath();
          ctx.moveTo(fx + Math.cos(ang) * rad * 0.45, fy + Math.sin(ang) * rad * 0.45);
          ctx.lineTo(fx + Math.cos(ang) * rad, fy + Math.sin(ang) * rad);
          ctx.stroke();
        }
      }
    }

    // 4) 🌐 AI 데이터센터 (네온 돔 + 빛기둥)
    if ((mega.datacenter || 0) > 0) {
      const dx = W * 0.53;
      const r = (14 + (mega.datacenter || 1) * 3) * sc;
      ctx.fillStyle = 'rgba(20, 18, 46, 0.82)';
      ctx.beginPath();
      ctx.arc(dx, hy, r, Math.PI, 0);
      ctx.fill();
      const p = 0.5 + 0.5 * Math.sin(now / 420);
      ctx.strokeStyle = `rgba(168, 130, 255, ${(0.5 + 0.4 * p).toFixed(2)})`;
      ctx.lineWidth = 1.6 * sc;
      ctx.beginPath();
      ctx.arc(dx, hy, r * 0.72, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    // 5) 🚢 국제 무역항 (우측 원경 크레인)
    if ((mega.tradeport || 0) > 0) {
      const px = W * 0.86;
      const ph = (24 + (mega.tradeport || 1) * 5) * sc;
      ctx.strokeStyle = 'rgba(22, 34, 52, 0.82)';
      ctx.lineWidth = 2.2 * sc;
      ctx.beginPath();
      ctx.moveTo(px, hy);
      ctx.lineTo(px, hy - ph);
      ctx.lineTo(px - 18 * sc, hy - ph + 4 * sc);
      ctx.moveTo(px, hy - ph);
      ctx.lineTo(px + 12 * sc, hy - ph + 3 * sc);
      ctx.stroke();
    }

    // 6) 🚄 KTX 고속철도 (고가교 + 달리는 KTX 고속열차 광선)
    if ((mega.ktx || 0) > 0) {
      const railY = hy - 12 * sc;
      ctx.strokeStyle = 'rgba(110, 195, 255, 0.32)';
      ctx.lineWidth = 1.4 * sc;
      ctx.beginPath();
      ctx.moveTo(0, railY);
      ctx.lineTo(W, railY);
      ctx.stroke();
      const period = 4200;
      const phase = (now % period) / period;
      const trainX = lerp(-60 * sc, W + 60 * sc, phase);
      const tLen = (36 + (mega.ktx || 1) * 10) * sc;
      const grd = ctx.createLinearGradient(trainX - tLen, railY, trainX, railY);
      grd.addColorStop(0, 'rgba(127, 246, 255, 0)');
      grd.addColorStop(0.7, 'rgba(127, 246, 255, 0.78)');
      grd.addColorStop(1, 'rgba(255, 255, 255, 0.96)');
      ctx.strokeStyle = grd;
      ctx.lineWidth = 2.8 * sc;
      ctx.beginPath();
      ctx.moveTo(trainX - tLen, railY - 1 * sc);
      ctx.lineTo(trainX, railY - 1 * sc);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawAura(ctx, px, gy, h, sc, now) {
    const idx = this._rar.hasLegend ? RARITIES.length - 1 : this._rar.avg;
    const info = RARITIES[idx] || RARITIES[0];
    const pulse = 0.5 + 0.5 * Math.sin(now / 420);
    const strength = 0.26 + idx * 0.14;
    // 발밑 그라디언트
    const grd = ctx.createRadialGradient(px, gy + 2, 3, px, gy + 2, h * 0.62);
    grd.addColorStop(0, hexA(info.color, strength * (0.75 + pulse * 0.2)));
    grd.addColorStop(0.55, hexA(info.color, strength * 0.35));
    grd.addColorStop(1, hexA(info.color, 0));
    ctx.fillStyle = grd;
    ctx.fillRect(px - h * 0.8, gy - h * 0.55, h * 1.6, h * 0.95);
    // 회전하는 오라 링
    ctx.save();
    ctx.strokeStyle = hexA(info.color, 0.55 + 0.3 * pulse);
    ctx.lineWidth = (1.8 + idx * 0.7) * sc;
    ctx.beginPath();
    ctx.ellipse(px, gy + 1, h * 0.31 * (1 + 0.045 * pulse), h * 0.1 * (1 + 0.08 * pulse), 0, 0, Math.PI * 2);
    ctx.stroke();
    if (idx >= 2) {
      ctx.strokeStyle = hexA(info.color, 0.3 + 0.2 * pulse);
      ctx.lineWidth = 1.1 * sc;
      ctx.beginPath();
      ctx.ellipse(px, gy + 1, h * 0.42 * (1 + 0.05 * pulse), h * 0.14 * (1 + 0.06 * pulse), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // v4.0: 무기 종류의 색(화염·빙결·번개…)을 발밑 고리에 한 번 더 얹어 무기 교체가 눈에 보이게
    if (this._rar.tint) {
      ctx.strokeStyle = hexA(this._rar.tint, 0.4 + 0.25 * pulse);
      ctx.lineWidth = 1.2 * sc;
      ctx.beginPath();
      ctx.ellipse(px, gy + 1, h * 0.22 * (1 + 0.06 * pulse), h * 0.07 * (1 + 0.1 * pulse), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // 등급별 입자
    if (idx >= 1 && this.embers.length < 130) {
      const chance = idx >= 4 ? 0.9 : idx === 3 ? 0.45 : 0.22;
      if (Math.random() < chance) {
        this.embers.push({
          x: ECON.playerX + (Math.random() - 0.5) * 54,
          y: gy - Math.random() * 10,
          vy: -34 - Math.random() * (idx >= 4 ? 86 : 44),
          life: 1,
          s: 1.2 + Math.random() * (idx >= 4 ? 2.4 : 1.6),
          color: idx >= 4 ? (Math.random() < 0.5 ? '#ffd76a' : '#ff5a2f') : info.color,
        });
      }
    }
    // 전설: 불타는 적금빛 화염 · 신화(v6.6): 프리즘-진홍빛 광휘 링 추가
    if (idx >= 4) {
      const f = ctx.createLinearGradient(px, gy - h * 0.9, px, gy);
      f.addColorStop(0, 'rgba(255,90,40,0)');
      f.addColorStop(0.6, this._rar.hasMythic ? `rgba(255,82,168,${0.14 + 0.08 * pulse})` : `rgba(255,122,61,${0.10 + 0.06 * pulse})`);
      f.addColorStop(1, `rgba(255,210,80,${0.16 + 0.08 * pulse})`);
      ctx.fillStyle = f;
      ctx.fillRect(px - h * 0.34, gy - h * 0.95, h * 0.68, h * 0.95);
      if (this._rar.hasMythic) {
        ctx.save();
        ctx.strokeStyle = hexA('#ff66c4', 0.65 + 0.25 * pulse);
        ctx.lineWidth = 2.0 * sc;
        ctx.beginPath();
        ctx.ellipse(px, gy + 1, h * 0.49 * (1 + 0.04 * pulse), h * 0.16 * (1 + 0.06 * pulse), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* ─────────── v4.4 전직(칭호) 오라 ───────────
   * 장비 등급 오라(drawAura)는 '장비 색'을 보여 준다. 전직 단계는 별도 층으로 그려
   * 한 화면에서 둘을 구분해 읽을 수 있게 한다.
   *  · 1~2단계 : 바닥 점선 고리(회전)
   *  · 3단계    : 고리 2겹
   *  · 4·5단계  : 고리 2겹 + 떠도는 불티 4~6개 + 세로 빛기둥 + 머리 위 후광
   */
  syncJob() {
    const s = this.battle && this.battle.s;
    const t = s ? Math.max(0, Math.floor(Number(s.jobTier) || 0)) : 0;
    if (this._jobTier === t) return this._job;
    this._jobTier = t;
    const j = jobOf(s || { jobTier: 0 });
    this._job = { tier: j.tier, color: j.color, badge: j.badge, name: j.name, upper: isUpperJob(j.tier) };
    return this._job;
  }

  drawJobAura(ctx, px, gy, h, sc, now) {
    const j = this.syncJob();
    if (!j || !j.tier) return; // 견습 기사는 오라 없음(장비 오라만)
    const col = j.color;
    const pulse = 0.5 + 0.5 * Math.sin(now / (j.upper ? 300 : 460));
    const k = Math.min(1, 0.5 + j.tier * 0.1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 1) 바닥 점선 고리 — 장비 오라(반지름 0.31~0.42h)보다 넓게 깔아 두 층이 겹쳐 보이지 않게
    const rings = j.tier >= 3 ? 2 : 1;
    for (let i = 0; i < rings; i++) {
      const rr = h * (0.54 + j.tier * 0.012) * (1 + i * 0.22);
      ctx.strokeStyle = hexA(col, (0.2 + 0.14 * pulse) * k);
      ctx.lineWidth = (1.2 + j.tier * 0.24) * sc;
      ctx.setLineDash([6 * sc, 7 * sc]);
      ctx.lineDashOffset = ((i % 2 ? -1 : 1) * (now / 26)) % 60;
      ctx.beginPath();
      ctx.ellipse(px, gy + 1, rr, rr * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // 2) 몸 뒤 마법진(기울어진 타원) — 장비 오라에는 없는 '전직' 표식
    const cy = gy - h * 0.46;
    const spin = now / (j.upper ? 1100 : 1600);
    for (let i = 0; i < (j.upper ? 2 : 1); i++) {
      ctx.strokeStyle = hexA(col, (0.18 + 0.14 * pulse) * k);
      ctx.lineWidth = (1.1 + j.tier * 0.18) * sc;
      ctx.setLineDash([4 * sc, 6 * sc]);
      ctx.lineDashOffset = (i ? 1 : -1) * spin * 40;
      ctx.beginPath();
      ctx.ellipse(px, cy + i * h * 0.06, h * (0.46 - i * 0.09), h * (0.15 - i * 0.03), -0.14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // 3) 상위 전직(5단계~): 세로 빛기둥(안쪽 밝은 심 + 바깥 번짐)
    if (j.upper) {
      const top = gy - h * 1.5;
      const g = ctx.createLinearGradient(px, top, px, gy);
      g.addColorStop(0, hexA(col, 0));
      g.addColorStop(0.5, hexA(col, 0.07 + 0.06 * pulse));
      g.addColorStop(1, hexA(col, 0.2 + 0.08 * pulse));
      ctx.fillStyle = g;
      ctx.fillRect(px - h * 0.3, top, h * 0.6, gy - top);
      const core = ctx.createLinearGradient(px, top, px, gy);
      core.addColorStop(0, hexA('#ffffff', 0));
      core.addColorStop(1, hexA('#ffffff', 0.1 + 0.06 * pulse));
      ctx.fillStyle = core;
      ctx.fillRect(px - h * 0.06, top, h * 0.12, gy - top);
    }
    // 4) 위로 떠오르는 불티 — 단계가 높을수록 많고 길게
    const sparks = 2 + j.tier * 2;
    const rise = j.upper ? 1.25 : 0.95;
    for (let i = 0; i < sparks; i++) {
      const ph = (now / (1700 - j.tier * 90) + i / sparks) % 1;
      const sway = Math.sin(ph * 6.28 + i * 2.1) * h * 0.18;
      const x = px + sway + (i - sparks / 2) * h * 0.045;
      const y = gy - ph * h * rise;
      const a = (1 - ph) * (0.5 + 0.35 * pulse) * k;
      ctx.fillStyle = hexA(col, Math.max(0, a));
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.7, (1.6 - ph * 0.9) * sc), 0, Math.PI * 2);
      ctx.fill();
    }
    // 5) 머리 위 후광 — 4단계는 금고리, 5단계는 2겹 + 회전 광선
    if (j.upper) {
      const hy = gy - h * 1.04;
      ctx.strokeStyle = hexA(col, 0.45 + 0.3 * pulse);
      ctx.lineWidth = (1.6 + (j.tier - 4) * 0.8) * sc;
      ctx.beginPath();
      ctx.ellipse(px, hy, h * 0.24, h * 0.07, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (j.tier >= 5) {
        ctx.strokeStyle = hexA('#ffffff', 0.3 + 0.22 * pulse);
        ctx.lineWidth = 1 * sc;
        ctx.beginPath();
        ctx.ellipse(px, hy - 3 * sc, h * 0.32, h * 0.1, 0, 0, Math.PI * 2);
        ctx.stroke();
        const rot = now / 1400;
        for (let i = 0; i < 4; i++) {
          const a2 = rot + (i * Math.PI) / 2;
          ctx.strokeStyle = hexA(col, 0.26 + 0.16 * pulse);
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(a2) * h * 0.26, hy + Math.sin(a2) * h * 0.075);
          ctx.lineTo(px + Math.cos(a2) * h * 0.38, hy + Math.sin(a2) * h * 0.12);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  groundY() {
    return this.H * 0.8;
  }

  scale() {
    return Math.max(0.55, Math.min(1.45, this.H / 300));
  }

  worldX(x) {
    return (x / 1120) * this.W;
  }

  /** v7.7.0 화면 포인터 X → 전투 월드 X 변환 */
  screenToWorldX(clientX) {
    if (!this.canvas || !this.W) return ECON.playerX + 320;
    const rect = this.canvas.getBoundingClientRect();
    const lx = clamp(clientX - rect.left, 0, Math.max(1, rect.width));
    return (lx / Math.max(1, rect.width)) * 1120;
  }

  /* ─────────── 프레임 ─────────── */
  frame(now) {
    const t = typeof now === 'number' && isFinite(now) ? now : Date.now();
    const rawDt = this.lastFrame ? clamp(t - this.lastFrame, 0, 100) : 16;
    // v7.3.0 시각 히트스톱(34ms) — 치명타/강격 순간 시각 프레임을 0.2배로 잠깐 멈춰 타격감 극대화
    const dt = this.effects && this.hitstopUntil > t ? rawDt * 0.18 : rawDt;
    this.lastFrame = t;
    this.time += dt;
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    if (!W || !H) {
      this.resize();
      return;
    }
    this.syncTheme();
    if (this.bgKey !== `${W}x${H}|${this.dpr}|${this.theme.id}`) this.buildBackground();
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (this.shake > 0.15 && this.shakeOn) {
      const s = Math.min(ECON.shakeMax, this.shake);
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.shake *= ECON.shakeTrim;
    } else {
      this.shake = 0;
    }
    if (this.bg) ctx.drawImage(this.bg, 0, 0, W, H);
    else this.paintBackground(ctx, W, H);
    // v4.1 테마 배경 일러스트 — 그라데이션 폴백 위로 부드럽게 올린다
    this.drawThemeBg(ctx, dt, W, H);
    // v8.15.0 전투 배경 연동 '내 영지 스카이라인'(보유 도시·성채·메가 프로젝트 실시간 시각화)
    this.drawEstateSkyline(ctx, W, H, t);
    // v7.2.0 특수 모드 전용 분위기 + 패럴랙스 지면/안개/행군 연출
    this.drawModeBackdrop(ctx, W, H, t);
    this.drawAtmosphere(ctx, dt, W, H, t);
    this.drawAmbient(ctx, dt, W, H);

    if (this.battle) {
      this.syncRarity();
      this.drawBossRoar(ctx, t);
      this.drawPuffs(ctx, dt);
      this.drawTowerMarkers(ctx, t);
      this.drawMonsters(ctx, t, dt);
      this.drawPet(ctx, t, dt);
      this.drawPlayer(ctx, t, dt);
      if (this.effects) {
        this.drawSwordTrail(ctx, t);
        this.drawAfterimages(ctx, t);
        this.drawKnightSupport(ctx, dt, t);
        this.drawLightnings(ctx, t);
        this.drawTapBolts(ctx, t);
        this.drawKillShards(ctx, dt);
        this.drawBossKillFx(ctx, t);
        this.drawProjectiles(ctx, t);
        this.drawFx(ctx, t);
        this.drawArcs(ctx, t);
        this.drawRings(ctx, dt);
        this.drawSparks(ctx, dt);
        this.drawEmbers(ctx, dt);
        this.drawLoot(ctx, dt, t);
        this.drawFloaters(ctx, dt, t);
        this.drawImpacts(ctx, t);
        this.drawBossAlert(ctx, W, t);
        this.flushDelayedHits(t);
      } else {
        this.fx = [];
        this.rings = [];
        this.sparks = [];
        this.floaters = [];
        this.drops = [];
        this.puffs = [];
        this.projectiles = [];
        this.delayedHits = [];
        this.impacts = [];
        this.bossRoar = null;
        this.bossAlert = 0;
      }
      this.drawBossBar(ctx, W, t);
      this.drawDungeonHud(ctx, W, t);
      this.drawDailyHud(ctx, W, t);
      this.drawRaidHud(ctx, W, t);
      this.drawTowerHud(ctx, W, t);
      this.drawTowerBanner(ctx, W, t);
      this.drawPromoteBanner(ctx, W, t);
      this.drawGraceBanner(ctx, W, t); // v4.3 부활 가호 남은 시간 배너
      this.drawCombo(ctx, W, t);       // v7.0.0 콤보 히트 카운터
      this.drawFeverHud(ctx, W, H, t); // v7.7.0 피버 게이지 & 피버 타임 오라
      this.drawBossWarning(ctx, t);    // v7.0.0 보스 강공격 전조 경고 링
    }
    ctx.restore();

    // 화면 플래시(치명타·스킬·보스)
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.55})`;
      ctx.fillRect(0, 0, W, H);
      this.flash *= 0.82;
    } else {
      this.flash = 0;
    }
    if (this.redFlash > 0.01) {
      const g = Math.max(0, this.redFlash);
      ctx.fillStyle = `rgba(200,30,40,${g * 0.32})`;
      ctx.fillRect(0, 0, W, H);
      this.redFlash *= 0.86;
    } else {
      this.redFlash = 0;
    }
  }

  /* ─────────── 배경 (오프스크린 1회 렌더) ─────────── */
  buildBackground() {
    const W = this.W;
    const H = this.H;
    const dpr = this.dpr;
    try {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.paintBackground(c, W, H);
      this.bg = cv;
      this.bgKey = `${W}x${H}|${dpr}|${this.theme.id}`;
    } catch (e) {
      this.bg = null;
      this.bgKey = `${W}x${H}|${dpr}|${this.theme.id}`;
    }
    this.buildThemeBg();
  }

  /** v4.1: 테마 사진 레이어 — 캐벼스 비율에 맞춰 비율 유지(cover)로 잘라 합성한다. */
  buildThemeBg() {
    const W = this.W;
    const H = this.H;
    const dpr = this.dpr;
    const id = (this.theme && this.theme.id) || 'meadow';
    const key = `${W}x${H}|${dpr}|${id}`;
    if (this.bgPhotoKey === key) return;
    this.bgPhotoKey = key;
    this.bgPhoto = null;
    const img = this.bgImages.get(id);
    if (!img || !img.naturalWidth) {
      this.loadThemeBg(id); // 아직 없으면 요청만 해 두고 다음 프레임에 다시 시도한다
      return;
    }
    try {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      // cover: 짧은 쪽을 꽉 차게 → 넘치는 쪽만 잘린다. 지면선(세로)은 그대로 유지된다.
      const k = Math.max(W / iw, H / ih);
      const dw = iw * k;
      const dh = ih * k;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      c.imageSmoothingEnabled = true;
      c.drawImage(img, dx, dy, dw, dh);
      // 글레이딩: 상단·하단을 살짝 더 눌러 HUD·데미지 숫자·캐릭터가 묻히지 않게 한다
      const top = c.createLinearGradient(0, 0, 0, H * 0.26);
      top.addColorStop(0, 'rgba(5,8,14,0.34)');
      top.addColorStop(1, 'rgba(5,8,14,0)');
      c.fillStyle = top;
      c.fillRect(0, 0, W, H * 0.26);
      const bot = c.createLinearGradient(0, H * 0.58, 0, H);
      bot.addColorStop(0, 'rgba(4,7,12,0)');
      bot.addColorStop(1, 'rgba(4,7,12,0.42)');
      c.fillStyle = bot;
      c.fillRect(0, H * 0.58, W, H * 0.42);
      this.bgPhoto = cv;
    } catch (e) {
      this.bgPhoto = null;
    }
  }

  /** 사진 레이어 페이드인 — 로딩 전 그라데이션 폴백에서 자연스럽게 넘어간다. */
  drawThemeBg(ctx, dt, W, H) {
    if (!this.bgPhoto) return;
    if (this.bgFade < 1) this.bgFade = Math.min(1, this.bgFade + (dt || 16) / 420);
    ctx.save();
    ctx.globalAlpha = this.bgFade;
    ctx.drawImage(this.bgPhoto, 0, 0, W, H);
    ctx.restore();
  }

  paintBackground(ctx, W, H) {
    const t = this.theme;
    const gy = this.groundY();
    const g = ctx.createLinearGradient(0, 0, 0, gy);
    g.addColorStop(0, t.sky[0]);
    g.addColorStop(1, t.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, gy);
    // 달/해
    const lx = W * 0.78;
    const ly = gy * 0.26;
    const rad = Math.min(W, gy) * 0.09;
    const halo = ctx.createRadialGradient(lx, ly, rad * 0.2, lx, ly, rad * 2.4);
    halo.addColorStop(0, 'rgba(255,240,210,0.55)');
    halo.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(lx - rad * 3, ly - rad * 3, rad * 6, rad * 6);
    ctx.fillStyle = 'rgba(255,246,222,0.9)';
    ctx.beginPath();
    ctx.arc(lx, ly, rad, 0, Math.PI * 2);
    ctx.fill();

    // 원경 언덕 (2겹)
    this.drawRidge(ctx, W, gy, gy * 0.52, gy * 0.1, t.far, 1.3, 0);
    this.drawRidge(ctx, W, gy, gy * 0.66, gy * 0.08, t.near, 1.8, 2.1);

    // 원경 실루엣 (나무/구조물)
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = ((i + rnd(i + this.bgSeed) * 0.6) / n) * W;
      const hh = gy * (0.08 + rnd(i * 3 + this.bgSeed) * 0.12);
      ctx.fillStyle = t.near;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      if (this.theme.id === 'desert') {
        ctx.moveTo(x - hh * 0.5, gy - hh * 0.1);
        ctx.lineTo(x, gy - hh);
        ctx.lineTo(x + hh * 0.5, gy - hh * 0.1);
      } else if (this.theme.id === 'ruins' || this.theme.id === 'abyss') {
        ctx.rect(x - hh * 0.12, gy - hh * 1.2, hh * 0.24, hh * 1.2);
      } else if (this.theme.id === 'cave') {
        ctx.moveTo(x - hh * 0.4, gy);
        ctx.lineTo(x, gy - hh * 0.9);
        ctx.lineTo(x + hh * 0.4, gy);
      } else {
        ctx.moveTo(x, gy - hh * 1.3);
        ctx.lineTo(x + hh * 0.42, gy);
        ctx.lineTo(x - hh * 0.42, gy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 지면
    const gg = ctx.createLinearGradient(0, gy, 0, H);
    gg.addColorStop(0, t.groundLine);
    gg.addColorStop(0.25, t.ground);
    gg.addColorStop(1, '#070a10');
    ctx.fillStyle = gg;
    ctx.fillRect(0, gy, W, H - gy);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();

    // 지면 디테일
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const y = gy + ((i + 1) / 17) * (H - gy);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let i = 0; i < 22; i++) {
      const x = rnd(i * 5 + this.bgSeed) * W;
      const y = gy + rnd(i * 9 + this.bgSeed) * (H - gy);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, y, 2 + rnd(i) * 3, 1.5);
    }
  }

  drawRidge(ctx, W, gy, baseY, amp, color, freq, phase) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      const y = baseY - Math.sin((i / steps) * Math.PI * freq + phase) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, gy);
    ctx.closePath();
    ctx.fill();
  }

  /* ─────────── v7.2.0 패럴랙스 지면 스크롤 · 스테이지 행군 · 특수 모드 분위기 ─────────── */
  drawModeBackdrop(ctx, W, H, now) {
    const b = this.battle;
    if (!b) return;
    const gy = this.groundY();
    const pulse = 0.5 + 0.5 * Math.sin(now / 360);
    ctx.save();
    if (b.rift) {
      // 🌀 무한 균열: 보라색 시공간 균열 포털 + 회전 룬 링 + 보라 비네트
      const px = W * 0.84;
      const py = gy * 0.54;
      const r = Math.min(W, H) * 0.24;
      const vg = ctx.createRadialGradient(px, py, 6, px, py, W * 0.85);
      vg.addColorStop(0, `rgba(175,110,255,${0.26 + 0.1 * pulse})`);
      vg.addColorStop(0.45, 'rgba(90,40,180,0.12)');
      vg.addColorStop(1, 'rgba(20,8,45,0.34)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      ctx.translate(px, py);
      ctx.rotate(now / 900);
      ctx.strokeStyle = `rgba(210,165,255,${0.55 + 0.25 * pulse})`;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.rotate(-now / 450);
      ctx.strokeStyle = 'rgba(255,120,210,0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.64, 0, Math.PI * 2);
      ctx.stroke();
    } else if (b.raid) {
      // 🐉 v8.16.0 주간 거대 레이드: 심홍-보라 전장 비네트 + 결전 오라
      const vg = ctx.createRadialGradient(W * 0.7, gy * 0.45, 10, W * 0.7, gy * 0.45, W * 0.9);
      vg.addColorStop(0, `rgba(255,75,90,${0.22 + 0.08 * pulse})`);
      vg.addColorStop(0.5, 'rgba(95,25,110,0.14)');
      vg.addColorStop(1, 'rgba(12,6,22,0.36)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    } else if (b.invasion) {
      // 🚨 영지 침공 방어전: 붉은 경보 비네트 + 좌측 성채 성벽 실루엣
      const vg = ctx.createLinearGradient(0, 0, 0, H);
      vg.addColorStop(0, `rgba(220,30,50,${0.22 + 0.12 * pulse})`);
      vg.addColorStop(0.5, 'rgba(120,10,20,0.06)');
      vg.addColorStop(1, 'rgba(20,5,10,0.28)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(18, 22, 34, 0.72)';
      const wallW = Math.min(82, W * 0.22);
      ctx.fillRect(0, gy - 58, wallW, 58);
      for (let i = 0; i < 4; i++) ctx.fillRect(i * (wallW / 4) + 3, gy - 68, wallW / 6, 12);
    } else if (b.dungeon) {
      // 💰 황금 던전: 금빛 광휘 + 황금 안개
      const g = ctx.createRadialGradient(W * 0.7, gy * 0.45, 8, W * 0.7, gy * 0.45, W * 0.75);
      g.addColorStop(0, `rgba(255,210,90,${0.22 + 0.08 * pulse})`);
      g.addColorStop(0.6, 'rgba(255,155,40,0.07)');
      g.addColorStop(1, 'rgba(30,18,5,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else if (b.tower) {
      // 🗼 도전의 탑: 좌우 석조 기둥 실루엣 + 신비한 푸른 안개
      ctx.fillStyle = 'rgba(10, 14, 24, 0.56)';
      const pw = Math.min(26, W * 0.07);
      ctx.fillRect(0, 0, pw, gy);
      ctx.fillRect(W - pw, 0, pw, gy);
      const haze = ctx.createLinearGradient(0, gy - 60, 0, gy + 10);
      haze.addColorStop(0, 'rgba(105,192,255,0)');
      haze.addColorStop(1, `rgba(105,192,255,${0.12 + 0.05 * pulse})`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, gy - 60, W, 70);
    } else if (b.daily) {
      // 🌟 일일 보스: 스포트라이트 광선
      const sp = ctx.createLinearGradient(W * 0.65, 0, W * 0.65, gy);
      sp.addColorStop(0, `rgba(255,220,120,${0.2 + 0.07 * pulse})`);
      sp.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = sp;
      ctx.beginPath();
      ctx.moveTo(W * 0.52, 0);
      ctx.lineTo(W * 0.84, 0);
      ctx.lineTo(W * 0.96, gy);
      ctx.lineTo(W * 0.40, gy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawAtmosphere(ctx, dt, W, H, now) {
    const gy = this.groundY();
    const marching = this.marchUntil > now;
    const spd = marching ? 260 : 18;
    this.scrollX = ((this.scrollX || 0) + (spd * (dt || 16)) / 1000) % 240;

    ctx.save();
    // 1) 지평선 빛줄기(God Ray) 2겹 + 흐르는 지면 안개
    const drift = (now / 45) % (W + 160);
    const ray = ctx.createLinearGradient(0, 0, 0, gy);
    ray.addColorStop(0, 'rgba(255,245,215,0.06)');
    ray.addColorStop(1, 'rgba(255,245,215,0)');
    ctx.fillStyle = ray;
    for (let i = 0; i < 2; i++) {
      const rx = ((drift * (0.4 + i * 0.25) + i * 190) % (W + 160)) - 80;
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx + 46, 0);
      ctx.lineTo(rx - 20, gy);
      ctx.lineTo(rx - 66, gy);
      ctx.closePath();
      ctx.fill();
    }

    // 2) 패럴랙스 지면 자갈·속도선 스크롤
    const seg = 48;
    const off = this.scrollX % seg;
    ctx.fillStyle = marching ? 'rgba(255,245,215,0.22)' : 'rgba(255,255,255,0.08)';
    for (let row = 0; row < 3; row++) {
      const y = gy + 7 + row * ((H - gy - 12) / 3);
      const speedMul = 1 + row * 0.45;
      const rOff = (this.scrollX * speedMul) % seg;
      for (let x = W + seg - rOff; x > -seg; x -= seg) {
        const len = marching ? 16 + row * 6 : 6 + row * 3;
        ctx.fillRect(x, y, len, 1.5);
      }
    }

    // 3) 스테이지 돌파 행군 중 상단 바람결 속도선
    if (marching && this.effects) {
      ctx.strokeStyle = 'rgba(255,245,210,0.26)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 6; i++) {
        const lx = ((W - ((now * 0.75 + i * 97) % (W + 120))) + 60);
        const ly = 26 + ((i * 37) % Math.max(40, gy - 36));
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx - 42, ly);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawAmbient(ctx, dt, W, H) {
    const cfg = this.ambientCfg || { color: 'rgba(255,255,255,0.4)' };
    for (const p of this.ambient) {
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      if (p.y < -10) p.y = H + 10;
      if (p.y > H + 10) p.y = -10;
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      ctx.globalAlpha = p.a;
      ctx.fillStyle = cfg.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ─────────── 🐾 동행 펫 (v8.11.0 아키타입별 자유 모션: 비행 스웁 · 맹수 도약 · 골렘 슬램) ─────────── */
  /** 주인공 뒤(왼쪽)에서 따라다니며, 공격할 때는 펫 유형별 자유 궤적으로 돌격한다. (v5.3: 보조 펫 함께 표시) */
  drawPet(ctx, now, dt) {
    const b = this.battle;
    if (!b) return;
    const sp = b.subPet ? b.subPet() : null;
    if (sp) this.drawSubPet(ctx, now, dt, sp);
    else this.subPetX = null;
    const pet = b.activePet ? b.activePet() : null;
    if (!pet) {
      this.petX = null;
      return;
    }
    const gy = this.groundY();
    const sc = this.scale();
    const heroX = this.heroVisX != null ? this.heroVisX : this.worldX(b.player.x);
    // v4.2: 진화 단계 — 이름·스프라이트·크기·색이 단계마다 달라진다
    const info = petStageInfo(b.s, pet.id);
    const stage = info.stage || 0;
    const petColor = info.color || pet.color;
    const h = Math.min(this.H * 0.3, 78 * sc) * (pet.id === 'dragon' ? 1.08 : 1) * (info.scale || 1);
    const w = h;
    // 화면 왼쪽 밖으로 잘리지 않도록 위치를 보정한다(좁은 390px 화면 대응)
    const home = Math.max(w * 0.5 + 4, heroX - Math.min(76 * sc, w * 0.9));
    const tsec = now / 1000;
    const flyer = pet.id === 'owl' || pet.id === 'dragon' || pet.id === 'hawk';
    const slammer = pet.id === 'golem';
    const sway = flyer ? Math.sin(tsec * 2.1) * 14 * sc : Math.sin(tsec * 1.6) * 8 * sc;
    if (this.petX == null || !isFinite(this.petX)) this.petX = home;
    this.petX += (home - this.petX) * Math.min(1, dt / 150);
    const lungeAge = now - (b.petAnimAt || 0);
    const LUNGE_DUR = 340;
    const lk = lungeAge >= 0 && lungeAge < LUNGE_DUR ? clamp(lungeAge / LUNGE_DUR, 0, 1) : 0;
    const lunge = lk > 0 && lk < 1 ? Math.sin(Math.PI * lk) : 0;

    let near = null;
    for (const m of b.monsters) if (!m.dead && !m.dying && (!near || m.x < near.x)) near = m;
    const targetX = near ? this.worldX(near.x) - 38 * sc : this.petX + 110 * sc;
    const dashDist = clamp(targetX - this.petX, 52 * sc, 160 * sc);

    let lift = flyer ? 20 * sc + Math.sin(tsec * 3.8) * 7 * sc : Math.abs(Math.sin(tsec * 2.6)) * 3 * sc;
    let dx = sway;
    let rot = flyer ? Math.cos(tsec * 2.1) * 0.1 : Math.sin(tsec * 1.6) * 0.03;
    let sx = 1;
    let sy = 1;

    if (lunge > 0) {
      if (flyer) {
        // 비행 펫(올빼미·드래곤·매): 고도 상승 → 적을 향한 대각선 급강하 스웁
        const swoop = Math.sin(Math.PI * Math.pow(lk, 0.8));
        dx += dashDist * swoop;
        lift = Math.max(6 * sc, lift + (lk < 0.35 ? 18 * sc * (lk / 0.35) : -22 * sc * swoop));
        rot += 0.24 * swoop;
        sx = 1 + 0.12 * swoop;
        sy = 1 - 0.08 * swoop;
      } else if (slammer) {
        // 골렘 펫: 포물선 점프 슬램 + 착지 스쿼시
        dx += dashDist * Math.sin(Math.PI * Math.pow(lk, 0.82));
        lift += Math.sin(Math.PI * lk) * 30 * sc;
        if (lk > 0.72) {
          sx = 1.18;
          sy = 0.84;
          if (this.effects && this._petDustAt !== b.petAnimAt) {
            this._petDustAt = b.petAnimAt;
            this.stepDust(this.petX + dx, gy, sc, 4, hexA(petColor, 0.45));
          }
        }
      } else {
        // 맹수 펫(늑대·여우): 민첩한 포물선 도약 덮치기
        dx += dashDist * Math.sin(Math.PI * Math.pow(lk, 0.78));
        lift += Math.sin(Math.PI * lk) * 34 * sc;
        rot += 0.2 * Math.sin(Math.PI * lk);
        sx = 1 + 0.1 * lunge;
        sy = 1 - 0.06 * lunge;
      }
    }

    const x = clamp(this.petX + dx, w * 0.5 + 2, this.W - w * 0.5 - 2);
    const footY = gy - lift;
    const shadowK = 1 - clamp(lift / (h * 1.5), 0, 1) * 0.45;

    // 발밑·몸 주변 글로우(펫 색) — 진화할수록 진하고 넓다
    const auraK = 0.2 + stage * 0.12;
    const gl = ctx.createRadialGradient(x, footY - h * 0.36, 2, x, footY - h * 0.36, h * (0.72 + stage * 0.12));
    gl.addColorStop(0, hexA(petColor, auraK + lunge * 0.22));
    gl.addColorStop(1, hexA(petColor, 0));
    ctx.fillStyle = gl;
    ctx.fillRect(x - h * 1.05, footY - h * 1.3, h * 2.1, h * 1.4);

    // 그림자 (비행/도약 높이에 맞춰 축소)
    ctx.fillStyle = `rgba(0,0,0,${(0.38 * shadowK).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, gy + 2, w * 0.24 * shadowK, w * 0.07 * shadowK, 0, 0, Math.PI * 2);
    ctx.fill();

    // ★ 각성 이상: 회전하는 오라 링(신수는 2중 + 반짝임)
    if (this.effects && stage >= 1) {
      ctx.save();
      const pulse = 0.55 + 0.25 * Math.sin(now / 260);
      for (let i = 0; i < stage; i++) {
        const rr = w * (0.36 + i * 0.07);
        ctx.globalAlpha = pulse * (0.8 - i * 0.2);
        ctx.strokeStyle = hexA(petColor, 0.9);
        ctx.lineWidth = (2.2 - i * 0.5) * sc;
        ctx.beginPath();
        ctx.ellipse(x, footY - h * 0.28 - i * 4 * sc, rr, rr * 0.3, Math.sin(now / 900 + i) * 0.12, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    const img = this.image(info.sprite || pet.sprite) || this.image(pet.sprite);
    ctx.save();
    ctx.translate(x, footY);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    if (img) {
      ctx.drawImage(img, -w / 2, -h, w, h);
    } else {
      ctx.fillStyle = petColor || '#9fc6ff';
      ctx.beginPath();
      ctx.arc(0, -h * 0.4, w * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 동행 이름표(+진화 단계 배지)
    if (this.effects) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.font = `800 ${Math.round(9 * Math.max(0.85, sc))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = hexA(petColor, 0.95);
      const badge = stage >= 2 ? '★★ ' : stage >= 1 ? '★ ' : '';
      const label = `${pet.emoji || ''} ${badge}${info.name || pet.name}`.trim();
      const tw = ctx.measureText(label).width || 0;
      ctx.fillText(label, Math.max(tw / 2 + 3, x), footY - h - 3);
      ctx.restore();
    }
  }

  /** v5.3/v8.11.0 보조 펫 렌더 — 주 펫 뒤쪽 위에서 아키타입별 자유 동행 */
  drawSubPet(ctx, now, dt, pet) {
    const b = this.battle;
    const gy = this.groundY() - 10 * this.scale();
    const sc = this.scale();
    const heroX = this.heroVisX != null ? this.heroVisX : this.worldX(b.player.x);
    const info = petStageInfo(b.s, pet.id);
    const petColor = info.color || pet.color;
    const h = Math.min(this.H * 0.24, 60 * sc) * (info.scale || 1) * 0.82;
    const w = h;
    const home = Math.max(w * 0.5 + 2, heroX - Math.min(118 * sc, w * 1.65));
    const tsec = now / 1000;
    const flyer = pet.id === 'owl' || pet.id === 'dragon' || pet.id === 'hawk';
    const sway = Math.sin(tsec * 1.8 + 1.1) * (flyer ? 10 : 6) * sc;
    if (this.subPetX == null || !isFinite(this.subPetX)) this.subPetX = home;
    this.subPetX += (home - this.subPetX) * Math.min(1, dt / 170);
    const lungeAge = now - (b.subPetAnimAt || 0);
    const lk = lungeAge >= 0 && lungeAge < 290 ? clamp(lungeAge / 290, 0, 1) : 0;
    const lunge = lk > 0 && lk < 1 ? Math.sin(Math.PI * lk) : 0;
    const x = clamp(this.subPetX + sway + lunge * 76 * sc, w * 0.5 + 2, this.W - w * 0.5 - 2);
    const lift = (flyer ? 16 * sc + Math.sin(tsec * 3.4 + 2.1) * 6 * sc : Math.abs(Math.sin(tsec * 2.5 + 1)) * 3 * sc) + lunge * 22 * sc;
    const shadowK = 1 - clamp(lift / (h * 1.5), 0, 1) * 0.4;

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = `rgba(0,0,0,${(0.28 * shadowK).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, gy + 2, w * 0.22 * shadowK, w * 0.06 * shadowK, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(x, gy - lift);
    ctx.rotate(lunge * 0.18 + (flyer ? Math.cos(tsec * 1.8) * 0.08 : 0));
    const img = this.image(info.sprite || pet.sprite) || this.image(pet.sprite);
    if (img) ctx.drawImage(img, -w / 2, -h, w, h);
    else {
      ctx.fillStyle = petColor || '#9fc6ff';
      ctx.beginPath();
      ctx.arc(0, -h * 0.4, w * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ─────────── 플레이어 (v8.12.0 연속 교전 콤보 · 물리 관성 · 크로스페이드 · 리본 검기) ─────────── */
  drawPlayer(ctx, now, dt) {
    const b = this.battle;
    const p = b.player;
    const gy = this.groundY();
    const sc = this.scale();
    const h = Math.min(this.H * 0.4, 100 * sc);
    const w = h;
    const baseX = this.worldX(p.x);

    const atkAge = now - (p.attackAt || 0);
    const skAge = now - (p.skillAt || 0);
    const ATK_DUR = 320;
    const COMBO_HOLD = 760; // 타격 사이 공백에도 잔심 유지 → 원점 요요 없이 연속 콤보 연결
    const SK_DUR = 520;
    const attacking = atkAge >= 0 && atkAge < ATK_DUR;
    const inComboHold = atkAge >= ATK_DUR && atkAge < COMBO_HOLD;
    const skilling = skAge >= 0 && skAge < SK_DUR;
    const atkK = clamp(atkAge / ATK_DUR, 0, 1);
    const holdK = inComboHold ? clamp((atkAge - ATK_DUR) / (COMBO_HOLD - ATK_DUR), 0, 1) : 0;
    const skK = clamp(skAge / SK_DUR, 0, 1);
    const dead = p.dead;
    const hurtAge = now - (p.hurtAt || 0);
    const hurt = hurtAge >= 0 && hurtAge < 150;
    const recoilK = hurtAge >= 0 && hurtAge < 220 ? Math.sin(Math.PI * clamp(hurtAge / 220, 0, 1)) : 0;

    // 살아있는 가장 가까운 적 기준 교전 위치(engageX) 유지 — 매 타격마다 원점으로 돌아가지 않음!
    let near = null;
    for (const m of b.monsters) if (!m.dead && !m.dying && (!near || m.x < near.x)) near = m;
    const hasEnemy = !!near && !dead;
    const targetWorldX = near ? near.x : Number.isFinite(p.targetX) ? p.targetX : p.x + 260;
    const targetScreenX = this.worldX(targetWorldX);
    const targetLane = near ? (near.lane || 0) : (p.targetLane || 0);
    const standDist = near && near.isBoss ? 86 * sc : 60 * sc;
    const engageX = hasEnemy
      ? clamp(targetScreenX - standDist, baseX + 10 * sc, this.W - 68 * sc)
      : baseX;
    const engageY = hasEnemy ? targetLane * 17 * sc : 0;
    const gap = clamp(targetScreenX - baseX - 52 * sc, 28 * sc, Math.min(this.W * 0.44, 235 * sc));

    const marching = this.marchUntil > now;
    const marchBob = marching ? -Math.abs(Math.sin(now / 75)) * 7 * sc : 0;
    const combo = (p.attackSeq || 0) % 4;
    const skKey = p.skillKey || '';

    // 기본 목표: 적이 있으면 교전선 앞을 유기적으로 선회 유지, 없으면 원점 복귀
    let goalX = engageX + (dead ? 0 : Math.sin(now / 480) * 6 * sc);
    let goalY = engageY + (dead ? 0 : Math.sin(now / 620) * 3 * sc);
    let lift = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    let flipX = 1;
    let frame = 'hero_idle';
    let slashStyle = 'down';
    let instantSnap = false;
    let trackSword = false;
    let swordAngle = 0;

    if (!dead && skilling) {
      const sArc = Math.sin(Math.PI * skK);
      trackSword = skK > 0.1 && skK < 0.78;
      if (skKey === 'execute') {
        // 그림자 처형: 적 등 뒤로 순간이동 후 역방향 베기 → 교전선 복귀
        if (skK < 0.72) {
          goalX = clamp(targetScreenX + 46 * sc, baseX + 64 * sc, this.W - 34 * sc);
          goalY = targetLane * 18 * sc;
          flipX = -1;
          frame = skK < 0.42 ? 'hero_dash' : 'hero_attack2';
          lift = Math.sin(Math.PI * (skK / 0.72)) * 18 * sc;
          rot = -0.14 * sArc;
          sx = 1 + 0.12 * sArc;
          sy = 1 - 0.08 * sArc;
          swordAngle = lerp(-1.4, 1.1, skK / 0.72);
          if (skK < 0.14) instantSnap = true;
        } else {
          frame = 'hero_run';
          lift = Math.sin(Math.PI * ((skK - 0.72) / 0.28)) * 18 * sc;
        }
        slashStyle = 'thrust';
      } else if (skKey === 'whirl' || skKey === 'vampstrike') {
        // 회오리/흡혈 검무: 적진 한가운데를 가로지르며 회전 베기
        goalX = lerp(engageX, clamp(targetScreenX + 26 * sc, engageX + 24 * sc, this.W - 44 * sc), sArc);
        goalY = engageY + Math.sin(skK * Math.PI * 2) * 16 * sc;
        lift = sArc * 16 * sc;
        rot = Math.sin(skK * Math.PI * 4) * 0.34;
        flipX = Math.cos(skK * Math.PI * 4) >= 0 ? 1 : -1;
        sx = 1 + 0.1 * sArc;
        sy = 1 - 0.06 * sArc;
        frame = skK < 0.5 ? 'hero_dash' : 'hero_skill';
        swordAngle = skK * Math.PI * 4;
        slashStyle = 'whirl';
      } else if (skKey === 'meteor' || skKey === 'frostnova' || skKey === 'thunder' || skKey === 'ultimate') {
        // 마법/궁극기: 공중 도약 부유 시전 + 마력 해방
        goalX = engageX - sArc * 18 * sc;
        lift = Math.sin(Math.PI * Math.pow(skK, 0.8)) * (skKey === 'ultimate' ? 54 : 40) * sc;
        rot = -0.1 * Math.sin(skK * Math.PI * 2);
        sx = 1 - 0.05 * sArc;
        sy = 1 + 0.08 * sArc;
        frame = skK < 0.32 ? 'hero_jump' : 'hero_skill';
        swordAngle = -1.2 + skK * 2.1;
        slashStyle = 'up';
      } else if (skKey === 'strike') {
        // 강격: 공중 고도약 → 적 정면 강타
        goalX = engageX + sArc * 30 * sc;
        goalY = engageY;
        lift = Math.sin(Math.PI * Math.min(1, skK * 1.15)) * 56 * sc;
        rot = lerp(-0.24, 0.24, skK);
        if (skK > 0.72) { sx = 1.16; sy = 0.84; }
        frame = skK < 0.55 ? 'hero_jump' : 'hero_attack';
        swordAngle = lerp(-1.8, 0.9, skK);
        slashStyle = 'plunge';
      } else {
        lift = sArc * 18 * sc;
        sx = 1 + 0.07 * sArc;
        sy = 1 + 0.07 * sArc;
        frame = 'hero_skill';
        trackSword = false;
      }
    } else if (!dead && attacking) {
      // 3단계 페이즈: 0~16% 예비동작(Anticipation) → 16~64% 타격 스냅 → 64~100% 잔심
      const ant = atkK < 0.16 ? atkK / 0.16 : 0;
      const snap = atkK >= 0.16 ? clamp((atkK - 0.16) / 0.52, 0, 1) : 0;
      const aArc = Math.sin(Math.PI * atkK);
      trackSword = atkK >= 0.12 && atkK <= 0.78;
      if (combo === 0) {
        // 1타: 교전선 밀착 내려베기 (hero_attack)
        goalX = engageX + (ant > 0 ? -10 * sc * ant : easeOut(snap) * 18 * sc);
        goalY = engageY;
        lift = aArc * 8 * sc;
        rot = ant > 0 ? -0.1 * ant : lerp(-0.08, 0.14, snap);
        sx = ant > 0 ? 0.93 : 1 + 0.08 * aArc;
        sy = ant > 0 ? 1.07 : 1 - 0.06 * aArc;
        frame = 'hero_attack';
        slashStyle = 'down';
        swordAngle = lerp(-1.45, 0.75, easeOut(snap));
      } else if (combo === 1) {
        // 2타: 1타 잔심에서 이어지는 도약 상단 올려베기 (hero_attack2)
        goalX = engageX + 12 * sc + (ant > 0 ? -8 * sc * ant : easeOut(snap) * 14 * sc);
        goalY = engageY - 4 * sc * aArc;
        lift = Math.sin(Math.PI * Math.pow(atkK, 0.78)) * 30 * sc;
        rot = ant > 0 ? 0.12 * ant : -0.15 * aArc;
        sx = 1 - 0.05 * aArc;
        sy = 1 + 0.09 * aArc;
        frame = 'hero_attack2';
        slashStyle = 'up';
        swordAngle = lerp(0.85, -1.35, easeOut(snap));
      } else if (combo === 2) {
        // 3타: 공중 회전 점프 강타 (hero_jump)
        goalX = engageX + 8 * sc + easeOut(snap) * 26 * sc;
        goalY = engageY;
        lift = Math.sin(Math.PI * Math.min(1, atkK * 1.15)) * 52 * sc;
        rot = lerp(-0.22, 0.24, atkK);
        if (atkK > 0.74) {
          sx = 1.16;
          sy = 0.84;
          if (this._heroMotionSeq !== p.attackSeq) {
            this._heroMotionSeq = p.attackSeq;
            this.stepDust(this.heroVisX || goalX, gy + goalY, sc, 5, 'rgba(235,240,255,0.52)');
          }
        }
        frame = 'hero_jump';
        slashStyle = 'plunge';
        swordAngle = lerp(-1.85, 0.85, easeOut(snap));
      } else {
        // 4타: 적을 관통해 등 뒤로 돌파 후 역방향 턴! (hero_dash)
        const crossX = clamp(targetScreenX + 34 * sc, engageX + 36 * sc, this.W - 36 * sc);
        goalX = ant > 0 ? engageX - 10 * sc * ant : lerp(engageX, crossX, easeOut(snap));
        goalY = engageY + Math.sin(Math.PI * atkK) * 8 * sc;
        lift = aArc * 9 * sc;
        rot = 0.07 * aArc;
        sx = 1 + 0.14 * aArc;
        sy = 1 - 0.09 * aArc;
        flipX = atkK > 0.76 ? -1 : 1; // 돌파 끝에서 적 쪽으로 돌아봄
        frame = 'hero_dash';
        slashStyle = 'thrust';
        swordAngle = 0;
        if (this.effects && atkK > 0.18 && this._heroMotionSeq !== p.attackSeq) {
          this._heroMotionSeq = p.attackSeq;
          this.stepDust(this.heroVisX || engageX, gy + engageY, sc, 4, 'rgba(180,235,255,0.48)');
          this.afterimages.push({
            x: lerp(engageX, crossX, 0.35),
            y: engageY,
            t0: now,
            dur: 210,
            color: '#7ff6ff',
            frame: 'hero_dash',
          });
          this.afterimages.push({
            x: lerp(engageX, crossX, 0.72),
            y: engageY,
            t0: now + 24,
            dur: 210,
            color: '#ffd76a',
            frame: 'hero_dash',
          });
        }
      }
    } else if (!dead && inComboHold && hasEnemy) {
      // 잔심(Follow-through): 다음 타격 전까지 원점으로 돌아가지 않고 직전 공격 끝자세에서 호흡 유지!
      const easeBack = easeOut(holdK);
      if (combo === 3) {
        // 4타 관통 뒤 적 뒤에서 돌아보며 교전선으로 매끄럽게 복귀
        const crossX = clamp(targetScreenX + 30 * sc, engageX + 32 * sc, this.W - 36 * sc);
        goalX = lerp(crossX, engageX, easeBack);
        flipX = holdK < 0.45 ? -1 : 1;
        frame = holdK < 0.38 ? 'hero_dash' : 'hero_run';
      } else {
        goalX = engageX + (1 - easeBack) * 12 * sc;
        frame = combo === 1 ? 'hero_attack2' : combo === 2 ? 'hero_attack' : 'hero_attack';
        rot = (1 - easeBack) * (combo === 1 ? -0.06 : 0.06);
      }
      const breath = Math.sin(now / 220);
      sy = 1 + 0.025 * breath;
      sx = 1 - 0.018 * breath;
    } else if (!dead) {
      // 비전투/추격 대기: 행군 중이면 달리기 포즈
      const breath = Math.sin(now / 280);
      sy = 1 + 0.026 * breath;
      sx = 1 - 0.018 * breath;
      rot = Math.sin(now / 520) * 0.028;
      if (marching) frame = 'hero_run';
    }

    // 피격 시 반동 백스텝
    if (!dead && recoilK > 0 && !skilling) {
      goalX -= recoilK * 16 * sc;
      lift += recoilK * 7 * sc;
      rot -= 0.14 * recoilK;
    }

    // 스프링 물리 보간 + 실제 이동 속도(heroVx, heroVy) 계산
    const safeDt = Math.max(1, Math.min(80, dt || 16));
    const dtSec = safeDt / 1000;
    const lerpRate = instantSnap ? 1 : 1 - Math.exp(-safeDt / 46);
    if (this.heroVisX == null || !Number.isFinite(this.heroVisX)) this.heroVisX = baseX;
    const prevX = this.heroVisX;
    const prevY = this.heroVisY;
    this.heroVisX += (goalX - this.heroVisX) * lerpRate;
    this.heroVisY += (goalY - this.heroVisY) * lerpRate;
    this.heroVx = (this.heroVisX - prevX) / dtSec;
    this.heroVy = (this.heroVisY - prevY) / dtSec;

    // 빠른 추격/이동 중에는 자동으로 hero_run 추격 달리기 포즈 + 발걸음 먼지!
    const speedX = Math.abs(this.heroVx);
    if (!dead && !attacking && !skilling && speedX > 65 * sc) {
      frame = 'hero_run';
      flipX = this.heroVx < -25 * sc ? -1 : 1;
      lift += Math.abs(Math.sin(now / 65)) * 6 * sc;
      if (this.effects && now - (this._runDustAt || 0) > 110) {
        this._runDustAt = now;
        this.stepDust(this.heroVisX - flipX * 12 * sc, gy + this.heroVisY, sc, 2, 'rgba(220,230,245,0.42)');
      }
    }
    // 실제 속도 기반 관성 기울기 자동 가산
    rot += clamp(this.heroVx / 1400, -0.14, 0.14) * flipX;

    // 포즈 전환 75ms 크로스페이드(모션 블러 잔상) 기록
    if (frame !== this._heroFrame) {
      this._prevHeroFrame = this._heroFrame;
      this._heroFrameAt = now;
      this._heroFrame = frame;
    }

    const px = clamp(this.heroVisX, w * 0.35, this.W - w * 0.35);
    const pyOff = this.heroVisY;
    const groundAtHero = gy + pyOff;
    const bob = (attacking || skilling || frame === 'hero_run' ? 0 : Math.sin(now / 320) * 2.2 * sc) + marchBob;
    const shadowK = 1 - clamp(lift / (h * 1.45), 0, 1) * 0.48;

    // 연속 리본 검기 궤적 포인트 기록 (실제 칼끝 위치 추적)
    if (this.effects && trackSword && !dead) {
      const pal = this._rar.pal || (RARITIES[this._rar.weapon] || RARITIES[0]).slash;
      const rTip = h * 0.62;
      const tipX = px + Math.cos(swordAngle) * rTip * flipX + 10 * sc * flipX;
      const tipY = groundAtHero - lift - h * 0.48 + Math.sin(swordAngle) * rTip * 0.72;
      this.swordTrail.push({
        x: tipX,
        y: tipY,
        t: now,
        color: (pal && pal.mid) || '#ffd76a',
        glow: (pal && (pal.glow || pal.outer)) || '#ffb347',
        core: (pal && pal.core) || '#fff7dc',
        kind: (this._rar && this._rar.setFx && this._rar.setFx.kind) || '',
      });
      if (this.swordTrail.length > 18) this.swordTrail.shift();
    }

    // 그림자 (점프 높이에 맞춰 축소·연해짐)
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${(0.45 * shadowK).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(px, groundAtHero + 2, w * 0.3 * shadowK, w * 0.085 * shadowK, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // v4.4 전직 오라 (칭호 색) → v7.3 영웅 진화 외형(망토·날개·소드 비트) → 장비 등급 오라
    if (this.effects && !dead) this.drawJobAura(ctx, px, groundAtHero, h, sc, now);
    if (this.effects && !dead) this.drawHeroEvolution(ctx, px, groundAtHero - lift * 0.65, h, sc, now);
    // 장비 등급 오라 (발밑·주변 색)
    if (this.effects && !dead) this.drawAura(ctx, px, groundAtHero, h, sc, now);
    // v4.3 부활 가호 — 빛 고리·보호막 + 머리 위 남은 초
    if (!dead && p.graceUntil && now < p.graceUntil) this.drawGrace(ctx, px, groundAtHero - lift * 0.5, h, sc, now, p.graceUntil);
    // v5.10 성광 보호막 돔
    if (!dead && p.shield > 0 && p.shieldUntil && now < p.shieldUntil) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 227, 138, 0.72)';
      ctx.fillStyle = 'rgba(255, 227, 138, 0.10)';
      ctx.lineWidth = Math.max(1.5, 2 * sc);
      ctx.beginPath();
      ctx.arc(px, groundAtHero - lift - h * 0.45, h * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 광폭 아우라
    if (b.berserkUntil > now) {
      const a = 0.2 + Math.sin(now / 90) * 0.08;
      const grd = ctx.createRadialGradient(px, groundAtHero - lift - h * 0.42, 4, px, groundAtHero - lift - h * 0.42, h * 0.8);
      grd.addColorStop(0, `rgba(255,110,70,${a})`);
      grd.addColorStop(1, 'rgba(255,110,70,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(px - h, groundAtHero - lift - h * 1.2, h * 2, h * 1.3);
    }

    // 공중 시전 마법진 (메테오·절대영도·뇌전·궁극기)
    if (this.effects && !dead && skilling && lift > 16 * sc && (skKey === 'meteor' || skKey === 'frostnova' || skKey === 'thunder' || skKey === 'ultimate')) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = skKey === 'frostnova' ? 'rgba(155,231,255,0.72)' : skKey === 'thunder' ? 'rgba(127,246,255,0.75)' : 'rgba(255,195,95,0.75)';
      ctx.lineWidth = 2 * sc;
      ctx.beginPath();
      ctx.ellipse(px, groundAtHero - lift * 0.35, h * 0.44 * Math.sin(Math.PI * skK), h * 0.13 * Math.sin(Math.PI * skK), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 이전 포즈 75ms 크로스페이드 블러 (컷 전환 제거)
    const blendAge = now - (this._heroFrameAt || 0);
    if (this.effects && !dead && this._prevHeroFrame && blendAge >= 0 && blendAge < 75) {
      const prevImg = this.image(this._prevHeroFrame);
      if (prevImg) {
        ctx.save();
        ctx.globalAlpha = 0.42 * (1 - blendAge / 75);
        ctx.translate(px - clamp(this.heroVx * 0.02, -16 * sc, 16 * sc), groundAtHero - lift + bob);
        ctx.rotate(rot * 0.6);
        ctx.scale(flipX * sx, sy);
        ctx.drawImage(prevImg, -w / 2, -h, w, h);
        ctx.restore();
      }
    }

    const img = this.image(frame) || this.image(skilling ? 'hero_skill' : attacking ? 'hero_attack' : 'hero_idle');

    ctx.save();
    ctx.translate(px, groundAtHero - lift + bob);
    if (dead) {
      ctx.globalAlpha = 0.35;
      ctx.rotate(0.5);
    } else if (hurt) {
      ctx.globalAlpha = 0.86;
    }
    ctx.rotate(rot);
    ctx.scale(flipX * sx, sy);
    if (img) {
      ctx.drawImage(img, -w / 2, -h, w, h);
      if (hurt) {
        const white = this.whiteOf(frame, img);
        if (white) {
          ctx.globalAlpha = 0.55;
          ctx.drawImage(white, -w / 2, -h, w, h);
          ctx.globalAlpha = 0.9;
        }
      }
    } else {
      ctx.fillStyle = '#8ea2bb';
      ctx.fillRect(-w / 2 + w * 0.2, -h * 0.85, w * 0.6, h * 0.8);
    }
    ctx.restore();

    // ── 검기 아크 ──
    if (this.effects && (attacking || (skilling && (skKey === 'strike' || skKey === 'whirl' || skKey === 'execute' || skKey === 'vampstrike')))) {
      const kEff = attacking ? atkK : skK;
      const reach = near ? Math.max(30 * sc, Math.abs(this.worldX(near.x) - px)) : 62 * sc;
      const wIdx = this._rar.weapon;
      const pal = this._rar.pal || (RARITIES[wIdx] || RARITIES[0]).slash;
      this.drawSlash(ctx, px, groundAtHero - lift * 0.65, h, sc, kEff, p.attackKind, Math.min(reach * 0.95, 176 * sc), pal, wIdx, slashStyle, flipX);
    }
  }

  /** v8.12.0 연속 리본 검기 궤적 — 칼끝 이동 경로를 매끄럽게 이어 모션 연결감 극대화 */
  drawSwordTrail(ctx, now) {
    if (!this.swordTrail || this.swordTrail.length < 2) return;
    const LIFE = 200;
    this.swordTrail = this.swordTrail.filter((pt) => now - pt.t < LIFE);
    const pts = this.swordTrail;
    if (pts.length < 2) return;
    const sc = this.scale();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 150 * sc) continue;
      const k = i / (pts.length - 1);
      const fade = clamp(1 - (now - p1.t) / LIFE, 0, 1);
      ctx.globalAlpha = fade * k * 0.45;
      ctx.strokeStyle = p1.glow;
      ctx.lineWidth = (3 + 12 * k) * sc * fade;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();

      ctx.globalAlpha = fade * k * 0.9;
      ctx.strokeStyle = p1.core;
      ctx.lineWidth = (1.2 + 3.6 * k) * sc * fade;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();

      // v8.14.0 테마 세트별 검기 끝 특수 글린트(얼음 결정·별·번개 틱)
      if (p1.kind && i === pts.length - 1 && fade > 0.35) {
        ctx.globalAlpha = fade * 0.85;
        ctx.fillStyle = p1.color;
        const gs = 4.5 * sc * fade;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y - gs);
        ctx.lineTo(p1.x + gs * 0.7, p1.y);
        ctx.lineTo(p1.x, p1.y + gs);
        ctx.lineTo(p1.x - gs * 0.7, p1.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ─────────── 🛡 v4.3 부활 가호 — 보호막 · 빛 고리 · 마법진 ─────────── */
  drawGrace(ctx, px, gy, h, sc, now, until) {
    const total = ECON.reviveGraceMs || 3500;
    const k = clamp((until - now) / total, 0, 1); // 1 → 0 (남은 비율)
    const pulse = 0.6 + 0.4 * Math.sin(now / 150);
    const cx = px;
    const cy = gy - h * 0.5;
    const rr = h * 0.66;
    ctx.save();
    // 1) 돔 형태의 보호막 — 위는 옅고 테두리로 갈수록 밝다
    const g = ctx.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr);
    g.addColorStop(0, 'rgba(150,220,255,0.04)');
    g.addColorStop(0.62, `rgba(140,215,255,${0.1 + 0.06 * pulse})`);
    g.addColorStop(0.92, `rgba(200,240,255,${0.26 + 0.1 * pulse})`);
    g.addColorStop(1, 'rgba(200,240,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rr * 0.82, rr, 0, 0, Math.PI * 2);
    ctx.fill();
    // 2) 몸을 감싸 돌아가는 빛 고리 2줄
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const rot = now / (520 + i * 260) + i * 1.7;
      const ry = cy + (i === 0 ? -h * 0.12 : h * 0.16);
      ctx.strokeStyle = `rgba(190,235,255,${(0.5 - i * 0.14) * (0.6 + 0.4 * k)})`;
      ctx.lineWidth = (2.2 - i * 0.6) * sc;
      ctx.beginPath();
      ctx.ellipse(cx, ry, rr * (0.62 + i * 0.14), rr * (0.2 + i * 0.05), Math.sin(rot) * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 3) 발밑 마법진 — 원 + 회전하는 육각
    const fy = gy + 2;
    ctx.strokeStyle = `rgba(160,230,255,${0.55 * (0.45 + 0.55 * k)})`;
    ctx.lineWidth = 1.6 * sc;
    ctx.beginPath();
    ctx.ellipse(cx, fy, h * 0.42, h * 0.14, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + now / 1400;
      const x = cx + Math.cos(a) * h * 0.34;
      const y = fy + Math.sin(a) * h * 0.34 * 0.34;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // 4) 머리 위 방패 + 남은 초
    const left = Math.max(0, (until - now) / 1000);
    const label = `🛡 ${left.toFixed(1)}s`;
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(10 * Math.max(0.9, sc))}px ${FONT}`;
    const ly = cy - rr * 1.0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(6,20,34,0.85)';
    ctx.strokeText(label, cx, ly);
    ctx.fillStyle = `rgba(222,246,255,${0.78 + 0.22 * pulse})`;
    ctx.fillText(label, cx, ly);
    ctx.restore();
  }

  drawSlash(ctx, px, gy, h, sc, k, kind, rIn, pal, rarityIdx = 0, style = 'down', flipX = 1) {
    const cx = px + h * 0.1 * flipX;
    const cy = gy - h * 0.56;
    const r = Math.max(26 * sc, rIn || h * 0.52);
    const fade = 1 - k;
    const alpha = fade * (kind === 'whirl' ? 0.78 : 0.95);
    const core = kind === 'strike' ? '#ffe9a8' : (pal && pal.core) || '#fff3cf';
    const mid = kind === 'strike' ? '#ffc94d' : (pal && pal.mid) || '#ffd76a';
    const glow = kind === 'strike' ? '#ffb347' : (pal && pal.glow) || '#ffb347';
    ctx.save();
    ctx.lineCap = 'round';
    if (style === 'thrust') {
      // 고속 돌진 찌르기: 관통 검기 + 전방 충격파
      const len = lerp(r * 0.35, r * 1.45, easeOut(k)) * flipX;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.45;
      ctx.strokeStyle = glow;
      ctx.lineWidth = 22 * sc * fade;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + len, cy);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = mid;
      ctx.lineWidth = 9 * sc * fade;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + len, cy);
      ctx.stroke();
      ctx.strokeStyle = core;
      ctx.lineWidth = 3.5 * sc;
      ctx.beginPath();
      ctx.moveTo(cx + len * 0.15, cy);
      ctx.lineTo(cx + len, cy);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (style === 'whirl') {
      // 회오리 검무: 360도 쌍검기 궤적
      const rot0 = k * Math.PI * 3.2;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) {
        const a0 = rot0 + i * Math.PI;
        ctx.globalAlpha = alpha * 0.42;
        ctx.strokeStyle = glow;
        ctx.lineWidth = 18 * sc * fade;
        ctx.beginPath();
        ctx.ellipse(px, cy, r * 0.85, r * 0.34, 0, a0, a0 + 2.1);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = core;
        ctx.lineWidth = 4 * sc;
        ctx.beginPath();
        ctx.ellipse(px, cy, r * 0.85, r * 0.34, 0, a0, a0 + 1.9);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    const anticlock = style === 'up';
    const start = style === 'up' ? 0.85 : style === 'plunge' ? -1.75 : -1.25;
    const sweep = lerp(0.25, style === 'plunge' ? 2.25 : 1.85, easeOut(k)) * (anticlock ? -1 : 1);
    const drawArc = () => {
      ctx.save();
      ctx.translate(cx, cy);
      if (flipX < 0) ctx.scale(-1, 1);
      ctx.beginPath();
      ctx.arc(0, 0, r, start, start + sweep, anticlock);
      ctx.stroke();
      ctx.restore();
    };
    // 전설: 불타는 외곽 광휘
    if (rarityIdx >= 4 && kind !== 'strike') {
      ctx.globalAlpha = alpha * 0.42;
      ctx.strokeStyle = '#ff3b2f';
      ctx.lineWidth = 26 * sc * fade;
      drawArc();
    }
    // 바깥 글로우
    ctx.globalAlpha = alpha * (0.35 + rarityIdx * 0.05);
    ctx.strokeStyle = glow;
    ctx.lineWidth = 20 * sc * fade;
    drawArc();
    // 본체
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = mid;
    ctx.lineWidth = 9 * sc * fade;
    drawArc();
    // 코어
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = core;
    ctx.lineWidth = 3.5 * sc;
    drawArc();
    ctx.restore();
  }

  /* ─────────── 몬스터 (v3.7 이동·공격·피격 모션) ───────────
   * 스프라이트는 1장이지만, 종류별 움직임 문법(슬라임 도약 / 비행 호버 / 보행 걸음)과
   * 전조 → 돌진 → 타격 → 피격 → 사망의 5단계 변형으로 '살아 움직이는' 느낌을 만든다.
   */
  drawMonsters(ctx, now, dt) {
    const b = this.battle;
    const gy = this.groundY();
    const sc = this.scale();
    // v3.8 다굴: 무리가 많을수록 스프라이트를 조금씩 줄여 화면에 겹쳐 쌓이게 한다.
    const crowd = b.monsters.filter((m) => !m.dead && !m.dying && !m.isBoss).length;
    const crowdK = crowd <= 2 ? 1 : Math.max(0.56, 1 - (crowd - 2) * 0.068);
    // 뒤 레인 → 앞 레인 순으로 그려야 앞쪽 몬스터가 위로 올라온다.
    const list = b.monsters
      .filter((m) => Number.isFinite(m.x))
      .slice()
      .sort((a, c) => (a.lane || 0) - (c.lane || 0) || a.x - c.x);
    for (const m of list) {
      const arch = m.arch || monsterMotion(m.name);
      const atkDef = monsterAttack(m.name);
      const color = m.atkColor || atkDef.color || '#ffd166';
      const knock = Number.isFinite(m.knock) ? m.knock : 0;
      const x = this.worldX(m.x + knock);
      const lungeAge = now - (m.lungeAt || 0);
      const LUNGE_DUR = m.isBoss ? 400 : 340;
      const lk = lungeAge >= 0 && lungeAge < LUNGE_DUR ? clamp(lungeAge / LUNGE_DUR, 0, 1) : 0;
      const lunge = lk > 0 && lk < 1 ? Math.sin(Math.PI * lk) : 0;
      const lane = m.isBoss ? 0 : (m.lane || 0);
      // v7.1.0 2.5D 원근 깊이: 뒤 레인(0.88x)·중간(1.0x)·앞 레인(1.10x) + 넓은 Y 분리
      const depthScale = lane < 0 ? 0.88 : lane > 0 ? 1.1 : 1;
      const laneAlpha = lane < 0 ? 0.9 : 1;
      let h = (m.isBoss ? 168 : 84 * crowdK) * sc * (m.isBoss ? 1 : m.scale * depthScale);
      h = Math.min(h, this.H * (m.isBoss ? 0.62 : 0.38));
      const w = h;
      const depth = (lane * 25 + ((m.id % 3) - 1) * 3) * sc;
      const hitAge = now - (m.hitAt || 0);
      const hitK = hitAge >= 0 && hitAge < 150 ? 1 - hitAge / 150 : 0;
      const pop = 1 + hitK * 0.08;

      // 이동 상태(정지하면 걸음 모션이 부드럽게 멈춘다)
      const moving = !!m.moving;
      const moveK = (m.__moveK = (m.__moveK || 0) + ((moving ? 1 : 0) - (m.__moveK || 0)) * Math.min(1, dt / 140));
      const walk = Number.isFinite(m.walk) ? m.walk : 0;
      const tsec = now / 1000;
      const seed = m.animSeed || 0;
      const mKind = m.moveKind || atkDef.move || 'claw';
      const heroX = this.heroVisX != null ? this.heroVisX : this.worldX(b.player.x);
      const atkReach = clamp((x - heroX) * 0.52, (m.isBoss ? 68 : 46) * sc, (m.isBoss ? 142 : 108) * sc);

      let lift = 0;         // 화면 위로 떠오르는 높이(px)
      let dx = 0;           // 좌우 오프셋(px)
      let dyWeave = 0;      // v8.7.0 상하 레인 위빙 오프셋(px)
      let sx = 1;           // 가로 신축(스쿼시 & 스트레치)
      let sy = 1;           // 세로 신축
      let rot = 0;          // 발끝 기준 기울기
      let shadowK = 1;      // 그림자 크기 배율
      let shadowA = 0.4;

      if (arch === 'slime') {
        // 통통 튀는 도약 — 착지 순간 가로로 퍼지는 스쿼시, 그림자 크기 연동
        const HOP = 92;
        const ph = (walk % HOP) / HOP;
        if (moveK > 0.02) {
          const hop = Math.sin(Math.PI * ph);
          const land = Math.max(0, 1 - Math.min(ph, 1 - ph) / 0.16);
          lift = hop * h * 0.34 * moveK;
          sx *= 1 + (0.22 * land - 0.07 * hop) * moveK;
          sy *= 1 - (0.22 * land - 0.06 * hop) * moveK;
          shadowK *= 1 - hop * 0.45 * moveK;
          shadowA *= 1 - hop * 0.35 * moveK;
          if (this.effects && moveK > 0.4 && m.__ph != null && ph < m.__ph - 0.5) {
            this.stepDust(x, gy + depth, sc, 3, 'rgba(225,230,240,0.4)');
          }
          m.__ph = ph;
        } else {
          // 대기 중에도 젤리 탄성 미니 홉 & 좌우 출렁임
          const j = Math.sin(tsec * 2.1 + seed);
          const miniHop = Math.max(0, Math.sin(tsec * 2.8 + seed) - 0.65) / 0.35;
          lift += miniHop * h * 0.14;
          dx += Math.sin(tsec * 1.45 + seed) * 7.5 * sc;
          dyWeave += Math.cos(tsec * 1.15 + seed) * 3.5 * sc;
          sy *= 1 + 0.065 * j + 0.08 * miniHop;
          sx *= 1 - 0.055 * j - 0.06 * miniHop;
        }
      } else if (arch === 'flyer') {
        // 공중 8자 선회 비행(Lissajous) + 역동적 날갯짓 + 롤링 기울기
        const flap = Math.sin(tsec * 10.2 + seed);
        lift = h * 0.18 + Math.sin(tsec * 2.7 + seed) * h * 0.075 + flap * h * 0.018;
        sx *= 1 + 0.045 * flap;
        sy *= 1 - 0.036 * flap;
        dx += Math.sin(tsec * 1.9 + seed) * 15 * sc;
        dyWeave += Math.sin(tsec * 3.8 + seed) * 6.5 * sc;
        rot += Math.cos(tsec * 1.9 + seed) * 0.11 - moveK * 0.06;
        shadowK *= 0.6;
        shadowA *= 0.58;
      } else {
        // 보행 — 경쾌한 걸음 바운스 + 앞쪽 기울기 + 발걸음 먼지
        const STEP = 22;
        const ph = (walk / STEP) % 2;
        const step = Math.abs(Math.sin(Math.PI * ph));
        lift = step * 5.2 * sc * moveK;
        dx += Math.sin(Math.PI * ph) * 2.1 * sc * moveK;
        rot += -0.065 * moveK + Math.sin(Math.PI * 2 * ph) * 0.02 * moveK;
        sx *= 1 + 0.028 * step * moveK;
        sy *= 1 - 0.024 * step * moveK;
        const half = Math.floor(ph);
        if (this.effects && moveK > 0.35 && m.__step != null && m.__step !== half) {
          this.stepDust(x + (half ? 1 : -1) * 6 * sc, gy + depth, sc, 2, 'rgba(215,220,232,0.36)');
        }
        m.__step = half;
      }

      // v8.7.0 대기 중 자유로운 전투 풋워크(좌우·상하 유기적 위빙 — 판넬처럼 멈춰 있지 않음)
      const idle = 1 - moveK;
      if (idle > 0.02 && arch !== 'flyer' && arch !== 'slime') {
        const breath = Math.sin(tsec * 2.2 + seed);
        sy *= 1 + 0.032 * breath * idle;
        sx *= 1 - 0.024 * breath * idle;
        dx += Math.sin(tsec * 1.45 + seed) * (m.isBoss ? 11 : 8.5) * sc * idle;
        dyWeave += Math.sin(tsec * 2.05 + seed * 1.3) * (m.isBoss ? 5.5 : 4.5) * sc * idle;
        rot += Math.sin(tsec * 1.35 + seed) * 0.042 * idle;
      }

      // 공격 전조 — 아키타입별 준비 동작(비행 상승 · 슬램 도약 준비 · 원거리 부유 차지 · 근접 웅크림)
      const wuAge = now - (m.windupAt || 0);
      const wuDur = m.windupDur || 300;
      const winding = (m.windupAt || 0) > 0 && wuAge >= 0 && wuAge < wuDur;
      const wk = winding ? clamp(wuAge / wuDur, 0, 1) : 0;
      if (winding) {
        const e = easeOut(wk);
        if (m.atkKind === 'ranged') {
          rot += 0.16 * e;
          dx += 8 * sc * e;
          sy *= 1 + 0.07 * e;
          sx *= 1 + 0.02 * e;
          lift += 10 * sc * e + Math.sin(wuAge / 55) * 1.5 * sc * e;
        } else if (arch === 'flyer') {
          // 비행 몬스터: 급강하 전 높게 솟구쳐 뒤로 당김
          lift += 26 * sc * e;
          dx += 18 * sc * e;
          rot += 0.2 * e;
          sy *= 1 + 0.06 * e;
        } else if (mKind === 'slam' || m.isBoss) {
          // 대형/보스: 뒤로 크게 젖히며 힘 모으기
          dx += 18 * sc * e;
          lift += 14 * sc * e;
          sy *= 1 + 0.08 * e;
          sx *= 1 - 0.05 * e;
          rot += 0.18 * e;
        } else {
          // 맹수/근접: 낮게 웅크려 도약 태세
          dx += 15 * sc * e;
          sy *= 1 - 0.17 * e;
          sx *= 1 + 0.14 * e;
          rot += 0.14 * e;
        }
      }

      // v8.7.0 아키타입별 자유 공격 모션 (단순 좌우 이동 탈피!)
      if (lunge > 0) {
        if (m.atkKind === 'ranged') {
          // 원거리: 발사 순간 반동으로 뒤로 튕기며 떠오름
          const recoil = Math.sin(Math.PI * Math.pow(lk, 0.65));
          dx += 22 * sc * recoil;
          rot += 0.22 * recoil;
          lift += 9 * sc * recoil;
          sx *= 1 - 0.07 * recoil;
          sy *= 1 + 0.09 * recoil;
        } else if (arch === 'flyer') {
          // 비행 급강하 스웁(Swoop): 대각선 아래로 쇄도했다가 다시 치솟음
          const swoop = Math.sin(Math.PI * Math.pow(lk, 0.8));
          dx -= atkReach * 1.15 * swoop;
          lift = Math.max(2 * sc, lift - swoop * 28 * sc);
          dyWeave += Math.sin(Math.PI * lk) * 10 * sc;
          rot -= 0.36 * swoop;
          sx *= 1 + 0.14 * swoop;
          sy *= 1 - 0.1 * swoop;
        } else if (arch === 'slime' || mKind === 'bite') {
          // 포물선 도약 덮치기(Pounce): 공중으로 뛰어올라 영웅을 덮침 + 착지 스쿼시
          const pounce = Math.sin(Math.PI * Math.pow(lk, 0.85));
          dx -= atkReach * pounce;
          lift += Math.sin(Math.PI * lk) * (m.isBoss ? 48 : 36) * sc;
          rot -= 0.28 * Math.sin(Math.PI * lk);
          if (lk > 0.78) {
            sx *= 1.18;
            sy *= 0.82;
            if (this.effects && m.__landSeq !== m.attackSeq) {
              m.__landSeq = m.attackSeq;
              this.stepDust(x + dx, gy + depth, sc, 4, 'rgba(225,230,245,0.48)');
            }
          } else {
            sx *= 1 - 0.06 * pounce;
            sy *= 1 + 0.1 * pounce;
          }
        } else if (mKind === 'slam' || m.isBoss) {
          // 대지 강타 점프 슬램: 전반부 도약 → 후반부 내려찍기 스쿼시 + 먼지 링
          const rush = Math.sin(Math.PI * Math.pow(lk, 0.78));
          dx -= atkReach * rush;
          if (lk < 0.48) {
            const up = Math.sin((Math.PI * lk) / 0.48);
            lift += up * (m.isBoss ? 40 : 28) * sc;
            rot -= 0.18 * up;
            sy *= 1 + 0.1 * up;
          } else {
            const impact = Math.max(0, 1 - (lk - 0.48) / 0.35);
            rot -= 0.24 * impact;
            sx *= 1 + 0.22 * impact;
            sy *= 1 - 0.2 * impact;
            if (this.effects && m.__landSeq !== m.attackSeq) {
              m.__landSeq = m.attackSeq;
              this.stepDust(x + dx, gy + depth, sc, m.isBoss ? 8 : 5, 'rgba(245,225,195,0.58)');
            }
          }
        } else {
          // 근접 돌진 베기 + 민첩한 백스텝 호프(Curve Rush + Rebound)
          const rush = Math.sin(Math.PI * Math.pow(lk, 0.72));
          dx -= atkReach * rush;
          dyWeave += Math.sin(Math.PI * lk) * (m.id % 2 === 0 ? 12 : -12) * sc;
          rot -= 0.24 * rush;
          sx *= 1 + 0.11 * rush;
          sy *= 1 - 0.08 * rush;
          if (lk > 0.62) {
            lift += Math.sin((Math.PI * (lk - 0.62)) / 0.38) * 14 * sc;
          } else {
            lift += 6 * sc * rush;
          }
        }
      }

      // 피격 — 살짝 튕겨 오르며 밀려나고 타격 방향으로 기운다
      if (hitK > 0) {
        dx += (10 + (m.id % 3) * 3) * sc * hitK;
        lift += Math.sin(Math.PI * hitK) * 10 * sc;
        rot += (0.22 + (m.id % 2) * 0.08) * hitK;
        sx *= 1 + 0.14 * hitK;
        sy *= 1 - 0.12 * hitK;
      }

      // 사망 — 포물선으로 튕겨 오르며 회전·축소되고 연기로 흩어진다
      let alpha = 1;
      if (m.dying) {
        const k = clamp((now - m.dying) / 450, 0, 1);
        alpha = 1 - k;
        dx += easeOut(k) * 94 * sc;
        rot += k * (2.5 + (m.id % 3) * 0.45);
        lift += Math.sin(Math.PI * Math.min(1, k * 1.12)) * h * 0.4;
        sx *= 1 - 0.24 * k;
        sy *= 1 - 0.24 * k;
      }

      const rawMx = x + dx;
      const rawGroundM = gy + depth + dyWeave;
      // v8.12.0 몬스터 물리 스프링 보간 (순간 꺾임 제거 + 이동 속도 기반 자연 기울기)
      const mDt = Math.max(1, Math.min(80, dt || 16));
      const mRate = m.dying ? 1 : 1 - Math.exp(-mDt / 54);
      if (m.__visX == null || !Number.isFinite(m.__visX)) m.__visX = rawMx;
      if (m.__visY == null || !Number.isFinite(m.__visY)) m.__visY = rawGroundM;
      const prevMx = m.__visX;
      m.__visX += (rawMx - m.__visX) * mRate;
      m.__visY += (rawGroundM - m.__visY) * mRate;
      m.__vx = (m.__visX - prevMx) / (mDt / 1000);
      rot += clamp(m.__vx / 1300, -0.15, 0.15);

      const mx = m.__visX;
      const groundM = m.__visY;
      const footY = groundM - lift;
      const kx = sx * pop * depthScale;
      const ky = sy * pop * depthScale;
      const shadowScale = shadowK * (1 - clamp(lift / (h * 1.4), 0, 1) * 0.48);

      // 1) 지면 그림자 (v7.1.0 depth + v8.12.0 물리 보간 X/Y 연동)
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha) * shadowA;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(mx, gy + 2 + depth + (groundM - (gy + depth)), w * 0.28 * shadowScale, w * 0.085 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha) * laneAlpha;
      const auraY = footY - h * 0.5;
      if (m.isBoss) {
        const enraged = !!m.enraged;
        const pulseE = enraged ? 0.65 + 0.35 * Math.sin(now / 90) : 1;
        const grd = ctx.createRadialGradient(mx, auraY, 6, mx, auraY, h * (enraged ? 0.98 : 0.8));
        grd.addColorStop(0, enraged ? `rgba(255,40,30,${(0.42 * pulseE).toFixed(3)})` : 'rgba(255,70,50,0.22)');
        grd.addColorStop(0.55, enraged ? `rgba(255,140,40,${(0.22 * pulseE).toFixed(3)})` : 'rgba(255,70,50,0.06)');
        grd.addColorStop(1, 'rgba(255,70,50,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(mx - h * 1.1, auraY - h * 1.1, h * 2.2, h * 2.2);
        if (enraged && this.effects && this.embers.length < 150 && Math.random() < 0.42) {
          this.embers.push({
            x: m.x + (Math.random() - 0.5) * 60,
            y: gy - Math.random() * 48 * sc,
            vy: -48 - Math.random() * 64,
            life: 1,
            s: 1.8 + Math.random() * 2.2,
            color: Math.random() < 0.5 ? '#ff4d3d' : '#ffb347',
          });
        }
      } else if (m.elite) {
        const eg = ctx.createRadialGradient(mx, auraY, 5, mx, auraY, h * 0.78);
        eg.addColorStop(0, hexA(m.elite.color || '#ffd76a', 0.34));
        eg.addColorStop(1, hexA(m.elite.color || '#ffd76a', 0));
        ctx.fillStyle = eg;
        ctx.fillRect(mx - h, auraY - h, h * 2, h * 2);
        // v7.4.0 엘리트 바닥 컬러 강조 링
        ctx.strokeStyle = hexA(m.elite.color || '#ffd76a', 0.78);
        ctx.lineWidth = 2 * sc;
        ctx.beginPath();
        ctx.ellipse(mx, gy + 2 + depth + dyWeave, w * 0.36, w * 0.11, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // v7.4.0 보물 고블린 금화 트레일 강조
      if (m.treasure && this.effects && this.embers.length < 150 && Math.random() < 0.45) {
        this.embers.push({
          x: m.x + (Math.random() - 0.5) * 24,
          y: gy + depth - Math.random() * 12 * sc,
          vy: -36 - Math.random() * 44,
          life: 1,
          s: 1.6 + Math.random() * 1.8,
          color: '#ffd76a',
        });
      }
      // 황금 던전 몬스터: 금빛 광휘 + 잔불
      if (m.gold) {
        const gg = ctx.createRadialGradient(mx, auraY, 6, mx, auraY, h * 0.78);
        gg.addColorStop(0, 'rgba(255,205,80,0.3)');
        gg.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(mx - h, auraY - h, h * 2, h * 2);
        if (this.effects && this.embers.length < 150 && Math.random() < 0.3) {
          this.embers.push({
            x: m.x + (Math.random() - 0.5) * 30,
            y: gy - Math.random() * 14 * sc,
            vy: -40 - Math.random() * 60,
            life: 1,
            s: 1.1 + Math.random() * 1.6,
            color: Math.random() < 0.55 ? '#ffd76a' : '#ffb347',
          });
        }
      }

      // 2) 전조 텔레그래프(기 모으기 오라 / 바닥 경고)
      if (this.effects && winding) this.drawWindup(ctx, m, mx, footY, h, sc, wk, color);

      // 3) 본체 — 발끝 기준 변형(스쿼시·기울기·회전)
      const img = this.image(m.name);
      ctx.save();
      ctx.translate(mx, footY);
      ctx.rotate(rot);
      ctx.scale(kx, ky);
      if (img) {
        ctx.drawImage(img, -w / 2, -h, w, h);
        if (hitK > 0.02) {
          const white = this.whiteOf(m.name, img);
          if (white) {
            ctx.globalAlpha = 0.55 * hitK * Math.max(0, alpha);
            ctx.drawImage(white, -w / 2, -h, w, h);
            ctx.globalAlpha = Math.max(0, alpha);
          }
        }
      } else {
        ctx.fillStyle = '#7d8fa6';
        ctx.beginPath();
        ctx.arc(0, -h * 0.5, h * 0.33, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // v7.4.0 상태이상 비주얼 오버레이 (화상 불꽃 · 빙결 얼음 결정)
      if (!m.dying && this.effects) {
        if (m.burnUntil && now < m.burnUntil) {
          this.drawBurnFx(ctx, mx, footY, h, sc, now);
        }
        if (m.slowUntil && now < m.slowUntil) {
          this.drawFrostFx(ctx, mx, footY, h, sc, now);
        }
      }

      // 4) 체력바 — 무리가 많을 땐 다친 몬스터만 보여 화면이 지저분해지지 않게 한다 (엘리트·보물 고블린은 상시 표시)
      const showBar = m.isBoss || m.elite || m.treasure || m.hp < m.maxHp || (now - (m.hitAt || 0) < 900);
      if (!m.dying && showBar) {
        const bw = (m.isBoss ? 96 : (m.elite || m.treasure ? 58 : 44 * Math.max(0.8, crowdK))) * sc;
        const bh = m.isBoss ? 6 : 4;
        const bx = mx - bw / 2;
        const by = footY - h * ky - 9 - lane * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        roundRect(ctx, bx - 1, by - 1, bw + 2, bh + 2, 2);
        ctx.fill();
        const pctv = Math.max(0, Math.min(1, m.hp / m.maxHp));
        ctx.fillStyle = m.treasure ? '#ffd76a' : m.elite ? (m.elite.color || '#ff9a3d') : (pctv > 0.5 ? '#4fd18b' : pctv > 0.22 ? '#f1c40f' : '#e74c3c');
        if (pctv > 0) {
          roundRect(ctx, bx, by, Math.max(1, bw * pctv), bh, 2);
          ctx.fill();
        }
        if (m.treasure || m.elite) {
          ctx.save();
          ctx.font = `900 ${Math.round(9 * Math.max(0.85, sc))}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = m.treasure ? '#ffd76a' : (m.elite.color || '#ffd76a');
          const tag = m.treasure
            ? `💰 보물 ${Math.max(1, Math.ceil(((m.fleeAt || now) - now) / 1000))}s`
            : `${m.elite.icon} ${m.elite.name}`;
          ctx.fillText(tag, mx, by - 4);
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  /** 공격 전조 연출 — 원거리는 가슴에 뭉치는 기, 근거리는 발밑 경고 고리 */
  drawWindup(ctx, m, cx, footY, h, sc, wk, color) {
    const e = easeOut(wk);
    const pulse = 0.7 + 0.3 * Math.sin(wk * Math.PI * 5);
    if (m.atkKind === 'ranged') {
      const cy = footY - h * 0.62;
      const rad = 5 * sc + e * h * 0.17;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(2, rad));
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.42, hexA(color, 0.85));
      g.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, rad), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA(color, 0.45 + 0.35 * pulse);
      ctx.lineWidth = 1.6 * sc;
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 1.5, wk * 6, wk * 6 + 2.4);
      ctx.stroke();
      if (m.windupHeavy) {
        ctx.strokeStyle = hexA('#ff8a5c', 0.5 * e);
        ctx.lineWidth = 2.2 * sc;
        ctx.beginPath();
        ctx.arc(cx, cy, rad * 2.1, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // 때릴 지점(플레이어 발밑)에 조여오는 붉은 원
      const px = this.worldX(this.battle.player.x);
      const gy = this.groundY();
      const big = (m.isBoss ? 1.45 : 1) * (m.windupHeavy ? 1.25 : 1);
      const r = (34 - 12 * e) * sc * big;
      ctx.strokeStyle = hexA('#ff5a3d', 0.32 + 0.55 * e);
      ctx.lineWidth = (1.6 + 2.6 * e) * sc;
      ctx.beginPath();
      ctx.ellipse(px, gy + 2, r, r * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = hexA('#ff5a3d', 0.08 + 0.18 * e);
      ctx.beginPath();
      ctx.ellipse(px, gy + 2, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      // 몬스터 몸의 웅크림 오라
      const cy = footY - h * 0.42;
      const g2 = ctx.createRadialGradient(cx, cy, 4, cx, cy, h * 0.55);
      g2.addColorStop(0, hexA(color, 0.2 * e));
      g2.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = g2;
      ctx.fillRect(cx - h, cy - h, h * 2, h * 2);
    }
  }

  /** 발걸음·착지 먼지(화면 좌표) */
  stepDust(x, gy, sc, n, color) {
    if (!this.effects) return;
    if (this.puffs.length > 110) return;
    for (let i = 0; i < n; i++) {
      this.puffs.push({
        x: x + (Math.random() - 0.5) * 16 * sc,
        y: gy - Math.random() * 3,
        r: (2 + Math.random() * 4) * sc,
        vx: (Math.random() - 0.5) * 26,
        vy: -8 - Math.random() * 18,
        life: 1,
        color: color || 'rgba(215,220,232,0.38)',
      });
    }
  }

  drawPuffs(ctx, dt) {
    if (!this.puffs.length) return;
    for (const p of this.puffs) {
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.vy += 10 * (dt / 1000);
      p.r += 7 * (dt / 1000);
      ctx.globalAlpha = Math.max(0, p.life) * 0.8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.life -= dt / 640;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
    ctx.globalAlpha = 1;
  }

  /** 몬스터 타격 연출 — 할퀴기 궤적 / 내려찍기 충격파 / 물기 / 투사체 발사 */
  monsterStrikeFx(ev, now) {
    if (!this.effects) return;
    const gy = this.groundY();
    const sc = this.scale();
    const color = ev.color || '#ffd166';
    const px = ECON.playerX;
    const big = ev.isBoss ? 1.55 : 1;
    if (ev.kind === 'ranged') {
      this.spawnProjectile(ev, now);
      this.rings.push({ x: ev.x, life: 1, r: 10, color, wide: 1.2 });
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        this.sparks.push({
          x: ev.x + Math.cos(a) * 16,
          y: gy - 58 * sc + Math.sin(a) * 16,
          life: 1,
          vx: Math.cos(a) * 90,
          vy: Math.sin(a) * 90 - 20,
          color,
          s: 1.4 + Math.random() * 1.8,
        });
      }
      this.shake = Math.max(this.shake, ev.heavy ? 3 : 1.5);
      return;
    }
    if (ev.move === 'slam') {
      this.fx.push({ key: 'slam', x: px, t0: now, dur: 430, big });
      this.fx.push({ key: 'fxBurst', x: px, t0: now, dur: 320, big: big * 0.9 });
      this.rings.push({ x: px, life: 1, r: 16, color: ev.heavy ? '#ff7a3d' : '#ffd166', wide: 2.2 * big });
      this.rings.push({ x: px - 6, life: 1, r: 8, color: '#fff3cf', wide: 1.1 });
      for (let i = 0; i < Math.round(10 * big); i++) {
        this.stepDust(this.worldX(px) + (Math.random() - 0.5) * 70 * sc, gy, sc, 1, 'rgba(224,214,190,0.5)');
      }
      this.shake = Math.max(this.shake, ev.heavy ? 7.5 : 4.4);
    } else if (ev.move === 'bite') {
      this.arcs.push({ x: px + 20, t0: now, dur: 300, dx: 0, y: 62, r: 26 * big, a0: -0.15, sweep: 1.5, color, alpha: 0.95, w: 5.2 });
      this.arcs.push({ x: px + 20, t0: now, dur: 300, dx: 0, y: 44, r: 24 * big, a0: Math.PI - 1.45, sweep: 1.5, color, alpha: 0.9, w: 5.2 });
      this.burst(px + 16, '#ff6a5a', ev.heavy ? 12 : 7, false);
      this.shake = Math.max(this.shake, 3.3);
    } else {
      // 할퀴기: 굵기가 다른 발톱 궤적 3줄 (+불꽃 발톱 이펙트 스프라이트)
      if (ev.color !== '#e8eef6') this.fx.push({ key: 'fxClaw', x: px, t0: now, dur: 340, big });
      for (let i = 0; i < 3; i++) {
        this.arcs.push({
          x: px + 20,
          t0: now + i * 24,
          dur: 330,
          dx: -i * 4,
          y: 46 + i * 9,
          r: (22 + i * 9) * big,
          a0: -1.05 - i * 0.12,
          sweep: 1.7,
          color: i === 1 ? '#fff0d0' : color,
          alpha: 0.95 - i * 0.13,
          w: (5 - i * 0.9) * (big > 1 ? 1.3 : 1),
        });
      }
      this.sparks.push({ x: px + 22, y: gy - 48 * sc, life: 1, vx: 60, vy: -30, color: '#ffb3a0', s: 2.4 });
      this.shake = Math.max(this.shake, ev.heavy ? 5 : 3);
    }
    if (ev.heavy) this.flash = Math.max(this.flash, 0.12);
  }

  /** 몬스터 사망 연출 — 연기 기둥 + 떠오르는 불티 */
  deathFx(ev, now) {
    if (!this.effects) return;
    const sc = this.scale();
    const gy = this.groundY();
    const x = this.worldX(ev.x);
    const n = ev.isBoss ? 16 : 7;
    for (let i = 0; i < n; i++) {
      this.puffs.push({
        x: x + (Math.random() - 0.5) * 42 * sc,
        y: gy - Math.random() * 50 * sc,
        r: (3 + Math.random() * 6) * sc * (ev.isBoss ? 1.5 : 1),
        vx: (Math.random() - 0.5) * 44,
        vy: -12 - Math.random() * 34,
        life: 1,
        color: ev.isBoss ? 'rgba(255,190,120,0.5)' : 'rgba(190,200,220,0.42)',
      });
    }
    for (let i = 0; i < (ev.isBoss ? 18 : 6); i++) {
      this.embers.push({
        x: ev.x + (Math.random() - 0.5) * 30,
        y: gy - Math.random() * 52 * sc,
        vy: -40 - Math.random() * 70,
        life: 1,
        s: 1.2 + Math.random() * 1.8,
        color: ev.isBoss ? '#ffd76a' : '#cfe0f5',
      });
    }
  }

  /* ─────────── 원거리 투사체 (화염구·깃털·암흑·신성·산성) ─────────── */
  spawnProjectile(ev, now) {
    const sc = this.scale();
    const gy = this.groundY();
    this.projectiles.push({
      kind: ev.proj || 'fire',
      x0: this.worldX(ev.x),
      x1: this.worldX(ECON.playerX) + 4,
      y0: gy - (ev.isBoss ? 104 : 58) * sc,
      y1: gy - 60 * sc,
      t0: now,
      dur: ev.isBoss ? 290 : 245,
      wob: Math.random() * Math.PI * 2,
      color: ev.color || '#ff8a3d',
      k: (ev.isBoss ? 1.45 : 1) * sc,
    });
    if (this.projectiles.length > 14) this.projectiles.shift();
  }

  drawProjectiles(ctx, now) {
    if (!this.projectiles.length) return;
    const keep = [];
    for (const p of this.projectiles) {
      const k = clamp((now - p.t0) / p.dur, 0, 1);
      const x = lerp(p.x0, p.x1, k);
      const y = lerp(p.y0, p.y1, k) - Math.sin(Math.PI * k) * 30 * (p.k || 1) + Math.sin(k * Math.PI * 3 + p.wob) * 3;
      for (let i = 3; i >= 1; i--) {
        const kk = clamp(k - i * 0.055, 0, 1);
        const tx = lerp(p.x0, p.x1, kk);
        const ty = lerp(p.y0, p.y1, kk) - Math.sin(Math.PI * kk) * 30 * (p.k || 1);
        ctx.globalAlpha = Math.max(0, 0.34 - i * 0.09);
        this.drawProjectileBody(ctx, p, tx, ty, 1 - i * 0.2);
      }
      ctx.globalAlpha = 1;
      this.drawProjectileBody(ctx, p, x, y, 1);
      if (k >= 1) {
        this.projectileImpact(p, x, y, now);
        continue;
      }
      keep.push(p);
    }
    this.projectiles = keep;
    ctx.globalAlpha = 1;
  }

  drawProjectileBody(ctx, p, x, y, k) {
    const s = Math.max(3, 12.5 * (p.k || 1) * k);
    ctx.save();
    ctx.translate(x, y);
    const col = p.color || '#ff8a3d';
    if (p.kind === 'feather') {
      ctx.rotate(-0.55);
      ctx.shadowColor = hexA(col, 0.9);
      ctx.shadowBlur = 8;
      const g = ctx.createLinearGradient(0, -s, 0, s);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.55, hexA(col, 0.95));
      g.addColorStop(1, hexA(col, 0.1));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.42, s * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(0, s);
      ctx.stroke();
    } else if (p.kind === 'dark') {
      ctx.shadowColor = hexA(col, 0.9);
      ctx.shadowBlur = 12;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.35, hexA(col, 0.95));
      g.addColorStop(1, 'rgba(40,10,60,0.05)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA('#e7d4ff', 0.8);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 1.5, s * 0.55, Math.PI / 5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'holy') {
      ctx.shadowColor = hexA(col, 0.95);
      ctx.shadowBlur = 14;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.3);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.45, hexA(col, 0.9));
      g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,250,220,0.95)';
      ctx.lineWidth = Math.max(1.4, s * 0.22);
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.7);
      ctx.lineTo(0, s * 1.7);
      ctx.moveTo(-s * 1.7, 0);
      ctx.lineTo(s * 1.7, 0);
      ctx.stroke();
    } else if (p.kind === 'ice') {
      // 서리 파편 — 뾰족한 결정 + 옅은 잔설
      ctx.rotate(0.35);
      ctx.shadowColor = hexA(col, 0.95);
      ctx.shadowBlur = 12;
      const g = ctx.createLinearGradient(0, -s * 1.4, 0, s * 1.2);
      g.addColorStop(0, 'rgba(255,255,255,0.98)');
      g.addColorStop(0.5, hexA(col, 0.95));
      g.addColorStop(1, hexA('#3f7fc0', 0.35));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.5);
      ctx.lineTo(s * 0.72, 0);
      ctx.lineTo(0, s * 0.9);
      ctx.lineTo(-s * 0.72, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,252,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (p.kind === 'sonic') {
      // 음파 — 겹친 고리
      ctx.shadowColor = hexA(col, 0.9);
      ctx.shadowBlur = 10;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha *= 0.72;
        ctx.strokeStyle = hexA(col, 0.95 - i * 0.22);
        ctx.lineWidth = Math.max(1, 2.4 - i * 0.5);
        ctx.beginPath();
        ctx.ellipse(-i * s * 0.7, 0, s * (1.05 - i * 0.22), s * (0.72 - i * 0.16), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'acid') {
      ctx.shadowColor = hexA(col, 0.85);
      ctx.shadowBlur = 9;
      const g = ctx.createRadialGradient(-s * 0.3, -s * 0.3, 0, 0, 0, s * 1.1);
      g.addColorStop(0, '#f0ffe0');
      g.addColorStop(0.5, hexA(col, 0.95));
      g.addColorStop(1, hexA('#2f7a3d', 0.15));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 1.05, s * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hexA('#d9ffd0', 0.85);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-s * 1.1 - i * s * 0.5, Math.sin(i * 2) * s * 0.5, s * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // 화염구
      ctx.shadowColor = hexA(col, 0.95);
      ctx.shadowBlur = 13;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.15);
      g.addColorStop(0, '#fffbe6');
      g.addColorStop(0.3, '#ffd76a');
      g.addColorStop(0.66, hexA(col, 0.95));
      g.addColorStop(1, hexA('#c0260a', 0.05));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hexA('#ff9a3d', 0.8);
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, -s * 0.8);
      ctx.lineTo(-s * 2.4, 0);
      ctx.lineTo(-s * 0.6, s * 0.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  projectileImpact(p, x, y, now) {
    const wx = this.worldFromScreen(x);
    const col = p.kind === 'holy' ? '#fff2c4' : p.kind === 'dark' ? '#b98bff' : p.kind === 'feather' ? '#bfeaff'
      : p.kind === 'acid' ? '#9df0a8' : p.kind === 'ice' ? '#bfeaff' : p.kind === 'sonic' ? '#b9c8ff' : '#ffb066';
    if (p.kind === 'fire' || p.kind === 'acid') this.fx.push({ key: 'fxBurst', x: wx, t0: typeof now === 'number' ? now : Date.now(), dur: 300, big: 0.95 });
    this.burst(wx, col, p.kind === 'fire' ? 14 : 10, true);
    this.rings.push({ x: wx, life: 1, r: 8, color: col, wide: 1.4 });
    this.shake = Math.max(this.shake, 2.6);
    if (p.kind === 'fire' || p.kind === 'acid') {
      for (let i = 0; i < 4; i++) this.stepDust(x, this.groundY(), this.scale(), 1, 'rgba(255,180,110,0.4)');
    }
  }

  worldFromScreen(x) {
    return (x / Math.max(1, this.W)) * 1120;
  }

  /** 보스 등장 포효 — 지면을 가르는 충격파 고리 */
  drawBossRoar(ctx, now) {
    const r = this.bossRoar;
    if (!r) return;
    const age = now - r.t0;
    const DUR = 900;
    if (age < 0 || age > DUR) {
      this.bossRoar = null;
      return;
    }
    const k = age / DUR;
    const gy = this.groundY();
    const sc = this.scale();
    const x = this.worldX(r.x);
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const kk = clamp(k - i * 0.13, 0, 1);
      if (kk <= 0) continue;
      ctx.globalAlpha = (1 - kk) * 0.5;
      ctx.strokeStyle = i ? '#ff8a5c' : '#ffd166';
      ctx.lineWidth = (4 - i) * sc;
      ctx.beginPath();
      ctx.ellipse(x, gy + 2, (36 + kk * 250) * sc, (12 + kk * 84) * sc, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = (1 - k) * 0.32;
    const g = ctx.createLinearGradient(x, gy - 200 * sc, x, gy);
    g.addColorStop(0, 'rgba(255,120,60,0)');
    g.addColorStop(1, 'rgba(255,150,80,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 26 * sc, gy - 200 * sc, 52 * sc, 200 * sc);
    ctx.restore();
  }

  /* ─────────── 이펙트 ─────────── */
  drawArcs(ctx, now) {
    const sc = this.scale();
    if (!this.arcs.length) return;
    for (const a of this.arcs) {
      const k = clamp((now - a.t0) / a.dur, 0, 1);
      if (k >= 1) continue;
      const x = this.worldX(a.x);
      const gy = this.groundY();
      ctx.save();
      ctx.globalAlpha = (1 - k) * a.alpha;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.w * sc * (1 - k * 0.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x + a.dx, gy - a.y, a.r * sc * (1 + k * 0.4), a.a0, a.a0 + a.sweep * easeOut(k));
      ctx.stroke();
      ctx.restore();
    }
    this.arcs = this.arcs.filter((a) => now - a.t0 < a.dur);
  }

  drawFx(ctx, now) {
    const gy = this.groundY();
    const sc = this.scale();
    for (const f of this.fx) {
      const k = clamp((now - f.t0) / f.dur, 0, 1);
      if (k >= 1) continue;
      const x = this.worldX(f.x);
      const fade = 1 - k;
      ctx.save();
      if (f.key === 'whirl') {
        // 회오리 베기: 캐릭터 주위로 회전하는 청록 아크 3겹
        const cx = this.worldX(ECON.playerX) + 10 * sc;
        const cy = gy - 70 * sc;
        for (let i = 0; i < 3; i++) {
          const ang = k * Math.PI * 3 + (i * Math.PI * 2) / 3;
          ctx.globalAlpha = fade * 0.75;
          ctx.strokeStyle = i === 1 ? '#c9f4ff' : '#7fd3ff';
          ctx.lineWidth = (5 - i) * sc;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(cx, cy, (58 + i * 16) * sc * (0.85 + k * 0.5), ang, ang + 1.5);
          ctx.stroke();
        }
        ctx.globalAlpha = fade * 0.5;
        ctx.strokeStyle = '#bff0ff';
        ctx.lineWidth = 2 * sc;
        ctx.beginPath();
        ctx.ellipse(cx, gy - 24 * sc, (34 + k * 70) * sc, (12 + k * 24) * sc, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.key === 'strike' || f.key === 'strikeHit') {
        // 강격: 대상 위로 내리꽂는 거대한 황금 참격 + 충격 고리
        const cx = x;
        const top = gy - 150 * sc;
        const bottom = gy - 6 * sc;
        ctx.globalAlpha = fade;
        const g = ctx.createLinearGradient(cx, top, cx + 26 * sc, bottom);
        g.addColorStop(0, 'rgba(255,247,220,0)');
        g.addColorStop(0.45, 'rgba(255,236,170,0.95)');
        g.addColorStop(1, 'rgba(255,170,60,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = (16 * fade + 3) * sc;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + 22 * sc, top);
        ctx.lineTo(cx - 14 * sc, bottom);
        ctx.stroke();
        ctx.globalAlpha = fade * 0.85;
        ctx.strokeStyle = '#fffdf2';
        ctx.lineWidth = 3 * sc;
        ctx.beginPath();
        ctx.moveTo(cx + 22 * sc, top + 10 * sc);
        ctx.lineTo(cx - 14 * sc, bottom - 6 * sc);
        ctx.stroke();
        ctx.globalAlpha = fade * 0.6;
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 3 * sc;
        ctx.beginPath();
        ctx.ellipse(cx, gy - 10 * sc, (10 + k * 70) * sc, (6 + k * 26) * sc, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.key === 'slam') {
        // 내려찍기: 위에서 꽂히는 충격 기둥 + 바닥을 가르는 충격파
        const big = f.big || 1;
        ctx.globalAlpha = fade * 0.8;
        const g = ctx.createLinearGradient(x, gy - 150 * sc * big, x, gy);
        g.addColorStop(0, 'rgba(255,235,180,0)');
        g.addColorStop(0.5, `rgba(255,205,110,${0.3 * fade})`);
        g.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 8 * sc * big, gy - 132 * sc * big);
        ctx.lineTo(x + 8 * sc * big, gy - 132 * sc * big);
        ctx.lineTo(x + 3 * sc * big, gy);
        ctx.lineTo(x - 3 * sc * big, gy);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = fade * 0.7;
        ctx.strokeStyle = '#fff3cf';
        ctx.lineWidth = 2.2 * sc;
        ctx.beginPath();
        ctx.ellipse(x, gy - 6 * sc, (14 + k * 96 * big) * sc, (5 + k * 30 * big) * sc, 0, 0, Math.PI * 2);
        ctx.stroke();
        // 튀는 잔해
        ctx.fillStyle = 'rgba(255,210,150,0.85)';
        for (let i = 0; i < 4; i++) {
          const a = -Math.PI / 2 + (i - 1.5) * 0.5;
          const d = k * 60 * big * sc;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * d, gy - 8 * sc + Math.sin(a) * d * 0.6, (1.5 + (1 - k) * 2.5) * sc, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.key === 'fxClaw' || f.key === 'fxBurst') {
        // AI로 만든 이펙트 스프라이트(검은 배경) — 'lighter' 합성으로 광원처럼 얹는다
        const img = this.image(f.key === 'fxClaw' ? 'fx_claw' : 'fx_burst');
        if (img) {
          const base = f.key === 'fxClaw' ? 80 : 62 + k * 96;
          const sz = base * sc * (f.big || 1);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.min(1, fade * (f.key === 'fxClaw' ? 0.82 : 0.95));
          if (f.key === 'fxClaw') {
            ctx.translate(x + 12 * sc, gy - 60 * sc);
            ctx.rotate(-0.5 + k * 0.3);
          } else {
            ctx.translate(x, gy - 58 * sc);
          }
          ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
        }
      } else if (f.key === 'ultimate') {
        // 궁극기: 캐릭터를 감싸는 빛기둥 + 회전하는 용 문양 + 퍼지는 파동
        const cx = this.worldX(ECON.playerX);
        const col = f.color || '#ffe9a8';
        const bst = f.burst || '#fff6c4';
        const pillar = ctx.createLinearGradient(cx, gy - 230 * sc, cx, gy);
        pillar.addColorStop(0, 'rgba(255,255,255,0)');
        pillar.addColorStop(0.35, hexA(col, 0.34 * fade));
        pillar.addColorStop(1, hexA(bst, 0.05 * fade));
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = pillar;
        ctx.beginPath();
        ctx.moveTo(cx - 16 * sc, gy);
        ctx.lineTo(cx - 9 * sc, gy - 230 * sc);
        ctx.lineTo(cx + 9 * sc, gy - 230 * sc);
        ctx.lineTo(cx + 16 * sc, gy);
        ctx.closePath();
        ctx.fill();
        // 회전 문양 2겹
        ctx.strokeStyle = hexA(bst, 0.65 * fade);
        ctx.lineWidth = 2.6 * sc;
        for (let i = 0; i < 2; i++) {
          const rr = (34 + i * 22 + k * 92) * sc;
          const a0 = k * Math.PI * 2.4 + i * 1.1;
          ctx.beginPath();
          ctx.ellipse(cx, gy - (70 - i * 22) * sc, rr, rr * 0.42, 0, a0, a0 + 2.5);
          ctx.stroke();
        }
        // 발치 파동
        ctx.globalAlpha = fade * 0.8;
        ctx.strokeStyle = hexA(col, 0.75);
        ctx.lineWidth = 3 * sc;
        ctx.beginPath();
        ctx.ellipse(cx, gy - 6 * sc, (30 + k * 170) * sc, (10 + k * 52) * sc, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (f.key === 'heal') {
        // 치유: 발치에서 올라오는 초록 빛 입자 + 부드러운 고리
        ctx.globalAlpha = fade * 0.75;
        ctx.strokeStyle = '#8ff0a4';
        ctx.lineWidth = 3.5 * sc;
        ctx.beginPath();
        ctx.ellipse(this.worldX(ECON.playerX), gy - 6 * sc, (26 + k * 30) * sc, (9 + k * 12) * sc, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 7; i++) {
          const px = this.worldX(ECON.playerX) + (i - 3) * 13 * sc;
          const py = gy - ((k * 120 + i * 17) % 130) * sc;
          ctx.globalAlpha = fade * 0.85;
          ctx.fillStyle = i % 2 ? '#b7ffc9' : '#e6ffef';
          ctx.beginPath();
          ctx.arc(px, py, (2 + (i % 3)) * sc, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.key === 'berserk') {
        ctx.globalAlpha = fade * 0.6;
        const cx = this.worldX(ECON.playerX);
        const grd = ctx.createRadialGradient(cx, gy - 60 * sc, 6, cx, gy - 60 * sc, (40 + k * 70) * sc);
        grd.addColorStop(0, 'rgba(255,140,90,0.45)');
        grd.addColorStop(1, 'rgba(255,90,50,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(cx - 140 * sc, gy - 190 * sc, 280 * sc, 200 * sc);
      } else if (f.key === 'meteor') {
        // ☄️ 메테오 폴: 하늘에서 대각선 낙하하는 화구 + 바닥 폭발 광휘
        const mx = lerp(x + 95 * sc, x, Math.min(1, k * 1.9));
        const my = lerp(gy - 210 * sc, gy - 14 * sc, Math.min(1, k * 1.9));
        ctx.globalCompositeOperation = 'lighter';
        if (k < 0.58) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#ff9a3d';
          ctx.lineWidth = 7 * sc;
          ctx.beginPath();
          ctx.moveTo(mx + 34 * sc, my - 58 * sc);
          ctx.lineTo(mx, my);
          ctx.stroke();
          ctx.fillStyle = '#fff3cf';
          ctx.beginPath();
          ctx.arc(mx, my, 12 * sc, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const bk = (k - 0.58) / 0.42;
          const grd = ctx.createRadialGradient(x, gy - 12 * sc, 4, x, gy - 12 * sc, (26 + bk * 86) * sc);
          grd.addColorStop(0, `rgba(255,240,180,${0.8 * (1 - bk)})`);
          grd.addColorStop(0.5, `rgba(255,95,40,${0.55 * (1 - bk)})`);
          grd.addColorStop(1, 'rgba(255,60,20,0)');
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(x, gy - 12 * sc, (26 + bk * 86) * sc, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      } else if (f.key === 'frostnova') {
        // ❄️ 절대 영도: 전장을 휩쓰는 빙결 파동 + 얼음 파편
        ctx.globalAlpha = fade * 0.8;
        ctx.strokeStyle = '#9be7ff';
        ctx.lineWidth = 4 * sc;
        ctx.beginPath();
        ctx.ellipse(x, gy - 10 * sc, (30 + k * 240) * sc, (10 + k * 62) * sc, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#e0f7ff';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + k * 1.4;
          const rx = x + Math.cos(a) * (24 + k * 180) * sc;
          const ry = gy - 26 * sc + Math.sin(a) * (10 + k * 42) * sc;
          ctx.fillRect(rx - 2.5 * sc, ry - 2.5 * sc, 5 * sc, 5 * sc);
        }
      } else if (f.key === 'aegis') {
        // 🛡️ 불굴의 방벽: 영웅을 감싸는 푸른 보호막 돔
        const cx = this.worldX(ECON.playerX);
        ctx.globalAlpha = fade * 0.78;
        ctx.strokeStyle = '#7cc4ff';
        ctx.lineWidth = 3 * sc;
        ctx.fillStyle = `rgba(110, 195, 255, ${0.22 * fade})`;
        ctx.beginPath();
        ctx.arc(cx, gy - 46 * sc, (42 + k * 12) * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (f.key === 'vampstrike') {
        // 🩸 흡혈 검무: 진홍빛 2연속 초승달 참격
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = '#ff4d6a';
        ctx.lineWidth = 5 * sc;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.arc(x - i * 18 * sc, gy - 48 * sc, (34 + k * 34) * sc, -1.1 + i * 0.4, 0.9 + i * 0.4);
          ctx.stroke();
        }
      } else if (f.key === 'execute') {
        // 🗡️ 그림자 처형: 보랏빛 X자 암살 참격
        ctx.globalAlpha = fade * 0.95;
        ctx.strokeStyle = '#e0b3ff';
        ctx.shadowColor = '#9333ea';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 5 * sc;
        const r = (24 + k * 28) * sc;
        ctx.beginPath();
        ctx.moveTo(x - r, gy - 48 * sc - r);
        ctx.lineTo(x + r, gy - 48 * sc + r);
        ctx.moveTo(x + r, gy - 48 * sc - r);
        ctx.lineTo(x - r, gy - 48 * sc + r);
        ctx.stroke();
      }
      ctx.restore();
    }
    this.fx = this.fx.filter((f) => now - f.t0 < f.dur);
  }

  drawRings(ctx, dt) {
    const gy = this.groundY();
    const sc = this.scale();
    for (const r of this.rings) {
      const k = 1 - r.life;
      const cx = this.worldX(r.x);
      const cy = gy - 34 * sc;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, r.life) * 0.8;
      ctx.lineWidth = 3 * r.life * sc * (r.wide || 1);
      ctx.beginPath();
      ctx.ellipse(cx, cy, (r.r + k * 120) * sc, (r.r + k * 60) * sc, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      r.life -= 0.06;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  drawSparks(ctx, dt) {
    const gy = this.groundY();
    for (const s of this.sparks) {
      s.x += (s.vx * dt) / 1000;
      s.vy += 420 * (dt / 1000);
      s.y += (s.vy * dt) / 1000;
      const life = Math.max(0, s.life);
      ctx.globalAlpha = life;
      ctx.fillStyle = s.color;
      const x = this.worldX(s.x);
      const y = Math.min(gy, s.y);
      const sz = (s.s || 2.4) * (0.6 + life * 0.7);
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      s.life -= dt / 620;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    ctx.globalAlpha = 1;
  }

  drawEmbers(ctx, dt) {
    for (const e of this.embers) {
      e.y += (e.vy * dt) / 1000;
      ctx.globalAlpha = Math.max(0, e.life) * 0.8;
      ctx.fillStyle = e.color || (e.life > 0.5 ? '#ffb066' : '#ff6a4d');
      const x = this.worldX(e.x);
      ctx.beginPath();
      ctx.arc(x, e.y, e.s * (0.5 + e.life), 0, Math.PI * 2);
      ctx.fill();
      e.life -= dt / 900;
    }
    this.embers = this.embers.filter((e) => e.life > 0);
    if (this.embers.length > 180) this.embers.splice(0, this.embers.length - 180);
    ctx.globalAlpha = 1;
  }

  /** 투사체 도착 시점에 맞춰 피해 숫자·붉은 플래시를 터뜨린다 */
  flushDelayedHits(now) {
    if (!this.delayedHits.length) return;
    const due = [];
    const keep = [];
    for (const d of this.delayedHits) {
      if (now >= d.at) due.push(d);
      else keep.push(d);
    }
    this.delayedHits = keep;
    for (const d of due) {
      this.addFloater(ECON.playerX, d.dmg, false, 'hurt', null, 1, now);
      this.redFlash = Math.max(this.redFlash, 0.42);
      this.shake = Math.max(this.shake, 3.4);
    }
  }

  drawFloaters(ctx, dt, now) {
    const gy = this.groundY();
    const sc = this.scale();
    for (const f of this.floaters) {
      f.age = (f.age || 0) + dt;
      f.y += (f.vy * dt) / 1000;
      f.vy += 46 * (dt / 1000);
      f.x += (f.vx * dt) / 1000;
      const x = this.worldX(f.x);
      const y = gy - 46 * sc + f.y;
      ctx.globalAlpha = Math.min(1, f.life * 1.7);
      ctx.textAlign = 'center';
      // v3.8 다굴 · v7.5.0 축약: 여러 숫자가 동시에 뜨므로 도트/펫은 더 작게, 치명타는 선명하게
      // v8.1.0 '간단' 모드: 기본 크기를 줄여 캐릭터 위를 숫자가 덮지 않게 한다
      const small = this.dmgStyle !== 'full';
      const base = (f.crit ? 24 : f.kind === 'gold' ? 12 : f.kind === 'pet' || f.kind === 'burn' || f.kind === 'chain' ? 11 : f.kind === 'heal' ? 15 : f.kind === 'hurt' ? 14 : 13.5)
        * (f.boost || 1)
        * (small && f.kind !== 'gold' && f.kind !== 'crit' ? 0.82 : 1);
      const pop = f.age < 130 ? 1 + (1 - f.age / 130) * 0.5 : 1;
      const size = base * Math.max(0.8, sc) * pop;
      if (f.crit) {
        // 크리티컬: 더 크고 굵은 외곽선 + 붉은/금빛 강조
        ctx.font = `900 ${size}px ${FONT}`;
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(255,110,50,0.95)';
        ctx.shadowBlur = 16;
        ctx.lineWidth = 6.5;
        ctx.strokeStyle = 'rgba(70,6,0,0.92)';
        ctx.strokeText(f.text, x, y);
        ctx.shadowBlur = 0;
        const cg = ctx.createLinearGradient(0, y - size, 0, y + size * 0.3);
        cg.addColorStop(0, '#fffbe6');
        cg.addColorStop(0.45, '#ffd76a');
        cg.addColorStop(1, '#ff6a2a');
        ctx.fillStyle = cg;
        ctx.fillText(f.text, x, y);
      } else {
        ctx.font = `900 ${size}px ${FONT}`;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        const color =
          f.color
            ? f.color
            : f.kind === 'gold'
            ? '#ffd76a'
            : f.kind === 'hurt'
            ? '#ff8080'
            : f.kind === 'heal'
            ? '#9dffb4'
            : '#ffffff';
        ctx.fillStyle = color;
        ctx.strokeText(f.text, x, y);
        ctx.fillText(f.text, x, y);
      }
      f.life -= dt / 900;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    ctx.globalAlpha = 1;
  }

  /* ─────────── 🌟 일일 보스 HUD (v4.5) ─────────── */
  /** 보스 이름 · 남은 시간 · 누적 피해 · 현재 등급을 캔버스 상단에 그린다 */
  drawDailyHud(ctx, W, now) {
    const d = this.battle && this.battle.daily;
    if (!d) return;
    const left = Math.max(0, d.ends - now);
    const total = Math.max(1, d.ends - d.t0);
    const k = Math.max(0, Math.min(1, left / total));
    const bw = Math.min(W * 0.9, 356);
    const bx = (W - bw) / 2;
    const by = 50;
    const hgt = 52;
    const sc = Math.min(1.2, Math.max(0.85, this.W / 390));
    const pulse = 0.7 + 0.3 * Math.sin(now / 150);
    const dps = Math.max(1, (this.battle.stats && this.battle.stats.dps) || 1);
    const ratio = Math.max(0, d.dmg / dailyDpsCap(dps));
    const grade = dailyGradeAt(ratio);
    ctx.save();
    ctx.shadowColor = 'rgba(255,215,106,0.8)';
    ctx.shadowBlur = 15 * pulse;
    const g = ctx.createLinearGradient(bx, by, bx, by + hgt);
    g.addColorStop(0, 'rgba(64,40,8,0.95)');
    g.addColorStop(0.5, 'rgba(30,20,6,0.95)');
    g.addColorStop(1, 'rgba(64,40,8,0.95)');
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, bw, hgt, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,215,120,${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = 2;
    roundRect(ctx, bx + 1, by + 1, bw - 2, hgt - 2, 9);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe6a8';
    ctx.font = `900 ${Math.round(12.5 * sc)}px ${FONT}`;
    ctx.fillText(`🌟 일일 보스 · ${d.ko || ''}`, bx + 12, by + 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = left / 1000 <= 5 ? '#ff9a9a' : '#fff6d8';
    ctx.font = `900 ${Math.round(15 * sc)}px ${FONT}`;
    ctx.fillText(`${(left / 1000).toFixed(1)}s`, bx + bw - 12, by + 18);

    // 남은 시간 바
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx + 12, by + 24, bw - 24, 7, 4);
    ctx.fill();
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, k < 0.25 ? '#ff7a7a' : '#ffd76a');
    bg.addColorStop(1, k < 0.25 ? '#ff9a3d' : '#ff9a3d');
    ctx.fillStyle = bg;
    roundRect(ctx, bx + 12, by + 24, Math.max(2, (bw - 24) * k), 7, 4);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,235,190,0.92)';
    ctx.font = `700 ${Math.round(9.5 * sc)}px ${FONT}`;
    ctx.fillText(`누적 피해 ${Math.round(d.dmg || 0).toLocaleString()}`, bx + 12, by + hgt - 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = grade.color;
    ctx.font = `900 ${Math.round(10.5 * sc)}px ${FONT}`;
    ctx.fillText(`${grade.icon} ${grade.id} · 화력 ${Math.round(ratio * 100)}%`, bx + bw - 12, by + hgt - 4);
    ctx.restore();
  }

  /* ─────────── 🐉 v8.16.0 주간 거대 레이드 실시간 HUD ─────────── */
  drawRaidHud(ctx, W, now) {
    const r = this.battle && this.battle.raid;
    if (!r) return;
    const left = Math.max(0, r.ends - now);
    const total = Math.max(1, r.ends - r.t0);
    const k = Math.max(0, Math.min(1, left / total));
    const bw = Math.min(W * 0.9, 356);
    const bx = (W - bw) / 2;
    const by = 50;
    const hgt = 56;
    const sc = Math.min(1.2, Math.max(0.85, this.W / 390));
    const pulse = 0.7 + 0.3 * Math.sin(now / 150);
    const dealtTotal = Math.min(r.maxHp, (r.damageBefore || 0) + (r.dmg || 0));
    const pctDone = Math.min(100, (dealtTotal / Math.max(1, r.maxHp)) * 100);
    const m = r.monster;
    const broken = !!(m && m.brokenUntil && now < m.brokenUntil);
    const brPct = m && m.breakMax ? Math.max(0, Math.min(1, (m.breakVal || 0) / m.breakMax)) : 1;

    ctx.save();
    ctx.shadowColor = 'rgba(255,90,95,0.75)';
    ctx.shadowBlur = 14 * pulse;
    const g = ctx.createLinearGradient(bx, by, bx, by + hgt);
    g.addColorStop(0, 'rgba(66,14,28,0.95)');
    g.addColorStop(1, 'rgba(26,10,36,0.95)');
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, bw, hgt, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = broken ? 'rgba(127,246,255,0.9)' : `rgba(255,115,120,${0.55 + 0.3 * pulse})`;
    ctx.lineWidth = 2;
    roundRect(ctx, bx + 1, by + 1, bw - 2, hgt - 2, 9);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd1d1';
    ctx.font = `900 ${Math.round(12 * sc)}px ${FONT}`;
    ctx.fillText(`${r.boss.icon} ${r.boss.name} · ×${(r.raidBonusMul || 1).toFixed(2)}`, bx + 12, by + 17);
    ctx.textAlign = 'right';
    ctx.fillStyle = left / 1000 <= 5 ? '#ff8a8a' : '#fff2d8';
    ctx.font = `900 ${Math.round(14.5 * sc)}px ${FONT}`;
    ctx.fillText(`${(left / 1000).toFixed(1)}s`, bx + bw - 12, by + 17);

    // 남은 시간 바
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx + 12, by + 23, bw - 24, 6, 3);
    ctx.fill();
    ctx.fillStyle = k < 0.25 ? '#ff6b6b' : '#ff9a5c';
    roundRect(ctx, bx + 12, by + 23, Math.max(2, (bw - 24) * k), 6, 3);
    ctx.fill();

    // 브레이크 게이지
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx + 12, by + 32, bw - 24, 5, 3);
    ctx.fill();
    ctx.fillStyle = broken ? '#ffe066' : '#69d2ff';
    roundRect(ctx, bx + 12, by + 32, Math.max(2, (bw - 24) * (broken ? Math.max(0, (m.brokenUntil - now) / 4000) : brPct)), 5, 3);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = broken ? '#7ff6ff' : 'rgba(255,225,225,0.92)';
    ctx.font = `800 ${Math.round(9.5 * sc)}px ${FONT}`;
    ctx.fillText(broken ? `💥 그로기! 피해 ×1.5 (${((m.brokenUntil - now) / 1000).toFixed(1)}s)` : `이번 피해 ${Math.round(r.dmg || 0).toLocaleString()}`, bx + 12, by + hgt - 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd76a';
    ctx.font = `900 ${Math.round(10 * sc)}px ${FONT}`;
    ctx.fillText(`주간 격파 ${pctDone.toFixed(1)}%`, bx + bw - 12, by + hgt - 4);
    ctx.restore();
  }

  /* ─────────── 🔥 황금 던전 HUD ─────────── */
  drawDungeonHud(ctx, W, now) {
    const d = this.battle && this.battle.dungeon;
    if (!d) return;
    const left = Math.max(0, d.ends - now);
    const total = Math.max(1, d.ends - d.t0);
    const k = Math.max(0, Math.min(1, left / total));
    const bw = Math.min(W * 0.84, 344);
    const bx = (W - bw) / 2;
    const by = 54;
    const hgt = 46;
    const pulse = 0.7 + 0.3 * Math.sin(now / 140);
    ctx.save();
    ctx.shadowColor = 'rgba(255,170,40,0.8)';
    ctx.shadowBlur = 16 * pulse;
    const g = ctx.createLinearGradient(bx, by, bx, by + hgt);
    g.addColorStop(0, 'rgba(92,52,6,0.94)');
    g.addColorStop(0.5, 'rgba(52,28,4,0.94)');
    g.addColorStop(1, 'rgba(92,52,6,0.94)');
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, bw, hgt, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,208,110,${0.55 + 0.3 * pulse})`;
    ctx.lineWidth = 2;
    roundRect(ctx, bx + 1, by + 1, bw - 2, hgt - 2, 9);
    ctx.stroke();

    const sc = Math.min(1.2, Math.max(0.85, this.W / 390));
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe6a8';
    ctx.font = `900 ${Math.round(13 * sc)}px ${FONT}`;
    ctx.fillText('🔥 황금 던전', bx + 12, by + 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff6d8';
    ctx.font = `900 ${Math.round(15 * sc)}px ${FONT}`;
    ctx.fillText(`${(left / 1000).toFixed(1)}s`, bx + bw - 12, by + 18);

    // 남은 시간 바
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx + 12, by + 25, bw - 24, 8, 4);
    ctx.fill();
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, '#ffd76a');
    bg.addColorStop(1, '#ff7a3d');
    ctx.fillStyle = bg;
    roundRect(ctx, bx + 12, by + 25, Math.max(2, (bw - 24) * k), 8, 4);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,235,190,0.9)';
    ctx.font = `700 ${Math.round(10 * sc)}px ${FONT}`;
    const kills = (d.kills || 0) + (d.bossKills || 0);
    ctx.fillText(`${kills}마리 처치 · 피해 ${Math.round(d.dmg || 0).toLocaleString()}`, bx + 12, by + hgt - 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,220,160,0.75)';
    ctx.fillText(`보스 ${d.bossKills || 0}`, bx + bw - 12, by + hgt - 2);
    ctx.restore();
  }

  /* ─────────── 🗼 도전의 탑 HUD (v4.2) ─────────── */
  /** 층 이름 · 기믹 · 남은 시간 · 목표 진행도를 캔버스 상단에 그린다 */
  drawTowerHud(ctx, W, now) {
    const t = this.battle && this.battle.tower;
    if (!t) return;
    const def = t.floor || {};
    const left = Math.max(0, t.ends - now);
    const total = Math.max(1, t.ends - t.t0);
    const k = Math.max(0, Math.min(1, left / total));
    const bw = Math.min(W * 0.9, 356);
    const bx = (W - bw) / 2;
    const by = 50;
    const hgt = 52;
    const sc = Math.min(1.2, Math.max(0.85, this.W / 390));
    const pulse = 0.7 + 0.3 * Math.sin(now / 160);
    ctx.save();
    ctx.shadowColor = 'rgba(120,170,255,0.75)';
    ctx.shadowBlur = 14 * pulse;
    const g = ctx.createLinearGradient(bx, by, bx, by + hgt);
    g.addColorStop(0, 'rgba(20,32,64,0.95)');
    g.addColorStop(0.5, 'rgba(12,20,40,0.95)');
    g.addColorStop(1, 'rgba(20,32,64,0.95)');
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, bw, hgt, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(150,190,255,${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = 2;
    roundRect(ctx, bx + 1, by + 1, bw - 2, hgt - 2, 9);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#dbe9ff';
    ctx.font = `900 ${Math.round(12.5 * sc)}px ${FONT}`;
    ctx.fillText(`🗼 ${t.n}층 · ${def.name || ''}`, bx + 12, by + 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = left / 1000 <= 5 ? '#ff9a9a' : '#eaf2ff';
    ctx.font = `900 ${Math.round(15 * sc)}px ${FONT}`;
    ctx.fillText(`${(left / 1000).toFixed(1)}s`, bx + bw - 12, by + 18);

    // 남은 시간 바
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx + 12, by + 24, bw - 24, 7, 4);
    ctx.fill();
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, k < 0.25 ? '#ff7a7a' : '#8fb8ff');
    bg.addColorStop(1, k < 0.25 ? '#ff9a3d' : '#cfe0ff');
    ctx.fillStyle = bg;
    roundRect(ctx, bx + 12, by + 24, Math.max(2, (bw - 24) * k), 7, 4);
    ctx.fill();

    // 기믹 + 목표 진행도
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(200,220,255,0.92)';
    ctx.font = `700 ${Math.round(9.5 * sc)}px ${FONT}`;
    const gims = towerGimmicks(def).map((x) => `${x.icon} ${x.name}`).join(' · ') || '기믹 없음';
    ctx.fillText(gims, bx + 12, by + hgt - 4);
    ctx.textAlign = 'right';
    const done = (t.kills || 0) + (t.bossKills || 0);
    ctx.fillStyle = done >= t.goal ? '#9dffb4' : 'rgba(210,230,255,0.8)';
    ctx.fillText(def.bossOnly ? `보스 ${t.bossKills || 0}/1` : `${done}/${t.goal} 처치`, bx + bw - 12, by + hgt - 4);
    ctx.restore();
  }

  /** 기믹 표식 — 몬스터 발밑에 층 기믹 색 고리를 깔아 한눈에 구분한다 */
  drawTowerMarkers(ctx, now) {
    const t = this.battle && this.battle.tower;
    if (!t || !this.effects) return;
    const gims = towerGimmicks(t.floor);
    if (!gims.length) return;
    const gy = this.groundY();
    const sc = this.scale();
    const pulse = 0.45 + 0.25 * Math.sin(now / 260);
    for (const m of this.battle.monsters) {
      if (m.dead || m.dying || !Number.isFinite(m.x)) continue;
      const x = this.worldX(m.x);
      const lane = m.isBoss ? 0 : (m.lane || 0);
      const r = (m.isBoss ? 46 : 22) * sc * (1 + lane * 0.04);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = hexA(gims[0].color, 0.85);
      ctx.lineWidth = 1.6 * sc;
      ctx.beginPath();
      ctx.ellipse(x, gy + 3, r, r * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (gims.length > 1) {
        ctx.globalAlpha = pulse * 0.7;
        ctx.strokeStyle = hexA(gims[1].color, 0.8);
        ctx.beginPath();
        ctx.ellipse(x, gy + 3, r * 0.7, r * 0.14, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* ─────────── 🗼 탑 입장 배너 ─────────── */
  drawTowerBanner(ctx, W, now) {
    if (!this.towerBanner) return;
    const DUR = 2000;
    const age = now - this.towerBanner;
    if (age < 0 || age > DUR) {
      this.towerBanner = 0;
      return;
    }
    const inK = easeOut(clamp(age / 260, 0, 1));
    const outK = age > DUR - 380 ? clamp((DUR - age) / 380, 0, 1) : 1;
    const a = inK * outK;
    const sc = Math.min(1.25, Math.max(0.85, W / 390));
    const cy = this.H * 0.34;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(120,170,255,0.85)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#eaf2ff';
    ctx.font = `900 ${Math.round(20 * sc)}px ${FONT}`;
    ctx.fillText(`🗼 도전의 탑 ${this.towerBannerName || ''}`, W / 2, cy);
    ctx.shadowBlur = 0;
    ctx.font = `800 ${Math.round(10.5 * sc)}px ${FONT}`;
    ctx.fillStyle = 'rgba(190,215,255,0.95)';
    const names = (this.towerBannerGimmicks || []).map((id) => TOWER_GIMMICKS[id]).filter(Boolean).map((g) => `${g.icon} ${g.name}`).join(' · ');
    ctx.fillText(names, W / 2, cy + 18 * sc);
    ctx.restore();
  }

  /* ─────────── ✨ 전직 팡파르 배너 ─────────── */
  drawPromoteBanner(ctx, W, now) {
    if (!this.promote) return;
    const DUR = 2600;
    const age = now - this.promote;
    if (age < 0 || age > DUR) {
      this.promote = 0;
      return;
    }
    const inK = easeOut(clamp(age / 300, 0, 1));
    const outK = clamp((DUR - age) / 400, 0, 1);
    const alpha = Math.min(inK, outK);
    const w = Math.min(W * 0.9, 360);
    const hgt = 62;
    const x = (W - w) / 2;
    const y = lerp(-hgt - 12, this.H * 0.3 - hgt / 2, inK);
    const pulse = 0.65 + 0.35 * Math.sin(age / 100);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = hexA(this.promoteColor || '#ffd76a', 0.9);
    ctx.shadowBlur = 26 * pulse;
    const g = ctx.createLinearGradient(x, y, x, y + hgt);
    g.addColorStop(0, 'rgba(120,86,10,0.96)');
    g.addColorStop(0.45, 'rgba(64,40,4,0.96)');
    g.addColorStop(1, 'rgba(120,86,10,0.96)');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, hgt, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,220,140,${0.6 + 0.35 * pulse})`;
    ctx.lineWidth = 2;
    roundRect(ctx, x + 1, y + 1, w - 2, hgt - 2, 11);
    ctx.stroke();
    const sc = Math.min(1.2, Math.max(0.85, this.W / 390));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff6d8';
    ctx.font = `900 ${Math.round(13 * sc)}px ${FONT}`;
    ctx.fillText('✨ 전직 성공! ✨', x + w / 2, y + 20);
    ctx.fillStyle = '#ffe6a8';
    ctx.font = `900 ${Math.round(21 * sc)}px ${FONT}`;
    ctx.fillText(`${this.promoteBadge} ${this.promoteName}`.trim(), x + w / 2, y + 46);
    ctx.restore();
  }

  /* ─────────── 🛡 v4.3 부활 가호 배너 — 남은 시간 게이지 ─────────── */
  /* ─────────── v7.3.0 영웅 진화 외형 · 스킬 잔상 · 기사단 지원 사격 · 보스 격파 폭발 ─────────── */
  drawHeroEvolution(ctx, px, gy, h, sc, now) {
    const j = this.syncJob();
    const tier = j ? j.tier : 0;
    const mythic = !!(this._rar && this._rar.hasMythic);
    if (tier < 2 && !mythic) return;
    const col = mythic ? '#ff66c4' : (j && j.color) || '#ffcf5c';
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    const cy = gy - h * 0.54;
    ctx.save();
    // Tier 2+: 등 뒤 흐르는 망토 트레일
    const wave = Math.sin(now / 150) * 6 * sc;
    ctx.fillStyle = hexA(col, 0.26);
    ctx.beginPath();
    ctx.moveTo(px - 6 * sc, cy - 8 * sc);
    ctx.quadraticCurveTo(px - 28 * sc, cy + wave, px - 36 * sc, gy - 8 * sc + wave * 0.5);
    ctx.lineTo(px - 10 * sc, gy - 12 * sc);
    ctx.closePath();
    ctx.fill();
    // Tier 4+ (드래곤 로드·용신) 또는 신화 장비: 등 뒤 에너지 날개 한 쌍
    if (tier >= 4 || mythic) {
      const flap = Math.sin(now / 220) * 0.16;
      const wingLen = (tier >= 5 || mythic ? 42 : 32) * sc;
      for (const dir of [-1, 1]) {
        ctx.save();
        ctx.translate(px - 4 * sc, cy - 4 * sc);
        ctx.rotate(dir * (0.55 + flap) - 0.35);
        const wg = ctx.createLinearGradient(0, 0, -wingLen, -wingLen * 0.45);
        wg.addColorStop(0, hexA(col, 0.62));
        wg.addColorStop(1, hexA('#ffe799', 0.06));
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-wingLen * 0.55, -wingLen * 0.58 * dir, -wingLen, -wingLen * 0.18 * dir);
        ctx.quadraticCurveTo(-wingLen * 0.5, wingLen * 0.12 * dir, 0, 6 * sc);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // Tier 5 (🐉 용신) 또는 신화 장비: 영웅 주위를 공전하는 부유 검(소드 비트) 3자루
    if (tier >= 5 || mythic) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const a = now / 520 + (i * Math.PI * 2) / 3;
        const bx = px + Math.cos(a) * 34 * sc;
        const by = cy - 6 * sc + Math.sin(a) * 14 * sc;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(Math.sin(a) * 0.25 + 0.3);
        ctx.fillStyle = hexA(mythic ? '#ff8ad6' : '#ffe082', 0.78 + 0.18 * pulse);
        ctx.beginPath();
        ctx.moveTo(10 * sc, 0);
        ctx.lineTo(-7 * sc, -2.6 * sc);
        ctx.lineTo(-4 * sc, 0);
        ctx.lineTo(-7 * sc, 2.6 * sc);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  spawnAfterimages(kind, now) {
    if (!this.effects || !this.battle) return;
    const baseX = this.worldX(this.battle.player.x);
    const sc = this.scale();
    const col = kind === 'ultimate' ? '#ff66c4' : kind === 'whirl' ? '#69c0ff' : '#ffd166';
    for (let i = 0; i < 3; i++) {
      this.afterimages.push({
        x: baseX + (i + 1) * 14 * sc,
        t0: now + i * 28,
        dur: 240,
        color: col,
      });
    }
    if (this.afterimages.length > 12) this.afterimages.splice(0, this.afterimages.length - 12);
  }

  drawAfterimages(ctx, now) {
    if (!this.afterimages || !this.afterimages.length) return;
    const gy = this.groundY();
    const sc = this.scale();
    const h = Math.min(this.H * 0.4, 100 * sc);
    const keep = [];
    for (const a of this.afterimages) {
      const age = now - a.t0;
      if (age > a.dur) continue;
      keep.push(a);
      if (age < 0) continue;
      const fade = 1 - age / a.dur;
      const img = (a.frame && this.image(a.frame)) || this.image('hero_skill') || this.image('hero_attack');
      const yOff = a.y || 0;
      ctx.save();
      ctx.globalAlpha = 0.34 * fade;
      if (img) ctx.drawImage(img, a.x - h / 2, gy + yOff - h, h, h);
      else {
        ctx.fillStyle = a.color;
        ctx.fillRect(a.x - h * 0.25, gy + yOff - h * 0.85, h * 0.5, h * 0.75);
      }
      ctx.restore();
    }
    this.afterimages = keep;
  }

  /** v7.3.0 / v8.11.0 영지 기사단 4인 전원 캔버스 지원 출격 (실비아·멀린·아서·마르코) */
  drawKnightSupport(ctx, dt, now) {
    const b = this.battle;
    const kn = b && b.s && b.s.guild && b.s.guild.knights;
    if (!kn) return;
    const hasPal = (kn.paladin || 0) > 0;
    const hasArc = (kn.archer || 0) > 0;
    const hasMag = (kn.mage || 0) > 0;
    const hasMer = (kn.merchant || 0) > 0;
    const shotGap = b && b.raid ? 800 : 1800;
    if ((hasPal || hasArc || hasMag || hasMer) && now - (this.lastKnightShot || 0) >= shotGap) {
      const target = b.monsters.find((m) => !m.dead && !m.dying);
      if (target) {
        this.lastKnightShot = now;
        this._knightSeq = (this._knightSeq || 0) + 1;
        const gy = this.groundY();
        const sc = this.scale();
        const heroX = this.heroVisX != null ? this.heroVisX : this.worldX(b.player.x);
        const sx = Math.max(12, heroX - 48 * sc);
        const tx = this.worldX(target.x);
        if (hasArc) {
          this.knightShots.push({ kind: 'arrow', sx, sy: gy - 44 * sc, tx, ty: gy - 38 * sc, t0: now, dur: 250, color: '#5ee1a3' });
          this.knightShots.push({ kind: 'arrow', sx: sx + 6 * sc, sy: gy - 50 * sc, tx, ty: gy - 44 * sc, t0: now + 70, dur: 250, color: '#8ff0a4' });
        }
        if (hasMag) {
          this.knightShots.push({ kind: 'orb', sx: sx - 8 * sc, sy: gy - 62 * sc, tx, ty: gy - 42 * sc, t0: now + 90, dur: 320, color: '#b98bff' });
        }
        if (hasPal && this._knightSeq % 2 === 1) {
          // 🛡️ 성기사 아서: 영웅 앞 황금-푸른 성광 방패 파동 돌격
          this.knightShots.push({ kind: 'shield', sx: heroX + 6 * sc, sy: gy - 36 * sc, tx: Math.min(tx, heroX + 115 * sc), ty: gy - 36 * sc, t0: now + 40, dur: 420, color: '#69c0ff' });
        }
        if (hasMer && this._knightSeq % 2 === 0) {
          // 💰 대상인 마르코: 포물선 황금 보급 금화 투하
          this.knightShots.push({ kind: 'coin', sx: sx - 12 * sc, sy: gy - 68 * sc, tx: heroX + 18 * sc, ty: gy - 12 * sc, t0: now + 120, dur: 460, color: '#ffd76a' });
        }
      }
    }
    if (!this.knightShots || !this.knightShots.length) return;
    const keep = [];
    const sc = this.scale();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.knightShots) {
      const age = now - s.t0;
      if (age > s.dur) continue;
      keep.push(s);
      if (age < 0) continue;
      const k = clamp(age / s.dur, 0, 1);
      const x = lerp(s.sx, s.tx, k);
      const arcH = s.kind === 'coin' ? 38 : s.kind === 'shield' ? 6 : 18;
      const y = lerp(s.sy, s.ty, k) - Math.sin(Math.PI * k) * arcH * sc;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      if (s.kind === 'arrow') {
        ctx.lineWidth = 2.2 * sc;
        ctx.beginPath();
        ctx.moveTo(x - 16 * sc, y + 2 * sc);
        ctx.lineTo(x + 6 * sc, y);
        ctx.stroke();
      } else if (s.kind === 'shield') {
        const fade = 1 - k * 0.7;
        ctx.globalAlpha = fade;
        ctx.lineWidth = 4 * sc;
        ctx.beginPath();
        ctx.arc(x, y, 20 * sc, -1.05, 1.05);
        ctx.stroke();
        ctx.strokeStyle = '#ffe9a8';
        ctx.lineWidth = 1.8 * sc;
        ctx.beginPath();
        ctx.arc(x + 3 * sc, y, 16 * sc, -0.9, 0.9);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (s.kind === 'coin') {
        const fade = 1 - k * 0.4;
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(x, y, 5.2 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff9d6';
        ctx.beginPath();
        ctx.arc(x - 1.5 * sc, y - 1.5 * sc, 2 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 5.8 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 1.4 * sc;
        ctx.beginPath();
        ctx.arc(x, y, (8 + k * 5) * sc, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    this.knightShots = keep;
  }

  drawBossKillFx(ctx, now) {
    const fx = this.bossKillFx;
    if (!fx) return;
    const age = now - fx.t0;
    if (age > fx.dur) { this.bossKillFx = null; return; }
    const k = clamp(age / fx.dur, 0, 1);
    const fade = 1 - k;
    const x = this.worldX(fx.x);
    const y = this.groundY() - 52 * this.scale();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA('#ffd76a', 0.85 * fade);
    ctx.lineWidth = (5 * fade + 1) * this.scale();
    ctx.beginPath();
    ctx.arc(x, y, (24 + k * 140) * this.scale(), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* ─────────── v7.4.0 상태이상(화상·빙결·번개 연쇄) · 처치 파편 분산 ─────────── */
  drawBurnFx(ctx, cx, footY, h, sc, now) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ph = ((now / 260) + i * 0.33) % 1;
      const fx = cx + Math.sin(now / 110 + i * 2.1) * h * 0.22;
      const fy = footY - h * (0.25 + ph * 0.55);
      const r = (5.5 - ph * 3.5) * sc;
      ctx.fillStyle = ph < 0.5 ? `rgba(255,140,40,${0.75 * (1 - ph)})` : `rgba(255,220,90,${0.7 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(fx, fy, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFrostFx(ctx, cx, footY, h, sc, now) {
    ctx.save();
    ctx.strokeStyle = 'rgba(130,225,255,0.82)';
    ctx.fillStyle = 'rgba(130,225,255,0.34)';
    ctx.lineWidth = 1.4 * sc;
    ctx.beginPath();
    ctx.ellipse(cx, footY + 1, h * 0.34, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 2; i++) {
      const a = now / 480 + i * Math.PI;
      const ix = cx + Math.cos(a) * h * 0.32;
      const iy = footY - h * 0.48 + Math.sin(a) * h * 0.14;
      ctx.fillStyle = 'rgba(210,248,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(ix, iy - 4.5 * sc);
      ctx.lineTo(ix + 3 * sc, iy);
      ctx.lineTo(ix, iy + 4.5 * sc);
      ctx.lineTo(ix - 3 * sc, iy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  spawnLightning(fromWorldX, toWorldX, color, now) {
    if (!this.effects) return;
    const x1 = this.worldX(Number.isFinite(fromWorldX) ? fromWorldX : ECON.playerX);
    const x2 = this.worldX(Number.isFinite(toWorldX) ? toWorldX : ECON.playerX + 300);
    const y = this.groundY() - 48 * this.scale();
    const pts = [];
    const segs = 5;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const j = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 26 * this.scale();
      pts.push([lerp(x1, x2, k), y + j]);
    }
    this.lightnings.push({ pts, color: color || '#b98bff', t0: now, dur: 190 });
    if (this.lightnings.length > 10) this.lightnings.shift();
  }

  drawLightnings(ctx, now) {
    if (!this.lightnings || !this.lightnings.length) return;
    const keep = [];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lightnings) {
      const age = now - l.t0;
      if (age > l.dur) continue;
      keep.push(l);
      const fade = 1 - age / l.dur;
      ctx.strokeStyle = hexA(l.color, 0.85 * fade);
      ctx.lineWidth = 3.2 * this.scale();
      ctx.beginPath();
      l.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      ctx.strokeStyle = hexA('#ffffff', 0.9 * fade);
      ctx.lineWidth = 1.2 * this.scale();
      ctx.stroke();
    }
    ctx.restore();
    this.lightnings = keep;
  }

  spawnKillShards(worldX, color, n, now) {
    if (!this.effects) return;
    const x = this.worldX(Number.isFinite(worldX) ? worldX : ECON.playerX + 260);
    const y = this.groundY() - 42 * this.scale();
    for (let i = 0; i < n && this.killShards.length < 48; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * 140;
      this.killShards.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 55,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 9,
        s: (2.8 + Math.random() * 3.2) * this.scale(),
        color: color || '#cde9ff',
        life: 1,
      });
    }
  }

  drawKillShards(ctx, dt) {
    if (!this.killShards || !this.killShards.length) return;
    const sec = (dt || 16) / 1000;
    const keep = [];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.killShards) {
      p.life -= sec * 2.1;
      if (p.life <= 0) continue;
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.vy += 320 * sec;
      p.rot += p.vrot * sec;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, -p.s);
      ctx.lineTo(p.s * 0.65, 0);
      ctx.lineTo(0, p.s);
      ctx.lineTo(-p.s * 0.65, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      keep.push(p);
    }
    ctx.restore();
    this.killShards = keep;
  }

  /* ─────────── v7.0.0 콤보 히트 카운터 · 보스 강공격 전조 경고 ─────────── */
  drawCombo(ctx, W, now) {
    if (!this.combo || this.combo < 3 || !this.comboAt || now - this.comboAt > 2400) return;
    const age = now - this.comboAt;
    const alpha = age > 1800 ? Math.max(0, 1 - (age - 1800) / 600) : 1;
    const pop = age < 140 ? 1 + (1 - age / 140) * 0.22 : 1;
    const sc = this.scale();
    const b = this.battle;
    // v7.5.0 캔버스 상단 안전 구역: 보스 바·특수 모드 HUD·상단 버프 바와 겹치지 않게 아래로 배치
    const topBusy = !!(b && (b.boss || b.dungeon || b.tower || b.daily || b.invasion || b.rift));
    const x = 16 * sc;
    const y = topBusy ? Math.max(118, this.H * 0.44) : Math.max(88, this.H * 0.36);
    const hot = this.combo >= 15;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round((hot ? 18 : 15) * sc)}px ${FONT}`;
    ctx.shadowColor = hot ? 'rgba(255,90,40,0.9)' : 'rgba(255,207,92,0.8)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = hot ? '#ffcf5c' : '#fff6d6';
    ctx.fillText(`${hot ? '🔥 ' : ''}${this.combo} HIT!`, 0, 0);
    ctx.restore();
  }

  /* ─────────── v7.7.0 캔버스 탭 번개 일격 · 피버 게이지/타임 ─────────── */
  spawnTapBolt(x, now) {
    if (!this.effects) return;
    this.tapBolts.push({ x, t0: now, dur: 240, seed: Math.random() * 99 });
    if (this.tapBolts.length > 10) this.tapBolts.shift();
  }

  drawTapBolts(ctx, now) {
    if (!this.tapBolts || !this.tapBolts.length) return;
    const gy = this.groundY();
    const sc = this.scale();
    const keep = [];
    ctx.save();
    for (const b of this.tapBolts) {
      const k = (now - b.t0) / b.dur;
      if (k >= 1) continue;
      keep.push(b);
      const tx = this.worldX(b.x);
      const ty = gy - 24 * sc;
      const alpha = Math.max(0, 1 - k);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#7ff6ff';
      ctx.lineWidth = (3.4 - k * 1.8) * sc;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(tx + (rnd(b.seed) - 0.5) * 18, 0);
      const segs = 6;
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const jx = (rnd(b.seed + i * 7.3) - 0.5) * 24 * sc;
        ctx.lineTo(tx + jx, ty * t);
      }
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.strokeStyle = '#fff9d6';
      ctx.lineWidth = 1.4 * sc;
      ctx.stroke();
    }
    ctx.restore();
    this.tapBolts = keep;
  }

  drawFeverHud(ctx, W, H, now) {
    const b = this.battle;
    if (!b) return;
    const active = (b.feverUntil || 0) > now;
    const pct = active
      ? clamp((b.feverUntil - now) / 15000, 0, 1)
      : clamp((b.fever || 0) / 100, 0, 1);
    if (!active && pct <= 0.01) return;
    ctx.save();
    if (active) {
      const pulse = 0.55 + 0.45 * Math.sin(now / 110);
      ctx.strokeStyle = `rgba(255, 207, 92, ${0.38 + 0.32 * pulse})`;
      ctx.lineWidth = 5;
      ctx.strokeRect(2.5, 2.5, W - 5, H - 5);
    }
    const bw = active ? Math.min(208, W * 0.58) : 108;
    const bh = 16;
    const bx = 10;
    const by = H - bh - 8;
    ctx.fillStyle = 'rgba(10, 14, 24, 0.78)';
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fill();
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    if (active) {
      grad.addColorStop(0, '#ff6a2a');
      grad.addColorStop(0.5, '#ffd76a');
      grad.addColorStop(1, '#fff2b0');
    } else {
      grad.addColorStop(0, '#f59e0b');
      grad.addColorStop(1, '#ffd76a');
    }
    ctx.fillStyle = grad;
    roundRect(ctx, bx + 2, by + 2, Math.max(4, (bw - 4) * pct), bh - 4, 6);
    ctx.fill();
    ctx.font = `900 9.5px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff9e6';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 4;
    const label = active
      ? `🔥 FEVER ${((b.feverUntil - now) / 1000).toFixed(1)}s · 공속·치명·골드↑`
      : `🔥 FEVER ${Math.round(pct * 100)}%`;
    ctx.fillText(label, bx + 7, by + bh / 2 + 0.5);
    ctx.restore();
  }

  drawBossWarning(ctx, now) {
    const b = this.battle;
    if (!b || !Array.isArray(b.monsters)) return;
    const gy = this.groundY();
    const sc = this.scale();
    const px = this.heroVisX != null ? this.heroVisX : this.worldX(b.player.x);
    for (const m of b.monsters) {
      if (!m || m.dead || m.dying || !m.isBoss || !(m.windupHeavy || m.heavy) || !m.windupAt || now < m.windupAt) continue;
      const x = this.worldX(m.x);
      const y = gy - 84 * sc;
      const pulse = 0.5 + 0.5 * Math.sin(now / 65);
      const prog = clamp((now - m.windupAt) / Math.max(1, m.windupDur || 450), 0, 1);
      ctx.save();
      // v8.10.0 보스 강공격 위험 바닥 장판 (보스 → 영웅 방향 충격 구역)
      const zoneX = lerp(x, px, 0.55);
      const zoneW = Math.max(54 * sc, Math.abs(x - px) * 0.55);
      ctx.fillStyle = `rgba(255, 45, 45, ${(0.12 + 0.16 * prog).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(zoneX, gy + 3, zoneW, 18 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 85, 70, ${(0.55 + 0.4 * pulse).toFixed(3)})`;
      ctx.lineWidth = (2.2 + 1.4 * prog) * sc;
      ctx.beginPath();
      ctx.ellipse(zoneX, gy + 3, zoneW * (0.4 + 0.6 * prog), 18 * sc * (0.4 + 0.6 * prog), 0, 0, Math.PI * 2);
      ctx.stroke();
      // 보스 발밑 경고 링 + 타이밍 반격 탭 프롬프트
      ctx.strokeStyle = `rgba(255, 70, 70, ${0.65 + 0.3 * pulse})`;
      ctx.lineWidth = 2.6 * sc;
      ctx.beginPath();
      ctx.ellipse(x, gy + 2, 48 * sc * (1 + 0.08 * pulse), 13 * sc, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `900 ${Math.round(12 * sc)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = pulse > 0.5 ? '#ffe066' : '#ff9696';
      ctx.shadowColor = 'rgba(255,40,40,0.9)';
      ctx.shadowBlur = 10;
      ctx.fillText('⚠️ 강공격! ⚡지금 탭→반격!', x, y);
      ctx.restore();
    }
  }

  drawGraceBanner(ctx, W, now) {
    const b = this.battle;
    if (!b || !b.player) return;
    const p = b.player;
    const until = p.graceUntil || 0;
    if (p.dead || !until || now >= until) return;
    const total = ECON.reviveGraceMs || 3500;
    const left = Math.max(0, until - now);
    const k = clamp(left / total, 0, 1);
    const sc = Math.min(1.2, Math.max(0.9, W / 390));
    const w = Math.min(W * 0.72, 268);
    const hgt = 30;
    const x = (W - w) / 2;
    // 보스 바(62~106)·특수 모드 HUD(50~102)가 있으면 그 아래로, 없으면 상단 칩(스테이지) 바로 아래로
    const busy = !!(b.boss || b.dungeon || b.tower || b.daily || b.invasion || b.rift || b.raid);
    const y = busy ? 112 : 44;
    const pulse = 0.7 + 0.3 * Math.sin(now / 130);
    ctx.save();
    ctx.shadowColor = 'rgba(120,200,255,0.85)';
    ctx.shadowBlur = 14 * pulse;
    const g = ctx.createLinearGradient(x, y, x, y + hgt);
    g.addColorStop(0, 'rgba(26,62,96,0.95)');
    g.addColorStop(1, 'rgba(12,30,52,0.95)');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, hgt, 9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(160,225,255,${0.5 + 0.35 * pulse})`;
    ctx.lineWidth = 1.6;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, hgt - 1, 8);
    ctx.stroke();
    // 남은 시간 게이지
    ctx.fillStyle = 'rgba(140,215,255,0.2)';
    roundRect(ctx, x + 7, y + hgt - 5, w - 14, 3, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(185,238,255,0.92)';
    roundRect(ctx, x + 7, y + hgt - 5, Math.max(1, (w - 14) * k), 3, 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8f6ff';
    ctx.font = `900 ${Math.round(11 * sc)}px ${FONT}`;
    ctx.fillText(`🛡 부활 가호 · 피해 ${Math.round((1 - ECON.reviveGraceReduce) * 100)}% 경감 · ${(left / 1000).toFixed(1)}초`, x + w / 2, y + 18);
    ctx.restore();
  }

  drawBossBar(ctx, W, now) {
    const b = this.battle;
    const m = b.boss;
    if (!m) return;
    const bw = Math.min(W * 0.72, 320);
    const bx = (W - bw) / 2;
    const by = 62; // 상단 DOM 칩(스테이지/보스 버튼) 아래로
    const pctv = Math.max(0, m.hp / m.maxHp);
    const tNow = typeof now === 'number' ? now : Date.now();
    const remain = Math.max(0, b.bossEnds - tNow);
    const broken = !!(m.brokenUntil && tNow < m.brokenUntil);
    const brPct = m.breakMax ? Math.max(0, Math.min(1, (m.breakVal || 0) / m.breakMax)) : 1;
    ctx.fillStyle = 'rgba(8,10,16,0.75)';
    roundRect(ctx, bx - 6, by - 8, bw + 12, 54, 8);
    ctx.fill();
    ctx.font = `800 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = broken ? '#7ff6ff' : m.enraged ? '#ff6b57' : '#ffb4a2';
    ctx.fillText(`👑 ${m.ko}${broken ? ' 💥그로기!' : m.enraged ? ' 🔥광폭' : ''}`, bx + 2, by + 6);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`${(remain / 1000).toFixed(0)}s`, bx + bw - 2, by + 6);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, bx, by + 12, bw, 10, 5);
    ctx.fill();
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#ff6b6b');
    grad.addColorStop(1, '#ffb347');
    ctx.fillStyle = grad;
    roundRect(ctx, bx, by + 12, Math.max(2, bw * pctv), 10, 5);
    ctx.fill();
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`${Math.ceil(m.hp).toLocaleString()} / ${m.maxHp.toLocaleString()}`, bx + bw / 2, by + 21);
    // v8.16.0 🛡️ 보스 브레이크(그로기) 게이지 바
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, bx, by + 26, bw, 6, 3);
    ctx.fill();
    ctx.fillStyle = broken ? '#ffe066' : '#69d2ff';
    const brFill = broken ? Math.max(0, Math.min(1, (m.brokenUntil - tNow) / 4000)) : brPct;
    roundRect(ctx, bx, by + 26, Math.max(2, bw * brFill), 6, 3);
    ctx.fill();
    ctx.font = `800 9px ${FONT}`;
    ctx.fillStyle = broken ? '#ffe066' : 'rgba(168,230,255,0.85)';
    ctx.fillText(broken ? `💥 BREAK 그로기 (${((m.brokenUntil - tNow) / 1000).toFixed(1)}s · 피해 ×1.5)` : `🛡️ BREAK ${Math.round(brPct * 100)}%`, bx + bw / 2, by + 41);
  }
}
