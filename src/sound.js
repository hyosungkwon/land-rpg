// land-rpg / src/sound.js
// Web Audio 합성 효과음 — 외부 mp3 없이 코드로만 만든다.
//  ① 칼 타격(경쾌) ② 크리티컬 중저음 타격 ③ 코인 짤랑 ④ 보스 등장 경보 ⑤ 뽑기 팡파르
// 모바일 브라우저 정책: 첫 터치/클릭에서 unlock() 으로 AudioContext 를 깨운다.
// 모든 재생은 실패해도 게임을 멈추지 않도록 try/catch 로 감싼다.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

export class GameSound {
  constructor(enabled = true) {
    this.enabled = enabled !== false;
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.unlocked = false;
    this._lastHit = 0;
    this._lastCoin = 0;
  }

  setEnabled(v) {
    this.enabled = !!v;
    if (!this.enabled && this.ctx && this.ctx.state === 'running') {
      try { this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02); } catch (e) { /* ignore */ }
    } else if (this.enabled) {
      this.ensure();
      this.applyGain();
    }
  }

  /** 첫 사용자 제스처에서 호출 — AudioContext 생성/재개 */
  unlock() {
    const ctx = this.ensure();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended') {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      this.unlocked = true;
      this.applyGain();
    } catch (e) {
      return false;
    }
    return true;
  }

  applyGain() {
    if (!this.ctx || !this.master) return;
    try {
      const target = this.enabled ? 0.5 : 0;
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
    } catch (e) { /* ignore */ }
  }

  ensure() {
    if (this.ctx) return this.ctx;
    try {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
      return null;
    }
    return this.ctx;
  }

  noiseBuffer() {
    if (this.noise || !this.ctx) return this.noise;
    try {
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) {
      this.noise = null;
    }
    return this.noise;
  }

  /** 공통: 노이즈 한 방 (칼 타격 계열) */
  noiseHit(now, { freq = 1800, q = 0.9, gain = 0.16, dur = 0.09, type = 'bandpass' } = {}) {
    const ctx = this.ctx;
    const buf = this.noiseBuffer();
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = type;
    bp.frequency.setValueAtTime(freq, now);
    bp.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 0.45), now + dur);
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  /** 공통: 짧은 음 */
  tone(now, { freq = 880, to = null, dur = 0.12, gain = 0.12, type = 'sine', delay = 0 } = {}) {
    const ctx = this.ctx;
    const t = now + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  ready() {
    if (!this.enabled) return null;
    const ctx = this.ensure();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    }
    return ctx;
  }

  /** ① 경쾌한 칼 타격 / ② 크리티컬 중저음 타격 */
  hit(crit = false) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (!crit) {
      if (t - this._lastHit < 0.035) return; // 연타 시 소리 겹침 방지
      this._lastHit = t;
      this.noiseHit(t, { freq: 2600, q: 1.1, gain: 0.13, dur: 0.07 });
      this.tone(t, { freq: 1450, to: 780, dur: 0.06, gain: 0.05, type: 'triangle' });
    } else {
      this._lastHit = t;
      this.noiseHit(t, { freq: 1200, q: 0.8, gain: 0.2, dur: 0.12, type: 'lowpass' });
      this.tone(t, { freq: 180, to: 62, dur: 0.16, gain: 0.2, type: 'sine' });
      this.tone(t + 0.02, { freq: 320, to: 150, dur: 0.1, gain: 0.08, type: 'square' });
    }
  }

  /** ③ 코인 줍기 짤랑 */
  coin(kind = 'gold') {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this._lastCoin < 0.05) return;
    this._lastCoin = t;
    if (kind === 'gem') {
      this.tone(t, { freq: NOTE(88), dur: 0.1, gain: 0.09, type: 'triangle' });
      this.tone(t + 0.04, { freq: NOTE(95), dur: 0.12, gain: 0.07, type: 'sine' });
    } else {
      this.tone(t, { freq: NOTE(93), dur: 0.07, gain: 0.08, type: 'triangle' });
      this.tone(t + 0.045, { freq: NOTE(100), dur: 0.1, gain: 0.06, type: 'sine' });
    }
  }

  /** ④ 보스 등장 경보 */
  boss() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const d = i * 0.22;
      this.tone(t + d, { freq: 360, to: 240, dur: 0.16, gain: 0.13, type: 'sawtooth' });
      this.tone(t + d + 0.02, { freq: 720, to: 480, dur: 0.14, gain: 0.05, type: 'square' });
    }
    this.noiseHit(t, { freq: 420, q: 0.6, gain: 0.1, dur: 0.5, type: 'lowpass' });
  }

  /** ⑤ 뽑기 성공 팡파르 — 등급이 높을수록 길고 화려하다 */
  gacha(rarity = 'common') {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const table = {
      common: [60, 64, 67],
      advanced: [60, 64, 67, 72],
      rare: [62, 66, 69, 74, 78],
      hero: [60, 64, 67, 72, 76, 79],
      legend: [60, 64, 67, 72, 76, 79, 84, 88],
    };
    const notes = table[rarity] || table.common;
    const step = rarity === 'legend' ? 0.105 : 0.085;
    notes.forEach((n, i) => {
      this.tone(t + i * step, { freq: NOTE(n), dur: 0.24, gain: 0.09, type: 'triangle' });
      this.tone(t + i * step, { freq: NOTE(n + 12), dur: 0.18, gain: 0.035, type: 'sine' });
    });
    if (rarity === 'legend' || rarity === 'hero') {
      this.noiseHit(t + notes.length * step, { freq: 5200, q: 0.7, gain: 0.06, dur: 0.5, type: 'highpass' });
      this.tone(t + notes.length * step, { freq: 160, to: 70, dur: 0.4, gain: 0.12, type: 'sine' });
    }
  }

  /** 레벨업/스테이지 클리어 — 짧은 상승음 */
  levelUp() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, { freq: NOTE(72), dur: 0.1, gain: 0.07, type: 'triangle' });
    this.tone(t + 0.07, { freq: NOTE(76), dur: 0.1, gain: 0.07, type: 'triangle' });
    this.tone(t + 0.14, { freq: NOTE(79), dur: 0.18, gain: 0.07, type: 'triangle' });
  }

  /** UI 클릭 — 아주 작은 틱 */
  ui() {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(ctx.currentTime, { freq: 1200, dur: 0.035, gain: 0.035, type: 'square' });
  }
}
