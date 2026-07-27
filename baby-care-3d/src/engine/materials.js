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

/* ------------------------------------------------------- texture views --- */

/**
 * Every `TEX.*` generator memoises its canvas synthesis, so two materials built
 * from the same generator are handed back *the same* `THREE.Texture` objects.
 * Writing `repeat` (or `offset`) on one of them therefore reaches across into
 * every other material sharing that cache entry, and the last writer wins in
 * whatever order the scene happens to be assembled. Retuning the tiling on the
 * floor planks would silently re-tile the cot, the shelves and the toy box too.
 *
 * The fix is that each material gets its own *view* of the shared pixels.
 * `texture.clone()` copies the sampler state and gives the copy its own
 * transform (`repeat` / `offset` / `center` / `rotation`) while keeping the
 * same `source`. That is genuinely free on the GPU: `WebGLTextures` maps
 * `texture.source` → uploads, and picks the `WebGLTexture` with a cache key
 * built purely from sampler state (wrap, filters, anisotropy, format,
 * colourspace — see `getTextureCacheKey`, which deliberately does not include
 * the transform). Views with matching sampler state therefore resolve to the
 * one upload that already exists.
 *
 * So the expensive half stays memoised — the procedural synthesis in
 * textures.js still runs once per distinct surface — and only these
 * few-dozen-byte wrappers are per material.
 */
const _views = new Set();

/** One private, disposable view of a shared cached texture. */
function view(tex) {
  if (!tex || tex.isTexture !== true || tex.isRenderTargetTexture) return tex;
  const v = tex.clone();          // `Texture.copy()` already flags needsUpdate
  _views.add(v);
  return v;
}

/**
 * Every texture slot a MeshPhysicalMaterial can carry, so a material never
 * keeps a cached texture object by accident.
 */
const MAP_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap',
  'bumpMap', 'displacementMap', 'emissiveMap', 'lightMap', 'specularMap',
  'specularColorMap', 'specularIntensityMap', 'sheenColorMap',
  'sheenRoughnessMap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'transmissionMap', 'thicknessMap', 'anisotropyMap'
];

/**
 * Give `mat` its own view of every texture it holds, then optionally stamp a
 * tiling onto those views. Call this instead of touching `mat.map.repeat`.
 *
 * A texture that arrives in more than one slot stays a *single* shared view —
 * `TEX.hairStrand()` hands the same canvas back as both `map` and `alphaMap`,
 * and splitting those into two objects would cost a second texture unit for no
 * reason. (This is the one thing it does better than the local `unshare()` in
 * world/props.js, which clones per slot.)
 *
 * @param {THREE.Material} mat
 * @param {{ repeat?: number|THREE.Vector2, offset?: THREE.Vector2 }} [opts]
 * @returns {THREE.Material} `mat`, for chaining.
 */
export function unshare(mat, { repeat, offset } = {}) {
  if (!mat) return mat;
  const seen = new Map();          // cached texture -> this material's view
  for (const slot of MAP_SLOTS) {
    const shared = mat[slot];
    if (!shared || shared.isTexture !== true) continue;
    let v = seen.get(shared);
    if (v === undefined) { v = view(shared); seen.set(shared, v); }
    mat[slot] = v;
  }
  for (const v of seen.values()) {
    if (repeat !== undefined) {
      if (repeat.isVector2) v.repeat.copy(repeat);
      else v.repeat.set(repeat, repeat);
    }
    if (offset !== undefined) v.offset.copy(offset);
  }
  return mat;
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
    // 0.12 clearcoat over an already-glossy roughness map was the "oiled vinyl"
    // read: a broad, low-frequency sheen sitting on top of the forehead, cheek
    // and chest at once. Baby skin is matte with a *localised* highlight, so
    // the coat is nearly off and the variation is carried by the roughness map.
    clearcoat: 0.045,
    clearcoatRoughness: 0.62,
    sheen: sheen,             // vellus "peach fuzz" rim
    sheenColor: new THREE.Color(0xffd0c0),
    sheenRoughness: 0.85,
    envMapIntensity: 0.85
  });
  mat.normalScale.set(0.35, 0.35);
  unshare(mat, { repeat: poreScale });

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
      //
      // ── Why this term used to bloom ──────────────────────────────────────
      //
      // The old formulation added `wrap * 0.28 + backscatter * 0.55` scaled by
      // the raw light colour, then multiplied the lot by `0.45 + fresnel * 0.9`
      // — a factor that *peaks at 1.35 on the silhouette*. Three things went
      // wrong at once and they compounded:
      //
      //   1. `wrap` was added on top of a Lambert term the renderer had already
      //      paid in full, so the *lit* side of the baby got scatter it should
      //      not have had. Subsurface transport moves light sideways under the
      //      surface; it does not manufacture new light where the surface is
      //      already facing the source.
      //   2. `pow(dot(V,-L) * 0.5 + 0.5, 3.0)` is 0.125 at dot = 0 and never
      //      reaches zero at all, so every fragment on the model — including
      //      ones with the key square in front of them — carried backscatter.
      //   3. The fresnel factor then multiplied *up* precisely on the rim,
      //      where all three lights already graze.
      //
      // With a 2.98-intensity key the red channel came out near 2.9 on a
      // backlit edge against a bloom gate of 0.86: a saturated orange corona
      // around the whole silhouette, brighter than the window.
      //
      // The rewrite keeps the same two physical effects and makes each one
      // fire only where it is physically available:
      //
      //   • `wrapGain = wrap − NdotL` is the light the wrap term adds *beyond*
      //     Lambert. It is identically zero on the fully lit side, peaks at the
      //     terminator, and returns to zero in full shadow. That is the shape
      //     of real terminator bleed, and it means the term cannot brighten an
      //     already-bright fragment.
      //   • `pow(clamp(dot(V, −L)), 4.0)` is hard-clamped, so backscatter only
      //     exists when the light is genuinely behind the subject relative to
      //     camera — an ear against a window, not a cheek in front of one.
      //
      // The fresnel weight now only ever *attenuates* (`mix(0.55, 1.0, f)`),
      // and the whole result passes through a soft ceiling so no combination of
      // mood, exposure and light count can put the silhouette over the gate.
      // Result: a rim, not a halo.
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
              float sssNdL = dot(sssN, sssL);
              // wrapped diffuse, minus the Lambert the renderer already added:
              // what is left is the bleed *around* the terminator and nothing else
              float sssWrap = max(0.0, (sssNdL + uWrap) / (1.0 + uWrap));
              float sssBleed = max(0.0, sssWrap - max(0.0, sssNdL));
              // back scatter: light travelling *through* thin parts (ears,
              // fingers, the rim of a cheek) — only when the light really is
              // on the far side, hence the clamp before the power
              float sssBack = pow(clamp(dot(sssV, -sssL), 0.0, 1.0), 4.0);
              sssAccum += directionalLights[ i ].color * (sssBleed * 0.52 + sssBack * 0.17);
            }
          }
          #pragma unroll_loop_end
          #endif

          #if ( NUM_HEMI_LIGHTS > 0 )
          #pragma unroll_loop_start
          for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
            {
              sssAccum += hemisphereLights[ i ].skyColor * 0.05;
            }
          }
          #pragma unroll_loop_end
          #endif

          // Fresnel weighting keeps the scatter on grazing angles where real
          // subsurface transport is most visible — but it can only take away.
          float sssFres = pow(1.0 - clamp(dot(sssN, sssV), 0.0, 1.0), 1.6);
          vec3 sss = sssAccum * uSubsurface * diffuseColor.rgb
                   * uTranslucency * mix(0.55, 1.0, sssFres);
          // Soft ceiling: a Reinhard knee that is linear for small values and
          // asymptotes at 0.62, so the scatter can never be the brightest thing
          // in the frame no matter how the moods are retuned later.
          sss = sss / (1.0 + sss * 1.6);
          reflectedLight.directDiffuse += sss;
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
  // 0.9 on a weave whose relief is already exaggerated in the height field put
  // a 2 mm-deep waffle on a baby's jersey top: it read as a knitted string vest
  // or a quilted pot-holder, not as soft cotton. Cloth relief is what makes the
  // *sheen* break up; it is not meant to be legible as geometry.
  normalScale = 0.6
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
  unshare(mat, { repeat });
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
  seed = 3, ringScale = 26, clearcoat = 0.35, satin = 0.42,
  // De-tiling. Defaults on for plank floors, where the repeat is what the eye
  // catches; off for furniture, where each part is smaller than one tile.
  deTile = planks > 0,
  jointEvery = 1.35              // butt joints per map-space unit
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
    /* 0.35 is a *piano* finish. On the chest of drawers — a 1.2 m flat panel
     * facing the window — that plus the room agent's `envMapIntensity = 1.45`
     * produced a single broad mirror reflection of the environment across the
     * whole carcass, and the oak dresser read as chrome. Nursery furniture is
     * satin-lacquered: the coat scatters its reflection over 20–30°, so you
     * get a soft sheen that tells you the surface is sealed, not an image of
     * the room in it. This is also the difference between "wood" and the
     * generic plastic look flagged in rubric §4.2 #21.
     */
    clearcoatRoughness: 0.62,
    // Deliberately below the room's 1.45: a lacquered panel should pick up
    // *less* of the environment than the matte wall next to it, not more.
    envMapIntensity: 0.9
  });
  mat.normalScale.set(0.7, 0.7);
  unshare(mat, { repeat });
  // Multiply the grain darks in via the base colour so we keep one texture set
  // for every wood tone in the game.
  mat.color.lerp(new THREE.Color(dark), 0.25);

  if (deTile && planks > 0) {
    /* Why the floor had a countable repeat (defect D22).
     *
     * The tile itself is fine — seven seeded planks, each with its own phase,
     * warp seed and tone. The problem is that the floor lays it down 2.4 times
     * in *each* axis, so plank row 0 and plank row 7 are byte-identical, and
     * because a plank is a long horizontal band the eye gets to compare them
     * directly, side by side, across the whole frame. That is what produced
     * "identical curved arcs recur across planks".
     *
     * Making the tile bigger only moves the problem. The fix is to stop the
     * geometry and the texture sharing a lattice at all: for each plank on the
     * actual floor, slide the sample window along the grain by a hash of that
     * plank's *global* index. Grain runs along u and every plank feature —
     * the joint, the tone step — is a function of v alone, so an offset in u
     * changes which stretch of board you are looking at without disturbing a
     * single plank boundary.
     *
     * On top of that the boards are cut into butt-jointed lengths, staggered
     * per row, each length taking its own offset. A real floor is laid from
     * 1–2 m boards; a continuous 5 m plank is itself a giveaway. The joint
     * lands exactly where the sampling derivative is discontinuous, so the one
     * artefact this technique can produce is hidden inside the one feature it
     * adds.
     *
     * Two texture fetches, no extra memory, and no repeat period the eye can
     * lock onto at any distance.
     */
    const uniforms = {
      uPlankRows: { value: planks },
      uJoint: { value: jointEvery }
    };
    mat.userData.uniforms = uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          uniform float uPlankRows, uJoint;
          float wdHash(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
          // Per-plank, per-board sample offset. Returns the shifted uv; the
          // out param is 1 at a butt joint and falls off over ~2 mm.
          vec2 wdDetile(vec2 uv, out float joint) {
            float row = floor(uv.y * uPlankRows);
            float rh = wdHash(row * 7.31 + 3.7);
            /* Board *lengths* vary per course, not just their phase. With a
             * fixed pitch the joints landed on a lattice: staggered between
             * rows, but every row's joints exactly uJoint apart, which the
             * eye assembled — together with the plank seams running the other
             * way — into a grid. The floor read as square tiles rather than as
             * boards. A ±25% per-course length is what a real pack of flooring
             * gives you and it destroys the lattice completely. */
            float pitch = uJoint * (0.78 + rh * 0.5);
            float bx = uv.x / pitch + rh * 4.17;
            float board = floor(bx);
            float bh = wdHash(board * 19.13 + row * 5.77);
            /* Width is in *board lengths*, so 0.012 on a 1.2 m board was a
             * 15 mm black band on each side of every joint — a 30 mm dark
             * cross-line, which is what the remaining regular banding across
             * the floor actually was. A butt joint in a fitted floor is a
             * hairline: 0.0025 of a board is ~3 mm. */
            /* Analytic lines have no mip chain, so this has to antialias
             * itself or it turns into a dotted crawl at grazing angles. The
             * half-width is the greater of the real 3 mm and half the change in
             * 'bx' across one pixel, which makes the joint fade out smoothly to
             * a uniform slight darkening once it is finer than the display can
             * carry, instead of flickering on and off. */
            float bw = max(0.0025, fwidth(bx) * 0.5);
            joint = (1.0 - smoothstep(0.0, bw, min(fract(bx), 1.0 - fract(bx))))
                  * min(1.0, 0.0025 / bw);
            return vec2(uv.x + bh * 6.31 + rh * 2.19, uv.y);
          }
        `)
        .replace('#include <map_fragment>', /* glsl */`
          /* THE bright dotted hairline down every plank joint (defect D22, the
           * one that survived four passes of retuning the texture itself).
           *
           * wdDetile() slides the sample window along u by a hash of the *plank
           * row*, which is floor(uv.y * uPlankRows) -- a step function. So on
           * the one pixel row where a plank boundary crosses the quad, dFdy of
           * the shifted uv is not "half a texel", it is six whole tile widths.
           * The hardware reads that as "this pixel covers the entire texture"
           * and hands back the 1×1 mip, i.e. the flat average of the map, which
           * is ~30/255 brighter than the joint it lands in. Hence a bright line
           * exactly at every plank boundary, at every distance including the
           * sharp foreground; hence the 2-pixel dotting, because derivatives are
           * evaluated per 2×2 quad and only the quads the boundary actually
           * crosses are affected; and hence its total indifference to every
           * change made to the normal map, the ring model and the seam profile.
           *
           * The de-tile is a pure translation, so the honest derivative is the
           * one from the *un*shifted uv. textureGrad hands the hardware that
           * instead, and the LOD is correct everywhere. */
          float wdJoint;
          vec2 wdUv = wdDetile(vMapUv, wdJoint);
          vec2 wdDx = dFdx(vMapUv), wdDy = dFdy(vMapUv);
          diffuseColor *= textureGrad( map, wdUv, wdDx, wdDy );
          // The dark line of the butt joint itself. 0.55 was a 45% black line —
          // as strong as the plank seam, so the two read as equal partners in a
          // grid instead of "long boards, occasionally jointed". A butt joint
          // in a fitted floor is a hairline; it should be just visible.
          diffuseColor.rgb *= 1.0 - wdJoint * 0.30;
        `)
        .replace('#include <roughnessmap_fragment>', /* glsl */`
          float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            vec4 texelRoughness = textureGrad( roughnessMap, wdUv, wdDx, wdDy );
            roughnessFactor *= texelRoughness.g;
          #endif
          roughnessFactor = clamp(roughnessFactor + wdJoint * 0.16, 0.04, 1.0);
        `);
    };
    mat.customProgramCacheKey = () => 'wood-detile';
  }
  return mat;
}

/* ------------------------------------------------------------ surfaces --- */

/**
 * Painted wall.
 *
 * `wallpaper()` supplies the roller texture; this adds the one thing a tiling
 * texture structurally cannot — *position-dependent* wear. The scuff has to
 * know where the floor is, and the map repeats several times up the wall, so
 * it is driven from world Y instead.
 *
 * Two bands, both from the same world-space height:
 *
 *   • a grubby zone in the ~28 cm directly above the skirting, where a
 *     nursery wall gets kicked, scraped by furniture and wiped. It is
 *     *desaturated and rougher*, not just darker — that is the difference
 *     between "in shadow" and "dirty".
 *   • an ambient dust gradient in the last 6 cm, the dark line every wall has
 *     where it meets the trim and the vacuum never reaches.
 *
 * A noise field breaks both edges so neither reads as a band, and the scuff is
 * modulated so it clusters rather than sitting at constant strength along the
 * whole run.
 */
export function makeWall({
  base = 0xf3e7f2, tint = 0xe6d3ec, repeat = 4, seed = 11,
  skirtY = 0.115,        // world height of the top of the skirting, metres
  scuff = 1.0
} = {}) {
  return memo(`wall${base}${tint}${repeat}${seed}${skirtY}${scuff}`, () => {
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
    mat.normalScale.set(0.5, 0.5);
    unshare(mat, { repeat });

    if (scuff > 0) {
      const uniforms = {
        uSkirtY: { value: skirtY },
        uScuff: { value: scuff }
      };
      mat.userData.uniforms = uniforms;
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', /* glsl */`
            #include <common>
            varying vec3 vWallWorld;
          `)
          .replace('#include <begin_vertex>', /* glsl */`
            #include <begin_vertex>
            vWallWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
          `);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', /* glsl */`
            #include <common>
            varying vec3 vWallWorld;
            uniform float uSkirtY, uScuff;
            ${_NOISE_GLSL}
          `)
          .replace('#include <color_fragment>', /* glsl */`
            #include <color_fragment>
            // Horizontal coordinate along whichever wall this is, so the scuff
            // clusters in the same places on a north wall and an east wall
            // without either of them knowing its own orientation.
            vec2 wallP = vec2(vWallWorld.x + vWallWorld.z, vWallWorld.y);
            float wallN = bcFbm(wallP * vec2(1.7, 3.1));
            float wallBig = bcFbm(wallP * vec2(0.42, 0.9));
            float h = vWallWorld.y - uSkirtY;
            // scuff zone, edge broken by noise so it is never a band
            float scuffBand = 1.0 - smoothstep(0.0, 0.28 + wallN * 0.16, max(0.0, h));
            float scuffAmt = scuffBand * smoothstep(0.35, 0.85, wallBig) * uScuff;
            // dust/AO line right in the corner
            float dust = (1.0 - smoothstep(0.0, 0.055, max(0.0, h))) * uScuff;
            // dirty = darker AND less saturated, otherwise it reads as shadow
            vec3 grubby = mix(diffuseColor.rgb,
                              vec3(dot(diffuseColor.rgb, vec3(0.33))) * 0.86,
                              0.55);
            diffuseColor.rgb = mix(diffuseColor.rgb, grubby, clamp(scuffAmt * 0.75, 0.0, 1.0));
            diffuseColor.rgb *= 1.0 - dust * 0.16;
            float wallWear = scuffAmt;
          `)
          .replace('#include <roughnessmap_fragment>', /* glsl */`
            #include <roughnessmap_fragment>
            roughnessFactor = clamp(roughnessFactor + wallWear * 0.12, 0.04, 1.0);
          `);
      };
      mat.customProgramCacheKey = () => 'wall-scuff';
    }
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
  /* Tiling cap. A rug is the one surface in the room that is *always* seen
   * whole, from standing height, at 2–3 m — so its tile is only ever minified,
   * never magnified, and the caller's `repeat` sets how many screen pixels a
   * tuft gets. At repeat 5 on a 2.36 m rug a tuft lands on two pixels and the
   * pile turns to dither (see TEX.carpet). 3.2 puts it on four to five, which
   * is the point where the normal map starts describing a shape instead of
   * flickering. Capped rather than exposed as a new argument because there is
   * no rug in the game for which a finer tile would survive to the screen.
   */
  unshare(mat, { repeat: Math.min(repeat, 3.2) });
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
  unshare(mat, { repeat });
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
  unshare(mat, { repeat });
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
  unshare(mat, { repeat });
  return mat;
}

/* -------------------------------------------------------------- metal --- */

export function makeMetal({ color = 0xd8dde2, roughness = 0.22, seed = 61 } = {}) {
  return memo(`metal${color}${roughness}`, () => {
    const maps = TEX.ceramic({ color: 0xffffff, seed, peel: 0.6 });
    return unshare(new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      normalMap: maps.normalMap,
      roughness,
      metalness: 1.0,
      envMapIntensity: 1.5
    }));
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

/**
 * The clear cornea dome that sits over the eye — and, since it is the only
 * surface in the character that is actually shaped like a cornea, the thing
 * that carries the catchlight.
 *
 * The old dome was `opacity 0.22 / transmission 0.6 / envMapIntensity 2.4`.
 * Every one of those three fought the iris:
 *
 *   • `opacity 0.22` is a 22% white veil over the entire pupil. On a dark navy
 *     iris under a bright key that is enough to lift it most of the way to mid
 *     grey — the "milky grey lens" — and it does it uniformly, so the iris
 *     loses contrast without gaining anything.
 *   • `transmission 0.6` sends a 2 mm dome through three's transmission
 *     resolve, which samples a half-resolution blurred copy of the frame
 *     behind it. At eye scale that is a blurred *screen* sample, not the iris
 *     3 mm behind: it washes the pupil out and costs a render target.
 *   • `envMapIntensity 2.4` then adds a broad ambient sheen across the whole
 *     dome rather than a point.
 *
 * A real cornea is invisible. You do not see it; you see the single hard
 * specular it puts on the eye and the fact that the iris sits behind glass.
 * So the dome is now essentially clear, and its *alpha* is driven by its own
 * specular: transparent everywhere, briefly opaque and bright exactly where a
 * light reflects. That is the catchlight, and because it is computed from
 * `directionalLights[i].direction` it lands where the key actually is, moves
 * when the key moves, and falls in a slightly different place in each eye
 * (the two domes have different world normals and different view vectors) —
 * which is what a fixed pivot-local billboard could never do.
 */
export function makeCornea({
  primary = 0.17,       // catchlight half-angle in radians (~10°)
  secondary = 0.75,     // the broad "wet" sheen around it
  gain = 1.35
} = {}) {
  return memo(`cornea${primary}${secondary}${gain}`, () => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      // Just enough veil to read as a wet surface over the sclera, far below
      // the level at which it starts greying the iris.
      opacity: 0.045,
      roughness: 0.04,
      metalness: 0,
      transmission: 0,
      ior: 1.376,
      clearcoat: 0,
      envMapIntensity: 0.55,
      depthWrite: false,
      side: THREE.FrontSide
    });

    const uniforms = {
      uCatchTight: { value: primary },
      uCatchBroad: { value: secondary },
      uCatchGain:  { value: gain }
    };
    mat.userData.uniforms = uniforms;

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          uniform float uCatchTight, uCatchBroad, uCatchGain;
          // Set in main(), read again a few chunks later by the alpha override.
          float gCatch;
        `)
        .replace('#include <lights_fragment_end>', /* glsl */`
          #include <lights_fragment_end>
          {
            vec3 cN = normal;
            vec3 cV = normalize(vViewPosition);
            vec3 acc = vec3(0.0);
            float peak = 0.0;
            #if ( NUM_DIR_LIGHTS > 0 )
            #pragma unroll_loop_start
            for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
              {
                vec3 cH = normalize(directionalLights[ i ].direction + cV);
                // Angle between the surface normal and the half vector, in
                // radians. Working in angle rather than pow(NdotH, n) is what
                // makes the size of the catchlight an authorable number
                // (0.17 rad ≈ 10° ≈ a 2 mm spot on a 13 mm dome) instead of an
                // exponent in the thousands that aliases at any screen size.
                float cA = acos(clamp(dot(cN, cH), -1.0, 1.0));
                // Two lobes: a tight one that *is* the catchlight, and a wide
                // low one that keeps the eye looking wet off-axis.
                float tight = 1.0 - smoothstep(uCatchTight * 0.5, uCatchTight, cA);
                float broad = 1.0 - smoothstep(uCatchBroad * 0.35, uCatchBroad, cA);
                float w = tight + broad * 0.06;
                acc += directionalLights[ i ].color * w;
                peak = max(peak, w);
              }
            }
            #pragma unroll_loop_end
            #endif
            reflectedLight.directSpecular += acc * uCatchGain;
            gCatch = clamp(peak * 1.5, 0.0, 1.0);
          }
        `)
        // A transparent surface's outgoing light is scaled by its alpha at
        // blend time, so a bright specular on a 4.5%-opaque dome would be
        // invisible. Letting the specular drive the alpha is what turns the
        // dome into "clear glass with one hard highlight on it".
        .replace('#include <opaque_fragment>', /* glsl */`
          diffuseColor.a = clamp(diffuseColor.a + gCatch, 0.0, 1.0);
          #include <opaque_fragment>
        `);
    };
    mat.customProgramCacheKey = () => 'cornea-catchlight';
    return mat;
  });
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
  // Private views: `tick()` writes a scroll offset every frame and that offset
  // is per-surface state, so the tub and the sink must not share one texture.
  const n1 = view(TEX.waterNormal({ seed: 53, scale: 6 }));
  const n2 = view(TEX.waterNormal({ seed: 91, scale: 11 }));
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
    return unshare(m);
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
  // Each view holds a reference on the shared GPU texture — three refcounts
  // uploads per `source` — so releasing the cached originals in TEX.disposeAll()
  // is not enough on its own; the wrappers have to go too.
  for (const v of _views) v.dispose();
  _views.clear();
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
  unshare(mat, { repeat });
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
  unshare(mat);
  return mat;
}

/**
 * The film of running water that sits a few millimetres inside the glass.
 * `userData.tick(t)` scrolls the droplet sheet; two different speeds on the
 * alpha and the normal makes the drops look like they accelerate as they merge.
 */
export function makeRainFilm({ seed = 29, speed = 0.09 } = {}) {
  const maps = TEX.rainSheet({ seed });
  // Private views — `tick()` scrolls these, and `rainSheet()` is memoised.
  const alpha = view(maps.alphaMap);
  const normal = view(maps.normalMap);
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

/* ============================================================================
 * Character additions (appended — nothing above this line was modified)
 * ========================================================================== */

/** Small GLSL helper: cheap 3-octave value noise, shared by the skin extras. */
const _NOISE_GLSL = /* glsl */`
  float bcHash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float bcNoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = bcHash(i), b = bcHash(i+vec2(1,0)), c = bcHash(i+vec2(0,1)), d = bcHash(i+vec2(1,1));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float bcFbm(vec2 p){ return bcNoise(p)*0.55 + bcNoise(p*2.3)*0.30 + bcNoise(p*5.1)*0.15; }
`;

/**
 * Baby skin: makeSkin() plus per-zone grime and wetness driven by a vertex
 * attribute. The geometry carries `aZone` = (face, hands, feet, body) soft
 * masks, so `uDirt` darkens exactly the region that actually got dirty and
 * fades out naturally at its edges — no decals, no second texture set.
 */
export function makeBabySkin(opts = {}) {
  const mat = makeSkin(opts);
  const extra = {
    uDirt:      { value: new THREE.Vector4(0, 0, 0, 0) },
    uDirtColor: { value: new THREE.Color(0x6a4a2e) },
    uWet:       { value: 0 },
    uBlush:     { value: 0 },
    uGrimeScale:{ value: 9.0 }
  };
  Object.assign(mat.userData.uniforms, extra);
  const base = mat.onBeforeCompile;

  mat.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    Object.assign(shader.uniforms, extra);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        attribute vec4 aZone;
        varying vec4 vBabyZone;
        varying vec2 vBabyUv;
      `)
      .replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        vBabyZone = aZone;
        vBabyUv = uv;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying vec4 vBabyZone;
        varying vec2 vBabyUv;
        uniform vec4  uDirt;
        uniform vec3  uDirtColor;
        uniform float uWet;
        uniform float uGrimeScale;
        ${_NOISE_GLSL}
      `)
      // after the albedo is resolved, before lighting
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        float bcZone = clamp(dot(vBabyZone, uDirt), 0.0, 1.4);
        float bcN = bcFbm(vBabyUv * uGrimeScale);
        // smudges, not a flat tint: the noise decides where grime actually sits
        float bcDirt = smoothstep(0.30, 0.92, bcZone * (0.45 + bcN * 1.05));
        diffuseColor.rgb = mix(diffuseColor.rgb,
                               uDirtColor * (0.55 + bcN * 0.55),
                               bcDirt * 0.88);
        // wet skin is darker and a touch more saturated
        diffuseColor.rgb *= mix(1.0, 0.86, uWet);
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + bcDirt * 0.30 - uWet * 0.45, 0.04, 1.0);
      `);
  };
  mat.customProgramCacheKey = () => 'baby-skin-sss';
  mat.userData.setDirt = (v) => extra.uDirt.value.copy(v);
  mat.userData.setWet = (v) => { extra.uWet.value = v; };
  return mat;
}

/** Soft baby hair cards: makeHair() with the strand alpha actually attached. */
export function makeHairCards({
  color = 0x8a6242, sheenColor = 0xffd9a8, strands = 9, seed = 5
} = {}) {
  const maps = TEX.hairStrand({ strands, seed });
  const mat = makeHair({ color, sheenColor });
  mat.map = maps.map;
  mat.alphaMap = maps.alphaMap;      // same object as .map — unshare() keeps it so
  mat.normalMap = maps.normalMap;
  unshare(mat);
  mat.normalScale = new THREE.Vector2(0.55, 0.55);
  mat.alphaTest = 0.42;
  mat.depthWrite = true;
  mat.needsUpdate = true;
  return mat;
}

/** Opaque scalp layer under the cards, so no scalp shows through partings. */
export function makeScalp({ color = 0x6f4c33 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.72, metalness: 0,
    sheen: 0.9, sheenColor: new THREE.Color(0xffd9a8), sheenRoughness: 0.55,
    envMapIntensity: 0.9
  });
}

/** A water droplet clinging to skin. */
export function makeDroplet({ tint = 0xd8f0ff } = {}) {
  return memo('droplet' + tint, () => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint),
    transparent: true, opacity: 0.62,
    roughness: 0.02, metalness: 0,
    transmission: 0.9, thickness: 0.003, ior: 1.333,
    clearcoat: 1, clearcoatRoughness: 0,
    envMapIntensity: 2.4, depthWrite: false
  }));
}

/** A tear: slightly thicker and brighter than a bath droplet, so it reads. */
export function makeTear() {
  return memo('tear', () => new THREE.MeshPhysicalMaterial({
    color: 0xe6f6ff, transparent: true, opacity: 0.78,
    roughness: 0.02, metalness: 0, transmission: 0.85,
    thickness: 0.002, ior: 1.333, clearcoat: 1, clearcoatRoughness: 0,
    envMapIntensity: 2.6, depthWrite: false
  }));
}

/** Wet, dark mouth interior. Rendered back-side: we only ever see its inside. */
export function makeMouthInterior({ color = 0x7d2630 } = {}) {
  return memo('mouth' + color, () => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color), roughness: 0.42, metalness: 0,
    clearcoat: 0.7, clearcoatRoughness: 0.25, side: THREE.BackSide
  }));
}

export function makeTongue({ color = 0xe0707e } = {}) {
  return memo('tongue' + color, () => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color), roughness: 0.28, metalness: 0,
    clearcoat: 0.95, clearcoatRoughness: 0.10, sheen: 0.4,
    sheenColor: new THREE.Color(0xffc0cb)
  }));
}

export function makeTooth() {
  return memo('tooth', () => new THREE.MeshPhysicalMaterial({
    color: 0xfffdf6, roughness: 0.16, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2
  }));
}

/** Lash / brow hair: soft, slightly translucent, never jet black on a baby. */
export function makeLash({ color = 0x4b3428, opacity = 1 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color), roughness: 0.5, metalness: 0,
    sheen: 0.85, sheenColor: new THREE.Color(0xb08d6a), sheenRoughness: 0.45,
    side: THREE.DoubleSide, transparent: opacity < 1, opacity
  });
}

/**
 * Cheek blush — a soft radial wash that hugs the cheek.
 *
 * It was a `MeshBasicMaterial`, i.e. unlit, which is wrong in two directions at
 * once: it stayed at full brightness when the cheek was in shadow (so the blush
 * detached from the head and floated), and it could not pick up the key's
 * colour, so it read as a pink sticker rather than as blood under skin.
 *
 * It is now the *skin shader* with a redder subsurface tint and a redder
 * albedo. That is more than a "make it lit" fix: because it runs the same
 * wrapped-diffuse and back-scatter maths as the surface it sits on, it shades
 * identically to the cheek under it and simply becomes a warmer patch of the
 * same material. Blush that is actually reddened skin is the whole point.
 */
export function makeBlush({ color = 0xff6e88, subsurface = 0xff4a3c } = {}) {
  const mat = makeSkin({
    color,
    subsurface,
    // A cheek is one of the thinnest, best-vascularised parts of a baby's face,
    // so it should scatter harder than the rest of the body, not less.
    translucency: 1.0,
    wrap: 0.62,
    sheen: 0.25,
    poreScale: 6.0
  });
  // The radial sprite carries the shape in its *alpha*; the RGB is white, so it
  // does not fight the base colour.
  mat.alphaMap = view(TEX.radialSprite({ size: 128, power: 2.6, inner: 1, seed: 5 }));
  mat.transparent = true;
  mat.opacity = 0;
  mat.depthWrite = false;
  // The caps sit a fraction of a millimetre off the cheek. Without an offset
  // the two surfaces z-fight at closeup range.
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  mat.customProgramCacheKey = () => 'blush-sss';
  return mat;
}

/**
 * The catchlight billboard that used to sit on the cornea.
 *
 * It was an additive `MeshBasicMaterial` disc with `toneMapped: false` pinned
 * to a fixed pivot-local offset. That guarantees a specular hit, but it is a
 * *painted* one: it rotated with the gaze and never once looked at where the
 * light was, so as the key swung across the room from `day` to `golden` to the
 * night lamp the highlight in the baby's eye stayed exactly where it was, in
 * both eyes, identically. `toneMapped: false` also meant it bypassed AgX and
 * went straight to display white regardless of exposure.
 *
 * `face.js` now hangs the disc on a rig it re-aims down the real key's half
 * vector every frame, which fixes the *placement* half of the defect. This
 * fixes the other half: the disc is no longer a display-white decal.
 *
 *   • `toneMapped: false` meant it skipped AgX entirely and hit 1.0 on screen
 *     whatever the exposure — so the "specular" in the baby's eye was the one
 *     element of the frame that did not respond to the lighting mood at all.
 *     It is now graded with everything else.
 *   • 0.85 additive over an already-lit cornea is a blown white speck. At 0.36
 *     it is a soft core, and the *hard* centre of the highlight is supplied by
 *     the cornea's own analytic specular (see `makeCornea`), which carries the
 *     key's actual colour and size. Core plus soft halo, both from the same
 *     direction, is what a real catchlight looks like.
 */
export function makeCatchlight({ opacity = 0.36 } = {}) {
  return new THREE.MeshBasicMaterial({
    map: view(TEX.radialSprite({ size: 64, power: 2.2 })),
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity, toneMapped: true
  });
}
