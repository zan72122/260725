/* ============================================================================
 * props.js — reusable nursery prop builders
 * ----------------------------------------------------------------------------
 * Everything in the room is real geometry. Three rules run through this file:
 *
 *  1. No sharp 90° edges. Every box is a bevelled extrusion, every turned part
 *     is a lathe. A 4 mm chamfer costs almost nothing and is the single biggest
 *     difference between "modelled" and "placeholder".
 *  2. Merge or instance relentlessly. A prop gets one draw call per material;
 *     repeated elements (spindles, books, bunting, toys) become an InstancedMesh
 *     with per-instance colour.
 *  3. Nothing is perfectly symmetrical. A drawer sits proud, a book leans, a
 *     rug corner lifts, a picture hangs a degree off. Perfection is the tell.
 *
 * NOTE on instance colours: three r180 only multiplies `vColor` into the
 * surface when USE_COLOR is defined, so any material used with `instanceColor`
 * must have `vertexColors = true` *and* its geometry must carry a white
 * `color` attribute. `instanced()` below takes care of both.
 * ========================================================================== */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as MAT from '../engine/materials.js';
import * as TEX from '../engine/textures.js';

/* ------------------------------------------------------------- helpers --- */

/** Deterministic RNG — the room must look identical in every screenshot run. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Bake a transform into a geometry so it can be merged. */
export function xf(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _v.set(pos[0], pos[1], pos[2]);
  const sc = Array.isArray(scale) ? scale : [scale, scale, scale];
  _s.set(sc[0], sc[1], sc[2]);
  geo.applyMatrix4(_m4.compose(_v, _q, _s));
  return geo;
}

/** Paint a whole geometry one vertex colour so it can share a material. */
export function tint(geo, hex) {
  const c = _c.set(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Merge a pile of geometries into one buffer. mergeGeometries() refuses
 * mismatched attribute sets, so everything is normalised to non-indexed
 * position/normal/uv(/color) first.
 */
export function mergeAll(geos, { colors = false } = {}) {
  const keep = colors ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
  const list = [];
  for (const src of geos) {
    if (!src) continue;
    const g = src.index ? src.toNonIndexed() : src;
    for (const name of Object.keys(g.attributes)) {
      if (!keep.includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(
        new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (colors && !g.attributes.color) tint(g, 0xffffff);
    g.clearGroups();
    list.push(g);
  }
  if (!list.length) return new THREE.BufferGeometry();
  if (list.length === 1) return list[0];
  return mergeGeometries(list, false);
}

/** Mesh helper: shadows on, name set, one line. */
export function mesh(geo, mat, name = '') {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

/**
 * InstancedMesh with per-instance colour.
 * `items` = [{ pos:[x,y,z], rot:[x,y,z], scale, color }]
 */
export function instanced(geo, mat, items, name = '') {
  if (!geo.attributes.color) tint(geo, 0xffffff);
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  im.castShadow = true;
  im.receiveShadow = true;
  im.name = name;
  items.forEach((it, i) => {
    _e.set(...(it.rot || [0, 0, 0]));
    _q.setFromEuler(_e);
    _v.set(...(it.pos || [0, 0, 0]));
    const sc = it.scale === undefined ? 1 : it.scale;
    _s.set(...(Array.isArray(sc) ? sc : [sc, sc, sc]));
    im.setMatrixAt(i, _m4.compose(_v, _q, _s));
    im.setColorAt(i, _c.set(it.color === undefined ? 0xffffff : it.color));
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  return im;
}

/**
 * Box with rounded edges on all three axes, built as a bevelled extrusion.
 * `r` is the fillet radius in metres — 0.004–0.02 for furniture.
 */
export function roundedBox(w, h, d, r = 0.012, smooth = 2) {
  r = Math.min(r, Math.min(w, h, d) * 0.48);
  const eps = 1e-5;
  const r0 = r - eps;
  const shape = new THREE.Shape();
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, h - r0 * 2, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(w - r0 * 2, h - r0 * 2, eps, Math.PI / 2, 0, true);
  shape.absarc(w - r0 * 2, eps, eps, 0, -Math.PI / 2, true);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, d - r * 2),
    bevelEnabled: true,
    bevelSegments: smooth,
    bevelSize: r,
    bevelThickness: r,
    steps: 1,
    curveSegments: smooth
  });
  geo.center();
  return geo;
}

/** Rounded box, pre-positioned and re-UV'd. The workhorse of this file. */
export function rbox(w, h, d, pos = [0, 0, 0], rot = [0, 0, 0], r = 0.01, uvScale = 1) {
  const g = roundedBox(w, h, d, r);
  boxUV(g, uvScale);
  return xf(g, pos, rot);
}

/**
 * Re-project UVs per dominant face normal, in world units. Extrusions come out
 * of three with world-space cap UVs and nonsense side UVs; this makes wood
 * grain and paint texture run consistently across every face of a prop.
 */
export function boxUV(geo, scale = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz) { u = pos.getZ(i); v = pos.getY(i); }
    else if (ny >= nx && ny >= nz) { u = pos.getX(i); v = pos.getZ(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Extrude a 2D moulding profile (x = out from wall, y = up) along +Z. */
export function extrudeProfile(points, length, { bevel = 0.0015, curve = 3, shape = null } = {}) {
  const s = shape || new THREE.Shape(points.map(p => new THREE.Vector2(p[0], p[1])));
  return new THREE.ExtrudeGeometry(s, {
    depth: length,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: curve
  });
}

/** Turned part (spindle, post, knob, pot) from a [radius, height] profile. */
export function lathe(profile, segments = 14) {
  const pts = profile.map(p => new THREE.Vector2(Math.max(1e-4, p[0]), p[1]));
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

/** Closed rounded-rectangle path in the XZ plane — piping, seams, hoops. */
export function roundedRectCurve(w, d, r, y = 0, steps = 6) {
  const pts = [];
  const hw = Math.max(0.001, w / 2 - r), hd = Math.max(0.001, d / 2 - r);
  const corners = [[hw, hd, 0], [-hw, hd, Math.PI / 2], [-hw, -hd, Math.PI], [hw, -hd, -Math.PI / 2]];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i < steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
  }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.4);
}

/**
 * A rectangular cloth panel with a sine fold profile, gently tapered and
 * hemmed. Used for curtains, the crib blanket and the changing-mat cover.
 * Returns a geometry whose position buffer can be re-written by `foldCloth`.
 */
export function clothPanel(w, h, { cols = 20, rows = 14, folds = 4, amp = 0.03, drape = 0 } = {}) {
  const g = new THREE.PlaneGeometry(w, h, cols, rows);
  g.userData.cloth = { w, h, cols, rows, folds, amp, drape };
  foldCloth(g, { folds, amp, drape });
  return g;
}

/** Re-shape a cloth panel in place (cheap enough to call while animating). */
export function foldCloth(g, { folds = 4, amp = 0.03, drape = 0, gather = 0, sway = 0 } = {}) {
  const info = g.userData.cloth;
  const pos = g.attributes.position;
  const w = info.w, h = info.h;
  for (let i = 0; i < pos.count; i++) {
    const x0 = ((i % (info.cols + 1)) / info.cols) - 0.5;      // -0.5..0.5 across
    const y0 = 1 - Math.floor(i / (info.cols + 1)) / info.rows; // 1 at top, 0 at hem
    // Gathering pulls the panel narrower at the top and deepens the folds,
    // exactly like real curtain heading tape.
    const narrow = 1 - gather * 0.55 * (0.35 + 0.65 * y0);
    const x = x0 * w * narrow;
    const phase = x0 * Math.PI * 2 * folds;
    const foldDepth = amp * (0.45 + 0.55 * (1 - y0)) * (1 + gather * 1.9);
    const z = Math.sin(phase) * foldDepth
            + Math.sin(phase * 0.5 + 1.1) * foldDepth * 0.35
            + drape * (1 - y0) * (1 - y0) * 0.5
            + sway * (1 - y0) * (1 - y0);
    const y = (y0 - 0.5) * h - (1 - y0) * foldDepth * 0.25;   // hem swings in a little
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------ contact shadows --- */

/**
 * Every static prop sits on a soft blob. This is the instanced twin of
 * `contactShadow()` in lighting.js: identical falloff maths, but the whole
 * room's blobs cost one draw call, with per-instance opacity and softness
 * smuggled through `instanceColor` (r = opacity, g = softness).
 */
export class ShadowField {
  constructor() { this.items = []; }

  add(x, z, rx, rz = rx, { opacity = 0.42, softness = 0.45, rot = 0, y = 0.004 } = {}) {
    this.items.push({ x, y, z, rx, rz, opacity, softness, rot });
    return this;
  }

  build() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(0x3d2130) },
        uGlobal: { value: 1.0 }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vC;
        void main() {
          vUv = uv;
          vC = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
            vC = instanceColor;
          #endif
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * p;
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vC;
        uniform vec3 uColor;
        uniform float uGlobal;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          // vC.g drives the exponent: tight dark cores under legs, wide haze
          // under soft goods.
          float a = pow(max(0.0, 1.0 - d), 1.0 + vC.g * 6.0) * vC.r * uGlobal;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor, a);
        }`
    });
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, this.items.length));
    im.frustumCulled = false;
    im.renderOrder = -1;
    im.name = 'contactShadows';
    this.items.forEach((it, i) => {
      _e.set(0, it.rot, 0);
      _q.setFromEuler(_e);
      _v.set(it.x, it.y, it.z);
      _s.set(it.rx * 2, 1, it.rz * 2);
      im.setMatrixAt(i, _m4.compose(_v, _q, _s));
      _c.setRGB(it.opacity, it.softness, 1);   // raw linear payload, not a colour
      im.setColorAt(i, _c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.userData.setGlobal = v => { mat.uniforms.uGlobal.value = v; };
    return im;
  }
}

/* ------------------------------------------------------------- palette --- */

/**
 * One shared material set for the whole room — sharing is what keeps the draw
 * call count down, because a merged geometry is only mergeable per material.
 */
export function palette() {
  const P = {};

  P.wall = MAT.makeWall({ base: 0xf7ece3, tint: 0xe4d3c6, repeat: 0.8, seed: 11 });
  P.floor = MAT.makeWood({
    light: 0xdfba90, dark: 0xa5723f, planks: 7, repeat: 2.4, seed: 5,
    ringScale: 44, clearcoat: 0.26, satin: 0.5
  });
  P.trim = MAT.makePaint({ color: 0xfffaf4, repeat: 1.1, seed: 43, gloss: 0.45 });
  P.ceiling = MAT.makePaint({ color: 0xfff8f1, repeat: 0.5, seed: 47, gloss: 0.1 });
  P.dark = MAT.makePaint({ color: 0x6d5a5c, repeat: 0.8, seed: 49, gloss: 0.08 });

  // Two furniture woods: pale beech for the baby pieces, warmer oak for the
  // big case goods, so the room doesn't read as a single flat-pack set.
  P.beech = MAT.makeWood({ light: 0xe7c79c, dark: 0xbb8d5c, repeat: 1.4, seed: 3, ringScale: 30, clearcoat: 0.4 });
  P.oak = MAT.makeWood({ light: 0xd3a271, dark: 0x8a5a30, repeat: 1.2, seed: 13, ringScale: 22, clearcoat: 0.3 });
  // Hand-worn wood: knobs, crib rails, the toy-box lid edge. Rougher, darker,
  // no lacquer left — this is where the room stops looking brand new.
