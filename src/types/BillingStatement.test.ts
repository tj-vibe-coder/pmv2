import { computeBlsTotals, parseDocFilename, pesoInWords } from './BillingStatement';

describe('Billing statement helpers', () => {
  it('computes gross / withholding / net', () => {
    expect(computeBlsTotals([{ description: '', unit: '', qty: 10, unitPrice: 5000 }, { description: '', unit: '', qty: 10, unitPrice: 25000 }], 2))
      .toEqual({ gross: 300000, wht: 6000, net: 294000 });
    expect(computeBlsTotals([{ description: '', unit: 'lot', qty: 1, unitPrice: 216258.41 }], 0).net).toBe(216258.41);
    expect(computeBlsTotals(undefined, 2)).toEqual({ gross: 0, wht: 0, net: 0 });
  });

  it('spells amounts in pesos', () => {
    expect(pesoInWords(294000)).toBe('Two Hundred Ninety-Four Thousand Pesos and 00/100 Only');
    expect(pesoInWords(216258.41)).toBe('Two Hundred Sixteen Thousand Two Hundred Fifty-Eight Pesos and 41/100 Only');
    expect(pesoInWords(1000000)).toBe('One Million Pesos and 00/100 Only');
  });

  it('reads the doc number and kind from an existing filename', () => {
    expect(parseDocFilename('IOCT2606002-BLS-02.pdf')).toEqual({ docNo: 'IOCT2606002-BLS-02', kind: 'BLS', projectNo: 'IOCT2606002' });
    expect(parseDocFilename('IOCT2602001-SOA-001.pdf')?.kind).toBe('SOA');
    expect(parseDocFilename('SOA-2026-004_only.pdf')).toBeNull();
  });
});
