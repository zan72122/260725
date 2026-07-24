/* ============================================================
 * ui.js — がめん の UI（HUD・パネル・オーバーレイ・ヒント）
 * ============================================================ */
var UI = (function () {
  'use strict';

  var el = {};
  var cb = {};
  var hintTimer = null, hintTarget = null;
  var rowHandlers = [null, null, null];

  function $(id) { return document.getElementById(id); }

  function init(callbacks) {
    cb = callbacks || {};
    ['hud', 'task', 'task-tx', 'steps', 'tabs', 'panel', 'row-0', 'row-1', 'row-2',
      'big', 'banner', 'toast', 'hint', 'hint-ring', 'v-star', 'v-heart', 'c-star', 'c-heart',
      'btn-back', 'btn-menu', 'btn-album', 'btn-opt', 'album-grid', 'album-count',
      'shop-grid', 'shop-info', 'menu-grid', 'res-title', 'res-stars', 'res-sticker',
      'res-reward', 'res-msg', 'res-again', 'res-home', 'title', 'loading',
      'tg-sound', 'tg-voice', 'tg-hints'].forEach(function (id) { el[id] = $(id); });

    // オーバーレイ の とじる ボタン
    var closers = document.querySelectorAll('[data-close]');
    for (var i = 0; i < closers.length; i++) {
      (function (c) {
        c.addEventListener('click', function () {
          SND.play('tap');
          closeOverlay(c.getAttribute('data-close'));
        });
      })(closers[i]);
    }
    // オーバーレイ の そとがわ タップ で とじる
    ['ov-album', 'ov-shop', 'ov-menu', 'ov-opt'].forEach(function (id) {
      var o = $(id);
      if (!o) return;
      o.addEventListener('click', function (ev) {
        if (ev.target === o) { SND.play('tap'); closeOverlay(id); }
      });
    });

    el['btn-back'].addEventListener('click', function () { SND.play('tap'); if (cb.onHome) cb.onHome(); });
    el['btn-menu'].addEventListener('click', function () { SND.play('tap'); openMenu(); });
    el['btn-album'].addEventListener('click', function () { SND.play('tap'); openAlbum(); });
    el['btn-opt'].addEventListener('click', function () { SND.play('tap'); openOptions(); });
    el['c-star'].addEventListener('click', function () { SND.play('coin'); openShop(); });
    el['c-heart'].addEventListener('click', function () { SND.play('heart'); toast('ハートは おともだち の きもち💖'); });

    el['res-again'].addEventListener('click', function () {
      SND.play('tap'); closeOverlay('ov-result');
      if (cb.onAgain) cb.onAgain();
    });
    el['res-home'].addEventListener('click', function () {
      SND.play('tap'); closeOverlay('ov-result');
      if (cb.onHome) cb.onHome();
    });

    setupToggles();
    layout();
    window.addEventListener('resize', layout);
    updateCounters(false);
  }

  function layout() {
    document.body.classList.toggle('portrait', window.innerHeight >= window.innerWidth);
  }

  /* ================= HUD ひょうじ ================= */

  function show() { el.hud.classList.add('on'); }
  function hide() { el.hud.classList.remove('on'); }

  function setBackIcon(icon) { el['btn-back'].textContent = icon; }

  function updateCounters(bump) {
    var d = SAVE.data;
    var os = el['v-star'].textContent, oh = el['v-heart'].textContent;
    el['v-star'].textContent = d.stars;
    el['v-heart'].textContent = d.hearts;
    if (bump !== false) {
      if (String(d.stars) !== os) pop(el['c-star']);
      if (String(d.hearts) !== oh) pop(el['c-heart']);
    }
  }

  function pop(node) {
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }

  /* ================= おしえて バー ================= */

  var lastTask = '';

  function setTask(text, icon, speak) {
    el['task-tx'].textContent = text;
    el.task.querySelector('.tic').textContent = icon || '✨';
    el.task.classList.add('on');
    if (speak !== false && text !== lastTask) SND.say(text);
    lastTask = text;
  }

  function clearTask() { el.task.classList.remove('on'); lastTask = ''; }
  function taskMid(on) { el.task.classList.toggle('mid', !!on); }

  /* ================= ステップ ドット ================= */

  function setSteps(total, current) {
    var s = el.steps;
    s.innerHTML = '';
    if (!total) return;
    for (var i = 0; i < total; i++) {
      var d = document.createElement('div');
      d.className = 'dot' + (i < current ? ' done' : (i === current ? ' now' : ''));
      s.appendChild(d);
    }
  }
  function clearSteps() { el.steps.innerHTML = ''; }

  /* ================= パネル（えらぶ ボタン） ================= */

  /**
   * items: [{id, icon, label, sel, locked, price, badge, color, big}]
   */
  function setRow(idx, items, onPick, opts) {
    opts = opts || {};
    var row = el['row-' + idx];
    if (!row) return;
    row.innerHTML = '';
    row.className = 'row center' + (opts.wrap ? ' wrapped' : '');
    rowHandlers[idx] = onPick || null;
    if (!items || !items.length) return;

    items.forEach(function (it) {
      var b = document.createElement('button');
      b.className = 'chip' + (it.sel ? ' sel' : '') + (it.locked ? ' locked' : '') + (it.big || opts.big ? ' big' : '');
      b.setAttribute('data-id', it.id);
      if (it.color != null) b.style.background = 'linear-gradient(180deg,' + U.hex2css(U.shade(it.color, 0.35)) + ',' + U.hex2css(it.color) + ')';
      var h = '<span class="ci">' + (it.icon || '❔') + '</span>';
      if (it.label) h += '<span class="cl">' + it.label + '</span>';
      if (it.price) h += '<span class="price">⭐' + it.price + '</span>';
      if (it.badge) h += '<span class="newdot">' + it.badge + '</span>';
      b.innerHTML = h;
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (rowHandlers[idx]) rowHandlers[idx](it.id, it, b);
      });
      row.appendChild(b);
    });
  }

  function setSelected(idx, id) {
    var row = el['row-' + idx];
    if (!row) return;
    var kids = row.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('sel', kids[i].getAttribute('data-id') === String(id));
    }
  }

  /** いろの まる を ならべる */
  function setSwatches(idx, colors, selectedKey, onPick) {
    var row = el['row-' + idx];
    if (!row) return;
    row.innerHTML = '';
    row.className = 'row center';
    Object.keys(colors).forEach(function (k) {
      var c = colors[k];
      var b = document.createElement('button');
      b.className = 'sw' + (k === selectedKey ? ' sel' : '');
      b.setAttribute('data-id', k);
      if (c.rainbow) {
        b.style.background = 'conic-gradient(#ff9dbf,#ffd95c,#9ee493,#8fd4ff,#c09dff,#ff9dbf)';
      } else {
        b.style.background = 'linear-gradient(180deg,' + U.hex2css(U.shade(c.hex, 0.3)) + ',' + U.hex2css(c.hex) + ')';
      }
      b.title = c.name;
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var kids = row.children;
        for (var i = 0; i < kids.length; i++) kids[i].classList.remove('sel');
        b.classList.add('sel');
        if (onPick) onPick(k, c);
      });
      row.appendChild(b);
    });
  }

  function clearRows() {
    for (var i = 0; i < 3; i++) {
      el['row-' + i].innerHTML = '';
      el['row-' + i].className = 'row center';
      rowHandlers[i] = null;
    }
  }

  /* ================= タブ ================= */

  function setTabs(items, onPick, selId) {
    var t = el.tabs;
    t.innerHTML = '';
    if (!items || !items.length) return;
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.className = 'tab' + (it.id === selId ? ' sel' : '');
      b.setAttribute('data-id', it.id);
      b.innerHTML = '<span>' + it.icon + '</span>' + (it.label ? '<span class="tl">' + it.label + '</span>' : '');
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var kids = t.children;
        for (var i = 0; i < kids.length; i++) kids[i].classList.remove('sel');
        b.classList.add('sel');
        SND.play('tap');
        if (onPick) onPick(it.id, it);
      });
      t.appendChild(b);
    });
  }
  function clearTabs() { el.tabs.innerHTML = ''; }
  function selectTab(id) {
    var kids = el.tabs.children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('sel', kids[i].getAttribute('data-id') === String(id));
  }

  /* ================= フィードバック ================= */

  function big(emoji) {
    el.big.textContent = emoji;
    el.big.classList.remove('go');
    void el.big.offsetWidth;
    el.big.classList.add('go');
  }

  function banner(text, speak) {
    el.banner.textContent = text;
    el.banner.classList.remove('go');
    void el.banner.offsetWidth;
    el.banner.classList.add('go');
    if (speak !== false) SND.say(text.replace(/[!！♪〜]/g, ''));
  }

  var toastT = null;
  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.add('on');
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(function () { el.toast.classList.remove('on'); }, 1900);
  }

  /* ================= ヒント（ゆび） ================= */

  function hintAt(x, y) {
    if (!SAVE.data.opts.hints) return;
    hintTarget = { x: x, y: y };
    el.hint.style.left = x + 'px';
    el.hint.style.top = y + 'px';
    el.hint.classList.add('on');
    el['hint-ring'].style.left = x + 'px';
    el['hint-ring'].style.top = y + 'px';
    el['hint-ring'].classList.add('on');
  }

  function hideHint() {
    hintTarget = null;
    el.hint.classList.remove('on');
    el['hint-ring'].classList.remove('on');
  }

  function hintOnElement(node) {
    if (!node) return;
    var r = node.getBoundingClientRect();
    hintAt(r.left + r.width / 2, r.top + r.height / 2);
  }

  function hintOnChip(rowIdx, id) {
    var row = el['row-' + rowIdx];
    if (!row) return;
    var n = row.querySelector('[data-id="' + id + '"]');
    hintOnElement(n);
  }

  /* ================= オーバーレイ ================= */

  function openOverlay(id) {
    var o = $(id);
    if (o) o.classList.add('on');
  }
  function closeOverlay(id) {
    var o = $(id);
    if (o) o.classList.remove('on');
    if (id === 'ov-result' && cb.onResultClosed) cb.onResultClosed();
  }
  function anyOverlayOpen() {
    return !!document.querySelector('.overlay.on');
  }

  /* ---------- シールアルバム ---------- */

  function openAlbum(newId) {
    var g = el['album-grid'];
    g.innerHTML = '';
    var list = STICKERS.list;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var have = SAVE.hasSticker(s.id);
      var d = document.createElement('div');
      d.className = 'slot' + (have ? '' : ' locked') + (s.id === newId ? ' newly' : '');
      d.innerHTML = '<span>' + (have ? s.icon : '❓') + '</span><span class="sn">' + (have ? s.name : '？？？') + '</span>';
      g.appendChild(d);
    }
    el['album-count'].textContent = SAVE.stickerCount() + ' / ' + list.length + ' まい あつめたよ';
    openOverlay('ov-album');
  }

  /* ---------- ショップ ---------- */

  function shopItems() {
    var out = [];
    ['hair', 'top', 'bottom', 'shoes', 'acc'].forEach(function (slot) {
      var map = { hair: WARDROBE.HAIR, top: WARDROBE.TOP, bottom: WARDROBE.BOTTOM, shoes: WARDROBE.SHOES, acc: WARDROBE.ACC }[slot];
      Object.keys(map).forEach(function (k) {
        var it = map[k];
        if (!it.price) return;
        out.push({ key: slot + ':' + k, slot: slot, id: k, name: it.name, icon: it.icon, price: it.price });
      });
    });
    out.sort(function (a, b) { return a.price - b.price; });
    return out;
  }

  function openShop() {
    var g = el['shop-grid'];
    g.innerHTML = '';
    var items = shopItems();
    items.forEach(function (it) {
      var owned = SAVE.own(it.key);
      var can = SAVE.data.stars >= it.price;
      var d = document.createElement('button');
      d.className = 'shop-item' + (owned ? ' bought' : (can ? '' : ' cant'));
      d.innerHTML = '<span class="si">' + it.icon + '</span><span class="snm">' + it.name + '</span>' +
        '<span class="sp">' + (owned ? '✅ もってる' : '⭐' + it.price) + '</span>';
      d.addEventListener('click', function () {
        if (owned) { SND.play('tap'); toast('もう もってるよ！'); return; }
        if (SAVE.data.stars < it.price) {
          SND.play('wrong');
          toast('スターが たりないよ… おしごと しよう！');
          return;
        }
        SAVE.spend(it.price);
        SAVE.buy(it.key);
        SAVE.save();
        SND.play('unlock');
        banner('かった！ ' + it.name);
        updateCounters();
        openShop();
        if (cb.onBuy) cb.onBuy(it);
      });
      g.appendChild(d);
    });
    var ownedN = items.filter(function (i) { return SAVE.own(i.key); }).length;
    el['shop-info'].textContent = 'もってる ' + ownedN + ' / ' + items.length + '　⭐' + SAVE.data.stars;
    openOverlay('ov-shop');
  }

  /* ---------- おでかけメニュー ---------- */

  var destinations = [];
  function setDestinations(list) { destinations = list; }

  function openMenu() {
    var g = el['menu-grid'];
    g.innerHTML = '';
    destinations.forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'dest g-' + (d.group || 'etc');
      b.innerHTML = '<span class="di">' + d.icon + '</span><span class="dn">' + d.name + '</span>' +
        '<span class="dc">' + (d.tag || '') + '</span>';
      b.addEventListener('click', function () {
        SND.play('tap');
        closeOverlay('ov-menu');
        if (cb.onGo) cb.onGo(d.id);
      });
      g.appendChild(b);
    });
    openOverlay('ov-menu');
  }

  /* ---------- けっか ---------- */

  function openResult(o) {
    // o: {title, stars(0-3), reward, msg, sticker:{icon,name}, again:bool}
    el['res-title'].textContent = o.title || 'できたね！';
    var s = '';
    for (var i = 0; i < 3; i++) {
      s += '<span style="animation-delay:' + (i * 0.22) + 's">' + (i < o.stars ? '⭐' : '☆') + '</span>';
    }
    el['res-stars'].innerHTML = s;
    if (o.sticker) {
      el['res-sticker'].classList.remove('hide');
      el['res-sticker'].textContent = o.sticker.icon;
    } else {
      el['res-sticker'].classList.add('hide');
    }
    el['res-reward'].innerHTML = (o.reward ? '⭐ +' + o.reward : '') + (o.hearts ? '　💖 +' + o.hearts : '');
    el['res-msg'].textContent = o.msg || '';
    el['res-again'].style.display = (o.again === false) ? 'none' : '';
    openOverlay('ov-result');
    for (var k = 0; k < o.stars; k++) {
      (function (kk) { setTimeout(function () { SND.play('star'); }, kk * 240); })(k);
    }
    setTimeout(function () { SND.play(o.stars >= 3 ? 'fanfare' : 'tada'); }, 200);
    if (o.sticker) setTimeout(function () { SND.play('unlock'); }, 900);
    SND.say(o.title || 'できたね');
  }

  /* ---------- せってい ---------- */

  function setupToggles() {
    function bind(node, get, set) {
      node.classList.toggle('on', get());
      node.addEventListener('click', function () {
        set(!get());
        node.classList.toggle('on', get());
        SND.play('tap');
        SAVE.save();
      });
    }
    bind(el['tg-sound'],
      function () { return SAVE.data.opts.sound; },
      function (v) { SAVE.data.opts.sound = v; SND.setMuted(!v); });
    bind(el['tg-voice'],
      function () { return SAVE.data.opts.voice; },
      function (v) { SAVE.data.opts.voice = v; SND.setVoice(v); });
    bind(el['tg-hints'],
      function () { return SAVE.data.opts.hints; },
      function (v) { SAVE.data.opts.hints = v; if (!v) hideHint(); });
  }

  function openOptions() { openOverlay('ov-opt'); }

  /* ================= タイトル / ローディング ================= */

  function hideTitle() { el.title.classList.add('gone'); }
  function hideLoading() { el.loading.classList.add('gone'); setTimeout(function () { el.loading.style.display = 'none'; }, 600); }

  return {
    init: init, show: show, hide: hide, layout: layout,
    setTask: setTask, clearTask: clearTask, taskMid: taskMid,
    setSteps: setSteps, clearSteps: clearSteps,
    setRow: setRow, setSelected: setSelected, setSwatches: setSwatches, clearRows: clearRows,
    setTabs: setTabs, clearTabs: clearTabs, selectTab: selectTab,
    big: big, banner: banner, toast: toast, pop: pop,
    hintAt: hintAt, hideHint: hideHint, hintOnElement: hintOnElement, hintOnChip: hintOnChip,
    updateCounters: updateCounters, setBackIcon: setBackIcon,
    openAlbum: openAlbum, openShop: openShop, openMenu: openMenu, openResult: openResult,
    openOptions: openOptions, closeOverlay: closeOverlay, anyOverlayOpen: anyOverlayOpen,
    setDestinations: setDestinations,
    hideTitle: hideTitle, hideLoading: hideLoading,
    el: el
  };
})();
