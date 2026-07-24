/* ============================================================
 * hub.js — きらきらタウン（まち）
 *   おみせを タップ すると ひまりちゃん が あるいて いく。
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- おでかけさき ---------- */

  var DESTS = [
    { id: 'dressup', name: 'おしゃれルーム', short: 'おしゃれ', icon: '👗', group: 'osha', tag: 'オシャレ', color: 0xffc0d6, roof: 0xff8fb1 },
    { id: 'runway', name: 'ランウェイ', short: 'ショー', icon: '🌟', group: 'osha', tag: 'オシャレ', color: 0xffe1b3, roof: 0xff9f6b },
    { id: 'salon', name: 'ヘアサロン', short: 'サロン', icon: '💇', group: 'shigo', tag: 'おしごと', color: 0xe3d3ff, roof: 0xa987f5 },
    { id: 'cake', name: 'ケーキやさん', short: 'ケーキ', icon: '🍰', group: 'shigo', tag: 'おしごと', color: 0xffe6c9, roof: 0xf0a06b },
    { id: 'flower', name: 'おはなやさん', short: 'おはな', icon: '💐', group: 'shigo', tag: 'おしごと', color: 0xd6f5d0, roof: 0x7ac97a },
    { id: 'icecream', name: 'アイスやさん', short: 'アイス', icon: '🍦', group: 'shigo', tag: 'おしごと', color: 0xd4f0ff, roof: 0x6fc4f0 },
    { id: 'vet', name: 'どうぶつびょういん', short: 'どうぶつ', icon: '🐶', group: 'shigo', tag: 'おしごと', color: 0xfff0d0, roof: 0xffc45c },
    { id: 'clean', name: 'おそうじ', short: 'そうじ', icon: '🧹', group: 'tetsu', tag: 'おてつだい', color: 0xd9f0f5, roof: 0x74c4d4 },
    { id: 'laundry', name: 'おせんたく', short: 'せんたく', icon: '🧺', group: 'tetsu', tag: 'おてつだい', color: 0xe8f0ff, roof: 0x8fa8e0 },
    { id: 'cooking', name: 'おりょうり', short: 'りょうり', icon: '🍳', group: 'tetsu', tag: 'おてつだい', color: 0xffe0e0, roof: 0xf58a8a },
    { id: 'room', name: 'おへやデコ', short: 'おへや', icon: '🛋️', group: 'etc', tag: 'おうち', color: 0xffeecc, roof: 0xd9a066 },
    { id: 'photo', name: 'しゃしんスタジオ', short: 'しゃしん', icon: '📷', group: 'etc', tag: 'おうち', color: 0xe6e0f5, roof: 0x9a8fc4 },
    { id: 'shop', name: 'きらきらショップ', short: 'ショップ', icon: '🛍️', group: 'etc', tag: 'おかいもの', color: 0xffd9ec, roof: 0xff6fa5 }
  ];

  window.DESTS = DESTS;

  /* ---------- じょうたい ---------- */

  var buildings = [];
  var walkTarget = null, walkAction = null, walkFacing = 0;
  var deco = { clouds: [], birds: [], balloons: [], flags: [], fountain: null, sparks: [] };
  var recommend = null;
  var petGroup = null;
  var panX = 0, panTarget = 0, dragStartX = 0, dragging = false, dragMoved = 0;

  /* ---------- おみせ を つくる ---------- */

  function makeShop(d, w, h) {
    w = w || 1.9; h = h || 1.5;
    var g = new THREE.Group();

    // かべ
    var wall = B.roundBox(w, h, 1.5, 0.12, d.color, { unique: true });
    wall.position.y = h / 2;
    g.add(wall);

    // やね
    var roof = B.cone(w * 0.86, 0.85, d.roof, { unique: true, seg: 4 });
    roof.position.y = h + 0.4;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    var ridge = B.sphere(0.11, 0xffffff, { seg: 10 });
    ridge.position.y = h + 0.86;
    g.add(ridge);

    // ドア
    var door = B.roundBox(0.55, 0.8, 0.1, 0.22, U.shade(d.roof, -0.15), { unique: true });
    door.position.set(0, 0.4, 0.76);
    g.add(door);
    var knob = B.sphere(0.045, 0xffd44d, { seg: 8, shiny: true });
    knob.position.set(0.18, 0.42, 0.83);
    g.add(knob);

    // まど
    for (var s = -1; s <= 1; s += 2) {
      var win = B.circle(0.17, 0xcfeeff, { unique: true, basic: true });
      win.position.set(s * (w * 0.33), 0.72, 0.77);
      g.add(win);
      var frame = B.torus(0.18, 0.026, 0xffffff, { unique: true });
      frame.position.set(s * (w * 0.33), 0.72, 0.77);
      g.add(frame);
    }

    // ひさし（しましま）
    var awn = B.cyl(0.2, 0.2, w * 0.92, 0xffffff, { unique: true, seg: 12 });
    awn.material = B.fabric(0xffffff, 'stripeH', U.shade(d.roof, 0.15), { repeat: 3 });
    awn.rotation.z = Math.PI / 2;
    awn.position.set(0, h * 0.72, 0.86);
    awn.scale.set(1, 1, 0.62);
    g.add(awn);

    // かんばん（えもじ ＋ なまえ）
    var plate = B.roundBox(w * 0.98, 0.46, 0.08, 0.14, 0xffffff, { unique: true });
    plate.position.set(0, h + 0.12, 0.78);
    g.add(plate);
    var em = B.emojiPlate(d.icon, 0.36);
    em.position.set(-w * 0.32, h + 0.12, 0.84);
    g.add(em);
    var nameP = B.textPlate(d.short, w * 0.6, { color: '#ff6fa5', stroke: '#ffffff', size: 80, w: 512, h: 128 });
    nameP.position.set(w * 0.11, h + 0.12, 0.84);
    g.add(nameP);

    // おはな の プランター
    for (var f = -1; f <= 1; f += 2) {
      var pl = B.box(0.34, 0.16, 0.16, 0xd98a6a);
      pl.position.set(f * (w * 0.42), 0.09, 0.86);
      g.add(pl);
      for (var q = 0; q < 2; q++) {
        var fl = B.flower([0xff9dbf, 0xffd95c, 0xc09dff, 0xffffff][(q + (f > 0 ? 1 : 0)) % 4]);
        fl.scale.setScalar(0.55);
        fl.position.set(f * (w * 0.42) + (q - 0.5) * 0.14, 0.16, 0.88);
        g.add(fl);
      }
    }

    g.userData.dest = d;
    return g;
  }

  /* ---------- ふんすい ---------- */

  function makeFountain() {
    var g = new THREE.Group();
    var base = B.cyl(1.05, 1.15, 0.28, 0xe8e0f0, { seg: 24 });
    base.position.y = 0.14;
    g.add(base);
    var water = B.cyl(0.94, 0.94, 0.08, 0x8fd4ff, { unique: true, seg: 24, opacity: 0.85 });
    water.position.y = 0.28;
    g.add(water);
    var pillar = B.cyl(0.13, 0.17, 0.5, 0xf0e8f8, { seg: 14 });
    pillar.position.y = 0.5;
    g.add(pillar);
    var top = B.cyl(0.36, 0.3, 0.1, 0xe8e0f0, { seg: 16 });
    top.position.y = 0.78;
    g.add(top);
    var heart = B.heart(0.24, 0xff8fb1, { unique: true, shiny: true });
    heart.position.y = 1.02;
    g.add(heart);
    g.userData.heart = heart;
    g.userData.water = water;
    return g;
  }

  /* ---------- けんちく ---------- */

  function build(root) {
    buildings = [];
    deco = { clouds: [], birds: [], balloons: [], flags: [], fountain: null, sparks: [] };
    panX = 0; panTarget = 0;

    GAME.setSky(0x7cc8ff, 0xdff3ff);
    GAME.lights.hemi.intensity = 0.46;
    GAME.lights.dir.intensity = 0.58;
    GAME.lights.dir.position.set(4, 8, 6);

    // じめん（しばふ）
    var grass = B.ground(60, 0x9fdc8c, { pattern: 'plain' });
    root.add(grass);

    // ひろば（まるい タイル）
    var plaza = B.circle(4.6, 0xffdcc0, { unique: true });
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.02, -0.6);
    root.add(plaza);
    var plazaRing = B.torus(4.6, 0.12, 0xffffff, { unique: true });
    plazaRing.rotation.x = Math.PI / 2;
    plazaRing.position.set(0, 0.03, -0.6);
    root.add(plazaRing);
    var inner = B.circle(2.0, 0xffeedc, { unique: true });
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(0, 0.03, -0.6);
    root.add(inner);

    // うしろの おか（にだんめ の おみせ が のる）
    var hill = B.roundBox(26, 1.1, 7, 0.5, 0x8fd47c, { unique: true });
    hill.position.set(0, 0.55, -8.4);
    root.add(hill);
    var hillEdge = B.box(26, 0.18, 0.4, 0x7ac46a);
    hillEdge.position.set(0, 1.05, -4.95);
    root.add(hillEdge);

    // ふんすい
    var fountain = makeFountain();
    fountain.position.set(-0.2, 0, -0.9);
    root.add(fountain);
    deco.fountain = fountain;
    GAME.addTap(fountain, function () {
      SND.play('splash');
      var fp = new THREE.Vector3(-0.2, 1.3, -0.9);
      FX.burst('water', fp, 18, { up: 2.6, spread: 0.9, gravity: -5 });
      FX.burst('sparkle', fp, 8);
      UI.toast('ふんすい きらきら✨');
      GAME.char.setExpr('happy');
      U.after(1.2, function () { GAME.char.setExpr('normal'); });
    });

    // おみせ を ならべる（てまえ 7けん / おくの おか 6けん）
    var front = DESTS.slice(0, 7);
    var back = DESTS.slice(7);

    front.forEach(function (d, i) {
      var x = (i - (front.length - 1) / 2) * 2.02;
      var b = makeShop(d, 1.78, 1.5);
      b.position.set(x, 0, -3.4 - Math.abs(x) * 0.1);
      b.rotation.y = -x * 0.052;
      root.add(b);
      buildings.push(b);
    });

    back.forEach(function (d, i) {
      var x = (i - (back.length - 1) / 2) * 2.28;
      var b = makeShop(d, 1.7, 1.4);
      b.position.set(x, 1.1, -6.9 - Math.abs(x) * 0.08);
      b.rotation.y = -x * 0.045;
      b.scale.setScalar(0.96);
      root.add(b);
      buildings.push(b);
    });

    buildings.forEach(function (b) {
      GAME.addTap(b, function () { goTo(b); });
    });

    // き と おはな
    var spots = [
      [-8.4, -2.2], [8.4, -2.2], [-9.6, -5.6], [9.6, -5.6], [-7.4, 1.4], [7.4, 1.4],
      [-11, -9], [11, -9], [-5.2, -9.6], [5.2, -9.6], [0, -10.4], [-13, -3], [13, -3]
    ];
    spots.forEach(function (p, i) {
      var tr = B.tree(U.rand(1.0, 1.6), [0x7ed07a, 0x6fc46f, 0x93dc8c][i % 3]);
      tr.position.set(p[0], p[1] < -5 ? 1.1 : 0, p[1]);
      root.add(tr);
    });
    for (var f = 0; f < 40; f++) {
      var fa = U.rand(0, U.TAU), fr = U.rand(6.2, 13);
      var fx = Math.cos(fa) * fr, fz = Math.sin(fa) * fr - 1.5;
      if (fz > 4.6) continue;
      var fl = B.flower(U.pick([0xff9dbf, 0xffd95c, 0xc09dff, 0xffffff, 0xff8080]));
      fl.position.set(fx, fz < -5 ? 1.1 : 0, fz);
      fl.scale.setScalar(U.rand(0.7, 1.2));
      root.add(fl);
    }

    // ベンチ
    for (var bs = -1; bs <= 1; bs += 2) {
      var bench = new THREE.Group();
      var seat = B.box(1.1, 0.09, 0.4, 0xd9a066);
      seat.position.y = 0.4; bench.add(seat);
      var backR = B.box(1.1, 0.36, 0.08, 0xd9a066);
      backR.position.set(0, 0.6, -0.16); bench.add(backR);
      for (var lg = -1; lg <= 1; lg += 2) {
        var leg = B.box(0.09, 0.4, 0.36, 0xb07c4a);
        leg.position.set(lg * 0.45, 0.2, 0); bench.add(leg);
      }
      bench.position.set(bs * 5.4, 0, -0.2);
      bench.rotation.y = -bs * 0.9;
      root.add(bench);
    }

    // がいとう
    for (var lp = -1; lp <= 1; lp += 2) {
      var post = new THREE.Group();
      var pole = B.cyl(0.05, 0.06, 2.2, 0xf0e0f0);
      pole.position.y = 1.1; post.add(pole);
      var lamp = B.sphere(0.18, 0xfff2b8, { seg: 12, emissive: 0x554400 });
      lamp.position.y = 2.28; post.add(lamp);
      var cap = B.cone(0.22, 0.2, 0xff8fb1, { seg: 10 });
      cap.position.y = 2.5; post.add(cap);
      post.position.set(lp * 6.0, 0, -0.6);
      root.add(post);
    }

    // ふうせん アーチ（がめん の わくどり）
    var arch = PROPS.balloonArch(15, 6.4);
    arch.position.set(0, 0.4, 4.6);
    root.add(arch);
    GAME.addTap(arch, function (o, p) {
      SND.play('pop');
      FX.burst('confetti', p, 16, { up: 2.4 });
      UI.toast('ふうせん ぽん！');
    });

    // くも
    for (var c = 0; c < 8; c++) {
      var cl = B.cloud(U.rand(0.8, 1.6));
      cl.position.set(U.rand(-16, 16), U.rand(5.5, 9), U.rand(-16, -3));
      root.add(cl);
      deco.clouds.push({ obj: cl, sp: U.rand(0.15, 0.45) });
    }

    // ことり
    for (var bd = 0; bd < 3; bd++) {
      var bird = B.emojiSprite('🕊️', 0.5);
      bird.position.set(U.rand(-8, 8), U.rand(4, 6.5), U.rand(-10, -3));
      root.add(bird);
      deco.birds.push({ obj: bird, sp: U.rand(0.5, 1.1), ph: U.rand(0, 6) });
    }

    // にじ（そらに かかる アーチ）
    var rainbow = new THREE.Group();
    var rcols = [0xff8fb1, 0xffc36b, 0xffe97a, 0x9ee493, 0x8fd4ff, 0xc9a7ff];
    for (var rb = 0; rb < 6; rb++) {
      var band = B.torus(9.4 + rb * 0.42, 0.21, rcols[rb], { unique: true, opacity: 0.5 });
      band.material.transparent = true;
      band.material.depthWrite = false;
      rainbow.add(band);
    }
    rainbow.position.set(2.5, -1.6, -22);
    root.add(rainbow);

    // ひまりちゃん を ひろば に
    GAME.char.group.position.set(2.75, 0, -0.35);
    GAME.char.group.rotation.y = -0.62;
    GAME.char.setPose('idle');
    GAME.pet.group.visible = true;
    GAME.pet.group.position.set(1.7, 0, 0.35);
    GAME.pet.follow = GAME.char.group.position;

    // きょうの おすすめ
    recommend = U.pick(DESTS.filter(function (d) { return d.id !== 'shop'; }));
    var recB = buildings.filter(function (b) { return b.userData.dest.id === recommend.id; })[0];
    if (recB) {
      var star = B.star(0.34, 0xffd44d, { unique: true, shiny: true });
      star.position.set(0, 2.9, 0.4);
      recB.add(star);
      deco.sparks.push(star);
    }
  }

  /* ---------- あるいて いく ---------- */

  function goTo(b) {
    if (walkTarget) return;
    var d = b.userData.dest;
    SND.play('tap');
    SND.say(d.name);
    UI.setTask(d.name + ' に いくよ！', d.icon);
    walkTarget = new THREE.Vector3(
      U.clamp(b.position.x * 0.86, -6, 6), 0,
      Math.max(b.position.z + 1.9, -4.2)
    );
    walkFacing = Math.atan2(b.position.x - walkTarget.x, b.position.z - walkTarget.z);
    walkAction = function () {
      GAME.char.play('jump');
      FX.burst('sparkle', GAME.char.headPos(), 10);
      U.after(0.45, function () {
        if (d.id === 'shop') {
          UI.openShop();
          walkTarget = null;
          UI.setTask('すきな ばしょを タッチ してね', '🗺️');
        } else {
          GAME.go(d.id, { fromHub: true, bonus: recommend && recommend.id === d.id });
        }
      });
    };
  }

  function walkToPoint(p) {
    if (walkTarget) return;
    walkTarget = new THREE.Vector3(U.clamp(p.x, -6, 6), 0, U.clamp(p.z, -4.2, 3.2));
    walkFacing = null;
    walkAction = null;
  }

  /* ---------- シーン ていぎ ---------- */

  GAME.register('hub', {
    name: 'きらきらタウン', icon: '🏘️', bgm: 'town',

    build: function (root) {
      build(root);
    },

    enter: function (opts) {
      GAME.setView({ target: [0, 1.5, -2.8], dist: 11.6, height: 5.8, fov: 44 }, true);
      UI.setTask('すきな ばしょを タッチ してね', '🗺️');
      var pick = function (id) {
        var b = buildings.filter(function (x) { return x.userData.dest.id === id; })[0];
        if (b) goTo(b);
      };
      UI.setRow(0, DESTS.slice(0, 7).map(function (d) {
        return { id: d.id, icon: d.icon, label: d.short };
      }), pick);
      UI.setRow(1, DESTS.slice(7).map(function (d) {
        return { id: d.id, icon: d.icon, label: d.short };
      }), pick);

      if (SAVE.firstTime('welcome')) {
        U.after(0.8, function () {
          UI.banner('ようこそ！ ひまり だよ💖');
          GAME.char.play('wave');
          GAME.char.setExpr('happy');
          GAME.giveSticker('x1');
        });
      } else if (recommend) {
        U.after(0.9, function () {
          UI.toast('きょうの おすすめ：' + recommend.name + ' ' + recommend.icon);
        });
      }

      GAME.setHint(function () {
        var b = buildings.filter(function (x) { return x.userData.dest.id === (recommend ? recommend.id : 'dressup'); })[0];
        if (b) GAME.hintObject(b);
      });
    },

    exit: function () {
      walkTarget = null; walkAction = null;
      GAME.pet.follow = null;
    },

    onDown: function (x, y) {
      dragging = true; dragStartX = x; dragMoved = 0;
      return false;
    },

    onMove: function (x, y, down) {
      if (!down || !dragging) return;
      var dx = x - dragStartX;
      dragMoved += Math.abs(dx);
      panTarget = U.clamp(panX - dx * 0.0016, -0.42, 0.42);
      dragStartX = x;
      panX = panTarget;
    },

    onUp: function () { dragging = false; },

    onMiss: function (x, y) {
      if (dragMoved > 26) return;
      var p = GAME.rayY(x, y, 0);
      if (p && p.length() < 6.5) {
        walkToPoint(p);
        SND.play('step');
      }
    },

    update: function (dt, t) {
      // カメラ の よこ ふり
      GAME.setView({ yaw: U.damp(0, 0, 1, dt) + panX });

      // あるく
      if (walkTarget) {
        var pos = GAME.char.group.position;
        var d = walkTarget.clone().sub(pos); d.y = 0;
        var dist = d.length();
        if (dist > 0.12) {
          d.normalize();
          var sp = Math.min(2.9, 1.3 + dist * 0.9);
          pos.x += d.x * sp * dt;
          pos.z += d.z * sp * dt;
          GAME.char.walkSpeed = sp / 2.6;
          var ang = Math.atan2(d.x, d.z);
          GAME.char.group.rotation.y = U.damp(GAME.char.group.rotation.y, ang, 9, dt);
          if (Math.random() < dt * 7) SND.play('step');
        } else {
          GAME.char.walkSpeed = 0;
          if (walkFacing != null) GAME.char.group.rotation.y = U.damp(GAME.char.group.rotation.y, walkFacing, 8, dt);
          var act = walkAction;
          walkTarget = null; walkAction = null;
          if (act) act();
        }
      } else {
        GAME.char.walkSpeed = U.damp(GAME.char.walkSpeed, 0, 8, dt);
      }

      // ふんすい
      if (deco.fountain) {
        deco.fountain.userData.heart.rotation.y += dt * 1.2;
        deco.fountain.userData.heart.position.y = 1.02 + Math.sin(t * 2) * 0.05;
        if (Math.random() < dt * 3.5) {
          FX.burst('water', new THREE.Vector3(0, 1.15, -1.1), 2, { up: 1.6, spread: 0.35, gravity: -4.2, size: 0.12, life: 0.9 });
        }
      }

      // くも
      for (var i = 0; i < deco.clouds.length; i++) {
        var c = deco.clouds[i];
        c.obj.position.x += c.sp * dt;
        if (c.obj.position.x > 18) c.obj.position.x = -18;
      }
      // ことり
      for (var b = 0; b < deco.birds.length; b++) {
        var bd = deco.birds[b];
        bd.obj.position.x += bd.sp * dt;
        bd.obj.position.y += Math.sin(t * 2 + bd.ph) * dt * 0.5;
        if (bd.obj.position.x > 12) bd.obj.position.x = -12;
      }
      // おすすめ の ほし
      for (var s = 0; s < deco.sparks.length; s++) {
        deco.sparks[s].rotation.y += dt * 2;
        deco.sparks[s].position.y = 2.9 + Math.sin(t * 3) * 0.14;
        if (Math.random() < dt * 2.5) {
          var wp = deco.sparks[s].getWorldPosition(new THREE.Vector3());
          FX.burst('gold', wp, 2, { up: 0.9, spread: 0.5, gravity: -1.2, size: 0.14, life: 0.9 });
        }
      }
      // はなびら
      if (Math.random() < dt * 1.6) {
        FX.rain('petal', { x: 0, y: 7, z: -3, w: 22, d: 12, h: 1 }, 2, { size: 0.22, life: 7, gravity: -0.06, float: 1.4 });
      }
    }
  });
})();
