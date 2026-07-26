import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const ROOT = '/home/user/260725/baby-care-3d';
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json' };
const server = createServer(async (req,res)=>{
  try { const p = decodeURIComponent(req.url.split('?')[0]); const f = join(ROOT,p);
    const b = await readFile(f); res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); res.end(b);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port = server.address().port;
const browser = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--mute-audio'] });
const page = await browser.newPage({ viewport:{width:800,height:500} });
const msgs = [];
page.on('console', m => msgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => msgs.push(`[pageerror] ${e.message}\n${e.stack||''}`));
page.on('console', m => console.log('> '+m.text()));
await page.goto(`http://127.0.0.1:${port}/__roomtest2.html`, { waitUntil:'commit', timeout: 60000 });
try { await page.waitForFunction(()=>window.__RESULT__ && (window.__RESULT__.ok || window.__RESULT__.log.some(l=>l.startsWith('ERROR'))), null, {timeout:540000, polling:1000}); } catch(e) { console.log('WAIT TIMEOUT'); }
const res = await page.evaluate(()=>window.__RESULT__);
console.log('--- log ---'); console.log(res.log.join('\n'));
console.log('--- console ---'); console.log(msgs.slice(0,40).join('\n'));
await browser.close(); server.close();
