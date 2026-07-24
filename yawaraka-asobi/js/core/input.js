/* =========================================================
   input.js — マルチタッチ ポインタ かんり
   （iPhone/iPad の ゆびを ぜんぶ ひろう）
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util;

  function Pointer(id, x, y) {
    this.id = id;
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.sx = x; this.sy = y;      // さいしょの ばしょ
    this.vx = 0; this.vy = 0;      // px/秒
    this.speed = 0;
    this.down = true;
    this.justDown = true;
    this.justUp = false;
    this.age = 0;
    this.travel = 0;
    this.held = false;             // ながおし
    this.data = {};                // シーンが じゆうに つかう
  }

  function PointerTracker(el) {
    this.el = el;
    this.pointers = new Map();
    this.dead = [];
    this._list = [];
    this._cbs = { down: [], move: [], up: [] };
    this._bind();
  }

  PointerTracker.prototype.on = function (ev, fn) {
    if (this._cbs[ev]) this._cbs[ev].push(fn);
    return this;
  };
  PointerTracker.prototype._emit = function (ev, p) {
    var a = this._cbs[ev];
    for (var i = 0; i < a.length; i++) a[i](p);
  };

  PointerTracker.prototype._pos = function (clientX, clientY) {
    var r = this.el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  PointerTracker.prototype._down = function (id, cx, cy) {
    var p0 = this._pos(cx, cy);
    var p = new Pointer(id, p0.x, p0.y);
    this.pointers.set(id, p);
    this._emit('down', p);
  };
  PointerTracker.prototype._move = function (id, cx, cy) {
    var p = this.pointers.get(id);
    if (!p) return;
    var p0 = this._pos(cx, cy);
    p.x = p0.x; p.y = p0.y;
    this._emit('move', p);
  };
  PointerTracker.prototype._up = function (id) {
    var p = this.pointers.get(id);
    if (!p) return;
    p.down = false; p.justUp = true;
    this.pointers.delete(id);
    this.dead.push(p);
    this._emit('up', p);
  };

  PointerTracker.prototype._bind = function () {
    var self = this, el = this.el;
    var opt = { passive: false };

    /* ブラウザの「ドラッグ＆ドロップ」や「もじの せんたく」が はじまると
       pointercancel が とんで きて、ゆびを うしなって しまう。さきに とめる。 */
    el.draggable = false;
    U.on(el, 'dragstart', function (e) { e.preventDefault(); return false; }, opt);
    U.on(el, 'selectstart', function (e) { e.preventDefault(); return false; }, opt);

    if (global.PointerEvent) {
      U.on(el, 'pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        el.setPointerCapture && el.setPointerCapture(e.pointerId);
        self._down(e.pointerId, e.clientX, e.clientY);
        if (e.cancelable) e.preventDefault();
      }, opt);
      U.on(el, 'pointermove', function (e) {
        if (!self.pointers.has(e.pointerId)) return;
        // 合体イベントも ひろって なめらかに
        if (e.getCoalescedEvents) {
          var evs = e.getCoalescedEvents();
          for (var i = 0; i < evs.length; i++) self._move(e.pointerId, evs[i].clientX, evs[i].clientY);
          if (evs.length === 0) self._move(e.pointerId, e.clientX, e.clientY);
        } else {
          self._move(e.pointerId, e.clientX, e.clientY);
        }
        if (e.cancelable) e.preventDefault();
      }, opt);
      var up = function (e) { self._up(e.pointerId); };
      U.on(el, 'pointerup', up, opt);
      U.on(el, 'pointercancel', up, opt);
      /* pointerleave は キャプチャちゅうにも とぶ ことが あるので つかわない。
         まどの そとで はなした ときは そとがわで うけとる。 */
      U.on(global, 'pointerup', function (e) {
        if (self.pointers.has(e.pointerId)) self._up(e.pointerId);
      }, opt);
    } else {
      U.on(el, 'touchstart', function (e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
          var t = e.changedTouches[i];
          self._down(t.identifier, t.clientX, t.clientY);
        }
        if (e.cancelable) e.preventDefault();
      }, opt);
      U.on(el, 'touchmove', function (e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
          var t = e.changedTouches[i];
          self._move(t.identifier, t.clientX, t.clientY);
        }
        if (e.cancelable) e.preventDefault();
      }, opt);
      var tup = function (e) {
        for (var i = 0; i < e.changedTouches.length; i++) self._up(e.changedTouches[i].identifier);
        if (e.cancelable) e.preventDefault();
      };
      U.on(el, 'touchend', tup, opt);
      U.on(el, 'touchcancel', tup, opt);
      // マウス（PC かくにん用）
      var mdown = false;
      U.on(el, 'mousedown', function (e) { mdown = true; self._down(-1, e.clientX, e.clientY); });
      U.on(el, 'mousemove', function (e) { if (mdown) self._move(-1, e.clientX, e.clientY); });
      U.on(global, 'mouseup', function () { if (mdown) { mdown = false; self._up(-1); } });
    }
  };

  /* まいフレームの あたま で よぶ：そくどを けいさん */
  PointerTracker.prototype.beginFrame = function (dt) {
    this._list.length = 0;
    var inv = dt > 0 ? 1 / dt : 0;
    var self = this;
    this.pointers.forEach(function (p) {
      var dx = p.x - p.px, dy = p.y - p.py;
      // そくどは すこし なめらかに
      var nvx = dx * inv, nvy = dy * inv;
      p.vx = p.vx * 0.45 + nvx * 0.55;
      p.vy = p.vy * 0.45 + nvy * 0.55;
      p.speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      p.travel += Math.sqrt(dx * dx + dy * dy);
      p.age += dt;
      if (p.age > 0.45 && p.travel < 14) p.held = true;
      self._list.push(p);
    });
    for (var i = 0; i < this.dead.length; i++) this._list.push(this.dead[i]);
    return this._list;
  };

  /* まいフレームの おわり で よぶ */
  PointerTracker.prototype.endFrame = function () {
    this.pointers.forEach(function (p) {
      p.px = p.x; p.py = p.y;
      p.justDown = false;
    });
    this.dead.length = 0;
  };

  PointerTracker.prototype.list = function () { return this._list; };
  PointerTracker.prototype.count = function () { return this.pointers.size; };

  /* 2ほんゆびの きょり（ひっぱりに つかう） */
  PointerTracker.prototype.pinch = function () {
    if (this.pointers.size < 2) return null;
    var a = null, b = null;
    this.pointers.forEach(function (p) { if (!a) a = p; else if (!b) b = p; });
    return { a: a, b: b, d: U.dist(a.x, a.y, b.x, b.y) };
  };

  PointerTracker.prototype.clearAll = function () {
    this.pointers.clear();
    this.dead.length = 0;
    this._list.length = 0;
  };

  YA.PointerTracker = PointerTracker;

})(window);
