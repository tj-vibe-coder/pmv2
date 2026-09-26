import type { ScheduleTask } from '../../types/ScheduleTask';
import { addDays, durationOf, formatLocalDate, isWeekend, toDate, todayStr, workingDaysBetween } from './scheduleDates';
import { leafTasks } from './scheduleTree';
import { leafWeights, projectPercent, type WeightMode } from './scheduleWeights';

// S-Curve of project % completion + manpower loading, computed from the schedule.
//
// % completion uses the schedule's weight system (scheduleWeights) — the same
// one behind the Gantt page's "Overall progress". The planned curve spreads
// each task's weight evenly across its working days (calendar days when the
// working-day calendar is off); the actual curve scores each saved version
// with the same weights, so "actual to date" always equals Overall progress.
//
// Manpower (pax per working day) only drives the loading histogram.

export interface SCurveBucket {
  key: string;
  label: string;       // x-axis label
  start: string;       // YYYY-MM-DD, first day in the bucket
  end: string;         // YYYY-MM-DD, last day in the bucket
  plannedPct: number;  // cumulative planned % complete at the bucket's end
  actualPct?: number;  // % complete from a status snapshot dated in this bucket
  baselinePct?: number; // cumulative % complete the baseline planned by the bucket's end
  manpower: number;    // average pax per working day in the bucket
  peak: number;        // peak pax on any single day in the bucket
  manDays: number;     // internal: headcount summed over the bucket's days (for the average)
}

export interface SCurveSnapshot { date: string; tasks: ScheduleTask[] }

export interface SCurveResult {
  granularity: 'day' | 'week';
  /** How tasks are weighted for % complete (see scheduleWeights). */
  weighting: WeightMode;
  buckets: SCurveBucket[];
  /** Per-day planned % complete (cumulative) and manpower, for precise plotting. */
  daily: { date: string; plannedPct: number; pax: number; baselinePct?: number }[];
  /** Dated actual % complete points (saved versions + today), oldest first. */
  actualPoints: { date: string; pct: number }[];
  /** Set when a baseline was passed: the baseline's planned curve. */
  hasBaseline: boolean;
  baselineToday: number | null;
  hasManpower: boolean;
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

// % complete uses the schedule's weight system (scheduleWeights): manual task
// weights once any are entered, otherwise duration. Snapshots are scored
// with the CURRENT plan's weights so the actual line stays comparable.
export function percentComplete(tasks: ScheduleTask[], reference?: ScheduleTask[]): number | null {
  return projectPercent(tasks, reference);
}

// Planned % earned per day: each task's weight spread over its earning days
// (working days, or calendar days when the working-day calendar is off).
function earningPlan(leaves: ScheduleTask[], weights: Map<string, number>, workingDays: boolean) {
  const earnedOn = new Map<string, number>();
  let total = 0;
  for (const t of leaves) {
    const weight = weights.get(t.id) || 0;
    if (weight <= 0) continue;
    total += weight;
    if (t.isMilestone) {
      earnedOn.set(t.startDate, (earnedOn.get(t.startDate) || 0) + weight);
      continue;
    }
    const earning: string[] = [];
    for (let d = t.startDate; d <= t.endDate; d = addDays(d, 1)) if (!workingDays || !isWeekend(d)) earning.push(d);
    if (earning.length === 0) for (let d = t.startDate; d <= t.endDate; d = addDays(d, 1)) earning.push(d);
    for (const d of earning) earnedOn.set(d, (earnedOn.get(d) || 0) + weight / earning.length);
  }
  return { earnedOn, total };
}

/**
 * `baselineTasks` (optional): the saved baseline. Adds its planned curve
 * (scored with the current plan's weights, like snapshots) and widens the
 * date range to cover it.
 */
export function computeSCurve(tasks: ScheduleTask[], workingDays: boolean, snapshots: SCurveSnapshot[], baselineTasks?: ScheduleTask[]): SCurveResult | null {
  const leaves = leafTasks(tasks);
  if (leaves.length === 0) return null;
  const working = leaves.filter((t) => !t.isMilestone);
  const hasManpower = working.some((t) => (t.manpower || 0) > 0);
  const baseLeaves = baselineTasks ? leafTasks(baselineTasks) : [];

  let start = leaves[0].startDate;
  let end = leaves[0].endDate;
  for (const t of [...leaves, ...baseLeaves]) {
    if (t.startDate < start) start = t.startDate;
    if (t.endDate > end) end = t.endDate;
  }

  const { weights, mode: weighting } = leafWeights(tasks);
  const { earnedOn, total: totalWeight } = earningPlan(leaves, weights, workingDays);
  const base = baseLeaves.length > 0 && baselineTasks
    ? earningPlan(baseLeaves, leafWeights(baselineTasks, tasks).weights, workingDays)
    : null;
  let baseCum = 0;
  let baselineToday: number | null = base ? 0 : null;

  const granularity: 'day' | 'week' = durationOf(start, end) <= 60 ? 'day' : 'week';
  const buckets: SCurveBucket[] = [];
  const daily: SCurveResult['daily'] = [];
  let cum = 0;
  let peak: { pax: number; date: string } | null = null;
  let plannedToday = 0;
  const today = todayStr();

  for (let date = start; date <= end; date = addDays(date, 1)) {
    cum += earnedOn.get(date) || 0;
    const pctNow = totalWeight > 0 ? Math.min(100, (cum / totalWeight) * 100) : 0;
    if (date <= today) plannedToday = pctNow;
    let basePct: number | undefined;
    if (base) {
      baseCum += base.earnedOn.get(date) || 0;
      basePct = base.total > 0 ? Math.min(100, (baseCum / base.total) * 100) : 0;
      if (date <= today) baselineToday = basePct;
    }

    let pax = 0;
    if (!workingDays || !isWeekend(date)) {
      for (const t of working) if (t.startDate <= date && date <= t.endDate) pax += Math.max(0, t.manpower || 0);
    }
    if (!peak || pax > peak.pax) peak = { pax, date };
    daily.push({ date, plannedPct: pctNow, pax, ...(basePct !== undefined ? { baselinePct: basePct } : {}) });

    const d = toDate(date);
    const key = granularity === 'day' ? date : formatLocalDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
    let b = buckets[buckets.length - 1];
    if (!b || b.key !== key) {
      b = { key, label: labelFor(key < start ? start : key), start: date, end: date, plannedPct: 0, manpower: 0, peak: 0, manDays: 0 };
      buckets.push(b);
    }
    b.end = date;
    b.plannedPct = pctNow;
    if (basePct !== undefined) b.baselinePct = basePct;
    b.manDays += pax;
    b.peak = Math.max(b.peak, pax);
  }
  if (today > end) { plannedToday = 100; if (base) baselineToday = 100; }
  for (const b of buckets) {
    b.manpower = granularity === 'day' ? b.manDays : b.manDays / Math.max(1, workingDaysBetween(b.start, b.end, workingDays));
  }

  // Actual points: each saved version is a dated status snapshot, plus today.
  const bucketOf = (date: string) => buckets.find((b) => b.start <= date && date <= b.end)
    || (date > end ? buckets[buckets.length - 1] : null);
  const actualToday = percentComplete(tasks) ?? 0;
  // A version saved earlier today is superseded by the live figure for today.
  const points = [...snapshots.filter((s) => s.date !== today).map((s) => ({ date: s.date, pct: percentComplete(s.tasks, tasks) })), { date: today, pct: actualToday }]
    .filter((p): p is { date: string; pct: number } => p.pct !== null && p.date >= start && p.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const p of points) {
    const b = bucketOf(p.date);
    if (b) b.actualPct = p.pct; // latest snapshot in the bucket wins
  }

  return {
    granularity,
    weighting,
    buckets,
    daily,
    actualPoints: points,
    hasBaseline: !!base,
    baselineToday,
    hasManpower,
    peak: peak && peak.pax > 0 ? peak : null,
    plannedToday,
    actualToday,
    todayKey: today >= start && today <= end ? (bucketOf(today)?.key ?? null) : null,
  };
}
