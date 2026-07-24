/* ============================================================
 * laundry.js — おせんたく（おてつだい）
 *   ふく を せんたくき に いれて、まわして、ほして、たたもう！
 * ============================================================ */
(function () {
  'use strict';

  var washer = null, drum = null, line = null, basket = null, basket2 = null;
  var clothes = [], hung = [], pegs = [];
  var phase = 'load';
  var loaded = 0, hungN = 0, folded = 0;
  var drumSpin = 0, spinning = false;

  var SHAPES = [
    { id: 'shirt', icon: '👕', hex: 0xff9dbf },
    { id: 'skirt', icon: '👗', hex: 0x8fd4ff },
    { id: 'sock', icon: '🧦', hex: 0xffd95c },
    { id: 'pants', icon: '👖', hex: 0x9ee493 },
    { id: 'towel', icon: '🧣', hex: 0xc09dff },
    { id: 'hat', icon: '🧢', hex: 0xffa96b }
  ];

  /* ---------- ふく の 3Dモデル ---------- */

  function makeCloth(def) {
    var g = new THREE.Group();
    var body = B.roundBox(0.34, 0.34, 0.05, 0.06, def.hex, { unique: true });
    body.material = B.fabric(def.hex, U.pick(['dots', 'stripe', 'check', 'heart', 'star']), 0xffffff, { repeat: 2 });
    body.position.y = 0.2;
    g.add(body);
    var icon = B.emojiPlate(def.icon, 0.24);
    icon.position.set(0, 0.2, 0.04);
    g.add(icon);
    g.userData.def = def;
    return g;
  }

  /* ---------- ばしょ ---------- */

  function build(root) {
    GAME.setSky(0xbfe0ff, 0xeaf4ff);
    GAME.lights.hemi.intensity = 0.52;

    root.add(PROPS.room({
      w: 8.5, d: 7, h: 3.2, wall: 0xeaf4ff, floor: 0xd7dfe8,
      floorPattern: 'check', floorAccent: 0xeef4fa, floorRepeat: 8, trim: 0x8fa8e0
    }));

    // せんたくき
    washer = new THREE.Group();
    var bodyW = B.roundBox(1.0, 1.2, 0.95, 0.1, 0xffffff, { unique: true });
    bodyW.position.y = 0.6;
    washer.add(bodyW);
    var doorRing = B.torus(0.32, 0.06, 0x8fa8e0, { unique: true });
    doorRing.position.set(0, 0.62, 0.49);
    washer.add(doorRing);
    drum = new THREE.Group();
    var glass = B.circle(0.3, 0xcfe8ff, { unique: true });
    glass.position.set(0, 0, 0.005);
    drum.add(glass);
    for (var i = 0; i < 3; i++) {
      var fin = B.box(0.06, 0.42, 0.02, 0xffffff);
      fin.rotation.z = i * 2.1;
      drum.add(fin);
    }
    drum.position.set(0, 0.62, 0.48);
    washer.add(drum);
    var panel = B.roundBox(0.7, 0.16, 0.04, 0.04, 0xa8dcff, { unique: true });
    panel.position.set(0, 1.08, 0.49);
    washer.add(panel);
    var knob = B.cyl(0.07, 0.07, 0.06, 0xff9dbf, { seg: 12 });
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0.24, 1.08, 0.53);
    washer.add(knob);
    washer.position.set(-2.2, 0, -1.9);
    washer.rotation.y = 0.35;
    root.add(washer);

    // ものほし
    line = new THREE.Group();
    for (var s = -1; s <= 1; s += 2) {
      var pole = B.cyl(0.05, 0.06, 1.9, 0xdfe4ea, { seg: 10 });
      pole.position.set(s * 1.75, 0.95, 0);
      line.add(pole);
      var foot = B.cyl(0.18, 0.2, 0.06, 0xc7c7d0, { seg: 12 });
      foot.position.set(s * 1.75, 0.03, 0);
      line.add(foot);
    }
    var rope = B.cyl(0.018, 0.018, 3.5, 0xfff0c2, { seg: 8 });
    rope.rotation.z = Math.PI / 2;
    rope.position.set(0, 1.85, 0);
    line.add(rope);
    pegs = [];
    for (var p = 0; p < 6; p++) {
      var peg = B.box(0.07, 0.13, 0.05, U.pick([0xff9dbf, 0xffd95c, 0x8fd4ff, 0x9ee493]));
      peg.position.set(-1.35 + p * 0.54, 1.85, 0);
      line.add(peg);
      pegs.push({ mesh: peg, x: -1.35 + p * 0.54, used: false });
    }
    line.position.set(1.6, 0, -1.2);
    root.add(line);

    // かご
    basket = PROPS.basket(0.46, 0.38, 0xd9a066);
    basket.position.set(-0.5, 0, 1.1);
    root.add(basket);

    basket2 = PROPS.basket(0.42, 0.34, 0xffc0d6);
    basket2.position.set(1.5, 0, 1.5);
    root.add(basket2);

    var win = PROPS.window(1.5, 1.1, { sky: 0xbfe9ff });
    win.position.set(1.6, 2.2, -3.46);
    root.add(win);

    root.add(B.at(PROPS.plant(1.1), 3.3, 0, 0.4));

    // よごれた ふく
    clothes = [];
    for (var c = 0; c < 6; c++) {
      var cl = makeCloth(SHAPES[c % SHAPES.length]);
      var a = U.rand(-0.8, 0.8);
      cl.position.set(-0.5 + Math.cos(a) * U.rand(0.5, 1.1), 0, 1.1 + Math.sin(a) * U.rand(0.4, 0.9));
      cl.rotation.y = U.rand(-0.6, 0.6);
      root.add(cl);
      clothes.push(cl);
    }

    GAME.char.group.position.set(-0.1, 0, 0.1);
    GAME.char.group.rotation.y = 0.2;
    GAME.char.setPose('work');
    GAME.char.setExpr('smile');
    GAME.pet.group.visible = true;
    GAME.pet.group.position.set(2.6, 0, 1.2);
    GAME.pet.follow = null;
  }

  /* ---------- フェーズ ---------- */

  function washerMouth() {
    washer.updateMatrixWorld();
    return drum.getWorldPosition(new THREE.Vector3());
  }

  function startLoad() {
    phase = 'load';
    UI.setTask('ふく を せんたくき に いれよう！', '🧺');
    UI.setSteps(6, 0);
    SND.say('ふくを せんたくきに いれてね');
    for (var i = 0; i < clothes.length; i++) {
      (function (cl) {
        GAME.addDrag(cl, {
          plane: 0, lift: 0.4,
          onGrab: function () { SND.play('grab'); },
          onDrag: function (o, p) { o.position.set(p.x, 0.4, p.z); },
          onDrop: function (o, p) {
            var w = washerMouth();
            var d = Math.sqrt(Math.pow(p.x - washer.position.x, 2) + Math.pow(p.z - washer.position.z, 2));
            if (d < 1.3) {
              SND.play('place'); SND.play('correct');
              FX.burst('bubble', w, 8);
              var idx = GAME.draggables.indexOf(o);
              if (idx >= 0) GAME.draggables.splice(idx, 1);
              var par = o.parent;
              U.tween({
                from: 0, to: 1, dur: 0.35,
                onUpdate: function (v) {
                  o.position.lerpVectors(p, w, v);
                  o.scale.setScalar(1 - v * 0.85);
                },
                onDone: function () { par.remove(o); }
              });
              loaded++;
              UI.setSteps(6, loaded);
              GAME.char.play('clap', 0.4);
              if (loaded >= clothes.length) U.after(0.7, startWash);
            } else {
              o.position.y = 0; SND.play('bloop');
            }
          }
        });
      })(clothes[i]);
    }
    GAME.setHint(function () {
      for (var i = 0; i < clothes.length; i++) if (clothes[i].parent) { GAME.hintObject(clothes[i]); return; }
    });
  }

  function startWash() {
    phase = 'wash';
    UI.setTask('スイッチ を おそう！', '🔘');
    UI.setRow(0, [{ id: 'go', icon: '🔘', label: 'スタート', big: true }], function () { doWash(); });
    GAME.addTap(washer, function () { doWash(); });
    GAME.setHint(function () { UI.hintOnChip(0, 'go'); });
  }

  function doWash() {
    if (phase !== 'wash') return;
    phase = 'washing';
    UI.setRow(0, []);
    UI.setTask('ぐるぐる… まってね', '💧');
    spinning = true;
    SND.play('washer');
    GAME.char.play('bounce');
    var w = washerMouth();
    var n = 0;
    var iv = setInterval(function () {
      FX.burst('bubble', w, 4, { up: 1.4, spread: 0.6, size: 0.16, life: 1.2 });
      n++;
      if (n > 8) clearInterval(iv);
    }, 220);
    U.after(2.6, function () {
      spinning = false;
      SND.play('ding');
      UI.banner('きれい に なった！');
      U.after(0.8, startHang);
    });
  }

  function startHang() {
    phase = 'hang';
    UI.setTask('ふく を ほして！', '☀️');
    UI.setSteps(6, 0);
    SND.say('ふくを ほしてね');
    hung = [];
    hungN = 0;
    for (var i = 0; i < 6; i++) {
      var cl = makeCloth(SHAPES[i % SHAPES.length]);
      cl.position.set(-0.5 + U.rand(-0.5, 0.5), 0, 1.1 + U.rand(-0.4, 0.4));
      GAME.root.add(cl);
      hung.push(cl);
      (function (c) {
        GAME.addDrag(c, {
          plane: 0, lift: 0.4,
          onGrab: function () { SND.play('grab'); },
          onDrag: function (o, p) { o.position.set(p.x, 0.4, p.z); },
          onDrop: function (o, p) {
            var free = null;
            for (var k = 0; k < pegs.length; k++) if (!pegs[k].used) { free = pegs[k]; break; }
            var d = Math.abs(p.z - line.position.z) + Math.abs(p.x - line.position.x) * 0.4;
            if (free && d < 1.9) {
              free.used = true;
              SND.play('place'); SND.play('correct');
              var idx = GAME.draggables.indexOf(o);
              if (idx >= 0) GAME.draggables.splice(idx, 1);
              var tx = line.position.x + free.x, ty = 1.62, tz = line.position.z;
              U.tween({
                from: 0, to: 1, dur: 0.4, ease: 'outBack',
                onUpdate: function (v) {
                  o.position.set(U.lerp(p.x, tx, v), U.lerp(0.4, ty, v), U.lerp(p.z, tz, v));
                }
              });
              o.userData.onLine = true;
              hungN++;
              UI.setSteps(6, hungN);
              FX.burst('sparkle', new THREE.Vector3(tx, ty + 0.2, tz), 8);
              GAME.char.play('clap', 0.4);
              if (hungN >= 6) U.after(1.0, finish);
            } else {
              o.position.y = 0; SND.play('bloop');
            }
          }
        });
      })(cl);
    }
    GAME.setHint(function () {
      for (var i = 0; i < hung.length; i++) if (!hung[i].userData.onLine) { GAME.hintObject(hung[i]); return; }
    });
  }

  function finish() {
    UI.clearSteps();
    UI.setTask('おひさま で ふかふか！', '☀️');
    GAME.char.play('cheer');
    GAME.char.setExpr('happy');
    GAME.pet.play('happy'); GAME.pet.cry();
    SND.play('fanfare');
    FX.celebrate(GAME.char.headPos());
    FX.rain('sparkle', { x: 1.6, y: 3, z: -1, w: 4, d: 2, h: 0.6 }, 24, { size: 0.2, life: 3 });
    GAME.setView({ target: [0.8, 1.2, -0.6], dist: 4.6, height: 1.6, fov: 44 });
    U.after(2.0, function () {
      GAME.finish('laundry', {
        title: 'おせんたく かんりょう！',
        stars: 3,
        msg: 'いい におい〜！'
      });
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('laundry', {
    name: 'おせんたく', icon: '🧺', bgm: 'work',

    build: build,

    enter: function () {
      phase = 'load'; loaded = 0; hungN = 0; drumSpin = 0; spinning = false;
      GAME.setView({ target: [0, 0.9, -0.4], dist: 5.0, height: 2.4, fov: 44 }, true);
      U.after(0.7, function () {
        UI.banner('おせんたく しよう！');
        startLoad();
      });
    },

    exit: function () { clothes = []; hung = []; pegs = []; washer = null; },

    update: function (dt, t) {
      if (spinning) { drumSpin += dt * 9; if (drum) drum.rotation.z = drumSpin; }
      for (var i = 0; i < hung.length; i++) {
        if (hung[i].userData.onLine) hung[i].rotation.z = Math.sin(t * 1.6 + i) * 0.14;
      }
      for (var c = 0; c < clothes.length; c++) {
        if (clothes[c].parent) clothes[c].rotation.z = Math.sin(t * 1.1 + c) * 0.05;
      }
    }
  });
})();
