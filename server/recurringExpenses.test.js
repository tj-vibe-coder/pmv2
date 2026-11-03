'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { FinanceFirestore } = require('./test-support/financeFirestore');
const { manilaToday, nextOccurrence, firstOccurrence, dueOccurrences, createRecurringExpensesRouter } = require('./recurringExpenses');

test('dates follow Manila time, not the server clock', () => {
  assert.equal(manilaToday(new Date('2026-11-02T16:30:00Z')), '2026-11-03');
  assert.equal(manilaToday(new Date('2026-11-02T15:59:00Z')), '2026-11-02');
});

test('month-end anchors clamp and recover (Jan 31 -> Feb 28 -> Mar 31)', () => {
  assert.equal(nextOccurrence('2027-01-31', 'monthly', 31), '2027-02-28');
  assert.equal(nextOccurrence('2027-02-28', 'monthly', 31), '2027-03-31');
  assert.equal(nextOccurrence('2028-01-30', 'monthly', 30), '2028-02-29');
  assert.equal(nextOccurrence('2026-12-25', 'quarterly', 25), '2027-03-25');
  assert.equal(nextOccurrence('2026-11-09', 'yearly', 9), '2027-11-09');
  assert.equal(firstOccurrence('2026-11-10', 9), '2026-12-09');
  assert.equal(firstOccurrence('2026-12-10', 9), '2027-01-09');
  assert.equal(firstOccurrence('2026-11-03', 9), '2026-11-09');
});

test('a missed month shows as two separate due occurrences', () => {
  assert.deepEqual(dueOccurrences({ nextDue: '2026-09-10', frequency: 'monthly', dayOfMonth: 10 }, '2026-10-12'), ['2026-09-10', '2026-10-10']);
  assert.deepEqual(dueOccurrences({ nextDue: '2026-11-10', frequency: 'monthly', dayOfMonth: 10 }, '2026-11-03'), []);
});

async function server(seed, user = { id: 'rj', role: 'superadmin' }, clock = '2026-11-12T02:00:00Z') {
  const db = new FinanceFirestore(seed);
  const app = express();
  app.use(express.json());
  app.use('/api/recurring-expenses', createRecurringExpensesRouter({ db, requireActiveUser: async () => user, now: () => new Date(clock) }));
  const listener = await new Promise((resolve) => { const l = app.listen(0, () => resolve(l)); });
  const base = `http://127.0.0.1:${listener.address().port}/api/recurring-expenses`;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { db, call, close: () => listener.close() };
}

const claude = { name: 'Claude Pro', supplier: 'Anthropic', category: 'Software & Subscriptions', scope: 'overhead', amount: 1458.27, currency: 'USD',
  frequency: 'monthly', dayOfMonth: 9, paidBy: { kind: 'person_repay', userId: 'user_14', name: 'Reuel Rivera' }, startDate: '2026-11-01' };
const armin = { name: 'Armin retainer', supplier: 'Armin B Cruz', category: 'Professional Fees', scope: 'overhead', amount: 3000, currency: 'PHP',
  frequency: 'monthly', dayOfMonth: 26, paidBy: { kind: 'company', paidVia: 'bank' }, startDate: '2026-10-26' };

test('company item posts one overhead expense, once, even when confirmed twice at once', async (t) => {
  const s = await server({}); t.after(s.close);
  const created = await s.call('POST', '/', armin);
  assert.equal(created.status, 201);
  const id = created.body.template.id;
  assert.deepEqual(created.body.template.due, ['2026-10-26']);
  const [a, b] = await Promise.all([
    s.call('POST', `/${id}/confirm`, { occurrence: '2026-10-26', amount: 3000 }),
    s.call('POST', `/${id}/confirm`, { occurrence: '2026-10-26', amount: 3000 }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const expenses = Object.values(s.db.store.overhead_expenses);
  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].category, 'Professional Fees');
  assert.equal(expenses[0].sourceType, 'recurring');
  assert.deepEqual(expenses[0].fundingSource, { type: 'corporate_bank', treatment: 'company_funded', paidVia: 'bank' });
  assert.equal(s.db.store.recurring_expenses[id].nextDue, '2026-11-26');
  assert.ok(s.db.store.recurring_expense_postings[`${id}_2026-10-26`]);
});

test('repay-me item adds a line to the person\'s draft liquidation, never a direct expense', async (t) => {
  const s = await server({ liquidations: { d1: { user_id: 'user_14', status: 'draft', rows_json: JSON.stringify([{ id: 'r0', amount: 100 }]), receipts_json: '[]', total_amount: 100, updated_at: 1 } } });
  t.after(s.close);
  const id = (await s.call('POST', '/', claude)).body.template.id;
  const res = await s.call('POST', `/${id}/confirm`, { occurrence: '2026-11-09', amount: 1458.27, invoiceAmount: 22.4,
    receiptRef: { oneDriveId: 'od1', webUrl: 'https://x', filename: 'claude.pdf' } });
  assert.equal(res.status, 200);
  assert.equal(s.db.store.overhead_expenses, undefined);
  const liq = s.db.store.liquidations.d1;
  const rows = JSON.parse(liq.rows_json);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].category, 'Software & Subscriptions');
  assert.match(rows[1].remarks, /Invoice USD 22\.40/);
  assert.equal(liq.total_amount, 1558.27);
  assert.equal(JSON.parse(liq.receipts_json)[0].rowId, rows[1].id);
});

test('repay-me item creates a draft when the person has none', async (t) => {
  const s = await server({}); t.after(s.close);
  const id = (await s.call('POST', '/', claude)).body.template.id;
  await s.call('POST', `/${id}/confirm`, { occurrence: '2026-11-09', amount: 1458.27 });
  const [liq] = Object.values(s.db.store.liquidations);
  assert.equal(liq.status, 'draft');
  assert.equal(liq.user_id, 'user_14');
  assert.equal(liq.form_no, null);
});

test('skip advances without posting; a price change affects only future defaults', async (t) => {
  const s = await server({}); t.after(s.close);
  const id = (await s.call('POST', '/', armin)).body.template.id;
  await s.call('POST', `/${id}/confirm`, { occurrence: '2026-10-26', amount: 3000 });
  const skipped = await s.call('POST', `/${id}/skip`, { occurrence: '2026-11-26', reason: 'not billed' });
  assert.equal(skipped.status, 400); // not due yet on 2026-11-12
  const edited = await s.call('PUT', `/${id}`, { amount: 3500 });
  assert.equal(edited.body.template.amount, 3500);
  assert.equal(edited.body.template.priceHistory.length, 2);
  assert.equal(Object.values(s.db.store.overhead_expenses)[0].amount, 3000);
});

test('paused items and non-admins cannot post', async (t) => {
  const s = await server({}); t.after(s.close);
  const id = (await s.call('POST', '/', armin)).body.template.id;
  await s.call('PUT', `/${id}`, { active: false });
  assert.equal((await s.call('POST', `/${id}/confirm`, { occurrence: '2026-10-26', amount: 3000 })).status, 409);
  const u = await server({}, { id: 'kim', role: 'user' }); t.after(u.close);
  assert.equal((await u.call('GET', '/')).status, 403);
});
