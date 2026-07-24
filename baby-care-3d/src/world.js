/* ============================================================
 * world.js — こどもべや 3D 環境
 * ゆか / かべ / まど（昼夜の空）/ かぐ / ライティング
 * ============================================================ */
(function () {
  'use strict';

  function lambert(color) { return new THREE.MeshLambertMaterial({ color: color }); }

  function World(scene) {
    this.scene = scene;
    this.night = 0; // 0=ひる 1=よる
    this._build();
  }

  World.prototype._build = function () {
    var scene = this.scene;

    /* --- ライト --- */
    this.hemi = new THREE.HemisphereLight(0xfff5e8, 0xffd9e8, 1.0);
    scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xffffff, 0.55);
    this.dir.position.set(2, 4, 3);
    scene.add(this.dir);
    this.nightLight = new THREE.PointLight(0xaa88ff, 0, 8);
    this.nightLight.position.set(0, 2.2, 1);
    scene.add(this.nightLight);

    /* --- ゆか --- */
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), lambert(0xeec089));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    this.floorMat = floor.material;

    // まるいラグ
    var rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32), lambert(0xff9ec0));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.005, 0.4);
    scene.add(rug);
    var rugIn = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), lambert(0xffc3d8));
    rugIn.rotation.x = -Math.PI / 2;
    rugIn.position.set(0, 0.01, 0.4);
    scene.add(rugIn);
    this.rugMats = [rug.material, rugIn.material];

    /* --- かべ --- */
    var backWall = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), lambert(0xaed3f2));
    backWall.position.set(0, 3, -3.2);
    scene.add(backWall);
    this.wallMat = backWall.material;

    var sideL = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), lambert(0xa2c9ec));
    sideL.rotation.y = Math.PI / 2;
    sideL.position.set(-5.2, 3, 0);
    scene.add(sideL);
    var sideR = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), lambert(0xa2c9ec));
    sideR.rotation.y = -Math.PI / 2;
    sideR.position.set(5.2, 3, 0);
    scene.add(sideR);
    this.sideMats = [sideL.material, sideR.material];

    // はばき
    var base = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 0.06), lambert(0xffffff));
    base.position.set(0, 0.15, -3.18);
    scene.add(base);

    /* --- まど + そら --- */
    var winW = 2.4, winH = 1.9;
    this.skyMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
    var sky = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), this.skyMat);
    sky.position.set(-1.9, 2.6, -3.15);
    scene.add(sky);

    var frameMat = lambert(0xffffff);
    var frameParts = [
      [winW + 0.2, 0.12, -1.9, 2.6 + winH / 2],
      [winW + 0.2, 0.12, -1.9, 2.6 - winH / 2],
      [0.12, winH + 0.2, -1.9 - winW / 2, 2.6],
      [0.12, winH + 0.2, -1.9 + winW / 2, 2.6],
      [0.1, winH, -1.9, 2.6]
    ];
    for (var i = 0; i < frameParts.length; i++) {
      var f = frameParts[i];
      var bar = new THREE.Mesh(new THREE.BoxGeometry(f[0], f[1], 0.08), frameMat);
      bar.position.set(f[2], f[3], -3.1);
      scene.add(bar);
    }

    // おひさま / おつきさま（まどの中）
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    this.sun.position.set(-2.4, 3.05, -3.14);
    scene.add(this.sun);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24), new THREE.MeshBasicMaterial({ color: 0xfff8d8 }));
    this.moon.position.set(-2.4, 3.05, -3.14);
    this.moon.visible = false;
    scene.add(this.moon);

    // まどのくも
    this.clouds = [];
    for (var c = 0; c < 2; c++) {
      var cloud = new THREE.Mesh(
        new THREE.CircleGeometry(0.18, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
      );
      cloud.scale.set(1.8, 1, 1);
      cloud.position.set(-2.5 + c * 0.9, 2.35 + c * 0.5, -3.13);
      scene.add(cloud);
      this.clouds.push(cloud);
    }

    // よぞらのほし（まどの中）
    this.windowStars = [];
    var starMat = new THREE.MeshBasicMaterial({ color: 0xfff2ae, transparent: true, opacity: 0 });
    for (var s = 0; s < 8; s++) {
      var st = new THREE.Mesh(new THREE.CircleGeometry(0.035, 6), starMat.clone());
      st.position.set(-1.9 + (Math.random() - 0.5) * 2.0, 2.6 + (Math.random() - 0.5) * 1.5, -3.13);
      scene.add(st);
      this.windowStars.push(st);
    }

    // カーテン
    var curtMat = lambert(0xffb3cd);
    this.curtL = new THREE.Mesh(new THREE.BoxGeometry(0.5, winH + 0.5, 0.1), curtMat);
    this.curtL.position.set(-1.9 - winW / 2 - 0.2, 2.6, -3.05);
    scene.add(this.curtL);
    this.curtR = new THREE.Mesh(new THREE.BoxGeometry(0.5, winH + 0.5, 0.1), curtMat);
    this.curtR.position.set(-1.9 + winW / 2 + 0.2, 2.6, -3.05);
    scene.add(this.curtR);

    /* --- かざり: たな + おもちゃ --- */
    var shelf = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.5), lambert(0xffffff));
    shelf.position.set(2.6, 1.7, -2.9);
    scene.add(shelf);
    // くまのぬいぐるみ
    var teddy = new THREE.Group();
    var tMat = lambert(0xc08a5a);
    var tBody = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), tMat);
    var tHead = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), tMat);
    tHead.position.y = 0.18;
    var tEarL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), tMat);
    var tEarR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), tMat);
    tEarL.position.set(-0.07, 0.26, 0);
    tEarR.position.set(0.07, 0.26, 0);
    teddy.add(tBody); teddy.add(tHead); teddy.add(tEarL); teddy.add(tEarR);
    teddy.position.set(2.25, 1.87, -2.9);
    scene.add(teddy);
    // つみき
    var blockCols = [0xff6fa5, 0xffd44d, 0x7fd8ff];
    for (var b = 0; b < 3; b++) {
      var blk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), lambert(blockCols[b]));
      blk.position.set(2.75 + (b % 2) * 0.2, 1.83 + Math.floor(b / 2) * 0.17, -2.9);
      blk.rotation.y = b * 0.4;
      scene.add(blk);
    }

    // えほんのがくぶち
    var pic = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshBasicMaterial({ map: FX.emojiTexture('🐘', 128), transparent: true }));
    pic.position.set(1.4, 3.3, -3.14);
    scene.add(pic);
    var picFrame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.05), lambert(0xffe27a));
    picFrame.position.set(1.4, 3.3, -3.17);
    scene.add(picFrame);
    var pic2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), new THREE.MeshBasicMaterial({ map: FX.emojiTexture('🦒', 128), transparent: true }));
    pic2.position.set(3.3, 3.4, -3.14);
    scene.add(pic2);
    var picFrame2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 0.05), lambert(0x9dff8a));
    picFrame2.position.set(3.3, 3.4, -3.17);
    scene.add(picFrame2);

    // かんようしょくぶつ
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.3, 12), lambert(0xe0845c));
    pot.position.set(4.3, 0.15, -2.6);
    scene.add(pot);
    var leaf1 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), lambert(0x7cc96b));
    leaf1.position.set(4.3, 0.6, -2.6);
    leaf1.scale.set(1, 1.4, 1);
    scene.add(leaf1);

    /* --- モビール（てんじょうのかざり） --- */
    this.mobile = new THREE.Group();
    var mobileItems = ['⭐', '🌙', '☁️'];
    for (var mi = 0; mi < 3; mi++) {
      var ma = (mi / 3) * Math.PI * 2;
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.emojiTexture(mobileItems[mi], 64), transparent: true }));
      sp.scale.set(0.3, 0.3, 1);
      sp.position.set(Math.cos(ma) * 0.45, -0.3, Math.sin(ma) * 0.45);
      this.mobile.add(sp);
      var str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), lambert(0xffffff));
      str.position.set(Math.cos(ma) * 0.45, -0.12, Math.sin(ma) * 0.45);
      this.mobile.add(str);
    }
    var mobileBar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8), lambert(0xffffff));
    mobileBar.rotation.z = Math.PI / 2;
    this.mobile.add(mobileBar);
    this.mobile.position.set(1.8, 3.6, -1.5);
    scene.add(this.mobile);
  };

  /* ---------- 昼夜切り替え（f: 0=ひる 1=よる） ---------- */

  World.prototype.setNight = function (f) {
    this.night = f;
    var day = 1 - f;
    this.hemi.intensity = 0.35 + day * 0.33;
    this.dir.intensity = 0.12 + day * 0.26;
    this.nightLight.intensity = f * 0.9;

    this.skyMat.color.setRGB(
      0.62 * day + 0.08 * f,
      0.85 * day + 0.07 * f,
      1.0 * day + 0.25 * f
    );
    this.sun.visible = f < 0.5;
    this.moon.visible = f >= 0.5;
    for (var i = 0; i < this.windowStars.length; i++) {
      this.windowStars[i].material.opacity = Math.max(0, f - 0.4) / 0.6;
    }
    for (var c = 0; c < this.clouds.length; c++) {
      this.clouds[c].material.opacity = 0.95 * day;
    }
  };

  World.prototype.update = function (dt, t) {
    this.mobile.rotation.y = t * 0.4;
    // まどのくもをゆっくりながす
    for (var i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i];
      c.position.x += dt * 0.05;
      if (c.position.x > -0.85) c.position.x = -2.95;
    }
    // よるのほしのまたたき
    if (this.night > 0.5) {
      for (var s = 0; s < this.windowStars.length; s++) {
        this.windowStars[s].material.opacity = (0.5 + 0.5 * Math.sin(t * 3 + s * 1.7)) * this.night;
      }
    }
  };

  window.World = World;
})();
