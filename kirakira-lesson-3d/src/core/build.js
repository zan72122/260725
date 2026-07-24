/* ============================================================
 * build.js — 3Dパーツ ビルダー
 *   まる・しかく・つつ などの きほんパーツと、
 *   もよう テクスチャ / えもじスプライト / かげ などを つくる
 * ============================================================ */
var B = (function () {
  'use strict';

  var matCache = {};
  var geoCache = {};
  var texCache = {};

  /* ================= マテリアル ================= */

  function mat(color, opts) {
    opts = opts || {};
    var key = 'm' + color + '|' + (opts.shiny ? 1 : 0) + '|' + (opts.opacity || 1) +
      '|' + (opts.flat ? 1 : 0) + '|' + (opts.map || '') + '|' + (opts.side || 0) +
      '|' + (opts.emissive || 0) + '|' + (opts.depthWrite === false ? 1 : 0);
    if (matCache[key]) return matCache[key];
    var params = {
      color: color,
      transparent: opts.opacity != null && opts.opacity < 1,
      opacity: opts.opacity != null ? opts.opacity : 1,
      side: opts.side || THREE.FrontSide
    };
    if (opts.flat) params.flatShading = true;
    if (opts.map) params.map = opts.map;
    if (opts.depthWrite === false) { params.depthWrite = false; }
    var m;
    if (opts.shiny) {
      params.shininess = opts.shininess || 60;
      params.specular = opts.specular != null ? opts.specular : 0x777777;
      m = new THREE.MeshPhongMaterial(params);
    } else {
      m = new THREE.MeshLambertMaterial(params);
    }
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    matCache[key] = m;
    return m;
  }

  // つかいすて（いろを あとから かえたい とき）
  function matUnique(color, opts) {
    opts = opts || {};
    var params = {
      color: color,
      transparent: opts.opacity != null && opts.opacity < 1,
      opacity: opts.opacity != null ? opts.opacity : 1,
      side: opts.side || THREE.FrontSide
    };
    if (opts.flat) params.flatShading = true;
    if (opts.map) params.map = opts.map;
    var m = opts.shiny ? new THREE.MeshPhongMaterial(params) : new THREE.MeshLambertMaterial(params);
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    m.__unique = true;
    return m;
  }

  function basic(color, opts) {
    opts = opts || {};
    var bm = new THREE.MeshBasicMaterial({
      color: color,
      transparent: opts.opacity != null && opts.opacity < 1,
      opacity: opts.opacity != null ? opts.opacity : 1,
      side: opts.side || THREE.FrontSide,
      map: opts.map || null,
      depthWrite: opts.depthWrite !== false,
      depthTest: opts.depthTest !== false
    });
    bm.__unique = true;
    return bm;
  }

  /* ================= きほんパーツ ================= */

  function geo(key, make) {
    if (!geoCache[key]) {
      geoCache[key] = make();
      geoCache[key].__cached = true;
    }
    return geoCache[key];
  }

  function box(w, h, d, color, opts) {
    var g = geo('b' + w + '_' + h + '_' + d, function () { return new THREE.BoxGeometry(w, h, d); });
    return new THREE.Mesh(g, (opts && opts.unique) ? matUnique(color, opts) : mat(color, opts));
  }

  function sphere(r, color, opts) {
    opts = opts || {};
    var seg = opts.seg || 20;
    var g = geo('s' + r + '_' + seg, function () { return new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.6 | 0)); });
    return new THREE.Mesh(g, opts.unique ? matUnique(color, opts) : mat(color, opts));
  }

  function halfSphere(r, color, opts) {
    opts = opts || {};
    var seg = opts.seg || 20;
    var g = geo('hs' + r + '_' + seg, function () {
      return new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.6 | 0), 0, Math.PI * 2, 0, Math.PI / 2);
    });
    return new THREE.Mesh(g, opts.unique ? matUnique(color, opts) : mat(color, opts));
  }

  function cyl(rt, rb, h, color, opts) {
    opts = opts || {};
    var seg = opts.seg || 18;
    var open = !!opts.open;
    var g = geo('c' + rt + '_' + rb + '_' + h + '_' + seg + '_' + (open ? 1 : 0), function () {
      return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
    });
    return new THREE.Mesh(g, opts.unique ? matUnique(color, opts) : mat(color, opts));
  }

  function cone(r, h, color, opts) {
    opts = opts || {};
    var seg = opts.seg || 18;
    var g = geo('co' + r + '_' + h + '_' + seg, function () { return new THREE.ConeGeometry(r, h, seg); });
    return new THREE.Mesh(g, opts.unique ? matUnique(color, opts) : mat(color, opts));
  }

  function torus(r, tube, color, opts) {
    opts = opts || {};
    var g = geo('t' + r + '_' + tube, function () { return new THREE.TorusGeometry(r, tube, 10, 24); });
    return new THREE.Mesh(g, opts.unique ? matUnique(color, opts) : mat(color, opts));
  }

  function capsule(r, len, color, opts) {
    opts = opts || {};
    var g = geo('cap' + r + '_' + len, function () { return new THREE.CapsuleGeometry(r, len, 4, 14); });
    return new THREE.Mesh(g, opts.unique ? matUnique(color, opts) : mat(color, opts));
  }

  function plane(w, h, color, opts) {
    opts = opts || {};
    var g = geo('p' + w + '_' + h, function () { return new THREE.PlaneGeometry(w, h); });
    var m = opts.basic ? basic(color, opts) : (opts.unique ? matUnique(color, opts) : mat(color, opts));
    return new THREE.Mesh(g, m);
  }

  function circle(r, color, opts) {
    opts = opts || {};
    var g = geo('ci' + r, function () { return new THREE.CircleGeometry(r, 32); });
    var m = opts.basic ? basic(color, opts) : (opts.unique ? matUnique(color, opts) : mat(color, opts));
    return new THREE.Mesh(g, m);
  }

  // かどの まるい しかく（おもちゃっぽい みため）
  function roundBox(w, h, d, r, color, opts) {
    opts = opts || {};
    var key = 'rb' + w + '_' + h + '_' + d + '_' + r;
    var g = geo(key, function () {
      var shape = new THREE.Shape();
      var hw = w / 2, hh = h / 2, rr = Math.min(r, hw * 0.98, hh * 0.98);
      shape.moveTo(-hw + rr, -hh);
      shape.lineTo(hw - rr, -hh);
      shape.quadraticCurveTo(hw, -hh, hw, -hh + rr);
      shape.lineTo(hw, hh - rr);
      shape.quadraticCurveTo(hw, hh, hw - rr, hh);
      shape.lineTo(-hw + rr, hh);
      shape.quadraticCurveTo(-hw, hh, -hw, hh - rr);
      shape.lineTo(-hw, -hh + rr);
      shape.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
      var gg = new THREE.ExtrudeGeometry(shape, {
        depth: d, bevelEnabled: true, bevelSize: Math.min(0.02, r * 0.3),
        bevelThickness: Math.min(0.02, d * 0.2), bevelSegments: 2, curveSegments: 6
      });
      gg.translate(0, 0, -d / 2);
      return gg;
    });
    return new THREE.Mesh(g, opts.unique ? matUnique(color, opts) : mat(color, opts));
  }

  // ハートの かたち（2D シェイプ → おしだし）
  function heart(size, color, opts) {
    opts = opts || {};
    var g = geo('heart' + size, function () {
      var s = new THREE.Shape();
      var x = 0, y = 0;
      s.moveTo(x, y + 0.5);
      s.bezierCurveTo(x, y + 0.8, x - 0.6, y + 1.1, x - 0.6, y + 0.5);
      s.bezierCurveTo(x - 0.6, y + 0.1, x - 0.15, y - 0.25, x, y - 0.6);
      s.bezierCurveTo(x + 0.15, y - 0.25, x + 0.6, y + 0.1, x + 0.6, y + 0.5);
      s.bezierCurveTo(x + 0.6, y + 1.1, x, y + 0.8, x, y + 0.5);
      var gg = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10 });
      gg.scale(size, size, size);
      gg.center();
      return gg;
    });
    return new THREE.Mesh(g, opts.unique ? matUnique(color, opts) : mat(color, opts));
  }

  // ほしの かたち
  function star(size, color, opts) {
    opts = opts || {};
    var g = geo('star' + size, function () {
      var s = new THREE.Shape();
      var pts = 5, outer = 1, inner = 0.45;
      for (var i = 0; i < pts * 2; i++) {
        var rr = (i % 2 === 0) ? outer : inner;
        var a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i === 0) s.moveTo(px, py); else s.lineTo(px, py);
      }
      s.closePath();
      var gg = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
      gg.scale(size, size, size);
      gg.center();
      return gg;
    });
    return new THREE.Mesh(g, opts.unique ? matUnique(color, opts) : mat(color, opts));
  }

  // はなびら1まい
  function petal(size, color, opts) {
    opts = opts || {};
    var g = geo('petal' + size, function () {
      var s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(0.5, 0.2, 0.5, 0.9, 0, 1.1);
      s.bezierCurveTo(-0.5, 0.9, -0.5, 0.2, 0, 0);
      var gg = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 8 });
      gg.scale(size, size, size);
      return gg;
    });
    return new THREE.Mesh(g, opts.unique ? matUnique(color, opts) : mat(color, opts));
  }

  /* ================= もよう テクスチャ ================= */

  function canvasTex(key, size, draw) {
    if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    draw(g, size);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    texCache[key] = t;
    return t;
  }

  var PATTERNS = {
    plain: null,
    dots: function (g, s, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      g.fillStyle = b;
      var r = s * 0.09;
      for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
        var ox = (y % 2) * s / 8;
        g.beginPath(); g.arc(x * s / 4 + s / 8 + ox, y * s / 4 + s / 8, r, 0, 6.3); g.fill();
      }
    },
    stripe: function (g, s, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      g.fillStyle = b;
      for (var i = 0; i < 4; i++) g.fillRect(i * s / 4, 0, s / 8, s);
    },
    stripeH: function (g, s, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      g.fillStyle = b;
      for (var i = 0; i < 4; i++) g.fillRect(0, i * s / 4, s, s / 8);
    },
    check: function (g, s, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      g.fillStyle = b;
      for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) if ((x + y) % 2 === 0) g.fillRect(x * s / 4, y * s / 4, s / 4, s / 4);
    },
    gingham: function (g, s, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      g.globalAlpha = 0.55; g.fillStyle = b;
      for (var i = 0; i < 4; i++) { g.fillRect(i * s / 4, 0, s / 8, s); g.fillRect(0, i * s / 4, s, s / 8); }
      g.globalAlpha = 1;
    },
    heart: function (g, s, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      g.fillStyle = b;
      function hh(cx, cy, r) {
        g.beginPath();
        g.moveTo(cx, cy + r * 0.7);
        g.bezierCurveTo(cx + r, cy - r * 0.3, cx + r * 0.5, cy - r, cx, cy - r * 0.35);
        g.bezierCurveTo(cx - r * 0.5, cy - r, cx - r, cy - r * 0.3, cx, cy + r * 0.7);
        g.fill();
      }
      for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) hh(x * s / 3 + s / 6 + (y % 2) * s / 6, y * s / 3 + s / 6, s * 0.1);
    },
    star: function (g, s, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      g.fillStyle = b;
      function st(cx, cy, r) {
        g.beginPath();
        for (var i = 0; i < 10; i++) {
          var rr = i % 2 ? r * 0.45 : r;
          var ang = i / 10 * Math.PI * 2 - Math.PI / 2;
          var px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath(); g.fill();
      }
      for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) st(x * s / 3 + s / 6 + (y % 2) * s / 6, y * s / 3 + s / 6, s * 0.1);
    },
    flower: function (g, s, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) {
        var cx = x * s / 3 + s / 6 + (y % 2) * s / 6, cy = y * s / 3 + s / 6, r = s * 0.055;
        g.fillStyle = b;
        for (var p = 0; p < 5; p++) {
          var ang = p / 5 * Math.PI * 2;
          g.beginPath(); g.arc(cx + Math.cos(ang) * r * 1.15, cy + Math.sin(ang) * r * 1.15, r, 0, 6.3); g.fill();
        }
        g.fillStyle = '#fff8c8';
        g.beginPath(); g.arc(cx, cy, r * 0.7, 0, 6.3); g.fill();
      }
    },
    frill: function (g, s, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      g.strokeStyle = b; g.lineWidth = s * 0.03;
      for (var i = 0; i < 5; i++) {
        g.beginPath();
        for (var x = 0; x <= s; x += 4) g.lineTo(x, i * s / 5 + Math.sin(x / s * Math.PI * 6) * s * 0.02 + s * 0.1);
        g.stroke();
      }
    },
    rainbow: function (g, s) {
      var cols = ['#ff8fb1', '#ffc36b', '#ffe97a', '#9ee493', '#8fd4ff', '#c9a7ff'];
      for (var i = 0; i < cols.length; i++) { g.fillStyle = cols[i]; g.fillRect(0, i * s / cols.length, s, s / cols.length + 1); }
    },
    sparkle: function (g, s, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      g.fillStyle = b;
      for (var i = 0; i < 26; i++) {
        var cx = Math.random() * s, cy = Math.random() * s, r = s * (0.012 + Math.random() * 0.02);
        g.beginPath();
        g.moveTo(cx, cy - r * 2.4); g.quadraticCurveTo(cx, cy, cx + r * 2.4, cy);
        g.quadraticCurveTo(cx, cy, cx, cy + r * 2.4); g.quadraticCurveTo(cx, cy, cx - r * 2.4, cy);
        g.quadraticCurveTo(cx, cy, cx, cy - r * 2.4);
        g.fill();
      }
    }
  };

  /**
   * ぬの の マテリアル：もよう つき
   * pattern: 'plain'|'dots'|'stripe'|'check'|'heart'|'star'|'flower'|'gingham'|'rainbow'|'sparkle'|'frill'|'stripeH'
   */
  function fabric(color, pattern, accent, opts) {
    opts = opts || {};
    pattern = pattern || 'plain';
    if (pattern === 'plain' || !PATTERNS[pattern]) {
      return matUnique(color, opts);
    }
    var a = U.hex2css(color);
    var b = U.hex2css(accent != null ? accent : U.shade(color, 0.55));
    var key = 'f' + pattern + a + b;
    var tex = canvasTex(key, 128, function (g, s) { PATTERNS[pattern](g, s, a, b); });
    var t2 = tex.clone(); t2.needsUpdate = true; t2.__unique = true;
    t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
    t2.repeat.set(opts.repeat || 2, opts.repeat || 2);
    return matUnique(0xffffff, { map: t2, opacity: opts.opacity, side: opts.side, shiny: opts.shiny });
  }

  /* ================= スプライト ================= */

  var emojiFont = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';

  function emojiTex(ch, px) {
    px = px || 128;
    var key = 'e' + ch + px;
    return canvasTex(key, px, function (g, s) {
      g.clearRect(0, 0, s, s);
      g.font = Math.floor(s * 0.82) + 'px ' + emojiFont;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, s / 2, s * 0.54);
    });
  }

  function emojiSprite(ch, scale, opts) {
    opts = opts || {};
    var t = emojiTex(ch, opts.px || 128);
    var m = new THREE.SpriteMaterial({
      map: t, transparent: true,
      depthWrite: false, depthTest: opts.depthTest !== false,
      opacity: opts.opacity != null ? opts.opacity : 1
    });
    var sp = new THREE.Sprite(m);
    sp.scale.set(scale, scale, 1);
    return sp;
  }

  // ぺったんこの えもじ（ばんぐみひょう や かんばん に はる）
  function emojiPlate(ch, size, opts) {
    opts = opts || {};
    var t = emojiTex(ch, opts.px || 128);
    var g = new THREE.PlaneGeometry(size, size);
    var m = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    m.__unique = true;
    return new THREE.Mesh(g, m);
  }

  function textTex(text, opts) {
    opts = opts || {};
    var w = opts.w || 512, h = opts.h || 128;
    var key = 'tx' + text + '|' + w + h + (opts.color || '') + (opts.bg || '') + (opts.font || '');
    if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    if (opts.bg) {
      g.fillStyle = opts.bg;
      var r = opts.radius || 24;
      g.beginPath();
      g.moveTo(r, 0); g.lineTo(w - r, 0); g.quadraticCurveTo(w, 0, w, r);
      g.lineTo(w, h - r); g.quadraticCurveTo(w, h, w - r, h);
      g.lineTo(r, h); g.quadraticCurveTo(0, h, 0, h - r);
      g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
      g.fill();
    }
    var fs = opts.size || Math.floor(h * 0.56);
    g.font = 'bold ' + fs + 'px ' + (opts.font || '"Hiragino Maru Gothic ProN","IPAGothic",sans-serif');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (opts.stroke) { g.lineWidth = fs * 0.18; g.strokeStyle = opts.stroke; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2); }
    g.fillStyle = opts.color || '#ff6fa5';
    g.fillText(text, w / 2, h / 2);
    var t = new THREE.CanvasTexture(c);
    texCache[key] = t;
    return t;
  }

  function textPlate(text, width, opts) {
    opts = opts || {};
    var t = textTex(text, opts);
    var h = width * ((opts.h || 128) / (opts.w || 512));
    var m = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    m.__unique = true;
    return new THREE.Mesh(new THREE.PlaneGeometry(width, h), m);
  }

  /* ================= かげ ================= */

  var shadowTex = null;
  function blobShadow(r, opacity) {
    if (!shadowTex) {
      shadowTex = canvasTex('shadow', 128, function (g, s) {
        var grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        grd.addColorStop(0, 'rgba(0,0,0,0.55)');
        grd.addColorStop(0.55, 'rgba(0,0,0,0.28)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
      });
    }
    var m = new THREE.MeshBasicMaterial({
      map: shadowTex, transparent: true, depthWrite: false,
      opacity: opacity != null ? opacity : 0.5
    });
    m.__unique = true;
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012;
    mesh.renderOrder = -1;
    return mesh;
  }

  /* ================= そら と じめん ================= */

  function skyDome(topColor, botColor, radius) {
    var key = 'sky' + topColor + botColor;
    var tex = canvasTex(key, 64, function (g, s) {
      var grd = g.createLinearGradient(0, 0, 0, s);
      grd.addColorStop(0, U.hex2css(topColor));
      grd.addColorStop(0.55, U.hex2css(U.shade(botColor, 0.35)));
      grd.addColorStop(1, U.hex2css(botColor));
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
    });
    var t2 = tex.clone(); t2.needsUpdate = true; t2.__unique = true;
    var g = new THREE.SphereGeometry(radius || 60, 24, 16);
    var m = new THREE.MeshBasicMaterial({ map: t2, side: THREE.BackSide, fog: false });
    m.__unique = true;
    var mesh = new THREE.Mesh(g, m);
    return mesh;
  }

  function ground(size, color, opts) {
    opts = opts || {};
    var g = new THREE.PlaneGeometry(size, size, 1, 1);
    var m;
    if (opts.pattern && typeof PATTERNS[opts.pattern] === 'function') {
      var a = U.hex2css(color), b = U.hex2css(opts.accent != null ? opts.accent : U.shade(color, -0.1));
      var t = canvasTex('g' + opts.pattern + a + b, 128, function (gg, s) { PATTERNS[opts.pattern](gg, s, a, b); });
      var t2 = t.clone(); t2.needsUpdate = true; t2.__unique = true;
      t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
      t2.repeat.set(opts.repeat || 8, opts.repeat || 8);
      m = matUnique(0xffffff, { map: t2 });
    } else {
      m = mat(color);
    }
    var mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  /* ================= よく つかう かたまり ================= */

  function group() {
    var g = new THREE.Group();
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) g.add(arguments[i]);
    return g;
  }

  function at(obj, x, y, z) { obj.position.set(x, y, z); return obj; }
  function rot(obj, x, y, z) { obj.rotation.set(x, y, z); return obj; }
  function scl(obj, x, y, z) { obj.scale.set(x, y == null ? x : y, z == null ? x : z); return obj; }

  // ふわふわ くも
  function cloud(scale) {
    var g = new THREE.Group();
    var n = U.randInt(3, 5);
    for (var i = 0; i < n; i++) {
      var r = U.rand(0.5, 1.0);
      var s = sphere(r, 0xffffff, { seg: 10 });
      s.position.set(U.rand(-1.2, 1.2), U.rand(-0.15, 0.25), U.rand(-0.4, 0.4));
      s.scale.y = 0.75;
      g.add(s);
    }
    g.scale.setScalar(scale || 1);
    return g;
  }

  // き（まるい き）
  function tree(h, leafColor) {
    var g = new THREE.Group();
    var trunk = cyl(0.09, 0.13, h * 0.5, 0x9b6b46);
    trunk.position.y = h * 0.25;
    g.add(trunk);
    var lc = leafColor || 0x7ed07a;
    for (var i = 0; i < 3; i++) {
      var r = 0.42 - i * 0.08;
      var s = sphere(r, U.shade(lc, i * 0.08), { seg: 12, flat: true });
      s.position.set(U.rand(-0.12, 0.12), h * 0.5 + i * 0.24, U.rand(-0.1, 0.1));
      g.add(s);
    }
    return g;
  }

  // おはな（じめん に はえてる）
  function flower(color) {
    var g = new THREE.Group();
    var stem = cyl(0.014, 0.018, 0.24, 0x6fbf5f);
    stem.position.y = 0.12; g.add(stem);
    for (var i = 0; i < 5; i++) {
      var p = sphere(0.045, color, { seg: 8 });
      var a = i / 5 * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.055, 0.26, Math.sin(a) * 0.055);
      p.scale.y = 0.6;
      g.add(p);
    }
    var c = sphere(0.032, 0xffe27a, { seg: 8 });
    c.position.y = 0.27; g.add(c);
    return g;
  }

  // バルーン
  function balloon(color) {
    var g = new THREE.Group();
    var b = sphere(0.3, color, { seg: 14 });
    b.scale.set(1, 1.18, 1);
    b.position.y = 0.3;
    g.add(b);
    var knot = cone(0.06, 0.1, color);
    knot.position.y = 0.02; knot.rotation.x = Math.PI;
    g.add(knot);
    var str = cyl(0.006, 0.006, 0.7, 0xffffff);
    str.position.y = -0.35;
    g.add(str);
    return g;
  }

  function dispose() {
    // せんめん：ばめん を きりかえる とき に よぶ
  }

  return {
    mat: mat, matUnique: matUnique, basic: basic, fabric: fabric,
    box: box, sphere: sphere, halfSphere: halfSphere, cyl: cyl, cone: cone, torus: torus,
    capsule: capsule, plane: plane, circle: circle, roundBox: roundBox,
    heart: heart, star: star, petal: petal,
    canvasTex: canvasTex, emojiTex: emojiTex, emojiSprite: emojiSprite, emojiPlate: emojiPlate,
    textTex: textTex, textPlate: textPlate,
    blobShadow: blobShadow, skyDome: skyDome, ground: ground,
    group: group, at: at, rot: rot, scl: scl,
    cloud: cloud, tree: tree, flower: flower, balloon: balloon,
    PATTERNS: PATTERNS, dispose: dispose
  };
})();
