/* ============================================================
 * restock.js — お仕事モード（補充・集金）
 *   鍵をあけて前扉をひらくと、庫内に
 *     ・コラム／コイルへの補充口
 *     ・売上金がたまるコインボックス
 *   があらわれる。実機の中身の勉強にもなるようにしてある。
 * ============================================================ */
(function () {
  'use strict';

  var U = window.VMUtil;
  var P = window.VMParts;
  var MONEY = window.VMMoney;
  var A = window.VMAudio;
  var JP = window.VMProducts.JP_FONT;

  /** 機械に「中身のしごと」用のパーツを取りつける */
  function attach(machine) {
    var root = machine.group;
    var work = new THREE.Group();
    root.add(work);

    /* ---------------- コインボックス（売上金） ---------------- */
    // 扉をあけたときに正面から見えるよう、庫内の手前ぎわに置く
    var box = new THREE.Group();
    box.position.set(0.28, 0.055, 0.02);
    work.add(box);

    var boxMat = new THREE.MeshStandardMaterial({ color: 0x565f68, roughness: 0.42, metalness: 0.65 });
    var bw = 0.22, bh = 0.17, bd = 0.20;
    [
      [bw, 0.008, bd, 0, 0.004, 0],
      [bw, bh, 0.008, 0, bh / 2, -bd / 2],
      [0.008, bh, bd, -bw / 2, bh / 2, 0],
      [0.008, bh, bd, bw / 2, bh / 2, 0]
    ].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), boxMat);
      m.position.set(s[3], s[4], s[5]);
      box.add(m);
    });
    // 前面（低くして中が見えるように）
    var front = new THREE.Mesh(new THREE.BoxGeometry(bw, bh * 0.55, 0.008), boxMat);
    front.position.set(0, bh * 0.275, bd / 2);
    box.add(front);
    // 取っ手
    var handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 14), P.mat.steel);
    handle.position.set(0, bh * 0.62, bd / 2 + 0.006);
    handle.rotation.x = Math.PI / 2;
    box.add(handle);

    var boxLbl = U.canvasTexture(256, 96, function (ctx, w, h) {
      ctx.fillStyle = '#ffd400'; ctx.fillRect(0, 0, w, h);
      U.fitText(ctx, 'うりあげ', w / 2, h / 2, w * 0.8, 54, JP, '#2b2b2b');
    });
    var lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.038),
      new THREE.MeshBasicMaterial({ map: boxLbl }));
    lbl.position.set(0, bh * 0.28, bd / 2 + 0.006);
    box.add(lbl);

    var coinPile = new THREE.Group();
    coinPile.position.set(0, 0.012, 0);
    box.add(coinPile);

    var boxHit = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.06, bh + 0.10, bd + 0.06),
      new THREE.MeshBasicMaterial({ visible: false }));
    boxHit.position.set(0, bh / 2, 0);
    boxHit.userData.vm = { machine: machine, action: 'coinbox' };
    box.add(boxHit);

    /* ---------------- 補充口（コラム／コイルごとの当たり判定） ---------------- */
    var refillHits = [];
    machine.slots.forEach(function (slot, i) {
      var hit, label;
      if (machine.kind === 'drink') {
        hit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.30, 0.20),
          new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.set(slot.column.position.x, 1.24, slot.column.position.z);
      } else {
        hit = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.18, 0.34),
          new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.set(slot.x, slot.shelfY + 0.09, 0.10);
      }
      hit.userData.vm = { machine: machine, action: 'refill', index: i };
      work.add(hit);
      refillHits.push(hit);

      // 「ほじゅう」のめじるし（お仕事モードのときだけ出す）
      var mkTex = U.canvasTexture(128, 128, function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,209,0,0.92)';
        ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#8a6d00'; ctx.lineWidth = 6; ctx.stroke();
        ctx.fillStyle = '#4a3a00';
        ctx.font = 'bold 92px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', w / 2, h / 2 + 4);
      });
      var mark = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075),
        new THREE.MeshBasicMaterial({ map: mkTex, transparent: true, depthTest: false }));
      mark.renderOrder = 800;
      mark.position.copy(hit.position);
      mark.position.z += (machine.kind === 'drink' ? 0.12 : 0.22);
      mark.visible = false;
      work.add(mark);
      slot.refillMark = mark;
    });

    /* ---------------- 補充用のケース ---------------- */
    var crate = new THREE.Group();
    crate.position.set(-0.16, 0.0, 0.02);
    work.add(crate);
    (function () {
      var m = new THREE.MeshStandardMaterial({ color: 0x3f6fa8, roughness: 0.7 });
      var w = 0.34, h = 0.13, d = 0.24;
      [
        [w, 0.008, d, 0, 0.004, 0],
        [w, h, 0.008, 0, h / 2, -d / 2],
        [w, h, 0.008, 0, h / 2, d / 2],
        [0.008, h, d, -w / 2, h / 2, 0],
        [0.008, h, d, w / 2, h / 2, 0]
      ].forEach(function (s) {
        var mm = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), m);
        mm.position.set(s[3], s[4], s[5]);
        crate.add(mm);
      });
      // 中身をちらっと
      for (var i = 0; i < 6; i++) {
        var b = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.06, 0.05),
          new THREE.MeshStandardMaterial({ color: [0xd44, 0x4a4, 0x44d, 0xda4][i % 4], roughness: 0.7 })
        );
        b.position.set(-0.12 + (i % 3) * 0.12, 0.04, -0.05 + Math.floor(i / 3) * 0.10);
        crate.add(b);
      }
    })();

    /* ---------------- 売上の管理 ---------------- */
    var sales = 0;

    function addSale(amount) {
      sales += amount;
      // コインボックスに硬貨をつみあげる（見た目）
      var coins = MONEY.breakdown(amount).slice(0, 4);
      coins.forEach(function (v, i) {
        if (coinPile.children.length > 26) return;
        var c = MONEY.makeCoin(v);
        c.rotation.x = -Math.PI / 2 + U.rand(-0.25, 0.25);
        c.rotation.z = U.rand(0, Math.PI);
        c.position.set(
          U.rand(-0.075, 0.075),
          0.002 + coinPile.children.length * 0.0016,
          U.rand(-0.065, 0.065)
        );
        coinPile.add(c);
      });
    }

    function collect() {
      var got = sales;
      sales = 0;
      while (coinPile.children.length) coinPile.remove(coinPile.children[0]);
      return got;
    }

    function setWorkVisible(v) {
      machine.slots.forEach(function (s) {
        if (s.refillMark) s.refillMark.visible = v && s.stock < s.max;
      });
    }

    machine.work = {
      group: work,
      box: box,
      boxHit: boxHit,
      crate: crate,
      refillHits: refillHits,
      addSale: addSale,
      collect: collect,
      getSales: function () { return sales; },
      setWorkVisible: setWorkVisible,
      hitTargets: function () {
        var arr = refillHits.slice();
        arr.push(boxHit);
        arr.push(machine.chassis.lock.userData.hit);
        return arr;
      }
    };

    U.shadow(work, false, false);
    setWorkVisible(false);
    return machine.work;
  }

  /** 補充のアニメーション（1本ずつ「ことん」と入っていく） */
  function refill(machine, index, onDone) {
    var slot = machine.slots[index];
    var need = slot.max - slot.stock;
    if (need <= 0) { if (onDone) onDone(0); return false; }
    var n = Math.min(need, 5);
    var done = 0;
    for (var i = 0; i < n; i++) {
      (function (i) {
        U.delay(i * 0.16, function () {
          A.thud(false);
          machine.refillSlot(slot, 1);
          done++;
          if (done === n) {
            A.sparkle();
            if (machine.work) machine.work.setWorkVisible(true);
            if (onDone) onDone(n);
          }
        });
      })(i);
    }
    return true;
  }

  window.VMRestock = { attach: attach, refill: refill };
})();
