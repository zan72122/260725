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
  eye: [0.0300, 0.5320, 0.0530],   // eyeball centre (baby's left)
  eyeR: 0.0176,
  lidR: 0.0193,
  brow: [0.0300, 0.5495, 0.0655],
  browHalf: 0.0215,
  mouth: [0, 0.4862, 0.0655],
  mouthHalf: 0.0245,
  jawPivot: [0, 0.5150, -0.0080],
  cheek: [0.0430, 0.5080, 0.0570],
  nose: [0, 0.5075, 0.0770],
  chin: [0, 0.4680, 0.0570]
};

const g1 = (d, r) => Math.exp(-(d * d) / (r * r));
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const DEG = Math.PI / 180;
const LID_HALF = Math.PI * 0.52;              // lid cap half-angle
const LID_HALF_DEG = 0.52 * 180;

/* --------------------------------------------------------- morph targets -- */

/**
 * Each entry displaces the head mesh. `f(ax, x, y, z, s, out)` receives the
 * mirrored |x| plus the side sign so left/right stay symmetric for free.
 */
const MORPHS = [
  ['browRaise', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax - 0.028, y - 0.5455, z - 0.0645), 0.030)
      + 0.5 * g1(Math.hypot(ax - 0.020, y - 0.5680, z - 0.0630), 0.034);
    o[1] += 0.0062 * w; o[2] += 0.0012 * w;
  }],
  ['browFurrow', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax - 0.014, y - 0.5440, z - 0.0655), 0.024);
    o[1] -= 0.0048 * w; o[0] -= 0.0034 * w * s; o[2] += 0.0028 * w;
    // the little vertical ridge between the brows
    o[2] += 0.0022 * g1(Math.hypot(ax, y - 0.5480, z - 0.0680), 0.011);
  }],
  ['browSad', (ax, x, y, z, s, o) => {
    const inner = g1(Math.hypot(ax - 0.012, y - 0.5445, z - 0.0660), 0.021);
    const outer = g1(Math.hypot(ax - 0.046, y - 0.5430, z - 0.0560), 0.024);
    o[1] += 0.0055 * inner - 0.0032 * outer;
    o[2] += 0.0016 * inner;
  }],
  ['eyeWide', (ax, x, y, z, s, o) => {
    const up = g1(Math.hypot(ax - 0.030, y - 0.5470, z - 0.0600), 0.020);
    const dn = g1(Math.hypot(ax - 0.030, y - 0.5165, z - 0.0600), 0.019);
    o[1] += 0.0038 * up - 0.0026 * dn;
  }],
  ['eyeSquint', (ax, x, y, z, s, o) => {
    const dn = g1(Math.hypot(ax - 0.032, y - 0.5170, z - 0.0600), 0.022);
    const up = g1(Math.hypot(ax - 0.030, y - 0.5480, z - 0.0600), 0.019);
    o[1] += 0.0050 * dn - 0.0022 * up; o[2] += 0.0018 * dn;
  }],
  ['smileSmall', (ax, x, y, z, s, o) => {
    const c = g1(Math.hypot(ax - 0.0235, y - 0.4870, z - 0.0585), 0.017);
    const ch = g1(Math.hypot(ax - 0.040, y - 0.5000, z - 0.0570), 0.026);
    o[1] += 0.0042 * c + 0.0018 * ch; o[0] += 0.0016 * c * s; o[2] -= 0.0008 * c;
  }],
  ['smileBig', (ax, x, y, z, s, o) => {
    const c = g1(Math.hypot(ax - 0.0250, y - 0.4880, z - 0.0570), 0.020);
    const ch = g1(Math.hypot(ax - 0.042, y - 0.5040, z - 0.0560), 0.028);
    const lip = g1(Math.hypot(ax, y - 0.4930, z - 0.0670), 0.020);
    o[1] += 0.0088 * c + 0.0072 * ch + 0.0026 * lip;
    o[0] += 0.0055 * c * s + 0.0022 * ch * s;
    o[2] += 0.0032 * ch - 0.0012 * c;
    // nasolabial fold: the crease that separates the cheek apple
    const nl = g1(Math.abs(Math.hypot(ax - 0.030, y - 0.4970) - 0.010), 0.0055)
      * g1(z - 0.0640, 0.020);
    o[2] -= 0.0026 * nl;
  }],
  ['jawOpen', (ax, x, y, z, s, o) => {
    // rotate the lower face about the jaw hinge, then scoop the lip region
    // backward so the mouth bag has somewhere to sit
    const w = sstep(0.5180, 0.4700, y) * sstep(-0.030, 0.020, z);
    const py = y - FACE.jawPivot[1], pz = z - FACE.jawPivot[2];
    const a = 0.34 * w;
    o[1] += (py * Math.cos(a) - pz * Math.sin(a)) - py;
    o[2] += (py * Math.sin(a) + pz * Math.cos(a)) - pz;
    const m = g1(Math.hypot(ax * 0.72, y - 0.4880, (z - 0.0680) * 0.9), 0.023);
    o[2] -= 0.0135 * m;
  }],
  ['mouthPout', (ax, x, y, z, s, o) => {
    const m = g1(Math.hypot(ax * 0.9, y - 0.4855, z - 0.0665), 0.020);
    const c = g1(Math.hypot(ax - 0.0235, y - 0.4865, z - 0.0585), 0.016);
    o[2] += 0.0068 * m; o[0] -= 0.0040 * c * s; o[1] -= 0.0022 * m;
    o[1] += 0.0026 * g1(Math.hypot(ax, y - 0.4715, z - 0.0610), 0.017);   // chin up
  }],
  ['mouthFrown', (ax, x, y, z, s, o) => {
    const c = g1(Math.hypot(ax - 0.0230, y - 0.4870, z - 0.0585), 0.017);
    o[1] -= 0.0070 * c; o[0] += 0.0012 * c * s;
    o[1] += 0.0022 * g1(Math.hypot(ax, y - 0.4790, z - 0.0640), 0.014);
    o[2] += 0.0020 * g1(Math.hypot(ax, y - 0.4710, z - 0.0600), 0.016);
  }],
  ['mouthCry', (ax, x, y, z, s, o) => {
    // the wide unhappy rectangle: corners out and down, upper lip up
    const c = g1(Math.hypot(ax - 0.0270, y - 0.4880, z - 0.0555), 0.021);
    const upper = g1(Math.hypot(ax * 0.8, y - 0.4930, z - 0.0670), 0.019);
    o[0] += 0.0090 * c * s; o[1] -= 0.0058 * c;
    o[1] += 0.0042 * upper; o[2] -= 0.0022 * upper;
    o[1] += 0.0040 * g1(Math.hypot(ax - 0.036, y - 0.5030, z - 0.0570), 0.024); // cheeks bunch
  }],
  ['cheekPuff', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax - 0.0455, y - 0.5010, z - 0.0480), 0.030);
    o[0] += 0.0092 * w * s; o[2] += 0.0038 * w; o[1] -= 0.0010 * w;
  }],
  ['cheekSuck', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax - 0.0430, y - 0.5000, z - 0.0520), 0.024);
    o[0] -= 0.0068 * w * s; o[2] -= 0.0022 * w;
  }],
  ['noseWrinkle', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax, y - 0.5150, z - 0.0740), 0.018);
    o[1] += 0.0034 * w; o[2] += 0.0014 * w;
    const side = g1(Math.hypot(ax - 0.014, y - 0.5090, z - 0.0700), 0.011);
    o[1] += 0.0026 * side;
  }],
  ['lipsPurse', (ax, x, y, z, s, o) => {
    const m = g1(Math.hypot(ax, y - 0.4860, z - 0.0670), 0.019);
    o[2] += 0.0050 * m; o[0] -= 0.0034 * m * s * clamp01(ax / 0.02);
  }],
  ['sleepSoft', (ax, x, y, z, s, o) => {
    const w = sstep(0.5200, 0.4700, y);
    o[1] -= 0.0026 * w;
    o[1] -= 0.0020 * g1(Math.hypot(ax - 0.030, y - 0.5460, z - 0.0630), 0.028);
    o[1] += 0.0022 * g1(Math.hypot(ax - 0.042, y - 0.5020, z - 0.0560), 0.028);
    o[2] += 0.0018 * g1(Math.hypot(ax, y - 0.4860, z - 0.0665), 0.018);
  }],
  ['sulk', (ax, x, y, z, s, o) => {
    // deliberately asymmetric: one corner down, one flat
    const left = x > 0 ? 1 : 0.15;
    const c = g1(Math.hypot(ax - 0.0230, y - 0.4870, z - 0.0585), 0.017) * left;
    o[1] -= 0.0062 * c;
    o[2] += 0.0044 * g1(Math.hypot(ax, y - 0.4820, z - 0.0660), 0.017);   // lower lip out
    o[1] -= 0.0026 * g1(Math.hypot(ax - 0.020, y - 0.5440, z - 0.0655), 0.024);
  }],
  ['chinRaise', (ax, x, y, z, s, o) => {
    const w = g1(Math.hypot(ax, y - 0.4720, z - 0.0590), 0.020);
    o[1] += 0.0044 * w; o[2] += 0.0016 * w;
  }],
  ['yawnWide', (ax, x, y, z, s, o) => {
    const w = sstep(0.5180, 0.4650, y) * sstep(-0.030, 0.020, z);
    const py = y - FACE.jawPivot[1], pz = z - FACE.jawPivot[2];
    const a = 0.62 * w;
    o[1] += (py * Math.cos(a) - pz * Math.sin(a)) - py;
    o[2] += (py * Math.sin(a) + pz * Math.cos(a)) - pz;
    const m = g1(Math.hypot(ax * 0.68, y - 0.4830, (z - 0.0680) * 0.85), 0.026);
    o[2] -= 0.0180 * m;
    o[0] -= 0.0030 * g1(Math.hypot(ax - 0.045, y - 0.5000, z - 0.0520), 0.026) * s;
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
      if (y < 0.455 || z < -0.020) continue;          // nothing behind the ears moves
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

/** Thin lash strip that sits on the lid margin. */
function lashGeometry(R, halfAngle, segs) {
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  for (let k = 0; k < 2; k++) {
    const th = halfAngle + k * 0.075;
    const rr = R * (1 - 0.16) * (1 - k * 0.06);
    for (let i = 0; i <= segs; i++) {
      const ph = (i / segs) * Math.PI * 2;
      const st = Math.sin(th), ct = Math.cos(th);
      const nx = st * Math.cos(ph), ny = ct, nz = st * Math.sin(ph);
      pos.push(nx * rr, ny * rr, nz * rr);
      nor.push(nx, ny, nz);
      uv.push(i / segs, k);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i, b = i + segs + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A soft tapered arc — the brow. */
function browGeometry(len, thick, segs) {
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  const around = 5;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const u = t * 2 - 1;
    const cx = u * len;
    const cy = -u * u * 0.0042 + (u > 0 ? -u * 0.0016 : 0);
    const cz = -Math.abs(u) * u * 0.0030 - u * u * 0.0055;
    const r = thick * (1 - u * u * 0.55) * (u < 0 ? 1.0 : 0.82);
    for (let k = 0; k <= around; k++) {
      const a = (k / around) * Math.PI * 2;
      const ny = Math.cos(a), nz = Math.sin(a);
      pos.push(cx, cy + ny * r, cz + nz * r * 0.55);
      nor.push(0, ny, nz);
      uv.push(t, k / around);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < around; k++) {
      const a = i * (around + 1) + k, b = a + around + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
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
export const MOODS = {
  neutral:   { smileSmall: 0.22 },
  happy:     { smileBig: 0.72, smileSmall: 0.5, eyeSquint: 0.34, browRaise: 0.20, blush: 0.28, jawOpen: 0.10 },
  giggle:    { smileBig: 1.0, eyeSquint: 0.78, browRaise: 0.30, jawOpen: 0.30, blush: 0.45, noseWrinkle: 0.25 },
  sad:       { browSad: 0.85, mouthFrown: 0.70, lidLower: 0.30, chinRaise: 0.25, headTilt: -0.4 },
  cry:       { browSad: 1.0, mouthCry: 1.0, jawOpen: 0.62, lidClose: 0.80, tears: 1.0, noseWrinkle: 0.40, blush: 0.55, cheekPuff: 0.10 },
  sleepy:    { sleepSoft: 0.75, lidLower: 0.72, browRaise: 0.12, jawOpen: 0.08, headTilt: 0.25 },
  asleep:    { sleepSoft: 1.0, lidClose: 1.0, jawOpen: 0.14, smileSmall: 0.18, blush: 0.22 },
  surprised: { eyeWide: 1.0, browRaise: 0.95, jawOpen: 0.45, lipsPurse: 0.30 },
  sulk:      { sulk: 1.0, browFurrow: 0.45, mouthPout: 0.45, lidLower: 0.22, headTilt: 0.3 },
  shy:       { smileSmall: 0.55, eyeSquint: 0.30, lidLower: 0.38, blush: 1.0, chinRaise: 0.30, headTilt: 0.35 },
  excited:   { smileBig: 0.85, eyeWide: 0.70, browRaise: 0.75, jawOpen: 0.42, blush: 0.35 },
  yum:       { smileSmall: 0.60, eyeSquint: 0.55, lipsPurse: 0.45, cheekPuff: 0.30, blush: 0.20, noseWrinkle: 0.15 }
};

/* ------------------------------------------------------------------ Face -- */

export class Face {
  constructor({ tier = 2, headGeometry } = {}) {
    this.tier = tier;
    this.headGeometry = headGeometry;
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
    this._blinkT = this._nextBlinkInterval();
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
    this.corneaMat = MAT.makeCornea();
    this.skinMat = null;                          // injected by Baby.build()

    const eyeGeo = new THREE.SphereGeometry(FACE.eyeR, this.tier >= 2 ? 22 : 16, this.tier >= 2 ? 16 : 12);
    // The iris texture is laid out on a flat square, so rotate the sphere's
    // pole to face forward — that puts the pupil dead centre of the cornea.
    eyeGeo.rotateX(-Math.PI / 2);
    const corneaGeo = new THREE.SphereGeometry(FACE.lidR * 0.985, 16, 10,
      0, Math.PI * 2, 0, Math.PI * 0.42);
    corneaGeo.rotateX(Math.PI / 2);

    const lidSegs = this.tier >= 2 ? 22 : 15;
    const lidGeo = lidGeometry(FACE.lidR, LID_HALF, lidSegs, 6);
    // the lid shares the skin material, which samples aZone; without the
    // attribute WebGL would feed it (0,0,0,1) and dirt would land on eyelids
    lidGeo.setAttribute('aZone', new THREE.BufferAttribute(
      new Float32Array(lidGeo.attributes.position.count * 4), 4));
    const lashGeo = lashGeometry(FACE.lidR, LID_HALF, lidSegs);

    this.lashMat = MAT.makeLash({ color: 0x4b3428 });
    this.browMat = MAT.makeLash({ color: 0x9a6f4e, opacity: 0.94 });

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
      // guaranteed specular hit the eyes read as buttons.
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.0062, 0.0062), MAT.makeCatchlight());
      cl.position.set(-0.0052 * s, 0.0055, FACE.lidR * 0.97);
      cl.renderOrder = 5;
      pivot.add(cl);
      const cl2 = cl.clone();
      cl2.material = cl.material.clone();
      cl2.material.opacity = 0.30;
      cl2.scale.setScalar(0.55);
      cl2.position.set(0.0060 * s, -0.0040, FACE.lidR * 0.97);
      pivot.add(cl2);

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

      const brow = new THREE.Mesh(browGeometry(FACE.browHalf, 0.0042, 12), this.browMat);
      const browPivot = new THREE.Object3D();
      browPivot.position.set(FACE.brow[0] * s, FACE.brow[1], FACE.brow[2]);
      browPivot.rotation.z = -0.10 * s;
      browPivot.add(brow);
      this.group.add(browPivot);
      this.brows.push({ pivot: browPivot, s, rest: browPivot.position.clone(), restRot: -0.10 * s });

      this.eyes.push({ s, pivot, ball, cornea, upper, lower, upperMesh: um, lowerMesh: lm, catch: cl, catch2: cl2 });
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
    grp.position.set(FACE.mouth[0], FACE.mouth[1], FACE.mouth[2] - 0.0165);
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

  _buildBlush() {
    const mat = MAT.makeBlush();
    this.blushMat = mat;
    this.blush = [];
    // curved caps so the blush hugs the cheek instead of floating on a card
    const geo = new THREE.SphereGeometry(0.062, 18, 12, 0, Math.PI * 2, 0, 0.32);
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(FACE.cheek[0] * s * 0.20, FACE.cheek[1] - 0.0530, FACE.cheek[2] - 0.0555);
      m.lookAt(new THREE.Vector3(FACE.cheek[0] * s * 3.2, FACE.cheek[1] - 0.010, FACE.cheek[2] + 0.09));
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
      new THREE.Vector3(0.0175 * s, 0.5245, 0.0625),
      new THREE.Vector3(0.0245 * s, 0.5110, 0.0640),
      new THREE.Vector3(0.0330 * s, 0.4960, 0.0605),
      new THREE.Vector3(0.0385 * s, 0.4805, 0.0510),
      new THREE.Vector3(0.0400 * s, 0.4680, 0.0400)
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
    // shifted log-normal: mostly 2–4 s with a long tail, like the real thing
    const u1 = Math.random() || 1e-6, u2 = Math.random();
    const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return 1.15 + Math.exp(0.42 + n * 0.55);
  }

  blink(double = Math.random() < 0.13) {
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
    this.lookTarget = worldPos ? worldPos.clone() : null;
    if (worldPos) this._saccadeIn = 0;
  }

  _updateGaze(dt) {
    const head = this._headBone;
    if (!head) return;
    let localTarget;
    if (this.lookTarget) {
      localTarget = this.lookTarget.clone();
      head.worldToLocal(localTarget);
    } else {
      // idle wander: infants scan in short hops with long fixations
      this._saccadeIn -= dt;
      if (this._saccadeIn <= 0) {
        this._saccadeIn = 0.9 + Math.random() * 2.6;
        this._idlePoint.set(
          (Math.random() - 0.5) * 0.55,
          P.eyeY + (Math.random() - 0.35) * 0.28,
          0.55 + Math.random() * 0.5
        );
      }
      localTarget = this._idlePoint.clone();
      head.worldToLocal(this.group.localToWorld(localTarget));
    }

    // per-eye vergence: each eye aims at the point itself
    for (const e of this.eyes) {
      const p = e.pivot.position;
      const dx = localTarget.x - p.x, dy = localTarget.y - p.y, dz = Math.max(0.05, localTarget.z - p.z);
      let yaw = Math.atan2(dx, dz);
      let pitch = Math.atan2(dy, Math.hypot(dx, dz));
      yaw = THREE.MathUtils.clamp(yaw, -0.62, 0.62);
      pitch = THREE.MathUtils.clamp(pitch, -0.42, 0.40);
      e.goalYaw = yaw; e.goalPitch = pitch;
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

  /* ------------------------------------------------------------ update --- */

  update(dt, ctx) {
    this._t += dt;
    this._updateBlink(dt);
    this._updateGaze(dt);

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
    // lidClose from mood, blink, and a lid-follows-gaze term
    const gazeLid = -(this.gazePitch || 0) * 0.55;
    for (const e of this.eyes) {
      const close = clamp01(Math.max(this._blinkAmount, val('lidClose')) + val('lidLower') * 0.55 + gazeLid * 0.4);
      const squint = val('eyeSquint') * 0.30 + val('mouthCry') * 0.25;
      const wide = val('eyeWide');
      // Lids are hemispherical caps of half-angle LID_HALF. Solve directly for
      // where each lid's *edge* should cross the front of the eye (measured in
      // degrees from straight up) and back out the pivot angle — far easier to
      // reason about than raw rotations, and it makes the aperture explicit.
      const upEdge = THREE.MathUtils.lerp(62 - wide * 8 + squint * 7, 100, close);
      const loEdge = THREE.MathUtils.lerp(119 + wide * 5, 96, close * 0.62 + squint * 0.85);
      e.upper.rotation.x = (upEdge - LID_HALF_DEG) * DEG + (this.gazePitch || 0) * 0.30;
      e.lower.rotation.x = (loEdge - 180 + LID_HALF_DEG) * DEG + (this.gazePitch || 0) * 0.10;
      e.upper.rotation.z = e.s * (val('browSad') * 0.10 - val('browFurrow') * 0.08);
      const vis = close < 0.985;
      e.cornea.visible = vis;
      e.catch.visible = vis && close < 0.6;
      e.catch2.visible = e.catch.visible;
    }

    /* -- brows ------------------------------------------------------------- */
    for (const b of this.brows) {
      const raise = val('browRaise') - val('browFurrow') * 0.8;
      const sad = val('browSad');
      const inner = sad * 0.5 - val('browFurrow') * 0.4;
      b.pivot.position.set(
        b.rest.x + (val('browFurrow') * -0.0035) * b.s,
        b.rest.y + raise * 0.0090 + sad * 0.0018 - val('sleepSoft') * 0.0020,
        b.rest.z + raise * 0.0012);
      b.pivot.rotation.z = b.restRot + b.s * (inner * 0.42 + val('browRaise') * -0.06);
      b.pivot.scale.set(1 + val('browFurrow') * -0.06, 1 + raise * 0.10, 1);
    }

    /* -- mouth ------------------------------------------------------------- */
    const open = clamp01(val('jawOpen') + val('yawnWide') * 1.5 + val('mouthCry') * 0.35);
    const g = this.mouthGroup;
    const wide = clamp01(val('smileBig') * 0.9 + val('mouthCry'));
    g.visible = open > 0.02;
    g.scale.set(
      0.62 + wide * 0.55 + open * 0.30,
      0.30 + open * 1.35,
      0.55 + open * 0.60);
    g.position.y = FACE.mouth[1] - open * 0.0135;
    g.position.z = FACE.mouth[2] - 0.0165 - open * 0.0060;
    this.tongue.position.y = -0.0072 - open * 0.0030 + (ov.tongue || 0) * 0.004;
    this.tongue.position.z = 0.0055 + (ov.tongue || 0) * 0.020;
    this.teeth.visible = open > 0.25 && this.mood !== 'cry';

    /* -- cheeks / blush ---------------------------------------------------- */
    this.blushMat.opacity = val('blush') * 0.58;
    for (const m of this.blush) m.visible = this.blushMat.opacity > 0.01;

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
        free.r = 0.0016 + Math.random() * 0.0012;
        free.mesh.visible = true;
      }
      this._tearSpawn = 0.55 + Math.random() * 0.7;
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
