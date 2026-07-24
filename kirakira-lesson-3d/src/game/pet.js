/* ============================================================
 * pet.js — どうぶつ（いぬ・ねこ・うさぎ・くま・ことり・ハムスター）
 *   おともだち ペット にも、どうぶつびょういん の かんじゃさん にも つかう。
 * ============================================================ */

var ANIMAL_TYPES = {
  dog: {
    name: 'こいぬ', icon: '🐶', cry: 'dog',
    body: 0xe8bf8e, belly: 0xfff0d8, ear: 'flop', tail: 'wag', nose: 0x4a3a34,
    scale: 1.0
  },
  cat: {
    name: 'こねこ', icon: '🐱', cry: 'cat',
    body: 0xc9c2d8, belly: 0xfbf8ff, ear: 'point', tail: 'long', nose: 0xff9dbf,
    scale: 0.95
  },
  rabbit: {
    name: 'うさぎ', icon: '🐰', cry: 'rabbit',
    body: 0xfff0f5, belly: 0xffffff, ear: 'long', tail: 'puff', nose: 0xff9dbf,
    scale: 0.9
  },
  bear: {
    name: 'こぐま', icon: '🐻', cry: 'purr',
    body: 0xc9a074, belly: 0xf0dcc0, ear: 'round', tail: 'puff', nose: 0x4a3a34,
    scale: 1.1
  },
  bird: {
    name: 'ことり', icon: '🐤', cry: 'bird',
    body: 0xffe27a, belly: 0xfff6c8, ear: 'none', tail: 'fan', nose: 0xffa96b,
    scale: 0.72, wings: true
  },
  hamster: {
    name: 'ハムスター', icon: '🐹', cry: 'rabbit',
    body: 0xf0c98a, belly: 0xfff3dc, ear: 'round', tail: 'puff', nose: 0xff9dbf,
    scale: 0.68
  },
  panda: {
    name: 'パンダ', icon: '🐼', cry: 'purr',
    body: 0xfdfdfd, belly: 0xffffff, ear: 'round', tail: 'puff', nose: 0x3a3242,
    scale: 1.05, patches: true
  },
  unicorn: {
    name: 'ユニコーン', icon: '🦄', cry: 'bird',
    body: 0xffe6f2, belly: 0xffffff, ear: 'point', tail: 'rainbow', nose: 0xff9dbf,
    scale: 1.15, horn: true
  }
};

function Animal(type, opts) {
  'use strict';
  opts = opts || {};
  var D = ANIMAL_TYPES[type] || ANIMAL_TYPES.dog;
  var self = this;

  this.type = type;
  this.def = D;
  this.group = new THREE.Group();
  this.time = U.rand(0, 10);
  this.mood = 'happy';
  this.wagSpeed = 1;
  this.dirty = 0;
  this.blinkT = U.rand(1, 4);

  var bodyColor = opts.color != null ? opts.color : D.body;
  var s = D.scale * (opts.scale || 1);

  var root = new THREE.Group();
  root.scale.setScalar(s);
  this.group.add(root);
  this.root = root;

  var shadow = B.blobShadow(0.28 * s, 0.34);
  this.group.add(shadow);

  // からだ
  var bodyG = new THREE.Group();
  bodyG.position.y = 0.22;
  root.add(bodyG);
  this.bodyG = bodyG;

  var torso = B.sphere(0.175, bodyColor, { seg: 18, unique: true });
  torso.scale.set(1.02, 0.9, 1.2);
  bodyG.add(torso);
  this.torso = torso;

  var belly = B.sphere(0.14, D.belly, { seg: 14, unique: true });
  belly.scale.set(0.9, 0.8, 1.05);
  belly.position.set(0, -0.05, 0.05);
  bodyG.add(belly);

  // あし
  this.legs = [];
  for (var i = 0; i < 4; i++) {
    var lx = (i % 2 === 0 ? -1 : 1) * 0.11;
    var lz = (i < 2 ? 1 : -1) * 0.12;
    var leg = B.cyl(0.045, 0.05, 0.16, bodyColor, { unique: true, seg: 8 });
    leg.position.set(lx, 0.08, lz);
    root.add(leg);
    var paw = B.sphere(0.052, D.belly, { seg: 8, unique: true });
    paw.position.set(lx, 0.02, lz + 0.01);
    paw.scale.set(1, 0.75, 1.15);
    root.add(paw);
    this.legs.push({ leg: leg, paw: paw, x: lx, z: lz });
  }

  // あたま
  var head = new THREE.Group();
  head.position.set(0, 0.42, 0.17);
  root.add(head);
  this.head = head;

  var skull = B.sphere(0.195, bodyColor, { seg: 20, unique: true });
  skull.scale.set(1.02, 1, 0.98);
  head.add(skull);

  var muzzle = B.sphere(0.095, D.belly, { seg: 12, unique: true });
  muzzle.position.set(0, -0.05, 0.15);
  muzzle.scale.set(1.15, 0.8, 0.9);
  head.add(muzzle);

  var nose = B.sphere(0.034, D.nose, { seg: 10, unique: true });
  nose.position.set(0, -0.018, 0.232);
  nose.scale.set(1.2, 0.85, 0.8);
  head.add(nose);

  // め
  this.eyes = [];
  for (var e = -1; e <= 1; e += 2) {
    var eg = new THREE.Group();
    eg.position.set(e * 0.082, 0.045, 0.168);
    head.add(eg);
    var w = B.sphere(0.04, 0xffffff, { seg: 12, unique: true });
    w.scale.set(1, 1.1, 0.55);
    eg.add(w);
    var ir = B.sphere(0.029, 0x342c3d, { seg: 10, unique: true });
    ir.position.z = 0.018;
    ir.scale.set(1, 1.05, 0.55);
    eg.add(ir);
    var hi = B.sphere(0.012, 0xffffff, { seg: 8, unique: true });
    hi.position.set(e * 0.01, 0.014, 0.033);
    eg.add(hi);
    this.eyes.push(eg);
  }

  // ほっぺ
  for (var c = -1; c <= 1; c += 2) {
    var bl = B.sphere(0.032, 0xff9fb8, { seg: 10, unique: true });
    bl.material.transparent = true; bl.material.opacity = 0.55;
    bl.scale.set(1.1, 0.6, 0.4);
    bl.position.set(c * 0.13, -0.04, 0.14);
    head.add(bl);
  }

  // くち
  var smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 5, 10, Math.PI), B.matUnique(0x8a5560));
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.062, 0.225);
  head.add(smile);
  this.smile = smile;

  // みみ
  this.ears = [];
  if (D.ear === 'flop') {
    for (var f = -1; f <= 1; f += 2) {
      var ear = B.sphere(0.06, U.shade(bodyColor, -0.16), { seg: 10, unique: true });
      ear.scale.set(0.6, 1.5, 0.5);
      ear.position.set(f * 0.165, 0.04, -0.01);
      head.add(ear);
      this.ears.push(ear);
    }
  } else if (D.ear === 'point') {
    for (var p = -1; p <= 1; p += 2) {
      var pe = B.cone(0.055, 0.11, bodyColor, { unique: true, seg: 4 });
      pe.position.set(p * 0.11, 0.185, -0.01);
      pe.rotation.set(0, Math.PI / 4, p * 0.2);
      head.add(pe);
      var pin = B.cone(0.03, 0.07, 0xffc0d6, { unique: true, seg: 4 });
      pin.position.set(p * 0.11, 0.19, 0.015);
      pin.rotation.set(0, Math.PI / 4, p * 0.2);
      head.add(pin);
      this.ears.push(pe);
    }
  } else if (D.ear === 'long') {
    for (var l = -1; l <= 1; l += 2) {
      var le = B.capsule(0.035, 0.19, bodyColor, { unique: true });
      le.position.set(l * 0.075, 0.27, -0.01);
      le.rotation.z = l * 0.18;
      head.add(le);
      var lin = B.capsule(0.019, 0.14, 0xffc0d6, { unique: true });
      lin.position.set(l * 0.077, 0.275, 0.022);
      lin.rotation.z = l * 0.18;
      head.add(lin);
      this.ears.push(le);
    }
  } else if (D.ear === 'round') {
    for (var r = -1; r <= 1; r += 2) {
      var re = B.sphere(0.055, D.patches ? 0x3a3242 : U.shade(bodyColor, -0.1), { seg: 10, unique: true });
      re.scale.z = 0.6;
      re.position.set(r * 0.145, 0.155, -0.02);
      head.add(re);
      this.ears.push(re);
    }
  }

  // パンダ の めのまわり
  if (D.patches) {
    for (var q = -1; q <= 1; q += 2) {
      var pt = B.sphere(0.055, 0x3a3242, { seg: 10, unique: true });
      pt.scale.set(1, 1.25, 0.45);
      pt.position.set(q * 0.082, 0.04, 0.152);
      pt.rotation.z = q * 0.3;
      head.add(pt);
    }
  }

  // ツノ（ユニコーン）
  if (D.horn) {
    var horn = B.cone(0.035, 0.19, 0xffd44d, { unique: true, seg: 8, shiny: true });
    horn.position.set(0, 0.22, 0.04);
    head.add(horn);
    var mane = new THREE.Group();
    var mcols = [0xff9dbf, 0xffd95c, 0x8fd4ff, 0xc09dff];
    for (var m = 0; m < 5; m++) {
      var mb = B.sphere(0.05, mcols[m % 4], { seg: 10, unique: true });
      mb.position.set(0, 0.13 - m * 0.05, -0.12 - m * 0.03);
      mane.add(mb);
    }
    head.add(mane);
  }

  // つばさ（ことり）
  if (D.wings) {
    this.wingMeshes = [];
    for (var wg = -1; wg <= 1; wg += 2) {
      var wing = B.sphere(0.1, U.shade(bodyColor, 0.2), { seg: 10, unique: true });
      wing.scale.set(0.35, 0.8, 1.1);
      wing.position.set(wg * 0.19, 0.22, 0);
      root.add(wing);
      this.wingMeshes.push(wing);
    }
  }

  // しっぽ
  var tail = new THREE.Group();
  tail.position.set(0, 0.28, -0.22);
  root.add(tail);
  this.tail = tail;
  if (D.tail === 'wag') {
    var tw = B.capsule(0.035, 0.13, bodyColor, { unique: true });
    tw.position.set(0, 0.07, -0.03);
    tw.rotation.x = -0.5;
    tail.add(tw);
  } else if (D.tail === 'long') {
    for (var tl = 0; tl < 5; tl++) {
      var seg = B.sphere(0.04 - tl * 0.004, bodyColor, { seg: 8, unique: true });
      seg.position.set(0, tl * 0.06, -tl * 0.03);
      tail.add(seg);
    }
  } else if (D.tail === 'puff') {
    var pf = B.sphere(0.07, D.belly, { seg: 12, unique: true });
    pf.position.set(0, 0, -0.02);
    tail.add(pf);
  } else if (D.tail === 'fan') {
    for (var fi = 0; fi < 4; fi++) {
      var fe = B.box(0.03, 0.13, 0.02, U.shade(bodyColor, -0.14), { unique: true });
      fe.position.set((fi - 1.5) * 0.03, 0.02, -0.03);
      fe.rotation.z = (fi - 1.5) * 0.16;
      fe.rotation.x = -0.7;
      tail.add(fe);
    }
  } else if (D.tail === 'rainbow') {
    var rc = [0xff9dbf, 0xffd95c, 0x8fd4ff, 0xc09dff, 0x9ee493];
    for (var ri = 0; ri < 5; ri++) {
      var rs = B.sphere(0.05, rc[ri], { seg: 8, unique: true });
      rs.position.set(0, -ri * 0.05, -0.02 - ri * 0.02);
      tail.add(rs);
    }
  }

  // よごれ（どうぶつびょういん・おふろ よう）
  this.dirtSpots = [];
  this.setDirty = function (n) {
    self.dirty = n;
    for (var i = 0; i < self.dirtSpots.length; i++) self.dirtSpots[i].visible = i < n;
  };
  for (var ds = 0; ds < 6; ds++) {
    var spot = B.sphere(0.05, 0x9c7a52, { seg: 8, unique: true });
    spot.scale.set(1, 0.7, 1);
    var aa = U.rand(0, U.TAU);
    spot.position.set(Math.cos(aa) * 0.17, 0.2 + U.rand(-0.06, 0.12), Math.sin(aa) * 0.2);
    spot.visible = false;
    root.add(spot);
    this.dirtSpots.push(spot);
  }

  /* ---------- うごき ---------- */

  this.hopT = 0;
  this.walkSpeed = 0;
  this.lookTarget = null;
  this.act = null;

  this.play = function (name, dur) {
    self.act = { name: name, t: 0, dur: dur || 1.0 };
    if (name === 'happy') SND.play(D.cry);
  };

  this.cry = function () { SND.play(D.cry); };

  this.setMood = function (m) {
    self.mood = m;
    if (m === 'happy') { self.wagSpeed = 3.5; self.smile.scale.setScalar(1.15); }
    else if (m === 'sad') { self.wagSpeed = 0.3; self.smile.rotation.z = 0; self.smile.scale.setScalar(0.9); }
    else { self.wagSpeed = 1.4; self.smile.rotation.z = Math.PI; self.smile.scale.setScalar(1); }
    if (m !== 'sad') self.smile.rotation.z = Math.PI;
  };

  var _v = new THREE.Vector3();

  this.update = function (dt, t) {
    self.time += dt;
    var tt = self.time;

    // まばたき
    self.blinkT -= dt;
    var bk = 1;
    if (self.blinkT < 0) {
      var b = -self.blinkT;
      if (b < 0.1) bk = 1 - Math.sin(b / 0.1 * Math.PI) * 0.9;
      else self.blinkT = U.rand(2, 5);
    }
    for (var i = 0; i < self.eyes.length; i++) self.eyes[i].scale.y = bk;

    // からだ の うわした
    var bob = Math.sin(tt * 2.6) * 0.012;
    var hop = 0;

    if (self.act) {
      self.act.t += dt;
      var k = self.act.t / self.act.dur;
      if (self.act.name === 'happy' || self.act.name === 'hop') {
        hop = Math.abs(Math.sin(k * Math.PI * 3)) * 0.16;
      } else if (self.act.name === 'shake') {
        root.rotation.z = Math.sin(k * Math.PI * 14) * 0.16;
      } else if (self.act.name === 'spin') {
        root.rotation.y = k * Math.PI * 2;
      }
      if (self.act.t >= self.act.dur) {
        self.act = null;
        root.rotation.z = 0;
        root.rotation.y = 0;
      }
    }

    if (self.walkSpeed > 0.01) {
      var wp = tt * self.walkSpeed * 9;
      for (var L = 0; L < self.legs.length; L++) {
        var ph = (L % 2 === 0 ? 0 : Math.PI) + (L < 2 ? 0 : Math.PI);
        var off = Math.sin(wp + ph) * 0.05;
        self.legs[L].leg.position.z = self.legs[L].z + off;
        self.legs[L].paw.position.z = self.legs[L].z + off + 0.01;
      }
      bob += Math.abs(Math.sin(wp)) * 0.02;
    }

    bodyG.position.y = 0.22 + bob + hop;
    head.position.y = 0.42 + bob * 1.2 + hop;
    for (var lg = 0; lg < self.legs.length; lg++) {
      self.legs[lg].leg.position.y = 0.08 + hop * 0.7;
      self.legs[lg].paw.position.y = 0.02 + hop * 0.6;
    }

    // しっぽ ふりふり
    tail.rotation.y = Math.sin(tt * 6 * self.wagSpeed) * 0.5 * Math.min(1.2, self.wagSpeed);
    tail.position.y = 0.28 + bob + hop;

    // みみ ぴょこ
    for (var er = 0; er < self.ears.length; er++) {
      self.ears[er].rotation.x = Math.sin(tt * 2.2 + er) * 0.09;
    }

    // つばさ
    if (self.wingMeshes) {
      for (var w = 0; w < self.wingMeshes.length; w++) {
        self.wingMeshes[w].rotation.z = (w === 0 ? 1 : -1) * (0.2 + Math.abs(Math.sin(tt * 5)) * 0.5);
      }
    }

    // みる
    if (self.lookTarget) {
      self.group.updateMatrixWorld();
      _v.copy(self.lookTarget);
      head.parent.worldToLocal(_v);
      var yaw = Math.atan2(_v.x - head.position.x, _v.z - head.position.z);
      head.rotation.y = U.damp(head.rotation.y, U.clamp(yaw, -0.9, 0.9), 6, dt);
    } else {
      head.rotation.y = U.damp(head.rotation.y, Math.sin(tt * 0.6) * 0.18, 4, dt);
    }
    head.rotation.z = Math.sin(tt * 1.1) * 0.05;
  };
}

/* ============================================================
 * Pet — ひまり に ついてくる おともだち
 * ============================================================ */
function Pet(type) {
  'use strict';
  Animal.call(this, type || 'dog');
  var self = this;
  this.follow = null;
  this.offset = new THREE.Vector3(-0.75, 0, -0.35);
  var vel = new THREE.Vector3();
  var baseUpdate = this.update;

  this.update = function (dt, t) {
    if (self.follow) {
      // follow は THREE.Vector3（ひまりちゃん の いち）
      var target = self.follow.clone().add(self.offset);
      var d = target.clone().sub(self.group.position);
      d.y = 0;
      var dist = d.length();
      if (dist > 0.25) {
        d.normalize();
        var sp = Math.min(2.6, dist * 2.4);
        vel.lerp(d.multiplyScalar(sp), 0.14);
        self.walkSpeed = Math.min(1.2, vel.length() / 2);
        var ang = Math.atan2(vel.x, vel.z);
        self.group.rotation.y = U.damp(self.group.rotation.y, ang, 8, dt);
      } else {
        vel.multiplyScalar(0.86);
        self.walkSpeed = U.damp(self.walkSpeed, 0, 6, dt);
      }
      self.group.position.x += vel.x * dt;
      self.group.position.z += vel.z * dt;
      self.lookTarget = self.follow.clone().setY(0.5);
    }
    baseUpdate(dt, t);
  };
}
