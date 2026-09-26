import type { ReactNode } from 'react';
import { Document, Page, Text, View, Svg, Rect, Polygon, Path, Line, Circle, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { TASK_HIGHLIGHTS, type ScheduleTask } from '../../types/ScheduleTask';
import { leafTasks, type TreeRow } from './scheduleTree';
import { daysBetween, durationOf, toDate, todayStr, workingDaysBetween } from './scheduleDates';
import { dayAt, mspDate, snapRange, timescaleTiers, type GanttZoom, type TimescaleSeg } from './scheduleTimescale';
import { computeSCurve, type SCurveSnapshot } from './scheduleSCurve';
import { leafWeights, projectPercent } from './scheduleWeights';
import { finishVariance, matchBaseline, varianceLabel, type ScheduleBaseline } from './scheduleBaseline';
import { formatLink, linksOf } from './scheduleLinks';

// Gantt + S-Curve PDF, driven by the Export dialog's settings (paper,
// orientation, one-page fit or multi-page, date range, title block, what to
// draw). Everything is laid out in points for the chosen page.

type ScheduleProjectRef = { code?: string; name?: string };

export type PaperSize = 'A4' | 'A3' | 'LETTER' | 'LEGAL';
/** Portrait width × height in points. */
export const PAPER_SIZES: Record<PaperSize, { label: string; w: number; h: number }> = {
  A4: { label: 'A4', w: 595.28, h: 841.89 },
  A3: { label: 'A3', w: 841.89, h: 1190.55 },
  LETTER: { label: 'Letter', w: 612, h: 792 },
  LEGAL: { label: 'Legal', w: 612, h: 1008 },
};

/** Optional table columns (ID and Task Name are always shown). */
export type ExportColumn = 'dur' | 'start' | 'finish' | 'pred' | 'mp' | 'pct' | 'wt';
export const EXPORT_COLUMNS: { key: ExportColumn; label: string }[] = [
  { key: 'dur', label: 'Duration' },
  { key: 'start', label: 'Start' },
  { key: 'finish', label: 'Finish' },
  { key: 'pred', label: 'Predecessors' },
  { key: 'mp', label: 'Manpower' },
  { key: 'pct', label: '% Complete' },
  { key: 'wt', label: 'Weight' },
];

export interface ScheduleExportSettings {
  // Layout
  paper: PaperSize;
  orientation: 'landscape' | 'portrait';
  /** 'fit' = everything on one page; 'paged' = readable rows over as many pages as needed. */
  layout: 'fit' | 'paged';
  range: 'project' | 'custom';
  rangeStart: string;
  rangeEnd: string;
  /** With a date range: print only tasks active in it (a look-ahead). */
  rangeTasksOnly: boolean;
  includeSCurve: boolean;
  includeManpower: boolean;
  // Document
  title: string;
  projectNumber: string;
  projectTitle: string;
  /** Shown after the project line in the page header (and in the file name) when set. */
  revision: string;
  // Chart
  columns: Record<ExportColumn, boolean>;
  showDependencies: boolean;
  showBaseline: boolean;
  showProgress: boolean;
  showCritical: boolean;
  showTaskLabels: boolean;
  showManpower: boolean;
  showToday: boolean;
  showWeekends: boolean;
}

export function defaultExportSettings(project: ScheduleProjectRef): ScheduleExportSettings {
  return {
    paper: 'A3',
    orientation: 'landscape',
    layout: 'fit',
    range: 'project',
    rangeStart: '',
    rangeEnd: '',
    rangeTasksOnly: true,
    includeSCurve: true,
    includeManpower: true,
    title: 'Gantt Chart',
    projectNumber: project.code || '',
    projectTitle: project.name || '',
    revision: '',
    columns: { dur: true, start: true, finish: true, pred: true, mp: true, pct: true, wt: true },
    showDependencies: true,
    showBaseline: true,
    showProgress: true,
    showCritical: false,
    showTaskLabels: true,
    showManpower: true,
    showToday: true,
    showWeekends: true,
  };
}

/** Data the PDF draws from — independent of the display settings. */
export interface ScheduleExportData {
  workingDays: boolean;
  /** Critical tasks (drawn only when settings.showCritical). */
  criticalIds?: Set<string>;
  /** Saved versions as dated status snapshots (S-Curve actual points). */
  snapshots?: SCurveSnapshot[];
  baseline?: ScheduleBaseline | null;
}

const MARGIN = 28;
const HEADER_H = 46;
const LEGEND_H = 22;
const TIER_H = 13;
const MAX_ROW_H = 16;
const PAGED_ROW_H = 14;
const SC_GUTTER = 34;         // S-Curve y-axis labels
const SC_PAD = 10;
const SC_LEGEND_H = 30;

const C = {
  text: '#262626',
  sub: '#595959',
  border: '#D4D4D4',
  headerBg: '#F3F3F3',
  primary: '#2c5aa0',
  bar: '#8CB1E3',
  barEdge: '#5F8FD1',
  progress: '#1F3F77',
  critBar: '#F4A3A3',
  critEdge: '#D65C5C',
  critProgress: '#9C0006',
  manualBar: '#8FD3CB',
  manualEdge: '#2E9C8F',
  manualProgress: '#14665C',
  summary: '#262626',
  link: '#4472C4',
  critLink: '#C00000',
  nonWorking: '#EFEFEF',
  today: '#E07B00',
  planned: '#2c5aa0',
  actual: '#eb6834',
  manpower: '#5F8FD1',
  baseline: '#A6A6A6',
  baselineCurve: '#8C8C8C',
  late: '#C00000',
  early: '#2E7D32',
  grid: '#E6E6E6',
  frame: '#9E9E9E',
};

interface Col { key: string; label: string; w: number; align?: 'left' | 'right' | 'center' }
const BASE_COLS: Col[] = [
  { key: 'id', label: 'ID', w: 22, align: 'right' },
  { key: 'name', label: 'Task Name', w: 220 },
  { key: 'dur', label: 'Duration', w: 50 },
  { key: 'start', label: 'Start', w: 58 },
  { key: 'finish', label: 'Finish', w: 58 },
  { key: 'bfin', label: 'Baseline Fin.', w: 58 },
  { key: 'fvar', label: 'Var.', w: 40, align: 'right' },
  { key: 'pred', label: 'Predecessors', w: 50 },
  { key: 'mp', label: 'Manpower', w: 44, align: 'right' },
  { key: 'pct', label: '% Comp.', w: 36, align: 'right' },
  { key: 'wt', label: 'Weight', w: 38, align: 'right' },
];
const MIN_NAME_W = 110;
// Most of the page width the task table may take; the rest is the timeline.
const TABLE_SHARE = { landscape: 0.6, portrait: 0.62 } as const;
// When the table won't fit its share of the page, drop columns in this order.
const DROP_ORDER = ['wt', 'mp', 'pred', 'dur', 'bfin', 'pct', 'start'];

/** Pick the table columns for the page: user's choice, then shrink / drop to fit. */
function chooseColumns(s: ScheduleExportSettings, hasBaseline: boolean, maxW: number): { cols: Col[]; dropped: string[] } {
  let cols = BASE_COLS.filter((c) => {
    if (c.key === 'id' || c.key === 'name') return true;
    if (c.key === 'bfin' || c.key === 'fvar') return hasBaseline;
    return s.columns[c.key as ExportColumn];
  }).map((c) => ({ ...c }));
  const width = () => cols.reduce((sum, c) => sum + c.w, 0);
  const name = () => cols.find((c) => c.key === 'name') as Col;
  if (width() > maxW) name().w = Math.max(MIN_NAME_W, name().w - (width() - maxW));
  const dropped: string[] = [];
  for (const key of DROP_ORDER) {
    if (width() <= maxW) break;
    if (cols.some((c) => c.key === key)) {
      cols = cols.filter((c) => c.key !== key);
      dropped.push(key);
    }
  }
  return { cols, dropped };
}

// Helvetica averages ~0.52em per character; trim with an ellipsis so a long
// value can't wrap and push the row taller than the page allows.
// Bold runs ~15% wider — pass em = 0.6 for Helvetica-Bold.
function fit(text: string, width: number, fontSize: number, em = 0.52): string {
  const max = Math.max(1, Math.floor((width - 5) / (fontSize * em)));
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}
const textW = (text: string, fontSize: number) => text.length * fontSize * 0.52;

function spanOf(tasks: ScheduleTask[]): { start: Date; end: Date } | null {
  if (tasks.length === 0) return null;
  let start = toDate(tasks[0].startDate);
  let end = toDate(tasks[0].endDate);
  for (const t of tasks) {
    if (toDate(t.startDate) < start) start = toDate(t.startDate);
    if (toDate(t.endDate) > end) end = toDate(t.endDate);
  }
  return { start, end };
}

function ScheduleDoc({ project, rows, data, s }: { project: ScheduleProjectRef; rows: TreeRow[]; data: ScheduleExportData; s: ScheduleExportSettings }) {
  const paper = PAPER_SIZES[s.paper];
  const PAGE_W = s.orientation === 'landscape' ? paper.h : paper.w;
  const PAGE_H = s.orientation === 'landscape' ? paper.w : paper.h;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const narrow = CONTENT_W < 760;

  const crit = s.showCritical ? (data.criticalIds ?? new Set<string>()) : new Set<string>();
  const allTasks = rows.map((r) => r.task);
  const leaves = rows.filter((r) => !r.isSummary).map((r) => r.task);
  const bmap = s.showBaseline ? matchBaseline(allTasks, data.baseline ?? null) : new Map<string, ScheduleTask>();
  const hasBaseline = bmap.size > 0;
  const baseLeaves = hasBaseline && data.baseline ? leafTasks(data.baseline.tasks) : [];

  const { cols } = chooseColumns(s, hasBaseline, CONTENT_W * TABLE_SHARE[s.orientation]);
  const TABLE_W = cols.reduce((sum, c) => sum + c.w, 0);
  const CHART_W = CONTENT_W - TABLE_W;

  // Whole-project span (incl. baseline) — the S-Curve always shows all of it.
  const projectSpan = spanOf([...(leaves.length ? leaves : allTasks), ...baseLeaves])
    ?? { start: toDate(todayStr()), end: dayAt(toDate(todayStr()), 13) };
  // Gantt span: whole project, or the chosen date range (a look-ahead).
  const customOk = s.range === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(s.rangeStart) && /^\d{4}-\d{2}-\d{2}$/.test(s.rangeEnd) && s.rangeStart <= s.rangeEnd;
  const ganttSpan = customOk ? { start: toDate(s.rangeStart), end: toDate(s.rangeEnd) } : projectSpan;
  // Rows printed: all, or (look-ahead) only those active in the range — a
  // phase's rolled-up dates overlap exactly when one of its tasks does. Row
  // IDs stay the full schedule's numbering.
  const printed = customOk && s.rangeTasksOnly
    ? rows.filter((r) => r.task.startDate <= s.rangeEnd && r.task.endDate >= s.rangeStart)
    : rows;

  const zoomFor = (w: number, span: { start: Date; end: Date }): GanttZoom => {
    const est = w / Math.max(1, daysBetween(span.start, span.end) + 1);
    return est >= 14 ? 'day' : est >= 3 ? 'week' : 'month';
  };
  const zoom = zoomFor(CHART_W, ganttSpan);
  const range = snapRange(ganttSpan.start, ganttSpan.end, zoom);
  const totalDays = daysBetween(range.start, range.end) + 1;
  const dayW = CHART_W / totalDays;
  const tiers = timescaleTiers(zoom, range.start, totalDays, dayW);

  // Rows per page: squeeze onto one page, or readable rows split over pages.
  const bodyAvail = PAGE_H - MARGIN * 2 - HEADER_H - LEGEND_H - TIER_H * 2 - 6;
  const rowH = s.layout === 'fit' ? Math.min(MAX_ROW_H, bodyAvail / Math.max(1, printed.length)) : PAGED_ROW_H;
  const perPage = s.layout === 'fit' ? Math.max(1, printed.length) : Math.max(1, Math.floor(bodyAvail / rowH));
  const chunks: TreeRow[][] = [];
  for (let i = 0; i < Math.max(1, printed.length); i += perPage) chunks.push(printed.slice(i, i + perPage));
  const fs = Math.max(3, Math.min(8, rowH * 0.55));

  const idNum = new Map(rows.map((r, i) => [r.task.id, i + 1]));
  // Bar geometry on the timeline, and the part of it inside the chart.
  const barGeom = (t: ScheduleTask) => {
    const half = t.startDate === t.endDate && !t.isMilestone && t.durationDays != null && t.durationDays > 0 && t.durationDays < 1;
    return {
      left: daysBetween(range.start, toDate(t.startDate)) * dayW,
      width: half ? Math.max(1, t.durationDays! * dayW) : Math.max(dayW, durationOf(t.startDate, t.endDate) * dayW),
    };
  };
  const clipped = (g: { left: number; width: number }) => {
    const l = Math.max(0, g.left);
    const r = Math.min(CHART_W, g.left + g.width);
    return r > l ? { l, r } : null;
  };
  const msVisible = (g: { left: number }) => g.left + dayW / 2 >= 0 && g.left + dayW / 2 <= CHART_W;

  const durLabel = (r: TreeRow) => {
    if (r.task.isMilestone && !r.isSummary) return '0 days';
    const n = r.isSummary || r.task.durationDays == null
      ? workingDaysBetween(r.task.startDate, r.task.endDate, data.workingDays)
      : r.task.durationDays;
    return `${n} day${n === 1 ? '' : 's'}`;
  };

  // Project roll-up for the header line.
  let pStart = '';
  let pEnd = '';
  for (const t of leaves) {
    if (!pStart || t.startDate < pStart) pStart = t.startDate;
    if (!pEnd || t.endDate > pEnd) pEnd = t.endDate;
  }
  const pct = Math.round(projectPercent(allTasks) ?? 0);
  const bEnd = baseLeaves.length ? baseLeaves.reduce((m, t) => (t.endDate > m ? t.endDate : m), baseLeaves[0].endDate) : '';

  // Each task's share of project progress; a phase's share is its tasks' sum.
  const { mode: wMode, weights, total: wTotal } = leafWeights(allTasks);
  const share = new Map<string, number>();
  rows.forEach((r, i) => {
    if (!r.isSummary) { share.set(r.task.id, wTotal > 0 ? ((weights.get(r.task.id) || 0) / wTotal) * 100 : 0); return; }
    let sum = 0;
    for (let j = i + 1; j < rows.length && rows[j].depth > r.depth; j++) {
      if (!rows[j].isSummary) sum += wTotal > 0 ? ((weights.get(rows[j].task.id) || 0) / wTotal) * 100 : 0;
    }
    share.set(r.task.id, sum);
  });

  const cellText = (r: TreeRow, c: Col): string => {
    const t = r.task;
    switch (c.key) {
      case 'id': return String(idNum.get(t.id) ?? '');
      case 'name': return fit(t.name, c.w - r.depth * fs * 1.2, fs);
      case 'dur': return durLabel(r);
      case 'start': return mspDate(t.startDate);
      case 'finish': return mspDate(t.endDate);
      case 'bfin': { const b = bmap.get(t.id); return b ? mspDate(b.endDate) : ''; }
      case 'fvar': { const b = bmap.get(t.id); return b ? varianceLabel(finishVariance(t.endDate, b.endDate, data.workingDays)) : ''; }
      case 'pred': return fit(linksOf(t).filter((l) => idNum.has(l.id)).map((l) => formatLink(idNum.get(l.id) as number, l)).join(','), c.w, fs);
      case 'mp': return !r.isSummary && !t.isMilestone && (t.manpower || 0) > 0 ? String(t.manpower) : '';
      case 'pct': return `${Math.round(t.progressPct || 0)}%`;
      case 'wt': return share.has(t.id) ? `${(share.get(t.id) || 0).toFixed(1)}%` : '';
      default: return '';
    }
  };
  const varColor = (r: TreeRow) => {
    const b = bmap.get(r.task.id);
    const v = b ? finishVariance(r.task.endDate, b.endDate, data.workingDays) : 0;
    return v > 0 ? C.late : v < 0 ? C.early : C.text;
  };

  // With a baseline the task bar moves up to make room for the grey bar below.
  const barTop = hasBaseline ? rowH * 0.16 : rowH * 0.25;
  const barH = hasBaseline ? rowH * 0.46 : rowH * 0.5;
  const baseTop = barTop + barH + rowH * 0.06;
  const baseH = rowH * 0.16;

  const nonWorking: number[] = [];
  if (s.showWeekends && dayW >= 4) {
    for (let i = 0; i < totalDays; i++) {
      const g = dayAt(range.start, i).getDay();
      if (g === 0 || g === 6) nonWorking.push(i);
    }
  }
  const today = toDate(todayStr());
  const todayX = s.showToday && today >= range.start && today <= range.end ? daysBetween(range.start, today) * dayW + dayW / 2 : null;

  const tierRow = (segs: TimescaleSeg[], align: 'left' | 'center') => (
    <View style={{ position: 'relative', height: TIER_H, borderBottomWidth: 0.5, borderColor: C.border }}>
      {segs.map((sg) => (
        <View
          key={sg.key}
          style={{
            position: 'absolute', left: sg.left, width: sg.width, top: 0, height: TIER_H,
            borderRightWidth: 0.5, borderColor: C.border, justifyContent: 'center',
            alignItems: align === 'center' ? 'center' : 'flex-start', paddingLeft: align === 'center' ? 0 : 3,
          }}
        >
          <Text style={{ fontSize: 6.5 }}>{sg.width >= (align === 'center' ? 6 : 26) ? fit(sg.label, sg.width, 6.5) : ''}</Text>
        </View>
      ))}
    </View>
  );

  // Unbranded page numbering (schedules also go out on subcontracted projects).
  const pageNo = () => (
    <Text style={{ fontSize: 7, color: C.sub, marginLeft: 'auto' }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  );

  const pageHeader = (title: string, kpis: [string, string][]) => (
    <View style={{ height: HEADER_H, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <View style={{ maxWidth: narrow ? CONTENT_W * 0.42 : CONTENT_W * 0.45 }}>
        <Text style={{ fontSize: narrow ? 13 : 16, fontFamily: 'Helvetica-Bold', color: C.primary }}>{title}</Text>
        <Text style={{ fontSize: narrow ? 7.5 : 9, color: C.sub, marginTop: 2 }}>
          {fit([s.projectNumber, s.projectTitle].filter(Boolean).join(' — ') + (s.revision.trim() ? ` · Rev. ${s.revision.trim()}` : ''), narrow ? CONTENT_W * 0.42 : CONTENT_W * 0.45, narrow ? 7.5 : 9)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: CONTENT_W * 0.56 }}>
        {kpis.map(([k, v]) => (
          <View key={k} style={{ marginLeft: narrow ? 10 : 18, marginBottom: 2 }}>
            <Text style={{ fontSize: narrow ? 6 : 7, color: C.sub }}>{k}</Text>
            <Text style={{ fontSize: narrow ? 7.5 : 9, fontFamily: 'Helvetica-Bold', marginTop: 1 }}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const ganttKpis: [string, string][] = pStart === '' ? [] : [
    ['Start', mspDate(pStart)],
    ['Finish', mspDate(pEnd)],
    ...(narrow ? [] : [['Duration', `${workingDaysBetween(pStart, pEnd, data.workingDays)} days`] as [string, string]]),
    ...(hasBaseline ? [['Baseline Finish', mspDate(bEnd)], ['Finish Var.', varianceLabel(finishVariance(pEnd, bEnd, data.workingDays))]] as [string, string][] : []),
    ['% Complete', `${pct}%`],
    ...(narrow ? [] : [['Weighting', wMode === 'manual' ? 'Manual weights' : 'By duration'], ['Tasks', String(leaves.length)]] as [string, string][]),
  ];
  const ganttTitle = customOk ? `${s.title} · ${mspDate(s.rangeStart)} – ${mspDate(s.rangeEnd)}` : s.title;

  // Bar label text + where it goes: right of the bar, else inside it, else
  // left of it — so labels near the chart's right edge aren't clipped.
  const labelFor = (t: ScheduleTask): string => {
    if (t.isMilestone) return s.showTaskLabels ? `${toDate(t.startDate).getMonth() + 1}/${toDate(t.startDate).getDate()}` : '';
    return [s.showTaskLabels ? t.category : '', s.showManpower && (t.manpower || 0) > 0 ? `[${t.manpower}]` : ''].filter(Boolean).join(' ');
  };
  const placeLabel = (t: ScheduleTask, lfs: number): { x: number; text: string; inside?: boolean } | null => {
    const label = labelFor(t);
    if (!label) return null;
    const g = barGeom(t);
    const w = textW(label, lfs) + 2;
    if (t.isMilestone) {
      if (!msVisible(g)) return null;
      const cx = g.left + dayW / 2;
      if (cx + rowH * 0.45 + w <= CHART_W - 2) return { x: cx + rowH * 0.45, text: label };
      if (cx - rowH * 0.45 - w >= 2) return { x: cx - rowH * 0.45 - w, text: label };
      return null;
    }
    const vis = clipped(g);
    if (!vis) return null;
    if (vis.r + 3 + w <= CHART_W - 2) return { x: vis.r + 3, text: label };
    if (vis.r - vis.l >= w + 4) return { x: vis.l + 2, text: label, inside: true };
    if (vis.l - 3 - w >= 2) return { x: vis.l - 3 - w, text: label };
    const room = CHART_W - (vis.r + 3);
    return room > 14 ? { x: vis.r + 3, text: fit(label, room, lfs) } : null;
  };

  const legendItems = (chunk: TreeRow[]) => [
    { key: 'task', label: 'Task', sw: <Rect x={0} y={2} width={22} height={6} fill={C.bar} stroke={C.barEdge} strokeWidth={0.5} /> },
    ...(s.showProgress ? [{ key: 'prog', label: 'Progress', sw: <Rect x={0} y={3.9} width={22} height={2.2} fill={C.progress} /> }] : []),
    { key: 'sum', label: 'Summary', sw: <Path d="M 0 2 H 22 V 8 L 19 5 H 3 L 0 8 Z" fill={C.summary} /> },
    { key: 'ms', label: 'Milestone', sw: <Polygon points="11,1 15,5 11,9 7,5" fill={C.summary} /> },
    ...(chunk.some((r) => !r.isSummary && r.task.mode === 'manual') ? [{ key: 'man', label: 'Manual task', sw: <Rect x={0} y={2} width={22} height={6} fill={C.manualBar} stroke={C.manualEdge} strokeWidth={0.5} /> }] : []),
    ...(hasBaseline ? [{ key: 'base', label: 'Baseline', sw: <Rect x={0} y={3.5} width={22} height={3} fill={C.baseline} /> }] : []),
    ...(crit.size > 0 ? [{ key: 'crit', label: 'Critical', sw: <Rect x={0} y={2} width={22} height={6} fill={C.critBar} stroke={C.critEdge} strokeWidth={0.5} /> }] : []),
  ];

  const renderGanttPage = (chunk: TreeRow[], pageIdx: number) => {
    const bodyH = chunk.length * rowH;
    // Links between rows on this page, routed like the screen (FS / SS / FF / SF).
    const links: { d: string; crit: boolean; ex: number; ey: number; dir: 'down' | 'up' | 'right' | 'left' }[] = [];
    if (s.showDependencies) {
      const idx = new Map(chunk.map((r, i) => [r.task.id, i]));
      chunk.forEach((row, si) => {
        const st = row.task;
        linksOf(st).forEach((lk) => {
          const pid = lk.id;
          const pi = idx.get(pid);
          if (pi === undefined || pi === si) return;
          const p = chunk[pi].task;
          const pg = barGeom(p);
          const sg = barGeom(st);
          const ms = rowH * 0.35;
          const pStart = p.isMilestone ? pg.left + dayW / 2 - ms : pg.left;
          const pEnd = p.isMilestone ? pg.left + dayW / 2 + ms : pg.left + pg.width;
          const sStart = st.isMilestone ? sg.left + dayW / 2 - ms : sg.left;
          const sEnd = st.isMilestone ? sg.left + dayW / 2 + ms : sg.left + sg.width;
          const inChart = (x: number) => x >= 0 && x <= CHART_W;
          const x1 = pEnd;
          const sX = st.isMilestone ? sg.left + dayW / 2 : sg.left;
          if (![pStart, pEnd, sStart, sEnd].every(inChart)) return; // an end is outside the date range
          const y1 = pi * rowH + rowH / 2;
          const y2 = si * rowH + rowH / 2;
          const down = si > pi;
          const mid = (down ? pi + 1 : pi) * rowH;
          const inset = st.isMilestone ? 0 : Math.min(4, sg.width / 2);
          const isCrit = crit.has(pid) && crit.has(st.id);
          if (lk.type === 'SS') {
            const xL = Math.max(0, Math.min(pStart, sStart) - 5);
            links.push({ d: `M ${pStart} ${y1} H ${xL} V ${y2} H ${sStart}`, crit: isCrit, ex: sStart, ey: y2, dir: 'right' });
          } else if (lk.type === 'FF') {
            const xR = Math.min(CHART_W, Math.max(pEnd, sEnd) + 5);
            links.push({ d: `M ${pEnd} ${y1} H ${xR} V ${y2} H ${sEnd}`, crit: isCrit, ex: sEnd, ey: y2, dir: 'left' });
          } else if (lk.type === 'SF') {
            links.push({ d: `M ${pStart} ${y1} H ${Math.max(0, pStart - 5)} V ${mid} H ${Math.min(CHART_W, sEnd + 5)} V ${y2} H ${sEnd}`, crit: isCrit, ex: sEnd, ey: y2, dir: 'left' });
          } else if (sX + inset >= x1 + 1.5) {
            const yEnd = down ? si * rowH + barTop - 0.3 : si * rowH + barTop + barH + 0.3;
            links.push({ d: `M ${x1} ${y1} H ${sX + inset} V ${yEnd}`, crit: isCrit, ex: sX + inset, ey: yEnd, dir: down ? 'down' : 'up' });
          } else {
            const mid = (down ? pi + 1 : pi) * rowH;
            const y2 = si * rowH + rowH / 2;
            links.push({ d: `M ${x1} ${y1} h 4 V ${mid} H ${sX - 5} V ${y2} H ${sX}`, crit: isCrit, ex: sX, ey: y2, dir: 'right' });
          }
        });
      });
    }
    const lfs = fs * 0.9;

    return (
      <Page key={`g${pageIdx}`} size={[PAGE_W, PAGE_H]} style={{ padding: MARGIN, fontFamily: 'Helvetica', color: C.text }}>
        <View wrap={false}>
          {pageHeader(ganttTitle, ganttKpis)}

          <View style={{ flexDirection: 'row', borderWidth: 0.5, borderColor: C.border }}>
            <View style={{ width: TABLE_W, borderRightWidth: 1, borderColor: C.frame }}>
              <View style={{ height: TIER_H * 2, flexDirection: 'row', backgroundColor: C.headerBg, borderBottomWidth: 0.5, borderColor: C.border }}>
                {cols.map((c) => (
                  <View key={c.key} style={{ width: c.w, borderRightWidth: 0.5, borderColor: C.border, justifyContent: 'center', paddingHorizontal: 2.5 }}>
                    <Text style={{ fontSize: 7, textAlign: c.align === 'right' ? 'right' : 'left' }}>{c.key === 'id' ? '' : fit(c.label, c.w, 7)}</Text>
                  </View>
                ))}
              </View>
              {chunk.map((r) => (
                <View key={r.task.id} style={{ height: rowH, flexDirection: 'row', borderBottomWidth: 0.4, borderColor: C.border }}>
                  {cols.map((c) => (
                    <View
                      key={c.key}
                      style={{
                        width: c.w, borderRightWidth: 0.4, borderColor: C.border, justifyContent: 'center', overflow: 'hidden',
                        paddingHorizontal: 2.5, paddingLeft: c.key === 'name' ? 2.5 + r.depth * fs * 1.2 : 2.5,
                        backgroundColor: c.key === 'id' ? C.headerBg : r.task.highlight ? TASK_HIGHLIGHTS[r.task.highlight] : undefined,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fs, textAlign: c.align === 'right' ? 'right' : 'left',
                          fontFamily: r.isSummary && c.key !== 'id' && c.key !== 'pred' && c.key !== 'pct' ? 'Helvetica-Bold' : 'Helvetica',
                          color: c.key === 'id' ? C.sub : c.key === 'fvar' ? varColor(r) : C.text,
                        }}
                      >
                        {cellText(r, c)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>

            <View style={{ width: CHART_W }}>
              {tierRow(tiers.top, 'left')}
              {tierRow(tiers.bottom, 'center')}
              <View style={{ position: 'relative', height: bodyH }}>
                <Svg width={CHART_W} height={bodyH} style={{ position: 'absolute', top: 0, left: 0 }}>
                  {nonWorking.map((d) => <Rect key={`nw${d}`} x={d * dayW} y={0} width={dayW} height={bodyH} fill={C.nonWorking} />)}
                  {hasBaseline && chunk.map((r, i) => {
                    const b = bmap.get(r.task.id);
                    if (!b) return null;
                    const g = barGeom(b);
                    const y = i * rowH + baseTop;
                    if (b.isMilestone && !r.isSummary) {
                      if (!msVisible(g)) return null;
                      const cx = g.left + dayW / 2;
                      const m = baseH * 1.1;
                      const cy = y + baseH / 2;
                      return <Polygon key={`bl${r.task.id}`} points={`${cx},${cy - m} ${cx + m},${cy} ${cx},${cy + m} ${cx - m},${cy}`} fill="#ffffff" stroke={C.baseline} strokeWidth={0.5} />;
                    }
                    const v = clipped(g);
                    return v ? <Rect key={`bl${r.task.id}`} x={v.l} y={y} width={v.r - v.l} height={baseH} fill={C.baseline} /> : null;
                  })}
                  {chunk.map((r, i) => {
                    const t = r.task;
                    const g = barGeom(t);
                    const y = i * rowH;
                    const isCrit = crit.has(t.id);
                    if (t.isMilestone && !r.isSummary) {
                      if (!msVisible(g)) return null;
                      const cx = g.left + dayW / 2;
                      const cy = hasBaseline ? y + barTop + barH / 2 : y + rowH / 2;
                      const m = hasBaseline ? rowH * 0.26 : rowH * 0.3;
                      return <Polygon key={t.id} points={`${cx},${cy - m} ${cx + m},${cy} ${cx},${cy + m} ${cx - m},${cy}`} fill={isCrit ? C.critProgress : C.summary} />;
                    }
                    const v = clipped(g);
                    if (!v) return null;
                    if (r.isSummary) {
                      const th = rowH * 0.2;
                      const top = y + (hasBaseline ? rowH * 0.14 : rowH * 0.3);
                      // Pointed ends only where the phase really starts / ends on this chart.
                      const tw = Math.min((v.r - v.l) / 2, rowH * 0.32);
                      const lt = g.left >= 0 ? tw : 0;
                      const rt = g.left + g.width <= CHART_W ? tw : 0;
                      const drop = th + rowH * 0.22;
                      return (
                        <Path
                          key={t.id}
                          d={`M ${v.l} ${top} H ${v.r} V ${top + (rt ? drop : th)} L ${v.r - rt} ${top + th} H ${v.l + lt} L ${v.l} ${top + (lt ? drop : th)} Z`}
                          fill={C.summary}
                        />
                      );
                    }
                    const p = Math.min(100, Math.max(0, t.progressPct || 0));
                    const ph = barH * 0.36;
                    const manual = t.mode === 'manual';
                    const pEndX = Math.min(v.r, g.left + (g.width * p) / 100);
                    return [
                      <Rect key={`${t.id}b`} x={v.l} y={y + barTop} width={v.r - v.l} height={barH} fill={isCrit ? C.critBar : manual ? C.manualBar : C.bar} stroke={isCrit ? C.critEdge : manual ? C.manualEdge : C.barEdge} strokeWidth={0.5} />,
                      s.showProgress && p > 0 && pEndX > v.l
                        ? <Rect key={`${t.id}p`} x={v.l} y={y + barTop + (barH - ph) / 2} width={pEndX - v.l} height={ph} fill={isCrit ? C.critProgress : manual ? C.manualProgress : C.progress} />
                        : null,
                    ];
                  })}
                  {links.map((l, i) => {
                    const a = Math.max(1.6, rowH * 0.16);
                    const head = l.dir === 'down'
                      ? `${l.ex - a},${l.ey - a * 1.6} ${l.ex + a},${l.ey - a * 1.6} ${l.ex},${l.ey}`
                      : l.dir === 'up'
                        ? `${l.ex - a},${l.ey + a * 1.6} ${l.ex + a},${l.ey + a * 1.6} ${l.ex},${l.ey}`
                        : l.dir === 'left'
                          ? `${l.ex + a * 1.6},${l.ey - a} ${l.ex + a * 1.6},${l.ey + a} ${l.ex},${l.ey}`
                          : `${l.ex - a * 1.6},${l.ey - a} ${l.ex - a * 1.6},${l.ey + a} ${l.ex},${l.ey}`;
                    const col = l.crit ? C.critLink : C.link;
                    return [
                      <Path key={`l${i}`} d={l.d} fill="none" stroke={col} strokeWidth={0.6} />,
                      <Polygon key={`a${i}`} points={head} fill={col} />,
                    ];
                  })}
                  {todayX !== null && <Line x1={todayX} y1={0} x2={todayX} y2={bodyH} stroke={C.today} strokeWidth={0.6} strokeDasharray="2,1.5" />}
                </Svg>
                {fs >= 4 && chunk.map((r, i) => {
                  if (r.isSummary) return null;
                  const pl = placeLabel(r.task, lfs);
                  if (!pl) return null;
                  return (
                    <Text key={`lbl${r.task.id}`} style={{ position: 'absolute', left: pl.x, top: i * rowH + (rowH - fs) / 2 - 0.5, fontSize: lfs, color: pl.inside ? '#0B2545' : C.text }}>
                      {pl.text}
                    </Text>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Legend (+ page number when there's no title block) */}
          <View style={{ height: LEGEND_H, flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            {legendItems(chunk).map((it) => (
              <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', marginRight: narrow ? 10 : 18 }}>
                <Svg width={22} height={10}>{it.sw as ReactNode}</Svg>
                <Text style={{ fontSize: 7, marginLeft: 4 }}>{it.label}</Text>
              </View>
            ))}
            {pageNo()}
          </View>
        </View>
      </Page>
    );
  };

  // S-Curve page — always the whole project, with its own timescale.
  const sc = s.includeSCurve
    ? computeSCurve(allTasks, data.workingDays, data.snapshots ?? [], hasBaseline && data.baseline ? data.baseline.tasks : undefined)
    : null;
  const renderSCurvePage = () => {
    if (!sc) return null;
    const SC_PLOT_W = CONTENT_W - SC_GUTTER;
    const scZoom = zoomFor(SC_PLOT_W, projectSpan);
    const scRange = snapRange(projectSpan.start, projectSpan.end, scZoom);
    const scDays = daysBetween(scRange.start, scRange.end) + 1;
    const scDayW = SC_PLOT_W / scDays;
    const scTiers = timescaleTiers(scZoom, scRange.start, scDays, scDayW);
    const mpH = s.includeManpower && sc.hasManpower ? Math.min(150, PAGE_H * 0.2) : 0;
    const plotH = PAGE_H - MARGIN * 2 - HEADER_H - SC_LEGEND_H - TIER_H * 2 - 2 - (mpH ? mpH + 22 : 0);
    const x0 = (d: string) => daysBetween(scRange.start, toDate(d)) * scDayW;
    const xEnd = (d: string) => x0(d) + scDayW;
    const yOf = (pv: number) => SC_PAD + (1 - pv / 100) * (plotH - SC_PAD - 2);
    const first = sc.daily[0];
    const plannedD = [`M ${x0(first.date)} ${yOf(0)}`, ...sc.daily.map((d) => `L ${xEnd(d.date)} ${yOf(d.plannedPct)}`)].join(' ');
    const baselineD = sc.hasBaseline
      ? [`M ${x0(first.date)} ${yOf(0)}`, ...sc.daily.map((d) => `L ${xEnd(d.date)} ${yOf(d.baselinePct ?? 0)}`)].join(' ')
      : null;
    const actual = sc.actualPoints.map((a) => ({ x: xEnd(a.date), y: yOf(a.pct), pct: a.pct }));
    const actualD = actual.map((a, i) => `${i ? 'L' : 'M'} ${a.x} ${a.y}`).join(' ');
    const lastA = actual[actual.length - 1];
    const vsBaseline = sc.hasBaseline && sc.baselineToday != null;
    const variance = sc.actualToday - (vsBaseline ? (sc.baselineToday as number) : sc.plannedToday);
    const tX = s.showToday && today >= scRange.start && today <= scRange.end ? daysBetween(scRange.start, today) * scDayW + scDayW / 2 : null;
    const maxPax = Math.max(1, ...sc.daily.map((d) => d.pax));
    const paxTicks = Array.from(new Set([0, Math.round(maxPax / 2), maxPax]));
    const barGap = Math.min(1, scDayW * 0.18);
    const pctTicks = [0, 25, 50, 75, 100];
    const kpis: [string, string][] = [
      ['Planned to date', `${sc.plannedToday.toFixed(1)}%`],
      ...(sc.hasBaseline && sc.baselineToday != null ? [['Baseline to date', `${sc.baselineToday.toFixed(1)}%`] as [string, string]] : []),
      ['Actual to date', `${sc.actualToday.toFixed(1)}%`],
      [vsBaseline ? 'Variance vs baseline' : 'Variance', `${variance > 0 ? '+' : ''}${variance.toFixed(1)} pts ${Math.abs(variance) < 0.5 ? '(on plan)' : variance > 0 ? '(ahead)' : '(behind)'}`],
      ...(mpH > 0 ? [['Peak manpower', sc.peak ? `${sc.peak.pax} · ${mspDate(sc.peak.date)}` : '—'] as [string, string]] : []),
    ];
    const tierAt = (segs: TimescaleSeg[], align: 'left' | 'center') => (
      <View style={{ position: 'relative', height: TIER_H, marginLeft: SC_GUTTER, borderBottomWidth: 0.5, borderColor: C.border }}>
        {segs.map((sg) => (
          <View key={sg.key} style={{ position: 'absolute', left: sg.left, width: sg.width, top: 0, height: TIER_H, borderRightWidth: 0.5, borderColor: C.border, justifyContent: 'center', alignItems: align === 'center' ? 'center' : 'flex-start', paddingLeft: align === 'center' ? 0 : 3 }}>
            <Text style={{ fontSize: 7 }}>{sg.width >= sg.label.length * 7 * 0.55 + 6 ? sg.label : ''}</Text>
          </View>
        ))}
      </View>
    );
    const legend = (swatch: ReactNode, label: string) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
        <Svg width={18} height={6}>{swatch}</Svg>
        <Text style={{ fontSize: 8, marginLeft: 4 }}>{label}</Text>
      </View>
    );
    return (
      <Page key="scurve" size={[PAGE_W, PAGE_H]} style={{ padding: MARGIN, fontFamily: 'Helvetica', color: C.text }}>
        <View wrap={false}>
          {pageHeader('S-Curve — Project % Complete', kpis)}

          <View style={{ height: SC_LEGEND_H, flexDirection: 'row', alignItems: 'center' }}>
            {legend(<Line x1={0} y1={3} x2={18} y2={3} stroke={C.planned} strokeWidth={1.8} />, 'Planned')}
            {sc.hasBaseline && legend(<Line x1={0} y1={3} x2={18} y2={3} stroke={C.baselineCurve} strokeWidth={1.8} strokeDasharray="4,2.5" />, 'Baseline')}
            {legend([<Line key="l" x1={0} y1={3} x2={18} y2={3} stroke={C.actual} strokeWidth={1.8} />, <Circle key="c" cx={9} cy={3} r={2.4} fill={C.actual} />], 'Actual')}
            {s.showToday && legend(<Line x1={0} y1={3} x2={18} y2={3} stroke={C.today} strokeWidth={0.8} strokeDasharray="2,1.5" />, 'Today')}
            {!narrow && (
              <Text style={{ fontSize: 7, color: C.sub, marginLeft: 8 }}>
                Tasks weighted {sc.weighting === 'manual' ? 'by entered progress weights' : 'by duration'}, same as % Complete on the Gantt. Actual points are saved schedule versions plus today.
              </Text>
            )}
            {pageNo()}
          </View>

          {/* % complete plot */}
          <View style={{ flexDirection: 'row', height: plotH }}>
            <View style={{ width: SC_GUTTER, position: 'relative' }}>
              {pctTicks.map((v) => (
                <Text key={v} style={{ position: 'absolute', right: 4, top: yOf(v) - 4, fontSize: 7.5, color: C.sub }}>{v}%</Text>
              ))}
            </View>
            <View style={{ width: SC_PLOT_W, position: 'relative', borderLeftWidth: 0.5, borderColor: C.border }}>
              <Svg width={SC_PLOT_W} height={plotH} style={{ position: 'absolute', top: 0, left: 0 }}>
                {pctTicks.map((v) => <Line key={v} x1={0} y1={yOf(v)} x2={SC_PLOT_W} y2={yOf(v)} stroke={C.grid} strokeWidth={0.6} />)}
                {tX !== null && <Line x1={tX} y1={0} x2={tX} y2={plotH} stroke={C.today} strokeWidth={0.8} strokeDasharray="3,2" />}
                {baselineD && <Path d={baselineD} fill="none" stroke={C.baselineCurve} strokeWidth={1.8} strokeDasharray="4,2.5" />}
                <Path d={plannedD} fill="none" stroke={C.planned} strokeWidth={1.8} />
                {actual.length > 1 && <Path d={actualD} fill="none" stroke={C.actual} strokeWidth={1.8} />}
                {actual.map((a, i) => <Circle key={i} cx={a.x} cy={a.y} r={3} fill={C.actual} stroke="#ffffff" strokeWidth={1} />)}
              </Svg>
              {lastA && (
                <Text style={{ position: 'absolute', left: Math.min(lastA.x + 5, SC_PLOT_W - 34), top: lastA.y - 13, fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>
                  {lastA.pct.toFixed(1)}%
                </Text>
              )}
            </View>
          </View>
          {/* Manpower loading */}
          {mpH > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3, marginLeft: SC_GUTTER }}>Manpower loading (per day)</Text>
              <View style={{ flexDirection: 'row', height: mpH - 12 }}>
                <View style={{ width: SC_GUTTER, position: 'relative' }}>
                  {paxTicks.map((v) => (
                    <Text key={v} style={{ position: 'absolute', right: 4, top: (mpH - 12) - (v / maxPax) * (mpH - 20) - 4, fontSize: 7.5, color: C.sub }}>{v}</Text>
                  ))}
                </View>
                <View style={{ width: SC_PLOT_W, borderLeftWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.border }}>
                  <Svg width={SC_PLOT_W} height={mpH - 12}>
                    {paxTicks.map((v) => <Line key={v} x1={0} y1={(mpH - 12) - (v / maxPax) * (mpH - 20)} x2={SC_PLOT_W} y2={(mpH - 12) - (v / maxPax) * (mpH - 20)} stroke={C.grid} strokeWidth={0.6} />)}
                    {tX !== null && <Line x1={tX} y1={0} x2={tX} y2={mpH - 12} stroke={C.today} strokeWidth={0.8} strokeDasharray="3,2" />}
                    {sc.daily.filter((d) => d.pax > 0).map((d) => {
                      const h = (d.pax / maxPax) * (mpH - 20);
                      return <Rect key={d.date} x={x0(d.date) + barGap / 2} y={(mpH - 12) - h} width={Math.max(0.5, scDayW - barGap)} height={h} fill={C.manpower} />;
                    })}
                  </Svg>
                </View>
              </View>
            </View>
          )}
          <View style={{ borderTopWidth: 0.5, borderColor: C.border, marginLeft: SC_GUTTER }} />
          {tierAt(scTiers.bottom, 'center')}
          {tierAt(scTiers.top, 'left')}
        </View>
      </Page>
    );
  };

  return (
    <Document title={`${s.projectNumber ? `${s.projectNumber} ` : ''}${s.title}${s.revision ? ` Rev ${s.revision}` : ''}`}>
      {chunks.map((chunk, i) => renderGanttPage(chunk, i))}
      {renderSCurvePage()}
    </Document>
  );
}

/** Columns the chosen page can't fit (dropped automatically) — shown in the dialog. */
export function droppedColumns(s: ScheduleExportSettings, hasBaseline: boolean): string[] {
  const paper = PAPER_SIZES[s.paper];
  const w = (s.orientation === 'landscape' ? paper.h : paper.w) - MARGIN * 2;
  const labels = new Map(BASE_COLS.map((c) => [c.key, c.label]));
  return chooseColumns(s, hasBaseline, w * TABLE_SHARE[s.orientation]).dropped.map((k) => labels.get(k) || k);
}

export function renderSchedulePdf(project: ScheduleProjectRef, rows: TreeRow[], data: ScheduleExportData, settings: ScheduleExportSettings): Promise<Blob> {
  return pdf(<ScheduleDoc project={project} rows={rows} data={data} s={settings} />).toBlob();
}

export function schedulePdfFileName(project: ScheduleProjectRef, settings: ScheduleExportSettings): string {
  const rev = settings.revision.trim() ? `-rev${settings.revision.trim().replace(/[^\w.-]+/g, '')}` : '';
  return `${settings.projectNumber || project.code || 'schedule'}-gantt-chart${rev}.pdf`;
}

export async function exportSchedulePdf(project: ScheduleProjectRef, rows: TreeRow[], data: ScheduleExportData, settings: ScheduleExportSettings): Promise<void> {
  const blob = await renderSchedulePdf(project, rows, data, settings);
  saveAs(blob, schedulePdfFileName(project, settings));
}
