'use strict';

// Billing endpoints for agent keys (and staff sessions): record an invoice
// against a project and record a payment received against an invoice, keeping
// the project's billed totals in step. Invoices land in the same `invoices`
// collection the Collections & AR page reads.
//
// - Re-posting the same invoice_no for a project updates that invoice instead of
//   adding a second one, so an agent can safely retry.
// - A payment may carry a `payment_ref`; re-posting the same ref is a no-op.
// - The project's contract_billed / amount_contract_billed_net move by the
//   change in the invoice amount (not recomputed from the invoice list), so
//   billing entered by hand on the project is preserved.

const express = require('express');

const INVOICE_TYPES = {
  'down payment': 'Down payment',
  progress: 'Progress',
  final: 'Final',
  retention: 'Retention',
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

function validDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function invoiceStatus(inv, today) {
  const amount = Number(inv.amount) || 0;
  const collected = Number(inv.amount_collected) || 0;
  if (amount > 0 && collected >= amount) return 'paid';
  if (inv.due_date && inv.due_date < today && collected < amount) return 'overdue';
  if (collected > 0) return 'partial';
  return 'unpaid';
}

function invoiceView(id, inv, today) {
  return {
    id,
    project_id: inv.project_id,
    invoice_no: inv.invoice_no || '',
    type: inv.invoice_type || '',
    pb_number: inv.pb_number || null,
    invoice_date: inv.invoice_date || null,
    due_date: inv.due_date || null,
    amount: Number(inv.amount) || 0,
    amount_collected: Number(inv.amount_collected) || 0,
    collection_date: inv.collection_date || null,
    status: invoiceStatus(inv, today),
    notes: inv.notes || '',
  };
}

function projectBillingPatch(project, delta, now) {
  const contract = Number(project.updated_contract_amount || project.contract_amount) || 0;
  const billed = Math.max(0, money((Number(project.contract_billed) || 0) + delta));
  const net = Math.max(0, money((Number(project.amount_contract_billed_net) || 0) + delta));
  const balance = Math.max(0, money(contract - net));
  return {
    contract_billed: billed,
    amount_contract_billed_net: net,
    contract_billed_gross_percent: contract > 0 ? billed / contract : 0,
    contract_billed_net_percent: contract > 0 ? net / contract : 0,
    total_contract_balance: balance,
    updated_contract_balance_net: balance,
    updated_contract_balance_net_percent: contract > 0 ? balance / contract : 0,
    updated_at: now,
  };
}

function createAgentBillingRouter({ db, getCurrentUser, isActiveUser }) {
  const router = express.Router();

  const requireAgentOrStaff = async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !isActiveUser(user)) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return null;
    }
    if (user.scannerScope || (!user.agentScope && !['superadmin', 'admin', 'user'].includes(user.role))) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return null;
    }
    return user;
  };

  const actorName = (user) => user.name || user.username || String(user.id);
  const bad = (res, error) => res.status(400).json({ success: false, error });

  async function projectInvoices(projectId) {
    const snap = await db.collection('invoices').where('project_id', '==', projectId).get();
    return snap.docs;
  }

  router.get('/api/agent/projects/:id/invoices', async (req, res) => {
    try {
      if (!(await requireAgentOrStaff(req, res))) return;
      const id = String(req.params.id);
      const project = await db.collection('projects').doc(id).get();
      if (!project.exists) return res.status(404).json({ success: false, error: 'Project not found' });
      const today = new Date().toISOString().slice(0, 10);
      const invoices = (await projectInvoices(id))
        .map((d) => invoiceView(d.id, d.data() || {}, today))
        .sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)));
      res.json({ success: true, invoices });
    } catch (err) {
      console.error('[agent] list invoices failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  router.post('/api/agent/projects/:id/billing', async (req, res) => {
    try {
      const user = await requireAgentOrStaff(req, res);
      if (!user) return;
      const id = String(req.params.id);
      const body = req.body || {};
      const today = new Date().toISOString().slice(0, 10);

      const invoiceNo = cleanText(body.invoice_no, 60);
      if (!invoiceNo) return bad(res, 'invoice_no is required');
      const type = INVOICE_TYPES[cleanText(body.type, 30).toLowerCase().replace(/[_-]+/g, ' ')];
      if (!type) return bad(res, 'type must be one of: down payment, progress, final, retention');
      const amount = money(body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return bad(res, 'amount must be a positive number');
      const date = body.date === undefined || body.date === '' ? today : String(body.date);
      if (!validDate(date)) return bad(res, 'date must be YYYY-MM-DD');
      const termsRaw = body.payment_terms_days === undefined ? 30 : Number(body.payment_terms_days);
      if (!Number.isInteger(termsRaw) || termsRaw < 0 || termsRaw > 365) return bad(res, 'payment_terms_days must be 0-365');
      let dueDate = addDays(date, termsRaw);
      if (body.due_date !== undefined && body.due_date !== '') {
        if (!validDate(String(body.due_date))) return bad(res, 'due_date must be YYYY-MM-DD');
        dueDate = String(body.due_date);
      }
      let collected = null;
      if (body.amount_collected !== undefined && body.amount_collected !== '') {
        collected = money(body.amount_collected);
        if (!Number.isFinite(collected) || collected < 0 || collected > amount) return bad(res, 'amount_collected must be between 0 and amount');
      }
      let collectionDate = null;
      if (body.collection_date !== undefined && body.collection_date !== '') {
        if (!validDate(String(body.collection_date))) return bad(res, 'collection_date must be YYYY-MM-DD');
        collectionDate = String(body.collection_date);
      }
      const notes = cleanText(body.notes, 500);
      const pbNumber = cleanText(body.pb_number, 20);

      const projectRef = db.collection('projects').doc(id);
      const projectSnap = await projectRef.get();
      if (!projectSnap.exists) return res.status(404).json({ success: false, error: 'Project not found' });
      const project = projectSnap.data() || {};

      const now = new Date().toISOString();
      const existing = (await projectInvoices(id)).find((d) => String((d.data() || {}).invoice_no || '').toLowerCase() === invoiceNo.toLowerCase());

      let invoiceId;
      let created;
      let delta;
      let record;
      if (existing) {
        const prev = existing.data() || {};
        created = false;
        invoiceId = existing.id;
        delta = amount - (Number(prev.amount) || 0);
        const patch = { invoice_no: invoiceNo, invoice_type: type, amount, invoice_date: date, due_date: dueDate, payment_terms_days: termsRaw, updated_at: now };
        if (pbNumber) patch.pb_number = pbNumber;
        if (notes) patch.notes = notes;
        if (collected !== null) { patch.amount_collected = collected; patch.collection_date = collectionDate || (collected > 0 ? today : null); }
        if (Number(patch.amount_collected ?? prev.amount_collected ?? 0) > amount) return bad(res, 'amount is below what is already collected on this invoice');
        await existing.ref.update(patch);
        record = { ...prev, ...patch };
      } else {
        created = true;
        delta = amount;
        record = {
          project_id: id,
          project_name: project.project_name || '',
          project_no: project.ovp_number || '',
          invoice_no: invoiceNo,
          invoice_type: type,
          invoice_date: date,
          amount,
          payment_terms_days: termsRaw,
          due_date: dueDate,
          amount_collected: collected || 0,
          collection_date: collected ? (collectionDate || today) : null,
          pb_number: pbNumber || null,
          notes,
          posted_via: user.agentScope ? 'agent' : 'user',
          posted_by: actorName(user),
          created_at: now,
          updated_at: now,
        };
        invoiceId = (await db.collection('invoices').add(record)).id;
      }

      let projectTotals = null;
      if (delta !== 0) {
        const patch = projectBillingPatch(project, delta, now);
        await projectRef.update(patch);
        projectTotals = { contract_billed: patch.contract_billed, amount_contract_billed_net: patch.amount_contract_billed_net, updated_contract_balance_net: patch.updated_contract_balance_net };
      }
      res.status(created ? 201 : 200).json({
        success: true,
        created,
        invoice: invoiceView(invoiceId, record, today),
        project: projectTotals || { contract_billed: Number(project.contract_billed) || 0, amount_contract_billed_net: Number(project.amount_contract_billed_net) || 0 },
      });
    } catch (err) {
      console.error('[agent] post billing failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  router.post('/api/agent/projects/:id/payments', async (req, res) => {
    try {
      const user = await requireAgentOrStaff(req, res);
      if (!user) return;
      const id = String(req.params.id);
      const body = req.body || {};
      const today = new Date().toISOString().slice(0, 10);

      const invoiceNo = cleanText(body.invoice_no, 60);
      if (!invoiceNo) return bad(res, 'invoice_no is required');
      const amount = money(body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return bad(res, 'amount must be a positive number');
      const date = body.date === undefined || body.date === '' ? today : String(body.date);
      if (!validDate(date)) return bad(res, 'date must be YYYY-MM-DD');
      const ref = cleanText(body.payment_ref, 80);

      const project = await db.collection('projects').doc(id).get();
      if (!project.exists) return res.status(404).json({ success: false, error: 'Project not found' });
      const doc = (await projectInvoices(id)).find((d) => String((d.data() || {}).invoice_no || '').toLowerCase() === invoiceNo.toLowerCase());
      if (!doc) return res.status(404).json({ success: false, error: 'Invoice not found for this project; post it to /billing first' });

      const inv = doc.data() || {};
      const payments = Array.isArray(inv.payments) ? inv.payments : [];
      if (ref && payments.some((p) => p.ref === ref)) {
        return res.json({ success: true, duplicate: true, invoice: invoiceView(doc.id, inv, today) });
      }
      const collected = money((Number(inv.amount_collected) || 0) + amount);
      if (collected > (Number(inv.amount) || 0) + 0.005) {
        return bad(res, `payment exceeds the unpaid balance (${money((Number(inv.amount) || 0) - (Number(inv.amount_collected) || 0))})`);
      }
      const now = new Date().toISOString();
      const patch = {
        amount_collected: collected,
        collection_date: date,
        payments: [...payments, { ref: ref || null, amount, date, posted_by: actorName(user), posted_at: now }],
        updated_at: now,
      };
      await doc.ref.update(patch);
      res.status(201).json({ success: true, duplicate: false, invoice: invoiceView(doc.id, { ...inv, ...patch }, today) });
    } catch (err) {
      console.error('[agent] post payment failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  return router;
}

module.exports = { INVOICE_TYPES, createAgentBillingRouter };
