import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {createMultiApp} from '../server/multi.mjs';
import {gasFixture,TEST_ENV} from './v6-fixture.mjs';
import {PAGES} from '../scripts/pages.mjs';
const gas=gasFixture(),port=8765,origin=`http://127.0.0.1:${port}`;
const app=createMultiApp({env:{...TEST_ENV,SITE_ORIGIN:origin},backend:gas.backend,now:()=>gas.clock.value,development:true});
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname==='/__test/counts'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({rows:gas.sheet().rows,files:[...gas.files.values()].filter(x=>x.type==='image/jpeg').map(x=>({id:x.id,name:x.name,parent:x.parent}))}));return;}
 if(url.pathname==='/__test/fail-write'){gas.controls.failWriteAfter=true;res.end('OK');return;}
 if(url.pathname.startsWith('/api/')){const init={method:req.method,headers:req.headers};if(req.method==='POST'){init.body=Readable.toWeb(req);init.duplex='half';}const r=await app(new Request(url,init));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());return;}
 const type={'/':'home','/foto':'photo','/preguntas':'text','/legal':'legal'}[url.pathname];
 if(type){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}.shell{max-width:430px;margin:auto}button{min-height:44px;margin:6px}textarea{min-height:100px}.trap,.sr-only,.photo-input{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.nyx-transfer,.legal-overlay{position:fixed;inset:0;background:#111;color:white;z-index:9;overflow:auto;padding:20px}.legal-dialog{background:#222}.legal-close{position:sticky;top:0}.nyx-transfer-content{margin-top:100px}.photo-frame{min-height:120px}#preview{max-height:120px}</style><body data-page="${type}"><div class="shell"><header><span>NYX SONORO</span><span id="phase">CONECTANDO</span></header><main id="main">${PAGES[type].content}</main><footer><a href="https://www.instagram.com/nyx.sonoro" id="instagram-link">INSTAGRAM</a></footer></div><script type="module" src="/app.js"></script></body></html>`);return;
 }
 if(['/app.js','/photo.js','/legal.js'].includes(url.pathname)){const b=await readFile(new URL('../public'+url.pathname,import.meta.url));res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(b);return;}
 res.writeHead(404);res.end();
}catch(e){res.writeHead(500);res.end('Test server failure');console.error(e);}}).listen(port,()=>console.log('V6 test HTTP '+origin));
