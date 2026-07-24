/* ================================================================
   travel.js — おでかけシーン
   げんかんで くつをはく → ドアをあける → まちをあるく → おみせに とうちゃく
   スキップボタンつき。2かいめからは みちのりが みじかくなる。
   ================================================================ */
(function () {
  const RTravel = {
    group: null, char: null,
    target: null,
    phase: 'genkan',
    scenery: null,
    walkDist: 0,

    /* しゅっぱつ！ */
    start(targetId) {
      this.target = targetId;
      RMain.switchMode('travel');
    },

    enter() {
      const g = new THREE.Group();
      this.group = g;
      RWorld.scene.add(g);
      const trips = (RSave.data.trips && RSave.data.trips[this.target]) || 0;
      this.isShort = trips > 0;

      this.char = RCharacter.create(RSave.data.outfit);
      g.add(this.char);

      RUI.show('minigame-ui');
      RUI.showSkip(() => this.finish());

      if (this.isShort) {
        // 2かいめからは げんかんを スキップして すぐ おでかけ
        this.buildStreet();
        RAudio.speak('いってきまーす！');
      } else {
        this.buildGenkan();
      }
    },

    exit() {
      RUI.hideAllGameUI();
      RUI.hideSkip();
      if (this.group) { RWorld.scene.remove(this.group); this.group = null; }
      this.char = null;
      this.scenery = null;
    },

    /* ---------------- げんかん：くつを はいて ドアを あける ---------------- */
    buildGenkan() {
      this.phase = 'genkan';
      const g = this.group;
      RWorld.scene.background = new THREE.Color(0xfff0dc);
      RWorld.scene.fog = new THREE.Fog(0xfff0dc, 14, 30);

      const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 30), RWorld.mat(0xf5d8a8));
      floor.rotation.x = -Math.PI / 2;
      g.add(floor);
      // たたき（くつをはくところ）
      const tataki = RWorld.box(3.4, 0.08, 1.6, 0xd9b382);
      tataki.position.set(0, 0.04, -1.6);
      g.add(tataki);
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(9, 9, 5, 30, 1, true, Math.PI * 0.7, Math.PI * 1.6),
        RWorld.mat(0xfff0d8, { side: THREE.BackSide }));
      wall.position.y = 2.5;
      g.add(wall);

      const door = RProps.makeDoor();
      door.position.set(0, 0, -2.6);
      g.add(door);
      this.door = door;

      const shoeBox = RProps.makeShoeBox();
      shoeBox.position.set(-2.2, 0, -2.2);
      shoeBox.rotation.y = 0.4;
      g.add(shoeBox);
      this.shoeBox = shoeBox;

      const matMesh = RWorld.box(1.3, 0.05, 0.9, 0xff9ecd);
      matMesh.position.set(0, 0.1, -1.5);
      g.add(matMesh);

      this.char.position.set(0.4, 0, 2.6);
      this.char.rotation.y = Math.PI;

      RWorld.snapCamera([0, 2.6, 5.5], [0, 1.2, -1.5]);
      RAudio.playBGM('home');

      const shoesItem = RCharacter.findItem('shoes', RSave.data.outfit.shoes);
      // くつばこから でてくる おでかけぐつ
      const shoePair = new THREE.Group();
      [-0.12, 0.12].forEach((x) => {
        const s = RWorld.sphere(0.12, shoesItem.color, 1, 0.7, 1.4);
        s.position.x = x;
        shoePair.add(s);
      });
      shoePair.position.set(-2.2, 0.9, -1.9);
      shoePair.visible = false;
      g.add(shoePair);

      RSeq.run([
        RSeq.guide('おでかけの じゅんび！'),
        RSeq.walk(this.char, 0, 0, { faceY: Math.PI }),
        RSeq.say('くつを はこうっと'),
        // くつばこの とびらが あく
        RSeq.call(() => RAudio.sfx('doorOpen')),
        RSeq.rotTo(shoeBox.userData.door, 'y', -1.7, 0.5),
        RSeq.call(() => { shoePair.visible = true; }),
        // くつが ぽんと とんでくる
        RSeq.move(shoePair, [0, 0.06, -1.4], 0.55, { arc: 0.7 }),
        RSeq.sfx('boing'),
        // よいしょ、と はく（ぴょん ぴょん）
        RSeq.walk(this.char, 0, -1.0, { faceY: Math.PI }),
        RSeq.mood(this.char, 'crouch', 0.7),
        RSeq.wait(0.7),
        RSeq.call(() => { shoePair.visible = false; RAudio.sfx('step'); }),
        { dur: 0.55, onStart: () => RCharacter.setMood(this.char, 'happy'),
          onUpdate: () => {}, onEnd: () => RAudio.sfx('step') },
        RSeq.wait(0.25),
        RSeq.say('くつ はけた！'),
        RSeq.mood(this.char, 'idle'),
        RSeq.wait(0.4),
        // ドアを あけて しゅっぱつ
        RSeq.call(() => RAudio.sfx('doorOpen')),
        RSeq.rotTo(door.userData.door, 'y', -1.9, 0.8),
        RSeq.say('いってきまーす！'),
        RSeq.walk(this.char, 0, -2.5, { faceY: Math.PI }),
        RSeq.call(() => this.buildStreet()),
      ]);
    },

    /* ---------------- まちを あるく ---------------- */
    buildStreet() {
      this.phase = 'street';
      const g = this.group;
      while (g.children.length) g.remove(g.children[0]);
      g.add(this.char); // げんかんシーンごと消したので もどす
      RWorld.scene.background = new THREE.Color(0xbfe8ff);
      RWorld.scene.fog = new THREE.Fog(0xbfe8ff, 20, 45);

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), RWorld.mat(0xa8e6a1));
      ground.rotation.x = -Math.PI / 2;
      g.add(ground);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(80, 2.4), RWorld.mat(0xe8d5b0));
      road.rotation.x = -Math.PI / 2;
      road.position.y = 0.01;
      g.add(road);

      // ながれる まちなみ
      const sc = new THREE.Group();
      this.scenery = sc;
      g.add(sc);
      const houseColors = [[0xfff0c0, 0xe8735a], [0xd0e8ff, 0x5a8fe8], [0xffe0ef, 0xff7bb5], [0xe0ffd8, 0x7cc47a]];
      for (let i = 0; i < 4; i++) {
        const h = RProps.makeStreetHouse(houseColors[i][0], houseColors[i][1]);
        h.position.set(i * 6.5, 0, -4.2);
        sc.add(h);
      }
      for (let i = 0; i < 6; i++) {
        const t = RProps.makeTree();
        t.position.set(i * 4.6 + 2, 0, i % 2 === 0 ? -2.6 : 2.8);
        t.scale.setScalar(0.8 + (i % 3) * 0.15);
        sc.add(t);
      }
      for (let i = 0; i < 12; i++) {
        const f = RWorld.makeFlower([0xff8ec7, 0xffd447, 0xffffff][i % 3], 0.6);
        f.position.set(i * 2.3 + 1, 0, i % 2 === 0 ? 2.2 : -2.2);
        sc.add(f);
      }
      // ゴールの おみせ
      const dist = this.isShort ? 14 : 24;
      const shop = RProps.makeShopFacade(this.target);
      shop.position.set(dist + 3, 0, -3.2);
      sc.add(shop);
      this.shop = shop;
      this.walkDist = dist;
      this.walked = 0;

      // そら
      for (let i = 0; i < 4; i++) {
        const cloud = new THREE.Group();
        for (let j = 0; j < 3; j++) {
          const c = RWorld.sphere(0.5 + Math.random() * 0.3, 0xffffff);
          c.position.set(j * 0.6 - 0.6, Math.random() * 0.2, 0);
          cloud.add(c);
        }
        cloud.position.set(i * 7, 5 + (i % 2), -8);
        sc.add(cloud);
      }
      const sun = RWorld.sphere(0.8, 0xffe14d);
      sun.material = new THREE.MeshBasicMaterial({ color: 0xffe14d });
      sun.position.set(6, 7.5, -10);
      g.add(sun);

      this.char.position.set(-2, 0, 0);
      this.char.rotation.y = Math.PI / 2;
      RCharacter.setMood(this.char, 'walk');
      RWorld.snapCamera([-2, 2.6, 7.5], [-0.5, 1.3, 0]);
      RAudio.playBGM('game');
      RUI.guide(this.isShort ? 'おみせに いこう！' : 'まちを あるいて おみせに いこう！');
      const labels = { job_cake: 'ケーキやさん', job_idol: 'コンサートホール', job_flower: 'おはなやさん' };
      RAudio.speak((labels[this.target] || 'おみせ') + 'に むかって しゅっぱつ！');
    },

    finish() {
      if (this.finished) return;
      this.finished = true;
      if (!RSave.data.trips) RSave.data.trips = {};
      RSave.data.trips[this.target] = (RSave.data.trips[this.target] || 0) + 1;
      RSave.save();
      RSeq.clear();
      const target = this.target;
      this.finished = false;
      RMain.switchMode(target);
    },

    onPointerDown() {}, onPointerMove() {}, onPointerUp() {},

    update(time, dt) {
      if (this.char) RCharacter.animate(this.char, time, dt);
      if (this.phase === 'street' && this.scenery) {
        const speed = this.isShort ? 4.2 : 3.0;
        this.scenery.position.x -= speed * dt;
        this.walked += speed * dt;
        this.char.userData.stepT = (this.char.userData.stepT || 0) + dt;
        if (this.char.userData.stepT > 0.26) { this.char.userData.stepT = 0; RAudio.sfx('step'); }
        if (this.walked >= this.walkDist && !this.arriving) {
          this.arriving = true;
          RCharacter.setMood(this.char, 'happy', 1.2);
          RAudio.sfx('yay');
          RAudio.speak('とうちゃーく！');
          RUI.guide('とうちゃく！');
          setTimeout(() => { this.arriving = false; this.finish(); }, 1300);
        }
      }
    },
  };

  window.RTravel = RTravel;
})();
