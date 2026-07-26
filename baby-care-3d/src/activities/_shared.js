/* ============================================================================
 * activities/_shared.js — helpers shared by feed.js and dress.js
 * ----------------------------------------------------------------------------
 * Only these two activities import this file. Everything here is deliberately
 * small and dependency-free beyond three + the engine material/texture
 * libraries.
 *
 * The three pieces that matter most:
 *
 *   carveBite()   — the "CSG-lite" used for the apple / cookie / onigiri.
 *                   Every vertex that falls inside a bite sphere is projected
 *                   *onto* that sphere. Because the sphere centre sits just
 *                   outside the fruit, "away from the centre" points into the
 *                   flesh, so the surface is scooped out into a real spherical
 *                   cavity with a crisp crescent rim — and a cosine ripple on
 *                   the projection radius leaves tooth scallops in the rim.
 *
 *   wrapGeometry()— the inverse operation, used for cloth. Vertices inside a
 *                   collider sphere get pushed *out* onto it, so a garment
 *                   neck-hole genuinely stretches around the head instead of
 *                   intersecting it.
 *
 *   MiniCloth     — a compact verlet fallback used only when
 *                   ctx.physics.addCloth() is unavailable, so the cloth in
 *                   these two scenes always moves.
 * ========================================================================== */

import * as THREE from 'three';
import * as M from '../engine/materials.js';
import * as TEX from '../engine/textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ math -- */

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;

/** Hermite smoothstep. Works with a > b (reversed edges) too. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}

export const EASE = {
  linear: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  cubicOut: t => 1 - Math.pow(1 - t, 3),
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  back: t => {
    const c = 1.70158, s = c + 1;
    return 1 + s * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  elastic: t => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
  },
  bounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  }
};

/** Deterministic little PRNG so every screenshot run matches. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------- geometry -- */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Box with a real bevel on every edge. Vertices of a segmented box are pushed
 * onto the surface of a rounded core, exactly like RoundedBoxGeometry, and the
 * normals come out analytically correct.
 */
export function roundedBox(w, h, d, r = 0.01, seg = 3) {
  r = Math.min(r, Math.min(w, h, d) / 2 - 1e-4);
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    _v2.set(clamp(_v.x, -hx, hx), clamp(_v.y, -hy, hy), clamp(_v.z, -hz, hz));
    _v.sub(_v2);
    if (_v.lengthSq() < 1e-12) _v.set(0, 1, 0); else _v.normalize();
    nor.setXYZ(i, _v.x, _v.y, _v.z);
    pos.setXYZ(i, _v2.x + _v.x * r, _v2.y + _v.y * r, _v2.z + _v.z * r);
  }
  pos.needsUpdate = nor.needsUpdate = true;
  return g;
}

/** Rounded-rectangle THREE.Shape, centred on the origin. */
export function roundedRectShape(w, h, r) {
  r = Math.min(r, Math.min(w, h) / 2);
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Extrude a shape with a small bevel and lay it flat around the origin. */
export function extrudeShape(shape, depth, bevel = 0.003, curveSegments = 14) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelOffset: 0, bevelSegments: 2, steps: 1, curveSegments
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** Lathe from [[x,y], ...] pairs, bottom → top so normals face outward. */
export function lathe(profile, seg = 28, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(
    profile.map(p => new THREE.Vector2(p[0], p[1])), seg, 0, phiLength);
}

/** Tube along a CatmullRom through [[x,y,z], ...]. */
export function tube(points, radius, tubular = 24, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(p => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))), closed);
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

/** Merge a list of [geometry, matrix?] pairs into one buffer geometry. */
export function mergeAll(parts) {
  const list = [];
  for (const p of parts) {
    const g = Array.isArray(p) ? p[0] : p;
    const m = Array.isArray(p) ? p[1] : null;
    if (m) g.applyMatrix4(m);
    g.deleteAttribute('color');
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    list.push(g);
  }
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** Matrix helper for mergeAll. */
export function xform(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(scale[0], scale[1], scale[2]));
}

/** Add a flat white vertex-colour attribute (or a tinted one). */
export function addVertexColors(geometry, color = 0xffffff) {
  const n = geometry.attributes.position.count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geometry.attributes.color;
}

/** Paint vertex colours through a callback that receives (x, y, z, i). */
export function paintVertexColors(geometry, fn) {
  const pos = geometry.attributes.position;
  let col = geometry.attributes.color;
  if (!col) col = addVertexColors(geometry);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.set(0xffffff);
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), i, c);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  return col;
}

/**
 * Displace every vertex radially by fn(u, v, x, y, z) — the workhorse behind
 * the apple silhouette, the rice-grain lumps and the cookie crumb surface.
 */
export function displace(geometry, fn) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const u = uv ? uv.getX(i) : 0, vv = uv ? uv.getY(i) : 0;
    const d = fn(u, vv, _v.x, _v.y, _v.z, i);
    if (d) {
      const len = _v.length() || 1e-6;
      _v.multiplyScalar((len + d) / len);
      pos.setXYZ(i, _v.x, _v.y, _v.z);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/* ------------------------------------------------------- CSG-lite biting -- */

/**
 * Carve a spherical bite out of `mesh`.
 *
 * `centre` is in the mesh's own local space and should sit *just outside* the
 * surface: every vertex that lands inside the sphere is pushed away from the
 * centre onto the sphere shell, which — because the centre is outside — means
 * pushed into the flesh. `teeth` ripples that shell radius so the crescent rim
 * gets little tooth scallops instead of a machined arc.
 *
 * Returns the number of vertices that actually moved, so callers can tell a
 * real bite from a miss.
 */
export function carveBite(mesh, centre, radius, {
  teeth = 6, toothDepth = 0.07, flesh = null, fleshFalloff = 1.06, jitter = 0.05, seed = 5
} = {}) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  let col = g.attributes.color;
  if (flesh !== null && !col) col = addVertexColors(g);
  const fleshColor = flesh !== null ? new THREE.Color(flesh) : null;
  const rand = rng(seed);
  // A stable basis around the bite axis so the tooth ripple does not swim.
  const axis = _v3.copy(centre).normalize();
  if (!isFinite(axis.x) || axis.lengthSq() < 1e-9) axis.set(0, 1, 0);
  const tanA = new THREE.Vector3(0, 1, 0).cross(axis);
  if (tanA.lengthSq() < 1e-6) tanA.set(1, 0, 0); else tanA.normalize();
  const tanB = new THREE.Vector3().crossVectors(axis, tanA).normalize();

  let moved = 0;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    _v2.copy(_v).sub(centre);
    const d = _v2.length();
    if (d >= radius * fleshFalloff) continue;
    if (d < 1e-6) _v2.copy(axis);
    _v2.normalize();
    if (d < radius) {
      const phi = Math.atan2(_v2.dot(tanB), _v2.dot(tanA));
      const ripple = 1 + toothDepth * Math.cos(teeth * phi) + (rand() - 0.5) * jitter * 0.2;
      _v2.multiplyScalar(radius * ripple).add(centre);
      pos.setXYZ(i, _v2.x, _v2.y, _v2.z);
      moved++;
      if (fleshColor && col) col.setXYZ(i, fleshColor.r, fleshColor.g, fleshColor.b);
    } else if (fleshColor && col) {
      // one ring of transition so the rim reads as cut skin, not a decal
      const t = smoothstep(radius * fleshFalloff, radius, d);
      const r = lerp(col.getX(i), fleshColor.r, t);
      const gg = lerp(col.getY(i), fleshColor.g, t);
      const b = lerp(col.getZ(i), fleshColor.b, t);
      col.setXYZ(i, r, gg, b);
    }
  }
  if (moved) {
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
  if (col) col.needsUpdate = true;
  return moved;
}

/**
 * Push vertices OUT of a set of collider spheres, blending from a stored rest
 * pose. This is what makes a garment stretch over the head.
 * `colliders` = [{ centre: Vector3(local), radius, softness }]
 */
export function wrapGeometry(geometry, base, colliders, { blend = 1, softness = 1.3 } = {}) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
    for (const c of colliders) {
      const soft = c.softness || softness;
      _v2.copy(_v).sub(c.centre);
      const d = _v2.length();
      if (d > c.radius * soft || d < 1e-6) continue;
      const w = smoothstep(c.radius * soft, c.radius * 0.95, d) * blend;
      _v2.multiplyScalar(c.radius / d).add(c.centre);
      _v.lerp(_v2, w);
    }
    pos.setXYZ(i, _v.x, _v.y, _v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** Snapshot a geometry's positions so deformers can work from a rest pose. */
export function snapshot(geometry) {
  return Float32Array.from(geometry.attributes.position.array);
}

/** Restore a snapshot. */
export function restore(geometry, base) {
  geometry.attributes.position.array.set(base);
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
}

/* ----------------------------------------------------------------- cloth -- */

/**
 * Compact verlet cloth over a PlaneGeometry grid. Only used when
 * ctx.physics.addCloth() is not available; the engine solver is preferred.
 * Simulated in the mesh's local space, with world gravity rotated in.
 */
export class MiniCloth {
  constructor(mesh, {
    segX, segY, pins = [], gravity = -3.0, damping = 0.972,
    iterations = 3, wind = 0, stiffness = 0.9
  } = {}) {
    this.mesh = mesh;
    this.segX = segX; this.segY = segY;
    this.g = mesh.geometry;
    this.pos = this.g.attributes.position;
    this.n = this.pos.count;
    this.cur = Float32Array.from(this.pos.array);
    this.prev = Float32Array.from(this.pos.array);
    this.pinned = new Map();          // index → THREE.Vector3 (local target)
    for (const i of pins) {
      this.pinned.set(i, new THREE.Vector3(
        this.cur[i * 3], this.cur[i * 3 + 1], this.cur[i * 3 + 2]));
    }
    this.gravity = gravity;
    this.damping = damping;
    this.iterations = iterations;
    this.wind = wind;
    this.stiffness = stiffness;
    this.time = 0;
    this.constraints = [];
    const idx = (x, y) => y * (segX + 1) + x;
    const add = (a, b) => {
      const dx = this.cur[a * 3] - this.cur[b * 3];
      const dy = this.cur[a * 3 + 1] - this.cur[b * 3 + 1];
      const dz = this.cur[a * 3 + 2] - this.cur[b * 3 + 2];
      this.constraints.push(a, b, Math.hypot(dx, dy, dz));
    };
    for (let y = 0; y <= segY; y++) {
      for (let x = 0; x <= segX; x++) {
        if (x < segX) add(idx(x, y), idx(x + 1, y));
        if (y < segY) add(idx(x, y), idx(x, y + 1));
        if (x < segX && y < segY) add(idx(x, y), idx(x + 1, y + 1));
        if (x > 0 && y < segY) add(idx(x, y), idx(x - 1, y + 1));
      }
    }
  }

  setPin(index, localPos) {
    const p = this.pinned.get(index);
    if (p) p.copy(localPos); else this.pinned.set(index, localPos.clone());
  }

  /** colliders: [{ centre: Vector3(local), radius }] */
  update(dt, colliders = null) {
    dt = Math.min(dt, 1 / 45);
    this.time += dt;
    const cur = this.cur, prev = this.prev;
    // gravity in local space
    this.mesh.getWorldQuaternion(_q).invert();
    _v.set(0, this.gravity, 0).applyQuaternion(_q);
    const gx = _v.x * dt * dt, gy = _v.y * dt * dt, gz = _v.z * dt * dt;
    const w = this.wind;

    for (let i = 0; i < this.n; i++) {
      if (this.pinned.has(i)) continue;
      const i3 = i * 3;
      const px = cur[i3], py = cur[i3 + 1], pz = cur[i3 + 2];
      const puff = w ? Math.sin(this.time * 2.6 + py * 9 + px * 5) * w * dt * dt : 0;
      cur[i3] += (px - prev[i3]) * this.damping + gx + puff;
      cur[i3 + 1] += (py - prev[i3 + 1]) * this.damping + gy;
      cur[i3 + 2] += (pz - prev[i3 + 2]) * this.damping + gz + puff * 0.6;
      prev[i3] = px; prev[i3 + 1] = py; prev[i3 + 2] = pz;
    }

    const c = this.constraints;
    for (let it = 0; it < this.iterations; it++) {
      for (let k = 0; k < c.length; k += 3) {
        const a = c[k], b = c[k + 1], rest = c[k + 2];
        const a3 = a * 3, b3 = b * 3;
        let dx = cur[b3] - cur[a3];
        let dy = cur[b3 + 1] - cur[a3 + 1];
        let dz = cur[b3 + 2] - cur[a3 + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = ((d - rest) / d) * 0.5 * this.stiffness;
        dx *= diff; dy *= diff; dz *= diff;
        if (!this.pinned.has(a)) { cur[a3] += dx; cur[a3 + 1] += dy; cur[a3 + 2] += dz; }
        if (!this.pinned.has(b)) { cur[b3] -= dx; cur[b3 + 1] -= dy; cur[b3 + 2] -= dz; }
      }
      for (const [i, target] of this.pinned) {
        const i3 = i * 3;
        cur[i3] = target.x; cur[i3 + 1] = target.y; cur[i3 + 2] = target.z;
      }
      if (colliders) {
        for (let i = 0; i < this.n; i++) {
          if (this.pinned.has(i)) continue;
          const i3 = i * 3;
          for (const col of colliders) {
            const dx = cur[i3] - col.centre.x;
            const dy = cur[i3 + 1] - col.centre.y;
            const dz = cur[i3 + 2] - col.centre.z;
            const d = Math.hypot(dx, dy, dz);
            if (d < col.radius && d > 1e-6) {
              const s = col.radius / d;
              cur[i3] = col.centre.x + dx * s;
              cur[i3 + 1] = col.centre.y + dy * s;
              cur[i3 + 2] = col.centre.z + dz * s;
            }
          }
        }
      }
    }

    this.pos.array.set(cur);
    this.pos.needsUpdate = true;
    this.g.computeVertexNormals();
  }
}

/**
 * Hand the cloth to the engine solver if it exists, otherwise fall back to
 * MiniCloth. Returns { handle, mini, update(dt, colliders), release() }.
 */
export function makeCloth(ctx, mesh, opts) {
  let handle = null;
  try { handle = ctx.physics?.addCloth?.(mesh, opts) || null; } catch (e) { handle = null; }
  const mini = handle ? null : new MiniCloth(mesh, opts);
  return {
    handle,
    mini,
    setPin(i, p) { mini?.setPin(i, p); if (handle?.setPin) { try { handle.setPin(i, p); } catch (e) { /* engine may not expose pins */ } } },
    update(dt, colliders) { if (mini) mini.update(dt, colliders); },
    release() {
      if (handle) { try { ctx.physics?.removeBody?.(handle); } catch (e) { /* already gone */ } }
    }
  };
}

/**
 * Cloth-friendly plane: a grid the verlet solver can use, shaped by `profile`
 * (a function of the 0..1 row/column that returns a horizontal half-width) so
 * we can cut a bib or a skirt out of it without breaking the topology.
 */
export function clothPanel(width, height, segX, segY, profile = null) {
  const g = new THREE.PlaneGeometry(width, height, segX, segY);
  if (profile) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const v = 0.5 - y / height;                    // 0 at the top row
      pos.setX(i, pos.getX(i) * profile(clamp(v, 0, 1)));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

/** Indices of the top row of a PlaneGeometry grid — the usual pin set. */
export function topRow(segX) {
  const out = [];
  for (let x = 0; x <= segX; x++) out.push(x);
  return out;
}

/* -------------------------------------------------------------- picking -- */

const PROXY_GEOM = new THREE.SphereGeometry(1, 8, 6);
PROXY_GEOM.userData.shared = true;
const PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });
PROXY_MAT.userData.shared = true;

/**
 * Generous invisible hit target. The raycaster does not test `visible`, so an
 * invisible proxy costs nothing to draw but still catches small-finger taps.
 */
export function hitProxy(radius, name = 'hit') {
  const m = new THREE.Mesh(PROXY_GEOM, PROXY_MAT);
  m.scale.setScalar(radius);
  m.visible = false;
  m.name = name;
  m.userData.proxy = true;
  m.raycast = THREE.Mesh.prototype.raycast;
  return m;
}

export class Picker {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
  }

  ndc(p) {
    const el = this.renderer?.domElement;
    const r = el?.getBoundingClientRect?.() ||
      { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    this._ndc.set(
      ((p.x - r.left) / (r.width || 1)) * 2 - 1,
      -((p.y - r.top) / (r.height || 1)) * 2 + 1);
    return this._ndc;
  }

  cast(p, objects, recursive = true) {
    this.ray.setFromCamera(this.ndc(p), this.camera);
    return this.ray.intersectObjects(objects, recursive);
  }

  /** Nearest hit; walks up to the first ancestor carrying userData.pickId. */
  first(p, objects, recursive = true) {
    const hits = this.cast(p, objects, recursive);
    return hits.length ? hits[0] : null;
  }

  /** Point where the pointer ray meets `plane` (or null if parallel). */
  onPlane(p, plane, out = new THREE.Vector3()) {
    this.ray.setFromCamera(this.ndc(p), this.camera);
    return this.ray.ray.intersectPlane(plane, out);
  }

  /** A camera-facing drag plane through `point`. */
  dragPlane(point, out = new THREE.Plane()) {
    this.camera.getWorldDirection(_v);
    return out.setFromNormalAndCoplanarPoint(_v.negate(), point);
  }
}

/** Walk up the parent chain until an object carries `key` in userData. */
export function owner(object3D, key = 'pickId') {
  let o = object3D;
  while (o) {
    if (o.userData && o.userData[key] !== undefined) return o;
    o = o.parent;
  }
  return null;
}

/* ------------------------------------------------------- time & tweening -- */

/**
 * Frame-driven timers and tweens. Everything runs off update(dt) rather than
 * setTimeout so the screenshot harness — which steps the clock by hand — gets
 * exactly the same result as a real play session.
 */
export class Clockwork {
  constructor() { this.items = []; }

  after(seconds, fn) {
    const it = { t: 0, d: Math.max(1e-4, seconds), fn, kind: 'timer', dead: false };
    this.items.push(it);
    return it;
  }

  every(seconds, fn) {
    const it = { t: 0, d: Math.max(1e-4, seconds), fn, kind: 'repeat', dead: false };
    this.items.push(it);
    return it;
  }

  /** fn(t) is called with an eased 0..1 every frame, then onDone(). */
  tween(seconds, fn, { ease = EASE.inOut, onDone = null, tag = null } = {}) {
    if (tag) this.cancelTag(tag);
    const it = { t: 0, d: Math.max(1e-4, seconds), fn, ease, onDone, kind: 'tween', tag, dead: false };
    this.items.push(it);
    return it;
  }

  cancel(handle) { if (handle) handle.dead = true; }

  cancelTag(tag) {
    for (const it of this.items) if (it.tag === tag) it.dead = true;
  }

  clear() { this.items.length = 0; }

  update(dt) {
    if (!this.items.length) return;
    const list = this.items;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.dead) continue;
      it.t += dt;
      if (it.kind === 'tween') {
        const raw = clamp(it.t / it.d, 0, 1);
        try { it.fn(it.ease(raw), raw); } catch (e) { it.dead = true; }
        if (raw >= 1) { it.dead = true; try { it.onDone?.(); } catch (e) { /* ignore */ } }
      } else if (it.t >= it.d) {
        if (it.kind === 'repeat') it.t -= it.d; else it.dead = true;
        try { it.fn(); } catch (e) { it.dead = true; }
      }
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
  }
}

/** Critically-damped spring, handy for props that chase a target. */
export function springTo(current, target, velocity, dt, stiffness = 120, damping = 18) {
  const a = (target - current) * stiffness - velocity * damping;
  const v = velocity + a * dt;
  return [current + v * dt, v];
}

/* --------------------------------------------------------------- disposal - */

/**
 * Ownership ledger. Anything an activity creates is registered here and freed
 * in dispose(). Shared engine assets (memoised materials from materials.js,
 * cached textures from textures.js) are flagged `userData.shared` and skipped —
 * disposing those would rip surfaces out from under the other scenes.
 */
export class Trash {
  constructor() {
    this.objects = new Set();
    this.geometries = new Set();
    this.materials = new Set();
    this.textures = new Set();
    this.callbacks = [];
  }

  obj(o) { if (o) this.objects.add(o); return o; }
  geo(g) { if (g) this.geometries.add(g); return g; }
  mat(m) { if (m) this.materials.add(m); return m; }
  /** Only for textures this activity created itself. */
  tex(t) { if (t) { t.userData.own = true; this.textures.add(t); } return t; }
  fn(f) { if (f) this.callbacks.push(f); return f; }

  /** Mark an engine-owned (memoised / cached) material so we never free it. */
  static shared(m) { if (m) m.userData.shared = true; return m; }

  flush() {
    for (const f of this.callbacks) { try { f(); } catch (e) { /* keep tearing down */ } }
    this.callbacks.length = 0;

    for (const o of this.objects) {
      o.traverse?.(n => {
        if (n.geometry) this.geometries.add(n.geometry);
        const m = n.material;
        if (m) (Array.isArray(m) ? m : [m]).forEach(x => this.materials.add(x));
      });
      o.parent?.remove(o);
    }
    this.objects.clear();

    for (const g of this.geometries) if (!g.userData?.shared) g.dispose();
    this.geometries.clear();

    for (const m of this.materials) {
      if (m.userData?.shared) continue;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'alphaMap', 'emissiveMap',
        'metalnessMap', 'aoMap', 'sheenColorMap', 'clearcoatMap']) {
        const t = m[k];
        if (t && t.userData?.own) { t.dispose(); this.textures.delete(t); }
      }
      m.dispose();
    }
    this.materials.clear();

    for (const t of this.textures) t.dispose();
    this.textures.clear();
  }
}

/* ------------------------------------------------------------- materials - */

/**
 * Fruit / edible flesh: a soft plastic base pushed towards translucency so
 * apples and bananas read as something you could actually bite. Transmission
 * costs a render target, so tier 0 gets sheen only.
 */
export function fruitMaterial(tier, {
  color = 0xffffff, seed = 5, matte = 0.34, tint = 0xff7a52,
  thickness = 0.02, vertexColors = true
} = {}) {
  const m = M.makePlastic({ color, seed, matte, clearcoat: 0.55 });
  m.vertexColors = vertexColors;
  m.sheen = 0.35;
  m.sheenColor = new THREE.Color(0xffe6d2);
  m.sheenRoughness = 0.6;
  if (tier >= 1) {
    m.transmission = 0.22;
    m.thickness = thickness;
    m.ior = 1.36;
    m.attenuationColor = new THREE.Color(tint);
    m.attenuationDistance = 0.035;
  }
  return m;
}

/** Wet, glossy food surface — porridge, milk skin, jam. */
export function wetFoodMaterial({ color = 0xf3e2c4, seed = 12, rough = 0.42 } = {}) {
  const m = M.makePlastic({ color, seed, matte: rough, clearcoat: 1 });
  m.clearcoatRoughness = 0.08;
  m.normalMap = TEX.waterNormal({ seed: 33, scale: 12 });
  m.normalScale.set(0.22, 0.22);
  m.sheen = 0.2;
  m.envMapIntensity = 1.25;
  return m;
}

/** Opaque milk / liquid that still catches a soft highlight. */
export function liquidMaterial({ color = 0xfffaf2, rough = 0.28 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: rough,
    metalness: 0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xffffff),
    envMapIntensity: 1.2
  });
}

/** Bubbles / suds that must stay visible *behind* a transmissive surface. */
export function sudsMaterial({ color = 0xffffff, opacity = 0.9 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.22,
    metalness: 0,
    transparent: true,
    opacity,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    sheen: 1,
    sheenColor: new THREE.Color(0xffffff),
    envMapIntensity: 1.6,
    depthWrite: opacity > 0.85
  });
}

/* ---------------------------------------------------------------- scene --- */

/** Set cast/receive shadow flags across a subtree. */
export function shade(root, cast = true, receive = true) {
  root.traverse(n => {
    if (n.isMesh && !n.userData.proxy) { n.castShadow = cast; n.receiveShadow = receive; }
  });
  return root;
}

/** Copy an anchor's world transform onto `group`, with a local-space offset. */
export function placeAtAnchor(group, anchor, offset = [0, 0, 0], fallback = [0, 0, 0]) {
  if (anchor && anchor.isObject3D) {
    anchor.updateWorldMatrix(true, false);
    anchor.getWorldPosition(_v);
    anchor.getWorldQuaternion(_q);
    group.position.copy(_v);
    group.quaternion.copy(_q);
    group.translateX(offset[0]);
    group.translateY(offset[1]);
    group.translateZ(offset[2]);
  } else {
    group.position.set(
      fallback[0] + offset[0], fallback[1] + offset[1], fallback[2] + offset[2]);
    group.quaternion.identity();
  }
  return group;
}

/* --------------------------------------------- defensive engine wrappers -- */
/* The room / baby / fx / audio / ui modules land in parallel with these two
 * scenes. Everything crossing that boundary is optional-chained and wrapped so
 * a missing sound or an un-implemented decal kind can never break gameplay. */

export function play(ctx, name, opts) {
  try { ctx.audio?.play?.(name, opts); } catch (e) { /* silent */ }
}

export function loop(ctx, name, opts) {
  try { return ctx.audio?.loop?.(name, opts) || null; } catch (e) { return null; }
}

export function burst(ctx, kind, pos, count, opts) {
  try { ctx.fx?.burst?.(kind, pos, count, opts); } catch (e) { /* silent */ }
}

export function ribbon(ctx, from, to, opts) {
  try { return ctx.fx?.ribbon?.(from, to, opts) || null; } catch (e) { return null; }
}

export function decal(ctx, kind, mesh, uv, opts) {
  try { return ctx.fx?.decal?.(kind, mesh, uv, opts) || null; } catch (e) { return null; }
}

export function say(ctx, text, icon) {
  try { ctx.ui?.prompt?.(text, icon ? { icon } : undefined); } catch (e) { /* silent */ }
}

export function hideSay(ctx) {
  try { ctx.ui?.hidePrompt?.(); } catch (e) { /* silent */ }
}

export function toast(ctx, text, opts) {
  try { ctx.ui?.toast?.(text, opts); } catch (e) { /* silent */ }
}

export function worldLabel(ctx, object3D, text, opts) {
  try { return ctx.ui?.worldLabel?.(object3D, text, opts) || null; } catch (e) { return null; }
}

export function dropLabel(ctx, handle) {
  if (!handle) return;
  try {
    if (typeof handle === 'function') { handle(); return; }
    if (handle.remove) handle.remove();
    else if (handle.dispose) handle.dispose();
    else if (handle.hide) handle.hide();
    else if (handle.visible !== undefined) handle.visible = false;
  } catch (e) { /* silent */ }
}

export function mood(ctx, name) {
  try { ctx.baby?.setMood?.(name); } catch (e) { /* silent */ }
}

/** Try gesture names in order; the rig may not know all of them. */
export function gesture(ctx, names) {
  for (const n of (Array.isArray(names) ? names : [names])) {
    try { if (ctx.baby?.gesture?.(n) !== false) return n; } catch (e) { /* next */ }
  }
  return null;
}

export function lookAt(ctx, posOrNull) {
  try { ctx.baby?.lookAt?.(posOrNull); } catch (e) { /* silent */ }
}

export function babySay(ctx, kind) {
  try { ctx.baby?.say?.(kind); } catch (e) { /* silent */ }
}

export function setDirt(ctx, zone, amount) {
  try { ctx.baby?.setDirt?.(zone, clamp(amount, 0, 1)); } catch (e) { /* silent */ }
}

/** Read a meter without assuming State has been populated yet. */
export function meter(ctx, name) {
  const v = ctx.state?.meters?.[name];
  return typeof v === 'number' ? v : 0.5;
}

/** Nudge a meter and mirror it into the HUD. */
export function bumpMeter(ctx, name, delta) {
  const next = clamp(meter(ctx, name) + delta, 0, 1);
  try {
    if (ctx.state?.meters) ctx.state.meters[name] = next;
    ctx.state?.patch?.({ meters: { ...(ctx.state?.meters || {}), [name]: next } });
  } catch (e) { /* silent */ }
  try { ctx.ui?.meter?.(name, next); } catch (e) { /* silent */ }
  return next;
}

/** Award stars — always a reward, never a score. */
export function award(ctx, n = 1) {
  let total = n;
  try {
    total = (ctx.state?.stars || 0) + n;
    ctx.state?.patch?.({ stars: total });
  } catch (e) { /* silent */ }
  try { ctx.ui?.star?.(total); } catch (e) { /* silent */ }
  return total;
}

/** World position of a baby bone with a graceful fallback. */
export function bonePos(ctx, name, fallback, out = new THREE.Vector3()) {
  try {
    if (name === 'mouth' && ctx.baby?.mouthWorldPos) return out.copy(ctx.baby.mouthWorldPos());
    if (name === 'head' && ctx.baby?.headWorldPos) return out.copy(ctx.baby.headWorldPos());
    const b = ctx.baby?.bone?.(name);
    if (b && b.isObject3D) return b.getWorldPosition(out);
  } catch (e) { /* fall through */ }
  return out.copy(fallback);
}

/** Chest / focus point, the safest anchor the Baby contract gives us. */
export function chestPos(ctx, fallback, out = new THREE.Vector3()) {
  try {
    const p = ctx.baby?.focusPoint?.();
    if (p) return out.copy(p);
  } catch (e) { /* fall through */ }
  return out.copy(fallback);
}
