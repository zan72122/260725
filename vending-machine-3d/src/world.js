/* ============================================================
 * world.js — まわりの風景（歩道・建物・空・リサイクルボックス・照明）
 * ============================================================ */
(function () {
  'use strict';

  var U = window.VMUtil;
  var JP = window.VMProducts.JP_FONT;

  function create(scene) {
    var W = {};

    /* ---------------- 空 ---------------- */
    var skyTex = U.canvasTexture(16, 256, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0.00, '#4aa3e8');
      g.addColorStop(0.38, '#8fd0f5');
      g.addColorStop(0.68, '#cfeaff');
      g.addColorStop(1.00, '#f2f7fb');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(40, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false })
    );
    sky.position.y = 4;
    scene.add(sky);
    W.sky = sky;

    scene.fog = new THREE.Fog(0xcfe6f7, 12, 42);

    /* ---------------- 地面（歩道のタイル） ---------------- */
    var tileTex = U.canvasTexture(512, 512, function (ctx, w, h) {
      ctx.fillStyle = '#b9bcbd'; ctx.fillRect(0, 0, w, h);
      var n = 4, s = w / n;
      for (var i = 0; i < n; i++) {
        for (var j = 0; j < n; j++) {
          var v = 176 + Math.floor(Math.random() * 22);
          ctx.fillStyle = 'rgb(' + v + ',' + (v + 2) + ',' + (v + 1) + ')';
          ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
          // タイルの粒状感
          ctx.fillStyle = 'rgba(0,0,0,0.05)';
          for (var k = 0; k < 40; k++) {
            ctx.fillRect(i * s + 3 + Math.random() * (s - 6), j * s + 3 + Math.random() * (s - 6), 2, 2);
          }
        }
      }
      U.addNoise(ctx, w, h, 16);
    });
    tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
    tileTex.repeat.set(14, 14);
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.95, metalness: 0.0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    W.ground = ground;

    /* ---------------- 建物の壁（自販機の背面） ---------------- */
    var wallTex = U.canvasTexture(512, 512, function (ctx, w, h) {
      ctx.fillStyle = '#d9d2c4'; ctx.fillRect(0, 0, w, h);
      // タイル目地
      ctx.strokeStyle = 'rgba(150,142,128,0.55)'; ctx.lineWidth = 2;
      for (var y = 0; y < h; y += 32) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        var off = (y / 32) % 2 ? 32 : 0;
        for (var x = off; x < w; x += 64) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke();
        }
      }
      U.addNoise(ctx, w, h, 14);
    });
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(6, 3);
    var wall = new THREE.Mesh(
      new THREE.BoxGeometry(18, 6.5, 0.4),
      new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92 })
    );
    wall.position.set(0, 3.25, -0.75);
    wall.receiveShadow = true;
    scene.add(wall);
    W.wall = wall;

    // ひさし
    var eave = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.10, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x3b4a56, roughness: 0.6, metalness: 0.3 })
    );
    eave.position.set(0, 2.42, -0.10);
    eave.castShadow = true;
    scene.add(eave);
    [-2.9, 2.9].forEach(function (x) {
      var post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 2.4, 10),
        new THREE.MeshStandardMaterial({ color: 0x4b5a66, roughness: 0.5, metalness: 0.45 })
      );
      post.position.set(x, 1.2, 0.55);
      post.castShadow = true;
      scene.add(post);
    });

    /* ---------------- リサイクルボックス ---------------- */
    var recycle = new THREE.Group();
    recycle.position.set(1.62, 0, 0.05);
    scene.add(recycle);
    (function () {
      var bodyMat = new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: 0.55, metalness: 0.25 });
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.86, 0.46), bodyMat);
      body.position.y = 0.43;
      recycle.add(body);
      var top = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.50),
        new THREE.MeshStandardMaterial({ color: 0x1f5c39, roughness: 0.6 }));
      top.position.y = 0.89;
      recycle.add(top);
      // 投入口（缶用・ペット用）
      [-0.12, 0.12].forEach(function (x, i) {
        var holeM = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.08, 16),
          new THREE.MeshStandardMaterial({ color: 0x0d1a12, roughness: 0.95 }));
        holeM.position.set(x, 0.88, 0);
        recycle.add(holeM);
      });
      var lblTex = U.canvasTexture(512, 256, function (ctx, w, h) {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#2f7d4f'; ctx.fillRect(0, 0, w, 26);
        U.fitText(ctx, 'あきかん・あきびん', w / 2, h * 0.40, w * 0.9, 62, JP, '#1f5c39');
        U.fitText(ctx, 'ここに いれてね', w / 2, h * 0.74, w * 0.8, 50, JP, '#5a6b60');
      });
      var lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22),
        new THREE.MeshBasicMaterial({ map: lblTex }));
      lbl.position.set(0, 0.56, 0.232);
      recycle.add(lbl);

      var hit = new THREE.Mesh(new THREE.BoxGeometry(0.60, 1.0, 0.55),
        new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.5;
      hit.userData.vm = { action: 'recycle' };
      recycle.add(hit);
      recycle.userData.hit = hit;
      recycle.userData.mouthY = 0.93;
      U.shadow(recycle, true, true);
    })();
    W.recycle = recycle;

    /* ---------------- 植え込み ---------------- */
    (function () {
      var planter = new THREE.Group();
      planter.position.set(-1.75, 0, 0.10);
      var pot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.30, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x9c9086, roughness: 0.95 }));
      pot.position.y = 0.15; planter.add(pot);
      var soil = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.44),
        new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 1 }));
      soil.position.y = 0.30; planter.add(soil);
      for (var i = 0; i < 7; i++) {
        var leaf = new THREE.Mesh(
          new THREE.SphereGeometry(U.rand(0.09, 0.15), 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.9 })
        );
        leaf.position.set(U.rand(-0.14, 0.14), 0.34 + U.rand(0, 0.20), U.rand(-0.14, 0.14));
        leaf.scale.y = 0.8;
        planter.add(leaf);
      }
      U.shadow(planter, true, true);
      scene.add(planter);
      W.planter = planter;
    })();

    /* ---------------- 照明 ---------------- */
    var hemi = new THREE.HemisphereLight(0xdff0ff, 0x8f8578, 0.72);
    hemi.position.set(0, 6, 0);
    scene.add(hemi);

    var sun = new THREE.DirectionalLight(0xfff3e0, 1.15);
    sun.position.set(2.6, 5.2, 4.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 16;
    sun.shadow.camera.left = -3.2;
    sun.shadow.camera.right = 3.2;
    sun.shadow.camera.top = 3.2;
    sun.shadow.camera.bottom = -1.0;
    sun.shadow.bias = -0.0016;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    sun.target.position.set(0, 0.9, 0);
    W.sun = sun;

    // 正面からの補助光（自販機の顔が暗くならないように）
    var fill = new THREE.DirectionalLight(0xffffff, 0.34);
    fill.position.set(-1.5, 2.0, 5.0);
    scene.add(fill);
    W.fill = fill;

    var amb = new THREE.AmbientLight(0xffffff, 0.22);
    scene.add(amb);

    return W;
  }

  window.VMWorld = { create: create };
})();
