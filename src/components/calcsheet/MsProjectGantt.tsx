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
import { formatLink, linksOf } from '../../utils/calcsheet/scheduleLinks';
import { DEFAULT_COLUMNS, DEFAULT_DISPLAY, columnDef, type GanttColumn, type GanttDisplay } from '../../utils/calcsheet/ganttViews';
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
// ID and the indicator column are fixed; the rest come from the `columns` prop.
const FIXED_COLS: Col[] = [
  { key: 'id', label: '', w: 40, align: 'right' },
  { key: 'ind', label: <InfoOutlinedIcon sx={{ fontSize: 14, color: MSP.subText }} />, w: 26, align: 'center' },
];
export const GANTT_GRID_MAX_W = 2400;

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
  onBarMouseDown: (e: ReactMouseEvent, t: ScheduleTask, mode: 'move' | 'resize' | 'progress') => void;
  /** A link was drawn from one bar end to another (screen coords of the drop). */
  onLinkDraw?: (fromId: string, toId: string, fromEnd: 'start' | 'finish', toEnd: 'start' | 'finish', x: number, y: number) => void;
  /** A link line was double-clicked. */
  onLinkOpen?: (predId: string, succId: string, x: number, y: number) => void;
  /** Table columns after ID + indicators, in order, with widths. */
  columns?: GanttColumn[];
  /** Resize (drag a header edge) or reorder (drag a header) columns. */
  onColumnsChange?: (cols: GanttColumn[]) => void;
  /** What the chart draws (critical path / baseline are driven by their own props). */
  display?: GanttDisplay;
  /** Total float per leaf task (working days) for the Total Float column. */
  floatMap?: Map<string, number>;
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
  onBarMouseDown, draggingTaskId, gridWidth, onGridWidthChange, scrollRequest, baseline, onLinkDraw, onLinkOpen,
  columns = DEFAULT_COLUMNS, onColumnsChange, display = DEFAULT_DISPLAY, floatMap,
}: MsProjectGanttProps) {
  const cols: Col[] = [
    ...FIXED_COLS,
    ...columns
      .filter((c) => (c.key !== 'bfin' && c.key !== 'fvar') || !!baseline)
      .map((c) => { const d = columnDef(c.key); return { key: c.key, label: d.label, w: c.w, align: d.align }; }),
  ];
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
    if (dayW < 6 || !display.weekends) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < totalDays; i++) {
      const g = dayAt(range.start, i).getDay();
      if (g === 0 || g === 6) out.push(i);
    }
    return out;
  }, [range.start, totalDays, dayW, display.weekends]);

  const todayX = useMemo(() => {
    if (!display.today) return null;
    const t = toDate(todayStr());
    if (t < range.start || t > range.end) return null;
    return daysBetween(range.start, t) * dayW + dayW / 2;
  }, [range, dayW, display.today]);

  const barGeom = (t: ScheduleTask) => {
    const left = daysBetween(range.start, toDate(t.startDate)) * dayW;
    const half = t.startDate === t.endDate && !t.isMilestone && t.durationDays != null && t.durationDays > 0 && t.durationDays < 1;
    const width = half ? Math.max(2, t.durationDays! * dayW) : Math.max(dayW, durationOf(t.startDate, t.endDate) * dayW);
    return { left, width };
  };

  // Links drawn the MS Project way. FS: out of the predecessor's finish,
  // across to just inside the successor's start, then down onto the bar (or a
  // zig-zag back to its left edge when it starts earlier). SS / FF / SF leave
  // from and arrive at the matching bar ends, looping round the outside.
  const links = useMemo(() => {
    const idx = new Map(rows.map((r, i) => [r.task.id, i]));
    const out: { key: string; d: string; crit: boolean; predId: string; succId: string; label: string }[] = [];
    if (!display.dependencies) return out;
    rows.forEach((row, si) => {
      const s = row.task;
      linksOf(s).forEach((l) => {
        const pi = idx.get(l.id);
        if (pi === undefined || pi === si) return;
        const p = rows[pi].task;
        const pg = barGeom(p);
        const sg = barGeom(s);
        const pStart = p.isMilestone ? pg.left + dayW / 2 - 6 : pg.left;
        const pEnd = p.isMilestone ? pg.left + dayW / 2 + 6 : pg.left + pg.width;
        const sStart = s.isMilestone ? sg.left + dayW / 2 - 6 : sg.left;
        const sEnd = s.isMilestone ? sg.left + dayW / 2 + 6 : sg.left + sg.width;
        const y1 = pi * GANTT_ROW_H + GANTT_ROW_H / 2;
        const y2 = si * GANTT_ROW_H + GANTT_ROW_H / 2;
        const down = si > pi;
        const mid = (down ? pi + 1 : pi) * GANTT_ROW_H;
        let d: string;
        if (l.type === 'SS') {
          const xL = Math.min(pStart, sStart) - 8;
          d = `M ${pStart} ${y1} H ${xL} V ${y2} H ${sStart - 1}`;
        } else if (l.type === 'FF') {
          const xR = Math.max(pEnd, sEnd) + 8;
          d = `M ${pEnd} ${y1} H ${xR} V ${y2} H ${sEnd + 1}`;
        } else if (l.type === 'SF') {
          d = `M ${pStart} ${y1} H ${pStart - 8} V ${mid} H ${sEnd + 8} V ${y2} H ${sEnd + 1}`;
        } else {
          const sX = s.isMilestone ? sg.left + dayW / 2 : sg.left;
          const inset = s.isMilestone ? 0 : Math.min(5, sg.width / 2);
          if (sX + inset >= pEnd + 2) {
            const yEnd = down ? si * GANTT_ROW_H + barTop - 1 : si * GANTT_ROW_H + barTop + barH + 1;
            d = `M ${pEnd} ${y1} H ${sX + inset} V ${yEnd}`;
          } else {
            d = `M ${pEnd} ${y1} h 6 V ${mid} H ${sX - 8} V ${y2} H ${sX - 1}`;
          }
        }
        out.push({
          key: `${l.id}-${s.id}`, d, crit: criticalIds.has(l.id) && criticalIds.has(s.id), predId: l.id, succId: s.id,
          label: `${formatLink(idNumbers.get(l.id) ?? '?', l)} → ${idNumbers.get(s.id) ?? '?'}`,
        });
      });
    });
    return out;
  }, [rows, range, dayW, criticalIds, barTop, barH, idNumbers, display.dependencies]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw a link: drag from the dot at a bar's start/finish onto another bar
  // (its left half = start, right half = finish).
  const bodyRef = useRef<HTMLDivElement>(null);
  type LinkDragState = { fromId: string; fromEnd: 'start' | 'finish'; x0: number; y0: number; x: number; y: number };
  const [linkDrag, setLinkDrag] = useState<LinkDragState | null>(null);
  // Latest rows / geometry for the window listeners of an in-progress drag.
  const linkCtx = useRef<{ rows: TreeRow[]; barGeom: typeof barGeom; onLinkDraw: typeof onLinkDraw }>({ rows, barGeom, onLinkDraw });
  linkCtx.current = { rows, barGeom, onLinkDraw };
  const linkTargetFor = (d: LinkDragState, x: number, y: number): { row: TreeRow; end: 'start' | 'finish' } | null => {
    const { rows: rs, barGeom: geom } = linkCtx.current;
    const row = rs[Math.floor(y / GANTT_ROW_H)];
    if (!row || row.task.id === d.fromId) return null;
    const g = geom(row.task);
    return { row, end: row.task.isMilestone || x < g.left + g.width / 2 ? 'start' : 'finish' };
  };
  const linkTarget = (x: number, y: number) => (linkDrag ? linkTargetFor(linkDrag, x, y) : null);
  // Listeners go on at mousedown (not in an effect) so even a quick drag is caught.
  const startLinkDrag = (e: ReactMouseEvent, t: ScheduleTask, end: 'start' | 'finish', x0: number, rowIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    let cur: LinkDragState = { fromId: t.id, fromEnd: end, x0, y0: rowIdx * GANTT_ROW_H + GANTT_ROW_H / 2, x: e.clientX - rect.left, y: e.clientY - rect.top };
    setLinkDrag(cur);
    document.body.style.cursor = 'crosshair';
    const rel = (ev: MouseEvent) => {
      const r = bodyRef.current?.getBoundingClientRect() ?? rect;
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const move = (ev: MouseEvent) => { cur = { ...cur, ...rel(ev) }; setLinkDrag(cur); };
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      const p = rel(ev);
      const tgt = linkTargetFor(cur, p.x, p.y);
      setLinkDrag(null);
      if (tgt) linkCtx.current.onLinkDraw?.(cur.fromId, tgt.row.task.id, cur.fromEnd, tgt.end, ev.clientX, ev.clientY);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

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

  // Column reorder (drag a header) and resize (drag a header's right edge).
  const [colDrag, setColDrag] = useState<string | null>(null);
  const [colDrop, setColDrop] = useState<{ key: string; before: boolean } | null>(null);
  const moveColumn = (from: string, to: string, before: boolean) => {
    if (!onColumnsChange || from === to) return;
    const moving = columns.find((c) => c.key === from);
    if (!moving) return;
    const rest = columns.filter((c) => c.key !== from);
    const at = rest.findIndex((c) => c.key === to);
    if (at < 0) return;
    onColumnsChange([...rest.slice(0, before ? at : at + 1), moving, ...rest.slice(before ? at : at + 1)]);
  };
  const colsRef = useRef(columns);
  colsRef.current = columns;
  const startColResize = (e: ReactMouseEvent, key: string, w0: number) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const min = key === 'name' ? 120 : 44;
    const move = (ev: MouseEvent) => {
      const w = Math.max(min, Math.round(w0 + ev.clientX - x0));
      onColumnsChange?.(colsRef.current.map((c) => (c.key === key ? { ...c, w } : c)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

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
      case 'pred': return linksOf(t).filter((l) => idNumbers.has(l.id)).map((l) => formatLink(idNumbers.get(l.id) as number, l)).join(',');
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
      case 'float': {
        const f = row.isSummary ? undefined : floatMap?.get(t.id);
        if (f == null) return '';
        return <Box component="span" sx={{ color: f <= 0 ? MSP.late : MSP.text, fontWeight: f <= 0 ? 600 : 400 }}>{`${f} day${f === 1 ? '' : 's'}`}</Box>;
      }
      case 'notes': return t.notes ? <Tooltip title={t.notes}><span>{t.notes}</span></Tooltip> : '';
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
      {!row.isSummary && draggingTaskId === null && (
        <Box sx={{ opacity: 0.75, mt: 0.5 }}>Drag to move · right edge = duration · ▲ below = % complete · end dots = link</Box>
      )}
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

  // Hover handles: link dots at the bar ends, % complete grip below the bar.
  const linkDot = (t: ScheduleTask, end: 'start' | 'finish', cx: number, rowIdx: number) => (
    onLinkDraw ? (
      <Tooltip title={`Drag to link from this task's ${end}`} disableInteractive>
        <Box
          className="gantt-h"
          onMouseDown={(e) => startLinkDrag(e, t, end, cx, rowIdx)}
          sx={{
            position: 'absolute', left: cx - 5, top: barTop + barH / 2 - 5, width: 10, height: 10, borderRadius: '50%',
            bgcolor: '#fff', border: `2px solid ${MSP.link}`, boxSizing: 'border-box', cursor: 'crosshair', zIndex: 2,
          }}
        />
      </Tooltip>
    ) : null
  );

  const renderBar = (row: TreeRow, rowIdx: number) => {
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
            {display.taskLabels ? `${toDate(t.startDate).getMonth() + 1}/${toDate(t.startDate).getDate()}` : ''}
          </Box>
          {linkDot(t, 'finish', cx - 16, rowIdx)}
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
            {display.progress && pct > 0 && (
              <Box sx={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', height: 4, width: `${pct}%`, bgcolor: crit ? MSP.critProgress : manual ? MSP.manualProgress : MSP.progress }} />
            )}
            <Box
              onMouseDown={(e) => onBarMouseDown(e, t, 'resize')}
              sx={{ position: 'absolute', right: -3, top: -2, width: 8, height: barH + 2, cursor: 'ew-resize' }}
            />
          </Box>
        </Tooltip>
        {display.progress && <Tooltip title={`${Math.round(pct)}% complete — drag to change`} disableInteractive>
          <Box
            className="gantt-h"
            onMouseDown={(e) => onBarMouseDown(e, t, 'progress')}
            sx={{
              position: 'absolute', left: left + (width * pct) / 100 - 5, top: barTop + barH - 1, width: 10, height: 8, cursor: 'col-resize', zIndex: 2,
              '&::after': { content: '""', position: 'absolute', left: 1, top: 1, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: `6px solid ${MSP.progress}` },
            }}
          />
        </Tooltip>}
        {linkDot(t, 'start', left - 9, rowIdx)}
        {linkDot(t, 'finish', left + width + 11, rowIdx)}
        {(() => {
          const label = [display.taskLabels ? t.category : '', display.manpowerLabels && (t.manpower || 0) > 0 ? `[${t.manpower}]` : ''].filter(Boolean).join(' ');
          return label ? (
            <Box sx={{ position: 'absolute', left: left + width + 6, top: 0, height: GANTT_ROW_H, display: 'flex', alignItems: 'center', fontSize: 11, color: MSP.text, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
              {label}
            </Box>
          ) : null;
        })()}
      </>
    );
  };

  return (
    <Box
      ref={scrollRef}
      sx={{ flex: 1, minWidth: 0, overflow: 'auto', position: 'relative', bgcolor: '#fff', border: `1px solid ${MSP.border}`, fontFamily: MSP.font, color: MSP.text, fontSize: 12, userSelect: 'none' }}
    >
      <Box sx={{ display: 'flex', width: gridW + SPLITTER_W + timelineW, minHeight: '100%' }}>
        {/* ── Entry table (grid) ───────────────────────────────────────── */}
        <Box sx={{ position: 'sticky', left: 0, zIndex: 3, width: gridW, flexShrink: 0, overflow: 'clip', bgcolor: '#fff' }}>
          <Box sx={{ position: 'sticky', top: 0, zIndex: 1, height: HEADER_H, width: colX, bgcolor: MSP.headerBg, borderBottom: `1px solid ${MSP.border}`, display: 'flex' }}>
            {cols.map((c) => {
              const movable = !!onColumnsChange && c.key !== 'id' && c.key !== 'ind';
              const drop = colDrop?.key === c.key ? colDrop : null;
              return (
                <Box
                  key={c.key}
                  draggable={movable}
                  onDragStart={(e) => { if (!movable) return; e.dataTransfer.setData('text/plain', c.key); e.dataTransfer.effectAllowed = 'move'; setColDrag(c.key); }}
                  onDragOver={(e) => {
                    if (!colDrag || !movable || colDrag === c.key) return;
                    e.preventDefault();
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const before = e.clientX < r.left + r.width / 2;
                    if (colDrop?.key !== c.key || colDrop.before !== before) setColDrop({ key: c.key, before });
                  }}
                  onDrop={(e) => { e.preventDefault(); if (colDrag && colDrop) moveColumn(colDrag, colDrop.key, colDrop.before); setColDrag(null); setColDrop(null); }}
                  onDragEnd={() => { setColDrag(null); setColDrop(null); }}
                  title={movable ? 'Drag to move · drag the right edge to resize' : undefined}
                  sx={{
                    position: 'relative', width: c.w, flexShrink: 0, borderRight: `1px solid ${MSP.border}`, boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: c.align === 'center' ? 'center' : 'flex-start',
                    px: '6px', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', cursor: movable ? 'grab' : 'default',
                    opacity: colDrag === c.key ? 0.5 : 1,
                    boxShadow: drop ? (drop.before ? 'inset 3px 0 0 #1F6FD1' : 'inset -3px 0 0 #1F6FD1') : 'none',
                  }}
                >
                  {c.label}
                  {movable && (
                    <Box
                      draggable={false}
                      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onMouseDown={(e) => startColResize(e, c.key, c.w)}
                      sx={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', '&:hover': { bgcolor: 'rgba(31,111,209,0.25)' } }}
                    />
                  )}
                </Box>
              );
            })}
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

          <Box ref={bodyRef} sx={{ position: 'relative', height: bodyH }}>
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
                  '& .gantt-h': { opacity: 0, transition: 'opacity .1s' },
                  '&:hover .gantt-h': { opacity: linkDrag ? 0 : 1 },
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
                {renderBar(row, i)}
              </Box>
            ))}

            {(links.length > 0 || linkDrag) && (
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
                {/* Wider invisible hit lines: double-click a link to edit or delete it. */}
                {onLinkOpen && !linkDrag && links.map((l) => (
                  <path
                    key={`hit-${l.key}`} d={l.d} fill="none" stroke="transparent" strokeWidth={7}
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onDoubleClick={(e) => onLinkOpen(l.predId, l.succId, e.clientX, e.clientY)}
                  >
                    <title>{`Link ${l.label} — double-click to edit`}</title>
                  </path>
                ))}
                {linkDrag && (() => {
                  const tgt = linkTarget(linkDrag.x, linkDrag.y);
                  const ti = tgt ? rows.indexOf(tgt.row) : -1;
                  return (
                    <>
                      {tgt && <rect x={0} y={ti * GANTT_ROW_H} width={timelineW} height={GANTT_ROW_H} fill="rgba(68,114,196,0.10)" />}
                      <line x1={linkDrag.x0} y1={linkDrag.y0} x2={linkDrag.x} y2={linkDrag.y} stroke={MSP.link} strokeWidth={1.5} strokeDasharray="4 3" />
                      <circle cx={linkDrag.x} cy={linkDrag.y} r={3} fill={MSP.link} />
                    </>
                  );
                })()}
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
