// land-rpg / src/render.js
// 상단 Canvas 자동사냥 뷰 렌더러. 전투 로직은 combat.js, 여기서는 그리기만 한다.
// v2: 새 스프라이트(대기/공격/스킬 3프레임) + 검기 아크·타격 스파크·스킬 이펙트.
//     배경은 오프스크린 캔버스에 한 번만 그려 매 프레임 비용을 줄인다(모바일 발열/멈춤 방지).
import { ECON, THEMES, spriteSrc, bgSrc, RARITIES, RARITY_INDEX, monsterMotion, monsterAttack } from './data.js';
import { equippedItem } from './gear.js';
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
        this.addFloater(ev.x, ev.dmg, ev.crit, ev.kind, null, bossHit ? 1.28 : 1, now);
        this.burst(ev.x, ev.crit ? '#ffd76a' : '#fff1cf', ev.crit ? 18 : 8, ev.isBoss);
        if (ev.crit) {
          this.burst(ev.x, '#ff6a4d', 7, false);
          this.rings.push({ x: ev.x, life: 1, r: 12, color: '#ffd76a', wide: 1.8 });
          this.addImpact(ev.x, { crit: true, boss: bossHit, color: '#ffe08a' }, now);
          this.shake = Math.max(this.shake, bossHit ? 7 : 5.4);
          this.flash = Math.max(this.flash, 0.2);
        } else {
          this.addImpact(ev.x, { crit: false, boss: bossHit, color: bossHit ? '#ffcf6a' : '#fff1cf' }, now);
          this.shake = Math.max(this.shake, bossHit ? 2.2 : 1.2);
        }
        if (ev.kind === 'strike') {
          this.fx.push({ key: 'strikeHit', x: ev.x, t0: now, dur: 380 });
          this.addImpact(ev.x, { crit: false, boss: bossHit, color: '#ffd166' }, now);
          this.flash = Math.max(this.flash, 0.18);
        }
        if (ev.kind === 'whirl') {
          this.rings.push({ x: ev.x, life: 1, r: 10, color: '#8fe4ff', wide: 1.2 });
        }
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
        this.fx.push({ key: ev.key, x: ev.x || ECON.playerX, t0: now, dur: ev.key === 'whirl' ? 560 : ev.key === 'strike' ? 420 : 760 });
        if (ev.key === 'whirl') {
          this.rings.push({ x: ECON.playerX, life: 1, r: 26, color: '#8fe4ff', wide: 1.4 });
          this.shake = Math.max(this.shake, 3);
          this.flash = Math.max(this.flash, 0.12);
        }
        if (ev.key === 'strike') {
          this.rings.push({ x: ev.x || ECON.playerX, life: 1, r: 12, color: '#ffd166', wide: 1 });
          this.shake = Math.max(this.shake, 4);
        }
        if (ev.key === 'heal') {
          this.rings.push({ x: ECON.playerX, life: 1, r: 18, color: '#8ff0a4', wide: 1 });
          this.addFloater(ECON.playerX, `+${ev.heal || 0}`, false, 'heal', null, 1, now);
        }
        if (ev.key === 'berserk') {
          this.rings.push({ x: ECON.playerX, life: 1, r: 20, color: '#ff7a59', wide: 1.6 });
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
    const now = Number.isFinite(at) ? at : Date.now();
    // v3.8 다굴: 같은 순간에 여러 마리가 때리면 피해 숫자를 하나로 합쳐 읽기 쉽게 한다
    if (kind === 'hurt') {
      const last = this.floaters[this.floaters.length - 1];
      if (last && last.kind === 'hurt' && now - (last.at || 0) < 190) {
        last.sum = (last.sum || Number(last.text) || 0) + (Number(text) || 0);
        last.text = String(last.sum);
        last.life = 1;
        last.at = now;
        return;
      }
    }
    this.floaters.push({
      x,
      y: 0,
      text: String(text),
      crit,
      kind,
      color: color || null,
      boost: Number(boost) > 0 ? Number(boost) : 1, // v4.3 보스 타격 등 숫자 강조 배율
      life: 1,
      at: now,
      vx: (Math.random() - 0.5) * 26,
      vy: crit ? -84 : -60,
    });
    if (this.floaters.length > 40) this.floaters.shift();
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
    const key = `${gr.weapon}|${gr.armor}|${gr.helmet}|${gr.ring}|${gr.amulet}|${wItem ? wItem.id : '-'}`;
    if (this._rarKey === key) return this._rar;
    this._rarKey = key;
    const ids = Object.keys(gr);
    const sum = ids.reduce((a, k) => a + (RARITY_INDEX[gr[k]] || 0), 0);
    const wIdx = RARITY_INDEX[gr.weapon] || 0;
    this._rar = {
      weapon: wIdx,
      avg: ids.length ? Math.ceil(sum / ids.length - 1e-9) : 0,
      hasLegend: ids.some((k) => gr[k] === 'legend'),
      weaponGear: wItem,
      // 무기 고유 검기 색(화염검·빙결검·천둥창…) — 없으면 등급 색을 쓴다
      pal: wItem && wItem.fx ? wItem.fx : (RARITIES[wIdx] || RARITIES[0]).slash,
      tint: wItem ? wItem.tint : null,
    };
    return this._rar;
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
    // 전설: 불타는 적금빛 화염
    if (idx >= 4) {
      const f = ctx.createLinearGradient(px, gy - h * 0.9, px, gy);
      f.addColorStop(0, 'rgba(255,90,40,0)');
      f.addColorStop(0.6, `rgba(255,122,61,${0.10 + 0.06 * pulse})`);
      f.addColorStop(1, `rgba(255,210,80,${0.16 + 0.08 * pulse})`);
      ctx.fillStyle = f;
      ctx.fillRect(px - h * 0.34, gy - h * 0.95, h * 0.68, h * 0.95);
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

  /* ─────────── 프레임 ─────────── */
  frame(now) {
    const t = typeof now === 'number' && isFinite(now) ? now : Date.now();
    const dt = this.lastFrame ? clamp(t - this.lastFrame, 0, 100) : 16;
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
      this.drawTowerHud(ctx, W, t);
      this.drawTowerBanner(ctx, W, t);
      this.drawPromoteBanner(ctx, W, t);
      this.drawGraceBanner(ctx, W, t); // v4.3 부활 가호 남은 시간 배너
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

  /* ─────────── 🐾 동행 펫 ─────────── */
  /** 주인공 뒤(왼쪽)에서 따라다니며, 공격할 때는 앞으로 튀어나간다. (v5.3: 보조 펫 함께 표시) */
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
    const heroX = this.worldX(b.player.x);
    // v4.2: 진화 단계 — 이름·스프라이트·크기·색이 단계마다 달라진다
    const info = petStageInfo(b.s, pet.id);
    const stage = info.stage || 0;
    const petColor = info.color || pet.color;
    const h = Math.min(this.H * 0.3, 78 * sc) * (pet.id === 'dragon' ? 1.08 : 1) * (info.scale || 1);
    const w = h;
    // 화면 왼쪽 밖으로 잘리지 않도록 위치를 보정한다(좁은 390px 화면 대응)
    const home = Math.max(w * 0.5 + 4, heroX - Math.min(76 * sc, w * 0.9));
    const sway = Math.sin(now / 640) * 7 * sc;
    if (this.petX == null || !isFinite(this.petX)) this.petX = home;
    this.petX += (home - this.petX) * Math.min(1, dt / 150);
    const lungeAge = now - (b.petAnimAt || 0);
    const lunge = lungeAge >= 0 && lungeAge < 260 ? Math.sin(Math.PI * (1 - lungeAge / 260)) : 0;
    const x = Math.max(w * 0.5 + 2, this.petX + sway + lunge * 56 * sc);
    const bob = Math.sin(now / 300 + 1.7) * 2.2 * sc - lunge * 5 * sc;

    // 발밑·몸 주변 글로우(펫 색) — 진화할수록 진하고 넓다
    const auraK = 0.2 + stage * 0.12;
    const gl = ctx.createRadialGradient(x, gy - h * 0.36, 2, x, gy - h * 0.36, h * (0.72 + stage * 0.12));
    gl.addColorStop(0, hexA(petColor, auraK + lunge * 0.22));
    gl.addColorStop(1, hexA(petColor, 0));
    ctx.fillStyle = gl;
    ctx.fillRect(x - h * 1.05, gy - h * 1.3, h * 2.1, h * 1.4);

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(x, gy + 2, w * 0.24, w * 0.07, 0, 0, Math.PI * 2);
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
        ctx.ellipse(x, gy - h * 0.28 - i * 4 * sc, rr, rr * 0.3, Math.sin(now / 900 + i) * 0.12, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    const img = this.image(info.sprite || pet.sprite) || this.image(pet.sprite);
    if (img) {
      ctx.drawImage(img, x - w / 2, gy - h + bob, w, h);
    } else {
      ctx.fillStyle = petColor || '#9fc6ff';
      ctx.beginPath();
      ctx.arc(x, gy - h * 0.4 + bob, w * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

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
      ctx.fillText(label, Math.max(tw / 2 + 3, x), gy - h - 3);
      ctx.restore();
    }
  }

  /** v5.3 보조 펫 렌더 — 주 펫 뒤쪽 위에서 작게 동행 */
  drawSubPet(ctx, now, dt, pet) {
    const b = this.battle;
    const gy = this.groundY() - 10 * this.scale();
    const sc = this.scale();
    const heroX = this.worldX(b.player.x);
    const info = petStageInfo(b.s, pet.id);
    const petColor = info.color || pet.color;
    const h = Math.min(this.H * 0.24, 60 * sc) * (info.scale || 1) * 0.82;
    const w = h;
    const home = Math.max(w * 0.5 + 2, heroX - Math.min(118 * sc, w * 1.65));
    const sway = Math.sin(now / 710 + 1.1) * 5 * sc;
    if (this.subPetX == null || !isFinite(this.subPetX)) this.subPetX = home;
    this.subPetX += (home - this.subPetX) * Math.min(1, dt / 170);
    const lungeAge = now - (b.subPetAnimAt || 0);
    const lunge = lungeAge >= 0 && lungeAge < 240 ? Math.sin(Math.PI * (1 - lungeAge / 240)) : 0;
    const x = Math.max(w * 0.5 + 2, this.subPetX + sway + lunge * 42 * sc);
    const bob = Math.sin(now / 330 + 2.9) * 2 * sc - lunge * 4 * sc;

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, gy + 2, w * 0.22, w * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    const img = this.image(info.sprite || pet.sprite) || this.image(pet.sprite);
    if (img) ctx.drawImage(img, x - w / 2, gy - h + bob, w, h);
    else {
      ctx.fillStyle = petColor || '#9fc6ff';
      ctx.beginPath();
      ctx.arc(x, gy - h * 0.4 + bob, w * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ─────────── 플레이어 ─────────── */
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
    const attacking = atkAge >= 0 && atkAge < 240;
    const skilling = skAge >= 0 && skAge < 460;
    const atkK = clamp(atkAge / 240, 0, 1);

    // 공격 시 앞으로 파고드는 스텝(월드 x 는 그대로, 화면만)
    const step = attacking ? Math.sin(Math.PI * Math.min(1, atkK * 1.15)) * 24 * sc : 0;
    const px = baseX + step;
    const bob = attacking || skilling ? 0 : Math.sin(now / 320) * 2.2 * sc;
    const dead = p.dead;
    const hurt = now - p.hurtAt < 150;

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(px, gy + 2, w * 0.3, w * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();

    // v4.4 전직 오라 (칭호 색) → 그 위에 장비 등급 오라
    if (this.effects && !dead) this.drawJobAura(ctx, px, gy, h, sc, now);
    // 장비 등급 오라 (발밑·주변 색)
    if (this.effects && !dead) this.drawAura(ctx, px, gy, h, sc, now);
    // v4.3 부활 가호 — 빛 고리·보호막 + 머리 위 남은 초 (남은 시간은 상단 배너 drawGraceBanner)
    if (!dead && p.graceUntil && now < p.graceUntil) this.drawGrace(ctx, px, gy, h, sc, now, p.graceUntil);

    // 광폭 아우라
    if (b.berserkUntil > now) {
      const a = 0.2 + Math.sin(now / 90) * 0.08;
      const grd = ctx.createRadialGradient(px, gy - h * 0.42, 4, px, gy - h * 0.42, h * 0.8);
      grd.addColorStop(0, `rgba(255,110,70,${a})`);
      grd.addColorStop(1, 'rgba(255,110,70,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(px - h, gy - h * 1.2, h * 2, h * 1.3);
    }

    const frame = skilling ? 'hero_skill' : attacking ? 'hero_attack' : 'hero_idle';
    const img = this.image(frame);

    ctx.save();
    ctx.translate(px, gy - h * 0.5 + bob - (attacking ? 4 * sc : 0));
    if (dead) {
      ctx.globalAlpha = 0.35;
      ctx.rotate(0.5);
    } else if (hurt) {
      ctx.globalAlpha = 0.82;
    }
    if (attacking) ctx.rotate(-0.04 * (1 - atkK));
    if (img) {
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      if (hurt) {
        const white = this.whiteOf(frame, img);
        if (white) {
          ctx.globalAlpha = 0.55;
          ctx.drawImage(white, -w / 2, -h / 2, w, h);
          ctx.globalAlpha = 0.9;
        }
      }
    } else {
      ctx.fillStyle = '#8ea2bb';
      ctx.fillRect(-w / 2 + w * 0.2, -h / 2 + h * 0.15, w * 0.6, h * 0.8);
    }
    ctx.restore();

    // ── 검기 아크 ──
    if (this.effects && attacking) {
      let near = null;
      for (const m of b.monsters) if (!m.dead && !m.dying && (!near || m.x < near.x)) near = m;
      const reach = near ? Math.max(30 * sc, this.worldX(near.x) - px) : 62 * sc;
      const wIdx = this._rar.weapon;
      const pal = this._rar.pal || (RARITIES[wIdx] || RARITIES[0]).slash;
      this.drawSlash(ctx, px, gy, h, sc, atkK, p.attackKind, Math.min(reach * 0.9, 176 * sc), pal, wIdx);
    }
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

  drawSlash(ctx, px, gy, h, sc, k, kind, rIn, pal, rarityIdx = 0) {
    const cx = px + h * 0.1;
    const cy = gy - h * 0.56;
    const r = Math.max(26 * sc, rIn || h * 0.52);
    const fade = 1 - k;
    const start = -1.25;
    const sweep = lerp(0.25, 1.85, easeOut(k));
    const alpha = fade * (kind === 'whirl' ? 0.75 : 0.95);
    const core = kind === 'strike' ? '#ffe9a8' : (pal && pal.core) || '#fff3cf';
    const mid = kind === 'strike' ? '#ffc94d' : (pal && pal.mid) || '#ffd76a';
    const glow = kind === 'strike' ? '#ffb347' : (pal && pal.glow) || '#ffb347';
    ctx.save();
    ctx.lineCap = 'round';
    // 전설: 불타는 외곽 광휘
    if (rarityIdx >= 4 && kind !== 'strike') {
      ctx.globalAlpha = alpha * 0.42;
      ctx.strokeStyle = '#ff3b2f';
      ctx.lineWidth = 26 * sc * fade;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + sweep);
      ctx.stroke();
    }
    // 바깥 글로우
    ctx.globalAlpha = alpha * (0.35 + rarityIdx * 0.05);
    ctx.strokeStyle = glow;
    ctx.lineWidth = 20 * sc * fade;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.stroke();
    // 본체
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = mid;
    ctx.lineWidth = 9 * sc * fade;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.stroke();
    // 코어
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = core;
    ctx.lineWidth = 3.5 * sc;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.stroke();
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
    const crowdK = crowd <= 2 ? 1 : Math.max(0.58, 1 - (crowd - 2) * 0.085);
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
      const lunge = lungeAge >= 0 && lungeAge < 260 ? Math.sin(Math.PI * clamp(1 - lungeAge / 260, 0, 1)) : 0;
      const lane = m.isBoss ? 0 : (m.lane || 0);
      const depthScale = 1 + lane * 0.045;
      let h = (m.isBoss ? 168 : 84 * crowdK) * sc * (m.isBoss ? 1 : m.scale * depthScale);
      h = Math.min(h, this.H * (m.isBoss ? 0.62 : 0.38));
      const w = h;
      // 레인별 앞뒤 오프셋(뒤 레인은 위로, 앞 레인은 아래로) — 겹쳐도 깊이가 읽힌다
      const depth = (lane * 18 + ((m.id % 3) - 1) * 2.5) * sc;
      const hitAge = now - (m.hitAt || 0);
      const hitK = hitAge >= 0 && hitAge < 130 ? 1 - hitAge / 130 : 0;
      const pop = 1 + hitK * 0.08;

      // 이동 상태(정지하면 걸음 모션이 부드럽게 멈춘다)
      const moving = !!m.moving;
      const moveK = (m.__moveK = (m.__moveK || 0) + ((moving ? 1 : 0) - (m.__moveK || 0)) * Math.min(1, dt / 140));
      const walk = Number.isFinite(m.walk) ? m.walk : 0;
      const tsec = now / 1000;
      const seed = m.animSeed || 0;

      let lift = 0;         // 화면 위로 떠오르는 높이(px)
      let dx = 0;           // 좌우 오프셋(px)
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
          lift = hop * h * 0.32 * moveK;
          sx *= 1 + (0.22 * land - 0.07 * hop) * moveK;
          sy *= 1 - (0.22 * land - 0.06 * hop) * moveK;
          shadowK *= 1 - hop * 0.45 * moveK;
          shadowA *= 1 - hop * 0.35 * moveK;
          if (this.effects && moveK > 0.4 && m.__ph != null && ph < m.__ph - 0.5) {
            this.stepDust(x, gy, sc, 3, 'rgba(225,230,240,0.4)');
          }
          m.__ph = ph;
        } else {
          const j = Math.sin(tsec * 1.6 + seed); // 대기: 젤리처럼 출렁
          sy *= 1 + 0.045 * j;
          sx *= 1 - 0.038 * j;
        }
      } else if (arch === 'flyer') {
        // 공중 부유 + 날갯짓(빠른 신축) + 지면에서 뜬 그림자
        const flap = Math.sin(tsec * 9.5 + seed);
        lift = h * 0.15 + Math.sin(tsec * 2.4 + seed) * h * 0.04 + flap * h * 0.012;
        sx *= 1 + 0.038 * flap;
        sy *= 1 - 0.032 * flap;
        rot += Math.sin(tsec * 2.1 + seed * 0.6) * 0.05 - moveK * 0.045;
        dx += Math.sin(tsec * 1.7 + seed) * 2.4 * sc;
        shadowK *= 0.62;
        shadowA *= 0.62;
      } else {
        // 보행 — 좌우 걸음 바운스 + 앞쪽 기울기 + 발걸음 먼지
        const STEP = 22;
        const ph = (walk / STEP) % 2;
        const step = Math.abs(Math.sin(Math.PI * ph));
        lift = step * 4.4 * sc * moveK;
        dx += Math.sin(Math.PI * ph) * 1.5 * sc * moveK;
        rot += -0.05 * moveK + Math.sin(Math.PI * 2 * ph) * 0.014 * moveK;
        sx *= 1 + 0.022 * step * moveK;
        sy *= 1 - 0.02 * step * moveK;
        const half = Math.floor(ph);
        if (this.effects && moveK > 0.35 && m.__step != null && m.__step !== half) {
          this.stepDust(x + (half ? 1 : -1) * 6 * sc, gy, sc, 2, 'rgba(215,220,232,0.36)');
        }
        m.__step = half;
      }

      // 대기 중 호흡·살짝 흔들림(이동 중에는 약하게)
      const idle = 1 - moveK;
      if (idle > 0.02) {
        const breath = Math.sin(tsec * 1.8 + seed);
        sy *= 1 + 0.022 * breath * idle;
        sx *= 1 - 0.016 * breath * idle;
        dx += Math.sin(tsec * 0.9 + seed) * 1.2 * sc * idle;
        rot += Math.sin(tsec * 0.65 + seed) * 0.013 * idle;
      }

      // 공격 전조 — 뒤로 젖히며(원거리) / 웅크리며(근거리) 몸을 모은다
      const wuAge = now - (m.windupAt || 0);
      const wuDur = m.windupDur || 300;
      const winding = (m.windupAt || 0) > 0 && wuAge >= 0 && wuAge < wuDur;
      const wk = winding ? clamp(wuAge / wuDur, 0, 1) : 0;
      if (winding) {
        const e = easeOut(wk);
        if (m.atkKind === 'ranged') {
          rot += 0.13 * e;
          dx += 4 * sc * e;
          sy *= 1 + 0.055 * e;
          sx *= 1 + 0.02 * e;
          lift += 3 * sc * e + Math.sin(wuAge / 60) * 0.9 * sc * e;
        } else {
          dx += 13 * sc * e;
          sy *= 1 - 0.14 * e;
          sx *= 1 + 0.11 * e;
          rot += 0.11 * e;
        }
      }

      // 돌진 — 플레이어 쪽으로 빠르게 파고들며 앞으로 기운다
      if (lunge > 0) {
        dx -= (m.isBoss ? 54 : 38) * sc * lunge;
        rot -= 0.13 * lunge;
        sx *= 1 + 0.07 * lunge;
        sy *= 1 - 0.05 * lunge;
        lift += 2 * sc * lunge;
      }

      // 피격 — 밀려나며 찌그러지고 타격 방향으로 기운다
      if (hitK > 0) {
        dx += 8 * sc * hitK;
        rot += 0.2 * hitK;
        sx *= 1 + 0.12 * hitK;
        sy *= 1 - 0.1 * hitK;
      }

      // 사망 — 뒤로 튕겨 오르며 회전·축소되고 연기로 흩어진다
      let alpha = 1;
      if (m.dying) {
        const k = clamp((now - m.dying) / 450, 0, 1);
        alpha = 1 - k;
        dx += easeOut(k) * 72 * sc;
        rot += k * 1.7;
        lift += Math.sin(Math.PI * Math.min(1, k * 1.15)) * h * 0.14;
        sx *= 1 - 0.22 * k;
        sy *= 1 - 0.22 * k;
      }

      const footY = gy - lift + depth;
      const kx = sx * pop * depthScale;
      const ky = sy * pop * depthScale;
      const shadowScale = shadowK * (1 - clamp(lift / (h * 1.4), 0, 1) * 0.45);

      // 1) 지면 그림자
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha) * shadowA;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, gy + 2, w * 0.28 * shadowScale, w * 0.085 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      const auraY = footY - h * 0.5;
      if (m.isBoss) {
        const grd = ctx.createRadialGradient(x, auraY, 6, x, auraY, h * 0.8);
        grd.addColorStop(0, 'rgba(255,70,50,0.22)');
        grd.addColorStop(1, 'rgba(255,70,50,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(x - h, auraY - h, h * 2, h * 2);
      }
      // 황금 던전 몬스터: 금빛 광휘 + 잔불
      if (m.gold) {
        const gg = ctx.createRadialGradient(x, auraY, 6, x, auraY, h * 0.78);
        gg.addColorStop(0, 'rgba(255,205,80,0.3)');
        gg.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(x - h, auraY - h, h * 2, h * 2);
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
      if (this.effects && winding) this.drawWindup(ctx, m, x + dx, footY, h, sc, wk, color);

      // 3) 본체 — 발끝 기준 변형(스쿼시·기울기·회전)
      const img = this.image(m.name);
      ctx.save();
      ctx.translate(x + dx, footY);
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

      // 4) 체력바 — 무리가 많을 땐 다친 몬스터만 보여 화면이 지저분해지지 않게 한다
      const showBar = m.isBoss || m.hp < m.maxHp || (now - (m.hitAt || 0) < 900);
      if (!m.dying && showBar) {
        const bw = (m.isBoss ? 96 : 44 * Math.max(0.8, crowdK)) * sc;
        const bh = m.isBoss ? 6 : 4;
        const bx = x + dx - bw / 2;
        const by = footY - h * ky - 9 - lane * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        roundRect(ctx, bx - 1, by - 1, bw + 2, bh + 2, 2);
        ctx.fill();
        const pctv = Math.max(0, Math.min(1, m.hp / m.maxHp));
        ctx.fillStyle = pctv > 0.5 ? '#4fd18b' : pctv > 0.22 ? '#f1c40f' : '#e74c3c';
        if (pctv > 0) {
          roundRect(ctx, bx, by, Math.max(1, bw * pctv), bh, 2);
          ctx.fill();
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
      // v3.8 다굴: 여러 숫자가 동시에 뜨므로 기본 크기를 조금 줄여 화면이 덜 시끄럽게
      const base = (f.crit ? 25 : f.kind === 'gold' ? 12 : f.kind === 'pet' ? 11 : f.kind === 'heal' ? 15 : f.kind === 'hurt' ? 14 : 14) * (f.boost || 1);
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
    // 보스 바(62~106)·던전 HUD(54~100)·탑 HUD(50~102)가 있으면 그 아래로, 없으면 상단 침(스테이지) 바로 아래로
    const busy = !!(b.boss || b.dungeon || b.tower);
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
    const remain = Math.max(0, b.bossEnds - (typeof now === 'number' ? now : Date.now()));
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    roundRect(ctx, bx - 6, by - 8, bw + 12, 44, 8);
    ctx.fill();
    ctx.font = `800 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffb4a2';
    ctx.fillText(`👑 ${m.ko}`, bx + 2, by + 6);
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
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`${Math.ceil(m.hp).toLocaleString()} / ${m.maxHp.toLocaleString()}`, bx + bw / 2, by + 21);
  }
}
