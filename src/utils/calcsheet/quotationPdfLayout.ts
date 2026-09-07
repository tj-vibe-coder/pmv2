export type QuotationPdfLayout = 'standard' | 'compact';

const COMPACT_ITEM_LIMIT = 6;

export function compactLayoutAvailability(totalRows: number): { available: boolean; reason: string } {
  if (totalRows <= COMPACT_ITEM_LIMIT) return { available: true, reason: '' };
  return {
    available: false,
    reason: `Compact one-page export is available for quotations with up to ${COMPACT_ITEM_LIMIT} item lines.`,
  };
}

function automaticScale(totalRows: number, termsCharCount: number): number {
  if (totalRows <= 3 && termsCharCount < 900) return 0.82;
  if (totalRows <= 6 && termsCharCount < 1200) return 0.9;
  if (totalRows <= 10 && termsCharCount < 1500) return 0.96;
  return 1;
}

export function quotationPdfScale({
  totalRows,
  termsCharCount,
  layout,
}: {
  totalRows: number;
  termsCharCount: number;
  layout: QuotationPdfLayout;
}): number {
  const automatic = automaticScale(totalRows, termsCharCount);
  return layout === 'compact' && compactLayoutAvailability(totalRows).available
    ? Math.min(automatic, 0.76)
    : automatic;
}
