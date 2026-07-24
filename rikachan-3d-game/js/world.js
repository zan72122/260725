/* ================================================================
   world.js — 3Dシーン・おうち・パーティクル演出・おきゃくさん
   ================================================================ */
(function () {
  const RWorld = {};
  window.RWorld = RWorld;

  function mat(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  }
  function box(w, h, d, color) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  }
  function sphere(r, color) {
    return new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat(color));
  }
  function cyl(rt, rb, h, color, seg) {
    return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 18), mat(color));
  }
  function cone(r, h, color, seg) {
    return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 18), mat(color));
  }
  RWorld.box = box; RWorld.sphere = sphere; RWorld.cyl = cyl; RWorld.cone = cone; RWorld.mat = mat;

  /* ---------------- 初期化 ---------------- */
  RWorld.init = function (canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    RWorld.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffe3f2);
    scene.fog = new THREE.Fog(0xffe3f2, 18, 40);
    RWorld.scene = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 2.4, 6.5);
    camera.lookAt(0, 1.2, 0);
    RWorld.camera = camera;

    // ライト
    const amb = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(amb);
    const sun = new THREE.DirectionalLight(0xfff2e0, 1.4);
    sun.position.set(3, 8, 5);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd0e8ff, 0.5);
    fill.position.set(-4, 3, -3);
    scene.add(fill);

    // カメラ移動用
    RWorld.camTarget = { pos: camera.position.clone(), look: new THREE.Vector3(0, 1.2, 0) };
    RWorld.camLook = new THREE.Vector3(0, 1.2, 0);

    RWorld.initParticles();
    window.addEventListener('resize', RWorld.resize);
    window.addEventListener('orientationchange', () => setTimeout(RWorld.resize, 250));
  };

  RWorld.resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    RWorld.renderer.setSize(w, h);
    RWorld.camera.aspect = w / h;
    // 縦画面ではすこし引いて全体が見えるように
    RWorld.camera.fov = h > w ? 55 : 45;
    RWorld.camera.updateProjectionMatrix();
  };

  // 縦画面では自動でカメラを引いて全体が見えるようにする
  function effectiveCam() {
    const portrait = window.innerHeight > window.innerWidth;
    const k = portrait ? 1.35 : 1;
    const look = RWorld.camTarget.look;
    const pos = look.clone().add(RWorld.camTarget.pos.clone().sub(look).multiplyScalar(k));
    return { pos, look };
  }

  RWorld.moveCamera = function (pos, look) {
    RWorld.camTarget.pos.set(pos[0], pos[1], pos[2]);
    RWorld.camTarget.look.set(look[0], look[1], look[2]);
  };
  RWorld.snapCamera = function (pos, look) {
    RWorld.moveCamera(pos, look);
    const eff = effectiveCam();
    RWorld.camera.position.copy(eff.pos);
    RWorld.camLook.copy(eff.look);
  };

  RWorld.updateCamera = function (dt) {
    const eff = effectiveCam();
    const k = 1 - Math.pow(0.02, dt); // なめらか追従
    RWorld.camera.position.lerp(eff.pos, k);
    RWorld.camLook.lerp(eff.look, k);
    RWorld.camera.lookAt(RWorld.camLook);
  };

  /* ---------------- おそと（そら・くも・じめん） ---------------- */
  RWorld.buildOutdoor = function (group) {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 40), mat(0xa8e6a1));
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);
    // くも
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const c = sphere(0.5 + Math.random() * 0.35, 0xffffff);
        c.position.set(j * 0.6 - 0.9, Math.random() * 0.2, Math.random() * 0.3);
        cloud.add(c);
      }
      const a = (i / 6) * Math.PI * 2;
      cloud.position.set(Math.cos(a) * 13, 5.5 + Math.random() * 2.5, Math.sin(a) * 13 - 4);
      cloud.userData.speed = 0.05 + Math.random() * 0.1;
      cloud.userData.isCloud = true;
      group.add(cloud);
    }
    // おはなばたけ（とおく）
    const colors = [0xff8ec7, 0xffd447, 0xffffff, 0xb48ae0, 0xff6a6a];
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 7 + Math.random() * 14;
      const f = RWorld.makeFlower(colors[i % colors.length], 0.5 + Math.random() * 0.4);
      f.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      group.add(f);
    }
  };

  RWorld.makeFlower = function (petalColor, scale) {
    const g = new THREE.Group();
    const s = scale || 1;
    const stem = cyl(0.03 * s, 0.03 * s, 0.5 * s, 0x5cb85c, 8);
    stem.position.y = 0.25 * s;
    g.add(stem);
    const head = new THREE.Group();
    head.position.y = 0.55 * s;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const p = sphere(0.09 * s, petalColor);
      p.scale.set(1, 0.5, 1);
      p.position.set(Math.cos(a) * 0.11 * s, 0, Math.sin(a) * 0.11 * s);
      head.add(p);
    }
    const c = sphere(0.07 * s, 0xffd447);
    head.add(c);
    g.add(head);
    g.userData.head = head;
    return g;
  };

  /* ---------------- おうちの部屋 ---------------- */
  RWorld.buildHomeRoom = function (group) {
    // ゆか
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.2, 36), mat(0xf5d8a8));
    floor.position.y = -0.1;
    group.add(floor);
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.05, 36), mat(0xff9ecd));
    rug.position.y = 0.03;
    group.add(rug);
    const rugTrim = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 10, 40), mat(0xffffff));
    rugTrim.rotation.x = Math.PI / 2;
    rugTrim.position.y = 0.05;
    group.add(rugTrim);

    // かべ（うしろ半分）
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7, 5, 36, 1, true, Math.PI * 0.75, Math.PI * 1.5),
      mat(0xfff0d8, { side: THREE.BackSide })
    );
    wall.position.y = 2.5;
    group.add(wall);

    // まど（ひらけるよう、ガラスは可動パネルにする）
    const win = new THREE.Group();
    const winFrame = box(2.2, 1.8, 0.12, 0xffffff);
    const winOpening = box(1.9, 1.5, 0.04, 0xa8dcff); // そとのそら
    winOpening.position.z = 0.02;
    const winPane = new THREE.Group(); // うごくガラス
    const paneGlass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 0.05),
      mat(0xd0ecff, { transparent: true, opacity: 0.55 }));
    const winBar1 = box(0.08, 1.5, 0.1, 0xffffff); winBar1.position.z = 0.04;
    const winBar2 = box(1.9, 0.08, 0.1, 0xffffff); winBar2.position.z = 0.04;
    winPane.add(paneGlass, winBar1, winBar2);
    winPane.position.z = 0.08;
    win.add(winFrame, winOpening, winPane);
    win.position.set(0, 2.6, -6.7);
    win.userData.pane = winPane;
    win.userData.open = false;
    group.add(win);
    // カーテン
    const curtains = [];
    [-1.25, 1.25].forEach((x) => {
      const cur = box(0.5, 2.1, 0.1, 0xffb3d9);
      cur.position.set(x, 2.6, -6.6);
      group.add(cur);
      curtains.push(cur);
    });

    // ベッド
    const bed = new THREE.Group();
    const bedBase = box(1.6, 0.5, 2.4, 0xffffff);
    bedBase.position.y = 0.25;
    const futon = box(1.5, 0.25, 1.7, 0xff9ecd);
    futon.position.set(0, 0.55, 0.3);
    const pillow = box(0.9, 0.22, 0.5, 0xfff7c0);
    pillow.position.set(0, 0.58, -0.85);
    const headboard = box(1.6, 1, 0.15, 0xffc9e4);
    headboard.position.set(0, 0.7, -1.2);
    bed.add(bedBase, futon, pillow, headboard);
    bed.position.set(-4, 0, -3.5);
    bed.rotation.y = 0.5;
    group.add(bed);

    // ほんだな
    const shelf = new THREE.Group();
    const shelfBody = box(1.5, 2.2, 0.6, 0xf0c090);
    shelfBody.position.y = 1.1;
    shelf.add(shelfBody);
    const bookColors = [0xff6a6a, 0x6aa8ff, 0xffd447, 0x8fe3c0, 0xb48ae0, 0xff9ecd];
    for (let r = 0; r < 3; r++) {
      for (let b = 0; b < 5; b++) {
        const book = box(0.18, 0.45, 0.35, bookColors[(r * 5 + b) % bookColors.length]);
        book.position.set(-0.55 + b * 0.24, 0.5 + r * 0.62, 0.15);
        shelf.add(book);
      }
    }
    shelf.position.set(4.2, 0, -3.2);
    shelf.rotation.y = -0.55;
    group.add(shelf);

    // ドレッサー（かがみだい）
    const dresser = new THREE.Group();
    const dBase = box(1.4, 0.8, 0.6, 0xffc9e4);
    dBase.position.y = 0.4;
    const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 24), mat(0xd0f0ff));
    mirror.rotation.x = Math.PI / 2;
    mirror.position.set(0, 1.6, -0.1);
    const mirrorFrame = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 12, 28), mat(0xffd447));
    mirrorFrame.position.set(0, 1.6, -0.1);
    dresser.add(dBase, mirror, mirrorFrame);
    dresser.position.set(-4.3, 0, 1.2);
    dresser.rotation.y = 1.1;
    group.add(dresser);

    // テーブルとケーキ
    const table = new THREE.Group();
    const tTop = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 24), mat(0xffffff));
    tTop.position.y = 0.75;
    const tLeg = cyl(0.09, 0.12, 0.75, 0xf0c090);
    tLeg.position.y = 0.37;
    table.add(tTop, tLeg);
    table.position.set(4.2, 0, 1.4);
    group.add(table);

    // おもちゃばこ
    const toybox = new THREE.Group();
    const tb = box(1.1, 0.7, 0.8, 0x8fd4e8);
    tb.position.y = 0.35;
    toybox.add(tb);
    const ball = sphere(0.22, 0xff6a6a);
    ball.position.set(-0.2, 0.8, 0);
    const ball2 = sphere(0.16, 0xffd447);
    ball2.position.set(0.25, 0.76, 0.1);
    toybox.add(ball, ball2);
    toybox.position.set(2.2, 0, -4.6);
    group.add(toybox);

    /* ---- ここから おしゃれ・おてつだい用の家具 ---- */
    // タンス（ひきだし開閉）＋うえに ぼうしばこ
    const tansu = RProps.makeTansu();
    tansu.position.set(-1.9, 0, -5.9);
    tansu.rotation.y = 0.1;
    group.add(tansu);
    const hatBox = RProps.makeHatBox();
    hatBox.position.set(0.1, 1.78, 0);
    tansu.add(hatBox);

    // ハンガーラック
    const rack = RProps.makeHangerRack();
    rack.position.set(0.7, 0, -6.0);
    rack.rotation.y = -0.05;
    group.add(rack);

    // げんかんドア＋くつばこ
    const door = RProps.makeDoor();
    door.position.set(4.2, 0, -5.2);
    door.rotation.y = -0.55;
    group.add(door);
    const shoeBox = RProps.makeShoeBox();
    shoeBox.position.set(2.9, 0, -5.8);
    shoeBox.rotation.y = -0.25;
    group.add(shoeBox);
    const matMesh = box(1.2, 0.04, 0.8, 0xff9ecd);
    matMesh.position.set(4.0, 0.02, -4.2);
    matMesh.rotation.y = -0.55;
    group.add(matMesh);

    // ゴミばこ・そうじロッカー
    const trash = RProps.makeTrashBin();
    trash.position.set(5.1, 0, -3.0);
    group.add(trash);
    const locker = RProps.makeLocker();
    locker.position.set(-3.6, 0, -5.5);
    locker.rotation.y = 0.35;
    group.add(locker);

    group.userData.refs = { win, winPane, curtains, tansu, hatBox, rack, door, shoeBox, trash, locker, dresser, bed, table, shelf, toybox, mat: matMesh };
  };

  /* ---------------- ねこの「ミルク」 ---------------- */
  RWorld.buildCat = function () {
    const cat = new THREE.Group();
    const bodyM = sphere(0.3, 0xfff7e8);
    bodyM.scale.set(1, 0.85, 1.3);
    bodyM.position.y = 0.28;
    const headM = sphere(0.24, 0xfff7e8);
    headM.position.set(0, 0.55, 0.28);
    cat.add(bodyM, headM);
    [-1, 1].forEach((sgn) => {
      const ear = cone(0.08, 0.14, 0xfff7e8, 6);
      ear.position.set(sgn * 0.13, 0.75, 0.24);
      cat.add(ear);
      const inner = cone(0.04, 0.08, 0xffb3d9, 6);
      inner.position.set(sgn * 0.13, 0.74, 0.26);
      cat.add(inner);
      const eye = sphere(0.035, 0x333333);
      eye.position.set(sgn * 0.09, 0.58, 0.49);
      cat.add(eye);
    });
    const nose = sphere(0.025, 0xff9ecd);
    nose.position.set(0, 0.52, 0.51);
    cat.add(nose);
    const tail = cyl(0.045, 0.03, 0.5, 0xfff7e8, 8);
    tail.position.set(0, 0.5, -0.42);
    tail.rotation.x = -0.7;
    cat.add(tail);
    cat.userData.tail = tail;
    // ぶちもよう
    const patch = sphere(0.12, 0xf0b060);
    patch.position.set(0.15, 0.42, -0.1);
    cat.add(patch);
    return cat;
  };

  /* ---------------- おきゃくさん（どうぶつ） ---------------- */
  // kind: 'bear' | 'bunny' | 'panda'
  RWorld.buildAnimal = function (kind) {
    const g = new THREE.Group();
    const cfg = {
      bear:  { body: 0xc98d4f, belly: 0xf0d0a0, ear: 0xc98d4f, earIn: 0xf0d0a0 },
      bunny: { body: 0xffffff, belly: 0xffe8f2, ear: 0xffffff, earIn: 0xffb3d9 },
      panda: { body: 0xffffff, belly: 0xffffff, ear: 0x333333, earIn: 0x333333 },
    }[kind] || { body: 0xc98d4f, belly: 0xf0d0a0, ear: 0xc98d4f, earIn: 0xf0d0a0 };

    const body = sphere(0.42, cfg.body);
    body.scale.set(1, 1.1, 0.9);
    body.position.y = 0.45;
    const belly = sphere(0.3, cfg.belly);
    belly.scale.set(1, 1.05, 0.6);
    belly.position.set(0, 0.42, 0.18);
    const head = sphere(0.38, cfg.body);
    head.position.y = 1.15;
    g.add(body, belly, head);

    if (kind === 'bunny') {
      [-1, 1].forEach((sgn) => {
        const ear = sphere(0.1, cfg.ear);
        ear.scale.set(1, 3.2, 1);
        ear.position.set(sgn * 0.16, 1.65, -0.05);
        const inner = sphere(0.05, cfg.earIn);
        inner.scale.set(1, 2.6, 0.5);
        inner.position.set(sgn * 0.16, 1.63, 0.03);
        g.add(ear, inner);
      });
    } else {
      [-1, 1].forEach((sgn) => {
        const ear = sphere(0.13, cfg.ear);
        ear.position.set(sgn * 0.28, 1.46, 0);
        const inner = sphere(0.06, cfg.earIn === cfg.ear ? 0x555555 : cfg.earIn);
        inner.position.set(sgn * 0.28, 1.46, 0.09);
        g.add(ear, inner);
      });
    }
    // かお
    [-1, 1].forEach((sgn) => {
      if (kind === 'panda') {
        const patch = sphere(0.1, 0x333333);
        patch.scale.set(1, 1.3, 0.5);
        patch.position.set(sgn * 0.14, 1.2, 0.3);
        g.add(patch);
      }
      const eye = sphere(0.045, 0x222222);
      eye.position.set(sgn * 0.14, 1.2, kind === 'panda' ? 0.36 : 0.34);
      g.add(eye);
    });
    const muzzle = sphere(0.13, cfg.belly);
    muzzle.scale.set(1.3, 1, 0.7);
    muzzle.position.set(0, 1.06, 0.32);
    const nose = sphere(0.045, 0x554433);
    nose.position.set(0, 1.11, 0.42);
    g.add(muzzle, nose);
    // てあし
    [-1, 1].forEach((sgn) => {
      const armA = sphere(0.12, cfg.body);
      armA.scale.set(1, 1.6, 1);
      armA.position.set(sgn * 0.42, 0.55, 0.05);
      armA.rotation.z = sgn * -0.5;
      const foot = sphere(0.14, cfg.body);
      foot.scale.set(1, 0.7, 1.3);
      foot.position.set(sgn * 0.2, 0.08, 0.15);
      g.add(armA, foot);
    });
    return g;
  };

  /* ---------------- ハート・ふきだし ---------------- */
  RWorld.makeHeart = function (color, scale) {
    const s = scale || 1;
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: color || 0xff5aa8 });
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 12, 10), m);
    l.position.set(-0.06 * s, 0.04 * s, 0);
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 12, 10), m);
    r.position.set(0.06 * s, 0.04 * s, 0);
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.115 * s, 0.2 * s, 4), m);
    b.rotation.x = Math.PI;
    b.rotation.y = Math.PI / 4;
    b.position.y = -0.07 * s;
    g.add(l, r, b);
    return g;
  };

  /* ---------------- パーティクル（かみふぶき・キラキラ・ハート） ---------------- */
  RWorld.initParticles = function () {
    RWorld.particles = [];
    RWorld.particleGroup = new THREE.Group();
    RWorld.scene.add(RWorld.particleGroup);
  };

  RWorld.clearParticles = function () {
    RWorld.particles.forEach((p) => RWorld.particleGroup.remove(p.mesh));
    RWorld.particles = [];
  };

  function spawnParticle(mesh, opts) {
    mesh.position.copy(opts.pos);
    RWorld.particleGroup.add(mesh);
    RWorld.particles.push({
      mesh,
      vel: opts.vel || new THREE.Vector3(),
      grav: opts.grav !== undefined ? opts.grav : -3,
      life: opts.life || 2,
      age: 0,
      spin: opts.spin || new THREE.Vector3(),
      shrink: opts.shrink || false,
    });
  }

  // かみふぶき
  RWorld.confetti = function (center, count) {
    const colors = [0xff5aa8, 0xffd447, 0x6ae8c0, 0x6aa8ff, 0xb48ae0, 0xff8c6a];
    const c = center || new THREE.Vector3(0, 3, 0);
    for (let i = 0; i < (count || 60); i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide })
      );
      spawnParticle(m, {
        pos: c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3),
        grav: -2.2,
        life: 2.5 + Math.random(),
        spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      });
    }
  };

  // キラキラ
  RWorld.sparkleBurst = function (pos, count, color) {
    for (let i = 0; i < (count || 10); i++) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06 + Math.random() * 0.05),
        new THREE.MeshBasicMaterial({ color: color || 0xfff0a0 })
      );
      const a = Math.random() * Math.PI * 2;
      spawnParticle(m, {
        pos: pos.clone(),
        vel: new THREE.Vector3(Math.cos(a) * (0.6 + Math.random()), 1 + Math.random() * 1.5, Math.sin(a) * (0.6 + Math.random())),
        grav: -1.5,
        life: 0.7 + Math.random() * 0.5,
        spin: new THREE.Vector3(4, 4, 0),
        shrink: true,
      });
    }
  };

  // ほこりの もわもわ（ゆっくり のぼって きえる）
  RWorld.dustPuff = function (pos, count) {
    for (let i = 0; i < (count || 5); i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.07, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xb8b8b8, transparent: true, opacity: 0.75 })
      );
      spawnParticle(m, {
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1, (Math.random() - 0.5) * 0.5)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.7 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5),
        grav: -0.15,
        life: 0.9 + Math.random() * 0.6,
        spin: new THREE.Vector3(0, 1, 0),
        shrink: true,
      });
    }
  };

  // ゆげ（しろい もわもわ が のぼる）
  RWorld.steam = function (pos, count) {
    for (let i = 0; i < (count || 3); i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.06 + Math.random() * 0.05, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
      );
      spawnParticle(m, {
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.8 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2),
        grav: 0.2,
        life: 0.8 + Math.random() * 0.5,
        spin: new THREE.Vector3(0, 0, 0),
        shrink: true,
      });
    }
  };

  // いいにおいマーク（ピンクのハートが ゆらゆら ながれていく）
  RWorld.smellDrift = function (pos, dir, count) {
    for (let i = 0; i < (count || 2); i++) {
      const h = RWorld.makeHeart(0xffb3d9, 0.5 + Math.random() * 0.3);
      spawnParticle(h, {
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.2, 0)),
        vel: dir.clone().multiplyScalar(0.8 + Math.random() * 0.4).add(new THREE.Vector3(0, 0.35 + Math.random() * 0.2, 0)),
        grav: 0.05,
        life: 1.6 + Math.random() * 0.7,
        spin: new THREE.Vector3(0, 2, 0.6),
        shrink: true,
      });
    }
  };

  // みずしぶき（じょうろ・せんたく）／いろをかえれば こむぎこ・きじ にも
  RWorld.waterDrops = function (pos, count, spread, color) {
    for (let i = 0; i < (count || 6); i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 6, 5),
        new THREE.MeshBasicMaterial({ color: color || 0x7ec4e8, transparent: true, opacity: 0.85 })
      );
      spawnParticle(m, {
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * (spread || 0.3), 0, (Math.random() - 0.5) * (spread || 0.3))),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.5 - Math.random() * 0.8, (Math.random() - 0.5) * 0.4),
        grav: -4,
        life: 0.5 + Math.random() * 0.3,
        spin: new THREE.Vector3(0, 0, 0),
        shrink: true,
      });
    }
  };

  // ハートがふわふわ
  RWorld.heartBurst = function (pos, count) {
    for (let i = 0; i < (count || 6); i++) {
      const h = RWorld.makeHeart([0xff5aa8, 0xff8ec7, 0xff4f6a][i % 3], 0.8 + Math.random() * 0.7);
      spawnParticle(h, {
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.4)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1 + Math.random() * 0.8, 0),
        grav: 0.35,
        life: 1.4 + Math.random() * 0.6,
        spin: new THREE.Vector3(0, 2, 0),
        shrink: true,
      });
    }
  };

  RWorld.updateParticles = function (dt) {
    for (let i = RWorld.particles.length - 1; i >= 0; i--) {
      const p = RWorld.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        RWorld.particleGroup.remove(p.mesh);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        RWorld.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      if (p.shrink) {
        const s = Math.max(0.01, 1 - p.age / p.life);
        p.mesh.scale.setScalar(s);
      }
    }
  };

  /* ---------------- くも等の環境アニメ ---------------- */
  RWorld.updateEnvironment = function (group, time, dt) {
    group.traverse((o) => {
      if (o.userData.isCloud) {
        o.position.x += o.userData.speed * dt;
        if (o.position.x > 16) o.position.x = -16;
      }
    });
  };
})();
