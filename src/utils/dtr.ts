export interface PaidPeriod {
  periodStart: string;
  periodEnd: string;
}

/**
 * True when `dateStr` (YYYY-MM-DD) falls within any paid payroll period,
 * inclusive of both boundaries. Period bounds are compared by date only, so
 * full ISO timestamps are tolerated. Periods missing either bound are ignored.
 */
export function isPaidDate(dateStr: string, paidPeriods: PaidPeriod[]): boolean {
  return paidPeriods.some((p) => {
    const start = (p.periodStart || '').slice(0, 10);
    const end = (p.periodEnd || '').slice(0, 10);
    if (!start || !end) return false;
    return dateStr >= start && dateStr <= end;
  });
}
