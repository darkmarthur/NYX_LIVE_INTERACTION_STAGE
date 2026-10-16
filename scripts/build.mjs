import { readFile,readdir,mkdir,rm,writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../shared/questions.mjs';
import { PAGES } from './pages.mjs';
assert.equal(QUESTIONS.length,100); assert.equal(new Set(QUESTIONS).size,100);
for (const dir of ['public','server','shared','scripts','netlify/functions']) {
  for (const name of await readdir(dir)) {
    if (!/\.(mjs|js)$/.test(name)) continue;
    const result = spawnSync(process.execPath,['--check',`${dir}/${name}`],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
}
new Script(await readFile('apps-script/Code.gs','utf8'));
JSON.parse(await readFile('apps-script/appsscript.json','utf8'));
const names = (await readdir('public')).filter(n => /\.(js|css)$/.test(n)).sort();
const contents = Object.fromEntries(await Promise.all(names.map(async n => [n,await readFile(`public/${n}`,'utf8')])));
const version = createHash('sha256').update(names.map(n => n+'\0'+contents[n]).join('\0')).digest('hex').slice(0,12);
await rm('dist',{recursive:true,force:true});
await mkdir(`dist/assets/${version}`,{recursive:true});
for (const name of names) await writeFile(`dist/assets/${version}/${name}`,contents[name]);
const template = await readFile('public/index.html','utf8');
for (const [page,info] of Object.entries(PAGES)) {
  const html = template.replace('<!--TITLE-->',info.title).replace('<!--PAGE-->',page).replace('<!--CONTENT-->',info.content).replace('href="/styles.css"',`href="/assets/${version}/styles.css"`).replace('src="/app.js"',`src="/assets/${version}/app.js"`);
  await writeFile(`dist/${info.path}`,html);
}
// CI budget measures compressed BODY bytes, not response headers/TLS or API traffic.
const report = {};
for (const [name,info] of Object.entries(PAGES)) {
  const html = await readFile(`dist/${info.path}`);
  const total = html.length + Buffer.byteLength(contents['styles.css']) + Buffer.byteLength(contents['app.js']);
  const gzip = gzipSync(html).length + gzipSync(contents['styles.css']).length + gzipSync(contents['app.js']).length;
  report[name] = { rawBytes:total,gzipBodyBytes:gzip,initialStaticRequests:3 };
  assert.ok(gzip < 18000,`Presupuesto inicial excedido: ${name}`);
}
await writeFile('dist/build-report.json',JSON.stringify({ version,pages:report },null,2));
console.log('Build OK · 100 preguntas · sin dependencias de ejecución · activos versionados', JSON.stringify(report));
