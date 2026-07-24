/* ============================================================
 * activities/dress.js — 👕 きせかえ（工程つき）
 *  ・きるながれ：あたまから「すぽっ」→ひだりうで→みぎうで→ボタン2こ「パチン」
 *  ・よごれたふくは「くさい！」→ せんたくき→ものほし→かわく の連鎖
 *  ・くつした/くつは片あしずつ、けんけんバランス
 *  ・てんき連動：あめ→レインコート＋ながぐつ / ねむいとき→パジャマ
 * ============================================================ */
(function () {
  'use strict';

  var OUTFIT_COLORS = [0xffd44d, 0xff6fa5, 0x7fd8ff, 0x9dff8a, 0xc9a6ff, 0xffab6b];
  var HATS = [
    { id: 'none', e: '🙂' }, { id: 'cap', e: '🧢' }, { id: 'bow', e: '🎀' },
    { id: 'crown', e: '👑' }, { id: 'bear', e: '🐻' }, { id: 'party', e: '🎉' }, { id: 'flower', e: '🌼' }
  ];

  function keyOf(color) { return ('000000' + color.toString(16)).slice(-6); }

  var dress = {
    objects: [],
    flashEl: null,
    dressing: null,     // { key, style, color, step }
    laundryJob: null,   // { key, phase, t, sprite }
    sockStep: 0,        // 0なし 1くつしたL 2くつしたR 3くつL 4くつR(完了)
    legLiftTimer: 0,
    legLiftSide: 0,

    isBusy: function () { return !!this.dressing || !!this.sockMode; },

    enter: function () {
      var G = AX.G;
      var scene = G.scene;
      this.objects = [];
      this.dressing = null;
      this.sockStep = 0;

      // ステージ
      var podium = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.16, 28), AX.lambert(0xffc0d5));
      podium.position.set(0, 0.08, 0.35);
      scene.add(podium);
      this.objects.push(podium);
      var podiumTop = new THREE.Mesh(new THREE.CircleGeometry(0.82, 28), AX.lambert(0xffe0ec));
      podiumTop.rotation.x = -Math.PI / 2;
      podiumTop.position.set(0, 0.165, 0.35);
      scene.add(podiumTop);
      this.objects.push(podiumTop);

      // かがみ
      var mirror = new THREE.Group();
      var mFrame = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 12, 28), AX.lambert(0xffd44d));
      var mGlass = new THREE.Mesh(new THREE.CircleGeometry(0.52, 28), AX.lambert(0xd0f0ff));
      mirror.add(mFrame); mirror.add(mGlass);
      mirror.position.set(-2.1, 1.3, -0.7);
      mirror.rotation.y = 0.5;
      scene.add(mirror);
      this.objects.push(mirror);
      var mStand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.2, 0.8, 10), AX.lambert(0xffd44d));
      mStand.position.set(-2.1, 0.4, -0.7);
      scene.add(mStand);
      this.objects.push(mStand);

      // せんたくき
      var washer = new THREE.Group();
      var wBody = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.7), AX.lambert(0xf4f8fb));
      wBody.position.y = 0.45;
      washer.add(wBody);
      var wDoorRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 10, 22), AX.lambert(0x9fb8c8));
      wDoorRim.position.set(0, 0.48, 0.36);
      washer.add(wDoorRim);
      this.washerDrum = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), AX.lambert(0x6f95aa));
      this.washerDrum.position.set(0, 0.48, 0.37);
      washer.add(this.washerDrum);
      // ドラムのまど模様（回転がわかるように）
      var drumDot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), AX.lambert(0xcfe8f5));
      drumDot.position.set(0.1, 0.1, 0.01);
      this.washerDrum.add(drumDot);
      var wTop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.7), AX.lambert(0xd9e6ee));
      wTop.position.y = 0.93;
      washer.add(wTop);
      washer.position.set(1.9, 0, -0.55);
      washer.rotation.y = -0.35;
      scene.add(washer);
      this.objects.push(washer);
      this.washer = washer;

      // ものほしロープ（まどのよこ）
      var rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.0, 6), AX.lambert(0xd9b98a));
      rope.rotation.z = Math.PI / 2 + 0.06;
      rope.position.set(-0.5, 2.55, -2.7);
      scene.add(rope);
      this.objects.push(rope);
      this.rope = rope;

      // あかちゃん：ステージのうえ
      var baby = G.baby;
      baby.setPose('stand');
      baby.group.position.set(0, 0.17, 0.35);
      baby.group.rotation.set(0, 0, 0);
      baby.setMood('idle');

      if (!this.flashEl) {
        this.flashEl = document.createElement('div');
        this.flashEl.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:35;transition:opacity .1s;';
        document.body.appendChild(this.flashEl);
      }

      this._buildContext();

      // てんき連動のおすすめをふきだしで
      var rec = this._recommend();
      if (rec) {
        UI.showThoughtLater = rec; // update内で位置更新
        UI.bigFeedback(rec === 'rain' ? '☔' : '🌙');
        UI.celebrate(rec === 'rain' ? 'きょうは あめ！なにをきる？' : 'そろそろ ねんね。なにをきる？');
      } else if (CARE.state.naked) {
        UI.celebrate('おきがえしよう！');
      }
      this.recommendKey = rec;
    },

    _recommend: function () {
      if (CARE.state.weather === 'rain') return 'rain';
      if (UI.state.meters.sleep < 0.4) return 'pajama';
      return null;
    },

    _buildContext: function () {
      var self = this;
      var G = AX.G;
      var buttons = [];
      var w = CARE.state.wardrobe;
      OUTFIT_COLORS.forEach(function (c) {
        var key = keyOf(c);
        var st = w[key] || 'clean';
        buttons.push({
          id: 'outfit_' + key,
          emoji: st === 'dirty' ? '🧺' : st === 'wet' ? '💧' : '',
          color: '#' + key,
          selected: !CARE.state.naked && CARE.state.outfitStyle === 'normal' && G.baby.outfitColor === c
        });
      });
      buttons.push({
        id: 'outfit_rain', emoji: '🧥',
        color: '#ffd21f',
        selected: !CARE.state.naked && CARE.state.outfitStyle === 'rain'
      });
      buttons.push({
        id: 'outfit_pajama', emoji: '🌙',
        color: '#8f7fe8',
        selected: !CARE.state.naked && CARE.state.outfitStyle === 'pajama'
      });
      buttons.push({ id: 'socks', emoji: '🧦' });
      HATS.forEach(function (h) {
        buttons.push({ id: 'hat_' + h.id, emoji: h.e, selected: G.baby.hatName === h.id });
      });
      buttons.push({ id: 'photo', emoji: '📸' });
      UI.setContext(buttons, function (id) { self._onPick(id); });
    },

    /* ---------- えらぶ ---------- */

    _onPick: function (id) {
      var G = AX.G;
      if (id.indexOf('outfit_') === 0) {
        var key = id.slice(7);
        var st = CARE.state.wardrobe[key] || 'clean';
        if (st === 'dirty') { this._stinky(key); return; }
        if (st === 'wet') { UI.bigFeedback('💧'); SND.play('refuse'); return; } // まだかわいてない
        this._startDressing(key);
      } else if (id === 'socks') {
        this._startSocks();
      } else if (id.indexOf('hat_') === 0) {
        var hat = id.slice(4);
        G.baby.setHat(hat);
        UI.state.hat = hat;
        UI.save();
        SND.play('boing');
        FX.burst('sparkle', AX.headWorld(), 8);
        G.bumpMeter('happy', 0.05);
        G.baby.setMood('happy');
        G.baby.bounce();
        this._buildContext();
        this._moodResetSoon();
      } else if (id === 'photo') {
        this._takePhoto();
      }
    },

    /* ---------- くさい！→ せんたくの連鎖 ---------- */

    _stinky: function (key) {
      var G = AX.G;
      if (this.laundryJob) { UI.bigFeedback('🫧'); return; } // せんたくちゅう
      SND.play('stink');
      UI.bigFeedback('🤢');
      UI.celebrate('くさい！ せんたくしよう！');
      G.baby.setMood('pout');
      G.baby.refuse();
      // みどりのくさいけむり
      var sp = AX.chestWorld();
      FX.burst('smoke', sp, 4);
      this._moodResetSoon();

      // よごれたふくスプライトが、せんたくきへとんでいく
      var garment = this._garmentSprite(key, true);
      garment.position.set(0.4, 1.4, 0.5);
      G.scene.add(garment);
      this.objects.push(garment);
      this.laundryJob = { key: key, phase: 'toWasher', t: 0, sprite: garment };
      CARE.state.wardrobe[key] = 'washing';
      CARE.save();
      this._buildContext();
    },

    _garmentSprite: function (key, dirty) {
      var color = key === 'rain' ? '#ffd21f' : key === 'pajama' ? '#8f7fe8' : '#' + key;
      var tex = AX.canvasTexture(128, function (g, s) {
        // ロンパースがた
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(s * 0.3, s * 0.2);
        g.lineTo(s * 0.7, s * 0.2);
        g.lineTo(s * 0.85, s * 0.42);
        g.lineTo(s * 0.7, s * 0.5);
        g.lineTo(s * 0.68, s * 0.85);
        g.lineTo(s * 0.32, s * 0.85);
        g.lineTo(s * 0.3, s * 0.5);
        g.lineTo(s * 0.15, s * 0.42);
        g.closePath();
        g.fill();
        if (dirty) {
          g.fillStyle = 'rgba(140,100,50,0.85)';
          g.beginPath(); g.arc(s * 0.45, s * 0.55, s * 0.08, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(s * 0.6, s * 0.7, s * 0.06, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(s * 0.38, s * 0.72, s * 0.05, 0, Math.PI * 2); g.fill();
        }
      }).tex;
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sp.scale.set(0.45, 0.45, 1);
      return sp;
    },

    _laundryUpdate: function (dt, t) {
      var G = AX.G;
      var job = this.laundryJob;
      if (!job) return;

      if (job.phase === 'toWasher') {
        job.t += dt * 1.3;
        var target = this.washer.position.clone().add(new THREE.Vector3(0, 0.48, 0.4));
        job.sprite.position.lerp(target, Math.min(1, job.t));
        if (job.t >= 1) {
          // ドアのなかへ → まわる！
          if (job.sprite.parent) job.sprite.parent.remove(job.sprite);
          job.phase = 'washing';
          job.t = 0;
          SND.play('washer');
          this.washerDrum.material.color.setHex(0x4d7a95);
        }
      } else if (job.phase === 'washing') {
        job.t += dt;
        this.washerDrum.rotation.z -= dt * (6 + Math.sin(job.t * 3) * 3);
        this.washer.position.y = Math.abs(Math.sin(job.t * 18)) * 0.015;
        if (Math.random() < dt * 1.6) SND.play('washer');
        if (Math.random() < dt * 3) {
          FX.burst('bubbles', this.washer.position.clone().add(new THREE.Vector3(0, 0.5, 0.45)), 1);
        }
        if (job.t > 3.2) {
          // チン♪ → ぬれたふく
          job.phase = 'toLine';
          job.t = 0;
          SND.play('ding');
          UI.bigFeedback('🫧');
          this.washer.position.y = 0;
          this.washerDrum.material.color.setHex(0x6f95aa);
          var wet = this._garmentSprite(job.key, false);
          wet.material.color.setHex(0xbbccdd); // ぬれいろ
          wet.position.copy(this.washer.position).add(new THREE.Vector3(0, 0.6, 0.4));
          G.scene.add(wet);
          this.objects.push(wet);
          job.sprite = wet;
          CARE.state.wardrobe[job.key] = 'wet';
          CARE.save();
          this._buildContext();
        }
      } else if (job.phase === 'toLine') {
        job.t += dt * 1.2;
        var lineTarget = new THREE.Vector3(-0.5 + 0.4, 2.35, -2.68);
        job.sprite.position.lerp(lineTarget, Math.min(1, job.t));
        if (job.t >= 1) {
          job.phase = 'drying';
          job.t = 0;
          SND.play('pofu');
        }
      } else if (job.phase === 'drying') {
        job.t += dt;
        // ぶらぶら＋ポタポタ
        job.sprite.material.rotation = Math.sin(t * 1.6) * 0.08;
        if (job.t < 4 && Math.random() < dt * 1.2) {
          FX.burst('drops', job.sprite.position.clone().add(new THREE.Vector3(0, -0.2, 0.1)), 1);
        }
        // だんだんかわく（いろがもどる）
        var dryK = Math.min(1, job.t / 6);
        var c = new THREE.Color(0xbbccdd).lerp(new THREE.Color(0xffffff), dryK);
        job.sprite.material.color.copy(c);
        if (job.t >= 6) {
          // ふわふわにかわいた！
          FX.burst('sparkle', job.sprite.position, 6);
          SND.play('chime');
          UI.bigFeedback('🌤️');
          UI.celebrate('ふわふわに かわいたよ！');
          if (job.sprite.parent) job.sprite.parent.remove(job.sprite);
          CARE.state.wardrobe[job.key] = 'clean';
          CARE.save();
          UI.addStars(1, G.onSticker);
          this.laundryJob = null;
          this._buildContext();
        }
      }
    },

    /* ---------- きせる工程 ---------- */

    _startDressing: function (key) {
      var G = AX.G;
      var baby = G.baby;
      // いったんはだかに（きがえ）
      baby.setNaked(true);
      CARE.state.naked = true;
      CARE.state.clothesStains = [];
      baby.clearStains();

      var style = key === 'rain' ? 'rain' : key === 'pajama' ? 'pajama' : 'normal';
      var color = key === 'rain' ? 0xffd21f : key === 'pajama' ? 0x8f7fe8 : parseInt(key, 16);

      // ふくがあたまのうえにふわふわ
      if (this.garmentMesh && this.garmentMesh.parent) this.garmentMesh.parent.remove(this.garmentMesh);
      this.garmentMesh = this._garmentSprite(key, false);
      this.garmentMesh.position.copy(AX.headWorld()).add(new THREE.Vector3(0, 0.7, 0.1));
      G.scene.add(this.garmentMesh);
      this.objects.push(this.garmentMesh);

      this.dressing = { key: key, style: style, color: color, step: 'head' };
      UI.bigFeedback('👕');
      UI.celebrate('あたまから すぽっ！（ふくをタップ）');
      SND.play('pop');
    },

    _dressStepTap: function (x, y) {
      var G = AX.G;
      var baby = G.baby;
      var d = this.dressing;
      if (!d) return false;

      if (d.step === 'head') {
        var hit = G.pick(x, y, [this.garmentMesh, baby.head], true);
        if (!hit) return false;
        // すぽっ！
        SND.play('whoosh');
        this.garmentAnim = { t: 0 };
        d.step = 'headAnim';
        return true;
      }
      if (d.step === 'armL') {
        var hitL = G.pick(x, y, [baby.armL], true);
        if (!hitL) {
          // うでがうごいていてもOK：からだの左がわならうでとみなす（4さいむけ）
          var hb = G.pick(x, y, [baby.root], true);
          if (hb && hb.point.x < baby.group.position.x - 0.05) hitL = hb;
          else return false;
        }
        baby.armL.rotation.z = 2.6; // うでをあげて
        baby.sleeveL.material = baby.outfitMat;
        SND.play('whoosh');
        FX.burst('sparkle', hitL.point, 3);
        d.step = 'armR';
        UI.celebrate('みぎうでも とおそう！');
        return true;
      }
      if (d.step === 'armR') {
        var hitR = G.pick(x, y, [baby.armR], true);
        if (!hitR) {
          var hb2 = G.pick(x, y, [baby.root], true);
          if (hb2 && hb2.point.x > baby.group.position.x + 0.05) hitR = hb2;
          else return false;
        }
        baby.sleeveR.material = baby.outfitMat;
        SND.play('whoosh');
        FX.burst('sparkle', hitR.point, 3);
        d.step = 'button0';
        // ボタンをはずれた見た目に（よこにずらす）
        baby.buttons[0].visible = true;
        baby.buttons[1].visible = true;
        baby.buttons[0].position.x = 0.09;
        baby.buttons[1].position.x = 0.09;
        baby.buttons[0].material = AX.lambert(0xcccccc);
        baby.buttons[1].material = AX.lambert(0xcccccc);
        UI.celebrate('ボタンを パチン！');
        return true;
      }
      if (d.step === 'button0' || d.step === 'button1') {
        var idx = d.step === 'button0' ? 0 : 1;
        var hitB = G.pick(x, y, [baby.buttons[idx], baby.torso], true);
        if (!hitB) return false;
        SND.play('pop');
        SND.play('tap');
        baby.buttons[idx].position.x = 0;
        baby.buttons[idx].material = AX.lambert(0xffffff);
        baby.buttons[idx].scale.setScalar(1.5);
        FX.burst('sparkle', hitB.point, 2);
        if (idx === 0) {
          d.step = 'button1';
        } else {
          this._finishDressing();
        }
        return true;
      }
      return false;
    },

    _finishDressing: function () {
      var G = AX.G;
      var baby = G.baby;
      var d = this.dressing;
      baby.naked = false;
      baby.buttons[0].scale.setScalar(1);
      baby.buttons[1].scale.setScalar(1);
      baby.diaper.visible = false;
      baby.outfitColor = d.style === 'normal' ? d.color : baby.outfitColor;
      baby.setOutfitStyle(d.style);
      CARE.state.naked = false;
      CARE.state.outfitStyle = d.style;
      if (d.style === 'normal') {
        UI.state.outfitColor = d.color;
        UI.save();
      }
      CARE.save();

      var matched = this.recommendKey && (
        (this.recommendKey === 'rain' && d.style === 'rain') ||
        (this.recommendKey === 'pajama' && d.style === 'pajama')
      );
      baby.setMood(matched ? 'excited' : 'happy');
      baby.bounce();
      SND.play('tada');
      FX.burst('sparkle', AX.chestWorld(), 10);
      if (matched) {
        UI.bigFeedback(this.recommendKey === 'rain' ? '☔👌' : '🌙👌');
        UI.celebrate('てんきに ぴったり！');
        FX.burst('confetti', AX.headWorld(), 14);
        UI.addStars(2, G.onSticker);
      } else {
        UI.bigFeedback('✨');
        UI.addStars(1, G.onSticker);
      }
      G.bumpMeter('happy', 0.1);
      UI.setNeedy('dress', false);
      this.dressing = null;
      this._buildContext();
      this._moodResetSoon();
    },

    /* ---------- くつした・くつ（けんけん） ---------- */

    _startSocks: function () {
      if (this.sockStep >= 4) { UI.bigFeedback('🧦✅'); return; }
      this.sockStep = this.sockStep || 0;
      UI.celebrate(this.sockStep < 2 ? 'くつしたを はかせよう（あしをタップ）' : 'くつも はかせよう！');
      UI.bigFeedback('🧦');
      this.sockMode = true;
    },

    _sockTap: function (x, y) {
      var G = AX.G;
      var baby = G.baby;
      if (!this.sockMode) return false;
      var legs = [baby.legL, baby.legR];
      var expectSide = this.sockStep % 2; // 0=ひだり 1=みぎ
      var hit = G.pick(x, y, [legs[expectSide]], true);
      if (!hit) {
        // はんたいのあしでもOK（4さいむけ・やさしく）
        hit = G.pick(x, y, [legs[1 - expectSide]], true);
        if (!hit) return false;
        expectSide = 1 - expectSide;
      }
      // けんけんバランス！
      this.legLiftSide = expectSide;
      this.legLiftTimer = 0.9;
      SND.play('kenken');
      baby.bounce();
      var isShoe = this.sockStep >= 2;
      SND.play(isShoe ? 'pop' : 'whoosh');
      FX.burst('sparkle', hit.point, 4);
      this.sockStep++;
      if (this.sockStep === 2) {
        baby.footMat.color.setHex(0x8fd8a8); // くつした（ミント）
        UI.bigFeedback('🧦');
        SND.play('chime');
        UI.celebrate('こんどは くつ！');
      } else if (this.sockStep === 4) {
        baby.footMat.color.setHex(0xe0433a); // くつ（あか）
        UI.bigFeedback('👟');
        SND.play('tada');
        UI.celebrate('じょうずに はけました！');
        UI.addStars(1, G.onSticker);
        G.baby.setMood('happy');
        G.baby.clap();
        this.sockMode = false;
        this._moodResetSoon();
      }
      return true;
    },

    /* ---------- しゃしん ---------- */

    _takePhoto: function () {
      var self = this;
      var G = AX.G;
      G.baby.setMood('happy');
      G.baby.wave();
      SND.play('camera');
      this.flashEl.style.opacity = '0.9';
      setTimeout(function () { self.flashEl.style.opacity = '0'; }, 120);
      setTimeout(function () {
        UI.bigFeedback('📸');
        SND.play('tada');
        FX.burst('confetti', AX.headWorld(), 16);
        UI.addStars(2, G.onSticker);
        G.bumpMeter('happy', 0.1);
        // てれっ
        G.baby.setMood('shy');
        SND.play('giggle');
        self._moodResetSoon();
      }, 250);
    },

    _moodResetSoon: function () {
      setTimeout(function () {
        if (AX.G.currentName === 'dress' && AX.G.baby.mood !== 'idle') AX.G.baby.setMood('idle');
      }, 1300);
    },

    /* ---------- 入力 ---------- */

    onDown: function (x, y) {
      var G = AX.G;
      if (this.dressing && this._dressStepTap(x, y)) return;
      if (this._sockTap(x, y)) return;
      // せんたくきタップであわが出る（たのしい）
      if (this.laundryJob && this.laundryJob.phase === 'washing' && G.pick(x, y, [this.washer], true)) {
        FX.burst('bubbles', this.washer.position.clone().add(new THREE.Vector3(0, 0.6, 0.45)), 3);
        SND.play('bubble');
        return;
      }
      var hit = G.pick(x, y, [G.baby.root], true);
      if (hit) {
        G.baby.giggle();
        SND.play('giggle');
        FX.burst('hearts', AX.headWorld(), 4);
      }
    },
    onMove: function () {},
    onUp: function () {},

    update: function (dt, t) {
      var G = AX.G;
      var baby = G.baby;

      // モデルさんふうにゆらゆらターン（きせかえ中はとめる）
      if (!this.dressing && this.legLiftTimer <= 0) {
        baby.group.rotation.y = Math.sin(t * 0.5) * 0.55;
      } else {
        baby.group.rotation.y *= 0.9;
      }

      // 「すぽっ」アニメ：ふくがあたまをとおる
      if (this.garmentAnim && this.dressing && this.dressing.step === 'headAnim') {
        this.garmentAnim.t += dt * 2.2;
        var k = this.garmentAnim.t;
        var hw = AX.headWorld();
        this.garmentMesh.position.set(hw.x, hw.y + 0.7 - k * 0.9, hw.z + 0.1);
        // あたまがきゅっとちぢむ（すぽっ感）
        baby.head.scale.setScalar(1 - Math.sin(Math.min(1, k) * Math.PI) * 0.12);
        if (k >= 1) {
          baby.head.scale.setScalar(1);
          if (this.garmentMesh.parent) this.garmentMesh.parent.remove(this.garmentMesh);
          this.garmentAnim = null;
          // どうたいにいろがつく
          baby.outfitMat.color.setHex(this.dressing.color);
          baby.bodyMesh.material = baby.outfitMat;
          baby.diaper.visible = false;
          baby.buttons[0].visible = false;
          baby.buttons[1].visible = false;
          SND.play('pop');
          FX.burst('sparkle', AX.chestWorld(), 5);
          baby.giggle();
          this.dressing.step = 'armL';
          UI.celebrate('ひだりうでを とおそう！（うでをタップ）');
        }
      }

      // けんけん（かたあしあげてバランス）
      if (this.legLiftTimer > 0) {
        this.legLiftTimer -= dt;
        var leg = this.legLiftSide === 0 ? baby.legL : baby.legR;
        leg.rotation.x = -1.1;
        baby.root.rotation.z = Math.sin(t * 14) * 0.06; // ぐらぐら
        if (this.legLiftTimer <= 0) {
          leg.rotation.x = 0;
          baby.root.rotation.z = 0;
        }
      }

      // てんきのおすすめふきだし
      if (this.recommendKey && !this.dressing) {
        var hw2 = AX.headWorld();
        hw2.y += 0.45; hw2.x += 0.4;
        var s = G.project(hw2);
        UI.showThought(this.recommendKey === 'rain' ? '☔' : '🌙', s.x, s.y);
      } else {
        UI.hideThought();
      }

      // せんたくの流れ
      this._laundryUpdate(dt, t);
    },

    exit: function () {
      var G = AX.G;
      // せんたくちゅうのふくはきれいにしてあげる（つぎに来たとき着られる）
      if (this.laundryJob) {
        CARE.state.wardrobe[this.laundryJob.key] = 'clean';
        CARE.save();
        this.laundryJob = null;
      }
      // きせかけのままなら着せてあげる
      if (this.dressing) {
        var d = this.dressing;
        G.baby.naked = false;
        G.baby.diaper.visible = false;
        G.baby.bodyMesh.material = G.baby.outfitMat;
        G.baby.sleeveL.material = G.baby.outfitMat;
        G.baby.sleeveR.material = G.baby.outfitMat;
        G.baby.buttons[0].visible = true;
        G.baby.buttons[1].visible = true;
        G.baby.buttons[0].position.x = 0;
        G.baby.buttons[1].position.x = 0;
        G.baby.outfitColor = d.style === 'normal' ? d.color : G.baby.outfitColor;
        G.baby.setOutfitStyle(d.style);
        CARE.state.naked = false;
        CARE.state.outfitStyle = d.style;
        CARE.save();
        this.dressing = null;
      }
      if (this.garmentMesh && this.garmentMesh.parent) this.garmentMesh.parent.remove(this.garmentMesh);
      AX.removeAll(this.objects);
      G.baby.group.rotation.y = 0;
      UI.hideThought();
    }
  };

  window.ACTIVITIES.dress = dress;
})();
