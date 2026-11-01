'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { nextDocNo, computeBlsTotals } = require('./blsRouter');

test('nextDocNo continues after the highest existing -BLS-NN for the project', () => {
  assert.equal(nextDocNo('IOCT2610002', []), 'IOCT2610002-BLS-01');
  assert.equal(nextDocNo('IOCT2606002', ['IOCT2606002-BLS-01', 'IOCT2606002-BLS-02']), 'IOCT2606002-BLS-03');
  // other projects and non-BLS numbers (imported SOAs) don't count
  assert.equal(nextDocNo('IOCT2606002', ['IOCT2606003-BLS-07', 'IOCT2606002-SOA-001']), 'IOCT2606002-BLS-01');
});

test('computeBlsTotals matches the Finance script (ACTI 2% WHT, Belmont 0%)', () => {
  // IOCT2606002-BLS-02: 10 x 5,000 + 10 x 25,000 = 300,000; 2% WHT = 6,000
  const acti = computeBlsTotals([
    { qty: 10, unitPrice: 5000 }, { qty: 10, unitPrice: 25000 },
  ], 2);
  assert.deepEqual(acti, { gross: 300000, wht: 6000, net: 294000 });
  const belmont = computeBlsTotals([
    { qty: 1, unitPrice: 29640 }, { qty: 1, unitPrice: 130568.41 }, { qty: 1, unitPrice: 56050 },
  ], 0);
  assert.deepEqual(belmont, { gross: 216258.41, wht: 0, net: 216258.41 });
});

// Minimal in-memory stand-in for the Firestore calls the router makes.
function createMockDb() {
  const docs = new Map();
  let n = 0;
  const snap = (rows) => ({ forEach: (fn) => rows.forEach(([id, data]) => fn({ id, data: () => data })) });
  const query = (filters) => ({
    where: (f, _op, v) => query([...filters, [f, v]]),
    get: async () => snap([...docs.entries()].filter(([, d]) => filters.every(([f, v]) => d[f] === v))),
  });
  return {
    docs,
    collection: () => ({
      ...query([]),
      add: async (data) => { const id = `d${++n}`; docs.set(id, { ...data }); return { id }; },
      doc: (id) => ({
        get: async () => ({ exists: docs.has(id), id, data: () => docs.get(id) }),
        update: async (patch) => { docs.set(id, { ...docs.get(id), ...patch }); },
        delete: async () => { docs.delete(id); },
      }),
    }),
  };
}

async function withServer(db, fn) {
  const express = require('express');
  const { createBlsRouter } = require('./blsRouter');
  const app = express();
  app.use(express.json());
  app.use('/api/bls', createBlsRouter({ db, getCurrentUser: async () => ({ username: 'tester' }) }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/bls`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() };
  };
  try { await fn(call); } finally { await new Promise((r) => server.close(r)); }
}

test('POST numbers new BLS sequentially and never duplicates an imported number', async () => {
  const db = createMockDb();
  await withServer(db, async (call) => {
    const a = await call('POST', '/', { projectNo: 'IOCT2606002', projectId: 'p1', lines: [{ description: 'x', qty: 1, unitPrice: 100 }], whtPct: 2 });
    assert.equal(a.status, 201);
    assert.equal(a.json.data.docNo, 'IOCT2606002-BLS-01');
    assert.equal(a.json.data.totalNet, 98);
    const b = await call('POST', '/', { projectNo: 'IOCT2606002', projectId: 'p1', lines: [] });
    assert.equal(b.json.data.docNo, 'IOCT2606002-BLS-02');

    // an imported file keeps its old number, and importing it twice is refused
    const imp = { kind: 'SOA', docNo: 'SOA-2026-004_only', projectNo: 'IOCT2606002', source: 'imported', file: { onedrive_item_id: 'i1' } };
    assert.equal((await call('POST', '/', imp)).status, 201);
    assert.equal((await call('POST', '/', imp)).status, 409);
    // a SOA without a number can't be auto-generated
    assert.equal((await call('POST', '/', { kind: 'SOA', projectNo: 'IOCT2606002' })).status, 400);
  });
});

test('PUT refuses to change the document number or kind', async () => {
  const db = createMockDb();
  await withServer(db, async (call) => {
    const a = await call('POST', '/', { projectNo: 'IOCT2606003' });
    const id = a.json.id;
    assert.equal((await call('PUT', `/${id}`, { docNo: 'IOCT2606003-BLS-09' })).status, 400);
    const ok = await call('PUT', `/${id}`, { kind: 'SOA', attention: 'Ms. Ja' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.kind, 'BLS');
    assert.equal(ok.json.data.attention, 'Ms. Ja');
  });
});
