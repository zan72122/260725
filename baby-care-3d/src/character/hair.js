/* ============================================================================
 * hair.js — fine baby hair
 * ----------------------------------------------------------------------------
 * Newborn hair is barely there: a soft haze over the crown, thin enough that
 * scalp shows through, with one stubborn cowlick. So:
 *
 *   • A scalp cap laid out radially from the hair whorl, drawn with the same
 *     alpha-tested strand texture as the cards. Mapping the cap's v-axis to
 *     "distance from the whorl" makes the hairline dissolve into strands for
 *     free instead of ending on a hard edge.
 *   • ~50 curved cards grown along a flow field that spirals out of the whorl,
 *     each with its own tip spring so hair lags behind head motion and reacts
 *     to wind, towels and the hairdryer.
 *   • A deliberately asymmetric cowlick that never quite lies down.
 * ========================================================================== */

import * as THREE from 'three';
import * as MAT from '../engine/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Skull ellipsoid the hair grows on (matches anatomy's cranium, inflated). */
const SKULL = { c: V(0, 0.5430, -0.0035), r: V(0.0785, 0.0797, 0.0775) };
/** Hair whorl: off-centre on purpose. Perfect symmetry reads as a wig. */
const WHORL = V(0.0180, 0.6105, -0.0260);

function onSkull(dir, inflate = 0) {
  const d = dir.clone().normalize();
  return V(
    SKULL.c.x + d.x * (SKULL.r.x + inflate),
    SKULL.c.y + d.y * (SKULL.r.y + inflate),
    SKULL.c.z + d.z * (SKULL.r.z + inflate)
  );
}
function skullNormal(p) {
  return V(
    (p.x - SKULL.c.x) / (SKULL.r.x * SKULL.r.x),
    (p.y - SKULL.c.y) / (SKULL.r.y * SKULL.r.y),
    (p.z - SKULL.c.z) / (SKULL.r.z * SKULL.r.z)
  ).normalize();
}

/** How much hair grows at a given skull point: none on the face, thin at the
 *  temples, thickest over the crown. */
function density(p) {
  const front = (p.z - SKULL.c.z) / SKULL.r.z;
  const up = (p.y - SKULL.c.y) / SKULL.r.y;
  if (up < -0.62) return 0;                       // below the hairline at the nape
  let d = 1;
  d *= THREE.MathUtils.smoothstep(0.62, 0.18, front - up * 0.55);  // no forehead hair
  d *= THREE.MathUtils.smoothstep(-0.55, -0.10, up + Math.abs(front) * 0.25);
  return THREE.MathUtils.clamp(d, 0, 1);
}

function hash(i, s) {
  let h = Math.imul(i ^ (s * 2654435761), 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Hair {
  constructor({ tier = 2, color = 0x8a6242 } = {}) {
    this.tier = tier;
    this.color = color;
    this.group = new THREE.Group();
    this.group.name = 'hair';
    this.cards = [];
    this.wind = V(0, 0, 0);
    this.windStrength = 0;
    this.wet = 0;
    this._t = 0;
    this._prevHeadPos = null;
    this._headAcc = V(0, 0, 0);
    this._headVel = V(0, 0, 0);
  }

  build() {
    // one strand texture set shared by cards and scalp: the scalp differs only
    // in alpha cut-off and tiling, which costs nothing
    this.mat = MAT.makeHairCards({ color: this.color, strands: 9, seed: 5 });
    this.scalpMat = MAT.makeHairCards({ color: this.color, strands: 9, seed: 5 });
    this.scalpMat.alphaTest = 0.30;

    this._buildScalp();
    this._buildCards();
    return this;
  }

  /* --------------------------------------------------------------- scalp -- */

  _buildScalp() {
    const rings = this.tier >= 2 ? 14 : 9;
    const segs = this.tier >= 2 ? 34 : 22;
    const pos = [], nor = [], uv = [], idx = [];
    const wDir = WHORL.clone().sub(SKULL.c).normalize();
    // an orthonormal frame around the whorl axis, so v = angular distance from it
    const t1 = Math.abs(wDir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    const e1 = new THREE.Vector3().crossVectors(wDir, t1).normalize();
    const e2 = new THREE.Vector3().crossVectors(wDir, e1).normalize();

    for (let j = 0; j <= rings; j++) {
      const a = (j / rings) * 1.62;                  // angular radius from whorl
      for (let i = 0; i <= segs; i++) {
        const ph = (i / segs) * Math.PI * 2;
        const dir = wDir.clone().multiplyScalar(Math.cos(a))
          .addScaledVector(e1, Math.sin(a) * Math.cos(ph))
          .addScaledVector(e2, Math.sin(a) * Math.sin(ph));
        const p = onSkull(dir, 0.0045);
        const n = skullNormal(p);
        pos.push(p.x, p.y, p.z);
        nor.push(n.x, n.y, n.z);
        // v runs outward from the whorl, so the strand texture's taper lands
        // exactly on the hairline
        const dens = density(p);
        uv.push((i / segs) * 6, 1 - dens * 0.98);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segs; i++) {
        const a = j * (segs + 1) + i, b = a + segs + 1;
        if (j > 0) idx.push(a, b, a + 1);
        idx.push(a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, this.scalpMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.scalp = mesh;
  }

  /* --------------------------------------------------------------- cards -- */

  /** Flow field: hair spirals out of the whorl, then gravity takes over. */
  _flow(p) {
    const n = skullNormal(p);
    const away = p.clone().sub(WHORL);
    away.addScaledVector(n, -away.dot(n));           // tangential component
    if (away.lengthSq() < 1e-8) away.set(0, 0, -1);
    away.normalize();
    // a gentle swirl makes the parting look grown rather than combed
    const swirl = new THREE.Vector3().crossVectors(n, away).multiplyScalar(0.22);
    return away.add(swirl).normalize();
  }

  _buildCards() {
    const count = this.tier >= 2 ? 54 : this.tier === 1 ? 38 : 24;
    const segs = this.tier >= 2 ? 8 : 6;
    const pos = [], nor = [], uv = [], idx = [];
    let vo = 0;

    for (let i = 0; i < count; i++) {
      // stratified sampling over the scalp, biased toward the crown
      const u1 = hash(i, 1), u2 = hash(i, 2), u3 = hash(i, 3);
      const a = 0.18 + Math.sqrt(u1) * 1.44;
      const ph = (i * 2.399963) + u2 * 0.9;          // golden-angle spread
      const wDir = WHORL.clone().sub(SKULL.c).normalize();
      const t1 = Math.abs(wDir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
      const e1 = new THREE.Vector3().crossVectors(wDir, t1).normalize();
      const e2 = new THREE.Vector3().crossVectors(wDir, e1).normalize();
      const dir = wDir.clone().multiplyScalar(Math.cos(a))
        .addScaledVector(e1, Math.sin(a) * Math.cos(ph))
        .addScaledVector(e2, Math.sin(a) * Math.sin(ph));
      const root = onSkull(dir, 0.0035);
      const dens = density(root);
      if (dens < 0.22) continue;

      const len = (0.020 + u3 * 0.030) * (0.55 + dens * 0.55);
      const width = 0.0085 + hash(i, 4) * 0.0075;
      const card = {
        root, segs, len, width,
        stiff: 0.55 + hash(i, 5) * 0.35,
        phase: hash(i, 6) * 6.28,
        rest: [], normal: [], side: [], halfW: [],
        off: V(0, 0, 0), vel: V(0, 0, 0),
        vo, count: (segs + 1) * 2
      };

      // grow the rest shape: hugs the skull, then peels off and droops
      let p = root.clone();
      let d = this._flow(root);
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const n = skullNormal(p);
        // leave the surface progressively; gravity + a slight outward flare
        const grow = d.clone()
          .addScaledVector(n, 0.16 + t * 0.34)
          .addScaledVector(V(0, -1, 0), t * t * 1.05)
          .normalize();
        const side = new THREE.Vector3().crossVectors(grow, n).normalize();
        card.rest.push(p.clone());
        card.normal.push(n.clone());
        card.side.push(side.clone());
        p = p.clone().addScaledVector(grow, len / segs);
        d = grow;
      }

      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const w = width * (1 - t * 0.35);
        card.halfW.push(w);
        const c = card.rest[k], s = card.side[k], n = card.normal[k];
        pos.push(c.x - s.x * w, c.y - s.y * w, c.z - s.z * w);
        pos.push(c.x + s.x * w, c.y + s.y * w, c.z + s.z * w);
        nor.push(n.x, n.y, n.z, n.x, n.y, n.z);
        uv.push(0, t, 1, t);
      }
      for (let k = 0; k < segs; k++) {
        const b = vo + k * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
      vo += card.count;
      this.cards.push(card);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.cardMesh = mesh;
    this.cardPos = g.attributes.position;

    this._buildCowlick();
  }

  /** The cowlick: three stiff cards at the whorl that stand up and curl. */
  _buildCowlick() {
    const segs = 9;
    const pos = [], nor = [], uv = [], idx = [];
    let vo = 0;
    this.cowlick = [];
    for (let i = 0; i < 2; i++) {
      const root = onSkull(WHORL.clone().sub(SKULL.c).normalize()
        .add(V(0.10 * (i - 1), 0, 0.06 * (i - 1))).normalize(), 0.0030);
      const card = {
        root, segs, rest: [], normal: [], side: [], halfW: [],
        off: V(0, 0, 0), vel: V(0, 0, 0), stiff: 1.5, phase: i * 2.1,
        vo, count: (segs + 1) * 2
      };
      let p = root.clone();
      const up = V(0.22 * (i - 1) + 0.10, 1, -0.30).normalize();
      const len = 0.020 + i * 0.004;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        // stands up, then curls back and over — a proper question-mark tuft
        const ang = t * 2.5;
        const grow = up.clone()
          .applyAxisAngle(V(1, 0, 0), -ang * 0.55)
          .applyAxisAngle(V(0, 0, 1), Math.sin(ang) * 0.35 * (i - 1))
          .normalize();
        const n = V(grow.z, 0.25, -grow.x).normalize();
        const side = new THREE.Vector3().crossVectors(grow, n).normalize();
        card.rest.push(p.clone());
        card.normal.push(n);
        card.side.push(side);
        p = p.clone().addScaledVector(grow, len / segs);
      }
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const w = 0.0075 * (1 - t * 0.5);
        card.halfW.push(w);
        const c = card.rest[k], s = card.side[k], n = card.normal[k];
        pos.push(c.x - s.x * w, c.y - s.y * w, c.z - s.z * w);
        pos.push(c.x + s.x * w, c.y + s.y * w, c.z + s.z * w);
        nor.push(n.x, n.y, n.z, n.x, n.y, n.z);
        uv.push(0, t, 1, t);
      }
      for (let k = 0; k < segs; k++) {
        const b = vo + k * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
      vo += card.count;
      this.cowlick.push(card);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.cowlickMesh = mesh;
    this.cowlickPos = g.attributes.position;
  }

  /* -------------------------------------------------------------- state --- */

  attach(headBone) {
    const p = headBone.getWorldPosition(new THREE.Vector3());
    this.group.position.set(-p.x, -p.y, -p.z);
    headBone.add(this.group);
    this._headBone = headBone;
  }

  setWind(dir, strength = 1) {
    if (dir) this.wind.copy(dir).normalize();
    this.windStrength = strength;
  }

  /** Wet hair clumps, darkens and hangs. */
  setWet(a) {
    this.wet = THREE.MathUtils.clamp(a, 0, 1);
    const c = new THREE.Color(this.color);
    c.multiplyScalar(1 - this.wet * 0.42);
    this.mat.color.copy(c);
    this.scalpMat.color.copy(c);
    this.mat.roughness = 0.62 - this.wet * 0.42;
    this.scalpMat.roughness = this.mat.roughness;
    this.mat.sheen = 1 - this.wet * 0.5;
  }

  /* ------------------------------------------------------------- update --- */

  update(dt, ctx) {
    this._t += dt;
    const t = this._t;

    // head acceleration in head-local space drives the whole hair mass
    if (this._headBone) {
      const wp = this._headBone.getWorldPosition(new THREE.Vector3());
      if (this._prevHeadPos) {
        const v = wp.clone().sub(this._prevHeadPos).divideScalar(Math.max(1e-4, dt));
        this._headAcc.copy(v).sub(this._headVel).divideScalar(Math.max(1e-4, dt));
        this._headVel.copy(v);
      }
      this._prevHeadPos = wp;
    }
    const drive = this._headAcc.clone().multiplyScalar(-0.00016);
    drive.x = THREE.MathUtils.clamp(drive.x, -0.02, 0.02);
    drive.y = THREE.MathUtils.clamp(drive.y, -0.02, 0.02);
    drive.z = THREE.MathUtils.clamp(drive.z, -0.02, 0.02);
    // wind is applied in head space; a dryer/breeze just sets it and forgets
    const wind = this.wind.clone().multiplyScalar(this.windStrength * 0.020);

    const sim = (cards, attr) => {
      const arr = attr.array;
      for (const c of cards) {
        const gust = wind.clone().multiplyScalar(
          0.65 + 0.35 * Math.sin(t * 11 + c.phase) + 0.2 * Math.sin(t * 4.3 + c.phase * 1.7));
        const target = drive.clone().add(gust)
          .addScaledVector(V(0, -1, 0), this.wet * 0.008);
        const k = 140 * c.stiff, damp = 13;
        c.vel.addScaledVector(target.clone().sub(c.off).multiplyScalar(k), dt);
        c.vel.multiplyScalar(Math.max(0, 1 - damp * dt));
        c.off.addScaledVector(c.vel, dt);
        const L = c.off.length();
        if (L > 0.026) c.off.multiplyScalar(0.026 / L);

        for (let kk = 0; kk <= c.segs; kk++) {
          const w = Math.pow(kk / c.segs, 1.8);      // roots stay put, tips swing
          const r = c.rest[kk], s = c.side[kk];
          const ox = c.off.x * w, oy = c.off.y * w, oz = c.off.z * w;
          const i0 = (c.vo + kk * 2) * 3, i1 = i0 + 3;
          const half = c.halfW[kk];
          arr[i0] = r.x - s.x * half + ox; arr[i0 + 1] = r.y - s.y * half + oy; arr[i0 + 2] = r.z - s.z * half + oz;
          arr[i1] = r.x + s.x * half + ox; arr[i1 + 1] = r.y + s.y * half + oy; arr[i1 + 2] = r.z + s.z * half + oz;
        }
      }
      attr.needsUpdate = true;
    };
    sim(this.cards, this.cardPos);
    sim(this.cowlick, this.cowlickPos);
  }

  dispose() {
    this.group.traverse(o => o.geometry?.dispose?.());
    this.mat?.dispose?.(); this.scalpMat?.dispose?.();
  }
}
