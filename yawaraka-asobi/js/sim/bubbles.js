/* =========================================================
   bubbles.js — あわ と しゃぼんだま
   ・foam : つみかさなる あわあわ（せっけんの あわ）
   ・soap : ふわふわ うかぶ しゃぼんだま（がったい する）
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util;

  function Bubble() { this.reset(0, 0, 10); }
  Bubble.prototype.reset = function (x, y, r) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.r = r; this.r0 = r;
    this.hue = U.rnd(0, 360);
    this.ph = U.rnd(0, U.TAU);
    this.wob = 0; this.wobA = 0;
    this.life = U.rnd(14, 40);
    this.dead = false;
    this.spin = U.rnd(-1, 1);
    this.face = -1;
    return this;
  };

  function BubbleSim(mode) {
    this.mode = mode || 'foam';
    this.list = [];
    this.pool = [];
    this.bounds = { x0: 0, y0: 0, x1: 100, y1: 100 };
    this.scale = 1;
    this.hash = new U.SpatialHash(40);
    this._q = [];
    this.gravity = 300;
    this.wind = { x: 0, y: 0 };
    this.time = 0;
    this.onPop = null;
    this.onMerge = null;
    this.max = 320;
  }

  BubbleSim.prototype.setBounds = function (x0, y0, x1, y1, scale) {
    this.bounds.x0 = x0; this.bounds.y0 = y0; this.bounds.x1 = x1; this.bounds.y1 = y1;
    this.scale = scale || 1;
  };

  BubbleSim.prototype.clear = function () {
    for (var i = 0; i < this.list.length; i++) this.pool.push(this.list[i]);
    this.list.length = 0;
  };

  BubbleSim.prototype.spawn = function (x, y, r, o) {
    if (this.list.length >= this.max) return null;
    var b = this.pool.pop() || new Bubble();
    b.reset(x, y, r);
    if (o) {
      if (o.vx !== undefined) b.vx = o.vx;
      if (o.vy !== undefined) b.vy = o.vy;
      if (o.hue !== undefined) b.hue = o.hue;
      if (o.life !== undefined) b.life = o.life;
    }
    this.list.push(b);
    return b;
  };

  /* しるしを つけるだけ。つぎの step で おとと エフェクトを だして きえる */
  BubbleSim.prototype.popAt = function (x, y, r) {
    var out = [];
    for (var i = this.list.length - 1; i >= 0; i--) {
      var b = this.list[i];
      if (b.dead) continue;
      var d = U.dist(b.x, b.y, x, y);
      if (d < r + b.r * 0.85) {
        b.dead = true;
        out.push(b);
      }
    }
    return out;
  };

  BubbleSim.prototype._kill = function (i) {
    var b = this.list[i];
    this.list.splice(i, 1);
    this.pool.push(b);
  };

  BubbleSim.prototype.count = function () { return this.list.length; };

  /* ---------- こうしん ---------- */
  BubbleSim.prototype.step = function (dt) {
    var L = this.list, n = L.length;
    if (n === 0) return;
    this.time += dt;
    var s = this.scale, b = this.bounds;
    var foam = this.mode === 'foam';
    var i, j, p;

    /* ちから */
    for (i = 0; i < n; i++) {
      p = L[i];
      if (foam) {
        p.vy += this.gravity * s * dt;
        // ちいさい あわほど うきやすい
        p.vy -= (18 * s) * dt * (12 * s / Math.max(4 * s, p.r));
      } else {
        // しゃぼんだま：ほぼ むじゅうりょく＋そらの ながれ
        var t = this.time * 0.35;
        var nx = (U.noise1(p.x * 0.006 + t) - 0.5);
        var ny = (U.noise1(p.y * 0.006 - t + 33) - 0.5);
        p.vx += nx * 190 * s * dt;
        p.vy += ny * 150 * s * dt;
        p.vy += (this.gravity * 0.16 * s) * dt;
        p.vy -= (26 * s) * dt * (14 * s / Math.max(5 * s, p.r));
      }
      p.vx += this.wind.x * dt;
      p.vy += this.wind.y * dt;
      var drag = Math.exp(-(foam ? 4.2 : 1.5) * dt);
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.ph += dt * (2 + p.r * 0.02);
      p.wobA *= Math.exp(-3.2 * dt);
      p.wob += p.spin * dt;
      p.life -= dt;
      if (p.life <= 0) p.dead = true;
    }

    /* ぶつかり（くうかんハッシュ） */
    var cell = 0;
    for (i = 0; i < n; i++) cell = Math.max(cell, L[i].r);
    this.hash.cell = Math.max(12, cell * 2);
    this.hash.clear();
    for (i = 0; i < n; i++) this.hash.insert(L[i].x, L[i].y, i);

    var q = this._q;
    var iterations = foam ? 2 : 1;
    for (var it = 0; it < iterations; it++) {
      for (i = 0; i < n; i++) {
        p = L[i];
        if (p.dead) continue;
        this.hash.query(p.x, p.y, p.r * 2, q);
        for (var k = 0; k < q.length; k++) {
          j = q[k];
          if (j <= i) continue;
          var o = L[j];
          if (o.dead) continue;
          var dx = o.x - p.x, dy = o.y - p.y;
          var d2 = dx * dx + dy * dy;
          var rr = p.r + o.r;
          if (d2 >= rr * rr || d2 < 1e-6) continue;
          var d = Math.sqrt(d2);
          var ov = rr - d;
          var ux = dx / d, uy = dy / d;

          if (!foam && ov > rr * 0.42 && Math.random() < 0.16) {
            // しゃぼんだま が がったい
            var nr = Math.sqrt(p.r * p.r + o.r * o.r);
            if (nr < 78 * s) {
              p.x = (p.x * p.r + o.x * o.r) / (p.r + o.r);
              p.y = (p.y * p.r + o.y * o.r) / (p.r + o.r);
              p.vx = (p.vx * p.r + o.vx * o.r) / (p.r + o.r);
              p.vy = (p.vy * p.r + o.vy * o.r) / (p.r + o.r);
              p.r = p.r0 = nr;
              p.wobA = 0.32;
              o.dead = true;
              if (this.onMerge) this.onMerge(p);
              continue;
            }
          }

          // やわらかく おしあう（あわは まくで つぶれる）
          var soft = foam ? 0.34 : 0.5;
          var push = ov * soft;
          var m1 = o.r / rr, m2 = p.r / rr;
          p.x -= ux * push * m1; p.y -= uy * push * m1;
          o.x += ux * push * m2; o.y += uy * push * m2;
          var rel = (o.vx - p.vx) * ux + (o.vy - p.vy) * uy;
          if (rel < 0) {
            var imp = rel * (foam ? 0.35 : 0.55);
            p.vx += ux * imp * m1; p.vy += uy * imp * m1;
            o.vx -= ux * imp * m2; o.vy -= uy * imp * m2;
          }
          p.wobA = Math.min(0.4, p.wobA + ov * 0.004);
          o.wobA = Math.min(0.4, o.wobA + ov * 0.004);
          if (foam) {
            // ひょうめんちょうりょくで くっつきあう
            p.vx += ux * 26 * s * dt; p.vy += uy * 26 * s * dt;
            o.vx -= ux * 26 * s * dt; o.vy -= uy * 26 * s * dt;
          }
        }
      }

      /* かべ */
      for (i = 0; i < n; i++) {
        p = L[i];
        if (p.x - p.r < b.x0) { p.x = b.x0 + p.r; if (p.vx < 0) p.vx *= -0.35; p.wobA = Math.min(.4, p.wobA + .12); }
        if (p.x + p.r > b.x1) { p.x = b.x1 - p.r; if (p.vx > 0) p.vx *= -0.35; p.wobA = Math.min(.4, p.wobA + .12); }
        if (p.y - p.r < b.y0) { p.y = b.y0 + p.r; if (p.vy < 0) p.vy *= -0.35; p.wobA = Math.min(.4, p.wobA + .12); }
        if (p.y + p.r > b.y1) {
          p.y = b.y1 - p.r;
          if (p.vy > 0) p.vy *= foam ? -0.12 : -0.42;
          p.vx *= foam ? 0.86 : 0.96;
          p.wobA = Math.min(.4, p.wobA + .1);
        }
      }
    }

    /* しんだ あわを かたづける */
    for (i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].dead) {
        var bb = this.list[i];
        if (this.onPop) this.onPop(bb);
        this._kill(i);
      }
    }
  };

  /* ---------- えがく ---------- */
  BubbleSim.prototype.render = function (ctx, o) {
    o = o || {};
    var L = this.list, n = L.length;
    var foam = this.mode === 'foam';
    var i, p;

    if (foam) {
      // 1) しろい あわの ほんたい
      ctx.save();
      for (i = 0; i < n; i++) {
        p = L[i];
        var wob = 1 + Math.sin(p.ph) * 0.03 + p.wobA * 0.5;
        var g = ctx.createRadialGradient(
          p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.05,
          p.x, p.y, p.r * wob);
        var hue = (p.hue + this.time * 12) % 360;
        g.addColorStop(0, 'rgba(255,255,255,0.92)');
        g.addColorStop(0.62, U.hsl(hue, 70, 92, 0.55));
        g.addColorStop(0.90, U.hsl(hue + 50, 85, 84, 0.60));
        g.addColorStop(1, U.hsl(hue + 90, 80, 90, 0.30));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * wob, p.r / wob, p.wob * 0.2, 0, U.TAU);
        ctx.fill();
      }
      // 2) ふちの まく
      ctx.lineWidth = Math.max(1, 1.4 * this.scale);
      for (i = 0; i < n; i++) {
        p = L[i];
        ctx.strokeStyle = U.hsl((p.hue + this.time * 12 + 40) % 360, 90, 80, 0.55);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.97, 0, U.TAU);
        ctx.stroke();
      }
      // 3) ハイライト
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (i = 0; i < n; i++) {
        p = L[i];
        if (p.r < 5 * this.scale) continue;
        ctx.beginPath();
        ctx.ellipse(p.x - p.r * 0.35, p.y - p.r * 0.42, p.r * 0.20, p.r * 0.13, -0.7, 0, U.TAU);
        ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.save();
      for (i = 0; i < n; i++) {
        p = L[i];
        var wobS = 1 + Math.sin(p.ph * 1.3) * 0.035 + p.wobA * 0.55;
        var sp = YA.Sprites.bubble(p.r * 1.05, (p.hue + this.time * 22) % 360);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.wob * 0.3);
        ctx.scale(wobS, 1 / wobS);
        ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
        ctx.restore();
      }
      ctx.restore();
    }
  };

  YA.BubbleSim = BubbleSim;

})(window);
