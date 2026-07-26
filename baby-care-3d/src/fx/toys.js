/* ============================================================================
 * fx/toys.js — shared prop builders for the あそぶ / ねんね scenes
 * ----------------------------------------------------------------------------
 * Everything a 4-year-old is meant to *believe in* lives here: blocks that look
 * injection-moulded and hand-painted, a ball with a real parting line, a latex
 * balloon, a glockenspiel whose bar lengths come from L ∝ 1/√f, a board book
 * whose pages bend rather than flip.
 *
 * Rules this file obeys:
 *   · every surface comes from engine/materials.js, every canvas from
 *     engine/textures.js (TEX.painted is memoised and freed by TEX.disposeAll,
 *     so activities must not dispose those textures themselves);
 *   · nothing is added to the scene here — builders return objects, the calling
 *     activity parents and disposes them via `Resources`;
 *   · no emoji, no text glyphs in 3D. Motifs are real extruded shapes and the
 *     printed art is drawn with vector paths.
 * ========================================================================== */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as MAT from '../engine/materials.js';
import * as TEX from '../engine/textures.js';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

/* ========================================================================== *
 * Resources — ownership bookkeeping so dispose() can be total
 * ========================================================================== */

export class Resources {
  constructor() {
    this._geo = new Set();
    this._mat = new Set();
    this._tex = new Set();
    this._roots = new Set();
    this._fns = [];
    this._shared = new Map();
  }

  geo(g) { if (g) this._geo.add(g); return g; }
  mat(m) { if (m) this._mat.add(m); return m; }
  /** Only for textures this module allocates itself (TEX.* are cache-owned). */
  tex(t) { if (t) this._tex.add(t); return t; }

  /** A scene-graph root that must be detached from its parent on dispose. */
  root(o) { if (o) this._roots.add(o); return o; }

  /** Arbitrary teardown (physics handles, lights, DOM labels…). */
  onDispose(fn) { if (fn) this._fns.push(fn); return fn; }

  /** Memoised per-activity resource (shared geometry for hit proxies etc.). */
  shared(key, build) {
    if (!this._shared.has(key)) this._shared.set(key, build());
    return this._shared.get(key);
  }

  /** Track every geometry + material reachable from `root`. */
  claim(root) {
    root.traverse((o) => {
      if (o.geometry) this.geo(o.geometry);
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => this.mat(x));
      else if (m) this.mat(m);
    });
    return root;
  }

  dispose() {
    for (const fn of this._fns) { try { fn(); } catch (e) { /* keep tearing down */ } }
    this._fns.length = 0;

    for (const o of this._roots) o.parent?.remove(o);
    this._roots.clear();

    for (const v of this._shared.values()) {
      if (v && typeof v.dispose === 'function') v.dispose();
    }
    this._shared.clear();

    for (const g of this._geo) g.dispose?.();
    this._geo.clear();
    // materials.js memoises a handful of surfaces; never free those.
    for (const m of this._mat) { if (!m.userData?.shared) m.dispose?.(); }
    this._mat.clear();
    for (const t of this._tex) t.dispose?.();
    this._tex.clear();
  }
}

/* ========================================================================== *
 * Small helpers
 * ========================================================================== */

/** Fire-and-forget audio: activity code must never explode on an unknown cue. */
export function snd(ctx, name, opts) {
  try { ctx.audio?.play?.(name, opts); } catch (e) { /* silent */ }
}

/** World position of a room anchor, with a hard fallback if it doesn't exist. */
export function anchorPoint(ctx, name, fallback) {
  const a = ctx.room?.anchor?.(name);
  if (a && a.isObject3D) {
    a.updateWorldMatrix(true, false);
    return new THREE.Vector3().setFromMatrixPosition(a.matrixWorld);
  }
  return new THREE.Vector3().fromArray(fallback);
}

/** Does a room anchor already carry real furniture, or is it a bare locator? */
export function anchorHasFurniture(ctx, name) {
  const a = ctx.room?.anchor?.(name);
  if (!a || !a.isObject3D) return false;
  let found = false;
  a.traverse((o) => { if (o !== a && o.isMesh && o.visible) found = true; });
  return found;
}

/**
 * Generous invisible hit target. r180's raycaster ignores `visible`, so these
 * cost zero draw calls while giving small props a thumb-sized tap radius.
 */
export function hitProxy(res, radius, tag, payload) {
  const geo = res.shared('proxy-sphere', () => new THREE.SphereGeometry(1, 8, 6));
  const mat = res.shared('proxy-mat', () => new THREE.MeshBasicMaterial({ visible: false }));
  const m = new THREE.Mesh(geo, mat);
  m.scale.setScalar(radius);
  m.visible = false;
  m.userData.tag = tag;
  if (payload) Object.assign(m.userData, payload);
  return m;
}

/**
 * Rounded / bevelled box. Vertices outside the inset core are pushed onto the
 * corner sphere and given the exact analytic normal, so the bevel shades
 * smoothly instead of faceting. Returns a `wear` attribute in 0..1 measuring how
 * "cornery" each vertex is — that is what paints the rubbed-back edges.
 */
export function roundedBoxGeometry(w, h, d, r, seg = 6) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const hx = Math.max(1e-5, w / 2 - r);
  const hy = Math.max(1e-5, h / 2 - r);
  const hz = Math.max(1e-5, d / 2 - r);
  const wear = new Float32Array(pos.count);
  const p = new THREE.Vector3(), q = new THREE.Vector3(), n = new THREE.Vector3();
  const span = Math.sqrt(3) - 1;

  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    q.set(clamp(p.x, -hx, hx), clamp(p.y, -hy, hy), clamp(p.z, -hz, hz));
    n.copy(p).sub(q);
    const len = n.length();
    if (len > 1e-6) {
      n.multiplyScalar(1 / len);
      p.copy(q).addScaledVector(n, r);
      pos.setXYZ(i, p.x, p.y, p.z);
      nor.setXYZ(i, n.x, n.y, n.z);
      wear[i] = clamp((len / r - 1) / span, 0, 1);
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  g.setAttribute('wear', new THREE.BufferAttribute(wear, 1));
  g.computeBoundingSphere();
  return g;
}

/** Paint a flat (or per-vertex) colour attribute onto a geometry. */
function tint(geo, colorOrFn) {
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const fn = typeof colorOrFn === 'function' ? colorOrFn : null;
  if (!fn) c.set(colorOrFn);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (fn) { v.fromBufferAttribute(pos, i); fn(c, i, v, geo); }
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Strip everything merge-incompatible so mergeGeometries never console.errors. */
function normalise(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const key of Object.keys(g.attributes)) {
    if (key !== 'position' && key !== 'normal' && key !== 'uv' && key !== 'color') {
      g.deleteAttribute(key);
    }
  }
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  g.clearGroups();
  return g;
}

function mergeAll(list) {
  const parts = list.map(normalise);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/* ------------------------------------------------------------- shapes ---- */

function starShape(r, points = 5, innerRatio = 0.46) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? r * innerRatio : r;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function heartShape(r) {
  const s = new THREE.Shape();
  const k = r / 1.15;
  s.moveTo(0, -1.05 * k);
  s.bezierCurveTo(-1.4 * k, -0.15 * k, -0.95 * k, 1.0 * k, 0, 0.42 * k);
  s.bezierCurveTo(0.95 * k, 1.0 * k, 1.4 * k, -0.15 * k, 0, -1.05 * k);
  return s;
}

function circleShape(r) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

function triangleShape(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function roundedSquareShape(r) {
  const s = new THREE.Shape();
  const k = r * 0.78, c = r * 0.24;
  s.moveTo(-k + c, -k);
  s.lineTo(k - c, -k); s.quadraticCurveTo(k, -k, k, -k + c);
  s.lineTo(k, k - c); s.quadraticCurveTo(k, k, k - c, k);
  s.lineTo(-k + c, k); s.quadraticCurveTo(-k, k, -k, k - c);
  s.lineTo(-k, -k + c); s.quadraticCurveTo(-k, -k, -k + c, -k);
  return s;
}

function flowerShape(r) {
  const s = new THREE.Shape();
  const petals = 6;
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const rad = r * (0.62 + 0.38 * Math.abs(Math.cos(a * petals / 2)));
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function moonShape(r) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, Math.PI * 0.34, Math.PI * 1.66, false);
  s.absarc(r * 0.52, 0, r * 0.86, Math.PI * 1.42, Math.PI * 0.58, true);
  return s;
}

const MOTIFS = [starShape, heartShape, circleShape, triangleShape,
  roundedSquareShape, flowerShape, moonShape];

/* ========================================================================== *
 * Contact shadows — one instanced quad, per-instance opacity
 * ========================================================================== */

export function makeContactShadows(res, count, { color = 0x2a1720, opacity = 0.62 } = {}) {
  const geo = res.geo(new THREE.PlaneGeometry(1, 1));
  geo.rotateX(-Math.PI / 2);

  const mat = res.mat(new THREE.MeshBasicMaterial({
    map: TEX.radialSprite({ size: 128, power: 1.5 }),
    color: new THREE.Color(color),
    transparent: true,
    depthWrite: false,
    opacity,
    toneMapped: false
  }));

  // Per-instance alpha so a block lifted off the floor fades its own contact.
  const alphas = new Float32Array(count).fill(0);
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
  };
  mat.customProgramCacheKey = () => 'contact-shadow';

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alphas, 1));
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = count;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let cursor = 0;

  return {
    mesh,
    begin() { cursor = 0; },
    /**
     * @param {THREE.Vector3} pos  world position of the caster
     * @param {number} radius      caster radius
     * @param {number} floorY      the surface the shadow lands on
     */
    add(pos, radius, floorY = 0, strength = 1) {
      if (cursor >= count) return;
      const lift = clamp(pos.y - floorY, 0, 0.5);
      // Contacts stay tight and dark; the blob widens + fades as it lifts.
      const spread = radius * (2.2 + lift * 5.5);
      const a = strength * clamp(1 - lift * 2.6, 0, 1);
      p.set(pos.x, floorY + 0.0015, pos.z);
      sc.set(spread, 1, spread);
      m4.compose(p, q, sc);
      mesh.setMatrixAt(cursor, m4);
      alphas[cursor] = a;
      cursor++;
    },
    end() {
      for (let i = cursor; i < count; i++) alphas[i] = 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.aAlpha.needsUpdate = true;
    }
  };
}

/* ========================================================================== *
 * Physics adapter
 * ----------------------------------------------------------------------------
 * ctx.physics owns the bodies. This wrapper exists so a scene keeps working
 * (and keeps looking right) whatever a given build of the solver supports — it
 * self-integrates only when addBody is unavailable, and otherwise just reads
 * the engine body back.
 * ========================================================================== */

class FallbackBody {
  constructor(mesh, opts) {
    this.mesh = mesh;
    this.shape = opts.shape || 'box';
    this.radius = opts.radius ?? 0.05;
    this.size = opts.size ? new THREE.Vector3().fromArray(opts.size) : new THREE.Vector3(0.1, 0.1, 0.1);
    this.mass = opts.mass ?? 1;
    this.restitution = opts.restitution ?? 0.2;
    this.friction = opts.friction ?? 0.6;
    this.position = mesh.position.clone();
    this.velocity = new THREE.Vector3();
    this.quaternion = mesh.quaternion.clone();
    this.angularVelocity = new THREE.Vector3();
    this.asleep = false;
    this._q = new THREE.Quaternion();
  }

  get halfHeight() {
    return this.shape === 'sphere' ? this.radius : this.size.y / 2;
  }

  step(dt, gravity, floorY) {
    if (this.asleep) return;
    this.velocity.y += gravity * dt;
    this.position.addScaledVector(this.velocity, dt);

    const rest = floorY + this.halfHeight;
    if (this.position.y <= rest) {
      this.position.y = rest;
      if (this.velocity.y < 0) {
        const vy = -this.velocity.y;
        this.velocity.y = vy > 0.35 ? vy * this.restitution : 0;
      }
      const f = Math.exp(-this.friction * 7 * dt);
      this.velocity.x *= f;
      this.velocity.z *= f;
      this.angularVelocity.multiplyScalar(Math.exp(-this.friction * 5 * dt));
      const still = this.velocity.lengthSq() < 4e-4 && this.angularVelocity.lengthSq() < 4e-3;
      if (still) {
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.asleep = true;
      }
    }

    const w = this.angularVelocity;
    if (w.lengthSq() > 1e-8) {
      const ang = w.length() * dt;
      this._q.setFromAxisAngle(w.clone().normalize(), ang);
      this.quaternion.premultiply(this._q).normalize();
    }
  }
}

export class BodySet {
  constructor(ctx, { floorY = 0, gravity = -9.81 } = {}) {
    this.ctx = ctx;
    this.floorY = floorY;
    this.gravity = gravity;
    this.entries = [];
    this._ownsGround = false;

    const phys = ctx.physics;
    this.native = !!(phys && typeof phys.addBody === 'function');

    // Exactly one ground plane per physics world, whoever gets there first.
    if (this.native && typeof phys.addPlane === 'function' && !phys.__groundPlane) {
      try {
        phys.__groundPlane = phys.addPlane(new THREE.Vector3(0, 1, 0), floorY,
          { restitution: 0.24, friction: 0.72 }) || true;
        this._ownsGround = true;
      } catch (e) { this._ownsGround = false; }
    }
  }

  add(mesh, opts) {
    let body = null;
    if (this.native) {
      try { body = this.ctx.physics.addBody(mesh, opts); } catch (e) { body = null; }
    }
    if (!body || !body.position) body = new FallbackBody(mesh, opts);
    const entry = { mesh, body, opts, fallback: body instanceof FallbackBody };
    this.entries.push(entry);
    return entry;
  }

  remove(entry) {
    const i = this.entries.indexOf(entry);
    if (i >= 0) this.entries.splice(i, 1);
    if (!entry.fallback) {
      try { this.ctx.physics.removeBody(entry.body); } catch (e) { /* ignore */ }
    }
  }

  /** Teleport a body and its mesh, optionally putting it straight to sleep. */
  place(entry, position, quaternion, sleep = true) {
    const b = entry.body;
    b.position.copy(position);
    if (quaternion) b.quaternion.copy(quaternion);
    b.velocity?.set(0, 0, 0);
    b.angularVelocity?.set(0, 0, 0);
    b.asleep = sleep;
    entry.mesh.position.copy(position);
    if (quaternion) entry.mesh.quaternion.copy(quaternion);
  }

  wake(entry) { entry.body.asleep = false; }

  impulse(entry, v, spin) {
    const b = entry.body;
    b.asleep = false;
    b.velocity.add(v);
    if (spin && b.angularVelocity) b.angularVelocity.add(spin);
  }

  update(dt) {
    for (const e of this.entries) {
      if (e.fallback) {
        e.body.step(dt, this.gravity, this.floorY);
        e.mesh.position.copy(e.body.position);
        e.mesh.quaternion.copy(e.body.quaternion);
      } else if (e.body.position && !e.mesh.userData.physicsDrivesMesh) {
        // Contract says bodies are written into the mesh each step; mirroring is
        // cheap and makes us correct either way.
        e.mesh.position.copy(e.body.position);
        if (e.body.quaternion) e.mesh.quaternion.copy(e.body.quaternion);
      }
    }
  }

  dispose() {
    for (const e of this.entries.slice()) this.remove(e);
    this.entries.length = 0;
    const phys = this.ctx.physics;
    if (this._ownsGround && phys?.__groundPlane) {
      try { if (phys.__groundPlane !== true) phys.removeBody(phys.__groundPlane); } catch (e) { /* ignore */ }
      phys.__groundPlane = null;
    }
  }
}

/* ========================================================================== *
 * Verlet rope + rope mesh (balloon string)
 * ========================================================================== */

export class VerletRope {
  constructor(points, { gravity = -3.2, damping = 0.985, iterations = 8, stiffness = 1 } = {}) {
    this.points = points.map((p) => p.clone());
    this.prev = points.map((p) => p.clone());
    this.rest = [];
    for (let i = 1; i < this.points.length; i++) {
      this.rest.push(this.points[i].distanceTo(this.points[i - 1]));
    }
    this.gravity = gravity;
    this.damping = damping;
    this.iterations = iterations;
    this.stiffness = stiffness;
    this.pins = new Map();
    this._t = new THREE.Vector3();
  }

  pin(index, position) { this.pins.set(index, position.clone()); }

  step(dt) {
    const d = Math.min(dt, 1 / 45);
    for (let i = 0; i < this.points.length; i++) {
      if (this.pins.has(i)) { this.points[i].copy(this.pins.get(i)); this.prev[i].copy(this.points[i]); continue; }
      const p = this.points[i], q = this.prev[i];
      this._t.copy(p);
      p.x += (p.x - q.x) * this.damping;
      p.y += (p.y - q.y) * this.damping + this.gravity * d * d;
      p.z += (p.z - q.z) * this.damping;
      q.copy(this._t);
    }
    for (let it = 0; it < this.iterations; it++) {
      for (let i = 1; i < this.points.length; i++) {
        const a = this.points[i - 1], b = this.points[i];
        this._t.copy(b).sub(a);
        const len = this._t.length() || 1e-6;
        const corr = ((len - this.rest[i - 1]) / len) * 0.5 * this.stiffness;
        const ax = this.pins.has(i - 1) ? 0 : 1;
        const bx = this.pins.has(i) ? 0 : 1;
        const total = ax + bx || 1;
        a.addScaledVector(this._t, corr * (2 * ax / total));
        b.addScaledVector(this._t, -corr * (2 * bx / total));
      }
      for (const [i, pos] of this.pins) this.points[i].copy(pos);
    }
  }
}

/** Thin extruded ribbon that follows a list of world-space points. */
export class RopeMesh {
  constructor(res, count, { radius = 0.0022, color = 0xfff3f6, sides = 4 } = {}) {
    this.count = count;
    this.sides = sides;
    this.radius = radius;

    const verts = count * sides;
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const idx = [];
    for (let i = 0; i < count - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const a = i * sides + s;
        const b = i * sides + (s + 1) % sides;
        const c = (i + 1) * sides + s;
        const d = (i + 1) * sides + (s + 1) % sides;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = res.geo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(idx);
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));

    const mat = res.mat(MAT.makePlastic({ color, matte: 0.7, clearcoat: 0.2, seed: 12 }));
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;

    this._tan = new THREE.Vector3();
    this._nrm = new THREE.Vector3();
    this._bin = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 0, 1);
  }

  update(points) {
    const n = Math.min(points.length, this.count);
    const pos = this.mesh.geometry.attributes.position;
    const nor = this.mesh.geometry.attributes.normal;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(n - 1, i + 1)];
      this._tan.copy(b).sub(a);
      if (this._tan.lengthSq() < 1e-10) this._tan.set(0, -1, 0);
      this._tan.normalize();
      this._nrm.copy(this._up).cross(this._tan);
      if (this._nrm.lengthSq() < 1e-8) this._nrm.set(1, 0, 0);
      this._nrm.normalize();
      this._bin.copy(this._tan).cross(this._nrm).normalize();
      // string tapers very slightly toward the free end — real cotton does
      const r = this.radius * (1 - 0.25 * (i / Math.max(1, n - 1)));
      for (let s = 0; s < this.sides; s++) {
        const ang = (s / this.sides) * Math.PI * 2;
        const cx = Math.cos(ang), sy = Math.sin(ang);
        const vi = i * this.sides + s;
        const nx = this._nrm.x * cx + this._bin.x * sy;
        const ny = this._nrm.y * cx + this._bin.y * sy;
        const nz = this._nrm.z * cx + this._bin.z * sy;
        pos.setXYZ(vi, p.x + nx * r, p.y + ny * r, p.z + nz * r);
        nor.setXYZ(vi, nx, ny, nz);
      }
    }
    // collapse any unused tail onto the last point so nothing streaks
    for (let i = n; i < this.count; i++) {
      const p = points[n - 1] || new THREE.Vector3();
      for (let s = 0; s < this.sides; s++) {
        pos.setXYZ(i * this.sides + s, p.x, p.y, p.z);
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }
}

/* ========================================================================== *
 * Building blocks
 * ========================================================================== */

/**
 * A set of painted-hardwood baby blocks.
 *  · chunky bevel with paint rubbed back to bare wood on the edges
 *  · a real extruded motif proud of four faces
 *  · a debossed maker's mark on the underside
 * Body + motifs + mark merge into one geometry driven by vertex colours, so a
 * whole tower is one material and one draw call per block.
 */
export function makeBlockSet(res, { count = 8, size = 0.062, seed = 5 } = {}) {
  const PAINT = [0xef6f92, 0xf6b martian = 0];   // replaced below
  return null;
}
