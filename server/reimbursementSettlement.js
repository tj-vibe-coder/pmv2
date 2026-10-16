'use strict';
const { paymentAuthorization } = require('./liquidationWorkflow');
const { fail } = require('./financeEvidence');
const round2 = n => Math.round(n * 100) / 100;
// Plan every read before writes, so batch/remaining payments cannot race line payments.
// A single strict call may carry ctx.partialAmount (pays part of the balance, claim stays pending)
// and ctx.note / ctx.flaggedRowIds (highlight the lines in question on the claim).
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
      const remaining = Math.max(0, round2((Number(r.amount) || 0) - (Number(r.paidAmount) || 0)));
      if (remaining <= 0) fail('No remaining amount to pay');
      let amount = remaining;
      if (strict && ctx.partialAmount != null && ctx.partialAmount !== '') {
        const part = round2(Number(ctx.partialAmount));
        if (!(part > 0)) fail('Enter an amount greater than zero');
        if (part > remaining + 0.005) fail('Amount is more than the balance still owed');
        if (part < remaining - 0.005) amount = part;
      }
      const isPartial = amount < remaining - 0.005;
      let flagUpdate = null;
      if (strict && (ctx.note !== undefined || ctx.flaggedRowIds !== undefined)) {
        const liqRows = (() => { try { const v = JSON.parse(liq?.exists ? liq.data().rows_json : '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } })();
        const known = new Set(liqRows.map(x => x && x.id).filter(Boolean));
        const ids = Array.isArray(ctx.flaggedRowIds) ? ctx.flaggedRowIds : [];
        if (ids.some(x => !known.has(x))) fail('A highlighted line is not on this liquidation', 400);
        flagUpdate = { holdNote: ctx.note || '', flaggedRowIds: ids };
      }
      let caRef = null;
      if (r.origin === 'ca_excess' && r.caId) { caRef = db.collection('cash_advances').doc(r.caId); if (!(await tx.get(caRef)).exists) fail('Cash advance not found', 404); }
      plans.push({ id, ref, r, liqRef: liq?.exists ? liqRef : null, caRef, amount, remaining, isPartial, flagUpdate, paymentException, payRef: db.collection('reimbursement_payments').doc() });
    }
    for (const p of plans) {
      tx.set(p.payRef, { reimbursementId: p.id, liquidationId: p.r.liquidationId || null, formNo: p.r.formNo || null, employeeId: p.r.employeeId || null,
        employeeName: p.r.employeeName || null, kind: p.isPartial ? 'partial' : 'remaining', rowIds: null, amount: p.amount, note: ctx.note || null, fundingSource: ctx.fs, reference: ctx.reference,
        overrideReason: null, proofRef: ctx.proofRef, paymentException: p.paymentException, paidAt: ctx.now, paidBy: ctx.user.id, createdAt: ctx.now });
      if (p.isPartial) tx.update(p.ref, { paidAmount: round2((Number(p.r.paidAmount) || 0) + p.amount), updatedAt: ctx.now, ...p.flagUpdate });
      else tx.update(p.ref, { status: 'paid', fundingSource: ctx.fs, paidAt: ctx.now, paidBy: ctx.user.id, paidAmount: Number(p.r.amount) || 0, updatedAt: ctx.now, ...p.flagUpdate });
      if (p.liqRef && !p.isPartial) tx.update(p.liqRef, { reimbursement_status: 'reimbursed', reimbursed_at: ctx.now, reimbursed_by: ctx.user.id });
      if (p.caRef) tx.update(p.caRef, { balance_remaining: increment(p.amount), updated_at: ctx.now });
    }
    return { plans, skipped };
  });
}
module.exports = { settleRemaining };
