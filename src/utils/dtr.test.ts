import { isPaidDate } from './dtr';

describe('isPaidDate — date falls within a paid payroll period', () => {
  const periods = [
    { periodStart: '2026-06-01', periodEnd: '2026-06-15' },
    { periodStart: '2026-06-16', periodEnd: '2026-06-30' },
  ];

  test('date inside a period → true', () => {
    expect(isPaidDate('2026-06-10', periods)).toBe(true);
  });

  test('date on the start boundary → true', () => {
    expect(isPaidDate('2026-06-01', periods)).toBe(true);
  });

  test('date on the end boundary → true', () => {
    expect(isPaidDate('2026-06-30', periods)).toBe(true);
  });

  test('date outside all periods → false', () => {
    expect(isPaidDate('2026-07-01', periods)).toBe(false);
  });

  test('no paid periods → false', () => {
    expect(isPaidDate('2026-06-10', [])).toBe(false);
  });

  test('period with full ISO timestamps still matches by date', () => {
    expect(isPaidDate('2026-06-10', [
      { periodStart: '2026-06-01T00:00:00.000Z', periodEnd: '2026-06-15T00:00:00.000Z' },
    ])).toBe(true);
  });

  test('malformed period (missing bounds) is ignored', () => {
    expect(isPaidDate('2026-06-10', [{ periodStart: '', periodEnd: '' }])).toBe(false);
  });
});
