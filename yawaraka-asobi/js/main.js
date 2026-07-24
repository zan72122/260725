/* =========================================================
   main.js — はじまり
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA;
  var U = YA.util;

  /* たんまつの せいのう（0=よわい 1=ふつう 2=つよい） */
  YA.tier = U.deviceTier();

  function boot() {
    try {
      var g = new YA.Game();
      YA.game = g;
      g.init();
      YA.Viewport.apply();
      setTimeout(function () { g.resize(true); }, 60);
      setTimeout(function () { g.resize(true); }, 400);
    } catch (e) {
      var m = document.createElement('div');
      m.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'padding:24px;font-family:sans-serif;text-align:center;background:#fff;color:#a44;z-index:999';
      m.textContent = 'ごめんね、うまく はじめられなかった… （' + (e && e.message) + '）';
      document.body.appendChild(m);
      if (global.console) console.error(e);
    }
  }

  /* タブが かくれたら とめる（バッテリーせつやく） */
  U.on(document, 'visibilitychange', function () {
    var g = YA.game;
    if (!g) return;
    if (document.hidden) {
      if (g.running) { g._wasRunning = true; g.running = false; }
    } else if (g._wasRunning && g.scene) {
      g._wasRunning = false;
      g.last = U.now();
      g.acc = 0;
      g.start();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
