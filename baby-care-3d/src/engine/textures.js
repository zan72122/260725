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
    // Growth rings: distort v, then take a sawtooth of the distorted coordinate.
    const rings = (u, v) => {
      const plankRow = planks ? Math.floor(v * planks) : 0;
      const off = planks ? hash2(plankRow, 0, seed + 17) : 0;
      const warp = fbm(u + off, v, 8, 4, seed + plankRow * 13) - 0.5;
      const g = (u + off) * ringScale + warp * 5.5;
      let r = g - Math.floor(g);
      r = Math.abs(r * 2 - 1);
      // fine fibre streaks running along the grain
      const streak = ridged(u * 0.35 + off, v * 3.0, 160, 3, seed + 31);
      return Math.min(1, r * 0.78 + streak * 0.22);
    };

    const seam = (v) => {
      if (!planks) return 0;
      const f = v * planks;
      const d = Math.abs(f - Math.round(f));
      return Math.max(0, 1 - d * planks * 6);
    };

    const map = generate(size, (u, v, out) => {
      let t = rings(u, v);
      // knots
      const w = worley(u, v, 5, seed + 41);
      if (w.f1 < 0.12 && w.id > 0.72) t = Math.min(1, t + (0.12 - w.f1) * 6);
      const c = mixHex(light, dark, t * 0.85);
      const s = 1 - seam(v) * 0.55;
      out[0] = c[0] * s; out[1] = c[1] * s; out[2] = c[2] * s;
    });

    const normal = normalFromHeight(size, 1.15, (u, v) =>
      rings(u, v) * 0.55 + seam(v) * 0.9 + fbm(u, v, 200, 2, seed + 60) * 0.12);

    const rough = generate(size, (u, v, out) => {
      const t = rings(u, v);
      const r = satin + t * 0.22 + seam(v) * 0.2;
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
    const height = (u, v) => {
      const w = worley(u, v, density, seed);
      const tuft = Math.pow(1 - w.f1, 1.6);
      const sweep = fbm(u, v, 9, 3, seed + 5);
      return tuft * 0.72 + sweep * 0.28;
    };
    const map = generate(size, (u, v, out) => {
      const w = worley(u, v, density, seed);
      const h = Math.pow(1 - w.f1, 1.6);
      const sweep = fbm(u, v, 9, 3, seed + 5);
      // pile direction changes reflectance — that's the "vacuum stripe" look
      const shade = 0.72 + h * 0.34 + (sweep - 0.5) * 0.14 + w.id * 0.06;
      const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
      out[0] = r * shade; out[1] = g * shade; out[2] = b * shade;
    });
    const normal = normalFromHeight(size, 2.6, height);
    const rough = generate(size, (u, v, out) => {
      out[0] = out[1] = out[2] = 0.95 - height(u, v) * 0.06;
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
