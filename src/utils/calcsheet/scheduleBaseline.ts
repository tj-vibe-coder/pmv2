import type { ScheduleTask } from '../../types/ScheduleTask';
import { addDays, isWeekend } from './scheduleDates';
import { rollUp } from './scheduleTree';

// Baseline = one saved schedule version flagged isBaseline (MS Project's
// "Set Baseline"). Its tasks are the original plan the current schedule is
// measured against: thin grey bars under each task, Baseline Finish and Finish
// Variance columns, and a baseline curve on the S-Curve.

export interface ScheduleBaseline {
  versionId: string;
  savedAt: string;
  label: string | null;
  /** Baseline tasks, rolled up so phases carry their own dates. */
  tasks: ScheduleTask[];
}

/**
 * Current task id → its baseline task. Matched by id first, then by name —
 * restoring a version re-creates task ids, so name keeps the link.
 */
export function matchBaseline(current: ScheduleTask[], baseline: ScheduleBaseline | null): Map<string, ScheduleTask> {
  const out = new Map<string, ScheduleTask>();
  if (!baseline) return out;
  const byId = new Map(baseline.tasks.map((t) => [t.id, t]));
  const byName = new Map<string, ScheduleTask>();
  baseline.tasks.forEach((t) => { if (!byName.has(t.name)) byName.set(t.name, t); });
  current.forEach((t) => {
    const b = byId.get(t.id) || byName.get(t.name);
    if (b) out.set(t.id, b);
  });
  return out;
}

export function baselineFromVersion(v: { id: string; savedAt: string; label?: string | null; tasks?: ScheduleTask[] }): ScheduleBaseline {
  return { versionId: v.id, savedAt: v.savedAt, label: v.label ?? null, tasks: rollUp(v.tasks || []) };
}

/**
 * Finish variance in working days (calendar days when `wd` is off):
 * positive = finishing later than the baseline, negative = earlier.
 */
export function finishVariance(currentEnd: string, baselineEnd: string, wd: boolean): number {
  if (currentEnd === baselineEnd) return 0;
  const late = currentEnd > baselineEnd;
  const [a, b] = late ? [baselineEnd, currentEnd] : [currentEnd, baselineEnd];
  let n = 0;
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (!wd || !isWeekend(d)) n += 1;
  return late ? n : -n;
}

export function varianceLabel(days: number): string {
  if (days === 0) return '0 days';
  return `${days > 0 ? '+' : ''}${days} day${Math.abs(days) === 1 ? '' : 's'}`;
}
