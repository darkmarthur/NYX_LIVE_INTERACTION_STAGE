import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../shared/questions.mjs';
assert.equal(QUESTIONS.length, 100, 'Se necesitan exactamente 100 preguntas');
assert.equal(new Set(QUESTIONS).size, 100, 'Las preguntas no deben repetirse');
for (const dir of ['public', 'server', 'shared', 'scripts', 'netlify/functions']) {
  for (const name of await readdir(dir)) {
    if (!/\.(mjs|js)$/.test(name)) continue;
    const result = spawnSync(process.execPath, ['--check', `${dir}/${name}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
}
new Script(await readFile('apps-script/Code.gs', 'utf8'));
JSON.parse(await readFile('apps-script/appsscript.json', 'utf8'));
for (const path of ['public/index.html', 'public/styles.css', 'public/app.js', 'public/photo.js']) assert.ok((await readFile(path)).length > 0);
console.log('Build OK · 100 preguntas · frontend estático · Functions y Apps Script válidos sintácticamente.');
