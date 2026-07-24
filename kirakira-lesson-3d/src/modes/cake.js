/* ============================================================
 * cake.js — ケーキやさん（おしごと）
 *   ちゅうもん の みほん を みながら、おなじ ケーキ を つくろう！
 * ============================================================ */
(function () {
  'use strict';

  var SPONGE = [
    { id: 'plain', name: 'バニラ', icon: '🟡', hex: 0xffe9b8 },
    { id: 'choco', name: 'チョコ', icon: '🟤', hex: 0x9c6b45 },
    { id: 'straw', name: 'いちご', icon: '🩷', hex: 0xffc0d6 },
    { id: 'matcha', name: 'まっちゃ', icon: '🟢', hex: 0xbfe08a }
  ];

  var CREAM = [
    { id: 'white', name: 'ホイップ', icon: '🤍', hex: 0xfffcf5 },
    { id: 'pink', name: 'ピンク', icon: '💗', hex: 0xffb3cd },
    { id: 'blue', name: 'ブルー', icon: '💙', hex: 0xa8dcff },
    { id: 'yellow', name: 'レモン', icon: '💛', hex: 0xffe27a }
  ];

  var TOPPINGS = [
    {
      id: 'straw', name: 'いちご', icon: '🍓', build: function () {
        var g = new THREE.Group();
        var b = B.cone(0.055, 0.11, 0xf04a5c, { unique: true, seg: 10 });
        b.rotation.x = Math.PI; b.position.y = 0.055;
        g.add(b);
        var lf = B.sphere(0.03, 0x6fbf5f, { seg: 8, unique: true });
        lf.scale.set(1.6, 0.4, 1.6); lf.position.y = 0.11;
        g.add(lf);
        return g;
      }
    },
    {
      id: 'cherry', name: 'さくらんぼ', icon: '🍒', build: function () {
        var g = new THREE.Group();
        var b = B.sphere(0.05, 0xd83a4a, { seg: 12, unique: true });
        b.position.y = 0.05; g.add(b);
        var st = B.cyl(0.008, 0.008, 0.09, 0x6fbf5f, { seg: 6 });
        st.position.y = 0.13; st.rotation.z = 0.3; g.add(st);
        return g;
      }
    },
    {
      id: 'blue', name: 'ブルーベリー', icon: '🫐', build: function () {
        var g = new THREE.Group();
        for (var i = 0; i < 3; i++) {
          var b = B.sphere(0.032, 0x6a5fc4, { seg: 10, unique: true });
          b.position.set(Math.cos(i * 2.1) * 0.035, 0.032, Math.sin(i * 2.1) * 0.035);
          g.add(b);
        }
        return g;
      }
    },
    {
      id: 'star', name: 'ほし', icon: '⭐', build: function () {
        var s = B.star(0.06, 0xffd44d, { unique: true, shiny: true });
        s.position.y = 0.05; s.rotation.x = -0.3;
        return B.group(s);
      }
    },
    {
      id: 'heart', name: 'ハート', icon: '💗', build: function () {
        var h = B.heart(0.075, 0xff6fa5, { unique: true, shiny: true });
        h.position.y = 0.055; h.rotation.x = -0.3;
        return B.group(h);
      }
    },
    {
      id: 'choco', name: 'チョコ', icon: '🍫', build: function () {
        var g = new THREE.Group();
        var b = B.box(0.09, 0.03, 0.07, 0x6b4226);
        b.position.y = 0.03; b.rotation.z = 0.2; g.add(b);
        return g;
      }
    },
    {
      id: 'orange', name: 'オレンジ', icon: '🍊', build: function () {
        var g = new THREE.Group();
        var b = B.sphere(0.05, 0xffa93a, { seg: 12, unique: true });
        b.scale.y = 0.55; b.position.y = 0.03; g.add(b);
        return g;
      }
    },
    {
      id: 'candy', name: 'あめ', icon: '🍬', build: function () {
        var g = new THREE.Group();
        var b = B.sphere(0.045, 0xc09dff, { seg: 10, unique: true });
        b.position.y = 0.045; g.add(b);
        for (var s = -1; s <= 1; s += 2) {
          var w = B.cone(0.03, 0.05, 0xd9c8ff, { unique: true, seg: 6 });
          w.position.set(s * 0.055, 0.045, 0);
          w.rotation.z = s * Math.PI / 2;
          g.add(w);
        }
        return g;
      }
    }
  ];

  var order = null, cakeGroup = null, sampleGroup = null;
  var built = { sponge: null, cream: null, toppings: [] };
  var step = 0, mistakes = 0, spin = 0;
  var customer = null, turntable = null;

  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }

  /* ---------- ケーキ を つくる ---------- */

  function makeCake(spec, opts) {
    opts = opts || {};
    var g = new THREE.Group();
    if (spec.sponge) {
      var sp = byId(SPONGE, spec.sponge);
      for (var i = 0; i < 2; i++) {
        var layer = B.cyl(0.38, 0.4, 0.14, sp.hex, { unique: true, seg: 26 });
        layer.position.y = 0.07 + i * 0.19;
        g.add(layer);
        if (i === 0) {
          var jam = B.cyl(0.385, 0.385, 0.05, 0xff8fa8, { unique: true, seg: 26 });
          jam.position.y = 0.16;
          g.add(jam);
        }
      }
    }
    if (spec.cream) {
      var cr = byId(CREAM, spec.cream);
      var top = B.cyl(0.4, 0.4, 0.06, cr.hex, { unique: true, seg: 26 });
      top.position.y = 0.36;
      g.add(top);
      var ring = PROPS.creamRing(0.4, cr.hex, 12);
      ring.position.y = 0.4;
      g.add(ring);
      var side = B.cyl(0.405, 0.405, 0.32, cr.hex, { unique: true, seg: 26, opacity: 0.98 });
      side.position.y = 0.17;
      side.material.transparent = false;
      g.add(side);
    }
    if (spec.toppings) {
      for (var t = 0; t < spec.toppings.length; t++) {
        var def = byId(TOPPINGS, spec.toppings[t]);
        var m = def.build();
        var a = (t / Math.max(1, spec.toppings.length)) * Math.PI * 2 + 0.4;
        var r = spec.toppings.length === 1 ? 0 : 0.19;
        m.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r);
        g.add(m);
      }
    }
    if (opts.ghost) {
      g.traverse(function (o) {
        if (o.material) {
          o.material = o.material.clone();
          o.material.__unique = true;
          o.material.transparent = true;
          o.material.opacity = 0.55;
        }
      });
    }
    return g;
  }

  function rebuild() {
    if (cakeGroup) { GAME.disposeNode(cakeGroup); turntable.remove(cakeGroup); }
    cakeGroup = makeCake(built);
    turntable.add(cakeGroup);
    cakeGroup.scale.setScalar(0.01);
    U.tween({
      from: 0.01, to: 1, dur: 0.4, ease: 'outBack',
      onUpdate: function (v) { if (cakeGroup) cakeGroup.scale.setScalar(v); }
    });
  }

  /* ---------- おみせ ---------- */

  function build(root) {
    GAME.setSky(0xffe0c0, 0xfff4e6);
    GAME.lights.hemi.intensity = 0.5;

    root.add(PROPS.room({
      w: 8.5, d: 7, h: 3.2, wall: 0xfff0e0, floor: 0xe8c9a8,
      floorPattern: 'check', floorAccent: 0xfff0e0, floorRepeat: 7, trim: 0xf0a06b
    }));

    // カウンター
    var counter = PROPS.counter(3.4, 0.8, 0.85, 0xffd9b8, { top: 0xfff6ec });
    counter.position.set(0, 0, -0.45);
    root.add(counter);

    // ターンテーブル
    turntable = new THREE.Group();
    var plate = PROPS.plate(0.55, 0xffffff);
    turntable.add(plate);
    turntable.position.set(0, 0.9, -0.42);
    root.add(turntable);

    // ちゅうもん の みほん だい
    var stand = PROPS.counter(0.9, 0.7, 0.7, 0xffc0d6, { top: 0xfff0f7 });
    stand.position.set(-1.85, 0, -1.15);
    root.add(stand);
    var card = B.textPlate('ちゅうもん', 0.7, { color: '#ff6fa5', stroke: '#ffffff', size: 90 });
    card.position.set(-1.85, 1.55, -0.9);
    root.add(card);

    // ショーケース
    var shelf = PROPS.shelf(2.4, 1.6, 0.6, 0xffe3c9);
    shelf.position.set(3.0, 0, -2.6);
    shelf.rotation.y = -0.4;
    root.add(shelf);
    for (var i = 0; i < 6; i++) {
      var mini = makeCake({
        sponge: U.pick(SPONGE).id, cream: U.pick(CREAM).id,
        toppings: [U.pick(TOPPINGS).id]
      });
      mini.scale.setScalar(0.5);
      mini.position.set(2.4 + (i % 3) * 0.55, 0.06 + Math.floor(i / 3) * 0.54, -2.85 + (i % 3) * 0.24);
      root.add(mini);
    }

    // オーブン と どうぐ
    var oven = PROPS.counter(1.0, 0.8, 1.1, 0xdfe4ea, { top: 0xc7c7d0 });
    oven.position.set(-3.1, 0, -2.4);
    root.add(oven);
    var ovenDoor = B.roundBox(0.7, 0.5, 0.06, 0.08, 0x8a8a9c, { unique: true });
    ovenDoor.position.set(-3.1, 0.55, -1.86);
    root.add(ovenDoor);

    root.add(B.at(PROPS.plant(1.1), 3.4, 0, 1.4));

    // おきゃくさま（どうぶつ）
    customer = new Animal(U.pick(['dog', 'cat', 'rabbit', 'bear', 'panda']), { scale: 1.1 });
    customer.group.position.set(1.9, 0, 0.75);
    customer.group.rotation.y = Math.PI - 0.5;
    root.add(customer.group);
    GAME.addTap(customer.group, function () { customer.play('happy'); customer.cry(); });

    // ひまりちゃん は パティシエ
    GAME.char.group.position.set(-0.9, 0, -1.5);
    GAME.char.group.rotation.y = 0.35;
    GAME.char.setPose('work');
    GAME.char.setExpr('smile');
  }

  /* ---------- ちゅうもん ---------- */

  function newOrder() {
    var n = 1 + Math.min(2, Math.floor(SAVE.job('cake').plays / 3));
    order = {
      sponge: U.pick(SPONGE).id,
      cream: U.pick(CREAM).id,
      toppings: U.sample(TOPPINGS, n + 1).map(function (t) { return t.id; })
    };
    if (sampleGroup) { GAME.root.remove(sampleGroup); GAME.disposeNode(sampleGroup); }
    sampleGroup = makeCake(order, { ghost: true });
    sampleGroup.scale.setScalar(0.62);
    sampleGroup.position.set(-1.85, 0.75, -1.15);
    GAME.root.add(sampleGroup);
  }

  /* ---------- ステップ ---------- */

  function showStep() {
    UI.setSteps(2 + order.toppings.length, step);
    if (step === 0) {
      UI.setTask('スポンジ を えらぼう！', '🍰');
      UI.setRow(0, SPONGE.map(function (s) {
        return { id: s.id, icon: s.icon, label: s.name, color: s.hex };
      }), function (id) { pickSponge(id); });
      GAME.setHint(function () { UI.hintOnChip(0, order.sponge); });
    } else if (step === 1) {
      UI.setTask('クリーム を えらぼう！', '🎂');
      UI.setRow(0, CREAM.map(function (s) {
        return { id: s.id, icon: s.icon, label: s.name, color: s.hex };
      }), function (id) { pickCream(id); });
      GAME.setHint(function () { UI.hintOnChip(0, order.cream); });
    } else {
      var idx = step - 2;
      UI.setTask('トッピング を のせよう！', '🍓');
      UI.setRow(0, TOPPINGS.map(function (s) {
        return { id: s.id, icon: s.icon, label: s.name };
      }), function (id) { pickTopping(id, idx); });
      GAME.setHint(function () { UI.hintOnChip(0, order.toppings[idx]); });
    }
  }

  function ok(msg) {
    SND.play('correct');
    GAME.char.play('clap', 0.6);
    FX.sparkleAt(new THREE.Vector3(0, 1.4, -0.25), 8);
    if (msg) UI.toast(msg);
  }

  function ng(hintId) {
    mistakes++;
    GAME.oops();
    customer.setMood('idle');
    if (mistakes >= 1) U.after(0.4, function () { UI.hintOnChip(0, hintId); });
  }

  function pickSponge(id) {
    if (id !== order.sponge) { ng(order.sponge); return; }
    built.sponge = id;
    rebuild();
    ok('ぴったり！');
    step++; showStep();
  }

  function pickCream(id) {
    if (id !== order.cream) { ng(order.cream); return; }
    built.cream = id;
    rebuild();
    SND.play('squirt');
    ok('なめらか〜');
    step++; showStep();
  }

  function pickTopping(id, idx) {
    if (id !== order.toppings[idx]) { ng(order.toppings[idx]); return; }
    built.toppings.push(id);
    rebuild();
    SND.play('place');
    ok('かわいい！');
    step++;
    if (built.toppings.length >= order.toppings.length) finish();
    else showStep();
  }

  function finish() {
    UI.setRow(0, []);
    UI.clearSteps();
    UI.setTask('できあがり〜！', '🎉');
    if (sampleGroup) sampleGroup.visible = false;

    SND.play('ding');
    SND.play('fanfare');
    GAME.char.play('cheer');
    GAME.char.setExpr('happy');
    customer.play('happy');
    customer.cry();
    FX.celebrate(new THREE.Vector3(0, 1.4, -0.25));
    GAME.setView({ target: [0, 1.1, -0.25], dist: 2.6, height: 0.75, fov: 38 });

    U.after(2.2, function () {
      GAME.finish('cake', {
        title: 'おいしそう な ケーキ！',
        stars: mistakes === 0 ? 3 : (mistakes <= 2 ? 2 : 1),
        msg: 'おきゃくさま が にっこり！'
      });
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('cake', {
    name: 'ケーキやさん', icon: '🍰', bgm: 'work',

    build: build,

    enter: function () {
      step = 0; mistakes = 0; spin = 0;
      built = { sponge: null, cream: null, toppings: [] };
      cakeGroup = null; sampleGroup = null;
      GAME.setView({ target: [-0.3, 1.0, -0.7], dist: 4.2, height: 2.5, fov: 40 }, true);
      newOrder();
      U.after(0.7, function () {
        UI.banner('ちゅうもん が きたよ！');
        SND.say('みほん と おなじ ケーキを つくってね');
        showStep();
      });
    },

    exit: function () { cakeGroup = null; sampleGroup = null; customer = null; },

    update: function (dt, t) {
      if (customer) customer.update(dt, t);
      spin += dt * 0.5;
      if (turntable) turntable.rotation.y = spin;
      if (sampleGroup) sampleGroup.rotation.y = -spin * 0.7;
      if (Math.random() < dt * 0.7) {
        FX.rain('sparkle', { x: 0, y: 2.4, z: -0.3, w: 3, d: 2, h: 0.4 }, 1, { size: 0.14, life: 2.6, gravity: -0.2 });
      }
    }
  });
})();
