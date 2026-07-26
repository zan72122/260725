/* ============================================================================
 * render.js — Renderer, colour pipeline and post-processing stack
 * ----------------------------------------------------------------------------
 * Target look: a warm, softly-lit toy-photography frame.  The chain is
 *
 *   RenderPass → GTAO → Bloom → Grade(DOF+vignette+grain+CA+LUT) → SMAA
 *
 * with AgX tone mapping applied inside the grade pass so bloom is added in
 * linear space *before* the curve, which is what stops highlights turning
 * chalky.  Quality tiers scale the expensive passes down for phones.
 * ========================================================================== */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* --------------------------------------------------------------- tiers --- */

export const TIER = { LOW: 0, MED: 1, HIGH: 2 };

/**
 * Pick a quality tier. Deliberately conservative: a stuttering 30fps nursery
 * reads as *worse* than a slightly softer 60fps one on a child's tablet.
 */
export function detectTier() {
  const forced = new URLSearchParams(location.search).get('tier');
  if (forced !== null) return Math.max(0, Math.min(2, parseInt(forced, 10) || 0));
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const px = window.innerWidth * window.innerHeight * (window.devicePixelRatio || 1) ** 2;
  if (mem <= 3 || cores <= 4) return TIER.LOW;
  if (px > 3.2e6 && mem <= 6) return TIER.MED;
  return TIER.HIGH;
}

/* --------------------------------------------------------- grade shader --- */

/**
 * Single combined "finishing" pass. Doing DOF, vignette, grain, chromatic
 * aberration, tone mapping and the film-look grade in one shader saves three
 * full-screen round trips versus stacking stock passes.
 */
const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse:     { value: null },
    tDepth:       { value: null },
    uTime:        { value: 0 },
    uResolution:  { value: new THREE.Vector2(1, 1) },
    uExposure:    { value: 1.0 },
    uVignette:    { value: 0.30 },
    uGrain:       { value: 0.014 },
    // 0.0016 put a 3 px rainbow fringe on every high-contrast vertical edge at
    // 1280 wide — the curtain leading edge looked like a compression artefact.
    // Real lens CA on a good wide is well under a pixel in the centre.
    // …and it has to *stop* being a constant term. `0.25 + r2 * 2.4` never
    // reaches zero, so every edge in the frame carried a fringe, just a smaller
    // one — which is what made the drum rim and the rug/floor boundary fringe
    // at frame *centre*. A real lens' lateral CA is a field aberration: it is
    // identically zero on the optical axis and rises steeply in the last
    // fifth of the image circle. `pow(r², n)` is that curve.
    uAberration:  { value: 0.0022 },
    uDofStrength: { value: 0.85 },
    uFocus:       { value: 0.14 },   // view-space depth of the subject
    uFocusRange:  { value: 0.30 },
    uNear:        { value: 0.1 },
    uFar:         { value: 100 },
    uLift:        { value: new THREE.Vector3(0.008, 0.004, 0.014) },
    uGain:        { value: new THREE.Vector3(1.03, 1.005, 0.985) },
    uSaturation:  { value: 1.11 },
    uContrast:    { value: 1.045 },
    uWarmth:      { value: 0.03 },
    // Split toning — the single most useful lever for D38. A warm key against
    // a neutral shadow gives an image luminance range but no *chromatic* range,
    // and that is what makes a render read as "correctly exposed" rather than
    // "lit". Real shadow is not the key minus intensity, it is a different
    // light source: the sky. So shadows get pushed toward that sky, highlights
    // stay with the key. Per-mood values live in lighting.js `MOODS[*].grade`.
    uShadowTint:  { value: new THREE.Vector3(0.88, 0.955, 1.16) },
    uHighTint:    { value: new THREE.Vector3(1.04, 1.0, 0.945) },
    uSplit:       { value: 1.0 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    #include <common>
    #include <packing>

    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float uTime, uExposure, uVignette, uGrain, uAberration;
    uniform float uDofStrength, uFocus, uFocusRange, uNear, uFar;
    uniform float uSaturation, uContrast, uWarmth, uSplit;
    uniform vec2  uResolution;
    uniform vec3  uLift, uGain, uShadowTint, uHighTint;

    float linearDepth(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      #if defined( DEPTH_IS_LINEAR )
        return d;
      #elif PERSPECTIVE_CAMERA == 1
        float vz = perspectiveDepthToViewZ(d, uNear, uFar);
        return viewZToOrthographicDepth(vz, uNear, uFar);
      #else
        return d;
      #endif
    }

    // AgX — gentler highlight rolloff than ACES, keeps pastels from going grey.
    vec3 agxDefaultContrastApprox(vec3 x) {
      vec3 x2 = x * x;
      vec3 x4 = x2 * x2;
      return  15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x
            + 0.4298 * x2 + 0.1191 * x - 0.00232;
    }
    vec3 agx(vec3 col) {
      const mat3 agxIn = mat3(
        0.8425640, 0.0784336, 0.0792237,
        0.0423241, 0.8784686, 0.0791661,
        0.0424069, 0.0784336, 0.8791429);
      const mat3 agxOut = mat3(
         1.1968790, -0.0980210, -0.0990297,
        -0.0528968,  1.1519110, -0.0989646,
        -0.0529716, -0.0980190,  1.1510335);
      const float minEv = -12.47393, maxEv = 4.026069;
      col = agxIn * col;
      col = clamp(log2(col), minEv, maxEv);
      col = (col - minEv) / (maxEv - minEv);
      col = agxDefaultContrastApprox(col);
      col = agxOut * col;
      // "punchy" look: mild saturation restore after the neutral AgX base
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.06);
      return max(col, 0.0);
    }

    // 13-tap hex bokeh — cheap, and the hex shape is far more filmic than a box.
    vec3 bokeh(vec2 uv, float radius) {
      vec3 sum = texture2D(tDiffuse, uv).rgb;
      if (radius < 0.0008) return sum;
      float total = 1.0;
      const int RINGS = 2;
      for (int r = 1; r <= RINGS; r++) {
        float rr = radius * float(r) / float(RINGS);
        for (int i = 0; i < 6; i++) {
          float a = (float(i) / 6.0 + float(r) * 0.08) * PI2;
          vec2 off = vec2(cos(a), sin(a)) * rr;
          off.x *= uResolution.y / uResolution.x;
          sum += texture2D(tDiffuse, uv + off).rgb;
          total += 1.0;
        }
      }
      return sum / total;
    }

    void main() {
      vec2 uv = vUv;
      vec2 fromCenter = uv - 0.5;
      float r2 = dot(fromCenter, fromCenter);

      // depth of field ------------------------------------------------------
      float depth = linearDepth(uv);
      float dz = depth - uFocus;
      // A dead zone around the focal plane keeps the subject perfectly crisp;
      // without it, tiny depth jitter makes the whole frame feel soft.
      // The dead zone has to be wide enough to hold the *whole subject*, not
      // just the plane the focus point sits on: focusOn() aims at the chest
      // socket, and in a portrait the eyes are 4–5 cm nearer than that. At
      // 0.5 × the face preset's 5 cm range the eyes sat on the ramp and the
      // sharpest thing in frame was the floor. A full range either side means
      // the head is inside the dead zone end to end.
      float dead = uFocusRange;
      // …and then a long ramp, so focus falls off over metres rather than
      // snapping from sharp to fully blurred at the edge of the dead zone.
      float ramp = uFocusRange * 6.0;
      float defocus = max(0.0, abs(dz) - dead);
      float coc = clamp(defocus / max(1e-6, ramp), 0.0, 1.0);
      coc = pow(coc, 1.35) * uDofStrength;
      // never blur the very front of frame as hard as the background
      coc *= dz < 0.0 ? 0.45 : 1.0;
      float radius = coc * 0.0042;

      // lateral chromatic aberration — a *field* aberration, so it is exactly
      // zero on axis and only appears in the last fifth of the image circle.
      // r2 runs 0 at centre → 0.5 at the corner, so (r2 * 2) normalises the
      // corner to 1 and the cube keeps the middle 60% of the frame clean:
      // halfway to the corner this is 1.6% of the corner value.
      float caField = clamp(r2 * 2.0, 0.0, 1.0);
      float ca = uAberration * caField * caField * caField;
      vec3 col;
      col.r = bokeh(uv + fromCenter * ca, radius).r;
      col.g = bokeh(uv, radius).g;
      col.b = bokeh(uv - fromCenter * ca, radius).b;

      col *= uExposure;
      col = agx(col);

      // split tone — cool shadow against warm key -----------------------------
      // Weighted on display luminance *after* the curve, so the split follows
      // what the eye reads as shadow rather than what the renderer called dark.
      // The two ranges deliberately overlap around mid grey: a hard crossover
      // produces a visible band on any smooth gradient (a wall, a cheek).
      float sl = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float shadowW = 1.0 - smoothstep(0.015, 0.52, sl);
      float highW = smoothstep(0.38, 0.95, sl);
      col *= mix(vec3(1.0), uShadowTint, shadowW * uSplit);
      col *= mix(vec3(1.0), uHighTint, highW * uSplit);

      // lift / gain / saturation / contrast ---------------------------------
      col = col * uGain + uLift;
      col.r += uWarmth * 0.5 * col.r;
      col.b -= uWarmth * 0.35 * col.b;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;

      // vignette ------------------------------------------------------------
      // Gentle cos^4-style falloff. The old smoothstep crushed the corners so
      // hard that the room's edges disappeared entirely.
      float vig = 1.0 - uVignette * pow(clamp(r2 * 2.0, 0.0, 1.0), 1.5);
      col *= clamp(vig, 0.0, 1.0);

      // film grain — animated, luminance-weighted so shadows stay clean ------
      float n = fract(sin(dot(uv * uResolution + uTime * 37.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uGrain * (0.35 + luma * 0.9);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `
};

/* -------------------------------------------------------- depth resolve --- */

/**
 * Resolves the scene depth attachment into a standalone colour target.
 *
 * This exists to break a WebGL2 feedback loop. `EffectComposer` ping-pongs
 * between two render targets, and `clone()` copies the *reference* to the
 * DepthTexture — so both buffers share one depth attachment. Any later pass
 * that samples that DepthTexture is reading the attachment it is currently
 * drawing into, which is undefined behaviour; Chrome rejects the draw call
 * outright (`GL_INVALID_OPERATION: Feedback loop formed between Framebuffer
 * and active Texture`) and the frame comes out black.
 *
 * Writing linear depth once into a target of our own costs one full-screen
 * blit and lets the grade pass — and the particle system's soft-fade — sample
 * depth safely. `needsSwap = false` so it leaves the colour chain untouched.
 */
class DepthResolvePass extends Pass {
  constructor(depthTexture, camera, width, height) {
    super();
    this.needsSwap = false;
    this.camera = camera;

    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RedFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter
    });

    this.material = new THREE.ShaderMaterial({
      defines: { PERSPECTIVE_CAMERA: camera.isPerspectiveCamera ? 1 : 0 },
      uniforms: {
        tDepth: { value: depthTexture },
        uNear: { value: camera.near },
        uFar: { value: camera.far }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <packing>
        varying vec2 vUv;
        uniform sampler2D tDepth;
        uniform float uNear, uFar;
        void main() {
          float d = texture2D(tDepth, vUv).x;
          #if PERSPECTIVE_CAMERA == 1
            float vz = perspectiveDepthToViewZ(d, uNear, uFar);
            gl_FragColor = vec4(viewZToOrthographicDepth(vz, uNear, uFar), 0.0, 0.0, 1.0);
          #else
            gl_FragColor = vec4(d, 0.0, 0.0, 1.0);
          #endif
        }`
    });

    this._quad = new FullScreenQuad(this.material);
  }

  get texture() { return this.renderTarget.texture; }

  setSize(width, height) { this.renderTarget.setSize(width, height); }

  render(renderer) {
    this.material.uniforms.uNear.value = this.camera.near;
    this.material.uniforms.uFar.value = this.camera.far;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.renderTarget);
    this._quad.render(renderer);
    renderer.setRenderTarget(prev);
  }

  dispose() {
    this.renderTarget.dispose();
    this.material.dispose();
    this._quad.dispose();
  }
}

/* ------------------------------------------------------------ pipeline --- */

export class RenderPipeline {
  constructor(canvas, scene, camera, tier = detectTier()) {
    this.scene = scene;
    this.camera = camera;
    this.tier = tier;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // SMAA handles this; MSAA + composer is wasteful
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false
    });
    renderer.setPixelRatio(this._pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Tone mapping happens in the grade pass, so the composer stays linear.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    // PCF-soft rather than VSM: VSM's blur radius produced visible light-bleed
    // notches where the baby's limbs meet the body. PCF keeps contact tight and
    // the soft look is restored by the contactShadow blobs in lighting.js.
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    this.renderer = renderer;

    this.clock = new THREE.Clock();
    this._buildComposer();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
  }

  _pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    if (this.tier === TIER.LOW) return Math.min(dpr, 1.25);
    if (this.tier === TIER.MED) return Math.min(dpr, 1.6);
    return Math.min(dpr, 2);
  }

  _buildComposer() {
    const { renderer, scene, camera, tier } = this;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.NoColorSpace,
      samples: 0,
      depthTexture: new THREE.DepthTexture(size.x, size.y)
    });
    this.target = target;

    const composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(this._pixelRatio());
    this.composer = composer;

    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);

    // --- ambient occlusion ------------------------------------------------
    if (tier >= TIER.MED) {
      const gtao = new GTAOPass(scene, camera, size.x, size.y);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({
        // A nursery is a room of small objects sitting on big flat surfaces.
        // The old 0.42 m radius only ever caught the last centimetre of a
        // contact, which is why the AO buffer came back almost pure white and
        // every prop still read as pasted on. 0.8 m is roughly "the width of
        // the crib", so legs, plinths and the rug edge all darken properly.
        radius: 0.62,
        distanceExponent: 1.0,
        thickness: 1.0,
        // 2.0 put visible AO blotching on the baby's torso: on a smooth,
        // strongly curved surface the sample noise survives the denoise and
        // reads as marbling on the skin. 1.5 keeps the grounding and loses it.
        scale: 1.5,
        samples: tier === TIER.HIGH ? 16 : 8,
        distanceFallOff: 1.0,
        screenSpaceRadius: false
      });
      // Wider denoise: with the G-buffer coming from the scene depth (below)
      // the raw AO is noisier, and 8 px of Poisson left a visible crawl.
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 16, rings: 2, samples: 16 });
      gtao.blendIntensity = 1.0;
      this._wireGtaoToSceneDepth(gtao, target.depthTexture);
      composer.addPass(gtao);
      this.gtao = gtao;
    }

    // --- bloom ------------------------------------------------------------
    // Threshold sits high: only genuine highlights (window, lamp, sparkles)
    // should bloom, otherwise pastel walls smear.
    //
    // The threshold is on *luminance*, which is why 0.86 was not holding the
    // skin: the SSS term in makeSkin() was pushing the red channel past 2.0 on
    // every backlit silhouette while green and blue stayed low, and a colour
    // that saturated still clears a luminance gate at a fraction of its peak.
    // The real fix is in the shader (the halo is now a rim), but the gate is
    // raised too so that only things which are bright in *all three* channels —
    // the window, the lamp shade, a specular hit — can ever fire it.
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      tier === TIER.LOW ? 0.24 : 0.30,   // strength
      0.66,                              // radius
      1.02                               // threshold
    );
    composer.addPass(bloom);
    this.bloom = bloom;

    // --- depth resolve (breaks the composer's depth feedback loop) --------
    const depthResolve = new DepthResolvePass(
      target.depthTexture, camera, size.x, size.y);
    composer.addPass(depthResolve);
    this.depthResolve = depthResolve;

    // --- grade ------------------------------------------------------------
    const grade = new ShaderPass(GradeShader);
    grade.material.defines.PERSPECTIVE_CAMERA = camera.isPerspectiveCamera ? 1 : 0;
    // Already linearised by the resolve pass, so the grade must not linearise
    // a second time.
    grade.material.defines.DEPTH_IS_LINEAR = 1;
    grade.uniforms.tDepth.value = depthResolve.texture;
    grade.uniforms.uNear.value = camera.near;
    grade.uniforms.uFar.value = camera.far;
    grade.uniforms.uResolution.value.set(size.x, size.y);
    if (tier === TIER.LOW) {
      grade.uniforms.uDofStrength.value = 0.0;
      grade.uniforms.uAberration.value = 0.0;
    }
    composer.addPass(grade);
    this.grade = grade;

    // --- AA ---------------------------------------------------------------
    if (tier >= TIER.MED) {
      const smaa = new SMAAPass();
      composer.addPass(smaa);
      this.smaa = smaa;
    }
    composer.passes[composer.passes.length - 1].renderToScreen = true;
  }

  /**
   * Make GTAO read the *scene* depth buffer instead of rendering its own
   * depth+normal G-buffer.
   *
   * Two separate problems, one fix.
   *
   * 1. CORRECTNESS. `GTAOPass._overrideVisibility()` only hides Points and
   *    Lines before it re-renders the scene with `MeshNormalMaterial`. Every
   *    *transparent* mesh therefore lands in the AO G-buffer as if it were
   *    solid: the window's volumetric light shaft, its floor pool, the contact
   *    shadow blobs, the glazing, the sky and cloud planes. The light shaft is
   *    a three-metre prism seen nearly edge-on, so GTAO measured near-total
   *    self-occlusion across its whole silhouette and the Default output
   *    (`colour × AO`) multiplied that region of the frame to pure black — the
   *    giant black polygon in the upper left of the wide shot. Reading the real
   *    scene depth instead means only depth-*writing* geometry occludes, which
   *    is exactly the set of surfaces that should.
   *
   * 2. COST. The G-buffer render was a second full traversal of the scene
   *    (plus its own transmission resolve): ~190 of the frame's 524 draw calls.
   *    Skipping it is free — with no normal texture the GTAO shader falls back
   *    to reconstructing view normals from depth derivatives, which for a room
   *    of large smooth surfaces is visually equivalent.
   *
   * There is no feedback loop here: GTAO samples the depth attachment while
   * rendering into its own `gtaoRenderTarget` / `pdRenderTarget`, and its final
   * blend into the composer buffer does not bind a depth sampler.
   *
   * `setGBuffer()` is not used because in r180 it dereferences
   * `this.normalRenderTarget.depthTexture` on a branch that never creates one.
   */
  _wireGtaoToSceneDepth(gtao, depthTexture) {
    gtao._renderGBuffer = false;              // skip the scene re-render
    gtao.depthTexture = depthTexture;
    gtao.normalTexture = null;
    for (const m of [gtao.gtaoMaterial, gtao.pdMaterial]) {
      m.defines.NORMAL_VECTOR_TYPE = 0;       // 0 = reconstruct from depth
      m.defines.DEPTH_SWIZZLING = 'x';
      m.uniforms.tDepth.value = depthTexture;
      m.uniforms.tNormal.value = null;
      m.needsUpdate = true;
    }
  }

  /**
   * Pull focus onto a world-space point (the baby, usually).
   *
   * `range` is in **metres** — that is what every `CameraRig` preset authors
   * (0.05 for the face macro, 0.50 for the establishing wide) and it is the
   * only reading that makes physical sense. It used to be handed to the shader
   * as if it were already normalised device depth, so 0.50 meant 30 m on a
   * 60 m far plane: larger than the room, which is why nothing in the wide shot
   * was ever out of focus and the frame had no depth separation at all.
   */
  focusOn(worldPos, range = 0.30) {
    const v = worldPos.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const span = Math.max(1e-4, this.camera.far - this.camera.near);
    const depth = (-v.z - this.camera.near) / span;
    this.grade.uniforms.uFocus.value = THREE.MathUtils.clamp(depth, 0, 1);
    this.grade.uniforms.uFocusRange.value = Math.max(1e-5, range / span);
  }

  setExposure(v) { this.grade.uniforms.uExposure.value = v; }

  /** Nudge the grade toward a mood (day / evening / night / bath). */
  setGrade({
    lift, gain, saturation, contrast, warmth, vignette, exposure,
    shadowTint, highTint, split
  }) {
    const u = this.grade.uniforms;
    if (lift) u.uLift.value.fromArray(lift);
    if (gain) u.uGain.value.fromArray(gain);
    if (saturation !== undefined) u.uSaturation.value = saturation;
    if (contrast !== undefined) u.uContrast.value = contrast;
    if (warmth !== undefined) u.uWarmth.value = warmth;
    if (vignette !== undefined) u.uVignette.value = vignette;
    if (exposure !== undefined) u.uExposure.value = exposure;
    if (shadowTint) u.uShadowTint.value.fromArray(shadowTint);
    if (highTint) u.uHighTint.value.fromArray(highTint);
    if (split !== undefined) u.uSplit.value = split;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this._pixelRatio());
    this.composer.setSize(w, h);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.depthTexture.image.width = size.x;
    this.target.depthTexture.image.height = size.y;
    this.target.depthTexture.needsUpdate = true;
    this.grade.uniforms.uResolution.value.set(size.x, size.y);
    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    // GTAO samples the scene depth attachment, so it has to be sized in
    // drawing-buffer pixels, not CSS pixels, or the AO lands at the wrong scale
    // on any display with devicePixelRatio > 1.
    this.gtao?.setSize(size.x, size.y);
    this.depthResolve?.setSize(size.x, size.y);
  }

  render(dt) {
    this.grade.uniforms.uTime.value += dt;
    this.renderer.info.reset();
    this.composer.render(dt);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.depthResolve?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
