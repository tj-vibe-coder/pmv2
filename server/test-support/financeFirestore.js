'use strict';
// A serializable transaction fixture: stage writes, abort on error, enforce reads before writes.
class FinanceFirestore {
  constructor(seed = {}) { this.store = structuredClone(seed); this.counter = 0; this.queue = Promise.resolve(); }
  collection(name) {
    const db = this;
    const query = (filters = [], max = Infinity, sort = null) => ({
      doc(id = `generated-${++db.counter}`) {
        const ref = { id, path: `${name}/${id}`, collection: child => db.collection(`${name}/${id}/${child}`),
          get: async () => ({ id, exists: db.store[name]?.[id] !== undefined, data: () => structuredClone(db.store[name]?.[id]) }),
          set: async value => { (db.store[name] ||= {})[id] = structuredClone(value); },
          update: async value => { if (!db.store[name]?.[id]) throw new Error('missing'); for (const [key, field] of Object.entries(value)) db.store[name][id][key] = field && typeof field === 'object' && '__increment' in field ? (Number(db.store[name][id][key]) || 0) + field.__increment : structuredClone(field); },
          delete: async () => { delete db.store[name]?.[id]; } };
        return ref;
      },
      where: (key, op, value) => { if (op !== '==') throw new Error('unsupported query'); return query([...filters, [key, value]], max, sort); },
      limit: n => query(filters, n, sort), orderBy: (key, dir) => query(filters, max, [key, dir]),
      get: async () => {
        let entries = Object.entries(db.store[name] || {}).filter(([, value]) => filters.every(([key, v]) => value[key] === v));
        if (sort) entries.sort((a, b) => String(a[1][sort[0]]).localeCompare(String(b[1][sort[0]])) * (sort[1] === 'desc' ? -1 : 1));
        return { docs: entries.slice(0, max).map(([id, value]) => ({ id, ref: query().doc(id), exists: true, data: () => structuredClone(value) })) };
      },
    });
    return query();
  }
  runTransaction(fn) {
    const run = async () => {
      const writes = []; let writing = false;
      const result = await fn({ get: ref => { if (writing) throw new Error('read after write'); return ref.get(); },
        set: (ref, value) => { writing = true; writes.push(() => ref.set(value)); },
        update: (ref, value) => { writing = true; writes.push(() => ref.update(value)); },
        delete: ref => { writing = true; writes.push(() => ref.delete()); },
      });
      for (const write of writes) await write();
      return result;
    };
    const result = this.queue.then(run); this.queue = result.catch(() => {}); return result;
  }
}
module.exports = { FinanceFirestore };
