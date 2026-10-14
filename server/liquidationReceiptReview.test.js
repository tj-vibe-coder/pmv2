'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { execFileSync } = require('node:child_process');
const { FinanceFirestore } = require('./test-support/financeFirestore');
const { receiptReviewHash, reviewStatus } = require('./liquidationReceiptReview');
const fixture = fs.mkdtempSync(path.join(process.cwd(), '.receipt-review-package-'));
fs.mkdirSync(path.join(fixture, 'server')); fs.mkdirSync(path.join(fixture, 'scripts'));
fs.copyFileSync('scripts/prepare-functions.js', path.join(fixture, 'scripts/prepare-functions.js'));
fs.copyFileSync('functions/server.js', path.join(fixture, 'server.js'));
for (const file of ['liquidationReceiptReview.js', 'liquidationReceiptReviewRouter.js', 'liquidationWorkflow.js', 'financeEvidence.js']) fs.copyFileSync(`server/${file}`, path.join(fixture, 'server', file));
execFileSync(process.execPath, ['scripts/prepare-functions.js'], { cwd: fixture });
after(() => fs.rmSync(fixture, { recursive: true, force: true }));
const seed = () => ({ liquidations: { liq1: { user_id: 'owner', status: 'submitted', form_no: 'LQ26-001', employee_name: 'Employee', date_of_submission: '2026-10-01', total_amount: 100,
  rows_json: JSON.stringify([{ id: 'row1', date: '2026-10-01', particulars: 'Fare', amount: 100 }]), receipts_json: '[]', reimbursement_status: 'pending' } },
  cash_advances: { ca1: { balance_remaining: 50 } }, reimbursements: { liq1: { status: 'paid', paidAmount: 100 } }, investments: { i1: { amount: 100 } } });
async function setup(t, file, physical = true) {
  const db = new FinanceFirestore(seed());
  if (physical) db.store.liquidation_receipt_reviews = { liq1: { active: false, revision: 0, physicalSubmission: { active: true, version: 1, contentHash: receiptReviewHash(db.store.liquidations.liq1), submittedDate: '2026-10-01', submittedByName: 'Employee' } } };
  const app = express(); app.use(express.json());
  const { createLiquidationReceiptReviewRouter } = require(file === 'server.js' ? './liquidationReceiptReviewRouter' : path.join(fixture, 'functions/server/liquidationReceiptReviewRouter'));
  app.use('/api/liquidations', createLiquidationReceiptReviewRouter({ db, requireActiveUser: async (req, res) => {
    const role = req.headers['x-role']; if (!role || role === 'unapproved') { res.status(401).json({ error: 'Unauthorized' }); return null; }
    return { username: req.headers['x-user'] === 'reviewer' ? 'RJR' : 'OTHER', id: req.headers['x-user'] || 'reviewer', role, full_name: 'Actual Reviewer', scannerScope: req.headers['x-scanner'] };
  } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const request = async (method = 'GET', body, role = 'admin', user = 'reviewer', suffix = '', scanner = '') => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/liquidations/liq1/${suffix === '/physical' ? 'physical-receipts' : `receipt-review${suffix}`}`, { method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-role': role } : {}), 'x-user': user, 'x-scanner': scanner }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  const body = () => ({ action: 'review', contentHash: receiptReviewHash(db.store.liquidations.liq1), revision: 0, reviewDate: '2026-10-01', physicalReceiptConfirmed: true, confirmed: true, note: 'Checked and signed original paper form', reviewedBy: 'spoof', reviewedByName: 'Someone else', recordedAt: '1900-01-01' });
  return { db, request, body };
}
for (const file of ['server.js', 'functions/server.js']) {
  test(`${file}: manual review records authenticated identity/date, tolerates retry and leaves all financial records untouched`, async t => {
    assert.match(fs.readFileSync(file, 'utf8'), /createLiquidationReceiptReviewRouter\(\{ db, requireActiveUser \}\)/);
    assert.match(fs.readFileSync(file, 'utf8'), /liq.receipt_review_content_hash = require\('\.\/server\/liquidationReceiptReview'\).receiptReviewHash\(liq\)/);
    const { db, request, body } = await setup(t, file); const before = structuredClone(db.store);
    assert.equal((await request()).data.status, 'not_reviewed');
    const result = await request('POST', body()); assert.equal(result.status, 200); assert.equal(result.data.review.reviewedBy, 'reviewer'); assert.equal(result.data.review.reviewedByName, 'Actual Reviewer');
    assert.equal(result.data.review.reviewDate, '2026-10-01'); assert.notEqual(result.data.review.recordedAt, '1900-01-01');
    assert.equal((await request('POST', body())).status, 200);
    assert.equal((await request('GET', undefined, 'admin', 'reviewer', '/history')).data.length, 1);
    for (const key of Object.keys(before).filter(k => k !== 'liquidation_receipt_reviews')) assert.deepEqual(db.store[key], before[key]);
  });
  test(`${file}: permissions, confirmation, actual date and submitted/pending gates are enforced`, async t => {
    const { db, request, body } = await setup(t, file);
    for (const role of [null, 'unapproved']) assert.equal((await request('POST', body(), role)).status, 401);
    for (const role of ['user', 'viewer', 'tax_filer']) assert.equal((await request('POST', body(), role)).status, 403);
    assert.equal((await request('GET', undefined, 'user', 'owner')).status, 200);
    assert.equal((await request('GET', undefined, 'user', 'other')).status, 403);
    assert.equal((await request('GET', undefined, 'tax_filer', 'owner')).status, 403);
    assert.equal((await request('POST', body(), 'admin', 'reviewer', '', 'receipt')).status, 403);
    for (const invalid of [{ confirmed: false }, { reviewDate: '2026-02-30' }, { reviewDate: '2999-01-01' }, { reviewDate: '' }]) assert.equal((await request('POST', { ...body(), ...invalid })).status, 400);
    db.store.liquidations.liq1.status = 'draft'; assert.equal((await request('POST', body())).status, 409);
    db.store.liquidations.liq1.status = 'submitted'; db.store.liquidations.liq1.pending_revision = { proposed_by: 'owner' }; assert.equal((await request('POST', body())).status, 409);
    assert.equal(db.store.liquidation_receipt_reviews.liq1.revision, 0);
  });
  test(`${file}: staff handover, RJ possession/review and closure preserve paid history`, async t => {
    const { db, request, body } = await setup(t, file, false);
    const before = structuredClone(db.store);
    assert.equal((await request()).data.workflowStatus, 'awaiting_physical');
    const physical = () => ({ action: 'submit', revision: 0, contentHash: receiptReviewHash(db.store.liquidations.liq1), submittedDate: '2026-10-01', confirmed: true, note: 'Printed form and originals handed to RJ' });
    assert.equal((await request('POST', physical(), 'user', 'other', '/physical')).status, 403);
    assert.equal((await request('POST', { ...physical(), confirmed: false }, 'user', 'owner', '/physical')).status, 400);
    assert.equal((await request('POST', { ...physical(), submittedDate: '2999-01-01' }, 'user', 'owner', '/physical')).status, 400);
    assert.equal((await request('POST', physical(), 'user', 'owner', '/physical')).status, 200);
    const state = (await request()).data;
    assert.equal(state.workflowStatus, 'awaiting_rj_review'); assert.equal(state.review.physicalSubmission.submittedBy, 'owner');
    assert.equal((await request('POST', { ...body(), revision: 1 }, 'admin', 'other')).status, 403);
    assert.equal((await request('POST', { ...body(), revision: 1, physicalReceiptConfirmed: false })).status, 400);
    assert.equal((await request('POST', { ...body(), revision: 1, reviewDate: '2026-09-30' })).status, 400);
    assert.equal((await request('POST', { ...body(), revision: 1 })).status, 200);
    assert.equal((await request()).data.workflowStatus, 'closed');
    for (const key of Object.keys(before)) assert.deepEqual(db.store[key], before[key]);
    assert.equal((await request('POST', { ...physical(), action: 'return', revision: 2, note: 'One original needs correction' }, 'user', 'owner', '/physical')).status, 403);
    assert.equal((await request('POST', { ...physical(), action: 'return', revision: 2, note: 'One original needs correction' }, 'admin', 'reviewer', '/physical')).status, 200);
    assert.equal((await request()).data.workflowStatus, 'awaiting_physical');
    const returned = (await request()).data.review.physicalSubmission;
    assert.equal(returned.returnedByName, 'Actual Reviewer'); assert.equal(returned.returnedBy, 'reviewer'); assert.ok(Number.isFinite(Date.parse(returned.returnedAt)));
    assert.equal(returned.returnReason, 'One original needs correction'); assert.equal(returned.note, 'Printed form and originals handed to RJ');
    assert.equal((await request('POST', { ...physical(), revision: 3 }, 'user', 'owner', '/physical')).status, 200);
    assert.equal((await request()).data.workflowStatus, 'awaiting_rj_review');
    assert.equal((await request('POST', { ...body(), revision: 4 })).status, 200);
    assert.equal((await request()).data.workflowStatus, 'closed');
    db.store.liquidations.liq1.pending_revision = { proposed_by: 'owner' }; assert.equal((await request()).data.workflowStatus, 'pending_edit');
    delete db.store.liquidations.liq1.pending_revision;
    db.store.liquidations.liq1.total_amount = 110; assert.equal((await request()).data.workflowStatus, 'review_required');
    assert.equal((await request('POST', { ...body(), revision: 5 })).status, 409);
    const history = await request('GET', undefined, 'admin', 'reviewer', '/history');
    assert.deepEqual(new Set(history.data.map(e => e.action)), new Set(['physical_submit', 'review', 'physical_return']));
  });
  test(`${file}: reviewed legacy form with unknown settlement remains open through the public router`, async t => {
    const { db, request, body } = await setup(t, file, false);
    delete db.store.reimbursements.liq1;
    delete db.store.liquidations.liq1.reimbursement_status;
    const before = structuredClone(db.store);
    assert.equal((await request('POST', { action: 'submit', revision: 0, contentHash: receiptReviewHash(db.store.liquidations.liq1), submittedDate: '2026-10-01', confirmed: true }, 'user', 'owner', '/physical')).status, 200);
    assert.equal((await request('POST', { ...body(), revision: 1 })).status, 200);
    assert.equal((await request()).data.workflowStatus, 'source_review_required');
    for (const key of Object.keys(before)) assert.deepEqual(db.store[key], before[key]);
  });
  test(`${file}: closure distinguishes unknown/inconsistent settlement from explicit zero-due and paid history`, async t => {
    const { db, request } = await setup(t, file);
    const base = { ...db.store.liquidations.liq1 }; delete base.reimbursement_status;
    const cases = [
      [{}, 'source_review_required'],
      [{ reimbursable_amount: null }, 'source_review_required'],
      [{ reimbursable_amount: '' }, 'source_review_required'],
      [{ reimbursable_amount: false }, 'source_review_required'],
      [{ reimbursable_amount: 'unknown' }, 'source_review_required'],
      [{ reimbursable_amount: -1 }, 'source_review_required'],
      [{ reimbursable_amount: 0 }, 'source_review_required'],
      [{ reimbursable_amount: 0, ca_id: 'ca1', ca_covered_amount: 99 }, 'source_review_required'],
      [{ reimbursable_amount: 0, ca_id: 'ca1', ca_covered_amount: null }, 'source_review_required'],
      [{ reimbursable_amount: 0, total_amount: 0 }, 'closed'],
      [{ reimbursable_amount: 0, ca_id: 'ca1', ca_covered_amount: 100 }, 'closed'],
      [{ reimbursable_amount: '0', ca_id: 'ca1', ca_covered_amount: '100.00' }, 'closed'],
      [{ reimbursable_amount: 10 }, 'awaiting_payment'],
      [{ reimbursement_status: 'pending' }, 'awaiting_payment'],
      [{ reimbursement_status: 'reimbursed' }, 'closed'],
      [{ reimbursement_status: 'unknown' }, 'source_review_required'],
    ];
    delete db.store.reimbursements.liq1;
    for (const [patch, expected] of cases) {
      const liq = { ...base, ...patch }; db.store.liquidations.liq1 = liq;
      const hash = receiptReviewHash(liq);
      db.store.liquidation_receipt_reviews.liq1 = { active: true, reviewedBy: 'reviewer', reviewedByUsername: 'RJR', rjConfirmedSubmissionVersion: 1, contentHash: hash, revision: 1, physicalSubmission: { active: true, version: 1, contentHash: hash } };
      const before = structuredClone(db.store.liquidations);
      const result = await request(); assert.equal(result.status, 200); assert.equal(result.data.workflowStatus, expected, JSON.stringify(patch));
      assert.deepEqual(db.store.liquidations, before);
    }
    db.store.reimbursements.liq1 = { status: 'paid', amount: 100 };
    assert.equal((await request()).data.workflowStatus, 'closed');
    db.store.reimbursements.liq1.status = 'unknown'; assert.equal((await request()).data.workflowStatus, 'source_review_required');
  });
  test(`${file}: changed forms and concurrent reviews reject stale writes; re-review and withdrawal preserve history`, async t => {
    const { db, request, body } = await setup(t, file);
    const old = body(); db.store.liquidations.liq1.total_amount = 120;
    assert.equal((await request('POST', old)).status, 409);
    db.store.liquidation_receipt_reviews.liq1.physicalSubmission.contentHash = receiptReviewHash(db.store.liquidations.liq1);
    assert.equal((await request('POST', body())).status, 200);
    assert.equal((await request('POST', { ...body(), note: 'Another reviewer' }, 'admin', 'other')).status, 403);
    assert.equal((await request('POST', { ...body(), note: 'Stale review' })).status, 409);
    db.store.liquidations.liq1.rows_json = JSON.stringify([{ id: 'row1', particulars: 'Corrected fare', amount: 120 }]);
    assert.equal((await request()).data.status, 'review_required');
    db.store.liquidation_receipt_reviews.liq1.physicalSubmission.contentHash = receiptReviewHash(db.store.liquidations.liq1);
    assert.equal((await request('POST', { ...body(), revision: 1 })).status, 200);
    assert.equal((await request()).data.status, 'reviewed');
    assert.equal((await request('POST', { ...body(), revision: 2, action: 'withdraw', note: '' })).status, 400);
    assert.equal((await request('POST', { ...body(), revision: 2, action: 'withdraw', note: 'Receipt needs another check' })).status, 200);
    const state = (await request()).data; assert.equal(state.status, 'withdrawn'); assert.equal(state.review.reviewedByName, 'Actual Reviewer');
    assert.equal((await request('GET', undefined, 'user', 'owner', '/history')).data.length, 3);
    assert.equal((await request('GET', undefined, 'user', 'other', '/history')).status, 403);
  });
}
test('receipt fingerprint tracks saved form and receipt links, excludes payment state and display thumbnails', () => {
  const liq = seed().liquidations.liq1; const hash = receiptReviewHash(liq);
  assert.equal(receiptReviewHash({ ...liq, reimbursement_status: 'reimbursed', updated_at: 123 }), hash);
  for (const patch of [{ employee_name: 'Changed' }, { total_amount: 101 }, { receipts_json: JSON.stringify([{ id: 'r', rowId: 'row1', oneDriveId: 'item1', webUrl: 'https://example.com/a' }]) }]) assert.notEqual(receiptReviewHash({ ...liq, ...patch }), hash);
  assert.equal(reviewStatus(liq, null), 'not_reviewed');
});
test('migration 002 dry-run/apply/rollback never synthesize or delete historical attestations', () => {
  const input = path.join(fixture, 'snapshot.json'); const output = path.join(fixture, '002-manifest.json'); fs.writeFileSync(input, JSON.stringify({ liquidations: [{ ...seed().liquidations.liq1, id: 'liq1' }] }));
  const args = ['scripts/migrations/002-liquidation-receipt-review.js', '--snapshot', input, '--manifest', output];
  assert.match(execFileSync(process.execPath, args).toString(), /zero backfill writes/);
  for (const action of ['--apply', '--rollback']) assert.match(execFileSync(process.execPath, [...args, action]).toString(), /NO-OP/);
  assert.deepEqual(JSON.parse(fs.readFileSync(output)).writes, []);
});
