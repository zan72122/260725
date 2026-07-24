/* ============================================================
 * activities/feed.js — 🍼 ごはん
 * 食べ物ごとの固有プロセス：
 *  ・りんご/おにぎり/クッキー…かじり跡が残り、芯やかけらはゴミ箱へ
 *  ・バナナ…3回スワイプで皮むき→たれさがる皮
 *  ・ほにゅうびん…くわえて吸う（ほっぺぱくぱく・ミルク減少・気泡）→ぷはー→背中トントン→げっぷ
 *  ・ジュース…ストローをプスッ→吸うとパックがへこむ→ズゾゾー
 * スタイ / おしぼり / 顔の追従「あーん」 / 満腹いやいや / 服のシミ連鎖
 * ============================================================ */
(function () {
  'use strict';

  var TRAY_POS = new THREE.Vector3(0, 1.0, 0.95);

  var FOODS = [
    { id: 'apple', e: '🍎', kind: 'bite', bites: 3, residue: 'core' },
    { id: 'banana', e: '🍌', kind: 'banana', bites: 3, residue: 'peel' },
    { id: 'bottle', e: '🍼', kind: 'bottle' },
    { id: 'riceball', e: '🍙', kind: 'bite', bites: 3, residue: null, rice: true },
    { id: 'cookie', e: '🍪', kind: 'bite', bites: 3, residue: null, crumby: true },
    { id: 'juice', e: '🧃', kind: 'juice', residue: 'pack' }
  ];

  /* ---------- かじり跡つきテクスチャ ---------- */

  function biteTexture(emoji, bites) {
    var size = 128;
    var pack = AX.canvasTexture(size, function (g) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = Math.floor(size * 0.82) + 'px sans-serif';
      g.fillText(emoji, size / 2, size / 2 + size * 0.04);
      // 三日月形のかじりあと（destination-out でくりぬく）
      g.globalCompositeOperation = 'destination-out';
      var spots = [
        [size * 0.82, size * 0.3], [size * 0.24, size * 0.24], [size * 0.78, size * 0.68]
      ];
      for (var i = 0; i < bites && i < spots.length; i++) {
        g.beginPath();
        g.arc(spots[i][0], spots[i][1], size * 0.17, 0, Math.PI * 2);
        g.fill();
        // ギザギザの歯型
        for (var k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(spots[i][0] - size * 0.12 + k * size * 0.08, spots[i][1] + size * 0.1, size * 0.045, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
    return pack.tex;
  }

  function coreTexture() {
    return AX.canvasTexture(128, function (g, s) {
      // りんごのしん
      g.fillStyle = '#f3e4c2';
      g.beginPath();
      g.ellipse(s * 0.5, s * 0.5, s * 0.13, s * 0.3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d8443c';
      g.beginPath(); g.ellipse(s * 0.5, s * 0.2, s * 0.16, s * 0.08, 0, 0, Math.PI, true); g.fill();
      g.beginPath(); g.ellipse(s * 0.5, s * 0.8, s * 0.16, s * 0.08, 0, 0, Math.PI); g.fill();
      g.fillStyle = '#5a3a1a';
      g.beginPath(); g.ellipse(s * 0.46, s * 0.5, s * 0.02, s * 0.04, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(s * 0.54, s * 0.5, s * 0.02, s * 0.04, 0.3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7a5a2a'; g.lineWidth = s * 0.02;
      g.beginPath(); g.moveTo(s * 0.5, s * 0.14); g.lineTo(s * 0.52, s * 0.04); g.stroke();
    }).tex;
  }

  function bananaTexture(peels, bites) {
    // peels: 0..3 むけたかわの枚数 / bites: みのかじり数
    return AX.canvasTexture(128, function (g, s) {
      if (peels <= 0) {
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = Math.floor(s * 0.82) + 'px sans-serif';
        g.fillText('🍌', s / 2, s / 2 + s * 0.04);
        return;
      }
      // みpersonally（クリームいろ）：うえ半分
      var fleshTop = s * 0.12, fleshBot = s * 0.55;
      g.fillStyle = '#fff3d0';
      g.beginPath();
      g.moveTo(s * 0.38, fleshBot);
      g.quadraticCurveTo(s * 0.34, fleshTop + s * 0.06, s * 0.5, fleshTop);
      g.quadraticCurveTo(s * 0.66, fleshTop + s * 0.06, s * 0.62, fleshBot);
      g.closePath();
      g.fill();
      // かじりあと
      if (bites > 0) {
        g.globalCompositeOperation = 'destination-out';
        var spots = [[s * 0.52, fleshTop + s * 0.05], [s * 0.4, fleshTop + s * 0.16], [s * 0.58, fleshTop + s * 0.26]];
        for (var i = 0; i < bites && i < 3; i++) {
          g.beginPath(); g.arc(spots[i][0], spots[i][1], s * 0.11, 0, Math.PI * 2); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      }
      // したのかわ（にぎり部分）
      g.fillStyle = '#ffe14d';
      g.beginPath();
      g.moveTo(s * 0.36, fleshBot - s * 0.02);
      g.quadraticCurveTo(s * 0.5, fleshBot + s * 0.1, s * 0.64, fleshBot - s * 0.02);
      g.lineTo(s * 0.62, s * 0.86);
      g.quadraticCurveTo(s * 0.5, s * 0.94, s * 0.38, s * 0.86);
      g.closePath();
      g.fill();
      // たれさがったかわ（むいた枚数だけ）
      g.fillStyle = '#ffd21f';
      var petals = [[-1, 0], [1, 0], [0, 1]];
      for (var p = 0; p < peels && p < 3; p++) {
        var dx = petals[p][0];
        g.beginPath();
        g.moveTo(s * (0.5 + dx * 0.1), fleshBot);
        g.quadraticCurveTo(s * (0.5 + dx * 0.34), fleshBot + s * 0.12, s * (0.5 + dx * 0.3), s * 0.92);
        g.quadraticCurveTo(s * (0.5 + dx * 0.16), s * 0.86, s * (0.5 + dx * 0.06), fleshBot + s * 0.06);
        g.closePath();
        g.fill();
      }
    }).tex;
  }

  function peelTexture() {
    return AX.canvasTexture(128, function (g, s) {
      g.fillStyle = '#ffd21f';
      for (var p = 0; p < 3; p++) {
        var a = -Math.PI / 2 + (p - 1) * 0.9;
        g.beginPath();
        g.moveTo(s * 0.5, s * 0.42);
        g.quadraticCurveTo(s * 0.5 + Math.cos(a) * s * 0.42, s * 0.45 + Math.abs(Math.sin(a)) * s * 0.1 + s * 0.2, s * 0.5 + Math.cos(a) * s * 0.32, s * 0.85);
        g.quadraticCurveTo(s * 0.5 + Math.cos(a) * s * 0.1, s * 0.7, s * 0.5, s * 0.46);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#c7a01a';
      g.beginPath(); g.arc(s * 0.5, s * 0.42, s * 0.07, 0, Math.PI * 2); g.fill();
    }).tex;
  }

  /* ---------- 3D ほにゅうびん / ジュースパック ---------- */

  function buildBottle() {
    var g = new THREE.Group();
    var glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.08, 0.24, 12),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
    );
    g.add(glass);
    var milk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.073, 0.22, 12),
      AX.lambert(0xfff6e8)
    );
    milk.position.y = -0.005;
    g.add(milk);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.078, 0.05, 12), AX.lambert(0xffb13d));
    cap.position.y = 0.14;
    g.add(cap);
    var nipple = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), AX.lambert(0xffc9ab));
    nipple.position.y = 0.185;
    nipple.scale.set(1, 1.35, 1);
    g.add(nipple);
    g.userData.milk = milk;
    return g;
  }

  function buildJuice() {
    var g = new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.19, 0.09), AX.lambert(0x9a6fff));
    g.add(box);
    var label = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.emojiTexture('🍇', 64), transparent: true }));
    label.scale.set(0.09, 0.09, 1);
    label.position.set(0, 0, 0.055);
    g.add(label);
    var straw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), AX.lambert(0xffffff));
    straw.position.set(0.1, 0.2, 0);   // まだささっていない（うえにふわふわ）
    straw.rotation.z = -0.4;
    g.add(straw);
    g.userData.box = box;
    g.userData.straw = straw;
    g.userData.strawIn = false;
    return g;
  }

  /* ============================================================ */

  var feed = {
    objects: [],
    item: null,          // いまあつかっている食べ物
    trayCrumbs: [],
    bibMesh: null,
    towelHome: null,
    towel: null,         // おしぼりドラッグ中スプライト
    towelActive: false,
    request: null,
    dragPlane: null,
    burpTaps: 0,
    lastPat: 0,
    afterGlow: 0,

    isBusy: function () { return !!this.item || this.towelActive; },

    enter: function () {
      var G = AX.G;
      var scene = G.scene;
      this.objects = [];
      this.item = null;
      this.trayCrumbs = [];
      this.towelActive = false;

      // ハイチェア
      var chair = new THREE.Group();
      var seatMat = AX.lambert(0xf0b47a);
      var seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 0.7), seatMat);
      seat.position.y = 0.42;
      chair.add(seat);
      var back = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.1), seatMat);
      back.position.set(0, 0.75, -0.32);
      chair.add(back);
      for (var i = 0; i < 4; i++) {
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.44, 8), AX.lambert(0xd99a5b));
        leg.position.set((i % 2 ? 1 : -1) * 0.3, 0.2, (i < 2 ? 1 : -1) * 0.26);
        chair.add(leg);
      }
      var tray = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.45), AX.lambert(0xffffff));
      tray.position.set(0, 0.78, 0.5);
      chair.add(tray);
      this.trayMesh = tray;
      var trayRim = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.06), AX.lambert(0xffd44d));
      trayRim.position.set(0, 0.83, 0.71);
      chair.add(trayRim);
      chair.position.set(0, 0, 0.35);
      scene.add(chair);
      this.objects.push(chair);

      // ゴミばこ（しん・かわ・あきパックをポイ）
      var bin = new THREE.Group();
      var binBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.34, 14), AX.lambert(0x8fd8a8));
      binBody.position.y = 0.17;
      bin.add(binBody);
      var binMouth = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 16), AX.lambert(0x6fc08a));
      binMouth.rotation.x = Math.PI / 2;
      binMouth.position.y = 0.34;
      bin.add(binMouth);
      var binFace = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.emojiTexture('🗑️', 64), transparent: true }));
      binFace.scale.set(0.18, 0.18, 1);
      binFace.position.set(0, 0.2, 0.19);
      bin.add(binFace);
      bin.position.set(1.15, 0, 0.75);
      scene.add(bin);
      this.objects.push(bin);
      this.bin = bin;
      this.binPulse = false;

      // スタイ（いすのよこにかかっている → タップでつける）
      this.bibMesh = null;
      if (!CARE.state.bibOn) {
        var bibHang = new THREE.Group();
        var bibMain = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), AX.lambert(0xfffdf0));
        bibMain.scale.set(1, 1, 0.3);
        bibHang.add(bibMain);
        var bibRim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 14), AX.lambert(0xff9dbf));
        bibRim.position.y = 0.1;
        bibHang.add(bibRim);
        bibHang.position.set(-0.62, 0.85, 0.55);
        scene.add(bibHang);
        this.objects.push(bibHang);
        this.bibMesh = bibHang;
      }

      // おしぼり（トレイのすみ）
      var towelRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10), AX.lambert(0xf4fbff));
      towelRoll.add(AX.hitProxy(0.13));
      towelRoll.rotation.z = Math.PI / 2;
      towelRoll.position.set(0.55, 0.87, 0.85);
      scene.add(towelRoll);
      this.objects.push(towelRoll);
      this.towelHome = towelRoll;

      // あかちゃんをすわらせる
      var baby = G.baby;
      baby.setPose('sit');
      baby.group.position.set(0, 0.32, 0.32);
      baby.group.rotation.set(0, 0, 0);
      baby.setMood('idle');
      baby.setBib(CARE.state.bibOn);
      baby.shadow.visible = false;

      this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.15);
      this._newRequest(true);
      this._buildContext();
      // ごはんだ！わくわく
      baby.setMood('excited');
      SND.play('happyBaby');
      var self = this;
      setTimeout(function () { if (AX.G.currentName === 'feed') baby.setMood('idle'); }, 1400);
    },

    _buildContext: function () {
      var self = this;
      UI.setContext(FOODS.map(function (f) {
        return { id: f.id, emoji: f.e };
      }), function (id) { self._spawnFood(id); });
    },

    _newRequest: function (force) {
      if (!force && Math.random() < 0.25) { this.request = null; UI.hideThought(); return; }
      this.request = FOODS[Math.floor(Math.random() * FOODS.length)];
      // ほしいものを指差してアピール（自発行動）
      AX.G.baby.pointTo(1, 1.6);
    },

    /* ---------- たべものの生成 ---------- */

    _spawnFood: function (id) {
      var G = AX.G;
      if (this.item && this.item.state !== 'done') this._discardItem();
      var food = null;
      for (var i = 0; i < FOODS.length; i++) if (FOODS[i].id === id) food = FOODS[i];
      if (!food) return;
      SND.play('pop');

      var obj;
      if (food.kind === 'bottle') {
        obj = buildBottle();
        obj.scale.set(1.6, 1.6, 1.6);
      } else if (food.kind === 'juice') {
        obj = buildJuice();
        obj.scale.set(1.6, 1.6, 1.6);
      } else if (food.kind === 'banana') {
        obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: bananaTexture(0, 0), transparent: true }));
        obj.scale.set(0.5, 0.5, 1);
      } else {
        obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: biteTexture(food.e, 0), transparent: true }));
        obj.scale.set(0.5, 0.5, 1);
      }
      obj.position.copy(TRAY_POS);
      G.scene.add(obj);

      this.item = {
        food: food,
        obj: obj,
        state: 'tray',       // tray → drag → (suck/burp) → residue → done
        bites: 0,
        peels: 0,
        peelSwipeX: null,
        timer: 0,
        suckTimer: 0
      };

      // あかちゃんがたべものにきづく（わくわく・そわそわ）
      G.baby.setMood('excited');
      G.baby.lookTarget = obj.position;
      var self = this;
      setTimeout(function () {
        if (AX.G.currentName === 'feed' && G.baby.mood === 'excited') G.baby.setMood('idle');
      }, 1200);
    },

    _discardItem: function () {
      if (!this.item) return;
      if (this.item.obj.parent) this.item.obj.parent.remove(this.item.obj);
      this.item = null;
      AX.G.baby.setSuckling(false);
    },

    _wearBib: function () {
      var G = AX.G;
      CARE.state.bibOn = true;
      CARE.save();
      G.baby.setBib(true);
      if (this.bibMesh) {
        G.scene.remove(this.bibMesh);
        var idx = this.objects.indexOf(this.bibMesh);
        if (idx >= 0) this.objects.splice(idx, 1);
        this.bibMesh = null;
      }
      SND.play('chime');
      UI.bigFeedback('👶');
      FX.burst('sparkle', AX.chestWorld(), 6);
      G.baby.setMood('happy');
      G.baby.bounce();
      this._moodResetSoon();
    },

    /* ---------- 入力 ---------- */

    onDown: function (x, y) {
      var G = AX.G;

      // スタイをつける（さいゆうせん：おしぼりより先にはんてい）
      if (this.bibMesh) {
        var bibHit0 = G.pick(x, y, [this.bibMesh], true);
        if (bibHit0) {
          this._wearBib();
          return;
        }
      }

      // おしぼりをとる
      var towelHit = G.pick(x, y, [this.towelHome], true);
      if (towelHit) {
        this.towelActive = true;
        if (!this.towel) {
          this.towel = new THREE.Sprite(new THREE.SpriteMaterial({
            map: AX.canvasTexture(64, function (g, s) {
              g.fillStyle = '#f4fbff';
              g.beginPath();
              // まるいタオル
              g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
              g.fill();
              g.strokeStyle = '#bcdff0'; g.lineWidth = 3;
              g.beginPath(); g.arc(s / 2, s / 2, s * 0.28, 0, Math.PI * 2); g.stroke();
            }).tex,
            transparent: true
          }));
          this.towel.scale.set(0.3, 0.3, 1);
        }
        G.scene.add(this.towel);
        SND.play('tap');
        return;
      }

      // ジュースのストローをさす
      if (this.item && this.item.food.kind === 'juice' && !this.item.obj.userData.strawIn) {
        var strawHit = G.pick(x, y, [this.item.obj], true);
        if (strawHit) {
          var ud = this.item.obj.userData;
          ud.strawIn = true;
          ud.straw.position.set(0.035, 0.11, 0);
          ud.straw.rotation.z = -0.15;
          SND.play('strawStab');
          FX.burst('sparkle', this.item.obj.getWorldPosition(new THREE.Vector3()), 3);
          UI.bigFeedback('🥤');
          return;
        }
      }

      // げっぷフェーズ：せなかをトントン
      if (this.item && this.item.state === 'burp') {
        var patHit = G.pick(x, y, [G.baby.root], true);
        if (patHit) this._pat();
        return;
      }

      // たべもの（トレイ上 or 置いた残りかす）をつかむ
      if (this.item && (this.item.state === 'tray' || this.item.state === 'residue')) {
        var hit = G.pick(x, y, [this.item.obj], true);
        if (hit) {
          // むいていないバナナは、まずスワイプでかわむき
          if (this.item.state === 'tray' && this.item.food.kind === 'banana' && this.item.peels < 3) {
            this.item.peelSwipeX = x;
            UI.bigFeedback('🍌➰');
            return;
          }
          this.item.state = this.item.state === 'residue' ? 'residueDrag' : 'drag';
          SND.play('tap');
          return;
        }
      }

      // 口まわりの米粒をつまむ →「ぱくっ」
      var faceHit = G.pick(x, y, [G.baby.head], true);
      if (faceHit) {
        if (G.baby.eatRiceAt(faceHit.point, 0.12)) {
          SND.play('munch');
          SND.play('giggle');
          FX.burst('hearts', faceHit.point, 2);
          G.baby.chew();
          return;
        }
        if (G.baby.noriMesh) {
          var noriWorld = new THREE.Vector3();
          G.baby.noriMesh.getWorldPosition(noriWorld);
          if (noriWorld.distanceTo(faceHit.point) < 0.15) {
            G.baby.removeNori();
            SND.play('pop');
            SND.play('giggle');
            G.baby.giggle();
            FX.burst('sparkle', faceHit.point, 3);
            return;
          }
        }
      }
    },

    onMove: function (x, y, isDown) {
      var G = AX.G;
      var p = G.rayPlane(x, y, this.dragPlane);

      // おしぼりでふきふき
      if (this.towelActive && this.towel && p) {
        this.towel.position.copy(p);
        var faceHit = G.pick(x, y, [G.baby.head], true);
        if (faceHit) {
          var now = performance.now();
          if (!this._lastWipe || now - this._lastWipe > 220) {
            this._lastWipe = now;
            if (G.baby.wipeFacePass()) {
              SND.play('squeak');
              FX.burst('sparkle', faceHit.point, 2);
              if (G.baby.faceDirtyCount() === 0) {
                // ぜんぶふけた！にっこり
                G.baby.setMood('shy');
                SND.play('happyBaby');
                UI.bigFeedback('✨');
                CARE.state.mouthDirt = 0;
                CARE.save();
                this._moodResetSoon();
              }
            }
          }
        }
        return;
      }

      if (!this.item || !p) return;
      var it = this.item;

      // バナナのかわむき（トレイのうえでスワイプ・ちかくをなぞればOK）
      if (it.food.kind === 'banana' && it.peels < 3 && isDown && it.state === 'tray') {
        var overBanana = p && Math.abs(p.x - it.obj.position.x) < 0.55 && Math.abs(p.y - it.obj.position.y) < 0.55;
        if (overBanana) {
          if (it.peelSwipeX == null) it.peelSwipeX = x;
          if (Math.abs(x - it.peelSwipeX) > 40) {
            it.peelSwipeX = x;
            it.peels++;
            it.obj.material.map = bananaTexture(it.peels, 0);
            it.obj.material.needsUpdate = true;
            SND.play('peel');
            FX.burst('sparkle', it.obj.position, 3);
            if (it.peels >= 3) {
              UI.bigFeedback('🍌');
              SND.play('chime');
              AX.G.baby.setMood('excited');
              this._moodResetSoon();
            }
          }
        }
        return;
      }

      // ドラッグ移動
      if (it.state === 'drag' || it.state === 'residueDrag') {
        p.y = Math.max(0.35, Math.min(2.2, p.y));
        p.x = Math.max(-2.2, Math.min(2.2, p.x));
        it.obj.position.copy(p);
      }
    },

    onUp: function (x, y) {
      var G = AX.G;

      // おしぼりをもどす
      if (this.towelActive) {
        this.towelActive = false;
        if (this.towel && this.towel.parent) this.towel.parent.remove(this.towel);
        return;
      }

      if (!this.item) return;
      var it = this.item;
      it.peelSwipeX = null;

      if (it.state === 'residueDrag') {
        // ゴミばこに入ったか
        var binPos = this.bin.position.clone();
        binPos.y = it.obj.position.y;
        var dx = it.obj.position.x - this.bin.position.x;
        if (Math.abs(dx) < 0.42 && it.obj.position.y < 1.1) {
          this._trashResidue();
        } else {
          it.state = 'residue'; // そのばにおいておく（ゴミばこがヒントでゆれる）
          this.binPulse = true;
        }
        return;
      }

      if (it.state !== 'drag') return;

      var mw = AX.mouthWorld();
      var d = Math.sqrt(
        Math.pow(it.obj.position.x - mw.x, 2) + Math.pow(it.obj.position.y - mw.y, 2)
      );

      if (d < 0.55) {
        // 満腹ならいやいや
        if (UI.state.meters.food >= 0.95) {
          G.baby.refuse();
          G.baby.setMood('pout');
          UI.bigFeedback('🙅');
          this._returnToTray();
          this._moodResetSoon();
          return;
        }
        // バナナはむいてからじゃないとたべられない
        if (it.food.kind === 'banana' && it.peels < 3) {
          G.baby.refuse();
          UI.bigFeedback('🍌❔');
          this._returnToTray();
          return;
        }
        // ジュースはストローをさしてから
        if (it.food.kind === 'juice' && !it.obj.userData.strawIn) {
          G.baby.refuse();
          UI.bigFeedback('🥤❔');
          this._returnToTray();
          return;
        }
        if (it.food.kind === 'bottle' || it.food.kind === 'juice') {
          this._startSucking();
        } else {
          this._startEating();
        }
      } else {
        SND.play('boing');
        this._returnToTray();
      }
    },

    _returnToTray: function () {
      var it = this.item;
      if (!it) return;
      it.state = 'returning';
    },

    /* ---------- かじってたべる（りんご・バナナ・おにぎり・クッキー） ---------- */

    _startEating: function () {
      var it = this.item;
      it.state = 'eating';
      it.timer = 0.15;
      AX.G.baby.setMood('eat');
    },

    _doBite: function () {
      var G = AX.G;
      var it = this.item;
      var mw = AX.mouthWorld();
      it.bites++;
      G.baby.chew();
      SND.play('munch');
      FX.burst('crumbs', mw, it.food.crumby ? 9 : 4);
      // ひとくちごとにちいさくなる
      it.obj.scale.multiplyScalar(0.84);

      // かじりあとを更新
      if (it.food.kind === 'banana') {
        it.obj.material.map = bananaTexture(it.peels, it.bites);
      } else {
        it.obj.material.map = biteTexture(it.food.e, it.bites);
      }
      it.obj.material.needsUpdate = true;

      // おにぎり：米粒とのりが顔につく
      if (it.food.rice) {
        G.baby.addRice(2);
        if (!G.baby.noriMesh && Math.random() < 0.6) G.baby.addNori();
      }
      // クッキー：トレイと服にボロボロ
      if (it.food.crumby) {
        this._dropTrayCrumbs(3);
        G.baby.addCrumbDots(2);
        this._maybeStain('food');
      } else if (Math.random() < 0.4) {
        G.baby.addCrumbDots(1);
        this._maybeStain('food');
      }

      if (it.bites >= it.food.bites) this._finishSolid();
    },

    _dropTrayCrumbs: function (n) {
      var G = AX.G;
      for (var i = 0; i < n; i++) {
        var c = new THREE.Mesh(
          new THREE.SphereGeometry(0.02 + Math.random() * 0.015, 6, 6),
          AX.lambert(0xa9744d)
        );
        c.position.set((Math.random() - 0.5) * 0.8, 0.83, 0.75 + (Math.random() - 0.5) * 0.3);
        c.scale.y = 0.5;
        G.scene.add(c);
        this.objects.push(c);
        this.trayCrumbs.push(c);
      }
    },

    _maybeStain: function (type) {
      var G = AX.G;
      if (CARE.state.bibOn) {
        // スタイがよごれをうけとめる（みためだけ）
        if (Math.random() < 0.5) G.baby.addStain(type);
        return;
      }
      if (Math.random() < 0.55) {
        G.baby.addStain(type);
        CARE.stainClothes(type);
        UI.setNeedy('dress', true); // おきがえのきっかけ
      }
    },

    _finishSolid: function () {
      var it = this.item;
      var G = AX.G;
      if (it.food.residue === 'core') {
        it.obj.material.map = coreTexture();
        it.obj.material.needsUpdate = true;
        it.obj.scale.set(0.36, 0.36, 1);
        it.state = 'residue';
        this.binPulse = true;
        UI.bigFeedback('🗑️❔');
      } else if (it.food.residue === 'peel') {
        it.obj.material.map = peelTexture();
        it.obj.material.needsUpdate = true;
        it.obj.scale.set(0.4, 0.4, 1);
        it.state = 'residue';
        this.binPulse = true;
        UI.bigFeedback('🗑️❔');
      } else {
        if (it.obj.parent) it.obj.parent.remove(it.obj);
        it.state = 'done';
      }
      this._rewardMeal(it.food);
    },

    /* ---------- すう（ほにゅうびん・ジュース） ---------- */

    _startSucking: function () {
      var G = AX.G;
      var it = this.item;
      it.state = 'suck';
      it.suckTimer = it.food.kind === 'bottle' ? 3.4 : 2.4;
      it.suckTotal = it.suckTimer;
      // くちにセット
      var mw = AX.mouthWorld();
      it.obj.position.set(mw.x, mw.y - 0.12, mw.z + 0.12);
      it.obj.rotation.z = it.food.kind === 'bottle' ? 0.9 : 0.2;
      G.baby.setMood('eat');
      G.baby.setMouth('o');
      G.baby.setSuckling(true);
      this._nextGulp = 0.4;
    },

    _updateSucking: function (dt) {
      var G = AX.G;
      var it = this.item;
      it.suckTimer -= dt;
      var progress = 1 - it.suckTimer / it.suckTotal;
      var mw = AX.mouthWorld();

      if (it.food.kind === 'bottle') {
        it.obj.position.set(mw.x + 0.02, mw.y - 0.1, mw.z + 0.12);
        // ミルクがへっていく＋気泡がボコボコ
        var milk = it.obj.userData.milk;
        milk.scale.y = Math.max(0.05, 1 - progress);
        milk.position.y = -0.005 - (1 - milk.scale.y) * 0.11;
        if (Math.random() < dt * 6) {
          var bp = it.obj.getWorldPosition(new THREE.Vector3());
          bp.y += 0.1;
          FX.burst('bubbles', bp, 1);
        }
      } else {
        it.obj.position.set(mw.x + 0.02, mw.y - 0.14, mw.z + 0.1);
        // パックがへこんでいく
        var dent = 1 - progress * 0.45;
        it.obj.userData.box.scale.set(dent, 1 - progress * 0.15, dent);
        it.obj.userData.box.rotation.z = Math.sin(progress * 20) * 0.06 * progress;
      }

      this._nextGulp -= dt;
      if (this._nextGulp <= 0) {
        this._nextGulp = 0.55;
        SND.play(it.food.kind === 'bottle' ? 'suck' : 'gulp');
        // スタイなしだと、たまにこぼれてシミに
        if (Math.random() < 0.3) this._maybeStain(it.food.kind === 'bottle' ? 'milk' : 'juice');
      }

      if (it.suckTimer <= 0) {
        G.baby.setSuckling(false);
        if (it.food.kind === 'juice') {
          SND.play('slurp'); // さいごのズゾゾー
          var self = this;
          setTimeout(function () { self._finishJuice(); }, 750);
          it.state = 'slurping';
        } else {
          this._finishBottle();
        }
      }
    },

    _finishJuice: function () {
      var G = AX.G;
      var it = this.item;
      if (!it || AX.G.currentName !== 'feed') return;
      G.baby.setMouth('smile');
      // あきパック → ゴミばこへ
      it.obj.position.copy(TRAY_POS);
      it.obj.rotation.z = 0.3;
      it.state = 'residue';
      this.binPulse = true;
      UI.bigFeedback('🗑️❔');
      this._rewardMeal(it.food);
    },

    _finishBottle: function () {
      var G = AX.G;
      var it = this.item;
      // 「ぷはー」
      SND.play('puha');
      UI.bigFeedback('😮‍💨');
      G.baby.setMouth('o');
      FX.burst('smoke', AX.mouthWorld(), 2);
      if (it.obj.parent) it.obj.parent.remove(it.obj);
      // げっぷタイム：せなかをトントン（4回）
      it.state = 'burp';
      this.burpTaps = 0;
      G.baby.setMood('idle');
      // トントンのばしょをおしえる手アイコン
      if (!this.patHint) {
        this.patHint = AX.emojiSprite('🫳', 0.3);
      }
      var hw = AX.headWorld();
      this.patHint.position.set(hw.x + 0.55, hw.y - 0.35, hw.z);
      G.scene.add(this.patHint);
      UI.celebrate('とんとん してあげよう');
    },

    _pat: function () {
      var G = AX.G;
      var now = performance.now();
      if (now - this.lastPat < 220) return;
      this.lastPat = now;
      this.burpTaps++;
      SND.play('pat');
      G.baby.bounce();
      FX.burst('notes', AX.headWorld(), 1);
      if (this.burpTaps >= 4) {
        // げっぷ！
        var it = this.item;
        if (this.patHint && this.patHint.parent) this.patHint.parent.remove(this.patHint);
        SND.play('burp');
        UI.bigFeedback('💨');
        G.baby.setMood('surprised');
        FX.burst('smoke', AX.mouthWorld(), 4);
        var self = this;
        setTimeout(function () {
          if (AX.G.currentName !== 'feed') return;
          G.baby.setMood('shy');   // てれっ
          SND.play('giggle');
          self._moodResetSoon();
        }, 700);
        it.state = 'done';
        this._rewardMeal(it.food);
      }
    },

    /* ---------- ごほうび・かたづけ ---------- */

    _trashResidue: function () {
      var G = AX.G;
      var it = this.item;
      if (it.obj.parent) it.obj.parent.remove(it.obj);
      it.state = 'done';
      this.binPulse = false;
      SND.play('pop');
      SND.play('tada');
      UI.bigFeedback('👏');
      UI.celebrate('ポイできたね！えらい！');
      FX.burst('stars', this.bin.position.clone().setY(0.5), 8);
      G.baby.clap();
      G.baby.setMood('happy');
      UI.addStars(1, G.onSticker);
      this._moodResetSoon();
    },

    _rewardMeal: function (food) {
      var G = AX.G;
      var matched = this.request && this.request.id === food.id;
      var mw = AX.mouthWorld();
      G.baby.setMood('happy');
      G.baby.bounce();
      SND.play('happyBaby');
      FX.burst('hearts', mw, matched ? 10 : 5);
      G.bumpMeter('food', 0.22);
      CARE.state.fedSinceBath++;
      CARE.state.mouthDirt = Math.min(1, G.baby.faceDirtyCount() * 0.2);
      CARE.save();
      if (matched) {
        UI.bigFeedback('😋');
        FX.burst('confetti', AX.headWorld(), 14);
        SND.play('chime');
        UI.addStars(2, G.onSticker);
      } else {
        UI.bigFeedback('😊');
        UI.addStars(1, G.onSticker);
      }
      var self = this;
      setTimeout(function () {
        if (AX.G.currentName === 'feed') {
          if (G.baby.mood === 'happy') G.baby.setMood('idle');
          self._newRequest(false);
        }
      }, 1300);
    },

    _moodResetSoon: function () {
      setTimeout(function () {
        if (AX.G.currentName === 'feed' && AX.G.baby.mood !== 'idle' && AX.G.baby.mood !== 'eat') {
          AX.G.baby.setMood('idle');
        }
      }, 1200);
    },

    /* ---------- 毎フレーム ---------- */

    update: function (dt, t) {
      var G = AX.G;
      var baby = G.baby;

      // リクエストふきだし
      if (this.request) {
        var hw = AX.headWorld();
        hw.y += 0.45; hw.x += 0.4;
        var s = G.project(hw);
        UI.showThought(this.request.e, s.x, s.y);
      } else {
        UI.hideThought();
      }

      // ゴミばこのヒントゆれ
      if (this.bin) {
        this.bin.rotation.z = this.binPulse ? Math.sin(t * 6) * 0.12 : 0;
        this.bin.scale.setScalar(this.binPulse ? 1 + Math.sin(t * 6) * 0.06 : 1);
      }
      // スタイのヒントゆれ
      if (this.bibMesh) {
        this.bibMesh.rotation.z = Math.sin(t * 3) * 0.15;
      }

      var it = this.item;
      if (it) {
        // 顔がたべものを追う +「あーん」
        if (it.state === 'drag') {
          baby.lookTarget = it.obj.position;
          var mw = AX.mouthWorld();
          var d = it.obj.position.distanceTo(mw);
          if (d < 0.9 && UI.state.meters.food < 0.95) {
            if (!it.mouthOpenNow) {
              it.mouthOpenNow = true;
              baby.setMouth('open'); // あーん
            }
          } else if (it.mouthOpenNow) {
            it.mouthOpenNow = false;
            baby.setMouth('smile');
          }
        } else if (it.state !== 'suck') {
          baby.lookTarget = null;
        }

        // たべすすめ
        if (it.state === 'eating') {
          var mw2 = AX.mouthWorld();
          it.obj.position.lerp(mw2, Math.min(1, dt * 8));
          it.timer -= dt;
          if (it.timer <= 0) {
            it.timer = 0.55;
            this._doBite();
          }
        }

        // すう
        if (it.state === 'suck') this._updateSucking(dt);

        // トレイへもどる
        if (it.state === 'returning') {
          it.obj.position.lerp(TRAY_POS, Math.min(1, dt * 6));
          if (it.obj.position.distanceTo(TRAY_POS) < 0.05) it.state = 'tray';
        }
      } else {
        baby.lookTarget = null;
      }

      // げっぷヒントのゆれ
      if (this.patHint && this.patHint.parent) {
        this.patHint.position.y += Math.sin(t * 5) * 0.002;
      }
    },

    exit: function () {
      var G = AX.G;
      this._discardItem();
      if (this.towel && this.towel.parent) this.towel.parent.remove(this.towel);
      if (this.patHint && this.patHint.parent) this.patHint.parent.remove(this.patHint);
      AX.removeAll(this.objects);
      this.trayCrumbs = [];
      UI.hideThought();
      G.baby.lookTarget = null;
      G.baby.setSuckling(false);
      G.baby.setBib(false);      // へやではスタイを外す（設定は保持）
      CARE.state.bibOn = false;
      CARE.state.mouthDirt = Math.min(1, G.baby.faceDirtyCount() * 0.2);
      CARE.save();
      G.baby.shadow.visible = true;
    }
  };

  window.ACTIVITIES.feed = feed;
})();
