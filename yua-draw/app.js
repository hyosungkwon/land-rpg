/* yua-draw/app.js — 유아(7세)용 그림 그리기 & 일치율 놀이 */
(function () {
  'use strict';

  const TOPICS = window.YUA_TOPICS || [];
  const GRID = 100;
  const STORE_KEY = 'yua-draw-gallery-v1';
  const PREF_KEY = 'yua-draw-prefs-v1';
  const ERASER_SIZE = 30;

  const PALETTE = [
    { name: '빨강', hex: '#e53935' },
    { name: '주황', hex: '#fb8c00' },
    { name: '노랑', hex: '#fdd835' },
    { name: '초록', hex: '#43a047' },
    { name: '하늘', hex: '#29b6f6' },
    { name: '파랑', hex: '#1e88e5' },
    { name: '보라', hex: '#8e24aa' },
    { name: '분홍', hex: '#ff7ab6' },
    { name: '갈색', hex: '#8d6e63' },
    { name: '검정', hex: '#212121' }
  ];
  const SIZES = [
    { px: 6, label: '얇게' },
    { px: 12, label: '보통' },
    { px: 22, label: '굵게' }
  ];

  const $ = (id) => document.getElementById(id);

  const state = {
    topicIndex: 0,
    color: PALETTE[0].hex,
    colorName: PALETTE[0].name,
    size: SIZES[1].px,
    eraser: false,
    hint: false,
    strokes: [],
    activePointer: null,
    recent: [],
    sound: true,
    galleryOpen: false
  };

  const drawCanvas = $('draw');
  const hintCanvas = $('hint');
  const drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true });
  const hintCtx = hintCanvas.getContext('2d');
  const wrap = $('canvasWrap');

  /* ───────────────────────── 환경 설정 ───────────────────────── */

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (typeof p.sound === 'boolean') state.sound = p.sound;
      if (p.color) {
        const hit = PALETTE.find((c) => c.hex === p.color);
        if (hit) { state.color = hit.hex; state.colorName = hit.name; }
      }
      if (typeof p.size === 'number' && SIZES.some((s) => s.px === p.size)) state.size = p.size;
      if (typeof p.topicId === 'string') {
        const i = TOPICS.findIndex((t) => t.id === p.topicId);
        if (i >= 0) state.topicIndex = i;
      }
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        sound: state.sound, color: state.color, size: state.size,
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
    canvasW = w; canvasH = h;
    for (const cv of [drawCanvas, hintCanvas]) {
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
    }
    drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';
    redraw();
    drawHint();
  }

  function paintDot(ctx, stroke, p) {
    ctx.save();
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    ctx.fillStyle = stroke.erase ? '#000' : stroke.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function paintSeg(ctx, stroke, a, b) {
    ctx.save();
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.erase ? '#000' : stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function redraw() {
    drawCtx.save();
    drawCtx.setTransform(1, 0, 0, 1, 0, 0);
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    drawCtx.restore();
    for (const s of state.strokes) {
      if (!s.pts.length) continue;
      if (s.pts.length === 1) { paintDot(drawCtx, s, s.pts[0]); continue; }
      for (let i = 1; i < s.pts.length; i++) paintSeg(drawCtx, s, s.pts[i - 1], s.pts[i]);
    }
  }

  function clearCanvas() {
    state.strokes.length = 0;
    redraw();
  }

  /* ───────────────────────── 그리기 입력 ───────────────────────── */

  function pointOf(e) {
    const r = drawCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  drawCanvas.addEventListener('pointerdown', (e) => {
    if (state.activePointer !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    state.activePointer = e.pointerId;
    try { drawCanvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const stroke = {
      color: state.color,
      colorName: state.colorName,
      size: state.eraser ? ERASER_SIZE : state.size,
      erase: state.eraser,
      pts: []
    };
    const p = pointOf(e);
    stroke.pts.push(p);
    state.strokes.push(stroke);
    paintDot(drawCtx, stroke, p);
    if (state.sound === false) { /* no-op */ }
  }, { passive: false });

  drawCanvas.addEventListener('pointermove', (e) => {
    if (state.activePointer !== e.pointerId) return;
    e.preventDefault();
    const stroke = state.strokes[state.strokes.length - 1];
    if (!stroke) return;
    const p = pointOf(e);
    const last = stroke.pts[stroke.pts.length - 1];
    const dx = p.x - last.x, dy = p.y - last.y;
    if (dx * dx + dy * dy < 1.6) return;
    stroke.pts.push(p);
    paintSeg(drawCtx, stroke, last, p);
  }, { passive: false });

  function endPointer(e) {
    if (state.activePointer !== e.pointerId) return;
    state.activePointer = null;
    try { drawCanvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  drawCanvas.addEventListener('pointerup', endPointer);
  drawCanvas.addEventListener('pointercancel', endPointer);
  drawCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  drawCanvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  // 두 손가락 확대/스크롤 막기
  ['gesturestart', 'gesturechange'].forEach((ev) => {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  });
  document.addEventListener('touchmove', (e) => {
    if (state.activePointer !== null) e.preventDefault();
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
    hintCtx.strokeStyle = '#c9d8ea';
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
    const info = { mask: all.mask, bbox: all.bbox, ar: bw / bh, parts };
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

  function colorFidelity(topic) {
    const allowed = topic.colors;
    if (!allowed || !allowed.length) return 1;
    let total = 0, good = 0;
    for (const s of state.strokes) {
      if (s.erase) continue;
      const w = Math.max(1, s.pts.length) * s.size;
      total += w;
      if (allowed.indexOf(s.colorName) >= 0) good += w;
    }
    if (!total) return 1;
    return good / total;
  }

  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function computeScore(topic) {
    const src = drawCanvas;
    const W = src.width, H = src.height;
    const img = drawCtx.getImageData(0, 0, W, H).data;

    // 1) 그린 잉크의 범위와 양
    const step = 2;
    let minX = W, minY = H, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < H; y += step) {
      const row = y * W;
      for (let x = 0; x < W; x += step) {
        if (img[(row + x) * 4 + 3] > 28) {
          count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!count) return { empty: true };
    const inkRatio = (count * 4) / (W * H);
    if (count < 40 || inkRatio < 0.0035) return { empty: true, tiny: true };

    const ref = getRef(topic);
    const rb = ref.bbox;
    const rw = Math.max(1, rb.x1 - rb.x0 + 1);
    const rh = Math.max(1, rb.y1 - rb.y0 + 1);
    const cw = Math.max(3, Math.min(W, maxX + step) - minX);
    const ch = Math.max(3, Math.min(H, maxY + step) - minY);

    // 2) 그림 영역(bounding box)을 참조 도형 크기에 맞춰 정규화
    // 가로·세로를 각각 참조 도형 크기에 맞춘다(비율 차이는 arScore가 따로 감점).
    const sxN = (rw * 1.06) / cw, syN = (rh * 1.06) / ch;
    const ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
    const rcx = (rb.x0 + rb.x1) / 2, rcy = (rb.y0 + rb.y1) / 2;

    const norm = document.createElement('canvas');
    norm.width = GRID; norm.height = GRID;
    const ng = norm.getContext('2d', { willReadFrequently: true });
    ng.setTransform(sxN, 0, 0, syN, rcx - ccx * sxN, rcy - ccy * syN);
    ng.drawImage(src, minX, minY, cw, ch, minX, minY, cw, ch);
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

    // 4) 정밀도 — 그은 선(획의 중심선)이 참조 도형에서 얼마나 벗어났나
    //    (칠한 면적이 아니라 획 자체를 보므로, 캔버스를 뒤덮은 낙서와 모양을 맞춘 그림이 갈린다)
    let pSum = 0, pN = 0, junkN = 0;
    const consider = (x, y) => {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
      if (img[(yi * W + xi) * 4 + 3] <= 28) return; // 지워진 자리는 빼고
      const gx = Math.round(rcx + (x - ccx) * sxN);
      const gy = Math.round(rcy + (y - ccy) * syN);
      pN++;
      if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) { junkN++; return; }
      const d = dRef[gy * GRID + gx];
      pSum += Math.max(0, 1 - d / TOL);
      if (d > 9) junkN++;
    };
    const sx = dpr, sy = dpr; // CSS px → 캔버스 px
    for (const st of state.strokes) {
      if (st.erase || !st.pts.length) continue;
      if (st.pts.length === 1) { consider(st.pts[0].x * sx, st.pts[0].y * sy); continue; }
      for (let i = 1; i < st.pts.length; i++) {
        const ax = st.pts[i - 1].x * sx, ay = st.pts[i - 1].y * sy;
        const bx = st.pts[i].x * sx, by = st.pts[i].y * sy;
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.min(40, Math.ceil(len / 3)));
        for (let k = 0; k < n; k++) consider(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
      }
      const lastP = st.pts[st.pts.length - 1];
      consider(lastP.x * sx, lastP.y * sy);
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

    const raw = clamp01(0.84 * f1 * (1 - 0.55 * junk) + 0.08 * arScore + 0.08 * colorScore);
    let pct = pctFromRaw(raw);
    pct = Math.max(55, Math.min(99, pct));

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
      empty: false, pct, raw, recall, precision, f1, junk, arScore, colorScore,
      missing: missing.map((m) => m.name)
    };
  }

  /* ───────────────────────── 결과 화면 ───────────────────────── */

  // raw(0~1) → 일치율(%). 7세가 실망하지 않도록 아래 구간을 55~99로 부드럽게 편다.
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

    let praise;
    if (res.pct >= 85) praise = topic.praise;
    else if (res.pct >= 70) praise = '우와, ' + topic.word + ' 모양이 많이 닮았어요!';
    else praise = '그림을 아주 열심히 그렸네요!';

    let tip = '';
    if (res.missing && res.missing.length && res.pct < 92) {
      tip = '다음엔 ' + res.missing[0] + '도 그려볼까요?';
    } else {
      tip = topic.tip;
    }
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

    const thumb = exportImage(340, 'image/jpeg', 0.8);
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

  function exportImage(maxDim, mime, quality) {
    const src = drawCanvas;
    const bb = inkBBox(src, 2);
    if (!bb) return null;
    const pad = Math.max(10, Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.07);
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
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(src, x, y, w, h, 0, 0, out.width, out.height);
    return out.toDataURL(mime || 'image/png', quality);
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
        state.gallery = list;
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

  function clearAndNext() {
    clearCanvas();
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
    if (state.strokes.length) {
      const ok = await confirmDialog('그림을 지우고 새 주제로 갈까요?');
      if (!ok) return;
    }
    clearAndNext();
    toast('새 주제: ' + TOPICS[state.topicIndex].emoji + ' ' + TOPICS[state.topicIndex].word);
  }

  /* ───────────────────────── UI 조립 ───────────────────────── */

  function buildPalette() {
    const box = $('palette');
    PALETTE.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = c.hex;
      b.dataset.name = c.name;
      b.setAttribute('aria-label', c.name);
      b.addEventListener('click', () => {
        state.color = c.hex;
        state.colorName = c.name;
        state.eraser = false;
        syncTools();
        savePrefs();
      });
      box.appendChild(b);
    });
  }

  function buildSizes() {
    const box = $('sizes');
    SIZES.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'size-btn';
      b.dataset.px = String(s.px);
      b.setAttribute('aria-label', s.label);
      const i = document.createElement('i');
      const d = Math.max(5, Math.round(s.px * 0.75));
      i.style.width = d + 'px';
      i.style.height = d + 'px';
      b.appendChild(i);
      b.addEventListener('click', () => {
        state.size = s.px;
        state.eraser = false;
        syncTools();
        savePrefs();
      });
      box.appendChild(b);
    });
  }

  function syncTools() {
    document.querySelectorAll('.swatch').forEach((b) => {
      b.classList.toggle('sel', !state.eraser && b.dataset.name === state.colorName);
    });
    document.querySelectorAll('.size-btn').forEach((b) => {
      b.classList.toggle('sel', !state.eraser && Number(b.dataset.px) === state.size);
    });
    $('btnEraser').classList.toggle('on', state.eraser);
    $('btnHint').classList.toggle('on', state.hint);
    $('btnHint').textContent = state.hint ? '🙈 힌트 끄기' : '👀 힌트 보기';
    wrap.classList.toggle('hinting', state.hint);
    $('btnSound').classList.toggle('off', !state.sound);
    $('btnSound').textContent = state.sound ? '🔊' : '🔇';
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
    if (!state.strokes.length) { toast('지울 그림이 없어요 😊'); return; }
    if (!clearArmed) {
      clearArmed = true;
      toast('한 번 더 누르면 전부 지워져요 🧹');
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => { clearArmed = false; }, 2400);
      return;
    }
    clearArmed = false;
    clearCanvas();
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
    $('btnEraser').addEventListener('click', () => {
      state.eraser = !state.eraser;
      syncTools();
    });
    $('btnUndo').addEventListener('click', () => {
      if (!state.strokes.length) { toast('되돌릴 그림이 없어요'); return; }
      state.strokes.pop();
      redraw();
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
      const a = document.createElement('a');
      a.href = data;
      a.download = '유아그림-' + topic.word + '-' + pct + '점.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
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
        rt = setTimeout(setupCanvas, 200);
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
    buildSizes();
    bind();
    renderTopic();
    syncTools();
    // 레이아웃이 잡힌 뒤 캔버스 크기 확정
    requestAnimationFrame(() => { setupCanvas(); renderTopic(); });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }

  init();
})();
