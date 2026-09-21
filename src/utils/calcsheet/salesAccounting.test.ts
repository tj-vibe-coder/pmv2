import { salesAccountedTotal } from './salesAccounting';
import type { Quotation } from '../../types/Quotation';

const quotation = {
  discountPct: 10,
  vatPct: 12,
  servicesSubtotal: 50000,
} as Pick<Quotation, 'discountPct' | 'vatPct'> & { servicesSubtotal: number };

describe('sales-accounted quotation total', () => {
  it('counts only services while retaining the quotation discount and VAT treatment', () => {
    expect(salesAccountedTotal(quotation, 50000, 'services_only')).toBeCloseTo(50400, 2);
  });

  it('keeps the full quotation total as the default sales scope', () => {
    expect(salesAccountedTotal(quotation, 180000, 'full_quotation')).toBe(180000);
  });
});
