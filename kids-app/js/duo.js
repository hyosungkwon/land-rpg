/* kids-app/js/duo.js — 🤝 둘이 같이하기 (4단계: 아빠랑 2인 같이하기 모드)
   폰 하나로 유아(1P · 분홍)와 아빠(2P · 파랑)가 함께 노는 3가지 놀이.
     ① 🃏 기억력 턴제 대결 — 번갈아 카드를 뒤집어 짝 맞추기, 맞추면 한 번 더!
     ② ⚡ 마주 보고 덧셈 대결 — 위쪽(아빠)은 180도 돌려 놓은 스플릿 화면, 먼저 정답!
     ③ 🎨 둘이 이어 그리기 — 10초(또는 5획)씩 릴레이로 이어 그려 🖼️ 전시관에 저장
   승패로 기분 상하지 않게 결과는 늘 둘 다 칭찬하고, 끝나면 App.earnReward 로 스티커·경험치를 준다.
   저장: kidsapp4 에 duoMem·duoAdd·duoDraw 세 숫자만 더한다 → 예전 세이브(1~3단계)와 그대로 호환. */
(function () {
  'use strict';

  var App = window.App, SD = App.SD, U = window.Util;
  var $ = function (id) { return document.getElementById(id); };
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }
  function show(id, d) { var e = $(id); if (e) e.style.display = d; }

  var NAMES = ['유아', '아빠'];
  var TAGS = ['1P', '2P'];
  var COLORS = ['#FF6B9D', '#42A5F5'];        /* 1P 분홍 · 2P 파랑 */
  var SIDE_ID = ['b', 't'];                   /* 0=아래(유아) · 1=위(아빠) */

  ['duoMem', 'duoAdd', 'duoDraw'].forEach(function (k) { if (typeof SD[k] !== 'number') SD[k] = 0; });

  function duoTotal() { return (SD.duoMem || 0) + (SD.duoAdd || 0) + (SD.duoDraw || 0); }

  /* ══════════════════ 🤝 허브 ══════════════════ */

  function renderHub() {
    setText('duo-count', '지금까지 같이 놀기 ' + duoTotal() + '판 · 🃏 ' + (SD.duoMem || 0) +
      ' · ⚡ ' + (SD.duoAdd || 0) + ' · 🎨 ' + (SD.duoDraw || 0));
  }

  function openHub() {
    App.show('duo');
    renderHub();
  }

  function stopAll() {
    stopDA();
    ddStopTimer();
    DM.lock = false;
  }

  function toHub() { stopAll(); openHub(); }
  function backHome() { stopAll(); App.home(); }

  /* ══════════════════ ① 🃏 기억력 턴제 대결 ══════════════════ */

  var DM_THEMES = [
    { id: 'animal', name: '동물', list: ['🐱', '🐶', '🐸', '🦊', '🐼', '🦁', '🐮', '🐧'] },
    { id: 'fruit', name: '과일', list: ['🍎', '🍌', '🍇', '🍓', '🍊', '🍉', '🍋', '🍑'] },
    { id: 'car', name: '탈것', list: ['🚗', '🚌', '🚂', '✈️', '🚢', '🚲', '🚀', '🚁'] }
  ];
  var DM_COLS = 4, DM_PAIRS = 6;

  var DM = {
    cards: [], open: [], lock: false, turn: 0, score: [0, 0],
    pairs: DM_PAIRS, matched: 0, theme: 0, started: false, done: false
  };

  function dmIntro() {
    DM.started = false;
    DM.done = false;
    show('dm-intro', 'flex');
    show('dm-game', 'none');
    show('dm-result', 'none');
    dmThemes();
  }

  function dmThemes() {
    var box = $('dm-themes');
    if (!box) return;
    box.innerHTML = '';
    DM_THEMES.forEach(function (t, i) {
      var b = document.createElement('button');
      b.className = 'gbtn ' + (i === DM.theme ? 'gp' : 'gb');
      b.style.padding = '7px 15px';
      b.style.fontSize = '.82rem';
      b.textContent = (i === DM.theme ? '✅ ' : '') + t.name;
      b.onclick = function () { DM.theme = i; dmThemes(); };
      box.appendChild(b);
    });
  }

  function dmStart() {
    DM.pairs = DM_PAIRS;
    DM.matched = 0;
    DM.score = [0, 0];
    DM.open = [];
    DM.turn = 0;
    DM.lock = false;
    DM.done = false;
    DM.started = true;

    var pool = U.shuffle(DM_THEMES[DM.theme].list).slice(0, DM.pairs);
    DM.cards = U.shuffle(pool.concat(pool));

    show('dm-intro', 'none');
    show('dm-result', 'none');
    show('dm-game', 'flex');
    dmBuild();
    dmScores();
    dmStatus(NAMES[0] + '부터 시작! 카드를 두 장 뒤집어요 🃏');
  }

  function dmBuild() {
    var grid = $('dm-grid');
    if (!grid) return;
    var cols = DM_COLS, gap = 8;
    var vw = Math.min(window.innerWidth || 390, 440);
    var sz = Math.floor((vw - 26 - (cols - 1) * gap) / cols);
    sz = Math.max(52, Math.min(sz, 86));
    grid.style.gridTemplateColumns = 'repeat(' + cols + ',' + sz + 'px)';
    grid.style.gap = gap + 'px';
    grid.innerHTML = '';
    DM.cards.forEach(function (em, i) {
      var c = document.createElement('div');
      c.className = 'mem-card dm-card';
      c.dataset.i = String(i);
      c.style.width = sz + 'px';
      c.style.height = sz + 'px';
      c.innerHTML = '<div class="mem-inner"><div class="mem-face mem-back">?</div>' +
        '<div class="mem-face mem-front" style="font-size:' + Math.round(sz * 0.5) + 'px">' + em + '</div></div>';
      c.onclick = function () { dmFlip(i); };
      grid.appendChild(c);
    });
  }

  function dmCardEl(i) { return document.querySelector('#dm-grid .mem-card[data-i="' + i + '"]'); }

  function dmFlip(i) {
    if (!DM.started || DM.done || DM.lock) return;
    var card = dmCardEl(i);
    if (!card || card.classList.contains('matched') || DM.open.indexOf(i) >= 0) return;
    card.classList.add('flipped');
    DM.open.push(i);
    U.beep('ok');
    if (DM.open.length < 2) {
      dmStatus(NAMES[DM.turn] + ' 차례 · 한 장 더! 🃏');
      return;
    }
    var a = DM.open[0], b = DM.open[1];
    if (DM.cards[a] === DM.cards[b]) {
      DM.matched++;
      DM.score[DM.turn]++;
      DM.open = [];
      var ca = dmCardEl(a), cb = dmCardEl(b);
      if (ca) ca.classList.add('matched');
      if (cb) cb.classList.add('matched');
      U.beep('combo');
      dmScores();
      dmStatus('짝! ' + NAMES[DM.turn] + ' +1점 · 한 번 더! 🎉', 'good');
      if (DM.matched >= DM.pairs) dmFinish();
      return;
    }
    DM.lock = true;
    var wa = dmCardEl(a), wb = dmCardEl(b);
    setTimeout(function () {
      if (wa) wa.classList.remove('flipped');
      if (wb) wb.classList.remove('flipped');
      DM.open = [];
      DM.lock = false;
      DM.turn = 1 - DM.turn;
      dmScores();
      dmStatus('아쉬워요! 이제 ' + NAMES[DM.turn] + ' 차례 👐');
    }, 1000);
  }

  function dmScores() {
    setText('dm-sc-0', String(DM.score[0]));
    setText('dm-sc-1', String(DM.score[1]));
    var p0 = $('dm-p0'), p1 = $('dm-p1');
    if (p0) p0.classList.toggle('active', DM.started && !DM.done && DM.turn === 0);
    if (p1) p1.classList.toggle('active', DM.started && !DM.done && DM.turn === 1);
  }

  function dmStatus(msg, kind) {
    var e = $('dm-status');
    if (!e) return;
    e.textContent = msg;
    e.className = 'dm-status' + (kind ? ' ' + kind : '');
  }

  function dmFinish() {
    DM.done = true;
    DM.started = false;
    DM.lock = false;
    SD.duoMem = (SD.duoMem || 0) + 1;
    App.writeSave();
    if (window.Mission) window.Mission.add('memory');

    var s = DM.score;
    var em, title, sub;
    if (s[0] === s[1]) {
      em = '🤝'; title = '무승부! 둘이 똑같아요';
      sub = '둘 다 똑같이 잘했어요! 오늘은 진짜 짝꿍이네요 ✨';
    } else if (s[0] > s[1]) {
      em = '🎉'; title = '유아 승리!';
      sub = '유아는 기억력이 반짝반짝! · 아빠도 끝까지 같이해 줘서 고마워요 💙';
    } else {
      em = '🎉'; title = '아빠 승리!';
      sub = '아빠는 기억력 왕! · 유아도 끝까지 최선을 다했어요 💗';
    }
    setText('dm-r-em', em);
    setText('dm-r-title', title);
    setText('dm-r-score', '유아 ' + s[0] + ' : ' + s[1] + ' 아빠');
    setText('dm-r-sub', sub);
    show('dm-game', 'none');
    show('dm-result', 'flex');
    dmScores();
    renderHub();
    U.doConfetti();
    U.beep('win');
    setTimeout(function () {
      App.earnReward('🤝', '같이 기억력 대결! 유아 ' + s[0] + ' : ' + s[1] + ' 아빠 · 둘 다 최고!');
    }, 420);
  }

  /* ══════════════════ ② ⚡ 마주 보고 덧셈 대결 ══════════════════ */

  var DA_HANDICAP = 600;   /* 아빠가 문제를 보고 0.6초 참는 핸디캡(유아도 이길 수 있게) */
  var DA_LIMIT = 8000;     /* 한 문제 제한 시간 */

  var DA = {
    total: 5, round: 0, a: 0, b: 0, ans: 0, order: [[], []], score: [0, 0],
    locked: [false, false], roundDone: false, started: false, done: false,
    tid: null, left: 0
  };

  function daIntro() {
    stopDA();
    DA.started = false;
    DA.done = false;
    show('da-intro', 'flex');
    show('da-game', 'none');
    show('da-result', 'none');
  }

  function daStart(total) {
    stopDA();
    DA.total = (total === 7) ? 7 : 5;
    DA.round = 0;
    DA.score = [0, 0];
    DA.locked = [false, false];
    DA.roundDone = false;
    DA.done = false;
    DA.started = true;
    show('da-intro', 'none');
    show('da-result', 'none');
    show('da-game', 'flex');
    daScores();
    daNext();
  }

  function daScores() {
    setText('da-sc-b', String(DA.score[0]));
    setText('da-sc-t', String(DA.score[1]));
    setText('da-mid-0', String(DA.score[0]));
    setText('da-mid-1', String(DA.score[1]));
  }

  function daFb(side, msg, kind) {
    var e = $('da-fb-' + SIDE_ID[side]);
    if (!e) return;
    e.textContent = msg || '';
    e.className = 'da-fb' + (kind ? ' ' + kind : '');
  }

  function daLockSide(side, on) {
    DA.locked[side] = !!on;
    var box = $('da-ch-' + SIDE_ID[side]);
    if (box) box.classList.toggle('wait', !!on);
  }

  function daRenderChoices(side) {
    var box = $('da-ch-' + SIDE_ID[side]);
    if (!box) return;
    box.innerHTML = '';
    DA.order[side].forEach(function (v) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'da-choice';
      btn.textContent = String(v);
      btn.onclick = function () { daAnswer(side, v, btn); };
      box.appendChild(btn);
    });
  }

  function daNext() {
    if (!DA.started) return;
    if (DA.round >= DA.total) { daFinish(); return; }
    DA.round++;
    DA.roundDone = false;
    setText('da-round', '문제 ' + DA.round + ' / ' + DA.total);

    var hard = DA.total >= 7;
    var cap = hard ? 13 : 10;                 /* 5문제: 합 10 이하(받아올림 없음) · 7문제: 합 13 이하 */
    DA.a = 1 + U.randInt(hard ? 8 : 5);
    DA.b = 1 + U.randInt(Math.max(1, cap - DA.a));
    DA.ans = DA.a + DA.b;

    var wrongs = [], guard = 0;
    while (wrongs.length < 3 && guard++ < 90) {
      var d = DA.ans + (U.randInt(7) - 3);
      if (d !== DA.ans && d >= 0 && wrongs.indexOf(d) < 0) wrongs.push(d);
    }
    DA.order = [U.shuffle([DA.ans].concat(wrongs)), U.shuffle([DA.ans].concat(wrongs))];

    var q = DA.a + ' + ' + DA.b + ' = ?';
    setText('da-q-b', q);
    setText('da-q-t', q);
    daRenderChoices(0);
    daRenderChoices(1);
    daScores();

    daLockSide(0, false);
    daLockSide(1, true);
    daFb(0, '먼저 눌러요! ⚡', '');
    daFb(1, '🙌 아빠는 0.6초만 참아요', '');

    DA.left = DA_LIMIT;
    daPaintTime();

    setTimeout(function () {
      if (DA.roundDone || !DA.started) return;
      daLockSide(1, false);
      daFb(1, '이제 눌러요! ⚡', '');
    }, DA_HANDICAP);

    stopDA();
    DA.tid = setInterval(function () {
      DA.left -= 100;
      daPaintTime();
      if (DA.left <= 0) { stopDA(); daTimeout(); }
    }, 100);
  }

  function daPaintTime() {
    var f = $('da-timefill');
    if (!f) return;
    var pct = Math.max(0, Math.min(100, DA.left / DA_LIMIT * 100));
    f.style.width = pct + '%';
    f.style.background = pct > 50 ? 'linear-gradient(90deg,#FFD93D,#FF9800)'
      : pct > 20 ? 'linear-gradient(90deg,#FF9800,#f44336)'
        : 'linear-gradient(90deg,#f44336,#b71c1c)';
  }

  function daReveal() {
    ['b', 't'].forEach(function (k) {
      var box = $('da-ch-' + k);
      if (!box) return;
      var bs = box.querySelectorAll('.da-choice');
      for (var i = 0; i < bs.length; i++) {
        if (parseInt(bs[i].textContent, 10) === DA.ans) bs[i].classList.add('correct');
      }
    });
  }

  function daAnswer(side, v, btn) {
    if (!DA.started || DA.done || DA.roundDone || DA.locked[side]) return;
    if (v === DA.ans) {
      DA.roundDone = true;
      stopDA();
      DA.score[side]++;
      daLockSide(0, true);
      daLockSide(1, true);
      if (btn) btn.classList.add('correct');
      var other = 1 - side;
      daFb(side, '🎉 정답! +1점', 'good');
      daFb(other, '😮 아차! 다음엔 잡아요', 'bad');
      daScores();
      U.beep('combo');
      if (window.Mission) window.Mission.add('math');
      setTimeout(daNext, 1300);
      return;
    }
    DA.locked[side] = true;
    if (btn) btn.classList.add('wrong');
    var box = $('da-ch-' + SIDE_ID[side]);
    if (box) box.classList.add('wait');
    daFb(side, '괜찮아요! 다시 생각해 봐요', 'bad');
    U.beep('ng');
  }

  function daTimeout() {
    if (DA.roundDone || !DA.started || DA.done) return;
    DA.roundDone = true;
    daLockSide(0, true);
    daLockSide(1, true);
    daReveal();
    daFb(0, '⏰ 아쉬워요! 정답은 ' + DA.ans, 'bad');
    daFb(1, '⏰ 아쉬워요! 정답은 ' + DA.ans, 'bad');
    U.beep('ng');
    setTimeout(daNext, 1500);
  }

  function daFinish() {
    stopDA();
    DA.started = false;
    DA.done = true;
    SD.duoAdd = (SD.duoAdd || 0) + 1;
    App.writeSave();

    var s = DA.score;
    var em, title, sub;
    if (s[0] === s[1]) {
      em = '🤝'; title = '무승부! 둘이 똑같아요';
      sub = '둘 다 똑같이 빨랐어요! 오늘은 진짜 짝꿍이네요 ✨';
    } else if (s[0] > s[1]) {
      em = '🎉'; title = '유아 승리!';
      sub = '유아는 손가락이 번개 같아요! · 아빠는 0.6초 참고도 정확했어요 💙';
    } else {
      em = '🎉'; title = '아빠 승리!';
      sub = '아빠는 0.6초 참고도 빨랐어요! · 유아도 끝까지 씩씩하게 했어요 💗';
    }
    setText('da-r-em', em);
    setText('da-r-title', title);
    setText('da-r-score', '유아 ' + s[0] + ' : ' + s[1] + ' 아빠');
    setText('da-r-sub', sub);
    show('da-game', 'none');
    show('da-result', 'flex');
    renderHub();
    U.doConfetti();
    U.beep('win');
    setTimeout(function () {
      App.earnReward('⚡', '마주 보고 덧셈 대결! 유아 ' + s[0] + ' : ' + s[1] + ' 아빠 · 둘 다 최고!');
    }, 420);
  }

  function stopDA() {
    clearInterval(DA.tid);
    DA.tid = null;
  }

  /* ══════════════════ ③ 🎨 둘이 이어 그리기 ══════════════════ */

  var DD_TOPICS = [
    { em: '🐉', word: '공룡' }, { em: '👨‍👧', word: '우리 가족' }, { em: '🌈', word: '무지개' },
    { em: '🍰', word: '케이크' }, { em: '🚀', word: '로켓' }, { em: '🐙', word: '문어' },
    { em: '🏰', word: '성' }, { em: '🌻', word: '해바라기' }, { em: '🐟', word: '물고기' }
  ];
  var DD_SIZES = [5, 10, 18];
  var DD_TURN_SEC = 10, DD_TURN_STROKES = 5;
  var DRAW_KEY = 'yua-draw-gallery-v1';   /* 그림 놀이·전시관과 같은 앨범 */

  var DD = {
    topic: 0, turn: 0, mode: 'time', strokes: [], cur: null, drawing: false,
    left: DD_TURN_SEC, tid: null, strokesTurn: 0, waiting: false, saved: false,
    size: 1, started: false, w: 0, h: 0, dpr: 1, ctx: null, clearArm: 0
  };

  function ddIntro() {
    ddStopTimer();
    DD.started = false;
    DD.waiting = false;
    show('dd-intro', 'flex');
    show('dd-game', 'none');
  }

  function ddStart(mode) {
    DD.mode = (mode === 'stroke') ? 'stroke' : 'time';
    DD.turn = 0;
    DD.strokes = [];
    DD.cur = null;
    DD.drawing = false;
    DD.strokesTurn = 0;
    DD.waiting = false;
    DD.saved = false;
    DD.left = DD_TURN_SEC;
    DD.started = true;
    DD.topic = U.randInt(DD_TOPICS.length);
    DD.clearArm = 0;
    var cb = $('dd-clear');
    if (cb) cb.textContent = '🧹 처음부터';
    hideBanner();
    show('dd-intro', 'none');
    show('dd-game', 'flex');
    setText('dd-topic', DD_TOPICS[DD.topic].em + ' ' + DD_TOPICS[DD.topic].word);
    setText('dd-saved', '');
    ddPaintSizes();
    ddBind();
    ddTurnUI();
    updateCount();
    setTimeout(function () {
      ddResize();
      ddRepaint();
      if (DD.mode === 'time') ddStartTimer();
    }, 30);
  }

  function ddBind() {
    var cv = $('dd-canvas');
    if (!cv || cv.dataset.bound) return;
    cv.dataset.bound = '1';
    cv.addEventListener('pointerdown', ddDown);
    cv.addEventListener('pointermove', ddMove);
    cv.addEventListener('pointerup', ddUp);
    cv.addEventListener('pointercancel', ddUp);
    window.addEventListener('pointerup', ddUp);
  }

  function ddResize() {
    var wrap = $('dd-wrap'), cv = $('dd-canvas');
    if (!wrap || !cv) return;
    var r = wrap.getBoundingClientRect();
    DD.w = Math.max(1, Math.floor(r.width));
    DD.h = Math.max(1, Math.floor(r.height));
    DD.dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.floor(DD.w * DD.dpr);
    cv.height = Math.floor(DD.h * DD.dpr);
    DD.ctx = cv.getContext('2d');
  }

  function ddRepaint() {
    var ctx = DD.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, DD.w * DD.dpr, DD.h * DD.dpr);
    ctx.setTransform(DD.dpr, 0, 0, DD.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    DD.strokes.forEach(function (s) {
      if (!s.pts.length) return;
      ctx.strokeStyle = s.c;
      ctx.fillStyle = s.c;
      ctx.lineWidth = s.w;
      if (s.pts.length === 1) {
        ctx.beginPath();
        ctx.arc(s.pts[0].x, s.pts[0].y, s.w / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (var i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
      ctx.stroke();
    });
  }

  function ddPoint(e) {
    var cv = $('dd-canvas');
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function ddDown(e) {
    if (!DD.started || DD.waiting) return;
    e.preventDefault();
    var p = ddPoint(e);
    DD.cur = { c: COLORS[DD.turn], w: DD_SIZES[DD.size], pts: [p] };
    DD.strokes.push(DD.cur);
    DD.drawing = true;
    try { $('dd-canvas').setPointerCapture(e.pointerId); } catch (_) {}
    var ctx = DD.ctx;
    if (ctx && p) {
      ctx.save();
      ctx.setTransform(DD.dpr, 0, 0, DD.dpr, 0, 0);
      ctx.fillStyle = DD.cur.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, DD.cur.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function ddMove(e) {
    if (!DD.drawing || !DD.cur) return;
    e.preventDefault();
    var p = ddPoint(e);
    var pts = DD.cur.pts;
    var last = pts[pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;
    pts.push(p);
    var ctx = DD.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(DD.dpr, 0, 0, DD.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = DD.cur.c;
    ctx.lineWidth = DD.cur.w;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
  }

  function ddUp() {
    if (!DD.drawing) return;
    DD.drawing = false;
    DD.cur = null;
    if (DD.mode === 'stroke') {
      DD.strokesTurn++;
      updateCount();
      if (DD.strokesTurn >= DD_TURN_STROKES) ddEndTurn(DD_TURN_STROKES + '획을 다 그렸어요!');
    }
  }

  function ddStartTimer() {
    ddStopTimer();
    DD.left = DD_TURN_SEC;
    updateCount();
    DD.tid = setInterval(function () {
      DD.left--;
      updateCount();
      if (DD.left <= 0) {
        ddStopTimer();
        ddEndTurn(DD_TURN_SEC + '초가 지났어요!');
      }
    }, 1000);
  }

  function ddStopTimer() {
    clearInterval(DD.tid);
    DD.tid = null;
  }

  function updateCount() {
    if (DD.mode === 'time') setText('dd-count', '⏱ ' + Math.max(0, DD.left));
    else setText('dd-count', '✏️ ' + DD.strokesTurn + '/' + DD_TURN_STROKES);
  }

  function ddTurnUI() {
    var p0 = $('dd-p0'), p1 = $('dd-p1');
    if (p0) p0.classList.toggle('active', DD.turn === 0);
    if (p1) p1.classList.toggle('active', DD.turn === 1);
    setText('dd-hint', NAMES[DD.turn] + '가 ' + (DD.turn === 0 ? '분홍색' : '파란색') + '으로 그려요 · ' +
      (DD.mode === 'time' ? DD_TURN_SEC + '초 안에!' : DD_TURN_STROKES + '획까지!'));
  }

  function ddPaintSizes() {
    var box = $('dd-sizes');
    if (!box) return;
    box.innerHTML = '';
    DD_SIZES.forEach(function (sz, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dd-size' + (i === DD.size ? ' sel' : '');
      var dot = document.createElement('i');
      var d = Math.max(4, Math.min(16, sz));
      dot.style.width = d + 'px';
      dot.style.height = d + 'px';
      b.appendChild(dot);
      b.onclick = function () { DD.size = i; ddPaintSizes(); };
      box.appendChild(b);
    });
  }

  function ddEndTurn(reason) {
    if (!DD.started || DD.waiting) return;
    DD.waiting = true;
    DD.drawing = false;
    DD.cur = null;
    ddStopTimer();
    var next = 1 - DD.turn;
    setText('dd-banner-title', '다음 사람 차례!');
    setText('dd-banner-sub', reason + ' ' + NAMES[next] + '가 ' +
      (next === 0 ? '분홍색' : '파란색') + '으로 이어서 그려요.');
    var b = $('dd-banner');
    if (b) b.classList.add('show');
    U.beep('ok');
  }

  function ddNextTurn() {
    hideBanner();
    DD.turn = 1 - DD.turn;
    DD.strokesTurn = 0;
    DD.waiting = false;
    ddTurnUI();
    if (DD.mode === 'time') ddStartTimer();
    else updateCount();
  }

  function hideBanner() {
    var b = $('dd-banner');
    if (b) b.classList.remove('show');
  }

  function ddTopic() {
    var n = DD.topic;
    var guard = 0;
    while (n === DD.topic && guard++ < 20) n = U.randInt(DD_TOPICS.length);
    DD.topic = n;
    setText('dd-topic', DD_TOPICS[n].em + ' ' + DD_TOPICS[n].word);
    U.beep('ok');
  }

  function ddUndo() {
    if (!DD.strokes.length) return;
    DD.strokes.pop();
    ddRepaint();
    U.beep('ok');
  }

  function ddClear() {
    var btn = $('dd-clear');
    if (!DD.clearArm) {
      DD.clearArm = 1;
      if (btn) btn.textContent = '정말 지울까요?';
      setTimeout(function () {
        DD.clearArm = 0;
        if (btn) btn.textContent = '🧹 처음부터';
      }, 2500);
      return;
    }
    DD.clearArm = 0;
    if (btn) btn.textContent = '🧹 처음부터';
    DD.strokes = [];
    DD.strokesTurn = 0;
    ddRepaint();
    updateCount();
  }

  function saveToGallery(entry) {
    var list = [];
    try {
      var raw = JSON.parse(localStorage.getItem(DRAW_KEY) || '[]');
      if (Array.isArray(raw)) list = raw;
    } catch (e) { list = []; }
    list.unshift(entry);
    list = list.slice(0, 18);
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        localStorage.setItem(DRAW_KEY, JSON.stringify(list));
        return true;
      } catch (e) {
        if (list.length <= 1) return false;
        list = list.slice(0, Math.max(1, list.length - 3));
      }
    }
    return false;
  }

  function ddSave() {
    if (!DD.strokes.length) {
      App.showTip('🖌️', '먼저 둘이 조금 그려 볼까요?');
      return;
    }
    var cv = $('dd-canvas');
    var W = 720;
    var H = Math.max(1, Math.round(W * DD.h / Math.max(1, DD.w)));
    var exp = document.createElement('canvas');
    exp.width = W;
    exp.height = H;
    var g = exp.getContext('2d');
    g.fillStyle = '#fffdf7';
    g.fillRect(0, 0, W, H);
    g.drawImage(cv, 0, 0, W, H);

    var thumb = '';
    try {
      var th = document.createElement('canvas');
      th.width = 340;
      th.height = Math.max(1, Math.round(340 * H / W));
      var tg = th.getContext('2d');
      tg.fillStyle = '#fffdf7';
      tg.fillRect(0, 0, th.width, th.height);
      tg.drawImage(exp, 0, 0, th.width, th.height);
      thumb = th.toDataURL('image/jpeg', 0.82);
    } catch (e) { thumb = ''; }
    if (!thumb) {
      App.showTip('😢', '그림을 담지 못했어요. 잠시 뒤 다시 해 볼까요?');
      return;
    }

    var word = DD_TOPICS[DD.topic].word;
    var ok = saveToGallery({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      emoji: '🤝', word: '같이 그린 ' + word, pct: 0, stars: 0, ts: Date.now(), img: thumb, duo: true
    });
    if (!ok) {
      App.showTip('😢', '저장 공간이 모자라요. 전시관에서 오래된 작품을 지우고 다시 해요.');
      return;
    }
    DD.saved = true;
    SD.duoDraw = (SD.duoDraw || 0) + 1;
    App.writeSave();
    if (window.Exhibit && window.Exhibit.refreshCount) window.Exhibit.refreshCount();
    renderHub();
    setText('dd-saved', '🖼️ 내 작품 전시관에 담았어요! 크게 보기·PNG 저장도 할 수 있어요.');
    U.beep('win');
    setTimeout(function () {
      App.earnReward('🖼️', '둘이 같이 그린 ' + word + '! 전시관에 담았어요 🖼️');
    }, 260);
  }

  /* ══════════════════ 열기 · 전역 API ══════════════════ */

  function openMem() { App.show('duo-mem'); dmIntro(); }
  function openAdd() { App.show('duo-add'); daIntro(); }
  function openDraw() { App.show('duo-draw'); ddIntro(); }

  window.addEventListener('resize', function () {
    var scr = $('duo-draw');
    if (scr && scr.classList.contains('active') && DD.started) {
      ddResize();
      ddRepaint();
    }
  });

  window.Duo = {
    open: openHub,
    toHub: toHub,
    back: backHome,
    leave: stopAll,
    openMem: openMem,
    openAdd: openAdd,
    openDraw: openDraw,
    /* 🃏 기억력 */
    memStart: dmStart,
    memIntro: dmIntro,
    /* ⚡ 덧셈 */
    addStart: daStart,
    addIntro: daIntro,
    /* 🎨 이어 그리기 */
    drawStart: ddStart,
    drawIntro: ddIntro,
    drawTopic: ddTopic,
    drawUndo: ddUndo,
    drawClear: ddClear,
    drawSave: ddSave,
    drawNextTurn: ddNextTurn,
    drawResize: function () { ddResize(); ddRepaint(); },
    /* 자체 점검용(화면에는 영향 없음) */
    _qa: function () {
      var active = document.querySelector('.screen.active');
      return {
        screen: active ? active.id : '',
        mem: {
          started: DM.started, done: DM.done, turn: DM.turn, score: DM.score.slice(),
          matched: DM.matched, pairs: DM.pairs, open: DM.open.slice(), lock: DM.lock,
          cards: DM.cards.slice(), theme: DM.theme
        },
        add: {
          started: DA.started, done: DA.done, round: DA.round, total: DA.total,
          score: DA.score.slice(), ans: DA.ans, roundDone: DA.roundDone,
          locked: DA.locked.slice(), left: DA.left, handicap: DA_HANDICAP
        },
        draw: {
          started: DD.started, turn: DD.turn, mode: DD.mode, strokes: DD.strokes.length,
          strokesTurn: DD.strokesTurn, left: DD.left, waiting: DD.waiting, saved: DD.saved,
          topic: DD_TOPICS[DD.topic].word, size: DD.size, sizePx: DD_SIZES[DD.size],
          canvas: { w: DD.w, h: DD.h }
        },
        save: { duoMem: SD.duoMem, duoAdd: SD.duoAdd, duoDraw: SD.duoDraw, total: duoTotal() }
      };
    },
    _memFlip: dmFlip,
    _addAnswer: daAnswer,
    _drawEndTurn: ddEndTurn,
    /* 자체 점검용: 좌표 목록으로 한 획(손가락 드래그와 같은 ddDown→ddMove→ddUp 경로)을 그린다 */
    _stroke: function (pts) {
      if (!pts || !pts.length) return false;
      var cv = $('dd-canvas');
      if (!cv) return false;
      var r = cv.getBoundingClientRect();
      function ev(p) {
        return { clientX: r.left + p.x, clientY: r.top + p.y, pointerId: 9, preventDefault: function () {} };
      }
      ddDown(ev(pts[0]));
      for (var i = 1; i < pts.length; i++) ddMove(ev(pts[i]));
      ddUp();
      return DD.strokes.length ? DD.strokes[DD.strokes.length - 1].pts.length : 0;
    },
    _topics: DD_TOPICS
  };

  /* 화면을 떠날 때 타이머 정리 */
  App.onLeave.push(stopAll);
})();
