import { toDate } from './scheduleDates';

// Shared MS Project-style timescale helpers for the on-screen Gantt
// (MsProjectGantt) and the PDF export.

export type GanttZoom = 'day' | 'week' | 'month';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "Mon 9/28/26" — MS Project's default date format.
export function mspDate(s: string): string {
  const d = toDate(s);
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${wd} ${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

export function dayAt(start: Date, i: number): Date {
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
}

function weekStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

export interface TimescaleSeg { key: string; label: string; left: number; width: number }

// Group consecutive days sharing a key into one timescale cell.
function buildTier(start: Date, totalDays: number, dayW: number, keyOf: (d: Date) => string, labelOf: (d: Date) => string): TimescaleSeg[] {
  const out: TimescaleSeg[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = dayAt(start, i);
    const key = keyOf(d);
    const last = out[out.length - 1];
    if (last && last.key === key) last.width += dayW;
    else out.push({ key, label: labelOf(d), left: i * dayW, width: dayW });
  }
  return out;
}

export function timescaleTiers(zoom: GanttZoom, start: Date, totalDays: number, dayW: number): { top: TimescaleSeg[]; bottom: TimescaleSeg[] } {
  if (zoom === 'day') {
    return {
      top: buildTier(start, totalDays, dayW,
        (d) => weekStart(d).toDateString(),
        (d) => { const w = weekStart(d); return `${MONTH_SHORT[w.getMonth()]} ${w.getDate()}, '${String(w.getFullYear()).slice(-2)}`; }),
      bottom: buildTier(start, totalDays, dayW, (d) => d.toDateString(), (d) => DOW[d.getDay()]),
    };
  }
  if (zoom === 'week') {
    return {
      top: buildTier(start, totalDays, dayW, (d) => `${d.getFullYear()}-${d.getMonth()}`, (d) => `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`),
      bottom: buildTier(start, totalDays, dayW,
        (d) => weekStart(d).toDateString(),
        (d) => { const w = weekStart(d); return `${w.getMonth() + 1}/${w.getDate()}`; }),
    };
  }
  return {
    top: buildTier(start, totalDays, dayW,
      (d) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3)}`,
      (d) => `Qtr ${Math.floor(d.getMonth() / 3) + 1}, ${d.getFullYear()}`),
    bottom: buildTier(start, totalDays, dayW, (d) => `${d.getFullYear()}-${d.getMonth()}`, (d) => MONTH_SHORT[d.getMonth()]),
  };
}

// Widen [start, end] to whole weeks (or whole months when zoomed out) with a
// little lead-in, the way MS Project frames the chart.
export function snapRange(start: Date, end: Date, zoom: GanttZoom): { start: Date; end: Date } {
  let min = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 2);
  let max = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 2);
  if (zoom === 'month') {
    min = new Date(min.getFullYear(), min.getMonth(), 1);
    max = new Date(max.getFullYear(), max.getMonth() + 1, 0);
  } else {
    min = new Date(min.getFullYear(), min.getMonth(), min.getDate() - min.getDay());
    max = new Date(max.getFullYear(), max.getMonth(), max.getDate() + (6 - max.getDay()));
  }
  return { start: min, end: max };
}
