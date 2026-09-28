import type { LinkType, ScheduleTask } from '../../types/ScheduleTask';
import { addDays, isWeekend, nextWorkingDay } from './scheduleDates';

// Task dependencies (MS Project's four link types, with lag). A task keeps
// `predecessors` as the list of predecessor ids; `linkTypes` holds the type
// and lag for any link that isn't a plain finish-to-start.

export type { LinkType };

export const LINK_TYPES: { value: LinkType; label: string; hint: string }[] = [
  { value: 'FS', label: 'Finish-to-Start (FS)', hint: 'starts after the predecessor finishes' },
  { value: 'SS', label: 'Start-to-Start (SS)', hint: 'starts when the predecessor starts' },
  { value: 'FF', label: 'Finish-to-Finish (FF)', hint: 'finishes when the predecessor finishes' },
  { value: 'SF', label: 'Start-to-Finish (SF)', hint: 'finishes when the predecessor starts' },
];

export interface TaskLink { id: string; type: LinkType; lag: number }

export function linksOf(t: ScheduleTask): TaskLink[] {
  return (t.predecessors || []).map((id) => {
    const m = t.linkTypes?.[id];
    return { id, type: m?.type ?? 'FS', lag: Number(m?.lag) || 0 };
  });
}

/** Fields to store for a task's links (the whole linkTypes map is rewritten). */
export function linkFields(links: TaskLink[]): { predecessors: string[]; linkTypes: Record<string, { type: LinkType; lag: number }> } {
  const linkTypes: Record<string, { type: LinkType; lag: number }> = {};
  links.forEach((l) => { if (l.type !== 'FS' || l.lag) linkTypes[l.id] = { type: l.type, lag: l.lag }; });
  return { predecessors: links.map((l) => l.id), linkTypes };
}

/** MS Project notation: "3", "3SS", "3FS+2d", "3FF-1d". */
export function formatLink(num: number | string, l: { type: LinkType; lag: number }): string {
  const lag = l.lag ? `${l.lag > 0 ? '+' : ''}${l.lag}d` : '';
  return `${num}${l.type !== 'FS' || lag ? l.type : ''}${lag}`;
}

/** Parse one token of the Predecessors field ("5", "5SS", "5FS+2d", "5 ff -1 days"). */
export function parseLinkToken(token: string): { n: number; type: LinkType; lag: number } | null {
  const m = /^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+)\s*(?:d|days?)?)?$/i.exec(token.trim());
  if (!m) return null;
  const lag = m[4] ? Number(m[4]) * (m[3] === '-' ? -1 : 1) : 0;
  return { n: Number(m[1]), type: ((m[2] || 'FS').toUpperCase()) as LinkType, lag };
}

/** Move `n` working days (calendar days when `wd` is off); negative = earlier. */
export function shiftWorkingDays(d: string, n: number, wd: boolean): string {
  const steps = Math.round(n);
  if (!wd) return addDays(d, steps);
  let cur = d;
  let left = Math.abs(steps);
  const dir = steps > 0 ? 1 : -1;
  while (left > 0) {
    cur = addDays(cur, dir);
    if (!isWeekend(cur)) left -= 1;
  }
  return cur;
}

/**
 * Earliest start a link allows for a successor lasting `dur` working days
 * (FF / SF constrain the successor's finish, so its start is worked back).
 */
export function requiredStart(link: { type: LinkType; lag: number }, pred: { start: string; end: string }, dur: number, isMilestone: boolean, wd: boolean): string {
  const span = isMilestone ? 0 : Math.max(1, Math.ceil(dur - 1e-9)) - 1;
  switch (link.type) {
    case 'SS':
      return shiftWorkingDays(nextWorkingDay(pred.start, wd), link.lag, wd);
    case 'FF':
      return shiftWorkingDays(nextWorkingDay(shiftWorkingDays(pred.end, link.lag, wd), wd), -span, wd);
    case 'SF':
      return shiftWorkingDays(nextWorkingDay(shiftWorkingDays(pred.start, link.lag, wd), wd), -span, wd);
    default:
      return shiftWorkingDays(nextWorkingDay(addDays(pred.end, 1), wd), link.lag, wd);
  }
}
