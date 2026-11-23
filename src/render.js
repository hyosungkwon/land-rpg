// land-rpg / src/render.js
// 상단 Canvas 자동사냥 뷰 렌더러. 전투 로직은 combat.js, 여기서는 그리기만 한다.
import { ECON, THEMES, monsterSrc } from './data.js';

const rnd = (seed) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.battle = null;
    this.theme = THEMES[0];
    this.dpr = 1;
    this.W = 0;
    this.H = 0;
    this.images = new Map();
    this.floaters = [];
    this.sparks = [];
    this.rings = [];
    this.shake = 0;
    this.ambient = [];
    this.bgSeed = 1;
    this.time = 0;
    this.lastFrame = 0;
    this.renderScale = 1;
    this.effects = true;
    this.resize();
    this.initAmbient();
  }

  setBattle(battle) {
    this.battle = battle;
    this.syncTheme();
  }

  syncTheme() {
    if (!this.battle) return;
    const t = this.battle.def.theme;
    if (t && t.id !== this.theme.id) {
      this.theme = t;
      this.bgSeed = THEMES.indexOf(t) + 1;
      this.initAmbient();
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
    const cfg = lists[this.theme.id] || lists.meadow;
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
            if (this.images.has(n)) return resolve();
            const img = new Image();
            img.onload = () => {
              this.images.set(n, img);
              resolve();
            };
            img.onerror = () => {
              this.images.set(n, null);
              resolve();
            };
            img.src = monsterSrc(n);
          }),
      ),
    );
  }

  image(name) {
    if (!this.images.has(name)) {
      const img = new Image();
      img.onload = () => this.images.set(name, img);
      img.onerror = () => this.images.set(name, null);
      img.src = monsterSrc(name);
      this.images.set(name, null);
      return null;
    }
    return this.images.get(name);
  }

  /* ─────────── 이벤트 → 시각효과 ─────────── */
  onEvents(events) {
    for (const ev of events) {
      if (ev.t === 'hit') {
        this.addFloater(ev.x, ev.dmg, ev.crit, ev.kind);
        this.sparks.push({ x: ev.x, y: this.groundY() - 40 * this.scale(), life: 1, vx: (Math.random() - 0.5) * 90, vy: -60 * Math.random(), color: ev.crit ? '#ffd76a' : '#ffe9c9' });
        if (ev.crit) this.shake = Math.max(this.shake, 4);
      } else if (ev.t === 'playerHurt') {
        this.shake = Math.max(this.shake, 2.5);
        this.addFloater(ECON.playerX, ev.dmg, false, 'hurt');
      } else if (ev.t === 'monsterDeath') {
        for (let i = 0; i < 10; i++) {
          this.sparks.push({
            x: ev.x,
            y: this.groundY() - 40 * this.scale(),
            life: 1,
            vx: (Math.random() - 0.5) * 160,
            vy: -70 * Math.random() - 20,
            color: ev.isBoss ? '#ffb74d' : '#c9d6e6',
          });
        }
        if (ev.isBoss) this.shake = 9;
        if (ev.gold) this.addFloater(ev.x, `+${ev.gold}`, false, 'gold');
      } else if (ev.t === 'skill') {
        if (ev.key === 'whirl') this.rings.push({ x: ECON.playerX, life: 1, r: 30, color: '#7fd3ff' });
        if (ev.key === 'strike') this.rings.push({ x: ev.x || ECON.playerX, life: 1, r: 10, color: '#ffce54' });
        if (ev.key === 'heal') this.rings.push({ x: ECON.playerX, life: 1, r: 16, color: '#7fe08a' });
        if (ev.key === 'berserk') this.rings.push({ x: ECON.playerX, life: 1, r: 20, color: '#ff7a59' });
      } else if (ev.t === 'bossStart') {
        this.shake = 7;
      }
    }
  }

  addFloater(x, text, crit, kind) {
    this.floaters.push({ x, y: 0, text: String(text), crit, kind, life: 1, vx: (Math.random() - 0.5) * 24, vy: crit ? -70 : -52 });
    if (this.floaters.length > 40) this.floaters.shift();
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
    const dt = this.lastFrame ? Math.min(60, now - this.lastFrame) : 16;
    this.lastFrame = now;
    this.time += dt;
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    if (!W || !H) {
      this.resize();
      return;
    }
    this.syncTheme();
    ctx.clearRect(0, 0, W, H);

    const sh = this.shake;
    if (sh > 0.2) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
      this.shake *= 0.86;
    }
    this.drawBackground(ctx, W, H);
    if (this.battle) {
      this.drawMonsters(ctx, now, dt);
      this.drawPlayer(ctx, now);
      if (this.effects) {
        this.drawRings(ctx);
        this.drawSparks(ctx, dt);
        this.drawFloaters(ctx, dt);
      } else {
        this.rings = [];
        this.sparks = [];
        this.floaters = [];
      }
      this.drawBossBar(ctx, W);
    }
    this.drawAmbient(ctx, dt, W, H);
    if (sh > 0.2) ctx.restore();
  }

  drawBackground(ctx, W, H) {
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
      const h = gy * (0.08 + rnd(i * 3 + this.bgSeed) * 0.12);
      ctx.fillStyle = t.near;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      if (this.theme.id === 'desert') {
        ctx.moveTo(x - h * 0.5, gy - h * 0.1);
        ctx.lineTo(x, gy - h);
        ctx.lineTo(x + h * 0.5, gy - h * 0.1);
      } else if (this.theme.id === 'ruins' || this.theme.id === 'abyss') {
        ctx.rect(x - h * 0.12, gy - h * 1.2, h * 0.24, h * 1.2);
      } else if (this.theme.id === 'cave') {
        ctx.moveTo(x - h * 0.4, gy);
        ctx.lineTo(x, gy - h * 0.9);
        ctx.lineTo(x + h * 0.4, gy);
      } else {
        ctx.moveTo(x, gy - h * 1.3);
        ctx.lineTo(x + h * 0.42, gy);
        ctx.lineTo(x - h * 0.42, gy);
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
    // 잔디/자갈
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

  drawPlayer(ctx, now) {
    const b = this.battle;
    const p = b.player;
    const gy = this.groundY();
    const sc = this.scale();
    const h = Math.min(this.H * 0.42, 118 * sc);
    const w = h * 0.95;
    const px = this.worldX(p.x);
    const bob = Math.sin(now / 320) * 2.2 * sc;
    const dead = p.dead;
    const hurt = now - p.hurtAt < 160;

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(px, gy + 2, w * 0.32, w * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // 광폭 오라
    if (b.berserkUntil > now) {
      const a = 0.18 + Math.sin(now / 90) * 0.08;
      const grd = ctx.createRadialGradient(px, gy - h * 0.4, 4, px, gy - h * 0.4, h * 0.85);
      grd.addColorStop(0, `rgba(255,110,70,${a})`);
      grd.addColorStop(1, 'rgba(255,110,70,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(px - h, gy - h * 1.3, h * 2, h * 1.4);
    }

    const img = this.images.get('warrior');
    ctx.save();
    ctx.translate(px, gy - h * 0.5 + bob);
    ctx.scale(-1, 1); // 오른쪽(적)을 바라보게
    if (dead) {
      ctx.globalAlpha = 0.35;
      ctx.rotate(0.5);
    }
    if (hurt) {
      ctx.globalAlpha = 0.75;
    }
    if (img) {
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      if (hurt) {
        // 스프라이트 픽셀만 밝게 (투명 픽셀은 영향 없음)
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.fillStyle = '#8ea2bb';
      ctx.fillRect(-w / 2 + w * 0.2, -h / 2 + h * 0.15, w * 0.6, h * 0.8);
    }
    ctx.restore();

    // 공격 이펙트(베기)
    const at = p.lastAttack;
    const age = now - at;
    if (age < 170) {
      const k = age / 170;
      const sx = px + 8 * sc;
      const sy = gy - h * 0.5;
      ctx.strokeStyle = `rgba(255,240,200,${1 - k})`;
      ctx.lineWidth = 3 * sc;
      ctx.beginPath();
      ctx.arc(sx, sy, (26 + k * 26) * sc, -0.9, 0.7);
      ctx.stroke();
    }
  }

  drawMonsters(ctx, now, dt) {
    const b = this.battle;
    const gy = this.groundY();
    const sc = this.scale();
    for (const m of b.monsters) {
      const x = this.worldX(m.x);
      let h = (m.isBoss ? 150 : 74) * sc * (m.isBoss ? 1 : m.scale);
      h = Math.min(h, this.H * (m.isBoss ? 0.62 : 0.42));
      const w = h * (m.isBoss ? 0.95 : 1);
      let alpha = 1;
      let sink = 0;
      if (m.dying) {
        const k = Math.min(1, (now - m.dying) / 450);
        alpha = 1 - k;
        sink = k * 12 * sc;
      }
      const hit = now - m.hitAt < 130;
      const bob = Math.sin(now / 260 + m.animSeed) * 2.4 * sc;
      const lungeX = m.lunge ? -m.lunge * 8 * sc : 0;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(x, gy + 2, w * 0.3, w * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();

      const img = this.images.get(m.name);
      const cxp = x + lungeX;
      const cyp = gy - h * 0.5 + bob + sink;
      if (m.isBoss) {
        // 보스는 뒤에 붉은 기운
        const grd = ctx.createRadialGradient(cxp, cyp, 6, cxp, cyp, h * 0.9);
        grd.addColorStop(0, 'rgba(255,70,50,0.18)');
        grd.addColorStop(1, 'rgba(255,70,50,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(cxp - h, cyp - h, h * 2, h * 2);
      }
      if (img) {
        ctx.save();
        ctx.translate(cxp, cyp);
        ctx.scale(-1, 1); // 왼쪽(플레이어)을 향해
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        if (hit) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.55;
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = '#7d8fa6';
        ctx.beginPath();
        ctx.arc(cxp, cyp, h * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // 체력바
      if (!m.dying) {
        const bw = m.isBoss ? 90 * sc : 42 * sc;
        const bh = m.isBoss ? 6 : 4;
        const bx = cxp - bw / 2;
        const by = cyp - h * 0.55 - 10;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx, by, bw, bh);
        const pct = Math.max(0, m.hp / m.maxHp);
        ctx.fillStyle = pct > 0.5 ? '#4fd18b' : pct > 0.22 ? '#f1c40f' : '#e74c3c';
        ctx.fillRect(bx, by, bw * pct, bh);
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
      }
      ctx.restore();
    }
  }

  drawRings(ctx) {
    const gy = this.groundY();
    const sc = this.scale();
    for (const r of this.rings) {
      const k = 1 - r.life;
      const cx = this.worldX(r.x);
      const cy = gy - 34 * sc;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.life * 0.8;
      ctx.lineWidth = 3 * r.life * sc;
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
      s.vy += 260 * (dt / 1000);
      s.y += (s.vy * dt) / 1000;
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.color;
      const x = this.worldX(s.x);
      ctx.fillRect(x, Math.min(gy, s.y), 2.4, 2.4);
      s.life -= dt / 600;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    ctx.globalAlpha = 1;
  }

  drawFloaters(ctx, dt) {
    const gy = this.groundY();
    const sc = this.scale();
    for (const f of this.floaters) {
      f.y += (f.vy * dt) / 1000;
      f.vy += 40 * (dt / 1000);
      f.x += (f.vx * dt) / 1000;
      const x = this.worldX(f.x);
      const y = gy - 40 * sc + f.y;
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.textAlign = 'center';
      const size = f.crit ? 20 : f.kind === 'gold' ? 13 : 15;
      ctx.font = `800 ${size * Math.max(0.8, sc)}px system-ui, -apple-system, "Malgun Gothic", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      const color =
        f.kind === 'gold' ? '#ffd76a' : f.kind === 'hurt' ? '#ff7b7b' : f.crit ? '#ffe08a' : '#ffffff';
      ctx.fillStyle = color;
      ctx.strokeText(f.text, x, y);
      ctx.fillText(f.text, x, y);
      f.life -= dt / 900;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    ctx.globalAlpha = 1;
  }

  drawBossBar(ctx, W) {
    const b = this.battle;
    const m = b.boss;
    if (!m) return;
    const bw = Math.min(W * 0.72, 320);
    const bx = (W - bw) / 2;
    const by = 52; // 상단 DOM 칩(스테이지/보스 버튼) 아래로
    const pct = Math.max(0, m.hp / m.maxHp);
    const remain = Math.max(0, b.bossEnds - Date.now());
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    roundRect(ctx, bx - 6, by - 8, bw + 12, 44, 8);
    ctx.fill();
    ctx.font = '800 12px system-ui, -apple-system, "Malgun Gothic", sans-serif';
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
    roundRect(ctx, bx, by + 12, Math.max(2, bw * pct), 10, 5);
    ctx.fill();
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`${Math.ceil(m.hp).toLocaleString()} / ${m.maxHp.toLocaleString()}`, bx + bw / 2, by + 21);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
