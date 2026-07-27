/* ============================================================
 * machine_parts.js — 自販機の共通パーツ
 *   ・筐体（キャビネット）
 *   ・金銭ユニット（紙幣挿入口・硬貨投入口・返却レバー・金額表示）
 *   ・商品取出口（フラップ扉）
 *   ・釣銭受け皿
 *   ・値段プレート／選択ボタン
 * ============================================================ */
(function () {
  'use strict';

  var U = window.VMUtil;
  var JP = window.VMProducts.JP_FONT;

  var P = {};

  /* ---------------- 共通マテリアル ---------------- */
  P.mat = {};

  function initMats() {
    if (P.mat.dark) return;
    P.mat.dark = new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 0.62, metalness: 0.25 });
    P.mat.darker = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.85, metalness: 0.05 });
    P.mat.steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.38, metalness: 0.78 });
    P.mat.steelDark = new THREE.MeshStandardMaterial({ color: 0x6b737a, roughness: 0.45, metalness: 0.72 });
    P.mat.white = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.55, metalness: 0.05 });
    P.mat.rubber = new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.95, metalness: 0.0 });
    P.mat.glass = new THREE.MeshPhongMaterial({
      color: 0xeaf6ff, transparent: true, opacity: 0.16, shininess: 120,
      specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false
    });
    P.mat.lightbox = new THREE.MeshBasicMaterial({ color: 0xfdfaf2 });
    P.mat.shelf = new THREE.MeshPhongMaterial({
      color: 0xdff0ff, transparent: true, opacity: 0.30, shininess: 90, side: THREE.DoubleSide
    });
  }

  /* ============================================================
   * キャビネット（本体の箱）
   * ============================================================ */
  P.cabinet = function (W, H, D, bodyColor) {
    initMats();
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor, roughness: 0.44, metalness: 0.22
    });
    var sideMat = new THREE.MeshStandardMaterial({
      color: U.shade(bodyColor, -0.14), roughness: 0.50, metalness: 0.20
    });

    // 側面＋背面＋天板（前面は扉が別なので開けておく）
    function slab(w, h, d, x, y, z, m) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    }
    var t = 0.028;
    slab(t, H, D, -W / 2 + t / 2, H / 2, 0, sideMat);        // 左
    slab(t, H, D, W / 2 - t / 2, H / 2, 0, sideMat);         // 右
    slab(W, H, t, 0, H / 2, -D / 2 + t / 2, P.mat.dark);     // 背
    slab(W, t, D, 0, H - t / 2, 0, sideMat);                 // 天

    // 内側の白い反射面（庫内は白いパネル）
    var inner = new THREE.Mesh(
      new THREE.BoxGeometry(W - t * 2.2, H - t * 2, D - t * 2),
      new THREE.MeshStandardMaterial({ color: 0xe7ecef, roughness: 0.8, side: THREE.BackSide })
    );
    inner.position.y = H / 2;
    g.add(inner);

    // 台座（幅木）
    var base = new THREE.Mesh(new THREE.BoxGeometry(W * 1.005, 0.055, D * 1.005), P.mat.darker);
    base.position.y = 0.0275;
    g.add(base);

    // アジャスター脚
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      var f = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.03, 10), P.mat.steelDark);
      f.position.set(s[0] * (W / 2 - 0.07), 0.015, s[1] * (D / 2 - 0.07));
      g.add(f);
    });

    g.userData.bodyMat = bodyMat;
    g.userData.sideMat = sideMat;
    return g;
  };

  /* ============================================================
   * 上部ヘッダー（光る看板）
   * ============================================================ */
  P.header = function (W, h, title, color) {
    initMats();
    var g = new THREE.Group();
    var tex = U.canvasTexture(1024, 200, function (ctx, w, hh) {
      var grd = U.vGrad(ctx, 0, 0, hh, [[0, '#ffffff'], [0.55, '#fdf6e6'], [1, '#e8dcc4']]);
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = U.cssColor(color);
      ctx.fillRect(0, hh * 0.86, w, hh * 0.14);
      U.fitText(ctx, title, w / 2, hh * 0.44, w * 0.80, 96, JP, U.cssColor(color));
      // 左右のきらり
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (var i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(40 + i * 22, hh * 0.20, 5 - i * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.arc(w - 40 - i * 22, hh * 0.20, 5 - i * 0.5, 0, Math.PI * 2); ctx.fill();
      }
    });
    var panel = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.94, h * 0.82),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    panel.position.z = 0.002;
    g.add(panel);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(W * 0.97, h, 0.022), P.mat.dark);
    frame.position.z = -0.012;
    g.add(frame);
    return g;
  };

  /* ============================================================
   * 値段プレート（LED風の価格表示＋つめたい/あたたかい＋売切ランプ）
   * ============================================================ */
  P.priceTag = function (def, w, h) {
    initMats();
    var g = new THREE.Group();
    var state = { soldOut: false, affordable: false };

    var tex = U.canvasTexture(320, 128, function () { });
    function draw() {
      U.redrawTexture(tex, function (ctx, cw, ch) {
        ctx.fillStyle = '#0d1116'; ctx.fillRect(0, 0, cw, ch);
        // 温冷タグ
        var hot = !!def.hot;
        var tagW = cw * 0.30;
        ctx.fillStyle = state.soldOut ? '#3a3f45' : (hot ? '#e03123' : '#1673d6');
        U.roundRect(ctx, 6, 8, tagW, ch - 16, 10); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px ' + JP; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (def.hot === undefined) {
          ctx.fillText('おかし', 6 + tagW / 2, ch / 2);
        } else {
          ctx.fillText(hot ? 'あたたか' : 'つめたい', 6 + tagW / 2, ch / 2);
        }
        // 価格
        if (state.soldOut) {
          ctx.fillStyle = '#ff3b30';
          ctx.font = 'bold 44px ' + JP;
          ctx.fillText('うりきれ', cw * 0.68, ch / 2);
        } else {
          ctx.fillStyle = state.affordable ? '#7dff8a' : '#ff9d3a';
          ctx.shadowColor = state.affordable ? '#2bff4a' : '#ff7b00';
          ctx.shadowBlur = 16;
          ctx.font = 'bold 62px "DS-Digital","Courier New",monospace';
          ctx.fillText('¥' + def.price, cw * 0.66, ch / 2 + 2);
          ctx.shadowBlur = 0;
        }
      });
    }
    draw();

    var plate = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    g.add(plate);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, h * 1.18, 0.012), P.mat.darker);
    frame.position.z = -0.008;
    g.add(frame);

    g.userData.setSoldOut = function (v) { if (state.soldOut !== v) { state.soldOut = v; draw(); } };
    g.userData.setAffordable = function (v) { if (state.affordable !== v) { state.affordable = v; draw(); } };
    return g;
  };

  /* ============================================================
   * 選択ボタン（押し込み＆点灯するリアルなボタン）
   * ============================================================ */
  P.selectButton = function (radius, tint) {
    initMats();
    var g = new THREE.Group();

    // 台座（黒いリング）
    var seat = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.28, radius * 1.34, 0.016, 24),
      P.mat.darker
    );
    seat.rotation.x = Math.PI / 2;
    g.add(seat);

    // 光るリング
    var ringMat = new THREE.MeshStandardMaterial({
      color: 0x2a2f35, emissive: 0x000000, roughness: 0.4, metalness: 0.1
    });
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.10, radius * 0.13, 8, 28), ringMat
    );
    ring.position.z = 0.010;
    g.add(ring);

    // 押しボタン本体
    var capMat = new THREE.MeshStandardMaterial({
      color: tint || 0xe9edf1, roughness: 0.30, metalness: 0.05,
      emissive: 0x000000
    });
    var cap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.96, 0.020, 24), capMat
    );
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.014;
    g.add(cap);

    // ボタン面のツヤ
    var gloss = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.92, 24),
      new THREE.MeshPhongMaterial({
        color: 0xffffff, transparent: true, opacity: 0.18, shininess: 140
      })
    );
    gloss.position.z = 0.0245;
    g.add(gloss);

    var restZ = 0;
    g.userData.press = function (onDone) {
      U.tween({
        dur: 0.09, ease: U.easeOutCubic,
        onUpdate: function (t) { g.position.z = restZ - 0.010 * t; },
        onDone: function () {
          U.tween({
            dur: 0.16, ease: U.easeOutBack,
            onUpdate: function (t) { g.position.z = restZ - 0.010 * (1 - t); },
            onDone: onDone || null
          });
        }
      });
    };
    g.userData.setLit = function (lit) {
      ringMat.emissive.setHex(lit ? 0x24ff5a : 0x000000);
      ringMat.color.setHex(lit ? 0x1f7a3a : 0x2a2f35);
      capMat.emissive.setHex(lit ? 0x0f3a18 : 0x000000);
    };
    g.userData.setSoldOut = function (v) {
      ringMat.emissive.setHex(v ? 0x8a0f0f : 0x000000);
      ringMat.color.setHex(v ? 0x5c1414 : 0x2a2f35);
      capMat.color.setHex(v ? 0x8d9298 : (tint || 0xe9edf1));
    };
    g.userData.hit = cap;
    return g;
  };

  /* ============================================================
   * 金額表示（7セグ風LED）
   * ============================================================ */
  P.creditDisplay = function (w, h) {
    initMats();
    var g = new THREE.Group();
    var value = 0, msg = null;

    var tex = U.canvasTexture(512, 160, function () { });
    function draw() {
      U.redrawTexture(tex, function (ctx, cw, ch) {
        ctx.fillStyle = '#07090c'; ctx.fillRect(0, 0, cw, ch);
        // 見出し
        ctx.fillStyle = '#6f7a85';
        ctx.font = 'bold 26px ' + JP; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('きんがく', 14, 26);
        // 本体
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        if (msg) {
          ctx.fillStyle = '#ffd23a'; ctx.shadowColor = '#ff9d00'; ctx.shadowBlur = 18;
          U.fitText(ctx, msg, cw / 2 + 60, ch * 0.62, cw * 0.9, 54, JP, '#ffd23a');
          ctx.shadowBlur = 0;
        } else {
          // 消灯セグメント（本物っぽさ）
          ctx.fillStyle = '#141a20';
          ctx.font = 'bold 84px "DS-Digital","Courier New",monospace';
          ctx.fillText('8888', cw - 16, ch * 0.62);
          ctx.fillStyle = '#39ff6a'; ctx.shadowColor = '#0bff4a'; ctx.shadowBlur = 22;
          ctx.fillText(String(value), cw - 16, ch * 0.62);
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#39ff6a'; ctx.font = 'bold 34px ' + JP;
          ctx.textAlign = 'left';
          ctx.fillText('円', 14, ch * 0.68);
        }
      });
    }
    draw();

    var scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    scr.position.z = 0.001;
    g.add(scr);
    var bezel = new THREE.Mesh(new THREE.BoxGeometry(w * 1.10, h * 1.22, 0.016), P.mat.darker);
    bezel.position.z = -0.010;
    g.add(bezel);

    g.userData.set = function (v) { if (value !== v || msg) { value = v; msg = null; draw(); } };
    g.userData.message = function (m) { msg = m; draw(); };
    g.userData.clearMessage = function () { if (msg) { msg = null; draw(); } };
    return g;
  };

  /* ============================================================
   * 硬貨投入口（斜めのスリット＋受け皿の縁）
   * ============================================================ */
  P.coinSlot = function () {
    initMats();
    var g = new THREE.Group();

    // 金属のエスカッション
    var plate = new THREE.Mesh(U.roundedPlate(0.085, 0.115, 0.014, 0.014, 6), P.mat.steel);
    g.add(plate);

    // スリット（黒い溝）
    var slit = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.014, 0.05), P.mat.darker);
    slit.position.set(0, 0.018, 0.002);
    slit.rotation.z = 0.20;
    g.add(slit);

    // 硬貨を導く傾斜のガイド
    var guide = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.030, 0.010), P.mat.steelDark);
    guide.position.set(0, 0.040, 0.010);
    guide.rotation.x = -0.55;
    g.add(guide);

    // 「硬貨投入口」の刻印
    var tex = U.canvasTexture(256, 96, function (ctx, w, h) {
      ctx.fillStyle = '#8f979e'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2b3036'; ctx.font = 'bold 34px ' + JP;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('コイン', w / 2, h * 0.36);
      ctx.font = 'bold 26px ' + JP;
      ctx.fillText('10 50 100 500', w / 2, h * 0.74);
    });
    var lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.028),
      new THREE.MeshBasicMaterial({ map: tex }));
    lbl.position.set(0, -0.036, 0.0085);
    g.add(lbl);

    // 投入の当たり判定（大きめの見えない板）
    var hit = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.17),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 0.01, 0.05);
    g.add(hit);
    g.userData.hit = hit;
    g.userData.entry = new THREE.Object3D();
    g.userData.entry.position.set(0, 0.018, 0.012);
    g.add(g.userData.entry);
    return g;
  };

  /* ============================================================
   * 紙幣挿入口（横長スリット＋インジケータ）
   * ============================================================ */
  P.billSlot = function () {
    initMats();
    var g = new THREE.Group();

    var plate = new THREE.Mesh(U.roundedPlate(0.20, 0.088, 0.014, 0.012, 6), P.mat.steel);
    g.add(plate);

    // スリット
    var slit = new THREE.Mesh(new THREE.BoxGeometry(0.152, 0.010, 0.06), P.mat.darker);
    slit.position.set(0, 0.012, 0.0);
    g.add(slit);
    // 挿入ガイドの面取り
    var lip = new THREE.Mesh(new THREE.BoxGeometry(0.160, 0.016, 0.012), P.mat.steelDark);
    lip.position.set(0, 0.026, 0.008);
    lip.rotation.x = -0.5;
    g.add(lip);

    // 受付ランプ
    var lampMat = new THREE.MeshStandardMaterial({
      color: 0x1b3d22, emissive: 0x1fdd4a, emissiveIntensity: 1.0, roughness: 0.4
    });
    var lamp = new THREE.Mesh(new THREE.CircleGeometry(0.007, 12), lampMat);
    lamp.position.set(-0.082, -0.020, 0.0085);
    g.add(lamp);

    var tex = U.canvasTexture(256, 64, function (ctx, w, h) {
      ctx.fillStyle = '#8f979e'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2b3036'; ctx.font = 'bold 30px ' + JP;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('おさつ 1000', w / 2, h / 2);
    });
    var lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.025),
      new THREE.MeshBasicMaterial({ map: tex }));
    lbl.position.set(0.03, -0.020, 0.0085);
    g.add(lbl);

    var hit = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.13),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 0.01, 0.05);
    g.add(hit);
    g.userData.hit = hit;
    g.userData.lampMat = lampMat;
    g.userData.setReady = function (v) {
      lampMat.emissive.setHex(v ? 0x1fdd4a : 0x5a1010);
    };
    return g;
  };

  /* ============================================================
   * 返却レバー
   * ============================================================ */
  P.returnLever = function () {
    initMats();
    var g = new THREE.Group();
    var plate = new THREE.Mesh(U.roundedPlate(0.10, 0.052, 0.012, 0.010, 6), P.mat.steel);
    g.add(plate);

    var pivot = new THREE.Group();
    pivot.position.set(0.030, 0, 0.008);
    g.add(pivot);
    var lever = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.020, 0.020),
      new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.35, metalness: 0.5 }));
    lever.position.set(-0.026, 0, 0.006);
    pivot.add(lever);
    var knob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.020, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8323c, roughness: 0.4 }));
    knob.rotation.x = Math.PI / 2;
    knob.position.set(-0.050, 0, 0.014);
    pivot.add(knob);

    var tex = U.canvasTexture(256, 64, function (ctx, w, h) {
      ctx.fillStyle = '#8f979e'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c0392b'; ctx.font = 'bold 34px ' + JP;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('おかえし', w / 2, h / 2);
    });
    var lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.015),
      new THREE.MeshBasicMaterial({ map: tex }));
    lbl.position.set(0.020, -0.017, 0.0075);
    g.add(lbl);

    var hit = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(-0.01, 0, 0.04);
    g.add(hit);
    g.userData.hit = hit;
    g.userData.pull = function (onDone) {
      U.tween({
        dur: 0.14, ease: U.easeOutCubic,
        onUpdate: function (t) { pivot.rotation.z = -0.55 * t; },
        onDone: function () {
          U.tween({
            dur: 0.30, ease: U.easeOutBack,
            onUpdate: function (t) { pivot.rotation.z = -0.55 * (1 - t); },
            onDone: onDone || null
          });
        }
      });
    };
    return g;
  };

  /* ============================================================
   * 商品取出口（押し開けるフラップ扉）
   * ============================================================ */
  P.deliveryPort = function (w, h, depth) {
    initMats();
    var g = new THREE.Group();

    // 開口部の枠
    var frameMat = P.mat.darker;
    var th = 0.020;
    function bar(bw, bh, x, y) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.030), frameMat);
      m.position.set(x, y, -0.004);
      g.add(m);
    }
    bar(w + th * 2, th, 0, h / 2 + th / 2);
    bar(w + th * 2, th, 0, -h / 2 - th / 2);
    bar(th, h + th * 2, -w / 2 - th / 2, 0);
    bar(th, h + th * 2, w / 2 + th / 2, 0);

    // 奥の受け皿（商品がたまる箱）
    //   中が真っ暗だと落ちてきた商品が見えないので、明るいグレーに自発光を少し足す
    var binMat = new THREE.MeshStandardMaterial({
      color: 0x9aa3aa, roughness: 0.72, metalness: 0.08,
      emissive: 0x2c3238, emissiveIntensity: 1.0
    });
    var floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, depth), binMat);
    floor.position.set(0, -h / 2 + 0.006, -depth / 2);
    g.add(floor);
    var back = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.9, 0.012), binMat);
    back.position.set(0, 0, -depth);
    g.add(back);
    [-1, 1].forEach(function (s) {
      var sw = new THREE.Mesh(new THREE.BoxGeometry(0.012, h * 0.9, depth), binMat);
      sw.position.set(s * w / 2, 0, -depth / 2);
      g.add(sw);
    });

    // フラップ（上端がヒンジ。半透明の樹脂板）
    var hinge = new THREE.Group();
    hinge.position.set(0, h / 2 - 0.004, 0.004);
    g.add(hinge);
    // フラップは中が透けて見えるスモーク樹脂
    var flapMat = new THREE.MeshPhongMaterial({
      color: 0xa9b6c0, transparent: true, opacity: 0.30, shininess: 110,
      side: THREE.DoubleSide, depthWrite: false
    });
    var flap = new THREE.Mesh(new THREE.BoxGeometry(w - 0.006, h - 0.008, 0.008), flapMat);
    flap.position.set(0, -(h - 0.008) / 2, 0);
    flap.renderOrder = 8;
    hinge.add(flap);
    // フラップの取っ手
    var grip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, 0.016, 0.014),
      new THREE.MeshStandardMaterial({ color: 0xd7dbe0, roughness: 0.4, metalness: 0.4 }));
    grip.position.set(0, -(h - 0.008) * 0.86, 0.010);
    hinge.add(grip);

    // 案内シール
    var tex = U.canvasTexture(256, 64, function (ctx, cw, ch) {
      ctx.fillStyle = '#ffd400'; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 34px ' + JP;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('とりだし口', cw / 2, ch / 2);
    });
    var lbl = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.42, w * 0.105),
      new THREE.MeshBasicMaterial({ map: tex }));
    lbl.position.set(0, h / 2 + th * 1.6, 0.004);
    g.add(lbl);

    var hit = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 0, 0.03);
    g.add(hit);

    var open = 0;
    g.userData.hit = hit;
    g.userData.flap = flap;
    g.userData.hinge = hinge;
    g.userData.binFloorY = -h / 2 + 0.014;
    g.userData.binDepth = depth;
    g.userData.setOpen = function (a) { open = a; hinge.rotation.x = a; };
    /** 商品が当たって押し開けられる動き */
    g.userData.swing = function (strength, onDone) {
      var s = strength || 1;
      U.tween({
        dur: 0.16, ease: U.easeOutCubic,
        onUpdate: function (t) { hinge.rotation.x = -1.15 * s * t; },
        onDone: function () {
          U.tween({
            dur: 0.55, ease: function (t) {
              return 1 - Math.cos(t * Math.PI * 3.2) * Math.exp(-t * 4.2) * (1 - t);
            },
            onUpdate: function (t) { hinge.rotation.x = -1.15 * s * (1 - t); },
            onDone: function () { hinge.rotation.x = 0; if (onDone) onDone(); }
          });
        }
      });
    };
    return g;
  };

  /* ============================================================
   * 釣銭受け皿（おつりが落ちてくる皿）
   * ============================================================ */
  P.changeTray = function (w, h, depth) {
    initMats();
    var g = new THREE.Group();
    // おつりの硬貨が見えるように、皿の中は明るいステンレス色にする
    var m = new THREE.MeshStandardMaterial({
      color: 0xaab2b9, roughness: 0.38, metalness: 0.55, emissive: 0x2a3036
    });

    var floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.010, depth), m);
    floor.position.set(0, -h / 2, -depth / 2 + 0.01);
    floor.rotation.x = 0.10;
    g.add(floor);
    var back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.010), m);
    back.position.set(0, 0, -depth);
    g.add(back);
    [-1, 1].forEach(function (s) {
      var sw = new THREE.Mesh(new THREE.BoxGeometry(0.010, h, depth), m);
      sw.position.set(s * w / 2, 0, -depth / 2 + 0.01);
      g.add(sw);
    });
    var lipTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.014, 0.026), P.mat.steel);
    lipTop.position.set(0, h / 2, 0.006);
    g.add(lipTop);

    var tex = U.canvasTexture(256, 64, function (ctx, cw, ch) {
      ctx.fillStyle = '#c9ced3'; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#22262b'; ctx.font = 'bold 32px ' + JP;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('おつり', cw / 2, ch / 2);
    });
    var lbl = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, w * 0.14),
      new THREE.MeshBasicMaterial({ map: tex }));
    lbl.position.set(0, h / 2 + 0.022, 0.004);
    g.add(lbl);

    var hit = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 1.2),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, -h * 0.1, 0.02);
    g.add(hit);
    g.userData.hit = hit;
    g.userData.floorY = -h / 2 + 0.012;
    g.userData.depth = depth;
    return g;
  };

  /* ============================================================
   * 鍵穴（お仕事モードで使う）
   * ============================================================ */
  P.keyLock = function () {
    initMats();
    var g = new THREE.Group();
    var esc = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 18), P.mat.steel);
    esc.rotation.x = Math.PI / 2;
    g.add(esc);
    var barrel = new THREE.Group();
    barrel.position.z = 0.007;
    g.add(barrel);
    var face = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 18), P.mat.steelDark);
    face.rotation.x = Math.PI / 2;
    barrel.add(face);
    var slot = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.004), P.mat.darker);
    slot.position.z = 0.003;
    barrel.add(slot);

    var hit = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.z = 0.03;
    g.add(hit);
    g.userData.hit = hit;
    g.userData.barrel = barrel;
    g.userData.turn = function (dir, onDone) {
      U.tween({
        dur: 0.5, ease: U.easeInOutCubic,
        onUpdate: function (t) { barrel.rotation.z = dir * (Math.PI / 2) * t; },
        onDone: onDone || null
      });
    };
    return g;
  };

  window.VMParts = P;
})();
