/* ============================================================
 * activities/play.js — 🎈 あそぶ（双方向あそび）
 *  ・キャッチボール：ころがす→ハイハイでおいかける→ひろう→なげかえす
 *  ・つみき：1こずつつむ→ぐらぐら→ガッシャーン→大わらい→ちらかる
 *  ・ふうせんラリー：おとさないようにポンポン
 *  ・がっき：もっきん(ドレミソラ)・たいこ → あかちゃんがリズムにのる
 *  ・いないいないばあ：あたまをタップ
 *  ・おかたづけ：ちらかったおもちゃをはこへ（痕跡の連鎖）
 * ============================================================ */
(function () {
  'use strict';

  var XYLO_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0]; // ド レ ミ ソ ラ
  var XYLO_COLORS = [0xff6fa5, 0xffb13d, 0xffd44d, 0x9dff8a, 0x7fd8ff];
  var POP_COLORS = [0xff6fa5, 0xffd44d, 0x7fd8ff];

  var play = {
    objects: [],

    isBusy: function () { return this.babyState !== 'idle'; },

    enter: function () {
      var G = AX.G;
      var scene = G.scene;
      this.objects = [];
      this.danceTime = 0;
      this.rallyCombo = 0;
      this.popBalloons = [];

      /* --- あかちゃん --- */
      var baby = G.baby;
      baby.setPose('stand');
      baby.group.position.set(-0.4, 0, 0.2);
      baby.group.rotation.set(0, 0, 0);
      baby.setMood('idle');
      this.babyState = 'idle';   // idle | chasing | holding | throwing

      /* --- ボール --- */
      var ball = new THREE.Group();
      var b1 = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), AX.lambert(0xff6fa5));
      var stripe = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 10, 24), AX.lambert(0xffffff));
      stripe.rotation.x = Math.PI / 2.4;
      var star = AX.emojiSprite('⭐', 0.22);
      star.position.z = 0.23;
      ball.add(b1); ball.add(stripe); ball.add(star);
      ball.position.set(0.9, 0.24, 1.15);
      scene.add(ball);
      this.objects.push(ball);
      this.ball = ball;
      this.ballVel = new THREE.Vector3();
      this.ballFlick = null;
      this.ballIdleTime = 0;

      /* --- つみき --- */
      this.blocks = [];
      this.towerCount = 0;
      var blockColors = [0xff6fa5, 0xffd44d, 0x7fd8ff, 0x9dff8a, 0xc9a6ff];
      for (var i = 0; i < 5; i++) {
        var blk = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), AX.lambert(blockColors[i]));
        blk.userData.state = 'pile';   // pile | tower | flying | scattered
        blk.userData.vel = new THREE.Vector3();
        blk.userData.spin = new THREE.Vector3();
        blk.position.set(1.95 + (i % 3) * 0.3, 0.12, -0.9 + Math.floor(i / 3) * 0.34);
        blk.rotation.y = i * 0.5;
        scene.add(blk);
        this.objects.push(blk);
        this.blocks.push(blk);
      }
      this.towerBase = new THREE.Vector3(1.05, 0, -0.35);

      /* --- おもちゃばこ --- */
      var box = new THREE.Group();
      var boxBody = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.5), AX.lambert(0xf0b47a));
      boxBody.position.y = 0.2;
      box.add(boxBody);
      var boxIn = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.38, 0.4), AX.lambert(0x8a5a2a));
      boxIn.position.y = 0.24;
      box.add(boxIn);
      var boxLabel = AX.emojiSprite('🧸', 0.3);
      boxLabel.position.set(0, 0.28, 0.28);
      box.add(boxLabel);
      box.position.set(2.55, 0, -1.7);
      scene.add(box);
      this.objects.push(box);
      this.toyBox = box;

      /* --- もっきん --- */
      var xylo = new THREE.Group();
      var xBase = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.5), AX.lambert(0xd99a5b));
      xBase.position.y = 0.1;
      xylo.add(xBase);
      this.xyloBars = [];
      for (var xb = 0; xb < 5; xb++) {
        var barLen = 0.44 - xb * 0.05;
        var bar = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, barLen), AX.lambert(XYLO_COLORS[xb]));
        bar.position.set(-0.36 + xb * 0.18, 0.16, 0);
        bar.userData.note = XYLO_NOTES[xb];
        bar.userData.baseY = 0.16;
        xylo.add(bar);
        this.xyloBars.push(bar);
      }
      xylo.position.set(-1.95, 0, 0.85);
      xylo.rotation.y = 0.5;
      scene.add(xylo);
      this.objects.push(xylo);

      /* --- たいこ --- */
      var taiko = new THREE.Group();
      var tBody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 18), AX.lambert(0xe0433a));
      tBody.position.y = 0.2;
      taiko.add(tBody);
      this.taikoSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 18), AX.lambert(0xfff3e0));
      this.taikoSkin.position.y = 0.37;
      taiko.add(this.taikoSkin);
      taiko.position.set(-2.35, 0, -0.1);
      scene.add(taiko);
      this.objects.push(taiko);
      this.taiko = taiko;

      /* --- ラリーふうせん（かおつき・おおきい） --- */
      var rally = new THREE.Group();
      var rBody = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 16), AX.lambert(0xffd44d));
      rBody.scale.set(1, 1.15, 1);
      rally.add(rBody);
      var rFace = AX.emojiSprite('😊', 0.3);
      rFace.position.set(0, 0.02, 0.28);
      rally.add(rFace);
      var rKnot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 8), AX.lambert(0xffb13d));
      rKnot.position.y = -0.38;
      rKnot.rotation.x = Math.PI;
      rally.add(rKnot);
      rally.position.set(0.2, 1.6, 0.4);
      scene.add(rally);
      this.objects.push(rally);
      this.rally = rally;
      this.rallyVel = new THREE.Vector3(0, 0, 0);
      this.rallyRest = false;

      /* --- わりようふうせん（ちいさいの・うえをふわふわ） --- */
      for (var p = 0; p < 3; p++) {
        var bl = this._makePopBalloon(POP_COLORS[p]);
        bl.position.set(-2.2 + p * 1.6, 2.4 + Math.random() * 0.8, -2.3);
        bl.userData.phase = Math.random() * Math.PI * 2;
        scene.add(bl);
        this.objects.push(bl);
        this.popBalloons.push(bl);
      }

      // ちらかっていたら、おかたづけをうながす
      if (CARE.state.toysOut > 0) {
        this._scatterBlocks(Math.min(5, CARE.state.toysOut), false);
        UI.celebrate('おもちゃを おかたづけしよう！');
        UI.bigFeedback('🧸');
      } else {
        UI.bigFeedback('🎈');
        SND.play('chime');
      }
      UI.clearContext();
      AX.G.world.setMess(0); // このシーンでは実物のつみきが出ている
    },

    _makePopBalloon: function (color) {
      var g = new THREE.Group();
      var body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), AX.lambert(color));
      body.scale.set(1, 1.15, 1);
      var knot = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.07, 8), AX.lambert(color));
      knot.position.y = -0.26;
      knot.rotation.x = Math.PI;
      var string = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.5, 4), AX.lambert(0xffffff));
      string.position.y = -0.55;
      g.add(body); g.add(knot); g.add(string);
      return g;
    },

    /* ---------- 入力 ---------- */

    onDown: function (x, y) {
      var G = AX.G;
      var baby = G.baby;

      // いちばん手前のものをえらぶ（奥のふうせんが手前のつみきを横取りしない）
      var best = AX.pickBest(x, y, [
        { key: 'rally', objects: [this.rally] },
        { key: 'pop', objects: this.popBalloons },
        { key: 'xylo', objects: this.xyloBars, recursive: false },
        { key: 'taiko', objects: [this.taiko] },
        { key: 'toybox', objects: [this.toyBox] },
        { key: 'blocks', objects: this.blocks, recursive: false },
        { key: 'ball', objects: this.babyState === 'holding' || this.babyState === 'throwing' ? [] : [this.ball] },
        { key: 'head', objects: [baby.head] },
        { key: 'body', objects: [baby.root] }
      ]);
      if (!best) return;

      switch (best.key) {
        case 'rally':
          this._rallyHit();
          return;
        case 'pop': {
          var bl = best.hit.object;
          while (bl.parent && this.popBalloons.indexOf(bl) === -1) bl = bl.parent;
          if (this.popBalloons.indexOf(bl) !== -1) this._popBalloon(bl);
          return;
        }
        case 'xylo':
          this._playBar(best.hit.object);
          return;
        case 'taiko':
          this._playTaiko(best.hit.point);
          return;
        case 'toybox':
          this._tidyUp();
          return;
        case 'blocks':
          this._blockTap(best.hit.object);
          return;
        case 'ball':
          this.ballFlick = { x0: x, y0: y, t: performance.now() };
          this.playerRolled = true;   // プレイヤーがころがした → あかちゃんがとりにいく
          return;
        case 'head':
          this._peekaboo();
          return;
        case 'body':
          baby.giggle();
          baby.setMood('happy');
          SND.play('giggle');
          FX.burst('hearts', AX.headWorld(), 6);
          G.bumpMeter('happy', 0.08);
          UI.bigFeedback('🤭');
          this._moodResetSoon();
          return;
      }
    },

    onMove: function () {},

    onUp: function (x, y) {
      // ボールのフリック → ころがす！
      if (this.ballFlick) {
        var dx = (x - this.ballFlick.x0) / Math.max(200, window.innerWidth * 0.3);
        var dy = (y - this.ballFlick.y0) / Math.max(200, window.innerHeight * 0.3);
        var power = Math.min(3, Math.sqrt(dx * dx + dy * dy) * 3);
        if (power < 0.25) {
          // タップだけ → ちいさくはねる
          this.ballVel.set((Math.random() - 0.5) * 0.8, 1.6, -0.8);
          SND.play('boing');
        } else {
          this.ballVel.set(dx * 3, 0.8, dy * 3 - 0.5);
          SND.play('whoosh');
        }
        this.ballFlick = null;
        this.ballIdleTime = 0;
      }
    },

    /* ---------- キャッチボール ---------- */

    _ballUpdate: function (dt, t) {
      var G = AX.G;
      var baby = G.baby;
      var ball = this.ball;

      if (this.babyState === 'holding') return; // だっこちゅう

      // ぶつり
      this.ballVel.y -= 6 * dt;
      ball.position.addScaledVector(this.ballVel, dt);
      if (ball.position.y < 0.24) {
        ball.position.y = 0.24;
        if (Math.abs(this.ballVel.y) > 0.8) {
          this.ballVel.y = -this.ballVel.y * 0.5;
          SND.play('drum');
        } else {
          this.ballVel.y = 0;
        }
        // ころがりまさつ（フレームレートに依存しない時間ベース）
        var fr = Math.exp(-1.1 * dt);
        this.ballVel.x *= fr;
        this.ballVel.z *= fr;
      }
      if (Math.abs(ball.position.x) > 2.7) {
        ball.position.x = Math.sign(ball.position.x) * 2.7;
        this.ballVel.x *= -0.7;
      }
      if (ball.position.z > 1.7 || ball.position.z < -1.7) {
        ball.position.z = Math.max(-1.7, Math.min(1.7, ball.position.z));
        this.ballVel.z *= -0.7;
      }
      ball.rotation.x += this.ballVel.z * dt * 3;
      ball.rotation.z -= this.ballVel.x * dt * 3;

      var speed = this.ballVel.length();
      var distToBaby = ball.position.distanceTo(baby.group.position);

      if (this.babyState === 'idle') {
        // プレイヤーがころがしたボールがとまった → ハイハイでおいかける！
        if (this.playerRolled && speed < 0.15 && ball.position.y <= 0.25 && distToBaby > 0.75) {
          this.ballIdleTime += dt;
          if (this.ballIdleTime > 0.7) {
            this.babyState = 'chasing';
            baby.setCrawl(true);
            baby.setMood('excited');
            SND.play('giggle');
          }
        } else {
          this.ballIdleTime = 0;
        }
        // ころがってくるボールをみつめる
        if (speed > 0.3) baby.lookTarget = ball.position;
        else if (this.babyState === 'idle') baby.lookTarget = null;
      } else if (this.babyState === 'chasing') {
        // ハイハイでボールへ
        baby.lookTarget = ball.position;
        var dir = ball.position.clone().sub(baby.group.position);
        dir.y = 0;
        var dist = dir.length();
        if (dist > 0.45) {
          dir.normalize();
          baby.group.position.addScaledVector(dir, dt * 0.85);
          baby.group.rotation.y = Math.atan2(dir.x, dir.z);
        } else {
          // ひろった！「よいしょ」
          this.playerRolled = false;   // なげかえしたあとは、つぎにころがすまでまつ
          this.babyState = 'holding';
          baby.setCrawl(false);
          baby.group.rotation.y = Math.atan2(-baby.group.position.x, 1.5 - baby.group.position.z);
          baby.setMood('excited');
          SND.play('kenken');
          this.holdTimer = 0.9;
          // ボールをあたまのうえに
          this.ballVel.set(0, 0, 0);
        }
      } else if (this.babyState === 'throwing') {
        // なげたあと、もとのばしょへあるいてもどる…はせず、そのばで待つ
        this.babyState = 'idle';
      }
    },

    _holdUpdate: function (dt) {
      var G = AX.G;
      var baby = G.baby;
      // あたまのうえに「よいしょ」
      var hw = AX.headWorld();
      this.ball.position.lerp(new THREE.Vector3(hw.x, hw.y + 0.45, hw.z), Math.min(1, dt * 8));
      baby.armL.rotation.z = 2.8;
      baby.armR.rotation.z = -2.8;
      this.holdTimer -= dt;
      if (this.holdTimer <= 0) {
        // なげかえす！（プレイヤーがわへ）
        this.babyState = 'throwing';
        var target = new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.3, 1.3);
        var v = target.sub(this.ball.position);
        this.ballVel.set(v.x * 1.1, 1.9, v.z * 1.1);
        SND.play('whoosh');
        SND.play('giggle');
        baby.setMood('happy');
        FX.burst('stars', this.ball.position, 5);
        G.bumpMeter('happy', 0.07);
        if (Math.random() < 0.4) UI.addStars(1, G.onSticker);
        this._moodResetSoon();
      }
    },

    /* ---------- つみき ---------- */

    _blockTap: function (blk) {
      var G = AX.G;
      var st = blk.userData.state;
      if (st === 'pile' || st === 'scattered') {
        // タワーへつむ！
        blk.userData.state = 'flying';
        blk.userData.targetY = 0.12 + this.towerCount * 0.245;
        this.towerCount++;
        SND.play('pop');
        AX.G.baby.lookTarget = blk.position;
      } else if (st === 'tower') {
        // タワーをたたく → くずれる！
        this._collapseTower();
      }
    },

    _collapseTower: function () {
      var G = AX.G;
      var n = 0;
      for (var i = 0; i < this.blocks.length; i++) {
        var blk = this.blocks[i];
        if (blk.userData.state === 'tower' || blk.userData.state === 'flying') {
          blk.userData.state = 'falling';
          blk.userData.vel.set((Math.random() - 0.5) * 2.2, 1 + Math.random() * 1.5, 0.5 + Math.random() * 1.2);
          blk.userData.spin.set(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3);
          n++;
        }
      }
      if (n === 0) return;
      this.towerCount = 0;
      SND.play('crash');   // ガッシャーン！
      UI.bigFeedback('💥');
      // あかちゃんおおわらい！
      var baby = G.baby;
      baby.setMood('happy');
      baby.giggle();
      baby.clap();
      SND.play('giggle');
      setTimeout(function () { SND.play('giggle'); }, 350);
      FX.burst('stars', this.towerBase.clone().setY(0.8), 8);
      G.bumpMeter('happy', 0.1);
      this._moodResetSoon();
    },

    _blocksUpdate: function (dt, t) {
      var scattered = 0;
      var towerBlocks = [];
      for (var i = 0; i < this.blocks.length; i++) {
        var blk = this.blocks[i];
        var ud = blk.userData;
        if (ud.state === 'flying') {
          // タワーのてっぺんへとんでいく
          var target = new THREE.Vector3(this.towerBase.x, ud.targetY, this.towerBase.z);
          blk.position.lerp(target, Math.min(1, dt * 6));
          blk.rotation.x *= 0.9; blk.rotation.y *= 0.9; blk.rotation.z *= 0.9;
          if (blk.position.distanceTo(target) < 0.03) {
            blk.position.copy(target);
            ud.state = 'tower';
            SND.play('tap');
            FX.burst('sparkle', blk.position, 2);
            // たかいタワーごとにほめる
            var h = Math.round((ud.targetY - 0.12) / 0.245) + 1;
            if (h >= 5) {
              UI.bigFeedback('🏰');
              SND.play('tada');
              UI.addStars(1, AX.G.onSticker);
              AX.G.baby.clap();
              AX.G.baby.setMood('excited');
              this._moodResetSoon();
            }
          }
        } else if (ud.state === 'falling') {
          ud.vel.y -= 7 * dt;
          blk.position.addScaledVector(ud.vel, dt);
          blk.rotation.x += ud.spin.x * dt;
          blk.rotation.y += ud.spin.y * dt;
          blk.rotation.z += ud.spin.z * dt;
          if (blk.position.y < 0.12) {
            blk.position.y = 0.12;
            if (Math.abs(ud.vel.y) > 1) {
              ud.vel.y = -ud.vel.y * 0.4;
              SND.play('pofu');
            } else {
              ud.state = 'scattered';
              blk.rotation.x = 0; blk.rotation.z = 0;
            }
            ud.vel.x *= 0.8; ud.vel.z *= 0.8;
          }
        }
        if (ud.state === 'scattered') scattered++;
        if (ud.state === 'tower') towerBlocks.push(blk);
      }
      // タワーのぐらぐら（たかいほどゆれる）
      var sway = Math.sin(t * 3) * 0.018 * towerBlocks.length;
      for (var b = 0; b < towerBlocks.length; b++) {
        var hIdx = Math.round((towerBlocks[b].position.y - 0.12) / 0.245);
        towerBlocks[b].position.x = this.towerBase.x + sway * hIdx;
      }
      // 5だんで自然にくずれることも
      if (towerBlocks.length >= 5 && Math.random() < dt * 0.4) this._collapseTower();
      // 痕跡：ちらかりを記録
      CARE.state.toysOut = scattered;
    },

    /* ---------- おかたづけ ---------- */

    _tidyUp: function () {
      var G = AX.G;
      var n = 0;
      for (var i = 0; i < this.blocks.length; i++) {
        var blk = this.blocks[i];
        if (blk.userData.state === 'scattered' || blk.userData.state === 'falling') {
          blk.userData.state = 'tidying';
          blk.userData.tidyT = i * 0.12;
          n++;
        }
      }
      if (n === 0) {
        SND.play('tap');
        return;
      }
      SND.play('chime');
      UI.celebrate('おかたづけ じょうず！');
    },

    _tidyUpdate: function (dt) {
      var G = AX.G;
      var allDone = true;
      var anyTidying = false;
      for (var i = 0; i < this.blocks.length; i++) {
        var blk = this.blocks[i];
        var ud = blk.userData;
        if (ud.state === 'tidying') {
          anyTidying = true;
          ud.tidyT -= dt;
          if (ud.tidyT <= 0) {
            var target = this.toyBox.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.35, 0));
            blk.position.lerp(target, Math.min(1, dt * 5));
            blk.rotation.y += dt * 6;
            if (blk.position.distanceTo(target) < 0.12) {
              ud.state = 'inBox';
              blk.position.copy(target).setY(0.3);
              SND.play('pop');
              FX.burst('sparkle', target, 3);
            }
          }
          if (ud.state !== 'inBox') allDone = false;
        }
      }
      if (anyTidying && allDone) {
        // ぜんぶはこにはいった！
        for (var j = 0; j < this.blocks.length; j++) {
          if (this.blocks[j].userData.state === 'inBox') this.blocks[j].userData.state = 'stored';
        }
        CARE.state.toysOut = 0;
        CARE.save();
        AX.G.world.setMess(0);
        SND.play('tada');
        UI.bigFeedback('👏');
        UI.addStars(2, G.onSticker);
        G.baby.clap();
        G.baby.setMood('happy');
        G.bumpMeter('happy', 0.08);
        this._moodResetSoon();
      }
    },

    /* ---------- ふうせん ---------- */

    _rallyHit: function () {
      var G = AX.G;
      this.rallyVel.set((Math.random() - 0.5) * 1.4, 2.0 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4);
      this.rallyRest = false;
      this.rallyCombo++;
      SND.play('bounce');
      FX.burst('sparkle', this.rally.position, 3);
      G.baby.lookTarget = this.rally.position;
      if (this.rallyCombo > 0 && this.rallyCombo % 5 === 0) {
        // 5かいつづいた！
        UI.bigFeedback('🎈' + this.rallyCombo);
        SND.play('tada');
        G.baby.clap();
        G.baby.setMood('excited');
        UI.addStars(1, G.onSticker);
        G.bumpMeter('happy', 0.06);
        this._moodResetSoon();
      }
    },

    _rallyUpdate: function (dt, t) {
      var G = AX.G;
      if (this.rallyRest) {
        // ゆかでゆっくりゆれてまっている
        this.rally.position.y = 0.42 + Math.sin(t * 2) * 0.02;
        this.rally.rotation.z = Math.sin(t * 1.5) * 0.08;
        return;
      }
      this.rallyVel.y -= 1.6 * dt;   // かるいのでゆっくりおちる
      this.rally.position.addScaledVector(this.rallyVel, dt);
      this.rally.rotation.z = this.rallyVel.x * 0.15;
      if (Math.abs(this.rally.position.x) > 2.4) {
        this.rally.position.x = Math.sign(this.rally.position.x) * 2.4;
        this.rallyVel.x *= -0.8;
      }
      if (this.rally.position.z < -1.4 || this.rally.position.z > 1.5) {
        this.rally.position.z = Math.max(-1.4, Math.min(1.5, this.rally.position.z));
        this.rallyVel.z *= -0.8;
      }
      if (this.rally.position.y > 3.4) {
        this.rally.position.y = 3.4;
        this.rallyVel.y = Math.min(0, this.rallyVel.y);
      }
      // ゆかにおちた → ぽふっ、ラリーおわり
      if (this.rally.position.y < 0.42) {
        this.rally.position.y = 0.42;
        this.rallyRest = true;
        if (this.rallyCombo >= 3) {
          SND.play('pofu');
          UI.bigFeedback('🎈💤');
          AX.G.baby.setMood('surprised');
          this._moodResetSoon();
        }
        this.rallyCombo = 0;
        this.rallyVel.set(0, 0, 0);
      }
      // あかちゃんがふうせんをめでおいかける
      if (!this.rallyRest && this.babyState === 'idle' && this.ballVel.length() < 0.2) {
        G.baby.lookTarget = this.rally.position;
      }
    },

    _popBalloon: function (bl) {
      var G = AX.G;
      SND.play('balloonPop');
      FX.burst('confetti', bl.position, 12);
      G.baby.setMood('surprised');   // びっくり→わらう
      SND.play('giggle');
      G.bumpMeter('happy', 0.05);
      if (Math.random() < 0.35) UI.addStars(1, G.onSticker);
      var self = this;
      setTimeout(function () {
        if (AX.G.currentName === 'play' && AX.G.baby.mood === 'surprised') {
          AX.G.baby.setMood('happy');
          AX.G.baby.giggle();
          self._moodResetSoon();
        }
      }, 500);
      // したからふっかつ
      bl.position.set(-2.2 + Math.random() * 4.0, -1.0, -2.3);
    },

    /* ---------- がっき ---------- */

    _playBar: function (bar) {
      SND.note(bar.userData.note, 'xylo');
      bar.position.y = bar.userData.baseY - 0.03;
      bar.userData.bounceT = 0.18;
      FX.burst('notes', bar.getWorldPosition(new THREE.Vector3()), 1);
      this._feelRhythm();
    },

    _playTaiko: function (point) {
      var isRim = point.y < 0.3;
      SND.play(isRim ? 'taikoHigh' : 'taikoLow');
      this.taikoSkin.scale.y = 0.5;
      FX.burst('notes', this.taiko.position.clone().setY(0.6), 1);
      this._feelRhythm();
    },

    _feelRhythm: function () {
      var G = AX.G;
      this.danceTime = 2.0;   // 2びょうかんリズムにのる
      G.bumpMeter('happy', 0.015);
    },

    _peekaboo: function () {
      var G = AX.G;
      var baby = G.baby;
      if (baby.peekPhase !== 0) return;
      UI.bigFeedback('🙈');
      baby.peekaboo(function () {
        // ばあ！
        UI.bigFeedback('😆');
        FX.burst('confetti', AX.headWorld(), 10);
        FX.burst('hearts', AX.headWorld(), 5);
        SND.play('giggle');
        AX.G.bumpMeter('happy', 0.1);
        if (Math.random() < 0.5) UI.addStars(1, AX.G.onSticker);
      });
    },

    _moodResetSoon: function () {
      setTimeout(function () {
        if (AX.G.currentName === 'play' && AX.G.baby.mood !== 'idle') AX.G.baby.setMood('idle');
      }, 1300);
    },

    /* ---------- 毎フレーム ---------- */

    update: function (dt, t) {
      var G = AX.G;
      var baby = G.baby;

      this._ballUpdate(dt, t);
      if (this.babyState === 'holding') this._holdUpdate(dt);
      this._blocksUpdate(dt, t);
      this._tidyUpdate(dt);
      this._rallyUpdate(dt, t);

      // もっきんのバーのもどり
      for (var i = 0; i < this.xyloBars.length; i++) {
        var bar = this.xyloBars[i];
        if (bar.userData.bounceT > 0) {
          bar.userData.bounceT -= dt;
          if (bar.userData.bounceT <= 0) bar.position.y = bar.userData.baseY;
        }
      }
      this.taikoSkin.scale.y += (1 - this.taikoSkin.scale.y) * dt * 10;

      // リズムにのる（からだをゆらす）
      if (this.danceTime > 0) {
        this.danceTime -= dt;
        if (this.babyState === 'idle' && baby.peekPhase === 0) {
          baby.root.rotation.z = Math.sin(t * 6) * 0.12;
          baby.headPivot.rotation.z = Math.sin(t * 6 + 0.5) * 0.15;
          if (Math.random() < dt * 2) FX.burst('notes', AX.headWorld(), 1);
        }
      }

      // ちいさいふうせんのふわふわ
      for (var p = 0; p < this.popBalloons.length; p++) {
        var bl = this.popBalloons[p];
        bl.position.y += dt * 0.3;
        bl.position.x += Math.sin(t * 1.2 + bl.userData.phase) * 0.12 * dt;
        bl.rotation.z = Math.sin(t * 1.5 + bl.userData.phase) * 0.1;
        if (bl.position.y > 3.6) {
          bl.position.set(-2.2 + Math.random() * 4.0, -1.0, -2.3);
        }
      }

      // あそんだ痕跡
      if (!this._playedMark) {
        this._playedMark = true;
        CARE.state.playedSinceBath++;
        CARE.save();
      }
    },

    exit: function () {
      var G = AX.G;
      // ちらかしたままなら、へやに痕跡がのこる
      CARE.save();
      G.world.setMess(CARE.state.toysOut);
      if (CARE.state.toysOut > 0) UI.setNeedy('play', true);
      AX.removeAll(this.objects);
      this.blocks = [];
      this.popBalloons = [];
      this.ball = null;
      this.rally = null;
      G.baby.setCrawl(false);
      G.baby.lookTarget = null;
      G.baby.group.rotation.y = 0;
      this._playedMark = false;
    }
  };

  window.ACTIVITIES.play = play;
})();
