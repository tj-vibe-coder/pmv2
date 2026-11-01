'use strict';

const express = require('express');

const BLS_COLLECTION = 'billing_statements';
const KINDS = ['BLS', 'SOA'];

/**
 * Next document number for a project: `<ProjectNo>-BLS-NN` (cf. -PB-, -COC, -SR1).
 * Existing numbers are scanned, so imported files with their old numbers don't
 * collide with generated ones.
 */
function nextDocNo(projectNo, existingDocNos) {
  const base = String(projectNo || '').trim();
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-BLS-(\\d+)$`, 'i');
  let max = 0;
  for (const no of existingDocNos) {
    const m = re.exec(String(no || '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${base}-BLS-${String(max + 1).padStart(2, '0')}`;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Gross, withholding tax and net due for a bill's line items (same maths as the PDF). */
function computeBlsTotals(lines, whtPct) {
  const gross = round2((Array.isArray(lines) ? lines : []).reduce(
    (s, l) => s + round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0)), 0));
  const wht = round2(gross * (Number(whtPct) || 0) / 100);
  return { gross, wht, net: round2(gross - wht) };
}

function createBlsRouter(opts) {
  const { db, getCurrentUser } = opts;
  const router = express.Router();

  async function requireAuth(req, res, next) {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
      req.user = user;
      next();
    } catch (err) {
      console.error('[BLS Router] Auth error:', err);
      res.status(500).json({ success: false, error: 'Authentication failed' });
    }
  }

  // Fields a client may write. `file` is the OneDrive copy (imported or archived PDF).
  function pick(payload) {
    const p = payload || {};
    const out = {};
    ['kind', 'docNo', 'date', 'projectId', 'projectNo', 'projectName', 'billedToName', 'billedToAddress',
      'attention', 'subtitle', 'billingLabel', 'terms', 'approverLabel', 'preparedByName', 'preparedByTitle',
      'invoiceId', 'invoiceNo', 'source', 'notes'].forEach((k) => {
      if (p[k] !== undefined) out[k] = typeof p[k] === 'string' ? p[k].trim() : p[k];
    });
    if (Array.isArray(p.refRows)) out.refRows = p.refRows.map((r) => ({ label: String(r.label || ''), value: String(r.value || '') }));
    if (Array.isArray(p.lines)) {
      out.lines = p.lines.map((l) => ({
        description: String(l.description || ''), qty: Number(l.qty) || 0, unit: String(l.unit || ''), unitPrice: Number(l.unitPrice) || 0,
      }));
    }
    if (Array.isArray(p.supportingDocs)) out.supportingDocs = p.supportingDocs.map((d) => String(d)).filter(Boolean);
    if (p.whtPct !== undefined) out.whtPct = Number(p.whtPct) || 0;
    if (p.file !== undefined) {
      out.file = p.file && p.file.onedrive_item_id
        ? {
          onedrive_item_id: String(p.file.onedrive_item_id),
          onedrive_web_url: String(p.file.onedrive_web_url || ''),
          filename: String(p.file.filename || ''),
          uploaded_at: String(p.file.uploaded_at || new Date().toISOString()),
        }
        : null;
    }
    return out;
  }

  function withTotals(rec) {
    if (!Array.isArray(rec.lines)) return rec;
    const t = computeBlsTotals(rec.lines, rec.whtPct);
    return { ...rec, totalGross: t.gross, totalWht: t.wht, totalNet: t.net };
  }

  router.get('/', requireAuth, async (req, res) => {
    try {
      const { projectId } = req.query;
      let query = db.collection(BLS_COLLECTION);
      if (projectId) query = query.where('projectId', '==', String(projectId));
      const snap = await query.get();
      const rows = [];
      snap.forEach((d) => rows.push({ ...d.data(), id: d.id }));
      rows.sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));
      res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
      console.error('[BLS Router] GET / error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch billing statements' });
    }
  });

  router.get('/next-no', requireAuth, async (req, res) => {
    try {
      const projectNo = String(req.query.projectNo || '').trim();
      if (!projectNo) return res.status(400).json({ success: false, error: 'projectNo is required' });
      const snap = await db.collection(BLS_COLLECTION).where('projectNo', '==', projectNo).get();
      const nos = [];
      snap.forEach((d) => nos.push(d.data().docNo));
      res.json({ success: true, docNo: nextDocNo(projectNo, nos) });
    } catch (err) {
      console.error('[BLS Router] GET /next-no error:', err);
      res.status(500).json({ success: false, error: 'Failed to compute next number' });
    }
  });

  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const doc = await db.collection(BLS_COLLECTION).doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, data: withTotals({ ...doc.data(), id: doc.id }) });
    } catch (err) {
      console.error('[BLS Router] GET /:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch billing statement' });
    }
  });

  router.post('/', requireAuth, async (req, res) => {
    try {
      const data = pick(req.body);
      if (!data.projectNo) return res.status(400).json({ success: false, error: 'projectNo is required' });
      if (data.kind && !KINDS.includes(data.kind)) return res.status(400).json({ success: false, error: 'kind must be BLS or SOA' });
      data.kind = data.kind || 'BLS';
      const snap = await db.collection(BLS_COLLECTION).where('projectNo', '==', data.projectNo).get();
      const nos = [];
      snap.forEach((d) => nos.push(d.data().docNo));
      // Never overwrite or duplicate an existing number (imports keep their old numbers).
      if (data.docNo && nos.some((n) => String(n).toLowerCase() === data.docNo.toLowerCase())) {
        return res.status(409).json({ success: false, error: `${data.docNo} already exists` });
      }
      if (!data.docNo) {
        if (data.kind !== 'BLS') return res.status(400).json({ success: false, error: 'docNo is required' });
        data.docNo = nextDocNo(data.projectNo, nos);
      }
      const now = new Date().toISOString();
      const record = {
        ...data,
        date: data.date || now.slice(0, 10),
        source: data.source || 'generated',
        createdAt: now,
        updatedAt: now,
        createdBy: req.user.username || req.user.userId || 'system',
      };
      const ref = await db.collection(BLS_COLLECTION).add(record);
      res.status(201).json({ success: true, id: ref.id, data: withTotals({ ...record, id: ref.id }) });
    } catch (err) {
      console.error('[BLS Router] POST / error:', err);
      res.status(500).json({ success: false, error: 'Failed to create billing statement' });
    }
  });

  router.put('/:id', requireAuth, async (req, res) => {
    try {
      const ref = db.collection(BLS_COLLECTION).doc(req.params.id);
      const existing = await ref.get();
      if (!existing.exists) return res.status(404).json({ success: false, error: 'Not found' });
      const data = pick(req.body);
      delete data.kind;
      delete data.source;
      if (data.docNo && data.docNo.toLowerCase() !== String(existing.data().docNo || '').toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Document number cannot be changed' });
      }
      await ref.update({ ...data, updatedAt: new Date().toISOString() });
      const fresh = await ref.get();
      res.json({ success: true, data: withTotals({ ...fresh.data(), id: fresh.id }) });
    } catch (err) {
      console.error('[BLS Router] PUT /:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update billing statement' });
    }
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const ref = db.collection(BLS_COLLECTION).doc(req.params.id);
      const existing = await ref.get();
      if (!existing.exists) return res.status(404).json({ success: false, error: 'Not found' });
      await ref.delete();
      res.json({ success: true });
    } catch (err) {
      console.error('[BLS Router] DELETE /:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete billing statement' });
    }
  });

  return router;
}

module.exports = { createBlsRouter, nextDocNo, computeBlsTotals };
