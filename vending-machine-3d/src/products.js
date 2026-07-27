/* ============================================================
 * products.js — 商品カタログと商品の3Dモデル生成
 *   缶 / ペットボトル / 袋菓子 / 箱菓子 / 筒菓子 の5タイプ。
 *   ラベルはCanvasで描いてテクスチャにしているので画像ファイルは不要。
 * ============================================================ */
(function () {
  'use strict';

  var U = window.VMUtil;
  var JP = "'Hiragino Maru Gothic ProN','ヒラギノ丸ゴ ProN W4','M PLUS Rounded 1c','Yu Gothic','Meiryo',sans-serif";

  /* ============================================================
   * カタログ
   *   price は 4歳児が硬貨を数えやすいよう 10円単位・500円未満に統一。
   * ============================================================ */

  var DRINKS = [
    { id: 'cola', name: 'コーラ', type: 'can', price: 120, color: 0xc8102e, sub: 0x2b0509, liquid: 0x3a1408, hot: false, fizzy: true, ml: 350 },
    { id: 'orange', name: 'オレンジ', type: 'pet', price: 140, color: 0xff8a1e, sub: 0xd2540a, liquid: 0xff9c22, hot: false, fizzy: false, ml: 500 },
    { id: 'soda', name: 'ソーダ', type: 'can', price: 120, color: 0x1e9be0, sub: 0x0b4d7a, liquid: 0x9fe4ff, hot: false, fizzy: true, ml: 350 },
    { id: 'ichigo', name: 'いちごミルク', type: 'pet', price: 150, color: 0xff8fb0, sub: 0xd44b74, liquid: 0xffc2d3, hot: false, fizzy: false, ml: 500 },
    { id: 'apple', name: 'りんご', type: 'can', price: 130, color: 0x8fc93a, sub: 0x3f6b12, liquid: 0xf3e08a, hot: false, fizzy: false, ml: 350 },
    { id: 'ocha', name: 'おちゃ', type: 'pet', price: 110, color: 0x1f7a4d, sub: 0x0d3f27, liquid: 0xc8a24a, hot: false, fizzy: false, ml: 500 },
    { id: 'milktea', name: 'ミルクティー', type: 'can', price: 130, color: 0xb07a4a, sub: 0x5c3a1e, liquid: 0xd8b58a, hot: true, fizzy: false, ml: 280 },
    { id: 'corn', name: 'コーンスープ', type: 'can', price: 140, color: 0xf2c53d, sub: 0xa8811a, liquid: 0xf7dd8e, hot: true, fizzy: false, ml: 280 }
  ];

  var SNACKS = [
    { id: 'chips', name: 'ポテトチップス', type: 'bag', price: 130, color: 0xf2b705, sub: 0xa87c00 },
    { id: 'choco', name: 'チョコレート', type: 'box', price: 110, color: 0x6b3a1f, sub: 0x3b1e0d },
    { id: 'cookie', name: 'クッキー', type: 'bag', price: 150, color: 0xe8a13a, sub: 0x9c611a },
    { id: 'gummy', name: 'グミ', type: 'bag', price: 120, color: 0xe0417a, sub: 0x8e1e46 },
    { id: 'ramune', name: 'ラムネ', type: 'tube', price: 100, color: 0x4fc3f7, sub: 0x1565a8 },
    { id: 'senbei', name: 'せんべい', type: 'bag', price: 140, color: 0xc98b3d, sub: 0x7a4d14 },
    { id: 'candy', name: 'キャンディ', type: 'bag', price: 110, color: 0x9b5de5, sub: 0x5a2b93 },
    { id: 'biscuit', name: 'ビスケット', type: 'box', price: 160, color: 0xe45c3a, sub: 0x932c14 },
    { id: 'chocoball', name: 'チョコボール', type: 'box', price: 100, color: 0xffb703, sub: 0xb37800 }
  ];

  /* ============================================================
   * ラベル用テクスチャ
   * ============================================================ */

  var texCache = {};

  function cache(key, make) {
    if (!texCache[key]) texCache[key] = make();
    return texCache[key];
  }

  /** 缶の胴ラベル（円周にぐるっと巻く：名前は2回描いてどこからでも読めるように） */
  function canLabelTexture(def) {
    return cache('canlbl_' + def.id, function () {
      return U.canvasTexture(768, 384, function (ctx, w, h) {
        var main = U.cssColor(def.color), dark = U.cssColor(def.sub);
        // ベース
        ctx.fillStyle = main; ctx.fillRect(0, 0, w, h);
        // 上下の帯（アルミの地色を残す）
        ctx.fillStyle = '#d9dde2'; ctx.fillRect(0, 0, w, h * 0.10);
        ctx.fillRect(0, h * 0.90, w, h * 0.10);
        // 斜めの装飾ストライプ
        ctx.save();
        ctx.globalAlpha = 0.22; ctx.fillStyle = '#ffffff';
        for (var i = -2; i < 14; i++) {
          ctx.beginPath();
          var x = i * (w / 12);
          ctx.moveTo(x, h * 0.10); ctx.lineTo(x + w / 40, h * 0.10);
          ctx.lineTo(x + w / 40 + h * 0.5, h * 0.90); ctx.lineTo(x + h * 0.5, h * 0.90);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        // 白い楕円のロゴ地。円筒のUVは u=0 が正面なので、
        // 正面(0)・裏(0.5)・継ぎ目(1.0) の3か所に描いてどの向きでも読めるようにする。
        var LU = [0, 0.5, 1.0];
        for (var k = 0; k < LU.length; k++) {
          var cx = w * LU[k];
          ctx.save();
          ctx.globalAlpha = 0.95; ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(cx, h * 0.50, w * 0.150, h * 0.255, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.strokeStyle = dark; ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.ellipse(cx, h * 0.50, w * 0.150, h * 0.255, 0, 0, Math.PI * 2);
          ctx.stroke();
          U.fitText(ctx, def.name, cx, h * 0.46, w * 0.255, 46, JP, dark);
          ctx.font = '20px ' + JP;
          ctx.fillStyle = dark; ctx.textAlign = 'center';
          ctx.fillText(def.ml + 'ml', cx, h * 0.68);
        }
        // 温/冷のマーク
        ctx.font = 'bold 22px ' + JP;
        ctx.fillStyle = def.hot ? '#ff3b30' : '#0b74d1';
        ctx.textAlign = 'left';
        ctx.fillText(def.hot ? 'あたたかい' : 'つめたい', 12, h * 0.055);
        U.addNoise(ctx, w, h, 12);
      });
    });
  }

  /** ペットボトルの巻きラベル */
  function petLabelTexture(def) {
    return cache('petlbl_' + def.id, function () {
      return U.canvasTexture(768, 320, function (ctx, w, h) {
        var main = U.cssColor(def.color), dark = U.cssColor(def.sub);
        ctx.fillStyle = main; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(0, h * 0.30, w, h * 0.40);
        ctx.fillStyle = dark;
        ctx.fillRect(0, h * 0.26, w, h * 0.035);
        ctx.fillRect(0, h * 0.705, w, h * 0.035);
        var LU = [0, 0.5, 1.0];
        for (var k = 0; k < LU.length; k++) {
          U.fitText(ctx, def.name, w * LU[k], h * 0.50, w * 0.40, 62, JP, dark);
        }
        ctx.font = '22px ' + JP; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
        ctx.fillText(def.ml + 'ml', w * 0.25, h * 0.855);
        ctx.fillText(def.ml + 'ml', w * 0.75, h * 0.855);
        // リサイクルマーク
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        [w * 0.06, w * 0.56].forEach(function (x) {
          ctx.beginPath(); ctx.arc(x, h * 0.15, 18, 0, Math.PI * 2); ctx.stroke();
          ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#fff';
          ctx.textAlign = 'center'; ctx.fillText('PET', x, h * 0.15 + 6);
        });
        U.addNoise(ctx, w, h, 8);
      });
    });
  }

  /** 袋菓子のおもて面 */
  function bagTexture(def) {
    return cache('bag_' + def.id, function () {
      return U.canvasTexture(512, 640, function (ctx, w, h) {
        var main = U.cssColor(def.color), dark = U.cssColor(def.sub);
        var g = U.vGrad(ctx, 0, 0, h, [[0, U.cssColor(U.shade(def.color, 0.12))], [0.5, main], [1, dark]]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        // ギザギザの圧着部
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(0, 0, w, h * 0.09);
        ctx.fillRect(0, h * 0.91, w, h * 0.09);
        // 商品名
        U.fitText(ctx, def.name, w / 2, h * 0.30, w * 0.86, 66, JP, '#ffffff');
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
        U.fitText(ctx, def.name, w / 2, h * 0.30, w * 0.86, 66, JP, '#ffffff');
        ctx.restore();
        // 中身のイメージ（丸をならべる）
        ctx.save();
        for (var i = 0; i < 9; i++) {
          var a = (i / 9) * Math.PI * 2;
          var x = w / 2 + Math.cos(a) * w * 0.24;
          var y = h * 0.62 + Math.sin(a) * h * 0.13;
          ctx.beginPath();
          ctx.arc(x, y, w * 0.075, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
          ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(w / 2, h * 0.62, w * 0.10, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = dark; ctx.stroke();
        ctx.restore();
        ctx.font = 'bold 30px ' + JP; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.fillText('おいしい！', w / 2, h * 0.845);
        U.addNoise(ctx, w, h, 10);
      });
    });
  }

  /** 箱菓子のおもて面 */
  function boxTexture(def) {
    return cache('box_' + def.id, function () {
      return U.canvasTexture(384, 512, function (ctx, w, h) {
        var main = U.cssColor(def.color), dark = U.cssColor(def.sub);
        ctx.fillStyle = main; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        U.roundRect(ctx, w * 0.08, h * 0.10, w * 0.84, h * 0.44, 18); ctx.fill();
        ctx.strokeStyle = dark; ctx.lineWidth = 5; ctx.stroke();
        U.fitText(ctx, def.name, w / 2, h * 0.32, w * 0.72, 46, JP, dark);
        // 中身のイメージ
        ctx.fillStyle = dark;
        for (var r = 0; r < 3; r++) {
          for (var c = 0; c < 3; c++) {
            U.roundRect(ctx, w * (0.16 + c * 0.24), h * (0.60 + r * 0.10), w * 0.19, h * 0.075, 6);
            ctx.fill();
          }
        }
        ctx.fillStyle = '#fff'; ctx.font = 'bold 24px ' + JP; ctx.textAlign = 'center';
        ctx.fillText('9こ いり', w / 2, h * 0.95);
        U.addNoise(ctx, w, h, 8);
      });
    });
  }

  /** 筒菓子（ラムネ）のラベル */
  function tubeTexture(def) {
    return cache('tube_' + def.id, function () {
      return U.canvasTexture(512, 256, function (ctx, w, h) {
        var main = U.cssColor(def.color), dark = U.cssColor(def.sub);
        ctx.fillStyle = main; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(0, h * 0.28, w, h * 0.44);
        [0, 0.5, 1.0].forEach(function (u) {
          U.fitText(ctx, def.name, w * u, h * 0.50, w * 0.4, 56, JP, dark);
        });
        U.addNoise(ctx, w, h, 8);
      });
    });
  }

  /* ============================================================
   * マテリアル
   * ============================================================ */

  var matAlu = null, matPlastic = null, matCapCache = {};

  function aluminum() {
    if (!matAlu) {
      matAlu = new THREE.MeshStandardMaterial({
        color: 0xd6dade, metalness: 0.85, roughness: 0.32
      });
    }
    return matAlu;
  }

  function clearPlastic() {
    if (!matPlastic) {
      matPlastic = new THREE.MeshPhongMaterial({
        color: 0xffffff, transparent: true, opacity: 0.24,
        shininess: 110, specular: 0xffffff, side: THREE.DoubleSide,
        depthWrite: false
      });
    }
    return matPlastic;
  }

  function capMat(color) {
    if (!matCapCache[color]) {
      matCapCache[color] = new THREE.MeshStandardMaterial({
        color: color, metalness: 0.05, roughness: 0.55
      });
    }
    return matCapCache[color];
  }

  /* ============================================================
   * 3Dモデル
   *   すべて「底面が y=0」「+Z が正面」で作る。
   * ============================================================ */

  var CAN_H = 0.122, CAN_R = 0.0330;      // 350ml缶 ≒ 直径66mm・高さ122mm
  var CAN_H_S = 0.104, CAN_R_S = 0.0265;  // 280ml（ホット用）細缶
  var PET_H = 0.208, PET_R = 0.0330;      // 500mlペット

  function buildCan(def) {
    var g = new THREE.Group();
    var h = def.ml >= 350 ? CAN_H : CAN_H_S;
    var r = def.ml >= 350 ? CAN_R : CAN_R_S;

    // 胴（ラベルのUVがきれいに出るよう開口円筒で作る）
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h * 0.845, 30, 1, true),
      new THREE.MeshStandardMaterial({
        map: canLabelTexture(def), metalness: 0.35, roughness: 0.40
      })
    );
    body.position.y = h * 0.5;
    g.add(body);

    // 下の絞りとドーム底
    var bottom = new THREE.Mesh(latheProfile([
      [0.0, 0], [0.0, r * 0.60], [h * 0.010, r * 0.74],
      [h * 0.030, r * 0.93], [h * 0.060, r], [h * 0.0775, r]
    ]), aluminum());
    g.add(bottom);

    // 上の絞りとフタ
    var top = new THREE.Mesh(latheProfile([
      [h * 0.9225, r], [h * 0.945, r * 0.97], [h * 0.968, r * 0.83],
      [h * 0.985, r * 0.80], [h * 1.000, r * 0.845],
      [h * 0.995, r * 0.775], [h * 0.978, r * 0.755], [h * 0.978, 0]
    ]), aluminum());
    g.add(top);

    // プルタブ
    var tab = new THREE.Group();
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.30, r * 0.05, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xc7ccd1, metalness: 0.9, roughness: 0.28 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0, r * 0.16);
    tab.add(ring);
    var lever = new THREE.Mesh(
      new THREE.BoxGeometry(r * 0.16, r * 0.035, r * 0.48),
      new THREE.MeshStandardMaterial({ color: 0xc7ccd1, metalness: 0.9, roughness: 0.28 })
    );
    lever.position.set(0, 0, -r * 0.18);
    tab.add(lever);
    tab.position.y = h * 0.985;
    tab.name = 'tab';
    g.add(tab);

    // 開けたときに見える「飲み口」（最初は隠しておく）
    var hole = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.30, 16),
      new THREE.MeshStandardMaterial({ color: 0x10161c, roughness: 0.9 })
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(0, h * 0.980, -r * 0.30);
    hole.visible = false;
    hole.name = 'hole';
    g.add(hole);

    g.userData.height = h;
    g.userData.radius = r;
    return g;
  }

  function latheProfile(pairs) {
    var pts = pairs.map(function (p) { return new THREE.Vector2(p[1], p[0]); });
    return new THREE.LatheGeometry(pts, 30);
  }

  function buildPet(def) {
    var g = new THREE.Group();
    var h = PET_H, r = PET_R;

    var bottle = new THREE.Mesh(U.bottleGeometry(h, r, r * 0.40), clearPlastic());
    bottle.renderOrder = 3;
    g.add(bottle);

    // 中身（円柱で近似し、Yスケールで残量を表現する）
    var liq = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.93, r * 0.90, 1, 24),
      new THREE.MeshPhongMaterial({
        color: def.liquid, transparent: true, opacity: 0.92, shininess: 60
      })
    );
    liq.name = 'liquid';
    liq.userData.fullH = h * 0.70;
    liq.scale.y = h * 0.70;
    liq.position.y = h * 0.70 / 2 + h * 0.01;
    liq.renderOrder = 2;
    g.add(liq);

    // 巻きラベル
    var label = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.012, r * 1.012, h * 0.30, 30, 1, true),
      new THREE.MeshStandardMaterial({
        map: petLabelTexture(def), roughness: 0.55, metalness: 0.0,
        side: THREE.DoubleSide
      })
    );
    label.position.y = h * 0.47;
    label.renderOrder = 4;
    g.add(label);

    // キャップ
    var cap = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.47, r * 0.47, h * 0.075, 20),
      capMat(def.sub)
    );
    cap.position.y = h * 0.985;
    cap.name = 'cap';
    cap.renderOrder = 4;
    g.add(cap);

    g.userData.height = h;
    g.userData.radius = r;
    return g;
  }

  function buildBag(def) {
    var g = new THREE.Group();
    var w = 0.115, hh = 0.155, d = 0.045;
    var tex = bagTexture(def);
    var side = new THREE.MeshStandardMaterial({
      color: U.shade(def.color, -0.10), roughness: 0.35, metalness: 0.15
    });
    var face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.30, metalness: 0.18 });
    var mats = [side, side, side, side, face, face];
    var body = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d, 1, 1, 1), mats);
    body.position.y = hh / 2;
    g.add(body);
    // 上下の圧着部（ぺたんこ）
    var seal = new THREE.MeshStandardMaterial({
      color: U.shade(def.color, 0.20), roughness: 0.4, metalness: 0.2
    });
    var s1 = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, hh * 0.10, d * 0.20), seal);
    s1.position.y = hh * 1.03; g.add(s1);
    var s2 = s1.clone(); s2.position.y = hh * -0.03; g.add(s2);

    g.userData.height = hh * 1.1;
    g.userData.radius = w / 2;
    return g;
  }

  function buildBox(def) {
    var g = new THREE.Group();
    var w = 0.075, hh = 0.135, d = 0.032;
    var tex = boxTexture(def);
    var side = new THREE.MeshStandardMaterial({ color: U.shade(def.color, -0.12), roughness: 0.7 });
    var face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 });
    var top = new THREE.MeshStandardMaterial({ color: U.shade(def.color, 0.05), roughness: 0.7 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), [side, side, top, top, face, face]);
    body.position.y = hh / 2;
    g.add(body);
    g.userData.height = hh;
    g.userData.radius = w / 2;
    return g;
  }

  function buildTube(def) {
    var g = new THREE.Group();
    var h = 0.098, r = 0.017;
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 20, 1, true),
      new THREE.MeshStandardMaterial({ map: tubeTexture(def), roughness: 0.5 })
    );
    body.position.y = h / 2;
    g.add(body);
    var capm = capMat(def.sub);
    var c1 = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, h * 0.09, 20), capm);
    c1.position.y = h * 0.955; g.add(c1);
    var c2 = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, h * 0.09, 20), capm);
    c2.position.y = h * 0.045; g.add(c2);
    g.userData.height = h;
    g.userData.radius = r;
    return g;
  }

  /** モデルを作らずに寸法だけ知りたいとき（コラムの幅決めなどに使う） */
  function sizeOf(def) {
    switch (def.type) {
      case 'can': return def.ml >= 350
        ? { height: CAN_H, radius: CAN_R }
        : { height: CAN_H_S, radius: CAN_R_S };
      case 'pet': return { height: PET_H, radius: PET_R };
      case 'bag': return { height: 0.1705, radius: 0.0575 };
      case 'box': return { height: 0.135, radius: 0.0375 };
      case 'tube': return { height: 0.098, radius: 0.017 };
    }
    return { height: 0.13, radius: 0.03 };
  }

  /** 定義から3Dモデルを作る */
  function build(def) {
    var g;
    switch (def.type) {
      case 'can': g = buildCan(def); break;
      case 'pet': g = buildPet(def); break;
      case 'bag': g = buildBag(def); break;
      case 'box': g = buildBox(def); break;
      case 'tube': g = buildTube(def); break;
      default: g = buildCan(def);
    }
    g.userData.def = def;
    g.userData.type = def.type;
    // 転がるかどうか（缶とペットとラムネは転がる）
    g.userData.rolls = (def.type === 'can' || def.type === 'pet' || def.type === 'tube');
    return g;
  }

  /* ---- 検索 ---- */
  function byId(id) {
    for (var i = 0; i < DRINKS.length; i++) if (DRINKS[i].id === id) return DRINKS[i];
    for (var j = 0; j < SNACKS.length; j++) if (SNACKS[j].id === id) return SNACKS[j];
    return null;
  }

  window.VMProducts = {
    DRINKS: DRINKS,
    SNACKS: SNACKS,
    build: build,
    sizeOf: sizeOf,
    byId: byId,
    JP_FONT: JP,
    aluminum: aluminum
  };
})();
