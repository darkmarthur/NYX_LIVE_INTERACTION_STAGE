import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, assignedQuestion } from '../server/app.mjs';
import { QUESTIONS } from '../shared/questions.mjs';
import { settingsFrom, phaseAt } from '../shared/settings.mjs';
import { validateJpeg } from '../server/jpeg.mjs';
import { createDemoBackend } from '../scripts/demo.mjs';

const time = Date.parse('2026-10-15T18:00:00Z');
const env = { BRIDGE_SECRET: 'unit-test-only-'.repeat(4), APPS_SCRIPT_URL: 'https://script.google.com/macros/s/testing/exec', SITE_ORIGIN: 'https://nyx.example', PRIVACY_CONTROLLER: 'Test', PRIVACY_ADDRESS: 'Test address', PRIVACY_EMAIL: 'test@example.test', LEGAL_APPROVED: 'true', COLLECTION_OPEN: 'true' };
// Contenedor JPEG mínimo para probar el validador de cabeceras, no una imagen decodificable.
const headerJpeg = Buffer.from([255,216,255,192,0,17,8,0,10,0,10,3,1,17,0,2,17,0,3,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]).toString('base64');
function fixture(options = {}) {
  const backend = createDemoBackend();
  const app = createApp({ env, backend, now: () => time, ...options });
  const request = (path, init = {}) => app(new Request('https://nyx.example' + path, init));
  async function session() {
    const response = await request('/api/session');
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], ...(await response.json()).data };
  }
  function post(path, who, body) {
    return request(path, { method: 'POST', headers: { 'content-type': 'application/json', origin: env.SITE_ORIGIN, cookie: who.cookie, 'x-nyx-csrf': who.csrf }, body: JSON.stringify(body) });
  }
  return { backend, app, request, session, post };
}
const consent = { consent: true, termsVersion: settingsFrom(env).termsVersion, website: '' };

test('Banco de exactamente 100 preguntas distintas', () => { assert.equal(QUESTIONS.length, 100); assert.equal(new Set(QUESTIONS).size, 100); });
test('Pregunta estable y acotada en 1000 identidades', () => {
  for (let i = 0; i < 1000; i++) {
    const question = assignedQuestion(env.BRIDGE_SECRET, 'nyx-ocampo-2026', `${i}.1.sig`);
    assert.ok(question.id >= 1 && question.id <= 100);
    assert.deepEqual(question, assignedQuestion(env.BRIDGE_SECRET, 'nyx-ocampo-2026', `${i}.2.sig`));
  }
});
test('Sin configuración no permite envíos ni filtra secretos', async () => {
  const f = fixture({ env: {} });
  const config = await (await f.request('/api/config')).json();
  assert.equal(config.data.mode, 'setup');
  assert.equal((await f.request('/api/session')).status, 503);
  assert.ok(!JSON.stringify(config).includes('BRIDGE_SECRET'));
});
test('No hay cookie hasta solicitar sesión; cookie HttpOnly Secure y pregunta persistente', async () => {
  const f = fixture();
  assert.equal((await f.request('/api/config')).headers.get('set-cookie'), null);
  const first = await f.request('/api/session');
  assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.match(first.headers.get('set-cookie'), /Secure/);
  const who = { cookie: first.headers.get('set-cookie').split(';')[0], ...(await first.json()).data };
  const again = await (await f.request('/api/session', { headers: { cookie: who.cookie } })).json();
  assert.deepEqual(again.data.question, who.question);
  assert.equal(again.data.csrf, who.csrf);
});
test('Exige consentimiento y valida el texto en servidor', async () => {
  const f = fixture(); const who = await f.session();
  assert.equal((await f.post('/api/answer', who, { ...consent, consent: false, answer: 'Hola' })).status, 400);
  assert.equal((await f.post('/api/answer', who, { ...consent, answer: 'a'.repeat(501) })).status, 400);
  assert.equal((await f.post('/api/answer', who, { ...consent, answer: '  ' })).status, 400);
  assert.equal((await f.post('/api/answer', who, { ...consent, answer: 'Hola', website: 'spam' })).status, 400);
  assert.equal(f.backend.records.size, 0);
});
test('Una respuesta y una foto por navegador; reintento idempotente', async () => {
  const f = fixture(); const who = await f.session();
  const first = await (await f.post('/api/answer', who, { ...consent, answer: 'El patio de mi abuela.' })).json();
  const again = await (await f.post('/api/answer', who, { ...consent, answer: 'Otra frase que no debe reemplazar la anterior.' })).json();
  assert.equal(first.data.receipt, again.data.receipt);
  assert.equal(again.data.duplicate, true);
  const image = await f.post('/api/photo', who, { ...consent, image: headerJpeg });
  assert.equal(image.status, 200);
  assert.equal(f.backend.records.size, 1);
  assert.equal(Object.keys([...f.backend.records.values()][0]).length, 2);
});
test('No permite consultar el contenido ni estado de otros navegadores', async () => {
  const f = fixture(); const alice = await f.session(); const bob = await f.session();
  await f.post('/api/answer', alice, { ...consent, answer: 'Recuerdo privado de Alice.' });
  const status = await (await f.request('/api/session?actor=alice', { headers: { cookie: bob.cookie } })).json();
  assert.equal(status.data.text, null);
  assert.equal(status.data.photo, null);
  assert.ok(!JSON.stringify(status).includes('privado'));
  assert.equal((await f.request('/api/photos')).status, 404);
});
test('Rechaza CSRF, cookie alterada y formulario sin sesión', async () => {
  const f = fixture(); const who = await f.session();
  assert.equal((await f.post('/api/answer', { ...who, csrf: 'incorrecto' }, { ...consent, answer: 'Hola' })).status, 403);
  assert.equal((await f.post('/api/answer', { ...who, cookie: who.cookie + 'x' }, { ...consent, answer: 'Hola' })).status, 401);
  const response = await f.request('/api/answer', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://otro.example', cookie: who.cookie, 'x-nyx-csrf': who.csrf }, body: JSON.stringify({ ...consent, answer: 'Hola' }) });
  assert.equal(response.status, 403);
});
test('Retirada bloquea nuevos envíos y no divulga IDs de Drive', async () => {
  const f = fixture(); const who = await f.session();
  await f.post('/api/answer', who, { ...consent, answer: 'Algo cotidiano' });
  assert.equal((await f.post('/api/withdraw', who, { confirm: true })).status, 200);
  assert.equal((await f.post('/api/answer', who, { ...consent, answer: 'Otro envío' })).status, 409);
  const response = await f.request('/api/session', { headers: { cookie: who.cookie } });
  const status = await response.json();
  assert.equal(status.data.text.withdrawn, true);
  assert.ok(!JSON.stringify(status).includes('fileId'));
});
test('Ventanas de cierre y pausa se aplican en el servidor', async () => {
  const s = settingsFrom(env);
  assert.equal(phaseAt(s, Date.parse('2026-10-01')), 'soon');
  assert.equal(phaseAt(s, time), 'open');
  assert.equal(phaseAt(s, Date.parse('2026-10-24')), 'closed');
  const f = fixture({ env: { ...env, COLLECTION_OPEN: 'false' } });
  const who = await f.session();
  assert.equal((await f.post('/api/answer', who, { ...consent, answer: 'Hola' })).status, 410);
});
test('Errores del backend nunca se convierten en confirmación falsa', async () => {
  const f = fixture({ backend: async () => { throw new Error('https://private.google/file/secreto'); } });
  const response = await f.request('/api/session');
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('private.google'));
});
test('Validador JPEG rechaza SVG, falsos archivos y dimensiones excesivas', () => {
  assert.equal(validateJpeg(headerJpeg).width, 10);
  assert.throws(() => validateJpeg(Buffer.from('<svg/>').toString('base64')), /INVALID_IMAGE/);
  const large = Buffer.from(headerJpeg, 'base64'); large.writeUInt16BE(9000, 9);
  assert.throws(() => validateJpeg(large.toString('base64')), /INVALID_IMAGE/);
  assert.throws(() => validateJpeg(headerJpeg + 'AAAA'), /INVALID_IMAGE/);
});
