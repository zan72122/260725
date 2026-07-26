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
export function roundedBox(w, h, d, r = 0.012, smooth = 3) {
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
    // Fold depth has to stay under about half the fold pitch or the panel
    // reads as a row of ribbons rather than gathered cloth.
    // scale the fold depth with the gathered width: depth must stay well under
    // the fold pitch, or the panel turns into a row of vertical ribbons
    const foldDepth = amp * narrow * (0.55 + 0.45 * (1 - y0)) * (1 + gather * 0.5);
    const z = Math.sin(phase) * foldDepth
            + Math.sin(phase * 0.5 + 1.1) * foldDepth * 0.22
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
/**
 * The blob shader. `instanceColor` is a raw payload, not a colour:
 *   r = opacity, g = softness (drives the falloff exponent), b = mode.
 *     b >= 0.99            → filled blob (the default)
 *     0.5 <= b < 0.99      → ring peaking at radius (b - 0.5) * 2
 *     b <  0.5             → band: constant along u, falling off across v
 * The ring mode is what puts a dark line exactly under a rug's rim; the band
 * mode is what puts one along a skirting board. Both cost zero draw calls
 * because they ride in the same InstancedMesh as every other contact shadow.
 */
export function shadowBlobMaterial(color = 0x3d2130) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
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
        vec2 q = abs(vUv - 0.5) * 2.0;
        float d = length(q);
        float k = 1.0 + vC.g * 6.0;
        float a;
        if (vC.b > 0.99) {
          a = pow(max(0.0, 1.0 - d), k);
        } else if (vC.b > 0.5) {
          float ring = (vC.b - 0.5) * 2.0;
          float w = max(0.04, 1.0 - ring);
          a = pow(max(0.0, 1.0 - abs(d - ring) / w), k);
        } else {
          float across = pow(max(0.0, 1.0 - q.y), k);
          a = across * smoothstep(1.0, 0.82, q.x);
        }
        a *= vC.r * uGlobal;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }`
  });
}

export class ShadowField {
  constructor() { this.items = []; }

  add(x, z, rx, rz = rx, { opacity = 0.42, softness = 0.45, rot = 0, y = 0.004, mode = 1 } = {}) {
    this.items.push({ x, y, z, rx, rz, opacity, softness, rot, mode });
    return this;
  }

  /**
   * A real contact shadow is two lobes, not one: a tight almost-black core
   * where the object actually touches, and a wide haze around it. One call.
   */
  pair(x, z, rx, rz = rx, { opacity = 0.5, softness = 0.7, rot = 0, y = 0.004, core = 0.42 } = {}) {
    this.add(x, z, rx, rz, { opacity: opacity * 0.55, softness: softness * 0.55, rot, y });
    this.add(x, z, rx * core, rz * core, { opacity: Math.min(0.92, opacity * 1.5), softness: softness + 1.4, rot, y: y + 0.0006 });
    return this;
  }

  /** Soft dark line where a wall (or any long edge) meets the floor. */
  band(x, z, halfLen, halfWidth, { opacity = 0.34, softness = 0.5, rot = 0, y = 0.003 } = {}) {
    this.add(x, z, halfLen, halfWidth, { opacity, softness, rot, y, mode: 0 });
    return this;
  }

  /** Dark line under the rim of a rug or a mat. `r` is 0..1 of the plane. */
  ring(x, z, rx, rz = rx, r = 0.86, { opacity = 0.34, softness = 0.9, rot = 0, y = 0.003 } = {}) {
    this.add(x, z, rx, rz, { opacity, softness, rot, y, mode: 0.5 + r * 0.5 });
    return this;
  }

  build() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = shadowBlobMaterial();
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
      _c.setRGB(it.opacity, it.softness, it.mode === undefined ? 1 : it.mode);
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

  // Two nursery woods and one paint tone are all this room needs; every other
  // surface is the same generator with a different repeat and colour. That
  // matters twice over — a 512² procedural PBR set costs real milliseconds to
  // synthesise at boot, and re-using one keeps VRAM flat.
  const WOOD = { seed: 3, ringScale: 74, satin: 0.42 };
  const PAINT = { seed: 43, gloss: 0.3 };

  P.wall = MAT.makeWall({ base: 0xf7ece3, tint: 0xe4d3c6, repeat: 0.8, seed: 11 });
  P.floor = MAT.makeWood({
    light: 0xdfba90, dark: 0xa5723f, planks: 7, repeat: 2.4, seed: 5,
    ringScale: 108, clearcoat: 0.26, satin: 0.5
  });

  P.trim = unshare(MAT.makePaint({ color: 0xfffaf4, ...PAINT }), 1.1, { clearcoat: 0.45 });
  P.ceiling = unshare(MAT.makePaint({ color: 0xfff8f1, ...PAINT }), 0.5, { clearcoat: 0.08 });
  P.dark = unshare(MAT.makePaint({ color: 0x6d5a5c, ...PAINT }), 0.8, { clearcoat: 0.05 });
  P.paintedWhite = unshare(MAT.makePaint({ color: 0xfdf5ef, ...PAINT }), 1.5, { clearcoat: 0.55 });
  P.paintedMint = unshare(MAT.makePaint({ color: 0xd9e9df, ...PAINT }), 1.5, { clearcoat: 0.5 });
  P.snow = unshare(MAT.makePaint({ color: 0xfdfbff, ...PAINT }), 2.2, { clearcoat: 0.25, roughness: 0.85 });
  P.paper = unshare(MAT.makePaint({ color: 0xffffff, ...PAINT }), 3, { clearcoat: 0.06 });

  // Pale beech for the baby furniture, warmer oak for the big case goods, and
  // a hand-worn version for everything fingers actually touch.
  P.beech = unshare(MAT.makeWood({ light: 0xe7c79c, dark: 0xbb8d5c, ...WOOD, clearcoat: 0.4 }), 1.4);
  P.oak = unshare(MAT.makeWood({ light: 0xcb9a68, dark: 0x855628, ...WOOD, clearcoat: 0.28 }), 1.1);
  // Knobs, cot rails, the toy-box pull: rougher, darker, the lacquer gone.
  P.worn = unshare(MAT.makeWood({ light: 0xc79a6d, dark: 0x7d5528, ...WOOD, clearcoat: 0.04 }), 3.0,
    { roughness: 1.0, clearcoatRoughness: 0.8 });

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
  P.carpet = MAT.makeCarpet({ color: 0xffffff, repeat: 5, seed: 19, density: 170 });
  // Painted hardwood for the block family. Deliberately the *same* generator
  // call `fx/toys.js` makes for the tower blocks, so a block on the floor and
  // a block in the tower are visibly the same object.
  P.blockWood = unshare(MAT.makeWood({
    light: 0xffffff, dark: 0xffffff, seed: 5, ringScale: 34, clearcoat: 0.5, satin: 0.36, repeat: 1
  }), 1);
  P.blockWood.vertexColors = true;
  P.blockWood.color.set(0xffffff);
  P.blockWood.normalScale?.set(0.45, 0.45);

  P.leaf = unshare(MAT.makePlastic({ color: 0xffffff, repeat: 2, seed: 37, matte: 0.4, clearcoat: 0.18 }), 2.6);
  P.leaf.side = THREE.DoubleSide;
  for (const k of ['plastic', 'plush', 'cloth', 'paper', 'carpet', 'leaf']) P[k].vertexColors = true;

  P.curtain = unshare(MAT.makeCloth({
    color: 0xeec9d2, weave: 'plain', threads: 120, repeat: 3, seed: 7,
    sheen: 0.6, roughness: 0.96, normalScale: 0.7
  }), 3.2);
  P.curtain.side = THREE.DoubleSide;

  P.shade = unshare(MAT.makeCloth({ color: 0xfff2e4, threads: 120, repeat: 2, seed: 7, sheen: 0.5 }), 2.0);
  P.shade.side = THREE.DoubleSide;
  P.shade.emissive = new THREE.Color(0xffc98a);
  P.shade.emissiveIntensity = 0;

  P.bulb = new THREE.MeshStandardMaterial({
    color: 0x3a3128, emissive: new THREE.Color(0xffd9a0), emissiveIntensity: 0, roughness: 0.5
  });

  return P;
}

/**
 * materials.js hands back the *shared, memoised* texture objects, so two
 * materials built from the same generator would fight over `repeat`. Cloning
 * gives each material its own transform while three still uploads the pixels
 * once (the GPU upload is keyed on `texture.source`, which clones share).
 */
function unshare(mat, repeat, props) {
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
    if (mat[k]) {
      const t = mat[k].clone();
      t.needsUpdate = true;
      mat[k] = t;
      if (repeat !== undefined) t.repeat.set(repeat, repeat);
    }
  }
  if (props) Object.assign(mat, props);
  return mat;
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
  // The two long top rails are the only part of a cot anyone ever grips, so
  // they get the worn, unlacquered wood — one extra draw call for the single
  // clearest "this cot has been used" cue in the room.
  const gripped = mergeAll([
    rbox(railLen, 0.052, 0.05, [0, top, -pz], [0, 0, 0], 0.018, 1.6),
    rbox(railLen, 0.052, 0.05, [0, dropTop, pz], [0, 0, 0], 0.018, 1.6)
  ]);
  const grips = mesh(gripped, M.worn, 'cribRails');
  grips.castShadow = false;                 // the frame beneath it already does
  g.add(grips);

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

  // the blanket only folds over the near long edge — enough to see the drop
  // and the mattress side, without pushing through the rail behind it
  g.add(mesh(tint(drapedBlanket(0.60, 0.56, 0.22, 0.105), 0xf6d3da),
    M.plush, 'cribBlanket').translateX(0.24).translateY(low + 0.128));

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

/* ------------------------------------------------------------- dresser --- */

/**
 * Changing table / dresser. The middle drawer is left 3 cm proud — one of the
 * cheapest, most effective "someone lives here" signals in the room.
 */
export function buildDresser(M) {
  const g = new THREE.Group();
  g.name = 'dresser';
  const W = 1.06, D = 0.52, H = 0.86;
  const carcass = [];

  carcass.push(rbox(W - 0.10, 0.085, D - 0.08, [0, 0.043, 0], [0, 0, 0], 0.016, 1.4));
  for (const sx of [-1, 1]) {
    carcass.push(rbox(0.028, 0.70, D - 0.03, [sx * (W / 2 - 0.014), 0.44, -0.005], [0, 0, 0], 0.0126, 1.4));
  }
  carcass.push(rbox(W - 0.05, 0.70, 0.018, [0, 0.44, -D / 2 + 0.02], [0, 0, 0], 0.006, 1.4));
  // drawer dividers
  for (const y of [0.325, 0.555]) {
    carcass.push(rbox(W - 0.06, 0.016, D - 0.06, [0, y, 0], [0, 0, 0], 0.005, 1.4));
  }
  // overhanging top with a generous eased edge
  carcass.push(rbox(W + 0.045, 0.042, D + 0.03, [0, H - 0.02, 0], [0, 0, 0], 0.0198, 1.2));
  g.add(mesh(mergeAll(carcass), M.oak, 'dresserCarcass'));

  /* --- drawer fronts (the middle one not pushed home) ------------------ */
  const proud = [0, 0.032, 0];
  const fronts = [];
  const knobs = [];
  const knobGeo = lathe([
    [0, 0], [0.009, 0], [0.010, 0.013], [0.021, 0.024], [0.023, 0.034], [0.015, 0.043], [0, 0.045]
  ], 14);
  knobGeo.rotateX(Math.PI / 2);          // face the room
  const drawerY = [0.19, 0.44, 0.665];
  drawerY.forEach((y, i) => {
    const z = D / 2 - 0.006 + proud[i];
    fronts.push(rbox(W - 0.075, i === 2 ? 0.185 : 0.205, 0.022, [0, y, z], [0, 0, 0], 0.0104, 1.4));
    for (const sx of [-1, 1]) knobs.push({ pos: [sx * 0.235, y, z + 0.012] });
  });
  g.add(mesh(mergeAll(fronts), M.oak, 'dresserDrawers'));
  // Knobs get the worn material: this is where hands actually touch.
  g.add(instanced(knobGeo, M.worn, knobs, 'dresserKnobs'));

  /* --- changing mat on top -------------------------------------------- */
  const mat = new THREE.Group();
  // the mat is dropped on, not fitted: 2.4° off square and 15 mm off centre
  mat.position.set(0.006, H + 0.02, 0.014);
  mat.rotation.y = 0.042;
  const pad = rbox(0.80, 0.055, 0.46, [0, 0, 0], [0, 0, 0], 0.0262, 1.6);
  mat.add(mesh(pad, M.quilt, 'changingMat'));
  const bolster = [];
  for (const sx of [-1, 1]) {
    bolster.push(tint(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.375, 0.02, -0.20),
        new THREE.Vector3(sx * 0.395, 0.045, 0),
        new THREE.Vector3(sx * 0.375, 0.02, 0.20)
      ]), 14, 0.026, 8, false), 0xf7dfe2));
  }
  // a towel rolled and left across the corner of the mat, well off-axis
  const roll = lathe([
    [0, 0], [0.052, 0.004], [0.055, 0.02], [0.054, 0.20], [0.055, 0.216],
    [0.050, 0.228], [0, 0.232]
  ], 18);
  roll.rotateZ(Math.PI / 2);
  bolster.push(tint(xf(roll, [0.16, 0.052, -0.02], [0.06, 0.46, 0.035]), 0xfdeee6));
  // the loose end of the roll, flopped open
  bolster.push(tint(xf(roundedBox(0.13, 0.014, 0.10, 0.006, 3), [0.30, 0.034, 0.05], [0.05, 0.46, -0.10]), 0xfdeee6));
  mat.add(mesh(mergeAll(bolster, { colors: true }), M.plush, 'changingBolsters'));
  g.add(mat);

  g.userData.pick = g.children.slice();
  return g;
}

/* --------------------------------------------------------------- shelf --- */

/** Open shelf unit: books (one leaning), a teddy, stacking rings, a lamp. */
export function buildShelf(M) {
  const g = new THREE.Group();
  g.name = 'shelf';
  const W = 0.94, D = 0.25;
  const carcass = [];
  for (const sx of [-1, 1]) carcass.push(rbox(0.022, 0.66, D, [sx * W / 2, 0.30, 0], [0, 0, 0], 0.0102, 1.6));
  for (const y of [0, 0.33, 0.62]) carcass.push(rbox(W + 0.02, 0.024, D, [0, y, 0], [0, 0, 0], 0.0112, 1.6));
  carcass.push(rbox(W, 0.05, 0.014, [0, 0.14, -D / 2 + 0.007], [0, 0, 0], 0.004, 1.6));
  g.add(mesh(mergeAll(carcass), M.paintedWhite, 'shelfCarcass'));

  const books = buildBooks(M, { n: 9, y: 0.012, x0: -0.42, z: 0.01, lean: 5 });
  g.add(books.covers, books.pages);
  const books2 = buildBooks(M, { n: 5, y: 0.342, x0: 0.10, z: 0.01, lean: -1, seed: 44 });
  g.add(books2.covers, books2.pages);

  const teddy = buildTeddy(M, 0.13);
  teddy.position.set(-0.26, 0.345, 0.0);
  teddy.rotation.y = 0.5;
  g.add(teddy);

  const rings = buildStackingRings(M);
  rings.position.set(0.30, 0.012, 0.0);
  g.add(rings);

  const lamp = buildLamp(M);
  lamp.position.set(-0.30, 0.632, 0);
  g.add(lamp);

  g.userData.lamp = lamp;
  g.userData.pick = [teddy, rings, lamp, books.covers];
  return g;
}

/** A row of books: covers and page blocks are two instanced meshes. */
export function buildBooks(M, { n = 8, y = 0, x0 = 0, z = 0, lean = -1, seed = 12, h = 0.19 } = {}) {
  const R = rng(seed);
  const cols = [0xe4746a, 0xf0b45a, 0x6fa8b8, 0xd88fae, 0x8fb87a, 0xefe0c8, 0x9a86c4];
  const covers = [], pages = [];

  /* Nobody's shelf is a row of identical spines. Three height classes (board
     book, picture book, slim), a gap where one has been taken out, a small
     group leaning into that gap, one pulled forward off the shelf line and one
     laid flat across the top of the group. */
  const CLASS = [0.62, 1.0, 0.86];
  const leanA = lean >= 0 ? lean : Math.max(1, (n * 0.55) | 0);
  const leanSet = new Set([leanA, leanA + 1, 1 + ((leanA + 3) % Math.max(1, n - 2))]);
  const gapAt = Math.min(n - 1, leanA + 2);
  const proudAt = Math.max(0, leanA - 3);

  let x = x0;
  let flatSpan = null;
  for (let i = 0; i < n; i++) {
    const t = 0.017 + R() * 0.021;
    const hh = h * CLASS[(i * 5 + seed) % CLASS.length] * (0.93 + R() * 0.16);
    const d = 0.115 + R() * 0.05;
    const leaning = leanSet.has(i);
    // the further into the leaning group, the further it has slumped
    const tilt = leaning ? 0.22 + R() * 0.16 : (R() - 0.5) * 0.035;
    const proud = i === proudAt ? 0.030 + R() * 0.012 : 0;
    const px = x + t / 2 + (leaning ? hh * Math.sin(tilt) * 0.5 : 0);
    const cy = y + hh / 2 * Math.cos(tilt);
    covers.push({
      pos: [px, cy, z + proud], rot: [0, (R() - 0.5) * 0.05, -tilt],
      scale: [t, hh, d], color: cols[(i * 3 + seed) % cols.length]
    });
    pages.push({
      pos: [px, cy, z + proud + 0.004], rot: [0, (R() - 0.5) * 0.05, -tilt],
      scale: [t * 0.82, hh * 0.93, d * 0.94], color: 0xf6ecdc
    });
    if (leaning) flatSpan = { x: px, y: y + hh * Math.cos(tilt), d, h: hh };
    x += t + 0.0018 + (leaning ? hh * Math.sin(tilt) * 0.9 : 0);
    if (i === gapAt) x += 0.026 + R() * 0.014;          // the missing book
  }

  // one laid flat across the top of the leaning group — the one being read
  if (flatSpan && n > 4) {
    const ft = 0.020, fh = h * 0.66, fd = 0.13;
    covers.push({
      pos: [flatSpan.x + fh * 0.18, flatSpan.y + ft * 0.62, z + 0.012],
      rot: [0, 0.09, Math.PI / 2 + 0.03],
      scale: [ft, fh, fd], color: cols[(seed + 2) % cols.length]
    });
    pages.push({
      pos: [flatSpan.x + fh * 0.18, flatSpan.y + ft * 0.62, z + 0.016],
      rot: [0, 0.09, Math.PI / 2 + 0.03],
      scale: [ft * 0.8, fh * 0.94, fd * 0.94], color: 0xf6ecdc
    });
  }

  const unit = roundedBox(1, 1, 1, 0.055, 2);
  boxUV(unit, 1);
  const unitPages = roundedBox(1, 1, 1, 0.02, 2);
  boxUV(unitPages, 1);
  return {
    covers: instanced(unit, M.paper, covers, 'books'),
    pages: instanced(unitPages, M.paper, pages, 'bookPages'),
    width: x - x0
  };
}

/** Stacking-ring toy: peg on a rocker base, five graded tori, one off-axis. */
export function buildStackingRings(M) {
  const g = new THREE.Group();
  const base = tint(lathe([
    [0, 0], [0.075, 0], [0.078, 0.012], [0.070, 0.022], [0.020, 0.028], [0.012, 0.03], [0, 0.032]
  ], 18), 0xf3e3d2);
  const peg = tint(xf(new THREE.CylinderGeometry(0.010, 0.013, 0.135, 10), [0, 0.098, 0]), 0xf3e3d2);
  g.add(mesh(mergeAll([base, peg], { colors: true }), M.plastic, 'ringBase'));

  const cols = [0xef8a7a, 0xf5c26b, 0x86c6b6, 0x8ab4de, 0xc59ad4];
  const items = [];
  let y = 0.034;
  cols.forEach((c, i) => {
    const rr = 0.062 - i * 0.008;
    const tube = 0.017 - i * 0.0015;
    items.push({
      pos: [0, y + tube, 0],
      // the top ring sits crooked, as they always do
      rot: i === 4 ? [0.22, 0.4, 0.1] : [0, i * 0.7, 0],
      scale: [rr / 0.06, 1, rr / 0.06], color: c
    });
    y += tube * 2 - 0.002;
  });
  const torus = new THREE.TorusGeometry(0.06, 0.016, 8, 20);
  torus.rotateX(Math.PI / 2);
  g.add(instanced(torus, M.plastic, items, 'rings'));
  return g;
}

/* --------------------------------------------------------------- teddy --- */

/** Knitted bear. One merged vertex-coloured mesh — eyes, nose and all. */
export function buildTeddy(M, s = 0.13) {
  const g = new THREE.Group();
  g.name = 'teddy';
  const FUR = 0xc9a077;
  const PALE = 0xe8d2b4;
  const DARK = 0x3a2a24;
  const parts = [];
  const ball = (r, x, y, z, sx, sy, sz, col) =>
    parts.push(tint(xf(new THREE.SphereGeometry(r * s, 14, 11), [x * s, y * s, z * s], [0, 0, 0], [sx, sy, sz]), col));

  ball(0.62, 0, 0.62, 0, 1.0, 0.92, 0.88, FUR);      // body
  ball(0.50, 0, 1.42, 0.02, 1.0, 0.95, 0.95, FUR);   // head
  ball(0.26, -0.42, 1.78, -0.02, 1, 1, 0.6, FUR);    // ears
  ball(0.26, 0.42, 1.78, -0.02, 1, 1, 0.6, FUR);
  ball(0.16, -0.42, 1.78, 0.06, 1, 1, 0.45, PALE);
  ball(0.16, 0.42, 1.78, 0.06, 1, 1, 0.45, PALE);
  ball(0.27, 0, 1.30, 0.40, 1.05, 0.85, 0.8, PALE);  // muzzle
  ball(0.09, 0, 1.36, 0.60, 1.2, 0.8, 0.8, DARK);    // nose
  ball(0.07, -0.20, 1.52, 0.42, 1, 1, 0.6, DARK);    // eyes
  ball(0.07, 0.20, 1.52, 0.42, 1, 1, 0.6, DARK);
  ball(0.24, -0.62, 0.82, 0.10, 1.35, 0.8, 0.9, FUR); // arms
  ball(0.24, 0.62, 0.82, 0.10, 1.35, 0.8, 0.9, FUR);
  ball(0.28, -0.34, 0.16, 0.18, 1.0, 0.75, 1.25, FUR); // legs
  ball(0.28, 0.34, 0.16, 0.18, 1.0, 0.75, 1.25, FUR);
  ball(0.30, 0, 0.60, 0.34, 1.0, 0.85, 0.55, PALE);  // tummy patch

  g.add(mesh(mergeAll(parts, { colors: true }), M.plush, 'teddyBody'));
  return g;
}

/* ---------------------------------------------------------------- lamp --- */

/**
 * Small table lamp. `userData.setOn` lights the shade from the inside by
 * pushing emissive into the fabric — a lamp that only changes a point light
 * looks broken because the shade itself stays dead.
 */
export function buildLamp(M, { shadeColor = 0xfff2e4, height = 0.30 } = {}) {
  const g = new THREE.Group();
  g.name = 'lamp';

  const base = lathe([
    [0, 0], [0.062, 0], [0.066, 0.012], [0.058, 0.035], [0.030, 0.075],
    [0.020, 0.11], [0.018, 0.13], [0, 0.132]
  ], 20);
  g.add(mesh(base, M.ceramic, 'lampBase'));

  const stem = xf(new THREE.CylinderGeometry(0.008, 0.008, 0.10, 8), [0, 0.175, 0]);
  g.add(mesh(stem, M.metal, 'lampStem'));

  // open-ended cone: you can see the inside of the shade, which is where the
  // emissive glow actually reads
  const shade = new THREE.CylinderGeometry(0.072, 0.105, 0.125, 24, 1, true);
  shade.translate(0, height - 0.06, 0);
  const shadeMesh = mesh(shade, M.shade, 'lampShade');
  shadeMesh.castShadow = false;
  g.add(shadeMesh);

  const bulb = new THREE.SphereGeometry(0.028, 12, 10);
  bulb.translate(0, height - 0.075, 0);
  const bulbMesh = new THREE.Mesh(bulb, M.bulb);
  g.add(bulbMesh);

  g.userData.setOn = (on) => {
    M.shade.emissiveIntensity = on ? 0.85 : 0.0;
    M.bulb.emissiveIntensity = on ? 3.2 : 0.0;
  };
  g.userData.top = height;
  return g;
}

/* ------------------------------------------------------------- toy box --- */

/** Toy box with a hinged lid left ajar and rope handles. */
export function buildToyBox(M) {
  const g = new THREE.Group();
  g.name = 'toybox';
  const W = 0.74, D = 0.46, H = 0.42;
  const body = [];
  body.push(rbox(W, 0.022, D, [0, 0.028, 0], [0, 0, 0], 0.006, 1.6));
  for (const sz of [-1, 1]) body.push(rbox(W, H - 0.02, 0.020, [0, H / 2 + 0.02, sz * (D / 2 - 0.01)], [0, 0, 0], 0.008, 1.6));
  for (const sx of [-1, 1]) body.push(rbox(0.020, H - 0.02, D - 0.04, [sx * (W / 2 - 0.01), H / 2 + 0.02, 0], [0, 0, 0], 0.008, 1.6));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.push(rbox(0.05, 0.045, 0.05, [sx * (W / 2 - 0.03), 0.022, sz * (D / 2 - 0.03)], [0, 0, 0], 0.012, 1.6));
    }
  }
  g.add(mesh(mergeAll(body), M.paintedMint, 'toyboxBody'));

  // lid pivots at the back edge; left open a crack
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, H + 0.03, -D / 2 + 0.01);
  lidPivot.rotation.x = -0.16;
  const lid = rbox(W + 0.03, 0.028, D + 0.02, [0, 0, D / 2 - 0.01], [0, 0, 0], 0.01, 1.6);
  const lidMesh = mesh(lid, M.paintedMint, 'toyboxLid');
  lidPivot.add(lidMesh);
  // finger pull, worn back to bare wood
  const pull = new THREE.TorusGeometry(0.045, 0.008, 8, 18, Math.PI);
  pull.rotateX(Math.PI / 2);
  pull.rotateZ(Math.PI);
  g.add(mesh(xf(pull, [0, H + 0.055, D / 2 + 0.012], [0.16, 0, 0]), M.worn, 'toyboxPull'));
  g.add(lidPivot);

  g.userData.lid = lidPivot;
  g.userData.pick = [lidMesh];
  return g;
}

/* ------------------------------------------------------------ wardrobe --- */

/** Wardrobe with a cornice, panelled doors (one ajar) and clothes inside. */
export function buildWardrobe(M) {
  const g = new THREE.Group();
  g.name = 'wardrobe';
  const W = 1.02, D = 0.58, H = 1.94;
  const carcass = [];
  carcass.push(rbox(W - 0.06, 0.10, D - 0.06, [0, 0.05, 0], [0, 0, 0], 0.012, 1.2));
  for (const sx of [-1, 1]) carcass.push(rbox(0.03, H - 0.16, D - 0.02, [sx * (W / 2 - 0.015), H / 2 + 0.04, -0.005], [0, 0, 0], 0.008, 1.2));
  carcass.push(rbox(W - 0.05, H - 0.16, 0.018, [0, H / 2 + 0.04, -D / 2 + 0.02], [0, 0, 0], 0.006, 1.2));
  carcass.push(rbox(W - 0.05, 0.026, D - 0.04, [0, H - 0.10, 0], [0, 0, 0], 0.006, 1.2));
  carcass.push(rbox(W - 0.05, 0.026, D - 0.04, [0, 0.115, 0], [0, 0, 0], 0.006, 1.2));
  // cornice: a real moulding profile wrapped round the front and both returns
  // The profile is authored as (x = projection from the face, y = height) and
  // extruded along +Z, so each run just needs the right yaw to face outwards.
  const crown = [[0, 0], [0.045, 0.008], [0.045, 0.026], [0.028, 0.046], [0.024, 0.062], [0, 0.070]];
  const crownY = H - 0.075;
  const frontRun = extrudeProfile(crown, W + 0.09);
  frontRun.rotateY(-Math.PI / 2);                   // now runs along -X, faces +Z
  carcass.push(xf(frontRun, [(W + 0.09) / 2, crownY, D / 2]));
  const rightRun = extrudeProfile(crown, D + 0.05); // runs along +Z, faces +X
  carcass.push(xf(rightRun, [W / 2, crownY, -D / 2 - 0.005]));
  const leftRun = extrudeProfile(crown, D + 0.05);
  leftRun.rotateY(Math.PI);                          // runs along -Z, faces -X
  carcass.push(xf(leftRun, [-W / 2, crownY, D / 2 + 0.045]));
  g.add(mesh(mergeAll(carcass), M.oak, 'wardrobeCarcass'));

  /* --- doors ----------------------------------------------------------- */
  const doorW = (W - 0.075) / 2, doorH = H - 0.28;
  const doors = new THREE.Group();
  for (const sx of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(sx * (W / 2 - 0.02), 0.145 + doorH / 2, D / 2 - 0.012);
    // the left door never quite shuts — the room has been lived in
    hinge.rotation.y = sx < 0 ? 0.12 : 0;
    // the leaf hangs from its hinge *towards the middle* of the carcass
    const cx = -sx * doorW / 2;
    const panelParts = [rbox(doorW, doorH, 0.024, [cx, 0, 0], [0, 0, 0], 0.008, 1.2)];
    for (const py of [doorH * 0.24, -doorH * 0.24]) {
      panelParts.push(rbox(doorW - 0.13, doorH * 0.40, 0.008, [cx, py, 0.014], [0, 0, 0], 0.01, 1.4));
    }
    const leaf = mesh(mergeAll(panelParts), M.oak, 'wardrobeDoor');
    hinge.add(leaf);
    // slim brass bar handle
    const hx = -sx * (doorW - 0.06);       // handle sits at the free edge
    const handle = mergeAll([
      xf(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 8), [hx, 0.03, 0.038]),
      xf(new THREE.CylinderGeometry(0.005, 0.005, 0.028, 6), [hx, 0.10, 0.024], [Math.PI / 2, 0, 0]),
      xf(new THREE.CylinderGeometry(0.005, 0.005, 0.028, 6), [hx, -0.04, 0.024], [Math.PI / 2, 0, 0])
    ]);
    hinge.add(mesh(handle, M.brass, 'wardrobeHandle'));
    doors.add(hinge);
  }
  g.add(doors);

  /* --- clothes glimpsed through the gap -------------------------------- */
  const inside = [];
  inside.push(tint(xf(new THREE.CylinderGeometry(0.01, 0.01, W - 0.12, 8), [0, H - 0.30, -0.02], [0, 0, Math.PI / 2]), 0xcfc8bf));
  const shirtCols = [0xf2c6d0, 0xcfe0ef, 0xf6e6c8, 0xd9e9df, 0xe8d6ef];
  for (let i = 0; i < 5; i++) {
    const x = -0.30 + i * 0.075;
    inside.push(tint(xf(roundedBox(0.055, 0.44, 0.16, 0.02, 1), [x, H - 0.55, -0.06], [0, (i % 2 ? 0.1 : -0.08), 0]), shirtCols[i]));
  }
  g.add(mesh(mergeAll(inside, { colors: true }), M.cloth, 'wardrobeClothes'));

  g.userData.doors = doors;
  g.userData.pick = [doors.children[0].children[0], doors.children[1].children[0]];
  return g;
}

/* ----------------------------------------------------------------- rug --- */

/**
 * Round tufted rug. Built as a radial grid so the pile can dish very slightly
 * in the middle and — the good bit — one edge can lift off the floor where
 * someone has caught it with a foot.
 */
export function buildRug(M, { radius = 1.16, rings = 24, segs = 84 } = {}) {
  const pos = [], col = [], uv = [], idx = [];
  const base = new THREE.Color(0xe9b9c4);
  const band = new THREE.Color(0xfbf1e4);
  const edge = new THREE.Color(0xcf8d9f);
  const bind = new THREE.Color(0xb87286);          // the woven binding tape
  const under = new THREE.Color(0x7d4a58);         // hessian backing, in shade
  const c = new THREE.Color();

  const liftAngle = 2.35;
  const PILE = 0.0165;

  // The pattern is *not* concentric with the outline. A hand-tufted rug is
  // drawn on a stretched backing, so the medallion sits proud of centre and
  // the outline itself wanders by a couple of centimetres.
  const OX = 0.085, OZ = -0.062;
  const outline = (a) => radius * (1 + 0.020 * Math.sin(a * 3 + 0.7)
                                     + 0.012 * Math.sin(a * 5 - 2.1)
                                     - 0.008 * Math.cos(a * 2 + 1.4));

  /* Traffic: the line people actually walk, from the door corner to the cot
     side, is trodden flat. Everything under the play table keeps its pile. */
  const traffic = (x, z) => {
    const t = (x * 0.82 + z * -0.57);                  // distance along the path
    const perp = (x * 0.57 + z * 0.82) - 0.16;         // distance across it
    return Math.exp(-(perp * perp) / 0.085) * (0.55 + 0.45 * Math.cos(Math.min(1, Math.abs(t) / 1.4) * Math.PI));
  };

  const put = (x, z, y, u, v, colr) => {
    pos.push(x, y, z);
    uv.push(u, v);
    col.push(colr.r, colr.g, colr.b);
  };

  /* --- the pile surface ----------------------------------------------- */
  for (let i = 0; i <= rings; i++) {
    const rr = i / rings;
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const R = outline(a);
      const r = rr * R;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;

      let d = a - liftAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;

      // pile thickness, dished centre, trodden path, tuft breakup, and the
      // one corner someone has caught with a foot
      let y = PILE - rr * rr * 0.004;
      y -= traffic(x, z) * 0.0072;
      y += Math.pow(Math.max(0, (rr - 0.80) / 0.20), 2) * 0.055 * Math.exp(-(d * d) / 0.20);
      y += Math.sin(a * 3 + rr * 6) * 0.0016 + Math.sin(a * 11 - rr * 17) * 0.0008;
      // a soft ruck: the rug has been shoved and never quite pulled straight
      y += Math.exp(-((rr - 0.55) ** 2) / 0.012) * Math.exp(-((a - 4.1) ** 2) / 0.35) * 0.010;

      // pattern distance is measured from the *offset* centre
      const pd = Math.hypot(x - OX, z - OZ) / radius;
      const wob = Math.sin(a * 5 + 1.1) * 0.018 + Math.sin(a * 9) * 0.008;
      if (rr > 0.955) c.copy(edge).lerp(bind, 0.35);
      else if (pd > 0.90 + wob) c.copy(edge);
      else if (pd > 0.60 + wob && pd < 0.725 + wob) c.copy(band);
      else if (pd < 0.235 + wob * 0.35) c.copy(band);
      else c.copy(base);
      // wear: the trodden line and the outer third are faded and greyed
      const worn = Math.min(1, traffic(x, z) * 0.9 + Math.max(0, rr - 0.72) * 1.1);
      c.lerp(new THREE.Color(0xe8dcd4), worn * 0.28);
      c.multiplyScalar(1 - worn * 0.05);

      put(x, z, y, Math.cos(a) * rr * 0.5 + 0.5, Math.sin(a) * rr * 0.5 + 0.5, c);
    }
  }

  /* --- bound edge: a rolled hem with real thickness -------------------- */
  const rimRows = [
    { rs: 1.012, ys: 0.86, tint: bind, shade: 1.0 },     // the tape rolls out
    { rs: 1.016, ys: 0.42, tint: bind, shade: 0.82 },    // and turns down
    { rs: 1.004, ys: 0.10, tint: under, shade: 0.7 },
    { rs: 0.972, ys: 0.005, tint: under, shade: 0.5 }    // tucked under, on the floor
  ];
  for (const row of rimRows) {
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const R = outline(a);
      const r = R * row.rs;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      let d = a - liftAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const lift = 0.055 * Math.exp(-(d * d) / 0.20);
      const y = (PILE - 0.004) * row.ys + lift * (0.6 + 0.4 * row.ys)
              + Math.sin(a * 7 + 0.4) * 0.0009;
      c.copy(row.tint).multiplyScalar(row.shade);
      put(x, z, y, Math.cos(a) * 0.52 + 0.5, Math.sin(a) * 0.52 + 0.5, c);
    }
  }

  const row = segs + 1;
  const totalRows = rings + 1 + rimRows.length;
  for (let i = 0; i < totalRows - 1; i++) {
    for (let j = 0; j < segs; j++) {
      // counter-clockwise seen from +Y, or the whole rug back-face culls away
      const a = i * row + j, b = a + 1, cIdx = a + row, dIdx = cIdx + 1;
      idx.push(a, b, cIdx, b, dIdx, cIdx);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = mesh(g, M.carpet, 'rug');
  m.castShadow = false;         // a 16 mm rug casting a shadow map just aliases
  m.userData.radius = radius;
  return m;
}

/* -------------------------------------------------------------- pouffe --- */

/** Floor cushion with real seams and a tufted button. */
export function buildPouffe(M) {
  const g = new THREE.Group();
  g.name = 'pouffe';
  const prof = [
    [0.00, 0.00], [0.22, 0.005], [0.275, 0.045], [0.298, 0.13],
    [0.285, 0.22], [0.225, 0.285], [0.115, 0.318], [0.00, 0.325]
  ];
  const body = tint(lathe(prof, 28), 0xe7d3c0);
  g.add(mesh(body, M.cloth, 'pouffeBody'));

  // six panel seams, sampled from the same profile so they hug the surface
  const seams = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    const pts = prof.slice(1).map(p => new THREE.Vector3(
      Math.cos(a) * p[0] * 1.005, p[1] + 0.001, Math.sin(a) * p[0] * 1.005));
    seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0045, 5, false));
  }
  seams.push(lathe([[0, 0.318], [0.032, 0.322], [0.030, 0.334], [0.012, 0.340], [0, 0.338]], 14));
  g.add(mesh(tint(mergeAll(seams), 0xcbb09b), M.cloth, 'pouffeSeams'));
  return g;
}

/* --------------------------------------------------------------- plant --- */

/** Potted plant: turned pot, soil, and instanced leaves on real stems. */
export function buildPlant(M, { seed = 4, leaves = 11, scale = 1 } = {}) {
  const g = new THREE.Group();
  g.name = 'plant';
  const pot = lathe([
    [0, 0], [0.14, 0], [0.145, 0.02], [0.152, 0.10], [0.168, 0.22],
    [0.175, 0.245], [0.168, 0.25], [0.158, 0.245], [0.150, 0.14], [0.140, 0.03], [0, 0.028]
  ], 24);
  g.add(mesh(pot, M.ceramic, 'plantPot'));

  const soil = lathe([[0, 0.235], [0.10, 0.238], [0.148, 0.228], [0.152, 0.222], [0, 0.222]], 20);
  g.add(mesh(tint(soil, 0x4a3a2e), M.cloth, 'plantSoil'));

  const R = rng(seed);
  const items = [];
  const greens = [0x6fae5f, 0x86bd6c, 0x5c9a52, 0x9ccb7c];
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + R() * 0.5;
    const lean = 0.28 + R() * 0.55;
    const s = (0.8 + R() * 0.55) * scale;
    items.push({
      pos: [Math.cos(a) * 0.05, 0.235, Math.sin(a) * 0.05],
      rot: [Math.cos(a + Math.PI / 2) * lean, -a, Math.sin(a + Math.PI / 2) * lean],
      scale: s,
      color: greens[i % greens.length]
    });
  }
  g.add(instanced(leafGeo(), M.leaf, items, 'plantLeaves'));
  return g;
}

/** One leaf: a tapered, curled blade on a stem. Grown along +Y. */
export function leafGeo(len = 0.34, wide = 0.075) {
  const cols = 6, rows = 12;
  const g = new THREE.PlaneGeometry(1, 1, cols, rows);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5;          // 0..1 across
    const t = pos.getY(i) + 0.5;          // 0..1 along
    const stem = t < 0.28;
    // width profile: thin stalk, fat belly, drawn-out tip
    const w = stem ? 0.012 : Math.sin(Math.min(1, (t - 0.28) / 0.72) * Math.PI) ** 0.7 * wide;
    const x = (u - 0.5) * 2 * w;
    const y = t * len;
    // curl along the length + a V-fold across the midrib
    const z = -Math.pow(t, 2.2) * len * 0.42 + Math.abs(u - 0.5) * 2 * w * 0.55;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------ laundry basket --- */

/**
 * Woven basket. The lattice is the point: 24 leaning staves crossed by four
 * hoops reads as a real woven object and costs two draw calls.
 */
export function buildBasket(M) {
  const g = new THREE.Group();
  g.name = 'basket';
  const rBot = 0.20, rTop = 0.255, H = 0.40;
  const staves = [];
  const n = 30;
  const R = rng(29);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lean = Math.atan2(rTop - rBot, H);
    staves.push({
      // hand-woven: each stave sits a hair proud or shy of its neighbours
      pos: [Math.cos(a) * (rBot + rTop) / 2, H / 2 + (R() - 0.5) * 0.004, Math.sin(a) * (rBot + rTop) / 2],
      rot: [Math.sin(a) * lean, -a + (R() - 0.5) * 0.035, -Math.cos(a) * lean],
      color: i % 2 ? 0xd9bd93 : 0xcdae83
    });
  }
  // Thicker section: a 10 mm rod reads as an aliased wire at this distance,
  // and carries no specular at all. 21 × 14 mm catches a real highlight.
  const stave = roundedBox(0.021, H + 0.02, 0.0145, 0.0062, 3);
  boxUV(stave, 3);
  g.add(instanced(stave, M.plastic, staves, 'basketStaves'));

  const hoops = [];
  for (const [y, rr, tr] of [
    [0.03, rBot + 0.005, 0.0135], [0.15, 0.222, 0.0128],
    [0.28, 0.242, 0.0132], [H - 0.012, rTop - 0.002, 0.0138]
  ]) {
    const t = new THREE.TorusGeometry(rr, tr, 9, 56);
    t.rotateX(Math.PI / 2);
    hoops.push(tint(xf(t, [0, y, 0]), 0xe3cba4));
  }
  // The rim is a rolled lip, not a cut edge: a fat torus sitting on top of a
  // short collar, so the silhouette curves over instead of stopping dead.
  const lip = new THREE.TorusGeometry(rTop, 0.0185, 12, 72);
  lip.rotateX(Math.PI / 2);
  hoops.push(tint(xf(lip, [0, H + 0.004, 0]), 0xe9d3ae));
  hoops.push(tint(lathe([
    [rTop - 0.006, H - 0.03], [rTop + 0.001, H - 0.012], [rTop + 0.002, H + 0.004]
  ], 56), 0xdcc39c));
  hoops.push(tint(lathe([[0, 0], [rBot, 0], [rBot, 0.012], [0, 0.012]], 32), 0xd9bd93));
  g.add(mesh(mergeAll(hoops, { colors: true }), M.plastic, 'basketHoops'));

  /* --- contents: a wash that never got put away ------------------------ */
  const soft = [];
  // liner folded over the rim
  soft.push(tint(lathe([
    [rTop - 0.02, H - 0.02], [rTop + 0.020, H + 0.012], [rTop + 0.004, H - 0.055],
    [rTop - 0.06, H - 0.10], [rTop - 0.10, H - 0.14]
  ], 30), 0xf3e4e6));
  // the pile of laundry itself — squashed lumps filling the top of the basket
  const lump = (x, y, z, sx, sy, sz, ry, col) =>
    soft.push(tint(xf(new THREE.SphereGeometry(0.10, 12, 9), [x, y, z], [0, ry, 0], [sx, sy, sz]), col));
  lump(0.00, H - 0.09, 0.00, 1.85, 0.62, 1.70, 0.0, 0xf6eef0);
  lump(-0.07, H - 0.035, 0.05, 1.30, 0.60, 1.15, 0.7, 0xdfe9f2);
  lump(0.09, H - 0.028, -0.04, 1.15, 0.55, 1.05, -0.4, 0xf7dfe4);
  lump(0.02, H + 0.012, 0.07, 0.86, 0.48, 0.78, 0.3, 0xfaf3e6);
  // a towel spilling over the near rim, and two socks on the way out
  const spill = new THREE.PlaneGeometry(0.20, 0.34, 8, 16);
  {
    const p = spill.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), t = (p.getY(i) + 0.17) / 0.34;    // 0 at the loose end
      const drop = Math.max(0, 0.62 - t) / 0.62;
      p.setXYZ(i,
        u * (1 - drop * 0.18) + Math.sin(t * 9) * 0.006,
        H + 0.02 - drop * drop * 0.30,
        rTop - 0.02 + drop * 0.075 + Math.cos(u * 16) * 0.006);
    }
    spill.computeVertexNormals();
  }
  // cloth needs two sides, and M.cloth is front-facing: give the towel a
  // reversed underside 4 mm behind, which also reads as real thickness
  const spillBack = spill.clone();
  spillBack.translate(0, -0.005, 0.005);
  {
    const ix = spillBack.getIndex().array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
    spillBack.getIndex().needsUpdate = true;
    spillBack.computeVertexNormals();
  }
  soft.push(tint(xf(spill, [0.10, 0, 0.02], [0, -0.55, 0]), 0xe9dff0));
  soft.push(tint(xf(spillBack, [0.10, 0, 0.02], [0, -0.55, 0]), 0xd6c8de));
  soft.push(tint(xf(roundedBox(0.055, 0.13, 0.032, 0.015, 3), [rTop * 0.72, H + 0.02, rTop * 0.5], [0.5, 0.6, 0.25]), 0xd8e6ef));
  soft.push(tint(xf(roundedBox(0.05, 0.115, 0.030, 0.014, 3), [-rTop * 0.40, H + 0.055, rTop * 0.62], [1.15, -0.4, 0.5]), 0xf6d7c9));
  const liner = mesh(mergeAll(soft, { colors: true }), M.cloth, 'basketLiner');
  liner.castShadow = false;
  g.add(liner);
  return g;
}

/* ------------------------------------------------------------ pictures --- */

/**
 * Four little paintings drawn once into a 2×2 atlas, so any number of framed
 * pictures costs exactly one extra draw call. The mount board is drawn into
 * the canvas rather than modelled — it is a flat piece of card, and nobody
 * ever sees its thickness.
 */
export function nurseryArt() {
  return TEX.painted('nurseryArt', 1024, (g, S) => {
    const H = S / 2;
    const panel = (ox, oy, bg, draw) => {
      g.save();
      g.translate(ox, oy);
      g.fillStyle = '#f6efe4';
      g.fillRect(0, 0, H, H);
      g.fillStyle = bg;
      g.fillRect(H * 0.10, H * 0.10, H * 0.80, H * 0.80);
      g.save();
      g.beginPath();
      g.rect(H * 0.10, H * 0.10, H * 0.80, H * 0.80);
      g.clip();
      draw(g, H);
      g.restore();
      // print texture: a faint paper tooth over the whole panel
      g.globalAlpha = 0.05;
      for (let i = 0; i < 900; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#8a7a70';
        g.fillRect(Math.random() * H, Math.random() * H, 2, 2);
      }
      g.globalAlpha = 1;
      g.restore();
    };
    const circle = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };

    // 1. hot-air balloon
    panel(0, 0, '#dcecf4', (g, H) => {
      const cx = H * 0.5, cy = H * 0.42, r = H * 0.20;
      const stripes = ['#e8836f', '#f3c06a', '#8fc4b0', '#e8836f'];
      for (let i = 0; i < 4; i++) {
        g.fillStyle = stripes[i];
        g.beginPath();
        g.moveTo(cx, cy - r);
        g.bezierCurveTo(cx + r * (i - 1.5) * 0.75, cy - r * 0.6, cx + r * (i - 1.5) * 0.75, cy + r * 0.6, cx, cy + r * 1.05);
        g.bezierCurveTo(cx + r * (i - 0.5) * 0.75, cy + r * 0.6, cx + r * (i - 0.5) * 0.75, cy - r * 0.6, cx, cy - r);
        g.fill();
      }
      g.strokeStyle = '#a8825f'; g.lineWidth = H * 0.008;
      g.beginPath(); g.moveTo(cx - r * 0.3, cy + r); g.lineTo(cx - r * 0.18, cy + r * 1.45);
      g.moveTo(cx + r * 0.3, cy + r); g.lineTo(cx + r * 0.18, cy + r * 1.45); g.stroke();
      g.fillStyle = '#b98a55';
      g.fillRect(cx - r * 0.22, cy + r * 1.42, r * 0.44, r * 0.3);
      circle(H * 0.76, H * 0.28, H * 0.035, '#ffffffcc');
      circle(H * 0.72, H * 0.30, H * 0.028, '#ffffffcc');
    });

    // 2. moon and stars
    panel(H, 0, '#3f4a76', (g, H) => {
      circle(H * 0.58, H * 0.42, H * 0.19, '#f7e6b8');
      circle(H * 0.48, H * 0.36, H * 0.17, '#3f4a76');
      for (let i = 0; i < 26; i++) {
        const x = H * (0.14 + Math.random() * 0.72), y = H * (0.14 + Math.random() * 0.72);
        circle(x, y, H * (0.004 + Math.random() * 0.008), '#fff6dd');
      }
    });

    // 3. rainbow over hills
    panel(0, H, '#f7f0e2', (g, H) => {
      const cols = ['#e8836f', '#f3b25f', '#f0dd83', '#8fc4b0', '#8fb0d8', '#b79ad0'];
      g.lineWidth = H * 0.045;
      cols.forEach((c, i) => {
        g.strokeStyle = c;
        g.beginPath();
        g.arc(H * 0.5, H * 0.74, H * (0.42 - i * 0.048), Math.PI, 0);
        g.stroke();
      });
      g.fillStyle = '#9dc48a';
      g.beginPath(); g.moveTo(0, H); g.quadraticCurveTo(H * 0.5, H * 0.62, H, H); g.fill();
    });

    // 4. whale
    panel(H, H, '#cfe4ee', (g, H) => {
      g.fillStyle = '#6e9bc0';
      g.beginPath();
      g.moveTo(H * 0.22, H * 0.55);
      g.bezierCurveTo(H * 0.30, H * 0.32, H * 0.68, H * 0.32, H * 0.74, H * 0.55);
      g.bezierCurveTo(H * 0.68, H * 0.72, H * 0.34, H * 0.74, H * 0.22, H * 0.55);
      g.fill();
      g.beginPath();
      g.moveTo(H * 0.74, H * 0.55); g.lineTo(H * 0.88, H * 0.40);
      g.lineTo(H * 0.86, H * 0.62); g.fill();
      circle(H * 0.34, H * 0.50, H * 0.018, '#2c3f52');
      g.strokeStyle = '#ffffff'; g.lineWidth = H * 0.014;
      g.beginPath(); g.arc(H * 0.46, H * 0.30, H * 0.10, Math.PI * 0.9, Math.PI * 1.9); g.stroke();
      g.fillStyle = '#b6d6e4';
      g.beginPath(); g.moveTo(0, H * 0.82); g.quadraticCurveTo(H * 0.5, H * 0.72, H, H * 0.86); g.lineTo(H, H); g.lineTo(0, H); g.fill();
    });
  });
}

/** Framed pictures for one wall. `list` = [{x,y,w,h,art,tilt}] in wall space. */
export function buildPictures(M, list) {
  const g = new THREE.Group();
  g.name = 'pictures';
  const frames = [];
  const arts = [];
  const tex = nurseryArt();
  for (const p of list) {
    const t = p.tilt || 0;
    const cos = Math.cos(t), sin = Math.sin(t);
    const push = (geo) => frames.push(xf(geo, [p.x, p.y, 0], [0, 0, t]));
    const w = p.w, h = p.h, b = 0.028;
    push(rbox(w + b * 2, b, 0.032, [0, h / 2 + b / 2, 0], [0, 0, 0], 0.006, 2));
    push(rbox(w + b * 2, b, 0.032, [0, -h / 2 - b / 2, 0], [0, 0, 0], 0.006, 2));
    push(rbox(b, h, 0.032, [-w / 2 - b / 2, 0, 0], [0, 0, 0], 0.006, 2));
    push(rbox(b, h, 0.032, [w / 2 + b / 2, 0, 0], [0, 0, 0], 0.006, 2));
    push(rbox(w + b, h + b, 0.010, [0, 0, -0.012], [0, 0, 0], 0.004, 2));

    const plane = new THREE.PlaneGeometry(w, h);
    const uv = plane.attributes.uv;
    const ox = (p.art % 2) * 0.5, oy = p.art < 2 ? 0.5 : 0;   // canvas y is flipped
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ox + uv.getX(i) * 0.5, oy + uv.getY(i) * 0.5);
    arts.push(xf(plane, [p.x + sin * 0, p.y, 0.006], [0, 0, t]));
  }
  g.add(mesh(mergeAll(frames), M.beech, 'pictureFrames'));
  const artMat = new THREE.MeshPhysicalMaterial({
    map: tex, roughness: 0.72, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.35
  });
  const artMesh = mesh(mergeAll(arts), artMat, 'pictureArt');
  artMesh.castShadow = false;
  g.add(artMesh);

  /* --- glazing -------------------------------------------------------------
   * A framed picture without glass is the tell that it was modelled and not
   * observed. One additive pane per group carries a soft angled reflection of
   * the window across every frame on the wall — one draw call for the lot. */
  const panes = [];
  for (const p of list) {
    const t = p.tilt || 0;
    const pane = new THREE.PlaneGeometry(p.w * 0.995, p.h * 0.995);
    panes.push(xf(pane, [p.x, p.y, 0.0092], [0, 0, t]));
  }
  const glassMesh = new THREE.Mesh(mergeAll(panes), glazingMaterial());
  glassMesh.name = 'pictureGlass';
  glassMesh.castShadow = false;
  glassMesh.receiveShadow = false;
  glassMesh.renderOrder = 2;
  g.add(glassMesh);

  g.userData.pick = [artMesh];
  return g;
}

let _glazingMat = null;
/** Shared additive "sheet of glass" pane — an angled window reflection. */
export function glazingMaterial() {
  if (_glazingMat) return _glazingMat;
  const tex = TEX.painted('glazing', 256, (g, S) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    // two soft parallel bands raking down-right, plus a wide ambient sheen
    const wide = g.createLinearGradient(0, 0, S, S);
    wide.addColorStop(0, 'rgba(255,255,255,0.30)');
    wide.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    wide.addColorStop(1, 'rgba(255,255,255,0.14)');
    g.fillStyle = wide;
    g.fillRect(0, 0, S, S);
    g.save();
    g.translate(S * 0.5, S * 0.5);
    g.rotate(-0.62);
    for (const [ox, w, a] of [[-S * 0.22, S * 0.16, 0.68], [S * 0.06, S * 0.07, 0.42]]) {
      const gr = g.createLinearGradient(ox - w, 0, ox + w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(ox - w, -S, w * 2, S * 2);
    }
    g.restore();
  });
  _glazingMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.20,
    side: THREE.FrontSide
  });
  return _glazingMat;
}

/* --------------------------------------------------------------- clock --- */

/** Wall clock. Hands are separate meshes so they can actually tell the time. */
export function buildClock(M, { r = 0.135 } = {}) {
  const g = new THREE.Group();
  g.name = 'clock';
  const case_ = [];
  const rim = new THREE.TorusGeometry(r, 0.016, 8, 40);
  case_.push(rim);
  case_.push(xf(new THREE.CylinderGeometry(r, r, 0.03, 40), [0, 0, -0.016], [Math.PI / 2, 0, 0]));
  g.add(mesh(mergeAll(case_), M.beech, 'clockCase'));

  const faceTex = TEX.painted('clockFace', 512, (c, S) => {
    c.fillStyle = '#fdf7ef';
    c.fillRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const long = i % 3 === 0;
      c.strokeStyle = long ? '#5a4a48' : '#a89890';
      c.lineWidth = long ? S * 0.022 : S * 0.012;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * S * 0.40, cy + Math.sin(a) * S * 0.40);
      c.lineTo(cx + Math.cos(a) * (long ? S * 0.33 : S * 0.36), cy + Math.sin(a) * (long ? S * 0.33 : S * 0.36));
      c.stroke();
    }
    c.fillStyle = '#e8a0b4';
    c.beginPath(); c.arc(cx, cy + S * 0.20, S * 0.035, 0, Math.PI * 2); c.fill();
  });
  const faceMat = new THREE.MeshPhysicalMaterial({ map: faceTex, roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  const face = new THREE.Mesh(new THREE.CircleGeometry(r - 0.012, 40), faceMat);
  face.position.z = 0.004;
  face.receiveShadow = true;
  g.add(face);

  const hand = (len, wide) => {
    const m = mesh(rbox(wide, len, 0.006, [0, len / 2 - wide * 0.6, 0], [0, 0, 0], 0.003, 3), M.dark, 'clockHand');
    m.castShadow = false;
    return m;
  };
  const hour = hand(r * 0.52, 0.014);
  const min = hand(r * 0.78, 0.010);
  hour.position.z = 0.010;
  min.position.z = 0.014;
  g.add(hour, min);
  g.userData.hour = hour;
  g.userData.minute = min;
  return g;
}

/* ------------------------------------------------------------- bunting --- */

/**
 * Bunting strung between two points. The cord follows a real catenary and the
 * flags hang off it as instances; `userData.update` walks a travelling wave
 * along the line so the whole garland breathes.
 */
export function buildBunting(M, from, to, { n = 11, sag = 0.22, seed = 6 } = {}) {
  const g = new THREE.Group();
  g.name = 'bunting';
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;       // catenary, close enough at this span
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const cord = mesh(new THREE.TubeGeometry(curve, 40, 0.004, 5, false), M.dark, 'buntingCord');
  cord.castShadow = false;
  g.add(cord);

  const cols = [0xef8a7a, 0xf5c26b, 0x8fc4b0, 0x8fb0d8, 0xefb6cd, 0xfdf3e6];
  const R = rng(seed);
  const items = [];
  const anchors = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    anchors.push({ p: p.clone(), tan: tan.clone(), phase: R() * 6.28 });
    items.push({
      pos: [p.x, p.y - 0.055, p.z],
      rot: [0, 0, Math.atan2(tan.y, tan.x)],
      color: cols[i % cols.length]
    });
  }
  const flag = new THREE.Shape();
  flag.moveTo(-0.052, 0.055);
  flag.lineTo(0.052, 0.055);
  flag.lineTo(0, -0.075);
  flag.closePath();
  const flagGeo = new THREE.ExtrudeGeometry(flag, {
    depth: 0.004, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.002,
    bevelSegments: 1, steps: 1
  });
  boxUV(flagGeo, 6);
  const flags = instanced(flagGeo, M.cloth, items, 'buntingFlags');
  flags.castShadow = false;      // paper-thin triangles alias badly in VSM
  g.add(flags);

  g.userData.update = (t) => {
    for (let i = 0; i < anchors.length; i++) {
      const an = anchors[i];
      const s = Math.sin(t * 1.35 + an.phase) * 0.09 + Math.sin(t * 2.7 + an.phase * 1.7) * 0.03;
      _e.set(s * 0.7, s * 0.5, Math.atan2(an.tan.y, an.tan.x) + s * 0.35);
      _q.setFromEuler(_e);
      _v.set(an.p.x, an.p.y - 0.055, an.p.z);
      _s.set(1, 1, 1);
      flags.setMatrixAt(i, _m4.compose(_v, _q, _s));
    }
    flags.instanceMatrix.needsUpdate = true;
  };
  return g;
}

/* ---------------------------------------------------------- nightlight --- */

/** Mushroom nightlight. Owns its material so it can glow without the lamp. */
export function buildNightlight(M) {
  const g = new THREE.Group();
  g.name = 'nightlight';
  // Deliberately NOT `transmission`: a transmissive material forces the
  // renderer to resolve the whole opaque scene into a buffer first, which for
  // a 5 cm mushroom costs an entire extra pass. Emissive plus a little alpha
  // reads identically at this size.
  const glowMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff0e0,
    emissive: new THREE.Color(0xffbf7a),
    emissiveIntensity: 0,
    roughness: 0.32,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    transparent: true,
    opacity: 0.94
  });
  const dome = new THREE.SphereGeometry(0.055, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  dome.translate(0, 0.028, 0);
  const domeMesh = new THREE.Mesh(dome, glowMat);
  g.add(domeMesh);
  const foot = lathe([[0, 0], [0.042, 0], [0.045, 0.008], [0.030, 0.022], [0.026, 0.03], [0, 0.03]], 18);
  g.add(mesh(foot, M.ceramic, 'nightlightFoot'));
  g.userData.setOn = (on) => { glowMat.emissiveIntensity = on ? 2.4 : 0; };
  g.userData.material = glowMat;
  return g;
}

/* ----------------------------------------------------------- highchair --- */

/** Splay-legged high chair with a tray and a quilted seat pad. */
export function buildHighchair(M) {
  const g = new THREE.Group();
  g.name = 'highchair';
  const frame = [];
  const legH = 0.62;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lean = 0.10;
      frame.push(rbox(0.036, legH, 0.036,
        [sx * (0.14 + lean * 0.5), legH / 2, sz * (0.13 + lean * 0.5)],
        [-sz * lean, 0, sx * lean], 0.01, 2));
    }
  }
  // stretchers + footrest
  for (const sz of [-1, 1]) frame.push(rbox(0.30, 0.024, 0.022, [0, 0.20, sz * 0.155], [0, 0, 0], 0.0104, 2));
  frame.push(rbox(0.28, 0.020, 0.13, [0, 0.245, 0.14], [0, 0, 0], 0.006, 2));
  frame.push(rbox(0.34, 0.028, 0.31, [0, legH, 0], [0, 0, 0], 0.0132, 2));
  // back rest, tilted, with two slats
  frame.push(rbox(0.32, 0.30, 0.026, [0, legH + 0.16, -0.15], [-0.11, 0, 0], 0.0124, 2));
  for (const sx of [-1, 1]) {
    frame.push(rbox(0.030, 0.32, 0.030, [sx * 0.15, legH + 0.16, -0.145], [-0.11, 0, 0], 0.0143, 2));
  }
  g.add(mesh(mergeAll(frame), M.beech, 'highchairFrame'));

  const pad = mesh(rbox(0.30, 0.035, 0.27, [0, legH + 0.03, 0.005], [0, 0, 0], 0.014, 1.8), M.quilt, 'highchairPad');
  g.add(pad);

  // tray with a rounded front edge
  const trayShape = new THREE.Shape();
  trayShape.moveTo(-0.19, -0.10);
  trayShape.lineTo(0.19, -0.10);
  trayShape.quadraticCurveTo(0.23, 0.06, 0, 0.13);
  trayShape.quadraticCurveTo(-0.23, 0.06, -0.19, -0.10);
  const trayGeo = new THREE.ExtrudeGeometry(trayShape, {
    depth: 0.022, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006,
    bevelSegments: 2, steps: 1, curveSegments: 8
  });
  trayGeo.rotateX(-Math.PI / 2);
  boxUV(trayGeo, 2);
  const tray = mesh(xf(trayGeo, [0, legH + 0.10, 0.18], [0, Math.PI, 0]), M.paintedWhite, 'highchairTray');
  g.add(tray);

  g.userData.tray = tray;
  g.userData.pick = [tray, pad];
  return g;
}

/* ---------------------------------------------------------- play table --- */

/** Low round play table with two stools. */
export function buildPlayTable(M) {
  const g = new THREE.Group();
  g.name = 'playTable';
  const H = 0.40, R = 0.30;
  const top = lathe([
    [0, 0], [R - 0.028, 0], [R - 0.008, 0.0026], [R - 0.0015, 0.0092],
    [R, 0.017], [R - 0.0015, 0.0262], [R - 0.008, 0.0328],
    [R - 0.028, 0.036], [0, 0.036]
  ], 40);
  const parts = [xf(top, [0, H, 0])];
  const legProfile = [
    [0.021, 0], [0.024, 0.02], [0.018, 0.05], [0.022, 0.09],
    [0.017, 0.28], [0.023, 0.32], [0.017, 0.36], [0.020, H]
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(xf(lathe(legProfile, 10), [Math.cos(a) * 0.21, 0, Math.sin(a) * 0.21], [0.05 * Math.sin(a), 0, -0.05 * Math.cos(a)]));
  }
  parts.push(xf(new THREE.TorusGeometry(0.205, 0.012, 6, 24), [0, 0.11, 0], [Math.PI / 2, 0, 0]));
  g.add(mesh(mergeAll(parts), M.beech, 'playTableTop'));

  const stools = [];
  for (const [sx, sz, ry] of [[-0.46, 0.12, 0.4], [0.42, -0.20, -0.9]]) {
    const seat = lathe([[0, 0], [0.108, 0], [0.1174, 0.0028], [0.12, 0.0092], [0.1188, 0.0206], [0.1128, 0.0272], [0.102, 0.030], [0, 0.032]], 28);
    stools.push(xf(seat, [sx, 0.235, sz]));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + ry;
      stools.push(xf(new THREE.CylinderGeometry(0.014, 0.017, 0.235, 8),
        [sx + Math.cos(a) * 0.075, 0.118, sz + Math.sin(a) * 0.075],
        [0.09 * Math.sin(a), 0, -0.09 * Math.cos(a)]));
    }
  }
  g.add(mesh(boxUV(mergeAll(stools), 1.4), M.paintedMint, 'stools'));
  g.userData.pick = g.children.slice();
  return g;
}

/* ---------------------------------------------------------- door leaf --- */

/** Panelled door, hinged so the room can leave it ajar. */
export function buildDoorLeaf(M, { w = 0.86, h = 2.03 } = {}) {
  const g = new THREE.Group();
  g.name = 'door';
  const parts = [rbox(w, h, 0.042, [w / 2, h / 2, 0], [0, 0, 0], 0.008, 1.2)];
  for (const [py, ph] of [[h * 0.30, h * 0.34], [h * 0.70, h * 0.30]]) {
    parts.push(rbox(w - 0.20, ph, 0.012, [w / 2, py, 0.022], [0, 0, 0], 0.012, 1.4));
  }
  g.add(mesh(mergeAll(parts), M.paintedWhite, 'doorLeaf'));
  const knob = lathe([[0, 0], [0.012, 0], [0.014, 0.014], [0.026, 0.03], [0.022, 0.048], [0, 0.052]], 14);
  knob.rotateX(Math.PI / 2);
  g.add(mesh(xf(knob, [w - 0.085, 1.02, 0.021]), M.brass, 'doorKnob'));
  return g;
}

/* -------------------------------------------------------- block family --- */

/**
 * One block family for the whole game. These are the same object as the tower
 * blocks in `fx/toys.js` — same painted-hardwood palette, same 15%-of-size
 * bevel, same relief motif standing proud of the side faces, same maker's mark
 * debossed underneath, same paint rubbed back along the edges. The difference
 * is only that these are instanced, because the floor carries a dozen of them
 * and the tower carries eight.
 *
 * Two geometries come back: `body` (per-instance paint colour, wear baked into
 * the vertex colour as a multiplier) and `marks` (the cream motifs and the
 * maker's mark, drawn with a white instance colour). Two draw calls, any
 * number of blocks, per-instance colour and — because the four side faces
 * carry four *different* motifs — per-instance symbol as the resting rotation
 * changes which one faces the room.
 */
export const BLOCK_PAINTS = [
  0xe8657f, 0xf0a63c, 0xf6cf4a, 0x86c96b, 0x63b8d8, 0xa88bd8, 0xef8f5f, 0x7fc7b0
];

function motifShape(kind, r) {
  const s = new THREE.Shape();
  if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rr = i % 2 ? r * 0.46 : r;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
    }
    s.closePath();
  } else if (kind === 'heart') {
    s.moveTo(0, -r * 0.92);
    s.bezierCurveTo(r * 1.15, -r * 0.08, r * 0.62, r * 0.98, 0, r * 0.44);
    s.bezierCurveTo(-r * 0.62, r * 0.98, -r * 1.15, -r * 0.08, 0, -r * 0.92);
  } else if (kind === 'circle') {
    s.absarc(0, 0, r * 0.86, 0, Math.PI * 2, false);
  } else if (kind === 'triangle') {
    s.moveTo(0, r);
    s.lineTo(r * 0.92, -r * 0.62);
    s.lineTo(-r * 0.92, -r * 0.62);
    s.closePath();
  } else {                                     // flower
    for (let i = 0; i < 5; i++) {
      const a0 = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / 5;
      const m = (a0 + a1) / 2;
      if (i === 0) s.moveTo(Math.cos(a0) * r * 0.34, Math.sin(a0) * r * 0.34);
      s.quadraticCurveTo(Math.cos(m) * r * 1.5, Math.sin(m) * r * 1.5,
        Math.cos(a1) * r * 0.34, Math.sin(a1) * r * 0.34);
    }
    s.closePath();
  }
  return s;
}

/** Per-vertex edge proximity of a rounded box: 0 on the flats, 1 at a corner. */
function bevelWear(geo, half, r) {
  const p = geo.attributes.position;
  const out = new Float32Array(p.count);
  const inner = Math.max(1e-4, half - r);
  for (let i = 0; i < p.count; i++) {
    const tx = Math.min(1, Math.max(0, (Math.abs(p.getX(i)) - inner) / r));
    const ty = Math.min(1, Math.max(0, (Math.abs(p.getY(i)) - inner) / r));
    const tz = Math.min(1, Math.max(0, (Math.abs(p.getZ(i)) - inner) / r));
    out[i] = Math.min(1, tx * ty + ty * tz + tz * tx);
  }
  return out;
}

/**
 * Body + marks for one unit block (1 m cube — scale it per instance).
 * `seed` picks which four motifs land on the four side faces.
 */
export function blockGeometry({ bevel = 0.15, seed = 3 } = {}) {
  const kinds = ['star', 'heart', 'circle', 'triangle', 'flower'];
  const body = roundedBox(1, 1, 1, bevel, 3);
  boxUV(body, 1);

  // paint rubbed back along every bevel: a vertex-colour multiplier, so it
  // survives whatever paint colour the instance carries
  const wear = bevelWear(body, 0.5, bevel);
  const n = body.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const w = Math.pow(wear[i], 1.5);
    const f = 1 + w * 0.46;                     // vColor is a multiplier, >1 lifts
    cols[i * 3] = f; cols[i * 3 + 1] = f * (1 - w * 0.05); cols[i * 3 + 2] = f * (1 - w * 0.12);
  }
  body.setAttribute('color', new THREE.BufferAttribute(cols, 3));

  const relief = 0.045;
  const mr = 0.27;
  const marks = [];
  const faces = [
    [0, 0, 0.5 - relief * 0.5, 0],
    [0, 0, -(0.5 - relief * 0.5), Math.PI],
    [0.5 - relief * 0.5, 0, 0, Math.PI / 2],
    [-(0.5 - relief * 0.5), 0, 0, -Math.PI / 2]
  ];
  faces.forEach((f, k) => {
    const g = new THREE.ExtrudeGeometry(motifShape(kinds[(seed + k) % kinds.length], mr), {
      depth: relief, bevelEnabled: true, bevelSegments: 1,
      bevelThickness: relief * 0.35, bevelSize: relief * 0.3, curveSegments: 8
    });
    g.translate(0, 0, -relief * 0.5);
    g.rotateY(f[3]);
    g.translate(f[0], f[1], f[2]);
    boxUV(g, 1);
    marks.push(tint(g, 0xfff6e6));
  });

  // maker's mark, debossed into the underside
  const markR = 0.16;
  const ring = new THREE.Shape();
  ring.absarc(0, 0, markR, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, markR * 0.66, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const shapes = [ring];
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k / 3) * Math.PI * 2;
    const dot = new THREE.Shape();
    dot.absarc(Math.cos(a) * markR * 0.34, Math.sin(a) * markR * 0.34, markR * 0.14, 0, Math.PI * 2, false);
    shapes.push(dot);
  }
  for (const shp of shapes) {
    const g = new THREE.ExtrudeGeometry(shp, { depth: 0.02, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -0.02);
    g.rotateX(Math.PI / 2);
    g.translate(0, -0.5 + 0.012, 0);
    boxUV(g, 1);
    marks.push(tint(g, 0x9a8b7a));
  }

  return { body, marks: mergeAll(marks, { colors: true }) };
}

/* --------------------------------------------------- wall electrics ----- */

/**
 * A light switch. Returns two geometry buckets so the plate can be merged into
 * the room's white trim and the shadow gap into the dark mesh — both already
 * exist, so a switch costs zero draw calls. Authored in the XY plane facing
 * +Z; the caller places it on a wall.
 */
export function switchGeo({ w = 0.082, h = 0.118, tilt = 0.35 } = {}) {
  const plate = [];
  const dark = [];
  plate.push(rbox(w, h, 0.010, [0, 0, 0.005], [0, 0, 0], 0.008, 8));
  // recessed shadow line around the rocker
  dark.push(rbox(w * 0.62, h * 0.52, 0.004, [0, 0, 0.010], [0, 0, 0], 0.002, 8));
  // the rocker itself, flipped up — nobody's switch sits dead centre
  plate.push(rbox(w * 0.56, h * 0.46, 0.013, [0, 0, 0.014], [tilt * 0.10, 0, 0], 0.004, 8));
  // two screw heads
  for (const sy of [-1, 1]) {
    const s = lathe([[0, 0], [0.0035, 0], [0.0038, 0.0012], [0, 0.0016]], 8);
    s.rotateX(-Math.PI / 2);
    plate.push(xf(s, [0, sy * h * 0.40, 0.0102]));
  }
  return { plate: mergeAll(plate), dark: mergeAll(dark) };
}

/** A twin power outlet, same trick: plate into the trim, slots into the dark. */
export function outletGeo({ w = 0.076, h = 0.108 } = {}) {
  const plate = [rbox(w, h, 0.009, [0, 0, 0.0045], [0, 0, 0], 0.009, 8)];
  const dark = [];
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      dark.push(rbox(0.0055, 0.017, 0.006, [sx * 0.0105, sy * h * 0.22, 0.0088], [0, 0, 0], 0.0012, 4));
    }
    // the shallow moulded recess each socket sits in
    plate.push(rbox(w * 0.66, 0.030, 0.004, [0, sy * h * 0.22, 0.0106], [0, 0, 0], 0.006, 8));
  }
  return { plate: mergeAll(plate), dark: mergeAll(dark) };
}

/* ------------------------------------------------------------- clutter --- */

const _mm = new THREE.Matrix4();

/**
 * The toys that end up on the floor. Real clutter is not a uniform scatter —
 * it clumps, it drifts to edges, things land on their corners, and somebody
 * always stacks two. Each hand-placed spot below seeds a *clump* of one to
 * three toys with its own density, resting orientation and pile.
 *
 * Costs four draw calls however many toys there are: block bodies, block
 * marks, balls, and one instanced contact-shadow sheet with a tight dark core
 * under every single item.
 */
export function buildClutter(M, spots, { seed = 77 } = {}) {
  const group = new THREE.Group();
  group.name = 'clutter';
  const R = rng(seed);
  const ballCols = [0xf3a3bd, 0xffd98a, 0x9fd4c4, 0xa9c8ef];

  const toys = [];
  const up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();
  const qq = new THREE.Quaternion();
  const qy = new THREE.Quaternion();

  /** Resting orientation for a cube: flat, tipped on an edge, or on a corner. */
  const restQuat = (mode, yaw) => {
    const q = new THREE.Quaternion();
    if (mode === 'corner') {
      // a body diagonal points at the floor — only stable leaning on something
      axis.set(1, 1, 1).normalize();
      q.setFromUnitVectors(axis, new THREE.Vector3(0, -1, 0));
    } else if (mode === 'edge') {
      axis.set(Math.cos(yaw), 0, Math.sin(yaw));
      q.setFromAxisAngle(axis, Math.PI / 4 + (R() - 0.5) * 0.25);
    } else {
      axis.set(Math.cos(yaw * 1.7), 0, Math.sin(yaw * 1.7));
      q.setFromAxisAngle(axis, (R() - 0.5) * 0.10);
    }
    qy.setFromAxisAngle(up, yaw);
    return q.premultiply(qy);
  };

  /** Support height of a unit cube under rotation q, scaled by `size`. */
  const support = (q, size) => {
    _mm.makeRotationFromQuaternion(q);
    const e = _mm.elements;
    return 0.5 * size * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9]));
  };

  spots.forEach((s, si) => {
    const [cx, cz, opt] = [s[0], s[1], s[2] || {}];
    const n = opt.n !== undefined ? opt.n : (R() < 0.42 ? 1 : R() < 0.8 ? 2 : 3);
    const spread = opt.spread !== undefined ? opt.spread : 0.10 + R() * 0.13;
    const pile = !!opt.pile;
    let stackY = 0;
    let stackX = cx, stackZ = cz;

    for (let k = 0; k < n; k++) {
      const wantBall = opt.ball !== undefined ? (k === opt.ball) : (!pile && R() < 0.30);
      const a = R() * 6.283;
      const rad = k === 0 ? 0 : spread * (0.45 + R() * 0.75);
      const x = pile ? stackX + (R() - 0.5) * 0.014 : cx + Math.cos(a) * rad;
      const z = pile ? stackZ + (R() - 0.5) * 0.014 : cz + Math.sin(a) * rad;
      const size = wantBall ? 0.086 + R() * 0.038 : 0.078 + R() * 0.036;
      const yaw = R() * 6.283;

      let q, restY;
      if (wantBall) {
        q = new THREE.Quaternion().setFromAxisAngle(up, yaw);
        restY = size * 0.5;
      } else {
        const roll = R();
        const mode = pile ? 'flat' : roll < 0.14 ? 'corner' : roll < 0.42 ? 'edge' : 'flat';
        q = restQuat(mode, yaw);
        restY = support(q, size) - (mode === 'corner' ? size * 0.03 : 0);
      }

      toys.push({
        kind: wantBall ? 'ball' : 'block',
        x, z, quat: q, size,
        base: pile ? stackY + restY : restY,
        color: wantBall ? ballCols[(si + k) % ballCols.length]
          : BLOCK_PAINTS[(si * 3 + k * 5) % BLOCK_PAINTS.length],
        shadow: pile && k > 0 ? 0.35 : 1,
        v: 0, target: 0, phase: R() * 6.28
      });
      if (pile) stackY += size * 0.98;
    }
  });

  const blocks = toys.filter(t => t.kind === 'block');
  const balls = toys.filter(t => t.kind === 'ball');

  const B = blockGeometry({ bevel: 0.15, seed: 3 });
  const ballGeo = new THREE.SphereGeometry(0.5, 26, 18);

  const blockMesh = instanced(B.body, M.blockWood, blocks.map(t => ({ color: t.color, scale: 0 })), 'clutterBlocks');
  const markMesh = instanced(B.marks, M.blockWood, blocks.map(() => ({ color: 0xffffff, scale: 0 })), 'clutterBlockMarks');
  const ballMesh = instanced(ballGeo, M.plastic, balls.map(t => ({ color: t.color, scale: 0 })), 'clutterBalls');
  for (const m of [blockMesh, markMesh, ballMesh]) m.frustumCulled = false;
  group.add(blockMesh, markMesh, ballMesh);

  /* --- a real contact shadow under every single toy --------------------- */
  const shGeo = new THREE.PlaneGeometry(1, 1);
  shGeo.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shGeo, shadowBlobMaterial(0x35202c), toys.length * 2);
  shadows.frustumCulled = false;
  shadows.renderOrder = -1;
  shadows.name = 'clutterShadows';
  group.add(shadows);

  const write = () => {
    let bi = 0, si = 0, sh = 0;
    for (const t of toys) {
      const v = t.v;
      const lift = Math.sin(Math.min(1, v) * Math.PI) * 0.06;      // little hop
      const squash = 1 + Math.sin(Math.min(1, v) * Math.PI) * 0.18;
      _v.set(t.x, t.base * v + lift, t.z);
      const s = t.size * v;
      _s.set(s / squash, s * squash, s / squash);
      _m4.compose(_v, t.quat, _s);
      if (t.kind === 'block') { blockMesh.setMatrixAt(bi, _m4); markMesh.setMatrixAt(bi, _m4); bi++; }
      else ballMesh.setMatrixAt(si++, _m4);

      // wide haze + tight core, both shrinking as the toy is lifted away
      const grounded = Math.max(0, 1 - lift * 9);
      const rr = t.size * (0.92 + lift * 4);
      _v.set(t.x, 0.005, t.z);
      _q.identity();
      _s.set(rr * 2.1, 1, rr * 2.1);
      shadows.setMatrixAt(sh, _m4.compose(_v, _q, _s));
      _c.setRGB(0.30 * v * grounded * t.shadow, 0.5, 1);
      shadows.setColorAt(sh++, _c);
      _v.y = 0.0056;
      _s.set(rr * 1.02, 1, rr * 1.02);
      shadows.setMatrixAt(sh, _m4.compose(_v, _q, _s));
      _c.setRGB(0.62 * v * grounded * t.shadow, 2.2, 1);
      shadows.setColorAt(sh++, _c);
    }
    blockMesh.instanceMatrix.needsUpdate = true;
    markMesh.instanceMatrix.needsUpdate = true;
    ballMesh.instanceMatrix.needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
    if (shadows.instanceColor) shadows.instanceColor.needsUpdate = true;
  };
  write();

  return {
    group,
    meshes: [blockMesh, ballMesh],
    toys,
    /** How many toys should be out (a number, or true/false for all/none). */
    set(n) {
      const count = n === true ? toys.length : n === false ? 0 : Math.max(0, Math.min(toys.length, n | 0));
      toys.forEach((t, i) => { t.target = i < count ? 1 : 0; });
      return count;
    },
    count() { return toys.reduce((a, t) => a + (t.target > 0.5 ? 1 : 0), 0); },
    update(dt) {
      let moving = false;
      for (const t of toys) {
        const d = t.target - t.v;
        if (Math.abs(d) > 0.001) {
          // in fast and bouncy, out slow and shy
          t.v += d * Math.min(1, dt * (t.target > 0.5 ? 7 : 4));
          moving = true;
        } else if (t.v !== t.target) {
          t.v = t.target;
          moving = true;
        }
      }
      if (moving) write();
      return moving;
    }
  };
}
