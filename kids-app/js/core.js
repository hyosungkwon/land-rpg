/* kids-app/js/core.js — 세이브·보상·화면 전환·공용 도구
   🌟 유아의 놀이터 (2026-11-26 통합 개선판)
   저장 키 kidsapp4 는 그대로 둔다 → 기존에 모은 스티커·레벨이 그대로 이어진다. */
(function () {
  'use strict';

  var KD = window.KD;
  var CHAR_STAGES = KD.CHAR_STAGES;
  var ALL_STICKERS = KD.ALL_STICKERS;
  var ACHIEVEMENTS = KD.ACHIEVEMENTS;

  var SAVE_KEY = 'kidsapp4';

  var SD = {
    totalStickers: 0, earnedStickers: [], charLv: 1, charExp: 0,
    puzzleDone: 0, mathDone: 0, engDone: 0, drawSaved: 0, memDone: 0,
    clockCorrect: 0, diffDone: 0, pianoPlayed: 0, mazeDone: 0, fishCaught: 0,
    doneAchievements: [], pCleared: {}, pStars: {}, pTotalSc: 0,
    fishCodex: [], fishRodLv: 1, fishRodExp: 0
  };

  function loadSave() {
    try {
      var s = localStorage.getItem(SAVE_KEY);
      if (s) {
        var d = JSON.parse(s);
        if (d && typeof d === 'object') Object.assign(SD, d);
      }
    } catch (e) { /* 저장본이 깨져도 놀이는 계속 */ }
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(SD)); } catch (e) {}
  }

  /* ── 보상 ───────────────────────────────────────── */

  var lupCb = null;

  function stageOf(lv) {
    var i = Math.min(Math.max((lv || 1) - 1, 0), CHAR_STAGES.length - 1);
    return CHAR_STAGES[i];
  }

  function earnReward(emoji, msg) {
    if (!SD.earnedStickers) SD.earnedStickers = [];
    if (SD.earnedStickers.length < ALL_STICKERS.length) {
      SD.earnedStickers.push(SD.earnedStickers.length);
      SD.totalStickers = (SD.totalStickers || 0) + 1;
    }
    var oldLv = SD.charLv || 1;
    SD.charExp = (SD.charExp || 0) + 1;
    var st = stageOf(SD.charLv);
    if (SD.charExp >= st.need && (SD.charLv || 1) < CHAR_STAGES.length) {
      SD.charExp = 0;
      SD.charLv = (SD.charLv || 1) + 1;
    }
    writeSave();
    checkAch();
    updateHomeStatus();
    if ((SD.charLv || 1) > oldLv) showLup(function () { showSp(emoji || '🌟', msg); });
    else showSp(emoji || '🌟', msg);
  }

  function showSp(em, msg) {
    showPop(em, msg, '스티커 획득! 🎉', true);
  }

  // 스티커를 주지 않는 다독임/안내용 팝업
  function showTip(em, msg) {
    showPop(em, msg, '한 번 더 해볼까요?', true);
  }

  function showPop(em, msg, title, confetti) {
    var e = document.getElementById('sp-em');
    var m = document.getElementById('sp-msg');
    var t = document.getElementById('sp-title');
    if (e) e.textContent = em || '🌟';
    if (m) m.textContent = msg || '잘 했어요!';
    if (t) {
      t.textContent = title || '스티커 획득! 🎉';
      t.style.color = title && title.indexOf('스티커') < 0 ? '#42a5f5' : '#FF6B9D';
    }
    var sp = document.getElementById('sp');
    if (sp) sp.classList.add('show');
    if (confetti) doConfetti();
    beep('win');
  }
  function closeSp() {
    var sp = document.getElementById('sp');
    if (sp) sp.classList.remove('show');
  }

  function showLup(cb) {
    var st = stageOf(SD.charLv);
    document.getElementById('lup-char').textContent = st.emoji;
    document.getElementById('lup-name').textContent = st.name;
    document.getElementById('lup-msg').textContent = st.msg;
    lupCb = cb || null;
    document.getElementById('lup').classList.add('show');
    doConfetti();
    beep('win');
  }
  function closeLup() {
    document.getElementById('lup').classList.remove('show');
    if (lupCb) { var cb = lupCb; lupCb = null; setTimeout(cb, 200); }
  }

  function checkAch() {
    if (!SD.doneAchievements) SD.doneAchievements = [];
    ACHIEVEMENTS.forEach(function (a) {
      if (SD.doneAchievements.indexOf(a.id) < 0 && a.check(SD)) {
        SD.doneAchievements.push(a.id);
        writeSave();
      }
    });
  }

  /* ── 홈 화면 상태(캐릭터·꾸미기 반영) ─────────────── */

  function wornItem(cat, id) {
    if (!id) return null;
    var list = KD.DRESS_ITEMS[cat] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function updateHomeStatus() {
    var st = stageOf(SD.charLv);
    var wear = SD.dressWearing || {};

    setText('hc-em', st.emoji);
    setText('hc-lv', 'Lv.' + (SD.charLv || 1));
    setText('hc-nm', st.name);
    setText('hero-char', st.emoji);
    setText('hero-greeting', greeting());
    setText('hero-sub', st.msg);
    setText('stat-stickers', String(SD.totalStickers || 0));
    setText('home-sticker-cnt', (SD.totalStickers || 0) + '개');

    var hat = wornItem('hat', wear.hat);
    var acc = wornItem('acc', wear.acc);
    var bg = wornItem('bg', wear.bg);
    setText('hero-hat', hat ? hat.em : '');
    setText('hero-acc', acc ? acc.em : '');
    setText('hero-bg-em', bg ? bg.em : '');

    var maxS = 1;
    if (SD.pCleared) for (var i = 1; i <= 30; i++) if (SD.pCleared[i]) maxS = i;
    setText('stat-stage', String(maxS));
    setText('stat-fish', String(SD.fishCaught || 0));
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '밤에도 놀고 있네? 🌙';
    if (h < 12) return '좋은 아침이에요! ☀️';
    if (h < 18) return '안녕! 같이 놀자! 🎉';
    return '오늘도 신나게 놀아요! 🌈';
  }

  function setText(id, v) {
    var e = document.getElementById(id);
    if (e) e.textContent = v;
  }

  function rewardInit() {
    var st = stageOf(SD.charLv);
    var pct = Math.min(100, Math.round((SD.charExp || 0) / st.need * 100));
    setText('r-stage-lbl', '성장 단계 ' + (SD.charLv || 1) + ' / ' + CHAR_STAGES.length);
    setText('r-char-big', st.emoji);
    setText('r-char-name', st.name);
    setText('r-char-msg', st.msg);
    var fill = document.getElementById('r-exp-fill');
    if (fill) fill.style.width = pct + '%';
    setText('r-exp-num', (SD.charExp || 0) + '/' + st.need);
    setText('r-lv-badge', 'Lv.' + (SD.charLv || 1));

    var book = document.getElementById('sticker-book');
    if (book) {
      book.innerHTML = '';
      ALL_STICKERS.forEach(function (em, i) {
        var got = (SD.earnedStickers || []).indexOf(i) >= 0;
        var s = document.createElement('div');
        s.className = 'sticker-slot' + (got ? ' earned' : '');
        s.textContent = got ? em : '';
        book.appendChild(s);
      });
    }
    setText('sticker-prog', (SD.totalStickers || 0) + '/' + ALL_STICKERS.length + '개');

    var list = document.getElementById('achieve-list');
    if (list) {
      list.innerHTML = '';
      ACHIEVEMENTS.forEach(function (a) {
        var done = (SD.doneAchievements || []).indexOf(a.id) >= 0;
        var item = document.createElement('div');
        item.className = 'ach-item' + (done ? ' done' : '');
        item.innerHTML = '<div class="ach-icon">' + a.icon + '</div><div class="ach-info"><div class="ach-name">' + a.name + '</div><div class="ach-desc">' + a.desc + '</div></div><div style="font-size:1.2rem;">' + (done ? '✅' : '🔒') + '</div>';
        list.appendChild(item);
      });
    }
  }

  /* ── 화면 전환 ──────────────────────────────────── */

  function show(id) {
    var els = document.querySelectorAll('.screen');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('active');
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }

  function stopAll() {
    App.onLeave.forEach(function (fn) { try { fn(); } catch (e) {} });
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }

  function home() {
    stopAll();
    show('home');
    updateHomeStatus();
  }

  function tab(name) {
    var tabs = document.querySelectorAll('.home-tab');
    var panels = document.querySelectorAll('.home-panel');
    var order = ['game', 'study', 'create', 'myroom'];
    var idx = order.indexOf(name);
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', i === idx);
    for (var j = 0; j < panels.length; j++) panels[j].classList.remove('active');
    var p = document.getElementById('panel-' + name);
    if (p) p.classList.add('active');
  }

  function closeOverlay() {
    var o = document.getElementById('overlay');
    if (o) o.classList.remove('show');
  }

  /* ── 음성(Web Speech API) 안전 래퍼 ──────────────── */

  var ttsOk = ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window);

  function speak(text, lang, opts) {
    if (!ttsOk || !text) return false;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = lang || 'ko-KR';
      u.rate = (opts && opts.rate) || 0.9;
      u.pitch = (opts && opts.pitch) || 1.05;
      var v = pickVoice(u.lang);
      if (v) u.voice = v;
      if (opts && opts.onend) u.onend = opts.onend;
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  function pickVoice(lang) {
    try {
      var vs = window.speechSynthesis.getVoices() || [];
      var want = (lang || 'ko-KR').slice(0, 2).toLowerCase();
      for (var i = 0; i < vs.length; i++) if ((vs[i].lang || '').toLowerCase().indexOf(want) === 0) return vs[i];
    } catch (e) {}
    return null;
  }
  if (ttsOk && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = function () {};
  }

  /* ── 소리·축하·유틸 ─────────────────────────────── */

  var _ac = null;
  function getAC() {
    if (!_ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      _ac = new AC();
    }
    if (_ac.state === 'suspended' && _ac.resume) { try { _ac.resume(); } catch (e) {} }
    return _ac;
  }

  function tone(freq, delay, dur, type, gain) {
    try {
      var ctx = getAC();
      if (!ctx) return;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || 'sine';
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = freq;
      var t0 = ctx.currentTime + (delay || 0);
      g.gain.setValueAtTime(gain || 0.12, t0);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch (e) {}
  }

  function beep(kind) {
    if (kind === 'ok') { tone(660, 0, 0.07); tone(880, 0.08, 0.12); }
    else if (kind === 'ng') { tone(300, 0, 0.1, 'sine', 0.09); tone(220, 0.1, 0.16, 'sine', 0.09); }
    else if (kind === 'combo') { tone(784, 0, 0.07); tone(988, 0.07, 0.07); tone(1175, 0.14, 0.12); }
    else if (kind === 'win') { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.18); }); }
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function randInt(n) { return Math.floor(Math.random() * n); }

  function doConfetti() {
    var cv = document.getElementById('conf');
    if (!cv) return;
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    var ctx = cv.getContext('2d');
    var cols = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94', '#B4D455', '#6C5CE7', '#FD79A8'];
    var dots = [];
    for (var i = 0; i < 100; i++) {
      dots.push({
        x: Math.random() * cv.width, y: -20 - Math.random() * 250,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3,
        r: 4 + Math.random() * 7, color: cols[randInt(cols.length)],
        ang: Math.random() * Math.PI * 2, sp: (Math.random() - 0.5) * 0.15
      });
    }
    var fr = 0;
    (function draw() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      dots.forEach(function (d) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.ang);
        ctx.fillStyle = d.color;
        ctx.fillRect(-d.r / 2, -d.r * 0.4, d.r, d.r * 0.8);
        ctx.restore();
        d.x += d.vx; d.y += d.vy; d.ang += d.sp;
        if (d.y > cv.height + 20) { d.y = -20; d.x = Math.random() * cv.width; }
      });
      fr++;
      if (fr < 200) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  function stars(n) { return '⭐'.repeat(n) + '☆'.repeat(3 - n); }

  /* ── 전역 API ──────────────────────────────────── */

  var App = {
    SD: SD,
    writeSave: writeSave,
    earnReward: earnReward,
    checkAch: checkAch,
    updateHomeStatus: updateHomeStatus,
    showSp: showSp,
    showTip: showTip,
    closeSp: closeSp,
    closeLup: closeLup,
    closeOverlay: closeOverlay,
    show: show,
    home: home,
    tab: tab,
    stopAll: stopAll,
    onLeave: [],
    speak: speak,
    ttsOk: ttsOk,
    stageOf: stageOf
  };

  // 각 게임 모듈이 채워 넣는다.
  App.openReward = function () { show('reward'); rewardInit(); };
  App.openDraw = function () {};
  App.openPuzzle = function () {};
  App.openMemory = function () {};
  App.openBalloon = function () {};
  App.openDiff = function () {};
  App.openMaze = function () {};
  App.openFishing = function () {};
  App.openMath = function () {};
  App.openEnglish = function () {};
  App.openClock = function () {};
  App.openWord = function () {};
  App.openDict = function () {};
  App.openAddq = function () {};
  App.openColoring = function () {};
  App.openPiano = function () {};
  App.openDress = function () {};

  window.App = App;
  window.SD = SD;
  window.Util = {
    shuffle: shuffle, randInt: randInt, beep: beep, tone: tone, getAC: getAC,
    doConfetti: doConfetti, stars: stars, setText: setText, speak: speak
  };

  /* ── 시작 ─────────────────────────────────────── */

  loadSave();
  updateHomeStatus();

  // ?screen=ydraw → 통합 그림 놀이 바로 열기(예전 yua-draw 주소에서 넘어오는 길)
  try {
    var q = new URLSearchParams(location.search);
    var sc = q.get('screen');
    if (sc === 'ydraw') {
      setTimeout(function () { App.openDraw(q.get('mode') === 'free' ? 'free' : 'topic'); }, 60);
    } else if (sc === 'reward') {
      setTimeout(function () { App.openReward(); }, 60);
    }
  } catch (e) {}
})();
