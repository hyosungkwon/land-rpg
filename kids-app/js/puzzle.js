/* kids-app/js/puzzle.js — 🧩 퍼즐 (30스테이지)
   그림 조각을 골라 빈 칸에 놓는 놀이. 원본 kids-app 의 퍼즐을 그대로 옮기고
   소리·격려 문구를 다듬었습니다. */
(function () {
  'use strict';

  var P_WORLDS = window.KD.P_WORLDS;
  var P_STAGES = window.KD.P_STAGES;
  var Util = window.Util;
  var App = window.App;

  var curStage = 1, px = 80, sc = 0, el = 0, tid = null, sel = null, bd = [],
    hintUsed = false, big = null, errCnt = 0, n = 2;

  function $id(x) { return document.getElementById(x); }
  function setText(x, v) { var e = $id(x); if (e) e.textContent = v; }

  function clearTimer() { clearInterval(tid); tid = null; }

  function showMap() {
    $id('p-stage-map').style.display = 'flex';
    $id('p-loading').style.display = 'none';
    $id('p-game').style.display = 'none';
    buildMap();
  }

  function buildMap() {
    var SD = App.SD;
    if (!SD.pCleared) SD.pCleared = {};
    if (!SD.pStars) SD.pStars = {};
    var map = $id('p-stage-map');
    map.innerHTML = '';
    setText('p-stage-title', '🧩 퍼즐');
    P_WORLDS.forEach(function (world) {
      var wl = document.createElement('div');
      wl.className = 'p-world-label';
      wl.style.color = world.color;
      wl.textContent = world.name;
      map.appendChild(wl);
      var row = document.createElement('div');
      row.className = 'p-stage-row';
      world.stages.forEach(function (stage, si) {
        var sn = stage.n;
        var cleared = SD.pCleared[sn];
        var unlocked = sn === 1 || SD.pCleared[sn - 1];
        var st = SD.pStars[sn] || 0;
        var btn = document.createElement('button');
        btn.className = 'p-stage-btn ' + (cleared ? 'cleared' : unlocked ? 'available' : 'locked');
        if (!unlocked) {
          btn.innerHTML = '<span class="p-stage-lock">🔒</span><span class="p-stage-num">' + sn + '</span>';
          btn.disabled = true;
        } else {
          var ss = cleared ? Util.stars(st) : '';
          btn.innerHTML = '<span class="p-stage-icon">' + stage.emoji + '</span><span class="p-stage-num">' + sn + '단계</span><span class="p-stage-stars">' + ss + '</span>';
          btn.onclick = function () { selectStage(sn); };
        }
        row.appendChild(btn);
        if (si < world.stages.length - 1) {
          var c = document.createElement('div');
          c.style.cssText = 'width:16px;height:2px;background:rgba(255,255,255,.12);align-self:center;';
          row.appendChild(c);
        }
      });
      map.appendChild(row);
    });
  }

  function cacheKey(k) { return 'pimg_v2_' + k; }

  function selectStage(k) {
    curStage = k;
    var stage = P_STAGES[k - 1];
    n = stage.grid;
    var T = Math.min(window.innerWidth, 420) - 32;
    $id('p-stage-map').style.display = 'none';
    $id('p-loading').style.display = 'flex';
    $id('p-game').style.display = 'none';
    $id('p-loading-sub').textContent = stage.subject + ' 이미지 불러오는 중...';
    var cached = null;
    try { cached = localStorage.getItem(cacheKey(k)); } catch (e) {}
    var done = function () {
      $id('p-loading').style.display = 'none';
      $id('p-game').style.display = 'flex';
      setText('p-stage-title', '스테이지 ' + k + ' — ' + stage.subject);
      startGame();
    };
    if (cached) {
      loadFromCache(cached, T).then(done, done);
    } else {
      loadFromURL(stage.img, T, k).then(function (ok) {
        if (!ok) drawFallback(stage, T);
        done();
      }, function () { drawFallback(stage, T); done(); });
    }
  }

  function loadFromURL(url, T, k) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var timer = setTimeout(function () { resolve(false); }, 8000);
      img.onload = function () {
        clearTimeout(timer);
        big = document.createElement('canvas');
        big.width = T; big.height = T;
        var ctx = big.getContext('2d');
        var s = Math.min(img.naturalWidth, img.naturalHeight);
        var ox = (img.naturalWidth - s) / 2, oy = (img.naturalHeight - s) / 2;
        ctx.drawImage(img, ox, oy, s, s, 0, 0, T, T);
        addGridLines(ctx, T);
        try { localStorage.setItem(cacheKey(k), big.toDataURL('image/jpeg', 0.85)); } catch (e) {}
        resolve(true);
      };
      img.onerror = function () { clearTimeout(timer); resolve(false); };
      img.src = url;
    });
  }

  function loadFromCache(base64, T) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        big = document.createElement('canvas');
        big.width = T; big.height = T;
        var ctx = big.getContext('2d');
        ctx.drawImage(img, 0, 0, T, T);
        addGridLines(ctx, T);
        resolve();
      };
      img.onerror = resolve;
      img.src = base64;
    });
  }

  function drawFallback(stage, T) {
    big = document.createElement('canvas');
    big.width = T; big.height = T;
    var ctx = big.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, T, T);
    var cols = [['#ffe8cc', '#ffd0a0'], ['#d4f1d4', '#a8e4a8'], ['#e8eaf6', '#c5cae9'], ['#fce4ec', '#f8bbd0'], ['#e0f7fa', '#b2ebf2'], ['#fff9c4', '#fff176']];
    var pair = cols[stage.n % cols.length];
    g.addColorStop(0, pair[0]); g.addColorStop(1, pair[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, T, T);
    ctx.font = (T * 0.58) + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(stage.emoji, T / 2, T * 0.48);
    ctx.font = 'bold ' + (T * 0.07) + 'px Jua,sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillText(stage.subject, T / 2, T * 0.84);
    addGridLines(ctx, T);
  }

  function addGridLines(ctx, total) {
    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.lineWidth = 3;
    for (var i = 1; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(i * total / n, 0); ctx.lineTo(i * total / n, total); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * total / n); ctx.lineTo(total, i * total / n); ctx.stroke();
    }
  }

  function startGame() {
    hintUsed = false; sel = null; sc = 0; el = 0; errCnt = 0;
    clearTimer();
    ['p-tm', 'p-sc', 'p-err'].forEach(function (id) { setText(id, '0'); });
    tid = setInterval(function () { el++; setText('p-tm', String(el)); }, 1000);
    var vw = window.innerWidth, vh = window.innerHeight;
    var usedH = 48 + 30 + 50 + 40;
    var availH = vh - usedH;
    var boardAreaW = vw - 80 - 32;
    px = Math.max(34, Math.min(Math.floor(boardAreaW / n), Math.floor(availH / n), 100));
    var prevSz = Math.min(px * 1.1, 70);
    var pv = $id('p-prev-canvas');
    if (pv) {
      pv.width = prevSz; pv.height = prevSz;
      pv.style.width = prevSz + 'px'; pv.style.height = prevSz + 'px';
      pv.getContext('2d').drawImage(big, 0, 0, prevSz, prevSz);
    }
    mkBoard();
    mkTray();
    guide('조각을 먼저 선택해 주세요!');
  }

  function slice(pid) {
    var r = Math.floor(pid / n), c = pid % n;
    var pc = document.createElement('canvas');
    pc.width = px; pc.height = px;
    var srcSz = big.width / n;
    pc.getContext('2d').drawImage(big, c * srcSz, r * srcSz, srcSz, srcSz, 0, 0, px, px);
    return pc;
  }

  function mkBoard() {
    var e = $id('p-board');
    e.style.gridTemplateColumns = 'repeat(' + n + ',' + px + 'px)';
    e.innerHTML = '';
    bd = new Array(n * n).fill(-1);
    for (var i = 0; i < n * n; i++) {
      var c = document.createElement('div');
      c.className = 'pcell';
      c.id = 'pcell-' + i;
      c.style.width = px + 'px';
      c.style.height = px + 'px';
      c.onclick = (function (k) { return function () { tapCell(k); }; })(i);
      e.appendChild(c);
    }
  }

  function mkTray() {
    var e = $id('p-tray');
    e.innerHTML = '';
    sel = null;
    var ids = [];
    for (var i = 0; i < n * n; i++) ids.push(i);
    Util.shuffle(ids).forEach(function (pid) {
      var p = document.createElement('div');
      p.className = 'ppiece';
      p.id = 'ppiece-' + pid;
      p.style.width = px + 'px';
      p.style.height = px + 'px';
      p.appendChild(slice(pid));
      p.onclick = function () { tapPiece(pid); };
      e.appendChild(p);
    });
  }

  function tapPiece(pid) {
    var e = $id('ppiece-' + pid);
    if (!e || e.classList.contains('used')) return;
    if (sel === pid) {
      e.classList.remove('sel'); sel = null; clrHL();
      guide('조각을 먼저 선택해 주세요!');
      return;
    }
    clrSel();
    e.classList.add('sel');
    sel = pid;
    hlCells();
    guide('✅ 선택! 빈 칸을 탭하세요!');
  }

  function tapCell(idx) {
    if (sel === null) { flash('pcell-' + idx, 'wf'); guide('👆 먼저 조각을 선택하세요!'); return; }
    if (bd[idx] !== -1) { flash('pcell-' + idx, 'wf'); guide('이미 채워진 칸이에요!'); return; }
    var pid = sel;
    if (pid === idx) {
      placeOn(idx, pid);
      flash('pcell-' + idx, 'cf');
      sc += hintUsed ? 5 : 10;
      setText('p-sc', String(sc));
      Util.beep('ok');
      clrSel(); clrHL();
      guide('🎉 맞았어요!');
      chkWin();
    } else {
      flash('pcell-' + idx, 'wf');
      errCnt++;
      setText('p-err', String(errCnt));
      sc = Math.max(0, sc - 2);
      setText('p-sc', String(sc));
      Util.beep('ng');
      guide(errCnt < 3 ? '❌ 앗, 다시 한 번 볼까요?' : '❌ 괜찮아요, 천천히 해봐요!');
    }
  }

  function placeOn(idx, pid) {
    bd[idx] = pid;
    var ce = $id('pcell-' + idx), pe = $id('ppiece-' + pid);
    ce.innerHTML = '';
    ce.className = 'pcell filled';
    ce.appendChild(slice(pid));
    pe.classList.add('used');
    sel = null;
  }

  function chkWin() {
    for (var i = 0; i < n * n; i++) if (bd[i] !== i) return;
    clearTimer();
    var SD = App.SD;
    if (!SD.pCleared) SD.pCleared = {};
    if (!SD.pStars) SD.pStars = {};
    if (!SD.pTotalSc) SD.pTotalSc = 0;
    SD.pCleared[curStage] = true;
    var st = errCnt === 0 ? 3 : errCnt <= 3 ? 2 : 1;
    if ((SD.pStars[curStage] || 0) < st) SD.pStars[curStage] = st;
    SD.pTotalSc += sc;
    SD.puzzleDone = (SD.puzzleDone || 0) + 1;
    App.writeSave();
    App.checkAch();

    setTimeout(function () {
      Util.doConfetti();
      Util.beep('win');
      setText('ov-e', '🎉');
      setText('ov-s', Util.stars(st));
      setText('ov-t', '스테이지 ' + curStage + ' 완성!');
      setText('ov-m', el + '초 · 오류' + errCnt + '회 · ' + sc + '점');
      var btns = $id('ov-btns');
      btns.innerHTML = '';
      if (curStage < 30) {
        var b1 = document.createElement('button');
        b1.className = 'gbtn gg';
        b1.textContent = '다음 ▶';
        b1.onclick = function () { App.closeOverlay(); selectStage(curStage + 1); };
        btns.appendChild(b1);
      }
      var b2 = document.createElement('button');
      b2.className = 'gbtn go';
      b2.textContent = '다시 🔄';
      b2.onclick = function () { App.closeOverlay(); selectStage(curStage); };
      btns.appendChild(b2);
      var b3 = document.createElement('button');
      b3.className = 'gbtn gb';
      b3.textContent = '맵 🗺';
      b3.onclick = function () { App.closeOverlay(); showMap(); };
      btns.appendChild(b3);
      $id('overlay').classList.add('show');
      setTimeout(function () {
        App.earnReward('🧩', '스테이지 ' + curStage + ' 완성! ' + Util.stars(st));
      }, 300);
    }, 400);
  }

  function shuffleTray() {
    var t = $id('p-tray');
    var kids = Array.prototype.slice.call(t.children).filter(function (p) { return !p.classList.contains('used'); });
    Util.shuffle(kids).forEach(function (p) { t.appendChild(p); });
    clrSel();
    guide('섞었어요!');
  }

  function hint() {
    hintUsed = true;
    for (var i = 0; i < n * n; i++) {
      if (bd[i] === -1) {
        var pe = $id('ppiece-' + i);
        if (pe && !pe.classList.contains('used')) {
          var on = true, cnt = 0;
          var t = setInterval(function () {
            pe.style.outline = on ? '3px solid #FFD93D' : 'none';
            on = !on; cnt++;
            if (cnt > 9) { clearInterval(t); pe.style.outline = ''; }
          }, 160);
          guide('💡 노란 테두리 조각이 힌트!');
        }
        break;
      }
    }
  }

  function guide(t) { setText('p-guide', t); }

  function clrSel() {
    if (sel !== null) {
      var e = $id('ppiece-' + sel);
      if (e) e.classList.remove('sel');
      sel = null;
    }
    clrHL();
  }
  function hlCells() {
    for (var i = 0; i < n * n; i++) {
      if (bd[i] === -1) {
        var e = $id('pcell-' + i);
        if (e) e.classList.add('hl');
      }
    }
  }
  function clrHL() {
    var els = document.querySelectorAll('.pcell.hl');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('hl');
  }
  function flash(id, cls) {
    var e = $id(id);
    if (!e) return;
    e.classList.remove(cls);
    void e.offsetWidth;
    e.classList.add(cls);
    setTimeout(function () { e.classList.remove(cls); }, 400);
  }

  function open() {
    App.show('puzzle');
    if (!App.SD.pCleared) App.SD.pCleared = {};
    var cur = 1;
    for (var i = 1; i <= 30; i++) if (App.SD.pCleared[i]) cur = Math.min(i + 1, 30);
    curStage = cur;
    clearTimer();
    showMap();
  }

  window.Puzzle = { open: open, showMap: showMap, hint: hint, shuffleTray: shuffleTray };
  App.openPuzzle = open;
  App.onLeave.push(clearTimer);
})();
