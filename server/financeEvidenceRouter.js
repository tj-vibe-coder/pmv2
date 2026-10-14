'use strict';
const express = require('express');
const { fail, id, text, documentInput, linkId, linkInput, certificateInput, legacyDocument } = require('./financeEvidence');

function createFinanceEvidenceRouter({ db, requireActiveUser }) {
  const router = express.Router();
  const docs = () => db.collection('finance_documents');
  const links = () => db.collection('finance_document_links');
  const invoiceRef = value => db.collection('invoices').doc(id(value));
  const checkWrite = (user, type) => {
    if (!['admin', 'superadmin'].includes(user.role) && !(user.role === 'tax_filer' && type === 'bir2307')) fail('Forbidden', 403);
  };
  const exists = snap => { if (!snap.exists) fail('Record not found', 404); return snap.data(); };
  const revision = (body, data) => { if (!Number.isSafeInteger(body.revision) || body.revision !== data.revision) fail('Evidence changed; reload before saving', 409); };
  const event = (txn, ref, user, before, after, reason = '') => txn.set(ref.collection('history').doc(), {
    actor: user.id, at: new Date().toISOString(), before: before || null, after, reason,
  });
  const handle = fn => async (req, res) => {
    try {
      const user = await requireActiveUser(req, res); if (!user) return;
      if (!['superadmin', 'admin', 'user', 'viewer', 'tax_filer'].includes(user.role)) fail('Forbidden', 403);
      await fn(req, res, user);
    } catch (err) {
      if (!err.status) console.error('Finance evidence error:', err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Evidence request failed' });
    }
  };
  router.get('/invoices/:id/documents', handle(async (req, res) => {
    const inv = exists(await invoiceRef(req.params.id).get());
    const snap = await links().where('invoiceId', '==', req.params.id).limit(201).get();
    if (snap.docs.length > 200) fail('Invoice evidence limit reached; contact an administrator', 409);
    const rows = await Promise.all(snap.docs.map(async s => ({ ...s.data(), id: s.id, document: { ...exists(await docs().doc(s.data().documentId).get()), id: s.data().documentId } })));
    res.json({ links: rows, legacy: legacyDocument(inv) });
  }));
  // One atomic link operation can associate an already-uploaded file with several invoices.
  router.post('/links', handle(async (req, res, user) => {
    const meta = linkInput(req.body); checkWrite(user, meta.type);
    const invoiceIds = req.body.invoiceIds;
    if (!Array.isArray(invoiceIds) || !invoiceIds.length || invoiceIds.length > 50) fail('Supply 1–50 invoice IDs');
    const ids = invoiceIds.map(id);
    if (new Set(ids).size !== ids.length) fail('Duplicate invoice');
    const input = req.body.documentId ? null : documentInput(req.body.document || {});
    const documentId = input ? input.id : id(req.body.documentId);
    const docRef = docs().doc(documentId);
    const result = await db.runTransaction(async txn => {
      const existing = await txn.get(docRef);
      if (!existing.exists && !input) fail('Document not found', 404);
      const targets = [];
      for (const invoiceId of ids) {
        exists(await txn.get(invoiceRef(invoiceId)));
        const ref = links().doc(linkId(invoiceId, documentId, meta.type));
        targets.push({ invoiceId, ref, snap: await txn.get(ref) });
      }
      const now = new Date().toISOString();
      if (!existing.exists) {
        const document = { ...input, revision: 1, uploadedBy: user.id, uploadedAt: now };
        delete document.id;
        txn.set(docRef, document); event(txn, docRef, user, null, document);
      }
      for (const target of targets) {
        const before = target.snap.exists ? target.snap.data() : null;
        if (before && before.active) continue; // safe retry; metadata corrections use PATCH
        const after = { ...meta, invoiceId: target.invoiceId, entityType: 'invoice', documentId, active: true,
          revision: (before?.revision || 0) + 1, linkedBy: user.id, linkedAt: now };
        txn.set(target.ref, after); event(txn, target.ref, user, before, after);
      }
      return { documentId, linkIds: targets.map(t => t.ref.id) };
    });
    res.json(result);
  }));
  router.patch('/links/:id', handle(async (req, res, user) => {
    const ref = links().doc(id(req.params.id));
    await db.runTransaction(async txn => {
      const before = exists(await txn.get(ref)); checkWrite(user, before.type); revision(req.body, before);
      exists(await txn.get(invoiceRef(before.invoiceId)));
      const doc = exists(await txn.get(docs().doc(before.documentId)));
      const reason = text(req.body.reason);
      if (req.body.active === false && !reason) fail('Unlink reason required');
      if (req.body.active === false && before.type === 'bir2307' && doc.certificate?.allocations.some(a => a.invoiceId === before.invoiceId && a.whtCentavos > 0)) fail('Remove the certificate evidence allocation before unlinking');
      const meta = req.body.active === false ? {} : linkInput({ ...req.body, type: before.type });
      const after = { ...before, ...meta, active: req.body.active !== false, revision: before.revision + 1 };
      txn.set(ref, after); event(txn, ref, user, before, after, reason);
    });
    res.json({ success: true });
  }));
  router.put('/documents/:id/certificate', handle(async (req, res, user) => {
    checkWrite(user, 'bir2307');
    const certificate = certificateInput(req.body);
    const ref = docs().doc(id(req.params.id));
    await db.runTransaction(async txn => {
      const before = exists(await txn.get(ref)); revision(req.body, before);
      const targets = [];
      // Keep zero allocations as explicit removal records; never silently discard prior evidence.
      const previous = before.certificate?.allocations || [];
      for (const old of previous) if (!certificate.allocations.some(a => a.invoiceId === old.invoiceId)) fail('Keep previous invoice allocations; use zero to remove their amount');
      let counterparty;
      for (const allocation of certificate.allocations) {
        const inv = exists(await txn.get(invoiceRef(allocation.invoiceId)));
        // Zero allocations retain retired associations for audit only. They do
        // not constrain the current certificate's party or booked-WHT match.
        if (allocation.whtCentavos > 0) {
          const party = (inv.bill_to_name || (inv.bill_to === 'acti' ? 'ACTI' : `project:${inv.project_id}`)).trim().toLowerCase();
          if (counterparty !== undefined && counterparty !== party) fail('Certificate invoices must have the same billed counterparty');
          counterparty = party;
          if (certificate.reviewState === 'matched' && allocation.whtCentavos !== Math.round((Number(inv.wht_amount) || 0) * 100)) fail('Allocated evidence does not match booked invoice WHT');
        }
        const linkRef = links().doc(linkId(allocation.invoiceId, ref.id, 'bir2307'));
        targets.push({ linkRef, allocation, snap: await txn.get(linkRef) });
      }
      if (!targets.some(t => t.snap.exists && t.snap.data().active)) fail('Link the certificate as BIR 2307 before reviewing');
      const after = { ...before, certificate, revision: before.revision + 1 };
      txn.set(ref, after); event(txn, ref, user, before, after, certificate.reviewNote);
      for (const target of targets) {
        const old = target.snap.exists ? target.snap.data() : null;
        const linked = { ...(old || { invoiceId: target.allocation.invoiceId, entityType: 'invoice', documentId: ref.id,
          type: 'bir2307', source: 'certificate evidence allocation', reference: '', documentDate: '', linkedBy: user.id, linkedAt: new Date().toISOString() }),
          active: target.allocation.whtCentavos > 0 || !old ? true : old.active, revision: (old?.revision || 0) + 1 };
        txn.set(target.linkRef, linked); event(txn, target.linkRef, user, old, linked, certificate.reviewNote);
      }
    });
    res.json({ success: true });
  }));
  router.get('/:kind/:id/history', handle(async (req, res) => {
    if (!['links', 'documents'].includes(req.params.kind)) fail('Unsupported history entity');
    const ref = (req.params.kind === 'links' ? links() : docs()).doc(id(req.params.id));
    exists(await ref.get());
    const history = await ref.collection('history').orderBy('at', 'desc').limit(50).get();
    res.json(history.docs.map(s => ({ ...s.data(), id: s.id })));
  }));
  return router;
}
module.exports = { createFinanceEvidenceRouter };
