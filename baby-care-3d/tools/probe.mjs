#!/usr/bin/env node
/* Quick draw-call breakdown probe. node tools/probe.mjs [activity] */
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
const ACT = process.argv[2] || 'play';
const CAM = process.argv[3] || null;
try {
  await page.goto(`http://127.0.0.1:${port}/index.html?harness=1&tier=2`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000, polling: 200 });
  const out = await page.evaluate(async ({ act, cam }) => {
    const G = window.__GAME__, app = G.app;
    await app.setActivity(act);
    if (cam) app.cameraRig.goTo(cam, 0);
    for (let i = 0; i < 120; i++) app.step(1 / 60);

    const r = app.renderer, THREE = window.__THREE__;
    // 1. plain forward render, no composer
    r.info.autoReset = true;
    r.setRenderTarget(null);
    r.render(app.scene, app.camera);
    const plain = { calls: r.info.render.calls, tris: r.info.render.triangles };
    r.info.autoReset = false;
    r.info.reset();
    app.pipeline.render(1 / 60);
    const full = { calls: r.info.render.calls, tris: r.info.render.triangles };

    // 2. per-owner mesh census (visible, in the scene graph)
    const census = {};
    const roots = [];
    for (const c of app.scene.children) roots.push(c);
    const label = (o) => {
      let n = o, path = [];
      while (n && n !== app.scene) { path.push(n.name || n.type); n = n.parent; }
      return path.reverse()[0] || '?';
    };
    let visibleMeshes = 0, casters = 0;
    app.scene.traverse(o => {
      if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
      let vis = o.visible, p = o.parent;
      while (vis && p) { vis = p.visible; p = p.parent; }
      if (!vis) return;
      visibleMeshes += o.isInstancedMesh ? 1 : 1;
      if (o.castShadow) casters++;
      const k = label(o) + (o.isInstancedMesh ? ' [inst]' : '');
      census[k] = (census[k] || 0) + 1;
    });
    const lights = [];
    app.scene.traverse(o => { if (o.isLight) lights.push({ type: o.type, shadow: !!o.castShadow, name: o.name }); });
    return { plain, full, visibleMeshes, casters, census, lights, sceneChildren: app.scene.children.map(c => c.name || c.type) };
  }, { act: ACT, cam: CAM });
  console.log(JSON.stringify(out, null, 2));
} finally { await browser.close(); server.close(); }
