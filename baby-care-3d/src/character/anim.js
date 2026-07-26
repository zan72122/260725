/* ============================================================================
 * anim.js — pose library, gesture library and procedural motion
 * ----------------------------------------------------------------------------
 * There are no keyframe tables here. Poses are static bone targets; everything
 * that gives the baby life is generated:
 *
 *   • Pose blending runs through a slightly *under*-damped spring per bone, so
 *     limbs overshoot and settle instead of sliding linearly into place.
 *   • A breathing layer drives chest and belly, always, in every pose.
 *   • A weight-shift + micro-motion layer means the baby is never once
 *     perfectly still, which is the single biggest tell of a dead character.
 *   • Head lag: the neck resists the chest's angular velocity, so the head
 *     trails the body by a frame or two the way a heavy infant head really does.
 *   • Soft-region springs (belly, cheeks) respond to root acceleration.
 * ========================================================================== */

import * as THREE from 'three';

const D = Math.PI / 180;

/* --------------------------------------------------------------- poses ---- */

/**
 * Bone-local Euler targets, radians. `_root` carries the whole-body offset.
 * Sides are written out rather than mirrored so each pose can be asymmetric.
 */
export const POSES = {
  stand: {
    _root: { y: 0, rx: 0 },
    spine: [0.02, 0, 0], chest: [-0.04, 0, 0], neck: [0.02, 0, 0], head: [0, 0, 0],
    shoulderL: [0, 0, 0.05], shoulderR: [0, 0, -0.05],
    armL: [-0.10, 0, 0.13], armR: [-0.10, 0, -0.13],
    forearmL: [-0.32, 0, 0.10], forearmR: [-0.32, 0, -0.10],
    handL: [-0.10, 0, 0], handR: [-0.10, 0, 0],
    thighL: [-0.07, 0, -0.07], thighR: [-0.07, 0, 0.07],
    shinL: [0.16, 0, 0], shinR: [0.16, 0, 0],
    footL: [-0.09, 0, 0], footR: [-0.09, 0, 0]
  },
  sit: {
    _root: { y: -0.1870, rx: 0 },
    hips: [-0.30, 0, 0], spine: [0.14, 0, 0], chest: [0.06, 0, 0],
    neck: [-0.06, 0, 0], head: [-0.04, 0, 0],
    shoulderL: [0, 0, 0.10], shoulderR: [0, 0, -0.10],
    armL: [-0.24, 0, 0.30], armR: [-0.24, 0, -0.30],
    forearmL: [-0.55, 0.10, 0.18], forearmR: [-0.55, -0.10, -0.18],
    handL: [-0.30, 0, 0], handR: [-0.30, 0, 0],
    thighL: [-1.48, 0.10, -0.30], thighR: [-1.48, -0.10, 0.30],
    shinL: [0.42, 0, 0.10], shinR: [0.42, 0, -0.10],
    footL: [-0.30, 0, 0], footR: [-0.30, 0, 0]
  },
  lie: {
    _root: { y: 0.0780, rx: -Math.PI / 2 },
    hips: [0.05, 0, 0], spine: [-0.04, 0, 0], chest: [-0.06, 0, 0],
    neck: [0.10, 0, 0], head: [0.12, 0, 0],
    shoulderL: [0, 0, 0.16], shoulderR: [0, 0, -0.16],
    armL: [-0.30, 0, 0.62], armR: [-0.30, 0, -0.62],
    forearmL: [-0.70, 0, 0.30], forearmR: [-0.70, 0, -0.30],
    handL: [-0.25, 0, 0], handR: [-0.25, 0, 0],
    thighL: [-0.52, 0.16, -0.40], thighR: [-0.52, -0.16, 0.40],
    shinL: [0.92, 0, 0], shinR: [0.92, 0, 0],
    footL: [-0.15, 0, 0], footR: [-0.15, 0, 0]
  },
  sleep: {
    _root: { y: 0.0780, rx: -Math.PI / 2 },
    hips: [0.03, 0, 0], spine: [-0.02, 0, 0], chest: [-0.04, 0, 0],
    neck: [0.06, 0, 0], head: [0.10, 0.28, 0],
    shoulderL: [0, 0, 0.20], shoulderR: [0, 0, -0.20],
    armL: [-0.15, 0, 0.95], armR: [-0.15, 0, -0.95],
    forearmL: [-1.05, 0, 0.35], forearmR: [-1.05, 0, -0.35],
    handL: [-0.20, 0, 0], handR: [-0.20, 0, 0],
    thighL: [-0.30, 0.30, -0.62], thighR: [-0.30, -0.30, 0.62],
    shinL: [0.62, 0, 0], shinR: [0.62, 0, 0],
    footL: [-0.10, 0, 0], footR: [-0.10, 0, 0]
  },
  crawl: {
    _root: { y: -0.1450, rx: 1.02 },
    hips: [-0.14, 0, 0], spine: [-0.20, 0, 0], chest: [-0.26, 0, 0],
    neck: [-0.34, 0, 0], head: [-0.52, 0, 0],
    shoulderL: [0, 0, 0.06], shoulderR: [0, 0, -0.06],
    armL: [-1.18, 0, 0.16], armR: [-1.18, 0, -0.16],
    forearmL: [-0.14, 0, 0.06], forearmR: [-0.14, 0, -0.06],
    handL: [0.62, 0, 0], handR: [0.62, 0, 0],
    thighL: [-1.32, 0.08, -0.44], thighR: [-1.32, -0.08, 0.44],
    shinL: [1.48, 0, 0], shinR: [1.48, 0, 0],
    footL: [-0.42, 0, 0], footR: [-0.42, 0, 0]
  },
  stand_up: null,   // alias filled below
  held: {
    _root: { y: 0, rx: -0.10 },
    hips: [0.06, 0, 0], spine: [-0.06, 0, 0], chest: [-0.05, 0, 0],
    neck: [0.04, 0, 0], head: [0.02, 0, 0],
    shoulderL: [0, 0, 0.12], shoulderR: [0, 0, -0.12],
    armL: [-0.55, 0, 0.34], armR: [-0.55, 0, -0.34],
    forearmL: [-0.95, 0, 0.22], forearmR: [-0.95, 0, -0.22],
    handL: [-0.35, 0, 0], handR: [-0.35, 0, 0],
    thighL: [-0.78, 0.10, -0.30], thighR: [-0.78, -0.10, 0.30],
    shinL: [0.88, 0, 0], shinR: [0.88, 0, 0],
    footL: [-0.20, 0, 0], footR: [-0.20, 0, 0]
  },
  bathe: {
    _root: { y: -0.1780, rx: 0 },
    hips: [-0.22, 0, 0], spine: [0.10, 0, 0], chest: [0.02, 0, 0],
    neck: [-0.04, 0, 0], head: [-0.02, 0, 0],
    shoulderL: [0, 0, 0.16], shoulderR: [0, 0, -0.16],
    armL: [-0.34, 0, 0.60], armR: [-0.34, 0, -0.60],
    forearmL: [-0.48, 0, 0.24], forearmR: [-0.48, 0, -0.24],
    handL: [-0.20, 0, 0], handR: [-0.20, 0, 0],
    thighL: [-1.34, 0.14, -0.46], thighR: [-1.34, -0.14, 0.46],
    shinL: [0.58, 0, 0.12], shinR: [0.58, 0, -0.12],
    footL: [-0.24, 0, 0], footR: [-0.24, 0, 0]
  }
};
POSES.stand_up = POSES.stand;

/* ------------------------------------------------------------ gestures ---- */

/**
 * Each gesture writes *additive* bone offsets into `out` and optional face
 * overlays into `face`. `k` is 0..1 normalised time, `t` is seconds elapsed.
 */
export const GESTURES = {
  wave: {
    dur: 1.9, arm: 'R',
    fn(k, t, out, face) {
      const env = Math.sin(Math.min(1, k * 3.2) * Math.PI / 2) * Math.sin(Math.min(1, (1 - k) * 4) * Math.PI / 2);
      out.armR = [-0.25 * env, 0, -1.55 * env];
      out.forearmR = [0, 0, -0.55 * env + Math.sin(t * 13) * 0.55 * env];
      out.handR = [0, 0, Math.sin(t * 13 + 0.6) * 0.30 * env];
      face.smileBig = 0.45 * env;
    }
  },
  clap: {
    dur: 1.7,
    fn(k, t, out, face) {
      const env = Math.min(1, k * 5) * Math.min(1, (1 - k) * 5);
      const c = Math.abs(Math.sin(t * 9.5));
      out.armL = [-1.05 * env, 0, (0.95 - c * 0.42) * env];
      out.armR = [-1.05 * env, 0, -(0.95 - c * 0.42) * env];
      out.forearmL = [-0.85 * env, 0, 0.35 * env];
      out.forearmR = [-0.85 * env, 0, -0.35 * env];
      face.smileBig = 0.6 * env; face.jawOpen = 0.2 * env * c;
    }
  },
  point: {
    dur: 2.1,
    fn(k, t, out, face) {
      const env = Math.sin(Math.min(1, k * 4) * Math.PI / 2) * Math.min(1, (1 - k) * 4);
      out.armR = [-1.32 * env, 0, -0.42 * env];
      out.forearmR = [-0.16 * env, 0, -0.10 * env];
      out.handR = [-0.20 * env, 0, 0];
      out.neck = [-0.08 * env, -0.10 * env, 0];
      face.browRaise = 0.4 * env; face.jawOpen = 0.18 * env;
    }
  },
  reach: {
    dur: 1.6,
    fn(k, t, out, face) {
      const env = Math.sin(Math.min(1, k * 3) * Math.PI / 2) * Math.min(1, (1 - k) * 3);
      const grab = Math.max(0, Math.sin(t * 6)) * env;
      out.armL = [-1.35 * env, 0, 0.30 * env];
      out.armR = [-1.35 * env, 0, -0.30 * env];
      out.forearmL = [-0.30 * env, 0, 0.10 * env];
      out.forearmR = [-0.30 * env, 0, -0.10 * env];
      out.handL = [-0.30 * grab, 0, 0]; out.handR = [-0.30 * grab, 0, 0];
      face.jawOpen = 0.25 * env; face.eyeWide = 0.35 * env;
    }
  },
  'rub-eyes': {
    dur: 2.3,
    fn(k, t, out, face) {
      const env = Math.min(1, k * 4) * Math.min(1, (1 - k) * 4);
      const w = Math.sin(t * 11);
      out.armL = [-1.62 * env, 0, 0.95 * env];
      out.armR = [-1.62 * env, 0, -0.95 * env];
      out.forearmL = [-1.45 * env, 0, 0.42 * env + w * 0.10 * env];
      out.forearmR = [-1.45 * env, 0, -0.42 * env - w * 0.10 * env];
      out.handL = [w * 0.28 * env, 0, 0]; out.handR = [-w * 0.28 * env, 0, 0];
      face.lidLower = 0.85 * env; face.browSad = 0.25 * env; face.sleepSoft = 0.5 * env;
    }
  },
  yawn: {
    dur: 2.6,
    fn(k, t, out, face) {
      const env = Math.sin(Math.min(1, k * 2.4) * Math.PI / 2) * Math.min(1, (1 - k) * 2.6);
      const wide = Math.sin(Math.min(1, k * 1.8) * Math.PI) ** 0.7;
      out.neck = [-0.28 * env, 0, 0];
      out.armL = [-0.35 * env, 0, 0.62 * env];
      out.armR = [-0.35 * env, 0, -0.62 * env];
      out.chest = [-0.10 * env, 0, 0];
      face.yawnWide = wide; face.lidClose = 0.55 * wide; face.browRaise = 0.3 * wide;
    }
  },
  kick: {
    dur: 1.8,
    fn(k, t, out, face) {
      const env = Math.min(1, k * 5) * Math.min(1, (1 - k) * 5);
      const a = Math.sin(t * 8.5), b = Math.sin(t * 8.5 + Math.PI);
      out.thighL = [-0.55 * a * env, 0, 0]; out.thighR = [-0.55 * b * env, 0, 0];
      out.shinL = [0.45 * Math.max(0, -a) * env, 0, 0];
      out.shinR = [0.45 * Math.max(0, -b) * env, 0, 0];
      face.smileBig = 0.35 * env; face.jawOpen = 0.18 * env;
    }
  },
  suck: {
    dur: 3.0,
    fn(k, t, out, face) {
      const env = Math.min(1, k * 4) * Math.min(1, (1 - k) * 4);
      const s = (Math.sin(t * 7.5) * 0.5 + 0.5);
      out.armR = [-1.55 * env, 0, -0.60 * env];
      out.forearmR = [-1.30 * env, 0, -0.55 * env];
      out.handR = [-0.45 * env, 0, 0];
      face.cheekSuck = s * 0.75 * env; face.lipsPurse = (0.55 + s * 0.3) * env;
      face.eyeSquint = 0.20 * env;
    }
  },
  burp: {
    dur: 1.3,
    fn(k, t, out, face) {
      const pop = Math.exp(-Math.pow((k - 0.35) * 6, 2));
      out.chest = [-0.16 * pop, 0, 0];
      out.neck = [-0.22 * pop, 0, 0];
      out.spine = [0.10 * pop, 0, 0];
      face.jawOpen = 0.75 * pop; face.eyeWide = 0.5 * pop; face.browRaise = 0.45 * pop;
    }
  },
  shiver: {
    dur: 2.2, shake: 1,
    fn(k, t, out, face) {
      const env = Math.min(1, k * 5) * Math.min(1, (1 - k) * 5);
      const q = Math.sin(t * 34) * env;
      out.spine = [0.05 * env, q * 0.030, 0];
      out.chest = [0.06 * env, -q * 0.026, 0];
      out.neck = [0, q * 0.040, 0];
      out.armL = [-0.30 * env, 0, 0.50 * env + q * 0.05];
      out.armR = [-0.30 * env, 0, -0.50 * env - q * 0.05];
      out.forearmL = [-1.10 * env, 0, 0.30 * env];
      out.forearmR = [-1.10 * env, 0, -0.30 * env];
      face.browSad = 0.4 * env; face.mouthFrown = 0.3 * env; face.eyeSquint = 0.3 * env;
    }
  },
  hiccup: {
    dur: 0.75,
    fn(k, t, out, face) {
      const pop = Math.exp(-Math.pow((k - 0.18) * 9, 2));
      out.spine = [-0.14 * pop, 0, 0];
      out.chest = [-0.10 * pop, 0, 0];
      out.neck = [-0.20 * pop, 0, 0];
      out.armL = [0, 0, 0.16 * pop]; out.armR = [0, 0, -0.16 * pop];
      face.jawOpen = 0.55 * pop; face.eyeWide = 0.7 * pop; face.browRaise = 0.6 * pop;
    }
  }
};

/* ---------------------------------------------------------------- noise --- */

function hash1(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth 1-D value noise, used for the fidget layer. */
function noise1(t, seed) {
  const i = Math.floor(t), f = t - i;
  const a = hash1(i + seed * 7919), b = hash1(i + 1 + seed * 7919);
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2 - 1;
}

/* --------------------------------------------------------------- spring --- */

class Spring3 {
  constructor(zeta = 0.72) { this.v = [0, 0, 0]; this.x = [0, 0, 0]; this.zeta = zeta; }
  step(target, dt, freq) {
    const w = 2 * Math.PI * freq;
    const k = w * w, c = 2 * this.zeta * w;
    for (let i = 0; i < 3; i++) {
      const a = (target[i] - this.x[i]) * k - this.v[i] * c;
      this.v[i] += a * dt;
      this.x[i] += this.v[i] * dt;
    }
    return this.x;
  }
  snap(target) { this.x[0] = target[0]; this.x[1] = target[1]; this.x[2] = target[2]; this.v[0] = this.v[1] = this.v[2] = 0; }
}

/* ------------------------------------------------------------- Animator --- */

const ZERO = [0, 0, 0];

export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.t = 0;
    this.poseName = 'sit';
    this.loop = true;

    this.springs = {};
    for (const b of rig.order) this.springs[b.name] = new Spring3(0.70);
    this.rootSpring = new Spring3(0.85);
    this.rootPos = new THREE.Vector3();
    this.rootPosV = new THREE.Vector3();

    this.freq = 2.2;                       // pose blend speed (Hz)
    this.gestures = [];
    this.faceOverlay = {};
    this._gOut = {};

    // secondary-motion springs
    this.headLag = { x: 0, y: 0, vx: 0, vy: 0 };
    this.belly = { x: 0, v: 0 };
    this.cheek = { x: 0, v: 0 };
    this._prevRootY = 0;
    this._prevRootV = 0;
    this._chestPrev = new THREE.Quaternion();

    this.cycle = 0;                        // crawl phase
    this.crawlSpeed = 1.0;
    this.energy = 1.0;                     // scales micro-motion; 0 when asleep

    this._applyPose(POSES.sit, true);
  }

  /* --------------------------------------------------------------- API --- */

  playPose(name, { seconds = 0.7, loop = true } = {}) {
    if (!POSES[name]) return;
    this.poseName = name;
    this.loop = loop;
    this.freq = THREE.MathUtils.clamp(1 / Math.max(0.12, seconds) * 1.35, 0.5, 8);
  }

  gesture(name) {
    const def = GESTURES[name];
    if (!def) return false;
    // a repeated gesture restarts rather than stacking
    const ex = this.gestures.find(g => g.name === name);
    if (ex) { ex.t = 0; return true; }
    this.gestures.push({ name, def, t: 0 });
    return true;
  }

  isGesturing(name) {
    return name ? this.gestures.some(g => g.name === name) : this.gestures.length > 0;
  }

  clearGestures() { this.gestures.length = 0; }

  /* ------------------------------------------------------------ update --- */

  _applyPose(pose, snap) {
    for (const b of this.rig.order) {
      const t = pose[b.name] || ZERO;
      if (snap) this.springs[b.name].snap(t);
    }
    if (snap) {
      const r = pose._root || { y: 0, rx: 0 };
      this.rootSpring.snap([r.rx || 0, 0, 0]);
      this.rootPos.set(0, r.y || 0, r.z || 0);
    }
  }

  update(dt, ctx) {
    this.t += dt;
    const rig = this.rig;
    const pose = POSES[this.poseName] || POSES.sit;
    const t = this.t;
    const E = this.energy;

    /* --- gestures: collect additive offsets ------------------------------ */
    const add = this._gOut;
    for (const k in add) delete add[k];
    for (const k in this.faceOverlay) delete this.faceOverlay[k];
    for (let i = this.gestures.length - 1; i >= 0; i--) {
      const g = this.gestures[i];
      g.t += dt;
      const k = g.t / g.def.dur;
      if (k >= 1) { this.gestures.splice(i, 1); continue; }
      const tmp = {};
      g.def.fn(k, g.t, tmp, this.faceOverlay);
      for (const bn in tmp) {
        const a = add[bn] || (add[bn] = [0, 0, 0]);
        a[0] += tmp[bn][0]; a[1] += tmp[bn][1]; a[2] += tmp[bn][2];
      }
    }

    /* --- crawl cycle ------------------------------------------------------ */
    let cyc = null;
    if (this.poseName === 'crawl') {
      this.cycle += dt * 1.55 * this.crawlSpeed;
      cyc = this._crawl(this.cycle);
    }

    /* --- per-bone spring toward pose + additive layers -------------------- */
    const bt = rig.table;
    for (let i = 0; i < bt.length; i++) {
      const def = bt[i];
      const bone = rig.bones[def.name];
      if (def.mask === 'joint') continue;             // helpers are derived
      const base = pose[def.name] || ZERO;
      const a = add[def.name];
      const c = cyc && cyc[def.name];
      const micro = this._micro(def.name, t, i) * E;
      const target = [
        base[0] + (a ? a[0] : 0) + (c ? c[0] : 0) + micro,
        base[1] + (a ? a[1] : 0) + (c ? c[1] : 0) + micro * 0.6,
        base[2] + (a ? a[2] : 0) + (c ? c[2] : 0) + micro * 0.8
      ];
      const s = this.springs[def.name].step(target, dt, this.freq * (a || c ? 1.9 : 1));
      bone.rotation.set(s[0], s[1], s[2]);
    }

    /* --- breathing -------------------------------------------------------- */
    // chest expands, belly follows a beat later; slower and deeper asleep
    const rate = this.poseName === 'sleep' || this.energy < 0.35 ? 0.42 : 0.75;
    const br = Math.sin(t * Math.PI * 2 * rate);
    const br2 = Math.sin(t * Math.PI * 2 * rate - 0.6);
    const chest = rig.bones.chest;
    chest.scale.set(1 + br * 0.020, 1 + br * 0.009, 1 + br * 0.026);
    rig.bones.spine.scale.set(1 + br2 * 0.010, 1, 1 + br2 * 0.014);
    chest.rotation.x += br * 0.014;

    /* --- weight shift + idle bounce -------------------------------------- */
    const r = pose._root || { y: 0, rx: 0 };
    const swayX = noise1(t * 0.22, 3) * 0.0055 * E;
    const swayZ = noise1(t * 0.19, 8) * 0.0035 * E;
    const bob = this.poseName === 'crawl'
      ? Math.abs(Math.sin(this.cycle * Math.PI)) * 0.010
      : Math.sin(t * Math.PI * 2 * rate) * 0.0016 * E;
    const targetY = (r.y || 0) + bob;
    this.rootPos.x += (swayX - this.rootPos.x) * Math.min(1, dt * 3);
    this.rootPos.z += ((r.z || 0) + swayZ - this.rootPos.z) * Math.min(1, dt * 3);
    const prevY = this.rootPos.y;
    this.rootPos.y += (targetY - this.rootPos.y) * Math.min(1, dt * 8);
    const rootAcc = ((this.rootPos.y - prevY) / Math.max(1e-4, dt) - this._prevRootV) / Math.max(1e-4, dt);
    this._prevRootV = (this.rootPos.y - prevY) / Math.max(1e-4, dt);

    const rrot = this.rootSpring.step([r.rx || 0, noise1(t * 0.16, 12) * 0.020 * E, noise1(t * 0.13, 19) * 0.016 * E], dt, this.freq);
    rig.bones.root.position.copy(this.rootPos);
    rig.bones.root.rotation.set(rrot[0], rrot[1], rrot[2]);

    /* --- head lag --------------------------------------------------------- */
    // The neck resists the chest's angular velocity: a heavy infant head is
    // always a beat behind the shoulders.
    chest.updateWorldMatrix(true, false);
    const q = new THREE.Quaternion().setFromRotationMatrix(chest.matrixWorld);
    const dq = q.clone().multiply(this._chestPrev.clone().invert());
    const e = new THREE.Euler().setFromQuaternion(dq, 'XYZ');
    this._chestPrev.copy(q);
    const lag = this.headLag;
    const wx = -e.x / Math.max(1e-4, dt), wy = -e.y / Math.max(1e-4, dt);
    lag.vx += (wx * 0.055 - lag.x * 42 - lag.vx * 8.5) * dt;
    lag.vy += (wy * 0.055 - lag.y * 42 - lag.vy * 8.5) * dt;
    lag.x += lag.vx * dt; lag.y += lag.vy * dt;
    const neck = rig.bones.neck;
    neck.rotation.x += THREE.MathUtils.clamp(lag.x, -0.22, 0.22);
    neck.rotation.y += THREE.MathUtils.clamp(lag.y, -0.22, 0.22);
    rig.bones.head.rotation.x += THREE.MathUtils.clamp(lag.x, -0.16, 0.16) * 0.6;

    /* --- soft-region springs (belly + cheeks) ----------------------------- */
    const stepSpring = (s, drive, k, c) => {
      s.v += (drive * k - s.x * k - s.v * c) * dt;
      s.x += s.v * dt;
      return s.x;
    };
    const jig = THREE.MathUtils.clamp(-rootAcc * 0.0016, -1, 1);
    const bj = stepSpring(this.belly, jig, 190, 12);
    rig.bones.belly.position.y = (rig.bones.belly.userData.rest?.y ?? rig.bones.belly.position.y);
    rig.bones.belly.position.z = (rig.bones.belly.userData.rest?.z ?? 0) + bj * 0.010;
    rig.bones.belly.scale.set(1 + bj * 0.06, 1 - bj * 0.05, 1 + bj * 0.07);
    this.cheekJiggle = stepSpring(this.cheek, jig, 320, 15);

    rig.update();
  }

  /** Small, slow, per-bone fidget so nothing is ever locked. */
  _micro(name, t, i) {
    if (name === 'root' || name === 'belly') return 0;
    const amp = name.startsWith('hand') || name.startsWith('foot') ? 0.030
      : name.startsWith('forearm') || name.startsWith('shin') ? 0.024
        : name === 'head' || name === 'neck' ? 0.016 : 0.013;
    return (noise1(t * 0.55 + i * 3.7, i + 1) * 0.7 + noise1(t * 1.6 + i * 1.3, i + 40) * 0.3) * amp;
  }

  /**
   * Infant crawl: contralateral (left hand with right knee), bottom up and
   * rocking side to side, head bobbing and lifting on the reach.
   */
  _crawl(c) {
    const p = c * Math.PI * 2;
    const a = Math.sin(p), b = Math.sin(p + Math.PI);
    const lift = x => Math.max(0, x);
    const o = {};
    o.armL = [-0.55 * a, 0, 0];
    o.armR = [-0.55 * b, 0, 0];
    o.forearmL = [-0.30 * lift(a), 0, 0];
    o.forearmR = [-0.30 * lift(b), 0, 0];
    o.handL = [-0.40 * lift(a), 0, 0];
    o.handR = [-0.40 * lift(b), 0, 0];
    // contralateral: the leg that swings is opposite the arm
    o.thighL = [-0.42 * b, 0, 0.10 * lift(b)];
    o.thighR = [-0.42 * a, 0, -0.10 * lift(a)];
    o.shinL = [0.45 * lift(b), 0, 0];
    o.shinR = [0.45 * lift(a), 0, 0];
    // hips rock and rise; that bottom-in-the-air waddle is the whole charm
    o.hips = [-0.06 * Math.cos(p * 2), 0.13 * a, 0.10 * a];
    o.spine = [0.05 * Math.cos(p * 2), -0.06 * a, 0];
    o.chest = [0, -0.10 * a, -0.05 * a];
    o.neck = [-0.10 * Math.abs(a), 0.10 * a, 0];
    o.head = [-0.12 * Math.cos(p * 2 + 0.8), 0.12 * a, 0.06 * a];
    return o;
  }
}
