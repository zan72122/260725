#!/usr/bin/env node
/* ============================================================================
 * histo.mjs — luminance percentile / histogram report for rendered frames
 * ----------------------------------------------------------------------------
 * The critic's value-range finding (rubric §4 #101 / #46) is a *measurement*,
 * so it needs a measurement to close it. This walks a directory of PNGs and
 * prints, per frame:
 *
 *   p1 p5 median p95 p99   %<0.15 (true dark)   %>0.95 (true highlight)
 *   %>0.995 (clipped to featureless white)      mean RGB, R:B ratio
 *
 * Luminance is sRGB-decoded to linear? No — deliberately *display* luminance
 * (0.2126R + 0.7152G + 0.0722B on the 0..1 sRGB code values), because that is
 * what CRITIQUE-02 §0.4 measured and the numbers have to be comparable.
 *
 *   node tools/histo.mjs docs/shots [ids...]
 * ========================================================================== */

import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, resolve, basename } from 'node:path';

/* --------------------------------------------------------- png decode --- */

function decodePNG(buf) {
  let p = 8;                       // skip signature
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  let palette = null, trns = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error('only 8-bit PNGs supported (got ' + depth + ')');
  if (interlace) throw new Error('interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!channels) throw new Error('unsupported colour type ' + ctype);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);

  let ri = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[ri++];
    const row = raw.subarray(ri, ri + stride); ri += stride;
    const o = y * stride, prev = o - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = (x >= bpp && y > 0) ? out[prev + x - bpp] : 0;
      let v = row[x];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
      }
      out[o + x] = v & 255;
    }
  }
  return { w, h, channels, data: out, ctype, palette, trns };
}

/* ------------------------------------------------------------ measure --- */

function measure(file) {
  const img = decodePNG(readFileSync(file));
  const { w, h, channels, data } = img;
  const hist = new Float64Array(1024);
  let n = 0, sr = 0, sg = 0, sb = 0;
  const px = w * h;
  for (let i = 0; i < px; i++) {
    let r, g, b;
    if (channels >= 3) { r = data[i * channels]; g = data[i * channels + 1]; b = data[i * channels + 2]; }
    else { r = g = b = data[i * channels]; }
    sr += r; sg += g; sb += b;
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    hist[Math.min(1023, Math.max(0, Math.round(l * 1023)))]++;
    n++;
  }
  const pct = (q) => {
    const want = q * n;
    let acc = 0;
    for (let i = 0; i < 1024; i++) { acc += hist[i]; if (acc >= want) return i / 1023; }
    return 1;
  };
  const frac = (from, to) => {
    let acc = 0;
    const a = Math.round(from * 1023), b = Math.round(to * 1023);
    for (let i = a; i <= b; i++) acc += hist[i];
    return acc / n;
  };
  return {
    id: basename(file, '.png'),
    p1: pct(0.01), p5: pct(0.05), med: pct(0.5), p95: pct(0.95), p99: pct(0.99),
    dark: frac(0, 0.15), bright: frac(0.95, 1), clip: frac(0.995, 1),
    mean: [sr / n, sg / n, sb / n]
  };
}

/* --------------------------------------------------------------- main --- */

const dir = resolve(process.argv[2] || 'docs/shots');
const only = process.argv.slice(3);
const files = readdirSync(dir).filter(f => f.endsWith('.png'))
  .filter(f => !only.length || only.some(o => f.includes(o)))
  .sort();

const rows = files.map(f => measure(join(dir, f)));
const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 6, d = 3) => v.toFixed(d).padStart(n);

console.log(`\n${pad('frame', 22)} ${pad('p1', 6)} ${pad('p5', 6)} ${pad('med', 6)} ${pad('p95', 6)} ${pad('p99', 6)}  ${pad('%<.15', 7)} ${pad('%>.95', 7)} ${pad('%>.995', 7)}  meanRGB          R:B`);
console.log('-'.repeat(122));
let fails = 0;
for (const r of rows) {
  const bad = (r.bright < 0.0005 && r.dark < 0.012) || r.clip > 0.010;
  if (bad) fails++;
  console.log(
    `${pad(r.id, 22)} ${num(r.p1)} ${num(r.p5)} ${num(r.med)} ${num(r.p95)} ${num(r.p99)}  ` +
    `${num(r.dark * 100, 6, 2)}% ${num(r.bright * 100, 6, 2)}% ${num(r.clip * 100, 6, 2)}%  ` +
    `(${r.mean.map(v => Math.round(v)).join(',').padEnd(11)}) ${num(r.mean[0] / Math.max(1, r.mean[2]), 5, 2)}` +
    (bad ? '  <-- FAIL' : ''));
}
console.log('-'.repeat(122));
console.log(`${rows.length} frames, ${fails} failing (need >=0.05% above 0.95 or >=1.2% below 0.15, and <1% clipped above 0.995)\n`);
