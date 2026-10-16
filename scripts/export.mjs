import { mkdir, readdir, readFile, writeFile, lstat, realpath, rename, rm } from 'node:fs/promises';
import { resolve, join, sep, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DEFAULTS } from '../shared/settings.mjs';
import { validateJpeg } from '../server/jpeg.mjs';

export const MARKER = '.nyx-export.json';
export async function assertOwned(dir) {
  const stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('El destino no es un directorio propio seguro.');
  const markerStat = await lstat(join(dir, MARKER));
  if (!markerStat.isFile() || markerStat.isSymbolicLink()) throw new Error('Marcador de exportación inválido.');
  const marker = JSON.parse(await readFile(join(dir, MARKER), 'utf8'));
  if (!['nyx-export-v1', 'nyx-export-v2'].includes(marker.format) || !/^[a-z0-9-]{3,60}$/.test(marker.eventId)) throw new Error('Este directorio no pertenece a una exportación NYX.');
  return marker;
}
/** Parse the comma-delimited CSV downloaded from Google Sheets, including quoted newlines. */
export function parseResponsesCsv(input) {
  const source = String(input).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, afterQuote = false;
  const endField = () => { row.push(field); field = ''; afterQuote = false; };
  const endRow = () => { endField(); if (row.some(value => value !== '')) rows.push(row); row = []; };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') { if (source[i + 1] === '"') { field += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else field += char;
    } else if (char === ',') endField();
    else if (char === '\n' || char === '\r') { if (char === '\r' && source[i + 1] === '\n') i++; endRow(); }
    else if (afterQuote) throw new Error('CSV inválido: caracteres después de cerrar comillas.');
    else if (char === '"') { if (field) throw new Error('CSV inválido: comillas dentro de un campo sin escapar.'); quoted = true; }
    else field += char;
  }
  if (quoted) throw new Error('CSV inválido: faltan comillas de cierre.');
  if (field || row.length || afterQuote) endRow();
  const header = rows.shift();
  if (!header || header.length !== 2 || header[0].trim().toLowerCase() !== 'pregunta' || header[1].trim().toLowerCase() !== 'respuesta') throw new Error('El CSV debe tener exactamente dos columnas: Pregunta,Respuesta.');
  return rows.map((values, index) => {
    if (values.length !== 2 || !values[0].trim() || values[0].length > 300 || values[1].trim().length < 3 || values[1].length > 500) throw new Error(`Fila ${index + 2} inválida; no se ha reemplazado la exportación anterior.`);
    return { question: values[0], answer: values[1] };
  });
}
async function safePhotos(dir) {
  return (await readdir(dir, { withFileTypes: true })).filter(entry => entry.isFile() && !entry.isSymbolicLink() && /^NYX-[a-f0-9]{32}\.jpg$/i.test(entry.name)).map(entry => entry.name).sort();
}
export async function exportShow(sourcePath, outPath, eventId = DEFAULTS.eventId, csvPath = null) {
  if (!sourcePath || !outPath) throw new Error('Indica --source carpeta-plana-de-fotos y --out carpeta-local.');
  if (!/^[a-z0-9-]{3,60}$/.test(eventId)) throw new Error('Evento inválido.');
  const source = await realpath(sourcePath);
  const requestedOut = resolve(outPath);
  const outParent = await realpath(dirname(requestedOut));
  const out = join(outParent, basename(requestedOut));
  if (source === out || source.startsWith(out + sep) || out.startsWith(source + sep)) throw new Error('Origen y destino deben estar separados.');
  const sourceStat = await lstat(source);
  if (!sourceStat.isDirectory()) throw new Error('El origen debe ser la carpeta de fotografías.');
  const responses = csvPath ? parseResponsesCsv(await readFile(csvPath, 'utf8')) : [];
  let existed = false;
  try {
    const marker = await assertOwned(out);
    if (marker.eventId !== eventId) throw new Error('El destino contiene otro evento.');
    existed = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try { await lstat(out); throw new Error('El destino ya existe y no tiene marcador NYX. Usa una carpeta nueva.'); }
    catch (inner) { if (inner.code !== 'ENOENT') throw inner; }
  }
  const temp = out + '.tmp-' + randomUUID();
  const backup = out + '.old-' + randomUUID();
  await mkdir(join(temp, 'photos'), { recursive: true });
  const generatedAt = new Date().toISOString();
  const manifest = { eventId, generatedAt, photos: [], responsesFile: csvPath ? 'responses.json' : null };
  try {
    for (const name of await safePhotos(source)) {
      const bytes = await readFile(join(source, name));
      validateJpeg(bytes.toString('base64'));
      await writeFile(join(temp, 'photos', name), bytes);
      manifest.photos.push({ id: name.slice(0, -4), path: 'photos/' + name });
    }
    if (csvPath) await writeFile(join(temp, 'responses.json'), JSON.stringify({ eventId, generatedAt, responses }, null, 2));
    await writeFile(join(temp, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await writeFile(join(temp, MARKER), JSON.stringify({ format: 'nyx-export-v2', eventId, source, generatedAt }));
    if (existed) await rename(out, backup);
    try { await rename(temp, out); }
    catch (error) { if (existed) await rename(backup, out); throw error; }
    if (existed) await rm(backup, { recursive: true });
    return { photos: manifest.photos.length, responses: csvPath ? responses.length : null, out };
  } catch (error) { await rm(temp, { recursive: true, force: true }); throw error; }
}
const argument = name => {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Falta el valor de ${name}.`);
  return value;
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await exportShow(argument('--source'), argument('--out') || './show-data', process.env.EVENT_ID || DEFAULTS.eventId, argument('--sheet-csv'));
    console.log(`Exportación local: ${result.photos} fotos, ${result.responses === null ? 'sin CSV de respuestas' : result.responses + ' respuestas'} → ${result.out}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
