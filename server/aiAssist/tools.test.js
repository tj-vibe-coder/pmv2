const test = require('node:test');
const assert = require('node:assert/strict');
const { createToolRegistry } = require('./tools');

test('registry exposes exactly the approved read-only tools', () => {
  const registry = createToolRegistry({ db: {} });
  assert.deepEqual([...registry.keys()].sort(), [
    'get_expense_summary', 'get_portfolio_summary', 'get_project_snapshot',
    'get_quotation_summary', 'search_projects', 'search_sales_opportunities'
  ]);
});

test('unknown tools fail closed', async () => {
  const registry = createToolRegistry({ db: {} });
  assert.equal(registry.has('delete_project'), false);
});

test('search_projects returns capped, projected, sourced results from a fake collection', async () => {
  const docs = Array.from({ length: 15 }, (_, i) => ({
    id: `p${i}`,
    data: () => ({
      project_no: `PN${i}`, project_name: `Project ${i}`, project_status: 'sent',
      year: 2026, account_name: 'Acme', password_hash: 'secret', updated_at: '2026-08-01T00:00:00.000Z'
    }),
  }));
  const fakeDb = {
    collection: (name) => {
      assert.equal(name, 'projects');
      return {
        get: async () => ({ docs }),
      };
    },
  };
  const registry = createToolRegistry({ db: fakeDb, now: () => new Date('2026-08-13T00:00:00.000Z') });
  const result = await registry.get('search_projects').execute({ status: 'sent' });
  assert.ok(result.data.length <= 10);
  assert.ok(result.data.every((row) => !('password_hash' in row)));
  assert.ok(result.sources.length === result.data.length);
  assert.ok(result.sources.every((s) => typeof s.id === 'string' && typeof s.label === 'string' && typeof s.route === 'string' && typeof s.asOf === 'string'));
  assert.equal(result.asOf, '2026-08-13T00:00:00.000Z');
});

test('get_project_snapshot returns null data with empty sources when not found', async () => {
  const fakeDb = {
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: false }) }),
    }),
  };
  const registry = createToolRegistry({ db: fakeDb });
  const result = await registry.get('get_project_snapshot').execute({ projectId: 'missing' });
  assert.equal(result.data, null);
  assert.deepEqual(result.sources, []);
});

test('get_quotation_summary computes a grand total without leaking cost line items', async () => {
  const fakeDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          id: 'q1',
          data: () => ({
            projectId: 'p1', kind: 'IOCT', revision: 'R0', discountPct: 10, vatPct: 12,
            generalReqts: [{ unitPrice: 100, qty: 2 }],
            components: [{ unitCost: 50, qty: 1 }],
            services: [{ amount: 30 }],
            manpower: [{ dailyRate: 999, headcount: 1, mandays: 1 }],
          }),
        }),
      }),
    }),
  };
  const registry = createToolRegistry({ db: fakeDb });
  const result = await registry.get('get_quotation_summary').execute({ quotationId: 'q1' });
  assert.equal(typeof result.data.grandTotal, 'number');
  assert.ok(!('components' in result.data));
  assert.ok(!('manpower' in result.data));
  assert.ok(!('generalReqts' in result.data));
});
