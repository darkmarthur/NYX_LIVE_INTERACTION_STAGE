import { randomUUID } from 'node:crypto';
// Solo para ensayos locales/tests: no guarda imágenes ni textos, ni llama a Google.
export function createDemoBackend() {
  const records = new Map();
  const backend = async (operation, data) => {
    const record = records.get(data.actor) || {};
    if (operation === 'status') return record;
    if (operation === 'withdraw') {
      for (const kind of ['photo', 'text']) if (record[kind]) record[kind].withdrawn = true;
      records.set(data.actor, record);
      return { withdrawn: true };
    }
    if (operation !== 'submit') throw new Error('NOT_FOUND');
    if (record[data.kind]?.withdrawn) throw new Error('WITHDRAWN');
    if (record[data.kind]) return { receipt: record[data.kind].receipt, duplicate: true };
    record[data.kind] = { receipt: 'NYX-' + randomUUID().replaceAll('-', ''), withdrawn: false };
    records.set(data.actor, record);
    return { receipt: record[data.kind].receipt, duplicate: false };
  };
  backend.records = records;
  return backend;
}
