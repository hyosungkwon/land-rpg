/* kids-app/js/music.js — 🎹 미니 피아노
   자유 연주 + 동요 5곡 따라치기(건반 하이라이트 가이드) + 음색 3종(피아노·실로폰·오르골) */
(function () {
  'use strict';

  var App = window.App;
  var Util = window.Util;
  var $id = function (x) { return document.getElementById(x); };
  var setText = function (x, v) { var e = $id(x); if (e) e.textContent = v; };

  var WHITE = [
    { name: '도', freq: 261.63, key: 'C' },
    { name: '레', freq: 293.66, key: 'D' },
    { name: '미', freq: 329.63, key: 'E' },
    { name: '파', freq: 349.23, key: 'F' },
    { name: '솔', freq: 392.00, key: 'G' },
    { name: '라', freq: 440.00, key: 'A' },
    { name: '시', freq: 493.88, key: 'B' },
    { name: '도', freq: 523.25, key: 'C5' }
  ];
  var BLACK = [
    { pos: 0.5, name: '도#', freq: 277.18, key: 'C#' },
    { pos: 1.5, name: '레#', freq: 311.13, key: 'D#' },
    { pos: 3.5, name: '파#', freq: 369.99, key: 'F#' },
    { pos: 4.5, name: '솔#', freq: 415.30, key: 'G#' },
    { pos: 5.5, name: '라#', freq: 466.16, key: 'A#' }
  ];

  var F = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392.00, A: 440.00, B: 493.88, C5: 523.25 };

  var SONGS = [
    {
      id: 'twinkle', name: '⭐ 반짝반짝', bpm: 116,
      seq: ['C', 'C', 'G', 'G', 'A', 'A', 'G', 'F', 'F', 'E', 'E', 'D', 'D', 'C']
    },
    {
      id: 'school', name: '🔔 학교종', bpm: 124,
      seq: ['G', 'G', 'A', 'A', 'G', 'G', 'E', 'G', 'G', 'E', 'E', 'D', 'G', 'G', 'A', 'A', 'G', 'G', 'E', 'D', 'G', 'E', 'C']
    },
    {
      id: 'butterfly', name: '🦋 나비야', bpm: 120,
      seq: ['G', 'E', 'E', 'F', 'D', 'D', 'C', 'D', 'E', 'F', 'G', 'G', 'G', 'G', 'E', 'E', 'F', 'D', 'D', 'C', 'E', 'G', 'G', 'E']
    },
    {
      id: 'bear', name: '🐻 곰 세 마리', bpm: 112,
      seq: ['C', 'C', 'C', 'E', 'G', 'G', 'G', 'F', 'E', 'D', 'C', 'C', 'C', 'C', 'E', 'G', 'G', 'G', 'F', 'E', 'D', 'C']
    },
    {
      id: 'birthday', name: '🎂 생일 축하', bpm: 108,
      seq: ['G', 'G', 'A', 'G', 'C5', 'B', 'G', 'G', 'A', 'G', 'D', 'C5', 'G', 'G', 'G', 'E', 'C5', 'B', 'A', 'F', 'F', 'E', 'C5', 'D', 'C5']
    }
  ];

  var TIMBRES = [
    { id: 'piano', name: '🎹 피아노' },
    { id: 'xylo', name: '🎵 실로폰' },
    { id: 'box', name: '🎁 오르골' }
  ];

  var timbre = 'piano';
  var mode = 'free';
  var songIdx = 0;
  var pos = 0;
  var playing = false;
  var listenTimer = null;
  var noteLog = '';
  var logTimer = null;
  var noteCount = 0;
  var keyEls = {};   // key -> element

  /* ── 소리 ─────────────────────────────────────── */

  function playFreq(freq, dur, type) {
    var ctx;
    try { ctx = Util.getAC ? Util.getAC() : null; } catch (e) { ctx = null; }
    if (!ctx) return;
    var t = ctx.currentTime;
    var master = ctx.createGain();
    master.connect(ctx.destination);
    var tb = type || timbre;

    if (tb === 'piano') {
      master.gain.setValueAtTime(0.0001, t);
      master.gain.exponentialRampToValueAtTime(0.24, t + 0.012);
      master.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.9));
      var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
      var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
      var g2 = ctx.createGain(); g2.gain.value = 0.18;
      o1.connect(master); o2.connect(g2); g2.connect(master);
      o1.start(t); o2.start(t); o1.stop(t + 1.0); o2.stop(t + 1.0);
    } else if (tb === 'xylo') {
      master.gain.setValueAtTime(0.22, t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.45));
      var x1 = ctx.createOscillator(); x1.type = 'sine'; x1.frequency.value = freq * 2;
      var x2 = ctx.createOscillator(); x2.type = 'sine'; x2.frequency.value = freq * 3.01;
      var gx = ctx.createGain(); gx.gain.value = 0.12;
      x1.connect(master); x2.connect(gx); gx.connect(master);
      x1.start(t); x2.start(t); x1.stop(t + 0.6); x2.stop(t + 0.6);
    } else {
      master.gain.setValueAtTime(0.0001, t);
      master.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 1.5));
      var b1 = ctx.createOscillator(); b1.type = 'sine'; b1.frequency.value = freq * 1.5;
      var b2 = ctx.createOscillator(); b2.type = 'sine'; b2.frequency.value = freq * 2.51;
      var gb = ctx.createGain(); gb.gain.value = 0.09;
      b1.connect(master); b2.connect(gb); gb.connect(master);
      b1.start(t); b2.start(t); b1.stop(t + 1.6); b2.stop(t + 1.6);
    }
  }

  function logNote(name) {
    noteLog += name + ' ';
    if (noteLog.length > 30) noteLog = noteLog.slice(-30);
    setText('piano-notes', noteLog);
    clearTimeout(logTimer);
    logTimer = setTimeout(function () {
      noteLog = '';
      setText('piano-notes', mode === 'song' ? currentSongTitle() : '건반을 탭해봐요! 🎵');
    }, 3200);
  }

  function countNote() {
    noteCount++;
    if (noteCount % 8 === 0) {
      App.SD.pianoPlayed = (App.SD.pianoPlayed || 0) + 8;
      App.writeSave();
      App.checkAch();
    }
  }

  /* ── 건반 만들기 ───────────────────────────────── */

  function buildKeys() {
    var wrap = $id('piano-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    keyEls = {};
    var W = Math.min(wrap.clientWidth || 360, 460);
    var wkW = Math.floor(W / 8);
    var wkH = Math.min(168, Math.max(120, Math.floor(window.innerHeight * 0.22)));
    wrap.style.height = wkH + 'px';

    WHITE.forEach(function (n, i) {
      var k = document.createElement('button');
      k.className = 'white-key';
      k.style.left = (i * wkW) + 'px';
      k.style.width = wkW + 'px';
      k.style.height = wkH + 'px';
      k.textContent = n.name;
      k.dataset.key = n.key;
      bindKey(k, n);
      wrap.appendChild(k);
      keyEls[n.key] = k;
    });
    var bkW = Math.max(20, Math.floor(wkW * 0.62));
    var bkH = Math.floor(wkH * 0.62);
    BLACK.forEach(function (n) {
      var k = document.createElement('button');
      k.className = 'black-key';
      k.style.left = Math.floor(n.pos * wkW - bkW / 2) + 'px';
      k.style.width = bkW + 'px';
      k.style.height = bkH + 'px';
      k.dataset.key = n.key;
      bindKey(k, n);
      wrap.appendChild(k);
      keyEls[n.key] = k;
    });
    updateGuide();
  }

  function bindKey(el, note) {
    var fire = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      onKey(note, el);
    };
    el.addEventListener('touchstart', fire, { passive: false });
    el.addEventListener('mousedown', fire);
  }

  function onKey(note, el) {
    playFreq(note.freq, timbre === 'box' ? 1.5 : timbre === 'xylo' ? 0.45 : 0.9);
    countNote();
    logNote(note.name);
    el.classList.add('key-hit');
    setTimeout(function () { el.classList.remove('key-hit'); }, 220);

    if (mode === 'song' && !playing) {
      var want = SONGS[songIdx].seq[pos];
      if (want === note.key) {
        pos++;
        Util.beep('ok');
        if (pos >= SONGS[songIdx].seq.length) songComplete();
        else updateGuide();
      } else {
        setText('piano-notes', '다른 건반! ' + (keyEls[want] ? keyEls[want].textContent : '') + ' 를 눌러봐요 🎯');
      }
    }
  }

  /* ── 따라치기 ─────────────────────────────────── */

  function currentSongTitle() {
    return '🎵 ' + SONGS[songIdx].name;
  }

  function buildSongButtons() {
    var box = $id('piano-songs');
    if (!box) return;
    box.innerHTML = '';
    SONGS.forEach(function (s, i) {
      var b = document.createElement('button');
      b.className = 'song-btn' + (i === songIdx ? ' active' : '');
      b.textContent = s.name;
      b.onclick = function () { selectSong(i); };
      box.appendChild(b);
    });
  }

  function selectSong(i) {
    stopListen();
    songIdx = i;
    pos = 0;
    var btns = document.querySelectorAll('#piano-songs .song-btn');
    for (var k = 0; k < btns.length; k++) btns[k].classList.toggle('active', k === i);
    setText('piano-notes', currentSongTitle());
    updateGuide();
  }

  function buildTimbres() {
    var box = $id('piano-timbres');
    if (!box) return;
    box.innerHTML = '';
    TIMBRES.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'timbre-btn' + (t.id === timbre ? ' active' : '');
      b.textContent = t.name;
      b.onclick = function () {
        timbre = t.id;
        var all = document.querySelectorAll('.timbre-btn');
        for (var k = 0; k < all.length; k++) all[k].classList.toggle('active', all[k].textContent === t.name);
        playFreq(440, 0.6);
      };
      box.appendChild(b);
    });
  }

  function updateGuide() {
    Object.keys(keyEls).forEach(function (k) { keyEls[k].classList.remove('guide'); });
    var box = $id('song-progress');
    if (box) box.innerHTML = '';
    if (mode !== 'song') return;
    var seq = SONGS[songIdx].seq;
    // 진행 점
    if (box) {
      seq.forEach(function (_, i) {
        var d = document.createElement('div');
        d.className = 'song-dot' + (i < pos ? ' done' : i === pos ? ' now' : '');
        box.appendChild(d);
      });
    }
    var want = seq[pos];
    if (want && keyEls[want]) keyEls[want].classList.add('guide');
  }

  function songComplete() {
    playing = false;
    stopListen();
    App.SD.pianoPlayed = (App.SD.pianoPlayed || 0) + 3;
    App.writeSave();
    App.checkAch();
    Util.doConfetti();
    Util.beep('win');
    setText('piano-notes', '🎉 완주! ' + SONGS[songIdx].name);
    setTimeout(function () {
      App.earnReward('🎹', SONGS[songIdx].name + ' 완주! 정말 멋져요! 🎶');
    }, 400);
    pos = 0;
    updateGuide();
  }

  /* ── 들어보기(자동 연주) ────────────────────────── */

  function listen() {
    if (mode !== 'song') { setMode('song'); }
    stopListen();
    playing = true;
    var seq = SONGS[songIdx].seq;
    var beat = 60 / SONGS[songIdx].bpm;
    var i = 0;
    setText('piano-notes', currentSongTitle() + ' 듣는 중…');
    var step = function () {
      if (i >= seq.length) {
        playing = false;
        setText('piano-notes', '🎵 다 들었어요! 이제 따라쳐요');
        pos = 0;
        updateGuide();
        return;
      }
      var key = seq[i];
      var el = keyEls[key];
      playFreq(F[key], timbre === 'box' ? 1.4 : 0.7);
      if (el) {
        el.classList.add('guide');
        setTimeout(function () { if (!playing) return; }, 10);
      }
      i++;
      listenTimer = setTimeout(function () {
        if (el) el.classList.remove('guide');
        step();
      }, beat * 1000);
    };
    step();
  }

  function stopListen() {
    clearTimeout(listenTimer);
    listenTimer = null;
    playing = false;
  }

  /* ── 모드 ─────────────────────────────────────── */

  function setMode(m) {
    mode = (m === 'song') ? 'song' : 'free';
    var f = $id('pm-free'), s = $id('pm-song');
    if (f) f.classList.toggle('active', mode === 'free');
    if (s) s.classList.toggle('active', mode === 'song');
    var songs = $id('piano-songs');
    if (songs) songs.style.display = mode === 'song' ? 'flex' : 'none';
    if (mode === 'free') {
      stopListen();
      pos = 0;
      setText('piano-notes', '건반을 탭해봐요! 🎵');
    } else {
      setText('piano-notes', currentSongTitle());
    }
    updateGuide();
  }

  function open() {
    App.show('piano');
    timbre = 'piano';
    buildTimbres();
    buildSongButtons();
    setMode('free');
    buildKeys();
    setTimeout(buildKeys, 180);
  }

  window.Piano = { setMode: setMode, listen: listen, stop: stopListen };
  App.openPiano = open;
  App.onLeave.push(stopListen);
})();
