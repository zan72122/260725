/* ============================================================
 * icecream.js — アイスやさん（おしごと）
 *   じゅんばん どおり に アイス を つみあげよう！
 * ============================================================ */
(function () {
  'use strict';

  var FLAVORS = [
    { id: 'vanilla', name: 'バニラ', icon: '🤍', hex: 0xfff3d8 },
    { id: 'choco', name: 'チョコ', icon: '🤎', hex: 0x8a5a3a },
    { id: 'straw', name: 'いちご', icon: '🩷', hex: 0xff9dbf },
    { id: 'mint', name: 'ミント', icon: '💚', hex: 0x9ee9cd },
    { id: 'soda', name: 'ソーダ', icon: '💙', hex: 0x9fd8ff },
    { id: 'grape', name: 'ぶどう', icon: '💜', hex: 0xbb9dff },
    { id: 'mango', name: 'マンゴー', icon: '🧡', hex: 0xffc25c },
    { id: 'matcha', name: 'まっちゃ', icon: '🍵', hex: 0xbfe08a }
  ];

  var CONES = [
    { id: 'cone', name: 'コーン', icon: '🍦', hex: 0xe0a860 },
    { id: 'choco', name: 'チョココーン', icon: '🍫', hex: 0x7a4a2a },
    { id: 'cup', name: 'カップ', icon: '🥤', hex: 0xffc0d6 }
  ];

  var TOPS = [
    { id: 'sprinkle', name: 'スプレー', icon: '🌈' },
    { id: 'choco', name: 'チョコソース', icon: '🍫' },
    { id: 'cherry', name: 'さくらんぼ', icon: '🍒' },
    { id: 'star', name: 'ほしチップ', icon: '⭐' }
  ];

  var order = null, built = null, mistakes = 0, step = 0;
  var holder = null, iceGroup = null, sample = null, customer = null, tubs = [];

  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }

  /* ---------- アイス を つくる ---------- */

  function makeIce(spec, ghost) {
    var g = new THREE.Group();
    var y = 0;
    if (spec.cone) {
      var c = byId(CONES, spec.cone);
      if (spec.cone === 'cup') {
        var cup = B.cyl(0.16, 0.12, 0.24, c.hex, { unique: true, seg: 16 });
        cup.position.y = 0.12;
        g.add(cup);
        var rim = B.torus(0.16, 0.022, 0xffffff, { unique: true });
        rim.position.y = 0.24; rim.rotation.x = Math.PI / 2;
        g.add(rim);
        y = 0.24;
      } else {
        var cone = B.cone(0.14, 0.36, c.hex, { unique: true, seg: 14 });
        cone.rotation.x = Math.PI;
        cone.position.y = 0.18;
        g.add(cone);
        y = 0.34;
      }
    }
    if (spec.scoops) {
      for (var i = 0; i < spec.scoops.length; i++) {
        var f = byId(FLAVORS, spec.scoops[i]);
        var s = B.sphere(0.135, f.hex, { seg: 16, unique: true, flat: true });
        s.position.y = y + 0.1 + i * 0.2;
        s.rotation.y = i * 0.7;
        g.add(s);
      }
      y = y + 0.1 + Math.max(0, spec.scoops.length - 1) * 0.2;
    }
    if (spec.top) {
      if (spec.top === 'sprinkle') {
        for (var k = 0; k < 14; k++) {
          var sp = B.box(0.022, 0.012, 0.012, U.pick([0xff6fa5, 0xffd44d, 0x8fd4ff, 0x9ee493, 0xc9a7ff]));
          var a = U.rand(0, U.TAU), r = U.rand(0, 0.11);
          sp.position.set(Math.cos(a) * r, y + 0.11 - r * 0.3, Math.sin(a) * r);
          sp.rotation.set(U.rand(0, 3), U.rand(0, 3), U.rand(0, 3));
          g.add(sp);
        }
      } else if (spec.top === 'choco') {
        var sauce = B.sphere(0.13, 0x6b4226, { seg: 14, unique: true });
        sauce.scale.set(1, 0.45, 1);
        sauce.position.y = y + 0.09;
        g.add(sauce);
      } else if (spec.top === 'cherry') {
        var ch = B.sphere(0.05, 0xd83a4a, { seg: 12, unique: true });
        ch.position.y = y + 0.17;
        g.add(ch);
        var st = B.cyl(0.008, 0.008, 0.1, 0x6fbf5f, { seg: 6 });
        st.position.y = y + 0.25; st.rotation.z = 0.3;
        g.add(st);
      } else if (spec.top === 'star') {
        for (var q = 0; q < 4; q++) {
          var stm = B.star(0.045, 0xffd44d, { unique: true, shiny: true });
          var a2 = q / 4 * U.TAU;
          stm.position.set(Math.cos(a2) * 0.08, y + 0.1, Math.sin(a2) * 0.08);
          stm.rotation.x = -0.4;
          g.add(stm);
        }
      }
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
    if (iceGroup) { holder.remove(iceGroup); GAME.disposeNode(iceGroup); }
    iceGroup = makeIce(built);
    holder.add(iceGroup);
    iceGroup.scale.setScalar(0.01);
    U.tween({
      from: 0.01, to: 1, dur: 0.35, ease: 'outBack',
      onUpdate: function (v) { if (iceGroup) iceGroup.scale.setScalar(v); }
    });
  }

  /* ---------- おみせ ---------- */

  function build(root) {
    GAME.setSky(0x8fd4ff, 0xdff3ff);
    GAME.lights.hemi.intensity = 0.5;

    root.add(PROPS.room({
      w: 8.5, d: 7, h: 3.2, wall: 0xe6f7ff, floor: 0xbfe3f5,
      floorPattern: 'stripeH', floorAccent: 0xffffff, floorRepeat: 6, trim: 0x6fc4f0
    }));

    var counter = PROPS.counter(3.6, 0.85, 0.9, 0xa8dcff, { top: 0xffffff, stripe: 0xffffff });
    counter.position.set(0, 0, -0.5);
    root.add(counter);

    // アイス の ケース（8しゅるい）
    var caseBox = PROPS.counter(3.2, 0.7, 0.55, 0xdff3ff, { top: 0xffffff });
    caseBox.position.set(0, 0, -2.1);
    root.add(caseBox);
    tubs = [];
    for (var i = 0; i < FLAVORS.length; i++) {
      var f = FLAVORS[i];
      var g = new THREE.Group();
      var tub = B.cyl(0.17, 0.15, 0.16, 0xffffff, { seg: 14 });
      tub.position.y = 0.08;
      g.add(tub);
      var cream = B.sphere(0.16, f.hex, { seg: 14, unique: true, flat: true });
      cream.scale.y = 0.62;
      cream.position.y = 0.17;
      g.add(cream);
      var col = i % 4, row = Math.floor(i / 4);
      g.position.set(-1.35 + col * 0.9, 0.6, -2.3 + row * 0.42);
      g.userData.flavor = f;
      root.add(g);
      tubs.push(g);
      GAME.addTap(g, function (o) { pickScoop(o.userData.flavor.id); });
    }

    // ホルダー
    holder = new THREE.Group();
    holder.position.set(0.35, 0.95, -0.35);
    root.add(holder);

    // ちゅうもん だい
    var stand = PROPS.counter(0.8, 0.6, 0.7, 0xffc0d6, { top: 0xfff0f7 });
    stand.position.set(-2.4, 0, -0.9);
    root.add(stand);
    var card = B.textPlate('ちゅうもん', 0.62, { color: '#ff6fa5', stroke: '#ffffff', size: 90 });
    card.position.set(-2.4, 1.62, -0.65);
    root.add(card);

    var hs = PROPS.hangSign('アイスやさん', '🍦', 0xdff3ff);
    hs.position.set(0, 2.6, -3.4);
    root.add(hs);

    root.add(B.at(PROPS.plant(1.2), 3.3, 0, 0.6));

    customer = new Animal(U.pick(['dog', 'cat', 'bird', 'panda', 'hamster']), { scale: 1.15 });
    customer.group.position.set(2.5, 0, 0.4);
    customer.group.rotation.y = Math.PI - 0.55;
    root.add(customer.group);
    GAME.addTap(customer.group, function () { customer.play('happy'); customer.cry(); });

    GAME.char.group.position.set(-0.35, 0, -1.35);
    GAME.char.group.rotation.y = 0.2;
    GAME.char.setPose('work');
    GAME.char.setExpr('smile');
  }

  /* ---------- ゲーム ---------- */

  function newOrder() {
    var n = 2 + Math.min(2, Math.floor(SAVE.job('icecream').plays / 3));
    order = {
      cone: U.pick(CONES).id,
      scoops: [],
      top: U.pick(TOPS).id
    };
    for (var i = 0; i < n; i++) order.scoops.push(U.pick(FLAVORS).id);
    if (sample) { GAME.root.remove(sample); GAME.disposeNode(sample); }
    sample = makeIce(order, true);
    sample.scale.setScalar(0.85);
    sample.position.set(-2.4, 0.66, -0.9);
    GAME.root.add(sample);
  }

  function totalSteps() { return 2 + order.scoops.length; }

  function showStep() {
    UI.setSteps(totalSteps(), step);
    if (step === 0) {
      UI.setTask('コーン を えらぼう！', '🍦');
      UI.setRow(0, CONES.map(function (c) {
        return { id: c.id, icon: c.icon, label: c.name, color: c.hex };
      }), function (id) { pickCone(id); });
      GAME.setHint(function () { UI.hintOnChip(0, order.cone); });
    } else if (step <= order.scoops.length) {
      UI.setTask('アイス を のせよう！', byId(FLAVORS, order.scoops[step - 1]).icon);
      UI.setRow(0, FLAVORS.map(function (f) {
        return { id: f.id, icon: f.icon, label: f.name, color: f.hex };
      }), function (id) { pickScoop(id); });
      GAME.setHint(function () {
        for (var i = 0; i < tubs.length; i++) {
          if (tubs[i].userData.flavor.id === order.scoops[step - 1]) { GAME.hintObject(tubs[i]); return; }
        }
      });
    } else {
      UI.setTask('トッピング を のせよう！', '🌈');
      UI.setRow(0, TOPS.map(function (t) {
        return { id: t.id, icon: t.icon, label: t.name };
      }), function (id) { pickTop(id); });
      GAME.setHint(function () { UI.hintOnChip(0, order.top); });
    }
  }

  function ng(hintId) {
    mistakes++;
    GAME.oops();
    U.after(0.4, function () { UI.hintOnChip(0, hintId); });
  }

  function pickCone(id) {
    if (step !== 0) return;
    if (id !== order.cone) { ng(order.cone); return; }
    built.cone = id;
    rebuild();
    SND.play('place'); SND.play('correct');
    step++; showStep();
  }

  function pickScoop(id) {
    if (step < 1 || step > order.scoops.length) return;
    if (id !== order.scoops[step - 1]) { ng(order.scoops[step - 1]); return; }
    built.scoops.push(id);
    rebuild();
    SND.play('pop'); SND.play('correct');
    GAME.char.play('clap', 0.5);
    FX.sparkleAt(holder.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 6);
    step++; showStep();
  }

  function pickTop(id) {
    if (id !== order.top) { ng(order.top); return; }
    built.top = id;
    rebuild();
    SND.play('sparkle');
    step++;
    finish();
  }

  function finish() {
    UI.setRow(0, []);
    UI.clearSteps();
    UI.setTask('できあがり〜！', '🎉');
    if (sample) sample.visible = false;
    SND.play('ding'); SND.play('fanfare');
    GAME.char.play('cheer');
    GAME.char.setExpr('happy');
    customer.play('happy'); customer.cry();
    FX.celebrate(holder.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
    GAME.setView({ target: [0.35, 1.35, -0.35], dist: 1.9, height: 0.35, fov: 38 });
    U.after(2.2, function () {
      GAME.finish('icecream', {
        title: 'おいしそう な アイス！',
        stars: mistakes === 0 ? 3 : (mistakes <= 2 ? 2 : 1),
        msg: 'つめたくて おいしい！'
      });
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('icecream', {
    name: 'アイスやさん', icon: '🍦', bgm: 'work',

    build: build,

    enter: function () {
      step = 0; mistakes = 0;
      built = { cone: null, scoops: [], top: null };
      iceGroup = null; sample = null;
      GAME.setView({ target: [0.1, 1.0, -1.0], dist: 4.6, height: 3.0, fov: 44 }, true);
      newOrder();
      U.after(0.7, function () {
        UI.banner('ちゅうもん が きたよ！');
        SND.say('みほん と おなじ アイスを つくってね');
        showStep();
      });
    },

    exit: function () { iceGroup = null; sample = null; customer = null; tubs = []; },

    update: function (dt, t) {
      if (customer) customer.update(dt, t);
      if (sample) sample.rotation.y += dt * 0.6;
      if (holder) holder.rotation.y = Math.sin(t * 0.9) * 0.3;
      if (Math.random() < dt * 0.8) {
        FX.rain('sparkle', { x: 0, y: 2.6, z: -1, w: 5, d: 3, h: 0.4 }, 1, { size: 0.14, life: 3 });
      }
    }
  });
})();
