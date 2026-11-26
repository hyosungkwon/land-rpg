/* kids-app/js/mission.js — 🎯 오늘의 미션(일일 퀘스트)
   날짜가 바뀌면 놀이 4갈래(창작·학습·놀이·교감)에서 미션 3개를 새로 뽑는다.
   각 게임이 끝나는 지점에서 Mission.add('이벤트') 를 부르면 진행도가 쌓인다.
   1개 깨면 경험치 +1 · 간식 +1, 3개 다 깨면 스티커 +2 · 경험치 +3 · 축하 폭죽.

   저장 필드(kidsapp4, 없으면 기본값으로 채운다):
     misDate    마지막으로 미션을 뽑은 날짜 'YYYY-M-D'
     misSel     오늘의 미션 id 3개
     misProg    { id: 지금까지 한 개수 }
     misDone    { id: true }  (오늘 깬 미션)
     misClaimed 3개 완료 보상을 받았는지
     misTotal   지금까지 깬 미션 개수(누적)
     misDays    3개를 모두 깬 날 수(누적)
*/
(function () {
  'use strict';

  var App = window.App, SD = App.SD, U = window.Util, KD = window.KD;

  var CAT_ORDER = ['create', 'study', 'play', 'care'];

  var POOL = [
    /* 창작 */
    { id: 'draw', cat: 'create', em: '🎨', title: '그림 놀이 1번 하기', need: 1, open: 'openDraw' },
    { id: 'color', cat: 'create', em: '🖍️', title: '색칠하기 1편 완성', need: 1, open: 'openColoring' },
    { id: 'piano', cat: 'create', em: '🎹', title: '동요 1곡 따라치기', need: 1, open: 'openPiano' },
    /* 학습 */
    { id: 'math', cat: 'study', em: '🔢', title: '수학 3문제 풀기', need: 3, open: 'openMath' },
    { id: 'clock', cat: 'study', em: '🕐', title: '시계 3문제 맞히기', need: 3, open: 'openClock' },
    { id: 'word', cat: 'study', em: '📝', title: '단어 5문제 맞히기', need: 5, open: 'openWord' },
    { id: 'dict', cat: 'study', em: '🔊', title: '받아쓰기 3문제 맞히기', need: 3, open: 'openDict' },
    { id: 'ox', cat: 'study', em: '🧠', title: '생활 상식 5문제 맞히기', need: 5, open: 'openLife' },
    /* 놀이 */
    { id: 'memory', cat: 'play', em: '🃏', title: '기억력 카드 1판 깨기', need: 1, open: 'openMemory' },
    { id: 'puzzle', cat: 'play', em: '🧩', title: '퍼즐 1판 완성', need: 1, open: 'openPuzzle' },
    { id: 'maze', cat: 'play', em: '🌀', title: '미로 1번 탈출', need: 1, open: 'openMaze' },
    { id: 'diff', cat: 'play', em: '🔍', title: '틀린그림찾기 1판 깨기', need: 1, open: 'openDiff' },
    { id: 'fish', cat: 'play', em: '🎣', title: '물고기 2마리 잡기', need: 2, open: 'openFishing' },
    { id: 'balloon', cat: 'play', em: '🎈', title: '풍선 60점 넘기기', need: 1, open: 'openBalloon' },
    /* 교감 */
    { id: 'feed', cat: 'care', em: '🍎', title: '친구에게 간식 1번 주기', need: 1, open: 'feed' }
  ];

  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function $(id) { return document.getElementById(id); }
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // 같은 날이면 언제 새로 열어도 같은 미션이 나오도록 날짜로만 난수를 만든다.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuf(a, r) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function byId(id) {
    for (var i = 0; i < POOL.length; i++) if (POOL[i].id === id) return POOL[i];
    return null;
  }

  function pickToday() {
    var r = rng(hash('mis|' + todayKey()));
    var cats = shuf(CAT_ORDER, r).slice(0, 3);   // 네 갈래 중 3갈래
    return cats.map(function (c) {
      var arr = POOL.filter(function (m) { return m.cat === c; });
      return shuf(arr, r)[0].id;
    });
  }

  /* ── 오늘의 미션 확정 ─────────────────────────── */

  function ensure() {
    var k = todayKey();
    var changed = false;
    var bad = !Array.isArray(SD.misSel) || SD.misSel.length !== 3 ||
      SD.misSel.some(function (id) { return !byId(id); }) ||
      SD.misSel.indexOf(SD.misSel[0]) !== SD.misSel.lastIndexOf(SD.misSel[0]);

    if (SD.misDate !== k || bad) {
      SD.misDate = k;
      SD.misSel = pickToday();
      SD.misProg = {};
      SD.misDone = {};
      SD.misClaimed = false;
      changed = true;
    }
    if (!SD.misProg || typeof SD.misProg !== 'object') { SD.misProg = {}; changed = true; }
    if (!SD.misDone || typeof SD.misDone !== 'object') { SD.misDone = {}; changed = true; }
    if (typeof SD.misClaimed !== 'boolean') { SD.misClaimed = false; changed = true; }
    SD.misTotal = Math.max(0, Math.floor(num(SD.misTotal, 0)));
    SD.misDays = Math.max(0, Math.floor(num(SD.misDays, 0)));
    if (changed) App.writeSave();
  }

  function prog(id) {
    var m = byId(id);
    if (!m) return 0;
    return Math.max(0, Math.min(m.need, Math.floor(num(SD.misProg[id], 0))));
  }
  function isDone(id) { return !!SD.misDone[id]; }
  function doneCount() {
    var n = 0;
    SD.misSel.forEach(function (id) { if (isDone(id)) n++; });
    return n;
  }

  /* ── 진행 ────────────────────────────────────── */

  function add(ev, n) {
    ensure();
    if (SD.misSel.indexOf(ev) < 0) return false;
    if (SD.misDone[ev]) return false;
    var m = byId(ev);
    if (!m) return false;

    var step = Math.max(1, Math.floor(num(n, 1)));
    var p = Math.min(m.need, prog(ev) + step);
    SD.misProg[ev] = p;

    if (p < m.need) {
      App.writeSave();
      refresh();
      return false;
    }

    // 미션 1개 성공: 경험치 +1 · 간식 +1
    SD.misDone[ev] = true;
    SD.misTotal = (SD.misTotal || 0) + 1;
    SD.petTreats = Math.min(99, Math.floor(num(SD.petTreats, 0)) + 1);
    App.writeSave();
    App.addExp(1);
    toast('🎯 미션 성공! ' + m.em + ' ' + m.title + ' · 경험치+1 · 간식+1');
    U.beep('ok');
    refresh();
    if (window.Pet && window.Pet.refresh) window.Pet.refresh();

    if (doneCount() >= 3) setTimeout(allClear, 1000);
    return true;
  }

  function allClear() {
    if (SD.misClaimed) return;
    SD.misClaimed = true;
    SD.misDays = (SD.misDays || 0) + 1;

    // 스티커 +2
    if (!SD.earnedStickers) SD.earnedStickers = [];
    for (var i = 0; i < 2; i++) {
      if (SD.earnedStickers.length < KD.ALL_STICKERS.length) {
        SD.earnedStickers.push(SD.earnedStickers.length);
        SD.totalStickers = (SD.totalStickers || 0) + 1;
      }
    }
    App.writeSave();
    App.checkAch();
    App.updateHomeStatus();
    App.addExp(3);                 // 경험치 +3 (레벨업은 core 가 처리)
    U.doConfetti();
    U.beep('win');

    var m = $('mis-clear');
    if (m) m.classList.add('show');
    refresh();
    if (window.Pet && window.Pet.refresh) window.Pet.refresh();
  }

  /* ── 화면 ────────────────────────────────────── */

  var toastTid = null;
  function toast(msg) {
    var t = $('mis-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (toastTid) clearTimeout(toastTid);
    toastTid = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  function refresh() {
    ensure();
    var total = 3, done = doneCount();

    var dots = $('mis-dots');
    if (dots) {
      dots.innerHTML = '';
      SD.misSel.forEach(function (id) {
        var m = byId(id);
        var d = document.createElement('span');
        d.className = 'mis-dot' + (isDone(id) ? ' done' : '');
        d.textContent = isDone(id) ? '✅' : (m ? m.em : '❔');
        d.title = m ? m.title : '';
        dots.appendChild(d);
      });
    }
    setText('mis-count', done + '/' + total + ' 완료');
    setText('mis-go', done >= total ? '모두 완료! 🎁' : '보기 ›');
    var bar = $('mission-bar');
    if (bar) bar.classList.toggle('all', done >= total);

    if (isOpen()) renderList();
  }

  function renderList() {
    var list = $('mis-list');
    if (!list) return;
    list.innerHTML = '';
    SD.misSel.forEach(function (id) {
      var m = byId(id);
      if (!m) return;
      var p = prog(id), dn = isDone(id);
      var row = document.createElement('div');
      row.className = 'mis-row' + (dn ? ' done' : '');
      var pct = Math.round(p / m.need * 100);
      row.innerHTML =
        '<span class="mis-row-em">' + m.em + '</span>' +
        '<div class="mis-row-main">' +
        '<div class="mis-row-title">' + m.title + '</div>' +
        '<div class="mis-track"><i style="width:' + pct + '%"></i></div>' +
        '</div>' +
        '<span class="mis-row-num">' + p + '/' + m.need + '</span>' +
        '<button class="mis-row-go' + (dn ? ' done' : '') + '">' + (dn ? '완료 ✓' : '바로가기') + '</button>';
      var go = row.querySelector('.mis-row-go');
      go.onclick = function () { goMission(id); };
      list.appendChild(row);
    });

    var all = $('mis-reward');
    if (all) all.classList.toggle('done', SD.misClaimed);
    var sub = $('mis-sub');
    if (sub) {
      sub.textContent = SD.misClaimed
        ? '오늘 미션 모두 완료! 내일 또 만나요 🌙'
        : doneCount() + '/3 완료 · 3개를 모두 하면 특별 선물! 🎁';
    }
    setText('mis-days', '지금까지 ' + (SD.misDays || 0) + '일 모두 완료 · 미션 ' + (SD.misTotal || 0) + '개');
  }

  function goMission(id) {
    var m = byId(id);
    if (!m) return;
    close();
    if (m.open === 'feed') {
      App.home();
      if (window.Pet && window.Pet.feed) window.Pet.feed();
      return;
    }
    if (m.open === 'openDraw') { App.openDraw('topic'); return; }
    if (App[m.open]) App[m.open]();
  }

  function isOpen() {
    var el = $('mission-modal');
    return !!(el && el.classList.contains('show'));
  }
  function open() {
    ensure();
    renderList();
    var el = $('mission-modal');
    if (el) el.classList.add('show');
    U.beep('ok');
  }
  function close() {
    var el = $('mission-modal');
    if (el) el.classList.remove('show');
  }
  function closeClear() {
    var el = $('mis-clear');
    if (el) el.classList.remove('show');
  }

  /* ── 시작 ────────────────────────────────────── */

  ensure();
  refresh();

  window.Mission = {
    add: add,
    open: open,
    close: close,
    closeClear: closeClear,
    go: goMission,
    refresh: refresh,
    today: function () { ensure(); return SD.misSel.slice(); },
    _qa: function () {
      ensure();
      var out = { date: SD.misDate, done: doneCount(), claimed: SD.misClaimed, total: SD.misTotal, days: SD.misDays, list: [] };
      SD.misSel.forEach(function (id) {
        var m = byId(id);
        out.list.push({ id: id, title: m ? m.title : '?', prog: prog(id), need: m ? m.need : 0, done: isDone(id) });
      });
      return out;
    }
  };
})();
