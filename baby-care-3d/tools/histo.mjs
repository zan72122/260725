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

/* ======================================================================== *
 * COLOUR / PER-CHANNEL EXTENSION
 * ------------------------------------------------------------------------
 * CRITIQUE-03 §0.4 took two measurements the original tool could not:
 *
 *   1. **Per-channel clipping.** `51-sleep-asleep` once had 23.8% of the frame
 *      with the red channel pinned at 255 while the *luminance* histogram
 *      reported 0.00% above 0.95. Warm light on warm skin flat-tops one
 *      channel long before the pixel is anywhere near white, so a luminance
 *      histogram is structurally blind to the defect. Every channel therefore
 *      gets its own 256-bin histogram and its own ceiling count.
 *
 *   2. **Colour temperature.** §0.4's headline finding — "twelve of the 28
 *      frames are graded to within 0.2 of the same warm-orange" — was made by
 *      hand from the mean RGB column. It is now a first-class column: R:G, R:B
 *      and G:B off the frame mean, plus a mean chroma (max−min over the three
 *      channels, 0..1) which separates "warm" from "warm *and* saturated".
 *
 * A caveat this tool has to state rather than hide: the mean of a whole frame
 * is a mix of the grade *and* the content. Two frames of different subjects
 * under one grade can differ by more than two grades on one subject. That is
 * exactly what `--matrix` below exists to remove.
 * ====================================================================== */

/**
 * Which lighting mood each shot in `tools/shots.json` actually renders under.
 *
 * This is *derived*, not declared: `shots.json` names a `scene`, `app.js`
 * hands `ACTIVITIES[scene].mood` to `LightingRig.transitionTo`, and nothing
 * else in the harness path touches the rig unless the shot patches
 * `state.timeOfDay`. So the mood of a frame is a property of its activity.
 * Written out here because the single most useful grouping for a grade audit
 * is "all the frames that share a preset", and reading it off the shot id is
 * guesswork.
 */
const SCENE_MOOD = { feed: 'golden', play: 'golden', bath: 'evening', dress: 'day', sleep: 'night' };

function moodOf(id, shots) {
  const s = shots.find(x => x.id === id);
  if (!s) return '?';
  if (s.state?.timeOfDay) return s.state.timeOfDay;
  const m = SCENE_MOOD[s.scene] || '?';
  return s.state?.weather && s.state.weather !== 'clear' ? `${m}+${s.state.weather}` : m;
}

/** Per-channel histograms, ceiling counts and colour ratios. */
function measureColour(file) {
  const img = decodePNG(readFileSync(file));
  const { w, h, channels, data } = img;
  const H = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
  const px = w * h;
  let sr = 0, sg = 0, sb = 0, chroma = 0;
  for (let i = 0; i < px; i++) {
    let r, g, b;
    if (channels >= 3) { r = data[i * channels]; g = data[i * channels + 1]; b = data[i * channels + 2]; }
    else { r = g = b = data[i * channels]; }
    H[0][r]++; H[1][g]++; H[2][b]++;
    sr += r; sg += g; sb += b;
    chroma += (Math.max(r, g, b) - Math.min(r, g, b));
  }
  const pin = c => H[c][255] / px;                       // hard ceiling
  const near = c => { let a = 0; for (let v = 250; v < 256; v++) a += H[c][v]; return a / px; };
  const floorC = c => H[c][0] / px;
  const pctC = (c, q) => {
    const want = q * px; let acc = 0;
    for (let v = 0; v < 256; v++) { acc += H[c][v]; if (acc >= want) return v / 255; }
    return 1;
  };
  const mean = [sr / px, sg / px, sb / px];
  return {
    id: basename(file, '.png'),
    mean,
    rg: mean[0] / Math.max(1, mean[1]),
    rb: mean[0] / Math.max(1, mean[2]),
    gb: mean[1] / Math.max(1, mean[2]),
    chroma: chroma / px / 255,
    pin: [pin(0), pin(1), pin(2)],
    near: [near(0), near(1), near(2)],
    floor: [floorC(0), floorC(1), floorC(2)],
    p99c: [pctC(0, 0.99), pctC(1, 0.99), pctC(2, 0.99)]
  };
}

/* --------------------------------------------------------------- main --- */

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const positional = argv.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['matrix', 'colour', 'color'].includes(argv[i - 1].slice(2))));

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 6, d = 3) => v.toFixed(d).padStart(n);
const pc = (v, n = 6, d = 2) => (v * 100).toFixed(d).padStart(n) + '%';

if (flag('matrix')) {
  await runMatrix();
} else {
  const dir = resolve(positional[0] || 'docs/shots');
  const only = positional.slice(1);
  const files = readdirSync(dir).filter(f => f.endsWith('.png'))
    .filter(f => !only.length || only.some(o => f.includes(o)))
    .sort();
  report(dir, files);
}

/* ======================================================================== *
 * --matrix — the mood-differentiation instrument
 * ------------------------------------------------------------------------
 * The whole-frame mean of a shot mixes the grade with the content: `31`
 * (a warm-skinned closeup) and `30` (the same activity, wide, with a cream
 * wardrobe filling 60% of frame) render under the *same* `day` preset and
 * measure R:G 1.75 and 1.34. Comparing two moods across two shots therefore
 * measures the framing at least as much as the light.
 *
 * `--matrix` removes the variable. One scene, one camera, one simulated
 * clock; only `state.timeOfDay` and `state.weather` change between captures.
 * Every difference in the resulting table is a difference in the lighting rig
 * and the grade, and nothing else — which is the only honest way to answer
 * "do the four moods read as four different times of day".
 *
 *   node tools/histo.mjs --matrix
 *   node tools/histo.mjs --matrix --scene sleep --camera crib --out docs/mx
 * ====================================================================== */
async function runMatrix() {
  const { chromium } = await import('playwright');
  const { createServer } = await import('node:http');
  const { readFile, mkdir } = await import('node:fs/promises');
  const { extname } = await import('node:path');

  const ROOT = resolve(new URL('..', import.meta.url).pathname);
  const OUT = resolve(ROOT, opt('out', 'docs/grade-matrix'));
  const SCENE = opt('scene', 'play');
  const CAMERA = opt('camera', 'wide');
  const W = parseInt(opt('w', '1440'), 10), H = parseInt(opt('h', '900'), 10);
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

  const { server, port } = await new Promise(res => {
    const s = createServer(async (req, rq) => {
      try {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p.endsWith('/')) p += 'index.html';
        const file = join(ROOT, p);
        if (!file.startsWith(ROOT)) { rq.writeHead(403).end(); return; }
        const body = await readFile(file);
        rq.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        rq.end(body);
      } catch { rq.writeHead(404).end('not found'); }
    });
    s.listen(0, '127.0.0.1', () => res({ server: s, port: s.address().port }));
  });

  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio']
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await mkdir(OUT, { recursive: true });

  const cells = [
    { id: 'day', timeOfDay: 'day', weather: 'clear' },
    { id: 'golden', timeOfDay: 'golden', weather: 'clear' },
    { id: 'evening', timeOfDay: 'evening', weather: 'clear' },
    { id: 'night', timeOfDay: 'night', weather: 'clear' },
    { id: 'day-rain', timeOfDay: 'day', weather: 'rain' },
    { id: 'golden-rain', timeOfDay: 'golden', weather: 'rain' }
  ];

  const files = [];
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html?harness=1&tier=2`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__GAME__ && window.__GAME__.ready === true, null, { timeout: 300000, polling: 200 });
    for (const c of cells) {
      process.stdout.write(`  ▸ ${c.id} … `);
      const t = Date.now();
      await page.evaluate(async (s) => {
        const G = window.__GAME__;
        await G.reset();
        await G.setScene(s.scene);
        await G.setCamera(s.camera);
        G.setHud(false);
        await G.setState({ weather: s.weather, timeOfDay: s.timeOfDay });
        await G.warm(3.2);
        await G.settle();
      }, { ...c, scene: SCENE, camera: CAMERA });
      const f = join(OUT, `${c.id}.png`);
      await page.screenshot({ path: f, animations: 'disabled', timeout: 180000 });
      files.push(`${c.id}.png`);
      console.log(`${((Date.now() - t) / 1000).toFixed(1)}s`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n=== grade matrix — scene "${SCENE}", camera "${CAMERA}", identical content in every row ===`);
  console.log(`\n${pad('mood', 14)} ${pad('p1', 6)} ${pad('p5', 6)} ${pad('med', 6)} ${pad('p95', 6)} ${pad('p99', 6)} ${pad('%<.15', 7)} ${pad('%>.95', 7)}  ${pad('R:G', 5)} ${pad('R:B', 5)} ${pad('chroma', 6)}  R=255   G=255   B=255   meanRGB`);
  console.log('-'.repeat(140));
  const out = [];
  for (const f of files) {
    const r = measure(join(OUT, f)), c = measureColour(join(OUT, f));
    out.push({ r, c });
    console.log(
      `${pad(basename(f, '.png'), 14)} ${num(r.p1)} ${num(r.p5)} ${num(r.med)} ${num(r.p95)} ${num(r.p99)} ` +
      `${pc(r.dark)} ${pc(r.bright)}  ${num(c.rg, 5, 2)} ${num(c.rb, 5, 2)} ${num(c.chroma, 6, 3)} ` +
      `${pc(c.pin[0])} ${pc(c.pin[1])} ${pc(c.pin[2])}  (${c.mean.map(v => Math.round(v)).join(',')})`);
  }
  console.log('-'.repeat(140));
  const clear = out.slice(0, 4);
  const rg = clear.map(o => o.c.rg), med = clear.map(o => o.r.med);
  console.log(`clear-weather separation:  R:G ${num(Math.min(...rg), 5, 2)}..${num(Math.max(...rg), 5, 2)} (spread ${num(Math.max(...rg) - Math.min(...rg), 5, 2)})` +
    `   median ${num(Math.min(...med), 5, 2)}..${num(Math.max(...med), 5, 2)} (spread ${num(Math.max(...med) - Math.min(...med), 5, 2)})`);
  // Adjacent-pair distance: four moods are only distinguishable if *every*
  // neighbouring pair differs, not merely the two extremes.
  for (let i = 1; i < clear.length; i++) {
    const a = clear[i - 1], b = clear[i];
    console.log(`  ${pad(basename(files[i - 1], '.png') + ' -> ' + basename(files[i], '.png'), 24)} ` +
      `ΔR:G ${num(b.c.rg - a.c.rg, 6, 3)}  Δmedian ${num(b.r.med - a.r.med, 6, 3)}  Δchroma ${num(b.c.chroma - a.c.chroma, 6, 3)}`);
  }
  console.log();
}

function loadShots() {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), 'tools/shots.json'), 'utf8'));
  } catch { return []; }
}

function report(dir, files) {
  const shots = loadShots();
  const rows = files.map(f => measure(join(dir, f)));
  const cols = files.map(f => measureColour(join(dir, f)));

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
  console.log(`${rows.length} frames, ${fails} failing (need >=0.05% above 0.95 or >=1.2% below 0.15, and <1% clipped above 0.995)`);

  /* --- colour / per-channel ------------------------------------------- */
  console.log(`\n${pad('frame', 22)} ${pad('mood', 13)} ${pad('R:G', 5)} ${pad('R:B', 5)} ${pad('G:B', 5)} ${pad('chroma', 6)}   R=255   G=255   B=255    R>=250  meanRGB`);
  console.log('-'.repeat(122));
  let clipFails = 0;
  for (const c of cols) {
    const worst = Math.max(...c.pin);
    if (worst > 0.005) clipFails++;
    console.log(
      `${pad(c.id, 22)} ${pad(moodOf(c.id, shots), 13)} ${num(c.rg, 5, 2)} ${num(c.rb, 5, 2)} ${num(c.gb, 5, 2)} ${num(c.chroma, 6, 3)}  ` +
      `${pc(c.pin[0])} ${pc(c.pin[1])} ${pc(c.pin[2])}  ${pc(c.near[0])}  (${c.mean.map(v => Math.round(v)).join(',')})` +
      (worst > 0.005 ? '  <-- CHANNEL CLIP' : ''));
  }
  console.log('-'.repeat(122));

  /* --- grouped by mood ------------------------------------------------- */
  const groups = new Map();
  for (const c of cols) {
    const m = moodOf(c.id, shots);
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(c);
  }
  const lum = new Map(rows.map(r => [r.id, r]));
  console.log(`\n${pad('mood', 14)} ${pad('n', 3)} ${pad('R:G', 6)} ${pad('R:B', 6)} ${pad('chroma', 7)} ${pad('med', 6)} ${pad('p1', 6)} ${pad('p99', 6)} ${pad('%<.15', 7)} ${pad('%>.95', 7)}   mean R:G spread`);
  console.log('-'.repeat(112));
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  for (const [m, list] of [...groups.entries()].sort()) {
    const rgs = list.map(c => c.rg);
    const l = list.map(c => lum.get(c.id));
    console.log(
      `${pad(m, 14)} ${pad(list.length, 3)} ${num(avg(rgs), 6, 3)} ${num(avg(list.map(c => c.rb)), 6, 3)} ` +
      `${num(avg(list.map(c => c.chroma)), 7, 3)} ${num(avg(l.map(r => r.med)))} ${num(avg(l.map(r => r.p1)))} ` +
      `${num(avg(l.map(r => r.p99)))} ${pc(avg(l.map(r => r.dark)))} ${pc(avg(l.map(r => r.bright)))}   ` +
      `${num(Math.min(...rgs), 5, 2)}..${num(Math.max(...rgs), 5, 2)}`);
  }
  console.log('-'.repeat(112));
  const ms = [...groups.entries()].filter(([m]) => !m.includes('+')).map(([, l]) => avg(l.map(c => c.rg)));
  if (ms.length > 1) {
    console.log(`mood R:G separation: min ${num(Math.min(...ms), 5, 2)}  max ${num(Math.max(...ms), 5, 2)}  ` +
      `spread ${num(Math.max(...ms) - Math.min(...ms), 5, 2)}   (CRITIQUE-03 P8: 12 frames within 0.2 of one another)`);
  }
  console.log(`${clipFails} frame(s) with a channel pinned at 255 over 0.5% of frame\n`);
}
