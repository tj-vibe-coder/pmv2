import type { DayType } from '../types/Payroll';

export interface DtrRowStatus {
  dayType: DayType;
  isWeekend: boolean;
  isAbsent: boolean;
  timeIn: string;
  timeOut: string;
}

/**
 * True when a row is an expected working day (a non-weekend REGULAR day the
 * employee is not marked absent for) but has no complete time entry. The
 * employee portal highlights these so missing time-ins are obvious and hours
 * are never assumed. Weekends, rest days, holidays, and absences are exempt.
 */
export function needsTimeInput(row: DtrRowStatus): boolean {
  if (row.isAbsent) return false;
  if (row.isWeekend) return false;
  if (row.dayType !== 'REGULAR') return false;
  return !row.timeIn || !row.timeOut;
}

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
