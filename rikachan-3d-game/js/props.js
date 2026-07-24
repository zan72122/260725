/* ================================================================
   props.js — 小道具・家具・街並みビルダー
   （タンス・ハンガー・そうじ道具・りょうり道具・貯金箱・ハンコ 等）
   ================================================================ */
(function () {
  const RProps = {};
  window.RProps = RProps;
  const B = () => RWorld; // helper alias（world.js の box/sphere/cyl/cone/mat）

  /* ---------- タンス（引き出し3段・開閉できる） ---------- */
  RProps.makeTansu = function () {
    const g = new THREE.Group();
    const body = B().box(1.5, 1.7, 0.75, 0xf5c9de);
    body.position.y = 0.85;
    g.add(body);
    const top = B().box(1.6, 0.08, 0.85, 0xffffff);
    top.position.y = 1.74;
    g.add(top);
    const drawers = [];
    for (let i = 0; i < 3; i++) {
      const drawer = new THREE.Group();
      const front = B().box(1.34, 0.42, 0.07, 0xffffff);
      front.position.z = 0.39;
      const tray = B().box(1.26, 0.34, 0.62, 0xffe8f2);
      tray.position.z = 0.05;
      const knob = B().sphere(0.05, 0xff7bb5);
      knob.position.set(0, 0, 0.44);
      const inner = new THREE.Group(); // たたまれた服をいれる場所
      inner.position.set(0, 0.2, 0.05);
      drawer.add(front, tray, knob, inner);
      drawer.position.set(0, 1.42 - i * 0.52, 0);
      drawer.userData.inner = inner;
      drawer.userData.open = false;
      drawer.userData.drawerIndex = i;
      g.add(drawer);
      drawers.push(drawer);
    }
    g.userData.drawers = drawers;
    return g;
  };

  // たたまれたふく（ひきだしの中身）
  RProps.makeFoldedCloth = function (color) {
    const g = new THREE.Group();
    const c = B().box(0.3, 0.12, 0.24, color);
    const band = B().box(0.31, 0.13, 0.06, 0xffffff);
    g.add(c, band);
    return g;
  };

  /* ---------- ハンガーラック＋ハンガーのふく ---------- */
  RProps.makeHangerRack = function () {
    const g = new THREE.Group();
    const bar = B().cyl(0.035, 0.035, 2.0, 0xd0a060, 10);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 2.0;
    g.add(bar);
    [-0.85, 0.85].forEach((bx) => {
      const pole = B().cyl(0.045, 0.055, 2.0, 0xd0a060, 10);
      pole.position.set(bx, 1.0, 0);
      g.add(pole);
      const foot = B().box(0.4, 0.06, 0.4, 0xd0a060);
      foot.position.set(bx, 0.03, 0);
      g.add(foot);
    });
    g.userData.slots = [-0.6, -0.2, 0.2, 0.6]; // ハンガーをかける位置
    return g;
  };

  RProps.makeHangerDress = function (color) {
    const g = new THREE.Group();
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 14, Math.PI), B().mat(0x888888));
    hook.position.y = 0.06;
    const barH = B().cyl(0.02, 0.02, 0.5, 0xd0a060, 8);
    barH.rotation.z = Math.PI / 2;
    barH.position.y = -0.03;
    const dress = B().cone(0.24, 0.5, color);
    dress.position.y = -0.35;
    const topPart = B().box(0.3, 0.14, 0.1, color);
    topPart.position.y = -0.1;
    g.add(hook, barH, dress, topPart);
    return g;
  };

  /* ---------- ぼうしばこ・くつばこ ---------- */
  RProps.makeHatBox = function () {
    const g = new THREE.Group();
    const body = B().cyl(0.42, 0.42, 0.36, 0xffd0e8, 22);
    body.position.y = 0.18;
    const lid = new THREE.Group();
    const lidTop = B().cyl(0.46, 0.46, 0.1, 0xff9ecd, 22);
    lid.add(lidTop);
    const ribbon = B().box(0.94, 0.11, 0.1, 0xffffff);
    lid.add(ribbon);
    lid.position.y = 0.4;
    g.add(body, lid);
    g.userData.lid = lid;
    return g;
  };

  RProps.makeShoeBox = function () {
    const g = new THREE.Group();
    const body = B().box(1.0, 1.2, 0.5, 0xd9b382);
    body.position.y = 0.6;
    g.add(body);
    const door = new THREE.Group();
    const panel = B().box(0.9, 1.05, 0.06, 0xf0d8ac);
    panel.position.set(0.45, 0, 0);
    const knob = B().sphere(0.04, 0x8a5a2b);
    knob.position.set(0.82, 0, 0.06);
    door.add(panel, knob);
    door.position.set(-0.45, 0.62, 0.26);
    g.add(door);
    g.userData.door = door;
    return g;
  };

  /* ---------- げんかんドア・まど ---------- */
  RProps.makeDoor = function () {
    const g = new THREE.Group();
    const frame = B().box(1.5, 2.6, 0.16, 0xd9a066);
    frame.position.y = 1.3;
    g.add(frame);
    const door = new THREE.Group();
    const panel = B().box(1.24, 2.4, 0.1, 0xf0c090);
    panel.position.x = 0.62;
    const knob = B().sphere(0.07, 0xffd447);
    knob.position.set(1.1, 0, 0.12);
    const winMesh = B().box(0.6, 0.6, 0.12, 0xbfe8ff);
    winMesh.position.set(0.62, 0.7, 0);
    door.add(panel, knob, winMesh);
    door.position.set(-0.62, 1.3, 0);
    g.add(door);
    g.userData.door = door;
    return g;
  };

  /* ---------- そうじ道具 ---------- */
  RProps.makeBroom = function () {
    const g = new THREE.Group();
    const stick = B().cyl(0.028, 0.028, 1.05, 0xd0a060, 8);
    stick.position.y = -0.3;
    const neck = B().cyl(0.05, 0.09, 0.12, 0xff9ecd, 10);
    neck.position.y = -0.85;
    const brush = B().cone(0.17, 0.35, 0xf0d080, 12);
    brush.rotation.x = Math.PI;
    brush.position.y = -1.0;
    g.add(stick, neck, brush);
    return g;
  };

  RProps.makeDustpan = function () {
    const g = new THREE.Group();
    const pan = B().box(0.56, 0.05, 0.42, 0x8fd4e8);
    pan.position.set(0, 0.03, 0);
    const back = B().box(0.56, 0.22, 0.05, 0x8fd4e8);
    back.position.set(0, 0.13, -0.2);
    const sideL = B().box(0.05, 0.18, 0.4, 0x8fd4e8);
    sideL.position.set(-0.26, 0.11, 0);
    const sideR = B().box(0.05, 0.18, 0.4, 0x8fd4e8);
    sideR.position.set(0.26, 0.11, 0);
    const handle = B().cyl(0.025, 0.025, 0.45, 0x6ab8d4, 8);
    handle.position.set(0, 0.35, -0.28);
    handle.rotation.x = 0.5;
    g.add(pan, back, sideL, sideR, handle);
    const pile = new THREE.Group(); // あつめたほこりの山
    pile.position.set(0, 0.07, -0.05);
    g.add(pile);
    g.userData.pile = pile;
    return g;
  };

  RProps.makeHataki = function () {
    const g = new THREE.Group();
    const stick = B().cyl(0.02, 0.02, 0.7, 0xd0a060, 8);
    stick.position.y = -0.15;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const strip = B().box(0.05, 0.3, 0.02, [0xff8ec7, 0x8fd4e8, 0xfff0a0][i % 3]);
      strip.position.set(Math.cos(a) * 0.05, -0.6, Math.sin(a) * 0.05);
      strip.rotation.z = Math.cos(a) * 0.3;
      strip.rotation.x = Math.sin(a) * 0.3;
      g.add(strip);
    }
    g.add(stick);
    return g;
  };

  RProps.makeZoukin = function () {
    const g = new THREE.Group();
    const cloth = B().box(0.3, 0.07, 0.22, 0xfff7c0);
    const stitch = B().box(0.32, 0.02, 0.03, 0xffffff);
    stitch.position.y = 0.03;
    g.add(cloth, stitch);
    return g;
  };

  RProps.makeTrashBin = function () {
    const g = new THREE.Group();
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.62, 16, 1, true), B().mat(0x9ad4a0, { side: THREE.DoubleSide }));
    bin.position.y = 0.31;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 10, 20), B().mat(0x7bb884));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.62;
    const face1 = B().sphere(0.03, 0x333333); face1.position.set(-0.09, 0.4, 0.29);
    const face2 = B().sphere(0.03, 0x333333); face2.position.set(0.09, 0.4, 0.29);
    g.add(bin, rim, face1, face2);
    return g;
  };

  RProps.makeLocker = function () {
    const g = new THREE.Group();
    const body = B().box(0.9, 2.1, 0.55, 0xc8e8f0);
    body.position.y = 1.05;
    g.add(body);
    const door = new THREE.Group();
    const panel = B().box(0.8, 1.95, 0.06, 0xe0f4fa);
    panel.position.x = 0.4;
    const knob = B().sphere(0.045, 0x6ab8d4);
    knob.position.set(0.72, 0, 0.07);
    door.add(panel, knob);
    door.position.set(-0.4, 1.06, 0.28);
    g.add(door);
    g.userData.door = door;
    return g;
  };

  /* ---------- りょうり道具 ---------- */
  RProps.makeWhisk = function () {
    const g = new THREE.Group();
    const handle = B().cyl(0.025, 0.025, 0.3, 0xff9ecd, 8);
    handle.position.y = 0.25;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16), B().mat(0xcccccc));
      loop.rotation.y = a;
      loop.scale.y = 1.6;
      loop.position.y = -0.02;
      g.add(loop);
    }
    g.add(handle);
    return g;
  };

  RProps.makeEgg = function () {
    const g = new THREE.Group();
    const shell = B().sphere(0.11, 0xfff2dc, 1, 1.25, 1);
    g.add(shell);
    g.userData.shell = shell;
    return g;
  };

  RProps.makeSieve = function () {
    const g = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.16, 18, 1, true), B().mat(0xd8d8e0, { side: THREE.DoubleSide }));
    const mesh = B().cyl(0.16, 0.16, 0.01, 0xbbbbcc, 18);
    mesh.position.y = -0.08;
    const handle = B().cyl(0.02, 0.02, 0.3, 0xd8d8e0, 8);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0.35, 0.02, 0);
    g.add(cup, mesh, handle);
    return g;
  };

  RProps.makeMilkCarton = function () {
    const g = new THREE.Group();
    const body = B().box(0.22, 0.4, 0.22, 0xffffff);
    body.position.y = 0.2;
    const top1 = B().box(0.22, 0.12, 0.22, 0x8fd4e8);
    top1.position.y = 0.44;
    top1.rotation.z = 0;
    const roof = B().cone(0.16, 0.14, 0x8fd4e8, 4);
    roof.position.y = 0.55;
    roof.rotation.y = Math.PI / 4;
    g.add(body, top1, roof);
    return g;
  };

  RProps.makeLadle = function () {
    const g = new THREE.Group();
    const cup = B().sphere(0.13, 0xd8d8e0, 1, 0.6, 1);
    const handle = B().cyl(0.02, 0.02, 0.45, 0xd8d8e0, 8);
    handle.position.set(0.06, 0.26, 0);
    handle.rotation.z = -0.35;
    g.add(cup, handle);
    return g;
  };

  /* ---------- じょうろ・はさみ ---------- */
  RProps.makeWateringCan = function () {
    const g = new THREE.Group();
    const body = B().cyl(0.22, 0.26, 0.36, 0x8fd4e8, 18);
    body.position.y = 0.18;
    const spout = B().cyl(0.035, 0.05, 0.42, 0x8fd4e8, 10);
    spout.rotation.z = 0.85;
    spout.position.set(0.32, 0.28, 0);
    const nozzle = B().cyl(0.08, 0.06, 0.05, 0x6ab8d4, 12);
    nozzle.position.set(0.48, 0.42, 0);
    nozzle.rotation.z = 0.85;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 8, 16, Math.PI), B().mat(0x6ab8d4));
    handle.position.set(-0.18, 0.3, 0);
    handle.rotation.z = -0.4;
    g.add(body, spout, nozzle, handle);
    g.userData.nozzleTip = new THREE.Vector3(0.5, 0.45, 0);
    return g;
  };

  RProps.makeScissors = function () {
    const g = new THREE.Group();
    [-1, 1].forEach((sgn) => {
      const blade = B().box(0.05, 0.3, 0.02, 0xd8d8e0);
      blade.position.set(sgn * 0.03, 0.15, 0);
      blade.rotation.z = sgn * -0.15;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 14), B().mat(0xff7bb5));
      ring.position.set(sgn * 0.07, -0.1, 0);
      g.add(blade, ring);
    });
    return g;
  };

  /* ---------- ちょきんばこ（ぶたさん） ---------- */
  RProps.makePiggyBank = function () {
    const g = new THREE.Group();
    const body = B().sphere(0.28, 0xffb3d9, 1.15, 1, 1);
    body.position.y = 0.3;
    const snout = B().cyl(0.09, 0.1, 0.08, 0xff9ecd, 14);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.28, 0.31);
    [-1, 1].forEach((sgn) => {
      const n = B().sphere(0.018, 0xd4658f);
      n.position.set(sgn * 0.035, 0.28, 0.36);
      g.add(n);
      const ear = B().cone(0.06, 0.1, 0xff9ecd, 8);
      ear.position.set(sgn * 0.15, 0.55, 0.05);
      g.add(ear);
      const eye = B().sphere(0.025, 0x333333);
      eye.position.set(sgn * 0.11, 0.38, 0.27);
      g.add(eye);
      const legMesh = B().cyl(0.05, 0.05, 0.1, 0xff9ecd, 10);
      legMesh.position.set(sgn * 0.15, 0.06, 0.12);
      g.add(legMesh);
      const leg2 = B().cyl(0.05, 0.05, 0.1, 0xff9ecd, 10);
      leg2.position.set(sgn * 0.15, 0.06, -0.14);
      g.add(leg2);
    });
    const slot = B().box(0.16, 0.02, 0.05, 0x8a4a68);
    slot.position.set(0, 0.59, 0);
    g.add(body, snout, slot);
    return g;
  };

  RProps.makeCoin = function () {
    const c = B().cyl(0.09, 0.09, 0.03, 0xffd447, 16);
    c.rotation.x = Math.PI / 2;
    const heart = RWorld.makeHeart(0xff8ec7, 0.45);
    heart.position.z = 0.03;
    const g = new THREE.Group();
    g.add(c, heart);
    return g;
  };

  /* ---------- ママのて（コインをわたす） ---------- */
  RProps.makeMamaArm = function () {
    const g = new THREE.Group();
    const sleeve = B().cyl(0.16, 0.18, 1.1, 0xe89ab8, 14);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.x = 0.55;
    const cuff = B().cyl(0.17, 0.17, 0.1, 0xffffff, 14);
    cuff.rotation.z = Math.PI / 2;
    cuff.position.x = 0.05;
    const hand = B().sphere(0.13, 0xffdfc4);
    hand.position.x = -0.08;
    g.add(sleeve, cuff, hand);
    g.userData.handTip = hand;
    return g;
  };

  /* ---------- ハンコ ---------- */
  RProps.makeHanko = function () {
    const g = new THREE.Group();
    const grip = B().cyl(0.09, 0.11, 0.3, 0xd9a066, 14);
    grip.position.y = 0.25;
    const base = B().cyl(0.14, 0.14, 0.1, 0x8a5a2b, 14);
    base.position.y = 0.05;
    const ink = B().cyl(0.13, 0.13, 0.02, 0xe84d6a, 14);
    ink.position.y = -0.01;
    g.add(grip, base, ink);
    return g;
  };

  /* ---------- ステージまく・マイク ---------- */
  RProps.makeCurtains = function (width, height) {
    const g = new THREE.Group();
    const mat_ = B().mat(0xd42a4d, { side: THREE.DoubleSide });
    const left = new THREE.Mesh(new THREE.PlaneGeometry(width / 2, height), mat_);
    left.position.set(-width / 4, height / 2, 0);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(width / 2, height), mat_.clone());
    right.position.set(width / 4, height / 2, 0);
    const valance = new THREE.Mesh(new THREE.PlaneGeometry(width, height * 0.18), B().mat(0xb01e3d, { side: THREE.DoubleSide }));
    valance.position.set(0, height * 0.91, 0.02);
    g.add(left, right, valance);
    g.userData.left = left;
    g.userData.right = right;
    return g;
  };

  RProps.makeMicStand = function () {
    const g = new THREE.Group();
    const pole = B().cyl(0.025, 0.025, 1.3, 0x888899, 10);
    pole.position.y = 0.65;
    const base = B().cyl(0.2, 0.24, 0.05, 0x666677, 14);
    base.position.y = 0.025;
    const mic = B().sphere(0.09, 0x444455);
    mic.position.y = 1.36;
    const grill = B().sphere(0.095, 0x9a9aad, 1, 0.7, 1);
    grill.position.y = 1.38;
    g.add(pole, base, mic, grill);
    return g;
  };

  RProps.makeDressingMirror = function () {
    const g = new THREE.Group();
    const frame = B().box(1.1, 1.5, 0.08, 0xffd0e8);
    frame.position.y = 1.4;
    const glass = B().box(0.94, 1.34, 0.05, 0xd8f0ff);
    glass.position.set(0, 1.4, 0.03);
    g.add(frame, glass);
    // でんきゅう
    for (let i = 0; i < 8; i++) {
      const bulb = B().sphere(0.05, 0xfff0a0);
      bulb.material = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
      const a = (i / 7) * Math.PI;
      bulb.position.set(Math.cos(a) * -0.62, 1.4 + Math.sin(a) * 0.8, 0.06);
      g.add(bulb);
      if (!g.userData.bulbs) g.userData.bulbs = [];
      g.userData.bulbs.push(bulb);
    }
    return g;
  };

  /* ---------- ブラシ（かみをとかす） ---------- */
  RProps.makeBrush = function () {
    const g = new THREE.Group();
    const handle = B().cyl(0.03, 0.035, 0.25, 0xff9ecd, 10);
    handle.position.y = -0.18;
    const headMesh = B().sphere(0.09, 0xff7bb5, 1, 1.5, 0.6);
    for (let i = 0; i < 12; i++) {
      const pin = B().cyl(0.008, 0.008, 0.07, 0xffffff, 6);
      pin.position.set((Math.random() - 0.5) * 0.1, 0.02 + (Math.random() - 0.5) * 0.16, 0.06);
      pin.rotation.x = -0.5;
      g.add(pin);
    }
    g.add(handle, headMesh);
    return g;
  };

  /* ---------- まち（いえ・き・みせ） ---------- */
  RProps.makeStreetHouse = function (color, roofColor) {
    const g = new THREE.Group();
    const body = B().box(2.2, 1.9, 1.6, color);
    body.position.y = 0.95;
    const roof = B().cone(1.8, 1.1, roofColor, 4);
    roof.position.y = 2.4;
    roof.rotation.y = Math.PI / 4;
    const doorMesh = B().box(0.5, 0.9, 0.1, 0x8a5a2b);
    doorMesh.position.set(0.4, 0.45, 0.82);
    const winMesh = B().box(0.5, 0.5, 0.1, 0xbfe8ff);
    winMesh.position.set(-0.5, 1.1, 0.82);
    g.add(body, roof, doorMesh, winMesh);
    return g;
  };

  RProps.makeTree = function () {
    const g = new THREE.Group();
    const trunk = B().cyl(0.12, 0.16, 0.9, 0x8a5a2b, 10);
    trunk.position.y = 0.45;
    const leaves = B().sphere(0.65, 0x7cc47a);
    leaves.position.y = 1.3;
    const leaves2 = B().sphere(0.45, 0x8fd48d);
    leaves2.position.set(0.35, 1.05, 0.15);
    g.add(trunk, leaves, leaves2);
    return g;
  };

  RProps.makeShopFacade = function (kind) {
    const g = new THREE.Group();
    const cfg = {
      job_cake:   { color: 0xffd9ec, sign: 0xff7bb5, deco: 'cake' },
      job_idol:   { color: 0xd0c0f0, sign: 0x8a6ad4, deco: 'star' },
      job_flower: { color: 0xd8f0d0, sign: 0x7cc47a, deco: 'flower' },
    }[kind] || { color: 0xffd9ec, sign: 0xff7bb5, deco: 'cake' };
    const body = B().box(3.2, 2.4, 1.8, cfg.color);
    body.position.y = 1.2;
    const awning = B().box(3.4, 0.12, 0.9, 0xffffff);
    awning.position.set(0, 2.0, 1.1);
    awning.rotation.x = 0.25;
    for (let i = 0; i < 4; i++) {
      const stripe = B().box(0.42, 0.14, 0.92, cfg.sign);
      stripe.position.set(-1.26 + i * 0.84, 2.0, 1.1);
      stripe.rotation.x = 0.25;
      g.add(stripe);
    }
    const doorMesh = B().box(0.8, 1.3, 0.12, 0xffffff);
    doorMesh.position.set(0, 0.65, 0.92);
    const signBoard = B().box(1.7, 0.55, 0.14, 0xffffff);
    signBoard.position.set(0, 2.75, 0.7);
    g.add(body, awning, doorMesh, signBoard);
    // かんばんのシンボル
    if (cfg.deco === 'cake') {
      const c = B().cyl(0.16, 0.18, 0.18, 0xfff2d9, 14);
      c.position.set(-0.3, 2.78, 0.82);
      const cherry = B().sphere(0.06, 0xd42a4d);
      cherry.position.set(-0.3, 2.9, 0.82);
      g.add(c, cherry);
    } else if (cfg.deco === 'star') {
      const s = B().sphere(0.14, 0xffe14d);
      s.material = new THREE.MeshBasicMaterial({ color: 0xffe14d });
      s.position.set(-0.3, 2.78, 0.82);
      g.add(s);
    } else {
      const f = RWorld.makeFlower(0xff8ec7, 0.5);
      f.position.set(-0.35, 2.55, 0.82);
      g.add(f);
    }
    return g;
  };

  /* ---------- せんたく小物 ---------- */
  RProps.makeClothespin = function () {
    const g = new THREE.Group();
    const a = B().box(0.04, 0.14, 0.03, 0xffd447);
    a.position.x = -0.02;
    const b2 = B().box(0.04, 0.14, 0.03, 0xffd447);
    b2.position.x = 0.02;
    g.add(a, b2);
    return g;
  };

  RProps.makeSock = function (color) {
    const g = new THREE.Group();
    const leg = B().box(0.12, 0.22, 0.1, color);
    const foot = B().box(0.12, 0.1, 0.18, color);
    foot.position.set(0, -0.13, 0.05);
    const cuffMesh = B().box(0.13, 0.05, 0.11, 0xffffff);
    cuffMesh.position.y = 0.12;
    g.add(leg, foot, cuffMesh);
    return g;
  };

  RProps.makeDetergent = function () {
    const g = new THREE.Group();
    const bottle = B().box(0.26, 0.44, 0.18, 0x8fd4e8);
    bottle.position.y = 0.22;
    const label = B().box(0.2, 0.2, 0.19, 0xffffff);
    label.position.y = 0.2;
    const capMesh = B().cyl(0.07, 0.07, 0.1, 0x4a7fd4, 12);
    capMesh.position.y = 0.49;
    g.add(bottle, label, capMesh);
    g.userData.cap = capMesh;
    return g;
  };

  RProps.makeRainCloud = function () {
    const g = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const c = B().sphere(0.6 + Math.random() * 0.3, 0x9a9ab0);
      c.position.set(j * 0.7 - 1.05, Math.random() * 0.25, Math.random() * 0.3);
      g.add(c);
    }
    return g;
  };

  RProps.makeHandkerchief = function () {
    const g = new THREE.Group();
    const cloth = B().box(0.22, 0.02, 0.22, 0xfff0a0);
    const dot1 = B().sphere(0.03, 0xff8ec7); dot1.position.set(0.05, 0.02, 0.05);
    const dot2 = B().sphere(0.03, 0xff8ec7); dot2.position.set(-0.06, 0.02, -0.04);
    g.add(cloth, dot1, dot2);
    return g;
  };
})();
