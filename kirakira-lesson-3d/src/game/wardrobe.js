/* ============================================================
 * wardrobe.js — おしゃれデータ（かみがた / ふく / くつ / アクセ / いろ / もよう）
 *   すべて 3Dパーツ で できています。
 * ============================================================ */
var WARDROBE = (function () {
  'use strict';

  /* ================= プロポーション ================= */
  var P = {
    skin: 0xfdd0a6,
    headR: 0.30,
    headY: 1.29,
    neckY: 1.03,
    torsoTop: 1.00,
    torsoBot: 0.62,
    torsoR: 0.185,
    shoulderY: 0.955,
    shoulderX: 0.185,
    upperArm: 0.21,
    foreArm: 0.19,
    handR: 0.055,
    hipY: 0.62,
    hipX: 0.085,
    thigh: 0.30,
    shin: 0.26,
    footY: 0.055
  };

  /* ================= カラーパレット ================= */

  var COLORS = {
    pink: { name: 'ピンク', hex: 0xff9dbf },
    rose: { name: 'ローズ', hex: 0xf4608f },
    red: { name: 'あか', hex: 0xff6b6b },
    orange: { name: 'オレンジ', hex: 0xffa96b },
    yellow: { name: 'きいろ', hex: 0xffd95c },
    cream: { name: 'クリーム', hex: 0xfff0c2 },
    mint: { name: 'ミント', hex: 0x8fe3c8 },
    green: { name: 'みどり', hex: 0x8ed97e },
    sky: { name: 'そらいろ', hex: 0x8fd4ff },
    blue: { name: 'あお', hex: 0x6fa8ff },
    navy: { name: 'ネイビー', hex: 0x4a5b9c },
    purple: { name: 'むらさき', hex: 0xc09dff },
    lavender: { name: 'ラベンダー', hex: 0xd9c8ff },
    white: { name: 'しろ', hex: 0xfdfdfd },
    gray: { name: 'グレー', hex: 0xc7c7d0 },
    black: { name: 'くろ', hex: 0x494155 },
    brown: { name: 'ちゃいろ', hex: 0xa9713f },
    gold: { name: 'ゴールド', hex: 0xf5c542 },
    silver: { name: 'シルバー', hex: 0xdfe4ea },
    peach: { name: 'ピーチ', hex: 0xffc9a8 }
  };

  var COLOR_KEYS = Object.keys(COLORS);

  var HAIR_COLORS = {
    brown: { name: 'ちゃいろ', hex: 0x8b5a2b },
    darkbrown: { name: 'こげちゃ', hex: 0x5c3a1e },
    black: { name: 'くろ', hex: 0x3a3242 },
    blonde: { name: 'きんぱつ', hex: 0xf3d27a },
    apricot: { name: 'アプリコット', hex: 0xe8a35c },
    pink: { name: 'ピンク', hex: 0xff9dc0 },
    red: { name: 'あか', hex: 0xd85a4a },
    silver: { name: 'シルバー', hex: 0xdde3ec },
    lavender: { name: 'ラベンダー', hex: 0xc4aeff },
    mint: { name: 'ミント', hex: 0x8fe0c4 },
    sky: { name: 'そらいろ', hex: 0x8ecdff },
    rainbow: { name: 'にじいろ', hex: 0xff9dbf, rainbow: true }
  };

  var EYE_COLORS = {
    brown: { name: 'ちゃいろ', hex: 0x7a4a2a },
    black: { name: 'くろ', hex: 0x3a3242 },
    blue: { name: 'あお', hex: 0x4a8fd8 },
    green: { name: 'みどり', hex: 0x53a86a },
    purple: { name: 'むらさき', hex: 0x9b6fd8 },
    pink: { name: 'ピンク', hex: 0xe86f9b },
    gold: { name: 'ゴールド', hex: 0xd0a13a }
  };

  var PATTERNS = [
    { id: 'plain', name: 'むじ', icon: '⬜' },
    { id: 'dots', name: 'みずたま', icon: '🔵' },
    { id: 'stripe', name: 'たてじま', icon: '📏' },
    { id: 'stripeH', name: 'よこじま', icon: '📐' },
    { id: 'check', name: 'チェック', icon: '🏁' },
    { id: 'gingham', name: 'ギンガム', icon: '🧺' },
    { id: 'heart', name: 'ハート', icon: '💗' },
    { id: 'star', name: 'ほし', icon: '⭐' },
    { id: 'flower', name: 'おはな', icon: '🌸' },
    { id: 'sparkle', name: 'キラキラ', icon: '✨' },
    { id: 'rainbow', name: 'にじ', icon: '🌈' }
  ];

  /* ================= ヘルパー ================= */

  function fab(ctx, color, opts) {
    opts = opts || {};
    var accent = opts.accent != null ? opts.accent : U.shade(color, 0.6);
    return B.fabric(color, opts.pattern || ctx.pattern, accent, { repeat: opts.repeat || 2 });
  }

  function meshFab(geoMesh, ctx, color, opts) {
    geoMesh.material = fab(ctx, color, opts);
    return geoMesh;
  }

  // そで（うでに つける つつ）
  function sleeve(ctx, color, len, r, opts) {
    opts = opts || {};
    var m = B.cyl(r, r * (opts.flare || 1), len, color, { unique: true, seg: 12 });
    m.material = fab(ctx, color, { pattern: opts.pattern, accent: opts.accent, repeat: 1.2 });
    m.position.y = -len / 2 + (opts.top || 0);
    return m;
  }

  /* ================= かみがた ================= */

  function hairMat(color, hc) {
    if (hc && hc.rainbow) {
      return B.fabric(0xffffff, 'rainbow', 0xffffff, { repeat: 1 });
    }
    return B.matUnique(color, { shiny: true, shininess: 26, specular: 0x554455 });
  }

  /**
   * かみの ベース。
   * まえがみ が かおを かくさない ように、
   * ・cap  … うえ と よこ を おおう（まえ は あさく）
   * ・back … うしろあたま を おおう
   * の 2つ に わけて いる。
   */
  function hairCap(color, hc, opts) {
    opts = opts || {};
    var g = new THREE.Group();

    var cap = B.sphere(P.headR * 1.05, color, { seg: 24, unique: true });
    cap.material = hairMat(color, hc);
    cap.scale.set(1.05, 1.03, 0.80);
    cap.position.set(0, 0.012, -0.045);
    g.add(cap);

    if (opts.back !== false) {
      var back = B.sphere(P.headR, color, { seg: 20, unique: true });
      back.material = hairMat(color, hc);
      back.scale.set(0.96, opts.backLen != null ? opts.backLen : 1.0, 0.95);
      back.position.set(0, -0.03, -0.05);
      g.add(back);
    }
    return g;
  }

  // まえがみ（バング）: type 'straight'|'side'|'split'|'round'
  //   ひたい（y 0.15〜0.33 あたり）に のせる。め は かくさない。
  function bangs(color, hc, type) {
    var g = new THREE.Group();
    var R = P.headR + 0.005;

    // ひたい の カーブ に そって ふさ を ならべる
    function tuft(a, w, h, d, y, tilt) {
      var m = B.box(w, h, d, color, { unique: true });
      m.material = hairMat(color, hc);
      var rr = Math.sqrt(Math.max(0.02, R * R - y * y));
      m.position.set(Math.sin(a) * rr * 0.96, y, Math.cos(a) * rr * 0.9);
      m.rotation.y = a;
      m.rotation.z = tilt || 0;
      g.add(m);
      return m;
    }

    if (type === 'side') {
      for (var i = 0; i < 6; i++) {
        var ai = (i / 5 - 0.5) * 1.5;
        tuft(ai, 0.085, 0.185 - i * 0.012, 0.09, 0.225 - i * 0.006, -0.2 + i * 0.075);
      }
    } else if (type === 'split') {
      for (var j = 0; j < 6; j++) {
        var s = j < 3 ? -1 : 1;
        var k = j < 3 ? (2 - j) : (j - 3);
        var aj = s * (0.2 + k * 0.36);
        tuft(aj, 0.085, 0.175, 0.09, 0.235, s * (0.1 + k * 0.12));
      }
    } else if (type === 'round') {
      for (var r = 0; r < 7; r++) {
        var ar = (r / 6 - 0.5) * 1.6;
        var m2 = B.sphere(0.062, color, { seg: 10, unique: true });
        m2.material = hairMat(color, hc);
        var rr2 = Math.sqrt(Math.max(0.02, R * R - 0.215 * 0.215));
        m2.position.set(Math.sin(ar) * rr2, 0.215, Math.cos(ar) * rr2 * 0.92);
        m2.scale.set(1, 1.35, 0.9);
        g.add(m2);
      }
    } else { // straight
      for (var q = 0; q < 7; q++) {
        var aq = (q / 6 - 0.5) * 1.6;
        tuft(aq, 0.082, 0.19, 0.09, 0.225, 0);
      }
    }
    return g;
  }

  function strand(color, hc, len, r) {
    var m = B.capsule(r, len, color, { unique: true });
    m.material = hairMat(color, hc);
    return m;
  }

  var HAIR = {
    twin: {
      name: 'ツインテール', icon: '👧', price: 0, free: true,
      build: function (ctx) {
        var g = new THREE.Group();
        g.add(hairCap(ctx.color, ctx.hc, { backLen: 0.85 }));
        g.add(bangs(ctx.color, ctx.hc, 'straight'));
        for (var s = -1; s <= 1; s += 2) {
          var tail = new THREE.Group();
          var tie = WARDROBE.bowMesh(ctx.accent, 0.05);
          tie.position.set(s * P.headR * 0.86, 0.13, -0.09);
          tie.rotation.y = s * 0.5;
          g.add(tie);
          for (var i = 0; i < 3; i++) {
            var st = strand(ctx.color, ctx.hc, 0.24 - i * 0.05, 0.05 - i * 0.008);
            st.position.set(s * (0.035 + i * 0.028), -0.14 - i * 0.13, -0.02 - i * 0.04);
            st.rotation.z = s * (0.3 - i * 0.1);
            tail.add(st);
          }
          tail.position.set(s * P.headR * 0.88, 0.09, -0.09);
          tail.name = 'tail' + (s < 0 ? 'L' : 'R');
          g.add(tail);
        }
        return g;
      }
    },
    long: {
      name: 'ロングヘア', icon: '💇', price: 0, free: true,
      build: function (ctx) {
        var g = new THREE.Group();
        g.add(hairCap(ctx.color, ctx.hc, { backLen: 1.0 }));
        g.add(bangs(ctx.color, ctx.hc, 'straight'));
        var back = new THREE.Group();
        for (var i = 0; i < 7; i++) {
          var x = -0.24 + i * 0.08;
          var m = B.box(0.095, 0.62 - Math.abs(i - 3) * 0.05, 0.1, ctx.color, { unique: true });
          m.material = hairMat(ctx.color, ctx.hc);
          m.position.set(x, -0.34 + Math.abs(i - 3) * 0.02, -0.12 - Math.abs(i - 3) * 0.012);
          m.rotation.z = (i - 3) * 0.035;
          back.add(m);
        }
        back.name = 'backHair';
        g.add(back);
        return g;
      }
    },
    bob: {
      name: 'ボブ', icon: '💇‍♀️', price: 0, free: true,
      build: function (ctx) {
        var g = new THREE.Group();
        g.add(hairCap(ctx.color, ctx.hc, { backLen: 0.95 }));
        g.add(bangs(ctx.color, ctx.hc, 'round'));
        for (var i = 0; i < 9; i++) {
          var a = (i / 8) * Math.PI - Math.PI / 2;
          var m = B.box(0.1, 0.26, 0.09, ctx.color, { unique: true });
          m.material = hairMat(ctx.color, ctx.hc);
          m.position.set(Math.sin(a) * P.headR * 0.94, -0.13, Math.cos(a) * -P.headR * 0.86 + 0.02);
          m.rotation.y = -a;
          g.add(m);
        }
        return g;
      }
    },
    pony: {
      name: 'ポニーテール', icon: '🐴', price: 8,
      build: function (ctx) {
        var g = new THREE.Group();
        g.add(hairCap(ctx.color, ctx.hc, { backLen: 0.7 }));
        g.add(bangs(ctx.color, ctx.hc, 'side'));
        var tie = B.torus(0.07, 0.025, ctx.accent, { unique: true });
        tie.position.set(0, 0.12, -P.headR * 0.9);
        tie.rotation.x = 0.6;
        g.add(tie);
        var tail = new THREE.Group();
        for (var i = 0; i < 4; i++) {
          var st = strand(ctx.color, ctx.hc, 0.26 - i * 0.04, 0.08 - i * 0.013);
          st.position.set(0, -0.1 - i * 0.14, -0.03 - i * 0.05);
          st.rotation.x = -0.3 - i * 0.15;
          tail.add(st);
        }
        tail.position.set(0, 0.12, -P.headR * 0.92);
        tail.name = 'tailBack';
        g.add(tail);
        return g;
      }
    },
    braid: {
      name: 'みつあみ', icon: '🎀', price: 12,
      build: function (ctx) {
        var g = new THREE.Group();
        g.add(hairCap(ctx.color, ctx.hc, { backLen: 0.9 }));
        g.add(bangs(ctx.color, ctx.hc, 'split'));
        for (var s = -1; s <= 1; s += 2) {
          var br = new THREE.Group();
          for (var i = 0; i < 6; i++) {
            var ball = B.sphere(0.062 - i * 0.004, ctx.color, { seg: 10, unique: true });
            ball.material = hairMat(ctx.color, ctx.hc);
            ball.position.set(Math.sin(i * 1.6) * 0.022, -i * 0.088, 0);
            ball.scale.set(1.2, 0.9, 1);
            br.add(ball);
          }
          var bow = B.sphere(0.045, ctx.accent, { seg: 8, unique: true });
          bow.position.y = -0.54; bow.scale.set(1.5, 0.7, 0.7);
          br.add(bow);
          br.position.set(s * P.headR * 0.86, -0.02, -0.02);
          br.rotation.z = s * 0.16;
          br.name = 'tail' + (s < 0 ? 'L' : 'R');
          g.add(br);
        }
        return g;
      }
    },
    curl: {
      name: 'くるくる', icon: '🌀', price: 16,
      build: function (ctx) {
        var g = new THREE.Group();
        g.add(hairCap(ctx.color, ctx.hc, { backLen: 0.9 }));
        g.add(bangs(ctx.color, ctx.hc, 'round'));
        for (var i = 0; i < 16; i++) {
          var a = (i / 16) * Math.PI * 2;
          var rr = P.headR * 0.92;
          var ball = B.sphere(0.085, ctx.color, { seg: 10, unique: true });
          ball.material = hairMat(ctx.color, ctx.hc);
          ball.position.set(Math.cos(a) * rr * 0.95, -0.1 - (i % 3) * 0.09, Math.sin(a) * rr * 0.85 - 0.02);
          g.add(ball);
        }
        return g;
      }
    },
    buns: {
      name: 'おだんご', icon: '🍡', price: 14,
      build: function (ctx) {
        var g = new THREE.Group();
        g.add(hairCap(ctx.color, ctx.hc, { backLen: 0.62 }));
        g.add(bangs(ctx.color, ctx.hc, 'straight'));
        for (var s = -1; s <= 1; s += 2) {
          var bun = B.sphere(0.115, ctx.color, { seg: 14, unique: true });
          bun.material = hairMat(ctx.color, ctx.hc);
          bun.position.set(s * 0.235, 0.235, -0.02);
          g.add(bun);
          var ring = B.torus(0.12, 0.028, ctx.accent, { unique: true });
          ring.position.set(s * 0.235, 0.235, -0.02);
          ring.rotation.y = Math.PI / 2;
          g.add(ring);
        }
        return g;
      }
    },
    short: {
      name: 'ショート', icon: '✂️', price: 6,
      build: function (ctx) {
        var g = new THREE.Group();
        g.add(hairCap(ctx.color, ctx.hc, { backLen: 0.6 }));
        g.add(bangs(ctx.color, ctx.hc, 'side'));
        for (var i = 0; i < 7; i++) {
          var a = (i / 6) * Math.PI - Math.PI / 2;
          var m = B.box(0.09, 0.14, 0.08, ctx.color, { unique: true });
          m.material = hairMat(ctx.color, ctx.hc);
          m.position.set(Math.sin(a) * P.headR * 0.92, -0.08, Math.cos(a) * -P.headR * 0.8);
          m.rotation.set(0.2, -a, 0);
          g.add(m);
        }
        return g;
      }
    },
    princess: {
      name: 'プリンセス', icon: '👸', price: 22,
      build: function (ctx) {
        var g = new THREE.Group();
        g.add(hairCap(ctx.color, ctx.hc, { backLen: 1.0 }));
        g.add(bangs(ctx.color, ctx.hc, 'split'));
        // たてロール
        for (var s = -1; s <= 1; s += 2) {
          var roll = new THREE.Group();
          for (var i = 0; i < 5; i++) {
            var t = B.torus(0.1 - i * 0.008, 0.045, ctx.color, { unique: true });
            t.material = hairMat(ctx.color, ctx.hc);
            t.position.y = -i * 0.1;
            t.rotation.x = Math.PI / 2;
            roll.add(t);
          }
          roll.position.set(s * P.headR * 0.92, -0.06, 0.02);
          roll.name = 'tail' + (s < 0 ? 'L' : 'R');
          g.add(roll);
        }
        // うしろ ロング
        for (var q = 0; q < 5; q++) {
          var m = B.box(0.1, 0.6, 0.1, ctx.color, { unique: true });
          m.material = hairMat(ctx.color, ctx.hc);
          m.position.set(-0.17 + q * 0.085, -0.34, -0.16);
          g.add(m);
        }
        return g;
      }
    },
    wave: {
      name: 'ウェーブ', icon: '🌊', price: 18,
      build: function (ctx) {
        var g = new THREE.Group();
        g.add(hairCap(ctx.color, ctx.hc, { backLen: 0.95 }));
        g.add(bangs(ctx.color, ctx.hc, 'side'));
        for (var s = -1; s <= 1; s += 2) {
          var col = new THREE.Group();
          for (var i = 0; i < 6; i++) {
            var ball = B.sphere(0.085, ctx.color, { seg: 10, unique: true });
            ball.material = hairMat(ctx.color, ctx.hc);
            ball.position.set(Math.sin(i * 1.1) * 0.05 * s, -i * 0.1, -0.02 - Math.cos(i * 1.1) * 0.03);
            ball.scale.set(1.15, 0.95, 1);
            col.add(ball);
          }
          col.position.set(s * P.headR * 0.82, -0.05, -0.03);
          col.name = 'tail' + (s < 0 ? 'L' : 'R');
          g.add(col);
        }
        for (var q = 0; q < 4; q++) {
          var m = B.sphere(0.11, ctx.color, { seg: 10, unique: true });
          m.material = hairMat(ctx.color, ctx.hc);
          m.position.set(-0.12 + q * 0.08, -0.16 - (q % 2) * 0.07, -0.2);
          g.add(m);
        }
        return g;
      }
    }
  };

  /* ================= トップス ================= */

  function torsoShell(ctx, color, opts) {
    opts = opts || {};
    var h = opts.h || (P.torsoTop - P.torsoBot);
    var g = new THREE.Group();
    var mtl = fab(ctx, color, { pattern: opts.pattern, accent: opts.accent, repeat: opts.repeat || 1.6 });
    var rt = P.torsoR * (opts.rt || 1.0), rb = P.torsoR * (opts.rb || 1.08);
    var m = B.cyl(rt, rb, h, color, { unique: true, seg: 20 });
    m.material = mtl;
    m.position.y = (P.torsoTop + P.torsoBot) / 2 - P.torsoBot + (opts.dy || 0);
    g.add(m);
    // かた（まるく つなぐ）
    var cap = B.halfSphere(rt, color, { seg: 20, unique: true });
    cap.material = mtl;
    cap.position.y = P.torsoTop - P.torsoBot + (opts.dy || 0);
    cap.scale.y = 0.42;
    g.add(cap);
    for (var s = -1; s <= 1; s += 2) {
      var sh = B.sphere(P.torsoR * 0.44, color, { seg: 14, unique: true });
      sh.material = mtl;
      sh.position.set(s * P.shoulderX * 0.92, P.shoulderY - P.torsoBot + (opts.dy || 0), 0);
      sh.scale.set(1, 0.9, 1);
      g.add(sh);
    }
    return g;
  }

  var TOP = {
    tee: {
      name: 'Tシャツ', icon: '👕', price: 0, free: true,
      build: function (ctx) {
        ctx.slotTorso.add(torsoShell(ctx, ctx.color));
        for (var s = -1; s <= 1; s += 2) {
          var sl = sleeve(ctx, ctx.color, 0.13, 0.075, { flare: 1.05 });
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(sl);
        }
      }
    },
    frill: {
      name: 'フリルブラウス', icon: '🎀', price: 10,
      build: function (ctx) {
        ctx.slotTorso.add(torsoShell(ctx, ctx.color));
        var f = B.cyl(P.torsoR * 1.05, P.torsoR * 1.55, 0.12, U.shade(ctx.color, 0.45), { unique: true, seg: 20 });
        f.material = fab(ctx, U.shade(ctx.color, 0.4), { pattern: 'frill', accent: 0xffffff });
        f.position.y = 0.02;
        ctx.slotTorso.add(f);
        var collar = B.torus(0.15, 0.032, 0xffffff, { unique: true });
        collar.position.y = P.torsoTop - P.torsoBot - 0.005;
        collar.rotation.x = Math.PI / 2;
        ctx.slotTorso.add(collar);
        for (var s = -1; s <= 1; s += 2) {
          var sl = sleeve(ctx, ctx.color, 0.16, 0.08, { flare: 1.5 });
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(sl);
          var puff = B.sphere(0.095, ctx.color, { seg: 12, unique: true });
          puff.material = fab(ctx, ctx.color, { repeat: 1 });
          puff.position.y = -0.05;
          puff.scale.y = 0.8;
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(puff);
        }
      }
    },
    sailor: {
      name: 'セーラー', icon: '⚓', price: 12,
      build: function (ctx) {
        ctx.slotTorso.add(torsoShell(ctx, 0xffffff, { pattern: 'plain' }));
        // えり
        var collar = B.cyl(P.torsoR * 1.18, P.torsoR * 1.3, 0.1, ctx.color, { unique: true, seg: 18 });
        collar.position.y = P.torsoTop - P.torsoBot - 0.055;
        ctx.slotTorso.add(collar);
        var back = B.box(0.26, 0.2, 0.02, ctx.color, { unique: true });
        back.position.set(0, P.torsoTop - P.torsoBot - 0.16, -P.torsoR * 0.95);
        ctx.slotTorso.add(back);
        // スカーフ
        var knot = B.sphere(0.05, 0xff6b6b, { seg: 10, unique: true });
        knot.position.set(0, P.torsoTop - P.torsoBot - 0.13, P.torsoR * 0.95);
        ctx.slotTorso.add(knot);
        var tie = B.cone(0.05, 0.16, 0xff6b6b, { unique: true, seg: 8 });
        tie.position.set(0, P.torsoTop - P.torsoBot - 0.24, P.torsoR * 0.9);
        tie.rotation.x = Math.PI;
        ctx.slotTorso.add(tie);
        for (var s = -1; s <= 1; s += 2) {
          var sl = sleeve(ctx, 0xffffff, 0.15, 0.078, { pattern: 'plain', flare: 1.15 });
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(sl);
          var band = B.cyl(0.082, 0.082, 0.03, ctx.color, { unique: true, seg: 12 });
          band.position.y = -0.15;
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(band);
        }
      }
    },
    hoodie: {
      name: 'パーカー', icon: '🧥', price: 14,
      build: function (ctx) {
        ctx.slotTorso.add(torsoShell(ctx, ctx.color, { rt: 1.12, rb: 1.16 }));
        var hood = B.halfSphere(0.2, ctx.color, { seg: 14, unique: true });
        hood.material = fab(ctx, ctx.color, { repeat: 1 });
        hood.position.set(0, P.torsoTop - P.torsoBot - 0.02, -0.13);
        hood.rotation.x = -0.5;
        ctx.slotTorso.add(hood);
        var pocket = B.box(0.2, 0.09, 0.03, U.shade(ctx.color, -0.12), { unique: true });
        pocket.position.set(0, 0.08, P.torsoR * 1.05);
        ctx.slotTorso.add(pocket);
        for (var s = -1; s <= 1; s += 2) {
          var sl = sleeve(ctx, ctx.color, 0.36, 0.084, { flare: 0.95 });
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(sl);
        }
        for (var i = -1; i <= 1; i += 2) {
          var str = B.cyl(0.012, 0.012, 0.12, 0xffffff, { unique: true, seg: 6 });
          str.position.set(i * 0.05, P.torsoTop - P.torsoBot - 0.11, P.torsoR * 1.02);
          ctx.slotTorso.add(str);
        }
      }
    },
    knit: {
      name: 'ニット', icon: '🧶', price: 10,
      build: function (ctx) {
        var t = torsoShell(ctx, ctx.color, { pattern: ctx.pattern === 'plain' ? 'stripeH' : ctx.pattern, repeat: 3 });
        ctx.slotTorso.add(t);
        var hem = B.cyl(P.torsoR * 1.14, P.torsoR * 1.1, 0.06, U.shade(ctx.color, -0.14), { unique: true, seg: 18 });
        hem.position.y = 0.02;
        ctx.slotTorso.add(hem);
        for (var s = -1; s <= 1; s += 2) {
          var sl = sleeve(ctx, ctx.color, 0.34, 0.086, { pattern: 'stripeH' });
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(sl);
        }
      }
    },
    dress: {
      name: 'ワンピース', icon: '👗', price: 16, covers: true,
      build: function (ctx) {
        ctx.slotTorso.add(torsoShell(ctx, ctx.color));
        var skirt = B.cone(0.42, 0.48, ctx.color, { unique: true, seg: 22 });
        skirt.material = fab(ctx, ctx.color, { repeat: 2.4 });
        skirt.position.y = -0.14;
        ctx.slotHips.add(skirt);
        var belt = B.cyl(P.torsoR * 1.08, P.torsoR * 1.08, 0.045, U.shade(ctx.color, -0.3), { unique: true, seg: 18 });
        belt.position.y = 0.015;
        ctx.slotHips.add(belt);
        var bow = B.sphere(0.055, 0xffffff, { seg: 10, unique: true });
        bow.scale.set(1.6, 0.8, 0.7);
        bow.position.set(0, 0.015, P.torsoR * 1.05);
        ctx.slotHips.add(bow);
        for (var s = -1; s <= 1; s += 2) {
          var sl = sleeve(ctx, ctx.color, 0.1, 0.078, { flare: 1.3 });
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(sl);
        }
      }
    },
    princess: {
      name: 'プリンセスドレス', icon: '👸', price: 40, covers: true,
      build: function (ctx) {
        ctx.slotTorso.add(torsoShell(ctx, ctx.color, { pattern: 'sparkle', accent: 0xffffff }));
        // ふくらんだ スカート（だんだん）
        for (var i = 0; i < 3; i++) {
          var r1 = 0.24 + i * 0.13, r2 = 0.4 + i * 0.16;
          var lay = B.cyl(r1, r2, 0.2, ctx.color, { unique: true, seg: 24 });
          lay.material = fab(ctx, U.shade(ctx.color, i * 0.12), { pattern: i === 1 ? 'sparkle' : ctx.pattern, accent: 0xffffff, repeat: 2 });
          lay.position.y = -0.02 - i * 0.16;
          ctx.slotHips.add(lay);
        }
        var belt = B.torus(P.torsoR * 1.05, 0.03, 0xf5c542, { unique: true });
        belt.position.y = 0.03; belt.rotation.x = Math.PI / 2;
        ctx.slotHips.add(belt);
        var gem = B.heart(0.1, 0xff6fa5, { unique: true, shiny: true });
        gem.position.set(0, 0.2, P.torsoR * 1.02);
        ctx.slotTorso.add(gem);
        for (var s = -1; s <= 1; s += 2) {
          var puff = B.sphere(0.1, ctx.color, { seg: 12, unique: true });
          puff.material = fab(ctx, ctx.color, { repeat: 1 });
          puff.position.y = -0.04; puff.scale.y = 0.75;
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(puff);
          var glove = B.cyl(0.062, 0.058, 0.3, 0xffffff, { unique: true, seg: 10 });
          glove.position.y = -0.28;
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(glove);
        }
      }
    },
    yukata: {
      name: 'ゆかた', icon: '🎐', price: 28, covers: true,
      build: function (ctx) {
        var body = B.cyl(P.torsoR * 1.05, P.torsoR * 1.9, 0.95, ctx.color, { unique: true, seg: 18 });
        body.material = fab(ctx, ctx.color, { pattern: ctx.pattern === 'plain' ? 'flower' : ctx.pattern, repeat: 2.6 });
        body.position.y = P.torsoTop - P.torsoBot - 0.46;
        ctx.slotTorso.add(body);
        // えり
        for (var s = -1; s <= 1; s += 2) {
          var col = B.box(0.06, 0.34, 0.03, 0xffffff, { unique: true });
          col.position.set(s * 0.06, P.torsoTop - P.torsoBot - 0.17, P.torsoR * 0.96);
          col.rotation.z = s * 0.28;
          ctx.slotTorso.add(col);
          var sl = B.box(0.17, 0.3, 0.13, ctx.color, { unique: true });
          sl.material = fab(ctx, ctx.color, { pattern: 'flower', repeat: 1.4 });
          sl.position.y = -0.16;
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(sl);
        }
        // おび
        var obi = B.cyl(P.torsoR * 1.24, P.torsoR * 1.3, 0.16, ctx.accent, { unique: true, seg: 18 });
        obi.position.y = 0.06;
        ctx.slotTorso.add(obi);
        var knot = B.box(0.2, 0.16, 0.1, ctx.accent, { unique: true });
        knot.position.set(0, 0.06, -P.torsoR * 1.25);
        ctx.slotTorso.add(knot);
      }
    },
    tutu: {
      name: 'バレエ', icon: '🩰', price: 24, covers: true,
      build: function (ctx) {
        var leo = B.cyl(P.torsoR * 0.98, P.torsoR * 1.0, P.torsoTop - P.torsoBot, ctx.color, { unique: true, seg: 18 });
        leo.material = fab(ctx, ctx.color, { repeat: 1.4 });
        leo.position.y = (P.torsoTop - P.torsoBot) / 2;
        ctx.slotTorso.add(leo);
        for (var i = 0; i < 3; i++) {
          var t = B.cyl(0.17, 0.44 - i * 0.03, 0.035, U.shade(ctx.color, 0.4 + i * 0.12), { unique: true, seg: 24 });
          t.material = B.matUnique(U.shade(ctx.color, 0.45 + i * 0.14), { opacity: 0.85 });
          t.position.y = 0.02 - i * 0.035;
          t.rotation.y = i * 0.4;
          ctx.slotHips.add(t);
        }
        for (var s = -1; s <= 1; s += 2) {
          var strap = B.box(0.05, 0.2, 0.03, ctx.color, { unique: true });
          strap.position.set(s * 0.1, P.torsoTop - P.torsoBot - 0.06, 0.02);
          strap.rotation.z = s * 0.2;
          ctx.slotTorso.add(strap);
        }
      }
    },
    apron: {
      name: 'エプロン', icon: '🧑‍🍳', price: 8,
      build: function (ctx) {
        ctx.slotTorso.add(torsoShell(ctx, 0xffffff, { pattern: 'plain' }));
        var ap = B.box(0.28, 0.38, 0.03, ctx.color, { unique: true });
        ap.material = fab(ctx, ctx.color, { repeat: 1.6 });
        ap.position.set(0, 0.16, P.torsoR * 1.0);
        ctx.slotTorso.add(ap);
        var pk = B.box(0.16, 0.09, 0.02, U.shade(ctx.color, -0.15), { unique: true });
        pk.position.set(0, 0.06, P.torsoR * 1.05);
        ctx.slotTorso.add(pk);
        for (var s = -1; s <= 1; s += 2) {
          var strap = B.box(0.04, 0.24, 0.02, ctx.color, { unique: true });
          strap.position.set(s * 0.09, 0.32, P.torsoR * 0.9);
          strap.rotation.z = s * 0.18;
          ctx.slotTorso.add(strap);
          var sl = sleeve(ctx, 0xffffff, 0.12, 0.075, { pattern: 'plain' });
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(sl);
        }
      }
    },
    star: {
      name: 'スターアイドル', icon: '🌟', price: 34,
      build: function (ctx) {
        ctx.slotTorso.add(torsoShell(ctx, ctx.color, { pattern: 'star', accent: 0xffe97a }));
        var st = B.star(0.09, 0xffd44d, { unique: true, shiny: true });
        st.position.set(0, 0.22, P.torsoR * 1.04);
        ctx.slotTorso.add(st);
        var collar = B.torus(0.15, 0.03, 0xffd44d, { unique: true, shiny: true });
        collar.position.y = P.torsoTop - P.torsoBot - 0.01;
        collar.rotation.x = Math.PI / 2;
        ctx.slotTorso.add(collar);
        for (var s = -1; s <= 1; s += 2) {
          var sl = sleeve(ctx, ctx.color, 0.3, 0.08, { pattern: 'sparkle', accent: 0xffffff });
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(sl);
          var cuff = B.torus(0.075, 0.02, 0xffd44d, { unique: true, shiny: true });
          cuff.position.y = -0.29; cuff.rotation.x = Math.PI / 2;
          (s < 0 ? ctx.slotArmL : ctx.slotArmR).add(cuff);
        }
      }
    }
  };

  /* ================= ボトムス ================= */

  var BOTTOM = {
    flare: {
      name: 'フレアスカート', icon: '👗', price: 0, free: true,
      build: function (ctx) {
        var s = B.cone(0.36, 0.34, ctx.color, { unique: true, seg: 22 });
        s.material = fab(ctx, ctx.color, { repeat: 2.2 });
        s.position.y = -0.09;
        ctx.slotHips.add(s);
      }
    },
    pleats: {
      name: 'プリーツ', icon: '🩱', price: 8,
      build: function (ctx) {
        for (var i = 0; i < 14; i++) {
          var a = i / 14 * Math.PI * 2;
          var p = B.box(0.075, 0.3, 0.05, i % 2 ? ctx.color : U.shade(ctx.color, -0.1), { unique: true });
          p.position.set(Math.cos(a) * 0.24, -0.12, Math.sin(a) * 0.24);
          p.rotation.y = -a + Math.PI / 2;
          p.rotation.x = 0.12;
          ctx.slotHips.add(p);
        }
        var band = B.cyl(0.2, 0.21, 0.06, U.shade(ctx.color, -0.2), { unique: true, seg: 18 });
        band.position.y = 0.02;
        ctx.slotHips.add(band);
      }
    },
    long: {
      name: 'ロングスカート', icon: '🧵', price: 10,
      build: function (ctx) {
        var s = B.cyl(0.2, 0.42, 0.5, ctx.color, { unique: true, seg: 22 });
        s.material = fab(ctx, ctx.color, { repeat: 2.6 });
        s.position.y = -0.22;
        ctx.slotHips.add(s);
      }
    },
    pants: {
      name: 'パンツ', icon: '👖', price: 6,
      build: function (ctx) {
        var hip = B.cyl(0.2, 0.19, 0.14, ctx.color, { unique: true, seg: 16 });
        hip.material = fab(ctx, ctx.color, { repeat: 1.4 });
        hip.position.y = -0.03;
        ctx.slotHips.add(hip);
        for (var s = -1; s <= 1; s += 2) {
          var leg = B.cyl(0.088, 0.082, 0.5, ctx.color, { unique: true, seg: 12 });
          leg.material = fab(ctx, ctx.color, { repeat: 1.2 });
          leg.position.set(s * P.hipX, -0.34, 0);
          ctx.slotHips.add(leg);
        }
      }
    },
    shorts: {
      name: 'ショートパンツ', icon: '🩳', price: 6,
      build: function (ctx) {
        var hip = B.cyl(0.2, 0.2, 0.16, ctx.color, { unique: true, seg: 16 });
        hip.material = fab(ctx, ctx.color, { repeat: 1.4 });
        hip.position.y = -0.04;
        ctx.slotHips.add(hip);
        for (var s = -1; s <= 1; s += 2) {
          var leg = B.cyl(0.095, 0.098, 0.14, ctx.color, { unique: true, seg: 12 });
          leg.material = fab(ctx, ctx.color, { repeat: 1 });
          leg.position.set(s * P.hipX, -0.16, 0);
          ctx.slotHips.add(leg);
        }
      }
    },
    tutuSkirt: {
      name: 'チュチュ', icon: '🩰', price: 12,
      build: function (ctx) {
        for (var i = 0; i < 3; i++) {
          var t = B.cyl(0.18, 0.42 - i * 0.04, 0.04, ctx.color, { unique: true, seg: 24 });
          t.material = B.matUnique(U.shade(ctx.color, 0.3 + i * 0.15), { opacity: 0.88 });
          t.position.y = -0.02 - i * 0.045;
          t.rotation.y = i * 0.5;
          ctx.slotHips.add(t);
        }
      }
    },
    overall: {
      name: 'サロペット', icon: '🧑‍🌾', price: 14,
      build: function (ctx) {
        var hip = B.cyl(0.2, 0.22, 0.3, ctx.color, { unique: true, seg: 16 });
        hip.material = fab(ctx, ctx.color, { repeat: 1.6 });
        hip.position.y = -0.1;
        ctx.slotHips.add(hip);
        var bib = B.box(0.22, 0.22, 0.04, ctx.color, { unique: true });
        bib.material = fab(ctx, ctx.color, { repeat: 1 });
        bib.position.set(0, 0.2, P.torsoR * 0.95);
        ctx.slotHips.add(bib);
        for (var s = -1; s <= 1; s += 2) {
          var strap = B.box(0.045, 0.3, 0.03, ctx.color, { unique: true });
          strap.position.set(s * 0.085, 0.34, P.torsoR * 0.86);
          strap.rotation.z = s * 0.1;
          ctx.slotHips.add(strap);
        }
      }
    },
    jeans: {
      name: 'デニム', icon: '👖', price: 12,
      build: function (ctx) {
        var hip = B.cyl(0.2, 0.19, 0.14, 0x5a7bb5, { unique: true, seg: 16 });
        hip.position.y = -0.03;
        ctx.slotHips.add(hip);
        for (var s = -1; s <= 1; s += 2) {
          var leg = B.cyl(0.09, 0.1, 0.52, 0x5a7bb5, { unique: true, seg: 12 });
          leg.position.set(s * P.hipX, -0.35, 0);
          ctx.slotHips.add(leg);
        }
        var belt = B.cyl(0.205, 0.205, 0.04, 0x7a5230, { unique: true, seg: 16 });
        belt.position.y = 0.03;
        ctx.slotHips.add(belt);
      }
    }
  };

  /* ================= くつ ================= */

  var SHOES = {
    sneaker: {
      name: 'スニーカー', icon: '👟', price: 0, free: true,
      build: function (ctx, slot) {
        var s = B.roundBox(0.135, 0.1, 0.24, 0.04, ctx.color, { unique: true });
        s.position.set(0, 0.0, 0.03);
        slot.add(s);
        var sole = B.roundBox(0.145, 0.035, 0.25, 0.02, 0xffffff, { unique: true });
        sole.position.set(0, -0.04, 0.03);
        slot.add(sole);
        var lace = B.box(0.08, 0.02, 0.06, 0xffffff, { unique: true });
        lace.position.set(0, 0.045, 0.06);
        slot.add(lace);
      }
    },
    mary: {
      name: 'ストラップ', icon: '🥿', price: 8,
      build: function (ctx, slot) {
        var s = B.roundBox(0.13, 0.085, 0.22, 0.04, ctx.color, { unique: true, shiny: true });
        s.position.set(0, 0, 0.03);
        slot.add(s);
        var strap = B.box(0.14, 0.022, 0.02, ctx.color, { unique: true, shiny: true });
        strap.position.set(0, 0.05, -0.01);
        slot.add(strap);
        var btn = B.sphere(0.018, 0xffffff, { seg: 8, unique: true });
        btn.position.set(0.06, 0.05, -0.01);
        slot.add(btn);
      }
    },
    boots: {
      name: 'ブーツ', icon: '🥾', price: 14,
      build: function (ctx, slot) {
        var s = B.roundBox(0.135, 0.1, 0.23, 0.04, ctx.color, { unique: true });
        s.position.set(0, 0, 0.03);
        slot.add(s);
        var shaft = B.cyl(0.085, 0.09, 0.24, ctx.color, { unique: true, seg: 12 });
        shaft.position.set(0, 0.16, -0.01);
        slot.add(shaft);
        var cuff = B.torus(0.09, 0.022, U.shade(ctx.color, 0.4), { unique: true });
        cuff.position.set(0, 0.27, -0.01);
        cuff.rotation.x = Math.PI / 2;
        slot.add(cuff);
      }
    },
    sandal: {
      name: 'サンダル', icon: '👡', price: 8,
      build: function (ctx, slot) {
        var sole = B.roundBox(0.13, 0.035, 0.23, 0.03, ctx.color, { unique: true });
        sole.position.set(0, -0.03, 0.03);
        slot.add(sole);
        var strap = B.box(0.13, 0.022, 0.03, U.shade(ctx.color, 0.35), { unique: true });
        strap.position.set(0, 0.0, 0.06);
        strap.rotation.x = 0.3;
        slot.add(strap);
        var f = B.flower(0xffffff);
        f.scale.setScalar(0.35);
        f.position.set(0, -0.06, 0.09);
        slot.add(f);
      }
    },
    heels: {
      name: 'ヒール', icon: '👠', price: 20,
      build: function (ctx, slot) {
        var s = B.roundBox(0.115, 0.075, 0.23, 0.035, ctx.color, { unique: true, shiny: true });
        s.position.set(0, 0.02, 0.04);
        s.rotation.x = -0.14;
        slot.add(s);
        var heel = B.cyl(0.02, 0.025, 0.1, ctx.color, { unique: true, seg: 8, shiny: true });
        heel.position.set(0, -0.035, -0.06);
        slot.add(heel);
      }
    },
    rain: {
      name: 'レインブーツ', icon: '🌧', price: 10,
      build: function (ctx, slot) {
        var s = B.roundBox(0.14, 0.105, 0.24, 0.05, ctx.color, { unique: true, shiny: true });
        s.position.set(0, 0, 0.03);
        slot.add(s);
        var shaft = B.cyl(0.095, 0.1, 0.3, ctx.color, { unique: true, seg: 12, shiny: true });
        shaft.position.set(0, 0.19, -0.01);
        slot.add(shaft);
        var band = B.cyl(0.102, 0.102, 0.05, 0xffd95c, { unique: true, seg: 12 });
        band.position.set(0, 0.3, -0.01);
        slot.add(band);
      }
    },
    ballet: {
      name: 'バレエシューズ', icon: '🩰', price: 16,
      build: function (ctx, slot) {
        var s = B.roundBox(0.12, 0.07, 0.22, 0.035, ctx.color, { unique: true, shiny: true });
        s.position.set(0, -0.005, 0.03);
        slot.add(s);
        for (var i = -1; i <= 1; i += 2) {
          var rib = B.box(0.018, 0.2, 0.018, ctx.color, { unique: true });
          rib.position.set(i * 0.045, 0.12, 0);
          rib.rotation.z = i * 0.12;
          slot.add(rib);
        }
      }
    }
  };

  /* ================= アクセサリー ================= */

  function bowMesh(color, size) {
    var g = new THREE.Group();
    for (var s = -1; s <= 1; s += 2) {
      var w = B.sphere(size, color, { seg: 12, unique: true });
      w.scale.set(1.25, 0.85, 0.55);
      w.position.set(s * size * 1.15, 0, 0);
      g.add(w);
    }
    var knot = B.sphere(size * 0.5, U.shade(color, -0.15), { seg: 10, unique: true });
    g.add(knot);
    return g;
  }

  var ACC = {
    none: { name: 'なし', icon: '🚫', price: 0, free: true, build: function () { } },
    ribbon: {
      name: 'リボン', icon: '🎀', price: 0, free: true,
      build: function (ctx) {
        var b = bowMesh(ctx.color, 0.085);
        b.position.set(-0.16, P.headR * 0.82, 0.1);
        b.rotation.set(0.2, -0.3, 0.35);
        ctx.slotHead.add(b);
      }
    },
    crown: {
      name: 'おうかん', icon: '👑', price: 30,
      build: function (ctx) {
        var g = new THREE.Group();
        var band = B.cyl(0.15, 0.155, 0.055, 0xf5c542, { unique: true, seg: 16, shiny: true });
        g.add(band);
        for (var i = 0; i < 5; i++) {
          var a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          var sp = B.cone(0.035, 0.09, 0xf5c542, { unique: true, seg: 6, shiny: true });
          sp.position.set(Math.cos(a) * 0.14, 0.06, Math.sin(a) * 0.14);
          g.add(sp);
          var gem = B.sphere(0.022, ctx.color, { seg: 8, unique: true, shiny: true });
          gem.position.set(Math.cos(a) * 0.14, 0.115, Math.sin(a) * 0.14);
          g.add(gem);
        }
        g.position.set(0, P.headR * 0.92, 0);
        ctx.slotHead.add(g);
      }
    },
    catears: {
      name: 'ねこみみ', icon: '🐱', price: 18,
      build: function (ctx) {
        for (var s = -1; s <= 1; s += 2) {
          var ear = B.cone(0.075, 0.14, ctx.color, { unique: true, seg: 4 });
          ear.position.set(s * 0.15, P.headR * 0.98, -0.02);
          ear.rotation.set(0, Math.PI / 4, s * 0.2);
          ctx.slotHead.add(ear);
          var inner = B.cone(0.045, 0.09, 0xffc0d6, { unique: true, seg: 4 });
          inner.position.set(s * 0.15, P.headR * 0.98, 0.015);
          inner.rotation.set(0, Math.PI / 4, s * 0.2);
          ctx.slotHead.add(inner);
        }
      }
    },
    hat: {
      name: 'ぼうし', icon: '👒', price: 16,
      build: function (ctx) {
        var brim = B.cyl(0.34, 0.34, 0.02, ctx.color, { unique: true, seg: 24 });
        brim.position.set(0, P.headR * 0.7, 0);
        ctx.slotHead.add(brim);
        var top = B.cyl(0.17, 0.19, 0.16, ctx.color, { unique: true, seg: 20 });
        top.position.set(0, P.headR * 0.78, 0);
        ctx.slotHead.add(top);
        var band = B.cyl(0.193, 0.193, 0.04, U.shade(ctx.color, -0.3), { unique: true, seg: 20 });
        band.position.set(0, P.headR * 0.73, 0);
        ctx.slotHead.add(band);
        var f = B.flower(0xffffff);
        f.scale.setScalar(0.6);
        f.position.set(0.13, P.headR * 0.68, 0.13);
        ctx.slotHead.add(f);
      }
    },
    glasses: {
      name: 'めがね', icon: '👓', price: 12,
      build: function (ctx) {
        for (var s = -1; s <= 1; s += 2) {
          var lens = B.torus(0.062, 0.014, ctx.color, { unique: true, shiny: true });
          lens.position.set(s * 0.1, 0.02, P.headR * 0.87);
          ctx.slotHead.add(lens);
        }
        var bridge = B.box(0.06, 0.012, 0.012, ctx.color, { unique: true, shiny: true });
        bridge.position.set(0, 0.02, P.headR * 0.88);
        ctx.slotHead.add(bridge);
      }
    },
    wings: {
      name: 'てんしのはね', icon: '🕊', price: 36,
      build: function (ctx) {
        for (var s = -1; s <= 1; s += 2) {
          var w = new THREE.Group();
          for (var i = 0; i < 4; i++) {
            var f = B.petal(0.2 - i * 0.028, 0xffffff, { unique: true });
            f.material = B.matUnique(U.shade(ctx.color, 0.55 - i * 0.06), { opacity: 0.94 });
            f.position.set(i * 0.03, i * 0.045, 0);
            f.rotation.set(0, 0, s * (0.5 + i * 0.22));
            w.add(f);
          }
          w.position.set(s * 0.12, 0.14, -P.torsoR * 1.1);
          w.rotation.y = s * 0.45;
          w.scale.x = s;
          w.name = 'wing' + (s < 0 ? 'L' : 'R');
          ctx.slotBack.add(w);
        }
      }
    },
    flowerCrown: {
      name: 'はなかんむり', icon: '🌷', price: 20,
      build: function (ctx) {
        var cols = [0xff9dbf, 0xffd95c, 0xc09dff, 0xffffff, 0x8fd4ff];
        for (var i = 0; i < 8; i++) {
          var a = (i / 8) * Math.PI * 2;
          var f = B.flower(cols[i % cols.length]);
          f.scale.setScalar(0.62);
          f.position.set(Math.cos(a) * 0.28, P.headR * 0.6, Math.sin(a) * 0.28);
          f.rotation.z = Math.cos(a) * 0.5;
          f.rotation.x = -Math.sin(a) * 0.5;
          ctx.slotHead.add(f);
        }
      }
    },
    headphone: {
      name: 'ヘッドホン', icon: '🎧', price: 22,
      build: function (ctx) {
        var band = B.torus(0.3, 0.028, ctx.color, { unique: true, shiny: true });
        band.position.set(0, 0.03, 0);
        band.rotation.y = Math.PI / 2;
        band.scale.y = 1.05;
        ctx.slotHead.add(band);
        for (var s = -1; s <= 1; s += 2) {
          var cup = B.cyl(0.075, 0.075, 0.05, ctx.color, { unique: true, seg: 14, shiny: true });
          cup.position.set(s * 0.3, 0.02, 0);
          cup.rotation.z = Math.PI / 2;
          ctx.slotHead.add(cup);
          var pad = B.cyl(0.055, 0.055, 0.06, 0xffffff, { unique: true, seg: 12 });
          pad.position.set(s * 0.28, 0.02, 0);
          pad.rotation.z = Math.PI / 2;
          ctx.slotHead.add(pad);
        }
      }
    },
    starclip: {
      name: 'ほしクリップ', icon: '⭐', price: 10,
      build: function (ctx) {
        for (var i = 0; i < 3; i++) {
          var st = B.star(0.05 - i * 0.008, ctx.color, { unique: true, shiny: true });
          st.position.set(-0.13 - i * 0.06, P.headR * (0.72 - i * 0.14), 0.14 - i * 0.03);
          st.rotation.z = i * 0.4;
          ctx.slotHead.add(st);
        }
      }
    },
    bunnyears: {
      name: 'うさみみ', icon: '🐰', price: 18,
      build: function (ctx) {
        for (var s = -1; s <= 1; s += 2) {
          var ear = B.capsule(0.05, 0.24, ctx.color, { unique: true });
          ear.position.set(s * 0.11, P.headR * 1.3, -0.02);
          ear.rotation.z = s * 0.22;
          ctx.slotHead.add(ear);
          var inner = B.capsule(0.028, 0.18, 0xffc0d6, { unique: true });
          inner.position.set(s * 0.115, P.headR * 1.31, 0.02);
          inner.rotation.z = s * 0.22;
          ctx.slotHead.add(inner);
        }
      }
    },
    necklace: {
      name: 'ネックレス', icon: '💎', price: 26,
      build: function (ctx) {
        var chain = B.torus(0.13, 0.012, 0xf5c542, { unique: true, shiny: true });
        chain.position.set(0, P.torsoTop - P.torsoBot - 0.03, 0.02);
        chain.rotation.x = Math.PI / 2 - 0.25;
        ctx.slotTorso.add(chain);
        var gem = B.heart(0.075, ctx.color, { unique: true, shiny: true });
        gem.position.set(0, P.torsoTop - P.torsoBot - 0.12, P.torsoR * 0.98);
        ctx.slotTorso.add(gem);
      }
    }
  };

  /* ================= ぜんぶ まとめ ================= */

  var SLOTS = [
    { key: 'hair', label: 'かみがた', icon: '💇', items: HAIR, colorKey: 'hairColor', colors: HAIR_COLORS },
    { key: 'top', label: 'トップス', icon: '👕', items: TOP, colorKey: 'topColor', colors: COLORS, pattern: 'topPattern' },
    { key: 'bottom', label: 'ボトムス', icon: '👗', items: BOTTOM, colorKey: 'bottomColor', colors: COLORS, pattern: 'bottomPattern' },
    { key: 'shoes', label: 'くつ', icon: '👟', items: SHOES, colorKey: 'shoesColor', colors: COLORS },
    { key: 'acc', label: 'アクセ', icon: '🎀', items: ACC, colorKey: 'accColor', colors: COLORS },
    { key: 'eye', label: 'ひとみ', icon: '👀', items: null, colorKey: 'eye', colors: EYE_COLORS }
  ];

  function itemPrice(slotKey, id) {
    var m = { hair: HAIR, top: TOP, bottom: BOTTOM, shoes: SHOES, acc: ACC }[slotKey];
    if (!m || !m[id]) return 0;
    return m[id].price || 0;
  }

  function isFree(slotKey, id) {
    var m = { hair: HAIR, top: TOP, bottom: BOTTOM, shoes: SHOES, acc: ACC }[slotKey];
    return !m || !m[id] || !!m[id].free || !m[id].price;
  }

  // ランダムコーデ
  function randomOutfit(ownedOnly) {
    function keys(m, slot) {
      var ks = Object.keys(m);
      if (!ownedOnly) return ks;
      return ks.filter(function (k) { return isFree(slot, k) || SAVE.own(slot + ':' + k); });
    }
    return {
      hair: U.pick(keys(HAIR, 'hair')), hairColor: U.pick(Object.keys(HAIR_COLORS)),
      top: U.pick(keys(TOP, 'top')), topColor: U.pick(COLOR_KEYS), topPattern: U.pick(PATTERNS).id,
      bottom: U.pick(keys(BOTTOM, 'bottom')), bottomColor: U.pick(COLOR_KEYS), bottomPattern: U.pick(PATTERNS).id,
      shoes: U.pick(keys(SHOES, 'shoes')), shoesColor: U.pick(COLOR_KEYS),
      acc: U.pick(keys(ACC, 'acc')), accColor: U.pick(COLOR_KEYS),
      eye: U.pick(Object.keys(EYE_COLORS))
    };
  }

  return {
    P: P, COLORS: COLORS, COLOR_KEYS: COLOR_KEYS, HAIR_COLORS: HAIR_COLORS, EYE_COLORS: EYE_COLORS,
    PATTERNS: PATTERNS, HAIR: HAIR, TOP: TOP, BOTTOM: BOTTOM, SHOES: SHOES, ACC: ACC,
    SLOTS: SLOTS, bowMesh: bowMesh, itemPrice: itemPrice, isFree: isFree, randomOutfit: randomOutfit
  };
})();
