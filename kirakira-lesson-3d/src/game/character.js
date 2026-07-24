/* ============================================================
 * character.js — おんなのこ の 3Dモデル と うごき
 *   ほね（グループ）で できていて、ふく・かみ は スロット に さしこむ。
 * ============================================================ */
function Character(opts) {
  'use strict';
  opts = opts || {};
  var P = WARDROBE.P;
  var self = this;

  this.group = new THREE.Group();
  this.outfit = null;
  this.expr = 'normal';
  this.blinkT = U.rand(1.5, 4);
  this.time = 0;
  this.walkSpeed = 0;
  this.walkPhase = 0;
  this.act = null;
  this.lookTarget = null;
  this.lookAmount = 0;
  this.skin = opts.skin || P.skin;
  this.headTilt = 0;

  /* ================= ほね ================= */

  var body = new THREE.Group();          // ぜんたい の うわした ゆれ
  this.body = body;
  this.group.add(body);

  var hips = new THREE.Group();
  hips.position.y = P.hipY;
  body.add(hips);
  this.hips = hips;

  var slotHips = new THREE.Group();
  hips.add(slotHips);
  this.slotHips = slotHips;

  // あし
  function makeLeg(side) {
    var leg = new THREE.Group();
    leg.position.set(side * P.hipX, 0, 0);
    var thigh = B.cyl(0.078, 0.07, P.thigh, self.skin, { unique: true, seg: 12 });
    thigh.position.y = -P.thigh / 2;
    leg.add(thigh);
    var knee = new THREE.Group();
    knee.position.y = -P.thigh;
    leg.add(knee);
    var shin = B.cyl(0.068, 0.06, P.shin, self.skin, { unique: true, seg: 12 });
    shin.position.y = -P.shin / 2;
    knee.add(shin);
    var foot = new THREE.Group();
    foot.position.y = -P.shin;
    knee.add(foot);
    var bare = B.roundBox(0.12, 0.075, 0.2, 0.035, self.skin, { unique: true });
    bare.position.set(0, -0.01, 0.03);
    foot.add(bare);
    var slot = new THREE.Group();
    foot.add(slot);
    return { root: leg, knee: knee, foot: foot, slot: slot, bare: bare };
  }

  var legL = makeLeg(-1), legR = makeLeg(1);
  hips.add(legL.root); hips.add(legR.root);
  this.legL = legL; this.legR = legR;
  this.slotFootL = legL.slot; this.slotFootR = legR.slot;

  // どうたい
  var torso = new THREE.Group();
  hips.add(torso);
  this.torso = torso;

  var torsoMesh = B.capsule(P.torsoR * 0.9, (P.torsoTop - P.torsoBot) * 0.75, this.skin, { unique: true });
  torsoMesh.position.y = (P.torsoTop - P.torsoBot) / 2;
  torso.add(torsoMesh);
  this.torsoMesh = torsoMesh;

  var slotTorso = new THREE.Group();
  torso.add(slotTorso);
  this.slotTorso = slotTorso;

  var slotBack = new THREE.Group();
  torso.add(slotBack);
  this.slotBack = slotBack;

  // うで
  function makeArm(side) {
    var arm = new THREE.Group();
    arm.position.set(side * P.shoulderX, P.shoulderY - P.hipY, 0);
    var upper = B.cyl(0.055, 0.05, P.upperArm, self.skin, { unique: true, seg: 10 });
    upper.position.y = -P.upperArm / 2;
    arm.add(upper);
    var elbow = new THREE.Group();
    elbow.position.y = -P.upperArm;
    arm.add(elbow);
    var fore = B.cyl(0.05, 0.045, P.foreArm, self.skin, { unique: true, seg: 10 });
    fore.position.y = -P.foreArm / 2;
    elbow.add(fore);
    var hand = new THREE.Group();
    hand.position.y = -P.foreArm;
    elbow.add(hand);
    var palm = B.sphere(P.handR, self.skin, { seg: 10, unique: true });
    palm.scale.set(1, 1.15, 0.75);
    hand.add(palm);
    var slot = new THREE.Group();
    arm.add(slot);
    var holdSlot = new THREE.Group();
    holdSlot.position.y = -P.handR * 1.4;
    hand.add(holdSlot);
    return { root: arm, elbow: elbow, hand: hand, slot: slot, hold: holdSlot };
  }

  var armL = makeArm(-1), armR = makeArm(1);
  torso.add(armL.root); torso.add(armR.root);
  this.armL = armL; this.armR = armR;
  this.slotArmL = armL.slot; this.slotArmR = armR.slot;

  // くび と あたま
  var neck = B.cyl(0.06, 0.07, 0.08, this.skin, { unique: true, seg: 10 });
  neck.position.y = P.neckY - P.hipY - 0.02;
  torso.add(neck);

  var head = new THREE.Group();
  head.position.y = P.headY - P.hipY;
  torso.add(head);
  this.head = head;

  var skull = B.sphere(P.headR, this.skin, { seg: 28, unique: true });
  head.add(skull);
  this.skull = skull;

  var slotHead = new THREE.Group();
  head.add(slotHead);
  this.slotHead = slotHead;

  var hairSlot = new THREE.Group();
  head.add(hairSlot);
  this.hairSlot = hairSlot;

  // みみ
  for (var es = -1; es <= 1; es += 2) {
    var ear = B.sphere(0.055, this.skin, { seg: 10, unique: true });
    ear.scale.set(0.5, 1, 0.7);
    ear.position.set(es * P.headR * 0.97, -0.02, -0.01);
    head.add(ear);
  }

  /* ================= かお ================= *
   * かおの パーツは ぜんぶ「たいらな しるし」。
   * あたま の きゅうめん の うえに、そとむき に はりつける。
   * MeshBasicMaterial なので ひかり に よらず いつも はっきり みえる。
   * ============================================ */

  var face = new THREE.Group();
  head.add(face);
  this.face = face;

  var _fwd = new THREE.Vector3(0, 0, 1);

  // きゅうめん の うえに おく グループ を つくる
  function onHead(dx, dy, dz, dist) {
    var g = new THREE.Group();
    var n = new THREE.Vector3(dx, dy, dz).normalize();
    g.position.copy(n).multiplyScalar(dist != null ? dist : P.headR + 0.002);
    g.quaternion.setFromUnitVectors(_fwd, n);
    return g;
  }

  function flat(geometry, color, opacity) {
    var m = new THREE.MeshBasicMaterial({
      color: color, transparent: opacity != null && opacity < 1,
      opacity: opacity != null ? opacity : 1, side: THREE.DoubleSide,
      depthWrite: opacity == null || opacity >= 1
    });
    m.__unique = true;
    var mesh = new THREE.Mesh(geometry, m);
    return mesh;
  }

  function disc(r, color, opacity) {
    var g = new THREE.CircleGeometry(r, 26);
    return flat(g, color, opacity);
  }

  function halfDisc(r, color, up) {
    // up=true → ∩ / up=false → ∪
    var g = new THREE.CircleGeometry(r, 22, up ? 0 : Math.PI, Math.PI);
    return flat(g, color);
  }

  function arc(r, tube, color, up) {
    var g = new THREE.TorusGeometry(r, tube, 6, 18, Math.PI);
    var m = flat(g, color);
    if (!up) m.rotation.z = Math.PI;
    return m;
  }

  var EYE_DIR = [0.40, 0.10, 0.90];

  function makeEye(side) {
    var g = onHead(side * EYE_DIR[0], EYE_DIR[1], EYE_DIR[2], P.headR + 0.004);

    var open = new THREE.Group();
    g.add(open);

    var white = disc(0.079, 0xffffff);
    white.scale.set(1, 1.26, 1);
    open.add(white);

    var iris = disc(0.055, 0x7a4a2a);
    iris.scale.set(1, 1.14, 1);
    iris.position.set(0, -0.006, 0.004);
    open.add(iris);

    var pupil = disc(0.03, 0x2b2333);
    pupil.position.set(0, -0.008, 0.007);
    open.add(pupil);

    var hi = disc(0.024, 0xffffff);
    hi.position.set(side * 0.024, 0.04, 0.009);
    open.add(hi);

    var hi2 = disc(0.013, 0xffffff);
    hi2.position.set(-side * 0.022, -0.04, 0.009);
    open.add(hi2);

    // まつげ（うえ の ふとい ライン）
    var lash = flat(new THREE.PlaneGeometry(0.175, 0.03), 0x3a2f42);
    lash.position.set(0, 0.093, 0.011);
    lash.rotation.z = side * 0.14;
    g.add(lash);
    var lashTip = flat(new THREE.PlaneGeometry(0.042, 0.02), 0x3a2f42);
    lashTip.position.set(side * 0.088, 0.104, 0.011);
    lashTip.rotation.z = side * 0.32;
    g.add(lashTip);

    // とじため（^ ^）
    var closed = arc(0.062, 0.016, 0x3a2f42, true);
    closed.position.set(0, -0.006, 0.012);
    closed.visible = false;
    g.add(closed);

    // ほしのめ
    var starEye = B.star(0.078, 0xffd44d, { unique: true });
    starEye.material = new THREE.MeshBasicMaterial({ color: 0xffd44d });
    starEye.material.__unique = true;
    starEye.position.set(0, 0, 0.012);
    starEye.scale.z = 0.16;
    starEye.visible = false;
    g.add(starEye);

    // ハートのめ
    var heartEye = B.heart(0.1, 0xff5f8f, { unique: true });
    heartEye.material = new THREE.MeshBasicMaterial({ color: 0xff5f8f });
    heartEye.material.__unique = true;
    heartEye.position.set(0, 0, 0.012);
    heartEye.scale.z = 0.16;
    heartEye.visible = false;
    g.add(heartEye);

    return { root: g, open: open, iris: iris, pupil: pupil, lash: lash, closed: closed, star: starEye, heart: heartEye, side: side };
  }

  var eyeL = makeEye(-1), eyeR = makeEye(1);
  face.add(eyeL.root); face.add(eyeR.root);
  this.eyeL = eyeL; this.eyeR = eyeR;

  // まゆげ（まえがみ の うえ に みえる アニメふう）
  function makeBrow(side) {
    var g = onHead(side * 0.36, 0.44, 0.82, P.headR + 0.04);
    var b = flat(new THREE.PlaneGeometry(0.072, 0.014), 0xb08a68);
    b.rotation.z = side * 0.05;
    g.add(b);
    g.userData.line = b;
    face.add(g);
    return g;
  }
  this.browL = makeBrow(-1);
  this.browR = makeBrow(1);

  // ほっぺ
  function makeBlush(side) {
    var g = onHead(side * 0.66, -0.20, 0.72, P.headR + 0.003);
    var c = disc(0.058, 0xff8fb0, 0.66);
    c.scale.set(1.15, 0.72, 1);
    g.add(c);
    g.userData.disc = c;
    face.add(g);
    return g;
  }
  this.blushL = makeBlush(-1);
  this.blushR = makeBlush(1);

  // くち
  var mouth = onHead(0, -0.36, 0.93, P.headR + 0.005);
  face.add(mouth);
  this.mouth = mouth;

  var mSmile = arc(0.05, 0.014, 0xc4566b, false);
  mouth.add(mSmile);

  var mBig = halfDisc(0.062, 0xb44a5e, false);
  mBig.visible = false;
  mouth.add(mBig);
  var tongue = disc(0.03, 0xff8fa8);
  tongue.scale.set(1.2, 0.6, 1);
  tongue.position.set(0, -0.028, 0.003);
  mBig.add(tongue);

  var mO = disc(0.032, 0xb44a5e);
  mO.scale.set(0.85, 1.1, 1);
  mO.visible = false;
  mouth.add(mO);

  var mFrown = arc(0.044, 0.013, 0xc4566b, true);
  mFrown.position.y = -0.026;
  mFrown.visible = false;
  mouth.add(mFrown);

  var mLine = flat(new THREE.PlaneGeometry(0.06, 0.015), 0xc4566b);
  mLine.visible = false;
  mouth.add(mLine);

  this.mouths = { smile: mSmile, big: mBig, o: mO, frown: mFrown, line: mLine };

  // はな（ちいさい てん）
  var nose = onHead(0, -0.16, 0.985, P.headR + 0.004);
  var noseD = disc(0.016, 0xf0b89c, 0.75);
  nose.add(noseD);
  face.add(nose);

  // なみだ
  var tears = new THREE.Group();
  tears.visible = false;
  face.add(tears);
  for (var ts = -1; ts <= 1; ts += 2) {
    var tg = onHead(ts * 0.52, -0.12, 0.85, P.headR + 0.01);
    var tear = disc(0.026, 0x8fd4ff, 0.9);
    tear.scale.set(0.8, 1.4, 1);
    tg.add(tear);
    tears.add(tg);
  }
  this.tears = tears;

  // かげ
  var shadow = B.blobShadow(0.34, 0.42);
  this.group.add(shadow);
  this.shadow = shadow;

  /* ================= おしゃれ てきよう ================= */

  function clearGroup(g) {
    while (g.children.length) {
      var c = g.children.pop();
      c.traverse(function (o) {
        if (o.geometry && o.geometry.__tmp) o.geometry.dispose();
      });
    }
  }

  this.applyOutfit = function (outfit) {
    this.outfit = JSON.parse(JSON.stringify(outfit));
    var o = this.outfit;

    clearGroup(hairSlot); clearGroup(slotHead); clearGroup(slotTorso);
    clearGroup(slotBack); clearGroup(slotHips); clearGroup(armL.slot);
    clearGroup(armR.slot); clearGroup(legL.slot); clearGroup(legR.slot);

    // かみ
    var hc = WARDROBE.HAIR_COLORS[o.hairColor] || WARDROBE.HAIR_COLORS.brown;
    var hair = (WARDROBE.HAIR[o.hair] || WARDROBE.HAIR.twin).build({
      color: hc.hex, hc: hc,
      accent: (WARDROBE.COLORS[o.accColor] || WARDROBE.COLORS.pink).hex
    });
    hairSlot.add(hair);
    this.hair = hair;
    this.hairTails = [];
    hair.traverse(function (n) { if (n.name && n.name.indexOf('tail') === 0) self.hairTails.push(n); });
    this.browL.userData.line.material.color.setHex(U.shade(hc.hex, -0.2));
    this.browR.userData.line.material.color.setHex(U.shade(hc.hex, -0.2));

    // ひとみ
    var ec = WARDROBE.EYE_COLORS[o.eye] || WARDROBE.EYE_COLORS.brown;
    eyeL.iris.material.color.setHex(ec.hex);
    eyeR.iris.material.color.setHex(ec.hex);

    var ctx = {
      slotTorso: slotTorso, slotHips: slotHips, slotBack: slotBack,
      slotArmL: armL.slot, slotArmR: armR.slot,
      slotHead: slotHead, skin: this.skin
    };

    // トップス
    var topDef = WARDROBE.TOP[o.top] || WARDROBE.TOP.tee;
    ctx.color = (WARDROBE.COLORS[o.topColor] || WARDROBE.COLORS.pink).hex;
    ctx.accent = U.shade(ctx.color, 0.55);
    ctx.pattern = o.topPattern || 'plain';
    topDef.build(ctx);

    // ボトムス（ワンピース系 は スキップ）
    if (!topDef.covers) {
      var botDef = WARDROBE.BOTTOM[o.bottom] || WARDROBE.BOTTOM.flare;
      ctx.color = (WARDROBE.COLORS[o.bottomColor] || WARDROBE.COLORS.sky).hex;
      ctx.accent = U.shade(ctx.color, 0.55);
      ctx.pattern = o.bottomPattern || 'plain';
      botDef.build(ctx);
    }

    // くつ
    var shDef = WARDROBE.SHOES[o.shoes] || WARDROBE.SHOES.sneaker;
    var shCtx = { color: (WARDROBE.COLORS[o.shoesColor] || WARDROBE.COLORS.white).hex };
    shDef.build(shCtx, legL.slot);
    shDef.build(shCtx, legR.slot);
    legL.bare.visible = legR.bare.visible = false;

    // アクセ
    var accDef = WARDROBE.ACC[o.acc] || WARDROBE.ACC.none;
    ctx.color = (WARDROBE.COLORS[o.accColor] || WARDROBE.COLORS.pink).hex;
    ctx.accent = U.shade(ctx.color, 0.5);
    ctx.pattern = 'plain';
    accDef.build(ctx);

    this.wings = [];
    slotBack.traverse(function (n) { if (n.name && n.name.indexOf('wing') === 0) self.wings.push(n); });
  };

  /* ================= ひょうじょう ================= */

  var EXPR = {
    normal: { closed: false, mouth: 'smile', blush: 0.55, brow: 0, tears: false },
    happy: { closed: true, mouth: 'big', blush: 0.85, brow: 0.14, tears: false },
    smile: { closed: false, mouth: 'big', blush: 0.7, brow: 0.06, tears: false },
    surprise: { closed: false, mouth: 'o', blush: 0.5, brow: 0.2, eyeScale: 1.22, tears: false },
    wink: { closed: 'L', mouth: 'big', blush: 0.8, brow: 0.1, tears: false },
    sad: { closed: false, mouth: 'frown', blush: 0.4, brow: -0.18, tears: true, eyeScale: 0.95 },
    sleepy: { closed: false, mouth: 'line', blush: 0.5, brow: -0.05, eyeScaleY: 0.32, tears: false },
    star: { closed: 'star', mouth: 'big', blush: 0.9, brow: 0.12, tears: false },
    love: { closed: 'heart', mouth: 'big', blush: 0.95, brow: 0.1, tears: false },
    think: { closed: false, mouth: 'line', blush: 0.5, brow: 0.08, eyeScale: 0.95, tears: false },
    proud: { closed: true, mouth: 'smile', blush: 0.6, brow: 0.16, tears: false }
  };

  this.setExpr = function (name) {
    if (!EXPR[name]) name = 'normal';
    this.expr = name;
    var e = EXPR[name];
    var eyes = [eyeL, eyeR];
    for (var i = 0; i < 2; i++) {
      var ey = eyes[i];
      var isL = ey.side < 0;
      var closed = e.closed === true || (e.closed === 'L' && isL);
      var showStar = e.closed === 'star';
      var showHeart = e.closed === 'heart';
      ey.open.visible = !closed && !showStar && !showHeart;
      ey.closed.visible = closed;
      ey.star.visible = showStar;
      ey.heart.visible = showHeart;
      ey.lash.visible = !showStar && !showHeart;
      var sc = e.eyeScale || 1;
      ey.open.scale.set(sc, sc * (e.eyeScaleY || 1), 1);
    }
    for (var k in this.mouths) this.mouths[k].visible = (k === e.mouth);
    this.blushL.userData.disc.material.opacity = e.blush;
    this.blushR.userData.disc.material.opacity = e.blush;
    this.browL.userData.line.position.y = e.brow * 0.05;
    this.browR.userData.line.position.y = e.brow * 0.05;
    this.browL.userData.line.rotation.z = -0.05 - e.brow * 0.45;
    this.browR.userData.line.rotation.z = 0.05 + e.brow * 0.45;
    this.tears.visible = !!e.tears;
    this._exprBase = e;
  };

  /* ================= ポーズ / アクション ================= */

  // ポーズ：かんせつ の めあて かいてん
  var POSES = {
    idle: { aLz: 0.15, aRz: -0.15, eLx: -0.15, eRx: -0.15, hy: 0, hx: 0 },
    stand: { aLz: 0.1, aRz: -0.1, eLx: -0.05, eRx: -0.05 },
    wave: { aLz: 0.15, aRz: -2.5, eLx: -0.15, eRx: -0.5, hz: 0.12 },
    cheer: { aLz: 2.6, aRz: -2.6, eLx: -0.3, eRx: -0.3, hy: 0 },
    clap: { aLz: 1.0, aRz: -1.0, eLx: -1.5, eRx: -1.5 },
    work: { aLz: 0.5, aRz: -0.5, eLx: -1.5, eRx: -1.5 },
    hold: { aLz: 0.35, aRz: -0.35, eLx: -1.7, eRx: -1.7 },
    think: { aLz: 0.2, aRz: -0.9, eLx: -0.2, eRx: -2.2, hz: 0.16, hy: 0.2 },
    shy: { aLz: 0.9, aRz: -0.9, eLx: -1.9, eRx: -1.9, hz: 0.1, hx: 0.18 },
    pose1: { aLz: 1.9, aRz: -0.4, eLx: -0.9, eRx: -0.2, hz: -0.12, hy: 0.25 },
    pose2: { aLz: 0.35, aRz: -2.7, eLx: -0.2, eRx: -0.3, hz: 0.14, hy: -0.2 },
    pose3: { aLz: 2.3, aRz: -2.3, eLx: -1.3, eRx: -1.3, hx: -0.1 },
    pose4: { aLz: 0.5, aRz: -1.6, eLx: -1.6, eRx: -1.5, hz: 0.2, hy: 0.3 },
    sleep: { aLz: 0.6, aRz: -0.6, eLx: -0.3, eRx: -0.3, hx: 0.4 },
    sit: { aLz: 0.4, aRz: -0.4, eLx: -0.6, eRx: -0.6 },
    point: { aLz: 0.15, aRz: -1.5, eLx: -0.15, eRx: -0.2, hy: -0.15 }
  };

  this.pose = 'idle';
  this.setPose = function (name) {
    if (POSES[name]) this.pose = name;
  };

  // ワンショット アクション
  this.play = function (name, dur) {
    this.act = { name: name, t: 0, dur: dur || ACT_DUR[name] || 1.0 };
    if (name === 'jump') SND.play('jump');
    if (name === 'spin') SND.play('swish');
  };

  var ACT_DUR = {
    wave: 1.6, jump: 0.85, spin: 1.0, clap: 1.4, nod: 0.7, shake: 0.7,
    cheer: 1.4, twirl: 1.5, bounce: 0.8, curtsy: 1.4, heartHands: 1.6
  };

  this.isBusy = function () { return !!this.act; };

  /* ================= もつ ================= */

  this.hold = function (obj, hand) {
    var slot = (hand === 'L') ? armL.hold : armR.hold;
    while (slot.children.length) slot.remove(slot.children[0]);
    if (obj) slot.add(obj);
    return slot;
  };
  this.holdSlotL = armL.hold;
  this.holdSlotR = armR.hold;

  /* ================= みる ================= */

  this.lookAt = function (worldPos, amount) {
    this.lookTarget = worldPos ? worldPos.clone() : null;
    this.lookAmount = amount != null ? amount : 1;
  };

  /* ================= こうしん ================= */

  var cur = { aLz: 0.15, aRz: -0.15, aLx: 0, aRx: 0, eLx: -0.15, eRx: -0.15, hx: 0, hy: 0, hz: 0 };
  var _v = new THREE.Vector3();

  this.update = function (dt, t) {
    this.time += dt;
    var tt = this.time;

    // ---- まばたき ----
    this.blinkT -= dt;
    var blinkK = 1;
    if (this.blinkT < 0) {
      var b = -this.blinkT;
      if (b < 0.11) blinkK = 1 - Math.sin(b / 0.11 * Math.PI) * 0.94;
      else this.blinkT = U.rand(2.2, 5.5);
    }
    if (this._exprBase && this._exprBase.eyeScaleY) blinkK *= this._exprBase.eyeScaleY;
    var baseScale = (this._exprBase && this._exprBase.eyeScale) || 1;
    eyeL.open.scale.y = baseScale * blinkK * 1;
    eyeR.open.scale.y = baseScale * blinkK * 1;

    // ---- ポーズ めあて ----
    var p = POSES[this.pose] || POSES.idle;
    var tgt = {
      aLz: p.aLz || 0, aRz: p.aRz || 0, aLx: p.aLx || 0, aRx: p.aRx || 0,
      eLx: p.eLx || 0, eRx: p.eRx || 0,
      hx: p.hx || 0, hy: p.hy || 0, hz: p.hz || 0
    };

    var bodyY = 0, bodyRotY = this.group.rotation.y, extraSpin = 0, hipTilt = 0;
    var legLx = 0, legRx = 0, kneeL = 0, kneeR = 0;

    // ---- あるく ----
    if (this.walkSpeed > 0.01) {
      this.walkPhase += dt * this.walkSpeed * 7.5;
      var wp = this.walkPhase;
      legLx = Math.sin(wp) * 0.55 * Math.min(1, this.walkSpeed);
      legRx = -Math.sin(wp) * 0.55 * Math.min(1, this.walkSpeed);
      kneeL = Math.max(0, -Math.sin(wp + 0.9)) * 0.75;
      kneeR = Math.max(0, Math.sin(wp + 0.9)) * 0.75;
      tgt.aLx = -Math.sin(wp) * 0.6;
      tgt.aRx = Math.sin(wp) * 0.6;
      tgt.aLz = 0.16; tgt.aRz = -0.16;
      bodyY = Math.abs(Math.sin(wp)) * 0.035;
      hipTilt = Math.sin(wp) * 0.05;
    } else {
      bodyY = Math.sin(tt * 1.9) * 0.012;
    }

    // ---- アクション ----
    if (this.act) {
      this.act.t += dt;
      var k = U.clamp(this.act.t / this.act.dur, 0, 1);
      var A = this.act.name;
      if (A === 'wave') {
        tgt.aRz = -2.45; tgt.eRx = -0.4;
        tgt.aRx = Math.sin(k * Math.PI * 6) * 0.45;
        tgt.hz = 0.1;
      } else if (A === 'jump') {
        bodyY += Math.sin(k * Math.PI) * 0.5;
        tgt.aLz = 2.4; tgt.aRz = -2.4;
        legLx = -0.4 * Math.sin(k * Math.PI); legRx = -0.4 * Math.sin(k * Math.PI);
        kneeL = kneeR = Math.sin(k * Math.PI) * 0.9;
      } else if (A === 'spin' || A === 'twirl') {
        extraSpin = k * Math.PI * 2 * (A === 'twirl' ? 2 : 1);
        tgt.aLz = 1.9; tgt.aRz = -1.9;
        bodyY += Math.sin(k * Math.PI) * 0.1;
      } else if (A === 'clap') {
        var c = Math.abs(Math.sin(k * Math.PI * 5));
        tgt.aLz = 0.75 + c * 0.42; tgt.aRz = -0.75 - c * 0.42;
        tgt.eLx = -1.55; tgt.eRx = -1.55;
      } else if (A === 'nod') {
        tgt.hx = Math.sin(k * Math.PI * 2) * 0.35;
      } else if (A === 'shake') {
        tgt.hy = Math.sin(k * Math.PI * 3) * 0.4;
      } else if (A === 'cheer') {
        tgt.aLz = 2.7; tgt.aRz = -2.7;
        bodyY += Math.abs(Math.sin(k * Math.PI * 3)) * 0.16;
        tgt.hx = -0.12;
      } else if (A === 'bounce') {
        bodyY += Math.abs(Math.sin(k * Math.PI * 2)) * 0.22;
      } else if (A === 'curtsy') {
        var cc = Math.sin(k * Math.PI);
        bodyY -= cc * 0.14;
        tgt.aLz = 0.9 + cc * 0.7; tgt.aRz = -0.9 - cc * 0.7;
        tgt.hx = cc * 0.3;
        legLx = -cc * 0.2; kneeL = cc * 0.5;
      } else if (A === 'heartHands') {
        tgt.aLz = 1.5; tgt.aRz = -1.5;
        tgt.eLx = -1.9; tgt.eRx = -1.9;
        tgt.hx = -0.1;
        bodyY += Math.sin(k * Math.PI * 2) * 0.03;
      }
      if (this.act.t >= this.act.dur) this.act = null;
    }

    // ---- みる（あたま を むける）----
    if (this.lookTarget && this.lookAmount > 0) {
      this.group.updateMatrixWorld();
      _v.copy(this.lookTarget);
      head.worldToLocal(_v);
      var yaw = Math.atan2(_v.x, _v.z);
      var pitch = -Math.atan2(_v.y, Math.sqrt(_v.x * _v.x + _v.z * _v.z));
      tgt.hy += U.clamp(yaw, -0.7, 0.7) * this.lookAmount;
      tgt.hx += U.clamp(pitch, -0.35, 0.35) * this.lookAmount;
    }

    // ---- なめらか に よせる ----
    var lam = 12;
    for (var key in tgt) cur[key] = U.damp(cur[key], tgt[key], lam, dt);

    armL.root.rotation.z = cur.aLz;
    armR.root.rotation.z = cur.aRz;
    armL.root.rotation.x = cur.aLx;
    armR.root.rotation.x = cur.aRx;
    armL.elbow.rotation.x = cur.eLx;
    armR.elbow.rotation.x = cur.eRx;

    head.rotation.x = cur.hx + Math.sin(tt * 1.3) * 0.012;
    head.rotation.y = cur.hy;
    head.rotation.z = cur.hz + this.headTilt;

    legL.root.rotation.x = U.damp(legL.root.rotation.x, legLx, 14, dt);
    legR.root.rotation.x = U.damp(legR.root.rotation.x, legRx, 14, dt);
    legL.knee.rotation.x = U.damp(legL.knee.rotation.x, kneeL, 14, dt);
    legR.knee.rotation.x = U.damp(legR.knee.rotation.x, kneeR, 14, dt);

    body.position.y = U.damp(body.position.y, bodyY, 16, dt);
    body.rotation.z = U.damp(body.rotation.z, hipTilt, 10, dt);
    body.rotation.y = extraSpin;

    // いき（むね が すこし ふくらむ）
    var br = 1 + Math.sin(tt * 2.1) * 0.014;
    torsoMesh.scale.set(br, 1, br);

    // かみ の ゆれ
    if (this.hairTails) {
      for (var i = 0; i < this.hairTails.length; i++) {
        var tl = this.hairTails[i];
        var ph = i * 1.3;
        tl.rotation.x = Math.sin(tt * 2.4 + ph) * 0.08 + this.walkSpeed * 0.1;
        tl.rotation.z = (tl.userData.baseZ || 0) + Math.sin(tt * 1.8 + ph) * 0.06;
      }
    }
    // はね の はばたき
    if (this.wings) {
      for (var w = 0; w < this.wings.length; w++) {
        this.wings[w].rotation.y = (this.wings[w].scale.x < 0 ? -1 : 1) * (0.45 + Math.sin(tt * 3) * 0.22);
      }
    }

    // かげ（ジャンプ で ちいさく）
    var sh = U.clamp(1 - body.position.y * 0.8, 0.45, 1);
    shadow.scale.set(sh, sh, sh);
    shadow.material.opacity = 0.42 * sh;
  };

  /* ================= べんり ================= */

  this.faceCameraSmile = function () {
    this.setExpr('happy');
    var s = this;
    U.after(1.4, function () { if (s.expr === 'happy') s.setExpr('normal'); });
  };

  this.celebrate = function () {
    this.setExpr('star');
    this.play('cheer');
    var s = this;
    U.after(1.8, function () { s.setExpr('normal'); });
  };

  this.headPos = function () {
    this.group.updateMatrixWorld();
    return head.getWorldPosition(new THREE.Vector3());
  };

  this.handPos = function (side) {
    this.group.updateMatrixWorld();
    return (side === 'L' ? armL.hand : armR.hand).getWorldPosition(new THREE.Vector3());
  };

  // しょきち
  this.setExpr('normal');
  this.applyOutfit(opts.outfit || SAVE.data.outfit);
}
