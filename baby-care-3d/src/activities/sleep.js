/* ============================================================
 * activities/sleep.js — 🌙 ねんね（入眠プロセスつき）
 *  ・ねんねのしたく：はみがき→パジャマ→カーテン→でんき（ぜんぶやると眠れる）
 *  ・入眠の段階：げんき→あくび→目こしこし→うとうと→こっくり→すやすや
 *  ・えほんのよみきかせ / とんとん（はやすぎると目がさえる）/ くまのぬいぐるみ
 *  ・ゆりかごゆらゆら / ねむったらながれぼし
 * ============================================================ */
(function () {
  'use strict';

  var BOOK_PAGES = ['🐻🌲', '🦉🌙', '⭐✨', '😴💤'];
  var GOOD_PAT_MIN = 380, GOOD_PAT_MAX = 1400; // とんとんのよい間隔(ms)

  var sleep = {
    objects: [],

    enter: function () {
      var G = AX.G;
      var scene = G.scene;
      this.objects = [];
      this.sleepiness = Math.min(0.3, UI.state.meters.sleep * 0.2);
      this.stage = 0;
      this.asleep = false;
      this.nightT = 0.15;
      this.targetNight = 0.55;      // ゆうがた
      this.curtainT = AX.G.world.curtainClose || 0;
      this.targetCurtain = 0;
      this.rockX = 0;
      this.rockTarget = 0;
      this.lastRockSign = 0;
      this.snoreTimer = 0;
      this.shootTimer = 5;
      this.shootingStar = null;
      this.yawnTimer = 3;
      this.pointTimer = 4;
      this.lastPatAt = 0;
      this.brushing = false;
      this.bookOpen = false;
      this.bookPage = -1;
      this.dragging = false;

      // したくの状態
      this.todo = {
        teeth: !CARE.state.teethDirty,
        pajama: CARE.state.outfitStyle === 'pajama' && !CARE.state.naked,
        curtain: false,
        lamp: false
      };

      /* --- ベビーベッド（ゆりかご） --- */
      var crib = new THREE.Group();
      var wood = AX.lambert(0xf0b47a);
      var mattress = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.85), AX.lambert(0xffffff));
      mattress.position.y = 0.42;
      crib.add(mattress);
      var frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.95), wood);
      frame.position.y = 0.33;
      crib.add(frame);
      [-0.6, 0.6].forEach(function (sx) {
        var rocker = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 10, 20, Math.PI * 0.9), wood);
        rocker.position.set(sx, 0.4, 0);
        rocker.rotation.set(0, Math.PI / 2, Math.PI + Math.PI * 0.05);
        crib.add(rocker);
      });
      for (var i = 0; i < 6; i++) {
        var barL = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.45, 8), wood);
        barL.position.set(-0.7 + i * 0.28, 0.62, -0.44);
        crib.add(barL);
      }
      var railTop = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 8), wood);
      railTop.rotation.z = Math.PI / 2;
      railTop.position.set(0, 0.85, -0.44);
      crib.add(railTop);
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

      /* --- あかちゃん：よこむきでゴロン --- */
      var baby = G.baby;
      baby.setPose('lie');
      baby.setMood('idle');
      baby.group.rotation.set(-0.35, 0, -Math.PI / 2 + 0.08);
      baby.group.position.set(-0.55, 0.6, 0.05);
      baby.shadow.visible = false;
      scene.remove(baby.group);
      crib.add(baby.group);

      var blanket = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 0.6), AX.lambert(0xc9a6ff));
      blanket.position.set(-0.15, 0.56, 0.12);
      blanket.rotation.x = 0.1;
      crib.add(blanket);

      /* --- くまのぬいぐるみ（クリブのよこ） --- */
      var teddy = new THREE.Group();
      var tMat = AX.lambert(0xc08a5a);
      var tBody = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), tMat);
      var tHead = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), tMat);
      tHead.position.y = 0.15;
      var tEarL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), tMat);
      var tEarR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), tMat);
      tEarL.position.set(-0.06, 0.22, 0);
      tEarR.position.set(0.06, 0.22, 0);
      var tNose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), AX.lambert(0x6a4a2a));
      tNose.position.set(0, 0.13, 0.075);
      teddy.add(tBody); teddy.add(tHead); teddy.add(tEarL); teddy.add(tEarR); teddy.add(tNose);
      teddy.position.set(1.35, 0.12, 0.9);
      scene.add(teddy);
      this.objects.push(teddy);
      this.teddy = teddy;
      this.teddyGiven = false;

      /* --- えほん（サイドテーブルのうえ） --- */
      var table = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.5, 12), AX.lambert(0xd99a5b));
      table.position.set(-1.6, 0.25, 0.7);
      scene.add(table);
      this.objects.push(table);
      this.bookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.26), AX.lambert(0xff8fb3));
      this.bookMesh.add(AX.hitProxy(0.3));
      this.bookMesh.position.set(-1.6, 0.53, 0.7);
      this.bookMesh.rotation.y = 0.4;
      scene.add(this.bookMesh);
      this.objects.push(this.bookMesh);

      // ひらいたえほんページ（スプライト・ふだんは非表示）
      this.pageSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._pageTexture('📖'), transparent: true }));
      this.pageSprite.scale.set(0.9, 0.9, 1);
      this.pageSprite.position.set(-1.2, 1.6, 0.7);
      this.pageSprite.visible = false;
      scene.add(this.pageSprite);
      this.objects.push(this.pageSprite);

      /* --- はぶらし --- */
      this.brush = new THREE.Group();
      var bHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 8), AX.lambert(0x7fd8ff));
      this.brush.add(bHandle);
      var bHead = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.05), AX.lambert(0xffffff));
      bHead.position.y = 0.18;
      this.brush.add(bHead);
      this.brush.position.set(1.5, 1.3, 0.6);
      this.brush.visible = false;
      scene.add(this.brush);
      this.objects.push(this.brush);

      // ゆうがた → ランプはついている
      G.world.setLampOn(true);
      SND.startMusic('lullaby');
      this._buildContext();
      UI.bigFeedback('🌙');
      UI.celebrate('ねんねの したくを しよう！');
      SND.play('yawn');
    },

    /* ---------- したくチェックリスト（コンテキストパネル） ---------- */

    _buildContext: function () {
      var self = this;
      var t = this.todo;
      UI.setContext([
        { id: 'teeth', emoji: t.teeth ? '🪥✅' : '🪥', selected: t.teeth },
        { id: 'pajama', emoji: t.pajama ? '🌙✅' : '🌙', selected: t.pajama },
        { id: 'curtain', emoji: t.curtain ? '🪟✅' : '🪟', selected: t.curtain },
        { id: 'lamp', emoji: t.lamp ? '💡✅' : '💡', selected: t.lamp }
      ], function (id) { self._doTodo(id); });
    },

    _doTodo: function (id) {
      var G = AX.G;
      var baby = G.baby;
      if (id === 'teeth' && !this.todo.teeth) {
        // はみがきモード：おおきくお口をあけて
        this.brushing = true;
        this.brush.visible = true;
        baby.showTeeth(true, 3);
        baby.setDroop(0);
        UI.bigFeedback('🪥');
        UI.celebrate('しあげみがき！はをこすってね');
        SND.play('tap');
      } else if (id === 'pajama' && !this.todo.pajama) {
        // パジャマにおきがえ（すぽっ）
        SND.play('whoosh');
        SND.play('pop');
        if (CARE.state.naked) baby.setNaked(false);
        baby.setOutfitStyle('pajama');
        CARE.state.naked = false;
        CARE.state.outfitStyle = 'pajama';
        CARE.save();
        this.todo.pajama = true;
        FX.burst('sparkle', AX.chestWorld(), 6);
        UI.bigFeedback('🌙');
        SND.play('chime');
        this._todoDone();
      } else if (id === 'curtain' && !this.todo.curtain) {
        this.targetCurtain = 1;
        this.todo.curtain = true;
        SND.play('whoosh');
        UI.bigFeedback('🪟');
        this._todoDone();
      } else if (id === 'lamp' && !this.todo.lamp) {
        G.world.setLampOn(false);
        this.targetNight = 1;
        this.todo.lamp = true;
        SND.play('tap');
        UI.bigFeedback('🌃');
        this._todoDone();
      }
      this._buildContext();
    },

    _todoDone: function () {
      var G = AX.G;
      this._addSleepiness(0.05);
      var t = this.todo;
      if (t.teeth && t.pajama && t.curtain && t.lamp) {
        SND.play('tada');
        UI.celebrate('したく かんぺき！ おやすみのじかん…');
        FX.burst('stars', AX.headWorld(), 6);
        UI.addStars(1, G.onSticker);
      }
    },

    /* ---------- ねむけの管理 ---------- */

    _sleepCap: function () {
      // でんきがついてる/カーテンがあいてると、ねむれない
      var t = this.todo;
      if (!t.lamp || !t.curtain) return 0.6;
      return 1;
    },

    _addSleepiness: function (amt) {
      if (this.asleep) return;
      this.sleepiness = Math.max(0, Math.min(this._sleepCap(), this.sleepiness + amt));
      UI.setMeter('sleep', Math.max(UI.state.meters.sleep, this.sleepiness));
      if (Math.random() < 0.4 && amt > 0) FX.burst('zzz', AX.headWorld(), 1);
      if (this.sleepiness >= 0.95) this._fallAsleep();
    },

    _fallAsleep: function () {
      var G = AX.G;
      this.asleep = true;
      G.baby.setNodding(false);
      G.baby.setDroop(0);
      G.baby.setMood('sleep');
      UI.setMeter('sleep', 1);
      UI.celebrate('🌙 すやすや… おやすみなさい');
      SND.play('chime');
      UI.addStars(3, G.onSticker);
      FX.burst('zzz', AX.headWorld(), 3);
      CARE.state.teethDirty = true;   // あしたはまたみがこうね
      CARE.save();
    },

    /* ---------- 入力 ---------- */

    onDown: function (x, y) {
      var G = AX.G;
      var baby = G.baby;

      // ながれぼし
      if (this.shootingStar) {
        var starHit = G.pick(x, y, [this.shootingStar], false);
        if (starHit) {
          SND.play('twinkle');
          SND.play('star');
          FX.burst('stars', this.shootingStar.position, 8);
          UI.addStars(1, G.onSticker);
          UI.bigFeedback('🌟');
          G.scene.remove(this.shootingStar);
          this.shootingStar = null;
          return;
        }
      }

      // はみがきモード
      if (this.brushing) {
        this.brushDrag = true;
        this._brushMove(x, y);
        return;
      }

      // えほん
      if (G.pick(x, y, [this.bookMesh], true) || (this.bookOpen && G.pick(x, y, [this.pageSprite], false))) {
        this._bookTap();
        return;
      }

      // くまさん → だっこさせてあげる
      if (!this.teddyGiven && G.pick(x, y, [this.teddy], true)) {
        this._giveTeddy();
        return;
      }

      // ランプを直接タップしてもけせる
      if (!this.todo.lamp && G.pick(x, y, [G.world.lamp], true)) {
        this._doTodo('lamp');
        this._buildContext();
        return;
      }
      // カーテンを直接タップしてもとじられる
      if (!this.todo.curtain && G.pick(x, y, [G.world.curtL, G.world.curtR], false)) {
        this._doTodo('curtain');
        this._buildContext();
        return;
      }

      // あかちゃんのむねをとんとん
      var hit = G.pick(x, y, [baby.root], true);
      if (hit && !this.asleep) {
        this._patChest(hit.point);
        return;
      }

      // それいがいはゆりかごゆらし
      this.dragging = true;
      this.dragStartX = x;
    },

    onMove: function (x, y, isDown) {
      if (!isDown) return;
      if (this.brushDrag) { this._brushMove(x, y); return; }
      if (!this.dragging) return;
      var dx = (x - this.dragStartX) / Math.max(300, window.innerWidth * 0.4);
      this.rockTarget = Math.max(-0.14, Math.min(0.14, dx));
      var sign = this.rockTarget > 0.05 ? 1 : this.rockTarget < -0.05 ? -1 : 0;
      if (sign !== 0 && sign !== this.lastRockSign) {
        if (this.lastRockSign !== 0 && !this.asleep) {
          this._addSleepiness(0.04);
          FX.burst('notes', new THREE.Vector3(0.8, 1.6, 0.4), 1);
        }
        this.lastRockSign = sign;
      }
    },

    onUp: function () {
      this.dragging = false;
      this.brushDrag = false;
      this.rockTarget = 0;
    },

    /* ---------- はみがき ---------- */

    _brushMove: function (x, y) {
      var G = AX.G;
      var baby = G.baby;
      var p = G.rayPlane(x, y, new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.9));
      if (p) {
        this.brush.position.set(p.x, p.y, 0.95);
        this.brush.rotation.z = 1.2;
      }
      var hit = G.pick(x, y, [baby.head], true);
      if (!hit) return;
      var now = performance.now();
      if (this._lastBrush && now - this._lastBrush < 160) return;
      this._lastBrush = now;
      SND.play('brush');
      FX.burst('foam', hit.point, 2);
      baby.brushAt(hit.point, 0.2);
      if (baby.teethSpecks.length === 0) {
        // みがけた！「ぺっ」→ ぴかぴかのは
        this.brushing = false;
        this.brushDrag = false;
        this.brush.visible = false;
        var self = this;
        SND.play('spit');
        FX.burst('drops', AX.mouthWorld(), 4);
        setTimeout(function () {
          if (AX.G.currentName !== 'sleep') return;
          AX.G.baby.showTeeth(false);
          AX.G.baby.setMouth('smile');
          SND.play('sparkle');
          FX.burst('sparkle', AX.mouthWorld(), 6);
          UI.bigFeedback('✨🦷');
          self.todo.teeth = true;
          CARE.state.teethDirty = false;
          CARE.save();
          self._todoDone();
          self._buildContext();
        }, 500);
      }
    },

    /* ---------- えほん ---------- */

    _bookTap: function () {
      var G = AX.G;
      if (!this.bookOpen) {
        this.bookOpen = true;
        this.bookPage = 0;
        this.pageSprite.visible = true;
        this._setPage();
        SND.play('pageTurn');
        UI.celebrate('えほんの よみきかせ…');
        G.baby.lookTarget = this.pageSprite.position;
      } else {
        this.bookPage++;
        SND.play('pageTurn');
        if (this.bookPage >= BOOK_PAGES.length) {
          // おしまい
          this.bookOpen = false;
          this.pageSprite.visible = false;
          G.baby.lookTarget = null;
          SND.play('chime');
          this._addSleepiness(0.1);
        } else {
          this._setPage();
          this._addSleepiness(0.08);
          FX.burst('sparkle', this.pageSprite.position, 3);
        }
      }
    },

    _pageTexture: function (content) {
      return AX.canvasTexture(256, function (g, s) {
        // しろいページ
        g.fillStyle = '#fffdf5';
        g.strokeStyle = '#e8c9a0';
        g.lineWidth = s * 0.03;
        var r = s * 0.08;
        g.beginPath();
        g.moveTo(r, s * 0.1);
        g.lineTo(s - r, s * 0.1); g.quadraticCurveTo(s - r * 0.3, s * 0.1, s - r * 0.3, s * 0.1 + r);
        g.lineTo(s - r * 0.3, s * 0.9 - r); g.quadraticCurveTo(s - r * 0.3, s * 0.9, s - r, s * 0.9);
        g.lineTo(r, s * 0.9); g.quadraticCurveTo(r * 0.3, s * 0.9, r * 0.3, s * 0.9 - r);
        g.lineTo(r * 0.3, s * 0.1 + r); g.quadraticCurveTo(r * 0.3, s * 0.1, r, s * 0.1);
        g.closePath();
        g.fill();
        g.stroke();
        // まんなかのとじめ
        g.beginPath();
        g.moveTo(s / 2, s * 0.1);
        g.lineTo(s / 2, s * 0.9);
        g.strokeStyle = '#f0dcc0';
        g.stroke();
        // えもじ（2つまで・りょうページに）
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = Math.floor(s * 0.3) + 'px sans-serif';
        var chars = Array.from(content);
        if (chars.length >= 2) {
          g.fillText(chars[0], s * 0.28, s * 0.5);
          g.fillText(chars[1], s * 0.72, s * 0.5);
        } else {
          g.fillText(content, s * 0.5, s * 0.5);
        }
      }).tex;
    },

    _setPage: function () {
      this.pageSprite.material.map = this._pageTexture(BOOK_PAGES[this.bookPage]);
      this.pageSprite.material.needsUpdate = true;
    },

    /* ---------- とんとん ---------- */

    _patChest: function (point) {
      var G = AX.G;
      var now = performance.now();
      var interval = now - this.lastPatAt;
      this.lastPatAt = now;
      SND.play('pat');
      FX.burst('hearts', point, 1);
      if (interval < GOOD_PAT_MIN) {
        // はやすぎ！目がぱっちり…
        G.baby.setMood('surprised');
        G.baby.setDroop(0);
        this.sleepiness = Math.max(0, this.sleepiness - 0.12);
        UI.setMeter('sleep', Math.max(0.05, UI.state.meters.sleep - 0.05));
        UI.bigFeedback('👀');
        SND.play('boing');
        var self = this;
        setTimeout(function () {
          if (AX.G.currentName === 'sleep' && !self.asleep) AX.G.baby.setMood('idle');
        }, 900);
      } else if (interval < GOOD_PAT_MAX) {
        // ゆっくりとんとん…いいかんじ
        this._addSleepiness(0.06);
      } else {
        // ひさしぶりのとんとん（ふつう）
        this._addSleepiness(0.03);
      }
    },

    /* ---------- くまさん ---------- */

    _giveTeddy: function () {
      var G = AX.G;
      this.teddyGiven = true;
      var idx = this.objects.indexOf(this.teddy);
      if (idx >= 0) this.objects.splice(idx, 1);
      if (this.teddy.parent) this.teddy.parent.remove(this.teddy);
      this.teddy.position.set(0, 0.05, 0.28);
      this.teddy.scale.setScalar(0.9);
      this.teddy.rotation.set(0, 0, 0);
      G.baby.hug(this.teddy);
      SND.play('happyBaby');
      UI.bigFeedback('🧸');
      UI.celebrate('くまさんと いっしょ…');
      FX.burst('hearts', AX.chestWorld(), 6);
      G.baby.setMood('shy');
      this._addSleepiness(0.15);
      var self = this;
      setTimeout(function () {
        if (AX.G.currentName === 'sleep' && !self.asleep) AX.G.baby.setMood('idle');
      }, 1400);
    },

    /* ---------- 毎フレーム ---------- */

    update: function (dt, t) {
      var G = AX.G;
      var baby = G.baby;

      // よる・カーテンのフェード
      if (Math.abs(this.nightT - this.targetNight) > 0.01) {
        this.nightT += (this.targetNight - this.nightT) * Math.min(1, dt * 1.2);
        G.world.setNight(this.nightT);
      }
      if (Math.abs(this.curtainT - this.targetCurtain) > 0.01) {
        this.curtainT += (this.targetCurtain - this.curtainT) * Math.min(1, dt * 2);
        G.world.setCurtains(this.curtainT);
      }

      // ゆりかごのゆれ
      this.rockX += (this.rockTarget - this.rockX) * Math.min(1, dt * 6);
      if (!this.dragging) this.rockX *= (1 - Math.min(1, dt * 2));
      this.crib.rotation.z = this.rockX + (this.asleep ? Math.sin(t * 1.2) * 0.02 : 0);

      /* --- 入眠の段階演出 --- */
      if (!this.asleep) {
        var s = this.sleepiness;
        var stage = s < 0.2 ? 0 : s < 0.4 ? 1 : s < 0.55 ? 2 : s < 0.75 ? 3 : 4;
        this.stage = stage;

        // まぶたのおもさ
        var droops = [0, 0.15, 0.3, 0.55, 0.8];
        baby.setDroop(droops[stage]);
        baby.setNodding(stage === 4);

        // だんかいごとのしぐさ
        this.yawnTimer -= dt;
        if (this.yawnTimer <= 0) {
          this.yawnTimer = 5 + Math.random() * 3;
          if (stage === 1 && !this.brushing) {
            baby.yawn();
            FX.burst('zzz', AX.headWorld(), 1);
          } else if (stage === 2 && !this.brushing) {
            baby.rubEyes();
            SND.play('shiver');
          } else if (stage >= 3) {
            FX.burst('zzz', AX.headWorld(), 1);
          }
        }

        // でんきがついてて眠れない → ランプをゆびさす（自発行動）
        if (s >= this._sleepCap() - 0.01 && (!this.todo.lamp || !this.todo.curtain)) {
          this.pointTimer -= dt;
          if (this.pointTimer <= 0) {
            this.pointTimer = 5;
            baby.pointTo(-1, 1.8);
            baby.setMood('pout');
            SND.play('sadBaby');
            var hw = AX.headWorld();
            hw.y += 0.5;
            var sp = G.project(hw);
            UI.showThought(this.todo.lamp ? '🪟' : '💡', sp.x, sp.y);
            var self = this;
            setTimeout(function () {
              UI.hideThought();
              if (AX.G.currentName === 'sleep' && !self.asleep) AX.G.baby.setMood('idle');
            }, 2200);
          }
        }
      } else {
        // すやすや
        this.snoreTimer -= dt;
        if (this.snoreTimer <= 0) {
          this.snoreTimer = 2.6;
          SND.play('snore');
          FX.burst('zzz', AX.headWorld(), 1);
        }
        // ねているあいだ、ねむりメーターがゆっくりまんたんに
        UI.setMeter('sleep', Math.min(1, UI.state.meters.sleep + dt * 0.05));
      }

      // ながれぼし（よるだけ）
      this.shootTimer -= dt;
      if (this.shootTimer <= 0 && this.nightT > 0.8 && !this.shootingStar) {
        this.shootTimer = 4 + Math.random() * 3;
        this.shootingStar = AX.emojiSprite('🌟', 0.34);
        this.shootingStar.position.set(-3.2, 3.4 + Math.random() * 0.6, -2.9);
        G.scene.add(this.shootingStar);
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

      // えほんページのふわふわ
      if (this.bookOpen) {
        this.pageSprite.position.y = 1.6 + Math.sin(t * 1.5) * 0.05;
      }
    },

    exit: function () {
      var G = AX.G;
      var baby = G.baby;
      baby.releaseHug();
      baby.setNodding(false);
      baby.setDroop(0);
      baby.showTeeth(false);
      this.crib.remove(baby.group);
      G.scene.add(baby.group);
      baby.group.rotation.set(0, 0, 0);
      baby.setPose('stand');
      baby.setMood('idle');
      baby.shadow.visible = true;
      if (this.shootingStar) {
        G.scene.remove(this.shootingStar);
        this.shootingStar = null;
      }
      AX.removeAll(this.objects);
      G.world.setNight(0);
      G.world.setCurtains(0);
      G.world.setLampOn(false);
      UI.hideThought();
      SND.startMusic('happy');
    }
  };

  window.ACTIVITIES.sleep = sleep;
})();
