import type { Quotation } from '../../types/Quotation';
import { computeTotals, ioctCostBasis } from './calc';
import { salesAccountedTotal } from './salesAccounting';

export interface AwardFigures {
  /** Contract amount the execution project should carry (Sales scope). */
  price: number;
  grandTotal: number;
  /** Spendable budget: VAT-ex value minus margin; VAT-ex net when margin is unknown. */
  budget: number;
  /** Price − budget, i.e. the gross margin left if the budget is spent exactly. */
  margin: number;
}

/** Price and budget of a quotation as frozen at award time (same chain the server falls back to). */
export function awardFigures(q: Quotation): AwardFigures {
  const t = computeTotals(q);
  const price = salesAccountedTotal(q, t);
  const cost = ioctCostBasis(t);
  const net = t.subtotal - t.discount;
  const budget = cost != null && cost > 0 ? cost : net > 0 ? net : t.grandTotal || 0;
  const vatEx = q.vatPct ? price / (1 + q.vatPct / 100) : price;
  return { price, grandTotal: t.grandTotal, budget, margin: vatEx - budget };
}
