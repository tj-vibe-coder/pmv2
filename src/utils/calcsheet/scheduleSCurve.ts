import type { ScheduleTask } from '../../types/ScheduleTask';
import { addDays, durationOf, formatLocalDate, isWeekend, toDate, todayStr, workingDaysBetween } from './scheduleDates';
import { leafTasks } from './scheduleTree';

// S-Curve of project % completion + manpower loading, computed from the schedule.
//
// % completion uses the same weighting as the Gantt page's "Overall progress":
// every leaf task is weighted by its duration in calendar days (milestones
// count as 1). The planned curve spreads each task's weight evenly across its
// working days (calendar days when the working-day calendar is off); the
// actual curve applies the same weighting to each saved version's progress,
// so "actual to date" always equals the page's Overall progress.
//
// Manpower (pax per working day) only drives the loading histogram.

export interface SCurveBucket {
  key: string;
  label: string;       // x-axis label
  start: string;       // YYYY-MM-DD, first day in the bucket
  end: string;         // YYYY-MM-DD, last day in the bucket
  plannedPct: number;  // cumulative planned % complete at the bucket's end
  actualPct?: number;  // % complete from a status snapshot dated in this bucket
  manpower: number;    // average pax per working day in the bucket
  peak: number;        // peak pax on any single day in the bucket
  manDays: number;     // planned man-days in the bucket
}

export interface SCurveSnapshot { date: string; tasks: ScheduleTask[] }

export interface SCurveResult {
  granularity: 'day' | 'week';
  buckets: SCurveBucket[];
  hasManpower: boolean;
  totalManDays: number;
  peak: { pax: number; date: string } | null;
  plannedToday: number;
  actualToday: number;
  todayKey: string | null;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function labelFor(d: string): string {
  const x = toDate(d);
  return `${MONTH_SHORT[x.getMonth()]} ${x.getDate()}`;
}

// Same weighting as the page's Overall progress (and the server's roll-up).
function weightOf(t: ScheduleTask): number {
  return t.isMilestone ? 1 : Math.max(1, durationOf(t.startDate, t.endDate));
}

export function percentComplete(tasks: ScheduleTask[]): number | null {
  let w = 0;
  let e = 0;
  for (const t of leafTasks(tasks)) {
    const weight = weightOf(t);
    w += weight;
    e += weight * Math.min(100, Math.max(0, t.progressPct || 0));
  }
  return w > 0 ? e / w : null;
}

export function computeSCurve(tasks: ScheduleTask[], workingDays: boolean, snapshots: SCurveSnapshot[]): SCurveResult | null {
  const leaves = leafTasks(tasks);
  if (leaves.length === 0) return null;
  const working = leaves.filter((t) => !t.isMilestone);
  const hasManpower = working.some((t) => (t.manpower || 0) > 0);

  let start = leaves[0].startDate;
  let end = leaves[0].endDate;
  for (const t of leaves) {
    if (t.startDate < start) start = t.startDate;
    if (t.endDate > end) end = t.endDate;
  }

  // Planned % earned per day: each task's weight spread over its earning days.
  const earnedOn = new Map<string, number>();
  let totalWeight = 0;
  for (const t of leaves) {
    const weight = weightOf(t);
    totalWeight += weight;
    if (t.isMilestone) {
      earnedOn.set(t.startDate, (earnedOn.get(t.startDate) || 0) + weight);
      continue;
    }
    const earning: string[] = [];
    for (let d = t.startDate; d <= t.endDate; d = addDays(d, 1)) if (!workingDays || !isWeekend(d)) earning.push(d);
    if (earning.length === 0) for (let d = t.startDate; d <= t.endDate; d = addDays(d, 1)) earning.push(d);
    for (const d of earning) earnedOn.set(d, (earnedOn.get(d) || 0) + weight / earning.length);
  }

  const granularity: 'day' | 'week' = durationOf(start, end) <= 60 ? 'day' : 'week';
  const buckets: SCurveBucket[] = [];
  let cum = 0;
  let totalManDays = 0;
  let peak: { pax: number; date: string } | null = null;
  let plannedToday = 0;
  const today = todayStr();

  for (let date = start; date <= end; date = addDays(date, 1)) {
    cum += earnedOn.get(date) || 0;
    const pctNow = totalWeight > 0 ? Math.min(100, (cum / totalWeight) * 100) : 0;
    if (date <= today) plannedToday = pctNow;

    let pax = 0;
    if (!workingDays || !isWeekend(date)) {
      for (const t of working) if (t.startDate <= date && date <= t.endDate) pax += Math.max(0, t.manpower || 0);
    }
    totalManDays += pax;
    if (!peak || pax > peak.pax) peak = { pax, date };

    const d = toDate(date);
    const key = granularity === 'day' ? date : formatLocalDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
    let b = buckets[buckets.length - 1];
    if (!b || b.key !== key) {
      b = { key, label: labelFor(key < start ? start : key), start: date, end: date, plannedPct: 0, manpower: 0, peak: 0, manDays: 0 };
      buckets.push(b);
    }
    b.end = date;
    b.plannedPct = pctNow;
    b.manDays += pax;
    b.peak = Math.max(b.peak, pax);
  }
  if (today > end) plannedToday = 100;
  for (const b of buckets) {
    b.manpower = granularity === 'day' ? b.manDays : b.manDays / Math.max(1, workingDaysBetween(b.start, b.end, workingDays));
  }

  // Actual points: each saved version is a dated status snapshot, plus today.
  const bucketOf = (date: string) => buckets.find((b) => b.start <= date && date <= b.end)
    || (date > end ? buckets[buckets.length - 1] : null);
  const actualToday = percentComplete(tasks) ?? 0;
  const points = [...snapshots.map((s) => ({ date: s.date, pct: percentComplete(s.tasks) })), { date: today, pct: actualToday }]
    .filter((p): p is { date: string; pct: number } => p.pct !== null && p.date >= start && p.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const p of points) {
    const b = bucketOf(p.date);
    if (b) b.actualPct = p.pct; // latest snapshot in the bucket wins
  }

  return {
    granularity,
    buckets,
    hasManpower,
    totalManDays,
    peak: peak && peak.pax > 0 ? peak : null,
    plannedToday,
    actualToday,
    todayKey: today >= start && today <= end ? (bucketOf(today)?.key ?? null) : null,
  };
}
