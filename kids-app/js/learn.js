/* kids-app/js/learn.js — 📚 학습 놀이 6종
   🔢 수학 카드 · 🔤 영어 카드 · 🕐 시계 읽기 · 📝 단어 퀴즈 · 🔊 받아쓰기 · ⚡ 빠른 덧셈
   2026-11-26: 음성(TTS) 보강·콤보·정답 효과음 통일·부드러운 오답 격려 */
(function () {
  'use strict';

  var App = window.App;
  var Util = window.Util;
  var KD = window.KD;
  var $id = function (x) { return document.getElementById(x); };
  var setText = function (x, v) { var e = $id(x); if (e) e.textContent = v; };
  var speak = Util.speak;

  /* ══════════════════ 🔢 수학 카드 ══════════════════ */

  var MATH_CATS = KD.MATH_CATS;
  var mKeys = Object.keys(MATH_CATS), mCat = 0, mIdx = 0, mCards = [], mFlip = false;

  function buildMTabs() {
    var el = $id('math-tabs');
    el.innerHTML = '';
    mKeys.forEach(function (k, i) {
      var b = document.createElement('button');
      b.className = 'cat-tab' + (i === 0 ? ' active' : '');
      b.textContent = k;
      b.onclick = function () {
        mCat = i; mIdx = 0; mFlip = false;
        $id('math-card').classList.remove('flipped');
        loadMCat();
        var all = document.querySelectorAll('#math-tabs .cat-tab');
        for (var j = 0; j < all.length; j++) all[j].classList.toggle('active', j === i);
      };
      el.appendChild(b);
    });
  }

  function loadMCat() {
    mCards = MATH_CATS[mKeys[mCat]].slice();
    showMCard();
  }

  function showMCard() {
    var c = mCards[mIdx];
    setText('math-q', c.q);
    setText('math-a', c.a);
    setText('math-counter', (mIdx + 1) + '/' + mCards.length);
    var pr = $id('math-prog');
    if (pr) pr.style.width = ((mIdx + 1) / mCards.length * 100) + '%';
    mFlip = false;
    $id('math-card').classList.remove('flipped');
  }

  function mathInit() {
    mCat = 0; mIdx = 0; mFlip = false;
    buildMTabs();
    loadMCat();
  }
  function mathFlip() {
    mFlip = !mFlip;
    $id('math-card').classList.toggle('flipped', mFlip);
    if (mFlip) Util.beep('ok');
  }
  function mathNext() {
    if (mIdx < mCards.length - 1) { mIdx++; showMCard(); }
    else {
      App.SD.mathDone = (App.SD.mathDone || 0) + 1;
      App.writeSave();
      App.checkAch();
      App.earnReward('🔢', '수학 카드 완주! 정말 똑똑해요! 🧠');
      mIdx = 0;
      showMCard();
    }
  }
  function mathPrev() { if (mIdx > 0) { mIdx--; showMCard(); } }
  function mathShuffle() { mCards = Util.shuffle(MATH_CATS[mKeys[mCat]]); mIdx = 0; showMCard(); }

  /* ══════════════════ 🔤 영어 카드 ══════════════════ */

  var ENG_CATS = KD.ENG_CATS;
  var eKeys = Object.keys(ENG_CATS), eCat = 0, eIdx = 0, eCards = [], eFlip = false;

  function buildETabs() {
    var el = $id('eng-tabs');
    el.innerHTML = '';
    eKeys.forEach(function (k, i) {
      var b = document.createElement('button');
      b.className = 'cat-tab' + (i === 0 ? ' active' : '');
      b.textContent = k;
      b.onclick = function () {
        eCat = i; eIdx = 0; eFlip = false;
        $id('eng-card').classList.remove('flipped');
        loadECat();
        var all = document.querySelectorAll('#eng-tabs .cat-tab');
        for (var j = 0; j < all.length; j++) all[j].classList.toggle('active', j === i);
      };
      el.appendChild(b);
    });
  }

  function loadECat() {
    eCards = ENG_CATS[eKeys[eCat]].slice();
    showECard();
  }

  function showECard() {
    var c = eCards[eIdx];
    setText('eng-emoji', c.emoji);
    setText('eng-word', c.word);
    setText('eng-emoji2', c.emoji);
    setText('eng-ko', c.ko);
    var ex = $id('eng-ex');
    if (ex) ex.innerHTML = c.ex.replace('\n', '<br>');
    setText('eng-counter', (eIdx + 1) + '/' + eCards.length);
    var pr = $id('eng-prog');
    if (pr) pr.style.width = ((eIdx + 1) / eCards.length * 100) + '%';
    eFlip = false;
    $id('eng-card').classList.remove('flipped');
  }

  function engInit() { eCat = 0; eIdx = 0; eFlip = false; buildETabs(); loadECat(); }
  function engFlip() {
    eFlip = !eFlip;
    $id('eng-card').classList.toggle('flipped', eFlip);
    if (eFlip) {
      Util.beep('ok');
      // 뒤집으면 한국어 뜻을 읽어 준다
      var c = eCards[eIdx];
      speak(c.ko, 'ko-KR', { rate: 0.9 });
    }
  }
  function engNext() {
    if (eIdx < eCards.length - 1) { eIdx++; showECard(); }
    else {
      App.SD.engDone = (App.SD.engDone || 0) + 1;
      App.writeSave();
      App.checkAch();
      App.earnReward('🔤', '영어 카드 완주! 훌륭해요! 🌟');
      eIdx = 0;
      showECard();
    }
  }
  function engPrev() { if (eIdx > 0) { eIdx--; showECard(); } }
  function engShuffle() { eCards = Util.shuffle(ENG_CATS[eKeys[eCat]]); eIdx = 0; showECard(); }

  function speakEng() {
    var c = eCards[eIdx];
    var word = c.word.replace(/\s+/g, ' ').trim();
    var ok = speak(word, 'en-US', { rate: 0.8 });
    if (!ok) speak(c.ko, 'ko-KR', { rate: 0.9 });
    Util.beep('ok');
  }

  /* ══════════════════ 🕐 시계 읽기 ══════════════════ */

  var ckQ = 0, ckSc = 0, ckEl = 0, ckTid = null, ckTotal = 10, ckAnswered = false;

  function ckClear() { clearInterval(ckTid); ckTid = null; }

  function clockInit() {
    ckQ = 0; ckSc = 0; ckEl = 0; ckAnswered = false;
    ckClear();
    setText('ck-sc', '0'); setText('ck-tm', '0');
    $id('ck-next-btn').style.display = 'none';
    ckTid = setInterval(function () { ckEl++; setText('ck-tm', String(ckEl)); }, 1000);
    clockMakeQ();
  }

  function clockMakeQ() {
    ckAnswered = false;
    $id('ck-next-btn').style.display = 'none';
    setText('ck-fb', '');
    setText('ck-num', String(ckQ + 1));
    var pr = $id('ck-prog');
    if (pr) pr.style.width = ((ckQ + 1) / ckTotal * 100) + '%';
    var mOpts = [0, 15, 30, 45];
    var m = mOpts[Util.randInt(mOpts.length)];
    var h = Util.randInt(12) + 1;
    drawClock(h, m);
    setText('ck-q', '몇 시 몇 분일까요?');
    speak('몇 시 몇 분일까요?', 'ko-KR', { rate: 0.95, pitch: 1.1 });

    var correct = m === 0 ? h + '시 정각' : h + '시 ' + m + '분';
    var wrongs = {};
    var guard = 0;
    while (Object.keys(wrongs).length < 3 && guard++ < 80) {
      var wh = Util.randInt(12) + 1;
      var wm = mOpts[Util.randInt(mOpts.length)];
      var t = wm === 0 ? wh + '시 정각' : wh + '시 ' + wm + '분';
      if (t !== correct) wrongs[t] = 1;
    }
    var choices = Util.shuffle([correct].concat(Object.keys(wrongs)));
    var el = $id('ck-choices');
    el.innerHTML = '';
    choices.forEach(function (c) {
      var btn = document.createElement('button');
      btn.className = 'clock-choice';
      btn.textContent = c;
      btn.onclick = function () { clockAnswer(c, correct, btn); };
      el.appendChild(btn);
    });
  }

  function drawClock(h, m) {
    var svg = $id('clock-svg');
    var cx = 100, cy = 100, r = 90;
    var out = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fff" stroke="#ddd" stroke-width="3"/>';
    for (var i = 0; i < 60; i++) {
      var a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      var major = i % 5 === 0;
      var r1 = major ? 78 : 84;
      out += '<line x1="' + (cx + Math.cos(a) * r1) + '" y1="' + (cy + Math.sin(a) * r1) + '" x2="' + (cx + Math.cos(a) * 88) + '" y2="' + (cy + Math.sin(a) * 88) + '" stroke="' + (major ? '#888' : '#ccc') + '" stroke-width="' + (major ? 2 : 1) + '"/>';
    }
    for (var n = 1; n <= 12; n++) {
      var an = (n / 12) * Math.PI * 2 - Math.PI / 2;
      out += '<text x="' + (cx + Math.cos(an) * 72) + '" y="' + (cy + Math.sin(an) * 72) + '" text-anchor="middle" dominant-baseline="central" font-size="13" font-family="Jua,sans-serif" fill="#555">' + n + '</text>';
    }
    var ha = ((h % 12 + m / 60) / 12) * Math.PI * 2 - Math.PI / 2;
    var ma = (m / 60) * Math.PI * 2 - Math.PI / 2;
    out += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + Math.cos(ha) * 52) + '" y2="' + (cy + Math.sin(ha) * 52) + '" stroke="#333" stroke-width="6" stroke-linecap="round"/>';
    out += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + Math.cos(ma) * 72) + '" y2="' + (cy + Math.sin(ma) * 72) + '" stroke="#555" stroke-width="4" stroke-linecap="round"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="#333"/>';
    svg.innerHTML = out;
  }

  function clockAnswer(chosen, correct, btn) {
    if (ckAnswered) return;
    ckAnswered = true;
    var all = document.querySelectorAll('.clock-choice');
    for (var i = 0; i < all.length; i++) all[i].onclick = null;
    if (chosen === correct) {
      btn.classList.add('correct');
      setText('ck-fb', '🎉 정답이에요!');
      ckSc += 10;
      setText('ck-sc', String(ckSc));
      App.SD.clockCorrect = (App.SD.clockCorrect || 0) + 1;
      App.writeSave();
      App.checkAch();
      Util.beep('combo');
      speak(correct + '! 정답이에요!', 'ko-KR', { rate: 0.95 });
    } else {
      btn.classList.add('wrong');
      setText('ck-fb', '괜찮아요! 정답은 "' + correct + '"');
      for (var j = 0; j < all.length; j++) if (all[j].textContent === correct) all[j].classList.add('correct');
      Util.beep('ng');
      speak('정답은 ' + correct + ' 예요', 'ko-KR', { rate: 0.92 });
    }
    ckQ++;
    if (ckQ >= ckTotal) {
      ckClear();
      setTimeout(function () {
        App.earnReward('🕐', '시계 퀴즈 완료! ' + ckSc + '점! ⏰');
        ckQ = 0;
      }, 900);
    } else {
      $id('ck-next-btn').style.display = 'inline-block';
    }
  }

  function clockNext() { clockMakeQ(); }
  function clockSpeakQ() { speak('몇 시 몇 분일까요?', 'ko-KR', { rate: 0.95 }); }

  /* ══════════════════ 📝 단어 퀴즈 ══════════════════ */

  var WQ_CATS = KD.WQ_CATS;
  var wqKeys = Object.keys(WQ_CATS), wqCat = 0, wqIdx = 0, wqCards = [], wqSc = 0, wqCombo = 0, wqAnswered = false;

  function buildWqTabs() {
    var el = $id('wq-tabs');
    el.innerHTML = '';
    wqKeys.forEach(function (k, i) {
      var b = document.createElement('button');
      b.className = 'wq-cat-tab' + (i === 0 ? ' active' : '');
      b.textContent = k;
      b.onclick = function () {
        wqCat = i; wqIdx = 0; wqSc = 0; wqCombo = 0; wqAnswered = false;
        loadWqCat();
        var all = document.querySelectorAll('.wq-cat-tab');
        for (var j = 0; j < all.length; j++) all[j].classList.toggle('active', j === i);
      };
      el.appendChild(b);
    });
  }

  function loadWqCat() {
    wqCards = Util.shuffle(WQ_CATS[wqKeys[wqCat]]);
    setText('wq-sc', '0');
    setText('wq-combo', '0');
    showWqCard();
  }

  function showWqCard() {
    wqAnswered = false;
    $id('wq-next').style.display = 'none';
    setText('wq-fb', '');
    var c = wqCards[wqIdx];
    var tot = wqCards.length;
    setText('wq-num', String(wqIdx + 1));
    setText('wq-tot', String(tot));
    var pr = $id('wq-prog');
    if (pr) pr.style.width = ((wqIdx + 1) / tot * 100) + '%';
    setText('wq-emoji', c.em);
    setText('wq-hint', c.hint);
    setText('wq-blank', c.word[0] + ' _ '.repeat(c.word.length - 1).trim());
    var allWords = WQ_CATS[wqKeys[wqCat]].map(function (x) { return x.word; });
    var wrongs = Util.shuffle(allWords.filter(function (w) { return w !== c.word; })).slice(0, 3);
    var choices = Util.shuffle([c.word].concat(wrongs));
    var el = $id('wq-choices');
    el.innerHTML = '';
    choices.forEach(function (ch) {
      var b = document.createElement('button');
      b.className = 'wq-choice';
      b.textContent = ch;
      b.onclick = function () { wqAnswer(ch, c.word, b); };
      el.appendChild(b);
    });
  }

  function wqAnswer(chosen, correct, btn) {
    if (wqAnswered) return;
    wqAnswered = true;
    var all = document.querySelectorAll('.wq-choice');
    for (var i = 0; i < all.length; i++) all[i].onclick = null;
    if (chosen === correct) {
      btn.classList.add('correct');
      wqCombo++;
      wqSc += wqCombo >= 3 ? 15 : 10;
      setText('wq-sc', String(wqSc));
      setText('wq-combo', String(wqCombo));
      setText('wq-fb', wqCombo >= 3 ? '🔥 ' + wqCombo + '연속! 멋져요!' : '🎉 정답!');
      setText('wq-blank', correct);
      Util.beep(wqCombo >= 3 ? 'combo' : 'ok');
      speak(correct, 'ko-KR', { rate: 0.92 });
    } else {
      btn.classList.add('wrong');
      wqCombo = 0;
      setText('wq-combo', '0');
      for (var j = 0; j < all.length; j++) if (all[j].textContent === correct) all[j].classList.add('correct');
      setText('wq-fb', '아쉬워요! 정답은 "' + correct + '"');
      Util.beep('ng');
    }
    wqIdx++;
    if (wqIdx >= wqCards.length) {
      setTimeout(function () {
        App.earnReward('📝', '단어 퀴즈 완료! ' + wqSc + '점! 어휘왕! 📚');
        wqIdx = 0; wqSc = 0; wqCombo = 0;
        loadWqCat();
      }, 900);
    } else {
      $id('wq-next').style.display = 'inline-block';
    }
  }

  function wordNext() { if (wqIdx < wqCards.length) showWqCard(); }

  function wordSpeakHint() {
    var c = wqCards[wqIdx];
    if (!c) return;
    var ok = speak(c.hint, 'ko-KR', { rate: 0.9 });
    if (!ok) setText('wq-fb', '💡 ' + c.hint);
    Util.beep('ok');
  }

  /* ══════════════════ 🔊 받아쓰기 ══════════════════ */

  var DICT_CATS = KD.DICT_CATS;
  var dKeys = Object.keys(DICT_CATS), dCat = 0, dIdx = 0, dCards = [], dSc = 0, dCombo = 0, dAnswered = false;

  function buildDictTabs() {
    var el = $id('dict-tabs');
    el.innerHTML = '';
    dKeys.forEach(function (k, i) {
      var b = document.createElement('button');
      b.className = 'cat-tab' + (i === 0 ? ' active' : '');
      b.textContent = k;
      b.onclick = function () {
        dCat = i; dIdx = 0; dSc = 0; dCombo = 0; dAnswered = false;
        loadDictCat();
        var all = document.querySelectorAll('#dict-tabs .cat-tab');
        for (var j = 0; j < all.length; j++) all[j].classList.toggle('active', j === i);
      };
      el.appendChild(b);
    });
  }

  function loadDictCat() {
    dCards = Util.shuffle(DICT_CATS[dKeys[dCat]]);
    setText('dict-sc', '0');
    setText('dict-combo', '0');
    showDictCard();
  }

  function showDictCard() {
    dAnswered = false;
    $id('dict-next').style.display = 'none';
    setText('dict-fb', '');
    setText('dict-hint', '버튼을 눌러 소리를 들어봐요!');
    var c = dCards[dIdx];
    var tot = dCards.length;
    setText('dict-num', String(dIdx + 1));
    setText('dict-tot', String(tot));
    var pr = $id('dict-prog');
    if (pr) pr.style.width = ((dIdx + 1) / tot * 100) + '%';
    var all = DICT_CATS[dKeys[dCat]];
    var wrongs = Util.shuffle(all.filter(function (w) { return w.word !== c.word; })).slice(0, 3);
    var choices = Util.shuffle([c].concat(wrongs));
    var el = $id('dict-choices');
    el.innerHTML = '';
    choices.forEach(function (ch) {
      var b = document.createElement('button');
      b.className = 'dict-choice';
      b.innerHTML = '<span style="font-size:1.4rem;">' + ch.em + '</span><br>' + ch.word;
      b.onclick = function () { dictAnswer(ch.word, c.word, b); };
      el.appendChild(b);
    });
    setTimeout(function () { dictSpeak(); }, 260);
  }

  function dictSpeak() {
    var c = dCards[dIdx];
    if (!c) return;
    var ok = speak(c.word, 'ko-KR', { rate: 0.85, pitch: 1.05 });
    if (!ok) {
      setText('dict-hint', '⚠️ 이 기기는 소리를 못 내요. 힌트: ' + c.hint);
      return;
    }
    Util.beep('ok');
    setTimeout(function () {
      if (!dAnswered) setText('dict-hint', '💡 힌트: ' + c.hint);
    }, 900);
  }

  function dictAnswer(chosen, correct, btn) {
    if (dAnswered) return;
    dAnswered = true;
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    var all = document.querySelectorAll('.dict-choice');
    for (var i = 0; i < all.length; i++) all[i].onclick = null;
    if (chosen === correct) {
      btn.classList.add('correct');
      dCombo++;
      dSc += dCombo >= 3 ? 15 : 10;
      setText('dict-sc', String(dSc));
      setText('dict-combo', String(dCombo));
      setText('dict-fb', dCombo >= 3 ? '🔥 ' + dCombo + '연속! 귀가 밝아요!' : '🎉 정답!');
      Util.beep(dCombo >= 3 ? 'combo' : 'ok');
      speak(correct, 'ko-KR', { rate: 0.9 });
    } else {
      btn.classList.add('wrong');
      dCombo = 0;
      setText('dict-combo', '0');
      for (var j = 0; j < all.length; j++) if (all[j].textContent.indexOf(correct) >= 0) all[j].classList.add('correct');
      setText('dict-fb', '괜찮아요! 정답은 "' + correct + '"');
      Util.beep('ng');
    }
    dIdx++;
    if (dIdx >= dCards.length) {
      setTimeout(function () {
        App.SD.engDone = (App.SD.engDone || 0) + 1;
        App.writeSave();
        App.checkAch();
        App.earnReward('🔊', '받아쓰기 완료! ' + dSc + '점! 👂');
        dIdx = 0; dSc = 0; dCombo = 0;
        loadDictCat();
      }, 900);
    } else {
      $id('dict-next').style.display = 'inline-block';
    }
  }

  function dictNext() { if (dIdx < dCards.length) showDictCard(); }

  /* ══════════════════ ⚡ 빠른 덧셈 ══════════════════ */

  var addqDiff = 'normal', addqSc = 0, addqCorrect = 0, addqTotal = 10, addqCombo = 0,
    addqLimit = 5000, addqTimer = null, addqStart = 0, addqAnim = null, addqDone = false,
    addqA = 0, addqB = 0, addqOp = '+', addqAns = 0;

  function addqStop() {
    clearTimeout(addqTimer); addqTimer = null;
    if (addqAnim) { cancelAnimationFrame(addqAnim); addqAnim = null; }
  }

  function addqDiffSel() {
    addqStop();
    $id('addq-diff-sel').style.display = 'flex';
    $id('addq-body').style.display = 'none';
  }

  function addqBegin(diff) {
    addqDiff = diff;
    addqSc = 0; addqCorrect = 0; addqCombo = 0; addqDone = false;
    addqLimit = diff === 'easy' ? 8000 : diff === 'normal' ? 5000 : 3000;
    addqTotal = 10;
    $id('addq-diff-sel').style.display = 'none';
    $id('addq-body').style.display = 'flex';
    ['addq-sc', 'addq-correct', 'addq-combo'].forEach(function (id) { setText(id, '0'); });
    setText('addq-total', String(addqTotal));
    setText('addq-combo-msg', '');
    setText('addq-fb', '');
    addqNext();
  }

  function addqNext() {
    if (addqCorrect >= addqTotal) {
      addqStop();
      App.earnReward('⚡', '덧셈 퀴즈 완료! ' + addqSc + '점! 수학 천재! 🧮');
      setTimeout(addqDiffSel, 1400);
      return;
    }
    addqDone = false;
    setText('addq-fb', '');
    var max = addqDiff === 'easy' ? 10 : addqDiff === 'normal' ? 20 : 50;
    addqA = Util.randInt(max) + 1;
    addqB = Util.randInt(Math.max(1, max - addqA)) + 1;
    if (addqDiff !== 'easy' && Math.random() < 0.4) {
      addqOp = '−';
      if (addqA < addqB) { var t = addqA; addqA = addqB; addqB = t; }
      addqAns = addqA - addqB;
    } else {
      addqOp = '+';
      addqAns = addqA + addqB;
    }
    setText('addq-q', addqA + ' ' + addqOp + ' ' + addqB + ' = ?');
    var wrongs = {};
    var guard = 0;
    while (Object.keys(wrongs).length < 3 && guard++ < 60) {
      var w = addqAns + Util.randInt(9) - 4;
      if (w !== addqAns && w >= 0) wrongs[w] = 1;
    }
    var choices = Util.shuffle([addqAns].concat(Object.keys(wrongs).map(Number)));
    var el = $id('addq-choices');
    el.innerHTML = '';
    choices.forEach(function (ch) {
      var b = document.createElement('button');
      b.className = 'addq-choice';
      b.textContent = ch;
      b.onclick = function () { addqAnswer(ch, b); };
      el.appendChild(b);
    });
    addqStop();
    addqStart = Date.now();
    animateBar();
    addqTimer = setTimeout(function () { if (!addqDone) addqAnswer(null, null); }, addqLimit);
  }

  function animateBar() {
    var pct = Math.max(0, 100 - ((Date.now() - addqStart) / addqLimit * 100));
    var fill = $id('addq-timefill');
    if (fill) {
      fill.style.width = pct + '%';
      fill.style.background = pct > 50 ? 'linear-gradient(90deg,#FFD93D,#FF9800)'
        : pct > 20 ? 'linear-gradient(90deg,#FF9800,#f44336)' : 'linear-gradient(90deg,#f44336,#b71c1c)';
    }
    if (pct > 0 && !addqDone) addqAnim = requestAnimationFrame(animateBar);
  }

  function addqAnswer(chosen, btn) {
    if (addqDone) return;
    addqDone = true;
    addqStop();
    var fill = $id('addq-timefill');
    if (fill) fill.style.width = '0%';
    var all = document.querySelectorAll('.addq-choice');
    for (var i = 0; i < all.length; i++) all[i].onclick = null;
    if (chosen === addqAns) {
      if (btn) btn.classList.add('correct');
      addqCombo++;
      addqCorrect++;
      var bonus = addqCombo >= 3 ? 5 : 0;
      addqSc += 10 + bonus;
      setText('addq-sc', String(addqSc));
      setText('addq-correct', String(addqCorrect));
      setText('addq-combo', String(addqCombo));
      setText('addq-combo-msg', addqCombo >= 3 ? '🔥 ' + addqCombo + '연속 +' + bonus + '보너스!' : '');
      setText('addq-fb', '🎉 정답!');
      Util.beep(addqCombo >= 3 ? 'combo' : 'ok');
    } else {
      if (btn) btn.classList.add('wrong');
      for (var j = 0; j < all.length; j++) if (parseInt(all[j].textContent, 10) === addqAns) all[j].classList.add('correct');
      addqCombo = 0;
      setText('addq-combo', '0');
      setText('addq-combo-msg', '');
      setText('addq-fb', chosen === null ? '⏰ 시간 초과! 정답은 ' + addqAns : '괜찮아요! 정답은 ' + addqAns);
      Util.beep('ng');
    }
    setTimeout(addqNext, 900);
  }

  /* ══════════════════ 열기 ══════════════════ */

  App.openMath = function () { App.show('math'); mathInit(); };
  App.openEnglish = function () { App.show('english'); engInit(); };
  App.openClock = function () { App.show('clock-quiz'); clockInit(); };
  App.openWord = function () { App.show('wordquiz'); wqCat = 0; wqIdx = 0; wqSc = 0; wqCombo = 0; buildWqTabs(); loadWqCat(); };
  App.openDict = function () { App.show('dictation'); dCat = 0; dIdx = 0; dSc = 0; dCombo = 0; buildDictTabs(); loadDictCat(); };
  App.openAddq = function () { App.show('addquiz'); addqDiffSel(); };

  window.Learn = {
    mathFlip: mathFlip, mathNext: mathNext, mathPrev: mathPrev, mathShuffle: mathShuffle,
    engFlip: engFlip, engNext: engNext, engPrev: engPrev, engShuffle: engShuffle, speakEng: speakEng
  };
  window.Clock = { next: clockNext, speakQuestion: clockSpeakQ };
  window.Word = { next: wordNext, speakHint: wordSpeakHint };
  window.Dict = { next: dictNext, speak: dictSpeak };
  window.Addq = { begin: addqBegin, stop: addqStop, diffSel: addqDiffSel };

  App.onLeave.push(ckClear);
  App.onLeave.push(addqStop);
})();
