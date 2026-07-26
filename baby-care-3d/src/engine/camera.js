/* ============================================================================
 * camera.js — Cinematic camera rig
 * ----------------------------------------------------------------------------
 * Three things separate a "game camera" from a "film camera", and all three
 * live in this file:
 *
 *   1. Nothing moves linearly. Every dolly is a *critically damped spring*
 *      solved analytically, so the camera leans into a move and settles
 *      without overshoot — the curve a real dolly grip produces. Linear lerps
 *      read as robotic within two frames.
 *   2. Nothing is ever perfectly still. Layered seeded noise adds a few
 *      millimetres of handheld breathing to position *and* rotation. A
 *      locked-off frame reads as CGI; a hand on the camera reads as
 *      photography.
 *   3. Every preset carries its own lens — focal length *and* depth-of-field
 *      range — so a closeup gets genuinely shallow focus while the wide stays
 *      readable.
 *
 * Determinism: the screenshot harness calls `goTo(preset, 0)`, which snaps the
 * rig, freezes the handheld phase at t = 0 and cancels any shake, so two runs
 * produce identical pixels. `rig.still = true` does the same without moving.
 *
 * Framing note — presets are *subject-relative*. `pos`/`target` on a preset
 * whose `space` is `'subject'` are offsets in the subject's own frame
 * (position + yaw), resolved every frame against whatever `setSubject()` names
 * — by default the baby root. That is what lets one `face` preset frame the
 * baby on the rug, on the changing podium in front of the wardrobe and in the
 * highchair without three sets of hand-tuned world coordinates. Room framings
 * (`wide`, `title`) declare `space: 'world'` and stay absolute, because they
 * compose the *set*, not the character.
 *
 * `addPreset()` defaults to `'world'` so the documented contract keeps working
 * for callers that hand over an anchor's world position. Activities that want
 * a scoped override use `overridePreset()`, which `restorePresets()` undoes
 * when the activity is torn down.
 * ========================================================================== */

import * as THREE from 'three';

/* ------------------------------------------------------------- presets --- */

/**
 * pos/target are metres, fov is vertical degrees, focusRange feeds the grade
 * pass' DOF (smaller = shallower). `dof` scales the pass' overall blur
 * strength, `handheld` scales the breathing, `roll` the horizon wobble.
 *
 * For `space: 'subject'` presets the numbers read as: +X is the subject's
 * left, +Y is up from the subject's *origin* (a baby root sits on the floor),
 * +Z is the direction the subject faces. Compositions are built on thirds: the
 * look target sits above the subject's origin so the baby lands with headroom,
 * and is nudged laterally so nothing is dead-centre.
 */
const BUILTIN = {
  // Establishing shot. Adult eye height, gentle down-tilt, whole room reads.
  // Composes the set, so it stays in world space.
  wide: {
    space: 'world',
    pos: [2.05, 1.42, 2.85], target: [-0.10, 0.62, -0.05],
    fov: 40, focusRange: 0.50, dof: 0.80, handheld: 1.00, roll: 1.0
  },

  // General "look at what the baby is doing" framing, composed for a seated
  // baby (~0.40 m). Activities with a standing baby override it.
  closeup: {
    space: 'subject',
    pos: [0.46, 0.55, 0.78], target: [-0.03, 0.30, 0.00],
    fov: 34, focusRange: 0.14, dof: 1.20, handheld: 0.80, roll: 0.7
  },

  // Portrait. Eyes land on the upper third, crown ~14% down from the top
  // edge, and there is lateral room for a raised arm on either side.
  face: {
    space: 'subject',
    pos: [0.285, 0.465, 0.565], target: [-0.020, 0.315, 0.00],
    fov: 30, focusRange: 0.12, dof: 1.35, handheld: 0.55, roll: 0.5
  },

  // Looking down into the cot — the classic "checking on the baby" angle.
  // Composed around a baby *lying* on the mattress; sleep.js re-aims it at the
  // head so the cot's own geometry can never occlude the shot.
  crib: {
    space: 'subject',
    pos: [0.34, 0.52, -0.40], target: [0.02, 0.02, 0.02],
    fov: 36, focusRange: 0.16, dof: 1.15, handheld: 0.50, roll: 0.5
  },

  // Portrait of a sleeping baby, seen over the cot rail. The money shot.
  'crib-face': {
    space: 'subject',
    pos: [0.20, 0.34, -0.26], target: [0.00, -0.02, 0.03],
    fov: 32, focusRange: 0.11, dof: 1.30, handheld: 0.45, roll: 0.4
  },

  // Bath: kneeling beside the tub, tilted down over the rim.
  tub: {
    space: 'subject',
    pos: [0.50, 0.62, 0.80], target: [0.00, 0.20, 0.02],
    fov: 36, focusRange: 0.16, dof: 1.10, handheld: 0.70, roll: 0.7
  },

  // Highchair. Near eye-level with the baby so feeding feels face-to-face.
  table: {
    space: 'subject',
    pos: [0.40, 0.62, 0.86], target: [-0.03, 0.30, 0.02],
    fov: 34, focusRange: 0.16, dof: 1.00, handheld: 0.75, roll: 0.7
  },

  // Floor play — camera on the rug, looking very slightly *up* at the baby.
  // The low hero angle is what makes a 40 cm subject feel like the star.
  floor: {
    space: 'subject',
    pos: [0.86, 0.28, 1.06], target: [-0.04, 0.34, 0.00],
    fov: 42, focusRange: 0.24, dof: 0.90, handheld: 1.00, roll: 1.0
  },

  // Tidying / playmat: near top-down, reads the floor plane clearly.
  overhead: {
    space: 'subject',
    pos: [0.30, 1.60, 0.72], target: [0.00, 0.15, -0.02],
    fov: 42, focusRange: 0.35, dof: 0.80, handheld: 0.60, roll: 0.4
  },

  // Title card: long lens, subject well off-centre, heavy breathing.
  title: {
    space: 'world',
    pos: [1.62, 0.72, 1.86], target: [-0.22, 0.42, -0.12],
    fov: 28, focusRange: 0.16, dof: 1.30, handheld: 1.80, roll: 1.6
  }
};

/* --------------------------------------------------------------- noise --- */

/** Deterministic 32-bit hash → [0,1). Same construction as textures.js. */
function hash1(i, seed) {
  let h = (i | 0) * 374761393 + seed * 668265263;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 1-D value noise in [-1,1]. Cubic interpolation keeps it C1. */
function noise1(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i, seed), b = hash1(i + 1, seed);
  return (a + (b - a) * u) * 2 - 1;
}

/** Two octaves — the second one gives the tremor that a single sine lacks. */
function fnoise(x, seed) {
  return noise1(x, seed) * 0.72 + noise1(x * 2.37 + 11.3, seed + 977) * 0.28;
}

/**
 * Handheld noise for one channel, anchored so it reads exactly zero at t = 0.
 *
 * Each channel has its own constant `phase` to decorrelate it from the others,
 * so the anchor has to be the noise value *at that phase* — subtracting
 * fnoise(0) instead would leave a constant offset per channel. That costs one
 * cached lookup and buys two things: the rig starts from rest instead of
 * lurching on the first frame, and a harness snap (which freezes the phase at
 * t = 0) lands on *exactly* the framing the preset describes.
 *
 * Every seed is used with exactly one phase, so caching by seed is safe.
 */
const _n0 = new Map();
function hnoise(x, phase, seed) {
  let z = _n0.get(seed);
  if (z === undefined) { z = fnoise(phase, seed); _n0.set(seed, z); }
  return fnoise(x + phase, seed) - z;
}

/* -------------------------------------------------------------- spring --- */

/**
 * One step of an exactly-solved critically damped spring.
 *
 * The closed form is used rather than an integrator because it is
 * unconditionally stable: a 0.25 s dolly still behaves at a 10 fps frame time,
 * which matters because the harness steps at odd deltas.
 *
 * Returns [x, v].
 */
const _sp = [0, 0];
function springStep(x, v, goal, omega, h) {
  const d = x - goal;
  const e = Math.exp(-omega * h);
  const B = v + omega * d;
  _sp[0] = goal + (d + B * h) * e;
  _sp[1] = (v - B * omega * h) * e;
  return _sp;
}

/* ------------------------------------------------------------ scratch ---- */

const _v = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _look = new THREE.Vector3();

// subject-frame resolution scratch
const _sPos = new THREE.Vector3();
const _sQuat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _YAXIS = new THREE.Vector3(0, 1, 0);
const _gPos = new THREE.Vector3();
const _gTgt = new THREE.Vector3();

/* ------------------------------------------------------------- the rig --- */

export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {RenderPipeline} [pipeline] — optional; used only to drive the DOF
   *        strength per preset. The rig never imports the pipeline module.
   */
  constructor(camera, pipeline = null) {
    this.camera = camera;
    this.pipeline = pipeline;

    // --- subject ------------------------------------------------------------
    // Subject-space presets resolve against this transform. `defaultSubject`
    // is the baby root (app.js hands it over at boot); an activity can point
    // the rig at its own prop with setSubject() and drop back with
    // setSubject(null).
    this.defaultSubject = null;
    this.subject = null;
    this._subjectYaw = true;

    /** @type {Object<string, object>} */
    this.presets = {};
    /** Restore set: what `restorePresets()` puts back. */
    this._base = {};
    for (const name of Object.keys(BUILTIN)) this.addPreset(name, BUILTIN[name]);

    const first = this.presets.wide;
    this.presetName = 'wide';
    this.goal = first;

    // --- live (eased) state ------------------------------------------------
    this._resolve(first, _gPos, _gTgt);
    this.pos = _gPos.clone();
    this.target = _gTgt.clone();
    this.fov = first.fov;
    this.focus = first.focusRange;
    this.dof = first.dof;
    this.hh = first.handheld;
    this.rollScale = first.roll;

    // --- spring velocities -------------------------------------------------
    this._posV = new THREE.Vector3();
    this._tgtV = new THREE.Vector3();
    this._fovV = 0;
    this._focusV = 0;
    this._omega = 6 / 1.2;

    // --- handheld ----------------------------------------------------------
    this._t = 0;                 // handheld phase; frozen when `still`
    this._still = false;
    this._breathe = 1;           // global handheld multiplier (0 kills it)

    // --- parallax nudge ----------------------------------------------------
    this._nudge = new THREE.Vector2();
    this._nudgeCur = new THREE.Vector2();
    this.parallax = 0.075;       // metres at full deflection

    // --- shake -------------------------------------------------------------
    this._shakeAmp = 0;
    this._shakeT = 0;
    this._shakeDur = 0;

    // The pipeline's own DOF strength is the tier ceiling (tier 0 sets it to
    // 0). Presets scale *relative* to it so a low-end device stays sharp.
    this._baseDof = pipeline?.grade?.uniforms?.uDofStrength?.value ?? 1;

    this._applyToCamera(0);
  }

  /* ------------------------------------------------------------ presets -- */

  /**
   * Register or replace a framing. `pos`/`target` accept arrays or Vector3s so
   * an activity can hand over an anchor's world position directly.
   *
   * `space` defaults to `'world'` — absolute metres, which is what a caller
   * handing over an anchor position means. Pass `space: 'subject'` for offsets
   * resolved against the active subject's position + yaw.
   *
   * A preset added this way survives `restorePresets()`. Use
   * `overridePreset()` for a framing that belongs to one activity only.
   */
  addPreset(name, def = {}) {
    const p = _makePreset(def);
    this.presets[name] = p;
    this._base[name] = p;
    // Re-registering the preset we are currently sitting on should re-aim.
    if (this.presetName === name && this.goal) this.goal = p;
    return p;
  }

  /**
   * Register a framing for as long as the current activity is on screen.
   * `restorePresets()` puts the previous definition back — so an activity can
   * re-compose `face` or `tub` around its own props without permanently
   * clobbering the shot for everyone else.
   */
  overridePreset(name, def = {}) {
    const p = _makePreset(def);
    this.presets[name] = p;
    if (this.presetName === name && this.goal) this.goal = p;
    return p;
  }

  /** Drop every scoped override. Called by app.js between activities. */
  restorePresets() {
    this.presets = Object.assign(Object.create(null), this._base);
    const cur = this.presets[this.presetName];
    if (cur) this.goal = cur;
    return this;
  }

  /* ------------------------------------------------------------ subject -- */

  /**
   * The transform every `space:'subject'` preset is composed around. Set once
   * at boot to the baby root; an activity points it at its own root/anchor
   * while it owns the screen and calls `setSubject(null)` on the way out.
   *
   * Only the subject's *yaw* is used — a subject that pitches or rolls (a baby
   * lying down, a tipping prop) must never tip the horizon. `yaw: false` keeps
   * the offsets axis-aligned to the world for a subject whose facing is
   * meaningless.
   */
  setSubject(object3D, { yaw = true } = {}) {
    this.subject = object3D && object3D.isObject3D ? object3D : null;
    this._subjectYaw = yaw !== false;
    return this;
  }

  /** The fallback subject — app.js hands over the baby root at boot. */
  setDefaultSubject(object3D) {
    this.defaultSubject = object3D && object3D.isObject3D ? object3D : null;
    return this;
  }

  /** The Object3D subject-space presets are currently resolved against. */
  get activeSubject() { return this.subject || this.defaultSubject; }

  /** Write the subject's position + yaw into the module scratch. */
  _subjectFrame() {
    const s = this.activeSubject;
    if (!s) { _sPos.set(0, 0, 0); _sQuat.identity(); return; }
    s.updateWorldMatrix(true, false);
    s.getWorldPosition(_sPos);
    if (!this._subjectYaw) { _sQuat.identity(); return; }
    s.getWorldQuaternion(_sQuat);
    _euler.setFromQuaternion(_sQuat, 'YXZ');
    _sQuat.setFromAxisAngle(_YAXIS, _euler.y);
  }

  /** Resolve a preset's stored offsets into world-space pos/target. */
  _resolve(p, outPos, outTarget) {
    if (!p) return;
    if (p.space === 'world') {
      outPos.copy(p.pos);
      outTarget.copy(p.target);
      return;
    }
    this._subjectFrame();
    outPos.copy(p.pos).applyQuaternion(_sQuat).add(_sPos);
    outTarget.copy(p.target).applyQuaternion(_sQuat).add(_sPos);
  }

  /** World-space eye/aim the active preset resolves to right now. */
  resolved(out = { pos: new THREE.Vector3(), target: new THREE.Vector3() }) {
    this._resolve(this.goal, out.pos, out.target);
    return out;
  }

  /** The framing currently being approached (read-only convenience). */
  get preset() { return this.goal; }

  /** DOF range for the active preset — app.js feeds this to pipeline.focusOn. */
  get focusRange() { return this.focus; }

  /** Handheld on/off. The harness sets this to freeze the frame. */
  get still() { return this._still; }
  set still(v) {
    this._still = !!v;
    if (this._still) this._t = 0;      // deterministic frozen phase
  }

  /* --------------------------------------------------------------- move -- */

  /**
   * Dolly to a preset (by name) or to an inline framing object.
   *
   * `seconds <= 0` snaps: position, aim, lens and DOF jump to the goal, the
   * spring velocities are zeroed, any running shake is cancelled and the
   * handheld phase is pinned to 0. That combination is what makes the
   * screenshot harness reproducible.
   */
  goTo(presetNameOrObject, seconds = 1.2) {
    let p;
    if (typeof presetNameOrObject === 'string') {
      p = this.presets[presetNameOrObject];
      if (!p) {
        console.warn('CameraRig: unknown preset "' + presetNameOrObject + '"');
        return this;
      }
      this.presetName = presetNameOrObject;
    } else if (presetNameOrObject) {
      // Inline framing: merge over the current preset so callers can pass only
      // the fields they care about (e.g. just a new target).
      const base = this.goal || this.presets.wide;
      p = this.overridePreset('__inline__', {
        space: presetNameOrObject.space ?? base.space,
        pos: presetNameOrObject.pos ?? base.pos,
        target: presetNameOrObject.target ?? base.target,
        fov: presetNameOrObject.fov ?? base.fov,
        focusRange: presetNameOrObject.focusRange ?? base.focusRange,
        dof: presetNameOrObject.dof ?? base.dof,
        handheld: presetNameOrObject.handheld ?? base.handheld,
        roll: presetNameOrObject.roll ?? base.roll
      });
      this.presetName = presetNameOrObject.name || '__inline__';
    } else {
      return this;
    }

    this.goal = p;

    if (seconds > 0) {
      // ~99% of the way there after `seconds`: e^-6 ≈ 0.0025.
      this._omega = 6 / seconds;
      this._still = false;
      return this;
    }

    // --- snap ---------------------------------------------------------------
    // Resolve first: a subject-space preset has no meaning until it has been
    // pushed through the subject transform, and the harness relies on the snap
    // landing on *exactly* the framing the preset describes.
    this._resolve(p, _gPos, _gTgt);
    this.pos.copy(_gPos);
    this.target.copy(_gTgt);
    this.fov = p.fov;
    this.focus = p.focusRange;
    this.dof = p.dof;
    this.hh = p.handheld;
    this.rollScale = p.roll;
    this._posV.set(0, 0, 0);
    this._tgtV.set(0, 0, 0);
    this._fovV = 0;
    this._focusV = 0;
    this._nudge.set(0, 0);
    this._nudgeCur.set(0, 0);
    this._shakeAmp = 0;
    this._shakeT = 0;
    this.still = true;             // freezes handheld phase at 0
    this._applyToCamera(0);
    return this;
  }

  /**
   * Small parallax offset in camera-local screen space, dx/dy in roughly
   * -1..1. Used for "the world tips a little as you drag" feedback. The offset
   * bleeds back to centre on its own so it can be fed raw pointer deltas.
   */
  nudge(dx, dy) {
    this._nudge.x = THREE.MathUtils.clamp(this._nudge.x + dx, -1, 1);
    this._nudge.y = THREE.MathUtils.clamp(this._nudge.y + dy, -1, 1);
    return this;
  }

  /**
   * Impact shake with exponential decay. `strength` is a metre-ish amplitude
   * (0.01 is a gentle bump, 0.05 is a tower of blocks hitting the floor).
   */
  shake(strength = 0.02, seconds = 0.6) {
    // Take the stronger of the two so a small hit can't cut a big one short.
    if (strength >= this._shakeAmp * this._shakeEnvelope()) {
      this._shakeAmp = strength;
      this._shakeDur = Math.max(0.05, seconds);
      this._shakeT = 0;
    }
    return this;
  }

  _shakeEnvelope() {
    if (this._shakeAmp <= 0) return 0;
    const k = this._shakeT / this._shakeDur;
    if (k >= 1) return 0;
    // Exponential decay with a hard tail-out so it never lingers as a buzz.
    return Math.exp(-4.2 * k) * (1 - k * k);
  }

  /* --------------------------------------------------------------- tick -- */

  update(dt) {
    const h = THREE.MathUtils.clamp(dt || 0, 0, 1 / 15);
    const g = this.goal;
    if (!g) return;

    const w = this._omega;

    // Re-resolve every frame: the subject can walk, be lifted into a highchair
    // or be laid down in a cot, and the framing has to follow it.
    this._resolve(g, _gPos, _gTgt);

    // Position and aim ride separate springs; aiming settles slightly faster
    // so the frame locks onto the subject before the move finishes, which is
    // exactly how an operator works.
    _springVec(this.pos, this._posV, _gPos, w, h);
    _springVec(this.target, this._tgtV, _gTgt, w * 1.25, h);

    let s = springStep(this.fov, this._fovV, g.fov, w, h);
    this.fov = s[0]; this._fovV = s[1];

    s = springStep(this.focus, this._focusV, g.focusRange, w, h);
    this.focus = s[0]; this._focusV = s[1];

    // Non-spatial parameters just need to not pop.
    const k = 1 - Math.exp(-w * h);
    this.dof += (g.dof - this.dof) * k;
    this.hh += (g.handheld - this.hh) * k;
    this.rollScale += (g.roll - this.rollScale) * k;

    // Nudge decays back to centre over ~1 s; the eased value follows it.
    const decay = Math.exp(-h / 0.9);
    this._nudge.multiplyScalar(decay);
    this._nudgeCur.lerp(this._nudge, 1 - Math.exp(-h * 9));

    if (!this._still) {
      this._t += h;
      if (this._shakeAmp > 0) {
        this._shakeT += h;
        if (this._shakeT >= this._shakeDur) this._shakeAmp = 0;
      }
    }

    this._applyToCamera(this._still ? 0 : this._t);
  }

  /* ------------------------------------------------------------ compose -- */

  _applyToCamera(t) {
    const cam = this.camera;

    // Distance drives the handheld amplitude so the *angular* sway stays
    // constant: a closeup wobbles millimetres, a wide wobbles centimetres.
    const dist = THREE.MathUtils.clamp(this.pos.distanceTo(this.target), 0.3, 6);
    const amp = dist * 0.0085 * this.hh * this._breathe;
    const shake = this._shakeAmp * this._shakeEnvelope();

    // --- handheld translation ---------------------------------------------
    let ox = hnoise(t * 0.37, 0.0, 17) * amp;
    let oy = hnoise(t * 0.31, 5.1, 83) * amp * 0.8;
    let oz = hnoise(t * 0.27, 9.4, 151) * amp * 0.6;
    // Breath: a slow, almost-sine vertical rise and fall on top of the drift.
    oy += Math.sin(t * 1.32) * amp * 0.45;

    // --- shake translation (fast, mostly lateral) --------------------------
    if (shake > 0) {
      ox += hnoise(t * 26.0, 0.0, 313) * shake;
      oy += hnoise(t * 23.5, 3.7, 419) * shake * 0.9;
      oz += hnoise(t * 21.0, 7.2, 577) * shake * 0.5;
    }

    // --- place the eye ------------------------------------------------------
    _look.copy(this.target);
    cam.position.copy(this.pos).add(_v.set(ox, oy, oz));

    // Parallax nudge is applied in camera space, and the aim point follows it
    // at a fraction of the amount — that difference *is* the parallax.
    if (this._nudgeCur.lengthSq() > 1e-8) {
      _v.copy(_look).sub(cam.position).normalize();
      _right.set(0, 1, 0).cross(_v).normalize();
      _up.copy(_v).cross(_right).normalize();
      const nx = this._nudgeCur.x * this.parallax;
      const ny = this._nudgeCur.y * this.parallax;
      cam.position.addScaledVector(_right, nx).addScaledVector(_up, ny);
      _look.addScaledVector(_right, nx * 0.35).addScaledVector(_up, ny * 0.35);
    }

    cam.up.set(0, 1, 0);
    cam.lookAt(_look);

    // --- handheld + shake rotation -----------------------------------------
    // Applied after lookAt, in camera-local axes, so it survives the aim.
    const rAmp = 0.0022 * this.hh * this._breathe;
    let pitch = hnoise(t * 0.43, 2.2, 641) * rAmp;
    let yaw = hnoise(t * 0.39, 6.6, 733) * rAmp;
    let roll = hnoise(t * 0.23, 4.4, 811) * 0.0018 * this.rollScale * this._breathe;
    if (shake > 0) {
      // Rotational kick is what actually sells an impact on screen.
      const rs = shake * 0.55;
      pitch += hnoise(t * 24.0, 1.1, 907) * rs;
      yaw += hnoise(t * 27.5, 8.3, 1013) * rs;
      roll += hnoise(t * 19.5, 2.9, 1117) * rs * 1.4;
    }
    cam.rotateX(pitch);
    cam.rotateY(yaw);
    cam.rotateZ(roll);

    // --- lens ---------------------------------------------------------------
    if (Math.abs(cam.fov - this.fov) > 1e-4) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    if (this.pipeline?.grade) {
      this.pipeline.grade.uniforms.uDofStrength.value = this._baseDof * this.dof;
    }

    // Keep the inverse fresh: app.js pulls focus in the same frame, before the
    // renderer would otherwise refresh it.
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  }

  /** Global handheld amount, 0..1. Handy for cutscenes that want a locked-off. */
  setBreathing(v) { this._breathe = THREE.MathUtils.clamp(v, 0, 2); return this; }

  /** World-space point the rig is currently aiming at. */
  aimPoint(out = new THREE.Vector3()) { return out.copy(this.target); }
}

/* --------------------------------------------------------------- utils --- */

function _makePreset(def = {}) {
  return {
    space: def.space === 'subject' ? 'subject' : 'world',
    pos: _toVec(def.pos, 0, 1.4, 2.6),
    target: _toVec(def.target, 0, 0.4, 0),
    fov: def.fov ?? 38,
    focusRange: def.focusRange ?? 0.30,
    dof: def.dof ?? 1.0,
    handheld: def.handheld ?? 1.0,
    roll: def.roll ?? 1.0
  };
}

function _toVec(v, dx, dy, dz) {
  if (!v) return new THREE.Vector3(dx, dy, dz);
  if (v.isVector3) return v.clone();
  return new THREE.Vector3(v[0] ?? dx, v[1] ?? dy, v[2] ?? dz);
}

function _springVec(x, v, goal, omega, h) {
  let r = springStep(x.x, v.x, goal.x, omega, h); x.x = r[0]; v.x = r[1];
  r = springStep(x.y, v.y, goal.y, omega, h); x.y = r[0]; v.y = r[1];
  r = springStep(x.z, v.z, goal.z, omega, h); x.z = r[0]; v.z = r[1];
}

export default CameraRig;
