import type { Quotation, QuotationTotals } from '../../types/Quotation';

/** The amount shown in Sales and synced as the contract amount for this quotation. */
export function salesAccountedTotal(
  quotation: Pick<Quotation, 'discountPct' | 'vatPct' | 'salesValueScope'>,
  totals: Pick<QuotationTotals, 'servicesSubtotal' | 'grandTotal'>,
): number {
  if (quotation.salesValueScope !== 'services_only') return totals.grandTotal;
  return totals.servicesSubtotal
    * (1 - (quotation.discountPct || 0) / 100)
    * (1 + (quotation.vatPct || 0) / 100);
}
