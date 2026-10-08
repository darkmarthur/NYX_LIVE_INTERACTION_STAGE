import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHmac, randomUUID } from 'node:crypto';
const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

function fixture() {
  const clock = { value: Date.parse('2026-10-15T18:00:00Z') };
  const settings = { BRIDGE_SECRET: 'test-secret-'.repeat(4), EVENT_ID: 'nyx-ocampo-2026', TERMS_VERSION: '2026-10-08-v1', OPENS_AT: '2026-10-08T00:00:00-06:00', CLOSES_AT: '2026-10-22T19:00:00-06:00', PURGE_AT: '2026-10-23T10:00:00-06:00', COLLECTION_OPEN: 'true', MAX_PER_KIND: '100', ROOT_FOLDER_ID: 'root', PENDING_PHOTOS_ID: 'photos', PENDING_TEXTS_ID: 'texts' };
  const p = { getProperty: key => settings[key] ?? null, setProperty: (key, value) => { settings[key] = value; return p; }, setProperties: values => Object.assign(settings, values), getProperties: () => ({ ...settings }), deleteProperty: key => delete settings[key] };
  const files = new Map([['root', { description: 'NYX_MVP:nyx-ocampo-2026' }]]);
  const removed = [];
  const controls = { lock: true, deletionError: false };
  const blob = (value, type, name) => ({ value, type, name, getDataAsString: () => Buffer.from(value).toString('utf8') });
  const sandbox = {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock.value])); } static now() { return clock.value; } },
    PropertiesService: { getScriptProperties: () => p },
    Utilities: { Charset: { UTF_8: 'UTF-8' }, getUuid: randomUUID, computeHmacSha256Signature: (text, key) => Array.from(createHmac('sha256', key).update(text).digest()), base64Decode: value => Array.from(Buffer.from(value, 'base64')), newBlob: blob },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => controls.lock, releaseLock() {} }) },
    DriveApp: { getFolderById: () => ({ createFile: value => { const id = randomUUID(); files.set(id, value); return { getId: () => id }; } }) },
    Drive: { Files: { remove: id => { if (controls.deletionError) throw new Error('Permission denied'); if (!files.has(id)) throw new Error('File not found 404'); files.delete(id); removed.push(id); }, get: id => { if (!files.has(id)) throw new Error('File not found 404'); return files.get(id); } } },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {} }, console
  };
  const context = vm.createContext(sandbox); vm.runInContext(code, context);
  const common = { eventId: settings.EVENT_ID, termsVersion: settings.TERMS_VERSION, opensAt: settings.OPENS_AT, closesAt: settings.CLOSES_AT, purgeAt: settings.PURGE_AT, actor: 'a'.repeat(64) };
  function envelope(data) {
    const ts = clock.value; const nonce = 'b'.repeat(32);
    const payload = Buffer.from(JSON.stringify({ ...common, ...data })).toString('base64');
    return { ts, nonce, payload, signature: createHmac('sha256', settings.BRIDGE_SECRET).update(`${ts}.${nonce}.${payload}`).digest('hex') };
  }
  const send = data => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(envelope(data)) } }).text);
  return { send, envelope, context, settings, files, removed, controls, clock };
}
const answer = { operation: 'submit', kind: 'text', consent: true, questionId: 1, question: '¿Qué recuerdas?', answer: 'Un patio lleno de luz.' };

test('Apps Script valida una firma real HMAC de Node y conserva el texto', () => {
  const f = fixture(); const result = f.send(answer);
  assert.equal(result.ok, true);
  assert.equal(f.files.size, 2);
  const stored = [...f.files.values()].find(file => file.type === 'application/json');
  assert.equal(JSON.parse(stored.value).answer, answer.answer);
  assert.ok(!JSON.stringify(f.send({ operation: 'status' })).includes('fileId'));
});
test('Apps Script rechaza firma alterada y operaciones administrativas', () => {
  const f = fixture(); const body = f.envelope(answer); body.signature = '0'.repeat(64);
  assert.equal(JSON.parse(f.context.doPost({ postData: { contents: JSON.stringify(body) } }).text).code, 'FORBIDDEN');
  assert.equal(f.send({ operation: 'purgeExpired' }).code, 'NOT_FOUND');
  assert.equal(f.files.size, 1);
});
test('Apps Script deduplica reintentos sin sobrescribir contenido', () => {
  const f = fixture(); const first = f.send(answer); const second = f.send({ ...answer, answer: 'No sustituir el original.' });
  assert.equal(first.data.receipt, second.data.receipt);
  assert.equal(second.data.duplicate, true);
  assert.equal(f.files.size, 2);
});
test('Apps Script aplica consentimiento, cupo, cierre y bloqueo', () => {
  const f = fixture();
  assert.equal(f.send({ ...answer, consent: false }).code, 'CONSENT');
  f.settings.MAX_PER_KIND = '1'; f.send(answer);
  assert.equal(f.send({ ...answer, actor: 'c'.repeat(64) }).code, 'FULL');
  f.settings.COLLECTION_OPEN = 'false';
  assert.equal(f.send({ ...answer, actor: 'c'.repeat(64) }).code, 'CLOSED');
  f.controls.lock = false;
  assert.equal(f.send(answer).code, 'BUSY');
});
test('Retirar elimina archivos, conserva solo tombstone y bloquea reenvío', () => {
  const f = fixture(); f.send(answer);
  assert.equal(f.send({ operation: 'withdraw' }).ok, true);
  assert.equal(f.files.size, 1);
  assert.equal(f.send(answer).code, 'WITHDRAWN');
  const record = JSON.parse(f.settings['NYX_ACTOR_' + 'a'.repeat(64)]);
  assert.equal(record.text.withdrawn, true);
  assert.ok(!record.text.fileId);
});
test('Limpieza no borra antes de fecha y no reporta éxito si falla', () => {
  const f = fixture(); f.send(answer); f.context.purgeExpired();
  assert.equal(f.files.size, 2);
  f.clock.value = Date.parse('2026-10-24T00:00:00Z'); f.controls.deletionError = true;
  assert.throws(() => f.context.purgeExpired(), /Permission denied/);
  assert.ok(!f.settings.PURGED_AT);
  assert.ok(f.settings['NYX_ACTOR_' + 'a'.repeat(64)]);
  f.controls.deletionError = false; f.context.purgeExpired();
  assert.equal(f.files.size, 0);
  assert.ok(f.settings.PURGED_AT);
  assert.ok(!f.settings['NYX_ACTOR_' + 'a'.repeat(64)]);
});
test('Limpieza rechaza carpetas sin marcador de propiedad', () => {
  const f = fixture(); f.files.get('root').description = 'Mis archivos personales';
  f.clock.value = Date.parse('2026-10-24T00:00:00Z');
  assert.throws(() => f.context.purgeExpired(), /Marcador/);
  assert.equal(f.removed.length, 0);
});
