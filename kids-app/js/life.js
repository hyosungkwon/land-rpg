/* kids-app/js/life.js — 🧠 생활·상식 퀴즈 (OX · 4지선다)
   예비 초1(7세) 눈높이의 안전·생활·자연 상식 26문항 중 10문제를 뽑아 낸다.
   정답마다 경험치·점수, 한 판을 마치면 스티커 보상. 정답은 미션('ox')에도 쌓인다.
   문제는 data.js 의 KD.LIFE_QUIZ 에 있다. */
(function () {
  'use strict';

  var App = window.App, U = window.Util, KD = window.KD;
  var $ = function (id) { return document.getElementById(id); };
  var setText = function (id, v) { var e = $(id); if (e) e.textContent = v; };
  var speak = U.speak;

  var POOL = KD.LIFE_QUIZ || [];
  var TOTAL = 10;
  var list = [], idx = 0, sc = 0, combo = 0, correct = 0, answered = false;

  function plain(t) {
    try {
      return String(t).replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
    } catch (e) { return String(t); }
  }

  function begin() {
    list = U.shuffle(POOL).slice(0, Math.min(TOTAL, POOL.length));
    idx = 0; sc = 0; combo = 0; correct = 0; answered = false;
    setText('life-sc', '0');
    setText('life-combo', '0');
    setText('life-correct', '0');
    showQ();
  }

  function showQ() {
    answered = false;
    setText('life-fb', '');
    var next = $('life-next');
    if (next) next.style.display = 'none';
    var q = list[idx];
    if (!q) return;
    var tot = list.length;
    setText('life-num', String(idx + 1));
    setText('life-tot', String(tot));
    var pr = $('life-prog');
    if (pr) pr.style.width = ((idx + 1) / tot * 100) + '%';
    setText('life-emoji', q.em);
    setText('life-q', q.q);

    var host = $('life-choices');
    host.innerHTML = '';
    host.className = 'life-choices' + (q.a.length === 2 ? ' two' : '');
    q.a.forEach(function (txt, i) {
      var b = document.createElement('button');
      b.className = 'life-choice';
      b.textContent = (q.a.length === 2 ? (i === 0 ? '⭕ ' : '❌ ') : '') + txt;
      b.onclick = function () { answer(i, b); };
      host.appendChild(b);
    });
  }

  function answer(pick, btn) {
    if (answered) return;
    answered = true;
    var q = list[idx];
    var all = document.querySelectorAll('.life-choice');
    for (var i = 0; i < all.length; i++) all[i].onclick = null;

    if (pick === q.c) {
      btn.classList.add('correct');
      combo++;
      correct++;
      sc += combo >= 3 ? 15 : 10;
      setText('life-sc', String(sc));
      setText('life-combo', String(combo));
      setText('life-correct', String(correct));
      setText('life-fb', (combo >= 3 ? '🔥 ' + combo + '연속! ' : '🎉 정답! ') + ' ' + q.why);
      U.beep(combo >= 3 ? 'combo' : 'ok');
      if (window.Mission) window.Mission.add('ox', 1);
      setTimeout(function () { speak(plain(q.why), 'ko-KR', { rate: 0.92 }); }, 260);
    } else {
      btn.classList.add('wrong');
      combo = 0;
      setText('life-combo', '0');
      if (all[q.c]) all[q.c].classList.add('correct');
      setText('life-fb', '괜찮아요! 정답은 “' + q.a[q.c] + '” — ' + q.why);
      U.beep('ng');
    }

    idx++;
    if (idx >= list.length) {
      setTimeout(finish, 1100);
    } else {
      var next = $('life-next');
      if (next) next.style.display = 'inline-block';
    }
  }

  function finish() {
    App.SD.lifeDone = (App.SD.lifeDone || 0) + 1;
    App.writeSave();
    App.checkAch();
    App.earnReward('🧠', '생활 상식 퀴즈 완료! ' + list.length + '문제 중 ' + correct + '문제 맞혔어요! ' + sc + '점! 👏');
    idx = 0;
  }

  function next() { if (idx < list.length) showQ(); }

  function speakQ() {
    var q = list[idx];
    if (!q) return;
    var ok = speak(q.q, 'ko-KR', { rate: 0.92 });
    if (!ok) setText('life-fb', '💡 ' + q.q);
  }

  App.openLife = function () { App.show('lifequiz'); begin(); };

  window.Life = {
    next: next,
    speak: speakQ,
    begin: begin,
    _qa: function () {
      return { idx: idx, score: sc, combo: combo, correct: correct, answered: answered, q: list[idx], pool: POOL.length, tts: App.ttsOk };
    }
  };
})();
