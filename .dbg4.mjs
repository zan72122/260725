import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const ROOT='/home/user/260725/baby-care-3d';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const {port}=await new Promise(r=>{const s=createServer(async(q,p)=>{try{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const f=join(ROOT,u);const b=await readFile(f);p.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'});p.end(b);}catch{p.writeHead(404).end('404');}});s.listen(0,'127.0.0.1',()=>r({port:s.address().port}));});
const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await br.newContext({viewport:{width:1024,height:768}});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.goto(`http://127.0.0.1:${port}/.uitest.html`);
await page.waitForFunction(()=>!!window.__UI__);
// seed a v1-era save and a corrupt payload, then reload
await page.evaluate(()=>{
  localStorage.clear();
  localStorage.setItem('babycare3d_save_v1', JSON.stringify({stars:12,stickerCount:2,outfitColor:0xffd44d,hat:'beanie',meters:{food:0.5,clean:0.4,happy:0.9,sleep:0.25}}));
});
await page.reload();
await page.waitForFunction(()=>!!window.__UI__);
console.log('migrated v1 ->', await page.evaluate(()=>{const s=window.__UI__.state;return {stars:s.stars,stickers:s.stickers,meters:s.meters,outfit:s.outfit};}));
await page.evaluate(()=>{localStorage.setItem('babycare3d.save','{not json at all');});
await page.reload();
await page.waitForFunction(()=>!!window.__UI__);
console.log('corrupt ->', await page.evaluate(()=>{const s=window.__UI__.state;return {stars:s.stars,meters:s.meters,stickers:s.stickers};}));
// harness behaviour: hud hidden
console.log('harness-hidden ->', await page.evaluate(()=>{const h=document.getElementById('hud');h.classList.add('harness-hidden');return getComputedStyle(h).display;}));
await br.close();process.exit(0);
