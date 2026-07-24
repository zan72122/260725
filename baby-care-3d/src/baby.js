/* ============================================================
 * baby.js — 3D あかちゃんキャラクター（プロセス描写対応版）
 *  表情: idle/happy/sad/eat/wow/sleep + excited/pout/shy/surprised
 *  動作: まばたき/あくび/目こしこし/もぐもぐ/ちゅうちゅう/いやいや/
 *        はくしゅ/バイバイ/ぴょんぴょん/こっくり/いないいないばあ/ハイハイ/指差し
 *  みため: スタイ/服のシミ/口まわりの米粒・のり・食べかす/おむつ/
 *          レインコート/パジャマ/よごれ/歯（みがき用）
 * ============================================================ */
(function () {
  'use strict';

  var SKIN = 0xffdcc2;
  var CHEEK = 0xffa8b8;

  function lambert(color) { return new THREE.MeshLambertMaterial({ color: color }); }

  var STAIN_COLORS = { food: 0xc7702e, juice: 0x9a4fd0, milk: 0xf2ead8, mud: 0x7a5a3a, paint: 0x4d9dff };

  function Baby(opts) {
    opts = opts || {};
    this.group = new THREE.Group();      // 外側（アクティビティが自由に動かす）
    this.root = new THREE.Group();       // 内側（ポーズ用）
    this.group.add(this.root);

    this.mood = 'idle';
    this.pose = 'stand';
    this.crawling = false;
    this.blinkTimer = 1.5 + Math.random() * 2;
    this.blinkPhase = 0;
    this.giggleTime = 0;
    this.chewTime = 0;
    this.clapTime = 0;
    this.waveTime = 0;
    this.bounceTime = 0;
    this.yawnTime = 0;
    this.rubTime = 0;
    this.refuseTime = 0;
    this.peekPhase = 0;      // 0=off 1=かくれ中 2=ばあ！
    this.peekTimer = 0;
    this.peekCb = null;
    this.suckling = false;
    this.nodding = false;
    this.droop = 0;          // まぶたのおもさ 0..1
    this.eyesClosed = false;
    this.lookTarget = null;  // 視線追従先(world)
    this.pointTimer = 0;
    this.pointSide = 1;
    this.dirtMeshes = [];
    this.stainMeshes = [];
    this.riceMeshes = [];
    this.crumbMeshes = [];
    this.noriMesh = null;
    this.teethSpecks = [];
    this.teethGroup = null;
    this.hugged = null;
    this.outfitColor = opts.outfitColor || 0xffd44d;
    this.outfitStyle = 'normal';
    this.naked = false;
    this.bibOn = false;

    this._tmpV = new THREE.Vector3();
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
    // あんよ（くつ下風・ながぐつで色がかわる）
    this.footMat = lambert(0xffffff);
    var footGeo = new THREE.SphereGeometry(0.095, 12, 10);
    var footL = new THREE.Mesh(footGeo, this.footMat);
    var footR = new THREE.Mesh(footGeo, this.footMat);
    footL.position.set(0, -0.27, 0.03);
    footR.position.set(0, -0.27, 0.03);
    footL.scale.set(1, 0.8, 1.25);
    footR.scale.set(1, 0.8, 1.25);
    this.legL.add(legMeshL); this.legL.add(footL);
    this.legR.add(legMeshR); this.legR.add(footR);
    var legProxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    var legProxyL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), legProxyMat);
    var legProxyR = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), legProxyMat);
    legProxyL.position.y = -0.17;
    legProxyR.position.y = -0.17;
    this.legL.add(legProxyL);
    this.legR.add(legProxyR);
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
    this.buttons = [];
    for (var bi = 0; bi < 2; bi++) {
      var btn = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), lambert(0xffffff));
      btn.position.set(0, 0.05 - bi * 0.12, 0.205);
      this.torso.add(btn);
      this.buttons.push(btn);
    }
    // おむつ（はだかのとき）
    this.diaper = new THREE.Mesh(new THREE.SphereGeometry(0.235, 14, 12), lambert(0xffffff));
    this.diaper.scale.set(1.02, 0.62, 0.9);
    this.diaper.position.y = -0.12;
    this.diaper.visible = false;
    this.torso.add(this.diaper);
    // パジャマのほし
    this.pjStars = [];
    for (var si = 0; si < 3; si++) {
      var star = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.emojiTexture('⭐', 64), transparent: true }));
      star.scale.set(0.09, 0.09, 1);
      star.position.set(-0.12 + si * 0.12, 0.1 - (si % 2) * 0.2, 0.21);
      star.visible = false;
      this.torso.add(star);
      this.pjStars.push(star);
    }
    // スタイ（よだれかけ）
    this.bib = new THREE.Group();
    var bibMain = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), lambert(0xfffdf0));
    bibMain.scale.set(1.05, 1.0, 0.32);
    bibMain.position.set(0, 0.1, 0.16);
    this.bib.add(bibMain);
    var bibRim = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.02, 8, 16), lambert(0xff9dbf));
    bibRim.position.set(0, 0.21, 0.17);
    bibRim.rotation.x = 0.5;
    this.bib.add(bibRim);
    this.bib.visible = false;
    this.torso.add(this.bib);
    this.bibMain = bibMain;

    this.root.add(this.torso);

    /* --- うで --- */
    var armGeo = new THREE.CapsuleGeometry(0.07, 0.14, 6, 12);
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.sleeveL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), this.outfitMat);
    this.sleeveR = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), this.outfitMat);
    var armMeshL = new THREE.Mesh(armGeo, skinMat);
    var armMeshR = new THREE.Mesh(armGeo, skinMat);
    armMeshL.position.y = -0.13;
    armMeshR.position.y = -0.13;
    var handGeo = new THREE.SphereGeometry(0.075, 10, 10);
    this.handL = new THREE.Mesh(handGeo, skinMat);
    this.handR = new THREE.Mesh(handGeo, skinMat);
    this.handL.position.y = -0.24;
    this.handR.position.y = -0.24;
    this.armL.add(this.sleeveL); this.armL.add(armMeshL); this.armL.add(this.handL);
    this.armR.add(this.sleeveR); this.armR.add(armMeshR); this.armR.add(this.handR);
    // 見えないあたり判定（こどもの指でもさわりやすく）
    var limbProxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    var armProxyL = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8), limbProxyMat);
    var armProxyR = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8), limbProxyMat);
    armProxyL.position.y = -0.14;
    armProxyR.position.y = -0.14;
    this.armL.add(armProxyL);
    this.armR.add(armProxyR);
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

    // まえがみ（くるん）— ドライヤーでなびく
    this.curl = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 8, 14, Math.PI * 1.6), lambert(0x9c6b3f));
    this.curl.position.set(0, 0.29, 0.03);
    this.curl.rotation.set(0.4, 0, 0.8);
    this.head.add(this.curl);
    this.curlFlutter = 0;

    // レインコートのフード
    this.hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.325, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
      lambert(0xffd21f)
    );
    this.hood.position.y = 0.02;
    this.hood.visible = false;
    this.head.add(this.hood);

    /* --- かお --- */
    var faceZ = 0.265;
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

    // ほっぺ（ふくれっ面・てれで大きさが変わる）
    var cheekGeo = new THREE.SphereGeometry(0.05, 10, 10);
    this.cheekMat = lambert(CHEEK);
    this.cheekL = new THREE.Mesh(cheekGeo, this.cheekMat);
    this.cheekR = new THREE.Mesh(cheekGeo, this.cheekMat);
    this.cheekL.position.set(-0.17, -0.045, 0.235);
    this.cheekR.position.set(0.17, -0.045, 0.235);
    this.cheekBase = new THREE.Vector3(1, 0.7, 0.5);
    this.cheekL.scale.copy(this.cheekBase);
    this.cheekR.scale.copy(this.cheekBase);
    this.head.add(this.cheekL); this.head.add(this.cheekR);
    this.cheekScaleTarget = 1;

    // はな
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), lambert(0xffc9ab));
    nose.position.set(0, -0.005, 0.285);
    this.head.add(nose);

    // くち（4 種類を切り替え）
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

    // は（はみがき用・ふだんは非表示）
    this.teethGroup = new THREE.Group();
    var toothMat = lambert(0xffffff);
    for (var ti = 0; ti < 4; ti++) {
      var tooth = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.03, 0.02), toothMat);
      tooth.position.set(-0.048 + ti * 0.032, 0.035, 0);
      this.teethGroup.add(tooth);
    }
    this.teethGroup.position.set(0, -0.085, 0.26);
    this.teethGroup.visible = false;
    this.head.add(this.teethGroup);

    // いないいないばあの手（あかちゃん自身のて）
    var peekHandGeo = new THREE.SphereGeometry(0.085, 12, 10);
    this.peekHandL = new THREE.Mesh(peekHandGeo, skinMat);
    this.peekHandR = new THREE.Mesh(peekHandGeo, skinMat);
    this.peekHandL.position.set(-0.105, 0.045, 0.3);
    this.peekHandR.position.set(0.105, 0.045, 0.3);
    this.peekHandL.visible = false;
    this.peekHandR.visible = false;
    this.head.add(this.peekHandL); this.head.add(this.peekHandR);

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
    if (name !== 'open' && this.teethGroup) this.teethGroup.visible = false;
  };

  Baby.prototype.setEyes = function (name) {
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
    this.cheekScaleTarget = 1;
    this.cheekMat.color.setHex(CHEEK);
    switch (mood) {
      case 'happy':
        this.setEyes('happy'); this.setMouth('smile'); break;
      case 'excited':
        // わくわく：目キラキラ・口あけにこにこ・そわそわ（updateで小刻みゆれ）
        this.setEyes('happy'); this.setMouth('open'); break;
      case 'pout':
        // ふくれっ面：ほっぺぷくー・口ちいさく
        this.setEyes('open'); this.setMouth('o');
        this.cheekScaleTarget = 1.55; break;
      case 'shy':
        // てれ：ほっぺ大きくあかく
        this.setEyes('happy'); this.setMouth('smile');
        this.cheekScaleTarget = 1.4;
        this.cheekMat.color.setHex(0xff7f9a); break;
      case 'surprised':
        this.setEyes('open'); this.setMouth('o');
        this.bounce(); break;
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

  // まぶたのおもさ（0=ぱっちり 1=とじる寸前）
  Baby.prototype.setDroop = function (f) {
    this.droop = Math.max(0, Math.min(1, f));
  };

  /* ---------- ポーズ ---------- */

  Baby.prototype.setPose = function (pose) {
    this.pose = pose;
    this.crawling = false;
    this.root.rotation.x = 0;
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

  Baby.prototype.setCrawl = function (on) {
    this.crawling = on;
    if (on) {
      this.pose = 'crawl';
      this.root.rotation.x = 1.15;
      this.root.position.y = -0.32;
    } else {
      this.setPose('stand');
    }
  };

  /* ---------- アクション ---------- */

  Baby.prototype.giggle = function () { this.giggleTime = 0.9; };
  Baby.prototype.chew = function () { this.chewTime = 0.9; };
  Baby.prototype.clap = function () { this.clapTime = 1.0; };
  Baby.prototype.wave = function () { this.waveTime = 1.4; };
  Baby.prototype.bounce = function () { this.bounceTime = 0.6; };
  Baby.prototype.yawn = function () {
    this.yawnTime = 1.3;
    this.setMouth('open');
    SND.play('yawn');
  };
  Baby.prototype.rubEyes = function () { this.rubTime = 1.4; };
  Baby.prototype.refuse = function () { this.refuseTime = 1.0; SND.play('refuse'); };
  Baby.prototype.setSuckling = function (on) { this.suckling = on; };
  Baby.prototype.setNodding = function (on) { this.nodding = on; };

  Baby.prototype.peekaboo = function (cb) {
    if (this.peekPhase !== 0) return;
    this.peekPhase = 1;
    this.peekTimer = 1.2;
    this.peekCb = cb || null;
    this.peekHandL.visible = true;
    this.peekHandR.visible = true;
    SND.play('peekabooCall');
  };

  // てをのばして指差し（side: -1=ひだり 1=みぎ）
  Baby.prototype.pointTo = function (side, dur) {
    this.pointSide = side >= 0 ? 1 : -1;
    this.pointTimer = dur || 1.6;
  };

  Baby.prototype.hug = function (mesh) {
    this.hugged = mesh;
    if (mesh) {
      this.torso.add(mesh);
      mesh.position.set(0, 0.05, 0.3);
    }
  };

  Baby.prototype.releaseHug = function () {
    if (this.hugged && this.hugged.parent) this.hugged.parent.remove(this.hugged);
    this.hugged = null;
  };

  /* ---------- きせかえ ---------- */

  Baby.prototype.setOutfitColor = function (hex) {
    this.outfitColor = hex;
    if (!this.naked) this.outfitMat.color.setHex(hex);
  };

  Baby.prototype.setOutfitStyle = function (style) {
    this.outfitStyle = style;
    this.hood.visible = false;
    this.pjStars.forEach(function (s) { s.visible = false; });
    this.footMat.color.setHex(0xffffff);
    if (style === 'rain') {
      this.outfitMat.color.setHex(0xffd21f);
      this.hood.visible = !this.naked;
      this.footMat.color.setHex(0xe0433a); // ながぐつ
    } else if (style === 'pajama') {
      this.outfitMat.color.setHex(0x8f7fe8);
      var naked = this.naked;
      this.pjStars.forEach(function (s) { s.visible = !naked; });
    } else {
      this.outfitMat.color.setHex(this.outfitColor);
    }
  };

  Baby.prototype.setNaked = function (naked) {
    this.naked = naked;
    var showCloth = !naked;
    this.bodyMesh.material = naked ? this.skinMat : this.outfitMat;
    this.sleeveL.material = naked ? this.skinMat : this.outfitMat;
    this.sleeveR.material = naked ? this.skinMat : this.outfitMat;
    this.diaper.visible = naked;
    this.buttons.forEach(function (b) { b.visible = showCloth; });
    if (naked) {
      this.hood.visible = false;
      this.pjStars.forEach(function (s) { s.visible = false; });
      this.footMat.color.setHex(0xffffff);
      this.clearStains();
    } else {
      this.setOutfitStyle(this.outfitStyle);
    }
  };

  Baby.prototype.setHat = function (name) {
    this.hatName = name;
    for (var k in this.hats) this.hats[k].visible = (k === name);
  };

  Baby.prototype.setBib = function (on) {
    this.bibOn = on;
    this.bib.visible = on;
  };

  /* ---------- シミ（服・スタイ） ---------- */

  Baby.prototype.addStain = function (type) {
    var col = STAIN_COLORS[type] || STAIN_COLORS.food;
    var m = new THREE.Mesh(
      new THREE.SphereGeometry(0.035 + Math.random() * 0.025, 8, 8),
      new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.9 })
    );
    m.scale.z = 0.25;
    var parent = this.bibOn ? this.bib : this.torso;
    var zBase = this.bibOn ? 0.2 : 0.19;
    m.position.set((Math.random() - 0.5) * 0.24, 0.02 + (Math.random() - 0.5) * 0.2, zBase + 0.02);
    parent.add(m);
    this.stainMeshes.push(m);
    return m;
  };

  Baby.prototype.clearStains = function () {
    for (var i = 0; i < this.stainMeshes.length; i++) {
      var m = this.stainMeshes[i];
      if (m.parent) m.parent.remove(m);
    }
    this.stainMeshes = [];
  };

  /* ---------- 口まわり：米粒・のり・食べかす ---------- */

  Baby.prototype.addRice = function (n) {
    for (var i = 0; i < (n || 2); i++) {
      var g = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.015, 4, 6), lambert(0xffffff));
      var ang = (Math.random() - 0.5) * 1.4;
      g.position.set(Math.sin(ang) * 0.13, -0.06 - Math.random() * 0.07, 0.26);
      g.rotation.z = Math.random() * Math.PI;
      this.head.add(g);
      this.riceMeshes.push(g);
    }
  };

  Baby.prototype.eatRiceAt = function (worldPoint, radius) {
    for (var i = 0; i < this.riceMeshes.length; i++) {
      var m = this.riceMeshes[i];
      m.getWorldPosition(this._tmpV);
      if (this._tmpV.distanceTo(worldPoint) < radius) {
        this.head.remove(m);
        this.riceMeshes.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  Baby.prototype.addNori = function () {
    if (this.noriMesh) return;
    var m = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), lambert(0x2a4a2a));
    var side = Math.random() < 0.5 ? -1 : 1;
    m.position.set(side * 0.16, -0.03, 0.262);
    m.scale.set(1, 0.75, 1);
    this.head.add(m);
    this.noriMesh = m;
  };

  Baby.prototype.removeNori = function () {
    if (this.noriMesh) {
      this.head.remove(this.noriMesh);
      this.noriMesh = null;
      return true;
    }
    return false;
  };

  Baby.prototype.addCrumbDots = function (n) {
    for (var i = 0; i < (n || 3); i++) {
      var m = new THREE.Mesh(
        new THREE.SphereGeometry(0.014 + Math.random() * 0.01, 6, 6),
        new THREE.MeshLambertMaterial({ color: 0xa9744d, transparent: true, opacity: 0.95 })
      );
      var ang = (Math.random() - 0.5) * 1.8;
      m.position.set(Math.sin(ang) * 0.15, -0.05 - Math.random() * 0.09, 0.255);
      m.scale.z = 0.4;
      this.head.add(m);
      this.crumbMeshes.push(m);
    }
  };

  // おしぼりでひとふき：口まわりの汚れをへらす。ふけたら true
  Baby.prototype.wipeFacePass = function () {
    var did = false;
    if (this.crumbMeshes.length) {
      var m = this.crumbMeshes.pop();
      if (m.parent) m.parent.remove(m);
      did = true;
    } else if (this.noriMesh) {
      this.removeNori();
      did = true;
    } else if (this.riceMeshes.length) {
      var r = this.riceMeshes.pop();
      if (r.parent) r.parent.remove(r);
      did = true;
    }
    return did;
  };

  Baby.prototype.faceDirtyCount = function () {
    return this.crumbMeshes.length + this.riceMeshes.length + (this.noriMesh ? 1 : 0);
  };

  /* ---------- は（はみがき） ---------- */

  Baby.prototype.showTeeth = function (show, speckCount) {
    this.teethGroup.visible = show;
    if (show) {
      this.setMouth('open');
      this.mouthOpen.scale.set(1.5, 1.6, 0.5);
      this.teethGroup.visible = true;
      // よごれつぶ
      this.clearTeethSpecks();
      for (var i = 0; i < (speckCount || 3); i++) {
        var sp = new THREE.Mesh(
          new THREE.SphereGeometry(0.013, 6, 6),
          new THREE.MeshLambertMaterial({ color: 0x8a6a3a, transparent: true, opacity: 0.95 })
        );
        sp.position.set(-0.05 + Math.random() * 0.1, 0.03 + Math.random() * 0.02, 0.015);
        this.teethGroup.add(sp);
        this.teethSpecks.push(sp);
      }
    } else {
      this.mouthOpen.scale.set(1, 1.15, 0.5);
      this.clearTeethSpecks();
    }
  };

  Baby.prototype.clearTeethSpecks = function () {
    for (var i = 0; i < this.teethSpecks.length; i++) {
      if (this.teethSpecks[i].parent) this.teethSpecks[i].parent.remove(this.teethSpecks[i]);
    }
    this.teethSpecks = [];
  };

  Baby.prototype.brushAt = function (worldPoint, radius) {
    for (var i = 0; i < this.teethSpecks.length; i++) {
      var m = this.teethSpecks[i];
      m.getWorldPosition(this._tmpV);
      if (this._tmpV.distanceTo(worldPoint) < radius) {
        m.material.opacity -= 0.34;
        if (m.material.opacity <= 0.1) {
          if (m.parent) m.parent.remove(m);
          this.teethSpecks.splice(i, 1);
        }
        return true;
      }
    }
    return false;
  };

  /* ---------- よごれ（おふろ用・原因つき） ---------- */

  Baby.prototype.addDirtSpots = function (dirtList) {
    this.clearDirt();
    var CAUSE_COLORS = { food: 0xc7702e, play: 0x8a6a4a, mud: 0x6a4a2a, dust: 0xa39482 };
    for (var i = 0; i < dirtList.length; i++) {
      var d = dirtList[i];
      var col = CAUSE_COLORS[d.cause] || CAUSE_COLORS.dust;
      var m = new THREE.Mesh(
        new THREE.SphereGeometry(0.045 + Math.random() * 0.03, 8, 8),
        new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.85 })
      );
      m.scale.z = 0.3;
      var ang = (Math.random() - 0.5) * 2.0;
      if (d.zone === 'face') {
        // たべこぼしは口のまわり・むね
        if (Math.random() < 0.5) {
          m.position.set((Math.random() - 0.5) * 0.3, -0.08 - Math.random() * 0.08, 0.25);
          this.head.add(m);
        } else {
          m.position.set((Math.random() - 0.5) * 0.3, 0.1 + Math.random() * 0.1, 0.19);
          this.torso.add(m);
        }
      } else if (d.zone === 'hands') {
        // あそびよごれは、て・うで
        var arm = Math.random() < 0.5 ? this.armL : this.armR;
        m.position.set(0, -0.18 - Math.random() * 0.08, 0.05);
        arm.add(m);
      } else if (d.zone === 'feet') {
        // どろは、あし
        var leg = Math.random() < 0.5 ? this.legL : this.legR;
        m.position.set(0, -0.2 - Math.random() * 0.06, 0.06);
        leg.add(m);
      } else {
        m.position.set(Math.sin(ang) * 0.22, (Math.random() - 0.5) * 0.3, Math.cos(ang) * 0.19);
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

  Baby.prototype.scrubAt = function (point, radius) {
    for (var i = 0; i < this.dirtMeshes.length; i++) {
      var m = this.dirtMeshes[i];
      m.getWorldPosition(this._tmpV);
      if (this._tmpV.distanceTo(point) < radius) {
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

    // ほっぺ（ふくれ・てれ・ちゅうちゅう）
    var cheekS = this.cheekScaleTarget;
    if (this.suckling) cheekS = 1.1 + Math.abs(Math.sin(t * 8)) * 0.45;
    this.cheekL.scale.set(this.cheekBase.x * cheekS, this.cheekBase.y * cheekS, this.cheekBase.z);
    this.cheekR.scale.set(this.cheekBase.x * cheekS, this.cheekBase.y * cheekS, this.cheekBase.z);

    // まばたき + まぶたのおもさ
    if (!this.eyesClosed && this.eyeL.visible) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkPhase = 0.14;
        this.blinkTimer = 1.8 + Math.random() * 2.6;
      }
      var baseScaleY = 1 - this.droop * 0.72;
      if (this.blinkPhase > 0) {
        this.blinkPhase -= dt;
        this.eyeL.scale.y = 0.12;
        this.eyeR.scale.y = 0.12;
      } else {
        this.eyeL.scale.y = baseScaleY;
        this.eyeR.scale.y = baseScaleY;
      }
      if (this.mood === 'surprised') {
        this.eyeL.scale.set(1.35, 1.35, 1.35);
        this.eyeR.scale.set(1.35, 1.35, 1.35);
      } else {
        this.eyeL.scale.x = 1; this.eyeL.scale.z = 1;
        this.eyeR.scale.x = 1; this.eyeR.scale.z = 1;
      }
    }

    // あたま：視線追従 or ゆらゆら
    if (this.lookTarget) {
      // 対象のローカル方向をもとめて、くびをかたむける
      this._tmpV.copy(this.lookTarget);
      this.headPivot.parent.worldToLocal(this._tmpV);
      this._tmpV.sub(this.headPivot.position);
      var yaw = Math.atan2(this._tmpV.x, Math.max(0.001, this._tmpV.z));
      var pitch = -Math.atan2(this._tmpV.y - 0.24, Math.sqrt(this._tmpV.x * this._tmpV.x + this._tmpV.z * this._tmpV.z));
      yaw = Math.max(-0.7, Math.min(0.7, yaw));
      pitch = Math.max(-0.5, Math.min(0.5, pitch));
      this.headPivot.rotation.y += (yaw - this.headPivot.rotation.y) * Math.min(1, dt * 6);
      this.headPivot.rotation.x += (pitch - this.headPivot.rotation.x) * Math.min(1, dt * 6);
      this.headPivot.rotation.z *= 0.9;
    } else if (this.refuseTime > 0) {
      // いやいや（くびを左右にぶんぶん）
      this.refuseTime -= dt;
      this.headPivot.rotation.y = Math.sin(this.refuseTime * 22) * 0.5;
    } else if (this.nodding) {
      // こっくりこっくり
      var nod = (Math.sin(t * 1.4) + 1) * 0.5;          // 0..1 ゆっくりおちる
      var jerk = Math.max(0, Math.sin(t * 1.4 + 2.8)) * 0.3;
      this.headPivot.rotation.x = nod * 0.5 - jerk;
      this.headPivot.rotation.y *= 0.9;
      this.headPivot.rotation.z = Math.sin(t * 0.7) * 0.04;
    } else {
      var headSway = Math.sin(t * 1.4) * 0.06;
      this.headPivot.rotation.z = headSway;
      this.headPivot.rotation.x = this.mood === 'sleep' ? 0.12 : Math.sin(t * 1.1) * 0.03;
      this.headPivot.rotation.y *= 0.92;
      if (this.crawling) this.headPivot.rotation.x = -0.95;
    }

    // いないいないばあ
    if (this.peekPhase === 1) {
      this.peekTimer -= dt;
      this.armL.rotation.z = 2.6;
      this.armR.rotation.z = -2.6;
      this.armL.rotation.x = -0.9;
      this.armR.rotation.x = -0.9;
      if (this.peekTimer <= 0) {
        this.peekPhase = 2;
        this.peekTimer = 1.0;
        this.peekHandL.visible = false;
        this.peekHandR.visible = false;
        this.setMood('excited');
        SND.play('peekabooBaa');
        if (this.peekCb) this.peekCb();
      }
      return this._afterPose(dt, t);
    }
    if (this.peekPhase === 2) {
      this.peekTimer -= dt;
      this.armL.rotation.z = 2.3 + Math.sin(t * 10) * 0.2;
      this.armR.rotation.z = -2.3 - Math.sin(t * 10) * 0.2;
      this.armL.rotation.x = 0;
      this.armR.rotation.x = 0;
      if (this.peekTimer <= 0) this.peekPhase = 0;
      return this._afterPose(dt, t);
    }

    // 目こしこし
    if (this.rubTime > 0) {
      this.rubTime -= dt;
      this.armL.rotation.z = 2.5 + Math.sin(this.rubTime * 20) * 0.12;
      this.armR.rotation.z = -2.5 - Math.sin(this.rubTime * 20) * 0.12;
      this.armL.rotation.x = -0.85;
      this.armR.rotation.x = -0.85;
      return this._afterPose(dt, t);
    }

    // あくび（のび〜）
    if (this.yawnTime > 0) {
      this.yawnTime -= dt;
      this.armL.rotation.z = 2.9;
      this.armR.rotation.z = -2.9;
      this.armL.rotation.x = 0;
      this.armR.rotation.x = 0;
      this.headPivot.rotation.x = -0.25;
      if (this.yawnTime <= 0 && this.mouthOpen.visible) this.setMouth(this.mood === 'sleep' ? 'o' : 'smile');
      return this._afterPose(dt, t);
    }

    // ハイハイのてあし
    if (this.crawling) {
      var paddle = Math.sin(t * 7);
      this.armL.rotation.x = -1.45 + paddle * 0.35;
      this.armR.rotation.x = -1.45 - paddle * 0.35;
      this.armL.rotation.z = 0.15;
      this.armR.rotation.z = -0.15;
      this.legL.rotation.x = -1.2 - paddle * 0.3;
      this.legR.rotation.x = -1.2 + paddle * 0.3;
      return this._afterPose(dt, t);
    }

    // うでのベース角度
    var armBaseL = 0.5, armBaseR = -0.5, armSwing = 0;
    if (this.mood === 'happy') { armBaseL = 2.4; armBaseR = -2.4; armSwing = Math.sin(t * 9) * 0.25; }
    else if (this.mood === 'excited') { armBaseL = 2.0; armBaseR = -2.0; armSwing = Math.sin(t * 12) * 0.35; }
    else if (this.mood === 'shy') { armBaseL = 1.9; armBaseR = -1.9; armSwing = Math.sin(t * 5) * 0.08; }
    else if (this.mood === 'pout') { armBaseL = 0.15; armBaseR = -0.15; }
    else if (this.mood === 'sleep') { armBaseL = 0.25; armBaseR = -0.25; }
    else { armSwing = Math.sin(t * 2.2) * 0.08; }

    // 指差し（pointTimer中は片うでを前へ）
    if (this.pointTimer > 0) {
      this.pointTimer -= dt;
      var pArm = this.pointSide > 0 ? this.armR : this.armL;
      var oArm = this.pointSide > 0 ? this.armL : this.armR;
      pArm.rotation.x = -1.35;
      pArm.rotation.z = this.pointSide > 0 ? -0.7 : 0.7;
      oArm.rotation.x = 0;
      oArm.rotation.z = this.pointSide > 0 ? armBaseL : armBaseR;
      return this._afterPose(dt, t);
    }

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
    } else if (this.hugged) {
      // だっこ（くまさんをぎゅっ）
      this.armL.rotation.z = 1.15;
      this.armR.rotation.z = -1.15;
      this.armL.rotation.x = -1.0;
      this.armR.rotation.x = -1.0;
    } else {
      this.armL.rotation.z = armBaseL + armSwing;
      this.armR.rotation.z = armBaseR - armSwing;
      this.armL.rotation.x = 0;
      this.armR.rotation.x = 0;
    }

    this._afterPose(dt, t);
  };

  Baby.prototype._afterPose = function (dt, t) {
    // ふくれっ面はかおをそむける
    if (this.mood === 'pout' && !this.lookTarget) {
      this.headPivot.rotation.y += (0.55 - this.headPivot.rotation.y) * Math.min(1, dt * 5);
    }

    // きゃっきゃっ（くすぐり）
    if (this.giggleTime > 0) {
      this.giggleTime -= dt;
      var g = Math.sin(this.giggleTime * 24) * 0.14;
      this.root.rotation.z = g;
      var squash = 1 + Math.sin(this.giggleTime * 24) * 0.05;
      this.root.scale.set(1 / squash, squash, 1);
    } else {
      this.root.rotation.z *= 0.85;
      this.root.scale.set(1, 1, 1);
    }

    // そわそわ（わくわく）
    var fidget = 0;
    if (this.mood === 'excited') fidget = Math.abs(Math.sin(t * 10)) * 0.06;
    if (this.mood === 'shy') this.root.rotation.z = Math.sin(t * 3) * 0.06;

    // ぴょんぴょん
    var poseY = this.pose === 'sit' ? -0.18 : this.pose === 'crawl' ? -0.32 : 0;
    if (this.bounceTime > 0) {
      this.bounceTime -= dt;
      this.root.position.y = poseY + Math.abs(Math.sin(this.bounceTime * 10)) * 0.16;
    } else if (this.giggleTime <= 0) {
      this.root.position.y = poseY + fidget;
    }

    // もぐもぐ
    if (this.chewTime > 0) {
      this.chewTime -= dt;
      var open = Math.sin(this.chewTime * 16) > 0;
      if (this.mood === 'eat') this.setMouth(open ? 'open' : 'smile');
      if (!this.lookTarget) this.headPivot.rotation.x = Math.sin(this.chewTime * 16) * 0.08;
      if (this.chewTime <= 0 && this.mood === 'eat') this.setMouth('smile');
    }

    // まえがみのなびき（ドライヤー）
    if (this.curlFlutter > 0) {
      this.curlFlutter -= dt;
      this.curl.rotation.z = 0.8 + Math.sin(t * 30) * 0.6;
      this.curl.scale.y = 1 + Math.abs(Math.sin(t * 25)) * 0.5;
    } else {
      this.curl.rotation.z = 0.8;
      this.curl.scale.y = 1;
    }
  };

  window.Baby = Baby;
})();
