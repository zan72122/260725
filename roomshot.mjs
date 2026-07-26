import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const ROOT = '/home/user/260725/baby-care-3d';
const MIME = { '.html':'text/html','.js':'text/javascript' };
const server = createServer(async (req,res)=>{
  try { const f = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    const b = await readFile(f); res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'}); res.end(b);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port = server.address().port;
const browser = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--mute-audio'] });
const page = await browser.newPage({ viewport:{width:980,height:640} });
page.on('pageerror', e => console.log('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/__roomshot.html`, { waitUntil:'commit' });
await page.waitForFunction(()=>window.__READY__ === true, null, {timeout:300000, polling:500});
const err = await page.evaluate(()=>window.__ERR__); if (err) console.log('BUILD ERROR ' + err);
const shots = [
  ['wide',   [0,1.5,3.6],   [0,0.85,-0.6], 38, null],
  ['window', [1.4,1.35,1.9],[-2.3,1.2,-1.0], 45, null],
  ['crib',   [-0.5,1.25,-0.5],[-1.5,0.55,-2.3], 40, null],
  ['corner', [2.0,1.6,2.0], [-0.6,1.0,-2.4], 44, null]
];
for (const [name, p, t, fov] of shots) {
  await page.evaluate(([p,t,fov])=>{ window.setView(p,t,fov); window.step(60); }, [p,t,fov]);
  const calls = await page.evaluate(()=>window.step(1));
  await page.screenshot({ path: `/tmp/shot-${name}.png`, clip:{x:0,y:0,width:960,height:600} });
  console.log(name + ' calls=' + calls);
}
await page.evaluate(()=>{ window.room.setMood('night'); window.lighting.transitionTo('night',0.01); window.room.setLamp(true); window.room.clutter(true); });
await page.evaluate(()=>{ window.setView([0,1.5,3.6],[0,0.85,-0.6],38); window.step(120); });
const c2 = await page.evaluate(()=>window.step(1));
await page.screenshot({ path:'/tmp/shot-night.png', clip:{x:0,y:0,width:960,height:600} });
console.log('night calls=' + c2);
await page.evaluate(()=>{ window.room.setMood('golden'); window.lighting.transitionTo('golden',0.01); window.room.setWeather('rain'); window.room.setCurtains(0.35); });
await page.evaluate(()=>{ window.setView([1.4,1.35,1.9],[-2.3,1.2,-1.0],45); window.step(150); });
const c3 = await page.evaluate(()=>window.step(1));
await page.screenshot({ path:'/tmp/shot-rain.png', clip:{x:0,y:0,width:960,height:600} });
console.log('rain calls=' + c3);
await browser.close(); server.close();
