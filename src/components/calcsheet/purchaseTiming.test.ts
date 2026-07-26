import { hasInvalidPurchaseTiming } from './purchaseTiming';

describe('hasInvalidPurchaseTiming', () => {
  it('blocks a quotation purchase date before the effective quotation date', () => {
    expect(hasInvalidPurchaseTiming('2026-01-01', '2025-12-31', [])).toBe(true);
  });

  it('blocks an existing component date when Date Sent moves after it', () => {
    expect(hasInvalidPurchaseTiming('2026-04-01', '2026-05-01', [
      { expectedPurchaseDate: '2026-03-31' },
    ])).toBe(true);
  });

  it('allows blank and same-or-later purchase dates', () => {
    expect(hasInvalidPurchaseTiming('2026-01-01', undefined, [
      {},
      { expectedPurchaseDate: '2026-01-01' },
      { expectedPurchaseDate: '2026-03-01' },
    ])).toBe(false);
  });
});
