import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const ROOT='/home/user/260725/baby-care-3d';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=createServer(async(q,r)=>{try{const b=await readFile(join(ROOT,decodeURIComponent(q.url.split('?')[0])));r.writeHead(200,{'Content-Type':MIME[extname(decodeURIComponent(q.url.split('?')[0]))]||'text/plain'});r.end(b);}catch(e){r.writeHead(404).end('nf')}});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port=srv.address().port;
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:900,height:600}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,8).join('\n')));
p.on('console',m=>{if(m.type()==='error')errs.push('[err] '+m.text().slice(0,400))});
await p.goto(`http://127.0.0.1:${port}/index.html?harness=1&tier=2`,{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>window.__GAME__?.ready===true,null,{timeout:120000,polling:300});

async function timed(label, fn, ms=180000){
  const t=Date.now();
  try { await p.evaluate(fn, null); console.log(`  ${label}: ${((Date.now()-t)/1000).toFixed(1)}s`); }
  catch(e){ console.log(`  ${label}: FAILED after ${((Date.now()-t)/1000).toFixed(1)}s -> ${e.message.slice(0,300)}`); }
}
await timed('setScene(play)', async()=>{ await window.__GAME__.setScene('play'); });
await timed('setCamera(wide)', async()=>{ await window.__GAME__.setCamera('wide'); });
await timed('one step',      async()=>{ window.__APP__.step(1/60); });
await timed('one render',    async()=>{ window.__APP__.pipeline.render(1/60); });
await timed('60 steps',      async()=>{ for(let i=0;i<60;i++) window.__APP__.step(1/60); });
await timed('10 renders',    async()=>{ for(let i=0;i<10;i++) window.__APP__.pipeline.render(1/60); });
const st=await p.evaluate(()=>window.__GAME__.stats());
console.log('  stats:',JSON.stringify(st));
console.log(errs.length?('ERRORS:\n'+errs.slice(0,12).join('\n')):'no errors');
await p.screenshot({path:'/home/user/260725/boot.png'});
await b.close(); srv.close();
