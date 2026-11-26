/* yua-draw/app.js — 유아(7세)용 그림 그리기 & 일치율 놀이
   v2: 20색 팔레트 · 붓 7종(크레파스/무지개/네온/반짝이/채우기/스탬프/지우개)
       · 도화지 배경 6종(배경 레이어 분리, 채점·저장에 안전) · 굵기 4단 */
(function () {
  'use strict';

  const TOPICS = window.YUA_TOPICS || [];
  const GRID = 100;
  const STORE_KEY = 'yua-draw-gallery-v1';
  const PREF_KEY = 'yua-draw-prefs-v1';

  /* ── 20색 팔레트: 두 줄 × 10칸. fam 은 주제 채점용 색 계열 ── */
  const PALETTE = [
    { name: '검정', hex: '#212121', fam: '검정' },
    { name: '회색', hex: '#7b8794', fam: '회색' },
    { name: '연회색', hex: '#cfd8dc', fam: '회색' },
    { name: '흰색', hex: '#ffffff', fam: '흰색' },
    { name: '빨강', hex: '#e53935', fam: '빨강' },
    { name: '주황', hex: '#fb8c00', fam: '주황' },
    { name: '노랑', hex: '#fdd835', fam: '노랑' },
    { name: '연두', hex: '#aed581', fam: '초록' },
    { name: '초록', hex: '#43a047', fam: '초록' },
    { name: '하늘', hex: '#4fc3f7', fam: '하늘' },
    { name: '파랑', hex: '#1e88e5', fam: '파랑' },
    { name: '남색', hex: '#3949ab', fam: '파랑' },
    { name: '보라', hex: '#8e24aa', fam: '보라' },
    { name: '연보라', hex: '#ce93d8', fam: '보라' },
    { name: '분홍', hex: '#ff7ab6', fam: '분홍' },
    { name: '연분홍', hex: '#f8bbd0', fam: '분홍' },
    { name: '청록', hex: '#26c6da', fam: '하늘' },
    { name: '민트', hex: '#80cbc4', fam: '초록' },
    { name: '갈색', hex: '#8d6e63', fam: '갈색' },
    { name: '살구', hex: '#ffcc80', fam: '주황' }
  ];

  const BACKGROUNDS = [
    { name: '흰색', hex: '#ffffff', dark: false },
    { name: '크림', hex: '#fff8e7', dark: false },
    { name: '연초록', hex: '#e8f5e9', dark: false },
    { name: '연하늘', hex: '#e3f2fd', dark: false },
    { name: '연분홍', hex: '#fce4ec', dark: false },
    { name: '밤하늘', hex: '#1b2438', dark: true }
  ];

  const TOOLS = [
    { id: 'crayon', emoji: '✏️', label: '크레파스' },
    { id: 'rainbow', emoji: '🌈', label: '무지개' },
    { id: 'neon', emoji: '🌟', label: '네온' },
    { id: 'sparkle', emoji: '✨', label: '반짝이' },
    { id: 'fill', emoji: '🪣', label: '채우기' },
    { id: 'stamp', emoji: '⭐', label: '스탬프' },
    { id: 'eraser', emoji: '🧹', label: '지우개' }
  ];

  const SIZES = [
    { px: 5, label: '가늘게' },
    { px: 10, label: '보통' },
    { px: 18, label: '굵게' },
    { px: 30, label: '아주 굵게' }
  ];

  const STAMPS = ['⭐', '❤️', '🌟', '🌈', '🌸', '🦋', '🐱', '🐶', '🌙', '☀️', '🍎', '🎈'];
  const ERASER_SIZE = 34;
  const SHAPE_TOOLS = { crayon: 1, rainbow: 1, neon: 1, sparkle: 1, eraser: 1 };

  const $ = (id) => document.getElementById(id);

  const state = {
    topicIndex: 0,
    color: PALETTE[4].hex,
    colorName: PALETTE[4].name,
    fam: PALETTE[4].fam,
    size: SIZES[1].px,
    tool: 'crayon',
    stamp: STAMPS[0],
    bgIndex: 0,
    bgHex: BACKGROUNDS[0].hex,
    hint: false,
    cmds: [],
    active: null,
    recent: [],
    sound: true
  };

  const paintCanvas = $('paint');
  const hintCanvas = $('hint');
  const paintCtx = paintCanvas.getContext('2d', { willReadFrequently: true });
  const hintCtx = hintCanvas.getContext('2d');
  const wrap = $('canvasWrap');

  /* ───────────────────────── 환경 설정 ───────────────────────── */

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (typeof p.sound === 'boolean') state.sound = p.sound;
      if (p.color) {
        const hit = PALETTE.find((c) => c.hex === p.color);
        if (hit) { state.color = hit.hex; state.colorName = hit.name; state.fam = hit.fam; }
      }
      if (typeof p.size === 'number' && SIZES.some((s) => s.px === p.size)) state.size = p.size;
      if (typeof p.tool === 'string' && TOOLS.some((t) => t.id === p.tool)) state.tool = p.tool;
      if (typeof p.bg === 'number' && BACKGROUNDS[p.bg]) {
        state.bgIndex = p.bg;
        state.bgHex = BACKGROUNDS[p.bg].hex;
      }
      if (typeof p.stamp === 'string' && STAMPS.indexOf(p.stamp) >= 0) state.stamp = p.stamp;
      if (typeof p.topicId === 'string') {
        const i = TOPICS.findIndex((t) => t.id === p.topicId);
        if (i >= 0) state.topicIndex = i;
      }
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        sound: state.sound, color: state.color, size: state.size, tool: state.tool,
        bg: state.bgIndex, stamp: state.stamp,
        topicId: (TOPICS[state.topicIndex] || {}).id
      }));
    } catch (e) { /* ignore */ }
  }

  /* ───────────────────────── 캔버스 ───────────────────────── */

  let canvasW = 0, canvasH = 0, dpr = 1;

  function setupCanvas() {
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const same = (w === canvasW && h === canvasH);
    canvasW = w; canvasH = h;
    for (const cv of [paintCanvas, hintCanvas]) {
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
    }
    paintCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';
    if (same) return; // 크기가 그대로면(주소창 변화 등) 그림을 다시 그리지 않는다
    replay();
    drawHint();
  }

  function clearPaint() {
    paintCtx.save();
    paintCtx.setTransform(1, 0, 0, 1, 0, 0);
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    paintCtx.restore();
  }

  function syncEmpty() {
    wrap.classList.toggle('has-ink', state.cmds.length > 0);
  }

  /* ───────────────────────── 붓 그리기 ───────────────────────── */

  const hash01 = (a, b, s) => {
    const v = Math.sin(a * 12.9898 + b * 78.233 + s * 37.719) * 43758.5453;
    return v - Math.floor(v);
  };

  function sparkle4(ctx, x, y, r, color, white) {
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.lineCap = 'round';
    ctx.strokeStyle = white ? '#ffffff' : color;
    ctx.lineWidth = Math.max(1, r * 0.5);
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.fillStyle = white ? '#ffffff' : color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.9, r * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function paintDot(ctx, c) {
    const p = c.pts[0];
    ctx.save();
    if (c.tool === 'crayon') {
      ctx.fillStyle = c.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, c.size / 2, 0, Math.PI * 2); ctx.fill();
    } else if (c.tool === 'rainbow') {
      ctx.fillStyle = 'hsl(' + (c.hue0 % 360) + ',92%,58%)';
      ctx.beginPath(); ctx.arc(p.x, p.y, c.size / 2, 0, Math.PI * 2); ctx.fill();
    } else if (c.tool === 'neon') {
      ctx.shadowColor = c.color;
      ctx.shadowBlur = Math.max(6, c.size * 1.5);
      ctx.fillStyle = c.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, c.size / 2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, c.size * 0.18), 0, Math.PI * 2); ctx.fill();
    } else if (c.tool === 'sparkle') {
      sparkle4(ctx, p.x, p.y, Math.max(2.4, c.size * 0.55), c.color, false);
    } else if (c.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(p.x, p.y, c.size / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function paintSeg(ctx, c, a, b) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (c.tool === 'crayon') {
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.size;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (c.tool === 'rainbow') {
      ctx.strokeStyle = 'hsl(' + ((c.hue0 + c.dist * 2.4) % 360) + ',92%,58%)';
      ctx.lineWidth = c.size;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (c.tool === 'neon') {
      ctx.shadowColor = c.color;
      ctx.shadowBlur = Math.max(7, c.size * 1.6);
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.size;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = Math.max(1, c.size * 0.3);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (c.tool === 'sparkle') {
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = Math.max(1.4, c.size * 0.5);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 1;
      const n = Math.max(1, Math.round(len / 8));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const r1 = hash01(x * 1.7 + k, y * 1.3, c.seed);
        const r2 = hash01(y * 2.1, x * 0.9 + k, c.seed + 7);
        const r3 = hash01(x + y, k * 3.3, c.seed + 13);
        const ang = r1 * Math.PI * 2;
        const rad = r2 * c.size * 0.85;
        const sr = Math.max(1.6, c.size * 0.16 + r3 * c.size * 0.34);
        sparkle4(ctx, x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, sr, c.color, r3 > 0.62);
      }
    } else if (c.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = c.size;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
    c.dist += len;
  }

  function drawStampCmd(ctx, c) {
    const sz = Math.round(Math.max(22, c.size * 2.7));
    ctx.save();
    ctx.font = sz + 'px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of c.pts) ctx.fillText(c.stamp || '⭐', p.x, p.y);
    ctx.restore();
  }

  function drawCmd(ctx, c) {
    if (c.tool === 'fill') {
      if (c.region) ctx.drawImage(c.region, 0, 0, canvasW, canvasH);
      return;
    }
    if (c.tool === 'stamp') { drawStampCmd(ctx, c); return; }
    if (!c.pts.length) return;
    c.dist = 0;
    if (c.pts.length === 1) { paintDot(ctx, c); return; }
    for (let i = 1; i < c.pts.length; i++) paintSeg(ctx, c, c.pts[i - 1], c.pts[i]);
  }

  /* ── 지운 자리는 채점에서도 빠지도록 점을 표시 ── */
  function distToPath(p, pts) {
    if (!pts.length) return Infinity;
    if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = a.x + dx * t, qy = a.y + dy * t;
      const d = Math.hypot(p.x - qx, p.y - qy);
      if (d < best) best = d;
    }
    return best;
  }

  function markErased(cmd, upto) {
    const r = cmd.size / 2 + 1.5;
    for (let i = 0; i < upto; i++) {
      const c = state.cmds[i];
      if (!SHAPE_TOOLS[c.tool]) continue;
      for (const p of c.pts) {
        if (p.dead) continue;
        if (distToPath(p, cmd.pts) <= r) p.dead = true;
      }
    }
  }

  function replay() {
    clearPaint();
    for (const c of state.cmds) {
      if (c.pts) for (const p of c.pts) p.dead = false;
    }
    for (let i = 0; i < state.cmds.length; i++) {
      const c = state.cmds[i];
      drawCmd(paintCtx, c);
      if (c.tool === 'eraser') markErased(c, i);
    }
    syncEmpty();
  }

  /* ───────────────────────── 채우기(Flood Fill) ───────────────────────── */

  function hexRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  function doFill(cssPt) {
    const W = paintCanvas.width, H = paintCanvas.height;
    const sx = Math.round(cssPt.x * dpr), sy = Math.round(cssPt.y * dpr);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
    const img = paintCtx.getImageData(0, 0, W, H);
    const d = img.data;
    const bg = hexRgb(state.bgHex);
    const fi = hexRgb(state.color);

    // 대상 색 = 배경 위에 지금까지 그린 것을 합성한 색
    const i0 = (sy * W + sx) * 4;
    const a0 = d[i0 + 3] / 255;
    const t0 = Math.round(d[i0] * a0 + bg[0] * (1 - a0));
    const t1 = Math.round(d[i0 + 1] * a0 + bg[1] * (1 - a0));
    const t2 = Math.round(d[i0 + 2] * a0 + bg[2] * (1 - a0));

    const TOL = 46;
    const total = W * H;
    // 같은 색으로 볼 수 있는 픽셀을 먼저 표시해 두고(합성색 기준) 그 위에서 영역을 훑는다
    const like = new Uint8Array(total);
    for (let i = 0, p = 0; i < total; i++, p += 4) {
      const a = d[p + 3] / 255;
      const r = d[p] * a + bg[0] * (1 - a);
      const g = d[p + 1] * a + bg[1] * (1 - a);
      const b = d[p + 2] * a + bg[2] * (1 - a);
      if (Math.abs(r - t0) <= TOL && Math.abs(g - t1) <= TOL && Math.abs(b - t2) <= TOL) like[i] = 1;
    }
    if (!like[sy * W + sx]) return;
    const mask = new Uint8Array(total);
    const stack = [sy * W + sx];
    let filled = 0;
    while (stack.length) {
      const idx = stack.pop();
      if (mask[idx] || !like[idx]) continue;
      const y = (idx / W) | 0;
      const x = idx - y * W;
      // 한 줄(스캔라인)을 통째로 칠하고 위/아래 줄의 시작점을 담는다
      let lx = x;
      while (lx > 0 && !mask[y * W + lx - 1] && like[y * W + lx - 1]) lx--;
      let rx = x;
      while (rx < W - 1 && !mask[y * W + rx + 1] && like[y * W + rx + 1]) rx++;
      for (let cx = lx; cx <= rx; cx++) {
        const ci = y * W + cx;
        mask[ci] = 1;
        filled++;
        if (y > 0 && !mask[ci - W] && like[ci - W]) stack.push(ci - W);
        if (y < H - 1 && !mask[ci + W] && like[ci + W]) stack.push(ci + W);
      }
    }
    if (!filled) return;

    // 그림 레이어에 바로 칠한다 (배경·힌트 레이어는 건드리지 않는다)
    for (let i = 0; i < total; i++) {
      if (!mask[i]) continue;
      const i4 = i * 4;
      d[i4] = fi[0]; d[i4 + 1] = fi[1]; d[i4 + 2] = fi[2]; d[i4 + 3] = 255;
    }
    paintCtx.putImageData(img, 0, 0);

    // 되돌리기/다시 그리기를 위해 반쪽 해상도 사본을 남긴다 (0.8MB 수준)
    const hw = Math.max(1, Math.ceil(W / 2)), hh = Math.max(1, Math.ceil(H / 2));
    const hc = document.createElement('canvas');
    hc.width = hw; hc.height = hh;
    const hctx = hc.getContext('2d');
    const hid = hctx.createImageData(hw, hh);
    const hd = hid.data;
    for (let y = 0; y < hh; y++) {
      const syy = Math.min(H - 1, y * 2);
      for (let x = 0; x < hw; x++) {
        const m = mask[syy * W + Math.min(W - 1, x * 2)];
        if (!m) continue;
        const o = (y * hw + x) * 4;
        hd[o] = fi[0]; hd[o + 1] = fi[1]; hd[o + 2] = fi[2]; hd[o + 3] = 255;
      }
    }
    hctx.putImageData(hid, 0, 0);

    state.cmds.push({
      tool: 'fill', color: state.color, colorName: state.colorName, fam: state.fam,
      size: state.size, pts: [{ x: cssPt.x, y: cssPt.y }], seed: 0, dist: 0, region: hc
    });
    syncEmpty();
    if (state.sound) blip();
  }

  /* ───────────────────────── 입력 ───────────────────────── */

  function pointOf(e) {
    const r = paintCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function newCmd(tool, p) {
    const c = {
      tool: tool,
      color: state.color,
      colorName: state.colorName,
      fam: state.fam,
      size: tool === 'eraser' ? ERASER_SIZE : state.size,
      pts: [{ x: p.x, y: p.y }],
      seed: Math.floor(Math.random() * 100000),
      dist: 0,
      hue0: Math.floor(Math.random() * 360)
    };
    if (tool === 'stamp') { c.stamp = state.stamp; c.pts = []; c.pts.push({ x: p.x, y: p.y }); }
    return c;
  }

  function addStamp(p) {
    const c = newCmd('stamp', p);
    state.cmds.push(c);
    drawStampCmd(paintCtx, c);
    syncEmpty();
    if (state.sound) blip();
  }

  paintCanvas.addEventListener('pointerdown', (e) => {
    if (state.active !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const p = pointOf(e);

    if (state.tool === 'fill') { doFill(p); return; }
    if (state.tool === 'stamp') { addStamp(p); return; }

    state.active = e.pointerId;
    try { paintCanvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const c = newCmd(state.tool, p);
    state.cmds.push(c);
    paintDot(paintCtx, c);
    syncEmpty();
  }, { passive: false });

  paintCanvas.addEventListener('pointermove', (e) => {
    if (state.active !== e.pointerId) return;
    e.preventDefault();
    const c = state.cmds[state.cmds.length - 1];
    if (!c || !c.pts) return;
    const p = pointOf(e);
    const last = c.pts[c.pts.length - 1];
    const dx = p.x - last.x, dy = p.y - last.y;
    if (dx * dx + dy * dy < 1.4) return;
    c.pts.push(p);
    paintSeg(paintCtx, c, last, p);
  }, { passive: false });

  function endPointer(e) {
    if (state.active !== e.pointerId) return;
    state.active = null;
    try { paintCanvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const c = state.cmds[state.cmds.length - 1];
    if (c && c.tool === 'eraser') markErased(c, state.cmds.length - 1);
  }
  paintCanvas.addEventListener('pointerup', endPointer);
  paintCanvas.addEventListener('pointercancel', endPointer);
  paintCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  paintCanvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  ['gesturestart', 'gesturechange'].forEach((ev) => {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  });
  document.addEventListener('touchmove', (e) => {
    if (state.active !== null) e.preventDefault();
  }, { passive: false });

  /* ───────────────────────── 힌트(점선 밑그림) ───────────────────────── */

  function unitMapFromCanvas(w, h) {
    const side = Math.min(w, h) * 0.9;
    const k = side / GRID;
    const ox = w / 2 - 50 * k;
    const oy = h / 2 - 50 * k;
    return { k, ox, oy, X: (x) => ox + x * k, Y: (y) => oy + y * k };
  }

  function pathShapes(ctx, shapes, map, lw) {
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of shapes) {
      ctx.beginPath();
      if (s.t === 'c') {
        ctx.arc(map.X(s.cx), map.Y(s.cy), Math.max(0.6, s.r * map.k), 0, Math.PI * 2);
      } else if (s.t === 'e') {
        ctx.ellipse(map.X(s.cx), map.Y(s.cy), Math.max(0.6, s.rx * map.k), Math.max(0.6, s.ry * map.k),
          ((s.rot || 0) * Math.PI) / 180, 0, Math.PI * 2);
      } else if (s.t === 'l') {
        ctx.moveTo(map.X(s.x1), map.Y(s.y1));
        ctx.lineTo(map.X(s.x2), map.Y(s.y2));
      } else if (s.t === 'p') {
        s.pts.forEach((pt, i) => {
          const X = map.X(pt[0]), Y = map.Y(pt[1]);
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        });
        if (s.closed) ctx.closePath();
      } else if (s.t === 'a') {
        ctx.arc(map.X(s.cx), map.Y(s.cy), Math.max(0.6, s.r * map.k),
          (s.a0 * Math.PI) / 180, (s.a1 * Math.PI) / 180);
      }
      ctx.stroke();
    }
  }

  function drawHint() {
    hintCtx.save();
    hintCtx.setTransform(1, 0, 0, 1, 0, 0);
    hintCtx.clearRect(0, 0, hintCanvas.width, hintCanvas.height);
    hintCtx.restore();
    if (!state.hint) return;
    const topic = TOPICS[state.topicIndex];
    if (!topic) return;
    const map = unitMapFromCanvas(canvasW, canvasH);
    hintCtx.save();
    hintCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hintCtx.strokeStyle = BACKGROUNDS[state.bgIndex].dark ? 'rgba(255,255,255,.42)' : '#c9d8ea';
    hintCtx.setLineDash([7, 7]);
    pathShapes(hintCtx, topic.shapes, map, Math.max(2, map.k * 2.1));
    hintCtx.restore();
  }

  /* ───────────────────────── 참조 마스크 & 채점 ───────────────────────── */

  const refCache = new Map();

  function rasterShapes(shapes) {
    const cv = document.createElement('canvas');
    cv.width = GRID; cv.height = GRID;
    const ctx = cv.getContext('2d');
    ctx.strokeStyle = '#000';
    pathShapes(ctx, shapes, { k: 1, ox: 0, oy: 0, X: (x) => x, Y: (y) => y }, 3.4);
    const data = ctx.getImageData(0, 0, GRID, GRID).data;
    const mask = new Uint8Array(GRID * GRID);
    let count = 0;
    let x0 = GRID, y0 = GRID, x1 = -1, y1 = -1;
    for (let i = 0; i < mask.length; i++) {
      if (data[i * 4 + 3] > 40) {
        mask[i] = 1; count++;
        const x = i % GRID, y = (i / GRID) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { mask, count, bbox: { x0, y0, x1, y1 } };
  }

  function shapeLength(s) {
    if (s.t === 'c') return 2 * Math.PI * s.r;
    if (s.t === 'e') {
      const a = s.rx, b = s.ry;
      return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    }
    if (s.t === 'l') return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (s.t === 'p') {
      let sum = 0;
      for (let i = 1; i < s.pts.length; i++) {
        sum += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]);
      }
      if (s.closed && s.pts.length > 2) {
        const f = s.pts[0], l = s.pts[s.pts.length - 1];
        sum += Math.hypot(f[0] - l[0], f[1] - l[1]);
      }
      return sum;
    }
    if (s.t === 'a') return Math.abs(((s.a1 - s.a0) * Math.PI) / 180) * s.r;
    return 0;
  }

  function getRef(topic) {
    if (refCache.has(topic.id)) return refCache.get(topic.id);
    const all = rasterShapes(topic.shapes);
    const groups = new Map();
    for (const s of topic.shapes) {
      const key = s.p || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const parts = [];
    for (const [name, shapes] of groups) {
      if (!name) continue;
      const r = rasterShapes(shapes);
      if (r.count >= 12) parts.push({ name, mask: r.mask, count: r.count });
    }
    const bw = Math.max(1, all.bbox.x1 - all.bbox.x0 + 1);
    const bh = Math.max(1, all.bbox.y1 - all.bbox.y0 + 1);
    let refLen = 0;
    for (const s2 of topic.shapes) refLen += shapeLength(s2);
    const info = { mask: all.mask, bbox: all.bbox, ar: bw / bh, parts, refLen: Math.max(1, refLen) };
    refCache.set(topic.id, info);
    return info;
  }

  function distanceField(mask) {
    const INF = 1e6;
    const d = new Float32Array(GRID * GRID);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x;
        if (d[i] === 0) continue;
        let v = d[i];
        if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
        if (y > 0) {
          if (d[i - GRID] + 1 < v) v = d[i - GRID] + 1;
          if (x > 0 && d[i - GRID - 1] + 1.414 < v) v = d[i - GRID - 1] + 1.414;
          if (x < GRID - 1 && d[i - GRID + 1] + 1.414 < v) v = d[i - GRID + 1] + 1.414;
        }
        d[i] = v;
      }
    }
    for (let y = GRID - 1; y >= 0; y--) {
      for (let x = GRID - 1; x >= 0; x--) {
        const i = y * GRID + x;
        if (d[i] === 0) continue;
        let v = d[i];
        if (x < GRID - 1 && d[i + 1] + 1 < v) v = d[i + 1] + 1;
        if (y < GRID - 1) {
          if (d[i + GRID] + 1 < v) v = d[i + GRID] + 1;
          if (x < GRID - 1 && d[i + GRID + 1] + 1.414 < v) v = d[i + GRID + 1] + 1.414;
          if (x > 0 && d[i + GRID - 1] + 1.414 < v) v = d[i + GRID - 1] + 1.414;
        }
        d[i] = v;
      }
    }
    return d;
  }

  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function colorFidelity(topic) {
    const allowed = topic.colors;
    if (!allowed || !allowed.length) return 1;
    let total = 0, good = 0;
    for (const c of state.cmds) {
      if (c.tool === 'rainbow' || c.tool === 'eraser') continue; // 무지개 붓·지우개는 색을 따지지 않는다
      let w;
      if (c.tool === 'fill') w = 60;
      else if (c.tool === 'stamp') w = 6 * c.pts.length;
      else {
        let alive = 0;
        for (const p of c.pts) if (!p.dead) alive++;
        if (!alive) continue;
        w = alive * c.size;
      }
      total += w;
      if (allowed.indexOf(c.colorName) >= 0 || allowed.indexOf(c.fam) >= 0) good += w;
    }
    if (!total) return 1;
    return good / total;
  }

  function computeScore(topic) {
    // 1) 아이가 그은 획(도형)만 모아 범위를 잰다 — 채우기·스탬프는 모양 채점에서 제외
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, ptCount = 0;
    const strokes = [];
    for (const c of state.cmds) {
      if (!SHAPE_TOOLS[c.tool] || c.tool === 'eraser') continue;
      const alive = [];
      for (const p of c.pts) if (!p.dead) alive.push(p);
      if (!alive.length) continue;
      strokes.push({ c: c, pts: alive });
      const hw = c.size / 2;
      for (const p of alive) {
        ptCount++;
        if (p.x - hw < minX) minX = p.x - hw;
        if (p.x + hw > maxX) maxX = p.x + hw;
        if (p.y - hw < minY) minY = p.y - hw;
        if (p.y + hw > maxY) maxY = p.y + hw;
      }
    }
    if (!ptCount) return { empty: true };
    const cw = Math.max(3, maxX - minX);
    const ch = Math.max(3, maxY - minY);
    if (ptCount < 3 || cw * ch < 26) return { empty: true, tiny: true };

    const ref = getRef(topic);
    const rb = ref.bbox;
    const rw = Math.max(1, rb.x1 - rb.x0 + 1);
    const rh = Math.max(1, rb.y1 - rb.y0 + 1);
    const sxN = (rw * 1.06) / cw, syN = (rh * 1.06) / ch;
    const ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
    const rcx = (rb.x0 + rb.x1) / 2, rcy = (rb.y0 + rb.y1) / 2;

    // 2) 그은 획을 참조 크기로 정규화해 100×100 마스크로 만든다
    const norm = document.createElement('canvas');
    norm.width = GRID; norm.height = GRID;
    const ng = norm.getContext('2d', { willReadFrequently: true });
    ng.setTransform(sxN, 0, 0, syN, rcx - ccx * sxN, rcy - ccy * syN);
    ng.strokeStyle = '#000';
    ng.fillStyle = '#000';
    ng.lineCap = 'round';
    ng.lineJoin = 'round';
    for (const s of strokes) {
      ng.lineWidth = s.c.size;
      if (s.pts.length === 1) {
        ng.beginPath();
        ng.arc(s.pts[0].x, s.pts[0].y, s.c.size / 2, 0, Math.PI * 2);
        ng.fill();
        continue;
      }
      for (let i = 1; i < s.pts.length; i++) {
        ng.beginPath();
        ng.moveTo(s.pts[i - 1].x, s.pts[i - 1].y);
        ng.lineTo(s.pts[i].x, s.pts[i].y);
        ng.stroke();
      }
    }
    const nd = ng.getImageData(0, 0, GRID, GRID).data;
    const child = new Uint8Array(GRID * GRID);
    let childCount = 0;
    for (let i = 0; i < child.length; i++) {
      if (nd[i * 4 + 3] > 44) { child[i] = 1; childCount++; }
    }
    if (childCount < 8) return { empty: true, tiny: true };

    const dChild = distanceField(child);
    const dRef = distanceField(ref.mask);
    const TOL = 5.0;

    // 3) 재현율 — 참조 도형의 각 부분을 얼마나 덮었나
    let rSum = 0, rN = 0;
    for (let i = 0; i < GRID * GRID; i++) {
      if (ref.mask[i]) { rSum += Math.max(0, 1 - dChild[i] / TOL); rN++; }
    }
    const recall = rN ? rSum / rN : 0;

    // 4) 정밀도 — 그은 선이 참조 도형에서 얼마나 벗어났나
    let pSum = 0, pN = 0, junkN = 0, childLen = 0;
    const consider = (x, y) => {
      const gx = Math.round(rcx + (x - ccx) * sxN);
      const gy = Math.round(rcy + (y - ccy) * syN);
      pN++;
      if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) { junkN++; return; }
      const d = dRef[gy * GRID + gx];
      pSum += Math.max(0, 1 - d / TOL);
      if (d > 9) junkN++;
    };
    for (const s of strokes) {
      if (s.pts.length === 1) { consider(s.pts[0].x, s.pts[0].y); continue; }
      for (let i = 1; i < s.pts.length; i++) {
        const a = s.pts[i - 1], b = s.pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        childLen += Math.hypot((b.x - a.x) * sxN, (b.y - a.y) * syN);
        const n = Math.max(1, Math.min(40, Math.ceil(len / 3)));
        for (let k = 0; k < n; k++) consider(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
      }
      const lastP = s.pts[s.pts.length - 1];
      consider(lastP.x, lastP.y);
    }
    const precision = pN ? pSum / pN : 0;
    const junk = pN ? junkN / pN : 0;
    if (pN < 6) return { empty: true, tiny: true };

    const f1 = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0;

    // 5) 특징 비율 — 가로세로 비율이 참조와 얼마나 비슷한가
    const arC = cw / ch;
    const rr = arC / (rw / rh);
    const arScore = clamp01(Math.min(rr, 1 / rr));

    const colorScore = colorFidelity(topic);

    // 획의 양 — 캔버스를 뒤덮은 낙서는 참조보다 훨씬 길다
    const lenRatio = childLen / ref.refLen;
    const excess = clamp01((lenRatio - 1.9) / 4.5);

    const fp = f1 * f1;
    const raw = clamp01(0.86 * fp * (1 - 0.55 * junk) * (1 - 0.6 * excess) + 0.07 * arScore + 0.07 * colorScore);
    const pct = Math.max(55, Math.min(99, pctFromRaw(raw)));

    // 6) 빠진 부분 찾기
    const missing = [];
    for (const part of ref.parts) {
      let sum = 0, n = 0;
      for (let i = 0; i < part.mask.length; i++) {
        if (!part.mask[i]) continue;
        sum += Math.max(0, 1 - dChild[i] / TOL);
        n++;
      }
      const cov = n ? sum / n : 0;
      if (cov < 0.42) missing.push({ name: part.name, cov, count: part.count });
    }
    missing.sort((a, b) => b.count - a.count);

    return {
      empty: false, pct, raw, recall, precision, f1, junk, arScore, colorScore, lenRatio,
      missing: missing.map((m) => m.name)
    };
  }

  /* ───────────────────────── 결과 화면 ───────────────────────── */

  const RAW_TO_PCT = [[0, 55], [0.25, 57], [0.40, 64], [0.55, 72], [0.70, 82], [0.85, 93], [1, 99]];
  function pctFromRaw(raw) {
    const t = Math.max(0, Math.min(1, raw));
    for (let i = 1; i < RAW_TO_PCT.length; i++) {
      const [x1, y1] = RAW_TO_PCT[i];
      const [x0, y0] = RAW_TO_PCT[i - 1];
      if (t <= x1) return Math.round(y0 + ((y1 - y0) * (t - x0)) / (x1 - x0));
    }
    return 99;
  }

  function starsFor(pct) {
    if (pct >= 85) return 3;
    if (pct >= 70) return 2;
    return 1;
  }

  function showResult(res) {
    const topic = TOPICS[state.topicIndex];
    $('resTopic').textContent = topic.emoji + ' ' + topic.word;
    $('scoreNum').textContent = res.pct;
    const stars = starsFor(res.pct);
    $('stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);

    const hasMissing = !!(res.missing && res.missing.length);
    let praise;
    if (res.pct >= 85 && !hasMissing) praise = topic.praise;
    else if (res.pct >= 85) praise = '우와! ' + topic.word + ' 모양이 아주 잘 맞았어요!';
    else if (res.pct >= 70) praise = '우와, ' + topic.word + ' 모양이 많이 닮았어요!';
    else praise = '그림을 아주 열심히 그렸네요!';

    let tip = hasMissing ? '다음엔 ' + res.missing[0] + '도 그려볼까요?' : topic.tip;
    if (res.pct < 70 && !state.hint) {
      tip += ' 힌트 보기를 켜고 점선을 따라 그려 보세요!';
    }

    window.__yuaLast = res;
    $('praiseText').textContent = praise;
    $('tipText').textContent = tip;
    $('resultModal').hidden = false;
    $('stars').style.animation = 'none';
    void $('stars').offsetWidth;
    $('stars').style.animation = '';

    const thumb = exportImage(340, 'image/jpeg', 0.82);
    if (thumb) $('resThumb').src = thumb;
    else $('resThumb').removeAttribute('src');

    saveToGallery({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      emoji: topic.emoji, word: topic.word, pct: res.pct,
      stars, ts: Date.now(), img: thumb || ''
    });

    confetti(res.pct >= 85 ? 96 : res.pct >= 70 ? 64 : 34);
    if (state.sound) chime(res.pct);
  }

  function inkBBox(canvas, step) {
    const W = canvas.width, H = canvas.height;
    const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
    const s = step || 2;
    let x0 = W, y0 = H, x1 = -1, y1 = -1, count = 0;
    for (let y = 0; y < H; y += s) {
      const row = y * W;
      for (let x = 0; x < W; x += s) {
        if (data[(row + x) * 4 + 3] > 28) {
          count++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (!count) return null;
    return { x0, y0, x1: Math.min(W, x1 + s), y1: Math.min(H, y1 + s), count, W, H };
  }

  // 도화지 색 + 그림을 합쳐 한 장으로 저장 (배경은 늘 함께)
  function exportImage(maxDim, mime, quality) {
    const src = paintCanvas;
    const bb = inkBBox(src, 2);
    if (!bb) return null;
    const pad = Math.max(14, Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.1);
    const x = Math.max(0, Math.floor(bb.x0 - pad));
    const y = Math.max(0, Math.floor(bb.y0 - pad));
    const w = Math.min(src.width - x, Math.ceil(bb.x1 - bb.x0 + pad * 2));
    const h = Math.min(src.height - y, Math.ceil(bb.y1 - bb.y0 + pad * 2));
    if (w < 2 || h < 2) return null;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(h * scale));
    const g = out.getContext('2d');
    g.fillStyle = state.bgHex;
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(src, x, y, w, h, 0, 0, out.width, out.height);
    return out.toDataURL(mime || 'image/png', quality);
  }

  function downloadDataUrl(dataUrl, filename) {
    try {
      const head = dataUrl.slice(0, dataUrl.indexOf(','));
      const mime = (head.match(/:(.*?);/) || [])[1] || 'image/png';
      const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  function submit() {
    const topic = TOPICS[state.topicIndex];
    const res = computeScore(topic);
    if (res.empty) {
      toast('조금만 더 그려볼까요? 😊');
      if (state.sound) blip();
      return;
    }
    showResult(res);
  }

  function closeResult() { $('resultModal').hidden = true; }

  /* ───────────────────────── 갤러리 ───────────────────────── */

  function loadGallery() {
    try {
      const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function saveToGallery(entry) {
    let list = loadGallery();
    list.unshift(entry);
    list = list.slice(0, 12);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(list));
        return;
      } catch (e) {
        if (list.length <= 1) return;
        list = list.slice(0, Math.max(1, list.length - 3));
      }
    }
  }

  function renderGallery() {
    const list = loadGallery();
    const box = $('galleryList');
    box.innerHTML = '';
    if (!list.length) {
      const p = document.createElement('div');
      p.className = 'g-empty';
      p.textContent = '아직 저장된 그림이 없어요.\n그림을 그리고 제출하면 여기에 모여요!';
      p.style.whiteSpace = 'pre-line';
      box.appendChild(p);
      return;
    }
    for (const item of list) {
      const btn = document.createElement('button');
      btn.className = 'g-item';
      const img = document.createElement('img');
      img.alt = item.word + ' ' + item.pct + '점';
      if (item.img) img.src = item.img;
      const badge = document.createElement('span');
      badge.className = 'g-badge';
      badge.textContent = item.pct + '%';
      btn.appendChild(img);
      btn.appendChild(badge);
      btn.addEventListener('click', () => {
        if (!item.img) return;
        const w = window.open('', '_blank');
        if (w) {
          w.document.write('<title>' + item.word + ' ' + item.pct + '%</title>' +
            '<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#f4f8fd">' +
            '<img src="' + item.img + '" style="max-width:96vw;max-height:96vh;border-radius:14px;background:#fff">');
          w.document.close();
        }
      });
      box.appendChild(btn);
    }
  }

  function openGallery() {
    renderGallery();
    $('galleryModal').hidden = false;
  }

  /* ───────────────────────── 주제 ───────────────────────── */

  function renderTopic() {
    const t = TOPICS[state.topicIndex];
    if (!t) return;
    $('topicEmoji').textContent = t.emoji;
    $('topicWord').textContent = t.word;
    drawHint();
    savePrefs();
  }

  function pickNextTopic() {
    if (TOPICS.length < 2) return;
    let idx = state.topicIndex;
    for (let tries = 0; tries < 30; tries++) {
      idx = Math.floor(Math.random() * TOPICS.length);
      if (idx !== state.topicIndex && state.recent.indexOf(idx) < 0) break;
    }
    state.recent.push(state.topicIndex);
    if (state.recent.length > 5) state.recent.shift();
    state.topicIndex = idx;
  }

  function clearAll() {
    state.cmds.length = 0;
    clearPaint();
    syncEmpty();
  }

  function clearAndNext() {
    clearAll();
    pickNextTopic();
    renderTopic();
  }

  const confirmState = { resolve: null };

  function confirmDialog(text) {
    return new Promise((resolve) => {
      $('confirmText').textContent = text;
      $('confirmModal').hidden = false;
      confirmState.resolve = resolve;
    });
  }
  function resolveConfirm(v) {
    $('confirmModal').hidden = true;
    const r = confirmState.resolve;
    confirmState.resolve = null;
    if (r) r(v);
  }

  async function onNextTopic() {
    if (state.cmds.length) {
      const ok = await confirmDialog('그림을 지우고 새 주제로 갈까요?');
      if (!ok) return;
    }
    clearAndNext();
    toast('새 주제: ' + TOPICS[state.topicIndex].emoji + ' ' + TOPICS[state.topicIndex].word);
  }

  /* ───────────────────────── UI 조립 ───────────────────────── */

  function buildPalette() {
    const box = $('palette');
    box.innerHTML = '';
    PALETTE.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = c.hex;
      b.dataset.name = c.name;
      b.dataset.hex = c.hex;
      b.setAttribute('aria-label', c.name);
      b.title = c.name;
      b.addEventListener('click', () => {
        state.color = c.hex;
        state.colorName = c.name;
        state.fam = c.fam;
        if (state.tool === 'eraser') state.tool = 'crayon';
        syncTools();
        savePrefs();
        if (state.sound) blip();
      });
      box.appendChild(b);
    });
  }

  function buildTools() {
    const box = $('toolRow');
    box.innerHTML = '';
    TOOLS.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'tool-btn';
      b.id = 'tool-' + t.id;
      b.dataset.tool = t.id;
      b.setAttribute('aria-label', t.label);
      const i = document.createElement('span');
      i.className = 'ti';
      i.textContent = t.emoji;
      const l = document.createElement('span');
      l.className = 'tl';
      l.textContent = t.label;
      b.appendChild(i);
      b.appendChild(l);
      b.addEventListener('click', () => {
        state.tool = t.id;
        syncTools();
        savePrefs();
        if (state.sound) blip();
      });
      box.appendChild(b);
    });
  }

  function buildSizes() {
    const box = $('sizes');
    box.innerHTML = '';
    SIZES.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'size-btn';
      b.dataset.px = String(s.px);
      b.setAttribute('aria-label', '굵기 ' + s.label);
      b.title = s.label;
      const i = document.createElement('i');
      const d = Math.max(5, Math.round(s.px * 0.62));
      i.style.width = d + 'px';
      i.style.height = d + 'px';
      b.appendChild(i);
      b.addEventListener('click', () => {
        state.size = s.px;
        if (state.tool === 'eraser') state.tool = 'crayon';
        syncTools();
        savePrefs();
      });
      box.appendChild(b);
    });
  }

  function buildBgs() {
    const box = $('bgs');
    box.innerHTML = '';
    BACKGROUNDS.forEach((bgi, i) => {
      const b = document.createElement('button');
      b.className = 'bg-dot';
      b.style.background = bgi.hex;
      b.dataset.idx = String(i);
      b.setAttribute('aria-label', '도화지 ' + bgi.name);
      b.title = '도화지 ' + bgi.name;
      b.addEventListener('click', () => {
        state.bgIndex = i;
        state.bgHex = bgi.hex;
        applyBg();
        syncTools();
        savePrefs();
      });
      box.appendChild(b);
    });
  }

  function buildStamps() {
    const box = $('stampTray');
    box.innerHTML = '';
    STAMPS.forEach((em) => {
      const b = document.createElement('button');
      b.className = 'stamp-btn';
      b.textContent = em;
      b.dataset.em = em;
      b.setAttribute('aria-label', '스탬프 ' + em);
      b.addEventListener('click', () => {
        state.stamp = em;
        syncTools();
        savePrefs();
        if (state.sound) blip();
      });
      box.appendChild(b);
    });
  }

  function applyBg() {
    const bg = BACKGROUNDS[state.bgIndex];
    wrap.style.background = bg.hex;
    wrap.classList.toggle('dark-bg', !!bg.dark);
    drawHint();
  }

  function syncTools() {
    document.querySelectorAll('.swatch').forEach((b) => {
      b.classList.toggle('sel', b.dataset.hex === state.color && state.tool !== 'eraser');
    });
    document.querySelectorAll('.tool-btn').forEach((b) => {
      b.classList.toggle('sel', b.dataset.tool === state.tool);
    });
    document.querySelectorAll('.size-btn').forEach((b) => {
      b.classList.toggle('sel', Number(b.dataset.px) === state.size);
    });
    document.querySelectorAll('.bg-dot').forEach((b) => {
      b.classList.toggle('sel', Number(b.dataset.idx) === state.bgIndex);
    });
    document.querySelectorAll('.stamp-btn').forEach((b) => {
      b.classList.toggle('sel', b.dataset.em === state.stamp);
    });
    $('stampTray').hidden = state.tool !== 'stamp';
    $('btnHint').classList.toggle('on', state.hint);
    $('btnHint').textContent = state.hint ? '💡 끄기' : '💡 힌트';
    wrap.classList.toggle('hinting', state.hint);
    $('btnSound').classList.toggle('off', !state.sound);
    $('btnSound').textContent = state.sound ? '🔊' : '🔇';
    paintCanvas.style.cursor = state.tool === 'fill' ? 'pointer'
      : state.tool === 'stamp' ? 'copy'
        : state.tool === 'eraser' ? 'cell' : 'crosshair';
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
  }

  let clearArmed = false;
  let clearTimer = null;

  function onClear() {
    if (!state.cmds.length) { toast('지울 그림이 없어요 😊'); return; }
    if (!clearArmed) {
      clearArmed = true;
      toast('한 번 더 누르면 전부 지워져요 🧹');
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => { clearArmed = false; }, 2400);
      return;
    }
    clearArmed = false;
    clearAll();
    toast('싹 지웠어요! 다시 그려 볼까요? 🎨');
  }

  /* ───────────────────────── 효과음 ───────────────────────── */

  let actx = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function tone(freq, delay, dur, gain) {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.06, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.2));
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + (dur || 0.2) + 0.02);
  }
  function blip() { tone(660, 0, 0.12, 0.04); }
  function chime(pct) {
    const notes = pct >= 85 ? [523, 659, 784, 1046] : pct >= 70 ? [523, 659, 784] : [494, 587];
    notes.forEach((f, i) => tone(f, i * 0.1, 0.24, 0.055));
  }

  /* ───────────────────────── 색종이 ───────────────────────── */

  function confetti(n) {
    const cv = $('fx');
    const dpr2 = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = Math.floor(W * dpr2);
    cv.height = Math.floor(H * dpr2);
    const g = cv.getContext('2d');
    g.setTransform(dpr2, 0, 0, dpr2, 0, 0);
    const colors = ['#ff5252', '#ffb300', '#4caf50', '#29b6f6', '#ab47bc', '#ff7ab6', '#26c6da'];
    const parts = [];
    for (let i = 0; i < n; i++) {
      parts.push({
        x: W / 2 + (Math.random() - 0.5) * 160,
        y: H * 0.3 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 11,
        vy: -Math.random() * 12 - 3,
        r: 3 + Math.random() * 6,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.35,
        c: colors[i % colors.length]
      });
    }
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(48, now - last) / 16.7;
      last = now;
      g.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of parts) {
        p.vy += 0.42 * dt;
        p.vx *= 0.995;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y < H + 40) alive = true;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.c;
        g.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.5);
        g.restore();
      }
      if (alive) requestAnimationFrame(frame);
      else g.clearRect(0, 0, W, H);
    }
    requestAnimationFrame(frame);
  }

  /* ───────────────────────── 이벤트 연결 ───────────────────────── */

  function bind() {
    $('btnSubmit').addEventListener('click', submit);
    $('btnHint').addEventListener('click', () => {
      state.hint = !state.hint;
      drawHint();
      syncTools();
      if (state.hint && state.sound) blip();
    });
    $('btnUndo').addEventListener('click', () => {
      if (!state.cmds.length) { toast('되돌릴 그림이 없어요'); return; }
      state.cmds.pop();
      replay();
    });
    $('btnClear').addEventListener('click', onClear);
    $('btnNext').addEventListener('click', onNextTopic);
    $('btnGallery').addEventListener('click', openGallery);
    $('btnGalleryClose').addEventListener('click', () => { $('galleryModal').hidden = true; });
    $('btnSound').addEventListener('click', () => {
      state.sound = !state.sound;
      syncTools();
      savePrefs();
      if (state.sound) blip();
    });
    $('btnResultClose').addEventListener('click', closeResult);
    $('btnNextTopic').addEventListener('click', () => { closeResult(); clearAndNext(); });
    $('btnSavePng').addEventListener('click', () => {
      const topic = TOPICS[state.topicIndex];
      const data = exportImage(1400, 'image/png');
      if (!data) { toast('저장할 그림이 없어요'); return; }
      const pct = $('scoreNum').textContent;
      downloadDataUrl(data, '유아그림-' + topic.word + '-' + pct + '점.png');
      toast('그림을 저장했어요! 💾');
    });
    $('btnConfirmYes').addEventListener('click', () => resolveConfirm(true));
    $('btnConfirmNo').addEventListener('click', () => resolveConfirm(false));
    $('confirmModal').addEventListener('click', (e) => {
      if (e.target === $('confirmModal')) resolveConfirm(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('confirmModal').hidden) resolveConfirm(false);
        else if (!$('galleryModal').hidden) $('galleryModal').hidden = true;
        else if (!$('resultModal').hidden) closeResult();
      }
    });

    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(setupCanvas, 140);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        clearTimeout(rt);
        rt = setTimeout(setupCanvas, 220);
      });
    }
  }

  /* ───────────────────────── 시작 ───────────────────────── */

  function init() {
    if (!TOPICS.length) {
      document.body.innerHTML = '<p style="padding:24px;font-size:16px">주제를 불러오지 못했어요. 새로고침해 주세요.</p>';
      return;
    }
    loadPrefs();
    buildPalette();
    buildTools();
    buildSizes();
    buildBgs();
    buildStamps();
    applyBg();
    bind();
    renderTopic();
    syncTools();
    requestAnimationFrame(() => { setupCanvas(); renderTopic(); });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }

  init();

  // 자체 점검(qa.html)용 손잡이
  window.__yua = { state: state, computeScore: computeScore, replay: replay, fill: doFill };
})();
