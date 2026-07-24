/* =========================================================
   util.js — きほんの どうぐばこ
   数学 / 乱数 / 色 / 図形 / 空間ハッシュ
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = (YA.util = {});

  /* ---------- 数学 ---------- */
  var TAU = (U.TAU = Math.PI * 2);
  U.PI = Math.PI;

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.clamp01 = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.invLerp = function (a, b, v) { return b === a ? 0 : (v - a) / (b - a); };
  U.smoothstep = function (t) { t = U.clamp01(t); return t * t * (3 - 2 * t); };
  U.smootherstep = function (t) { t = U.clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  U.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };
  U.dist = function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); };
  U.dist2 = function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
  U.len = function (x, y) { return Math.sqrt(x * x + y * y); };
  U.angleLerp = function (a, b, t) {
    var d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return a + d * t;
  };
  /* フレームレートに依存しない減衰 */
  U.damp = function (cur, target, lambda, dt) {
    return U.lerp(target, cur, Math.exp(-lambda * dt));
  };
  /* 点と線分の距離 */
  U.segDist = function (px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) return U.dist(px, py, ax, ay);
    var t = U.clamp01(((px - ax) * dx + (py - ay) * dy) / l2);
    return U.dist(px, py, ax + dx * t, ay + dy * t);
  };

  /* ---------- 乱数 ---------- */
  U.rnd = function (a, b) {
    if (a === undefined) return Math.random();
    if (b === undefined) { b = a; a = 0; }
    return a + Math.random() * (b - a);
  };
  U.rndInt = function (a, b) { return Math.floor(U.rnd(a, b + 1)); };
  U.rndSign = function () { return Math.random() < 0.5 ? -1 : 1; };
  U.chance = function (p) { return Math.random() < p; };
  U.pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  /* 種つき乱数（同じ見た目を再現したいとき） */
  U.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /* なめらかな 1Dノイズ（風などに使う） */
  U.noise1 = (function () {
    var p = new Float32Array(256);
    for (var i = 0; i < 256; i++) p[i] = Math.random();
    return function (x) {
      var xi = Math.floor(x), xf = x - xi;
      var a = p[xi & 255], b = p[(xi + 1) & 255];
      var t = xf * xf * (3 - 2 * xf);
      return a + (b - a) * t;
    };
  })();

  /* ---------- 色 ---------- */
  function hx(v) { var s = (v | 0).toString(16); return s.length < 2 ? '0' + s : s; }

  U.hex2rgb = function (hex) {
    if (typeof hex !== 'string') return { r: 255, g: 255, b: 255 };
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  U.rgb2hex = function (r, g, b) {
    return '#' + hx(U.clamp(r, 0, 255)) + hx(U.clamp(g, 0, 255)) + hx(U.clamp(b, 0, 255));
  };
  U.mixHex = function (a, b, t) {
    var A = U.hex2rgb(a), B = U.hex2rgb(b);
    return U.rgb2hex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
  };
  U.shade = function (hex, amt) { // amt: -1(黒) .. 1(白)
    var c = U.hex2rgb(hex);
    if (amt >= 0) return U.rgb2hex(c.r + (255 - c.r) * amt, c.g + (255 - c.g) * amt, c.b + (255 - c.b) * amt);
    var k = 1 + amt;
    return U.rgb2hex(c.r * k, c.g * k, c.b * k);
  };
  U.rgba = function (hex, a) {
    var c = U.hex2rgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  };
  U.hsl = function (h, s, l, a) {
    return 'hsla(' + ((h % 360) + 360) % 360 + ',' + s + '%,' + l + '%,' + (a === undefined ? 1 : a) + ')';
  };
  U.hsl2hex = function (h, s, l) {
    h = (((h % 360) + 360) % 360) / 360; s /= 100; l /= 100;
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      var f = function (t) {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3);
    }
    return U.rgb2hex(r * 255, g * 255, b * 255);
  };
  U.rainbow = function (t, l) { return U.hsl2hex((t * 360) % 360, 92, l === undefined ? 68 : l); };

  /* ---------- 図形（かたぬき用ポリゴン） ---------- */
  var S = (U.shapes = {});

  S.circle = function (n) {
    n = n || 28; var p = [];
    for (var i = 0; i < n; i++) { var a = i / n * TAU; p.push(Math.cos(a), Math.sin(a)); }
    return p;
  };
  S.star = function (points, inner) {
    points = points || 5; inner = inner || 0.46;
    var p = [], n = points * 2;
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + i / n * TAU;
      var r = (i % 2 === 0) ? 1 : inner;
      p.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return p;
  };
  S.heart = function (n) {
    n = n || 40; var p = [];
    for (var i = 0; i < n; i++) {
      var t = i / n * TAU;
      var x = 16 * Math.pow(Math.sin(t), 3);
      var y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      p.push(x / 17, y / 17);
    }
    return p;
  };
  S.flower = function (petals, n) {
    petals = petals || 6; n = n || 60; var p = [];
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU;
      var r = 0.62 + 0.38 * Math.abs(Math.cos(a * petals / 2));
      p.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return p;
  };
  S.bear = function () {
    // くまさん：あたま + みみ
    var p = [], i, a;
    for (i = 0; i < 40; i++) {
      a = -Math.PI / 2 + i / 40 * TAU;
      var r = 0.82;
      // 左右のみみ
      var ear1 = Math.exp(-Math.pow((a - (-Math.PI / 2 - 0.85)) * 3.2, 2)) * 0.42;
      var ear2 = Math.exp(-Math.pow((a - (-Math.PI / 2 + 0.85)) * 3.2, 2)) * 0.42;
      r += ear1 + ear2;
      p.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return p;
  };
  S.square = function (round) {
    var p = [], n = 32;
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU;
      var c = Math.cos(a), s = Math.sin(a), k = round || 4;
      var d = Math.pow(Math.pow(Math.abs(c), k) + Math.pow(Math.abs(s), k), -1 / k);
      p.push(c * d, s * d);
    }
    return p;
  };
  S.triangle = function () {
    var p = [];
    for (var i = 0; i < 3; i++) { var a = -Math.PI / 2 + i / 3 * TAU; p.push(Math.cos(a), Math.sin(a)); }
    return p;
  };
  S.moon = function (n) {
    n = n || 46; var p = [], i, a;
    for (i = 0; i <= n / 2; i++) { a = -Math.PI / 2 + i / (n / 2) * Math.PI; p.push(Math.cos(a), Math.sin(a)); }
    for (i = n / 2; i >= 0; i--) { a = -Math.PI / 2 + i / (n / 2) * Math.PI; p.push(Math.cos(a) * 0.35 + 0.30, Math.sin(a)); }
    return p;
  };
  S.fish = function (n) {
    n = n || 44; var p = [];
    for (var i = 0; i < n; i++) {
      var t = i / n * TAU;
      var x = Math.cos(t), y = Math.sin(t) * 0.58;
      if (x < -0.55) { y *= 2.0; x = -0.55 + (x + 0.55) * 1.5; }
      p.push(x, y);
    }
    return p;
  };

  /* ポリゴン: 内外判定 + 最近傍点 */
  U.polyInside = function (poly, x, y) {
    var inside = false, n = poly.length / 2;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = poly[i * 2], yi = poly[i * 2 + 1], xj = poly[j * 2], yj = poly[j * 2 + 1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)) inside = !inside;
    }
    return inside;
  };
  U.polyNearest = function (poly, x, y, out) {
    var n = poly.length / 2, best = Infinity, bx = x, by = y;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var ax = poly[j * 2], ay = poly[j * 2 + 1], cx = poly[i * 2], cy = poly[i * 2 + 1];
      var dx = cx - ax, dy = cy - ay, l2 = dx * dx + dy * dy;
      var t = l2 < 1e-9 ? 0 : U.clamp01(((x - ax) * dx + (y - ay) * dy) / l2);
      var px = ax + dx * t, py = ay + dy * t;
      var d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) { best = d; bx = px; by = py; }
    }
    out.x = bx; out.y = by; out.d = Math.sqrt(best);
    return out;
  };
  U.polyPath = function (ctx, poly, cx, cy, s, rot) {
    var n = poly.length / 2, co = Math.cos(rot || 0), si = Math.sin(rot || 0);
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var x = poly[i * 2] * s, y = poly[i * 2 + 1] * s;
      var rx = x * co - y * si, ry = x * si + y * co;
      if (i === 0) ctx.moveTo(cx + rx, cy + ry); else ctx.lineTo(cx + rx, cy + ry);
    }
    ctx.closePath();
  };

  /* なめらかな閉曲線（Catmull-Rom → ベジェ） */
  U.smoothClosedPath = function (ctx, pts) {
    var n = pts.length / 2;
    if (n < 3) return;
    ctx.beginPath();
    var mx = (pts[0] + pts[(n - 1) * 2]) / 2, my = (pts[1] + pts[(n - 1) * 2 + 1]) / 2;
    ctx.moveTo(mx, my);
    for (var i = 0; i < n; i++) {
      var cx = pts[i * 2], cy = pts[i * 2 + 1];
      var nx = pts[((i + 1) % n) * 2], ny = pts[((i + 1) % n) * 2 + 1];
      ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
    }
    ctx.closePath();
  };

  /* ---------- 空間ハッシュ（きんじょ さがし） ---------- */
  function SpatialHash(cell) {
    this.cell = cell || 32;
    this.map = new Map();
  }
  SpatialHash.prototype.clear = function () { this.map.clear(); };
  SpatialHash.prototype.key = function (cx, cy) { return cx * 73856093 ^ cy * 19349663; };
  SpatialHash.prototype.insert = function (x, y, id) {
    var k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    var b = this.map.get(k);
    if (!b) { b = []; this.map.set(k, b); }
    b.push(id);
  };
  SpatialHash.prototype.query = function (x, y, r, out) {
    out.length = 0;
    var c = this.cell;
    var x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    var y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var b = this.map.get(this.key(cx, cy));
        if (b) for (var i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  };
  U.SpatialHash = SpatialHash;

  /* ---------- 便利 ---------- */
  U.now = function () { return (global.performance && performance.now) ? performance.now() : Date.now(); };

  U.makeCanvas = function (w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    return c;
  };

  U.el = function (id) { return document.getElementById(id); };

  U.on = function (el, ev, fn, opt) {
    if (!el) return;
    ev.split(' ').forEach(function (e) { el.addEventListener(e, fn, opt || false); });
  };

  /* ざつな端末せいのう推定（0=よわい 1=ふつう 2=つよい） */
  U.deviceTier = function () {
    var cores = navigator.hardwareConcurrency || 2;
    var mem = navigator.deviceMemory || 2;
    var px = (screen.width * screen.height);
    var score = 0;
    if (cores >= 4) score++;
    if (cores >= 6) score++;
    if (mem >= 4) score++;
    if (px > 900000) score++;
    if (score >= 3) return 2;
    if (score >= 1) return 1;
    return 0;
  };

})(window);
