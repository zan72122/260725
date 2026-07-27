/* ============================================================
 * machine_base.js — 自販機のシャーシ（筐体＋前扉＋金銭ユニット＋取出口）
 *   飲料機とお菓子機で共通の「ガワ」をここで組み立てる。
 *   前面は実機と同じく「一枚の大きな扉」で、左端ヒンジで開く。
 * ============================================================ */
(function () {
  'use strict';

  var U = window.VMUtil;
  var P = window.VMParts;
  var JP = window.VMProducts.JP_FONT;

  /**
   * @param {object} cfg
   *   W,H,D          : 寸法
   *   bodyColor      : 本体色
   *   title          : ヘッダー文字
   *   windowRect     : {x0,y0,x1,y1} 陳列窓の開口
   *   portRect       : {x0,y0,x1,y1} 取出口の開口
   *   trayRect       : {x0,y0,x1,y1} 釣銭受けの開口
   *   money          : {display:[x,y], bill:[x,y], coin:[x,y], lever:[x,y], lock:[x,y]}
   */
  function buildChassis(cfg) {
    var W = cfg.W, H = cfg.H, D = cfg.D;
    var frontZ = D / 2;                 // 前面の位置
    var skinD = 0.030;                  // 扉の板厚

    var root = new THREE.Group();
    var cabinet = P.cabinet(W, H, D, cfg.bodyColor);
    root.add(cabinet);

    /* ---------- 前扉 ---------- */
    var doorPivot = new THREE.Group();
    doorPivot.position.set(-W / 2 + 0.01, 0, frontZ - skinD);
    root.add(doorPivot);
    var door = new THREE.Group();
    door.position.set(W / 2 - 0.01, 0, -(frontZ - skinD));  // 機体ローカル座標をそのまま使えるように戻す
    doorPivot.add(door);

    /* 前面スキン（開口を穴として抜いた一枚板） */
    var shape = new THREE.Shape();
    shape.moveTo(-W / 2, 0);
    shape.lineTo(W / 2, 0);
    shape.lineTo(W / 2, H);
    shape.lineTo(-W / 2, H);
    shape.lineTo(-W / 2, 0);

    function hole(r) {
      var p = new THREE.Path();
      p.moveTo(r.x0, r.y0);
      p.lineTo(r.x0, r.y1);
      p.lineTo(r.x1, r.y1);
      p.lineTo(r.x1, r.y0);
      p.lineTo(r.x0, r.y0);
      shape.holes.push(p);
    }
    hole(cfg.windowRect);
    hole(cfg.portRect);
    hole(cfg.trayRect);

    var skinGeo = new THREE.ExtrudeGeometry(shape, { depth: skinD, bevelEnabled: false });
    var skinMat = new THREE.MeshStandardMaterial({
      color: cfg.bodyColor, roughness: 0.42, metalness: 0.24
    });
    var skin = new THREE.Mesh(skinGeo, skinMat);
    skin.position.z = frontZ - skinD;
    door.add(skin);

    // 扉の裏板（内側から見たときの見た目）
    var backPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.8, side: THREE.BackSide })
    );
    backPlate.position.set(0, H / 2, frontZ - skinD - 0.001);
    door.add(backPlate);

    // 開口まわりの内壁（板厚が見えるように）
    function jamb(r) {
      var g = new THREE.Group();
      var m = new THREE.MeshStandardMaterial({ color: U.shade(cfg.bodyColor, -0.25), roughness: 0.6 });
      var w = r.x1 - r.x0, h = r.y1 - r.y0, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
      var top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, skinD), m);
      top.position.set(cx, r.y1, frontZ - skinD / 2); g.add(top);
      var bot = top.clone(); bot.position.y = r.y0; g.add(bot);
      var lf = new THREE.Mesh(new THREE.BoxGeometry(0.004, h, skinD), m);
      lf.position.set(r.x0, cy, frontZ - skinD / 2); g.add(lf);
      var rt = lf.clone(); rt.position.x = r.x1; g.add(rt);
      door.add(g);
    }
    jamb(cfg.windowRect); jamb(cfg.portRect); jamb(cfg.trayRect);

    /* ---------- ヘッダー看板 ---------- */
    var headerH = H - cfg.windowRect.y1 - 0.02;
    var header = P.header(W, headerH * 0.86, cfg.title, cfg.headerColor || cfg.bodyColor);
    header.position.set(0, cfg.windowRect.y1 + headerH / 2 + 0.01, frontZ + 0.004);
    door.add(header);

    /* ---------- 金銭ユニット ---------- */
    var money = cfg.money;
    var faceZ = frontZ + 0.001;

    var display = P.creditDisplay(0.30, 0.105);
    display.position.set(money.display[0], money.display[1], faceZ);
    door.add(display);

    var billSlot = P.billSlot();
    billSlot.position.set(money.bill[0], money.bill[1], faceZ);
    door.add(billSlot);

    var coinSlot = P.coinSlot();
    coinSlot.position.set(money.coin[0], money.coin[1], faceZ);
    door.add(coinSlot);

    var lever = P.returnLever();
    lever.position.set(money.lever[0], money.lever[1], faceZ);
    door.add(lever);

    var lock = P.keyLock();
    lock.position.set(money.lock[0], money.lock[1], faceZ);
    door.add(lock);

    /* 案内パネル（おかねを いれてね） */
    var guideTex = U.canvasTexture(512, 128, function (ctx, w, h) {
      var grd = U.vGrad(ctx, 0, 0, h, [[0, '#ffffff'], [1, '#e6ebf0']]);
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(0, 0, w, 8);
      U.fitText(ctx, 'おかねを いれてね', w / 2, h * 0.56, w * 0.88, 62, JP, '#22303c');
    });
    var gc = cfg.guide || { size: [0.42, 0.088], pos: [money.display[0] + 0.06, money.display[1] - 0.105] };
    var guide = new THREE.Mesh(
      new THREE.PlaneGeometry(gc.size[0], gc.size[1]),
      new THREE.MeshBasicMaterial({ map: guideTex })
    );
    guide.position.set(gc.pos[0], gc.pos[1], faceZ);
    door.add(guide);

    /* ---------- 取出口 ---------- */
    var pr = cfg.portRect;
    var port = P.deliveryPort(pr.x1 - pr.x0, pr.y1 - pr.y0, cfg.portDepth || 0.28);
    port.position.set((pr.x0 + pr.x1) / 2, (pr.y0 + pr.y1) / 2, frontZ);
    door.add(port);
    // 取出口の絶対座標での床の高さ（商品が着地する高さ）
    port.userData.worldFloorY = (pr.y0 + pr.y1) / 2 + port.userData.binFloorY;

    /* ---------- 釣銭受け ---------- */
    var tr = cfg.trayRect;
    var tray = P.changeTray(tr.x1 - tr.x0, tr.y1 - tr.y0, 0.10);
    tray.position.set((tr.x0 + tr.x1) / 2, (tr.y0 + tr.y1) / 2, frontZ);
    door.add(tray);
    tray.userData.worldFloorY = (tr.y0 + tr.y1) / 2 + tray.userData.floorY;

    /* ---------- 扉のマテリアルを個体化（X線モードで他機に影響しないように） ---------- */
    var xrayList = [];
    function entry(mesh, m) {
      return { mesh: mesh, mat: m, base: m.opacity, wasT: m.transparent, wasDW: m.depthWrite };
    }
    door.traverse(function (o) {
      if (!o.isMesh) return;
      if (Array.isArray(o.material)) {
        o.material = o.material.map(function (m) { return m.clone(); });
        o.material.forEach(function (m) { xrayList.push(entry(o, m)); });
      } else {
        o.material = o.material.clone();
        xrayList.push(entry(o, o.material));
      }
    });

    /* ---------- 扉の開閉 ---------- */
    var doorOpen = false;
    function setDoorOpen(v, onDone) {
      if (doorOpen === v) { if (onDone) onDone(); return; }
      doorOpen = v;
      var from = doorPivot.rotation.y, to = v ? 1.28 : 0;
      U.tween({
        dur: 1.1, ease: U.easeInOutCubic,
        onUpdate: function (t) { doorPivot.rotation.y = U.lerp(from, to, t); },
        onDone: onDone || null
      });
    }

    /* ---------- X線モード ---------- */
    var xrayOn = false;

    /** buildChassis のあとで足したメッシュもX線の対象にする */
    function registerXray(obj) {
      obj.traverse(function (o) {
        if (!o.isMesh) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) { xrayList.push(entry(o, m)); });
      });
      if (xrayOn) applyXray(true);
    }

    function applyXray(v) {
      xrayList.forEach(function (e) {
        if (v) {
          e.mat.transparent = true;
          e.mat.opacity = Math.min(e.wasT ? e.base : 1, 1) * 0.20;
          e.mat.depthWrite = false;
        } else {
          e.mat.transparent = e.wasT;
          e.mat.opacity = e.base;
          e.mat.depthWrite = e.wasDW;
        }
        e.mat.needsUpdate = true;
      });
    }

    function setXray(v) {
      if (xrayOn === v) return;
      xrayOn = v;
      applyXray(v);
    }

    return {
      root: root,
      cabinet: cabinet,
      doorPivot: doorPivot,
      door: door,
      skin: skin,
      frontZ: frontZ,
      display: display,
      billSlot: billSlot,
      coinSlot: coinSlot,
      lever: lever,
      lock: lock,
      port: port,
      tray: tray,
      setDoorOpen: setDoorOpen,
      isDoorOpen: function () { return doorOpen; },
      setXray: setXray,
      registerXray: registerXray,
      isXray: function () { return xrayOn; }
    };
  }

  /* ============================================================
   * 庫内照明（陳列窓を照らす）
   * ============================================================ */
  function displayLights(parent, x0, x1, y0, y1, z) {
    var g = new THREE.Group();
    // 光源は1つだけ（モバイルGPUのために光源数をおさえる）。
    // 左右の蛍光灯は自発光メッシュで「光っている見た目」を作る。
    var l = new THREE.PointLight(0xfff2d8, 0.75, 1.7, 2);
    l.position.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.10, z);
    g.add(l);
    [x0 + 0.012, x1 - 0.012].forEach(function (tx) {
      var tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, (y1 - y0) * 0.92, 8),
        new THREE.MeshBasicMaterial({ color: 0xfffaf0 })
      );
      tube.position.set(tx, (y0 + y1) / 2, z);
      g.add(tube);
    });
    parent.add(g);
    return g;
  }

  window.VMMachineBase = {
    buildChassis: buildChassis,
    displayLights: displayLights
  };
})();
