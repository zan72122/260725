/* ============================================================
 * machine_drink.js — 飲料自販機
 *   実機と同じ構成：
 *     ・前面＝見本の陳列窓（サンプルは売れても残る）
 *     ・内部＝サーペンタイン式のコラム（缶が横倒しでジグザグに積まれる）
 *     ・コラム下端の払出ローターが1本だけ解放する
 *     ・シュートを転がって取出口のフラップを押し開けて落ちる
 * ============================================================ */
(function () {
  'use strict';

  var U = window.VMUtil;
  var P = window.VMParts;
  var PR = window.VMProducts;
  var BASE = window.VMMachineBase;
  var A = window.VMAudio;

  var W = 1.00, H = 1.83, D = 0.78;
  var FRONT = D / 2;                          // 0.39

  var WIN = { x0: -0.425, y0: 0.70, x1: 0.425, y1: 1.60 };
  var PORT = { x0: -0.44, y0: 0.06, x1: 0.02, y1: 0.35 };
  var TRAY = { x0: 0.10, y0: 0.17, x1: 0.42, y1: 0.32 };

  var COLS_X = [-0.318, -0.106, 0.106, 0.318];
  var RANK_Z = [0.03, -0.16];                 // 前列・後列
  var ROWS = [
    { shelfY: 1.300, tagY: 1.255, btnY: 1.185, rank: 0 },
    { shelfY: 0.865, tagY: 0.820, btnY: 0.750, rank: 1 }
  ];

  var COL_BOTTOM = 0.575;                     // 最下段の缶の中心高さ
  var COL_PITCH = 0.072;                      // 積み重ねのピッチ
  var COL_MAX = 11;
  var COL_START = 5;

  function create() {
    var api = { kind: 'drink', name: 'つめた～い のみもの' };

    var chassis = BASE.buildChassis({
      W: W, H: H, D: D,
      bodyColor: 0xc0182a,
      headerColor: 0xc0182a,
      title: 'こども じどうはんばいき',
      windowRect: WIN, portRect: PORT, trayRect: TRAY,
      portDepth: 0.28,
      money: {
        display: [-0.28, 0.580],
        bill: [0.190, 0.620],
        coin: [0.395, 0.600],
        lever: [0.345, 0.450],
        lock: [0.463, 1.100]
      }
    });
    var root = chassis.root;
    api.chassis = chassis;
    api.group = root;

    /* ============================================================
     * 陳列窓の中身（見本・棚・ガラス・照明）
     * ============================================================ */
    var disp = new THREE.Group();
    chassis.door.add(disp);

    // 陳列室の奥壁（乳白色の光る面）
    var backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0),
      new THREE.MeshBasicMaterial({ color: 0xfdf8ee })
    );
    backWall.position.set(0, (WIN.y0 + WIN.y1) / 2, 0.155);
    disp.add(backWall);
    api.backWall = backWall;
    // 「なかを みる」モードでは陳列室の奥壁も透ける（＝コラムが見える）
    chassis.registerXray(backWall);

    BASE.displayLights(disp, WIN.x0 + 0.02, WIN.x1 - 0.02, WIN.y0, WIN.y1, 0.30);

    // 棚板（半透明のガラス棚）
    ROWS.forEach(function (row) {
      var shelf = new THREE.Mesh(
        new THREE.BoxGeometry(WIN.x1 - WIN.x0 - 0.01, 0.008, 0.215), P.mat.shelf
      );
      shelf.position.set(0, row.shelfY - 0.004, 0.265);
      disp.add(shelf);
      // 棚の前縁（金属バー）
      var lip = new THREE.Mesh(
        new THREE.BoxGeometry(WIN.x1 - WIN.x0 - 0.01, 0.016, 0.010), P.mat.steelDark
      );
      lip.position.set(0, row.shelfY + 0.004, 0.370);
      disp.add(lip);
    });

    // ガラス
    var glass = new THREE.Mesh(
      new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), P.mat.glass.clone()
    );
    glass.position.set(0, (WIN.y0 + WIN.y1) / 2, FRONT - 0.012);
    glass.renderOrder = 6;
    disp.add(glass);

    /* ============================================================
     * 内部機構（コラム／払出ロータ／シュート）
     * ============================================================ */
    var guts = new THREE.Group();
    root.add(guts);
    api.guts = guts;

    // 集合シュート（コラムの下に広がる傾斜板）
    (function buildChute() {
      var m = new THREE.MeshStandardMaterial({ color: 0x8d959c, roughness: 0.35, metalness: 0.7 });
      var slope = new THREE.Mesh(new THREE.BoxGeometry(W - 0.10, 0.010, 0.52), m);
      slope.position.set(0, 0.415, -0.10);
      slope.rotation.x = -0.20;
      guts.add(slope);
      // 側壁
      [-1, 1].forEach(function (s) {
        var wsd = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.10, 0.52), m);
        wsd.position.set(s * (W / 2 - 0.05), 0.455, -0.10);
        wsd.rotation.x = -0.20;
        guts.add(wsd);
      });
      // 取出口へ導く漏斗
      var funnel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.010, 0.30), m);
      funnel.position.set(-0.21, 0.372, 0.16);
      funnel.rotation.x = -0.10;
      guts.add(funnel);
      var fw = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.30), m);
      fw.position.set(0.02, 0.42, 0.16); fw.rotation.x = -0.10; guts.add(fw);
      var fw2 = fw.clone(); fw2.position.x = -0.44; guts.add(fw2);
    })();

    /* コラム1本を作る。
       実機と同じで、缶用とペットボトル用ではコラムの幅がちがう
       （中の商品が横倒しで入るので、商品の全長ぶんの幅が要る）。 */
    function buildColumn(x, z, def) {
      var col = new THREE.Group();
      col.position.set(x, 0, z);
      guts.add(col);
      var railMat = new THREE.MeshStandardMaterial({
        color: 0xb6bec5, roughness: 0.34, metalness: 0.78
      });
      var halfW = PR.sizeOf(def).height / 2 + 0.009;   // 横倒しにしたときの幅の半分
      var top = COL_BOTTOM + COL_PITCH * (COL_MAX - 1) + 0.05;
      var hgt = top - COL_BOTTOM + 0.10;
      // 左右のガイド板
      [-1, 1].forEach(function (s) {
        var pl = new THREE.Mesh(new THREE.BoxGeometry(0.004, hgt, 0.165), railMat);
        pl.position.set(s * halfW, COL_BOTTOM + hgt / 2 - 0.05, 0);
        col.add(pl);
      });
      // 前後のガイド棒（ジグザグを支えるワイヤー）
      for (var i = 0; i < COL_MAX; i++) {
        var y = COL_BOTTOM + i * COL_PITCH + COL_PITCH / 2;
        var zz = (i % 2 === 0) ? 0.062 : -0.062;
        var bar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0035, 0.0035, halfW * 1.94, 6), railMat);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, y, zz);
        col.add(bar);
      }
      // 払出ローター
      var rotor = new THREE.Group();
      rotor.position.set(0, COL_BOTTOM - 0.048, 0);
      col.add(rotor);
      var shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, halfW * 2.06, 10), railMat);
      shaft.rotation.z = Math.PI / 2;
      rotor.add(shaft);
      for (var k = 0; k < 3; k++) {
        var paddle = new THREE.Mesh(new THREE.BoxGeometry(halfW * 1.86, 0.042, 0.008),
          new THREE.MeshStandardMaterial({ color: 0x3d444b, roughness: 0.6, metalness: 0.3 }));
        paddle.position.set(0, 0, 0);
        paddle.rotation.x = (k / 3) * Math.PI * 2;
        paddle.translateY(0.021);
        rotor.add(paddle);
      }
      col.userData.rotor = rotor;
      col.userData.items = [];
      return col;
    }

    /* ============================================================
     * スロット（見本＋値札＋ボタン＋コラム）
     * ============================================================ */
    var slots = [];
    PR.DRINKS.forEach(function (def, i) {
      var r = Math.floor(i / 4), c = i % 4;
      var row = ROWS[r];
      var x = COLS_X[c], z = RANK_Z[row.rank];

      /* 見本 */
      var sample = PR.build(def);
      sample.position.set(x, row.shelfY, 0.275);
      sample.rotation.y = 0.28;
      sample.traverse(function (o) {
        if (o.isMesh) o.userData.vm = { machine: api, action: 'button', index: i };
      });
      disp.add(sample);
      // 見本の下に映り込み（棚のツヤ）
      var refl = new THREE.Mesh(
        new THREE.CircleGeometry(def.type === 'pet' ? 0.038 : 0.036, 16),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16 })
      );
      refl.rotation.x = -Math.PI / 2;
      refl.position.set(x, row.shelfY + 0.001, 0.275);
      disp.add(refl);

      /* 値札 */
      var tag = P.priceTag(def, 0.145, 0.058);
      tag.position.set(x, row.tagY, FRONT + 0.003);
      chassis.door.add(tag);

      /* 選択ボタン */
      var btn = P.selectButton(0.030, 0xf0f3f6);
      btn.position.set(x, row.btnY, FRONT + 0.006);
      chassis.door.add(btn);

      /* 内部コラム */
      var col = buildColumn(x, z, def);

      var slot = {
        index: i, def: def, sample: sample, tag: tag, button: btn, column: col,
        stock: 0, max: COL_MAX
      };
      btn.userData.hit.userData.vm = { machine: api, action: 'button', index: i };
      slots.push(slot);
    });
    api.slots = slots;

    /* ---- コラムの在庫表示 ---- */
    function itemLocalY(i) { return COL_BOTTOM + i * COL_PITCH; }
    function itemLocalZ(i) { return (i % 2 === 0) ? 0.028 : -0.028; }

    function makeStackItem(def) {
      var holder = new THREE.Group();
      var lay = new THREE.Group();
      lay.rotation.z = -Math.PI / 2;
      holder.add(lay);
      var prod = PR.build(def);
      prod.position.y = -prod.userData.height / 2;   // ホルダー原点＝商品の中心
      lay.add(prod);
      holder.userData.prod = prod;
      holder.userData.lay = lay;                     // 手に取るときに起こすため
      holder.userData.def = def;
      holder.userData.type = def.type;
      holder.userData.radius = prod.userData.radius;
      holder.userData.height = prod.userData.height;
      return holder;
    }

    function refillSlot(slot, n) {
      var target = Math.min(slot.max, slot.stock + n);
      while (slot.stock < target) {
        var it = makeStackItem(slot.def);
        var i = slot.stock;
        it.position.set(0, itemLocalY(i), itemLocalZ(i));
        it.rotation.x = U.rand(-0.05, 0.05);
        slot.column.add(it);
        slot.column.userData.items.push(it);
        slot.stock++;
      }
      syncSlotUI(slot);
    }
    api.refillSlot = refillSlot;

    function syncSlotUI(slot) {
      var out = slot.stock <= 0;
      slot.tag.userData.setSoldOut(out);
      slot.button.userData.setSoldOut(out);
      if (out) slot.button.userData.setLit(false);
      slot.sample.visible = true;
    }

    /* 初期在庫（少しばらつかせて「売れてる感」を出す） */
    slots.forEach(function (s, i) {
      refillSlot(s, COL_START + (i % 3));
    });
    // 1つだけ売切れ状態にしておく（うりきれを体験できるように）
    (function () {
      var s = slots[6];
      s.column.userData.items.forEach(function (it) { s.column.remove(it); });
      s.column.userData.items.length = 0;
      s.stock = 0;
      syncSlotUI(s);
    })();

    /* ============================================================
     * 排出シーケンス
     * ============================================================ */
    api.busy = false;

    function dispense(index, onDone) {
      var slot = slots[index];
      if (api.busy || slot.stock <= 0) return false;
      api.busy = true;

      slot.button.userData.press();
      A.click(1500);

      // 1) 払出ローターが回る
      U.delay(0.18, function () {
        A.motor(0.62);
        var rotor = slot.column.userData.rotor;
        var from = rotor.rotation.x;
        U.tween({
          dur: 0.62, ease: U.easeInOutCubic,
          onUpdate: function (t) { rotor.rotation.x = from + (Math.PI * 2 / 3) * t; }
        });
      });

      // 2) 一番下の商品が解放されて落ちていく
      U.delay(0.46, function () {
        var item = slot.column.userData.items.shift();
        slot.stock--;
        syncSlotUI(slot);

        // 残りを1段ずつ下ろす
        slot.column.userData.items.forEach(function (it, i) {
          var fy = it.position.y, fz = it.position.z;
          var ty = itemLocalY(i), tz = itemLocalZ(i);
          U.tween({
            dur: 0.42, delay: 0.05 + i * 0.015, ease: U.easeOutBounce,
            onUpdate: function (t) {
              it.position.y = U.lerp(fy, ty, t);
              it.position.z = U.lerp(fz, tz, t);
            }
          });
        });

        // コラムから外して機体直下に付け替える（ワールド位置は保つ）
        var wp = new THREE.Vector3();
        item.getWorldPosition(wp);
        slot.column.remove(item);
        root.add(item);
        root.worldToLocal(wp);
        item.position.copy(wp);
        item.rotation.set(0, 0, 0);

        travel(slot, item, onDone);
      });
      return true;
    }

    /** シュートを転がって取出口に落ちるまで */
    function travel(slot, item, onDone) {
      var colX = slot.column.position.x, colZ = slot.column.position.z;
      var rad = item.userData.radius;
      var roll = 0;
      var prev = item.position.clone();

      function setPos(x, y, z) { item.position.set(x, y, z); }
      /** 実際に進んだぶんだけ転がす（＝すべらずに転がって見える） */
      function rollTo(x, y, z) {
        var d = Math.hypot(x - prev.x, z - prev.z);
        roll += d / rad;
        item.rotation.x = roll;
        prev.set(x, y, z);
        item.position.set(x, y, z);
      }

      var p0 = new THREE.Vector3(colX, item.position.y, colZ);
      var p1 = new THREE.Vector3(colX, 0.455, colZ + 0.03);
      var p2 = new THREE.Vector3(colX * 0.55 - 0.09, 0.425, 0.02);
      var p3 = new THREE.Vector3(-0.21, 0.395, 0.155);
      var floorY = PORT.y0 + 0.020 + rad;
      var p4 = new THREE.Vector3(-0.21, floorY + 0.02, 0.19);
      var p5 = new THREE.Vector3(-0.21, floorY, 0.27);

      // A: 自由落下（ローターから離れてシュートへ）
      U.track(0.24, function (t) {
        var tt = t * t;
        setPos(U.lerp(p0.x, p1.x, t), U.lerp(p0.y, p1.y, tt), U.lerp(p0.z, p1.z, t));
        item.rotation.x = roll + t * 1.2;
      }, function () {
        roll += 1.2;
        prev.copy(p1);
        A.thud(false);
        A.roll(0.62);
        // B: 集合シュートを滑り降りる
        U.track(0.62, function (t) {
          var e = U.easeInCubic(t) * 0.35 + t * 0.65;
          var pos;
          if (e < 0.5) {
            pos = p1.clone().lerp(p2, e / 0.5);
          } else {
            pos = p2.clone().lerp(p3, (e - 0.5) / 0.5);
          }
          rollTo(pos.x, pos.y, pos.z);
          // 進行方向に少し首を振る（ころころ感）
          item.rotation.y = Math.sin(t * 9) * 0.06;
        }, function () {
          item.rotation.y = 0;
          // C: 取出口へ落下（フラップを押し開ける）
          chassis.port.userData.swing(1.0);
          A.flap();
          U.track(0.30, function (t) {
            var tt = t * t;
            setPos(U.lerp(p3.x, p4.x, t), U.lerp(p3.y, p4.y, tt), U.lerp(p3.z, p4.z, t));
            item.rotation.x = roll + t * 3.4;
          }, function () {
            roll += 3.4;
            prev.copy(p4);
            A.thud(true);
            // D: 床で少し弾んで前へ転がる
            U.track(0.42, function (t) {
              var bounce = Math.abs(Math.sin(t * Math.PI * 2.0)) * (1 - t) * 0.028;
              rollTo(
                p4.x + Math.sin(t * 5) * 0.004,
                U.lerp(p4.y, p5.y, U.easeOutCubic(t)) + bounce,
                U.lerp(p4.z, p5.z, U.easeOutCubic(t))
              );
            }, function () {
              A.thud(false);
              item.userData.inBin = true;
              api.busy = false;
              if (onDone) onDone(item);
            });
          });
        });
      });
    }
    api.dispense = dispense;

    /* ============================================================
     * 外部インターフェース
     * ============================================================ */
    api.setCredit = function (v) { chassis.display.userData.set(v); };
    api.message = function (m) { chassis.display.userData.message(m); };
    api.clearMessage = function () { chassis.display.userData.clearMessage(); };

    api.updateAffordable = function (credit) {
      slots.forEach(function (s) {
        var ok = s.stock > 0 && credit >= s.def.price;
        s.tag.userData.setAffordable(ok);
        s.button.userData.setLit(ok);
      });
    };

    api.cheapestPrice = function () {
      var m = Infinity;
      slots.forEach(function (s) { if (s.stock > 0) m = Math.min(m, s.def.price); });
      return m === Infinity ? 0 : m;
    };

    api.totalStock = function () {
      var n = 0; slots.forEach(function (s) { n += s.stock; }); return n;
    };

    // 取出口の受け皿の位置（ワールド計算用のローカル値）
    api.binRest = function (rad) {
      return new THREE.Vector3(-0.21, PORT.y0 + 0.020 + (rad || 0.033), 0.27);
    };

    api.hitTargets = function () {
      var arr = [];
      slots.forEach(function (s) { arr.push(s.button.userData.hit); });
      arr.push(chassis.coinSlot.userData.hit);
      arr.push(chassis.billSlot.userData.hit);
      arr.push(chassis.lever.userData.hit);
      arr.push(chassis.port.userData.hit);
      arr.push(chassis.tray.userData.hit);
      arr.push(chassis.lock.userData.hit);
      return arr;
    };

    chassis.coinSlot.userData.hit.userData.vm = { machine: api, action: 'coinslot' };
    chassis.billSlot.userData.hit.userData.vm = { machine: api, action: 'billslot' };
    chassis.lever.userData.hit.userData.vm = { machine: api, action: 'lever' };
    chassis.port.userData.hit.userData.vm = { machine: api, action: 'port' };
    chassis.tray.userData.hit.userData.vm = { machine: api, action: 'tray' };
    chassis.lock.userData.hit.userData.vm = { machine: api, action: 'lock' };

    // 影は筐体だけに落とさせる（庫内やガラスまで影を作ると重く・汚くなる）
    U.shadow(chassis.cabinet, true, true);
    U.shadow(chassis.skin, true, false);
    return api;
  }

  window.VMDrinkMachine = { create: create, W: W, H: H, D: D };
})();
