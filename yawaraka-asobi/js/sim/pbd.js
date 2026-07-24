/* =========================================================
   pbd.js — Position Based Dynamics ソルバ
   ・PBF（みっど こうそく）で えきたい
   ・きょり こうそく（ボンド）＋ そせいへんけい で ねんど / ゼリー / もち
   ・ねばり(XSPH) / ひょうめんちょうりょく / おんど / そうへんか
   ひとつの ソルバで 7しゅるいの そざいを ひょうげんする
   ========================================================= */
(function (global) {
  'use strict';
  var YA = global.YA || (global.YA = {});
  var U = YA.util;

  var MAXN = 30;     // きんじょ の さいだいすう
  var MAXB = 8;      // 1つぶ あたりの ボンド さいだいすう

  function PBD(cap) {
    cap = cap || 1400;
    this.cap = cap;
    this.n = 0;

    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.lam = new Float32Array(cap);
    this.den = new Float32Array(cap);
    this.temp = new Float32Array(cap);   // 0=つめたい 0.5=ふつう 1=あつい
    this.temp2 = new Float32Array(cap);
    this.col = new Uint8Array(cap);      // いろ ばんごう
    this.tag = new Uint8Array(cap);      // そざい じゆう フラグ
    this.age = new Float32Array(cap);
    this.dpx = new Float32Array(cap);
    this.dpy = new Float32Array(cap);

    this.nbr = new Int32Array(cap * MAXN);
    this.nbrN = new Int32Array(cap);

    // ボンド
    var bcap = cap * MAXB / 2 | 0;
    this.bcap = bcap;
    this.bA = new Int32Array(bcap);
    this.bB = new Int32Array(bcap);
    this.bRest = new Float32Array(bcap);
    this.bN = 0;
    this.pb = new Int32Array(cap * MAXB);
    this.pbN = new Uint8Array(cap);

    // グリッド
    this.cellStart = null;
    this.cellCount = null;
    this.sorted = new Int32Array(cap);
    this.gw = 0; this.gh = 0; this.cell = 20;

    // パラメータ（そざいごとに かきかえる）
    this.p = {
      spacing: 12,        // つぶの あいだ
      h: 26,              // カーネル はんけい
      rho0: 1,            // きじゅん みつど（じどう けいさん）
      fluidK: 1.0,        // みつど こうそくの つよさ
      clampNeg: true,     // ふくれる ほうこうは むし（えきたい むけ）
      scorrK: 0.0009,
      scorrN: 4,
      viscosity: 0.06,    // XSPH
      cohesion: 0.0,      // ひょうめんちょうりょく
      damping: 0.3,       // そくど げんすい（1びょう あたり）
      gravity: 1500,
      gravityX: 0,
      restitution: 0.12,
      friction: 0.16,
      iters: 3,
      maxVel: 2600,
      // ボンド
      useBonds: false,
      bondK: 0.6,
      yield: 0.16,        // これいじょう のびたら かたちが かわる（そせい）
      plastic: 0.55,      // かたちが かわる はやさ
      breakStretch: 2.6,  // これいじょう のびると ちぎれる
      formDist: 1.25,     // このきょり いないで くっつく（spacing ばい）
      reform: true,
      minRest: 0.55,      // spacing ばい
      maxRest: 2.2,
      // おんど
      useTemp: false,
      ambient: 0.5,
      tempDiffuse: 0.9,
      tempRelax: 0.06,
      meltT: 0.62,        // これいじょうで ボンドが とける
      freezeT: 0.45       // これいかで ボンドが できる
    };

    this.bounds = { x0: 0, y0: 0, x1: 100, y1: 100 };
    this.obstacles = [];
    this.grabs = [];
    this.fingers = [];      // ゆびの まる（まいフレーム シーンが いれなおす）
    this.scale = 1;
    this._frame = 0;
    this._tmp = { x: 0, y: 0, d: 0 };
    this._q = [];
  }

  /* ---------- カーネル ---------- */
  PBD.prototype._kern = function () {
    var h = this.p.h;
    this.h2 = h * h;
    this.poly6C = 4 / (Math.PI * Math.pow(h, 8));
    this.spikyC = -30 / (Math.PI * Math.pow(h, 5));
    var dq = 0.2 * h;
    this.wdq = this.poly6C * Math.pow(this.h2 - dq * dq, 3);
  };
  PBD.prototype.poly6 = function (r2) {
    if (r2 >= this.h2) return 0;
    var d = this.h2 - r2;
    return this.poly6C * d * d * d;
  };
  /* spiky の こうばい の おおきさ / r  （ベクトル は よびだしがわで かける） */
  PBD.prototype.spikyOverR = function (r) {
    var h = this.p.h;
    if (r >= h || r < 1e-6) return 0;
    var d = h - r;
    return this.spikyC * d * d / r;
  };

  /* きじゅんみつどを ろくかくラティスから けいさん */
  PBD.prototype.computeRestDensity = function () {
    this._kern();
    var s = this.p.spacing, h = this.p.h;
    var sum = this.poly6(0);
    var rows = Math.ceil(h / (s * 0.866)) + 1;
    for (var j = -rows; j <= rows; j++) {
      var yy = j * s * 0.866;
      var off = (j & 1) ? s * 0.5 : 0;
      var cols = Math.ceil(h / s) + 2;
      for (var i = -cols; i <= cols; i++) {
        var xx = i * s + off;
        if (i === 0 && j === 0) continue;
        var r2 = xx * xx + yy * yy;
        if (r2 < this.h2) sum += this.poly6(r2);
      }
    }
    this.p.rho0 = sum;

    /* λ の やわらげ こうを「ふつうの おおきさ」に あわせる。
       ここを ていすうに すると、がめんの おおきさ しだいで
       みつど こうそくが きかなく なって しまう。 */
    var gs = Math.abs(this.spikyOverR(s) * s / sum);
    var refSum2 = 14 * gs * gs;
    if (!isFinite(refSum2) || refSum2 <= 0) refSum2 = 1e-6;
    this.refSum2 = refSum2;
    this.lamEps = refSum2 * 0.10;   // ゆるめる ぐあい
    this.lamRef = 1 / refSum2;      // C=1 の ときの λ めやす
    return sum;
  };

  /* ---------- せってい ---------- */
  PBD.prototype.configure = function (params, scale) {
    this.scale = scale || 1;
    for (var k in params) if (params.hasOwnProperty(k)) this.p[k] = params[k];
    this.computeRestDensity();
    this.cell = this.p.h;
  };

  PBD.prototype.setBounds = function (x0, y0, x1, y1) {
    this.bounds.x0 = x0; this.bounds.y0 = y0; this.bounds.x1 = x1; this.bounds.y1 = y1;
    var c = this.cell = Math.max(6, this.p.h);
    this.gw = Math.max(1, Math.ceil((x1 - x0) / c) + 2);
    this.gh = Math.max(1, Math.ceil((y1 - y0) / c) + 2);
    var nc = this.gw * this.gh;
    if (!this.cellCount || this.cellCount.length < nc) {
      this.cellCount = new Int32Array(nc);
      this.cellStart = new Int32Array(nc + 1);
    }
    this.ncell = nc;
  };

  /* ---------- つぶを つくる ---------- */
  PBD.prototype.clear = function () {
    this.n = 0; this.bN = 0;
    for (var i = 0; i < this.cap; i++) this.pbN[i] = 0;
    this.grabs.length = 0;
  };

  PBD.prototype.addParticle = function (x, y, colIdx, temp) {
    if (this.n >= this.cap) return -1;
    var i = this.n++;
    this.x[i] = x; this.y[i] = y;
    this.px[i] = x; this.py[i] = y;
    this.vx[i] = 0; this.vy[i] = 0;
    this.col[i] = colIdx || 0;
    this.temp[i] = temp === undefined ? this.p.ambient : temp;
    this.tag[i] = 0;
    this.age[i] = 0;
    this.pbN[i] = 0;
    return i;
  };

  /* まるい かたまり */
  PBD.prototype.spawnDisc = function (cx, cy, count, colIdx, aspect) {
    aspect = aspect || 1;
    var s = this.p.spacing;
    // ろくかく つめこみで count こに ちかづける
    var r = Math.sqrt(count * s * s * 0.9 / Math.PI);
    var placed = 0, ring = 0;
    this.addParticle(cx, cy, colIdx);
    placed++;
    while (placed < count && ring < 200) {
      ring++;
      var rr = ring * s * 0.92;
      if (rr > r * 1.6) break;
      var cnt = Math.max(6, Math.round(U.TAU * rr / s));
      for (var k = 0; k < cnt && placed < count; k++) {
        var a = k / cnt * U.TAU + ring * 0.3;
        var px = cx + Math.cos(a) * rr;
        var py = cy + Math.sin(a) * rr / aspect;
        if (this.addParticle(px + U.rnd(-0.6, 0.6), py + U.rnd(-0.6, 0.6), colIdx) >= 0) placed++;
      }
    }
    return placed;
  };

  /* しかくい かたまり
     たいせつ：つぶは かならず spacing かんかくで ならべる。
     そうしないと ボンドが つながらず、ねんども ゼリーも
     ただの えきたいに なって しまう。
     count に あわせて わくの おおきさを ちょうせいする。
     anchor: 'center'（まんなか） / 'bottom'（したに ためる） */
  PBD.prototype.spawnRect = function (x0, y0, x1, y1, count, colIdx, anchor) {
    var s = this.p.spacing;
    var w = x1 - x0, h = y1 - y0;
    var need = count * s * s * 0.9;          // ろっかく つめこみの めんせき
    if (anchor === 'bottom') {
      var hh = U.clamp(need / Math.max(1, w), s, h);
      y0 = y1 - hh;
    } else {
      var k = Math.sqrt(need / Math.max(1, w * h));
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      w *= k; h *= k;
      x0 = cx - w / 2; x1 = cx + w / 2;
      y0 = cy - h / 2; y1 = cy + h / 2;
    }

    var dy = s * 0.866;
    var placed = 0, row = 0;
    for (var py = y0 + s * 0.5; py <= y1 - s * 0.35 || row === 0; py += dy) {
      var off = (row & 1) ? s * 0.5 : 0;
      for (var px = x0 + s * 0.5 + off; px <= x1 - s * 0.35; px += s) {
        if (placed >= count) return placed;
        if (this.addParticle(px + U.rnd(-0.4, 0.4), py + U.rnd(-0.4, 0.4), colIdx) >= 0) placed++;
      }
      row++;
      if (row > 400) break;
    }
    return placed;
  };

  /* ---------- ボンド ---------- */
  PBD.prototype.isBonded = function (i, j) {
    var b = i * MAXB, n = this.pbN[i];
    for (var k = 0; k < n; k++) if (this.pb[b + k] === j) return true;
    return false;
  };
  PBD.prototype.addBond = function (i, j, rest) {
    if (this.bN >= this.bcap) return false;
    if (this.pbN[i] >= MAXB || this.pbN[j] >= MAXB) return false;
    var b = this.bN++;
    this.bA[b] = i; this.bB[b] = j; this.bRest[b] = rest;
    this.pb[i * MAXB + this.pbN[i]++] = j;
    this.pb[j * MAXB + this.pbN[j]++] = i;
    return true;
  };
  PBD.prototype._unlink = function (i, j) {
    var b = i * MAXB, n = this.pbN[i];
    for (var k = 0; k < n; k++) {
      if (this.pb[b + k] === j) { this.pb[b + k] = this.pb[b + n - 1]; this.pbN[i] = n - 1; return; }
    }
  };
  PBD.prototype.removeBond = function (b) {
    var i = this.bA[b], j = this.bB[b];
    this._unlink(i, j); this._unlink(j, i);
    var last = --this.bN;
    if (b !== last) {
      this.bA[b] = this.bA[last]; this.bB[b] = this.bB[last]; this.bRest[b] = this.bRest[last];
    }
  };

  /* きんじょ どうしを ぜんぶ つなぐ（さいしょ） */
  PBD.prototype.buildBonds = function () {
    this.bN = 0;
    for (var i = 0; i < this.n; i++) this.pbN[i] = 0;
    this.buildGrid(this.x, this.y);
    this.findNeighbors(this.x, this.y);
    var maxD = this.p.spacing * this.p.formDist;
    for (var a = 0; a < this.n; a++) {
      var base = a * MAXN, cnt = this.nbrN[a];
      for (var k = 0; k < cnt; k++) {
        var b = this.nbr[base + k];
        if (b <= a) continue;
        var d = U.dist(this.x[a], this.y[a], this.x[b], this.y[b]);
        if (d <= maxD) this.addBond(a, b, d);
      }
    }
  };

  /* ---------- グリッド ＆ きんじょ ---------- */
  PBD.prototype.buildGrid = function (X, Y) {
    var c = this.cell, gw = this.gw, gh = this.gh;
    var x0 = this.bounds.x0 - c, y0 = this.bounds.y0 - c;
    var cc = this.cellCount, cs = this.cellStart, n = this.n;
    cc.fill(0, 0, this.ncell);
    var i, ci;
    this._ci = this._ci && this._ci.length >= n ? this._ci : new Int32Array(this.cap);
    for (i = 0; i < n; i++) {
      var gx = U.clamp(Math.floor((X[i] - x0) / c), 0, gw - 1);
      var gy = U.clamp(Math.floor((Y[i] - y0) / c), 0, gh - 1);
      ci = gy * gw + gx;
      this._ci[i] = ci;
      cc[ci]++;
    }
    var acc = 0;
    for (i = 0; i < this.ncell; i++) { cs[i] = acc; acc += cc[i]; }
    cs[this.ncell] = acc;
    var cursor = this._cursor && this._cursor.length >= this.ncell ? this._cursor : (this._cursor = new Int32Array(this.ncell + 1));
    cursor.set(cs.subarray(0, this.ncell));
    for (i = 0; i < n; i++) this.sorted[cursor[this._ci[i]]++] = i;
  };

  PBD.prototype.findNeighbors = function (X, Y) {
    var gw = this.gw, gh = this.gh, h2 = this.h2;
    var cs = this.cellStart, sorted = this.sorted, n = this.n;
    var nbr = this.nbr, nbrN = this.nbrN;
    for (var i = 0; i < n; i++) {
      var ci = this._ci[i];
      var gx = ci % gw, gy = (ci / gw) | 0;
      var cnt = 0, base = i * MAXN;
      var xi = X[i], yi = Y[i];
      for (var oy = -1; oy <= 1; oy++) {
        var yy = gy + oy; if (yy < 0 || yy >= gh) continue;
        for (var ox = -1; ox <= 1; ox++) {
          var xx = gx + ox; if (xx < 0 || xx >= gw) continue;
          var c2 = yy * gw + xx;
          var s = cs[c2], e = cs[c2 + 1];
          for (var k = s; k < e; k++) {
            var j = sorted[k];
            if (j === i) continue;
            var dx = X[j] - xi, dy = Y[j] - yi;
            var r2 = dx * dx + dy * dy;
            if (r2 < h2) {
              nbr[base + cnt++] = j;
              if (cnt >= MAXN) { oy = 2; ox = 2; break; }
            }
          }
        }
      }
      nbrN[i] = cnt;
    }
  };

  /* ---------- そとの ちから ---------- */
  PBD.prototype.applyForces = function (dt) {
    var p = this.p, n = this.n;
    var gy = p.gravity, gx = p.gravityX;
    var vx = this.vx, vy = this.vy;
    for (var i = 0; i < n; i++) {
      vx[i] += gx * dt;
      vy[i] += gy * dt;
      this.age[i] += dt;
    }
    if (p.cohesion > 0) this.applyCohesion(dt);
  };

  /* ひょうめんちょうりょく（つぶが たまに なろうとする） */
  PBD.prototype.applyCohesion = function (dt) {
    var n = this.n, h = this.p.h, k = this.p.cohesion;
    var X = this.x, Y = this.y, vx = this.vx, vy = this.vy;
    var nbr = this.nbr, nbrN = this.nbrN;
    for (var i = 0; i < n; i++) {
      var base = i * MAXN, cnt = nbrN[i];
      var fx = 0, fy = 0;
      for (var m = 0; m < cnt; m++) {
        var j = nbr[base + m];
        var dx = X[j] - X[i], dy = Y[j] - Y[i];
        var r = Math.sqrt(dx * dx + dy * dy);
        if (r < 1e-5 || r > h) continue;
        // r=h/2 で さいだい に なる スプライン
        var t = r / h;
        var w = (t < 0.5) ? (2 * t) : (2 - 2 * t);
        w = w * w * w;
        fx += dx / r * w; fy += dy / r * w;
      }
      vx[i] += fx * k * dt;
      vy[i] += fy * k * dt;
    }
  };

  /* ---------- みつど こうそく（PBF） ---------- */
  PBD.prototype.densitySolve = function () {
    var n = this.n, p = this.p, rho0 = p.rho0;
    var X = this.px, Y = this.py;
    var nbr = this.nbr, nbrN = this.nbrN;
    var lam = this.lam, den = this.den;
    var eps = this.lamEps;
    var i, m, j, dx, dy, r2, r;

    for (i = 0; i < n; i++) {
      var base = i * MAXN, cnt = nbrN[i];
      var d = this.poly6(0);
      var gix = 0, giy = 0, sum2 = 0;
      for (m = 0; m < cnt; m++) {
        j = nbr[base + m];
        dx = X[i] - X[j]; dy = Y[i] - Y[j];
        r2 = dx * dx + dy * dy;
        if (r2 >= this.h2) continue;
        d += this.poly6(r2);
        r = Math.sqrt(r2);
        var sc = this.spikyOverR(r) / rho0;
        var gx = dx * sc, gy = dy * sc;
        gix += gx; giy += gy;
        sum2 += gx * gx + gy * gy;
      }
      den[i] = d;
      var C = d / rho0 - 1;
      if (p.clampNeg && C < 0) { lam[i] = 0; continue; }
      sum2 += gix * gix + giy * giy;
      lam[i] = -C / (sum2 + eps);
    }

    var dpx = this.dpx, dpy = this.dpy;
    var k = p.scorrK * this.lamRef, nn = p.scorrN, wdq = this.wdq, fk = p.fluidK;
    for (i = 0; i < n; i++) {
      var base2 = i * MAXN, cnt2 = nbrN[i];
      var ax = 0, ay = 0, li = lam[i];
      for (m = 0; m < cnt2; m++) {
        j = nbr[base2 + m];
        dx = X[i] - X[j]; dy = Y[i] - Y[j];
        r2 = dx * dx + dy * dy;
        if (r2 >= this.h2) continue;
        r = Math.sqrt(r2);
        var scorr = 0;
        if (k > 0) {
          var w = this.poly6(r2) / wdq;
          scorr = -k * Math.pow(w, nn);
        }
        var sp = this.spikyOverR(r);
        var f = (li + lam[j] + scorr) * sp;
        ax += dx * f; ay += dy * f;
      }
      dpx[i] = ax / rho0 * fk;
      dpy[i] = ay / rho0 * fk;
    }
    for (i = 0; i < n; i++) { X[i] += dpx[i]; Y[i] += dpy[i]; }
  };

  /* ---------- ボンド こうそく ---------- */
  PBD.prototype.bondSolve = function (kPrime) {
    var X = this.px, Y = this.py;
    var A = this.bA, B = this.bB, R = this.bRest, n = this.bN;
    for (var b = 0; b < n; b++) {
      var i = A[b], j = B[b];
      var dx = X[j] - X[i], dy = Y[j] - Y[i];
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-6) continue;
      var diff = (d - R[b]) / d * 0.5 * kPrime;
      var ox = dx * diff, oy = dy * diff;
      X[i] += ox; Y[i] += oy;
      X[j] -= ox; Y[j] -= oy;
    }
  };

  /* そせい へんけい ＋ ちぎれ（1フレームに 1かい） */
  PBD.prototype.bondPlastic = function (dt) {
    var p = this.p;
    var X = this.x, Y = this.y;
    var A = this.bA, B = this.bB, R = this.bRest;
    var s = this.p.spacing;
    var minR = s * p.minRest, maxR = s * p.maxRest;
    var yieldT = p.yield, rate = U.clamp01(p.plastic * dt * 60 * 0.06);
    var brk = p.breakStretch;
    for (var b = this.bN - 1; b >= 0; b--) {
      var i = A[b], j = B[b];
      var d = U.dist(X[i], Y[i], X[j], Y[j]);
      var rest = R[b];
      if (d > rest * brk) { this.removeBond(b); continue; }
      var strain = (d - rest) / rest;
      if (strain > yieldT) R[b] = Math.min(maxR, rest + (d - rest * (1 + yieldT)) * rate);
      else if (strain < -yieldT) R[b] = Math.max(minR, rest + (d - rest * (1 - yieldT)) * rate);
    }
  };

  /* きんじょと あたらしく くっつく */
  PBD.prototype.bondReform = function () {
    var p = this.p;
    if (!p.reform) return;
    var maxD = p.spacing * p.formDist;
    var X = this.x, Y = this.y, n = this.n;
    var nbr = this.nbr, nbrN = this.nbrN;
    for (var i = 0; i < n; i++) {
      if (this.pbN[i] >= MAXB) continue;
      if (p.useTemp && this.temp[i] > p.freezeT) continue;
      var base = i * MAXN, cnt = nbrN[i];
      for (var k = 0; k < cnt; k++) {
        var j = nbr[base + k];
        if (j <= i) continue;
        if (this.pbN[j] >= MAXB) continue;
        if (p.useTemp && this.temp[j] > p.freezeT) continue;
        var d = U.dist(X[i], Y[i], X[j], Y[j]);
        if (d > maxD) continue;
        if (this.isBonded(i, j)) continue;
        this.addBond(i, j, Math.max(p.spacing * p.minRest, d));
        if (this.pbN[i] >= MAXB) break;
      }
    }
  };

  /* ---------- かべ ＆ しょうがいぶつ ---------- */
  PBD.prototype.boundarySolve = function () {
    var b = this.bounds, n = this.n;
    var X = this.px, Y = this.py;
    var r = this.p.spacing * 0.42;
    var x0 = b.x0 + r, x1 = b.x1 - r, y0 = b.y0 + r, y1 = b.y1 - r;
    for (var i = 0; i < n; i++) {
      if (X[i] < x0) X[i] = x0 + (x0 - X[i]) * 0.02;
      else if (X[i] > x1) X[i] = x1 - (X[i] - x1) * 0.02;
      if (Y[i] < y0) Y[i] = y0 + (y0 - Y[i]) * 0.02;
      else if (Y[i] > y1) Y[i] = y1 - (Y[i] - y1) * 0.02;
    }
    var obs = this.obstacles;
    if (obs.length === 0) return;
    var t = this._tmp;
    for (var o = 0; o < obs.length; o++) {
      var ob = obs[o];
      if (!ob.active) continue;
      var s = ob.s, cx = ob.cx, cy = ob.cy, co = Math.cos(-ob.rot), si = Math.sin(-ob.rot);
      var rad = s * 1.45;
      for (var q = 0; q < n; q++) {
        var dx = X[q] - cx, dy = Y[q] - cy;
        if (dx * dx + dy * dy > rad * rad) continue;
        // ローカル ざひょう へ
        var lx = (dx * co - dy * si) / s, ly = (dx * si + dy * co) / s;
        if (!U.polyInside(ob.poly, lx, ly)) continue;
        U.polyNearest(ob.poly, lx, ly, t);
        var nx = t.x - lx, ny = t.y - ly;
        var nl = Math.sqrt(nx * nx + ny * ny) || 1;
        var push = (nl + r / s);
        var wx = t.x + nx / nl * (r / s), wy = t.y + ny / nl * (r / s);
        // ワールドへ もどす
        var c2 = Math.cos(ob.rot), s2 = Math.sin(ob.rot);
        X[q] = cx + (wx * c2 - wy * s2) * s;
        Y[q] = cy + (wx * s2 + wy * c2) * s;
      }
    }
  };

  /* ---------- ゆび（ほんとうに おしのける まる） ----------
     そくどを あたえる だけでは ねんどは へこまない。
     まると して あたりはんていを すると「ぎゅっ」と へこむ。 */
  PBD.prototype.fingerSolve = function () {
    var F = this.fingers;
    if (!F.length) return;
    var X = this.px, Y = this.py, n = this.n;
    var pr = this.p.spacing * 0.40;
    for (var f = 0; f < F.length; f++) {
      var fx = F[f].x, fy = F[f].y, R = F[f].r + pr;
      var R2 = R * R;
      for (var i = 0; i < n; i++) {
        var dx = X[i] - fx, dy = Y[i] - fy;
        var d2 = dx * dx + dy * dy;
        if (d2 >= R2) continue;
        if (d2 < 1e-6) { X[i] = fx + R; continue; }
        var k = R / Math.sqrt(d2);
        X[i] = fx + dx * k;
        Y[i] = fy + dy * k;
      }
    }
  };

  /* ---------- つかむ ---------- */
  PBD.prototype.grabAt = function (x, y, radius, id, strength) {
    var ids = [], ox = [], oy = [];
    var i, dx, dy;
    for (i = 0; i < this.n; i++) {
      dx = this.x[i] - x; dy = this.y[i] - y;
      if (dx * dx + dy * dy < radius * radius) {
        ids.push(i); ox.push(dx); oy.push(dy);
      }
    }
    /* ちょっと はずれても つかめるように：
       ちかくに なければ いちばん ちかい つぶの まわりを つかむ */
    if (!ids.length) {
      var near = this.nearest(x, y, radius * 3.2);
      if (near >= 0) {
        var nx = this.x[near], ny = this.y[near];
        for (i = 0; i < this.n; i++) {
          dx = this.x[i] - nx; dy = this.y[i] - ny;
          if (dx * dx + dy * dy < radius * radius) {
            ids.push(i); ox.push(this.x[i] - x); oy.push(this.y[i] - y);
          }
        }
      }
    }
    if (!ids.length) return null;
    var g = { id: id, ids: ids, ox: ox, oy: oy, x: x, y: y, k: strength === undefined ? 0.55 : strength };
    this.grabs.push(g);
    return g;
  };
  PBD.prototype.moveGrab = function (id, x, y) {
    for (var i = 0; i < this.grabs.length; i++) if (this.grabs[i].id === id) { this.grabs[i].x = x; this.grabs[i].y = y; }
  };
  PBD.prototype.releaseGrab = function (id) {
    for (var i = this.grabs.length - 1; i >= 0; i--) if (this.grabs[i].id === id) this.grabs.splice(i, 1);
  };
  PBD.prototype.grabSolve = function () {
    var X = this.px, Y = this.py;
    for (var g = 0; g < this.grabs.length; g++) {
      var gr = this.grabs[g], k = gr.k;
      for (var m = 0; m < gr.ids.length; m++) {
        var i = gr.ids[m];
        var tx = gr.x + gr.ox[m], ty = gr.y + gr.oy[m];
        X[i] += (tx - X[i]) * k;
        Y[i] += (ty - Y[i]) * k;
      }
    }
  };

  /* ---------- ねばり（XSPH） ---------- */
  PBD.prototype.viscosity = function (dt) {
    var c = this.p.viscosity;
    if (c <= 0) return;
    var n = this.n, X = this.x, Y = this.y, vx = this.vx, vy = this.vy;
    var nbr = this.nbr, nbrN = this.nbrN;
    var ax = this.dpx, ay = this.dpy;
    for (var i = 0; i < n; i++) {
      var base = i * MAXN, cnt = nbrN[i];
      var sx = 0, sy = 0, ws = 0;
      for (var m = 0; m < cnt; m++) {
        var j = nbr[base + m];
        var dx = X[i] - X[j], dy = Y[i] - Y[j];
        var r2 = dx * dx + dy * dy;
        if (r2 >= this.h2) continue;
        var w = this.poly6(r2);
        sx += (vx[j] - vx[i]) * w;
        sy += (vy[j] - vy[i]) * w;
        ws += w;
      }
      if (ws > 0) { ax[i] = sx / ws; ay[i] = sy / ws; } else { ax[i] = 0; ay[i] = 0; }
    }
    var kk = U.clamp01(c);
    for (var q = 0; q < n; q++) { vx[q] += ax[q] * kk; vy[q] += ay[q] * kk; }
  };

  /* ---------- おんど ---------- */
  PBD.prototype.updateTemp = function (dt) {
    var p = this.p, n = this.n;
    var T = this.temp, T2 = this.temp2;
    var nbr = this.nbr, nbrN = this.nbrN;
    var kd = U.clamp01(p.tempDiffuse * dt * 4);
    for (var i = 0; i < n; i++) {
      var base = i * MAXN, cnt = nbrN[i];
      var s = 0;
      for (var m = 0; m < cnt; m++) s += T[nbr[base + m]];
      var avg = cnt > 0 ? s / cnt : T[i];
      var v = T[i] + (avg - T[i]) * kd;
      v += (p.ambient - v) * U.clamp01(p.tempRelax * dt);
      T2[i] = U.clamp01(v);
    }
    for (var q = 0; q < n; q++) T[q] = T2[q];

    // あつくなった ボンドは ちぎれる
    if (p.useBonds) {
      for (var b = this.bN - 1; b >= 0; b--) {
        var a = this.bA[b], c = this.bB[b];
        if (T[a] > p.meltT || T[c] > p.meltT) this.removeBond(b);
      }
    }
  };

  /* ---------- メイン ステップ ---------- */
  PBD.prototype.step = function (dt) {
    var n = this.n;
    if (n === 0) return;
    var p = this.p;
    this._frame++;
    this._kern();

    var X = this.x, Y = this.y, PX = this.px, PY = this.py, vx = this.vx, vy = this.vy;
    var i;

    this.buildGrid(X, Y);
    this.findNeighbors(X, Y);

    this.applyForces(dt);

    // そくど せいげん
    var mv = p.maxVel;
    for (i = 0; i < n; i++) {
      var sp2 = vx[i] * vx[i] + vy[i] * vy[i];
      if (sp2 > mv * mv) { var s = mv / Math.sqrt(sp2); vx[i] *= s; vy[i] *= s; }
      PX[i] = X[i] + vx[i] * dt;
      PY[i] = Y[i] + vy[i] * dt;
    }

    // よそくいちで きんじょを もういちど（せいど アップ）
    this.buildGrid(PX, PY);
    this.findNeighbors(PX, PY);

    var iters = p.iters;
    var kPrime = 1 - Math.pow(1 - U.clamp01(p.bondK), 1 / Math.max(1, iters));
    for (var it = 0; it < iters; it++) {
      if (p.fluidK > 0) this.densitySolve();
      if (p.useBonds && this.bN > 0) this.bondSolve(kPrime);
      this.grabSolve();
      this.fingerSolve();
      this.boundarySolve();
    }

    // そくどを こうしん
    var inv = 1 / dt;
    var rest = p.restitution, fric = p.friction;
    var b = this.bounds, r = p.spacing * 0.42;
    for (i = 0; i < n; i++) {
      var nvx = (PX[i] - X[i]) * inv;
      var nvy = (PY[i] - Y[i]) * inv;
      // かべで はねる / まさつ
      if (PY[i] >= b.y1 - r - 0.5) { nvx *= (1 - fric); if (nvy > 0) nvy *= -rest; }
      if (PY[i] <= b.y0 + r + 0.5 && nvy < 0) nvy *= -rest;
      if (PX[i] <= b.x0 + r + 0.5 && nvx < 0) { nvx *= -rest; nvy *= (1 - fric * 0.5); }
      if (PX[i] >= b.x1 - r - 0.5 && nvx > 0) { nvx *= -rest; nvy *= (1 - fric * 0.5); }
      vx[i] = nvx; vy[i] = nvy;
      X[i] = PX[i]; Y[i] = PY[i];
    }

    this.viscosity(dt);

    /* damping は「1びょう あたり」。*60 して しまうと 1ステップで
       3わり も そくどが きえて、じゅうりょくに まけて しまう。 */
    var damp = Math.exp(-p.damping * dt);
    for (i = 0; i < n; i++) { vx[i] *= damp; vy[i] *= damp; }

    if (p.useTemp) this.updateTemp(dt);

    if (p.useBonds) {
      this.bondPlastic(dt);
      if (this._frame % 5 === 0) this.bondReform();
    }
  };

  /* ---------- どうぐ ---------- */

  /* おす（ゆび） */
  PBD.prototype.push = function (x, y, radius, strength, dirx, diry) {
    var n = this.n, cnt = 0;
    var r2 = radius * radius;
    for (var i = 0; i < n; i++) {
      var dx = this.x[i] - x, dy = this.y[i] - y;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var d = Math.sqrt(d2) || 0.001;
      var f = 1 - d / radius;
      f = f * f;
      this.vx[i] += (dx / d) * strength * f + (dirx || 0) * f;
      this.vy[i] += (dy / d) * strength * f + (diry || 0) * f;
      cnt++;
    }
    return cnt;
  };

  /* ひきよせる */
  PBD.prototype.attract = function (x, y, radius, strength) {
    return this.push(x, y, radius, -strength, 0, 0);
  };

  /* かぜ */
  PBD.prototype.wind = function (x, y, radius, fx, fy, dt) {
    var n = this.n, r2 = radius * radius, cnt = 0;
    for (var i = 0; i < n; i++) {
      var dx = this.x[i] - x, dy = this.y[i] - y;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var f = 1 - Math.sqrt(d2) / radius;
      this.vx[i] += fx * f * dt;
      this.vy[i] += fy * f * dt;
      cnt++;
    }
    return cnt;
  };

  /* きる（せんぶんを またぐ ボンドを ちぎる） */
  PBD.prototype.cut = function (ax, ay, bx, by, width) {
    var cnt = 0;
    for (var b = this.bN - 1; b >= 0; b--) {
      var i = this.bA[b], j = this.bB[b];
      var mx = (this.x[i] + this.x[j]) * 0.5, my = (this.y[i] + this.y[j]) * 0.5;
      if (U.segDist(mx, my, ax, ay, bx, by) < width) { this.removeBond(b); cnt++; }
    }
    // すこし ひらく
    var dx = bx - ax, dy = by - ay, l = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / l, ny = dx / l;
    for (var q = 0; q < this.n; q++) {
      var d = U.segDist(this.x[q], this.y[q], ax, ay, bx, by);
      if (d < width * 1.4) {
        var side = ((this.x[q] - ax) * nx + (this.y[q] - ay) * ny) >= 0 ? 1 : -1;
        this.vx[q] += nx * side * 130 * this.scale;
        this.vy[q] += ny * side * 130 * this.scale;
      }
    }
    return cnt;
  };

  /* いろを ぬる */
  PBD.prototype.paint = function (x, y, radius, colIdx) {
    var r2 = radius * radius, cnt = 0;
    for (var i = 0; i < this.n; i++) {
      var dx = this.x[i] - x, dy = this.y[i] - y;
      if (dx * dx + dy * dy > r2) continue;
      if (this.col[i] !== colIdx) cnt++;
      this.col[i] = colIdx;
    }
    return cnt;
  };

  /* あたためる / ひやす
     target(0か1)に むかって ぐんぐん ちかづける。
     たしざん だと まわりに にげて いつまでも とけない。 */
  PBD.prototype.heat = function (x, y, radius, target, rate, dt) {
    var r2 = radius * radius, cnt = 0;
    for (var i = 0; i < this.n; i++) {
      var dx = this.x[i] - x, dy = this.y[i] - y;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var f = 1 - Math.sqrt(d2) / radius;
      var k = 1 - Math.exp(-rate * f * dt);
      this.temp[i] = U.clamp01(this.temp[i] + (target - this.temp[i]) * k);
      cnt++;
    }
    return cnt;
  };

  /* ちかくの つぶを さがす */
  PBD.prototype.nearest = function (x, y, maxR) {
    var best = -1, bd = maxR * maxR;
    for (var i = 0; i < this.n; i++) {
      var dx = this.x[i] - x, dy = this.y[i] - y;
      var d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  };

  PBD.prototype.countIn = function (x, y, radius) {
    var r2 = radius * radius, c = 0;
    for (var i = 0; i < this.n; i++) {
      var dx = this.x[i] - x, dy = this.y[i] - y;
      if (dx * dx + dy * dy <= r2) c++;
    }
    return c;
  };

  /* ぜんたいの うんどうりょう（おとの おおきさに つかう） */
  PBD.prototype.kineticEnergy = function () {
    var s = 0, n = this.n;
    for (var i = 0; i < n; i++) s += this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i];
    return n ? s / n : 0;
  };

  /* じゅうしん */
  PBD.prototype.centroid = function (out) {
    var sx = 0, sy = 0, n = this.n;
    for (var i = 0; i < n; i++) { sx += this.x[i]; sy += this.y[i]; }
    out.x = n ? sx / n : 0; out.y = n ? sy / n : 0;
    return out;
  };

  PBD.MAXN = MAXN;
  PBD.MAXB = MAXB;
  YA.PBD = PBD;

})(window);
