/* kids-app/js/pet.js — 🐣 친구 교감: 말풍선 · 간식 주기 · 쓰다듬기 · 이름 짓기
   저장은 core.js 의 SD(kidsapp4) 하나를 그대로 쓴다.
   새로 쓰는 필드(기존 저장본에는 없어도 안전하게 기본값이 채워진다):
     petName     친구 이름 (기본 '꼬마친구')
     petHunger   배부름 0~100 (간식 주면 올라가고 시간이 지나면 천천히 내려간다)
     petHappy    친밀도 0~100 (쓰다듬기·간식으로 올라가고 시간이 지나면 조금 내려간다)
     petTreats   간식 재고 (매일 무료 3개 + 낚시에서 물고기를 잡을 때마다 1개)
     petTreatDate 마지막 무료 간식 지급 날짜
     petTickAt   마지막으로 배부름/친밀도를 계산한 시각
     petFed / petPets  지금까지 먹인 횟수 / 쓰다듬은 횟수
     petSound    말풍선을 소리로도 읽어줄지 (기본 true)
*/
(function () {
  'use strict';

  var App = window.App;
  var SD = App.SD;
  var U = window.Util;

  var DEFAULT_NAME = '꼬마친구';
  var MAX_NAME = 10;
  var FREE_TREATS = 3;          // 매일 기본 간식
  var HUNGER_DECAY = 2.5;       // 1시간에 배부름 -2.5
  var HAPPY_DECAY = 1.2;        // 1시간에 친밀도 -1.2
  var FEED_FULL = 25;           // 간식 1개 = 배부름 +25
  var FEED_HAPPY = 8;
  var PET_HAPPY = 6;
  var TAP_HAPPY = 2;

  var LINES = {
    hello: [
      '안녕! 오늘 뭐 하고 놀까? 🎈',
      '유아 최고! 💖',
      '그림 그리러 갈까? 🎨',
      '같이 낚시하러 갈래? 🎣',
      '퍼즐 맞추면 나도 신나! 🧩',
      '피아노 소리 들려줘~ 🎵',
      '우리 오늘도 사이좋게 놀자! 🌈',
      '톡톡! 간지러워~ 😆'
    ],
    hungry: ['배고파요~ 간식 주세요! 🍎', '간식 냄새가 나요… 냠냠! 🍎'],
    lonely: ['심심해요… 쓰다듬어 줘! 💖', '같이 놀아줘~ 💖'],
    feed: ['냠냠! 맛있다~ 고마워! 😋', '냠냠~ 최고의 간식이야! 🍎', '잘 먹었어요! 힘이 나요! 💪', '냠냠냠! 더 주세요~ 😆'],
    pet: ['히히, 좋아! 💖', '너무 좋아~ 💕', '또 쓰다듬어 줘! ✨', '기분이 최고예요! 🌈'],
    full: ['배불러요~ 나중에 먹을래요 😋'],
    noTreat: ['간식이 다 떨어졌어요! 낚시에서 물고기를 잡으면 간식이 생겨요 🎣'],
    maxHappy: ['너무 좋아! 나는 유아가 제일 좋아! 💖']
  };

  /* ── 작은 도구 ───────────────────────────────── */

  function clamp(v, lo, hi) {
    lo = (lo === undefined) ? 0 : lo;
    hi = (hi === undefined) ? 100 : hi;
    if (typeof v !== 'number' || !isFinite(v)) v = lo;
    return Math.max(lo, Math.min(hi, v));
  }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function $(id) { return document.getElementById(id); }
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  // 소리로 읽을 때 이모지·기호는 빼고 읽는다.
  function plain(t) {
    try {
      return String(t)
        .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (e) {
      return String(t).replace(/\s+/g, ' ').trim();
    }
  }

  /* ── 저장값 정리(예전 저장본 호환) ─────────────── */

  function normalize() {
    if (typeof SD.petName !== 'string' || !SD.petName.trim()) SD.petName = DEFAULT_NAME;
    SD.petName = SD.petName.trim().slice(0, MAX_NAME);
    SD.petHunger = clamp(num(SD.petHunger, 70));
    SD.petHappy = clamp(num(SD.petHappy, 60));
    SD.petTreats = clamp(Math.floor(num(SD.petTreats, FREE_TREATS)), 0, 99);
    SD.petFed = Math.max(0, Math.floor(num(SD.petFed, 0)));
    SD.petPets = Math.max(0, Math.floor(num(SD.petPets, 0)));
    if (typeof SD.petSound !== 'boolean') SD.petSound = true;
    if (!(SD.petTickAt > 0)) SD.petTickAt = Date.now();
    if (typeof SD.petTreatDate !== 'string') SD.petTreatDate = '';
    refillFree();
  }

  // 하루에 한 번 무료 간식을 3개까지 채워 준다(모아 둔 간식이 더 많으면 그대로).
  function refillFree() {
    var k = todayKey();
    if (SD.petTreatDate === k) return false;
    SD.petTreatDate = k;
    SD.petTreats = Math.max(SD.petTreats || 0, FREE_TREATS);
    return true;
  }

  // 시간이 지난 만큼 배부름·친밀도를 조금씩 내린다(최대 3일치까지만).
  function tick() {
    var now = Date.now();
    var last = num(SD.petTickAt, now);
    var hours = (now - last) / 3600000;
    if (!(hours > 0)) { SD.petTickAt = now; return false; }
    if (hours > 72) hours = 72;
    SD.petHunger = clamp(SD.petHunger - HUNGER_DECAY * hours);
    SD.petHappy = clamp(SD.petHappy - HAPPY_DECAY * hours);
    SD.petTickAt = now;
    return true;
  }

  /* ── 화면 갱신 ───────────────────────────────── */

  function refresh() {
    var st = App.stageOf(SD.charLv);
    var h = Math.round(SD.petHunger);
    var p = Math.round(SD.petHappy);

    setText('pet-bar-name', SD.petName);
    setText('hc-nm', SD.petName);            // 홈 미니 프로필에도 친구 이름

    var fh = $('pg-fill-hunger');
    if (fh) fh.style.width = h + '%';
    var fp = $('pg-fill-happy');
    if (fp) fp.style.width = p + '%';
    setText('pg-val-hunger', String(h));
    setText('pg-val-happy', String(p));

    setText('pet-treat-n', String(SD.petTreats));
    var fb = $('pet-btn-feed');
    if (fb) fb.classList.toggle('empty', !(SD.petTreats > 0));

    // 🏠 내 방 카드
    setText('pet-room-em', st.emoji);
    setText('pet-room-name', SD.petName);
    setText('pet-room-hunger', String(h));
    setText('pet-room-happy', String(p));
    setText('pet-room-treats', String(SD.petTreats));
    setText('pet-room-fed', String(SD.petFed));

    var snd = $('home-snd');
    if (snd) snd.textContent = SD.petSound === false ? '🔇' : '🔊';
  }

  /* ── 말풍선 ──────────────────────────────────── */

  var bubTimer = null;
  var lastSpeakAt = 0;

  function say(text, opts) {
    opts = opts || {};
    var b = $('pet-bubble');
    setText('pet-bubble-tx', text);
    if (b) {
      b.classList.add('show');
      if (bubTimer) clearTimeout(bubTimer);
      bubTimer = setTimeout(function () { b.classList.remove('show'); }, opts.ms || Math.min(5500, 3000 + text.length * 60));
    }
    if (SD.petSound === false || opts.silent) return;
    var now = Date.now();
    if (now - lastSpeakAt < 1200) return;      // 말이 겹치지 않게
    lastSpeakAt = now;
    App.speak(plain(text), 'ko-KR', { rate: 0.95, pitch: 1.15 });
  }

  /* ── 움직임·파티클 ───────────────────────────── */

  function anim(cls, ms) {
    var w = document.querySelector('.hero-wrap');
    if (!w) return;
    w.classList.remove(cls);
    void w.offsetWidth;
    w.classList.add(cls);
    setTimeout(function () { w.classList.remove(cls); }, ms || 700);
  }
  function bounce() { anim('pop', 700); }
  function nom() { anim('nom', 720); }
  function shakeChar() { anim('shake', 420); }

  function burst(emojis, count) {
    var host = document.querySelector('.hero-wrap');
    if (!host) return;
    var n = count || 6;
    var made = [];
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span');
      s.className = 'pet-fx';
      s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      s.style.setProperty('--dx', Math.round((Math.random() - 0.5) * 130) + 'px');
      s.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 70) + 'deg');
      s.style.left = (50 + (Math.random() - 0.5) * 34) + '%';
      s.style.top = (34 + Math.random() * 26) + '%';
      s.style.fontSize = Math.round(15 + Math.random() * 13) + 'px';
      s.style.animationDelay = Math.round(i * 45) + 'ms';
      host.appendChild(s);
      made.push(s);
    }
    setTimeout(function () {
      for (var j = 0; j < made.length; j++) {
        if (made[j].parentNode) made[j].parentNode.removeChild(made[j]);
      }
    }, 1800);
  }

  /* ── 교감 동작 ───────────────────────────────── */

  var lastTapAt = 0;

  function tapLine() {
    if (SD.petHunger < 28) return pick(LINES.hungry);
    if (SD.petHappy < 28) return pick(LINES.lonely);
    return pick(LINES.hello);
  }

  // 히어로 캐릭터를 톡톡 눌렀을 때 (친밀도 아주 조금 + 말풍선 + 하트)
  function tap() {
    var now = Date.now();
    var gain = (now - lastTapAt > 2600) ? TAP_HAPPY : 0;
    if (gain) {
      lastTapAt = now;
      tick();
      SD.petHappy = clamp(SD.petHappy + gain);
      SD.petPets = (SD.petPets || 0) + 1;
      App.writeSave();
      refresh();
      if (SD.petHappy >= 100) { say(pick(LINES.maxHappy)); }
      else { say(tapLine()); }
    } else {
      say(tapLine(), { silent: true });
    }
    bounce();
    burst(['❤️', '💖', '⭐', '✨', '💫'], 6);
    U.beep('ok');
  }

  // 💖 쓰다듬기
  function pet() {
    tick();
    SD.petHappy = clamp(SD.petHappy + PET_HAPPY);
    SD.petPets = (SD.petPets || 0) + 1;
    App.writeSave();
    refresh();
    bounce();
    burst(['❤️', '💖', '✨', '⭐'], 7);
    U.beep('ok');
    say(SD.petHappy >= 100 ? pick(LINES.maxHappy) : pick(LINES.pet));
  }

  // 🍎 간식 주기
  function feed() {
    tick();
    refillFree();

    if (!(SD.petTreats > 0)) {
      App.writeSave();
      refresh();
      shakeChar();
      U.beep('ng');
      say(pick(LINES.noTreat));
      return;
    }
    if (SD.petHunger >= 97) {
      U.beep('ng');
      say(pick(LINES.full));
      return;
    }

    SD.petTreats -= 1;
    SD.petHunger = clamp(SD.petHunger + FEED_FULL);
    SD.petHappy = clamp(SD.petHappy + FEED_HAPPY);
    SD.petFed = (SD.petFed || 0) + 1;
    App.writeSave();
    refresh();

    nom();
    burst(['🍎', '😋', '❤️', '✨'], 7);
    U.beep('ok');
    say(pick(LINES.feed));

    // 교감하면 캐릭터도 조금씩 자란다(경험치 +1, 스티커는 그대로).
    App.addExp(1);
  }

  /* ── 이름 짓기 ───────────────────────────────── */

  function rename() {
    var m = $('pet-name-modal');
    var i = $('pet-name-input');
    if (i) i.value = SD.petName;
    if (m) m.classList.add('show');
    setTimeout(function () {
      try { if (i) { i.focus(); i.select(); } } catch (e) {}
    }, 140);
  }

  function renameClose() {
    var m = $('pet-name-modal');
    if (m) m.classList.remove('show');
  }

  function renameSave() {
    var i = $('pet-name-input');
    var v = i ? String(i.value || '').trim().slice(0, MAX_NAME) : '';
    if (!v) v = SD.petName || DEFAULT_NAME;
    SD.petName = v;
    App.writeSave();
    renameClose();
    refresh();
    say('이제 내 이름은 ' + v + '! 반가워! 💖');
  }

  /* ── 소리 켜기/끄기 ──────────────────────────── */

  function toggleSound() {
    SD.petSound = (SD.petSound === false);
    App.writeSave();
    refresh();
    if (SD.petSound) {
      U.beep('ok');
      App.speak('소리를 켰어요. 안녕!', 'ko-KR', { rate: 0.95, pitch: 1.15 });
    } else if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  }

  /* ── 시작 ────────────────────────────────────── */

  normalize();
  tick();
  App.writeSave();
  refresh();

  var ini = $('pet-name-input');
  if (ini) {
    ini.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); renameSave(); }
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      tick();
      if (refillFree()) App.writeSave();
      refresh();
    }
  });

  // 오래 놀지 못했으면 홈에 들어오자마자 살짝 알려 준다.
  setTimeout(function () {
    if (SD.petHunger < 28) say(pick(LINES.hungry));
  }, 1500);

  window.Pet = {
    refresh: refresh,
    tap: tap,
    feed: feed,
    pet: pet,
    rename: rename,
    renameSave: renameSave,
    renameClose: renameClose,
    toggleSound: toggleSound,
    _qa: function () {
      return {
        name: SD.petName, hunger: Math.round(SD.petHunger), happy: Math.round(SD.petHappy),
        treats: SD.petTreats, fed: SD.petFed, pets: SD.petPets, sound: SD.petSound
      };
    }
  };
})();
