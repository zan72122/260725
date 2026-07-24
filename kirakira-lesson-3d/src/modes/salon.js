/* ============================================================
 * salon.js — ヘアサロン（おしごと）
 *   おきゃくさま の かみ を あらって・かわかして・カットして・そめる。
 * ============================================================ */
(function () {
  'use strict';

  var customer = null, chair = null, tools = {}, foam = [];
  var step = 0, taps = 0, need = 5, score = 0;
  var CUT_STYLES = ['bob', 'twin', 'pony', 'curl', 'buns', 'wave', 'braid', 'princess'];

  var STEPS = [
    { id: 'wash', icon: '🧴', label: 'シャンプー', task: 'あたま を タッチ して あわあわ！', need: 6 },
    { id: 'rinse', icon: '🚿', label: 'シャワー', task: 'シャワー で ながそう', need: 4 },
    { id: 'dry', icon: '💨', label: 'ドライヤー', task: 'ドライヤー で かわかそう', need: 4 },
    { id: 'cut', icon: '✂️', label: 'カット', task: 'かみがた を えらんで！', choose: 'style' },
    { id: 'color', icon: '🎨', label: 'カラー', task: 'かみ の いろ を えらんで！', choose: 'color' },
    { id: 'acc', icon: '🎀', label: 'かざり', task: 'かざり を つけよう！', choose: 'acc' }
  ];

  /* ---------- おみせ ---------- */

  function build(root) {
    GAME.setSky(0xe8dcff, 0xf6f0ff);
    GAME.lights.hemi.intensity = 0.5;
    GAME.lights.dir.intensity = 0.5;

    root.add(PROPS.room({
      w: 8, d: 7, h: 3.2, wall: 0xf4ecff, floor: 0xe8e0f0,
      floorPattern: 'check', floorAccent: 0xf6f0ff, floorRepeat: 7, trim: 0xc4aeff
    }));

    // かがみ
    var m = PROPS.mirror(1.7, 2.0, 0xc4aeff);
    m.position.set(0, 1.85, -3.42);
    root.add(m);
    // かがみ の ライト
    for (var i = 0; i < 5; i++) {
      var bulb = B.sphere(0.075, 0xfff2b8, { seg: 10, emissive: 0x776600 });
      bulb.position.set(-0.8 + i * 0.4, 2.98, -3.3);
      root.add(bulb);
    }

    // カウンター
    var counter = PROPS.counter(2.4, 0.55, 0.75, 0xd9c8ff, { top: 0xfff0f7 });
    counter.position.set(0, 0, -3.05);
    root.add(counter);

    // ボトル
    var bcol = [0xff9dbf, 0x8fd4ff, 0x9ee493, 0xffd95c];
    for (var b = 0; b < 4; b++) {
      var bot = B.cyl(0.055, 0.07, 0.24, bcol[b], { unique: true, seg: 10 });
      bot.position.set(-0.9 + b * 0.6, 0.9, -2.9);
      root.add(bot);
      var cap = B.cyl(0.035, 0.04, 0.06, 0xffffff, { seg: 8 });
      cap.position.set(-0.9 + b * 0.6, 1.04, -2.9);
      root.add(cap);
    }

    // いす
    chair = new THREE.Group();
    var seat = B.roundBox(0.74, 0.16, 0.72, 0.1, 0xff9dbf, { unique: true });
    seat.position.y = 0.54;
    chair.add(seat);
    var backr = B.roundBox(0.72, 0.9, 0.14, 0.12, 0xff9dbf, { unique: true });
    backr.position.set(0, 1.06, -0.34);
    chair.add(backr);
    var stem = B.cyl(0.07, 0.09, 0.5, 0xdfe4ea, { seg: 12 });
    stem.position.y = 0.27;
    chair.add(stem);
    var base = B.cyl(0.34, 0.38, 0.08, 0xc7c7d0, { seg: 16 });
    base.position.y = 0.04;
    chair.add(base);
    chair.position.set(0, 0, -0.42);
    chair.rotation.y = 0.12;
    root.add(chair);

    // どうぐ（3Dで つくえの うえ に）
    var tray = PROPS.counter(1.0, 0.4, 0.7, 0xffe3c9, { top: 0xfff6ec });
    tray.position.set(2.2, 0, -1.6);
    tray.rotation.y = -0.6;
    root.add(tray);

    tools.scissors = B.emojiPlate('✂️', 0.3);
    tools.scissors.position.set(2.0, 0.78, -1.5);
    tools.scissors.rotation.x = -Math.PI / 2.4;
    root.add(tools.scissors);

    tools.dryer = B.emojiPlate('💨', 0.3);
    tools.dryer.position.set(2.35, 0.78, -1.72);
    tools.dryer.rotation.x = -Math.PI / 2.4;
    root.add(tools.dryer);

    // かんようしょくぶつ と ソファ
    root.add(B.at(PROPS.plant(1.3), -3.0, 0, 1.4));
    root.add(B.at(PROPS.plant(1.0), 3.2, 0, 1.8));

    var sofa = PROPS.counter(1.6, 0.7, 0.42, 0xc4aeff, { top: 0xd9c8ff });
    sofa.position.set(-2.6, 0, 1.0);
    sofa.rotation.y = 0.5;
    root.add(sofa);

    // おきゃくさま
    var outfit = WARDROBE.randomOutfit(false);
    outfit.acc = 'none';
    customer = new Character({ outfit: outfit });
    customer.group.position.set(0, 0, -0.42);
    customer.group.rotation.y = 0.12;
    customer.setPose('sit');
    customer.setExpr('normal');
    sitPose();
    root.add(customer.group);

    GAME.addTap(customer.group, function () { onTapCustomer(); }, { pop: false });

    // ケープ（かた から ひざ まで）
    var cape = B.cyl(0.2, 0.4, 0.62, 0x8fd4ff, { unique: true, seg: 20 });
    cape.position.set(0, 0.68, -0.42);
    
    root.add(cape);
    var collar = B.torus(0.145, 0.035, 0xffffff, { unique: true });
    collar.position.set(0, 1.0, -0.42);
    collar.rotation.x = Math.PI / 2;
    root.add(collar);

    // ひまりちゃん は びようし さん
    GAME.char.group.position.set(-1.25, 0, 0.05);
    GAME.char.group.rotation.y = 1.15;
    GAME.char.setPose('work');
    GAME.char.setExpr('smile');
  }

  /* ---------- ステップ ---------- */

  function sitPose() {
    if (!customer) return;
    customer.legL.root.rotation.x = -1.35;
    customer.legR.root.rotation.x = -1.35;
    customer.legL.knee.rotation.x = 1.35;
    customer.legR.knee.rotation.x = 1.35;
  }

  function headPos() {
    customer.group.updateMatrixWorld();
    return customer.headPos();
  }

  function showStep() {
    if (step >= STEPS.length) return;
    var s = STEPS[step];
    UI.setSteps(STEPS.length, step);
    UI.setTask(s.task, s.icon);
    taps = 0;
    need = s.need || 0;

    if (s.choose === 'style') {
      UI.setRow(0, CUT_STYLES.map(function (k) {
        return { id: k, icon: WARDROBE.HAIR[k].icon, label: WARDROBE.HAIR[k].name };
      }), function (id) {
        customer.outfit.hair = id;
        customer.applyOutfit(customer.outfit);
        SND.play('snip');
        FX.burst('sparkle', headPos(), 12);
        score++;
        nextStep();
      });
    } else if (s.choose === 'color') {
      UI.setRow(0, []);
      UI.setSwatches(0, WARDROBE.HAIR_COLORS, null, function (k) {
        customer.outfit.hairColor = k;
        customer.applyOutfit(customer.outfit);
        SND.play('magic');
        FX.burst('rainbow', headPos(), 16);
        score++;
        nextStep();
      });
    } else if (s.choose === 'acc') {
      var accs = ['ribbon', 'crown', 'flowerCrown', 'starclip', 'catears', 'hat', 'bunnyears', 'none'];
      UI.setRow(0, accs.map(function (k) {
        return { id: k, icon: WARDROBE.ACC[k].icon, label: WARDROBE.ACC[k].name };
      }), function (id) {
        customer.outfit.acc = id;
        customer.outfit.accColor = U.pick(WARDROBE.COLOR_KEYS);
        customer.applyOutfit(customer.outfit);
        SND.play('ribbon');
        FX.burst('heart', headPos(), 12);
        score++;
        nextStep();
      });
    } else {
      UI.setRow(0, [{ id: s.id, icon: s.icon, label: s.label, big: true }], function () { onTapCustomer(); });
      GAME.setHint(function () { GAME.hintObject(customer.head); });
    }
  }

  function onTapCustomer() {
    var s = STEPS[step];
    if (!s || s.choose) return;
    if (taps >= need) return;
    taps++;
    var hp = headPos();
    GAME.char.play('clap', 0.4);

    if (s.id === 'wash') {
      SND.play('bubble');
      FX.burst('bubble', hp, 8, { up: 1.2, spread: 0.7, gravity: -0.9, size: 0.2, life: 1.4 });
      var f = B.sphere(U.rand(0.07, 0.12), 0xffffff, { seg: 8, unique: true });
      f.position.copy(hp).add(new THREE.Vector3(U.rand(-0.2, 0.2), U.rand(0, 0.2), U.rand(-0.2, 0.2)));
      GAME.root.add(f);
      foam.push(f);
      customer.setExpr('happy');
    } else if (s.id === 'rinse') {
      SND.play('water');
      FX.burst('water', hp.clone().add(new THREE.Vector3(0, 0.5, 0)), 14, { up: -0.4, spread: 0.5, gravity: -6, size: 0.14, life: 0.8 });
      for (var i = 0; i < 3 && foam.length; i++) {
        var ff = foam.pop();
        GAME.root.remove(ff);
      }
      customer.setExpr('smile');
    } else if (s.id === 'dry') {
      SND.play('dryer');
      FX.burst('sparkle', hp, 10, { up: 1.6, spread: 1.0, gravity: -0.6 });
      customer.headTilt = U.rand(-0.15, 0.15);
      customer.setExpr('happy');
    }

    UI.setSteps(STEPS.length, step);
    if (taps >= need) {
      while (foam.length) { GAME.root.remove(foam.pop()); }
      score++;
      GAME.praise(hp, 'いいね！');
      nextStep();
    }
  }

  function nextStep() {
    step++;
    customer.setExpr('smile');
    if (step >= STEPS.length) {
      finish();
    } else {
      U.after(0.5, showStep);
    }
  }

  function finish() {
    UI.setRow(0, []);
    UI.clearSteps();
    UI.setTask('できあがり〜！', '✨');
    customer.setExpr('star');
    customer.play('cheer');
    GAME.char.play('cheer');
    GAME.char.setExpr('happy');
    SND.play('fanfare');
    FX.celebrate(headPos());
    GAME.setView({ target: [0, 1.15, -0.42], dist: 2.6, height: 0.35, fov: 38 });

    U.after(2.0, function () {
      GAME.finish('salon', {
        title: 'かわいく なったね！',
        stars: score >= 6 ? 3 : (score >= 4 ? 2 : 1),
        msg: 'おきゃくさま が おおよろこび！'
      });
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('salon', {
    name: 'ヘアサロン', icon: '💇', bgm: 'work',

    build: build,

    enter: function () {
      step = 0; taps = 0; score = 0; foam = [];
      GAME.setView({ target: [-0.3, 1.0, -0.4], dist: 4.4, height: 1.15, fov: 40 }, true);
      U.after(0.6, function () {
        UI.banner('おきゃくさま が きたよ！');
        showStep();
      });
    },

    exit: function () { customer = null; foam = []; },

    update: function (dt, t) {
      if (customer) { customer.update(dt, t); sitPose(); }
      for (var i = 0; i < foam.length; i++) {
        foam[i].position.y += Math.sin(t * 3 + i) * dt * 0.05;
      }
    }
  });
})();
