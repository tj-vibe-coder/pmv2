import { liquidationDocNo } from './liquidationDocNo';

describe('liquidationDocNo', () => {
  it('formats current form numbers as LQ-YY-NNN-AAA', () => {
    expect(liquidationDocNo('LQ26-014-RJR')).toBe('LQ-26-014-RJR');
    expect(liquidationDocNo('LQ26-021-KKS')).toBe('LQ-26-021-KKS');
    expect(liquidationDocNo('LQ-26-014-RJR')).toBe('LQ-26-014-RJR');
  });
  it('leaves other schemes alone and marks unnumbered drafts', () => {
    expect(liquidationDocNo('LQ-0005')).toBe('LQ-0005');
    expect(liquidationDocNo('')).toBe('LQ-DRAFT');
  });
});
