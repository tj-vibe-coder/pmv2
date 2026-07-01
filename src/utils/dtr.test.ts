import { needsTimeInput, isPaidDate } from './dtr';

describe('needsTimeInput — flag working days with no time entered', () => {
  const base = {
    dayType: 'REGULAR' as const,
    isWeekend: false,
    isAbsent: false,
    timeIn: '',
    timeOut: '',
  };

  test('regular weekday with no time → flagged', () => {
    expect(needsTimeInput(base)).toBe(true);
  });

  test('regular weekday with both times → not flagged', () => {
    expect(needsTimeInput({ ...base, timeIn: '08:00', timeOut: '17:00' })).toBe(false);
  });

  test('regular weekday with only time-in (partial) → flagged', () => {
    expect(needsTimeInput({ ...base, timeIn: '08:00' })).toBe(true);
  });

  test('regular weekday with only time-out (partial) → flagged', () => {
    expect(needsTimeInput({ ...base, timeOut: '17:00' })).toBe(true);
  });

  test('absent day → not flagged', () => {
    expect(needsTimeInput({ ...base, isAbsent: true })).toBe(false);
  });

  test('weekend → not flagged', () => {
    expect(needsTimeInput({ ...base, isWeekend: true })).toBe(false);
  });

  test('holiday day type → not flagged', () => {
    expect(needsTimeInput({ ...base, dayType: 'REGULAR_HOLIDAY' })).toBe(false);
    expect(needsTimeInput({ ...base, dayType: 'REST_DAY' })).toBe(false);
  });
});

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
