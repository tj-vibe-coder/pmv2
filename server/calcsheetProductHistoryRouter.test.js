const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createProductHistoryRouter } = require('./calcsheetProductHistoryRouter');

const docs = (rows) => ({
  docs: rows.map((row) => ({
    id: row.id,
    data: () => row,
  })),
});

const data = {
  calcsheet_projects: docs([
    { id: 'p1', code: 'PCS2601001-ABC-00', name: 'Panel', status: 'won' },
  ]),
  calcsheet_quotations: docs([{
    id: 'q1',
    projectId: 'p1',
    recipientId: 'c1',
    kind: 'IOCT',
    revision: '00',
    dateSent: '2026-01-01',
    productMarkupPct: 20,
    components: [{
      id: 'c1',
      description: 'Breaker',
      brand: 'ABB',
      partNo: 'S203-C20',
      uom: 'pc',
      unitCost: 100,
      forex: 1,
      discountPct: 0,
      contingencyPct: 5,
    }],
  }]),
  clients: docs([{ id: 'c1', code: 'ABC', name: 'ABC Corp' }]),
};

const createDb = (reads = []) => ({
  collection: (name) => {
    reads.push(name);
    return { get: async () => data[name] };
  },
});

async function withServer({ requireActiveUser, db = createDb() }, run) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/calcsheet/product-history',
    createProductHistoryRouter({ db, requireActiveUser }),
  );
  const server = app.listen(0);
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}/api/calcsheet/product-history`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const activeUser = async () => ({ id: 'u1' });
const rejectUser = async (_req, res) => {
  res.status(401).json({ error: 'Unauthorized' });
  return null;
};

test('GET requires an active user and does not read Firestore when unauthorized', async () => {
  const reads = [];
  await withServer({ requireActiveUser: rejectUser, db: createDb(reads) }, async (base) => {
    const response = await fetch(base);
    assert.equal(response.status, 401);
  });
  assert.deepEqual(reads, []);
});

test('GET returns current quotation observations and never reads version snapshots', async () => {
  const reads = [];
  await withServer({ requireActiveUser: activeUser, db: createDb(reads) }, async (base) => {
    const response = await fetch(`${base}?search=S203`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.items[0].quotationId, 'q1');
  });
  assert.deepEqual(
    reads.sort(),
    ['calcsheet_projects', 'calcsheet_quotations', 'clients'].sort(),
  );
  assert.equal(reads.includes('calcsheet_quotation_versions'), false);
});

test('POST suggestion requires an active user', async () => {
  const reads = [];
  await withServer({ requireActiveUser: rejectUser, db: createDb(reads) }, async (base) => {
    const response = await fetch(`${base}/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 401);
  });
  assert.deepEqual(reads, []);
});

test('POST suggestion returns read-only calculation evidence', async () => {
  await withServer({ requireActiveUser: activeUser }, async (base) => {
    const response = await fetch(`${base}/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedObservationId: 'q1:c1',
        analysisDate: '2026-02-01',
        expectedPurchaseDate: '2026-05-01',
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.status, 'insufficient_history');
    assert.equal(body.suggestedContingencyPct, null);
  });
});

test('POST suggestion returns a client error for invalid request dates', async () => {
  await withServer({ requireActiveUser: activeUser }, async (base) => {
    const response = await fetch(`${base}/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedObservationId: 'q1:c1',
        analysisDate: 'not-a-date',
        expectedPurchaseDate: '2026-05-01',
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.match(body.error, /valid analysis/i);
  });
});

test('POST suggestion does not expose internal server errors', async () => {
  const failingDb = {
    collection: () => ({
      get: async () => {
        throw new Error('Firestore collection not found: private/path');
      },
    }),
  };
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await withServer({ requireActiveUser: activeUser, db: failingDb }, async (base) => {
      const response = await fetch(`${base}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedObservationId: 'q1:c1',
          analysisDate: '2026-02-01',
          expectedPurchaseDate: '2026-05-01',
        }),
      });
      const body = await response.json();
      assert.equal(response.status, 500);
      assert.equal(body.error, 'Failed to calculate quotation history suggestion');
    });
  } finally {
    console.error = originalConsoleError;
  }
});
