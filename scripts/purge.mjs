import { rm } from 'node:fs/promises';
import { resolve, parse } from 'node:path';
import { homedir } from 'node:os';
import { assertOwned } from './export.mjs';
const argument = name => process.argv[process.argv.indexOf(name) + 1];
try {
  if (!process.argv.includes('--dir') || !process.argv.includes('--confirm') || argument('--confirm') !== 'BORRAR-NYX') throw new Error('Uso: npm run purge:local -- --dir ./show-data --confirm BORRAR-NYX');
  const dir = resolve(argument('--dir'));
  if ([parse(dir).root, resolve(homedir()), process.cwd()].includes(dir)) throw new Error('No se permite borrar ese directorio.');
  await assertOwned(dir);
  await rm(dir, { recursive: true });
  console.log('Exportación eliminada. Revisa también Drive, cachés, copias manuales y material derivado.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
