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
