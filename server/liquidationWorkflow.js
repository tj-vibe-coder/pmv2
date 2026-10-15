'use strict';
const { receiptReviewHash, reviewStatus } = require('./liquidationReceiptReview');
const { text, fail } = require('./financeEvidence');
const isRj = user => ['admin', 'superadmin'].includes(user?.role) && String(user?.username || '').trim().toUpperCase() === 'RJR';
function currentSubmission(liq, review) {
  return !!(review?.physicalSubmission?.active && review.physicalSubmission.contentHash === receiptReviewHash(liq));
}
function rjReviewed(liq, review) {
  return currentSubmission(liq, review) && reviewStatus(liq, review) === 'reviewed'
    && review.reviewedByUsername === 'RJR' && review.rjConfirmedSubmissionVersion === review.physicalSubmission.version;
}
function workflowState(liq, review, reimbursement) {
  if (!liq) return 'source_review_required';
  if (liq.status !== 'submitted') return 'draft';
  if (liq.pending_revision) return 'pending_edit';
  // RJ checked it but the employee still has to complete or justify something.
  if (review?.needsAction?.active) return 'needs_action';
  if (!currentSubmission(liq, review)) return review?.physicalSubmission?.active ? 'review_required' : 'awaiting_physical';
  if (!rjReviewed(liq, review)) return 'awaiting_rj_review';
  if (reimbursement) return reimbursement.status === 'paid' ? 'closed' : reimbursement.status === 'pending' ? 'awaiting_payment' : 'source_review_required';
  // Preserve explicit historical paid/pending events. Absence of a claim is not
  // evidence of settlement: legacy forms may have incomplete funding metadata.
  if (liq.reimbursement_status === 'reimbursed') return 'closed';
  if (liq.reimbursement_status === 'pending') return 'awaiting_payment';
  if (liq.reimbursement_status != null && liq.reimbursement_status !== '') return 'source_review_required';
  const centavos = value => {
    if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) ? Math.round(n * 100) : null;
  };
  const reimbursable = centavos(liq.reimbursable_amount);
  if (reimbursable === null) return 'source_review_required';
  if (reimbursable > 0) return 'awaiting_payment';
  const total = centavos(liq.total_amount);
  if (total === 0 && (liq.ca_covered_amount == null || centavos(liq.ca_covered_amount) === 0)) return 'closed';
  const covered = centavos(liq.ca_covered_amount);
  if (total !== null && typeof liq.ca_id === 'string' && liq.ca_id.trim() && covered === total) return 'closed';
  return 'source_review_required';
}
function paymentAuthorization(liq, review, urgentReason) {
  if (liq && !liq.pending_revision && liq.status === 'submitted' && rjReviewed(liq, review)) return null;
  const reason = text(urgentReason, 2000);
  if (!reason) fail('Physical receipts and RJ review are required, or record an urgent-payment reason', 409);
  return { reason, beforeRjReview: true };
}
async function reimbursementWorkflow(db, reimbursement) {
  if (!reimbursement.liquidationId) return 'source_review_required';
  const [liq, review] = await Promise.all([db.collection('liquidations').doc(reimbursement.liquidationId).get(), db.collection('liquidation_receipt_reviews').doc(reimbursement.liquidationId).get()]);
  try { return workflowState(liq.exists ? liq.data() : null, review.exists ? review.data() : null, reimbursement); }
  catch (_) { return 'source_review_required'; }
}
module.exports = { isRj, currentSubmission, rjReviewed, workflowState, paymentAuthorization, reimbursementWorkflow };
