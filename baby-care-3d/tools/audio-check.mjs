/* Verification harness for src/engine/{synth,audio,music}.js
 *
 * Loads the real modules in headless Chromium and renders every named sound
 * through an OfflineAudioContext, so we check actual DSP output — not just
 * that the code parses. Reports peak/RMS per sound, verifies nothing clips,
 * nothing is silent, mute works, panning works, the graph self-cleans, and
 * the music scheduler emits a sane, evenly-spaced event list.
 *
 *   node tools/audio-check.mjs [--json]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HERE = path.dirname(new URL(import.meta.url).pathname);

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const file = p === '/' || p === '/index.html'
    ? path.join(HERE, 'audio-check.html')
    : path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nope: ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox']
});
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('  [page error]', m.text()); });
page.on('pageerror', e => console.log('  [pageerror]', e.message));

await page.goto(`http://127.0.0.1:${port}/`);
const out = await page.evaluate(() => window.__run());

await browser.close();
server.close();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.fail ? 1 : 0);
}

/* ------------------------------------------------------------- report --- */
const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 4) => (v == null ? '  --  ' : v.toFixed(n));

console.log('\n=== SFX render check (OfflineAudioContext, 44.1 kHz stereo) ===');
console.log(pad('name', 24), pad('peak', 8), pad('rms', 8), pad('dur', 7), pad('nodes', 6), 'status');
console.log('-'.repeat(72));
for (const s of out.sfx) {
  console.log(pad(s.name, 24), pad(num(s.peak), 8), pad(num(s.rms), 8),
    pad(num(s.audibleFor, 2) + 's', 7), pad(s.leaked === 0 ? 'clean' : 'LEAK' + s.leaked, 6), s.status);
}

console.log('\n=== sustained loops ===');
for (const s of out.loops) {
  console.log(pad(s.name, 24), pad(num(s.peak), 8), pad(num(s.rms), 8), s.status);
}

console.log('\n=== music ===');
for (const t of out.music) {
  console.log(`\n${t.name}  "${t.title}"  ${t.bpm}bpm ${t.bpb}/4 ${t.bars} bars`);
  console.log('  compiled events:', t.eventCount, '| per layer:',
    Object.entries(t.byLayer).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('  voices rendered in 8s:', t.scheduled, '|',
    Object.entries(t.renderedLayers).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('  first 8 =',
    t.first.map(e => `${e.t.toFixed(2)}s ${e.layer}/${e.inst}${e.midi != null ? '@' + e.midi : ''}`).join(' | '));
  console.log(`  scheduler: ${t.beats} beats over ${t.loopsCovered} loops | dt ${num(t.dtMin, 5)}..${num(t.dtMax, 5)}s`,
    '| grid', t.gridOk, '| bar/beat sequence', t.seqOk, '| monotonic', t.monotonic, '| seamless', t.loopSeam);
  console.log('  audio: peak', num(t.peak), 'rms', num(t.rms));
  console.log('  layer mix awake :', JSON.stringify(t.moodBefore));
  console.log('  layer mix sleepy:', JSON.stringify(t.moodAfter));
}

console.log('\n=== behaviour ===');
for (const c of out.checks) console.log(' ', c.ok ? 'PASS' : 'FAIL', '-', c.name, c.detail ? `(${c.detail})` : '');

console.log('\n' + (out.fail
  ? `RESULT: ${out.fail} FAILURE(S)`
  : `RESULT: all ${out.sfx.length} sounds + ${out.loops.length} loops + ${out.music.length} tracks OK`));
console.log(`peak across everything: ${num(out.globalPeak)} (must be < 1.0)`);
process.exit(out.fail ? 1 : 0);
