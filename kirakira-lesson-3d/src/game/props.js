/* ============================================================
 * props.js — おみせ や おへや の きょうつう パーツ
 * ============================================================ */
var PROPS = (function () {
  'use strict';

  /* ---------- おへや（かべ と ゆか） ---------- */

  function room(opts) {
    opts = opts || {};
    var w = opts.w || 7, d = opts.d || 6, h = opts.h || 3.2;
    var g = new THREE.Group();

    var floor = B.ground(Math.max(w, d) * 1.4, opts.floor || 0xf6e3d0, {
      pattern: opts.floorPattern || 'check',
      accent: opts.floorAccent != null ? opts.floorAccent : U.shade(opts.floor || 0xf6e3d0, -0.1),
      repeat: opts.floorRepeat || 7
    });
    g.add(floor);

    var wallC = opts.wall || 0xfff2f7;
    // うしろ
    var back = B.plane(w, h, wallC, { unique: true });
    back.position.set(0, h / 2, -d / 2);
    g.add(back);
    // ひだり・みぎ
    for (var s = -1; s <= 1; s += 2) {
      var side = B.plane(d, h, U.shade(wallC, -0.05), { unique: true });
      side.position.set(s * w / 2, h / 2, 0);
      side.rotation.y = -s * Math.PI / 2;
      g.add(side);
    }
    // はばき
    var skirt = B.box(w, 0.16, 0.06, opts.trim || 0xffffff);
    skirt.position.set(0, 0.08, -d / 2 + 0.03);
    g.add(skirt);

    // かべがみ の ライン
    if (opts.stripe !== false) {
      var line = B.box(w, 0.07, 0.03, opts.trim || 0xffd6e8);
      line.position.set(0, h * 0.55, -d / 2 + 0.02);
      g.add(line);
    }
    return g;
  }

  /* ---------- まど ---------- */

  function window_(w, h, opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var glass = B.plane(w, h, opts.sky || 0xbfe9ff, { unique: true, basic: true });
    g.add(glass);
    var frame = opts.frame || 0xffffff;
    var t = 0.07;
    var top = B.box(w + t * 2, t, 0.08, frame); top.position.y = h / 2; g.add(top);
    var bot = B.box(w + t * 2, t, 0.08, frame); bot.position.y = -h / 2; g.add(bot);
    for (var s = -1; s <= 1; s += 2) {
      var sd = B.box(t, h + t * 2, 0.08, frame); sd.position.x = s * w / 2; g.add(sd);
    }
    var cx = B.box(t * 0.7, h, 0.06, frame); g.add(cx);
    var cy = B.box(w, t * 0.7, 0.06, frame); g.add(cy);
    // そとの けしき
    var sun = B.circle(0.22, 0xffe27a, { basic: true });
    sun.position.set(-w * 0.26, h * 0.26, 0.01);
    g.add(sun);
    for (var c = 0; c < 2; c++) {
      var cl = B.circle(0.16, 0xffffff, { basic: true });
      cl.position.set(w * (0.1 + c * 0.2), h * (0.12 - c * 0.18), 0.012);
      g.add(cl);
    }
    return g;
  }

  /* ---------- カウンター / テーブル ---------- */

  function counter(w, d, h, color, opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var body = B.roundBox(w, h, d, 0.08, color, { unique: true });
    body.position.y = h / 2;
    g.add(body);
    var top = B.roundBox(w + 0.12, 0.1, d + 0.12, 0.05, opts.top || U.shade(color, 0.45), { unique: true });
    top.position.y = h + 0.04;
    g.add(top);
    if (opts.stripe) {
      for (var i = 0; i < 5; i++) {
        var st = B.box(w / 10, h * 0.9, 0.02, opts.stripe);
        st.position.set(-w / 2 + w / 10 + i * w / 5, h / 2, d / 2 + 0.01);
        g.add(st);
      }
    }
    return g;
  }

  function table(r, h, color) {
    var g = new THREE.Group();
    var top = B.cyl(r, r, 0.08, color, { unique: true, seg: 24 });
    top.position.y = h;
    g.add(top);
    var leg = B.cyl(0.07, 0.09, h, U.shade(color, -0.25), { unique: true, seg: 12 });
    leg.position.y = h / 2;
    g.add(leg);
    var base = B.cyl(r * 0.45, r * 0.5, 0.06, U.shade(color, -0.25), { unique: true, seg: 16 });
    base.position.y = 0.03;
    g.add(base);
    return g;
  }

  /* ---------- たな ---------- */

  function shelf(w, h, d, color) {
    var g = new THREE.Group();
    var levels = 3;
    for (var i = 0; i <= levels; i++) {
      var b = B.box(w, 0.06, d, color);
      b.position.y = i * (h / levels);
      g.add(b);
    }
    for (var s = -1; s <= 1; s += 2) {
      var sd = B.box(0.06, h, d, U.shade(color, -0.12));
      sd.position.set(s * w / 2, h / 2, 0);
      g.add(sd);
    }
    var back = B.box(w, h, 0.04, U.shade(color, 0.25));
    back.position.set(0, h / 2, -d / 2);
    g.add(back);
    return g;
  }

  /* ---------- ラグ ---------- */

  function rug(r, color, pattern) {
    var m = B.circle(r, color, { unique: true });
    if (pattern) {
      m.material = B.fabric(color, pattern, U.shade(color, 0.4), { repeat: 3 });
    }
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.015;
    return m;
  }

  /* ---------- かんばん ---------- */

  function sign(text, emoji, color) {
    var g = new THREE.Group();
    var board = B.roundBox(1.5, 0.6, 0.1, 0.14, color || 0xffffff, { unique: true });
    board.position.y = 1.5;
    g.add(board);
    if (emoji) {
      var e = B.emojiPlate(emoji, 0.42);
      e.position.set(-0.48, 1.5, 0.06);
      g.add(e);
    }
    if (text) {
      var t = B.textPlate(text, 0.96, { color: '#ff6fa5', stroke: '#ffffff', size: 74 });
      t.position.set(0.13, 1.5, 0.06);
      g.add(t);
    }
    var post = B.cyl(0.055, 0.06, 1.25, 0xd9b18a, { seg: 10 });
    post.position.y = 0.62;
    g.add(post);
    return g;
  }

  function hangSign(text, emoji, color) {
    var g = new THREE.Group();
    var board = B.roundBox(1.9, 0.55, 0.1, 0.16, color || 0xffe9f2, { unique: true });
    g.add(board);
    if (emoji) {
      var e = B.emojiPlate(emoji, 0.4);
      e.position.set(-0.66, 0, 0.06);
      g.add(e);
    }
    if (text) {
      var t = B.textPlate(text, 1.1, { color: '#ff6fa5', stroke: '#ffffff', size: 70 });
      t.position.set(0.16, 0, 0.06);
      g.add(t);
    }
    return g;
  }

  /* ---------- スポットライト（みため だけ） ---------- */

  function spotCone(r, h, color, opacity) {
    var m = B.cone(r, h, color, { unique: true, seg: 18, opacity: opacity || 0.16 });
    m.material.transparent = true;
    m.material.depthWrite = false;
    m.material.side = THREE.DoubleSide;
    return m;
  }

  /* ---------- かんようしょくぶつ ---------- */

  function plant(scale) {
    var g = new THREE.Group();
    var pot = B.cyl(0.16, 0.13, 0.24, 0xd98a6a, { seg: 14 });
    pot.position.y = 0.12;
    g.add(pot);
    var rim = B.cyl(0.175, 0.17, 0.05, 0xe8a184, { seg: 14 });
    rim.position.y = 0.235;
    g.add(rim);
    for (var i = 0; i < 7; i++) {
      var a = i / 7 * Math.PI * 2;
      var leaf = B.petal(0.3, U.shade(0x7ed07a, (i % 3) * 0.1), { unique: true });
      leaf.position.set(Math.cos(a) * 0.06, 0.24, Math.sin(a) * 0.06);
      leaf.rotation.set(-0.3 + Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
      g.add(leaf);
    }
    g.scale.setScalar(scale || 1);
    return g;
  }

  /* ---------- スツール ---------- */

  function stool(color) {
    var g = new THREE.Group();
    var seat = B.cyl(0.22, 0.22, 0.08, color, { unique: true, seg: 18 });
    seat.position.y = 0.44;
    g.add(seat);
    var cushion = B.sphere(0.21, U.shade(color, 0.3), { seg: 16, unique: true });
    cushion.scale.y = 0.35;
    cushion.position.y = 0.5;
    g.add(cushion);
    for (var i = 0; i < 3; i++) {
      var a = i / 3 * Math.PI * 2;
      var leg = B.cyl(0.025, 0.03, 0.44, U.shade(color, -0.35), { seg: 8 });
      leg.position.set(Math.cos(a) * 0.14, 0.22, Math.sin(a) * 0.14);
      leg.rotation.z = -Math.cos(a) * 0.12;
      leg.rotation.x = Math.sin(a) * 0.12;
      g.add(leg);
    }
    return g;
  }

  /* ---------- かがみ ---------- */

  function mirror(w, h, frameColor) {
    var g = new THREE.Group();
    var frame = B.roundBox(w + 0.16, h + 0.16, 0.1, 0.12, frameColor || 0xffd44d, { unique: true });
    g.add(frame);
    var glass = B.plane(w, h, 0xdff0ff, { unique: true, basic: true });
    glass.position.z = 0.06;
    glass.material.opacity = 0.8;
    glass.material.transparent = true;
    g.add(glass);
    // ハイライト
    var hl = B.plane(w * 0.18, h * 0.9, 0xffffff, { basic: true, unique: true });
    hl.material.opacity = 0.35; hl.material.transparent = true;
    hl.position.set(-w * 0.22, 0, 0.07);
    hl.rotation.z = 0.18;
    g.add(hl);
    return g;
  }

  /* ---------- かご ---------- */

  function basket(r, h, color) {
    var g = new THREE.Group();
    var body = B.cyl(r, r * 0.82, h, color, { unique: true, seg: 18, open: true });
    body.material.side = THREE.DoubleSide;
    body.position.y = h / 2;
    g.add(body);
    var bottom = B.circle(r * 0.82, U.shade(color, -0.15), { unique: true });
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.005;
    g.add(bottom);
    var rim = B.torus(r, 0.035, U.shade(color, 0.3), { unique: true });
    rim.position.y = h;
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    return g;
  }

  /* ---------- おさら / ボウル ---------- */

  function plate(r, color) {
    var g = new THREE.Group();
    var p = B.cyl(r, r * 0.86, 0.035, color, { unique: true, seg: 24 });
    p.position.y = 0.02;
    g.add(p);
    var rim = B.torus(r * 0.97, 0.022, U.shade(color, -0.1), { unique: true });
    rim.position.y = 0.035;
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    return g;
  }

  function bowl(r, color) {
    var g = new THREE.Group();
    var b = B.halfSphere(r, color, { seg: 18, unique: true });
    b.rotation.x = Math.PI;
    b.position.y = r * 0.9;
    g.add(b);
    var rim = B.torus(r * 0.98, 0.025, U.shade(color, 0.3), { unique: true });
    rim.position.y = r * 0.9;
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    return g;
  }

  /* ---------- ドア ---------- */

  function door(color) {
    var g = new THREE.Group();
    var d = B.roundBox(0.9, 1.8, 0.1, 0.1, color || 0xd98a6a, { unique: true });
    d.position.y = 0.9;
    g.add(d);
    var knob = B.sphere(0.06, 0xf5c542, { seg: 10, shiny: true });
    knob.position.set(0.32, 0.9, 0.07);
    g.add(knob);
    var win = B.circle(0.2, 0xbfe9ff, { basic: true, unique: true });
    win.position.set(0, 1.35, 0.06);
    g.add(win);
    return g;
  }

  /* ---------- ハートの ふうせん アーチ ---------- */

  function balloonArch(w, h) {
    var g = new THREE.Group();
    var cols = [0xff9dbf, 0xffd95c, 0x8fd4ff, 0xc09dff, 0x9ee493];
    var n = 14;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var x = -w / 2 + w * t;
      var y = Math.sin(t * Math.PI) * h;
      var b = B.sphere(0.19, cols[i % cols.length], { seg: 12, unique: true });
      b.scale.y = 1.15;
      b.position.set(x, y, 0);
      g.add(b);
    }
    return g;
  }

  /* ---------- ケーキ の パーツ ---------- */

  function spongeLayer(r, h, color) {
    var g = new THREE.Group();
    var s = B.cyl(r, r, h, color, { unique: true, seg: 26 });
    s.position.y = h / 2;
    g.add(s);
    return g;
  }

  function creamRing(r, color, n) {
    var g = new THREE.Group();
    n = n || 12;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2;
      var blob = B.sphere(r * 0.16, color, { seg: 10, unique: true });
      blob.position.set(Math.cos(a) * r * 0.88, 0, Math.sin(a) * r * 0.88);
      blob.scale.y = 1.25;
      g.add(blob);
    }
    return g;
  }

  /* ---------- おはな（はなたば よう） ---------- */

  function bloom(color, style) {
    var g = new THREE.Group();
    if (style === 'rose') {
      for (var i = 0; i < 4; i++) {
        var t = B.torus(0.055 - i * 0.011, 0.022, U.shade(color, i * 0.1), { unique: true });
        t.position.y = i * 0.014;
        t.rotation.x = Math.PI / 2;
        t.rotation.z = i * 0.6;
        g.add(t);
      }
      var c = B.sphere(0.025, U.shade(color, 0.25), { seg: 8, unique: true });
      c.position.y = 0.05;
      g.add(c);
    } else if (style === 'tulip') {
      var cup = B.cyl(0.06, 0.035, 0.11, color, { unique: true, seg: 12 });
      cup.position.y = 0.05;
      g.add(cup);
      for (var p = 0; p < 3; p++) {
        var pt = B.cone(0.03, 0.07, color, { unique: true, seg: 6 });
        pt.position.set(Math.cos(p / 3 * 6.28) * 0.04, 0.13, Math.sin(p / 3 * 6.28) * 0.04);
        g.add(pt);
      }
    } else if (style === 'sun') {
      for (var s = 0; s < 10; s++) {
        var a = s / 10 * Math.PI * 2;
        var pet = B.petal(0.11, color, { unique: true });
        pet.position.set(Math.cos(a) * 0.02, 0.02, Math.sin(a) * 0.02);
        pet.rotation.set(Math.PI / 2, 0, -a);
        g.add(pet);
      }
      var mid = B.sphere(0.045, 0x8a5a2a, { seg: 10, unique: true });
      mid.position.y = 0.03; mid.scale.y = 0.6;
      g.add(mid);
    } else { // daisy
      for (var d = 0; d < 6; d++) {
        var ad = d / 6 * Math.PI * 2;
        var pd = B.sphere(0.042, color, { seg: 8, unique: true });
        pd.position.set(Math.cos(ad) * 0.055, 0.02, Math.sin(ad) * 0.055);
        pd.scale.y = 0.55;
        g.add(pd);
      }
      var cd = B.sphere(0.032, 0xffe27a, { seg: 8, unique: true });
      cd.position.y = 0.035;
      g.add(cd);
    }
    return g;
  }

  function stemFlower(color, style, len) {
    var g = new THREE.Group();
    len = len || 0.42;
    var stem = B.cyl(0.014, 0.018, len, 0x6fbf5f, { seg: 8 });
    stem.position.y = len / 2;
    g.add(stem);
    for (var i = -1; i <= 1; i += 2) {
      var lf = B.petal(0.11, 0x7ed07a, { unique: true });
      lf.position.set(i * 0.03, len * 0.42, 0);
      lf.rotation.set(0, 0, i * 1.5);
      g.add(lf);
    }
    var bl = bloom(color, style);
    bl.position.y = len;
    g.add(bl);
    g.userData.bloom = bl;
    return g;
  }

  /* ---------- アイスクリーム ---------- */

  function cone_(color) {
    var g = new THREE.Group();
    var c = B.cone(0.13, 0.34, color || 0xe0a860, { unique: true, seg: 14 });
    c.position.y = 0.17;
    c.rotation.x = Math.PI;
    g.add(c);
    return g;
  }

  function scoop(color) {
    var s = B.sphere(0.13, color, { seg: 16, unique: true, flat: true });
    return s;
  }

  return {
    room: room, window: window_, counter: counter, table: table, shelf: shelf,
    rug: rug, sign: sign, hangSign: hangSign, spotCone: spotCone, plant: plant,
    stool: stool, mirror: mirror, basket: basket, plate: plate, bowl: bowl, door: door,
    balloonArch: balloonArch, spongeLayer: spongeLayer, creamRing: creamRing,
    bloom: bloom, stemFlower: stemFlower, cone: cone_, scoop: scoop
  };
})();
