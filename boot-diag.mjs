import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const ROOT='/home/user/260725/baby-care-3d';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const srv=createServer(async(q,r)=>{try{const f=join(ROOT,decodeURIComponent(q.url.split('?')[0]));const b=await readFile(f);r.writeHead(200,{'Content-Type':MIME[extname(f)]||'text/plain'});r.end(b);}catch(e){r.writeHead(404).end('nf')}});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port=srv.address().port;
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:900,height:600}});
const logs=[];
p.on('console',m=>logs.push(`[${m.type()}] ${m.text()}`));
p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,6).join('\n')));
p.on('requestfailed',r=>logs.push('REQFAIL: '+r.url()+' '+r.failure()?.errorText));
p.on('response',r=>{ if(r.status()>=400) logs.push('HTTP '+r.status()+' '+r.url()); });
await p.goto(`http://127.0.0.1:${port}/index.html?harness=1&tier=2`,{waitUntil:'domcontentloaded'});
const t0=Date.now();
let ready=false;
try{ await p.waitForFunction(()=>window.__GAME__&&window.__GAME__.ready===true,null,{timeout:180000,polling:500}); ready=true; }catch(e){}
console.log('READY:',ready,'in',((Date.now()-t0)/1000).toFixed(1)+'s');
const st=await p.evaluate(()=>({
  hasApp: !!window.__APP__, hasGame: !!window.__GAME__,
  bootErr: document.getElementById('boot-error')?.textContent?.slice(0,1500)||null,
  activity: window.__APP__?.activityName||null
}));
console.log(JSON.stringify(st,null,1));
console.log('--- logs ---'); console.log(logs.slice(0,40).join('\n'));
await p.screenshot({path:'/home/user/260725/boot.png'});
await b.close(); srv.close();
