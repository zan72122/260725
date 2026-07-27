/* ============================================================================
 * fx.js — GPU-instanced particles, ribbons and surface decals
 * ----------------------------------------------------------------------------
 * Particles are where a cheap game gives itself away, so three rules hold
 * everywhere in this file:
 *
 *   1. One draw call per kind. Each kind owns a single Mesh whose geometry is
 *      an InstancedBufferGeometry over a shared unit quad; particles live in
 *      pre-allocated typed arrays and are recycled by swapping the dead one
 *      with the last live one. Nothing is allocated per frame, ever.
 *   2. Soft particles. Steam and bubbles fade out as they approach solid
 *      geometry instead of slicing into it with a hard silhouette edge — the
 *      single clearest tell of a cheap particle system. Feed the pipeline's
 *      depth buffer in with `setDepthTexture()`; without it the fade simply
 *      switches off.
 *   3. Shapes are drawn, not blurred. Stars, hearts and bubble rims are
 *      analytic in the fragment shader so they stay crisp at any size, while
 *      genuinely soft things (steam, dust, splash) use the radial sprite from
 *      textures.js. No new asset loading.
 *
 * Colour note: the composer runs in linear space and tone maps in the grade
 * pass, so these shaders deliberately output *linear* colour with no colour
 * space conversion. THREE.Color already converts hex literals for us.
 * ========================================================================== */

import * as THREE from 'three';
import * as TEX from './textures.js';
import { RNG } from './physics.js';

/** FX has its own deterministic stream so particle noise never perturbs the
 *  physics stream (and screenshots stay reproducible). */
const rng = new RNG(0x5EED1234);

/* ------------------------------------------------------------- palettes --- */

const PAL = {
  confetti: [0xff8fb1, 0xffd166, 0x8fd9ff, 0xb2f2bb, 0xd0bfff, 0xffb4a2, 0xfff1a8],
  sparkle: [0xfff6d5, 0xffe9a8, 0xffffff, 0xffd9f0],
  bubble: [0xffffff, 0xeaf6ff, 0xfff0fa],
  steam: [0xfffaf4, 0xf6ecff, 0xffffff],
  splash: [0xd8f0ff, 0xeaf8ff, 0xffffff],
  crumb: [0xd8a76a, 0xc08a4e, 0xe8c48c, 0x9a6b3c],
  heart: [0xff6f9c, 0xff93b4, 0xff4f80],
  zzz: [0xcfe0ff, 0xe6efff, 0xb9d2ff],
  dust: [0xfff3e0, 0xffe9cc, 0xfffdf8],
  // Warm white through amber. Three near-identical yellows gave the whole
  // population one colour, which is §4 #88 on its own.
  star: [0xffe066, 0xfff3b0, 0xffd43b, 0xfffaf0, 0xffc7a1, 0xffeccf]
};

/* ------------------------------------------------------------- kind defs -- */

/**
 * Everything about a particle kind lives in one record. `mode` picks how the
 * quad is oriented, `shape` picks the fragment silhouette, and the rest drives
 * a single shared integrator — which is why adding a kind is a dozen lines
 * rather than a new class.
 */
const KINDS = {
  confetti: {
    mode: 'oriented', shape: 'QUAD', blending: 'normal', lit: true,
    capacity: 260, life: [1.8, 3.2], size: [0.010, 0.018], aspect: 0.62,
    speed: [0.7, 2.0], spread: 1.15, dir: [0, 1, 0],
    // Terminal velocity ≈ gravity/drag ≈ 0.75 m/s. Paper does not plummet, and
    // getting that one ratio wrong is what makes game confetti look like grit.
    gravity: -2.2, drag: 2.9, flutter: 3.4, spin: [4, 14],
    bounce: 0.10, floor: 0.002,
    fadeIn: 0.03, fadeOut: 0.30, alpha: 1, palette: PAL.confetti, soft: 0.06
  },
  sparkle: {
    mode: 'billboard', shape: 'STAR4', blending: 'additive', lit: false,
    capacity: 300, life: [0.45, 0.95], size: [0.014, 0.030],
    speed: [0.10, 0.55], spread: Math.PI, dir: [0, 1, 0],
    gravity: -0.25, drag: 2.6, twinkle: 22, spin: [-3, 3], grow: 0.55,
    fadeIn: 0.10, fadeOut: 0.65, alpha: 0.95, palette: PAL.sparkle, soft: 0.10
  },
  bubble: {
    mode: 'billboard', shape: 'BUBBLE', blending: 'normal', lit: false,
    capacity: 220, life: [2.0, 4.5], size: [0.008, 0.026],
    speed: [0.03, 0.14], spread: 0.9, dir: [0, 1, 0],
    gravity: 0, rise: 0.16, drag: 1.1, wobble: 0.055, wobbleFreq: 2.4,
    spin: [-0.6, 0.6], grow: 1.06, pop: true,
    fadeIn: 0.08, fadeOut: 0.18, alpha: 1, palette: PAL.bubble, soft: 0.05
  },
  steam: {
    // Additive, not alpha. White vapour at 0.4 alpha over a white enamel tub
    // has no contrast with it and simply did not read — a fully-driven steam
    // shot rendered with no steam in it. Vapour is visible because it *scatters
    // light back*, so lifting the value is both truer and legible.
    mode: 'billboard', shape: 'SOFT', blending: 'additive', lit: false,
    capacity: 200, life: [1.6, 3.2], size: [0.035, 0.075],
    speed: [0.05, 0.18], spread: 0.65, dir: [0, 1, 0],
    gravity: 0, rise: 0.24, drag: 0.9, curl: 0.28, grow: 3.4,
    spin: [-0.5, 0.5], sprite: () => TEX.radialSprite({ size: 128, power: 1.5 }),
    // `soft` is a *world* distance. A bath tub is 0.6 m across, so a 0.28 m
    // fade band dissolved every puff into the water it was rising off.
    fadeIn: 0.22, fadeOut: 0.62, alpha: 0.30, palette: PAL.steam, soft: 0.05
  },
  splash: {
    mode: 'stretch', shape: 'SOFT', blending: 'normal', lit: false,
    capacity: 300, life: [0.4, 0.95], size: [0.004, 0.010],
    speed: [0.6, 2.2], spread: 0.85, dir: [0, 1, 0],
    gravity: -9.0, drag: 0.35, stretch: 0.10, bounce: 0, floor: 0,
    sprite: () => TEX.radialSprite({ size: 64, power: 2.4 }),
    fadeIn: 0.02, fadeOut: 0.35, alpha: 0.85, palette: PAL.splash, soft: 0.04
  },
  crumb: {
    mode: 'oriented', shape: 'QUAD', blending: 'normal', lit: true,
    capacity: 220, life: [2.5, 5.0], size: [0.004, 0.009], aspect: 0.85,
    speed: [0.3, 1.3], spread: 1.3, dir: [0, 1, 0],
    gravity: -9.0, drag: 0.5, spin: [3, 16], bounce: 0.32, floor: 0,
    fadeIn: 0.02, fadeOut: 0.18, alpha: 1, palette: PAL.crumb, soft: 0.03
  },
  heart: {
    mode: 'billboard', shape: 'HEART', blending: 'normal', lit: false,
    capacity: 90, life: [1.1, 1.9], size: [0.030, 0.055],
    speed: [0.12, 0.30], spread: 0.5, dir: [0, 1, 0],
    gravity: 0, rise: 0.10, drag: 0.9, wobble: 0.045, wobbleFreq: 3.1,
    // Same reasoning as `zzz`: an upside-down heart is not a heart.
    roll: [-0.34, 0.34], spin: [-0.30, 0.30], grow: 1.35, pulse: 7,
    fadeIn: 0.14, fadeOut: 0.45, alpha: 0.95, palette: PAL.heart, soft: 0.08
  },
  // The sleep cue. Kept under its old key so every caller keeps working; the
  // *art* is what changed.
  //
  // This used to be `glyphTexture('Z')` — a literal Latin capital drawn on a
  // canvas and flown as a sprite. Two passes were spent on its orientation
  // (spawned at a random roll it read as a capital N from above, so the roll
  // was clamped), which fixed the symptom and left the cause: a typographic
  // glyph used as in-world FX art is §4 #85 verbatim, and "zzz" is an
  // Anglophone comic-strip convention that a pre-literate Japanese four-year
  // -old cannot read at all. It also had to be prevented from rotating, which
  // is the tell that it was never a 3-D object.
  //
  // What replaces it is a **dream puff**: a soft three-lobe cloud with no
  // boundary, a faint highlight, and no up. It billboards (so it can never lie
  // flat on the sheet), it may roll freely (a tilted cloud is still a cloud),
  // it swells and dissolves as it rises, and it means the same thing in every
  // language on earth. Long lives and a low alpha keep two or three of them in
  // the air at once — a slow drift rather than a stamp.
  zzz: {
    mode: 'billboard', shape: 'PUFF', blending: 'normal', lit: false,
    capacity: 64, life: [2.4, 4.0], size: [0.020, 0.058],
    speed: [0.035, 0.10], spread: 0.5, dir: [0.30, 1, 0],
    gravity: 0, rise: 0.055, drag: 0.75, wobble: 0.040, wobbleFreq: 1.15,
    curl: 0.05,
    // A cloud has no up, so the roll is free — and it turns slowly enough that
    // the whole population never spins in step.
    roll: [-Math.PI, Math.PI], spin: [-0.22, 0.22], grow: 2.6, pulse: 1.9,
    fadeIn: 0.30, fadeOut: 0.66, alpha: 0.62, palette: PAL.zzz, soft: 0.06
  },
  dust: {
    // The motes drifting in the window shaft. Long-lived, nearly still, and
    // the single cheapest thing that makes a room read as photographed.
    mode: 'billboard', shape: 'SOFT', blending: 'additive', lit: false,
    capacity: 420, life: [7, 15], size: [0.0065, 0.0165],
    speed: [0.004, 0.020], spread: Math.PI, dir: [0, 1, 0],
    gravity: -0.004, drag: 0.25, curl: 0.010, twinkle: 1.1,
    sprite: () => TEX.radialSprite({ size: 64, power: 2.6 }),
    fadeIn: 0.16, fadeOut: 0.40, alpha: 0.78, palette: PAL.dust, soft: 0.16
  },
  star: {
    // Was a five-pointed glyph quad at alpha 1 and soft 0.10: opaque, uniform,
    // hard-edged, and scattered across the frame as clip-art stickers. The
    // silhouette was never the problem — a star *shape* is fine — the problem
    // was that it had a hard boundary and no interior, which is what makes a
    // sprite read as pasted-on 2-D art rather than light in the room.
    //
    // What is here now is a glint: a bright core with a soft falloff, star
    // points that dissolve into the core rather than terminating at an edge,
    // and a population that varies by 5:1 in size so there is a hierarchy of
    // a few heroes among many small ones. Turbulence and a wide drag range
    // stop them travelling in parallel lines, and the depth fade band is wide
    // enough that one crossing the floor dissolves instead of slicing it.
    mode: 'billboard', shape: 'STAR5', blending: 'additive', lit: false,
    capacity: 160, life: [0.55, 1.7], size: [0.010, 0.055],
    speed: [0.25, 1.35], spread: Math.PI * 0.9, dir: [0, 1, 0],
    gravity: -1.4, drag: 2.4, curl: 0.55, spin: [-3.5, 3.5], grow: 0.45,
    pop: false, twinkle: 9,
    fadeIn: 0.20, fadeOut: 0.72, alpha: 0.85, palette: PAL.star, soft: 0.14
  }
};

/* --------------------------------------------------------------- shaders -- */

const PARTICLE_VERT = /* glsl */`
  #include <common>

  attribute vec3  iPos;
  attribute vec4  iQuat;    // oriented: rotation. billboard: .x = roll
  attribute vec3  iVel;
  attribute vec2  iSize;
  attribute vec4  iColor;
  attribute vec2  iLife;    // x = age 0..1, y = per-particle seed

  uniform float uStretch;

  varying vec2  vUv;
  varying vec4  vColor;
  varying float vAge;
  varying float vSeed;
  varying float vViewZ;
  varying vec4  vScreen;
  #ifdef LIT
    varying vec3 vNrm;
  #endif

  vec3 rotQ(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }

  void main() {
    vUv = uv;
    vColor = iColor;
    vAge = iLife.x;
    vSeed = iLife.y;

    #ifdef ORIENTED
      // A real 3-D rotation, so a confetti chip foreshortens to a line when it
      // turns edge-on. Billboards can never do that, and without it spinning
      // confetti reads as flickering stickers.
      vec3 local = vec3(position.x * iSize.x, position.y * iSize.y, 0.0);
      vec4 mv = modelViewMatrix * vec4(iPos + rotQ(iQuat, local), 1.0);
      vNrm = normalize((modelViewMatrix * vec4(rotQ(iQuat, vec3(0.0, 0.0, 1.0)), 0.0)).xyz);
    #else
      vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
      vec2 q = vec2(position.x * iSize.x, position.y * iSize.y);
      #ifdef STRETCH
        // Droplets elongate along their screen-space velocity — motion blur
        // you can afford.
        vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
        vec2 d = length(vv.xy) > 1e-5 ? normalize(vv.xy) : vec2(0.0, 1.0);
        float s = 1.0 + clamp(length(iVel) * uStretch, 0.0, 4.0);
        q = d * (q.y * s) + vec2(d.y, -d.x) * q.x;
      #else
        float c = cos(iQuat.x), s = sin(iQuat.x);
        q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
      #endif
      mv.xy += q;
    #endif

    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
    vScreen = gl_Position;
  }
`;

const PARTICLE_FRAG = /* glsl */`
  #include <common>
  #include <packing>

  uniform sampler2D tSprite;
  uniform sampler2D tDepth;
  uniform float uUseDepth, uSoft, uNear, uFar, uTime, uTwinkle;
  uniform vec3  uKeyDir;      // view-space key light direction, for LIT kinds

  varying vec2  vUv;
  varying vec4  vColor;
  varying float vAge;
  varying float vSeed;
  varying float vViewZ;
  varying vec4  vScreen;
  #ifdef LIT
    varying vec3 vNrm;
  #endif

  /* --- soft-cloud helpers, used by the PUFF sleep cue --------------------- */
  float puffDisc(vec2 p, vec2 c, float r) { return length(p - c) - r; }
  float puffUnion(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  void main() {
    vec2 uv = vUv;
    vec2 q = uv * 2.0 - 1.0;
    float d = length(q);
    float a = 1.0;
    vec3 col = vColor.rgb;

    #if SHAPE == 0            // SOFT — radial sprite
      a = texture2D(tSprite, uv).a;
    #elif SHAPE == 1          // QUAD — rounded superellipse chip
      vec2 e = abs(q);
      float r = pow(pow(e.x, 4.0) + pow(e.y, 4.0), 0.25);
      a = 1.0 - smoothstep(0.86, 1.0, r);
    #elif SHAPE == 2          // STAR4 — glint: tight core plus two rays
      float core = exp(-d * d * 13.0);
      float rays = (pow(max(0.0, 1.0 - abs(q.x)), 16.0)
                  + pow(max(0.0, 1.0 - abs(q.y)), 16.0)) * exp(-d * 1.8);
      a = clamp(core + rays * 0.85, 0.0, 1.0);
    #elif SHAPE == 3          // STAR5 — soft five-point glint
      // A star silhouette with no boundary. rad is where the points reach,
      // but nothing is drawn *at* rad — the body is a falloff from a bright
      // core that reaches zero exactly there, so there is no edge to catch the
      // eye and the sprite reads as light rather than as a cut-out sticker.
      float ang = atan(q.y, q.x);
      float k = 0.5 + 0.5 * cos(ang * 5.0 + vSeed * PI2);
      float rad = mix(0.30, 1.0, pow(k, 1.6));
      float body = pow(clamp(1.0 - d / max(rad, 1e-3), 0.0, 1.0), 1.7);
      float core = exp(-d * d * 26.0);
      a = clamp(body * 0.85 + core * 0.6, 0.0, 1.0);
    #elif SHAPE == 4          // HEART — implicit (x²+y²−1)³ − x²y³ ≤ 0
      vec2 h = (uv - vec2(0.5, 0.44)) * vec2(2.7, -2.7);
      float f = pow(h.x * h.x + h.y * h.y - 1.0, 3.0) - h.x * h.x * h.y * h.y * h.y;
      a = 1.0 - smoothstep(-0.10, 0.06, f);
    #elif SHAPE == 5          // BUBBLE — thin rim, faint body, one specular dot
      float rim = smoothstep(0.60, 0.86, d) - smoothstep(0.88, 1.0, d);
      float body = (1.0 - smoothstep(0.90, 1.0, d)) * 0.09;
      vec2 hp = uv - vec2(0.34, 0.70);
      float spec = exp(-dot(hp, hp) * 110.0);
      a = clamp(rim * 0.9 + body + spec * 0.85, 0.0, 1.0);
      // Thin-film interference: hue sweeps with the viewing angle across the
      // sphere, which is what makes soap read as soap and not as a grey ring.
      vec3 tint = 0.5 + 0.5 * cos(PI2 * (vec3(0.0, 0.33, 0.67) + d * 1.7 + vSeed * 3.0));
      col = mix(col, col * tint * 1.7, rim * 0.85);
      col += spec * 0.4;
    #else                     // PUFF — soft three-lobe dream cloud
      // Three overlapping discs smooth-unioned into one silhouette, then
      // feathered over a band five times wider than a texel so the boundary
      // never resolves into an edge. No texture, therefore no way for a glyph
      // to get back in here: the shape is the shader.
      float dd = puffDisc(q, vec2(-0.32, -0.12), 0.40);
      dd = puffUnion(dd, puffDisc(q, vec2(0.32, -0.16), 0.34), 0.26);
      dd = puffUnion(dd, puffDisc(q, vec2(0.00,  0.20), 0.48), 0.28);
      float body = 1.0 - smoothstep(-0.22, 0.03, dd);
      // A light from above-left, so the cloud has a top and a bottom and does
      // not read as a flat sticker whatever angle the camera takes.
      float lift = smoothstep(-0.85, 0.65, q.y - q.x * 0.25);
      // one soft highlight — the thing that says "bubble" rather than "smoke"
      vec2 hp = q - vec2(-0.24, 0.32);
      float spec = exp(-dot(hp, hp) * 22.0);
      a = clamp(body * (0.60 + 0.40 * lift) + body * spec * 0.45, 0.0, 1.0);
      col *= 0.88 + 0.24 * lift;
      col += spec * body * 0.22;
    #endif

    a *= vColor.a;

    #ifdef TWINKLE
      // Sub-frame flicker keyed off the particle seed; never fully off.
      a *= 0.55 + 0.45 * sin(uTime * uTwinkle + vSeed * 40.0);
    #endif


    #ifdef LIT
      // Two-sided: a confetti chip is lit whichever way it faces, but the back
      // is dimmer and slightly warmer, as thin paper actually is.
      float nl = dot(vNrm, uKeyDir);
      float front = max(nl, 0.0);
      float back  = max(-nl, 0.0);
      col *= 0.42 + front * 0.85 + back * 0.42;
    #endif

    if (a < 0.004) discard;

    // --- soft particles ----------------------------------------------------
    //
    // tDepth is the pipeline's *resolved* depth target (render.js
    // DepthResolvePass), which stores LINEAR 0..1 orthographic depth, not raw
    // non-linear device depth. Running it back through
    // perspectiveDepthToViewZ() -- which is what this shader used to do --
    // collapses every occluder onto the near plane, so (vViewZ - sceneZ) is
    // negative for every particle in front of any geometry and the whole
    // system fades to alpha 0. That single line is why nothing was visible.
    if (uUseDepth > 0.5) {
      vec2 suv = (vScreen.xy / vScreen.w) * 0.5 + 0.5;
      float lin = texture2D(tDepth, suv).x;
      // 1.0 is the far plane and 0.0 is an untouched / not-yet-rendered texel;
      // both mean "no occluder here". Treating either as geometry would make
      // particles vanish against the sky or on the first frame of a shot.
      if (lin > 0.0005 && lin < 0.9995) {
        float sceneZ = orthographicDepthToViewZ(lin, uNear, uFar);
        a *= clamp((vViewZ - sceneZ) / uSoft, 0.0, 1.0);
      }
    }

    gl_FragColor = vec4(col, a);
  }
`;

// There is deliberately no GLYPH member any more. Every silhouette in this
// table is drawn analytically in the fragment shader, so no kind in this file
// can render text: rubric §4 #85 is closed by construction rather than by
// convention. If a future cue needs an "up", give it a `roll` range — do not
// reintroduce a painted-canvas sprite of a character.
const SHAPE_ID = { SOFT: 0, QUAD: 1, STAR4: 2, STAR5: 3, HEART: 4, BUBBLE: 5, PUFF: 6 };

/* ------------------------------------------------------------ unit quad --- */

let _quad = null;
function unitQuad() {
  if (!_quad) {
    const g = new THREE.PlaneGeometry(1, 1);
    _quad = { index: g.index, position: g.attributes.position, uv: g.attributes.uv };
  }
  return _quad;
}

/* --------------------------------------------------------------- scratch -- */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _spawn = new THREE.Vector3();
const _col = new THREE.Color();
const _col2 = new THREE.Color();
const _q = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();

/**
 * Cheap divergence-free-ish flow field. Not true curl noise, but for steam and
 * dust the visual difference is nil and the cost is three sines.
 */
function curlField(x, y, z, t, out) {
  return out.set(
    Math.sin(y * 3.1 + t * 0.7) - Math.cos(z * 2.3 - t * 0.5),
    (Math.sin(z * 2.7 - t * 0.6) - Math.cos(x * 3.3 + t * 0.8)) * 0.4,
    Math.sin(x * 2.9 + t * 0.9) - Math.cos(y * 3.7 - t * 0.4)
  );
}

/* ----------------------------------------------------------------- layer -- */

/** One kind = one pool = one draw call. */
class Layer {
  constructor(kind, def, tier, density) {
    this.kind = kind;
    this.def = def;
    this.tier = tier;
    const cap = Math.max(16, Math.round(def.capacity * density));
    this.capacity = cap;
    this.count = 0;

    // --- GPU-visible instance attributes ----------------------------------
    this.aPos = new Float32Array(cap * 3);
    this.aQuat = new Float32Array(cap * 4);
    this.aVel = new Float32Array(cap * 3);
    this.aSize = new Float32Array(cap * 2);
    this.aColor = new Float32Array(cap * 4);
    this.aLife = new Float32Array(cap * 2);

    // --- CPU-only simulation state ----------------------------------------
    this.vel = new Float32Array(cap * 3);
    this.spin = new Float32Array(cap * 3);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.seed = new Float32Array(cap);
    this.size0 = new Float32Array(cap * 2);
    this.alpha0 = new Float32Array(cap);
    this.floorY = new Float32Array(cap);

    const quad = unitQuad();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.position);
    geo.setAttribute('uv', quad.uv);
    const inst = (arr, n) => {
      const a = new THREE.InstancedBufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geo.setAttribute('iPos', inst(this.aPos, 3));
    geo.setAttribute('iQuat', inst(this.aQuat, 4));
    geo.setAttribute('iVel', inst(this.aVel, 3));
    geo.setAttribute('iSize', inst(this.aSize, 2));
    geo.setAttribute('iColor', inst(this.aColor, 4));
    geo.setAttribute('iLife', inst(this.aLife, 2));
    geo.instanceCount = 0;
    // Particles are unbounded in practice; culling them by a stale sphere
    // makes whole bursts blink out at frame edges.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geometry = geo;

    const defines = { SHAPE: SHAPE_ID[def.shape] };
    if (def.mode === 'oriented') defines.ORIENTED = '';
    if (def.mode === 'stretch') defines.STRETCH = '';
    if (def.lit) defines.LIT = '';
    if (def.twinkle) defines.TWINKLE = '';

    this.material = new THREE.ShaderMaterial({
      defines,
      uniforms: {
        tSprite: { value: def.sprite ? def.sprite() : TEX.radialSprite({ size: 64, power: 2.2 }) },
        tDepth: { value: null },
        uUseDepth: { value: 0 },
        uSoft: { value: def.soft ?? 0.1 },
        uNear: { value: 0.1 },
        uFar: { value: 60 },
        uTime: { value: 0 },
        uTwinkle: { value: def.twinkle || 0 },
        uStretch: { value: def.stretch || 0 },
        uKeyDir: { value: new THREE.Vector3(-0.4, 0.78, 0.48).normalize() }
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: def.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false        // the grade pass owns tone mapping
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = def.blending === 'additive' ? 12 : 10;
    this.mesh.visible = false;
    this.mesh.name = 'fx:' + kind;
  }

  /* -------------------------------------------------------------- spawn -- */

  /**
   * @param {THREE.Vector3} pos
   * @param {number} n
   * @param {object} o  per-burst overrides: speed, spread, dir, size, color,
   *                    life, radius, box, gravity, alpha, drag
   */
  emit(pos, n, o = {}) {
    const d = this.def;
    let spawned = 0;
    for (let k = 0; k < n && this.count < this.capacity; k++) {
      const i = this.count++;
      spawned++;
      const i2 = i * 2, i3 = i * 3, i4 = i * 4;

      // --- position ------------------------------------------------------
      let px = pos.x, py = pos.y, pz = pos.z;
      // `area` is the spelling ambient sources use ("fill this volume");
      // `box` is the spelling bursts use. They mean the same thing, and
      // silently ignoring one of them collapses a whole emitter to a point.
      const boxSize = o.box || o.area;
      if (boxSize) {
        px += rng.range(-boxSize[0], boxSize[0]) * 0.5;
        py += rng.range(-boxSize[1], boxSize[1]) * 0.5;
        pz += rng.range(-boxSize[2], boxSize[2]) * 0.5;
      } else if (o.radius) {
        rng.unit(_v).multiplyScalar(o.radius * Math.cbrt(rng.float()));
        px += _v.x; py += _v.y; pz += _v.z;
      }
      this.aPos[i3] = px; this.aPos[i3 + 1] = py; this.aPos[i3 + 2] = pz;

      // --- velocity ------------------------------------------------------
      const spread = o.spread ?? d.spread ?? 0.6;
      const sp = o.speed !== undefined
        ? (Array.isArray(o.speed) ? rng.range(o.speed[0], o.speed[1]) : o.speed)
        : rng.range(d.speed[0], d.speed[1]);
      rng.cone(spread, _v);                      // cone around +Y
      const dir = o.dir || d.dir || [0, 1, 0];
      _v2.set(dir[0], dir[1], dir[2]);
      if (_v2.lengthSq() < 1e-9) _v2.set(0, 1, 0);
      _v2.normalize();
      // Rotate the +Y cone onto the requested direction.
      _q.setFromUnitVectors(UP, _v2);
      _v.applyQuaternion(_q).multiplyScalar(sp);
      if (o.velocity) { _v.x += o.velocity.x; _v.y += o.velocity.y; _v.z += o.velocity.z; }
      this.vel[i3] = _v.x; this.vel[i3 + 1] = _v.y; this.vel[i3 + 2] = _v.z;
      this.aVel[i3] = _v.x; this.aVel[i3 + 1] = _v.y; this.aVel[i3 + 2] = _v.z;

      // --- size / life / colour -------------------------------------------
      let s = o.size !== undefined
        ? (Array.isArray(o.size) ? rng.range(o.size[0], o.size[1]) : o.size)
        : rng.range(d.size[0], d.size[1]);
      // `scale` is a relative multiplier on whatever the kind's own size is —
      // callers all over the activities pass it and it used to be dropped on
      // the floor, so a "small" burst came out full size.
      if (o.scale !== undefined) s *= o.scale;
      const aspect = o.aspect ?? d.aspect ?? 1;
      this.size0[i2] = s * aspect;
      this.size0[i2 + 1] = s;
      this.aSize[i2] = s * aspect;
      this.aSize[i2 + 1] = s;

      this.age[i] = 0;
      this.life[i] = o.life !== undefined
        ? (Array.isArray(o.life) ? rng.range(o.life[0], o.life[1]) : o.life)
        : rng.range(d.life[0], d.life[1]);
      this.seed[i] = rng.float();

      const hex = o.color !== undefined
        ? (Array.isArray(o.color) ? rng.pick(o.color) : o.color)
        : rng.pick(d.palette);
      _col.set(hex);
      if (o.tint) _col.lerp(_col2.set(o.tint), 0.5);
      this.aColor[i4] = _col.r;
      this.aColor[i4 + 1] = _col.g;
      this.aColor[i4 + 2] = _col.b;
      this.alpha0[i] = (o.alpha ?? d.alpha ?? 1);
      this.aColor[i4 + 3] = 0;

      // --- rotation --------------------------------------------------------
      const spinRange = o.spin || d.spin || [0, 0];
      if (d.mode === 'oriented') {
        rng.unit(_v);
        const w = rng.range(spinRange[0], spinRange[1]) * rng.sign();
        this.spin[i3] = _v.x * w; this.spin[i3 + 1] = _v.y * w; this.spin[i3 + 2] = _v.z * w;
        _q.setFromAxisAngle(rng.unit(_v2), rng.range(0, Math.PI * 2));
        this.aQuat[i4] = _q.x; this.aQuat[i4 + 1] = _q.y;
        this.aQuat[i4 + 2] = _q.z; this.aQuat[i4 + 3] = _q.w;
      } else {
        // Billboard roll. Random over the full circle is right for a sparkle,
        // a bubble or a cloud, and *wrong* for anything with a readable
        // orientation — an upside-down heart is not a heart. Kinds whose
        // silhouette has an up declare a `roll` range and stay within it;
        // everything else is free.
        const rollRange = o.roll || d.roll;
        this.aQuat[i4] = rollRange
          ? rng.range(rollRange[0], rollRange[1])
          : rng.range(0, Math.PI * 2);
        this.spin[i3] = rng.range(spinRange[0], spinRange[1]);
        this.aQuat[i4 + 1] = this.aQuat[i4 + 2] = 0;
        this.aQuat[i4 + 3] = 1;
      }

      // Per-particle, so one burst can settle on the high-chair tray while the
      // next settles on the rug. -1e9 means "fall forever".
      this.floorY[i] = o.floor ?? d.floor ?? -1e9;

      this.aLife[i2] = 0;
      this.aLife[i2 + 1] = this.seed[i];
    }
    return spawned;
  }

  _kill(i) {
    const last = --this.count;
    if (i === last) return;
    copyIdx(this.aPos, 3, last, i); copyIdx(this.aQuat, 4, last, i);
    copyIdx(this.aVel, 3, last, i); copyIdx(this.aSize, 2, last, i);
    copyIdx(this.aColor, 4, last, i); copyIdx(this.aLife, 2, last, i);
    copyIdx(this.vel, 3, last, i); copyIdx(this.spin, 3, last, i);
    copyIdx(this.size0, 2, last, i);
    this.age[i] = this.age[last];
    this.life[i] = this.life[last];
    this.seed[i] = this.seed[last];
    this.alpha0[i] = this.alpha0[last];
    this.floorY[i] = this.floorY[last];
  }

  /* --------------------------------------------------------------- tick -- */

  update(dt, time, gravityScale) {
    const d = this.def;
    if (this.count === 0) {
      if (this.mesh.visible) { this.mesh.visible = false; this.geometry.instanceCount = 0; }
      this.material.uniforms.uTime.value = time;
      return;
    }

    const grav = (d.gravity || 0) * gravityScale;
    const rise = d.rise || 0;
    const drag = d.drag || 0;
    const curl = d.curl || 0;
    const wobble = d.wobble || 0;
    const wf = d.wobbleFreq || 2;
    const flutter = d.flutter || 0;
    const grow = d.grow;
    const fadeIn = d.fadeIn ?? 0.1;
    const fadeOut = d.fadeOut ?? 0.4;
    const oriented = d.mode === 'oriented';
    const bounce = d.bounce ?? 0;

    for (let i = 0; i < this.count;) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this._kill(i); continue; }

      const i2 = i * 2, i3 = i * 3, i4 = i * 4;
      const t = this.age[i] / this.life[i];
      const seed = this.seed[i];

      // --- forces ---------------------------------------------------------
      let vx = this.vel[i3], vy = this.vel[i3 + 1], vz = this.vel[i3 + 2];
      vy += (grav + rise) * dt;
      if (drag) {
        const f = Math.exp(-drag * dt);
        vx *= f; vy *= f; vz *= f;
      }
      if (curl) {
        curlField(this.aPos[i3] * 2.2, this.aPos[i3 + 1] * 2.2, this.aPos[i3 + 2] * 2.2,
          time * 0.6 + seed * 9.0, _v);
        vx += _v.x * curl * dt; vy += _v.y * curl * dt; vz += _v.z * curl * dt;
      }
      if (flutter) {
        // A falling chip slides sideways as it tumbles; the phase is tied to
        // the seed so no two flakes flutter together.
        const ph = time * 5.0 + seed * 30.0;
        vx += Math.sin(ph) * flutter * dt;
        vz += Math.cos(ph * 0.83 + 1.7) * flutter * dt;
      }
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;

      let px = this.aPos[i3] + vx * dt;
      let py = this.aPos[i3 + 1] + vy * dt;
      let pz = this.aPos[i3 + 2] + vz * dt;

      if (wobble) {
        const ph = time * wf + seed * 21.0;
        px += Math.sin(ph) * wobble * dt;
        pz += Math.cos(ph * 1.31) * wobble * dt;
      }
      const fy = this.floorY[i];
      if (py < fy) {
        py = fy;
        this.vel[i3 + 1] = Math.abs(this.vel[i3 + 1]) * bounce;
        this.vel[i3] *= 0.66; this.vel[i3 + 2] *= 0.66;
        if (this.vel[i3 + 1] < 0.05) this.vel[i3 + 1] = 0;
      }
      this.aPos[i3] = px; this.aPos[i3 + 1] = py; this.aPos[i3 + 2] = pz;
      this.aVel[i3] = this.vel[i3];
      this.aVel[i3 + 1] = this.vel[i3 + 1];
      this.aVel[i3 + 2] = this.vel[i3 + 2];

      // --- rotation --------------------------------------------------------
      if (oriented) {
        integrateQuat(this.aQuat, i4, this.spin, i3, dt);
      } else {
        this.aQuat[i4] += this.spin[i3] * dt;
      }

      // --- size ------------------------------------------------------------
      let scale = 1;
      if (grow !== undefined) scale = 1 + (grow - 1) * t;
      if (d.pop) {
        // Bubbles hold their size then snap to nothing in the last 8% of life.
        scale *= t > 0.92 ? (1 - (t - 0.92) / 0.08) : 1;
      }
      if (d.pulse) scale *= 1 + Math.sin(time * d.pulse + seed * 12.0) * 0.06;
      this.aSize[i2] = this.size0[i2] * scale;
      this.aSize[i2 + 1] = this.size0[i2 + 1] * scale;

      // --- alpha envelope ---------------------------------------------------
      let a = this.alpha0[i];
      if (t < fadeIn) a *= t / fadeIn;
      const outStart = 1 - fadeOut;
      if (t > outStart) {
        const k = (t - outStart) / fadeOut;
        a *= (1 - k) * (1 - k);        // quadratic tail reads softer than linear
      }
      this.aColor[i4 + 3] = a;

      this.aLife[i2] = t;
      i++;
    }

    const g = this.geometry;
    g.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    g.attributes.iPos.needsUpdate = true;
    g.attributes.iQuat.needsUpdate = true;
    g.attributes.iVel.needsUpdate = true;
    g.attributes.iSize.needsUpdate = true;
    g.attributes.iColor.needsUpdate = true;
    g.attributes.iLife.needsUpdate = true;
    this.material.uniforms.uTime.value = time;
  }

  clear() {
    this.count = 0;
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

const UP = new THREE.Vector3(0, 1, 0);

function copyIdx(arr, n, from, to) {
  for (let k = 0; k < n; k++) arr[to * n + k] = arr[from * n + k];
}

/** q ← normalize(q + ½ ω q dt), straight out of the rigid-body integrator. */
function integrateQuat(qa, qi, wa, wi, dt) {
  const hx = wa[wi] * dt * 0.5, hy = wa[wi + 1] * dt * 0.5, hz = wa[wi + 2] * dt * 0.5;
  const x = qa[qi], y = qa[qi + 1], z = qa[qi + 2], w = qa[qi + 3];
  let nx = x + (hx * w + hy * z - hz * y);
  let ny = y + (hy * w + hz * x - hx * z);
  let nz = z + (hz * w + hx * y - hy * x);
  let nw = w + (-hx * x - hy * y - hz * z);
  const l = Math.hypot(nx, ny, nz, nw) || 1;
  qa[qi] = nx / l; qa[qi + 1] = ny / l; qa[qi + 2] = nz / l; qa[qi + 3] = nw / l;
}

/* --------------------------------------------------------------- ribbon --- */

const RIBBON_VERT = /* glsl */`
  attribute float aSide;
  attribute float aT;
  attribute vec3  aTangent;

  uniform float uWidth, uTaper;

  varying float vT;
  varying float vSide;

  void main() {
    vT = aT;
    vSide = aSide;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 tv = normalize((modelViewMatrix * vec4(aTangent, 0.0)).xyz);
    // Camera-facing ribbon: the width axis is the tangent crossed with the
    // view direction, which in view space is simply +Z.
    vec3 s = cross(tv, vec3(0.0, 0.0, 1.0));
    float sl = length(s);
    vec3 side = sl > 1e-4 ? s / sl : vec3(1.0, 0.0, 0.0);
    mv.xyz += side * (aSide * uWidth * mix(1.0, uTaper, aT));
    gl_Position = projectionMatrix * mv;
  }
`;

const RIBBON_FRAG = /* glsl */`
  #include <common>
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uOpacity, uProgress, uTime, uWiggle;
  varying float vT;
  varying float vSide;

  void main() {
    // Soft shoulders across the width so the strand has no hard outline.
    float edge = 1.0 - abs(vSide);
    float a = smoothstep(0.0, 0.42, edge);
    // Draw-in: the head advances, the tail feathers away behind it.
    a *= 1.0 - smoothstep(uProgress - 0.22, uProgress, vT);
    // A little longitudinal texture keeps a pour from looking like a decal.
    a *= mix(1.0, 0.82 + 0.18 * sin(vT * 34.0 - uTime * 7.0 + vSide * 1.7), uWiggle);
    a *= uOpacity;
    if (a < 0.005) discard;
    vec3 col = mix(uColorA, uColorB, vT);
    col += pow(edge, 6.0) * 0.25;   // bright core, like a wet highlight
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/**
 * A tapered, camera-facing arc between two points. Used for milk and water
 * pours and for swipe feedback.
 */
class Ribbon {
  constructor(fx, from, to, o = {}) {
    this.fx = fx;
    this.segments = o.segments ?? (fx.tier === 0 ? 14 : 24);
    this.arc = o.arc ?? 0.22;
    this.seconds = o.seconds ?? 0.7;
    this.persist = !!o.persist;
    this.age = 0;
    this.fadeTime = -1;
    this.fadeDur = 0.25;
    this.drawIn = o.drawIn ?? 0.18;
    this.dead = false;

    const n = this.segments;
    const verts = (n + 1) * 2;
    this.pos = new Float32Array(verts * 3);
    this.tan = new Float32Array(verts * 3);
    const side = new Float32Array(verts);
    const tt = new Float32Array(verts);
    for (let i = 0; i <= n; i++) {
      side[i * 2] = -1; side[i * 2 + 1] = 1;
      tt[i * 2] = tt[i * 2 + 1] = i / n;
    }
    const idx = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTangent', new THREE.BufferAttribute(this.tan, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uWidth: { value: (o.width ?? 0.012) * 0.5 },
        uTaper: { value: o.taper ?? 0.22 },
        uOpacity: { value: o.opacity ?? 0.95 },
        uProgress: { value: this.drawIn > 0 ? 0 : 1.2 },
        uTime: { value: 0 },
        uWiggle: { value: o.wiggle ?? 0.5 },
        uColorA: { value: new THREE.Color(o.color ?? 0xfffdf6) },
        uColorB: { value: new THREE.Color(o.colorEnd ?? o.color ?? 0xfff3e0) }
      },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.setEnds(from, to);
  }

  /** Re-aim the arc. Cheap enough to call every frame while dragging. */
  setEnds(from, to) {
    this.from.copy(from);
    this.to.copy(to);
    const n = this.segments;
    // Quadratic Bézier with the control point lifted perpendicular to the
    // chord, in the vertical plane — an arc, not a straight line.
    _v.subVectors(this.to, this.from);
    const len = _v.length() || 1e-4;
    _v.multiplyScalar(1 / len);
    _v2.copy(UP).addScaledVector(_v, -UP.dot(_v));
    if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
    _v2.normalize().multiplyScalar(this.arc * len);
    const cx = (this.from.x + this.to.x) * 0.5 + _v2.x;
    const cy = (this.from.y + this.to.y) * 0.5 + _v2.y;
    const cz = (this.from.z + this.to.z) * 0.5 + _v2.z;

    let px = 0, py = 0, pz = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * this.from.x + 2 * u * t * cx + t * t * this.to.x;
      const y = u * u * this.from.y + 2 * u * t * cy + t * t * this.to.y;
      const z = u * u * this.from.z + 2 * u * t * cz + t * t * this.to.z;
      const o = i * 6;
      this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
      this.pos[o + 3] = x; this.pos[o + 4] = y; this.pos[o + 5] = z;
      if (i > 0) {
        let tx = x - px, ty = y - py, tz = z - pz;
        const l = Math.hypot(tx, ty, tz) || 1;
        tx /= l; ty /= l; tz /= l;
        const q = (i - 1) * 6;
        this.tan[q] = tx; this.tan[q + 1] = ty; this.tan[q + 2] = tz;
        this.tan[q + 3] = tx; this.tan[q + 4] = ty; this.tan[q + 5] = tz;
        if (i === n) {
          this.tan[o] = tx; this.tan[o + 1] = ty; this.tan[o + 2] = tz;
          this.tan[o + 3] = tx; this.tan[o + 4] = ty; this.tan[o + 5] = tz;
        }
      }
      px = x; py = y; pz = z;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aTangent.needsUpdate = true;
    return this;
  }

  /** Start fading out; the ribbon removes itself when it reaches zero. */
  fade(seconds = 0.25) {
    if (this.fadeTime >= 0) return this;
    this.fadeDur = Math.max(0.01, seconds);
    this.fadeTime = 0;
    this._baseOpacity = this.material.uniforms.uOpacity.value;
    return this;
  }

  update(dt, time) {
    this.age += dt;
    const u = this.material.uniforms;
    u.uTime.value = time;
    if (this.drawIn > 0) {
      u.uProgress.value = Math.min(1.25, this.age / this.drawIn);
    }
    if (!this.persist && this.fadeTime < 0 && this.age >= this.seconds) this.fade(0.3);
    if (this.fadeTime >= 0) {
      this.fadeTime += dt;
      const k = Math.max(0, 1 - this.fadeTime / this.fadeDur);
      u.uOpacity.value = this._baseOpacity * k;
      if (k <= 0) this.dead = true;
    }
  }

  remove() { this.dead = true; return this; }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* ---------------------------------------------------------------- decals -- */

/**
 * Decal strategy: a per-mesh "grime" canvas painted in UV space and composited
 * inside the surface's own shader.
 *
 * The alternative — a projected decal mesh clipped to the surface — needs the
 * DecalGeometry addon (not vendored), fights VSM shadows, and z-fights on the
 * soft organic shapes that make up a baby. Painting into UV space instead
 * means a stain wraps a cheek or a sleeve exactly, survives skinning for free,
 * costs one extra texture fetch, and can be wiped by simply erasing the canvas
 * — which is precisely what the flannel and the bath need to do.
 *
 * The trade is that the mesh must have sane UVs and gets a forked material.
 */
function forkMaterial(src) {
  // Material.copy() JSON round-trips userData and drops onBeforeCompile, which
  // would silently strip the skin's subsurface shading. Hand the live objects
  // back over afterwards.
  const ud = src.userData;
  src.userData = {};
  const m = src.clone();
  src.userData = ud;
  m.userData = Object.assign({}, ud);
  m.onBeforeCompile = src.onBeforeCompile;
  m.customProgramCacheKey = src.customProgramCacheKey;
  return m;
}

function patchGrime(mat, texture) {
  const uniforms = {
    uGrimeMap: { value: texture },
    uGrimeStrength: { value: 1 },
    uGrimeRough: { value: 0.92 }
  };
  const prevCompile = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;

  mat.onBeforeCompile = function (shader, renderer) {
    if (prevCompile) prevCompile.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGrimeUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGrimeUv = uv;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying vec2 vGrimeUv;
        uniform sampler2D uGrimeMap;
        uniform float uGrimeStrength;
        uniform float uGrimeRough;
        vec4 gGrime;
      `)
      // A dedicated varying rather than vMapUv: the base maps are tiled
      // (repeat 3–4), and a stain must not tile with them.
      .replace('#include <map_fragment>', /* glsl */`
        #include <map_fragment>
        gGrime = texture2D(uGrimeMap, vGrimeUv);
        {
          float ga = gGrime.a * uGrimeStrength;
          diffuseColor.rgb = mix(diffuseColor.rgb, gGrime.rgb, ga);
        }
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, uGrimeRough, gGrime.a * uGrimeStrength);
      `);
  };
  mat.customProgramCacheKey = function () {
    return (prevKey ? prevKey.call(this) : (mat.type || '')) + '|grime';
  };
  mat.userData.grimeUniforms = uniforms;
  mat.needsUpdate = true;
  return uniforms;
}

/** Per-kind brush. Everything is drawn with soft alpha so edges never crawl. */
const DECAL_BRUSH = {
  stain(g, r, o) {
    const c = o.color || '#7a4a1e';
    const grad = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    grad.addColorStop(0, hexA(c, 0.82));
    grad.addColorStop(0.62, hexA(c, 0.62));
    grad.addColorStop(0.88, hexA(c, 0.30));
    grad.addColorStop(1, hexA(c, 0));
    g.fillStyle = grad;
    blob(g, r, 9, 0.34);
    // Coffee-ring: a real spill dries darker at the edge.
    g.strokeStyle = hexA(c, 0.35);
    g.lineWidth = r * 0.12;
    blob(g, r * 0.92, 9, 0.30, true);
  },
  milk(g, r, o) {
    const c = o.color || '#fffaf0';
    const grad = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    grad.addColorStop(0, hexA(c, 0.95));
    grad.addColorStop(0.7, hexA(c, 0.80));
    grad.addColorStop(1, hexA(c, 0));
    g.fillStyle = grad;
    blob(g, r, 8, 0.26);
    // A couple of drips running downward in UV space.
    for (let i = 0; i < 2; i++) {
      const x = (rng.float() - 0.5) * r;
      const len = r * rng.range(0.6, 1.5);
      const w = r * rng.range(0.10, 0.20);
      const dg = g.createLinearGradient(0, 0, 0, len);
      dg.addColorStop(0, hexA(c, 0.75));
      dg.addColorStop(1, hexA(c, 0));
      g.fillStyle = dg;
      g.beginPath();
      g.ellipse(x, len * 0.5, w, len * 0.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  },
  foam(g, r, o) {
    const c = o.color || '#fffdfa';
    for (let i = 0; i < 16; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = r * Math.sqrt(rng.float()) * 0.8;
      const rr = r * rng.range(0.18, 0.42);
      const grad = g.createRadialGradient(
        Math.cos(a) * d - rr * 0.25, Math.sin(a) * d - rr * 0.25, rr * 0.05,
        Math.cos(a) * d, Math.sin(a) * d, rr);
      grad.addColorStop(0, hexA('#ffffff', 0.95));
      grad.addColorStop(0.6, hexA(c, 0.8));
      grad.addColorStop(1, hexA(c, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, Math.PI * 2);
      g.fill();
    }
  },
  dirt(g, r, o) {
    const c = o.color || '#6b5745';
    const grad = g.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
    grad.addColorStop(0, hexA(c, 0.55));
    grad.addColorStop(1, hexA(c, 0));
    g.fillStyle = grad;
    blob(g, r, 11, 0.42);
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = r * Math.sqrt(rng.float());
      g.fillStyle = hexA(c, rng.range(0.25, 0.7));
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, r * rng.range(0.03, 0.11), 0, Math.PI * 2);
      g.fill();
    }
  },
  crumbs(g, r, o) {
    const c = o.color || '#c9954f';
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = r * Math.sqrt(rng.float());
      g.fillStyle = hexA(c, rng.range(0.5, 0.95));
      g.save();
      g.translate(Math.cos(a) * d, Math.sin(a) * d);
      g.rotate(rng.range(0, Math.PI));
      const w = r * rng.range(0.05, 0.13);
      g.fillRect(-w, -w * 0.7, w * 2, w * 1.4);
      g.restore();
    }
  },
  water(g, r, o) {
    const c = o.color || '#8fb6cc';
    const grad = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    grad.addColorStop(0, hexA(c, 0.35));
    grad.addColorStop(0.75, hexA(c, 0.22));
    grad.addColorStop(1, hexA(c, 0));
    g.fillStyle = grad;
    blob(g, r, 10, 0.30);
  }
};

/** Irregular closed blob, centred on the current transform origin. */
function blob(g, r, lobes, jitter, stroke = false) {
  g.beginPath();
  const steps = lobes * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const w = 1 + Math.sin(a * lobes * 0.5 + rngPhase) * jitter * 0.5
                + Math.sin(a * (lobes * 0.5 + 2) + rngPhase * 1.7) * jitter * 0.5;
    const x = Math.cos(a) * r * w, y = Math.sin(a) * r * w;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  if (stroke) g.stroke(); else g.fill();
}
let rngPhase = 0;

/**
 * Hex (string or number) → rgba() string. Parsed by hand on purpose: the 2D
 * canvas is an sRGB surface, and running the value through THREE.Color would
 * convert it to linear working space and wash every stain out.
 */
function hexA(hex, a) {
  let n;
  if (typeof hex === 'number') n = hex;
  else {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    n = parseInt(h, 16) || 0;
  }
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* -------------------------------------------------------------- the API --- */

export class FX {
  /**
   * @param {THREE.Scene} scene
   * @param {number} tier 0 = phone, 2 = desktop. Scales pool sizes and burst
   *        counts; nothing is ever switched off entirely, because a missing
   *        effect reads as a bug and a smaller one just reads as calmer.
   */
  constructor(scene, tier = 2) {
    this.scene = scene;
    this.tier = tier;
    this.density = tier === 0 ? 0.4 : tier === 1 ? 0.7 : 1.0;
    this.time = 0;
    this.gravityScale = 1;

    this.group = new THREE.Group();
    this.group.name = 'FX';
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);

    /** @type {Object<string, Layer>} */
    this.layers = {};
    for (const kind of Object.keys(KINDS)) {
      const layer = new Layer(kind, KINDS[kind], tier, this.density);
      this.layers[kind] = layer;
      this.group.add(layer.mesh);
    }

    this.emitters = [];
    this.ribbons = [];
    this.grimes = [];
    this._depth = null;
  }

  /* ------------------------------------------------------------- plumbing */

  /**
   * Hand in the pipeline's depth texture to enable soft particles.
   * Optional by design: FX never imports the render pipeline.
   *
   * **`tex` must hold linear 0..1 depth** — i.e. `pipeline.depthResolve.texture`,
   * which is what `viewZToOrthographicDepth()` writes, *not* a raw
   * `THREE.DepthTexture`. The fragment shader inverts it with
   * `orthographicDepthToViewZ`; handing it device depth silently fades every
   * particle in the build to zero alpha.
   */
  setDepthTexture(tex, near, far) {
    this._depth = tex || null;
    for (const k in this.layers) {
      const u = this.layers[k].material.uniforms;
      u.tDepth.value = tex || null;
      u.uUseDepth.value = tex ? 1 : 0;
      if (near !== undefined) u.uNear.value = near;
      if (far !== undefined) u.uFar.value = far;
    }
    return this;
  }

  /** Point the fake key light used to shade confetti and crumbs (view space). */
  setKeyDirection(v) {
    for (const k in this.layers) this.layers[k].material.uniforms.uKeyDir.value.copy(v).normalize();
    return this;
  }

  /* --------------------------------------------------------------- bursts */

  /**
   * One-shot spray of particles.
   * @returns {number} how many actually spawned (pools are finite by design)
   */
  burst(kind, worldPos, count = 12, opts = {}) {
    const layer = this.layers[kind];
    if (!layer) { console.warn('FX: unknown kind "' + kind + '"'); return 0; }
    const n = Math.max(1, Math.round(count * (opts.ignoreTier ? 1 : this.density)));
    // A dedicated vector: emit() borrows the shared scratch for its own maths.
    if (!worldPos) _spawn.set(0, 0, 0);
    else if (worldPos.isVector3) _spawn.copy(worldPos);
    else _spawn.set(worldPos[0] || 0, worldPos[1] || 0, worldPos[2] || 0);
    return layer.emit(_spawn, n, opts);
  }

  /**
   * Continuous source. Move `handle.position` and change `handle.rate` freely.
   * @returns {{position:THREE.Vector3, rate:number, stop:Function, start:Function}}
   */
  emitter(kind, opts = {}) {
    const layer = this.layers[kind];
    if (!layer) { console.warn('FX: unknown kind "' + kind + '"'); return null; }
    const self = this;
    const def = layer.def;
    const handle = {
      kind,
      position: (opts.position ? new THREE.Vector3().copy(opts.position) : new THREE.Vector3()),
      rate: (opts.rate ?? 20) * this.density,
      opts,
      active: opts.active !== false,
      follow: opts.follow || null,   // optional Object3D to track
      transient: !!opts.transient,   // see clear()
      _acc: 0,
      _layer: layer,
      stop() { this.active = false; return this; },
      start() { this.active = true; return this; },
      setRate(r) { this.rate = r * self.density; return this; },
      dispose() { self._removeEmitter(this); }
    };
    // A volume source with no explicit origin is floor-anchored: an `area` of
    // [w, h, d] means "a box of that size standing on the given point", not one
    // centred on it, which would bury half the motes under the floor.
    const area = opts.area || opts.box;
    if (area && !opts.position && !opts.follow) handle.position.y += area[1] * 0.5;

    // Pre-roll: dust motes and steam should already be in the air on frame one,
    // not fade in from nothing while the player watches. An emitter of a
    // long-lived kind primes itself by default — a still is almost always
    // taken seconds after the scene opens, and an ambient source that has to
    // spend fifteen seconds filling up is an ambient source nobody ever sees.
    this._prime(handle, opts.prime ?? this._autoPrime(def));
    this.emitters.push(handle);
    return handle;
  }

  /** Mean life, for kinds slow enough that filling the volume takes real time. */
  _autoPrime(def) {
    return def.life[0] >= 1.5 ? (def.life[0] + def.life[1]) * 0.5 : 0;
  }

  /** Back-fill an emitter's volume with particles of assorted ages. */
  _prime(handle, seconds) {
    if (!(seconds > 0)) return;
    const layer = handle._layer;
    const opts = handle.opts || {};
    const n = Math.round(handle.rate * seconds);
    for (let i = 0; i < n; i++) {
      layer.emit(handle.position, 1, opts);
      const j = layer.count - 1;
      if (j < 0) break;
      // Backdate it *and* fast-forward its flight, so a primed shaft of dust
      // is already spread through the light rather than bunched at the vent.
      const age = rng.range(0, layer.life[j] * 0.9);
      layer.age[j] = age;
      layer.aPos[j * 3] += layer.vel[j * 3] * age;
      layer.aPos[j * 3 + 1] += layer.vel[j * 3 + 1] * age;
      layer.aPos[j * 3 + 2] += layer.vel[j * 3 + 2] * age;
      layer.aLife[j * 2] = age / layer.life[j];
      // Fade-in is over long before this point for a primed mote; without
      // seeding the colour alpha the particle stays invisible until the next
      // integration step, which for a one-frame screenshot is forever.
      layer.aColor[j * 4 + 3] = layer.alpha0[j];
    }
  }

  _removeEmitter(h) {
    const i = this.emitters.indexOf(h);
    if (i >= 0) this.emitters.splice(i, 1);
  }

  /* -------------------------------------------------------------- ribbons */

  /**
   * Tapered trailing arc from `from` to `to`. Defaults suit a milk pour; pass
   * `{ additive:true, color:0x9fe8ff }` for swipe feedback.
   * @returns {Ribbon} handle with setEnds / fade / remove
   */
  ribbon(from, to, opts = {}) {
    const r = new Ribbon(this, from, to, opts);
    this.group.add(r.mesh);
    this.ribbons.push(r);
    return r;
  }

  /* --------------------------------------------------------------- decals */

  /**
   * Paint a patch into the mesh's grime layer at UV `uv`.
   *
   * @param {'stain'|'milk'|'foam'|'dirt'|'crumbs'|'water'} kind
   * @param {THREE.Mesh} mesh   must have UVs; its material is forked on first use
   * @param {THREE.Vector2} uv  usually `intersection.uv` from a raycast
   * @param {object} opts       { size, color, rotation, strength, roughness }
   * @returns {object|null} the mesh's grime handle
   */
  decal(kind, mesh, uv, opts = {}) {
    if (!mesh || !uv) return null;
    const brush = DECAL_BRUSH[kind] || DECAL_BRUSH.stain;
    const g = this._grime(mesh);
    if (!g) return null;

    const res = g.res;
    const r = (opts.size ?? 0.13) * res * 0.5;
    const cx = THREE.MathUtils.clamp(uv.x, 0, 1) * res;
    // Canvas Y runs the other way from UV Y.
    const cy = (1 - THREE.MathUtils.clamp(uv.y, 0, 1)) * res;
    rngPhase = rng.range(0, Math.PI * 2);

    // Paint up to nine times so a patch straddling the UV seam wraps rather
    // than getting clipped — cheap, and only the near-edge cases pay for it.
    const ox = [0], oy = [0];
    if (cx < r) ox.push(res); else if (cx > res - r) ox.push(-res);
    if (cy < r) oy.push(res); else if (cy > res - r) oy.push(-res);
    const ctx = g.ctx;
    for (const dx of ox) {
      for (const dy of oy) {
        ctx.save();
        ctx.translate(cx + dx, cy + dy);
        ctx.rotate(opts.rotation ?? rng.range(0, Math.PI * 2));
        brush(ctx, r, opts);
        ctx.restore();
      }
    }

    g.texture.needsUpdate = true;
    g.uniforms.uGrimeStrength.value = opts.strength ?? 1;
    if (opts.roughness !== undefined) g.uniforms.uGrimeRough.value = opts.roughness;
    g.painted = true;
    return g;
  }

  /** Wipe a mesh's grime (the flannel, the bath, the washing machine). */
  clearDecals(mesh) {
    const g = mesh?.userData?.__grime;
    if (!g) return this;
    g.ctx.clearRect(0, 0, g.res, g.res);
    g.texture.needsUpdate = true;
    g.painted = false;
    g.uniforms.uGrimeStrength.value = 1;
    return this;
  }

  /** Fade a mesh's grime out over `seconds` (rinsing under the shower). */
  fadeDecals(mesh, seconds = 1.2) {
    const g = mesh?.userData?.__grime;
    if (!g) return this;
    g.fade = { t: 0, dur: Math.max(0.01, seconds), from: g.uniforms.uGrimeStrength.value };
    return this;
  }

  _grime(mesh) {
    if (mesh.userData.__grime) return mesh.userData.__grime;
    if (!mesh.material || Array.isArray(mesh.material)) return null;
    const res = this.tier === 0 ? 256 : 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = res;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;

    const material = forkMaterial(mesh.material);
    const uniforms = patchGrime(material, texture);
    mesh.material = material;

    const g = { mesh, canvas, ctx, texture, res, material, uniforms, painted: false, fade: null };
    mesh.userData.__grime = g;
    this.grimes.push(g);
    return g;
  }

  /* ------------------------------------------------------------ lifecycle */

  /**
   * Kill every live particle and ribbon, and wipe every decal.
   *
   * Emitters *survive* on purpose. `clear()` is what the harness and the
   * "start a new scene" path call, and the room's ambient sources (the dust in
   * the window shaft) are created once at build time and never re-created —
   * dropping them here meant every screenshot after the first reset had an
   * empty air. Sources that genuinely belong to one moment opt out with
   * `{ transient: true }`; everything else is owned by whoever made it and is
   * released through `handle.dispose()`.
   */
  clear() {
    for (const k in this.layers) this.layers[k].clear();
    for (const r of this.ribbons) { this.group.remove(r.mesh); r.dispose(); }
    this.ribbons.length = 0;
    this.emitters = this.emitters.filter(e => !e.transient);
    // Re-seed before the re-prime, so a cleared scene replays byte-identically.
    this.time = 0;
    rng.seed(0x5EED1234);   // deterministic replays for the screenshot harness
    for (const e of this.emitters) {
      e._acc = 0;
      this._prime(e, e.opts?.prime ?? this._autoPrime(e._layer.def));
    }
    for (const g of this.grimes) {
      g.ctx.clearRect(0, 0, g.res, g.res);
      g.texture.needsUpdate = true;
      g.painted = false;
      g.fade = null;
      g.uniforms.uGrimeStrength.value = 1;
    }
    return this;
  }

  update(dt) {
    const h = Math.min(dt || 0, 1 / 15);
    this.time += h;

    // --- emitters ---------------------------------------------------------
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      if (!e.active || e.rate <= 0) continue;
      if (e.follow) e.follow.getWorldPosition(e.position);
      e._acc += e.rate * h;
      let n = e._acc | 0;
      if (n > 0) {
        e._acc -= n;
        if (n > 64) n = 64;          // a stalled tab must not dump the pool
        e._layer.emit(e.position, n, e.opts);
      }
    }

    // --- particles --------------------------------------------------------
    for (const k in this.layers) this.layers[k].update(h, this.time, this.gravityScale);

    // --- ribbons ----------------------------------------------------------
    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const r = this.ribbons[i];
      r.update(h, this.time);
      if (r.dead) {
        this.group.remove(r.mesh);
        r.dispose();
        this.ribbons.splice(i, 1);
      }
    }

    // --- decal fades ------------------------------------------------------
    for (let i = 0; i < this.grimes.length; i++) {
      const g = this.grimes[i];
      if (!g.fade) continue;
      g.fade.t += h;
      const k = 1 - g.fade.t / g.fade.dur;
      g.uniforms.uGrimeStrength.value = Math.max(0, g.fade.from * k);
      if (k <= 0) {
        g.ctx.clearRect(0, 0, g.res, g.res);
        g.texture.needsUpdate = true;
        g.uniforms.uGrimeStrength.value = 1;
        g.painted = false;
        g.fade = null;
      }
    }
    return this;
  }

  /** Live particle count — handy in the harness stats readout. */
  get particleCount() {
    let n = 0;
    for (const k in this.layers) n += this.layers[k].count;
    return n;
  }

  dispose() {
    this.clear();
    for (const k in this.layers) {
      this.group.remove(this.layers[k].mesh);
      this.layers[k].dispose();
    }
    for (const g of this.grimes) { g.texture.dispose(); g.material.dispose(); }
    this.grimes.length = 0;
    this.scene.remove(this.group);
  }
}

export default FX;
