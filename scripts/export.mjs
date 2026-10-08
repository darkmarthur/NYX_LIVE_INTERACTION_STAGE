import { mkdir, readdir, readFile, writeFile, lstat, realpath, rename, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
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
  if (marker.format !== 'nyx-export-v1' || !/^[a-z0-9-]{3,60}$/.test(marker.eventId)) throw new Error('Este directorio no pertenece a una exportación NYX.');
  return marker;
}
async function safeFiles(dir, extension) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && !entry.isSymbolicLink() && new RegExp('^NYX-[a-f0-9]{32}\\.' + extension + '$', 'i').test(entry.name)).map(entry => entry.name).sort();
}
export async function exportShow(sourcePath, outPath, eventId = DEFAULTS.eventId) {
  if (!sourcePath || !outPath) throw new Error('Indica --source carpeta/aprobadas y --out carpeta-local.');
  if (!/^[a-z0-9-]{3,60}$/.test(eventId)) throw new Error('Evento inválido.');
  const source = await realpath(sourcePath);
  const out = resolve(outPath);
  if (source === out || source.startsWith(out + sep) || out.startsWith(source + sep)) throw new Error('Origen y destino deben estar separados.');
  const photoDir = await realpath(join(source, 'fotos'));
  const textDir = await realpath(join(source, 'textos'));
  if (!photoDir.startsWith(source + sep) || !textDir.startsWith(source + sep)) throw new Error('No se admiten carpetas de origen redirigidas.');
  let existed = false;
  try {
    const marker = await assertOwned(out);
    if (marker.eventId !== eventId) throw new Error('El destino contiene otro evento.');
    existed = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Un directorio existente sin marcador no se puede sobrescribir.
    try { await lstat(out); throw new Error('El destino ya existe y no tiene marcador NYX. Usa una carpeta nueva.'); }
    catch (inner) { if (inner.code !== 'ENOENT') throw inner; }
  }
  const temp = out + '.tmp-' + randomUUID();
  const backup = out + '.old-' + randomUUID();
  await mkdir(join(temp, 'photos'), { recursive: true });
  const generatedAt = new Date().toISOString();
  const manifest = { eventId, generatedAt, photos: [], responsesFile: 'responses.json' };
  const responses = [];
  try {
    for (const name of await safeFiles(photoDir, 'jpg')) {
      const bytes = await readFile(join(photoDir, name));
      validateJpeg(bytes.toString('base64'));
      await writeFile(join(temp, 'photos', name), bytes);
      manifest.photos.push({ id: name.slice(0, -4), path: 'photos/' + name });
    }
    for (const name of await safeFiles(textDir, 'json')) {
      const value = JSON.parse(await readFile(join(textDir, name), 'utf8'));
      if (value.receipt !== name.slice(0, -5) || typeof value.answer !== 'string' || value.answer.length > 500 || typeof value.question !== 'string' || value.question.length > 300 || !Number.isInteger(value.questionId) || value.questionId < 1 || value.questionId > 100) throw new Error('Respuesta inválida: ' + name);
      responses.push({ receipt: value.receipt, questionId: value.questionId, question: value.question, answer: value.answer });
    }
    await writeFile(join(temp, 'responses.json'), JSON.stringify({ eventId, generatedAt, responses }, null, 2));
    await writeFile(join(temp, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await writeFile(join(temp, MARKER), JSON.stringify({ format: 'nyx-export-v1', eventId, source, generatedAt }));
    if (existed) await rename(out, backup);
    try { await rename(temp, out); }
    catch (error) { if (existed) await rename(backup, out); throw error; }
    if (existed) await rm(backup, { recursive: true });
    return { photos: manifest.photos.length, responses: responses.length, out };
  } catch (error) { await rm(temp, { recursive: true, force: true }); throw error; }
}
const argument = name => process.argv[process.argv.indexOf(name) + 1];
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await exportShow(process.argv.includes('--source') ? argument('--source') : null, process.argv.includes('--out') ? argument('--out') : './show-data', process.env.EVENT_ID || DEFAULTS.eventId);
    console.log(`Exportación local: ${result.photos} fotos, ${result.responses} respuestas → ${result.out}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
