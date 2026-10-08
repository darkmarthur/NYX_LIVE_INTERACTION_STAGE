import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createDemoBackend } from './demo.mjs';

const port = Number(process.env.PORT || 8888);
const live = process.argv.includes('--live');
const origin = `http://localhost:${port}`;
const env = live ? { ...process.env, SITE_ORIGIN: origin } : {
  BRIDGE_SECRET: randomBytes(32).toString('hex'), APPS_SCRIPT_URL: 'https://script.google.com/macros/s/local-demo/exec', SITE_ORIGIN: origin,
  PRIVACY_CONTROLLER: 'NYX · Demostración local', PRIVACY_ADDRESS: 'Prueba sin recepción de datos reales', PRIVACY_EMAIL: 'demo@example.invalid',
  LEGAL_APPROVED: 'true', COLLECTION_OPEN: 'true',
  OPENS_AT: new Date(Date.now() - 60000).toISOString(), CLOSES_AT: new Date(Date.now() + 86400000).toISOString(), PURGE_AT: new Date(Date.now() + 2 * 86400000).toISOString()
};
const app = createApp({ env, development: true, demo: !live, ...(live ? {} : { backend: createDemoBackend() }) });
const root = resolve('public');
const routes = new Set(['/', '/foto', '/preguntas', '/legal']);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, origin);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      let length = 0;
      for await (const chunk of incoming) {
        length += chunk.length;
        if (length > 1450000) { outgoing.writeHead(413, { 'Content-Type': 'application/json' }); outgoing.end(JSON.stringify({ ok: false, error: { code: 'TOO_LARGE', message: 'Archivo demasiado grande.' } })); return; }
        chunks.push(chunk);
      }
      const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Buffer.concat(chunks) }) });
      const response = await app(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const pathname = decodeURIComponent(url.pathname).replace(/\/$/, '') || '/';
    const file = routes.has(pathname) ? resolve(root, 'index.html') : resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep) || !types[extname(file)]) { outgoing.writeHead(404); outgoing.end('No encontrado'); return; }
    const bytes = await readFile(file);
    outgoing.writeHead(200, { 'Content-Type': types[extname(file)] + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    outgoing.end(bytes);
  } catch { outgoing.writeHead(404); outgoing.end('No encontrado'); }
});
server.listen(port, '127.0.0.1', () => console.log(`NYX ${live ? 'BACKEND REAL' : 'DEMO SIN GOOGLE'} · ${origin}`));
