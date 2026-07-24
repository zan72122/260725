/* ============================================================
 * room.js — おへや デコ（じぶん の おへや を つくろう）
 *   かぐ を えらんで、すきな ばしょ に おいて、ドラッグ で いどう。
 * ============================================================ */
(function () {
  'use strict';

  var FURNITURE = {
    bed: {
      name: 'ベッド', icon: '🛏️', build: function (c) {
        var g = new THREE.Group();
        var frame = B.roundBox(1.1, 0.28, 1.7, 0.08, 0xd9a066, { unique: true });
        frame.position.y = 0.14; g.add(frame);
        var mat = B.roundBox(1.0, 0.24, 1.6, 0.08, c, { unique: true });
        mat.material = B.fabric(c, 'dots', 0xffffff, { repeat: 2 });
        mat.position.y = 0.38; g.add(mat);
        var pil = B.roundBox(0.7, 0.15, 0.34, 0.07, 0xffffff, { unique: true });
        pil.position.set(0, 0.55, -0.58); g.add(pil);
        var head = B.roundBox(1.1, 0.6, 0.1, 0.08, 0xd9a066, { unique: true });
        head.position.set(0, 0.4, -0.82); g.add(head);
        return g;
      }
    },
    sofa: {
      name: 'ソファ', icon: '🛋️', build: function (c) {
        var g = new THREE.Group();
        var seat = B.roundBox(1.3, 0.32, 0.7, 0.1, c, { unique: true });
        seat.position.y = 0.32; g.add(seat);
        var back = B.roundBox(1.3, 0.5, 0.18, 0.08, U.shade(c, -0.1), { unique: true });
        back.position.set(0, 0.6, -0.3); g.add(back);
        for (var s = -1; s <= 1; s += 2) {
          var arm = B.roundBox(0.18, 0.34, 0.7, 0.07, U.shade(c, -0.06), { unique: true });
          arm.position.set(s * 0.62, 0.44, 0); g.add(arm);
        }
        for (var i = 0; i < 4; i++) {
          var leg = B.cyl(0.045, 0.05, 0.16, 0x9b6b46, { seg: 8 });
          leg.position.set((i % 2 ? 1 : -1) * 0.55, 0.08, (i < 2 ? 1 : -1) * 0.26);
          g.add(leg);
        }
        return g;
      }
    },
    table: {
      name: 'テーブル', icon: '🪑', build: function (c) {
        return PROPS.table(0.45, 0.5, c);
      }
    },
    shelf: {
      name: 'たな', icon: '🗄️', build: function (c) {
        var g = PROPS.shelf(0.9, 1.1, 0.4, c);
        var icons = ['🧸', '📚', '🪆', '🎁'];
        for (var i = 0; i < 4; i++) {
          var e = B.emojiPlate(icons[i], 0.22);
          e.position.set(-0.24 + (i % 2) * 0.42, 0.22 + Math.floor(i / 2) * 0.37, 0.06);
          g.add(e);
        }
        return g;
      }
    },
    plant: {
      name: 'かんようしょくぶつ', icon: '🪴', build: function () { return PROPS.plant(1.3); }
    },
    lamp: {
      name: 'ランプ', icon: '💡', build: function (c) {
        var g = new THREE.Group();
        var pole = B.cyl(0.035, 0.045, 1.1, 0xdfe4ea, { seg: 8 });
        pole.position.y = 0.55; g.add(pole);
        var base = B.cyl(0.18, 0.2, 0.05, 0xc7c7d0, { seg: 14 });
        base.position.y = 0.025; g.add(base);
        var shade = B.cyl(0.14, 0.24, 0.28, c, { unique: true, seg: 16 });
        shade.position.y = 1.2; g.add(shade);
        var bulb = B.sphere(0.09, 0xfff2b8, { seg: 10, emissive: 0x776600 });
        bulb.position.y = 1.1; g.add(bulb);
        return g;
      }
    },
    rug: {
      name: 'ラグ', icon: '🟣', build: function (c) {
        var g = new THREE.Group();
        g.add(PROPS.rug(0.7, c, 'heart'));
        return g;
      }
    },
    teddy: {
      name: 'ぬいぐるみ', icon: '🧸', build: function () {
        var a = new Animal(U.pick(['bear', 'rabbit', 'cat', 'panda']), { scale: 0.8 });
        return a.group;
      }
    },
    piano: {
      name: 'ピアノ', icon: '🎹', build: function (c) {
        var g = new THREE.Group();
        var body = B.roundBox(1.0, 0.7, 0.42, 0.06, U.shade(c, -0.5), { unique: true });
        body.position.y = 0.5; g.add(body);
        var keys = B.roundBox(0.94, 0.08, 0.2, 0.02, 0xffffff, { unique: true });
        keys.position.set(0, 0.72, 0.16); g.add(keys);
        for (var k = 0; k < 7; k++) {
          var bk = B.box(0.04, 0.05, 0.12, 0x2b2333);
          bk.position.set(-0.36 + k * 0.12, 0.77, 0.12); g.add(bk);
        }
        for (var l = -1; l <= 1; l += 2) {
          var leg = B.box(0.08, 0.5, 0.08, U.shade(c, -0.5));
          leg.position.set(l * 0.42, 0.25, 0); g.add(leg);
        }
        return g;
      }
    },
    balloon: {
      name: 'ふうせん', icon: '🎈', build: function (c) {
        var g = new THREE.Group();
        for (var i = 0; i < 3; i++) {
          var b = B.balloon(U.shade(c, i * 0.15));
          b.position.set(U.rand(-0.2, 0.2), 0.9 + i * 0.12, U.rand(-0.15, 0.15));
          g.add(b);
        }
        return g;
      }
    },
    picture: {
      name: 'かべかけ', icon: '🖼️', build: function (c) {
        var g = new THREE.Group();
        var fr = B.roundBox(0.6, 0.5, 0.06, 0.04, c, { unique: true });
        fr.position.y = 1.4; g.add(fr);
        var pic = B.plane(0.48, 0.38, 0xfff0f7, { unique: true });
        pic.position.set(0, 1.4, 0.04); g.add(pic);
        var e = B.emojiPlate(U.pick(['🌈', '🌸', '🐱', '⭐', '🎂']), 0.3);
        e.position.set(0, 1.4, 0.05); g.add(e);
        return g;
      }
    },
    cake: {
      name: 'ケーキだい', icon: '🎂', build: function (c) {
        var g = new THREE.Group();
        var t = PROPS.table(0.3, 0.42, c);
        g.add(t);
        var cake = B.cyl(0.2, 0.22, 0.16, 0xfff0d0, { unique: true, seg: 20 });
        cake.position.y = 0.52; g.add(cake);
        var cream = PROPS.creamRing(0.22, 0xffb3cd, 10);
        cream.position.y = 0.6; g.add(cream);
        var st = B.star(0.06, 0xffd44d, { unique: true });
        st.position.y = 0.66; g.add(st);
        return g;
      }
    }
  };

  var placed = [], selKey = null, selColor = 'pink', ghost = null;
  var floorPlane = null, wallColor = 0xfff0f7, floorColor = 0xf3dcd0;
  var mode = 'place';

  var WALLS = [
    { id: 'pink', name: 'ピンク', hex: 0xfff0f7 },
    { id: 'mint', name: 'ミント', hex: 0xe6faf2 },
    { id: 'sky', name: 'そらいろ', hex: 0xe6f4ff },
    { id: 'cream', name: 'クリーム', hex: 0xfff6e2 },
    { id: 'lav', name: 'ラベンダー', hex: 0xf2ecff }
  ];

  var roomGroup = null;

  /* ---------- おへや ---------- */

  function buildRoom(root) {
    if (roomGroup) { root.remove(roomGroup); GAME.disposeNode(roomGroup); }
    roomGroup = PROPS.room({
      w: 7.5, d: 6.5, h: 3.0, wall: wallColor, floor: floorColor,
      floorPattern: 'check', floorAccent: U.shade(floorColor, 0.12), floorRepeat: 6, trim: 0xffffff
    });
    root.add(roomGroup);
    var win = PROPS.window(1.5, 1.1, { sky: 0xcfeeff });
    win.position.set(1.6, 1.9, -3.21);
    roomGroup.add(win);
    var door = PROPS.door(0xd9a066);
    door.position.set(-2.4, 0, -3.2);
    roomGroup.add(door);
  }

  function build(root) {
    GAME.setSky(0xffe6f2, 0xfff6fa);
    GAME.lights.hemi.intensity = 0.5;
    buildRoom(root);

    GAME.char.group.position.set(-2.5, 0, 2.0);
    GAME.char.group.rotation.y = Math.PI * 0.82;
    GAME.char.setPose('stand');
    GAME.char.setExpr('smile');
    GAME.pet.group.visible = true;
    GAME.pet.group.position.set(2.6, 0, 2.0);
    GAME.pet.follow = null;

    // ほぞん された かぐ を もどす
    var saved = SAVE.data.room;
    if (saved && saved.length) {
      for (var i = 0; i < saved.length; i++) {
        var it = saved[i];
        if (!FURNITURE[it.k]) continue;
        addFurniture(it.k, it.c, it.x, it.z, it.r, true);
      }
    }
  }

  /* ---------- かぐ ---------- */

  function addFurniture(key, colorKey, x, z, rot, silent) {
    var def = FURNITURE[key];
    if (!def) return null;
    var hex = (WARDROBE.COLORS[colorKey] || WARDROBE.COLORS.pink).hex;
    var g = def.build(hex);
    g.position.set(x, 0, z);
    g.rotation.y = rot || 0;
    g.userData.k = key;
    g.userData.c = colorKey;
    GAME.root.add(g);
    placed.push(g);

    GAME.addDrag(g, {
      plane: 0,
      onGrab: function () { SND.play('grab'); },
      onDrag: function (o, p) {
        o.position.x = U.clamp(p.x, -3.1, 3.1);
        o.position.z = U.clamp(p.z, -2.8, 2.4);
      },
      onDrop: function (o) { SND.play('place'); saveRoom(); }
    });
    GAME.addTap(g, function (o) {
      if (mode === 'rotate') { o.rotation.y += Math.PI / 4; SND.play('swish'); saveRoom(); }
      else if (mode === 'remove') { removeFurniture(o); }
      else { o.rotation.y += Math.PI / 6; SND.play('tap'); saveRoom(); }
    }, { pop: false });

    if (!silent) {
      g.scale.setScalar(0.01);
      U.tween({
        from: 0.01, to: 1, dur: 0.45, ease: 'outBack',
        onUpdate: function (v) { g.scale.setScalar(v); }
      });
      SND.play('place');
      FX.burst('star', new THREE.Vector3(x, 0.5, z), 10);
    }
    return g;
  }

  function removeFurniture(o) {
    var i = placed.indexOf(o);
    if (i >= 0) placed.splice(i, 1);
    GAME.removeTap(o);
    var d = GAME.draggables.indexOf(o);
    if (d >= 0) GAME.draggables.splice(d, 1);
    SND.play('pop');
    FX.burst('dust', o.position.clone().setY(0.4), 8);
    var par = o.parent;
    U.tween({
      from: 1, to: 0, dur: 0.3,
      onUpdate: function (v) { o.scale.setScalar(v); },
      onDone: function () { par.remove(o); saveRoom(); }
    });
  }

  function saveRoom() {
    SAVE.data.room = placed.map(function (o) {
      return { k: o.userData.k, c: o.userData.c, x: +o.position.x.toFixed(2), z: +o.position.z.toFixed(2), r: +o.rotation.y.toFixed(2) };
    });
    SAVE.touch();
  }

  /* ---------- パネル ---------- */

  var TABS = [
    { id: 'place', icon: '🪑', label: 'おく' },
    { id: 'wall', icon: '🎨', label: 'かべ' },
    { id: 'rotate', icon: '🔄', label: 'まわす' },
    { id: 'remove', icon: '🗑️', label: 'けす' }
  ];

  function showPanel() {
    if (mode === 'place') {
      UI.setTask('かぐ を えらんで、ゆかを タッチ！', '🪑');
      UI.setRow(0, Object.keys(FURNITURE).map(function (k) {
        return { id: k, icon: FURNITURE[k].icon, label: FURNITURE[k].name, sel: selKey === k };
      }), function (id) {
        selKey = id;
        SND.play('tap');
        UI.setSelected(0, id);
        UI.toast('ゆか を タッチ して おいてね');
      });
      UI.setSwatches(1, WARDROBE.COLORS, selColor, function (k) { selColor = k; SND.play('bloop'); });
    } else if (mode === 'wall') {
      UI.setTask('かべ の いろ を えらぼう！', '🎨');
      UI.setRow(0, WALLS.map(function (w) {
        return { id: w.id, icon: '🧱', label: w.name, color: w.hex };
      }), function (id) {
        wallColor = WALLS.filter(function (w) { return w.id === id; })[0].hex;
        buildRoom(GAME.root);
        SND.play('magic');
        FX.burst('sparkle', new THREE.Vector3(0, 1.5, -2), 14);
      });
      UI.setSwatches(1, WARDROBE.COLORS, null, function (k, c) {
        floorColor = c.hex;
        buildRoom(GAME.root);
        SND.play('magic');
      });
    } else if (mode === 'rotate') {
      UI.setTask('かぐ を タッチ して まわそう！', '🔄');
      UI.setRow(0, []); UI.setRow(1, []);
    } else {
      UI.setTask('けしたい かぐ を タッチ！', '🗑️');
      UI.setRow(0, []); UI.setRow(1, []);
    }
  }

  function finish() {
    saveRoom();
    SAVE.save();
    GAME.char.play('cheer');
    GAME.char.setExpr('happy');
    FX.celebrate(GAME.char.headPos());
    GAME.finish('room', {
      title: 'すてきな おへや！',
      stars: placed.length >= 6 ? 3 : (placed.length >= 3 ? 2 : 1),
      msg: 'かぐ を ' + placed.length + 'こ おいたよ！'
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('room', {
    name: 'おへやデコ', icon: '🛋️', bgm: 'calm',

    build: build,

    enter: function () {
      mode = 'place'; selKey = 'bed'; selColor = 'pink';
      GAME.setView({ target: [0, 0.9, -0.4], dist: 5.4, height: 3.2, fov: 46 }, true);
      UI.setTabs(TABS, function (id) { mode = id; showPanel(); }, mode);
      showPanel();
      UI.setRow(2, [{ id: 'done', icon: '✅', label: 'かんせい！' }], function () { finish(); });
      GAME.setHint(function () { UI.hintOnChip(0, selKey); });
      U.after(0.6, function () { SND.say('すきな かぐを おいて、おへやを つくろう'); });
    },

    exit: function () { placed = []; roomGroup = null; SAVE.save(); },

    onMiss: function (x, y) {
      if (mode !== 'place' || !selKey) return;
      var p = GAME.rayY(x, y, 0);
      if (!p) return;
      if (Math.abs(p.x) > 3.2 || p.z < -3.0 || p.z > 2.6) return;
      addFurniture(selKey, selColor, U.clamp(p.x, -3.1, 3.1), U.clamp(p.z, -2.8, 2.4), 0);
      GAME.char.play('clap', 0.5);
    },

    update: function (dt, t) {
      for (var i = 0; i < placed.length; i++) {
        if (placed[i].userData.k === 'balloon') placed[i].position.y = Math.sin(t * 1.4 + i) * 0.06;
      }
    }
  });
})();
