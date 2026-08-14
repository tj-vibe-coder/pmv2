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

  async set(value, options = {}) {
    if (!this.store[this.collectionName]) this.store[this.collectionName] = {};
    const current = this.store[this.collectionName][this.id] || {};
    this.store[this.collectionName][this.id] = options.merge
      ? applyPatch(current, value)
      : structuredClone(value);
  }

  async update(value) {
    const current = this.store[this.collectionName]?.[this.id];
    if (!current) throw new Error('document does not exist');
    this.store[this.collectionName][this.id] = applyPatch(current, value);
  }

  async delete() {
    delete this.store[this.collectionName]?.[this.id];
  }
}

class FakeCollectionReference {
  constructor(store, name) {
    this.store = store;
    this.name = name;
  }

  doc(id) {
    if (!id) {
      const next = (this.store.__nextId || 0) + 1;
      this.store.__nextId = next;
      id = `auto-${next}`;
    }
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

  async runTransaction(callback) {
    const transaction = {
      get: (ref) => ref.get(),
      set: (ref, value, options) => ref.set(value, options),
      update: (ref, value) => ref.update(value),
      delete: (ref) => ref.delete(),
      create: async (ref, value) => {
        const existing = await ref.get();
        if (existing.exists) throw new Error('document already exists');
        return ref.set(value);
      },
    };
    return callback(transaction);
  }
}

function applyPatch(current, patch) {
  const output = structuredClone(current);
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split('.');
    let target = output;
    while (parts.length > 1) {
      const part = parts.shift();
      if (!target[part] || typeof target[part] !== 'object') target[part] = {};
      target = target[part];
    }
    const key = parts[0];
    if (value && value.__delete) delete target[key];
    else target[key] = structuredClone(value);
  }
  return output;
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
  const db = new FakeFirestore(seed);
  app.use('/api/finance-trace', createFinanceTraceRouter({
    db,
    getCurrentUser: async (req) => req.headers.authorization ? user : null,
    FieldValue: { delete: () => ({ __delete: true }) },
  }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  server.fakeDb = db;
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

function unlinkSeed() {
  const seed = seedData();
  delete seed.investments.i1.sourceExpenseId;
  delete seed.investments.i1.sourceCollection;
  seed.investments.i1.updated_at = '2026-03-16T00:00:00.000Z';
  seed.project_expenses.e2.updatedAt = '2026-03-16T00:00:00.000Z';
  return seed;
}

function resolutionBody(action, overrides = {}) {
  return {
    action,
    investmentId: 'i1',
    expenseId: 'e2',
    expenseCollection: 'project_expenses',
    reason: 'Reviewed duplicate bookkeeping records',
    ...overrides,
  };
}

test('POST resolve requires an admin or superadmin', async (t) => {
  const server = await createTestServer({ user: { id: 'u1', role: 'user' }, seed: unlinkSeed() });
  t.after(() => server.close());
  const response = await request(server, '/api/finance-trace/resolve', true, {
    method: 'POST', body: JSON.stringify(resolutionBody('confirm_match')),
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'ADMIN_REQUIRED');
});

test('confirm_match writes reciprocal links and one append-only audit row', async (t) => {
  const server = await createTestServer({ user: { id: 'a1', role: 'admin', username: 'admin' }, seed: unlinkSeed() });
  t.after(() => server.close());
  const response = await request(server, '/api/finance-trace/resolve', true, {
    method: 'POST', body: JSON.stringify(resolutionBody('confirm_match')),
  });

  assert.equal(response.status, 200);
  const store = server.fakeDb.store;
  assert.equal(store.investments.i1.linkedExpenseId, 'e2');
  assert.equal(store.investments.i1.linkedExpenseCollection, 'project_expenses');
  assert.deepEqual(store.project_expenses.e2.fundingSource, {
    type: 'investor_outofpocket', investor: 'TJ Caballero', linkedInvestmentId: 'i1',
  });
  assert.equal(Object.keys(store.finance_trace_audit).length, 1);
  const audit = Object.values(store.finance_trace_audit)[0];
  assert.equal(audit.action, 'confirm_match');
  assert.equal(audit.actor.id, 'a1');
  assert.equal(audit.before.investment.id, 'i1');
  assert.equal(audit.before.expense.id, 'e2');
  assert.equal(audit.after.investment.linkedExpenseId, 'e2');
  assert.equal(response.body.trace.originKey, 'investment:i1');
});

test('keep_both_separate clears links and retains both records with corporate funding', async (t) => {
  const seed = unlinkSeed();
  seed.investments.i1.linkedExpenseId = 'e2';
  seed.investments.i1.linkedExpenseCollection = 'project_expenses';
  seed.project_expenses.e2.fundingSource = {
    type: 'investor_outofpocket', investor: 'TJ Caballero', linkedInvestmentId: 'i1',
  };
  const server = await createTestServer({ user: { id: 'a1', role: 'admin' }, seed });
  t.after(() => server.close());
  const response = await request(server, '/api/finance-trace/resolve', true, {
    method: 'POST', body: JSON.stringify(resolutionBody('keep_both_separate')),
  });

  assert.equal(response.status, 200);
  assert.equal(server.fakeDb.store.investments.i1.linkedExpenseId, undefined);
  assert.deepEqual(server.fakeDb.store.project_expenses.e2.fundingSource, { type: 'corporate_bank' });
});

test('keep_investment_delete_expense reclassifies the investment and deletes an eligible expense', async (t) => {
  const server = await createTestServer({ user: { id: 'a1', role: 'superadmin' }, seed: unlinkSeed() });
  t.after(() => server.close());
  const response = await request(server, '/api/finance-trace/resolve', true, {
    method: 'POST',
    body: JSON.stringify(resolutionBody('keep_investment_delete_expense', {
      investmentCategory: 'Capital Contribution',
    })),
  });

  assert.equal(response.status, 200);
  assert.equal(server.fakeDb.store.project_expenses.e2, undefined);
  assert.equal(server.fakeDb.store.investments.i1.category, 'Capital Contribution');
  assert.equal(server.fakeDb.store.investments.i1.linkedExpenseId, undefined);
  assert.equal(Object.values(server.fakeDb.store.finance_trace_audit)[0].after.expense.deleted, true);
});

test('keep_expense_delete_investment deletes the investment and retains a corporate expense', async (t) => {
  const server = await createTestServer({ user: { id: 'a1', role: 'admin' }, seed: unlinkSeed() });
  t.after(() => server.close());
  const response = await request(server, '/api/finance-trace/resolve', true, {
    method: 'POST', body: JSON.stringify(resolutionBody('keep_expense_delete_investment')),
  });

  assert.equal(response.status, 200);
  assert.equal(server.fakeDb.store.investments.i1, undefined);
  assert.deepEqual(server.fakeDb.store.project_expenses.e2.fundingSource, { type: 'corporate_bank' });
  assert.equal(Object.values(server.fakeDb.store.finance_trace_audit)[0].after.investment.deleted, true);
});

test('resolver rejects stale records without writing an audit row', async (t) => {
  const server = await createTestServer({ user: { id: 'a1', role: 'admin' }, seed: unlinkSeed() });
  t.after(() => server.close());
  const response = await request(server, '/api/finance-trace/resolve', true, {
    method: 'POST',
    body: JSON.stringify(resolutionBody('confirm_match', {
      expectedInvestmentUpdatedAt: 'stale-version',
    })),
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'TRACE_STALE');
  assert.equal(server.fakeDb.store.finance_trace_audit, undefined);
});

test('resolver protects liquidation-synced expenses and points to the source', async (t) => {
  const server = await createTestServer({ user: { id: 'a1', role: 'admin' } });
  t.after(() => server.close());
  const response = await request(server, '/api/finance-trace/resolve', true, {
    method: 'POST',
    body: JSON.stringify(resolutionBody('keep_investment_delete_expense', {
      expenseId: 'e1',
    })),
  });
  assert.equal(response.status, 422);
  assert.equal(response.body.code, 'SOURCE_OWNED_EXPENSE');
  assert.match(response.body.sourceFocusUrl, /liquidation-form\?focus=liquidation%3Al1%3Ar1/);
  assert.ok(server.fakeDb.store.project_expenses.e1);
  assert.equal(server.fakeDb.store.finance_trace_audit, undefined);
});

test('resolver never changes source-owned expenses through any resolution action', async (t) => {
  for (const action of ['confirm_match', 'keep_both_separate', 'keep_expense_delete_investment']) {
    const server = await createTestServer({ user: { id: 'a1', role: 'admin' } });
    t.after(() => server.close());
    const response = await request(server, '/api/finance-trace/resolve', true, {
      method: 'POST',
      body: JSON.stringify(resolutionBody(action, { expenseId: 'e1' })),
    });
    assert.equal(response.status, 422, action);
    assert.equal(response.body.code, 'SOURCE_OWNED_EXPENSE', action);
    assert.ok(server.fakeDb.store.project_expenses.e1, action);
    assert.ok(server.fakeDb.store.investments.i1, action);
    assert.equal(server.fakeDb.store.finance_trace_audit, undefined, action);
  }
});

module.exports = { FakeFirestore, request, seedData };
