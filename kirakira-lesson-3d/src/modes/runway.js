/* ============================================================
 * runway.js — ファッションショー（ランウェイ）
 *   あるいて、ポーズ を きめて、かんきゃく を よろこばせよう！
 * ============================================================ */
(function () {
  'use strict';

  var stage = null, lights = [], audience = [], cameras = [], judges = [];
  var phase = 'intro';     // intro → walk → pose → walk → ... → finale
  var walkZ = -7.5;
  var poseSpots = [-3.6, -1.2, 1.2];
  var spotIndex = 0;
  var score = 0, posesDone = 0;
  var poseTimer = 0;
  var appl = 0;
  var beatFlash = 0;

  var POSES = [
    { id: 'pose1', icon: '💃', label: 'ポーズ1' },
    { id: 'pose2', icon: '🤩', label: 'ポーズ2' },
    { id: 'pose3', icon: '🙌', label: 'ポーズ3' },
    { id: 'pose4', icon: '✨', label: 'ポーズ4' }
  ];

  /* ---------- ステージ ---------- */

  function build(root) {
    GAME.setSky(0x3a2f52, 0x6b4a7a);
    GAME.lights.hemi.intensity = 0.34;
    GAME.lights.dir.intensity = 0.62;
    GAME.lights.dir.position.set(0, 8, 6);
    GAME.lights.amb.intensity = 0.22;
    GAME.lights.amb.color.setHex(0xffd9ec);

    // ゆか
    var floor = B.ground(40, 0x2e2740);
    root.add(floor);

    // ランウェイ
    stage = new THREE.Group();
    var deck = B.roundBox(2.4, 0.24, 12, 0.1, 0xfff0f7, { unique: true });
    deck.position.set(0, 0.12, -2.5);
    stage.add(deck);
    var glow = B.roundBox(2.2, 0.04, 11.7, 0.08, 0xffd9ec, { unique: true });
    glow.position.set(0, 0.25, -2.5);
    stage.add(glow);
    // ふちの ライト
    for (var i = 0; i < 22; i++) {
      for (var s = -1; s <= 1; s += 2) {
        var b = B.sphere(0.055, 0xfff2b8, { seg: 8, emissive: 0x776600 });
        b.position.set(s * 1.16, 0.27, -8.2 + i * 0.55);
        stage.add(b);
        lights.push(b);
      }
    }
    root.add(stage);

    // うしろの アーチ
    var arch = new THREE.Group();
    for (var a = 0; a < 3; a++) {
      var t = B.torus(1.9 + a * 0.28, 0.07, [0xff6fa5, 0xffd44d, 0xc9a7ff][a], { unique: true });
      t.position.set(0, 0.2, 0);
      arch.add(t);
    }
    arch.position.set(0, 0.5, -8.6);
    root.add(arch);

    var logo = B.textPlate('ファッションショー', 3.0, { color: '#ff6fa5', stroke: '#ffffff', size: 74 });
    logo.position.set(0, 3.3, -8.7);
    root.add(logo);

    // スポットライト
    for (var L = -1; L <= 1; L += 2) {
      var cone = PROPS.spotCone(1.6, 5.5, 0xffffff, 0.13);
      cone.position.set(L * 2.6, 3.4, -3);
      cone.rotation.z = -L * 0.42;
      root.add(cone);
      var lamp = B.cyl(0.22, 0.28, 0.34, 0x555566, { seg: 12 });
      lamp.position.set(L * 3.2, 5.6, -3);
      root.add(lamp);
    }

    // かんきゃく（どうぶつ）
    var types = ['dog', 'cat', 'rabbit', 'bear', 'bird', 'hamster', 'panda'];
    for (var q = 0; q < 14; q++) {
      var side = q % 2 === 0 ? -1 : 1;
      var row = Math.floor(q / 2);
      var an = new Animal(types[q % types.length], { scale: 0.85 });
      an.group.position.set(side * (2.4 + (row % 2) * 0.8), 0, -7.4 + row * 1.7);
      an.group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      an.wagSpeed = 2.2;
      root.add(an.group);
      audience.push(an);
      GAME.addTap(an.group, function (o) {
        var idx = audience.map(function (x) { return x.group; }).indexOf(o);
        if (idx >= 0) { audience[idx].play('happy'); audience[idx].cry(); }
      });
    }

    // カメラマン の フラッシュ
    for (var c = 0; c < 8; c++) {
      var side2 = c % 2 === 0 ? -1 : 1;
      var f = B.sphere(0.12, 0xffffff, { seg: 8 });
      f.position.set(side2 * 2.0, 1.0, -6.5 + Math.floor(c / 2) * 2.2);
      f.visible = false;
      root.add(f);
      cameras.push(f);
    }

    // しんさいん（3にん の どうぶつ）
    var jt = ['panda', 'unicorn', 'cat'];
    for (var j = 0; j < 3; j++) {
      var jd = new Animal(jt[j], { scale: 1.0 });
      jd.group.position.set(-1.6 + j * 1.6, 0.5, 3.4);
      jd.group.rotation.y = Math.PI;
      root.add(jd.group);
      var desk = B.roundBox(1.2, 0.5, 0.5, 0.06, 0xffd9ec, { unique: true });
      desk.position.set(-1.6 + j * 1.6, 0.25, 3.9);
      root.add(desk);
      judges.push(jd);
    }
    var jbase = B.roundBox(5.6, 0.5, 1.4, 0.1, 0x8a6fa8, { unique: true });
    jbase.position.set(0, 0.25, 3.6);
    root.add(jbase);

    // ふうせん
    for (var bb = 0; bb < 6; bb++) {
      var bal = B.balloon(U.pick([0xff9dbf, 0xffd95c, 0x8fd4ff, 0xc09dff]));
      bal.position.set(U.rand(-4.5, 4.5), U.rand(1.6, 3.0), U.rand(-8, 1));
      bal.scale.setScalar(0.9);
      root.add(bal);
    }

    GAME.char.group.position.set(0, 0.24, walkZ);
    GAME.char.group.rotation.y = 0;
    GAME.pet.group.visible = false;
  }

  /* ---------- しんこう ---------- */

  function startWalk() {
    phase = 'walk';
    UI.setTask('あるいて いくよ〜', '👠');
    UI.setRow(0, []);
    GAME.char.setPose('idle');
    GAME.char.setExpr('smile');
  }

  function startPose() {
    phase = 'pose';
    poseTimer = 0;
    GAME.char.walkSpeed = 0;
    UI.setTask('ポーズ を きめて！', '📸', true);
    SND.say('ポーズ');
    UI.setRow(0, POSES, function (id) {
      doPose(id);
    });
    UI.taskMid(false);
    GAME.setHint(function () { UI.hintOnChip(0, U.pick(POSES).id); });
  }

  function doPose(id) {
    if (phase !== 'pose') return;
    posesDone++;
    // ビート に あって いたら ボーナス
    var bonus = 1;
    var bi = SND.beatInfo();
    if (bi) {
      var d = Math.abs((bi.now - bi.last) % bi.period);
      if (d < 0.16 || d > bi.period - 0.16) bonus = 2;
    }
    score += bonus;
    appl = 1;

    GAME.char.setPose(id);
    GAME.char.setExpr(bonus > 1 ? 'star' : U.pick(['happy', 'wink', 'proud']));
    SND.play('pose');
    SND.play('applause');
    UI.big(bonus > 1 ? '🌟' : '📸');
    if (bonus > 1) UI.banner('パーフェクト！');

    var hp = GAME.char.headPos();
    FX.celebrate(hp);
    FX.burst('sparkle', hp, 14);

    // フラッシュ
    for (var i = 0; i < cameras.length; i++) {
      (function (cam, k) {
        U.after(k * 0.07, function () {
          cam.visible = true;
          U.after(0.1, function () { cam.visible = false; });
        });
      })(cameras[i], i);
    }
    // かんきゃく が よろこぶ
    for (var a = 0; a < audience.length; a++) {
      (function (an, k) { U.after(k * 0.05, function () { an.play('happy'); }); })(audience[a], a);
    }
    for (var j = 0; j < judges.length; j++) judges[j].play('happy');

    UI.setRow(0, []);
    U.after(1.9, function () {
      GAME.char.setPose('idle');
      GAME.char.setExpr('smile');
      spotIndex++;
      if (spotIndex >= poseSpots.length) finale();
      else startWalk();
    });
  }

  function finale() {
    phase = 'finale';
    UI.setTask('フィナーレ！', '🏆');
    GAME.char.group.position.z = 1.6;
    GAME.char.walkSpeed = 0;
    GAME.char.play('curtsy');
    GAME.char.setExpr('happy');
    SND.play('fanfare');
    SND.play('applause');
    appl = 1;
    var hp = GAME.char.headPos();
    FX.celebrate(hp);
    FX.rain('confetti', { x: 0, y: 6, z: -1, w: 8, d: 8, h: 1 }, 40, { size: 0.22, life: 4, gravity: -1.2 });

    U.after(2.0, function () {
      var stars = score >= 5 ? 3 : (score >= 3 ? 2 : 1);
      GAME.finish('runway', {
        title: 'ショー だいせいこう！',
        stars: stars,
        msg: 'かんきゃく が おおよろこび！'
      });
    });
  }

  /* ---------- とうろく ---------- */

  GAME.register('runway', {
    name: 'ランウェイ', icon: '🌟', bgm: 'runway',

    build: build,

    enter: function () {
      phase = 'intro';
      walkZ = -7.5;
      spotIndex = 0; score = 0; posesDone = 0; appl = 0;
      GAME.setView({ target: [0, 1.0, -5.5], dist: 4.6, height: 1.4, fov: 46 }, true);
      UI.setTask('ファッションショー の はじまり！', '🌟');
      UI.setRow(0, []);
      GAME.char.setExpr('smile');
      SND.play('fanfare');

      U.after(1.6, function () { startWalk(); });
    },

    exit: function () {
      lights.length = 0; audience.length = 0; cameras.length = 0; judges.length = 0;
    },

    update: function (dt, t) {
      // ステージライト の キラキラ
      for (var i = 0; i < lights.length; i++) {
        var k = 0.5 + 0.5 * Math.sin(t * 4 + i * 0.4);
        lights[i].scale.setScalar(0.8 + k * 0.5);
      }
      for (var a = 0; a < audience.length; a++) audience[a].update(dt, t);
      for (var j = 0; j < judges.length; j++) judges[j].update(dt, t);

      var pos = GAME.char.group.position;

      if (phase === 'walk') {
        var target = poseSpots[spotIndex];
        if (pos.z < target - 0.05) {
          pos.z += 1.15 * dt;
          GAME.char.walkSpeed = 0.62;
          if (Math.random() < dt * 5) SND.play('step');
        } else {
          GAME.char.walkSpeed = 0;
          startPose();
        }
      } else if (phase === 'pose') {
        poseTimer += dt;
        // 6びょう まっても おさなければ じどうで ポーズ
        if (poseTimer > 6.5) doPose(U.pick(POSES).id);
      }

      // カメラ が ついていく
      if (phase !== 'finale') {
        GAME.setView({ target: [0, 1.05, pos.z - 0.6], dist: 4.4, height: 1.35, fov: 46 });
      } else {
        GAME.setView({ target: [0, 1.05, 1.2], dist: 4.0, height: 1.3, fov: 46 });
      }

      // はくしゅ の エフェクト
      if (appl > 0) {
        appl -= dt * 0.5;
        if (Math.random() < dt * 12) {
          var an = U.pick(audience);
          FX.burst('heart', an.group.position.clone().setY(1.0), 2, { up: 1.6, size: 0.18, life: 1 });
        }
      }

      // キラキラ が ふる
      if (Math.random() < dt * 2.2) {
        FX.rain('star', { x: 0, y: 6, z: -3, w: 7, d: 10, h: 1 }, 1, { size: 0.2, life: 4.5, gravity: -0.5 });
      }
    }
  });
})();
