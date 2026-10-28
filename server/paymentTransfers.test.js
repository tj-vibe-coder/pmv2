'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTransferInput, applyAllocationLimits, otherAllocationTotals } = require('./paymentTransfers');

const kks = {
  date: '2026-07-10', amount: 3600, reference: ' 3654222678141 ', remark: 'CA02 + LQ005',
  allocations: [{ type: 'cash_advance', id: 'ca02', amount: 3000 }, { type: 'reimbursement', id: 'lq005', amount: 600 }],
};

test('valid split transfer normalizes and builds allocation keys', () => {
  const { value, error } = normalizeTransferInput(kks);
  assert.equal(error, undefined);
  assert.equal(value.reference, '3654222678141');
  assert.deepEqual(value.allocationKeys, ['cash_advance:ca02', 'reimbursement:lq005']);
});

test('breakdown must add up to the transfer total', () => {
  const { error } = normalizeTransferInput({ ...kks, amount: 3500 });
  assert.match(error, /adds up to 3600.00 but the transfer total is 3500.00/);
});

test('rejects bad dates, duplicates and unknown types', () => {
  assert.ok(normalizeTransferInput({ ...kks, date: '2026-02-30' }).error);
  assert.ok(normalizeTransferInput({ ...kks, allocations: [kks.allocations[0], kks.allocations[0]], amount: 6000 }).error);
  assert.ok(normalizeTransferInput({ ...kks, allocations: [{ type: 'invoice', id: 'x', amount: 3600 }] }).error);
  assert.ok(normalizeTransferInput({ ...kks, allocations: [] }).error);
});

test('caps allocations at the document amount, counting other transfers', () => {
  const { value } = normalizeTransferInput(kks);
  const docs = { 'cash_advance:ca02': { ca_no: 'CA02', amount: 3000, status: 'approved' }, 'reimbursement:lq005': { formNo: 'LQ005', amount: 600 } };
  assert.equal(applyAllocationLimits(value.allocations, docs, {}), null);
  assert.equal(value.allocations[0].docNo, 'CA02');
  const others = otherAllocationTotals([{ id: 'old', allocations: [{ type: 'reimbursement', id: 'lq005', amount: 100 }] }, { id: 'self', allocations: [{ type: 'cash_advance', id: 'ca02', amount: 3000 }] }], 'self');
  assert.match(applyAllocationLimits(value.allocations, docs, others), /LQ005 is 600.00, 100.00 of it already in other transfers/);
});

test('rejects a pending cash advance and a missing document', () => {
  const { value } = normalizeTransferInput(kks);
  assert.match(applyAllocationLimits(value.allocations, { 'cash_advance:ca02': { ca_no: 'CA02', amount: 3000, status: 'pending' } }, {}), /not an approved cash advance/);
  assert.match(applyAllocationLimits(value.allocations, {}, {}), /not found/);
});
