'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createSoaRouter, computeTotals } = require('./soaRouter');

test('computeTotals correctly aggregates With PO and Pending PO amounts', () => {
  const items = [
    { id: '1', hasPo: true, amount: 100.50 },
    { id: '2', hasPo: true, amount: 200 },
    { id: '3', hasPo: false, amount: 300.25 },
    { id: '4', hasPo: false, amount: 50 },
  ];
  const totals = computeTotals(items);
  assert.equal(totals.subtotalWithPo, 300.50);
  assert.equal(totals.subtotalPendingPo, 350.25);
  assert.equal(totals.totalOutstanding, 650.75);
});

// Mock Firestore database helper
function createMockDb(initialRecords = []) {
  const store = new Map(initialRecords.map((r) => [r.id, { ...r }]));
  let idCounter = initialRecords.length + 1;

  return {
    collection: (name) => {
      assert.equal(name, 'statements_of_account');
      return {
        get: async () => {
          const docs = Array.from(store.entries()).map(([id, data]) => ({
            id,
            data: () => ({ ...data }),
          }));
          return {
            forEach: (cb) => docs.forEach(cb),
            docs,
          };
        },
        doc: (id) => ({
          get: async () => {
            const exists = store.has(id);
            return {
              exists,
              id,
              data: () => (exists ? { ...store.get(id) } : null),
            };
          },
          update: async (updates) => {
            if (!store.has(id)) throw new Error('Document not found');
            const existing = store.get(id);
            store.set(id, { ...existing, ...updates });
          },
          delete: async () => {
            store.delete(id);
          },
        }),
        add: async (data) => {
          const id = `soa_${idCounter++}`;
          store.set(id, { id, ...data });
          return { id };
        },
        where: function () {
          return this;
        },
      };
    },
  };
}

async function withTestServer(options, run) {
  const { db, user = { userId: 'u1', username: 'RJR', name: 'Reuel Joshua Rivera', position: 'Solutions Manager' } } = options;
  const app = express();
  app.use(express.json());
  app.use('/api/soa', createSoaRouter({
    db,
    getCurrentUser: async () => user,
  }));

  const server = app.listen(0);
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}/api/soa`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('SOA API endpoints end-to-end', async () => {
  const mockDb = createMockDb();

  await withTestServer({ db: mockDb }, async (baseUrl) => {
    // 1. Create an SOA
    const createRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-07-02',
        recipientCode: 'ACT',
        recipientName: 'Advance Controle Technologie Inc',
        recipientContactName: 'Lindsey Salilig',
        items: [
          { id: 'item-1', projectName: 'Ebecor', poNumber: '2606-005', amount: 243350.10, hasPo: true },
          { id: 'item-2', projectName: 'ADI B1P1', poNumber: '', amount: 320000, hasPo: false, footnoteSymbol: '*' },
        ],
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.success, true);
    assert.equal(created.data.soaNo, 'SOA2607001-ACT-00');
    assert.equal(created.data.subtotalWithPo, 243350.10);
    assert.equal(created.data.subtotalPendingPo, 320000);
    assert.equal(created.data.totalOutstanding, 563350.10);
    const soaId = created.id;

    // 2. GET by ID
    const getRes = await fetch(`${baseUrl}/${soaId}`);
    assert.equal(getRes.status, 200);
    const fetched = await getRes.json();
    assert.equal(fetched.data.soaNo, 'SOA2607001-ACT-00');

    // 3. PATCH line item with retroactive PO number
    const patchItemRes = await fetch(`${baseUrl}/${soaId}/items/item-2`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        poNumber: '2607-099',
        poDate: '2026-07-15',
        hasPo: true,
      }),
    });
    assert.equal(patchItemRes.status, 200);
    const patched = await patchItemRes.json();
    assert.equal(patched.data.subtotalWithPo, 563350.10);
    assert.equal(patched.data.subtotalPendingPo, 0);

    // 4. Update status
    const statusRes = await fetch(`${baseUrl}/${soaId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'settled', settlementDate: '2026-08-01' }),
    });
    assert.equal(statusRes.status, 200);
    const settled = await statusRes.json();
    assert.equal(settled.data.status, 'settled');
    assert.equal(settled.data.balanceRemaining, 0);

    // 5. Create a revision
    const reviseRes = await fetch(`${baseUrl}/${soaId}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(reviseRes.status, 201);
    const revised = await reviseRes.json();
    assert.equal(revised.data.soaNo, 'SOA2607001-ACT-01');
    assert.equal(revised.data.revision, '01');
    assert.equal(revised.data.status, 'draft');

    // 6. Record payment against revision
    const revId = revised.id;
    const payRes = await fetch(`${baseUrl}/${revId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 200000,
        paymentDate: '2026-08-10',
        reference: 'Check #554433',
        notes: 'Partial settlement from ACTI',
      }),
    });
    assert.equal(payRes.status, 200);
    const paid = await payRes.json();
    assert.equal(paid.data.amountCollected, 200000);
    assert.equal(paid.data.status, 'partially_paid');
    assert.equal(paid.data.collections.length, 1);
    assert.equal(paid.data.collections[0].reference, 'Check #554433');
  });
});
