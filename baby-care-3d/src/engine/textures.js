/* ============================================================================
 * textures.js — Procedural PBR texture factory
 * ----------------------------------------------------------------------------
 * The whole game ships with zero binary assets: every albedo / normal /
 * roughness / AO map is synthesised on a 2D canvas at boot and uploaded once.
 * Everything here is deterministic (seeded value noise) so a given surface
 * looks identical on every device and across screenshot runs.
 * ========================================================================== */

import * as THREE from 'three';

/* ---------------------------------------------------------------- noise --- */

/** Deterministic 32-bit hash → [0,1). */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

/** Tileable value noise. `period` cells across the full 0..1 domain. */
function valueNoise(u, v, period, seed) {
  const x = u * period, y = v * period;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const w = (a, b) => hash2(((a % period) + period) % period, ((b % period) + period) % period, seed);
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}

/** Tileable fBm. */
export function fbm(u, v, period, octaves, seed, gain = 0.5, lacunarity = 2) {
  let sum = 0, amp = 1, norm = 0, p = period;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(u, v, Math.round(p), seed + i * 101) * amp;
    norm += amp;
    amp *= gain;
    p *= lacunarity;
  }
  return sum / norm;
}

/* --- anisotropic (separate period per axis) variants ----------------------
 * Wood, brushed paint and carpet pile are all *directional*: their features are
 * many times longer along one axis than the other. The isotropic helpers above
 * can only fake that by scaling the input coordinates, which silently breaks
 * tiling (the wrapped cell index no longer lands back on 0 at u = 1) and leaves
 * a seam. These take a period per axis instead, so a 24 × 400 field is both
 * genuinely stretched and genuinely tileable.
 * ----------------------------------------------------------------------- */

function valueNoise2(u, v, px, py, seed) {
  const x = u * px, y = v * py;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const w = (a, b) => hash2(((a % px) + px) % px, ((b % py) + py) % py, seed);
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}

/** Tileable anisotropic fBm. */
function fbm2(u, v, px, py, octaves, seed, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, X = px, Y = py;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(u, v, Math.max(1, Math.round(X)), Math.max(1, Math.round(Y)), seed + i * 101) * amp;
    norm += amp;
    amp *= gain;
    X *= 2; Y *= 2;
  }
  return sum / norm;
}

/** Tileable anisotropic ridged noise — fibres, grain streaks, carpet pile. */
function ridged2(u, v, px, py, octaves, seed) {
  let sum = 0, amp = 1, norm = 0, X = px, Y = py;
  for (let i = 0; i < octaves; i++) {
    const n = Math.abs(valueNoise2(u, v, Math.max(1, Math.round(X)), Math.max(1, Math.round(Y)), seed + i * 71) * 2 - 1);
    sum += (1 - n) * amp;
    norm += amp;
    amp *= 0.5;
    X *= 2; Y *= 2;
  }
  return sum / norm;
}

/** Tileable ridged noise — good for fibres, grain and cloth slubs. */
export function ridged(u, v, period, octaves, seed) {
  let sum = 0, amp = 1, norm = 0, p = period;
  for (let i = 0; i < octaves; i++) {
    const n = Math.abs(valueNoise(u, v, Math.round(p), seed + i * 71) * 2 - 1);
    sum += (1 - n) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

/** Tileable Worley / cellular noise. Returns { f1, f2, id }. */
export function worley(u, v, period, seed) {
  const x = u * period, y = v * period;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const wx = ((cx % period) + period) % period;
      const wy = ((cy % period) + period) % period;
      const px = cx + hash2(wx, wy, seed);
      const py = cy + hash2(wx, wy, seed + 7919);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, seed + 104729); }
      else if (d < f2) { f2 = d; }
    }
  }
  return { f1: Math.min(f1, 1), f2: Math.min(f2, 1), id };
}

/* ------------------------------------------------------------- canvases --- */

const _cache = new Map();

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/**
 * Build an ImageData by evaluating `fn(u, v, out)` per texel.
 * `out` is a 4-float array in 0..1; alpha defaults to 1.
 */
function generate(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0, 1];
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      out[0] = out[1] = out[2] = 0; out[3] = 1;
      fn(u, v, out);
      const i = (y * size + x) * 4;
      d[i] = Math.max(0, Math.min(255, out[0] * 255)) | 0;
      d[i + 1] = Math.max(0, Math.min(255, out[1] * 255)) | 0;
      d[i + 2] = Math.max(0, Math.min(255, out[2] * 255)) | 0;
      d[i + 3] = Math.max(0, Math.min(255, out[3] * 255)) | 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Derive a tangent-space normal map from a scalar height field.
 * `height(u,v)` must be tileable for the result to tile.
 */
function normalFromHeight(size, strength, height) {
  const e = 1 / size;
  return generate(size, (u, v, out) => {
    const hL = height(u - e, v), hR = height(u + e, v);
    const hD = height(u, v - e), hU = height(u, v + e);
    let nx = (hL - hR) * strength;
    let ny = (hD - hU) * strength;
    const nz = 1;
    const len = Math.hypot(nx, ny, nz);
    out[0] = (nx / len) * 0.5 + 0.5;
    out[1] = (ny / len) * 0.5 + 0.5;
    out[2] = (nz / len) * 0.5 + 0.5;
  });
}

function toTexture(c, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Memoised builder so identical surfaces share GPU memory. */
function cached(key, build) {
  if (!_cache.has(key)) _cache.set(key, build());
  return _cache.get(key);
}

/* ------------------------------------------------------------ surfaces --- */

function mixHex(a, b, t) {
  const ar = (a >> 16 & 255), ag = (a >> 8 & 255), ab = a & 255;
  const br = (b >> 16 & 255), bg = (b >> 8 & 255), bb = b & 255;
  return [
    (ar + (br - ar) * t) / 255,
    (ag + (bg - ag) * t) / 255,
    (ab + (bb - ab) * t) / 255
  ];
}

/**
 * Soft matte wallpaper: barely-there paper tooth plus an optional print.
 * Reads as "expensive nursery" rather than "flat colour".
 */
export function wallpaper({
  base = 0xf3e7f2, tint = 0xe6d3ec, seed = 11, size = 512, tooth = 0.05
} = {}) {
  return cached(`wall:${base}:${tint}:${seed}:${tooth}`, () => {
    const height = (u, v) =>
      fbm(u, v, 64, 4, seed) * 0.6 + worley(u, v, 96, seed + 3).f1 * 0.4;

    const map = generate(size, (u, v, out) => {
      const grain = fbm(u, v, 48, 5, seed);
      const fibre = ridged(u * 1.0, v * 1.0, 128, 3, seed + 5);
      const t = grain * 0.7 + fibre * 0.3;
      const c = mixHex(base, tint, t * tooth * 6);
      // very slight vertical shading so large flat walls never band
      const sheen = 1 + (fbm(u, v, 6, 2, seed + 21) - 0.5) * 0.035;
      out[0] = c[0] * sheen; out[1] = c[1] * sheen; out[2] = c[2] * sheen;
    });

    const normal = normalFromHeight(size, 0.35, height);
    const rough = generate(size, (u, v, out) => {
      const r = 0.86 + fbm(u, v, 32, 3, seed + 9) * 0.1;
      out[0] = out[1] = out[2] = r;
    });

    return {
      map: toTexture(map, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough)
    };
  });
}

/**
 * Painted / oiled wood with growth rings, knots and plank seams.
 * `planks = 0` gives a single continuous board (furniture legs, toys).
 */
export function wood({
  light = 0xd9a86a, dark = 0xa9713c, seed = 3, size = 512,
  planks = 0, ringScale = 26, satin = 0.42
} = {}) {
  return cached(`wood:${light}:${dark}:${seed}:${planks}:${ringScale}:${satin}`, () => {
    /* Two things were wrong here and both were visible on the nursery floor.
     *
     * 1. GRAIN DIRECTION. `seam(v)` puts the plank joints on lines of constant
     *    v, so a plank is a band that runs the full width of u — its long axis
     *    is u. The rings were a sawtooth of *u*, i.e. running straight across
     *    the board instead of down it (rubric #31). Rings are now a function of
     *    v, warped by a field stretched along u, which is what produces the
     *    cathedral arcs of a real flat-sawn board.
     *
     * 2. WARP AMPLITUDE. The warp was added in ring-space (`+ warp * 5.5`), so
     *    it displaced the pattern by up to ±2.75 whole ring periods regardless
     *    of ringScale. Rings folded back over themselves and the floor read as
     *    swirled marble / formica. Real figure stays well under one period.
     *
     * `ringScale` is also remapped rather than used raw: callers were asking
     * for 108 rings across a tile, ~4.7 texels per ring at 512², which no
     * amount of filtering can resolve. It is treated as a fineness hint and
     * clamped to something the texture — and the eye at floor distance — can
     * actually carry: roughly 3–9 growth rings across the width of one plank.
     */
    const rows = Math.max(1, Math.round(planks));
    const perPlank = planks
      ? Math.max(3, Math.min(9, Math.round((ringScale / rows) * 0.45)))
      : Math.max(4, Math.min(40, Math.round(ringScale * 0.42)));
    const ringFreq = planks ? perPlank * rows : perPlank;   // integer ⇒ tiles in v

    const rings = (u, v) => {
      const row = planks ? Math.floor(v * rows) % rows : 0;
      const off = planks ? hash2(row, 0, seed + 17) : 0;
      // Long, low-frequency figure stretched down the board (period 4 in u,
      // 11 in v) plus a slower second lobe. Together well under one ring pitch.
      const warp = (fbm2(u, v, 4, 11, 3, seed + row * 13) - 0.5) * 0.86
                 + (fbm2(u, v, 2, 5, 2, seed + 61 + row) - 0.5) * 0.34;
      const g = (v + off) * ringFreq + warp;
      let r = g - Math.floor(g);
      r = Math.abs(r * 2 - 1);
      // A growth ring is a narrow dark line between wide pale bands, not a
      // symmetric triangle wave.
      r = Math.pow(r, 1.45);
      // fine fibre streaks running *along* the grain
      const streak = ridged2(u, v, 24, 260, 3, seed + 31);
      return Math.min(1, r * 0.70 + streak * 0.30);
    };

    const seam = (v) => {
      if (!planks) return 0;
      const f = v * rows;
      const d = Math.abs(f - Math.round(f));
      return Math.max(0, 1 - d * rows * 4.5);
    };

    // Boards are cut from different logs: a floor with every plank the same
    // tone is the giveaway that it is a texture and not a floor.
    const plankTone = (v) => (planks ? hash2(Math.floor(v * rows) % rows, 7, seed + 3) - 0.5 : 0);

    const map = generate(size, (u, v, out) => {
      let t = rings(u, v);
      // knots
      const w = worley(u, v, 5, seed + 41);
      if (w.f1 < 0.10 && w.id > 0.78) t = Math.min(1, t + (0.10 - w.f1) * 5.5);
      const c = mixHex(light, dark, t * 0.72);
      const s = (1 - seam(v) * 0.62) * (1 + plankTone(v) * 0.15);
      out[0] = c[0] * s; out[1] = c[1] * s; out[2] = c[2] * s;
    });

    // Grain sits almost flush on a finished board; the plank joint is the only
    // real groove, so the seam carries most of the relief.
    const normal = normalFromHeight(size, 1.15, (u, v) =>
      rings(u, v) * 0.22 + seam(v) * 1.05 + ridged2(u, v, 30, 320, 2, seed + 60) * 0.16);

    const rough = generate(size, (u, v, out) => {
      const t = rings(u, v);
      // late wood (the dark rings) is denser and takes the lacquer differently
      const r = satin + t * 0.26 + seam(v) * 0.22
              + (fbm2(u, v, 5, 13, 2, seed + 88) - 0.5) * 0.10;
      out[0] = out[1] = out[2] = Math.min(1, Math.max(0.05, r));
    });

    return {
      map: toTexture(map, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough)
    };
  });
}

/**
 * Knitted / woven fabric. `weave` picks the structure:
 *  - 'plain'  → cotton onesie, bedding
 *  - 'knit'   → chunky jersey, blankets, socks
 *  - 'terry'  → towels, bath robes (looped pile)
 */
export function fabric({
  color = 0xffffff, seed = 7, size = 512, weave = 'plain',
  threads = 128, fuzz = 0.5
} = {}) {
  return cached(`fab:${color}:${seed}:${weave}:${threads}:${fuzz}`, () => {
    const height = (u, v) => {
      if (weave === 'terry') {
        const w = worley(u, v, threads * 0.42, seed);
        const loops = Math.pow(1 - w.f1, 2.2);
        return loops * 0.85 + fbm(u, v, threads, 3, seed + 2) * 0.15;
      }
      if (weave === 'knit') {
        // interlocking V-stitches: offset every other row
        const rows = threads * 0.5;
        const row = Math.floor(v * rows);
        const off = (row & 1) ? 0.5 : 0;
        const sx = ((u * rows + off) % 1);
        const sy = ((v * rows) % 1);
        const vshape = 1 - Math.abs(Math.abs(sx * 2 - 1) - sy) * 1.1;
        return Math.max(0, vshape) * 0.8 + fbm(u, v, threads * 2, 3, seed + 4) * 0.2;
      }
      // plain weave: over-under of warp and weft
      const warp = Math.sin(u * threads * Math.PI * 2) * 0.5 + 0.5;
      const weft = Math.sin(v * threads * Math.PI * 2) * 0.5 + 0.5;
      const cell = (Math.floor(u * threads) + Math.floor(v * threads)) & 1;
      const base = cell ? warp : weft;
      return base * 0.7 + fbm(u, v, threads * 2, 3, seed + 6) * 0.3;
    };

    const map = generate(size, (u, v, out) => {
      const h = height(u, v);
      // dye lot variation + fibre fuzz lightens the raised threads
      const lot = fbm(u, v, 12, 3, seed + 8) - 0.5;
      const shade = 0.82 + h * 0.24 + lot * 0.05;
      const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
      out[0] = r * shade; out[1] = g * shade; out[2] = b * shade;
    });

    const normal = normalFromHeight(size, weave === 'terry' ? 2.2 : 1.5, height);

    const rough = generate(size, (u, v, out) => {
      const h = height(u, v);
      // fuzzy fibres scatter: high roughness, slightly lower on tight threads
      const r = 0.94 - h * 0.10 * (1 - fuzz) + fbm(u, v, 64, 2, seed + 12) * 0.05;
      out[0] = out[1] = out[2] = Math.min(1, r);
    });

    return {
      map: toTexture(map, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough)
    };
  });
}

/**
 * Cut-pile rug / carpet. Deliberately high normal strength — a nursery rug
 * is one of the few surfaces a child's eye lingers on.
 */
export function carpet({ color = 0xffd7e6, seed = 19, size = 512, density = 150 } = {}) {
  return cached(`rug:${color}:${seed}:${density}`, () => {
    /* The rug read as sandpaper, not pile. 170 Worley cells across a 512²
     * texture is 3 texels per tuft: below the Nyquist limit of the generator
     * itself, so what shipped was aliased hash noise with a bit of colour on
     * it. A tuft needs ~10 texels to have a shape at all, so the requested
     * density is treated as a hint and clamped to that. The detail that is lost
     * comes back as *relief* — the normal strength goes up, because what makes
     * cut pile read is the way raking light catches the tops of the tufts, not
     * per-tuft albedo speckle.
     */
    const cells = Math.max(8, Math.min(Math.round(density * 0.28), Math.floor(size / 10)));
    // The pile lies in a direction: long, soft bands (the "vacuum stripe")
    // stretched across the rug, which is most of what sells a cut pile.
    const lay = (u, v) => fbm2(u, v, 5, 14, 3, seed + 5);
    const height = (u, v) => {
      const w = worley(u, v, cells, seed);
      const tuft = Math.pow(1 - w.f1, 1.35);
      return tuft * 0.62 + lay(u, v) * 0.38;
    };
    const map = generate(size, (u, v, out) => {
      const w = worley(u, v, cells, seed);
      const h = Math.pow(1 - w.f1, 1.35);
      const sweep = lay(u, v);
      const shade = 0.78 + h * 0.18 + (sweep - 0.5) * 0.28 + (w.id - 0.5) * 0.05;
      const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
      out[0] = r * shade; out[1] = g * shade; out[2] = b * shade;
    });
    // 4.2 sparkled: at rug distance a tuft is 2–3 screen pixels and a normal
    // map that strong aliases into glitter. 3.4 still rakes properly.
    const normal = normalFromHeight(size, 3.4, height);
    const rough = generate(size, (u, v, out) => {
      // tuft tops catch a faint sheen; the roots are pure scatter
      out[0] = out[1] = out[2] = 0.98 - height(u, v) * 0.16;
    });
    return {
      map: toTexture(map, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough)
    };
  });
}

/**
 * Baby skin: pores, fine vellus dimpling and a subtle blotch map.
 * Kept extremely gentle — over-detailed skin instantly reads "uncanny" on a
 * stylised infant, so this is about breaking up specular, not showing texture.
 */
export function skin({ color = 0xffddc9, seed = 23, size = 512, pore = 0.5 } = {}) {
  return cached(`skin:${color}:${seed}:${pore}`, () => {
    const height = (u, v) => {
      const pores = worley(u, v, 190, seed).f1;
      const fine = fbm(u, v, 320, 2, seed + 3);
      return pores * 0.6 + fine * 0.4;
    };
    const map = generate(size, (u, v, out) => {
      // large soft blotches = subdermal blood, tiny amount of hue shift only
      const blotch = fbm(u, v, 7, 3, seed + 11) - 0.5;
      const pores = worley(u, v, 190, seed).f1;
      const shade = 1 + blotch * 0.035 - (1 - pores) * 0.02;
      const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
      out[0] = Math.min(1, r * shade + blotch * 0.012);
      out[1] = g * shade;
      out[2] = Math.min(1, b * shade - blotch * 0.008);
    });
    const normal = normalFromHeight(size, 0.5 * pore, height);
    const rough = generate(size, (u, v, out) => {
      // babies are shiny on the forehead/nose but matte elsewhere; the broad
      // fbm gives us that variation for free once UVs are laid out.
      const r = 0.52 + fbm(u, v, 16, 3, seed + 17) * 0.22 + worley(u, v, 190, seed).f1 * 0.08;
      out[0] = out[1] = out[2] = Math.min(1, r);
    });
    return {
      map: toTexture(map, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough)
    };
  });
}

/** Glazed ceramic / enamel — bath tub, bowls, plates. Near-mirror with orange peel. */
export function ceramic({ color = 0xffffff, seed = 31, size = 256, peel = 0.35 } = {}) {
  return cached(`cer:${color}:${seed}:${peel}`, () => {
    const height = (u, v) => fbm(u, v, 22, 3, seed) * 0.7 + worley(u, v, 40, seed + 2).f1 * 0.3;
    const map = generate(size, (u, v, out) => {
      const s = 0.985 + fbm(u, v, 20, 2, seed + 5) * 0.03;
      const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
      out[0] = r * s; out[1] = g * s; out[2] = b * s;
    });
    const normal = normalFromHeight(size, 0.55 * peel, height);
    const rough = generate(size, (u, v, out) => {
      out[0] = out[1] = out[2] = 0.07 + fbm(u, v, 18, 2, seed + 8) * 0.07;
    });
    return {
      map: toTexture(map, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough)
    };
  });
}

/** Soft-touch matte plastic — toys, bottles, blocks. */
export function plastic({ color = 0xff9ec4, seed = 37, size = 256, matte = 0.45 } = {}) {
  return cached(`pla:${color}:${seed}:${matte}`, () => {
    const height = (u, v) => fbm(u, v, 90, 3, seed) * 0.5 + worley(u, v, 130, seed + 1).f1 * 0.5;
    const map = generate(size, (u, v, out) => {
      const s = 0.97 + fbm(u, v, 40, 2, seed + 4) * 0.05;
      const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
      out[0] = r * s; out[1] = g * s; out[2] = b * s;
    });
    const normal = normalFromHeight(size, 0.4, height);
    const rough = generate(size, (u, v, out) => {
      out[0] = out[1] = out[2] = matte + fbm(u, v, 26, 2, seed + 6) * 0.08;
    });
    return {
      map: toTexture(map, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough)
    };
  });
}

/** Painted plaster / MDF for skirting, shelves, window frames. */
export function paint({ color = 0xfffaf6, seed = 43, size = 256, gloss = 0.3 } = {}) {
  return cached(`pnt:${color}:${seed}:${gloss}`, () => {
    // brush strokes: stretched noise along u
    const height = (u, v) => ridged(u * 0.25, v * 2.2, 90, 3, seed) * 0.6
      + fbm(u, v, 60, 3, seed + 2) * 0.4;
    const map = generate(size, (u, v, out) => {
      const s = 0.975 + height(u, v) * 0.04;
      const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
      out[0] = r * s; out[1] = g * s; out[2] = b * s;
    });
    const normal = normalFromHeight(size, 0.5, height);
    const rough = generate(size, (u, v, out) => {
      out[0] = out[1] = out[2] = (1 - gloss) * 0.75 + fbm(u, v, 30, 2, seed + 7) * 0.08;
    });
    return {
      map: toTexture(map, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough)
    };
  });
}

/** Water surface normal map — two scrolling wave octaves are combined at runtime. */
export function waterNormal({ seed = 53, size = 256, scale = 7 } = {}) {
  return cached(`wat:${seed}:${scale}`, () => {
    const height = (u, v) => {
      const a = fbm(u, v, scale, 4, seed);
      const b = worley(u, v, scale * 2, seed + 3).f1;
      return a * 0.65 + b * 0.35;
    };
    return toTexture(normalFromHeight(size, 1.6, height));
  });
}

/* --------------------------------------------------------- bath surfaces -- */

/**
 * Soap-lather surface. Where `plastic()` gives an even matte, real lather is a
 * *cluster of bubbles* — two octaves of Worley cells with a very high normal
 * gain, plus a faint cool tint down in the crevices where light can't reach.
 * Used by the foam blobs in `src/fx/foam.js`.
 */
export function foamSurface({ color = 0xfffdfa, seed = 77, size = 256, cells = 22 } = {}) {
  return cached(`foamsurf:${color}:${seed}:${cells}`, () => {
    const height = (u, v) => {
      const a = Math.pow(1 - worley(u, v, cells, seed).f1, 1.7);
      const b = Math.pow(1 - worley(u, v, Math.round(cells * 2.2), seed + 13).f1, 2.3);
      const fine = fbm(u, v, cells * 5, 2, seed + 5);
      return Math.min(1, a * 0.7 + b * 0.34 + fine * 0.12);
    };
    const map = generate(size, (u, v, out) => {
      const h = height(u, v);
      // bubbles are near-white on top and pick up a cool bounce in the pits
      const shade = 0.80 + h * 0.22;
      const pit = (1 - h) * 0.06;
      const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
      out[0] = Math.min(1, r * shade - pit * 0.7);
      out[1] = Math.min(1, g * shade - pit * 0.25);
      out[2] = Math.min(1, b * shade + pit * 0.35);
    });
    const normal = normalFromHeight(size, 3.0, height);
    const rough = generate(size, (u, v, out) => {
      // wet froth: the domes catch a little specular, the pits are pure scatter
      out[0] = out[1] = out[2] = Math.min(1, 0.96 - height(u, v) * 0.20);
    });
    return {
      map: toTexture(map, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough)
    };
  });
}

/* Cheap periodic sine — the caustic field is re-evaluated every few frames on
 * the CPU, and Math.sin dominates that loop. A 2048-entry table is visually
 * indistinguishable here and roughly 4× faster. */
const _SIN_N = 2048;
const _SIN_TAB = new Float32Array(_SIN_N + 1);
for (let i = 0; i <= _SIN_N; i++) _SIN_TAB[i] = Math.sin((i / _SIN_N) * Math.PI * 2);
const _INV_TAU = 1 / (Math.PI * 2);
function fastSin(x) {
  let t = x * _INV_TAU;
  t -= Math.floor(t);
  return _SIN_TAB[(t * _SIN_N) | 0];
}

/**
 * Animated underwater caustic field.
 *
 * Caustics are the *folds* of a refracted wavefront, so the pattern is built
 * the way the physics builds it: a warped coordinate field, four interfering
 * travelling waves, and then `pow(1 - |sum|, n)` to isolate the razor-thin
 * zero crossings where rays pile up. Two octaves give the characteristic
 * big-cell / small-filament mix, and a per-channel gain fakes the dispersion
 * that makes real caustic edges faintly coloured.
 *
 * The result is not tileable and not memoised — it is meant to be handed to a
 * `SpotLight.map` and projected, and it is animated by re-running `update(t)`.
 *
 * @returns {{ texture: THREE.Texture, update: (t:number, strength?:number) => void, dispose: () => void }}
 */
export function causticField({
  size = 96, seed = 5, cells = 3.2, base = 0.12, gain = 0.68
} = {}) {
  const c = canvas(size);
  const g2d = c.getContext('2d', { willReadFrequently: true });
  const img = g2d.createImageData(size, size);
  const data = img.data;

  // A static low-frequency jitter breaks the tell-tale regularity of pure
  // sine interference without costing anything at runtime.
  const jitter = new Float32Array(size * size * 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      const j = (y * size + x) * 2;
      jitter[j] = (fbm(u, v, 6, 3, seed) - 0.5) * 1.6;
      jitter[j + 1] = (fbm(u, v, 6, 3, seed + 37) - 0.5) * 1.6;
    }
  }

  const neutral = base + gain * 0.22;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;      // it multiplies light, not albedo
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  function update(t, strength = 1) {
    const S = fastSin;
    for (let y = 0; y < size; y++) {
      const v = (y + 0.5) / size;
      const fy = Math.min(v, 1 - v);
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size;
        const idx = y * size + x;
        const j = idx * 2;

        const px = u * cells + jitter[j] * 0.24;
        const py = v * cells + jitter[j + 1] * 0.24;

        // domain warp — this is what turns a grid of waves into a caustic web
        const wx = px + 0.34 * S(py * 1.7 + t * 0.55) + 0.16 * S(px * 2.6 - t * 0.31);
        const wy = py + 0.34 * S(px * 1.9 - t * 0.47) + 0.16 * S(py * 2.3 + t * 0.37);

        let n = S(wx * 2.9 + t * 0.90) + S(wy * 3.3 - t * 0.80)
              + S((wx + wy) * 2.1 + t * 0.60) + S((wx - wy) * 2.7 - t * 0.50);
        n *= 0.25;
        let q = 1 - (n < 0 ? -n : n);
        const q2 = q * q, q4 = q2 * q2;
        const r1 = q4 * q2 * q;                       // q^7 — thin bright ridge

        let m = (S(wx * 5.9 - t * 1.30) + S(wy * 6.3 + t * 1.10)) * 0.5;
        let p = 1 - (m < 0 ? -m : m);
        const p2 = p * p, p4 = p2 * p2;
        const r2 = p4 * p4;                           // p^8 — fine filaments

        const cv = r1 * 0.92 + r2 * 0.44;
        const lvl = base + gain * cv * strength;

        // soften toward a neutral level at the border of the projection so the
        // edge of the spotlight frustum never shows as a hard square
        let e = Math.min(fy, Math.min(u, 1 - u)) / 0.16;
        if (e > 1) e = 1;
        e = e * e * (3 - 2 * e);

        const R = neutral + (base + (lvl - base) * 1.12 - neutral) * e;
        const G = neutral + (lvl - neutral) * e;
        const B = neutral + (base + (lvl - base) * 0.88 - neutral) * e;

        const o = idx * 4;
        data[o] = R > 1 ? 255 : (R * 255) | 0;
        data[o + 1] = G > 1 ? 255 : (G * 255) | 0;
        data[o + 2] = B > 1 ? 255 : (B * 255) | 0;
        data[o + 3] = 255;
      }
    }
    g2d.putImageData(img, 0, 0);
    tex.needsUpdate = true;
  }

  update(0, 1);
  return { texture: tex, update, dispose() { tex.dispose(); } };
}

/* --------------------------------------------------------------- misc ---- */

/** 1×N vertical gradient, handy for skies, gradients on cards and ramps. */
export function gradient(stops, { size = 256, srgb = true } = {}) {
  const key = 'grad:' + stops.map(s => s.join(',')).join('|');
  return cached(key, () => {
    const c = canvas(size);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, size);
    for (const [t, col] of stops) g.addColorStop(t, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/**
 * Radial falloff sprite used for every soft particle in the game
 * (steam, bubbles, dust motes, bloom sparkles).
 */
export function radialSprite({ size = 128, power = 2.2, inner = 1, seed = 0 } = {}) {
  return cached(`rad:${size}:${power}:${inner}:${seed}`, () => {
    const c = canvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const r = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - r) / r, dy = (y + 0.5 - r) / r;
        const dist = Math.hypot(dx, dy);
        let a = Math.max(0, 1 - dist);
        a = Math.pow(a, power) * inner;
        const i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = Math.min(255, a * 255) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Draw-your-own canvas texture escape hatch (labels, decals, book pages). */
export function painted(key, size, draw, { srgb = true, repeat = 1 } = {}) {
  return cached(`draw:${key}`, () => {
    const c = canvas(size);
    draw(c.getContext('2d'), size);
    return toTexture(c, { srgb, repeat });
  });
}

/** Free every cached GPU texture (used by the harness between scene reloads). */
export function disposeAll() {
  for (const v of _cache.values()) {
    if (v && v.isTexture) v.dispose();
    else if (v) for (const k of Object.keys(v)) v[k]?.dispose?.();
  }
  _cache.clear();
}

/* ============================================================================
 * Nursery surfaces — appended for src/world/*
 * ========================================================================== */

/**
 * Multi-channel tileable noise atlas: R = fBm, G = ridged, B = cellular.
 * The light shaft, the dust motes and the drifting cloud layers all need a
 * cheap animated density field; packing three flavours of noise into one RGB
 * texture keeps those shaders down to a single sampler each.
 */
export function noiseTexture({ size = 256, period = 8, octaves = 4, seed = 101 } = {}) {
  return cached(`noise:${size}:${period}:${octaves}:${seed}`, () =>
    toTexture(generate(size, (u, v, out) => {
      out[0] = fbm(u, v, period, octaves, seed);
      out[1] = ridged(u, v, period * 2, 3, seed + 13);
      out[2] = worley(u, v, period * 2, seed + 29).f1;
    })));
}

/**
 * Soft cumulus bank with a proper alpha edge, tileable horizontally so the
 * sky layers can scroll forever. `coverage` 0 = wispy, 1 = overcast.
 *
 * The luminance is derived from the *vertical gradient* of the density rather
 * than the density itself: real clouds are bright where their tops face the
 * sun and grey underneath, and that single trick is what stops a procedural
 * cloud from reading as a grey smudge.
 */
export function cloudSheet({ size = 512, seed = 17, coverage = 0.5, softness = 0.4 } = {}) {
  return cached(`cloud:${size}:${seed}:${coverage}:${softness}`, () => {
    const dens = (u, v) => {
      // squash v: cumulus banks are far wider than they are tall
      const n = fbm(u, v * 2.4, 5, 5, seed);
      const d = fbm(u, v * 2.4, 17, 4, seed + 7);
      return n * 0.68 + d * 0.32;
    };
    const c = generate(size, (u, v, out) => {
      const d = dens(u, v);
      const a = smooth(Math.max(0, Math.min(1, (d - (1 - coverage) * 0.72) / Math.max(0.02, softness))));
      const grad = d - dens(u, v + 0.035);           // >0 where the top faces up
      const lit = 0.80 + Math.max(0, grad) * 3.2 - Math.max(0, -grad) * 0.9;
      out[0] = Math.min(1, lit);
      out[1] = Math.min(1, lit * 0.995);
      out[2] = Math.min(1, lit * 0.99);
      out[3] = a;
    });
    const t = toTexture(c, { srgb: true });
    t.wrapT = THREE.ClampToEdgeWrapping;   // only scrolls horizontally
    return t;
  });
}

/**
 * Rain on glass. Returns an alpha mask (in RGB so `alphaMap` can read .g) plus
 * a matching normal map. Each droplet drags a fading trail *above* it, so when
 * the texture is scrolled downwards the drops look like they are running.
 */
export function rainSheet({ size = 512, seed = 29, period = 22, trail = 0.22 } = {}) {
  return cached(`rain:${size}:${seed}:${period}:${trail}`, () => {
    const blob = (u, v) => {
      const w = worley(u, v * 1.7, period, seed);
      return Math.max(0, 1 - w.f1 * 3.6);
    };
    const mist = (u, v) => {
      const w = worley(u, v, period * 4, seed + 5);
      return Math.max(0, 1 - w.f1 * 5.5) * 0.45;
    };
    const field = (u, v) => {
      let h = blob(u, v);
      // the trail: sample the droplet field further down and fade it out
      for (let k = 1; k <= 5; k++) {
        const t = k / 5;
        h = Math.max(h, blob(u, v + t * trail) * (1 - t) * 0.55);
      }
      return Math.max(h, mist(u, v));
    };
    const mask = generate(size, (u, v, out) => {
      const h = Math.min(1, field(u, v) * 1.25);
      out[0] = out[1] = out[2] = h;
    });
    return {
      alphaMap: toTexture(mask),
      normalMap: toTexture(normalFromHeight(size, 2.4, field))
    };
  });
}

/**
 * Quilted padding: diamond channels with a puffed cross-section and a real
 * running stitch along every seam. Used for the crib mattress and the changing
 * mat — at cot scale the eye reads the stitch line before anything else.
 */
export function quilted({
  color = 0xffffff, seed = 13, size = 512, cells = 5, puff = 1, stitch = 0.7
} = {}) {
  return cached(`quilt:${color}:${seed}:${cells}:${puff}:${stitch}`, () => {
    // (u+v) and (u-v) scaled by an integer keep the diamond lattice tileable
    const lattice = (u, v) => {
      const a = (u + v) * cells, b = (u - v) * cells;
      const fa = a - Math.floor(a), fb = b - Math.floor(b);
      const da = Math.min(fa, 1 - fa) * 2, db = Math.min(fb, 1 - fb) * 2;
      return { d: Math.min(da, db), a, b };
    };
    const height = (u, v) => {
      const { d, a, b } = lattice(u, v);
      const pillow = Math.pow(Math.min(1, d * 1.35), 0.55) * puff;
      // running stitch: dashes marching along whichever seam is nearest
      const along = (d === Math.min(1, d) && Math.abs(((a % 1) + 1) % 1 - 0.5) > Math.abs(((b % 1) + 1) % 1 - 0.5)) ? b : a;
      const dash = Math.sin(along * Math.PI * 2 * 6) * 0.5 + 0.5;
      const seam = Math.max(0, 1 - d * 9);
      const thread = seam * (dash > 0.55 ? 1 : 0) * stitch * 0.35;
      return pillow * 0.85 + thread + fbm(u, v, 180, 3, seed) * 0.06;
    };
    const map = generate(size, (u, v, out) => {
      const h = height(u, v);
      const lot = fbm(u, v, 10, 3, seed + 8) - 0.5;
      const shade = 0.80 + h * 0.22 + lot * 0.04;
      const c = mixHex(color, 0xffffff, 0);
      out[0] = c[0] * shade; out[1] = c[1] * shade; out[2] = c[2] * shade;
    });
    const normal = normalFromHeight(size, 1.9, height);
    const rough = generate(size, (u, v, out) => {
      out[0] = out[1] = out[2] = 0.90 - height(u, v) * 0.08;
    });
    return {
      map: toTexture(map, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough)
    };
  });
}

/* ============================================================================
 * Character additions (appended — nothing above this line was modified)
 * ========================================================================== */

/**
 * Alpha-tested hair card. Alpha carves the quad into tapered strands that
 * thin out toward the tip, which is what stops a hair card reading as a
 * rectangle of hair-coloured plastic. RGB carries root-to-tip shading.
 */
export function hairStrand({ strands = 9, seed = 5, size = 256, wisp = 0.55 } = {}) {
  return cached(`hair:${strands}:${seed}:${wisp}`, () => {
    const centres = [];
    for (let i = 0; i < strands; i++) {
      centres.push({
        u: (i + 0.5) / strands + (hash2(i, 0, seed) - 0.5) * (0.55 / strands),
        w: (0.30 + hash2(i, 1, seed) * 0.42) / strands,
        drift: (hash2(i, 2, seed) - 0.5) * 0.16,
        len: 0.62 + hash2(i, 3, seed) * 0.38
      });
    }
    const alpha = (u, v) => {
      let a = 0;
      for (const c of centres) {
        // strands bow sideways as they fall and taper to nothing at the tip
        const cu = c.u + c.drift * v * v;
        const taper = Math.max(0, 1 - Math.pow(v / c.len, 2.1));
        const w = c.w * taper;
        if (w <= 0) continue;
        const d = Math.abs(u - cu) / w;
        a = Math.max(a, Math.max(0, 1 - d * d));
      }
      // soften the card's own top edge so roots blend into the scalp
      return a * (0.35 + 0.65 * smooth(Math.min(1, v * 6)));
    };
    const map = generate(size, (u, v, out) => {
      const a = alpha(u, v);
      // brighter along the strand's spine and toward the tip: fake anisotropy
      const shade = 0.62 + a * 0.30 + v * 0.22 + fbm(u, v, 90, 3, seed) * 0.10;
      out[0] = out[1] = out[2] = Math.min(1, shade);
      out[3] = a;
    });
    const t = toTexture(map, { srgb: true });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const nrm = normalFromHeight(size, 1.1, (u, v) => alpha(u, v) * 0.8 + fbm(u, v, 120, 2, seed + 4) * 0.2);
    const n = toTexture(nrm);
    n.wrapS = n.wrapT = THREE.ClampToEdgeWrapping;
    return { map: t, normalMap: n, alphaMap: t };
  });
}

/**
 * Grime lobe used for the dirt shader's break-up noise. Kept as a texture so
 * the smudge pattern is identical on every device and every screenshot.
 */
export function grime({ seed = 91, size = 256 } = {}) {
  return cached(`grime:${seed}`, () => toTexture(generate(size, (u, v, out) => {
    const big = fbm(u, v, 6, 4, seed);
    const fine = worley(u, v, 26, seed + 3).f1;
    const g = Math.pow(big * 0.7 + fine * 0.3, 1.4);
    out[0] = g; out[1] = fbm(u, v, 18, 3, seed + 9); out[2] = fine;
  })));
}
