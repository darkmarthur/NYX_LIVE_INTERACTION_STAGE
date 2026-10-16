import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHmac, randomUUID } from 'node:crypto';
const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

function fixture({ legacy = false, empty = false } = {}) {
  const clock = { value: Date.parse('2026-10-15T18:00:00Z') };
  const settings = { BRIDGE_SECRET: 'test-secret-'.repeat(4), EVENT_ID: 'nyx-ocampo-2026', TERMS_VERSION: legacy ? '2026-10-08-v1' : '2026-10-15-v2', OPENS_AT: '2026-10-08T00:00:00-06:00', CLOSES_AT: '2026-10-22T19:00:00-06:00', PURGE_AT: '2026-10-23T10:00:00-06:00', COLLECTION_OPEN: 'true', MAX_PER_KIND: '100' };
  const controls = { lock: true, failFinalize: false, sheetBefore: false, sheetAfter: false, photoAfter: false, deleteId: null };
  const p = {
    getProperty: key => settings[key] ?? null,
    setProperty: (key, value) => {
      if (controls.failFinalize && key.startsWith('NYX_ACTOR_') && value.includes('"state":"complete"')) { controls.failFinalize = false; throw new Error('Properties write failed'); }
      settings[key] = value; return p;
    },
    setProperties: values => { Object.assign(settings, values); return p; },
    getProperties: () => ({ ...settings }), deleteProperty: key => { delete settings[key]; return p; }
  };
  const files = new Map();
  const books = new Map();
  const removed = [];
  const triggers = [];
  const batches = [];
  const add = (id, name, parent, type = 'folder', value = '') => { files.set(id, { id, name, parent, type, value, description: '' }); return id; };
  const get = id => { const value = files.get(id); if (!value) throw new Error('File not found 404'); return value; };
  const iter = values => { let i = 0; return { hasNext: () => i < values.length, next: () => values[i++] }; };
  const blob = (value, type, name) => ({ value, type, name, getDataAsString: () => typeof value === 'string' ? value : Buffer.from(value).toString('utf8') });
  const wrapFile = id => ({
    getId: () => id, getName: () => get(id).name, getMimeType: () => get(id).type,
    getBlob: () => blob(get(id).value, get(id).type, get(id).name),
    setDescription: description => { get(id).description = description; return wrapFile(id); },
    setSharing: () => wrapFile(id),
    moveTo: folder => { get(id).parent = folder.getId(); return wrapFile(id); }
  });
  const children = (id, predicate) => [...files.values()].filter(file => file.parent === id && predicate(file));
  const wrapFolder = id => ({
    ...wrapFile(id),
    createFolder: name => wrapFolder(add(randomUUID(), name, id)),
    createFile: value => { const fileId = add(randomUUID(), value.name, id, value.type, value.value); if (controls.photoAfter) { controls.photoAfter = false; throw new Error('Photo request lost after commit'); } return wrapFile(fileId); },
    getFiles: () => iter(children(id, file => file.type !== 'folder').map(file => wrapFile(file.id))),
    getFilesByName: name => iter(children(id, file => file.type !== 'folder' && file.name === name).map(file => wrapFile(file.id))),
    getFolders: () => iter(children(id, file => file.type === 'folder').map(file => wrapFolder(file.id))),
    getFoldersByName: name => iter(children(id, file => file.type === 'folder' && file.name === name).map(file => wrapFolder(file.id)))
  });
  const sheetOf = id => { get(id); const sheet = books.get(id); if (!sheet) throw new Error('Not a spreadsheet'); return sheet; };
  const trimmed = rows => { const copy = rows.map(row => [...row]); while (copy.length && !copy.at(-1).some(value => value !== '')) copy.pop(); return copy; };
  function sheetWrapper(id) {
    const sheet = sheetOf(id);
    const wrapper = {
      getLastRow: () => trimmed(sheet.rows).length, getName: () => sheet.name,
      getSheetId: () => 0, getMaxColumns: () => sheet.columns,
      setName: name => { sheet.name = name; return wrapper; },
      setFrozenRows: count => { sheet.frozen = count; return wrapper; },
      setColumnWidth: () => wrapper, setRowHeight: () => wrapper,
      getRange: () => {
        const range = { setValues: values => { sheet.rows = Array.from(values, row => Array.from(row)); return range; }, setWrap: () => range, setVerticalAlignment: () => range, setFontWeight: () => range, setBackground: () => range };
        return range;
      }
    };
    return wrapper;
  }
  function makeBook(id, rows = [['Pregunta', 'Respuesta']]) {
    add(id, 'NYX respuestas', 'mydrive', 'application/vnd.google-apps.spreadsheet');
    get(id).description = 'NYX_SHEET:nyx-ocampo-2026';
    books.set(id, { name: 'Respuestas', columns: 2, rowCount: 1001, rows, metadata: [] });
    return { getId: () => id, getSheets: () => [sheetWrapper(id)] };
  }
  if (!empty) {
    add('root', 'NYX_nyx-ocampo-2026', 'mydrive'); get('root').description = 'NYX_MVP:nyx-ocampo-2026'; settings.ROOT_FOLDER_ID = 'root';
    if (legacy) {
      add('pending', 'pendientes', 'root'); add('approved', 'aprobadas', 'root');
      for (const [key, id, parent, name] of [['PENDING_PHOTOS_ID','pp','pending','fotos'],['PENDING_TEXTS_ID','pt','pending','textos'],['APPROVED_PHOTOS_ID','ap','approved','fotos'],['APPROVED_TEXTS_ID','at','approved','textos']]) { add(id,name,parent); settings[key] = id; }
    } else {
      makeBook('book'); Object.assign(settings, { STORAGE_VERSION: '2', SPREADSHEET_ID: 'book', RESPONSE_SHEET_ID: '0', SHEET_INITIALIZED: 'true' });
    }
  }
  const sandbox = {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock.value])); } static now() { return clock.value; } },
    PropertiesService: { getScriptProperties: () => p },
    Utilities: { Charset: { UTF_8: 'UTF-8' }, getUuid: randomUUID, computeHmacSha256Signature: (text, key) => Array.from(createHmac('sha256', key).update(text).digest()), base64Decode: value => Array.from(Buffer.from(value, 'base64')), newBlob: blob },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => controls.lock, releaseLock() {} }) },
    DriveApp: {
      Access: { PRIVATE: 'private' }, Permission: { NONE: 'none' },
      createFolder: name => wrapFolder(add(randomUUID(), name, 'mydrive')),
      getFolderById: id => { assert.equal(get(id).type, 'folder'); return wrapFolder(id); }, getFileById: wrapFile
    },
    Drive: { Files: {
      get: id => id === 'mydrive' ? { id, parents: [] } : ({ id, description: get(id).description, parents: get(id).parent ? [get(id).parent] : [] }),
      remove: id => {
        get(id); if (controls.deleteId === id || controls.deleteId === '*') throw new Error('Permission denied');
        const erase = parent => { children(parent, () => true).forEach(file => erase(file.id)); files.delete(parent); books.delete(parent); removed.push(parent); };
        erase(id);
      }
    } },
    SpreadsheetApp: {
      create: (name, rows, columns) => { assert.equal(columns,2); assert.equal(rows,1001); const book = makeBook(randomUUID(), []); get(book.getId()).name = name; return book; },
      openById: id => { sheetOf(id); return { getId: () => id, getSheets: () => [sheetWrapper(id)] }; }, flush() {}
    },
    Sheets: { Spreadsheets: {
      DeveloperMetadata: { search: (query, id) => {
        const lookup = query.dataFilters[0].developerMetadataLookup;
        return { matchedDeveloperMetadata: sheetOf(id).metadata.filter(item => item.metadataKey === lookup.metadataKey && item.metadataValue === lookup.metadataValue).map(item => ({ developerMetadata: structuredClone(item) })) };
      } },
      Values: { get: (id, range) => {
        const rows = trimmed(sheetOf(id).rows); const match = range.match(/!A(\d+):B(\d+)$/);
        return { values: match ? rows.slice(Number(match[1])-1, Number(match[2])) : rows };
      } },
      batchUpdate: (request, id) => {
        if (controls.sheetBefore) throw new Error('Sheets temporarily unavailable');
        const original = sheetOf(id); const sheet = structuredClone(original);
        for (const item of request.requests) {
          if (item.insertDimension) {
            const range = item.insertDimension.range; assert.equal(range.dimension, 'ROWS'); assert.equal(range.sheetId, 0); assert.ok(range.startIndex >= 1 && range.startIndex < sheet.rowCount);
            sheet.rows.splice(range.startIndex, 0, []); sheet.rowCount++;
            for (const md of sheet.metadata) { const r = md.location.dimensionRange; if (r.startIndex >= range.startIndex) { r.startIndex++; r.endIndex++; } }
          } else if (item.updateCells) {
            const update = item.updateCells;
            assert.equal(update.start.columnIndex,0); assert.equal(update.rows[0].values.length,2);
            const values = Array.from(update.rows[0].values, cell => { assert.equal(typeof cell.userEnteredValue.stringValue,'string'); assert.equal(cell.userEnteredValue.formulaValue,undefined); return cell.userEnteredValue.stringValue; });
            sheet.rows[update.start.rowIndex] = values;
          } else if (item.createDeveloperMetadata) sheet.metadata.push(structuredClone(item.createDeveloperMetadata.developerMetadata));
          else if (item.deleteDimension) {
            const range = item.deleteDimension.range; const start = range.startIndex;
            assert.equal(range.endIndex,start+1); assert.ok(start>=1);
            sheet.rows.splice(start,1); sheet.rowCount--;
            sheet.metadata = sheet.metadata.filter(md => md.location.dimensionRange.startIndex !== start);
            for (const md of sheet.metadata) { const r = md.location.dimensionRange; if (r.startIndex > start) { r.startIndex--; r.endIndex--; } }
          } else throw new Error('Unsupported test request');
        }
        books.set(id,sheet); batches.push(structuredClone(request));
        if (controls.sheetAfter) { controls.sheetAfter = false; throw new Error('Sheet response lost after commit'); }
        return {};
      }
    } },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      deleteTrigger: trigger => { const i=triggers.indexOf(trigger); if(i>=0)triggers.splice(i,1); },
      newTrigger: handler => { const trigger={getHandlerFunction:()=>handler}; const builder={timeBased:()=>builder,everyHours:()=>builder,create:()=>{triggers.push(trigger);return trigger;}}; return builder; }
    }, console: { log() {} }
  };
  const context = vm.createContext(sandbox); vm.runInContext(code, context);
  function envelope(data) {
    const common = { eventId: settings.EVENT_ID, termsVersion: settings.TERMS_VERSION, opensAt: settings.OPENS_AT, closesAt: settings.CLOSES_AT, purgeAt: settings.PURGE_AT, actor: 'a'.repeat(64) };
    const ts = clock.value, nonce = 'b'.repeat(32), payload = Buffer.from(JSON.stringify({ ...common, ...data })).toString('base64');
    return { ts, nonce, payload, signature: createHmac('sha256', settings.BRIDGE_SECRET).update(`${ts}.${nonce}.${payload}`).digest('hex') };
  }
  const send = data => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(envelope(data)) } }).text);
  return { send, envelope, context, settings, files, books, removed, controls, clock, add, triggers, batches, sheet: () => sheetOf(settings.SPREADSHEET_ID) };
}
const answer = { operation:'submit',kind:'text',consent:true,questionId:1,question:'¿Qué recuerdas?',answer:'Un patio lleno de luz.' };
const image = Buffer.concat([Buffer.from([255,216]),Buffer.alloc(60),Buffer.from([255,217])]).toString('base64');
const photo = { operation:'submit',kind:'photo',consent:true,image };
const actorKey = 'NYX_ACTOR_'+'a'.repeat(64);
function addLegacy(f,{kind='text',approved=false,receipt='NYX-'+'1'.repeat(32),actor='a'.repeat(64)}={}) {
  const id=randomUUID();
  const data={receipt,question:answer.question,answer:answer.answer,questionId:1};
  f.add(id,receipt+(kind==='text'?'.json':'.jpg'),kind==='text'?(approved?'at':'pt'):(approved?'ap':'pp'),kind==='text'?'application/json':'image/jpeg',kind==='text'?JSON.stringify(data):image);
  const key='NYX_ACTOR_'+actor; const record=JSON.parse(f.settings[key]||'{}'); record[kind]={fileId:id,receipt,consent:true,termsVersion:'2026-10-08-v1',withdrawn:false}; f.settings[key]=JSON.stringify(record);
  return {id,receipt};
}

test('Setup nuevo: carpeta plana privada y Sheet independiente de dos columnas',()=>{
 const f=fixture({empty:true}); f.context.setupProject();
 assert.ok(f.settings.ROOT_FOLDER_ID); assert.ok(f.settings.SPREADSHEET_ID);
 assert.notEqual(f.settings.ROOT_FOLDER_ID,f.settings.SPREADSHEET_ID);
 assert.equal(f.files.get(f.settings.SPREADSHEET_ID).parent,'mydrive');
 assert.equal([...f.files.values()].filter(x=>x.parent===f.settings.ROOT_FOLDER_ID).length,0);
 assert.deepEqual(f.sheet().rows,[['Pregunta','Respuesta']]); assert.equal(f.sheet().columns,2);
 assert.equal(f.settings.COLLECTION_OPEN,'false'); assert.equal(f.settings.STORAGE_VERSION,'2'); assert.equal(f.triggers.length,1);
});
test('HMAC real: una respuesta es una fila; no se crea JSON en Drive',()=>{
 const f=fixture(); assert.equal(f.send(answer).ok,true);
 assert.deepEqual(f.sheet().rows.slice(0,2),[['Pregunta','Respuesta'],[answer.question,answer.answer]]);
 assert.equal(f.files.size,2); assert.equal(f.sheet().metadata.length,1);
 const status=JSON.stringify(f.send({operation:'status'})); assert.ok(!status.includes('fileId')); assert.ok(!status.includes('SPREADSHEET')); assert.ok(!status.includes(answer.answer));
});
test('Foto recibida directamente en raíz, sin subcarpetas',()=>{
 const f=fixture(); assert.equal(f.send(photo).ok,true);
 const item=[...f.files.values()].find(x=>x.type==='image/jpeg'); assert.equal(item.parent,'root');
 assert.equal(f.sheet().rows.length,1);
});
test('Texto literal: fórmulas, comillas, emoji y saltos de línea no se ejecutan ni alteran',()=>{
 const f=fixture(); const value='=IMPORTXML("https://invalid.example", "//x")\nAbuela 💚';
 assert.equal(f.send({...answer,answer:value}).ok,true); assert.equal(f.sheet().rows[1][1],value);
 assert.ok(!JSON.stringify(f.batches).includes('formulaValue'));
});
test('Cada navegador puede aportar una respuesta y una fotografía',()=>{
 const f=fixture(); f.send(answer); f.send(photo); f.send({...answer,actor:'c'.repeat(64),answer:'Otro recuerdo.'});
 assert.equal(f.sheet().rows.length,3); assert.equal([...f.files.values()].filter(x=>x.type==='image/jpeg').length,1);
});
test('Reintentos confirmados no duplican ni sustituyen la respuesta original',()=>{
 const f=fixture(); const a=f.send(answer); const b=f.send({...answer,answer:'No sustituir.'});
 assert.equal(a.data.receipt,b.data.receipt); assert.equal(b.data.duplicate,true); assert.equal(f.sheet().rows.length,2); assert.equal(f.sheet().rows[1][1],answer.answer);
});
test('Fallo antes de escribir: no confirma recepción y se puede reintentar',()=>{
 const f=fixture(); f.controls.sheetBefore=true;
 assert.equal(f.send(answer).code,'BACKEND'); assert.deepEqual(f.send({operation:'status'}).data,{}); assert.equal(f.sheet().rows.length,1);
 f.controls.sheetBefore=false; assert.equal(f.send(answer).ok,true); assert.equal(f.sheet().rows.length,2);
});
test('Fallo tras escritura de Sheet: el reintento recupera la misma fila',()=>{
 const f=fixture(); f.controls.sheetAfter=true; assert.equal(f.send(answer).code,'BACKEND'); assert.equal(f.sheet().rows.length,2);
 assert.equal(f.send(answer).ok,true); assert.equal(f.sheet().rows.length,2);
});
test('Fallo al finalizar el registro: no duplica una fila ya guardada',()=>{
 const f=fixture(); f.controls.failFinalize=true; assert.equal(f.send(answer).code,'BACKEND'); assert.equal(f.sheet().rows.length,2);
 assert.equal(f.send(answer).ok,true); assert.equal(f.sheet().rows.length,2);
});
test('Fallo tras crear foto: el reintento recupera el archivo por su comprobante',()=>{
 const f=fixture(); f.controls.photoAfter=true; assert.equal(f.send(photo).code,'BACKEND');
 assert.equal(f.send(photo).ok,true); assert.equal([...f.files.values()].filter(x=>x.type==='image/jpeg').length,1);
});
test('Un envío pendiente no puede cambiar de contenido durante su recuperación',()=>{
 const f=fixture(); f.controls.sheetBefore=true; f.send(answer); f.controls.sheetBefore=false;
 assert.equal(f.send({...answer,answer:'Una sustitución.'}).code,'BAD_REQUEST'); assert.equal(f.send(answer).ok,true);
});
test('Firma incorrecta y operaciones administrativas rechazadas',()=>{
 const f=fixture(); const body=f.envelope(answer); body.signature='0'.repeat(64);
 assert.equal(JSON.parse(f.context.doPost({postData:{contents:JSON.stringify(body)}}).text).code,'FORBIDDEN');
 assert.equal(f.send({operation:'migrateToFlatStorage'}).code,'NOT_FOUND'); assert.equal(f.sheet().rows.length,1);
});
test('Sin consentimiento, versión distinta, cupo, cierre y bloqueo',()=>{
 const f=fixture(); assert.equal(f.send({...answer,consent:false}).code,'CONSENT');
 assert.equal(f.send({...answer,termsVersion:'2026-10-08-v1'}).code,'SETUP');
 f.settings.MAX_PER_KIND='1'; f.send(answer); assert.equal(f.send({...answer,actor:'c'.repeat(64)}).code,'FULL');
 f.settings.COLLECTION_OPEN='false'; assert.equal(f.send(photo).code,'CLOSED');
 f.controls.lock=false; assert.equal(f.send(photo).code,'BUSY');
});
test('Rechaza JPEG y texto inválidos antes de reservar una aportación',()=>{
 const f=fixture(); assert.equal(f.send({...photo,image:'bad'}).code,'INVALID_IMAGE'); assert.equal(f.send({...answer,answer:'ab'}).code,'INVALID_TEXT'); assert.ok(!f.settings[actorKey]);
});
test('Retirada elimina foto y fila, pero no encabezado ni otras respuestas',()=>{
 const f=fixture(); f.send(answer); f.send(photo); f.send({...answer,actor:'c'.repeat(64),answer:'Otra persona.'});
 assert.equal(f.send({operation:'withdraw'}).ok,true); assert.deepEqual(f.sheet().rows,[['Pregunta','Respuesta'],[answer.question,'Otra persona.']]);
 assert.equal(f.files.size,2); assert.equal(f.send(answer).code,'WITHDRAWN'); assert.equal(f.send(photo).code,'WITHDRAWN');
 assert.equal(f.send({operation:'withdraw'}).ok,true);
});
test('Retirada resuelve la fila tras eliminar otra fila anterior',()=>{
 const f=fixture(); f.send(answer); f.send({...answer,actor:'c'.repeat(64),answer:'Otra persona.'});
 f.send({operation:'withdraw'}); assert.equal(f.send({operation:'withdraw',actor:'c'.repeat(64)}).ok,true); assert.equal(f.sheet().rows.length,1);
});
test('Retirada también limpia un envío parcialmente confirmado',()=>{
 const f=fixture(); f.controls.sheetAfter=true; f.send(answer); assert.equal(f.send({operation:'withdraw'}).ok,true); assert.equal(f.sheet().rows.length,1); assert.equal(f.send(answer).code,'WITHDRAWN');
});
test('Migración vacía reutiliza carpeta y secreto; crea Sheet y retira subcarpetas',()=>{
 const f=fixture({legacy:true}); const secret=f.settings.BRIDGE_SECRET; f.context.migrateToFlatStorage();
 assert.equal(f.settings.ROOT_FOLDER_ID,'root'); assert.equal(f.settings.BRIDGE_SECRET,secret); assert.equal(f.files.size,2);
 assert.equal(f.settings.COLLECTION_OPEN,'false'); assert.equal(f.settings.TERMS_VERSION,'2026-10-15-v2'); assert.ok(!f.settings.PENDING_PHOTOS_ID);
 const book=f.settings.SPREADSHEET_ID; f.context.migrateToFlatStorage(); assert.equal(f.settings.SPREADSHEET_ID,book); assert.equal(f.files.size,2);
});
test('Migración con aportaciones mueve fotos y convierte ambos grupos de JSON sin duplicar',()=>{
 const f=fixture({legacy:true}); const a=addLegacy(f); const b=addLegacy(f,{approved:true,receipt:'NYX-'+'2'.repeat(32),actor:'c'.repeat(64)}); const img=addLegacy(f,{kind:'photo',receipt:'NYX-'+'3'.repeat(32)});
 f.context.migrateToFlatStorage(); assert.equal(f.files.get(img.id).parent,'root'); assert.ok(!f.files.has(a.id)); assert.ok(!f.files.has(b.id)); assert.equal(f.sheet().rows.length,3);
 assert.equal(JSON.parse(f.settings[actorKey]).photo.state,'complete'); assert.equal(JSON.parse(f.settings[actorKey]).text.termsVersion,'2026-10-08-v1');
 f.context.migrateToFlatStorage(); assert.equal(f.sheet().rows.length,3);
 f.settings.COLLECTION_OPEN='true'; assert.equal(f.send(answer).data.duplicate,true);
});
test('Migración interrumpida conserva el JSON y se recupera sin duplicar filas',()=>{
 const f=fixture({legacy:true}); const old=addLegacy(f); f.controls.deleteId=old.id;
 assert.throws(()=>f.context.migrateToFlatStorage(),/Permission denied/); assert.ok(f.files.has(old.id)); assert.equal(f.sheet().rows.length,2); assert.equal(f.settings.MIGRATION_RUNNING,'true'); assert.equal(f.send(answer).code,'SETUP');
 f.controls.deleteId=null; f.context.migrateToFlatStorage(); assert.equal(f.sheet().rows.length,2); assert.ok(!f.files.has(old.id));
});
test('Migración nunca borra archivos desconocidos ni fuentes fuera de la carpeta',()=>{
 const f=fixture({legacy:true}); f.add('other','nota.txt','pp','text/plain','No borrar');
 assert.throws(()=>f.context.migrateToFlatStorage(),/inesperado/); assert.ok(f.files.has('other'));
 const g=fixture({legacy:true}); g.files.get('pp').parent='mydrive'; assert.throws(()=>g.context.migrateToFlatStorage(),/fuera del proyecto/); assert.ok(g.files.has('pp'));
});
test('Migración protege una hoja con marcador ajeno',()=>{
 const f=fixture(); f.files.get('book').description='Hoja ajena'; assert.throws(()=>f.context.migrateToFlatStorage(),/Marcador/); assert.equal(f.removed.length,0);
});
test('Limpieza elimina explícitamente Sheet externo, carpeta y registros',()=>{
 const f=fixture(); f.send(answer); f.send(photo); f.context.purgeExpired(); assert.equal(f.files.size,3);
 f.clock.value=Date.parse('2026-10-24T00:00:00Z'); f.context.purgeExpired(); assert.equal(f.files.size,0); assert.ok(f.removed.includes('book')); assert.ok(f.settings.PURGED_AT); assert.ok(!f.settings[actorKey]);
});
test('Limpieza parcial reintenta sin anunciar éxito antes de borrar ambos destinos',()=>{
 const f=fixture(); f.send(answer); f.clock.value=Date.parse('2026-10-24T00:00:00Z'); f.controls.deleteId='root';
 assert.throws(()=>f.context.purgeExpired(),/Permission denied/); assert.ok(!f.files.has('book')); assert.ok(!f.settings.PURGED_AT); assert.ok(f.settings[actorKey]);
 f.controls.deleteId=null; f.context.purgeExpired(); assert.equal(f.files.size,0); assert.ok(f.settings.PURGED_AT);
});
test('Limpieza valida ambos marcadores antes de borrar cualquiera',()=>{
 const f=fixture(); f.send(photo); f.files.get('book').description='Mis finanzas'; f.clock.value=Date.parse('2026-10-24T00:00:00Z');
 assert.throws(()=>f.context.purgeExpired(),/Marcador/); assert.equal(f.removed.length,0);
});
test('showSetup muestra los dos enlaces sin exponer la clave',()=>{
 const f=fixture(); const config=JSON.parse(JSON.stringify(f.context.showSetup())); assert.ok(config.PHOTOS_URL.endsWith('/root')); assert.ok(config.RESPONSES_URL.includes('/book/')); assert.ok(!JSON.stringify(config).includes(f.settings.BRIDGE_SECRET));
});
test('Manifiesto habilita Drive v3 y Sheets v4 con permiso de hojas',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../apps-script/appsscript.json',import.meta.url),'utf8'));
 assert.ok(manifest.dependencies.enabledAdvancedServices.some(x=>x.userSymbol==='Sheets'&&x.version==='v4')); assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
});
