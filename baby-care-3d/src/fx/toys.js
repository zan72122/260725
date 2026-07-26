/* ============================================================================
 * fx/toys.js — shared prop builders for the あそぶ / ねんね scenes
 * ----------------------------------------------------------------------------
 * Everything a 4-year-old is meant to *believe in* lives here: blocks that look
 * moulded and hand-painted, a ball with a real parting line, a latex balloon, a
 * glockenspiel whose bar lengths come from L ∝ 1/√f, a board book whose pages
 * bend rather than flip.
 *
 * Rules this file obeys:
 *   · every surface comes from engine/materials.js, every canvas from
 *     engine/textures.js (TEX.painted is memoised and freed by TEX.disposeAll,
 *     so activities must not dispose those textures themselves);
 *   · nothing is added to the scene here — builders return objects; the calling
 *     activity parents them and disposes them through `Resources`;
 *   · no emoji and no text glyphs in 3D. Motifs are extruded shapes and printed
 *     art is drawn with vector paths.
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
  /** Only for textures this code allocates itself — TEX.* are cache-owned. */
  tex(t) { if (t) this._tex.add(t); return t; }

  /** A scene-graph root that must be detached from its parent on dispose. */
  root(o) { if (o) this._roots.add(o); return o; }

  /** Arbitrary teardown (physics handles, lights, UI labels…). */
  onDispose(fn) { if (fn) this._fns.push(fn); return fn; }

  /** Memoised per-activity resource (shared hit-proxy geometry etc.). */
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

    for (const v of this._shared.values()) if (v && typeof v.dispose === 'function') v.dispose();
    this._shared.clear();

    for (const g of this._geo) g.dispose?.();
    this._geo.clear();
    // materials.js memoises a handful of surfaces — never free those.
    for (const m of this._mat) if (!m.userData?.shared) m.dispose?.();
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
  a.traverse((o) => { if (o !== a && o.isMesh) found = true; });
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
 * smoothly instead of faceting. A `wear` attribute (0..1) records how "cornery"
 * each vertex is — that is what paints rubbed-back edges.
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
  if (!g.attributes.color) tint(g, 0xffffff);
  g.clearGroups();
  return g;
}

function mergeAll(list) {
  const parts = list.map(normalise);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (merged) merged.computeBoundingSphere();
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
  const k = r / 1.1;
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
  for (let i = 0; i <= 84; i++) {
    const a = (i / 84) * Math.PI * 2;
    const rad = r * (0.6 + 0.4 * Math.abs(Math.cos(a * petals / 2)));
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function moonShape(r) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, Math.PI * 0.34, Math.PI * 1.66, false);
  s.absarc(r * 0.5, 0, r * 0.88, Math.PI * 1.4, Math.PI * 0.6, true);
  return s;
}

const MOTIFS = [starShape, heartShape, circleShape, triangleShape,
  roundedSquareShape, flowerShape, moonShape];

/* ========================================================================== *
 * Contact shadows — one instanced quad, per-instance opacity
 * ========================================================================== */

export function makeContactShadows(res, count, { color = 0x2a1720, opacity = 0.6 } = {}) {
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

  const alphas = new Float32Array(count);
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAlpha = aAlpha;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vAlpha;');
  };
  mat.customProgramCacheKey = () => 'contact-shadow';

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alphas, 1));
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let cursor = 0;

  return {
    mesh,
    begin() { cursor = 0; },
    add(pos, radius, floorY = 0, strength = 1) {
      if (cursor >= count) return;
      const lift = clamp(pos.y - floorY, 0, 0.6);
      // tight and dark on contact; widens and fades as the caster lifts off
      const spread = radius * (2.3 + lift * 5.0);
      const a = strength * clamp(1 - lift * 2.4, 0, 1);
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
 * ctx.physics owns the bodies. This wrapper exists so the scene keeps working
 * (and keeps looking right) whatever a given build of the solver supports: it
 * self-integrates only when addBody is unavailable, otherwise it just mirrors
 * the engine body.
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
    this._axis = new THREE.Vector3();
  }

  get halfHeight() { return this.shape === 'sphere' ? this.radius : this.size.y / 2; }

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
      if (this.velocity.lengthSq() < 4e-4 && this.angularVelocity.lengthSq() < 4e-3) {
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.asleep = true;
      }
    }

    const w = this.angularVelocity;
    const wl = w.length();
    if (wl > 1e-4) {
      this._axis.copy(w).multiplyScalar(1 / wl);
      this._q.setFromAxisAngle(this._axis, wl * dt);
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
    if (phys && typeof phys.addPlane === 'function' && !phys.__groundPlane) {
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
    const fallback = !body || !body.position;
    if (fallback) body = new FallbackBody(mesh, opts);
    const entry = { mesh, body, opts, fallback };
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
    if (quaternion && b.quaternion) b.quaternion.copy(quaternion);
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
    b.velocity?.add(v);
    if (spin && b.angularVelocity) b.angularVelocity.add(spin);
  }

  update(dt) {
    for (const e of this.entries) {
      if (e.fallback) {
        e.body.step(dt, this.gravity, this.floorY);
        e.mesh.position.copy(e.body.position);
        e.mesh.quaternion.copy(e.body.quaternion);
      } else if (e.body.position) {
        // The contract says bodies are written into the mesh each step, but
        // mirroring is cheap and keeps us correct either way.
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
  constructor(points, { gravity = -3.4, damping = 0.985, iterations = 8 } = {}) {
    this.points = points.map((p) => p.clone());
    this.prev = points.map((p) => p.clone());
    this.rest = [];
    for (let i = 1; i < this.points.length; i++) {
      this.rest.push(this.points[i].distanceTo(this.points[i - 1]));
    }
    this.gravity = gravity;
    this.damping = damping;
    this.iterations = iterations;
    this.pins = new Map();
    this._t = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  pin(index, position) {
    const v = this.pins.get(index);
    if (v) v.copy(position); else this.pins.set(index, position.clone());
  }

  step(dt) {
    const d = Math.min(dt, 1 / 45);
    for (let i = 0; i < this.points.length; i++) {
      if (this.pins.has(i)) {
        this.points[i].copy(this.pins.get(i));
        this.prev[i].copy(this.points[i]);
        continue;
      }
      const p = this.points[i], q = this.prev[i];
      this._s.copy(p);
      p.x += (p.x - q.x) * this.damping;
      p.y += (p.y - q.y) * this.damping + this.gravity * d * d;
      p.z += (p.z - q.z) * this.damping;
      q.copy(this._s);
    }
    for (let it = 0; it < this.iterations; it++) {
      for (let i = 1; i < this.points.length; i++) {
        const a = this.points[i - 1], b = this.points[i];
        this._t.copy(b).sub(a);
        const len = this._t.length() || 1e-6;
        const corr = (len - this.rest[i - 1]) / len;
        const aFree = this.pins.has(i - 1) ? 0 : 1;
        const bFree = this.pins.has(i) ? 0 : 1;
        const total = aFree + bFree;
        if (!total) continue;
        a.addScaledVector(this._t, corr * (aFree / total));
        b.addScaledVector(this._t, -corr * (bFree / total));
      }
      for (const [i, pos] of this.pins) this.points[i].copy(pos);
    }
  }
}

/** Thin tube that follows a list of world-space points. */
export class RopeMesh {
  constructor(res, count, { radius = 0.0024, color = 0xfff3f6, sides = 4, taper = 0.28, material = null } = {}) {
    this.count = count;
    this.sides = sides;
    this.radius = radius;
    this.taper = taper;

    const verts = count * sides;
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
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
    geo.setIndex(idx);

    const mat = material || res.mat(MAT.makePlastic({ color, matte: 0.72, clearcoat: 0.15, seed: 12 }));
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
    if (n < 2) return;
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
      const r = this.radius * (1 - this.taper * (i / (n - 1)));
      for (let s = 0; s < this.sides; s++) {
        const ang = (s / this.sides) * Math.PI * 2;
        const cx = Math.cos(ang), sy = Math.sin(ang);
        const nx = this._nrm.x * cx + this._bin.x * sy;
        const ny = this._nrm.y * cx + this._bin.y * sy;
        const nz = this._nrm.z * cx + this._bin.z * sy;
        const vi = i * this.sides + s;
        pos.setXYZ(vi, p.x + nx * r, p.y + ny * r, p.z + nz * r);
        nor.setXYZ(vi, nx, ny, nz);
      }
    }
    const tail = points[n - 1];
    for (let i = n; i < this.count; i++) {
      for (let s = 0; s < this.sides; s++) pos.setXYZ(i * this.sides + s, tail.x, tail.y, tail.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
  }
}

/* ========================================================================== *
 * つみき — painted hardwood blocks
 * ========================================================================== */

/**
 * A set of painted-hardwood baby blocks.
 *   · chunky bevel, with the paint rubbed back to bare wood along the edges
 *   · a real extruded motif standing proud of four faces
 *   · a debossed maker's mark on the underside
 * Body + motifs + mark merge into one geometry driven by vertex colours, so a
 * whole tower is one material and one draw call per block.
 */
export function makeBlockSet(res, { count = 8, size = 0.062, seed = 5 } = {}) {
  const paints = [0xe8657f, 0xf0a63c, 0xf6cf4a, 0x86c96b, 0x63b8d8, 0xa88bd8, 0xef8f5f, 0x7fc7b0];
  const bare = new THREE.Color(0xd9b183);      // the wood under the paint
  const motifColor = new THREE.Color(0xfff6e6);

  const material = res.mat(MAT.makeWood({
    light: 0xffffff, dark: 0xffffff, seed, ringScale: 34, clearcoat: 0.5, satin: 0.36, repeat: 1
  }));
  material.vertexColors = true;
  material.color.set(0xffffff);
  material.normalScale.set(0.45, 0.45);

  const bevel = size * 0.15;
  const blocks = [];

  for (let i = 0; i < count; i++) {
    const paint = new THREE.Color(paints[i % paints.length]);
    const body = roundedBoxGeometry(size, size, size, bevel, 7);
    const wear = body.attributes.wear;
    tint(body, (c, vi) => {
      // Paint thins on the bevel; the corners show bare wood plus a chalky
      // scuff. This single line is most of what says "played with".
      const w = wear.getX(vi);
      const worn = Math.pow(w, 1.6);
      c.copy(paint).lerp(bare, worn * 0.55);
      c.lerp(new THREE.Color(0xffffff), worn * 0.12);
    });
    body.deleteAttribute('wear');

    const parts = [body];
    const motifFn = MOTIFS[(i + 1) % MOTIFS.length];
    const motifR = size * 0.27;
    const relief = size * 0.045;
    const faces = [
      { rot: [0, 0, 0], t: [0, 0, size / 2 - relief * 0.5] },
      { rot: [0, Math.PI, 0], t: [0, 0, -(size / 2 - relief * 0.5)] },
      { rot: [0, Math.PI / 2, 0], t: [size / 2 - relief * 0.5, 0, 0] },
      { rot: [0, -Math.PI / 2, 0], t: [-(size / 2 - relief * 0.5), 0, 0] }
    ];
    for (const f of faces) {
      const g = new THREE.ExtrudeGeometry(motifFn(motifR), {
        depth: relief, bevelEnabled: true, bevelSegments: 1,
        bevelThickness: relief * 0.35, bevelSize: relief * 0.3, curveSegments: 8
      });
      g.translate(0, 0, -relief * 0.5);
      g.rotateY(f.rot[1]);
      g.translate(f.t[0], f.t[1], f.t[2]);
      tint(g, motifColor);
      parts.push(g);
    }

    // maker's mark — a debossed ring with three dots, on the underside
    const markR = size * 0.16;
    const ring = new THREE.Shape();
    ring.absarc(0, 0, markR, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, markR * 0.66, 0, Math.PI * 2, true);
    ring.holes.push(hole);
    const markParts = [ring];
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k / 3) * Math.PI * 2;
      const dot = new THREE.Shape();
      dot.absarc(Math.cos(a) * markR * 0.34, Math.sin(a) * markR * 0.34, markR * 0.14, 0, Math.PI * 2, false);
      markParts.push(dot);
    }
    for (const shp of markParts) {
      const g = new THREE.ExtrudeGeometry(shp, {
        depth: size * 0.02, bevelEnabled: false, curveSegments: 10
      });
      // debossed: sunk *into* the face
      g.translate(0, 0, -size * 0.02);
      g.rotateX(Math.PI / 2);
      g.translate(0, -size / 2 + size * 0.012, 0);
      tint(g, new THREE.Color(paint).multiplyScalar(0.62));
      parts.push(g);
    }

    const geo = res.geo(mergeAll(parts));
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.tag = 'block';
    mesh.userData.index = i;
    mesh.add(hitProxy(res, size * 1.15, 'block', { index: i }));
    blocks.push(mesh);
  }

  return { material, blocks, size, bevel };
}

/* ========================================================================== *
 * ボール — moulded two-piece plastic ball
 * ========================================================================== */

export function makeBall(res, { radius = 0.068 } = {}) {
  // Lathe profile: a sphere with a real moulding groove at the equator and the
  // faint flat left by the gate at the poles.
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const phi = t * Math.PI;                       // 0 = south pole
    let r = radius * Math.sin(phi);
    let y = -radius * Math.cos(phi);
    // groove: a narrow inward notch right on the parting line
    const seam = Math.exp(-Math.pow((t - 0.5) / 0.018, 2));
    r -= radius * 0.022 * seam;
    // moulding gates flatten the poles a hair
    const pole = Math.exp(-Math.pow((t - 0.5) / 0.46, 8));
    y *= 1 - 0.02 * (1 - pole);
    pts.push(new THREE.Vector2(Math.max(1e-4, r), y));
  }
  const geo = res.geo(new THREE.LatheGeometry(pts, 44));

  const print = TEX.painted('toy-ball-print', 512, (g, s) => {
    // v runs along the profile (0 = south pole), u around the ball
    g.fillStyle = '#fdf6ee';
    g.fillRect(0, 0, s, s);

    const band = (y0, y1, fill) => { g.fillStyle = fill; g.fillRect(0, y0 * s, s, (y1 - y0) * s); };
    band(0.00, 0.16, '#f6cf4a');
    band(0.16, 0.34, '#fdf6ee');
    band(0.34, 0.66, '#e8657f');
    band(0.66, 0.84, '#fdf6ee');
    band(0.84, 1.00, '#63b8d8');

    // parting line — a fine dark seam exactly where the geometry dips
    g.fillStyle = 'rgba(90,55,60,0.42)';
    g.fillRect(0, 0.497 * s, s, 0.006 * s);

    // a ring of printed stars around the middle band
    g.fillStyle = '#fdf6ee';
    for (let i = 0; i < 8; i++) {
      const cx = ((i + 0.5) / 8) * s;
      const cy = 0.5 * s;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = (k % 2 ? 0.018 : 0.042) * s;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
    }

    // maker's mark + a scuff of playground wear
    g.strokeStyle = 'rgba(70,50,55,0.5)';
    g.lineWidth = s * 0.006;
    g.beginPath(); g.arc(0.12 * s, 0.74 * s, 0.045 * s, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0.12 * s, 0.74 * s, 0.022 * s, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.13;
    g.fillStyle = '#7a6a60';
    for (let i = 0; i < 26; i++) {
      const x = ((i * 97) % 100) / 100 * s;
      const y = 0.2 * s + ((i * 53) % 60) / 100 * s;
      g.beginPath();
      g.ellipse(x, y, s * 0.03, s * 0.008, (i % 5) * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  });

  const mat = res.mat(MAT.makePlastic({ color: 0xffffff, matte: 0.34, clearcoat: 0.75, seed: 21, repeat: 3 }));
  mat.map = print;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // The ball is squashed on impact, so the physics body drives an outer pivot
  // and the visible mesh keeps the deformation to itself.
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.tag = 'ball';
  group.add(hitProxy(res, radius * 2.0, 'ball'));

  let squash = 0, squashV = 0;

  return {
    group,
    mesh,
    radius,
    /** @param {number} amount 0..1 impact severity */
    hit(amount) { squashV -= amount * 9.0; },
    update(dt) {
      // critically-ish damped spring back to round
      squashV += (-squash * 260 - squashV * 21) * dt;
      squash += squashV * dt;
      squash = clamp(squash, -0.32, 0.32);
      mesh.scale.set(1 - squash * 0.55, 1 + squash, 1 - squash * 0.55);
    }
  };
}

/* ========================================================================== *
 * ふうせん — latex balloon
 * ========================================================================== */

export function makeBalloon(res, { radius = 0.115, color = 0xff8fae } = {}) {
  const group = new THREE.Group();

  // Teardrop lathe profile: fat shoulders, a pinched neck, a stubby stem.
  const pts = [];
  const N = 34;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = lerp(-radius * 1.32, radius * 1.12, t);
    const s = clamp((t - 0.02) / 0.98, 0, 1);
    // profile: neck at the bottom swelling into the body
    const body = Math.sin(Math.pow(s, 0.72) * Math.PI * 0.985);
    const neck = 0.14 * Math.exp(-Math.pow(s / 0.1, 2));
    pts.push(new THREE.Vector2(Math.max(1e-4, radius * (body * 0.98 + neck)), y));
  }
  const geo = res.geo(new THREE.LatheGeometry(pts, 40));

  // Latex: thin, translucent, high gloss. Built from the shared plastic surface
  // so it keeps the library's micro-normal, then pushed into rubber territory.
  const mat = res.mat(MAT.makePlastic({ color, matte: 0.06, clearcoat: 1.0, seed: 29, repeat: 2 }));
  mat.transparent = true;
  mat.opacity = 0.94;
  mat.transmission = 0.42;
  mat.thickness = 0.012;
  mat.ior = 1.36;
  mat.roughness = 0.14;
  mat.clearcoatRoughness = 0.05;
  mat.sheen = 0.5;
  mat.sheenColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.6);
  mat.attenuationColor = new THREE.Color(color);
  mat.attenuationDistance = 0.25;
  mat.side = THREE.DoubleSide;
  mat.envMapIntensity = 1.6;

  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  body.receiveShadow = false;
  group.add(body);

  // A window-shaped specular highlight. Clearcoat gives one already; this
  // guarantees the read on tier-0 where the env probe is small.
  const hlGeo = res.geo(new THREE.PlaneGeometry(radius * 0.5, radius * 0.72, 1, 1));
  const hlMat = res.mat(new THREE.MeshBasicMaterial({
    map: TEX.radialSprite({ size: 64, power: 2.4 }),
    color: 0xffffff, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  const highlight = new THREE.Mesh(hlGeo, hlMat);
  highlight.position.set(-radius * 0.42, radius * 0.46, radius * 0.72);
  highlight.rotation.set(-0.25, -0.5, 0.35);
  highlight.renderOrder = 3;
  group.add(highlight);

  // The knot: a pinched collar plus the twisted-off tail.
  const knotMat = res.mat(MAT.makePlastic({ color, matte: 0.22, clearcoat: 0.85, seed: 30 }));
  knotMat.color.multiplyScalar(0.86);
  const collar = new THREE.Mesh(
    res.geo(new THREE.TorusGeometry(radius * 0.075, radius * 0.045, 8, 16)), knotMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -radius * 1.3;
  collar.castShadow = true;
  group.add(collar);

  const tail = new THREE.Mesh(
    res.geo(new THREE.CylinderGeometry(radius * 0.05, radius * 0.018, radius * 0.14, 8)), knotMat);
  tail.position.y = -radius * 1.38;
  tail.rotation.z = 0.5;
  group.add(tail);

  const knotAnchor = new THREE.Object3D();
  knotAnchor.position.y = -radius * 1.44;
  group.add(knotAnchor);

  group.add(hitProxy(res, radius * 1.7, 'balloon'));
  group.userData.tag = 'balloon';

  let wobble = 0, wobbleV = 0, phase = 0;

  return {
    group,
    body,
    knotAnchor,
    radius,
    /** Latex wobbles for a long time — this is what sells "not rigid". */
    bump(amount) { wobbleV -= amount * 6.0; },
    update(dt, t) {
      wobbleV += (-wobble * 90 - wobbleV * 3.2) * dt;
      wobble += wobbleV * dt;
      wobble = clamp(wobble, -0.3, 0.3);
      phase += dt;
      const idle = Math.sin(phase * 1.7) * 0.012;
      body.scale.set(1 - wobble * 0.5 + idle, 1 + wobble - idle, 1 - wobble * 0.5 + idle);
      highlight.material.opacity = 0.42 + Math.abs(wobble) * 0.6;
    }
  };
}

/* ========================================================================== *
 * もっきん — glockenspiel with physically-sized bars
 * ========================================================================== */

/** Free–free beam first mode: nodes at 0.2242 L and 0.7758 L. */
function beamMode(s) {
  const beta = 4.7300408;
  const sigma = 0.9825022;
  const x = beta * s;
  const ch = Math.cosh(Math.min(x, 8));
  const sh = Math.sinh(Math.min(x, 8));
  return (ch + Math.cos(x)) - sigma * (sh + Math.sin(x));
}

export function makeXylophone(res, {
  notes = [
    { name: 'do', freq: 523.25, color: 0xe8657f },
    { name: 're', freq: 587.33, color: 0xf0a63c },
    { name: 'mi', freq: 659.25, color: 0xf6cf4a },
    { name: 'so', freq: 783.99, color: 0x86c96b },
    { name: 'ra', freq: 880.00, color: 0x63b8d8 }
  ]
} = {}) {
  const group = new THREE.Group();
  const bars = [];

  const woodMat = res.mat(MAT.makeWood({ light: 0xd8a97a, dark: 0x9d6b3f, seed: 8, ringScale: 30, clearcoat: 0.45 }));
  const rubberMat = res.mat(MAT.makePlastic({ color: 0x3a3338, matte: 0.9, clearcoat: 0.05, seed: 44 }));

  // Frame: two tapered rails carrying the bars at their nodal lines. The rails
  // slope because the bars get shorter (and so sit lower) toward the top notes.
  const railLen = 0.30;
  const railProfile = new THREE.Shape();
  railProfile.moveTo(-railLen / 2, 0);
  railProfile.lineTo(railLen / 2, 0);
  railProfile.lineTo(railLen / 2, 0.011);
  railProfile.lineTo(-railLen / 2, 0.017);
  railProfile.closePath();
  for (const sz of [-1, 1]) {
    const g = res.geo(new THREE.ExtrudeGeometry(railProfile, {
      depth: 0.022, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1
    }));
    g.translate(0, 0, -0.011);
    const rail = new THREE.Mesh(g, woodMat);
    rail.position.set(0, 0.014, sz * 0.031);
    rail.castShadow = true;
    rail.receiveShadow = true;
    group.add(rail);
  }
  const baseGeo = res.geo(roundedBoxGeometry(railLen + 0.03, 0.014, 0.105, 0.005, 4));
  const base = new THREE.Mesh(baseGeo, woodMat);
  base.position.y = 0.007;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // L ∝ 1/√f for a bar of constant thickness — the lengths are the real ratios.
  const f0 = notes[0].freq;
  const L0 = 0.128;

  notes.forEach((note, i) => {
    const L = L0 * Math.sqrt(f0 / note.freq);
    const w = 0.026;
    const th = 0.0055;
    const geo = res.geo(new THREE.BoxGeometry(w, th, L, 1, 1, 24));

    // bake the free–free mode shape into a vertex attribute
    const pos = geo.attributes.position;
    const bend = new Float32Array(pos.count);
    let peak = 0;
    for (let v = 0; v < pos.count; v++) {
      const s = clamp(pos.getZ(v) / L + 0.5, 0, 1);
      const m = beamMode(s);
      bend[v] = m;
      peak = Math.max(peak, Math.abs(m));
    }
    for (let v = 0; v < pos.count; v++) bend[v] /= (peak || 1);
    geo.setAttribute('aBend', new THREE.BufferAttribute(bend, 1));

    // anodised aluminium — cloned so the memoised metal stays untouched
    const mat = res.mat(MAT.makeMetal({ color: 0xd8dde2, roughness: 0.26 }).clone());
    mat.color = new THREE.Color(note.color).lerp(new THREE.Color(0xffffff), 0.35);
    mat.roughness = 0.26;
    mat.metalness = 0.92;
    const uniforms = { uBend: { value: 0 } };
    mat.userData.uniforms = uniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aBend;\nuniform float uBend;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed.y += aBend * uBend;');
    };
    mat.customProgramCacheKey = () => 'xylo-bar';

    const bar = new THREE.Mesh(geo, mat);
    bar.position.set(-railLen / 2 + 0.030 + i * 0.060, 0.036, 0);
    bar.castShadow = true;
    bar.receiveShadow = true;
    bar.userData.tag = 'xylo';
    bar.userData.note = note;
    bar.userData.index = i;
    bar.add(hitProxy(res, Math.max(L, 0.05) * 0.62, 'xylo', { index: i, note }));
    group.add(bar);

    // rubber grommets at the nodal points — where a real bar is suspended
    for (const nodeS of [0.2242, 0.7758]) {
      const gm = new THREE.Mesh(
        res.geo(new THREE.TorusGeometry(0.0045, 0.0022, 6, 10)), rubberMat);
      gm.rotation.x = Math.PI / 2;
      gm.position.set(bar.position.x, 0.030, (nodeS - 0.5) * L);
      group.add(gm);
    }

    bars.push({ mesh: bar, note, uniforms, L, amp: 0, phase: 0, freq: note.freq });
  });

  // beater: turned wooden shaft, moulded nylon head with a parting line
  const beater = new THREE.Group();
  const shaft = new THREE.Mesh(
    res.geo(new THREE.CylinderGeometry(0.0032, 0.0042, 0.115, 8)), woodMat);
  shaft.castShadow = true;
  beater.add(shaft);
  const headMat = res.mat(MAT.makePlastic({ color: 0xf2e6d2, matte: 0.3, clearcoat: 0.7, seed: 55 }));
  const head = new THREE.Mesh(res.geo(new THREE.SphereGeometry(0.0125, 14, 10)), headMat);
  head.position.y = 0.062;
  head.scale.y = 0.86;
  head.castShadow = true;
  beater.add(head);
  const seam = new THREE.Mesh(res.geo(new THREE.TorusGeometry(0.0126, 0.0006, 4, 16)), rubberMat);
  seam.rotation.x = Math.PI / 2;
  seam.position.y = 0.062;
  beater.add(seam);
  beater.position.set(0.02, 0.005, 0.078);
  beater.rotation.set(0, 0.32, Math.PI / 2);
  group.add(beater);

  return {
    group,
    bars,
    beater,
    /** @param {number} i bar index  @param {number} force 0..1 */
    strike(i, force = 1) {
      const b = bars[i];
      if (!b) return null;
      b.amp = 0.0022 * (0.5 + force * 0.8);
      b.phase = 0;
      return b;
    },
    update(dt) {
      for (const b of bars) {
        if (b.amp <= 1e-6) { b.uniforms.uBend.value = 0; continue; }
        // Ring at an audible-but-visible rate: real bars vibrate far too fast
        // to see, so the visible flex is a slowed stand-in that decays with the
        // same envelope as the note.
        b.phase += dt * 34;
        b.amp *= Math.exp(-dt * 4.2);
        b.uniforms.uBend.value = Math.sin(b.phase) * b.amp;
        if (b.amp < 1e-6) b.amp = 0;
      }
    }
  };
}

/* ========================================================================== *
 * たいこ — hand drum
 * ========================================================================== */

export function makeDrum(res, { radius = 0.085 } = {}) {
  const group = new THREE.Group();
  const shellH = 0.075;

  const shellMat = res.mat(MAT.makeWood({ light: 0xc9553f, dark: 0x8c2f22, seed: 14, ringScale: 22, clearcoat: 0.6 }));
  const shell = new THREE.Mesh(
    res.geo(new THREE.CylinderGeometry(radius, radius * 0.94, shellH, 30, 1, true)), shellMat);
  shell.position.y = shellH / 2;
  shell.castShadow = true;
  shell.receiveShadow = true;
  shell.material.side = THREE.DoubleSide;
  group.add(shell);

  // Tensioned head: a disc with a radial mode shape baked in, so a strike makes
  // a real dish rather than a scale pop.
  const headGeo = res.geo(new THREE.CircleGeometry(radius * 0.985, 40, 0, Math.PI * 2));
  headGeo.rotateX(-Math.PI / 2);
  {
    const pos = headGeo.attributes.position;
    const bend = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i)) / (radius * 0.985);
      bend[i] = Math.cos(clamp(r, 0, 1) * Math.PI * 0.5);   // clamped edge, free centre
    }
    headGeo.setAttribute('aBend', new THREE.BufferAttribute(bend, 1));
  }
  const headMat = res.mat(MAT.makeCloth({ color: 0xfdf2e2, weave: 'plain', threads: 200, repeat: 1, sheen: 0.35, roughness: 0.62, seed: 15 }));
  headMat.side = THREE.DoubleSide;
  const headUniforms = { uBend: { value: 0 } };
  headMat.userData.uniforms = headUniforms;
  headMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, headUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBend;\nuniform float uBend;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed.y += aBend * uBend;');
  };
  headMat.customProgramCacheKey = () => 'drum-head';

  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = shellH + 0.002;
  head.castShadow = false;
  head.receiveShadow = true;
  head.userData.tag = 'drum';
  group.add(head);
  const proxy = hitProxy(res, radius * 1.25, 'drum');
  proxy.position.y = shellH;
  group.add(proxy);

  // rim hoop + tension lugs
  const metal = res.mat(MAT.makeMetal({ color: 0xe4e8ec, roughness: 0.3 }).clone());
  const hoop = new THREE.Mesh(
    res.geo(new THREE.TorusGeometry(radius * 1.0, 0.006, 8, 34)), metal);
  hoop.rotation.x = Math.PI / 2;
  hoop.position.y = shellH;
  hoop.castShadow = true;
  group.add(hoop);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lug = new THREE.Mesh(
      res.geo(new THREE.CylinderGeometry(0.0045, 0.0055, 0.016, 8)), metal);
    lug.position.set(Math.cos(a) * radius * 1.005, shellH - 0.012, Math.sin(a) * radius * 1.005);
    group.add(lug);
  }
  const foot = new THREE.Mesh(
    res.geo(new THREE.CylinderGeometry(radius * 0.96, radius * 0.96, 0.006, 26)), shellMat);
  foot.position.y = 0.003;
  foot.receiveShadow = true;
  group.add(foot);

  group.userData.tag = 'drum';

  let amp = 0, phase = 0;

  return {
    group,
    head,
    radius,
    shellH,
    hit(force = 1) { amp = 0.010 * (0.5 + force * 0.7); phase = 0; },
    update(dt) {
      if (amp <= 1e-6) { headUniforms.uBend.value = 0; return; }
      phase += dt * 26;
      amp *= Math.exp(-dt * 7.5);
      headUniforms.uBend.value = -Math.abs(Math.sin(phase)) * amp * Math.exp(-phase * 0.35);
      if (amp < 1e-6) amp = 0;
    }
  };
}

/* ========================================================================== *
 * おもちゃばこ — toy box
 * ========================================================================== */

export function makeToyBox(res, { w = 0.34, h = 0.20, d = 0.24 } = {}) {
  const group = new THREE.Group();
  const wood = res.mat(MAT.makeWood({ light: 0xe7c79a, dark: 0xb0824d, seed: 6, planks: 3, ringScale: 24, clearcoat: 0.4, repeat: 1 }));
  const t = 0.014;

  const panel = (sx, sy, sz, px, py, pz, ry = 0) => {
    const g = res.geo(roundedBoxGeometry(sx, sy, sz, 0.004, 3));
    const m = new THREE.Mesh(g, wood);
    m.position.set(px, py, pz);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  panel(w, t, d, 0, t / 2, 0);                            // floor
  panel(w, h, t, 0, h / 2 + t, -d / 2 + t / 2);           // back
  panel(w, h * 0.72, t, 0, h * 0.36 + t, d / 2 - t / 2);  // front (lower, so you can see in)
  panel(t, h, d, -w / 2 + t / 2, h / 2 + t, 0);
  panel(t, h, d, w / 2 - t / 2, h / 2 + t, 0);

  // rope handles
  const ropeMat = res.mat(MAT.makeCloth({ color: 0xe8dcc4, weave: 'knit', threads: 60, repeat: 2, seed: 33 }));
  for (const sx of [-1, 1]) {
    const rope = new THREE.Mesh(res.geo(new THREE.TorusGeometry(0.028, 0.005, 6, 18, Math.PI)), ropeMat);
    rope.position.set(sx * (w / 2 - t * 0.5), h * 0.72, 0);
    rope.rotation.set(0, Math.PI / 2, Math.PI);
    rope.castShadow = true;
    group.add(rope);
  }

  // a painted star appliqué on the front panel
  const starGeo = res.geo(new THREE.ExtrudeGeometry(starShape(0.038), {
    depth: 0.003, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1, curveSegments: 8
  }));
  const paintMat = res.mat(MAT.makePaint({ color: 0xf6cf4a, gloss: 0.45, seed: 45 }));
  const star = new THREE.Mesh(starGeo, paintMat);
  star.position.set(0, h * 0.38, d / 2 + 0.0005);
  star.castShadow = false;
  group.add(star);

  const mouth = new THREE.Object3D();
  mouth.position.set(0, h * 0.72, 0);
  group.add(mouth);

  const proxy = hitProxy(res, Math.max(w, d) * 0.72, 'toybox');
  proxy.position.y = h * 0.5;
  group.add(proxy);
  group.userData.tag = 'toybox';

  return { group, mouth, w, h, d };
}

/* ========================================================================== *
 * くまのぬいぐるみ — teddy
 * ========================================================================== */

export function makeTeddy(res, { scale = 1 } = {}) {
  const group = new THREE.Group();
  const fur = res.mat(MAT.makeCloth({
    color: 0xc79a6c, weave: 'terry', threads: 90, repeat: 4, seed: 66,
    sheen: 1.0, sheenColor: 0xffe6c8, roughness: 0.99, normalScale: 1.5
  }));
  const inner = res.mat(MAT.makeCloth({
    color: 0xf0dcc0, weave: 'plain', threads: 130, repeat: 3, seed: 67, sheen: 0.8
  }));
  const eyeMat = res.mat(MAT.makePlastic({ color: 0x2a1c16, matte: 0.06, clearcoat: 1.0, seed: 68 }));

  const ball = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(res.geo(new THREE.SphereGeometry(r, 18, 14)), mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  ball(0.052, fur, 0, 0.052, 0, 1.0, 0.94, 0.92);            // body
  const head = ball(0.040, fur, 0, 0.118, 0.004, 1.0, 0.95, 0.98);
  ball(0.016, fur, -0.030, 0.146, -0.004);                    // ears
  ball(0.016, fur, 0.030, 0.146, -0.004);
  ball(0.009, inner, -0.030, 0.147, 0.004, 1, 1, 0.5);
  ball(0.009, inner, 0.030, 0.147, 0.004, 1, 1, 0.5);
  ball(0.019, inner, 0, 0.106, 0.031, 1.15, 0.8, 0.8);        // muzzle
  ball(0.0075, eyeMat, -0.015, 0.124, 0.033, 1, 1, 0.7);      // eyes
  ball(0.0075, eyeMat, 0.015, 0.124, 0.033, 1, 1, 0.7);
  ball(0.0085, eyeMat, 0, 0.112, 0.048, 1.25, 0.9, 0.8);      // nose

  // arms + legs
  for (const sx of [-1, 1]) {
    const arm = ball(0.020, fur, sx * 0.050, 0.070, 0.010, 1, 1.5, 1);
    arm.rotation.z = sx * -0.5;
    const paw = ball(0.012, inner, sx * 0.062, 0.044, 0.016);
    paw.scale.set(1, 0.8, 1);
    ball(0.023, fur, sx * 0.030, 0.018, 0.014, 1, 0.85, 1.25);
    ball(0.014, inner, sx * 0.030, 0.014, 0.038, 1, 0.7, 1);
  }

  // a real stitched seam down the body — the detail that says "sewn, not moulded"
  const seamMat = res.mat(MAT.makeCloth({ color: 0xa87c52, weave: 'plain', threads: 200, repeat: 1, seed: 69 }));
  const seam = new THREE.Mesh(res.geo(new THREE.TorusGeometry(0.0505, 0.0016, 4, 40)), seamMat);
  seam.rotation.y = Math.PI / 2;
  seam.position.y = 0.052;
  seam.scale.set(1, 0.94, 1);
  group.add(seam);

  group.scale.setScalar(scale);
  group.userData.tag = 'teddy';
  group.add(hitProxy(res, 0.085 / scale, 'teddy'));
  return { group, head };
}

/* ========================================================================== *
 * えほん — board book with real page bending
 * ========================================================================== */

function drawPageFrame(g, s, w, h) {
  g.fillStyle = '#fffaf0';
  g.fillRect(0, 0, w, h);
  // paper tooth
  g.globalAlpha = 0.05;
  g.fillStyle = '#c8b49a';
  for (let i = 0; i < 900; i++) {
    const x = (i * 977) % w, y = (i * 613) % h;
    g.fillRect(x, y, 2, 2);
  }
  g.globalAlpha = 1;
}

/** Simple vector illustrations — no glyphs, no emoji. */
const SPREAD_ART = [
  // 1. a bear under a tree
  (g, x0, y0, w, h) => {
    g.fillStyle = '#dff0e4'; g.fillRect(x0, y0, w, h);
    g.fillStyle = '#b8dfc2';
    g.beginPath(); g.ellipse(x0 + w * 0.5, y0 + h * 1.02, w * 0.72, h * 0.28, 0, 0, Math.PI * 2); g.fill();
    // trunk
    g.fillStyle = '#a4713f';
    g.fillRect(x0 + w * 0.62, y0 + h * 0.42, w * 0.07, h * 0.42);
    // canopy
    g.fillStyle = '#5fa96b';
    for (const [cx, cy, r] of [[0.66, 0.32, 0.20], [0.53, 0.38, 0.15], [0.79, 0.38, 0.14]]) {
      g.beginPath(); g.arc(x0 + w * cx, y0 + h * cy, w * r, 0, Math.PI * 2); g.fill();
    }
    // bear
    const bx = x0 + w * 0.30, by = y0 + h * 0.66, r = w * 0.11;
    g.fillStyle = '#c08a52';
    g.beginPath(); g.arc(bx - r * 0.62, by - r * 0.92, r * 0.34, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(bx + r * 0.62, by - r * 0.92, r * 0.34, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(bx, by, r, r * 0.95, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(bx, by + r * 1.35, r * 0.9, r * 0.78, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#efdcc0';
    g.beginPath(); g.ellipse(bx, by + r * 0.32, r * 0.46, r * 0.34, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2a20';
    g.beginPath(); g.arc(bx - r * 0.36, by - r * 0.20, r * 0.09, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(bx + r * 0.36, by - r * 0.20, r * 0.09, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(bx, by + r * 0.20, r * 0.13, r * 0.10, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2a20'; g.lineWidth = w * 0.008; g.lineCap = 'round';
    g.beginPath(); g.arc(bx, by + r * 0.34, r * 0.22, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  },
  // 2. an owl on a branch under a crescent moon
  (g, x0, y0, w, h) => {
    g.fillStyle = '#2c3a6b'; g.fillRect(x0, y0, w, h);
    g.fillStyle = '#ffe9a8';
    g.beginPath(); g.arc(x0 + w * 0.74, y0 + h * 0.22, w * 0.11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2c3a6b';
    g.beginPath(); g.arc(x0 + w * 0.79, y0 + h * 0.19, w * 0.10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff6d8';
    for (let i = 0; i < 16; i++) {
      const sx = x0 + w * (0.06 + ((i * 37) % 90) / 100);
      const sy = y0 + h * (0.06 + ((i * 53) % 55) / 100);
      const r = w * (i % 3 ? 0.008 : 0.013);
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#6b4a30'; g.lineWidth = w * 0.035; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0 + w * 0.08, y0 + h * 0.78); g.lineTo(x0 + w * 0.92, y0 + h * 0.70); g.stroke();
    const ox = x0 + w * 0.36, oy = y0 + h * 0.56, r = w * 0.12;
    g.fillStyle = '#b98a5c';
    g.beginPath(); g.ellipse(ox, oy, r * 0.9, r * 1.15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8cfa8';
    g.beginPath(); g.ellipse(ox, oy + r * 0.30, r * 0.55, r * 0.68, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fffaf0';
    g.beginPath(); g.arc(ox - r * 0.36, oy - r * 0.30, r * 0.32, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(ox + r * 0.36, oy - r * 0.30, r * 0.32, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a2018';
    g.beginPath(); g.arc(ox - r * 0.34, oy - r * 0.28, r * 0.15, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(ox + r * 0.34, oy - r * 0.28, r * 0.15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f0a63c';
    g.beginPath();
    g.moveTo(ox, oy - r * 0.06); g.lineTo(ox - r * 0.11, oy - r * 0.22); g.lineTo(ox + r * 0.11, oy - r * 0.22);
    g.closePath(); g.fill();
  },
  // 3. a sleeping house under the stars
  (g, x0, y0, w, h) => {
    g.fillStyle = '#1e2a52'; g.fillRect(x0, y0, w, h);
    g.fillStyle = '#fff6d8';
    for (let i = 0; i < 26; i++) {
      const sx = x0 + w * (((i * 71) % 97) / 100);
      const sy = y0 + h * (((i * 41) % 60) / 100);
      g.globalAlpha = 0.4 + ((i * 17) % 60) / 100;
      g.beginPath(); g.arc(sx, sy, w * (i % 4 ? 0.006 : 0.012), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#33477e';
    g.beginPath();
    g.moveTo(x0, y0 + h);
    g.lineTo(x0, y0 + h * 0.74);
    g.quadraticCurveTo(x0 + w * 0.3, y0 + h * 0.58, x0 + w * 0.58, y0 + h * 0.76);
    g.quadraticCurveTo(x0 + w * 0.82, y0 + h * 0.9, x0 + w, y0 + h * 0.72);
    g.lineTo(x0 + w, y0 + h); g.closePath(); g.fill();
    // house
    const hx = x0 + w * 0.30, hy = y0 + h * 0.62, hw = w * 0.22, hh = h * 0.18;
    g.fillStyle = '#f2e4cf'; g.fillRect(hx - hw / 2, hy, hw, hh);
    g.fillStyle = '#c9553f';
    g.beginPath();
    g.moveTo(hx - hw * 0.62, hy); g.lineTo(hx, hy - hh * 0.62); g.lineTo(hx + hw * 0.62, hy);
    g.closePath(); g.fill();
    g.fillStyle = '#f6cf4a';
    g.fillRect(hx - hw * 0.16, hy + hh * 0.22, hw * 0.32, hh * 0.36);
    // shooting star
    g.strokeStyle = 'rgba(255,246,216,0.85)'; g.lineWidth = w * 0.009; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0 + w * 0.60, y0 + h * 0.16); g.lineTo(x0 + w * 0.86, y0 + h * 0.30); g.stroke();
    g.fillStyle = '#fffdf4';
    g.beginPath(); g.arc(x0 + w * 0.87, y0 + h * 0.305, w * 0.018, 0, Math.PI * 2); g.fill();
  },
  // 4. a baby asleep, with drawn (not typed) zzz
  (g, x0, y0, w, h) => {
    g.fillStyle = '#e8e0f2'; g.fillRect(x0, y0, w, h);
    g.fillStyle = '#c9b8e4';
    g.beginPath(); g.ellipse(x0 + w * 0.5, y0 + h * 1.05, w * 0.8, h * 0.34, 0, 0, Math.PI * 2); g.fill();
    // pillow + quilt
    g.fillStyle = '#fdf6ee';
    g.beginPath(); g.ellipse(x0 + w * 0.32, y0 + h * 0.60, w * 0.16, h * 0.11, -0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a9c8e8';
    g.beginPath();
    g.moveTo(x0 + w * 0.30, y0 + h * 0.70);
    g.quadraticCurveTo(x0 + w * 0.55, y0 + h * 0.62, x0 + w * 0.82, y0 + h * 0.72);
    g.lineTo(x0 + w * 0.82, y0 + h * 0.86);
    g.quadraticCurveTo(x0 + w * 0.55, y0 + h * 0.78, x0 + w * 0.30, y0 + h * 0.86);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = w * 0.006;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(x0 + w * (0.30 + i * 0.13), y0 + h * 0.665);
      g.lineTo(x0 + w * (0.30 + i * 0.13), y0 + h * 0.855);
      g.stroke();
    }
    // head
    g.fillStyle = '#f7d9c2';
    g.beginPath(); g.arc(x0 + w * 0.34, y0 + h * 0.56, w * 0.085, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#4a382c'; g.lineWidth = w * 0.008; g.lineCap = 'round';
    g.beginPath(); g.arc(x0 + w * 0.315, y0 + h * 0.555, w * 0.020, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.beginPath(); g.arc(x0 + w * 0.375, y0 + h * 0.555, w * 0.020, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.fillStyle = '#f0a0a8';
    g.beginPath(); g.arc(x0 + w * 0.300, y0 + h * 0.585, w * 0.016, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x0 + w * 0.390, y0 + h * 0.585, w * 0.016, 0, Math.PI * 2); g.fill();
    // zzz drawn as zig-zag strokes
    g.strokeStyle = '#6d5a8a'; g.lineCap = 'round'; g.lineJoin = 'round';
    const zed = (cx, cy, sz, lw) => {
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(cx - sz, cy - sz); g.lineTo(cx + sz, cy - sz);
      g.lineTo(cx - sz, cy + sz); g.lineTo(cx + sz, cy + sz);
      g.stroke();
    };
    zed(x0 + w * 0.53, y0 + h * 0.40, w * 0.026, w * 0.012);
    zed(x0 + w * 0.63, y0 + h * 0.30, w * 0.034, w * 0.014);
    zed(x0 + w * 0.75, y0 + h * 0.19, w * 0.044, w * 0.017);
  }
];

function spreadTexture(index) {
  return TEX.painted(`book-spread-${index}`, 1024, (g, s) => {
    const w = s / 2, h = s * 0.72, top = (s - h) / 2;
    g.fillStyle = '#e6d4bc';
    g.fillRect(0, 0, s, s);
    drawPageFrame(g, s, s, s);
    SPREAD_ART[index % SPREAD_ART.length](g, 0, top, w, h);
    SPREAD_ART[(index + 1) % SPREAD_ART.length](g, w, top, w, h);
    // page borders + gutter shading
    g.strokeStyle = 'rgba(120,95,70,0.35)';
    g.lineWidth = s * 0.006;
    g.strokeRect(2, top, w - 2, h);
    g.strokeRect(w, top, w - 2, h);
    const grad = g.createLinearGradient(w - s * 0.05, 0, w + s * 0.05, 0);
    grad.addColorStop(0, 'rgba(60,40,25,0)');
    grad.addColorStop(0.5, 'rgba(60,40,25,0.30)');
    grad.addColorStop(1, 'rgba(60,40,25,0)');
    g.fillStyle = grad;
    g.fillRect(w - s * 0.05, top, s * 0.1, h);
  }, { srgb: true });
}

/**
 * A board book that lies open. `turn()` sweeps one leaf across the spine with a
 * genuine inextensible bend: the leaf's arc length is preserved, so it curls
 * mid-turn and lies flat at both ends.
 */
export function makePictureBook(res, { width = 0.11, depth = 0.14, spreads = 4 } = {}) {
  const group = new THREE.Group();

  const coverMat = res.mat(MAT.makeCloth({ color: 0xd8607f, weave: 'plain', threads: 150, repeat: 2, seed: 81, roughness: 0.85 }));
  const blockMat = res.mat(MAT.makePaint({ color: 0xf6ecdc, gloss: 0.1, seed: 82, repeat: 3 }));

  // covers, opened flat
  for (const sx of [-1, 1]) {
    const g = res.geo(roundedBoxGeometry(width, 0.006, depth, 0.002, 3));
    const m = new THREE.Mesh(g, coverMat);
    m.position.set(sx * (width / 2 + 0.001), 0.003, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  const spine = new THREE.Mesh(
    res.geo(new THREE.CylinderGeometry(0.006, 0.006, depth, 10, 1, false, 0, Math.PI)), coverMat);
  spine.rotation.set(Math.PI / 2, 0, 0);
  spine.position.y = 0.003;
  spine.castShadow = true;
  group.add(spine);

  // page blocks on each side
  for (const sx of [-1, 1]) {
    const g = res.geo(roundedBoxGeometry(width * 0.97, 0.010, depth * 0.96, 0.0015, 2));
    const m = new THREE.Mesh(g, blockMat);
    m.position.set(sx * (width / 2 + 0.001), 0.011, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // the two visible printed faces + the leaf that turns between them
  const faceGeo = () => {
    const g = res.geo(new THREE.PlaneGeometry(width, depth, 1, 1));
    g.rotateX(-Math.PI / 2);
    return g;
  };
  const leftFace = new THREE.Mesh(faceGeo(), res.mat(new THREE.MeshPhysicalMaterial({
    map: null, roughness: 0.88, metalness: 0, clearcoat: 0.06, envMapIntensity: 0.8
  })));
  const rightFace = new THREE.Mesh(faceGeo(), leftFace.material.clone());
  res.mat(rightFace.material);
  leftFace.position.set(-(width / 2 + 0.001), 0.0165, 0);
  rightFace.position.set(width / 2 + 0.001, 0.0165, 0);
  for (const f of [leftFace, rightFace]) { f.receiveShadow = true; group.add(f); }

  // UV halves so one spread texture covers both faces
  const setHalfUV = (mesh, left) => {
    const uv = mesh.geometry.attributes.uv;
    const u0 = left ? 0 : 0.5, u1 = left ? 0.5 : 1.0;
    const v0 = 0.14, v1 = 0.86;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
  };
  setHalfUV(leftFace, true);
  setHalfUV(rightFace, false);

  // the turning leaf: printed both sides, bent on the CPU
  const NX = 16, NZ = 4;
  const leafGeo = res.geo(new THREE.PlaneGeometry(width, depth, NX, NZ));
  leafGeo.rotateX(-Math.PI / 2);
  leafGeo.translate(width / 2, 0, 0);        // spine at local x = 0
  const rest = leafGeo.attributes.position.array.slice();
  const leafMat = res.mat(new THREE.MeshPhysicalMaterial({
    map: null, roughness: 0.88, metalness: 0, side: THREE.DoubleSide,
    clearcoat: 0.06, envMapIntensity: 0.8
  }));
  const leaf = new THREE.Mesh(leafGeo, leafMat);
  leaf.position.set(0, 0.0175, 0);
  leaf.castShadow = true;
  leaf.visible = false;
  group.add(leaf);
  setHalfUV(leaf, false);   // leaf shows the right-hand page while it lifts
  {
    const uv = leafGeo.attributes.uv;
    const cols = NX + 1, rows = NZ + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        uv.setXY(r * cols + c, 0.5 + (c / NX) * 0.5, 0.86 - (r / NZ) * 0.72);
      }
    }
    uv.needsUpdate = true;
  }

  const proxy = hitProxy(res, Math.max(width, depth) * 1.1, 'book');
  proxy.position.y = 0.02;
  group.add(proxy);
  group.userData.tag = 'book';

  let spread = 0;
  let turn = 0;
  let turning = false;
  let onDone = null;

  const applyTextures = () => {
    const tex = spreadTexture(spread % spreads);
    leftFace.material.map = tex;
    rightFace.material.map = tex;
    leafMat.map = tex;
    leftFace.material.needsUpdate = true;
    rightFace.material.needsUpdate = true;
    leafMat.needsUpdate = true;
  };
  applyTextures();

  const deform = () => {
    const pos = leafGeo.attributes.position;
    const cols = NX + 1, rows = NZ + 1;
    const curl = Math.sin(Math.PI * turn) * 0.95;
    const ds = width / NX;
    for (let r = 0; r < rows; r++) {
      const fan = 0.82 + 0.36 * (r / NZ);          // the leaf fans across its depth
      let X = 0, Y = 0;
      for (let c = 0; c < cols; c++) {
        const idx = (r * cols + c) * 3;
        const s = c / NX;
        const theta = Math.PI * turn - curl * s * s * fan;
        if (c > 0) { X += Math.cos(theta) * ds; Y += Math.sin(theta) * ds; }
        pos.array[idx] = X;
        pos.array[idx + 1] = Y;
        pos.array[idx + 2] = rest[idx + 2];
      }
    }
    pos.needsUpdate = true;
    leafGeo.computeVertexNormals();
    leafGeo.computeBoundingSphere();
  };

  return {
    group,
    leaf,
    get spread() { return spread; },
    get turning() { return turning; },
    spreads,
    /** Begin turning one leaf. Resolves through `cb` when the page has landed. */
    turnPage(cb) {
      if (turning) return false;
      turning = true;
      turn = 0;
      leaf.visible = true;
      onDone = cb || null;
      return true;
    },
    update(dt) {
      if (!turning) return;
      turn = Math.min(1, turn + dt * 1.15);
      deform();
      // the leaf hands off to the flat pages exactly when it lands
      if (turn >= 1) {
        turning = false;
        leaf.visible = false;
        spread = (spread + 1) % spreads;
        applyTextures();
        const cb = onDone; onDone = null;
        if (cb) cb(spread);
      }
    },
    dispose() { onDone = null; }
  };
}

/* ========================================================================== *
 * はぶらし + は — toothbrush and the teeth it cleans
 * ========================================================================== */

export function makeToothbrush(res) {
  const group = new THREE.Group();
  const handleMat = res.mat(MAT.makePlastic({ color: 0x63b8d8, matte: 0.22, clearcoat: 0.85, seed: 91 }));
  const gripMat = res.mat(MAT.makePlastic({ color: 0xf6cf4a, matte: 0.75, clearcoat: 0.1, seed: 92 }));
  const bristleMat = res.mat(MAT.makePlastic({ color: 0xfdfaf4, matte: 0.55, clearcoat: 0.2, seed: 93 }));

  const handle = new THREE.Mesh(
    res.geo(new THREE.CylinderGeometry(0.0055, 0.0075, 0.062, 12)), handleMat);
  handle.castShadow = true;
  group.add(handle);
  const grip = new THREE.Mesh(
    res.geo(new THREE.CylinderGeometry(0.0072, 0.0072, 0.020, 12)), gripMat);
  grip.position.y = -0.018;
  group.add(grip);
  const neck = new THREE.Mesh(
    res.geo(new THREE.CylinderGeometry(0.0032, 0.0052, 0.020, 10)), handleMat);
  neck.position.y = 0.040;
  group.add(neck);
  const head = new THREE.Mesh(
    res.geo(roundedBoxGeometry(0.011, 0.0045, 0.020, 0.002, 3)), handleMat);
  head.position.y = 0.058;
  head.castShadow = true;
  group.add(head);

  // bristle tufts, merged into a single mesh
  const tufts = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 2; c++) {
      const g = new THREE.CylinderGeometry(0.0018, 0.0016, 0.005, 6);
      g.translate((c - 0.5) * 0.0048, 0.0625, (r - 1.5) * 0.0048);
      tufts.push(g);
    }
  }
  const bristles = new THREE.Mesh(res.geo(mergeAll(tufts)), bristleMat);
  group.add(bristles);

  group.userData.tag = 'brush';
  return { group, headPoint: new THREE.Vector3(0, 0.065, 0) };
}

/**
 * A little arc of teeth carrying scrub-able plaque. Attaches to the baby's
 * mouth bone; each speck is its own mesh so scrubbing removes them one by one.
 */
export function makeTeeth(res, { width = 0.030, count = 8, plaque = 10 } = {}) {
  const group = new THREE.Group();
  const enamel = res.mat(MAT.makeCeramic({ color: 0xfffdf8, seed: 95, repeat: 1 }));
  const gum = res.mat(MAT.makePlastic({ color: 0xe08a92, matte: 0.5, clearcoat: 0.35, seed: 96 }));
  const plaqueMat = res.mat(MAT.makePlastic({ color: 0xe8d17a, matte: 0.85, clearcoat: 0.05, seed: 97 }));

  const gumGeo = res.geo(new THREE.TorusGeometry(width * 0.5, 0.0035, 6, 20, Math.PI));
  const specks = [];
  const teeth = [];

  for (const row of [1, -1]) {
    const gumMesh = new THREE.Mesh(gumGeo, gum);
    gumMesh.rotation.set(Math.PI / 2, 0, row > 0 ? 0 : Math.PI);
    gumMesh.position.y = row * 0.0065;
    group.add(gumMesh);
    for (let i = 0; i < count; i++) {
      const a = Math.PI * (0.12 + 0.76 * (i / (count - 1)));
      const x = Math.cos(a) * width * 0.5;
      const z = Math.sin(a) * width * 0.5 * 0.55;
      const t = new THREE.Mesh(
        res.geo(roundedBoxGeometry(0.0032, 0.0055, 0.0028, 0.0009, 2)), enamel);
      t.position.set(x, row * 0.0035, z);
      t.rotation.y = -a + Math.PI / 2;
      group.add(t);
      teeth.push(t);
    }
  }

  const speckGeo = res.geo(new THREE.SphereGeometry(0.0016, 7, 5));
  for (let i = 0; i < plaque; i++) {
    const a = Math.PI * (0.15 + 0.70 * ((i * 0.37) % 1));
    const row = i % 2 ? 1 : -1;
    const m = new THREE.Mesh(speckGeo, plaqueMat);
    m.position.set(
      Math.cos(a) * width * 0.5,
      row * 0.0034 + (i % 3) * 0.0004,
      Math.sin(a) * width * 0.5 * 0.55 + 0.0016
    );
    m.scale.set(1.3, 0.8, 0.9);
    group.add(m);
    specks.push(m);
  }

  group.visible = false;
  group.userData.tag = 'teeth';

  return {
    group,
    specks,
    teeth,
    /** Remove any plaque within `radius` of a point in this group's local space. */
    scrub(localPoint, radius) {
      let removed = 0;
      for (let i = specks.length - 1; i >= 0; i--) {
        if (specks[i].position.distanceTo(localPoint) < radius) {
          group.remove(specks[i]);
          specks.splice(i, 1);
          removed++;
        }
      }
      return removed;
    },
    get clean() { return specks.length === 0; }
  };
}

/* ========================================================================== *
 * ベビーベッド — crib, mattress, pillow
 * ========================================================================== */

export function makeCrib(res, { w = 0.86, d = 0.52, railH = 0.42, mattressY = 0.26 } = {}) {
  const group = new THREE.Group();
  const wood = res.mat(MAT.makeWood({ light: 0xf3e2cd, dark: 0xd6b48c, seed: 4, ringScale: 30, clearcoat: 0.55, satin: 0.34 }));

  // turned corner posts, lathed from a real profile
  const postProfile = [];
  const postH = mattressY + railH;
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const y = t * postH;
    let r = 0.016;
    r += 0.007 * Math.exp(-Math.pow((t - 0.06) / 0.05, 2));   // foot collar
    r += 0.006 * Math.exp(-Math.pow((t - 0.52) / 0.04, 2));   // mid bead
    r -= 0.004 * Math.exp(-Math.pow((t - 0.97) / 0.05, 2));   // top taper
    postProfile.push(new THREE.Vector2(Math.max(0.004, r), y));
  }
  postProfile.push(new THREE.Vector2(0.014, postH + 0.012));
  postProfile.push(new THREE.Vector2(0.0001, postH + 0.020));
  const postGeo = res.geo(new THREE.LatheGeometry(postProfile, 14));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, wood);
      p.position.set(sx * (w / 2), 0, sz * (d / 2));
      p.castShadow = true;
      p.receiveShadow = true;
      group.add(p);
    }
  }

  // slats + rails on all four sides
  const slatGeo = res.geo(new THREE.CylinderGeometry(0.0072, 0.0072, railH - 0.02, 8));
  const addSide = (len, axis, offset) => {
    const n = Math.max(4, Math.round(len / 0.072));
    for (let i = 1; i < n; i++) {
      const t = -len / 2 + (i / n) * len;
      const s = new THREE.Mesh(slatGeo, wood);
      s.position.set(
        axis === 'x' ? t : offset,
        mattressY + railH / 2 + 0.01,
        axis === 'x' ? offset : t
      );
      s.castShadow = true;
      s.receiveShadow = true;
      group.add(s);
    }
    for (const y of [mattressY + 0.012, mattressY + railH]) {
      const r = new THREE.Mesh(
        res.geo(new THREE.CylinderGeometry(0.011, 0.011, len, 10)), wood);
      r.rotation.z = axis === 'x' ? Math.PI / 2 : 0;
      if (axis === 'z') r.rotation.x = Math.PI / 2;
      r.position.set(axis === 'x' ? 0 : offset, y, axis === 'x' ? offset : 0);
      r.castShadow = true;
      r.receiveShadow = true;
      group.add(r);
    }
  };
  addSide(w, 'x', -d / 2);
  addSide(w, 'x', d / 2);
  addSide(d, 'z', -w / 2);
  addSide(d, 'z', w / 2);

  // mattress deck
  const deck = new THREE.Mesh(res.geo(roundedBoxGeometry(w - 0.03, 0.016, d - 0.03, 0.004, 3)), wood);
  deck.position.y = mattressY - 0.008;
  deck.receiveShadow = true;
  deck.castShadow = true;
  group.add(deck);

  return { group, w, d, mattressY, railH, inner: { w: w - 0.05, d: d - 0.05 } };
}

/** Quilted-top mattress with real piping around the seam. */
export function makeMattress(res, { w = 0.80, d = 0.46, h = 0.055 } = {}) {
  const group = new THREE.Group();
  const tick = res.mat(MAT.makeCloth({
    color: 0xfdf8f0, weave: 'plain', threads: 170, repeat: 4, seed: 17, sheen: 0.7, roughness: 0.92
  }));
  const pipeMat = res.mat(MAT.makeCloth({ color: 0xbcd6ea, weave: 'knit', threads: 90, repeat: 6, seed: 18 }));

  const body = new THREE.Mesh(res.geo(roundedBoxGeometry(w, h, d, h * 0.36, 6)), tick);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // piping: a real tube run around the mid-seam (superellipse = rounded rect)
  const path = [];
  const N = 56;
  const hw = w / 2 - 0.003, hd = d / 2 - 0.003;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 0.42) * hw;
    const z = Math.sign(s) * Math.pow(Math.abs(s), 0.42) * hd;
    path.push(new THREE.Vector3(x, h / 2, z));
  }
  const curve = new THREE.CatmullRomCurve3(path, true);
  const pipe = new THREE.Mesh(res.geo(new THREE.TubeGeometry(curve, 96, 0.0038, 6, true)), pipeMat);
  pipe.castShadow = true;
  group.add(pipe);

  // quilting: shallow tufting buttons on a diamond grid
  const tuftGeo = res.geo(new THREE.SphereGeometry(0.0045, 8, 6));
  for (let i = -2; i <= 2; i++) {
    for (let j = -1; j <= 1; j++) {
      const t = new THREE.Mesh(tuftGeo, tick);
      t.position.set(i * w * 0.19, h - 0.0035, j * d * 0.28);
      t.scale.set(1, 0.35, 1);
      group.add(t);
    }
  }

  return { group, w, d, h, top: h };
}

export function makePillow(res, { w = 0.20, d = 0.14, h = 0.038 } = {}) {
  const group = new THREE.Group();
  const cloth = res.mat(MAT.makeCloth({
    color: 0xfffaf4, weave: 'plain', threads: 160, repeat: 3, seed: 19, sheen: 0.85, roughness: 0.94
  }));
  // A pillow is a flattened ellipsoid with the corners pulled out by the seam.
  const geo = res.geo(new THREE.SphereGeometry(0.5, 22, 16));
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const flat = 1 - Math.pow(Math.abs(v.y * 2), 1.6) * 0.15;
    v.x *= w * (0.9 + 0.2 * flat);
    v.z *= d * (0.9 + 0.2 * flat);
    v.y *= h * 2.0;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, cloth);
  body.position.y = h;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const seamMat = res.mat(MAT.makeCloth({ color: 0xe8d8e8, weave: 'knit', threads: 80, repeat: 8, seed: 20 }));
  const seam = new THREE.Mesh(
    res.geo(new THREE.TorusGeometry(1, 0.022, 5, 44)), seamMat);
  seam.rotation.x = Math.PI / 2;
  seam.scale.set(w * 0.53, d * 0.53, 0.14);
  seam.position.y = h;
  group.add(seam);

  return { group, w, d, h };
}

export { starShape, heartShape, circleShape, mergeAll, tint };
