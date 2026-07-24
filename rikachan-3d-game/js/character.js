/* ================================================================
   character.js — リナちゃん 3Dキャラクター生成・きせかえ・アニメ
   脚・腕は関節（ピボット）を持ち、歩く・持つ・咳きこむ等の
   「からだの動き」を表現できる。
   ================================================================ */
(function () {
  const SKIN = 0xffdfc4;
  const SKIN_SHADE = 0xf5c9a8;

  /* ---------------- きせかえアイテムカタログ ---------------- */
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
      { id: 'dress_pink',     label: 'ピンクワンピ',     icon: '👗', style: 'plain',    color: 0xff8ec7, accent: 0xffffff, folded: true },
      { id: 'dress_yellow',   label: 'きいろワンピ',     icon: '🌼', style: 'plain',    color: 0xffd447, accent: 0xffffff, folded: true },
      { id: 'dress_mint',     label: 'ミントワンピ',     icon: '🍀', style: 'plain',    color: 0x8fe3c0, accent: 0xffffff, folded: true },
      { id: 'dress_sailor',   label: 'セーラーふく',     icon: '⛵', style: 'sailor',   color: 0xffffff, accent: 0x4a7fd4, folded: true },
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

  function mat(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  }
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
  window.RMakeBow = makeBow;

  /* ---------------- ドレス ---------------- */
  function buildDress(item) {
    const g = new THREE.Group();
    const style = item.style;
    const color = item.color;
    const accent = item.accent;

    if (style === 'camisole') {
      // したぎ（きがえの途中のすがた）
      const top = cyl(0.17, 0.2, 0.45, 0xffffff);
      top.position.y = 1.03;
      g.add(top);
      [-1, 1].forEach((sgn) => {
        const strap = cyl(0.02, 0.02, 0.16, 0xffffff, 8);
        strap.position.set(sgn * 0.12, 1.32, 0);
        g.add(strap);
      });
      const pants = cyl(0.21, 0.24, 0.22, 0xfff0f6);
      pants.position.y = 0.76;
      g.add(pants);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 20), mat(0xffd0e8));
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 1.26;
      g.add(trim);
      return g;
    }

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
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const f = sphere(0.1, accent, 1, 0.6, 1);
        f.position.set(Math.cos(a) * 0.58, 0.27, Math.sin(a) * 0.58);
        g.add(f);
      }
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
      const collar = cone(0.3, 0.22, accent);
      collar.position.y = 1.27;
      collar.scale.z = 0.85;
      g.add(collar);
      const tie = cone(0.06, 0.16, 0xe84d4d);
      tie.rotation.x = Math.PI;
      tie.position.set(0, 1.14, 0.21);
      g.add(tie);
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

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 18), hairMat.clone());
    cap.position.set(0, 0.05, -0.05);
    g.add(cap);

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
  window.RBuildHat = buildHat;

  /* ---------------- アクセ ---------------- */
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
    while (char.children.length) {
      const c = char.children[0];
      char.remove(c);
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { Array.isArray(o.material) ? o.material.forEach(m => m.dispose()) : o.material.dispose(); }
      });
    }

    const isCamisole = outfit.dress === '_camisole';
    const dressItem = isCamisole ? { style: 'camisole', color: 0xffffff, accent: 0xffffff } : findItem('dress', outfit.dress);
    const shoesItem = findItem('shoes', outfit.shoes);
    const hatItem = findItem('hat', outfit.hat);
    const accItem = findItem('acc', outfit.acc);
    const hairStyleItem = findItem('hairStyle', outfit.hairStyle);

    const body = new THREE.Group();
    char.add(body);

    // --- あし（つけね関節つき） ---
    const legs = {};
    [['left', -1], ['right', 1]].forEach(([side, sgn]) => {
      const legPivot = new THREE.Group();
      legPivot.position.set(sgn * 0.14, 0.9, 0);
      const leg = cyl(0.085, 0.075, 0.45, SKIN);
      leg.position.y = -0.47;
      const shoe = sphere(0.13, shoesItem.color, 1, 0.75, 1.35);
      shoe.position.set(0, -0.8, 0.04);
      const strap = sphere(0.05, 0xffffff);
      strap.position.set(0, -0.74, 0.12);
      legPivot.add(leg, shoe, strap);
      body.add(legPivot);
      legs[side] = legPivot;
    });

    // --- ドレス（またはキャミソール） ---
    const dress = buildDress(dressItem);
    body.add(dress);

    // --- うで（て先にアンカーつき） ---
    const arms = {};
    const hands = {};
    [['left', -1], ['right', 1]].forEach(([side, sgn]) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(sgn * 0.24, 1.22, 0);
      const arm = cyl(0.055, 0.05, 0.42, SKIN);
      arm.position.y = -0.21;
      const hand = sphere(0.08, SKIN);
      hand.position.y = -0.44;
      const sleeve = sphere(0.09, isCamisole ? 0xffffff : dressItem.color);
      sleeve.position.y = -0.02;
      const anchor = new THREE.Group();
      anchor.position.y = -0.48;
      armPivot.add(arm, hand, sleeve, anchor);
      armPivot.rotation.z = sgn * 0.5;
      body.add(armPivot);
      arms[side] = armPivot;
      hands[side] = anchor;
    });

    // --- りょうてで前に持つ用アンカー ---
    const front = new THREE.Group();
    front.position.set(0, 1.0, 0.42);
    body.add(front);

    // --- あたま ---
    const head = new THREE.Group();
    head.position.y = 1.72;
    body.add(head);

    const skull = sphere(0.44, SKIN);
    head.add(skull);

    [-1, 1].forEach((sgn) => {
      const ear = sphere(0.09, SKIN_SHADE);
      ear.position.set(sgn * 0.42, -0.02, 0);
      head.add(ear);
    });

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

    [-1, 1].forEach((sgn) => {
      const blush = sphere(0.07, 0xffa8c0, 1, 0.6, 0.4);
      blush.position.set(sgn * 0.27, -0.12, 0.33);
      head.add(blush);
    });

    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.018, 8, 14, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xd4506a })
    );
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.16, 0.4);
    head.add(mouth);

    // こむぎこ よごれ（りょうりで顔につく）
    const flour = new THREE.Group();
    [[-0.2, 0.1], [0.18, 0.02], [0, -0.05], [0.26, 0.15]].forEach(([x, y]) => {
      const p = sphere(0.07 + Math.random() * 0.03, 0xffffff, 1, 0.7, 0.4);
      p.material = new THREE.MeshLambertMaterial({ color: 0xfffdf5, transparent: true, opacity: 0 });
      p.position.set(x, y, 0.4);
      flour.add(p);
    });
    head.add(flour);

    const hair = buildHair(hairStyleItem.id, outfit.hairColor, accItem);
    head.add(hair);

    if (hatItem.id !== 'hat_none' && !isCamisole) {
      const hat = buildHat(hatItem);
      hat.position.y = 0.42;
      head.add(hat);
    }

    if (accItem.id !== 'acc_none') {
      const acc = buildAcc(accItem);
      acc.position.set(0.3, 0.36, 0.2);
      acc.rotation.y = 0.35;
      head.add(acc);
    }

    char.userData.parts = {
      body, head, arms, hands, legs, front, eyes, flour, dress,
      swingParts: hair.userData.swingParts || [],
    };
    char.userData.blinkT = 0;
    char.userData.nextBlink = 1 + Math.random() * 3;
    if (!char.userData.mood) char.userData.mood = 'idle';
    char.userData.moodT = 0;
    char.userData.flourAmt = char.userData.flourAmt || 0;
    RCharacter.setFlour(char, char.userData.flourAmt);
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
      char.userData.moodDur = duration || 0;
    },

    // 顔のこむぎこ（0〜1）
    setFlour(char, amt) {
      char.userData.flourAmt = Math.max(0, Math.min(1, amt));
      const f = char.userData.parts && char.userData.parts.flour;
      if (f) f.children.forEach((p) => { p.material.opacity = char.userData.flourAmt * 0.95; });
    },

    // てにアイテムをもたせる（side: 'left'|'right'|'front'）
    hold(char, side, obj) {
      const p = char.userData.parts;
      const anchor = side === 'front' ? p.front : p.hands[side];
      RCharacter.drop(char, side);
      if (obj) anchor.add(obj);
    },
    drop(char, side) {
      const p = char.userData.parts;
      const anchor = side === 'front' ? p.front : p.hands[side];
      while (anchor.children.length) anchor.remove(anchor.children[0]);
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
      const mood = u.mood;

      // まばたき（咳・くしゃみちゅうは目をつぶる）
      u.blinkT += dt;
      let blink = 1;
      if (u.blinkT > u.nextBlink) {
        const bt = u.blinkT - u.nextBlink;
        if (bt < 0.12) blink = Math.max(0.08, 1 - bt / 0.05);
        else { u.blinkT = 0; u.nextBlink = 1.5 + Math.random() * 3.5; }
      }
      if (mood === 'cough' || mood === 'sneeze' || mood === 'shiver') blink = 0.08;
      p.eyes.forEach((e) => { e.scale.y = blink; });

      const resetLegs = () => { p.legs.left.rotation.x = 0; p.legs.right.rotation.x = 0; };

      if (mood === 'manual') {
        // シーケンスが直接ポーズを制御中：なにもしない
      } else if (mood === 'idle') {
        p.body.position.y = Math.sin(t * 2.2) * 0.03;
        p.body.rotation.z = Math.sin(t * 1.1) * 0.02;
        p.body.rotation.x = 0;
        p.head.rotation.z = Math.sin(t * 1.4) * 0.05;
        p.head.rotation.y = Math.sin(t * 0.7) * 0.12;
        p.head.rotation.x = 0;
        p.arms.left.rotation.set(0, 0, -0.5 + Math.sin(t * 2.2) * 0.08);
        p.arms.right.rotation.set(0, 0, 0.5 - Math.sin(t * 2.2) * 0.08);
        resetLegs();
      } else if (mood === 'walk' || mood === 'carry') {
        const swing = Math.sin(t * 9);
        p.body.position.y = Math.abs(Math.sin(t * 9)) * 0.05;
        p.body.rotation.x = 0.04;
        p.body.rotation.z = 0;
        p.legs.left.rotation.x = swing * 0.55;
        p.legs.right.rotation.x = -swing * 0.55;
        if (mood === 'carry') {
          p.arms.left.rotation.set(-1.25, 0, -0.18);
          p.arms.right.rotation.set(-1.25, 0, 0.18);
        } else {
          p.arms.left.rotation.set(-swing * 0.4, 0, -0.45);
          p.arms.right.rotation.set(swing * 0.4, 0, 0.45);
        }
        p.head.rotation.set(0, 0, Math.sin(t * 4.5) * 0.03);
      } else if (mood === 'dance') {
        const beat = t * 4.6;
        p.body.position.y = Math.abs(Math.sin(beat)) * 0.18;
        p.body.rotation.z = Math.sin(beat * 0.5) * 0.12;
        p.body.rotation.x = 0;
        p.head.rotation.z = Math.sin(beat * 0.5 + 1) * 0.15;
        p.arms.left.rotation.set(Math.sin(beat * 0.5) * 0.4, 0, -2.4 + Math.sin(beat) * 0.5);
        p.arms.right.rotation.set(-Math.sin(beat * 0.5) * 0.4, 0, 2.4 - Math.sin(beat + Math.PI) * 0.5);
        p.legs.left.rotation.x = Math.sin(beat) * 0.2;
        p.legs.right.rotation.x = -Math.sin(beat) * 0.2;
      } else if (mood === 'happy') {
        const jt = u.moodT * 6;
        p.body.position.y = Math.abs(Math.sin(jt)) * 0.3;
        p.arms.left.rotation.set(0, 0, -2.6);
        p.arms.right.rotation.set(0, 0, 2.6);
        p.head.rotation.z = Math.sin(jt) * 0.1;
        resetLegs();
      } else if (mood === 'work') {
        p.body.position.y = Math.sin(t * 3) * 0.02;
        p.body.rotation.x = 0.06;
        p.arms.left.rotation.set(0, 0, -1.1 + Math.sin(t * 6) * 0.25);
        p.arms.right.rotation.set(0, 0, 1.1 - Math.sin(t * 6 + 1) * 0.25);
        p.head.rotation.y = Math.sin(t * 0.9) * 0.08;
        resetLegs();
      } else if (mood === 'wave') {
        p.body.position.y = Math.sin(t * 2.2) * 0.03;
        p.arms.right.rotation.set(0, 0, 2.6 + Math.sin(t * 8) * 0.35);
        p.arms.left.rotation.set(0, 0, -0.5);
        p.head.rotation.z = Math.sin(t * 2) * 0.08;
        resetLegs();
      } else if (mood === 'cough') {
        // けほけほっ：まえかがみで肩がゆれ、くちに手
        p.body.rotation.x = 0.16 + Math.sin(u.moodT * 16) * 0.07;
        p.body.position.y = 0;
        p.head.rotation.x = 0.25;
        p.arms.right.rotation.set(-2.1, 0, 0.35);
        p.arms.left.rotation.set(0, 0, -0.8);
        resetLegs();
      } else if (mood === 'sneeze') {
        // はっ…はっくしょん！
        const q = u.moodDur ? u.moodT / u.moodDur : u.moodT;
        if (q < 0.55) {
          p.head.rotation.x = -0.4 * (q / 0.55);
          p.body.rotation.x = -0.1 * (q / 0.55);
        } else {
          p.head.rotation.x = 0.55;
          p.body.rotation.x = 0.3;
        }
        p.arms.left.rotation.set(0, 0, -0.9);
        p.arms.right.rotation.set(0, 0, 0.9);
        resetLegs();
      } else if (mood === 'shiver') {
        // さむさむっ：うでをからだにまわしてぶるぶる
        p.body.rotation.z = Math.sin(t * 30) * 0.045;
        p.body.rotation.x = 0.05;
        p.body.position.y = 0;
        p.arms.left.rotation.set(-0.7, 0, -2.25);
        p.arms.right.rotation.set(-0.7, 0, 2.25);
        p.head.rotation.z = Math.sin(t * 30) * 0.05;
        resetLegs();
      } else if (mood === 'bow') {
        const q = Math.min(1, u.moodT * 2.5);
        p.body.rotation.x = 0.7 * (q < 0.5 ? q * 2 : 1) * (u.moodDur && u.moodT > u.moodDur - 0.4 ? 0.3 : 1);
        p.arms.left.rotation.set(0, 0, -0.35);
        p.arms.right.rotation.set(0, 0, 0.35);
        p.head.rotation.x = 0.2;
        resetLegs();
      } else if (mood === 'crouch') {
        // しゃがんで さぎょう
        p.body.position.y = -0.32;
        p.body.rotation.x = 0.28;
        p.legs.left.rotation.x = -1.0;
        p.legs.right.rotation.x = -1.0;
        p.arms.left.rotation.set(-0.9, 0, -0.4);
        p.arms.right.rotation.set(-0.9, 0, 0.4);
        p.head.rotation.x = 0.15;
      } else if (mood === 'wipe') {
        // ふ〜っと ひたいの汗をふく
        p.body.rotation.x = 0;
        p.body.position.y = 0;
        p.arms.right.rotation.set(-2.5, 0, 0.9 + Math.sin(u.moodT * 7) * 0.35);
        p.arms.left.rotation.set(0, 0, -0.55);
        p.head.rotation.z = Math.sin(u.moodT * 7) * 0.06;
        resetLegs();
      } else if (mood === 'reach') {
        // りょうてを まえへ（うけとる・さしだす）
        p.body.rotation.x = 0.1;
        p.arms.left.rotation.set(-1.5, 0, -0.15);
        p.arms.right.rotation.set(-1.5, 0, 0.15);
        resetLegs();
      }

      // ツインテールなどのゆれ
      p.swingParts.forEach((sp, i) => {
        const base = sp.position.x > 0 ? -0.25 : sp.position.x < 0 ? 0.25 : 0;
        sp.rotation.z = base + Math.sin(t * 3 + i * 1.5) * 0.13;
        if (sp.position.z < -0.3) sp.rotation.x = 0.5 + Math.sin(t * 3) * 0.12;
      });
    },
  };

  window.RCharacter = RCharacter;
})();
