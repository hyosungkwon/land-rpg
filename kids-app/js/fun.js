/* kids-app/js/fun.js — 🃏 기억력 카드 · 🎈 풍선 · 🔍 틀린그림찾기 · 🌀 미로
   2026-11-26 개선: 3D 뒤집기·테마/난이도, 황금·무지개·폭탄 풍선, 5스테이지+힌트,
   매번 새로 생기는 미로 + 손가락 드래그(벽에 닿으면 미끄러짐) + 발자국 */
(function () {
  'use strict';

  var App = window.App;
  var Util = window.Util;
  var $id = function (x) { return document.getElementById(x); };
  var setText = function (x, v) { var e = $id(x); if (e) e.textContent = v; };

  /* ══════════════════ 🃏 기억력 카드 ══════════════════ */

  var MEM_THEMES = [
    { id: 'animal', name: '동물', list: ['🐱', '🐶', '🐸', '🦊', '🐼', '🦁', '🐮', '🐧', '🦋', '🐠'] },
    { id: 'fruit', name: '과일', list: ['🍎', '🍌', '🍇', '🍓', '🍊', '🍉', '🍋', '🍑', '🥝', '🍒'] },
    { id: 'car', name: '탈것', list: ['🚗', '🚌', '🚂', '✈️', '🚢', '🚲', '🚀', '🚁', '🚒', '🚑'] }
  ];
  var MEM_DIFFS = [{ cols: 4, rows: 3, label: '쉬움' }, { cols: 4, rows: 4, label: '보통' }, { cols: 5, rows: 4, label: '도전' }];

  var memTheme = 0, memDiff = 1, memPairs = 8, memCards = [], memOpen = [], memMatched = 0,
    memTries = 0, memTid = null, memEl = 0, memLocked = false;

  function memClear() { clearInterval(memTid); memTid = null; }

  function buildThemes() {
    var box = $id('mem-themes');
    if (!box) return;
    box.innerHTML = '';
    MEM_THEMES.forEach(function (t, i) {
      var b = document.createElement('button');
      b.className = 'gbtn ' + (i === memTheme ? 'gp' : 'gb');
      b.style.padding = '8px 16px';
      b.textContent = (i === memTheme ? '✅ ' : '') + t.name;
      b.onclick = function () { memTheme = i; buildThemes(); };
      box.appendChild(b);
    });
  }

  function memDiffSel() {
    $id('mem-diff-sel').style.display = 'flex';
    $id('mem-game').style.display = 'none';
    memClear();
    buildThemes();
  }

  function memBegin(d) {
    memDiff = d;
    $id('mem-diff-sel').style.display = 'none';
    $id('mem-game').style.display = 'flex';
    memBeginCur();
  }

  function memBeginCur() {
    var d = MEM_DIFFS[memDiff];
    var cells = d.cols * d.rows;
    memPairs = Math.floor(cells / 2);
    memClear();
    memOpen = []; memMatched = 0; memTries = 0; memEl = 0; memLocked = false;
    setText('mem-tries', '0'); setText('mem-matched', '0'); setText('mem-tm', '0');
    memTid = setInterval(function () { memEl++; setText('mem-tm', String(memEl)); }, 1000);

    var pool = Util.shuffle(MEM_THEMES[memTheme].list).slice(0, memPairs);
    memCards = Util.shuffle(pool.concat(pool));

    var vw = Math.min(window.innerWidth, 440);
    var gap = 7;
    var cardSz = Math.floor((vw - 34 - (d.cols - 1) * gap) / d.cols);
    cardSz = Math.max(46, Math.min(cardSz, 84));

    var grid = $id('mem-grid');
    grid.style.gridTemplateColumns = 'repeat(' + d.cols + ',' + cardSz + 'px)';
    grid.style.gap = gap + 'px';
    grid.innerHTML = '';
    memCards.forEach(function (em, i) {
      var c = document.createElement('div');
      c.className = 'mem-card';
      c.dataset.i = String(i);
      c.style.width = cardSz + 'px';
      c.style.height = cardSz + 'px';
      c.innerHTML = '<div class="mem-inner"><div class="mem-face mem-back">?</div>' +
        '<div class="mem-face mem-front" style="font-size:' + Math.round(cardSz * 0.52) + 'px">' + em + '</div></div>';
      c.onclick = function () { memFlip(c, i); };
      grid.appendChild(c);
    });
  }

  function memFlip(card, idx) {
    if (memLocked || card.classList.contains('matched')) return;
    if (memOpen.indexOf(idx) >= 0) return;
    card.classList.add('flipped');
    memOpen.push(idx);
    Util.beep('ok');
    if (memOpen.length === 2) {
      memTries++;
      setText('mem-tries', String(memTries));
      var a = memOpen[0], b = memOpen[1];
      if (memCards[a] === memCards[b]) {
        memMatched++;
        setText('mem-matched', String(memMatched));
        var ca = document.querySelector('.mem-card[data-i="' + a + '"]');
        var cb = document.querySelector('.mem-card[data-i="' + b + '"]');
        if (ca) ca.classList.add('matched');
        if (cb) cb.classList.add('matched');
        memOpen = [];
        Util.beep('combo');
        if (memMatched === memPairs) memWin();
      } else {
        memLocked = true;
        var wa = document.querySelector('.mem-card[data-i="' + a + '"]');
        var wb = document.querySelector('.mem-card[data-i="' + b + '"]');
        setTimeout(function () {
          if (wa) wa.classList.remove('flipped');
          if (wb) wb.classList.remove('flipped');
          memOpen = [];
          memLocked = false;
        }, 850);
      }
    }
  }

  function memWin() {
    memClear();
    App.SD.memDone = (App.SD.memDone || 0) + 1;
    App.writeSave();
    App.checkAch();
    setTimeout(function () {
      App.earnReward('🃏', '기억력 게임 완료! ' + memTries + '번 만에 ' + memEl + '초! 두뇌왕 🧠');
    }, 420);
  }

  /* ══════════════════ 🎈 풍선 터뜨리기 ══════════════════ */

  var BAL_COLORS = ['#FF6B6B', '#FF9800', '#FFD93D', '#4ECDC4', '#A78BFA', '#FF6B9D', '#4CAF50', '#42a5f5'];
  var BAL_EMOJIS = ['🎈', '🎀', '⭐', '🌟', '❤️', '🌈', '🦋', '🌸'];

  var balSc = 0, balMiss = 0, balCombo = 0, balBoost = 0, balTid = null, balSpawn = null,
    balCountdown = null, balTimeLeft = 30, balDiff = 'normal', balBubbles = [], balRaf = null;

  function balClearAll() {
    clearInterval(balTid); balTid = null;
    clearInterval(balSpawn); balSpawn = null;
    clearInterval(balCountdown); balCountdown = null;
    if (balRaf) { cancelAnimationFrame(balRaf); balRaf = null; }
  }

  function balloonInit() {
    balClearAll();
    balBubbles = [];
    var f = $id('bal-field');
    if (f) f.innerHTML = '';
    $id('bal-start-screen').style.display = 'flex';
    $id('bal-game').style.display = 'none';
  }

  function balloonBegin(diff) {
    balDiff = diff;
    balSc = 0; balMiss = 0; balCombo = 0; balBoost = 0;
    balTimeLeft = diff === 'easy' ? 45 : diff === 'normal' ? 30 : 20;
    setText('bal-sc', '0'); setText('bal-miss', '0'); setText('bal-combo', '0');
    setText('bal-tm', String(balTimeLeft));
    $id('bal-start-screen').style.display = 'none';
    $id('bal-game').style.display = 'flex';
    var field = $id('bal-field');
    field.innerHTML = '';
    balBubbles = [];
    balClearAll();

    var spawnMs = diff === 'easy' ? 1600 : diff === 'normal' ? 1050 : 700;
    var speed = diff === 'easy' ? 1.0 : diff === 'normal' ? 1.7 : 2.7;

    balCountdown = setInterval(function () {
      balTimeLeft--;
      setText('bal-tm', String(balTimeLeft));
      if (balTimeLeft <= 0) balloonEnd();
    }, 1000);
    balSpawn = setInterval(function () { spawnBalloon(speed); }, spawnMs);
    spawnBalloon(speed);
    balRaf = requestAnimationFrame(moveBalloons);
  }

  function balloonEnd() {
    balClearAll();
    if (balSc >= 60) App.earnReward('🎈', '풍선 ' + balSc + '점! 정말 대단해요! 💥');
    else if (balSc >= 20) App.showTip('🎈', balSc + '점! 잘했어요! 한 번 더?');
    else App.showTip('🎈', balSc + '점! 다시 해봐요! 💪');
    balloonInit();
  }

  function balloonStop() { balClearAll(); }

  function pickType() {
    var r = Math.random();
    if (r < 0.12) return 'gold';
    if (r < 0.24) return 'rainbow';
    if (r < 0.34) return 'bomb';
    return 'normal';
  }

  function spawnBalloon(speed) {
    var field = $id('bal-field');
    if (!field) return;
    var W = field.clientWidth || 320;
    var type = pickType();
    var size = type === 'bomb' ? 52 + Math.random() * 12 : 50 + Math.random() * 28;
    var x = Math.random() * Math.max(10, W - size);
    var col = BAL_COLORS[Math.floor(Math.random() * BAL_COLORS.length)];
    var em = type === 'bomb' ? '💣' : type === 'gold' ? '⭐' : type === 'rainbow' ? '🌈' : BAL_EMOJIS[Math.floor(Math.random() * BAL_EMOJIS.length)];
    var el = document.createElement('div');
    el.className = 'bal-bubble' + (type === 'gold' ? ' gold' : type === 'rainbow' ? ' rainbow' : type === 'bomb' ? ' bomb' : '');
    var bg = type === 'bomb' ? 'radial-gradient(circle at 35% 30%,#555,#111)'
      : type === 'gold' ? 'radial-gradient(circle at 35% 30%,#fff3b0,#FFB300)'
        : type === 'rainbow' ? 'linear-gradient(135deg,#ff9a9e,#fad0c4,#a1c4fd,#c2e9fb)'
          : col;
    el.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + x + 'px;bottom:-' + size + 'px;background:' + bg + ';font-size:' + (size * 0.44) + 'px;';
    el.textContent = em;
    var obj = { el: el, x: x, y: -size, vx: (Math.random() - 0.5) * 1.4, vy: speed + Math.random() * 1.6, size: size, type: type, popped: false };
    el.addEventListener('touchstart', function (e) { e.preventDefault(); popBalloon(obj); }, { passive: false });
    el.addEventListener('mousedown', function () { popBalloon(obj); });
    balBubbles.push(obj);
    field.appendChild(el);
  }

  function moveBalloons() {
    var field = $id('bal-field');
    if (!field) { balRaf = null; return; }
    var H = field.clientHeight || 400;
    var W = field.clientWidth || 320;
    var alive = [];
    for (var i = 0; i < balBubbles.length; i++) {
      var b = balBubbles[i];
      if (b.popped) continue;
      b.y += b.vy;
      b.x += b.vx;
      if (b.x < 0 || b.x > W - b.size) b.vx *= -1;
      b.el.style.bottom = (H - b.y - b.size) + 'px';
      b.el.style.left = b.x + 'px';
      if (b.y > H + b.size) {
        b.el.remove();
        if (b.type !== 'bomb') {
          balMiss++;
          setText('bal-miss', String(balMiss));
          balCombo = 0;
          setText('bal-combo', '0');
          Util.beep('ng');
          if (balMiss >= 10) { balloonEnd(); return; }
        }
        continue;
      }
      alive.push(b);
    }
    balBubbles = alive;
    balRaf = requestAnimationFrame(moveBalloons);
  }

  function popBalloon(b) {
    if (b.popped) return;
    b.popped = true;
    var field = $id('bal-field');
    b.el.classList.add('bal-pop');

    if (b.type === 'bomb') {
      balSc = Math.max(0, balSc - 10);
      balCombo = 0; balBoost = 0;
      setText('bal-sc', String(balSc));
      setText('bal-combo', '0');
      Util.beep('ng');
      var flash = document.createElement('div');
      flash.className = 'bal-flash';
      field.appendChild(flash);
      setTimeout(function () { flash.remove(); }, 420);
      floatText(b, '-10 💣', '#ff5252');
    } else {
      var pts;
      if (b.type === 'gold') pts = 30;
      else if (b.type === 'rainbow') pts = 20;
      else pts = 10;
      balCombo++;
      if (b.type === 'rainbow') { balBoost = 3; }
      var mult = balBoost > 0 ? 2 : 1;
      if (balBoost > 0) balBoost--;
      var gained = pts * mult;
      if (balCombo > 0 && balCombo % 5 === 0) gained += 10;
      balSc += gained;
      setText('bal-sc', String(balSc));
      setText('bal-combo', String(balCombo));
      Util.beep(balCombo % 5 === 0 ? 'combo' : 'ok');
      floatText(b, '+' + gained + (mult > 1 ? ' ×2' : ''), b.type === 'gold' ? '#FFD93D' : '#fff');
      if (balCombo % 3 === 0) comboText(balCombo + ' 콤보!');
      starBurst(b);
    }
    setTimeout(function () {
      b.el.remove();
      var idx = balBubbles.indexOf(b);
      if (idx >= 0) balBubbles.splice(idx, 1);
    }, 320);
  }

  function floatText(b, text, color) {
    var field = $id('bal-field');
    if (!field) return;
    var t = document.createElement('div');
    t.style.cssText = 'position:absolute;left:' + b.x + 'px;bottom:' + (parseFloat(b.el.style.bottom || '0') + b.size) + 'px;color:' + color +
      ';font-size:1rem;font-family:Jua,sans-serif;font-weight:bold;pointer-events:none;animation:balPop .9s ease forwards;z-index:10;';
    t.textContent = text;
    field.appendChild(t);
    setTimeout(function () { t.remove(); }, 700);
  }

  function comboText(text) {
    var field = $id('bal-field');
    if (!field) return;
    var t = document.createElement('div');
    t.className = 'bal-combo';
    t.textContent = text;
    field.appendChild(t);
    setTimeout(function () { t.remove(); }, 720);
  }

  function starBurst(b) {
    var field = $id('bal-field');
    if (!field) return;
    for (var i = 0; i < 5; i++) {
      var s = document.createElement('span');
      s.className = 'bal-star';
      var ang = Math.random() * Math.PI * 2;
      s.style.cssText = 'left:' + (b.x + b.size / 2) + 'px;bottom:' + (parseFloat(b.el.style.bottom || '0') + b.size / 2) + 'px;--dx:' +
        Math.cos(ang) * 30 + 'px;--dy:' + (Math.sin(ang) * 24 - 12) + 'px;';
      s.textContent = ['⭐', '✨', '💫'][i % 3];
      field.appendChild(s);
      (function (node) { setTimeout(function () { node.remove(); }, 700); })(s);
    }
  }

  /* ══════════════════ 🔍 틀린그림찾기 ══════════════════ */

  var DIFF_STAGES = [
    {
      name: '숲속 소풍', bg1: '#bfe6a8', bg2: '#7ec850', ground: '#5aa83c',
      items: [
        { em: '☀️', x: 0.82, y: 0.12, s: 40 }, { em: '☁️', x: 0.24, y: 0.12, s: 34 },
        { em: '🌳', x: 0.16, y: 0.55, s: 62 }, { em: '🌳', x: 0.86, y: 0.62, s: 54 },
        { em: '🧺', x: 0.50, y: 0.78, s: 40 }, { em: '🍄', x: 0.30, y: 0.86, s: 26 },
        { em: '🦋', x: 0.66, y: 0.42, s: 28 }, { em: '🐰', x: 0.72, y: 0.80, s: 36 },
        { em: '🌼', x: 0.42, y: 0.92, s: 22 }
      ]
    },
    {
      name: '바닷속 친구들', bg1: '#8fd8f0', bg2: '#1f7fa8', ground: '#e8d5a3',
      items: [
        { em: '🐠', x: 0.22, y: 0.30, s: 36 }, { em: '🐠', x: 0.66, y: 0.22, s: 30 },
        { em: '🐙', x: 0.78, y: 0.55, s: 42 }, { em: '🐡', x: 0.42, y: 0.44, s: 30 },
        { em: '🦀', x: 0.24, y: 0.82, s: 30 }, { em: '🐚', x: 0.58, y: 0.88, s: 26 },
        { em: '🪸', x: 0.12, y: 0.66, s: 44 }, { em: '🐢', x: 0.86, y: 0.84, s: 34 },
        { em: '⭐', x: 0.48, y: 0.72, s: 24 }
      ]
    },
    {
      name: '우주 여행', bg1: '#1b1b3a', bg2: '#06060f', ground: '#2a2a5a',
      items: [
        { em: '🚀', x: 0.30, y: 0.40, s: 44 }, { em: '🪐', x: 0.74, y: 0.26, s: 46 },
        { em: '🌙', x: 0.16, y: 0.20, s: 32 }, { em: '👽', x: 0.62, y: 0.62, s: 34 },
        { em: '🛸', x: 0.24, y: 0.74, s: 36 }, { em: '☄️', x: 0.84, y: 0.72, s: 30 },
        { em: '🌍', x: 0.48, y: 0.86, s: 30 }, { em: '⭐', x: 0.46, y: 0.16, s: 22 },
        { em: '✨', x: 0.90, y: 0.46, s: 22 }
      ]
    },
    {
      name: '케이크 파티', bg1: '#ffe0f0', bg2: '#ffb6d5', ground: '#f48fb1',
      items: [
        { em: '🎂', x: 0.50, y: 0.62, s: 58 }, { em: '🍰', x: 0.18, y: 0.70, s: 34 },
        { em: '🎈', x: 0.80, y: 0.26, s: 34 }, { em: '🎁', x: 0.26, y: 0.34, s: 32 },
        { em: '🍭', x: 0.66, y: 0.36, s: 28 }, { em: '🧁', x: 0.82, y: 0.70, s: 30 },
        { em: '🎉', x: 0.12, y: 0.20, s: 26 }, { em: '🍓', x: 0.40, y: 0.24, s: 24 },
        { em: '🕯️', x: 0.58, y: 0.88, s: 24 }
      ]
    },
    {
      name: '동네 놀이터', bg1: '#cfe9ff', bg2: '#a5d8ff', ground: '#9ccc65',
      items: [
        { em: '⚽', x: 0.30, y: 0.84, s: 30 }, { em: '🪁', x: 0.70, y: 0.24, s: 32 },
        { em: '🛴', x: 0.20, y: 0.62, s: 34 }, { em: '🌳', x: 0.84, y: 0.58, s: 52 },
        { em: '🏠', x: 0.50, y: 0.42, s: 54 }, { em: '🐕', x: 0.66, y: 0.84, s: 30 },
        { em: '🎈', x: 0.14, y: 0.30, s: 26 }, { em: '🍦', x: 0.86, y: 0.82, s: 26 },
        { em: '🚲', x: 0.40, y: 0.64, s: 32 }
      ]
    }
  ];

  var dfStage = 0, dfDiffs = [], dfFound = 0, dfTotal = 3, dfHints = 0,
    dfTid = null, dfEl = 0, dfScene = null, dfW = 0, dfH = 0, dfDone = false;

  function dfClear() { clearInterval(dfTid); dfTid = null; }

  function buildStageRow() {
    var row = $id('df-stages');
    if (!row) return;
    row.innerHTML = '';
    DIFF_STAGES.forEach(function (st, i) {
      var b = document.createElement('button');
      b.className = 'diff-stage-btn' + (i === dfStage ? ' active' : '');
      b.textContent = st.name;
      b.onclick = function () { dfStage = i; newScene(); };
      row.appendChild(b);
    });
  }

  function newScene() {
    buildStageRow();
    dfClear();
    dfDone = false;
    dfScene = DIFF_STAGES[dfStage];
    dfTotal = 3;
    dfHints = 0;
    dfEl = 0;
    setText('df-tm', '0');
    setText('df-hints', '0');
    dfTid = setInterval(function () { dfEl++; setText('df-tm', String(dfEl)); }, 1000);

    var vw = Math.min(window.innerWidth, 440);
    dfW = Math.floor((vw - 32 - 10) / 2);
    dfH = Math.floor(Math.min(dfW * 1.5, window.innerHeight * 0.5));
    var lc = $id('df-left'), rc = $id('df-right');
    lc.width = dfW; lc.height = dfH;
    rc.width = dfW; rc.height = dfH;

    var idx = [];
    for (var i = 0; i < dfScene.items.length; i++) idx.push(i);
    idx = Util.shuffle(idx).slice(0, dfTotal);
    dfDiffs = idx.map(function (k) {
      var kind = Math.random();
      return {
        idx: k,
        type: kind < 0.45 ? 'hide' : kind < 0.8 ? 'size' : 'shift',
        x: dfScene.items[k].x,
        y: dfScene.items[k].y,
        found: false
      };
    });

    dfFound = 0;
    setText('df-found', '0');
    setText('df-total', String(dfTotal));
    setText('df-guide', '👆 오른쪽 그림에서 다른 곳을 탭!');
    var dots = $id('df-found-dots');
    dots.innerHTML = '';
    for (var j = 0; j < dfTotal; j++) {
      var d = document.createElement('div');
      d.className = 'diff-found-dot';
      d.id = 'df-dot-' + j;
      dots.appendChild(d);
    }
    $id('df-dots-layer').innerHTML = '';

    drawScene(lc, 'left');
    drawScene(rc, 'right');
    rc.onclick = function (e) { dfTap(e, rc); };
  }

  function drawScene(canvas, side) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, dfScene.bg1);
    g.addColorStop(1, dfScene.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // 바닥
    ctx.fillStyle = dfScene.ground;
    ctx.beginPath();
    ctx.ellipse(w / 2, h + h * 0.05, w * 0.8, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    dfScene.items.forEach(function (item, i) {
      var size = item.s;
      var visible = true;
      var ox = 0, oy = 0;
      if (side === 'right') {
        for (var k = 0; k < dfDiffs.length; k++) {
          var d = dfDiffs[k];
          if (d.idx !== i) continue;
          if (d.type === 'hide') visible = false;
          else if (d.type === 'size') size = Math.round(size * 0.55);
          else { ox = w * 0.06; oy = h * 0.04; }
        }
      }
      if (!visible) return;
      ctx.font = size + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.em, item.x * w + ox, item.y * h + oy);
    });
  }

  function dfTap(e, canvas) {
    if (dfDone) return;
    var rect = canvas.getBoundingClientRect();
    var sx = (e.clientX - rect.left) / rect.width;
    var sy = (e.clientY - rect.top) / rect.height;
    var hit = null, minD = 999;
    dfDiffs.forEach(function (d, i) {
      if (d.found) return;
      var dx = d.x - sx, dy = d.y - sy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.16 && dist < minD) { minD = dist; hit = { d: d, i: i }; }
    });
    if (hit) {
      hit.d.found = true;
      dfFound++;
      setText('df-found', String(dfFound));
      var dot = $id('df-dot-' + (dfFound - 1));
      if (dot) dot.classList.add('found');
      Util.beep('ok');
      var layer = $id('df-dots-layer');
      var mark = document.createElement('div');
      mark.className = 'diff-dot';
      mark.style.width = '30px'; mark.style.height = '30px';
      mark.style.left = 'calc(' + (hit.d.x * 100) + '% - 15px)';
      mark.style.top = 'calc(' + (hit.d.y * 100) + '% - 15px)';
      mark.style.borderColor = '#FFD93D';
      mark.style.background = 'rgba(255,217,61,.25)';
      layer.appendChild(mark);
      if (dfFound >= dfTotal) diffWin();
      else setText('df-guide', '👍 찾았어요! ' + (dfTotal - dfFound) + '개 남았어요!');
    } else {
      Util.beep('ng');
      setText('df-guide', '❌ 여기가 아니에요. 다시 찾아볼까요?');
      var panels = $id('df-panels');
      panels.classList.remove('shake');
      void panels.offsetWidth;
      panels.classList.add('shake');
      setTimeout(function () {
        if (!dfDone) setText('df-guide', '👆 오른쪽 그림에서 다른 곳을 탭!');
      }, 800);
    }
  }

  function diffWin() {
    dfDone = true;
    dfClear();
    setText('df-guide', '🎉 모두 찾았어요! ' + dfEl + '초!');
    App.SD.diffDone = (App.SD.diffDone || 0) + 1;
    App.writeSave();
    App.checkAch();
    Util.doConfetti();
    Util.beep('win');
    setTimeout(function () {
      App.earnReward('🔍', dfScene.name + ' 완료! ' + dfEl + '초 매의 눈! 👁️');
    }, 400);
  }

  function diffHint() {
    if (dfDone) return;
    var rest = dfDiffs.filter(function (d) { return !d.found; });
    if (!rest.length) return;
    var h = rest[Math.floor(Math.random() * rest.length)];
    dfHints++;
    setText('df-hints', String(dfHints));
    var layer = $id('df-dots-layer');
    var ring = document.createElement('div');
    ring.className = 'diff-ring';
    ring.style.width = '46px'; ring.style.height = '46px';
    ring.style.left = 'calc(' + (h.x * 100) + '% - 23px)';
    ring.style.top = 'calc(' + (h.y * 100) + '% - 23px)';
    layer.appendChild(ring);
    setTimeout(function () { ring.remove(); }, 2000);
  }

  /* ══════════════════ 🌀 미로 탈출 ══════════════════ */

  var MZ_SIZES = [9, 13, 17];
  var mzLevel = 0, mzSize = 9, mzGrid = [], mzCv = null, mzCtx = null, mzCell = 0,
    mzPlayer = { x: 1.5, y: 1.5 }, mzGoal = { x: 1, y: 1 }, mzTid = null, mzEl = 0,
    mzDone = false, mzTarget = null, mzRaf = null, mzTrail = [], mzLastCell = '';

  function mzClear() {
    clearInterval(mzTid); mzTid = null;
    if (mzRaf) { cancelAnimationFrame(mzRaf); mzRaf = null; }
  }

  function mzStartScreen() {
    $id('maze-start-screen').style.display = 'flex';
    $id('maze-game').style.display = 'none';
    mzClear();
  }

  function mazeBegin(level) {
    mzLevel = level;
    mzSize = MZ_SIZES[level];
    $id('maze-start-screen').style.display = 'none';
    $id('maze-game').style.display = 'flex';
    newMaze();
  }

  function newMaze() {
    mzClear();
    mzDone = false;
    mzTrail = [];
    mzLastCell = '';
    mzTarget = null;
    setText('maze-msg', '');
    setText('maze-size-badge', mzSize + '×' + mzSize);
    var best = App.SD['mazeBest_' + mzSize];
    setText('maze-best', best ? best + '초' : '-');

    mzCv = $id('maze-canvas');
    mzCtx = mzCv.getContext('2d');
    var vw = Math.min(window.innerWidth, 420);
    mzCell = Math.floor((vw - 26) / mzSize);
    mzCv.width = mzCell * mzSize;
    mzCv.height = mzCell * mzSize;

    generateMaze();
    mzPlayer = { x: 1.5, y: 1.5 };
    mzGoal = { x: mzSize - 1.5, y: mzSize - 1.5 };
    markTrail();

    mzEl = 0;
    setText('maze-tm', '0');
    mzTid = setInterval(function () { mzEl++; setText('maze-tm', String(mzEl)); }, 1000);
    drawMaze();
    bindMazeInput();
    loopMaze();
  }

  function generateMaze() {
    mzGrid = [];
    for (var y = 0; y < mzSize; y++) {
      var row = [];
      for (var x = 0; x < mzSize; x++) row.push(0);
      mzGrid.push(row);
    }
    var dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    function carve(x, y) {
      mzGrid[y][x] = 1;
      var order = Util.shuffle(dirs);
      for (var i = 0; i < order.length; i++) {
        var nx = x + order[i][0], ny = y + order[i][1];
        if (nx > 0 && nx < mzSize - 1 && ny > 0 && ny < mzSize - 1 && mzGrid[ny][nx] === 0) {
          mzGrid[y + order[i][1] / 2][x + order[i][0] / 2] = 1;
          carve(nx, ny);
        }
      }
    }
    carve(1, 1);
    mzGrid[mzSize - 2][mzSize - 2] = 1;
    mzGrid[mzSize - 3][mzSize - 2] = 1;
  }

  function openCell(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= mzSize || cy >= mzSize) return false;
    return mzGrid[cy][cx] === 1;
  }

  function canStand(px, py) {
    var r = 0.30;
    var cells = [[px - r, py - r], [px + r, py - r], [px - r, py + r], [px + r, py + r]];
    for (var i = 0; i < cells.length; i++) {
      var cx = Math.floor(cells[i][0]);
      var cy = Math.floor(cells[i][1]);
      if (!openCell(cx, cy)) return false;
    }
    return true;
  }

  function drawMaze() {
    if (!mzCtx) return;
    var s = mzCell;
    mzCtx.clearRect(0, 0, mzCv.width, mzCv.height);
    for (var y = 0; y < mzSize; y++) {
      for (var x = 0; x < mzSize; x++) {
        if (mzGrid[y][x] === 1) {
          mzCtx.fillStyle = '#e9fbe9';
          mzCtx.fillRect(x * s, y * s, s, s);
        } else {
          mzCtx.fillStyle = '#1b4332';
          mzCtx.fillRect(x * s, y * s, s, s);
        }
      }
    }
    // 발자국
    mzCtx.fillStyle = 'rgba(120,200,140,.55)';
    mzTrail.forEach(function (c) {
      mzCtx.beginPath();
      mzCtx.arc(c.x * s + s / 2, c.y * s + s / 2, Math.max(1.6, s * 0.09), 0, Math.PI * 2);
      mzCtx.fill();
    });
    // 도착
    var gx = mzGoal.x - 0.5, gy = mzGoal.y - 0.5;
    mzCtx.fillStyle = '#FFF59D';
    mzCtx.fillRect(gx * s + 1, gy * s + 1, s - 2, s - 2);
    mzCtx.font = (s * 0.8) + 'px serif';
    mzCtx.textAlign = 'center';
    mzCtx.textBaseline = 'middle';
    mzCtx.fillText('🏠', mzGoal.x * s, mzGoal.y * s);
    // 플레이어
    mzCtx.font = (s * 0.86) + 'px serif';
    mzCtx.fillText('🐱', mzPlayer.x * s, mzPlayer.y * s);
  }

  function markTrail() {
    var key = Math.floor(mzPlayer.x) + ',' + Math.floor(mzPlayer.y);
    if (key === mzLastCell) return;
    mzLastCell = key;
    mzTrail.push({ x: Math.floor(mzPlayer.x), y: Math.floor(mzPlayer.y) });
    if (mzTrail.length > 400) mzTrail.shift();
  }

  function loopMaze() {
    if (!mzCtx) return;
    if (!mzDone && mzTarget) {
      var dx = mzTarget.x - mzPlayer.x;
      var dy = mzTarget.y - mzPlayer.y;
      var dist = Math.hypot(dx, dy);
      if (dist > 0.04) {
        var step = Math.min(0.16, dist);
        var ux = dx / dist * step;
        var uy = dy / dist * step;
        // 벽에 닿으면 축별로 나눠서 미끄러진다
        if (canStand(mzPlayer.x + ux, mzPlayer.y)) mzPlayer.x += ux;
        if (canStand(mzPlayer.x, mzPlayer.y + uy)) mzPlayer.y += uy;
        markTrail();
        drawMaze();
        checkGoal();
      }
    }
    mzRaf = requestAnimationFrame(loopMaze);
  }

  function checkGoal() {
    if (mzDone) return;
    if (Math.hypot(mzPlayer.x - mzGoal.x, mzPlayer.y - mzGoal.y) < 0.55) mazeWin();
  }

  function mazeWin() {
    mzDone = true;
    mzTarget = null;
    mzClear();
    var key = 'mazeBest_' + mzSize;
    if (!App.SD[key] || mzEl < App.SD[key]) App.SD[key] = mzEl;
    App.SD.mazeDone = (App.SD.mazeDone || 0) + 1;
    App.writeSave();
    App.checkAch();
    setText('maze-best', App.SD[key] + '초');
    setText('maze-msg', '🎉 탈출 성공! ' + mzEl + '초!');
    Util.doConfetti();
    Util.beep('win');
    drawMaze();
    setTimeout(function () {
      App.earnReward('🌀', '미로 탈출 성공! ' + mzEl + '초! 🏆');
    }, 500);
  }

  function canvasPoint(e, cv) {
    var r = cv.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX);
    var cy = (e.touches ? e.touches[0].clientY : e.clientY);
    return { x: (cx - r.left) / r.width * mzSize, y: (cy - r.top) / r.height * mzSize };
  }

  function bindMazeInput() {
    if (!mzCv) return;
    var move = function (e) {
      if (mzDone) return;
      e.preventDefault();
      mzTarget = canvasPoint(e, mzCv);
    };
    mzCv.ontouchstart = move;
    mzCv.ontouchmove = move;
    mzCv.ontouchend = function () { mzTarget = null; };
    mzCv.onmousedown = function (e) { mzTarget = canvasPoint(e, mzCv); };
    mzCv.onmousemove = function (e) { if (e.buttons) mzTarget = canvasPoint(e, mzCv); };
    mzCv.onmouseup = function () { mzTarget = null; };
    mzCv.onmouseleave = function () { mzTarget = null; };
  }

  document.addEventListener('keydown', function (e) {
    var scr = $id('maze');
    if (!scr || !scr.classList.contains('active') || mzDone) return;
    var step = 1;
    var d = null;
    if (e.key === 'ArrowUp') d = [0, -step];
    else if (e.key === 'ArrowDown') d = [0, step];
    else if (e.key === 'ArrowLeft') d = [-step, 0];
    else if (e.key === 'ArrowRight') d = [step, 0];
    if (!d) return;
    e.preventDefault();
    var nx = Math.floor(mzPlayer.x) + d[0] + 0.5;
    var ny = Math.floor(mzPlayer.y) + d[1] + 0.5;
    if (canStand(nx, ny)) { mzPlayer.x = nx; mzPlayer.y = ny; markTrail(); drawMaze(); checkGoal(); }
  });

  /* ══════════════════ 열기 ══════════════════ */

  function openMemory() {
    App.show('memory');
    memDiffSel();
  }
  function openBalloon() {
    App.show('balloon');
    balloonInit();
  }
  function openDiff() {
    App.show('diff-game');
    newScene();
  }
  function openMaze() {
    App.show('maze');
    mzStartScreen();
  }

  window.Memory = {
    begin: memBegin, beginCur: memBeginCur, diffSel: memDiffSel,
    // 자체 점검용(화면에는 영향 없음)
    _qa: function () { return { pairs: memPairs, matched: memMatched, tries: memTries, cards: memCards.length, theme: memTheme, diff: memDiff }; }
  };
  window.Balloon = {
    begin: balloonBegin, stop: balloonStop,
    _qa: function () { return { score: balSc, miss: balMiss, combo: balCombo, left: balTimeLeft, live: balBubbles.length }; }
  };
  window.DiffGame = {
    newScene: newScene, hint: diffHint,
    _qa: function () { return { scene: dfScene ? dfScene.name : '', diffs: dfDiffs.map(function (d) { return { x: d.x, y: d.y, type: d.type, found: d.found }; }), found: dfFound, total: dfTotal, hints: dfHints, stage: dfStage }; }
  };
  window.Maze = {
    begin: mazeBegin, newMaze: newMaze, diffSel: mzStartScreen,
    leave: function () { mzClear(); mzTarget = null; },
    _qa: function () { return { size: mzSize, player: { x: mzPlayer.x, y: mzPlayer.y }, goal: { x: mzGoal.x, y: mzGoal.y }, done: mzDone, cell: mzCell, trail: mzTrail.length }; },
    // 자체 점검용: 손가락 위치(칸 좌표)를 지정해 미끄러짐 이동을 확인한다
    _grid: function () { return mzGrid; },
    _drag: function (x, y) { mzTarget = { x: x, y: y }; },
    _release: function () { mzTarget = null; }
  };

  App.openMemory = openMemory;
  App.openBalloon = openBalloon;
  App.openDiff = openDiff;
  App.openMaze = openMaze;

  App.onLeave.push(memClear);
  App.onLeave.push(balloonStop);
  App.onLeave.push(dfClear);
  App.onLeave.push(function () { mzClear(); mzTarget = null; });
})();
