/* =========================================================
   system.js — ほぞん / ぶるぶる / がめんサイズ / いろいろ
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util;

  /* ---------------- ほぞん ---------------- */
  var KEY = 'yawaraka.save.v1';
  var mem = null;

  function load() {
    if (mem) return mem;
    try {
      var raw = localStorage.getItem(KEY);
      mem = raw ? JSON.parse(raw) : {};
    } catch (e) { mem = {}; }
    return mem;
  }
  var saveTimer = 0;
  function flush() {
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* ないこともある */ }
  }

  YA.Store = {
    get: function (k, d) {
      var m = load();
      return (k in m) ? m[k] : d;
    },
    set: function (k, v) {
      load(); mem[k] = v;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 350);
    },
    flush: flush,
    all: load
  };

  /* ---------------- ぶるぶる（バイブ） ---------------- */
  var hapOn = YA.Store.get('haptics', true);
  var canVib = !!(navigator.vibrate);

  YA.Haptics = {
    get enabled() { return hapOn; },
    setEnabled: function (b) { hapOn = !!b; YA.Store.set('haptics', hapOn); },
    /* kind: tap / soft / pop / heavy / success */
    fire: function (kind) {
      if (!hapOn || !canVib) return;
      try {
        switch (kind) {
          case 'soft': navigator.vibrate(6); break;
          case 'pop': navigator.vibrate(12); break;
          case 'heavy': navigator.vibrate(26); break;
          case 'success': navigator.vibrate([14, 40, 14, 40, 30]); break;
          case 'squish': navigator.vibrate([8, 18, 8]); break;
          default: navigator.vibrate(9);
        }
      } catch (e) { }
    }
  };

  /* ---------------- がめんサイズ（iOS の 100vh もんだい対策） --------------- */
  var Viewport = YA.Viewport = {
    w: 0, h: 0,
    listeners: [],
    onChange: function (fn) { this.listeners.push(fn); },
    apply: function () {
      var vv = global.visualViewport;
      var h = vv ? vv.height : global.innerHeight;
      var w = vv ? vv.width : global.innerWidth;
      // iOS のアドレスバー分で 1px ずれることがあるので丸める
      h = Math.round(h); w = Math.round(w);
      if (h === this.h && w === this.w) return;
      this.h = h; this.w = w;
      document.documentElement.style.setProperty('--app-h', h + 'px');
      for (var i = 0; i < this.listeners.length; i++) this.listeners[i](w, h);
    }
  };

  var applyTimer = 0;
  function schedule() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(function () { Viewport.apply(); }, 60);
    Viewport.apply();
  }
  U.on(global, 'resize', schedule);
  U.on(global, 'orientationchange', function () {
    schedule();
    setTimeout(schedule, 220);
    setTimeout(schedule, 600);
  });
  if (global.visualViewport) {
    U.on(global.visualViewport, 'resize', schedule);
    U.on(global.visualViewport, 'scroll', schedule);
  }
  Viewport.apply();

  /* ---------------- iOS の よけいな どうさを とめる ---------------- */
  U.on(document, 'gesturestart', function (e) { e.preventDefault(); }, { passive: false });
  U.on(document, 'gesturechange', function (e) { e.preventDefault(); }, { passive: false });
  U.on(document, 'dblclick', function (e) { e.preventDefault(); }, { passive: false });
  U.on(document, 'touchmove', function (e) {
    // ステージ内はスクロールさせない（ツールバーの横スクロールは許可）
    var t = e.target;
    while (t && t !== document.body) {
      if (t.classList && (t.classList.contains('bar') || t.classList.contains('picker-grid') ||
        t.classList.contains('sheet') || t.classList.contains('photo-box'))) return;
      t = t.parentNode;
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  U.on(document, 'contextmenu', function (e) { e.preventDefault(); });

  /* ---------------- ゆらす（デバイスモーション） ---------------- */
  var shakeCbs = [];
  YA.onShake = function (fn) { shakeCbs.push(fn); };
  var lastShake = 0, lax = 0, lay = 0, laz = 0;
  function motion(e) {
    var a = e.accelerationIncludingGravity;
    if (!a) return;
    var dx = Math.abs((a.x || 0) - lax), dy = Math.abs((a.y || 0) - lay), dz = Math.abs((a.z || 0) - laz);
    lax = a.x || 0; lay = a.y || 0; laz = a.z || 0;
    var mag = dx + dy + dz;
    var t = U.now();
    if (mag > 26 && t - lastShake > 700) {
      lastShake = t;
      for (var i = 0; i < shakeCbs.length; i++) shakeCbs[i](mag);
    }
  }
  YA.enableMotion = function () {
    try {
      if (global.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then(function (r) {
          if (r === 'granted') global.addEventListener('devicemotion', motion);
        }).catch(function () { });
      } else if (global.DeviceMotionEvent) {
        global.addEventListener('devicemotion', motion);
      }
    } catch (e) { }
  };

  /* ---------------- かるい FPS カウンタ ---------------- */
  function FpsMeter() {
    this.fps = 60; this._acc = 0; this._n = 0;
  }
  FpsMeter.prototype.tick = function (dt) {
    this._acc += dt; this._n++;
    if (this._acc >= 0.5) {
      this.fps = this._n / this._acc;
      this._acc = 0; this._n = 0;
    }
    return this.fps;
  };
  YA.FpsMeter = FpsMeter;

})(window);
