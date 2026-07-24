/**
 * make-icons.mjs — アプリのアイコン PNG を手続き的に描き出す
 *
 * 外部ライブラリを使わず、ピクセルを直接塗って zlib で PNG にする。
 * 起動画面の歯車と同じ配色・同じ形にそろえてある。
 *
 *   node tools/make-icons.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'icons');

/* ------------------------------------------------------------------ */
/* 形（符号付き距離関数）                                              */
/* ------------------------------------------------------------------ */

/** 歯車。中心 (cx,cy)、基準半径 r、歯数 teeth、歯の高さ th。 */
function gearDistance(x, y, cx, cy, r, teeth, th) {
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return -r;
  const a = Math.atan2(dy, dx);
  const t = ((a / (Math.PI * 2)) * teeth) % 1;
  const u = (t + 1) % 1;
  // 歯の谷と山を、なめらかにつなぐ
  const wave = smoothPulse(u, 0.30, 0.70, 0.10);
  const rr = r + th * wave;
  return d - rr;
}

function smoothPulse(u, a, b, soft) {
  const up = smoothstep(a - soft, a + soft, u);
  const down = 1 - smoothstep(b - soft, b + soft, u);
  return Math.min(up, down);
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function circleDistance(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

function roundedRectDistance(x, y, cx, cy, w, h, r) {
  const qx = Math.abs(x - cx) - (w / 2 - r);
  const qy = Math.abs(y - cy) - (h / 2 - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/* ------------------------------------------------------------------ */

const CREAM_TOP = [0xff, 0xfa, 0xf0];
const CREAM_BOTTOM = [0xf1, 0xdd, 0xb8];
const ORANGE = [0xe8, 0xa3, 0x3f];
const ORANGE_DARK = [0xc9, 0x82, 0x28];
const TEAL = [0x4a, 0xbf, 0xac];
const TEAL_DARK = [0x2f, 0x93, 0x83];
const HOLE = [0xf7, 0xe8, 0xd0];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * 1 ピクセルの色を決める。2×2 のスーパーサンプリングで輪郭をなめらかにする。
 */
function shade(px, py, size, opaqueBackground) {
  const S = 3;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      const x = ((px + (sx + 0.5) / S) / size) * 2 - 1; // -1..1
      const y = ((py + (sy + 0.5) / S) / size) * 2 - 1;
      const c = sample(x, y, opaqueBackground, size);
      r += c[0];
      g += c[1];
      b += c[2];
      a += c[3];
    }
  }
  const n = S * S;
  return [r / n, g / n, b / n, a / n];
}

function sample(x, y, opaqueBackground, size) {
  // 1 ピクセルぶんの幅でエッジを立てる（ぼやけないように解像度に合わせる）
  const k = size * 0.5;
  // 背景（角丸の四角。iOS はマスクするので、余白は十分にとる）
  const bgD = roundedRectDistance(x, y, 0, 0, 2.0, 2.0, 0.42);
  const bgA = opaqueBackground ? 1 : clamp01(0.5 - bgD * k);
  const grad = clamp01((y + 1) / 2);
  let col = mix(CREAM_TOP, CREAM_BOTTOM, grad * grad);

  // 大きい歯車（オレンジ）
  const g1 = gearDistance(x, y, -0.16, -0.06, 0.50, 16, 0.11);
  col = over(col, ORANGE, clamp01(0.5 - g1 * k));
  // ふち
  col = over(col, ORANGE_DARK, clamp01(0.5 - (Math.abs(g1 + 0.012) - 0.006) * k) * 0.55);
  // 中心の穴とスポーク
  col = over(col, HOLE, clamp01(0.5 - circleDistance(x, y, -0.16, -0.06, 0.145) * k));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    col = over(
      col,
      HOLE,
      clamp01(0.5 - circleDistance(x, y, -0.16 + Math.cos(a) * 0.30, -0.06 + Math.sin(a) * 0.30, 0.075) * k),
    );
  }

  // 小さい歯車（ティール）
  const g2 = gearDistance(x, y, 0.40, 0.36, 0.31, 11, 0.10);
  col = over(col, TEAL, clamp01(0.5 - g2 * k));
  col = over(col, TEAL_DARK, clamp01(0.5 - (Math.abs(g2 + 0.012) - 0.006) * k) * 0.5);
  col = over(col, HOLE, clamp01(0.5 - circleDistance(x, y, 0.40, 0.36, 0.095) * k));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    col = over(
      col,
      HOLE,
      clamp01(0.5 - circleDistance(x, y, 0.40 + Math.cos(a) * 0.185, 0.36 + Math.sin(a) * 0.185, 0.050) * k),
    );
  }

  return [col[0], col[1], col[2], bgA * 255];
}

function over(base, color, alpha) {
  const a = clamp01(alpha);
  return mix(base, color, a);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/* ------------------------------------------------------------------ */
/* PNG 出力（最小限のエンコーダ）                                      */
/* ------------------------------------------------------------------ */

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // フィルタなし
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size, { opaque = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shade(x, y, size, opaque);
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(a);
    }
  }
  return encodePNG(size, size, rgba);
}

/* ------------------------------------------------------------------ */

mkdirSync(OUT, { recursive: true });
const jobs = [
  ['icon-180.png', 180, { opaque: true }],   // iOS のホーム画面用（透明を持てない）
  ['icon-192.png', 192, { opaque: false }],
  ['icon-512.png', 512, { opaque: false }],
  ['icon-maskable-512.png', 512, { opaque: true }],
];
for (const [name, size, opts] of jobs) {
  const png = render(size, opts);
  writeFileSync(join(OUT, name), png);
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
