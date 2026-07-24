/* ============================================================
 * fx.js — キラキラ エフェクト（パーティクル / リング / ふわふわ もじ）
 * ============================================================ */
var FX = (function () {
  'use strict';

  var scene = null;
  var pool = [];
  var live = [];
  var rings = [];
  var MAX = 260;
  var texs = {};

  /* ---------- テクスチャ ---------- */

  function shapeTex(name) {
    if (texs[name]) return texs[name];
    var s = 64;
    var c = document.createElement('canvas'); c.width = c.height = s;
    var g = c.getContext('2d');
    g.fillStyle = '#fff'; g.strokeStyle = '#fff';

    if (name === 'dot') {
      var grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
    } else if (name === 'square') {
      g.fillRect(s * 0.18, s * 0.3, s * 0.64, s * 0.4);
    } else if (name === 'star') {
      g.beginPath();
      for (var i = 0; i < 10; i++) {
        var r = i % 2 ? s * 0.19 : s * 0.46;
        var a = i / 10 * Math.PI * 2 - Math.PI / 2;
        var x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.fill();
    } else if (name === 'heart') {
      var cx = s / 2, cy = s * 0.55, r = s * 0.34;
      g.beginPath();
      g.moveTo(cx, cy + r * 0.75);
      g.bezierCurveTo(cx + r * 1.25, cy - r * 0.35, cx + r * 0.6, cy - r * 1.15, cx, cy - r * 0.4);
      g.bezierCurveTo(cx - r * 0.6, cy - r * 1.15, cx - r * 1.25, cy - r * 0.35, cx, cy + r * 0.75);
      g.fill();
    } else if (name === 'sparkle') {
      g.beginPath();
      var R = s * 0.46, r2 = s * 0.07;
      g.moveTo(s / 2, s / 2 - R);
      g.quadraticCurveTo(s / 2 + r2, s / 2 - r2, s / 2 + R, s / 2);
      g.quadraticCurveTo(s / 2 + r2, s / 2 + r2, s / 2, s / 2 + R);
      g.quadraticCurveTo(s / 2 - r2, s / 2 + r2, s / 2 - R, s / 2);
      g.quadraticCurveTo(s / 2 - r2, s / 2 - r2, s / 2, s / 2 - R);
      g.fill();
    } else if (name === 'petal') {
      g.beginPath();
      g.moveTo(s / 2, s * 0.1);
      g.bezierCurveTo(s * 0.92, s * 0.35, s * 0.82, s * 0.86, s / 2, s * 0.92);
      g.bezierCurveTo(s * 0.18, s * 0.86, s * 0.08, s * 0.35, s / 2, s * 0.1);
      g.fill();
    } else if (name === 'note') {
      g.beginPath(); g.ellipse(s * 0.36, s * 0.72, s * 0.16, s * 0.12, -0.4, 0, 6.3); g.fill();
      g.fillRect(s * 0.49, s * 0.16, s * 0.06, s * 0.58);
      g.beginPath(); g.moveTo(s * 0.55, s * 0.16); g.quadraticCurveTo(s * 0.86, s * 0.24, s * 0.72, s * 0.44);
      g.quadraticCurveTo(s * 0.78, s * 0.24, s * 0.55, s * 0.28); g.fill();
    } else if (name === 'bubble') {
      g.lineWidth = s * 0.07;
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, 6.3); g.stroke();
      g.globalAlpha = 0.25; g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, 6.3); g.fill();
      g.globalAlpha = 0.9; g.beginPath(); g.arc(s * 0.36, s * 0.34, s * 0.09, 0, 6.3); g.fill();
    } else if (name === 'ring') {
      g.lineWidth = s * 0.1;
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, 6.3); g.stroke();
    } else {
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, 6.3); g.fill();
    }
    var t = new THREE.CanvasTexture(c);
    texs[name] = t;
    return t;
  }

  /* ---------- パレット ---------- */

  var PALETTE = {
    confetti: [0xff6fa5, 0xffd44d, 0x7fd8ff, 0x9ee493, 0xc9a7ff, 0xffa96b, 0xffffff],
    rainbow: [0xff8fb1, 0xffc36b, 0xffe97a, 0x9ee493, 0x8fd4ff, 0xc9a7ff],
    gold: [0xffd44d, 0xffe98a, 0xffc36b, 0xfff6c8],
    pink: [0xff9dbf, 0xffc0d6, 0xff6fa5, 0xffe3ee],
    heart: [0xff6fa5, 0xff96b8, 0xff4f88, 0xffc0d6],
    bubble: [0xbfe9ff, 0xe6f7ff, 0xffffff, 0x8fd4ff],
    petal: [0xffc0d6, 0xffe0ec, 0xff9dbf, 0xfff0f5],
    green: [0x9ee493, 0x7ed07a, 0xc8f0b8],
    water: [0x8fd4ff, 0xbfe9ff, 0xffffff],
    star: [0xffd44d, 0xfff2a8, 0xffffff],
    note: [0xff9dbf, 0xc9a7ff, 0x8fd4ff, 0xffd44d],
    dust: [0xd9c7b0, 0xc4b49e, 0xefe4d6],
    white: [0xffffff]
  };

  /* ---------- しょきか ---------- */

  function init(sc) {
    scene = sc;
    for (var i = 0; i < MAX; i++) {
      var m = new THREE.SpriteMaterial({ map: shapeTex('dot'), transparent: true, depthWrite: false });
      var sp = new THREE.Sprite(m);
      sp.visible = false;
      sp.renderOrder = 900;
      scene.add(sp);
      pool.push(sp);
    }
  }

  function grab() {
    for (var i = 0; i < pool.length; i++) {
      if (!pool[i].visible) return pool[i];
    }
    // ぜんぶ つかってたら いちばん ふるいのを つかいまわす
    var p = live.shift();
    return p ? p.sp : null;
  }

  /* ---------- はっしゃ ---------- */

  /**
   * FX.burst(kind, position, count, opts)
   *   kind: 'confetti'|'star'|'heart'|'sparkle'|'bubble'|'petal'|'note'|'water'|'dust'|'gold'|'rainbow'
   */
  function burst(kind, pos, count, opts) {
    if (!scene) return;
    opts = opts || {};
    count = count || 14;
    var shape = opts.shape || ({
      confetti: 'square', star: 'star', heart: 'heart', sparkle: 'sparkle',
      bubble: 'bubble', petal: 'petal', note: 'note', water: 'dot',
      dust: 'dot', gold: 'star', rainbow: 'square', pink: 'heart', green: 'dot', white: 'dot'
    }[kind] || 'dot');
    var cols = PALETTE[kind] || PALETTE.confetti;
    var spread = opts.spread != null ? opts.spread : 1.6;
    var up = opts.up != null ? opts.up : 2.4;
    var grav = opts.gravity != null ? opts.gravity : -4.2;
    var size = opts.size || 0.19;
    var lifeBase = opts.life || 1.3;

    for (var i = 0; i < count; i++) {
      var sp = grab();
      if (!sp) break;
      sp.visible = true;
      sp.material.map = shapeTex(shape);
      sp.material.color.setHex(opts.color != null ? opts.color : U.pick(cols));
      sp.material.opacity = 1;
      sp.material.needsUpdate = true;
      var s = size * U.rand(0.65, 1.35);
      sp.scale.set(s, s, 1);
      sp.position.set(
        pos.x + U.rand(-0.1, 0.1),
        pos.y + U.rand(-0.06, 0.06),
        pos.z + U.rand(-0.1, 0.1)
      );
      var ang = U.rand(0, U.TAU);
      var sp2 = U.rand(0.25, 1) * spread;
      live.push({
        sp: sp,
        vx: Math.cos(ang) * sp2,
        vy: U.rand(0.55, 1.35) * up,
        vz: Math.sin(ang) * sp2,
        g: grav,
        life: lifeBase * U.rand(0.75, 1.3),
        t: 0,
        spin: U.rand(-9, 9),
        size: s,
        float: opts.float || 0,
        drag: opts.drag != null ? opts.drag : 0.99
      });
    }
  }

  // うえから ふらせる（はなびら / ゆき / コンフェッティ の あめ）
  function rain(kind, box, count, opts) {
    if (!scene) return;
    opts = opts || {};
    count = count || 10;
    var shape = opts.shape || ({ petal: 'petal', confetti: 'square', star: 'star', heart: 'heart', bubble: 'bubble' }[kind] || 'dot');
    var cols = PALETTE[kind] || PALETTE.confetti;
    for (var i = 0; i < count; i++) {
      var sp = grab();
      if (!sp) break;
      sp.visible = true;
      sp.material.map = shapeTex(shape);
      sp.material.color.setHex(U.pick(cols));
      sp.material.opacity = 1;
      sp.material.needsUpdate = true;
      var s = (opts.size || 0.2) * U.rand(0.7, 1.3);
      sp.scale.set(s, s, 1);
      sp.position.set(
        box.x + U.rand(-box.w / 2, box.w / 2),
        box.y + U.rand(0, box.h || 1),
        box.z + U.rand(-box.d / 2, box.d / 2)
      );
      live.push({
        sp: sp, vx: U.rand(-0.3, 0.3), vy: -U.rand(0.4, 1.0), vz: U.rand(-0.3, 0.3),
        g: opts.gravity != null ? opts.gravity : -0.25,
        life: opts.life || 3.2, t: 0, spin: U.rand(-3, 3), size: s,
        float: opts.float != null ? opts.float : 1.6, drag: 1
      });
    }
  }

  // ひろがる リング
  function ring(pos, color, opts) {
    if (!scene) return;
    opts = opts || {};
    var m = new THREE.MeshBasicMaterial({
      map: shapeTex('ring'), color: color != null ? color : 0xffffff,
      transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.position.copy(pos);
    if (opts.flat !== false) mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 890;
    scene.add(mesh);
    rings.push({ mesh: mesh, t: 0, life: opts.life || 0.7, from: opts.from || 0.2, to: opts.to || 2.4 });
  }

  // ふわっと うかぶ もじ／えもじ（3D じょう）
  function popText(pos, text, opts) {
    if (!scene) return;
    opts = opts || {};
    var isEmoji = opts.emoji !== false && !/[ぁ-んァ-ンa-zA-Z0-9]/.test(text);
    var t = isEmoji ? B.emojiTex(text, 128) : B.textTex(text, {
      color: opts.color || '#ff6fa5', stroke: '#ffffff', w: 256, h: 128, size: 64
    });
    var m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: opts.depthTest !== false });
    var sp = new THREE.Sprite(m);
    var sc = opts.scale || 0.6;
    sp.scale.set(isEmoji ? sc : sc * 2, sc, 1);
    sp.position.copy(pos);
    sp.renderOrder = 950;
    scene.add(sp);
    var baseY = pos.y;
    var life = opts.life || 1.2;
    U.tween({
      from: 0, to: 1, dur: life, ease: 'outCubic',
      onUpdate: function (v) {
        sp.position.y = baseY + v * (opts.rise || 0.8);
        var k = v < 0.22 ? U.ease.outBack(v / 0.22) : 1;
        sp.scale.set((isEmoji ? sc : sc * 2) * k, sc * k, 1);
        m.opacity = v > 0.65 ? 1 - (v - 0.65) / 0.35 : 1;
      },
      onDone: function () { scene.remove(sp); m.dispose(); }
    });
    return sp;
  }

  /* ---------- こうしん ---------- */

  function update(dt) {
    for (var i = live.length - 1; i >= 0; i--) {
      var p = live[i];
      p.t += dt;
      if (p.t >= p.life) {
        p.sp.visible = false;
        live.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.vx *= p.drag; p.vz *= p.drag;
      p.sp.position.x += p.vx * dt + (p.float ? Math.sin(p.t * 3 + p.sp.id) * p.float * dt * 0.4 : 0);
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      p.sp.material.rotation += p.spin * dt;
      var k = p.t / p.life;
      p.sp.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      var pulse = 1 + Math.sin(p.t * 12) * 0.06;
      p.sp.scale.set(p.size * pulse, p.size * pulse, 1);
    }

    for (var r = rings.length - 1; r >= 0; r--) {
      var R = rings[r];
      R.t += dt;
      var k2 = R.t / R.life;
      if (k2 >= 1) {
        scene.remove(R.mesh);
        R.mesh.material.dispose();
        R.mesh.geometry.dispose();
        rings.splice(r, 1);
        continue;
      }
      var s = U.lerp(R.from, R.to, U.ease.outCubic(k2));
      R.mesh.scale.set(s, s, 1);
      R.mesh.material.opacity = 0.9 * (1 - k2);
    }
  }

  function clear() {
    for (var i = 0; i < live.length; i++) live[i].sp.visible = false;
    live.length = 0;
    for (var r = 0; r < rings.length; r++) {
      scene.remove(rings[r].mesh);
      rings[r].mesh.material.dispose();
      rings[r].mesh.geometry.dispose();
    }
    rings.length = 0;
  }

  /* ---------- おいわい セット ---------- */

  function celebrate(pos) {
    burst('confetti', pos, 26, { up: 3.2, spread: 2.4 });
    burst('star', pos, 12, { up: 2.6, spread: 1.6, size: 0.26 });
    burst('rainbow', pos, 16, { up: 2.8, spread: 2.0 });
    ring(pos, 0xffd44d, { to: 3.2, life: 0.8 });
    U.after(0.18, function () { burst('heart', pos, 10, { up: 2.2, spread: 1.4, size: 0.24 }); });
  }

  function sparkleAt(pos, n) {
    burst('sparkle', pos, n || 8, { up: 1.1, spread: 0.8, gravity: -1.2, size: 0.17, life: 0.8 });
  }

  return {
    init: init, burst: burst, rain: rain, ring: ring, popText: popText,
    update: update, clear: clear, celebrate: celebrate, sparkleAt: sparkleAt,
    PALETTE: PALETTE, texs: shapeTex
  };
})();
