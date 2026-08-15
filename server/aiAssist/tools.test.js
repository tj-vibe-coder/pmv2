const test = require('node:test');
const assert = require('node:assert/strict');
const { createToolRegistry } = require('./tools');

test('registry exposes exactly the approved read-only tools', () => {
  const registry = createToolRegistry({ db: {} });
  assert.deepEqual([...registry.keys()].sort(), [
    'get_expense_summary', 'get_opportunity_snapshot', 'get_portfolio_summary',
    'get_project_snapshot', 'get_quotation_summary', 'list_quotations_for_opportunity',
    'navigate_to_record', 'propose_opportunity_update', 'search_clients', 'search_projects', 'search_sales_opportunities'
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

test('search_projects matches compact spellings like rezcoat vs Rez-Coat', async () => {
  const docs = [
    {
      id: 'rz1',
      data: () => ({ project_name: 'Rez-Coat Line', project_status: 'sent', updated_at: '2026-08-01T00:00:00.000Z' }),
    },
  ];
  const fakeDb = {
    collection: () => ({ get: async () => ({ docs }) }),
  };
  const registry = createToolRegistry({ db: fakeDb, now: () => new Date('2026-08-13T00:00:00.000Z') });
  const result = await registry.get('search_projects').execute({ search: 'rezcoat' });
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].project_name, 'Rez-Coat Line');
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

function namedCollections(map) {
  return {
    collection: (name) => {
      if (!map[name]) throw new Error('unexpected collection ' + name);
      return map[name];
    },
  };
}

test('navigate_to_record returns navigate for a unique opportunity match', async () => {
  const registry = createToolRegistry({
    db: namedCollections({
      calcsheet_projects: {
        get: async () => ({
          docs: [{
            id: 'opp1',
            data: () => ({ name: 'Rez-Coat Line', code: 'PCS2601', updated_at: '2026-08-01T00:00:00.000Z' }),
          }],
        }),
      },
    }),
    now: () => new Date('2026-08-13T00:00:00.000Z'),
  });
  const result = await registry.get('navigate_to_record').execute({ search: 'rezcoat', kind: 'opportunity' });
  assert.equal(result.data.action, 'navigate');
  assert.equal(result.data.route, '/sales/calcsheet/projects/opp1');
  assert.equal(result.sources[0].route, '/sales/calcsheet/projects/opp1');
});

test('navigate_to_record returns choose when two records match', async () => {
  const registry = createToolRegistry({
    db: namedCollections({
      projects: {
        get: async () => ({
          docs: [
            { id: 'p1', data: () => ({ project_name: 'ABB One', updated_at: '2026-08-02T00:00:00.000Z' }) },
            { id: 'p2', data: () => ({ project_name: 'ABB Two', updated_at: '2026-08-01T00:00:00.000Z' }) },
          ],
        }),
      },
    }),
  });
  const result = await registry.get('navigate_to_record').execute({ search: 'ABB', kind: 'project' });
  assert.equal(result.data.action, 'choose');
  assert.equal(result.data.candidates.length, 2);
  assert.ok(!result.data.candidates.some((item) => item.route.startsWith('/settings')));
});

test('navigate_to_record returns none when nothing matches', async () => {
  const registry = createToolRegistry({
    db: namedCollections({
      projects: { get: async () => ({ docs: [] }) },
      calcsheet_projects: { get: async () => ({ docs: [] }) },
      calcsheet_quotations: { get: async () => ({ docs: [] }) },
    }),
  });
  const result = await registry.get('navigate_to_record').execute({ search: 'zzzz' });
  assert.equal(result.data.action, 'none');
  assert.deepEqual(result.sources, []);
});

test('list_quotations_for_opportunity returns only that opportunity\'s quotes without cost lines', async () => {
  const registry = createToolRegistry({
    db: namedCollections({
      calcsheet_quotations: {
        get: async () => ({
          docs: [
            {
              id: 'q1',
              data: () => ({
                projectId: 'opp1', kind: 'IOCT', revision: 'R0',
                components: [{ unitCost: 9 }], updated_at: '2026-08-02T00:00:00.000Z',
              }),
            },
            { id: 'q2', data: () => ({ projectId: 'other', kind: 'ACTI', revision: 'R1' }) },
          ],
        }),
      },
    }),
    now: () => new Date('2026-08-13T00:00:00.000Z'),
  });
  const result = await registry.get('list_quotations_for_opportunity').execute({ opportunityId: 'opp1' });
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, 'q1');
  assert.ok(!('components' in result.data[0]));
  assert.equal(result.sources[0].route, '/sales/calcsheet/quotations/q1');
});

test('get_opportunity_snapshot returns allowlisted fields and company identity only', async () => {
  const registry = createToolRegistry({
    db: namedCollections({
      calcsheet_projects: {
        doc: (id) => ({
          get: async () => ({
            exists: true,
            id,
            data: () => ({
              name: 'Rez-Coat Line', code: 'PCS2601', status: 'sent', customerId: 'c1',
              notes: 'internal', password_hash: 'secret',
            }),
          }),
        }),
      },
      clients: {
        doc: (id) => ({
          get: async () => ({
            exists: true,
            id,
            data: () => ({
              name: 'Rezcoat Inc', code: 'RZC',
              contacts: [{ name: 'Jane Doe', email: 'jane@example.com', phone: '0917' }],
              address: 'secret street',
            }),
          }),
        }),
      },
    }),
    now: () => new Date('2026-08-13T00:00:00.000Z'),
  });
  const result = await registry.get('get_opportunity_snapshot').execute({ opportunityId: 'opp1' });
  assert.equal(result.data.name, 'Rez-Coat Line');
  assert.deepEqual(result.data.customer, { id: 'c1', name: 'Rezcoat Inc', code: 'RZC' });
  assert.ok(!('contacts' in result.data.customer));
  assert.ok(!('password_hash' in result.data));
  assert.equal(result.data.notes, 'internal');
  assert.equal(result.sources[0].route, '/sales/calcsheet/projects/opp1');
});

test('get_opportunity_snapshot returns null when the opportunity is missing', async () => {
  const registry = createToolRegistry({
    db: namedCollections({
      calcsheet_projects: {
        doc: () => ({ get: async () => ({ exists: false }) }),
      },
    }),
  });
  const result = await registry.get('get_opportunity_snapshot').execute({ opportunityId: 'missing' });
  assert.equal(result.data, null);
  assert.deepEqual(result.sources, []);
});

test('search_clients matches name or code and never returns contacts', async () => {
  const registry = createToolRegistry({
    db: namedCollections({
      clients: {
        get: async () => ({
          docs: [
            {
              id: 'c1',
              data: () => ({
                name: 'Rez-Coat Industries', code: 'RZC',
                contacts: [{ email: 'a@b.com', phone: '123' }],
                address: 'hidden',
              }),
            },
            { id: 'c2', data: () => ({ name: 'Other Co', code: 'OTH' }) },
          ],
        }),
      },
    }),
    now: () => new Date('2026-08-13T00:00:00.000Z'),
  });
  const result = await registry.get('search_clients').execute({ search: 'rezcoat' });
  assert.equal(result.data.length, 1);
  assert.deepEqual(result.data[0], { id: 'c1', name: 'Rez-Coat Industries', code: 'RZC' });
  assert.ok(!('contacts' in result.data[0]));
  assert.ok(!('address' in result.data[0]));
  assert.equal(result.sources[0].route, '/sales/clients');
});

test('propose_opportunity_update returns propose_unavailable when store or user missing', async () => {
  const registry = createToolRegistry({ db: {} });
  const result = await registry.get('propose_opportunity_update').execute({ opportunityId: 'opp1', field: 'notes', value: 'hello' });
  assert.equal(result.data.applied, false);
  assert.equal(result.data.error, 'propose_unavailable');
  assert.deepEqual(result.sources, []);
});

test('propose_opportunity_update returns error code on invalid input when handled by proposal logic', async () => {
  const fakeDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ id: 'opp1', exists: true, data: () => ({ status: 'draft' }) }),
      }),
    }),
  };
  const { createProposalStore } = require('./proposals');
  const proposalStore = createProposalStore();
  const registry = createToolRegistry({
    db: fakeDb,
    user: { id: 'u1', username: 'RJR' },
    proposalStore,
  });
  const result = await registry.get('propose_opportunity_update').execute({
    opportunityId: 'opp1',
    field: 'status',
    value: 'won',
  });
  assert.equal(result.data.applied, false);
  assert.equal(result.data.error, 'field_not_allowed');
});
