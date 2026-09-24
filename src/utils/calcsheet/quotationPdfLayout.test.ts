import { compactLayoutAvailability, quotationPdfScale } from './quotationPdfLayout';

describe('quotation PDF layout', () => {
  it('offers the explicit compact export for a short quotation', () => {
    expect(compactLayoutAvailability(5)).toEqual({ available: true, reason: '' });
  });

  it('keeps the explicit compact export unavailable for long quotations', () => {
    expect(compactLayoutAvailability(7)).toEqual({
      available: false,
      reason: 'Compact one-page export is available for quotations with up to 6 item lines.',
    });
  });

  it('makes the requested compact layout tighter than the automatic short-quote layout', () => {
    expect(quotationPdfScale({ totalRows: 3, termsCharCount: 0, layout: 'compact' }))
      .toBeLessThan(quotationPdfScale({ totalRows: 3, termsCharCount: 0, layout: 'standard' }));
  });
});
