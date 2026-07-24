/* =========================================================
   fx.js — きらきら / かみふぶき / しぶき / もじ  の えんしゅつ
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util, S = YA.Sprites;

  var MAX = 900;

  function FX() {
    this.list = [];
    this.pool = [];
    this.bounds = { x: 0, y: 0, w: 100, h: 100 };
    this.scale = 1;
  }

  FX.prototype.setBounds = function (x, y, w, h, scale) {
    this.bounds.x = x; this.bounds.y = y; this.bounds.w = w; this.bounds.h = h;
    this.scale = scale || 1;
  };

  FX.prototype._get = function () {
    var p = this.pool.pop();
    if (!p) p = {};
    p.dead = false;
    return p;
  };

  FX.prototype.add = function (p) {
    if (this.list.length >= MAX) {
      // ふるいものを けす
      var old = this.list.shift();
      this.pool.push(old);
    }
    this.list.push(p);
    return p;
  };

  FX.prototype.clear = function () {
    for (var i = 0; i < this.list.length; i++) this.pool.push(this.list[i]);
    this.list.length = 0;
  };

  /* ---------- きらきら ---------- */
  FX.prototype.spark = function (x, y, o) {
    o = o || {};
    var s = this.scale;
    var p = this._get();
    p.type = 'spark';
    p.x = x; p.y = y;
    var a = o.angle === undefined ? U.rnd(0, U.TAU) : o.angle + U.rnd(-0.5, 0.5);
    var sp = (o.speed === undefined ? U.rnd(30, 130) : o.speed) * s;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
    p.g = (o.gravity === undefined ? 0 : o.gravity) * s;
    p.r = (o.size === undefined ? U.rnd(4, 9) : o.size) * s;
    p.r0 = p.r;
    p.life = p.maxLife = o.life === undefined ? U.rnd(0.5, 1.1) : o.life;
    p.color = o.color || '#fff3a8';
    p.drag = o.drag === undefined ? 2.4 : o.drag;
    p.rot = U.rnd(0, U.TAU); p.spin = U.rnd(-6, 6);
    return this.add(p);
  };

  FX.prototype.burst = function (x, y, n, color, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      this.spark(x, y, {
        color: Array.isArray(color) ? U.pick(color) : color,
        speed: U.rnd(o.minSpeed || 50, o.maxSpeed || 220),
        size: U.rnd(o.minSize || 4, o.maxSize || 10),
        life: U.rnd(0.45, 1.0),
        gravity: o.gravity || 0
      });
    }
  };

  /* ---------- かみふぶき ---------- */
  var CONF = ['#ff8fc0', '#ffd268', '#8fe3c6', '#8fd3ff', '#c2b1ff', '#ffffff', '#ffa46b'];
  FX.prototype.confetti = function (x, y, n, o) {
    o = o || {};
    var s = this.scale;
    for (var i = 0; i < n; i++) {
      var p = this._get();
      p.type = 'conf';
      p.x = x + U.rnd(-14, 14) * s; p.y = y + U.rnd(-14, 14) * s;
      var a = o.angle === undefined ? U.rnd(0, U.TAU) : o.angle + U.rnd(-1.0, 1.0);
      var sp = U.rnd(120, 420) * s;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - U.rnd(60, 200) * s;
      p.g = 780 * s;
      p.w = U.rnd(6, 13) * s; p.h = U.rnd(8, 16) * s;
      p.color = o.color || U.pick(CONF);
      p.life = p.maxLife = U.rnd(1.4, 2.6);
      p.rot = U.rnd(0, U.TAU); p.spin = U.rnd(-12, 12);
      p.flut = U.rnd(0, U.TAU);
      p.drag = 0.9;
      this.add(p);
    }
  };

  /* ---------- しぶき ---------- */
  FX.prototype.drops = function (x, y, n, color, o) {
    o = o || {};
    var s = this.scale;
    for (var i = 0; i < n; i++) {
      var p = this._get();
      p.type = 'drop';
      p.x = x; p.y = y;
      var a = (o.angle === undefined ? -Math.PI / 2 : o.angle) + U.rnd(-(o.spread || 1.1), (o.spread || 1.1));
      var sp = U.rnd(o.minSpeed || 90, o.maxSpeed || 340) * s;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.g = (o.gravity === undefined ? 1500 : o.gravity) * s;
      p.r = U.rnd(2.2, 5.5) * s;
      p.color = color || '#8fd3ff';
      p.life = p.maxLife = U.rnd(0.5, 1.2);
      p.drag = 0.35;
      p.trail = o.trail !== false;
      this.add(p);
    }
  };

  /* ---------- はねる わ ---------- */
  FX.prototype.ring = function (x, y, o) {
    o = o || {};
    var s = this.scale;
    var p = this._get();
    p.type = 'ring';
    p.x = x; p.y = y;
    p.r = (o.r0 === undefined ? 6 : o.r0) * s;
    p.rmax = (o.r === undefined ? 70 : o.r) * s;
    p.life = p.maxLife = o.life === undefined ? 0.5 : o.life;
    p.color = o.color || '#ffffff';
    p.lw = (o.lw === undefined ? 3 : o.lw) * s;
    return this.add(p);
  };

  /* ---------- ふわっと けむり ---------- */
  FX.prototype.puff = function (x, y, o) {
    o = o || {};
    var s = this.scale;
    var p = this._get();
    p.type = 'puff';
    p.x = x; p.y = y;
    p.vx = (o.vx || U.rnd(-30, 30)) * s;
    p.vy = (o.vy === undefined ? U.rnd(-60, -10) : o.vy) * s;
    p.r = (o.r === undefined ? U.rnd(14, 30) : o.r) * s;
    p.grow = (o.grow === undefined ? 40 : o.grow) * s;
    p.life = p.maxLife = o.life === undefined ? U.rnd(0.5, 1.0) : o.life;
    p.color = o.color || '#ffffff';
    p.alpha = o.alpha === undefined ? 0.5 : o.alpha;
    return this.add(p);
  };

  /* ---------- ハート ---------- */
  FX.prototype.heart = function (x, y, o) {
    o = o || {};
    var s = this.scale;
    var p = this._get();
    p.type = 'heart';
    p.x = x; p.y = y;
    p.vx = U.rnd(-30, 30) * s;
    p.vy = -U.rnd(60, 130) * s;
    p.r = (o.size || U.rnd(9, 16)) * s;
    p.color = o.color || U.pick(['#ff8fc0', '#ff6f9c', '#ffb3d1']);
    p.life = p.maxLife = U.rnd(0.9, 1.6);
    p.wob = U.rnd(0, U.TAU);
    return this.add(p);
  };

  /* ---------- うかぶ もじ ---------- */
  FX.prototype.text = function (x, y, str, o) {
    o = o || {};
    var s = this.scale;
    var p = this._get();
    p.type = 'text';
    p.x = x; p.y = y;
    p.vx = U.rnd(-16, 16) * s;
    p.vy = -110 * s;
    p.str = str;
    p.size = (o.size || 22) * s;
    p.color = o.color || '#ff6f9c';
    p.life = p.maxLife = o.life || 1.1;
    return this.add(p);
  };

  /* ---------- ほし（あつめる やつ） ---------- */
  FX.prototype.star = function (x, y, o) {
    o = o || {};
    var s = this.scale;
    var p = this._get();
    p.type = 'star';
    p.x = x; p.y = y;
    p.vx = U.rnd(-90, 90) * s;
    p.vy = -U.rnd(150, 320) * s;
    p.g = 620 * s;
    p.r = (o.size || U.rnd(10, 17)) * s;
    p.color = o.color || '#ffd268';
    p.life = p.maxLife = U.rnd(1.0, 1.7);
    p.rot = U.rnd(0, U.TAU); p.spin = U.rnd(-8, 8);
    return this.add(p);
  };

  /* ---------- こうしん ---------- */
  FX.prototype.update = function (dt) {
    var b = this.bounds;
    var out = [];
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { p.dead = true; }

      switch (p.type) {
        case 'spark':
          p.vy += (p.g || 0) * dt;
          var d = Math.exp(-(p.drag || 2.4) * dt);
          p.vx *= d; p.vy *= d;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot += p.spin * dt;
          break;
        case 'conf':
          p.vy += p.g * dt;
          p.flut += dt * 9;
          p.vx += Math.cos(p.flut) * 90 * this.scale * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot += p.spin * dt;
          if (p.y > b.h + 40) p.dead = true;
          break;
        case 'drop':
          p.vy += p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y > b.h - 2) {
            p.dead = true;
          }
          break;
        case 'ring':
          p.r = U.lerp(p.r, p.rmax, 1 - Math.exp(-7 * dt));
          break;
        case 'puff':
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= Math.exp(-1.4 * dt); p.vy *= Math.exp(-1.4 * dt);
          p.r += p.grow * dt;
          break;
        case 'heart':
          p.wob += dt * 5;
          p.x += (p.vx + Math.cos(p.wob) * 40 * this.scale) * dt;
          p.y += p.vy * dt;
          p.vy *= Math.exp(-0.6 * dt);
          break;
        case 'text':
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vy *= Math.exp(-2.2 * dt);
          break;
        case 'star':
          p.vy += p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot += p.spin * dt;
          if (p.y > b.h - 6 && p.vy > 0) { p.vy *= -0.45; p.vx *= 0.7; p.y = b.h - 6; }
          break;
      }
      if (!p.dead) out.push(p); else this.pool.push(p);
    }
    this.list = out;
  };

  /* ---------- えがく ---------- */
  FX.prototype.render = function (ctx) {
    if (this.list.length === 0) return;
    ctx.save();
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      var t = U.clamp01(p.life / p.maxLife);
      switch (p.type) {
        case 'spark': {
          var a = t < 0.25 ? t / 0.25 : 1;
          ctx.globalAlpha = a;
          ctx.globalCompositeOperation = 'lighter';
          var r = p.r0 * (0.35 + t * 0.85);
          var sp = YA.Sprites.spark(p.color, r);
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'conf': {
          ctx.globalAlpha = Math.min(1, t * 2.2);
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.scale(1, Math.max(0.15, Math.cos(p.flut)));
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
          break;
        }
        case 'drop': {
          ctx.globalAlpha = Math.min(1, t * 2.4);
          ctx.fillStyle = p.color;
          var st = U.clamp(U.len(p.vx, p.vy) / (900 * this.scale), 0, 1.6);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * (1 + st), p.r / (1 + st * 0.5), 0, 0, U.TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.45)';
          ctx.beginPath(); ctx.arc(-p.r * 0.2, -p.r * 0.25, p.r * 0.3, 0, U.TAU); ctx.fill();
          ctx.restore();
          break;
        }
        case 'ring': {
          ctx.globalAlpha = t * 0.85;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.lw * t;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.stroke();
          break;
        }
        case 'puff': {
          ctx.globalAlpha = t * p.alpha;
          var g = YA.Sprites.glow(p.color, p.r, 0.85);
          ctx.drawImage(g, p.x - g.width / 2, p.y - g.height / 2);
          break;
        }
        case 'heart': {
          ctx.globalAlpha = Math.min(1, t * 1.6);
          var hs = YA.Sprites.heart(p.color, p.r);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.cos(p.wob) * 0.25);
          ctx.drawImage(hs, -hs.width / 2, -hs.height / 2);
          ctx.restore();
          break;
        }
        case 'text': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.font = '800 ' + p.size + 'px "Hiragino Maru Gothic ProN","M PLUS Rounded 1c",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = p.size * 0.28;
          ctx.strokeStyle = 'rgba(255,255,255,.9)';
          ctx.lineJoin = 'round';
          ctx.strokeText(p.str, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.str, p.x, p.y);
          break;
        }
        case 'star': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.strokeStyle = 'rgba(255,255,255,.9)';
          ctx.lineWidth = p.r * 0.2; ctx.lineJoin = 'round';
          U.polyPath(ctx, U.shapes.star(5, 0.45), 0, 0, p.r, 0);
          ctx.stroke(); ctx.fill();
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  };

  YA.FX = FX;

})(window);
