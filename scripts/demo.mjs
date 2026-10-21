import { randomUUID } from 'node:crypto';
// Simulation only: stores receipts, never photographs or responses.
export function createDemoBackend() {
  const records = new Map();
  const backend = async (operation, data) => {
    const record = records.get(data.actor) || {};
    if (operation === 'status') return record;
    if (operation === 'withdraw' || operation === 'withdrawOne') {
      if (operation === 'withdrawOne' && !['photo','text'].includes(data.kind)) throw new Error('BAD_REQUEST');
      const kinds = operation === 'withdrawOne' ? [data.kind] : ['photo','text'];
      for (const kind of kinds) {
        const entry = record[kind];
        if (entry && ((data.receipt !== undefined && data.receipt !== entry.receipt) || (entry.replacesReceipt && data.receipt !== entry.receipt))) throw new Error('STALE');
      }
      for (const kind of kinds) if (record[kind]) record[kind] = {...record[kind],withdrawn:true};
      records.set(data.actor,record);
      return {withdrawn:true,...(operation === 'withdrawOne' ? {kind:data.kind} : {})};
    }
    if (operation !== 'submit') throw new Error('NOT_FOUND');
    const entry = record[data.kind], replaces = data.replacesReceipt || null;
    if (entry?.withdrawn) {
      if (replaces !== entry.receipt) throw new Error('STALE');
    } else {
      if ((entry?.replacesReceipt || null) !== replaces) throw new Error('STALE');
      if (entry) return {receipt:entry.receipt,duplicate:true};
    }
    record[data.kind] = {receipt:'NYX-'+randomUUID().replaceAll('-',''),withdrawn:false,replacesReceipt:replaces};
    records.set(data.actor,record);
    return {receipt:record[data.kind].receipt,duplicate:false};
  };
  backend.records = records;
  return backend;
}
