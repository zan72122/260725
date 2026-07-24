/* ================================================================
   help.js — おてつだいミニゲーム
     1) おそうじ     … ほこりを こすって ピカピカに
     2) おせんたく   … おなじいろの カゴに いれよう
     3) パンケーキ   … まぜて やいて ひっくりかえそう
   ================================================================ */
(function () {

  /* ================================================
     1) おそうじ
     ================================================ */
  const RHelpClean = {
    group: null, char: null, dusts: [], state: 'clean',

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xffe8d0);
      RWorld.scene.fog = new THREE.Fog(0xffe8d0, 16, 36);
      this.dusts = [];
      this.state = 'clean';

      RWorld.buildHomeRoom(g);

      // リナちゃん（ほうきをもって おうえん）
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(-2.6, 0, 2.2);
      this.char.rotation.y = 0.6;
      this.char.scale.setScalar(0.85);
      RCharacter.setMood(this.char, 'work');
      g.add(this.char);
      // ほうき
      const broomG = new THREE.Group();
      const stick = RWorld.cyl(0.03, 0.03, 1.1, 0xd0a060, 8);
      const brush = RWorld.cone(0.16, 0.35, 0xf0d080, 12);
      brush.position.y = -0.65;
      broomG.add(stick, brush);
      broomG.position.set(0.45, 0.75, 0.2);
      broomG.rotation.z = -0.25;
      this.char.add(broomG);

      // ほこり（もこもこグレー）を配置
      const spots = [
        [0, 0.35, 1.8], [1.6, 0.3, 0.4], [-1.6, 0.4, -0.6],
        [2.8, 0.35, -2], [-2.9, 1.15, -3], [4.2, 1.2, 1.4],
        [0.8, 0.3, -2.8],
      ];
      spots.forEach((p, i) => {
        const dust = new THREE.Group();
        for (let j = 0; j < 4; j++) {
          const b = RWorld.sphere(0.16 + Math.random() * 0.08, 0x9a9a9a);
          b.material.transparent = true;
          b.material.opacity = 0.92;
          b.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.3);
          dust.add(b);
        }
        // こまったかお
        const e1 = RWorld.sphere(0.035, 0x333333); e1.position.set(-0.08, 0.05, 0.24);
        const e2 = RWorld.sphere(0.035, 0x333333); e2.position.set(0.08, 0.05, 0.24);
        dust.add(e1, e2);
        dust.position.set(p[0], p[1], p[2]);
        dust.userData.hp = 1;
        dust.userData.isDust = true;
        dust.userData.baseY = p[1];
        g.add(dust);
        this.dusts.push(dust);
      });

      RWorld.snapCamera([0, 4.8, 10], [0, 1, 0]);
      RWorld.moveCamera([0, 3.8, 8.6], [0, 1, 0]);
      RAudio.playBGM('game');

      RUI.show('minigame-ui');
      RUI.guide('ほこりを ゴシゴシ こすって おそうじしよう！');
      RAudio.speak('おへやを ピカピカに しよう！ほこりを ゴシゴシしてね');
    },

    exit() {
      RUI.hideAllGameUI();
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.dusts = [];
    },

    rub(x, y) {
      if (this.state !== 'clean') return;
      const hits = RMain.raycast(x, y, this.dusts);
      if (!hits.length) return;
      let obj = hits[0].object;
      while (obj && !obj.userData.isDust) obj = obj.parent;
      if (!obj) return;
      obj.userData.hp -= 0.06;
      obj.scale.setScalar(Math.max(0.25, obj.userData.hp));
      obj.position.x += (Math.random() - 0.5) * 0.04;
      if (Math.random() < 0.3) RAudio.sfx('scrub');
      if (obj.userData.hp <= 0.25) {
        const idx = this.dusts.indexOf(obj);
        if (idx !== -1) this.dusts.splice(idx, 1);
        this.group.remove(obj);
        RAudio.sfx('sparkle');
        RWorld.sparkleBurst(obj.position.clone(), 14, 0xd0f0ff);
        RUI.praise('ピカピカ！');
        const left = this.dusts.length;
        if (left > 0) RUI.guide('あと ' + left + 'こ！');
        else this.finish();
      }
    },

    onPointerDown(x, y) { this.rub(x, y); },
    onPointerMove(x, y, dx, dy, isDown) { if (isDown) this.rub(x, y); },
    onPointerUp() {},

    finish() {
      this.state = 'done';
      RUI.guide('');
      RAudio.sfx('fanfare');
      RWorld.confetti(new THREE.Vector3(0, 4, 0), 60);
      // おへやじゅうキラキラ
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          RWorld.sparkleBurst(new THREE.Vector3((Math.random() - 0.5) * 8, 1 + Math.random() * 2, (Math.random() - 0.5) * 6), 10, 0xfff0a0);
          RAudio.sfx('sparkle');
        }, i * 250);
      }
      RCharacter.setMood(this.char, 'happy');
      setTimeout(() => RUI.reward(3, () => RMain.goHome()), 2200);
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      this.dusts.forEach((d, i) => {
        d.position.y = d.userData.baseY + Math.sin(time * 2 + i * 2) * 0.05;
        d.rotation.y = Math.sin(time * 1.2 + i) * 0.3;
      });
    },
  };

  /* ================================================
     2) おせんたく（いろわけ）
     ================================================ */
  const RHelpLaundry = {
    group: null, char: null,
    baskets: [], current: null, done: 0, total: 6, state: 'sort',
    hung: 0,

    COLORS: [
      { id: 'red',    color: 0xe84d4d },
      { id: 'blue',   color: 0x5a8fe8 },
      { id: 'yellow', color: 0xffd447 },
    ],

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xc8ecff);
      RWorld.scene.fog = new THREE.Fog(0xc8ecff, 18, 40);
      this.baskets = [];
      this.done = 0;
      this.hung = 0;
      this.state = 'sort';

      // おにわ
      const ground = new THREE.Mesh(new THREE.CircleGeometry(25, 40), RWorld.mat(0xa8e6a1));
      ground.rotation.x = -Math.PI / 2;
      g.add(ground);

      // せんたくき
      const washer = new THREE.Group();
      const body = RWorld.box(1.5, 1.8, 1.3, 0xffffff);
      body.position.y = 0.9;
      const door = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 24), RWorld.mat(0x8fd4e8));
      door.rotation.x = Math.PI / 2;
      door.position.set(0, 0.95, 0.68);
      const doorRim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 12, 28), RWorld.mat(0xd0d0d0));
      doorRim.position.set(0, 0.95, 0.7);
      washer.add(body, door, doorRim);
      washer.position.set(-3.4, 0, -1.5);
      washer.rotation.y = 0.5;
      g.add(washer);
      this.washerDoor = door;

      // ものほしロープ
      const poleL = RWorld.cyl(0.06, 0.08, 2.6, 0xd0a060, 10);
      poleL.position.set(-3.5, 1.3, -4.5);
      const poleR = RWorld.cyl(0.06, 0.08, 2.6, 0xd0a060, 10);
      poleR.position.set(3.5, 1.3, -4.5);
      g.add(poleL, poleR);
      const rope = RWorld.cyl(0.02, 0.02, 7, 0xffffff, 8);
      rope.rotation.z = Math.PI / 2;
      rope.position.set(0, 2.5, -4.5);
      g.add(rope);

      // カゴ 3つ（あか・あお・きいろ）
      this.COLORS.forEach((c, i) => {
        const basket = new THREE.Group();
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 0.8, 18, 1, true), RWorld.mat(c.color, { side: THREE.DoubleSide }));
        b.position.y = 0.4;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 12, 24), RWorld.mat(c.color));
        rim.position.y = 0.8;
        rim.rotation.x = Math.PI / 2;
        basket.add(b, rim);
        basket.position.set((i - 1) * 2.3, 0, 0.9);
        basket.userData.colorId = c.id;
        basket.userData.isBasket = true;
        g.add(basket);
        this.baskets.push(basket);
      });

      // リナちゃん
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(3.3, 0, -0.6);
      this.char.rotation.y = -0.7;
      this.char.scale.setScalar(0.9);
      RCharacter.setMood(this.char, 'work');
      g.add(this.char);

      RWorld.snapCamera([0, 4.6, 10.5], [0, 1.2, 0]);
      RWorld.moveCamera([0, 3.6, 9.2], [0, 1.1, 0]);
      RAudio.playBGM('game');

      RUI.show('minigame-ui');
      RUI.guide('おようふくと おなじいろの カゴを タッチ！');
      RAudio.speak('おせんたくものを いろわけしよう！おなじいろのカゴを タッチしてね');

      this.nextCloth();
    },

    exit() {
      RUI.hideAllGameUI();
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.current = null; this.baskets = [];
    },

    makeCloth(color) {
      // Tシャツふう
      const g = new THREE.Group();
      const body = RWorld.box(0.7, 0.7, 0.18, color);
      const sleeveL = RWorld.box(0.28, 0.3, 0.16, color);
      sleeveL.position.set(-0.48, 0.18, 0);
      sleeveL.rotation.z = 0.5;
      const sleeveR = RWorld.box(0.28, 0.3, 0.16, color);
      sleeveR.position.set(0.48, 0.18, 0);
      sleeveR.rotation.z = -0.5;
      const collar = RWorld.sphere(0.12, 0xffffff);
      collar.scale.set(1.4, 0.5, 0.6);
      collar.position.y = 0.36;
      g.add(body, sleeveL, sleeveR, collar);
      return g;
    },

    nextCloth() {
      if (this.done >= this.total) { this.finish(); return; }
      const c = this.COLORS[Math.floor(Math.random() * this.COLORS.length)];
      const cloth = this.makeCloth(c.color);
      cloth.position.set(-3.0, 1.1, -0.6);
      cloth.userData.colorId = c.id;
      cloth.userData.color = c.color;
      this.group.add(cloth);
      this.current = cloth;
      this.clothT = 0;
      this.clothState = 'out'; // せんたくきから ぽん とでてくる
      RAudio.sfx('boing');
    },

    onPointerDown(x, y) {
      if (this.state !== 'sort' || !this.current || this.clothState !== 'wait') return;
      const hits = RMain.raycast(x, y, this.baskets);
      if (!hits.length) return;
      let obj = hits[0].object;
      while (obj && !obj.userData.isBasket) obj = obj.parent;
      if (!obj) return;
      if (obj.userData.colorId === this.current.userData.colorId) {
        // せいかい！
        RAudio.sfx('yay');
        this.clothState = 'fly';
        this.flyTarget = obj.position.clone().add(new THREE.Vector3(0, 0.7, 0));
        this.flyStart = this.current.position.clone();
        this.clothT = 0;
        RWorld.sparkleBurst(obj.position.clone().add(new THREE.Vector3(0, 1, 0)), 8, 0xd0ffc0);
      } else {
        // ちがうよ〜（ペナルティなし）
        RAudio.sfx('wrong');
        RAudio.speak('あれれ？ちがういろだよ');
        obj.userData.shake = 0.5;
      }
    },
    onPointerMove() {}, onPointerUp() {},

    finish() {
      this.state = 'done';
      RUI.guide('ぜんぶ できたね！');
      RAudio.sfx('fanfare');
      RWorld.confetti(new THREE.Vector3(0, 4, -1), 60);
      RCharacter.setMood(this.char, 'happy');
      setTimeout(() => RUI.reward(3, () => RMain.goHome()), 2200);
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      if (this.washerDoor) this.washerDoor.rotation.z += dt * 3;

      // カゴのぷるぷる
      this.baskets.forEach((b) => {
        if (b.userData.shake > 0) {
          b.userData.shake -= dt;
          b.rotation.z = Math.sin(time * 30) * 0.08;
        } else b.rotation.z = 0;
        b.position.y = 0;
      });

      if (this.current) {
        this.clothT += dt;
        if (this.clothState === 'out') {
          // せんたくきから ちゅうおうへ ぽーん
          const t = Math.min(1, this.clothT / 0.8);
          this.current.position.x = -3.0 + t * 3.0;
          this.current.position.y = 1.1 + Math.sin(t * Math.PI) * 1.4;
          this.current.rotation.z = t * Math.PI * 2;
          if (t >= 1) {
            this.clothState = 'wait';
            this.current.position.set(0, 1.6, 0);
            this.current.rotation.z = 0;
          }
        } else if (this.clothState === 'wait') {
          this.current.position.y = 1.6 + Math.sin(time * 2.5) * 0.1;
          this.current.rotation.y = Math.sin(time * 1.8) * 0.25;
        } else if (this.clothState === 'fly') {
          const t = Math.min(1, this.clothT / 0.5);
          this.current.position.lerpVectors(this.flyStart, this.flyTarget, t);
          this.current.position.y += Math.sin(t * Math.PI) * 1.2;
          this.current.scale.setScalar(1 - t * 0.5);
          if (t >= 1) {
            // ロープに ほす
            const mini = this.makeCloth(this.current.userData.color);
            mini.scale.setScalar(0.8);
            mini.position.set(-2.4 + this.hung * 1.0, 2.1, -4.5);
            this.group.add(mini);
            this.hung++;
            this.group.remove(this.current);
            this.current = null;
            this.done++;
            RAudio.sfx('coin');
            if (this.done < this.total) {
              RUI.guide('あと ' + (this.total - this.done) + 'まい！');
              setTimeout(() => this.nextCloth(), 500);
            } else {
              this.nextCloth(); // → finish()
            }
          }
        }
      }
    },
  };

  /* ================================================
     3) パンケーキづくり
     ================================================ */
  const RHelpCook = {
    group: null, char: null,
    state: 'pour', pancake: null, stack: 0, stackTotal: 3,
    bubbles: [], cookT: 0,

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      RWorld.scene.background = new THREE.Color(0xffedd8);
      RWorld.scene.fog = new THREE.Fog(0xffedd8, 16, 36);
      this.state = 'pour';
      this.stack = 0;
      this.bubbles = [];

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
      stove.position.set(-1.2, 1.22, 0.2);
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
      pan.position.set(-1.2, 1.28, 0.2);
      g.add(pan);
      this.pan = pan;

      // ボウル（きじ）
      const bowl = new THREE.Group();
      const bowlM = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), RWorld.mat(0x8fd4e8, { side: THREE.DoubleSide }));
      bowlM.rotation.x = Math.PI;
      bowlM.position.y = 0.55;
      const batter = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 24), RWorld.mat(0xffe8b0));
      batter.position.y = 0.48;
      bowl.add(bowlM, batter);
      bowl.position.set(1.7, 1.13, 0.3);
      bowl.userData.isBowl = true;
      g.add(bowl);
      this.bowl = bowl;

      // おさら
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 0.1, 28), RWorld.mat(0xffffff));
      plate.position.set(2.15, 1.18, -0.55);
      plate.userData.isPlate = true;
      g.add(plate);
      this.plate = plate;
      this.plateStack = new THREE.Group();
      this.plateStack.position.copy(plate.position);
      g.add(this.plateStack);

      // リナちゃん
      this.char = RCharacter.create(RSave.data.outfit);
      this.char.position.set(-2.6, 0, 1.6);
      this.char.rotation.y = 0.7;
      this.char.scale.setScalar(0.9);
      RCharacter.setMood(this.char, 'work');
      g.add(this.char);

      RWorld.snapCamera([0, 4.4, 9], [0, 1.2, 0]);
      RWorld.moveCamera([0, 3.4, 7.4], [0, 1.2, 0]);
      RAudio.playBGM('game');

      RUI.show('minigame-ui');
      RUI.guide('ボウルを タッチして きじを いれよう！');
      RAudio.speak('パンケーキを つくろう！ボウルを タッチしてね');
    },

    exit() {
      RUI.hideAllGameUI();
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null; this.pancake = null; this.bubbles = [];
    },

    onPointerDown(x, y) {
      if (this.state === 'pour') {
        const hits = RMain.raycast(x, y, [this.bowl]);
        if (hits.length) this.pour();
      } else if (this.state === 'plate') {
        const hits = RMain.raycast(x, y, [this.plate, this.plateStack]);
        if (hits.length) this.toPlate();
      } else if (this.state === 'topping') {
        // トッピングは ツールバーから
      }
    },
    onPointerMove() {}, onPointerUp() {},

    pour() {
      this.state = 'pouring';
      RAudio.sfx('splash');
      RUI.guide('じゅ〜っ！');
      // きじが そそがれて パンケーキが そだつ
      const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.14, 24), RWorld.mat(0xffe8b0));
      cake.position.set(0, 0.1, 0);
      cake.scale.setScalar(0.1);
      this.pan.add(cake);
      this.pancake = cake;
      this.cookT = 0;
      RAudio.sfx('sizzle');
    },

    flip() {
      this.state = 'flipping';
      RAudio.sfx('flip');
      RUI.hideActionBtn();
      RUI.guide('くるん！');
      this.flipT = 0;
      RUI.praise('じょうずに フリップ！');
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
      setTimeout(() => RUI.reward(3, () => RMain.goHome()), 2200);
    },

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);

      if (this.state === 'pouring' && this.pancake) {
        const s = Math.min(1, this.pancake.scale.x + dt * 0.9);
        this.pancake.scale.setScalar(s);
        if (s >= 1) {
          this.state = 'cooking';
          this.cookT = 0;
          RUI.guide('ぷつぷつ してきたら ひっくりかえすよ…');
        }
      } else if (this.state === 'cooking') {
        this.cookT += dt;
        // ぷつぷつあわ
        if (Math.random() < dt * 6 && this.pancake) {
          const b = RWorld.sphere(0.03, 0xf0d090);
          const a = Math.random() * Math.PI * 2, r = Math.random() * 0.4;
          const wp = this.pancake.getWorldPosition(new THREE.Vector3());
          b.position.set(wp.x + Math.cos(a) * r, wp.y + 0.1, wp.z + Math.sin(a) * r);
          this.group.add(b);
          this.bubbles.push({ mesh: b, t: 0 });
          if (Math.random() < 0.4) RAudio.sfx('sizzle');
        }
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
          this.pancake.material.color.setHex(0xd9a05b); // やきいろ
          this.state = 'cooking2';
          this.cookT = 0;
          RAudio.sfx('sizzle');
        }
      } else if (this.state === 'cooking2') {
        this.cookT += dt;
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
          if (this.stack < this.stackTotal) {
            this.state = 'pour';
            RUI.guide('もういちど！ボウルを タッチ！（あと' + (this.stackTotal - this.stack) + 'まい）');
          } else {
            this.startToppings();
          }
        }
      }

      // あわのアニメ
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
