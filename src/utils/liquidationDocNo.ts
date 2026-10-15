// Printed "Doc No." for a liquidation form: LQ-YY-NNN-AAA, e.g. form LQ26-014-RJR
// prints as LQ-26-014-RJR. Older numbering schemes print unchanged.
export const liquidationDocNo = (formNo: string | null | undefined): string => {
  const value = String(formNo || '').trim();
  if (!value) return 'LQ-DRAFT';
  const m = value.match(/^LQ-?(\d{2})-(\d{3,})-([A-Z0-9]+)$/i);
  return m ? `LQ-${m[1]}-${m[2]}-${m[3].toUpperCase()}` : value;
};
