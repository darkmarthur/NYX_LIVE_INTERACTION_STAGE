import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportShow, parseResponsesCsv, assertOwned, MARKER } from '../scripts/export.mjs';
const jpeg = Buffer.from([255,216,255,224,0,4,0,0,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]);
const name = 'NYX-' + 'a'.repeat(32) + '.jpg';
async function fixture(t) {
 const root=await mkdtemp(join(tmpdir(),'nyx-v2-')); t.after(()=>rm(root,{recursive:true,force:true}));
 const source=join(root,'flat-photos'),out=join(root,'show-data'); await mkdir(source); await writeFile(join(source,name),jpeg); return {root,source,out};
}
test('CSV conserva comas, comillas, Unicode, BOM y saltos dentro de una respuesta',()=>{
 const input='\uFEFFPregunta,Respuesta\r\n"¿Qué, recuerdas?","Mi abuela dijo ""hola""\n💚"\r\n';
 assert.deepEqual(parseResponsesCsv(input),[{question:'¿Qué, recuerdas?',answer:'Mi abuela dijo "hola"\n💚'}]);
});
test('CSV exige exactamente Pregunta y Respuesta, sin nombre ni tercera columna',()=>{
 assert.throws(()=>parseResponsesCsv('Pregunta,Respuesta,Nombre\nx,Hola,Ana'),/dos columnas/);
 assert.throws(()=>parseResponsesCsv('Pregunta,Respuesta\nx,Hola,Extra'),/Fila 2/);
 assert.throws(()=>parseResponsesCsv('Pregunta,Respuesta\nx,"sin cierre'),/comillas/);
});
test('Exportación consume raíz plana, sin carpetas aprobadas ni textos JSON',async t=>{
 const f=await fixture(t); const result=await exportShow(f.source,f.out);
 assert.equal(result.photos,1); assert.equal(result.responses,null);
 assert.deepEqual(await readFile(join(f.out,'photos',name)),jpeg);
 const manifest=JSON.parse(await readFile(join(f.out,'manifest.json'),'utf8')); assert.equal(manifest.responsesFile,null);
 assert.equal((await assertOwned(f.out)).format,'nyx-export-v2');
});
test('Exportación opcional de Sheet CSV a responses.json con solo pregunta y respuesta',async t=>{
 const f=await fixture(t); const csv=join(f.root,'respuestas.csv'); await writeFile(csv,'Pregunta,Respuesta\n¿Dónde?,En casa.\n');
 const result=await exportShow(f.source,f.out,'nyx-ocampo-2026',csv); assert.equal(result.responses,1);
 const data=JSON.parse(await readFile(join(f.out,'responses.json'),'utf8')); assert.deepEqual(data.responses,[{question:'¿Dónde?',answer:'En casa.'}]);
});
test('Reexportar refleja retiradas y elimina respuestas de un CSV anterior omitido',async t=>{
 const f=await fixture(t); const csv=join(f.root,'respuestas.csv'); await writeFile(csv,'Pregunta,Respuesta\n¿Dónde?,En casa.\n');
 await exportShow(f.source,f.out,'nyx-ocampo-2026',csv); await rm(join(f.source,name));
 const result=await exportShow(f.source,f.out); assert.equal(result.photos,0);
 await assert.rejects(()=>readFile(join(f.out,'responses.json')),error=>error.code==='ENOENT');
});
test('CSV inválido no sobrescribe una exportación anterior válida',async t=>{
 const f=await fixture(t); await exportShow(f.source,f.out); const csv=join(f.root,'bad.csv'); await writeFile(csv,'Nombre,Mensaje\nAna,Hola\n');
 await assert.rejects(()=>exportShow(f.source,f.out,'nyx-ocampo-2026',csv),/dos columnas/); assert.deepEqual(await readFile(join(f.out,'photos',name)),jpeg);
});
test('No reemplaza carpetas ajenas, no sigue symlinks de fotos, no exporta dentro del origen',async t=>{
 const f=await fixture(t); await mkdir(f.out); await writeFile(join(f.out,'personal.txt'),'No borrar');
 await assert.rejects(()=>exportShow(f.source,f.out),/no tiene marcador/);
 await assert.rejects(()=>exportShow(f.source,join(f.source,'salida')),/separados/);
 await symlink(join(f.source,name),join(f.source,'NYX-'+'b'.repeat(32)+'.jpg'));
 assert.equal((await exportShow(f.source,join(f.root,'safe-out'))).photos,1);
});
test('El borrado local sigue reconociendo exportaciones v1 y v2',async t=>{
 const f=await fixture(t); await mkdir(f.out); await writeFile(join(f.out,MARKER),JSON.stringify({format:'nyx-export-v1',eventId:'nyx-ocampo-2026'}));
 assert.equal((await assertOwned(f.out)).format,'nyx-export-v1');
});
