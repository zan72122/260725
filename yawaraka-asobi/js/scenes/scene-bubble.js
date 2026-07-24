/* =========================================================
   scene-bubble.js — あわあわ と しゃぼんだま の あそびば
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util, S = YA.Sprites;
  YA.Scenes = YA.Scenes || {};

  function BubbleScene(def) {
    this.def = def;
    this.foam = def.mode === 'foam';
    this.sim = new YA.BubbleSim(def.mode);
    this.palette = def.colors.map(function (c) { return c.c; });
    this.loops = {};
    this.starProgress = 0;
    this.time = 0;
    this.popped = 0;
    this.merged = 0;
    this.env = null;
  }

  BubbleScene.prototype.init = function (env) {
    this.env = env;
    this.resize(env.w, env.h, env.scale, env);
    this.reset(env);
    var self = this;
    this.sim.onPop = function (b) { self._onPop(b); };
    this.sim.onMerge = function (b) {
      self.merged++;
      if (self.env) {
        self.env.audio.play('drop', { freq: 300 + 4000 / Math.max(6, b.r), vol: 0.18, minGap: 60 });
        self.env.fx.ring(b.x, b.y, { r: b.r * 1.6, color: 'rgba(255,255,255,.8)', lw: 3, life: 0.35 });
        self._score(1.2, self.env);
      }
    };
  };

  BubbleScene.prototype.resize = function (w, h, scale, env) {
    this.w = w; this.h = h; this.scale = scale;
    this.sim.setBounds(0, 0, w, h, scale);
    this.sim.max = this.foam ? (YA.tier >= 2 ? 340 : 220) : (YA.tier >= 2 ? 170 : 110);
  };

  BubbleScene.prototype.reset = function (env) {
    var sim = this.sim, sc = this.scale;
    sim.clear();
    var amount = (env && env.amount) || 1;
    if (this.foam) {
      var n = Math.round(120 * amount);
      for (var i = 0; i < n; i++) {
        sim.spawn(U.rnd(this.w * 0.12, this.w * 0.88), U.rnd(this.h * 0.55, this.h * 0.95),
          U.rnd(10, 30) * sc, { life: U.rnd(30, 90) });
      }
    } else {
      var m = Math.round(14 * amount);
      for (var k = 0; k < m; k++) {
        var b = sim.spawn(U.rnd(this.w * 0.15, this.w * 0.85), U.rnd(this.h * 0.25, this.h * 0.8),
          U.rnd(20, 46) * sc, { life: U.rnd(40, 120) });
        if (b && Math.random() < 0.25) b.face = (Math.random() * S.FACES.length) | 0;
      }
    }
    this.popped = 0; this.merged = 0;
  };

  BubbleScene.prototype.dispose = function () {
    for (var k in this.loops) if (this.loops[k]) { this.loops[k].stop(); this.loops[k] = null; }
  };

  BubbleScene.prototype._onPop = function (b) {
    var env = this.env;
    if (!env) return;
    env.audio.play('pop', { freq: 240 + 9000 / Math.max(8, b.r), vol: U.clamp(0.14 + b.r / (240 * this.scale), .12, .34), minGap: 24 });
    env.fx.ring(b.x, b.y, { r: b.r * 2.1, color: U.hsl(b.hue, 90, 82, .9), lw: 3, life: 0.35 });
    var n = U.clamp(Math.round(b.r / (7 * this.scale)), 3, 12);
    env.fx.burst(b.x, b.y, n, ['#ffffff', U.hsl2hex(b.hue, 90, 82), U.hsl2hex(b.hue + 60, 90, 84)],
      { maxSpeed: 220, maxSize: 7 });
    env.fx.drops(b.x, b.y, 3, U.hsl2hex(b.hue, 85, 80), { maxSpeed: 160, gravity: 1200 });
  };

  /* ---------- こうしん ---------- */
  BubbleScene.prototype.update = function (dt, pointers, env) {
    this.env = env;
    var sim = this.sim, sc = this.scale;
    this.time += dt;
    sim.gravity = env.zeroG ? 0 : (this.foam ? 300 : 300);
    sim.wind.x *= Math.exp(-3 * dt);
    sim.wind.y *= Math.exp(-3 * dt);

    this._tools(dt, pointers, env);
    sim.step(dt);

    /* あわが たりなく なったら すこし ふやす（あそびが とまらないように） */
    if (this.foam && sim.count() < 26 && Math.random() < 0.12) {
      sim.spawn(U.rnd(this.w * 0.2, this.w * 0.8), this.h * 0.95, U.rnd(10, 24) * sc, { life: U.rnd(30, 80) });
    }
    if (!this.foam && sim.count() < 4 && Math.random() < 0.06) {
      sim.spawn(U.rnd(this.w * 0.2, this.w * 0.8), this.h * 0.8, U.rnd(20, 40) * sc, { life: U.rnd(40, 100) });
    }
  };

  BubbleScene.prototype._tools = function (dt, pointers, env) {
    var sim = this.sim, sc = this.scale, tool = env.tool, fx = env.fx;
    var blowing = false, bubbling = false;

    for (var i = 0; i < pointers.length; i++) {
      var p = pointers[i];
      if (!p.down) continue;

      switch (tool) {
        case 'bubble': {
          bubbling = true;
          if (Math.random() < 0.55) {
            var b = sim.spawn(p.x + U.rnd(-16, 16) * sc, p.y + U.rnd(-16, 16) * sc,
              U.rnd(8, 26) * sc, { vy: -U.rnd(20, 80) * sc, life: U.rnd(30, 80) });
            if (b) {
              this._score(0.35, env);
              env.audio.play('drop', { freq: U.rnd(500, 1300), vol: 0.10, minGap: 55 });
            }
          }
          break;
        }
        case 'wand': {
          bubbling = true;
          var speed = U.clamp(p.speed / (700 * sc), 0, 1.4);
          if (Math.random() < 0.25 + speed * 0.5) {
            var r = U.rnd(14, 34) * sc * (0.7 + speed * 0.7);
            var nb = sim.spawn(p.x, p.y, r, {
              vx: p.vx * 0.35, vy: p.vy * 0.35 - 30 * sc, life: U.rnd(30, 100)
            });
            if (nb) {
              if (Math.random() < 0.18) nb.face = (Math.random() * S.FACES.length) | 0;
              this._score(0.5, env);
              env.audio.play('drop', { freq: U.rnd(700, 1600), vol: 0.09, minGap: 60 });
              fx.spark(p.x, p.y, { color: '#ffffff', size: 5, life: 0.4 });
            }
          }
          break;
        }
        case 'pop': {
          var got = sim.popAt(p.x, p.y, 22 * sc);
          if (got.length) {
            this.popped += got.length;
            this._score(got.length * 1.6, env);
            YA.Haptics.fire('pop');
            if (this.popped % 12 === 0 && env.say) env.say(U.pick(['パチパチ！', 'たくさん われた！', 'じょうず〜！']));
          }
          break;
        }
        case 'poke': {
          for (var k = 0; k < sim.list.length; k++) {
            var q = sim.list[k];
            var d = U.dist(q.x, q.y, p.x, p.y);
            if (d < 90 * sc) {
              var f = 1 - d / (90 * sc);
              var dx = (q.x - p.x) / (d || 1), dy = (q.y - p.y) / (d || 1);
              q.vx += dx * 620 * sc * f * dt * 12;
              q.vy += dy * 620 * sc * f * dt * 12;
              q.vx += p.vx * 0.5 * f; q.vy += p.vy * 0.5 * f;
              q.wobA = Math.min(0.45, q.wobA + f * 0.05);
            }
          }
          this._score(0.05, env);
          break;
        }
        case 'blow': {
          blowing = true;
          var bx = p.vx, by = p.vy;
          if (U.len(bx, by) < 80 * sc) { bx = 0; by = -300 * sc; }
          sim.wind.x = bx * 1.6; sim.wind.y = by * 1.6;
          if (Math.random() < 0.4) fx.puff(p.x, p.y, { vx: bx * 0.3 / sc, vy: by * 0.3 / sc, r: U.rnd(10, 22), alpha: 0.2 });
          this._score(0.04, env);
          break;
        }
        case 'glitter': {
          fx.spark(p.x + U.rnd(-20, 20) * sc, p.y + U.rnd(-20, 20) * sc,
            { color: U.rainbow(Math.random()), size: U.rnd(4, 9), life: 0.8 });
          for (var m = 0; m < sim.list.length; m++) {
            var bb = sim.list[m];
            if (U.dist(bb.x, bb.y, p.x, p.y) < 70 * sc) bb.hue = (bb.hue + 220 * dt * 8) % 360;
          }
          env.audio.play('sparkle', { notes: 1, freq: U.rnd(1600, 2800), vol: 0.4, minGap: 80 });
          this._score(0.15, env);
          break;
        }
      }
    }

    if (bubbling && !this.loops.pour) this.loops.pour = env.audio.loop('pourLoop');
    if (this.loops.pour) {
      if (bubbling) this.loops.pour.set(0.35, 0.9);
      else { this.loops.pour.stop(); this.loops.pour = null; }
    }
    if (blowing && !this.loops.wind) this.loops.wind = env.audio.loop('windLoop');
    if (this.loops.wind) {
      if (blowing) this.loops.wind.set(0.9, 0.7);
      else { this.loops.wind.stop(); this.loops.wind = null; }
    }
  };

  BubbleScene.prototype._score = function (v, env) {
    this.starProgress += v;
    if (this.starProgress >= 26) { this.starProgress = 0; env.addStars(1); }
  };

  BubbleScene.prototype.magic = function (env) {
    var sim = this.sim, sc = this.scale;
    if (this.foam) {
      for (var i = 0; i < 90; i++) {
        sim.spawn(U.rnd(this.w * 0.1, this.w * 0.9), U.rnd(this.h * 0.4, this.h * 0.95),
          U.rnd(10, 34) * sc, { vy: -U.rnd(60, 260) * sc, life: U.rnd(20, 60) });
      }
      if (env.say) env.say('もこもこ〜！');
    } else {
      for (var k = 0; k < 26; k++) {
        var b = sim.spawn(U.rnd(this.w * 0.1, this.w * 0.9), this.h * U.rnd(0.5, 0.95),
          U.rnd(16, 42) * sc, { vy: -U.rnd(100, 320) * sc, life: U.rnd(40, 110) });
        if (b && Math.random() < 0.3) b.face = (Math.random() * S.FACES.length) | 0;
      }
      if (env.say) env.say('しゃぼん だいはっせい！');
    }
    env.fx.confetti(this.w / 2, this.h * 0.5, 40);
    env.audio.play('fanfare');
    env.addStars(1);
    YA.Haptics.fire('success');
  };

  BubbleScene.prototype.shake = function (env) {
    var sim = this.sim, sc = this.scale;
    for (var i = 0; i < sim.list.length; i++) {
      sim.list[i].vx += U.rnd(-500, 500) * sc;
      sim.list[i].vy += U.rnd(-600, 200) * sc;
      sim.list[i].wobA = 0.35;
    }
    env.audio.play('sweep', { up: true });
  };

  /* ---------- えがく ---------- */
  BubbleScene.prototype.render = function (ctx, env) {
    this.sim.render(ctx);
    // おかおの ある あわ
    var L = this.sim.list;
    for (var i = 0; i < L.length; i++) {
      var b = L[i];
      if (b.face < 0) continue;
      S.drawFace(ctx, b.x, b.y, b.r * 0.62, b.wob * 0.2, S.FACES[b.face % S.FACES.length], 1);
    }
  };

  YA.Scenes.bubble = { create: function (def) { return new BubbleScene(def); } };

})(window);
