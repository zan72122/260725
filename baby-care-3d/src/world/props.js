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
  P.worn = MAT.makeWood({
    light: 0xd6ab7d, dark: 0x8f6337, repeat: 3.0, seed: 9,
    ringScale: 18, clearcoat: 0.05, satin: 0.74
  });
  P.paintedWhite = MAT.makePaint({ color: 0xfdf5ef, repeat: 1.5, seed: 51, gloss: 0.5 });
  P.paintedMint = MAT.makePaint({ color: 0xd9e9df, repeat: 1.5, seed: 53, gloss: 0.45 });
  P.metal = MAT.makeMetal({ color: 0xcfc8bf, roughness: 0.34 });
  P.brass = MAT.makeMetal({ color: 0xceac78, roughness: 0.3 });
  P.ceramic = MAT.makeCeramic({ color: 0xf3e9dd, repeat: 1.5, seed: 31 });
  P.glass = MAT.makeWindowGlass();
  P.quilt = MAT.makeQuilt({ color: 0xfff5ef, cells: 6, repeat: 2.4, seed: 13 });

  // Vertex-coloured variants. One material then serves every merged set and
  // every InstancedMesh in its family, which is where the draw calls are won.
  P.plastic = MAT.makePlastic({ color: 0xffffff, repeat: 2, seed: 37, matte: 0.4 });
  P.plush = MAT.makeCloth({ color: 0xffffff, weave: 'knit', threads: 96, repeat: 6, seed: 17, normalScale: 1.2 });
  P.cloth = MAT.makeCloth({ color: 0xffffff, weave: 'plain', threads: 120, repeat: 5, seed: 7 });
  P.paper = MAT.makePaint({ color: 0xffffff, repeat: 3, seed: 57, gloss: 0.06 });
  P.carpet = MAT.makeCarpet({ color: 0xffffff, repeat: 5, seed: 19, density: 170 });
  P.leaf = MAT.makePlastic({ color: 0xffffff, repeat: 2, seed: 39, matte: 0.62, clearcoat: 0.18 });
  P.leaf.side = THREE.DoubleSide;
  for (const k of ['plastic', 'plush', 'cloth', 'paper', 'carpet', 'leaf']) P[k].vertexColors = true;

  P.curtain = MAT.makeCloth({
    color: 0xf8e2e4, weave: 'plain', threads: 150, repeat: 3, seed: 23,
    sheen: 1.0, roughness: 0.96, normalScale: 0.7
  });
  P.curtain.side = THREE.DoubleSide;

  P.shade = MAT.makeCloth({ color: 0xfff2e4, threads: 150, repeat: 2, seed: 61, sheen: 0.5 });
  P.shade.side = THREE.DoubleSide;
  P.shade.emissive = new THREE.Color(0xffc98a);
  P.shade.emissiveIntensity = 0;

  P.bulb = new THREE.MeshStandardMaterial({
    color: 0x3a3128, emissive: new THREE.Color(0xffd9a0), emissiveIntensity: 0, roughness: 0.5
  });

  return P;
}

/* ---------------------------------------------------------------- crib --- */

/**
 * Cot with turned spindles, a lower drop-side facing the camera (so the baby
 * is never hidden behind bars), a quilted mattress with real piping and a
 * blanket thrown over the foot end.
 */
export function buildCrib(M) {
  const g = new THREE.Group();
  g.name = 'crib';
  const L = 1.26, W = 0.70, postH = 0.99, top = 0.90, dropTop = 0.71, low = 0.42;

  /* --- turned corner posts ------------------------------------------- */
  const postProfile = [
    [0.000, 0.00], [0.034, 0.00], [0.034, 0.05], [0.027, 0.085], [0.031, 0.13],
    [0.028, 0.60], [0.035, 0.645], [0.027, 0.69], [0.029, postH - 0.11],
    [0.037, postH - 0.07], [0.030, postH - 0.035], [0.020, postH - 0.008], [0.000, postH]
  ];
  const parts = [];
  const px = L / 2 - 0.034, pz = W / 2 - 0.034;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(xf(lathe(postProfile, 16), [sx * px, 0, sz * pz]));
    }
  }

  /* --- rails ---------------------------------------------------------- */
  const railLen = L - 0.05, railW = W - 0.05;
  // back + sides at full height, the camera-facing rail sits lower
  parts.push(rbox(railLen, 0.052, 0.05, [0, top, -pz], [0, 0, 0], 0.018, 1.6));
  parts.push(rbox(railLen, 0.052, 0.05, [0, dropTop, pz], [0, 0, 0], 0.018, 1.6));
  parts.push(rbox(0.05, 0.052, railW, [-px, top - 0.09, 0], [0, 0, 0], 0.018, 1.6));
  parts.push(rbox(0.05, 0.052, railW, [px, top - 0.09, 0], [0, 0, 0], 0.018, 1.6));
  for (const z of [-pz, pz]) parts.push(rbox(railLen, 0.042, 0.042, [0, low, z], [0, 0, 0], 0.014, 1.6));
  for (const x of [-px, px]) parts.push(rbox(0.042, 0.042, railW, [x, low, 0], [0, 0, 0], 0.014, 1.6));
  // mattress base
  parts.push(rbox(L - 0.11, 0.026, W - 0.11, [0, low + 0.03, 0], [0, 0, 0], 0.008, 1.6));

  const frame = mesh(mergeAll(parts), M.beech, 'cribFrame');
  g.add(frame);

  /* --- spindles ------------------------------------------------------- */
  const spanH = 0.44;
  const spindle = lathe([
    [0.010, 0.00], [0.013, 0.015], [0.0095, 0.045], [0.015, 0.08], [0.011, 0.115],
    [0.0102, 0.30], [0.0145, 0.345], [0.0105, 0.385], [0.0118, 0.42], [0.009, spanH]
  ], 12);
  const items = [];
  const backTop = top - 0.026, frontTop = dropTop - 0.026;
  const nLong = 13;
  for (let i = 0; i < nLong; i++) {
    const x = -(L / 2 - 0.10) + (i / (nLong - 1)) * (L - 0.20);
    items.push({ pos: [x, low + 0.02, -pz], scale: [1, (backTop - low - 0.02) / spanH, 1] });
    items.push({ pos: [x, low + 0.02, pz], scale: [1, (frontTop - low - 0.02) / spanH, 1] });
  }
  const nShort = 6;
  for (let i = 0; i < nShort; i++) {
    const z = -(W / 2 - 0.10) + (i / (nShort - 1)) * (W - 0.20);
    for (const x of [-px, px]) {
      items.push({ pos: [x, low + 0.02, z], scale: [1, (top - 0.11 - low - 0.02) / spanH, 1] });
    }
  }
  const spindles = instanced(spindle, M.beech, items, 'cribSpindles');
  g.add(spindles);

  /* --- mattress, piping, blanket -------------------------------------- */
  const mat = mesh(rbox(L - 0.13, 0.095, W - 0.13, [0, low + 0.078, 0], [0, 0, 0], 0.03, 1.4),
    M.quilt, 'cribMattress');
  g.add(mat);

  // Piping: the corded seam around a real cot mattress. Nothing says "made by
  // a person" like a 8 mm cord following the edge.
  const pipe = new THREE.TubeGeometry(
    roundedRectCurve(L - 0.128, W - 0.128, 0.05, low + 0.078, 7), 140, 0.008, 6, true);
  const pipeMesh = mesh(tint(pipe, 0xf3c9cd), M.cloth, 'cribPiping');
  g.add(pipeMesh);

  g.add(mesh(tint(drapedBlanket(0.66, 0.66, 0.19, 0.30), 0xf6d3da),
    M.plush, 'cribBlanket').translateX(0.26).translateY(low + 0.13));

  g.userData.pick = [frame, mat];
  return g;
}

/**
 * A blanket lying on a bed and folding over one edge. Built directly in XZ so
 * it can be dropped on a mattress without a rotation that would fight the UVs.
 */
export function drapedBlanket(w, l, edge, hang, cols = 18, rows = 20) {
  const g = new THREE.PlaneGeometry(w, l, cols, rows);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), t = pos.getY(i);
    let y = 0, z = t;
    if (t > edge) {
      // past the mattress edge the cloth rolls over and hangs, curling inward
      const s = Math.min(1, (t - edge) / hang);
      const a = s * Math.PI * 0.55;
      z = edge + Math.sin(a) * hang * 0.62;
      y = -(1 - Math.cos(a)) * hang * 1.35;
    }
    // soft rolling wrinkles + a heavier fold near one corner (asymmetry)
    y += Math.sin(x * 11 + t * 4) * 0.006 + Math.sin(x * 5.5 - 1.2) * 0.008;
    y += Math.exp(-((x - w * 0.28) ** 2) / 0.006) * 0.012;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/* -------------------------------------------------------------- mobile --- */

/**
 * Mobile on a swan-neck arm clamped to the cot rail. The danglers are one
 * merged vertex-coloured mesh so the whole thing spins in a single draw call.
 */
export function buildMobile(M) {
  const g = new THREE.Group();
  g.name = 'mobile';

  const armPts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    // quarter-circle sweep from the clamp up and over the cot
    armPts.push(new THREE.Vector3(
      Math.sin(t * Math.PI * 0.52) * 0.46,
      0.02 + t * 0.60 - Math.pow(t, 3) * 0.06,
      0));
  }
  const arm = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(armPts), 24, 0.012, 8, false);
  const clamp = rbox(0.07, 0.10, 0.075, [0, -0.02, 0], [0, 0, 0], 0.012, 2);
  g.add(mesh(mergeAll([arm, clamp]), M.metal, 'mobileArm'));

  /* --- the spinning half ---------------------------------------------- */
  const spin = new THREE.Group();
  spin.position.set(0.455, 0.60, 0);
  g.add(spin);

  const hub = tint(lathe([[0, 0], [0.03, -0.005], [0.032, -0.02], [0.012, -0.035], [0, -0.04]], 14), 0xf2e2d4);
  const strings = [];
  const shapes = [];
  const cols = [0xffd166, 0xf4a8c0, 0xa8d8e8, 0xfff3e0];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = 0.135;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const drop = 0.13 + (i % 2) * 0.045;     // uneven drops read as hand-tied
    strings.push(xf(new THREE.CylinderGeometry(0.0015, 0.0015, drop, 4), [x, -drop / 2 - 0.01, z]));
    const charm = i === 0 ? starGeo(0.052, 0.012)
      : i === 1 ? moonGeo(0.05, 0.012)
        : i === 2 ? cloudGeo(0.05)
          : dropGeo(0.042);
    shapes.push(tint(xf(charm, [x, -drop - 0.05, z], [0, a + 0.4, 0]), cols[i]));
  }
  // the little cross-arm the strings hang from
  for (const a of [0, Math.PI / 2]) {
    strings.push(xf(new THREE.CylinderGeometry(0.005, 0.005, 0.28, 6), [0, -0.012, 0], [Math.PI / 2, 0, a]));
  }
  spin.add(mesh(mergeAll([hub, ...strings.map(s => tint(s, 0xf2e2d4))], { colors: true }), M.plastic, 'mobileHub'));
  spin.add(mesh(mergeAll(shapes, { colors: true }), M.plastic, 'mobileCharms'));

  g.userData.spin = spin;
  g.userData.pick = [spin];
  return g;
}

/** Five-pointed star, extruded and bevelled. */
export function starGeo(r, depth) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.46 : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelSize: r * 0.13, bevelThickness: r * 0.13,
    bevelSegments: 2, steps: 1, curveSegments: 2
  });
  g.center();
  return boxUV(g, 4);
}

/** Crescent moon: outer arc minus an offset inner arc. */
export function moonGeo(r, depth) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, -1.15, 1.15, false);
  s.absarc(r * 0.62, 0, r * 0.82, 1.35, -1.35, true);
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelSize: r * 0.1, bevelThickness: r * 0.1,
    bevelSegments: 2, steps: 1, curveSegments: 8
  });
  g.center();
  return boxUV(g, 4);
}

/** Puffy cloud from three overlapping spheres — real volume, not a billboard. */
export function cloudGeo(r) {
  const parts = [
    xf(new THREE.SphereGeometry(r * 0.62, 12, 9), [-r * 0.52, -r * 0.04, 0]),
    xf(new THREE.SphereGeometry(r * 0.80, 14, 10), [0, r * 0.10, 0]),
    xf(new THREE.SphereGeometry(r * 0.56, 12, 9), [r * 0.60, -r * 0.06, 0])
  ];
  const g = mergeAll(parts);
  g.scale(1, 0.82, 0.62);
  return g;
}

/** Teardrop / raindrop charm. */
export function dropGeo(r) {
  return lathe([
    [0.0, 0], [r * 0.55, r * 0.28], [r, r * 0.95], [r * 0.86, r * 1.55],
    [r * 0.44, r * 2.0], [0, r * 2.15]
  ], 12);
}
