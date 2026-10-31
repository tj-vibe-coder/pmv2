/**
 * Work Schedule annexes for the Progress Report: a Gantt chart and an S-Curve
 * drawn from the project's Work Schedule (the same tasks, roll-up and S-Curve
 * maths as the Gantt page), in the report's plain black-and-grey style.
 */
import type { ScheduleTask } from '../../types/ScheduleTask';
import { flattenTree, rollUp } from '../calcsheet/scheduleTree';
import { computeSCurve, type SCurveSnapshot } from '../calcsheet/scheduleSCurve';
import { formatLocalDate } from '../calcsheet/scheduleDates';
import { ReportDoc, PAGE, CONTENT_WIDTH, REPORT_COLORS } from './reportPdfKit';

export interface ReportScheduleRow {
  name: string;
  depth: number;
  isSummary: boolean;
  isMilestone: boolean;
  start: string; // YYYY-MM-DD
  end: string;
  progress: number; // 0–100
}

export interface ReportSchedule {
  rows: ReportScheduleRow[];
  start: string;
  end: string;
  /** Last day shown on the charts: the planned finish, or a later report/status date. */
  chartEnd: string;
  /** Report date (YYYY-MM-DD) — marked on both charts. */
  asOf: string;
  /** Cumulative planned % per day. */
  planned: { date: string; pct: number }[];
  /** Actual % from saved schedule versions (status snapshots) and today. */
  actual: { date: string; pct: number }[];
  plannedAtReport: number;
  actualAtReport: number;
}

/** Build the annex data from the raw schedule. Null when the schedule has no tasks. */
export function prepareReportSchedule(
  tasks: ScheduleTask[], snapshots: SCurveSnapshot[], workingDays: boolean, asOf: string,
): ReportSchedule | null {
  if (tasks.length === 0) return null;
  const rolled = rollUp(tasks);
  const rows = flattenTree(rolled, new Set()).map((r) => ({
    name: r.task.name || '—',
    depth: r.depth,
    isSummary: r.isSummary,
    isMilestone: !!r.task.isMilestone && !r.isSummary,
    start: r.task.startDate,
    end: r.task.endDate,
    progress: Math.max(0, Math.min(100, Number(r.task.progressPct) || 0)),
  }));
  const sc = computeSCurve(tasks, workingDays, snapshots);
  const start = rows.reduce((m, r) => (r.start < m ? r.start : m), rows[0].start);
  const end = rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0].end);
  const planned = sc ? sc.daily.map((d) => ({ date: d.date, pct: d.plannedPct })) : [];
  const actual = sc ? sc.actualPoints.filter((p) => p.date <= asOf) : [];
  // The charts run to the report date / latest status when those fall after the
  // planned finish (a late project) — capped so a stray date can't squash the bars.
  const span = toDay(end) - toDay(start) + 1;
  const lastActual = actual.length ? actual[actual.length - 1].date : end;
  const latest = [asOf, lastActual].filter((d) => toDay(d) <= toDay(end) + span * 0.5);
  const chartEnd = latest.reduce((m, d) => (d > m ? d : m), end);
  const plannedAtReport = asOf < start ? 0 : asOf > end ? 100
    : (planned.filter((p) => p.date <= asOf).pop()?.pct ?? 0);
  const actualAtReport = actual.length ? actual[actual.length - 1].pct : 0;
  return { rows, start, end, chartEnd, asOf, planned, actual, plannedAtReport, actualAtReport };
}

// ── Loading ───────────────────────────────────────────────────────────────
async function getJson<T>(path: string): Promise<T> {
  const token = localStorage.getItem('netpacific_token');
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Work Schedule request failed (${res.status})`);
  return res.json() as Promise<T>;
}

/** The project's Work Schedule tasks (the same store the Gantt page edits). */
export async function fetchScheduleTasks(projectId: string): Promise<ScheduleTask[]> {
  const r = await getJson<{ tasks?: ScheduleTask[] }>(`/api/schedule-tasks?projectId=${encodeURIComponent(projectId)}`);
  return r.tasks || [];
}

/**
 * Load the schedule and its saved versions (the S-Curve's actual-progress
 * points) and prepare the annex data as of `asOf` (YYYY-MM-DD).
 */
export async function loadReportSchedule(projectId: string, asOf: string): Promise<ReportSchedule | null> {
  const tasks = await fetchScheduleTasks(projectId);
  if (tasks.length === 0) return null;
  const versions = await getJson<{ versions?: { id: string; savedAt: string }[] }>(`/api/schedule-versions?projectId=${encodeURIComponent(projectId)}`)
    .then((r) => r.versions || [])
    .catch(() => []);
  const snapshots: SCurveSnapshot[] = (await Promise.all(versions.map(async (v) => {
    try {
      const d = await getJson<{ version?: { tasks?: ScheduleTask[] } }>(`/api/schedule-versions/${encodeURIComponent(v.id)}`);
      return { date: formatLocalDate(new Date(v.savedAt)), tasks: d.version?.tasks || [] };
    } catch {
      return null;
    }
  }))).filter((s): s is SCurveSnapshot => !!s && s.tasks.length > 0);
  let workingDays = true;
  try { workingDays = localStorage.getItem(`gantt-wd-${projectId}`) !== '0'; } catch { /* default: working days */ }
  return prepareReportSchedule(tasks, snapshots, workingDays, asOf);
}

// ── Time scale ────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1) / 86400000;
};
const fromDay = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

/** Scale for [start, end] (inclusive days) onto a width in mm. */
function timeScale(start: string, end: string, width: number) {
  const s = toDay(start);
  const span = Math.max(1, toDay(end) - s + 1);
  return {
    /** x offset (mm) of the START of a day. */
    at: (date: string) => ((toDay(date) - s) / span) * width,
    /** x offset (mm) of the END of a day. */
    after: (date: string) => ((toDay(date) - s + 1) / span) * width,
    span,
  };
}

/** Tick marks: weekly for short schedules, monthly (thinned when crowded) otherwise. */
function timeTicks(start: string, end: string, width: number): { date: string; label: string }[] {
  const scale = timeScale(start, end, width);
  const ticks: { date: string; label: string }[] = [];
  if (scale.span <= 130) {
    let d = toDay(start);
    while (new Date(d * 86400000).getUTCDay() !== 1) d += 1; // Mondays
    const every = (7 / scale.span) * width < 7 ? 2 : 1;
    for (let i = 0; d <= toDay(end); d += 7, i++) {
      const iso = fromDay(d);
      const dt = new Date(d * 86400000);
      if (i % every === 0) ticks.push({ date: iso, label: `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}` });
    }
    return ticks;
  }
  const s = new Date(toDay(start) * 86400000);
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth() + (s.getUTCDate() > 1 ? 1 : 0);
  const months: string[] = [];
  for (;;) {
    if (m > 11) { m = 0; y += 1; }
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    if (iso > end) break;
    months.push(iso);
    m += 1;
  }
  const perMonth = (30.4 / scale.span) * width;
  const every = perMonth >= 9 ? 1 : perMonth >= 4.5 ? 2 : 3;
  months.forEach((iso, i) => {
    if (i % every !== 0) return;
    const [yy, mm] = iso.split('-').map(Number);
    const label = mm === 1 || i === 0 ? `${MONTHS[mm - 1]} ${yy}` : MONTHS[mm - 1];
    ticks.push({ date: iso, label });
  });
  return ticks;
}

const shortDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${d}, ${y}`;
};

// ── Gantt ─────────────────────────────────────────────────────────────────
export function drawGanttAnnex(r: ReportDoc, sched: ReportSchedule, heading: string) {
  r.heading(heading, 30);
  r.paragraph(`Work schedule from ${shortDate(sched.start)} to ${shortDate(sched.end)}. Bars show each task's duration; the dark fill is its progress. The dashed line marks the report date (${shortDate(sched.asOf)}).`, 9, { after: 3 });

  const timelineW = 68;
  const pad = 1.2;
  const scale = timeScale(sched.start, sched.chartEnd, timelineW - pad * 2);
  const ticks = timeTicks(sched.start, sched.chartEnd, timelineW - pad * 2);
  const doc = r.doc;
  const showAsOf = sched.asOf >= sched.start && sched.asOf <= sched.chartEnd;

  r.table({
    head: [['Task', 'Start', 'Finish', '%', '']],
    body: sched.rows.map((row) => [
      {
        content: row.name,
        styles: {
          font: row.isSummary ? 'helvetica' : r.bodyFont,
          fontStyle: row.isSummary ? 'bold' as const : 'normal' as const,
          cellPadding: { top: 1.2, bottom: 1.2, left: 2 + Math.min(row.depth, 4) * 3, right: 1.5 },
        },
      },
      shortDate(row.start),
      row.isMilestone ? '—' : shortDate(row.end),
      `${Math.round(row.progress)}`,
      '',
    ]),
    styles: { fontSize: 7.5, cellPadding: { top: 1.2, bottom: 1.2, left: 1.5, right: 1.5 }, minCellHeight: 6, overflow: 'ellipsize' },
    headStyles: { fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 21 },
      2: { cellWidth: 21 },
      3: { cellWidth: 9, halign: 'right' },
      4: { cellWidth: timelineW },
    },
    didParseCell: (h) => {
      if (h.section === 'head' && h.column.index === 3) h.cell.styles.halign = 'right';
      // Summary rows: whole row bold and shaded like the WBS parent rows.
      if (h.section === 'body' && sched.rows[h.row.index]?.isSummary) {
        h.cell.styles.fillColor = REPORT_COLORS.groupFill;
        if (h.column.index > 0 && h.column.index < 4) { h.cell.styles.font = 'helvetica'; h.cell.styles.fontStyle = 'bold'; }
      }
    },
    didDrawCell: (h) => {
      if (h.column.index !== 4) return;
      const x0 = h.cell.x + pad;
      const { y, height } = h.cell;
      if (h.section === 'head') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...REPORT_COLORS.ink);
        ticks.forEach((t) => {
          const x = x0 + scale.at(t.date);
          if (x < h.cell.x + h.cell.width - 3) doc.text(t.label, x + 0.6, y + height / 2 + 1.1);
        });
        return;
      }
      if (h.section !== 'body') return;
      const row = sched.rows[h.row.index];
      if (!row) return;
      doc.setDrawColor(215, 215, 215);
      doc.setLineWidth(0.1);
      ticks.forEach((t) => { const x = x0 + scale.at(t.date); doc.line(x, y, x, y + height); });
      const cy = y + height / 2;
      const bx = x0 + scale.at(row.start);
      const bw = Math.max(0.8, scale.after(row.end) - scale.at(row.start));
      doc.setDrawColor(...REPORT_COLORS.ink);
      doc.setFillColor(...REPORT_COLORS.ink);
      if (row.isMilestone) {
        const s = 1.4;
        doc.lines([[s, s], [-s, s], [-s, -s], [s, -s]], bx, cy - s, [1, 1], 'F', true);
      } else if (row.isSummary) {
        doc.rect(bx, cy - 0.7, bw, 1.4, 'F');
        doc.lines([[1.2, 0], [-1.2, 1.4]], bx, cy + 0.7, [1, 1], 'F', true);
        doc.lines([[-1.2, 0], [1.2, 1.4]], bx + bw, cy + 0.7, [1, 1], 'F', true);
      } else {
        doc.setFillColor(205, 205, 205);
        doc.setLineWidth(0.15);
        doc.rect(bx, cy - 1.4, bw, 2.8, 'FD');
        if (row.progress > 0) {
          doc.setFillColor(80, 80, 80);
          doc.rect(bx, cy - 1.4, bw * (row.progress / 100), 2.8, 'F');
        }
      }
      if (showAsOf) {
        const ax = x0 + scale.after(sched.asOf);
        doc.setDrawColor(...REPORT_COLORS.ink);
        doc.setLineWidth(0.25);
        doc.setLineDashPattern([0.8, 0.8], 0);
        doc.line(ax, y, ax, y + height);
        doc.setLineDashPattern([], 0);
      }
    },
  }, 6);
}

// ── S-Curve ───────────────────────────────────────────────────────────────
export function drawSCurveAnnex(r: ReportDoc, sched: ReportSchedule, heading: string) {
  const chartH = 105;
  r.heading(heading, chartH + 30);
  const doc = r.doc;
  const labelW = 10;
  const x0 = PAGE.margin + labelW;
  const w = CONTENT_WIDTH - labelW - 2;
  const top = r.y + 4;
  const h = chartH - 14;
  const scale = timeScale(sched.start, sched.chartEnd, w);
  const ticks = timeTicks(sched.start, sched.chartEnd, w);
  const yAt = (pct: number) => top + h - (Math.max(0, Math.min(100, pct)) / 100) * h;
  const xAt = (date: string) => x0 + scale.after(date);

  // Grid + axes
  doc.setLineWidth(0.15);
  r.prose(7.5);
  for (let p = 0; p <= 100; p += 20) {
    doc.setDrawColor(215, 215, 215);
    doc.line(x0, yAt(p), x0 + w, yAt(p));
    doc.text(`${p}%`, x0 - 1.5, yAt(p) + 1, { align: 'right' });
  }
  ticks.forEach((t) => {
    const x = x0 + scale.at(t.date);
    doc.setDrawColor(215, 215, 215);
    doc.line(x, top, x, top + h);
    doc.setDrawColor(...REPORT_COLORS.ink);
    doc.line(x, top + h, x, top + h + 1.2);
    doc.text(t.label, x, top + h + 4.5, { align: 'center' });
  });
  doc.setDrawColor(...REPORT_COLORS.ink);
  doc.setLineWidth(0.3);
  doc.line(x0, top, x0, top + h);
  doc.line(x0, top + h, x0 + w, top + h);

  // Planned (solid) — start from 0% at the schedule start.
  const plannedPts = [{ x: x0, y: yAt(0) }, ...sched.planned.map((p) => ({ x: xAt(p.date), y: yAt(p.pct) }))];
  if (sched.chartEnd > sched.end && sched.planned.length) plannedPts.push({ x: xAt(sched.chartEnd), y: plannedPts[plannedPts.length - 1].y });
  doc.setLineWidth(0.5);
  for (let i = 1; i < plannedPts.length; i++) doc.line(plannedPts[i - 1].x, plannedPts[i - 1].y, plannedPts[i].x, plannedPts[i].y);

  // Actual (dashed + dots)
  if (sched.actual.length > 0) {
    const pts = [{ x: x0, y: yAt(0) }, ...sched.actual.map((p) => ({ x: xAt(p.date), y: yAt(p.pct) }))];
    doc.setLineWidth(0.45);
    doc.setLineDashPattern([1.6, 1], 0);
    for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    doc.setLineDashPattern([], 0);
    doc.setFillColor(...REPORT_COLORS.ink);
    pts.slice(1).forEach((p) => doc.circle(p.x, p.y, 0.8, 'F'));
  }

  // Report date
  if (sched.asOf >= sched.start && sched.asOf <= sched.chartEnd) {
    const ax = xAt(sched.asOf);
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(ax, top, ax, top + h);
    doc.setLineDashPattern([], 0);
    r.prose(7);
    if (ax > x0 + w - 18) doc.text('Report date', ax - 1, top + 3, { align: 'right' });
    else doc.text('Report date', ax + 1, top + 3);
  }

  // Legend
  const ly = top + h + 10;
  doc.setLineWidth(0.5);
  doc.line(x0, ly, x0 + 10, ly);
  r.prose(8);
  doc.text('Planned', x0 + 12, ly + 1);
  doc.setLineWidth(0.45);
  doc.setLineDashPattern([1.6, 1], 0);
  doc.line(x0 + 34, ly, x0 + 44, ly);
  doc.setLineDashPattern([], 0);
  doc.circle(x0 + 39, ly, 0.8, 'F');
  doc.text('Actual', x0 + 46, ly + 1);

  r.y = top + chartH + 2;
  const variance = sched.actualAtReport - sched.plannedAtReport;
  r.details([
    ['Planned to date', `${sched.plannedAtReport.toFixed(2)}%`],
    ['Actual to date', `${sched.actualAtReport.toFixed(2)}%`],
    ['Variance', Math.abs(variance) < 0.005 ? '0.00% (on schedule)' : `${variance > 0 ? '+' : ''}${variance.toFixed(2)}% (${variance > 0 ? 'ahead of' : 'behind'} schedule)`],
    ['Schedule', `${shortDate(sched.start)} to ${shortDate(sched.end)}`],
  ]);
}
