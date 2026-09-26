import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { Box, Tooltip } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import CheckIcon from '@mui/icons-material/Check';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { ScheduleTask } from '../../types/ScheduleTask';
import type { TreeRow } from '../../utils/calcsheet/scheduleTree';
import { daysBetween, durationOf, toDate, todayStr, workingDaysBetween } from '../../utils/calcsheet/scheduleDates';

export type GanttZoom = 'day' | 'week' | 'month';
export const ZOOM_DAY_WIDTH: Record<GanttZoom, number> = { day: 24, week: 8, month: 3 };
export const GANTT_ROW_H = 24;
export const GANTT_GRID_MAX_W = 868;

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
  summary: '#262626',
  link: '#4472C4',
  critLink: '#C00000',
  nonWorking: '#EFEFEF',
  today: '#E07B00',
  splitter: '#E4E4E4',
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
  { key: 'pct', label: '% Complete', w: 80, align: 'right' },
  { key: 'cat', label: 'Category', w: 110 },
];

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "Mon 9/28/26" — MS Project's default date format.
export function mspDate(s: string): string {
  const d = toDate(s);
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${wd} ${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

function dayAt(start: Date, i: number): Date {
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
}

function weekStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

interface Seg { key: string; label: string; left: number; width: number }

// Group consecutive days sharing a key into one timescale cell.
function buildTier(start: Date, totalDays: number, dayW: number, keyOf: (d: Date) => string, labelOf: (d: Date) => string): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = dayAt(start, i);
    const key = keyOf(d);
    const last = out[out.length - 1];
    if (last && last.key === key) last.width += dayW;
    else out.push({ key, label: labelOf(d), left: i * dayW, width: dayW });
  }
  return out;
}

function tiersFor(zoom: GanttZoom, start: Date, totalDays: number, dayW: number): { top: Seg[]; bottom: Seg[] } {
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
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (t: ScheduleTask) => void;
  onRowContextMenu: (e: ReactMouseEvent, row: TreeRow) => void;
  onBarMouseDown: (e: ReactMouseEvent, t: ScheduleTask, mode: 'move' | 'resize') => void;
  draggingTaskId: string | null;
  gridWidth: number;
  onGridWidthChange: (w: number) => void;
  /** Bump `n` to scroll the timeline to task `id` (MS Project's "Scroll to Task"). */
  scrollRequest: { id: string; n: number } | null;
}

export default function MsProjectGantt({
  rows, idNumbers, range, totalDays, zoom, workingDays, criticalIds, isOverdue,
  collapsed, onToggleCollapse, selectedId, onSelect, onOpen, onRowContextMenu,
  onBarMouseDown, draggingTaskId, gridWidth, onGridWidthChange, scrollRequest,
}: MsProjectGanttProps) {
  const dayW = ZOOM_DAY_WIDTH[zoom];
  const timelineW = totalDays * dayW;
  const bodyH = rows.length * GANTT_ROW_H;
  const scrollRef = useRef<HTMLDivElement>(null);

  const { top, bottom } = useMemo(() => tiersFor(zoom, range.start, totalDays, dayW), [zoom, range.start, totalDays, dayW]);

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
    const width = Math.max(dayW, durationOf(t.startDate, t.endDate) * dayW);
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
          const yEnd = down ? si * GANTT_ROW_H + BAR_TOP - 1 : si * GANTT_ROW_H + BAR_TOP + BAR_H + 1;
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
  }, [rows, range, dayW, criticalIds]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Splitter between the grid and the chart, like MS Project's divider bar.
  const [splitDrag, setSplitDrag] = useState<{ x: number; w: number } | null>(null);
  useEffect(() => {
    if (!splitDrag) return undefined;
    const move = (e: MouseEvent) => {
      const next = Math.min(GANTT_GRID_MAX_W, Math.max(160, splitDrag.w + e.clientX - splitDrag.x));
      onGridWidthChange(next);
    };
    const up = () => { setSplitDrag(null); document.body.style.userSelect = ''; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [splitDrag, onGridWidthChange]);

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
        if (icons.length === 0) return null;
        const tip = [
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
              {t.name}
            </Box>
          </Box>
        );
      case 'dur': return <Box component="span" sx={{ fontWeight: row.isSummary ? 700 : 400 }}>{durationLabel(row)}</Box>;
      case 'start': return <Box component="span" sx={{ fontWeight: row.isSummary ? 700 : 400 }}>{mspDate(t.startDate)}</Box>;
      case 'finish': return <Box component="span" sx={{ fontWeight: row.isSummary ? 700 : 400 }}>{mspDate(t.endDate)}</Box>;
      case 'pred': return (t.predecessors || []).map((p) => idNumbers.get(p)).filter((n) => n != null).join(',');
      case 'pct': return `${Math.round(t.progressPct || 0)}%`;
      case 'cat': return row.isSummary ? '' : (t.category || '');
      default: return null;
    }
  };

  const tierCell = (s: Seg, align: 'left' | 'center') => (
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
      {!row.isSummary && draggingTaskId === null && <Box sx={{ opacity: 0.75, mt: 0.5 }}>Drag to move · drag right edge to change duration</Box>}
    </Box>
  );

  const renderBar = (row: TreeRow) => {
    const t = row.task;
    const { left, width } = barGeom(t);
    const crit = criticalIds.has(t.id);
    const dragging = draggingTaskId === t.id;

    if (row.isSummary) {
      return (
        <Tooltip title={tipFor(t, row)} followCursor>
          <Box sx={{ position: 'absolute', left, width, top: BAR_TOP, height: BAR_H + 2 }}>
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
                position: 'absolute', left: cx - 6, top: BAR_TOP, width: 12, height: 12,
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
    return (
      <>
        <Tooltip title={dragging ? '' : tipFor(t, row)} followCursor>
          <Box
            onMouseDown={(e) => onBarMouseDown(e, t, 'move')}
            onDoubleClick={() => onOpen(t)}
            sx={{
              position: 'absolute', left, width, top: BAR_TOP, height: BAR_H, boxSizing: 'border-box',
              bgcolor: crit ? MSP.critBar : MSP.bar, border: `1px solid ${crit ? MSP.critEdge : MSP.barEdge}`,
              cursor: dragging ? 'grabbing' : 'grab',
              boxShadow: dragging ? '0 0 0 2px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            {pct > 0 && (
              <Box sx={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', height: 4, width: `${pct}%`, bgcolor: crit ? MSP.critProgress : MSP.progress }} />
            )}
            <Box
              onMouseDown={(e) => onBarMouseDown(e, t, 'resize')}
              sx={{ position: 'absolute', right: -3, top: -2, width: 8, height: BAR_H + 2, cursor: 'ew-resize' }}
            />
          </Box>
        </Tooltip>
        {t.category && (
          <Box sx={{ position: 'absolute', left: left + width + 6, top: 0, height: GANTT_ROW_H, display: 'flex', alignItems: 'center', fontSize: 11, color: MSP.text, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {t.category}
          </Box>
        )}
      </>
    );
  };

  const colX = COLS.reduce((s, c) => s + c.w, 0);

  return (
    <Box
      ref={scrollRef}
      sx={{ flex: 1, overflow: 'auto', position: 'relative', bgcolor: '#fff', border: `1px solid ${MSP.border}`, fontFamily: MSP.font, color: MSP.text, fontSize: 12, userSelect: 'none' }}
    >
      <Box sx={{ display: 'flex', width: gridWidth + SPLITTER_W + timelineW, minHeight: '100%' }}>
        {/* ── Entry table (grid) ───────────────────────────────────────── */}
        <Box sx={{ position: 'sticky', left: 0, zIndex: 3, width: gridWidth, flexShrink: 0, overflow: 'clip', bgcolor: '#fff' }}>
          <Box sx={{ position: 'sticky', top: 0, zIndex: 1, height: HEADER_H, width: colX, bgcolor: MSP.headerBg, borderBottom: `1px solid ${MSP.border}`, display: 'flex' }}>
            {COLS.map((c) => (
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
            const sel = row.task.id === selectedId;
            return (
              <Box
                key={row.task.id}
                onMouseDown={() => onSelect(row.task.id)}
                onDoubleClick={() => onOpen(row.task)}
                onContextMenu={(e) => { onSelect(row.task.id); onRowContextMenu(e, row); }}
                sx={{ height: GANTT_ROW_H, width: colX, display: 'flex', bgcolor: sel ? MSP.selBg : '#fff', cursor: 'default' }}
              >
                {COLS.map((c) => (
                  <Box
                    key={c.key}
                    sx={{
                      width: c.w, flexShrink: 0, boxSizing: 'border-box',
                      borderRight: `1px solid ${MSP.border}`, borderBottom: `1px solid ${MSP.border}`,
                      display: 'flex', alignItems: 'center',
                      justifyContent: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start',
                      px: '6px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      ...(c.key === 'id' ? { bgcolor: sel ? MSP.idSelBg : MSP.headerBg, color: MSP.subText } : {}),
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
            setSplitDrag({ x: e.clientX, w: gridWidth });
          }}
          sx={{
            position: 'sticky', left: gridWidth, zIndex: 4, width: SPLITTER_W, flexShrink: 0, cursor: 'col-resize',
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
                onMouseDown={() => onSelect(row.task.id)}
                onDoubleClick={() => onOpen(row.task)}
                onContextMenu={(e) => { onSelect(row.task.id); onRowContextMenu(e, row); }}
                sx={{
                  position: 'absolute', left: 0, top: i * GANTT_ROW_H, width: timelineW, height: GANTT_ROW_H,
                  bgcolor: row.task.id === selectedId ? 'rgba(92,141,209,0.12)' : 'transparent',
                }}
              >
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
