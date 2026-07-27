/* ============================================================
 * util.js — 共通ユーティリティ（数学 / トゥイーン / テクスチャ / 形状）
 * ============================================================ */
(function () {
  'use strict';

  var U = {};

  /* ---------------- 数学 ---------------- */
  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.randInt = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };

  U.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  U.easeInCubic = function (t) { return t * t * t; };
  U.easeInOutCubic = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  U.easeOutBack = function (t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  U.easeOutElastic = function (t) {
    var c4 = (2 * Math.PI) / 3;
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  };
  U.easeOutBounce = function (t) {
    var n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
    if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
    t -= 2.625 / d1; return n1 * t * t + 0.984375;
  };

  /* ---------------- トゥイーン ---------------- */
  var tweens = [];

  /**
   * トゥイーンを登録する。
   * @param {object} o {dur, delay, ease, onUpdate(t01), onDone()}
   */
  U.tween = function (o) {
    var tw = {
      t: 0,
      dur: o.dur || 0.4,
      delay: o.delay || 0,
      ease: o.ease || U.easeOutCubic,
      onUpdate: o.onUpdate || null,
      onDone: o.onDone || null,
      dead: false
    };
    tweens.push(tw);
    return tw;
  };

  /** 一定時間後に一度だけ呼ぶ */
  U.delay = function (sec, fn) {
    return U.tween({ dur: 0.0001, delay: sec, onDone: fn });
  };

  /** 毎フレーム呼ばれる時限処理（tは0→1）。falseを返すと途中終了 */
  U.track = function (dur, fn, onDone) {
    return U.tween({ dur: dur, ease: function (t) { return t; }, onUpdate: fn, onDone: onDone });
  };

  U.killTween = function (tw) { if (tw) tw.dead = true; };

  U.updateTweens = function (dt) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      if (tw.dead) { tweens.splice(i, 1); continue; }
      if (tw.delay > 0) { tw.delay -= dt; if (tw.delay > 0) continue; }
      tw.t += dt;
      var raw = U.clamp(tw.t / tw.dur, 0, 1);
      if (tw.onUpdate) tw.onUpdate(tw.ease(raw), raw);
      if (raw >= 1) {
        tweens.splice(i, 1);
        if (tw.onDone) tw.onDone();
      }
    }
  };

  U.clearTweens = function () { tweens.length = 0; };

  /* ---------------- テクスチャ生成 ---------------- */

  /**
   * Canvasからテクスチャを作る。
   * @param {number} w,h ピクセルサイズ
   * @param {function} draw (ctx, w, h)
   */
  U.canvasTexture = function (w, h, draw) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    draw(ctx, w, h);
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    tex._canvas = cv;
    tex._ctx = ctx;
    return tex;
  };

  /** 既存のCanvasテクスチャを描き直す */
  U.redrawTexture = function (tex, draw) {
    draw(tex._ctx, tex._canvas.width, tex._canvas.height);
    tex.needsUpdate = true;
  };

  /** 角丸矩形パス */
  U.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  /** 縦グラデーション（色の配列） */
  U.vGrad = function (ctx, x, y0, y1, stops) {
    var g = ctx.createLinearGradient(x, y0, x, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  };

  /** 微細なノイズを重ねて「本物っぽい」質感を足す */
  U.addNoise = function (ctx, w, h, amount, alpha) {
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (Math.random() - 0.5) * amount;
      d[i] = U.clamp(d[i] + n, 0, 255);
      d[i + 1] = U.clamp(d[i + 1] + n, 0, 255);
      d[i + 2] = U.clamp(d[i + 2] + n, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
    if (alpha) ctx.globalAlpha = 1;
  };

  /** 中央寄せテキスト（自動縮小つき） */
  U.fitText = function (ctx, text, cx, cy, maxW, size, font, color) {
    var s = size;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    do {
      ctx.font = 'bold ' + s + 'px ' + font;
      if (ctx.measureText(text).width <= maxW) break;
      s -= 2;
    } while (s > 6);
    ctx.fillStyle = color;
    ctx.fillText(text, cx, cy);
    return s;
  };

  /* ---------------- ジオメトリ ---------------- */

  /** 角丸の板（正面パネル向け）。厚みdで押し出す */
  U.roundedPlate = function (w, h, d, r, seg) {
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
    var s = new THREE.Shape();
    var x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    var g = new THREE.ExtrudeGeometry(s, {
      depth: d, bevelEnabled: false, curveSegments: seg || 6
    });
    g.translate(0, 0, -d / 2);
    return g;
  };

  /**
   * 穴あきの円板（50円玉など）。holeR=0なら普通の円板。
   * コインの軸は +Z（＝正面を向いた状態）で作る。
   */
  U.coinGeometry = function (radius, thickness, holeR) {
    var s = new THREE.Shape();
    s.absarc(0, 0, radius, 0, Math.PI * 2, false);
    if (holeR > 0) {
      var h = new THREE.Path();
      h.absarc(0, 0, holeR, 0, Math.PI * 2, true);
      s.holes.push(h);
    }
    var g = new THREE.ExtrudeGeometry(s, {
      depth: thickness, bevelEnabled: true,
      bevelThickness: thickness * 0.16, bevelSize: thickness * 0.16,
      bevelSegments: 2, curveSegments: 40
    });
    g.translate(0, 0, -thickness / 2);
    return g;
  };

  /** 螺旋（スパイラルコイル）のチューブ形状 */
  U.spiralGeometry = function (coilR, tubeR, turns, length) {
    var pts = [];
    var steps = Math.max(24, Math.floor(turns * 16));
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(
        Math.cos(a) * coilR,
        Math.sin(a) * coilR,
        -t * length
      ));
    }
    var curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, steps, tubeR, 8, false);
  };

  /** ペットボトル形状（回転体） */
  U.bottleGeometry = function (h, rBody, rNeck) {
    var p = [];
    function pt(y, r) { p.push(new THREE.Vector2(r, y)); }
    pt(0, 0);
    pt(0, rBody * 0.72);
    pt(h * 0.020, rBody * 0.88);
    pt(h * 0.050, rBody * 0.97);
    pt(h * 0.090, rBody);
    pt(h * 0.300, rBody);
    pt(h * 0.330, rBody * 0.93);   // くびれ
    pt(h * 0.380, rBody * 0.93);
    pt(h * 0.410, rBody);
    pt(h * 0.620, rBody);
    pt(h * 0.680, rBody * 0.96);
    pt(h * 0.760, rBody * 0.70);
    pt(h * 0.830, rNeck * 1.20);
    pt(h * 0.880, rNeck);
    pt(h * 0.920, rNeck * 1.12);   // ネジ山
    pt(h * 0.935, rNeck);
    pt(h * 0.955, rNeck * 1.12);
    pt(h * 0.970, rNeck);
    pt(h * 1.000, rNeck);
    pt(h * 1.000, 0);
    return new THREE.LatheGeometry(p, 28);
  };

  /** 缶の形状（上下が絞られた円筒） */
  U.canGeometry = function (h, r) {
    var p = [];
    function pt(y, rr) { p.push(new THREE.Vector2(rr, y)); }
    pt(0, 0);
    pt(0, r * 0.80);
    pt(h * 0.012, r * 0.86);
    pt(h * 0.030, r * 0.955);
    pt(h * 0.055, r);
    pt(h * 0.900, r);
    pt(h * 0.935, r * 0.955);
    pt(h * 0.960, r * 0.82);
    pt(h * 0.975, r * 0.80);
    pt(h * 1.000, r * 0.84);   // 縁（リム）
    pt(h * 1.000, r * 0.78);
    pt(h * 0.985, r * 0.74);
    pt(h * 0.985, 0);
    return new THREE.LatheGeometry(p, 26);
  };

  /* ---------------- 色 ---------------- */
  U.shade = function (hex, amt) {
    var c = new THREE.Color(hex);
    var hsl = {};
    c.getHSL(hsl);
    hsl.l = U.clamp(hsl.l + amt, 0, 1);
    c.setHSL(hsl.h, hsl.s, hsl.l);
    return c.getHex();
  };

  U.cssColor = function (hex) {
    return '#' + ('000000' + (hex >>> 0).toString(16)).slice(-6);
  };

  /* ---------------- その他 ---------------- */

  /** グループ配下を再帰的に処理 */
  U.eachMesh = function (root, fn) {
    root.traverse(function (o) { if (o.isMesh) fn(o); });
  };

  /** 影の設定をまとめて */
  U.shadow = function (root, cast, receive) {
    U.eachMesh(root, function (m) {
      m.castShadow = !!cast;
      m.receiveShadow = !!receive;
    });
  };

  /** 3桁区切り */
  U.yen = function (n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  window.VMUtil = U;
})();
