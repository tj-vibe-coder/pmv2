'use strict';
// Awarded-proposal price lock. When a Calcsheet project is won, the quotation
// that was actually awarded is frozen on the project as `awarded`:
//   { quotationId, kind, revision, price, grandTotal, budget, awardedAt, awardedBy, awardedById }
// `price` is the contract amount the Project List must show (Sales scope:
// grand total, or services-only), `budget` the spendable cost basis. Both are
// computed by the client calc engine at award time and never recomputed, so
// later engine changes or quotation edits can't move an awarded price.

const AWARD_LOCK_FIELDS = ['awardedAt', 'awardedBy', 'awardedById'];

const finiteOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Which quotation (and amounts) seed the Project List contract.
 * Awarded quotation wins; otherwise latest IOCT, falling back to latest ACTI.
 * @param {object} project calcsheet project
 * @param {object[]} quotations the project's quotations
 * @param {{ salesAmount: Function, costBasis: Function, newest: Function }} calc
 */
function pickContractSource(project, quotations, calc) {
  const award = project && project.awarded;
  if (award && award.quotationId) {
    const quotation = quotations.find((q) => q.id === award.quotationId);
    if (quotation) {
      const price = finiteOrNull(award.price);
      const budget = finiteOrNull(award.budget);
      return {
        quotation,
        amount: price != null ? price : calc.salesAmount(quotation),
        budget: budget != null ? budget : calc.costBasis(quotation),
        awarded: true,
      };
    }
  }
  const ioct = quotations.filter((q) => q.kind === 'IOCT').sort(calc.newest)[0];
  const acti = quotations.filter((q) => q.kind === 'ACTI').sort(calc.newest)[0];
  const quotation = ioct || acti;
  if (!quotation) return null;
  return {
    quotation,
    amount: calc.salesAmount(quotation),
    budget: calc.costBasis(ioct || quotation),
    awarded: false,
  };
}

/** Validates an award request against the quotation and builds the snapshot. */
function buildAwardSnapshot({ quotation, body, user, now, calc }) {
  const price = finiteOrNull(body && body.price);
  const grandTotal = finiteOrNull(body && body.grandTotal);
  const budget = finiteOrNull(body && body.budget);
  return {
    quotationId: quotation.id,
    kind: quotation.kind || '',
    revision: String(quotation.revision || ''),
    price: price != null ? price : calc.salesAmount(quotation),
    grandTotal: grandTotal != null ? grandTotal : calc.grandTotal(quotation),
    budget: budget != null ? budget : calc.costBasis(quotation),
    awardedAt: now,
    awardedBy: (user && (user.full_name || user.username)) || '',
    awardedById: (user && user.id) || '',
  };
}

/**
 * Should awarding move the Project List budget? Only when nobody has set one,
 * or it still equals the previous award's budget (i.e. it was never hand-edited).
 */
function budgetFollowsAward(currentBudget, previousAward) {
  const cur = Number(currentBudget) || 0;
  if (cur <= 0) return true;
  const prev = previousAward ? Number(previousAward.budget) : NaN;
  return Number.isFinite(prev) && Math.abs(prev - cur) < 0.01;
}

const isAwardLocked = (quotation) => !!(quotation && quotation.awardedAt);

module.exports = {
  AWARD_LOCK_FIELDS,
  pickContractSource,
  buildAwardSnapshot,
  budgetFollowsAward,
  isAwardLocked,
};
