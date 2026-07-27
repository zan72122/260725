#!/usr/bin/env node
/* Why is the baby not rendering in the sleep scene? node tools/diag2.mjs */
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
    const dump = (tag) => {
      const rows = [];
      app.baby.group.traverse(o => {
        if (!o.isMesh) return;
        const m = o.matrixWorld.elements;
        rows.push({
          name: o.name || o.type, visible: o.visible,
          parentVisible: (() => { let p = o.parent, v = true; while (p) { v = v && p.visible; p = p.parent; } return v; })(),
          wpos: [+m[12].toFixed(3), +m[13].toFixed(3), +m[14].toFixed(3)],
          scale: [+o.scale.x.toFixed(3), +o.scale.y.toFixed(3), +o.scale.z.toFixed(3)],
          frustumCulled: o.frustumCulled,
          skinned: !!o.isSkinnedMesh,
          nanMatrix: m.some(v => !Number.isFinite(v)),
          drawRange: o.geometry?.drawRange?.count,
          posNaN: (() => {
            const a = o.geometry?.attributes?.position; if (!a) return 'no-attr';
            for (let i = 0; i < Math.min(a.count * 3, 300); i++) if (!Number.isFinite(a.array[i])) return true;
            return false;
          })(),
          matVisible: Array.isArray(o.material) ? o.material.map(x => x.visible) : o.material?.visible,
          opacity: Array.isArray(o.material) ? null : o.material?.opacity
        });
      });
      return { tag, groupVisible: app.baby.group.visible, groupPos: app.baby.group.position.toArray().map(v => +v.toFixed(3)), rows: rows.slice(0, 12), count: rows.length };
    };

    const res = {};
    await G.reset();
    await G.setScene('play');
    await G.warm(2.0);
    res.play = dump('play');

    await G.reset();
    await G.setScene('sleep');
    await G.setState({ asleep: true, lamp: true });
    await G.warm(5.0);
    res.sleep = dump('sleep');
    res.sleepBones = (() => {
      const out = {};
      for (const n of ['head', 'hips', 'spine', 'chest']) {
        try { const b = app.baby.bone?.(n); if (b) out[n] = b.getWorldPosition(new b.position.constructor()).toArray().map(v => +v.toFixed(3)); } catch (e) { out[n] = 'err'; }
      }
      return out;
    })();
    return res;
  });
  console.log(JSON.stringify(out, null, 2));
} finally { await browser.close(); server.close(); }
