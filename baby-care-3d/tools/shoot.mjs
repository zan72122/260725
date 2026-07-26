#!/usr/bin/env node
/* ============================================================================
 * shoot.mjs — headless screenshot harness
 * ----------------------------------------------------------------------------
 * Boots the game in headless Chromium (WebGL via SwiftShader), drives it
 * through `window.__GAME__`, and writes deterministic PNGs.
 *
 *   node tools/shoot.mjs                       # every shot in shots.json
 *   node tools/shoot.mjs --only bath,sleep     # a subset
 *   node tools/shoot.mjs --out docs/review     # custom output dir
 *   node tools/shoot.mjs --w 1600 --h 1000     # custom viewport
 *
 * Every shot advances a *fixed* simulated clock, so a given commit always
 * produces byte-comparable frames — that is what makes the critic loop able to
 * say "this got better" rather than "this is different".
 * ========================================================================== */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/* ------------------------------------------------------------- args ------ */

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
}
const flag = (name) => argv.includes('--' + name);

const OUT = resolve(ROOT, arg('out', 'docs/shots'));
const WIDTH = parseInt(arg('w', '1440'), 10);
const HEIGHT = parseInt(arg('h', '900'), 10);
const ONLY = arg('only', '') ? arg('only', '').split(',').map(s => s.trim()) : null;
const TIMEOUT = parseInt(arg('timeout', '120000'), 10);
const VERBOSE = flag('verbose');

/* ------------------------------------------------------- static server --- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

function serve(root) {
  return new Promise((res) => {
    const server = createServer(async (req, rq) => {
      try {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p.endsWith('/')) p += 'index.html';
        const file = join(root, p);
        if (!file.startsWith(root)) { rq.writeHead(403).end(); return; }
        const body = await readFile(file);
        rq.writeHead(200, {
          'Content-Type': MIME[extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        rq.end(body);
      } catch {
        rq.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}

/* --------------------------------------------------------------- shots --- */

/**
 * Shot list. Each entry drives the game through its debug API.
 *   scene   — activity to open
 *   state   — arbitrary state patch handed to __GAME__.setState
 *   warm    — simulated seconds to run before capturing
 *   camera  — named camera preset, or an explicit {pos,target,fov}
 *   hud     — keep the DOM HUD visible (default true)
 */
async function loadShots() {
  const f = join(ROOT, 'tools/shots.json');
  if (existsSync(f)) return JSON.parse(await readFile(f, 'utf8'));
  return [{ id: '00-default', scene: 'play', warm: 2 }];
}

/* ---------------------------------------------------------------- main --- */

const t0 = Date.now();
const { server, port } = await serve(ROOT);
const base = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-lcd-text',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    '--hide-scrollbars',
    '--mute-audio'
  ]
});

const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1
});

const consoleErrors = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') consoleErrors.push(`[${t}] ${m.text()}`);
  if (VERBOSE) console.log(`  · console.${t}: ${m.text()}`);
});
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}\n${e.stack || ''}`));

await mkdir(OUT, { recursive: true });

let failed = false;
try {
  await page.goto(base + 'index.html?harness=1&tier=2', {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT
  });

  await page.waitForFunction(
    () => window.__GAME__ && window.__GAME__.ready === true,
    null,
    { timeout: TIMEOUT, polling: 200 }
  );

  const shots = await loadShots();
  const list = ONLY
    ? shots.filter(s => ONLY.some(o => s.id.includes(o) || s.scene === o || (s.tags || []).includes(o)))
    : shots;

  if (!list.length) {
    console.error(`no shots matched --only ${ONLY?.join(',')}`);
    process.exitCode = 1;
  }

  const manifest = [];
  for (const shot of list) {
    const label = shot.id;
    process.stdout.write(`  ▸ ${label} … `);
    const started = Date.now();

    await page.evaluate(async (s) => {
      const G = window.__GAME__;
      await G.reset();
      if (s.scene) await G.setScene(s.scene);
      if (s.state) await G.setState(s.state);
      if (s.camera) await G.setCamera(s.camera);
      if (s.hud === false) G.setHud(false); else G.setHud(true);
      await G.warm(s.warm ?? 2.0);
      await G.settle();
    }, shot);

    const file = join(OUT, `${label}.png`);
    await page.screenshot({ path: file, animations: 'disabled' });
    manifest.push({ id: label, file: `${label}.png`, scene: shot.scene, note: shot.note || '' });
    console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const stats = await page.evaluate(() => window.__GAME__.stats());
  console.log(`\n  render stats: ${JSON.stringify(stats)}`);
} catch (err) {
  failed = true;
  console.error('\nHARNESS FAILURE:', err.message);
} finally {
  if (consoleErrors.length) {
    console.error(`\n  ${consoleErrors.length} console error(s)/warning(s):`);
    for (const e of consoleErrors.slice(0, 25)) console.error('   ' + e);
    await writeFile(join(OUT, 'console.log'), consoleErrors.join('\n'));
  }
  await browser.close();
  server.close();
}

console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${OUT}`);
if (failed || consoleErrors.some(e => e.startsWith('[pageerror]'))) process.exit(1);
