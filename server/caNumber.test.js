'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FinanceFirestore } = require('./test-support/financeFirestore');
const { caSeq, formatCaNo, allocateCaNo } = require('./caNumber');

const rjr = { username: 'RJR', initials: 'RJR' };
const kim = { username: 'KIM', initials: 'KKS' };

test('caSeq reads the yearly sequence regardless of initials; old formats are not sequence numbers', () => {
  assert.equal(caSeq('CA26-007-RJR', '26'), 7);
  assert.equal(caSeq('CA26-007-KKS', '26'), 7);
  assert.equal(caSeq('CA25-007-RJR', '26'), null);
  assert.equal(caSeq('CA2611-003', '26'), null);
  assert.equal(caSeq('IOCT2512002-CA01', '26'), null);
  assert.equal(caSeq(undefined, '26'), null);
});

test('formatCaNo uses the owner initials, falling back to the username', () => {
  assert.equal(formatCaNo('26', 1, rjr), 'CA26-001-RJR');
  assert.equal(formatCaNo('26', 12, { username: 'norman' }), 'CA26-012-NORMAN');
});

test('starts at 001 when nothing is numbered in the new format, ignoring old-format numbers', async () => {
  const db = new FinanceFirestore({ cash_advances: { a: { ca_no: 'CA2611-003' }, b: { ca_no: 'IOCT2512002-CA01' } } });
  assert.equal(await allocateCaNo(db, rjr, '26'), 'CA26-001-RJR');
});

test('simultaneous requests never share a number', async () => {
  const db = new FinanceFirestore({ cash_advances: { a: { ca_no: 'CA26-004-RJR' } } });
  const nos = await Promise.all([allocateCaNo(db, rjr, '26'), allocateCaNo(db, kim, '26'), allocateCaNo(db, rjr, '26')]);
  assert.deepEqual(nos.map((n) => caSeq(n, '26')).sort((x, y) => x - y), [5, 6, 7]);
});

test('a hand-edited number above the counter is never reused; a new year restarts at 001', async () => {
  const db = new FinanceFirestore({ cash_advances: { a: { ca_no: 'CA26-040-KKS' } } });
  assert.equal(await allocateCaNo(db, rjr, '26'), 'CA26-041-RJR');
  assert.equal(await allocateCaNo(db, rjr, '27'), 'CA27-001-RJR');
});
