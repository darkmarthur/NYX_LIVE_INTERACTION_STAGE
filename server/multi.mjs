import { createHmac, randomBytes } from 'node:crypto';
import { createApp } from './app.mjs';
import { QUESTIONS } from '../shared/questions.mjs';

const VERSION = '2026-10-21-multi-v6';
const ERRORS = {
  UPDATE_REQUIRED: [503, 'Falta publicar el receptor de Google v6. No vuelvas a desplegar Netlify; actualiza la implementación existente de Apps Script.'],
  ROW_NOT_FOUND: [409, 'No se pudo localizar con seguridad la fila de esa respuesta. No se marcó como anulada. Contacta al organizador con tu comprobante.'],
  WITHDRAWN: [409, 'Ese envío ya fue anulado. Pulsa ENVIAR OTRO para crear uno nuevo.'],
  BAD_REQUEST: [400, 'No se pudo validar este envío. Recarga la página.'],
  NOT_FOUND: [404, 'No se encontró ese envío en tu sesión.'],
  BACKEND: [503, 'No pudimos confirmar la operación. Conserva tu selección y comprueba su estado.']
};
const mac = (secret, text) => createHmac('sha256', secret).update(text).digest('hex');
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff', Vary: 'Cookie', ...headers }
});
function failure(code) {
  const [status, message] = ERRORS[code] || ERRORS.BACKEND;
  return json({ ok: false, error: { code: Object.hasOwn(ERRORS, code) ? code : 'BACKEND', message } }, status);
}
function requestId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/.test(value)) throw new Error('BAD_REQUEST');
  return value;
}
function questionFor(actor, id, env, eventId) {
  const i = parseInt(mac(env.BRIDGE_SECRET, `${eventId}:multi-question:${actor}:${id}`).slice(0, 8), 16) % QUESTIONS.length;
  return { id: i + 1, text: QUESTIONS[i] };
}
function visible(x) {
  if (!x || !/^NYX-[a-f0-9]{32}$/.test(x.receipt || '') || !['photo','text'].includes(x.kind)) return null;
  return { receipt: x.receipt, kind: x.kind, createdAt: x.createdAt || '',
    requestId: /^[a-f0-9]{32}$/.test(x.requestId || '') ? x.requestId : null,
    withdrawn: x.withdrawn === true, pending: x.pending === true, submitted: x.submitted === true };
}

// The same HMAC bridge as v4/v5, with explicit protocol negotiation BEFORE enabling forms.
export async function multiBridge(operation, data, env) {
  const ts = Date.now(), nonce = randomBytes(16).toString('hex');
  const payload = Buffer.from(JSON.stringify({ operation, ...data })).toString('base64');
  const signature = mac(env.BRIDGE_SECRET, `${ts}.${nonce}.${payload}`);
  const response = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ts, nonce, payload, signature }), redirect: 'follow', signal: AbortSignal.timeout(22000)
  });
  if (!response.ok) throw new Error('BACKEND');
  const result = await response.json();
  if (result?.ok !== true) {
    if (result?.code === 'NOT_FOUND' && operation === 'statusV6') throw new Error('UPDATE_REQUIRED');
    throw new Error(typeof result?.code === 'string' ? result.code : 'BACKEND');
  }
  if (result.data?.protocol !== 6) throw new Error('UPDATE_REQUIRED');
  return result.data;
}

export function createMultiApp({ env = process.env, backend = multiBridge, now = Date.now,
  demo = false, development = false } = {}) {
  return async request => {
    let bridgeError, observed, question;
    try {
      const url = new URL(request.url), route = url.pathname.replace(/\/$/, '');
      const mutation = ['/api/photo', '/api/answer'].includes(route) && request.method === 'POST';
      const id = mutation ? requestId(request.headers.get('x-nyx-request-id'))
        : url.searchParams.has('requestId') ? requestId(url.searchParams.get('requestId')) : randomBytes(16).toString('hex');
      const kind = route === '/api/photo' ? 'photo' : route === '/api/answer' ? 'text' : url.searchParams.get('kind') || 'text';
      if (!['photo', 'text'].includes(kind)) return failure('BAD_REQUEST');
      const bridge = async (operation, data, bridgeEnv) => {
        try {
          if (operation === 'status') {
            observed = await backend('statusV6', { ...data, kind, requestId: id, before: url.searchParams.get('before') || null }, bridgeEnv);
            if (observed?.protocol !== 6) throw new Error('UPDATE_REQUIRED');
            question = questionFor(data.actor, id, bridgeEnv, data.eventId);
            return {}; // Old core provides session authentication; v6 supplies per-item state below.
          }
          if (operation === 'submit') {
            const assigned = questionFor(data.actor, id, bridgeEnv, data.eventId);
            observed = await backend('submitV6', { ...data, requestId: id,
              ...(data.kind === 'text' ? { questionId: assigned.id, question: assigned.text } : {}) }, bridgeEnv);
          } else if (operation === 'withdrawOne') {
            if (!/^NYX-[a-f0-9]{32}$/.test(data.receipt || '')) throw new Error('BAD_REQUEST');
            observed = await backend('withdrawV6', data, bridgeEnv);
          } else throw new Error('BAD_REQUEST'); // Never accidentally delete all contributions.
          if (observed?.protocol !== 6) throw new Error('UPDATE_REQUIRED');
          return observed;
        } catch (error) { bridgeError = error.message; throw error; }
      };
      const core = createApp({ env, backend: bridge, now, demo, development });
      const alter = path => { const u = new URL(request.url); u.pathname = path; return new Request(u, { method: 'GET', headers: request.headers }); };
      let response, body, config;
      if (route === '/api/bootstrap' && request.method === 'GET') {
        const c = await core(alter('/api/config')); const value = await c.json();
        if (!value.ok) return json(value, c.status);
        config = { ...value.data, uiVersion: 6, receiverProtocol: 6, multipleSubmissions: true };
        if (!config.ready || now() >= Date.parse(config.purgeAt)) return json({ ok: true, data: { config, session: null } });
        // ALWAYS consult Google, including a first-time browser, to detect a stale receiver.
        response = await core(alter('/api/session'));
      } else response = await core(request);
      body = await response.json();
      if (!body.ok) return bridgeError && Object.hasOwn(ERRORS, bridgeError) ? failure(bridgeError)
        : json(body, response.status, Object.fromEntries(response.headers));
      if (route === '/api/config') body.data = { ...body.data, uiVersion: 6, receiverProtocol: 6, multipleSubmissions: true };
      else if (route === '/api/bootstrap' || route === '/api/session') {
        const session = { csrf: body.data.csrf, question: question || body.data.question, requestId: id,
          current: visible(observed?.current), items: (observed?.items || []).map(visible).filter(Boolean),
          total: observed?.total || 0, active: observed?.active || 0, next: observed?.next || null, receiverVersion: observed?.version };
        body.data = route === '/api/bootstrap' ? { config, session } : session;
      } else if (mutation) body.data = { ...visible(observed), duplicate: observed?.duplicate === true };
      else if (route === '/api/withdraw') body.data = { receipt: observed.receipt, kind: observed.kind, withdrawn: observed.withdrawn === true };
      return json(body, response.status, Object.fromEntries(response.headers));
    } catch (error) { return failure(bridgeError || error.message); }
  };
}

// Local demo only; never receives production credentials or writes to Google.
export function createMultiDemo() {
  const records = new Map();
  return async (operation, data, env) => {
    const receipt = 'NYX-' + mac(env.BRIDGE_SECRET, `${data.eventId}:${data.actor}:${data.kind}:${data.requestId}`).slice(0, 32);
    if (operation === 'statusV6') {
      const all = [...records.values()].filter(x => x.actor === data.actor && x.kind === data.kind).reverse();
      const start = data.before ? all.findIndex(x => x.receipt === data.before) + 1 : 0;
      return { protocol: 6, version: VERSION, current: records.get(receipt) || null, items: all.slice(start, start+20),
        total: all.length, active: all.filter(x => !x.withdrawn).length, next: all.length > start+20 ? all[start+19].receipt : null };
    }
    if (operation === 'submitV6') {
      const old = records.get(receipt);
      if (old?.withdrawn) throw new Error('WITHDRAWN');
      const item = old || { receipt, actor: data.actor, kind: data.kind, requestId: data.requestId, createdAt: new Date().toISOString(), submitted: true, withdrawn: false };
      records.set(receipt, item); return { ...item, protocol: 6, duplicate: Boolean(old) };
    }
    const item = records.get(data.receipt);
    if (!item || item.actor !== data.actor || item.kind !== data.kind) throw new Error('NOT_FOUND');
    item.withdrawn = true; return { protocol: 6, receipt: item.receipt, kind: item.kind, withdrawn: true };
  };
}
