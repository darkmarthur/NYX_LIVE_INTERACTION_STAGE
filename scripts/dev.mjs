import http from 'node:http';
import { readFile,realpath } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { Readable } from 'node:stream';
import { createMultiApp as createApp, createMultiDemo as createDemoBackend } from '../server/multi.mjs';
const live = process.argv.includes('--live');
const port = Number(process.env.PORT || 8888);
const origin = `http://localhost:${port}`;
const now = Date.now();
const demoEnv = { BRIDGE_SECRET:'local-demo-only-'.repeat(4), APPS_SCRIPT_URL:'https://script.google.com/macros/s/demo/exec', SITE_ORIGIN:origin, PRIVACY_CONTROLLER:'DEMO LOCAL', PRIVACY_ADDRESS:'Datos de ejemplo, sin validez', PRIVACY_EMAIL:'demo@example.test', LEGAL_APPROVED:'true', COLLECTION_OPEN:'true', OPENS_AT:new Date(now-86400000).toISOString(), CLOSES_AT:new Date(now+86400000).toISOString(), PURGE_AT:new Date(now+172800000).toISOString() };
const app = createApp({ env:live ? process.env : demoEnv, ...(live ? {} : { backend:createDemoBackend(), demo:true }), development:true });
const dir = await realpath('dist');
const routes = { '/':'index.html', '/foto':'foto.html', '/preguntas':'preguntas.html', '/legal':'legal.html' };
const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json' };
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,origin);
    if (url.pathname.startsWith('/api/')) {
      const init = { method:req.method,headers:req.headers };
      if (!['GET','HEAD'].includes(req.method)) { init.body = Readable.toWeb(req); init.duplex = 'half'; }
      const response = await app(new Request(url,init));
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    const pathname = url.pathname.replace(/\/$/,'') || '/';
    const relative = routes[pathname] || pathname.slice(1);
    const file = await realpath(resolve(dir,relative));
    if (!file.startsWith(dir+sep)) { res.writeHead(403);res.end();return; }
    const body = await readFile(file);
    res.writeHead(200,{ 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Cache-Control': pathname.startsWith('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'" });
    res.end(body);
  } catch { res.writeHead(404);res.end('No encontrado'); }
});
server.listen(port,() => console.log(`${live ? 'LIVE' : 'DEMO LOCAL: no escribe en Google'} → ${origin}`));
