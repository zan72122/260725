/* ============================================================
 * machine_snack.js — お菓子自販機（スパイラルコイル式）
 *   実機と同じ構成：
 *     ・全面ガラスで実物が見える（見本ではなく在庫そのもの）
 *     ・各段に「らせんコイル」があり、1回転するとお菓子が1つ前へ送られて落ちる
 *     ・右側のコントロール列に番号ボタン／金銭ユニット
 * ============================================================ */
(function () {
  'use strict';

  var U = window.VMUtil;
  var P = window.VMParts;
  var PR = window.VMProducts;
  var BASE = window.VMMachineBase;
  var A = window.VMAudio;

  var W = 1.00, H = 1.83, D = 0.78;
  var FRONT = D / 2;

  var WIN = { x0: -0.46, y0: 0.58, x1: 0.20, y1: 1.62 };
  var PORT = { x0: -0.44, y0: 0.10, x1: 0.06, y1: 0.42 };
  var TRAY = { x0: 0.14, y0: 0.20, x1: 0.44, y1: 0.34 };

  var SHELF_Y = [1.28, 0.98, 0.68];
  var COIL_X = [-0.35, -0.13, 0.09];
  var COIL_R = 0.050;
  var COIL_TURNS = 5;
  var COIL_LEN = 0.40;
  var COIL_Z0 = 0.30;                      // コイル前端
  var PITCH = COIL_LEN / COIL_TURNS;       // 1回転で進む距離
  var SLOT_MAX = 5;

  function create() {
    var api = { kind: 'snack', name: 'おかし じどうはんばいき' };

    var chassis = BASE.buildChassis({
      W: W, H: H, D: D,
      bodyColor: 0x1f6f8b,
      headerColor: 0x0f4d63,
      title: 'こども おかし はんばいき',
      windowRect: WIN, portRect: PORT, trayRect: TRAY,
      portDepth: 0.30,
      money: {
        display: [0.340, 1.340],
        bill: [0.360, 1.170],
        coin: [0.400, 1.020],
        lever: [0.350, 0.580],
        lock: [0.475, 1.500]
      },
      guide: { size: [0.245, 0.052], pos: [0.345, 1.253] }
    });
    var root = chassis.root;
    api.chassis = chassis;
    api.group = root;

    /* ---------- 全面ガラス（扉側） ---------- */
    var glass = new THREE.Mesh(
      new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), P.mat.glass.clone()
    );
    glass.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, FRONT - 0.012);
    glass.renderOrder = 6;
    chassis.door.add(glass);
    // ガラスの映り込み（斜めのハイライト）
    var sheenTex = U.canvasTexture(256, 512, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0.00, 'rgba(255,255,255,0.00)');
      g.addColorStop(0.34, 'rgba(255,255,255,0.16)');
      g.addColorStop(0.40, 'rgba(255,255,255,0.05)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.14)');
      g.addColorStop(0.62, 'rgba(255,255,255,0.00)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    var sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0),
      new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, depthWrite: false })
    );
    sheen.position.copy(glass.position);
    sheen.position.z += 0.001;
    sheen.renderOrder = 7;
    chassis.door.add(sheen);

    /* ============================================================
     * 庫内（棚・コイル・在庫）— 扉ではなく本体側に置く
     * ============================================================ */
    var guts = new THREE.Group();
    root.add(guts);
    api.guts = guts;

    BASE.displayLights(guts, WIN.x0 + 0.03, WIN.x1 - 0.03, WIN.y0, WIN.y1, 0.33);

    // 庫内の白い背板
    var backPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(WIN.x1 - WIN.x0 + 0.02, WIN.y1 - WIN.y0),
      new THREE.MeshStandardMaterial({ color: 0xf3f6f8, roughness: 0.9 })
    );
    backPanel.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, -0.26);
    guts.add(backPanel);

    var coilMat = new THREE.MeshStandardMaterial({
      color: 0xcfd6dc, roughness: 0.28, metalness: 0.85
    });
    var shelfMat = new THREE.MeshPhongMaterial({
      color: 0xdff0ff, transparent: true, opacity: 0.34, shininess: 100, side: THREE.DoubleSide
    });

    /* ============================================================
     * スロット（棚 × コイル）
     * ============================================================ */
    var slots = [];

    SHELF_Y.forEach(function (sy, r) {
      // 棚板
      var shelf = new THREE.Mesh(
        new THREE.BoxGeometry(WIN.x1 - WIN.x0 - 0.02, 0.010, 0.54), shelfMat
      );
      shelf.position.set((WIN.x0 + WIN.x1) / 2, sy - 0.005, COIL_Z0 - COIL_LEN / 2 - 0.05);
      guts.add(shelf);
      // 棚の前縁バー
      var lip = new THREE.Mesh(
        new THREE.BoxGeometry(WIN.x1 - WIN.x0 - 0.02, 0.014, 0.008), P.mat.steelDark
      );
      lip.position.set((WIN.x0 + WIN.x1) / 2, sy + 0.006, COIL_Z0 + 0.025);
      guts.add(lip);

      COIL_X.forEach(function (cx, c) {
        var idx = r * 3 + c;
        var def = PR.SNACKS[idx];

        // らせんコイル
        var coil = new THREE.Group();
        coil.position.set(cx, sy + COIL_R, COIL_Z0);
        guts.add(coil);
        var wire = new THREE.Mesh(
          U.spiralGeometry(COIL_R, 0.0062, COIL_TURNS, COIL_LEN), coilMat
        );
        coil.add(wire);
        // コイルを回すモーターユニット（奥）
        var motor = new THREE.Mesh(
          new THREE.CylinderGeometry(0.024, 0.024, 0.045, 12), P.mat.dark
        );
        motor.rotation.x = Math.PI / 2;
        motor.position.set(0, 0, -COIL_LEN - 0.024);
        coil.add(motor);

        var slot = {
          index: idx, def: def, coil: coil, shelfY: sy, x: cx,
          items: [], stock: 0, max: SLOT_MAX
        };
        slots.push(slot);
      });
    });

    /* ============================================================
     * 番号ボタン（3×3）
     * ============================================================ */
    var BTN_X = [0.280, 0.360, 0.440];
    var BTN_Y = [0.870, 0.785, 0.700];
    slots.forEach(function (slot, i) {
      var r = Math.floor(i / 3), c = i % 3;
      var btn = P.selectButton(0.024, 0xeef2f5);
      btn.position.set(BTN_X[c], BTN_Y[r], FRONT + 0.006);
      chassis.door.add(btn);

      // 番号ラベル
      var tex = U.canvasTexture(64, 64, function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#2b3138';
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), w / 2, h / 2 + 2);
      });
      var num = new THREE.Mesh(new THREE.PlaneGeometry(0.030, 0.030),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      num.position.z = 0.026;
      btn.add(num);

      btn.userData.hit.userData.vm = { machine: api, action: 'button', index: i };
      slot.button = btn;

      // 棚の前縁に付く小さな値札
      var tag = P.priceTag({ price: slot.def.price, hot: undefined }, 0.115, 0.046);
      tag.position.set(slot.x, slot.shelfY - 0.028, FRONT + 0.003);
      chassis.door.add(tag);
      slot.tag = tag;

      // 商品名と番号のシール（棚前縁・扉側）
      var lblTex = U.canvasTexture(256, 64, function (ctx, w, h) {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#1f6f8b'; ctx.fillRect(0, 0, 46, h);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), 23, h / 2);
        U.fitText(ctx, slot.def.name, 46 + (w - 46) / 2, h / 2, w - 60, 32,
          PR.JP_FONT, '#22303c');
      });
      var lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.034),
        new THREE.MeshBasicMaterial({ map: lblTex }));
      lbl.position.set(slot.x, slot.shelfY - 0.064, FRONT + 0.002);
      chassis.door.add(lbl);
    });
    api.slots = slots;

    /* ---------- 在庫の配置 ---------- */
    function itemZ(i) { return COIL_Z0 - PITCH * (i + 0.55); }

    function refillSlot(slot, n) {
      var target = Math.min(slot.max, slot.stock + n);
      while (slot.stock < target) {
        var prod = PR.build(slot.def);
        var i = slot.stock;
        prod.position.set(slot.x, slot.shelfY, itemZ(i));
        prod.rotation.y = U.rand(-0.04, 0.04);
        guts.add(prod);
        slot.items.push(prod);
        slot.stock++;
        // 商品はタップでも選べる
        prod.traverse(function (o) {
          if (o.isMesh) o.userData.vm = { machine: api, action: 'button', index: slot.index };
        });
      }
      syncSlotUI(slot);
    }
    api.refillSlot = refillSlot;

    function syncSlotUI(slot) {
      var out = slot.stock <= 0;
      slot.tag.userData.setSoldOut(out);
      slot.button.userData.setSoldOut(out);
      if (out) slot.button.userData.setLit(false);
    }

    slots.forEach(function (s, i) { refillSlot(s, 3 + (i % 3)); });
    (function () {   // 1つは売切れ体験用
      var s = slots[4];
      s.items.forEach(function (it) { guts.remove(it); });
      s.items.length = 0; s.stock = 0; syncSlotUI(s);
    })();

    /* ============================================================
     * 排出シーケンス（コイル1回転 → 前の1個が落ちる）
     * ============================================================ */
    api.busy = false;

    function dispense(index, onDone) {
      var slot = slots[index];
      if (api.busy || slot.stock <= 0) return false;
      api.busy = true;

      slot.button.userData.press();
      A.click(1700);

      U.delay(0.16, function () {
        A.spiral();
        var from = slot.coil.rotation.z;
        // コイルが1回転 ＝ 商品が1ピッチ前進する
        U.tween({
          dur: 1.25, ease: U.easeInOutCubic,
          onUpdate: function (t) { slot.coil.rotation.z = from + Math.PI * 2 * t; }
        });

        var falling = slot.items.shift();
        slot.stock--;

        // 後ろの在庫を1ピッチ前へ
        slot.items.forEach(function (it, i) {
          var fz = it.position.z, tz = itemZ(i);
          U.tween({
            dur: 1.25, ease: U.easeInOutCubic,
            onUpdate: function (t) { it.position.z = U.lerp(fz, tz, t); }
          });
        });

        // 落ちる1個は棚の先まで押し出されてから落下
        var fz0 = falling.position.z;
        var edgeZ = COIL_Z0 + 0.045;
        U.track(1.10, function (t) {
          falling.position.z = U.lerp(fz0, edgeZ, U.easeInOutCubic(t));
          // 縁を越えるあたりでつんのめる
          if (t > 0.80) {
            var k = (t - 0.80) / 0.20;
            falling.rotation.x = -0.55 * k;
            falling.position.y = slot.shelfY - 0.012 * k;
          }
        }, function () {
          syncSlotUI(slot);
          fall(slot, falling, onDone);
        });
      });
      return true;
    }

    /** 落下 → 取出口に着地 */
    function fall(slot, item, onDone) {
      // タップ対象から外す
      item.traverse(function (o) { if (o.isMesh) o.userData.vm = null; });

      var h = item.userData.height || 0.14;
      var startY = slot.shelfY - 0.012, startZ = COIL_Z0 + 0.045;
      var floorY = PORT.y0 + 0.016;
      var restY = floorY + Math.min(0.028, h * 0.20);
      var dropH = startY - restY;
      var dur = Math.sqrt(2 * dropH / 5.2);          // それっぽい落下時間
      var spinX = -Math.PI / 2 - U.rand(0.1, 0.5);
      var spinZ = U.rand(-0.9, 0.9);
      var swung = false;

      A.bag();
      U.track(dur, function (t) {
        var e = t * t;
        item.position.y = U.lerp(startY, restY, e);
        item.position.z = U.lerp(startZ, 0.22, U.easeOutCubic(t));
        item.position.x = slot.x + (-0.21 - slot.x) * U.easeInOutCubic(t);
        item.rotation.x = U.lerp(-0.55, spinX, U.easeOutCubic(t));
        item.rotation.z = spinZ * t;
        if (!swung && t > 0.62) {
          swung = true;
          chassis.port.userData.swing(0.75);
          A.flap();
        }
      }, function () {
        A.thud(false);
        // 着地して少しはずむ
        U.track(0.30, function (t) {
          item.position.y = restY + Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t) * 0.020;
          item.position.z = U.lerp(0.22, 0.26, U.easeOutCubic(t));
        }, function () {
          item.position.y = restY;
          item.userData.inBin = true;
          api.busy = false;
          if (onDone) onDone(item);
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

    api.binRest = function () {
      return new THREE.Vector3(-0.21, PORT.y0 + 0.040, 0.26);
    };

    api.hitTargets = function () {
      var arr = [];
      slots.forEach(function (s) {
        arr.push(s.button.userData.hit);
        s.items.forEach(function (it) { it.traverse(function (o) { if (o.isMesh) arr.push(o); }); });
      });
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

    U.shadow(chassis.cabinet, true, true);
    U.shadow(chassis.skin, true, false);
    return api;
  }

  window.VMSnackMachine = { create: create, W: W, H: H, D: D };
})();
