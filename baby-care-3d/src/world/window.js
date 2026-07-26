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
  uniform float uSunSize, uSunGlow, uStars, uHaze, uTime;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    float h = clamp(vUv.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.55, h));
    col = mix(col, uTop, smoothstep(0.45, 1.0, h));

    // stars: only the top two thirds, and never on top of the sun
    if (uStars > 0.001) {
      vec2 g = floor(vUv * vec2(220.0, 150.0));
      float n = hash(g);
      float tw = 0.55 + 0.45 * sin(uTime * 2.2 + n * 40.0);
      float s = step(0.9955, n) * tw * smoothstep(0.15, 0.6, h);
      col += uStarTint * s * uStars * 1.4;
    }

    // sun / moon
    float d = length((vUv - uSunPos) * vec2(1.0, 0.62));
    float disc = smoothstep(uSunSize, uSunSize * 0.55, d);
    float glow = pow(max(0.0, 1.0 - d / max(0.001, uSunGlow)), 3.0);
    col += uSun * (disc * 1.5 + glow * 0.55);

    // ground haze lifts the horizon and hides the treeline's feet
    col = mix(col, uHorizon * 1.06, uHaze * pow(max(0.0, 1.0 - h * 2.2), 2.0));
    gl_FragColor = vec4(col, 1.0);
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
  uniform vec3 uColor, uAxis;
  uniform float uLen, uHalfW, uHalfH, uSpread, uTime, uIntensity, uBarX, uBarY, uOpen;

  void main() {
    float t = clamp(vPos.z / uLen, 0.0, 1.0);
    float k = 1.0 + uSpread * t;
    vec2 s = vec2(vPos.x / (uHalfW * k), vPos.y / (uHalfH * k));

    // soft rectangular cross-section, softening as the beam travels
    float soft = mix(0.30, 0.75, t);
    float ex = 1.0 - smoothstep(1.0 - soft, 1.02, abs(s.x));
    float ey = 1.0 - smoothstep(1.0 - soft, 1.02, abs(s.y));
    float edge = ex * ey;

    // curtains eat the beam from the outside in: only |s.x| < uOpen gets through
    edge *= 1.0 - smoothstep(uOpen * 0.82, uOpen, abs(s.x));

    // the mullion and transom carve real bars out of the light
    float bars = 1.0
      - 0.72 * (1.0 - smoothstep(0.0, 0.055, abs(s.x - uBarX)))
      - 0.60 * (1.0 - smoothstep(0.0, 0.048, abs(s.y - uBarY)));
    bars = clamp(bars, 0.0, 1.0);

    float fade = pow(1.0 - t, 1.5) * smoothstep(0.0, 0.06, t);

    // two noise layers drifting down the beam = airborne dust in motion
    float n1 = texture2D(uNoise, vec2(s.x * 0.30 + uTime * 0.011, t * 0.70 - uTime * 0.043)).r;
    float n2 = texture2D(uNoise, vec2(s.y * 0.24 - uTime * 0.008, t * 0.42 - uTime * 0.027)).g;
    float haze = 0.5 + 0.85 * n1 * n2;

    // looking straight down the beam would show the flat end cap; fade it out
    vec3 V = normalize(cameraPosition - vWorld);
    float axial = 1.0 - abs(dot(V, normalize(uAxis)));

    float a = edge * bars * fade * haze * uIntensity * (0.45 + 0.55 * axial);
    if (a <= 0.001) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

const POOL_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D uNoise;
  uniform vec3 uColor;
  uniform float uTime, uIntensity, uBarX, uBarY, uOpen;
  void main() {
    vec2 s = vUv * 2.0 - 1.0;
    float ex = 1.0 - smoothstep(0.45, 1.0, abs(s.x));
    float ey = 1.0 - smoothstep(0.40, 1.0, abs(s.y));
    ex *= 1.0 - smoothstep(uOpen * 0.82, uOpen, abs(s.x));
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

const SKY = {
  day: {
    top: 0x5f9edd, mid: 0x9fcaef, hor: 0xe2ecf3, sun: 0xfff6e2,
    sunPos: [0.70, 0.80], sunSize: 0.030, glow: 0.34, stars: 0, haze: 0.50,
    shaft: 0xfff2dc, shaftI: 1.00, cloud: 0xffffff, cloudA: 0.95
  },
  golden: {
    top: 0x7ba6d8, mid: 0xefc492, hor: 0xffd7a6, sun: 0xffdaa2,
    sunPos: [0.28, 0.40], sunSize: 0.052, glow: 0.58, stars: 0, haze: 0.78,
    shaft: 0xffd7a0, shaftI: 1.55, cloud: 0xffe6cc, cloudA: 0.92
  },
  evening: {
    top: 0x3f4d84, mid: 0x8b7fae, hor: 0xe6a891, sun: 0xffbe8c,
    sunPos: [0.22, 0.28], sunSize: 0.048, glow: 0.62, stars: 0.3, haze: 0.82,
    shaft: 0xffc79c, shaftI: 0.72, cloud: 0xd8bfc4, cloudA: 0.85
  },
  night: {
    top: 0x101736, mid: 0x232f5c, hor: 0x3c4370, sun: 0xe2e8ff,
    sunPos: [0.66, 0.78], sunSize: 0.026, glow: 0.20, stars: 1, haze: 0.30,
    shaft: 0xb0c2ff, shaftI: 0.26, cloud: 0x4a5480, cloudA: 0.7
  }
};

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
    this._buildJoinery();
    this._buildExterior();
    this._buildShaft(ctx);
    this._buildCurtains();
    this.setMood(this.mood, true);
    this.setWeather(this.weather, true);
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

    /* --- ground + treeline ---------------------------------------------- */
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x93a97c, roughness: 1, metalness: 0, fog: false
    });
    // The outside ground sits at the same height as the nursery floor, so it
    // must start *behind* the wall or it lays a green sheet across the room.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 46), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, gy - 0.03, -23.4);      // spans z −0.4 … −46.4
    ground.renderOrder = -3;
    ex.add(ground);
    this.groundMat = groundMat;

    const treeMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0, fog: false
    });
    const trunk = tint(xf(new THREE.CylinderGeometry(0.09, 0.13, 1.0, 7), [0, 0.5, 0]), 0x6b513a);
    const foliage = [];
    for (let i = 0; i < 3; i++) {
      foliage.push(tint(xf(new THREE.ConeGeometry(0.82 - i * 0.20, 1.15, 9),
        [0, 1.15 + i * 0.62, 0]), 0xffffff));
    }
    const treeGeo = mergeAll([trunk, ...foliage], { colors: true });
    const R = rng(31);
    const greens = [0x5f8f57, 0x74a262, 0x4e7d4c, 0x86ad6a];
    const trees = [];
    for (let i = 0; i < 14; i++) {
      const s = 0.85 + R() * 0.8;
      trees.push({
        pos: [-19 + i * 2.8 + R() * 1.8, gy - 0.03, -10.5 - R() * 6.5],
        rot: [0, R() * 3, 0],
        scale: [s * (0.85 + R() * 0.3), s, s * (0.85 + R() * 0.3)],
        color: greens[i % greens.length]
      });
    }
    const treeMesh = instanced(treeGeo, treeMat, trees, 'trees');
    treeMesh.castShadow = false;
    treeMesh.receiveShadow = false;
    ex.add(treeMesh);
    this.trees = treeMesh;
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
      uColor: { value: new THREE.Color(SKY.day.shaft) },
      uAxis: { value: new THREE.Vector3(0.6, -0.65, -0.45) },
      uLen: { value: 1 }, uHalfW: { value: 1 }, uHalfH: { value: 1 },
      uSpread: { value: spread },
      uTime: { value: 0 },
      uIntensity: { value: 0.16 },
      uBarX: { value: this.barX }, uBarY: { value: this.barY },
      uOpen: { value: 1 }
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
    this.rings = [];
    const ringGeo = new THREE.TorusGeometry(0.024, 0.005, 6, 16);
    ringGeo.rotateY(Math.PI / 2);

    for (const sx of [-1, 1]) {
      const geo = clothPanel(this.panelW, this.panelH, {
        cols: 46, rows: 13, folds: 6, amp: 0.042
      });
      const panel = new THREE.Mesh(geo, M.curtain);
      panel.castShadow = true;
      panel.receiveShadow = true;
      panel.name = 'curtain';
      panel.position.set(sx * this.panelW / 2, poleY - this.panelH / 2 - 0.03, poleZ);
      panel.userData.side = sx;
      this.group.add(panel);
      this.panels.push(panel);

      const items = [];
      for (let i = 0; i < 7; i++) items.push({ pos: [0, 0, 0] });
      const rings = instanced(ringGeo, M.brass, items, 'curtainRings');
      rings.castShadow = false;
      this.group.add(rings);
      this.rings.push(rings);
    }
    this._applyCurtains(this._openNow);
  }

  /** Re-fold the panels and slide the rings for an openness of 0..1. */
  _applyCurtains(open) {
    const poleY = this.h / 2 + 0.17, poleZ = 0.14;
    const sway = Math.sin(this.time * 0.7) * 0.006 * (1 - open);
    for (const panel of this.panels) {
      const sx = panel.userData.side;
      foldCloth(panel.geometry, {
        folds: 6,
        amp: 0.042,
        gather: open,
        drape: 0.02,
        sway
      });
      const narrow = this.panelW * (1 - open * 0.55);
      const closedX = sx * this.panelW / 2;
      const openX = sx * (this.w / 2 + 0.14 - narrow / 2);
      panel.position.x = closedX + (openX - closedX) * open;
      panel.position.y = poleY - this.panelH / 2 - 0.03;
      panel.position.z = poleZ;

      // rings ride the top edge of whatever shape the panel is in now
      const rings = this.rings[sx < 0 ? 0 : 1];
      for (let i = 0; i < 7; i++) {
        const u = (i / 6 - 0.5) * narrow;
        const phase = (u / this.panelW) * Math.PI * 2 * 6;
        _v.set(panel.position.x + u, poleY - 0.024, poleZ + Math.sin(phase) * 0.038 * (1 + open * 1.9));
        _q.identity();
        rings.setMatrixAt(i, _m.compose(_v, _q, _v2.set(1, 1, 1)));
      }
      rings.instanceMatrix.needsUpdate = true;
    }
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
      _v.copy(key.target.position).sub(key.position).normalize();
    } else {
      _v.set(0.62, -0.66, -0.42).normalize();
    }
    if (_v.y > -0.12) _v.y = -0.12;      // never let the beam run uphill
    _v.normalize();

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
      cloudColor: C(s.cloud).lerp(C(0x8d939c), overcast * 0.55),
      cloudOpacity: Math.min(1, 0.35 + overcast * 0.6 + (w === 'clear' ? 0.25 : 0.4)),
      shaftColor: C(s.shaft).lerp(C(0xcfd8e6), overcast * 0.6),
      // overcast light is diffuse: the beam does not vanish, it goes soft
      shaftI: s.shaftI * (w === 'rain' ? 0.28 : w === 'snow' ? 0.5 : 1)
    };
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
    for (const c of this.clouds) {
      c.material.color.copy(T.cloudColor);
      c.material.opacity = T.cloudOpacity * (c.userData.speed > 0.008 ? 0.8 : 1);
    }
    this.shaftU.uColor.value.copy(T.shaftColor);
    this.poolU.uColor.value.copy(T.shaftColor);
    this.moteU.uColor.value.copy(T.shaftColor).lerp(new THREE.Color(0xffffff), 0.35);
    this._writeShaftIntensity(T.shaftI);
    this.groundMat.color.set(this.weather === 'snow' ? 0xdfe6ea : 0x93a97c);
  }

  _writeShaftIntensity(i) {
    this.shaftU.uIntensity.value = 0.42 * i;
    this.poolU.uIntensity.value = 0.50 * i;
    this.moteU.uIntensity.value = 0.42 * Math.min(1.4, i);
  }

  /** What the room should feed its window-bounce light. */
  shaftStrength() { return this._shaftI ?? (this.tgt ? this.tgt.shaftI : 1); }
  skyTint() { return this.skyU.uMid.value; }

  pickables() {
    return [...this._pick, this.glass, ...this.panels];
  }

  /* --------------------------------------------------------------- tick -- */

  update(dt, ctx) {
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
    this._shaftI = (this._shaftI ?? T.shaftI) + (T.shaftI - (this._shaftI ?? T.shaftI)) * k;
    this._writeShaftIntensity(this._shaftI);
    this.shaftU.uColor.value.lerp(T.shaftColor, k);
    this.poolU.uColor.value.lerp(T.shaftColor, k);

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
