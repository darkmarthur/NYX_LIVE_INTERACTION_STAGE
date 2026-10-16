import { randomUUID } from 'node:crypto';
// Local simulation. Does not retain content or write to Google.
export function createDemoBackend() {
  const records = new Map();
  const backend = async (operation, data) => {
    const record = records.get(data.actor) || {};
    if (operation === 'status') return record;
    if (operation === 'withdraw' || operation === 'withdrawOne') {
      if (operation === 'withdrawOne' && !['photo', 'text'].includes(data.kind)) throw new Error('BAD_REQUEST');
      for (const kind of operation === 'withdrawOne' ? [data.kind] : ['photo', 'text']) if (record[kind]) record[kind] = { receipt: record[kind].receipt, withdrawn: true };
      records.set(data.actor, record);
      return { withdrawn: true, ...(operation === 'withdrawOne' ? { kind: data.kind } : {}) };
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
