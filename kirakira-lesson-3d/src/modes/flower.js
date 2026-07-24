/* ============================================================
 * flower.js — おはなやさん（おしごと）
 *   ちゅうもん の おはな を えらんで、はなたば を つくろう！
 * ============================================================ */
(function () {
  'use strict';

  var FLOWERS = [
    { id: 'rose', name: 'バラ', icon: '🌹', hex: 0xf0526e, style: 'rose' },
    { id: 'tulip', name: 'チューリップ', icon: '🌷', hex: 0xff8fb1, style: 'tulip' },
    { id: 'sun', name: 'ひまわり', icon: '🌻', hex: 0xffd23a, style: 'sun' },
    { id: 'daisy', name: 'マーガレット', icon: '🌼', hex: 0xfff4d0, style: 'daisy' },
    { id: 'blue', name: 'ブルースター', icon: '🔵', hex: 0x7fb8ff, style: 'daisy' },
    { id: 'purple', name: 'ラベンダー', icon: '💜', hex: 0xb794ff, style: 'tulip' }
  ];

  var WRAPS = [
    { id: 'pink', name: 'ピンク', icon: '💗', hex: 0xffc0d6 },
    { id: 'cream', name: 'クリーム', icon: '🤍', hex: 0xfff0c2 },
    { id: 'mint', name: 'ミント', icon: '💚', hex: 0x9ee9cd },
    { id: 'sky', name: 'そらいろ', icon: '💙', hex: 0xa8dcff }
  ];

  var RIBBONS = [
    { id: 'red', name: 'あか', icon: '🎀', hex: 0xf04a5c },
    { id: 'gold', name: 'ゴールド', icon: '✨', hex: 0xf5c542 },
    { id: 'purple', name: 'むらさき', icon: '💜', hex: 0xc09dff },
    { id: 'white', name: 'しろ', icon: '🤍', hex: 0xffffff }
  ];

  var order = null, need = [], gotIdx = 0, mistakes = 0;
  var bouquet = null, wrapMesh = null, ribbonMesh = null;
  var buckets = [], sample = null, customer = null;
  var phase = 'pick';

  /* ---------- はなたば ---------- */

  function makeBouquet(list, wrap, ribbon, ghost) {
    var g = new THREE.Group();
    if (wrap) {
      var cone = B.cone(0.3, 0.5, wrap.hex, { unique: true, seg: 18 });
      cone.material = B.fabric(wrap.hex, 'dots', 0xffffff, { repeat: 2 });
      cone.rotation.x = Math.PI;
      cone.position.y = 0.25;
      g.add(cone);
    }
    for (var i = 0; i < list.length; i++) {
      var def = list[i];
      var f = PROPS.stemFlower(def.hex, def.style, 0.42);
      var a = (i / Math.max(1, list.length)) * Math.PI * 2;
      var r = list.length === 1 ? 0 : 0.09;
      f.position.set(Math.cos(a) * r, 0.14, Math.sin(a) * r);
      f.rotation.z = Math.cos(a) * 0.24;
      f.rotation.x = -Math.sin(a) * 0.24;
      g.add(f);
    }
    if (ribbon) {
      var bow = WARDROBE.bowMesh(ribbon.hex, 0.075);
      bow.position.set(0, 0.3, 0.2);
      g.add(bow);
    }
    if (ghost) {
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
    if (bouquet) { GAME.root.remove(bouquet); GAME.disposeNode(bouquet); }
    var got = need.slice(0, gotIdx).map(function (id) { return byId(id); });
    bouquet = makeBouquet(got, wrapMesh, ribbonMesh);
    bouquet.position.set(0.5, 1.05, 0.6);
    GAME.root.add(bouquet);
    bouquet.scale.setScalar(0.01);
    U.tween({
      from: 0.01, to: 1, dur: 0.4, ease: 'outBack',
      onUpdate: function (v) { if (bouquet) bouquet.scale.setScalar(v); }
    });
  }

  function byId(id) { for (var i = 0; i < FLOWERS.length; i++) if (FLOWERS[i].id === id) return FLOWERS[i]; return FLOWERS[0]; }

  /* ---------- おみせ ---------- */

  function build(root) {
    GAME.setSky(0xcfeeb8, 0xeafbe4);
    GAME.lights.hemi.intensity = 0.5;

    root.add(PROPS.room({
      w: 8.5, d: 7, h: 3.2, wall: 0xeafbe4, floor: 0xd9c4a8,
      floorPattern: 'gingham', floorAccent: 0xc4b49e, floorRepeat: 8, trim: 0x7ac97a
    }));

    // だい
    var table = PROPS.counter(2.6, 0.9, 0.85, 0xd9a066, { top: 0xf0d2a8 });
    table.position.set(0.4, 0, -0.2);
    root.add(table);

    // バケツ（6しゅるい の おはな）
    buckets = [];
    for (var i = 0; i < FLOWERS.length; i++) {
      var f = FLOWERS[i];
      var g = new THREE.Group();
      var bucket = B.cyl(0.19, 0.15, 0.3, U.shade(f.hex, -0.35), { unique: true, seg: 14 });
      bucket.position.y = 0.15;
      g.add(bucket);
      var rim = B.torus(0.19, 0.026, 0xffffff, { unique: true });
      rim.position.y = 0.3; rim.rotation.x = Math.PI / 2;
      g.add(rim);
      for (var k = 0; k < 5; k++) {
        var st = PROPS.stemFlower(f.hex, f.style, 0.42 + U.rand(-0.05, 0.05));
        st.position.set(U.rand(-0.09, 0.09), 0.24, U.rand(-0.09, 0.09));
        st.rotation.z = U.rand(-0.22, 0.22);
        st.rotation.x = U.rand(-0.22, 0.22);
        g.add(st);
      }
      var col = i % 3, row = Math.floor(i / 3);
      g.position.set(-2.6 + col * 0.9, 0, -2.2 + row * 1.0);
      g.userData.flower = f;
      root.add(g);
      buckets.push(g);
      GAME.addTap(g, function (o) { pickFlower(o.userData.flower.id); });
      var label = B.emojiPlate(f.icon, 0.22);
      label.position.set(g.position.x, 0.16, g.position.z + 0.2);
      root.add(label);
    }

    // ちゅうもん だい
    var stand = PROPS.counter(0.8, 0.6, 0.7, 0xffc0d6, { top: 0xfff0f7 });
    stand.position.set(2.15, 0, -1.6);
    root.add(stand);
    var card = B.textPlate('ちゅうもん', 0.65, { color: '#ff6fa5', stroke: '#ffffff', size: 90 });
    card.position.set(2.15, 1.62, -1.35);
    root.add(card);

    // かざり
    root.add(B.at(PROPS.plant(1.4), 3.4, 0, 1.0));
    root.add(B.at(PROPS.plant(1.1), -3.4, 0, 1.4));
    var hs = PROPS.hangSign('おはなやさん', '💐', 0xd9f5d0);
    hs.position.set(0, 2.5, -3.4);
    root.add(hs);

    // おきゃくさま
    customer = new Animal(U.pick(['rabbit', 'cat', 'bear', 'hamster', 'unicorn']), { scale: 1.15 });
    customer.group.position.set(2.5, 0, 0.3);
    customer.group.rotation.y = Math.PI - 0.6;
    root.add(customer.group);
    GAME.addTap(customer.group, function () { customer.play('happy'); customer.cry(); });

    GAME.char.group.position.set(-0.35, 0, 0.85);
    GAME.char.group.rotation.y = -0.25;
    GAME.char.setPose('work');
    GAME.char.setExpr('smile');
  }

  /* ---------- ゲーム ---------- */

  function newOrder() {
    var n = 2 + Math.min(2, Math.floor(SAVE.job('flower').plays / 3));
    need = [];
    for (var i = 0; i < n; i++) need.push(U.pick(FLOWERS).id);
    order = need.map(byId);
    if (sample) { GAME.root.remove(sample); GAME.disposeNode(sample); }
    sample = makeBouquet(order, null, null, true);
    sample.scale.setScalar(0.8);
    sample.position.set(2.15, 0.66, -1.6);
    GAME.root.add(sample);
  }

  function showPick() {
    UI.setSteps(need.length + 2, gotIdx);
    UI.setTask('おなじ おはな を タッチ！', byId(need[gotIdx]).icon);
    UI.setRow(0, FLOWERS.map(function (f) {
      return { id: f.id, icon: f.icon, label: f.name, color: f.hex };
    }), function (id) { pickFlower(id); });
    GAME.setHint(function () {
      for (var i = 0; i < buckets.length; i++) {
        if (buckets[i].userData.flower.id === need[gotIdx]) { GAME.hintObject(buckets[i]); return; }
      }
    });
  }

  function pickFlower(id) {
    if (phase !== 'pick') return;
    if (id !== need[gotIdx]) {
      mistakes++;
      GAME.oops();
      U.after(0.4, function () { UI.hintOnChip(0, need[gotIdx]); });
      return;
    }
    gotIdx++;
    SND.play('pop');
    SND.play('correct');
    GAME.char.play('clap', 0.5);
    rebuild();
    FX.burst('petal', new THREE.Vector3(0.55, 1.25, 0.55), 10);
    if (gotIdx >= need.length) {
      phase = 'wrap';
      U.after(0.5, showWrap);
    } else {
      showPick();
    }
  }

  function showWrap() {
    UI.setSteps(need.length + 2, need.length);
    UI.setTask('つつむ かみ を えらぼう！', '📜');
    UI.setRow(0, WRAPS.map(function (w) {
      return { id: w.id, icon: w.icon, label: w.name, color: w.hex };
    }), function (id) {
      wrapMesh = WRAPS.filter(function (w) { return w.id === id; })[0];
      SND.play('swish');
      rebuild();
      phase = 'ribbon';
      U.after(0.4, showRibbon);
    });
    GAME.setHint(function () { UI.hintOnChip(0, U.pick(WRAPS).id); });
  }

  function showRibbon() {
    UI.setSteps(need.length + 2, need.length + 1);
    UI.setTask('リボン を むすぼう！', '🎀');
    UI.setRow(0, RIBBONS.map(function (w) {
      return { id: w.id, icon: w.icon, label: w.name, color: w.hex };
    }), function (id) {
      ribbonMesh = RIBBONS.filter(function (w) { return w.id === id; })[0];
      SND.play('ribbon');
      rebuild();
      phase = 'done';
      U.after(0.5, finish);
    });
    GAME.setHint(function () { UI.hintOnChip(0, U.pick(RIBBONS).id); });
  }

  function finish() {
    UI.setRow(0, []);
    UI.clearSteps();
    UI.setTask('はい どうぞ！', '💐');
    if (sample) sample.visible = false;
    SND.play('fanfare');
    GAME.char.play('cheer');
    GAME.char.setExpr('happy');
    customer.play('happy');
    customer.cry();
    FX.celebrate(new THREE.Vector3(0.55, 1.3, 0.55));
    FX.rain('petal', { x: 0.5, y: 3, z: 0, w: 3, d: 2, h: 0.5 }, 20, { size: 0.22, life: 3 });
    GAME.setView({ target: [0.55, 1.15, 0.55], dist: 2.2, height: 0.5, fov: 38 });
    U.after(2.2, function () {
      GAME.finish('flower', {
        title: 'すてきな はなたば！',
        stars: mistakes === 0 ? 3 : (mistakes <= 2 ? 2 : 1),
        msg: 'おきゃくさま が にっこり！'
      });
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('flower', {
    name: 'おはなやさん', icon: '💐', bgm: 'work',

    build: build,

    enter: function () {
      gotIdx = 0; mistakes = 0; phase = 'pick';
      wrapMesh = null; ribbonMesh = null; bouquet = null; sample = null;
      GAME.setView({ target: [0.2, 0.95, -0.7], dist: 5.0, height: 3.0, fov: 44 }, true);
      newOrder();
      rebuild();
      U.after(0.7, function () {
        UI.banner('ちゅうもん が きたよ！');
        SND.say('みほん と おなじ おはなを えらんでね');
        showPick();
      });
    },

    exit: function () { bouquet = null; sample = null; customer = null; buckets = []; },

    update: function (dt, t) {
      if (customer) customer.update(dt, t);
      if (bouquet) bouquet.rotation.y = Math.sin(t * 0.8) * 0.25;
      if (sample) sample.rotation.y += dt * 0.5;
      if (Math.random() < dt * 1.2) {
        FX.rain('petal', { x: 0, y: 2.8, z: -1, w: 6, d: 4, h: 0.4 }, 1, { size: 0.18, life: 4, gravity: -0.15 });
      }
    }
  });
})();
