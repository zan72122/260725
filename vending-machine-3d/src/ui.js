/* ============================================================
 * ui.js — HUD（DOM側）のとりまとめ
 * ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var el = {};
  var toastTimer = null;
  var hintText = '';

  function init() {
    el.hud = $('hud');
    el.title = $('title-screen');
    el.start = $('start-btn');
    el.stars = $('stars');
    el.starCount = $('star-count');
    el.credit = $('credit-chip');
    el.hint = $('hint');
    el.toast = $('toast');
    el.work = $('work-banner');
    el.sales = $('sales-chip');
    el.salesCount = $('sales-count');
    el.btn = {
      swap: $('btn-switch'),
      xray: $('btn-xray'),
      help: $('btn-help'),
      work: $('btn-work'),
      sound: $('btn-sound'),
      trash: $('btn-trash')
    };
    makeClouds();
  }

  function makeClouds() {
    var t = el.title;
    for (var i = 0; i < 6; i++) {
      var c = document.createElement('div');
      c.className = 'cloud';
      var s = 8 + Math.random() * 14;
      c.style.width = s + 'vmin';
      c.style.height = s * 0.55 + 'vmin';
      c.style.top = (5 + Math.random() * 45) + '%';
      c.style.animationDuration = (16 + Math.random() * 20) + 's';
      c.style.animationDelay = (-Math.random() * 20) + 's';
      t.appendChild(c);
    }
  }

  function showHud(v) { el.hud.classList.toggle('visible', v); }
  function hideTitle() { el.title.classList.add('hidden'); }

  function setStars(n, pop) {
    el.starCount.textContent = n;
    if (pop) {
      el.stars.classList.remove('pop');
      void el.stars.offsetWidth;
      el.stars.classList.add('pop');
    }
  }

  function setCredit(n) {
    el.credit.textContent = n + 'えん';
  }

  var hintLow = '23%';
  function setHintAnchor(css) { hintLow = css; applyHintPos(); }
  var hintHigh = false;
  function applyHintPos() {
    el.hint.style.bottom = hintHigh
      ? 'calc(env(safe-area-inset-bottom,0px) + 44%)'
      : 'calc(env(safe-area-inset-bottom,0px) + ' + hintLow + ')';
  }
  /** 取出口を案内するときは、吹き出しが取出口をかくさないよう上にあげる */
  function setHintHigh(v) {
    if (hintHigh === !!v) return;
    hintHigh = !!v;
    applyHintPos();
  }

  function setHint(text) {
    if (text === hintText) return;
    hintText = text;
    if (!text) { el.hint.classList.add('dim'); return; }
    el.hint.classList.add('dim');
    setTimeout(function () {
      el.hint.innerHTML = text;
      el.hint.classList.remove('dim');
    }, 120);
  }

  function toast(text, ms) {
    el.toast.innerHTML = text;
    el.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('show');
    }, ms || 1400);
  }

  function setToggle(name, on) {
    if (el.btn[name]) el.btn[name].classList.toggle('on', !!on);
  }

  function setVisible(name, v) {
    if (el.btn[name]) el.btn[name].classList.toggle('hide', !v);
  }

  function setAttn(name, v) {
    if (el.btn[name]) el.btn[name].classList.toggle('attn', !!v);
  }

  function setWorkMode(v) {
    el.work.classList.toggle('show', v);
    el.sales.classList.toggle('show', v);
    el.stars.style.display = v ? 'none' : 'flex';
  }

  function setSales(n) { el.salesCount.textContent = n; }

  window.VMUI = {
    init: init,
    el: el,
    showHud: showHud,
    hideTitle: hideTitle,
    setStars: setStars,
    setCredit: setCredit,
    setHint: setHint,
    setHintAnchor: setHintAnchor,
    setHintHigh: setHintHigh,
    toast: toast,
    setToggle: setToggle,
    setVisible: setVisible,
    setAttn: setAttn,
    setWorkMode: setWorkMode,
    setSales: setSales
  };
})();
