/* ================================================================
   jobs.js — おしごとミニゲーム（プロセスをぜんぶ描写する）
     1) ケーキやさん … たまご→まぜる→オーブン→デコ→おきゃくさま
     2) アイドル     … 楽屋できがえ→マイクチェック→幕→本番→おじぎ
     3) おはなやさん … みずやり→さく→つむ→きる→つつむ→リボン
   ================================================================ */
(function () {

  /* ================================================
     1) ケーキやさん
     ================================================ */
  const RJobCake = {
    group: null, char: null, cake: null, customer: null,
    topping: 'strawberry',
    placed: 0,
    state: 'intro',

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xfff0dc);
      RWorld.scene.fog = new THREE.Fog(0xfff0dc, 16, 36);
      this.placed = 0;
      this.state = 'intro';
      this.topping = 'strawberry';
      this.eggTaps = 0; this.mixAngle = 0; this.lastMixAngle = null;

      // ゆか・カウンター
      const floor = new THREE.Mesh(new THREE.CircleGeometry(20, 40), RWorld.mat(0xf5d8a8));
      floor.rotation.x = -Math.PI / 2;
      g.add(floor);
      const counter = RWorld.box(6, 1.0, 1.6, 0xffb3d9);
      counter.position.set(0, 0.5, 0.2);
      g.add(counter);
      const counterTop = RWorld.box(6.3, 0.12, 1.9, 0xffffff);
      counterTop.position.set(0, 1.06, 0.2);
      g.add(counterTop);

      // うしろのたな
      const shelf = RWorld.box(7, 0.15, 1, 0xf0c090);
      shelf.position.set(0, 2.4, -2.6);
      g.add(shelf);
      const cakeColors = [0xff8ec7, 0xfff7c0, 0x8fe3c0, 0xd0a0f0, 0xffd0b0];
      cakeColors.forEach((c, i) => {
        const mini = RWorld.cyl(0.32, 0.36, 0.4, c, 20);
        mini.position.set(-2.4 + i * 1.2, 2.68, -2.6);
        g.add(mini);
        const cream = RWorld.sphere(0.14, 0xffffff);
        cream.position.set(-2.4 + i * 1.2, 2.94, -2.6);
        g.add(cream);
      });

      // オーブン
      const oven = new THREE.Group();
      const ovenBody = RWorld.box(1.6, 1.5, 1.2, 0xd88f6a);
      ovenBody.position.y = 0.75;
      const ovenWin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.06),
        RWorld.mat(0x553322, { transparent: true, opacity: 0.85 }));
      ovenWin.position.set(0, 0.75, 0.61);
      const ovenGlow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xff8830, transparent: true, opacity: 0 }));
      ovenGlow.position.set(0, 0.75, 0.63);
      const ovenDoor = new THREE.Group();
      const doorPanel = RWorld.box(1.4, 0.16, 0.5, 0xc27a56);
      doorPanel.position.set(0, 0, 0.25);
      ovenDoor.add(doorPanel);
      ovenDoor.position.set(0, 0.32, 0.6);
      oven.add(ovenBody, ovenWin, ovenGlow, ovenDoor);
      oven.position.set(-3.4, 0, -1.2);
      oven.rotation.y = 0.6;
      g.add(oven);
      this.oven = oven;
      this.ovenGlow = ovenGlow;
      this.ovenDoor = ovenDoor;

      // ボウルと たまご と まるい かた
      const bowl = new THREE.Group();
      const bowlM = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        RWorld.mat(0xffd0e8, { side: THREE.DoubleSide }));
      bowlM.rotation.x = Math.PI;
      bowlM.position.y = 0.45;
      const batter = RWorld.cyl(0.34, 0.34, 0.05, 0xfff6e8, 20);
      batter.position.y = 0.34;
      batter.visible = false;
      bowl.add(bowlM, batter);
      bowl.position.set(-1.3, 1.12, 0.5);
      g.add(bowl);
      this.bowl = bowl;
      this.batter = batter;

      const egg = RProps.makeEgg();
      egg.position.set(-2.1, 1.23, 0.6);
      g.add(egg);
      this.egg = egg;

      const mold = RWorld.cyl(0.5, 0.55, 0.3, 0xc0c0cc, 22);
      mold.position.set(0.2, 1.27, 0.5);
      g.add(mold);
      this.mold = mold;

      // ケーキだい（やきあがったら ここに）
      const stand = RWorld.cyl(0.8, 0.9, 0.12, 0xffffff, 28);
      stand.position.set(1.6, 1.18, 0.55);
      g.add(stand);
      this.stand = stand;

      // リナちゃん（コックぼうし）
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(-0.5, 0, 3.4);
      this.char.scale.setScalar(0.9);
      g.add(this.char);
      const hat = RWorld.cyl(0.3, 0.34, 0.35, 0xffffff, 20);
      hat.position.y = 0.25;
      const hatTop = RWorld.sphere(0.3, 0xffffff);
      hatTop.position.y = 0.42;
      const hatG = new THREE.Group();
      hatG.add(hat, hatTop);
      hatG.position.y = 0.35;
      this.char.userData.parts.head.add(hatG);

      RWorld.snapCamera([0, 4.2, 8.5], [0, 1.4, 0]);
      RWorld.moveCamera([0, 3.0, 6.6], [0, 1.5, 0.2]);
      RAudio.playBGM('game');

      RUI.show('minigame-ui');
      RUI.showSkip(() => this.finishIntro(true));
      RAudio.speak('ケーキやさんに とうちゃく！まずは スポンジを やこう！');
      RUI.guide('カウンターに はいろう！');
      this.introSeq = RSeq.run([
        RSeq.walk(this.char, -3.2, 1.0, { speed: 2.2 }),
        RSeq.walk(this.char, -2.6, -0.9, { speed: 2.2 }),
        RSeq.walk(this.char, -1.3, -1.1, { faceY: 0, speed: 2.2 }),
      ], () => this.finishIntro(false));
    },

    finishIntro(skipped) {
      if (this.introDone) return;
      this.introDone = true;
      if (skipped && this.introSeq) {
        this.introSeq.cancel();
        this.char.position.set(-1.3, 0, -1.1);
        this.char.rotation.y = 0;
        RCharacter.setMood(this.char, 'idle');
      }
      RUI.hideSkip();
      this.state = 'egg';
      RUI.guide('たまごを コンコン！2かい タッチ！');
    },

    exit() {
      RUI.hideAllGameUI();
      RUI.hideSkip();
      this.introDone = false;
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.cake = null; this.customer = null;
    },

    /* ---------------- スポンジづくり ---------------- */
    onPointerDown(x, y) {
      const s = this.state;
      if (s === 'egg') this.tapEgg(x, y);
      else if (s === 'mold') { if (RMain.raycast(x, y, [this.bowl, this.mold]).length) this.pourMold(); }
      else if (s === 'deco') this.tapDeco(x, y);
    },
    onPointerMove(x, y, dx, dy, isDown) {
      if (this.state === 'mix' && isDown) this.doMix(x, y);
    },
    onPointerUp() { this.lastMixAngle = null; },

    tapEgg(x, y) {
      if (!RMain.raycast(x, y, [this.egg, this.bowl]).length) return;
      this.eggTaps++;
      RAudio.sfx('kon');
      RCharacter.setMood(this.char, 'work', 0.5);
      const egg = this.egg;
      if (this.eggTaps === 1) {
        RSeq.run([
          RSeq.move(egg, [this.bowl.position.x - 0.3, 1.45, this.bowl.position.z + 0.1], 0.3),
          { dur: 0.15, onUpdate: (p) => { egg.rotation.z = Math.sin(p * Math.PI) * 0.4; } },
        ]);
        RUI.guide('もういっかい コンコン！');
      } else {
        this.state = 'egg-crack';
        RSeq.run([
          RSeq.sfx('paka'),
          RSeq.say('パカッ！'),
          RSeq.call(() => {
            egg.visible = false;
            this.batter.visible = true;
            RWorld.sparkleBurst(this.bowl.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 6, 0xffe8a0);
            RAudio.sfx('splash');
          }),
          RSeq.call(() => {
            this.state = 'mix';
            RUI.guide('ゆびで ぐるぐる まぜまぜ！');
            RAudio.speak('ゆびで ぐるぐる まぜてね！');
          }),
        ]);
      }
    },

    doMix(x, y) {
      const wp = this.bowl.position.clone().add(new THREE.Vector3(0, 0.4, 0)).project(RWorld.camera);
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
          RCharacter.setMood(this.char, 'work');
          this.bowl.rotation.y += d * 0.5;
          if (Math.random() < 0.1) RAudio.sfx('scrub');
          const p = Math.min(1, this.mixAngle / 10);
          this.batter.material.color.lerpColors(new THREE.Color(0xfff6e8), new THREE.Color(0xffedc8), p);
          if (this.mixAngle >= 10 && this.state === 'mix') {
            this.state = 'mold';
            RUI.praise('つやつや！');
            RUI.guide('まるい かたに いれよう！ボウルを タッチ！');
            RAudio.speak('つやつやに なった！かたに いれよう！');
          }
        }
      }
      this.lastMixAngle = ang;
    },

    pourMold() {
      this.state = 'baking-prep';
      RCharacter.setMood(this.char, 'work', 1.2);
      const bowl = this.bowl;
      const mold = this.mold;
      RSeq.run([
        RSeq.sfx('splash'),
        RSeq.say('とろとろ〜'),
        { dur: 0.6, onUpdate: (p) => { bowl.rotation.z = p * 1.1; },
          onEnd: () => {
            bowl.rotation.z = 0;
            this.batter.visible = false;
            const fill = RWorld.cyl(0.42, 0.42, 0.15, 0xffedc8, 20);
            fill.position.y = 0.12;
            mold.add(fill);
          } },
        // オーブンへ！
        RSeq.say('オーブンで やこう！'),
        RSeq.call(() => RAudio.sfx('doorOpen')),
        RSeq.rotTo(this.ovenDoor, 'x', 1.4, 0.5),
        RSeq.move(mold, [this.oven.position.x + 0.3, 1.0, this.oven.position.z + 0.5], 0.7, { arc: 0.5 }),
        RSeq.call(() => { mold.visible = false; RAudio.sfx('thunk'); }),
        RSeq.rotTo(this.ovenDoor, 'x', 0, 0.4),
        RSeq.call(() => this.startBake()),
      ]);
    },

    startBake() {
      this.state = 'baking';
      this.bakeT = 0;
      // オーブンの まどが みえるように カメラを よせる
      RWorld.moveCamera([-1.6, 2.4, 3.8], [-3.4, 1.0, -1.2]);
      RUI.guide('やけるのを まってる… いいにおい〜');
      RAudio.speak('まどから みてよう。ふくらんできたよ！');
      // スポンジが まどのなかで ふくらむ
      const rising = RWorld.cyl(0.4, 0.42, 0.2, 0xffe0a8, 18);
      rising.position.set(0, 0.65, 0.3);
      rising.scale.y = 0.5;
      this.oven.add(rising);
      this.rising = rising;
    },

    finishBake() {
      this.state = 'deco-prep';
      RAudio.sfx('chime');
      RAudio.speak('チーン！やきあがり！ふわふわだ！');
      const mold = this.mold;
      RSeq.run([
        RSeq.cam([0, 3.0, 6.6], [0, 1.5, 0.2]),
        RSeq.call(() => RAudio.sfx('doorOpen')),
        RSeq.rotTo(this.ovenDoor, 'x', 1.4, 0.5),
        RSeq.call(() => {
          if (this.rising) this.oven.remove(this.rising);
          mold.visible = true;
          mold.position.set(this.oven.position.x + 0.3, 1.0, this.oven.position.z + 0.8);
        }),
        RSeq.call(() => RWorld.steam(mold.getWorldPosition(new THREE.Vector3()), 6)),
        RSeq.move(mold, [this.stand.position.x, 1.35, this.stand.position.z], 0.8, { arc: 0.8 }),
        RSeq.rotTo(this.ovenDoor, 'x', 0, 0.4),
        RSeq.call(() => {
          mold.visible = false;
          // やきあがった スポンジケーキ
          const cake = new THREE.Group();
          const tier1 = RWorld.cyl(0.75, 0.75, 0.45, 0xffe0a8, 32);
          tier1.position.y = 0.22;
          const tier2 = RWorld.cyl(0.5, 0.5, 0.4, 0xffd9ec, 32);
          tier2.position.y = 0.62;
          const icing = RWorld.cyl(0.52, 0.52, 0.08, 0xffffff, 32);
          icing.position.y = 0.84;
          cake.add(tier1, tier2, icing);
          cake.position.set(this.stand.position.x, 1.24, this.stand.position.z);
          this.group.add(cake);
          this.cake = cake;
          RWorld.steam(cake.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 5);
          RWorld.sparkleBurst(cake.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 10, 0xfff0c0);
          this.startDeco();
        }),
      ]);
    },

    startDeco() {
      this.state = 'deco';
      RUI.guide('トッピングを えらんで ケーキに タッチ！');
      RAudio.speak('トッピングで かわいく しよう！');
      RUI.toolbar([
        { icon: '🍓', id: 'strawberry', selected: true },
        { icon: '🍒', id: 'cherry' },
        { icon: '🍦', id: 'cream' },
        { icon: '🍫', id: 'choco' },
        { icon: '🌸', id: 'flower' },
        { icon: '🕯️', id: 'candle' },
      ], (id) => { this.topping = id; }, { radio: true });
      // くまさんが においに さそわれて まちにきている
      const bear = RWorld.buildAnimal('bear');
      bear.position.set(5.5, 0, 2.2);
      bear.rotation.y = -0.9;
      this.group.add(bear);
      this.customer = bear;
      this.customerWaiting = true;
      RSeq.run([
        RSeq.walk(bear, 3.4, 2.4, { speed: 1.4, endMood: 'idle' }),
        RSeq.say('いいにおいに さそわれて、くまさんが きたよ！'),
      ]);
    },

    makeTopping(kind) {
      const g = new THREE.Group();
      if (kind === 'strawberry') {
        const s = RWorld.cone(0.11, 0.18, 0xff4d6a, 12);
        s.rotation.x = Math.PI;
        s.position.y = 0.09;
        const leaf = RWorld.sphere(0.04, 0x5cb85c);
        leaf.position.y = 0.18;
        g.add(s, leaf);
      } else if (kind === 'cherry') {
        const c = RWorld.sphere(0.09, 0xd42a4d);
        c.position.y = 0.08;
        const stem = RWorld.cyl(0.012, 0.012, 0.14, 0x5cb85c, 6);
        stem.position.y = 0.2;
        stem.rotation.z = 0.3;
        g.add(c, stem);
      } else if (kind === 'cream') {
        [0.11, 0.08, 0.05].forEach((r, i) => {
          const s = RWorld.sphere(r, 0xffffff);
          s.position.y = 0.05 + i * 0.09;
          g.add(s);
        });
      } else if (kind === 'choco') {
        const c = RWorld.box(0.14, 0.08, 0.14, 0x6a4028);
        c.position.y = 0.05;
        c.rotation.y = Math.random() * 1;
        g.add(c);
      } else if (kind === 'flower') {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const p = RWorld.sphere(0.05, 0xffb3d9);
          p.scale.y = 0.5;
          p.position.set(Math.cos(a) * 0.06, 0.05, Math.sin(a) * 0.06);
          g.add(p);
        }
        const c = RWorld.sphere(0.04, 0xffd447);
        c.position.y = 0.07;
        g.add(c);
      } else if (kind === 'candle') {
        const c = RWorld.cyl(0.03, 0.03, 0.22, 0xfff7c0, 10);
        c.position.y = 0.11;
        const flame = RWorld.sphere(0.045, 0xffa500);
        flame.material = new THREE.MeshBasicMaterial({ color: 0xffa500 });
        flame.position.y = 0.26;
        flame.userData.flame = true;
        g.add(c, flame);
      }
      return g;
    },

    tapDeco(x, y) {
      if (!this.cake) return;
      const hits = RMain.raycast(x, y, [this.cake]);
      if (!hits.length) return;
      const hit = hits[0];
      const local = this.cake.worldToLocal(hit.point.clone());
      const top = this.makeTopping(this.topping);
      top.position.copy(local);
      const sideDist = Math.sqrt(local.x * local.x + local.z * local.z);
      if (hit.face && Math.abs(hit.face.normal.y) < 0.5 && sideDist > 0.05) {
        const out = 0.1 / sideDist;
        top.position.x += local.x * out;
        top.position.z += local.z * out;
      }
      this.cake.add(top);
      this.placed++;
      RAudio.sfx('pop');
      RCharacter.setMood(this.char, 'work', 0.5);
      RWorld.sparkleBurst(hit.point, 6, 0xfff0c0);
      if (this.placed === 5) {
        RUI.guide('いっぱい のせたら 「かんせい」を おしてね！');
        RUI.actionBtn('🎂 かんせい！', () => this.finish(), true);
      }
    },

    finish() {
      if (this.state !== 'deco') return;
      this.state = 'serve';
      RUI.hideActionBtn();
      RUI.guide('');
      document.getElementById('mg-toolbar').classList.add('hidden');
      RAudio.sfx('ding');
      const bear = this.customer;
      const cake = this.cake;
      RSeq.run([
        RSeq.say('おまたせしました！'),
        RSeq.mood(this.char, 'reach'),
        // ケーキを カウンターの まえへ すーっ
        RSeq.move(cake, [2.6, 1.24, 1.6], 0.8, { ease: 'out' }),
        RSeq.call(() => RAudio.sfx('slide')),
        RSeq.walk(bear, 2.6, 2.8, { speed: 1.6 }),
        RSeq.call(() => {
          RWorld.heartBurst(bear.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 8);
          RAudio.sfx('yay');
        }),
        { dur: 0.6, onUpdate: (p) => { bear.position.y = Math.abs(Math.sin(p * Math.PI * 2)) * 0.25; } },
        RSeq.wait(0.4),
        RSeq.call(() => {
          RRewards.pay({
            group: this.group, char: this.char, coins: 3,
            payerPos: [bear.position.x, 1.3, bear.position.z],
            thanks: 'おいしそう！ありがとう！はい、おかね どうぞ',
            onDone: () => RMain.goHome(),
          });
        }),
      ]);
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      if (this.cake) {
        this.cake.traverse((o) => {
          if (o.userData.flame) o.scale.setScalar(1 + Math.sin(time * 12 + o.id) * 0.2);
        });
      }
      if (this.state === 'baking') {
        this.bakeT += dt;
        this.ovenGlow.material.opacity = 0.4 + Math.sin(time * 6) * 0.2;
        if (this.rising) this.rising.scale.y = 0.5 + Math.min(1, this.bakeT / 3) * 0.9;
        // オーブンから いいにおい
        if (Math.random() < dt * 2) {
          const wp = this.oven.position.clone().add(new THREE.Vector3(0, 1.6, 0.5));
          RWorld.smellDrift(wp, new THREE.Vector3(0.8, 0.2, 0.5), 1);
        }
        if (this.bakeT > 3.2) {
          this.ovenGlow.material.opacity = 0;
          this.finishBake();
        }
      }
      if (this.customerWaiting && this.customer) {
        this.customer.position.y = Math.abs(Math.sin(time * 3)) * 0.05;
        this.customer.scale.x = 1 + Math.sin(time * 8) * 0.01; // においを くんくん
      }
    },
  };

  /* ================================================
     2) アイドルステージ
     ================================================ */
  const RJobIdol = {
    group: null, char: null,
    stars: [], spawned: 0, caught: 0,
    spawnTimer: 0, state: 'prep',

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0x2a1a4a);
      RWorld.scene.fog = null;
      this.stars = [];
      this.caught = 0;
      this.spawnTimer = 0.5;
      this.state = 'prep';

      // ---- がくや（ひだりがわ） ----
      const roomFloor = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), RWorld.mat(0x6a5a8a));
      roomFloor.rotation.x = -Math.PI / 2;
      roomFloor.position.set(-8, 0.01, 0);
      g.add(roomFloor);
      const mirror = RProps.makeDressingMirror();
      mirror.position.set(-9.5, 0, -1.2);
      mirror.rotation.y = 0.7;
      g.add(mirror);
      this.mirror = mirror;
      const rack = RProps.makeHangerRack();
      rack.scale.setScalar(0.9);
      rack.position.set(-6.8, 0, -1.6);
      rack.rotation.y = -0.4;
      g.add(rack);
      const idolItem = RCharacter.findItem('dress', 'dress_idol');
      const idolHanger = RProps.makeHangerDress(idolItem.color);
      idolHanger.position.set(0, 1.95, 0.05);
      rack.add(idolHanger);
      this.idolHanger = idolHanger;
      const micProp = RProps.makeMicStand();
      micProp.position.set(-8.6, 0, 0.6);
      g.add(micProp);
      this.micStand = micProp;

      // ---- ステージ（ちゅうおう） ----
      const stage = RWorld.cyl(3.2, 3.5, 0.4, 0xff6eb4, 32);
      stage.position.y = 0.2;
      g.add(stage);
      const stageTop = RWorld.cyl(3.0, 3.0, 0.06, 0xffd0e8, 32);
      stageTop.position.y = 0.43;
      g.add(stageTop);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 40), RWorld.mat(0x3a2a5a));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.01;
      g.add(floor);

      // まく（とじている）
      const curtains = RProps.makeCurtains(8.5, 6);
      curtains.position.set(0, 0, 3.1);
      g.add(curtains);
      this.curtains = curtains;

      // スポットライト（さいしょは きえている）
      this.spots = [];
      [[-2.5, 0xff8ec7], [0, 0xfff0a0], [2.5, 0x8fd4ff]].forEach(([x, c]) => {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(1.3, 5.5, 20, 1, true),
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
        );
        cone.position.set(x, 3.2, -0.5);
        g.add(cone);
        this.spots.push(cone);
      });
      this.spotsOn = false;

      // ミラーボール
      const ball = RWorld.sphere(0.45, 0xd0d0e8);
      ball.material = new THREE.MeshPhongMaterial({ color: 0xd0d0e8, shininess: 120 });
      ball.position.set(0, 5.6, 0);
      g.add(ball);
      this.mirrorBall = ball;

      // かんきゃく
      this.fans = [];
      ['bear', 'bunny', 'panda', 'bunny', 'bear'].forEach((kind, i) => {
        const a = (i - 2) * 0.45;
        const fan = RWorld.buildAnimal(kind);
        fan.scale.setScalar(0.55);
        fan.position.set(Math.sin(a) * 5.2, 0, 4.4 + Math.cos(a) * 1.6);
        fan.rotation.y = Math.PI + a * 0.4;
        g.add(fan);
        this.fans.push(fan);
      });

      // リナちゃん：がくやから とうじょう
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(-7.5, 0, 1.8);
      g.add(this.char);

      RWorld.snapCamera([-8, 2.4, 5.5], [-8, 1.3, 0]);
      RAudio.playBGM('dressup');
      RUI.show('minigame-ui');
      RUI.showSkip(() => this.finishPrep(true));
      RUI.guide('がくやで じゅんびしよう！');
      RAudio.speak('ここは がくや。ステージいしょうに きがえよう！');

      // --- 楽屋シーケンス：きがえ → かがみでマイクチェック → 幕へ ---
      const stageOutfit = Object.assign({}, RSave.data.outfit, { dress: 'dress_idol', hat: 'hat_none' });
      const steps = [
        RSeq.walk(this.char, -6.8, 0.2, { faceY: Math.PI }),
        RSeq.call(() => { this.idolHanger.visible = false; }),
      ];
      RChangeSeq(this.char, stageOutfit, {
        group: g,
        faceY: 0.6,
        oldReturnPos: [-6.8, 1.8, -1.6],
      }).forEach((s) => steps.push(s));
      steps.push(RSeq.guide('マイクチェック！'));
      steps.push(RSeq.walk(this.char, -8.4, 1.4, { faceY: -2.4 }));
      // かがみの でんきゅうが じゅんに ひかる
      steps.push({
        dur: 0.8,
        onUpdate: (p) => {
          const bulbs = this.mirror.userData.bulbs || [];
          bulbs.forEach((b, i) => {
            b.material.color.setHex(i / bulbs.length <= p ? 0xfffbe0 : 0xbba860);
          });
        },
        onStart: () => RAudio.sfx('ding'),
      });
      steps.push(RSeq.say('マイクチェック！あー あー♪'));
      steps.push(RSeq.call(() => { RAudio.sfx('note', 2); }));
      steps.push(RSeq.wait(0.5));
      steps.push(RSeq.call(() => { RAudio.sfx('note', 4); }));
      steps.push(RSeq.wait(0.8));
      // まくのむこうから かんきゃくの こえ
      steps.push(RSeq.call(() => {
        RAudio.sfx('yay');
        RUI.guide('まくの むこうに おきゃくさんが いっぱい！');
      }));
      steps.push(RSeq.say('おきゃくさんの こえが きこえる…どきどき！'));
      steps.push(RSeq.mood(this.char, 'shiver', 0.9));
      steps.push(RSeq.wait(1.0));
      // ステージへ いどう → まくが あがる！
      steps.push(RSeq.cam([0, 3.0, 10.5], [0, 2, 0]));
      steps.push(RSeq.walk(this.char, 0, 0.2, { faceY: 0, speed: 2.2 }));
      steps.push(RSeq.call(() => { this.char.position.y = 0.46; }));
      steps.push(RSeq.guide('まくが あがるよ…！'));
      steps.push(RSeq.wait(0.6));
      steps.push(RSeq.call(() => RAudio.sfx('swish')));
      steps.push({
        dur: 1.3,
        onUpdate: (p) => {
          this.curtains.userData.left.position.x = -8.5 / 4 - p * 3.2;
          this.curtains.userData.right.position.x = 8.5 / 4 + p * 3.2;
        },
      });
      // スポットライトが じゅんばんに つく
      this.spots.forEach((sp, i) => {
        steps.push(RSeq.wait(0.25));
        steps.push(RSeq.call(() => {
          RAudio.sfx('thunk');
          sp.material.opacity = 0.16;
        }));
      });
      steps.push(RSeq.call(() => {
        this.spotsOn = true;
        RAudio.sfx('fanfare');
        this.fans.forEach((f, i) => setTimeout(() => RWorld.heartBurst(f.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 3), i * 150));
      }));
      steps.push(RSeq.say('コンサートの はじまり！'));
      RSeq.run(steps, () => this.finishPrep(false));
    },

    finishPrep(skipped) {
      if (this.prepDone) return;
      this.prepDone = true;
      if (skipped) {
        RSeq.clear();
        const stageOutfit = Object.assign({}, RSave.data.outfit, { dress: 'dress_idol', hat: 'hat_none' });
        RCharacter.applyOutfit(this.char, stageOutfit);
        this.char.position.set(0, 0.46, 0.2);
        this.char.rotation.y = 0;
        this.curtains.userData.left.position.x = -8.5 / 4 - 3.2;
        this.curtains.userData.right.position.x = 8.5 / 4 + 3.2;
        this.spots.forEach((sp) => { sp.material.opacity = 0.16; });
        this.spotsOn = true;
      }
      RUI.hideSkip();
      this.state = 'play';
      RCharacter.setMood(this.char, 'dance');
      RAudio.playBGM('idol');
      RUI.guide('⭐を タッチして コンサートを もりあげよう！');
    },

    exit() {
      RUI.hideAllGameUI();
      RUI.hideSkip();
      this.prepDone = false;
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null;
      this.stars = [];
      RWorld.scene.fog = new THREE.Fog(0xffe3f2, 18, 40);
    },

    makeStar() {
      const colors = [0xffe14d, 0xff8ec7, 0x8fd4ff, 0xc9a0f0];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const shape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 0.34 : 0.15;
        if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const mesh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }),
        new THREE.MeshBasicMaterial({ color })
      );
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.75, 8, 6),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      const grp = new THREE.Group();
      grp.add(mesh, hit);
      grp.userData.isStar = true;
      return grp;
    },

    spawnStar() {
      const s = this.makeStar();
      s.position.set((Math.random() - 0.5) * 5.5, 6.2, 1.6 + Math.random() * 0.8);
      s.userData.vy = -(1.1 + Math.random() * 0.5 + this.caught * 0.03);
      this.group.add(s);
      this.stars.push(s);
    },

    onPointerDown(x, y) {
      if (this.state !== 'play') return;
      const hits = RMain.raycast(x, y, this.stars);
      if (hits.length) {
        let obj = hits[0].object;
        while (obj && !obj.userData.isStar) obj = obj.parent;
        if (!obj) return;
        this.catchStar(obj);
      }
    },
    onPointerMove() {}, onPointerUp() {},

    catchStar(star) {
      const idx = this.stars.indexOf(star);
      if (idx === -1) return;
      this.stars.splice(idx, 1);
      this.group.remove(star);
      this.caught++;
      RAudio.sfx('note', this.caught);
      RWorld.sparkleBurst(star.position.clone(), 12, 0xffe14d);
      if (this.caught % 5 === 0) RUI.praise();
      if (this.caught >= 12) this.finale();
    },

    /* ---------------- 終演：おじぎ → まく → 汗ふき ---------------- */
    finale() {
      if (this.state !== 'play') return;
      this.state = 'finale';
      RUI.guide('');
      RAudio.stopBGM();
      RAudio.sfx('fanfare');
      RUI.praise('だいせいこう！');
      RWorld.confetti(new THREE.Vector3(0, 4.5, 1), 90);
      this.fans.forEach((f, i) => {
        setTimeout(() => RWorld.heartBurst(f.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 5), i * 200);
      });
      const char = this.char;
      RSeq.run([
        RSeq.wait(1.0),
        // ふかぶかと おじぎ
        RSeq.say('ありがとうございました！'),
        RSeq.mood(char, 'bow', 1.8),
        RSeq.wait(1.8),
        RSeq.call(() => RAudio.sfx('yay')),
        // まくが おりる
        RSeq.call(() => RAudio.sfx('swish')),
        {
          dur: 1.2,
          onUpdate: (p) => {
            this.curtains.userData.left.position.x = -8.5 / 4 - 3.2 * (1 - p);
            this.curtains.userData.right.position.x = 8.5 / 4 + 3.2 * (1 - p);
          },
        },
        // そでに はけて ひとやすみ
        RSeq.cam([-5, 2.6, 6.5], [-6, 1.3, 0.5]),
        RSeq.call(() => { char.position.y = 0; }),
        RSeq.walk(char, -6.2, 0.8, { faceY: 0.8, speed: 2.0 }),
        RSeq.say('ふ〜 どきどきした！'),
        RSeq.mood(char, 'wipe', 1.5),
        RSeq.call(() => {
          // あせが きらり
          const drop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0x8fd4ff }));
          drop.position.copy(char.position).add(new THREE.Vector3(0.3, 2.1, 0.3));
          this.group.add(drop);
          RSeq.run([
            RSeq.move(drop, [char.position.x + 0.6, 0.2, char.position.z + 0.3], 0.5),
            RSeq.call(() => this.group.remove(drop)),
          ]);
        }),
        RSeq.wait(1.4),
        // マネージャーの パンダさんから おきゅうりょう
        RSeq.call(() => {
          const panda = RWorld.buildAnimal('panda');
          panda.position.set(-9.5, 0, 2.5);
          panda.rotation.y = 1.2;
          this.group.add(panda);
          this.manager = panda;
          RSeq.run([
            RSeq.walk(panda, char.position.x - 1.6, char.position.z + 0.4, { speed: 1.8 }),
            RSeq.call(() => {
              RRewards.pay({
                group: this.group, char, coins: 3,
                payerPos: [char.position.x - 1.2, 1.2, char.position.z + 0.4],
                thanks: 'すてきな コンサートだったよ！おつかれさま！',
                onDone: () => RMain.goHome(),
              });
            }),
          ]);
        }),
      ]);
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      if (this.state === 'play') {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.stars.length < 4) {
          this.spawnStar();
          this.spawnTimer = 0.7 + Math.random() * 0.5;
        }
      }
      for (let i = this.stars.length - 1; i >= 0; i--) {
        const s = this.stars[i];
        s.position.y += s.userData.vy * dt;
        s.rotation.z += dt * 2;
        if (s.position.y < 0.5) {
          RWorld.sparkleBurst(s.position.clone(), 4, 0x8888ff);
          this.group.remove(s);
          this.stars.splice(i, 1);
        }
      }
      if (this.spots && this.spotsOn) this.spots.forEach((sp, i) => {
        sp.rotation.z = Math.sin(time * 1.5 + i * 2) * 0.35;
        sp.material.opacity = 0.12 + Math.abs(Math.sin(time * 2 + i)) * 0.1;
      });
      if (this.mirrorBall) this.mirrorBall.rotation.y += dt * 1.5;
      if (this.fans) this.fans.forEach((f, i) => {
        f.position.y = this.state === 'play' ? Math.abs(Math.sin(time * 4 + i * 1.3)) * 0.15 : 0;
      });
    },
  };

  /* ================================================
     3) おはなやさん
     ================================================ */
  const RJobFlower = {
    group: null, char: null, customer: null,
    buds: [], picked: 0, need: 5,
    state: 'intro', watering: false,

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xc0e8ff);
      RWorld.scene.fog = new THREE.Fog(0xc0e8ff, 18, 40);
      this.buds = [];
      this.picked = 0;
      this.state = 'intro';
      this.watering = false;
      this.trimTaps = 0;

      RWorld.buildOutdoor(g);

      const sun = RWorld.sphere(0.9, 0xffe14d);
      sun.material = new THREE.MeshBasicMaterial({ color: 0xffe14d });
      sun.position.set(6, 8, -12);
      g.add(sun);

      // みずやり用の みえない じめん
      const fieldPick = new THREE.Mesh(new THREE.PlaneGeometry(14, 8),
        new THREE.MeshBasicMaterial({ visible: false }));
      fieldPick.rotation.x = -Math.PI / 2;
      fieldPick.position.set(0, 0.02, -0.7);
      g.add(fieldPick);
      this.fieldPick = fieldPick;

      // つぼみ（みずを あげると さく）
      const colors = [0xff8ec7, 0xffd447, 0xffffff, 0xb48ae0, 0xff6a6a, 0x8fd4ff, 0xff8ec7, 0xffd447];
      for (let i = 0; i < 8; i++) {
        const col = i % 4, row = Math.floor(i / 4);
        const bud = new THREE.Group();
        const stem = RWorld.cyl(0.04, 0.04, 0.7, 0x5cb85c, 8);
        stem.position.y = 0.35;
        bud.add(stem);
        const tip = RWorld.cone(0.13, 0.24, 0x7cc47a, 10);
        tip.position.y = 0.8;
        bud.add(tip);
        bud.position.set(-2.7 + col * 1.8, 0, 0.4 - row * 1.7);
        bud.userData = { water: 0, opened: false, petalColor: colors[i], tip };
        g.add(bud);
        this.buds.push(bud);
      }

      // さぎょうテーブル
      const table = RWorld.box(1.6, 0.8, 1.0, 0xf0c090);
      table.position.set(3.4, 0.4, 2.0);
      g.add(table);
      const tableTop = RWorld.box(1.7, 0.08, 1.1, 0xffffff);
      tableTop.position.set(3.4, 0.84, 2.0);
      g.add(tableTop);
      this.table = table;

      // リナちゃん＋じょうろ
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(-4.5, 0, 3.2);
      this.char.scale.setScalar(0.9);
      g.add(this.char);
      const can = RProps.makeWateringCan();
      can.position.set(-3.6, 0, 2.6);
      g.add(can);
      this.can = can;

      RWorld.snapCamera([0, 6.5, 11.5], [0, 0.8, -0.5]);
      RWorld.moveCamera([0, 5.0, 9.5], [0, 0.6, -0.5]);
      RAudio.playBGM('game');
      RUI.show('minigame-ui');
      RUI.showSkip(() => this.finishIntro(true));
      RUI.guide('おはなやさんの あさは みずやりから！');
      RAudio.speak('おはなやさんに とうちゃく！まずは つぼみに みずを あげよう！');

      this.introSeq = RSeq.run([
        RSeq.walk(this.char, -3.3, 2.4, { faceY: -0.5 }),
        RSeq.call(() => {
          this.group.remove(can);
          can.scale.setScalar(0.8);
          can.position.set(0, 0.1, 0);
          can.rotation.set(0, 0, 0);
          RCharacter.hold(this.char, 'right', can);
        }),
        RSeq.sfx('pop'),
      ], () => this.finishIntro(false));
    },

    finishIntro(skipped) {
      if (this.introDone) return;
      this.introDone = true;
      if (skipped && this.introSeq) {
        this.introSeq.cancel();
        this.char.position.set(-3.3, 0, 2.4);
        RCharacter.setMood(this.char, 'idle');
        if (this.can.parent === this.group) {
          this.group.remove(this.can);
          this.can.scale.setScalar(0.8);
          this.can.position.set(0, 0.1, 0);
          this.can.rotation.set(0, 0, 0);
          RCharacter.hold(this.char, 'right', this.can);
        }
      }
      RUI.hideSkip();
      this.state = 'water';
      RUI.guide('つぼみの ちかくを ながおしして みずやり！');
    },

    exit() {
      RUI.hideAllGameUI();
      RUI.hideSkip();
      this.introDone = false;
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.customer = null;
    },

    /* ---------------- 入力 ---------------- */
    onPointerDown(x, y) {
      const s = this.state;
      if (s === 'water') { this.watering = true; this.waterAt(x, y); }
      else if (s === 'pick') this.tapPick(x, y);
      else if (s === 'trim') this.tapTrim();
      else if (s === 'ribbon') this.tapRibbon();
    },
    onPointerMove(x, y, dx, dy, isDown) {
      if (this.state === 'water' && isDown) this.waterAt(x, y);
    },
    onPointerUp() { this.watering = false; },

    /* --- みずやり --- */
    waterAt(x, y) {
      const hits = RMain.raycast(x, y, [this.fieldPick]);
      if (!hits.length) return;
      const p = hits[0].point;
      this.waterPoint = p.clone();
      // リナちゃんが ちかくへ あるく
      const target = new THREE.Vector3(p.x, 0, p.z + 1.1);
      const d = target.clone().sub(this.char.position);
      d.y = 0;
      if (d.length() > 0.2) {
        this.char.position.addScaledVector(d.normalize(), Math.min(d.length(), 0.08));
        this.char.rotation.y = Math.atan2(p.x - this.char.position.x, p.z - this.char.position.z);
        if (this.char.userData.mood !== 'walk') RCharacter.setMood(this.char, 'walk');
      } else if (this.char.userData.mood !== 'work') {
        RCharacter.setMood(this.char, 'work');
      }
    },

    openBud(bud) {
      bud.userData.opened = true;
      const grow = () => {
        bud.remove(bud.userData.tip);
        const head = new THREE.Group();
        head.position.y = 0.8;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const petal = RWorld.sphere(0.13, bud.userData.petalColor);
          petal.scale.set(1, 0.5, 1);
          petal.position.set(Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15);
          head.add(petal);
        }
        const c = RWorld.sphere(0.1, 0xffd447);
        head.add(c);
        head.scale.setScalar(0.01);
        bud.add(head);
        bud.userData.head = head;
        RSeq.run([RSeq.scaleTo(head, 1, 0.4)]);
        RAudio.sfx('pop');
        RWorld.sparkleBurst(bud.position.clone().add(new THREE.Vector3(0, 1, 0)), 6, 0xd0ffc0);
      };
      // ぷるぷる → ぽんっと ひらく！
      RSeq.run([
        { dur: 0.5, onUpdate: (p) => { bud.rotation.z = Math.sin(p * Math.PI * 6) * 0.15; } },
        RSeq.call(grow),
      ]);
      const openedCount = this.buds.filter((b) => b.userData.opened).length;
      if (openedCount === this.buds.length) {
        setTimeout(() => this.startPick(), 900);
      } else if (openedCount === 1) {
        RUI.praise('さいた！');
      }
    },

    /* --- つみとり --- */
    startPick() {
      this.state = 'pick';
      RCharacter.drop(this.char, 'right');
      RUI.praise('ぜんぶ さいた！');
      RUI.guide('すきな おはなを 5ほん タッチして つもう！');
      RAudio.speak('きれいに さいたね！すきなおはなを 5ほん つんでね');
    },

    tapPick(x, y) {
      const opened = this.buds.filter((b) => b.userData.opened && !b.userData.picked);
      const hits = RMain.raycast(x, y, opened);
      if (!hits.length) return;
      let bud = hits[0].object;
      while (bud && !bud.userData.tip) bud = bud.parent;
      if (!bud || bud.userData.picked) return;
      bud.userData.picked = true;
      this.picked++;
      this.state = 'picking';
      const char = this.char;
      RSeq.run([
        // あるいて いって しゃがんで つむ
        RSeq.walk(char, bud.position.x + 0.4, bud.position.z + 0.7, { faceY: Math.atan2(bud.position.x - (bud.position.x + 0.4), bud.position.z - (bud.position.z + 0.7)) }),
        RSeq.say('よいしょ…'),
        RSeq.mood(char, 'crouch'),
        RSeq.wait(0.55),
        RSeq.call(() => {
          RAudio.sfx('pop');
          RAudio.sfx('sparkle');
          // くきごと スポッ
          const mini = RWorld.makeFlower(bud.userData.petalColor, 0.9);
          mini.position.set(0, -0.3, 0.05);
          mini.rotation.z = 0.4 + this.picked * 0.12;
          char.userData.parts.hands.left.add(mini);
          this.group.remove(bud);
          RWorld.sparkleBurst(bud.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 8, 0xd0ffc0);
        }),
        RSeq.mood(char, 'idle'),
        RSeq.call(() => {
          if (this.picked >= this.need) {
            this.goTable();
          } else {
            this.state = 'pick';
            RUI.guide('あと ' + (this.need - this.picked) + 'ほん！');
          }
        }),
      ]);
    },

    /* --- テーブルで しあげ --- */
    goTable() {
      this.state = 'totable';
      RUI.guide('テーブルで ブーケに しよう！');
      const char = this.char;
      RSeq.run([
        RSeq.walk(char, 2.4, 2.6, { faceY: 1.2, mood: 'carry', endMood: 'idle' }),
        RSeq.cam([2.8, 2.6, 5.8], [3.4, 1.0, 2.0]),
        RSeq.call(() => {
          // つんだ おはなを テーブルに ならべる（くきは ばらばらの ながさ）
          RCharacter.drop(char, 'left');
          const bouquet = new THREE.Group();
          const pickedBuds = this.buds.filter((b) => b.userData.picked);
          pickedBuds.forEach((b, i) => {
            const f = RWorld.makeFlower(b.userData.petalColor, 1.0);
            f.position.set((i - 2) * 0.14, 0.15 + (i % 3) * 0.12, 0); // ながさ バラバラ
            f.rotation.z = (i - 2) * 0.18;
            bouquet.add(f);
          });
          bouquet.position.set(3.4, 0.88, 2.0);
          this.group.add(bouquet);
          this.bouquet = bouquet;
          this.state = 'trim';
          this.trimTaps = 0;
          // はさみを もつ
          const scissors = RProps.makeScissors();
          scissors.rotation.x = -0.6;
          RCharacter.hold(char, 'right', scissors);
          this.scissors = scissors;
          RUI.guide('はさみで チョキチョキ！3かい タッチして くきを そろえよう！');
          RAudio.speak('くきの ながさを はさみで そろえよう！');
        }),
      ]);
    },

    tapTrim() {
      if (!this.bouquet) return;
      this.trimTaps++;
      RAudio.sfx('snip');
      RCharacter.setMood(this.char, 'work', 0.4);
      // きった くきの かけらが おちる
      const piece = RWorld.cyl(0.03, 0.03, 0.15, 0x5cb85c, 6);
      piece.position.copy(this.bouquet.position).add(new THREE.Vector3(0.2, 0, 0.3));
      this.group.add(piece);
      RSeq.run([
        RSeq.move(piece, [this.bouquet.position.x + 0.4, 0.05, this.bouquet.position.z + 0.5], 0.4, { spin: 2 }),
      ]);
      // ながさが すこしずつ そろっていく
      this.bouquet.children.forEach((f, i) => {
        f.position.y = Math.max(0.15, f.position.y - 0.08);
      });
      if (this.trimTaps >= 3) {
        this.bouquet.children.forEach((f) => { f.position.y = 0.15; });
        RCharacter.drop(this.char, 'right');
        RUI.praise('そろった！');
        this.startWrap();
      }
    },

    startWrap() {
      this.state = 'wrap';
      RAudio.sfx('swish');
      // かみで くるむ
      const paper = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 0.7, 16, 1, true),
        RWorld.mat(0xfff0f8, { side: THREE.DoubleSide })
      );
      paper.rotation.x = Math.PI;
      paper.position.copy(this.bouquet.position).add(new THREE.Vector3(0, 0.25, 0));
      paper.scale.setScalar(0.01);
      this.group.add(paper);
      this.paper = paper;
      RSeq.run([
        RSeq.say('かみで くるんで…'),
        RSeq.scaleTo(paper, 1, 0.6),
        RSeq.call(() => {
          RAudio.sfx('paka');
          this.state = 'ribbon';
          RUI.guide('ブーケを タッチして リボンを キュッ！');
        }),
      ]);
    },

    tapRibbon() {
      this.state = 'serve-prep';
      RAudio.sfx('clip');
      const bow = RMakeBow(0xff5aa8, 2.0);
      bow.position.copy(this.bouquet.position).add(new THREE.Vector3(0, 0.1, 0.3));
      bow.scale.setScalar(0.01);
      this.group.add(bow);
      RSeq.run([
        RSeq.scaleTo(bow, 1, 0.35),
        RSeq.say('リボンを キュッ！'),
        RSeq.call(() => {
          RWorld.sparkleBurst(this.bouquet.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 16, 0xffd0f0);
          RUI.praise('すてきな ブーケ！');
        }),
        RSeq.wait(0.8),
        RSeq.call(() => this.serve()),
      ]);
    },

    /* --- うさぎさんに てわたし --- */
    serve() {
      this.state = 'serve';
      const bunny = RWorld.buildAnimal('bunny');
      bunny.position.set(8, 0, 3.0);
      bunny.rotation.y = -1.4;
      this.group.add(bunny);
      this.customer = bunny;
      const char = this.char;
      RWorld.moveCamera([2.5, 3.2, 8.0], [3.2, 1.0, 2.2]);
      RSeq.run([
        RSeq.say('うさぎさんが おはなを かいにきたよ'),
        // ぴょんぴょん はねて やってくる
        {
          until: (dt) => {
            const to = new THREE.Vector3(5.0, 0, 2.6);
            const d = to.clone().sub(bunny.position);
            d.y = 0;
            if (d.length() < 0.1) return true;
            bunny.position.addScaledVector(d.normalize(), Math.min(d.length(), 2.2 * dt));
            bunny.position.y = Math.abs(Math.sin(performance.now() / 90)) * 0.25;
            return false;
          },
          onEnd: () => { bunny.position.y = 0; },
        },
        // ブーケを りょうてで さしだす
        RSeq.mood(char, 'reach'),
        {
          dur: 0.7,
          onUpdate: (p) => {
            const to = new THREE.Vector3(4.6, 1.1, 2.5);
            this.bouquet.position.lerp(to, p);
            if (this.paper) this.paper.position.copy(this.bouquet.position).add(new THREE.Vector3(0, 0.25, 0));
          },
        },
        RSeq.say('はい、どうぞ！'),
        // うさぎさんが くんくん して むぎゅっ
        { dur: 0.8, onUpdate: (p) => { bunny.scale.x = 0.98 + Math.sin(p * Math.PI * 6) * 0.03; } },
        RSeq.say('くんくん… いいにおい！', { pitch: 1.7 }),
        { dur: 0.5, onUpdate: (p) => { bunny.rotation.x = Math.sin(p * Math.PI) * 0.2; } },
        RSeq.call(() => {
          RWorld.heartBurst(bunny.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 8);
          RAudio.sfx('yay');
        }),
        RSeq.wait(0.5),
        RSeq.call(() => {
          RRewards.pay({
            group: this.group, char, coins: 3,
            payerPos: [bunny.position.x, 1.2, bunny.position.z + 0.3],
            thanks: 'すてきな ブーケを ありがとう！',
            onDone: () => RMain.goHome(),
          });
        }),
      ]);
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);

      // みずやり（じょうろが かたむいて シャワー）
      if (this.state === 'water' && this.watering && this.waterPoint) {
        const can = this.can;
        can.rotation.z = -0.7 + Math.sin(time * 3) * 0.06;
        RCharacter.setMood(this.char, 'work');
        RWorld.waterDrops(this.waterPoint.clone().add(new THREE.Vector3(0, 1.0, 0)), 3, 0.5);
        if (Math.random() < 0.15) RAudio.sfx('pour');
        this.buds.forEach((bud) => {
          if (bud.userData.opened) return;
          if (bud.position.distanceTo(this.waterPoint) < 0.9) {
            bud.userData.water += dt;
            if (bud.userData.water > 0.6) this.openBud(bud);
          }
        });
      }

      if (this.state === 'water' && !this.watering && this.can) {
        this.can.rotation.z *= Math.pow(0.01, dt);
      }

      // さいた おはなの ゆれ
      this.buds.forEach((b, i) => {
        if (b.userData.head) b.userData.head.rotation.z = Math.sin(time * 1.6 + i) * 0.1;
      });
    },
  };

  window.RJobCake = RJobCake;
  window.RJobIdol = RJobIdol;
  window.RJobFlower = RJobFlower;
})();
