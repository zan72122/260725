/* ===== じゃんがりあん ものがたり : エフェクト (パーティクル・スプライト) ===== */
window.JG = window.JG || {};

JG.FX = (function () {
  var U = JG.U;

  // ---------- canvas テクスチャ ----------
  function makeTex(size, draw) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    draw(g, size);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function circleTex() {
    return makeTex(64, function (g, s) {
      var grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    });
  }

  function starTex() {
    return makeTex(64, function (g, s) {
      g.translate(s / 2, s / 2);
      g.fillStyle = '#ffffff';
      g.beginPath();
      for (var i = 0; i < 10; i++) {
        var r = (i % 2 === 0) ? s * 0.46 : s * 0.19;
        var a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    });
  }

  function heartTex() {
    return makeTex(64, function (g, s) {
      g.translate(s / 2, s / 2);
      g.scale(s / 32, s / 32);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(0, 10);
      g.bezierCurveTo(-16, -2, -10, -14, 0, -6);
      g.bezierCurveTo(10, -14, 16, -2, 0, 10);
      g.closePath();
      g.fill();
    });
  }

  function squareTex() {
    return makeTex(32, function (g, s) {
      g.fillStyle = '#ffffff';
      g.fillRect(s * 0.18, s * 0.18, s * 0.64, s * 0.64);
    });
  }

  function petalTex() {
    return makeTex(64, function (g, s) {
      g.translate(s / 2, s / 2);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(0, 0, s * 0.2, s * 0.4, 0.5, 0, Math.PI * 2);
      g.fill();
    });
  }

  // ---------- パーティクルシステム ----------
  function Psys(scene, opts) {
    this.count = opts.count || 100;
    this.gravity = opts.gravity !== undefined ? opts.gravity : -9;
    this.drag = opts.drag !== undefined ? opts.drag : 0.4;
    this.additive = !!opts.additive;
    this.fade = opts.fade !== undefined ? opts.fade : this.additive;
    this.parts = [];
    var pos = new Float32Array(this.count * 3);
    var col = new Float32Array(this.count * 3);
    for (var i = 0; i < this.count; i++) {
      pos[i * 3 + 1] = -999;
      this.parts.push({ live: false, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 1, g: 1, b: 1 });
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.PointsMaterial({
      size: opts.size || 0.5,
      map: opts.tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      blending: this.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.cursor = 0;
    scene.add(this.points);
  }

  Psys.prototype.spawn = function (x, y, z, o) {
    o = o || {};
    var n = o.n || 10;
    var colors = o.colors || [[1, 1, 1]];
    var speed = o.speed !== undefined ? o.speed : 3;
    var up = o.up !== undefined ? o.up : 2.5;
    var life = o.life !== undefined ? o.life : 0.9;
    var spread = o.spread !== undefined ? o.spread : 0.2;
    var pos = this.geo.attributes.position.array;
    var col = this.geo.attributes.color.array;
    for (var i = 0; i < n; i++) {
      var idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      var p = this.parts[idx];
      p.live = true;
      p.life = 0;
      p.max = life * U.rand(0.7, 1.25);
      var a = Math.random() * Math.PI * 2;
      var r = Math.random();
      p.vx = Math.cos(a) * speed * r;
      p.vz = Math.sin(a) * speed * r;
      p.vy = up * U.rand(0.5, 1.3);
      var c = colors[Math.floor(Math.random() * colors.length)];
      p.r = c[0]; p.g = c[1]; p.b = c[2];
      pos[idx * 3] = x + U.rand(-spread, spread);
      pos[idx * 3 + 1] = y + U.rand(-spread, spread);
      pos[idx * 3 + 2] = z + U.rand(-spread, spread);
      col[idx * 3] = c[0]; col[idx * 3 + 1] = c[1]; col[idx * 3 + 2] = c[2];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  };

  Psys.prototype.update = function (dt) {
    var pos = this.geo.attributes.position.array;
    var col = this.geo.attributes.color.array;
    var any = false;
    for (var i = 0; i < this.count; i++) {
      var p = this.parts[i];
      if (!p.live) continue;
      any = true;
      p.life += dt;
      if (p.life >= p.max) {
        p.live = false;
        pos[i * 3 + 1] = -999;
        continue;
      }
      var dr = 1 - this.drag * dt;
      p.vx *= dr; p.vz *= dr;
      p.vy += this.gravity * dt;
      pos[i * 3] += p.vx * dt;
      pos[i * 3 + 1] += p.vy * dt;
      pos[i * 3 + 2] += p.vz * dt;
      if (pos[i * 3 + 1] < 0.04 && this.gravity < 0) {
        pos[i * 3 + 1] = 0.04;
        p.vy *= -0.35;
        p.vx *= 0.6; p.vz *= 0.6;
      }
      if (this.fade) {
        var k = 1 - p.life / p.max;
        col[i * 3] = p.r * k; col[i * 3 + 1] = p.g * k; col[i * 3 + 2] = p.b * k;
      }
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      if (this.fade) this.geo.attributes.color.needsUpdate = true;
    }
  };

  // ---------- 文字/記号スプライト ----------
  function textSprite(text, opts) {
    opts = opts || {};
    var w = opts.w || 128;
    var h = 128;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    g.font = 'bold ' + (opts.px || 90) + 'px "Hiragino Maru Gothic ProN", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (opts.bubble) {
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.ellipse(w / 2, h / 2, w * 0.46, h * 0.44, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = opts.bubbleStroke || '#7ec8ff';
      g.lineWidth = 7;
      g.stroke();
    }
    g.fillStyle = opts.color || '#ff8330';
    g.fillText(text, w / 2, h / 2 + (opts.dy || 4));
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    var sp = new THREE.Sprite(mat);
    var s = opts.scale || 1.6;
    sp.scale.set(s * (w / h), s, 1);
    return sp;
  }

  // おうちアイコン (canvas 手描き, 絵文字に頼らない)
  function houseSprite() {
    var size = 128;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffb85c';
    g.lineWidth = 7;
    g.stroke();
    // 屋根
    g.fillStyle = '#ff7b54';
    g.beginPath();
    g.moveTo(size * 0.24, size * 0.5);
    g.lineTo(size * 0.5, size * 0.24);
    g.lineTo(size * 0.76, size * 0.5);
    g.closePath();
    g.fill();
    // かべ
    g.fillStyle = '#ffd9a0';
    g.fillRect(size * 0.32, size * 0.5, size * 0.36, size * 0.28);
    // ドア
    g.fillStyle = '#a0653a';
    g.fillRect(size * 0.44, size * 0.58, size * 0.12, size * 0.2);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(2.2, 2.2, 1);
    return sp;
  }

  // ---------- ちょうちょ ----------
  function Butterfly(scene, color) {
    this.group = new THREE.Group();
    var wingGeo = new THREE.CircleGeometry(0.34, 12);
    var mat = new THREE.MeshLambertMaterial({
      color: color, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25
    });
    this.wingL = new THREE.Mesh(wingGeo, mat);
    this.wingR = new THREE.Mesh(wingGeo, mat);
    this.wingL.position.x = -0.3;
    this.wingR.position.x = 0.3;
    this.wingL.rotation.x = -Math.PI / 2;
    this.wingR.rotation.x = -Math.PI / 2;
    var body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.05, 0.3, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0x503a28 })
    );
    body.rotation.x = Math.PI / 2;
    this.group.add(this.wingL, this.wingR, body);
    this.group.position.set(JG.U.rand(-16, 16), JG.U.rand(1.6, 3.4), JG.U.rand(-16, 16));
    this.t = Math.random() * 100;
    this.speed = JG.U.rand(0.9, 1.6);
    this.retarget();
    // レイキャスト用に当たり球
    this.hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 6, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hit.userData.type = 'butterfly';
    this.hit.userData.ref = this;
    this.group.add(this.hit);
    scene.add(this.group);
  }

  Butterfly.prototype.retarget = function () {
    var a = Math.random() * Math.PI * 2;
    var r = JG.U.rand(4, 22);
    this.tx = Math.cos(a) * r;
    this.tz = Math.sin(a) * r;
    this.ty = JG.U.rand(1.2, 3.6);
  };

  Butterfly.prototype.update = function (dt) {
    this.t += dt;
    var flap = Math.sin(this.t * 18) * 0.95;
    this.wingL.rotation.y = flap * 0.7 - 0.2;
    this.wingR.rotation.y = -flap * 0.7 + 0.2;
    var p = this.group.position;
    var dx = this.tx - p.x, dy = this.ty - p.y, dz = this.tz - p.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1.2) { this.retarget(); return; }
    p.x += (dx / d) * this.speed * dt;
    p.y += (dy / d) * this.speed * dt + Math.sin(this.t * 3.1) * 0.35 * dt;
    p.z += (dz / d) * this.speed * dt;
    this.group.rotation.y = Math.atan2(dx, dz);
  };

  return {
    circleTex: circleTex,
    starTex: starTex,
    heartTex: heartTex,
    squareTex: squareTex,
    petalTex: petalTex,
    Psys: Psys,
    textSprite: textSprite,
    houseSprite: houseSprite,
    Butterfly: Butterfly
  };
})();
