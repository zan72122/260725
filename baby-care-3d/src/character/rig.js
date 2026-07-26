/* ============================================================================
 * rig.js — skeleton, skinning and IK
 * ----------------------------------------------------------------------------
 * A real bone hierarchy with hand-computed skin weights. Three things here are
 * worth more than they cost:
 *
 *   • Hierarchy-aware falloff. Pure distance weighting makes the head bone
 *     grab the shoulders (they are close in space, far in the skeleton). Every
 *     weight is damped by graph distance from the vertex's nearest bone, which
 *     removes that class of artefact completely.
 *   • A spatial smoothing pass. Two iterations of neighbourhood averaging turn
 *     an analytically-correct-but-lumpy weight field into one that deforms
 *     smoothly across the whole surface.
 *   • Half-angle helper bones at elbows and knees. A single-bone joint on a
 *     chubby limb pinches badly at 90°; a leaf bone carrying half the child's
 *     rotation costs almost nothing and removes the pinch.
 * ========================================================================== */

import * as THREE from 'three';
import { anchors } from './anatomy.js';

const A = anchors();
const mir = (p, s) => [p[0] * s, p[1], p[2]];

/**
 * Bone table. `pos` is world-space in the bind pose (converted to local when
 * the hierarchy is built). `seg` is the segment used for skin weighting,
 * `sig` its falloff radius, `w` a manual weight multiplier.
 */
export function boneTable() {
  const B = [
    { name: 'root', parent: null, pos: [0, 0, 0], sig: 0 },
    { name: 'hips', parent: 'root', pos: A.hips, tail: A.spine, sig: 0.062 },
    { name: 'spine', parent: 'hips', pos: A.spine, tail: A.chest, sig: 0.058 },
    { name: 'chest', parent: 'spine', pos: A.chest, tail: A.neck, sig: 0.058 },
    { name: 'neck', parent: 'chest', pos: A.neck, tail: A.head, sig: 0.030 },
    { name: 'head', parent: 'neck', pos: A.head, tail: A.crown, sig: 0.085 },
    { name: 'headEnd', parent: 'head', pos: A.crown, sig: 0 },
    // soft-body bone: only the front of the belly, so it can wobble on its own
    { name: 'belly', parent: 'spine', pos: A.belly, sig: 0, mask: 'belly' }
  ];
  for (const s of [1, -1]) {
    const k = s > 0 ? 'L' : 'R';
    B.push(
      { name: 'shoulder' + k, parent: 'chest', pos: mir(A.shoulder, s), tail: mir(A.arm, s), sig: 0.032 },
      { name: 'arm' + k, parent: 'shoulder' + k, pos: mir(A.arm, s), tail: mir(A.forearm, s), sig: 0.040 },
      { name: 'elbow' + k, parent: 'arm' + k, pos: mir(A.forearm, s), sig: 0, mask: 'joint', maskR: 0.030, helper: 'forearm' + k },
      { name: 'forearm' + k, parent: 'arm' + k, pos: mir(A.forearm, s), tail: mir(A.hand, s), sig: 0.034 },
      { name: 'hand' + k, parent: 'forearm' + k, pos: mir(A.hand, s), tail: mir(A.handEnd, s), sig: 0.030 },
      { name: 'handEnd' + k, parent: 'hand' + k, pos: mir(A.handEnd, s), sig: 0 },
      { name: 'thigh' + k, parent: 'hips', pos: mir(A.thigh, s), tail: mir(A.shin, s), sig: 0.052 },
      { name: 'knee' + k, parent: 'thigh' + k, pos: mir(A.shin, s), sig: 0, mask: 'joint', maskR: 0.040, helper: 'shin' + k },
      { name: 'shin' + k, parent: 'thigh' + k, pos: mir(A.shin, s), tail: mir(A.foot, s), sig: 0.042 },
      { name: 'foot' + k, parent: 'shin' + k, pos: mir(A.foot, s), tail: mir(A.toe, s), sig: 0.040 },
      { name: 'toe' + k, parent: 'foot' + k, pos: mir(A.toe, s), sig: 0.018 }
    );
  }
  return B;
}

/* --------------------------------------------------------- weight solve --- */

function distToSeg(px, py, pz, a, b) {
  if (!b) return Math.hypot(px - a[0], py - a[1], pz - a[2]);
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  let t = ((px - a[0]) * bx + (py - a[1]) * by + (pz - a[2]) * bz) / (l2 || 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a[0] + bx * t), py - (a[1] + by * t), pz - (a[2] + bz * t));
}

/** BFS hop distance between every pair of bones over the parent/child graph. */
function hopMatrix(table) {
  const n = table.length;
  const idx = {}; table.forEach((b, i) => { idx[b.name] = i; });
  const adj = Array.from({ length: n }, () => []);
  table.forEach((b, i) => {
    if (b.parent != null) { const p = idx[b.parent]; adj[i].push(p); adj[p].push(i); }
  });
  const H = [];
  for (let i = 0; i < n; i++) {
    const d = new Int16Array(n).fill(99);
    d[i] = 0; const q = [i];
    while (q.length) {
      const c = q.shift();
      for (const v of adj[c]) if (d[v] > d[c] + 1) { d[v] = d[c] + 1; q.push(v); }
    }
    H.push(d);
  }
  return { H, idx };
}

/**
 * Compute skinIndex / skinWeight attributes for a geometry.
 * Returns nothing; the attributes are written onto the geometry.
 */
export function computeSkinWeights(geometry, table, { smooth = 2 } = {}) {
  const pos = geometry.attributes.position.array;
  const nv = pos.length / 3;
  const n = table.length;
  const { H } = hopMatrix(table);

  const raw = new Float32Array(nv * n);
  const dist = new Float64Array(n);

  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let near = -1, nd = Infinity;
    for (let i = 0; i < n; i++) {
      const b = table[i];
      dist[i] = b.sig > 0 || b.mask ? distToSeg(x, y, z, b.pos, b.tail) : Infinity;
      if (b.sig > 0 && dist[i] < nd) { nd = dist[i]; near = i; }
    }
    if (near < 0) near = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const b = table[i];
      let w = 0;
      if (b.mask === 'joint') {
        // half-angle helper: owns a ball of skin centred on the joint
        const q = dist[i] / b.maskR;
        w = Math.exp(-q * q) * 0.62;
      } else if (b.mask === 'belly') {
        // only the soft front-lower quadrant of the abdomen wobbles
        const q = Math.hypot((x) / 0.062, (y - 0.320) / 0.048, (z - 0.046) / 0.055);
        w = Math.exp(-q * q) * 0.55;
      } else if (b.sig > 0) {
        const q = dist[i] / b.sig;
        w = Math.exp(-q * q) * Math.pow(0.26, H[near][i]);
      }
      raw[v * n + i] = w;
      sum += w;
    }
    if (sum <= 1e-8) raw[v * n + near] = 1;
  }

  // --- spatial smoothing: a grid hash neighbourhood average -----------------
  if (smooth > 0) {
    const cell = 0.014;
    const key = (i, j, k) => i * 73856093 ^ j * 19349663 ^ k * 83492791;
    const grid = new Map();
    for (let v = 0; v < nv; v++) {
      const k = key(Math.floor(pos[v * 3] / cell), Math.floor(pos[v * 3 + 1] / cell), Math.floor(pos[v * 3 + 2] / cell));
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(v);
    }
    let src = raw, dst = new Float32Array(raw.length);
    for (let pass = 0; pass < smooth; pass++) {
      for (let v = 0; v < nv; v++) {
        const ci = Math.floor(pos[v * 3] / cell), cj = Math.floor(pos[v * 3 + 1] / cell), ck = Math.floor(pos[v * 3 + 2] / cell);
        let count = 0;
        const o = v * n;
        for (let i = 0; i < n; i++) dst[o + i] = 0;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const arr = grid.get(key(ci + dx, cj + dy, ck + dz));
          if (!arr) continue;
          for (const u of arr) {
            const d2 = (pos[u * 3] - pos[v * 3]) ** 2 + (pos[u * 3 + 1] - pos[v * 3 + 1]) ** 2 + (pos[u * 3 + 2] - pos[v * 3 + 2]) ** 2;
            if (d2 > cell * cell * 1.6) continue;
            const uo = u * n;
            for (let i = 0; i < n; i++) dst[o + i] += src[uo + i];
            count++;
          }
        }
        if (count) for (let i = 0; i < n; i++) dst[o + i] /= count;
        else for (let i = 0; i < n; i++) dst[o + i] = src[o + i];
      }
      const t = src; src = dst; dst = t;
    }
    raw.set(src);
  }

  // --- top 4, normalised ----------------------------------------------------
  const si = new Uint16Array(nv * 4);
  const sw = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const o = v * n;
    const top = [-1, -1, -1, -1], tw = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const w = raw[o + i];
      if (w <= tw[3]) continue;
      let k = 3;
      while (k > 0 && w > tw[k - 1]) { tw[k] = tw[k - 1]; top[k] = top[k - 1]; k--; }
      tw[k] = w; top[k] = i;
    }
    let s = tw[0] + tw[1] + tw[2] + tw[3];
    if (s <= 1e-9) { top[0] = 0; tw[0] = 1; s = 1; }
    for (let k = 0; k < 4; k++) {
      si[v * 4 + k] = Math.max(0, top[k]);
      sw[v * 4 + k] = tw[k] / s;
    }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
}

/* ------------------------------------------------------------------ rig --- */

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Rig {
  constructor() {
    this.table = boneTable();
    this.bones = {};
    this.order = [];
    this.root = new THREE.Object3D();
    this.root.name = 'rigRoot';

    for (const def of this.table) {
      const b = new THREE.Bone();
      b.name = def.name;
      this.bones[def.name] = b;
      this.order.push(b);
      if (def.parent) {
        const p = this.bones[def.parent];
        const pd = this.table.find(t => t.name === def.parent);
        b.position.set(def.pos[0] - pd.pos[0], def.pos[1] - pd.pos[1], def.pos[2] - pd.pos[2]);
        p.add(b);
      } else {
        b.position.set(...def.pos);
        this.root.add(b);
      }
      b.userData.rest = b.position.clone();
      b.userData.restQ = b.quaternion.clone();
    }
    this.skeleton = new THREE.Skeleton(this.order);
    this.root.updateMatrixWorld(true);

    // half-angle helpers, resolved once
    this.helpers = this.table
      .filter(d => d.helper)
      .map(d => ({ bone: this.bones[d.name], src: this.bones[d.helper] }));

    /* attachment anchors: named sockets that props hang off ---------------- */
    this.sockets = {};
    const socket = (name, boneName, offset) => {
      const o = new THREE.Object3D();
      o.name = 'socket:' + name;
      o.position.set(...offset);
      this.bones[boneName].add(o);
      this.sockets[name] = o;
      return o;
    };
    socket('mouth', 'head', [0, A.mouth[1] - A.head[1], A.mouth[2] + 0.010]);
    socket('head', 'head', [0, A.crown[1] - A.head[1] + 0.012, 0]);
    socket('back', 'chest', [0, 0.010, -0.070]);
    socket('lap', 'hips', [0, 0.030, 0.070]);
    socket('leftHand', 'handL', [0.008, -0.012, 0.014]);
    socket('rightHand', 'handR', [-0.008, -0.012, 0.014]);
    socket('chest', 'chest', [0, 0.008, 0.040]);
  }

  bone(name) {
    return this.bones[name] || this.sockets[name] ||
      this.bones[{ leftHand: 'handL', rightHand: 'handR' }[name]] || null;
  }

  /** Bind a geometry: compute weights and return a SkinnedMesh on our skeleton. */
  bind(geometry, material) {
    computeSkinWeights(geometry, this.table);
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;      // the rig moves far outside the bind box
    this.root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(this.skeleton, new THREE.Matrix4());
    return mesh;
  }

  resetPose() {
    for (const b of this.order) {
      b.position.copy(b.userData.rest);
      b.quaternion.copy(b.userData.restQ);
      b.scale.set(1, 1, 1);
    }
  }

  /** Drive the half-angle helpers. Call after posing, before matrix update. */
  update() {
    for (const h of this.helpers) {
      h.bone.quaternion.set(0, 0, 0, 1).slerp(h.src.quaternion, 0.5);
    }
  }
}

/* ------------------------------------------------------------------- IK --- */

/**
 * Analytic two-bone IK (law of cosines) with a pole vector.
 *
 * Used so activities can say "put the left hand on the bottle" and get a
 * plausible whole-arm solution instead of a hand detached from a wrist.
 * Works entirely in world space then converts back to local quaternions.
 */
export function solveTwoBoneIK(rootBone, midBone, endBone, targetWorld, poleWorld, weight = 1) {
  rootBone.updateWorldMatrix(true, false);
  const a = _v.setFromMatrixPosition(rootBone.matrixWorld).clone();
  midBone.updateWorldMatrix(true, false);
  const b = _v2.setFromMatrixPosition(midBone.matrixWorld).clone();
  endBone.updateWorldMatrix(true, false);
  const c = _v3.setFromMatrixPosition(endBone.matrixWorld).clone();

  const lab = a.distanceTo(b);
  const lcb = b.distanceTo(c);
  let lat = a.distanceTo(targetWorld);
  const eps = 1e-5;
  lat = THREE.MathUtils.clamp(lat, eps, lab + lcb - eps);

  const acab = Math.acos(THREE.MathUtils.clamp(
    c.clone().sub(a).normalize().dot(b.clone().sub(a).normalize()), -1, 1));
  const acba = Math.acos(THREE.MathUtils.clamp(
    a.clone().sub(b).normalize().dot(c.clone().sub(b).normalize()), -1, 1));
  const acat = Math.acos(THREE.MathUtils.clamp(
    targetWorld.clone().sub(a).normalize().dot(c.clone().sub(a).normalize()), -1, 1));

  const atab = Math.acos(THREE.MathUtils.clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1));
  const atba = Math.acos(THREE.MathUtils.clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));

  const axis0 = c.clone().sub(a).cross(b.clone().sub(a)).normalize();
  if (!isFinite(axis0.x)) return;
  const axis1 = c.clone().sub(a).cross(poleWorld.clone().sub(a)).normalize();

  const rotLocal = (bone, axisWorld, angle) => {
    bone.parent.updateWorldMatrix(true, false);
    const inv = _m.copy(bone.parent.matrixWorld).invert();
    const axL = axisWorld.clone().transformDirection(inv).normalize();
    bone.quaternion.premultiply(_q.setFromAxisAngle(axL, angle * weight));
  };

  rotLocal(rootBone, axis0, atab - acab);
  rotLocal(midBone, axis0, atba - acba);
  if (isFinite(axis1.x)) rotLocal(rootBone, axis1, acat * weight);

  // re-aim so the chain actually points at the target after the plane twist
  rootBone.updateWorldMatrix(true, true);
  endBone.updateWorldMatrix(true, false);
  const cNow = new THREE.Vector3().setFromMatrixPosition(endBone.matrixWorld);
  const from = cNow.clone().sub(a).normalize();
  const to = targetWorld.clone().sub(a).normalize();
  const ax = from.clone().cross(to);
  if (ax.lengthSq() > 1e-10) {
    rotLocal(rootBone, ax.normalize(), Math.acos(THREE.MathUtils.clamp(from.dot(to), -1, 1)));
  }
}
