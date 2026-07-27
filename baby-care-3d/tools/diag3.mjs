#!/usr/bin/env node
/* Where does the sleeping baby land on screen, and what occludes it? */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
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
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', e => console.error('[pageerror]', e.message));
try {
  await page.goto(`http://127.0.0.1:${port}/index.html?harness=1&tier=2`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000, polling: 200 });
  const out = await page.evaluate(async () => {
    const G = window.__GAME__, app = G.app;
    await G.reset();
    await G.setScene('sleep');
    await G.setState({ asleep: true, lamp: true });
    await G.setCamera('face');
    await G.warm(5.0);
    const cam = app.camera;
    const V = cam.position.constructor;      // THREE.Vector3
    const babyMeshes = [];
    app.baby.group.traverse(o => { if (o.isMesh && o.visible) babyMeshes.push(o); });

    // 1. project a few baby points into NDC
    const pts = {};
    const add = (k, v) => { const p = v.clone().project(cam); pts[k] = { ndc: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)], world: v.toArray().map(n => +n.toFixed(3)) }; };
    add('headWorldPos', app.baby.headWorldPos());
    add('chest', app.baby.focusPoint());
    const hb = app.baby.bone?.('head'); if (hb) add('headBone', hb.getWorldPosition(new V()));
    add('camTarget', app.cameraRig.target.clone());

    // 2. what does a ray from the camera to the head hit first?
    const R = app.activity._ray.constructor;   // THREE.Raycaster
    const rc = new R();
    const target = app.baby.headWorldPos();
    rc.set(cam.position, target.clone().sub(cam.position).normalize());
    rc.far = 5;
    const hits = rc.intersectObject(app.scene, true).slice(0, 8).map(h => {
      let path = [], n = h.object;
      while (n && n !== app.scene) { path.push(n.name || n.type); n = n.parent; }
      return { d: +h.distance.toFixed(3), obj: path.reverse().join('/') };
    });

    // 3. sanity: is the room's own crib prop still visible on top of ours?
    const anchor = app.room.anchor('crib');
    let anchorMeshes = 0, anchorVisible = 0;
    anchor.traverse(o => { if (o.isMesh) { anchorMeshes++; if (o.visible) anchorVisible++; } });

    return {
      cam: cam.position.toArray().map(n => +n.toFixed(3)),
      camTarget: app.cameraRig.target.toArray().map(n => +n.toFixed(3)),
      fov: cam.fov, preset: app.cameraRig.presetName,
      babyMeshCount: babyMeshes.length,
      pts, hits, anchorMeshes, anchorVisible
    };
  });
  console.log(JSON.stringify(out, null, 2));
} finally { await browser.close(); server.close(); }
