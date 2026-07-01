import { needsTimeInput } from './dtr';

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
