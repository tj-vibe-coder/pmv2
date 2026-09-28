import type { ScheduleTask } from '../../types/ScheduleTask';
import { addDays, addWorkingDays, daysBetween, nextWorkingDay, prevWorkingDay, toDate, workingDaysBetween } from './scheduleDates';
import { linksOf, requiredStart, shiftWorkingDays, type TaskLink } from './scheduleLinks';

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

// Forward-pass auto-schedule, phase-aware, honouring link type + lag
// (FS / SS / FF / SF — see scheduleLinks.requiredStart):
//  • a task WITH predecessors starts as early as all of its links — and its
//    phases' links — allow, keeping its working-day duration;
//  • a PHASE with predecessors moves its subtasks as a block (keeping their
//    spacing) so the phase starts the working day after its predecessors
//    finish — subtasks with their own links follow those links instead;
//  • a phase used as a predecessor finishes when its last subtask does;
//  • tasks without links, and manually scheduled tasks (mode 'manual'), keep
//    their dates, though their successors still follow them.
// `wd` = skip weekends. Returns a new array (same order). If the links plus the
// phase hierarchy form a loop, falls back to plain task-to-task scheduling.
export function autoSchedule(tasks: ScheduleTask[], wd = false): ScheduleTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string, string[]>();
  tasks.forEach((t) => {
    if (t.parentId && byId.has(t.parentId)) {
      if (!children.has(t.parentId)) children.set(t.parentId, []);
      (children.get(t.parentId) as string[]).push(t.id);
    }
  });
  const leavesUnder = (id: string): string[] => {
    const out: string[] = [];
    const stack = [...(children.get(id) || [])];
    while (stack.length) {
      const c = stack.pop() as string;
      const kids = children.get(c);
      if (kids && kids.length) stack.push(...kids); else out.push(c);
    }
    return out;
  };
  const ownPreds = (t: ScheduleTask) => (t.predecessors || []).filter((p) => byId.has(p) && p !== t.id);
  const ancestors = (t: ScheduleTask): ScheduleTask[] => {
    const out: ScheduleTask[] = [];
    const seen = new Set<string>();
    let p = t.parentId && byId.get(t.parentId);
    while (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); p = p.parentId ? byId.get(p.parentId) : undefined; }
    return out;
  };

  // Dependencies: own predecessors (a phase predecessor = all its subtasks),
  // plus the task's own phase (so phase moves happen before its subtasks are read).
  const deps = (id: string): string[] => {
    const t = byId.get(id) as ScheduleTask;
    const out: string[] = [];
    ownPreds(t).forEach((p) => { if (children.has(p)) out.push(...leavesUnder(p)); else out.push(p); });
    if (t.parentId && byId.has(t.parentId)) out.push(t.parentId);
    return out;
  };
  const order = topoOrderBy(tasks.map((t) => t.id), deps);
  if (!order) return autoScheduleFlat(tasks, wd);

  const dates = new Map(tasks.map((t) => [t.id, { start: t.startDate, end: t.endDate }]));
  const endOf = (id: string): string => {
    if (!children.has(id)) return (dates.get(id) as { end: string }).end;
    return leavesUnder(id).reduce((m, l) => { const e = (dates.get(l) as { end: string }).end; return e > m ? e : m; }, '');
  };
  const startOf = (id: string): string => {
    if (!children.has(id)) return (dates.get(id) as { start: string }).start;
    return leavesUnder(id).reduce((m, l) => { const st = (dates.get(l) as { start: string }).start; return m === '' || st < m ? st : m; }, '');
  };
  // Latest start any of `links` allows for a task of `dur` working days.
  const earliestBy = (links: TaskLink[], dur: number, isMs: boolean): string => {
    let req = '';
    links.forEach((l) => {
      const r = requiredStart(l, { start: startOf(l.id), end: endOf(l.id) }, dur, isMs, wd);
      if (r > req) req = r;
    });
    return req;
  };
  const ownLinks = (t: ScheduleTask) => { const ok = new Set(ownPreds(t)); return linksOf(t).filter((l) => ok.has(l.id)); };
  const durOf = (t: ScheduleTask) => t.durationDays ?? workingDaysBetween(t.startDate, t.endDate, wd);
  const place = (t: ScheduleTask, start: string) => {
    dates.set(t.id, { start, end: t.isMilestone ? start : addWorkingDays(start, durOf(t), wd) });
  };

  for (const id of order) {
    const t = byId.get(id) as ScheduleTask;
    if (t.mode === 'manual') continue;
    const own = ownPreds(t);

    if (children.has(id)) {
      // Phase: shift its unlinked, auto-scheduled subtasks as a block.
      if (own.length === 0) continue;
      const movable = leavesUnder(id)
        .map((l) => byId.get(l) as ScheduleTask)
        .filter((l) => l.mode !== 'manual' && ownPreds(l).length === 0);
      if (movable.length === 0) continue;
      const earliest = movable.reduce((m, l) => { const st = (dates.get(l.id) as { start: string }).start; return m === '' || st < m ? st : m; }, '');
      const latestEnd = movable.reduce((m, l) => { const e = (dates.get(l.id) as { end: string }).end; return e > m ? e : m; }, '');
      const required = earliestBy(ownLinks(t), workingDaysBetween(earliest, latestEnd, wd), false);
      const delta = daysBetween(toDate(earliest), toDate(required));
      if (delta === 0) continue;
      movable.forEach((l) => place(l, nextWorkingDay(addDays((dates.get(l.id) as { start: string }).start, delta), wd)));
      continue;
    }

    // Task: own links plus every enclosing phase's links.
    if (own.length === 0) continue;
    const all = [...ownLinks(t)];
    ancestors(t).forEach((a) => all.push(...ownLinks(a)));
    place(t, earliestBy(all, durOf(t), t.isMilestone));
  }
  return tasks.map((t) => {
    const d = dates.get(t.id) as { start: string; end: string };
    return d.start !== t.startDate || d.end !== t.endDate ? { ...t, startDate: d.start, endDate: d.end } : t;
  });
}

// Topological order over an arbitrary dependency function; null on a cycle.
function topoOrderBy(ids: string[], deps: (id: string) => string[]): string[] | null {
  const known = new Set(ids);
  const visited = new Set<string>();
  const temp = new Set<string>();
  const order: string[] = [];
  let cycle = false;
  const visit = (id: string) => {
    if (cycle || visited.has(id)) return;
    if (temp.has(id)) { cycle = true; return; }
    temp.add(id);
    deps(id).forEach((d) => { if (known.has(d)) visit(d); });
    temp.delete(id);
    visited.add(id);
    order.push(id);
  };
  ids.forEach(visit);
  return cycle ? null : order;
}

// Plain task-to-task scheduling (no phase rules) — the fallback when the
// phase hierarchy and links form a loop.
function autoScheduleFlat(tasks: ScheduleTask[], wd: boolean): ScheduleTask[] {
  const order = topoOrder(tasks);
  if (!order) return tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dates = new Map(tasks.map((t) => [t.id, { start: t.startDate, end: t.endDate }]));
  for (const id of order) {
    const t = byId.get(id) as ScheduleTask;
    if (t.mode === 'manual') continue;
    const links = linksOf(t).filter((l) => byId.has(l.id));
    if (links.length === 0) continue;
    const dur = t.durationDays ?? workingDaysBetween(t.startDate, t.endDate, wd);
    let start = '';
    for (const l of links) {
      const pd = dates.get(l.id) as { start: string; end: string };
      const r = requiredStart(l, pd, dur, t.isMilestone, wd);
      if (r > start) start = r;
    }
    dates.set(id, { start, end: t.isMilestone ? start : addWorkingDays(start, dur, wd) });
  }
  return tasks.map((t) => {
    const d = dates.get(t.id) as { start: string; end: string };
    return d.start !== t.startDate || d.end !== t.endDate ? { ...t, startDate: d.start, endDate: d.end } : t;
  });
}

// Total float (working days) per task: how far it can slip before it delays
// the project finish. Backward pass from the project finish through each
// successor's LATEST start / finish, honouring link type + lag.
export function scheduleFloat(tasks: ScheduleTask[], wd = false): Map<string, number> {
  const out = new Map<string, number>();
  if (tasks.length === 0) return out;
  const order = topoOrder(tasks);
  if (!order) return out; // cycle — skip
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const succ = new Map<string, { id: string; link: TaskLink }[]>();
  tasks.forEach((t) => linksOf(t).forEach((l) => {
    if (!byId.has(l.id)) return;
    if (!succ.has(l.id)) succ.set(l.id, []);
    (succ.get(l.id) as { id: string; link: TaskLink }[]).push({ id: t.id, link: l });
  }));
  const spanOf = (t: ScheduleTask) => (t.isMilestone ? 0 : Math.max(1, workingDaysBetween(t.startDate, t.endDate, wd)) - 1);
  const projectFinish = tasks.reduce((m, t) => (t.endDate > m ? t.endDate : m), tasks[0].endDate);
  const LF = new Map<string, string>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const p = byId.get(id) as ScheduleTask;
    const pSpan = spanOf(p);
    let lf = projectFinish;
    for (const { id: sid, link } of succ.get(id) || []) {
      const s = byId.get(sid) as ScheduleTask;
      const sLF = LF.get(sid) ?? projectFinish;
      const sLS = shiftWorkingDays(sLF, -spanOf(s), wd);
      // Latest finish of the predecessor that still lets this link hold.
      const cand = link.type === 'SS' ? shiftWorkingDays(shiftWorkingDays(sLS, -link.lag, wd), pSpan, wd)
        : link.type === 'FF' ? shiftWorkingDays(sLF, -link.lag, wd)
          : link.type === 'SF' ? shiftWorkingDays(shiftWorkingDays(sLF, -link.lag, wd), pSpan, wd)
            : prevWorkingDay(addDays(shiftWorkingDays(sLS, -link.lag, wd), -1), wd);
      if (cand < lf) lf = cand;
    }
    LF.set(id, lf);
    out.set(id, p.endDate >= lf ? 0 : workingDaysBetween(p.endDate, lf, wd) - 1);
  }
  return out;
}

// Critical path: tasks with zero total float — delaying any of them delays
// the project finish.
export function criticalPath(tasks: ScheduleTask[], wd = false): Set<string> {
  const critical = new Set<string>();
  scheduleFloat(tasks, wd).forEach((f, id) => { if (f <= 0) critical.add(id); });
  return critical;
}
