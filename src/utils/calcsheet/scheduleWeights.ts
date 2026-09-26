import type { ScheduleTask } from '../../types/ScheduleTask';
import { durationOf } from './scheduleDates';

// Progress weighting for the work schedule — the single definition of how
// task progress rolls up into phase and project % complete. Mirrored
// server-side in scheduleTasksOverallProgress (server.js) for the progress
// synced to the monitoring project.
//
//   • Manual: once ANY leaf task has a weight, each leaf counts by its own
//     weight (any unit — %, cost, man-hours); leaves left without one count 0.
//     A task's share is weight ÷ total, so weights needn't sum to exactly 100.
//   • Duration (default): with no weights entered, each leaf counts by its
//     duration in calendar days (milestones count 1, half-day tasks 0.5).
//
// Only leaf tasks carry weight; a phase's weight is the sum of its tasks'.

export type WeightMode = 'manual' | 'duration';

function leavesOf(tasks: ScheduleTask[]): ScheduleTask[] {
  const parents = new Set<string>();
  tasks.forEach((t) => { if (t.parentId) parents.add(t.parentId); });
  return tasks.filter((t) => !parents.has(t.id));
}

export function durationWeight(t: ScheduleTask): number {
  if (t.isMilestone) return 1;
  // A half-day task weighs half a day; otherwise the calendar-day span.
  if (t.durationDays != null && t.durationDays > 0 && t.durationDays < 1) return t.durationDays;
  return Math.max(1, durationOf(t.startDate, t.endDate));
}

export function manualWeight(t: ScheduleTask): number {
  return Math.max(0, Number(t.weight) || 0);
}

export function weightMode(tasks: ScheduleTask[]): WeightMode {
  return leavesOf(tasks).some((t) => manualWeight(t) > 0) ? 'manual' : 'duration';
}

/**
 * Weight of every leaf task under the active mode. With `reference` (the
 * current plan), manual weights are looked up there by id, then name — so an
 * older saved snapshot taken before weights were entered is still scored with
 * today's weights.
 */
export function leafWeights(tasks: ScheduleTask[], reference?: ScheduleTask[]): { mode: WeightMode; weights: Map<string, number>; total: number } {
  const ref = reference ?? tasks;
  const mode = weightMode(ref);
  const refById = new Map(ref.map((t) => [t.id, t]));
  const refByName = new Map(ref.map((t) => [t.name, t]));
  const weights = new Map<string, number>();
  let total = 0;
  for (const t of leavesOf(tasks)) {
    const src = reference ? (refById.get(t.id) || refByName.get(t.name) || t) : t;
    const w = mode === 'manual' ? manualWeight(src) : durationWeight(t);
    weights.set(t.id, w);
    total += w;
  }
  return { mode, weights, total };
}

/** Project % complete (0–100), or null when there's nothing to weigh. */
export function projectPercent(tasks: ScheduleTask[], reference?: ScheduleTask[]): number | null {
  const { weights, total } = leafWeights(tasks, reference);
  if (total <= 0) return null;
  let earned = 0;
  for (const t of leavesOf(tasks)) earned += (weights.get(t.id) || 0) * Math.min(100, Math.max(0, t.progressPct || 0));
  return earned / total;
}
