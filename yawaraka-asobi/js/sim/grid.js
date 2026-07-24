/* =========================================================
   grid.js — おちる すな の セルオートマトン
   すな / ぬれたすな / みず / ゆき / かたゆき / こおり / きらきら
   すなば と ゆきあそび を ほんものっぽく
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util;

  var EMPTY = 0, SAND = 1, WET = 2, WATER = 3, SNOW = 4, PACK = 5, ICE = 6, WALL = 7, GLIT = 8;

  var TYPE = { EMPTY: EMPTY, SAND: SAND, WET: WET, WATER: WATER, SNOW: SNOW, PACK: PACK, ICE: ICE, WALL: WALL, GLIT: GLIT };

  /* いろ（4だんかいの あかるさ） */
  var PALETTE = {};
  function buildPalette(base) {
    var p = {};
    for (var t in base) {
      var arr = [];
      var c = U.hex2rgb(base[t]);
      for (var s = 0; s < 4; s++) {
        var k = 0.86 + s * 0.095;
        arr.push([U.clamp(c.r * k, 0, 255) | 0, U.clamp(c.g * k, 0, 255) | 0, U.clamp(c.b * k, 0, 255) | 0]);
      }
      p[t] = arr;
    }
    return p;
  }

  function SandGrid() {
    this.w = 0; this.h = 0; this.cell = 4;
    this.type = null; this.shade = null; this.moved = null; this.extra = null;
    this.rowActive = null;
    this.frame = 0;
    this.gdir = 1;
    this.wind = 0;
    this.img = null; this.imgData = null; this.buf = null; this.cv = null; this.cctx = null;
    this.colors = {};
    this.setColors({});
    this.count = 0;
  }

  SandGrid.prototype.setColors = function (over) {
    var base = {
      1: over[SAND] || '#e8c88a',
      2: over[WET] || '#c19a5c',
      3: over[WATER] || '#5fb6f0',
      4: over[SNOW] || '#f4fbff',
      5: over[PACK] || '#dcecfa',
      6: over[ICE] || '#a8dcf5',
      7: over[WALL] || '#b9a6c9',
      8: over[GLIT] || '#ffd9f2'
    };
    this.baseColors = base;
    this.pal = buildPalette(base);
  };

  SandGrid.prototype.resize = function (wpx, hpx, cell) {
    this.cell = Math.max(2, cell | 0);
    var w = Math.max(4, Math.floor(wpx / this.cell));
    var h = Math.max(4, Math.floor(hpx / this.cell));
    if (w === this.w && h === this.h) return false;
    var oldT = this.type, ow = this.w, oh = this.h;
    this.w = w; this.h = h;
    var n = w * h;
    this.type = new Uint8Array(n);
    this.shade = new Uint8Array(n);
    this.moved = new Uint8Array(n);
    this.extra = new Uint8Array(n);
    this.rowActive = new Uint8Array(h);
    // ふるい ないようを ざっくり うつす
    if (oldT && ow > 0) {
      for (var y = 0; y < h; y++) {
        var sy = Math.floor(y * oh / h);
        for (var x = 0; x < w; x++) {
          var sx = Math.floor(x * ow / w);
          this.type[y * w + x] = oldT[sy * ow + sx];
          this.shade[y * w + x] = (Math.random() * 4) | 0;
        }
      }
    }
    this.cv = U.makeCanvas(w, h);
    this.cctx = this.cv.getContext('2d');
    this.imgData = this.cctx.createImageData(w, h);
    this.buf = new Uint32Array(this.imgData.data.buffer);
    return true;
  };

  SandGrid.prototype.idx = function (x, y) { return y * this.w + x; };
  SandGrid.prototype.inside = function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; };
  SandGrid.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return WALL;
    return this.type[y * this.w + x];
  };
  SandGrid.prototype.set = function (x, y, t, sh) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    var i = y * this.w + x;
    this.type[i] = t;
    this.shade[i] = sh === undefined ? ((Math.random() * 4) | 0) : sh;
    if (t !== EMPTY) { this.rowActive[y] = 1; if (y > 0) this.rowActive[y - 1] = 1; }
  };

  SandGrid.prototype.clear = function () {
    this.type.fill(0); this.extra.fill(0); this.rowActive.fill(0);
  };

  /* ---------- でんぱ ルール ---------- */
  function isLiquid(t) { return t === WATER; }
  function isStatic(t) { return t === WALL || t === ICE || t === PACK; }
  function isPowder(t) { return t === SAND || t === SNOW || t === GLIT || t === WET; }

  SandGrid.prototype.swap = function (a, b) {
    var t = this.type[a]; this.type[a] = this.type[b]; this.type[b] = t;
    var s = this.shade[a]; this.shade[a] = this.shade[b]; this.shade[b] = s;
    var e = this.extra[a]; this.extra[a] = this.extra[b]; this.extra[b] = e;
    this.moved[a] = 1; this.moved[b] = 1;
  };

  SandGrid.prototype.step = function () {
    this.frame++;
    var w = this.w, h = this.h, T = this.type, M = this.moved, E = this.extra;
    M.fill(0);
    var dir = (this.frame & 1) ? 1 : -1;
    var g = this.gdir;
    var newRow = this.rowActive;
    var nextActive = new Uint8Array(h);
    var count = 0;

    var yStart = g >= 0 ? h - 2 : 1;
    var yEnd = g >= 0 ? -1 : h;
    var yStep = g >= 0 ? -1 : 1;

    for (var y = yStart; y !== yEnd; y += yStep) {
      if (!newRow[y]) continue;
      var xs = dir > 0 ? 0 : w - 1;
      var xe = dir > 0 ? w : -1;
      for (var x = xs; x !== xe; x += dir) {
        var i = y * w + x;
        var t = T[i];
        if (t === EMPTY) continue;
        count++;
        nextActive[y] = 1;
        if (y > 0) nextActive[y - 1] = 1;
        if (y < h - 1) nextActive[y + 1] = 1;
        if (M[i]) continue;
        if (isStatic(t)) {
          // ささえが なければ おちる
          var below0 = this.get(x, y + g);
          if (below0 === EMPTY && t !== WALL) this.swap(i, (y + g) * w + x);
          continue;
        }

        var dy = g;
        var below = this.get(x, y + dy);
        var bi = (y + dy) * w + x;

        // みずの なかを すなが しずむ
        if (isPowder(t) && below === WATER) {
          this.swap(i, bi);
          if (t === SAND) { T[bi] = WET; }
          continue;
        }
        if (below === EMPTY) {
          if (t === SNOW && (this.frame & 1)) { /* ゆきは ゆっくり */ }
          else { this.swap(i, bi); continue; }
        }

        // ななめ
        var slip = 1;
        if (t === SNOW) slip = 0.34;         // ゆきは たかく つもる
        else if (t === WET) slip = 0.12;     // ぬれたすなは かたちを たもつ
        else if (t === GLIT) slip = 0.9;
        if (Math.random() < slip) {
          var d1 = Math.random() < 0.5 ? -1 : 1;
          for (var k = 0; k < 2; k++) {
            var nx = x + (k === 0 ? d1 : -d1);
            var c = this.get(nx, y + dy);
            if (c === EMPTY || (isPowder(t) && c === WATER)) {
              var ni = (y + dy) * w + nx;
              this.swap(i, ni);
              if (t === SAND && c === WATER) T[ni] = WET;
              break;
            }
          }
        }

        // みずは よこにも ひろがる
        if (t === WATER && !M[i]) {
          var moveDir = (E[i] === 1 ? -1 : 1);
          var moved = false;
          for (var s = 0; s < 2 && !moved; s++) {
            var dx2 = s === 0 ? moveDir : -moveDir;
            var steps = 3;
            for (var q = 1; q <= steps; q++) {
              var tx = x + dx2 * q;
              if (this.get(tx, y) !== EMPTY) break;
              if (this.get(tx, y + dy) === EMPTY) { this.swap(i, y * w + tx); moved = true; break; }
              if (q === steps) { this.swap(i, y * w + tx); moved = true; }
            }
            if (!moved) E[i] = E[i] === 1 ? 0 : 1;
          }
        }

        // ぬれたすなは すこしずつ かわく
        if (t === WET && Math.random() < 0.00035) T[i] = SAND;
      }
    }

    // かぜ
    if (this.wind !== 0) {
      var wdir = this.wind > 0 ? 1 : -1;
      var pw = Math.min(0.5, Math.abs(this.wind));
      for (var yy = 1; yy < h - 1; yy++) {
        if (!nextActive[yy]) continue;
        for (var xx = (wdir > 0 ? w - 2 : 1); (wdir > 0 ? xx >= 1 : xx <= w - 2); xx -= wdir) {
          var ii = yy * w + xx;
          var tt = T[ii];
          if ((tt === SNOW || tt === GLIT) && Math.random() < pw) {
            if (this.get(xx + wdir, yy) === EMPTY) this.swap(ii, yy * w + xx + wdir);
          }
        }
      }
    }

    this.rowActive = nextActive;
    this.count = count;
  };

  /* ---------- そうさ ---------- */

  /* まるく おく */
  SandGrid.prototype.paintCircle = function (cx, cy, r, t, density) {
    density = density === undefined ? 1 : density;
    var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    var n = 0;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        if (density < 1 && Math.random() > density) continue;
        var i = y * this.w + x;
        if (t === EMPTY || this.type[i] === EMPTY || t === WATER) {
          this.type[i] = t;
          this.shade[i] = (Math.random() * 4) | 0;
          n++;
        }
        this.rowActive[y] = 1;
        if (y > 0) this.rowActive[y - 1] = 1;
      }
    }
    return n;
  };

  /* けす（ほる） */
  SandGrid.prototype.eraseCircle = function (cx, cy, r) {
    var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    var n = 0;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        var i = y * this.w + x;
        if (this.type[i] !== EMPTY) { this.type[i] = EMPTY; n++; }
        this.rowActive[y] = 1;
      }
    }
    return n;
  };

  /* かえる（すな→ぬれすな、ゆき→かたゆき…） */
  SandGrid.prototype.convertCircle = function (cx, cy, r, from, to) {
    var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    var n = 0;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        var i = y * this.w + x;
        if (from === -1 ? this.type[i] !== EMPTY : this.type[i] === from) {
          this.type[i] = to; n++;
          this.rowActive[y] = 1;
        }
      }
    }
    return n;
  };

  /* かたちで うめる（かたぬき） */
  SandGrid.prototype.fillPoly = function (poly, cx, cy, s, rot, t) {
    var co = Math.cos(-rot || 0), si = Math.sin(-rot || 0);
    var r = s * 1.5;
    var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    var n = 0;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx, dy = y - cy;
        var lx = (dx * co - dy * si) / s, ly = (dx * si + dy * co) / s;
        if (!U.polyInside(poly, lx, ly)) continue;
        var i = y * this.w + x;
        this.type[i] = t;
        this.shade[i] = (Math.random() * 4) | 0;
        this.rowActive[y] = 1;
        n++;
      }
    }
    return n;
  };

  /* たかさ（やまの てっぺんを さがす） */
  SandGrid.prototype.columnTop = function (x) {
    if (x < 0 || x >= this.w) return this.h;
    for (var y = 0; y < this.h; y++) if (this.type[y * this.w + x] !== EMPTY) return y;
    return this.h;
  };

  SandGrid.prototype.countType = function (t) {
    var c = 0, T = this.type;
    for (var i = 0; i < T.length; i++) if (T[i] === t) c++;
    return c;
  };

  /* ---------- えがく ---------- */
  SandGrid.prototype.render = function (ctx, x, y, w, h, opts) {
    opts = opts || {};
    var buf = this.buf, T = this.type, S = this.shade, pal = this.pal;
    var n = T.length;
    for (var i = 0; i < n; i++) {
      var t = T[i];
      if (t === EMPTY) { buf[i] = 0; continue; }
      var c = pal[t];
      if (!c) { buf[i] = 0; continue; }
      var v = c[S[i] & 3];
      var a = (t === WATER) ? 214 : 255;
      buf[i] = (a << 24) | (v[2] << 16) | (v[1] << 8) | v[0];
    }
    this.cctx.putImageData(this.imgData, 0, 0);
    var sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = opts.smooth !== false;
    ctx.drawImage(this.cv, 0, 0, this.w, this.h, x, y, w, h);
    ctx.imageSmoothingEnabled = sm;
  };

  SandGrid.TYPE = TYPE;
  YA.SandGrid = SandGrid;

})(window);
