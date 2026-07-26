/* ============================================================
 * room.js — こうぼうの部屋・太陽・壁にうつる光の模様（コースティクス）
 * ============================================================ */
(function () {
  'use strict';

  var W = 5.2;      // 左右の壁
  var BACK = -3.8;  // 奥の壁
  var CEIL = 5.6;   // 天井

  /* ---------- 壁にぶつける ---------- */
  var SURFACES = [
    { p: new THREE.Vector3(0, 0, 0), n: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), lim: [7.5, 6.5] },      // 床
    { p: new THREE.Vector3(0, 0, BACK), n: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), lim: [7.5, 6.0] },   // 奥の壁
    { p: new THREE.Vector3(-W, 0, 0), n: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), lim: [6.5, 6.0] },     // 左の壁
    { p: new THREE.Vector3(W, 0, 0), n: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), lim: [6.5, 6.0] },     // 右の壁
    { p: new THREE.Vector3(0, CEIL, 0), n: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), lim: [7.5, 6.5] }   // 天井
  ];

  var _tmp = new THREE.Vector3();

  function castToWall(origin, dir, out) {
    var bestT = Infinity, bestS = null;
    for (var i = 0; i < SURFACES.length; i++) {
      var s = SURFACES[i];
      var denom = dir.dot(s.n);
      if (denom > -1e-4) continue;                    // 面の表側へ向かっていない
      _tmp.subVectors(s.p, origin);
      var t = _tmp.dot(s.n) / denom;
      if (t <= 0.05 || t >= bestT) continue;
      var px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      var lu = Math.abs((px - s.p.x) * s.u.x + (py - s.p.y) * s.u.y + (pz - s.p.z) * s.u.z);
      var lv = Math.abs((px - s.p.x) * s.v.x + (py - s.p.y) * s.v.y + (pz - s.p.z) * s.v.z);
      if (lu > s.lim[0] || lv > s.lim[1]) continue;
      bestT = t; bestS = s;
    }
    if (!bestS) return null;
    out.point.set(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT);
    out.surface = bestS;
    out.dist = bestT;
    return out;
  }

  /* ---------- 光の斑点の集まり（1つのジオメトリでまとめて描く） ---------- */

  function SpotField(scene, max, texture, renderOrder) {
    this.max = max;
    this.count = 0;
    var pos = new Float32Array(max * 4 * 3);
    var col = new Float32Array(max * 4 * 3);
    var uv = new Float32Array(max * 4 * 2);
    var idx = new Uint16Array(max * 6);
    for (var i = 0; i < max; i++) {
      uv[i * 8] = 0; uv[i * 8 + 1] = 0;
      uv[i * 8 + 2] = 1; uv[i * 8 + 3] = 0;
      uv[i * 8 + 4] = 1; uv[i * 8 + 5] = 1;
      uv[i * 8 + 6] = 0; uv[i * 8 + 7] = 1;
      idx[i * 6] = i * 4; idx[i * 6 + 1] = i * 4 + 1; idx[i * 6 + 2] = i * 4 + 2;
      idx[i * 6 + 3] = i * 4; idx[i * 6 + 4] = i * 4 + 2; idx[i * 6 + 5] = i * 4 + 3;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.pos = pos; this.col = col;

    var mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture } },
      vertexShader: [
        'attribute vec3 aColor;',
        'varying vec3 vColor;',
        'varying vec2 vUv;',
        'void main() {',
        '  vColor = aColor;',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D uMap;',
        'varying vec3 vColor;',
        'varying vec2 vUv;',
        'void main() {',
        '  vec4 t = texture2D(uMap, vUv);',
        '  gl_FragColor = vec4(vColor * t.rgb, 1.0) * t.a;',
        '}'
      ].join('\n'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder || 1;
    scene.add(this.mesh);
  }

  SpotField.prototype.begin = function () { this.count = 0; };

  SpotField.prototype.add = function (point, surface, size, r, g, b, spin) {
    if (this.count >= this.max) return;
    var i = this.count++;
    var c = Math.cos(spin || 0), s = Math.sin(spin || 0);
    var ux = (surface.u.x * c + surface.v.x * s) * size;
    var uy = (surface.u.y * c + surface.v.y * s) * size;
    var uz = (surface.u.z * c + surface.v.z * s) * size;
    var vx = (-surface.u.x * s + surface.v.x * c) * size;
    var vy = (-surface.u.y * s + surface.v.y * c) * size;
    var vz = (-surface.u.z * s + surface.v.z * c) * size;
    var ox = point.x + surface.n.x * 0.012;
    var oy = point.y + surface.n.y * 0.012;
    var oz = point.z + surface.n.z * 0.012;
    var p = this.pos, cc = this.col, b0 = i * 12;
    p[b0] = ox - ux - vx; p[b0 + 1] = oy - uy - vy; p[b0 + 2] = oz - uz - vz;
    p[b0 + 3] = ox + ux - vx; p[b0 + 4] = oy + uy - vy; p[b0 + 5] = oz + uz - vz;
    p[b0 + 6] = ox + ux + vx; p[b0 + 7] = oy + uy + vy; p[b0 + 8] = oz + uz + vz;
    p[b0 + 9] = ox - ux + vx; p[b0 + 10] = oy - uy + vy; p[b0 + 11] = oz - uz + vz;
    for (var k = 0; k < 4; k++) {
      cc[b0 + k * 3] = r; cc[b0 + k * 3 + 1] = g; cc[b0 + k * 3 + 2] = b;
    }
  };

  SpotField.prototype.end = function () {
    this.geo.setDrawRange(0, this.count * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  };

  /* ---------------- Room ---------------- */

  function Room(scene) {
    this.scene = scene;
    this.time = 0;

    /* 光の模様をきれいに見せたいので、部屋は少し落ち着いた色にする */
    this.baseBg = new THREE.Color(0xa98cd0);
    scene.background = this.baseBg.clone();
    scene.fog = new THREE.Fog(0xa98cd0, 13, 26);

    this.hemi = new THREE.HemisphereLight(0xffe4c4, 0x8f6fb8, 0.48);
    scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xffeec8, 0.8);
    this.dir.position.set(3, 4.5, 4);
    scene.add(this.dir);
    this.amb = new THREE.AmbientLight(0x9c85c0, 0.2);
    scene.add(this.amb);

    var lam = function (color) { return new THREE.MeshLambertMaterial({ color: color }); };

    /* 床（木のゆか） */
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 13), lam(0x8f6244));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -1);
    scene.add(floor);

    /* まるいラグ */
    var rug = new THREE.Mesh(new THREE.CircleGeometry(2.5, 40), lam(0xb35c8e));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, 0.1);
    scene.add(rug);
    var rug2 = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.05, 40), lam(0xd884b4));
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(0, 0.02, 0.1);
    scene.add(rug2);

    /* 壁 */
    var back = new THREE.Mesh(new THREE.PlaneGeometry(15, 12), lam(0xb197d8));
    back.position.set(0, 6, BACK);
    scene.add(back);
    var left = new THREE.Mesh(new THREE.PlaneGeometry(13, 12), lam(0xa285cc));
    left.rotation.y = Math.PI / 2;
    left.position.set(-W, 6, -1);
    scene.add(left);
    var right = new THREE.Mesh(new THREE.PlaneGeometry(13, 12), lam(0xa285cc));
    right.rotation.y = -Math.PI / 2;
    right.position.set(W, 6, -1);
    scene.add(right);

    /* 宝石の下のやわらかい影（浮いている感じを出す） */
    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 30),
      new THREE.MeshBasicMaterial({ color: 0x4a2c5a, transparent: true, opacity: 0.22 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.03, 0.05);
    scene.add(shadow);

    /* 台座（宝石をのせる台） */
    var stand = new THREE.Group();
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.86, 0.22, 28), lam(0xb98a63));
    base.position.y = 0.11;
    stand.add(base);
    var col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.72, 24), lam(0xcb9d76));
    col.position.y = 0.58;
    stand.add(col);
    var top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.16, 28), lam(0xdcb18a));
    top.position.y = 1.02;
    stand.add(top);
    var cushion = new THREE.Mesh(new THREE.SphereGeometry(0.44, 20, 14), lam(0xffc9e0));
    cushion.scale.set(1, 0.45, 1);
    cushion.position.y = 1.14;
    stand.add(cushion);
    scene.add(stand);
    this.stand = stand;

    /* 左右のかざり棚と小さな原石（宝石のうしろがすっきりするよう両脇に置く） */
    this.miniGems = [];
    for (var side = -1; side <= 1; side += 2) {
      var shelf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.5), lam(0x9a6f4d));
      shelf.position.set(side * 3.1, 2.35, BACK + 0.28);
      scene.add(shelf);
      for (var i = 0; i < 3; i++) {
        var c = new THREE.Color().setHSL((i * 0.19 + (side > 0 ? 0.5 : 0)) % 1, 0.65, 0.62);
        var m = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.18 + (i % 2) * 0.05, 0),
          new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.9, emissive: c.clone().multiplyScalar(0.3) })
        );
        m.position.set(side * 3.1 - 0.7 + i * 0.7, 2.62, BACK + 0.3);
        scene.add(m);
        this.miniGems.push(m);
      }
    }

    /* ---- 太陽（ドラッグで動かせる） ---- */
    this.sunDir = new THREE.Vector3(0.58, 0.44, 0.55).normalize();
    this.sunDist = 3.1;
    this.sunPivot = new THREE.Vector3(0, 2.24, 0);
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.sun(), transparent: true, depthWrite: false, depthTest: false
    }));
    this.sun.scale.setScalar(0.95);
    this.sun.renderOrder = 8;
    scene.add(this.sun);
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow(), color: 0xffe9a8, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0.55
    }));
    this.sunGlow.scale.setScalar(2.0);
    this.sunGlow.renderOrder = 7;
    scene.add(this.sunGlow);
    this.sunLight = new THREE.PointLight(0xffe9b0, 0.3, 9);
    scene.add(this.sunLight);
    this.updateSun();

    /* ---- 壁にうつる光 ---- */
    this.spots = new SpotField(scene, 220, TEX.caustic(), 1);
    this.rainbows = new SpotField(scene, 26, TEX.rainbow(), 1);
    this.flashes = [];   // 削った瞬間に出る虹 {point, surface, size, life, max, hue}
    this._hit = { point: new THREE.Vector3(), surface: null, dist: 0 };
    this._i = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this.brightness = 1;
  }

  Room.prototype.updateSun = function () {
    var p = this.sunPivot.clone().addScaledVector(this.sunDir, this.sunDist);
    this.sun.position.copy(p);
    this.sunGlow.position.copy(p);
    this.sunLight.position.copy(p);
    this.dir.position.copy(this.sunPivot.clone().addScaledVector(this.sunDir, 8));
    this.dir.target.position.copy(this.sunPivot);
    this.dir.target.updateMatrixWorld();
  };

  /* 太陽はいつでもつかめるように、画面の中におさめる */
  Room.prototype.keepSunOnScreen = function (camera) {
    var p = this.sunPivot.clone().addScaledVector(this.sunDir, this.sunDist);
    var ndc = p.clone().project(camera);
    var cx = Math.max(-0.74, Math.min(0.74, ndc.x));
    var cy = Math.max(-0.30, Math.min(0.58, ndc.y));
    if (cx !== ndc.x || cy !== ndc.y) {
      p = new THREE.Vector3(cx, cy, ndc.z).unproject(camera);
    }
    this.sun.position.copy(p);
    this.sunGlow.position.copy(p);
    this.sunLight.position.copy(p);
  };

  Room.prototype.setSunDir = function (dir) {
    var d = dir.clone().normalize();
    /* 画面から出ていかないように、上のほう・手前よりに制限する */
    if (d.y < 0.12) d.y = 0.12;
    if (d.y > 0.78) d.y = 0.78;
    if (d.z < -0.35) d.z = -0.35;
    d.normalize();
    this.sunDir.copy(d);
    this.updateSun();
  };

  Room.prototype.sunPosition = function () { return this.sun.position; };

  /* 削った瞬間、壁に虹をぱっと映す */
  Room.prototype.flashRainbow = function (origin, dir, hue) {
    var hit = castToWall(origin, dir, this._hit);
    if (!hit) return;
    this.flashes.push({
      point: hit.point.clone(),
      surface: hit.surface,
      size: 0.7 + Math.random() * 0.5,
      life: 2.4, max: 2.4,
      hue: hue
    });
    if (this.flashes.length > 18) this.flashes.shift();
  };

  /* 面ごとに、反射光（白）と透過光（虹色）を壁に飛ばす */
  Room.prototype.updateCaustics = function (facets, gemCenter, dt) {
    var spots = this.spots, rain = this.rainbows;
    spots.begin(); rain.begin();

    var s = this.sunDir;
    var i = this._i.copy(s).negate();      // 光の進む向き
    var col = new THREE.Color();
    var t = this.time;

    /* 宝石の真下に落ちる、やわらかい光だまり */
    var under = { point: new THREE.Vector3(gemCenter.x, 0, gemCenter.z), surface: SURFACES[0] };
    spots.add(under.point, under.surface, 1.05, 0.62, 0.52, 0.40, 0);

    for (var k = 0; k < facets.length; k++) {
      var f = facets[k];
      var lit = f.normal.dot(s);
      if (lit <= 0.02) continue;
      var strength = Math.min(1.25, 0.42 + f.area * 4.0) * lit * 1.45;

      /* 反射：キラッと明るい白い光 */
      var r = this._r.copy(i).addScaledVector(f.normal, -2 * i.dot(f.normal)).normalize();
      if (castToWall(f.center, r, this._hit)) {
        var flick = 0.72 + 0.28 * Math.sin(t * 2.6 + f.id * 1.7);
        var b = strength * flick * this.brightness;
        var size = 0.10 + Math.min(0.55, this._hit.dist * 0.07) + f.area * 0.5;
        col.setHSL((f.hue + t * 0.02) % 1, 0.55, 0.6);
        spots.add(this._hit.point, this._hit.surface, size,
          (0.55 + col.r * 0.7) * b, (0.55 + col.g * 0.7) * b, (0.55 + col.b * 0.7) * b,
          f.id * 0.7);
      }

      /* 透過：宝石を通りぬけた光は虹色に散る */
      var refr = refract(i, f.normal, 1 / 1.55);
      if (refr) {
        refr.y -= 0.12;    // 少し下へ（床のほうへ模様が落ちる）
        refr.normalize();
        if (castToWall(f.center, refr, this._hit)) {
          var bb = strength * 1.15 * this.brightness;
          col.setHSL((f.hue + t * 0.03) % 1, 0.85, 0.55);
          spots.add(this._hit.point, this._hit.surface,
            0.14 + Math.min(0.75, this._hit.dist * 0.1) + f.area * 0.7,
            col.r * bb, col.g * bb, col.b * bb, -f.id * 0.5 + t * 0.15);
        }
      }
    }
    spots.end();

    /* 削った瞬間の虹（時間で消える） */
    for (k = this.flashes.length - 1; k >= 0; k--) {
      var fl = this.flashes[k];
      fl.life -= dt;
      if (fl.life <= 0) { this.flashes.splice(k, 1); continue; }
      var lt = fl.life / fl.max;
      var fade = lt > 0.75 ? (1 - lt) / 0.25 : lt / 0.75;
      var sz = fl.size * (1.4 + (1 - lt) * 1.1);
      col.setHSL(fl.hue, 0.7, 0.6);
      rain.add(fl.point, fl.surface, sz, fade * 1.1, fade * 1.1, fade * 1.1, 0);
    }
    rain.end();
  };

  function refract(i, n, eta) {
    var dot = i.dot(n);
    var k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    return new THREE.Vector3(
      eta * i.x - (eta * dot + Math.sqrt(k)) * n.x,
      eta * i.y - (eta * dot + Math.sqrt(k)) * n.y,
      eta * i.z - (eta * dot + Math.sqrt(k)) * n.z
    ).normalize();
  }

  Room.prototype.update = function (dt, time) {
    this.time = time;
    /* 太陽がふわふわ息をする */
    this.sun.scale.setScalar(0.92 + Math.sin(time * 1.6) * 0.05);
    this.sunGlow.scale.setScalar(1.95 + Math.sin(time * 1.6) * 0.18);
    for (var i = 0; i < this.miniGems.length; i++) {
      this.miniGems[i].rotation.y += dt * (0.4 + i * 0.12);
      this.miniGems[i].position.y = 3.16 + Math.sin(time * 1.2 + i) * 0.03;
    }
  };

  /* ごほうび段階で部屋を明るく・色を華やかに */
  Room.prototype.setCelebration = function (level) {
    this.brightness = 1 + level * 0.6;
    this.hemi.intensity = 0.48 + level * 0.3;
    var bg = this.baseBg.clone().lerp(new THREE.Color(0xf0aede), level * 0.6);
    this.scene.background = bg;
    if (this.scene.fog) this.scene.fog.color = bg;
  };

  Room.castToWall = castToWall;
  Room.SURFACES = SURFACES;
  window.Room = Room;
})();
