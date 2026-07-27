/* ============================================================================
 * face.js — eyes, lids, brows, mouth, tears and the expression system
 * ----------------------------------------------------------------------------
 * Everything that makes the baby feel alive lives here.
 *
 *   • Morph targets are generated procedurally by displacing head vertices
 *     around facial landmarks, so expressions *blend* and *combine* instead of
 *     swapping between poses.
 *   • Eyelids are real geometry: hemispherical shells slightly larger than the
 *     eyeball that rotate over it. Blinking is asymmetric (fast close, slow
 *     open) and spontaneous intervals come from a shifted log-normal, which is
 *     what real inter-blink intervals look like.
 *   • Each eye converges on the look-at target independently, with saccades
 *     and micro-tremor. Perfectly steady eyes are the fastest way to make a
 *     character read as dead.
 *   • Tears form at the inner canthus, swell, then roll down a path traced on
 *     the actual cheek surface at build time.
 * ========================================================================== */

import * as THREE from 'three';
import * as MAT from '../engine/materials.js';
import * as TEX from '../engine/textures.js';
import { PROPORTIONS } from './anatomy.js';

const P = PROPORTIONS;

/* ------------------------------------------------------------ landmarks --- */

export const FACE = {
  // The eyes are the proportion decision, not a detail. They are now 18 %
  // bigger, 3.5 mm further apart and on the head's vertical midline, which is
  // where an infant's are; combined with a much shallower orbit (anatomy.js)
  // that is most of the difference between "baby" and "little old man".
  eye: [0.0335, 0.5355, 0.0450],   // eyeball centre (baby's left)
  eyeR: 0.0208,
  lidR: 0.0226,
  brow: [0.0330, 0.5548, 0.0618],
  browHalf: 0.0198,
  // the lip line, now that the lips are real volumes rather than a groove
  mouth: [0, 0.4906, 0.0744],
  mouthHalf: 0.0200,
  jawPivot: [0, 0.5150, -0.0080],
  cheek: [0.0400, 0.5120, 0.0600],
  nose: [0, 0.5078, 0.0812],
  chin: [0, 0.4760, 0.0600]
};

/**
 * Morph-target landmarks, on the *skin*, not on the underlying volumes.
 *
 * Every expression below is written against these rather than against
 * hand-typed coordinates. When the proportions move — and in an art-direction
 * pass they move a lot — nineteen expressions used to have to be re-typed one
 * gaussian centre at a time, and any one that got missed left a morph pushing
 * on empty skin two centimetres from the feature it was named after.
 */
const L = {
  eyeX: 0.0335, eyeY: 0.5355, eyeZ: 0.0585,   // surface in front of the ball
  lidUpY: 0.5510, lidLoY: 0.5185,             // upper / lower lid crease
  canthusX: 0.0555,                           // outer corner
  browX: 0.0300, browY: 0.5540, browZ: 0.0620,
  gladY: 0.5480, gladZ: 0.0640,               // glabella, between the brows
  foreY: 0.5700, foreZ: 0.0570,               // mid-forehead
  cheekX: 0.0400, cheekY: 0.5090, cheekZ: 0.0620,
  cornerX: 0.0182, cornerY: 0.4904, cornerZ: 0.0654,   // mouth corner
  lipY: 0.4906, lipZ: 0.0748,                 // lip centre
  upperLipY: 0.4952, lowerLipY: 0.4862,
  chinY: 0.4790, chinZ: 0.0630,
  noseY: 0.5150, noseZ: 0.0700,               // bridge
  alaX: 0.0104, alaY: 0.5046, alaZ: 0.0664
};

/**
 * "Below the eye" mask, 0 at the pupil and 1 a couple of centimetres under it.
 *
 * Every morph that lifts the cheek — the squint of a smile, a big grin, the
 * bunched cheeks of a bawl — pushes skin *upward* toward the eye, and now that
 * the eyeball is 18 % bigger and the orbit far shallower than it was, an
 * ungated 9 mm lift simply closes the eye: `happy` and `giggle` rendered with
 * the eyeballs completely buried under a fold of cheek. The cheek may reach the
 * lower lid margin; it may not climb past it.
 */
const belowEye = y => sstep(0.5395, 0.5195, y);

const g1 = (d, r) => Math.exp(-(d * d) / (r * r));
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const DEG = Math.PI / 180;
const LID_HALF = Math.PI * 0.52;              // lid cap half-angle
const LID_HALF_DEG = 0.52 * 180;

/* scratch — the face updates every frame and must not allocate */
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3();
const _t4 = new THREE.Vector3(), _t5 = new THREE.Vector3(), _t6 = new THREE.Vector3();
const _t7 = new THREE.Vector3(), _t8 = new THREE.Vector3(), _t9 = new THREE.Vector3();
const _t10 = new THREE.Vector3();
const _tm = new THREE.Matrix4();
const _FWD = new THREE.Vector3(0, 0, 1);

/** Seeded PRNG for blink timing — see `_nextBlinkInterval`. */
function blinkRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------------------------------- morph targets -- */

/**
 * Each entry displaces the head mesh. `f(ax, x, y, z, s, out)` receives the
 * mirrored |x| plus the side sign so left/right stay symmetric for free.
 */
const MORPHS = [
  ['browRaise', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax - L.browX, y - L.browY, z - L.browZ), 0.032)
      + 0.5 * g1(Math.hypot(ax - 0.020, y - (L.browY + 0.021), z - (L.browZ - 0.004)), 0.034);
    o[1] += 0.0112 * w; o[2] += 0.0022 * w;
    // A hint of forehead crease, and no more than a hint. An infant's forehead
    // does move, but it has no fixed lines in it, and three carved ridges over
    // the brow is a middle-aged forehead however young the rest of the face is.
    const fold = Math.sin((y - L.foreY) * 460) * g1(Math.hypot(ax * 0.7, y - L.foreY, z - L.gladZ), 0.024);
    o[2] += 0.0005 * fold;
  }],
  ['browFurrow', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax - 0.014, y - L.browY, z - L.browZ), 0.024);
    o[1] -= 0.0086 * w; o[0] -= 0.0060 * w * s; o[2] += 0.0044 * w;
    // the little vertical ridge between the brows
    o[2] += 0.0038 * g1(Math.hypot(ax, y - L.gladY, z - L.gladZ), 0.011);
  }],
  ['browSad', (ax, x, y, z, s, o) => {
    const inner = g1(Math.hypot(ax - 0.012, y - L.browY, z - (L.browZ + 0.002)), 0.021);
    const outer = g1(Math.hypot(ax - 0.048, y - (L.browY - 0.002), z - (L.browZ - 0.010)), 0.024);
    o[1] += 0.0102 * inner - 0.0064 * outer;
    o[2] += 0.0030 * inner;
    // the oblique fold that appears above the inner brow — the single most
    // legible cue for distress on any face
    o[2] += 0.0022 * g1(Math.hypot(ax - 0.016, y - (L.browY + 0.014), z - L.browZ), 0.017);
  }],
  ['eyeWide', (ax, x, y, z, s, o) => {
    const up = g1(Math.hypot(ax - L.eyeX, y - L.lidUpY, z - L.eyeZ), 0.021);
    const dn = g1(Math.hypot(ax - L.eyeX, y - L.lidLoY, z - L.eyeZ), 0.020);
    o[1] += 0.0062 * up - 0.0042 * dn;
  }],
  ['eyeSquint', (ax, x, y, z, s, o) => {
    // The squint of a smile is made entirely by the *cheek* rising into the
    // lower lid. No crow's foot: a fan of creases at the outer canthus is an
    // age marker and nothing else.
    const dn = g1(Math.hypot(ax - (L.eyeX + 0.002), y - L.lidLoY, z - L.eyeZ), 0.020) * belowEye(y);
    const up = g1(Math.hypot(ax - L.eyeX, y - L.lidUpY, z - L.eyeZ), 0.019);
    o[1] += 0.0078 * dn - 0.0032 * up; o[2] += 0.0030 * dn;
  }],
  ['smileSmall', (ax, x, y, z, s, o) => {
    const c = g1(Math.hypot(ax - L.cornerX, y - L.cornerY, z - L.cornerZ), 0.015);
    const ch = g1(Math.hypot(ax - L.cheekX, y - L.cheekY, z - L.cheekZ), 0.026) * belowEye(y);
    o[1] += 0.0058 * c + 0.0032 * ch; o[0] += 0.0024 * c * s; o[2] += 0.0012 * ch;
  }],
  ['smileBig', (ax, x, y, z, s, o) => {
    const c = g1(Math.hypot(ax - L.cornerX, y - L.cornerY, z - (L.cornerZ - 0.001)), 0.019);
    const ch = g1(Math.hypot(ax - (L.cheekX + 0.002), y - (L.cheekY + 0.003), z - (L.cheekZ - 0.003)), 0.028) * belowEye(y);
    const lip = g1(Math.hypot(ax, y - L.upperLipY, z - L.lipZ), 0.020);
    o[1] += 0.0126 * c + 0.0106 * ch + 0.0036 * lip;
    o[0] += 0.0080 * c * s + 0.0034 * ch * s;
    o[2] += 0.0052 * ch - 0.0012 * c;
    // No nasolabial fold. It used to be carved in here at 4.2 mm, and it is
    // the loudest "old man" signal a face can carry — infants do not have the
    // muscle attachment that makes one. The cheek apple is now separated from
    // the muzzle by nothing but its own convexity.
  }],
  ['jawOpen', (ax, x, y, z, s, o) => {
    // rotate the lower face about the jaw hinge, then scoop the lip region
    // backward so the mouth bag has somewhere to sit
    const w = sstep(0.5220, 0.4740, y) * sstep(-0.030, 0.020, z);
    const py = y - FACE.jawPivot[1], pz = z - FACE.jawPivot[2];
    const a = 0.40 * w;
    o[1] += (py * Math.cos(a) - pz * Math.sin(a)) - py;
    o[2] += (py * Math.sin(a) + pz * Math.cos(a)) - pz;
    const m = g1(Math.hypot(ax * 0.72, y - L.lipY, (z - L.lipZ) * 0.9), 0.022);
    o[2] -= 0.0165 * m;
  }],
  ['mouthPout', (ax, x, y, z, s, o) => {
    const m = g1(Math.hypot(ax * 0.9, y - L.lipY, z - L.lipZ), 0.019);
    const c = g1(Math.hypot(ax - L.cornerX, y - L.cornerY, z - L.cornerZ), 0.015);
    o[2] += 0.0092 * m; o[0] -= 0.0058 * c * s; o[1] -= 0.0030 * m;
    o[1] += 0.0038 * g1(Math.hypot(ax, y - L.chinY, z - L.chinZ), 0.017);   // chin up
  }],
  ['mouthFrown', (ax, x, y, z, s, o) => {
    const c = g1(Math.hypot(ax - L.cornerX, y - L.cornerY, z - L.cornerZ), 0.016);
    o[1] -= 0.0112 * c; o[0] += 0.0022 * c * s; o[2] -= 0.0020 * c;
    o[1] += 0.0034 * g1(Math.hypot(ax, y - L.lowerLipY, z - (L.lipZ - 0.004)), 0.014);
    o[2] += 0.0032 * g1(Math.hypot(ax, y - L.chinY, z - L.chinZ), 0.016);
  }],
  ['mouthCry', (ax, x, y, z, s, o) => {
    // the wide unhappy rectangle: corners out and down, upper lip up
    const c = g1(Math.hypot(ax - (L.cornerX + 0.003), y - L.cornerY, z - (L.cornerZ - 0.003)), 0.020);
    const upper = g1(Math.hypot(ax * 0.8, y - L.upperLipY, z - L.lipZ), 0.018);
    o[0] += 0.0130 * c * s; o[1] -= 0.0086 * c; o[2] -= 0.0034 * c;
    o[1] += 0.0068 * upper; o[2] -= 0.0034 * upper;
    o[1] += 0.0076 * g1(Math.hypot(ax - L.cheekX, y - L.cheekY, z - L.cheekZ), 0.025) * belowEye(y); // cheeks bunch
    // the tongue-shaped hollow under the lower lip of a full bawl
    o[2] -= 0.0030 * g1(Math.hypot(ax * 0.8, y - (L.chinY - 0.001), z - (L.chinZ + 0.004)), 0.016);
  }],
  ['cheekPuff', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax - (L.cheekX + 0.005), y - (L.cheekY - 0.004), z - (L.cheekZ - 0.014)), 0.031);
    o[0] += 0.0118 * w * s; o[2] += 0.0050 * w; o[1] -= 0.0012 * w;
  }],
  ['cheekSuck', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax - (L.cheekX + 0.002), y - (L.cheekY - 0.006), z - (L.cheekZ - 0.010)), 0.024);
    o[0] -= 0.0086 * w * s; o[2] -= 0.0028 * w;
  }],
  ['noseWrinkle', (ax, x, y, z, s, o) => {
    // two short transverse ridges across the nose bridge, the ala pulled up
    const w = g1(Math.hypot(ax, y - L.noseY, z - (L.noseZ + 0.004)), 0.016);
    o[1] += 0.0058 * w; o[2] += 0.0030 * w;
    o[2] += 0.0013 * Math.sin((y - L.noseY) * 700) * w;
    const side = g1(Math.hypot(ax - L.alaX, y - L.alaY, z - L.alaZ), 0.012);
    o[1] += 0.0050 * side; o[0] += 0.0016 * side * s;
  }],
  ['lipsPurse', (ax, x, y, z, s, o) => {
    const m = g1(Math.hypot(ax, y - L.lipY, z - L.lipZ), 0.018);
    o[2] += 0.0072 * m; o[0] -= 0.0050 * m * s * clamp01(ax / 0.02);
  }],
  ['sleepSoft', (ax, x, y, z, s, o) => {
    const w = sstep(0.5230, 0.4740, y);
    o[1] -= 0.0034 * w;
    o[1] -= 0.0032 * g1(Math.hypot(ax - L.eyeX, y - L.browY, z - L.browZ), 0.028);
    o[1] += 0.0030 * g1(Math.hypot(ax - L.cheekX, y - L.cheekY, z - L.cheekZ), 0.028) * belowEye(y);
    o[2] += 0.0026 * g1(Math.hypot(ax, y - L.lipY, z - L.lipZ), 0.018);
  }],
  ['sulk', (ax, x, y, z, s, o) => {
    // deliberately asymmetric: one corner down, one flat
    const left = x > 0 ? 1 : 0.15;
    const c = g1(Math.hypot(ax - L.cornerX, y - L.cornerY, z - L.cornerZ), 0.016) * left;
    o[1] -= 0.0098 * c;
    o[2] += 0.0074 * g1(Math.hypot(ax, y - L.lowerLipY, z - (L.lipZ - 0.002)), 0.017); // lower lip out
    o[1] -= 0.0040 * g1(Math.hypot(ax - 0.020, y - L.browY, z - L.browZ), 0.024);
  }],
  ['chinRaise', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax, y - L.chinY, z - L.chinZ), 0.020);
    o[1] += 0.0064 * w; o[2] += 0.0026 * w;
    // the walnut-chin dimpling that comes with a wobbling lip
    o[2] -= 0.0014 * Math.sin(ax * 620) * w;
  }],
  ['yawnWide', (ax, x, y, z, s, o) => {
    const w = sstep(0.5220, 0.4690, y) * sstep(-0.030, 0.020, z);
    const py = y - FACE.jawPivot[1], pz = z - FACE.jawPivot[2];
    const a = 0.70 * w;
    o[1] += (py * Math.cos(a) - pz * Math.sin(a)) - py;
    o[2] += (py * Math.sin(a) + pz * Math.cos(a)) - pz;
    const m = g1(Math.hypot(ax * 0.68, y - (L.lipY - 0.005), (z - L.lipZ) * 0.85), 0.026);
    o[2] -= 0.0205 * m;
    o[0] -= 0.0040 * g1(Math.hypot(ax - (L.cheekX + 0.006), y - L.cheekY, z - (L.cheekZ - 0.008)), 0.026) * s;
  }]
];

export const MORPH_NAMES = MORPHS.map(m => m[0]);

/** Attach procedurally-built relative morph targets to the head geometry. */
export function buildFaceMorphs(headGeometry) {
  const pos = headGeometry.attributes.position.array;
  const nv = pos.length / 3;
  headGeometry.morphTargetsRelative = true;
  headGeometry.morphAttributes.position = [];
  headGeometry.morphTargetDictionary = {};
  const out = [0, 0, 0];
  MORPHS.forEach(([name, fn], mi) => {
    const d = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      if (y < 0.4520 || z < -0.020) continue;         // nothing behind the ears moves
      out[0] = out[1] = out[2] = 0;
      fn(Math.abs(x), x, y, z, x >= 0 ? 1 : -1, out);
      d[v * 3] = out[0]; d[v * 3 + 1] = out[1]; d[v * 3 + 2] = out[2];
    }
    const attr = new THREE.BufferAttribute(d, 3);
    attr.name = name;
    headGeometry.morphAttributes.position.push(attr);
    headGeometry.morphTargetDictionary[name] = mi;
  });
  return MORPH_NAMES;
}

/* ------------------------------------------------------------- geometry --- */

/**
 * Eyeball.
 *
 * `makeEye()` paints the iris as a disc at the *centre* of a square canvas.
 * A stock `SphereGeometry` maps that square as an equirectangular wrap, which
 * puts the iris in a band around the sphere's equator and leaves the pole —
 * whichever pole you rotate to the front — showing nothing but sclera. That is
 * why the character rendered as blank white lozenges no matter where it was
 * looking. So the eyeball gets its own azimuthal UV: distance from the *front*
 * pole maps to distance from the centre of the texture, which is the layout
 * the texture was actually painted for.
 *
 * `irisDeg` is the angular radius the painted iris (0.34 of the canvas) ends up
 * subtending on the ball, i.e. how big the iris reads. 29° is the anatomically
 * honest figure — it makes the iris half the diameter of the ball, which is
 * what a real eye is — but this ball is deliberately oversized for cuteness
 * while the *aperture* between the lids is not, so at 29° the iris filled 85 %
 * of the opening and the eyes read as two beady dark dots with no sclera
 * anywhere. Size the iris to the aperture, not to the ball.
 */
function eyeballGeometry(R, segs, rings, irisDeg = 33) {
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  const thetaRef = (0.5 / 0.34) * irisDeg * DEG;      // θ at the texture's edge
  for (let j = 0; j <= rings; j++) {
    const th = Math.PI * (j / rings);
    for (let i = 0; i <= segs; i++) {
      const ph = (i / segs) * Math.PI * 2;
      const st = Math.sin(th), ct = Math.cos(th);
      const nx = st * Math.cos(ph), ny = st * Math.sin(ph), nz = ct;
      pos.push(nx * R, ny * R, nz * R);
      nor.push(nx, ny, nz);
      const s = 0.5 * (th / thetaRef);
      uv.push(0.5 + s * Math.cos(ph), 0.5 + s * Math.sin(ph));
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + segs + 1;
      if (j > 0) idx.push(a, b, a + 1);
      if (j < rings - 1) idx.push(a + 1, b, b + 1);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Spherical cap with a rolled rim, used for both eyelids. */
function lidGeometry(R, halfAngle, segs, rings) {
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const th = halfAngle * t;
    // the last 18% of the cap tucks in, giving the lid margin a rounded edge
    const roll = 1 - 0.16 * sstep(0.82, 1.0, t);
    for (let i = 0; i <= segs; i++) {
      const ph = (i / segs) * Math.PI * 2;
      const st = Math.sin(th), ct = Math.cos(th);
      const nx = st * Math.cos(ph), ny = ct, nz = st * Math.sin(ph);
      pos.push(nx * R * roll, ny * R * roll, nz * R * roll);
      nor.push(nx, ny, nz);
      uv.push(i / segs, t);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + segs + 1;
      if (j > 0) idx.push(a, a + 1, b);
      idx.push(a + 1, b + 1, b);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * The lash band on the lid margin.
 *
 * This used to be two rings 4° apart, which at portrait distance is a hairline
 * and effectively invisible. That mattered more than it sounds: the lids share
 * the *skin* material, so with no lash line there is nothing at all separating
 * the eyeball from the face — the eye stops being an eye set into a lid and
 * becomes a white lozenge with a dot on it, painted on the front of the head.
 * A dark margin is what gives an eye its socket for free.
 *
 * So it is now a three-row band ~9° deep, and it tapers to nothing at the inner
 * canthus (`ph` near ±π/2 on this cap), because real lashes do — a uniform ring
 * reads as eyeliner.
 */
function lashGeometry(R, halfAngle, segs) {
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const rows = 3;
  for (let k = 0; k < rows; k++) {
    const t = k / (rows - 1);
    for (let i = 0; i <= segs; i++) {
      const ph = (i / segs) * Math.PI * 2;
      // 0 at the inner corner, 1 at the outer — the cap's ±x axis is the
      // canthal axis, so cos(ph) is exactly the inner/outer coordinate
      const outer = 0.5 - 0.5 * Math.cos(ph);
      const th = halfAngle + t * (0.055 + 0.105 * outer);
      const rr = R * (1 - 0.16) * (1 - t * 0.055);
      const st = Math.sin(th), ct = Math.cos(th);
      const nx = st * Math.cos(ph), ny = ct, nz = st * Math.sin(ph);
      pos.push(nx * rr, ny * rr, nz * rr);
      nor.push(nx, ny, nz);
      uv.push(i / segs, t);
      col.push(1, 1, 1, (1 - t * 0.55) * (0.34 + 0.66 * outer));
    }
  }
  for (let k = 0; k < rows - 1; k++) {
    for (let i = 0; i < segs; i++) {
      const a = k * (segs + 1) + i, b = a + segs + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * A soft tapered arc — the brow.
 *
 * An infant brow is barely there: a haze of very fine hair with no hard edge
 * anywhere. So this is a flat-ish ribbon lying on the brow ridge, carrying a
 * per-vertex alpha that fades to nothing at both ends and along the top and
 * bottom margins. (Vertex alpha rather than an alpha map: a 4-component
 * `color` attribute switches three's `USE_COLOR_ALPHA` path on, which
 * multiplies straight into the material's alpha without needing a texture.)
 *
 * `bias` shifts the whole brow's mass toward the inner (-1) or outer (+1) end,
 * and `arch` how much it lifts in the middle — the two knobs that let the left
 * and right brow differ *on purpose*.
 */
function browGeometry({ len = 0.0215, thick = 0.0052, segs = 20, bias = 0, arch = 1 } = {}) {
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const across = 4;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const u = t * 2 - 1;
    const cx = u * len;
    // the arch: highest a third of the way out from the inner end
    const cy = arch * (0.0034 * (1 - u * u) - 0.0026 * u * Math.abs(u)) - 0.0012 * u * u;
    const cz = -0.0064 * u * u - 0.0018 * Math.abs(u) * u;
    // thickness: fullest just inboard of the arch, feathering to nothing at
    // both ends — no blunt terminations
    const shape = Math.pow(Math.max(0, 1 - u * u), 0.62) * (1 + bias * u * 0.45);
    const r = thick * shape;
    const endFade = Math.pow(Math.max(0, 1 - u * u), 0.85);
    for (let k = 0; k <= across; k++) {
      const v = k / across;
      const a = (v - 0.5) * 2;                        // -1 bottom … +1 top
      pos.push(cx, cy + a * r, cz + (1 - a * a) * 0.0011);
      nor.push(0, 0.35 * a, 1);
      uv.push(t, v);
      // alpha: soft at the margins, softer still at the roots
      const edge = Math.pow(Math.max(0, 1 - a * a), 0.55);
      col.push(1, 1, 1, edge * endFade * 0.62);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < across; k++) {
      const a = i * (across + 1) + k, b = a + across + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------ expressions - */

const C0 = () => ({
  browRaise: 0, browFurrow: 0, browSad: 0, eyeWide: 0, eyeSquint: 0,
  smileSmall: 0, smileBig: 0, jawOpen: 0, mouthPout: 0, mouthFrown: 0,
  mouthCry: 0, cheekPuff: 0, cheekSuck: 0, noseWrinkle: 0, lipsPurse: 0,
  sleepSoft: 0, sulk: 0, chinRaise: 0, yawnWide: 0,
  lidClose: 0, lidLower: 0, blush: 0, tears: 0, browLift: 0, headTilt: 0
});

/** Mood → control weights. Anything unlisted relaxes to zero. */
/**
 * Twelve moods that have to be told apart from a single still with the UI
 * hidden and the sound off. Infant faces are *loud*: the amplitudes here are
 * deliberately near the top of their range, and every entry moves the brows,
 * the lids and the cheeks, not just the mouth.
 */
export const MOODS = {
  /* `neutral` is the hardest one and it was the wrong shape. A third of a
   * smile on a closed mouth is not a neutral face — it is a *smirk*, and a
   * smirk is knowing, which is the one thing an infant cannot be. Worse, the
   * mouth was clamped shut: a resting baby's mouth hangs very slightly open
   * with the lips barely parted, because the jaw muscles are not yet doing
   * anything. So: no smile, brows up a touch (an infant's default is mild
   * interest, not composure), lids fully open, and just enough jaw to part the
   * lips without opening the mouth bag behind them. */
  neutral:   { jawOpen: 0.11, browRaise: 0.13, blush: 0.22, smileSmall: 0.05 },
  happy:     { smileBig: 0.86, smileSmall: 0.55, eyeSquint: 0.58, browRaise: 0.44, blush: 0.64, jawOpen: 0.16, cheekPuff: 0.14 },
  giggle:    { smileBig: 1.0, smileSmall: 0.4, eyeSquint: 0.95, browRaise: 0.55, jawOpen: 0.44, blush: 0.88, noseWrinkle: 0.45, cheekPuff: 0.26, headTilt: -0.20 },
  sad:       { browSad: 1.0, mouthFrown: 0.94, lidLower: 0.54, chinRaise: 0.48, headTilt: -0.40, blush: 0.34, tears: 0.22, browLift: 0.18 },
  cry:       { browSad: 1.0, mouthCry: 1.0, jawOpen: 0.88, lidClose: 0.90, tears: 1.0, noseWrinkle: 0.78, blush: 1.0, cheekPuff: 0.30, chinRaise: 0.30 },
  sleepy:    { sleepSoft: 0.88, lidLower: 0.92, browRaise: 0.26, jawOpen: 0.10, headTilt: 0.28, blush: 0.32, smileSmall: 0.18 },
  asleep:    { sleepSoft: 1.0, lidClose: 1.0, jawOpen: 0.20, smileSmall: 0.32, blush: 0.40, browRaise: 0.10 },
  surprised: { eyeWide: 1.0, browRaise: 1.0, jawOpen: 0.66, lipsPurse: 0.38, blush: 0.22 },
  sulk:      { sulk: 1.0, browFurrow: 0.74, mouthPout: 0.72, lidLower: 0.44, headTilt: 0.30, blush: 0.32, cheekPuff: 0.18 },
  shy:       { smileSmall: 0.68, eyeSquint: 0.44, lidLower: 0.56, blush: 1.0, chinRaise: 0.42, headTilt: 0.36, browSad: 0.26 },
  excited:   { smileBig: 0.96, eyeWide: 0.88, browRaise: 0.98, jawOpen: 0.58, blush: 0.72, cheekPuff: 0.10 },
  yum:       { smileSmall: 0.72, eyeSquint: 0.82, lipsPurse: 0.58, cheekPuff: 0.46, blush: 0.46, noseWrinkle: 0.30, browRaise: 0.26 }
};

/* ------------------------------------------------------------------ Face -- */

export class Face {
  constructor({ tier = 2, headGeometry, field = null } = {}) {
    this.tier = tier;
    this.headGeometry = headGeometry;
    // The implicit body field, when Baby hands it over. Anything that has to
    // sit *on* the skin (the blush caps) is placed by querying it rather than
    // by a hand-authored offset — see `_buildBlush`.
    this.field = field;
    this.group = new THREE.Group();
    this.group.name = 'face';

    this.controls = C0();
    this._target = C0();
    this.mood = 'neutral';
    this._moodBlend = 1;

    /* gaze ---------------------------------------------------------------- */
    this.lookTarget = null;
    this._gaze = new THREE.Vector2(0, 0);        // yaw, pitch (radians)
    this._gazeGoal = new THREE.Vector2(0, 0);
    this._saccadeIn = 0.7;
    this._tremor = new THREE.Vector2();
    this._idlePoint = new THREE.Vector3(0, P.eyeY, 1.2);

    /* blink ---------------------------------------------------------------- */
    this._rnd = blinkRandom(0xb1a2c3);
    // first blink lands after every shot in tools/shots.json has been captured
    this._blinkT = 5.9;
    this._attend = true;
    this._dwell = 1.9;
    this._blinkPhase = -1;                        // -1 idle, else seconds elapsed
    this._blinkQueued = 0;
    this._blinkAmount = 0;

    this._t = 0;
    this._tears = [];
    this._headBone = null;
  }

  /* ------------------------------------------------------------- build --- */

  build() {
    const irisColors = [0x4a3728, 0x3b2a1e, 0x5c4630];
    this.eyeMat = MAT.makeEye({ iris: irisColors[0], sclera: 0xfffaf7 });
    // makeCornea() is memoised and shared; take a private copy so the veil can
    // be pulled right down without changing anything else that asks for one.
    this.corneaMat = MAT.makeCornea().clone();
    this.corneaMat.opacity = 0.07;
    this.corneaMat.transmission = 0.35;
    this.corneaMat.envMapIntensity = 1.5;
    this.skinMat = null;                          // injected by Baby.build()

    const eyeGeo = eyeballGeometry(FACE.eyeR, this.tier >= 2 ? 30 : 20, this.tier >= 2 ? 20 : 14);
    // A tight corneal dome rather than a full milky hemisphere: enough to bend
    // a specular over the iris, not enough to fog it.
    const corneaGeo = new THREE.SphereGeometry(FACE.lidR * 1.005, 20, 12,
      0, Math.PI * 2, 0, Math.PI * 0.25);
    corneaGeo.rotateX(Math.PI / 2);

    const lidSegs = this.tier >= 2 ? 22 : 15;
    const lidGeo = lidGeometry(FACE.lidR, LID_HALF, lidSegs, 6);
    // the lid shares the skin material, which samples aZone; without the
    // attribute WebGL would feed it (0,0,0,1) and dirt would land on eyelids
    lidGeo.setAttribute('aZone', new THREE.BufferAttribute(
      new Float32Array(lidGeo.attributes.position.count * 4), 4));
    const lashGeo = lashGeometry(FACE.lidR, LID_HALF, lidSegs);

    this.lashMat = MAT.makeLash({ color: 0x4b3428 });
    // the band carries its own alpha ramp so it fades out at the inner canthus
    this.lashMat.vertexColors = true;
    this.lashMat.transparent = true;
    this.lashMat.depthWrite = false;
    this.lashMat.needsUpdate = true;
    // Infant brows are a warm haze, not a drawn line. Vertex alpha carries the
    // root fade; the material only has to agree to look at it.
    this.browMat = MAT.makeLash({ color: 0xc79a72, opacity: 1 });
    this.browMat.vertexColors = true;
    this.browMat.transparent = true;
    this.browMat.depthWrite = false;
    this.browMat.roughness = 0.85;
    this.browMat.sheen = 0.5;
    this.browMat.needsUpdate = true;

    this.eyes = [];
    this.brows = [];
    for (const s of [1, -1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(FACE.eye[0] * s, FACE.eye[1], FACE.eye[2]);
      this.group.add(pivot);

      const ball = new THREE.Mesh(eyeGeo, this.eyeMat);
      ball.castShadow = false; ball.receiveShadow = true;
      pivot.add(ball);

      const cornea = new THREE.Mesh(corneaGeo, this.corneaMat);
      cornea.renderOrder = 3;
      pivot.add(cornea);

      // the catchlight: a tiny additive disc that always faces out. Without a
      // guaranteed specular hit the eyes read as buttons. It lives on a rig
      // that is re-aimed at the actual key light every frame (see _aimCatch),
      // and the two eyes are given slightly different radii so the pair never
      // reads as a stamped-on decal.
      const clRig = new THREE.Object3D();
      pivot.add(clRig);
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.0068, 0.0068), MAT.makeCatchlight());
      cl.position.set(0, 0, FACE.eyeR * 1.06);
      cl.renderOrder = 5;
      clRig.add(cl);
      const cl2 = new THREE.Mesh(cl.geometry, cl.material.clone());
      cl2.material.opacity = 0.26;
      cl2.scale.setScalar(0.52);
      cl2.renderOrder = 5;
      const clRig2 = new THREE.Object3D();
      cl2.position.set(0, 0, FACE.eyeR * 1.06);
      clRig2.add(cl2);
      pivot.add(clRig2);

      // lids: separate pivots so they can follow gaze independently of the eye
      const upper = new THREE.Object3D();
      const lower = new THREE.Object3D();
      pivot.add(upper, lower);
      const um = new THREE.Mesh(lidGeo, null);
      const lm = new THREE.Mesh(lidGeo, null);
      lm.rotation.z = Math.PI;                     // lower lid is the mirror cap
      um.castShadow = lm.castShadow = false;
      um.receiveShadow = lm.receiveShadow = true;
      upper.add(um); lower.add(lm);
      const ul = new THREE.Mesh(lashGeo, this.lashMat);
      const ll = new THREE.Mesh(lashGeo, this.lashMat);
      ll.rotation.z = Math.PI;
      ll.scale.setScalar(0.97);
      upper.add(ul); lower.add(ll);

      // Deliberate asymmetry, small enough to read as character rather than
      // error: the baby's left brow sits a hair higher and arches a little
      // more than the right. The old pair differed by accident and in the
      // wrong currency — length and darkness — which reads as a bug.
      const left = s > 0;
      const brow = new THREE.Mesh(browGeometry({
        len: FACE.browHalf * (left ? 1.02 : 0.99),
        thick: 0.0038,
        segs: 22,
        bias: left ? 0.10 : 0.02,
        arch: left ? 1.12 : 0.94
      }), this.browMat);
      const browPivot = new THREE.Object3D();
      browPivot.position.set(FACE.brow[0] * s, FACE.brow[1] + (left ? 0.0008 : 0), FACE.brow[2]);
      // resting tilt is now very slightly *up* at the outer end: down-and-in
      // is a scowl, and a resting infant does not scowl
      browPivot.rotation.z = 0.045 * s;
      browPivot.add(brow);
      this.group.add(browPivot);
      this.brows.push({
        pivot: browPivot, s, rest: browPivot.position.clone(), restRot: 0.045 * s
      });

      this.eyes.push({
        s, pivot, ball, cornea, upper, lower, upperMesh: um, lowerMesh: lm,
        catch: cl, catch2: cl2, catchRig: clRig, catchRig2: clRig2
      });
    }

    this._buildMouth();
    this._buildBlush();
    this._buildTears();
    return this;
  }

  /**
   * The mouth is a "bag": a dark bowl that sits inside the depression the
   * jawOpen morph scoops out of the face. The lips stay skin; everything you
   * see through them belongs to this group.
   */
  _buildMouth() {
    const grp = new THREE.Group();
    grp.position.set(FACE.mouth[0], FACE.mouth[1], FACE.mouth[2] - 0.0235);
    this.group.add(grp);
    this.mouthGroup = grp;

    const cav = new THREE.SphereGeometry(0.0210, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
    cav.rotateX(-Math.PI / 2);
    cav.scale(1.28, 1.0, 0.82);
    this.mouthMat = MAT.makeMouthInterior();
    const cavity = new THREE.Mesh(cav, this.mouthMat);
    cavity.renderOrder = 1;
    grp.add(cavity);
    this.cavity = cavity;

    const tongueGeo = new THREE.SphereGeometry(0.0105, 16, 12);
    tongueGeo.scale(1.15, 0.55, 1.35);
    this.tongueMat = MAT.makeTongue();
    const tongue = new THREE.Mesh(tongueGeo, this.tongueMat);
    tongue.position.set(0, -0.0072, 0.0055);
    grp.add(tongue);
    this.tongue = tongue;

    // two lower incisors — babies get these around six months and they are
    // disproportionately charming
    const toothMat = MAT.makeTooth();
    const teeth = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.0044, 0.0038, 0.0022), toothMat);
      t.position.set((i - 0.5) * 0.0052, -0.0022, 0.0122);
      teeth.add(t);
    }
    grp.add(teeth);
    this.teeth = teeth;
    teeth.visible = false;
  }

  /**
   * Cheek blush.
   *
   * ── Why no cheek colour was visible in any frame ────────────────────────
   *
   * Nothing was wrong with the amplitude or the material. The caps were inside
   * the skull. Two mistakes compounded:
   *
   *   1. `SphereGeometry`'s cap is a dome around **+Y**, but `Object3D.lookAt`
   *      aims **+Z**. So the dome pointed *up* out of the mesh origin, not at
   *      the target it was aimed at.
   *   2. The origin was then pre-offset by (−53 mm, −55.5 mm) — the sphere
   *      radius — on the assumption that the pole would come back out along
   *      the aim. It did not, so the offset simply buried the origin.
   *
   * Measured at runtime, both caps ended up at x ≈ ±0 (i.e. on the midline,
   * not on two cheeks), 6 cm behind the face, with the whole 62 mm cap sphere
   * inside a head whose radius at the cheek is ~72 mm. `field.eval` at the
   * origin was −5.5 mm: under the skin, drawn, depth-tested away.
   *
   * A third, quieter bug would have kept it invisible even so: the alpha is a
   * *radial* sprite, and a sphere cap's UVs are (azimuth, arc) — sampling a
   * disc-shaped alpha with polar coordinates puts alpha ≈ 0 over the entire
   * patch. The cap is re-charted below so u,v are the flat disc coordinates
   * the sprite was drawn in.
   *
   * The placement is now taken from the body field itself: Newton-step onto
   * the iso-0 surface, take the gradient for the normal, lift 1.6 mm. That is
   * the same discipline the garment shells had to learn — never author a
   * surface-hugging offset by hand when the surface is available to ask.
   */
  _buildBlush() {
    const mat = MAT.makeBlush({ color: 0xff5273 });
    this.blushMat = mat;
    this.blush = [];

    // Curvature deliberately much flatter than the cheek: a cap tighter than
    // the surface it lies on dives its own rim into the skin, and the depth
    // test then bites a hard crescent out of the patch.
    const R = 0.150;
    const CAP = 0.0150;                       // 30 mm across on the skin
    const geo = new THREE.SphereGeometry(R, 24, 10, 0, Math.PI * 2, 0, Math.asin(CAP / R));
    geo.rotateX(Math.PI / 2);                 // pole +Y → +Z, which is what lookAt aims
    geo.translate(0, 0, -R);                  // pole at the local origin
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, 0.5 + pos.getX(i) / (2 * CAP), 0.5 + pos.getY(i) / (2 * CAP));
    }
    uv.needsUpdate = true;

    const n = [0, 0, 0];
    const _z = new THREE.Vector3(0, 0, 1), _n = new THREE.Vector3();
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(geo, mat);
      // Low and lateral: on the apple of the cheek, not up against the eye
      // socket where the surface falls away and the cap rim buries itself.
      let p = new THREE.Vector3(FACE.cheek[0] * 1.06 * s, FACE.cheek[1] - 0.0075, FACE.cheek[2] - 0.0080);
      if (this.field) {
        // land exactly on the skin, then face along its normal
        for (let i = 0; i < 6; i++) {
          const d = this.field.eval(p.x, p.y, p.z);
          if (Math.abs(d) < 1e-5) break;
          this.field.grad(p.x, p.y, p.z, n);
          p.addScaledVector(_n.set(n[0], n[1], n[2]), -d);
        }
        this.field.grad(p.x, p.y, p.z, n);
        _n.set(n[0], n[1], n[2]).normalize();
      } else {
        // fallback: outward from the head's centre of mass
        _n.set(p.x - 0, p.y - 0.5330, p.z - 0.0060).normalize();
      }
      m.position.copy(p).addScaledVector(_n, 0.0030);
      m.quaternion.setFromUnitVectors(_z, _n);
      m.renderOrder = 2;
      this.group.add(m);
      this.blush.push(m);
    }
  }

  _buildTears() {
    const geo = new THREE.SphereGeometry(1, 10, 8);
    geo.scale(0.85, 1.15, 0.7);
    this.tearMat = MAT.makeTear();
    this.tearPool = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, this.tearMat);
      m.visible = false;
      m.renderOrder = 4;
      this.group.add(m);
      this.tearPool.push({ mesh: m, life: -1, s: 1, u: 0, r: 0 });
    }
    // the path a tear rolls down: inner canthus → cheek → jaw
    this.tearPath = s => [
      new THREE.Vector3(0.0200 * s, 0.5250, 0.0690),
      new THREE.Vector3(0.0280 * s, 0.5125, 0.0710),
      new THREE.Vector3(0.0360 * s, 0.4990, 0.0680),
      new THREE.Vector3(0.0410 * s, 0.4855, 0.0590),
      new THREE.Vector3(0.0420 * s, 0.4740, 0.0470)
    ];
  }

  /** Parent everything to the head bone so the face rides the rig. */
  attach(headBone) {
    this._headBone = headBone;
    // face landmarks are authored in bind-world space; the head bone sits at
    // A.head, so shift by its rest offset once
    const p = headBone.getWorldPosition(new THREE.Vector3());
    this.group.position.set(-p.x, -p.y, -p.z);
    headBone.add(this.group);
    // The rig root's local space *is* bind-world (every bone is placed there at
    // its bind coordinate), which makes it the right frame to author idle gaze
    // points in — they then stay put in the room as the head turns.
    let r = headBone;
    while (r.parent && r.parent.type !== 'Scene' && r.name !== 'rigRoot') r = r.parent;
    this._rigRoot = r;
  }

  /** Skin material arrives after Baby builds it; lids must match the face. */
  setSkinMaterial(mat) {
    this.skinMat = mat;
    for (const e of this.eyes) { e.upperMesh.material = mat; e.lowerMesh.material = mat; }
  }

  /* -------------------------------------------------------------- mood --- */

  setMood(name, seconds = 0.45) {
    if (!MOODS[name]) name = 'neutral';
    this.mood = name;
    const base = C0();
    Object.assign(base, MOODS[name]);
    this._target = base;
    this._moodRate = 1 / Math.max(0.06, seconds);
  }

  /** Additive one-shot overlays (chewing, sucking…) set by Baby/anim. */
  setOverlay(name, value) { this._overlay ??= {}; this._overlay[name] = value; }

  /* ------------------------------------------------------------- blink --- */

  _nextBlinkInterval() {
    // shifted log-normal: mostly 2–4 s with a long tail, like the real thing.
    // Drawn from a seeded stream rather than Math.random so that a screenshot
    // of a given moment is reproducible — otherwise roughly one still in six
    // catches the character mid-blink and reads as a baby with no eyes.
    const u1 = this._rnd() || 1e-6, u2 = this._rnd();
    const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return 1.15 + Math.exp(0.42 + n * 0.55);
  }

  blink(double = this._rnd() < 0.13) {
    if (this._blinkPhase < 0) this._blinkPhase = 0;
    if (double) this._blinkQueued = 1;
  }

  _updateBlink(dt) {
    const CLOSE = 0.072, HOLD = 0.022, OPEN = 0.155;
    if (this._blinkPhase < 0) {
      this._blinkT -= dt;
      if (this._blinkT <= 0) { this.blink(); this._blinkT = this._nextBlinkInterval(); }
      this._blinkAmount = 0;
      return;
    }
    this._blinkPhase += dt;
    const t = this._blinkPhase;
    if (t < CLOSE) {
      const k = t / CLOSE;
      this._blinkAmount = k * k;                    // accelerating snap shut
    } else if (t < CLOSE + HOLD) {
      this._blinkAmount = 1;
    } else if (t < CLOSE + HOLD + OPEN) {
      const k = (t - CLOSE - HOLD) / OPEN;
      this._blinkAmount = 1 - (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    } else {
      this._blinkAmount = 0;
      this._blinkPhase = -1;
      if (this._blinkQueued) { this._blinkQueued = 0; this._blinkPhase = 0; this._blinkT = this._nextBlinkInterval(); }
    }
  }

  /* -------------------------------------------------------------- gaze --- */

  lookAt(worldPos) {
    const fresh = !worldPos || !this.lookTarget || this.lookTarget.distanceToSquared(worldPos) > 4e-4;
    this.lookTarget = worldPos ? worldPos.clone() : null;
    if (worldPos && fresh) { this._saccadeIn = 0; this._attend = true; this._dwell = 1.6 + this._rnd() * 0.8; }
  }

  _updateGaze(dt, ctx) {
    const head = this._headBone;
    if (!head) return;
    // Eye pivots live in `this.group`, which is offset from the head bone by
    // the bone's bind position (~0.47 m). The look target must therefore be
    // resolved into *group* space, not bone space — converting into bone space
    // makes every target read half a metre too low, pins the pitch solve at its
    // lower clamp, and rolls both irises out behind the lids for good.
    // Attention, not obedience. An activity says "look at the bottle" once and
    // means it forever; a real infant studies the thing for a beat and then
    // looks up at whoever is holding it. Alternating gives the character
    // something no amount of eye geometry can fake — the sense that it is
    // deciding where to look — and it is also why the hero portraits stopped
    // being a baby staring at the floor away from camera.
    this._dwell = (this._dwell ?? 0) - dt;
    if (this._dwell <= 0) {
      this._attend = !this._attend;
      this._dwell = this._attend ? 1.5 + this._rnd() * 1.1 : 2.4 + this._rnd() * 1.6;
      if (!this._attend) this._saccadeIn = 0;
    }

    let localTarget;
    if (this.lookTarget && this._attend) {
      localTarget = this.group.worldToLocal(this.lookTarget.clone());
    } else {
      // Idle wander. The point has to be built in *world* space off the eye's
      // own position: authoring it at a fixed height in the rig's frame put it
      // 18 cm above a seated baby's eyeline, so the character spent every shot
      // staring at the ceiling.
      this._saccadeIn -= dt;
      if (this._saccadeIn <= 0) {
        this._saccadeIn = 0.9 + this._rnd() * 2.6;
        // infants lock onto faces: most fixations go to whoever is watching
        this._idleAtCam = this._rnd() < 0.80;
        this._idlePoint.set(
          (this._rnd() - 0.5) * 0.34,
          (this._rnd() - 0.42) * 0.16,
          0.42 + this._rnd() * 0.45
        );
      }
      const eyeW = _t7.copy(this.eyes[0].pivot.position)
        .lerp(this.eyes[1].pivot.position, 0.5);
      this.group.localToWorld(eyeW);
      const root = this._rigRoot || this.group;
      const fwd = _t8.set(0, 0, 1).transformDirection(root.matrixWorld).normalize();
      const right = _t9.set(0, 1, 0).cross(fwd).normalize();
      const w = _t10.copy(eyeW);
      if (this._idleAtCam && ctx?.camera) {
        w.setFromMatrixPosition(ctx.camera.matrixWorld);
        w.addScaledVector(right, this._idlePoint.x * 0.25);
        w.y += this._idlePoint.y * 0.25;
      } else {
        w.addScaledVector(fwd, this._idlePoint.z)
          .addScaledVector(right, this._idlePoint.x);
        w.y += this._idlePoint.y;
      }
      localTarget = this.group.worldToLocal(w);
    }

    /* Per-eye vergence.
     *
     * Each eye aims at the point itself, which is right — but the previous
     * version then clamped *each eye's absolute yaw* to ±0.34. That clamp is
     * symmetric, so the moment the target is more than ~20° off axis both eyes
     * hit the same rail at the same value and the difference between them —
     * which is the entire vergence signal — is thrown away. The pair then
     * points parallel, hard to one side, and reads wall-eyed. It is why the
     * eyes never converged in `04`, `07`, `24`, `25` or `30`.
     *
     * Version (where the pair is looking) and vergence (how crossed they are)
     * are separate degrees of freedom and have to be limited separately. The
     * eyes may now reach ±0.44 in total, but only ever by adding vergence to a
     * clamped conjugate angle, so they can never saturate *together*.        */
    const yaw = [0, 0], pit = [0, 0];
    for (let i = 0; i < this.eyes.length; i++) {
      const p = this.eyes[i].pivot.position;
      const dx = localTarget.x - p.x, dy = localTarget.y - p.y, dz = Math.max(0.05, localTarget.z - p.z);
      yaw[i] = Math.atan2(dx, dz);
      // rotation.x is *positive downward* (it takes +z toward -y), so a target
      // above the eye needs a negative pitch
      pit[i] = -Math.atan2(dy, Math.hypot(dx, dz));
    }
    // conjugate angle — the neck carries the bulk of any large turn
    let version = THREE.MathUtils.clamp((yaw[0] + yaw[1]) * 0.5, -0.30, 0.30);
    // signed half-vergence; at a 40 cm target this is ~0.07 rad, which is small
    // but is exactly the cue that says "those two eyes are looking at one thing"
    let verg = THREE.MathUtils.clamp((yaw[0] - yaw[1]) * 0.5, -0.14, 0.14);
    const pitchC = THREE.MathUtils.clamp((pit[0] + pit[1]) * 0.5, -0.24, 0.22);
    for (let i = 0; i < this.eyes.length; i++) {
      this.eyes[i].goalYaw = version + (i === 0 ? verg : -verg);
      this.eyes[i].goalPitch = pitchC;
    }

    // saccade: eyes snap (≈40 ms) rather than easing, with micro-tremor on top
    const k = 1 - Math.exp(-dt * 34);
    this._tremor.set(
      Math.sin(this._t * 41.3) * 0.0016 + Math.sin(this._t * 13.1) * 0.0022,
      Math.cos(this._t * 37.7) * 0.0014 + Math.sin(this._t * 9.7) * 0.0018
    );
    for (const e of this.eyes) {
      e.yaw = (e.yaw ?? 0) + ((e.goalYaw ?? 0) - (e.yaw ?? 0)) * k;
      e.pitch = (e.pitch ?? 0) + ((e.goalPitch ?? 0) - (e.pitch ?? 0)) * k;
      e.pivot.rotation.set(e.pitch + this._tremor.y, e.yaw + this._tremor.x, 0);
    }
    this.gazePitch = this.eyes[0].pitch ?? 0;
    this.gazeYaw = this.eyes[0].yaw ?? 0;
  }

  /* ------------------------------------------------------- catchlights --- */

  /**
   * Put each catchlight where the key light actually reflects.
   *
   * The specular point on a sphere is the one whose normal is the half-vector
   * between the view and light directions, so that is what the billboard rig
   * is aimed along — clamped to the front cap so it can never slide off behind
   * a lid, and nudged by a different amount in each eye, which is what two
   * differently-angled corneas sharing one light really do.
   */
  _aimCatch(ctx) {
    const key = ctx?.lighting?.key;
    const cam = ctx?.camera;
    if (!key || !cam || !this.eyes.length) return;
    const L = _t1.setFromMatrixPosition(key.matrixWorld);
    if (key.target) L.sub(_t2.setFromMatrixPosition(key.target.matrixWorld));
    L.normalize();
    const camPos = _t3.setFromMatrixPosition(cam.matrixWorld);
    for (const e of this.eyes) {
      e.pivot.updateWorldMatrix(true, false);
      const V = _t4.setFromMatrixPosition(e.pivot.matrixWorld).negate().add(camPos).normalize();
      const H = _t5.copy(L).add(V).normalize();
      H.transformDirection(_tm.copy(e.pivot.matrixWorld).invert());
      this._clampToCap(H, 0.86);
      e.catchRig.quaternion.setFromUnitVectors(_FWD, H);
      // the secondary glint is a bounce off the fill side, low and outboard
      const H2 = _t6.copy(H);
      H2.x -= 0.62 * e.s; H2.y -= 0.55; H2.normalize();
      this._clampToCap(H2, 0.95);
      e.catchRig2.quaternion.setFromUnitVectors(_FWD, H2);
    }
  }

  _clampToCap(v, maxAngle) {
    const a = Math.acos(THREE.MathUtils.clamp(v.z, -1, 1));
    if (a <= maxAngle) return v;
    const s = Math.sin(maxAngle) / Math.max(1e-5, Math.sin(a));
    v.set(v.x * s, v.y * s, Math.cos(maxAngle));
    return v.normalize();
  }

  /* ------------------------------------------------------------ update --- */

  update(dt, ctx) {
    this._t += dt;
    this._updateBlink(dt);
    this._updateGaze(dt, ctx);

    // controls approach their mood targets
    const rate = 1 - Math.exp(-dt * (this._moodRate || 4));
    const c = this.controls, tg = this._target;
    for (const k in c) c[k] += ((tg[k] || 0) - c[k]) * rate;

    // additive overlays (chewing, sucking, laughing) sit on top of the mood
    const ov = this._overlay || {};
    const val = k => clamp01((c[k] || 0) + (ov[k] || 0));

    /* -- morph influences -------------------------------------------------- */
    const inf = this.headMesh?.morphTargetInfluences;
    if (inf) {
      for (let i = 0; i < MORPH_NAMES.length; i++) inf[i] = val(MORPH_NAMES[i]);
    }

    /* -- eyelids ----------------------------------------------------------- */
    // lidClose from mood, blink, and a lid-follows-gaze term. gazePitch is now
    // positive-downward, so only a downward glance should drop the lid.
    const gazeLid = Math.max(0, this.gazePitch || 0) * 0.35;
    for (const e of this.eyes) {
      const close = clamp01(Math.max(this._blinkAmount, val('lidClose'))
        + val('lidLower') * 0.72 + val('sleepSoft') * 0.22 + gazeLid * 0.4);
      // a true smile is made by the *cheek*, which pushes the lower lid up —
      // without it a grin reads as a mouth pasted on a staring face
      const squint = val('eyeSquint') * 0.42 + val('smileBig') * 0.16 + val('mouthCry') * 0.55;
      const wide = val('eyeWide');
      // Lids are hemispherical caps of half-angle LID_HALF. Solve directly for
      // where each lid's *edge* should cross the front of the eye (measured in
      // degrees from straight up) and back out the pivot angle — far easier to
      // reason about than raw rotations, and it makes the aperture explicit.
      // At full close the two edges have to *cross*, not merely approach: the
      // old pair stopped at 101° and 108°, leaving a 7° slit that let the ball
      // show right through a fully closed eye — which is why `asleep` rendered
      // as two hollow sockets with a bare eyeball in them instead of two shut
      // lids. And the lower lid has to be allowed to complete its travel; a
      // 0.62 coefficient means it never gets there however hard the mood asks.
      // Aperture widened from 72° to 82°. On an infant the palpebral fissure is
      // large relative to the eyeball and the iris nearly fills it top to
      // bottom; a narrow slit over a big ball is what makes a stylised eye read
      // as "hooded", i.e. adult.
      const upEdge = THREE.MathUtils.lerp(49 - wide * 10 + squint * 9, 107, close);
      const loEdge = THREE.MathUtils.lerp(131 + wide * 6, 96,
        clamp01(Math.max(close, close * 0.62 + squint * 0.95)));
      e.upper.rotation.x = (upEdge - LID_HALF_DEG) * DEG + (this.gazePitch || 0) * 0.30;
      e.lower.rotation.x = (loEdge - 180 + LID_HALF_DEG) * DEG + (this.gazePitch || 0) * 0.10;
      // the inner corner of the upper lid drops on a sad brow, lifts on a
      // furrow — the tell that separates "sad" from "cross"
      e.upper.rotation.z = e.s * (val('browSad') * 0.26 - val('browFurrow') * 0.20 + val('sulk') * 0.14);
      // The lid caps roll their last 18 % inward, so the lid *margin* sits ~3 mm
      // inside the eyeball. Two closed lids therefore meet along a line where
      // neither is covering the ball, and the ball shows through it as a lit
      // strip — which is what turned every shut-eyed frame into a pair of
      // sockets with a bare eye in them. Nothing behind two closed lids can be
      // seen anyway, so take the ball out with the cornea.
      const vis = close < 0.985;
      e.ball.visible = vis;
      e.cornea.visible = vis;
      e.catch.visible = vis && close < 0.72;
      e.catch2.visible = e.catch.visible;
    }
    this._aimCatch(ctx);

    /* -- brows ------------------------------------------------------------- */
    // Every mood moves the brows. They are the loudest thing on an infant face
    // and leaving them flat is what made `cry` and `happy` read as the same
    // photograph with a different mouth.
    for (const b of this.brows) {
      const raise = val('browRaise') + val('browLift') - val('browFurrow') * 0.8;
      const sad = val('browSad');
      const inner = sad * 1.0 - val('browFurrow') * 0.55 - val('browRaise') * 0.10;
      b.pivot.position.set(
        b.rest.x + (val('browFurrow') * -0.0052) * b.s,
        b.rest.y + raise * 0.0165 + sad * 0.0044
          - val('sleepSoft') * 0.0034 - val('eyeSquint') * 0.0026 - val('sulk') * 0.0030,
        b.rest.z + raise * 0.0018);
      // inner end up + outer end down is the whole grammar of an unhappy brow
      b.pivot.rotation.z = b.restRot + b.s * (inner * 0.72 + val('browRaise') * -0.10)
        + b.s * val('sulk') * -0.18;
      b.pivot.scale.set(
        1 + val('browFurrow') * -0.10 + raise * 0.04,
        1 + raise * 0.22 + sad * 0.15,
        1);
    }

    /* -- mouth ------------------------------------------------------------- */
    const open = clamp01(val('jawOpen') + val('yawnWide') * 1.5 + val('mouthCry') * 0.62);
    const g = this.mouthGroup;
    const wide = clamp01(val('smileBig') * 0.9 + val('mouthCry'));
    g.visible = open > 0.13;
    g.scale.set(
      0.70 + wide * 0.85 + open * 0.34,
      0.34 + open * 1.55,
      0.55 + open * 0.60);
    g.position.y = FACE.mouth[1] - open * 0.0150;
    g.position.z = FACE.mouth[2] - 0.0235 - open * 0.0165;
    this.tongue.position.y = -0.0072 - open * 0.0030 + (ov.tongue || 0) * 0.004;
    this.tongue.position.z = 0.0055 - open * 0.0060 + (ov.tongue || 0) * 0.020;
    this.teeth.visible = open > 0.25 && this.mood !== 'cry';

    /* -- cheeks / blush ---------------------------------------------------- */
    // The amplitude was never the problem — the caps were inside the skull (see
    // `_buildBlush`). Now that they are on the skin, 1.0 is a clown spot: it
    // renders as two flat red discs. Blood under skin is a *tint*.
    this.blushMat.opacity = clamp01(val('blush')) * 0.44;
    for (const m of this.blush) {
      m.visible = this.blushMat.opacity > 0.012;
      // the flush spreads as well as deepening
      const sc = 0.86 + clamp01(val('blush')) * 0.30;
      m.scale.set(sc, 1, sc);
    }

    /* -- tears ------------------------------------------------------------- */
    this._updateTears(dt, val('tears'));
  }

  _updateTears(dt, amount) {
    this._tearSpawn = (this._tearSpawn ?? 0) - dt;
    if (amount > 0.35 && this._tearSpawn <= 0) {
      const free = this.tearPool.find(t => t.life < 0);
      if (free) {
        free.life = 0;
        free.s = Math.random() < 0.5 ? 1 : -1;
        free.u = 0;
        free.r = 0.0034 + Math.random() * 0.0022;
        free.mesh.visible = true;
      }
      this._tearSpawn = 0.38 + Math.random() * 0.5;
    }
    for (const t of this.tearPool) {
      if (t.life < 0) continue;
      t.life += dt;
      const path = this.tearPath(t.s);
      // phase 1: swell in the corner. phase 2: accelerate down the cheek.
      if (t.life < 0.85) {
        t.u = 0;
        const k = clamp01(t.life / 0.85);
        t.mesh.scale.setScalar(t.r * (0.25 + k * 1.0));
      } else {
        t.u += dt * (0.35 + (t.life - 0.85) * 0.9);
        t.mesh.scale.setScalar(t.r * (1.25 - t.u * 0.35));
      }
      if (t.u >= 1) { t.life = -1; t.mesh.visible = false; continue; }
      const f = t.u * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(f));
      const a = path[i], b = path[i + 1];
      t.mesh.position.lerpVectors(a, b, f - i);
      t.mesh.position.z += 0.0022;
    }
    if (amount <= 0.05) for (const t of this.tearPool) { if (t.life > 0.9) { t.life = -1; t.mesh.visible = false; } }
  }

  dispose() {
    this.group.traverse(o => { o.geometry?.dispose?.(); });
    this.eyeMat?.dispose?.(); this.lashMat?.dispose?.(); this.browMat?.dispose?.();
    this.mouthMat?.dispose?.(); this.tongueMat?.dispose?.(); this.tearMat?.dispose?.();
    this.blushMat?.dispose?.();
  }
}
