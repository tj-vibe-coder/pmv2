import type { ScheduleTask } from '../../types/ScheduleTask';
import { addDays, formatLocalDate, isWeekend, toDate, todayStr, workingDaysBetween } from './scheduleDates';
import { leafTasks } from './scheduleTree';

// S-Curve + manpower loading, computed from the schedule.
//
// Weighting: when any task carries manpower, every task is weighted by its
// man-days (manpower × working days) — tasks with no manpower (procurement
// lead time, deliveries) don't count toward progress. With no manpower
// entered anywhere, falls back to duration weighting so the curve still
// works on a bare schedule.

export type SCurveWeighting = 'manpower' | 'duration';

export interface SCurveBucket {
  key: string;
  label: string;       // x-axis label
  start: string;       // YYYY-MM-DD, first day in the bucket
  end: string;         // YYYY-MM-DD, last day in the bucket
  manpower: number;    // average pax per working day in the bucket
  peak: number;        // peak pax on any single day in the bucket
  manDays: number;     // planned man-days (or task-days) in the bucket
  plannedPct: number;  // cumulative planned % at the bucket's end
  actualPct?: number;  // earned % from a status snapshot dated in this bucket
}

export interface SCurveSnapshot { date: string; tasks: ScheduleTask[] }

export interface SCurveResult {
  weighting: SCurveWeighting;
  granularity: 'day' | 'week';
  buckets: SCurveBucket[];
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

export function computeSCurve(tasks: ScheduleTask[], workingDays: boolean, snapshots: SCurveSnapshot[]): SCurveResult | null {
  const leaves = leafTasks(tasks).filter((t) => !t.isMilestone);
  if (leaves.length === 0) return null;

  const weighting: SCurveWeighting = leaves.some((t) => (t.manpower || 0) > 0) ? 'manpower' : 'duration';
  const rateOf = (t: ScheduleTask) => (weighting === 'manpower' ? Math.max(0, t.manpower || 0) : 1);

  let start = leaves[0].startDate;
  let end = leaves[0].endDate;
  for (const t of leaves) {
    if (t.startDate < start) start = t.startDate;
    if (t.endDate > end) end = t.endDate;
  }

  // Daily planned loading.
  const days: { date: string; load: number }[] = [];
  let total = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    let load = 0;
    if (!workingDays || !isWeekend(d)) {
      for (const t of leaves) if (t.startDate <= d && d <= t.endDate) load += rateOf(t);
    }
    total += load;
    days.push({ date: d, load });
  }

  const granularity: 'day' | 'week' = days.length <= 60 ? 'day' : 'week';
  const buckets: SCurveBucket[] = [];
  let cum = 0;
  let peak: { pax: number; date: string } | null = null;
  for (const { date, load } of days) {
    cum += load;
    if (!peak || load > peak.pax) peak = { pax: load, date };
    const d = toDate(date);
    const key = granularity === 'day' ? date : formatLocalDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
    let b = buckets[buckets.length - 1];
    if (!b || b.key !== key) {
      b = { key, label: labelFor(key < start ? start : key), start: date, end: date, manpower: 0, peak: 0, manDays: 0, plannedPct: 0 };
      buckets.push(b);
    }
    b.end = date;
    b.manDays += load;
    b.peak = Math.max(b.peak, load);
    b.plannedPct = total > 0 ? (cum / total) * 100 : 0;
  }
  for (const b of buckets) {
    const wd = workingDaysBetween(b.start, b.end, workingDays);
    b.manpower = granularity === 'day' ? b.manDays : b.manDays / Math.max(1, wd);
  }

  // Earned % of a set of tasks, weighted with the CURRENT plan's rates (by id,
  // then name) so older snapshots taken before manpower was entered still line
  // up with today's weighting.
  const byId = new Map(leaves.map((t) => [t.id, t]));
  const byName = new Map(leaves.map((t) => [t.name, t]));
  const earned = (set: ScheduleTask[]): number | null => {
    let w = 0;
    let e = 0;
    for (const t of leafTasks(set).filter((x) => !x.isMilestone)) {
      const cur = byId.get(t.id) || byName.get(t.name);
      const rate = cur ? rateOf(cur) : (weighting === 'manpower' ? Math.max(0, t.manpower || 0) : 1);
      const weight = rate * workingDaysBetween(t.startDate, t.endDate, workingDays);
      w += weight;
      e += weight * Math.min(100, Math.max(0, t.progressPct || 0));
    }
    return w > 0 ? e / w : null;
  };

  const today = todayStr();
  const bucketOf = (date: string) => buckets.find((b) => b.start <= date && date <= b.end)
    || (date > end ? buckets[buckets.length - 1] : null);

  const points = [...snapshots.map((s) => ({ date: s.date, pct: earned(s.tasks) })), { date: today, pct: earned(tasks) }]
    .filter((p): p is { date: string; pct: number } => p.pct !== null && p.date >= start)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const p of points) {
    if (p.date > today) continue;
    const b = bucketOf(p.date);
    if (b) b.actualPct = p.pct; // latest snapshot in the bucket wins
  }

  const plannedToday = today < start ? 0 : today > end ? 100
    : (() => {
      let c = 0;
      for (const d of days) { if (d.date > today) break; c += d.load; }
      return total > 0 ? (c / total) * 100 : 0;
    })();

  return {
    weighting,
    granularity,
    buckets,
    totalManDays: total,
    peak: peak && peak.pax > 0 ? peak : null,
    plannedToday,
    actualToday: earned(tasks) ?? 0,
    todayKey: today >= start && today <= end ? (bucketOf(today)?.key ?? null) : null,
  };
}
