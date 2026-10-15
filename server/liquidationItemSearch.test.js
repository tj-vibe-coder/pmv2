'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FinanceFirestore } = require('./test-support/financeFirestore');
const { receiptReviewHash } = require('./liquidationReceiptReview');
const { parseCriteria, searchLiquidationItems } = require('./liquidationItemSearch');

const rows = (...list) => JSON.stringify(list);
const kimLiq = {
  user_id: 'kim', status: 'submitted', form_no: 'LQ26-021-KKS', employee_name: 'Kim Kerwin Solis',
  rows_json: rows(
    { id: 'r1', date: '2026-09-21', category: 'Gas', particulars: 'Shell Gas Station', supplier: 'Shell', invoiceNo: 'INV-000-643427', amount: 350 },
    { id: 'r2', date: '2026-09-23', category: 'Transportation', particulars: 'Calax Toll Gate', amount: 246 },
  ),
  receipts_json: JSON.stringify([{ rowId: 'r1', filename: 'a.jpg', webUrl: 'https://od/a.jpg', oneDriveId: 'od1' }]),
};
const renzelDraft = { user_id: 'renzel', status: 'draft', form_no: 'LQ26-022-RPP', rows_json: rows({ id: 'd1', date: '2026-10-01', particulars: 'Shell gas', amount: 350.5 }), receipts_json: '[]' };
const seed = () => new FinanceFirestore({
  liquidations: { k: kimLiq, r: renzelDraft, gone: { user_id: 'kim', status: 'deleted', rows_json: rows({ id: 'x', amount: 350 }) } },
  liquidation_receipt_reviews: { k: { physicalSubmission: { active: true, version: 1, contentHash: receiptReviewHash(kimLiq), submittedDate: '2026-10-05' } } },
});
const admin = { id: 'rj', role: 'admin' };

test('needs at least one criterion', () => {
  assert.throws(() => parseCriteria({}), /amount, some text, or a date range/);
  assert.equal(parseCriteria({ amount: '₱1,046.00' }).amount, 1046);
});

test('amount search ranks the exact match first and reports item no, digital receipt and paper status', async () => {
  const out = await searchLiquidationItems(seed(), admin, { amount: '350' });
  assert.equal(out.total, 2);
  const [first, second] = out.results;
  assert.equal(first.formNo, 'LQ26-021-KKS');
  assert.equal(first.exactAmount, true);
  assert.equal(first.itemNo, 1);
  assert.deepEqual(first.receipts, [{ filename: 'a.jpg', webUrl: 'https://od/a.jpg', oneDriveId: 'od1' }]);
  assert.deepEqual(first.paper, { state: 'handed_in', submittedDate: '2026-10-05', reviewDate: null });
  assert.equal(second.formStatus, 'draft');
  assert.equal(second.exactAmount, false);
  assert.deepEqual(second.paper, { state: 'draft' });
});

test('text matches invoice numbers ignoring punctuation, and every word must match', async () => {
  assert.equal((await searchLiquidationItems(seed(), admin, { q: '643427' })).results[0].rowId, 'r1');
  assert.equal((await searchLiquidationItems(seed(), admin, { q: 'calax toll' })).results[0].rowId, 'r2');
  assert.equal((await searchLiquidationItems(seed(), admin, { q: 'calax shell' })).total, 0);
});

test('date range and non-admin scoping', async () => {
  const ranged = await searchLiquidationItems(seed(), admin, { from: '2026-09-22', to: '2026-09-30' });
  assert.deepEqual(ranged.results.map(r => r.rowId), ['r2']);
  const own = await searchLiquidationItems(seed(), { id: 'renzel', role: 'user' }, { q: 'shell' });
  assert.deepEqual(own.results.map(r => r.liquidationId), ['r']);
});

test('a form edited after hand-in, or never handed in, says so', async () => {
  const db = seed();
  db.store.liquidations.k.total_amount = 999; // content changed after the packet was handed in
  assert.equal((await searchLiquidationItems(db, admin, { q: 'calax' })).results[0].paper.state, 'changed_since');
  delete db.store.liquidation_receipt_reviews.k;
  assert.equal((await searchLiquidationItems(db, admin, { q: 'calax' })).results[0].paper.state, 'not_handed_in');
});

test('amount also matches the invoice total of a receipt split over several lines', async () => {
  const liq = {
    user_id: 'kim', status: 'submitted', form_no: 'LQ26-019-KKS',
    rows_json: rows(
      { id: 'g', date: '2026-09-29', particulars: 'Shell gas', supplier: 'Shell', invoiceNo: 'INV-77', amount: 800 },
      { id: 't', date: '2026-09-29', particulars: 'Car wash', supplier: 'Shell', invoiceNo: 'INV-77', amount: 246 },
      { id: 'o', date: '2026-09-29', particulars: 'Unrelated', supplier: 'Jollibee', amount: 246 },
    ),
    receipts_json: '[]',
  };
  const db = new FinanceFirestore({ liquidations: { a: liq } });
  const out = await searchLiquidationItems(db, admin, { amount: '1046' });
  assert.deepEqual(out.results.map(r => r.rowId).sort(), ['g', 't']);
  assert.deepEqual(out.results[0].invoiceTotal, { total: 1046, lines: 2, exact: true });
  // Text still narrows invoice-total hits.
  assert.equal((await searchLiquidationItems(db, admin, { amount: '1046', q: 'jollibee' })).total, 0);
  // A single-line exact match isn't reported twice.
  const single = await searchLiquidationItems(db, admin, { amount: '246' });
  assert.deepEqual(single.results.map(r => [r.rowId, r.invoiceTotal]), [['t', null], ['o', null]]);
});
