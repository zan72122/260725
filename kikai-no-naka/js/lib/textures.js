/**
 * textures.js — 手続き的テクスチャ生成
 *
 * 外部画像ファイルを一切使わずに、Canvas 2D で PBR 用のマップを作る。
 * 生成物はキーでキャッシュし、同じテクスチャを何度も焼き直さない。
 *
 * 生成する主なマップ:
 *   - ラフネス（ヘアライン／同心円ヘアライン／微細ノイズ）
 *   - ノーマル（ハイトマップから Sobel で算出）
 *   - 木目、パン、基板、ローレット、エナメル塗装のムラ
 *   - パーティクル用のソフトスプライト
 */

import * as THREE from 'three';
import { clamp01, lerp, makeRandom, mod, smoothstep } from './math.js';

const cache = new Map();

/** 同じ設定のテクスチャを共有するためのメモ化ラッパー */
function memo(key, factory) {
  if (cache.has(key)) return cache.get(key);
  const value = factory();
  cache.set(key, value);
  return value;
}

export function disposeAllTextures() {
  for (const t of cache.values()) if (t && t.isTexture) t.dispose();
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* Canvas ヘルパー                                                     */
/* ------------------------------------------------------------------ */

function createCanvas(size) {
  const c =
    typeof OffscreenCanvas !== 'undefined' && false // Safari 互換のため通常の canvas を使う
      ? new OffscreenCanvas(size, size)
      : document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function toTexture(canvas, { repeat = 1, colorSpace = THREE.NoColorSpace, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = colorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/* ノイズ（タイル可能な値ノイズ + fBm）                                */
/* ------------------------------------------------------------------ */

/** タイル可能な格子を作り、周期 `period` で繰り返す値ノイズを返す */
function makeTileableValueNoise(period, seed) {
  const rnd = makeRandom(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const x0 = mod(xi, period);
    const x1 = mod(xi + 1, period);
    const y0 = mod(yi, period) * period;
    const y1 = mod(yi + 1, period) * period;
    const a = g[y0 + x0];
    const b = g[y0 + x1];
    const c = g[y1 + x0];
    const d = g[y1 + x1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

/**
 * タイル可能な fBm を Float32Array (size*size, 0..1) として生成する。
 */
export function fbmField(size, { octaves = 5, baseFreq = 4, gain = 0.5, lacunarity = 2, seed = 1 } = {}) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  let freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    const period = Math.max(2, Math.round(freq));
    const noise = makeTileableValueNoise(period, seed + o * 131);
    const scale = period / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        out[y * size + x] += amp * noise(x * scale, y * scale);
      }
    }
    total += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Float32Array のフィールドをグレースケール canvas に描く */
function fieldToCanvas(field, size, map = (v) => v) {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < field.length; i++) {
    const v = clamp01(map(field[i], i)) * 255;
    img.data[i * 4 + 0] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* ハイトマップ → ノーマルマップ                                       */
/* ------------------------------------------------------------------ */

/**
 * 高さフィールド（0..1）から接空間ノーマルマップ canvas を作る。
 * Sobel フィルタで勾配を取り、タイル境界も繋がるようラップして参照する。
 */
export function heightToNormalCanvas(height, size, strength = 2.0) {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[mod(y, size) * size + mod(x, size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const dx = tl + 2 * l + bl - (tr + 2 * r + br);
      const dy = tl + 2 * t + tr - (bl + 2 * b + br);

      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const nzn = nz / len;

      const i = (y * size + x) * 4;
      img.data[i + 0] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nzn * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* ラフネス系                                                          */
/* ------------------------------------------------------------------ */

/**
 * 直線ヘアライン（板金・アルミ筐体むけ）。
 * 横方向に強く伸びた異方性ノイズ。
 */
export function brushedLinear({ size = 512, base = 0.34, contrast = 0.16, seed = 3, stretch = 48 } = {}) {
  return memo(`brushedLinear:${size}:${base}:${contrast}:${seed}:${stretch}`, () => {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const rnd = makeRandom(seed);
    // 行ごとに独立したライン強度を作り、横方向には低周波で変調
    const rowNoise = new Float32Array(size);
    for (let i = 0; i < size; i++) rowNoise[i] = rnd();
    const broad = fbmField(size, { octaves: 4, baseFreq: 3, seed: seed + 17 });

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // 横に stretch 倍引き伸ばした細かい筋
        const s = rowNoise[mod(y + Math.floor(x / stretch) * 7, size)];
        const fine = (s - 0.5) * 2;
        const v = base + fine * contrast * 0.5 + (broad[y * size + x] - 0.5) * contrast;
        const c = clamp01(v) * 255;
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(canvas);
  });
}

/**
 * 同心円ヘアライン（旋盤で削った金属の円板・ギヤの側面むけ）。
 * UV 中心 (0.5,0.5) を基準に角度方向へ引き伸ばす。
 */
export function brushedRadial({ size = 512, base = 0.3, contrast = 0.22, seed = 11, rings = 220 } = {}) {
  return memo(`brushedRadial:${size}:${base}:${contrast}:${seed}:${rings}`, () => {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const rnd = makeRandom(seed);
    const ringNoise = new Float32Array(1024);
    for (let i = 0; i < ringNoise.length; i++) ringNoise[i] = rnd();
    const angNoise = fbmField(size, { octaves: 3, baseFreq: 6, seed: seed + 5 });

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x / size - 0.5;
        const dy = y / size - 0.5;
        const r = Math.hypot(dx, dy) * 2; // 0..~1.41
        const idx = Math.floor(r * rings) % ringNoise.length;
        const ring = ringNoise[idx];
        const jitter = ringNoise[(idx * 7 + 13) % ringNoise.length];
        const v = base + (ring - 0.5) * contrast + (jitter - 0.5) * contrast * 0.35 + (angNoise[y * size + x] - 0.5) * 0.06;
        const c = clamp01(v) * 255;
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(canvas);
  });
}

/** ざらついた微細ノイズのラフネス（樹脂・塗装むけ） */
export function fineGrain({ size = 256, base = 0.55, contrast = 0.18, seed = 23, freq = 40 } = {}) {
  return memo(`fineGrain:${size}:${base}:${contrast}:${seed}:${freq}`, () => {
    const f = fbmField(size, { octaves: 4, baseFreq: freq, gain: 0.55, seed });
    return toTexture(fieldToCanvas(f, size, (v) => base + (v - 0.5) * contrast * 2));
  });
}

/** 塗装表面のごく微細な凹凸ノーマル（オレンジピール） */
export function orangePeelNormal({ size = 256, seed = 41, strength = 0.6 } = {}) {
  return memo(`orangePeel:${size}:${seed}:${strength}`, () => {
    const f = fbmField(size, { octaves: 4, baseFreq: 22, gain: 0.5, seed });
    return toTexture(heightToNormalCanvas(f, size, strength));
  });
}

/** ヘアラインに沿った金属のノーマル */
export function brushedNormal({ size = 512, seed = 3, strength = 0.9, stretch = 40 } = {}) {
  return memo(`brushedNormal:${size}:${seed}:${strength}:${stretch}`, () => {
    const rnd = makeRandom(seed);
    const rows = new Float32Array(size);
    for (let i = 0; i < size; i++) rows[i] = rnd();
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        h[y * size + x] = rows[mod(y + Math.floor(x / stretch) * 7, size)];
      }
    }
    return toTexture(heightToNormalCanvas(h, size, strength));
  });
}

/* ------------------------------------------------------------------ */
/* 素材ごとの模様                                                      */
/* ------------------------------------------------------------------ */

/** 木目（オルゴールの箱） */
export function woodGrain({ size = 512, seed = 61, light = '#c99a63', dark = '#8a5a30' } = {}) {
  return memo(`wood:${size}:${seed}:${light}:${dark}`, () => {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    const warp = fbmField(size, { octaves: 4, baseFreq: 3, seed });
    const fine = fbmField(size, { octaves: 5, baseFreq: 28, seed: seed + 3 });
    const img = ctx.createImageData(size, size);
    const c0 = hexToRgb(light);
    const c1 = hexToRgb(dark);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        // 年輪: x 方向に細かい縞、warp で歪ませる
        const u = x / size + (warp[i] - 0.5) * 0.35;
        let rings = Math.sin(u * Math.PI * 2 * 9 + warp[i] * 6.0);
        rings = Math.pow(Math.abs(rings), 0.55);
        const t = clamp01(rings * 0.75 + (fine[i] - 0.5) * 0.5 + 0.18);
        const o = i * 4;
        img.data[o + 0] = lerp(c1.r, c0.r, t);
        img.data[o + 1] = lerp(c1.g, c0.g, t);
        img.data[o + 2] = lerp(c1.b, c0.b, t);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(canvas, { colorSpace: THREE.SRGBColorSpace });
  });
}

/** 木目に対応するラフネス（導管が荒い） */
export function woodRoughness({ size = 512, seed = 61 } = {}) {
  return memo(`woodRough:${size}:${seed}`, () => {
    const warp = fbmField(size, { octaves: 4, baseFreq: 3, seed });
    const fine = fbmField(size, { octaves: 5, baseFreq: 28, seed: seed + 3 });
    const f = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const u = x / size + (warp[i] - 0.5) * 0.35;
        const rings = Math.pow(Math.abs(Math.sin(u * Math.PI * 2 * 9 + warp[i] * 6.0)), 0.55);
        f[i] = 0.42 + (1 - rings) * 0.22 + (fine[i] - 0.5) * 0.1;
      }
    }
    return toTexture(fieldToCanvas(f, size));
  });
}

/** 食パンの気泡（トースター） */
export function breadCrumb({ size = 512, seed = 91 } = {}) {
  return memo(`bread:${size}:${seed}`, () => {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4dfb4';
    ctx.fillRect(0, 0, size, size);
    const rnd = makeRandom(seed);
    // 気泡（明るい縁 + 暗い内側）で「ふわっ」とした断面をつくる
    for (let i = 0; i < 900; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 2 + Math.pow(rnd(), 2.4) * 16;
      const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(196,158,104,0.55)');
      g.addColorStop(0.7, 'rgba(226,196,142,0.30)');
      g.addColorStop(1, 'rgba(255,242,214,0.0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(canvas, { colorSpace: THREE.SRGBColorSpace });
  });
}

/** 食パン用のバンプ（気泡のでこぼこ） */
export function breadNormal({ size = 512, seed = 91 } = {}) {
  return memo(`breadN:${size}:${seed}`, () => {
    const f = fbmField(size, { octaves: 5, baseFreq: 18, gain: 0.55, seed });
    return toTexture(heightToNormalCanvas(f, size, 1.6));
  });
}

/** プリント基板（銅箔パターン） */
export function circuitBoard({ size = 512, seed = 77, base = '#1f6b52', trace = '#d9b45a' } = {}) {
  return memo(`pcb:${size}:${seed}`, () => {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    // 微妙なムラ
    const f = fbmField(size, { octaves: 4, baseFreq: 6, seed: seed + 2 });
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < size * size; i++) {
      const v = (f[i] - 0.5) * 26;
      img.data[i * 4] = clamp01((img.data[i * 4] + v) / 255) * 255;
      img.data[i * 4 + 1] = clamp01((img.data[i * 4 + 1] + v) / 255) * 255;
      img.data[i * 4 + 2] = clamp01((img.data[i * 4 + 2] + v) / 255) * 255;
    }
    ctx.putImageData(img, 0, 0);

    // 直角に曲がる配線
    const rnd = makeRandom(seed);
    ctx.strokeStyle = trace;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 48; i++) {
      ctx.lineWidth = 2 + rnd() * 4;
      ctx.globalAlpha = 0.5 + rnd() * 0.5;
      let x = Math.floor(rnd() * 16) * (size / 16);
      let y = Math.floor(rnd() * 16) * (size / 16);
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = 3 + Math.floor(rnd() * 5);
      for (let s = 0; s < steps; s++) {
        const horizontal = rnd() < 0.5;
        const len = (1 + Math.floor(rnd() * 4)) * (size / 16) * (rnd() < 0.5 ? -1 : 1);
        if (horizontal) x += len;
        else y += len;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // ランド（丸パッド）
    ctx.globalAlpha = 1;
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(rnd() * 16) * (size / 16);
      const y = Math.floor(rnd() * 16) * (size / 16);
      ctx.fillStyle = trace;
      ctx.beginPath();
      ctx.arc(x, y, 5 + rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(canvas, { colorSpace: THREE.SRGBColorSpace });
  });
}

/** ローレット（つまみの滑り止め）用ノーマル */
export function knurlNormal({ size = 256, pitch = 26, strength = 2.2 } = {}) {
  return memo(`knurl:${size}:${pitch}:${strength}`, () => {
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = Math.sin(((x + y) / size) * Math.PI * 2 * pitch);
        const b = Math.sin(((x - y) / size) * Math.PI * 2 * pitch);
        h[y * size + x] = (a * b) * 0.5 + 0.5;
      }
    }
    return toTexture(heightToNormalCanvas(h, size, strength));
  });
}

/** 布・リボン用の織り目ノーマル */
export function fabricNormal({ size = 256, pitch = 44, strength = 1.2 } = {}) {
  return memo(`fabric:${size}:${pitch}:${strength}`, () => {
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2 * pitch;
        const v = (y / size) * Math.PI * 2 * pitch;
        h[y * size + x] = (Math.abs(Math.sin(u)) * 0.5 + Math.abs(Math.sin(v)) * 0.5) * 0.5 + 0.25;
      }
    }
    return toTexture(heightToNormalCanvas(h, size, strength));
  });
}

/* ------------------------------------------------------------------ */
/* スプライト                                                          */
/* ------------------------------------------------------------------ */

/** 中心が明るく縁がなめらかに消える円（パーティクル／グロー） */
export function softSprite({ size = 128, power = 2.2, core = 0.16 } = {}) {
  return memo(`soft:${size}:${power}:${core}`, () => {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - c, y - c) / c;
        let a = clamp01(1 - d);
        a = Math.pow(a, power);
        a = clamp01(a + smoothstep(core, 0, d) * 0.9);
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = toTexture(canvas, { colorSpace: THREE.SRGBColorSpace, aniso: 1 });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/**
 * 白 → 黒の円形マスク（alphaMap 用）。
 * three の alphaMap は緑チャンネルを読むので、RGB を持つ不透明画像で作る。
 */
export function radialMask({ size = 256, inner = 0.35, power = 1.4 } = {}) {
  return memo(`radialMask:${size}:${inner}:${power}`, () => {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - c, y - c) / c;
        const v = Math.pow(clamp01(1 - smoothstep(inner, 1.0, d)), power) * 255;
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = toTexture(canvas, { aniso: 1 });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** ふんわりした楕円の影（接地感を出す偽ソフトシャドウ） */
export function blobShadow({ size = 256, softness = 1.9 } = {}) {
  return memo(`blob:${size}:${softness}`, () => {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot((x - c) / c, (y - c) / c);
        const a = Math.pow(clamp01(1 - d), softness);
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = toTexture(canvas, { aniso: 1 });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** 水しぶき用の少し歪んだ雫スプライト */
export function dropletSprite({ size = 128 } = {}) {
  return memo(`droplet:${size}`, () => {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size * 0.42, size * 0.38, 1, size * 0.5, size * 0.5, size * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(0.35, 'rgba(210,240,255,0.75)');
    g.addColorStop(0.75, 'rgba(150,205,245,0.35)');
    g.addColorStop(1, 'rgba(120,190,240,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    const t = toTexture(canvas, { colorSpace: THREE.SRGBColorSpace, aniso: 1 });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/* ------------------------------------------------------------------ */
/* 文字ラベル（ひらがな）                                              */
/* ------------------------------------------------------------------ */

/**
 * ひらがなのラベルを吹き出し付きで canvas に描き、テクスチャとして返す。
 * 端末の日本語フォント（iOS ならヒラギノ丸ゴ）をそのまま使う。
 */
export function labelTexture(text, { fontSize = 76, padX = 34, padY = 20, bg = '#ffffff', fg = '#3b3226', accent = '#ffd34e' } = {}) {
  const key = `label:${text}:${fontSize}:${bg}:${fg}:${accent}`;
  if (cache.has(key)) return cache.get(key);

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  const font = `700 ${fontSize}px "Hiragino Maru Gothic ProN", "ヒラギノ丸ゴ ProN W4", "Yu Gothic", system-ui, sans-serif`;
  mctx.font = font;
  const w = Math.ceil(mctx.measureText(text).width);

  const cw = w + padX * 2;
  const ch = fontSize + padY * 2;
  const tailH = 22;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch + tailH;
  const ctx = canvas.getContext('2d');

  const r = ch / 2;
  // 影
  ctx.fillStyle = 'rgba(60,45,25,0.18)';
  roundRect(ctx, 3, 5, cw - 6, ch, r);
  ctx.fill();
  // 本体
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, cw, ch, r);
  ctx.fill();
  // アクセント下線
  ctx.fillStyle = accent;
  roundRect(ctx, padX * 0.5, ch - 12, cw - padX, 7, 4);
  ctx.fill();
  // しっぽ
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(cw / 2 - 16, ch - 2);
  ctx.lineTo(cw / 2 + 16, ch - 2);
  ctx.lineTo(cw / 2, ch + tailH - 2);
  ctx.closePath();
  ctx.fill();

  ctx.font = font;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cw / 2, ch / 2 - 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  tex.userData.aspect = canvas.width / canvas.height;
  cache.set(key, tex);
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
