/* kids-app/js/parent.js — ⏰ 사용 시간 타이머 · 👨‍👩‍👧 부모님 요약
   · 타이머: 해제 / 10분 / 15분 / 20분 / 30분. 앱을 보고 노는 동안에만 줄어든다.
   · 시간이 다 되면 화면을 막는 대신, 우리 친구가 😴 졸린 얼굴로 나와
     "오늘 신나게 놀았다~ 잠깐 눈 쉬고 나중에 또 놀자!" 하고 부드럽게 알려 준다.
   · 끄거나 늘릴 때는 부모님 확인(곱셈 한 문제)을 거친다.
   · 같은 화면에서 오늘의 놀이 요약(학습 문제·그린 작품·미션·놀이 시간)을 보여 준다.
   저장은 core.js 의 SD(kidsapp4) 하나를 그대로 쓴다(예전 저장본에는 없어도 기본값으로 채워진다).
     timerMin    지금 설정된 타이머(분, 0 = 꺼짐)
     timerLeftMs 남은 시간(밀리초)
     timerSetAt  타이머를 마지막으로 건 시각
     dayDate / dayEv / dayMs   오늘 날짜 · 오늘 활동 횟수 · 오늘 놀이한 시간(ms)
*/
(function () {
  'use strict';

  var App = window.App, SD = App.SD, U = window.Util;
  var MIN = 60 * 1000;
  var OPTIONS = [0, 10, 15, 20, 30];
  var REST_MSG = '오늘 신나게 놀았다~ 잠깐 눈 쉬고 나중에 또 놀자!';

  var resting = false;
  var gateAnswer = 0, gateInput = '', gateCb = null;
  var parentOkAt = 0;   // 부모님 확인을 막 통과한 시각(바로 이어지는 변경은 다시 묻지 않는다)
  var dirty = false, lastSaveAt = 0, lastPlayAt = Date.now();

  function $(id) { return document.getElementById(id); }
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function mmss(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }
  function saveNow() {
    App.writeSave();
    dirty = false;
    lastSaveAt = Date.now();
  }

  /* ── 저장값 정리 · 날짜 넘김 ───────────────────── */

  function ensureDay() {
    var k = todayKey();
    if (SD.dayDate !== k) {
      SD.dayDate = k;
      SD.dayEv = {};
      SD.dayMs = 0;
      dirty = true;
    }
    if (!SD.dayEv || typeof SD.dayEv !== 'object') SD.dayEv = {};
    if (typeof SD.dayMs !== 'number' || !isFinite(SD.dayMs)) SD.dayMs = 0;
    if (dirty) saveNow();
  }

  function track(ev, n) {
    if (!ev) return;
    ensureDay();
    SD.dayEv[ev] = Math.max(0, Math.floor(num(SD.dayEv[ev], 0))) + n;
    saveNow();
  }

  /* ── 오늘의 놀이 요약 ─────────────────────────── */

  var LEARN = ['math', 'clock', 'word', 'dict', 'ox'];
  var PLAY = ['memory', 'puzzle', 'maze', 'diff', 'fish', 'balloon', 'piano'];

  function sum(list) {
    var t = 0;
    list.forEach(function (k) { t += Math.max(0, Math.floor(num(SD.dayEv[k], 0))); });
    return t;
  }

  function summary() {
    ensureDay();
    var mis = (window.Mission && window.Mission._qa) ? window.Mission._qa() : { done: 0, total: 0, days: 0 };
    return {
      learn: sum(LEARN),
      art: (window.Exhibit && window.Exhibit.todayCount) ? window.Exhibit.todayCount() : sum(['draw', 'color']),
      misDone: mis.done || 0,
      misTotal: 3,
      misDays: mis.days || 0,
      misAll: mis.total || 0,
      play: sum(PLAY),
      care: sum(['feed']),
      minutes: Math.round(num(SD.dayMs, 0) / 60000),
      stickers: SD.totalStickers || 0,
      hunger: Math.round(num(SD.petHunger, 70)),
      happy: Math.round(num(SD.petHappy, 60))
    };
  }

  function timerActive() { return num(SD.timerMin, 0) > 0; }
  function leftMs() { return Math.max(0, num(SD.timerLeftMs, 0)); }

  function renderSummary() {
    var s = summary();
    setText('pm-learn', String(s.learn));
    setText('pm-art', String(s.art));
    setText('pm-mission', s.misDone + '/' + s.misTotal);
    setText('pm-time', String(s.minutes));
    setText('pm-line1', '🎮 놀이 ' + s.play + '번 · 🍎 간식 ' + s.care + '번 · 🏷️ 스티커 ' + s.stickers + '개(전체)');
    setText('pm-line2', '🎯 지금까지 미션 ' + s.misAll + '개 · 모두 완료한 날 ' + s.misDays + '일 · ' +
      '친구 🍎' + s.hunger + ' · 💖' + s.happy);

    var now = $('pm-now');
    if (now) {
      if (resting) now.innerHTML = '<b>😴 쉬는 중</b> · 부모님 확인으로 새로 시작할 수 있어요';
      else if (timerActive()) now.innerHTML = '<b>⏰ ' + mmss(leftMs()) + '</b> 남았어요';
      else now.textContent = '지금은 타이머가 꺼져 있어요';
    }
    var btns = document.querySelectorAll('.pm-timer-btn');
    for (var i = 0; i < btns.length; i++) {
      var m = Number(btns[i].getAttribute('data-min'));
      var sel = (m === 0) ? !timerActive() : (timerActive() && Math.round(num(SD.timerMin, 0)) === m && !resting);
      btns[i].classList.toggle('sel', sel);
    }
  }

  /* ── 타이머 ───────────────────────────────────── */

  function updateChip() {
    var chip = $('pb-chip');
    if (!chip) return;
    chip.classList.remove('on', 'soon');
    if (resting) {
      chip.classList.add('on');
      chip.textContent = '😴 쉬는 중';
      return;
    }
    if (!timerActive()) {
      chip.textContent = '⏰ 타이머 꺼짐';
      return;
    }
    var left = leftMs();
    chip.classList.add('on');
    if (left <= 60000) chip.classList.add('soon');
    chip.textContent = '⏰ ' + mmss(left) + ' 남음';
  }

  function applyTimer(min, quiet) {
    min = Math.max(0, Math.round(num(min, 0)));
    if (min === 0) {
      SD.timerMin = 0;
      SD.timerLeftMs = 0;
    } else {
      SD.timerMin = min;
      SD.timerLeftMs = min * MIN;
    }
    SD.timerSetAt = Date.now();
    hideRest();
    saveNow();
    updateChip();
    renderSummary();
    if (!quiet) {
      if (min === 0) U.beep('ok');
      else { U.beep('ok'); toast('⏰ ' + min + '분 타이머를 켰어요'); }
    }
  }

  // 타이머 버튼: 끄기·늘리기는 부모님 확인(곱셈)을 거친다.
  function pick(min) {
    min = Math.max(0, Math.round(num(min, 0)));
    var left = leftMs();
    var active = timerActive() && (left > 0 || resting);
    var justChecked = (Date.now() - parentOkAt) < 90000;
    var needGate = active && (min === 0 || min * MIN > left) && !justChecked;

    if (!active && min === 0) {
      closeMenu();
      toast('지금은 타이머가 꺼져 있어요');
      return;
    }
    if (!needGate) {
      applyTimer(min);
      closeMenu();
      return;
    }
    var task = (min === 0) ? '타이머를 끄려면' : ('시간을 ' + min + '분으로 늘리려면');
    gate(task + ' 부모님 확인이 필요해요.', function () {
      applyTimer(min);
      closeMenu();
    });
  }

  function expire() {
    if (resting) return;
    SD.timerLeftMs = 0;
    resting = true;
    saveNow();
    updateChip();
    closeMenu();
    showRest();
  }

  function showRest() {
    var ov = $('rest-overlay');
    if (!ov) return;
    var st = App.stageOf(SD.charLv);
    setText('rest-face', '😴');
    setText('rest-sub', (st ? st.emoji : '🐣') + ' ' + (SD.petName || '꼬마친구') + '도 같이 쉴까요? 💤');
    setText('rest-title', '오늘 신나게 놀았다~');
    setText('rest-msg', '잠깐 눈 쉬고 나중에 또 놀자!');
    ov.classList.add('show');
    document.body.classList.add('resting');
    try { U.beep('ok'); } catch (e) {}
    if (SD.petSound !== false && App.speak) {
      App.speak(REST_MSG, 'ko-KR', { rate: 0.92, pitch: 1.02 });
    }
  }

  function hideRest() {
    resting = false;
    var ov = $('rest-overlay');
    if (ov) ov.classList.remove('show');
    document.body.classList.remove('resting');
  }

  // 쉬는 화면에서 '부모님이에요' → 확인 후 메뉴를 연다(끄기/연장 선택).
  function restParentTap() {
    gate('타이머를 바꾸려면 부모님 확인이 필요해요.', function () {
      openMenu();
    });
  }

  /* ── 부모님 확인(곱셈) ────────────────────────── */

  function gate(taskText, cb) {
    var a = 3 + Math.floor(Math.random() * 7);   // 3~9
    var b = 3 + Math.floor(Math.random() * 7);   // 3~9
    gateAnswer = a * b;
    gateInput = '';
    gateCb = cb || null;
    setText('pg-sub', taskText || '부모님 확인이 필요해요.');
    setText('pg-q', a + ' × ' + b + ' = ?');
    renderGateInput();
    var g = $('pgate');
    if (g) g.classList.add('show');
  }

  function renderGateInput() {
    setText('pg-ans', gateInput ? gateInput : '_');
  }

  function gateKey(k) {
    var card = $('pgate') ? $('pgate').querySelector('.pg-card') : null;
    if (k === 'del') { gateInput = gateInput.slice(0, -1); renderGateInput(); return; }
    if (k === 'ok') { gateSubmit(); return; }
    if (gateInput.length >= 3) return;
    gateInput += String(k);
    renderGateInput();
    U.beep('ok');
    if (card) card.classList.remove('shake');
  }

  function gateSubmit() {
    var v = parseInt(gateInput, 10);
    if (!isFinite(v) || v !== gateAnswer) {
      var card = $('pgate') ? $('pgate').querySelector('.pg-card') : null;
      gateInput = '';
      renderGateInput();
      try { U.beep('ng'); } catch (e) {}
      if (card) {
        card.classList.add('shake');
        setTimeout(function () { card.classList.remove('shake'); }, 340);
      }
      return;
    }
    var cb = gateCb;
    gateCb = null;
    parentOkAt = Date.now();
    gateInput = '';
    renderGateInput();
    var g = $('pgate');
    if (g) g.classList.remove('show');
    U.beep('win');
    if (cb) setTimeout(cb, 120);
  }

  function gateCancel() {
    gateCb = null;
    gateInput = '';
    renderGateInput();
    var g = $('pgate');
    if (g) g.classList.remove('show');
  }

  /* ── 부모님 메뉴 ──────────────────────────────── */

  function openMenu() {
    ensureDay();
    renderSummary();
    var m = $('parent-modal');
    if (m) m.classList.add('show');
    U.beep('ok');
  }
  function closeMenu() {
    var m = $('parent-modal');
    if (m) m.classList.remove('show');
  }

  /* ── 짧은 알림 ────────────────────────────────── */

  var toastTid = null;
  function toast(msg) {
    var t = $('parent-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (toastTid) clearTimeout(toastTid);
    toastTid = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ── 1초 틱 · 놀이 시간 재기 ──────────────────── */

  function tick() {
    ensureDay();
    if (resting) { updateChip(); return; }
    if (timerActive() && leftMs() > 0 && !document.hidden) {
      var left = leftMs() - 1000;
      if (left <= 0) { expire(); return; }
      SD.timerLeftMs = left;
      dirty = true;
      if (Date.now() - lastSaveAt > 10000) saveNow();
      if (left <= 60000 && left % 5000 < 1000) updateChip();
    }
    updateChip();
    if (document.querySelector('#parent-modal.show')) {
      var now = $('pm-now');
      if (now) {
        now.innerHTML = resting ? '<b>😴 쉬는 중</b>'
          : (timerActive() ? '<b>⏰ ' + mmss(leftMs()) + '</b> 남았어요' : '지금은 타이머가 꺼져 있어요');
      }
    }
  }

  function playTick() {
    var now = Date.now();
    var delta = now - lastPlayAt;
    lastPlayAt = now;
    if (document.hidden) return;
    if (delta > 0 && delta < 120000) {
      ensureDay();
      SD.dayMs = Math.max(0, num(SD.dayMs, 0)) + delta;
      dirty = true;
    }
    if (dirty && now - lastSaveAt > 45000) saveNow();
  }

  /* ── 시작 ─────────────────────────────────────── */

  function init() {
    SD.timerMin = Math.max(0, Math.round(num(SD.timerMin, 0)));
    SD.timerLeftMs = Math.max(0, num(SD.timerLeftMs, 0));
    if (SD.timerMin > 0 && SD.timerLeftMs > 60000 * 240) SD.timerLeftMs = SD.timerMin * MIN;  // 깨진 값 방지
    ensureDay();
    saveNow();

    // 타이머 버튼
    var btns = document.querySelectorAll('.pm-timer-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { pick(Number(b.getAttribute('data-min'))); });
      })(btns[i]);
    }
    // 곱셈 숫자판
    var pad = $('pg-pad');
    if (pad) {
      var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
      keys.forEach(function (k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pg-key' + (k === 'ok' ? ' ok' : (k === 'del' ? ' del' : ''));
        b.textContent = k === 'ok' ? '확인' : (k === 'del' ? '←' : k);
        b.addEventListener('click', function () { gateKey(k); });
        pad.appendChild(b);
      });
    }

    updateChip();
    renderSummary();

    // 앱을 켰을 때 이미 시간이 다 되어 있었으면 바로 쉬자고 알려 준다.
    if (timerActive() && leftMs() <= 0) {
      setTimeout(function () { expire(); }, 900);
    }

    setInterval(tick, 1000);
    setInterval(playTick, 15000);

    document.addEventListener('visibilitychange', function () {
      lastPlayAt = Date.now();
      if (document.hidden) { if (dirty) saveNow(); }
    });
    window.addEventListener('pagehide', function () { if (dirty) saveNow(); });

    // 🎯 미션에 쌓이는 모든 성공 지점을 오늘의 요약에도 기록한다.
    if (window.Mission && window.Mission.add) {
      var origAdd = window.Mission.add;
      window.Mission.add = function (ev, n) {
        try { track(ev, Math.max(1, Math.floor(num(n, 1)))); } catch (e) {}
        return origAdd.call(window.Mission, ev, n);
      };
    }
  }

  init();

  window.Parent = {
    openMenu: openMenu,
    closeMenu: closeMenu,
    pick: pick,
    setTimer: applyTimer,
    restParentTap: restParentTap,
    gate: gate,
    gateKey: gateKey,
    gateSubmit: gateSubmit,
    gateCancel: gateCancel,
    summary: summary,
    isResting: function () { return resting; },
    _qa: function () {
      ensureDay();
      var s = summary();
      return {
        timerMin: SD.timerMin, leftSec: Math.round(leftMs() / 1000), resting: resting,
        day: SD.dayDate, today: s,
        chip: ($('pb-chip') ? $('pb-chip').textContent : '')
      };
    },
    /* 테스트용: 몇 초짜리 타이머를 걸어 만료를 바로 확인할 수 있다. */
    test: function (sec) {
      var s = Math.max(1, Math.round(num(sec, 5)));
      SD.timerMin = Math.max(1, Math.round(s / 60));
      SD.timerLeftMs = s * 1000;
      SD.timerSetAt = Date.now();
      hideRest();
      saveNow();
      updateChip();
      renderSummary();
      return window.Parent._qa();
    }
  };
})();
