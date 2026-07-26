/* ============================================================================
 * activities/bath.js — 🛁 おふろ
 * ----------------------------------------------------------------------------
 * The full ritual, in the order a real bath happens:
 *
 *   1. undress — clothes come off and fly to the laundry basket; anything
 *      stained is flagged for washing so the dress scene picks it up.
 *   2. fill    — the tap runs a real falling stream, the red and blue knobs
 *      mix the temperature. Too hot and the tub billows steam; too cold and
 *      the baby shivers. The water level rises smoothly.
 *   3. test    — a hand in the water before anyone gets in.
 *   4. wash    — dirt sits where its cause put it (mouth = food, hands =
 *      play, feet = rain mud). Pump the shampoo, scrub the head, watch the
 *      lather build, then stroke upward to sculpt a foam horn.
 *   5. rinse   — the shower only clears foam where it is actually aimed.
 *   6. dry     — towel off; a missed patch earns a sneeze. Then the hairdryer.
 *
 * Everything visual lives in `src/fx/water.js` and `src/fx/foam.js`; this file
 * owns the set, the props and the gameplay.
 * ========================================================================== */

import * as THREE from 'three';
import * as MAT from '../engine/materials.js';
import * as TEX from '../engine/textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WaterSurface, WaterlineRing, TapStream, SteamVeil, DynamicTube, rng } from '../fx/water.js';
import { FoamSystem } from '../fx/foam.js';

/* ------------------------------------------------------------ constants --- */

/** Oval stretch applied to the lathed bowl: a baby bath is not a cylinder. */
const SX = 1.5;

/**
 * Bowl cross-section, inner floor → inner wall → rolled rim → outer wall →
 * base fillet. Every direction change is at least two points apart so the
 * lathe produces a real bevel with its own specular, not a hard crease.
 */
const PROFILE = [
  [0.000, 0.034], [0.120, 0.030], [0.190, 0.038], [0.226, 0.070],
  [0.244, 0.120], [0.252, 0.180], [0.258, 0.226], [0.266, 0.250],
  [0.276, 0.259], [0.286, 0.253], [0.290, 0.238], [0.288, 0.150],
  [0.274, 0.060], [0.246, 0.016], [0.200, 0.002], [0.000, 0.000]
];
const INNER_COUNT = 8;                 // profile points that form the wetted bowl
const RIM_R = PROFILE[INNER_COUNT - 1][0];
const HALF_X = RIM_R * SX;
const HALF_Z = RIM_R;
const STAND_H = 0.30;
const WATER_MIN = 0.042;
const WATER_MAX = 0.208;

const TEMP_OK_MIN = 0.36, TEMP_OK_MAX = 0.72;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _ndc = new THREE.Vector2();

/* -------------------------------------------------------------- helpers --- */

/** Inner bowl height for a normalised ellipse radius (0 = centre, 1 = rim). */
function bowlY(e) {
  const r = THREE.MathUtils.clamp(e, 0, 1) * RIM_R;
  for (let i = 1; i < INNER_COUNT; i++) {
    if (r <= PROFILE[i][0]) {
      const a = PROFILE[i - 1], b = PROFILE[i];
      const t = (r - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return PROFILE[INNER_COUNT - 1][1];
}

/** Box with genuinely rounded, shaded edges — no hard 90° corners anywhere. */
function roundedBox(w, h, d, r, seg = 5) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = geo.attributes.position;
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
  const v = new THREE.Vector3(), inner = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(
      THREE.MathUtils.clamp(v.x, -ix, ix),
      THREE.MathUtils.clamp(v.y, -iy, iy),
      THREE.MathUtils.clamp(v.z, -iz, iz));
    v.sub(inner);
    const len = v.length();
    if (len > 1e-6) v.multiplyScalar(r / len);
    p.setXYZ(i, inner.x + v.x, inner.y + v.y, inner.z + v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Bake a set of transformed parts down to one geometry. Draw calls, not
 * triangles, are the budget in this project — a stool with four legs has no
 * business costing five of them. Source geometries are consumed.
 */
function mergeParts(parts) {
  const clones = [];
  const sources = new Set();
  const q = new THREE.Quaternion(), m = new THREE.Matrix4();
  const pv = new THREE.Vector3(), sv = new THREE.Vector3();
  for (const p of parts) {
    const g = p.geo.clone();
    q.setFromEuler(new THREE.Euler(...(p.rot || [0, 0, 0])));
    m.compose(pv.set(...(p.pos || [0, 0, 0])), q, sv.set(...(p.scale || [1, 1, 1])));
    g.applyMatrix4(m);            // transforms normals too — no recompute needed
    clones.push(g);
    sources.add(p.geo);
  }
  const out = mergeGeometries(clones, false);
  for (const g of clones) g.dispose();
  for (const g of sources) g.dispose();
  return out;
}

/** Chrome pipework: a smooth tube through a handful of control points. */
function pipe(points, radius, segments = 48, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, segments, radius, radial, false);
}

/**
 * A towel folded over a rail: back panel, half-cylinder over the bar, front
 * panel, with a slow sag across the width and a wavy hem.
 */
function drapedTowel(width, railR, dropBack, dropFront, segU = 16, segV = 30) {
  const arc = Math.PI * railR;
  const total = dropBack + arc + dropFront;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segV; j++) {
    const s = (j / segV) * total;
    let y, z;
    if (s < dropBack) { y = -(dropBack - s); z = -railR; }
    else if (s < dropBack + arc) {
      const a = Math.PI - ((s - dropBack) / arc) * Math.PI;
      y = Math.sin(a) * railR; z = Math.cos(a) * railR;
    } else { y = -(s - dropBack - arc); z = railR; }
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const x = (u - 0.5) * width;
      // cloth sags between the two ends of the rail and ripples down the drop
      const sag = -Math.sin(u * Math.PI) * 0.012 * (s > dropBack + arc ? 1 : 0.3);
      const ripple = Math.sin(u * Math.PI * 3.0 + s * 5.0) * 0.004
                   * THREE.MathUtils.clamp((s - dropBack - arc) / 0.12, 0, 1);
      pos.push(x, y + sag + ripple * 0.4, z + ripple);
      uv.push(u, s / total);
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------- droplets --- */

/**
 * Water clinging to skin: instanced beads that hang, swell, then run down and
 * drip off. Rubbing them off with the towel is the dry-phase mechanic, and a
 * bead left behind is what triggers the sneeze.
 */
class Droplets {
  constructor(ctx, parent, cap) {
    this.ctx = ctx;
    this.cap = cap;
    this.list = [];
    this.rand = rng(3313);
    this.geometry = new THREE.SphereGeometry(1, 10, 8);
    this.material = MAT.makeGlass({ thickness: 0.006, roughness: 0.03, tint: 0xd6efff });
    this.material.opacity = 0.85;
    this.material.transmission = (ctx?.tier ?? 2) >= 1 ? 0.92 : 0.0;
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.name = 'bath-droplets';
    parent.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  spawn(anchor, local, r) {
    if (this.list.length >= this.cap) return;
    this.list.push({
      anchor, local: local.clone(), r,
      vel: 0, run: 0,
      wob: this.rand() * 6.28,
      bottom: local.y - 0.10 - this.rand() * 0.06
    });
  }

  /** Deterministic full-body coverage, used on leaving the tub. */
  fill(anchors, amount) {
    this.list.length = 0;
    const rand = rng(7717);
    const plan = [
      ['head', 14, 0.062, 0.02],
      ['body', 16, 0.070, 0.02],
      ['handL', 3, 0.030, 0.0],
      ['handR', 3, 0.030, 0.0]
    ];
    for (const [id, n, spread, up] of plan) {
      const a = anchors.get(id);
      if (!a) continue;
      const count = Math.round(n * amount);
      for (let i = 0; i < count; i++) {
        const ang = rand() * Math.PI * 2;
        const rad = Math.sqrt(rand()) * spread;
        this.spawn(a, new THREE.Vector3(
          Math.cos(ang) * rad,
          up + (rand() - 0.35) * spread * 1.4,
          Math.sin(ang) * rad * 0.75 + spread * 0.45),
          0.0045 + rand() * 0.004);
      }
    }
  }

  /** Wipe every bead within `radius` of a world point. Returns how many went. */
  wipe(worldPoint, radius) {
    let n = 0;
    const r2 = radius * radius;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      this._p.copy(d.local);
      d.anchor.localToWorld(this._p);
      if (this._p.distanceToSquared(worldPoint) <= r2) { this.list.splice(i, 1); n++; }
    }
    return n;
  }

  clear() { this.list.length = 0; this.mesh.count = 0; }
  get count() { return this.list.length; }

  update(dt, time) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      // beads hang, swell, then break loose and accelerate down the skin
      d.vel = Math.min(0.09, d.vel + dt * 0.035);
      d.local.y -= d.vel * dt;
      d.local.x += Math.sin(time * 1.7 + d.wob) * dt * 0.002;
      if (d.local.y < d.bottom) {
        this.list.splice(i, 1);
        this._p.copy(d.local);
        d.anchor.localToWorld(this._p);
        this.ctx?.fx?.burst?.('splash', this._p, 1, { scale: 0.35 });
        continue;
      }
      this._p.copy(d.local);
      d.anchor.localToWorld(this._p);
      const stretch = 1 + d.vel * 4.0;
      this._s.set(d.r, d.r * stretch, d.r);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(n++, this._m);
      if (n >= this.cap) break;
    }
    this.mesh.count = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = n > 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.list.length = 0;
  }
}

/* ============================================================== activity == */

export class BathActivity {
  constructor(ctx) {
    this.ctx = ctx;
    this.tier = Math.max(0, Math.min(2, ctx?.tier ?? 2));
    this.rand = rng(5501);

    this.phase = '';
    this.time = 0;
    this.temp = 0.5;
    this.filling = false;
    this.shampooUsed = false;
    this.inTub = false;
    this.wet = 0;
    this.sneezeTimer = 7;
    this.dryerBlast = 0;
    this._drag = null;
    this._lastScrub = 0;
    this._lastPointerY = null;
    this._scrubStrokeUp = 0;
    this._hopT = -1;
    this._flying = [];
    this._disposables = [];
    this._timers = [];
    this._touchedMaterials = new Set();
    this._steamOverride = null;
    this._splashPulse = 0;

    this.dirt = { face: 0, hands: 0, feet: 0, body: 0, hair: 0 };
  }

  /* =========================================================== build ==== */

  async build() {
    const ctx = this.ctx;
    const scene = ctx.scene;

    this.root = new THREE.Group();
    this.root.name = 'bath';
    scene.add(this.root);

    // Position the whole set on the room's tub anchor when the room offers
    // one, so this activity never fights the nursery layout.
    const anchor = ctx.room?.anchor?.('tub');
    this.tub = new THREE.Group();
    this.tub.name = 'bath-tub';
    if (anchor) {
      anchor.updateMatrixWorld();
      anchor.getWorldPosition(_v);
      this.tub.position.set(_v.x, 0, _v.z);
      this.tub.rotation.y = new THREE.Euler().setFromQuaternion(
        anchor.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    } else {
      this.tub.position.set(0.26, 0, 0.14);
      this.tub.rotation.y = -0.16;
    }
    this.root.add(this.tub);

    this.bowl = new THREE.Group();
    this.bowl.position.y = STAND_H;
    this.tub.add(this.bowl);

    this._buildStand();
    this._buildBowl();
    this._buildMixer();
    this._buildShower();
    this._buildCaddy();
    this._buildTowelRail();
    this._buildBasket();
    this._buildMat();
    this._buildCue();

    /* --- water --------------------------------------------------------- */
    this.water = new WaterSurface(ctx, {
      parent: this.bowl,
      halfX: HALF_X, halfZ: HALF_Z, bowlY,
      minY: WATER_MIN, maxY: WATER_MAX,
      tint: 0xc9e9f2
    });
    this.water.setTemperature(this.temp);

    this.stream = new TapStream(this.bowl, {
      from: this.spoutTip.clone(), tier: this.tier
    });

    this.steam = new SteamVeil(ctx, {
      parent: this.bowl, count: 7, radiusX: HALF_X * 0.9, radiusZ: HALF_Z * 0.9
    });

    /* --- foam ---------------------------------------------------------- */
    this.foam = new FoamSystem(ctx, { parent: this.root });
    this.anchors = new Map();
    for (const id of ['head', 'body', 'handL', 'handR', 'water']) {
      const o = new THREE.Object3D();
      o.name = 'bath-anchor-' + id;
      this.root.add(o);
      this.anchors.set(id, o);
      this.foam.setAnchor(id, o);
    }
    this.anchors.get('water').position.copy(this.tub.position);

    /* --- waterlines ---------------------------------------------------- */
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new WaterlineRing(0.12);
      this.root.add(r.mesh);
      this.rings.push(r);
    }

    /* --- droplets & wet hair ------------------------------------------- */
    this.droplets = new Droplets(ctx, this.root, this.tier >= 2 ? 40 : (this.tier === 1 ? 26 : 14));
    this._buildWetStrands();

    /* --- floating toys ------------------------------------------------- */
    this._buildToys();

    /* --- camera -------------------------------------------------------- */
    this.root.updateMatrixWorld(true);
    this.towelHome = this.towel.getWorldPosition(new THREE.Vector3());
    this._registerCameras();

    return this;
  }

  /* ---------------------------------------------------------- set build -- */

  _buildStand() {
    const wood = MAT.makeWood({ light: 0xe6c79a, dark: 0x9a6a42, seed: 12, repeat: 2, clearcoat: 0.4 });
    this._materials(wood);
    const legGeo = new THREE.CylinderGeometry(0.019, 0.024, STAND_H, 12);
    const railGeo = roundedBox(0.66, 0.018, 0.026, 0.008, 3);
    const shelfGeo = roundedBox(0.60, 0.014, 0.30, 0.007, 3);
    const spanX = 0.30, spanZ = 0.20;
    const parts = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      parts.push({ geo: legGeo, pos: [sx * spanX, STAND_H / 2, sz * spanZ],
                   rot: [sz * 0.05, 0, -sx * 0.06] });
    }
    // cross rails + a slatted shelf for the bottles
    for (const sz of [-1, 1]) parts.push({ geo: railGeo, pos: [0, 0.10, sz * spanZ] });
    parts.push({ geo: shelfGeo, pos: [0, 0.093, 0] });
    const geo = mergeParts(parts);
    this._disposables.push(geo);
    const stand = new THREE.Mesh(geo, wood);
    stand.castShadow = stand.receiveShadow = true;
    this.tub.add(stand);
  }

  _buildBowl() {
    const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 72);
    geo.scale(SX, 1, 1);
    geo.computeVertexNormals();
    this._disposables.push(geo);

    const enamel = MAT.makeCeramic({ color: 0xfdfbff, repeat: 2, seed: 31 });
    this._materials(enamel);
    enamel.side = THREE.DoubleSide;
    enamel.envMapIntensity = 1.6;
    const bowl = new THREE.Mesh(geo, enamel);
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    bowl.name = 'bath-bowl';
    this.bowl.add(bowl);
    this.bowlMesh = bowl;

    // a soft mint band under the rim, painted straight onto the enamel look
    const bandGeo = new THREE.TorusGeometry(0.2885, 0.006, 10, 88);
    bandGeo.scale(SX, 1, 1);
    bandGeo.rotateX(Math.PI / 2);
    this._disposables.push(bandGeo);
    const band = new THREE.Mesh(bandGeo, this._materials(
      MAT.makePlastic({ color: 0x9fe0d6, seed: 44, matte: 0.3, clearcoat: 0.85 })));
    band.position.y = 0.190;
    band.castShadow = false;
    band.receiveShadow = true;
    this.bowl.add(band);

    /* --- drain --------------------------------------------------------- */
    const metal = this._materials(MAT.makeMetal({ color: 0xd9dee4, roughness: 0.18 }).clone());
    const grateGeo = new THREE.TorusGeometry(0.020, 0.0035, 8, 24);
    grateGeo.rotateX(Math.PI / 2);
    const barGeo = roundedBox(0.042, 0.003, 0.005, 0.0015, 2);
    const drainParts = [
      { geo: new THREE.CylinderGeometry(0.030, 0.026, 0.012, 20), pos: [0, 0.0295, 0] },
      { geo: grateGeo, pos: [0, 0.0355, 0] }
    ];
    for (let i = 0; i < 3; i++) drainParts.push({ geo: barGeo, pos: [0, 0.0355, (i - 1) * 0.010] });
    const drainGeo = mergeParts(drainParts);
    this._disposables.push(drainGeo);
    const drain = new THREE.Mesh(drainGeo, metal);
    drain.receiveShadow = true;
    this.bowl.add(drain);
  }

  _buildMixer() {
    const chrome = this._materials(MAT.makeMetal({ color: 0xe2e7ec, roughness: 0.13 }).clone());
    const g = new THREE.Group();
    g.position.set(-0.40, 0, -0.34);
    this.tub.add(g);
    this.mixer = g;

    const bodyGeo = mergeParts([
      { geo: new THREE.CylinderGeometry(0.045, 0.055, 0.020, 24), pos: [0, 0.010, 0] },
      { geo: pipe([
          [0, 0.02, 0], [0, 0.30, 0], [0, 0.56, 0], [0, 0.66, 0.02],
          [0.06, 0.705, 0.10], [0.17, 0.715, 0.20], [0.22, 0.700, 0.26]
        ], 0.0135, 60, 12) },
      { geo: new THREE.CylinderGeometry(0.019, 0.016, 0.026, 18),
        pos: [0.232, 0.688, 0.268], rot: [0, 0, 0.35] },
      { geo: pipe([[-0.11, 0.50, 0], [0, 0.505, 0], [0.11, 0.50, 0]], 0.011, 24, 10) },
      { geo: new THREE.CylinderGeometry(0.011, 0.013, 0.010, 14), pos: [-0.115, 0.548, 0] },
      { geo: new THREE.CylinderGeometry(0.011, 0.013, 0.010, 14), pos: [0.115, 0.548, 0] }
    ]);
    this._disposables.push(bodyGeo);
    const body = new THREE.Mesh(bodyGeo, chrome);
    body.castShadow = body.receiveShadow = true;
    g.add(body);

    // spout tip expressed in bowl space, where the stream lives
    this.spoutTip = new THREE.Vector3(
      g.position.x + 0.232, g.position.y + 0.678 - STAND_H, g.position.z + 0.272);

    /* --- the two knobs -------------------------------------------------- */
    const knobGeo = new THREE.SphereGeometry(0.030, 20, 14);
    knobGeo.scale(1, 0.78, 1);
    this._disposables.push(knobGeo);

    const hotMat = this._materials(MAT.makePlastic({ color: 0xe8503f, seed: 71, matte: 0.24, clearcoat: 1 }));
    const coldMat = this._materials(MAT.makePlastic({ color: 0x3f8fe8, seed: 72, matte: 0.24, clearcoat: 1 }));

    this.knobHot = new THREE.Mesh(knobGeo, hotMat);
    this.knobHot.position.set(-0.115, 0.522, 0);
    this.knobHot.castShadow = true;
    g.add(this.knobHot);

    this.knobCold = new THREE.Mesh(knobGeo, coldMat);
    this.knobCold.position.set(0.115, 0.522, 0);
    this.knobCold.castShadow = true;
    g.add(this.knobCold);

    /* --- temperature gauge on the front of the tub --------------------- */
    const gaugeBody = roundedBox(0.14, 0.036, 0.014, 0.014, 4);
    this._disposables.push(gaugeBody);
    const gauge = new THREE.Mesh(gaugeBody,
      this._materials(MAT.makePlastic({ color: 0xf7f2ea, seed: 73, matte: 0.5 })));
    gauge.position.set(0.09, 0.16, 0.284);
    gauge.rotation.x = 0.16;
    gauge.castShadow = true;
    this.bowl.add(gauge);

    // vertical gradient rotated a quarter turn so cold reads left, hot right
    const scaleGeo = new THREE.PlaneGeometry(0.020, 0.118);
    scaleGeo.rotateZ(-Math.PI / 2);
    this._disposables.push(scaleGeo);
    const scaleTex = TEX.gradient([
      [0.0, '#e8503f'], [0.34, '#ffc46a'], [0.5, '#7be09a'],
      [0.66, '#63d3f0'], [1.0, '#2f7fe0']
    ], { size: 128 });
    const scaleMat = this._materials(new THREE.MeshBasicMaterial({ map: scaleTex }));
    const scale = new THREE.Mesh(scaleGeo, scaleMat);
    scale.position.set(0.09, 0.16, 0.2925);
    scale.rotation.x = 0.16;
    this.bowl.add(scale);
    this.gaugeScale = scale;

    const beadGeo = new THREE.SphereGeometry(0.009, 14, 10);
    this._disposables.push(beadGeo);
    this.gaugeBead = new THREE.Mesh(beadGeo,
      this._materials(MAT.makePlastic({ color: 0xfffdf6, seed: 74, matte: 0.2, clearcoat: 1 })));
    this.gaugeBead.castShadow = false;
    this.bowl.add(this.gaugeBead);
  }

  _buildShower() {
    const chrome = this._materials(MAT.makeMetal({ color: 0xdfe5ea, roughness: 0.16 }).clone());
    const head = new THREE.Group();
    this.tub.add(head);
    this.showerHead = head;
    this.showerHome = new THREE.Vector3(-0.32, 0.74, -0.22);
    head.position.copy(this.showerHome);
    head.rotation.z = 0.5;

    const cupGeo = mergeParts([
      { geo: new THREE.CylinderGeometry(0.046, 0.036, 0.028, 26) },
      { geo: new THREE.CylinderGeometry(0.014, 0.017, 0.11, 16), pos: [0, 0.072, 0] }
    ]);
    this._disposables.push(cupGeo);
    const cup = new THREE.Mesh(cupGeo, chrome);
    cup.castShadow = true;
    head.add(cup);

    const faceGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.006, 26);
    this._disposables.push(faceGeo);
    const face = new THREE.Mesh(faceGeo,
      this._materials(MAT.makePlastic({ color: 0xdcdfe4, seed: 75, matte: 0.55 })));
    face.position.y = -0.016;
    head.add(face);

    // hose — re-pathed every frame as the head is dragged around
    const hoseMat = this._materials(MAT.makeMetal({ color: 0xc9d0d8, roughness: 0.34 }).clone());
    this.hose = new DynamicTube(26, 9, () => 0.0095, hoseMat);
    this.hose.mesh.castShadow = true;
    this.tub.add(this.hose.mesh);

    /* --- spray cone ---------------------------------------------------- */
    const coneGeo = new THREE.CylinderGeometry(0.028, 0.115, 0.42, 22, 1, true);
    this._disposables.push(coneGeo);
    this.sprayUniforms = { uTime: { value: 0 }, uOn: { value: 0 } };
    this.sprayMat = this._materials(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: this.sprayUniforms,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; uniform float uTime, uOn;
        void main() {
          if ( uOn < 0.02 ) discard;
          float y = vUv.y * 7.0 + uTime * 6.5;
          float s = 0.5 + 0.5 * sin( y * 8.0 + vUv.x * 60.0 );
          s *= 0.5 + 0.5 * sin( y * 3.0 - vUv.x * 23.0 );
          float fade = smoothstep( 0.0, 0.25, vUv.y ) * smoothstep( 1.0, 0.45, vUv.y );
          float a = ( 0.06 + s * 0.22 ) * fade * uOn;
          gl_FragColor = vec4( vec3( 0.86, 0.94, 1.0 ) * ( 0.8 + s ), a );
        }`
    }));
    this.spray = new THREE.Mesh(coneGeo, this.sprayMat);
    this.spray.position.y = -0.23;
    this.spray.renderOrder = 5;
    this.spray.visible = false;
    head.add(this.spray);
  }

  _buildCaddy() {
    const wood = this._materials(MAT.makeWood({ light: 0xe9cfa6, dark: 0xa87a4c, seed: 21, repeat: 2 }));
    const stool = new THREE.Group();
    stool.position.set(0.62, 0, -0.06);
    stool.rotation.y = -0.35;
    this.tub.add(stool);
    this.caddy = stool;

    const legGeo = new THREE.CylinderGeometry(0.011, 0.014, 0.34, 10);
    const stoolParts = [{ geo: roundedBox(0.26, 0.020, 0.20, 0.012, 4), pos: [0, 0.34, 0] }];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      stoolParts.push({ geo: legGeo, pos: [sx * 0.10, 0.17, sz * 0.072],
                        rot: [sz * 0.05, 0, -sx * 0.05] });
    }
    const stoolGeo = mergeParts(stoolParts);
    this._disposables.push(stoolGeo);
    const top = new THREE.Mesh(stoolGeo, wood);
    top.castShadow = top.receiveShadow = true;
    stool.add(top);

    /* --- shampoo bottle with a working pump ---------------------------- */
    const bottle = new THREE.Group();
    bottle.position.set(-0.055, 0.35, -0.01);
    stool.add(bottle);
    this.shampoo = bottle;

    const bodyPts = [
      new THREE.Vector2(0.000, 0.000), new THREE.Vector2(0.036, 0.000),
      new THREE.Vector2(0.042, 0.010), new THREE.Vector2(0.044, 0.080),
      new THREE.Vector2(0.041, 0.128), new THREE.Vector2(0.030, 0.150),
      new THREE.Vector2(0.019, 0.158), new THREE.Vector2(0.019, 0.170),
      new THREE.Vector2(0.000, 0.170)
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyPts, 32);
    this._disposables.push(bodyGeo);
    const bodyMat = this._materials(MAT.makePlastic({ color: 0xffa9c9, seed: 76, matte: 0.22, clearcoat: 0.9 }));
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = body.receiveShadow = true;
    bottle.add(body);

    const collarGeo = new THREE.CylinderGeometry(0.021, 0.021, 0.016, 20);
    this._disposables.push(collarGeo);
    const collarMat = this._materials(MAT.makePlastic({ color: 0xfff6ee, seed: 77, matte: 0.35 }));
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.y = 0.178;
    collar.castShadow = true;
    bottle.add(collar);

    const pump = new THREE.Group();
    pump.position.y = 0.186;
    bottle.add(pump);
    this.pump = pump;
    const pumpGeo = mergeParts([
      { geo: new THREE.CylinderGeometry(0.0065, 0.0065, 0.036, 12), pos: [0, 0.018, 0] },
      { geo: pipe([[0, 0.036, 0], [0.008, 0.040, 0], [0.024, 0.036, 0], [0.030, 0.026, 0]],
                  0.0072, 20, 8) }
    ]);
    this._disposables.push(pumpGeo);
    const ps = new THREE.Mesh(pumpGeo, collarMat);
    ps.castShadow = true;
    pump.add(ps);

    /* --- sponge -------------------------------------------------------- */
    const spGeo = roundedBox(0.085, 0.042, 0.058, 0.016, 5);
    this._disposables.push(spGeo);
    const sponge = new THREE.Mesh(spGeo,
      this._materials(MAT.makeCloth({ color: 0xffe680, weave: 'terry', threads: 90, repeat: 4, seed: 78 })));
    sponge.position.set(0.072, 0.372, 0.02);
    sponge.rotation.y = 0.4;
    sponge.castShadow = sponge.receiveShadow = true;
    stool.add(sponge);
    this.sponge = sponge;
    this.spongeHome = sponge.position.clone();
    this.spongeRot = sponge.rotation.clone();
    const spTopGeo = roundedBox(0.083, 0.016, 0.056, 0.008, 4);
    this._disposables.push(spTopGeo);
    const spTop = new THREE.Mesh(spTopGeo,
      this._materials(MAT.makeCloth({ color: 0x8fe07a, weave: 'terry', threads: 90, repeat: 4, seed: 79 })));
    spTop.position.y = 0.026;
    spTop.castShadow = true;
    sponge.add(spTop);

    /* --- hairdryer ----------------------------------------------------- */
    const dryer = new THREE.Group();
    dryer.position.set(0.03, 0.40, -0.055);
    dryer.rotation.set(0, 0.5, Math.PI / 2);
    dryer.visible = false;
    stool.add(dryer);
    this.dryer = dryer;
    this.dryerHome = { pos: dryer.position.clone(), rot: dryer.rotation.clone() };
    const dBodyGeo = new THREE.CylinderGeometry(0.036, 0.042, 0.12, 22);
    this._disposables.push(dBodyGeo);
    const dMat = this._materials(MAT.makePlastic({ color: 0xff8fb3, seed: 80, matte: 0.3, clearcoat: 0.8 }));
    const dBody = new THREE.Mesh(dBodyGeo, dMat);
    dBody.castShadow = true;
    dryer.add(dBody);
    const dNozGeo = new THREE.CylinderGeometry(0.030, 0.036, 0.030, 22);
    this._disposables.push(dNozGeo);
    const dNoz = new THREE.Mesh(dNozGeo, this._materials(MAT.makePlastic({ color: 0xf0f2f5, seed: 81, matte: 0.4 })));
    dNoz.position.y = 0.072;
    dryer.add(dNoz);
    const dGripGeo = roundedBox(0.034, 0.10, 0.030, 0.014, 4);
    this._disposables.push(dGripGeo);
    const dGrip = new THREE.Mesh(dGripGeo, dMat);
    dGrip.position.set(0.0, -0.10, 0.0);
    dGrip.rotation.z = 0.22;
    dGrip.castShadow = true;
    dryer.add(dGrip);
  }

  _buildTowelRail() {
    const chrome = this._materials(MAT.makeMetal({ color: 0xdde3e9, roughness: 0.2 }).clone());
    const rail = new THREE.Group();
    rail.position.set(0.0, 0, -0.52);
    this.tub.add(rail);

    const postGeo = new THREE.CylinderGeometry(0.010, 0.013, 0.66, 12);
    const footGeo = new THREE.CylinderGeometry(0.036, 0.042, 0.012, 18);
    const barGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.46, 14);
    barGeo.rotateZ(Math.PI / 2);
    const railParts = [{ geo: barGeo, pos: [0, 0.655, 0] }];
    for (const sx of [-1, 1]) {
      railParts.push({ geo: postGeo, pos: [sx * 0.22, 0.33, 0] });
      railParts.push({ geo: footGeo, pos: [sx * 0.22, 0.006, 0] });
    }
    const railGeo = mergeParts(railParts);
    this._disposables.push(railGeo);
    const railMesh = new THREE.Mesh(railGeo, chrome);
    railMesh.castShadow = railMesh.receiveShadow = true;
    rail.add(railMesh);

    const towelGeo = drapedTowel(0.30, 0.0125, 0.20, 0.26, 16, 34);
    this._disposables.push(towelGeo);
    const terry = this._materials(MAT.makeTerry({ color: 0xfff0f5, repeat: 3, seed: 71 }));
    terry.side = THREE.DoubleSide;
    const towel = new THREE.Mesh(towelGeo, terry);
    towel.position.set(-0.02, 0.655, 0);
    towel.castShadow = towel.receiveShadow = true;
    rail.add(towel);
    this.towel = towel;
    this.towelHome = new THREE.Vector3();
    this.towelParent = rail;
  }

  _buildBasket() {
    const g = new THREE.Group();
    g.position.set(-0.60, 0, 0.42);
    g.rotation.y = 0.5;
    this.tub.add(g);
    this.basket = g;

    const weave = this._materials(MAT.makeCloth({
      color: 0xe8d3ac, weave: 'plain', threads: 46, repeat: 5, seed: 82, sheen: 0.4
    }));
    weave.side = THREE.DoubleSide;
    const pts = [
      new THREE.Vector2(0.000, 0.000), new THREE.Vector2(0.105, 0.000),
      new THREE.Vector2(0.118, 0.014), new THREE.Vector2(0.132, 0.140),
      new THREE.Vector2(0.140, 0.220), new THREE.Vector2(0.144, 0.238)
    ];
    const geo = new THREE.LatheGeometry(pts, 30);
    this._disposables.push(geo);
    const b = new THREE.Mesh(geo, weave);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    const rimGeo = new THREE.TorusGeometry(0.144, 0.011, 10, 34);
    rimGeo.rotateX(Math.PI / 2);
    this._disposables.push(rimGeo);
    const rim = new THREE.Mesh(rimGeo,
      this._materials(MAT.makeCloth({ color: 0xd3b986, weave: 'plain', threads: 30, repeat: 4, seed: 83 })));
    rim.position.y = 0.238;
    rim.castShadow = true;
    g.add(rim);
  }

  _buildMat() {
    const geo = roundedBox(0.46, 0.020, 0.34, 0.055, 6);
    this._disposables.push(geo);
    const m = new THREE.Mesh(geo,
      this._materials(MAT.makeTerry({ color: 0xffdcea, repeat: 3, seed: 84 })));
    m.position.set(0.02, 0.010, 0.50);
    m.rotation.y = 0.12;
    m.receiveShadow = true;
    m.castShadow = false;
    this.tub.add(m);
    this.bathMat = m;
  }

  _buildToys() {
    const rand = this.rand;
    this.floaters = [];

    /* --- rubber duck --------------------------------------------------- */
    const duck = new THREE.Group();
    this.bowl.add(duck);
    const yellow = this._materials(MAT.makePlastic({ color: 0xffcf2e, seed: 85, matte: 0.28, clearcoat: 0.9 }));
    const dBody = new THREE.SphereGeometry(0.052, 22, 16);
    dBody.scale(1.22, 0.86, 0.98);
    const duckGeo = mergeParts([
      { geo: dBody },
      { geo: new THREE.ConeGeometry(0.030, 0.055, 14), pos: [-0.056, 0.020, 0], rot: [0, 0, -0.9] },
      { geo: new THREE.SphereGeometry(0.033, 18, 14), pos: [0.040, 0.052, 0] }
    ]);
    this._disposables.push(duckGeo);
    const db = new THREE.Mesh(duckGeo, yellow);
    db.castShadow = true;
    duck.add(db);
    const beak = new THREE.ConeGeometry(0.014, 0.030, 12);
    this._disposables.push(beak);
    const bk = new THREE.Mesh(beak, this._materials(MAT.makePlastic({ color: 0xff8a3d, seed: 86, matte: 0.3 })));
    bk.position.set(0.070, 0.048, 0);
    bk.rotation.z = -Math.PI / 2;
    duck.add(bk);
    const eyeGeo = mergeParts([
      { geo: new THREE.SphereGeometry(0.0055, 10, 8), pos: [0.055, 0.060, -0.020] },
      { geo: new THREE.SphereGeometry(0.0055, 10, 8), pos: [0.055, 0.060, 0.020] }
    ]);
    this._disposables.push(eyeGeo);
    duck.add(new THREE.Mesh(eyeGeo,
      this._materials(MAT.makePlastic({ color: 0x2a1f22, seed: 87, matte: 0.1, clearcoat: 1 }))));
    this.duck = duck;
    this.floaters.push({ obj: duck, x: 0.19, z: 0.11, ry: -0.6, buoy: 0.026, vy: 0, spin: 0.22 });

    /* --- little boat --------------------------------------------------- */
    const boat = new THREE.Group();
    this.bowl.add(boat);
    const hullPts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      hullPts.push(new THREE.Vector2(0.001 + Math.sin(t * Math.PI * 0.5) * 0.048, t * 0.040));
    }
    const hullGeo = new THREE.LatheGeometry(hullPts, 22);
    hullGeo.scale(1.5, 1, 1);
    this._disposables.push(hullGeo);
    const hull = new THREE.Mesh(hullGeo,
      this._materials(MAT.makePlastic({ color: 0x5ec8ff, seed: 88, matte: 0.28, clearcoat: 0.85 })));
    hull.castShadow = true;
    boat.add(hull);
    const mastGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.085, 8);
    this._disposables.push(mastGeo);
    const mast = new THREE.Mesh(mastGeo,
      this._materials(MAT.makeWood({ light: 0xe8c99a, dark: 0xa57c4e, seed: 22, repeat: 1 })));
    mast.position.y = 0.062;
    mast.castShadow = true;
    boat.add(mast);
    const sailGeo = new THREE.PlaneGeometry(0.055, 0.070, 6, 6);
    {
      const p = sailGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setZ(i, Math.sin((p.getY(i) / 0.07 + 0.5) * Math.PI) * 0.010);
      }
      sailGeo.computeVertexNormals();
    }
    this._disposables.push(sailGeo);
    const sail = new THREE.Mesh(sailGeo,
      this._materials(MAT.makeCloth({ color: 0xfff4f8, weave: 'plain', threads: 90, repeat: 2, seed: 89 })));
    sail.material.side = THREE.DoubleSide;
    sail.position.set(0.020, 0.078, 0);
    sail.rotation.y = Math.PI / 2;
    sail.castShadow = true;
    boat.add(sail);
    this.floaters.push({ obj: boat, x: -0.20, z: -0.09, ry: 0.9, buoy: 0.014, vy: 0, spin: -0.16 });

    /* --- squeaky star -------------------------------------------------- */
    const star = new THREE.Group();
    this.bowl.add(star);
    const armGeo = roundedBox(0.028, 0.070, 0.026, 0.012, 4);
    const coreGeo = new THREE.SphereGeometry(0.030, 16, 12);
    coreGeo.scale(1, 0.55, 1);
    const starParts = [{ geo: coreGeo }];
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      starParts.push({
        geo: armGeo,
        pos: [Math.sin(ang) * 0.030, 0, Math.cos(ang) * 0.030],
        rot: [Math.cos(ang) * 0.5, ang, -Math.sin(ang) * 0.5]
      });
    }
    const starGeo = mergeParts(starParts);
    this._disposables.push(starGeo);
    const starMat = this._materials(MAT.makePlastic({ color: 0xff8ac4, seed: 90, matte: 0.34, clearcoat: 0.8 }));
    const core = new THREE.Mesh(starGeo, starMat);
    core.castShadow = true;
    star.add(core);
    this.floaters.push({ obj: star, x: 0.06, z: -0.16, ry: 0.2, buoy: 0.010, vy: 0, spin: 0.3 });

    for (const f of this.floaters) {
      f.obj.position.set(f.x, WATER_MIN, f.z);
      f.obj.rotation.y = f.ry;
      f.obj.visible = false;
      f.driftPhase = rand() * 6.28;
    }
  }

  _buildWetStrands() {
    // A few dark, clumped strands that appear only when the hair is soaked.
    const g = new THREE.Group();
    g.visible = false;
    this.root.add(g);
    this.wetStrands = g;
    const mat = this._materials(MAT.makeHair({ color: 0x4a3123, sheenColor: 0xffd9a8 }));
    mat.transparent = false;
    mat.alphaTest = 0;
    mat.roughness = 0.30;
    mat.clearcoat = 0.7;
    const rand = rng(6607);
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const len = 0.030 + rand() * 0.030;
      const geo = new THREE.ConeGeometry(0.0085, len, 7, 3);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const t = (p.getY(k) + len / 2) / len;
        p.setX(k, p.getX(k) + Math.sin(t * 2.2) * 0.008);   // strands hang, not spike
      }
      geo.computeVertexNormals();
      const a = (i / 9) * Math.PI * 2 + 0.4;
      const rad = 0.052 + rand() * 0.012;
      parts.push({
        geo,
        pos: [Math.cos(a) * rad, 0.012 - len * 0.35, Math.sin(a) * rad * 0.85],
        rot: [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5]
      });
    }
    const strandGeo = mergeParts(parts);
    this._disposables.push(strandGeo);
    const strands = new THREE.Mesh(strandGeo, mat);
    strands.castShadow = true;
    g.add(strands);
  }

  /** A wordless "look here" marker — a 4-year-old reads this, not text. */
  _buildCue() {
    const g = new THREE.Group();
    g.visible = false;
    this.root.add(g);
    this.cue = g;
    const ringGeo = new THREE.TorusGeometry(0.055, 0.006, 10, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this._disposables.push(ringGeo);
    const mat = this._materials(new THREE.MeshBasicMaterial({
      color: 0xfff0b0, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false
    }));
    this.cueMat = mat;
    const ring = new THREE.Mesh(ringGeo, mat);
    g.add(ring);
    const chevGeo = new THREE.ConeGeometry(0.024, 0.040, 4);
    this._disposables.push(chevGeo);
    const chev = new THREE.Mesh(chevGeo, mat);
    chev.rotation.x = Math.PI;
    chev.position.y = 0.075;
    g.add(chev);
    this.cueChevron = chev;
  }

  /**
   * The three shots this activity needs, authored in tub-local metres and
   * pushed through the tub transform so they follow the room's anchor.
   * `tub` has to work for the whole ritual because the app snaps to it on
   * entry; the other two tighten in once a phase actually changes.
   */
  _registerCameras() {
    const rig = this.ctx.cameraRig;
    if (!rig?.addPreset) return;
    this.tub.updateMatrixWorld(true);
    const w = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z);
      this.tub.localToWorld(v);
      return [v.x, v.y, v.z];
    };
    const add = (name, pos, target, fov, focus) => {
      try {
        rig.addPreset(name, { pos: w(...pos), target: w(...target), fov, focusRange: focus });
      } catch (e) { /* the rig may not accept overrides — never fatal */ }
    };
    // wide enough for the tub, the mixer and the baby standing on the mat
    add('tub', [0.56, 1.12, 1.62], [0.00, 0.36, 0.22], 34, 0.26);
    // over the rim, tight on a baby sitting in the water
    add('bath-face', [0.42, 1.02, 1.10], [0.02, 0.50, 0.02], 36, 0.17);
    // the towel-and-dryer stage on the mat
    add('bath-dry', [0.38, 0.74, 1.66], [0.02, 0.32, 0.50], 33, 0.20);
  }

  _goTo(preset, seconds = 1.1) {
    try { this.ctx.cameraRig?.goTo?.(preset, seconds); } catch (e) { /**/ }
  }

  /* ============================================================ enter ==== */

  async enter() {
    const ctx = this.ctx;
    ctx.ui?.setHud?.(true);

    /* --- dirt, sourced from what actually happened earlier -------------- */
    const s = ctx.state?.dirt;
    const rainy = (ctx.state?.weather || 'clear') === 'rain';
    this.dirt = {
      face: s?.face ?? 0.75,
      hands: s?.hands ?? 0.60,
      feet: s?.feet ?? (rainy ? 0.85 : 0.45),
      body: s?.body ?? 0.30,
      hair: s?.hair ?? 0.40
    };
    for (const z of Object.keys(this.dirt)) ctx.baby?.setDirt?.(z, this.dirt[z]);

    /* --- deliberately wrong to start with: the child has to mix --------- */
    this.temp = 0.10;
    this.water.setTemperature(this.temp);
    this.water.setLevel(0, true);
    this.filling = false;
    this.shampooUsed = false;
    this.inTub = false;
    this.wet = 0;
    this.foam.clear();
    this.droplets.clear();

    // measure the head so the lather sits on it whatever the rig does
    const hr = this._estimateHeadRadius();
    this.foam.setHeadRadius(hr);

    this._placeBabyOnMat();
    ctx.baby?.setWet?.(0);
    ctx.baby?.lookAt?.(this._world(this.bowl, 0, WATER_MAX, 0));

    const naked = !!ctx.state?.naked;
    this._setPhase(naked ? 'fill' : 'undress');
    this.root.visible = true;
    return this;
  }

  async exit() {
    const ctx = this.ctx;
    this._restoreMaterials();
    ctx.baby?.setWet?.(this.wet);
    this.foam.clear();
    for (const z of ['face', 'hands', 'feet', 'body', 'hair']) {
      ctx.baby?.setFoam?.(z, 0);
    }
    this.stream.setFlow(0);
    this.steam.setAmount(0);
    ctx.ui?.hidePrompt?.();
    return this;
  }

  dispose() {
    this._timers.length = 0;
    this._restoreMaterials();
    this.water.dispose();
    this.stream.dispose();
    this.steam.dispose();
    this.foam.dispose();
    this.droplets.dispose();
    for (const r of this.rings) r.dispose();
    this.rings.length = 0;
    this.hose.mesh.removeFromParent();
    this.hose.dispose();

    for (const d of this._disposables) d?.dispose?.();
    this._disposables.length = 0;
    for (const m of this._matList || []) m?.dispose?.();
    this._matList = [];

    this.root.traverse(o => {
      if (o.isInstancedMesh) o.dispose?.();
    });
    this.root.removeFromParent();
    this.root.clear();
    this.anchors?.clear();
  }

  /* ------------------------------------------------------------ helpers -- */

  _materials(m) { (this._matList ||= []).push(m); return m; }

  _restoreMaterials() {
    for (const m of this._touchedMaterials) MAT.applyWetness(m, 0);
    this._touchedMaterials.clear();
  }

  _world(obj, x, y, z) {
    obj.updateMatrixWorld();
    return obj.localToWorld(new THREE.Vector3(x, y, z));
  }

  /**
   * Simulation-time delay. Deliberately not `setTimeout`: the screenshot
   * harness advances `update(dt)` in a tight synchronous loop, so anything
   * scheduled on the wall clock would simply never fire.
   */
  _after(seconds, fn, tag) {
    if (tag) this._timers = this._timers.filter(t => t.tag !== tag);
    this._timers.push({ t: seconds, fn, tag });
  }

  _tickTimers(dt) {
    for (let i = this._timers.length - 1; i >= 0; i--) {
      const t = this._timers[i];
      t.t -= dt;
      if (t.t <= 0) { this._timers.splice(i, 1); t.fn(); }
    }
  }

  _sfx(name, opts) { try { this.ctx.audio?.play?.(name, opts); } catch (e) { /* optional */ } }

  _prompt(text, icon) { try { this.ctx.ui?.prompt?.(text, icon ? { icon } : undefined); } catch (e) { /**/ } }

  _toast(text, icon) { try { this.ctx.ui?.toast?.(text, icon ? { icon } : undefined); } catch (e) { /**/ } }

  _estimateHeadRadius() {
    const b = this.ctx.baby;
    try {
      const h = b?.headWorldPos?.();
      const c = b?.focusPoint?.();
      if (h && c) {
        const d = h.distanceTo(c);
        if (d > 0.04 && d < 0.4) return THREE.MathUtils.clamp(d * 0.55, 0.045, 0.10);
      }
    } catch (e) { /**/ }
    return 0.068;
  }

  _babyPoint(kind) {
    const b = this.ctx.baby;
    try {
      if (kind === 'head' && b?.headWorldPos) return b.headWorldPos();
      if (kind === 'mouth' && b?.mouthWorldPos) return b.mouthWorldPos();
      if (kind === 'handL' && b?.handWorldPos) return b.handWorldPos('left');
      if (kind === 'handR' && b?.handWorldPos) return b.handWorldPos('right');
      if (kind === 'body' && b?.focusPoint) return b.focusPoint();
    } catch (e) { /**/ }
    const p = b?.group?.position ? b.group.position.clone() : new THREE.Vector3();
    const dy = { head: 0.30, mouth: 0.27, body: 0.18, handL: 0.14, handR: 0.14, feet: 0.03 };
    return p.setY(p.y + (dy[kind] ?? 0.18));
  }

  /* ------------------------------------------------------- baby placing -- */

  _placeBabyInTub() {
    const b = this.ctx.baby;
    if (!b?.group) return;
    const p = this._world(this.bowl, 0.015, PROFILE[0][1] - 0.004, 0.0);
    b.group.position.copy(p);
    b.group.rotation.set(0, this.tub.rotation.y + 0.16, 0);
    b.playPose?.('bathe', { seconds: 0.5 });
    this.inTub = true;
  }

  _placeBabyOnMat() {
    const b = this.ctx.baby;
    if (!b?.group) return;
    const p = this._world(this.tub, 0.02, 0.019, 0.50);
    b.group.position.copy(p);
    b.group.rotation.set(0, this.tub.rotation.y + 0.30, 0);
    b.playPose?.('stand', { seconds: 0.5 });
    this.inTub = false;
  }

  /* ============================================================ phases == */

  _setPhase(p) {
    if (this.phase === p) return;
    this.phase = p;
    const ctx = this.ctx;
    switch (p) {
      case 'undress':
        this._prompt('おふくを ぬがせてあげよう', 'shirt');
        this._cueAt(this._babyPoint('body'), 0.10);
        break;
      case 'fill':
        this._goTo('tub');
        this._prompt('じゃぐちを ひねって おゆを ためよう', 'tap');
        this._cueAt(this._world(this.mixer, 0.232, 0.70, 0.27), 0.075);
        ctx.baby?.lookAt?.(this._world(this.mixer, 0.232, 0.66, 0.27));
        break;
      case 'temper':
        this._prompt('あかと あおの ノブで ちょうどいい おんどに', 'temp');
        this._cueAt(this._world(this.mixer, 0, 0.60, 0), 0.13);
        break;
      case 'test':
        this._prompt('てで おゆを さわって たしかめよう', 'hand');
        this._cueAt(this._world(this.bowl, 0.0, this.water.surfaceY + 0.02, 0.06), 0.11);
        break;
      case 'wash':
        this._prompt('ごしごし きれいに あらってあげよう', 'sponge');
        this._cueAt(this._babyPoint('body'), 0.11);
        this.foam.setBubbleRate(this.tier >= 1 ? 1.2 : 0.4);
        this._goTo('bath-face');
        break;
      case 'shampoo':
        this._prompt('シャンプーを おして あたまを あわあわに', 'shampoo');
        this._cueAt(this._world(this.shampoo, 0.02, 0.23, 0), 0.06);
        break;
      case 'rinse':
        // bring the head to hand rather than leaving it on its dock
        this.showerHead.position.set(-0.26, STAND_H + 0.50, 0.10);
        this._prompt('シャワーで あわを ながそう', 'shower');
        this._cueAt(this.showerHead.getWorldPosition(new THREE.Vector3()), 0.08);
        this.foam.setBubbleRate(0.4);
        break;
      case 'dry':
        this._prompt('タオルで ふきふき しよう', 'towel');
        this._cueAt(this.towelHome, 0.10);
        this._goTo('bath-dry');
        break;
      case 'dryer':
        this._prompt('ドライヤーで かわかそう', 'dryer');
        this.dryer.visible = true;
        this._cueAt(this._world(this.caddy, 0.03, 0.44, -0.055), 0.075);
        break;
      case 'done':
        this._prompt('ぴかぴか！ つぎは おきがえ しようね', 'star');
        this._cueHide();
        break;
    }
  }

  _cueAt(worldPos, radius = 0.09) {
    this.cue.visible = true;
    this.cue.position.copy(worldPos);
    this.cue.scale.setScalar(radius / 0.055);
    this._cueT = 0;
  }

  _cueHide() { this.cue.visible = false; }

  /* ============================================================ input === */

  onPointer(p) {
    if (!this.root) return;
    if (p.type === 'up') { this._endDrag(); return; }
    this._updateRay(p);
    if (p.type === 'down') this._onDown(p);
    else if (this._drag) this._onDragMove(p);
  }

  _updateRay(p) {
    const dom = this.ctx.renderer?.domElement;
    if (!dom) return;
    const r = dom.getBoundingClientRect();
    _ndc.set(((p.x - r.left) / r.width) * 2 - 1, -((p.y - r.top) / r.height) * 2 + 1);
    this._ray ||= new THREE.Raycaster();
    this._ray.setFromCamera(_ndc, this.ctx.camera);
  }

  /** Generous invisible hit sphere — small parts need fat targets for a 4yo. */
  _hitSphere(worldPos, radius) {
    if (!this._ray) return false;
    this._sphere ||= new THREE.Sphere();
    this._sphere.set(worldPos, radius);
    return this._ray.ray.intersectsSphere(this._sphere);
  }

  _hitBaby() {
    const g = this.ctx.baby?.group;
    if (!g || !this._ray) return null;
    const hits = this._ray.intersectObject(g, true);
    return hits.length ? hits[0] : null;
  }

  _hitWater() {
    if (!this._ray) return null;
    const hits = this._ray.intersectObject(this.water.mesh, false);
    return hits.length ? hits[0].point : null;
  }

  /** Where the pointer crosses a vertical plane through the baby. */
  _planePoint(zWorld) {
    if (!this._ray) return null;
    this._plane ||= new THREE.Plane();
    this._plane.set(new THREE.Vector3(0, 0, 1), -zWorld);
    const out = new THREE.Vector3();
    return this._ray.ray.intersectPlane(this._plane, out) ? out : null;
  }

  _onDown(p) {
    const ctx = this.ctx;
    ctx.audio?.unlock?.();
    this._lastPointerY = p.y;

    switch (this.phase) {
      case 'undress':
        if (this._hitBaby()) this._undress();
        return;

      case 'fill':
      case 'temper':
      case 'test': {
        if (this._hitSphere(this._world(this.mixer, -0.115, 0.522, 0), 0.075)) {
          this._turnKnob(+1); return;
        }
        if (this._hitSphere(this._world(this.mixer, 0.115, 0.522, 0), 0.075)) {
          this._turnKnob(-1); return;
        }
        if (this._hitSphere(this._world(this.mixer, 0.19, 0.70, 0.22), 0.13)) {
          this._toggleTap(); return;
        }
        const wp = this._hitWater();
        if (wp && this.water.level > 0.02) {
          this._touchWater(wp);
          return;
        }
        return;
      }

      case 'wash':
      case 'shampoo': {
        if (this._hitSphere(this._world(this.shampoo, 0.015, 0.215, 0), 0.075)) {
          this._pumpShampoo(); return;
        }
        if (this.duck.visible &&
            this._hitSphere(this.duck.getWorldPosition(_v3), 0.075)) {
          this._pokeDuck(); return;
        }
        const hit = this._hitBaby();
        if (hit) { this._drag = 'scrub'; this._scrub(hit.point, p); return; }
        const wp = this._hitWater();
        if (wp) { this._splashPlay(wp); return; }
        return;
      }

      case 'rinse':
        this._drag = 'shower';
        this._moveShower(p);
        return;

      case 'dry':
        this._drag = 'towel';
        this._moveTowel(p);
        return;

      case 'dryer':
        if (this._hitSphere(this._world(this.caddy, 0.03, 0.40, -0.055), 0.11)) {
          this._useDryer();
        }
        return;
    }
  }

  _onDragMove(p) {
    if (this._drag === 'scrub') {
      const hit = this._hitBaby();
      if (hit) this._scrub(hit.point, p);
      else {
        const wp = this._hitWater();
        if (wp) this._splashPlay(wp);
      }
    } else if (this._drag === 'shower') {
      this._moveShower(p);
    } else if (this._drag === 'towel') {
      this._moveTowel(p);
    }
    this._lastPointerY = p.y;
  }

  _endDrag() {
    if (this._drag === 'shower') this.sprayUniforms.uOn.value = 0;
    this._drag = null;
    this._lastPointerY = null;
  }

  /* ------------------------------------------------------- 1. undress --- */

  _undress() {
    const ctx = this.ctx;
    if (this._undressing) return;
    this._undressing = true;
    this._sfx('whoosh');
    this._sfx('pop');

    const stained = !!(ctx.state?.clothesStains?.length) || (this.dirt.body ?? 0) > 0.25;
    const chest = this._babyPoint('body');

    // a real little garment, tumbling into the basket
    const geo = roundedBox(0.13, 0.10, 0.05, 0.024, 4);
    this._disposables.push(geo);
    const mat = this._materials(MAT.makeCloth({
      color: stained ? 0xe9dcc8 : 0xbfe4ff, weave: 'knit', threads: 70, repeat: 2, seed: 91
    }));
    const cloth = new THREE.Mesh(geo, mat);
    cloth.position.copy(chest);
    cloth.castShadow = true;
    this.root.add(cloth);
    this._flying.push({
      obj: cloth, t: 0,
      from: chest.clone(),
      to: this._world(this.basket, 0, 0.16, 0),
      spin: new THREE.Vector3(2.4, 3.1, 1.7)
    });

    ctx.baby?.setOutfit?.({ top: null, bottom: null, socks: null, shoes: null, hat: null, bib: null });
    ctx.baby?.setMood?.('excited');
    ctx.baby?.gesture?.('wave');
    ctx.state?.patch?.({ naked: true, clothesStains: [] });
    this._toast(stained ? 'よごれた おふく、せんたくかごへ！' : 'おふくを かごに いれたよ');
    this._sfx('giggle');

    this._after(0.9, () => {
      if (!this.root) return;
      this._undressing = false;
      this.ctx.baby?.setMood?.('neutral');
      this._setPhase('fill');
    }, 'undress');
  }

  /* ---------------------------------------------------------- 2. fill --- */

  _toggleTap() {
    if (this.water.levelTarget >= 1 && !this.filling) {
      this._setPhase('test');
      return;
    }
    this.filling = !this.filling;
    this._sfx(this.filling ? 'pour' : 'tap');
    this.water.setLevel(this.filling ? 1 : this.water.level);
    if (this.filling) {
      this._setPhase('temper');
      this._cueAt(this._world(this.mixer, 0, 0.60, 0), 0.13);
    }
  }

  _turnKnob(dir) {
    this.temp = THREE.MathUtils.clamp(this.temp + dir * 0.16, 0, 1);
    this.water.setTemperature(this.temp);
    const knob = dir > 0 ? this.knobHot : this.knobCold;
    knob.rotation.y += dir * 0.8;
    knob.scale.setScalar(1.22);
    this._sfx('tap');
    const good = this.temp >= TEMP_OK_MIN && this.temp <= TEMP_OK_MAX;
    if (good && !this._tempGood) {
      this._tempGood = true;
      this._sfx('chime');
      this._toast('ちょうど いい おんど！');
      if (this.water.levelTarget >= 1 && this.water.level > 0.9) this._setPhase('test');
    } else if (!good) {
      this._tempGood = false;
    }
    this.ctx.baby?.lookAt?.(this._world(this.mixer, 0, 0.55, 0));
  }

  _touchWater(worldPoint) {
    const local = this.bowl.worldToLocal(worldPoint.clone());
    this.water.disturb(local.x, local.z, 0.075, 0.011);
    this.ctx.fx?.burst?.('splash', worldPoint, 6);
    this._sfx('splash');

    if (this.phase === 'test' || (this.water.level > 0.85 && this.phase !== 'wash')) {
      if (this.temp > TEMP_OK_MAX) {
        this.ctx.baby?.setMood?.('surprised');
        this.ctx.baby?.say?.('hot');
        this._toast('あちち！ すこし さまそう');
        this.ctx.fx?.burst?.('steam', this._world(this.bowl, 0, this.water.surfaceY + 0.05, 0), 14);
        this._sfx('sadBaby');
        this._setPhase('temper');
      } else if (this.temp < TEMP_OK_MIN) {
        this.ctx.baby?.setMood?.('sulk');
        this.ctx.baby?.gesture?.('shiver');
        this._toast('つめたい！ すこし あたためよう');
        this._sfx('shiver');
        this._setPhase('temper');
      } else {
        this._sfx('chime');
        this._toast('いい おゆだね、ざぶーん！');
        this._enterTub();
      }
      this._moodResetSoon();
    }
  }

  _enterTub() {
    const b = this.ctx.baby;
    if (!b?.group) return;
    this.filling = false;
    this._cueHide();
    b.setMood?.('excited');
    this._hopFrom = b.group.position.clone();
    this._hopTo = this._world(this.bowl, 0.015, PROFILE[0][1] - 0.004, 0.0);
    this._hopT = 0;
  }

  _finishHop() {
    const b = this.ctx.baby;
    this._hopT = -1;
    this._placeBabyInTub();
    this.water.disturb(0, 0, 0.20, 0.020);
    this.water.stir(0, 0, 0.16, 0.010);
    this.ctx.fx?.burst?.('splash', this._world(this.bowl, 0, this.water.surfaceY, 0.04), 18);
    this.foam.spawnBubbles(this._world(this.bowl, 0, this.water.surfaceY, 0.04), 5, 0.09);
    this._sfx('splash');
    this._sfx('giggle');
    b?.setMood?.('giggle');
    for (const f of this.floaters) f.obj.visible = true;
    this._setPhase('wash');
    this._moodResetSoon();
  }

  /* ---------------------------------------------------------- 3. wash --- */

  _pumpShampoo() {
    this.shampooUsed = true;
    this._pumpPress = 1;
    this._sfx('bubble');
    this._sfx('pop');
    const head = this._babyPoint('head');
    this.foam.seed('head', 5, this.foam.headRadius * 0.6, this.foam.headRadius * 0.55, 0.014);
    this.ctx.fx?.burst?.('bubble', this._world(this.shampoo, 0.045, 0.222, 0), 5);
    this.ctx.baby?.setFoam?.('hair', 0.25);
    this.ctx.baby?.lookAt?.(this._world(this.shampoo, 0, 0.22, 0));
    this._prompt('あたまを ごしごし！ うえに なでると ツノさん', 'sponge');
    this._cueAt(head, 0.10);
    this._setPhase('wash');
  }

  _pokeDuck() {
    this._sfx('quack');
    const f = this.floaters[0];
    f.vy = 0.55;
    f.spinKick = 4.0;
    const p = this.duck.getWorldPosition(new THREE.Vector3());
    const local = this.bowl.worldToLocal(p.clone());
    this.water.disturb(local.x, local.z, 0.07, 0.010);
    this.ctx.fx?.burst?.('splash', p, 5);
    this.ctx.baby?.setMood?.('giggle');
    this.ctx.state?.patch?.({});
    this._moodResetSoon();
  }

  _splashPlay(worldPoint) {
    const now = this.time;
    if (now - this._lastScrub < 0.14) return;
    this._lastScrub = now;
    const local = this.bowl.worldToLocal(worldPoint.clone());
    this.water.disturb(local.x, local.z, 0.055, 0.008);
    this.water.stir(local.x, local.z, 0.05, 0.004);
    this.ctx.fx?.burst?.('splash', worldPoint, 3);
    this.foam.spawnBubbles(worldPoint, 1, 0.04);
    if (this.rand() < 0.25) this._sfx('bubble');
  }

  _scrub(worldPoint, p) {
    const ctx = this.ctx;
    const now = this.time;
    const head = this._babyPoint('head');
    const dHead = worldPoint.distanceTo(head);
    const headR = this.foam.headRadius;

    // the sponge rides the pointer
    this.sponge.parent === this.caddy && this.tub.attach(this.sponge);
    this.sponge.position.copy(this.tub.worldToLocal(worldPoint.clone()));
    this.sponge.position.y += 0.03;

    // --- upward stroke on a lathered head sculpts the horn --------------
    if (this._lastPointerY != null && p) {
      const dy = this._lastPointerY - p.y;          // screen-up is positive
      if (dy > 0.5) this._scrubStrokeUp = Math.min(1, this._scrubStrokeUp + dy * 0.010);
      else if (dy < -0.5) this._scrubStrokeUp = Math.max(0, this._scrubStrokeUp + dy * 0.004);
    }

    if (now - this._lastScrub < 0.07) return;
    this._lastScrub = now;

    if (this.shampooUsed && dHead < headR * 2.6) {
      this.foam.add('head', worldPoint, 0.020, 0.032);
      // a second, offset dab so one pass over the crown actually covers it
      _v.copy(worldPoint).add(_v2.set(
        (this.rand() - 0.5) * headR * 0.9,
        (this.rand() - 0.2) * headR * 0.5,
        (this.rand() - 0.5) * headR * 0.9));
      this.foam.add('head', _v, 0.014, 0.030);
      ctx.fx?.burst?.('bubble', worldPoint, 2);
      this.dirt.hair = Math.max(0, this.dirt.hair - 0.14);
      ctx.baby?.setDirt?.('hair', this.dirt.hair);
      ctx.baby?.setFoam?.('hair', Math.min(1, this.foam.density('head') * 3));
      if (this._scrubStrokeUp > 0.25 && this.foam.density('head') > 0.09) {
        this.foam.setHorn(Math.min(1, this.foam.hornTarget + 0.09));
        ctx.fx?.burst?.('sparkle', head.clone().setY(head.y + headR * 1.6), 2);
        if (this.foam.hornAmount > 0.5 && !this._hornCheered) {
          this._hornCheered = true;
          this._toast('ツノつの あわヘア！');
          this._sfx('chime');
          ctx.baby?.setMood?.('giggle');
          ctx.ui?.star?.(1);
          this._moodResetSoon();
        }
      }
      this._sfx('squeak');
      return;
    }

    // --- body: dirt comes off where the cause put it --------------------
    const zone = this._zoneFor(worldPoint);
    if (zone && this.dirt[zone] > 0) {
      this.dirt[zone] = Math.max(0, this.dirt[zone] - 0.13);
      ctx.baby?.setDirt?.(zone, this.dirt[zone]);
      ctx.fx?.burst?.('bubble', worldPoint, 2);
      this._sfx('squeak');
      if (this.dirt[zone] === 0) {
        ctx.fx?.burst?.('sparkle', worldPoint, 5);
        this._sfx('chime');
      }
    }
    const region = zone === 'hands'
      ? (worldPoint.distanceTo(this._babyPoint('handL')) < worldPoint.distanceTo(this._babyPoint('handR')) ? 'handL' : 'handR')
      : 'body';
    this.foam.add(region, worldPoint, 0.014, 0.026);
    ctx.baby?.setFoam?.('body', Math.min(1, this.foam.density('body') * 3));

    this._checkWashDone();
  }

  _zoneFor(worldPoint) {
    const cands = [
      ['face', this._babyPoint('mouth'), 0.075],
      ['hair', this._babyPoint('head'), 0.085],
      ['hands', this._babyPoint('handL'), 0.060],
      ['hands', this._babyPoint('handR'), 0.060],
      ['body', this._babyPoint('body'), 0.13]
    ];
    let best = null, bestD = 1e9;
    for (const [zone, p, r] of cands) {
      const d = worldPoint.distanceTo(p);
      if (d < r && d < bestD) { bestD = d; best = zone; }
    }
    if (!best) {
      // below the body centre is the legs and feet
      const body = this._babyPoint('body');
      if (worldPoint.y < body.y - 0.05) return 'feet';
    }
    return best;
  }

  _checkWashDone() {
    if (this.phase !== 'wash') return;
    const dirty = Object.values(this.dirt).reduce((a, b) => a + b, 0);
    if (dirty > 0.05) return;
    if (!this.shampooUsed) {
      if (!this._shampooHinted) {
        this._shampooHinted = true;
        this._setPhase('shampoo');
        this._sfx('chime');
      }
      return;
    }
    if (this.foam.density('head') > 0.10) {
      this._sfx('chime');
      this._setPhase('rinse');
      this.showerHead.position.copy(this.showerHome);
    }
  }

  /* --------------------------------------------------------- 4. rinse --- */

  _moveShower(p) {
    const babyP = this._babyPoint('body');
    const plane = this._planePoint(babyP.z + 0.16);
    if (!plane) return;
    const local = this.tub.worldToLocal(plane.clone());
    local.y = THREE.MathUtils.clamp(local.y, STAND_H + 0.24, STAND_H + 0.72);
    local.x = THREE.MathUtils.clamp(local.x, -0.44, 0.44);
    this.showerHead.position.lerp(local, 0.5);
    this.showerHead.rotation.z = THREE.MathUtils.clamp(-local.x * 0.6, -0.5, 0.5);
    this.spray.visible = true;
    this.sprayUniforms.uOn.value = 1;
  }

  _rinseStep(dt) {
    if (this._drag !== 'shower') {
      this.sprayUniforms.uOn.value *= Math.max(0, 1 - dt * 6);
      this.spray.visible = this.sprayUniforms.uOn.value > 0.02;
      return;
    }
    const headW = this.showerHead.getWorldPosition(_v);
    // The jet is a widening cone, so sample it at three stations down its
    // length. Foam only leaves where the water actually reaches — aiming is
    // the whole mechanic.
    let removed = 0;
    const target = _v2.copy(headW).setY(headW.y - 0.22);
    for (let i = 0; i < 3; i++) {
      const drop = 0.09 + i * 0.11;
      _v3.copy(headW).setY(headW.y - drop);
      const r = 0.075 + drop * 0.28;
      removed += this.foam.rinse(_v3, r, dt, 0.34);
      this.droplets.wipe(_v3, r * 0.45);
    }

    if (this.time - (this._lastRinseFx || 0) > 0.09) {
      this._lastRinseFx = this.time;
      this.ctx.fx?.burst?.('splash', target, 3);
      if (removed > 0) this.ctx.fx?.burst?.('bubble', target, 2);
      if (this.rand() < 0.22) this._sfx('bubble');
    }

    // the jet hits the water and rings it
    const localHead = this.bowl.worldToLocal(headW.clone());
    if (Math.abs(localHead.x) < HALF_X && Math.abs(localHead.z) < HALF_Z) {
      this.water.stir(localHead.x, localHead.z, 0.06, 0.0035);
    }

    // Once the hair is clear, whatever is left slides off into the water on
    // its own. No fail states — a four-year-old must never get stuck hunting
    // the last blob of foam.
    if (this.foam.density('head') < 0.03) this.foam.dissolve(dt, 0.035);

    if (this.phase === 'rinse' && this.foam.total() < 0.02 && this.foam.blobs.length === 0) {
      this._sfx('chime');
      this.ctx.baby?.setMood?.('happy');
      this._leaveTub();
    }
  }

  _leaveTub() {
    const ctx = this.ctx;
    this.sprayUniforms.uOn.value = 0;
    this.spray.visible = false;
    this.showerHead.position.copy(this.showerHome);
    this._placeBabyOnMat();
    ctx.baby?.setMood?.('happy');
    ctx.baby?.gesture?.('shiver');
    this._goTo('bath-dry');
    this.wet = 1;
    ctx.baby?.setWet?.(1);
    this._applyWetSkin(1);
    this.droplets.fill(this.anchors, 1);
    this.wetStrands.visible = true;
    this.sneezeTimer = 7;
    this._sfx('splash');
    ctx.state?.patch?.({ wet: true });
    // the tub empties behind them
    this.water.setLevel(0.18);
    this.foam.setBubbleRate(0);
    for (const f of this.floaters) f.obj.visible = true;
    this._setPhase('dry');
  }

  /* ----------------------------------------------------------- 5. dry --- */

  _moveTowel(p) {
    const babyP = this._babyPoint('body');
    const plane = this._planePoint(babyP.z + 0.20);
    if (!plane) return;
    if (this.towel.parent !== this.root) this.root.attach(this.towel);
    this.towel.position.lerp(plane, 0.55);
    this.towel.rotation.set(0.15, Math.sin(this.time * 3) * 0.12, Math.sin(this.time * 5) * 0.10);

    const wiped = this.droplets.wipe(plane, 0.085);
    if (wiped > 0) {
      this._sfx('squeak');
      this.ctx.fx?.burst?.('sparkle', plane, wiped * 2);
      this.sneezeTimer = 7;
      this.wet = Math.max(0, this.droplets.count / 26);
      this.ctx.baby?.setWet?.(Math.max(0.25, this.wet));
      this._applyWetSkin(Math.max(0.25, this.wet));
      if (this.droplets.count === 0) {
        this._sfx('chime');
        this.ctx.baby?.setMood?.('happy');
        this._setPhase('dryer');
      }
    }
  }

  _useDryer() {
    const ctx = this.ctx;
    this.dryerBlast = 1.6;
    this._sfx('dryer');
    this._sfx('hairFlutter');
    const head = this._babyPoint('head');
    this.dryer.visible = true;
    this.root.attach(this.dryer);
    this.dryer.position.copy(head).add(new THREE.Vector3(-0.26, 0.10, 0.16));
    this.dryer.lookAt(head);
    this.dryer.rotateX(Math.PI / 2);
    ctx.baby?.setMood?.('happy');
    this._cueHide();
    this._after(1.5, () => {
      if (!this.root || this.phase !== 'dryer') return;
      this._finish();
    }, 'dryer');
  }

  _finish() {
    const ctx = this.ctx;
    this.wet = 0;
    ctx.baby?.setWet?.(0);
    this._applyWetSkin(0);
    this.wetStrands.visible = false;
    this.dryer.visible = false;
    this.droplets.clear();
    ctx.state?.patch?.({ wet: false, naked: true });
    try { ctx.state?.patch?.({ meters: { clean: 1 } }); } catch (e) { /**/ }
    ctx.ui?.meter?.('clean', 1);
    ctx.ui?.star?.(3);
    ctx.baby?.setMood?.('happy');
    ctx.baby?.gesture?.('clap');
    this._sfx('tada');
    const head = this._babyPoint('head');
    ctx.fx?.burst?.('sparkle', head, 18);
    ctx.fx?.burst?.('star', head, 8);
    ctx.fx?.burst?.('confetti', head, 14);
    this._setPhase('done');
  }

  _moodResetSoon(seconds = 1.6) {
    this._after(seconds, () => {
      if (this.root && this.phase !== 'done') this.ctx.baby?.setMood?.('neutral');
    }, 'mood');
  }

  /* -------------------------------------------------------- wet skin ---- */

  _applyWetSkin(amount) {
    const g = this.ctx.baby?.group;
    if (!g) return;
    g.traverse(o => {
      const m = o.material;
      if (!m) return;
      const list = Array.isArray(m) ? m : [m];
      for (const mm of list) {
        // already-wet surfaces (cornea, eyes, vinyl) must not be "wetted"
        if (!mm || mm.userData?.noWetness) continue;
        if (mm.transmission > 0.3) continue;
        if ((mm.userData?._dryRoughness ?? mm.roughness ?? 1) < 0.18) continue;
        this._touchedMaterials.add(mm);
        MAT.applyWetness(mm, amount);
      }
    });
  }

  /* ============================================================ update == */

  update(dt) {
    if (!this.root) return;
    const ctx = this.ctx;
    this.time += dt;
    this._tickTimers(dt);
    ctx.baby?.group?.updateMatrixWorld?.();

    this._syncAnchors();

    /* --- filling ------------------------------------------------------- */
    if (this.filling && this.water.level < 0.999) {
      this.stream.setFlow(1);
      const impactY = this.water.surfaceY;
      this.stream.setPath(this.spoutTip, _v.set(this.spoutTip.x, impactY, this.spoutTip.z));
      this.water.stir(this.spoutTip.x, this.spoutTip.z, 0.05, 0.0075 * dt * 60);
      if (this.rand() < dt * 3) {
        ctx.fx?.burst?.('splash', this._world(this.bowl, this.spoutTip.x, impactY, this.spoutTip.z), 2);
      }
      if (this.time - (this._lastPour || 0) > 0.9) { this._lastPour = this.time; this._sfx('pour'); }
      if (this.water.level >= 0.985) {
        this.filling = false;
        this._sfx('chime');
        this._setPhase('test');
      }
    } else {
      this.stream.setFlow(Math.max(0, this.stream.flow - dt * 4));
    }
    this.stream.update(dt);

    /* --- water --------------------------------------------------------- */
    this.water.update(dt, ctx);
    this.water.setFoamRim(Math.min(1, this.foam.total() * 1.4));

    /* --- steam --------------------------------------------------------- */
    const heat = THREE.MathUtils.clamp((this.temp - 0.45) / 0.5, 0, 1);
    const steamAmt = this.water.level > 0.05
      ? THREE.MathUtils.clamp(0.16 + heat * 0.95, 0, 1) * Math.min(1, this.water.level * 2)
      : 0;
    this.steam.setBase(this.water.surfaceY);
    this.steam.setAmount(this._steamOverride ?? steamAmt);
    this.steam.update(dt);
    if ((this._steamOverride ?? steamAmt) > 0.55 && this.rand() < dt * 2.2) {
      ctx.fx?.burst?.('steam', this._world(
        this.bowl, (this.rand() - 0.5) * HALF_X, this.water.surfaceY + 0.03, (this.rand() - 0.5) * HALF_Z), 2);
    }

    /* --- gauge --------------------------------------------------------- */
    this.knobHot.scale.lerp(_v.set(1, 1, 1), Math.min(1, dt * 7));
    this.knobCold.scale.lerp(_v.set(1, 1, 1), Math.min(1, dt * 7));
    if (this.gaugeBead) {
      const gx = 0.09 + (this.temp - 0.5) * 0.104;
      this.gaugeBead.position.set(gx, 0.1605, 0.2985);
      const good = this.temp >= TEMP_OK_MIN && this.temp <= TEMP_OK_MAX;
      this.gaugeBead.scale.setScalar(good ? 1.0 + Math.sin(this.time * 6) * 0.08 : 1.0);
    }
    if (this._pumpPress > 0) {
      this._pumpPress = Math.max(0, this._pumpPress - dt * 5);
      this.pump.position.y = 0.186 - this._pumpPress * 0.014;
    }

    /* --- hop into the tub ---------------------------------------------- */
    if (this._hopT >= 0) {
      this._hopT = Math.min(1, this._hopT + dt * 1.5);
      const k = this._hopT;
      const b = ctx.baby;
      if (b?.group) {
        b.group.position.lerpVectors(this._hopFrom, this._hopTo, k * k * (3 - 2 * k));
        b.group.position.y += Math.sin(k * Math.PI) * 0.22;
        b.group.rotation.y = THREE.MathUtils.lerp(
          this.tub.rotation.y + 0.30, this.tub.rotation.y + 0.16, k);
      }
      if (k >= 1) this._finishHop();
    }

    /* --- clothes flying to the basket ---------------------------------- */
    for (let i = this._flying.length - 1; i >= 0; i--) {
      const f = this._flying[i];
      f.t = Math.min(1, f.t + dt * 1.3);
      const k = f.t;
      f.obj.position.lerpVectors(f.from, f.to, k * k);
      f.obj.position.y += Math.sin(k * Math.PI) * 0.34 * (1 - k * 0.4);
      f.obj.rotation.x += f.spin.x * dt;
      f.obj.rotation.y += f.spin.y * dt;
      f.obj.rotation.z += f.spin.z * dt;
      if (k >= 1) {
        ctx.fx?.burst?.('dust', f.to, 4);
        this._sfx('pofu');
        f.obj.visible = false;
        this._flying.splice(i, 1);
      }
    }

    /* --- floating toys ride the real heightfield ----------------------- */
    const submerged = this.water.level > 0.06;
    for (const f of this.floaters) {
      if (!f.obj.visible) continue;
      const surf = this.water.heightAt(f.x, f.z);
      const rest = surf - f.buoy;
      if (f.vy !== 0 || Math.abs(f.obj.position.y - rest) > 0.0005) {
        f.vy -= 5.6 * dt;
        f.obj.position.y += f.vy * dt;
        if (f.obj.position.y <= rest) {
          f.obj.position.y = rest;
          f.vy = Math.abs(f.vy) > 0.12 ? -f.vy * 0.32 : 0;
          if (Math.abs(f.vy) > 0.15) {
            this.water.disturb(f.x, f.z, 0.05, 0.006);
            this.ctx.fx?.burst?.('splash', f.obj.getWorldPosition(_v3), 3);
          }
        }
      } else {
        f.obj.position.y = rest;
      }
      // slow drift + tilt with the slope of the water
      f.x += Math.sin(this.time * 0.23 + f.driftPhase) * dt * 0.012;
      f.z += Math.cos(this.time * 0.19 + f.driftPhase) * dt * 0.009;
      f.x = THREE.MathUtils.clamp(f.x, -HALF_X * 0.72, HALF_X * 0.72);
      f.z = THREE.MathUtils.clamp(f.z, -HALF_Z * 0.66, HALF_Z * 0.66);
      f.obj.position.x = f.x;
      f.obj.position.z = f.z;
      const s = this.water.slopeAt(f.x, f.z);
      f.obj.rotation.x = THREE.MathUtils.lerp(f.obj.rotation.x, -s.y * 2.6, 0.2);
      f.obj.rotation.z = THREE.MathUtils.lerp(f.obj.rotation.z, s.x * 2.6, 0.2);
      f.ry += (f.spin + (f.spinKick || 0)) * dt * 0.25;
      f.spinKick = (f.spinKick || 0) * Math.max(0, 1 - dt * 3);
      f.obj.rotation.y = f.ry;
      f.obj.visible = submerged || this.phase === 'wash';
    }

    /* --- sustained splash (harness + big entries) ----------------------- */
    if (this._splashPulse > 0) {
      this._splashPulse -= dt;
      if (this.rand() < dt * 26) {
        const c = this._world(this.bowl,
          (this.rand() - 0.5) * HALF_X * 1.2, this.water.surfaceY + 0.02,
          (this.rand() - 0.5) * HALF_Z * 1.2);
        ctx.fx?.burst?.('splash', c, 4);
        const l = this.bowl.worldToLocal(c.clone());
        this.water.disturb(l.x, l.z, 0.05, 0.009);
      }
    }

    /* --- foam ---------------------------------------------------------- */
    this.foam.update(dt, ctx);
    if (this._scrubStrokeUp > 0) this._scrubStrokeUp = Math.max(0, this._scrubStrokeUp - dt * 0.35);

    /* --- waterlines ---------------------------------------------------- */
    this._updateWaterlines(dt);

    /* --- shower / hose ------------------------------------------------- */
    this._updateHose();
    this.sprayUniforms.uTime.value = this.time;
    if (this.phase === 'rinse') this._rinseStep(dt);

    /* --- droplets & the sneeze ----------------------------------------- */
    this.droplets.update(dt, this.time);
    if (this.phase === 'dry' && this.droplets.count > 0) {
      this.sneezeTimer -= dt;
      if (this.sneezeTimer <= 0) {
        this.sneezeTimer = 7;
        this._sfx('sneeze');
        ctx.baby?.setMood?.('surprised');
        ctx.baby?.gesture?.('shiver');
        ctx.fx?.burst?.('splash', this._babyPoint('mouth'), 6);
        this._toast('ハックション！ ふきのこしが あるよ');
        this._moodResetSoon();
      }
    }

    /* --- hairdryer blast ----------------------------------------------- */
    if (this.dryerBlast > 0) {
      this.dryerBlast -= dt;
      const head = this._babyPoint('head');
      if (this.rand() < dt * 14) {
        ctx.fx?.burst?.('sparkle', head, 1);
        ctx.fx?.burst?.('dust', head, 1);
      }
      this.wetStrands.rotation.z = Math.sin(this.time * 22) * 0.28;
      const w = Math.max(0, this.dryerBlast / 1.6);
      this._applyWetSkin(w * 0.9);
      ctx.baby?.setWet?.(w * 0.9);
      if (this.wetStrands.visible && w < 0.25) this.wetStrands.visible = false;
    }

    /* --- wet strands follow the head ----------------------------------- */
    if (this.wetStrands.visible) {
      const a = this.anchors.get('head');
      this.wetStrands.position.copy(a.position);
      this.wetStrands.quaternion.copy(a.quaternion);
      this.wetStrands.scale.setScalar(this.foam.headRadius / 0.068);
    }

    /* --- sponge returns home ------------------------------------------- */
    if (this._drag !== 'scrub' && this.sponge.parent === this.tub) {
      const home = this.tub.worldToLocal(
        this.caddy.localToWorld(this.spongeHome.clone()));
      this.sponge.position.lerp(home, Math.min(1, dt * 3));
      if (this.sponge.position.distanceTo(home) < 0.02) {
        this.caddy.attach(this.sponge);
        this.sponge.position.copy(this.spongeHome);
        this.sponge.rotation.copy(this.spongeRot);
      }
    }

    /* --- towel returns to the rail ------------------------------------- */
    if (this._drag !== 'towel' && this.towel.parent === this.root && this.phase !== 'dry') {
      this.towelParent.attach(this.towel);
      this.towel.position.set(-0.02, 0.655, 0);
      this.towel.rotation.set(0, 0, 0);
    }

    /* --- attention cue ------------------------------------------------- */
    if (this.cue.visible) {
      this._cueT = (this._cueT || 0) + dt;
      const b = Math.sin(this._cueT * 3.2);
      this.cue.rotation.y += dt * 0.9;
      this.cueChevron.position.y = 0.075 + b * 0.016;
      this.cueMat.opacity = 0.45 + 0.35 * (0.5 + b * 0.5);
    }
  }

  _syncAnchors() {
    const b = this.ctx.baby;
    const q = b?.group?.quaternion;
    const set = (id, pos) => {
      const a = this.anchors.get(id);
      if (!a || !pos) return;
      a.position.copy(pos);
      if (q) a.quaternion.copy(q);
      a.updateMatrixWorld();
    };
    set('head', this._babyPoint('head'));
    set('body', this._babyPoint('body'));
    set('handL', this._babyPoint('handL'));
    set('handR', this._babyPoint('handR'));
    const w = this.anchors.get('water');
    if (w) {
      this.bowl.updateMatrixWorld();
      w.position.copy(this._world(this.bowl, 0, this.water.surfaceY, 0));
      w.quaternion.copy(this.tub.quaternion);
      w.updateMatrixWorld();
    }
  }

  _updateWaterlines(dt) {
    const wet = this.inTub && this.water.level > 0.08;
    const foam = Math.min(1, this.foam.total() * 1.6 + 0.2);
    const pts = [
      this._babyPoint('body'),
      this._babyPoint('handL'),
      this._babyPoint('handR')
    ];
    const radii = [0.115, 0.048, 0.048];
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (!wet) { r.set(_v.set(0, -10, 0), 0.1, 0, 0, this.time); continue; }
      const p = pts[i];
      const local = this.bowl.worldToLocal(p.clone());
      const h = this.water.heightAt(local.x, local.z);
      const surf = this._world(this.bowl, local.x, h, local.z);
      // only ring a limb that actually breaks the surface
      const depth = surf.y - (p.y - radii[i] * 1.4);
      const vis = THREE.MathUtils.clamp(depth / 0.05, 0, 1)
                * THREE.MathUtils.clamp((p.y + radii[i] * 1.4 - surf.y) / 0.05, 0, 1);
      r.set(_v3.set(p.x, surf.y + 0.0015, p.z), radii[i], vis * 0.95, foam, this.time);
    }
  }

  _updateHose() {
    const head = this.showerHead;
    head.updateMatrixWorld();
    const a = _v.set(-0.47, 0.055, -0.43);                    // wall inlet, tub space
    const d = _v2.set(head.position.x, head.position.y + 0.11, head.position.z);
    const slack = 0.18 + d.distanceTo(a) * 0.12;
    this.hose.update((t, out) => {
      // a hanging hose: catenary-ish sag plus a lazy sideways bow
      out.lerpVectors(a, d, t);
      const bow = Math.sin(t * Math.PI);
      out.y -= bow * slack;
      out.z -= bow * 0.06;
      out.x -= bow * 0.05;
    });
  }

  /* =========================================================== harness == */

  /**
   * Screenshot / critic control surface.
   * Keys: water 0..1, foam 0..1, bubbles bool, steam bool, splash bool,
   *       wet 0..1, temp 0..1, phase string.
   */
  onState(patch) {
    if (!patch || !this.root) return;
    const ctx = this.ctx;

    if (patch.temp !== undefined) {
      this.temp = THREE.MathUtils.clamp(patch.temp, 0, 1);
      this.water.setTemperature(this.temp);
    }

    if (patch.water !== undefined) {
      const v = THREE.MathUtils.clamp(patch.water, 0, 1);
      this.water.setLevel(v, true);
      this.filling = v > 0.04 && v < 0.96;
      this.stream.setFlow(this.filling ? 1 : 0);
      if (v >= 0.5) {
        this._placeBabyInTub();
        for (const f of this.floaters) { f.obj.visible = true; f.obj.position.y = this.water.heightAt(f.x, f.z) - f.buoy; }
        if (this.phase === 'undress' || this.phase === 'fill' || this.phase === 'temper' || this.phase === 'test') {
          this.phase = 'wash';
          this._cueHide();
        }
      } else {
        for (const f of this.floaters) f.obj.visible = v > 0.06;
        if (v < 0.05) {
          this._steamOverride = null;
          if (this.inTub) this._placeBabyOnMat();
        }
      }
      if (this.temp < 0.3 && patch.steam) { this.temp = 0.82; this.water.setTemperature(this.temp); }
    }

    if (patch.foam !== undefined) {
      const v = THREE.MathUtils.clamp(patch.foam, 0, 1);
      this.shampooUsed = v > 0;
      this.foam.setHeadRadius(this._estimateHeadRadius());
      this._syncAnchors();
      this.foam.setAmount(v);
      this.foam.update(0.016, ctx);
      ctx.baby?.setFoam?.('hair', Math.min(1, v));
      ctx.baby?.setFoam?.('body', Math.min(1, v * 0.6));
      if (v > 0.05) this.phase = 'wash';
    }

    if (patch.bubbles !== undefined) {
      this.foam.setBubbleRate(patch.bubbles ? (this.tier >= 1 ? 7 : 3) : 0);
      if (patch.bubbles) {
        const c = this._world(this.bowl, 0, this.water.surfaceY + 0.02, 0);
        for (let i = 0; i < (this.tier >= 1 ? 20 : 8); i++) {
          this.foam.spawnBubbles(c, 1, 0.16);
          const b = this.foam.bubbles[this.foam.bubbles.length - 1];
          if (b) { b.life = this.rand() * b.maxLife * 0.7; b.p.y += this.rand() * 0.22; }
        }
      }
    }

    if (patch.steam !== undefined) {
      this._steamOverride = patch.steam ? 0.9 : null;
      if (patch.steam) {
        this.temp = Math.max(this.temp, 0.86);
        this.water.setTemperature(this.temp);
        this.steam.setAmount(0.9);
        for (let i = 0; i < 6; i++) this.steam.update(0.25);
        ctx.fx?.burst?.('steam', this._world(this.bowl, 0, this.water.surfaceY + 0.05, 0), 12);
      } else {
        this.steam.setAmount(0);
      }
    }

    if (patch.splash) {
      const c = this._world(this.bowl, 0.05, this.water.surfaceY, 0.06);
      this.water.disturb(0.05, 0.06, 0.14, 0.020);
      this.water.stir(0.05, 0.06, 0.10, 0.012);
      ctx.fx?.burst?.('splash', c, 26);
      this.foam.spawnBubbles(c, 8, 0.12);
      this.droplets.fill(this.anchors, 0.55);
      this.wet = Math.max(this.wet, 0.7);
      ctx.baby?.setWet?.(0.85);
      this._applyWetSkin(0.85);
      this._splashPulse = 1.2;
      this._sfx('splash');
    }

    if (patch.wet !== undefined) {
      const v = THREE.MathUtils.clamp(patch.wet, 0, 1);
      this.wet = v;
      ctx.baby?.setWet?.(v);
      this._applyWetSkin(v);
      this.wetStrands.visible = v > 0.35;
      this._syncAnchors();
      if (v > 0.05) {
        if (this.water.levelTarget < 0.2) this.foam.clear();
        this.droplets.fill(this.anchors, v);
        if (this.water.levelTarget < 0.2) {
          this._placeBabyOnMat();
          this.phase = 'dry';
          if (this.towel.parent !== this.root) {
            this.root.attach(this.towel);
            const b = this._babyPoint('body');
            this.towel.position.set(b.x + 0.16, b.y + 0.06, b.z + 0.20);
            this.towel.rotation.set(0.2, -0.3, 0.15);
          }
          this._cueHide();
        }
      } else {
        this.droplets.clear();
      }
    }

    if (patch.phase) this._setPhase(patch.phase);
  }
}

export default BathActivity;
