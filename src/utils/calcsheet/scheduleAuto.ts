import type { ScheduleTask } from '../../types/ScheduleTask';
import { addDays, addWorkingDays, nextWorkingDay, prevWorkingDay, workingDaysBetween } from './scheduleDates';

// Topological order of tasks by finish-to-start predecessors. null on a cycle.
export function topoOrder(tasks: ScheduleTask[]): string[] | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const temp = new Set<string>();
  const order: string[] = [];
  let cycle = false;
  const visit = (id: string) => {
    if (cycle || visited.has(id)) return;
    if (temp.has(id)) { cycle = true; return; }
    temp.add(id);
    (byId.get(id)?.predecessors || []).forEach((p) => { if (byId.has(p)) visit(p); });
    temp.delete(id);
    visited.add(id);
    order.push(id);
  };
  tasks.forEach((t) => visit(t.id));
  return cycle ? null : order;
}

// Would adding `predId` as a predecessor of `taskId` create a cycle?
// (i.e. does predId already depend, transitively, on taskId?)
export function wouldCycle(tasks: ScheduleTask[], taskId: string, predId: string): boolean {
  if (taskId === predId) return true;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [predId];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    (byId.get(cur)?.predecessors || []).forEach((p) => stack.push(p));
  }
  return false;
}

// Forward-pass auto-schedule (finish-to-start, no lag):
// a task WITH predecessors starts the next working day after its latest
// predecessor ends, preserving its own working-day duration. Tasks without
// predecessors keep their dates. `wd` = skip weekends.
// Returns a new array (same order); on a dependency cycle, returns input unchanged.
export function autoSchedule(tasks: ScheduleTask[], wd = false): ScheduleTask[] {
  const order = topoOrder(tasks);
  if (!order) return tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dates = new Map(tasks.map((t) => [t.id, { start: t.startDate, end: t.endDate }]));
  for (const id of order) {
    const t = byId.get(id) as ScheduleTask;
    const preds = (t.predecessors || []).filter((p) => byId.has(p));
    if (preds.length === 0) continue;
    let latest = '';
    for (const p of preds) { const pe = (dates.get(p) as { end: string }).end; if (pe > latest) latest = pe; }
    const start = nextWorkingDay(addDays(latest, 1), wd);
    const dur = t.durationDays ?? workingDaysBetween(t.startDate, t.endDate, wd);
    const end = t.isMilestone ? start : addWorkingDays(start, dur, wd);
    dates.set(id, { start, end });
  }
  return tasks.map((t) => {
    const d = dates.get(t.id) as { start: string; end: string };
    return d.start !== t.startDate || d.end !== t.endDate ? { ...t, startDate: d.start, endDate: d.end } : t;
  });
}

// Critical path: tasks with zero total slack — delaying any of them delays the
// project finish. Backward pass over finish-to-start dependencies.
export function criticalPath(tasks: ScheduleTask[], wd = false): Set<string> {
  const critical = new Set<string>();
  if (tasks.length === 0) return critical;
  const order = topoOrder(tasks);
  if (!order) return critical; // cycle — skip
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const succ = new Map<string, string[]>();
  tasks.forEach((t) => (t.predecessors || []).forEach((p) => {
    if (!byId.has(p)) return;
    if (!succ.has(p)) succ.set(p, []);
    (succ.get(p) as string[]).push(t.id);
  }));
  const projectFinish = tasks.reduce((m, t) => (t.endDate > m ? t.endDate : m), tasks[0].endDate);
  const LF = new Map<string, string>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const ss = succ.get(id) || [];
    if (ss.length === 0) {
      LF.set(id, projectFinish);
    } else {
      let lf = '';
      for (const sid of ss) {
        const s = byId.get(sid) as ScheduleTask;
        const cand = prevWorkingDay(addDays(s.startDate, -1), wd);
        if (lf === '' || cand < lf) lf = cand;
      }
      LF.set(id, lf);
    }
  }
  tasks.forEach((t) => {
    const lf = LF.get(t.id);
    if (lf === undefined) return;
    const slack = t.endDate >= lf ? 0 : workingDaysBetween(t.endDate, lf, wd) - 1;
    if (slack <= 0) critical.add(t.id);
  });
  return critical;
}
