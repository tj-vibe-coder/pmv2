import { salesAccountedTotal } from './salesAccounting';
import type { Quotation, QuotationTotals } from '../../types/Quotation';

const quotation = {
  discountPct: 10,
  vatPct: 12,
} as Pick<Quotation, 'discountPct' | 'vatPct'>;

describe('sales-accounted quotation total', () => {
  it('counts only services while retaining the quotation discount and VAT treatment', () => {
    expect(salesAccountedTotal(
      { ...quotation, salesValueScope: 'services_only' },
      { servicesSubtotal: 50000, grandTotal: 180000 } as Pick<QuotationTotals, 'servicesSubtotal' | 'grandTotal'>,
    )).toBeCloseTo(50400, 2);
  });

  it('keeps the full quotation total as the default sales scope', () => {
    expect(salesAccountedTotal(
      quotation,
      { servicesSubtotal: 50000, grandTotal: 180000 } as Pick<QuotationTotals, 'servicesSubtotal' | 'grandTotal'>,
    )).toBe(180000);
  });
});
