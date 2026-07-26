#!/usr/bin/env node
/* Dump sleep-scene geometry + play block states. node tools/diag.mjs */
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
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', e => console.error('[pageerror]', e.message));
try {
  await page.goto(`http://127.0.0.1:${port}/index.html?harness=1&tier=2`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000, polling: 200 });
  const out = await page.evaluate(async () => {
    const G = window.__GAME__, app = G.app;
    const r = v => v ? [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)] : null;
    // Hand-rolled world AABB: no THREE import available inside the page.
    const box = (root) => {
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      root.updateWorldMatrix(true, true);
      root.traverse(o => {
        if (!o.isMesh || !o.visible || !o.geometry) return;
        const g = o.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox, e = o.matrixWorld.elements;
        for (let i = 0; i < 8; i++) {
          const x = (i & 1 ? b.max.x : b.min.x), y = (i & 2 ? b.max.y : b.min.y), z = (i & 4 ? b.max.z : b.min.z);
          const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
          const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
          const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
          mn[0] = Math.min(mn[0], wx); mx[0] = Math.max(mx[0], wx);
          mn[1] = Math.min(mn[1], wy); mx[1] = Math.max(mx[1], wy);
          mn[2] = Math.min(mn[2], wz); mx[2] = Math.max(mx[2], wz);
        }
      });
      return { min: mn.map(v => +v.toFixed(3)), max: mx.map(v => +v.toFixed(3)) };
    };
    const res = {};

    /* ---- sleep ---- */
    await G.reset();
    await G.setScene('sleep');
    await G.setState({ asleep: true, lamp: true });
    await G.setCamera('face');
    await G.warm(5.0);
    const a = app.activity;
    res.sleep = {
      cribPos: r(a.cribPos), surfaceY: +a.surfaceY.toFixed(3),
      babyRoot: r(app.baby.group.position), babyYaw: +app.baby.group.rotation.y.toFixed(3),
      head: r(app.baby.headWorldPos?.()),
      chest: r(app.baby.focusPoint?.()),
      pivot: r(a.shotPivot?.position), pivotYaw: a.shotPivot ? +a.shotPivot.rotation.y.toFixed(3) : null,
      camPos: r(app.camera.position), camTarget: r(app.cameraRig.target),
      preset: app.cameraRig.presetName,
      subject: app.cameraRig.activeSubject?.name || null,
      cribBox: box(a.crib.group),
      quiltBox: a.quiltMesh ? box(a.quiltMesh) : null,
      babyBox: box(app.baby.group)
    };

    /* ---- play blocks ---- */
    await G.reset();
    await G.setScene('play');
    await G.setState({ toy: 'blocks', stack: 5 });
    await G.warm(4.0);
    const p = app.activity;
    res.play = {
      towerHeight: p.towerHeight,
      states: p.blocks.map(b => b.state),
      levels: p.blocks.map(b => b.level),
      towerBase: r(p.towerBase), home: r(p.home),
      babyRoot: r(app.baby.group.position),
      blockY: p.blocks.map(b => +b.mesh.position.y.toFixed(3)),
      visible: p.blocks.map(b => b.mesh.visible)
    };
    return res;
  });
  console.log(JSON.stringify(out, null, 2));
} finally { await browser.close(); server.close(); }
