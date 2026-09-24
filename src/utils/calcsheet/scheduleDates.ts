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

// ── Working-day calendar (skip weekends) ──────────────────────────────────────
export function isWeekend(s: string): boolean {
  const g = toDate(s).getDay();
  return g === 0 || g === 6;
}

// Snap forward to the next working day (no-op when wd is off or s already works).
export function nextWorkingDay(s: string, wd: boolean): string {
  if (!wd) return s;
  let cur = s;
  while (isWeekend(cur)) cur = addDays(cur, 1);
  return cur;
}

// Snap backward to the previous working day.
export function prevWorkingDay(s: string, wd: boolean): string {
  if (!wd) return s;
  let cur = s;
  while (isWeekend(cur)) cur = addDays(cur, -1);
  return cur;
}

// Date of the `count`-th working day, counting the (snapped) start as day 1.
export function addWorkingDays(startDate: string, count: number, wd: boolean): string {
  const n = Math.max(1, Math.round(count));
  if (!wd) return addDays(startDate, n - 1);
  let cur = nextWorkingDay(startDate, true);
  let remaining = n - 1;
  while (remaining > 0) { cur = addDays(cur, 1); if (!isWeekend(cur)) remaining -= 1; }
  return cur;
}

// Inclusive count of working days between two dates (>= 1).
export function workingDaysBetween(startDate: string, endDate: string, wd: boolean): number {
  if (!wd) return durationOf(startDate, endDate);
  let count = 0;
  let cur = startDate;
  while (cur <= endDate) { if (!isWeekend(cur)) count += 1; cur = addDays(cur, 1); }
  return Math.max(1, count);
}
