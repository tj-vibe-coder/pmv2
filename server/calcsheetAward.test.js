'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pickContractSource, buildAwardSnapshot, budgetFollowsAward, isAwardLocked } = require('./calcsheetAward');

const calc = {
  salesAmount: (q) => q.total,
  grandTotal: (q) => q.total,
  costBasis: (q) => q.cost,
  newest: (a, b) => Number(b.revision) - Number(a.revision),
};
const quotations = [
  { id: 'i0', kind: 'IOCT', revision: '00', total: 100, cost: 70 },
  { id: 'i1', kind: 'IOCT', revision: '01', total: 120, cost: 80 },
  { id: 'a0', kind: 'ACTI', revision: '00', total: 200, cost: 150 },
];

test('without an award: latest IOCT revision, ACTI only as fallback', () => {
  assert.deepEqual(pickContractSource({}, quotations, calc), { quotation: quotations[1], amount: 120, budget: 80, awarded: false });
  const actiOnly = pickContractSource({}, [quotations[2]], calc);
  assert.equal(actiOnly.quotation.id, 'a0');
  assert.equal(pickContractSource({}, [], calc), null);
});

test('awarded quotation and its frozen amounts win over the latest revision', () => {
  const project = { awarded: { quotationId: 'i0', price: 105.5, budget: 66 } };
  assert.deepEqual(pickContractSource(project, quotations, calc), { quotation: quotations[0], amount: 105.5, budget: 66, awarded: true });
});

test('award pointing at a deleted quotation falls back to the default rule', () => {
  const project = { awarded: { quotationId: 'gone', price: 1 } };
  assert.equal(pickContractSource(project, quotations, calc).quotation.id, 'i1');
});

test('award snapshot keeps client-computed figures and fills gaps from the server engine', () => {
  const snap = buildAwardSnapshot({
    quotation: quotations[0], body: { price: '101.25', budget: 70 }, user: { id: 'tj', full_name: 'TJ' }, now: '2026-10-16T00:00:00Z', calc,
  });
  assert.deepEqual(snap, {
    quotationId: 'i0', kind: 'IOCT', revision: '00', price: 101.25, grandTotal: 100, budget: 70,
    awardedAt: '2026-10-16T00:00:00Z', awardedBy: 'TJ', awardedById: 'tj',
  });
  const bad = buildAwardSnapshot({ quotation: quotations[0], body: { price: 'abc', budget: -5 }, user: null, now: 'x', calc });
  assert.equal(bad.price, 100);
  assert.equal(bad.budget, 70);
});

test('budget follows the award only when unset or untouched since the last award', () => {
  assert.equal(budgetFollowsAward(0, null), true);
  assert.equal(budgetFollowsAward(500, { budget: 500 }), true);
  assert.equal(budgetFollowsAward(450, { budget: 500 }), false);
  assert.equal(budgetFollowsAward(450, null), false);
});

test('lock flag', () => {
  assert.equal(isAwardLocked({ awardedAt: '2026-10-16' }), true);
  assert.equal(isAwardLocked({}), false);
});
