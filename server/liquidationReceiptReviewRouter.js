'use strict';
const express = require('express');
const { id, text, date, fail } = require('./financeEvidence');
const { receiptReviewHash, reviewStatus } = require('./liquidationReceiptReview');
const { isRj, currentSubmission, workflowState } = require('./liquidationWorkflow');
function createLiquidationReceiptReviewRouter({ db, requireActiveUser }) {
  const router = express.Router();
  const refs = value => ({ liquidation: db.collection('liquidations').doc(id(value)), review: db.collection('liquidation_receipt_reviews').doc(id(value)) });
  const admin = user => ['admin', 'superadmin'].includes(user.role);
  const read = (user, liq) => { if (!admin(user) && liq.user_id !== user.id) fail('Forbidden', 403); };
  const exists = snap => { if (!snap.exists) fail('Liquidation not found', 404); return snap.data(); };
  const handle = fn => async (req, res) => {
    try {
      const user = await requireActiveUser(req, res); if (!user) return;
      if (user.scannerScope || !['admin', 'superadmin', 'user', 'viewer'].includes(user.role)) fail('Forbidden', 403);
      await fn(req, res, user);
    } catch (err) {
      if (!err.status) console.error('Liquidation receipt review error:', err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Receipt review request failed' });
    }
  };
  router.get('/:id/receipt-review', handle(async (req, res, user) => {
    const ref = refs(req.params.id);
    const result = await db.runTransaction(async tx => {
      const liq = exists(await tx.get(ref.liquidation)); read(user, liq);
      const snap = await tx.get(ref.review); const review = snap.exists ? snap.data() : null;
      const reimb = await tx.get(db.collection('reimbursements').doc(req.params.id));
      return { workflowStatus: workflowState(liq, review, reimb.exists ? reimb.data() : null), canSubmitPhysical: (admin(user) || (user.role === 'user' && liq.user_id === user.id)) && liq.status === 'submitted' && !liq.pending_revision, isRj: isRj(user), review, status: reviewStatus(liq, review), contentHash: receiptReviewHash(liq), revision: review?.revision || 0,
        canRecord: isRj(user) && liq.status === 'submitted' && !liq.pending_revision && currentSubmission(liq, review) };
    });
    res.json(result);
  }));
  router.post('/:id/receipt-review', handle(async (req, res, user) => {
    if (!isRj(user)) fail('RJ review only', 403);
    const body = req.body || {};
    const ref = refs(req.params.id);
    const result = await db.runTransaction(async tx => {
      const liq = exists(await tx.get(ref.liquidation));
      const snap = await tx.get(ref.review); const before = snap.exists ? snap.data() : null;
      const contentHash = receiptReviewHash(liq);
      if (liq.status !== 'submitted' || liq.pending_revision) fail('Review the submitted form after pending edits are resolved', 409);
      if (body.contentHash !== contentHash) fail('Form changed; reload the liquidation and check its receipts again', 409);
      if (!currentSubmission(liq, before)) fail('Record the physical receipt submission for this saved form first', 409);
      const note = text(body.note, 2000);
      const withdrawing = body.action === 'withdraw';
      if (body.action !== 'review' && !withdrawing) fail('Invalid review action');
      const reviewDate = withdrawing ? null : date(body.reviewDate);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (!withdrawing && (!reviewDate || reviewDate > today || reviewDate < before.physicalSubmission.submittedDate || body.confirmed !== true || body.physicalReceiptConfirmed !== true)) fail('Confirm the receipt check and enter a review date no later than today');
      if (withdrawing && (!before?.active || !note)) fail('An active review and withdrawal reason are required');
      // A retry after a lost response is a no-op, never an extra attestation.
      if (!withdrawing && before?.active && before.contentHash === contentHash && before.reviewedBy === user.id && before.reviewDate === reviewDate && before.note === note && before.rjConfirmedSubmissionVersion === before.physicalSubmission.version && before.reviewedByUsername === 'RJR') return { review: before, status: 'reviewed' };
      if (!Number.isSafeInteger(body.revision) || body.revision !== (before?.revision || 0)) fail('Review changed; refresh its status before saving', 409);
      const at = new Date().toISOString();
      const after = withdrawing ? { ...before, active: false, revision: before.revision + 1, withdrawnBy: user.id, withdrawnAt: at, withdrawalReason: note }
        : { physicalSubmission: before.physicalSubmission, rjConfirmedSubmissionVersion: before.physicalSubmission.version, reviewedByUsername: 'RJR', active: true, revision: (before?.revision || 0) + 1, contentHash, fingerprintVersion: 1, reviewedBy: user.id,
          reviewedByName: user.full_name || user.username || user.id, reviewDate, recordedAt: at, note };
      tx.set(ref.review, after);
      tx.set(ref.review.collection('history').doc(), { actor: user.id, actorName: user.full_name || user.username || user.id, at, action: body.action, before, after });
      return { review: after, status: reviewStatus(liq, after) };
    });
    res.json(result);
  }));
  router.post('/:id/physical-receipts', handle(async (req, res, user) => {
    const body = req.body || {}; const ref = refs(req.params.id);
    const result = await db.runTransaction(async tx => {
      const liq = exists(await tx.get(ref.liquidation)); read(user, liq);
      if (!admin(user) && user.role !== 'user') fail('Forbidden', 403);
      const snap = await tx.get(ref.review); const before = snap.exists ? snap.data() : null;
      if (liq.status !== 'submitted' || liq.pending_revision) fail('Resolve form edits before recording physical receipts', 409);
      const contentHash = receiptReviewHash(liq);
      if (body.contentHash !== contentHash) fail('Form changed; reload the liquidation first', 409);
      if (!Number.isSafeInteger(body.revision) || body.revision !== (before?.revision || 0)) fail('Receipt workflow changed; refresh before saving', 409);
      const note = text(body.note, 2000); const returning = body.action === 'return';
      if (body.action !== 'submit' && !returning) fail('Invalid physical receipt action');
      if (returning && (!isRj(user) || !before?.physicalSubmission?.active || !note)) fail('RJ must provide a reason to return submitted receipts', 403);
      const submittedDate = returning ? before.physicalSubmission.submittedDate : date(body.submittedDate);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (!returning && (!submittedDate || submittedDate > today || body.confirmed !== true)) fail('Confirm physical handover to RJ and enter its actual date');
      const at = new Date().toISOString();
      const submission = returning ? { ...before.physicalSubmission, active: false, returnedBy: user.id, returnedByName: user.full_name || user.username || user.id, returnedAt: at, returnReason: note }
        : { active: true, version: (before?.physicalSubmission?.version || 0) + 1, contentHash, submittedDate, submittedBy: user.id, submittedByName: user.full_name || user.username || user.id, recordedAt: at, recipient: 'RJ', note };
      const after = { ...(before || {}), active: false, revision: (before?.revision || 0) + 1, physicalSubmission: submission };
      tx.set(ref.review, after);
      tx.set(ref.review.collection('history').doc(), { actor: user.id, actorName: user.full_name || user.username || user.id, at, action: returning ? 'physical_return' : 'physical_submit', before, after });
      return { success: true };
    }); res.json(result);
  }));
  router.get('/:id/receipt-review/history', handle(async (req, res, user) => {
    const ref = refs(req.params.id); const liq = exists(await ref.liquidation.get()); read(user, liq);
    const snap = await ref.review.collection('history').orderBy('at', 'desc').limit(50).get();
    res.json(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
  }));
  return router;
}
module.exports = { createLiquidationReceiptReviewRouter };
