/* kids-app/js/art.js — 🖍️ 색칠하기(12가지 도안) · 👗 캐릭터 꾸미기
   색칠하기는 '영역(region)' 방식으로 바꿔서 손가락이 조금 빗나가도
   누른 부분이 정확히 칠해지고, 안쪽이 새어 나가지 않습니다. */
(function () {
  'use strict';

  var App = window.App;
  var Util = window.Util;
  var KD = window.KD;
  var $id = function (x) { return document.getElementById(x); };
  var setText = function (x, v) { var e = $id(x); if (e) e.textContent = v; };

  /* ══════════════════ 🖍️ 색칠하기 ══════════════════ */

  var OUTLINE = '#3a3a3a';

  function ell(cx, cy, rx, ry, rot, p) { return { t: 'e', cx: cx, cy: cy, rx: rx, ry: ry, rot: rot || 0, p: p }; }
  function cir(cx, cy, r, p) { return { t: 'c', cx: cx, cy: cy, r: r, p: p }; }
  function rect(x, y, w, h, p) { return { t: 'r', x: x, y: y, w: w, h: h, p: p }; }
  function poly(pts, p) { return { t: 'p', pts: pts, p: p }; }
  function svg(d, p) { return { t: 'd', d: d, p: p }; }

  function band(cx, cy, rOut, rIn, a0, a1) {
    var rad = function (a) { return a * Math.PI / 180; };
    var p1x = cx + Math.cos(rad(a0)) * rOut, p1y = cy + Math.sin(rad(a0)) * rOut;
    var p2x = cx + Math.cos(rad(a1)) * rOut, p2y = cy + Math.sin(rad(a1)) * rOut;
    var p3x = cx + Math.cos(rad(a1)) * rIn, p3y = cy + Math.sin(rad(a1)) * rIn;
    var p4x = cx + Math.cos(rad(a0)) * rIn, p4y = cy + Math.sin(rad(a0)) * rIn;
    var large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + p1x + ',' + p1y +
      ' A' + rOut + ',' + rOut + ' 0 ' + large + ' 1 ' + p2x + ',' + p2y +
      ' L' + p3x + ',' + p3y +
      ' A' + rIn + ',' + rIn + ' 0 ' + large + ' 0 ' + p4x + ',' + p4y + ' Z';
  }

  var DESIGNS = [
    {
      id: 'cat', name: '🐱 고양이',
      regions: [
        poly([[33, 27], [27, 8], [46, 19]], '왼쪽 귀'),
        poly([[67, 27], [73, 8], [54, 19]], '오른쪽 귀'),
        ell(79, 62, 4.5, 13, 28, '꼬리'),
        ell(50, 68, 24, 20, 0, '몸통'),
        cir(50, 38, 20, '머리'),
        ell(34, 74, 6, 5, 0, '앞발'),
        ell(66, 74, 6, 5, 0, '앞발'),
        ell(41, 87, 8, 3.5, 0, '발'),
        ell(59, 87, 8, 3.5, 0, '발')
      ],
      deco: [
        { k: 'dot', x: 42, y: 35, r: 2.4 }, { k: 'dot', x: 58, y: 35, r: 2.4 },
        { k: 'dot', x: 50, y: 42, r: 1.8, c: '#f06292' },
        { k: 'line', x1: 50, y1: 44, x2: 44, y2: 47 }, { k: 'line', x1: 50, y1: 44, x2: 56, y2: 47 },
        { k: 'line', x1: 50, y1: 46, x2: 50, y2: 49 }
      ]
    },
    {
      id: 'house', name: '🏠 집',
      regions: [
        rect(66, 22, 8, 18, '굴뚝'),
        rect(22, 44, 56, 44, '벽'),
        poly([[10, 46], [50, 12], [90, 46]], '지붕'),
        rect(43, 66, 14, 22, '문'),
        rect(28, 52, 12, 12, '창문'),
        rect(60, 52, 12, 12, '창문'),
        ell(50, 92, 48, 7, 0, '마당'),
        cir(88, 11, 7, '해')
      ],
      deco: [
        { k: 'em', ch: '🌷', x: 12, y: 88, s: 10 },
        { k: 'em', ch: '🌳', x: 86, y: 84, s: 13 }
      ]
    },
    {
      id: 'rainbow', name: '🌈 무지개',
      regions: [
        svg(band(50, 74, 46, 38, 180, 360), '빨강'),
        svg(band(50, 74, 38, 30, 180, 360), '주황'),
        svg(band(50, 74, 30, 22, 180, 360), '노랑'),
        svg(band(50, 74, 22, 14, 180, 360), '초록'),
        svg(band(50, 74, 14, 6, 180, 360), '파랑'),
        ell(50, 92, 50, 8, 0, '풀밭'),
        cir(16, 70, 8, '구름'),
        cir(26, 72, 6, '구름'),
        cir(84, 70, 8, '구름'),
        cir(74, 72, 6, '구름')
      ],
      deco: [
        { k: 'em', ch: '🌼', x: 30, y: 90, s: 9 },
        { k: 'em', ch: '🌼', x: 70, y: 91, s: 9 }
      ]
    },
    {
      id: 'flower', name: '🌸 꽃',
      regions: [
        rect(48, 52, 4, 36, '줄기'),
        ell(40, 68, 9, 5, -22, '잎'),
        ell(61, 74, 9, 5, 22, '잎'),
        cir(50, 21, 8, '꽃잎'), cir(64, 28, 8, '꽃잎'), cir(70, 42, 8, '꽃잎'),
        cir(64, 55, 8, '꽃잎'), cir(50, 61, 8, '꽃잎'), cir(36, 55, 8, '꽃잎'),
        cir(30, 42, 8, '꽃잎'), cir(36, 28, 8, '꽃잎'),
        cir(50, 41, 8, '꽃 가운데'),
        ell(50, 93, 46, 6, 0, '땅'),
        cir(86, 12, 7, '해')
      ],
      deco: [{ k: 'em', ch: '🐝', x: 18, y: 30, s: 11 }]
    },
    {
      id: 'dino', name: '🦕 공룡',
      regions: [
        poly([[26, 60], [6, 42], [8, 66], [26, 70]], '꼬리'),
        poly([[30, 46], [34, 32], [38, 46]], '등 가시'),
        poly([[40, 42], [44, 28], [48, 42]], '등 가시'),
        poly([[50, 46], [54, 34], [58, 46]], '등 가시'),
        rect(36, 72, 9, 16, '다리'),
        rect(54, 72, 9, 16, '다리'),
        ell(46, 58, 26, 20, 0, '몸통'),
        ell(70, 46, 11, 13, -20, '목'),
        cir(76, 32, 14, '머리'),
        ell(50, 92, 48, 7, 0, '땅')
      ],
      deco: [
        { k: 'dot', x: 80, y: 28, r: 2.2 },
        { k: 'dot', x: 68, y: 52, r: 1.6, c: '#81c784' },
        { k: 'dot', x: 46, y: 56, r: 1.6, c: '#81c784' }
      ]
    },
    {
      id: 'rocket', name: '🚀 로켓',
      regions: [
        svg('M50,6 q15,20 15,46 v18 h-30 v-18 q0,-26 15,-46 z', '로켓 몸통'),
        cir(50, 38, 7, '창문'),
        poly([[36, 52], [22, 78], [36, 68]], '날개'),
        poly([[64, 52], [78, 78], [64, 68]], '날개'),
        poly([[43, 70], [57, 70], [50, 94]], '불꽃'),
        poly([[46, 70], [54, 70], [50, 84]], '불꽃'),
        cir(16, 22, 3.5, '별'), cir(84, 32, 3.5, '별'), cir(22, 80, 3, '별'),
        cir(84, 84, 2.5, '별')
      ],
      deco: [{ k: 'dot', x: 50, y: 38, r: 3, c: '#bbdefb' }]
    },
    {
      id: 'car', name: '🚗 자동차',
      regions: [
        rect(0, 84, 100, 16, '길'),
        svg('M10,66 q0,-12 12,-12 h12 l8,-14 h26 l10,14 h8 q12,0 12,12 v8 h-88 z', '차 몸통'),
        rect(41, 45, 24, 10, '창문'),
        cir(30, 74, 10, '바퀴'), cir(72, 74, 10, '바퀴'),
        cir(30, 74, 4, '바퀴 가운데'), cir(72, 74, 4, '바퀴 가운데'),
        cir(90, 62, 3, '전조등')
      ],
      deco: [
        { k: 'line', x1: 12, y1: 92, x2: 24, y2: 92, c: '#fff' },
        { k: 'line', x1: 40, y1: 92, x2: 52, y2: 92, c: '#fff' },
        { k: 'line', x1: 66, y1: 92, x2: 78, y2: 92, c: '#fff' }
      ]
    },
    {
      id: 'fish', name: '🐠 물고기',
      regions: [
        ell(50, 92, 50, 8, 0, '모래'),
        poly([[72, 52], [94, 34], [94, 70]], '꼬리'),
        ell(46, 52, 26, 18, 0, '몸통'),
        poly([[40, 34], [52, 24], [56, 36]], '등지느러미'),
        poly([[40, 70], [52, 80], [56, 68]], '배지느러미'),
        cir(18, 26, 4, '물방울'), cir(11, 16, 3, '물방울'), cir(21, 11, 2.5, '물방울'),
        svg('M14,88 q6,-16 0,-30 q8,14 4,30 z', '해초'),
        svg('M86,90 q-7,-14 0,-26 q9,12 3,26 z', '해초')
      ],
      deco: [
        { k: 'dot', x: 30, y: 48, r: 2.4 },
        { k: 'line', x1: 56, y1: 42, x2: 50, y2: 52 },
        { k: 'line', x1: 56, y1: 62, x2: 50, y2: 52 },
        { k: 'line', x1: 62, y1: 42, x2: 56, y2: 52 },
        { k: 'line', x1: 62, y1: 62, x2: 56, y2: 52 }
      ]
    },
    {
      id: 'cake', name: '🍰 케이크',
      regions: [
        ell(50, 93, 46, 6, 0, '접시'),
        rect(22, 62, 56, 26, '아래 시트'),
        svg('M22,62 q7,-9 14,0 q7,-9 14,0 q7,-9 14,0 q7,-9 14,0 v-8 h-56 z', '크림'),
        rect(28, 40, 44, 14, '윗 시트'),
        cir(50, 34, 6, '체리'),
        rect(48, 20, 4, 14, '초'),
        ell(50, 16, 4, 6, 0, '불꽃')
      ],
      deco: [
        { k: 'dot', x: 36, y: 47, r: 1.6, c: '#fff' },
        { k: 'dot', x: 50, y: 48, r: 1.6, c: '#fff' },
        { k: 'dot', x: 64, y: 47, r: 1.6, c: '#fff' },
        { k: 'dot', x: 34, y: 74, r: 1.8, c: '#fff' },
        { k: 'dot', x: 50, y: 78, r: 1.8, c: '#fff' },
        { k: 'dot', x: 66, y: 73, r: 1.8, c: '#fff' }
      ]
    },
    {
      id: 'butterfly', name: '🦋 나비',
      regions: [
        ell(33, 32, 17, 21, -25, '날개'),
        ell(67, 32, 17, 21, 25, '날개'),
        ell(36, 68, 14, 17, -15, '날개'),
        ell(64, 68, 14, 17, 15, '날개'),
        ell(50, 50, 5, 27, 0, '몸통'),
        cir(50, 21, 6, '머리'),
        cir(10, 90, 5, '꽃'), cir(90, 88, 5, '꽃')
      ],
      deco: [
        { k: 'dot', x: 33, y: 30, r: 3.2, c: '#fff' },
        { k: 'dot', x: 67, y: 30, r: 3.2, c: '#fff' },
        { k: 'line', x1: 48, y1: 16, x2: 42, y2: 8 },
        { k: 'line', x1: 52, y1: 16, x2: 58, y2: 8 },
        { k: 'dot', x: 41, y: 7, r: 1.5 }, { k: 'dot', x: 59, y: 7, r: 1.5 }
      ]
    },
    {
      id: 'castle', name: '🏰 공주성',
      regions: [
        ell(50, 94, 50, 6, 0, '땅'),
        rect(24, 54, 52, 38, '성벽'),
        rect(16, 42, 12, 50, '왼쪽 탑'),
        rect(72, 42, 12, 50, '오른쪽 탑'),
        rect(44, 30, 12, 62, '가운데 탑'),
        poly([[12, 44], [22, 24], [32, 44]], '지붕'),
        poly([[68, 44], [78, 24], [88, 44]], '지붕'),
        poly([[40, 32], [50, 10], [60, 32]], '지붕'),
        svg('M44,92 v-16 q6,-8 12,0 v16 z', '문'),
        rect(28, 62, 8, 10, '창문'), rect(64, 62, 8, 10, '창문'),
        ell(20, 20, 10, 5, 0, '구름'), ell(82, 14, 9, 5, 0, '구름')
      ],
      deco: [{ k: 'em', ch: '🚩', x: 50, y: 8, s: 9 }]
    },
    {
      id: 'rabbit', name: '🐰 토끼',
      regions: [
        ell(50, 94, 46, 6, 0, '풀밭'),
        ell(42, 20, 6, 15, -8, '귀'),
        ell(58, 20, 6, 15, 8, '귀'),
        ell(50, 70, 18, 19, 0, '몸통'),
        cir(50, 42, 17, '머리'),
        ell(38, 88, 8, 5, 0, '발'),
        ell(62, 88, 8, 5, 0, '발'),
        cir(70, 76, 6, '꼬리'),
        poly([[88, 74], [94, 88], [82, 88]], '당근'),
        poly([[85, 74], [88, 66], [91, 74]], '당근 잎')
      ],
      deco: [
        { k: 'dot', x: 43, y: 40, r: 2.2 }, { k: 'dot', x: 57, y: 40, r: 2.2 },
        { k: 'dot', x: 50, y: 46, r: 1.6, c: '#f06292' }
      ]
    }
  ];

  var PALETTE = KD.COL_PALETTE.concat(['#F06292', '#80DEEA', '#BCAAA4', '#FFD54F', '#A5D6A7']);

  var colCv = null, colCtx = null, hitCtx = null, curDesign = 0, curColor = '#FF0000',
    colors = [], history = [], colW = 0, colH = 0, colScale = 1;

  function designPath(r) {
    var p = new Path2D();
    if (r.t === 'e') p.ellipse(r.cx, r.cy, r.rx, r.ry, r.rot || 0, 0, Math.PI * 2);
    else if (r.t === 'c') p.arc(r.cx, r.cy, r.r, 0, Math.PI * 2);
    else if (r.t === 'r') p.rect(r.x, r.y, r.w, r.h);
    else if (r.t === 'p') {
      var pts = r.pts;
      p.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
      p.closePath();
    } else if (r.t === 'd') return new Path2D(r.d);
    return p;
  }

  var pathCache = {};

  function pathsOf(di) {
    if (pathCache[di]) return pathCache[di];
    var list = DESIGNS[di].regions.map(designPath);
    pathCache[di] = list;
    return list;
  }

  function colorSetup() {
    colCv = $id('col-canvas');
    if (!colCv) return;
    colCtx = colCv.getContext('2d');
    var vw = Math.min(window.innerWidth, 460);
    colW = Math.floor(vw - 20);
    colH = Math.floor(Math.min(colW * 1.14, 440));
    colCv.width = colW;
    colCv.height = colH;
    colCv.style.width = colW + 'px';
    colCv.style.height = colH + 'px';
    colScale = colW / 100;

    var hc = document.createElement('canvas');
    hc.width = 100; hc.height = 100;
    hitCtx = hc.getContext('2d');

    buildDesignButtons();
    buildPalette();
    bindCanvas();
  }

  function buildDesignButtons() {
    var box = $id('col-designs');
    if (!box) return;
    box.innerHTML = '';
    DESIGNS.forEach(function (d, i) {
      var b = document.createElement('button');
      b.className = 'col-design-btn' + (i === curDesign ? ' active' : '');
      b.textContent = d.name;
      b.onclick = function () { loadDesign(i); };
      box.appendChild(b);
    });
  }

  function buildPalette() {
    var pal = $id('col-palette');
    if (!pal) return;
    pal.innerHTML = '';
    PALETTE.forEach(function (c) {
      var s = document.createElement('div');
      s.className = 'col-sw' + (c === curColor ? ' active' : '');
      s.style.background = c;
      if (c === '#ffffff') s.style.border = '2px solid #ccc';
      s.onclick = function () {
        curColor = c;
        var all = document.querySelectorAll('.col-sw');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
        s.classList.add('active');
        Util.beep('ok');
      };
      pal.appendChild(s);
    });
  }

  function loadDesign(i) {
    curDesign = i;
    colors = DESIGNS[i].regions.map(function () { return '#ffffff'; });
    history = [];
    var btns = document.querySelectorAll('.col-design-btn');
    for (var k = 0; k < btns.length; k++) btns[k].classList.toggle('active', k === i);
    render();
  }

  function render() {
    if (!colCtx) return;
    var d = DESIGNS[curDesign];
    var paths = pathsOf(curDesign);
    colCtx.setTransform(1, 0, 0, 1, 0, 0);
    colCtx.fillStyle = '#ffffff';
    colCtx.fillRect(0, 0, colW, colH);
    colCtx.setTransform(colScale, 0, 0, colScale, 0, 0);
    colCtx.lineJoin = 'round';
    colCtx.lineCap = 'round';

    for (var i = 0; i < paths.length; i++) {
      colCtx.fillStyle = colors[i] || '#ffffff';
      colCtx.fill(paths[i]);
    }
    colCtx.strokeStyle = OUTLINE;
    colCtx.lineWidth = 1.6;
    for (var j = 0; j < paths.length; j++) colCtx.stroke(paths[j]);

    if (d.deco) {
      d.deco.forEach(function (o) {
        if (o.k === 'dot') {
          colCtx.fillStyle = o.c || '#3a3a3a';
          colCtx.beginPath();
          colCtx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
          colCtx.fill();
        } else if (o.k === 'line') {
          colCtx.strokeStyle = o.c || '#3a3a3a';
          colCtx.lineWidth = 1;
          colCtx.beginPath();
          colCtx.moveTo(o.x1, o.y1);
          colCtx.lineTo(o.x2, o.y2);
          colCtx.stroke();
        } else if (o.k === 'em') {
          colCtx.font = o.s + 'px serif';
          colCtx.textAlign = 'center';
          colCtx.textBaseline = 'middle';
          colCtx.fillText(o.ch, o.x, o.y);
        }
      });
    }
  }

  function bindCanvas() {
    var tap = function (clientX, clientY) {
      var r = colCv.getBoundingClientRect();
      var x = (clientX - r.left) / r.width * 100;
      var y = (clientY - r.top) / r.height * 100;
      fillAt(x, y);
    };
    colCv.ontouchstart = function (e) { e.preventDefault(); tap(e.touches[0].clientX, e.touches[0].clientY); };
    colCv.onmousedown = function (e) { tap(e.clientX, e.clientY); };
    colCv.ondragstart = function (e) { e.preventDefault(); };
  }

  function fillAt(x, y) {
    var paths = pathsOf(curDesign);
    for (var i = paths.length - 1; i >= 0; i--) {
      if (hitCtx.isPointInPath(paths[i], x, y)) {
        if (colors[i] === curColor) return;
        history.push({ i: i, prev: colors[i] });
        if (history.length > 60) history.shift();
        colors[i] = curColor;
        render();
        Util.beep('ok');
        return;
      }
    }
  }

  function undo() {
    if (!history.length) { Util.beep('ng'); return; }
    var h = history.pop();
    colors[h.i] = h.prev;
    render();
  }

  function reset() {
    history = [];
    colors = DESIGNS[curDesign].regions.map(function () { return '#ffffff'; });
    render();
  }

  function save() {
    try {
      var a = document.createElement('a');
      a.download = '내색칠_' + Date.now() + '.png';
      a.href = colCv.toDataURL('image/png');
      a.click();
    } catch (e) {}
    App.SD.drawSaved = (App.SD.drawSaved || 0) + 1;
    App.writeSave();
    App.checkAch();
    setTimeout(function () {
      App.earnReward('🖍️', DESIGNS[curDesign].name + ' 색칠 완성! 멋진 화가! 🎨');
    }, 250);
  }

  function openColoring() {
    App.show('coloring');
    colorSetup();
    loadDesign(curDesign);
  }

  /* ══════════════════ 👗 캐릭터 꾸미기 ══════════════════ */

  var DRESS_CATS = KD.DRESS_CATS;
  var DRESS_ITEMS = KD.DRESS_ITEMS;
  var dressCat = 'hat';

  function dressEnsure() {
    var SD = App.SD;
    if (!SD.dressOwned) SD.dressOwned = { hat: ['h1'], acc: ['a1'], bg: ['b1'] };
    if (!SD.dressWearing) SD.dressWearing = { hat: 'h1', acc: '', bg: 'b1' };
  }

  function dressApply() {
    dressEnsure();
    var w = App.SD.dressWearing;
    var hat = findItem('hat', w.hat), acc = findItem('acc', w.acc), bg = findItem('bg', w.bg);
    setText('dr-hat', hat ? hat.em : '');
    setText('dr-acc', acc ? acc.em : '');
    setText('dr-bg-em', bg ? bg.em : '');
    var st = App.stageOf(App.SD.charLv);
    var base = $id('dr-base');
    if (base) base.textContent = st.emoji;
    setText('dr-sticker-n', String(App.SD.totalStickers || 0));
    App.updateHomeStatus();
  }

  function findItem(cat, id) {
    if (!id) return null;
    var list = DRESS_ITEMS[cat] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function buildDressTabs() {
    var el = $id('dress-tabs');
    if (!el) return;
    el.innerHTML = '';
    DRESS_CATS.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'dress-tab' + (c.id === dressCat ? ' active' : '');
      b.textContent = c.label;
      b.onclick = function () { dressCat = c.id; buildDressTabs(); buildDressItems(); };
      el.appendChild(b);
    });
  }

  function buildDressItems() {
    dressEnsure();
    var el = $id('dress-items');
    if (!el) return;
    el.innerHTML = '';
    var items = DRESS_ITEMS[dressCat];
    var owned = App.SD.dressOwned[dressCat] || [];
    var wearing = App.SD.dressWearing[dressCat];
    items.forEach(function (item) {
      var isOwned = item.free || owned.indexOf(item.id) >= 0;
      var isWearing = wearing === item.id;
      var div = document.createElement('div');
      div.className = 'dress-item' + (isWearing ? ' selected' : '') + (isOwned ? '' : ' locked');
      div.innerHTML = '<span class="di-em">' + item.em + '</span><span class="di-name">' + item.name + '</span>' +
        '<span class="di-price">' + (isOwned ? '✅ 보유' : '🏷️ ' + item.price + '개') + '</span>' +
        (!isOwned ? '<span class="di-lock">🔒</span>' : '');
      div.onclick = function () { dressSelect(item, isOwned); };
      el.appendChild(div);
    });
  }

  function dressSelect(item, isOwned) {
    dressEnsure();
    var SD = App.SD;
    if (isOwned) {
      SD.dressWearing[dressCat] = (SD.dressWearing[dressCat] === item.id) ? '' : item.id;
      App.writeSave();
      dressApply();
      buildDressItems();
      Util.beep('ok');
    } else if ((SD.totalStickers || 0) >= item.price) {
      SD.totalStickers -= item.price;
      if (!SD.dressOwned[dressCat]) SD.dressOwned[dressCat] = [];
      SD.dressOwned[dressCat].push(item.id);
      SD.dressWearing[dressCat] = item.id;
      App.writeSave();
      App.updateHomeStatus();
      dressApply();
      buildDressItems();
      Util.beep('win');
      App.showSp(item.em, item.name + ' 구매 완료! 이제 홈 캐릭터도 바뀌어요 💖');
    } else {
      Util.beep('ng');
      App.showTip('😢', '스티커 ' + item.price + '개가 필요해요! 지금 ' + (SD.totalStickers || 0) + '개 있어요.');
    }
  }

  function removeCur() {
    dressEnsure();
    App.SD.dressWearing[dressCat] = '';
    App.writeSave();
    dressApply();
    buildDressItems();
  }

  function openDress() {
    App.show('dress');
    dressEnsure();
    dressCat = 'hat';
    dressApply();
    buildDressTabs();
    buildDressItems();
  }

  window.Coloring = {
    undo: undo, reset: reset, save: save,
    _qa: function () { return { design: curDesign, name: DESIGNS[curDesign].name, regions: DESIGNS[curDesign].regions.length, painted: colors.filter(function (c) { return c !== '#ffffff'; }).length, history: history.length }; }
  };
  window.Dress = {
    removeCur: removeCur,
    homeHero: function () { App.updateHomeStatus(); App.showSp('🏠', '홈 화면 캐릭터에 그대로 입혔어요!'); }
  };
  App.openColoring = openColoring;
  App.openDress = openDress;
})();
