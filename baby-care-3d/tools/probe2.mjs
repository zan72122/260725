#!/usr/bin/env node
/* Ad-hoc scene probe. node tools/probe2.mjs <shotId> <exprFile> */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const { server, port } = await new Promise((res) => {
  const s = createServer(async (req, rq) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = join(ROOT, p); const b = await readFile(f);
      rq.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); rq.end(b);
    } catch { rq.writeHead(404).end(); }
  });
  s.listen(0, '127.0.0.1', () => res({ server: s, port: s.address().port }));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', e => console.error('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text()); });
const SHOT = process.argv[2];
const EXPR = await readFile(process.argv[3], 'utf8');
try {
  await page.goto(`http://127.0.0.1:${port}/index.html?harness=1&tier=2`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000, polling: 200 });
  const shots = JSON.parse(await readFile(join(ROOT, 'tools/shots.json'), 'utf8'));
  const shot = shots.find(s => s.id === SHOT);
  const allShots = shots;
  const out = await page.evaluate(async ({ s, code, allShots }) => {
    const G = window.__GAME__;
    window.__SHOTS__ = allShots;
    window.__PX__ = (new URLSearchParams(location.search).get('px')||'').split(',').map(Number).filter(n=>!isNaN(n));
    if (!window.__PX__.length) window.__PX__ = null;
    if (s) {
      await G.reset();
      if (s.scene) await G.setScene(s.scene);
      if (s.state) await G.setState(s.state);
      if (s.camera) await G.setCamera(s.camera);
      G.setHud(s.hud !== false);
      await G.warm(s.warm ?? 2.0);
      await G.settle();
    }
    const THREE = await import('/vendor/three/three.module.js');
    const fn = new Function('G', 'app', 'THREE', 'return (async () => {' + code + '})()');
    return await fn(G, G.app, THREE);
  }, { s: shot, code: EXPR, allShots });
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
} finally { await browser.close(); server.close(); }
