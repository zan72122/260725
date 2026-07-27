/* ============================================================
 * money.js — お金（硬貨・紙幣）とおさいふ
 *   ・硬貨は実物の寸法比（10円=23.5mm, 50円=21mm穴あき, 100円=22.6mm, 500円=26.5mm）
 *   ・紙幣は「こどもの おもちゃのおさつ」としてデザインした架空のお札
 *   ・おさいふはカメラの子にしてあるので、たて画面でもよこ画面でも
 *     いつも画面の下に同じ位置で出る
 * ============================================================ */
(function () {
  'use strict';

  var U = window.VMUtil;
  var JP = window.VMProducts.JP_FONT;

  /* ---------------- 金種の定義 ---------------- */
  var COINS = {
    10: { r: 0.01175, t: 0.0015, hole: 0, color: 0xb4703a, edge: 0x8d5426, ridged: false, label: '10' },
    50: { r: 0.01050, t: 0.0017, hole: 0.0020, color: 0xc4cad0, edge: 0x9aa1a8, ridged: true, label: '50' },
    100: { r: 0.01130, t: 0.0017, hole: 0, color: 0xccd2d8, edge: 0xa3aab1, ridged: true, label: '100' },
    500: { r: 0.01325, t: 0.0018, hole: 0, color: 0xd7c489, edge: 0xab9a63, ridged: true, label: '500' }
  };
  var BILL = { w: 0.150, h: 0.076, value: 1000 };

  var texCache = {};

  /* ---------------- 硬貨のおもて面 ---------------- */
  function coinFaceTexture(value) {
    var key = 'coin' + value;
    if (texCache[key]) return texCache[key];
    var d = COINS[value];
    texCache[key] = U.canvasTexture(512, 512, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var cx = w / 2, cy = h / 2, R = w / 2 - 2;

      // 地金のグラデーション
      var g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.40, R * 0.05, cx, cy, R);
      var base = U.cssColor(d.color);
      g.addColorStop(0, U.cssColor(U.shade(d.color, 0.22)));
      g.addColorStop(0.45, base);
      g.addColorStop(0.82, U.cssColor(U.shade(d.color, -0.10)));
      g.addColorStop(1, U.cssColor(U.shade(d.color, -0.22)));
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();

      // ギザギザ（縁刻）
      if (d.ridged) {
        ctx.strokeStyle = U.cssColor(U.shade(d.color, -0.20));
        ctx.lineWidth = 3;
        for (var i = 0; i < 110; i++) {
          var a = (i / 110) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * R * 0.955, cy + Math.sin(a) * R * 0.955);
          ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
          ctx.stroke();
        }
      }
      // 内側のリング
      ctx.strokeStyle = U.cssColor(U.shade(d.color, -0.16));
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.885, 0, Math.PI * 2); ctx.stroke();

      // 数字
      var dark = U.cssColor(U.shade(d.color, -0.34));
      var light = U.cssColor(U.shade(d.color, 0.30));
      var fs = value === 500 ? 250 : (value === 100 ? 250 : 270);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + fs + 'px "Georgia",serif';
      ctx.fillStyle = light;
      ctx.fillText(d.label, cx + 5, cy - 15);        // 打刻のハイライト
      ctx.fillStyle = dark;
      ctx.fillText(d.label, cx, cy - 20);
      // 「円」
      ctx.font = 'bold 84px ' + JP;
      ctx.fillStyle = dark;
      ctx.fillText('円', cx, cy + 150);

      // 穴（50円）
      if (d.hole > 0) {
        var hr = R * (d.hole / d.r);
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(cx, cy, hr, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = dark; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(cx, cy, hr, 0, Math.PI * 2); ctx.stroke();
      }
    });
    return texCache[key];
  }

  /* ---------------- 紙幣（架空のこども用おさつ） ---------------- */
  function billTexture(front) {
    var key = 'bill' + (front ? 'F' : 'B');
    if (texCache[key]) return texCache[key];
    texCache[key] = U.canvasTexture(1024, 520, function (ctx, w, h) {
      var g = U.vGrad(ctx, 0, 0, h, [[0, '#f6f1e2'], [0.5, '#efe7d2'], [1, '#e6dcc2']]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      // 地模様（細かい波線）
      ctx.strokeStyle = 'rgba(120,150,120,0.25)'; ctx.lineWidth = 1.2;
      for (var y = 8; y < h; y += 9) {
        ctx.beginPath();
        for (var x = 0; x <= w; x += 8) {
          var yy = y + Math.sin((x + y) * 0.035) * 3.2;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // 枠
      ctx.strokeStyle = '#3f7a4e'; ctx.lineWidth = 10;
      U.roundRect(ctx, 18, 18, w - 36, h - 36, 14); ctx.stroke();
      ctx.strokeStyle = '#87a97f'; ctx.lineWidth = 3;
      U.roundRect(ctx, 34, 34, w - 68, h - 68, 10); ctx.stroke();

      if (front) {
        // まんなかの まる顔（おもちゃのおさつだと はっきり わかるデザイン）
        var cx = w * 0.30, cy = h * 0.52, r = h * 0.30;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe0b2'; ctx.fill();
        ctx.strokeStyle = '#3f7a4e'; ctx.lineWidth = 6; ctx.stroke();
        ctx.fillStyle = '#3f5a3f';
        ctx.beginPath(); ctx.arc(cx - r * 0.34, cy - r * 0.12, r * 0.10, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + r * 0.34, cy - r * 0.12, r * 0.10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3f5a3f'; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx, cy + r * 0.10, r * 0.42, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
        ctx.fillStyle = 'rgba(255,140,140,0.5)';
        ctx.beginPath(); ctx.arc(cx - r * 0.55, cy + r * 0.18, r * 0.14, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + r * 0.55, cy + r * 0.18, r * 0.14, 0, Math.PI * 2); ctx.fill();

        // 額面
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 150px "Georgia",serif';
        ctx.fillStyle = '#2f6b3f';
        ctx.fillText('1000', w * 0.70, h * 0.42);
        ctx.font = 'bold 74px ' + JP;
        ctx.fillText('えん', w * 0.70, h * 0.63);
        ctx.font = 'bold 34px ' + JP;
        ctx.fillStyle = '#6b7a5f';
        ctx.fillText('こども おもちゃ おさつ', w * 0.70, h * 0.83);
        // すみの小さい数字
        ctx.font = 'bold 46px "Georgia",serif';
        ctx.fillStyle = '#3f7a4e';
        ctx.textAlign = 'left'; ctx.fillText('1000', 56, 72);
        ctx.textAlign = 'right'; ctx.fillText('1000', w - 56, h - 62);
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 120px "Georgia",serif';
        ctx.fillStyle = '#2f6b3f';
        ctx.fillText('1000', w * 0.5, h * 0.40);
        ctx.font = 'bold 56px ' + JP;
        ctx.fillText('こども ぎんこう', w * 0.5, h * 0.62);
        ctx.font = 'bold 32px ' + JP;
        ctx.fillStyle = '#6b7a5f';
        ctx.fillText('あそび よう・おかいものの れんしゅう', w * 0.5, h * 0.78);
      }
      U.addNoise(ctx, w, h, 10);
    });
    return texCache[key];
  }

  /* ---------------- メッシュ生成 ---------------- */
  var coinMatCache = {};

  function makeCoin(value) {
    var d = COINS[value];
    var g = new THREE.Group();

    if (!coinMatCache[value]) {
      coinMatCache[value] = {
        body: new THREE.MeshStandardMaterial({
          color: d.edge, metalness: 0.92, roughness: 0.30
        }),
        face: new THREE.MeshStandardMaterial({
          map: coinFaceTexture(value), transparent: true, alphaTest: 0.35,
          metalness: 0.80, roughness: 0.34
        })
      };
    }
    var m = coinMatCache[value];

    var body = new THREE.Mesh(U.coinGeometry(d.r, d.t, d.hole), m.body);
    g.add(body);

    var fr = new THREE.Mesh(new THREE.CircleGeometry(d.r * 0.999, 44), m.face);
    fr.position.z = d.t / 2 + 0.00012;
    g.add(fr);
    var bk = new THREE.Mesh(new THREE.CircleGeometry(d.r * 0.999, 44), m.face);
    bk.position.z = -d.t / 2 - 0.00012;
    bk.rotation.y = Math.PI;
    g.add(bk);

    g.userData.money = { kind: 'coin', value: value, r: d.r, t: d.t };
    return g;
  }

  var billMats = null;

  function makeBill() {
    if (!billMats) {
      var edge = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.95 });
      billMats = [
        edge, edge, edge, edge,
        new THREE.MeshStandardMaterial({ map: billTexture(true), roughness: 0.88 }),
        new THREE.MeshStandardMaterial({ map: billTexture(false), roughness: 0.88 })
      ];
    }
    var g = new THREE.Group();
    var m = new THREE.Mesh(new THREE.BoxGeometry(BILL.w, BILL.h, 0.00022), billMats);
    g.add(m);
    g.userData.money = { kind: 'bill', value: BILL.value, w: BILL.w, h: BILL.h };
    g.userData.sheet = m;
    return g;
  }

  /* ============================================================
   * おさいふ（カメラの子として画面下に固定）
   * ============================================================ */
  function createWallet(camera) {
    var group = new THREE.Group();
    group.name = 'wallet';
    camera.add(group);

    var ORDER = [10, 50, 100, 500, 1000];
    var items = [];      // {value, kind, node, base:{x,y}, hint}

    // おさいふのトレー
    var trayTex = U.canvasTexture(1024, 256, function (ctx, w, h) {
      var g = U.vGrad(ctx, 0, 0, h, [[0, 'rgba(60,40,25,0.92)'], [1, 'rgba(35,22,14,0.94)']]);
      ctx.clearRect(0, 0, w, h);
      U.roundRect(ctx, 4, 4, w - 8, h - 8, 44); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(255,205,140,0.55)'; ctx.lineWidth = 6;
      U.roundRect(ctx, 12, 12, w - 24, h - 24, 38); ctx.stroke();
      ctx.fillStyle = 'rgba(255,225,180,0.92)';
      ctx.font = 'bold 44px ' + JP; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('おさいふ', 40, 46);
    });
    var tray = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: trayTex, transparent: true, depthTest: false })
    );
    tray.renderOrder = 900;
    group.add(tray);

    // ヒント用のリング（お手伝いモードで光る）
    function makeHint() {
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.0, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffe14a, transparent: true, opacity: 0, depthTest: false, side: THREE.DoubleSide
        })
      );
      ring.renderOrder = 920;
      return ring;
    }

    /* おさいふはUIなので深度テストを切って手前に描く。
       このとき「不透明のまま」だと半透明のトレーより先に描かれて隠れてしまうので、
       透明あつかい（不透明度は1のまま）にして描画順を renderOrder で決める。 */
    function asOverlay(root, order) {
      root.traverse(function (o) {
        if (!o.isMesh) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        var cloned = mats.map(function (mm) {
          var c = mm.clone();
          c.depthTest = false;
          c.depthWrite = false;
          c.transparent = true;
          return c;
        });
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
        o.renderOrder = order;
      });
    }

    ORDER.forEach(function (v) {
      var node = new THREE.Group();
      // 下に「まだまだあるよ」の重なりを描いておく
      var pile = new THREE.Group();
      node.add(pile);
      for (var k = 2; k >= 1; k--) {
        var sh = (v === 1000) ? makeBill() : makeCoin(v);
        sh.position.set(k * 0.0032, -k * 0.0032, -k * 0.0016);
        asOverlay(sh, 905);
        pile.add(sh);
      }
      // 一番上（つかめるやつ）
      var top = (v === 1000) ? makeBill() : makeCoin(v);
      asOverlay(top, 910);
      top.traverse(function (o) {
        if (o.isMesh) o.userData.vm = { action: 'money', value: v };
      });
      node.add(top);

      var hint = makeHint();
      node.add(hint);

      group.add(node);
      items.push({ value: v, kind: v === 1000 ? 'bill' : 'coin', node: node, top: top, pile: pile, hint: hint });
    });

    /* ---- レイアウト（画面の向きに合わせて並べ直す） ---- */
    var layout = { dist: 1.30, scaleCoin: 4.6, scaleBill: 1.5 };

    function relayout(aspect, fovDeg) {
      var vh = 2 * layout.dist * Math.tan(fovDeg * Math.PI / 360);
      var vw = vh * aspect;
      group.position.set(0, 0, -layout.dist);

      var portrait = aspect < 1.0;
      var slotW = Math.min(vw / 5.4, portrait ? 0.150 : 0.185);
      var sCoin = slotW / (COINS[500].r * 2) * 0.66;
      var sBill = slotW / BILL.w * 0.92;
      var y = -vh / 2 + slotW * 0.72;

      var startX = -slotW * 2;
      items.forEach(function (it, i) {
        var x = startX + i * slotW;
        it.node.position.set(x, y, 0);
        var s = it.kind === 'bill' ? sBill : sCoin;
        it.node.scale.setScalar(s);
        it.hint.scale.setScalar(it.kind === 'bill' ? BILL.w * 0.62 : COINS[it.value].r * 1.5);
        it.base = { x: x, y: y, s: s };
      });

      tray.scale.set(slotW * 5.5, slotW * 1.35, 1);
      tray.position.set(0, y + slotW * 0.06, -0.004);
      layout.slotW = slotW;
      layout.y = y;
      // おさいふの上端が画面の下から何割の位置か（ヒントの表示位置に使う）
      var trayTop = y + slotW * 0.06 + slotW * 1.35 / 2;
      layout.trayTopFromBottom = U.clamp((trayTop / (vh / 2) + 1) / 2, 0.05, 0.5);
    }

    /* ---- ヒント表示 ---- */
    var hintValues = [];
    function setHint(values) {
      hintValues = values || [];
      items.forEach(function (it) {
        it.hint.material.opacity = hintValues.indexOf(it.value) >= 0 ? 0.85 : 0;
      });
    }

    var hintT = 0;
    function update(dt) {
      hintT += dt;
      items.forEach(function (it) {
        if (hintValues.indexOf(it.value) >= 0) {
          var p = 1 + Math.sin(hintT * 5) * 0.10;
          it.node.scale.setScalar(it.base.s * p);
          it.hint.material.opacity = 0.55 + Math.sin(hintT * 5) * 0.35;
        } else if (it.base) {
          it.node.scale.setScalar(it.base.s);
        }
      });
    }

    /** つかめるメッシュ一覧 */
    function pickables() {
      var arr = [];
      items.forEach(function (it) {
        it.top.traverse(function (o) { if (o.isMesh) arr.push(o); });
      });
      return arr;
    }

    return {
      group: group,
      items: items,
      relayout: relayout,
      setHint: setHint,
      update: update,
      pickables: pickables,
      layout: layout,
      setVisible: function (v) { group.visible = v; }
    };
  }

  /* ============================================================
   * おつりの内訳（大きい金種から）
   * ============================================================ */
  function breakdown(amount) {
    var out = [];
    [500, 100, 50, 10].forEach(function (v) {
      while (amount >= v) { out.push(v); amount -= v; }
    });
    return out;
  }

  /** その金額をぴったり払うのに必要な金種（お手伝いモードのヒント用） */
  function hintFor(price, credit) {
    var need = price - credit;
    if (need <= 0) return [];
    var vals = [10, 50, 100, 500];
    // 「入れすぎない」いちばん小さい金種を優先して案内する
    for (var i = 0; i < vals.length; i++) {
      if (vals[i] >= need) return [vals[i]];
    }
    return [500];
  }

  window.VMMoney = {
    COINS: COINS,
    BILL: BILL,
    makeCoin: makeCoin,
    makeBill: makeBill,
    createWallet: createWallet,
    breakdown: breakdown,
    hintFor: hintFor
  };
})();
