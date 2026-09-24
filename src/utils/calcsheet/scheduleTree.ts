import type { ScheduleTask } from '../../types/ScheduleTask';
import { durationOf } from './scheduleDates';

export interface TreeRow {
  task: ScheduleTask; // summaries carry rolled-up dates/progress
  depth: number;
  isSummary: boolean;
  hasChildren: boolean;
}

function childrenMap(tasks: ScheduleTask[]): Map<string, ScheduleTask[]> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string, ScheduleTask[]>();
  tasks.forEach((t) => {
    const p = t.parentId;
    if (p && byId.has(p)) {
      if (!children.has(p)) children.set(p, []);
      (children.get(p) as ScheduleTask[]).push(t);
    }
  });
  return children;
}

export function isSummary(tasks: ScheduleTask[], id: string): boolean {
  return childrenMap(tasks).has(id);
}

// A leaf task has no children. Progress/critical/scheduling operate on leaves.
export function leafTasks(tasks: ScheduleTask[]): ScheduleTask[] {
  const parents = new Set<string>();
  tasks.forEach((t) => { if (t.parentId) parents.add(t.parentId); });
  return tasks.filter((t) => !parents.has(t.id));
}

// Roll-up: a summary's start = min child start, end = max child end,
// progress = duration-weighted average of children. Returns a NEW task array
// where summary tasks carry their rolled values (leaves unchanged).
export function rollUp(tasks: ScheduleTask[]): ScheduleTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = childrenMap(tasks);
  const rolled = new Map<string, { startDate: string; endDate: string; progressPct: number }>();

  const compute = (id: string): { startDate: string; endDate: string; progressPct: number; days: number } => {
    const t = byId.get(id) as ScheduleTask;
    const kids = children.get(id);
    if (!kids || kids.length === 0) {
      const days = t.isMilestone ? 1 : durationOf(t.startDate, t.endDate);
      return { startDate: t.startDate, endDate: t.endDate, progressPct: t.progressPct || 0, days };
    }
    let minStart = '';
    let maxEnd = '';
    let wProg = 0;
    let wDays = 0;
    for (const k of kids) {
      const r = compute(k.id);
      if (minStart === '' || r.startDate < minStart) minStart = r.startDate;
      if (maxEnd === '' || r.endDate > maxEnd) maxEnd = r.endDate;
      wProg += r.progressPct * r.days;
      wDays += r.days;
    }
    const progressPct = wDays > 0 ? Math.round(wProg / wDays) : 0;
    rolled.set(id, { startDate: minStart, endDate: maxEnd, progressPct });
    return { startDate: minStart, endDate: maxEnd, progressPct, days: wDays };
  };

  tasks.filter((t) => !t.parentId || !byId.has(t.parentId)).forEach((t) => compute(t.id));

  return tasks.map((t) => {
    const r = rolled.get(t.id);
    return r ? { ...t, startDate: r.startDate, endDate: r.endDate, progressPct: r.progressPct, isMilestone: false } : t;
  });
}

// Flatten the hierarchy into display rows (parent then its children), sorted by
// sibling `order`, skipping the descendants of collapsed summaries.
export function flattenTree(tasks: ScheduleTask[], collapsed: Set<string>): TreeRow[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = childrenMap(tasks);
  const sortSibs = (arr: ScheduleTask[]) => arr.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.startDate.localeCompare(b.startDate));
  const rows: TreeRow[] = [];
  const walk = (t: ScheduleTask, depth: number) => {
    const kids = children.get(t.id) || [];
    const has = kids.length > 0;
    rows.push({ task: t, depth, isSummary: has, hasChildren: has });
    if (has && !collapsed.has(t.id)) sortSibs(kids).forEach((k) => walk(k, depth + 1));
  };
  const roots = tasks.filter((t) => !t.parentId || !byId.has(t.parentId));
  sortSibs(roots).forEach((r) => walk(r, 0));
  return rows;
}

// Descendant ids of a task (for cycle-safe indent and cascade delete).
export function descendantIds(tasks: ScheduleTask[], id: string): Set<string> {
  const children = childrenMap(tasks);
  const out = new Set<string>();
  const stack = [...(children.get(id) || []).map((c) => c.id)];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (out.has(cur)) continue;
    out.add(cur);
    (children.get(cur) || []).forEach((c) => stack.push(c.id));
  }
  return out;
}
