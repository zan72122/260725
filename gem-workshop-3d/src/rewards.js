/* ============================================================
 * rewards.js — ごほうび（ちょうちょ・部屋のキラキラ・プリンセスと王冠）
 *   ※ どれも「おわり」ではなく、そのあとも自由に削りつづけられる
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- ちょうちょ ---------------- */

  /* 羽1枚。mirror=true で左右反転（からだは +Z が前） */
  function wingGeometry(mirror) {
    var g = new THREE.PlaneGeometry(0.32, 0.30);
    g.rotateX(-Math.PI / 2);                    // ぺたんと寝かせる
    g.translate(mirror ? -0.16 : 0.16, 0, 0);
    if (mirror) {
      var uv = g.attributes.uv;
      for (var i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      uv.needsUpdate = true;
    }
    return g;
  }

  function Butterfly(scene, index) {
    this.g = new THREE.Group();
    var wingMat = new THREE.MeshBasicMaterial({
      map: TEX.wing(), transparent: true, side: THREE.DoubleSide, depthWrite: false
    });

    this.left = new THREE.Group();
    this.left.add(new THREE.Mesh(wingGeometry(false), wingMat));
    this.right = new THREE.Group();
    this.right.add(new THREE.Mesh(wingGeometry(true), wingMat));

    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.010, 0.17, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a5fbf })
    );
    body.rotation.x = Math.PI / 2;              // からだを前後方向へ

    this.g.add(this.left); this.g.add(this.right); this.g.add(body);
    scene.add(this.g);

    this.i = index;
    this.phase = index * 1.9;
    this.speed = 0.55 + (index % 4) * 0.12;
    this.radius = 1.7 + (index % 5) * 0.32;
    this.height = 1.3 + (index % 3) * 0.55;
    this.scale = 0.85 + (index % 3) * 0.2;
    this.g.scale.setScalar(this.scale);
    this.alive = 0;      // 出てくるときのフェードイン
  }

  Butterfly.prototype.update = function (dt, time, center) {
    this.alive = Math.min(1, this.alive + dt * 0.8);
    var t = time * this.speed + this.phase;
    var x = center.x + Math.cos(t) * this.radius + Math.sin(t * 2.3) * 0.35;
    var y = center.y + Math.sin(t * 1.7 + this.i) * 0.42 + (this.height - 1.4);
    var z = center.z + Math.sin(t * 0.9) * this.radius * 0.75 + Math.cos(t * 2.1) * 0.3;
    var prev = this.g.position.clone();
    this.g.position.set(x, y, z);
    this.g.scale.setScalar(this.scale * this.alive);

    /* 進む向きを向く（からだの前は +Z） */
    var dirv = this.g.position.clone().sub(prev);
    if (dirv.lengthSq() > 1e-6) this.g.lookAt(this.g.position.clone().add(dirv));

    /* はばたき */
    var flap = Math.sin(time * 13 + this.phase) * 0.8;
    this.left.rotation.z = 0.25 + flap;
    this.right.rotation.z = -0.25 - flap;
  };

  /* ---------------- プリンセスと王冠 ---------------- */

  function makePrincess() {
    var g = new THREE.Group();
    var skin = new THREE.MeshLambertMaterial({ color: 0xffe0c8 });
    var dressCol = new THREE.MeshLambertMaterial({ color: 0xff9ecb });
    var hairCol = new THREE.MeshLambertMaterial({ color: 0x6b4230 });
    var gold = new THREE.MeshLambertMaterial({ color: 0xffd35c, emissive: 0x604000 });

    var dress = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 20), dressCol);
    dress.position.y = 0.25;
    g.add(dress);
    var frill = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 22), new THREE.MeshLambertMaterial({ color: 0xfff0f8 }));
    frill.rotation.x = Math.PI / 2;
    frill.position.y = 0.06;
    g.add(frill);

    var torso = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), dressCol);
    torso.position.y = 0.55;
    torso.scale.set(1, 1.1, 0.85);
    g.add(torso);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 16), skin);
    head.position.y = 0.78;
    g.add(head);

    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.168, 20, 16), hairCol);
    hair.position.set(0, 0.80, -0.012);
    hair.scale.set(1, 0.95, 1);
    g.add(hair);
    var face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), skin);
    face.position.set(0, 0.775, 0.03);
    face.scale.set(0.95, 0.92, 0.9);
    g.add(face);
    for (var s = -1; s <= 1; s += 2) {
      var tail = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), hairCol);
      tail.position.set(s * 0.16, 0.72, -0.03);
      tail.scale.set(0.8, 1.5, 0.8);
      g.add(tail);
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), new THREE.MeshBasicMaterial({ color: 0x3a2a2a }));
      eye.position.set(s * 0.052, 0.79, 0.142);
      g.add(eye);
      var cheek = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb0c0, transparent: true, opacity: 0.75 }));
      cheek.position.set(s * 0.093, 0.755, 0.115);
      g.add(cheek);
    }
    var smile = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0xc46a6a }));
    smile.position.set(0, 0.745, 0.142);
    smile.rotation.z = Math.PI;
    g.add(smile);

    var tiara = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.016, 6, 18), gold);
    tiara.rotation.x = Math.PI / 2;
    tiara.position.y = 0.90;
    g.add(tiara);

    var arms = [];
    for (s = -1; s <= 1; s += 2) {
      var arm = new THREE.Group();
      var upper = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.26, 8), skin);
      upper.position.y = -0.13;
      arm.add(upper);
      var hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), skin);
      hand.position.y = -0.27;
      arm.add(hand);
      arm.position.set(s * 0.13, 0.62, 0);
      arm.rotation.z = s * 0.35;
      g.add(arm);
      arms.push(arm);
    }
    g.userData.arms = arms;
    return g;
  }

  function makeCrown() {
    var g = new THREE.Group();
    var gold = new THREE.MeshLambertMaterial({ color: 0xffd35c, emissive: 0x6a4a00 });
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.16, 24, 1, true), gold);
    band.position.y = 0.08;
    band.material.side = THREE.DoubleSide;
    g.add(band);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.028, 8, 26), gold);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    for (var i = 0; i < 6; i++) {
      var a = i * Math.PI / 3;
      var spike = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 10), gold);
      spike.position.set(Math.cos(a) * 0.3, 0.24, Math.sin(a) * 0.3);
      g.add(spike);
      var ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshLambertMaterial({
        color: new THREE.Color().setHSL(i / 6, 0.7, 0.65), emissive: 0x332211
      }));
      ball.position.set(Math.cos(a) * 0.3, 0.38, Math.sin(a) * 0.3);
      g.add(ball);
    }
    /* 宝石をはめる台 */
    var socket = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.08, 14), gold);
    socket.position.y = 0.2;
    g.add(socket);
    g.userData.socketY = 0.34;
    return g;
  }

  /* ---------------- Rewards ---------------- */

  var STAGES = [
    { at: 4, key: 'star', text: '⭐ ほうせきの なかに ほしが ともった！' },
    { at: 8, key: 'butterfly', text: '🦋 にじいろの ちょうちょが きた！' },
    { at: 12, key: 'sparkle', text: '✨ おへやじゅうが キラキラ！' },
    { at: 16, key: 'butterfly2', text: '🦋🦋 ちょうちょが ふえた！' },
    { at: 20, key: 'princess', text: '👑 プリンセスが きたよ！' },
    { at: 26, key: 'more', text: '🌈 にじが おおきくなった！' },
    { at: 32, key: 'more', text: '🎉 こうぼうが おまつりみたい！' },
    { at: 40, key: 'more', text: '💎 まほうの ほうせきに なってきた！' },
    { at: 50, key: 'more', text: '👑✨ でんせつの ほうせき！' }
  ];

  function Rewards(scene, gem, room) {
    this.scene = scene;
    this.gem = gem;
    this.room = room;
    this.butterflies = [];
    this.level = 0;
    this.stageIndex = 0;
    this.extraLevel = 0;
    this.princess = null;
    this.crown = null;
    this.crownGem = null;
    this.crownStand = null;
    this.state = 'none';
    this.t = 0;
    this.clapTimer = 0;
    this.lastGeo = null;
    this.sideX = 2.05;      // プリンセスと王冠を置く横の位置（画面の広さで変わる）
  }

  /* 画面が細長いときは、プリンセスたちを内側へ寄せて画面からはみ出させない */
  Rewards.prototype.setLayout = function (halfWidthAtGem) {
    this.sideX = Math.max(1.25, Math.min(2.35, halfWidthAtGem * 0.66));
    if (this.crownStand) this.crownStand.position.x = this.sideX * 0.82;
    if (this.state === 'display') {
      if (this.crown) this.crown.position.x = this.sideX * 0.82;
      if (this.princess) this.princess.position.x = this.sideX * 1.28;
    }
  };

  Rewards.prototype.setButterflies = function (n) {
    while (this.butterflies.length < n) {
      this.butterflies.push(new Butterfly(this.scene, this.butterflies.length));
    }
  };

  /* 面の数に応じてごほうびを進める。新しく出たごほうびの文字を返す */
  Rewards.prototype.check = function (facetCount) {
    var msg = null;
    while (this.stageIndex < STAGES.length && facetCount >= STAGES[this.stageIndex].at) {
      var st = STAGES[this.stageIndex];
      msg = st.text;
      this.stageIndex++;
      this.level = this.stageIndex / STAGES.length;

      if (st.key === 'butterfly') { this.setButterflies(3); Sound.play('butterfly'); }
      else if (st.key === 'butterfly2') { this.setButterflies(6); Sound.play('butterfly'); }
      else if (st.key === 'sparkle') { Sound.play('sharan', 8); }
      else if (st.key === 'princess') { this.startPrincess(); }
      else if (st.key === 'more') {
        this.setButterflies(Math.min(12, this.butterflies.length + 2));
        Sound.play('fanfare');
      } else Sound.play('star');

      this.room.setCelebration(this.level);
    }

    /* 用意したごほうびを全部出したあとも、10面ごとにおいわいはつづく */
    if (this.stageIndex >= STAGES.length) {
      var extra = Math.floor((facetCount - STAGES[STAGES.length - 1].at) / 10);
      if (extra > this.extraLevel) {
        this.extraLevel = extra;
        msg = '🌈 きらきらが もっと ふえた！';
        this.setButterflies(Math.min(14, this.butterflies.length + 1));
        Sound.play('fanfare');
      }
    }

    /* 面が増えるほど、中の星も部屋のキラキラも増える */
    this.gem.setStarCount(Math.max(0, Math.min(30, facetCount - 3)));
    FX.setAmbient(Math.min(1, Math.max(0, (facetCount - 6) / 26)));
    return msg;
  };

  Rewards.prototype.startPrincess = function () {
    if (this.princess) return;
    this.princess = makePrincess();
    this.princess.position.set(this.sideX * 1.28 + 2.2, 0, 0.75);
    this.princess.rotation.y = -Math.PI / 2;
    this.princess.scale.setScalar(1.25);
    this.scene.add(this.princess);

    this.crown = makeCrown();
    this.crown.scale.setScalar(0.85);
    this.crown.position.set(this.sideX * 1.28 + 2.2, 1.0, 0.75);
    this.scene.add(this.crown);

    /* 王冠を置く小さな台 */
    this.crownStand = new THREE.Group();
    var p = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.9, 18), new THREE.MeshLambertMaterial({ color: 0xcb9d76 }));
    p.position.y = 0.45;
    this.crownStand.add(p);
    var t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.1, 20), new THREE.MeshLambertMaterial({ color: 0xdcb18a }));
    t.position.y = 0.95;
    this.crownStand.add(t);
    this.crownStand.position.set(this.sideX * 0.82, 0, -0.7);
    this.crownStand.visible = false;
    this.scene.add(this.crownStand);

    this.state = 'walk';
    this.t = 0;
    Sound.play('princess');
  };

  Rewards.prototype.update = function (dt, time, gemCenter) {
    for (var i = 0; i < this.butterflies.length; i++) {
      this.butterflies[i].update(dt, time, gemCenter);
    }

    if (!this.princess) return;
    this.t += dt;
    var pr = this.princess;

    if (this.state === 'walk') {
      var target = new THREE.Vector3(this.sideX * 0.9, 0, 0.5);
      pr.position.lerp(target, Math.min(1, dt * 1.6));
      pr.position.y = Math.abs(Math.sin(time * 7)) * 0.045;         // とてとて歩く
      pr.rotation.z = Math.sin(time * 7) * 0.05;
      this.crown.position.set(pr.position.x, 1.15 + Math.sin(time * 7) * 0.04, pr.position.z);
      this.crown.rotation.y += dt * 1.2;
      if (pr.position.distanceTo(target) < 0.09) {
        this.state = 'lift';
        this.t = 0;
        pr.rotation.z = 0;
        pr.rotation.y = -0.5;
        /* 宝石のミニチュアを作る（本物と同じ形。以後もいっしょに変化する） */
        this.crownGem = new THREE.Mesh(this.gem.meshFront.geometry, this.gem.frontMat);
        this.crownGem.scale.setScalar(0.22);
        this.crownGem.renderOrder = 3;
        this.scene.add(this.crownGem);
        this.crownGem.position.copy(gemCenter);
        this.lastGeo = this.gem.meshFront.geometry;
        Sound.play('whoosh');
      }
    } else if (this.state === 'lift') {
      /* 王冠をかかげる */
      this.crown.position.y += (1.75 - this.crown.position.y) * Math.min(1, dt * 3);
      this.crown.rotation.y += dt * 0.8;
      var arms = pr.userData.arms;
      arms[0].rotation.z = Math.min(2.4, arms[0].rotation.z + dt * 3);
      arms[1].rotation.z = Math.max(-2.4, arms[1].rotation.z - dt * 3);
      /* ミニ宝石が王冠へ吸い込まれていく */
      var socket = this.crown.position.clone();
      socket.y += this.crown.userData.socketY;
      var k = Math.min(1, this.t / 1.6);
      this.crownGem.position.lerpVectors(gemCenter, socket, k * k * (3 - 2 * k));
      this.crownGem.scale.setScalar(0.9 - 0.68 * k);
      this.crownGem.rotation.y += dt * 3;
      if (k >= 1) {
        this.state = 'cheer';
        this.t = 0;
        FX.rainbowBurst(socket, 34);
        FX.sparkle(socket, 20, 0.13);
        Sound.play('fanfare');
        this.room.flashRainbow(socket, new THREE.Vector3(-0.2, 0.1, -1).normalize(), 0.5);
      }
    } else if (this.state === 'cheer') {
      var a2 = pr.userData.arms;
      a2[0].rotation.z = 2.2 + Math.sin(time * 12) * 0.35;
      a2[1].rotation.z = -2.2 - Math.sin(time * 12) * 0.35;
      pr.position.y = Math.abs(Math.sin(time * 8)) * 0.07;
      this.crown.rotation.y += dt * 1.4;
      if (this.t > 2.2) {
        this.state = 'display';
        this.t = 0;
        this.crownStand.visible = true;
      }
    } else if (this.state === 'display') {
      /* 王冠を台にかざって、そばで見守る */
      var stand = new THREE.Vector3(this.sideX * 0.82, 1.28, -0.7);
      this.crown.position.lerp(stand, Math.min(1, dt * 2.2));
      this.crown.rotation.y += dt * 0.5;
      pr.position.x += (this.sideX * 1.28 - pr.position.x) * Math.min(1, dt * 1.5);
      pr.position.z += (-0.05 - pr.position.z) * Math.min(1, dt * 1.5);
      pr.position.y = 0;
      pr.rotation.y += (-0.9 - pr.rotation.y) * Math.min(1, dt * 2);
      var a3 = pr.userData.arms;
      var idle = Math.sin(time * 2) * 0.15;
      if (this.clapTimer > 0) {
        this.clapTimer -= dt;
        a3[0].rotation.z = 1.9 + Math.sin(time * 22) * 0.5;
        a3[1].rotation.z = -1.9 - Math.sin(time * 22) * 0.5;
        pr.position.y = Math.abs(Math.sin(time * 9)) * 0.06;
      } else {
        a3[0].rotation.z += (0.35 + idle - a3[0].rotation.z) * Math.min(1, dt * 3);
        a3[1].rotation.z += (-0.35 - idle - a3[1].rotation.z) * Math.min(1, dt * 3);
      }
    }

    /* 王冠の宝石は、いまの宝石の形にいつも合わせる */
    if (this.crownGem) {
      if (this.gem.meshFront.geometry !== this.lastGeo) {
        this.crownGem.geometry = this.gem.meshFront.geometry;
        this.lastGeo = this.gem.meshFront.geometry;
      }
      if (this.state === 'display' || this.state === 'cheer') {
        var sc = this.crown.position.clone();
        sc.y += this.crown.userData.socketY;
        this.crownGem.position.copy(sc);
        this.crownGem.rotation.y += dt * 0.9;
        this.crownGem.scale.setScalar(0.22);
      }
    }
  };

  /* 新しい面ができたらプリンセスがよろこぶ */
  Rewards.prototype.applaud = function () {
    if (this.state === 'display') this.clapTimer = 1.1;
  };

  Rewards.prototype.reset = function () {
    for (var i = 0; i < this.butterflies.length; i++) this.scene.remove(this.butterflies[i].g);
    this.butterflies = [];
    if (this.princess) { this.scene.remove(this.princess); this.princess = null; }
    if (this.crown) { this.scene.remove(this.crown); this.crown = null; }
    if (this.crownGem) { this.scene.remove(this.crownGem); this.crownGem = null; }
    if (this.crownStand) { this.scene.remove(this.crownStand); this.crownStand = null; }
    this.state = 'none';
    this.stageIndex = 0;
    this.extraLevel = 0;
    this.level = 0;
    this.room.setCelebration(0);
    FX.setAmbient(0);
  };

  /* セーブから復元するときは、演出をとばして今の状態にする */
  Rewards.prototype.restore = function (facetCount) {
    this.extraLevel = Math.max(0, Math.floor((facetCount - STAGES[STAGES.length - 1].at) / 10));
    while (this.stageIndex < STAGES.length && facetCount >= STAGES[this.stageIndex].at) {
      var st = STAGES[this.stageIndex];
      this.stageIndex++;
      this.level = this.stageIndex / STAGES.length;
      if (st.key === 'butterfly') this.setButterflies(3);
      else if (st.key === 'butterfly2') this.setButterflies(6);
      else if (st.key === 'more') this.setButterflies(Math.min(12, this.butterflies.length + 2));
      else if (st.key === 'princess') {
        this.startPrincess();
        this.state = 'display';
        this.princess.position.set(this.sideX * 1.28, 0, -0.05);
        this.princess.rotation.y = -0.9;
        this.crown.position.set(this.sideX * 0.82, 1.28, -0.7);
        this.crownStand.visible = true;
        this.crownGem = new THREE.Mesh(this.gem.meshFront.geometry, this.gem.frontMat);
        this.crownGem.scale.setScalar(0.22);
        this.crownGem.renderOrder = 3;
        this.lastGeo = this.gem.meshFront.geometry;
        this.scene.add(this.crownGem);
      }
    }
    this.room.setCelebration(this.level);
    this.gem.setStarCount(Math.max(0, Math.min(30, facetCount - 3)));
    FX.setAmbient(Math.min(1, Math.max(0, (facetCount - 6) / 26)));
  };

  window.Rewards = Rewards;
})();
