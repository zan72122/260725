/* ================================================================
   jobs.js — おしごとミニゲーム
     1) ケーキやさん … トッピングをのせてケーキかんせい
     2) アイドル     … おちてくるほしをタップしてコンサート
     3) おはなやさん … おはなをつんでブーケづくり
   ================================================================ */
(function () {

  /* ================================================
     1) ケーキやさん
     ================================================ */
  const RJobCake = {
    group: null, char: null, cake: null, customer: null,
    topping: 'strawberry',
    placed: 0,
    state: 'deco',

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xfff0dc);
      RWorld.scene.fog = new THREE.Fog(0xfff0dc, 16, 36);
      this.placed = 0;
      this.state = 'deco';
      this.topping = 'strawberry';

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

      // うしろのたな（ケーキいろいろ）
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
      const shelf2 = RWorld.box(7, 0.15, 1, 0xf0c090);
      shelf2.position.set(0, 3.5, -2.6);
      g.add(shelf2);
      for (let i = 0; i < 4; i++) {
        const cup = RWorld.cone(0.22, 0.35, 0xd9a066, 12);
        cup.rotation.x = Math.PI;
        cup.position.set(-1.8 + i * 1.2, 3.78, -2.6);
        g.add(cup);
        const ice = RWorld.sphere(0.2, [0xff9ecd, 0xfff7c0, 0x8fe3c0, 0xc9a0f0][i]);
        ice.position.set(-1.8 + i * 1.2, 3.98, -2.6);
        g.add(ice);
      }

      // ケーキだい＋ケーキ
      const stand = RWorld.cyl(0.8, 0.9, 0.12, 0xffffff, 28);
      stand.position.set(0, 1.18, 0.55);
      g.add(stand);
      const cake = new THREE.Group();
      const tier1 = RWorld.cyl(0.75, 0.75, 0.45, 0xfff2d9, 32);
      tier1.position.y = 0.22;
      tier1.userData.cakePart = true;
      const tier2 = RWorld.cyl(0.5, 0.5, 0.4, 0xffd9ec, 32);
      tier2.position.y = 0.62;
      tier2.userData.cakePart = true;
      const icing = RWorld.cyl(0.52, 0.52, 0.08, 0xffffff, 32);
      icing.position.y = 0.84;
      icing.userData.cakePart = true;
      cake.add(tier1, tier2, icing);
      cake.position.set(0, 1.24, 0.55);
      g.add(cake);
      this.cake = cake;

      // リナちゃん（エプロンすがた・カウンターのよこ）
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(-2.6, 0, 0.7);
      this.char.rotation.y = 0.5;
      this.char.scale.setScalar(0.9);
      RCharacter.setMood(this.char, 'work');
      g.add(this.char);
      // コックぼうし
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
      RUI.guide('トッピングを えらんで ケーキに タッチ！');
      RAudio.speak('ケーキやさんへ ようこそ！すきなトッピングを のせてね');
      RUI.toolbar([
        { icon: '🍓', id: 'strawberry', selected: true },
        { icon: '🍒', id: 'cherry' },
        { icon: '🍦', id: 'cream' },
        { icon: '🍫', id: 'choco' },
        { icon: '🌸', id: 'flower' },
        { icon: '🕯️', id: 'candle' },
      ], (id) => { this.topping = id; }, { radio: true });
    },

    exit() {
      RUI.hideAllGameUI();
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.cake = null; this.customer = null;
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

    onPointerDown(x, y) {
      if (this.state !== 'deco' || !this.cake) return;
      const hits = RMain.raycast(x, y, [this.cake]);
      if (!hits.length) return;
      const hit = hits[0];
      const local = this.cake.worldToLocal(hit.point.clone());
      const top = this.makeTopping(this.topping);
      top.position.copy(local);
      // 側面をタッチしたら少し外側へ出して、むきはいつも上むきのまま
      const sideDist = Math.sqrt(local.x * local.x + local.z * local.z);
      if (hit.face && Math.abs(hit.face.normal.y) < 0.5 && sideDist > 0.05) {
        const out = 0.1 / sideDist;
        top.position.x += local.x * out;
        top.position.z += local.z * out;
      }
      this.cake.add(top);
      this.placed++;
      RAudio.sfx('pop');
      RWorld.sparkleBurst(hit.point, 6, 0xfff0c0);
      if (this.placed === 5) {
        RUI.guide('いっぱい のせたら 「かんせい」を おしてね！');
        RUI.actionBtn('🎂 かんせい！', () => this.finish(), true);
      }
    },
    onPointerMove() {}, onPointerUp() {},

    finish() {
      if (this.state !== 'deco') return;
      this.state = 'serve';
      RUI.hideActionBtn();
      RUI.guide('');
      document.getElementById('mg-toolbar').classList.add('hidden');
      RAudio.sfx('ding');
      // くまさん おきゃくさん とうじょう
      const bear = RWorld.buildAnimal('bear');
      bear.position.set(5.5, 0, 2.2);
      bear.rotation.y = -0.9;
      this.group.add(bear);
      this.customer = bear;
      this.customerT = 0;
      RCharacter.setMood(this.char, 'wave');
      RAudio.speak('わあ、おいしそうなケーキ！');
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      if (this.cake && this.state === 'deco') this.cake.rotation.y += dt * 0.25;
      // ロウソクのほのお
      if (this.cake) {
        this.cake.traverse((o) => {
          if (o.userData.flame) o.scale.setScalar(1 + Math.sin(time * 12 + o.id) * 0.2);
        });
      }
      if (this.customer && this.state === 'serve') {
        this.customerT += dt;
        // くまさんがあるいてくる
        if (this.customer.position.x > 1.8) {
          this.customer.position.x -= dt * 1.6;
          this.customer.position.y = Math.abs(Math.sin(this.customerT * 8)) * 0.12;
        } else if (!this.served) {
          this.served = true;
          RWorld.heartBurst(this.customer.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 8);
          RAudio.sfx('yay');
          setTimeout(() => {
            RUI.reward(3, () => RMain.goHome());
            this.served = false;
          }, 1200);
        }
      }
    },
  };

  /* ================================================
     2) アイドルステージ
     ================================================ */
  const RJobIdol = {
    group: null, char: null,
    stars: [], spawned: 0, caught: 0, total: 16,
    spawnTimer: 0, state: 'play',

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0x2a1a4a);
      RWorld.scene.fog = null;
      this.stars = [];
      this.spawned = 0;
      this.caught = 0;
      this.spawnTimer = 0.5;
      this.state = 'play';

      // ステージ
      const stage = RWorld.cyl(3.2, 3.5, 0.4, 0xff6eb4, 32);
      stage.position.y = 0.2;
      g.add(stage);
      const stageTop = RWorld.cyl(3.0, 3.0, 0.06, 0xffd0e8, 32);
      stageTop.position.y = 0.43;
      g.add(stageTop);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 40), RWorld.mat(0x3a2a5a));
      floor.rotation.x = -Math.PI / 2;
      g.add(floor);

      // スポットライト（コーン）
      this.spots = [];
      [[-2.5, 0xff8ec7], [0, 0xfff0a0], [2.5, 0x8fd4ff]].forEach(([x, c]) => {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(1.3, 5.5, 20, 1, true),
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
        );
        cone.position.set(x, 3.2, -0.5);
        g.add(cone);
        this.spots.push(cone);
      });

      // ミラーボール
      const ball = RWorld.sphere(0.45, 0xd0d0e8);
      ball.material = new THREE.MeshPhongMaterial({ color: 0xd0d0e8, shininess: 120 });
      ball.position.set(0, 5.6, 0);
      g.add(ball);
      this.mirrorBall = ball;

      // かんきゃくのどうぶつたち
      this.fans = [];
      ['bear', 'bunny', 'panda', 'bunny', 'bear'].forEach((kind, i) => {
        const a = (i - 2) * 0.45;
        const fan = RWorld.buildAnimal(kind);
        fan.scale.setScalar(0.55);
        fan.position.set(Math.sin(a) * 5.2, 0, 3.2 + Math.cos(a) * 1.6);
        fan.rotation.y = Math.PI + a * 0.4;
        g.add(fan);
        this.fans.push(fan);
      });

      // リナちゃん（センターでダンス）
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(0, 0.46, 0);
      g.add(this.char);
      RCharacter.setMood(this.char, 'dance');

      RWorld.snapCamera([0, 4.2, 11], [0, 2, 0]);
      RWorld.moveCamera([0, 3.0, 9], [0, 2.1, 0]);
      RAudio.playBGM('idol');

      RUI.show('minigame-ui');
      RUI.guide('⭐を タッチして コンサートを もりあげよう！');
      RAudio.speak('コンサートの はじまり！ほしを タッチしてね！');
    },

    exit() {
      RUI.hideAllGameUI();
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
      // おおきめの当たりはんてい用の透明スフィア
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
      this.spawned++;
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

    finale() {
      if (this.state !== 'play') return;
      this.state = 'finale';
      RUI.guide('');
      RAudio.sfx('fanfare');
      RUI.praise('だいせいこう！');
      RWorld.confetti(new THREE.Vector3(0, 4.5, 1), 90);
      // ファンのハート
      this.fans.forEach((f, i) => {
        setTimeout(() => RWorld.heartBurst(f.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 5), i * 200);
      });
      setTimeout(() => RUI.reward(3, () => RMain.goHome()), 3000);
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      // ほし出現
      if (this.state === 'play') {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.stars.length < 4) {
          this.spawnStar();
          this.spawnTimer = 0.7 + Math.random() * 0.5;
        }
      }
      // ほし落下
      for (let i = this.stars.length - 1; i >= 0; i--) {
        const s = this.stars[i];
        s.position.y += s.userData.vy * dt;
        s.rotation.z += dt * 2;
        if (s.position.y < 0.5) {
          // みのがしてもペナルティなし、キラッときえる
          RWorld.sparkleBurst(s.position.clone(), 4, 0x8888ff);
          this.group.remove(s);
          this.stars.splice(i, 1);
        }
      }
      // ライトとミラーボール
      if (this.spots) this.spots.forEach((sp, i) => {
        sp.rotation.z = Math.sin(time * 1.5 + i * 2) * 0.35;
        sp.material.opacity = 0.12 + Math.abs(Math.sin(time * 2 + i)) * 0.1;
      });
      if (this.mirrorBall) this.mirrorBall.rotation.y += dt * 1.5;
      // ファンがはねる
      if (this.fans) this.fans.forEach((f, i) => {
        f.position.y = Math.abs(Math.sin(time * 4 + i * 1.3)) * 0.15;
      });
    },
  };

  /* ================================================
     3) おはなやさん
     ================================================ */
  const RJobFlower = {
    group: null, char: null, customer: null,
    flowers: [], picked: 0, need: 5,
    flights: [], bouquet: null, state: 'pick',

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xc0e8ff);
      RWorld.scene.fog = new THREE.Fog(0xc0e8ff, 18, 40);
      this.flowers = [];
      this.flights = [];
      this.picked = 0;
      this.state = 'pick';

      RWorld.buildOutdoor(g);

      // たいよう
      const sun = RWorld.sphere(0.9, 0xffe14d);
      sun.material = new THREE.MeshBasicMaterial({ color: 0xffe14d });
      sun.position.set(6, 8, -12);
      g.add(sun);

      // おはなばたけ（つめるおはな 3×4）
      const colors = [0xff8ec7, 0xffd447, 0xffffff, 0xb48ae0, 0xff6a6a, 0x8fd4ff];
      let ci = 0;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const f = RWorld.makeFlower(colors[ci++ % colors.length], 1.4);
          f.position.set(-2.7 + col * 1.8, 0, 0.6 - row * 1.5);
          f.userData.pickable = true;
          f.userData.petalColor = colors[(ci - 1) % colors.length];
          g.add(f);
          this.flowers.push(f);
        }
      }

      // ブーケだい（てまえ）
      const vase = RWorld.cone(0.35, 0.6, 0xf0d080, 16);
      vase.rotation.x = Math.PI;
      vase.position.set(2.9, 0.3, 2.4);
      g.add(vase);
      this.bouquet = new THREE.Group();
      this.bouquet.position.set(2.9, 0.55, 2.4);
      g.add(this.bouquet);

      // リナちゃん
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(-3.2, 0, 2.3);
      this.char.rotation.y = 0.7;
      this.char.scale.setScalar(0.9);
      RCharacter.setMood(this.char, 'work');
      g.add(this.char);

      RWorld.snapCamera([0, 6.5, 11.5], [0, 0.8, -0.5]);
      RWorld.moveCamera([0, 5.0, 9.5], [0, 0.6, -0.5]);
      RAudio.playBGM('game');

      RUI.show('minigame-ui');
      RUI.guide('おはなを 5ほん タッチして つもう！');
      RAudio.speak('おはなやさんだよ。すきなおはなを つんでね！');
    },

    exit() {
      RUI.hideAllGameUI();
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.customer = null;
      this.flights = [];
    },

    onPointerDown(x, y) {
      if (this.state !== 'pick') return;
      const hits = RMain.raycast(x, y, this.flowers);
      if (!hits.length) return;
      let obj = hits[0].object;
      while (obj && !obj.userData.pickable) obj = obj.parent;
      if (!obj || obj.userData.picked) return;
      obj.userData.picked = true;
      this.picked++;
      RAudio.sfx('pop');
      RAudio.sfx('sparkle');
      RWorld.sparkleBurst(obj.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 8, 0xd0ffc0);

      // おはなが ブーケへ とんでいく
      const start = obj.position.clone().add(new THREE.Vector3(0, 0.4, 0));
      const flyFlower = RWorld.makeFlower(obj.userData.petalColor, 1.2);
      flyFlower.position.copy(start);
      this.group.add(flyFlower);
      this.flights.push({ mesh: flyFlower, t: 0, start, idx: this.picked - 1 });

      // つんだあとは しばらくして あたらしいおはなが はえる
      obj.visible = false;
      setTimeout(() => {
        if (obj.parent) { obj.visible = true; obj.userData.picked = false; obj.scale.setScalar(0.1); obj.userData.growing = true; }
      }, 2500);

      if (this.picked >= this.need && this.state === 'pick') {
        this.state = 'wrap';
        RUI.guide('きれいに できたね！');
        setTimeout(() => this.wrap(), 900);
      } else {
        const left = this.need - this.picked;
        RUI.guide('あと ' + left + 'ほん！');
      }
    },
    onPointerMove() {}, onPointerUp() {},

    wrap() {
      // リボンをかけてブーケかんせい
      RAudio.sfx('swish');
      const bow = RWorld.makeHeart(0xff5aa8, 1.6);
      bow.position.set(2.9, 0.5, 2.75);
      this.group.add(bow);
      RWorld.sparkleBurst(this.bouquet.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 16, 0xffd0f0);
      RUI.praise('すてきな ブーケ！');
      // うさぎさん とうじょう
      setTimeout(() => {
        const bunny = RWorld.buildAnimal('bunny');
        bunny.position.set(7, 0, 2.4);
        bunny.rotation.y = -1.4;
        this.group.add(bunny);
        this.customer = bunny;
        this.state = 'serve';
        RCharacter.setMood(this.char, 'wave');
        RAudio.speak('うさぎさんが おはなを かいにきたよ');
      }, 1200);
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);

      // おはなのゆれ・そだち
      this.flowers.forEach((f, i) => {
        if (f.userData.head) f.userData.head.rotation.z = Math.sin(time * 1.6 + i) * 0.1;
        if (f.userData.growing) {
          const s = Math.min(1, f.scale.x + dt * 1.2);
          f.scale.setScalar(s);
          if (s >= 1) f.userData.growing = false;
        }
      });

      // とんでいくおはな
      for (let i = this.flights.length - 1; i >= 0; i--) {
        const fl = this.flights[i];
        fl.t += dt * 1.4;
        const t = Math.min(1, fl.t);
        const target = this.bouquet.position.clone().add(
          new THREE.Vector3((fl.idx - 2) * 0.16, 0.3 + Math.abs(fl.idx - 2) * -0.04 + 0.3, 0));
        fl.mesh.position.lerpVectors(fl.start, target, t);
        fl.mesh.position.y += Math.sin(t * Math.PI) * 1.6; // やまなりに
        fl.mesh.rotation.z = (fl.idx - 2) * 0.25 * t;
        if (t >= 1) {
          this.flights.splice(i, 1);
          RAudio.sfx('tap');
        }
      }

      // うさぎさん
      if (this.customer && this.state === 'serve') {
        if (this.customer.position.x > 3.2) {
          this.customer.position.x -= dt * 2.2;
          this.customer.position.y = Math.abs(Math.sin(time * 9)) * 0.25;
        } else if (!this.served) {
          this.served = true;
          RWorld.heartBurst(this.customer.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 8);
          RAudio.sfx('yay');
          setTimeout(() => {
            RUI.reward(3, () => RMain.goHome());
            this.served = false;
          }, 1300);
        }
      }
    },
  };

  window.RJobCake = RJobCake;
  window.RJobIdol = RJobIdol;
  window.RJobFlower = RJobFlower;
})();
