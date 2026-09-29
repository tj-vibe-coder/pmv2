import { capacityBySize, conduitFill, fillLimit, maxCables, wireAreaMm2 } from './conduitFill';

describe('PEC Chapter 9 conduit fill', () => {
  it('Table 1 limits: 53% one wire, 31% two, 40% three or more', () => {
    expect(fillLimit(1)).toBe(0.53);
    expect(fillLimit(2)).toBe(0.31);
    expect(fillLimit(3)).toBe(0.4);
    expect(fillLimit(20)).toBe(0.4);
  });

  it('Table 5 areas (THHN 12 AWG ≈ 8.58 mm², THW 12 AWG ≈ 11.68 mm²)', () => {
    expect(wireAreaMm2('12', 'THHN')).toBeCloseTo(8.58, 1);
    expect(wireAreaMm2('12', 'THW')).toBeCloseTo(11.68, 1);
  });

  // Cross-checks against NEC Annex C (Table C.4 IMC / Table C.1 EMT, THHN).
  it('9 × 12 AWG THHN fit 1/2" EMT (Annex C: max 9); 10 need 3/4"', () => {
    expect(conduitFill([{ size: '12', qty: 9 }], 'THHN', 'EMT')?.recommended).toBe('1/2"');
    expect(conduitFill([{ size: '12', qty: 10 }], 'THHN', 'EMT')?.recommended).toBe('3/4"');
  });

  it('12 × 14 AWG THHN fit 1/2" EMT (Annex C: max 12); 13 need 3/4"', () => {
    expect(conduitFill([{ size: '14', qty: 12 }], 'THHN', 'EMT')?.recommended).toBe('1/2"');
    expect(conduitFill([{ size: '14', qty: 13 }], 'THHN', 'EMT')?.recommended).toBe('3/4"');
  });

  it('IMC is roomier than EMT: 10 × 12 AWG THHN fit 1/2" IMC (Annex C: max 10)', () => {
    expect(conduitFill([{ size: '12', qty: 10 }], 'THHN', 'IMC')?.recommended).toBe('1/2"');
    expect(conduitFill([{ size: '12', qty: 11 }], 'THHN', 'IMC')?.recommended).toBe('3/4"');
  });

  it('mixed groups add up: 3 × 4/0 + 1 × 4 AWG ground (THHN, EMT) → 2"', () => {
    const r = conduitFill([{ size: '4/0', qty: 3 }, { size: '4', qty: 1 }], 'THHN', 'EMT');
    expect(r?.conductors).toBe(4);
    expect(r?.recommended).toBe('2"');
  });

  it('two wires use the 31% limit', () => {
    const r = conduitFill([{ size: '6', qty: 2 }], 'THHN', 'EMT');
    expect(r?.limit).toBe(0.31);
    expect(r?.fillOf(r!.recommended!)).toBeLessThanOrEqual(0.31);
  });

  it('too many wires for 2" → no recommendation (split the run)', () => {
    expect(conduitFill([{ size: '350', qty: 6 }], 'THHN', 'IMC')?.recommended).toBeNull();
  });

  it('no wires → nothing to check', () => {
    expect(conduitFill([], 'THHN', 'IMC')).toBeNull();
    expect(conduitFill([{ size: '12', qty: 0 }], 'THHN', 'IMC')).toBeNull();
  });
});

describe('cables per pipe (maxCables) — matches NEC Annex C', () => {
  // Annex C Table C.1 (EMT) and C.4 (IMC), THHN/THWN, trade sizes 1/2"…2".
  it('EMT, THHN', () => {
    expect(capacityBySize('14', 'THHN', 'EMT').map((c) => c.max)).toEqual([12, 22, 35, 61, 84, 138]);
    expect(capacityBySize('12', 'THHN', 'EMT').map((c) => c.max)).toEqual([9, 16, 26, 45, 61, 101]);
    expect(capacityBySize('10', 'THHN', 'EMT').map((c) => c.max)).toEqual([5, 10, 16, 28, 38, 63]);
  });
  it('IMC, THHN', () => {
    expect(capacityBySize('14', 'THHN', 'IMC').map((c) => c.max)).toEqual([14, 24, 39, 68, 91, 149]);
    expect(capacityBySize('12', 'THHN', 'IMC').map((c) => c.max)).toEqual([10, 17, 29, 49, 67, 109]);
  });
  it('Note 7: a remainder of 0.8+ rounds up', () => {
    // 3/4" EMT, 12 AWG THHN: 0.4 × 343 / 8.58 = 15.99 → 16
    expect(maxCables('12', 'THHN', 'EMT', '3/4"')).toBe(16);
  });
  it('the recommendation agrees with the capacity for one cable size', () => {
    expect(conduitFill([{ size: '12', qty: 16 }], 'THHN', 'EMT')?.recommended).toBe('3/4"');
    expect(conduitFill([{ size: '12', qty: 17 }], 'THHN', 'EMT')?.recommended).toBe('1"');
  });
});
