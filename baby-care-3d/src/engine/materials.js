/* ============================================================================
 * materials.js — Shared PBR material library
 * ----------------------------------------------------------------------------
 * Every surface in the game comes from here so the whole frame shares one
 * consistent response to light. Two custom shading models matter:
 *
 *   makeSkin()  — MeshPhysicalMaterial + a translucency term injected via
 *                 onBeforeCompile, approximating subsurface scattering. Baby
 *                 skin without SSS reads as plastic, and that single fact is
 *                 the difference between "toy render" and "character render".
 *   makeCloth() — sheen-enabled physical material; the fuzzy rim on cotton is
 *                 what stops clothing looking like painted geometry.
 * ========================================================================== */

import * as THREE from 'three';
import * as TEX from './textures.js';

const _cache = new Map();
function memo(key, build) {
  if (!_cache.has(key)) _cache.set(key, build());
  return _cache.get(key);
}

/* ---------------------------------------------------------------- skin --- */

/**
 * Wrapped-diffuse + back-scatter translucency.
 *
 * `thicknessMap`-free by design: we drive the effect from a uniform plus the
 * geometry's own curvature via the normal, which for a rounded infant body is
 * a very close match to a baked thickness map and costs nothing to author.
 */
export function makeSkin({
  color = 0xffd9c4,
  subsurface = 0xff8a76,
  translucency = 0.85,
  wrap = 0.55,
  roughness = 1.0,
  sheen = 0.35,
  seed = 23,
  poreScale = 3.0
} = {}) {
  const maps = TEX.skin({ color: 0xffffff, seed });
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness,
    metalness: 0.0,
    clearcoat: 0.12,          // the faint wet sheen of very young skin
    clearcoatRoughness: 0.55,
    sheen: sheen,             // vellus "peach fuzz" rim
    sheenColor: new THREE.Color(0xffd0c0),
    sheenRoughness: 0.85,
    envMapIntensity: 1.0
  });
  mat.normalScale.set(0.35, 0.35);
  mat.map.repeat.set(poreScale, poreScale);
  mat.normalMap.repeat.set(poreScale, poreScale);
  mat.roughnessMap.repeat.set(poreScale, poreScale);

  const uniforms = {
    uSubsurface: { value: new THREE.Color(subsurface) },
    uTranslucency: { value: translucency },
    uWrap: { value: wrap }
  };
  mat.userData.uniforms = uniforms;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        uniform vec3  uSubsurface;
        uniform float uTranslucency;
        uniform float uWrap;
      `)
      // Injected at the end of light accumulation. We add into
      // reflectedLight.directDiffuse rather than `outgoingLight`, which does
      // not exist yet at this point in the chunk order.
      //
      // Note the extra braces inside each loop: three's `unroll_loop_start`
      // pragma textually expands the body once per light *without* adding a
      // scope, so any local declaration would collide on the second copy.
      .replace('#include <lights_fragment_end>', /* glsl */`
        #include <lights_fragment_end>
        {
          vec3 sssAccum = vec3(0.0);
          vec3 sssN = normal;
          vec3 sssV = normalize(vViewPosition);

          #if ( NUM_DIR_LIGHTS > 0 )
          #pragma unroll_loop_start
          for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
            {
              vec3 sssL = directionalLights[ i ].direction;
              // wrapped diffuse: light bleeds around the terminator
              float sssWrap = max(0.0, (dot(sssN, sssL) + uWrap) / (1.0 + uWrap));
              // back scatter: light travelling *through* thin parts (ears, cheeks)
              float sssBack = pow(clamp(dot(sssV, -sssL) * 0.5 + 0.5, 0.0, 1.0), 3.0);
              sssAccum += directionalLights[ i ].color * (sssWrap * 0.28 + sssBack * 0.55);
            }
          }
          #pragma unroll_loop_end
          #endif

          #if ( NUM_HEMI_LIGHTS > 0 )
          #pragma unroll_loop_start
          for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
            {
              sssAccum += hemisphereLights[ i ].skyColor * 0.10;
            }
          }
          #pragma unroll_loop_end
          #endif

          // Fresnel weighting keeps the scatter on grazing angles where real
          // subsurface transport is most visible.
          float sssFres = pow(1.0 - clamp(dot(sssN, sssV), 0.0, 1.0), 1.6);
          reflectedLight.directDiffuse += sssAccum * uSubsurface * diffuseColor.rgb
                         * uTranslucency * (0.45 + sssFres * 0.9);
        }
      `);
  };
  mat.customProgramCacheKey = () => 'skin-sss';
  return mat;
}

/* -------------------------------------------------------------- cloth --- */

export function makeCloth({
  color = 0xffffff,
  weave = 'plain',
  threads = 128,
  sheen = 0.9,
  sheenColor = 0xffffff,
  roughness = 0.95,
  repeat = 3,
  seed = 7,
  normalScale = 0.9
} = {}) {
  const maps = TEX.fabric({ color: 0xffffff, weave, threads, seed });
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness,
    metalness: 0,
    sheen,
    sheenColor: new THREE.Color(sheenColor),
    sheenRoughness: 0.7,
    envMapIntensity: 0.8
  });
  mat.normalScale.set(normalScale, normalScale);
  for (const m of [mat.map, mat.normalMap, mat.roughnessMap]) m.repeat.set(repeat, repeat);
  return mat;
}

/** Deep-pile towel / blanket. */
export function makeTerry({ color = 0xfff4f8, repeat = 4, seed = 71 } = {}) {
  return makeCloth({
    color, weave: 'terry', threads: 110, seed, repeat,
    sheen: 1.0, sheenColor: 0xffffff, roughness: 0.98, normalScale: 1.6
  });
}

/* --------------------------------------------------------------- wood --- */

export function makeWood({
  light = 0xdcae78, dark = 0x9c6a38, planks = 0, repeat = 1,
  seed = 3, ringScale = 26, clearcoat = 0.35, satin = 0.42
} = {}) {
  const maps = TEX.wood({ light: 0xffffff, dark: 0x8a8a8a, planks, seed, ringScale, satin });
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(light),
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1.0,
    metalness: 0,
    clearcoat,                    // the lacquer on nursery furniture
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.9
  });
  mat.normalScale.set(0.7, 0.7);
  for (const m of [mat.map, mat.normalMap, mat.roughnessMap]) m.repeat.set(repeat, repeat);
  // Multiply the grain darks in via the base colour so we keep one texture set
  // for every wood tone in the game.
  mat.color.lerp(new THREE.Color(dark), 0.25);
  return mat;
}

/* ------------------------------------------------------------ surfaces --- */

export function makeWall({ base = 0xf3e7f2, tint = 0xe6d3ec, repeat = 4, seed = 11 } = {}) {
  return memo(`wall${base}${tint}${repeat}${seed}`, () => {
    const maps = TEX.wallpaper({ base: 0xffffff, tint: 0xdcdcdc, seed });
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(base),
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: 1.0,
      metalness: 0,
      envMapIntensity: 0.85
    });
    mat.normalScale.set(0.45, 0.45);
    for (const m of [mat.map, mat.normalMap, mat.roughnessMap]) m.repeat.set(repeat, repeat);
    return mat;
  });
}

export function makeCarpet({ color = 0xffd7e6, repeat = 3, seed = 19, density = 150 } = {}) {
  const maps = TEX.carpet({ color: 0xffffff, seed, density });
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1.0,
    metalness: 0,
    sheen: 0.5,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5),
    sheenRoughness: 0.9,
    envMapIntensity: 0.7
  });
  mat.normalScale.set(1.5, 1.5);
  for (const m of [mat.map, mat.normalMap, mat.roughnessMap]) m.repeat.set(repeat, repeat);
  return mat;
}

export function makeCeramic({ color = 0xffffff, repeat = 2, seed = 31, tint = 0 } = {}) {
  const maps = TEX.ceramic({ color: 0xffffff, seed });
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1.0,
    metalness: 0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.35
  });
  mat.normalScale.set(0.28, 0.28);
  for (const m of [mat.map, mat.normalMap, mat.roughnessMap]) m.repeat.set(repeat, repeat);
  return mat;
}

export function makePlastic({
  color = 0xff9ec4, repeat = 2, seed = 37, matte = 0.42, clearcoat = 0.55
} = {}) {
  const maps = TEX.plastic({ color: 0xffffff, seed, matte });
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1.0,
    metalness: 0,
    clearcoat,
    clearcoatRoughness: 0.3,
    envMapIntensity: 1.0
  });
  mat.normalScale.set(0.25, 0.25);
  for (const m of [mat.map, mat.normalMap, mat.roughnessMap]) m.repeat.set(repeat, repeat);
  return mat;
}

export function makePaint({ color = 0xfffaf6, repeat = 2, seed = 43, gloss = 0.35 } = {}) {
  const maps = TEX.paint({ color: 0xffffff, seed, gloss });
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1.0,
    metalness: 0,
    clearcoat: gloss,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.95
  });
  mat.normalScale.set(0.35, 0.35);
  for (const m of [mat.map, mat.normalMap, mat.roughnessMap]) m.repeat.set(repeat, repeat);
  return mat;
}

/* -------------------------------------------------------------- metal --- */

export function makeMetal({ color = 0xd8dde2, roughness = 0.22, seed = 61 } = {}) {
  return memo(`metal${color}${roughness}`, () => {
    const maps = TEX.ceramic({ color: 0xffffff, seed, peel: 0.6 });
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      normalMap: maps.normalMap,
      roughness,
      metalness: 1.0,
      envMapIntensity: 1.5
    });
  });
}

/* -------------------------------------------------------------- glass --- */

/** Bottle glass / acrylic — real transmission, so milk inside actually shows. */
export function makeGlass({
  color = 0xffffff, thickness = 0.06, roughness = 0.06, ior = 1.46, tint = 0xffffff
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    transparent: true,
    transmission: 0.96,
    thickness,
    roughness,
    metalness: 0,
    ior,
    attenuationColor: new THREE.Color(tint),
    attenuationDistance: 0.6,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.6,
    specularIntensity: 1
  });
}

/* --------------------------------------------------------------- eyes --- */

/**
 * Two-layer eye: a matte iris/sclera base plus a separate clear-coated cornea
 * bulge. Real characters get their life from that second specular hit.
 */
export function makeEye({ iris = 0x4a3728, sclera = 0xfffaf6 } = {}) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');

  g.fillStyle = '#' + new THREE.Color(sclera).getHexString();
  g.fillRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2;
  // limbal ring: the dark edge around a real iris, hugely important for cuteness
  const irisR = size * 0.34;
  const grad = g.createRadialGradient(cx, cy, irisR * 0.15, cx, cy, irisR);
  const ic = new THREE.Color(iris);
  grad.addColorStop(0, '#' + ic.clone().multiplyScalar(1.55).getHexString());
  grad.addColorStop(0.55, '#' + ic.getHexString());
  grad.addColorStop(0.88, '#' + ic.clone().multiplyScalar(0.62).getHexString());
  grad.addColorStop(1, '#' + ic.clone().multiplyScalar(0.28).getHexString());
  g.fillStyle = grad;
  g.beginPath(); g.arc(cx, cy, irisR, 0, Math.PI * 2); g.fill();

  // radial fibres
  g.globalAlpha = 0.22;
  g.strokeStyle = '#' + ic.clone().multiplyScalar(1.8).getHexString();
  g.lineWidth = 1.6;
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + (i % 3) * 0.02;
    const r0 = irisR * (0.24 + (i % 5) * 0.03);
    const r1 = irisR * (0.72 + (i % 7) * 0.035);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    g.stroke();
  }
  g.globalAlpha = 1;

  // pupil
  g.fillStyle = '#120c10';
  g.beginPath(); g.arc(cx, cy, irisR * 0.44, 0, Math.PI * 2); g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  return new THREE.MeshPhysicalMaterial({
    map: tex,
    roughness: 0.28,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.8
  });
}

/** The clear cornea dome that sits over the eye. */
export function makeCornea() {
  return memo('cornea', () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.02,
    metalness: 0,
    transmission: 0.6,
    thickness: 0.01,
    ior: 1.38,
    clearcoat: 1,
    clearcoatRoughness: 0.0,
    envMapIntensity: 2.4,
    depthWrite: false
  }));
}

/* --------------------------------------------------------------- hair --- */

/** Fine baby hair: anisotropic-ish, very soft, heavy sheen. */
export function makeHair({ color = 0x6b4a34, sheenColor = 0xffd9a8 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.62,
    metalness: 0,
    sheen: 1.0,
    sheenColor: new THREE.Color(sheenColor),
    sheenRoughness: 0.4,
    anisotropy: 0.7,
    anisotropyRotation: Math.PI / 2,
    envMapIntensity: 1.1,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.35
  });
}

/* -------------------------------------------------------- water & foam --- */

/** Bath water — transmissive, with two scrolling normal layers. */
export function makeWater({ tint = 0xbfe6ff, opacity = 0.72 } = {}) {
  const n1 = TEX.waterNormal({ seed: 53, scale: 6 });
  const n2 = TEX.waterNormal({ seed: 91, scale: 11 });
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint),
    transparent: true,
    opacity,
    transmission: 0.85,
    thickness: 0.35,
    roughness: 0.05,
    metalness: 0,
    ior: 1.333,
    normalMap: n1,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    attenuationColor: new THREE.Color(tint),
    attenuationDistance: 1.2,
    envMapIntensity: 1.7
  });
  mat.normalScale.set(0.35, 0.35);
  mat.userData.scrollA = n1;
  mat.userData.scrollB = n2;
  mat.userData.tick = (t) => {
    n1.offset.set(t * 0.018, t * 0.011);
    n2.offset.set(-t * 0.013, t * 0.021);
  };
  return mat;
}

/** Soap foam — bright, extremely rough, slight translucency at the edges. */
export function makeFoam({ color = 0xfffdfa } = {}) {
  return memo('foam' + color, () => {
    const maps = TEX.plastic({ color: 0xffffff, seed: 77, matte: 0.9 });
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      map: maps.map,
      normalMap: maps.normalMap,
      roughness: 0.92,
      metalness: 0,
      sheen: 1,
      sheenColor: new THREE.Color(0xffffff),
      transmission: 0.18,
      thickness: 0.05,
      ior: 1.1,
      envMapIntensity: 1.4
    });
    m.normalScale.set(1.4, 1.4);
    return m;
  });
}

/** Iridescent soap bubble. */
export function makeBubble() {
  return memo('bubble', () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.30,
    roughness: 0.02,
    metalness: 0,
    transmission: 0.95,
    thickness: 0.004,
    ior: 1.33,
    iridescence: 1.0,
    iridescenceIOR: 1.42,
    iridescenceThicknessRange: [180, 620],
    clearcoat: 1,
    clearcoatRoughness: 0,
    envMapIntensity: 2.2,
    side: THREE.DoubleSide,
    depthWrite: false
  }));
}

/** Wet-surface overlay factor — call when the baby comes out of the bath. */
export function applyWetness(material, amount) {
  if (!material) return;
  const a = THREE.MathUtils.clamp(amount, 0, 1);
  material.userData._dryRoughness ??= material.roughness;
  material.userData._dryClearcoat ??= material.clearcoat ?? 0;
  material.roughness = THREE.MathUtils.lerp(material.userData._dryRoughness, 0.10, a);
  if ('clearcoat' in material) {
    material.clearcoat = THREE.MathUtils.lerp(material.userData._dryClearcoat, 1.0, a);
    material.clearcoatRoughness = THREE.MathUtils.lerp(0.5, 0.04, a);
  }
  material.needsUpdate = false;
}

export function disposeAll() {
  for (const m of _cache.values()) m.dispose?.();
  _cache.clear();
}

/* ============================================================================
 * Nursery materials — appended for src/world/*
 * ========================================================================== */

/** Quilted padding (crib mattress, changing mat). */
export function makeQuilt({
  color = 0xfff6f0, cells = 5, seed = 13, repeat = 2, puff = 1
} = {}) {
  const maps = TEX.quilted({ color: 0xffffff, seed, cells, puff });
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1.0,
    metalness: 0,
    sheen: 0.75,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.75,
    envMapIntensity: 0.85
  });
  mat.normalScale.set(1.25, 1.25);
  for (const m of [mat.map, mat.normalMap, mat.roughnessMap]) m.repeat.set(repeat, repeat);
  return mat;
}

/**
 * Window glazing. Deliberately *not* `transmission`: a full-screen-sized
 * transmissive pane costs a whole extra scene resolve, and for flat float
 * glass a low-opacity clearcoat layer is visually identical — you want the
 * reflection and the faint green edge tint, not refraction.
 */
export function makeWindowGlass({ tint = 0xe8f2ff, roughness = 0.075, opacity = 0.16 } = {}) {
  const maps = TEX.ceramic({ color: 0xffffff, seed: 83, peel: 0.3 });
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint),
    transparent: true,
    opacity,
    roughness,
    metalness: 0,
    normalMap: maps.normalMap,        // the faint waviness of cheap float glass
    ior: 1.52,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    specularIntensity: 1,
    envMapIntensity: 1.9,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  mat.normalScale.set(0.07, 0.07);
  return mat;
}

/**
 * The film of running water that sits a few millimetres inside the glass.
 * `userData.tick(t)` scrolls the droplet sheet; two different speeds on the
 * alpha and the normal makes the drops look like they accelerate as they merge.
 */
export function makeRainFilm({ seed = 29, speed = 0.09 } = {}) {
  const maps = TEX.rainSheet({ seed });
  const alpha = maps.alphaMap.clone();
  const normal = maps.normalMap.clone();
  alpha.needsUpdate = normal.needsUpdate = true;
  alpha.wrapS = alpha.wrapT = normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xf2f8ff),
    transparent: true,
    opacity: 0.9,
    alphaMap: alpha,
    normalMap: normal,
    roughness: 0.05,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.2,
    depthWrite: false
  });
  mat.normalScale.set(1.1, 1.1);
  mat.userData.tick = (t) => {
    alpha.offset.y = -t * speed;
    normal.offset.y = -t * speed * 1.18;
  };
  mat.userData.setAmount = (a) => { mat.opacity = 0.9 * a; mat.visible = a > 0.01; };
  return mat;
}
