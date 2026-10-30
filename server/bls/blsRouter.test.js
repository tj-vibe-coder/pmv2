'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { nextDocNo, computeBlsTotals, computeSoaSummary } = require('./blsRouter');

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
        create: async (data) => {
          if (docs.has(id)) { const e = new Error('6 ALREADY_EXISTS'); e.code = 6; throw e; }
          docs.set(id, { ...data });
        },
        get: async () => ({ exists: docs.has(id), id, data: () => docs.get(id) }),
        update: async (patch) => { docs.set(id, { ...docs.get(id), ...patch }); },
        delete: async () => { docs.delete(id); },
      }),
    }),
  };
}

async function withServer(db, fn, user = { username: 'tester', role: 'admin' }) {
  const express = require('express');
  const { createBlsRouter } = require('./blsRouter');
  const app = express();
  app.use(express.json());
  app.use('/api/bls', createBlsRouter({ db, getCurrentUser: async () => user }));
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
    // an imported file without a number is refused; a generated SOA is numbered -SOA-NNN
    assert.equal((await call('POST', '/', { kind: 'SOA', source: 'imported', projectNo: 'IOCT2606002' })).status, 400);
    const soa = await call('POST', '/', { kind: 'SOA', projectNo: 'IOCT2606002', contractValue: 1000, txns: [{ amountBilled: 400, status: 'PAID' }, { amountBilled: 600, status: 'DUE' }] });
    assert.equal(soa.json.data.docNo, 'IOCT2606002-SOA-001');
    assert.equal(soa.json.data.totalNet, 600);
    assert.equal(soa.json.data.balanceAfter, 0);
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

test('SOA numbers are three digits and counted separately from BLS', () => {
  assert.equal(nextDocNo('IOCT2602001', ['IOCT2602001-SOA-001', 'IOCT2602001-BLS-04'], 'SOA'), 'IOCT2602001-SOA-002');
  assert.equal(nextDocNo('IOCT2602001', ['IOCT2602001-SOA-001'], 'BLS'), 'IOCT2602001-BLS-01');
});

test('computeSoaSummary: PAID rows are previous billings, DUE rows are the amount due', () => {
  assert.deepEqual(
    computeSoaSummary([{ amountBilled: 216258.41, status: 'DUE' }], 216258.41),
    { contractValue: 216258.41, previousBillings: 0, thisBilling: 216258.41, totalDue: 216258.41, balanceAfter: 0 });
  assert.deepEqual(
    computeSoaSummary([{ amountBilled: 300, status: 'PAID' }, { amountBilled: 200, status: 'DUE' }], 1000),
    { contractValue: 1000, previousBillings: 300, thisBilling: 200, totalDue: 200, balanceAfter: 500 });
});

test('two simultaneous creates for one project get different numbers', async () => {
  const db = createMockDb();
  await withServer(db, async (call) => {
    const [a, b] = await Promise.all([
      call('POST', '/', { projectNo: 'IOCT2606009' }),
      call('POST', '/', { projectNo: 'IOCT2606009' }),
    ]);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.notEqual(a.json.data.docNo, b.json.data.docNo);
    assert.equal(db.docs.size, 2);
  });
});

test('create() collision on a supplied number is a 409, not an overwrite', async () => {
  const db = createMockDb();
  await withServer(db, async (call) => {
    const first = { kind: 'SOA', docNo: 'SOA-2026-004_only', projectNo: 'IOCT2607003', source: 'imported', file: { onedrive_item_id: 'i1' } };
    assert.equal((await call('POST', '/', first)).status, 201);
    assert.equal((await call('POST', '/', { ...first, file: { onedrive_item_id: 'other' } })).status, 409);
    assert.equal([...db.docs.values()][0].file.onedrive_item_id, 'i1');
  });
});

test('PUT cannot move a document to another project', async () => {
  const db = createMockDb();
  await withServer(db, async (call) => {
    const a = await call('POST', '/', { projectNo: 'IOCT2606003', projectId: 'p1' });
    const res = await call('PUT', `/${a.json.id}`, { projectNo: 'IOCT9999999', projectId: 'p9', attention: 'x' });
    assert.equal(res.json.data.projectNo, 'IOCT2606003');
    assert.equal(res.json.data.projectId, 'p1');
  });
});

test('only admin and superadmin may use the billing routes', async () => {
  const db = createMockDb();
  for (const role of ['user', 'viewer', 'tax_filer']) {
    await withServer(db, async (call) => {
      assert.equal((await call('GET', '/')).status, 403);
      assert.equal((await call('POST', '/', { projectNo: 'IOCT2606003' })).status, 403);
    }, { username: 'x', role });
  }
  await withServer(db, async (call) => {
    assert.equal((await call('POST', '/', { projectNo: 'IOCT2606003' })).status, 201);
  }, { username: 'x', role: 'superadmin' });
});
