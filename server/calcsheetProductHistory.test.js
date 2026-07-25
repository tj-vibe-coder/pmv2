const test = require('node:test');
const assert = require('node:assert/strict');
const {
  flattenProductHistory,
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

test('searches catalog number, brand, description, project, and quotation reference', () => {
  const rows = flattenProductHistory({ projects, quotations, clients });
  assert.equal(searchProductHistory(rows, { search: 's203-c20' }).items.length, 2);
  assert.equal(searchProductHistory(rows, { search: 'Draft Panel' }).items.length, 1);
  assert.equal(searchProductHistory(rows, { status: 'lost' }).items[0].projectId, 'p-lost');
});

test('sorts newest first and enforces the 100-row maximum', () => {
  const rows = flattenProductHistory({ projects, quotations, clients });
  const result = searchProductHistory(rows, { sort: 'newest', limit: 500 });
  assert.equal(result.items[0].quotationId, 'q1');
  assert.equal(result.limit, 100);
});
