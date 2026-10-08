/* Backend privado de NYX. Proyecto independiente; ejecutar como propietario.
 * Nunca añadir el secreto al código, a una URL o al frontend.
 * La API pública NO permite listar archivos, exportar ni borrar el proyecto.
 */
function props_() { return PropertiesService.getScriptProperties(); }
function reject_(code) { throw new Error(code); }
function output_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function hex_(bytes) { return bytes.map(function (n) { return ('0' + ((n + 256) % 256).toString(16)).slice(-2); }).join(''); }
function same_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var difference = 0;
  for (var i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function doGet() { return output_({ ok: false, code: 'METHOD' }); }
function decodeRequest_(e) {
  if (!e || !e.postData || e.postData.contents.length > 2000000) reject_('BAD_REQUEST');
  var envelope = JSON.parse(e.postData.contents);
  var secret = props_().getProperty('BRIDGE_SECRET');
  if (!secret || secret.length < 32) reject_('SETUP');
  if (!Number.isSafeInteger(envelope.ts) || Math.abs(Date.now() - envelope.ts) > 120000 || !/^[a-f0-9]{32}$/.test(envelope.nonce || '') || typeof envelope.payload !== 'string') reject_('FORBIDDEN');
  var expected = hex_(Utilities.computeHmacSha256Signature(envelope.ts + '.' + envelope.nonce + '.' + envelope.payload, secret, Utilities.Charset.UTF_8));
  if (!same_(expected, envelope.signature)) reject_('FORBIDDEN');
  var data = JSON.parse(Utilities.newBlob(Utilities.base64Decode(envelope.payload)).getDataAsString('UTF-8'));
  var p = props_();
  if (data.eventId !== p.getProperty('EVENT_ID') || data.termsVersion !== p.getProperty('TERMS_VERSION')) reject_('SETUP');
  ['opensAt', 'closesAt', 'purgeAt'].forEach(function (key, i) {
    if (Date.parse(data[key]) !== Date.parse(p.getProperty(['OPENS_AT', 'CLOSES_AT', 'PURGE_AT'][i]))) reject_('SETUP');
  });
  if (!/^[a-f0-9]{64}$/.test(data.actor || '')) reject_('FORBIDDEN');
  if (Date.now() >= Date.parse(p.getProperty('PURGE_AT')) || p.getProperty('PURGED_AT')) reject_('CLOSED');
  if (!['status', 'submit', 'withdraw'].includes(data.operation)) reject_('NOT_FOUND');
  return data;
}
function doPost(e) {
  try {
    var data = decodeRequest_(e);
    var p = props_();
    var key = 'NYX_ACTOR_' + data.actor;
    if (data.operation === 'status') return output_({ ok: true, data: safeStatus_(JSON.parse(p.getProperty(key) || '{}')) });
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) reject_('BUSY');
    try {
      var record = JSON.parse(p.getProperty(key) || '{}');
      if (data.operation === 'withdraw') {
        ['photo', 'text'].forEach(function (kind) {
          if (record[kind]) {
            if (record[kind].fileId) deleteFile_(record[kind].fileId);
            record[kind] = { receipt: record[kind].receipt, withdrawn: true };
          }
        });
        if (Object.keys(record).length) p.setProperty(key, JSON.stringify(record));
        return output_({ ok: true, data: { withdrawn: true } });
      }
      return output_({ ok: true, data: submit_(data, key, record) });
    } finally { lock.releaseLock(); }
  } catch (error) {
    var allowed = ['BAD_REQUEST', 'FORBIDDEN', 'SETUP', 'CLOSED', 'BUSY', 'FULL', 'WITHDRAWN', 'CONSENT', 'INVALID_TEXT', 'INVALID_IMAGE', 'NOT_FOUND'];
    // No devolver excepciones de Google, IDs, secretos o contenido personal.
    return output_({ ok: false, code: allowed.includes(error.message) ? error.message : 'BACKEND' });
  }
}
function safeStatus_(record) {
  var result = {};
  ['photo', 'text'].forEach(function (kind) {
    if (record[kind]) result[kind] = { receipt: record[kind].receipt, withdrawn: record[kind].withdrawn === true };
  });
  return result;
}
function submit_(data, key, record) {
  var p = props_();
  if (p.getProperty('COLLECTION_OPEN') !== 'true' || Date.now() < Date.parse(p.getProperty('OPENS_AT')) || Date.now() >= Date.parse(p.getProperty('CLOSES_AT'))) reject_('CLOSED');
  if (data.consent !== true) reject_('CONSENT');
  if (!['photo', 'text'].includes(data.kind)) reject_('BAD_REQUEST');
  if (record[data.kind]) {
    if (record[data.kind].withdrawn) reject_('WITHDRAWN');
    return { receipt: record[data.kind].receipt, duplicate: true };
  }
  var all = p.getProperties();
  var count = Object.keys(all).filter(function (k) { return k.indexOf('NYX_ACTOR_') === 0 && JSON.parse(all[k])[data.kind]; }).length;
  var max = Number(p.getProperty('MAX_PER_KIND') || '100');
  if (!Number.isInteger(max) || max < 1 || max > 500) reject_('SETUP');
  if (count >= max) reject_('FULL');
  var receipt = 'NYX-' + Utilities.getUuid().replace(/-/g, '');
  var createdAt = new Date().toISOString();
  var blob;
  if (data.kind === 'text') {
    if (typeof data.answer !== 'string' || data.answer.trim().length < 3 || data.answer.length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(data.answer)) reject_('INVALID_TEXT');
    if (!Number.isInteger(data.questionId) || data.questionId < 1 || data.questionId > 100 || typeof data.question !== 'string' || data.question.length > 300) reject_('BAD_REQUEST');
    blob = Utilities.newBlob(JSON.stringify({ receipt: receipt, questionId: data.questionId, question: data.question, answer: data.answer, createdAt: createdAt, termsVersion: data.termsVersion }, null, 2), 'application/json', receipt + '.json');
  } else {
    if (typeof data.image !== 'string' || data.image.length > 1398104 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.image)) reject_('INVALID_IMAGE');
    var bytes = Utilities.base64Decode(data.image);
    if (bytes.length > 1048576 || bytes.length < 32 || ((bytes[0] + 256) % 256) !== 255 || ((bytes[1] + 256) % 256) !== 216 || ((bytes[bytes.length - 2] + 256) % 256) !== 255 || ((bytes[bytes.length - 1] + 256) % 256) !== 217) reject_('INVALID_IMAGE');
    blob = Utilities.newBlob(bytes, 'image/jpeg', receipt + '.jpg');
  }
  var folderId = p.getProperty(data.kind === 'photo' ? 'PENDING_PHOTOS_ID' : 'PENDING_TEXTS_ID');
  if (!folderId) reject_('SETUP');
  var file;
  try {
    file = DriveApp.getFolderById(folderId).createFile(blob);
    record[data.kind] = { fileId: file.getId(), receipt: receipt, createdAt: createdAt, termsVersion: data.termsVersion, consent: true, withdrawn: false };
    p.setProperty(key, JSON.stringify(record));
  } catch (error) {
    // Si la escritura del registro falla, no dejar un archivo sin registrar.
    if (file) { try { deleteFile_(file.getId()); } catch (_) { /* La limpieza de la carpeta dedicada lo recuperará. */ } }
    throw error;
  }
  return { receipt: receipt, duplicate: false };
}
function isMissing_(error) { return /file not found|notfound|\b404\b/i.test(String(error.message)); }
function deleteFile_(id) {
  try { Drive.Files.remove(id); }
  catch (error) { if (!isMissing_(error)) throw error; }
}

// ADMINISTRACIÓN: ejecutar únicamente desde el editor, nunca desde doPost.
function setupProject() {
  var p = props_();
  if ((p.getProperty('BRIDGE_SECRET') || '').length < 32) throw new Error('Configura BRIDGE_SECRET en Propiedades del script.');
  if (p.getProperty('ROOT_FOLDER_ID') || p.getProperty('PURGED_AT')) throw new Error('Este proyecto ya se inicializó. Usa showSetup(); no reutilices una colección eliminada.');
  var defaults = { EVENT_ID: 'nyx-ocampo-2026', OPENS_AT: '2026-10-08T00:00:00-06:00', CLOSES_AT: '2026-10-22T19:00:00-06:00', PURGE_AT: '2026-10-23T10:00:00-06:00', TERMS_VERSION: '2026-10-08-v1', MAX_PER_KIND: '100', COLLECTION_OPEN: 'false' };
  Object.keys(defaults).forEach(function (key) { if (!p.getProperty(key)) p.setProperty(key, defaults[key]); });
  var root = DriveApp.createFolder('NYX_' + p.getProperty('EVENT_ID'));
  root.setDescription('NYX_MVP:' + p.getProperty('EVENT_ID'));
  root.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  p.setProperty('ROOT_FOLDER_ID', root.getId());
  var pending = root.createFolder('pendientes');
  var approved = root.createFolder('aprobadas');
  p.setProperties({
    PENDING_PHOTOS_ID: pending.createFolder('fotos').getId(),
    PENDING_TEXTS_ID: pending.createFolder('textos').getId(),
    APPROVED_PHOTOS_ID: approved.createFolder('fotos').getId(),
    APPROVED_TEXTS_ID: approved.createFolder('textos').getId()
  });
  installCleanup();
  showSetup();
}
function installCleanup() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'purgeExpired'; }).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('purgeExpired').timeBased().everyHours(1).create();
}
function showSetup() {
  var p = props_();
  var safe = {};
  ['EVENT_ID', 'ROOT_FOLDER_ID', 'OPENS_AT', 'CLOSES_AT', 'PURGE_AT', 'TERMS_VERSION', 'MAX_PER_KIND', 'COLLECTION_OPEN', 'PURGED_AT'].forEach(function (key) { safe[key] = p.getProperty(key); });
  console.log(JSON.stringify(safe, null, 2));
  return safe;
}
function purgeExpired() {
  var p = props_();
  var due = Date.parse(p.getProperty('PURGE_AT'));
  if (!Number.isFinite(due)) throw new Error('PURGE_AT inválido: no se borró nada.');
  if (Date.now() < due || p.getProperty('PURGED_AT')) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Limpieza ocupada; reintentar.');
  try {
    p.setProperty('COLLECTION_OPEN', 'false');
    var rootId = p.getProperty('ROOT_FOLDER_ID');
    if (!rootId) throw new Error('Falta la carpeta dedicada: revisar configuración.');
    try {
      var root = Drive.Files.get(rootId, { fields: 'id,description' });
      if (root.description !== 'NYX_MVP:' + p.getProperty('EVENT_ID')) throw new Error('Marcador de propiedad incorrecto: borrado cancelado.');
    } catch (error) { if (!isMissing_(error)) throw error; }
    var all = p.getProperties();
    var keys = Object.keys(all).filter(function (key) { return key.indexOf('NYX_ACTOR_') === 0; });
    keys.forEach(function (key) {
      var record = JSON.parse(all[key]);
      ['photo', 'text'].forEach(function (kind) { if (record[kind] && record[kind].fileId) deleteFile_(record[kind].fileId); });
    });
    // Drive elimina definitivamente la carpeta y los descendientes propios.
    deleteFile_(rootId);
    keys.forEach(function (key) { p.deleteProperty(key); });
    ['ROOT_FOLDER_ID', 'PENDING_PHOTOS_ID', 'PENDING_TEXTS_ID', 'APPROVED_PHOTOS_ID', 'APPROVED_TEXTS_ID'].forEach(function (key) { p.deleteProperty(key); });
    p.setProperty('PURGED_AT', new Date().toISOString());
    ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'purgeExpired'; }).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  } finally { lock.releaseLock(); }
}
