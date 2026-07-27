/* ============================================================================
 * window.js — window, glazing, weather, exterior parallax and the light shaft
 * ----------------------------------------------------------------------------
 * The single most valuable object in the room. Four things stack up here:
 *
 *   1. A real joinery window: casing, frame, mullion, transom, glazing bars,
 *      an inner sill with a nosing and a sloped outer sill.
 *   2. A layered exterior at genuine depth — sky, two cloud sheets, a treeline
 *      and a ground plane — so moving the camera parallaxes the view like a
 *      real window instead of sliding a painted backdrop.
 *   3. A *fake* volumetric shaft: a tapered prism of additive, noise-scrolling
 *      material with the mullion bars carved into it, a matching light pool on
 *      the floor and GPU dust motes trapped inside the beam. No raymarching,
 *      three draw calls, and it does more for the "AAA" read than anything
 *      else in the scene.
 *   4. Curtains as actual cloth with a fold profile that gathers as they open.
 *
 * Everything is built in local space with the glass in the XY plane facing +Z
 * (room side) and the outside at -Z; the Room just yaws the whole group onto
 * whichever wall it wants.
 * ========================================================================== */

import * as THREE from 'three';
import * as TEX from '../engine/textures.js';
import * as MAT from '../engine/materials.js';
import { mergeAll, rbox, xf, extrudeProfile, lathe, mesh, instanced, tint, clothPanel, foldCloth, rng } from './props.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _WHITE = new THREE.Color(0xffffff);

/* ------------------------------------------------------------ sky shader -- */

const SKY_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/**
 * Sky: three-stop vertical gradient, a soft sun/moon disc with a wide halo,
 * horizon haze and hash-based stars. All of it drives off uniforms so the
 * whole exterior can crossfade between moods without rebuilding anything.
 */
const SKY_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform vec3 uTop, uMid, uHorizon, uSun, uStarTint;
  uniform vec2 uSunPos;
  uniform float uSunSize, uSunGlow, uStars, uHaze, uTime, uGain;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    float h = clamp(vUv.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.55, h));
    col = mix(col, uTop, smoothstep(0.45, 1.0, h));

    // Lateral gradient toward the sun. A real sky is not radially symmetric
    // about the zenith — it is brightest and least saturated on the sun's side
    // of the dome, and that single gradient is most of what tells you which way
    // the light in the room is coming from when you can only see a 1.4 m patch
    // of sky through a window.
    float lat = 1.0 - clamp(abs(vUv.x - uSunPos.x) * 1.35, 0.0, 1.0);
    col = mix(col, mix(col, uSun, 0.30), lat * lat);

    // stars: only the top two thirds, and never on top of the sun
    if (uStars > 0.001) {
      vec2 g = floor(vUv * vec2(220.0, 150.0));
      float n = hash(g);
      float tw = 0.55 + 0.45 * sin(uTime * 2.2 + n * 40.0);
      float s = step(0.9955, n) * tw * smoothstep(0.15, 0.6, h);
      col += uStarTint * s * uStars * 1.4;
    }

    /* Sun / moon.
     *
     * The disc and its halo used to be tinted entirely by uSun, which for a
     * golden sky is a saturated amber. A saturated colour cannot reach display
     * white however hard you drive it — the blue channel runs out first — so
     * the brightest thing in the whole 28-frame set topped out at luminance
     * 0.91 with the red channel already pinned. Physically the core of a solar
     * disc and the forward-scattering halo around it are the two places in the
     * sky that ARE white: that is what the scattering is doing. Mixing the core
     * toward white is both correct and the only way the frame gets a true
     * highlight out of the window. */
    float d = length((vUv - uSunPos) * vec2(1.0, 0.62));
    float disc = smoothstep(uSunSize, uSunSize * 0.55, d);
    float glow = pow(max(0.0, 1.0 - d / max(0.001, uSunGlow)), 3.0);
    vec3 core = mix(uSun, vec3(1.0), 0.62);
    col = mix(col, mix(col, vec3(dot(col, vec3(0.36))), 0.55), glow * 0.5);
    col += core * (disc * 3.2 + glow * 0.80);

    // ground haze lifts the horizon and hides the treeline's feet
    col = mix(col, uHorizon * 1.06, uHaze * pow(max(0.0, 1.0 - h * 2.2), 2.0));

    /* The exterior read "washed out and flat" for one structural reason: the
     * sky was being emitted at roughly the same linear luminance as a lit
     * interior wall (~0.6). Outdoors is one to two stops brighter than indoors
     * — that difference *is* the look of a window. At parity the opening reads
     * as a pale rectangle painted on the wall; at gain the highlights roll off
     * through AgX, the bloom threshold (1.02) finally catches the sky, the
     * treeline drops to a silhouette against it, and the frame gains the one
     * genuinely bright value it was missing.
     *
     * The gain is applied last so it multiplies the sun disc and the glow with
     * everything else, which is what puts the sun above the bloom gate. */
    gl_FragColor = vec4(col * uGain, 1.0);
  }`;

/* ---------------------------------------------------------- shaft shader -- */

const SHAFT_VERT = /* glsl */`
  varying vec3 vPos;
  varying vec3 vWorld;
  void main() {
    vPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const SHAFT_FRAG = /* glsl */`
  varying vec3 vPos;
  varying vec3 vWorld;
  uniform sampler2D uNoise;
  uniform sampler2D uDepth;
  uniform vec3 uColor, uAxis;
  uniform vec2 uResolution;
  uniform float uLen, uHalfW, uHalfH, uSpread, uTime, uIntensity, uBarX, uBarY, uOpen;
  uniform float uHasDepth, uNear, uFar, uSoft;

  /** normalize() that can never hand back NaN for a degenerate input. */
  vec3 safeDir(vec3 v, vec3 fallback) {
    float l = length(v);
    return l > 1e-5 ? v / l : fallback;
  }

  void main() {
    float t = clamp(vPos.z / max(1e-4, uLen), 0.0, 1.0);
    float k = 1.0 + uSpread * t;
    vec2 s = vec2(vPos.x / max(1e-4, uHalfW * k), vPos.y / max(1e-4, uHalfH * k));

    /* Cross-section.
     *
     * The critique's reading of this was "a flat hard-edged band on the wall
     * with uniform intensity and no falloff", and both halves of that were
     * fair. 1 - smoothstep(1 - soft, 1.04, |s|) with soft = 0.50 at the near
     * end is *flat* across the middle 50% of the beam and only ramps in the
     * outer half — so seen close to edge-on, where the eye is looking straight
     * through the plateau, the beam has a top edge and a bottom edge and
     * nothing in between. Two changes:
     *
     *   · The plateau is gone. A raised-cosine profile in each axis has no
     *     interior at all — it is falling off from the axis outward everywhere,
     *     which is what a real cone of lit air does.
     *   · The profile *widens* down the beam (soft), so the near end is the
     *     tightest and the far end has no findable edge.
     */
    float soft = mix(0.78, 1.06, t);
    float ex = pow(clamp(1.0 - abs(s.x) / soft, 0.0, 1.0), 1.45);
    float ey = pow(clamp(1.0 - abs(s.y) / soft, 0.0, 1.0), 1.35);
    ex = ex * ex * (3.0 - 2.0 * ex);      // smoothstep the profile, not the edge
    ey = ey * ey * (3.0 - 2.0 * ey);
    float edge = ex * ey;
    // a hotter core down the middle of the beam, which is what makes a shaft
    // read as a volume rather than a flat card
    float core = exp(-(s.x * s.x + s.y * s.y) * 1.15);
    edge *= 0.34 + 1.05 * core;

    // curtains eat the beam from the outside in: only |s.x| < uOpen gets through
    edge *= 1.0 - smoothstep(uOpen * 0.72, uOpen * 1.02, abs(s.x));

    // The mullion and transom carve real bars out of the light — and the bar
    // shadows blur out with distance exactly as a real penumbra does.
    float bw = 0.045 + 0.16 * t;
    float bars = 1.0
      - 0.66 * (1.0 - smoothstep(0.0, bw, abs(s.x - uBarX)))
      - 0.54 * (1.0 - smoothstep(0.0, bw * 0.9, abs(s.y - uBarY)));
    bars = clamp(bars, 0.0, 1.0);

    /* Density falloff along the length.
     *
     * pow(1 - t, 1.25) is a straight line for most of the beam and then dives
     * in the last fifth — i.e. exactly the "uniform intensity then an edge" the
     * critique measured. Lit air actually loses brightness as the inverse
     * square of the spread *plus* the scattering it has already done, which is
     * far closer to an exponential. The extra smoothstep at the mouth stops
     * the beam starting with a lid on it where it leaves the glass.
     */
    float fade = exp(-t * 2.35) * (1.0 - t * t) * smoothstep(0.0, 0.09, t);

    // two noise layers drifting down the beam = airborne dust in motion
    float n1 = texture2D(uNoise, vec2(s.x * 0.30 + uTime * 0.011, t * 0.70 - uTime * 0.043)).r;
    float n2 = texture2D(uNoise, vec2(s.y * 0.24 - uTime * 0.008, t * 0.42 - uTime * 0.027)).g;
    float haze = 0.55 + 0.80 * n1 * n2;

    // looking straight down the beam would show the flat end cap; fade it out
    vec3 V = safeDir(cameraPosition - vWorld, vec3(0.0, 0.0, 1.0));
    vec3 A = safeDir(uAxis, vec3(0.0, -1.0, 0.0));
    float axial = 1.0 - abs(dot(V, A));

    float a = edge * bars * fade * haze * uIntensity * (0.42 + 0.58 * axial);

    // Soft-particle fade. Without it the prism cuts the floor and the cot with
    // a razor line and instantly reads as a card, not as lit air. uDepth is the
    // previous frame's resolved linear depth, which is plenty for a beam that
    // barely moves.
    if (uHasDepth > 0.5) {
      float span = max(1e-4, uFar - uNear);
      float sceneD = texture2D(uDepth, gl_FragCoord.xy / uResolution).x;
      float vz = -(viewMatrix * vec4(vWorld, 1.0)).z;
      float fragD = (vz - uNear) / span;
      // uSoft is in METRES. Doing this in normalised depth made the fade
      // distance scale with the far plane — at far = 60 the beam was being
      // dimmed to a fifth over its whole length instead of only where it
      // actually meets the floor.
      a *= clamp((sceneD - fragD) * span / max(0.01, uSoft), 0.0, 1.0);
    }

    // NaN belt-and-braces: a rogue uniform must never poison the HDR buffer.
    if (!(a > 0.0015)) discard;
    gl_FragColor = vec4(uColor, min(a, 1.0));
  }`;

const POOL_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D uNoise;
  uniform vec3 uColor;
  uniform float uTime, uIntensity, uBarX, uBarY, uOpen;
  void main() {
    vec2 s = vUv * 2.0 - 1.0;
    // Same plateau problem as the beam: smoothstep(0.45, 1.0, ...) left the
    // middle 45% of the pool at one flat value with a findable rim. A pool of
    // sunlight on a floor has a soft penumbra all the way in from the edge.
    float ex = pow(clamp(1.0 - abs(s.x) * 0.92, 0.0, 1.0), 1.4);
    float ey = pow(clamp(1.0 - abs(s.y) * 0.94, 0.0, 1.0), 1.3);
    ex = ex * ex * (3.0 - 2.0 * ex);
    ey = ey * ey * (3.0 - 2.0 * ey);
    ex *= 1.0 - smoothstep(uOpen * 0.72, uOpen * 1.02, abs(s.x));
    float bars = 1.0
      - 0.70 * (1.0 - smoothstep(0.0, 0.06, abs(s.x - uBarX)))
      - 0.55 * (1.0 - smoothstep(0.0, 0.05, abs(s.y - uBarY)));
    float n = texture2D(uNoise, vUv * 1.4 + vec2(uTime * 0.006, -uTime * 0.004)).r;
    float a = ex * ey * clamp(bars, 0.0, 1.0) * (0.72 + 0.5 * n) * uIntensity;
    if (a <= 0.001) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

const MOTE_VERT = /* glsl */`
  attribute float aSeed;
  attribute float aSize;
  varying float vAlpha;
  varying vec3 vPos;
  uniform float uTime, uLen, uHalfW, uHalfH, uSpread, uPixel;
  void main() {
    // drift: a slow curl plus a gentle fall along the beam
    float s = aSeed * 6.2831;
    vec3 p = position;
    p.x += sin(uTime * 0.32 + s) * 0.055 + sin(uTime * 0.11 + s * 2.3) * 0.09;
    p.y += cos(uTime * 0.27 + s * 1.7) * 0.05 - mod(uTime * 0.012 + aSeed, 1.0) * 0.0;
    p.z = mod(p.z + uTime * 0.055 * (0.4 + aSeed * 0.8), uLen);

    float t = clamp(p.z / uLen, 0.0, 1.0);
    float k = 1.0 + uSpread * t;
    vec2 c = vec2(p.x / (uHalfW * k), p.y / (uHalfH * k));
    float edge = (1.0 - smoothstep(0.55, 1.0, abs(c.x))) * (1.0 - smoothstep(0.5, 1.0, abs(c.y)));
    vAlpha = edge * pow(1.0 - t, 0.9) * (0.35 + 0.65 * abs(sin(uTime * 1.7 + s)));
    vPos = p;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixel / max(0.2, -mv.z);
  }`;

const MOTE_FRAG = /* glsl */`
  varying float vAlpha;
  uniform vec3 uColor;
  uniform float uIntensity;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float a = pow(max(0.0, 1.0 - r), 2.4) * vAlpha * uIntensity;
    if (a <= 0.002) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

/* --------------------------------------------------------------- moods --- */

/**
 * `gain` is the exterior's exposure relative to the interior. `ground` is the
 * unlit backdrop tone and `aerial` how far the far trees wash toward the
 * horizon colour — see `_buildExterior`, where the whole backdrop was moved off
 * the room's own lighting rig.
 */
/*
 * A second, larger correction to `gain`, and this one is measured.
 *
 * `tools/histo.mjs` over the 28-frame set: every frame without a HUD in it had
 * **zero pixels above display 0.95**, and the whole image lived between 0.27
 * and 0.67 — rubric §4 #101. The reason is arithmetic. AgX needs a *linear*
 * value of 5.2 to reach display 0.95; at gain 1.55 the brightest channel the
 * sky ever emitted was ~1.3, which lands at display 0.83. There was therefore
 * nothing anywhere in the frame that could be a highlight, and the window —
 * the one surface in a nursery that genuinely is two to three stops over the
 * interior — read as a pale rectangle painted on the wall.
 *
 * The gains below put the *general* sky around display 0.88–0.92 (so the
 * gradient, the clouds and the treeline silhouette all keep their detail) and
 * the sun disc and its immediate glow above 0.95, which is where the frame's
 * genuine near-white now comes from. It is also what finally puts the sun over
 * the bloom pass' 1.02 threshold, so the opening gets a real halo instead of
 * the whole frame getting a milky one.
 *
 * `haze` comes down with it: at 0.62 the golden dome was washed to one warm
 * value from horizon to zenith, which threw away the only cool hue visible
 * from inside the room.
 */
const SKY = {
  day: {
    // Pushed a stop of saturation back into the dome. The old mid/horizon pair
    // was a 6% blue against near-white, which through a 1.4 m opening reads as
    // "overcast" no matter what the room is doing.
    top: 0x3f86d4, mid: 0x84bcec, hor: 0xd7e7f2, sun: 0xfff6e2,
    sunPos: [0.70, 0.80], sunSize: 0.030, glow: 0.34, stars: 0, haze: 0.30,
    gain: 8.50, ground: 0x8aa76e, aerial: 0.44,
    shaft: 0xfff2dc, shaftI: 1.00, cloud: 0xffffff, cloudA: 0.95
  },
  golden: {
    top: 0x4f86cc, mid: 0xf0b877, hor: 0xffc98a, sun: 0xffdaa2,
    sunPos: [0.435, 0.455], sunSize: 0.030, glow: 0.40, stars: 0, haze: 0.44,
    gain: 8.80, ground: 0x9a9a5c, aerial: 0.54,
    shaft: 0xffd7a0, shaftI: 1.55, cloud: 0xffe6cc, cloudA: 0.92
  },
  evening: {
    top: 0x33417a, mid: 0x8b7fae, hor: 0xe6a891, sun: 0xffbe8c,
    sunPos: [0.22, 0.28], sunSize: 0.048, glow: 0.62, stars: 0.3, haze: 0.62,
    gain: 4.00, ground: 0x67765a, aerial: 0.48,
    shaft: 0xffc79c, shaftI: 0.72, cloud: 0xd8bfc4, cloudA: 0.85
  },
  night: {
    // The moon is the only near-white a night frame can honestly carry, and at
    // gain 0.62 it was a grey disc. 1.35 puts the disc itself just over 0.95
    // while the dome stays at 0.05–0.12, which is what makes it read as a moon
    // rather than as a hole in the sky.
    top: 0x101736, mid: 0x232f5c, hor: 0x3c4370, sun: 0xe8ecff,
    sunPos: [0.66, 0.78], sunSize: 0.026, glow: 0.20, stars: 1, haze: 0.30,
    gain: 1.10, ground: 0x2a333c, aerial: 0.55,
    shaft: 0xb0c2ff, shaftI: 0.26, cloud: 0x4a5480, cloudA: 0.7
  }
};

/* ------------------------------------------------------------- curtains --- */

const RINGS_PER_PANEL = 7;

/**
 * The cross-section of a hanging, gathered panel.
 *
 * `clothPanel`/`foldCloth` displace a plane by a single sine in z, which is a
 * corrugated sheet: every fold identical, every fold symmetric, no thickness,
 * and the panel reads as a striped ribbon rather than cloth (rubric #13, #135).
 * Three things fix that and all three are in here:
 *
 *   · **Asymmetry.** Real gathered cloth has *round lobes and sharp valleys* —
 *     the fabric bulges toward the viewer and pinches where it is pulled back.
 *     A raised cosine, not a sine.
 *   · **Bunching in x.** Cloth conserves arc length, so material crowds toward
 *     the lobes. Displacing x as well as z is what stops the folds looking
 *     painted on.
 *   · **Irregularity.** The pitch and the depth wander, because no curtain in
 *     any house has six identical pleats.
 *
 * @param {number} f  across the panel, −0.5 … 0.5
 * @param {number} y0 1 at the heading, 0 at the hem
 * @returns {{x:number, z:number}} x as a fraction of panel width, z in metres
 */
function foldProfile(f, y0, { folds = 6, amp = 0.042, gather = 0, drape = 0, sway = 0, seed = 0 }) {
  // Wandering pitch: a slow modulation of the phase, so no two pleats are the
  // same width, without ever creating a discontinuity. The extra term in y0
  // lets each fold meander a little as it falls — perfectly parallel folds are
  // the tell that turns a curtain into a set of vertical blinds.
  const base = (f + 0.5) * folds * Math.PI * 2;
  const phase = base
    + 0.34 * Math.sin(base * 0.37 + seed)
    + 0.15 * Math.sin(base * 0.79 - seed * 1.7)
    + 0.22 * (1 - y0) * Math.sin(base * 0.5 + seed * 0.8);

  // Depth wanders too, and flattens toward the two vertical edges: one is
  // pinned to the wall, the other is the free leading edge, and neither
  // carries a full pleat.
  const wander = 0.80 + 0.30 * (0.5 + 0.5 * Math.sin(base * 0.29 + seed * 2.3));
  const edgeOff = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, f + 0.5))), 0.42);
  // Pleats are gripped hardest just under the heading tape and relax downward.
  const alongY = 0.62 + 0.38 * Math.pow(y0, 0.55);
  const depth = amp * wander * alongY * edgeOff;

  // Round lobe toward the room, slightly sharper valley away from it. Pushed
  // much closer to a plain cosine than the first pass: with a cusped profile
  // and a depth near the fold pitch the panel reads as a concertina of blades.
  const lobe = Math.pow(0.5 + 0.5 * Math.cos(phase), 0.88) * 2 - 1;
  const z = lobe * depth
          + drape * (1 - y0) * (1 - y0)
          + sway * (1 - y0) * (1 - y0);

  // Material crowds toward the lobes; the effect grows as the panel gathers.
  const narrow = 1 - gather * 0.52 * (0.35 + 0.65 * y0);
  const bunch = -Math.sin(phase) * depth * (0.25 + 0.35 * gather);
  return { x: f * narrow + bunch / Math.max(1e-4, folds * 1.6), z };
}

/**
 * A double-sided cloth panel with real thickness.
 *
 * Front and back shells plus a rim, so the hem and the leading edge are solid
 * at grazing angles instead of vanishing to a line. One geometry, one draw
 * call. `userData.drape` carries what `drapeFold` needs to re-shape it.
 */
function drapedPanel(w, h, { cols = 52, rows = 22, thickness = 0.009 } = {}) {
  const nx = cols + 1, ny = rows + 1;
  const layer = nx * ny;
  const pos = new Float32Array(layer * 2 * 3);
  const uv = new Float32Array(layer * 2 * 2);
  for (let l = 0; l < 2; l++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = l * layer + j * nx + i;
        uv[k * 2] = i / cols;
        uv[k * 2 + 1] = 1 - j / rows;
      }
    }
  }

  const idx = [];
  const quad = (a, b, c, d) => { idx.push(a, b, d, b, c, d); };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx;
      quad(a, b, c, d);                                            // front
      quad(layer + d, layer + c, layer + b, layer + a);            // back
    }
  }
  // rim: hem, heading and the two vertical edges
  for (let i = 0; i < cols; i++) {
    const t0 = i, t1 = i + 1;
    quad(layer + t1, layer + t0, t0, t1);                          // heading
    const b0 = rows * nx + i, b1 = b0 + 1;
    quad(b0, b1, layer + b1, layer + b0);                          // hem
  }
  for (let j = 0; j < rows; j++) {
    const l0 = j * nx, l1 = l0 + nx;
    quad(l0, l1, layer + l1, layer + l0);
    const r0 = j * nx + cols, r1 = r0 + nx;
    quad(layer + r0, layer + r1, r1, r0);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.drape = { w, h, cols, rows, thickness, layer };
  drapeFold(g, {});
  return g;
}

/** Re-shape a `drapedPanel` in place. Cheap enough to run while animating. */
function drapeFold(g, shape) {
  const info = g.userData.drape;
  const { w, h, cols, rows, thickness, layer } = info;
  const pos = g.attributes.position;
  const nx = cols + 1;
  const e = 0.5 / cols;

  for (let j = 0; j <= rows; j++) {
    const y0 = 1 - j / rows;
    for (let i = 0; i <= nx - 1; i++) {
      const f = i / cols - 0.5;
      const p = foldProfile(f, y0, shape);
      // Offset the back shell along the surface normal, not blindly along −z,
      // or the shell pinches to zero thickness on the steep flanks of a fold.
      const pa = foldProfile(f - e, y0, shape);
      const pb = foldProfile(f + e, y0, shape);
      let tx = (pb.x - pa.x) * w, tz = pb.z - pa.z;
      const tl = Math.hypot(tx, tz) || 1;
      const nxn = tz / tl, nzn = -tx / tl;

      const x = p.x * w;
      const y = (y0 - 0.5) * h - (1 - y0) * 0.012;
      const k = j * nx + i;
      pos.setXYZ(k, x, y, p.z);
      pos.setXYZ(layer + k, x - nxn * thickness, y, p.z - nzn * thickness);
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ============================================================== the unit === */

export class WindowUnit {
  /**
   * Local space: glass in XY, room at +Z, outside at -Z, origin at the centre
   * of the opening on the room-side wall face.
   */
  constructor({ tier = 2, palette, width = 1.46, height = 1.36, wall = 0.14 } = {}) {
    this.tier = tier;
    this.M = palette;
    this.w = width;
    this.h = height;
    this.wall = wall;
    this.group = new THREE.Group();
    this.group.name = 'window';
    this.mood = 'day';
    this.weather = 'clear';
    this.open = 1;          // 1 = curtains fully drawn back
    this._openNow = 1;
    this.time = 0;
    this._pick = [];
    this._blend = 1;
    this._from = SKY.day;
    // the mullion / transom positions, normalised to the cross-section, are
    // shared by the joinery, the shaft and the floor pool so the bar shadows
    // land exactly where the real bars are
    this.barX = 0.0;
    this.barY = 0.26;
  }

  build(ctx) {
    // Held so `setWeather` can reach the lighting rig; every other caller
    // already passes ctx per-call.
    this._ctx = ctx;
    this._buildJoinery();
    this._buildExterior();
    this._buildShaft(ctx);
    this._buildCurtains();
    this.setMood(this.mood, true);
    this.setWeather(this.weather, true);
    // Aim the beam *before* anyone can render it. `update()` would do this on
    // the first tick, but `App.init()` calls `renderer.compile()` and the
    // harness renders warm-up frames, so "the first tick" is not the first
    // frame the beam is drawn in.
    this._updateBeam(ctx);
    return this.group;
  }

  /* ------------------------------------------------------------ joinery -- */

  _buildJoinery() {
    const M = this.M, w = this.w, h = this.h, t = this.wall;
    const hw = w / 2, hh = h / 2;
    const parts = [];

    // reveal lining, 12 mm boards on all four faces of the opening
    parts.push(rbox(w + 0.02, 0.012, t, [0, hh - 0.006, -t / 2], [0, 0, 0], 0.004, 2));
    parts.push(rbox(w + 0.02, 0.012, t, [0, -hh + 0.006, -t / 2], [0, 0, 0], 0.004, 2));
    for (const sx of [-1, 1]) parts.push(rbox(0.012, h, t, [sx * (hw - 0.006), 0, -t / 2], [0, 0, 0], 0.004, 2));

    // Architrave. The profile is authored as (x = band width away from the
    // opening, y = projection from the wall face) and extruded along +Z; each
    // of the four runs is then dropped in with an explicit basis, which is far
    // easier to reason about than three chained Euler angles.
    const casing = [
      [0, 0], [0, 0.020], [0.012, 0.026], [0.030, 0.030],
      [0.034, 0.016], [0.060, 0.014], [0.062, 0.004], [0.068, 0.002], [0.068, 0]
    ];
    const band = 0.068;
    const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
    const placeRun = (len, xAxis, yAxis, zAxis, ox, oy) => {
      const g = extrudeProfile(casing, len, { bevel: 0.0012, curve: 2 });
      const m = new THREE.Matrix4().makeBasis(X.fromArray(xAxis), Y.fromArray(yAxis), Z.fromArray(zAxis));
      m.setPosition(ox, oy, 0);
      g.applyMatrix4(m);
      parts.push(g);
    };
    const runH = w + band * 2, runV = h + band * 2;
    placeRun(runH, [0, -1, 0], [0, 0, 1], [-1, 0, 0], hw + band, -hh);   // under
    placeRun(runH, [0, 1, 0], [0, 0, 1], [1, 0, 0], -hw - band, hh);     // over
    placeRun(runV, [-1, 0, 0], [0, 0, 1], [0, 1, 0], -hw, -hh - band);   // left
    placeRun(runV, [1, 0, 0], [0, 0, 1], [0, -1, 0], hw, hh + band);     // right

    // window frame set back in the reveal, with mullion and transom
    const setZ = -t + 0.055;
    parts.push(rbox(w - 0.02, 0.055, 0.05, [0, hh - 0.045, setZ], [0, 0, 0], 0.008, 2));
    parts.push(rbox(w - 0.02, 0.055, 0.05, [0, -hh + 0.045, setZ], [0, 0, 0], 0.008, 2));
    for (const sx of [-1, 1]) parts.push(rbox(0.055, h - 0.09, 0.05, [sx * (hw - 0.045), 0, setZ], [0, 0, 0], 0.008, 2));
    parts.push(rbox(0.042, h - 0.09, 0.046, [this.barX * hw, 0, setZ], [0, 0, 0], 0.007, 2));
    parts.push(rbox(w - 0.09, 0.038, 0.046, [0, this.barY * hh, setZ], [0, 0, 0], 0.007, 2));

    // inner sill with a bullnose nose, plus the stool it sits on
    // profile: x = depth into the room, y = board thickness
    const sill = extrudeProfile([
      [-0.02, 0], [0.185, 0], [0.205, 0.010], [0.205, 0.024], [0.185, 0.034], [-0.02, 0.034]
    ], w + 0.16, { bevel: 0.0012, curve: 3 });
    const sm = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
    sm.setPosition((w + 0.16) / 2, -hh - 0.046, 0);
    sill.applyMatrix4(sm);
    parts.push(sill);
    parts.push(rbox(w + 0.10, 0.030, 0.055, [0, -hh - 0.062, -0.02], [0, 0, 0], 0.006, 2));

    // outer sill, sloped so rain runs off (and snow can settle on it)
    parts.push(rbox(w + 0.12, 0.03, 0.16, [0, -hh - 0.03, -t - 0.06], [0.18, 0, 0], 0.008, 2));

    const frame = mesh(mergeAll(parts), M.trim, 'windowFrame');
    // The wall it sits in deliberately does not cast (see room.js), so a
    // shadow-casting frame would drop a lone rectangle onto a floor that is
    // otherwise unshadowed. The mullion bars are drawn into the beam instead.
    frame.castShadow = false;
    this.group.add(frame);
    this._pick.push(frame);

    /* --- glazing ------------------------------------------------------- */
    const glassGeo = new THREE.PlaneGeometry(w - 0.075, h - 0.075);
    const glass = new THREE.Mesh(glassGeo, M.glass);
    glass.position.z = setZ - 0.012;
    glass.renderOrder = 2;
    glass.castShadow = false;
    glass.receiveShadow = false;
    this.group.add(glass);
    this.glass = glass;

    // the film of running water, a few millimetres inside the pane
    this.rainMat = MAT.makeRainFilm({ seed: 29, speed: 0.11 });
    this.rainMat.userData.setAmount(0);
    const film = new THREE.Mesh(glassGeo.clone(), this.rainMat);
    film.position.z = setZ - 0.004;
    film.renderOrder = 3;
    film.castShadow = false;
    this.group.add(film);
    this.rainFilm = film;

    // snow ledge on the outer sill — hidden unless it is actually snowing
    const ledge = mesh(rbox(w + 0.10, 0.05, 0.15, [0, -hh - 0.018, -t - 0.065], [0.18, 0, 0], 0.022, 2),
      M.snow, 'snowLedge');
    ledge.visible = false;
    ledge.castShadow = false;
    this.group.add(ledge);
    this.snowLedge = ledge;
  }

  /* ----------------------------------------------------------- exterior -- */

  _buildExterior() {
    const ex = new THREE.Group();
    ex.name = 'outside';
    this.group.add(ex);
    this.exterior = ex;
    const gy = this.groundY = -(0.96 + this.h / 2);

    /* --- sky ------------------------------------------------------------ */
    const c = hex => new THREE.Color(hex);
    this.skyU = {
      uTop: { value: c(SKY.day.top) },
      uMid: { value: c(SKY.day.mid) },
      uHorizon: { value: c(SKY.day.hor) },
      uSun: { value: c(SKY.day.sun) },
      uStarTint: { value: c(0xfff4d8) },
      uSunPos: { value: new THREE.Vector2(...SKY.day.sunPos) },
      uSunSize: { value: SKY.day.sunSize },
      uSunGlow: { value: SKY.day.glow },
      uStars: { value: 0 },
      uHaze: { value: SKY.day.haze },
      uGain: { value: SKY.day.gain },
      uTime: { value: 0 }
    };
    // Far enough back that moving the camera across the room parallaxes the
    // treeline against it; big enough that the opening never runs off its edge.
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(150, 44), new THREE.ShaderMaterial({
      uniforms: this.skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, fog: false
    }));
    sky.position.set(0, 9.5, -34);
    sky.renderOrder = -5;
    ex.add(sky);

    /* --- two cloud sheets at different depths = real parallax ----------- */
    this.clouds = [];
    const cloudDefs = [
      { z: -27.0, y: 11.0, w: 64, h: 17, cov: 0.42, seed: 17, speed: 0.0045, op: 0.9 },
      { z: -20.0, y: 7.5, w: 44, h: 12, cov: 0.55, seed: 91, speed: 0.010, op: 0.75 }
    ];
    for (const d of cloudDefs) {
      const tex = TEX.cloudSheet({ seed: d.seed, coverage: d.cov, softness: 0.42 });
      const m = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: d.op, depthWrite: false, fog: false
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), m);
      plane.position.set(0, d.y, d.z);
      plane.renderOrder = -4;
      plane.userData.speed = d.speed;
      ex.add(plane);
      this.clouds.push(plane);
    }

    /* --- ground + treeline ----------------------------------------------
     *
     * Both were `MeshStandardMaterial`, i.e. lit by the *room's* rig. That is
     * wrong twice over. Physically the rig is a stand-in for the sun aimed at
     * the baby's chest four metres inside the house, so a tree ten metres out
     * in the garden was being lit by a light that does not exist out there —
     * and at keyIntensity 3.05 it came back at three times its albedo, which is
     * precisely the "washed out and flat" read. Practically it also meant the
     * backdrop's exposure moved whenever anything re-aimed the key.
     *
     * Unlit is the right model for a backdrop: the values are authored, they
     * hold still, and they sit correctly *below* the sky's gain so the treeline
     * reads as a silhouette against a bright sky the way it does through a real
     * window. Aerial perspective — the far trees washing toward the horizon
     * colour — is baked per instance from its z, which is depth cueing the lit
     * version never had at all.
     */
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x7d9a63, fog: false });
    // The outside ground sits at the same height as the nursery floor, so it
    // must start *behind* the wall or it lays a green sheet across the room.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 46), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, gy - 0.03, -23.4);      // spans z −0.4 … −46.4
    ground.renderOrder = -3;
    ex.add(ground);
    this.groundMat = groundMat;

    const treeMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const trunk = tint(xf(new THREE.CylinderGeometry(0.09, 0.13, 1.0, 7), [0, 0.5, 0]), 0x6b513a);
    const foliage = [];
    for (let i = 0; i < 3; i++) {
      foliage.push(tint(xf(new THREE.ConeGeometry(0.82 - i * 0.20, 1.15, 9),
        [0, 1.15 + i * 0.62, 0]), 0xffffff));
    }
    const treeGeo = mergeAll([trunk, ...foliage], { colors: true });
    /* Unlit geometry has no form. A cone with a single flat colour is a
     * triangle, and fourteen of them are a row of triangles — which is exactly
     * how the treeline read once it came off the room's lighting rig. So the
     * shading is *baked into the vertex colours* from the normal: one fixed
     * sun direction (up, and toward the window, so the lit side is the side you
     * can actually see) plus a sky term on up-facing surfaces. It costs
     * nothing, it never changes when the room's key moves, and it is what turns
     * the treeline back into fourteen rounded objects. */
    {
      const nrm = treeGeo.attributes.normal, col = treeGeo.attributes.color;
      const sun = new THREE.Vector3(0.52, 0.70, 0.49).normalize();
      for (let i = 0; i < col.count; i++) {
        const nd = nrm.getX(i) * sun.x + nrm.getY(i) * sun.y + nrm.getZ(i) * sun.z;
        const sky = 0.5 + 0.5 * nrm.getY(i);
        const s = 0.52 + 0.62 * Math.max(0, nd) + 0.14 * sky;
        col.setXYZ(i, col.getX(i) * s, col.getY(i) * s, col.getZ(i) * s);
      }
      col.needsUpdate = true;
    }
    const R = rng(31);
    // Darker and more separated than the old set: unlit, these are the values
    // that actually land on screen, and a treeline needs three or four clearly
    // different greens or it reads as one green blob.
    const greens = [0x5c8a4e, 0x74a25c, 0x4a7644, 0x84ad64];
    const trees = [];
    this._treeBase = [];
    for (let i = 0; i < 14; i++) {
      const s = 0.85 + R() * 0.8;
      const z = -10.5 - R() * 6.5;
      trees.push({
        pos: [-19 + i * 2.8 + R() * 1.8, gy - 0.03, z],
        rot: [0, R() * 3, 0],
        scale: [s * (0.85 + R() * 0.3), s, s * (0.85 + R() * 0.3)],
        color: greens[i % greens.length]
      });
      // 0 at the nearest tree, 1 at the furthest — the aerial-perspective mix.
      this._treeBase.push({ color: greens[i % greens.length], far: (-z - 10.5) / 6.5 });
    }
    const treeMesh = instanced(treeGeo, treeMat, trees, 'trees');
    treeMesh.castShadow = false;
    treeMesh.receiveShadow = false;
    ex.add(treeMesh);
    this.trees = treeMesh;
    this._applyAerial(SKY.day);
  }

  /**
   * Wash the backdrop toward the sky's horizon colour by distance. This is the
   * only depth cue a 14-tree instanced treeline has, and without it the far
   * trees are exactly as saturated as the near ones — the flatness the critique
   * flagged. Re-run whenever the mood changes, because the colour it washes
   * toward is the sky's.
   */
  _applyAerial(sky) {
    if (!this._treeBase || !this.trees) return;
    const hor = new THREE.Color(sky.hor ?? 0xd7e7f2);
    const aerial = sky.aerial ?? 0.42;
    const c = new THREE.Color();
    for (let i = 0; i < this._treeBase.length; i++) {
      const b = this._treeBase[i];
      c.setHex(b.color).lerp(hor, aerial * (0.22 + 0.78 * b.far));
      this.trees.setColorAt(i, c);
    }
    if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
    if (this.groundMat) {
      this.groundMat.color.setHex(
        this.weather === 'snow' ? 0xdfe6ea : (sky.ground ?? 0x7d9a63)
      ).lerp(hor, aerial * 0.5);
    }
  }

  /* ------------------------------------------------------ precipitation -- */

  _buildWeatherFX() {
    const gy = this.groundY;
    const R = rng(53);

    // rain: instanced streaks, wrapped in a slab just outside the glass
    const n = this.tier >= 2 ? 90 : 40;
    const streak = new THREE.PlaneGeometry(0.006, 0.34);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xd6e8f6, transparent: true, opacity: 0.42, depthWrite: false, fog: false,
      side: THREE.DoubleSide
    });
    const rain = new THREE.InstancedMesh(streak, rainMat, n);
    rain.frustumCulled = false;
    rain.castShadow = false;
    rain.visible = false;
    const drops = [];
    for (let i = 0; i < n; i++) {
      drops.push({
        x: (R() - 0.5) * 6, y: gy + R() * 5.2, z: -0.35 - R() * 4.5,
        v: 5.5 + R() * 3.5, len: 0.7 + R() * 0.9
      });
    }
    this.exterior.add(rain);
    this.rain = rain;
    this.drops = drops;

    // snow: soft points, drifting sideways as they fall
    const flakes = this.tier >= 2 ? 240 : 90;
    const pos = new Float32Array(flakes * 3);
    const seeds = new Float32Array(flakes);
    for (let i = 0; i < flakes; i++) {
      pos[i * 3] = (R() - 0.5) * 7;
      pos[i * 3 + 1] = gy + R() * 5.5;
      pos[i * 3 + 2] = -0.3 - R() * 5;
      seeds[i] = R();
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const snowMat = new THREE.PointsMaterial({
      map: TEX.radialSprite({ size: 64, power: 2.0 }),
      color: 0xfdfdff, size: 0.075, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true, fog: false
    });
    const snow = new THREE.Points(snowGeo, snowMat);
    snow.frustumCulled = false;
    snow.visible = false;
    this.exterior.add(snow);
    this.snow = snow;
    this.snowSeeds = seeds;
  }

  /* -------------------------------------------------------- light shaft -- */

  _buildShaft(ctx) {
    const noise = TEX.noiseTexture({ size: 256, period: 6, octaves: 4, seed: 303 });
    const spread = 0.55;
    this.spread = spread;

    /* --- the tapered prism, authored as a unit and scaled per frame ----- */
    const k = 1 + spread;
    const V = [
      [-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0],
      [-k, -k, 1], [k, -k, 1], [k, k, 1], [-k, k, 1]
    ];
    const quads = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]];
    const pos = [];
    for (const q of quads) {
      const [a, b, c, d] = q.map(i => V[i]);
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));

    this.shaftU = {
      uNoise: { value: noise },
      uDepth: { value: null },
      uColor: { value: new THREE.Color(SKY.day.shaft) },
      // Never left unset: the shader normalises this every fragment, and a
      // zero-length axis would give NaN alpha, which an additive HalfFloat
      // buffer propagates as a black hole the size of the beam.
      uAxis: { value: new THREE.Vector3(0.6, -0.65, -0.45).normalize() },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uLen: { value: 1 }, uHalfW: { value: 1 }, uHalfH: { value: 1 },
      uSpread: { value: spread },
      uTime: { value: 0 },
      uIntensity: { value: 0.16 },
      uBarX: { value: this.barX }, uBarY: { value: this.barY },
      uOpen: { value: 1 },
      uHasDepth: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 60 },
      uSoft: { value: 0.30 }          // metres of soft-particle fade
    };
    const shaftMat = new THREE.ShaderMaterial({
      uniforms: this.shaftU,
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false
    });
    const shaft = new THREE.Mesh(geo, shaftMat);
    shaft.frustumCulled = false;
    shaft.renderOrder = 6;
    shaft.position.set(0, 0, -0.03);
    this.group.add(shaft);
    this.shaft = shaft;

    /* --- dust motes living inside the beam ------------------------------ */
    const count = this.tier >= 2 ? 190 : this.tier === 1 ? 100 : 50;
    const R = rng(97);
    const mp = new Float32Array(count * 3);
    const ms = new Float32Array(count);
    const mz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const t = R();
      const kk = 1 + spread * t;
      mp[i * 3] = (R() * 2 - 1) * 0.92 * kk;
      mp[i * 3 + 1] = (R() * 2 - 1) * 0.92 * kk;
      mp[i * 3 + 2] = t;
      ms[i] = 4 + R() * 11;
      mz[i] = R();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('aSize', new THREE.BufferAttribute(ms, 1));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(mz, 1));
    this.moteU = {
      uTime: { value: 0 },
      uLen: { value: 1 }, uHalfW: { value: 1 }, uHalfH: { value: 1 },
      uSpread: { value: spread },
      uPixel: { value: 1 },
      uColor: { value: new THREE.Color(0xfff4e2) },
      uIntensity: { value: 1 }
    };
    const motes = new THREE.Points(mg, new THREE.ShaderMaterial({
      uniforms: this.moteU,
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    }));
    motes.frustumCulled = false;
    motes.renderOrder = 7;
    shaft.add(motes);          // inherits the beam's scale, so the shader maths
    this.motes = motes;        // stays in the same unit space as the prism

    /* --- the pool of light where the beam lands ------------------------- */
    this.poolU = {
      uNoise: { value: noise },
      uColor: { value: new THREE.Color(SKY.day.shaft) },
      uTime: { value: 0 },
      uIntensity: { value: 0.5 },
      uBarX: { value: this.barX }, uBarY: { value: this.barY },
      uOpen: { value: 1 }
    };
    const poolGeo = new THREE.PlaneGeometry(1, 1);
    const pool = new THREE.Mesh(poolGeo, new THREE.ShaderMaterial({
      uniforms: this.poolU,
      vertexShader: SKY_VERT,
      fragmentShader: POOL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    }));
    pool.frustumCulled = false;
    pool.renderOrder = 5;
    this.group.add(pool);
    this.pool = pool;

    // ambient room dust, if the FX system is up — the motes above only live
    // inside the beam, and a room needs a little air everywhere else too
    try {
      this._dust = ctx?.fx?.emitter?.('dust', { rate: 2.5, area: [3.2, 1.8, 3.2] });
    } catch (e) { this._dust = null; }

    this._buildWeatherFX();
  }

  /* ------------------------------------------------------------ curtains -- */

  _buildCurtains() {
    const M = this.M, w = this.w, h = this.h;
    const hw = w / 2, hh = h / 2;
    const poleY = hh + 0.17, poleZ = 0.14;
    const poleLen = w + 0.62;

    const pole = [xf(new THREE.CylinderGeometry(0.016, 0.016, poleLen, 12), [0, poleY, poleZ], [0, 0, Math.PI / 2])];
    for (const sx of [-1, 1]) {
      pole.push(xf(lathe([
        [0, 0], [0.020, 0.004], [0.030, 0.020], [0.026, 0.040], [0.014, 0.052], [0, 0.056]
      ], 14), [sx * (poleLen / 2 + 0.005), poleY, poleZ], [0, 0, sx * Math.PI / 2]));
      // wall brackets
      pole.push(xf(new THREE.CylinderGeometry(0.010, 0.010, poleZ, 8), [sx * (hw + 0.10), poleY, poleZ / 2], [Math.PI / 2, 0, 0]));
    }
    this.group.add(mesh(mergeAll(pole), M.brass, 'curtainPole'));

    this.panelW = hw + 0.14;
    this.panelH = h + 0.36;
    this.panels = [];
    const ringGeo = new THREE.TorusGeometry(0.024, 0.005, 8, 18);
    ringGeo.rotateY(Math.PI / 2);

    for (const sx of [-1, 1]) {
      // 52 columns over 6 pleats is ~8 quads per fold: with a cosine lobe that
      // is coarse enough that each fold reads as three flat facets catching
      // three different specular values — the "hard-edged striped ribbon" look.
      // 88 puts ~14 quads on a fold, which is the point at which the shading
      // across a pleat goes continuous. It is one geometry and one draw call
      // either way; the only cost is 3 k vertices in a 500 k-triangle frame.
      const geo = drapedPanel(this.panelW, this.panelH, { cols: 88, rows: 30, thickness: 0.010 });
      const panel = new THREE.Mesh(geo, M.curtain);
      panel.castShadow = true;
      panel.receiveShadow = true;
      panel.name = 'curtain';
      panel.position.set(sx * this.panelW / 2, poleY - this.panelH / 2 - 0.03, poleZ);
      panel.userData.side = sx;
      panel.userData.seed = sx < 0 ? 3.1 : 8.7;
      this.group.add(panel);
      this.panels.push(panel);
    }

    // One instanced mesh for both panels' rings rather than one each — the
    // rings share a geometry and a material, so there is no reason to pay for
    // two draw calls.
    const items = [];
    for (let i = 0; i < RINGS_PER_PANEL * 2; i++) items.push({ pos: [0, 0, 0] });
    const rings = instanced(ringGeo, M.brass, items, 'curtainRings');
    rings.castShadow = false;
    rings.frustumCulled = false;
    this.group.add(rings);
    this.rings = rings;

    this._applyCurtains(this._openNow);
  }

  /** Re-fold the panels and slide the rings for an openness of 0..1. */
  _applyCurtains(open) {
    const poleY = this.h / 2 + 0.17, poleZ = 0.14;
    const sway = Math.sin(this.time * 0.7) * 0.008 * (1 - open * 0.6);
    const rings = this.rings;
    let slot = 0;

    for (const panel of this.panels) {
      const sx = panel.userData.side;
      const narrow = this.panelW * (1 - open * 0.52);
      // Gathering a curtain does not just squash it: the same cloth now lives
      // in a narrower run, so the pleats deepen. But a fold can never be much
      // deeper than half its own pitch or the panel folds back on itself and
      // reads as a row of vertical blinds — so the depth is *capped against the
      // pitch*, which is the physical constraint, rather than freely scaled.
      const folds = 6;
      const pitch = this.panelW * (1 - open * 0.52 * 0.68) / folds;
      const shape = {
        folds,
        amp: Math.min(0.030 + 0.052 * open, pitch * 0.42),
        gather: open,
        drape: 0.030,
        sway,
        seed: panel.userData.seed
      };
      drapeFold(panel.geometry, shape);

      const closedX = sx * this.panelW / 2;
      const openX = sx * (this.w / 2 + 0.14 - narrow / 2);
      panel.position.x = closedX + (openX - closedX) * open;
      panel.position.y = poleY - this.panelH / 2 - 0.03;
      panel.position.z = poleZ;

      // rings ride the top edge of whatever shape the panel is in now
      for (let i = 0; i < RINGS_PER_PANEL; i++) {
        const f = i / (RINGS_PER_PANEL - 1) - 0.5;
        const p = foldProfile(f, 1, shape);
        _v.set(panel.position.x + p.x * this.panelW, poleY - 0.024, poleZ + p.z);
        _q.identity();
        rings.setMatrixAt(slot++, _m.compose(_v, _q, _v2.set(1, 1, 1)));
      }
    }
    rings.instanceMatrix.needsUpdate = true;

    if (this.shaftU) {
      this.shaftU.uOpen.value = Math.max(0.001, open);
      this.poolU.uOpen.value = Math.max(0.001, open);
    }
  }

  /* --------------------------------------------------------------- beam -- */

  /**
   * Point the shaft down the *actual* key light. Deriving it from the rig
   * rather than hard-coding an angle means the beam, the floor pool and the
   * shading on the baby all agree, in every mood.
   */
  _updateBeam(ctx) {
    const key = ctx?.lighting?.key;
    if (key) {
      _v.copy(key.target.position).sub(key.position);
    } else {
      _v.set(0.62, -0.66, -0.42);
    }
    // A light whose target sits exactly on its own position gives a zero-length
    // vector; three's normalize() then returns (0,0,0) rather than throwing,
    // and that zero would reach the shader as uAxis. Fall back explicitly.
    if (_v.lengthSq() < 1e-8) _v.set(0.62, -0.66, -0.42);
    _v.normalize();
    if (_v.y > -0.12) _v.y = -0.12;      // never let the beam run uphill
    _v.normalize();

    // The room yaws the whole unit onto a wall; without this the very first
    // aim runs against a stale identity matrix and the beam points into the
    // wall for one frame.
    this.group.updateWorldMatrix(true, false);
    this.shaft.updateWorldMatrix(true, false);

    const origin = this.shaft.getWorldPosition(_v2);
    const len = THREE.MathUtils.clamp((origin.y - 0.02) / -_v.y, 1.0, 6.5);

    this.shaft.scale.set(this.w * 0.5, this.h * 0.5, len);
    this.shaft.lookAt(origin.x + _v.x, origin.y + _v.y, origin.z + _v.z);
    this.shaftU.uAxis.value.copy(_v);

    // pool: project the four corners of the opening onto the floor
    const pos = this.pool.geometry.attributes.position;
    const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = corners[i];
      _v2.set(cx * this.w * 0.5, cy * this.h * 0.5, -0.03);
      this.group.localToWorld(_v2);
      const t = THREE.MathUtils.clamp((_v2.y - 0.012) / -_v.y, 0, 9);
      _v2.addScaledVector(_v, t);
      _v2.y = 0.012;
      this.group.worldToLocal(_v2);
      pos.setXYZ(i, _v2.x, _v2.y, _v2.z);
    }
    pos.needsUpdate = true;
    this.pool.geometry.computeBoundingSphere();
  }

  /* ------------------------------------------------------------ setters -- */

  /** Recompute every exterior target from mood × weather. */
  _retarget() {
    const s = SKY[this.mood] || SKY.day;
    const w = this.weather;
    const overcast = w === 'rain' ? 0.85 : w === 'snow' ? 0.55 : 0;
    const grey = new THREE.Color(w === 'snow' ? 0xe2e6ef : 0x93999f);
    const C = hex => new THREE.Color(hex);
    // An overcast sky is *dimmer* than a clear one but the cloud deck is
    // still far brighter than the room, so the gain drops rather than dies.
    const gain = (s.gain ?? 1) * (1 - overcast * 0.34);
    this.tgt = {
      top: C(s.top).lerp(grey, overcast * 0.78),
      mid: C(s.mid).lerp(grey, overcast * 0.82),
      hor: C(s.hor).lerp(grey, overcast * 0.70),
      sun: C(s.sun).multiplyScalar(1 - overcast * 0.92),
      sunSize: s.sunSize,
      sunPos: s.sunPos,
      glow: s.glow * (1 - overcast * 0.85),
      stars: s.stars * (1 - overcast),
      haze: Math.min(1, s.haze + overcast * 0.25),
      /* The cloud sheets are plain unlit planes drawn over the sky, and they
       * were the one part of the exterior that never got the exposure the sky
       * got — so as soon as `gain` went up they became the *darkest* thing in
       * the opening, which is backwards: a sunlit cloud is the brightest
       * surface in any daytime frame. Multiplying them through the same gain
       * fixes the read and, not incidentally, is where the frame's genuine
       * near-white now comes from. `Color` components above 1 are a linear
       * multiplier on a MeshBasicMaterial, which is exactly what is wanted. */
      cloudColor: C(s.cloud).lerp(C(0x8d939c), overcast * 0.62)
        .multiplyScalar(gain * 1.06),
      cloudOpacity: Math.min(1, 0.35 + overcast * 0.6 + (w === 'clear' ? 0.25 : 0.4)),
      shaftColor: C(s.shaft).lerp(C(0xc4d0e2), overcast * 0.85),
      // "Overcast light is diffuse: the beam does not vanish, it goes soft" was
      // the right instinct and the wrong number. At 0.28 of a 1.55 golden shaft
      // the beam was still 0.43 — plainly visible as a hard sun shaft lying
      // across the wall in `60-weather-rain`, which is the single loudest tell
      // that nothing about the light had changed. Under a rain deck there is no
      // beam at all; what is left is the barely-there brightening of the air
      // near the glass.
      shaftI: s.shaftI * (w === 'rain' ? 0.055 : w === 'snow' ? 0.30 : 1),
      gain
    };
    this._applyAerial({
      hor: this.tgt.hor.getHex(),
      ground: s.ground,
      aerial: (s.aerial ?? 0.42) + overcast * 0.2
    });
  }

  setMood(name, instant = false) {
    if (SKY[name]) this.mood = name;
    this._retarget();
    if (instant) this._snapSky();
  }

  setWeather(name, instant = false) {
    this.weather = ['clear', 'rain', 'snow'].includes(name) ? name : 'clear';
    this._retarget();
    const rain = this.weather === 'rain';
    const snow = this.weather === 'snow';
    if (this.rain) this.rain.visible = rain;
    if (this.snow) this.snow.visible = snow;
    if (this.snowLedge) this.snowLedge.visible = snow;
    this.rainMat.userData.setAmount(rain ? 1 : 0);
    /* The room's `setWeather` (room.js:640) only ever set a bounce scale and
     * handed the string down here, so the *rig* never heard about the weather
     * at all and `60-weather-rain` came out as the clear frame at 86% exposure
     * with an identical hue. The window is the object the weather is happening
     * to and it is already on this call path, so it is the right place to tell
     * the rig — see `LightingRig.setWeather` and the `WEATHER` table there for
     * what overcast actually does to a key, a fill and a shadow kernel. */
    this._ctx?.lighting?.setWeather?.(this.weather);
    if (instant) this._snapSky();
  }

  /** 0 = drawn across the window, 1 = pulled fully back. */
  setCurtains(open, instant = false) {
    this.open = THREE.MathUtils.clamp(open, 0, 1);
    if (instant) {
      this._openNow = this.open;
      this._applyCurtains(this._openNow);
    }
  }

  _snapSky() {
    const T = this.tgt, U = this.skyU;
    U.uTop.value.copy(T.top);
    U.uMid.value.copy(T.mid);
    U.uHorizon.value.copy(T.hor);
    U.uSun.value.copy(T.sun);
    U.uSunPos.value.set(T.sunPos[0], T.sunPos[1]);
    U.uSunSize.value = T.sunSize;
    U.uSunGlow.value = T.glow;
    U.uStars.value = T.stars;
    U.uHaze.value = T.haze;
    U.uGain.value = T.gain ?? 1;
    for (const c of this.clouds) {
      c.material.color.copy(T.cloudColor);
      c.material.opacity = T.cloudOpacity * (c.userData.speed > 0.008 ? 0.8 : 1);
    }
    this.shaftU.uColor.value.copy(T.shaftColor);
    this.poolU.uColor.value.copy(T.shaftColor);
    this._moteColor(T);
    this._writeShaftIntensity(T.shaftI);
  }

  /**
   * Dust motes are the one thing in a sunbeam that genuinely *is* a specular —
   * a 30 µm particle catching a direct hit off the sun is a point source, and
   * at 2.6× the beam's own colour their cores are the only pixels in a room
   * shot that reach the top of the curve honestly. Also the reason `61`'s
   * manifest entry asks for motes and the critique found none: at the beam's
   * colour they were dimmer than the wall behind them.
   */
  _moteColor(T) {
    this.moteU.uColor.value.copy(T.shaftColor)
      .lerp(_WHITE, 0.42).multiplyScalar(2.6);
  }

  _writeShaftIntensity(i) {
    // Raised across the board. These are *additive* over the scene, so when the
    // room's exposure went up ~1/5 stop and the ambient came up with it, the
    // beam's contribution stayed fixed in absolute terms and therefore fell in
    // relative terms — it stopped being visible as airborne light at all in the
    // wide shot. The beam is meant to be the best thing in that frame.
    //
    // Up again with the exponential falloff above: the new profile has no
    // plateau and drops far faster down the beam, so the same peak needs a
    // larger multiplier to deliver the same amount of visible light.
    this.shaftU.uIntensity.value = 1.55 * i;
    this.poolU.uIntensity.value = 1.10 * i;
    this.moteU.uIntensity.value = 0.95 * Math.min(1.4, i);
  }

  /** What the room should feed its window-bounce light. */
  shaftStrength() { return this._shaftI ?? (this.tgt ? this.tgt.shaftI : 1); }
  skyTint() { return this.skyU.uMid.value; }

  pickables() {
    return [...this._pick, this.glass, ...this.panels];
  }

  /* --------------------------------------------------------------- tick -- */

  update(dt, ctx) {
    if (ctx) this._ctx = ctx;
    this.time += dt;
    const t = this.time;
    const T = this.tgt;
    const k = 1 - Math.exp(-dt * 2.4);

    this.skyU.uTime.value = t;
    this.shaftU.uTime.value = t;
    this.poolU.uTime.value = t;
    this.moteU.uTime.value = t;
    this.rainMat.userData.tick(t);

    /* --- crossfade the whole exterior toward the current mood/weather --- */
    const U = this.skyU;
    U.uTop.value.lerp(T.top, k);
    U.uMid.value.lerp(T.mid, k);
    U.uHorizon.value.lerp(T.hor, k);
    U.uSun.value.lerp(T.sun, k);
    U.uSunPos.value.x += (T.sunPos[0] - U.uSunPos.value.x) * k;
    U.uSunPos.value.y += (T.sunPos[1] - U.uSunPos.value.y) * k;
    U.uSunSize.value += (T.sunSize - U.uSunSize.value) * k;
    U.uSunGlow.value += (T.glow - U.uSunGlow.value) * k;
    U.uStars.value += (T.stars - U.uStars.value) * k;
    U.uHaze.value += (T.haze - U.uHaze.value) * k;
    U.uGain.value += ((T.gain ?? 1) - U.uGain.value) * k;
    this._shaftI = (this._shaftI ?? T.shaftI) + (T.shaftI - (this._shaftI ?? T.shaftI)) * k;
    this._writeShaftIntensity(this._shaftI);
    this.shaftU.uColor.value.lerp(T.shaftColor, k);
    this.poolU.uColor.value.lerp(T.shaftColor, k);
    this._moteColor(T);

    for (const c of this.clouds) {
      c.material.map.offset.x = (c.material.map.offset.x + dt * c.userData.speed) % 1;
      c.material.color.lerp(T.cloudColor, k);
      const target = T.cloudOpacity * (c.userData.speed > 0.008 ? 0.8 : 1);
      c.material.opacity += (target - c.material.opacity) * k;
    }

    /* --- precipitation --------------------------------------------------- */
    if (this.rain.visible) {
      _q.setFromEuler(_e.set(0, 0, 0.12));       // rain leans with the wind
      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i];
        d.y -= d.v * dt;
        d.x += dt * 0.55;
        if (d.y < this.groundY) { d.y = this.groundY + 5.2; d.x -= 6 * Math.random(); }
        _m.compose(_v.set(d.x, d.y, d.z), _q, _v2.set(1, d.len, 1));
        this.rain.setMatrixAt(i, _m);
      }
      this.rain.instanceMatrix.needsUpdate = true;
    }
    if (this.snow.visible) {
      const p = this.snow.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const s = this.snowSeeds[i];
        let y = p.getY(i) - dt * (0.28 + s * 0.30);
        let x = p.getX(i) + Math.sin(t * 0.6 + s * 7) * dt * 0.35;
        if (y < this.groundY) { y = this.groundY + 5.5; x = (Math.random() - 0.5) * 7; }
        p.setXY(i, x, y);
      }
      p.needsUpdate = true;
    }

    /* --- curtains: snap to the target, then breathe ---------------------- */
    if (Math.abs(this.open - this._openNow) > 0.002) {
      this._openNow += (this.open - this._openNow) * Math.min(1, dt * 3.2);
      this._applyCurtains(this._openNow);
      this._breeze = 0;
    } else {
      this._openNow = this.open;
      // a re-fold is ~600 vertices; 8 Hz is plenty for a draught
      this._breeze = (this._breeze || 0) + dt;
      if (this._breeze > 0.125) { this._breeze = 0; this._applyCurtains(this._openNow); }
    }

    /* --- beam + point size ------------------------------------------------ */
    this._updateBeam(ctx);
    const cam = ctx?.camera;
    const rnd = ctx?.renderer;
    if (cam && rnd) {
      rnd.getSize(this._size || (this._size = new THREE.Vector2()));
      const px = this._size.y * (rnd.getPixelRatio ? rnd.getPixelRatio() : 1);
      this.moteU.uPixel.value = (px / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))) * 0.0016;

      // Soft-particle depth for the beam. The resolved depth target is one
      // frame behind (it is produced *after* the scene draws), which is exactly
      // what the FX system does and is invisible on something this slow-moving.
      rnd.getDrawingBufferSize(this._buf || (this._buf = new THREE.Vector2()));
      this.shaftU.uResolution.value.copy(this._buf);
      this.shaftU.uNear.value = cam.near;
      this.shaftU.uFar.value = cam.far;
      const depth = ctx?.pipeline?.depthResolve?.texture;
      if (depth) {
        this.shaftU.uDepth.value = depth;
        this.shaftU.uHasDepth.value = 1;
      }
    }
  }

  dispose() {
    this._dust?.stop?.();
    this.group.traverse(o => {
      o.geometry?.dispose?.();
      if (o.material && o.material.uniforms) o.material.dispose?.();
    });
  }
}
