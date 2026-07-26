#!/usr/bin/env node
/* ============================================================================
 * contact-sheet.mjs — assemble a review sheet from a shot directory
 * ----------------------------------------------------------------------------
 * The critic reviews individual PNGs, but a contact sheet is what makes
 * *inconsistency* visible: a frame that is fine alone but clearly a different
 * game from the one next to it. Run after tools/shoot.mjs.
 *
 *   node tools/contact-sheet.mjs --in docs/shots --out docs/shots/_sheet.png
 * ========================================================================== */

import { chromium } from 'playwright';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const IN = resolve(ROOT, arg('in', 'docs/shots'));
const OUT = resolve(ROOT, arg('out', 'docs/shots/_sheet.png'));
const COLS = parseInt(arg('cols', '3'), 10);

const files = (await readdir(IN))
  .filter(f => f.endsWith('.png') && !f.startsWith('_'))
  .sort();

if (!files.length) {
  console.error('no PNGs in ' + IN);
  process.exit(1);
}

const cells = await Promise.all(files.map(async (f) => ({
  name: basename(f, '.png'),
  data: 'data:image/png;base64,' + (await readFile(join(IN, f))).toString('base64')
})));

const html = `<!doctype html><meta charset="utf-8">
<style>
  body { margin:0; background:#16121a; font:13px/1.4 -apple-system,system-ui,sans-serif; color:#cfc6d6; }
  .grid { display:grid; grid-template-columns:repeat(${COLS}, 1fr); gap:10px; padding:10px; }
  figure { margin:0; }
  img { width:100%; display:block; border-radius:6px; }
  figcaption { padding:5px 2px 0; font-size:12px; color:#9d94a8; }
</style>
<div class="grid">
${cells.map(c => `<figure><img src="${c.data}"><figcaption>${c.name}</figcaption></figure>`).join('\n')}
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: COLS * 520, height: 800 } });
await page.setContent(html, { waitUntil: 'load' });
await page.locator('.grid').screenshot({ path: OUT });
await browser.close();

console.log(`contact sheet → ${OUT} (${cells.length} frames)`);
