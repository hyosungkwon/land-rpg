/* kids-app/js/exhibit.js — 🖼️ 내 작품 전시관 (통합 앨범)
   그림 놀이가 모으는 앨범(yua-draw-gallery-v1)과 색칠하기가 모으는 앨범
   (kidsapp-color-gallery-v1)을 한 화면에 날짜 순으로 모아 보여 준다.
   · 크게 보기 · PNG 저장 · 지우기(두 번 확인)
   · 색칠하기는 art.js 가 저장할 때 Exhibit.addColor() 로 이 앨범에 담는다.
   저장 키는 예전 그림 놀이 앨범 키를 그대로 써서 기존에 모은 그림도 그대로 나온다. */
(function () {
  'use strict';

  var App = window.App;

  var DRAW_KEY = 'yua-draw-gallery-v1';        /* 그림 놀이(예전 yua-draw) 앨범 */
  var COLOR_KEY = 'kidsapp-color-gallery-v1';  /* 색칠하기 앨범(3단계에서 새로 생김) */
  var COLOR_MAX = 24;                          /* 색칠 작품은 최근 24개까지 */
  var filter = 'all';                          /* all | draw | color */
  var viewing = null;

  function $(id) { return document.getElementById(id); }
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }

  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function isToday(ts) {
    if (!ts) return false;
    return todayKey(new Date(ts)) === todayKey();
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateLabel(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function readList(key) {
    try {
      var a = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function writeList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); return true; } catch (e) { return false; }
  }

  /* ── 앨범 읽기 ─────────────────────────────────── */

  function drawEntries() {
    var out = [];
    readList(DRAW_KEY).forEach(function (it) {
      if (!it || !it.img) return;
      var free = !it.pct;
      out.push({
        type: 'draw', id: String(it.id || ''), emoji: it.emoji || '🎨',
        title: (it.word || '그림'), pct: free ? 0 : it.pct, free: free,
        stars: it.stars || 0, ts: it.ts || 0, img: it.img
      });
    });
    return out;
  }

  function colorEntries() {
    var out = [];
    readList(COLOR_KEY).forEach(function (it) {
      if (!it || !it.img) return;
      out.push({
        type: 'color', id: String(it.id || ''), emoji: it.emoji || '🖍️',
        title: (it.name || '색칠 작품'), pct: 0, free: false,
        stars: 0, ts: it.ts || 0, img: it.img
      });
    });
    return out;
  }

  function allEntries() {
    return drawEntries().concat(colorEntries()).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }

  function counts() {
    var d = drawEntries().length, c = colorEntries().length;
    return { all: d + c, draw: d, color: c };
  }

  /* ── 색칠 작품 담기(art.js 가 부른다) ───────────── */

  function addColor(payload) {
    if (!payload || !payload.img) return null;
    var list = readList(COLOR_KEY);
    var id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    list.unshift({
      id: id,
      name: payload.name || '색칠 작품',
      emoji: payload.emoji || '🖍️',
      img: payload.img,
      ts: Date.now()
    });
    if (list.length > COLOR_MAX) list = list.slice(0, COLOR_MAX);
    for (var i = 0; i < 4; i++) {
      if (writeList(COLOR_KEY, list)) { refreshCount(); return id; }
      if (list.length <= 1) return null;
      list = list.slice(0, Math.max(1, list.length - 4));   /* 저장 공간이 모자라면 오래된 것부터 */
    }
    return null;
  }

  /* ── 화면 ─────────────────────────────────────── */

  function itemBadge(it) {
    if (it.type === 'color') return '🖍️ 색칠';
    if (it.free) return '✏️ 자유';
    return it.pct + '%';
  }

  function buildItem(it) {
    var btn = document.createElement('button');
    btn.className = 'ex-item';
    btn.type = 'button';
    btn.setAttribute('aria-label', it.title + ' 크게 보기');

    var img = document.createElement('img');
    img.src = it.img;
    img.alt = it.title;
    img.loading = 'lazy';
    btn.appendChild(img);

    var badge = document.createElement('span');
    badge.className = 'ex-badge' + (it.type === 'color' ? ' color' : (it.free ? ' free' : ''));
    badge.textContent = itemBadge(it);
    btn.appendChild(badge);

    var kind = document.createElement('span');
    kind.className = 'ex-kind';
    kind.textContent = it.emoji;
    btn.appendChild(kind);

    btn.addEventListener('click', function () { openView(it); });
    return btn;
  }

  function render() {
    var grid = $('ex-grid');
    if (!grid) return;
    var list = allEntries();
    var c = { all: list.length, draw: 0, color: 0 };
    list.forEach(function (it) { c[it.type]++; });

    setText('ex-n-all', String(c.all));
    setText('ex-n-draw', String(c.draw));
    setText('ex-n-color', String(c.color));
    setText('ex-total', c.all + '개');
    setText('ex-count-chip', String(c.all));

    var tabs = document.querySelectorAll('#ex-tabs .ex-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-filter') === filter);
    }

    var shown = filter === 'all' ? list : list.filter(function (it) { return it.type === filter; });
    grid.innerHTML = '';
    if (!shown.length) {
      var empty = document.createElement('div');
      empty.className = 'ex-empty';
      empty.textContent = c.all
        ? (filter === 'draw' ? '🎨 그림 놀이 작품이 아직 없어요.\n그림을 그려 저장하면 여기에 모여요!'
          : '🖍️ 색칠 작품이 아직 없어요.\n색칠하고 💾 저장! 을 누르면 여기에 모여요!')
        : '아직 내 작품이 없어요.\n\n🎨 그림 놀이에서 그림을 그리거나\n🖍️ 색칠하기에서 저장하면\n한 앨범에 차곡차곡 모여요!';
      grid.appendChild(empty);
      return;
    }
    shown.forEach(function (it) { grid.appendChild(buildItem(it)); });
  }

  function open() {
    filter = 'all';
    render();
    note('');
    if (App) App.show('exhibit');
  }

  function close() { if (App) App.home(); }

  function setFilter(f) {
    filter = (f === 'draw' || f === 'color') ? f : 'all';
    render();
  }

  var noteTid = null;
  function note(msg) {
    var n = $('ex-note');
    if (!n) return;
    n.textContent = msg || '';
    if (noteTid) clearTimeout(noteTid);
    if (msg) noteTid = setTimeout(function () { n.textContent = ''; }, 2200);
  }

  /* ── 크게 보기 ─────────────────────────────────── */

  function openView(it) {
    viewing = it;
    var card = $('exhibit-view').querySelector('.exv-card');
    if (card) card.classList.remove('shake');
    setText('exv-title', it.emoji + ' ' + it.title);
    var img = $('exv-img');
    if (img) { img.src = it.img; img.alt = it.title; }
    var meta = it.type === 'color'
      ? (dateLabel(it.ts) + ' · 색칠 작품')
      : (dateLabel(it.ts) + (it.free ? ' · 자유 그림' : ' · 주제 일치율 ' + it.pct + '%'));
    setText('exv-meta', meta);
    cancelDelete();
    var view = $('exhibit-view');
    if (view) view.classList.add('show');
  }

  function closeView() {
    viewing = null;
    var view = $('exhibit-view');
    if (view) view.classList.remove('show');
  }

  function askDelete() {
    if (!viewing) return;
    var c = $('exv-confirm');
    if (c) c.classList.add('show');
    var a = $('exv-actions');
    if (a) a.style.display = 'none';
  }
  function cancelDelete() {
    var c = $('exv-confirm');
    if (c) c.classList.remove('show');
    var a = $('exv-actions');
    if (a) a.style.display = '';
  }

  function doDelete() {
    if (!viewing) return;
    var it = viewing;
    if (!it.id) { note('이 작품은 지울 수 없어요.'); return; }
    var ok = false;
    if (it.type === 'draw') {
      var dl = readList(DRAW_KEY).filter(function (x) { return String(x.id) !== it.id; });
      ok = writeList(DRAW_KEY, dl);
    } else {
      var cl = readList(COLOR_KEY).filter(function (x) { return String(x.id) !== it.id; });
      ok = writeList(COLOR_KEY, cl);
    }
    closeView();
    render();
    note(ok ? '🗑️ 작품을 지웠어요.' : '😢 지우지 못했어요. 잠시 뒤 다시 해 주세요.');
  }

  /* ── PNG 저장 ─────────────────────────────────── */

  function fileName(it) {
    var d = new Date(it.ts || Date.now());
    var stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
    var safe = String(it.title || '작품').replace(/[\\/:*?"<>|]/g, '').slice(0, 20);
    return '유아작품-' + safe + '-' + stamp + '.png';
  }

  function savePng() {
    if (!viewing || !viewing.img) return;
    var it = viewing;
    try {
      var head = it.img.slice(0, it.img.indexOf(','));
      var mime = (head.match(/:(.*?);/) || [])[1] || 'image/png';
      var bin = atob(it.img.slice(it.img.indexOf(',') + 1));
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([arr], { type: mime }));
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName(it).replace(/\.png$/, mime === 'image/png' ? '.png' : '.jpg');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      note('💾 ' + (it.title || '작품') + ' 이미지를 저장했어요.');
    } catch (e) {
      try {
        var b = document.createElement('a');
        b.href = it.img;
        b.download = fileName(it);
        document.body.appendChild(b);
        b.click();
        b.remove();
        note('💾 이미지를 저장했어요.');
      } catch (e2) {
        note('😢 저장하지 못했어요.');
      }
    }
  }

  /* ── 홈 카드 숫자 ─────────────────────────────── */

  function refreshCount() {
    var c = counts();
    setText('ex-count-chip', String(c.all));
    setText('ex-total', c.all + '개');
    setText('ex-n-all', String(c.all));
    setText('ex-n-draw', String(c.draw));
    setText('ex-n-color', String(c.color));
  }

  function refresh() {
    refreshCount();
    var screen = $('exhibit');
    if (screen && screen.classList.contains('active')) render();
  }

  /* ── 시작 ─────────────────────────────────────── */

  refreshCount();

  window.Exhibit = {
    open: open,
    close: close,
    filter: setFilter,
    render: render,
    refresh: refresh,
    refreshCount: refreshCount,
    addColor: addColor,
    view: openView,
    closeView: closeView,
    askDelete: askDelete,
    cancelDelete: cancelDelete,
    doDelete: doDelete,
    savePng: savePng,
    todayCount: function () {
      var n = 0;
      allEntries().forEach(function (it) { if (isToday(it.ts)) n++; });
      return n;
    },
    _qa: function () {
      var c = counts();
      var list = allEntries();
      return {
        total: c.all, draw: c.draw, color: c.color, filter: filter,
        today: window.Exhibit.todayCount(), viewing: viewing ? (viewing.type + ':' + viewing.id) : null,
        first: list.length ? { type: list[0].type, title: list[0].title, ts: list[0].ts } : null,
        keys: { draw: DRAW_KEY, color: COLOR_KEY }
      };
    }
  };
})();
