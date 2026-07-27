#!/usr/bin/env node
/* ============================================================================
 * leakcheck.mjs — activity build/dispose leak detector
 * ----------------------------------------------------------------------------
 * Cycles every activity N times and prints renderer.info + scene-graph node
 * counts after each one. A correct dispose() returns every number to the value
 * it had before the activity was built; anything that climbs monotonically
 * across cycles is a leak.
 *
 *   node tools/leakcheck.mjs                 # 3 cycles of all five
 *   node tools/leakcheck.mjs --cycles 4
 *   node tools/leakcheck.mjs --only play,sleep
 * ========================================================================== */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
}
const CYCLES = parseInt(arg('cycles', '3'), 10);
const ONLY = arg('only', '') ? arg('only', '').split(',').map(s => s.trim()) : null;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm'
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
      } catch { rq.writeHead(404).end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}

const { server, port } = await serve(ROOT);
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio']
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errs = [];
page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('[error] ' + m.text()); });

try {
  await page.goto(`http://127.0.0.1:${port}/index.html?harness=1&tier=2`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000, polling: 200 });

  const rows = await page.evaluate(async ({ cycles, only }) => {
    const G = window.__GAME__;
    const app = G.app;
    const names = (only || ['feed', 'bath', 'dress', 'play', 'sleep']);

    const snap = () => {
      let nodes = 0;
      app.scene.traverse(() => nodes++);
      app.pipeline.render(1 / 60);
      const i = app.renderer.info;
      return {
        calls: i.render.calls, tris: i.render.triangles,
        geo: i.memory.geometries, tex: i.memory.textures,
        prog: app.renderer.info.programs?.length ?? 0, nodes
      };
    };

    // Tear down whatever the boot left running so the baseline is "room only".
    if (app.activity) {
      await app.activity.exit?.();
      app.activity.dispose?.();
      app.activity = null;
      app.activityName = '';
    }
    for (let i = 0; i < 30; i++) app.step(1 / 60);
    const base = snap();

    const out = [];
    for (let c = 0; c < cycles; c++) {
      for (const n of names) {
        await app.setActivity(n);
        for (let i = 0; i < 60; i++) app.step(1 / 60);
        const built = snap();
        await app.activity.exit?.();
        app.activity.dispose?.();
        app.activity = null;
        app.activityName = '';
        app._auditDispose?.();          // same census setActivity() would file
        for (let i = 0; i < 30; i++) app.step(1 / 60);
        const after = snap();
        out.push({ cycle: c + 1, name: n, built, after });
      }
    }
    return { base, out, leakLog: (app.leakLog || []).slice() };
  }, { cycles: CYCLES, only: ONLY });

  const f = (v, w = 7) => String(v).padStart(w);
  console.log('\nbaseline (room + baby, no activity):');
  console.log(`  calls=${rows.base.calls} tris=${rows.base.tris} geo=${rows.base.geo} tex=${rows.base.tex} nodes=${rows.base.nodes}`);
  console.log('\n cyc activity |    built: calls    tris   geo   tex  nodes |  after dispose: calls    tris   geo   tex  nodes | delta vs baseline');
  for (const r of rows.out) {
    const d = {
      calls: r.after.calls - rows.base.calls, geo: r.after.geo - rows.base.geo,
      tex: r.after.tex - rows.base.tex, nodes: r.after.nodes - rows.base.nodes
    };
    console.log(
      `  ${r.cycle}  ${r.name.padEnd(6)} |${f(r.built.calls, 10)}${f(r.built.tris, 8)}${f(r.built.geo, 6)}${f(r.built.tex, 6)}${f(r.built.nodes, 7)} |` +
      `${f(r.after.calls, 16)}${f(r.after.tris, 8)}${f(r.after.geo, 6)}${f(r.after.tex, 6)}${f(r.after.nodes, 7)} |` +
      `  calls${d.calls >= 0 ? '+' : ''}${d.calls} geo${d.geo >= 0 ? '+' : ''}${d.geo} tex${d.tex >= 0 ? '+' : ''}${d.tex} nodes${d.nodes >= 0 ? '+' : ''}${d.nodes}`);
  }
  const peak = Math.max(...rows.out.map(r => r.built.calls));
  console.log(`\n  peak draw calls while an activity is live: ${peak}  (contract: < 180)`);

  // app.setActivity's own build/dispose census — the in-engine version of the
  // table above, and the thing that warns in the console when it goes wrong.
  const bad = (rows.leakLog || []).filter(l => l.nodes !== 0);
  console.log(`\n  app.leakLog: ${rows.leakLog.length} build/dispose pairs recorded, ` +
    `${bad.length} with a non-zero scene-node delta`);
  for (const l of bad.slice(0, 10)) console.log(`    LEAK ${l.activity}: nodes+${l.nodes}`);
} catch (e) {
  console.error('LEAKCHECK FAILURE:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error('\n  console:'); for (const e of errs.slice(0, 20)) console.error('   ' + e); }
  await browser.close();
  server.close();
}
