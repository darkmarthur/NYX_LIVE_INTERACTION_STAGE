import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { QUESTIONS } from '../shared/questions.mjs';
import { settingsFrom, phaseAt } from '../shared/settings.mjs';
import { validateJpeg } from './jpeg.mjs';

const COOKIE = 'nyx_participant';
const LIMIT = 1450000;
const ERRORS = {
  SETUP: [503, 'La participación todavía no está habilitada.'],
  CLOSED: [410, 'La ventana de participación está cerrada.'],
  BUSY: [429, 'Hay varios envíos al mismo tiempo. Espera unos segundos y vuelve a intentar.'],
  FULL: [409, 'Se alcanzó el límite de aportaciones de esta pieza.'],
  WITHDRAWN: [409, 'Esta participación ya fue retirada.'],
  CONSENT: [400, 'Necesitamos tu aceptación de los términos antes de recibir el contenido.'],
  INVALID_TEXT: [400, 'Escribe entre 3 y 500 caracteres, sin información confidencial.'],
  INVALID_IMAGE: [400, 'No pudimos validar la foto. Selecciona otra imagen JPEG, PNG o WebP.'],
  TOO_LARGE: [413, 'El archivo supera el tamaño permitido.'],
  BAD_REQUEST: [400, 'No se pudo procesar este envío. Revisa los campos.'],
  SESSION: [401, 'La sesión cambió. Recarga la página antes de enviar.'],
  FORBIDDEN: [403, 'No pudimos validar el origen del envío. Recarga la página.'],
  BACKEND: [503, 'No se pudo confirmar el envío. Conserva esta página y vuelve a intentar.'],
  NOT_FOUND: [404, 'Ruta no encontrada.'],
  METHOD: [405, 'Método no permitido.'],
  UPDATE_REQUIRED: [503, 'La anulación necesita la nueva versión del receptor. Contacta al responsable desde Privacidad.']
};
const hmac = (secret, message) => createHmac('sha256', secret).update(message).digest('hex');
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function fail(code) { throw new Error(code); }
function json(value, status = 200, cookie) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
  if (cookie) headers['Set-Cookie'] = cookie;
  if (status === 429) headers['Retry-After'] = '3';
  return new Response(JSON.stringify(value), { status, headers });
}
async function limitedBytes(request, limit = LIMIT) {
  if (Number(request.headers.get('content-length')) > limit) fail('TOO_LARGE');
  if (!request.body) fail('BAD_REQUEST');
  const reader = request.body.getReader();
  let length = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) { await reader.cancel(); fail('TOO_LARGE'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function limitedJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail('BAD_REQUEST');
  const bytes = await limitedBytes(request);
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('BAD_REQUEST');
    return value;
  } catch { fail('BAD_REQUEST'); }
}
function sessionFor(request, secret, eventId, now) {
  const raw = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!raw || !/^[A-Za-z0-9_-]{32}\.\d{13}\.[a-f0-9]{64}$/.test(raw)) return null;
  const [id, issued, signature] = raw.split('.');
  if (Number(issued) > now + 30000 || now - Number(issued) > 35 * 86400000) return null;
  return equal(signature, hmac(secret, `${eventId}:cookie:${id}.${issued}`)) ? raw : null;
}
export function assignedQuestion(secret, eventId, token) {
  const index = parseInt(hmac(secret, `${eventId}:question:${token.split('.')[0]}`).slice(0, 8), 16) % QUESTIONS.length;
  return { id: index + 1, text: QUESTIONS[index] };
}
function publicRecord(record) {
  if (!record) return null;
  const result = { submitted: true, withdrawn: record.withdrawn === true, receipt: typeof record.receipt === 'string' ? record.receipt : '' };
  if (record.pending === true) { result.pending = true; result.submitted = false; }
  return result;
}

export async function googleBridge(operation, data, env) {
  const ts = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const payload = Buffer.from(JSON.stringify({ operation, ...data }), 'utf8').toString('base64');
  const signature = hmac(env.BRIDGE_SECRET, `${ts}.${nonce}.${payload}`);
  try {
    const response = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ts, nonce, payload, signature }),
      redirect: 'follow', signal: AbortSignal.timeout(22000)
    });
    if (!response.ok) fail('BACKEND');
    const result = await response.json();
    if (result.ok !== true) {
      // Never fall back to legacy "withdraw": it would delete BOTH contributions.
      if (operation === 'withdrawOne' && result.code === 'NOT_FOUND') fail('UPDATE_REQUIRED');
      fail(Object.hasOwn(ERRORS, result.code) ? result.code : 'BACKEND');
    }
    return result.data;
  } catch (error) {
    if (Object.hasOwn(ERRORS, error.message)) throw error;
    fail('BACKEND');
  }
}

export function createApp({ env = process.env, backend = googleBridge, now = Date.now, demo = false, development = false } = {}) {
  return async request => {
    let setCookie;
    try {
      const url = new URL(request.url);
      const route = url.pathname.replace(/\/$/, '');
      const methods = { '/api/config': 'GET', '/api/bootstrap': 'GET', '/api/session': 'GET', '/api/answer': 'POST', '/api/photo': 'POST', '/api/withdraw': 'POST' };
      if (!Object.hasOwn(methods, route)) fail('NOT_FOUND');
      if (request.method !== methods[route]) fail('METHOD');
      const s = settingsFrom(env, development || demo);
      const time = now();
      const phase = phaseAt(s, time);
      const config = { ...s, phase, mode: demo ? 'demo' : s.ready ? 'live' : 'setup', uiVersion: 3 };
      if (route === '/api/config') return json({ ok: true, data: config });
      if (route === '/api/bootstrap' && (!s.ready || time >= Date.parse(s.purgeAt))) return json({ ok: true, data: { config, session: null } });
      if (!s.ready) fail('SETUP');
      if (time >= Date.parse(s.purgeAt)) fail('CLOSED');
      const secret = env.BRIDGE_SECRET;
      let token = sessionFor(request, secret, s.eventId, time);
      const fresh = !token;
      if (!token && request.method === 'GET') {
        const core = `${randomBytes(24).toString('base64url')}.${time}`;
        token = `${core}.${hmac(secret, `${s.eventId}:cookie:${core}`)}`;
        const age = Math.max(0, Math.floor((Date.parse(s.purgeAt) - time) / 1000));
        setCookie = `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;
      }
      if (!token) fail('SESSION');
      const csrf = hmac(secret, `${s.eventId}:csrf:${token}`);
      const actor = hmac(secret, `${s.eventId}:actor:${token.split('.')[0]}`);
      const question = assignedQuestion(secret, s.eventId, token);
      const common = { eventId: s.eventId, termsVersion: s.termsVersion, opensAt: s.opensAt, closesAt: s.closesAt, purgeAt: s.purgeAt, actor };
      if (route === '/api/session' || route === '/api/bootstrap') {
        // One browser request for config + session. A fresh random identity cannot
        // have existing submissions; skip Google on its first bootstrap only.
        const data = route === '/api/bootstrap' && fresh ? {} : await backend('status', { ...common, includePending:true }, env);
        const session = { csrf, question, text: publicRecord(data?.text), photo: publicRecord(data?.photo) };
        return json({ ok: true, data: route === '/api/bootstrap' ? { config, session } : session }, 200, setCookie);
      }
      if (request.headers.get('origin') !== env.SITE_ORIGIN || !equal(request.headers.get('x-nyx-csrf'), csrf)) fail('FORBIDDEN');
      if (route === '/api/withdraw') {
        const body = await limitedJson(request);
        if (body.confirm !== true) fail('BAD_REQUEST');
        if (body.kind !== undefined && !['photo', 'text'].includes(body.kind)) fail('BAD_REQUEST');
        // No file ID, filename, UUID or actor from the browser is trusted.
        const operation = body.kind ? 'withdrawOne' : 'withdraw'; // old clients only
        const result = await backend(operation, { ...common, ...(body.kind ? { kind: body.kind } : {}) }, env);
        if (body.kind && (result?.kind !== body.kind || result?.withdrawn !== true)) fail('BACKEND');
        return json({ ok: true, data: { withdrawn: true, ...(body.kind ? { kind: body.kind } : {}) } });
      }
      if (phase !== 'open') fail('CLOSED');
      const binary = route === '/api/photo' && request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'image/jpeg';
      let submission;
      if (binary) {
        if (request.headers.get('x-nyx-consent') !== 'true' || request.headers.get('x-nyx-terms') !== s.termsVersion) fail('CONSENT');
        if (request.headers.get('x-nyx-website')) fail('BAD_REQUEST');
        const image = (await limitedBytes(request, s.maxPhotoBytes)).toString('base64');
        validateJpeg(image, s.maxPhotoBytes, s.maxPhotoSide);
        submission = { kind: 'photo', image };
      } else {
        const body = await limitedJson(request);
        if (body.consent !== true || body.termsVersion !== s.termsVersion) fail('CONSENT');
        if (body.website) fail('BAD_REQUEST');
        if (route === '/api/answer') {
          if (typeof body.answer !== 'string') fail('INVALID_TEXT');
          const answer = body.answer.trim().normalize('NFC');
          if (answer.length < 3 || answer.length > s.maxAnswerLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(answer)) fail('INVALID_TEXT');
          submission = { kind: 'text', answer, questionId: question.id, question: question.text };
        } else {
          validateJpeg(body.image, s.maxPhotoBytes, s.maxPhotoSide);
          submission = { kind: 'photo', image: body.image }; // backward compatible
        }
      }
      const result = await backend('submit', { ...common, ...submission, consent: true }, env);
      return json({ ok: true, data: { receipt: result.receipt, duplicate: result.duplicate === true } });
    } catch (error) {
      const code = Object.hasOwn(ERRORS, error.message) ? error.message : 'BACKEND';
      const [status, message] = ERRORS[code];
      return json({ ok: false, error: { code, message } }, status, setCookie);
    }
  };
}
