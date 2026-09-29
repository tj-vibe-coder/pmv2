import { discountPctFromAmount, discountPctFromTargetNet } from './calc';

// discountPct is a percent: the discount applied is subtotal × pct / 100.
const applied = (subtotal: number, pct: number) => subtotal * (pct / 100);

describe('discount by price (₱) → stored discount %', () => {
  it('applies exactly the peso amount typed', () => {
    for (const [subtotal, typed] of [[100000, 5], [100000, 5000], [100000, 12345.67], [1234567.89, 98765.43], [250000000, 1000000]]) {
      expect(applied(subtotal, discountPctFromAmount(subtotal, typed))).toBeCloseTo(typed, 2);
    }
  });

  it('returns a percent, not a fraction', () => {
    expect(discountPctFromAmount(100000, 5000)).toBe(5);
    expect(discountPctFromAmount(200, 50)).toBe(25);
  });

  it('clamps to 0–100% of the subtotal', () => {
    expect(discountPctFromAmount(1000, 5000)).toBe(100);
    expect(discountPctFromAmount(1000, -10)).toBe(0);
    expect(discountPctFromAmount(0, 100)).toBe(0);
  });

  it('target net total lands on the typed net', () => {
    const subtotal = 543210.55;
    for (const net of [532000, 500000.5, 1]) {
      const pct = discountPctFromTargetNet(subtotal, net);
      expect(subtotal - applied(subtotal, pct)).toBeCloseTo(net, 2);
    }
  });
});
