/* ============================================================================
 * fx/foam.js — soap lather that grows, sculpts and rinses away locally
 * ----------------------------------------------------------------------------
 * Lather is the one bath effect a child will judge you on, so it is modelled
 * as an actual accumulating substance rather than a texture that fades in.
 *
 *   • Foam lives as a pool of blobs — position, radius, growth target — drawn
 *     as one InstancedMesh of clumped icospheres. Scrubbing the same spot
 *     twice *grows* the blob already there; scrubbing next to it spawns a
 *     neighbour. That is what makes the mass build up into a cluster instead
 *     of a spray of equal beads.
 *   • Blobs are parented to lightweight anchors (head, body, each hand, the
 *     water surface) so they ride the baby without this module knowing
 *     anything about the rig.
 *   • Stroking upward raises `horn`, which blends every head blob from its
 *     scattered base position onto a golden-angle spiral that tapers as it
 *     rises: a real sculpted foam horn, and it un-sculpts as it is rinsed.
 *   • Rinsing is spatial. `rinse(point, radius, dt)` only shrinks blobs the
 *     spray actually reaches, so aiming matters.
 * ========================================================================== */

import * as THREE from 'three';
import * as MAT from '../engine/materials.js';
import * as TEX from '../engine/textures.js';
import { rng } from './water.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _wp = new THREE.Vector3();
const _IDQ = new THREE.Quaternion();

/**
 * Blob budget per tier.
 *
 * Lather is not a pile of balls, it is a *lot* of small bubbles, and the single
 * strongest lever on whether it reads as suds or as gravel is bubble size
 * relative to the head. The first pass drew 52 blobs of 18–34 mm radius on a
 * 100 mm head — each one a third of the skull — and no amount of shading will
 * rescue a golf ball. These budgets pay for three to four times as many blobs
 * at a third of the radius, which is what buys both the soft mass and the
 * ragged outline foam actually has.
 */
const CAP = [120, 220, 380];
const BUB = [10, 24, 42];

/** Radius range per region, in metres: [min, max, bias]. */
const SIZE = {
  head: [0.0065, 0.0195, 1.9],
  body: [0.0060, 0.0165, 2.0],
  water: [0.0085, 0.0235, 1.7]
};

/**
 * Draw a bubble radius with a hierarchy: mostly filler, a few heroes.
 * `pow(rand, bias)` with bias > 1 pushes the mass of the distribution down.
 */
function pickRadius(rand, region) {
  const s = SIZE[region] || SIZE.body;
  return s[0] + (s[1] - s[0]) * Math.pow(rand(), s[2]);
}

/**
 * Radial displacement field for a suds blob: a unit sphere breathed in and out
 * by three low-frequency sines. Returns the radius at direction (x, y, z).
 *
 * The frequencies matter more than anything else in this file. The first pass
 * used 7.3 / 9.1 / 11.4 radians per unit, and adjacent vertices on a detail-2
 * icosphere are ~0.32 apart — so the sine advanced 2.3 radians *between
 * neighbouring vertices*. The field was aliased by its own mesh: every vertex
 * got an effectively random radius in [0.81, 1.15], and the result was a chip
 * of broken quartz. Measured, the true face normals of that geometry sat a
 * mean of 28° and a worst case of 52° away from the sphere normal the shader
 * was being handed. Keeping the frequency near 2–3 puts roughly one lobe on
 * each side of the blob, which is what a soap bubble cluster actually looks
 * like, and the mesh samples it properly.
 */
function blobRadius(x, y, z) {
  return 1
    + 0.100 * Math.sin(x * 2.3 + y * 1.7 + 0.6)
    + 0.075 * Math.sin(y * 1.9 - z * 2.6 + 2.1)
    + 0.055 * Math.sin(z * 2.9 + x * 1.4 + 4.3);
}

/**
 * Icosphere pushed around by `blobRadius` — reads as a pillow of suds.
 *
 * `IcosahedronGeometry` is non-indexed and carries per-face UVs, so
 * `computeVertexNormals()` gives flat per-face normals and `mergeVertices()`
 * cannot weld anything (the UVs differ at every shared corner). The previous
 * fix for that handed the shader the *radial* direction as the normal, which
 * is only correct for an undeformed sphere: it shaded a crumpled lump as
 * though it were a ball, and the eye resolved the contradiction as faceting.
 *
 * So take the normal from the surface itself. Two central differences along an
 * orthonormal tangent pair give the true tangent plane of the displaced
 * surface, and their cross product is the true smooth normal — non-indexed,
 * UV-preserving, and correct everywhere.
 */
function clumpGeometry(detail) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const u = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), t1 = new THREE.Vector3(),
    t2 = new THREE.Vector3(), n = new THREE.Vector3(), tmp = new THREE.Vector3();
  const H = 0.035;
  // p(u) = r(u) * u, evaluated on the unit sphere in direction `dir`.
  const surf = (dir, out) => {
    out.copy(dir).normalize();
    return out.multiplyScalar(blobRadius(out.x, out.y, out.z));
  };
  for (let i = 0; i < p.count; i++) {
    u.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    // any stable tangent pair will do — the cross product is basis-independent
    e1.set(0, 0, 1).cross(u);
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0).cross(u);
    e1.normalize();
    e2.crossVectors(u, e1).normalize();

    surf(tmp.copy(u).addScaledVector(e1, H), a);
    surf(tmp.copy(u).addScaledVector(e1, -H), b);
    t1.subVectors(a, b);
    surf(tmp.copy(u).addScaledVector(e2, H), a);
    surf(tmp.copy(u).addScaledVector(e2, -H), b);
    t2.subVectors(a, b);

    n.crossVectors(t1, t2);
    if (n.dot(u) < 0) n.negate();
    if (n.lengthSq() < 1e-12) n.copy(u); else n.normalize();

    surf(u, a);
    p.setXYZ(i, a.x, a.y, a.z);
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  p.needsUpdate = true;
  nrm.needsUpdate = true;
  return geo;
}

export class FoamSystem {
  constructor(ctx, { parent, headRadius = 0.068 } = {}) {
    this.ctx = ctx;
    this.tier = Math.max(0, Math.min(2, ctx?.tier ?? 2));
    this.capacity = CAP[this.tier];
    this.headRadius = headRadius;
    this.blobs = [];
    this.horn = 0;
    this.hornTarget = 0;
    this.time = 0;
    this.bubbleRate = 0;
    this._bubbleAcc = 0;
    this.rand = rng(9137);
    this.anchors = new Map();

    /* --- foam blobs ---------------------------------------------------- */
    this.geometry = clumpGeometry(this.tier >= 2 ? 2 : 1);
    const fm = MAT.makeFoam().clone();          // clone: the cached one is shared
    // `foamSurface` is a worley field, and worley cells are *polygons*. At 22
    // cells across a blob its albedo painted five or six pale plates separated
    // by dark creases onto every single one — which is precisely the broken-
    // chalk read, drawn on rather than shaded. Drop the albedo entirely (suds
    // are white; there is nothing to paint) and keep only a fine, weak normal
    // and roughness breakup so the surface still has frost at 400%.
    const maps = TEX.foamSurface({ seed: 77, cells: 44 });
    fm.map = null;
    fm.normalMap = maps.normalMap;
    fm.roughnessMap = maps.roughnessMap;
    // Enough to read as froth at 400% without the map's cell boundaries ever
    // becoming a silhouette — the geometry owns the form, this owns the fizz.
    fm.normalScale.set(0.26, 0.26);
    // Not fully matte. A completely rough white lump takes the key flat and
    // reads as chalk or a small pebble; suds are wet, and a broad soft
    // highlight rolling over the top of the mass is most of what says so.
    fm.roughness = 0.62;
    // A tight sheen lobe is the cheapest honest translucency here: it lights
    // the grazing rim of every bubble without the cost or the backdrop-tinting
    // of transmission, so the mass glows at its edge the way lather does.
    fm.sheen = 1.0;
    fm.sheenRoughness = 0.32;
    // Foam is opaque white froth, not glass. With transmission on, each blob
    // sampled the backdrop behind it — the baby's shirt, the tub in shadow —
    // and inherited its colour, which is the other half of the gravel look.
    fm.transmission = 0.0;
    fm.thickness = 0.02;
    fm.ior = 1.10;
    fm.envMapIntensity = 2.0;
    fm.color.setHex(0xffffff);
    // Suds are a dense forward scatterer: they never go black, even in a
    // shadowed tub, and the shadowed side of a lather mass is only about a
    // stop under the lit side. A flat emissive floor is the cheap stand-in for
    // that, and without enough of it the blobs bottom out grey and read as
    // gravel however good the geometry is.
    fm.emissive = new THREE.Color(0xfff6f0);
    fm.emissiveIntensity = 0.26;
    this.material = fm;

    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    // Blob-on-blob shadowing is what turned a cluster into a heap of stones.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.name = 'bath-foam';
    mesh.renderOrder = 7;
    this.mesh = mesh;
    parent.add(mesh);

    /* --- free-floating bubbles ----------------------------------------- */
    this.bubbles = [];
    this.bubbleCap = BUB[this.tier];
    this.bubbleGeometry = new THREE.SphereGeometry(1, this.tier >= 2 ? 18 : 12,
      this.tier >= 2 ? 14 : 9);
    this.bubbleMaterial = MAT.makeBubble().clone();
    this.bubbleMaterial.transmission = this.tier >= 1 ? 0.95 : 0.0;
    this.bubbleMaterial.opacity = this.tier >= 1 ? 0.30 : 0.42;
    const bmesh = new THREE.InstancedMesh(this.bubbleGeometry, this.bubbleMaterial, this.bubbleCap);
    bmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bmesh.count = 0;
    bmesh.frustumCulled = false;
    bmesh.name = 'bath-bubbles';
    bmesh.renderOrder = 9;
    this.bubbleMesh = bmesh;
    parent.add(bmesh);
  }

  /* ----------------------------------------------------------- anchors -- */

  setAnchor(id, object3D) { this.anchors.set(id, object3D); return object3D; }
  setHeadRadius(r) { this.headRadius = Math.max(0.03, r); }

  _anchor(region) {
    return this.anchors.get(region) || this.anchors.get('body') || this.mesh;
  }

  /* -------------------------------------------------------- accumulate -- */

  /**
   * Deposit lather. Repeated calls near an existing blob grow it; further away
   * they seed a new one. `amount` is roughly "one scrub stroke" = 0.02.
   */
  add(region, worldPoint, amount = 0.02, maxRadius = 0.020) {
    const anchor = this._anchor(region);
    anchor.updateMatrixWorld();
    _p.copy(worldPoint);
    anchor.worldToLocal(_p);

    // grow the nearest blob if we are close enough to merge with it
    let best = null, bestD = 1e9;
    for (const b of this.blobs) {
      if (b.region !== region) continue;
      const d = b.local.distanceTo(_p);
      if (d < bestD) { bestD = d; best = b; }
    }
    // Tight merge radius: a stroke should lay down a *trail* of blobs that
    // then swell, not pour everything into one growing ball.
    const merge = maxRadius * 0.62;
    if (best && bestD < merge) {
      best.target = Math.min(maxRadius, best.target + amount);
      best.stamp = this.time;
      // neighbours pick up a little too, which is what fuses separate dabs
      // into one continuous mass instead of a row of beads
      for (const b of this.blobs) {
        if (b === best || b.region !== region) continue;
        if (b.local.distanceTo(_p) < merge * 2.4) {
          b.target = Math.min(b.max, b.target + amount * 0.30);
        }
      }
      return best;
    }
    return this._spawn(region, _p, amount, maxRadius);
  }

  _spawn(region, local, amount, maxRadius) {
    if (this.blobs.length >= this.capacity) {
      // recycle the smallest blob rather than refusing to lather
      let idx = 0, small = 1e9;
      for (let i = 0; i < this.blobs.length; i++) {
        if (this.blobs[i].target < small) { small = this.blobs[i].target; idx = i; }
      }
      this.blobs.splice(idx, 1);
    }
    const r = this.rand;
    const b = {
      region,
      local: local.clone(),
      base: local.clone(),
      r: 0.004,
      target: Math.min(maxRadius, 0.007 + amount * 0.5),
      max: maxRadius,
      quat: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(r() * 6.28, r() * 6.28, r() * 6.28)),
      // Wide, because a lather is bubbles of every shape at once — a population
      // of identically-proportioned ellipsoids reads as a manufactured product.
      squash: 0.66 + r() * 0.56,
      phase: r() * 6.28,
      stamp: this.time,
      rank: 0
    };
    this.blobs.push(b);
    this._reRank();
    return b;
  }

  /** Deposit lather straight onto an anchor in a small random cap. */
  seed(region, count = 3, spread = 0.05, up = 0.02, amount = 0.014) {
    const anchor = this._anchor(region);
    anchor.updateMatrixWorld();
    const r = this.rand;
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * spread;
      _p.set(Math.cos(a) * rad, up + r() * 0.02, Math.sin(a) * rad * 0.85);
      anchor.localToWorld(_p);
      this.add(region, _p, amount);
    }
  }

  _reRank() {
    let n = 0;
    for (const b of this.blobs) if (b.region === 'head') b.rank = n++;
    this._headCount = n;
  }

  /* ------------------------------------------------------------ sculpt -- */

  /** Stroke upward: pull the head lather into a horn. `v` is 0..1 absolute. */
  setHorn(v) { this.hornTarget = THREE.MathUtils.clamp(v, 0, 1); }
  addHorn(v) { this.setHorn(this.hornTarget + v); }
  get hornAmount() { return this.horn; }

  /* ------------------------------------------------------------- rinse -- */

  /** Dissolve foam only where the spray actually lands. Returns amount removed. */
  rinse(worldPoint, radius = 0.09, dt = 0.016, rate = 0.16) {
    let removed = 0;
    const r2 = radius * radius;
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i];
      const anchor = this._anchor(b.region);
      _wp.copy(b.local);
      anchor.localToWorld(_wp);
      if (_wp.distanceToSquared(worldPoint) > r2) continue;
      const cut = rate * dt;
      b.target = Math.max(0, b.target - cut);
      removed += cut;
      if (b.target <= 0.001 && b.r < 0.007) {
        this.blobs.splice(i, 1);
        this._reRank();
      }
    }
    if (removed > 0) {
      this.hornTarget = Math.max(0, this.hornTarget - removed * 1.2);
    }
    return removed;
  }

  /** Global dissolve — used when the whole baby goes under. */
  dissolve(dt, rate = 0.08) {
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i];
      b.target = Math.max(0, b.target - rate * dt);
      if (b.target <= 0.001 && b.r < 0.007) { this.blobs.splice(i, 1); this._reRank(); }
    }
    this.hornTarget = Math.max(0, this.hornTarget - rate * dt * 1.5);
  }

  /* ------------------------------------------------------------ queries -- */

  density(region) {
    let s = 0;
    for (const b of this.blobs) if (b.region === region) s += b.r;
    return s;
  }

  /** 0..1 — how lathered the baby is overall. */
  total() {
    let s = 0;
    for (const b of this.blobs) s += b.r;
    // Calibrated so a fully dialled lather reads ~0.9. The mean blob radius
    // is a property of SIZE, so this divisor moves whenever SIZE does.
    return Math.min(1, s / (this.capacity * 0.0120));
  }

  clear() {
    this.blobs.length = 0;
    this.bubbles.length = 0;
    this.horn = this.hornTarget = 0;
    this.mesh.count = 0;
    this.bubbleMesh.count = 0;
    this._headCount = 0;
  }

  /* ------------------------------------------------------------ harness -- */

  /** Deterministically dial the lather to a given amount (screenshot harness). */
  setAmount(v) {
    v = THREE.MathUtils.clamp(v, 0, 1);
    this.clear();
    if (v <= 0.001) return;
    const rand = rng(20517);
    const hr = this.headRadius;

    const nHead = Math.round(v * Math.min(170, this.capacity * 0.44));
    for (let i = 0; i < nHead; i++) {
      // golden-angle cap over the crown so the mass is even, never stripey
      const k = (i + 0.5) / nHead;
      const a = i * 2.39996;
      // Jitter the cap radius per blob. A clean sqrt spiral draws a perfect
      // disc, and a perfect disc gives the mass a perfect circular outline —
      // lather has a ragged one, and the outline is what the eye reads first.
      const rad = Math.sqrt(k) * hr * (0.88 + rand() * 0.34);
      // Lay the cap on the *surface* of the skull rather than at a flat
      // height: at the crown the blobs sit a full radius up, at the edge they
      // drop to ear height. A flat cap sank into the head at the middle and
      // floated off it at the sides.
      _p.set(Math.cos(a) * rad,
             hr * (0.30 + 0.72 * Math.sqrt(Math.max(0, 1 - k))) + (rand() - 0.35) * 0.014,
             Math.sin(a) * rad * 0.86);
      const b = this._spawn('head', _p, 0.02, SIZE.head[1]);
      b.target = pickRadius(rand, 'head');
      b.r = b.target;
    }

    // Lather on skin arrives in *patches* — a few places the flannel went over
    // twice — not as an even sprinkle of equal beads. Seeding a handful of
    // cluster centres and packing overlapping blobs into each is what makes it
    // read as one clinging mass instead of gravel stuck to a baby.
    const nBody = Math.round(v * Math.min(120, this.capacity * 0.28));
    const clusters = [];
    for (let c = 0; c < 5; c++) {
      const a = rand() * Math.PI * 2;
      const rad = 0.025 + rand() * 0.045;
      clusters.push([Math.cos(a) * rad, -0.02 + rand() * 0.085, Math.sin(a) * rad * 0.7 + 0.02]);
    }
    for (let i = 0; i < nBody; i++) {
      const c = clusters[i % clusters.length];
      const a = rand() * Math.PI * 2;
      // Cube-rooted so the pack is densest at the cluster core and thins to
      // stragglers at its edge: a patch of lather has no boundary, it frays.
      const rad = Math.pow(rand(), 0.34) * 0.034;
      _p.set(c[0] + Math.cos(a) * rad,
             c[1] + (rand() - 0.5) * 0.030,
             c[2] + Math.sin(a) * rad * 0.8);
      const b = this._spawn('body', _p, 0.02, SIZE.body[1]);
      b.target = pickRadius(rand, 'body');
      b.r = b.target;
      // Extra aspect spread on the skin: a lather patch is bubbles of every
      // proportion pressed together, not a bag of matched ellipsoids.
      b.squash = 0.58 + rand() * 0.78;
    }

    // Suds floating on the water: a *raft*, so the blobs have to touch.
    //
    // The first attempt spread the same number of blobs over an ellipse 0.60 m
    // across, which is about a quarter covered — and a quarter-covered surface
    // is not foam, it is a scatter of white pebbles on water, which is exactly
    // how it rendered. Foam floats as a connected patch with an eaten-away
    // edge, so the raft is now roughly two-thirds the size and packs to about
    // 80% coverage; the water shader's own foam rim carries the rest.
    const nWater = Math.round(v * Math.min(130, this.capacity * 0.30));
    for (let i = 0; i < nWater; i++) {
      const k = (i + 0.5) / nWater;
      const a = i * 2.39996;
      const rad = Math.sqrt(k) * (0.82 + rand() * 0.40);
      _p.set(Math.cos(a) * rad * 0.200 + (rand() - 0.5) * 0.020,
             0.001 + rand() * 0.005,
             Math.sin(a) * rad * 0.135 + (rand() - 0.5) * 0.015);
      const b = this._spawn('water', _p, 0.02, SIZE.water[1]);
      b.target = pickRadius(rand, 'water');
      b.r = b.target;
      // Floating suds sit half under. Flatten them *vertically* — which means
      // dropping the random tumble for a yaw-only rotation, or the squash axis
      // lands anywhere and the raft goes back to being balls on a mirror.
      b.squash = 0.56 + rand() * 0.30;
      b.quat.setFromEuler(new THREE.Euler(0, rand() * 6.28, 0));
    }

    // a healthy lather has already been swept up into a peak
    this.hornTarget = this.horn = THREE.MathUtils.clamp((v - 0.45) / 0.4, 0, 1) * 0.9;
    this._reRank();
  }

  /* ----------------------------------------------------------- bubbles -- */

  spawnBubbles(worldPos, count = 3, spread = 0.05) {
    const r = this.rand;
    for (let i = 0; i < count && this.bubbles.length < this.bubbleCap; i++) {
      const y0 = worldPos.y + r() * 0.02;
      this.bubbles.push({
        p: new THREE.Vector3(
          worldPos.x + (r() * 2 - 1) * spread,
          y0,
          worldPos.z + (r() * 2 - 1) * spread * 0.8),
        v: new THREE.Vector3((r() * 2 - 1) * 0.03, 0.055 + r() * 0.075, (r() * 2 - 1) * 0.03),
        r: 0.007 + r() * 0.014,
        life: 0,
        maxLife: 2.4 + r() * 2.8,
        phase: r() * 6.28,
        wob: 0.6 + r() * 0.8,
        // A soap bubble off a bath does not climb to the ceiling: it drifts a
        // hand's width and bursts. Without a ceiling the long-lived ones ended
        // up floating half a metre above the tub with nothing under them,
        // reading as a stray white sphere pasted into the frame.
        y0,
        rise: 0.055 + r() * 0.11
      });
    }
  }

  setBubbleRate(v) { this.bubbleRate = Math.max(0, v); }

  /* -------------------------------------------------------------- step -- */

  update(dt, ctx) {
    this.time += dt;
    this.horn += (this.hornTarget - this.horn) * Math.min(1, dt * 3.4);

    /* --- blobs --------------------------------------------------------- */
    const grow = Math.min(1, dt * 5.5);
    const hCount = Math.max(1, this._headCount || 1);
    let n = 0;
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i];
      b.r += (b.target - b.r) * grow;
      if (b.target <= 0.001 && b.r < 0.0035) { this.blobs.splice(i, 1); this._reRank(); continue; }
    }
    for (const b of this.blobs) {
      let scaleK = 1;
      if (b.region === 'head' && this.horn > 0.001) {
        const k = hCount > 1 ? b.rank / (hCount - 1) : 0;
        const a = b.rank * 2.39996 + this.time * 0.12;
        const rad = this.headRadius * 0.95 * Math.pow(1 - k, 0.85);
        // The peak starts *on* the crown and rises about eight-tenths of a head
        // radius above it. It used to start half a radius up — inside the
        // skull — and finish 1.7 radii above, which read as a clump of lather
        // hanging in the air with a gap under it.
        _p.set(
          Math.cos(a) * rad + Math.sin(k * Math.PI) * this.headRadius * 0.22,
          this.headRadius * (0.76 + k * 0.70),
          Math.sin(a) * rad * 0.9);
        b.local.lerpVectors(b.base, _p, this.horn);
        scaleK = 1 - this.horn * k * 0.55;
      } else if (this.horn <= 0.001 && b.region === 'head') {
        b.local.lerp(b.base, Math.min(1, dt * 4));
      }

      const anchor = this._anchor(b.region);
      _wp.copy(b.local);
      anchor.localToWorld(_wp);

      const wob = 1 + Math.sin(this.time * 2.2 + b.phase) * 0.035;
      const s = b.r * wob * scaleK;
      _s.set(s, s * b.squash, s * (1.8 - b.squash));
      _m.compose(_wp, b.quat, _s);
      this.mesh.setMatrixAt(n++, _m);
      if (n >= this.capacity) break;
    }
    this.mesh.count = n;
    if (n > 0) this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = n > 0;

    /* --- bubbles ------------------------------------------------------- */
    if (this.bubbleRate > 0) {
      this._bubbleAcc += dt * this.bubbleRate;
      while (this._bubbleAcc >= 1) {
        this._bubbleAcc -= 1;
        const src = this.blobs.length
          ? this.blobs[(this.rand() * this.blobs.length) | 0] : null;
        if (src) {
          const anchor = this._anchor(src.region);
          _wp.copy(src.local);
          anchor.localToWorld(_wp);
          this.spawnBubbles(_wp, 1, 0.03);
        }
      }
    }

    let bn = 0;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life += dt;
      // Burst on age *or* on height, whichever comes first.
      if (b.life >= b.maxLife || (b.rise !== undefined && b.p.y - b.y0 > b.rise)) {
        this.bubbles.splice(i, 1);
        ctx?.fx?.burst?.('sparkle', b.p, 1, { scale: 0.4 });
        continue;
      }
      b.v.y += (0.075 - b.v.y) * Math.min(1, dt * 1.5);
      b.p.addScaledVector(b.v, dt);
      // the sideways drift of a rising bubble is what makes it read as light
      b.p.x += Math.sin(this.time * b.wob * 2.1 + b.phase) * dt * 0.035;
      b.p.z += Math.cos(this.time * b.wob * 1.7 + b.phase) * dt * 0.035;
      const fade = Math.min(1, (b.maxLife - b.life) / 0.4);
      const pulse = 1 + Math.sin(this.time * 5 + b.phase) * 0.06;
      const s = b.r * pulse * (0.6 + 0.4 * Math.min(1, b.life * 4)) * fade;
      _s.set(s, s * (1 - Math.sin(this.time * 4 + b.phase) * 0.05), s);
      _m.compose(b.p, _IDQ, _s);
      this.bubbleMesh.setMatrixAt(bn++, _m);
      if (bn >= this.bubbleCap) break;
    }
    this.bubbleMesh.count = bn;
    if (bn > 0) this.bubbleMesh.instanceMatrix.needsUpdate = true;
    this.bubbleMesh.visible = bn > 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.bubbleMesh.removeFromParent();
    this.mesh.dispose();
    this.bubbleMesh.dispose();
    this.geometry.dispose();
    this.bubbleGeometry.dispose();
    this.material.dispose();
    this.bubbleMaterial.dispose();
    this.blobs.length = 0;
    this.bubbles.length = 0;
    this.anchors.clear();
  }
}
