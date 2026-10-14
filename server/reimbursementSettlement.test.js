'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { FinanceFirestore } = require('./test-support/financeFirestore');
const { settleRemaining } = require('./reimbursementSettlement');
const { workflowState } = require('./liquidationWorkflow');

test('urgent remaining CA-excess payment restores only the unpaid amount and does not close missing receipt workflow', async () => {
  const liq = { status: 'submitted', rows_json: '[]', receipts_json: '[]', total_amount: 100 };
  const db = new FinanceFirestore({ liquidations: { l1: liq }, reimbursements: { r1: { liquidationId: 'l1', origin: 'ca_excess', caId: 'ca1', amount: 100, paidAmount: 50, status: 'pending' } }, cash_advances: { ca1: { balance_remaining: -50 }, other: { balance_remaining: 200 } } });
  const ctx = { user: { id: 'admin' }, now: 1234, fs: null, reference: 'ref', proofRef: null, urgentPaymentReason: 'Urgent staff need' };
  await settleRemaining(db, ['r1'], ctx, n => ({ __increment: n }), true);
  assert.equal(db.store.cash_advances.ca1.balance_remaining, 0); assert.equal(db.store.cash_advances.other.balance_remaining, 200);
  assert.equal(Object.values(db.store.reimbursement_payments)[0].amount, 50);
  assert.equal(Object.values(db.store.reimbursement_payments)[0].paymentException.reason, 'Urgent staff need');
  assert.equal(workflowState(liq, null, db.store.reimbursements.r1), 'awaiting_physical');
});
for (const file of ['server.js', 'functions/server.js']) {
  test(`${file}: legacy toggle enforces review/urgent rule and retains exception history`, async () => {
    const source = fs.readFileSync(file, 'utf8'); const start = source.indexOf("app.patch('/api/liquidations/:id',"); const end = source.indexOf('// Admin-only: list pending reimbursement claims', start);
    const db = new FinanceFirestore({ liquidations: { l1: { status: 'submitted', rows_json: '[]', receipts_json: '[]', reimbursement_status: 'pending' } }, reimbursements: { l1: { status: 'pending', amount: 100 } } });
    let handler; const user = { id: 'admin', role: 'admin', approved: 1 };
    vm.runInNewContext(source.slice(start, end), { app: { patch: (_path, fn) => { handler = fn; } }, db, getCurrentUser: async () => user, require: name => require('../' + name), console });
    const call = async body => { let code = 200; let data; const res = { status(c) { code = c; return this; }, json(d) { data = d; return this; } }; await handler({ params: { id: 'l1' }, body }, res); return { code, data }; };
    assert.equal((await call({ reimbursement_status: 'reimbursed' })).code, 409); assert.equal(db.store.reimbursements.l1.status, 'pending');
    assert.equal((await call({ reimbursement_status: 'reimbursed', urgentPaymentReason: 'Urgent transport' })).code, 200);
    assert.equal(db.store.reimbursements.l1.status, 'paid');
    const events = Object.values(db.store['liquidations/l1/payment_status_history']); assert.equal(events.length, 1); assert.equal(events[0].paymentException.reason, 'Urgent transport');
    await call({ reimbursement_status: 'reimbursed', urgentPaymentReason: 'Urgent transport' }); assert.equal(Object.values(db.store['liquidations/l1/payment_status_history']).length, 1);
  });
}
test('migration 003 preserves historical paid status and cannot synthesize receipt workflow', () => {
  const directory = fs.mkdtempSync(path.join(process.cwd(), '.physical-migration-'));
  try {
    const input = path.join(directory, 'snapshot.json'); const output = path.join(directory, 'manifest.json');
    fs.writeFileSync(input, JSON.stringify({ liquidations: [{ id: 'l1', status: 'submitted' }], reimbursements: [{ id: 'r1', status: 'paid', amount: 100 }] }));
    const args = ['scripts/migrations/003-physical-receipt-workflow.js', '--snapshot', input, '--manifest', output];
    assert.match(execFileSync(process.execPath, args).toString(), /DRY RUN/);
    for (const action of ['--apply', '--rollback']) assert.match(execFileSync(process.execPath, [...args, action]).toString(), /NO-OP/);
    const manifest = JSON.parse(fs.readFileSync(output)); assert.deepEqual(manifest.writes, []); assert.equal(manifest.legacyPaidCount, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
