const test = require('node:test');
const assert = require('node:assert/strict');
const {
  flattenProductHistory,
  productKeyOf,
  searchProductHistory,
} = require('./calcsheetProductHistory');

const projects = [
  { id: 'p-draft', code: 'PCS2601001-ABC-00', name: 'Draft Panel', status: 'draft' },
  { id: 'p-lost', code: 'PCS2501002-XYZ-00', name: 'Lost Retrofit', status: 'lost' },
];
const clients = [
  { id: 'c1', code: 'ABC', name: 'ABC Corp' },
  { id: 'c2', code: 'XYZ', name: 'XYZ Corp' },
];
const quotations = [
  {
    id: 'q1', projectId: 'p-draft', recipientId: 'c1', kind: 'IOCT', revision: '01',
    dateSent: '2026-01-15', createdAt: '2026-01-10T00:00:00.000Z',
    productMarkupPct: 20,
    components: [{
      id: 'line-1', description: 'S203-C20 breaker', brand: 'ABB', partNo: ' s203-c20 ',
      uom: 'pc', unitCost: 100, forex: 58, discountPct: 10, contingencyPct: 5,
    }],
  },
  {
    id: 'q2', projectId: 'p-lost', recipientId: 'c2', kind: 'ACTI', revision: '00',
    createdAt: '2025-01-10T00:00:00.000Z', productMarkupPct: 15,
    components: [{
      id: 'line-2', description: 'S203-C20 breaker', brand: 'ABB', partNo: 'S203-C20',
      uom: 'pc', unitCost: 0, forex: 1, discountPct: 0, contingencyPct: 5,
    }],
  },
];

test('flattens current quotation rows with source metadata and comparable prices', () => {
  const rows = flattenProductHistory({ projects, quotations, clients });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.projectStatus), ['draft', 'lost']);
  assert.equal(rows[0].quotationDate, '2026-01-15');
  assert.equal(rows[0].quotationDateSource, 'dateSent');
  assert.equal(rows[0].normalizedUnitCost, 5220);
  assert.equal(rows[0].quotedSellingUnit, 6577.2);
  assert.equal(rows[0].productKey, 's203-c20');
  assert.equal(rows[1].quotationDateSource, 'createdAt');
  assert.equal(rows[1].normalizedUnitCost, null);
});

test('uses the legacy additive discount formula for legacy quoted selling prices', () => {
  const rows = flattenProductHistory({
    projects: [{ id: 'p1', code: 'PCS2601001-ABC-00', name: 'Legacy', status: 'sent' }],
    clients,
    quotations: [{
      id: 'legacy-q',
      projectId: 'p1',
      recipientId: 'c1',
      formulaVersion: 'legacy',
      productMarkupPct: 20,
      components: [{
        id: 'legacy-line',
        unitCost: 100,
        forex: 2,
        discountPct: 10,
        contingencyPct: 20,
        markupPct: 99,
      }],
    }],
  });

  assert.equal(rows[0].normalizedUnitCost, 180);
  assert.ok(Math.abs(rows[0].quotedSellingUnit - 264) < 1e-9);
  assert.equal(rows[0].sourceMarkupPct, 20);
});

test('keeps a valid legacy selling price when normalized trend cost is invalid', () => {
  const rows = flattenProductHistory({
    projects: [{ id: 'p1', name: 'Legacy Boundary', status: 'sent' }],
    clients: [],
    quotations: [{
      id: 'legacy-boundary-q',
      projectId: 'p1',
      formulaVersion: 'legacy',
      productMarkupPct: 20,
      components: [{
        id: 'legacy-boundary-line',
        unitCost: 100,
        forex: 2,
        discountPct: 100,
        contingencyPct: 20,
      }],
    }],
  });

  assert.equal(rows[0].normalizedUnitCost, null);
  assert.ok(Math.abs(rows[0].quotedSellingUnit - 48) < 1e-9);
});

test('uses the current multiplicative formula and a per-line markup override', () => {
  const rows = flattenProductHistory({
    projects: [{ id: 'p1', code: 'PCS2601001-ABC-00', name: 'Current', status: 'won' }],
    clients,
    quotations: [{
      id: 'current-q',
      projectId: 'p1',
      recipientId: 'missing-client',
      revision: '',
      productMarkupPct: 20,
      components: [{
        id: 'current-line',
        unitCost: 100,
        forex: 2,
        discountPct: 10,
        contingencyPct: 10,
        markupPct: 25,
      }],
    }],
  });

  assert.equal(rows[0].quotedSellingUnit, 247.50000000000003);
  assert.equal(rows[0].sourceMarkupPct, 25);
  assert.equal(rows[0].quotationReference, 'PCS2601001-XXX-00');
});

test('rejects impossible sent dates and falls back to a valid creation date', () => {
  const rows = flattenProductHistory({
    projects: [{ id: 'p1', code: 'PCS2601001-ABC-00', name: 'Dates', status: 'draft' }],
    clients,
    quotations: [{
      id: 'dated-q',
      projectId: 'p1',
      dateSent: '2026-02-30',
      createdAt: '2026-02-20T00:00:00.000Z',
      components: [{ id: 'dated-line', unitCost: 1 }],
    }],
  });

  assert.equal(rows[0].quotationDate, '2026-02-20');
  assert.equal(rows[0].quotationDateSource, 'createdAt');
});

test('normalizes exact part numbers without collapsing meaningful internal whitespace', () => {
  assert.equal(productKeyOf({ partNo: '  Ab 12  ' }), 'ab 12');
  assert.equal(productKeyOf({ partNo: 'AB12' }), 'ab12');
  assert.notEqual(
    productKeyOf({ partNo: 'AB 12' }),
    productKeyOf({ partNo: 'AB12' }),
  );
});

test('marks rows without part numbers as unmatched', () => {
  const rows = flattenProductHistory({
    projects: [{ id: 'p1', name: 'No Part', status: 'inactive' }],
    clients: [],
    quotations: [{
      id: 'q-no-part',
      projectId: 'p1',
      components: [{ id: 'line-no-part', description: 'Unnumbered item', unitCost: 1 }],
    }],
  });

  assert.equal(rows[0].productKey, null);
  assert.equal(rows[0].matchType, 'unmatched');
});

test('includes current quotations from all six project statuses', () => {
  const statuses = ['draft', 'for_review', 'sent', 'won', 'lost', 'inactive'];
  const statusProjects = statuses.map((status) => ({
    id: `p-${status}`,
    name: status,
    status,
  }));
  const statusQuotations = statuses.map((status) => ({
    id: `q-${status}`,
    projectId: `p-${status}`,
    components: [{ id: `line-${status}`, unitCost: 1 }],
  }));

  const rows = flattenProductHistory({
    projects: statusProjects,
    clients: [],
    quotations: statusQuotations,
  });

  assert.deepEqual(rows.map((row) => row.projectStatus), statuses);
});

test('searches catalog number, brand, description, project, and quotation reference', () => {
  const rows = flattenProductHistory({ projects, quotations, clients });
  assert.equal(searchProductHistory(rows, { search: 's203-c20' }).items.length, 2);
  assert.equal(searchProductHistory(rows, { search: 'Draft Panel' }).items.length, 1);
  assert.equal(searchProductHistory(rows, { status: 'lost' }).items[0].projectId, 'p-lost');
});

test('sorts by oldest date and ascending or descending normalized price', () => {
  const rows = flattenProductHistory({ projects, quotations, clients });
  assert.deepEqual(
    searchProductHistory(rows, { sort: 'oldest' }).items.map((row) => row.quotationId),
    ['q2', 'q1'],
  );
  assert.deepEqual(
    searchProductHistory(rows, { sort: 'price_asc' }).items.map((row) => row.quotationId),
    ['q1', 'q2'],
  );
  assert.deepEqual(
    searchProductHistory(rows, { sort: 'price_desc' }).items.map((row) => row.quotationId),
    ['q1', 'q2'],
  );
});

test('uses the default limit, clamps the maximum, and truncates fractional limits', () => {
  const rows = Array.from({ length: 120 }, (_, index) => ({
    quotationId: `q${index}`,
    quotationDate: '2026-01-01',
  }));

  const defaultResult = searchProductHistory(rows);
  const maximumResult = searchProductHistory(rows, { limit: 500 });
  const fractionalResult = searchProductHistory(rows, { limit: 2.9 });

  assert.equal(defaultResult.limit, 50);
  assert.equal(defaultResult.items.length, 50);
  assert.equal(maximumResult.limit, 100);
  assert.equal(maximumResult.items.length, 100);
  assert.equal(fractionalResult.limit, 2);
  assert.equal(fractionalResult.items.length, 2);
});
