'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createFinanceTraceRouter } = require('./financeTraceRouter');

class FakeDocumentSnapshot {
  constructor(id, value, ref) {
    this.id = id;
    this.exists = value !== undefined;
    this._value = value;
    this.ref = ref;
  }

  data() {
    return this._value;
  }
}

class FakeDocumentReference {
  constructor(store, collection, id) {
    this.store = store;
    this.collectionName = collection;
    this.id = id;
  }

  async get() {
    return new FakeDocumentSnapshot(
      this.id,
      this.store[this.collectionName]?.[this.id],
      this,
    );
  }
}

class FakeCollectionReference {
  constructor(store, name) {
    this.store = store;
    this.name = name;
  }

  doc(id) {
    return new FakeDocumentReference(this.store, this.name, id);
  }

  async get() {
    const values = this.store[this.name] || {};
    return {
      docs: Object.entries(values).map(
        ([id, value]) => new FakeDocumentSnapshot(id, value, this.doc(id)),
      ),
    };
  }
}

class FakeFirestore {
  constructor(seed) {
    this.store = structuredClone(seed);
  }

  collection(name) {
    return new FakeCollectionReference(this.store, name);
  }
}

function seedData() {
  return {
    investments: {
      i1: {
        date: '2026-03-14', investor: 'TJ Caballero', amount: 494.27,
        category: 'Communication & Utilities', description: 'MICROSOFT MSBILL INFO SGP',
        sourceExpenseId: 'e1', sourceCollection: 'project_expenses',
      },
    },
    project_expenses: {
      e1: {
        date: '2026-03-14', amount: 494.27, description: 'Microsoft MSBill Info SGP',
        projectId: 'p1', projectName: 'RPP', sourceType: 'liquidation_sync',
        sourceLiquidationId: 'l1', sourceLiquidationRowId: 'r1', sourceCaId: 'ca1',
        fundingSource: { type: 'investor_outofpocket', linkedInvestmentId: 'i1' },
      },
      e2: {
        date: '2026-03-15', amount: 494.62, description: 'Microsoft MS Bill Info SGP',
        projectId: 'p1', projectName: 'RPP', sourceType: 'manual', createdBy: 'u1',
      },
    },
    overhead_expenses: {},
    liquidations: {
      l1: {
        form_no: 'LQ26-003-RPP', date_of_submission: '2026-03-14', status: 'submitted',
        user_id: 'u1', ca_id: 'ca1',
        rows_json: JSON.stringify([{ id: 'r1', particulars: 'Microsoft MSBill Info SGP', amount: 494.27, projectId: 'p1' }]),
      },
    },
    cash_advances: {
      ca1: { ca_no: 'CA-001', amount: 1000, status: 'approved', user_id: 'u1', project_id: 'p1' },
    },
    reimbursements: {
      rb1: { liquidationId: 'l1', caId: 'ca1', formNo: 'LQ26-003-RPP', amount: 100, status: 'paid', employeeId: 'u1' },
    },
  };
}

async function createTestServer({ user, seed = seedData() } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/finance-trace', createFinanceTraceRouter({
    db: new FakeFirestore(seed),
    getCurrentUser: async (req) => req.headers.authorization ? user : null,
    FieldValue: { delete: () => ({ __delete: true }) },
  }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  return server;
}

async function request(server, path, authorized = true, options = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    ...options,
    headers: {
      ...(authorized ? { authorization: 'Bearer test' } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  return { status: response.status, body: await response.json() };
}

test('GET requires authentication', async (t) => {
  const server = await createTestServer({ user: { id: 'u1', role: 'user' } });
  t.after(() => server.close());
  const response = await request(server, '/api/finance-trace/investment/i1', false);
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'UNAUTHORIZED');
});

test('GET validates record type, expense collection, and liquidation row', async (t) => {
  const server = await createTestServer({ user: { id: 'a1', role: 'admin' } });
  t.after(() => server.close());

  assert.equal((await request(server, '/api/finance-trace/unknown/x')).status, 400);
  assert.equal((await request(server, '/api/finance-trace/expense/e1?collection=unknown')).status, 400);
  assert.equal((await request(server, '/api/finance-trace/liquidation/l1')).status, 400);
  assert.equal((await request(server, '/api/finance-trace/liquidation/l1?rowId=missing')).status, 404);
});

test('GET follows the full confirmed chain and keeps possible matches separate', async (t) => {
  const server = await createTestServer({ user: { id: 'a1', role: 'admin' } });
  t.after(() => server.close());
  const response = await request(server, '/api/finance-trace/investment/i1');

  assert.equal(response.status, 200);
  assert.equal(response.body.originKey, 'investment:i1');
  assert.deepEqual(
    new Set(response.body.nodes.map((node) => node.type)),
    new Set(['investment', 'expense', 'liquidation', 'cash_advance', 'reimbursement']),
  );
  assert.equal(new Set(response.body.nodes.map((node) => node.key)).size, response.body.nodes.length);
  assert.ok(response.body.edges.length >= 4);
  assert.ok(response.body.edges.every((edge) => edge.confirmed === true));
  assert.equal(response.body.candidates.length, 1);
  assert.equal(response.body.candidates[0].node.id, 'e2');
  assert.equal(response.body.candidates[0].needsReview, true);
  assert.equal(response.body.candidates[0].confirmable, true);
  assert.deepEqual(response.body.permissions, { canConfirm: true, canResolve: true });
});

test('GET gives authenticated non-admin users view-only permissions', async (t) => {
  const server = await createTestServer({ user: { id: 'u1', role: 'user' } });
  t.after(() => server.close());
  const response = await request(
    server,
    '/api/finance-trace/liquidation/l1?rowId=r1',
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.permissions, { canConfirm: false, canResolve: false });
});

test('GET hides another employee liquidation from a non-admin', async (t) => {
  const server = await createTestServer({ user: { id: 'u2', role: 'user' } });
  t.after(() => server.close());
  const response = await request(
    server,
    '/api/finance-trace/liquidation/l1?rowId=r1',
  );
  assert.equal(response.status, 404);
});

module.exports = { FakeFirestore, request, seedData };
