/* ============================================================
 * activities.js — 5つのおせわアクティビティ
 * ごはん / おふろ / きせかえ / あそぶ / ねんね
 * 各アクティビティ: enter / exit / update / onDown / onMove / onUp
 * ============================================================ */
(function () {
  'use strict';

  var G = null; // main.js から渡される共有コンテキスト

  function lambert(color) { return new THREE.MeshLambertMaterial({ color: color }); }

  function makeEmojiSprite(emoji, scale) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.emojiTexture(emoji, 128), transparent: true }));
    sp.scale.set(scale, scale, 1);
    return sp;
  }

  function removeAll(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].parent) list[i].parent.remove(list[i]);
    }
    list.length = 0;
  }

  function headWorld() {
    var v = new THREE.Vector3();
    G.baby.head.getWorldPosition(v);
    return v;
  }

  function mouthWorld() {
    var v = new THREE.Vector3(0, -0.09, 0.26);
    G.baby.head.localToWorld(v);
    return v;
  }

  /* ============================================================
   * 🍼 ごはん
   * ============================================================ */
  var FOODS = [
    { id: 'apple', e: '🍎', drink: false },
    { id: 'banana', e: '🍌', drink: false },
    { id: 'bottle', e: '🍼', drink: true },
    { id: 'riceball', e: '🍙', drink: false },
    { id: 'cookie', e: '🍪', drink: false },
    { id: 'juice', e: '🧃', drink: true }
  ];

  var feed = {
    objects: [],
    drag: null,      // {sprite, food}
    eating: null,    // {sprite, food, phase, timer, bites}
    falling: null,   // {sprite, vy}
    request: null,
    dragPlane: null,

    enter: function () {
      var scene = G.scene;
      this.objects = [];
      this.drag = null; this.eating = null; this.falling = null;

      // ハイチェア
      var chair = new THREE.Group();
      var seatMat = lambert(0xf0b47a);
      var seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 0.7), seatMat);
      seat.position.y = 0.42;
      chair.add(seat);
      var back = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.1), seatMat);
      back.position.set(0, 0.75, -0.32);
      chair.add(back);
      for (var i = 0; i < 4; i++) {
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.44, 8), lambert(0xd99a5b));
        leg.position.set((i % 2 ? 1 : -1) * 0.3, 0.2, (i < 2 ? 1 : -1) * 0.26);
        chair.add(leg);
      }
      // テーブルトレイ
      var tray = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.45), lambert(0xffffff));
      tray.position.set(0, 0.78, 0.5);
      chair.add(tray);
      var trayRim = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.06), lambert(0xffd44d));
      trayRim.position.set(0, 0.83, 0.71);
      chair.add(trayRim);
      chair.position.set(0, 0, 0.35);
      scene.add(chair);
      this.objects.push(chair);

      // おさら
      var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.04, 20), lambert(0xaee4ff));
      plate.position.set(0.28, 0.83, 0.85);
      scene.add(plate);
      this.objects.push(plate);

      // あかちゃんをすわらせる
      G.baby.setPose('sit');
      G.baby.group.position.set(0, 0.32, 0.32);
      G.baby.group.rotation.set(0, 0, 0);
      G.baby.setMood('idle');
      G.baby.shadow.visible = false;

      this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.15);
      this._newRequest(true);
      this._buildContext();
    },

    _buildContext: function () {
      var self = this;
      UI.setContext(FOODS.map(function (f) {
        return { id: f.id, emoji: f.e };
      }), function (id) {
        self._startDrag(id);
      });
    },

    _newRequest: function (force) {
      if (!force && Math.random() < 0.25) { this.request = null; UI.hideThought(); return; }
      this.request = FOODS[Math.floor(Math.random() * FOODS.length)];
    },

    _startDrag: function (id) {
      if (this.eating) return;
      if (this.drag) this._cancelDrag();
      var food = null;
      for (var i = 0; i < FOODS.length; i++) if (FOODS[i].id === id) food = FOODS[i];
      if (!food) return;
      var sp = makeEmojiSprite(food.e, 0.5);
      sp.position.set(0, 0.9, 1.15);
      G.scene.add(sp);
      this.drag = { sprite: sp, food: food };
      SND.play('pop');
    },

    _cancelDrag: function () {
      if (!this.drag) return;
      this.falling = { sprite: this.drag.sprite, vy: 0 };
      this.drag = null;
    },

    onDown: function (x, y) {
      // トレイのうえのたべものをタップしてもOK（ドラッグちゅうなら何もしない）
    },

    onMove: function (x, y, isDown) {
      if (this.drag) {
        var p = G.rayPlane(x, y, this.dragPlane);
        if (p) {
          p.y = Math.max(0.35, Math.min(2.2, p.y));
          p.x = Math.max(-2.2, Math.min(2.2, p.x));
          this.drag.sprite.position.copy(p);
        }
      }
    },

    onUp: function (x, y) {
      if (!this.drag) return;
      var mw = mouthWorld();
      var sp = this.drag.sprite;
      var d = Math.sqrt(
        Math.pow(sp.position.x - mw.x, 2) + Math.pow(sp.position.y - mw.y, 2)
      );
      if (d < 0.55) {
        this.eating = { sprite: sp, food: this.drag.food, timer: 0, bites: 0 };
        this.drag = null;
        G.baby.setMood('eat');
      } else {
        SND.play('boing');
        this._cancelDrag();
      }
    },

    update: function (dt, t) {
      // リクエストふきだし
      if (this.request) {
        var hw = headWorld();
        hw.y += 0.45; hw.x += 0.4;
        var s = G.project(hw);
        UI.showThought(this.request.e, s.x, s.y);
      } else {
        UI.hideThought();
      }

      // たべるアニメ
      if (this.eating) {
        var e = this.eating;
        var mw = mouthWorld();
        e.sprite.position.lerp(mw, Math.min(1, dt * 8));
        e.timer -= dt;
        if (e.timer <= 0 && e.sprite.position.distanceTo(mw) < 0.15) {
          e.bites++;
          e.timer = 0.42;
          G.baby.chew();
          if (e.food.drink) {
            SND.play('gulp');
            FX.burst('bubbles', mw, 2);
          } else {
            SND.play('munch');
            FX.burst('crumbs', mw, 5);
          }
          var sc = e.sprite.scale.x * 0.62;
          e.sprite.scale.set(sc, sc, 1);
          if (e.bites >= 3) this._finishEating();
        }
      }

      // おちたたべもの
      if (this.falling) {
        this.falling.vy -= 5 * dt;
        this.falling.sprite.position.y += this.falling.vy * dt;
        if (this.falling.sprite.position.y < 0.15) {
          FX.burst('crumbs', this.falling.sprite.position, 6);
          G.scene.remove(this.falling.sprite);
          this.falling = null;
        }
      }
    },

    _finishEating: function () {
      var e = this.eating;
      G.scene.remove(e.sprite);
      var mw = mouthWorld();
      var matched = this.request && this.request.id === e.food.id;
      G.baby.setMood('happy');
      G.baby.bounce();
      SND.play('happyBaby');
      FX.burst('hearts', mw, matched ? 10 : 5);
      G.bumpMeter('food', 0.22);
      if (matched) {
        UI.bigFeedback('😋');
        FX.burst('confetti', headWorld(), 14);
        SND.play('chime');
        UI.addStars(2, G.onSticker);
      } else {
        UI.bigFeedback('😊');
        UI.addStars(1, G.onSticker);
      }
      this.eating = null;
      var self = this;
      setTimeout(function () {
        if (G.currentName === 'feed') {
          G.baby.setMood('idle');
          self._newRequest(false);
        }
      }, 1200);
    },

    exit: function () {
      if (this.drag) { G.scene.remove(this.drag.sprite); this.drag = null; }
      if (this.eating) { G.scene.remove(this.eating.sprite); this.eating = null; }
      if (this.falling) { G.scene.remove(this.falling.sprite); this.falling = null; }
      removeAll(this.objects);
      UI.hideThought();
      G.baby.shadow.visible = true;
    }
  };

  /* ============================================================
   * 🛁 おふろ
   * ============================================================ */
  var bath = {
    objects: [],
    duck: null,
    duckVy: 0,
    sponge: null,
    scrubbing: false,
    rinsed: false,
    shower: 0,
    showerHead: null,
    lastSqueak: 0,
    lastFoam: 0,
    waterY: 0.5,

    enter: function () {
      var scene = G.scene;
      this.objects = [];
      this.rinsed = false;
      this.shower = 0;

      // バスタブ
      var tub = new THREE.Group();
      var tubMat = lambert(0xffffff);
      var wall = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.85, 0.6, 28, 1, true), tubMat);
      wall.material.side = THREE.DoubleSide;
      wall.position.y = 0.3;
      tub.add(wall);
      var bottom = new THREE.Mesh(new THREE.CircleGeometry(0.86, 28), tubMat);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.02;
      tub.add(bottom);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 12, 28), lambert(0xaee4ff));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.6;
      tub.add(rim);
      // みず
      var water = new THREE.Mesh(
        new THREE.CircleGeometry(1.0, 28),
        new THREE.MeshLambertMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.55 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = this.waterY;
      tub.add(water);
      this.water = water;
      tub.position.set(0, 0, 0.35);
      scene.add(tub);
      this.objects.push(tub);
      this.tub = tub;

      // あひるちゃん
      var duck = new THREE.Group();
      var duckMat = lambert(0xffd93d);
      var dBody = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), duckMat);
      dBody.scale.set(1.25, 0.95, 1);
      var dHead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), duckMat);
      dHead.position.set(0.12, 0.14, 0);
      var dBeak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 8), lambert(0xff8a3d));
      dBeak.rotation.z = -Math.PI / 2;
      dBeak.position.set(0.22, 0.13, 0);
      var dEye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), lambert(0x333333));
      dEye.position.set(0.16, 0.18, 0.06);
      duck.add(dBody); duck.add(dHead); duck.add(dBeak); duck.add(dEye);
      duck.position.set(0.6, this.waterY + 0.06, 0.75);
      scene.add(duck);
      this.objects.push(duck);
      this.duck = duck;
      this.duckVy = 0;

      // スポンジ
      var sponge = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.18), lambert(0xffe27a));
      sponge.position.set(-0.75, this.waterY + 0.08, 0.75);
      var spongeTop = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.18), lambert(0x9dff8a));
      spongeTop.position.y = 0.09;
      sponge.add(spongeTop);
      scene.add(sponge);
      this.objects.push(sponge);
      this.sponge = sponge;
      this.spongeHome = sponge.position.clone();

      // シャワーヘッド（うえから）
      var sh = new THREE.Group();
      var shPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), lambert(0xcccccc));
      shPipe.position.y = 0.25;
      var shHead = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 14), lambert(0xdddddd));
      sh.add(shPipe); sh.add(shHead);
      sh.position.set(0, 2.2, 0.35);
      sh.visible = false;
      scene.add(sh);
      this.objects.push(sh);
      this.showerHead = sh;

      // あかちゃん：おふろにイン（よごれつき）
      G.baby.setPose('sit');
      G.baby.group.position.set(0, 0.22, 0.35);
      G.baby.group.rotation.set(0, 0, 0);
      G.baby.setMood('idle');
      G.baby.addDirt(6);
      G.baby.shadow.visible = false;

      this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.6);
      UI.clearContext();
      UI.bigFeedback('🧽');
      SND.play('splash');
      FX.burst('bubbles', new THREE.Vector3(0, 0.8, 0.6), 8);
    },

    onDown: function (x, y) {
      // あひるちゃん
      var hit = G.pick(x, y, [this.duck], true);
      if (hit) {
        SND.play('quack');
        this.duckVy = 1.6;
        FX.burst('drops', this.duck.position, 5);
        FX.burst('bubbles', this.duck.position, 3);
        G.baby.giggle();
        SND.play('giggle');
        G.bumpMeter('happy', 0.03);
        return;
      }
      this.scrubbing = true;
      this._scrub(x, y);
    },

    onMove: function (x, y, isDown) {
      if (isDown && this.scrubbing) this._scrub(x, y);
    },

    onUp: function () {
      this.scrubbing = false;
    },

    _scrub: function (x, y) {
      var hit = G.pick(x, y, [G.baby.root], true);
      var now = performance.now();
      if (hit) {
        this.sponge.position.copy(hit.point);
        this.sponge.position.z += 0.12;
        if (now - this.lastFoam > 90) {
          this.lastFoam = now;
          FX.burst('foam', hit.point, 2);
          FX.burst('bubbles', hit.point, 1);
        }
        if (now - this.lastSqueak > 260) {
          this.lastSqueak = now;
          SND.play('squeak');
        }
        var removed = G.baby.scrubAt(hit.point, 0.3);
        if (removed && G.baby.dirtMeshes.length === 0 && !this.rinsed) {
          this._allClean();
        }
      } else {
        // みずをぱしゃぱしゃ
        var p = G.rayPlane(x, y, this.dragPlane);
        if (p && p.y < 1.0 && Math.abs(p.x) < 1.2 && now - this.lastFoam > 200) {
          this.lastFoam = now;
          SND.play('bubble');
          FX.burst('bubbles', new THREE.Vector3(p.x, this.waterY + 0.1, 0.7), 2);
        }
      }
    },

    _allClean: function () {
      var self = this;
      UI.bigFeedback('🚿');
      SND.play('chime');
      this.showerHead.visible = true;
      UI.setContext([{ id: 'shower', emoji: '🚿' }], function (id) {
        if (id === 'shower' && self.shower <= 0 && !self.rinsed) {
          self.shower = 2.2;
          SND.play('shower');
          UI.clearContext();
        }
      });
    },

    update: function (dt, t) {
      // あひるのぷかぷか
      if (this.duck) {
        this.duckVy -= 4.5 * dt;
        this.duck.position.y += this.duckVy * dt;
        var floatY = this.waterY + 0.06 + Math.sin(t * 2.2) * 0.03;
        if (this.duck.position.y < floatY) {
          this.duck.position.y = floatY;
          this.duckVy = 0;
        }
        this.duck.rotation.z = Math.sin(t * 2.0) * 0.12;
        this.duck.rotation.y = Math.sin(t * 0.7) * 0.5;
      }

      // スポンジがおうちへもどる
      if (!this.scrubbing && this.sponge) {
        this.sponge.position.lerp(this.spongeHome, dt * 3);
      }

      // みずのゆらゆら
      if (this.water) {
        this.water.position.y = this.waterY + Math.sin(t * 2.5) * 0.012;
      }

      // シャワー
      if (this.shower > 0) {
        this.shower -= dt;
        var top = new THREE.Vector3(G.baby.group.position.x, 2.0, G.baby.group.position.z);
        FX.burst('drops', top, 3);
        if (Math.random() < 0.2) SND.play('bubble');
        if (this.shower <= 0) this._finishBath();
      }
    },

    _finishBath: function () {
      this.rinsed = true;
      this.showerHead.visible = false;
      G.bumpMeter('clean', 1);
      G.baby.setMood('happy');
      G.baby.clap();
      SND.play('tada');
      UI.bigFeedback('✨');
      UI.celebrate('ぴかぴか！');
      FX.burst('sparkle', headWorld(), 14);
      FX.burst('stars', headWorld(), 8);
      UI.addStars(3, G.onSticker);
      var self = this;
      setTimeout(function () {
        if (G.currentName === 'bath') G.baby.setMood('idle');
      }, 1800);
    },

    exit: function () {
      removeAll(this.objects);
      G.baby.clearDirt();
      G.baby.shadow.visible = true;
      this.duck = null;
      this.sponge = null;
      this.water = null;
    }
  };

  /* ============================================================
   * 👕 きせかえ
   * ============================================================ */
  var OUTFIT_COLORS = [0xffd44d, 0xff6fa5, 0x7fd8ff, 0x9dff8a, 0xc9a6ff, 0xffab6b];
  var HATS = [
    { id: 'none', e: '🙂' },
    { id: 'cap', e: '🧢' },
    { id: 'bow', e: '🎀' },
    { id: 'crown', e: '👑' },
    { id: 'bear', e: '🐻' },
    { id: 'party', e: '🎉' },
    { id: 'flower', e: '🌼' }
  ];

  var dress = {
    objects: [],
    flashEl: null,

    enter: function () {
      var scene = G.scene;
      this.objects = [];

      // ステージ
      var podium = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.16, 28), lambert(0xffc0d5));
      podium.position.set(0, 0.08, 0.35);
      scene.add(podium);
      this.objects.push(podium);
      var podiumTop = new THREE.Mesh(new THREE.CircleGeometry(0.82, 28), lambert(0xffe0ec));
      podiumTop.rotation.x = -Math.PI / 2;
      podiumTop.position.set(0, 0.165, 0.35);
      scene.add(podiumTop);
      this.objects.push(podiumTop);

      // かがみ
      var mirror = new THREE.Group();
      var mFrame = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 12, 28), lambert(0xffd44d));
      var mGlass = new THREE.Mesh(new THREE.CircleGeometry(0.52, 28), lambert(0xd0f0ff));
      mirror.add(mFrame); mirror.add(mGlass);
      mirror.position.set(-1.6, 1.3, -0.5);
      mirror.rotation.y = 0.5;
      scene.add(mirror);
      this.objects.push(mirror);
      var mStand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.2, 0.8, 10), lambert(0xffd44d));
      mStand.position.set(-1.6, 0.4, -0.5);
      scene.add(mStand);
      this.objects.push(mStand);

      // ハンガーラック
      var rack = new THREE.Group();
      var rackBar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8), lambert(0xd99a5b));
      rackBar.rotation.z = Math.PI / 2;
      rackBar.position.y = 1.5;
      rack.add(rackBar);
      [-0.6, 0.6].forEach(function (sx) {
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.5, 8), lambert(0xd99a5b));
        pole.position.set(sx, 0.75, 0);
        rack.add(pole);
      });
      for (var h = 0; h < 3; h++) {
        var shirt = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.12, 6, 10), lambert(OUTFIT_COLORS[(h * 2 + 1) % 6]));
        shirt.position.set(-0.4 + h * 0.4, 1.25, 0);
        shirt.scale.set(1, 1, 0.6);
        rack.add(shirt);
      }
      rack.position.set(1.7, 0, -0.6);
      rack.rotation.y = -0.4;
      scene.add(rack);
      this.objects.push(rack);

      // あかちゃん：ステージのうえ
      G.baby.setPose('stand');
      G.baby.group.position.set(0, 0.17, 0.35);
      G.baby.group.rotation.set(0, 0, 0);
      G.baby.setMood('idle');

      if (!this.flashEl) {
        this.flashEl = document.createElement('div');
        this.flashEl.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:35;transition:opacity .1s;';
        document.body.appendChild(this.flashEl);
      }

      this._buildContext();
      UI.bigFeedback('👗');
    },

    _buildContext: function () {
      var self = this;
      var buttons = [];
      OUTFIT_COLORS.forEach(function (c) {
        buttons.push({
          id: 'color_' + c,
          emoji: '',
          color: '#' + ('000000' + c.toString(16)).slice(-6),
          selected: G.baby.outfitColor === c
        });
      });
      HATS.forEach(function (h) {
        buttons.push({ id: 'hat_' + h.id, emoji: h.e, selected: G.baby.hatName === h.id });
      });
      buttons.push({ id: 'photo', emoji: '📸' });
      UI.setContext(buttons, function (id) { self._onPick(id); });
    },

    _onPick: function (id) {
      if (id.indexOf('color_') === 0) {
        var c = parseInt(id.slice(6), 10);
        G.baby.setOutfitColor(c);
        UI.state.outfitColor = c;
        UI.save();
        SND.play('sparkle');
        var tw = new THREE.Vector3();
        G.baby.torso.getWorldPosition(tw);
        FX.burst('sparkle', tw, 8);
        G.bumpMeter('happy', 0.05);
        G.baby.setMood('happy');
        G.baby.bounce();
        this._buildContext();
        this._resetMoodSoon();
      } else if (id.indexOf('hat_') === 0) {
        var hat = id.slice(4);
        G.baby.setHat(hat);
        UI.state.hat = hat;
        UI.save();
        SND.play('boing');
        FX.burst('sparkle', headWorld(), 8);
        G.bumpMeter('happy', 0.05);
        G.baby.setMood('happy');
        G.baby.bounce();
        this._buildContext();
        this._resetMoodSoon();
      } else if (id === 'photo') {
        this._takePhoto();
      }
    },

    _resetMoodSoon: function () {
      setTimeout(function () {
        if (G.currentName === 'dress') G.baby.setMood('idle');
      }, 900);
    },

    _takePhoto: function () {
      var self = this;
      G.baby.setMood('happy');
      G.baby.wave();
      SND.play('camera');
      this.flashEl.style.opacity = '0.9';
      setTimeout(function () { self.flashEl.style.opacity = '0'; }, 120);
      setTimeout(function () {
        UI.bigFeedback('📸');
        SND.play('tada');
        FX.burst('confetti', headWorld(), 16);
        UI.addStars(2, G.onSticker);
        G.bumpMeter('happy', 0.1);
        self._resetMoodSoon();
      }, 200);
    },

    onDown: function (x, y) {
      var hit = G.pick(x, y, [G.baby.root], true);
      if (hit) {
        G.baby.giggle();
        SND.play('giggle');
        FX.burst('hearts', headWorld(), 4);
      }
    },
    onMove: function () {},
    onUp: function () {},

    update: function (dt, t) {
      // モデルさんふうにゆらゆらターン
      G.baby.group.rotation.y = Math.sin(t * 0.5) * 0.55;
    },

    exit: function () {
      removeAll(this.objects);
      G.baby.group.rotation.y = 0;
    }
  };

  /* ============================================================
   * 🎈 あそぶ
   * ============================================================ */
  var BALLOON_COLORS = [0xff6fa5, 0xffd44d, 0x7fd8ff, 0x9dff8a, 0xc9a6ff];

  var play = {
    objects: [],
    balloons: [],
    ball: null,
    ballVel: null,
    popCount: 0,

    enter: function () {
      var scene = G.scene;
      this.objects = [];
      this.balloons = [];
      this.popCount = 0;

      // あかちゃん：ラグのうえ
      G.baby.setPose('stand');
      G.baby.group.position.set(-0.3, 0, 0.5);
      G.baby.group.rotation.set(0, 0, 0);
      G.baby.setMood('idle');

      // ふうせん
      for (var i = 0; i < 5; i++) {
        var b = this._makeBalloon(BALLOON_COLORS[i % BALLOON_COLORS.length]);
        b.position.set(-1.8 + i * 0.9, 0.6 + Math.random() * 2.2, -0.6 + Math.random() * 1.2);
        b.userData.speed = 0.28 + Math.random() * 0.18;
        b.userData.phase = Math.random() * Math.PI * 2;
        scene.add(b);
        this.objects.push(b);
        this.balloons.push(b);
      }

      // ボール
      var ball = new THREE.Group();
      var b1 = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 16), lambert(0xff6fa5));
      var stripe = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.055, 10, 24), lambert(0xffffff));
      stripe.rotation.x = Math.PI / 2.4;
      var star = makeEmojiSprite('⭐', 0.25);
      star.position.z = 0.26;
      ball.add(b1); ball.add(stripe); ball.add(star);
      ball.position.set(1.1, 0.27, 0.9);
      G.scene.add(ball);
      this.objects.push(ball);
      this.ball = ball;
      this.ballVel = new THREE.Vector3();

      UI.clearContext();
      UI.bigFeedback('🎈');
      SND.play('chime');
    },

    _makeBalloon: function (color) {
      var g = new THREE.Group();
      var body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), lambert(color));
      body.scale.set(1, 1.18, 1);
      var knot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 8), lambert(color));
      knot.position.y = -0.3;
      knot.rotation.x = Math.PI;
      var string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 4), lambert(0xffffff));
      string.position.y = -0.6;
      g.add(body); g.add(knot); g.add(string);
      return g;
    },

    onDown: function (x, y) {
      // ふうせん
      var hit = G.pick(x, y, this.balloons, true);
      if (hit) {
        var balloon = hit.object;
        while (balloon.parent && this.balloons.indexOf(balloon) === -1) balloon = balloon.parent;
        if (this.balloons.indexOf(balloon) !== -1) {
          this._popBalloon(balloon);
          return;
        }
      }
      // ボール
      var bHit = G.pick(x, y, [this.ball], true);
      if (bHit) {
        SND.play('boing');
        this.ballVel.set((Math.random() - 0.5) * 1.6, 2.6 + Math.random(), (Math.random() - 0.5) * 0.8);
        G.baby.setMood('happy');
        G.baby.clap();
        SND.play('giggle');
        G.bumpMeter('happy', 0.06);
        FX.burst('stars', this.ball.position, 4);
        this._resetMoodSoon();
        return;
      }
      // あかちゃんこちょこちょ
      var babyHit = G.pick(x, y, [G.baby.root], true);
      if (babyHit) {
        G.baby.giggle();
        G.baby.setMood('happy');
        SND.play('giggle');
        FX.burst('hearts', headWorld(), 6);
        G.bumpMeter('happy', 0.08);
        UI.bigFeedback('🤭');
        this._resetMoodSoon();
      }
    },

    _resetMoodSoon: function () {
      setTimeout(function () {
        if (G.currentName === 'play') G.baby.setMood('idle');
      }, 1000);
    },

    _popBalloon: function (balloon) {
      SND.play('balloonPop');
      FX.burst('confetti', balloon.position, 12);
      this.popCount++;
      G.bumpMeter('happy', 0.05);
      G.bumpMeter('sleep', -0.02);
      G.baby.bounce();
      if (this.popCount % 5 === 0) {
        UI.bigFeedback('🎈');
        SND.play('tada');
        UI.addStars(2, G.onSticker);
        G.baby.clap();
      } else if (Math.random() < 0.35) {
        UI.addStars(1, G.onSticker);
      } else {
        SND.play('pop');
      }
      // したからふっかつ
      balloon.position.y = -1.2;
      balloon.position.x = -1.8 + Math.random() * 3.6;
      balloon.position.z = -0.6 + Math.random() * 1.2;
    },

    onMove: function () {},
    onUp: function () {},

    update: function (dt, t) {
      // ふうせんふわふわ
      for (var i = 0; i < this.balloons.length; i++) {
        var b = this.balloons[i];
        b.position.y += b.userData.speed * dt;
        b.position.x += Math.sin(t * 1.2 + b.userData.phase) * 0.15 * dt;
        b.rotation.z = Math.sin(t * 1.5 + b.userData.phase) * 0.1;
        if (b.position.y > 3.6) {
          b.position.y = -1.2;
          b.position.x = -1.8 + Math.random() * 3.6;
        }
      }
      // ボールぶつり
      if (this.ball) {
        this.ballVel.y -= 6 * dt;
        this.ball.position.addScaledVector(this.ballVel, dt);
        if (this.ball.position.y < 0.27) {
          this.ball.position.y = 0.27;
          if (Math.abs(this.ballVel.y) > 0.8) {
            this.ballVel.y = -this.ballVel.y * 0.55;
            SND.play('drum');
            FX.burst('smoke', new THREE.Vector3(this.ball.position.x, 0.05, this.ball.position.z), 3);
          } else {
            this.ballVel.y = 0;
          }
          this.ballVel.x *= 0.9;
          this.ballVel.z *= 0.9;
        }
        // かべではねかえる
        if (Math.abs(this.ball.position.x) > 2.6) {
          this.ball.position.x = Math.sign(this.ball.position.x) * 2.6;
          this.ballVel.x *= -0.7;
        }
        if (this.ball.position.z > 1.6 || this.ball.position.z < -1.6) {
          this.ball.position.z = Math.max(-1.6, Math.min(1.6, this.ball.position.z));
          this.ballVel.z *= -0.7;
        }
        this.ball.rotation.x += this.ballVel.z * dt * 2;
        this.ball.rotation.z -= this.ballVel.x * dt * 2;
      }
    },

    exit: function () {
      removeAll(this.objects);
      this.balloons = [];
      this.ball = null;
    }
  };

  /* ============================================================
   * 🌙 ねんね
   * ============================================================ */
  var sleep = {
    objects: [],
    nightT: 0,
    asleep: false,
    rockX: 0,
    rockTarget: 0,
    rockAccum: 0,
    lastRockSign: 0,
    snoreTimer: 0,
    shootTimer: 5,
    shootingStar: null,
    crib: null,
    dragging: false,
    dragStartX: 0,

    enter: function () {
      var scene = G.scene;
      this.objects = [];
      this.asleep = false;
      this.nightT = 0;
      this.rockAccum = 0;
      this.shootTimer = 4;

      // ベビーベッド（ゆりかご）
      var crib = new THREE.Group();
      var wood = lambert(0xf0b47a);
      var mattress = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.85), lambert(0xffffff));
      mattress.position.y = 0.42;
      crib.add(mattress);
      var frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.95), wood);
      frame.position.y = 0.33;
      crib.add(frame);
      // ゆりかごのあし（ゆらゆら弧）
      [-0.6, 0.6].forEach(function (sx) {
        var rocker = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 10, 20, Math.PI * 0.9), wood);
        rocker.position.set(sx, 0.4, 0);
        rocker.rotation.set(0, Math.PI / 2, Math.PI + Math.PI * 0.05);
        crib.add(rocker);
      });
      // さく
      for (var i = 0; i < 6; i++) {
        var barL = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.45, 8), wood);
        barL.position.set(-0.7 + i * 0.28, 0.62, -0.44);
        crib.add(barL);
      }
      var railTop = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 8), wood);
      railTop.rotation.z = Math.PI / 2;
      railTop.position.set(0, 0.85, -0.44);
      crib.add(railTop);
      // まえがわのひくいさく
      for (var j = 0; j < 6; j++) {
        var barF = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 8), wood);
        barF.position.set(-0.7 + j * 0.28, 0.55, 0.44);
        crib.add(barF);
      }
      var railF = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 8), wood);
      railF.rotation.z = Math.PI / 2;
      railF.position.set(0, 0.67, 0.44);
      crib.add(railF);

      crib.position.set(0, 0, 0.4);
      scene.add(crib);
      this.objects.push(crib);
      this.crib = crib;

      // あかちゃん：よこむきでゴロン（クリブの子にして一緒にゆれる）
      // Rz(-90°)で体をベッドのながい方向(x)にたおし、Rx(-0.35)でかおをカメラがわへ
      G.baby.setPose('lie');
      G.baby.setMood('idle');
      G.baby.group.rotation.set(-0.35, 0, -Math.PI / 2 + 0.08);
      G.baby.group.position.set(-0.55, 0.6, 0.05);
      G.baby.shadow.visible = false;
      scene.remove(G.baby.group);
      crib.add(G.baby.group);

      // もうふ
      var blanket = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 0.6), lambert(0xc9a6ff));
      blanket.position.set(-0.15, 0.56, 0.12);
      blanket.rotation.x = 0.1;
      crib.add(blanket);

      SND.startMusic('lullaby');
      UI.clearContext();
      UI.bigFeedback('🌙');
      SND.play('yawn');
    },

    onDown: function (x, y) {
      this.dragging = true;
      this.dragStartX = x;
      // あかちゃんをなでなで
      var hit = G.pick(x, y, [G.baby.root], true);
      if (hit && !this.asleep) {
        FX.burst('hearts', hit.point, 3);
        SND.play('bubble');
        this._addSleepProgress(0.06);
      }
    },

    onMove: function (x, y, isDown) {
      if (!isDown || !this.dragging) return;
      var dx = (x - this.dragStartX) / Math.max(300, window.innerWidth * 0.4);
      this.rockTarget = Math.max(-0.14, Math.min(0.14, dx));
      // ゆらしのむき変化をカウント
      var sign = this.rockTarget > 0.05 ? 1 : this.rockTarget < -0.05 ? -1 : 0;
      if (sign !== 0 && sign !== this.lastRockSign) {
        if (this.lastRockSign !== 0 && !this.asleep) {
          this._addSleepProgress(0.05);
          FX.burst('notes', new THREE.Vector3(0.8, 1.6, 0.4), 1);
        }
        this.lastRockSign = sign;
      }
    },

    onUp: function () {
      this.dragging = false;
      this.rockTarget = 0;
    },

    _addSleepProgress: function (amt) {
      G.bumpMeter('sleep', amt);
      if (Math.random() < 0.4) FX.burst('zzz', headWorld(), 1);
      if (UI.state.meters.sleep >= 0.99 && !this.asleep) this._fallAsleep();
    },

    _fallAsleep: function () {
      this.asleep = true;
      G.baby.setMood('sleep');
      UI.celebrate('🌙 おやすみなさい…');
      SND.play('chime');
      UI.addStars(3, G.onSticker);
      FX.burst('zzz', headWorld(), 3);
    },

    update: function (dt, t) {
      // よるへフェード
      if (this.nightT < 1) {
        this.nightT = Math.min(1, this.nightT + dt * 0.7);
        G.world.setNight(this.nightT);
      }

      // ゆりかごのゆれ
      this.rockX += (this.rockTarget - this.rockX) * Math.min(1, dt * 6);
      if (!this.dragging) this.rockX *= (1 - Math.min(1, dt * 2));
      this.crib.rotation.z = this.rockX + (this.asleep ? Math.sin(t * 1.2) * 0.02 : 0);

      // すやすや
      if (this.asleep) {
        this.snoreTimer -= dt;
        if (this.snoreTimer <= 0) {
          this.snoreTimer = 2.6;
          SND.play('snore');
          FX.burst('zzz', headWorld(), 1);
        }
      }

      // ながれぼし
      this.shootTimer -= dt;
      if (this.shootTimer <= 0 && this.nightT > 0.8 && !this.shootingStar) {
        this.shootTimer = 4 + Math.random() * 3;
        var star = makeEmojiSprite('🌟', 0.34);
        star.position.set(-3.2, 3.4 + Math.random() * 0.6, -2.9);
        G.scene.add(star);
        this.shootingStar = star;
        SND.play('whoosh');
      }
      if (this.shootingStar) {
        this.shootingStar.position.x += dt * 1.6;
        this.shootingStar.position.y -= dt * 0.35;
        if (Math.random() < 0.3) FX.burst('sparkle', this.shootingStar.position, 1);
        if (this.shootingStar.position.x > 3.4) {
          G.scene.remove(this.shootingStar);
          this.shootingStar = null;
        }
      }
    },

    onDownStar: function (x, y) {
      // main から onDown より先によばれる：ながれぼしタップ判定
      if (!this.shootingStar) return false;
      var hit = G.pick(x, y, [this.shootingStar], false);
      if (hit) {
        SND.play('twinkle');
        SND.play('star');
        FX.burst('stars', this.shootingStar.position, 8);
        UI.addStars(1, G.onSticker);
        UI.bigFeedback('🌟');
        G.scene.remove(this.shootingStar);
        this.shootingStar = null;
        return true;
      }
      return false;
    },

    exit: function () {
      // あかちゃんをシーンにもどす
      this.crib.remove(G.baby.group);
      G.scene.add(G.baby.group);
      G.baby.group.rotation.set(0, 0, 0);
      G.baby.setPose('stand');
      G.baby.setMood('idle');
      G.baby.shadow.visible = true;
      if (this.shootingStar) {
        G.scene.remove(this.shootingStar);
        this.shootingStar = null;
      }
      removeAll(this.objects);
      G.world.setNight(0);
      SND.startMusic('happy');
    }
  };

  // ながれぼしを優先タップできるようフック
  var origSleepOnDown = sleep.onDown;
  sleep.onDown = function (x, y) {
    if (this.onDownStar(x, y)) return;
    origSleepOnDown.call(this, x, y);
  };

  window.ACTIVITIES = {
    feed: feed,
    bath: bath,
    dress: dress,
    play: play,
    sleep: sleep
  };

  window.ACTIVITIES.init = function (ctx) { G = ctx; };
})();
