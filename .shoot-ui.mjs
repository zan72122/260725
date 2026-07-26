import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = '/home/user/260725/baby-care-3d';
const OUT = '/tmp/claude-0/-home-user-260725/5dcd6176-9338-5e88-b0eb-12b4cee9c722/scratchpad/shots';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

const { port } = await new Promise((res) => {
  const s = createServer(async (req, rq) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = join(ROOT, p);
      const body = await readFile(f);
      rq.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      rq.end(body);
    } catch (e) { rq.writeHead(404).end('404 ' + req.url); }
  });
  s.listen(0, '127.0.0.1', () => res({ server: s, port: s.address().port }));
});

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-color-profile=srgb'] });

const errors = [];
const shots = [
  { id: 'title-landscape', w: 1440, h: 900, act: async () => {} },
  { id: 'title-portrait', w: 820, h: 1180, act: async () => {} },
  { id: 'hud-landscape', w: 1440, h: 900, act: async (page) => { await page.evaluate(() => window.__UI__.startGame()); } },
  { id: 'hud-portrait', w: 820, h: 1180, act: async (page) => { await page.evaluate(() => window.__UI__.startGame()); } },
  { id: 'hud-phone-landscape', w: 844, h: 390, act: async (page) => { await page.evaluate(() => window.__UI__.startGame()); } },
  { id: 'hud-phone-portrait', w: 390, h: 844, act: async (page) => { await page.evaluate(() => window.__UI__.startGame()); } },
  {
    id: 'hud-low-prompt', w: 1440, h: 900, act: async (page) => {
      await page.evaluate(async () => {
        const ui = window.__UI__;
        ui.startGame();
        ui.setActivity('feed');
        ui.meter('food', 0.14); ui.meter('clean', 0.55); ui.meter('happy', 0.82); ui.meter('energy', 0.28);
        ui.prompt('ほにゅうびんを タップしてね', { icon: 'bottle' });
        ui.toast('じょうず！', { icon: 'check', seconds: 8 });
        ui.worldLabel(window.__BABY__, 'ここをタップ', { icon: 'arrowDown', offset: [0, 0.3, 0] });
        ui.setTools([{ id: 'bottle', icon: 'bottle' }, { id: 'apple', icon: 'apple' }, { id: 'heart', icon: 'heart', selected: true }], () => {});
      });
    }
  },
  {
    id: 'album', w: 1440, h: 900, act: async (page) => {
      await page.evaluate(() => {
        const ui = window.__UI__;
        ui.startGame();
        for (let i = 0; i < 7; i++) ui.state.unlockSticker(i);
        ui.openAlbum();
      });
    }
  },
  {
    id: 'album-portrait', w: 820, h: 1180, act: async (page) => {
      await page.evaluate(() => {
        const ui = window.__UI__;
        ui.startGame();
        for (let i = 0; i < 16; i++) ui.state.unlockSticker(i);
        ui.openAlbum();
      });
    }
  },
  {
    id: 'night-mood', w: 1440, h: 900, act: async (page) => {
      await page.evaluate(() => {
        const ui = window.__UI__;
        ui.startGame(); ui.setActivity('sleep');
        ui.prompt('とんとん してあげよう', { icon: 'moon' });
      });
    }
  }
];

for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(`[${shot.id}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${shot.id}] console: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/.uitest.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__UI__, null, { timeout: 20000 });
  await shot.act(page);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(OUT, shot.id + '.png') });
  await page.close();
  console.log('shot', shot.id);
}

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
process.exit(0);
