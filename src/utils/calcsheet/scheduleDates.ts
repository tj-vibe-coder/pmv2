export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toDate(s: string): Date { return new Date(`${s}T00:00:00`); }
export function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY); }
export function fmt(d: Date): string { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

// Format using LOCAL date parts, not toISOString() (which converts to UTC and
// silently shifts the date back a day in any positive-UTC-offset timezone,
// e.g. Philippines UTC+8 — a task ending "Aug 23" would round-trip as "Aug 22").
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr(): string { return formatLocalDate(new Date()); }

export function addDays(s: string, days: number): string {
  const d = toDate(s);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

// Inclusive day span: a 1-day task starts and ends the same date.
export function durationOf(startDate: string, endDate: string): number {
  return daysBetween(toDate(startDate), toDate(endDate)) + 1;
}
