/* ===== じゃんがりあん ものがたり : おにわのせかい ===== */
window.JG = window.JG || {};

JG.World = (function () {
  var U = JG.U;

  function lam(color) { return new THREE.MeshLambertMaterial({ color: color }); }

  // 花びらの形 (ぎざぎざのまるいお花)
  function flowerShapeGeo(radius, lobes) {
    var shape = new THREE.Shape();
    var steps = 48;
    for (var i = 0; i <= steps; i++) {
      var a = (i / steps) * Math.PI * 2;
      var r = radius * (0.72 + 0.28 * Math.abs(Math.sin(a * lobes / 2)));
      var x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    return new THREE.ShapeGeometry(shape);
  }

  function create(scene) {
    var W = {
      interactives: [],   // レイキャスト対象
      obstacles: [],      // 通れないところ {x,z,r}
      sunflowers: [],
      flowers: [],
      mushrooms: [],
      trees: [],
      apples: [],
      clouds: []
    };

    // ---------- じめん ----------
    var groundGeo = new THREE.CircleGeometry(34, 56);
    groundGeo.rotateX(-Math.PI / 2);
    // 頂点カラーでまだら模様のしばふ
    var pos = groundGeo.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var base = new THREE.Color(0x7ecb62);
    var c = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      var vx = pos.getX(i), vz = pos.getZ(i);
      var n = Math.sin(vx * 0.35) * Math.cos(vz * 0.3) * 0.5 +
              Math.sin(vx * 0.11 + vz * 0.17) * 0.5;
      c.copy(base).offsetHSL(0.012 * n, 0.05 * n, 0.045 * n);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var ground = new THREE.Mesh(groundGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(ground);
    W.ground = ground;

    // まわりのそとがわ (ふんわり広がる草原)
    var outer = new THREE.Mesh(
      new THREE.RingGeometry(33.5, 90, 48),
      new THREE.MeshLambertMaterial({ color: 0x6ab84f })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    scene.add(outer);

    // 小道 (おうちから広場へ)
    var path = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 24),
      new THREE.MeshLambertMaterial({ color: 0xd8c48e })
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(-11, 0.01, -7.5);
    path.scale.set(2.2, 1, 1);
    path.rotation.z = 0.5;
    scene.add(path);

    // ---------- さく ----------
    var fenceG = new THREE.Group();
    var postGeo = new THREE.BoxGeometry(0.24, 1.0, 0.24);
    var postMat = lam(0xfff6ea);
    var FR = 30;
    for (var p = 0; p < 36; p++) {
      var a = (p / 36) * Math.PI * 2;
      var post = new THREE.Mesh(postGeo, postMat);
      post.position.set(Math.cos(a) * FR, 0.5, Math.sin(a) * FR);
      post.rotation.y = -a;
      fenceG.add(post);
    }
    var railGeo = new THREE.TorusGeometry(FR, 0.07, 6, 72);
    var rail1 = new THREE.Mesh(railGeo, postMat);
    rail1.rotation.x = Math.PI / 2;
    rail1.position.y = 0.75;
    var rail2 = rail1.clone();
    rail2.position.y = 0.4;
    fenceG.add(rail1, rail2);
    scene.add(fenceG);

    // ---------- そら ----------
    var sun = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, fog: false }));
    var sunHalo = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.3, fog: false }));
    sun.add(sunHalo);
    scene.add(sun);
    W.sun = sun;

    var moon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
    var moonHole = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x27305e, fog: false }));
    moonHole.position.set(0.9, 0.35, 0.6);
    moon.add(moonHole);
    scene.add(moon);
    W.moon = moon;

    // ほし
    var starCount = 220;
    var starPos = new Float32Array(starCount * 3);
    for (var si = 0; si < starCount; si++) {
      var sa = Math.random() * Math.PI * 2;
      var sh = Math.random();
      var sr = 55 + Math.random() * 25;
      var y = 12 + sh * 55;
      starPos[si * 3] = Math.cos(sa) * sr;
      starPos[si * 3 + 1] = y;
      starPos[si * 3 + 2] = Math.sin(sa) * sr;
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    var starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.7, transparent: true, opacity: 0,
      map: JG.FX.starTex(), depthWrite: false, fog: false
    });
    var stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    scene.add(stars);
    W.stars = stars;

    // くも
    for (var ci = 0; ci < 5; ci++) {
      var cloud = new THREE.Group();
      var cm = new THREE.MeshLambertMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35,
        transparent: true, opacity: 0.92
      });
      var nb = U.randInt(3, 4);
      for (var cj = 0; cj < nb; cj++) {
        var puff = new THREE.Mesh(new THREE.SphereGeometry(U.rand(1.4, 2.3), 10, 8), cm);
        puff.position.set(cj * 1.8 - nb * 0.9, U.rand(-0.3, 0.3), U.rand(-0.6, 0.6));
        puff.scale.y = 0.6;
        cloud.add(puff);
      }
      cloud.position.set(U.rand(-30, 30), U.rand(16, 24), U.rand(-35, 5));
      cloud.userData.speed = U.rand(0.25, 0.6);
      scene.add(cloud);
      W.clouds.push(cloud);
    }

    // ホタル (よるだけ)
    var flyCount = 40;
    var flyPos = new Float32Array(flyCount * 3);
    var flySeeds = [];
    for (var fi = 0; fi < flyCount; fi++) {
      var fa = Math.random() * Math.PI * 2;
      var fr = U.rand(3, 26);
      flyPos[fi * 3] = Math.cos(fa) * fr;
      flyPos[fi * 3 + 1] = U.rand(0.5, 3);
      flyPos[fi * 3 + 2] = Math.sin(fa) * fr;
      flySeeds.push(Math.random() * 10);
    }
    var flyGeo = new THREE.BufferGeometry();
    flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
    var flyMat = new THREE.PointsMaterial({
      color: 0xd8ff7a, size: 0.42, transparent: true, opacity: 0,
      map: JG.FX.circleTex(), depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var fireflies = new THREE.Points(flyGeo, flyMat);
    fireflies.frustumCulled = false;
    scene.add(fireflies);
    W.fireflies = fireflies;
    W.fireflySeeds = flySeeds;

    // ---------- いけ ----------
    var pondX = 14, pondZ = 10, pondR = 5.5;
    var pond = new THREE.Mesh(
      new THREE.CircleGeometry(pondR, 32),
      new THREE.MeshLambertMaterial({ color: 0x5fc8e8, transparent: true, opacity: 0.9 })
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(pondX, 0.02, pondZ);
    scene.add(pond);
    var pondRim = new THREE.Mesh(
      new THREE.RingGeometry(pondR, pondR + 0.7, 32),
      lam(0xdec98e)
    );
    pondRim.rotation.x = -Math.PI / 2;
    pondRim.position.set(pondX, 0.015, pondZ);
    scene.add(pondRim);
    // なみもよう
    var ripples = [];
    for (var ri = 0; ri < 3; ri++) {
      var rp = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.13, 24),
        new THREE.MeshBasicMaterial({ color: 0xbdeeff, transparent: true, opacity: 0.6 })
      );
      rp.rotation.x = -Math.PI / 2;
      rp.position.set(pondX, 0.05, pondZ);
      rp.userData.phase = ri / 3;
      scene.add(rp);
      ripples.push(rp);
    }
    W.pond = { x: pondX, z: pondZ, r: pondR, ripples: ripples };
    // いしのとびいし
    for (var st = 0; st < 3; st++) {
      var stone = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), lam(0xb8b2a8));
      stone.scale.y = 0.35;
      stone.position.set(pondX - 3 + st * 2.6, 0.1, pondZ + (st % 2 === 0 ? 0.8 : -0.6));
      scene.add(stone);
    }

    // ---------- おうち ----------
    var houseX = -14, houseZ = -10;
    var houseG = new THREE.Group();
    var dome = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      lam(0xffb46e)
    );
    houseG.add(dome);
    var roofTop = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), lam(0x8ecf6a));
    roofTop.position.y = 2.6;
    houseG.add(roofTop);
    var door = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 14, 1, false, 0, Math.PI), lam(0x7a4a2a));
    door.rotation.z = Math.PI / 2;
    door.rotation.y = Math.PI / 2;
    door.position.set(0, 0.45, 2.45);
    door.scale.set(1, 0.3, 1.2);
    houseG.add(door);
    var chim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.0, 8), lam(0xe86a5a));
    chim.position.set(1.2, 2.3, -0.6);
    houseG.add(chim);
    // まど
    var winGeo = new THREE.CircleGeometry(0.42, 12);
    var winMat = new THREE.MeshBasicMaterial({ color: 0xfff2ae });
    var win1 = new THREE.Mesh(winGeo, winMat);
    win1.position.set(-1.65, 1.15, 1.62);
    win1.lookAt(new THREE.Vector3(-3.3, 1.7, 3.4));
    houseG.add(win1);
    houseG.position.set(houseX, 0, houseZ);
    houseG.rotation.y = 0.6;
    scene.add(houseG);
    // とびらのまえ (たねをとどける場所)
    var doorDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
    var doorPos = { x: houseX + doorDir.x * 3.2, z: houseZ + doorDir.z * 3.2 };
    W.house = { group: houseG, x: houseX, z: houseZ, doorX: doorPos.x, doorZ: doorPos.z };
    W.obstacles.push({ x: houseX, z: houseZ, r: 2.9 });
    houseG.traverse(function (o) { o.userData.type = 'house'; });
    W.interactives.push(houseG);

    // おうちのサインボード (たくわえたたねのかず)
    var signCanvas = document.createElement('canvas');
    signCanvas.width = 256; signCanvas.height = 128;
    var signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    var sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false }));
    sign.scale.set(2.9, 1.45, 1);
    sign.position.set(houseX, 3.35, houseZ);
    scene.add(sign);
    W.updateSign = function (stored) {
      var g = signCanvas.getContext('2d');
      g.clearRect(0, 0, 256, 128);
      g.fillStyle = 'rgba(255,255,255,0.94)';
      var r = 26;
      g.beginPath();
      g.roundRect(8, 18, 240, 92, r);
      g.fill();
      g.strokeStyle = '#ffb85c';
      g.lineWidth = 8;
      g.stroke();
      // ひまわりのたねアイコン
      g.fillStyle = '#6b4a2a';
      g.beginPath();
      g.ellipse(52, 64, 16, 24, 0.35, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#f2e2b8';
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(52, 64, 9, 16, 0.35, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#7a4a12';
      g.font = 'bold 58px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('× ' + stored, 152, 66);
      signTex.needsUpdate = true;
    };
    W.updateSign(0);

    // ---------- かいしゃぐるま (まわしぐるま) ----------
    var wheelX = 13, wheelZ = -12;
    var wheelG = new THREE.Group();
    var wheelSpin = new THREE.Group();  // まわる部分
    var wheelRing = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.14, 10, 28), lam(0xff8bb8));
    wheelSpin.add(wheelRing);
    var wheelRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.09, 8, 22), lam(0xffc2da));
    wheelSpin.add(wheelRing2);
    var spokeGeo = new THREE.BoxGeometry(0.12, 3.3, 0.12);
    for (var sp2 = 0; sp2 < 3; sp2++) {
      var spoke = new THREE.Mesh(spokeGeo, lam(0xffc2da));
      spoke.rotation.z = sp2 * Math.PI / 3;
      wheelSpin.add(spoke);
    }
    wheelSpin.position.y = 2.0;
    wheelG.add(wheelSpin);
    var standGeo = new THREE.BoxGeometry(0.24, 2.1, 0.24);
    var standMat = lam(0xc98a5a);
    var standL = new THREE.Mesh(standGeo, standMat);
    standL.position.set(0, 1.0, -0.55);
    standL.rotation.x = 0.22;
    var standR = new THREE.Mesh(standGeo, standMat);
    standR.position.set(0, 1.0, 0.55);
    standR.rotation.x = -0.22;
    wheelG.add(standL, standR);
    var axle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 8), standMat);
    axle.rotation.x = Math.PI / 2;
    axle.position.y = 2.0;
    wheelG.add(axle);
    var wheelBase = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.18, 14), lam(0xd8c48e));
    wheelBase.position.y = 0.09;
    wheelG.add(wheelBase);
    wheelG.position.set(wheelX, 0, wheelZ);
    wheelG.rotation.y = -0.5;
    scene.add(wheelG);
    W.wheel = { group: wheelG, spin: wheelSpin, x: wheelX, z: wheelZ };
    wheelG.traverse(function (o) { o.userData.type = 'wheel'; });
    W.interactives.push(wheelG);

    // ---------- ひまわりばたけ ----------
    var petalGeoBig = flowerShapeGeo(0.72, 12);
    for (var sf = 0; sf < 9; sf++) {
      var fg = new THREE.Group();
      var hgt = U.rand(1.7, 2.5);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, hgt, 6), lam(0x4e9e3d));
      stem.position.y = hgt / 2;
      fg.add(stem);
      var headg = new THREE.Group();
      headg.position.y = hgt;
      var petals = new THREE.Mesh(petalGeoBig, new THREE.MeshLambertMaterial({
        color: 0xffcf33, side: THREE.DoubleSide
      }));
      headg.add(petals);
      var center = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), lam(0x8a5a2a));
      center.scale.z = 0.5;
      center.position.z = 0.05;
      headg.add(center);
      fg.add(headg);
      var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lam(0x5cb04a));
      leaf.scale.set(1.6, 0.3, 0.8);
      leaf.position.set(0.25, hgt * 0.45, 0);
      fg.add(leaf);
      var ang = U.rand(0, Math.PI * 2);
      var rad = U.rand(0, 4.2);
      fg.position.set(-13 + Math.cos(ang) * rad, 0, 12 + Math.sin(ang) * rad);
      // おひさまのほうをむく
      headg.rotation.y = Math.PI + U.rand(-0.5, 0.5);
      headg.rotation.x = U.rand(-0.15, 0.15);
      fg.userData.type = 'sunflower';
      fg.userData.phase = Math.random() * 10;
      fg.userData.cool = 0;
      fg.userData.headg = headg;
      fg.traverse(function (o) { o.userData.root = fg; o.userData.type = 'sunflower'; });
      scene.add(fg);
      W.sunflowers.push(fg);
      W.interactives.push(fg);
    }

    // ---------- ちいさなおはな ----------
    var smallPetal = flowerShapeGeo(0.3, 10);
    var flowerColors = [0xff8fb8, 0xffffff, 0xc79aff, 0xffb36a, 0x8ad4ff];
    for (var fl = 0; fl < 16; fl++) {
      var fg2 = new THREE.Group();
      var h2 = U.rand(0.5, 0.85);
      var stem2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h2, 5), lam(0x55a648));
      stem2.position.y = h2 / 2;
      fg2.add(stem2);
      var head2 = new THREE.Group();
      head2.position.y = h2;
      var col2 = U.pick(flowerColors);
      var pet2 = new THREE.Mesh(smallPetal, new THREE.MeshLambertMaterial({
        color: col2, side: THREE.DoubleSide
      }));
      pet2.rotation.x = -Math.PI / 2 + 0.35;
      head2.add(pet2);
      var cen2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lam(0xffe066));
      head2.add(cen2);
      fg2.add(head2);
      var aa2 = Math.random() * Math.PI * 2;
      var rr2 = U.rand(5, 27);
      var fx = Math.cos(aa2) * rr2, fz = Math.sin(aa2) * rr2;
      // いけ・おうち・くるまの上はさける
      if (U.dist2d(fx, fz, pondX, pondZ) < pondR + 1.5 ||
          U.dist2d(fx, fz, houseX, houseZ) < 4 ||
          U.dist2d(fx, fz, wheelX, wheelZ) < 3) { fl--; continue; }
      fg2.position.set(fx, 0, fz);
      fg2.userData.type = 'flower';
      fg2.userData.phase = Math.random() * 10;
      fg2.userData.color = col2;
      fg2.userData.pop = 0;
      fg2.traverse(function (o) { o.userData.root = fg2; o.userData.type = 'flower'; });
      scene.add(fg2);
      W.flowers.push(fg2);
      W.interactives.push(fg2);
    }

    // ---------- き (りんごの木 と もりのき) ----------
    function makeTree(x, z, withApples) {
      var tg = new THREE.Group();
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.62, 2.6, 8), lam(0x9a6a42));
      trunk.position.y = 1.3;
      tg.add(trunk);
      var canMat = lam(withApples ? 0x66bb55 : 0x5aad68);
      var puffs = [
        [0, 3.4, 0, 1.7], [-1.2, 2.9, 0.3, 1.2], [1.2, 2.9, -0.2, 1.25], [0.2, 2.8, 1.1, 1.1]
      ];
      for (var pi = 0; pi < puffs.length; pi++) {
        var pf = new THREE.Mesh(new THREE.SphereGeometry(puffs[pi][3], 12, 10), canMat);
        pf.position.set(puffs[pi][0], puffs[pi][1], puffs[pi][2]);
        tg.add(pf);
      }
      tg.position.set(x, 0, z);
      tg.userData.type = 'tree';
      tg.userData.shake = 0;
      tg.userData.withApples = withApples;
      tg.traverse(function (o) { o.userData.root = tg; o.userData.type = 'tree'; });
      scene.add(tg);
      W.trees.push(tg);
      W.interactives.push(tg);
      W.obstacles.push({ x: x, z: z, r: 1.1 });
      if (withApples) {
        for (var ai = 0; ai < 4; ai++) {
          var apple = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), lam(0xff5a4a));
          var st2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 5), lam(0x6a4a2a));
          st2.position.y = 0.3;
          apple.add(st2);
          var aa3 = (ai / 4) * Math.PI * 2 + 0.5;
          apple.position.set(x + Math.cos(aa3) * 1.35, U.rand(2.6, 3.5), z + Math.sin(aa3) * 1.35);
          apple.userData.state = 'tree'; // tree | falling | ground
          apple.userData.vy = 0;
          scene.add(apple);
          W.apples.push(apple);
        }
      }
      return tg;
    }
    makeTree(0, -20, true);        // りんごの木
    makeTree(-22, 6, false);
    makeTree(20, -3, false);
    makeTree(-6, 22, false);

    // ---------- きのこ (とびばこ!) ----------
    var mushSpots = [[-2, 16], [0.5, 17.5], [-3.5, 18.3]];
    for (var mi = 0; mi < mushSpots.length; mi++) {
      var mg = new THREE.Group();
      var stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.7, 10), lam(0xfff2e0));
      stalk.position.y = 0.35;
      mg.add(stalk);
      var cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        lam(0xff6a5a)
      );
      cap.position.y = 0.62;
      cap.scale.y = 0.75;
      mg.add(cap);
      for (var di = 0; di < 3; di++) {
        var dot2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), lam(0xffffff));
        var da = di * 2.1 + mi;
        dot2.position.set(Math.cos(da) * 0.4, 0.85, Math.sin(da) * 0.4);
        dot2.scale.y = 0.5;
        mg.add(dot2);
      }
      mg.position.set(mushSpots[mi][0], 0, mushSpots[mi][1]);
      mg.userData.type = 'mushroom';
      mg.userData.squish = 0;
      mg.traverse(function (o) { o.userData.root = mg; o.userData.type = 'mushroom'; });
      scene.add(mg);
      W.mushrooms.push(mg);
      W.interactives.push(mg);
    }

    // ---------- ボールとゴール ----------
    var ballCanvas = document.createElement('canvas');
    ballCanvas.width = 128; ballCanvas.height = 64;
    var bg = ballCanvas.getContext('2d');
    var stripes = ['#ff5c8a', '#ffd93b', '#5fc8e8', '#8ecf6a', '#ff9a3b', '#c79aff'];
    for (var bi = 0; bi < 6; bi++) {
      bg.fillStyle = stripes[bi];
      bg.fillRect((128 / 6) * bi, 0, 128 / 6 + 1, 64);
    }
    var ballTex = new THREE.CanvasTexture(ballCanvas);
    ballTex.colorSpace = THREE.SRGBColorSpace;
    var ball = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 14),
      new THREE.MeshLambertMaterial({ map: ballTex }));
    ball.position.set(5, 0.85, 3);
    ball.userData.type = 'ball';
    scene.add(ball);
    W.ball = ball;
    W.interactives.push(ball);

    var goalG = new THREE.Group();
    var postMat2 = lam(0xffffff);
    var postGeo2 = new THREE.CylinderGeometry(0.14, 0.14, 2.2, 8);
    var postA = new THREE.Mesh(postGeo2, postMat2);
    postA.position.set(0, 1.1, -2.4);
    var postB = new THREE.Mesh(postGeo2, postMat2);
    postB.position.set(0, 1.1, 2.4);
    var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 4.8, 8), postMat2);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = 2.2;
    goalG.add(postA, postB, bar);
    goalG.position.set(24, 0, -2);
    scene.add(goalG);
    W.goal = { x: 24, z: -2, halfW: 2.4 };

    // ---------- にじ ----------
    var rainbowG = new THREE.Group();
    var rcolors = [0xff5a5a, 0xffa53b, 0xffe14d, 0x74d05f, 0x58b8f0, 0x9a7af0];
    for (var rci = 0; rci < rcolors.length; rci++) {
      var arc = new THREE.Mesh(
        new THREE.TorusGeometry(11 - rci * 0.55, 0.28, 8, 40, Math.PI),
        new THREE.MeshBasicMaterial({
          color: rcolors[rci], transparent: true, opacity: 0, fog: false
        })
      );
      rainbowG.add(arc);
    }
    rainbowG.position.set(-6, 0.5, -24);
    rainbowG.rotation.y = 0.25;
    scene.add(rainbowG);
    W.rainbow = { group: rainbowG, show: 0 };

    // その他の障害物
    W.obstacles.push({ x: wheelX, z: wheelZ, r: 1.8 });

    // ---------- せかいの時間アニメ ----------
    W.update = function (dt, t, night) {
      // くも
      for (var i2 = 0; i2 < W.clouds.length; i2++) {
        var cl = W.clouds[i2];
        cl.position.x += cl.userData.speed * dt;
        if (cl.position.x > 42) cl.position.x = -42;
      }
      // いけのなみ
      for (var r2 = 0; r2 < W.pond.ripples.length; r2++) {
        var rp2 = W.pond.ripples[r2];
        var ph2 = ((t * 0.35) + rp2.userData.phase) % 1;
        var sc = 0.5 + ph2 * (W.pond.r - 0.8);
        rp2.scale.setScalar(sc);
        rp2.material.opacity = 0.55 * (1 - ph2);
      }
      // おはなのゆらゆら
      for (var f2 = 0; f2 < W.flowers.length; f2++) {
        var fw = W.flowers[f2];
        var sway = Math.sin(t * 1.6 + fw.userData.phase) * 0.08;
        fw.rotation.z = sway + fw.userData.pop * Math.sin(t * 30) * 0.25;
        if (fw.userData.pop > 0) fw.userData.pop = Math.max(0, fw.userData.pop - dt);
      }
      for (var s2 = 0; s2 < W.sunflowers.length; s2++) {
        var sf2 = W.sunflowers[s2];
        sf2.rotation.z = Math.sin(t * 1.1 + sf2.userData.phase) * 0.05;
        if (sf2.userData.cool > 0) sf2.userData.cool -= dt;
      }
      // きのゆれ
      for (var t2 = 0; t2 < W.trees.length; t2++) {
        var tr = W.trees[t2];
        if (tr.userData.shake > 0) {
          tr.userData.shake -= dt;
          tr.rotation.z = Math.sin(tr.userData.shake * 30) * 0.06 * tr.userData.shake;
        } else {
          tr.rotation.z = 0;
        }
      }
      // きのこのむにゅ
      for (var m2 = 0; m2 < W.mushrooms.length; m2++) {
        var mu = W.mushrooms[m2];
        if (mu.userData.squish > 0) {
          mu.userData.squish -= dt * 2;
          var q = Math.max(0, mu.userData.squish);
          mu.scale.y = 1 - Math.sin(q * Math.PI) * 0.35;
          mu.scale.x = mu.scale.z = 1 + Math.sin(q * Math.PI) * 0.2;
        }
      }
      // りんごのおちる
      for (var a2 = 0; a2 < W.apples.length; a2++) {
        var ap = W.apples[a2];
        if (ap.userData.state === 'falling') {
          ap.userData.vy -= 14 * dt;
          ap.position.y += ap.userData.vy * dt;
          ap.rotation.z += dt * 4;
          if (ap.position.y <= 0.26) {
            ap.position.y = 0.26;
            ap.userData.state = 'ground';
            ap.rotation.z = 0;
          }
        } else if (ap.userData.state === 'ground') {
          ap.rotation.y += dt * 0.5;
        }
      }
      // ホタル
      if (night > 0.05) {
        var fp = W.fireflies.geometry.attributes.position.array;
        for (var f3 = 0; f3 < W.fireflySeeds.length; f3++) {
          var sd = W.fireflySeeds[f3];
          fp[f3 * 3] += Math.sin(t * 0.7 + sd * 3) * 0.35 * dt;
          fp[f3 * 3 + 1] += Math.cos(t * 0.9 + sd * 5) * 0.3 * dt;
          fp[f3 * 3 + 2] += Math.cos(t * 0.6 + sd * 2) * 0.35 * dt;
          if (fp[f3 * 3 + 1] < 0.4) fp[f3 * 3 + 1] = 0.4;
          if (fp[f3 * 3 + 1] > 3.6) fp[f3 * 3 + 1] = 3.6;
        }
        W.fireflies.geometry.attributes.position.needsUpdate = true;
        W.fireflies.material.opacity = night * (0.55 + 0.45 * Math.sin(t * 2.2));
      } else {
        W.fireflies.material.opacity = 0;
      }
      // にじ
      var rb = W.rainbow;
      var target = rb.show > 0 ? 0.75 : 0;
      for (var rc2 = 0; rc2 < rb.group.children.length; rc2++) {
        var arc2 = rb.group.children[rc2];
        arc2.material.opacity = U.lerp(arc2.material.opacity, target, U.damp(2.5, dt));
      }
      if (rb.show > 0) rb.show -= dt;
    };

    return W;
  }

  return { create: create };
})();
