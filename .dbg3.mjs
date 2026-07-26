import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const ROOT='/home/user/260725/baby-care-3d';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const {port}=await new Promise(r=>{const s=createServer(async(q,p)=>{try{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const f=join(ROOT,u);const b=await readFile(f);p.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'});p.end(b);}catch{p.writeHead(404).end('404');}});s.listen(0,'127.0.0.1',()=>r({port:s.address().port}));});
const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await br.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE-ERR',m.text());});
await page.goto(`http://127.0.0.1:${port}/.uitest.html`);
await page.waitForFunction(()=>!!window.__UI__);
// star award + sticker unlock flow
await page.evaluate(()=>{const ui=window.__UI__;ui.startGame();ui.harness=false;});
await page.waitForTimeout(300);
await page.evaluate(()=>{for(let i=0;i<5;i++) window.__UI__.star(1,{from: window.__BABY__});});
await page.waitForTimeout(1000);
console.log('mid-flight', await page.evaluate(()=>({flights:window.__UI__._flights.length, trails:window.__UI__._trails.length, fxKids:document.getElementById('fx-layer').children.length, count:document.getElementById('star-count').textContent})));
await page.screenshot({path:'/tmp/claude-0/-home-user-260725/5dcd6176-9338-5e88-b0eb-12b4cee9c722/scratchpad/shots/star-flight.png'});
await page.waitForTimeout(5000);
console.log('after', await page.evaluate(()=>({flights:window.__UI__._flights.length, fxKids:document.getElementById('fx-layer').children.length, count:document.getElementById('star-count').textContent, stars:window.__UI__.state.stars, stickers:window.__UI__.state.stickers, albumOpen: document.getElementById('album').classList.contains('is-open'), pip: document.getElementById('book-pip').textContent})));
await page.screenshot({path:'/tmp/claude-0/-home-user-260725/5dcd6176-9338-5e88-b0eb-12b4cee9c722/scratchpad/shots/sticker-award.png'});
// localStorage round trip
console.log('save', await page.evaluate(()=>{const s=window.__UI__.state; s.autosave=true; s.save(); const raw=localStorage.getItem('babycare3d.save'); localStorage.setItem('babycare3d_save_v1', JSON.stringify({stars:12,stickerCount:2,meters:{food:.5,sleep:.3},outfitColor:0xff0000,hat:'beanie'})); return raw;}));
await br.close();process.exit(0);
