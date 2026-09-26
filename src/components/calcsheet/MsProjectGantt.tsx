import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { Box, Tooltip } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import CheckIcon from '@mui/icons-material/Check';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import { TASK_HIGHLIGHTS, type ScheduleTask } from '../../types/ScheduleTask';
import type { TreeRow } from '../../utils/calcsheet/scheduleTree';
import { finishVariance, varianceLabel } from '../../utils/calcsheet/scheduleBaseline';
import { daysBetween, durationOf, toDate, todayStr, workingDaysBetween } from '../../utils/calcsheet/scheduleDates';
import { dayAt, mspDate, timescaleTiers, type GanttZoom, type TimescaleSeg } from '../../utils/calcsheet/scheduleTimescale';

export type { GanttZoom };
export const ZOOM_DAY_WIDTH: Record<GanttZoom, number> = { day: 24, week: 8, month: 3 };
export const GANTT_ROW_H = 24;

const TIER_H = 22;
const HEADER_H = TIER_H * 2;
const BAR_TOP = 6;
const BAR_H = 12;
const SPLITTER_W = 6;

// Palette modelled on MS Project's default Gantt Chart view.
const MSP = {
  font: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  border: '#D4D4D4',
  headerBg: '#F3F3F3',
  idSelBg: '#D6D6D6',
  selBg: '#DCE8F7',
  text: '#262626',
  subText: '#595959',
  bar: '#8CB1E3',
  barEdge: '#5F8FD1',
  progress: '#1F3F77',
  critBar: '#F4A3A3',
  critEdge: '#D65C5C',
  critProgress: '#9C0006',
  // Manually scheduled tasks (MS Project draws these teal).
  manualBar: '#8FD3CB',
  manualEdge: '#2E9C8F',
  manualProgress: '#14665C',
  summary: '#262626',
  link: '#4472C4',
  critLink: '#C00000',
  nonWorking: '#EFEFEF',
  today: '#E07B00',
  splitter: '#E4E4E4',
  baseline: '#A6A6A6',
  late: '#C00000',
  early: '#2E7D32',
};

interface Col { key: string; label: ReactNode; w: number; align?: 'left' | 'right' | 'center' }
const COLS: Col[] = [
  { key: 'id', label: '', w: 40, align: 'right' },
  { key: 'ind', label: <InfoOutlinedIcon sx={{ fontSize: 14, color: MSP.subText }} />, w: 26, align: 'center' },
  { key: 'name', label: 'Task Name', w: 250 },
  { key: 'dur', label: 'Duration', w: 74 },
  { key: 'start', label: 'Start', w: 96 },
  { key: 'finish', label: 'Finish', w: 96 },
  { key: 'pred', label: 'Predecessors', w: 96 },
  { key: 'mp', label: 'Manpower', w: 74, align: 'right' },
  { key: 'pct', label: '% Complete', w: 80, align: 'right' },
  { key: 'wt', label: 'Weight', w: 66, align: 'right' },
  { key: 'cat', label: 'Category', w: 110 },
];
// With a baseline shown: Baseline Finish + Finish Variance after Finish.
const BASELINE_COLS: Col[] = [
  { key: 'bfin', label: 'Baseline Finish', w: 104 },
  { key: 'fvar', label: 'Finish Var.', w: 76, align: 'right' },
];
const COLS_WITH_BASELINE: Col[] = COLS.flatMap((c) => (c.key === 'finish' ? [c, ...BASELINE_COLS] : [c]));
export const GANTT_GRID_MAX_W = COLS_WITH_BASELINE.reduce((sum, c) => sum + c.w, 0);

export interface MsProjectGanttProps {
  rows: TreeRow[];
  /** Stable MS Project-style row IDs (1-based position in the fully expanded outline). */
  idNumbers: Map<string, number>;
  range: { start: Date; end: Date };
  totalDays: number;
  zoom: GanttZoom;
  workingDays: boolean;
  criticalIds: Set<string>;
  isOverdue: (t: ScheduleTask) => boolean;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  /** Focused row (keyboard cursor / single-task actions). */
  selectedId: string | null;
  /** Every selected row (Shift/Ctrl-click, Shift+arrows). */
  selectedIds?: Set<string>;
  onSelect: (id: string, mods?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  /** Rows matching the active highlight filter (tinted yellow, not hidden). */
  filterHits?: Set<string>;
  /** Find text — matching task names are marked. */
  searchQuery?: string;
  /** Bump `n` to scroll row `id` vertically into view (keyboard navigation). */
  revealRequest?: { id: string; n: number } | null;
  onOpen: (t: ScheduleTask) => void;
  onRowContextMenu: (e: ReactMouseEvent, row: TreeRow) => void;
  /** Each task's share of project progress (%), phases = sum; see scheduleWeights. */
  weightShare?: Map<string, number>;
  /** 'duration' shares are automatic (shown grey); 'manual' come from entered weights. */
  weightMode?: 'manual' | 'duration';
  /** Drag a table row onto another to move it above/below that task. */
  onReorder?: (dragId: string, targetId: string, pos: 'above' | 'below') => void;
  onBarMouseDown: (e: ReactMouseEvent, t: ScheduleTask, mode: 'move' | 'resize') => void;
  draggingTaskId: string | null;
  gridWidth: number;
  onGridWidthChange: (w: number) => void;
  /** Bump `n` to scroll the timeline to task `id` (MS Project's "Scroll to Task"). */
  scrollRequest: { id: string; n: number } | null;
  /** Task id → its baseline task. When set, grey baseline bars and the
   *  Baseline Finish / Finish Var. columns are shown. */
  baseline?: Map<string, ScheduleTask> | null;
}

export default function MsProjectGantt({
  rows, idNumbers, range, totalDays, zoom, workingDays, criticalIds, isOverdue,
  collapsed, onToggleCollapse, selectedId, selectedIds, onSelect, onOpen, onRowContextMenu, onReorder, weightShare, weightMode,
  filterHits, searchQuery, revealRequest,
  onBarMouseDown, draggingTaskId, gridWidth, onGridWidthChange, scrollRequest, baseline,
}: MsProjectGanttProps) {
  const cols = baseline ? COLS_WITH_BASELINE : COLS;
  const colX = cols.reduce((s, c) => s + c.w, 0);
  const gridW = Math.min(gridWidth, colX);
  // With a baseline, the task bar sits higher to make room for the grey bar.
  const barTop = baseline ? 4 : BAR_TOP;
  const barH = baseline ? 10 : BAR_H;
  const dayW = ZOOM_DAY_WIDTH[zoom];
  const timelineW = totalDays * dayW;
  const bodyH = rows.length * GANTT_ROW_H;
  const scrollRef = useRef<HTMLDivElement>(null);

  const { top, bottom } = useMemo(() => timescaleTiers(zoom, range.start, totalDays, dayW), [zoom, range.start, totalDays, dayW]);

  const nonWorking = useMemo(() => {
    if (dayW < 6) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < totalDays; i++) {
      const g = dayAt(range.start, i).getDay();
      if (g === 0 || g === 6) out.push(i);
    }
    return out;
  }, [range.start, totalDays, dayW]);

  const todayX = useMemo(() => {
    const t = toDate(todayStr());
    if (t < range.start || t > range.end) return null;
    return daysBetween(range.start, t) * dayW + dayW / 2;
  }, [range, dayW]);

  const barGeom = (t: ScheduleTask) => {
    const left = daysBetween(range.start, toDate(t.startDate)) * dayW;
    const half = t.startDate === t.endDate && !t.isMilestone && t.durationDays != null && t.durationDays > 0 && t.durationDays < 1;
    const width = half ? Math.max(2, t.durationDays! * dayW) : Math.max(dayW, durationOf(t.startDate, t.endDate) * dayW);
    return { left, width };
  };

  // Finish-to-start links drawn the MS Project way: out of the predecessor's
  // finish, across to just inside the successor's start, then vertically onto
  // the bar. When the successor starts before the predecessor finishes, route
  // a zig-zag back to the successor's left edge instead.
  const links = useMemo(() => {
    const idx = new Map(rows.map((r, i) => [r.task.id, i]));
    const out: { key: string; d: string; crit: boolean }[] = [];
    rows.forEach((row, si) => {
      const s = row.task;
      (s.predecessors || []).forEach((pid) => {
        const pi = idx.get(pid);
        if (pi === undefined || pi === si) return;
        const p = rows[pi].task;
        const pg = barGeom(p);
        const sg = barGeom(s);
        const x1 = p.isMilestone ? pg.left + dayW / 2 + 6 : pg.left + pg.width;
        const y1 = pi * GANTT_ROW_H + GANTT_ROW_H / 2;
        const sX = s.isMilestone ? sg.left + dayW / 2 : sg.left;
        const down = si > pi;
        const inset = s.isMilestone ? 0 : Math.min(5, sg.width / 2);
        let d: string;
        if (sX + inset >= x1 + 2) {
          const yEnd = down ? si * GANTT_ROW_H + barTop - 1 : si * GANTT_ROW_H + barTop + barH + 1;
          d = `M ${x1} ${y1} H ${sX + inset} V ${yEnd}`;
        } else {
          const mid = (down ? pi + 1 : pi) * GANTT_ROW_H;
          const y2 = si * GANTT_ROW_H + GANTT_ROW_H / 2;
          d = `M ${x1} ${y1} h 6 V ${mid} H ${sX - 8} V ${y2} H ${sX - 1}`;
        }
        out.push({ key: `${pid}-${s.id}`, d, crit: criticalIds.has(pid) && criticalIds.has(s.id) });
      });
    });
    return out;
  }, [rows, range, dayW, criticalIds, barTop, barH]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!scrollRequest || !scrollRef.current) return;
    const i = rows.findIndex((r) => r.task.id === scrollRequest.id);
    if (i < 0) return;
    const { left } = barGeom(rows[i].task);
    const el = scrollRef.current;
    el.scrollLeft = Math.max(0, left - 24);
    const y = HEADER_H + i * GANTT_ROW_H;
    if (y < el.scrollTop + HEADER_H || y > el.scrollTop + el.clientHeight - GANTT_ROW_H) {
      el.scrollTop = Math.max(0, y - el.clientHeight / 2);
    }
  }, [scrollRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!revealRequest || !scrollRef.current) return;
    const i = rows.findIndex((r) => r.task.id === revealRequest.id);
    if (i < 0) return;
    const el = scrollRef.current;
    const top = i * GANTT_ROW_H;                        // row top inside the body
    const viewTop = el.scrollTop;                       // body scrolled past
    const viewH = el.clientHeight - HEADER_H;           // visible body height
    if (top < viewTop) el.scrollTop = top;
    else if (top + GANTT_ROW_H > viewTop + viewH) el.scrollTop = top + GANTT_ROW_H - viewH;
  }, [revealRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // Row drag-to-reorder. A row can't be dropped on itself or inside its own
  // subtree (a phase dragged into one of its own subtasks).
  const [dragRow, setDragRow] = useState<{ id: string; blocked: Set<string> } | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; pos: 'above' | 'below' } | null>(null);
  const startRowDrag = (e: ReactDragEvent, row: TreeRow) => {
    const i = rows.findIndex((r) => r.task.id === row.task.id);
    const blocked = new Set<string>([row.task.id]);
    for (let j = i + 1; j < rows.length && rows[j].depth > row.depth; j++) blocked.add(rows[j].task.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.task.id);
    setDragRow({ id: row.task.id, blocked });
    onSelect(row.task.id);
  };
  const overRow = (e: ReactDragEvent, row: TreeRow) => {
    if (!dragRow || dragRow.blocked.has(row.task.id)) { setDropHint(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = e.clientY < r.top + r.height / 2 ? 'above' : 'below';
    if (dropHint?.id !== row.task.id || dropHint.pos !== pos) setDropHint({ id: row.task.id, pos });
  };
  const dropOnRow = (e: ReactDragEvent, row: TreeRow) => {
    e.preventDefault();
    if (dragRow && dropHint && dropHint.id === row.task.id && !dragRow.blocked.has(row.task.id)) {
      onReorder?.(dragRow.id, row.task.id, dropHint.pos);
    }
    setDragRow(null);
    setDropHint(null);
  };
  const endRowDrag = () => { setDragRow(null); setDropHint(null); };
  const dropLine = (id: string) => (dropHint?.id === id ? {
    position: 'relative' as const,
    '&::after': {
      content: '""', position: 'absolute', left: 0, right: 0, height: 2, bgcolor: '#1F6FD1', zIndex: 2, pointerEvents: 'none',
      ...(dropHint.pos === 'above' ? { top: -1 } : { bottom: -1 }),
    },
  } : {});

  // Splitter between the grid and the chart, like MS Project's divider bar.
  const [splitDrag, setSplitDrag] = useState<{ x: number; w: number } | null>(null);
  useEffect(() => {
    if (!splitDrag) return undefined;
    const move = (e: MouseEvent) => {
      const next = Math.min(colX, Math.max(160, splitDrag.w + e.clientX - splitDrag.x));
      onGridWidthChange(next);
    };
    const up = () => { setSplitDrag(null); document.body.style.userSelect = ''; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [splitDrag, onGridWidthChange, colX]);

  const durationLabel = (row: TreeRow) => {
    const t = row.task;
    if (t.isMilestone && !row.isSummary) return '0 days';
    const n = row.isSummary || t.durationDays == null
      ? workingDaysBetween(t.startDate, t.endDate, workingDays)
      : t.durationDays;
    return `${n} day${n === 1 ? '' : 's'}`;
  };

  const cell = (row: TreeRow, col: Col): ReactNode => {
    const t = row.task;
    switch (col.key) {
      case 'id': return idNumbers.get(t.id) ?? '';
      case 'ind': {
        const icons: ReactNode[] = [];
        if (!row.isSummary && t.progressPct >= 100) icons.push(<CheckIcon key="c" sx={{ fontSize: 14, color: '#2E7D32' }} />);
        else if (!row.isSummary && isOverdue(t)) icons.push(<ReportProblemOutlinedIcon key="o" sx={{ fontSize: 14, color: '#C62828' }} />);
        if (t.notes) icons.push(<StickyNote2OutlinedIcon key="n" sx={{ fontSize: 13, color: '#B28900' }} />);
        if (!row.isSummary && t.mode === 'manual') icons.push(<PushPinOutlinedIcon key="m" sx={{ fontSize: 13, color: MSP.manualEdge }} />);
        if (icons.length === 0) return null;
        const tip = [
            !row.isSummary && t.mode === 'manual' ? 'Manually scheduled — predecessors won\'t move this task.' : '',
          t.progressPct >= 100 && !row.isSummary ? `This task was completed on ${mspDate(t.endDate)}.` : '',
          isOverdue(t) && !row.isSummary && t.progressPct < 100 ? `This task should have finished on ${mspDate(t.endDate)}.` : '',
          t.notes ? `Notes: ${t.notes}` : '',
        ].filter(Boolean).join('\n');
        return <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{tip}</span>}><Box sx={{ display: 'flex', alignItems: 'center' }}>{icons}</Box></Tooltip>;
      }
      case 'name':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', pl: `${row.depth * 14}px`, minWidth: 0 }}>
            {row.hasChildren ? (
              <Box
                component="span"
                onClick={(e) => { e.stopPropagation(); onToggleCollapse(t.id); }}
                onDoubleClick={(e) => e.stopPropagation()}
                sx={{ display: 'inline-flex', cursor: 'pointer', color: MSP.text, ml: '-4px', flexShrink: 0 }}
              >
                {collapsed.has(t.id) ? <ArrowRightIcon sx={{ fontSize: 18 }} /> : <ArrowDropDownIcon sx={{ fontSize: 18 }} />}
              </Box>
            ) : <Box component="span" sx={{ width: 14, flexShrink: 0 }} />}
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: row.isSummary ? 700 : 400 }}>
              {(() => {
                const q = searchQuery?.trim();
                const at = q ? t.name.toLowerCase().indexOf(q.toLowerCase()) : -1;
                if (!q || at < 0) return t.name;
                return (
                  <>
                    {t.name.slice(0, at)}
                    <Box component="mark" sx={{ bgcolor: '#FFD54F', color: 'inherit', px: '1px', borderRadius: '2px' }}>{t.name.slice(at, at + q.length)}</Box>
                    {t.name.slice(at + q.length)}
                  </>
                );
              })()}
            </Box>
          </Box>
        );
      case 'dur': return <Box component="span" sx={{ fontWeight: row.isSummary ? 700 : 400 }}>{durationLabel(row)}</Box>;
      case 'start': return <Box component="span" sx={{ fontWeight: row.isSummary ? 700 : 400 }}>{mspDate(t.startDate)}</Box>;
      case 'finish': return <Box component="span" sx={{ fontWeight: row.isSummary ? 700 : 400 }}>{mspDate(t.endDate)}</Box>;
      case 'bfin': {
        const b = baseline?.get(t.id);
        return b ? <Box component="span" sx={{ fontWeight: row.isSummary ? 700 : 400 }}>{mspDate(b.endDate)}</Box> : '';
      }
      case 'fvar': {
        const b = baseline?.get(t.id);
        if (!b) return '';
        const v = finishVariance(t.endDate, b.endDate, workingDays);
        return (
          <Box component="span" sx={{ fontWeight: row.isSummary ? 700 : 400, color: v > 0 ? MSP.late : v < 0 ? MSP.early : MSP.text }}>
            {varianceLabel(v)}
          </Box>
        );
      }
      case 'pred': return (t.predecessors || []).map((p) => idNumbers.get(p)).filter((n) => n != null).join(',');
      case 'mp': return !row.isSummary && !t.isMilestone && (t.manpower || 0) > 0 ? String(t.manpower) : '';
      case 'pct': return `${Math.round(t.progressPct || 0)}%`;
      case 'wt': {
        const v = weightShare?.get(t.id);
        if (v == null) return '';
        return (
          <Box component="span" sx={{ fontWeight: row.isSummary ? 700 : 400, color: weightMode === 'manual' ? MSP.text : '#8C8C8C', fontStyle: weightMode === 'manual' ? 'normal' : 'italic' }}>
            {`${v.toFixed(1)}%`}
          </Box>
        );
      }
      case 'cat': return row.isSummary ? '' : (t.category || '');
      default: return null;
    }
  };

  const tierCell = (s: TimescaleSeg, align: 'left' | 'center') => (
    <Box
      key={s.key}
      sx={{
        position: 'absolute', left: s.left, width: s.width, top: 0, height: TIER_H,
        borderRight: `1px solid ${MSP.border}`, boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'flex-start',
        px: align === 'center' ? 0 : '4px', fontSize: 11, color: MSP.text,
      }}
    >
      {s.width >= (align === 'center' ? 8 : 24) ? s.label : ''}
    </Box>
  );

  const tipFor = (t: ScheduleTask, row: TreeRow) => (
    <Box sx={{ fontSize: 12, lineHeight: 1.5 }}>
      <Box sx={{ fontWeight: 700 }}>{row.isSummary ? 'Summary' : t.isMilestone ? 'Milestone' : 'Task'}: {t.name}</Box>
      <Box>Start: {mspDate(t.startDate)}</Box>
      <Box>Finish: {mspDate(t.endDate)}</Box>
      <Box>Duration: {durationLabel(row)}</Box>
      <Box>Complete: {Math.round(t.progressPct || 0)}%</Box>
      {!row.isSummary && <Box>Mode: {t.mode === 'manual' ? 'Manually scheduled' : 'Auto scheduled'}</Box>}
      {(() => {
        const b = baseline?.get(t.id);
        if (!b) return null;
        const v = finishVariance(t.endDate, b.endDate, workingDays);
        return (
          <Box sx={{ mt: 0.5 }}>
            <Box>Baseline: {mspDate(b.startDate)} – {mspDate(b.endDate)}</Box>
            <Box>Finish variance: {varianceLabel(v)}</Box>
          </Box>
        );
      })()}
      {!row.isSummary && draggingTaskId === null && <Box sx={{ opacity: 0.75, mt: 0.5 }}>Drag to move · drag right edge to change duration</Box>}
    </Box>
  );

  // Thin grey bar under the task: where the baseline had it (MS Project's
  // Tracking Gantt). Milestones get a small hollow diamond.
  const renderBaseline = (row: TreeRow) => {
    const b = baseline?.get(row.task.id);
    if (!b) return null;
    const { left, width } = barGeom(b);
    if (b.isMilestone && !row.isSummary) {
      return <Box sx={{ position: 'absolute', left: left + dayW / 2 - 4, top: GANTT_ROW_H - 9, width: 7, height: 7, border: `1px solid ${MSP.baseline}`, bgcolor: '#fff', transform: 'rotate(45deg)', pointerEvents: 'none' }} />;
    }
    return <Box sx={{ position: 'absolute', left, width, top: barTop + barH + 2, height: 4, bgcolor: MSP.baseline, pointerEvents: 'none' }} />;
  };

  const renderBar = (row: TreeRow) => {
    const t = row.task;
    const { left, width } = barGeom(t);
    const crit = criticalIds.has(t.id);
    const dragging = draggingTaskId === t.id;

    if (row.isSummary) {
      return (
        <Tooltip title={tipFor(t, row)} followCursor>
          <Box sx={{ position: 'absolute', left, width, top: barTop, height: barH + 2 }}>
            <Box sx={{ position: 'absolute', left: 0, right: 0, top: 1, height: 5, bgcolor: MSP.summary }} />
            <Box sx={{ position: 'absolute', left: 0, top: 6, width: 0, height: 0, borderTop: `6px solid ${MSP.summary}`, borderRight: '5px solid transparent' }} />
            <Box sx={{ position: 'absolute', right: 0, top: 6, width: 0, height: 0, borderTop: `6px solid ${MSP.summary}`, borderLeft: '5px solid transparent' }} />
          </Box>
        </Tooltip>
      );
    }

    if (t.isMilestone) {
      const cx = left + dayW / 2;
      return (
        <>
          <Tooltip title={dragging ? '' : tipFor(t, row)} followCursor>
            <Box
              onMouseDown={(e) => onBarMouseDown(e, t, 'move')}
              onDoubleClick={() => onOpen(t)}
              sx={{
                position: 'absolute', left: cx - 6, top: barTop - (baseline ? 1 : 0), width: 12, height: 12,
                bgcolor: crit ? MSP.critProgress : MSP.summary, transform: 'rotate(45deg) scale(0.85)',
                cursor: dragging ? 'grabbing' : 'grab',
              }}
            />
          </Tooltip>
          <Box sx={{ position: 'absolute', left: cx + 10, top: 0, height: GANTT_ROW_H, display: 'flex', alignItems: 'center', fontSize: 11, color: MSP.text, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {`${toDate(t.startDate).getMonth() + 1}/${toDate(t.startDate).getDate()}`}
          </Box>
        </>
      );
    }

    const pct = Math.min(100, Math.max(0, t.progressPct || 0));
    const manual = t.mode === 'manual';
    const fill = crit ? MSP.critBar : manual ? MSP.manualBar : MSP.bar;
    const edge = crit ? MSP.critEdge : manual ? MSP.manualEdge : MSP.barEdge;
    return (
      <>
        <Tooltip title={dragging ? '' : tipFor(t, row)} followCursor>
          <Box
            onMouseDown={(e) => onBarMouseDown(e, t, 'move')}
            onDoubleClick={() => onOpen(t)}
            sx={{
              position: 'absolute', left, width, top: barTop, height: barH, boxSizing: 'border-box',
              bgcolor: fill, border: `1px solid ${edge}`,
              cursor: dragging ? 'grabbing' : 'grab',
              boxShadow: dragging ? '0 0 0 2px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            {pct > 0 && (
              <Box sx={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', height: 4, width: `${pct}%`, bgcolor: crit ? MSP.critProgress : manual ? MSP.manualProgress : MSP.progress }} />
            )}
            <Box
              onMouseDown={(e) => onBarMouseDown(e, t, 'resize')}
              sx={{ position: 'absolute', right: -3, top: -2, width: 8, height: barH + 2, cursor: 'ew-resize' }}
            />
          </Box>
        </Tooltip>
        {(t.category || (t.manpower || 0) > 0) && (
          <Box sx={{ position: 'absolute', left: left + width + 6, top: 0, height: GANTT_ROW_H, display: 'flex', alignItems: 'center', fontSize: 11, color: MSP.text, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {[t.category, (t.manpower || 0) > 0 ? `[${t.manpower}]` : ''].filter(Boolean).join(' ')}
          </Box>
        )}
      </>
    );
  };

  return (
    <Box
      ref={scrollRef}
      sx={{ flex: 1, overflow: 'auto', position: 'relative', bgcolor: '#fff', border: `1px solid ${MSP.border}`, fontFamily: MSP.font, color: MSP.text, fontSize: 12, userSelect: 'none' }}
    >
      <Box sx={{ display: 'flex', width: gridW + SPLITTER_W + timelineW, minHeight: '100%' }}>
        {/* ── Entry table (grid) ───────────────────────────────────────── */}
        <Box sx={{ position: 'sticky', left: 0, zIndex: 3, width: gridW, flexShrink: 0, overflow: 'clip', bgcolor: '#fff' }}>
          <Box sx={{ position: 'sticky', top: 0, zIndex: 1, height: HEADER_H, width: colX, bgcolor: MSP.headerBg, borderBottom: `1px solid ${MSP.border}`, display: 'flex' }}>
            {cols.map((c) => (
              <Box
                key={c.key}
                sx={{
                  width: c.w, flexShrink: 0, borderRight: `1px solid ${MSP.border}`, boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', justifyContent: c.align === 'center' ? 'center' : 'flex-start',
                  px: '6px', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden',
                }}
              >
                {c.label}
              </Box>
            ))}
          </Box>
          {rows.map((row) => {
            const sel = selectedIds ? selectedIds.has(row.task.id) : row.task.id === selectedId;
            const focus = row.task.id === selectedId;
            const hl = row.task.highlight ? TASK_HIGHLIGHTS[row.task.highlight] : null;
            const hit = !!filterHits?.has(row.task.id);
            const rowBg = sel ? MSP.selBg : hit ? '#FFF6BF' : hl || '#fff';
            return (
              <Box
                key={row.task.id}
                draggable={!!onReorder}
                onDragStart={(e) => startRowDrag(e, row)}
                onDragOver={(e) => overRow(e, row)}
                onDrop={(e) => dropOnRow(e, row)}
                onDragEnd={endRowDrag}
                onMouseDown={(e) => { if (e.button === 0) onSelect(row.task.id, e); }}
                onDoubleClick={() => onOpen(row.task)}
                onContextMenu={(e) => { if (!sel) onSelect(row.task.id); onRowContextMenu(e, row); }}
                sx={{
                  height: GANTT_ROW_H, width: colX, display: 'flex', bgcolor: rowBg, cursor: 'default',
                  outline: focus && selectedIds && selectedIds.size > 1 ? '1px dotted #1F6FD1' : 'none', outlineOffset: -1,
                  opacity: dragRow?.id === row.task.id ? 0.45 : 1,
                  ...dropLine(row.task.id),
                }}
              >
                {cols.map((c) => (
                  <Box
                    key={c.key}
                    sx={{
                      width: c.w, flexShrink: 0, boxSizing: 'border-box',
                      borderRight: `1px solid ${MSP.border}`, borderBottom: `1px solid ${MSP.border}`,
                      display: 'flex', alignItems: 'center',
                      justifyContent: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start',
                      px: '6px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      ...(c.key === 'id' ? {
                        bgcolor: hl || (sel ? MSP.idSelBg : MSP.headerBg), color: MSP.subText, cursor: onReorder ? 'grab' : 'default',
                        boxShadow: hit ? 'inset 3px 0 0 #E0B400' : 'none',
                      } : {}),
                    }}
                  >
                    {cell(row, c)}
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>

        {/* ── Divider bar ──────────────────────────────────────────────── */}
        <Box
          onMouseDown={(e) => {
            e.preventDefault();
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            setSplitDrag({ x: e.clientX, w: gridW });
          }}
          sx={{
            position: 'sticky', left: gridW, zIndex: 4, width: SPLITTER_W, flexShrink: 0, cursor: 'col-resize',
            bgcolor: MSP.splitter, borderLeft: `1px solid ${MSP.border}`, borderRight: `1px solid ${MSP.border}`, boxSizing: 'border-box',
          }}
        />

        {/* ── Chart ────────────────────────────────────────────────────── */}
        <Box sx={{ position: 'relative', width: timelineW, flexShrink: 0 }}>
          <Box sx={{ position: 'sticky', top: 0, zIndex: 2, height: HEADER_H, bgcolor: '#fff', borderBottom: `1px solid ${MSP.border}` }}>
            <Box sx={{ position: 'relative', height: TIER_H, borderBottom: `1px solid ${MSP.border}` }}>
              {top.map((s) => tierCell(s, 'left'))}
            </Box>
            <Box sx={{ position: 'relative', height: TIER_H - 1 }}>
              {bottom.map((s) => tierCell(s, 'center'))}
            </Box>
          </Box>

          <Box sx={{ position: 'relative', height: bodyH }}>
            {nonWorking.map((d) => (
              <Box key={`nw-${d}`} sx={{ position: 'absolute', top: 0, left: d * dayW, width: dayW, height: bodyH, bgcolor: MSP.nonWorking, pointerEvents: 'none' }} />
            ))}

            {rows.map((row, i) => (
              <Box
                key={row.task.id}
                onMouseDown={(e) => { if (e.button === 0) onSelect(row.task.id, e); }}
                onDoubleClick={() => onOpen(row.task)}
                onContextMenu={(e) => { if (!(selectedIds ? selectedIds.has(row.task.id) : row.task.id === selectedId)) onSelect(row.task.id); onRowContextMenu(e, row); }}
                sx={{
                  position: 'absolute', left: 0, top: i * GANTT_ROW_H, width: timelineW, height: GANTT_ROW_H,
                  bgcolor: (selectedIds ? selectedIds.has(row.task.id) : row.task.id === selectedId)
                    ? 'rgba(92,141,209,0.12)'
                    : filterHits?.has(row.task.id) ? 'rgba(255,214,0,0.14)' : 'transparent',
                  ...(dropHint?.id === row.task.id ? {
                    '&::after': {
                      content: '""', position: 'absolute', left: 0, right: 0, height: 2, bgcolor: '#1F6FD1', zIndex: 2, pointerEvents: 'none',
                      ...(dropHint.pos === 'above' ? { top: -1 } : { bottom: -1 }),
                    },
                  } : {}),
                }}
              >
                {renderBaseline(row)}
                {renderBar(row)}
              </Box>
            ))}

            {links.length > 0 && (
              <svg style={{ position: 'absolute', top: 0, left: 0, width: timelineW, height: bodyH, pointerEvents: 'none', overflow: 'visible' }}>
                <defs>
                  <marker id="msp-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill={MSP.link} />
                  </marker>
                  <marker id="msp-arrow-crit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill={MSP.critLink} />
                  </marker>
                </defs>
                {links.map((l) => (
                  <path
                    key={l.key} d={l.d} fill="none"
                    stroke={l.crit ? MSP.critLink : MSP.link} strokeWidth={1}
                    markerEnd={l.crit ? 'url(#msp-arrow-crit)' : 'url(#msp-arrow)'}
                  />
                ))}
              </svg>
            )}

            {todayX !== null && (
              <Box sx={{ position: 'absolute', top: 0, left: todayX, height: bodyH, borderLeft: `1px dashed ${MSP.today}`, pointerEvents: 'none' }} />
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
