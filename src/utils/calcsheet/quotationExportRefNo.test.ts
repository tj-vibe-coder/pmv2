import { quotationExportRefNo, quotationRefNo } from './codes';

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
