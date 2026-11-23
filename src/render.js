// land-rpg / src/render.js
// 상단 Canvas 자동사냥 뷰 렌더러. 전투 로직은 combat.js, 여기서는 그리기만 한다.
// v2: 새 스프라이트(대기/공격/스킬 3프레임) + 검기 아크·타격 스파크·스킬 이펙트.
//     배경은 오프스크린 캔버스에 한 번만 그려 매 프레임 비용을 줄인다(모바일 발열/멈춤 방지).
import { ECON, THEMES, spriteSrc } from './data.js';

const rnd = (seed) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) * (1 - clamp(t, 0, 1));
const FONT = 'system-ui, -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

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
    this.shake = 0;
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
        this.addFloater(ev.x, ev.dmg, ev.crit, ev.kind);
        this.burst(ev.x, ev.crit ? '#ffd76a' : '#fff1cf', ev.crit ? 12 : 7, ev.isBoss);
        if (ev.crit) {
          this.shake = Math.max(this.shake, 6);
          this.flash = Math.max(this.flash, 0.22);
        } else {
          this.shake = Math.max(this.shake, 1.6);
        }
        if (ev.kind === 'strike') {
          this.fx.push({ key: 'strikeHit', x: ev.x, t0: now, dur: 380 });
          this.flash = Math.max(this.flash, 0.18);
        }
      } else if (ev.t === 'playerHurt') {
        this.shake = Math.max(this.shake, 3.4);
        this.redFlash = Math.max(this.redFlash, 0.4);
        this.addFloater(ECON.playerX, ev.dmg, false, 'hurt');
        // 몬스터의 할퀴기 자국(붉은 아크)
        this.arcs.push({ x: ECON.playerX + 26, t0: now, dur: 300, dx: 0, y: 48, r: 30, a0: -0.9, sweep: 1.6, color: '#ff9b8a', alpha: 0.9, w: 5 });
        this.sparks.push({
          x: ECON.playerX + 20,
          y: this.groundY() - 46 * this.scale(),
          life: 1,
          vx: 40,
          vy: -40,
          color: '#ff8f8f',
        });
      } else if (ev.t === 'monsterDeath') {
        this.burst(ev.x, ev.isBoss ? '#ffcf6a' : '#d7e2f2', ev.isBoss ? 34 : 16, true);
        if (ev.isBoss) {
          this.shake = 11;
          this.flash = Math.max(this.flash, 0.3);
        }
        if (ev.gold) this.addFloater(ev.x, `+${ev.gold}`, false, 'gold');
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
          this.addFloater(ECON.playerX, `+${ev.heal || 0}`, false, 'heal');
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
      } else if (ev.t === 'bossStart') {
        this.shake = 8;
        this.flash = Math.max(this.flash, 0.16);
      } else if (ev.t === 'levelUp') {
        this.rings.push({ x: ECON.playerX, life: 1, r: 10, color: '#ffe08a', wide: 1.2 });
      }
    }
  }

  addFloater(x, text, crit, kind) {
    this.floaters.push({
      x,
      y: 0,
      text: String(text),
      crit,
      kind,
      life: 1,
      vx: (Math.random() - 0.5) * 26,
      vy: crit ? -84 : -60,
    });
    if (this.floaters.length > 40) this.floaters.shift();
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
    if (this.shake > 0.15) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.87;
    } else {
      this.shake = 0;
    }
    if (this.bg) ctx.drawImage(this.bg, 0, 0, W, H);
    else this.paintBackground(ctx, W, H);
    this.drawAmbient(ctx, dt, W, H);

    if (this.battle) {
      this.drawMonsters(ctx, t, dt);
      this.drawPlayer(ctx, t, dt);
      if (this.effects) {
        this.drawFx(ctx, t);
        this.drawArcs(ctx, t);
        this.drawRings(ctx, dt);
        this.drawSparks(ctx, dt);
        this.drawEmbers(ctx, dt);
        this.drawFloaters(ctx, dt, t);
      } else {
        this.fx = [];
        this.rings = [];
        this.sparks = [];
        this.floaters = [];
      }
      this.drawBossBar(ctx, W, t);
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

  /* ─────────── 플레이어 ─────────── */
  drawPlayer(ctx, now, dt) {
    const b = this.battle;
    const p = b.player;
    const gy = this.groundY();
    const sc = this.scale();
    const h = Math.min(this.H * 0.5, 148 * sc);
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
    if (this.effects && attacking) this.drawSlash(ctx, px, gy, h, sc, atkK, p.attackKind);
  }

  drawSlash(ctx, px, gy, h, sc, k, kind) {
    const cx = px + h * 0.12;
    const cy = gy - h * 0.56;
    const r = h * 0.52;
    const fade = 1 - k;
    const start = -1.25;
    const sweep = lerp(0.25, 1.85, easeOut(k));
    const alpha = fade * (kind === 'whirl' ? 0.75 : 0.95);
    const gold = kind === 'strike' ? '#ffe9a8' : '#fff3cf';
    ctx.save();
    ctx.lineCap = 'round';
    // 바깥 글로우
    ctx.globalAlpha = alpha * 0.35;
    ctx.strokeStyle = kind === 'strike' ? '#ffb347' : '#ffd76a';
    ctx.lineWidth = 16 * sc * fade;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.stroke();
    // 본체
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffc94d';
    ctx.lineWidth = 7 * sc * fade;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.stroke();
    // 코어
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2.5 * sc;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.stroke();
    ctx.restore();
  }

  /* ─────────── 몬스터 ─────────── */
  drawMonsters(ctx, now, dt) {
    const b = this.battle;
    const gy = this.groundY();
    const sc = this.scale();
    for (const m of b.monsters) {
      if (!Number.isFinite(m.x)) continue;
      const knock = Number.isFinite(m.knock) ? m.knock : 0;
      const x = this.worldX(m.x + knock);
      const lungeAge = now - (m.lungeAt || 0);
      const lunge = lungeAge >= 0 && lungeAge < 240 ? (1 - lungeAge / 240) : 0;
      let h = (m.isBoss ? 176 : 92) * sc * (m.isBoss ? 1 : m.scale);
      h = Math.min(h, this.H * (m.isBoss ? 0.66 : 0.44));
      const w = h;
      let alpha = 1;
      let sink = 0;
      let rot = 0;
      if (m.dying) {
        const k = clamp((now - m.dying) / 450, 0, 1);
        alpha = 1 - k;
        sink = k * 16 * sc;
        rot = k * 0.35;
      }
      const hitAge = now - (m.hitAt || 0);
      const hit = hitAge >= 0 && hitAge < 120;
      const pop = hit ? 1 + 0.07 * (1 - hitAge / 120) : 1;
      const bob = Math.sin(now / 260 + m.animSeed) * 2.4 * sc;
      const lungeX = -lunge * 16 * sc;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(x, gy + 2, w * 0.28, w * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      const cxp = x + lungeX;
      const cyp = gy - h * 0.5 + bob + sink;
      if (m.isBoss) {
        const grd = ctx.createRadialGradient(cxp, cyp, 6, cxp, cyp, h * 0.8);
        grd.addColorStop(0, 'rgba(255,70,50,0.22)');
        grd.addColorStop(1, 'rgba(255,70,50,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(cxp - h, cyp - h, h * 2, h * 2);
      }
      const img = this.image(m.name);
      if (img) {
        ctx.save();
        ctx.translate(cxp, cyp);
        if (rot) ctx.rotate(rot);
        ctx.scale(pop, pop);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        if (hit) {
          const white = this.whiteOf(m.name, img);
          if (white) {
            ctx.globalAlpha = 0.85 * (1 - hitAge / 120);
            ctx.drawImage(white, -w / 2, -h / 2, w, h);
            ctx.globalAlpha = Math.max(0, alpha);
          }
        }
        ctx.restore();
      } else {
        ctx.fillStyle = '#7d8fa6';
        ctx.beginPath();
        ctx.arc(cxp, cyp, h * 0.33, 0, Math.PI * 2);
        ctx.fill();
      }

      // 체력바
      if (!m.dying) {
        const bw = m.isBoss ? 96 * sc : 46 * sc;
        const bh = m.isBoss ? 6 : 4.5;
        const bx = cxp - bw / 2;
        const by = cyp - h * 0.55 - 10;
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
      } else if (f.key === 'heal') {
        // 치유: 발치에서 올라오는 초록 빛 입자 + 부드러운 고리
        ctx.globalAlpha = fade * 0.75;
        ctx.strokeStyle = '#8ff0a4';
        ctx.lineWidth = 2.5 * sc;
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
      ctx.fillStyle = e.life > 0.5 ? '#ffb066' : '#ff6a4d';
      const x = this.worldX(e.x);
      ctx.beginPath();
      ctx.arc(x, e.y, e.s * (0.5 + e.life), 0, Math.PI * 2);
      ctx.fill();
      e.life -= dt / 900;
    }
    this.embers = this.embers.filter((e) => e.life > 0);
    ctx.globalAlpha = 1;
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
      const base = f.crit ? 24 : f.kind === 'gold' ? 13 : f.kind === 'heal' ? 16 : 16;
      const pop = f.age < 130 ? 1 + (1 - f.age / 130) * 0.45 : 1;
      ctx.font = `900 ${base * Math.max(0.8, sc) * pop}px ${FONT}`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      const color =
        f.kind === 'gold'
          ? '#ffd76a'
          : f.kind === 'hurt'
          ? '#ff8080'
          : f.kind === 'heal'
          ? '#9dffb4'
          : f.crit
          ? '#ffe08a'
          : '#ffffff';
      ctx.fillStyle = color;
      ctx.strokeText(f.text, x, y);
      ctx.fillText(f.text, x, y);
      f.life -= dt / 900;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    ctx.globalAlpha = 1;
  }

  drawBossBar(ctx, W, now) {
    const b = this.battle;
    const m = b.boss;
    if (!m) return;
    const bw = Math.min(W * 0.72, 320);
    const bx = (W - bw) / 2;
    const by = 52; // 상단 DOM 칩(스테이지/보스 버튼) 아래로
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
