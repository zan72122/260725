/* ============================================================
 * clean.js — おそうじ（おてつだい）
 *   ゆびで こすって よごれ を ピカピカ に！ おもちゃ も かたづけよう。
 * ============================================================ */
(function () {
  'use strict';

  var dirts = [], toys = [], box = null, sparkleTimer = 0;
  var phase = 'dirt';
  var cleaned = 0, tidied = 0, total = 0;
  var rubbing = false, lastRub = null;

  var TOY_ICONS = ['🧸', '🚗', '⚽', '🪀', '🧩', '🎨', '📚', '🎪'];

  /* ---------- おへや ---------- */

  function build(root) {
    GAME.setSky(0xd9f0f5, 0xf0fbff);
    GAME.lights.hemi.intensity = 0.5;

    root.add(PROPS.room({
      w: 8, d: 7, h: 3.2, wall: 0xeaf7fb, floor: 0xd8c3a5,
      floorPattern: 'stripe', floorAccent: 0xc9b294, floorRepeat: 9, trim: 0x74c4d4
    }));

    // かぐ
    var bed = new THREE.Group();
    var mat = B.roundBox(1.2, 0.28, 1.9, 0.1, 0xffc0d6, { unique: true });
    mat.position.y = 0.44;
    bed.add(mat);
    var frame = B.roundBox(1.3, 0.3, 2.0, 0.08, 0xd9a066, { unique: true });
    frame.position.y = 0.16;
    bed.add(frame);
    var pillow = B.roundBox(0.85, 0.16, 0.4, 0.08, 0xffffff, { unique: true });
    pillow.position.set(0, 0.62, -0.66);
    bed.add(pillow);
    bed.position.set(-2.5, 0, -1.6);
    bed.rotation.y = 0.3;
    root.add(bed);

    var desk = PROPS.counter(1.3, 0.6, 0.7, 0xffe3c9, { top: 0xfff6ec });
    desk.position.set(2.6, 0, -2.2);
    desk.rotation.y = -0.4;
    root.add(desk);

    root.add(B.at(PROPS.plant(1.2), 3.3, 0, 0.8));
    var win = PROPS.window(1.6, 1.2, { sky: 0xcfeeff });
    win.position.set(0.6, 1.9, -3.46);
    root.add(win);

    // おもちゃばこ
    box = new THREE.Group();
    var bb = B.roundBox(1.0, 0.55, 0.7, 0.08, 0xffd95c, { unique: true });
    bb.position.y = 0.28;
    box.add(bb);
    var lip = B.torus(0.5, 0.04, 0xffa96b, { unique: true });
    lip.position.y = 0.56; lip.rotation.x = Math.PI / 2;
    lip.scale.set(1, 0.72, 1);
    box.add(lip);
    var lbl = B.emojiPlate('🧺', 0.3);
    lbl.position.set(0, 0.3, 0.36);
    box.add(lbl);
    box.position.set(2.2, 0, 1.4);
    root.add(box);

    // よごれ
    dirts = [];
    for (var i = 0; i < 8; i++) {
      var d = new THREE.Group();
      var n = U.randInt(3, 5);
      for (var k = 0; k < n; k++) {
        var s = B.sphere(U.rand(0.11, 0.2), U.pick([0xa08868, 0x8f7a5c, 0xb59a78]), { seg: 10, unique: true });
        s.scale.y = 0.16;
        s.position.set(U.rand(-0.2, 0.2), 0.02, U.rand(-0.2, 0.2));
        d.add(s);
      }
      var a = U.rand(0, U.TAU), r = U.rand(0.6, 2.6);
      d.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r - 0.2);
      d.userData.hp = 3;
      root.add(d);
      dirts.push(d);
      GAME.addTap(d, function (o) { rub(o); }, { pop: false });
    }

    // ちらかった おもちゃ
    toys = [];
    for (var t = 0; t < 6; t++) {
      var g = new THREE.Group();
      var pl = B.emojiPlate(TOY_ICONS[t % TOY_ICONS.length], 0.42);
      pl.position.y = 0.21;
      g.add(pl);
      var base = B.circle(0.2, 0xffffff, { unique: true, opacity: 0.001 });
      base.rotation.x = -Math.PI / 2;
      base.position.y = 0.01;
      base.material.transparent = true;
      g.add(base);
      var a2 = U.rand(0, U.TAU), r2 = U.rand(1.0, 2.8);
      g.position.set(Math.cos(a2) * r2, 0, Math.sin(a2) * r2 - 0.2);
      g.userData.home = g.position.clone();
      root.add(g);
      toys.push(g);
    }

    total = dirts.length + toys.length;

    GAME.char.group.position.set(-0.4, 0, 1.9);
    GAME.char.group.rotation.y = 0.1;
    GAME.char.setPose('work');
    GAME.char.setExpr('smile');
    GAME.pet.group.visible = true;
    GAME.pet.group.position.set(-1.9, 0, 1.6);
    GAME.pet.follow = null;
  }

  /* ---------- そうじ ---------- */

  function rub(d) {
    if (!d || !d.parent) return;
    d.userData.hp--;
    SND.play('scrub');
    var p = d.getWorldPosition(new THREE.Vector3());
    FX.burst('dust', p, 5, { up: 1.1, spread: 0.8, gravity: -2.2, size: 0.14, life: 0.7 });
    if (d.userData.hp <= 0) {
      SND.play('sparkle');
      FX.burst('sparkle', p, 12, { up: 1.5 });
      FX.ring(p, 0xffffff, { to: 1.6 });
      GAME.removeTap(d);
      var idx = dirts.indexOf(d);
      if (idx >= 0) dirts.splice(idx, 1);
      var parent = d.parent;
      U.tween({
        from: 1, to: 0, dur: 0.3,
        onUpdate: function (v) { d.scale.setScalar(v); },
        onDone: function () { parent.remove(d); }
      });
      cleaned++;
      GAME.char.play('clap', 0.5);
      updateProgress();
      if (dirts.length === 0) startTidy();
    } else {
      d.scale.setScalar(0.5 + d.userData.hp * 0.18);
    }
  }

  function updateProgress() {
    UI.setSteps(total, cleaned + tidied);
  }

  function startTidy() {
    phase = 'toys';
    UI.setTask('おもちゃ を はこ に いれよう！', '🧸');
    SND.say('おもちゃを はこに いれてね');
    UI.banner('つぎは おかたづけ！');
    for (var i = 0; i < toys.length; i++) {
      (function (toy) {
        GAME.addDrag(toy, {
          plane: 0,
          lift: 0.35,
          onGrab: function () { SND.play('grab'); },
          onDrag: function (o, p) {
            o.position.x = p.x; o.position.z = p.z; o.position.y = 0.35;
          },
          onDrop: function (o, p) {
            var d = Math.sqrt(Math.pow(p.x - box.position.x, 2) + Math.pow(p.z - box.position.z, 2));
            if (d < 1.0) {
              SND.play('place'); SND.play('correct');
              FX.burst('star', box.position.clone().setY(0.7), 10);
              var idx = GAME.draggables.indexOf(o);
              if (idx >= 0) GAME.draggables.splice(idx, 1);
              var par = o.parent;
              U.tween({
                from: 0, to: 1, dur: 0.35, ease: 'outCubic',
                onUpdate: function (v) {
                  o.position.x = U.lerp(p.x, box.position.x, v);
                  o.position.z = U.lerp(p.z, box.position.z, v);
                  o.position.y = 0.35 + Math.sin(v * Math.PI) * 0.4 - v * 0.35;
                  o.scale.setScalar(1 - v * 0.7);
                },
                onDone: function () { par.remove(o); }
              });
              tidied++;
              GAME.char.play('clap', 0.5);
              updateProgress();
              if (tidied >= toys.length) U.after(0.8, finish);
            } else {
              o.position.y = 0;
              SND.play('bloop');
            }
          }
        });
      })(toys[i]);
    }
    GAME.setHint(function () { if (toys.length) GAME.hintObject(toys[toys.length - 1 - tidied] || toys[0]); });
  }

  function finish() {
    UI.clearSteps();
    UI.setTask('ピカピカ に なったね！', '✨');
    GAME.char.play('cheer');
    GAME.char.setExpr('happy');
    GAME.pet.play('happy'); GAME.pet.cry();
    SND.play('fanfare');
    FX.celebrate(GAME.char.headPos());
    FX.rain('sparkle', { x: 0, y: 3, z: 0, w: 6, d: 6, h: 1 }, 30, { size: 0.2, life: 3 });
    GAME.setView({ target: [0, 1.0, 0], dist: 4.6, height: 2.2, fov: 44 });
    U.after(2.0, function () {
      GAME.finish('clean', {
        title: 'おそうじ かんぺき！',
        stars: 3,
        msg: 'おへや が ピカピカ！'
      });
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('clean', {
    name: 'おそうじ', icon: '🧹', bgm: 'work',

    build: build,

    enter: function () {
      phase = 'dirt'; cleaned = 0; tidied = 0;
      GAME.setView({ target: [0, 0.6, -0.2], dist: 4.8, height: 3.0, fov: 44 }, true);
      updateProgress();
      U.after(0.7, function () {
        UI.banner('おへや を そうじ しよう！');
        UI.setTask('よごれ を ゴシゴシ タッチ！', '🧽');
        SND.say('よごれを ゴシゴシ しよう');
        UI.setRow(0, [{ id: 'sponge', icon: '🧽', label: 'スポンジ', big: true }], function () {
          if (dirts.length) rub(dirts[0]);
        });
        GAME.setHint(function () { if (dirts.length) GAME.hintObject(dirts[0]); });
      });
    },

    exit: function () { dirts = []; toys = []; box = null; },

    // ゆびで なぞって こする
    onMove: function (x, y, down) {
      if (!down || phase !== 'dirt') return;
      var hit = GAME.pick(x, y, dirts, true);
      if (hit) {
        var root = hit.object;
        while (root && dirts.indexOf(root) < 0) root = root.parent;
        if (root && root !== lastRub) {
          lastRub = root;
          rub(root);
          U.after(0.25, function () { lastRub = null; });
        }
      }
    },

    update: function (dt, t) {
      sparkleTimer += dt;
      if (sparkleTimer > 0.9) {
        sparkleTimer = 0;
        if (cleaned > 0) {
          FX.burst('sparkle', new THREE.Vector3(U.rand(-2, 2), 0.1, U.rand(-2, 2)), 2,
            { up: 0.8, spread: 0.3, gravity: -0.8, size: 0.12, life: 0.9 });
        }
      }
      for (var i = 0; i < toys.length; i++) {
        if (toys[i].parent) toys[i].rotation.y = Math.sin(t * 1.2 + i) * 0.3;
      }
    }
  });
})();
