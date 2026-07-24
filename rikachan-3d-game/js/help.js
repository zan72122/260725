/* ================================================================
   help.js — おてつだいミニゲーム（プロセスをぜんぶ描写する）
     1) おそうじ … ほうきで はいて ちりとりへ。まいあがると けほけほ！
     2) おせんたく … あつめる→ポケット→せんざい→まわす→ほす→たたむ
     3) パンケーキ … たまごコンコン→こなふりふり→まぜまぜ→やく
   ================================================================ */
(function () {

  /* ================================================
     1) おそうじ
     ================================================ */
  const RHelpClean = {
    group: null, char: null, refs: null,
    floorDusts: [], shelfDusts: [], stains: [],
    tool: 'broom', heldTool: null,
    cloud: 0, stunT: 0, coughCount: 0,
    collected: 0, state: 'intro',
    lastMoveTime: 0, lastPoint: null, sweepIdleT: 0,

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xffe8d0);
      RWorld.scene.fog = new THREE.Fog(0xffe8d0, 16, 36);
      this.floorDusts = []; this.shelfDusts = []; this.stains = [];
      this.cloud = 0; this.stunT = 0; this.coughCount = 0; this.collected = 0;
      this.state = 'intro'; this.tool = 'broom'; this.lastPoint = null;

      RWorld.buildHomeRoom(g);
      this.refs = g.userData.refs;

      // ゆかタップ用の みえない板
      const floorPick = new THREE.Mesh(new THREE.CircleGeometry(7, 20),
        new THREE.MeshBasicMaterial({ visible: false }));
      floorPick.rotation.x = -Math.PI / 2;
      floorPick.position.y = 0.02;
      g.add(floorPick);
      this.floorPick = floorPick;

      // ちりとり（ここに あつめる）
      const pan = RProps.makeDustpan();
      pan.position.set(2.4, 0, 2.5);
      pan.rotation.y = -2.35;
      g.add(pan);
      this.pan = pan;
      this.panCount = 0;

      // ゆかの ほこり
      const spots = [[0, 1.6], [-1.7, 0.4], [1.4, -0.9], [-2.6, -2.2], [0.6, -2.8]];
      spots.forEach((p) => this.spawnFloorDust(p[0], p[1], 1));

      // たなの ほこり（はたき で おとす）
      [[4.2, 0.95, 1.4], [-1.9, 1.95, -5.5]].forEach((p) => {
        const dust = this.makeDustBall(0.8);
        dust.position.set(p[0], p[1], p[2]);
        dust.userData.kind = 'shelf';
        dust.userData.taps = 0;
        g.add(dust);
        this.shelfDusts.push(dust);
      });

      // よごれ（ぞうきん で ふく）
      [[1.5, -1.8], [-2.4, 0.9]].forEach((p) => {
        const stain = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16),
          new THREE.MeshLambertMaterial({ color: 0x9a8060, transparent: true, opacity: 0.85 }));
        stain.rotation.x = -Math.PI / 2;
        stain.position.set(p[0], 0.035, p[1]);
        stain.userData.hp = 1;
        g.add(stain);
        this.stains.push(stain);
      });

      // リナちゃん：そうじロッカーへ どうぐを とりにいく
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(2.0, 0, 2.0);
      this.char.rotation.y = 0.5;
      g.add(this.char);

      RWorld.snapCamera([0, 4.6, 9.6], [0, 1, 0]);
      RWorld.moveCamera([0, 3.8, 8.6], [0, 1, 0]);
      RAudio.playBGM('game');
      RUI.show('minigame-ui');
      RUI.showSkip(() => this.finishIntro(true));
      RUI.guide('そうじロッカーへ どうぐを とりにいこう！');
      RAudio.speak('おへやを ピカピカに しよう！まずは そうじどうぐを とりにいこう');

      const locker = this.refs.locker;
      const lockerP = locker.position;
      this.introSeq = RSeq.run([
        RSeq.walk(this.char, lockerP.x + 0.9, lockerP.z + 1.3, { faceY: Math.PI + 0.35 }),
        RSeq.sfx('doorOpen'),
        RSeq.rotTo(locker.userData.door, 'y', -1.9, 0.6),
        RSeq.say('ほうきと ちりとり、はたきに ぞうきん！'),
        RSeq.wait(0.7),
        RSeq.call(() => this.equipTool('broom')),
        RSeq.sfx('pop'),
        RSeq.walk(this.char, 0, 0.8, { faceY: 0 }),
      ], () => this.finishIntro(false));
    },

    finishIntro(skipped) {
      if (this.introDone) return;
      this.introDone = true;
      if (skipped && this.introSeq) {
        this.introSeq.cancel();
        this.char.position.set(0, 0, 0.8);
        RCharacter.setMood(this.char, 'idle');
        this.equipTool('broom');
      }
      RUI.hideSkip();
      this.state = 'clean';
      RUI.guide('ほうきで ほこりを ちりとりへ あつめよう！');
      RUI.toolbar([
        { icon: '🧹', id: 'broom', selected: true },
        { icon: '🪶', id: 'hataki' },
        { icon: '🧽', id: 'zoukin' },
      ], (id) => this.equipTool(id), { radio: true });
    },

    exit() {
      RUI.hideAllGameUI();
      RUI.hideSkip();
      this.introDone = false;
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.refs = null;
      this.floorDusts = []; this.shelfDusts = []; this.stains = [];
    },

    makeDustBall(scale) {
      const dust = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const b = RWorld.sphere((0.14 + Math.random() * 0.07) * scale, 0x9a9a9a);
        b.material.transparent = true;
        b.material.opacity = 0.92;
        b.position.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.3) * 0.15 + 0.12, (Math.random() - 0.5) * 0.25);
        dust.add(b);
      }
      const e1 = RWorld.sphere(0.03 * scale, 0x333333); e1.position.set(-0.07, 0.16, 0.2 * scale);
      const e2 = RWorld.sphere(0.03 * scale, 0x333333); e2.position.set(0.07, 0.16, 0.2 * scale);
      dust.add(e1, e2);
      return dust;
    },

    spawnFloorDust(x, z, scale) {
      const dust = this.makeDustBall(scale);
      dust.position.set(x, 0, z);
      dust.userData.kind = 'floor';
      dust.userData.vel = new THREE.Vector3();
      this.group.add(dust);
      this.floorDusts.push(dust);
      return dust;
    },

    equipTool(id) {
      this.tool = id;
      RCharacter.drop(this.char, 'right');
      let prop = null;
      if (id === 'broom') { prop = RProps.makeBroom(); prop.rotation.x = 0.5; prop.position.y = 0.55; }
      else if (id === 'hataki') { prop = RProps.makeHataki(); prop.rotation.x = 0.4; prop.position.y = 0.3; }
      else { prop = RProps.makeZoukin(); }
      RCharacter.hold(this.char, 'right', prop);
      this.heldTool = prop;
      const names = { broom: 'ほうき', hataki: 'はたき', zoukin: 'ぞうきん' };
      const hints = { broom: 'ゆかを なでて ほこりを あつめて！', hataki: 'たなの ほこりを パタパタ おとして！', zoukin: 'よごれを ゴシゴシ こすって！' };
      if (this.state === 'clean') RUI.guide(names[id] + '！ ' + hints[id]);
    },

    /* ---------------- そうじの入力 ---------------- */
    onPointerDown(x, y) {
      if (this.state === 'dump') { this.tryDump(x, y); return; }
      if (this.state !== 'clean') return;
      // まどを あける
      const winHits = RMain.raycast(x, y, [this.refs.win]);
      if (winHits.length && !this.refs.win.userData.open) {
        this.openWindow();
        return;
      }
      // はたきで たなの ほこり
      if (this.tool === 'hataki') {
        const hits = RMain.raycast(x, y, this.shelfDusts);
        if (hits.length) {
          let obj = hits[0].object;
          while (obj && obj.userData.kind !== 'shelf') obj = obj.parent;
          if (obj) this.hatakiHit(obj);
          return;
        }
      }
      this.lastPoint = null;
      this.handleStroke(x, y, true);
    },

    onPointerMove(x, y, dx, dy, isDown) {
      if (!isDown || this.state !== 'clean') return;
      this.handleStroke(x, y, false);
    },
    onPointerUp() { this.lastPoint = null; },

    handleStroke(x, y, isStart) {
      if (this.stunT > 0) return;
      const now = performance.now() / 1000;
      if (this.tool === 'zoukin') {
        const hits = RMain.raycast(x, y, this.stains);
        if (hits.length) this.rubStain(hits[0].object);
        // ぞうきんがけの姿勢
        const fHits = RMain.raycast(x, y, [this.floorPick]);
        if (fHits.length) this.moveCharToward(fHits[0].point, 'crouch');
        return;
      }
      if (this.tool !== 'broom') return;
      const hits = RMain.raycast(x, y, [this.floorPick]);
      if (!hits.length) return;
      const p = hits[0].point;
      this.moveCharToward(p, 'work');
      if (this.lastPoint && !isStart) {
        const dt = Math.max(0.008, now - this.lastMoveTime);
        const dir = p.clone().sub(this.lastPoint);
        dir.y = 0;
        const dist = dir.length();
        const speed = dist / dt;
        if (dist > 0.02) {
          dir.normalize();
          this.sweep(p, dir, speed);
        }
      }
      this.lastPoint = p.clone();
      this.lastMoveTime = now;
    },

    moveCharToward(p, mood) {
      const target = new THREE.Vector3(p.x, 0, p.z + 0.7);
      const d = target.clone().sub(this.char.position);
      d.y = 0;
      if (d.length() > 0.15) {
        this.char.position.addScaledVector(d.normalize(), Math.min(d.length(), 0.09));
        this.char.rotation.y = Math.atan2(p.x - this.char.position.x, p.z - this.char.position.z);
      }
      if (this.char.userData.mood !== mood) RCharacter.setMood(this.char, mood);
      this.sweepIdleT = 0;
    },

    /* ほうきで はく：ほこりが ころがって いく */
    sweep(point, dir, speed) {
      if (Math.random() < 0.25) RAudio.sfx('scrub');
      const push = Math.min(5.5, speed * 0.75);
      let hitAny = false;
      this.floorDusts.forEach((dust) => {
        if (dust.position.distanceTo(point) < 1.0) {
          dust.userData.vel.addScaledVector(dir, push * 0.55);
          dust.userData.vel.x += (Math.random() - 0.5) * 0.3;
          dust.userData.vel.z += (Math.random() - 0.5) * 0.3;
          hitAny = true;
        }
      });
      // はやく はきすぎると ほこりが まいあがる！
      if (hitAny && speed > 3.2) {
        const windowOpen = this.refs.win.userData.open;
        this.cloud += (speed - 3.2) * (windowOpen ? 0.035 : 0.1);
        RWorld.dustPuff(point.clone().add(new THREE.Vector3(0, 0.3, 0)), windowOpen ? 2 : 4);
      }
    },

    openWindow() {
      const win = this.refs.win;
      win.userData.open = true;
      RAudio.sfx('slide');
      RSeq.run([
        { dur: 0.6, onUpdate: (p) => { win.userData.pane.position.x = p * 0.95; } },
        RSeq.say('まどを あけたよ！かぜが とおって ほこりが まいにくい！'),
        RSeq.call(() => {
          RUI.praise('いいかんがえ！');
          RWorld.sparkleBurst(new THREE.Vector3(0, 2.6, -6), 10, 0xd0f0ff);
        }),
      ]);
    },

    hatakiHit(dust) {
      dust.userData.taps++;
      RAudio.sfx('swish');
      RCharacter.setMood(this.char, 'work');
      dust.rotation.z = (Math.random() - 0.5) * 0.6;
      dust.position.x += (Math.random() - 0.5) * 0.06;
      if (dust.userData.taps >= 2) {
        // ゆかへ ぽとり → ゆかのほこりに なる
        const idx = this.shelfDusts.indexOf(dust);
        if (idx !== -1) this.shelfDusts.splice(idx, 1);
        RAudio.sfx('boing');
        const fx = dust.position.x, fz = dust.position.z;
        RSeq.run([
          { dur: 0.5, onUpdate: (p) => { dust.position.y = dust.position.y * (1 - p * p); } },
          RSeq.call(() => {
            this.group.remove(dust);
            const nd = this.spawnFloorDust(fx, fz + 0.3, 0.9);
            nd.userData.vel.set((Math.random() - 0.5), 0, 0.5);
            RUI.guide('おちた ほこりも ほうきで あつめよう！');
          }),
        ]);
      }
    },

    rubStain(obj) {
      let stain = obj;
      while (stain && stain.userData.hp === undefined) stain = stain.parent;
      if (!stain) return;
      stain.userData.hp -= 0.055;
      stain.material.opacity = Math.max(0, stain.userData.hp * 0.85);
      if (Math.random() < 0.3) RAudio.sfx('squeak');
      if (stain.userData.hp <= 0) {
        const idx = this.stains.indexOf(stain);
        if (idx !== -1) this.stains.splice(idx, 1);
        this.group.remove(stain);
        RAudio.sfx('sparkle');
        RWorld.sparkleBurst(stain.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 12, 0xd0f0ff);
        RUI.praise('ピカピカ！');
      }
    },

    /* ---------------- けほけほ・はっくしょん ---------------- */
    triggerCough() {
      this.stunT = 1.4;
      this.cloud = 0.35;
      this.coughCount++;
      RCharacter.setMood(this.char, 'cough', 1.4);
      RAudio.sfx('wrong');
      RAudio.speak('けほ けほっ！');
      if (this.coughCount === 1 && !this.refs.win.userData.open) {
        setTimeout(() => {
          RUI.guide('まどを あけると ほこりが まいにくいよ！');
          RAudio.speak('まどを あけると いいかも！');
        }, 1600);
      }
    },

    triggerSneeze() {
      this.stunT = 1.3;
      this.cloud = 0;
      RCharacter.setMood(this.char, 'sneeze', 1.2);
      RAudio.speak('はっ……はっくしょん！！');
      setTimeout(() => {
        RAudio.sfx('gust');
        // くしゃみで ちかくの ほこりが とんでいく！
        this.floorDusts.forEach((dust) => {
          const d = dust.position.clone().sub(this.char.position);
          d.y = 0;
          if (d.length() < 2.6) dust.userData.vel.addScaledVector(d.normalize(), 3.5);
        });
        // ほこりが もこもこ ふえちゃうことも…
        if (this.floorDusts.length > 0 && this.floorDusts.length < 8) {
          const src = this.floorDusts[0];
          const nd = this.spawnFloorDust(src.position.x + 0.5, src.position.z + 0.5, 0.7);
          nd.userData.vel.set(1.2, 0, 0.8);
          RUI.guide('わわっ、ほこりが ふえちゃった！');
        }
      }, 700);
    },

    /* ---------------- ちりとり → ゴミばこ ---------------- */
    tryDump(x, y) {
      const hits = RMain.raycast(x, y, [this.refs.trash, this.pan]);
      if (!hits.length) return;
      this.state = 'dumping';
      const char = this.char;
      const trash = this.refs.trash;
      const pan = this.pan;
      const panPos = pan.position;
      RSeq.run([
        RSeq.guide(''),
        RSeq.walk(char, panPos.x + 0.3, panPos.z + 0.8, { faceY: Math.PI + 0.8 }),
        RSeq.say('ちりとりを もって…'),
        RSeq.mood(char, 'crouch'),
        RSeq.wait(0.6),
        RSeq.call(() => {
          this.group.remove(pan);
          pan.position.set(0, -0.1, 0.15);
          pan.rotation.set(0, Math.PI, 0);
          pan.scale.setScalar(0.8);
          RCharacter.hold(char, 'front', pan);
          RAudio.sfx('pop');
        }),
        RSeq.walk(char, trash.position.x - 0.5, trash.position.z + 1.0, { faceY: Math.PI - 0.6, mood: 'carry', endMood: 'idle' }),
        RSeq.say('ゴミばこに ポイ！'),
        { dur: 0.6, onStart: () => { RCharacter.setMood(char, 'manual'); },
          onUpdate: (p) => {
            const arms = char.userData.parts.arms;
            arms.left.rotation.set(-1.25 - p * 0.9, 0, -0.18);
            arms.right.rotation.set(-1.25 - p * 0.9, 0, 0.18);
            pan.rotation.x = -p * 1.4;
          } },
        RSeq.call(() => {
          RAudio.sfx('thunk');
          RWorld.dustPuff(trash.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 8);
          const pile = pan.userData.pile;
          while (pile.children.length) pile.remove(pile.children[0]);
        }),
        RSeq.wait(0.4),
        RSeq.call(() => { RCharacter.drop(char, 'front'); RCharacter.setMood(char, 'happy', 1.4); }),
        RSeq.sfx('fanfare'),
        RSeq.praise('おへや ピカピカ！'),
        RSeq.call(() => {
          RWorld.confetti(new THREE.Vector3(0, 4, 0), 50);
          for (let i = 0; i < 5; i++) {
            setTimeout(() => {
              RWorld.sparkleBurst(new THREE.Vector3((Math.random() - 0.5) * 7, 1 + Math.random() * 2, (Math.random() - 0.5) * 5), 8, 0xfff0a0);
              RAudio.sfx('sparkle');
            }, i * 220);
          }
        }),
        RSeq.wait(1.6),
        RSeq.call(() => {
          RRewards.pay({
            group: this.group, char: this.char, mama: true, coins: 3,
            onDone: () => RMain.goHome(),
          });
        }),
      ]);
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      if (this.stunT > 0) this.stunT -= dt;

      // まいあがった ほこりの こまりど
      const windowOpen = this.refs && this.refs.win.userData.open;
      this.cloud = Math.max(0, this.cloud - dt * (windowOpen ? 0.55 : 0.15));
      if (this.state === 'clean' && this.stunT <= 0) {
        if (this.cloud > 1.9) this.triggerSneeze();
        else if (this.cloud > 1.0) this.triggerCough();
      }

      // そうじの手をとめたら idle にもどる
      this.sweepIdleT += dt;
      if (this.sweepIdleT > 0.5 && (this.char.userData.mood === 'work' || this.char.userData.mood === 'crouch') && this.state === 'clean') {
        RCharacter.setMood(this.char, 'idle');
      }

      // ほこりの ころがり
      for (let i = this.floorDusts.length - 1; i >= 0; i--) {
        const dust = this.floorDusts[i];
        const v = dust.userData.vel;
        dust.position.addScaledVector(v, dt);
        dust.rotation.x += v.z * dt * 2;
        dust.rotation.z -= v.x * dt * 2;
        v.multiplyScalar(Math.pow(0.1, dt));
        // へやの そとに でない
        const r = Math.sqrt(dust.position.x ** 2 + dust.position.z ** 2);
        if (r > 6) { dust.position.multiplyScalar(6 / r); v.multiplyScalar(-0.4); }
        dust.position.y = Math.abs(Math.sin(time * 2 + i)) * 0.03;
        // ちりとりに はいったら キャッチ！
        if (this.pan) {
          const mouth = new THREE.Vector3(0, 0, 0.35).applyQuaternion(this.pan.quaternion).add(this.pan.position);
          if (dust.position.distanceTo(mouth) < 0.55) {
            this.floorDusts.splice(i, 1);
            this.group.remove(dust);
            this.panCount++;
            RAudio.sfx('pop');
            RWorld.sparkleBurst(mouth.clone().add(new THREE.Vector3(0, 0.2, 0)), 5, 0xd0f0ff);
            const pileBall = RWorld.sphere(0.1 + this.panCount * 0.025, 0x9a9a9a);
            pileBall.position.set((Math.random() - 0.5) * 0.2, 0.05 + this.panCount * 0.03, (Math.random() - 0.5) * 0.15);
            this.pan.userData.pile.add(pileBall);
            const leftAll = this.floorDusts.length + this.shelfDusts.length;
            if (leftAll > 0) RUI.guide('その ちょうし！のこり ' + leftAll + 'こ！');
            RUI.praise('あつめた！');
          }
        }
      }

      // ぜんぶ きれいに なったら ゴミばこへ
      if (this.state === 'clean' &&
          this.floorDusts.length === 0 && this.shelfDusts.length === 0 && this.stains.length === 0) {
        this.state = 'dump';
        RUI.guide('ちりとりの ゴミを ゴミばこに ポイしよう！ゴミばこを タッチ！');
        RAudio.speak('さいごは ちりとりの ゴミを ゴミばこへ すてよう！');
        RWorld.sparkleBurst(this.refs.trash.position.clone().add(new THREE.Vector3(0, 1, 0)), 10, 0xa0e8b0);
      }
    },
  };

  /* ================================================
     2) おせんたく（フルコース）
     ================================================ */
  const RHelpLaundry = {
    group: null, char: null, cat: null,
    state: 'intro',
    clothes: [], stack: [], hungSlots: [],

    CLOTH_DEFS: [
      { id: 'red',    color: 0xe84d4d, kind: 'shirt', pocket: true },
      { id: 'white',  color: 0xffffff, kind: 'shirt', gag: true },
      { id: 'yellow', color: 0xffd447, kind: 'shirt' },
      { id: 'sock',   color: 0x5a8fe8, kind: 'sock' },
    ],

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xc8ecff);
      RWorld.scene.fog = new THREE.Fog(0xc8ecff, 18, 40);
      this.state = 'intro';
      this.clothes = []; this.stack = []; this.hungSlots = [null, null, null, null];
      this.collected = 0; this.unloaded = 0; this.shakeIdx = 0; this.shakeTaps = 0;
      this.foldIdx = 0; this.foldStep = 0; this.dryT = 0; this.weatherDone = false;
      this.soapFill = 0; this.pouring = false; this.washT = 0;
      this.hangIdx = 0; this.takeIdx = 0; this.rainTaken = 0;
      this.pocketShirt = null; this.foldCloth = null;
      // 2かいめの プレイでも まっさらに
      this.CLOTH_DEFS.forEach((d) => {
        delete d.basketMesh; delete d.mesh; delete d.folded;
        delete d.hung; delete d.pin; delete d.slotX; delete d.outColor;
      });

      // おにわ
      const ground = new THREE.Mesh(new THREE.CircleGeometry(25, 40), RWorld.mat(0xa8e6a1));
      ground.rotation.x = -Math.PI / 2;
      g.add(ground);

      // せんたくき
      const washer = new THREE.Group();
      const body = RWorld.box(1.5, 1.8, 1.3, 0xffffff);
      body.position.y = 0.9;
      const windowRim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 12, 28), RWorld.mat(0xd0d0d0));
      windowRim.position.set(0, 0.95, 0.68);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 24),
        RWorld.mat(0x8fd4e8, { transparent: true, opacity: 0.5 }));
      glass.rotation.x = Math.PI / 2;
      glass.position.set(0, 0.95, 0.7);
      // ドラムのなか（まわす よう）
      const drum = new THREE.Group();
      drum.position.set(0, 0.95, 0.55);
      washer.add(body, windowRim, glass, drum);
      // スタートボタン
      const button = RWorld.cyl(0.12, 0.12, 0.08, 0xff5aa8, 14);
      button.rotation.x = Math.PI / 2;
      button.position.set(0.45, 1.62, 0.68);
      washer.add(button);
      washer.position.set(-3.2, 0, -0.8);
      washer.rotation.y = 0.5;
      g.add(washer);
      this.washer = washer;
      this.drum = drum;
      this.washButton = button;

      // せんざいボトル
      const soap = RProps.makeDetergent();
      soap.position.set(-3.9, 1.8, -1.3);
      soap.rotation.y = 0.5;
      g.add(soap);
      this.soap = soap;
      // けいりょうカップ
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.16, 14, 1, true),
        RWorld.mat(0xd0ecff, { side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
      cap.position.set(-3.1, 1.85, -0.6);
      g.add(cap);
      const capFill = RWorld.cyl(0.09, 0.08, 0.01, 0x4a9fd4, 12);
      capFill.position.y = -0.06;
      cap.add(capFill);
      this.cap = cap;
      this.capFill = capFill;
      cap.visible = false;

      // だっい かご
      const basket = new THREE.Group();
      const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.5, 0.7, 16, 1, true),
        RWorld.mat(0xf0d080, { side: THREE.DoubleSide }));
      bk.position.y = 0.35;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.05, 10, 22), RWorld.mat(0xd9b060));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.7;
      basket.add(bk, rim);
      basket.position.set(-1.0, 0, 1.5);
      g.add(basket);
      this.basket = basket;
      // かごのなかの ふく（みえるように つみあげ）
      this.CLOTH_DEFS.forEach((def, i) => {
        const c = def.kind === 'sock' ? RProps.makeSock(def.color) : this.makeShirt(def.color);
        c.scale.setScalar(0.55);
        c.position.set((Math.random() - 0.5) * 0.3, 0.55 + i * 0.13, (Math.random() - 0.5) * 0.2);
        c.rotation.z = (Math.random() - 0.5) * 0.8;
        basket.add(c);
        def.basketMesh = c;
      });

      // ものほしロープ
      [-3.5, 3.5].forEach((x) => {
        const pole = RWorld.cyl(0.06, 0.08, 2.6, 0xd0a060, 10);
        pole.position.set(x, 1.3, -4.5);
        g.add(pole);
      });
      const rope = RWorld.cyl(0.02, 0.02, 7, 0xffffff, 8);
      rope.rotation.z = Math.PI / 2;
      rope.position.set(0, 2.5, -4.5);
      g.add(rope);
      // ほすばしょの めじるし
      this.slotRings = [];
      [-2.1, -0.7, 0.7, 2.1].forEach((x) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 20),
          new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0 }));
        ring.position.set(x, 2.1, -4.5);
        g.add(ring);
        this.slotRings.push(ring);
      });

      // たたみテーブルと ミニたんす
      const table = RWorld.box(1.8, 0.75, 1.1, 0xf0c090);
      table.position.set(2.2, 0.37, 1.3);
      g.add(table);
      const tableTop = RWorld.box(1.9, 0.08, 1.2, 0xffffff);
      tableTop.position.set(2.2, 0.78, 1.3);
      g.add(tableTop);
      this.table = table;
      const tansu = RProps.makeTansu();
      tansu.scale.setScalar(0.8);
      tansu.position.set(4.6, 0, -0.6);
      tansu.rotation.y = -0.7;
      g.add(tansu);
      this.tansu = tansu;

      // たいよう
      const sun = new THREE.Group();
      const sunBall = RWorld.sphere(0.7, 0xffe14d);
      sunBall.material = new THREE.MeshBasicMaterial({ color: 0xffe14d });
      sun.add(sunBall);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const ray = RWorld.box(0.3, 0.08, 0.05, 0xffe14d);
        ray.material = new THREE.MeshBasicMaterial({ color: 0xffe14d });
        ray.position.set(Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0);
        ray.rotation.z = a;
        sun.add(ray);
      }
      sun.position.set(-6, 6.5, -9);
      g.add(sun);
      this.sun = sun;

      // ねこのミルクも おにわに
      this.cat = RWorld.buildCat();
      this.cat.position.set(3.2, 0, 2.6);
      this.cat.rotation.y = -0.6;
      g.add(this.cat);

      // リナちゃん
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(2.5, 0, 3.5);
      g.add(this.char);

      RWorld.snapCamera([0, 4.6, 10.5], [0, 1.2, 0]);
      RWorld.moveCamera([0, 3.6, 9.2], [0, 1.1, 0]);
      RAudio.playBGM('game');
      RUI.show('minigame-ui');
      RUI.showSkip(() => this.finishIntro(true));
      RUI.guide('だついかごの おようふくを あつめよう！');
      RAudio.speak('きょうは おせんたく！かごの おようふくを あつめて');

      this.introSeq = RSeq.run([
        RSeq.walk(this.char, this.basket.position.x + 1.0, this.basket.position.z + 0.6, { faceY: -1.9 }),
      ], () => this.finishIntro(false));
    },

    finishIntro(skipped) {
      if (this.introDone) return;
      this.introDone = true;
      if (skipped && this.introSeq) {
        this.introSeq.cancel();
        this.char.position.set(this.basket.position.x + 1.0, 0, this.basket.position.z + 0.6);
        this.char.rotation.y = -1.9;
        RCharacter.setMood(this.char, 'idle');
      }
      RUI.hideSkip();
      this.state = 'collect';
      RUI.guide('かごを タッチして おようふくを あつめよう！（あと4まい）');
    },

    exit() {
      RUI.hideAllGameUI();
      RUI.hideSkip();
      this.introDone = false;
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.cat = null;
    },

    makeShirt(color) {
      const g = new THREE.Group();
      const bodyBottom = RWorld.box(0.7, 0.36, 0.16, color);
      bodyBottom.position.y = -0.18;
      const topHalf = new THREE.Group();
      const bodyTop = RWorld.box(0.7, 0.36, 0.16, color);
      bodyTop.position.y = 0.18;
      const sleeveL = new THREE.Group();
      const sl = RWorld.box(0.28, 0.28, 0.14, color);
      sl.position.x = -0.14;
      sleeveL.add(sl);
      sleeveL.position.set(-0.35, 0.22, 0);
      sleeveL.rotation.z = 0.5;
      const sleeveR = new THREE.Group();
      const sr = RWorld.box(0.28, 0.28, 0.14, color);
      sr.position.x = 0.14;
      sleeveR.add(sr);
      sleeveR.position.set(0.35, 0.22, 0);
      sleeveR.rotation.z = -0.5;
      const collar = RWorld.sphere(0.11, 0xffffff, 1.4, 0.5, 0.6);
      collar.position.y = 0.36;
      topHalf.add(bodyTop, sleeveL, sleeveR, collar);
      g.add(bodyBottom, topHalf);
      g.userData.topHalf = topHalf;
      g.userData.sleeveL = sleeveL;
      g.userData.sleeveR = sleeveR;
      return g;
    },

    /* ---------------- 入力（フェーズごと） ---------------- */
    onPointerDown(x, y) {
      const s = this.state;
      if (s === 'collect') this.tapCollect(x, y);
      else if (s === 'pocket') this.tapPocket();
      else if (s === 'load') this.tapLoad(x, y);
      else if (s === 'soap') this.startPour(x, y);
      else if (s === 'wash-wait') this.tapWashButton(x, y);
      else if (s === 'unload') this.tapUnload(x, y);
      else if (s === 'shake') this.tapShake();
      else if (s === 'hang') this.tapHang();
      else if (s === 'rain') this.tapRainTakeIn();
      else if (s === 'takein') this.tapTakeIn();
      else if (s === 'fold') this.tapFold();
      else if (s === 'store') this.tapStore(x, y);
    },
    onPointerMove() {},
    onPointerUp() { this.pouring = false; },

    /* --- あつめる --- */
    tapCollect(x, y) {
      const hits = RMain.raycast(x, y, [this.basket]);
      if (!hits.length) return;
      const def = this.CLOTH_DEFS[this.collected];
      if (!def) return;
      this.collected++;
      RAudio.sfx('pop');
      RCharacter.setMood(this.char, 'crouch', 0.5);
      const mesh = def.basketMesh;
      const char = this.char;
      RSeq.run([
        {
          dur: 0.45,
          onStart: function () { this._from = mesh.getWorldPosition(new THREE.Vector3()); this._g = mesh.parent; },
          onUpdate: function (p) {
            if (mesh.parent !== RHelpLaundry.group) {
              RHelpLaundry.basket.remove(mesh);
              RHelpLaundry.group.add(mesh);
            }
            const to = new THREE.Vector3(char.position.x, 1.15, char.position.z + 0.45);
            mesh.position.lerpVectors(this._from, to, p);
            mesh.position.y += Math.sin(p * Math.PI) * 0.6;
          },
          onEnd: () => {
            RHelpLaundry.group.remove(mesh);
            // かかえた ふくの やま
            const held = def.kind === 'sock' ? RProps.makeSock(def.color) : RHelpLaundry.makeShirt(def.color);
            held.scale.setScalar(0.45);
            held.position.set(0, 0.1 + RHelpLaundry.stack.length * 0.12, 0.1);
            held.rotation.x = 0.4;
            char.userData.parts.front.add(held);
            RHelpLaundry.stack.push(held);
            RCharacter.setMood(char, 'carry');
          },
        },
      ]);
      const left = this.CLOTH_DEFS.length - this.collected;
      if (left > 0) {
        RUI.guide('あつめよう！（あと' + left + 'まい）');
      } else {
        setTimeout(() => this.startPocketCheck(), 700);
      }
    },

    /* --- ポケットチェック --- */
    startPocketCheck() {
      this.state = 'pocket';
      RUI.guide('あらう まえに ポケットを チェック！シャツを タッチ！');
      RAudio.speak('あらう まえに ポケットの なかみを チェックしよう！');
      // あかい シャツを おおきく かかげる
      const big = this.makeShirt(0xe84d4d);
      big.scale.setScalar(1.5);
      big.position.set(this.char.position.x, 2.0, this.char.position.z + 0.7);
      this.group.add(big);
      const pocket = RWorld.box(0.22, 0.2, 0.04, 0xc23a3a);
      pocket.position.set(0.15, -0.15, 0.1);
      big.add(pocket);
      this.pocketShirt = big;
      this.pocketPulse = 0;
    },

    tapPocket() {
      if (!this.pocketShirt) return;
      const big = this.pocketShirt;
      this.pocketShirt = null;
      RAudio.sfx('paka');
      const hanky = RProps.makeHandkerchief();
      hanky.position.copy(big.position).add(new THREE.Vector3(0.2, -0.3, 0.2));
      this.group.add(hanky);
      const cat = this.cat;
      RSeq.run([
        RSeq.say('あ！ハンカチが はいってた！あぶない あぶない'),
        RSeq.move(hanky, [2.6, 0.02, 2.0], 0.7, { arc: 1.0, spin: 2 }),
        RSeq.call(() => { this.group.remove(big); }),
        // ミルクが ハンカチに とびつく
        RSeq.walk(cat, 2.6, 2.3, { speed: 3.2, endMood: 'idle' }),
        RSeq.call(() => {
          RAudio.sfx('meow');
          cat.position.y = 0;
          RWorld.heartBurst(cat.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 3);
        }),
        RSeq.praise('よく きづいたね！'),
        RSeq.call(() => this.startLoad()),
      ]);
    },

    /* --- せんたくきに いれる --- */
    startLoad() {
      this.state = 'load';
      RUI.guide('せんたくきを タッチして おようふくを いれよう！');
    },

    tapLoad(x, y) {
      const hits = RMain.raycast(x, y, [this.washer]);
      if (!hits.length) return;
      this.state = 'loading';
      const char = this.char;
      const washerP = this.washer.position;
      const steps = [
        RSeq.walk(char, washerP.x + 1.3, washerP.z + 1.1, { faceY: -2.2, mood: 'carry', endMood: 'idle' }),
      ];
      this.CLOTH_DEFS.forEach((def, i) => {
        steps.push(RSeq.call(() => {
          const held = this.stack[i];
          if (held) held.visible = false;
          const fly = def.kind === 'sock' ? RProps.makeSock(def.color) : this.makeShirt(def.color);
          fly.scale.setScalar(0.5);
          fly.position.set(char.position.x, 1.2, char.position.z);
          this.group.add(fly);
          this._fly = fly;
          RAudio.sfx('swish');
        }));
        steps.push({
          dur: 0.3,
          onUpdate: (p) => {
            const fly = this._fly;
            if (!fly) return;
            const to = new THREE.Vector3(washerP.x + 0.4, 0.95, washerP.z + 0.5);
            fly.position.lerp(to, p);
            fly.rotation.z = p * 3;
            fly.scale.setScalar(0.5 * (1 - p * 0.6));
          },
          onEnd: () => { if (this._fly) { this.group.remove(this._fly); this._fly = null; } RAudio.sfx('pop'); },
        });
      });
      steps.push(RSeq.call(() => {
        RCharacter.drop(char, 'front');
        this.stack = [];
        this.startSoap();
      }));
      RSeq.run(steps);
    },

    /* --- せんざいを はかって いれる --- */
    startSoap() {
      this.state = 'soap';
      this.cap.visible = true;
      RUI.guide('せんざいボトルを ながおしで カップに はかろう！');
      RAudio.speak('せんざいを キャップで はかろう！せんの ところまでね');
    },

    startPour(x, y) {
      const hits = RMain.raycast(x, y, [this.soap]);
      if (hits.length) this.pouring = true;
    },

    finishSoap() {
      this.state = 'soap-done';
      this.pouring = false;
      RAudio.speak('ストップ！ちょうど いい！');
      RUI.praise('じょうずに はかれた！');
      const cap = this.cap;
      const washerP = this.washer.position;
      RSeq.run([
        RSeq.wait(0.5),
        RSeq.move(cap, [washerP.x + 0.4, 1.2, washerP.z + 0.5], 0.6, { arc: 0.8 }),
        RSeq.call(() => { RAudio.sfx('splash'); cap.visible = false; }),
        RSeq.call(() => {
          this.state = 'wash-wait';
          RUI.guide('ピンクの スイッチを おして スタート！');
        }),
      ]);
    },

    /* --- あらう --- */
    tapWashButton(x, y) {
      const hits = RMain.raycast(x, y, [this.washer]);
      if (!hits.length) return;
      this.state = 'washing';
      this.washT = 0;
      RAudio.sfx('tap');
      RUI.guide('ぐるぐる ごしごし… まわってるよ！');
      RAudio.speak('スイッチ オン！ぐるぐる まわして きれいに してるよ');
      // ドラムのなかに ふくと あわ
      this.CLOTH_DEFS.forEach((def, i) => {
        const mini = def.kind === 'sock' ? RProps.makeSock(def.color) : this.makeShirt(def.color);
        mini.scale.setScalar(0.3);
        const a = (i / 4) * Math.PI * 2;
        mini.position.set(Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0);
        this.drum.add(mini);
      });
      for (let i = 0; i < 5; i++) {
        const bub = RWorld.sphere(0.06 + Math.random() * 0.05, 0xffffff);
        bub.material.transparent = true;
        bub.material.opacity = 0.8;
        const a = Math.random() * Math.PI * 2;
        bub.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.05);
        this.drum.add(bub);
      }
      // ミルクが まどを のぞきにくる
      RSeq.run([
        RSeq.walk(this.cat, this.washer.position.x + 1.2, this.washer.position.z + 1.6, { speed: 2.0 }),
        RSeq.call(() => { RAudio.sfx('meow'); }),
      ]);
    },

    /* --- とりだして パンパン --- */
    startUnload() {
      this.state = 'unload';
      RUI.guide('できあがり！せんたくきを タッチして とりだそう！');
      RAudio.sfx('beep');
      RAudio.speak('ピーッ！おせんたく できあがり！');
      while (this.drum.children.length) this.drum.remove(this.drum.children[0]);
    },

    tapUnload(x, y) {
      const hits = RMain.raycast(x, y, [this.washer]);
      if (!hits.length) return;
      const def = this.CLOTH_DEFS[this.unloaded];
      if (!def) return;
      this.unloaded++;
      this.state = 'unloading';
      const washerP = this.washer.position;
      // しろい シャツが ピンクに！（いろうつりの ハプニング）
      const outColor = def.gag ? 0xffb3d9 : def.color;
      def.outColor = outColor;
      const cloth = def.kind === 'sock' ? RProps.makeSock(outColor) : this.makeShirt(outColor);
      cloth.position.set(washerP.x + 0.4, 0.95, washerP.z + 0.6);
      cloth.scale.setScalar(0.4);
      cloth.rotation.z = 0.6; // しわしわ
      this.group.add(cloth);
      def.mesh = cloth;
      const steps = [
        RSeq.sfx('pop'),
        RSeq.move(cloth, [this.char.position.x, 1.3, this.char.position.z + 0.5], 0.5, { arc: 0.5 }),
      ];
      if (def.gag) {
        steps.push(RSeq.call(() => { RWorld.sparkleBurst(cloth.position.clone(), 6, 0xffb3d9); }));
        steps.push(RSeq.say('あれれ？しろい シャツが ピンクに なっちゃった！'));
        steps.push(RSeq.wait(1.3));
        steps.push(RSeq.say('あかい ふくと いっしょに あらったからだね。えへへ、かわいいから いっか！'));
        steps.push(RSeq.wait(1.0));
      }
      steps.push(RSeq.call(() => {
        cloth.visible = false;
        if (this.unloaded < this.CLOTH_DEFS.length) {
          this.state = 'unload';
          RUI.guide('つぎも とりだそう！（あと' + (this.CLOTH_DEFS.length - this.unloaded) + 'まい）');
        } else {
          this.startShake();
        }
      }));
      RSeq.run(steps);
    },

    startShake() {
      this.state = 'shake';
      this.shakeIdx = 0;
      this.shakeTaps = 0;
      this.showShakeCloth();
      RAudio.speak('しわを のばすよ！パン パン！');
    },

    showShakeCloth() {
      const def = this.CLOTH_DEFS[this.shakeIdx];
      const cloth = def.mesh;
      cloth.visible = true;
      cloth.scale.setScalar(0.9);
      cloth.rotation.set(0, 0, 0.5);
      cloth.position.set(this.char.position.x, 1.6, this.char.position.z + 0.8);
      RCharacter.setMood(this.char, 'reach');
      RUI.guide('タッチで パンパン！しわを のばそう！（2かい）');
    },

    tapShake() {
      const def = this.CLOTH_DEFS[this.shakeIdx];
      if (!def || !def.mesh) return;
      this.shakeTaps++;
      RAudio.sfx('shakeCloth');
      const cloth = def.mesh;
      RWorld.waterDrops(cloth.position.clone(), 5, 0.5);
      RSeq.run([
        { dur: 0.22, onUpdate: (p) => { cloth.rotation.z = 0.5 * (1 - this.shakeTaps / 2) + Math.sin(p * Math.PI * 2) * 0.4; } },
      ]);
      if (this.shakeTaps >= 2) {
        cloth.rotation.z = 0;
        RUI.praise('しわ ゼロ！');
        this.shakeTaps = 0;
        cloth.visible = false;
        this.shakeIdx++;
        if (this.shakeIdx < this.CLOTH_DEFS.length) {
          this.showShakeCloth();
        } else {
          this.startHang();
        }
      }
    },

    /* --- ほす --- */
    startHang() {
      this.state = 'hang';
      this.hangIdx = 0;
      RCharacter.setMood(this.char, 'idle');
      RUI.guide('ロープの ひかってる ところを タッチして ほそう！');
      RAudio.speak('おひさまの したに ほそう！');
      this.slotRings.forEach((r) => { r.material.opacity = 0.9; });
      const char = this.char;
      RSeq.run([RSeq.walk(char, 0, -3.2, { faceY: Math.PI })]);
    },

    tapHang() {
      const def = this.CLOTH_DEFS[this.hangIdx];
      if (!def) return;
      const slotX = [-2.1, -0.7, 0.7, 2.1][this.hangIdx];
      this.hangIdx++;
      const cloth = def.mesh;
      cloth.visible = true;
      cloth.scale.setScalar(0.75);
      cloth.position.set(this.char.position.x, 1.4, this.char.position.z);
      def.hung = true;
      def.slotX = slotX;
      RAudio.sfx('swish');
      RSeq.run([
        RSeq.move(cloth, [slotX, 2.1, -4.5], 0.5, { arc: 0.6 }),
        RSeq.call(() => {
          const pin = RProps.makeClothespin();
          pin.position.set(slotX, 2.48, -4.5);
          pin.scale.setScalar(0.01);
          this.group.add(pin);
          def.pin = pin;
          RSeq.run([RSeq.scaleTo(pin, 1, 0.25)]);
          RAudio.sfx('clip');
          this.slotRings[this.hangIdx - 1].material.opacity = 0;
        }),
      ]);
      if (this.hangIdx >= this.CLOTH_DEFS.length) {
        setTimeout(() => this.startDry(), 900);
      } else {
        RUI.guide('つぎも ほそう！（あと' + (this.CLOTH_DEFS.length - this.hangIdx) + 'まい）');
      }
    },

    /* --- かわくのを まつ（たいよう と ハプニング） --- */
    startDry() {
      this.state = 'dry';
      this.dryT = 0;
      this.weatherDone = false;
      RUI.guide('おひさまで かわかそう！ひらひら〜');
      RAudio.speak('おひさまが かわかしてくれるよ。しばらく ひなたぼっこ！');
    },

    triggerWeather() {
      this.weatherDone = true;
      const roll = Math.random();
      if (this.forceWeather) { this.doWeather(this.forceWeather); return; }
      if (roll < 0.4) this.doWeather('rain');
      else if (roll < 0.7) this.doWeather('wind');
      // のこりは はれのまま
    },

    doWeather(kind) {
      if (kind === 'rain') {
        this.state = 'rain';
        this.rainTaken = 0;
        const cloud = RProps.makeRainCloud();
        cloud.position.set(-8, 5.5, -4.5);
        this.group.add(cloud);
        this.rainCloud = cloud;
        RSeq.run([
          RSeq.move(cloud, [0, 5.5, -4.5], 1.2),
          RSeq.call(() => {
            RWorld.scene.background = new THREE.Color(0x9ab8cc);
            RAudio.sfx('rain');
            RUI.guide('あめが ふってきた！タッチで いそいで とりこもう！');
            RAudio.speak('たいへん！あめだ！いそいで とりこもう！');
          }),
        ]);
      } else if (kind === 'wind') {
        this.state = 'wind';
        RAudio.sfx('gust');
        RUI.guide('つよい かぜ！');
        const sockDef = this.CLOTH_DEFS.find((d) => d.kind === 'sock' && d.hung);
        if (!sockDef) { this.state = 'dry'; return; }
        const sock = sockDef.mesh;
        const cat = this.cat;
        RSeq.run([
          RSeq.say('わわっ、くつしたが とばされた！'),
          RSeq.call(() => { if (sockDef.pin) this.group.remove(sockDef.pin); }),
          RSeq.move(sock, [4.2, 0.1, -2.0], 1.0, { arc: 1.6, spin: 6 }),
          // ミルクが おいかけて キャッチ！
          RSeq.call(() => RAudio.sfx('meow')),
          RSeq.walk(cat, 3.6, -1.6, { speed: 4.0 }),
          { dur: 0.4, onUpdate: (p) => { cat.position.y = Math.sin(p * Math.PI) * 0.7; } },
          RSeq.call(() => {
            sock.position.set(cat.position.x, 0.7, cat.position.z + 0.3);
            RAudio.sfx('pop');
            RWorld.heartBurst(cat.position.clone().add(new THREE.Vector3(0, 1, 0)), 4);
          }),
          RSeq.say('ミルク、ナイスキャッチ！ありがとう！'),
          RSeq.walk(cat, sockDef.slotX + 0.5, -3.8, { speed: 2.2 }),
          {
            dur: 0.4,
            onUpdate: (p) => {
              sock.position.lerp(new THREE.Vector3(sockDef.slotX, 2.1, -4.5), p);
            },
          },
          RSeq.call(() => {
            const pin = RProps.makeClothespin();
            pin.position.set(sockDef.slotX, 2.48, -4.5);
            this.group.add(pin);
            sockDef.pin = pin;
            RAudio.sfx('clip');
            RUI.praise('ミルク えらい！');
            this.state = 'dry';
            RUI.guide('よかった！ひきつづき かわかそう');
          }),
          RSeq.walk(cat, 3.2, 2.6, { speed: 1.8 }),
        ]);
      }
    },

    tapRainTakeIn() {
      const def = this.CLOTH_DEFS.filter((d) => d.hung)[0];
      if (!def) return;
      def.hung = false;
      this.rainTaken++;
      RAudio.sfx('swish');
      if (def.pin) { this.group.remove(def.pin); def.pin = null; }
      const cloth = def.mesh;
      RSeq.run([
        RSeq.move(cloth, [this.char.position.x, 1.2, this.char.position.z + 0.4], 0.3),
        RSeq.call(() => { cloth.visible = false; }),
      ]);
      if (this.rainTaken >= this.CLOTH_DEFS.length) {
        // ぜんぶ とりこんだ → はれて さいかい
        RSeq.run([
          RSeq.praise('セーフ！'),
          RSeq.call(() => { RAudio.sfx('yay'); }),
          RSeq.move(this.rainCloud, [8, 5.5, -4.5], 1.2),
          RSeq.call(() => {
            this.group.remove(this.rainCloud);
            RWorld.scene.background = new THREE.Color(0xc8ecff);
            RAudio.speak('おひさま もどってきた！もういちど ほそう');
          }),
          RSeq.wait(0.3),
          // じどうで もういちど ほしなおす
          RSeq.call(() => {
            this.CLOTH_DEFS.forEach((d, i) => {
              d.hung = true;
              d.mesh.visible = true;
              d.mesh.position.set(d.slotX, 2.1, -4.5);
              const pin = RProps.makeClothespin();
              pin.position.set(d.slotX, 2.48, -4.5);
              this.group.add(pin);
              d.pin = pin;
            });
            RAudio.sfx('clip');
            this.state = 'dry';
            this.dryT = 5.0;
            RUI.guide('もうすこしで かわくよ！');
          }),
        ]);
      }
    },

    /* --- とりこんで たたむ --- */
    startTakeIn() {
      this.state = 'takein';
      this.takeIdx = 0;
      RAudio.sfx('chime');
      RUI.guide('かわいた！ふくを タッチして とりこもう！');
      RAudio.speak('ふわふわに かわいた！とりこんで たたもう！');
      // かわいた ふくは いろが あかるく キラキラ
      this.CLOTH_DEFS.forEach((def) => {
        def.mesh.traverse((o) => {
          if (o.material && o.material.color) {
            const c = o.material.color;
            c.lerp(new THREE.Color(0xffffff), 0.18);
          }
        });
        RWorld.sparkleBurst(def.mesh.position.clone(), 4, 0xfff0c0);
      });
    },

    tapTakeIn() {
      const def = this.CLOTH_DEFS.filter((d) => d.hung)[0];
      if (!def) return;
      def.hung = false;
      this.takeIdx++;
      if (def.pin) { this.group.remove(def.pin); def.pin = null; }
      RAudio.sfx('swish');
      const cloth = def.mesh;
      RSeq.run([
        RSeq.move(cloth, [2.2, 0.9 + this.takeIdx * 0.05, 1.3], 0.5, { arc: 0.8 }),
        RSeq.call(() => { cloth.scale.setScalar(0.5); }),
      ]);
      if (this.takeIdx >= this.CLOTH_DEFS.length) {
        setTimeout(() => this.startFold(), 800);
      }
    },

    startFold() {
      this.state = 'fold';
      this.foldIdx = 0;
      this.foldStep = 0;
      RWorld.moveCamera([2.2, 2.6, 4.6], [2.2, 0.9, 1.3]);
      const char = this.char;
      RSeq.run([
        RSeq.walk(char, 2.2, 2.5, { faceY: Math.PI }),
        RSeq.call(() => this.showFoldCloth()),
      ]);
      RAudio.speak('テーブルで たたむよ！そでを パタン、はんぶんに パタン！');
    },

    showFoldCloth() {
      const def = this.CLOTH_DEFS[this.foldIdx];
      if (!def) return;
      // たたみよう に おおきく ひろげる
      this.CLOTH_DEFS.forEach((d) => { if (d.mesh) d.mesh.visible = false; });
      const cloth = def.kind === 'sock' ? RProps.makeSock(def.outColor) : this.makeShirt(def.outColor);
      cloth.scale.setScalar(1.1);
      cloth.rotation.x = -Math.PI / 2 + 0.3;
      cloth.position.set(2.2, 0.95, 1.3);
      this.group.add(cloth);
      this.foldCloth = cloth;
      this.foldStep = 0;
      const steps = def.kind === 'sock' ? 'はんぶんに 1かい タッチ！' : 'そで→そで→はんぶん の 3かい タッチ！';
      RUI.guide('たたもう！' + steps);
    },

    tapFold() {
      const def = this.CLOTH_DEFS[this.foldIdx];
      const cloth = this.foldCloth;
      if (!def || !cloth) return;
      this.foldStep++;
      RCharacter.setMood(this.char, 'work', 0.5);
      const finishThis = () => {
        RAudio.sfx('paka');
        this.group.remove(cloth);
        this.foldCloth = null;
        const block = RProps.makeFoldedCloth(def.outColor);
        block.position.set(2.0 + this.foldIdx * 0.15, 0.86 + this.foldIdx * 0.13, 1.3);
        this.group.add(block);
        def.folded = block;
        RUI.praise('ぱたん！');
        this.foldIdx++;
        if (this.foldIdx < this.CLOTH_DEFS.length) {
          this.showFoldCloth();
        } else {
          this.startStore();
        }
      };
      if (def.kind === 'sock') { RAudio.sfx('swish'); finishThis(); return; }
      if (this.foldStep === 1) {
        RAudio.sfx('swish');
        RSeq.run([{ dur: 0.3, onUpdate: (p) => { cloth.userData.sleeveL.rotation.z = 0.5 + p * 2.1; } }]);
        RUI.guide('つぎは みぎの そで！');
      } else if (this.foldStep === 2) {
        RAudio.sfx('swish');
        RSeq.run([{ dur: 0.3, onUpdate: (p) => { cloth.userData.sleeveR.rotation.z = -0.5 - p * 2.1; } }]);
        RUI.guide('さいごに はんぶんに パタン！');
      } else {
        RSeq.run([
          { dur: 0.35, onUpdate: (p) => { cloth.userData.topHalf.rotation.x = p * Math.PI * 0.9; cloth.userData.topHalf.position.y = -p * 0.3; } },
          RSeq.call(finishThis),
        ]);
      }
    },

    /* --- タンスに しまう（おしゃれと つながる！） --- */
    startStore() {
      this.state = 'store';
      RUI.guide('たたんだ ふくを タンスに しまおう！タンスを タッチ！');
      RAudio.speak('さいごは タンスに しまおう！');
      RWorld.moveCamera([2.5, 3.4, 7.5], [2.5, 1.0, 0]);
      RWorld.sparkleBurst(this.tansu.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 8, 0xfff0a0);
    },

    tapStore(x, y) {
      const hits = RMain.raycast(x, y, [this.tansu]);
      if (!hits.length) return;
      this.state = 'storing';
      const char = this.char;
      const tansu = this.tansu;
      const drawer = tansu.userData.drawers[1];
      const steps = [
        RSeq.call(() => {
          // つみあげた ふくを かかえる
          this.CLOTH_DEFS.forEach((def, i) => {
            if (def.folded) {
              this.group.remove(def.folded);
              def.folded.position.set(0, 0.05 + i * 0.13, 0.1);
              def.folded.rotation.set(0, 0, 0);
              char.userData.parts.front.add(def.folded);
            }
          });
          RAudio.sfx('pop');
        }),
        RSeq.walk(char, tansu.position.x - 0.9, tansu.position.z + 1.1, { faceY: 2.4, mood: 'carry', endMood: 'idle' }),
        RSeq.sfx('drawer'),
        { dur: 0.45, onUpdate: (p) => { drawer.position.z = p * 0.5; } },
      ];
      this.CLOTH_DEFS.forEach((def) => {
        steps.push(RSeq.call(() => {
          if (!def.folded) return;
          char.userData.parts.front.remove(def.folded);
          const wp = new THREE.Vector3();
          drawer.userData.inner.getWorldPosition(wp);
          def.folded.position.copy(new THREE.Vector3(char.position.x, 1.1, char.position.z));
          this.group.add(def.folded);
          this._store = def.folded;
          RAudio.sfx('swish');
        }));
        steps.push({
          dur: 0.3,
          onUpdate: (p) => {
            if (!this._store) return;
            const wp = new THREE.Vector3();
            drawer.userData.inner.getWorldPosition(wp);
            this._store.position.lerp(wp, p);
          },
          onEnd: () => { if (this._store) { this.group.remove(this._store); this._store = null; } RAudio.sfx('pop'); },
        });
      });
      steps.push(RSeq.sfx('drawer'));
      steps.push({ dur: 0.4, onUpdate: (p) => { drawer.position.z = 0.5 * (1 - p); } });
      steps.push(RSeq.call(() => {
        RSave.data.freshWash = true;
        RSave.save();
        RWorld.sparkleBurst(tansu.position.clone().add(new THREE.Vector3(0, 1.5, 0.5)), 16, 0xd0f4ff);
        RAudio.sfx('sparkle');
      }));
      steps.push(RSeq.say('せんたくしたての ふくは キラキラ！こんど きるのが たのしみ！'));
      steps.push(RSeq.mood(char, 'happy', 1.2));
      steps.push(RSeq.wait(1.2));
      steps.push(RSeq.call(() => {
        RWorld.confetti(new THREE.Vector3(2, 4, 0), 50);
        RRewards.pay({ group: this.group, char: this.char, mama: true, coins: 3, onDone: () => RMain.goHome() });
      }));
      RSeq.run(steps);
    },

    /* ---------------- こうしん ---------------- */
    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      if (this.cat && this.cat.userData.tail) this.cat.userData.tail.rotation.z = Math.sin(time * 3) * 0.3;

      // ポケットチェックの シャツを ぷかぷか
      if (this.pocketShirt) {
        this.pocketPulse += dt;
        this.pocketShirt.position.y = 2.0 + Math.sin(this.pocketPulse * 2.5) * 0.1;
        this.pocketShirt.rotation.y = Math.sin(this.pocketPulse * 1.5) * 0.25;
      }

      // せんざいを そそぐ
      if (this.state === 'soap' && this.pouring) {
        this.soapFill = Math.min(1, this.soapFill + dt * 0.5);
        this.soap.rotation.z = 0.9;
        RWorld.waterDrops(this.cap.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)), 2, 0.05, 0x4a9fd4);
        this.capFill.scale.y = 1 + this.soapFill * 12;
        this.capFill.position.y = -0.06 + this.soapFill * 0.06;
        if (Math.random() < 0.2) RAudio.sfx('pour');
        if (this.soapFill >= 1) this.finishSoap();
      } else if (this.soap) {
        this.soap.rotation.z *= Math.pow(0.01, dt);
      }

      // せんたくき かいてんちゅう
      if (this.state === 'washing') {
        this.washT += dt;
        this.drum.rotation.z += dt * (this.washT < 3.5 ? 6 : 2);
        if (Math.random() < dt * 2) RAudio.sfx('rumble');
        this.washer.position.y = Math.sin(time * 25) * 0.015;
        if (this.washT > 4.5) {
          this.washer.position.y = 0;
          this.startUnload();
        }
      }

      // かんそうちゅう：たいようが うごき ふくが ゆれる
      if (this.state === 'dry') {
        this.dryT += dt;
        const p = Math.min(1, this.dryT / 8);
        this.sun.position.x = -6 + p * 12;
        this.sun.position.y = 6.5 + Math.sin(p * Math.PI) * 1.5;
        this.CLOTH_DEFS.forEach((def, i) => {
          if (def.hung && def.mesh) def.mesh.rotation.z = Math.sin(time * 2 + i) * 0.15;
        });
        if (!this.weatherDone && this.dryT > 3.2) this.triggerWeather();
        if (this.dryT >= 8) this.startTakeIn();
      }
      if (this.state === 'rain') {
        RWorld.waterDrops(new THREE.Vector3((Math.random() - 0.5) * 6, 4.5, -4.5 + (Math.random() - 0.5) * 2), 3, 3);
        if (Math.random() < dt * 1.5) RAudio.sfx('rain');
      }
      if (this.sun) this.sun.rotation.z += dt * 0.3;
    },
  };

  /* ================================================
     3) パンケーキ（けいりょう・わる・まぜる から やく まで）
     ================================================ */
  const RHelpCook = {
    group: null, char: null, cat: null,
    state: 'intro', pancake: null, stack: 0, stackTotal: 3,
    bubbles: [], cookT: 0,

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xffedd8);
      RWorld.scene.fog = new THREE.Fog(0xffedd8, 16, 36);
      this.state = 'intro';
      this.stack = 0;
      this.bubbles = [];
      this.eggTaps = 0; this.siftFill = 0; this.milkFill = 0; this.mixAngle = 0;
      this.sifting = false; this.pouringMilk = false; this.lastMixAngle = null;
      this.splatterCool = 0;

      // キッチン
      const floor = new THREE.Mesh(new THREE.CircleGeometry(20, 40), RWorld.mat(0xf5e0c0));
      floor.rotation.x = -Math.PI / 2;
      g.add(floor);
      const counter = RWorld.box(7, 1.1, 2.2, 0xffc9a0);
      counter.position.set(0, 0.55, 0);
      g.add(counter);
      const counterTop = RWorld.box(7.3, 0.1, 2.5, 0xffffff);
      counterTop.position.set(0, 1.13, 0);
      g.add(counterTop);

      // コンロ＋フライパン
      const stove = RWorld.box(1.8, 0.12, 1.8, 0x555566);
      stove.position.set(-1.4, 1.22, 0.2);
      g.add(stove);
      const pan = new THREE.Group();
      const panBody = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 0.2, 28, 1, true), RWorld.mat(0x333340, { side: THREE.DoubleSide }));
      panBody.position.y = 0.1;
      const panBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.04, 28), RWorld.mat(0x44444f));
      panBottom.position.y = 0.02;
      const handle = RWorld.cyl(0.05, 0.05, 0.9, 0x333340, 10);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(1.2, 0.12, 0);
      pan.add(panBody, panBottom, handle);
      pan.position.set(-1.4, 1.28, 0.2);
      g.add(pan);
      this.pan = pan;

      // ボウル
      const bowl = new THREE.Group();
      const bowlM = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), RWorld.mat(0x8fd4e8, { side: THREE.DoubleSide }));
      bowlM.rotation.x = Math.PI;
      bowlM.position.y = 0.55;
      const batter = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24), RWorld.mat(0xfff6e8));
      batter.position.y = 0.42;
      batter.visible = false;
      bowl.add(bowlM, batter);
      bowl.position.set(1.0, 1.13, 0.3);
      g.add(bowl);
      this.bowl = bowl;
      this.batter = batter;

      // たまご・ふるい・ぎゅうにゅう・あわだてき
      const egg = RProps.makeEgg();
      egg.position.set(0.3, 1.3, 0.7);
      g.add(egg);
      this.egg = egg;
      const sieve = RProps.makeSieve();
      sieve.position.set(1.0, 2.0, 0.3);
      sieve.visible = false;
      g.add(sieve);
      this.sieve = sieve;
      const milk = RProps.makeMilkCarton();
      milk.position.set(2.0, 1.18, 0.6);
      g.add(milk);
      this.milk = milk;
      const whisk = RProps.makeWhisk();
      whisk.position.set(1.0, 1.75, 0.3);
      whisk.visible = false;
      g.add(whisk);
      this.whisk = whisk;

      // おさら
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 0.1, 28), RWorld.mat(0xffffff));
      plate.position.set(2.6, 1.18, -0.55);
      g.add(plate);
      this.plate = plate;
      this.plateStack = new THREE.Group();
      this.plateStack.position.copy(plate.position);
      g.add(this.plateStack);

      // ミルク（ねこ）は とおくで おひるね中
      this.cat = RWorld.buildCat();
      this.cat.position.set(4.6, 0, 3.2);
      this.cat.rotation.y = -1.2;
      g.add(this.cat);

      // リナちゃん
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(0.5, 0, 3.4);
      g.add(this.char);

      RWorld.snapCamera([0, 4.6, 9.6], [0, 1.2, 0]);
      RWorld.moveCamera([0, 3.4, 7.4], [0, 1.2, 0]);
      RAudio.playBGM('game');
      RUI.show('minigame-ui');
      RUI.showSkip(() => this.finishIntro(true));
      RAudio.speak('パンケーキを つくろう！まずは きじづくりから！');
      RUI.guide('キッチンへ いこう！');

      this.introSeq = RSeq.run([
        RSeq.walk(this.char, 0.6, 1.6, { faceY: Math.PI }),
      ], () => this.finishIntro(false));
    },

    finishIntro(skipped) {
      if (this.introDone) return;
      this.introDone = true;
      if (skipped && this.introSeq) {
        this.introSeq.cancel();
        this.char.position.set(0.6, 0, 1.6);
        this.char.rotation.y = Math.PI;
        RCharacter.setMood(this.char, 'idle');
      }
      RUI.hideSkip();
      this.state = 'egg';
      RUI.guide('たまごを コンコン！2かい タッチ！');
      RAudio.speak('たまごを コンコンして わってね');
    },

    exit() {
      RUI.hideAllGameUI();
      RUI.hideSkip();
      this.introDone = false;
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.pancake = null; this.bubbles = []; this.cat = null;
    },

    /* ---------------- 入力 ---------------- */
    onPointerDown(x, y) {
      const s = this.state;
      if (s === 'egg') this.tapEgg(x, y);
      else if (s === 'shell') this.tapShell(x, y);
      else if (s === 'sift') this.sifting = true;
      else if (s === 'wipeface') this.tapFace(x, y);
      else if (s === 'milkpour') this.startMilk(x, y);
      else if (s === 'pour') { if (RMain.raycast(x, y, [this.bowl]).length) this.ladlePour(); }
      else if (s === 'plate') { if (RMain.raycast(x, y, [this.plate, this.plateStack]).length) this.toPlate(); }
    },
    onPointerMove(x, y, dx, dy, isDown) {
      if (this.state === 'mix' && isDown) this.doMix(x, y);
    },
    onPointerUp() { this.sifting = false; this.pouringMilk = false; this.lastMixAngle = null; },

    /* --- たまご --- */
    tapEgg(x, y) {
      const hits = RMain.raycast(x, y, [this.egg, this.bowl]);
      if (!hits.length) return;
      this.eggTaps++;
      RAudio.sfx('kon');
      RCharacter.setMood(this.char, 'work', 0.5);
      const egg = this.egg;
      if (this.eggTaps === 1) {
        // ボウルの ふちに コンッ
        RSeq.run([
          RSeq.move(egg, [this.bowl.position.x - 0.35, 1.55, this.bowl.position.z + 0.2], 0.3),
          { dur: 0.15, onUpdate: (p) => { egg.rotation.z = Math.sin(p * Math.PI) * 0.4; } },
        ]);
        RUI.guide('もういっかい コンコン！');
      } else if (this.eggTaps === 2) {
        this.state = 'egg-crack';
        RSeq.run([
          { dur: 0.15, onUpdate: (p) => { egg.rotation.z = Math.sin(p * Math.PI) * 0.5; } },
          RSeq.sfx('paka'),
          RSeq.say('パカッ！'),
          RSeq.call(() => {
            // からが われて きみが ぽとん
            egg.visible = false;
            const shellL = RWorld.sphere(0.1, 0xfff2dc, 1, 1.2, 1);
            const shellR = RWorld.sphere(0.1, 0xfff2dc, 1, 1.2, 1);
            shellL.position.copy(egg.position).add(new THREE.Vector3(-0.15, 0.1, 0));
            shellR.position.copy(egg.position).add(new THREE.Vector3(0.15, 0.1, 0));
            this.group.add(shellL, shellR);
            this.shellL = shellL; this.shellR = shellR;
            const yolk = RWorld.sphere(0.09, 0xffc93a);
            yolk.position.copy(egg.position);
            this.group.add(yolk);
            this.yolk = yolk;
            this.batter.visible = true;
          }),
          {
            dur: 0.4,
            onUpdate: (p) => {
              if (this.yolk) this.yolk.position.y = 1.55 - p * 1.0;
              if (this.shellL) { this.shellL.position.x -= 0.01; this.shellL.rotation.z += 0.05; }
              if (this.shellR) { this.shellR.position.x += 0.01; this.shellR.rotation.z -= 0.05; }
            },
            onEnd: () => {
              RAudio.sfx('splash');
              if (this.yolk) this.group.remove(this.yolk);
              this.yolk = null;
              RWorld.sparkleBurst(this.bowl.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 5, 0xffe8a0);
            },
          },
          RSeq.call(() => {
            if (this.shellL) this.group.remove(this.shellL);
            if (this.shellR) this.group.remove(this.shellR);
            // ときどき からの かけらが はいっちゃう！
            const shellIn = this.forceShell !== undefined ? this.forceShell : Math.random() < 0.5;
            if (shellIn) {
              const bit = RWorld.cone(0.05, 0.06, 0xfff2dc, 4);
              bit.position.copy(this.bowl.position).add(new THREE.Vector3(0.15, 0.5, 0.1));
              this.group.add(bit);
              this.shellBit = bit;
              this.state = 'shell';
              RUI.guide('あっ！からの かけらが はいっちゃった！タッチで とって！');
              RAudio.speak('からが はいっちゃった！ゆびで そーっと とってね');
            } else {
              this.startSift();
            }
          }),
        ]);
      }
    },

    tapShell(x, y) {
      if (!this.shellBit) return;
      const hits = RMain.raycast(x, y, [this.shellBit, this.bowl]);
      if (!hits.length) return;
      const bit = this.shellBit;
      this.shellBit = null;
      RAudio.sfx('pop');
      RCharacter.setMood(this.char, 'work', 0.6);
      RSeq.run([
        RSeq.move(bit, [this.bowl.position.x + 0.9, 1.25, this.bowl.position.z], 0.4, { arc: 0.4 }),
        RSeq.call(() => this.group.remove(bit)),
        RSeq.praise('とれた！'),
        RSeq.say('きれいに とれたね！'),
        RSeq.call(() => this.startSift()),
      ]);
    },

    /* --- こなを ふるう --- */
    startSift() {
      this.state = 'sift';
      this.sieve.visible = true;
      RUI.guide('ふるいを ながおしで こなを ふりふり〜！');
      RAudio.speak('こなを ふるいで ふりふりしよう！');
    },

    finishSift() {
      this.state = 'wipeface';
      this.sieve.visible = false;
      RAudio.speak('わぷっ！おかおが こなで まっしろ！');
      RUI.guide('リナちゃんの おかおを タッチして ふいてあげて！');
      // まっしろの おかおが みえるように こちらを むく
      RSeq.run([
        RSeq.rotTo(this.char, 'y', 0.15, 0.4),
        RSeq.mood(this.char, 'shiver', 1.0),
      ]);
    },

    tapFace(x, y) {
      const hits = RMain.raycast(x, y, [this.char]);
      if (!hits.length) return;
      RCharacter.setMood(this.char, 'wipe', 1.0);
      RAudio.sfx('swish');
      const char = this.char;
      RSeq.run([
        { dur: 0.9, onUpdate: (p) => { RCharacter.setFlour(char, 0.8 * (1 - p)); } },
        RSeq.praise('きれいに なった！'),
        RSeq.say('ありがとう！つぎは ぎゅうにゅう！'),
        RSeq.rotTo(this.char, 'y', Math.PI, 0.4),
        RSeq.call(() => {
          this.state = 'milkpour';
          RUI.guide('ぎゅうにゅうパックを ながおしで とぽとぽ〜');
        }),
      ]);
    },

    /* --- ぎゅうにゅう --- */
    startMilk(x, y) {
      const hits = RMain.raycast(x, y, [this.milk, this.bowl]);
      if (hits.length) this.pouringMilk = true;
    },

    finishMilk() {
      this.state = 'mix';
      RAudio.speak('ストップ！ちょうどいい！つぎは ゆびで ぐるぐる まぜまぜ！');
      RUI.guide('ボウルの うえで ゆびを ぐるぐる まわして まぜよう！');
      this.whisk.visible = true;
      RUI.praise('じょうずに はかれた！');
    },

    /* --- まぜる --- */
    doMix(x, y) {
      // ボウルの スクリーンざひょうを ちゅうしんに かくどを けいさん
      const wp = this.bowl.position.clone().add(new THREE.Vector3(0, 0.5, 0)).project(RWorld.camera);
      const cx = (wp.x + 1) / 2 * window.innerWidth;
      const cy = (-wp.y + 1) / 2 * window.innerHeight;
      const ang = Math.atan2(y - cy, x - cx);
      if (this.lastMixAngle !== null) {
        let d = ang - this.lastMixAngle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const add = Math.abs(d);
        if (add < 1.0) {
          this.mixAngle += add;
          this.whisk.rotation.y += d * 2;
          this.whisk.position.x = this.bowl.position.x + Math.cos(ang) * 0.15;
          this.whisk.position.z = this.bowl.position.z + Math.sin(ang) * 0.15;
          RCharacter.setMood(this.char, 'work');
          if (Math.random() < 0.1) RAudio.sfx('scrub');
          // きじが だんだん なめらかに つやつやに
          const p = Math.min(1, this.mixAngle / 16);
          this.batter.material.color.lerpColors(new THREE.Color(0xfff6e8), new THREE.Color(0xffedc8), p);
          // はやすぎると とびちる！
          const speed = add / 0.016;
          if (speed > 10 && this.splatterCool <= 0) {
            this.splatterCool = 1.4;
            RAudio.sfx('splash');
            RAudio.speak('わわっ！とびちった！');
            RWorld.waterDrops(this.bowl.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 10, 1.2, 0xffedc8);
          }
          if (this.mixAngle >= 16 && this.state === 'mix') {
            this.state = 'pour';
            this.whisk.visible = false;
            RUI.praise('つやつや！');
            RAudio.speak('きじが つやつやに なった！ボウルを タッチして フライパンへ！');
            RUI.guide('ボウルを タッチ！おたまで きじを フライパンへ とろ〜り');
          }
        }
      }
      this.lastMixAngle = ang;
    },

    /* --- おたまで フライパンへ --- */
    ladlePour() {
      this.state = 'pouring';
      RCharacter.setMood(this.char, 'work', 1.5);
      const ladle = RProps.makeLadle();
      ladle.position.copy(this.bowl.position).add(new THREE.Vector3(0, 0.7, 0));
      this.group.add(ladle);
      const panP = this.pan.position;
      RSeq.run([
        { dur: 0.3, onUpdate: (p) => { ladle.position.y = this.bowl.position.y + 0.7 - p * 0.25; } },
        RSeq.sfx('splash'),
        RSeq.move(ladle, [panP.x + 0.3, panP.y + 0.8, panP.z], 0.5, { arc: 0.4 }),
        RSeq.say('とろ〜り'),
        {
          dur: 0.7,
          onStart: () => {
            ladle.rotation.z = -1.2;
            const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.14, 24), RWorld.mat(0xffedc8));
            cake.position.set(0, 0.1, 0);
            cake.scale.setScalar(0.1);
            this.pan.add(cake);
            this.pancake = cake;
          },
          onUpdate: (p) => {
            RWorld.waterDrops(new THREE.Vector3(panP.x, panP.y + 0.5, panP.z), 2, 0.15, 0xffedc8);
            if (this.pancake) this.pancake.scale.setScalar(0.1 + p * 0.9);
          },
        },
        RSeq.call(() => {
          this.group.remove(ladle);
          RAudio.sfx('sizzle');
          this.state = 'cooking';
          this.cookT = 0;
          RUI.guide('ジュ〜ッ！ぷつぷつ してきたら ひっくりかえすよ…');
        }),
      ]);
    },

    flip() {
      this.state = 'flipping';
      RAudio.sfx('flip');
      RUI.hideActionBtn();
      RUI.guide('くるん！');
      this.flipT = 0;
      RUI.praise('じょうずに フリップ！');
      RCharacter.setMood(this.char, 'happy', 0.8);
    },

    toPlate() {
      this.state = 'moving';
      RAudio.sfx('swish');
      this.moveT = 0;
      this.moveStart = this.pancake.getWorldPosition(new THREE.Vector3());
      this.pan.remove(this.pancake);
      this.pancake.position.copy(this.moveStart);
      this.group.add(this.pancake);
    },

    startToppings() {
      this.state = 'topping';
      RUI.guide('トッピングを のせよう！');
      RAudio.speak('すきなトッピングを のせてね');
      let count = 0;
      RUI.toolbar([
        { icon: '🧈', id: 'butter' },
        { icon: '🍯', id: 'syrup' },
        { icon: '🍓', id: 'berry' },
        { icon: '🍌', id: 'banana' },
      ], (id) => {
        count++;
        RAudio.sfx('pop');
        const topY = 0.15 + this.stackTotal * 0.16;
        if (id === 'butter') {
          const b = RWorld.box(0.22, 0.08, 0.22, 0xfff0a0);
          b.position.set((Math.random() - 0.5) * 0.3, topY, (Math.random() - 0.5) * 0.3);
          this.plateStack.add(b);
        } else if (id === 'syrup') {
          const s = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.05, 20), RWorld.mat(0xc87f2f, { transparent: true, opacity: 0.85 }));
          s.position.y = topY - 0.04;
          this.plateStack.add(s);
        } else if (id === 'berry') {
          const berry = RWorld.cone(0.09, 0.15, 0xff4d6a, 10);
          berry.rotation.x = Math.PI;
          berry.position.set((Math.random() - 0.5) * 0.5, topY + 0.05, (Math.random() - 0.5) * 0.5);
          this.plateStack.add(berry);
        } else if (id === 'banana') {
          const ba = RWorld.cyl(0.09, 0.09, 0.05, 0xfff2c0, 14);
          ba.position.set((Math.random() - 0.5) * 0.5, topY, (Math.random() - 0.5) * 0.5);
          this.plateStack.add(ba);
        }
        RWorld.sparkleBurst(this.plateStack.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 5, 0xfff0c0);
        if (count === 3) {
          RUI.actionBtn('🥞 かんせい！', () => this.finish(), true);
        }
      });
    },

    finish() {
      this.state = 'done';
      RUI.hideAllGameUI();
      RUI.show('minigame-ui');
      RAudio.sfx('fanfare');
      RWorld.confetti(new THREE.Vector3(0, 3.5, 0.5), 60);
      RCharacter.setMood(this.char, 'happy');
      RUI.praise('おいしそう！');
      // ミルクにも ちいさい パンケーキを おすそわけ
      const mini = RWorld.cyl(0.18, 0.2, 0.07, 0xd9a05b, 16);
      mini.position.copy(this.plateStack.position);
      this.group.add(mini);
      const cat = this.cat;
      RSeq.run([
        RSeq.wait(0.8),
        RSeq.say('ミルクにも おすそわけ！'),
        RSeq.move(mini, [cat.position.x, 0.3, cat.position.z + 0.4], 0.7, { arc: 1.2 }),
        RSeq.call(() => {
          RAudio.sfx('meow');
          RWorld.heartBurst(cat.position.clone().add(new THREE.Vector3(0, 1, 0)), 5);
        }),
        RSeq.wait(0.6),
        RSeq.call(() => {
          RRewards.pay({ group: this.group, char: this.char, mama: true, coins: 3, onDone: () => RMain.goHome() });
        }),
      ]);
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      if (this.splatterCool > 0) this.splatterCool -= dt;
      if (this.cat && this.cat.userData.tail) this.cat.userData.tail.rotation.z = Math.sin(time * 2.5) * 0.3;

      // ふるい：ながおしで こなが ふる
      if (this.state === 'sift' && this.sifting) {
        this.siftFill = Math.min(1, this.siftFill + dt * 0.55);
        this.sieve.rotation.z = Math.sin(time * 20) * 0.2;
        this.sieve.position.x = this.bowl.position.x + Math.sin(time * 10) * 0.08;
        RWorld.waterDrops(this.sieve.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.1, 0)), 3, 0.3, 0xfffdf5);
        // おかおに こなが…！
        RCharacter.setFlour(this.char, this.siftFill * 0.8);
        RCharacter.setMood(this.char, 'work');
        if (Math.random() < 0.15) RAudio.sfx('pour');
        if (this.siftFill >= 1) this.finishSift();
      } else if (this.sieve && this.sieve.visible) {
        this.sieve.rotation.z *= Math.pow(0.01, dt);
      }

      // ぎゅうにゅう
      if (this.state === 'milkpour' && this.pouringMilk) {
        this.milkFill = Math.min(1, this.milkFill + dt * 0.65);
        this.milk.rotation.z = 1.0;
        this.milk.position.y = 1.55;
        this.milk.position.x = this.bowl.position.x + 0.45;
        RWorld.waterDrops(this.bowl.position.clone().add(new THREE.Vector3(0.2, 0.75, 0)), 2, 0.1, 0xffffff);
        if (Math.random() < 0.2) RAudio.sfx('pour');
        if (this.milkFill >= 1) { this.milk.rotation.z = 0; this.milk.position.set(2.0, 1.18, 0.6); this.finishMilk(); }
      } else if (this.milk && this.state === 'milkpour') {
        this.milk.rotation.z *= Math.pow(0.01, dt);
      }

      // やいてるあいだ：ぷつぷつ・ゆげ・いいにおい
      if (this.state === 'cooking' && this.pancake) {
        this.cookT += dt;
        if (Math.random() < dt * 6) {
          const b = RWorld.sphere(0.03, 0xf0d090);
          const a = Math.random() * Math.PI * 2, r = Math.random() * 0.4;
          const wp = this.pancake.getWorldPosition(new THREE.Vector3());
          b.position.set(wp.x + Math.cos(a) * r, wp.y + 0.1, wp.z + Math.sin(a) * r);
          this.group.add(b);
          this.bubbles.push({ mesh: b, t: 0 });
          if (Math.random() < 0.4) RAudio.sfx('sizzle');
        }
        const wp = this.pan.position;
        if (Math.random() < dt * 3) RWorld.steam(new THREE.Vector3(wp.x, wp.y + 0.4, wp.z), 2);
        // いいにおいが ミルクのほうへ ながれて いく
        if (Math.random() < dt * 1.5) {
          const dir = this.cat.position.clone().sub(wp).normalize();
          RWorld.smellDrift(new THREE.Vector3(wp.x, wp.y + 0.7, wp.z), dir, 1);
        }
        // ミルクの はなが ひくひく
        this.cat.scale.x = 1 + Math.sin(time * 8) * 0.015;
        if (this.cookT > 2.2) {
          this.state = 'flip-ready';
          RUI.guide('いまだ！');
          RUI.actionBtn('🍳 ひっくりかえす！', () => this.flip());
        }
      } else if (this.state === 'flipping' && this.pancake) {
        this.flipT += dt;
        const t = Math.min(1, this.flipT / 0.7);
        this.pancake.position.y = 0.1 + Math.sin(t * Math.PI) * 1.5;
        this.pancake.rotation.x = t * Math.PI;
        if (t >= 1) {
          this.pancake.rotation.x = Math.PI;
          this.pancake.material.color.setHex(0xd9a05b);
          this.state = 'cooking2';
          this.cookT = 0;
          RAudio.sfx('sizzle');
        }
      } else if (this.state === 'cooking2') {
        this.cookT += dt;
        const wp = this.pan.position;
        if (Math.random() < dt * 2) RWorld.steam(new THREE.Vector3(wp.x, wp.y + 0.4, wp.z), 1);
        if (this.cookT > 1.4) {
          this.state = 'plate';
          RUI.guide('おさらを タッチして のせよう！');
        }
      } else if (this.state === 'moving' && this.pancake) {
        this.moveT += dt;
        const t = Math.min(1, this.moveT / 0.6);
        const target = this.plateStack.position.clone().add(new THREE.Vector3(0, 0.12 + this.stack * 0.16, 0));
        this.pancake.position.lerpVectors(this.moveStart, target, t);
        this.pancake.position.y += Math.sin(t * Math.PI) * 0.8;
        if (t >= 1) {
          this.pancake.position.copy(target.sub(this.plateStack.position));
          this.group.remove(this.pancake);
          this.plateStack.add(this.pancake);
          this.pancake.rotation.x = 0;
          this.pancake = null;
          this.stack++;
          RAudio.sfx('coin');
          // ミルクが においに さそわれて ちかづいてくる
          const catTarget = new THREE.Vector3(4.6 - this.stack * 1.1, 0, 3.2 - this.stack * 0.5);
          RSeq.run([RSeq.walk(this.cat, catTarget.x, catTarget.z, { speed: 1.5 })]);
          if (this.stack < this.stackTotal) {
            this.state = 'pour';
            RUI.guide('もういちど！ボウルを タッチ！（あと' + (this.stackTotal - this.stack) + 'まい）');
          } else {
            this.startToppings();
          }
        }
      }

      // あわの アニメ
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.t += dt;
        b.mesh.position.y += dt * 0.15;
        b.mesh.scale.setScalar(Math.max(0.01, 1 - b.t * 1.4));
        if (b.t > 0.7) {
          this.group.remove(b.mesh);
          this.bubbles.splice(i, 1);
        }
      }
    },
  };

  window.RHelpClean = RHelpClean;
  window.RHelpLaundry = RHelpLaundry;
  window.RHelpCook = RHelpCook;
})();
