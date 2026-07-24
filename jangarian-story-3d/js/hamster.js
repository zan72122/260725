/* ===== じゃんがりあん ものがたり : ハムスターづくり ===== */
window.JG = window.JG || {};

JG.Hamster = (function () {
  var U = JG.U;

  // 帽子リスト (レベルアップでふえていく)
  var HATS = [
    { id: 'none',   name: 'なし' },
    { id: 'straw',  name: 'いちごぼうし 🍓' },
    { id: 'ribbon', name: 'りぼん 🎀' },
    { id: 'crown',  name: 'おうかん 👑' },
    { id: 'wizard', name: 'まほうのぼうし 🪄' },
    { id: 'flower', name: 'おはなのぼうし 🌸' }
  ];

  function lam(color) { return new THREE.MeshLambertMaterial({ color: color }); }

  // ---------- 帽子 ----------
  function buildHat(id) {
    var g = new THREE.Group();
    if (id === 'straw') {
      var cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 12), lam(0xff4d6a));
      cone.position.y = 0.25;
      g.add(cone);
      for (var i = 0; i < 5; i++) {
        var dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), lam(0xfff3b0));
        var a = i * 2.3;
        dot.position.set(Math.cos(a) * 0.24, 0.18 + (i % 3) * 0.11, Math.sin(a) * 0.24);
        g.add(dot);
      }
      var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 6), lam(0x4caf50));
      leaf.position.y = 0.52;
      g.add(leaf);
    } else if (id === 'ribbon') {
      var mid = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), lam(0xff5c8a));
      mid.position.y = 0.1;
      var l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), lam(0xff7aa8));
      l.scale.set(1.25, 0.7, 0.55);
      l.position.set(-0.24, 0.1, 0);
      var r = l.clone();
      r.position.x = 0.24;
      g.add(mid, l, r);
    } else if (id === 'crown') {
      var band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.2, 10), lam(0xffcf33));
      band.position.y = 0.1;
      g.add(band);
      for (var j = 0; j < 5; j++) {
        var spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 6), lam(0xffcf33));
        var aa = (j / 5) * Math.PI * 2;
        spike.position.set(Math.cos(aa) * 0.28, 0.28, Math.sin(aa) * 0.28);
        g.add(spike);
      }
      var gem = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), lam(0xff4d6a));
      gem.position.set(0, 0.14, 0.32);
      g.add(gem);
    } else if (id === 'wizard') {
      var hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.75, 12), lam(0x7a5cff));
      hat.position.y = 0.36;
      hat.rotation.z = 0.18;
      var brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.06, 14), lam(0x6248d8));
      brim.position.y = 0.03;
      var star = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), lam(0xfff06a));
      star.position.set(0.12, 0.5, 0.3);
      g.add(hat, brim, star);
    } else if (id === 'flower') {
      var cen = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lam(0xffcf33));
      cen.position.y = 0.12;
      g.add(cen);
      for (var k = 0; k < 6; k++) {
        var pet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), lam(0xff9ec4));
        var ab = (k / 6) * Math.PI * 2;
        pet.scale.set(1.4, 0.5, 0.8);
        pet.position.set(Math.cos(ab) * 0.2, 0.12, Math.sin(ab) * 0.2);
        pet.rotation.y = -ab;
        g.add(pet);
      }
    }
    return g;
  }

  // ---------- ハムスター本体 ----------
  // opts: { bodyColor, bellyColor, stripe (bool), earColor, scale }
  function create(opts) {
    opts = opts || {};
    var bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : 0xb9a89a;
    var bellyColor = opts.bellyColor !== undefined ? opts.bellyColor : 0xf7f2e9;
    var earColor = opts.earColor !== undefined ? opts.earColor : 0x8f7f70;
    var withStripe = opts.stripe !== undefined ? opts.stripe : true;
    var scale = opts.scale || 1;

    var root = new THREE.Group();
    var bodyG = new THREE.Group();   // ぼよんぼよん用
    root.add(bodyG);

    // からだ
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), lam(bodyColor));
    body.scale.set(1, 0.88, 1.22);
    body.position.y = 0.56;
    bodyG.add(body);

    // おなか
    var belly = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), lam(bellyColor));
    belly.scale.set(0.85, 0.72, 1.05);
    belly.position.set(0, 0.44, 0.12);
    bodyG.add(belly);

    // せなかのしましま (ジャンガリアンのしるし)
    if (withStripe) {
      var stripe = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), lam(0x6b5b4f));
      stripe.scale.set(0.16, 0.62, 1.12);
      stripe.position.y = 0.72;
      bodyG.add(stripe);
    }

    // あたま
    var headG = new THREE.Group();
    headG.position.set(0, 0.86, 0.62);
    bodyG.add(headG);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), lam(bodyColor));
    head.scale.set(1, 0.92, 0.95);
    headG.add(head);

    // くち・はな
    var muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), lam(bellyColor));
    muzzle.position.set(0, -0.12, 0.36);
    headG.add(muzzle);
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), lam(0xe58a9a));
    nose.position.set(0, -0.02, 0.55);
    headG.add(nose);

    // め (まばたきでつぶれる)
    var eyeGeo = new THREE.SphereGeometry(0.085, 10, 10);
    var eyeMat = lam(0x241a14);
    var eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.21, 0.1, 0.4);
    var eyeR = eyeL.clone();
    eyeR.position.x = 0.21;
    headG.add(eyeL, eyeR);
    var glintGeo = new THREE.SphereGeometry(0.028, 6, 6);
    var glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var glintL = new THREE.Mesh(glintGeo, glintMat);
    glintL.position.set(-0.185, 0.135, 0.47);
    var glintR = glintL.clone();
    glintR.position.x = 0.245;
    headG.add(glintL, glintR);

    // みみ
    var earGeo = new THREE.SphereGeometry(0.16, 10, 10);
    var earL = new THREE.Mesh(earGeo, lam(earColor));
    earL.scale.set(1, 1.05, 0.5);
    earL.position.set(-0.3, 0.42, -0.02);
    var earR = earL.clone();
    earR.position.x = 0.3;
    headG.add(earL, earR);
    var earInGeo = new THREE.SphereGeometry(0.08, 8, 8);
    var earInL = new THREE.Mesh(earInGeo, lam(0xf0b8c0));
    earInL.scale.set(1, 1, 0.4);
    earInL.position.set(-0.3, 0.4, 0.05);
    var earInR = earInL.clone();
    earInR.position.x = 0.3;
    headG.add(earInL, earInR);

    // ほっぺぶくろ (たねでふくらむ!)
    var cheekGeo = new THREE.SphereGeometry(0.17, 10, 10);
    var cheekL = new THREE.Mesh(cheekGeo, lam(bellyColor));
    cheekL.position.set(-0.3, -0.1, 0.28);
    var cheekR = cheekL.clone();
    cheekR.position.x = 0.3;
    headG.add(cheekL, cheekR);

    // ほっぺのぴんく
    var blushGeo = new THREE.SphereGeometry(0.07, 8, 8);
    var blushMat = lam(0xffa8b8);
    var blushL = new THREE.Mesh(blushGeo, blushMat);
    blushL.scale.set(1, 0.7, 0.4);
    blushL.position.set(-0.34, 0.02, 0.34);
    var blushR = blushL.clone();
    blushR.position.x = 0.34;
    headG.add(blushL, blushR);

    // あし 4ほん
    var footGeo = new THREE.SphereGeometry(0.13, 8, 8);
    var footMat = lam(0xe9d8c8);
    var feet = [];
    var footPos = [
      [-0.3, 0.1, 0.42], [0.3, 0.1, 0.42],
      [-0.32, 0.1, -0.34], [0.32, 0.1, -0.34]
    ];
    for (var i = 0; i < 4; i++) {
      var f = new THREE.Mesh(footGeo, footMat);
      f.scale.set(1, 0.7, 1.25);
      f.position.set(footPos[i][0], footPos[i][1], footPos[i][2]);
      f.userData.baseZ = footPos[i][2];
      f.userData.baseY = footPos[i][1];
      root.add(f);
      feet.push(f);
    }

    // しっぽ
    var tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), lam(bellyColor));
    tail.position.set(0, 0.42, -0.72);
    bodyG.add(tail);

    // ぼうしのつけね
    var hatAnchor = new THREE.Group();
    hatAnchor.position.set(0, 0.48, 0.05);
    headG.add(hatAnchor);

    root.scale.setScalar(scale);

    var h = {
      group: root,
      bodyG: bodyG,
      headG: headG,
      eyeL: eyeL, eyeR: eyeR,
      earL: earL, earR: earR,
      cheekL: cheekL, cheekR: cheekR,
      feet: feet,
      hatAnchor: hatAnchor,
      hatMesh: null,
      // アニメ状態
      blinkTimer: U.rand(1.5, 4),
      blinkPhase: 0,
      earTimer: U.rand(2, 6),
      earPhase: 0,
      cheekLevel: 0,       // 0..1 ほっぺのふくらみ
      cheekPulse: 0,
      idleTimer: U.rand(4, 9),
      idleKind: 0,
      idlePhase: 0,
      t: Math.random() * 10
    };

    h.setHat = function (index) {
      if (h.hatMesh) {
        hatAnchor.remove(h.hatMesh);
        h.hatMesh = null;
      }
      var def = HATS[index];
      if (def && def.id !== 'none') {
        h.hatMesh = buildHat(def.id);
        hatAnchor.add(h.hatMesh);
      }
    };

    // moving01: 0=とまってる 1=はしってる / allowIdle: かわいい待機アクション
    h.update = function (dt, moving01, allowIdle) {
      h.t += dt;
      var t = h.t;

      // はしりアニメ
      var runSpeed = 13;
      var amp = moving01;
      var s = Math.sin(t * runSpeed);
      for (var i = 0; i < 4; i++) {
        var ph = (i === 0 || i === 3) ? s : -s;
        h.feet[i].position.z = h.feet[i].userData.baseZ + ph * 0.16 * amp;
        h.feet[i].position.y = h.feet[i].userData.baseY + Math.max(0, ph) * 0.09 * amp;
      }
      // ぼよんぼよん
      var bob = Math.abs(Math.sin(t * runSpeed * 0.5)) * 0.09 * amp;
      h.bodyG.position.y = bob;
      h.bodyG.rotation.x = -amp * 0.08;

      // まばたき
      h.blinkTimer -= dt;
      if (h.blinkTimer <= 0) {
        h.blinkPhase = 0.14;
        h.blinkTimer = U.rand(1.8, 4.5);
      }
      if (h.blinkPhase > 0) {
        h.blinkPhase -= dt;
        h.eyeL.scale.y = 0.12;
        h.eyeR.scale.y = 0.12;
      } else {
        h.eyeL.scale.y = 1;
        h.eyeR.scale.y = 1;
      }

      // みみピクピク
      h.earTimer -= dt;
      if (h.earTimer <= 0) {
        h.earPhase = 0.5;
        h.earTimer = U.rand(2.5, 7);
      }
      if (h.earPhase > 0) {
        h.earPhase -= dt;
        var w = Math.sin(h.earPhase * 40) * 0.25;
        h.earL.rotation.z = 0.15 + w;
        h.earR.rotation.z = -0.15 - w;
      } else {
        h.earL.rotation.z = 0;
        h.earR.rotation.z = 0;
      }

      // ほっぺのふくらみ
      var target = 1 + h.cheekLevel * 1.1;
      if (h.cheekPulse > 0) {
        h.cheekPulse -= dt;
        target += Math.sin(h.cheekPulse * 30) * 0.18;
      }
      var cs = U.lerp(h.cheekL.scale.x, target, U.damp(10, dt));
      h.cheekL.scale.setScalar(cs);
      h.cheekR.scale.setScalar(cs);

      // かわいい待機アクション
      if (allowIdle && amp < 0.05) {
        h.idleTimer -= dt;
        if (h.idleTimer <= 0) {
          h.idleKind = U.randInt(0, 2);
          h.idlePhase = 1.6;
          h.idleTimer = U.rand(5, 10);
        }
      }
      if (h.idlePhase > 0 && amp < 0.3) {
        h.idlePhase -= dt;
        var k = Math.max(0, h.idlePhase);
        if (h.idleKind === 0) {
          // たちあがってきょろきょろ
          h.bodyG.rotation.x = -0.55 * Math.min(1, (1.6 - k) * 3, k * 3);
          h.headG.rotation.y = Math.sin(k * 6) * 0.4;
        } else if (h.idleKind === 1) {
          // かおをあらう (もしゃもしゃ)
          h.headG.rotation.x = 0.3 + Math.sin(k * 26) * 0.1;
        } else {
          // ぷるぷる
          h.bodyG.rotation.z = Math.sin(k * 24) * 0.09;
        }
      } else if (amp < 0.3) {
        h.headG.rotation.x *= 0.9;
        h.headG.rotation.y *= 0.9;
        h.bodyG.rotation.z *= 0.9;
      } else {
        h.headG.rotation.x = 0;
        h.headG.rotation.y = 0;
        h.bodyG.rotation.z = 0;
      }
    };

    return h;
  }

  return { create: create, HATS: HATS, buildHat: buildHat };
})();
