/* =========================================================
   ui.js — がめんの ボタンや ひょうじ（DOM）
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util;

  var el = U.el;
  var UI = YA.UI = {};

  var refs = {};
  var toastTimer = 0, sayTimer = 0, hintTimer = 0;

  UI.init = function () {
    refs.screens = {
      title: el('screenTitle'),
      picker: el('screenPicker'),
      play: el('screenPlay')
    };
    refs.pickerGrid = el('pickerGrid');
    refs.toolbar = el('toolbar');
    refs.colorbar = el('colorbar');
    refs.starCount = el('starCount');
    refs.starPicker = el('starCountPicker');
    refs.matName = el('matName');
    refs.matEmoji = el('matEmoji');
    refs.toast = el('toast');
    refs.mascotSay = el('mascotSay');
    refs.hint = el('hintBubble');
    refs.stage = el('stage');
  };

  /* ---------- がめん きりかえ ---------- */
  UI.screen = function (name) {
    for (var k in refs.screens) {
      refs.screens[k].classList.toggle('is-on', k === name);
    }
  };

  /* ---------- そざい えらび ---------- */
  UI.buildPicker = function (materials, onPick) {
    var g = refs.pickerGrid;
    g.innerHTML = '';
    materials.forEach(function (m, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mat-card';
      b.style.background = 'linear-gradient(160deg,' + m.card[0] + ',' + m.card[1] + ')';
      b.style.animationDelay = (i * 0.045) + 's';
      b.innerHTML = '<span class="mc-blob b1"></span><span class="mc-blob b2"></span>' +
        '<span class="mc-emoji">' + m.emoji + '</span>' +
        '<span class="mc-name">' + m.name + '</span>';
      b.addEventListener('click', function () { onPick(m); });
      g.appendChild(b);
    });
  };

  /* ---------- どうぐ ---------- */
  UI.buildTools = function (def, current, onSelect) {
    var bar = refs.toolbar;
    bar.innerHTML = '';
    def.tools.forEach(function (id) {
      var t = YA.TOOLS[id];
      if (!t) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool-btn' + (id === current ? ' on' : '');
      b.dataset.tool = id;
      b.innerHTML = '<span class="t-ico">' + t.icon + '</span><span class="t-lbl">' + t.label + '</span>';
      b.addEventListener('click', function () {
        onSelect(id);
        UI.setTool(id);
      });
      bar.appendChild(b);
    });
    UI.fitBars();
  };

  /* ボタンが ぜんぶ はいるように おおきさを あわせる
     （4さいの こが スクロールしなくても すべて さわれるように） */
  UI.fitBars = function () {
    var land = global.innerWidth > global.innerHeight;

    function fit(bar, varName, min, max, gap) {
      if (!bar || !bar.children.length) return;
      var n = bar.children.length;
      var cs = global.getComputedStyle(bar);
      var pad = land
        ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
        : (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      var avail = (land ? bar.clientHeight : bar.clientWidth) - pad;
      if (avail <= 0) return;
      var size = Math.floor((avail - gap * (n - 1) - 4) / n);
      size = Math.max(min, Math.min(max, size));
      bar.style.setProperty(varName, size + 'px');
    }
    fit(refs.toolbar, '--tool', 38, 66, 5);
    fit(refs.colorbar, '--cbtn', 24, 40, 7);
  };

  UI.setTool = function (id) {
    var bar = refs.toolbar;
    for (var i = 0; i < bar.children.length; i++) {
      bar.children[i].classList.toggle('on', bar.children[i].dataset.tool === id);
    }
  };

  /* ---------- いろ ／ かたち ---------- */
  UI.buildColors = function (def, stars, currentIdx, onSelect, onLocked) {
    var bar = refs.colorbar;
    bar.innerHTML = '';
    def.colors.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      var locked = c.lock > stars;
      b.className = 'color-btn' + (i === currentIdx ? ' on' : '') + (locked ? ' locked' : '');
      b.style.background = c.c;
      b.dataset.idx = i;
      b.title = locked ? ('⭐' + c.lock) : '';
      b.addEventListener('click', function () {
        if (locked) { onLocked(c.lock); return; }
        onSelect(i);
        UI.setColor(i);
      });
      bar.appendChild(b);
    });
    UI.fitBars();
  };

  UI.setColor = function (i) {
    var bar = refs.colorbar;
    for (var k = 0; k < bar.children.length; k++) {
      bar.children[k].classList.toggle('on', +bar.children[k].dataset.idx === i);
    }
  };

  UI.buildStamps = function (current, onSelect) {
    var bar = refs.colorbar;
    bar.innerHTML = '';
    YA.STAMPS.forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'color-btn' + (name === current ? ' on' : '');
      b.style.background = '#fff';
      b.dataset.idx = name;
      var cv = YA.Sprites.shapeIcon(name, 34, '#ff8fc0');
      b.style.backgroundImage = 'url(' + cv.toDataURL() + ')';
      b.style.backgroundSize = '78%';
      b.style.backgroundPosition = 'center';
      b.style.backgroundRepeat = 'no-repeat';
      b.addEventListener('click', function () {
        onSelect(name);
        for (var k = 0; k < bar.children.length; k++)
          bar.children[k].classList.toggle('on', bar.children[k].dataset.idx === name);
      });
      bar.appendChild(b);
    });
    UI.fitBars();
  };

  /* ---------- ひょうじ ---------- */
  UI.setStars = function (n) {
    if (refs.starCount) refs.starCount.textContent = n;
    if (refs.starPicker) refs.starPicker.textContent = n;
  };

  UI.setMaterial = function (def) {
    if (refs.matName) refs.matName.textContent = def.name;
    if (refs.matEmoji) refs.matEmoji.textContent = def.emoji;
  };

  UI.toast = function (msg, ms) {
    var t = refs.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 1100);
  };

  UI.say = function (msg, ms) {
    var s = refs.mascotSay;
    if (!s) return;
    s.textContent = msg;
    s.classList.add('show');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { s.classList.remove('show'); }, ms || 1800);
  };

  UI.hint = function (msg, ms) {
    var h = refs.hint;
    if (!h) return;
    if (!msg) { h.classList.remove('show'); return; }
    h.textContent = msg;
    h.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { h.classList.remove('show'); }, ms || 3600);
  };

  /* ---------- オーバーレイ ---------- */
  function overlay(id, on) {
    var o = el(id);
    if (o) o.classList.toggle('is-on', !!on);
  }
  UI.sheet = function (on) { overlay('sheetWrap', on); };
  UI.photo = function (on) { overlay('photoWrap', on); };
  UI.levelup = function (on) { overlay('levelWrap', on); };

  UI.showPhoto = function (url) {
    var img = el('photoImg'), a = el('photoSave');
    if (img) img.src = url;
    if (a) a.href = url;
    UI.photo(true);
  };

  UI.showLevelUp = function (title, text) {
    var t = el('levelTitle'), x = el('levelText');
    if (t) t.textContent = title;
    if (x) x.textContent = text;
    UI.levelup(true);
  };

  UI.stage = function () { return refs.stage; };

})(window);
