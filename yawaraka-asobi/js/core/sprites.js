/* =========================================================
   sprites.js — さきに つくっておく ちいさな え（はやく えがくため）
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util;

  var cache = new Map();
  var MAXCACHE = 420;

  function key() { return Array.prototype.join.call(arguments, '|'); }

  function getCached(k, w, h, draw) {
    var c = cache.get(k);
    if (c) return c;
    if (cache.size > MAXCACHE) cache.clear();
    var cv = U.makeCanvas(w, h);
    var ctx = cv.getContext('2d');
    draw(ctx, cv.width, cv.height);
    cache.set(k, cv);
    return cv;
  }

  /* サイズは とびとびに まるめて キャッシュを へらす */
  function bucket(r) {
    if (r < 8) return Math.max(2, Math.round(r));
    if (r < 24) return Math.round(r);
    if (r < 64) return Math.round(r / 2) * 2;
    return Math.round(r / 4) * 4;
  }

  var S = YA.Sprites = {};

  S.clear = function () { cache.clear(); };

  /* ---- ぷにっとした たま（メタボール用の こあ） ---- */
  /* core: しんの かたさ 0..1  (1に ちかいほど ふちが くっきり) */
  S.blob = function (color, r, core) {
    r = bucket(r); core = core === undefined ? 0.55 : core;
    var k = key('b', color, r, core.toFixed(2));
    var size = r * 2 + 4;
    return getCached(k, size, size, function (ctx, w) {
      var c = w / 2, rad = w / 2 - 1;
      var g = ctx.createRadialGradient(c, c, rad * core * 0.55, c, c, rad);
      g.addColorStop(0, U.rgba(color, 1));
      g.addColorStop(core, U.rgba(color, 1));
      g.addColorStop(U.clamp01(core + (1 - core) * 0.55), U.rgba(color, 0.72));
      g.addColorStop(1, U.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c, c, rad, 0, U.TAU); ctx.fill();
    });
  };

  /* ---- ふわっとした ひかり ---- */
  S.glow = function (color, r, strength) {
    r = bucket(r); strength = strength === undefined ? 0.6 : strength;
    var k = key('g', color, r, strength.toFixed(2));
    var size = r * 2 + 4;
    return getCached(k, size, size, function (ctx, w) {
      var c = w / 2, rad = w / 2 - 1;
      var g = ctx.createRadialGradient(c, c, 0, c, c, rad);
      g.addColorStop(0, U.rgba(color, strength));
      g.addColorStop(0.35, U.rgba(color, strength * 0.45));
      g.addColorStop(1, U.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c, c, rad, 0, U.TAU); ctx.fill();
    });
  };

  /* ---- つやつや ハイライト ---- */
  S.shine = function (r, alpha) {
    r = bucket(r); alpha = alpha === undefined ? 0.55 : alpha;
    var k = key('s', r, alpha.toFixed(2));
    var size = r * 2 + 4;
    return getCached(k, size, size, function (ctx, w) {
      var c = w / 2, rad = w / 2 - 1;
      var g = ctx.createRadialGradient(c, c, 0, c, c, rad);
      g.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
      g.addColorStop(0.5, 'rgba(255,255,255,' + (alpha * 0.28) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c, c, rad, 0, U.TAU); ctx.fill();
    });
  };

  /* ---- ほし の きらきら ---- */
  S.spark = function (color, r) {
    r = bucket(r);
    var k = key('sp', color, r);
    var size = r * 2 + 4;
    return getCached(k, size, size, function (ctx, w) {
      var c = w / 2, rad = w / 2 - 2;
      var g = ctx.createRadialGradient(c, c, 0, c, c, rad);
      g.addColorStop(0, 'rgba(255,255,255,.95)');
      g.addColorStop(0.3, U.rgba(color, 0.75));
      g.addColorStop(1, U.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c, c, rad, 0, U.TAU); ctx.fill();
      // よんぼうせい
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.moveTo(c, 0); ctx.lineTo(c + rad * 0.16, c - rad * 0.16);
      ctx.lineTo(w, c); ctx.lineTo(c + rad * 0.16, c + rad * 0.16);
      ctx.lineTo(c, w); ctx.lineTo(c - rad * 0.16, c + rad * 0.16);
      ctx.lineTo(0, c); ctx.lineTo(c - rad * 0.16, c - rad * 0.16);
      ctx.closePath(); ctx.fill();
    });
  };

  /* ---- ハート ---- */
  S.heart = function (color, r) {
    r = bucket(r);
    var k = key('h', color, r);
    var size = r * 2 + 4;
    return getCached(k, size, size, function (ctx, w) {
      var c = w / 2;
      ctx.fillStyle = color;
      U.polyPath(ctx, U.shapes.heart(40), c, c, w / 2 - 2, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.ellipse(c - w * 0.14, c - w * 0.16, w * 0.09, w * 0.06, -0.5, 0, U.TAU); ctx.fill();
    });
  };

  /* ---- すなつぶ（ざらざら かん を だす） ---- */
  S.grain = function (color, r) {
    r = bucket(r);
    var k = key('gr', color, r);
    var size = Math.max(3, r * 2 + 2);
    return getCached(k, size, size, function (ctx, w) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2 - 0.5, 0, U.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(w * 0.36, w * 0.34, w * 0.16, 0, U.TAU); ctx.fill();
    });
  };

  /* ---- しゃぼんだま（にじいろ の まく） ---- */
  S.bubble = function (r, hue) {
    r = bucket(r); hue = Math.round(hue / 20) * 20;
    var k = key('bb', r, hue);
    var size = r * 2 + 6;
    return getCached(k, size, size, function (ctx, w) {
      var c = w / 2, rad = w / 2 - 2;
      // まくの にじいろ
      var g = ctx.createRadialGradient(c - rad * 0.2, c - rad * 0.25, rad * 0.1, c, c, rad);
      g.addColorStop(0.00, 'rgba(255,255,255,0.06)');
      g.addColorStop(0.55, U.hsl(hue, 90, 78, 0.10));
      g.addColorStop(0.78, U.hsl(hue + 60, 95, 72, 0.26));
      g.addColorStop(0.92, U.hsl(hue + 160, 95, 74, 0.42));
      g.addColorStop(1.00, U.hsl(hue + 220, 90, 82, 0.10));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c, c, rad, 0, U.TAU); ctx.fill();
      // ふちの ひかり
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = Math.max(1, rad * 0.06);
      ctx.beginPath(); ctx.arc(c, c, rad - ctx.lineWidth * 0.5, 0, U.TAU); ctx.stroke();
      // ハイライト
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath();
      ctx.ellipse(c - rad * 0.36, c - rad * 0.42, rad * 0.20, rad * 0.13, -0.7, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.ellipse(c + rad * 0.34, c + rad * 0.40, rad * 0.13, rad * 0.07, -0.6, 0, U.TAU);
      ctx.fill();
    });
  };

  /* ---- わたあめの ふわふわ ---- */
  S.fluff = function (color, r) {
    r = bucket(r);
    var k = key('fl', color, r);
    var size = r * 2 + 4;
    return getCached(k, size, size, function (ctx, w) {
      var c = w / 2;
      var rnd = U.mulberry32(1234 + r);
      for (var i = 0; i < 9; i++) {
        var a = rnd() * U.TAU, d = rnd() * w * 0.24;
        var rr = w * (0.14 + rnd() * 0.16);
        var g = ctx.createRadialGradient(c + Math.cos(a) * d, c + Math.sin(a) * d, 0,
          c + Math.cos(a) * d, c + Math.sin(a) * d, rr);
        g.addColorStop(0, U.rgba(color, 0.5));
        g.addColorStop(1, U.rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, rr, 0, U.TAU); ctx.fill();
      }
    });
  };

  /* =========================================================
     おかお（そざいに くっつく シール）
     ========================================================= */
  var FACES = ['smile', 'wink', 'happy', 'ohh', 'sleepy', 'love', 'cool', 'tongue'];
  S.FACES = FACES;

  S.drawFace = function (ctx, x, y, r, rot, type, squash) {
    type = type || 'smile';
    squash = squash === undefined ? 1 : squash;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.scale(1, squash);
    var eyeDx = r * 0.42, eyeY = -r * 0.14, eR = r * 0.15;
    ctx.fillStyle = '#3c2f36';
    ctx.strokeStyle = '#3c2f36';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.4, r * 0.09);

    function eyeDot(dx, sy) {
      ctx.beginPath(); ctx.ellipse(dx, eyeY, eR, eR * (sy === undefined ? 1.18 : sy), 0, 0, U.TAU); ctx.fill();
      // ほしめ
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(dx - eR * 0.3, eyeY - eR * 0.45, eR * 0.32, 0, U.TAU); ctx.fill();
      ctx.restore();
    }
    function eyeArc(dx, flip) {
      ctx.beginPath();
      ctx.arc(dx, eyeY + (flip ? eR * 0.4 : 0), eR * 1.15, flip ? 0 : Math.PI, flip ? Math.PI : 0, false);
      ctx.stroke();
    }
    function heartEye(dx) {
      ctx.save(); ctx.fillStyle = '#ff5c8d';
      U.polyPath(ctx, U.shapes.heart(24), dx, eyeY, eR * 1.5, 0);
      ctx.fill(); ctx.restore();
    }

    switch (type) {
      case 'wink': eyeDot(-eyeDx); eyeArc(eyeDx, false); break;
      case 'happy': eyeArc(-eyeDx, false); eyeArc(eyeDx, false); break;
      case 'sleepy': eyeArc(-eyeDx, true); eyeArc(eyeDx, true); break;
      case 'love': heartEye(-eyeDx); heartEye(eyeDx); break;
      case 'cool':
        ctx.fillStyle = '#3c2f36';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-eyeDx - eR * 1.6, eyeY - eR, eR * 3.2, eR * 1.9, eR * 0.5)
          : ctx.rect(-eyeDx - eR * 1.6, eyeY - eR, eR * 3.2, eR * 1.9);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(eyeDx - eR * 1.6, eyeY - eR, eR * 3.2, eR * 1.9, eR * 0.5)
          : ctx.rect(eyeDx - eR * 1.6, eyeY - eR, eR * 3.2, eR * 1.9);
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.beginPath(); ctx.moveTo(-eyeDx + eR * 1.6, eyeY); ctx.lineTo(eyeDx - eR * 1.6, eyeY); ctx.stroke();
        ctx.lineWidth = Math.max(1.4, r * 0.09);
        break;
      default: eyeDot(-eyeDx); eyeDot(eyeDx);
    }

    // ほっぺ
    ctx.fillStyle = 'rgba(255,140,180,.45)';
    ctx.beginPath(); ctx.ellipse(-r * 0.62, r * 0.16, r * 0.17, r * 0.11, 0, 0, U.TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.62, r * 0.16, r * 0.17, r * 0.11, 0, 0, U.TAU); ctx.fill();

    // くち
    ctx.strokeStyle = '#3c2f36';
    ctx.fillStyle = '#3c2f36';
    var my = r * 0.30;
    if (type === 'ohh') {
      ctx.beginPath(); ctx.ellipse(0, my, r * 0.16, r * 0.20, 0, 0, U.TAU); ctx.fill();
    } else if (type === 'tongue') {
      ctx.beginPath(); ctx.arc(0, my - r * 0.06, r * 0.24, 0.15, Math.PI - 0.15); ctx.stroke();
      ctx.fillStyle = '#ff7fa8';
      ctx.beginPath(); ctx.ellipse(0, my + r * 0.14, r * 0.13, r * 0.10, 0, 0, U.TAU); ctx.fill();
    } else if (type === 'happy' || type === 'love') {
      ctx.beginPath(); ctx.arc(0, my - r * 0.08, r * 0.26, 0.2, Math.PI - 0.2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, my - r * 0.10, r * 0.22, 0.35, Math.PI - 0.35); ctx.stroke();
    }
    ctx.restore();
  };

  /* かたぬきの アイコンを ちいさく えがく（ボタン用） */
  S.shapeIcon = function (name, size, color) {
    var k = key('si', name, size, color);
    return getCached(k, size, size, function (ctx, w) {
      var poly = (U.shapes[name] || U.shapes.star)();
      ctx.fillStyle = color;
      U.polyPath(ctx, poly, w / 2, w / 2, w / 2 - 2, 0);
      ctx.fill();
    });
  };

})(window);
