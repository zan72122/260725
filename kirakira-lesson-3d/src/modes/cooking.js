/* ============================================================
 * cooking.js — おりょうり（おてつだい）
 *   やさい を きって、なべ で まぜて、おさら に もりつけよう！
 * ============================================================ */
(function () {
  'use strict';

  var VEGGIES = [
    { id: 'carrot', name: 'にんじん', icon: '🥕', hex: 0xff8a3a },
    { id: 'potato', name: 'じゃがいも', icon: '🥔', hex: 0xe0c48a },
    { id: 'onion', name: 'たまねぎ', icon: '🧅', hex: 0xf5e6c8 },
    { id: 'tomato', name: 'トマト', icon: '🍅', hex: 0xf04a4a },
    { id: 'corn', name: 'とうもろこし', icon: '🌽', hex: 0xffd23a },
    { id: 'broc', name: 'ブロッコリー', icon: '🥦', hex: 0x6fbf5f }
  ];

  var DISHES = [
    { id: 'curry', name: 'カレー', icon: '🍛', hex: 0xc4762a },
    { id: 'soup', name: 'スープ', icon: '🍲', hex: 0xffd9a0 },
    { id: 'salad', name: 'サラダ', icon: '🥗', hex: 0x9ee493 },
    { id: 'omu', name: 'オムライス', icon: '🍳', hex: 0xffd95c }
  ];

  var board = null, pot = null, potSoup = null, plateObj = null, stove = null;
  var currentVeg = null, vegMesh = null, pieces = [];
  var phase = 'chop', chopIdx = 0, chops = 0, stirAmount = 0, lastAngle = null;
  var chosen = [], dish = null;
  var steam = 0;

  var CHOP_COUNT = 3;
  var VEG_TOTAL = 3;

  /* ---------- やさい の 3Dモデル ---------- */

  function makeVeg(def) {
    var g = new THREE.Group();
    if (def.id === 'carrot') {
      var c = B.cone(0.09, 0.44, def.hex, { unique: true, seg: 12 });
      c.rotation.z = Math.PI / 2;
      g.add(c);
      var lf = B.sphere(0.06, 0x6fbf5f, { seg: 8, unique: true });
      lf.position.x = -0.24; g.add(lf);
    } else if (def.id === 'broc') {
      var st = B.cyl(0.05, 0.06, 0.18, 0xd8e8b0, { seg: 8 });
      st.position.y = -0.06; g.add(st);
      for (var i = 0; i < 5; i++) {
        var b = B.sphere(0.09, def.hex, { seg: 10, unique: true });
        b.position.set(U.rand(-0.09, 0.09), 0.1 + U.rand(-0.03, 0.05), U.rand(-0.09, 0.09));
        g.add(b);
      }
    } else if (def.id === 'corn') {
      var cc = B.capsule(0.08, 0.24, def.hex, { unique: true });
      cc.rotation.z = Math.PI / 2;
      g.add(cc);
      for (var k = -1; k <= 1; k += 2) {
        var hu = B.petal(0.22, 0x8ed97e, { unique: true });
        hu.position.set(k * 0.14, 0, 0.02);
        hu.rotation.set(0, 0, k > 0 ? -1.5 : 1.5);
        g.add(hu);
      }
    } else {
      var s = B.sphere(0.13, def.hex, { seg: 14, unique: true });
      if (def.id === 'potato') s.scale.set(1.25, 0.9, 1);
      if (def.id === 'onion') s.scale.set(1, 1.1, 1);
      g.add(s);
      if (def.id === 'tomato') {
        var top = B.sphere(0.05, 0x6fbf5f, { seg: 8, unique: true });
        top.scale.y = 0.4; top.position.y = 0.12;
        g.add(top);
      }
    }
    return g;
  }

  /* ---------- キッチン ---------- */

  function build(root) {
    GAME.setSky(0xffd8d8, 0xfff2ee);
    GAME.lights.hemi.intensity = 0.5;

    root.add(PROPS.room({
      w: 8.5, d: 7, h: 3.2, wall: 0xfff2ee, floor: 0xe8d0c0,
      floorPattern: 'check', floorAccent: 0xfff2ee, floorRepeat: 8, trim: 0xf58a8a
    }));

    // ちょうりだい
    var counter = PROPS.counter(4.0, 0.9, 0.9, 0xffe0dc, { top: 0xfff8f5 });
    counter.position.set(0, 0, -0.55);
    root.add(counter);

    // まないた
    board = new THREE.Group();
    var bd = B.roundBox(0.9, 0.06, 0.6, 0.05, 0xe8c49a, { unique: true });
    board.add(bd);
    board.position.set(-0.95, 0.97, -0.4);
    root.add(board);

    // コンロ と なべ
    stove = B.roundBox(1.0, 0.07, 0.8, 0.05, 0x8a8a9c, { unique: true });
    stove.position.set(0.85, 0.95, -0.5);
    root.add(stove);
    for (var f = 0; f < 6; f++) {
      var fl = B.circle(0.16, 0xff8a3a, { unique: true, basic: true });
      fl.rotation.x = -Math.PI / 2;
      fl.position.set(0.85, 0.99, -0.5);
      root.add(fl);
      break;
    }

    pot = new THREE.Group();
    var pbody = B.cyl(0.32, 0.28, 0.32, 0xdfe4ea, { unique: true, seg: 20, open: true });
    pbody.material.side = THREE.DoubleSide;
    pbody.position.y = 0.16;
    pot.add(pbody);
    var pbottom = B.circle(0.28, 0xb8bec8, { unique: true });
    pbottom.rotation.x = -Math.PI / 2;
    pbottom.position.y = 0.01;
    pot.add(pbottom);
    var prim = B.torus(0.32, 0.028, 0xc7c7d0, { unique: true });
    prim.position.y = 0.32; prim.rotation.x = Math.PI / 2;
    pot.add(prim);
    for (var h = -1; h <= 1; h += 2) {
      var hd = B.torus(0.07, 0.022, 0x8a8a9c, { unique: true });
      hd.position.set(h * 0.36, 0.24, 0);
      hd.rotation.y = Math.PI / 2;
      pot.add(hd);
    }
    potSoup = B.cyl(0.28, 0.26, 0.06, 0xffd9a0, { unique: true, seg: 20 });
    potSoup.position.y = 0.1;
    potSoup.visible = false;
    pot.add(potSoup);
    pot.position.set(0.85, 1.0, -0.5);
    root.add(pot);

    // おさら
    plateObj = PROPS.plate(0.32, 0xffffff);
    plateObj.position.set(2.1, 0.95, -0.35);
    root.add(plateObj);

    // たな
    var shelf = PROPS.shelf(1.8, 1.3, 0.45, 0xffe0dc);
    shelf.position.set(-3.0, 1.2, -3.1);
    root.add(shelf);
    var icons = ['🥫', '🧂', '🫙', '🍯', '🥣', '🍶'];
    for (var s2 = 0; s2 < icons.length; s2++) {
      var e = B.emojiPlate(icons[s2], 0.22);
      e.position.set(-3.5 + (s2 % 3) * 0.45, 1.32 + Math.floor(s2 / 3) * 0.45, -2.88);
      root.add(e);
    }

    var fridge = PROPS.counter(0.9, 0.7, 1.8, 0xf0f4f8, { top: 0xdfe4ea });
    fridge.position.set(3.1, 0, -2.3);
    root.add(fridge);

    var win = PROPS.window(1.4, 1.0, { sky: 0xcfeeff });
    win.position.set(0.2, 2.2, -3.46);
    root.add(win);

    root.add(B.at(PROPS.plant(1.0), -3.4, 0, 0.9));

    GAME.char.group.position.set(-1.8, 0, -1.5);
    GAME.char.group.rotation.y = 0.5;
    GAME.char.setPose('work');
    GAME.char.setExpr('smile');
    GAME.pet.group.visible = true;
    GAME.pet.group.position.set(2.4, 0, 1.3);
    GAME.pet.follow = null;
  }

  /* ---------- きる ---------- */

  function spawnVeg() {
    if (vegMesh) { board.remove(vegMesh); GAME.disposeNode(vegMesh); }
    currentVeg = U.pick(VEGGIES);
    chosen.push(currentVeg);
    vegMesh = makeVeg(currentVeg);
    vegMesh.position.set(0, 0.16, 0);
    board.add(vegMesh);
    chops = 0;
    vegMesh.scale.setScalar(0.01);
    U.tween({
      from: 0.01, to: 1, dur: 0.35, ease: 'outBack',
      onUpdate: function (v) { if (vegMesh) vegMesh.scale.setScalar(v); }
    });
    GAME.addTap(vegMesh, function () { chop(); }, { pop: false });
    UI.setTask(currentVeg.name + ' を トントン きろう！', '🔪');
  }

  function chop() {
    if (phase !== 'chop' || !vegMesh) return;
    chops++;
    SND.play('chop');
    var wp = vegMesh.getWorldPosition(new THREE.Vector3());
    FX.burst('white', wp, 6, { up: 1.4, spread: 0.7, gravity: -4, size: 0.1, life: 0.5, color: currentVeg.hex });
    GAME.char.play('clap', 0.3);
    vegMesh.scale.setScalar(1 - chops * 0.2);
    UI.setSteps(VEG_TOTAL * CHOP_COUNT, chopIdx * CHOP_COUNT + chops);

    if (chops >= CHOP_COUNT) {
      // きりみ に なって なべ へ とぶ
      board.remove(vegMesh);
      var pieces3 = [];
      for (var i = 0; i < 4; i++) {
        var pc = B.sphere(0.06, currentVeg.hex, { seg: 8, unique: true });
        pc.scale.y = 0.6;
        pc.position.copy(wp);
        GAME.root.add(pc);
        pieces3.push(pc);
        (function (m, k) {
          var from = m.position.clone();
          var to = pot.position.clone().add(new THREE.Vector3(U.rand(-0.12, 0.12), 0.16, U.rand(-0.12, 0.12)));
          U.tween({
            from: 0, to: 1, dur: 0.55, delay: k * 0.06, ease: 'inOutQuad',
            onUpdate: function (v) {
              m.position.lerpVectors(from, to, v);
              m.position.y += Math.sin(v * Math.PI) * 0.45;
              m.rotation.x += 0.2; m.rotation.z += 0.15;
            },
            onDone: function () {
              SND.play('bloop');
              FX.burst('water', to, 4, { up: 1.2, size: 0.1, life: 0.5 });
            }
          });
        })(pc, i);
      }
      pieces = pieces.concat(pieces3);
      vegMesh = null;
      chopIdx++;
      potSoup.visible = true;
      potSoup.scale.y = 0.5 + chopIdx * 0.6;
      SND.play('correct');
      if (chopIdx >= VEG_TOTAL) U.after(0.9, startStir);
      else U.after(0.7, spawnVeg);
    }
  }

  /* ---------- まぜる ---------- */

  function startStir() {
    phase = 'stir';
    stirAmount = 0;
    UI.setTask('なべ を ぐるぐる まぜよう！', '🥄');
    UI.setSteps(10, 0);
    SND.say('なべを ぐるぐる まぜてね');
    UI.setRow(0, [{ id: 'stir', icon: '🥄', label: 'まぜる', big: true }], function () { addStir(0.12); });
    GAME.setHint(function () { GAME.hintObject(pot); });
    GAME.setView({ target: [0.85, 1.05, -0.5], dist: 2.6, height: 1.8, fov: 40 });
  }

  function addStir(amt) {
    if (phase !== 'stir') return;
    stirAmount += amt;
    if (Math.random() < 0.4) SND.play('stir');
    var pp = pot.position.clone().add(new THREE.Vector3(0, 0.35, 0));
    FX.burst('water', pp, 2, { up: 0.8, spread: 0.3, gravity: -2, size: 0.1, life: 0.5 });
    UI.setSteps(10, Math.floor(stirAmount * 10));
    if (stirAmount >= 1) {
      phase = 'plate';
      SND.play('ding');
      UI.banner('いい におい〜！');
      U.after(0.9, startPlate);
    }
  }

  /* ---------- もりつけ ---------- */

  function startPlate() {
    UI.setRow(0, []);
    UI.clearSteps();
    UI.setTask('なにを つくる？ えらんでね！', '🍽️');
    GAME.setView({ target: [1.0, 1.0, -0.45], dist: 3.6, height: 2.2, fov: 42 });
    UI.setRow(0, DISHES.map(function (d) {
      return { id: d.id, icon: d.icon, label: d.name, color: d.hex };
    }), function (id) {
      dish = DISHES.filter(function (d) { return d.id === id; })[0];
      serve();
    });
    GAME.setHint(function () { UI.hintOnChip(0, U.pick(DISHES).id); });
  }

  function serve() {
    phase = 'done';
    UI.setRow(0, []);
    UI.setTask('できあがり〜！', '🎉');
    // おさら に もりつけ
    var food = B.sphere(0.24, dish.hex, { seg: 16, unique: true });
    food.scale.y = 0.5;
    food.position.set(2.1, 1.02, -0.35);
    GAME.root.add(food);
    var em = B.emojiPlate(dish.icon, 0.34);
    em.position.set(2.1, 1.12, -0.32);
    em.rotation.x = -Math.PI / 2.6;
    GAME.root.add(em);
    for (var i = 0; i < chosen.length; i++) {
      var bit = B.sphere(0.05, chosen[i].hex, { seg: 8, unique: true });
      bit.position.set(2.1 + Math.cos(i * 2.1) * 0.13, 1.12, -0.35 + Math.sin(i * 2.1) * 0.13);
      GAME.root.add(bit);
    }
    for (var p = 0; p < pieces.length; p++) GAME.root.remove(pieces[p]);
    pieces = [];

    SND.play('ding'); SND.play('fanfare');
    GAME.char.play('cheer');
    GAME.char.setExpr('happy');
    GAME.pet.play('happy'); GAME.pet.cry();
    FX.celebrate(new THREE.Vector3(2.1, 1.3, -0.35));
    GAME.setView({ target: [2.05, 1.15, -0.35], dist: 1.9, height: 0.7, fov: 38 });
    U.after(2.2, function () {
      GAME.finish('cooking', {
        title: 'おいしそう！',
        stars: 3,
        msg: dish.name + ' が できたよ！'
      });
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('cooking', {
    name: 'おりょうり', icon: '🍳', bgm: 'work',

    build: build,

    enter: function () {
      phase = 'chop'; chopIdx = 0; chops = 0; stirAmount = 0;
      chosen = []; pieces = []; vegMesh = null; dish = null; lastAngle = null;
      GAME.setView({ target: [0.5, 1.0, -0.5], dist: 3.5, height: 2.05, fov: 42 }, true);
      UI.setSteps(VEG_TOTAL * CHOP_COUNT, 0);
      U.after(0.7, function () {
        UI.banner('おりょうり しよう！');
        SND.say('やさいを トントン きってね');
        spawnVeg();
        UI.setRow(0, [{ id: 'knife', icon: '🔪', label: 'きる', big: true }], function () { chop(); });
        GAME.setHint(function () { if (vegMesh) GAME.hintObject(vegMesh); });
      });
    },

    exit: function () { vegMesh = null; pieces = []; pot = null; },

    // ぐるぐる まぜる（ゆびを まわす）
    onMove: function (x, y, down) {
      if (phase !== 'stir' || !down) return;
      var p = GAME.project(pot.position.clone().add(new THREE.Vector3(0, 0.35, 0)));
      var ang = Math.atan2(y - p.y, x - p.x);
      if (lastAngle != null) {
        var d = ang - lastAngle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        addStir(Math.abs(d) / (Math.PI * 2) * 0.9);
      }
      lastAngle = ang;
    },
    onUp: function () { lastAngle = null; },

    update: function (dt, t) {
      steam += dt;
      if (potSoup && potSoup.visible) {
        potSoup.rotation.y += dt * (phase === 'stir' ? 3 : 0.5);
        if (steam > 0.5) {
          steam = 0;
          FX.burst('white', pot.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 2,
            { up: 0.7, spread: 0.2, gravity: 0.3, size: 0.16, life: 1.4, color: 0xffffff });
        }
      }
      if (vegMesh) vegMesh.rotation.y = Math.sin(t * 1.5) * 0.2;
    }
  });
})();
