/* ============================================================
 * dressup.js — おしゃれルーム（きせかえ）
 *   かみがた・ふく・くつ・アクセ・もよう・いろ を じゆうに えらぶ。
 * ============================================================ */
(function () {
  'use strict';

  var podium = null, mirrorObj = null, rack = null;
  var spin = 0, spinVel = 0, autoSpin = true;
  var dragging = false, lastX = 0;
  var curTab = 'hair';
  var changes = 0;
  var state = {};

  var TABS = [
    { id: 'hair', icon: '💇', label: 'かみ' },
    { id: 'top', icon: '👕', label: 'ふく' },
    { id: 'bottom', icon: '👗', label: 'スカート' },
    { id: 'shoes', icon: '👟', label: 'くつ' },
    { id: 'acc', icon: '🎀', label: 'アクセ' },
    { id: 'pattern', icon: '✨', label: 'もよう' },
    { id: 'eye', icon: '👀', label: 'ひとみ' }
  ];

  /* ---------- おへや を つくる ---------- */

  function build(root) {
    GAME.setSky(0xffd9ec, 0xfff0f7);
    GAME.lights.hemi.intensity = 0.5;
    GAME.lights.dir.intensity = 0.5;
    GAME.lights.dir.position.set(2.5, 5, 4);

    var room = PROPS.room({
      w: 8, d: 7, h: 3.4, wall: 0xfff0f7, floor: 0xf3dcd0,
      floorPattern: 'check', floorAccent: 0xffe8dc, floorRepeat: 6, trim: 0xffc0d6
    });
    root.add(room);

    root.add(B.at(PROPS.rug(1.5, 0xffc0d6, 'heart'), 0, 0, 0));

    // ステージ
    podium = new THREE.Group();
    var p1 = B.cyl(1.05, 1.15, 0.13, 0xffffff, { seg: 30 });
    p1.position.y = 0.065;
    podium.add(p1);
    var p2 = B.cyl(0.98, 1.02, 0.05, 0xffd9ec, { seg: 30 });
    p2.position.y = 0.14;
    podium.add(p2);
    root.add(podium);

    // かがみ
    mirrorObj = PROPS.mirror(1.5, 2.3, 0xffd44d);
    mirrorObj.position.set(-3.0, 1.5, -2.9);
    mirrorObj.rotation.y = 0.5;
    root.add(mirrorObj);
    GAME.addTap(mirrorObj, function () {
      SND.play('sparkle');
      FX.burst('sparkle', new THREE.Vector3(-2.5, 1.7, -2.2), 12);
      UI.toast('かわいい！💖');
      GAME.char.setExpr('love');
      GAME.char.play('heartHands');
      U.after(1.8, function () { GAME.char.setExpr('smile'); });
    });

    // ようふく ラック
    rack = new THREE.Group();
    var bar = B.cyl(0.035, 0.035, 2.6, 0xd9c8ff, { seg: 10 });
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 1.65;
    rack.add(bar);
    for (var s = -1; s <= 1; s += 2) {
      var pole = B.cyl(0.04, 0.05, 1.65, 0xd9c8ff, { seg: 10 });
      pole.position.set(s * 1.28, 0.82, 0);
      rack.add(pole);
      var foot = B.cyl(0.16, 0.18, 0.05, 0xc4aeff, { seg: 12 });
      foot.position.set(s * 1.28, 0.025, 0);
      rack.add(foot);
    }
    var hangCols = [0xff9dbf, 0xffd95c, 0x8fd4ff, 0xc09dff, 0x8ed97e, 0xffa96b, 0xfdfdfd];
    var hangPat = ['dots', 'stripe', 'heart', 'check', 'star', 'flower', 'plain'];
    for (var i = 0; i < 7; i++) {
      var cl = new THREE.Group();
      var hook = B.torus(0.05, 0.012, 0xdfe4ea, { unique: true });
      hook.position.y = 1.6;
      cl.add(hook);
      var dress = B.cone(0.19, 0.5, hangCols[i], { unique: true, seg: 14 });
      dress.material = B.fabric(hangCols[i], hangPat[i], 0xffffff, { repeat: 2 });
      dress.position.y = 1.22;
      cl.add(dress);
      var shoulder = B.box(0.28, 0.06, 0.1, hangCols[i], { unique: true });
      shoulder.position.y = 1.48;
      cl.add(shoulder);
      cl.position.set(-1.05 + i * 0.35, 0, 0);
      cl.userData.base = cl.position.x;
      rack.add(cl);
    }
    rack.position.set(2.7, 0, -2.2);
    rack.rotation.y = -0.5;
    root.add(rack);
    GAME.addTap(rack, function () { randomOutfit(); });

    // ドレッサー
    var dresser = PROPS.counter(1.2, 0.5, 0.8, 0xffe3c9, { top: 0xfff6ec });
    dresser.position.set(-2.9, 0, 0.9);
    dresser.rotation.y = 0.7;
    root.add(dresser);
    var perfume = B.sphere(0.08, 0xff9dbf, { seg: 12, shiny: true });
    perfume.position.set(-2.75, 0.95, 0.75);
    root.add(perfume);
    var box = B.roundBox(0.3, 0.16, 0.24, 0.05, 0xc09dff, { unique: true });
    box.position.set(-3.1, 0.92, 1.0);
    root.add(box);

    // ぬいぐるみ
    var teddy = new Animal('bear', { scale: 0.75 });
    teddy.group.position.set(2.6, 0, 1.6);
    teddy.group.rotation.y = -1.0;
    root.add(teddy.group);
    GAME.addTap(teddy.group, function () {
      teddy.play('happy'); teddy.cry();
      FX.burst('heart', teddy.group.position.clone().setY(0.9), 8);
    });
    state.teddy = teddy;

    root.add(B.at(PROPS.plant(1.2), 3.2, 0, 1.2));

    var win = PROPS.window(1.6, 1.2, { sky: 0xcfeeff });
    win.position.set(1.2, 1.9, -3.46);
    root.add(win);

    for (var b = 0; b < 3; b++) {
      var bal = B.balloon([0xff9dbf, 0xffd95c, 0x8fd4ff][b]);
      bal.position.set(-1.7 + b * 0.5, 1.5 + b * 0.2, -2.9);
      root.add(bal);
      GAME.addTap(bal, function (o, p) {
        SND.play('pop'); FX.burst('confetti', p, 12);
      });
    }

    GAME.char.group.position.set(0, 0.17, 0);
    GAME.char.setPose('stand');
    GAME.char.setExpr('smile');
  }

  /* ---------- パネル ---------- */

  function itemKey(slot, id) { return slot + ':' + id; }

  function isUnlocked(slot, id) {
    return WARDROBE.isFree(slot, id) || SAVE.own(itemKey(slot, id));
  }

  function buildRow() {
    var o = SAVE.data.outfit;

    if (curTab === 'pattern') {
      UI.setRow(0, WARDROBE.PATTERNS.map(function (p) {
        return { id: p.id, icon: p.icon, label: p.name, sel: o.topPattern === p.id };
      }), function (id) {
        o.topPattern = id;
        SND.play('bloop');
        apply();
        UI.setSelected(0, id);
      });
      UI.setRow(1, WARDROBE.PATTERNS.map(function (p) {
        return { id: 'b_' + p.id, icon: p.icon, label: p.name, sel: o.bottomPattern === p.id };
      }), function (id) {
        o.bottomPattern = id.slice(2);
        SND.play('bloop');
        apply();
        UI.setSelected(1, id);
      });
      UI.setTask('ふく の もよう を えらぼう', '✨');
      return;
    }

    if (curTab === 'eye') {
      UI.setRow(0, []);
      UI.setSwatches(1, WARDROBE.EYE_COLORS, o.eye, function (k) {
        o.eye = k; SND.play('bloop'); apply();
      });
      UI.setTask('ひとみ の いろ を えらぼう', '👀');
      return;
    }

    var map = { hair: WARDROBE.HAIR, top: WARDROBE.TOP, bottom: WARDROBE.BOTTOM, shoes: WARDROBE.SHOES, acc: WARDROBE.ACC }[curTab];
    var items = Object.keys(map).map(function (k) {
      var it = map[k];
      var unlocked = isUnlocked(curTab, k);
      return {
        id: k, icon: it.icon, label: it.name,
        sel: o[curTab] === k,
        locked: !unlocked,
        price: unlocked ? 0 : it.price
      };
    });
    UI.setRow(0, items, function (id) {
      var it = map[id];
      if (!isUnlocked(curTab, id)) {
        if (SAVE.data.stars >= it.price) {
          SAVE.spend(it.price);
          SAVE.buy(itemKey(curTab, id));
          SAVE.save();
          UI.updateCounters();
          SND.play('unlock');
          UI.banner('かった！ ' + it.name);
          FX.celebrate(GAME.char.headPos());
          SAVE.giveSticker('x4');
        } else {
          SND.play('wrong');
          UI.toast('スター が ' + (it.price - SAVE.data.stars) + 'こ たりないよ');
          return;
        }
      }
      o[curTab] = id;
      SND.play('bloop');
      apply();
      buildRow();
    });

    var slotDef = { hair: 'hairColor', top: 'topColor', bottom: 'bottomColor', shoes: 'shoesColor', acc: 'accColor' }[curTab];
    var colors = curTab === 'hair' ? WARDROBE.HAIR_COLORS : WARDROBE.COLORS;
    UI.setSwatches(1, colors, o[slotDef], function (k) {
      o[slotDef] = k;
      SND.play('bloop');
      apply();
    });

    var labels = { hair: 'かみがた', top: 'トップス', bottom: 'ボトムス', shoes: 'くつ', acc: 'アクセサリー' };
    UI.setTask(labels[curTab] + ' を えらぼう', TABS.filter(function (t) { return t.id === curTab; })[0].icon);
  }

  function apply() {
    changes++;
    SAVE.touch();
    GAME.char.applyOutfit(SAVE.data.outfit);
    FX.sparkleAt(new THREE.Vector3(0, 1.15, 0.3), 6);
    if (changes % 6 === 0) {
      GAME.char.play('spin');
      GAME.char.setExpr('happy');
      U.after(1.2, function () { GAME.char.setExpr('smile'); });
    }
  }

  function randomOutfit() {
    var r = WARDROBE.randomOutfit(true);
    for (var k in r) SAVE.data.outfit[k] = r[k];
    SND.play('magic');
    apply();
    buildRow();
    GAME.char.play('twirl');
    GAME.char.setExpr('star');
    FX.celebrate(GAME.char.headPos());
    UI.banner('シャッフル コーデ！');
    U.after(1.8, function () { GAME.char.setExpr('smile'); });
  }

  function done() {
    SAVE.save();
    var stars = changes >= 8 ? 3 : (changes >= 4 ? 2 : 1);
    GAME.char.play('curtsy');
    GAME.finish('dressup', {
      title: 'すてきな コーデ！',
      stars: stars,
      msg: 'きょうの ひまりちゃん、かわいい！'
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('dressup', {
    name: 'おしゃれルーム', icon: '👗', bgm: 'fashion',

    build: build,

    enter: function () {
      changes = 0;
      curTab = 'hair';
      spin = 0; spinVel = 0; autoSpin = true;
      GAME.setView({ target: [0, 0.72, 0], dist: 4.5, height: 0.8, fov: 36 }, true);

      UI.setTabs(TABS, function (id) {
        curTab = id;
        buildRow();
      }, curTab);

      buildRow();

      UI.setRow(2, [
        { id: 'random', icon: '🎲', label: 'シャッフル' },
        { id: 'pose', icon: '💃', label: 'ポーズ' },
        { id: 'pet', icon: '🐶', label: 'ペット' },
        { id: 'done', icon: '✅', label: 'きめた！' }
      ], function (id) {
        if (id === 'random') randomOutfit();
        else if (id === 'pose') {
          GAME.char.setPose(U.pick(['pose1', 'pose2', 'pose3', 'pose4', 'shy', 'cheer']));
          GAME.char.setExpr(U.pick(['happy', 'wink', 'star', 'proud']));
          SND.play('pose');
          FX.sparkleAt(GAME.char.headPos(), 8);
          U.after(2.4, function () { GAME.char.setPose('stand'); GAME.char.setExpr('smile'); });
        } else if (id === 'pet') {
          GAME.pet.group.visible = !GAME.pet.group.visible;
          if (GAME.pet.group.visible) {
            GAME.pet.group.position.set(1.0, 0, 1.0);
            GAME.pet.follow = null;
            GAME.pet.play('happy'); GAME.pet.cry();
          }
        } else if (id === 'done') done();
      });

      GAME.setHint(function () { UI.hintOnChip(2, 'done'); });
      U.after(0.6, function () { SND.say('すきな ふくを えらんでね'); });
    },

    exit: function () { SAVE.save(); },

    onDown: function (x, y) {
      dragging = true; lastX = x; autoSpin = false;
      return false;
    },
    onMove: function (x, y, down) {
      if (!down || !dragging) return;
      spinVel += (x - lastX) * 0.0009;
      lastX = x;
    },
    onUp: function () {
      dragging = false;
      U.after(3.5, function () { autoSpin = true; });
    },

    update: function (dt, t) {
      if (autoSpin) spinVel = U.damp(spinVel, 0.0055, 1.2, dt);
      spin += spinVel * 60 * dt;
      spinVel *= 0.93;
      GAME.char.group.rotation.y = spin;
      if (podium) podium.rotation.y = spin;
      if (state.teddy) state.teddy.update(dt, t);
      if (rack) {
        for (var i = 0; i < rack.children.length; i++) {
          var c = rack.children[i];
          if (c.userData.base != null) c.rotation.z = Math.sin(t * 1.4 + i) * 0.05;
        }
      }
      if (Math.random() < dt * 0.9) {
        FX.rain('sparkle', { x: 0, y: 3, z: 0, w: 5, d: 4, h: 0.5 }, 1, { size: 0.16, life: 3.4, gravity: -0.1 });
      }
    }
  });
})();
