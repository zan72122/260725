/* ============================================================
 * baby.js — 3D あかちゃんキャラクター
 * プリミティブ組み立て / まばたき / 表情 / ポーズ / きせかえ / よごれ
 * ============================================================ */
(function () {
  'use strict';

  var SKIN = 0xffdcc2;
  var CHEEK = 0xffa8b8;

  function lambert(color) { return new THREE.MeshLambertMaterial({ color: color }); }

  function Baby(opts) {
    opts = opts || {};
    this.group = new THREE.Group();      // 外側（アクティビティが自由に動かす）
    this.root = new THREE.Group();       // 内側（ポーズ用）
    this.group.add(this.root);

    this.mood = 'idle';
    this.pose = 'stand';
    this.blinkTimer = 1.5 + Math.random() * 2;
    this.blinkPhase = 0;
    this.giggleTime = 0;
    this.chewTime = 0;
    this.clapTime = 0;
    this.waveTime = 0;
    this.bounceTime = 0;
    this.eyesClosed = false;
    this.dirtMeshes = [];
    this.outfitColor = opts.outfitColor || 0xffd44d;

    this._build();
    this.setHat(opts.hat || 'none');
    this.setMouth('smile');
  }

  Baby.prototype._build = function () {
    var skinMat = lambert(SKIN);
    this.skinMat = skinMat;
    this.outfitMat = lambert(this.outfitColor);

    /* --- 脚 --- */
    var legGeo = new THREE.CapsuleGeometry(0.085, 0.16, 6, 12);
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    var legMeshL = new THREE.Mesh(legGeo, skinMat);
    var legMeshR = new THREE.Mesh(legGeo, skinMat);
    legMeshL.position.y = -0.14;
    legMeshR.position.y = -0.14;
    // あんよ（くつ下風）
    var footGeo = new THREE.SphereGeometry(0.095, 12, 10);
    var footMatL = lambert(0xffffff);
    var footL = new THREE.Mesh(footGeo, footMatL);
    var footR = new THREE.Mesh(footGeo, footMatL);
    footL.position.set(0, -0.27, 0.03);
    footR.position.set(0, -0.27, 0.03);
    footL.scale.set(1, 0.8, 1.25);
    footR.scale.set(1, 0.8, 1.25);
    this.legL.add(legMeshL); this.legL.add(footL);
    this.legR.add(legMeshR); this.legR.add(footR);
    this.legL.position.set(-0.11, 0.34, 0);
    this.legR.position.set(0.11, 0.34, 0);
    this.root.add(this.legL);
    this.root.add(this.legR);

    /* --- 胴体（ロンパース） --- */
    this.torso = new THREE.Group();
    this.torso.position.y = 0.56;
    var bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.22, 8, 16), this.outfitMat);
    bodyMesh.scale.set(1, 1, 0.88);
    this.torso.add(bodyMesh);
    this.bodyMesh = bodyMesh;
    // ぽんぽんボタン
    for (var bi = 0; bi < 2; bi++) {
      var btn = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), lambert(0xffffff));
      btn.position.set(0, 0.05 - bi * 0.12, 0.205);
      this.torso.add(btn);
    }
    this.root.add(this.torso);

    /* --- うで --- */
    var armGeo = new THREE.CapsuleGeometry(0.07, 0.14, 6, 12);
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    var sleeveL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), this.outfitMat);
    var sleeveR = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), this.outfitMat);
    var armMeshL = new THREE.Mesh(armGeo, skinMat);
    var armMeshR = new THREE.Mesh(armGeo, skinMat);
    armMeshL.position.y = -0.13;
    armMeshR.position.y = -0.13;
    var handGeo = new THREE.SphereGeometry(0.075, 10, 10);
    var handL = new THREE.Mesh(handGeo, skinMat);
    var handR = new THREE.Mesh(handGeo, skinMat);
    handL.position.y = -0.24;
    handR.position.y = -0.24;
    this.armL.add(sleeveL); this.armL.add(armMeshL); this.armL.add(handL);
    this.armR.add(sleeveR); this.armR.add(armMeshR); this.armR.add(handR);
    this.armL.position.set(-0.24, 0.7, 0);
    this.armR.position.set(0.24, 0.7, 0);
    this.armL.rotation.z = 0.5;
    this.armR.rotation.z = -0.5;
    this.root.add(this.armL);
    this.root.add(this.armR);

    /* --- あたま --- */
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = 0.82;
    this.root.add(this.headPivot);
    this.head = new THREE.Group();
    this.head.position.y = 0.24;
    this.headPivot.add(this.head);

    var headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 20), skinMat);
    headMesh.scale.set(1, 0.95, 0.95);
    this.head.add(headMesh);
    this.headMesh = headMesh;

    // みみ
    var earGeo = new THREE.SphereGeometry(0.06, 10, 10);
    var earL = new THREE.Mesh(earGeo, skinMat);
    var earR = new THREE.Mesh(earGeo, skinMat);
    earL.position.set(-0.29, 0, 0);
    earR.position.set(0.29, 0, 0);
    this.head.add(earL); this.head.add(earR);

    // まえがみ（くるん）
    var curl = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 8, 14, Math.PI * 1.6), lambert(0x9c6b3f));
    curl.position.set(0, 0.29, 0.03);
    curl.rotation.set(0.4, 0, 0.8);
    this.head.add(curl);

    /* --- かお --- */
    var faceZ = 0.265;
    // め（ひらいた）
    var eyeGeo = new THREE.SphereGeometry(0.042, 10, 10);
    var eyeMat = lambert(0x3a2a20);
    this.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeL.position.set(-0.105, 0.045, faceZ);
    this.eyeR.position.set(0.105, 0.045, faceZ);
    var hiGeo = new THREE.SphereGeometry(0.013, 6, 6);
    var hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var hiL = new THREE.Mesh(hiGeo, hiMat);
    var hiR = new THREE.Mesh(hiGeo, hiMat);
    hiL.position.set(0.012, 0.015, 0.035);
    hiR.position.set(0.012, 0.015, 0.035);
    this.eyeL.add(hiL); this.eyeR.add(hiR);
    this.head.add(this.eyeL); this.head.add(this.eyeR);
    // め（にっこり ^ ^）
    var arcGeo = new THREE.TorusGeometry(0.045, 0.013, 6, 10, Math.PI);
    this.eyeHappyL = new THREE.Mesh(arcGeo, eyeMat);
    this.eyeHappyR = new THREE.Mesh(arcGeo, eyeMat);
    this.eyeHappyL.position.set(-0.105, 0.04, faceZ);
    this.eyeHappyR.position.set(0.105, 0.04, faceZ);
    this.eyeHappyL.visible = false;
    this.eyeHappyR.visible = false;
    this.head.add(this.eyeHappyL); this.head.add(this.eyeHappyR);
    // ねむりめ（下向きアーク）
    this.eyeSleepL = new THREE.Mesh(arcGeo, eyeMat);
    this.eyeSleepR = new THREE.Mesh(arcGeo, eyeMat);
    this.eyeSleepL.position.set(-0.105, 0.075, faceZ);
    this.eyeSleepR.position.set(0.105, 0.075, faceZ);
    this.eyeSleepL.rotation.z = Math.PI;
    this.eyeSleepR.rotation.z = Math.PI;
    this.eyeSleepL.visible = false;
    this.eyeSleepR.visible = false;
    this.head.add(this.eyeSleepL); this.head.add(this.eyeSleepR);

    // ほっぺ
    var cheekGeo = new THREE.SphereGeometry(0.05, 10, 10);
    var cheekMat = lambert(CHEEK);
    var cheekL = new THREE.Mesh(cheekGeo, cheekMat);
    var cheekR = new THREE.Mesh(cheekGeo, cheekMat);
    cheekL.position.set(-0.17, -0.045, 0.235);
    cheekR.position.set(0.17, -0.045, 0.235);
    cheekL.scale.set(1, 0.7, 0.5);
    cheekR.scale.set(1, 0.7, 0.5);
    this.head.add(cheekL); this.head.add(cheekR);

    // はな
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), lambert(0xffc9ab));
    nose.position.set(0, -0.005, 0.285);
    this.head.add(nose);

    // くち（3 種類を切り替え）
    var mouthMat = lambert(0xc9473f);
    this.mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 6, 12, Math.PI), mouthMat);
    this.mouthSmile.position.set(0, -0.075, 0.255);
    this.mouthSmile.rotation.z = Math.PI;
    this.head.add(this.mouthSmile);

    this.mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), lambert(0xa63a33));
    this.mouthOpen.position.set(0, -0.095, 0.245);
    this.mouthOpen.scale.set(1, 1.15, 0.5);
    this.head.add(this.mouthOpen);

    this.mouthO = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.014, 8, 12), mouthMat);
    this.mouthO.position.set(0, -0.09, 0.255);
    this.head.add(this.mouthO);

    this.mouthSad = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12, Math.PI), mouthMat);
    this.mouthSad.position.set(0, -0.12, 0.25);
    this.head.add(this.mouthSad);

    /* --- ぼうし --- */
    this.hats = {};
    this._buildHats();

    /* --- かげ --- */
    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    this.group.add(shadow);
    this.shadow = shadow;
  };

  Baby.prototype._buildHats = function () {
    var self = this;
    function addHat(name, g) {
      g.visible = false;
      self.head.add(g);
      self.hats[name] = g;
    }

    // キャップ
    var cap = new THREE.Group();
    var capTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.285, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
      lambert(0x4d9dff)
    );
    capTop.position.y = 0.08;
    var brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.03, 16), lambert(0x3b7fd6));
    brim.position.set(0, 0.14, 0.24);
    brim.rotation.x = 0.25;
    cap.add(capTop); cap.add(brim);
    addHat('cap', cap);

    // りぼん
    var bow = new THREE.Group();
    var bowMat = lambert(0xff6fa5);
    var loopL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), bowMat);
    var loopR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), bowMat);
    loopL.position.set(-0.1, 0.28, 0.02); loopL.scale.set(1.2, 0.75, 0.6);
    loopR.position.set(0.1, 0.28, 0.02); loopR.scale.set(1.2, 0.75, 0.6);
    var knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), lambert(0xe0538c));
    knot.position.set(0, 0.28, 0.03);
    bow.add(loopL); bow.add(loopR); bow.add(knot);
    addHat('bow', bow);

    // おうかん
    var crown = new THREE.Group();
    var crownMat = lambert(0xffd44d);
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.1, 16, 1, true), crownMat);
    band.position.y = 0.28;
    crown.add(band);
    for (var ci = 0; ci < 5; ci++) {
      var a = (ci / 5) * Math.PI * 2;
      var spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 8), crownMat);
      spike.position.set(Math.cos(a) * 0.165, 0.37, Math.sin(a) * 0.165);
      crown.add(spike);
      var gem = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), lambert(0xff5f6d));
      gem.position.set(Math.cos(a) * 0.185, 0.28, Math.sin(a) * 0.185);
      crown.add(gem);
    }
    addHat('crown', crown);

    // くまみみ
    var bear = new THREE.Group();
    var bearMat = lambert(0xa9744d);
    var innerMat = lambert(0xffc9d6);
    [-1, 1].forEach(function (s) {
      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), bearMat);
      ear.position.set(s * 0.2, 0.26, 0);
      var inner = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), innerMat);
      inner.position.set(s * 0.2, 0.26, 0.06);
      bear.add(ear); bear.add(inner);
    });
    addHat('bear', bear);

    // パーティーぼうし
    var party = new THREE.Group();
    var cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 16), lambert(0x9a6fff));
    cone.position.y = 0.4;
    var stripe = new THREE.Mesh(new THREE.TorusGeometry(0.096, 0.02, 8, 16), lambert(0xffd44d));
    stripe.position.y = 0.395;
    stripe.rotation.x = Math.PI / 2;
    var pom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), lambert(0xff6fa5));
    pom.position.y = 0.56;
    party.add(cone); party.add(stripe); party.add(pom);
    addHat('party', party);

    // おはな
    var flower = new THREE.Group();
    var fcenter = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), lambert(0xffb13d));
    fcenter.position.set(0.16, 0.26, 0.1);
    flower.add(fcenter);
    for (var fi = 0; fi < 6; fi++) {
      var fa = (fi / 6) * Math.PI * 2;
      var petal = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), lambert(0xffffff));
      petal.position.set(0.16 + Math.cos(fa) * 0.07, 0.26 + Math.sin(fa) * 0.07, 0.1);
      petal.scale.set(1, 1, 0.5);
      flower.add(petal);
    }
    addHat('flower', flower);
  };

  /* ---------- 表情 ---------- */

  Baby.prototype.setMouth = function (name) {
    this.mouthSmile.visible = name === 'smile';
    this.mouthOpen.visible = name === 'open';
    this.mouthO.visible = name === 'o';
    this.mouthSad.visible = name === 'sad';
  };

  Baby.prototype.setEyes = function (name) {
    // 'open' | 'happy' | 'sleep'
    var open = name === 'open';
    this.eyeL.visible = open;
    this.eyeR.visible = open;
    this.eyeHappyL.visible = name === 'happy';
    this.eyeHappyR.visible = name === 'happy';
    this.eyeSleepL.visible = name === 'sleep';
    this.eyeSleepR.visible = name === 'sleep';
    this.eyesClosed = name === 'sleep';
  };

  Baby.prototype.setMood = function (mood) {
    this.mood = mood;
    switch (mood) {
      case 'happy':
        this.setEyes('happy'); this.setMouth('smile'); break;
      case 'sleep':
        this.setEyes('sleep'); this.setMouth('o'); break;
      case 'sad':
        this.setEyes('open'); this.setMouth('sad'); break;
      case 'eat':
        this.setEyes('open'); this.setMouth('open'); break;
      case 'wow':
        this.setEyes('open'); this.setMouth('o'); break;
      default:
        this.setEyes('open'); this.setMouth('smile'); break;
    }
  };

  /* ---------- ポーズ ---------- */

  Baby.prototype.setPose = function (pose) {
    this.pose = pose;
    if (pose === 'sit') {
      this.root.position.y = -0.18;
      this.legL.rotation.x = -1.35;
      this.legR.rotation.x = -1.35;
    } else if (pose === 'lie') {
      this.root.position.y = 0;
      this.legL.rotation.x = -0.2;
      this.legR.rotation.x = -0.2;
    } else {
      this.root.position.y = 0;
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
    }
  };

  /* ---------- アクション ---------- */

  Baby.prototype.giggle = function () { this.giggleTime = 0.9; };
  Baby.prototype.chew = function () { this.chewTime = 0.9; };
  Baby.prototype.clap = function () { this.clapTime = 1.0; };
  Baby.prototype.wave = function () { this.waveTime = 1.4; };
  Baby.prototype.bounce = function () { this.bounceTime = 0.6; };

  /* ---------- きせかえ ---------- */

  Baby.prototype.setOutfitColor = function (hex) {
    this.outfitColor = hex;
    this.outfitMat.color.setHex(hex);
  };

  Baby.prototype.setHat = function (name) {
    this.hatName = name;
    for (var k in this.hats) this.hats[k].visible = (k === name);
  };

  /* ---------- よごれ（おふろ用） ---------- */

  Baby.prototype.addDirt = function (n) {
    this.clearDirt();
    var dirtMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a, transparent: true, opacity: 0.85 });
    for (var i = 0; i < n; i++) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.03, 8, 8), dirtMat.clone());
      m.scale.z = 0.3;
      var onHead = Math.random() < 0.45;
      var ang = (Math.random() - 0.5) * 2.2;
      if (onHead) {
        var hy = (Math.random() - 0.3) * 0.15;
        m.position.set(Math.sin(ang) * 0.27, hy, Math.cos(ang) * 0.27 * 0.95);
        m.lookAt(new THREE.Vector3(m.position.x * 2, m.position.y, m.position.z * 2));
        this.head.add(m);
      } else {
        var by = (Math.random() - 0.5) * 0.3;
        m.position.set(Math.sin(ang) * 0.22, by, Math.cos(ang) * 0.2);
        m.lookAt(new THREE.Vector3(m.position.x * 2, m.position.y, m.position.z * 2));
        this.torso.add(m);
      }
      this.dirtMeshes.push(m);
    }
  };

  Baby.prototype.clearDirt = function () {
    for (var i = 0; i < this.dirtMeshes.length; i++) {
      var m = this.dirtMeshes[i];
      if (m.parent) m.parent.remove(m);
    }
    this.dirtMeshes = [];
  };

  // ワールド座標 point の近くのよごれを 1 つ消す。消えたら true
  Baby.prototype.scrubAt = function (point, radius) {
    var tmp = new THREE.Vector3();
    for (var i = 0; i < this.dirtMeshes.length; i++) {
      var m = this.dirtMeshes[i];
      m.getWorldPosition(tmp);
      if (tmp.distanceTo(point) < radius) {
        m.material.opacity -= 0.4;
        if (m.material.opacity <= 0.05) {
          if (m.parent) m.parent.remove(m);
          this.dirtMeshes.splice(i, 1);
        }
        return true;
      }
    }
    return false;
  };

  /* ---------- 毎フレーム更新 ---------- */

  Baby.prototype.update = function (dt, t) {
    // こきゅう
    var breathSpeed = this.mood === 'sleep' ? 1.6 : 3.2;
    var breath = 1 + Math.sin(t * breathSpeed) * 0.018;
    this.torso.scale.set(breath, 1, breath);

    // まばたき（ねむってないとき）
    if (!this.eyesClosed && this.mood !== 'happy') {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkPhase = 0.14;
        this.blinkTimer = 1.8 + Math.random() * 2.6;
      }
      if (this.blinkPhase > 0) {
        this.blinkPhase -= dt;
        this.eyeL.scale.y = 0.12;
        this.eyeR.scale.y = 0.12;
      } else {
        this.eyeL.scale.y = 1;
        this.eyeR.scale.y = 1;
      }
    }

    // あたまのゆれ
    var headSway = Math.sin(t * 1.4) * 0.06;
    this.headPivot.rotation.z = headSway;
    this.headPivot.rotation.x = this.mood === 'sleep' ? 0.12 : Math.sin(t * 1.1) * 0.03;

    // うでのベース角度
    var armBaseL = 0.5, armBaseR = -0.5, armSwing = 0;
    if (this.mood === 'happy') { armBaseL = 2.4; armBaseR = -2.4; armSwing = Math.sin(t * 9) * 0.25; }
    else if (this.mood === 'sleep') { armBaseL = 0.25; armBaseR = -0.25; }
    else { armSwing = Math.sin(t * 2.2) * 0.08; }

    // はくしゅ
    if (this.clapTime > 0) {
      this.clapTime -= dt;
      var clap = Math.abs(Math.sin(this.clapTime * 18));
      this.armL.rotation.z = 1.5 - clap * 0.5;
      this.armR.rotation.z = -1.5 + clap * 0.5;
      this.armL.rotation.x = -1.2;
      this.armR.rotation.x = -1.2;
    } else if (this.waveTime > 0) {
      this.waveTime -= dt;
      this.armR.rotation.z = -2.6 + Math.sin(this.waveTime * 14) * 0.5;
      this.armL.rotation.z = armBaseL + armSwing;
      this.armL.rotation.x = 0;
      this.armR.rotation.x = 0;
    } else {
      this.armL.rotation.z = armBaseL + armSwing;
      this.armR.rotation.z = armBaseR - armSwing;
      this.armL.rotation.x = 0;
      this.armR.rotation.x = 0;
    }

    // きゃっきゃっ（くすぐり）
    if (this.giggleTime > 0) {
      this.giggleTime -= dt;
      var g = Math.sin(this.giggleTime * 24) * 0.14;
      this.root.rotation.z = g;
      var squash = 1 + Math.sin(this.giggleTime * 24) * 0.05;
      this.root.scale.set(2 - squash, squash, 1);
      this.root.scale.x = 1 / squash;
    } else {
      this.root.rotation.z *= 0.85;
      this.root.scale.set(1, 1, 1);
    }

    // ぴょんぴょん
    var poseY = this.pose === 'sit' ? -0.18 : 0;
    if (this.bounceTime > 0) {
      this.bounceTime -= dt;
      this.root.position.y = poseY + Math.abs(Math.sin(this.bounceTime * 10)) * 0.16;
    } else if (this.giggleTime <= 0) {
      this.root.position.y = poseY;
    }

    // もぐもぐ
    if (this.chewTime > 0) {
      this.chewTime -= dt;
      var open = Math.sin(this.chewTime * 16) > 0;
      if (this.mood === 'eat') this.setMouth(open ? 'open' : 'smile');
      this.headPivot.rotation.x = Math.sin(this.chewTime * 16) * 0.08;
      if (this.chewTime <= 0 && this.mood === 'eat') this.setMouth('smile');
    }
  };

  window.Baby = Baby;
})();
