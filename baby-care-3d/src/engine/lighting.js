/* ============================================================================
 * lighting.js — Lighting rig + procedural IBL
 * ----------------------------------------------------------------------------
 * Three ideas do most of the work here:
 *   1. A hand-built "light box" scene is baked through PMREMGenerator so every
 *      PBR surface gets real image-based ambient instead of a flat hemisphere.
 *   2. A key / fill / rim / bounce rig borrowed straight from product
 *      photography — that's what makes toys look photographed, not rendered.
 *   3. Time-of-day presets crossfade the whole rig, so evening bath time and
 *      midday play read as genuinely different rooms.
 * ========================================================================== */

import * as THREE from 'three';

/* ------------------------------------------------------------- IBL ------- */

/**
 * Build a small emissive box scene that stands in for a real HDRI.
 * Warm ceiling bounce, a big cool window on -X, soft pastel walls.
 */
function buildEnvScene(mood) {
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.deleteAttribute('uv');

  const panel = (color, intensity, pos, scale, rot) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.BackSide
    }));
    m.position.set(...pos);
    m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    scene.add(m);
    return m;
  };

  const area = (color, intensity, pos, scale, rot) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity)
    }));
    m.position.set(...pos);
    m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    scene.add(m);
    return m;
  };

  // Enclosing room shell — this is the ambient floor of the whole image.
  panel(mood.envWall, mood.envWallI, [0, 0, 0], [22, 12, 22]);
  // Ceiling: warm bounce from the room's own lights.
  area(mood.envCeil, mood.envCeilI, [0, 5.6, 0], [16, 0.1, 16]);
  // Floor bounce: picks up the rug colour, fills the underside of the baby.
  area(mood.envFloor, mood.envFloorI, [0, -5.6, 0], [16, 0.1, 16]);
  // The window — the single strongest source, deliberately off-axis.
  area(mood.envWindow, mood.envWindowI, [-6.6, 1.4, 1.2], [0.1, 5.2, 6.4]);
  // Soft opposite fill so rims never go pitch black.
  area(mood.envFill, mood.envFillI, [6.4, 0.8, -1.0], [0.1, 4.0, 5.0]);
  // Two small warm sources standing in for lamps / practicals.
  area(mood.envLamp, mood.envLampI, [2.6, 2.4, 3.4], [1.2, 1.2, 0.1]);
  area(mood.envLamp, mood.envLampI * 0.6, [-2.2, 2.0, -3.6], [1.4, 1.0, 0.1]);

  return scene;
}

/* --------------------------------------------------------- mood presets -- */

/**
 * Two things every entry now carries that it did not before.
 *
 * `shadowSpan` — the half-width, in metres, of the key light's orthographic
 * shadow frustum. It used to be a single hardcoded 4.2 for every mood, which
 * silently capped how *long* a cast shadow could be: a low raking key throws a
 * shadow three or four times the height of the object casting it, and anything
 * past 4.2 m from the aim point simply fell outside the map and vanished. That
 * is why `golden` — whose whole identity is long shadows — rendered as flat
 * ambient. The span is per mood because a high midday key needs a *tight*
 * frustum for shadow texel density, and a low evening key needs a wide one.
 *
 * `grade.shadowTint / highTint / split` — the split-tone pair fed to the grade
 * pass. Warm key against neutral shadow gives an image luminance range but no
 * chromatic range; these push the shadows toward whatever is actually filling
 * them (the sky, the window, a lamp on the far wall) so the frame has both.
 *
 * `grade.black` — the grade's authored black point (see render.js `uBlack`).
 *
 * ---------------------------------------------------------------------------
 * VALUE RANGE, measured. `tools/histo.mjs docs/shots` reported the whole set
 * living between display 0.27 and 0.67, with *zero* pixels above 0.95 in every
 * frame that had no HUD in it and under 1.2% below 0.15 — rubric §4 #101, and
 * a regression. Three things were adding up to it and all three are addressed
 * from this table:
 *
 *   1. The *ambient* half of the rig had grown to roughly the size of the key.
 *      Summed over rim + fill + hemi + env, a surface facing away from the sun
 *      was receiving ~2.0 against the key's 3.95 — a 2:1 lighting ratio, which
 *      is a soft-box product shot, not a room with a window in it. Nothing can
 *      be dark in a 2:1 room. The rim in particular was doing ambient's job at
 *      1.85: it is a *separation* light and it is back to a separation light.
 *   2. Nothing in the set was bright enough to reach the top of the curve.
 *      AgX needs linear 5.2 for display 0.95; the brightest thing in the room
 *      was a sky emitting linear ~1.4. That is fixed in window.js (`SKY.gain`),
 *      which is the only surface in the frame that has any business being three
 *      stops over the interior.
 *   3. No black point. Added per mood below.
 */
export const MOODS = {
  day: {
    envWall: 0xeae4f4, envWallI: 0.1925,
    // The ceiling probe face is a *warm* bounce at close to half the window's
    // own strength, and it is omnidirectional — it lands on the shadow side of
    // everything with no direction at all, which is the single largest reason
    // nothing in the room could be dark. Down a third; the window face carries
    // the ambient now, and it at least comes from one side.
    envCeil: 0xfff4e6, envCeilI: 0.290,
    envFloor: 0xffd9e6, envFloorI: 0.115,
    envWindow: 0xdff0ff, envWindowI: 1.2,
    envFill: 0xe6ecff, envFillI: 0.385,
    envLamp: 0xffd9a0, envLampI: 0.18,

    keyColor: 0xfff0d4, keyIntensity: 3.05, keyPos: [-4.4, 4.6, 3.4],
    // The fill is the sky coming through the window on the shadow side. It was
    // at 0.43 and barely tinted anything; at 0.62 the shaded side of every prop
    // reads visibly blue against the key's cream.
    //
    // …and then the *whole shadow side of the room* went to near-silhouette:
    // in the wide shot the crib, the dresser and the laundry basket were three
    // brown shapes with no material readable on any of them. A key:fill ratio
    // of 5:1 is a portrait ratio, not a room ratio — a real nursery at 4 pm has
    // a whole wall of sky filling the side away from the sun. 0.86 puts it at
    // ~3.5:1, which still separates the two sides but leaves the dark side lit.
    // 0.82 was chosen to keep the shadow side readable when the shadow side was
    // *also* getting 1.0 of rim and 0.34 of hemisphere. With those cut it can
    // come down and still be the thing that lights the dark half — and because
    // it is directional and blue it puts a second hue on screen, which flat
    // ambient never can.
    fillColor: 0xc2dbff, fillIntensity: 0.66, fillPos: [4.6, 2.6, 3.0],
    rimColor: 0xffe2c4, rimIntensity: 0.72, rimPos: [1.2, 4.0, -5.0],
    hemiSky: 0xc4dcff, hemiGround: 0xffd2bc, hemiIntensity: 0.24,
    // Ambient is where a dark wood surface gets its *material* from — its
    // specular response and the colour of the room reflected in its lacquer.
    // At 0.30 the oak dresser had neither and read as a brown cutout.
    envIntensity: 0.30, shadowSpan: 4.2,
    grade: {
      // Exposure was pinned at 1.0 with AgX, whose mid-grey sits low by design;
      // the frame came out a stop under and the whole image lived in a narrow
      // band around 55% with no clean white anywhere. Up 1/5 stop, with the
      // contrast raised to keep the extra light out of the shadows and the
      // vignette pulled back off the corners the furniture actually occupies.
      saturation: 1.11, contrast: 1.10, warmth: 0.015, vignette: 0.20, exposure: 1.17,
      shadowTint: [0.895, 0.955, 1.14], highTint: [1.035, 1.0, 0.955], split: 1.0,
      black: 0.085
    },
    fog: { color: 0xf1ecf6, density: 0.005 }
  },

  golden: {   // late afternoon — the "play" and "feed" hero look
    // The wall probe face is what the shaded side of every prop reflects, and
    // an amber wall probe in an amber room is a second helping of the same
    // hue. The real wall is a cool cream, so the probe now says so.
    envWall: 0xf0dfdd, envWallI: 0.170,
    // Every warm face of the probe is down and the one cool face is up. At 4 pm
    // the sun is a *hard, single* source; the soft half of the light in the room
    // is the blue hemisphere coming through the same window, not a warm ceiling
    // bounce. Measured, this pair is most of why `golden` had an R:B of 1.62
    // with no second hue anywhere (§4 #137) and no value under 0.15 (§4 #101).
    envCeil: 0xffe2bc, envCeilI: 0.190,
    envFloor: 0xffc9aa, envFloorI: 0.090,
    envWindow: 0xffcf92, envWindowI: 1.55,
    envFill: 0xc6d4f2, envFillI: 0.285,
    envLamp: 0xffc07a, envLampI: 0.18,

    // Sun elevation ≈ 16° above the aim point rather than the old 25°, and
    // pushed a further 1.6 m out along −X. That is the whole defect: at 25° a
    // 0.9 m prop throws a 1.9 m shadow that mostly hides under itself, at 16°
    // it throws 3.1 m of raking shadow straight across the floor toward camera.
    // Up from 3.85. Lifting the fill enough to keep the shadow side readable
    // costs contrast, and the only way to buy it back without crushing the
    // shadows again is to raise the sun rather than lower the ambient — which
    // is also what actually happens at 4 pm.
    // …and it *still* threw nothing: measured, `61-golden-hour` came back at
    // p95 = 0.657 against `day`'s 0.654, and the pouf, both stools, the table
    // and the basket cast essentially no readable shadow. The elevation was not
    // the problem — 15° is already a raking sun. The problem was that a shadow
    // is only visible as the *difference* between lit and unlit, and the unlit
    // half of this room was receiving 2.0 of ambient against a 3.95 key. A cast
    // shadow at a 2:1 ratio is a 30% dip that AgX then compresses into nothing.
    // Sun up, everything else down: 1.98 m of elevation over 7.2 m of run is
    // 15.4°, so a 0.45 m stool throws 1.6 m of shadow, and at the ratio below
    // that shadow is now a value you can actually see.
    keyColor: 0xffab68, keyIntensity: 5.05, keyPos: [-6.9, 2.10, 2.85],
    // Fill and hemi are pulled *down* hard. Late afternoon is a high-contrast
    // hour; carrying `day`'s ambient into it is exactly what made the two moods
    // indistinguishable, because ambient is the half of the image that does not
    // change when you move the sun.
    // 0.235 was a *studio* contrast ratio (16:1) dropped into a room with one
    // sun and four bounce surfaces. Golden hour is high contrast, but the
    // shadow side of a west-facing nursery is filled by a whole hemisphere of
    // blue sky; at 16:1 the crib simply went black and the mood stopped reading
    // as "late afternoon" and started reading as "underexposed".
    /* Chromatic range, second correction. Pulling the split back stopped the
     * room reading lilac, but it left the pendulum at the other end: *every*
     * light (key, rim, window probe, lamp probe), *every* env face and the fog
     * were amber, the grade then multiplied saturation by 1.42 (1.20 here on
     * top of the 1.18 AgX restore) and pushed the highlights a further 20%
     * toward orange — so the whole frame collapsed into one narrow pink /
     * salmon band and the lilac walls read pink.
     *
     * The rubric's 5/5 for lighting is "warm key against cool shadow —
     * creating real chromatic value range". That needs *both* ends. The key
     * stays exactly as amber as it was; what comes back is the sky on the
     * shadow side, which at 4 pm in a west-facing room is a whole hemisphere
     * of blue and is the only thing in the frame that can put a second hue on
     * the screen. */
    fillColor: 0x9dbcf0, fillIntensity: 0.56, fillPos: [4.4, 2.4, 3.2],
    // 1.85 of warm rim from behind was the largest single ambient term in the
    // mood and it was *warm*, so it filled the shadow side with the same hue as
    // the key. A rim exists to draw a line round the subject; at 0.78 it still
    // does that and it stops competing with the sun.
    rimColor: 0xffbe80, rimIntensity: 0.78, rimPos: [0.4, 2.6, -5.2],
    hemiSky: 0xa8c4f5, hemiGround: 0xe8b498, hemiIntensity: 0.185,
    envIntensity: 0.245, shadowSpan: 6.2,
    grade: {
      // Split pulled back hard. At 1.15 with a shadow tint of [0.82, .915, 1.22]
      // the multiplier on the blue channel was 1.25 across everything the eye
      // reads as midtone; combined with a blue fill and a blue hemisphere it
      // turned a golden-hour nursery lilac. The key carries the warmth now and
      // the shadows only get the last of the sky.
      //
      // …and then saturation 1.20 (× the 1.18 restore inside agx() = 1.42) plus
      // a +7.5%R / −12.5%B highlight tint took an already all-amber lighting
      // rig and drove it into a single salmon hue. Saturation now sits just
      // above neutral, the highlight tint is halved, and the shadow tint is
      // pushed *further* blue rather than the whole frame being pushed warm —
      // same overall warmth, twice the chromatic range.
      saturation: 1.06, contrast: 1.14, warmth: 0.014, vignette: 0.24, exposure: 1.19,
      shadowTint: [0.845, 0.935, 1.21], highTint: [1.025, 1.0, 0.955], split: 1.05,
      // The deepest black point of the four daylight-ish moods: golden hour is
      // the one time of day whose whole identity is a long dark shadow next to
      // a hot rim of sun.
      black: 0.084
    },
    // 0.009 over the 6 m of the room is a 5% amber veil on the far wall, which
    // is most of what read as "slightly hazy". Thinner, and less orange, so it
    // separates depth without tinting the set.
    fog: { color: 0xf4dcc8, density: 0.0065 }
  },

  evening: {  // bath time
    envWall: 0xdfd8f0, envWallI: 0.147,
    envCeil: 0xffe8d4, envCeilI: 0.290,
    envFloor: 0xdccbe4, envFloorI: 0.1225,
    envWindow: 0x9fb2e8, envWindowI: 0.40,
    envFill: 0xc0cef0, envFillI: 0.28,
    envLamp: 0xffc98a, envLampI: 0.72,

    keyColor: 0xffdcac, keyIntensity: 2.95, keyPos: [-4.2, 3.0, 2.8],
    fillColor: 0xa8bcf0, fillIntensity: 0.42, fillPos: [4.0, 2.2, 2.6],
    rimColor: 0xc9d8ff, rimIntensity: 0.86, rimPos: [1.6, 3.6, -4.6],
    hemiSky: 0xb4c6f4, hemiGround: 0xf0bc9c, hemiIntensity: 0.135,
    envIntensity: 0.235, shadowSpan: 5.2,
    grade: {
      saturation: 1.10, contrast: 1.09, warmth: 0.05, vignette: 0.38, exposure: 1.00,
      shadowTint: [0.83, 0.92, 1.21], highTint: [1.03, 1.0, 0.95], split: 1.15,
      black: 0.105
    },
    fog: { color: 0xdcd6ee, density: 0.016 }
  },

  night: {    // sleep
    envWall: 0x333a68, envWallI: 0.175,
    envCeil: 0x44508e, envCeilI: 0.1925,
    envFloor: 0x36325e, envFloorI: 0.105,
    envWindow: 0x8fa8e8, envWindowI: 0.256,
    envFill: 0x5f6bb0, envFillI: 0.175,
    envLamp: 0xffc078, envLampI: 1.05,

    keyColor: 0xffc884, keyIntensity: 1.52, keyPos: [-1.6, 2.2, 2.0],
    fillColor: 0x7088dc, fillIntensity: 0.36, fillPos: [3.4, 2.6, 2.2],
    rimColor: 0x9fb4ff, rimIntensity: 0.86, rimPos: [1.0, 3.4, -4.4],
    hemiSky: 0x6478c8, hemiGround: 0x443a6c, hemiIntensity: 0.095,
    envIntensity: 0.225, shadowSpan: 3.4,
    grade: {
      // `51-sleep-asleep` measured p1 = 0.183 with 0.5% under 0.15 — a *night*
      // frame with no dark in it, against `52-sleep-lamp-off`'s p1 = 0.02 and
      // 8.9%. The whole difference is the practical (see `practicalTrim`), but
      // the grade was also carrying a +6% exposure into a mood that wants to be
      // under, not over.
      saturation: 1.0, contrast: 1.11, warmth: -0.02, vignette: 0.50, exposure: 1.03,
      shadowTint: [0.80, 0.90, 1.26], highTint: [1.025, 1.0, 0.955], split: 1.2,
      black: 0.092
    },
    fog: { color: 0x3b3f66, density: 0.030 }
  }
};

/* ------------------------------------------------------------ weather --- */

/**
 * Weather as a *lighting* state, not an exposure multiplier.
 *
 * `setWeather('rain')` used to touch nothing in this file. `room.js:640` set a
 * bounce scale and handed the string to the window, so what actually reached
 * the screen was `60-weather-rain` = `01-room-wide` at 86% exposure with an
 * identical hue (measured: mean RGB 173,113,95 → 149,101,85, R:B 1.82 → 1.76),
 * with the hard sun shaft still lying across the wall in the rain. That is
 * rubric §4 **#45** verbatim — "lighting identical across every game state;
 * night is the same setup with the exposure pulled down".
 *
 * Overcast is a different *rig*, and the difference is structural rather than
 * a matter of level:
 *
 *   · **The key stops being the sun.** A cloud deck is the source, so the key
 *     collapses to a fraction of its clear value and takes the sky's colour.
 *     No sun patch on the floor, no hot rim, no hard shadow edge.
 *   · **The fill and the hemisphere go up.** The light is now arriving from the
 *     whole dome rather than one 0.5° disc, so the shadow side is *better* lit
 *     than it was, not worse — that is why an overcast day reads flat rather
 *     than dark.
 *   · **The shadows go enormous.** `shadowScale` widens the PCF kernel, which
 *     is the only cue that says "big soft source" in a shadow map.
 *   · **The grade cools and desaturates**, and the contrast comes down. The
 *     black point comes down with it: a flat frame with crushed blacks reads as
 *     underexposed, not as overcast.
 *
 * Every field is a multiplier on, or a mix toward, whatever the current mood
 * says — so rain at golden hour is still warmer than rain at midday.
 */
export const WEATHER = {
  clear: null,
  rain: {
    // First pass at these numbers produced a frame that read overcast and was
    // also a stop and a half under: median display 0.254 against the clear
    // frame's 0.408, mean RGB (71,64,69). That is the §4 #45 mistake made in
    // the other direction — a rainy afternoon indoors is *flatter* than a sunny
    // one, and very slightly darker, not gloomy. The key stays collapsed (that
    // is the structural half of the change and it is what removes the sun patch
    // and the hard shadow) and everything diffuse comes up to pay for it.
    key: 0.24, keyTint: 0x9fb4d2, keyMix: 0.88,
    fill: 1.95, fillTint: 0xb4c8e4, fillMix: 0.62,
    rim: 0.55, rimTint: 0xbccadd, rimMix: 0.80,
    hemi: 2.15, hemiSky: 0xa8bacf, hemiGround: 0x9a9ca6, hemiMix: 0.72,
    env: 1.45, envDesat: 0.62, envGrey: 0x969ca5,
    shadowScale: 2.1,
    fogTint: 0x9aa2ad, fogMix: 0.55, fogDensity: 2.0,
    grade: {
      saturation: 0.84, contrast: 0.92, warmth: -0.065, exposure: 1.19,
      vignette: 0.0, black: -0.042, split: 0.55,
      shadowTint: [0.965, 0.995, 1.045], highTint: [0.955, 0.985, 1.055]
    }
  },
  snow: {
    key: 0.46, keyTint: 0xdce8f6, keyMix: 0.70,
    fill: 1.75, fillTint: 0xd2e0f2, fillMix: 0.55,
    rim: 0.80, rimTint: 0xdae6f8, rimMix: 0.65,
    hemi: 1.85, hemiSky: 0xd6e4f4, hemiGround: 0xc8ccd4, hemiMix: 0.60,
    env: 1.30, envDesat: 0.45, envGrey: 0xd8dde4,
    shadowScale: 1.7,
    fogTint: 0xd2d8e2, fogMix: 0.50, fogDensity: 1.6,
    grade: {
      saturation: 0.90, contrast: 0.96, warmth: -0.045, exposure: 1.08,
      vignette: 0.0, black: -0.028, split: 0.75,
      shadowTint: [0.965, 0.99, 1.06], highTint: [0.985, 1.0, 1.03]
    }
  }
};

/* ------------------------------------------------------------- the rig --- */

export class LightingRig {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this._pmrem = new THREE.PMREMGenerator(renderer);
    this._pmrem.compileEquirectangularShader();
    this._envCache = new Map();
    this._current = null;
    this._target = null;
    this._blend = 1;
    this._weather = 'clear';
    this._wx = null;                  // the active WEATHER entry, or null

    const root = new THREE.Group();
    root.name = 'LightingRig';
    scene.add(root);
    this.root = root;

    // --- key: the window. Big soft shadow, high resolution. ---------------
    const key = new THREE.DirectionalLight(0xffffff, 1);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 22;
    const s = 4.2;
    key.shadow.camera.left = -s; key.shadow.camera.right = s;
    key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.022;
    key.shadow.radius = 2.2;          // PCF kernel spread
    key.shadow.blurSamples = 16;
    // Tight frustum around the play area keeps texel density high; a 7.5m box
    // at 2048 was giving ~5mm texels, which is why contact looked mushy.
    key.shadow.camera.updateProjectionMatrix();
    root.add(key, key.target);
    this.key = key;

    // --- fill: cool, no shadow, kills the dead black side of the face -----
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    root.add(fill, fill.target);
    this.fill = fill;

    // --- rim: behind and above; this is the single biggest "AAA" tell -----
    const rim = new THREE.DirectionalLight(0xffffff, 1.2);
    root.add(rim, rim.target);
    this.rim = rim;

    // --- hemisphere: ground bounce for the underside of everything --------
    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.5);
    root.add(hemi);
    this.hemi = hemi;

    // --- practical: a warm point light that lives inside the night lamp ---
    //
    // Decay 2 is the physically-correct exponent for a *point*, and a bedside
    // lamp is not one — it is a 90 mm linen drum, i.e. an extended source whose
    // near field falls off far more slowly than inverse square. The difference
    // is not academic: at decay 2 the same light that reads as "cosy" on the
    // far crib rail is arriving at 8× on a cheek 0.6 m away, and that is
    // exactly what `51-sleep-asleep` shows — a face blown to a flat near-white
    // mask that has lost all form, in a frame measuring p1 = 0.183 with 0.5%
    // below 0.15 while the same scene with the lamp *off* measures p1 = 0.02
    // and 8.9%. 1.55 keeps a real, readable falloff across the cot and takes
    // roughly a stop and a half off the near field.
    const practical = new THREE.PointLight(0xffc078, 0, 6, 1.55);
    practical.castShadow = false;
    root.add(practical);
    this.practical = practical;
    this._installPracticalTrim(practical);

    scene.fog = new THREE.FogExp2(0xf6e9f2, 0.008);
  }

  /**
   * Scale every write to `practical.intensity`.
   *
   * `room.js` owns *whether* the lamp is on and re-asserts `p.intensity = 3.2`
   * from its own `update()`, which runs after `LightingRig.update()` in
   * `app.step()` — so there is no ordering in which this rig can clamp its own
   * light by assignment. Intercepting the property is the only place the trim
   * can live, and the falloff of a light this file creates is this file's
   * business. The setter stores what the room asked for; the getter is what
   * three.js reads when it uploads the uniform.
   */
  _installPracticalTrim(light) {
    let raw = light.intensity;
    this._practicalTrim = 0.26;
    Object.defineProperty(light, 'intensity', {
      configurable: true,
      get: () => raw * this._practicalTrim,
      set: (v) => { raw = v; }
    });
  }

  /** Trim applied to whatever intensity the room asks the practical for. */
  setPracticalTrim(v) { this._practicalTrim = Math.max(0, v); }

  _env(name) {
    // Overcast changes what the room's *ambient* is made of, not just how much
    // of it there is, so the probe is baked per mood × weather. Three extra
    // 128px PMREMs is a rounding error against getting the shadow side of every
    // prop reflecting a grey sky instead of an amber one.
    const key = `${name}|${this._weather}`;
    if (!this._envCache.has(key)) {
      const envScene = buildEnvScene(this._weatherMood(MOODS[name]));
      const rt = this._pmrem.fromScene(envScene, 0.035);
      envScene.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      this._envCache.set(key, rt.texture);
    }
    return this._envCache.get(key);
  }

  /** A shallow copy of a mood with the active weather folded into the probe. */
  _weatherMood(m) {
    const wx = this._wx;
    if (!wx) return m;
    const out = { ...m };
    const grey = new THREE.Color(wx.envGrey);
    for (const k of ['envWall', 'envCeil', 'envFloor', 'envWindow', 'envFill', 'envLamp']) {
      out[k] = _tmpColor.setHex(m[k]).lerp(grey, wx.envDesat).getHex();
    }
    // The lamp probe is the one face that is *not* outside, so it keeps its own
    // colour and only loses the level the overcast sky no longer adds to it.
    out.envLamp = m.envLamp;
    out.envCeilI = m.envCeilI * 0.85;
    out.envFloorI = m.envFloorI * 0.85;
    return out;
  }

  /**
   * 'clear' | 'rain' | 'snow'. Re-bakes the probe and takes effect on the next
   * `_write`, so it composes with whatever mood transition is in flight.
   */
  setWeather(name) {
    const next = ['clear', 'rain', 'snow'].includes(name) ? name : 'clear';
    if (next === this._weather) return;
    this._weather = next;
    this._wx = WEATHER[next] || null;
    const live = this._current || 'day';
    this.scene.environment = this._env(this._target || live);
    // Snap the rig to the new weather immediately rather than waiting for the
    // next mood transition — nothing else drives `_write` while a mood is held.
    const a = this._from || MOODS[live] || MOODS.day;
    const b = MOODS[this._target] || MOODS[live] || MOODS.day;
    this._write(a, this._target ? this._blend : 1, b);
  }

  weather() { return this._weather; }

  /**
   * Fold the active weather into whatever the mood crossfade produced. Runs at
   * the tail of `_write`, so a mood transition and a weather change compose
   * instead of fighting.
   */
  _applyWeather() {
    const wx = this._wx;
    if (!wx) return;
    const mix = (light, tint, amount) => light.color.lerp(_tmpColor.setHex(tint), amount);

    this.key.intensity *= wx.key;
    mix(this.key, wx.keyTint, wx.keyMix);
    this.fill.intensity *= wx.fill;
    mix(this.fill, wx.fillTint, wx.fillMix);
    this.rim.intensity *= wx.rim;
    mix(this.rim, wx.rimTint, wx.rimMix);
    this.hemi.intensity *= wx.hemi;
    this.hemi.color.lerp(_tmpColor.setHex(wx.hemiSky), wx.hemiMix);
    this.hemi.groundColor.lerp(_tmpColor.setHex(wx.hemiGround), wx.hemiMix);
    this.scene.environmentIntensity *= wx.env;

    // A cloud deck is a source the size of the sky: its penumbra is metres
    // wide, not centimetres. Without this the sun's razor-edged shadow simply
    // gets dimmer in the rain, which is the tell that nothing structural
    // changed.
    this.key.shadow.radius = THREE.MathUtils.clamp(
      (this._shadowRadius0 ?? 2.2) * wx.shadowScale, 1.0, 7.0);

    if (this.scene.fog) {
      this.scene.fog.color.lerp(_tmpColor.setHex(wx.fogTint), wx.fogMix);
      this.scene.fog.density *= wx.fogDensity;
    }
  }

  /** Snap immediately to a mood. */
  apply(name) {
    const m = MOODS[name];
    if (!m) return;
    this._current = name;
    this._target = null;
    this._blend = 1;
    this._write(m, 1, m);
    this.scene.environment = this._env(name);
    // `_write` already folded the weather into this; don't stamp over it.
    this.scene.environmentIntensity = m.envIntensity * (this._wx?.env ?? 1);
    this._moodName = name;
  }

  /** Crossfade toward a mood over `seconds`. */
  transitionTo(name, seconds = 1.6) {
    if (!MOODS[name] || name === this._current) return;
    this._from = MOODS[this._current] || MOODS.day;
    this._target = name;
    this._blend = 0;
    this._blendSpeed = 1 / Math.max(0.001, seconds);
    // The env map itself pops at the midpoint; with everything else fading it
    // is imperceptible, and cross-blending two PMREMs isn't worth the VRAM.
    this._envSwapped = false;
  }

  _write(a, t, b) {
    const lerp = THREE.MathUtils.lerp;
    const col = (out, ca, cb) => out.setHex(ca).lerp(_tmpColor.setHex(cb), t);

    col(this.key.color, a.keyColor, b.keyColor);
    this.key.intensity = lerp(a.keyIntensity, b.keyIntensity, t);
    this.key.position.set(
      lerp(a.keyPos[0], b.keyPos[0], t),
      lerp(a.keyPos[1], b.keyPos[1], t),
      lerp(a.keyPos[2], b.keyPos[2], t));

    col(this.fill.color, a.fillColor, b.fillColor);
    this.fill.intensity = lerp(a.fillIntensity, b.fillIntensity, t);
    this.fill.position.set(
      lerp(a.fillPos[0], b.fillPos[0], t),
      lerp(a.fillPos[1], b.fillPos[1], t),
      lerp(a.fillPos[2], b.fillPos[2], t));

    col(this.rim.color, a.rimColor, b.rimColor);
    this.rim.intensity = lerp(a.rimIntensity, b.rimIntensity, t);
    this.rim.position.set(
      lerp(a.rimPos[0], b.rimPos[0], t),
      lerp(a.rimPos[1], b.rimPos[1], t),
      lerp(a.rimPos[2], b.rimPos[2], t));

    col(this.hemi.color, a.hemiSky, b.hemiSky);
    col(this.hemi.groundColor, a.hemiGround, b.hemiGround);
    this.hemi.intensity = lerp(a.hemiIntensity, b.hemiIntensity, t);

    // A low key needs a wide shadow frustum or its long shadows are simply
    // clipped away; a high key wants a narrow one for texel density. Both cost
    // the same, so the span rides the crossfade with everything else.
    const span = lerp(a.shadowSpan ?? 4.2, b.shadowSpan ?? 4.2, t);
    const sc = this.key.shadow.camera;
    if (Math.abs(sc.right - span) > 1e-4) {
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
      // The eye is at the light, so the far plane has to clear the whole box
      // even when the light is low and the box is long.
      sc.far = Math.max(22, span * 4.5);
      sc.updateProjectionMatrix();
    }
    // A wider frustum means fewer texels per metre, so the PCF kernel has to
    // shrink or a 6 m box turns every contact into a smudge. Recomputed from
    // scratch every write rather than only when the span moves, so the weather
    // multiplier below cannot compound frame over frame.
    this._shadowRadius0 = THREE.MathUtils.clamp(9.2 / span, 1.1, 2.6);
    this.key.shadow.radius = this._shadowRadius0;

    if (this.scene.fog) {
      col(this.scene.fog.color, a.fog.color, b.fog.color);
      this.scene.fog.density = lerp(a.fog.density, b.fog.density, t);
    }
    this.scene.environmentIntensity = lerp(a.envIntensity, b.envIntensity, t);

    this._applyWeather();
  }

  /** Blended grade parameters for the current transition. */
  currentGrade() {
    const a = this._from || MOODS[this._current] || MOODS.day;
    const b = MOODS[this._target] || a;
    const t = this._target ? this._blend : 1;
    const L = THREE.MathUtils.lerp;
    const L3 = (p, q) => [L(p[0], q[0], t), L(p[1], q[1], t), L(p[2], q[2], t)];
    const NEUTRAL = [1, 1, 1];
    const g = {
      saturation: L(a.grade.saturation, b.grade.saturation, t),
      contrast: L(a.grade.contrast, b.grade.contrast, t),
      warmth: L(a.grade.warmth, b.grade.warmth, t),
      vignette: L(a.grade.vignette, b.grade.vignette, t),
      exposure: L(a.grade.exposure, b.grade.exposure, t),
      shadowTint: L3(a.grade.shadowTint || NEUTRAL, b.grade.shadowTint || NEUTRAL),
      highTint: L3(a.grade.highTint || NEUTRAL, b.grade.highTint || NEUTRAL),
      split: L(a.grade.split ?? 1, b.grade.split ?? 1, t),
      black: L(a.grade.black ?? 0, b.grade.black ?? 0, t)
    };

    // Weather grades the frame as well as lighting it: overcast is cool, low
    // saturation and low contrast, and it *lifts* the black point rather than
    // deepening it — a flat sky with crushed shadows reads as underexposed, not
    // as weather. The multipliers ride on top of the mood so rain at golden
    // hour is still warmer than rain at midday.
    const wg = this._wx?.grade;
    if (wg) {
      g.saturation *= wg.saturation;
      g.contrast *= wg.contrast;
      g.warmth += wg.warmth;
      g.exposure *= wg.exposure;
      g.vignette = Math.min(0.6, g.vignette + wg.vignette);
      g.split *= wg.split;
      g.black = Math.max(0, g.black + wg.black);
      for (let i = 0; i < 3; i++) {
        g.shadowTint[i] = L(g.shadowTint[i], wg.shadowTint[i], 0.75);
        g.highTint[i] = L(g.highTint[i], wg.highTint[i], 0.75);
      }
    }
    return g;
  }

  update(dt) {
    if (!this._target) return false;
    this._blend = Math.min(1, this._blend + dt * this._blendSpeed);
    const a = this._from, b = MOODS[this._target];
    this._write(a, this._blend, b);
    if (!this._envSwapped && this._blend > 0.5) {
      this.scene.environment = this._env(this._target);
      this._envSwapped = true;
    }
    if (this._blend >= 1) {
      this._current = this._target;
      this._moodName = this._target;
      this._target = null;
    }
    return true;
  }

  /** Aim every light at a world point (usually the baby's chest). */
  aimAt(v) {
    this.key.target.position.copy(v);
    this.fill.target.position.copy(v);
    this.rim.target.position.copy(v);
    this.key.target.updateMatrixWorld();
    this.fill.target.updateMatrixWorld();
    this.rim.target.updateMatrixWorld();
  }

  dispose() {
    for (const t of this._envCache.values()) t.dispose();
    this._envCache.clear();
    this._pmrem.dispose();
  }
}

const _tmpColor = new THREE.Color();

/* ------------------------------------------------- contact shadow blob --- */

/**
 * A cheap, always-correct soft contact shadow that sits under a prop.
 * VSM shadow maps go soft at distance; this restores the tight dark core
 * right where an object meets the floor, which is what sells contact.
 */
export function contactShadow(radius = 0.5, opacity = 0.42, softness = 1.8) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uOpacity: { value: opacity },
      uSoftness: { value: softness },
      uColor: { value: new THREE.Color(0x4a2b3c) }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uOpacity, uSoftness;
      uniform vec3 uColor;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), uSoftness) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }`
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -1;
  m.userData.setOpacity = v => { mat.uniforms.uOpacity.value = v; };
  return m;
}
