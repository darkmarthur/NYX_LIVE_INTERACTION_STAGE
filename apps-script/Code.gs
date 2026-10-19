/* NYX UI v3 / storage v2: carpeta plana de fotos + Google Sheet privado de dos columnas.
 * Ejecutar como propietario. No poner secretos en código ni publicar Drive/Sheet.
 * Para una instalación v1 existente: ejecutar migrateToFlatStorage(), NO setupProject().
 */
var NYX_STORAGE_VERSION = '2';
var NYX_TERMS_VERSION = '2026-10-15-v2';
var NYX_SHEET_TITLE = 'Respuestas';
var NYX_METADATA_KEY = 'NYX_RECEIPT';
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
  if (!e || !e.postData || typeof e.postData.contents !== 'string' || e.postData.contents.length > 2000000) reject_('BAD_REQUEST');
  var envelope = JSON.parse(e.postData.contents);
  var p = props_();
  var secret = p.getProperty('BRIDGE_SECRET');
  if (!secret || secret.length < 32 || p.getProperty('STORAGE_VERSION') !== NYX_STORAGE_VERSION || p.getProperty('MIGRATION_RUNNING') === 'true') reject_('SETUP');
  if (!Number.isSafeInteger(envelope.ts) || Math.abs(Date.now() - envelope.ts) > 120000 || !/^[a-f0-9]{32}$/.test(envelope.nonce || '') || typeof envelope.payload !== 'string') reject_('FORBIDDEN');
  var expected = hex_(Utilities.computeHmacSha256Signature(envelope.ts + '.' + envelope.nonce + '.' + envelope.payload, secret, Utilities.Charset.UTF_8));
  if (!same_(expected, envelope.signature)) reject_('FORBIDDEN');
  var data = JSON.parse(Utilities.newBlob(Utilities.base64Decode(envelope.payload)).getDataAsString('UTF-8'));
  if (data.eventId !== p.getProperty('EVENT_ID') || data.termsVersion !== p.getProperty('TERMS_VERSION')) reject_('SETUP');
  ['opensAt', 'closesAt', 'purgeAt'].forEach(function (key, i) {
    if (Date.parse(data[key]) !== Date.parse(p.getProperty(['OPENS_AT', 'CLOSES_AT', 'PURGE_AT'][i]))) reject_('SETUP');
  });
  if (!/^[a-f0-9]{64}$/.test(data.actor || '')) reject_('FORBIDDEN');
  if (Date.now() >= Date.parse(p.getProperty('PURGE_AT')) || p.getProperty('PURGED_AT')) reject_('CLOSED');
  if (!['status', 'submit', 'withdraw', 'withdrawOne'].includes(data.operation)) reject_('NOT_FOUND');
  return data;
}
function doPost(e) {
  try {
    var data = decodeRequest_(e);
    var p = props_();
    var key = 'NYX_ACTOR_' + data.actor;
    if (data.operation === 'status') return output_({ ok: true, data: safeStatus_(JSON.parse(p.getProperty(key) || '{}'), data.includePending === true) });
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) reject_('BUSY');
    try {
      // Recheck after waiting: an administrative migration may have taken the lock.
      if (p.getProperty('MIGRATION_RUNNING') === 'true') reject_('SETUP');
      var record = JSON.parse(p.getProperty(key) || '{}');
      if (data.operation === 'withdraw' || data.operation === 'withdrawOne') {
        if (data.operation === 'withdrawOne' && !['photo', 'text'].includes(data.kind)) reject_('BAD_REQUEST');
        var kinds = data.operation === 'withdrawOne' ? [data.kind] : ['photo', 'text'];
        kinds.forEach(function (kind) {
          if (!record[kind] || record[kind].withdrawn) return;
          var entry = record[kind];
          if (kind === 'photo') {
            if (entry.fileId) deleteFile_(entry.fileId);
            else findReceiptPhotos_(entry.receipt).forEach(function (file) { deleteFile_(file.getId()); });
          } else {
            deleteResponse_(entry.receipt);
            if (entry.fileId) deleteFile_(entry.fileId); // Interrupted legacy migration.
          }
          record[kind] = { receipt: entry.receipt, withdrawn: true };
          p.setProperty(key, JSON.stringify(record)); // Persist each withdrawal independently.
        });
        return output_({ ok: true, data: { withdrawn: true, kind: data.operation === 'withdrawOne' ? data.kind : 'all' } });
      }
      return output_({ ok: true, data: submit_(data, key, record) });
    } finally { lock.releaseLock(); }
  } catch (error) {
    var allowed = ['BAD_REQUEST', 'FORBIDDEN', 'SETUP', 'CLOSED', 'BUSY', 'FULL', 'WITHDRAWN', 'CONSENT', 'INVALID_TEXT', 'INVALID_IMAGE', 'NOT_FOUND'];
    return output_({ ok: false, code: allowed.includes(error.message) ? error.message : 'BACKEND' });
  }
}
function safeStatus_(record, includePending) {
  var result = {};
  ['photo', 'text'].forEach(function (kind) {
    var item = record[kind];
    if (item && (item.withdrawn || item.state === 'complete')) result[kind] = { receipt: item.receipt, withdrawn: item.withdrawn === true };
    else if (includePending && item && item.state === 'pending') result[kind] = { receipt: item.receipt, pending: true, withdrawn: false };
  });
  return result;
}
function validateText_(question, answer) {
  if (typeof answer !== 'string' || answer.trim().length < 3 || answer.length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(answer)) reject_('INVALID_TEXT');
  if (typeof question !== 'string' || !question.trim() || question.length > 300) reject_('BAD_REQUEST');
}
function photoBlob_(image, receipt) {
  if (typeof image !== 'string' || image.length > 1398104 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) reject_('INVALID_IMAGE');
  var bytes = Utilities.base64Decode(image);
  if (bytes.length > 1048576 || bytes.length < 32 || ((bytes[0] + 256) % 256) !== 255 || ((bytes[1] + 256) % 256) !== 216 || ((bytes[bytes.length - 2] + 256) % 256) !== 255 || ((bytes[bytes.length - 1] + 256) % 256) !== 217) reject_('INVALID_IMAGE');
  return Utilities.newBlob(bytes, 'image/jpeg', receipt + '.jpg');
}
function submit_(data, key, record) {
  var p = props_();
  // This flag arrives only from the Netlify bridge in a signed payload.
  // The legacy COLLECTION_OPEN Script Property is no longer consulted.
  if (data.enableInteraction !== true || Date.now() < Date.parse(p.getProperty('OPENS_AT')) || Date.now() >= Date.parse(p.getProperty('CLOSES_AT'))) reject_('CLOSED');
  if (data.consent !== true) reject_('CONSENT');
  if (!['photo', 'text'].includes(data.kind)) reject_('BAD_REQUEST');
  var entry = record[data.kind];
  if (entry && entry.withdrawn) reject_('WITHDRAWN');
  if (entry && entry.state === 'complete') return { receipt: entry.receipt, duplicate: true };
  if (data.kind === 'text') {
    validateText_(data.question, data.answer);
    if (!Number.isInteger(data.questionId) || data.questionId < 1 || data.questionId > 100) reject_('BAD_REQUEST');
  } else photoBlob_(data.image, 'validation');
  var digest = hex_(Utilities.computeHmacSha256Signature(JSON.stringify(data.kind === 'text' ? [data.questionId, data.question, data.answer] : [data.image]), p.getProperty('BRIDGE_SECRET'), Utilities.Charset.UTF_8));
  if (!entry) {
    var all = p.getProperties();
    var count = Object.keys(all).filter(function (k) { return k.indexOf('NYX_ACTOR_') === 0 && JSON.parse(all[k])[data.kind]; }).length;
    var max = Number(p.getProperty('MAX_PER_KIND') || '100');
    if (!Number.isInteger(max) || max < 1 || max > 500) reject_('SETUP');
    if (count >= max) reject_('FULL');
    entry = { receipt: 'NYX-' + Utilities.getUuid().replace(/-/g, ''), createdAt: new Date().toISOString(), termsVersion: data.termsVersion, consent: true, state: 'pending', digest: digest };
    record[data.kind] = entry;
    p.setProperty(key, JSON.stringify(record)); // Reserve before writing to make retries recoverable.
  }
  if (entry.digest !== digest) reject_('BAD_REQUEST');
  if (data.kind === 'photo') {
    var matches = findReceiptPhotos_(entry.receipt);
    if (matches.length > 1) reject_('SETUP');
    var file = matches[0] || DriveApp.getFolderById(p.getProperty('ROOT_FOLDER_ID')).createFile(photoBlob_(data.image, entry.receipt));
    entry.fileId = file.getId();
  } else writeResponse_(entry.receipt, data.question, data.answer);
  entry.state = 'complete';
  delete entry.digest;
  p.setProperty(key, JSON.stringify(record));
  return { receipt: entry.receipt, duplicate: false };
}
function findReceiptPhotos_(receipt) {
  var iterator = DriveApp.getFolderById(props_().getProperty('ROOT_FOLDER_ID')).getFilesByName(receipt + '.jpg');
  var files = [];
  while (iterator.hasNext()) files.push(iterator.next());
  return files;
}
function responseLocation_(receipt) {
  var p = props_();
  if (!p.getProperty('SPREADSHEET_ID')) reject_('SETUP');
  var result = Sheets.Spreadsheets.DeveloperMetadata.search({ dataFilters: [{ developerMetadataLookup: { metadataKey: NYX_METADATA_KEY, metadataValue: receipt, visibility: 'DOCUMENT' } }] }, p.getProperty('SPREADSHEET_ID'));
  var matches = (result.matchedDeveloperMetadata || []).map(function (item) { return item.developerMetadata; });
  if (matches.length > 1) reject_('SETUP');
  if (!matches.length) return null;
  var range = matches[0].location && matches[0].location.dimensionRange;
  if (!range || range.dimension !== 'ROWS' || range.sheetId !== Number(p.getProperty('RESPONSE_SHEET_ID')) || range.startIndex < 1 || range.endIndex !== range.startIndex + 1) reject_('SETUP');
  return range;
}
function writeResponse_(receipt, question, answer) {
  validateText_(question, answer);
  var p = props_();
  var id = p.getProperty('SPREADSHEET_ID');
  var existing = responseLocation_(receipt);
  if (existing) return; // The row may already exist after a timed-out successful write.
  var current = Sheets.Spreadsheets.Values.get(id, "'" + NYX_SHEET_TITLE + "'!A:B").values || [];
  if (!current[0] || current[0][0] !== 'Pregunta' || current[0][1] !== 'Respuesta') reject_('SETUP');
  var rowIndex = current.length;
  var sheetId = Number(p.getProperty('RESPONSE_SHEET_ID'));
  // A single atomic request writes both literal strings and a row-bound receipt.
  // stringValue prevents =IMPORTXML(...), URLs, numbers, etc. becoming formulas.
  Sheets.Spreadsheets.batchUpdate({ requests: [
    { insertDimension: { range: { sheetId: sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }, inheritFromBefore: true } },
    { updateCells: { start: { sheetId: sheetId, rowIndex: rowIndex, columnIndex: 0 }, rows: [{ values: [
      { userEnteredValue: { stringValue: question }, userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
      { userEnteredValue: { stringValue: answer }, userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }
    ] }], fields: 'userEnteredValue,userEnteredFormat' } },
    { createDeveloperMetadata: { developerMetadata: { metadataKey: NYX_METADATA_KEY, metadataValue: receipt, visibility: 'DOCUMENT', location: { dimensionRange: { sheetId: sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } } } }
  ] }, id);
}
function deleteResponse_(receipt) {
  var range = responseLocation_(receipt);
  if (range) Sheets.Spreadsheets.batchUpdate({ requests: [{ deleteDimension: { range: range } }] }, props_().getProperty('SPREADSHEET_ID'));
}
function isMissing_(error) { return /file not found|notfound|\b404\b/i.test(String(error.message)); }
function deleteFile_(id) {
  try { Drive.Files.remove(id); }
  catch (error) { if (!isMissing_(error)) throw error; }
}
function assertMarker_(id, marker, allowMissing) {
  if (!id) throw new Error('Falta un recurso dedicado; no se modificó ningún archivo ajeno.');
  try {
    var file = Drive.Files.get(id, { fields: 'id,description,parents' });
    if (file.description !== marker) throw new Error('Marcador de propiedad incorrecto: operación cancelada.');
    return file;
  } catch (error) { if (allowMissing && isMissing_(error)) return null; throw error; }
}
function defaults_() {
  var p = props_();
  var values = { EVENT_ID: 'nyx-ocampo-2026', OPENS_AT: '2026-10-08T00:00:00-06:00', CLOSES_AT: '2026-10-22T19:00:00-06:00', PURGE_AT: '2026-10-23T10:00:00-06:00', MAX_PER_KIND: '100', COLLECTION_OPEN: 'false' };
  Object.keys(values).forEach(function (key) { if (!p.getProperty(key)) p.setProperty(key, values[key]); });
  if ((p.getProperty('BRIDGE_SECRET') || '').length < 32) throw new Error('Configura BRIDGE_SECRET en Propiedades del script.');
  if (p.getProperty('PURGED_AT') || Date.now() >= Date.parse(p.getProperty('PURGE_AT'))) throw new Error('La fecha de limpieza ya pasó. No reutilices una colección finalizada.');
}
function ensureSpreadsheet_() {
  var p = props_();
  var id = p.getProperty('SPREADSHEET_ID');
  var book;
  if (id) {
    assertMarker_(id, 'NYX_SHEET:' + p.getProperty('EVENT_ID'), false);
    book = SpreadsheetApp.openById(id);
  } else {
    // create() leaves the independent spreadsheet in My Drive, never in the photo folder.
    book = SpreadsheetApp.create('NYX_' + p.getProperty('EVENT_ID') + '_Respuestas', 1001, 2);
    id = book.getId();
    var file = DriveApp.getFileById(id);
    file.setDescription('NYX_SHEET:' + p.getProperty('EVENT_ID'));
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    p.setProperty('SPREADSHEET_ID', id);
  }
  var sheet = book.getSheets()[0];
  if (p.getProperty('SHEET_INITIALIZED') !== 'true') {
    if (sheet.getLastRow() > 1) throw new Error('La hoja ya contiene datos: revisar antes de inicializar.');
    sheet.setName(NYX_SHEET_TITLE);
    sheet.getRange(1, 1, 1, 2).setValues([['Pregunta', 'Respuesta']]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 380).setColumnWidth(2, 560);
    sheet.getRange('A:B').setWrap(true).setVerticalAlignment('top');
    sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#dcece7');
    sheet.setRowHeight(1, 32);
    SpreadsheetApp.flush();
    p.setProperty('RESPONSE_SHEET_ID', String(sheet.getSheetId()));
    p.setProperty('SHEET_INITIALIZED', 'true');
  }
  var fileInfo = assertMarker_(id, 'NYX_SHEET:' + p.getProperty('EVENT_ID'), false);
  if ((fileInfo.parents || []).includes(p.getProperty('ROOT_FOLDER_ID'))) throw new Error('La hoja debe estar fuera de la carpeta de fotos.');
  if (sheet.getName() !== NYX_SHEET_TITLE || sheet.getMaxColumns() !== 2) throw new Error('La hoja debe llamarse Respuestas y contener exactamente dos columnas.');
  return book;
}
// ADMIN: only run from the editor. Not reachable through the web API.
function setupProject() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Configuración ocupada. Reintenta.');
  try {
    defaults_();
    var p = props_();
    if (p.getProperty('ROOT_FOLDER_ID')) throw new Error('La carpeta ya existe. Ejecuta migrateToFlatStorage(), no setupProject().');
    var root = DriveApp.createFolder('NYX_' + p.getProperty('EVENT_ID'));
    root.setDescription('NYX_MVP:' + p.getProperty('EVENT_ID'));
    root.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    p.setProperty('ROOT_FOLDER_ID', root.getId());
    ensureSpreadsheet_();
    p.setProperties({ STORAGE_VERSION: NYX_STORAGE_VERSION, TERMS_VERSION: NYX_TERMS_VERSION, COLLECTION_OPEN: 'false' });
    installCleanup();
    showSetup();
  } finally { lock.releaseLock(); }
}
function insideRoot_(id, rootId) {
  var seen = {};
  while (id && !seen[id]) {
    if (id === rootId) return true;
    seen[id] = true;
    var file = Drive.Files.get(id, { fields: 'id,parents' });
    id = file.parents && file.parents[0];
  }
  return false;
}
function existingFolder_(id) {
  if (!id) return null;
  try { Drive.Files.get(id, { fields: 'id' }); return DriveApp.getFolderById(id); }
  catch (error) { if (isMissing_(error)) return null; throw error; }
}
function emptyFolder_(folder) {
  if (folder.getFiles().hasNext() || folder.getFolders().hasNext()) throw new Error('Una carpeta antigua contiene archivos no reconocidos. No se borró; revisa el contenido.');
  deleteFile_(folder.getId());
}
function migrateToFlatStorage() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Migración ocupada. Reintenta.');
  try {
    defaults_();
    var p = props_();
    var rootId = p.getProperty('ROOT_FOLDER_ID');
    assertMarker_(rootId, 'NYX_MVP:' + p.getProperty('EVENT_ID'), false);
    p.setProperties({ COLLECTION_OPEN: 'false', MIGRATION_RUNNING: 'true' });
    ensureSpreadsheet_();
    var root = DriveApp.getFolderById(rootId);
    var oldKeys = ['PENDING_PHOTOS_ID', 'APPROVED_PHOTOS_ID', 'PENDING_TEXTS_ID', 'APPROVED_TEXTS_ID'];
    var oldFolders = [];
    // Validate every known source before moving anything. Never traverse arbitrary folders.
    oldKeys.forEach(function (key) {
      var folder = existingFolder_(p.getProperty(key));
      if (!folder) return;
      if (folder.getId() === rootId || !insideRoot_(folder.getId(), rootId)) throw new Error('Carpeta antigua fuera del proyecto: migración cancelada.');
      oldFolders.push({ key: key, folder: folder });
    });
    var records = p.getProperties();
    var actorKeys = Object.keys(records).filter(function (key) { return key.indexOf('NYX_ACTOR_') === 0; });
    oldFolders.forEach(function (source) {
      var iterator = source.folder.getFiles();
      var files = [];
      while (iterator.hasNext()) files.push(iterator.next());
      files.forEach(function (file) {
        if (source.key.indexOf('PHOTOS') !== -1) {
          if (file.getMimeType() !== 'image/jpeg') throw new Error('Archivo inesperado en la carpeta antigua de fotos. Se conservó.');
          file.moveTo(root);
        } else {
          if (file.getMimeType() !== 'application/json') throw new Error('Archivo inesperado en la carpeta antigua de textos. Se conservó.');
          var data = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
          if (!/^NYX-[a-f0-9]{32}$/.test(data.receipt || '')) throw new Error('JSON antiguo sin comprobante válido. Se conservó.');
          validateText_(data.question, data.answer);
          writeResponse_(data.receipt, data.question, data.answer);
          // Verify values before removing the legacy JSON, even after an interrupted migration.
          var row = responseLocation_(data.receipt);
          var values = Sheets.Spreadsheets.Values.get(p.getProperty('SPREADSHEET_ID'), "'" + NYX_SHEET_TITLE + "'!A" + (row.startIndex + 1) + ':B' + (row.startIndex + 1)).values || [];
          if (!values[0] || values[0][0] !== data.question || values[0][1] !== data.answer) throw new Error('No se pudo verificar la copia en Sheets. El JSON se conservó.');
          actorKeys.forEach(function (key) {
            var record = JSON.parse(p.getProperty(key));
            if (record.text && record.text.receipt === data.receipt && !record.text.withdrawn) {
              record.text.state = 'complete';
              delete record.text.fileId;
              p.setProperty(key, JSON.stringify(record));
            }
          });
          deleteFile_(file.getId());
        }
      });
    });
    oldFolders.forEach(function (source) { emptyFolder_(source.folder); });
    // Remove only the empty v1 container directories, not unknown user folders.
    ['pendientes', 'aprobadas'].forEach(function (name) {
      var iterator = root.getFoldersByName(name);
      var folders = [];
      while (iterator.hasNext()) folders.push(iterator.next());
      folders.forEach(emptyFolder_);
    });
    if (root.getFolders().hasNext()) throw new Error('Queda una subcarpeta ajena al diseño anterior; se conservó. Revisa antes de abrir la recepción.');
    actorKeys.forEach(function (key) {
      var record = JSON.parse(p.getProperty(key));
      if (record.photo && !record.photo.withdrawn && !record.photo.state) { record.photo.state = 'complete'; p.setProperty(key, JSON.stringify(record)); }
    });
    oldKeys.forEach(function (key) { p.deleteProperty(key); });
    p.setProperties({ STORAGE_VERSION: NYX_STORAGE_VERSION, TERMS_VERSION: NYX_TERMS_VERSION, MIGRATION_RUNNING: 'false' });
    installCleanup();
    showSetup();
  } finally { lock.releaseLock(); }
}
function installCleanup() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'purgeExpired'; }).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('purgeExpired').timeBased().everyHours(1).create();
}
function showSetup() {
  var p = props_();
  var safe = {};
  ['EVENT_ID', 'STORAGE_VERSION', 'ROOT_FOLDER_ID', 'SPREADSHEET_ID', 'RESPONSE_SHEET_ID', 'OPENS_AT', 'CLOSES_AT', 'PURGE_AT', 'TERMS_VERSION', 'MAX_PER_KIND', 'COLLECTION_OPEN', 'MIGRATION_RUNNING', 'PURGED_AT'].forEach(function (key) { safe[key] = p.getProperty(key); });
  if (safe.ROOT_FOLDER_ID) safe.PHOTOS_URL = 'https://drive.google.com/drive/folders/' + safe.ROOT_FOLDER_ID;
  if (safe.SPREADSHEET_ID) safe.RESPONSES_URL = 'https://docs.google.com/spreadsheets/d/' + safe.SPREADSHEET_ID + '/edit';
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
    var sheetId = p.getProperty('SPREADSHEET_ID');
    // Validate BOTH ownership markers before deleting either resource.
    assertMarker_(rootId, 'NYX_MVP:' + p.getProperty('EVENT_ID'), true);
    if (sheetId) assertMarker_(sheetId, 'NYX_SHEET:' + p.getProperty('EVENT_ID'), true);
    var all = p.getProperties();
    var keys = Object.keys(all).filter(function (key) { return key.indexOf('NYX_ACTOR_') === 0; });
    keys.forEach(function (key) {
      var record = JSON.parse(all[key]);
      ['photo', 'text'].forEach(function (kind) { if (record[kind] && record[kind].fileId) deleteFile_(record[kind].fileId); });
    });
    if (sheetId) deleteFile_(sheetId); // Outside the photo folder: must be removed explicitly.
    deleteFile_(rootId);
    keys.forEach(function (key) { p.deleteProperty(key); });
    ['ROOT_FOLDER_ID', 'SPREADSHEET_ID', 'RESPONSE_SHEET_ID', 'SHEET_INITIALIZED', 'PENDING_PHOTOS_ID', 'PENDING_TEXTS_ID', 'APPROVED_PHOTOS_ID', 'APPROVED_TEXTS_ID'].forEach(function (key) { p.deleteProperty(key); });
    p.setProperty('PURGED_AT', new Date().toISOString());
    ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'purgeExpired'; }).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  } finally { lock.releaseLock(); }
}
