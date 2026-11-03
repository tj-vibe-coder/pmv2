'use strict';
// Who paid for a cost, and what that payment means for the books.
//
//   treatment: 'company_funded'      IOCT paid (bank, corporate card, petty cash). Nobody is owed.
//              'equity_contribution' An owner paid with their own money as capital. Mirrored
//                                    into `investments` (expense_sync_<id> or a linked row).
//
// A person who wants to be repaid files a liquidation instead; the liquidation
// creates the expense rows and the reimbursement claim, so there is no
// "reimbursable" treatment on a direct expense (RJ, 2026-11-03).
//
// `type` ('corporate_bank' | 'investor_outofpocket') is the original field and is
// kept in step with `treatment` so older readers and records still work. A record
// with no `treatment` is read from its `type`.

const TREATMENTS = ['company_funded', 'equity_contribution'];
const PAID_VIA = ['bank', 'corporate_card', 'petty_cash'];

function treatmentOf(fs) {
  if (!fs || typeof fs !== 'object') return null;
  if (TREATMENTS.includes(fs.treatment)) return fs.treatment;
  return fs.type === 'investor_outofpocket' ? 'equity_contribution' : 'company_funded';
}

function normalizeFundingSource(fs) {
  if (!fs || typeof fs !== 'object') return null;
  const treatment = treatmentOf(fs);
  if (treatment === 'equity_contribution') {
    const out = { type: 'investor_outofpocket', treatment };
    if (typeof fs.investor === 'string' && fs.investor.trim()) {
      out.investor = fs.investor.trim();
      if (typeof fs.linkedInvestmentId === 'string' && fs.linkedInvestmentId.trim()) {
        out.linkedInvestmentId = fs.linkedInvestmentId.trim();
      }
    }
    return out;
  }
  const out = { type: 'corporate_bank', treatment };
  if (PAID_VIA.includes(fs.paidVia)) out.paidVia = fs.paidVia;
  return out;
}

// True when the cost should appear in the investment tracker as an owner's capital.
function isEquityFunding(fs) {
  return treatmentOf(fs) === 'equity_contribution' && typeof fs.investor === 'string' && !!fs.investor.trim();
}

// A row created by a liquidation is already recorded by that liquidation (and its
// reimbursement claim, if any). Marking it as an owner's capital as well counted
// the same money twice (LQ26-001-TJC), so a NEW equity flag on such a row is
// refused. A row that already carries one keeps it (RJ kept TJ's two as capital).
function liquidationEquityError(existingDoc, nextFunding) {
  if (!existingDoc || existingDoc.sourceType !== 'liquidation_sync') return null;
  if (!isEquityFunding(nextFunding) || isEquityFunding(existingDoc.fundingSource)) return null;
  return 'This expense came from a liquidation, which already records who paid and any repayment. It cannot also be marked as an owner\'s capital.';
}

module.exports = { TREATMENTS, PAID_VIA, treatmentOf, normalizeFundingSource, isEquityFunding, liquidationEquityError };
