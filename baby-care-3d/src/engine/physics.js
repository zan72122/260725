/* ============================================================================
 * physics.js — Dependency-free rigid body + verlet solver
 * ----------------------------------------------------------------------------
 * Everything the nursery needs and nothing it doesn't: balls that roll, blocks
 * that topple and stack, blankets that drape, hair and mobiles that swing.
 *
 * Design decisions worth knowing before you edit:
 *
 *   • Fixed 1/120 s substeps behind an accumulator. Behaviour is identical at
 *     30 and 144 fps, and identical between two runs — the block tower has to
 *     collapse the *same way* in a screenshot as it does on a phone. Meshes are
 *     interpolated between the last two substeps so a 60 fps frame never sees
 *     the 120 Hz staircase.
 *   • Sequential-impulse solver with warm starting. Cached impulses from the
 *     previous step are re-applied before solving, which is what lets an eight
 *     iteration solver hold a six-block tower steady.
 *   • Penetration is fixed with *split impulses* (Baumgarte bias applied to a
 *     separate pseudo-velocity) rather than by biasing the real velocity. The
 *     positional push therefore adds no kinetic energy, so a settled stack does
 *     not buzz — the single most important detail in this file.
 *   • Box-vs-box uses full SAT with face clipping, producing a 4-point manifold
 *     for face contacts. A single-point manifold cannot hold a tower up.
 *   • No `Math.random` anywhere. `RNG` is exported and seeded; use it.
 *
 * Coordinates are world-space metres. Bodies whose mesh is parented under a
 * transformed group are converted on write-back, but the simulation itself is
 * always world-space.
 * ========================================================================== */

import * as THREE from 'three';

/* ----------------------------------------------------------------- RNG --- */

/**
 * xorshift32. Four ops, full 2^32-1 period, bit-identical on every device —
 * which matters far more here than statistical perfection.
 */
export class RNG {
  constructor(seed = 0x9e3779b9) { this.seed(seed); }

  seed(s) { this._s = (s >>> 0) || 0x9e3779b9; return this; }

  uint() {
    let x = this._s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this._s = x;
    return x;
  }

  float() { return this.uint() / 4294967296; }
  range(a, b) { return a + (b - a) * this.float(); }
  int(n) { return (this.float() * n) | 0; }
  sign() { return this.float() < 0.5 ? -1 : 1; }
  bool(p = 0.5) { return this.float() < p; }
  pick(arr) { return arr[(this.float() * arr.length) | 0]; }

  /** Uniform direction on the unit sphere. */
  unit(out = new THREE.Vector3()) {
    const z = this.range(-1, 1);
    const a = this.range(0, Math.PI * 2);
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return out.set(Math.cos(a) * r, Math.sin(a) * r, z);
  }

  /** Uniform direction in a cone around +Y. `spread` in radians. */
  cone(spread, out = new THREE.Vector3()) {
    const a = this.range(0, Math.PI * 2);
    const z = this.range(Math.cos(spread), 1);
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return out.set(Math.cos(a) * r, z, Math.sin(a) * r);
  }
}

/** The game's shared deterministic stream. Reset it to replay a sequence. */
export const rng = new RNG(0xBABE5EED);

/* ----------------------------------------------------------- tunables --- */

const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 8;        // 1/15 s of catch-up; beyond that we drop time
const VEL_ITERS = 8;
const POS_ITERS = 4;
// 1.2 mm of allowed overlap. Engines usually ship 5 mm, but this is a *toy*
// scale world — a building block is 60 mm, so 5 mm of slop per contact would
// let a six-high tower sink three centimetres into itself.
const SLOP = 0.0012;
const BAUMGARTE = 0.28;
const MAX_CORRECTION = 2.5;    // m/s cap on the positional push
const REST_THRESHOLD = 0.55;   // closing speed below which nothing bounces
const SLEEP_LIN = 0.040;       // m/s
const SLEEP_ANG = 0.30;        // rad/s
const SLEEP_TIME = 0.45;       // s at rest before a body sleeps

/* ------------------------------------------------------------ scratch --- */

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();

// Per-body world axes, filled by _basis().
const _axA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _axB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

const _R = new Float64Array(9);
const _AbsR = new Float64Array(9);
const _tA = new Float64Array(3);

// Polygon clipping buffers (Sutherland–Hodgman ping-pong).
const _polyA = []; const _polyB = [];
for (let i = 0; i < 10; i++) { _polyA.push(new THREE.Vector3()); _polyB.push(new THREE.Vector3()); }
const _clipDepth = new Float64Array(10);

const BOX_CORNERS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
];

/** Winding of an incident face's four corners, flattened. */
const FACE_SIGNS = [1, 1, -1, 1, -1, -1, 1, -1];

const _ha = new Float64Array(3);
const _hb = new Float64Array(3);

/* ------------------------------------------------------------- maths ---- */

/**
 * Rotation basis from a quaternion, column-major: world axis k of the body is
 * (m[3k], m[3k+1], m[3k+2]).
 */
function quatBasis(q, m) {
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = 1 - (yy + zz); m[1] = xy + wz; m[2] = xz - wy;
  m[3] = xy - wz; m[4] = 1 - (xx + zz); m[5] = yz + wx;
  m[6] = xz + wy; m[7] = yz - wx; m[8] = 1 - (xx + yy);
}

function axis(m, k, out) { return out.set(m[3 * k], m[3 * k + 1], m[3 * k + 2]); }

/** out = M * v, with M stored row-major in a Float64Array(9). */
function mul3(M, v, out) {
  return out.set(
    M[0] * v.x + M[1] * v.y + M[2] * v.z,
    M[3] * v.x + M[4] * v.y + M[5] * v.z,
    M[6] * v.x + M[7] * v.y + M[8] * v.z
  );
}

/** Any orthonormal pair perpendicular to n. Deterministic, so warm-started
 *  friction impulses stay meaningful between frames. */
function tangentBasis(n, t1, t2) {
  if (Math.abs(n.x) >= 0.57735) t1.set(n.y, -n.x, 0);
  else t1.set(0, n.z, -n.y);
  t1.normalize();
  t2.crossVectors(n, t1);
}

/* -------------------------------------------------------------- body ---- */

let _nextId = 1;

/**
 * A rigid body. `position`, `velocity`, `quaternion`, `angularVelocity` and
 * `asleep` are the public surface promised by CONTRACTS.md; everything with an
 * underscore is solver bookkeeping.
 */
class Body {
  constructor(mesh, o = {}) {
    this.id = _nextId++;
    this.mesh = mesh || null;
    this.shape = o.shape || 'box';
    this.userData = o.userData || {};
    this.tag = o.tag || '';

    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();

    if (mesh) {
      mesh.updateWorldMatrix(true, false);
      mesh.getWorldPosition(this.position);
      mesh.getWorldQuaternion(this.quaternion);
    }
    if (o.position) this.position.copy(_toVec3(o.position));
    if (o.quaternion) this.quaternion.copy(o.quaternion);
    if (o.velocity) this.velocity.copy(_toVec3(o.velocity));

    this.prevPosition = this.position.clone();
    this.prevQuaternion = this.quaternion.clone();

    // --- shape -------------------------------------------------------------
    this.radius = o.radius ?? 0.1;
    this.half = new THREE.Vector3(0.1, 0.1, 0.1);
    if (o.size) { const s = _toVec3(o.size); this.half.copy(s).multiplyScalar(0.5); }
    if (o.half) this.half.copy(_toVec3(o.half));
    if (this.shape === 'plane') {
      this.planeNormal = new THREE.Vector3(0, 1, 0);
      this.planeConstant = 0;
    }
    // Cheap culling radius used by the broadphase and the cloth solver.
    this.boundRadius = this.shape === 'sphere' ? this.radius : this.half.length();

    // --- mass properties ---------------------------------------------------
    const mass = o.mass ?? (this.shape === 'plane' ? 0 : 1);
    this.kinematic = !!o.kinematic;
    this.mass = mass;
    this.invMass = mass > 0 ? 1 / mass : 0;
    this._invInertiaLocal = new THREE.Vector3();
    this._invIW = new Float64Array(9);
    this._setInertia();

    // --- material ----------------------------------------------------------
    this.restitution = o.restitution ?? 0.25;
    this.friction = o.friction ?? 0.5;
    this.linearDamping = o.linearDamping ?? 0.012;
    this.angularDamping = o.angularDamping ?? 0.05;
    this.gravityScale = o.gravityScale ?? 1;

    // --- sleeping ----------------------------------------------------------
    this.allowSleep = o.allowSleep !== false && !this.kinematic;
    this.asleep = false;
    this.sleepTimer = 0;

    // --- solver scratch ----------------------------------------------------
    this.force = new THREE.Vector3();
    this.torque = new THREE.Vector3();
    this._pv = new THREE.Vector3();   // pseudo-velocity (split impulse)
    this._pw = new THREE.Vector3();
    this._m = new Float64Array(9);
    this._aabb = new Float64Array(6);
    this._synced = false;

    // Meshes parented under a transformed group need world→local on write-back.
    this.localSpace = false;
    if (mesh && mesh.parent) {
      const e = mesh.parent.matrixWorld.elements;
      for (let i = 0; i < 16; i++) {
        if (Math.abs(e[i] - (i % 5 === 0 ? 1 : 0)) > 1e-6) { this.localSpace = true; break; }
      }
    }

    quatBasis(this.quaternion, this._m);
    this._updateInertiaWorld();
  }

  get isStatic() { return this.invMass === 0 && !this.kinematic; }

  _setInertia() {
    if (this.invMass === 0) { this._invInertiaLocal.set(0, 0, 0); return; }
    const m = this.mass;
    if (this.shape === 'sphere') {
      const i = 2 / 5 * m * this.radius * this.radius;
      this._invInertiaLocal.set(1 / i, 1 / i, 1 / i);
    } else {
      const x = this.half.x * 2, y = this.half.y * 2, z = this.half.z * 2;
      const ix = m * (y * y + z * z) / 12;
      const iy = m * (x * x + z * z) / 12;
      const iz = m * (x * x + y * y) / 12;
      this._invInertiaLocal.set(1 / ix, 1 / iy, 1 / iz);
    }
  }

  /** invI_world = R · invI_local · Rᵀ, stored row-major (it is symmetric). */
  _updateInertiaWorld() {
    const m = this._m, d = this._invInertiaLocal, o = this._invIW;
    if (this.invMass === 0) { o.fill(0); return; }
    const dx = d.x, dy = d.y, dz = d.z;
    for (let i = 0; i < 3; i++) {
      for (let j = i; j < 3; j++) {
        const v = m[0 + i] * dx * m[0 + j] + m[3 + i] * dy * m[3 + j] + m[6 + i] * dz * m[6 + j];
        o[i * 3 + j] = v;
        o[j * 3 + i] = v;
      }
    }
  }

  _updateAABB() {
    const a = this._aabb, p = this.position;
    if (this.shape === 'sphere') {
      const r = this.radius;
      a[0] = p.x - r; a[1] = p.y - r; a[2] = p.z - r;
      a[3] = p.x + r; a[4] = p.y + r; a[5] = p.z + r;
      return;
    }
    // Extent of a rotated box: |R| · half, component-wise.
    const m = this._m, h = this.half;
    const ex = Math.abs(m[0]) * h.x + Math.abs(m[3]) * h.y + Math.abs(m[6]) * h.z;
    const ey = Math.abs(m[1]) * h.x + Math.abs(m[4]) * h.y + Math.abs(m[7]) * h.z;
    const ez = Math.abs(m[2]) * h.x + Math.abs(m[5]) * h.y + Math.abs(m[8]) * h.z;
    a[0] = p.x - ex; a[1] = p.y - ey; a[2] = p.z - ez;
    a[3] = p.x + ex; a[4] = p.y + ey; a[5] = p.z + ez;
  }

  /* ------------------------------------------------------------- public -- */

  wake() {
    if (this.isStatic) return this;
    this.asleep = false;
    this.sleepTimer = 0;
    return this;
  }

  sleep() {
    this.asleep = true;
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this._synced = false;
    return this;
  }

  /** Impulse in N·s. Omit `worldPoint` for a pure linear kick. */
  applyImpulse(impulse, worldPoint) {
    if (this.invMass === 0) return this;
    const j = _toVec3(impulse, _ta);
    this.velocity.addScaledVector(j, this.invMass);
    if (worldPoint) {
      _v1.copy(_toVec3(worldPoint, _tb)).sub(this.position).cross(j);
      mul3(this._invIW, _v1, _v2);
      this.angularVelocity.add(_v2);
    }
    return this.wake();
  }

  /** Continuous force in N; consumed and cleared by the next substep. */
  applyForce(force, worldPoint) {
    const f = _toVec3(force, _ta);
    this.force.add(f);
    if (worldPoint) {
      _v1.copy(_toVec3(worldPoint, _tb)).sub(this.position).cross(f);
      this.torque.add(_v1);
    }
    return this.wake();
  }

  applyTorque(t) { this.torque.add(_toVec3(t)); return this.wake(); }

  setPosition(v) {
    this.position.copy(_toVec3(v));
    this.prevPosition.copy(this.position);
    return this.wake();
  }

  setQuaternion(q) {
    this.quaternion.copy(q).normalize();
    this.prevQuaternion.copy(this.quaternion);
    quatBasis(this.quaternion, this._m);
    this._updateInertiaWorld();
    return this.wake();
  }

  setVelocity(v, w) {
    this.velocity.copy(_toVec3(v));
    if (w) this.angularVelocity.copy(_toVec3(w));
    return this.wake();
  }

  setMass(m) {
    this.mass = m;
    this.invMass = m > 0 ? 1 / m : 0;
    this._setInertia();
    this._updateInertiaWorld();
    return this;
  }

  /** Pull the simulation state back from the mesh (after a manual placement). */
  syncFromMesh() {
    if (!this.mesh) return this;
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(this.position);
    this.mesh.getWorldQuaternion(this.quaternion);
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
    quatBasis(this.quaternion, this._m);
    this._updateInertiaWorld();
    return this.wake();
  }
}

/* ----------------------------------------------------------- contacts --- */

class Contact {
  constructor() {
    this.a = null; this.b = null;
    this.point = new THREE.Vector3();
    this.normal = new THREE.Vector3();      // points from A toward B
    this.ra = new THREE.Vector3();
    this.rb = new THREE.Vector3();
    this.t1 = new THREE.Vector3();
    this.t2 = new THREE.Vector3();
    this.depth = 0;
    this.key = 0;
    this.nMass = 0; this.t1Mass = 0; this.t2Mass = 0;
    this.nImp = 0; this.t1Imp = 0; this.t2Imp = 0; this.pImp = 0;
    this.restBias = 0; this.posBias = 0;
    this.friction = 0.5;
    this.restitution = 0.2;
  }
}

/* --------------------------------------------------------------- world -- */

export class PhysicsWorld {
  constructor(opts = {}) {
    this.gravity = _toVec3(opts.gravity || [0, -9.81, 0]).clone();
    this.fixedDt = opts.fixedDt || FIXED_DT;
    this.velIterations = opts.iterations ?? VEL_ITERS;
    this.posIterations = opts.posIterations || POS_ITERS;
    this.rng = opts.rng || rng;

    /** @type {Body[]} */ this.bodies = [];
    /** @type {Body[]} */ this.planes = [];
    /** @type {Cloth[]} */ this.cloths = [];
    /** @type {Rope[]} */  this.ropes = [];

    this.time = 0;
    this.steps = 0;
    this.enabled = true;

    this._acc = 0;
    this._alpha = 0;
    this._contacts = [];
    this._order = [];                // reused: contacts sorted bottom-up
    this._up = new THREE.Vector3(0, 1, 0);
    if (this.gravity.lengthSq() > 1e-12) this._up.copy(this.gravity).normalize().negate();
    this._nc = 0;
    this._warm = new Map();          // featureKey → cached impulses
    this._cells = new Map();         // spatial hash bucket → body indices
    this._bucketPool = [];
    this._pairs = new Set();
    this._large = [];
    this._parent = new Int32Array(32);
    this._islandTimer = new Float64Array(32);
    this._syncBoundsCounter = 0;
  }

  /* ------------------------------------------------------------ authoring */

  /**
   * Register a mesh as a rigid body.
   *
   * `shape` defaults to 'auto', which measures the mesh's own geometry: a
   * near-cubic bounding box becomes a box, anything rounder becomes a sphere.
   * That keeps call sites short for toys and blocks alike.
   */
  addBody(mesh, opts = {}) {
    const o = Object.assign({}, opts);
    if (!o.shape || o.shape === 'auto') {
      const inferred = inferShape(mesh, o);
      o.shape = inferred.shape;
      if (o.radius === undefined) o.radius = inferred.radius;
      if (!o.size && !o.half) o.size = inferred.size;
    }
    const b = new Body(mesh, o);
    b.world = this;
    this.bodies.push(b);
    return b;
  }

  removeBody(handle) {
    const i = this.bodies.indexOf(handle);
    if (i >= 0) this.bodies.splice(i, 1);
    // Stale warm-start entries expire on their own via the stamp sweep.
    return this;
  }

  /**
   * Infinite half-space. `normal·x + constant = 0`, positive side is solid-free
   * (same convention as THREE.Plane). The nursery floor is (0,1,0), 0.
   */
  addPlane(normal, constant = 0, opts = {}) {
    const b = new Body(null, Object.assign({ shape: 'plane', mass: 0 }, opts));
    b.planeNormal.copy(_toVec3(normal)).normalize();
    b.planeConstant = constant;
    b.world = this;
    this.planes.push(b);
    return b;
  }

  removePlane(handle) {
    const i = this.planes.indexOf(handle);
    if (i >= 0) this.planes.splice(i, 1);
    return this;
  }

  setGravity(v) {
    this.gravity.copy(_toVec3(v));
    // "Up" drives the contact solve order; keep it defined for zero gravity.
    if (this.gravity.lengthSq() > 1e-12) this._up.copy(this.gravity).normalize().negate();
    else this._up.set(0, 1, 0);
    this.wakeAll();
    return this;
  }

  wakeAll() { for (const b of this.bodies) b.wake(); return this; }

  /** Drop everything — used by the harness between scene reloads. */
  clear() {
    this.bodies.length = 0;
    this.planes.length = 0;
    for (const c of this.cloths) c._detach();
    this.cloths.length = 0;
    this.ropes.length = 0;
    this._warm.clear();
    this._acc = 0;
    this.time = 0;
    return this;
  }

  /* ----------------------------------------------------------------- step */

  /**
   * Advance by `dt` seconds of wall clock, in fixed 1/120 s substeps. The
   * leftover fraction is used to interpolate the mesh transforms, so motion
   * stays smooth even though the solver is quantised.
   */
  step(dt) {
    if (!this.enabled || !(dt > 0)) return this;
    this._acc += Math.min(dt, 0.25);

    let n = 0;
    while (this._acc >= this.fixedDt && n < MAX_SUBSTEPS) {
      this._substep(this.fixedDt);
      this._acc -= this.fixedDt;
      n++;
    }
    // Rather than spiral, throw away the backlog on a very long frame.
    if (n === MAX_SUBSTEPS) this._acc = 0;

    this._alpha = this._acc / this.fixedDt;
    this._syncMeshes(this._alpha);
    this.time += dt;
    return this;
  }

  _substep(h) {
    const bodies = this.bodies;

    // 1 — refresh derived rotation state and integrate velocities.
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      b._idx = i;
      quatBasis(b.quaternion, b._m);
      b._updateInertiaWorld();
      b._updateAABB();
      // Pseudo-velocities are per-substep scratch and must never carry over —
      // a sleeping body that skips integration would otherwise hoard them.
      b._pv.set(0, 0, 0);
      b._pw.set(0, 0, 0);
      if (b.asleep) {
        // Solved against as if static, then either kept asleep or woken with a
        // clean slate by the island pass at the end of the substep.
        b.velocity.set(0, 0, 0);
        b.angularVelocity.set(0, 0, 0);
        b.force.set(0, 0, 0);
        b.torque.set(0, 0, 0);
        continue;
      }
      if (b.invMass === 0) { b.force.set(0, 0, 0); b.torque.set(0, 0, 0); continue; }

      b.velocity.addScaledVector(this.gravity, b.gravityScale * h);
      b.velocity.addScaledVector(b.force, b.invMass * h);
      mul3(b._invIW, b.torque, _v1);
      b.angularVelocity.addScaledVector(_v1, h);
      b.force.set(0, 0, 0);
      b.torque.set(0, 0, 0);

      // Exponential damping is frame-rate independent by construction.
      b.velocity.multiplyScalar(Math.exp(-b.linearDamping * h * 60));
      b.angularVelocity.multiplyScalar(Math.exp(-b.angularDamping * h * 60));
    }

    // 2 — collision detection.
    this._nc = 0;
    this._collidePlanes();
    this._collidePairs();

    // 2b — order contacts bottom-up along the gravity axis.
    //
    // This is worth more than doubling the iteration count. A Gauss–Seidel
    // solver propagates one contact per sweep, so solving the floor before the
    // block resting on it lets the whole support chain settle in a single
    // pass; solving them in broadphase order means the load takes as many
    // sweeps as the tower is tall to reach the ground, and until it does, the
    // residual shows up as torque and the tower shears sideways.
    const order = this._order;
    order.length = this._nc;
    for (let i = 0; i < this._nc; i++) order[i] = this._contacts[i];
    const up = this._up;
    order.sort((x, y) => (x.point.dot(up) - y.point.dot(up)));

    // 3 — prepare, then warm start. Two passes: restitution has to be measured
    //     from the *incoming* velocities, before any cached impulse lands.
    const nc = this._nc;
    for (let i = 0; i < nc; i++) this._prepare(order[i], h);
    for (let i = 0; i < nc; i++) this._warmStart(order[i]);

    // 4 — velocity iterations (the "real" impulses).
    //
    // Always swept bottom-up, never alternating: a symmetric (back-and-forth)
    // sweep is the textbook cure for Gauss–Seidel's ordering bias, but here the
    // downward half-sweep throws away the support-propagation the ordering was
    // chosen for, and stacks measurably lose stability. Measured, not assumed.
    for (let it = 0; it < this.velIterations; it++) {
      for (let i = 0; i < nc; i++) this._solveVelocity(order[i]);
    }

    // 5 — position iterations against pseudo-velocities only.
    for (let it = 0; it < this.posIterations; it++) {
      for (let i = 0; i < nc; i++) this._solvePosition(order[i]);
    }

    // 6 — store impulses for next step's warm start.
    for (let i = 0; i < nc; i++) {
      const c = order[i];
      let w = this._warm.get(c.key);
      if (!w) { w = { n: 0, t1: 0, t2: 0, stamp: 0 }; this._warm.set(c.key, w); }
      w.n = c.nImp; w.t1 = c.t1Imp; w.t2 = c.t2Imp; w.stamp = this.steps;
    }

    // 7 — integrate positions and update sleep state.
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      b.prevPosition.copy(b.position);
      b.prevQuaternion.copy(b.quaternion);
      if (b.asleep || (b.invMass === 0 && !b.kinematic)) continue;

      _v1.copy(b.velocity).add(b._pv);
      b.position.addScaledVector(_v1, h);

      _v2.copy(b.angularVelocity).add(b._pw);
      integrateQuaternion(b.quaternion, _v2, h);

      if (b.allowSleep) {
        if (b.velocity.lengthSq() < SLEEP_LIN * SLEEP_LIN &&
            b.angularVelocity.lengthSq() < SLEEP_ANG * SLEEP_ANG) {
          b.sleepTimer += h;
        } else {
          b.sleepTimer = 0;
        }
      } else {
        b.sleepTimer = 0;
      }
    }

    // 7b — island sleeping. A body may only sleep with everything it is
    //      touching, otherwise a stack half falls asleep, the sleeping half
    //      stops integrating, and the awake half sinks through it.
    this._updateIslands();

    // 8 — soft bodies ride the same clock so they stay deterministic too.
    for (let i = 0; i < this.cloths.length; i++) this.cloths[i].step(h);
    for (let i = 0; i < this.ropes.length; i++) this.ropes[i].step(h);

    this.steps++;
    // Sweep dead warm-start entries occasionally; the map would otherwise grow
    // for the life of the session.
    if ((this.steps & 255) === 0) {
      for (const [k, w] of this._warm) if (this.steps - w.stamp > 8) this._warm.delete(k);
    }
  }

  /* -------------------------------------------------------------- islands */

  /**
   * Union-find over the contact graph, then a single sleep/wake decision per
   * connected group. Per-body sleeping is not good enough: a tower whose lower
   * blocks doze off while the top is still settling stops supporting the top.
   */
  _updateIslands() {
    const bodies = this.bodies;
    const N = bodies.length;
    if (N === 0) return;
    if (this._parent.length < N) {
      this._parent = new Int32Array(N * 2);
      this._islandTimer = new Float64Array(N * 2);
    }
    const parent = this._parent, timer = this._islandTimer;
    for (let i = 0; i < N; i++) { parent[i] = i; timer[i] = Infinity; }

    const find = (x) => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; }
      return r;
    };

    for (let i = 0; i < this._nc; i++) {
      const c = this._contacts[i];
      // Statics (and the ground plane) are shared by everything, so they must
      // not fuse otherwise independent islands together.
      if (c.a.isStatic || c.b.isStatic) continue;
      const ra = find(c.a._idx), rb = find(c.b._idx);
      if (ra !== rb) parent[ra] = rb;
    }

    for (let i = 0; i < N; i++) {
      const b = bodies[i];
      if (b.isStatic) continue;
      const r = find(i);
      const t = b.allowSleep ? b.sleepTimer : 0;
      if (t < timer[r]) timer[r] = t;
    }

    for (let i = 0; i < N; i++) {
      const b = bodies[i];
      if (b.isStatic) continue;
      const ready = timer[find(i)] >= SLEEP_TIME;
      if (ready) { if (!b.asleep) b.sleep(); }
      else if (b.asleep) {
        // Wake clean: whatever impulses landed on it while it was standing in
        // for a static body must not be integrated now.
        b.velocity.set(0, 0, 0);
        b.angularVelocity.set(0, 0, 0);
        b._pv.set(0, 0, 0);
        b._pw.set(0, 0, 0);
        b.asleep = false;
        b.sleepTimer = 0;
      }
    }
  }

  /* ------------------------------------------------------------ broadphase */

  _collidePairs() {
    const bodies = this.bodies;
    const n = bodies.length;
    if (n < 2) return;

    // Cell size tracks the largest body so nothing spans a silly number of
    // cells; anything still oversized goes on the "large" list and is tested
    // against everyone (there are only ever a couple of those — the tub, a
    // table top).
    let maxExt = 0.05;
    for (let i = 0; i < n; i++) {
      const a = bodies[i]._aabb;
      maxExt = Math.max(maxExt, a[3] - a[0], a[4] - a[1], a[5] - a[2]);
    }
    const cell = Math.max(0.12, maxExt * 0.75);
    const inv = 1 / cell;

    for (const arr of this._cells.values()) { arr.length = 0; this._bucketPool.push(arr); }
    this._cells.clear();
    this._large.length = 0;
    this._pairs.clear();

    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      const a = b._aabb;
      const x0 = Math.floor(a[0] * inv), x1 = Math.floor(a[3] * inv);
      const y0 = Math.floor(a[1] * inv), y1 = Math.floor(a[4] * inv);
      const z0 = Math.floor(a[2] * inv), z1 = Math.floor(a[5] * inv);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 27) { this._large.push(i); continue; }
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          for (let z = z0; z <= z1; z++) {
            const key = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
            let bucket = this._cells.get(key);
            if (!bucket) { bucket = this._bucketPool.pop() || []; this._cells.set(key, bucket); }
            bucket.push(i);
          }
        }
      }
    }

    for (const bucket of this._cells.values()) {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) this._tryPair(bucket[i], bucket[j]);
      }
    }
    for (const li of this._large) {
      for (let j = 0; j < n; j++) if (j !== li) this._tryPair(li, j);
    }
  }

  _tryPair(i, j) {
    const lo = i < j ? i : j, hi = i < j ? j : i;
    const key = lo * 100003 + hi;
    if (this._pairs.has(key)) return;
    this._pairs.add(key);

    const A = this.bodies[lo], B = this.bodies[hi];
    if (A.isStatic && B.isStatic) return;
    if (A.asleep && B.asleep) return;
    if (A.isStatic && B.asleep) return;
    if (B.isStatic && A.asleep) return;

    const a = A._aabb, b = B._aabb;
    if (a[0] > b[3] || a[3] < b[0] || a[1] > b[4] || a[4] < b[1] || a[2] > b[5] || a[5] < b[2]) return;

    // Wake a sleeper only when the other body is genuinely moving, otherwise a
    // settled stack would keep re-waking itself forever.
    if (A.asleep && B.velocity.lengthSq() > SLEEP_LIN * SLEEP_LIN) A.wake();
    if (B.asleep && A.velocity.lengthSq() > SLEEP_LIN * SLEEP_LIN) B.wake();

    const sa = A.shape, sb = B.shape;
    if (sa === 'sphere' && sb === 'sphere') this._sphereSphere(A, B);
    else if (sa === 'sphere') this._sphereBox(A, B, false);
    else if (sb === 'sphere') this._sphereBox(B, A, true);
    else this._boxBox(A, B);
  }

  /* ------------------------------------------------------------ narrowphase */

  _contact() {
    if (this._nc === this._contacts.length) this._contacts.push(new Contact());
    const c = this._contacts[this._nc++];
    c.nImp = c.t1Imp = c.t2Imp = c.pImp = 0;
    return c;
  }

  _emit(A, B, nx, ny, nz, px, py, pz, depth, feature) {
    if (depth <= 0) return;
    const c = this._contact();
    c.a = A; c.b = B;
    c.normal.set(nx, ny, nz);
    c.point.set(px, py, pz);
    c.depth = depth;
    // Bodies are capped at 65535 ids in practice; the feature id distinguishes
    // the up-to-24 manifold points of one pair.
    c.key = (A.id * 100003 + B.id) * 64 + (feature & 63);
    c.friction = Math.sqrt(A.friction * B.friction);
    c.restitution = Math.max(A.restitution, B.restitution);
  }

  _collidePlanes() {
    const planes = this.planes;
    if (!planes.length) return;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (b.asleep || b.isStatic) continue;
      for (let j = 0; j < planes.length; j++) {
        const pl = planes[j];
        const n = pl.planeNormal;
        if (b.shape === 'sphere') {
          const d = n.dot(b.position) + pl.planeConstant - b.radius;
          if (d < 0) {
            _v1.copy(b.position).addScaledVector(n, -b.radius);
            this._emit(pl, b, n.x, n.y, n.z, _v1.x, _v1.y, _v1.z, -d, 0);
          }
        } else {
          // Every penetrating corner becomes a contact — that is what lets a
          // block rock onto an edge and topple instead of sinking flat.
          for (let k = 0; k < 8; k++) {
            const s = BOX_CORNERS[k];
            corner(b, s[0], s[1], s[2], _v1);
            const d = n.dot(_v1) + pl.planeConstant;
            if (d < 0) this._emit(pl, b, n.x, n.y, n.z, _v1.x, _v1.y, _v1.z, -d, k);
          }
        }
      }
    }
  }

  _sphereSphere(A, B) {
    _v1.subVectors(B.position, A.position);
    const r = A.radius + B.radius;
    const l2 = _v1.lengthSq();
    if (l2 >= r * r || l2 < 1e-12) return;
    const l = Math.sqrt(l2);
    _v1.multiplyScalar(1 / l);
    const depth = r - l;
    _v2.copy(A.position).addScaledVector(_v1, A.radius - depth * 0.5);
    this._emit(A, B, _v1.x, _v1.y, _v1.z, _v2.x, _v2.y, _v2.z, depth, 0);
  }

  /** `S` is the sphere, `X` the box. `flip` keeps the A→B normal convention. */
  _sphereBox(S, X, flip) {
    const m = X._m;
    _v1.subVectors(S.position, X.position);
    // Sphere centre in box space.
    const lx = _v1.x * m[0] + _v1.y * m[1] + _v1.z * m[2];
    const ly = _v1.x * m[3] + _v1.y * m[4] + _v1.z * m[5];
    const lz = _v1.x * m[6] + _v1.y * m[7] + _v1.z * m[8];
    const h = X.half;
    const cx = clamp(lx, -h.x, h.x), cy = clamp(ly, -h.y, h.y), cz = clamp(lz, -h.z, h.z);
    const inside = cx === lx && cy === ly && cz === lz;

    let nx, ny, nz, depth, feature;
    // Closest point back in world space.
    _v2.set(
      X.position.x + m[0] * cx + m[3] * cy + m[6] * cz,
      X.position.y + m[1] * cx + m[4] * cy + m[7] * cz,
      X.position.z + m[2] * cx + m[5] * cy + m[8] * cz
    );

    if (!inside) {
      _v3.subVectors(S.position, _v2);
      const d2 = _v3.lengthSq();
      if (d2 >= S.radius * S.radius || d2 < 1e-14) return;
      const d = Math.sqrt(d2);
      _v3.multiplyScalar(1 / d);
      depth = S.radius - d;
      // Sphere must move along +_v3, so the A→B normal (A = sphere) is -_v3.
      nx = -_v3.x; ny = -_v3.y; nz = -_v3.z;
      feature = ((cx !== lx ? 1 : 0) | (cy !== ly ? 2 : 0) | (cz !== lz ? 4 : 0)) |
                ((lx < 0 ? 8 : 0) | (ly < 0 ? 16 : 0) | (lz < 0 ? 32 : 0));
    } else {
      // Centre inside: escape along the shallowest face.
      const dx = h.x - Math.abs(lx), dy = h.y - Math.abs(ly), dz = h.z - Math.abs(lz);
      let k = 0, dmin = dx;
      if (dy < dmin) { k = 1; dmin = dy; }
      if (dz < dmin) { k = 2; dmin = dz; }
      const sgn = (k === 0 ? lx : k === 1 ? ly : lz) < 0 ? -1 : 1;
      axis(m, k, _v3).multiplyScalar(sgn);
      depth = S.radius + dmin;
      nx = -_v3.x; ny = -_v3.y; nz = -_v3.z;
      feature = 56 + k * 2 + (sgn > 0 ? 1 : 0);
    }

    if (flip) this._emit(X, S, -nx, -ny, -nz, _v2.x, _v2.y, _v2.z, depth, feature);
    else this._emit(S, X, nx, ny, nz, _v2.x, _v2.y, _v2.z, depth, feature);
  }

  /**
   * OBB vs OBB by separating axis, then face clipping for a real manifold.
   *
   * The cross-product axes are deliberately penalised by a small epsilon so
   * that near-parallel boxes (a tidy tower) resolve on a *face* axis and get a
   * four-point manifold. Falling back to an edge axis there is the classic
   * cause of towers that shiver and then explode.
   */
  _boxBox(A, B) {
    const ma = A._m, mb = B._m;
    for (let i = 0; i < 3; i++) { axis(ma, i, _axA[i]); axis(mb, i, _axB[i]); }

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const r = _axA[i].dot(_axB[j]);
        _R[i * 3 + j] = r;
        _AbsR[i * 3 + j] = Math.abs(r) + 1e-6;
      }
    }

    _v1.subVectors(B.position, A.position);
    for (let i = 0; i < 3; i++) _tA[i] = _v1.dot(_axA[i]);

    const a = _ha, b = _hb;
    a[0] = A.half.x; a[1] = A.half.y; a[2] = A.half.z;
    b[0] = B.half.x; b[1] = B.half.y; b[2] = B.half.z;

    let best = Infinity, bestType = -1, bestIdx = 0, bestSign = 1, bi = 0, bj = 0;

    // Faces of A.
    for (let i = 0; i < 3; i++) {
      const ra = a[i];
      const rb = b[0] * _AbsR[i * 3] + b[1] * _AbsR[i * 3 + 1] + b[2] * _AbsR[i * 3 + 2];
      const s = Math.abs(_tA[i]);
      const o = ra + rb - s;
      if (o < 0) return;
      if (o < best) { best = o; bestType = 0; bestIdx = i; bestSign = _tA[i] < 0 ? -1 : 1; }
    }
    // Faces of B. The 10 µm hysteresis matters: two neatly stacked boxes have
    // *identical* overlap on A's top face and B's bottom face, and whichever
    // wins decides which body's corners become the manifold points. Letting
    // that flip frame to frame hands warm-started impulses to the wrong corner
    // and the stack shears itself apart.
    for (let j = 0; j < 3; j++) {
      const ra = a[0] * _AbsR[j] + a[1] * _AbsR[3 + j] + a[2] * _AbsR[6 + j];
      const rb = b[j];
      const tb = _v1.dot(_axB[j]);
      const o = ra + rb - Math.abs(tb);
      if (o < 0) return;
      if (o < best - 1e-5) { best = o; bestType = 1; bestIdx = j; bestSign = tb < 0 ? -1 : 1; }
    }
    // Edge × edge.
    for (let i = 0; i < 3; i++) {
      const i1 = (i + 1) % 3, i2 = (i + 2) % 3;
      for (let j = 0; j < 3; j++) {
        const j1 = (j + 1) % 3, j2 = (j + 2) % 3;
        const ra = a[i1] * _AbsR[i2 * 3 + j] + a[i2] * _AbsR[i1 * 3 + j];
        const rb = b[j1] * _AbsR[i * 3 + j2] + b[j2] * _AbsR[i * 3 + j1];
        const s = Math.abs(_tA[i2] * _R[i1 * 3 + j] - _tA[i1] * _R[i2 * 3 + j]);
        const o = ra + rb - s;
        if (o < 0) return;
        const len = Math.sqrt(Math.max(1e-12, 1 - _R[i * 3 + j] * _R[i * 3 + j]));
        if (len < 1e-4) continue;                 // axes parallel: not separating
        const on = o / len;
        if (on < best - 1e-3) { best = on; bestType = 2; bi = i; bj = j; }
      }
    }
    if (bestType < 0) return;

    if (bestType === 2) {
      // Normal is the cross axis, oriented from A toward B.
      _v2.crossVectors(_axA[bi], _axB[bj]).normalize();
      if (_v2.dot(_v1) < 0) _v2.negate();
      // Held in locals: closestOnLines() borrows the shared scratch vectors.
      const nx = _v2.x, ny = _v2.y, nz = _v2.z;
      // Support edge on each body, then closest points between the two lines.
      _v3.copy(A.position);
      for (let k = 0; k < 3; k++) {
        if (k === bi) continue;
        _v3.addScaledVector(_axA[k], (_axA[k].dot(_v2) >= 0 ? a[k] : -a[k]));
      }
      _v4.copy(B.position);
      for (let k = 0; k < 3; k++) {
        if (k === bj) continue;
        _v4.addScaledVector(_axB[k], (_axB[k].dot(_v2) <= 0 ? b[k] : -b[k]));
      }
      closestOnLines(_v3, _axA[bi], _v4, _axB[bj], _v5);
      this._emit(A, B, nx, ny, nz, _v5.x, _v5.y, _v5.z, best, 48 + bi * 3 + bj);
      return;
    }

    // --- face case: clip the incident face against the reference face ------
    const refIsA = bestType === 0;
    const ref = refIsA ? A : B;
    const inc = refIsA ? B : A;
    const refAx = refIsA ? _axA : _axB;
    const incAx = refIsA ? _axB : _axA;
    const refHalf = refIsA ? a : b;
    const incHalf = refIsA ? b : a;
    const k = bestIdx;
    const refSign = refIsA ? bestSign : -bestSign;   // outward, pointing at `inc`

    // nRef points out of the reference face; the A→B normal follows from it.
    const nRef = _v2.copy(refAx[k]).multiplyScalar(refSign);
    const nabX = refIsA ? nRef.x : -nRef.x;
    const nabY = refIsA ? nRef.y : -nRef.y;
    const nabZ = refIsA ? nRef.z : -nRef.z;

    // Incident face: the one on `inc` most anti-parallel to nRef.
    let ik = 0, bestDot = Infinity, iSign = 1;
    for (let i = 0; i < 3; i++) {
      const d = incAx[i].dot(nRef);
      if (d < bestDot) { bestDot = d; ik = i; iSign = 1; }
      if (-d < bestDot) { bestDot = -d; ik = i; iSign = -1; }
    }
    const iu = (ik + 1) % 3, iv = (ik + 2) % 3;

    // Four corners of that face, in a stable winding.
    _v3.copy(inc.position).addScaledVector(incAx[ik], incHalf[ik] * iSign);
    let count = 4;
    for (let i = 0; i < 4; i++) {
      _polyA[i].copy(_v3)
        .addScaledVector(incAx[iu], incHalf[iu] * FACE_SIGNS[i * 2])
        .addScaledVector(incAx[iv], incHalf[iv] * FACE_SIGNS[i * 2 + 1]);
    }

    // Clip against the reference face's four side planes.
    const ru = (k + 1) % 3, rv = (k + 2) % 3;
    let src = _polyA, dst = _polyB;
    for (let ci = 0; ci < 2; ci++) {
      const cax = ci === 0 ? ru : rv;
      const hh = refHalf[cax];
      for (let sg = 0; sg < 2; sg++) {
        count = clipPlane(src, count, dst, refAx[cax], sg === 0 ? 1 : -1, ref.position, hh);
        const t = src; src = dst; dst = t;
        if (count === 0) return;
      }
    }

    // Keep the penetrating points, deepest four.
    _v4.copy(ref.position).addScaledVector(nRef, refHalf[k]);
    let kept = 0;
    for (let i = 0; i < count; i++) {
      const sep = _v1.copy(src[i]).sub(_v4).dot(nRef);
      if (sep > 0.001) continue;
      _clipDepth[kept] = -sep;
      if (kept !== i) src[kept].copy(src[i]);
      kept++;
    }
    if (kept === 0) {
      // Degenerate clip (grazing edge): fall back to a single centre contact.
      _v5.copy(inc.position).addScaledVector(nRef, -incHalf[ik] * iSign);
      this._emit(A, B, nabX, nabY, nabZ, _v5.x, _v5.y, _v5.z, best,
        (refIsA ? 0 : 24) + k * 8 + 7);
      return;
    }
    // A four-point manifold is all a box face can meaningfully carry. Reduce by
    // *spread*, not by depth: four points hugging one corner support no torque
    // at all, which is the difference between a tower and a pile.
    if (kept > 4) kept = reduceManifold(src, kept, refAx[ru], refAx[rv], ref.position);
    for (let i = 0; i < kept; i++) {
      const pt = src[i];
      this._emit(A, B, nabX, nabY, nabZ, pt.x, pt.y, pt.z, _clipDepth[i],
        (refIsA ? 0 : 24) + k * 8 + i);
    }
  }

  /* ---------------------------------------------------------------- solver */

  _prepare(c, h) {
    const A = c.a, B = c.b;
    c.ra.subVectors(c.point, A.position);
    c.rb.subVectors(c.point, B.position);
    tangentBasis(c.normal, c.t1, c.t2);

    c.nMass = 1 / effectiveMass(A, B, c.ra, c.rb, c.normal);
    c.t1Mass = 1 / effectiveMass(A, B, c.ra, c.rb, c.t1);
    c.t2Mass = 1 / effectiveMass(A, B, c.ra, c.rb, c.t2);

    // Restitution only above a threshold — otherwise resting contacts keep
    // handing each other tiny bounces and the stack never settles.
    const vn = relVel(A, B, c.ra, c.rb, c.normal);
    c.restBias = vn < -REST_THRESHOLD ? -c.restitution * vn : 0;

    // Split-impulse target: close the overlap beyond the slop, capped.
    c.posBias = Math.min(MAX_CORRECTION, BAUMGARTE * Math.max(0, c.depth - SLOP) / h);

    // Seed the accumulators from the previous step. Warm starting is the whole
    // reason an 8-iteration solver can hold a tower up: iteration 0 already
    // starts from very nearly the right answer.
    const w = this._warm.get(c.key);
    if (w && this.steps - w.stamp <= 2) {
      c.nImp = w.n; c.t1Imp = w.t1; c.t2Imp = w.t2;
    } else {
      c.nImp = c.t1Imp = c.t2Imp = 0;
    }
    c.pImp = 0;
  }

  _warmStart(c) {
    if (c.nImp === 0 && c.t1Imp === 0 && c.t2Imp === 0) return;
    _v1.set(0, 0, 0)
      .addScaledVector(c.normal, c.nImp)
      .addScaledVector(c.t1, c.t1Imp)
      .addScaledVector(c.t2, c.t2Imp);
    applyPair(c.a, c.b, _v1, c.ra, c.rb);
  }

  _solveVelocity(c) {
    const A = c.a, B = c.b;

    // Normal first, so friction gets an up-to-date bound.
    let vn = relVel(A, B, c.ra, c.rb, c.normal);
    let lambda = -(vn - c.restBias) * c.nMass;
    let old = c.nImp;
    c.nImp = Math.max(0, old + lambda);
    lambda = c.nImp - old;
    if (lambda !== 0) {
      _v1.copy(c.normal).multiplyScalar(lambda);
      applyPair(A, B, _v1, c.ra, c.rb);
    }

    // Coulomb bound from the normal impulse solved a moment ago. Note we do
    // *not* early-out at zero: the clamp below has to unwind any warm-started
    // friction, otherwise the impulse books stop balancing.
    const bound = c.friction * c.nImp;

    let vt = relVel(A, B, c.ra, c.rb, c.t1);
    lambda = -vt * c.t1Mass;
    old = c.t1Imp;
    c.t1Imp = clamp(old + lambda, -bound, bound);
    lambda = c.t1Imp - old;
    if (lambda !== 0) {
      _v1.copy(c.t1).multiplyScalar(lambda);
      applyPair(A, B, _v1, c.ra, c.rb);
    }

    vt = relVel(A, B, c.ra, c.rb, c.t2);
    lambda = -vt * c.t2Mass;
    old = c.t2Imp;
    c.t2Imp = clamp(old + lambda, -bound, bound);
    lambda = c.t2Imp - old;
    if (lambda !== 0) {
      _v1.copy(c.t2).multiplyScalar(lambda);
      applyPair(A, B, _v1, c.ra, c.rb);
    }
  }

  _solvePosition(c) {
    if (c.posBias <= 0) return;
    const A = c.a, B = c.b;
    const vn = relPseudoVel(A, B, c.ra, c.rb, c.normal);
    let lambda = (c.posBias - vn) * c.nMass;
    const old = c.pImp;
    c.pImp = Math.max(0, old + lambda);
    lambda = c.pImp - old;
    if (lambda === 0) return;
    _v1.copy(c.normal).multiplyScalar(lambda);
    applyPseudoPair(A, B, _v1, c.ra, c.rb);
  }

  /* ------------------------------------------------------------------ sync */

  _syncMeshes(alpha) {
    const recomputeBounds = (this._syncBoundsCounter++ & 31) === 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const mesh = b.mesh;
      if (!mesh) continue;
      // A sleeping body only needs writing once.
      if (b.asleep && b._synced) continue;

      _p.lerpVectors(b.prevPosition, b.position, alpha);
      _q.copy(b.prevQuaternion).slerp(b.quaternion, alpha);

      if (b.localSpace && mesh.parent) {
        _m4.copy(mesh.parent.matrixWorld).invert();
        _p.applyMatrix4(_m4);
        mesh.parent.getWorldQuaternion(_pq).invert();
        _q.premultiply(_pq);
      }
      mesh.position.copy(_p);
      mesh.quaternion.copy(_q);
      b._synced = b.asleep;
    }
    if (recomputeBounds) {
      for (let i = 0; i < this.cloths.length; i++) this.cloths[i]._refreshBounds();
    }
    for (let i = 0; i < this.cloths.length; i++) this.cloths[i].writeBack();
    for (let i = 0; i < this.ropes.length; i++) this.ropes[i].writeBack();
  }

  /* ------------------------------------------------------------- raycast -- */

  /**
   * Nearest hit along a ray. Returns `{ body, distance, point, normal }` or
   * null. Used for picking toys and for "where does the pour land".
   */
  raycast(origin, dir, maxDist = Infinity) {
    const o = _toVec3(origin, _ta);
    const d = _v4.copy(_toVec3(dir, _tb)).normalize();
    let bestT = maxDist, bestBody = null;
    const nrm = new THREE.Vector3();

    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const t = b.shape === 'sphere' ? raySphere(o, d, b.position, b.radius)
                                     : rayBox(o, d, b);
      if (t !== null && t >= 0 && t < bestT) { bestT = t; bestBody = b; }
    }
    for (let i = 0; i < this.planes.length; i++) {
      const pl = this.planes[i];
      const denom = pl.planeNormal.dot(d);
      if (Math.abs(denom) < 1e-8) continue;
      const t = -(pl.planeNormal.dot(o) + pl.planeConstant) / denom;
      if (t >= 0 && t < bestT) { bestT = t; bestBody = pl; }
    }
    if (!bestBody) return null;

    const point = new THREE.Vector3().copy(o).addScaledVector(d, bestT);
    if (bestBody.shape === 'plane') nrm.copy(bestBody.planeNormal);
    else if (bestBody.shape === 'sphere') nrm.subVectors(point, bestBody.position).normalize();
    else boxNormalAt(bestBody, point, nrm);
    return { body: bestBody, distance: bestT, point, normal: nrm };
  }

  /* --------------------------------------------------------------- cloth -- */

  /**
   * Verlet cloth over the mesh's own vertex grid. The mesh must be a
   * PlaneGeometry (or anything with a matching `cols × rows` vertex layout);
   * its current world-space vertices become the rest state.
   */
  addCloth(mesh, opts = {}) {
    const c = new Cloth(this, mesh, opts);
    this.cloths.push(c);
    return c;
  }

  removeCloth(handle) {
    const i = this.cloths.indexOf(handle);
    if (i >= 0) this.cloths.splice(i, 1);
    return this;
  }

  /** Verlet chain through `points` (Vector3s or [x,y,z]). Hair, mobiles, cords. */
  addRope(points, opts = {}) {
    const r = new Rope(this, points, opts);
    this.ropes.push(r);
    return r;
  }

  removeRope(handle) {
    const i = this.ropes.indexOf(handle);
    if (i >= 0) this.ropes.splice(i, 1);
    return this;
  }
}

/* ------------------------------------------------------- solver helpers -- */

function effectiveMass(A, B, ra, rb, dir) {
  let k = A.invMass + B.invMass;
  if (A.invMass > 0) {
    _v2.crossVectors(ra, dir);
    mul3(A._invIW, _v2, _v3);
    _v3.cross(ra);
    k += _v3.dot(dir);
  }
  if (B.invMass > 0) {
    _v2.crossVectors(rb, dir);
    mul3(B._invIW, _v2, _v3);
    _v3.cross(rb);
    k += _v3.dot(dir);
  }
  return k > 1e-12 ? k : 1e-12;
}

function relVel(A, B, ra, rb, dir) {
  _v2.crossVectors(B.angularVelocity, rb).add(B.velocity);
  _v3.crossVectors(A.angularVelocity, ra).add(A.velocity);
  return _v2.sub(_v3).dot(dir);
}

function relPseudoVel(A, B, ra, rb, dir) {
  _v2.crossVectors(B._pw, rb).add(B._pv);
  _v3.crossVectors(A._pw, ra).add(A._pv);
  return _v2.sub(_v3).dot(dir);
}

/** Impulse `j` applied as -j on A and +j on B (normals point A→B). */
function applyPair(A, B, j, ra, rb) {
  if (A.invMass > 0) {
    A.velocity.addScaledVector(j, -A.invMass);
    _v2.crossVectors(ra, j);
    mul3(A._invIW, _v2, _v3);
    A.angularVelocity.sub(_v3);
  }
  if (B.invMass > 0) {
    B.velocity.addScaledVector(j, B.invMass);
    _v2.crossVectors(rb, j);
    mul3(B._invIW, _v2, _v3);
    B.angularVelocity.add(_v3);
  }
}

function applyPseudoPair(A, B, j, ra, rb) {
  if (A.invMass > 0) {
    A._pv.addScaledVector(j, -A.invMass);
    _v2.crossVectors(ra, j);
    mul3(A._invIW, _v2, _v3);
    A._pw.sub(_v3);
  }
  if (B.invMass > 0) {
    B._pv.addScaledVector(j, B.invMass);
    _v2.crossVectors(rb, j);
    mul3(B._invIW, _v2, _v3);
    B._pw.add(_v3);
  }
}

/** q ← normalize(q + ½ ω q dt). Exact enough at 120 Hz and cheap. */
function integrateQuaternion(q, w, h) {
  const hx = w.x * h * 0.5, hy = w.y * h * 0.5, hz = w.z * h * 0.5;
  const x = q.x, y = q.y, z = q.z, ww = q.w;
  q.set(
    x + (hx * ww + hy * z - hz * y),
    y + (hy * ww + hz * x - hx * z),
    z + (hz * ww + hx * y - hy * x),
    ww + (-hx * x - hy * y - hz * z)
  ).normalize();
}

function corner(b, sx, sy, sz, out) {
  const m = b._m, h = b.half;
  const x = sx * h.x, y = sy * h.y, z = sz * h.z;
  return out.set(
    b.position.x + m[0] * x + m[3] * y + m[6] * z,
    b.position.y + m[1] * x + m[4] * y + m[7] * z,
    b.position.z + m[2] * x + m[5] * y + m[8] * z
  );
}

/**
 * Sutherland–Hodgman against the plane `dot(p - origin, axis) * sgn <= h`.
 * Returns the new vertex count written into `dst`.
 *
 * The tolerance matters more than it looks. Two neatly stacked blocks have
 * their incident corners sitting *exactly* on the reference face's side planes,
 * so at zero tolerance a rounding error of 1e-18 registers as a crossing and
 * the clip emits a duplicate point at t≈0. The manifold then has 5–8 points
 * that shuffle every frame, warm starting attaches yesterday's impulse to a
 * different corner, and the tower slowly walks sideways. Snapping the boundary
 * shut with an epsilon keeps the four real corners, in a stable order.
 */
function clipPlane(src, n, dst, ax, sgn, origin, h) {
  const eps = 1e-9 + h * 1e-5;
  let out = 0;
  for (let i = 0; i < n; i++) {
    const cur = src[i], nxt = src[(i + 1) % n];
    const dc = (cur.x - origin.x) * ax.x + (cur.y - origin.y) * ax.y + (cur.z - origin.z) * ax.z;
    const dn = (nxt.x - origin.x) * ax.x + (nxt.y - origin.y) * ax.y + (nxt.z - origin.z) * ax.z;
    const sc = sgn * dc - h;
    const sn = sgn * dn - h;
    const inC = sc <= eps, inN = sn <= eps;
    if (inC && out < 10) dst[out++].copy(cur);
    if (inC !== inN && out < 10) {
      const t = sc / (sc - sn);
      dst[out++].copy(cur).lerp(nxt, t);
    }
  }
  return out;
}

const _keepIdx = new Int32Array(4);
const _keepOut = new Int32Array(4);
const _reduceTmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _reduceDepth = new Float64Array(4);

/**
 * Trim a clipped polygon down to the four points that are extreme along the
 * reference face's two tangent axes. Deterministic and maximally spread.
 */
function reduceManifold(poly, n, axU, axV, origin) {
  let maxU = -Infinity, minU = Infinity, maxV = -Infinity, minV = Infinity;
  let iMaxU = 0, iMinU = 0, iMaxV = 0, iMinV = 0;
  for (let i = 0; i < n; i++) {
    const dx = poly[i].x - origin.x, dy = poly[i].y - origin.y, dz = poly[i].z - origin.z;
    const u = dx * axU.x + dy * axU.y + dz * axU.z;
    const v = dx * axV.x + dy * axV.y + dz * axV.z;
    if (u > maxU) { maxU = u; iMaxU = i; }
    if (u < minU) { minU = u; iMinU = i; }
    if (v > maxV) { maxV = v; iMaxV = i; }
    if (v < minV) { minV = v; iMinV = i; }
  }
  _keepIdx[0] = iMaxU; _keepIdx[1] = iMinU; _keepIdx[2] = iMaxV; _keepIdx[3] = iMinV;

  let out = 0;
  for (let s = 0; s < 4; s++) {
    const idx = _keepIdx[s];
    let dup = false;
    for (let t = 0; t < out; t++) if (_keepOut[t] === idx) { dup = true; break; }
    if (dup) continue;
    _keepOut[out] = idx;
    _reduceTmp[out].copy(poly[idx]);
    _reduceDepth[out] = _clipDepth[idx];
    out++;
  }
  for (let i = 0; i < out; i++) { poly[i].copy(_reduceTmp[i]); _clipDepth[i] = _reduceDepth[i]; }
  return out;
}

/** Midpoint of the shortest segment between two infinite lines. */
function closestOnLines(p1, d1, p2, d2, out) {
  _v1.subVectors(p1, p2);
  const a = d1.dot(d1), b = d1.dot(d2), c = d2.dot(_v1), e = d2.dot(d2), f = d1.dot(_v1);
  const denom = a * e - b * b;
  let s = 0, t = 0;
  if (Math.abs(denom) > 1e-9) s = (b * c - e * f) / denom;
  t = (b * s + c) / (e || 1);
  out.copy(p1).addScaledVector(d1, s);
  _v2.copy(p2).addScaledVector(d2, t);
  return out.add(_v2).multiplyScalar(0.5);
}

function raySphere(o, d, c, r) {
  _v1.subVectors(o, c);
  const b = _v1.dot(d);
  const cc = _v1.lengthSq() - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = -b - s, t1 = -b + s;
  if (t0 >= 0) return t0;
  if (t1 >= 0) return t1;
  return null;
}

function rayBox(o, d, box) {
  const m = box._m, h = box.half;
  _v1.subVectors(o, box.position);
  // Ray into box space.
  const ox = _v1.x * m[0] + _v1.y * m[1] + _v1.z * m[2];
  const oy = _v1.x * m[3] + _v1.y * m[4] + _v1.z * m[5];
  const oz = _v1.x * m[6] + _v1.y * m[7] + _v1.z * m[8];
  const dx = d.x * m[0] + d.y * m[1] + d.z * m[2];
  const dy = d.x * m[3] + d.y * m[4] + d.z * m[5];
  const dz = d.x * m[6] + d.y * m[7] + d.z * m[8];
  let tmin = -Infinity, tmax = Infinity;
  const o3 = [ox, oy, oz], d3 = [dx, dy, dz], h3 = [h.x, h.y, h.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d3[i]) < 1e-9) {
      if (o3[i] < -h3[i] || o3[i] > h3[i]) return null;
    } else {
      const inv = 1 / d3[i];
      let t1 = (-h3[i] - o3[i]) * inv, t2 = (h3[i] - o3[i]) * inv;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : null);
}

function boxNormalAt(box, point, out) {
  const m = box._m, h = box.half;
  _v1.subVectors(point, box.position);
  const l = [
    _v1.x * m[0] + _v1.y * m[1] + _v1.z * m[2],
    _v1.x * m[3] + _v1.y * m[4] + _v1.z * m[5],
    _v1.x * m[6] + _v1.y * m[7] + _v1.z * m[8]
  ];
  const h3 = [h.x, h.y, h.z];
  let k = 0, best = -Infinity;
  for (let i = 0; i < 3; i++) {
    const r = Math.abs(l[i]) / h3[i];
    if (r > best) { best = r; k = i; }
  }
  axis(m, k, out).multiplyScalar(l[k] < 0 ? -1 : 1);
  return out;
}

/* ---------------------------------------------------------------- cloth -- */

/**
 * Position-based verlet cloth.
 *
 * Structural + shear + bend constraints, solved Gauss–Seidel. Bend uses a long
 * (skip-one) distance constraint at low stiffness, which is what stops a
 * blanket folding into paper creases without the cost of a real bending model.
 * Collision is one-way: cloth is pushed out of spheres and planes but never
 * pushes back, which is exactly right for a blanket over a baby.
 */
class Cloth {
  constructor(world, mesh, o = {}) {
    this.world = world;
    this.mesh = mesh;
    this.geometry = mesh.geometry;
    const params = this.geometry.parameters || {};
    this.cols = o.cols ?? params.widthSegments ?? 1;
    this.rows = o.rows ?? params.heightSegments ?? 1;

    const pos = this.geometry.attributes.position;
    this.count = pos.count;
    if ((this.cols + 1) * (this.rows + 1) !== this.count) {
      // Fall back to a square guess so a hand-built grid still works.
      const s = Math.round(Math.sqrt(this.count)) - 1;
      this.cols = this.rows = Math.max(1, s);
    }

    mesh.updateWorldMatrix(true, false);
    this._toLocal = new THREE.Matrix4();

    // World-space particle state.
    this.p = new Float64Array(this.count * 3);
    this.prev = new Float64Array(this.count * 3);
    this.w = new Float64Array(this.count);      // inverse mass; 0 = pinned
    this.pinPos = new Float64Array(this.count * 3);

    const m = mesh.matrixWorld;
    for (let i = 0; i < this.count; i++) {
      _v1.fromBufferAttribute(pos, i).applyMatrix4(m);
      this.p[i * 3] = this.prev[i * 3] = _v1.x;
      this.p[i * 3 + 1] = this.prev[i * 3 + 1] = _v1.y;
      this.p[i * 3 + 2] = this.prev[i * 3 + 2] = _v1.z;
      this.w[i] = 1;
    }

    this.stiffness = o.stiffness ?? 0.9;
    this.shearStiffness = o.shear ?? 0.6;
    this.bendStiffness = o.bend ?? 0.25;
    this.iterations = o.iterations ?? 4;
    this.damping = o.damping ?? 0.012;
    this.thickness = o.thickness ?? 0.01;
    this.gravityScale = o.gravityScale ?? 1;
    this.collide = o.collide !== false;
    this.collideBodies = o.collideBodies !== false;
    this.wind = _toVec3(o.wind || [0, 0, 0]).clone();
    this.bounds = new Float64Array(6);
    this.maxStretch = o.maxStretch ?? 1.08;      // hard cap, stops rubber-banding

    /** Extra colliders: { object|position, radius }. */
    this.colliders = [];
    if (o.colliders) for (const c of o.colliders) this.addCollider(c.object || c.position, c.radius);

    this._buildConstraints();
    this._applyPins(o.pins);

    this._normalTick = 0;
  }

  index(x, y) { return y * (this.cols + 1) + x; }

  _buildConstraints() {
    const idx = [];
    const rest = [];
    const kind = [];
    const C = this.cols, R = this.rows;
    const add = (i, j, k) => {
      const dx = this.p[i * 3] - this.p[j * 3];
      const dy = this.p[i * 3 + 1] - this.p[j * 3 + 1];
      const dz = this.p[i * 3 + 2] - this.p[j * 3 + 2];
      idx.push(i, j);
      rest.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
      kind.push(k);
    };
    for (let y = 0; y <= R; y++) {
      for (let x = 0; x <= C; x++) {
        const i = this.index(x, y);
        if (x < C) add(i, this.index(x + 1, y), 0);
        if (y < R) add(i, this.index(x, y + 1), 0);
        if (x < C && y < R) {
          add(i, this.index(x + 1, y + 1), 1);
          add(this.index(x + 1, y), this.index(x, y + 1), 1);
        }
        if (x < C - 1) add(i, this.index(x + 2, y), 2);
        if (y < R - 1) add(i, this.index(x, y + 2), 2);
      }
    }
    this.cIdx = Int32Array.from(idx);
    this.cRest = Float64Array.from(rest);
    this.cKind = Uint8Array.from(kind);
  }

  _applyPins(pins) {
    if (!pins) return;
    if (pins === 'top') {
      for (let x = 0; x <= this.cols; x++) this.pin(this.index(x, 0));
    } else if (pins === 'corners') {
      this.pin(this.index(0, 0));
      this.pin(this.index(this.cols, 0));
      this.pin(this.index(0, this.rows));
      this.pin(this.index(this.cols, this.rows));
    } else if (typeof pins === 'function') {
      for (let y = 0; y <= this.rows; y++) {
        for (let x = 0; x <= this.cols; x++) {
          const i = this.index(x, y);
          if (pins(i, x, y)) this.pin(i);
        }
      }
    } else if (Array.isArray(pins)) {
      for (const i of pins) this.pin(i);
    }
  }

  /** Freeze a particle, optionally at a new world position. */
  pin(i, worldPos) {
    this.w[i] = 0;
    if (worldPos) {
      const v = _toVec3(worldPos);
      this.p[i * 3] = this.prev[i * 3] = v.x;
      this.p[i * 3 + 1] = this.prev[i * 3 + 1] = v.y;
      this.p[i * 3 + 2] = this.prev[i * 3 + 2] = v.z;
    }
    this.pinPos[i * 3] = this.p[i * 3];
    this.pinPos[i * 3 + 1] = this.p[i * 3 + 1];
    this.pinPos[i * 3 + 2] = this.p[i * 3 + 2];
    return this;
  }

  unpin(i) { this.w[i] = 1; return this; }

  /** Move a pin — e.g. a blanket corner following a dragged hand. */
  setPin(i, worldPos) { return this.pin(i, worldPos); }

  /** `objOrPos` may be an Object3D (world position is read every step). */
  addCollider(objOrPos, radius = 0.1) {
    this.colliders.push({
      object: objOrPos && objOrPos.isObject3D ? objOrPos : null,
      position: objOrPos && objOrPos.isObject3D ? new THREE.Vector3() : _toVec3(objOrPos).clone(),
      radius
    });
    return this;
  }

  setWind(v) { this.wind.copy(_toVec3(v)); return this; }

  step(h) {
    const n = this.count, p = this.p, prev = this.prev, w = this.w;
    const g = this.world.gravity;
    const ax = (g.x * this.gravityScale + this.wind.x) * h * h;
    const ay = (g.y * this.gravityScale + this.wind.y) * h * h;
    const az = (g.z * this.gravityScale + this.wind.z) * h * h;
    // `damping` is authored per 1/120 s substep; the pow keeps it honest if the
    // world's fixed step is ever retuned.
    const d = Math.pow(1 - this.damping, h * 120);

    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      const i3 = i * 3;
      const vx = (p[i3] - prev[i3]) * d;
      const vy = (p[i3 + 1] - prev[i3 + 1]) * d;
      const vz = (p[i3 + 2] - prev[i3 + 2]) * d;
      prev[i3] = p[i3]; prev[i3 + 1] = p[i3 + 1]; prev[i3 + 2] = p[i3 + 2];
      p[i3] += vx + ax;
      p[i3 + 1] += vy + ay;
      p[i3 + 2] += vz + az;
    }

    for (let it = 0; it < this.iterations; it++) {
      this._solveConstraints();
      this._enforcePins();
    }
    if (this.collide) this._collide();
  }

  /** World AABB of the sheet, used to cull collider tests. */
  _computeBounds(pad) {
    const p = this.p, b = this.bounds;
    b[0] = b[1] = b[2] = Infinity;
    b[3] = b[4] = b[5] = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      if (p[i3] < b[0]) b[0] = p[i3];
      if (p[i3 + 1] < b[1]) b[1] = p[i3 + 1];
      if (p[i3 + 2] < b[2]) b[2] = p[i3 + 2];
      if (p[i3] > b[3]) b[3] = p[i3];
      if (p[i3 + 1] > b[4]) b[4] = p[i3 + 1];
      if (p[i3 + 2] > b[5]) b[5] = p[i3 + 2];
    }
    b[0] -= pad; b[1] -= pad; b[2] -= pad;
    b[3] += pad; b[4] += pad; b[5] += pad;
    return b;
  }

  _solveConstraints() {
    const idx = this.cIdx, rest = this.cRest, kind = this.cKind;
    const p = this.p, w = this.w;
    const ks = [this.stiffness, this.shearStiffness, this.bendStiffness];
    const maxStretch = this.maxStretch;

    for (let c = 0, ci = 0; ci < rest.length; ci++, c += 2) {
      const i = idx[c], j = idx[c + 1];
      const wi = w[i], wj = w[j];
      const sum = wi + wj;
      if (sum === 0) continue;
      const i3 = i * 3, j3 = j * 3;
      const dx = p[j3] - p[i3], dy = p[j3 + 1] - p[i3 + 1], dz = p[j3 + 2] - p[i3 + 2];
      const l2 = dx * dx + dy * dy + dz * dz;
      if (l2 < 1e-12) continue;
      const l = Math.sqrt(l2);
      const r = rest[ci];
      // A hard length cap on top of the soft constraint: cotton simply does not
      // stretch, and letting it do so is what makes cheap cloth look like slime.
      let k = ks[kind[ci]];
      if (l > r * maxStretch) k = 1;
      const diff = ((l - r) / l) * k / sum;
      const cx = dx * diff, cy = dy * diff, cz = dz * diff;
      if (wi > 0) { p[i3] += cx * wi; p[i3 + 1] += cy * wi; p[i3 + 2] += cz * wi; }
      if (wj > 0) { p[j3] -= cx * wj; p[j3 + 1] -= cy * wj; p[j3 + 2] -= cz * wj; }
    }
  }

  _enforcePins() {
    const p = this.p, w = this.w, pin = this.pinPos;
    for (let i = 0; i < this.count; i++) {
      if (w[i] !== 0) continue;
      const i3 = i * 3;
      p[i3] = pin[i3]; p[i3 + 1] = pin[i3 + 1]; p[i3 + 2] = pin[i3 + 2];
    }
  }

  _collide() {
    const p = this.p, prev = this.prev, w = this.w, n = this.count;
    const th = this.thickness;
    const bnd = this._computeBounds(th);

    // Explicit colliders first (baby limbs, a hand, the tub).
    for (const c of this.colliders) {
      if (c.object) c.object.getWorldPosition(c.position);
      const r = c.radius + th;
      pushOutSphere(p, prev, w, n, c.position, r);
    }
    // Then any rigid body whose AABB actually reaches the sheet. The cull
    // matters: a play scene can hold a dozen blocks the blanket never touches.
    if (this.collideBodies) {
      for (const b of this.world.bodies) {
        const a = b._aabb;
        if (a[0] > bnd[3] || a[3] < bnd[0] || a[1] > bnd[4] ||
            a[4] < bnd[1] || a[2] > bnd[5] || a[5] < bnd[2]) continue;
        if (b.shape === 'sphere') pushOutSphere(p, prev, w, n, b.position, b.radius + th);
        else if (b.shape === 'box') pushOutBox(p, prev, w, n, b, th);
      }
    }
    // And the floor / walls.
    for (const pl of this.world.planes) {
      const nx = pl.planeNormal.x, ny = pl.planeNormal.y, nz = pl.planeNormal.z;
      for (let i = 0; i < n; i++) {
        if (w[i] === 0) continue;
        const i3 = i * 3;
        const d = nx * p[i3] + ny * p[i3 + 1] + nz * p[i3 + 2] + pl.planeConstant - th;
        if (d >= 0) continue;
        p[i3] -= nx * d; p[i3 + 1] -= ny * d; p[i3 + 2] -= nz * d;
        // Kill the tangential velocity so cloth grips the floor instead of
        // skating across it.
        prev[i3] += (p[i3] - prev[i3]) * 0.5;
        prev[i3 + 1] += (p[i3 + 1] - prev[i3 + 1]) * 0.5;
        prev[i3 + 2] += (p[i3 + 2] - prev[i3 + 2]) * 0.5;
      }
    }
  }

  writeBack() {
    const attr = this.geometry.attributes.position;
    this.mesh.updateWorldMatrix(true, false);
    this._toLocal.copy(this.mesh.matrixWorld).invert();
    const p = this.p;
    for (let i = 0; i < this.count; i++) {
      _v1.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(this._toLocal);
      attr.setXYZ(i, _v1.x, _v1.y, _v1.z);
    }
    attr.needsUpdate = true;
    // Normals every other frame: the shading difference is invisible and it
    // halves the cost of a large blanket.
    if ((this._normalTick++ & 1) === 0) {
      this.geometry.computeVertexNormals();
      this.geometry.attributes.normal.needsUpdate = true;
    }
  }

  _refreshBounds() { this.geometry.computeBoundingSphere(); }

  _detach() { /* nothing GPU-side is owned by the cloth itself */ }

  remove() { this.world.removeCloth(this); return this; }
}

function pushOutSphere(p, prev, w, n, c, r) {
  const r2 = r * r;
  for (let i = 0; i < n; i++) {
    if (w[i] === 0) continue;
    const i3 = i * 3;
    const dx = p[i3] - c.x, dy = p[i3 + 1] - c.y, dz = p[i3 + 2] - c.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r2 || d2 < 1e-12) continue;
    const d = Math.sqrt(d2);
    const s = (r - d) / d;
    p[i3] += dx * s; p[i3 + 1] += dy * s; p[i3 + 2] += dz * s;
    // Light friction against the surface — cloth should cling, not slide off.
    prev[i3] += (p[i3] - prev[i3]) * 0.25;
    prev[i3 + 1] += (p[i3 + 1] - prev[i3 + 1]) * 0.25;
    prev[i3 + 2] += (p[i3 + 2] - prev[i3 + 2]) * 0.25;
  }
}

/**
 * Push verlet particles out of an oriented box. Same closest-point logic as
 * the sphere-vs-box narrowphase, minus the impulse machinery — a blanket only
 * ever needs to end up *outside* the mattress.
 */
function pushOutBox(p, prev, w, n, box, th) {
  const m = box._m, h = box.half, c = box.position;
  const hx = h.x + th, hy = h.y + th, hz = h.z + th;
  for (let i = 0; i < n; i++) {
    if (w[i] === 0) continue;
    const i3 = i * 3;
    const dx = p[i3] - c.x, dy = p[i3 + 1] - c.y, dz = p[i3 + 2] - c.z;
    const lx = dx * m[0] + dy * m[1] + dz * m[2];
    const ly = dx * m[3] + dy * m[4] + dz * m[5];
    const lz = dx * m[6] + dy * m[7] + dz * m[8];
    if (lx < -hx || lx > hx || ly < -hy || ly > hy || lz < -hz || lz > hz) continue;
    // Inside: leave by the nearest face.
    const ex = hx - Math.abs(lx), ey = hy - Math.abs(ly), ez = hz - Math.abs(lz);
    let k = 0, e = ex;
    if (ey < e) { k = 1; e = ey; }
    if (ez < e) { k = 2; e = ez; }
    const s = (k === 0 ? lx : k === 1 ? ly : lz) < 0 ? -e : e;
    const ax = m[3 * k], ay = m[3 * k + 1], az = m[3 * k + 2];
    p[i3] += ax * s; p[i3 + 1] += ay * s; p[i3 + 2] += az * s;
    prev[i3] += (p[i3] - prev[i3]) * 0.25;
    prev[i3 + 1] += (p[i3 + 1] - prev[i3 + 1]) * 0.25;
    prev[i3 + 2] += (p[i3 + 2] - prev[i3 + 2]) * 0.25;
  }
}

/* ----------------------------------------------------------------- rope -- */

/**
 * Verlet chain. Distance constraints between neighbours plus a soft skip-one
 * constraint that gives the strand bending resistance — without it, hair
 * collapses into a straight line the moment it stops moving.
 */
class Rope {
  constructor(world, points, o = {}) {
    this.world = world;
    const pts = points.map(v => _toVec3(v).clone());
    this.count = pts.length;
    this.p = new Float64Array(this.count * 3);
    this.prev = new Float64Array(this.count * 3);
    this.w = new Float64Array(this.count);
    this.pinPos = new Float64Array(this.count * 3);

    for (let i = 0; i < this.count; i++) {
      const v = pts[i];
      this.p[i * 3] = this.prev[i * 3] = v.x;
      this.p[i * 3 + 1] = this.prev[i * 3 + 1] = v.y;
      this.p[i * 3 + 2] = this.prev[i * 3 + 2] = v.z;
      this.w[i] = 1;
    }

    this.rest = new Float64Array(this.count - 1);
    for (let i = 0; i < this.count - 1; i++) {
      this.rest[i] = Math.hypot(
        this.p[(i + 1) * 3] - this.p[i * 3],
        this.p[(i + 1) * 3 + 1] - this.p[i * 3 + 1],
        this.p[(i + 1) * 3 + 2] - this.p[i * 3 + 2]);
    }
    this.rest2 = new Float64Array(Math.max(0, this.count - 2));
    for (let i = 0; i < this.count - 2; i++) {
      this.rest2[i] = Math.hypot(
        this.p[(i + 2) * 3] - this.p[i * 3],
        this.p[(i + 2) * 3 + 1] - this.p[i * 3 + 1],
        this.p[(i + 2) * 3 + 2] - this.p[i * 3 + 2]);
    }

    this.stiffness = o.stiffness ?? 1.0;
    this.bend = o.bend ?? 0.18;
    this.iterations = o.iterations ?? 5;
    this.damping = o.damping ?? 0.02;
    this.gravityScale = o.gravityScale ?? 1;
    this.thickness = o.thickness ?? 0.006;
    this.collide = !!o.collide;
    this.wind = _toVec3(o.wind || [0, 0, 0]).clone();

    if (o.pinFirst !== false) this.pin(0);
    if (o.pinLast) this.pin(this.count - 1);
    if (Array.isArray(o.pins)) for (const i of o.pins) this.pin(i);

    /** Live world-space points; safe to read every frame for geometry rebuilds. */
    this.points = [];
    for (let i = 0; i < this.count; i++) this.points.push(new THREE.Vector3());
    this.writeBack();
  }

  pin(i, worldPos) {
    this.w[i] = 0;
    if (worldPos) {
      const v = _toVec3(worldPos);
      this.p[i * 3] = this.prev[i * 3] = v.x;
      this.p[i * 3 + 1] = this.prev[i * 3 + 1] = v.y;
      this.p[i * 3 + 2] = this.prev[i * 3 + 2] = v.z;
    }
    this.pinPos[i * 3] = this.p[i * 3];
    this.pinPos[i * 3 + 1] = this.p[i * 3 + 1];
    this.pinPos[i * 3 + 2] = this.p[i * 3 + 2];
    return this;
  }

  unpin(i) { this.w[i] = 1; return this; }

  /** Drive a pinned link from outside — a hair root following the head bone. */
  setAnchor(i, worldPos) { return this.pin(i, worldPos); }

  step(h) {
    const p = this.p, prev = this.prev, w = this.w, n = this.count;
    const g = this.world.gravity;
    const ax = (g.x * this.gravityScale + this.wind.x) * h * h;
    const ay = (g.y * this.gravityScale + this.wind.y) * h * h;
    const az = (g.z * this.gravityScale + this.wind.z) * h * h;
    const d = Math.pow(1 - this.damping, h * 120);

    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      const i3 = i * 3;
      const vx = (p[i3] - prev[i3]) * d;
      const vy = (p[i3 + 1] - prev[i3 + 1]) * d;
      const vz = (p[i3 + 2] - prev[i3 + 2]) * d;
      prev[i3] = p[i3]; prev[i3 + 1] = p[i3 + 1]; prev[i3 + 2] = p[i3 + 2];
      p[i3] += vx + ax; p[i3 + 1] += vy + ay; p[i3 + 2] += vz + az;
    }

    for (let it = 0; it < this.iterations; it++) {
      solveChain(p, w, this.rest, 1, this.stiffness);
      solveChain(p, w, this.rest2, 2, this.bend);
      for (let i = 0; i < n; i++) {
        if (w[i] !== 0) continue;
        const i3 = i * 3;
        p[i3] = this.pinPos[i3]; p[i3 + 1] = this.pinPos[i3 + 1]; p[i3 + 2] = this.pinPos[i3 + 2];
      }
    }

    if (this.collide) {
      for (const b of this.world.bodies) {
        if (b.shape !== 'sphere') continue;
        pushOutSphere(p, prev, w, n, b.position, b.radius + this.thickness);
      }
      for (const pl of this.world.planes) {
        const nx = pl.planeNormal.x, ny = pl.planeNormal.y, nz = pl.planeNormal.z;
        for (let i = 0; i < n; i++) {
          if (w[i] === 0) continue;
          const i3 = i * 3;
          const dd = nx * p[i3] + ny * p[i3 + 1] + nz * p[i3 + 2] + pl.planeConstant - this.thickness;
          if (dd >= 0) continue;
          p[i3] -= nx * dd; p[i3 + 1] -= ny * dd; p[i3 + 2] -= nz * dd;
        }
      }
    }
  }

  writeBack() {
    for (let i = 0; i < this.count; i++) {
      this.points[i].set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
    }
  }

  /** Copy the chain into a BufferAttribute (a Line, or a ribbon's spine). */
  writeTo(attribute) {
    const n = Math.min(this.count, attribute.count);
    for (let i = 0; i < n; i++) {
      attribute.setXYZ(i, this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
    }
    attribute.needsUpdate = true;
    return this;
  }

  remove() { this.world.removeRope(this); return this; }
}

function solveChain(p, w, rest, stride, k) {
  for (let i = 0; i < rest.length; i++) {
    const a = i, b = i + stride;
    const wa = w[a], wb = w[b];
    const sum = wa + wb;
    if (sum === 0) continue;
    const a3 = a * 3, b3 = b * 3;
    const dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2];
    const l2 = dx * dx + dy * dy + dz * dz;
    if (l2 < 1e-12) continue;
    const l = Math.sqrt(l2);
    const diff = ((l - rest[i]) / l) * k / sum;
    const cx = dx * diff, cy = dy * diff, cz = dz * diff;
    if (wa > 0) { p[a3] += cx * wa; p[a3 + 1] += cy * wa; p[a3 + 2] += cz * wa; }
    if (wb > 0) { p[b3] -= cx * wb; p[b3 + 1] -= cy * wb; p[b3 + 2] -= cz * wb; }
  }
}

/* ---------------------------------------------------------------- utils -- */

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();
/**
 * Accept a Vector3, an [x,y,z] array or any {x,y,z}. A Vector3 is passed
 * through unchanged (read-only!); everything else lands in `out`, so any call
 * site that converts *two* arguments must pass two different scratch vectors.
 */
function _toVec3(v, out = _ta) {
  if (!v) return out.set(0, 0, 0);
  if (v.isVector3) return v;
  if (Array.isArray(v)) return out.set(v[0] || 0, v[1] || 0, v[2] || 0);
  return out.set(v.x || 0, v.y || 0, v.z || 0);
}

/** Measure a mesh to pick a collision primitive when the caller didn't. */
function inferShape(mesh, o) {
  const out = { shape: 'box', radius: 0.1, size: [0.2, 0.2, 0.2] };
  const geo = mesh?.geometry;
  if (!geo) return out;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const s = mesh.scale;
  const sx = (bb.max.x - bb.min.x) * Math.abs(s.x);
  const sy = (bb.max.y - bb.min.y) * Math.abs(s.y);
  const sz = (bb.max.z - bb.min.z) * Math.abs(s.z);
  out.size = [sx, sy, sz];
  out.radius = Math.max(sx, sy, sz) * 0.5;
  const type = geo.type || '';
  const roundish = /Sphere|Icosahedron|Capsule|Dodecahedron|Octahedron/.test(type);
  const cubic = Math.abs(sx - sy) < sx * 0.35 && Math.abs(sx - sz) < sx * 0.35;
  out.shape = (roundish || (cubic && /Sphere/.test(type))) ? 'sphere' : 'box';
  if (roundish) out.radius = (sx + sy + sz) / 6;
  if (o.shape === 'sphere') out.shape = 'sphere';
  return out;
}

export default PhysicsWorld;
