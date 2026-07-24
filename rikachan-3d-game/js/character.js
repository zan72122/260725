/* ================================================================
   character.js — リナちゃん 3Dキャラクター生成・きせかえ・アニメ
   ================================================================ */
(function () {
  const SKIN = 0xffdfc4;
  const SKIN_SHADE = 0xf5c9a8;

  /* ---------------- きせかえアイテムカタログ ---------------- */
  // locked: true のものは コイン or プレゼントで解放
  const RItems = {
    hairStyle: [
      { id: 'twin',     label: 'ツインテール', icon: '👧' },
      { id: 'ponytail', label: 'ポニーテール', icon: '💁' },
      { id: 'bob',      label: 'ボブ',        icon: '👩' },
      { id: 'long',     label: 'ロング',      icon: '👱' },
      { id: 'buns',     label: 'おだんご',    icon: '🐼', locked: true, price: 5 },
    ],
    hairColor: [
      { id: '#8a5a2b', label: 'ちゃいろ',  swatch: '#8a5a2b' },
      { id: '#3a2a25', label: 'くろ',      swatch: '#3a2a25' },
      { id: '#f0c34e', label: 'きんいろ',  swatch: '#f0c34e' },
      { id: '#ff9ecd', label: 'ピンク',    swatch: '#ff9ecd', locked: true, price: 5 },
      { id: '#b48ae0', label: 'むらさき',  swatch: '#b48ae0', locked: true, price: 5 },
      { id: '#7ec4e8', label: 'みずいろ',  swatch: '#7ec4e8', locked: true, price: 5 },
    ],
    dress: [
      { id: 'dress_pink',     label: 'ピンクワンピ',     icon: '👗', style: 'plain',    color: 0xff8ec7, accent: 0xffffff },
      { id: 'dress_yellow',   label: 'きいろワンピ',     icon: '🌼', style: 'plain',    color: 0xffd447, accent: 0xffffff },
      { id: 'dress_mint',     label: 'ミントワンピ',     icon: '🍀', style: 'plain',    color: 0x8fe3c0, accent: 0xffffff },
      { id: 'dress_sailor',   label: 'セーラーふく',     icon: '⛵', style: 'sailor',   color: 0xffffff, accent: 0x4a7fd4 },
      { id: 'dress_idol',     label: 'アイドルドレス',   icon: '🎤', style: 'idol',     color: 0xff5aa8, accent: 0xffe14d },
      { id: 'dress_princess', label: 'プリンセス',       icon: '👸', style: 'princess', color: 0x9ecdff, accent: 0xffffff, locked: true, price: 5 },
      { id: 'dress_purple',   label: 'むらさきひめ',     icon: '🔮', style: 'princess', color: 0xc9a0f0, accent: 0xfff0a0, locked: true, price: 5 },
      { id: 'dress_red_dot',  label: 'いちごドレス',     icon: '🍓', style: 'princess', color: 0xff5a5a, accent: 0xffffff, locked: true, price: 5 },
    ],
    shoes: [
      { id: 'shoes_red',    label: 'あかいくつ',   swatch: '#e84d4d', color: 0xe84d4d },
      { id: 'shoes_pink',   label: 'ピンクのくつ', swatch: '#ff8ec7', color: 0xff8ec7 },
      { id: 'shoes_blue',   label: 'あおいくつ',   swatch: '#5a8fe8', color: 0x5a8fe8 },
      { id: 'shoes_white',  label: 'しろいくつ',   swatch: '#ffffff', color: 0xffffff },
      { id: 'shoes_yellow', label: 'きいろいくつ', swatch: '#ffd447', color: 0xffd447, locked: true, price: 5 },
      { id: 'shoes_purple', label: 'むらさきくつ', swatch: '#b48ae0', color: 0xb48ae0, locked: true, price: 5 },
    ],
    hat: [
      { id: 'hat_none',   label: 'なし',       icon: '🚫' },
      { id: 'hat_straw',  label: 'むぎわら',   icon: '👒' },
      { id: 'hat_beret',  label: 'ベレーぼう', icon: '🧢' },
      { id: 'hat_crown',  label: 'おうかん',   icon: '👑', locked: true, price: 5 },
      { id: 'hat_flower', label: 'おはな',     icon: '🌸', locked: true, price: 5 },
    ],
    acc: [
      { id: 'acc_none',         label: 'なし',         icon: '🚫' },
      { id: 'acc_ribbon_pink',  label: 'ピンクリボン', icon: '🎀', color: 0xff5aa8 },
      { id: 'acc_ribbon_red',   label: 'あかリボン',   icon: '❤️', color: 0xe84d4d },
      { id: 'acc_star',         label: 'おほしさま',   icon: '⭐', color: 0xffd447, locked: true, price: 5 },
      { id: 'acc_heart',        label: 'ハート',       icon: '💗', color: 0xff6eb4, locked: true, price: 5 },
    ],
  };

  function findItem(cat, id) {
    return RItems[cat].find((x) => x.id === id) || RItems[cat][0];
  }

  /* ---------------- マテリアル ---------------- */
  function mat(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  }

  /* ---------------- パーツ生成ヘルパー ---------------- */
  function sphere(r, color, sx, sy, sz) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat(color));
    m.scale.set(sx || 1, sy || 1, sz || 1);
    return m;
  }
  function cyl(rTop, rBot, h, color, seg) {
    return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg || 20), mat(color));
  }
  function cone(r, h, color, seg) {
    return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 20), mat(color));
  }

  // リボン（ちょうちょ結び）
  function makeBow(color, scale) {
    const g = new THREE.Group();
    const s = scale || 1;
    const l = sphere(0.09 * s, color, 1.6, 1, 0.6);
    l.position.x = -0.11 * s;
    const r = sphere(0.09 * s, color, 1.6, 1, 0.6);
    r.position.x = 0.11 * s;
    const c = sphere(0.055 * s, color);
    g.add(l, r, c);
    return g;
  }

  /* ---------------- ドレス ---------------- */
  function buildDress(item) {
    const g = new THREE.Group();
    const style = item.style;
    const color = item.color;
    const accent = item.accent;

    if (style === 'plain') {
      const skirt = cone(0.44, 0.62, color);
      skirt.position.y = 0.62;
      const top = cyl(0.17, 0.2, 0.42, color);
      top.position.y = 1.05;
      g.add(skirt, top);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 10, 28), mat(accent));
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.34;
      g.add(trim);
      const bow = makeBow(0xffffff, 0.62);
      bow.position.set(0, 1.24, 0.17);
      g.add(bow);
    } else if (style === 'princess') {
      // ふんわりベル型スカート
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const r = 0.14 + 0.5 * Math.pow(t, 1.6);
        pts.push(new THREE.Vector2(r, 0.95 - t * 0.68));
      }
      const skirt = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat(color, { side: THREE.DoubleSide }));
      g.add(skirt);
      const top = cyl(0.16, 0.19, 0.4, color);
      top.position.y = 1.06;
      g.add(top);
      // すそフリル
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const f = sphere(0.1, accent, 1, 0.6, 1);
        f.position.set(Math.cos(a) * 0.58, 0.27, Math.sin(a) * 0.58);
        g.add(f);
      }
      // キラキラ
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const s = sphere(0.035, 0xffffff);
        s.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        s.position.set(Math.cos(a) * 0.4, 0.55 + (i % 3) * 0.12, Math.sin(a) * 0.4);
        g.add(s);
      }
      const bow = makeBow(accent, 0.7);
      bow.position.set(0, 1.24, 0.17);
      g.add(bow);
    } else if (style === 'sailor') {
      const skirt = cone(0.4, 0.42, accent);
      skirt.position.y = 0.62;
      const top = cyl(0.18, 0.21, 0.5, color);
      top.position.y = 1.05;
      g.add(skirt, top);
      // セーラーカラー
      const collar = cone(0.3, 0.22, accent);
      collar.position.y = 1.27;
      collar.scale.z = 0.85;
      g.add(collar);
      const tie = cone(0.06, 0.16, 0xe84d4d);
      tie.rotation.x = Math.PI;
      tie.position.set(0, 1.14, 0.21);
      g.add(tie);
      // スカートの白ライン
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 10, 28), mat(0xffffff));
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.44;
      g.add(trim);
    } else if (style === 'idol') {
      const skirt = cone(0.46, 0.5, color);
      skirt.position.y = 0.58;
      const under = cone(0.5, 0.3, accent);
      under.position.y = 0.42;
      const top = cyl(0.17, 0.2, 0.44, color);
      top.position.y = 1.05;
      g.add(under, skirt, top);
      // むねの星
      const starShape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 0.11 : 0.05;
        if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const star = new THREE.Mesh(
        new THREE.ExtrudeGeometry(starShape, { depth: 0.03, bevelEnabled: false }),
        new THREE.MeshBasicMaterial({ color: accent })
      );
      star.position.set(0, 1.1, 0.19);
      g.add(star);
      // キラキラすそ
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const s = sphere(0.03, 0xffffff);
        s.material = new THREE.MeshBasicMaterial({ color: 0xfff7c0 });
        s.position.set(Math.cos(a) * 0.44, 0.36, Math.sin(a) * 0.44);
        g.add(s);
      }
    }
    return g;
  }

  /* ---------------- かみがた ---------------- */
  function buildHair(styleId, colorHex, accItem) {
    const g = new THREE.Group();
    const color = new THREE.Color(colorHex);
    const hairMat = mat(color);

    // ベースキャップ（頭をおおう）
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 18), hairMat.clone());
    cap.position.set(0, 0.05, -0.05);
    cap.scale.set(1, 1, 1);
    g.add(cap);

    // まえがみ（ぷにぷに3つ）
    [[-0.2, 0.26, 0.3], [0, 0.3, 0.34], [0.2, 0.26, 0.3]].forEach((p) => {
      const b = sphere(0.17, color);
      b.material = hairMat.clone();
      b.position.set(p[0], p[1], p[2]);
      g.add(b);
    });

    const tieColor = accItem && accItem.color ? accItem.color : 0xff5aa8;

    function pigtail(x) {
      const p = new THREE.Group();
      const top = sphere(0.17, color);
      top.material = hairMat.clone();
      const tail = cone(0.15, 0.55, 0);
      tail.material = hairMat.clone();
      tail.rotation.x = Math.PI;
      tail.position.y = -0.32;
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.035, 10, 18), mat(tieColor));
      tie.rotation.x = Math.PI / 2;
      tie.position.y = 0.05;
      p.add(top, tail, tie);
      p.position.set(x, 0.12, -0.08);
      p.rotation.z = x > 0 ? -0.25 : 0.25;
      return p;
    }

    if (styleId === 'twin') {
      const l = pigtail(-0.5), r = pigtail(0.5);
      g.add(l, r);
      g.userData.swingParts = [l, r];
    } else if (styleId === 'ponytail') {
      const p = pigtail(0);
      p.position.set(0, 0.3, -0.42);
      p.rotation.x = 0.5;
      p.scale.setScalar(1.25);
      g.add(p);
      g.userData.swingParts = [p];
    } else if (styleId === 'bob') {
      [[-0.36, -0.1], [0.36, -0.1]].forEach(([x, y]) => {
        const s = sphere(0.2, color, 1, 1.35, 1);
        s.material = hairMat.clone();
        s.position.set(x, y, -0.05);
        g.add(s);
      });
      g.userData.swingParts = [];
    } else if (styleId === 'long') {
      [[-0.28], [0.28]].forEach(([x]) => {
        const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.7, 6, 14), hairMat.clone());
        s.position.set(x, -0.38, -0.22);
        g.add(s);
      });
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.6, 6, 14), hairMat.clone());
      back.position.set(0, -0.3, -0.32);
      g.add(back);
      g.userData.swingParts = [];
    } else if (styleId === 'buns') {
      [[-0.3], [0.3]].forEach(([x]) => {
        const s = sphere(0.18, color);
        s.material = hairMat.clone();
        s.position.set(x, 0.42, -0.02);
        g.add(s);
        const tie = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 10, 18), mat(tieColor));
        tie.position.set(x, 0.32, -0.02);
        g.add(tie);
      });
      g.userData.swingParts = [];
    }
    return g;
  }

  /* ---------------- ぼうし ---------------- */
  function buildHat(item) {
    const g = new THREE.Group();
    if (item.id === 'hat_straw') {
      const brim = cyl(0.62, 0.62, 0.04, 0xf0d080, 28);
      const domeM = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf0d080));
      domeM.position.y = 0.02;
      const ribbon = cyl(0.31, 0.31, 0.09, 0xe84d4d, 28);
      ribbon.position.y = 0.06;
      g.add(brim, domeM, ribbon);
    } else if (item.id === 'hat_beret') {
      const b = sphere(0.34, 0xe84d6a, 1, 0.55, 1);
      const knob = sphere(0.05, 0xc23a52);
      knob.position.y = 0.2;
      g.add(b, knob);
      g.position.x = 0.1;
      g.rotation.z = -0.15;
    } else if (item.id === 'hat_crown') {
      const base = cyl(0.24, 0.26, 0.16, 0xffd447, 24);
      g.add(base);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const sp = cone(0.06, 0.16, 0xffd447, 8);
        sp.position.set(Math.cos(a) * 0.22, 0.15, Math.sin(a) * 0.22);
        g.add(sp);
      }
      const jewel = sphere(0.05, 0xff4fa0);
      jewel.material = new THREE.MeshBasicMaterial({ color: 0xff4fa0 });
      jewel.position.set(0, 0.02, 0.26);
      g.add(jewel);
    } else if (item.id === 'hat_flower') {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const petal = sphere(0.1, 0xffb3d9, 1, 0.5, 1);
        petal.position.set(Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13);
        g.add(petal);
      }
      const center = sphere(0.08, 0xffd447);
      center.position.y = 0.03;
      g.add(center);
      g.position.set(0.28, -0.08, 0.12);
    }
    return g;
  }

  /* ---------------- アクセ（あたまのかざり） ---------------- */
  function buildAcc(item) {
    const g = new THREE.Group();
    if (item.id === 'acc_ribbon_pink' || item.id === 'acc_ribbon_red') {
      const bow = makeBow(item.color, 1.6);
      g.add(bow);
    } else if (item.id === 'acc_star') {
      const s = sphere(0.1, item.color);
      s.material = new THREE.MeshBasicMaterial({ color: item.color });
      s.scale.set(1.3, 1.3, 0.5);
      g.add(s);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const sp = cone(0.045, 0.12, item.color, 6);
        sp.material = new THREE.MeshBasicMaterial({ color: item.color });
        sp.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0);
        sp.rotation.z = a - Math.PI / 2;
        g.add(sp);
      }
    } else if (item.id === 'acc_heart') {
      const l = sphere(0.08, item.color);
      l.position.set(-0.055, 0.03, 0);
      const r = sphere(0.08, item.color);
      r.position.set(0.055, 0.03, 0);
      const b = cone(0.1, 0.16, item.color, 4);
      b.rotation.x = Math.PI;
      b.rotation.y = Math.PI / 4;
      b.position.y = -0.06;
      g.add(l, r, b);
    }
    return g;
  }

  /* ---------------- キャラクター本体 ---------------- */
  function buildInto(char, outfit) {
    // 既存パーツを破棄
    while (char.children.length) {
      const c = char.children[0];
      char.remove(c);
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { Array.isArray(o.material) ? o.material.forEach(m=>m.dispose()) : o.material.dispose(); }
      });
    }

    const dressItem = findItem('dress', outfit.dress);
    const shoesItem = findItem('shoes', outfit.shoes);
    const hatItem = findItem('hat', outfit.hat);
    const accItem = findItem('acc', outfit.acc);
    const hairStyleItem = findItem('hairStyle', outfit.hairStyle);

    const body = new THREE.Group(); // ぜんしん（ジャンプ用）
    char.add(body);

    // --- あし ---
    [-0.14, 0.14].forEach((x) => {
      const leg = cyl(0.085, 0.075, 0.45, SKIN);
      leg.position.set(x, 0.42, 0);
      body.add(leg);
      const shoe = sphere(0.13, shoesItem.color, 1, 0.75, 1.35);
      shoe.position.set(x, 0.1, 0.04);
      body.add(shoe);
      const strap = sphere(0.05, 0xffffff);
      strap.position.set(x, 0.16, 0.12);
      body.add(strap);
    });

    // --- ドレス ---
    const dress = buildDress(dressItem);
    body.add(dress);

    // --- うで ---
    const arms = {};
    [['left', -1], ['right', 1]].forEach(([side, sgn]) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(sgn * 0.24, 1.22, 0);
      const arm = cyl(0.055, 0.05, 0.42, SKIN);
      arm.position.y = -0.21;
      const hand = sphere(0.08, SKIN);
      hand.position.y = -0.44;
      // そで
      const sleeve = sphere(0.09, dressItem.color);
      sleeve.position.y = -0.02;
      armPivot.add(arm, hand, sleeve);
      armPivot.rotation.z = sgn * 0.5;
      body.add(armPivot);
      arms[side] = armPivot;
    });

    // --- あたま ---
    const head = new THREE.Group();
    head.position.y = 1.72;
    body.add(head);

    const skull = sphere(0.44, SKIN);
    head.add(skull);

    // みみ
    [-1, 1].forEach((sgn) => {
      const ear = sphere(0.09, SKIN_SHADE);
      ear.position.set(sgn * 0.42, -0.02, 0);
      head.add(ear);
    });

    // め（おおきな瞳）
    const eyes = [];
    [-1, 1].forEach((sgn) => {
      const eyeG = new THREE.Group();
      eyeG.position.set(sgn * 0.16, 0.0, 0.38);
      const iris = sphere(0.085, 0x4a2e18, 1, 1.35, 0.5);
      const hl1 = sphere(0.028, 0xffffff);
      hl1.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      hl1.position.set(0.025, 0.05, 0.05);
      const hl2 = sphere(0.016, 0xffffff);
      hl2.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      hl2.position.set(-0.025, -0.02, 0.055);
      eyeG.add(iris, hl1, hl2);
      head.add(eyeG);
      eyes.push(eyeG);
    });

    // ほっぺ
    [-1, 1].forEach((sgn) => {
      const blush = sphere(0.07, 0xffa8c0, 1, 0.6, 0.4);
      blush.position.set(sgn * 0.27, -0.12, 0.33);
      head.add(blush);
    });

    // くち（にっこり）
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.018, 8, 14, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xd4506a })
    );
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.16, 0.4);
    head.add(mouth);

    // かみ
    const hair = buildHair(hairStyleItem.id, outfit.hairColor, accItem);
    head.add(hair);

    // ぼうし
    if (hatItem.id !== 'hat_none') {
      const hat = buildHat(hatItem);
      hat.position.y = 0.42;
      head.add(hat);
    }

    // アクセ
    if (accItem.id !== 'acc_none') {
      const acc = buildAcc(accItem);
      acc.position.set(0.3, 0.36, 0.2);
      acc.rotation.y = 0.35;
      head.add(acc);
    }

    char.userData.parts = {
      body, head, arms, eyes,
      swingParts: hair.userData.swingParts || [],
    };
    char.userData.blinkT = 0;
    char.userData.nextBlink = 1 + Math.random() * 3;
    if (!char.userData.mood) char.userData.mood = 'idle';
    char.userData.moodT = 0;
  }

  const RCharacter = {
    Items: RItems,
    findItem,

    create(outfit) {
      const char = new THREE.Group();
      buildInto(char, outfit);
      return char;
    },

    applyOutfit(char, outfit) {
      const mood = char.userData.mood;
      buildInto(char, outfit);
      char.userData.mood = mood;
    },

    setMood(char, mood, duration) {
      char.userData.mood = mood;
      char.userData.moodT = 0;
      char.userData.moodDur = duration || 0; // 0 = ずっと
    },

    /* 毎フレームのアニメーション */
    animate(char, time, dt) {
      const u = char.userData;
      const p = u.parts;
      if (!p) return;
      u.moodT += dt;
      if (u.moodDur && u.moodT > u.moodDur) {
        u.mood = 'idle';
        u.moodDur = 0;
      }
      const t = time;

      // まばたき
      u.blinkT += dt;
      let blink = 1;
      if (u.blinkT > u.nextBlink) {
        const bt = u.blinkT - u.nextBlink;
        if (bt < 0.12) blink = Math.max(0.08, 1 - bt / 0.05);
        else { u.blinkT = 0; u.nextBlink = 1.5 + Math.random() * 3.5; }
      }
      p.eyes.forEach((e) => { e.scale.y = blink; });

      if (u.mood === 'idle') {
        p.body.position.y = Math.sin(t * 2.2) * 0.03;
        p.body.rotation.z = Math.sin(t * 1.1) * 0.02;
        p.head.rotation.z = Math.sin(t * 1.4) * 0.05;
        p.head.rotation.y = Math.sin(t * 0.7) * 0.12;
        p.arms.left.rotation.z = -0.5 + Math.sin(t * 2.2) * 0.08;
        p.arms.right.rotation.z = 0.5 - Math.sin(t * 2.2) * 0.08;
        p.arms.left.rotation.x = 0;
        p.arms.right.rotation.x = 0;
      } else if (u.mood === 'dance') {
        const beat = t * 4.6;
        p.body.position.y = Math.abs(Math.sin(beat)) * 0.18;
        p.body.rotation.z = Math.sin(beat * 0.5) * 0.12;
        p.head.rotation.z = Math.sin(beat * 0.5 + 1) * 0.15;
        p.arms.left.rotation.z = -2.4 + Math.sin(beat) * 0.5;
        p.arms.right.rotation.z = 2.4 - Math.sin(beat + Math.PI) * 0.5;
        p.arms.left.rotation.x = Math.sin(beat * 0.5) * 0.4;
        p.arms.right.rotation.x = -Math.sin(beat * 0.5) * 0.4;
      } else if (u.mood === 'happy') {
        const jt = u.moodT * 6;
        p.body.position.y = Math.abs(Math.sin(jt)) * 0.3;
        p.arms.left.rotation.z = -2.6;
        p.arms.right.rotation.z = 2.6;
        p.head.rotation.z = Math.sin(jt) * 0.1;
      } else if (u.mood === 'work') {
        p.body.position.y = Math.sin(t * 3) * 0.02;
        p.arms.left.rotation.z = -1.1 + Math.sin(t * 6) * 0.25;
        p.arms.right.rotation.z = 1.1 - Math.sin(t * 6 + 1) * 0.25;
        p.head.rotation.y = Math.sin(t * 0.9) * 0.08;
      } else if (u.mood === 'wave') {
        p.body.position.y = Math.sin(t * 2.2) * 0.03;
        p.arms.right.rotation.z = 2.6 + Math.sin(t * 8) * 0.35;
        p.arms.left.rotation.z = -0.5;
        p.head.rotation.z = Math.sin(t * 2) * 0.08;
      }

      // ツインテールなどのゆれ
      p.swingParts.forEach((sp, i) => {
        const base = sp.position.x > 0 ? -0.25 : sp.position.x < 0 ? 0.25 : 0;
        sp.rotation.z = base + Math.sin(t * 3 + i * 1.5) * 0.13;
        sp.rotation.x = (sp.rotation.x || 0) * 0.9 + Math.sin(t * 2.4 + i) * 0.06 * 0.1;
        if (sp.position.z < -0.3) sp.rotation.x = 0.5 + Math.sin(t * 3) * 0.12;
      });
    },
  };

  window.RCharacter = RCharacter;
})();
