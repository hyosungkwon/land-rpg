// land-rpg / src/render.js
// 상단 Canvas 자동사냥 뷰 렌더러. 전투 로직은 combat.js, 여기서는 그리기만 한다.
// v2: 새 스프라이트(대기/공격/스킬 3프레임) + 검기 아크·타격 스파크·스킬 이펙트.
//     배경은 오프스크린 캔버스에 한 번만 그려 매 프레임 비용을 줄인다(모바일 발열/멈춤 방지).
import { ECON, THEMES, spriteSrc, RARITIES, RARITY_INDEX, monsterMotion, monsterAttack } from './data.js';

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
    this.onLoot = null; // (kind) => void  · 코인/보석이 캐릭터에 빨려 들어올 때
    this._rar = { weapon: 0, avg: 0, hasLegend: false };
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
        this.burst(ev.x, ev.crit ? '#ffd76a' : '#fff1cf', ev.crit ? 18 : 8, ev.isBoss);
        if (ev.crit) {
          this.burst(ev.x, '#ff6a4d', 7, false);
          this.rings.push({ x: ev.x, life: 1, r: 12, color: '#ffd76a', wide: 1.8 });
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
        if (ev.ranged) {
          // 원거리: 투사체가 날아가 명중할 때 숫자·플래시를 보여 준다(약 0.24초 뒤)
          this.delayedHits.push({ at: now + 235, dmg: ev.dmg });
          this.shake = Math.max(this.shake, 1.2);
        } else {
          this.shake = Math.max(this.shake, ev.heavy ? 5.2 : 3.4);
          this.redFlash = Math.max(this.redFlash, 0.4);
          this.addFloater(ECON.playerX, ev.dmg, false, 'hurt');
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
        if (ev.gold) this.addFloater(ev.x, `+${ev.gold}`, false, 'gold');
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
      } else if (ev.t === 'petHit') {
        // 동행 펫의 공격 — 펫 색의 작은 참격과 숫자
        this.addFloater(ev.x, ev.dmg, false, 'pet', ev.color);
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
        this.shake = 8;
        this.flash = Math.max(this.flash, 0.16);
        this.bossAlert = now;
        // 위압감 있는 등장: 발밑 충격파 + 지면 먼지 파도
        this.bossRoar = { t0: now, x: Number.isFinite(ev.x) ? ev.x : ECON.spawnX };
        const gyy = this.groundY();
        for (let i = 0; i < 16; i++) {
          this.puffs.push({
            x: this.worldX(Number.isFinite(ev.x) ? ev.x : ECON.spawnX) + (Math.random() - 0.5) * 60 * this.scale(),
            y: gyy - Math.random() * 6,
            r: (4 + Math.random() * 7) * this.scale(),
            vx: (Math.random() - 0.5) * 80,
            vy: -20 - Math.random() * 40,
            life: 1,
            color: 'rgba(255,190,140,0.42)',
          });
        }
        for (let i = 0; i < 2; i++) this.rings.push({ x: Number.isFinite(ev.x) ? ev.x : ECON.spawnX, life: 1, r: 20 + i * 18, color: '#ff7a5c', wide: 2.2 });
      } else if (ev.t === 'levelUp') {
        this.rings.push({ x: ECON.playerX, life: 1, r: 10, color: '#ffe08a', wide: 1.2 });
      }
    }
  }

  addFloater(x, text, crit, kind, color) {
    const now = Date.now();
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
      life: 1,
      at: now,
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

  /** BOSS 등장 경고 배너 (1.5초 슬라이드) */
  drawBossAlert(ctx, W, now) {
    if (!this.bossAlert) return;
    const DUR = 1500;
    const age = now - this.bossAlert;
    if (age < 0 || age > DUR) { this.bossAlert = 0; return; }
    const inK = easeOut(clamp(age / 240, 0, 1));
    const outK = clamp((DUR - age) / 320, 0, 1);
    const alpha = Math.min(inK, outK);
    const w = Math.min(W * 0.84, 330);
    const hgt = 52;
    const x = (W - w) / 2;
    const y = lerp(-hgt - 10, this.H * 0.46 - hgt / 2, inK);
    const pulse = 0.65 + 0.35 * Math.sin(age / 90);
    ctx.save();
    ctx.globalAlpha = alpha;
    // 바깥 붉은 글로우
    ctx.shadowColor = 'rgba(255,40,40,0.85)';
    ctx.shadowBlur = 22 * pulse;
    const g = ctx.createLinearGradient(x, y, x, y + hgt);
    g.addColorStop(0, 'rgba(190,20,28,0.95)');
    g.addColorStop(0.5, 'rgba(120,8,16,0.95)');
    g.addColorStop(1, 'rgba(190,20,28,0.95)');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, hgt, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,190,120,${0.55 + 0.35 * pulse})`;
    ctx.lineWidth = 2;
    roundRect(ctx, x + 1, y + 1, w - 2, hgt - 2, 9);
    ctx.stroke();
    // 좌우 경고 삼각형
    ctx.fillStyle = '#ffd76a';
    ctx.font = `900 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('◤', x + 16, y + hgt * 0.62);
    ctx.fillText('◥', x + w - 16, y + hgt * 0.62);
    ctx.fillStyle = '#fff3e0';
    ctx.font = `900 ${Math.round(20 * Math.min(1.2, Math.max(0.85, this.W / 390)))}px ${FONT}`;
    ctx.fillText('⚠ BOSS APPEAR!', x + w / 2, y + hgt * 0.5);
    const boss = this.battle && this.battle.boss;
    ctx.fillStyle = 'rgba(255,220,190,0.92)';
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText(boss ? `${boss.ko} 등장 — 60초 제한` : '보스 등장 — 60초 제한', x + w / 2, y + hgt * 0.82);
    ctx.restore();
  }

  /* ─────────── 장비 등급 색 (오라·검기) ─────────── */
  syncRarity() {
    const s = this.battle && this.battle.s;
    const gr = s && s.gearRarity;
    if (!gr) { this._rar = { weapon: 0, avg: 0, hasLegend: false }; return this._rar; }
    const key = `${gr.weapon}|${gr.armor}|${gr.helmet}|${gr.ring}|${gr.amulet}`;
    if (this._rarKey === key) return this._rar;
    this._rarKey = key;
    const ids = Object.keys(gr);
    const sum = ids.reduce((a, k) => a + (RARITY_INDEX[gr[k]] || 0), 0);
    this._rar = {
      weapon: RARITY_INDEX[gr.weapon] || 0,
      avg: ids.length ? Math.ceil(sum / ids.length - 1e-9) : 0,
      hasLegend: ids.some((k) => gr[k] === 'legend'),
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
      this.syncRarity();
      this.drawBossRoar(ctx, t);
      this.drawPuffs(ctx, dt);
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
        this.bossRoar = null;
        this.bossAlert = 0;
      }
      this.drawBossBar(ctx, W, t);
      this.drawDungeonHud(ctx, W, t);
      this.drawPromoteBanner(ctx, W, t);
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

  /* ─────────── 🐾 동행 펫 ─────────── */
  /** 주인공 뒤(왼쪽)에서 따라다니며, 공격할 때는 앞으로 튀어나간다. */
  drawPet(ctx, now, dt) {
    const b = this.battle;
    if (!b) return;
    const pet = b.activePet ? b.activePet() : null;
    if (!pet) {
      this.petX = null;
      return;
    }
    const gy = this.groundY();
    const sc = this.scale();
    const heroX = this.worldX(b.player.x);
    const h = Math.min(this.H * 0.3, 78 * sc) * (pet.id === 'dragon' ? 1.08 : 1);
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

    // 발밑·몸 주변 글로우(펫 색)
    const gl = ctx.createRadialGradient(x, gy - h * 0.36, 2, x, gy - h * 0.36, h * 0.72);
    gl.addColorStop(0, hexA(pet.color, 0.2 + lunge * 0.22));
    gl.addColorStop(1, hexA(pet.color, 0));
    ctx.fillStyle = gl;
    ctx.fillRect(x - h * 0.9, gy - h * 1.15, h * 1.8, h * 1.25);

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(x, gy + 2, w * 0.24, w * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    const img = this.image(pet.sprite);
    if (img) {
      ctx.drawImage(img, x - w / 2, gy - h + bob, w, h);
    } else {
      ctx.fillStyle = pet.color || '#9fc6ff';
      ctx.beginPath();
      ctx.arc(x, gy - h * 0.4 + bob, w * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    // 동행 이름표
    if (this.effects) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.font = `800 ${Math.round(9 * Math.max(0.85, sc))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = hexA(pet.color, 0.95);
      const label = `${pet.emoji || ''} ${pet.name}`.trim();
      const tw = ctx.measureText(label).width || 0;
      ctx.fillText(label, Math.max(tw / 2 + 3, x), gy - h - 3);
      ctx.restore();
    }
  }

  /* ─────────── 플레이어 ─────────── */
  drawPlayer(ctx, now, dt) {
    const b = this.battle;
    const p = b.player;
    const gy = this.groundY();
    const sc = this.scale();
    const h = Math.min(this.H * 0.44, 118 * sc);
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

    // 장비 등급 오라 (발밑·주변 색)
    if (this.effects && !dead) this.drawAura(ctx, px, gy, h, sc, now);

    // v3.8 부활 직후의 가호 — 잠깐 반투과 보호막(다굴 재시작 완충)
    if (!dead && p.graceUntil && now < p.graceUntil) {
      const k = Math.max(0, (p.graceUntil - now) / 3500);
      const rr = h * 0.62;
      const gg = ctx.createRadialGradient(px, gy - h * 0.5, rr * 0.35, px, gy - h * 0.5, rr);
      gg.addColorStop(0, 'rgba(150,220,255,0)');
      gg.addColorStop(0.75, `rgba(150,220,255,${0.16 * k})`);
      gg.addColorStop(1, `rgba(190,240,255,${0.34 * k})`);
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.ellipse(px, gy - h * 0.5, rr * 0.78, rr, 0, 0, Math.PI * 2);
      ctx.fill();
    }

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
      const pal = (RARITIES[wIdx] || RARITIES[0]).slash;
      this.drawSlash(ctx, px, gy, h, sc, atkK, p.attackKind, Math.min(reach * 0.82, 132 * sc), pal, wIdx);
    }
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
    const crowdK = crowd <= 2 ? 1 : Math.max(0.72, 1 - (crowd - 2) * 0.06);
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
      const depth = (lane * 15 + ((m.id % 3) - 1) * 2.5) * sc;
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
      this.addFloater(ECON.playerX, d.dmg, false, 'hurt');
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
      const base = f.crit ? 30 : f.kind === 'gold' ? 13 : f.kind === 'pet' ? 12 : f.kind === 'heal' ? 16 : 16;
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
