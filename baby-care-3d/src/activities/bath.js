/* ============================================================
 * activities/bath.js — 🛁 おふろ（工程つき）
 *  phase 1 undress: ふくをぬがせて洗濯かごへ
 *  phase 2 fill   : 蛇口でお湯はり＋赤青ノブで温度調整＋手でたしかめる
 *  phase 3 wash   : 原因つきの汚れをスポンジで／シャンプーで泡ヘア
 *  phase 4 rinse  : シャワーをあてた場所だけ泡がながれおちる
 *  phase 5 dry    : タオルでふく（拭き残し→くしゃみ）→ドライヤー「ブオー」
 * ============================================================ */
(function () {
  'use strict';

  var GOOD_TEMP_MIN = 0.35, GOOD_TEMP_MAX = 0.75;

  var bath = {
    objects: [],
    phase: '',
    temp: 0.5,
    waterLevel: 0,
    filling: false,
    duck: null,
    duckVy: 0,
    foamMeshes: [],   // あたまの泡
    sudsMeshes: [],   // からだの泡（こすったあと）
    dropMeshes: [],   // ぬれたしずく（dryフェーズ）
    shampooUsed: false,
    scrubbing: false,
    showerDrag: false,
    towelDrag: false,
    lastFx: 0,
    sneezeTimer: 6,
    waterY: 0.5,

    enter: function () {
      var G = AX.G;
      var scene = G.scene;
      this.objects = [];
      this.foamMeshes = [];
      this.sudsMeshes = [];
      this.dropMeshes = [];
      this.shampooUsed = false;
      this.waterLevel = 0;
      this.filling = false;
      this.temp = Math.random() < 0.5 ? 0.12 : 0.92;  // さいしょは熱すぎ or 冷たすぎ
      this.sneezeTimer = 6;

      /* --- バスタブ --- */
      var tub = new THREE.Group();
      var tubMat = AX.lambert(0xffffff);
      var wall = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.85, 0.6, 28, 1, true), tubMat);
      wall.material.side = THREE.DoubleSide;
      wall.position.y = 0.3;
      tub.add(wall);
      var bottom = new THREE.Mesh(new THREE.CircleGeometry(0.86, 28), tubMat);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.02;
      tub.add(bottom);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 12, 28), AX.lambert(0xaee4ff));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.6;
      tub.add(rim);
      this.water = new THREE.Mesh(
        new THREE.CircleGeometry(1.0, 28),
        new THREE.MeshLambertMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.55 })
      );
      this.water.rotation.x = -Math.PI / 2;
      this.water.position.y = 0.08;
      this.water.visible = false;
      tub.add(this.water);
      tub.position.set(0.35, 0, 0.3);
      scene.add(tub);
      this.objects.push(tub);
      this.tub = tub;

      /* --- じゃぐち＋あかあおノブ --- */
      var faucet = new THREE.Group();
      var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), AX.lambert(0xcfd8dc));
      pipe.position.y = 0.25;
      faucet.add(pipe);
      var spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 10), AX.lambert(0xcfd8dc));
      spout.rotation.x = Math.PI / 2;
      spout.position.set(0, 0.48, 0.14);
      faucet.add(spout);
      var spoutTip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), AX.lambert(0xb0bec5));
      spoutTip.position.set(0, 0.44, 0.3);
      faucet.add(spoutTip);
      var faucetHit = AX.hitProxy(0.4);
      faucetHit.position.set(0, 0.4, 0.1);
      faucet.add(faucetHit);
      faucet.position.set(0.35, 0.55, -0.5);
      scene.add(faucet);
      this.objects.push(faucet);
      this.faucet = faucet;

      this.knobHot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), AX.lambert(0xe0433a));
      this.knobHot.position.set(0.0, 1.25, -0.45);
      scene.add(this.knobHot);
      this.objects.push(this.knobHot);
      this.knobCold = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), AX.lambert(0x3d8bff));
      this.knobCold.position.set(0.7, 1.25, -0.45);
      scene.add(this.knobCold);
      this.objects.push(this.knobCold);

      // おんどけい（かおつき）
      this.gauge = AX.emojiSprite('😊', 0.4);
      this.gauge.position.set(0.35, 1.95, -0.45);
      scene.add(this.gauge);
      this.objects.push(this.gauge);

      // おゆのながれ（みえたりきえたり）
      this.stream = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.06, 1.0, 10),
        new THREE.MeshLambertMaterial({ color: 0xaadfff, transparent: true, opacity: 0.75 })
      );
      this.stream.position.set(0.35, 0.55, -0.2);
      this.stream.visible = false;
      scene.add(this.stream);
      this.objects.push(this.stream);

      /* --- せんたくかご --- */
      var basket = new THREE.Group();
      var basketBody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.36, 12, 1, true), AX.lambert(0xd9b98a));
      basketBody.material.side = THREE.DoubleSide;
      basketBody.position.y = 0.18;
      basket.add(basketBody);
      var basketBottom = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), AX.lambert(0xd9b98a));
      basketBottom.rotation.x = -Math.PI / 2;
      basketBottom.position.y = 0.005;
      basket.add(basketBottom);
      basket.position.set(1.95, 0, 0.9);
      scene.add(basket);
      this.objects.push(basket);
      this.basket = basket;

      /* --- シャンプーボトル --- */
      this.shampoo = new THREE.Group();
      var shBody = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.22, 10), AX.lambert(0xff9dbf));
      shBody.position.y = 0.11;
      this.shampoo.add(shBody);
      var shPump = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), AX.lambert(0xffffff));
      shPump.position.y = 0.27;
      this.shampoo.add(shPump);
      var shNozzle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.03), AX.lambert(0xffffff));
      shNozzle.position.set(0.04, 0.3, 0);
      this.shampoo.add(shNozzle);
      var shHit = AX.hitProxy(0.3);
      shHit.position.y = 0.15;
      this.shampoo.add(shHit);
      this.shampoo.position.set(-0.75, 0.6, -0.1);
      scene.add(this.shampoo);
      this.objects.push(this.shampoo);

      /* --- スポンジ --- */
      this.sponge = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.18), AX.lambert(0xffe27a));
      var spongeTop = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.18), AX.lambert(0x9dff8a));
      spongeTop.position.y = 0.09;
      this.sponge.add(spongeTop);
      this.sponge.position.set(-0.7, 0.72, 0.75);
      G.scene.add(this.sponge);
      this.objects.push(this.sponge);
      this.spongeHome = this.sponge.position.clone();

      /* --- シャワーヘッド（rinse用・ドラッグでうごく） --- */
      this.showerHead = new THREE.Group();
      var shH = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.07, 12), AX.lambert(0xdddddd));
      this.showerHead.add(shH);
      var shHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 8), AX.lambert(0xbbbbbb));
      shHandle.position.set(0.12, 0.16, 0);
      shHandle.rotation.z = -0.5;
      this.showerHead.add(shHandle);
      this.showerHead.position.set(-0.9, 1.7, 0.4);
      this.showerHead.visible = false;
      G.scene.add(this.showerHead);
      this.objects.push(this.showerHead);

      /* --- タオル / ドライヤー（dry用） --- */
      this.towel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.05), AX.lambert(0xfff3b8));
      this.towel.position.set(1.6, 1.15, 0.2);
      this.towel.visible = false;
      G.scene.add(this.towel);
      this.objects.push(this.towel);
      this.towelHome = this.towel.position.clone();

      this.dryer = new THREE.Group();
      var dBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 12), AX.lambert(0xff8fb3));
      dBody.rotation.z = Math.PI / 2;
      this.dryer.add(dBody);
      var dGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.2, 8), AX.lambert(0xe0538c));
      dGrip.position.set(0.02, -0.14, 0);
      dGrip.rotation.z = 0.3;
      this.dryer.add(dGrip);
      this.dryer.position.set(1.6, 1.15, 0.2);
      this.dryer.visible = false;
      G.scene.add(this.dryer);
      this.objects.push(this.dryer);

      /* --- あかちゃん：タブのよこに立つ --- */
      var baby = G.baby;
      baby.setPose('stand');
      baby.group.position.set(-1.35, 0, 0.75);
      baby.group.rotation.set(0, 0.4, 0);
      baby.setMood('idle');
      baby.shadow.visible = true;

      // よごれを最初からみせる（おふろの動機づけ：原因と場所が一致）
      baby.addDirtSpots(CARE.buildBathDirt());

      if (CARE.state.naked) {
        // もうぬいでいる → お湯はりから
        this._toPhase('fill');
      } else {
        this._toPhase('undress');
      }

      UI.clearContext();
    },

    /* ---------- フェーズ管理 ---------- */

    _toPhase: function (p) {
      var G = AX.G;
      this.phase = p;
      if (p === 'undress') {
        UI.bigFeedback('👕');
        UI.celebrate('おふくを ぬがせてあげよう');
      } else if (p === 'fill') {
        UI.bigFeedback('🚰');
        UI.celebrate('おゆを ためて おんどをちょうせつ！');
      } else if (p === 'wash') {
        UI.bigFeedback('🧽');
        UI.celebrate('ごしごし あらってあげよう');
      } else if (p === 'rinse') {
        this.showerHead.visible = true;
        UI.bigFeedback('🚿');
        UI.celebrate('シャワーで ながそう！');
      } else if (p === 'dry') {
        this.towel.visible = true;
        UI.bigFeedback('🧖');
        UI.celebrate('タオルで ふきふき');
        // ぬれしずくをからだ4かしょへ
        this._addDrops();
        CARE.finishBath();
        this.sneezeTimer = 6;
      } else if (p === 'done') {
        UI.setNeedy('dress', true);  // つぎはおきがえ！
      }
    },

    /* ---------- 入力 ---------- */

    onDown: function (x, y) {
      var G = AX.G;
      var baby = G.baby;

      if (this.phase === 'undress') {
        var hit = G.pick(x, y, [baby.root], true);
        if (hit) this._undress();
        return;
      }

      if (this.phase === 'fill') {
        if (G.pick(x, y, [this.knobHot], false)) {
          this.temp = Math.min(1, this.temp + 0.2);
          SND.play('tap');
          this.knobHot.scale.setScalar(1.25);
          FX.burst('smoke', this.knobHot.position, 1);
          return;
        }
        if (G.pick(x, y, [this.knobCold], false)) {
          this.temp = Math.max(0, this.temp - 0.2);
          SND.play('tap');
          this.knobCold.scale.setScalar(1.25);
          FX.burst('drops', this.knobCold.position, 2);
          return;
        }
        if (G.pick(x, y, [this.faucet], true)) {
          if (this.waterLevel < 1) {
            this.filling = !this.filling;
            SND.play(this.filling ? 'pour' : 'tap');
          }
          return;
        }
        // おゆを手でたしかめる
        if (this.waterLevel >= 1 && G.pick(x, y, [this.water], false)) {
          this._testWater();
          return;
        }
        return;
      }

      if (this.phase === 'wash') {
        // あひる
        if (this.duck && G.pick(x, y, [this.duck], true)) {
          SND.play('quack');
          this.duckVy = 1.6;
          FX.burst('drops', this.duck.position, 5);
          baby.giggle();
          SND.play('giggle');
          G.bumpMeter('happy', 0.03);
          return;
        }
        // シャンプーボトルをプッシュ
        if (G.pick(x, y, [this.shampoo], true)) {
          this._pumpShampoo();
          return;
        }
        this.scrubbing = true;
        this._scrub(x, y);
        return;
      }

      if (this.phase === 'rinse') {
        this.showerDrag = true;
        this._moveShower(x, y);
        return;
      }

      if (this.phase === 'dry') {
        if (G.pick(x, y, [this.dryer], true)) {
          this._useDryer();
          return;
        }
        if (G.pick(x, y, [this.towel], false) || this.towelDrag) {
          this.towelDrag = true;
          return;
        }
        this.towelDrag = true; // どこからでもタオルでOK（4さいむけ）
        return;
      }
    },

    onMove: function (x, y, isDown) {
      if (!isDown) return;
      if (this.phase === 'wash' && this.scrubbing) this._scrub(x, y);
      if (this.phase === 'rinse' && this.showerDrag) this._moveShower(x, y);
      if (this.phase === 'dry' && this.towelDrag) this._towelWipe(x, y);
    },

    onUp: function () {
      this.scrubbing = false;
      this.showerDrag = false;
      this.towelDrag = false;
    },

    /* ---------- 1. ぬがせる ---------- */

    _undress: function () {
      var G = AX.G;
      var baby = G.baby;
      SND.play('whoosh');
      SND.play('pop');
      // ふくがとんでいく（スプライト）
      var cloth = new THREE.Sprite(new THREE.SpriteMaterial({
        map: FX.emojiTexture('👕', 128), transparent: true
      }));
      cloth.scale.set(0.5, 0.5, 1);
      cloth.position.copy(AX.chestWorld());
      G.scene.add(cloth);
      this.objects.push(cloth);
      this.flyingCloth = { obj: cloth, t: 0 };

      // ワードローブ更新：シミつきなら「dirty」
      var key = this._currentOutfitKey();
      CARE.state.wardrobe[key] = CARE.clothesDirty() ? 'dirty' : 'clean';
      CARE.state.clothesStains = [];
      CARE.save();
      baby.clearStains();
      baby.setNaked(true);
      CARE.state.naked = true;
      baby.setMood('excited');   // おふろだ！わくわく
      SND.play('giggle');
      UI.bigFeedback('🧺');
      var self = this;
      setTimeout(function () {
        if (AX.G.currentName === 'bath') {
          baby.setMood('idle');
          self._toPhase('fill');
        }
      }, 1100);
    },

    _currentOutfitKey: function () {
      if (CARE.state.outfitStyle === 'rain') return 'rain';
      if (CARE.state.outfitStyle === 'pajama') return 'pajama';
      return ('000000' + AX.G.baby.outfitColor.toString(16)).slice(-6);
    },

    /* ---------- 2. おゆはり＋おんど ---------- */

    _testWater: function () {
      var G = AX.G;
      var baby = G.baby;
      FX.burst('drops', new THREE.Vector3(0.35, this._waterTopY() + 0.1, 0.6), 4);
      SND.play('splash');
      if (this.temp > GOOD_TEMP_MAX) {
        // あちち！
        baby.setMood('surprised');
        SND.play('sadBaby');
        UI.bigFeedback('🥵');
        FX.burst('smoke', new THREE.Vector3(0.35, this._waterTopY() + 0.3, 0.5), 5);
        this._moodResetSoon();
      } else if (this.temp < GOOD_TEMP_MIN) {
        // つめたい…ぶるぶる
        baby.giggle(); // ぶるぶるはgiggleの震えで代用
        baby.setMood('pout');
        SND.play('shiver');
        UI.bigFeedback('🥶');
        this._moodResetSoon();
      } else {
        // ちょうどいい！ざぶーん
        SND.play('chime');
        UI.bigFeedback('👌');
        this._babyIntoTub();
      }
    },

    _babyIntoTub: function () {
      var G = AX.G;
      var baby = G.baby;
      baby.setMood('excited');
      this.hopT = 0;
      this.hopFrom = baby.group.position.clone();
      this.hopTo = new THREE.Vector3(0.35, 0.22, 0.3);
      this.hopping = true;
    },

    _finishHop: function () {
      var G = AX.G;
      var baby = G.baby;
      this.hopping = false;
      baby.setPose('sit');
      baby.group.position.copy(this.hopTo);
      baby.group.rotation.set(0, 0, 0);
      baby.shadow.visible = false;
      SND.play('splash');
      FX.burst('drops', new THREE.Vector3(0.35, 0.7, 0.7), 8);
      FX.burst('bubbles', new THREE.Vector3(0.35, 0.7, 0.6), 6);
      baby.giggle();
      SND.play('giggle');

      // あひるをうかべる
      var duck = new THREE.Group();
      var duckMat = AX.lambert(0xffd93d);
      var dBody = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), duckMat);
      dBody.scale.set(1.25, 0.95, 1);
      var dHead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), duckMat);
      dHead.position.set(0.12, 0.14, 0);
      var dBeak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 8), AX.lambert(0xff8a3d));
      dBeak.rotation.z = -Math.PI / 2;
      dBeak.position.set(0.22, 0.13, 0);
      var dEye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), AX.lambert(0x333333));
      dEye.position.set(0.16, 0.18, 0.06);
      duck.add(dBody); duck.add(dHead); duck.add(dBeak); duck.add(dEye);
      duck.position.set(0.95, this._waterTopY() + 0.06, 0.75);
      AX.G.scene.add(duck);
      this.objects.push(duck);
      this.duck = duck;

      this._toPhase('wash');
    },

    _waterTopY: function () {
      return 0.08 + this.waterLevel * 0.42;
    },

    /* ---------- 3. あらう ---------- */

    _pumpShampoo: function () {
      var G = AX.G;
      SND.play('bubble');
      this.shampoo.scale.y = 0.85;
      this.shampooUsed = true;
      // あたまに泡のたね
      this._addFoam(2);
      FX.burst('foam', AX.headWorld(), 4);
      UI.bigFeedback('🧴');
    },

    _addFoam: function (n) {
      var G = AX.G;
      for (var i = 0; i < n && this.foamMeshes.length < 10; i++) {
        var f = new THREE.Mesh(
          new THREE.SphereGeometry(0.07 + Math.random() * 0.05, 8, 8),
          new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
        );
        var ang = Math.random() * Math.PI * 2;
        var r = Math.random() * 0.18;
        var stack = this.foamMeshes.length * 0.045;
        f.position.set(Math.cos(ang) * r, 0.26 + stack, Math.sin(ang) * r * 0.6);
        G.baby.head.add(f);
        this.foamMeshes.push(f);
      }
    },

    _scrub: function (x, y) {
      var G = AX.G;
      var baby = G.baby;
      var hit = G.pick(x, y, [baby.root], true);
      var now = performance.now();
      if (!hit) {
        // みずをぱしゃぱしゃ
        if (now - this.lastFx > 240) {
          var p = G.rayPlane(x, y, new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.6));
          if (p && p.y < 1.0 && Math.abs(p.x - 0.35) < 1.2) {
            this.lastFx = now;
            SND.play('bubble');
            FX.burst('bubbles', new THREE.Vector3(p.x, this._waterTopY() + 0.1, 0.7), 2);
          }
        }
        return;
      }

      this.sponge.position.copy(hit.point);
      this.sponge.position.z += 0.12;

      // あたまをこする → 泡がそだつ
      var headWorldPos = AX.headWorld();
      if (this.shampooUsed && hit.point.distanceTo(headWorldPos) < 0.45) {
        if (now - this.lastFx > 140) {
          this.lastFx = now;
          this._addFoam(1);
          FX.burst('foam', hit.point, 2);
          SND.play('squeak');
          // うえへドラッグすると泡タワー（ツノ・モヒカン）
          if (this._lastScrubY != null && this._lastScrubY - y > 14 && this.foamMeshes.length >= 3) {
            var top = this.foamMeshes[this.foamMeshes.length - 1];
            top.position.y += 0.05;
            top.scale.setScalar(Math.min(1.6, top.scale.x + 0.12));
            FX.burst('sparkle', hit.point, 1);
          }
        }
        this._lastScrubY = y;
      } else {
        if (now - this.lastFx > 120) {
          this.lastFx = now;
          FX.burst('foam', hit.point, 2);
          SND.play('squeak');
        }
        // よごれをこすりおとす → そこに泡がのこる（すすぎのターゲット）
        var removed = baby.scrubAt(hit.point, 0.3);
        if (removed && Math.random() < 0.8) this._addSuds(hit.point);
      }

      this._checkWashDone();
    },

    _addSuds: function (worldPoint) {
      var G = AX.G;
      var s = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.03, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
      );
      // ワールド→torsoローカルへ
      var local = worldPoint.clone();
      G.baby.torso.worldToLocal(local);
      s.position.copy(local);
      G.baby.torso.add(s);
      this.sudsMeshes.push(s);
    },

    _checkWashDone: function () {
      var G = AX.G;
      if (this.phase !== 'wash') return;
      if (G.baby.dirtMeshes.length === 0 && this.shampooUsed && this.foamMeshes.length >= 4) {
        this._toPhase('rinse');
      } else if (G.baby.dirtMeshes.length === 0 && !this.shampooUsed && !this._shampooHinted) {
        // からだはきれい → シャンプーをわすれずに！
        this._shampooHinted = true;
        UI.bigFeedback('🧴');
        UI.celebrate('シャンプーで あたまも あらおう！');
        SND.play('chime');
      }
    },

    /* ---------- 4. すすぎ（あてた場所だけ） ---------- */

    _moveShower: function (x, y) {
      var G = AX.G;
      var p = G.rayPlane(x, y, new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5));
      if (!p) return;
      this.showerHead.position.set(p.x, Math.max(1.2, Math.min(2.2, p.y)), 0.5);
      this.showerRinsing = true;
    },

    _rinseUpdate: function (dt, t) {
      var G = AX.G;
      if (!this.showerDrag) return;
      var hx = this.showerHead.position.x;
      // みずがふる
      var now = performance.now();
      if (now - this.lastFx > 90) {
        this.lastFx = now;
        FX.burst('drops', new THREE.Vector3(hx, this.showerHead.position.y - 0.2, 0.55), 3);
        if (Math.random() < 0.25) SND.play('bubble');
      }
      // シャワーのましたにある泡だけがながれおちる
      var tmp = new THREE.Vector3();
      var i;
      for (i = this.foamMeshes.length - 1; i >= 0; i--) {
        this.foamMeshes[i].getWorldPosition(tmp);
        if (Math.abs(tmp.x - hx) < 0.32) {
          this._washAwayFoam(this.foamMeshes[i], tmp);
          this.foamMeshes.splice(i, 1);
        }
      }
      for (i = this.sudsMeshes.length - 1; i >= 0; i--) {
        this.sudsMeshes[i].getWorldPosition(tmp);
        if (Math.abs(tmp.x - hx) < 0.32) {
          this._washAwayFoam(this.sudsMeshes[i], tmp);
          this.sudsMeshes.splice(i, 1);
        }
      }
      if (this.foamMeshes.length === 0 && this.sudsMeshes.length === 0) {
        // ぜんぶながれた！
        this.showerHead.visible = false;
        SND.play('chime');
        var self = this;
        setTimeout(function () {
          if (AX.G.currentName === 'bath') self._toPhase('dry');
        }, 500);
      }
    },

    _washAwayFoam: function (mesh, worldPos) {
      // かた→からだ→みずめんへ、ながれおちる演出
      if (mesh.parent) mesh.parent.remove(mesh);
      FX.burst('foam', worldPos, 3);
      FX.burst('drops', worldPos, 2);
      if (Math.random() < 0.4) SND.play('bubble');
    },

    /* ---------- 5. ふく＆かわかす ---------- */

    _addDrops: function () {
      var G = AX.G;
      var baby = G.baby;
      var zones = [
        { parent: baby.head, pos: [0.15, 0.15, 0.2] },
        { parent: baby.head, pos: [-0.18, 0.05, 0.2] },
        { parent: baby.torso, pos: [0.12, 0.1, 0.18] },
        { parent: baby.torso, pos: [-0.14, -0.05, 0.18] },
        { parent: baby.armL, pos: [0, -0.15, 0.06] },
        { parent: baby.armR, pos: [0, -0.15, 0.06] }
      ];
      for (var i = 0; i < zones.length; i++) {
        var d = new THREE.Mesh(
          new THREE.SphereGeometry(0.035, 8, 8),
          new THREE.MeshLambertMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.9 })
        );
        d.position.set(zones[i].pos[0], zones[i].pos[1], zones[i].pos[2]);
        d.scale.set(0.8, 1.2, 0.6);
        zones[i].parent.add(d);
        this.dropMeshes.push(d);
      }
      // タブからマットのうえへ
      var baby2 = G.baby;
      baby2.setPose('stand');
      baby2.group.position.set(-1.2, 0, 0.85);
      baby2.group.rotation.set(0, 0.3, 0);
      baby2.shadow.visible = true;
    },

    _towelWipe: function (x, y) {
      var G = AX.G;
      var p = G.rayPlane(x, y, new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.85));
      if (p) this.towel.position.set(p.x, p.y, 0.95);
      var hit = G.pick(x, y, [G.baby.root], true);
      if (!hit) return;
      var now = performance.now();
      if (now - this.lastFx < 200) return;
      var tmp = new THREE.Vector3();
      for (var i = this.dropMeshes.length - 1; i >= 0; i--) {
        this.dropMeshes[i].getWorldPosition(tmp);
        if (tmp.distanceTo(hit.point) < 0.3) {
          this.lastFx = now;
          if (this.dropMeshes[i].parent) this.dropMeshes[i].parent.remove(this.dropMeshes[i]);
          this.dropMeshes.splice(i, 1);
          SND.play('squeak');
          FX.burst('sparkle', hit.point, 2);
          this.sneezeTimer = 6; // ふいてあげたのでリセット
          if (this.dropMeshes.length === 0) {
            // ぜんぶふけた → ドライヤーの出番
            this.towel.visible = false;
            this.dryer.visible = true;
            UI.bigFeedback('💨');
            UI.celebrate('ドライヤーで かわかそう！');
            SND.play('chime');
          }
          return;
        }
      }
    },

    _useDryer: function () {
      var G = AX.G;
      var baby = G.baby;
      SND.play('dryer');
      SND.play('hairFlutter');
      baby.curlFlutter = 1.3;
      this.dryer.position.set(-0.5, 1.5, 0.8);
      this.dryerBlast = 1.3;
      var self = this;
      setTimeout(function () {
        if (AX.G.currentName !== 'bath') return;
        self._finishBathAll();
      }, 1400);
    },

    _finishBathAll: function () {
      var G = AX.G;
      var baby = G.baby;
      this.dryer.visible = false;
      CARE.state.wet = false;
      CARE.save();
      G.bumpMeter('clean', 1);
      baby.setMood('happy');
      baby.clap();
      SND.play('tada');
      UI.bigFeedback('✨');
      UI.celebrate('ぴかぴか！ つぎは おきがえ！');
      FX.burst('sparkle', AX.headWorld(), 14);
      FX.burst('stars', AX.headWorld(), 8);
      UI.addStars(3, G.onSticker);
      this._toPhase('done');
      this._moodResetSoon();
    },

    _moodResetSoon: function () {
      setTimeout(function () {
        if (AX.G.currentName === 'bath' && AX.G.baby.mood !== 'idle') AX.G.baby.setMood('idle');
      }, 1500);
    },

    /* ---------- 毎フレーム ---------- */

    update: function (dt, t) {
      var G = AX.G;
      var baby = G.baby;

      // ノブのもどり
      this.knobHot.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 6);
      this.knobCold.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 6);
      this.shampoo.scale.y += (1 - this.shampoo.scale.y) * dt * 8;

      // おんどけいのかお
      var face = this.temp > GOOD_TEMP_MAX ? '🥵' : this.temp < GOOD_TEMP_MIN ? '🥶' : '😊';
      if (this._gaugeFace !== face) {
        this._gaugeFace = face;
        this.gauge.material.map = FX.emojiTexture(face, 64);
        this.gauge.material.needsUpdate = true;
      }

      // おゆはり
      if (this.filling && this.waterLevel < 1) {
        this.waterLevel = Math.min(1, this.waterLevel + dt * 0.22);
        this.water.visible = true;
        this.stream.visible = true;
        this.stream.position.y = 0.55;
        this.stream.scale.y = 1;
        if (Math.random() < dt * 4) SND.play('pour');
        FX.burst('drops', new THREE.Vector3(0.35, this._waterTopY() + 0.1, 0.15), 1);
        if (this.waterLevel >= 1) {
          this.filling = false;
          this.stream.visible = false;
          SND.play('chime');
          UI.bigFeedback('✋');
          UI.celebrate('てで おんどを たしかめてみよう');
        }
      } else {
        this.stream.visible = false;
      }
      this.water.position.y = this._waterTopY() + Math.sin(t * 2.5) * 0.012;

      // おゆのいろ（あついと赤っぽく・つめたいと青く）
      if (this.water.visible) {
        var wr = 0.44 + this.temp * 0.45;
        var wg = 0.75 - Math.abs(this.temp - 0.5) * 0.3;
        var wb = 1.0 - this.temp * 0.35;
        this.water.material.color.setRGB(wr, wg, wb);
        // あついと湯気
        if (this.temp > GOOD_TEMP_MAX && Math.random() < dt * 3) {
          FX.burst('smoke', new THREE.Vector3(0.35 + (Math.random() - 0.5), this._waterTopY() + 0.2, 0.4), 1);
        }
      }

      // ざぶーんジャンプ
      if (this.hopping) {
        this.hopT = Math.min(1, this.hopT + dt * 1.6);
        var k = this.hopT;
        var pos = this.hopFrom.clone().lerp(this.hopTo, k);
        pos.y += Math.sin(k * Math.PI) * 0.8;
        baby.group.position.copy(pos);
        if (this.hopT >= 1) this._finishHop();
      }

      // ふくがかごへとんでいく
      if (this.flyingCloth) {
        var fc = this.flyingCloth;
        fc.t = Math.min(1, fc.t + dt * 1.4);
        var target = this.basket.position.clone().setY(0.35);
        fc.obj.position.lerp(target, fc.t * fc.t);
        fc.obj.position.y += Math.sin(fc.t * Math.PI) * 0.5 * (1 - fc.t);
        fc.obj.material.rotation += dt * 5;
        if (fc.t >= 1) {
          FX.burst('sparkle', target, 3);
          SND.play('pofu');
          if (fc.obj.parent) fc.obj.parent.remove(fc.obj);
          this.flyingCloth = null;
        }
      }

      // あひるのぷかぷか
      if (this.duck) {
        this.duckVy -= 4.5 * dt;
        this.duck.position.y += this.duckVy * dt;
        var floatY = this._waterTopY() + 0.06 + Math.sin(t * 2.2) * 0.03;
        if (this.duck.position.y < floatY) {
          this.duck.position.y = floatY;
          this.duckVy = 0;
        }
        this.duck.rotation.z = Math.sin(t * 2.0) * 0.12;
        this.duck.rotation.y = Math.sin(t * 0.7) * 0.5;
      }

      // スポンジがおうちへ
      if (!this.scrubbing && this.sponge) {
        this.sponge.position.lerp(this.spongeHome, dt * 3);
      }

      // すすぎ
      if (this.phase === 'rinse') this._rinseUpdate(dt, t);

      // ふきのこし → くしゃみ＆ぶるぶる
      if (this.phase === 'dry' && this.dropMeshes.length > 0) {
        this.sneezeTimer -= dt;
        if (this.sneezeTimer <= 0) {
          this.sneezeTimer = 6;
          SND.play('sneeze');
          baby.setMood('surprised');
          baby.giggle(); // ぶるっ
          UI.bigFeedback('🤧');
          FX.burst('drops', AX.headWorld(), 4);
          this._moodResetSoon();
        }
      }

      // ドライヤーのかぜ
      if (this.dryerBlast > 0) {
        this.dryerBlast -= dt;
        if (Math.random() < dt * 10) {
          FX.burst('sparkle', AX.headWorld(), 1);
          FX.burst('smoke', AX.headWorld(), 1);
        }
      }
    },

    exit: function () {
      var G = AX.G;
      AX.removeAll(this.objects);
      G.baby.clearDirt();
      // のこった泡・しずくはかたづける（データ上はwetのまま＝ふきのこし痕跡）
      var i;
      for (i = 0; i < this.foamMeshes.length; i++) {
        if (this.foamMeshes[i].parent) this.foamMeshes[i].parent.remove(this.foamMeshes[i]);
      }
      for (i = 0; i < this.sudsMeshes.length; i++) {
        if (this.sudsMeshes[i].parent) this.sudsMeshes[i].parent.remove(this.sudsMeshes[i]);
      }
      // しずくはのこす（ふきのこしはへやでもポタポタ）→ ただし多すぎないよう2つまで
      for (i = this.dropMeshes.length - 1; i >= 2; i--) {
        if (this.dropMeshes[i].parent) this.dropMeshes[i].parent.remove(this.dropMeshes[i]);
        this.dropMeshes.splice(i, 1);
      }
      this.foamMeshes = [];
      this.sudsMeshes = [];
      this.duck = null;
      this.water = null;
      G.baby.shadow.visible = true;
      if (G.baby.pose !== 'stand') G.baby.setPose('stand');
    }
  };

  window.ACTIVITIES.bath = bath;
})();
