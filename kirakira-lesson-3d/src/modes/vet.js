/* ============================================================
 * vet.js — どうぶつびょういん（おしごと）
 *   よごれた どうぶつ を あらって、なおして、げんき に しよう！
 * ============================================================ */
(function () {
  'use strict';

  var patient = null, table = null, bandage = null, bowl = null;
  var step = 0, taps = 0, need = 0, score = 0;
  var bubbles = [];

  var STEPS = [
    { id: 'wash', icon: '🧼', label: 'あらう', task: 'どうぶつ を タッチ して あらおう！', need: 6, sfx: 'bubble' },
    { id: 'rinse', icon: '🚿', label: 'ながす', task: 'シャワー で ながそう！', need: 4, sfx: 'water' },
    { id: 'dry', icon: '🧺', label: 'ふく', task: 'タオル で ふこう！', need: 4, sfx: 'brush' },
    { id: 'brush', icon: '🪮', label: 'ブラシ', task: 'ブラシ で とかそう！', need: 5, sfx: 'brush' },
    { id: 'care', icon: '🩹', label: 'ばんそうこう', task: 'ばんそうこう を はろう！', need: 1, sfx: 'place' },
    { id: 'feed', icon: '🍖', label: 'ごはん', task: 'ごはん を あげよう！', need: 3, sfx: 'munch' },
    { id: 'play', icon: '🎾', label: 'あそぶ', task: 'いっしょ に あそぼう！', need: 4, sfx: 'pop' }
  ];

  /* ---------- びょういん ---------- */

  function build(root) {
    GAME.setSky(0xfff0c8, 0xfffbee);
    GAME.lights.hemi.intensity = 0.5;

    root.add(PROPS.room({
      w: 8.5, d: 7, h: 3.2, wall: 0xfffbee, floor: 0xe6e0d2,
      floorPattern: 'check', floorAccent: 0xfff6e2, floorRepeat: 7, trim: 0xffc45c
    }));

    // しんさつ だい
    table = new THREE.Group();
    var top = B.roundBox(1.7, 0.14, 1.0, 0.08, 0xffffff, { unique: true });
    top.position.y = 0.72;
    table.add(top);
    var pad = B.roundBox(1.4, 0.08, 0.8, 0.08, 0xa8dcff, { unique: true });
    pad.position.y = 0.82;
    table.add(pad);
    for (var i = 0; i < 4; i++) {
      var lx = (i % 2 === 0 ? -1 : 1) * 0.72, lz = (i < 2 ? 1 : -1) * 0.4;
      var leg = B.cyl(0.05, 0.055, 0.72, 0xdfe4ea, { seg: 10 });
      leg.position.set(lx, 0.36, lz);
      table.add(leg);
    }
    table.position.set(0, 0, -0.4);
    root.add(table);

    // たな と どうぐ
    var shelf = PROPS.shelf(1.8, 1.4, 0.5, 0xfff0d8);
    shelf.position.set(-2.9, 0, -2.6);
    shelf.rotation.y = 0.5;
    root.add(shelf);
    var icons = ['🧴', '🩺', '💊', '🧻', '🧸', '🍼'];
    for (var s = 0; s < icons.length; s++) {
      var e = B.emojiPlate(icons[s], 0.24);
      e.position.set(-3.2 + (s % 3) * 0.45, 0.62 + Math.floor(s / 3) * 0.48, -2.35 + (s % 3) * 0.24);
      e.rotation.y = 0.5;
      root.add(e);
    }

    // ごはん の おさら
    bowl = PROPS.bowl(0.16, 0xff9dbf);
    bowl.position.set(0.95, 0.87, -0.15);
    root.add(bowl);

    // まちあいしつ の いす
    for (var c = -1; c <= 1; c += 2) {
      var ch = PROPS.stool(c < 0 ? 0x9ee493 : 0xffc0d6);
      ch.position.set(c * 2.6, 0, 1.4);
      root.add(ch);
    }

    var hs = PROPS.hangSign('どうぶつびょういん', '🐶', 0xfff0d8);
    hs.position.set(0, 2.6, -3.4);
    root.add(hs);

    root.add(B.at(PROPS.plant(1.3), 3.2, 0, 0.6));

    // かんじゃさん
    var type = U.pick(['dog', 'cat', 'rabbit', 'bear', 'bird', 'hamster', 'panda', 'unicorn']);
    patient = new Animal(type, { scale: 1.5 });
    patient.group.position.set(0, 0.86, -0.4);
    patient.group.rotation.y = 0.2;
    patient.setDirty(6);
    patient.setMood('sad');
    patient.wagSpeed = 0.3;
    root.add(patient.group);
    GAME.addTap(patient.group, function () { onTap(); }, { pop: false });

    // まって いる おともだち
    var friend = new Animal(U.pick(['cat', 'dog', 'rabbit']), { scale: 0.95 });
    friend.group.position.set(-2.6, 0.5, 1.4);
    friend.group.rotation.y = Math.PI - 0.4;
    root.add(friend.group);
    vetState.friend = friend;

    GAME.char.group.position.set(-1.15, 0, 0.35);
    GAME.char.group.rotation.y = 0.9;
    GAME.char.setPose('work');
    GAME.char.setExpr('smile');
  }

  var vetState = {};

  /* ---------- ステップ ---------- */

  function bodyPos() {
    patient.group.updateMatrixWorld();
    return patient.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0));
  }

  function showStep() {
    if (step >= STEPS.length) return;
    var s = STEPS[step];
    UI.setSteps(STEPS.length, step);
    UI.setTask(s.task, s.icon);
    taps = 0;
    need = s.need;
    UI.setRow(0, [{ id: s.id, icon: s.icon, label: s.label, big: true }], function () { onTap(); });
    GAME.setHint(function () { GAME.hintObject(patient.group); });
  }

  function onTap() {
    var s = STEPS[step];
    if (!s) return;
    if (taps >= need) return;
    taps++;
    var p = bodyPos();
    GAME.char.play('clap', 0.35);
    SND.play(s.sfx);

    if (s.id === 'wash') {
      FX.burst('bubble', p, 8, { up: 1.2, spread: 0.7, gravity: -0.9, size: 0.2, life: 1.4 });
      var b = B.sphere(U.rand(0.06, 0.11), 0xffffff, { seg: 8, unique: true });
      b.position.copy(p).add(new THREE.Vector3(U.rand(-0.25, 0.25), U.rand(-0.1, 0.2), U.rand(-0.2, 0.2)));
      GAME.root.add(b);
      bubbles.push(b);
      patient.setDirty(Math.max(0, 6 - taps));
    } else if (s.id === 'rinse') {
      FX.burst('water', p.clone().add(new THREE.Vector3(0, 0.6, 0)), 14, { up: -0.4, spread: 0.5, gravity: -6, size: 0.14, life: 0.8 });
      for (var i = 0; i < 3 && bubbles.length; i++) GAME.root.remove(bubbles.pop());
      patient.setDirty(0);
    } else if (s.id === 'dry') {
      FX.burst('sparkle', p, 10, { up: 1.4, spread: 0.9 });
      patient.play('shake', 0.5);
    } else if (s.id === 'brush') {
      FX.burst('sparkle', p, 8, { up: 1.2, spread: 0.8 });
      patient.setMood('happy');
    } else if (s.id === 'care') {
      if (!bandage) {
        bandage = B.roundBox(0.16, 0.07, 0.02, 0.02, 0xffd9b8, { unique: true });
        bandage.position.set(0.16, 0.42, 0.2);
        bandage.rotation.z = 0.5;
        patient.root.add(bandage);
      }
      FX.burst('heart', p, 10);
    } else if (s.id === 'feed') {
      FX.burst('star', p, 8, { up: 1.4 });
      patient.play('happy', 0.7);
    } else if (s.id === 'play') {
      FX.burst('heart', p, 10, { up: 2 });
      patient.play('hop', 0.6);
      patient.wagSpeed = 4;
    }

    patient.setMood(taps >= need - 1 ? 'happy' : patient.mood);
    UI.setSteps(STEPS.length, step);

    if (taps >= need) {
      while (bubbles.length) GAME.root.remove(bubbles.pop());
      score++;
      GAME.praise(p, U.pick(['じょうず！', 'やさしいね！', 'ばっちり！']));
      patient.cry();
      nextStep();
    }
  }

  function nextStep() {
    step++;
    if (step >= STEPS.length) finish();
    else U.after(0.6, showStep);
  }

  function finish() {
    UI.setRow(0, []);
    UI.clearSteps();
    UI.setTask('げんき に なったよ！', '💖');
    patient.setMood('happy');
    patient.wagSpeed = 5;
    patient.play('happy', 1.6);
    patient.cry();
    GAME.char.play('cheer');
    GAME.char.setExpr('love');
    SND.play('fanfare');
    FX.celebrate(bodyPos());
    GAME.setView({ target: [0, 1.15, -0.4], dist: 2.3, height: 0.5, fov: 38 });
    U.after(2.2, function () {
      GAME.finish('vet', {
        title: 'ありがとう！',
        stars: score >= 7 ? 3 : (score >= 5 ? 2 : 1),
        hearts: 2,
        msg: 'どうぶつ が げんき に なったよ！'
      });
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('vet', {
    name: 'どうぶつびょういん', icon: '🐶', bgm: 'work',

    build: build,

    enter: function () {
      step = 0; taps = 0; score = 0; bandage = null; bubbles = [];
      GAME.setView({ target: [-0.15, 1.0, -0.3], dist: 4.0, height: 1.7, fov: 42 }, true);
      U.after(0.7, function () {
        UI.banner('かんじゃさん が きたよ！');
        SND.say('どうぶつを げんきに してあげよう');
        showStep();
      });
    },

    exit: function () { patient = null; bubbles = []; vetState = {}; },

    update: function (dt, t) {
      if (patient) patient.update(dt, t);
      if (vetState.friend) vetState.friend.update(dt, t);
      for (var i = 0; i < bubbles.length; i++) {
        bubbles[i].position.y += Math.sin(t * 3 + i) * dt * 0.06;
      }
    }
  });
})();
