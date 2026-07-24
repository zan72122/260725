/* ============================================================
 * photo.js — しゃしんスタジオ
 *   はいけい・ポーズ・フレーム を えらんで、パシャッ！
 * ============================================================ */
(function () {
  'use strict';

  var BACKS = [
    { id: 'castle', name: 'おしろ', icon: '🏰', sky: [0xffd9ec, 0xfff0f7], build: buildCastle },
    { id: 'beach', name: 'うみ', icon: '🏖️', sky: [0x7fd0ff, 0xdff3ff], build: buildBeach },
    { id: 'forest', name: 'もり', icon: '🌳', sky: [0xa8e8a0, 0xe8fbe4], build: buildForest },
    { id: 'night', name: 'よぞら', icon: '🌙', sky: [0x2a2a52, 0x5a4a82], build: buildNight },
    { id: 'sweets', name: 'スイーツ', icon: '🍩', sky: [0xffd9b8, 0xfff4e6], build: buildSweets },
    { id: 'rainbow', name: 'にじ', icon: '🌈', sky: [0xc9e8ff, 0xffe9f4], build: buildRainbow }
  ];

  var POSES = [
    { id: 'pose1', name: 'キメ', icon: '💃', expr: 'happy' },
    { id: 'pose2', name: 'ピース', icon: '✌️', expr: 'wink' },
    { id: 'pose3', name: 'ばんざい', icon: '🙌', expr: 'star' },
    { id: 'shy', name: 'てれる', icon: '☺️', expr: 'love' },
    { id: 'cheer', name: 'ジャンプ', icon: '🤸', expr: 'happy' },
    { id: 'point', name: 'ゆびさし', icon: '👉', expr: 'proud' }
  ];

  var FRAMES = [
    { id: 'none', name: 'なし', icon: '⬜', color: null },
    { id: 'heart', name: 'ハート', icon: '💗', color: 0xff9dbf },
    { id: 'star', name: 'ほし', icon: '⭐', color: 0xffd44d },
    { id: 'flower', name: 'おはな', icon: '🌸', color: 0xffc0d6 },
    { id: 'ribbon', name: 'リボン', icon: '🎀', color: 0xc09dff }
  ];

  var backGroup = null, frameGroup = null, propGroup = null;
  var curBack = 'castle', curPose = 'pose1', curFrame = 'heart';
  var shots = 0, flashing = 0;

  /* ---------- はいけい ---------- */

  function buildCastle(g) {
    for (var i = 0; i < 3; i++) {
      var tower = B.cyl(0.5, 0.6, 2.4 + i * 0.5, 0xfff0f7, { unique: true, seg: 14 });
      tower.position.set(-2.2 + i * 2.2, 1.2 + i * 0.25, -4.2);
      g.add(tower);
      var roof = B.cone(0.66, 1.1, 0xff8fb1, { unique: true, seg: 12 });
      roof.position.set(-2.2 + i * 2.2, 2.9 + i * 0.75, -4.2);
      g.add(roof);
      var flag = B.emojiPlate('🚩', 0.32);
      flag.position.set(-2.2 + i * 2.2, 3.6 + i * 0.75, -4.15);
      g.add(flag);
    }
    var wall = B.roundBox(6.5, 1.5, 0.4, 0.1, 0xfff6fa, { unique: true });
    wall.position.set(0, 0.75, -4.4);
    g.add(wall);
    g.add(B.at(PROPS.balloonArch(5, 1.8), 0, 0.6, -2.6));
  }

  function buildBeach(g) {
    var sea = B.ground(30, 0x5fc4f5);
    sea.position.set(0, 0.02, -8);
    g.add(sea);
    var sand = B.circle(6, 0xffe9c0, { unique: true });
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = 0.03;
    g.add(sand);
    for (var i = 0; i < 3; i++) {
      var trunk = B.cyl(0.1, 0.14, 2.2, 0x9b6b46, { seg: 10 });
      trunk.position.set(-3 + i * 3, 1.1, -3.4);
      trunk.rotation.z = (i - 1) * 0.12;
      g.add(trunk);
      for (var k = 0; k < 6; k++) {
        var leaf = B.petal(0.9, 0x6fbf5f, { unique: true });
        leaf.position.set(-3 + i * 3, 2.2, -3.4);
        leaf.rotation.set(-1.2, k / 6 * U.TAU, 0.4);
        g.add(leaf);
      }
    }
    var ball = B.sphere(0.28, 0xff6b6b, { seg: 14 });
    ball.position.set(1.6, 0.28, -0.6);
    g.add(ball);
    var umb = B.cone(1.0, 0.5, 0xffd95c, { unique: true, seg: 14 });
    umb.position.set(-2.0, 1.6, -1.2);
    g.add(umb);
    var pole = B.cyl(0.04, 0.04, 1.6, 0xffffff, { seg: 8 });
    pole.position.set(-2.0, 0.8, -1.2);
    g.add(pole);
  }

  function buildForest(g) {
    for (var i = 0; i < 10; i++) {
      var t = B.tree(U.rand(1.4, 2.4), U.pick([0x6fbf5f, 0x7ed07a, 0x93dc8c]));
      t.position.set(U.rand(-5, 5), 0, U.rand(-5.5, -2.2));
      g.add(t);
    }
    for (var f = 0; f < 20; f++) {
      var fl = B.flower(U.pick([0xff9dbf, 0xffd95c, 0xffffff, 0xc09dff]));
      fl.position.set(U.rand(-4, 4), 0, U.rand(-3, 1.4));
      g.add(fl);
    }
    var mush = B.sphere(0.3, 0xf04a5c, { seg: 12 });
    mush.scale.y = 0.6; mush.position.set(1.8, 0.34, -0.8);
    g.add(mush);
    var stem = B.cyl(0.11, 0.13, 0.3, 0xfff0d0, { seg: 10 });
    stem.position.set(1.8, 0.15, -0.8);
    g.add(stem);
  }

  function buildNight(g) {
    for (var i = 0; i < 40; i++) {
      var s = B.star(U.rand(0.06, 0.16), 0xfff2b8, { unique: true });
      s.position.set(U.rand(-8, 8), U.rand(1.5, 6), U.rand(-7, -3));
      s.rotation.z = U.rand(0, 3);
      g.add(s);
    }
    var moon = B.sphere(0.8, 0xfff6d0, { seg: 18, emissive: 0x554400 });
    moon.position.set(-2.8, 4.2, -5.5);
    g.add(moon);
    var hill = B.cyl(6, 6.4, 0.6, 0x4a4a7a, { seg: 24 });
    hill.position.set(0, 0.05, -4.5);
    g.add(hill);
  }

  function buildSweets(g) {
    for (var i = 0; i < 5; i++) {
      var d = B.torus(0.5, 0.22, U.pick([0xffb3cd, 0xffd9a0, 0xc09dff]), { unique: true });
      d.position.set(-3.5 + i * 1.8, 1.5 + (i % 2) * 0.6, -4);
      g.add(d);
    }
    for (var c = 0; c < 4; c++) {
      var cup = B.cyl(0.4, 0.32, 0.5, 0xfff0d0, { unique: true, seg: 16 });
      cup.position.set(-3 + c * 2, 0.25, -2.6);
      g.add(cup);
      var cream = B.sphere(0.4, U.pick([0xffb3cd, 0xa8dcff, 0x9ee9cd]), { seg: 14, unique: true });
      cream.position.set(-3 + c * 2, 0.62, -2.6);
      g.add(cream);
      var ch = B.sphere(0.12, 0xd83a4a, { seg: 10 });
      ch.position.set(-3 + c * 2, 0.98, -2.6);
      g.add(ch);
    }
  }

  function buildRainbow(g) {
    var rcols = [0xff8fb1, 0xffc36b, 0xffe97a, 0x9ee493, 0x8fd4ff, 0xc9a7ff];
    for (var rb = 0; rb < 6; rb++) {
      var band = B.torus(4.4 + rb * 0.34, 0.18, rcols[rb], { unique: true, opacity: 0.85 });
      band.material.transparent = true;
      band.position.set(0, -0.4, -5);
      g.add(band);
    }
    for (var c = 0; c < 7; c++) {
      var cl = B.cloud(U.rand(0.8, 1.4));
      cl.position.set(U.rand(-6, 6), U.rand(1.5, 4), U.rand(-6, -3));
      g.add(cl);
    }
  }

  /* ---------- フレーム（がめん の まわり の かざり） ---------- */

  function makeFrame(id) {
    if (frameGroup) { GAME.root.remove(frameGroup); GAME.disposeNode(frameGroup); frameGroup = null; }
    var def = FRAMES.filter(function (f) { return f.id === id; })[0];
    if (!def || !def.color) return;
    frameGroup = new THREE.Group();
    var n = 22;
    for (var i = 0; i < n; i++) {
      var a = i / n * U.TAU;
      var m;
      if (id === 'heart') m = B.heart(0.16, U.shade(def.color, (i % 3) * 0.12), { unique: true });
      else if (id === 'star') m = B.star(0.13, U.shade(def.color, (i % 3) * 0.12), { unique: true });
      else if (id === 'flower') { m = B.flower(U.shade(def.color, (i % 3) * 0.12)); m.scale.setScalar(1.5); }
      else m = WARDROBE.bowMesh(U.shade(def.color, (i % 3) * 0.1), 0.09);
      m.position.set(Math.cos(a) * 2.9, 1.15 + Math.sin(a) * 1.85, 1.0);
      m.rotation.z = a;
      frameGroup.add(m);
    }
    GAME.root.add(frameGroup);
  }

  /* ---------- せってい ---------- */

  function setBack(id) {
    curBack = id;
    if (backGroup) { GAME.root.remove(backGroup); GAME.disposeNode(backGroup); }
    backGroup = new THREE.Group();
    var def = BACKS.filter(function (b) { return b.id === id; })[0];
    GAME.setSky(def.sky[0], def.sky[1]);
    if (id === 'night') {
      GAME.lights.hemi.intensity = 0.3;
      GAME.lights.amb.color.setHex(0xaab0ff);
      GAME.lights.amb.intensity = 0.3;
    } else {
      GAME.lights.hemi.intensity = 0.48;
      GAME.lights.amb.color.setHex(0xffffff);
      GAME.lights.amb.intensity = 0.2;
    }
    var floor = B.ground(30, id === 'night' ? 0x5a5a8a : (id === 'beach' ? 0xffe9c0 : 0xd8e8c8));
    backGroup.add(floor);
    def.build(backGroup);
    GAME.root.add(backGroup);
  }

  function setPose(id) {
    curPose = id;
    var def = POSES.filter(function (p) { return p.id === id; })[0];
    GAME.char.setPose(id);
    GAME.char.setExpr(def.expr);
    SND.play('pose');
    FX.sparkleAt(GAME.char.headPos(), 6);
  }

  function shoot() {
    shots++;
    SND.play('camera');
    flashing = 1;
    UI.big('📸');
    GAME.char.setExpr(U.pick(['happy', 'wink', 'star', 'love']));
    FX.celebrate(GAME.char.headPos());
    FX.burst('sparkle', GAME.char.headPos(), 20);
    SAVE.data.photos = (SAVE.data.photos || 0) + 1;
    SAVE.touch();
    UI.banner('パシャッ！ ' + shots + 'まいめ');
    if (shots >= 3) {
      U.after(1.6, function () {
        GAME.finish('photo', {
          title: 'すてきな しゃしん！',
          stars: 3,
          msg: shots + 'まい とれたよ！'
        });
      });
    }
  }

  /* ---------- パネル ---------- */

  var TABS = [
    { id: 'back', icon: '🖼️', label: 'はいけい' },
    { id: 'pose', icon: '💃', label: 'ポーズ' },
    { id: 'frame', icon: '🎀', label: 'フレーム' },
    { id: 'pet', icon: '🐶', label: 'ペット' }
  ];
  var tab = 'back';

  function showPanel() {
    if (tab === 'back') {
      UI.setTask('はいけい を えらぼう！', '🖼️');
      UI.setRow(0, BACKS.map(function (b) {
        return { id: b.id, icon: b.icon, label: b.name, sel: curBack === b.id };
      }), function (id) { setBack(id); UI.setSelected(0, id); SND.play('swish'); });
    } else if (tab === 'pose') {
      UI.setTask('ポーズ を えらぼう！', '💃');
      UI.setRow(0, POSES.map(function (p) {
        return { id: p.id, icon: p.icon, label: p.name, sel: curPose === p.id };
      }), function (id) { setPose(id); UI.setSelected(0, id); });
    } else if (tab === 'frame') {
      UI.setTask('フレーム を えらぼう！', '🎀');
      UI.setRow(0, FRAMES.map(function (f) {
        return { id: f.id, icon: f.icon, label: f.name, sel: curFrame === f.id };
      }), function (id) { curFrame = id; makeFrame(id); UI.setSelected(0, id); SND.play('sparkle'); });
    } else {
      UI.setTask('おともだち を よぼう！', '🐶');
      UI.setRow(0, Object.keys(ANIMAL_TYPES).map(function (k) {
        return { id: k, icon: ANIMAL_TYPES[k].icon, label: ANIMAL_TYPES[k].name };
      }), function (id) {
        GAME.pet.group.visible = true;
        SND.play('tap');
        swapPet(id);
      });
    }
  }

  var petSwap = null;
  function swapPet(type) {
    if (petSwap) { GAME.root.remove(petSwap.group); GAME.disposeNode(petSwap.group); }
    petSwap = new Animal(type, { scale: 1.2 });
    petSwap.group.position.set(0.85, 0, 0.45);
    petSwap.group.rotation.y = -0.4;
    GAME.root.add(petSwap.group);
    petSwap.play('happy'); petSwap.cry();
    GAME.pet.group.visible = false;
    FX.burst('heart', petSwap.group.position.clone().setY(0.7), 10);
  }

  /* ---------- とうろく ---------- */

  GAME.register('photo', {
    name: 'しゃしんスタジオ', icon: '📷', bgm: 'fashion',

    build: function (root) {
      backGroup = null; frameGroup = null; petSwap = null;
      setBack(curBack);
      makeFrame(curFrame);
      GAME.char.group.position.set(-0.15, 0, 0.5);
      GAME.char.group.rotation.y = 0;
      GAME.char.setPose(curPose);
      GAME.pet.group.visible = false;
    },

    enter: function () {
      shots = 0; tab = 'back'; flashing = 0;
      GAME.setView({ target: [0, 1.0, 0.3], dist: 3.6, height: 0.7, fov: 40 }, true);
      UI.setTabs(TABS, function (id) { tab = id; showPanel(); }, tab);
      showPanel();
      UI.setRow(2, [{ id: 'shoot', icon: '📸', label: 'とるよ！' }], function () { shoot(); });
      GAME.setHint(function () { UI.hintOnChip(2, 'shoot'); });
      U.after(0.6, function () { SND.say('すきな はいけいと ポーズで しゃしんを とろう'); });
    },

    exit: function () { backGroup = null; frameGroup = null; petSwap = null; },

    update: function (dt, t) {
      if (petSwap) petSwap.update(dt, t);
      if (frameGroup) {
        frameGroup.children.forEach(function (m, i) {
          m.rotation.z = Math.sin(t * 1.1 + i) * 0.3;
          m.position.z = 1.0 + Math.sin(t * 1.5 + i) * 0.05;
        });
      }
      if (flashing > 0) {
        flashing -= dt * 2.4;
        GAME.lights.amb.intensity = 0.2 + Math.max(0, flashing) * 1.6;
      }
      if (Math.random() < dt * 1.4) {
        FX.rain('sparkle', { x: 0, y: 3, z: 0, w: 4, d: 2, h: 0.5 }, 1, { size: 0.16, life: 3 });
      }
    }
  });
})();
