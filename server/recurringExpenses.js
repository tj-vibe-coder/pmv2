'use strict';
// Recurring expenses (subscriptions, retainers, quarterly taxes). There is no
// scheduler: a template only reminds. Each due occurrence waits in a tray until
// an admin confirms it (with the amount actually charged, which can differ:
// Microsoft 365 is prorated) or skips it. Plan: IOCT Finance
// docs/finance/EXPENSE_RECORDING_PLAN.md, approved by RJ 2026-11-03.
//
// Collections:
//   recurring_expenses          templates
//   recurring_expense_postings  one doc per occurrence, id `<templateId>_<YYYY-MM-DD>`.
//                               Created in the same transaction that posts the cost and
//                               advances the template, so an occurrence posts once even
//                               when two people confirm at the same moment.
//
// Who paid decides where a confirmed occurrence goes (same rule as direct expenses):
//   company       -> an overhead or project expense, fundingSource company_funded
//   person_repay  -> a new line on that person's draft liquidation (created if none),
//                    so the repayment claim appears when they submit it.

const express = require('express');

const FREQUENCIES = { monthly: 1, quarterly: 3, yearly: 12 };
const CURRENCIES = ['PHP', 'USD'];
const PAID_VIA = ['bank', 'corporate_card'];
const MAX_CATCH_UP = 24;

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

// Today's date in the Philippines, whatever the server's time zone.
function manilaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// The anchor day in a given month, clamped to its last day (31 -> 28/29/30).
function clampedDate(year, month0, day) {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

// Next occurrence after `date`, computed from the anchor day (not from the
// clamped date) so Jan 31 -> Feb 28 -> Mar 31.
function nextOccurrence(date, frequency, dayOfMonth) {
  const [y, m] = date.split('-').map(Number);
  const months = (m - 1) + FREQUENCIES[frequency];
  return clampedDate(y + Math.floor(months / 12), months % 12, dayOfMonth);
}

// First occurrence on or after `startDate`.
function firstOccurrence(startDate, dayOfMonth) {
  const [y, m] = startDate.split('-').map(Number);
  const same = clampedDate(y, m - 1, dayOfMonth);
  return same >= startDate ? same : clampedDate(m === 12 ? y + 1 : y, m % 12, dayOfMonth);
}

// Occurrences from nextDue up to today (oldest first), capped.
function dueOccurrences(template, today) {
  const out = [];
  let d = template.nextDue;
  while (d && d <= today && out.length < MAX_CATCH_UP) { out.push(d); d = nextOccurrence(d, template.frequency, template.dayOfMonth); }
  return out;
}

// The category list lives in src/data/financeCategories.ts; the form offers it.
function normalizeTemplate(body) {
  const b = body || {};
  const name = text(b.name, 120); if (!name) fail('Give the recurring item a name');
  const scope = b.scope === 'project' ? 'project' : 'overhead';
  const category = text(b.category, 60);
  if (!category) fail('Pick a category');
  const amount = round2(b.amount); if (!(amount > 0)) fail('Enter the usual amount');
  const currency = CURRENCIES.includes(b.currency) ? b.currency : 'PHP';
  const frequency = FREQUENCIES[b.frequency] ? b.frequency : fail('Pick monthly, quarterly or yearly');
  const dayOfMonth = Number(b.dayOfMonth);
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) fail('Day of month must be 1 to 31');
  let paidBy;
  if (b.paidBy && b.paidBy.kind === 'person_repay') {
    const userId = text(b.paidBy.userId, 128); if (!userId || userId.includes('/')) fail('Pick who pays and gets repaid');
    paidBy = { kind: 'person_repay', userId, name: text(b.paidBy.name, 120) };
  } else {
    paidBy = { kind: 'company', paidVia: PAID_VIA.includes(b.paidBy && b.paidBy.paidVia) ? b.paidBy.paidVia : 'bank' };
  }
  const out = { name, supplier: text(b.supplier, 120), category, scope, amount, currency, frequency, dayOfMonth, paidBy, notes: text(b.notes, 1000) };
  if (scope === 'project') {
    const projectId = text(b.projectId, 128); if (!projectId || projectId.includes('/')) fail('Pick the project');
    Object.assign(out, { projectId, projectName: text(b.projectName, 200), projectNo: text(b.projectNo, 60) });
  }
  return out;
}

function postingId(templateId, occurrence) { return `${templateId}_${occurrence}`; }

function createRecurringExpensesRouter({ db, requireActiveUser, now = () => new Date() }) {
  const router = express.Router();
  const templates = () => db.collection('recurring_expenses');
  const handle = (fn) => async (req, res) => {
    try {
      const user = await requireActiveUser(req, res); if (!user) return;
      if (user.scannerScope || !['admin', 'superadmin'].includes(user.role)) fail('Admins only', 403);
      await fn(req, res, user);
    } catch (err) {
      if (!err.status) console.error('Recurring expenses error:', err);
      res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Recurring expenses request failed' });
    }
  };
  const withDue = (id, t, today) => ({ id, ...t, due: t.active === false ? [] : dueOccurrences(t, today) });

  router.get('/', handle(async (req, res) => {
    const today = manilaToday(now());
    const snap = await templates().get();
    res.json({ success: true, today, templates: snap.docs.map((d) => withDue(d.id, d.data(), today)) });
  }));

  router.post('/', handle(async (req, res, user) => {
    const value = normalizeTemplate(req.body);
    const startDate = isDate(req.body.startDate) ? req.body.startDate : manilaToday(now());
    const stamp = now().toISOString();
    const doc = { ...value, active: true, nextDue: firstOccurrence(startDate, value.dayOfMonth),
      priceHistory: [{ amount: value.amount, currency: value.currency, from: startDate }],
      createdAt: stamp, createdBy: user.id, updatedAt: stamp };
    const ref = templates().doc();
    await ref.set(doc);
    res.status(201).json({ success: true, template: withDue(ref.id, doc, manilaToday(now())) });
  }));

  // Edits change future defaults only; past postings keep their own amounts.
  router.put('/:id', handle(async (req, res) => {
    const ref = templates().doc(String(req.params.id));
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref); if (!snap.exists) fail('Recurring item not found', 404);
      const before = snap.data();
      const value = normalizeTemplate({ ...before, ...req.body, paidBy: req.body.paidBy || before.paidBy });
      const update = { ...value, updatedAt: now().toISOString() };
      if (typeof req.body.active === 'boolean') update.active = req.body.active;
      if (isDate(req.body.nextDue)) update.nextDue = req.body.nextDue;
      else if (value.dayOfMonth !== before.dayOfMonth || value.frequency !== before.frequency) {
        // Re-anchor the pending occurrence to the new day, same month.
        const [y, m] = before.nextDue.split('-').map(Number);
        update.nextDue = clampedDate(y, m - 1, value.dayOfMonth);
      }
      if (value.amount !== before.amount || value.currency !== before.currency) {
        update.priceHistory = [...(before.priceHistory || []), { amount: value.amount, currency: value.currency, from: manilaToday(now()) }];
      }
      tx.update(ref, update);
      return { ...before, ...update };
    });
    res.json({ success: true, template: withDue(ref.id, result, manilaToday(now())) });
  }));

  // Confirm or skip the template's oldest due occurrence.
  const settle = (action) => handle(async (req, res, user) => {
    const ref = templates().doc(String(req.params.id));
    const b = req.body || {};
    const occurrence = b.occurrence;
    if (!isDate(occurrence)) fail('Missing occurrence date');
    const today = manilaToday(now());
    if (occurrence > today) fail('That occurrence is not due yet');
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref); if (!snap.exists) fail('Recurring item not found', 404);
      const t = snap.data();
      if (t.active === false) fail('This recurring item is paused', 409);
      if (t.nextDue !== occurrence) fail('Someone already settled this occurrence. Refresh the list.', 409);
      const postingRef = db.collection('recurring_expense_postings').doc(postingId(ref.id, occurrence));
      if ((await tx.get(postingRef)).exists) fail('Someone already settled this occurrence. Refresh the list.', 409);
      const stamp = now().toISOString();
      const posting = { templateId: ref.id, templateName: t.name, occurrence, status: action, postedAt: stamp, postedBy: user.id };

      if (action === 'skipped') {
        posting.reason = text(b.reason, 500);
      } else {
        const amount = round2(b.amount);
        if (!(amount > 0)) fail('Enter the amount actually charged in PHP');
        const date = isDate(b.date) ? b.date : occurrence;
        const invoiceAmount = t.currency !== 'PHP' && Number(b.invoiceAmount) > 0 ? round2(b.invoiceAmount) : null;
        const remarks = [text(b.remarks, 500), invoiceAmount ? `Invoice ${t.currency} ${invoiceAmount.toFixed(2)}` : '']
          .filter(Boolean).join(' · ');
        const description = text(b.description, 300) || `${t.name} (${occurrence.slice(0, 7)})`;
        const receiptRef = b.receiptRef && typeof b.receiptRef === 'object' && text(b.receiptRef.oneDriveId, 200)
          ? { oneDriveId: text(b.receiptRef.oneDriveId, 200), webUrl: text(b.receiptRef.webUrl, 2000), filename: text(b.receiptRef.filename, 300) || 'receipt' }
          : null;
        Object.assign(posting, { amount, date, invoiceAmount, currency: t.currency });

        if (t.paidBy && t.paidBy.kind === 'person_repay') {
          // Reads first (transaction rule): the person's newest draft, if any.
          const drafts = await tx.get(db.collection('liquidations').where('user_id', '==', t.paidBy.userId).where('status', '==', 'draft'));
          const draft = drafts.docs.map((d) => ({ ref: d.ref, data: d.data() }))
            .sort((a, z) => (Number(z.data.updated_at) || 0) - (Number(a.data.updated_at) || 0))[0];
          const rowId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const row = { id: rowId, date, category: t.category, projectId: t.projectId || '', projectName: t.projectName || '', projectNo: t.projectNo || '',
            particulars: description, amount, remarks, deductible: true, deductibleReason: null, supplier: t.supplier || '', invoiceNo: '', customerInfoIssues: [] };
          const receipt = receiptRef ? [{ id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, rowId, ...receiptRef, uploadedAt: stamp }] : [];
          const seconds = Math.floor(now().getTime() / 1000);
          const parse = (v) => { try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch (_) { return []; } };
          if (draft) {
            const rows = [...parse(draft.data.rows_json), row];
            tx.update(draft.ref, { rows_json: JSON.stringify(rows), receipts_json: JSON.stringify([...parse(draft.data.receipts_json), ...receipt]),
              total_amount: round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)), updated_at: seconds });
            posting.target = { collection: 'liquidations', id: draft.ref.id };
          } else {
            const liqRef = db.collection('liquidations').doc();
            tx.set(liqRef, { user_id: t.paidBy.userId, form_no: null, date_of_submission: today, employee_name: t.paidBy.name || null, employee_number: null,
              rows_json: JSON.stringify([row]), receipts_json: JSON.stringify(receipt), total_amount: amount, ca_covered_amount: 0, reimbursable_amount: 0,
              ca_id: null, status: 'draft', reimbursement_status: null, reimbursed_at: null, reimbursed_by: null, created_at: seconds, updated_at: seconds });
            posting.target = { collection: 'liquidations', id: liqRef.id };
          }
          posting.liquidationRowId = rowId;
        } else {
          const collection = t.scope === 'project' ? 'project_expenses' : 'overhead_expenses';
          const expRef = db.collection(collection).doc();
          const doc = { description, amount, date, category: t.category, createdAt: stamp, createdBy: user.id, sourceType: 'recurring',
            recurringTemplateId: ref.id, recurringOccurrence: occurrence,
            fundingSource: { type: 'corporate_bank', treatment: 'company_funded', paidVia: (t.paidBy && t.paidBy.paidVia) || 'bank' } };
          if (t.scope === 'project') Object.assign(doc, { projectId: t.projectId, projectName: t.projectName || '' });
          if (remarks) doc.remarks = remarks;
          if (t.supplier) doc.supplier = t.supplier;
          if (receiptRef) doc.receiptRef = receiptRef;
          if (invoiceAmount) Object.assign(doc, { invoiceAmount, invoiceCurrency: t.currency });
          tx.set(expRef, doc);
          posting.target = { collection, id: expRef.id };
        }
      }
      tx.set(postingRef, posting);
      const nextDue = nextOccurrence(occurrence, t.frequency, t.dayOfMonth);
      tx.update(ref, { nextDue, lastSettled: { occurrence, status: action, at: stamp }, updatedAt: stamp });
      return { posting, template: { ...t, nextDue } };
    });
    res.json({ success: true, posting: result.posting, template: withDue(ref.id, result.template, today) });
  });
  router.post('/:id/confirm', settle('posted'));
  router.post('/:id/skip', settle('skipped'));

  // People who can pay and be repaid (for the template form). Names only.
  router.get('/people', handle(async (req, res) => {
    const snap = await db.collection('users').get();
    const people = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => u.role === 'superadmin' || u.approved === 1 || u.approved === true)
      .map((u) => ({ id: u.id, name: u.full_name || u.username || u.id }))
      .sort((a, z) => a.name.localeCompare(z.name));
    res.json({ success: true, people });
  }));

  router.get('/:id/postings', handle(async (req, res) => {
    const snap = await db.collection('recurring_expense_postings').where('templateId', '==', String(req.params.id)).get();
    res.json({ success: true, postings: snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, z) => z.occurrence.localeCompare(a.occurrence)) });
  }));

  return router;
}

module.exports = { manilaToday, clampedDate, nextOccurrence, firstOccurrence, dueOccurrences, normalizeTemplate, postingId, createRecurringExpensesRouter };
