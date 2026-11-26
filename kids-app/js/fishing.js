/* kids-app/js/fishing.js — 🎣 낚시 게임 (물고기 20종·낚싯대 5단계·도감)
   원본 kids-app 낚시를 그대로 옮기고 화면 크기 계산만 390×844 기준으로 다듬었습니다. */
(function () {
  'use strict';

  var App = window.App;
  var Util = window.Util;
  var KD = window.KD;
  var $id = function (x) { return document.getElementById(x); };
  var setText = function (x, v) { var e = $id(x); if (e) e.textContent = v; };

  var FISH_TYPES = KD.FISH_TYPES;
  var FISH_RARITY = KD.FISH_RARITY;
  var TRASH = KD.TRASH;
  var ROD_LEVELS = KD.ROD_LEVELS;

  var cv = null, cx = null, raf = null;
  var fishes = [], hook = { x: 0, y: 0, vy: 0, state: 'idle', caughtEm: '', caughtSize: 28, targetX: 0, targetY: 0 };
  var sc = 0, cnt = 0, tl = 30, countdown = null;
  var diff = 'normal', caughtArr = [], W = 0, H = 0;
  var ripple = [], nibbleTimer = null, combo = 0;
  var rodLv = 1, rodExp = 0, bubbles = [], time = 0, nibbleFish = null;

  function fishInit() {
    var SD = App.SD;
    if (!SD.fishCodex) SD.fishCodex = [];
    rodLv = SD.fishRodLv || 1;
    rodExp = SD.fishRodExp || 0;
    $id('fish-start-screen').style.display = 'flex';
    $id('fish-game').style.display = 'none';
    var rod = ROD_LEVELS[rodLv - 1];
    setText('fish-start-rod', rod.em);
    setText('fish-start-rodname', rod.name + ' Lv.' + rodLv);
    setText('fish-best', String(SD.fishBestSc || 0));
    stop();
  }

  function diffSel() {
    $id('fish-start-screen').style.display = 'flex';
    $id('fish-game').style.display = 'none';
    stop();
  }

  function begin(d) {
    diff = d;
    $id('fish-start-screen').style.display = 'none';
    $id('fish-game').style.display = 'flex';
    beginCur();
  }

  function beginCur() {
    stop();
    var SD = App.SD;
    sc = 0; cnt = 0; combo = 0; caughtArr = [];
    rodLv = SD.fishRodLv || 1;
    rodExp = SD.fishRodExp || 0;
    tl = diff === 'easy' ? 45 : diff === 'normal' ? 30 : 20;
    ['fish-sc', 'fish-cnt', 'fish-combo'].forEach(function (id) { setText(id, '0'); });
    setText('fish-tm', String(tl));
    $id('fish-caught-list').innerHTML = '';
    setText('fish-msg', '🎣 낚기 버튼을 탭하세요!');
    var btn = $id('fish-cast-btn');
    btn.textContent = '🎣 낚기!';
    btn.className = '';
    btn.disabled = false;
    updRodUI();

    cv = $id('fish-canvas');
    cx = cv.getContext('2d');
    var vw = Math.min(window.innerWidth, 440);
    W = vw - 20;
    var usedH = 48 + 35 + 30 + 42 + 28 + 56 + 46;
    H = Math.min(Math.floor(W * 0.62), window.innerHeight - usedH, 260);
    H = Math.max(160, H);
    cv.width = W;
    cv.height = H;

    hook = { x: W * 0.65, y: H * 0.1, vy: 0, state: 'idle', caughtEm: '', caughtSize: 28, targetX: W * 0.5, targetY: H * 0.3 };
    fishes = []; ripple = []; bubbles = []; time = 0;
    for (var i = 0; i < 7; i++) spawnFish();

    countdown = setInterval(function () {
      tl--;
      setText('fish-tm', String(tl));
      if (tl <= 0) {
        stop();
        btn.disabled = true;
        btn.textContent = '⏰ 종료!';
        setText('fish-msg', '종료! ' + sc + '점 🏆');
        if (SD.fishBestSc === undefined || sc > SD.fishBestSc) {
          SD.fishBestSc = sc;
          setText('fish-best', String(sc));
        }
        App.writeSave();
        if (cnt > 0) setTimeout(function () { App.earnReward('🎣', '낚시 ' + cnt + '마리 ' + sc + '점! 🐠'); }, 400);
        else App.showSp('🎣', '다음엔 꼭 잡아봐요! 💪');
      }
    }, 1000);
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    clearInterval(countdown); countdown = null;
    clearTimeout(nibbleTimer); nibbleTimer = null;
  }

  function spawnFish() {
    var rodBonus = rodLv - 1;
    var pool = [];
    FISH_TYPES.forEach(function (f) {
      var w = Math.max(1, f.w + (f.rare > 0 ? rodBonus * 2 : 0));
      for (var i = 0; i < w; i++) pool.push(f);
    });
    var type = pool[Math.floor(Math.random() * pool.length)];
    var dir = Math.random() < 0.5 ? 1 : -1;
    var baseSpd = diff === 'easy' ? 0.6 : diff === 'normal' ? 1.1 : 1.8;
    var spd = baseSpd * type.spd * (0.7 + Math.random() * 0.6);
    var size = type.rare === 3 ? 40 : type.rare === 2 ? 34 : type.rare === 1 ? 30 : 24 + Math.random() * 8;
    fishes.push({
      id: type.id, em: type.em, name: type.name, pts: type.pts, rare: type.rare,
      x: dir === 1 ? -50 : W + 50, y: H * (0.32 + Math.random() * 0.55), dir: dir, spd: spd,
      size: size, bobOff: Math.random() * Math.PI * 2, hooked: false, glowPhase: Math.random() * Math.PI * 2
    });
  }

  function loop() {
    if (!cx) return;
    time += 0.016;
    draw();
    raf = requestAnimationFrame(loop);
  }

  function draw() {
    var ctx = cx, t = time;
    ctx.clearRect(0, 0, W, H);
    var sky = ctx.createLinearGradient(0, 0, 0, H * 0.3);
    sky.addColorStop(0, '#0a1628'); sky.addColorStop(1, '#0d2137');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.3);

    [[0.1, 0.05], [0.3, 0.1], [0.5, 0.04], [0.7, 0.08], [0.85, 0.05], [0.2, 0.15], [0.6, 0.12], [0.9, 0.14]].forEach(function (p) {
      ctx.globalAlpha = (Math.sin(t * 2 + p[0] * 10) * 0.3 + 0.7) * 0.55;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, 1.2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#FFF9E6';
    ctx.shadowColor = 'rgba(255,240,150,.5)'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(0.12 * W, 0.1 * H, W * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    var sea = ctx.createLinearGradient(0, H * 0.3, 0, H);
    sea.addColorStop(0, '#0a3d5c'); sea.addColorStop(0.5, '#073050'); sea.addColorStop(1, '#040f1a');
    ctx.fillStyle = sea; ctx.fillRect(0, H * 0.3, W, H * 0.7);

    for (var layer = 0; layer < 3; layer++) {
      ctx.strokeStyle = 'rgba(100,200,255,' + (0.12 - layer * 0.03) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var x = 0; x <= W; x += 4) {
        var y = H * 0.3 + Math.sin(x / W * Math.PI * 6 + t * (0.8 + layer * 0.3) + layer * 1.2) * (2 + layer);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (Math.random() < 0.03) bubbles.push({ x: Math.random() * W, y: H, r: 1 + Math.random() * 2.5, vy: 0.5 + Math.random() });
    bubbles = bubbles.filter(function (b) {
      b.y -= b.vy;
      b.x += Math.sin(t * 2 + b.y) * 0.3;
      if (b.y < H * 0.3) return false;
      ctx.strokeStyle = 'rgba(150,220,255,.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      return true;
    });

    var rodX = W * 0.78;
    ctx.strokeStyle = '#8B5E3C'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(W * 0.86, H * 0.28); ctx.lineTo(rodX, H * 0.06); ctx.stroke();

    var hookY = hook.state === 'idle' ? H * 0.3 : hook.y;
    ctx.strokeStyle = 'rgba(200,200,200,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rodX, H * 0.06); ctx.lineTo(hook.x, hookY); ctx.stroke();

    if (hook.state === 'sinking' || hook.state === 'waiting' || hook.state === 'nibbling') {
      ctx.strokeStyle = 'rgba(200,200,200,.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(hook.x, H * 0.3); ctx.lineTo(hook.x, hook.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (hook.state === 'idle') {
      hook.y = H * 0.3;
      hook.x = rodX - W * 0.12;
      drawFloat(ctx, hook.x, hook.y + Math.sin(t * 2) * 2, false);
    } else if (hook.state === 'casting') {
      hook.y += hook.vy; hook.vy += 0.5;
      hook.x += (hook.targetX - hook.x) * 0.08;
      if (hook.y >= H * 0.3) { hook.y = H * 0.3; hook.state = 'sinking'; }
      drawFloat(ctx, hook.x, hook.y, false);
    } else if (hook.state === 'sinking') {
      hook.y += (hook.targetY - hook.y) * 0.04 + 0.6;
      if (hook.y >= hook.targetY) { hook.y = hook.targetY; hook.state = 'waiting'; }
      drawHook(ctx, hook.x, hook.y, false);
    } else if (hook.state === 'waiting') {
      drawHook(ctx, hook.x, hook.y + Math.sin(t * 1.2) * 1.5, false);
    } else if (hook.state === 'nibbling') {
      var sh = Math.sin(t * 15) * 5;
      drawHook(ctx, hook.x + sh, hook.y + sh * 0.5, true);
    } else if (hook.state === 'reeling') {
      hook.y -= 7;
      if (hook.y < H * 0.06) { hook.state = 'idle'; hook.y = H * 0.3; }
      ctx.font = hook.caughtSize + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(hook.x, hook.y);
      ctx.rotate(Math.sin(t * 5) * 0.3);
      ctx.fillText(hook.caughtEm, 0, 0);
      ctx.restore();
    }

    fishes.forEach(function (f) {
      if (f.hooked) return;
      f.x += f.spd * f.dir;
      var bob = Math.sin(t * 1.5 + f.bobOff) * 3;
      if (f.x > W + 70) { f.x = -50; f.y = H * (0.32 + Math.random() * 0.55); }
      if (f.x < -70) { f.x = W + 50; f.y = H * (0.32 + Math.random() * 0.55); }
      ctx.save();
      ctx.translate(f.x, f.y + bob);
      if (f.dir < 0) ctx.scale(-1, 1);
      if (f.rare === 3) { ctx.shadowColor = 'rgba(255,215,61,.8)'; ctx.shadowBlur = 14 * (Math.sin(t * 3 + f.glowPhase) * 0.4 + 0.6); }
      else if (f.rare === 2) { ctx.shadowColor = 'rgba(160,100,255,.6)'; ctx.shadowBlur = 7; }
      else if (f.rare === 1) { ctx.shadowColor = 'rgba(100,200,255,.4)'; ctx.shadowBlur = 4; }
      ctx.font = f.size + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.em, 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();

      if (hook.state === 'waiting' || hook.state === 'sinking') {
        var dx = f.x - hook.x, dy = (f.y + bob) - hook.y;
        if (Math.sqrt(dx * dx + dy * dy) < f.size * 0.7) nibble(f);
      }
    });

    ripple = ripple.filter(function (r) {
      r.life--;
      r.y -= 1.5;
      ctx.globalAlpha = r.life / 25;
      ctx.fillStyle = r.rare === 3 ? '#FFD93D' : r.rare === 2 ? '#d0aaff' : r.rare === 1 ? '#80ffcc' : '#fff';
      ctx.font = 'bold ' + (r.rare >= 2 ? '1.1' : '0.9') + 'rem Jua,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+' + r.pts, r.x, r.y);
      ctx.globalAlpha = 1;
      return r.life > 0;
    });
  }

  function drawFloat(ctx, x, y, ex) {
    ctx.fillStyle = ex ? '#FFD93D' : '#FF5722';
    ctx.beginPath(); ctx.ellipse(x, y, 4, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x, y - 5, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (ex) {
      for (var r = 1; r <= 2; r++) {
        ctx.strokeStyle = 'rgba(255,215,61,' + (0.4 / r) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y, 10 * r, 3 * r, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  function drawHook(ctx, x, y, ex) {
    ctx.strokeStyle = ex ? 'rgba(255,215,61,.9)' : 'rgba(200,220,255,.65)';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 4); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 3, y + 4, 3, Math.PI, Math.PI * 2); ctx.stroke();
    if (ex) {
      for (var r = 1; r <= 2; r++) {
        ctx.strokeStyle = 'rgba(255,215,61,' + (0.35 / r) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, 6 * r, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  function nibble(f) {
    if (hook.state !== 'waiting' && hook.state !== 'sinking') return;
    hook.state = 'nibbling';
    nibbleFish = f;
    setText('fish-msg', f.rare === 3 ? '⚡⚡ 전설이다!! 지금!' : f.rare === 2 ? '💫 희귀어! 빨리!' : f.rare === 1 ? '✨ 왔어요! 탭!' : '🎣 지금! 탭!');
    var btn = $id('fish-cast-btn');
    btn.textContent = '⚡ 낚아채기!';
    btn.className = 'nibble';
    Util.beep('ok');
    var timeout = f.rare === 3 ? 2500 : f.rare === 2 ? 2000 : 1500;
    nibbleTimer = setTimeout(function () {
      if (hook.state === 'nibbling') {
        hook.state = 'waiting';
        nibbleFish = null;
        btn.textContent = '🎣 낚기!';
        btn.className = '';
        setText('fish-msg', '😢 놓쳤어요! 다시 해봐요');
        combo = 0;
        setText('fish-combo', '0');
      }
    }, timeout);
  }

  function cast() {
    if (tl <= 0) return;
    var state = hook.state;
    var btn = $id('fish-cast-btn');
    if (state === 'idle') {
      hook.targetX = W * (0.25 + Math.random() * 0.5);
      hook.targetY = H * (0.35 + Math.random() * 0.55);
      hook.x = hook.targetX;
      hook.y = 0;
      hook.vy = -3;
      hook.state = 'casting';
      var dp = Math.round((hook.targetY / H - 0.3) / 0.55 * 100);
      setText('fish-msg', '🎣 깊이 ' + dp + '%!');
      btn.textContent = '⏳ 가라앉는 중...';
      btn.className = '';
    } else if (state === 'nibbling') {
      clearTimeout(nibbleTimer);
      var f = nibbleFish || fishes.filter(function (ff) { return !ff.hooked && Math.abs(ff.x - hook.x) < 100; })[0];
      if (!f) return;
      f.hooked = true;
      hook.caughtEm = f.em;
      hook.caughtSize = f.size;
      hook.state = 'reeling';
      combo++;
      var rod = ROD_LEVELS[rodLv - 1];
      var pts = f.pts + rod.bonus + (combo >= 3 ? 10 : 0);
      sc += pts;
      cnt++;
      var SD = App.SD;
      SD.fishCaught = (SD.fishCaught || 0) + 1;
      caughtArr.push(f.em);
      if (!SD.fishCodex) SD.fishCodex = [];
      if (SD.fishCodex.indexOf(f.id) < 0) SD.fishCodex.push(f.id);
      rodExp++;
      var curRod = ROD_LEVELS[rodLv - 1];
      if (rodExp >= curRod.needExp && rodLv < ROD_LEVELS.length) {
        rodLv++;
        rodExp = 0;
        SD.fishRodLv = rodLv;
        SD.fishRodExp = 0;
        App.showSp(ROD_LEVELS[rodLv - 1].em, '낚싯대 레벨업! ' + ROD_LEVELS[rodLv - 1].name + '! 🎉');
      } else {
        SD.fishRodLv = rodLv;
        SD.fishRodExp = rodExp;
      }
      updRodUI();
      setText('fish-sc', String(sc));
      setText('fish-cnt', String(cnt));
      setText('fish-combo', String(combo));
      var li = document.createElement('span');
      li.textContent = f.em;
      li.title = f.name;
      if (f.rare >= 2) li.style.filter = 'drop-shadow(0 0 4px gold)';
      $id('fish-caught-list').appendChild(li);
      setText('fish-msg', (f.rare === 3 ? '🏆전설!' : f.rare === 2 ? '💫슈퍼레어!' : f.rare === 1 ? '✨희귀!' : '') + ' ' + f.name + ' +' + pts + '점!');
      btn.textContent = '🎣 낚기!';
      btn.className = '';
      ripple.push({ x: hook.x, y: hook.y, pts: pts, rare: f.rare, life: 25 });
      Util.beep('win');
      App.writeSave();
      App.checkAch();
      setTimeout(function () {
        f.hooked = false;
        f.x = -50;
        spawnFish();
      }, 2500);
    } else if (state === 'waiting') {
      if (Math.random() < 0.12) {
        var tr = TRASH[Math.floor(Math.random() * TRASH.length)];
        hook.caughtEm = tr.em;
        hook.caughtSize = 24;
        hook.state = 'reeling';
        setText('fish-msg', '😅 ' + tr.name + '이 걸렸네요!');
        btn.textContent = '🎣 낚기!';
        btn.className = '';
        Util.beep('ng');
        combo = 0;
        setText('fish-combo', '0');
      } else {
        setText('fish-msg', '🐟 아직 없어요! 기다려요~');
      }
    } else if (state === 'reeling') {
      setText('fish-msg', '🎣 끌어올리는 중!');
    }
  }

  function updRodUI() {
    var rod = ROD_LEVELS[rodLv - 1];
    var pct = rodLv >= ROD_LEVELS.length ? 100 : Math.round(rodExp / rod.needExp * 100);
    setText('fish-rod-icon', rod.em);
    setText('fish-rod-name', rod.name);
    setText('fish-rod-lv', 'Lv.' + rodLv);
    var f = $id('fish-rod-expfill');
    if (f) f.style.width = pct + '%';
  }

  function openCodex() {
    var SD = App.SD;
    if (!SD.fishCodex) SD.fishCodex = [];
    var grid = $id('fish-codex-grid');
    grid.innerHTML = '';
    setText('fish-codex-count', SD.fishCodex.length + '/' + FISH_TYPES.length + ' 발견');
    FISH_TYPES.forEach(function (f) {
      var caught = SD.fishCodex.indexOf(f.id) >= 0;
      var item = document.createElement('div');
      item.className = 'fish-codex-item' + (caught ? ' caught' : '');
      item.innerHTML = caught
        ? '<span class="fish-codex-em">' + f.em + '</span><div class="fish-codex-name">' + f.name + '</div><div class="fish-codex-pts">' + f.pts + 'pt</div><div class="fish-codex-rare">' + FISH_RARITY[f.rare] + '</div>'
        : '<span class="fish-codex-em" style="opacity:.3;">❓</span><div class="fish-codex-name">???</div>';
      grid.appendChild(item);
    });
    $id('fish-codex').classList.add('show');
  }

  function open() {
    App.show('fishing');
    fishInit();
  }

  window.Fishing = {
    begin: begin, beginCur: beginCur, stop: stop, cast: cast,
    diffSel: diffSel, openCodex: openCodex
  };
  App.openFishing = open;
  App.onLeave.push(stop);
})();
