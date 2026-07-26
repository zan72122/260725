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
await page.goto(`http://127.0.0.1:${port}/.uitest.html`);
await page.waitForFunction(()=>!!window.__UI__);
await page.evaluate(()=>{const ui=window.__UI__;ui.startGame();ui.meter('food',.14);ui.meter('energy',.28);});
await page.waitForTimeout(900);
console.log(await page.evaluate(()=>{
  const ui=window.__UI__;
  const feed=document.querySelector('.act[data-act="feed"]');
  const badge=feed.querySelector('.act__badge');
  const pip=document.getElementById('book-pip');
  return {
    needy: ui.state.needyActivities(),
    feedClasses: feed.className,
    badgeHTML: badge.innerHTML.slice(0,60),
    badgeOpacity: getComputedStyle(badge).opacity,
    badgeRect: badge.getBoundingClientRect().toJSON(),
    pipDisplay: getComputedStyle(pip).display,
    bookClasses: document.getElementById('book-btn').className,
    trackW: document.querySelector('.meter__track').getBoundingClientRect().width
  };
}));
await br.close();process.exit(0);
