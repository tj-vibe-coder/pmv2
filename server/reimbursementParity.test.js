'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { FinanceFirestore } = require('./test-support/financeFirestore');
const section = file => {
  const s = fs.readFileSync(file, 'utf8');
  return s.slice(s.indexOf('// Admin-only: list pending reimbursement claims'), s.indexOf("app.delete('/api/liquidations/:id'"));
};
function setup(file) {
  const db = new FinanceFirestore({ reimbursements: {
    a: { liquidationId: 'la', status: 'pending', origin: 'no_ca', amount: 150, employeeId: 'e', employeeName: 'Employee' },
    b: { liquidationId: 'lb', status: 'pending', origin: 'no_ca', amount: 150, employeeId: 'e', employeeName: 'Employee' },
    old: { liquidationId: 'old', status: 'paid', amount: 500, paidAt: 1000 },
  }, liquidations: { la: { rows_json: JSON.stringify([{ id: 'r1', amount: 100 }, { id: 'r2', amount: 50 }]), receipts_json: JSON.stringify([{ rowId: 'r1' }]) }, lb: { rows_json: JSON.stringify([{ id: 'r1', amount: 150 }]), receipts_json: JSON.stringify([{ rowId: 'r1' }]) } } });
  const { receiptReviewHash } = require('./liquidationReceiptReview');
  for (const liq of Object.values(db.store.liquidations)) liq.status = 'submitted';
  db.store.liquidation_receipt_reviews = {};
  for (const [id, liq] of Object.entries(db.store.liquidations)) db.store.liquidation_receipt_reviews[id] = { active: true, reviewedBy: 'rj', reviewedByUsername: 'RJR', contentHash: receiptReviewHash(liq), rjConfirmedSubmissionVersion: 1, physicalSubmission: { active: true, version: 1, contentHash: receiptReviewHash(liq) } };
  const routes = {}; const syncs = [];
  let user = { id: 'admin1', role: 'admin', approved: 1 };
  const context = { require: name => require('../' + name), app: Object.fromEntries(['get', 'post'].map(method => [method, (path, fn) => { routes[`${method} ${path}`] = fn; }])), db, getCurrentUser: async () => user,
    normalizeFundingSource: v => v || null, syncExpenseFundingInvestment: async (...args) => { syncs.push(args); return true; }, console, FieldValue: { increment: n => n } };
  vm.runInNewContext(section(file), context);
  const call = async (path, body, id = 'a', role = 'admin', method = 'post', query = {}) => {
    user = role ? { id: 'admin1', role, approved: 1 } : null;
    let code = 200; let data;
    const res = { status(c) { code = c; return this; }, json(d) { data = d; return this; } };
    await routes[`${method} ${path}`]({ params: { id }, query, body }, res); return { code, data };
  };
  return { db, call, syncs };
}
test('reimbursement route block matches exactly in both API copies', () => assert.equal(section('server.js'), section('functions/server.js')));
for (const file of ['server.js', 'functions/server.js']) {
  test(`${file}: per-line proof payment, retries, remaining pay and paid history`, async () => {
    const { db, call, syncs } = setup(file); const old = structuredClone(db.store.reimbursements.old);
    const proofRef = { oneDriveId: 'proof1', webUrl: 'https://example.com/proof', filename: 'proof.pdf' };
    assert.equal((await call('/api/reimbursements/:id/pay-lines', { rowIds: ['r1'], proofRef })).code, 200);
    assert.equal((await call('/api/reimbursements/:id/pay-lines', { rowIds: ['r1'], proofRef })).code, 400);
    assert.equal(db.store.reimbursements.a.paidAmount, 100);
    assert.equal(db.store.reimbursements.a.status, 'pending');
    assert.equal((await call('/api/reimbursements/:id/pay', { proofRef })).code, 200);
    const payments = Object.values(db.store.reimbursement_payments); assert.deepEqual(payments.map(p => p.amount), [100, 50]);
    assert.equal(payments[0].proofRef.oneDriveId, 'proof1'); assert.equal(payments[1].proofRef.oneDriveId, 'proof1');
    assert.equal(db.store.reimbursements.a.paidAmount, 150); assert.equal(db.store.reimbursements.a.status, 'paid');
    assert.equal(syncs[0][1], 'reimbursement_payments'); assert.equal(syncs[1][2].amount, 50);
    assert.deepEqual(db.store.reimbursements.old, old);
  });
  test(`${file}: urgent early payment requires a recorded reason and stays documentarily open`, async () => {
    const { db, call } = setup(file); db.store.liquidation_receipt_reviews = {};
    const before = structuredClone(db.store.reimbursements.old);
    assert.equal((await call('/api/reimbursements/:id/pay-lines', { rowIds: ['r1'] })).code, 409);
    assert.equal(db.store.reimbursement_payments, undefined);
    assert.equal((await call('/api/reimbursements/:id/pay-lines', { rowIds: ['r1'], urgentPaymentReason: 'Urgent employee cash need' })).code, 200);
    assert.equal((await call('/api/reimbursements/:id/pay', {})).code, 409);
    assert.equal((await call('/api/reimbursements/:id/pay', { urgentPaymentReason: 'Urgent remaining balance' })).code, 200);
    const payments = Object.values(db.store.reimbursement_payments);
    assert.deepEqual(payments.map(p => p.paymentException.reason), ['Urgent employee cash need', 'Urgent remaining balance']);
    assert.equal(payments.reduce((sum, p) => sum + p.amount, 0), 150);
    const open = await call('/api/reimbursements', {}, 'a', 'admin', 'get', { scope: 'open' });
    assert.equal(open.code, 200); assert.ok(open.data.reimbursements.some(r => r.id === 'a' && r.status === 'paid' && r.workflowStatus === 'awaiting_physical'));
    const closed = await call('/api/reimbursements', {}, 'a', 'admin', 'get', { scope: 'closed' }); assert.equal(closed.data.reimbursements.length, 0);
    assert.deepEqual(db.store.reimbursements.old, before);
  });
  test(`${file}: mixed batch is atomic without urgent authorization and concurrent remaining payments cannot double-pay`, async () => {
    const { db, call } = setup(file); delete db.store.liquidation_receipt_reviews.lb;
    assert.equal((await call('/api/reimbursements/batch-mark', { ids: ['a', 'b'] })).code, 409);
    assert.equal(db.store.reimbursement_payments, undefined); assert.equal(db.store.reimbursements.a.status, 'pending');
    assert.equal((await call('/api/reimbursements/batch-mark', { ids: ['a', 'b'], urgentPaymentReason: 'Urgent staff needs' })).code, 200);
    const payments = Object.values(db.store.reimbursement_payments); assert.equal(payments.length, 2);
    assert.equal(payments.find(p => p.reimbursementId === 'a').paymentException, null);
    assert.equal(payments.find(p => p.reimbursementId === 'b').paymentException.reason, 'Urgent staff needs');
    const closed = await call('/api/reimbursements', {}, 'a', 'admin', 'get', { scope: 'closed' }); assert.equal(closed.data.reimbursements.length, 1); assert.equal(closed.data.reimbursements[0].id, 'a');
    const race = setup(file); const results = await Promise.all([race.call('/api/reimbursements/:id/pay', {}), race.call('/api/reimbursements/:id/pay', {})]);
    assert.deepEqual(results.map(r => r.code).sort(), [200, 400]); assert.equal(Object.values(race.db.store.reimbursement_payments).reduce((s, p) => s + p.amount, 0), 150);
    const lineRace = setup(file); const mixed = await Promise.all([lineRace.call('/api/reimbursements/:id/pay-lines', { rowIds: ['r1'] }), lineRace.call('/api/reimbursements/:id/pay', {})]);
    assert.ok(mixed.some(r => r.code === 200)); assert.equal(Object.values(lineRace.db.store.reimbursement_payments).reduce((s, p) => s + p.amount, 0), 150);
  });
  test(`${file}: batch transfer uses one proof and transfer ID; receipt overrides and auth enforced`, async () => {
    const { db, call } = setup(file);
    const body = { claims: [{ id: 'a', rowIds: ['r2'] }, { id: 'b', rowIds: ['r1'] }], proofRef: { oneDriveId: 'shared', webUrl: 'https://example.com/shared', filename: 'proof' } };
    assert.equal((await call('/api/reimbursements/pay-lines-batch', body)).code, 400);
    assert.equal(db.store.reimbursement_payments, undefined);
    assert.equal((await call('/api/reimbursements/pay-lines-batch', { ...body, overrideReason: 'Receipt follow-up approved' })).code, 200);
    const pays = Object.values(db.store.reimbursement_payments); assert.equal(pays.length, 2); assert.equal(pays[0].transferId, pays[1].transferId); assert.equal(pays[0].proofRef.oneDriveId, 'shared');
    assert.equal((await call('/api/reimbursements/:id/pay-lines', { rowIds: ['r1'] }, 'a', 'user')).code, 403);
    assert.equal((await call('/api/reimbursements/:id/pay-lines', { rowIds: ['r1'] }, 'a', null)).code, 401);
  });
}
