/* =========================================================
   fibers.js — ヴェルレ法の いと（わたあめの ざらめの いと）
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util;

  function Strand(n, restLen) {
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.ox = new Float32Array(n);
    this.oy = new Float32Array(n);
    this.pin = new Uint8Array(n);      // 1 = うごかない
    this.rest = restLen;
    this.color = '#ffc7e2';
    this.width = 2;
    this.attached = false;
    this.absorb = 0;                   // 0..1 すいこまれぐあい
    this.dead = false;
    this.age = 0;
    this.wind = 0;                     // まきつき かくど
  }
  Strand.prototype.setAll = function (px, py) {
    for (var i = 0; i < this.n; i++) { this.x[i] = px; this.y[i] = py; this.ox[i] = px; this.oy[i] = py; }
  };
  Strand.prototype.head = function () { return { x: this.x[0], y: this.y[0] }; };
  Strand.prototype.tail = function () { return { x: this.x[this.n - 1], y: this.y[this.n - 1] }; };

  function FiberSim() {
    this.strands = [];
    this.bounds = { x0: 0, y0: 0, x1: 100, y1: 100 };
    this.scale = 1;
    this.gravity = 420;
    this.drag = 0.985;
    this.wind = { x: 0, y: 0 };
    this.iters = 3;
    this.max = 46;
    this.time = 0;
  }

  FiberSim.prototype.setBounds = function (x0, y0, x1, y1, scale) {
    this.bounds.x0 = x0; this.bounds.y0 = y0; this.bounds.x1 = x1; this.bounds.y1 = y1;
    this.scale = scale || 1;
  };

  FiberSim.prototype.clear = function () { this.strands.length = 0; };

  FiberSim.prototype.spawn = function (x, y, dirx, diry, len, points, color) {
    if (this.strands.length >= this.max) return null;
    points = points || 12;
    var rest = len / (points - 1);
    var s = new Strand(points, rest);
    var l = Math.sqrt(dirx * dirx + diry * diry) || 1;
    dirx /= l; diry /= l;
    for (var i = 0; i < points; i++) {
      var px = x + dirx * rest * i;
      var py = y + diry * rest * i;
      s.x[i] = px; s.y[i] = py;
      s.ox[i] = px - dirx * 1.2; s.oy[i] = py - diry * 1.2;
    }
    s.color = color || '#ffc7e2';
    s.width = 2.2 * this.scale;
    this.strands.push(s);
    return s;
  };

  FiberSim.prototype.step = function (dt) {
    this.time += dt;
    var b = this.bounds, sc = this.scale;
    var g = this.gravity * sc;
    var wx = this.wind.x, wy = this.wind.y;
    var dt2 = dt * dt;

    for (var si = this.strands.length - 1; si >= 0; si--) {
      var s = this.strands[si];
      s.age += dt;
      var n = s.n;
      // ヴェルレ せきぶん
      for (var i = 0; i < n; i++) {
        if (s.pin[i]) { s.ox[i] = s.x[i]; s.oy[i] = s.y[i]; continue; }
        var vx = (s.x[i] - s.ox[i]) * this.drag;
        var vy = (s.y[i] - s.oy[i]) * this.drag;
        s.ox[i] = s.x[i]; s.oy[i] = s.y[i];
        s.x[i] += vx + (wx) * dt2;
        s.y[i] += vy + (g + wy) * dt2;
      }
      // こうそく
      for (var it = 0; it < this.iters; it++) {
        for (var k = 0; k < n - 1; k++) {
          var ax = s.x[k], ay = s.y[k], bx = s.x[k + 1], by = s.y[k + 1];
          var dx = bx - ax, dy = by - ay;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < 1e-5) continue;
          var diff = (d - s.rest) / d;
          var w1 = s.pin[k] ? 0 : (s.pin[k + 1] ? 1 : 0.5);
          var w2 = s.pin[k + 1] ? 0 : (s.pin[k] ? 1 : 0.5);
          s.x[k] += dx * diff * w1; s.y[k] += dy * diff * w1;
          s.x[k + 1] -= dx * diff * w2; s.y[k + 1] -= dy * diff * w2;
        }
      }
      // かべ
      for (var q = 0; q < n; q++) {
        if (s.pin[q]) continue;
        if (s.x[q] < b.x0) { s.x[q] = b.x0; s.ox[q] = s.x[q] + (s.ox[q] - s.x[q]) * 0.4; }
        if (s.x[q] > b.x1) { s.x[q] = b.x1; s.ox[q] = s.x[q] + (s.ox[q] - s.x[q]) * 0.4; }
        if (s.y[q] < b.y0) { s.y[q] = b.y0; s.oy[q] = s.y[q] + (s.oy[q] - s.y[q]) * 0.4; }
        if (s.y[q] > b.y1) {
          s.y[q] = b.y1;
          s.oy[q] = s.y[q] + (s.oy[q] - s.y[q]) * 0.35;
          s.ox[q] = s.x[q] + (s.ox[q] - s.x[q]) * 0.75;
        }
      }
      if (s.dead) this.strands.splice(si, 1);
    }
  };

  /* いとを ある ばしょへ ゆっくり ひきよせる（かぜに のって ちかづく） */
  FiberSim.prototype.homeTo = function (s, tx, ty, accel, dt) {
    var d2 = dt * dt;
    for (var i = 0; i < s.n; i++) {
      if (s.pin[i]) continue;
      var dx = tx - s.x[i], dy = ty - s.y[i];
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-3) continue;
      s.x[i] += (dx / d) * accel * d2;
      s.y[i] += (dy / d) * accel * d2;
    }
  };

  /* いとを ある ばしょへ すいよせる（ぼうに まきつく） */
  FiberSim.prototype.suck = function (s, tx, ty, rate, dt) {
    var k = 1 - Math.exp(-rate * dt);
    for (var i = 0; i < s.n; i++) {
      if (s.pin[i]) continue;
      s.x[i] += (tx - s.x[i]) * k;
      s.y[i] += (ty - s.y[i]) * k;
    }
  };

  /* いちばん ちかい いとの てん */
  FiberSim.prototype.nearest = function (x, y, maxR) {
    var best = null, bd = maxR * maxR;
    for (var si = 0; si < this.strands.length; si++) {
      var s = this.strands[si];
      for (var i = 0; i < s.n; i++) {
        var dx = s.x[i] - x, dy = s.y[i] - y;
        var d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = { s: s, i: i, d: Math.sqrt(d2) }; }
      }
    }
    return best;
  };

  /* えがく：ふわっとした いと */
  FiberSim.prototype.render = function (ctx, o) {
    o = o || {};
    var strands = this.strands;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ふんわり した そとがわ
    for (var pass = 0; pass < 2; pass++) {
      for (var si = 0; si < strands.length; si++) {
        var s = strands[si];
        if (s.n < 2) continue;
        ctx.beginPath();
        ctx.moveTo(s.x[0], s.y[0]);
        for (var i = 1; i < s.n - 1; i++) {
          var mx = (s.x[i] + s.x[i + 1]) * 0.5, my = (s.y[i] + s.y[i + 1]) * 0.5;
          ctx.quadraticCurveTo(s.x[i], s.y[i], mx, my);
        }
        ctx.lineTo(s.x[s.n - 1], s.y[s.n - 1]);
        if (pass === 0) {
          ctx.strokeStyle = U.rgba(s.color, 0.22);
          ctx.lineWidth = s.width * 4.5;
        } else {
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width;
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  YA.FiberSim = FiberSim;
  YA.Strand = Strand;

})(window);
