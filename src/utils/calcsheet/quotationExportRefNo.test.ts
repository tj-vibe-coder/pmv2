import { quotationExportRefNo, quotationRefNo } from './codes';
import { computeTotals, effectiveVatPct } from './calc';
import type { Quotation } from '../../types/Quotation';

describe('quotationExportRefNo', () => {
  it('shows a PCS project code as QTN', () => {
    expect(quotationExportRefNo('PCS2610164-MVC-00', 'MVC', '01')).toBe('QTN2610164-MVC-01');
  });
  it('leaves non-PCS and placeholder codes alone', () => {
    expect(quotationExportRefNo('ACTI2512-02', 'ACT', '00')).toBe('ACTI2512-02-ACT-00');
    expect(quotationExportRefNo('', 'MVC', '00')).toBe('DRAFT-MVC-00');
  });
  it('does not change the internal reference', () => {
    expect(quotationRefNo('PCS2610164-MVC-00', 'MVC', '01')).toBe('PCS2610164-MVC-01');
  });
});


describe('effective VAT for Non-VAT quotations', () => {
  it('is 0 whatever vatPct holds', () => {
    expect(effectiveVatPct({ nonVat: true, vatPct: 12 })).toBe(0);
    expect(effectiveVatPct({ vatPct: 12 })).toBe(12);
    expect(effectiveVatPct({})).toBe(0);
  });
  it('totals agree with vatPct 0', () => {
    const q = { formulaVersion: 'current', discountPct: 0, generalReqMarkupPct: 0, productMarkupPct: 0, laborMarkupPct: 0, globalContingencyPct: 0,
      generalReqts: [], components: [], manpower: [], services: [{ id: 's', code: 'C1', description: 'x', amount: 1000 }], vatPct: 12, nonVat: true } as unknown as Quotation;
    expect(computeTotals(q).grandTotal).toBe(computeTotals({ ...q, vatPct: 0 }).grandTotal);
  });
});
