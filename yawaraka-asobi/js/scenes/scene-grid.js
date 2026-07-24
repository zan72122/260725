/* =========================================================
   scene-grid.js — すな と ゆき の あそびば
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util, S = YA.Sprites;
  YA.Scenes = YA.Scenes || {};
  var T = YA.SandGrid.TYPE;

  function GridScene(def) {
    this.def = def;
    this.grid = new YA.SandGrid();
    this.isSnow = def.id === 'snow';
    this.palette = def.colors.map(function (c) { return c.c; });
    this.loops = {};
    this.starProgress = 0;
    this.time = 0;
    this.snowfall = this.isSnow ? 1 : 0;
    this.stampCool = 0;
    this.decor = [];   // ゆきだるま の め など
    this.acc = 0;
  }

  GridScene.prototype.init = function (env) {
    this.resize(env.w, env.h, env.scale, env);
    this.reset(env);
  };

  GridScene.prototype.resize = function (w, h, scale, env) {
    this.w = w; this.h = h; this.scale = scale;
    var cell = Math.max(2, Math.round((this.def.cellSize || 3.5) * scale * (env && env.quality ? 1 : 1.4)));
    var changed = this.grid.resize(w, h, cell);
    this.grid.setColors(this._colorOverrides(0));
    return changed;
  };

  GridScene.prototype._colorOverrides = function (idx) {
    var c = this.palette[idx] || this.palette[0];
    if (this.isSnow) {
      return { 4: c, 5: U.shade(c, -0.10), 3: '#5fb6f0', 6: '#a8dcf5', 8: '#ffe9fb' };
    }
    return { 1: c, 2: U.shade(c, -0.28), 3: '#5fb6f0', 8: '#ffe9fb' };
  };

  GridScene.prototype.reset = function (env) {
    var g = this.grid;
    g.clear();
    this.decor.length = 0;
    var amount = (env && env.amount) || 1;
    if (this.isSnow) {
      var base = Math.floor(g.h * (1 - 0.16 * amount));
      for (var y = base; y < g.h; y++) {
        for (var x = 0; x < g.w; x++) {
          var bump = Math.sin(x * 0.06) * 3 + Math.sin(x * 0.017 + 2) * 5;
          if (y > base + bump * 0.4) g.set(x, y, T.SNOW);
        }
      }
    } else {
      var b2 = Math.floor(g.h * (1 - 0.34 * amount));
      for (var yy = b2; yy < g.h; yy++) {
        for (var xx = 0; xx < g.w; xx++) {
          var dune = Math.sin(xx * 0.02) * 8 + Math.sin(xx * 0.055 + 1.4) * 4;
          if (yy > b2 + dune * 0.5) g.set(xx, yy, T.SAND);
        }
      }
    }
    this.starProgress = 0;
  };

  GridScene.prototype.dispose = function () {
    for (var k in this.loops) if (this.loops[k]) { this.loops[k].stop(); this.loops[k] = null; }
  };

  /* ---------- ざひょう へんかん ---------- */
  GridScene.prototype.gx = function (x) { return x / this.grid.cell; };
  GridScene.prototype.gy = function (y) { return y / this.grid.cell; };

  /* ---------- こうしん ---------- */
  GridScene.prototype.update = function (dt, pointers, env) {
    var g = this.grid, sc = this.scale;
    this.time += dt;
    g.gdir = env.zeroG ? 0 : 1;

    this._tools(dt, pointers, env);

    /* ゆきが しぜんに ふる */
    if (this.isSnow && this.snowfall > 0 && g.count < g.w * g.h * 0.42) {
      var num = Math.max(1, Math.round(g.w * 0.03 * this.snowfall));
      for (var i = 0; i < num; i++) {
        if (Math.random() < 0.55) g.set((Math.random() * g.w) | 0, 0, T.SNOW);
      }
    }

    /* セルオートマトンの こうしん（フレームおちを ふせぐため 1〜2かい） */
    var steps = env.slow ? 1 : 2;
    for (var s = 0; s < steps; s++) g.step();
    g.wind *= 0.86;
  };

  GridScene.prototype._tools = function (dt, pointers, env) {
    var g = this.grid, sc = this.scale, tool = env.tool, fx = env.fx;
    var pouring = false, digging = false, blowing = false;
    var cell = g.cell;

    for (var i = 0; i < pointers.length; i++) {
      var p = pointers[i];
      if (!p.down) continue;
      var cx = this.gx(p.x), cy = this.gy(p.y);
      var r;

      switch (tool) {
        case 'pour': {
          pouring = true;
          r = 18 * sc / cell;
          var t = this.isSnow ? T.SNOW : T.SAND;
          var n = g.paintCircle(cx, cy - 2, Math.max(2, r), t, 0.55);
          if (n > 0) this._score(n * 0.02, env);
          if (Math.random() < 0.3) fx.spark(p.x + U.rnd(-14, 14) * sc, p.y, {
            color: this.palette[env.colorIdx] || '#fff', size: U.rnd(2, 5), life: 0.4, gravity: 900
          });
          break;
        }
        case 'dig': {
          digging = true;
          r = 22 * sc / cell;
          var d = g.eraseCircle(cx, cy, Math.max(2, r));
          if (d > 4) {
            this._score(d * 0.015, env);
            env.audio.play('squish', { strength: 0.3, pitch: 1.6, minGap: 120 });
            for (var k = 0; k < 3; k++) {
              fx.spark(p.x + U.rnd(-20, 20) * sc, p.y + U.rnd(-20, 20) * sc,
                { color: this.grid.baseColors[this.isSnow ? 4 : 1], size: U.rnd(3, 7), gravity: 1200, life: 0.5 });
            }
            YA.Haptics.fire('soft');
          }
          break;
        }
        case 'water': {
          pouring = true;
          r = 12 * sc / cell;
          g.paintCircle(cx, cy, Math.max(2, r), T.WATER, 0.5);
          env.audio.play('drop', { minGap: 130, vol: 0.15 });
          fx.drops(p.x, p.y, 2, '#7fc8f5', { maxSpeed: 120, gravity: 1800 });
          this._score(0.15, env);
          break;
        }
        case 'pack': {
          r = 30 * sc / cell;
          var c = g.convertCircle(cx, cy, Math.max(3, r), T.SNOW, T.PACK);
          if (c > 6) {
            env.audio.play('squish', { strength: 0.55, pitch: 0.7, minGap: 200 });
            YA.Haptics.fire('squish');
            this._score(c * 0.03, env);
            if (Math.random() < 0.4) fx.ring(p.x, p.y, { r: 46 * sc, color: 'rgba(255,255,255,.9)', lw: 4 });
          }
          break;
        }
        case 'heat': {
          r = 26 * sc / cell;
          var m = g.convertCircle(cx, cy, Math.max(3, r), T.SNOW, T.WATER);
          m += g.convertCircle(cx, cy, Math.max(3, r), T.PACK, T.WATER);
          m += g.convertCircle(cx, cy, Math.max(3, r), T.ICE, T.WATER);
          if (m > 0) {
            env.audio.play('sweep', { up: true, minGap: 500 });
            this._score(m * 0.02, env);
            if (Math.random() < 0.6) fx.puff(p.x + U.rnd(-16, 16) * sc, p.y, { r: U.rnd(10, 18), alpha: 0.3, vy: -80 });
          }
          break;
        }
        case 'blow': {
          blowing = true;
          g.wind = U.clamp(p.vx / (400 * sc), -0.6, 0.6);
          // ゆびの ちかくの つぶを とばす
          r = Math.max(3, 30 * sc / cell);
          var cnt = 0;
          for (var yy = Math.max(0, (cy - r) | 0); yy < Math.min(g.h, cy + r); yy++) {
            for (var xx = Math.max(0, (cx - r) | 0); xx < Math.min(g.w, cx + r); xx++) {
              var tt = g.get(xx, yy);
              if (tt === T.EMPTY || tt === T.WALL) continue;
              if (Math.random() > 0.25) continue;
              var nx = xx + Math.sign(p.vx || 1) * (1 + (Math.random() * 3 | 0));
              var ny = yy - (Math.random() * 2 | 0);
              if (g.get(nx, ny) === T.EMPTY) { g.set(nx, ny, tt); g.set(xx, yy, T.EMPTY); cnt++; }
            }
          }
          if (cnt > 0 && Math.random() < 0.4) {
            fx.puff(p.x, p.y, { vx: p.vx * 0.3 / sc, vy: -20, r: U.rnd(12, 24), alpha: 0.18 });
            this._score(0.05, env);
          }
          break;
        }
        case 'stamp': {
          if (p.justDown && this.stampCool <= 0) {
            var poly = (U.shapes[env.stamp] || U.shapes.star)();
            var size = 60 * sc / cell;
            var type = this.isSnow ? T.PACK : T.WET;
            var filled = g.fillPoly(poly, cx, cy, size, 0, type);
            if (filled > 0) {
              env.audio.play('thump', { vol: 0.9 });
              YA.Haptics.fire('heavy');
              env.fx.ring(p.x, p.y, { r: 120 * sc, color: 'rgba(255,255,255,.9)', lw: 6, life: .6 });
              env.fx.burst(p.x, p.y, 12, ['#fff', this.palette[env.colorIdx]], { maxSpeed: 240 });
              this._score(3, env);
              if (env.say) env.say(U.pick(['できた！', 'すごーい！', 'ぺったん！']));
            }
          }
          break;
        }
        case 'glitter': {
          r = 10 * sc / cell;
          g.paintCircle(cx, cy, Math.max(1, r), T.GLIT, 0.4);
          env.audio.play('sparkle', { notes: 1, freq: U.rnd(1500, 2600), vol: 0.5, minGap: 80 });
          fx.spark(p.x, p.y, { color: '#fff0ff', size: 7, life: 0.5 });
          this._score(0.2, env);
          break;
        }
      }
    }

    /* おと（ループ） */
    if (pouring && !this.loops.pour) this.loops.pour = env.audio.loop('pourLoop');
    if (this.loops.pour) {
      if (pouring) this.loops.pour.set(0.85, this.isSnow ? 0.35 : 0.75);
      else { this.loops.pour.stop(); this.loops.pour = null; }
    }
    if (blowing && !this.loops.wind) this.loops.wind = env.audio.loop('windLoop');
    if (this.loops.wind) {
      if (blowing) this.loops.wind.set(0.9, 0.6);
      else { this.loops.wind.stop(); this.loops.wind = null; }
    }
    if (this.stampCool > 0) this.stampCool -= dt;
  };

  GridScene.prototype._score = function (v, env) {
    this.starProgress += v;
    if (this.starProgress >= 26) { this.starProgress = 0; env.addStars(1); }
  };

  /* ---------- まほう ---------- */
  GridScene.prototype.magic = function (env) {
    var g = this.grid, sc = this.scale;
    if (this.isSnow) {
      // ふぶき！
      for (var i = 0; i < g.w * 2; i++) g.set((Math.random() * g.w) | 0, (Math.random() * 6) | 0, T.SNOW);
      g.wind = U.rndSign() * 0.55;
      env.audio.play('sweep', { up: false });
      if (env.say) env.say('ゆきだ〜！');
    } else {
      // にじいろ すな の ふんすい
      for (var k = 0; k < 380; k++) {
        var x = (g.w * 0.5 + U.rnd(-g.w * 0.16, g.w * 0.16)) | 0;
        g.set(x, (Math.random() * 8) | 0, Math.random() < 0.25 ? T.GLIT : T.SAND);
      }
      env.audio.play('sparkle', { notes: 5 });
      if (env.say) env.say('すなの ふんすい！');
    }
    env.fx.confetti(this.w / 2, this.h * 0.35, 44);
    env.addStars(1);
    YA.Haptics.fire('success');
  };

  GridScene.prototype.shake = function (env) {
    var g = this.grid;
    g.wind = U.rndSign() * 0.6;
    for (var y = 1; y < g.h - 1; y++) {
      for (var x = 1; x < g.w - 1; x++) {
        var i = y * g.w + x;
        if (g.type[i] === T.PACK && Math.random() < 0.4) g.type[i] = T.SNOW;
        if (g.type[i] === T.WET && Math.random() < 0.25) g.type[i] = T.SAND;
      }
    }
    g.rowActive.fill(1);
    env.audio.play('squish', { strength: 0.5, pitch: 1.4 });
  };

  /* ---------- えがく ---------- */
  GridScene.prototype.render = function (ctx, env) {
    var g = this.grid;
    g.setColors(this._colorOverrides(env.colorIdx));
    g.render(ctx, 0, 0, this.w, this.h, { smooth: this.isSnow });

    // ゆきの きらめき
    if (this.isSnow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var sc = this.scale;
      for (var i = 0; i < 12; i++) {
        var t = this.time * 1.6 + i * 2.1;
        var x = (Math.sin(t * 0.7 + i) * 0.5 + 0.5) * this.w;
        var top = g.columnTop(Math.floor(x / g.cell));
        if (top >= g.h) continue;
        var y = top * g.cell;
        var a = 0.4 + 0.6 * Math.sin(this.time * 5 + i * 1.7);
        if (a <= 0.1) continue;
        var sp = S.spark('#ffffff', 5 * sc);
        ctx.globalAlpha = a * 0.55;
        ctx.drawImage(sp, x - sp.width / 2, y - sp.height / 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
  };

  YA.Scenes.grid = { create: function (def) { return new GridScene(def); } };

})(window);
