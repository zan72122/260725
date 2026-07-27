#!/usr/bin/env node
/* Framing diagnostic: dumps camera pos/target and the screen-space box of key
 * objects for a given scene+camera. node tools/framecheck.mjs feed table */
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('[pageerror]', e.message));
const ACT = process.argv[2] || 'feed';
const CAM = process.argv[3] || 'table';
const STATE = process.argv[4] && process.argv[4] !== '-' ? JSON.parse(process.argv[4]) : null;
const WANT = process.argv[5] || '';
try {
  await page.goto(`http://127.0.0.1:${port}/index.html?harness=1&tier=2`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000, polling: 200 });
  const out = await page.evaluate(async ({ act, cam, state, want }) => {
    if (want) window.__WANT__ = want;
    const G = window.__GAME__, app = G.app;
    await G.reset();
    await G.setScene(act);
    if (state) await G.setState(state);
    await G.setCamera(cam.startsWith('{') ? JSON.parse(cam) : cam);
    for (let i = 0; i < 90; i++) app.step(1 / 60);
    const THREE = await import('/vendor/three/three.module.js');
    const cm = app.camera;
    cm.updateMatrixWorld(true);
    const W = 1440, H = 900;
    const proj = (v) => { const p = v.clone().project(cm); return { x: (p.x * .5 + .5) * W, y: (-p.y * .5 + .5) * H, z: p.z }; };
    const box = (o) => {
      if (!o) return null;
      const b = new THREE.Box3().setFromObject(o);
      if (!isFinite(b.min.x) || b.isEmpty()) return null;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, anyFront = false;
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
        const p = proj(v);
        if (p.z < 1) anyFront = true;
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      return { world: [b.min.toArray().map(n => +n.toFixed(3)), b.max.toArray().map(n => +n.toFixed(3))], screen: [x0 | 0, y0 | 0, x1 | 0, y1 | 0], front: anyFront };
    };
    const named = {};
    const wanted = (window.__WANT__ || 'highchair,tray,bib,bottle,apple,banana,balloon,crib,cribRail').split(',');
    app.scene.traverse(o => {
      if (!o.name) return;
      for (const w of wanted) {
        if (o.name === w || (w.endsWith('*') && o.name.startsWith(w.slice(0, -1)))) {
          if (!named[o.name]) named[o.name] = box(o);
        }
      }
    });
    // baby head
    let head = null;
    try { const bn = app.baby?.bone?.('head'); if (bn) head = proj(bn.getWorldPosition(new THREE.Vector3())); } catch (e) { }
    // raycast from camera to head
    let hits = [];
    try {
      const bn = app.baby?.bone?.('head');
      if (bn) {
        const hp = bn.getWorldPosition(new THREE.Vector3());
        const dir = hp.clone().sub(cm.position).normalize();
        const rc = new THREE.Raycaster(cm.position, dir, 0.01, hp.distanceTo(cm.position) - 0.02);
        const objs = [];
        app.scene.traverse(o => { if (o.isMesh && o.visible && !/hit$/.test(o.name)) objs.push(o); });
        hits = rc.intersectObjects(objs, false).slice(0, 6).map(h => ({ n: h.object.name || h.object.parent?.name || h.object.type, d: +h.distance.toFixed(3) }));
      }
    } catch (e) { hits = ['err ' + e.message]; }
    // prompt text
    const promptEl = document.getElementById('prompt-text');
    const trayBtns = document.querySelectorAll('#ctx-tray .ctx-btn').length;
    return {
      cam: { pos: cm.position.toArray().map(n => +n.toFixed(3)), fov: cm.fov },
      rig: { preset: app.cameraRig.presetName, target: app.cameraRig.target.toArray().map(n => +n.toFixed(3)), subject: app.cameraRig.activeSubject?.name || null, subjectPos: app.cameraRig.activeSubject ? app.cameraRig.activeSubject.getWorldPosition(new THREE.Vector3()).toArray().map(n => +n.toFixed(3)) : null },
      babyGroup: app.baby?.group?.position?.toArray?.().map(n => +n.toFixed(3)),
      headScreen: head ? { x: head.x | 0, y: head.y | 0 } : null,
      headWorld: (()=>{ try { const b=app.baby?.bone?.('head'); return b? b.getWorldPosition(new THREE.Vector3()).toArray().map(n=>+n.toFixed(3)) : null; } catch(e){ return null; } })(),
      occluders: hits,
      named,
      prompt: promptEl?.textContent, trayBtns
    };
  }, { act: ACT, cam: CAM, state: STATE, want: WANT });
  console.log(JSON.stringify(out, null, 2));
} finally { await browser.close(); server.close(); }
