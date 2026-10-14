'use strict';
const { paymentAuthorization } = require('./liquidationWorkflow');
const { fail } = require('./financeEvidence');
// Plan every read before writes, so batch/remaining payments cannot race line payments.
async function settleRemaining(db, ids, ctx, increment, strict = false) {
  return db.runTransaction(async tx => {
    const plans = []; const skipped = [];
    for (const id of ids) {
      const ref = db.collection('reimbursements').doc(id); const snap = await tx.get(ref);
      if (!snap.exists || snap.data().status !== 'pending') {
        if (strict) fail(snap.exists ? 'Reimbursement is not pending' : 'Reimbursement not found', snap.exists ? 400 : 404);
        skipped.push({ id, reason: snap.exists ? 'not pending' : 'not found' }); continue;
      }
      const r = snap.data();
      const liqRef = r.liquidationId ? db.collection('liquidations').doc(r.liquidationId) : null;
      const liq = liqRef ? await tx.get(liqRef) : null;
      const review = liqRef ? await tx.get(db.collection('liquidation_receipt_reviews').doc(r.liquidationId)) : null;
      const paymentException = paymentAuthorization(liq?.exists ? liq.data() : null, review?.exists ? review.data() : null, ctx.urgentPaymentReason);
      const amount = Math.max(0, Math.round(((Number(r.amount) || 0) - (Number(r.paidAmount) || 0)) * 100) / 100);
      if (amount <= 0) fail('No remaining amount to pay');
      let caRef = null;
      if (r.origin === 'ca_excess' && r.caId) { caRef = db.collection('cash_advances').doc(r.caId); if (!(await tx.get(caRef)).exists) fail('Cash advance not found', 404); }
      plans.push({ id, ref, r, liqRef: liq?.exists ? liqRef : null, caRef, amount, paymentException, payRef: db.collection('reimbursement_payments').doc() });
    }
    for (const p of plans) {
      tx.set(p.payRef, { reimbursementId: p.id, liquidationId: p.r.liquidationId || null, formNo: p.r.formNo || null, employeeId: p.r.employeeId || null,
        employeeName: p.r.employeeName || null, kind: 'remaining', rowIds: null, amount: p.amount, fundingSource: ctx.fs, reference: ctx.reference,
        overrideReason: null, proofRef: ctx.proofRef, paymentException: p.paymentException, paidAt: ctx.now, paidBy: ctx.user.id, createdAt: ctx.now });
      tx.update(p.ref, { status: 'paid', fundingSource: ctx.fs, paidAt: ctx.now, paidBy: ctx.user.id, paidAmount: Number(p.r.amount) || 0, updatedAt: ctx.now });
      if (p.liqRef) tx.update(p.liqRef, { reimbursement_status: 'reimbursed', reimbursed_at: ctx.now, reimbursed_by: ctx.user.id });
      if (p.caRef) tx.update(p.caRef, { balance_remaining: increment(p.amount), updated_at: ctx.now });
    }
    return { plans, skipped };
  });
}
module.exports = { settleRemaining };
