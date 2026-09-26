import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, LinearProgress, Menu, MenuItem, Paper, Slider, Stack, TextField,
  Tab, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, Typography, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import HistoryIcon from '@mui/icons-material/History';
import SaveIcon from '@mui/icons-material/Save';
import UndoIcon from '@mui/icons-material/Undo';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import BalanceIcon from '@mui/icons-material/Balance';
import BorderColorIcon from '@mui/icons-material/BorderColor';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import SearchIcon from '@mui/icons-material/Search';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import FlagIcon from '@mui/icons-material/Flag';
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag';
import { useQuotationStore } from '../../store/quotationStore';
import type { ServiceLine, Quotation } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { blurNumberInputOnWheel } from '../../utils/calcsheet/numberInput';
import {
  MS_PER_DAY, addDays, daysBetween, durationOf, fmt, formatLocalDate, toDate, todayStr,
  addWorkingDays, nextWorkingDay, workingDaysBetween,
} from '../../utils/calcsheet/scheduleDates';
import { exportScheduleXlsx } from '../../utils/calcsheet/scheduleXlsxExport';
import type { ScheduleExportData } from '../../utils/calcsheet/schedulePdfExport';
import { autoSchedule, wouldCycle, criticalPath } from '../../utils/calcsheet/scheduleAuto';
import { rollUp, flattenTree, leafTasks, descendantIds, type TreeRow } from '../../utils/calcsheet/scheduleTree';
import { durationWeight, leafWeights, projectPercent } from '../../utils/calcsheet/scheduleWeights';
import MsProjectGantt, { GANTT_GRID_MAX_W, ZOOM_DAY_WIDTH, type GanttZoom } from './MsProjectGantt';
import ScheduleSCurve from './ScheduleSCurve';
import ScheduleExportDialog from './ScheduleExportDialog';
import { baselineFromVersion, finishVariance, matchBaseline, varianceLabel, type ScheduleBaseline } from '../../utils/calcsheet/scheduleBaseline';
import type { SCurveSnapshot } from '../../utils/calcsheet/scheduleSCurve';
import {
  SCHEDULE_CATEGORY_COLORS, SCHEDULE_TASK_CATEGORIES, TASK_HIGHLIGHTS, type ScheduleTask, type TaskHighlight,
} from '../../types/ScheduleTask';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
  accent1: '#4f7bc8',
  accent2: '#3c6ba5',
  success: '#00b894',
  warning: '#fdcb6e',
  error: '#e84393',
  info: '#74b9ff',
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('netpacific_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: authHeaders(), body: body !== undefined ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'API error');
  }
  return res.json();
}

// MS Project-style highlight filters: matching tasks are tinted, not hidden.
type HighlightFilter = 'none' | 'critical' | 'overdue' | 'dueSoon' | 'inProgress' | 'notStarted' | 'completed' | 'milestones';
const HIGHLIGHT_FILTERS: { value: HighlightFilter; label: string }[] = [
  { value: 'none', label: 'No highlight filter' },
  { value: 'critical', label: 'Critical tasks' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'dueSoon', label: 'Due in next 7 days' },
  { value: 'inProgress', label: 'In progress' },
  { value: 'notStarted', label: 'Not started' },
  { value: 'completed', label: 'Completed' },
  { value: 'milestones', label: 'Milestones' },
];

const SHORTCUTS: [string, string][] = [
  ['↑ / ↓', 'Select previous / next task'],
  ['Shift + ↑ / ↓', 'Extend the selection'],
  ['Shift + click · Ctrl/⌘ + click', 'Select a range · add/remove a task'],
  ['Home / End', 'First / last task'],
  ['Ctrl/⌘ + A', 'Select all tasks'],
  ['← / →', 'Collapse / expand a phase (← on a task jumps to its phase)'],
  ['Enter · F2 · double-click', 'Task Information (edit)'],
  ['Insert · Ctrl/⌘ + Enter', 'Insert a new task below the selected one'],
  ['Delete · Backspace', 'Delete the selected task(s)'],
  ['Alt + Shift + → / ←', 'Indent / outdent'],
  ['Alt + Shift + ↑ / ↓', 'Move the task up / down'],
  ['H', 'Highlight the selected task(s) (press again to clear)'],
  ['S', 'Scroll the chart to the selected task'],
  ['Ctrl/⌘ + F', 'Find a task (Enter = next, Shift + Enter = previous)'],
  ['= / −', 'Zoom the timescale in / out'],
  ['Esc', 'Clear the selection'],
  ['?', 'Show these shortcuts'],
];

interface TaskFormState {
  name: string;
  category: string;
  startDate: string;
  durationDays: number;
  progressPct: number;
  isMilestone: boolean;
  notes: string;
  predecessors: string[];
  /** Predecessors as typed row IDs, e.g. "3, 5" (MS Project style). */
  predText: string;
  mode: 'auto' | 'manual';
  /** Finish date — entered directly for manually scheduled tasks. */
  finishDate: string;
  parentId: string | null;
  manpower: number;
  weight: number;
}

// Durations are whole or half days (min 0.5).
const normDuration = (v: number): number => Math.max(0.5, Math.round((Number(v) || 0) * 2) / 2);

const emptyForm = (): TaskFormState => ({
  name: '', category: 'Engineering', startDate: todayStr(), durationDays: 1, progressPct: 0, isMilestone: false, notes: '', predecessors: [], predText: '', mode: 'auto', finishDate: todayStr(), parentId: null, manpower: 0, weight: 0,
});

// Best-effort category guess from a service line's description, so imported
// items land in a sensible color-coded bucket without forcing the user to
// re-categorize every row. Falls back to 'Other' — always editable afterward.
function guessCategory(description: string): string {
  const d = description.toLowerCase();
  if (/program|plc|hmi|scada|software/.test(d)) return 'Programming';
  if (/commission/.test(d)) return 'Commissioning';
  if (/install|wiring|mounting/.test(d)) return 'Installation';
  if (/fabricat|panel/.test(d)) return 'Fabrication';
  if (/procure|purchas|deliver/.test(d)) return 'Procurement';
  if (/design|engineer/.test(d)) return 'Engineering';
  return 'Other';
}

interface ScheduleVersion {
  id: string;
  projectId: string;
  savedAt: string;
  savedBy: string | null;
  label: string | null;
  taskCount: number;
  overallProgress: number;
  /** The project's baseline (at most one) — see utils/calcsheet/scheduleBaseline. */
  isBaseline?: boolean;
}

interface DiffRow {
  name: string;
  status: 'changed' | 'added' | 'removed';
  startDelta?: number;
  endDelta?: number;
  baseProg?: number;
  curProg?: number;
}

export interface WorkScheduleGanttProps {
  /** The id whose tasks this Gantt loads (calcsheet project id OR monitoring project id). */
  projectId: string;
  code: string;
  name: string;
  /** Where the back arrow navigates to. */
  backHref: string;
  /** When provided (calcsheet side), enables "Import from Calcsheet". Omit on monitoring. */
  quotationsForImport?: Quotation[];
}

// Shared Work Schedule Gantt — used by both the calcsheet proposal schedule
// (CalcsheetProjectSchedule) and the monitoring project schedule
// (ProjectSchedulePage). Task storage is keyed only by projectId, so the same
// endpoints serve either id namespace.
export function WorkScheduleGantt({ projectId, code, name, backHref, quotationsForImport }: WorkScheduleGanttProps) {
  const id = projectId;
  const quotations = useMemo(() => quotationsForImport ?? [], [quotationsForImport]);

  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ScheduleTask | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importQuotationId, setImportQuotationId] = useState('');
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const [importDurations, setImportDurations] = useState<Record<string, number>>({});
  const [importStartDate, setImportStartDate] = useState(todayStr());
  const [importBusy, setImportBusy] = useState(false);
  const [importErr, setImportErr] = useState('');

  // View filters (quick wins): narrow the rows shown without touching the data
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set()); // empty = all
  const [milestonesOnly, setMilestonesOnly] = useState(false);
  const [showCritical, setShowCritical] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // collapsed summary ids

  // MS Project-style view state: timescale zoom, grid/chart divider, selected
  // row, right-click menu, and "Scroll to Task" requests.
  const [zoom, setZoom] = useState<GanttZoom>(() => {
    try { const v = localStorage.getItem('gantt-zoom'); return v === 'week' || v === 'month' ? v : 'day'; } catch { return 'day'; }
  });
  useEffect(() => { try { localStorage.setItem('gantt-zoom', zoom); } catch { /* ignore */ } }, [zoom]);
  const dayW = ZOOM_DAY_WIDTH[zoom];
  const dayWRef = useRef(dayW);
  useEffect(() => { dayWRef.current = dayW; }, [dayW]);
  const [gridWidth, setGridWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('gantt-grid-w')); return v >= 160 && v <= GANTT_GRID_MAX_W ? v : 582; } catch { return 582; }
  });
  useEffect(() => { try { localStorage.setItem('gantt-grid-w', String(gridWidth)); } catch { /* ignore */ } }, [gridWidth]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; row: TreeRow } | null>(null);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [weightDraft, setWeightDraft] = useState<Record<string, number>>({});
  const [weightsSaving, setWeightsSaving] = useState(false);
  const [scrollReq, setScrollReq] = useState<{ id: string; n: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);
  const [revealReq, setRevealReq] = useState<{ id: string; n: number } | null>(null);
  const [hlFilter, setHlFilter] = useState<HighlightFilter>('none');
  const [lastHighlight, setLastHighlight] = useState<TaskHighlight>(() => {
    try { const v = localStorage.getItem('gantt-hl'); return v && v in TASK_HIGHLIGHTS ? v as TaskHighlight : 'yellow'; } catch { return 'yellow'; }
  });
  const [hlMenu, setHlMenu] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bulkDelete, setBulkDelete] = useState<ScheduleTask[] | null>(null);
  const insertAfterRef = useRef<ScheduleTask | null>(null);
  const [view, setView] = useState<'gantt' | 'scurve'>(() => {
    try { return localStorage.getItem('gantt-view') === 'scurve' ? 'scurve' : 'gantt'; } catch { return 'gantt'; }
  });
  useEffect(() => { try { localStorage.setItem('gantt-view', view); } catch { /* ignore */ } }, [view]);

  // Saved versions double as dated status snapshots for the S-Curve's actual line.
  const loadSnapshots = async (): Promise<SCurveSnapshot[]> => {
    const r = await api<{ success: boolean; versions: ScheduleVersion[] }>('GET', `/api/schedule-versions?projectId=${encodeURIComponent(id)}`);
    return Promise.all((r.versions || []).map(async (v) => {
      const d = await api<{ success: boolean; version: { tasks?: ScheduleTask[] } }>('GET', `/api/schedule-versions/${v.id}`);
      return { date: formatLocalDate(new Date(v.savedAt)), tasks: d.version.tasks || [] };
    }));
  };

  // Working-day calendar: durations & auto-scheduling skip weekends. Persisted per project.
  const [workingDays, setWorkingDays] = useState<boolean>(() => {
    try { const v = localStorage.getItem(`gantt-wd-${id}`); return v === null ? true : v === '1'; } catch { return true; }
  });
  const wdRef = useRef(workingDays);
  useEffect(() => {
    wdRef.current = workingDays;
    try { localStorage.setItem(`gantt-wd-${id}`, workingDays ? '1' : '0'); } catch { /* ignore */ }
  }, [workingDays, id]);

  // Version history (named schedule snapshots / baselines)
  const [saveVerOpen, setSaveVerOpen] = useState(false);
  const [verLabel, setVerLabel] = useState('');
  const [savingVer, setSavingVer] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Compare (baseline vs current)
  const [compareVersion, setCompareVersion] = useState<ScheduleVersion | null>(null);
  const [compareTasks, setCompareTasks] = useState<ScheduleTask[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  // Baseline: the version flagged isBaseline, shown as grey bars + variance.
  const [baseline, setBaseline] = useState<ScheduleBaseline | null>(null);
  const [showBaseline, setShowBaseline] = useState<boolean>(() => {
    try { return localStorage.getItem('gantt-show-baseline') !== '0'; } catch { return true; }
  });
  useEffect(() => { try { localStorage.setItem('gantt-show-baseline', showBaseline ? '1' : '0'); } catch { /* ignore */ } }, [showBaseline]);
  const [saveAsBaseline, setSaveAsBaseline] = useState(false);
  const loadBaseline = async () => {
    if (!id) return;
    try {
      const r = await api<{ success: boolean; versions: ScheduleVersion[] }>('GET', `/api/schedule-versions?projectId=${encodeURIComponent(id)}`);
      const b = (r.versions || []).find((v) => v.isBaseline);
      if (!b) { setBaseline(null); return; }
      const d = await api<{ success: boolean; version: ScheduleVersion & { tasks?: ScheduleTask[] } }>('GET', `/api/schedule-versions/${b.id}`);
      setBaseline(baselineFromVersion(d.version));
    } catch { /* baseline is optional — the Gantt works without it */ }
  };
  useEffect(() => { void loadBaseline(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => {
    if (!id) return;
    setLoading(true);
    setErr('');
    api<{ success: boolean; tasks: ScheduleTask[] }>('GET', `/api/schedule-tasks?projectId=${encodeURIComponent(id)}`)
      .then((r) => setTasks(r.tasks || []))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load schedule'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.order ?? 0) - (b.order ?? 0)),
    [tasks],
  );

  const range = useMemo(() => {
    // Span the LEAF tasks (they define the true project extent; summaries roll up within).
    const leaves = leafTasks(tasks);
    if (leaves.length === 0) {
      const start = toDate(todayStr());
      const end = new Date(start.getTime() + 27 * MS_PER_DAY);
      return { start, end };
    }
    let min = toDate(leaves[0].startDate);
    let max = toDate(leaves[0].endDate);
    for (const t of leaves) {
      const s = toDate(t.startDate);
      const e = toDate(t.endDate);
      if (s < min) min = s;
      if (e > max) max = e;
    }
    // Snap to whole timescale units (weeks, or months when zoomed out) like MS
    // Project, with a little lead-in so the first bar doesn't touch the edge,
    // and run the chart out far enough that it never looks cut short.
    min = new Date(min.getFullYear(), min.getMonth(), min.getDate() - 2);
    max = new Date(max.getFullYear(), max.getMonth(), max.getDate() + 2);
    if (zoom === 'month') {
      min = new Date(min.getFullYear(), min.getMonth(), 1);
      max = new Date(max.getFullYear(), max.getMonth() + 1, 0);
    } else {
      min = new Date(min.getFullYear(), min.getMonth(), min.getDate() - min.getDay());
      max = new Date(max.getFullYear(), max.getMonth(), max.getDate() + (6 - max.getDay()));
    }
    const minDays = Math.ceil(1400 / ZOOM_DAY_WIDTH[zoom]);
    if (daysBetween(min, max) < minDays) max = new Date(min.getFullYear(), min.getMonth(), min.getDate() + minDays);
    return { start: min, end: max };
  }, [tasks, zoom]);

  const totalDays = Math.max(1, daysBetween(range.start, range.end) + 1);

  const todayDate = useMemo(() => toDate(todayStr()), []);

  // A dated (non-milestone) task is overdue when its end date has passed and
  // it isn't finished.
  const isOverdue = (t: ScheduleTask) => !t.isMilestone && t.progressPct < 100 && toDate(t.endDate) < todayDate;

  const categoriesInUse = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) set.add(t.category || 'Other');
    return SCHEDULE_TASK_CATEGORIES.filter((c) => set.has(c));
  }, [tasks]);

  // WBS: summary tasks carry rolled-up dates/progress; rows are the flattened
  // tree (respecting collapse) after the category / milestones-only filters.
  const rolledTasks = useMemo(() => rollUp(tasks), [tasks]);
  const baselineMap = useMemo(() => matchBaseline(rolledTasks, baseline), [rolledTasks, baseline]);
  const visibleRows = useMemo(() => {
    const rows = flattenTree(rolledTasks, collapsed);
    return rows.filter((r) => {
      if (r.isSummary) return true; // keep structure even if children are filtered
      if (milestonesOnly && !r.task.isMilestone) return false;
      if (categoryFilter.size > 0 && !categoryFilter.has(r.task.category || 'Other')) return false;
      return true;
    });
  }, [rolledTasks, collapsed, milestonesOnly, categoryFilter]);

  // Tasks matching the highlight filter (tinted in the table, not hidden).
  const filterHits = useMemo(() => {
    if (hlFilter === 'none') return undefined;
    const leaves = leafTasks(tasks);
    const crit = hlFilter === 'critical' ? criticalPath(leaves, workingDays) : null;
    const today = todayStr();
    const soon = addDays(today, 7);
    const out = new Set<string>();
    for (const t of leaves) {
      const pc = t.progressPct || 0;
      const hit = hlFilter === 'critical' ? !!crit?.has(t.id)
        : hlFilter === 'overdue' ? isOverdue(t)
          : hlFilter === 'dueSoon' ? pc < 100 && t.endDate >= today && t.endDate <= soon
            : hlFilter === 'inProgress' ? pc > 0 && pc < 100
              : hlFilter === 'notStarted' ? pc === 0 && !t.isMilestone
                : hlFilter === 'completed' ? pc >= 100
                  : hlFilter === 'milestones' ? t.isMilestone : false;
      if (hit) out.add(t.id);
    }
    return out;
  }, [hlFilter, tasks, workingDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // MS Project row IDs: position in the fully expanded outline, so they stay
  // stable when summaries are collapsed or rows are filtered out.
  const idNumbers = useMemo(
    () => new Map(flattenTree(rolledTasks, new Set()).map((r, i) => [r.task.id, i + 1])),
    [rolledTasks],
  );

  // Critical path over LEAF tasks (summaries roll up, aren't scheduled).
  const criticalIds = useMemo(
    () => (showCritical ? criticalPath(leafTasks(tasks), workingDays) : new Set<string>()),
    [showCritical, tasks, workingDays],
  );

  // Project-level roll-up — over leaf tasks so summaries aren't double-counted.
  const summary = useMemo(() => {
    const leaves = leafTasks(tasks);
    if (leaves.length === 0) return null;
    let minStart = leaves[0].startDate;
    let maxEnd = leaves[0].endDate;
    let overdue = 0;
    for (const t of leaves) {
      if (t.startDate < minStart) minStart = t.startDate;
      if (t.endDate > maxEnd) maxEnd = t.endDate;
      if (isOverdue(t)) overdue += 1;
    }
    return {
      start: minStart,
      end: maxEnd,
      durationDays: daysBetween(toDate(minStart), toDate(maxEnd)) + 1,
      pctComplete: Math.round(projectPercent(tasks) ?? 0),
      overdue,
    };
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Baseline finish vs current finish (project level).
  const baselineSummary = useMemo(() => {
    if (!baseline || !summary) return null;
    const leaves = leafTasks(baseline.tasks);
    if (leaves.length === 0) return null;
    const end = leaves.reduce((m, t) => (t.endDate > m ? t.endDate : m), leaves[0].endDate);
    return { end, variance: finishVariance(summary.end, end, workingDays) };
  }, [baseline, summary, workingDays]);

  // Each task's share of project progress (%), phases = sum of their tasks.
  const weightInfo = useMemo(() => {
    const { mode, weights, total } = leafWeights(tasks);
    const share = new Map<string, number>();
    weights.forEach((w, tid) => share.set(tid, total > 0 ? (w / total) * 100 : 0));
    const byId = new Map(tasks.map((t) => [t.id, t]));
    weights.forEach((_, tid) => {
      let p = byId.get(tid)?.parentId;
      const pct = share.get(tid) || 0;
      while (p && byId.has(p)) { share.set(p, (share.get(p) || 0) + pct); p = byId.get(p)?.parentId; }
    });
    const unweighted = mode === 'manual' ? leafTasks(tasks).filter((t) => !(Number(t.weight) > 0)).length : 0;
    return { mode, share, total, unweighted };
  }, [tasks]);

  const toggleCategoryFilter = (c: string) => setCategoryFilter((prev) => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });

  // ── WBS hierarchy ───────────────────────────────────────────────────────
  const toggleCollapse = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Indent: nest under the nearest preceding row at the same depth.
  const indentTask = async (row: TreeRow) => {
    const idx = visibleRows.findIndex((r) => r.task.id === row.task.id);
    let parent: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (visibleRows[i].depth === row.depth) { parent = visibleRows[i].task.id; break; }
      if (visibleRows[i].depth < row.depth) break;
    }
    if (!parent) return;
    const p = parent;
    try {
      await api('PUT', `/api/schedule-tasks/${row.task.id}`, { parentId: p });
      setTasks((prev) => prev.map((t) => (t.id === row.task.id ? { ...t, parentId: p } : t)));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Indent failed'); }
  };

  // ── Progress weights dialog ───────────────────────────────────────────
  const openWeights = () => {
    const d: Record<string, number> = {};
    leafTasks(tasks).forEach((t) => { d[t.id] = Math.max(0, Number(t.weight) || 0); });
    setWeightDraft(d);
    setWeightsOpen(true);
  };
  // Weights as percentages summing to 100 (2 dp), from a raw per-task basis.
  const toPercents = (basis: Record<string, number>) => {
    const total = Object.values(basis).reduce((a, b) => a + b, 0);
    const out: Record<string, number> = {};
    Object.entries(basis).forEach(([k, v]) => { out[k] = total > 0 ? Math.round((v / total) * 10000) / 100 : 0; });
    return out;
  };
  const saveWeights = async () => {
    const changed = leafTasks(tasks).filter((t) => (Math.max(0, Number(t.weight) || 0)) !== (weightDraft[t.id] || 0));
    setWeightsSaving(true);
    try {
      await Promise.all(changed.map((t) => api('PUT', `/api/schedule-tasks/${t.id}`, { weight: weightDraft[t.id] || 0 })));
      setTasks((prev) => prev.map((t) => (t.id in weightDraft ? { ...t, weight: weightDraft[t.id] || 0 } : t)));
      setWeightsOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save weights');
    } finally {
      setWeightsSaving(false);
    }
  };

  // ── Selection (single, Shift-range, Ctrl/⌘-toggle) ──────────────────
  const selectOne = (tid: string | null) => {
    setSelectedId(tid);
    setSelectedIds(tid ? new Set([tid]) : new Set());
    anchorRef.current = tid;
  };
  const selectRow = (tid: string, mods?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
    const order = visibleRows.map((r) => r.task.id);
    if (mods?.shiftKey && anchorRef.current && order.includes(anchorRef.current)) {
      const a = order.indexOf(anchorRef.current);
      const b = order.indexOf(tid);
      setSelectedIds(new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1)));
      setSelectedId(tid);
      return;
    }
    if (mods?.metaKey || mods?.ctrlKey) {
      setSelectedIds((prev) => { const n = new Set(prev); if (n.has(tid)) n.delete(tid); else n.add(tid); return n; });
      setSelectedId(tid);
      anchorRef.current = tid;
      return;
    }
    selectOne(tid);
  };
  const selectedTasks = tasks.filter((t) => selectedIds.has(t.id));

  // ── Highlight ────────────────────────────────────────────────────────
  const applyHighlight = async (color: TaskHighlight | null, targets: ScheduleTask[] = selectedTasks) => {
    if (targets.length === 0) return;
    const ids = new Set(targets.map((t) => t.id));
    const before = tasks;
    setTasks((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, highlight: color } : t)));
    if (color) {
      setLastHighlight(color);
      try { localStorage.setItem('gantt-hl', color); } catch { /* ignore */ }
    }
    try {
      await Promise.all(Array.from(ids).map((tid) => api('PUT', `/api/schedule-tasks/${tid}`, { highlight: color })));
    } catch (e) {
      setTasks(before);
      setErr(e instanceof Error ? e.message : 'Failed to save highlight');
    }
  };

  // ── Find ─────────────────────────────────────────────────────────────
  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as string[];
    return flattenTree(rolledTasks, new Set()).filter((r) => r.task.name.toLowerCase().includes(q)).map((r) => r.task.id);
  }, [search, rolledTasks]);
  const gotoMatch = (dir: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const cur = selectedId ? searchMatches.indexOf(selectedId) : -1;
    const next = cur < 0 ? (dir === 1 ? 0 : searchMatches.length - 1) : (cur + dir + searchMatches.length) % searchMatches.length;
    const tid = searchMatches[next];
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const ancestors: string[] = [];
    let p = byId.get(tid)?.parentId ?? null;
    while (p) { ancestors.push(p); p = byId.get(p)?.parentId ?? null; }
    if (ancestors.some((a) => collapsed.has(a))) {
      setCollapsed((prev) => { const n = new Set(prev); ancestors.forEach((a) => n.delete(a)); return n; });
    }
    selectOne(tid);
    setScrollReq((pr) => ({ id: tid, n: (pr?.n ?? 0) + 1 }));
  };

  // ── Keyboard shortcuts (see SHORTCUTS) ───────────────────────────────
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (view !== 'gantt') return;
    if (dialogOpen || deleteTarget || bulkDelete || weightsOpen || importOpen || saveVerOpen || historyOpen || compareVersion || helpOpen || ctxMenu || hlMenu || pdfOpen) return;
    const target = e.target as HTMLElement | null;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    if (target && target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;

    const order = visibleRows.map((r) => r.task.id);
    const idx = selectedId ? order.indexOf(selectedId) : -1;
    const row = idx >= 0 ? visibleRows[idx] : null;
    const raw = row ? tasks.find((t) => t.id === row.task.id) || row.task : null;
    const go = (i: number, extend: boolean) => {
      if (order.length === 0) return;
      const tid = order[Math.max(0, Math.min(order.length - 1, i))];
      if (extend) selectRow(tid, { shiftKey: true }); else selectOne(tid);
      setRevealReq((pr) => ({ id: tid, n: (pr?.n ?? 0) + 1 }));
    };

    if (e.altKey && e.shiftKey && row) {
      if (e.key === 'ArrowRight') { e.preventDefault(); void indentTask(row); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); void outdentTask(row); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const parent = row.task.parentId ?? null;
        const sibs = flattenTree(rolledTasks, new Set()).map((r) => r.task).filter((t) => (t.parentId ?? null) === parent);
        const k = sibs.findIndex((t) => t.id === row.task.id);
        const other = sibs[e.key === 'ArrowUp' ? k - 1 : k + 1];
        if (other) void moveTask(row.task.id, other.id, e.key === 'ArrowUp' ? 'above' : 'below', false);
        return;
      }
    }

    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); go(idx < 0 ? 0 : idx + 1, e.shiftKey); return;
      case 'ArrowUp': e.preventDefault(); go(idx < 0 ? 0 : idx - 1, e.shiftKey); return;
      case 'Home': e.preventDefault(); go(0, e.shiftKey); return;
      case 'End': e.preventDefault(); go(order.length - 1, e.shiftKey); return;
      case 'ArrowLeft':
        if (!row) return;
        e.preventDefault();
        if (row.hasChildren && !collapsed.has(row.task.id)) toggleCollapse(row.task.id);
        else if (row.task.parentId && order.includes(row.task.parentId)) go(order.indexOf(row.task.parentId), false);
        return;
      case 'ArrowRight':
        if (!row || !row.hasChildren) return;
        e.preventDefault();
        if (collapsed.has(row.task.id)) toggleCollapse(row.task.id); else go(idx + 1, false);
        return;
      case 'Enter':
        if (mod) { e.preventDefault(); openAdd(raw); return; }
        if (raw) { e.preventDefault(); openEdit(raw); }
        return;
      case 'F2': if (raw) { e.preventDefault(); openEdit(raw); } return;
      case 'Insert': e.preventDefault(); openAdd(raw); return;
      case 'Delete':
      case 'Backspace':
        if (selectedTasks.length === 0) return;
        e.preventDefault();
        if (selectedTasks.length === 1) setDeleteTarget(selectedTasks[0]); else setBulkDelete(selectedTasks);
        return;
      case 'Escape': selectOne(null); return;
      case '?': e.preventDefault(); setHelpOpen(true); return;
      case '=': case '+': e.preventDefault(); setZoom((z) => (z === 'month' ? 'week' : 'day')); return;
      case '-': case '_': e.preventDefault(); setZoom((z) => (z === 'day' ? 'week' : 'month')); return;
      default: break;
    }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelectedIds(new Set(order)); if (!selectedId && order[0]) setSelectedId(order[0]); return; }
    if (!mod && !e.altKey && e.key.toLowerCase() === 'h' && selectedTasks.length) {
      e.preventDefault();
      const all = selectedTasks.every((t) => t.highlight === lastHighlight);
      void applyHighlight(all ? null : lastHighlight);
      return;
    }
    if (!mod && !e.altKey && e.key.toLowerCase() === 's' && raw) {
      e.preventDefault();
      setScrollReq((pr) => ({ id: raw.id, n: (pr?.n ?? 0) + 1 }));
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Drag-to-reorder: place `dragId` above/below `targetId` as its sibling
  // (dragging a phase carries its subtasks). Dropping just below an expanded
  // phase's header makes the task that phase's first subtask, matching where
  // the drop line is drawn.
  const moveTask = async (dragId: string, targetId: string, pos: 'above' | 'below', allowInto = true) => {
    if (dragId === targetId || descendantIds(tasks, dragId).has(targetId)) return;
    const target = tasks.find((t) => t.id === targetId);
    if (!target) return;
    const intoPhase = allowInto && pos === 'below' && tasks.some((t) => t.parentId === targetId) && !collapsed.has(targetId);
    const newParent = intoPhase ? targetId : (target.parentId ?? null);
    const outline = flattenTree(rolledTasks, new Set()).map((r) => r.task.id);
    const sibs = outline.filter((tid) => {
      const t = tasks.find((x) => x.id === tid);
      return t && (t.parentId ?? null) === newParent && tid !== dragId;
    });
    const at = intoPhase ? 0 : sibs.indexOf(targetId) + (pos === 'below' ? 1 : 0);
    const nextOrder = [...sibs.slice(0, at), dragId, ...sibs.slice(at)];

    const before = tasks;
    const updated = tasks.map((t) => {
      const i = nextOrder.indexOf(t.id);
      if (i < 0) return t;
      return { ...t, order: i, ...(t.id === dragId ? { parentId: newParent } : {}) };
    });
    const changed = updated.filter((t) => {
      const o = before.find((x) => x.id === t.id);
      return o && ((o.order ?? 0) !== (t.order ?? 0) || (o.parentId ?? null) !== (t.parentId ?? null));
    });
    if (changed.length === 0) return;
    setTasks(updated);
    selectOne(dragId);
    try {
      await Promise.all(changed.map((t) => api('PUT', `/api/schedule-tasks/${t.id}`, {
        order: t.order, ...(t.id === dragId ? { parentId: t.parentId ?? null } : {}),
      })));
    } catch (e) {
      setTasks(before);
      setErr(e instanceof Error ? e.message : 'Failed to move task');
    }
  };

  // Outdent: move up one level (new parent = current grandparent, or top level).
  const outdentTask = async (row: TreeRow) => {
    const cur = tasks.find((t) => t.id === row.task.id);
    if (!cur || !cur.parentId) return;
    const grand = tasks.find((t) => t.id === cur.parentId)?.parentId ?? null;
    try {
      await api('PUT', `/api/schedule-tasks/${row.task.id}`, { parentId: grand });
      setTasks((prev) => prev.map((t) => (t.id === row.task.id ? { ...t, parentId: grand } : t)));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Outdent failed'); }
  };

  // Insert a task; with `after`, it lands right below that task in the same
  // phase, starting the working day after it finishes.
  const openAdd = (after?: ScheduleTask | null) => {
    insertAfterRef.current = after ?? null;
    setEditingId(null);
    setForm({
      ...emptyForm(),
      ...(after ? (() => { const sd = nextWorkingDay(addDays(after.endDate, 1), workingDays); return { parentId: after.parentId ?? null, category: after.category || 'Engineering', startDate: sd, finishDate: sd }; })() : {}),
    });
    setFormErr('');
    setDialogOpen(true);
  };

  const openEdit = (t: ScheduleTask) => {
    setEditingId(t.id);
    setForm({
      name: t.name, category: t.category || 'Other', startDate: t.startDate,
      durationDays: t.isMilestone ? 1 : (t.durationDays ?? workingDaysBetween(t.startDate, t.endDate, workingDays)),
      progressPct: t.progressPct, isMilestone: t.isMilestone, notes: t.notes || '',
      predecessors: t.predecessors || [],
      predText: (t.predecessors || []).map((p) => idNumbers.get(p)).filter((n) => n != null).join(', '),
      mode: t.mode ?? 'auto',
      finishDate: t.endDate,
      parentId: t.parentId ?? null,
      manpower: t.manpower ?? 0,
      weight: t.weight ?? 0,
    });
    setFormErr('');
    setDialogOpen(true);
  };

  // Apply finish-to-start auto-scheduling over `working`, update state, and
  // persist every task whose dates the scheduler shifted.
  const cascade = async (working: ScheduleTask[]) => {
    const scheduled = autoSchedule(working, wdRef.current);
    setTasks(scheduled);
    const wById = new Map(working.map((t) => [t.id, t]));
    const changed = scheduled.filter((t) => {
      const w = wById.get(t.id);
      return w && (w.startDate !== t.startDate || w.endDate !== t.endDate);
    });
    await Promise.all(changed.map((t) =>
      api('PUT', `/api/schedule-tasks/${t.id}`, { startDate: t.startDate, endDate: t.endDate }).catch(() => {}),
    ));
  };

  // Re-apply the whole schedule under a new working-day setting: recompute each
  // task's end from its duration, cascade dependencies, and persist what moved.
  const applyCalendar = async (nextWd: boolean) => {
    const oldWd = wdRef.current;
    const working = tasks.map((t) => {
      if (t.isMilestone) return { ...t, endDate: t.startDate };
      if (t.mode === 'manual') return t;
      const dur = t.durationDays ?? workingDaysBetween(t.startDate, t.endDate, oldWd);
      return { ...t, durationDays: dur, endDate: addWorkingDays(t.startDate, dur, nextWd) };
    });
    const scheduled = autoSchedule(working, nextWd);
    setTasks(scheduled);
    const orig = new Map(tasks.map((t) => [t.id, t]));
    const changed = scheduled.filter((t) => {
      const o = orig.get(t.id);
      return !o || o.startDate !== t.startDate || o.endDate !== t.endDate || (o.durationDays ?? null) !== (t.durationDays ?? null);
    });
    await Promise.all(changed.map((t) =>
      api('PUT', `/api/schedule-tasks/${t.id}`, { startDate: t.startDate, endDate: t.endDate, durationDays: t.durationDays }).catch(() => {}),
    ));
  };

  // Predecessors typed as row IDs ("3, 5") → task ids, with validation.
  const parsePredecessors = (text: string, selfId: string | null): { ids: string[]; error: string } => {
    const byNumber = new Map(Array.from(idNumbers.entries()).map(([tid, n]) => [n, tid]));
    const summaryIds = new Set(tasks.filter((t) => t.parentId).map((t) => t.parentId as string));
    const ids: string[] = [];
    for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
      if (!/^\d+$/.test(part)) return { ids, error: `"${part}" isn't a row number` };
      const tid = byNumber.get(Number(part));
      if (!tid) return { ids, error: `There's no row ${part}` };
      if (tid === selfId) return { ids, error: `Row ${part} is this task` };
      if (summaryIds.has(tid)) return { ids, error: `Row ${part} is a phase — link to one of its tasks` };
      if (selfId && wouldCycle(tasks, selfId, tid)) return { ids, error: `Row ${part} would create a circular link` };
      if (!ids.includes(tid)) ids.push(tid);
    }
    return { ids, error: '' };
  };

  const save = async () => {
    if (!form.name.trim()) { setFormErr('Task name is required.'); return; }
    const predCheck = parsePredecessors(form.predText, editingId);
    if (predCheck.error) { setFormErr(`Predecessors: ${predCheck.error}.`); return; }
    // Manual tasks keep the dates as entered; auto tasks derive the finish from
    // the duration (and the scheduler then moves them after their predecessors).
    const manual = form.mode === 'manual';
    const startDate = manual ? form.startDate : nextWorkingDay(form.startDate, workingDays);
    if (manual && !form.isMilestone && form.finishDate < startDate) { setFormErr('Finish date must be on or after the start date.'); return; }
    const endDate = form.isMilestone ? startDate
      : manual ? form.finishDate
        : addWorkingDays(startDate, normDuration(form.durationDays), workingDays);
    const duration = form.isMilestone ? 1 : manual ? workingDaysBetween(startDate, endDate, workingDays) : normDuration(form.durationDays);
    const payload = {
      mode: form.mode,
      name: form.name, category: form.category, startDate, endDate, durationDays: duration,
      progressPct: form.progressPct, isMilestone: form.isMilestone, notes: form.notes,
      predecessors: form.predecessors, parentId: form.parentId,
      manpower: form.isMilestone ? 0 : Math.max(0, Math.round((form.manpower || 0) * 10) / 10),
      weight: Math.max(0, Number(form.weight) || 0),
    };
    setSaving(true);
    setFormErr('');
    try {
      let working: ScheduleTask[];
      if (editingId) {
        const r = await api<{ success: boolean; task: ScheduleTask }>('PUT', `/api/schedule-tasks/${editingId}`, payload);
        working = tasks.map((t) => (t.id === editingId ? r.task : t));
      } else {
        const after = insertAfterRef.current;
        const sameParent = !!after && (after.parentId ?? null) === (form.parentId ?? null);
        const r = await api<{ success: boolean; task: ScheduleTask }>('POST', '/api/schedule-tasks', {
          ...payload, projectId: id, order: sameParent && after ? (after.order ?? 0) + 0.5 : tasks.length,
        });
        working = [...tasks, r.task];
        if (sameParent) {
          // Renumber the phase's tasks to whole numbers with the new one in place.
          const sibs = working
            .filter((t) => (t.parentId ?? null) === (r.task.parentId ?? null))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          const moved = sibs.filter((t, i) => (t.order ?? 0) !== i);
          const orderOf = new Map(sibs.map((t, i) => [t.id, i]));
          working = working.map((t) => (orderOf.has(t.id) ? { ...t, order: orderOf.get(t.id) ?? t.order } : t));
          await Promise.all(moved.map((t) => api('PUT', `/api/schedule-tasks/${t.id}`, { order: orderOf.get(t.id) }).catch(() => {})));
        }
        selectOne(r.task.id);
      }
      await cascade(working);
      insertAfterRef.current = null;
      setDialogOpen(false);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Delete tasks, strip them from successors' predecessors, then re-schedule.
  const deleteTasks = async (goneIds: string[]) => {
    const gone = new Set(goneIds);
    try {
      await Promise.all(goneIds.map((tid) => api('DELETE', `/api/schedule-tasks/${tid}`)));
      const affected: ScheduleTask[] = [];
      const working = tasks.filter((t) => !gone.has(t.id)).map((t) => {
        if (t.predecessors?.some((p) => gone.has(p))) {
          const next = { ...t, predecessors: t.predecessors.filter((p) => !gone.has(p)) };
          affected.push(next);
          return next;
        }
        return t;
      });
      await Promise.all(affected.map((t) =>
        api('PUT', `/api/schedule-tasks/${t.id}`, { predecessors: t.predecessors }).catch(() => {}),
      ));
      await cascade(working);
      setSelectedIds(new Set());
      setSelectedId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
      load();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const tid = deleteTarget.id;
    setDeleteTarget(null);
    await deleteTasks([tid]);
  };

  const defaultDurationsFor = (services: ServiceLine[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const s of services) out[s.id] = s.days && s.days > 0 ? Math.round(s.days) : 1;
    return out;
  };

  const openImport = () => {
    const preferred = quotations.find((q) => q.kind === 'IOCT') || quotations[0];
    const services = preferred?.services || [];
    setImportQuotationId(preferred?.id || '');
    setImportSelected(new Set(services.map((s) => s.id)));
    setImportDurations(defaultDurationsFor(services));
    setImportStartDate(todayStr());
    setImportErr('');
    setImportOpen(true);
  };

  const importQuotation = quotations.find((q) => q.id === importQuotationId);
  const importServices = importQuotation?.services || [];

  const toggleImportSelected = (sid: string) => {
    setImportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  };

  const runImport = async () => {
    const rows = importServices.filter((s) => importSelected.has(s.id));
    if (rows.length === 0) { setImportErr('Select at least one work item to import.'); return; }
    setImportBusy(true);
    setImportErr('');
    try {
      let cursor = importStartDate;
      const created: ScheduleTask[] = [];
      let orderCursor = tasks.length;
      for (const s of rows) {
        const duration = Math.max(1, Math.round(importDurations[s.id]) || 1);
        const startDate = nextWorkingDay(cursor, workingDays);
        const endDate = addWorkingDays(startDate, duration, workingDays);
        const r = await api<{ success: boolean; task: ScheduleTask }>('POST', '/api/schedule-tasks', {
          projectId: id,
          name: s.description || 'Untitled work item',
          category: guessCategory(s.description || ''),
          startDate,
          endDate,
          durationDays: duration,
          progressPct: 0,
          isMilestone: false,
          order: orderCursor++,
        });
        created.push(r.task);
        cursor = nextWorkingDay(addDays(endDate, 1), workingDays);
      }
      setTasks((prev) => [...prev, ...created]);
      setImportOpen(false);
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImportBusy(false);
    }
  };

  const [exportErr, setExportErr] = useState('');
  const [exportBusy, setExportBusy] = useState<'xlsx' | 'pdf' | null>(null);

  const runExportXlsx = async () => {
    setExportBusy('xlsx');
    setExportErr('');
    try {
      await exportScheduleXlsx({ code, name }, flattenTree(rolledTasks, new Set()).map((r) => r.task));
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : 'Excel export failed');
    } finally {
      setExportBusy(null);
    }
  };

  // PDF export goes through the Export dialog (settings + live preview).
  const [pdfOpen, setPdfOpen] = useState(false);
  const exportRows = useMemo(() => (pdfOpen ? flattenTree(rolledTasks, new Set()) : []), [pdfOpen, rolledTasks]);
  const loadExportData = async (): Promise<ScheduleExportData> => ({
    workingDays,
    // Always computed, so the dialog's Critical path toggle works even when it's off on the page.
    criticalIds: criticalPath(leafTasks(tasks), workingDays),
    snapshots: await loadSnapshots().catch(() => []),
    baseline,
  });

  // ── Version history ─────────────────────────────────────────────────────
  const saveVersion = async () => {
    setSavingVer(true);
    try {
      await api('POST', '/api/schedule-versions', { projectId: id, label: verLabel.trim() || undefined, baseline: saveAsBaseline || undefined });
      setSaveVerOpen(false);
      setVerLabel('');
      if (saveAsBaseline) { setShowBaseline(true); await loadBaseline(); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save version');
    } finally {
      setSavingVer(false);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryErr('');
    try {
      const r = await api<{ success: boolean; versions: ScheduleVersion[] }>('GET', `/api/schedule-versions?projectId=${encodeURIComponent(id)}`);
      setVersions(r.versions || []);
    } catch (e) {
      setHistoryErr(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreVersion = async (v: ScheduleVersion) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Restore this version? Your current schedule will be replaced (a snapshot of it is saved first, so this is undoable).')) return;
    setRestoringId(v.id);
    try {
      await api('POST', `/api/schedule-versions/${v.id}/restore`);
      setHistoryOpen(false);
      load();
    } catch (e) {
      setHistoryErr(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoringId(null);
    }
  };

  const toggleBaseline = async (v: ScheduleVersion) => {
    const on = !v.isBaseline;
    if (on && versions.some((x) => x.isBaseline)) {
      // eslint-disable-next-line no-alert
      if (!window.confirm('Replace the current baseline with this version?')) return;
    }
    try {
      await api('POST', `/api/schedule-versions/${v.id}/baseline`, { on });
      setVersions((prev) => prev.map((x) => ({ ...x, isBaseline: on ? x.id === v.id : x.id === v.id ? false : x.isBaseline })));
      if (on) setShowBaseline(true);
      await loadBaseline();
    } catch (e) {
      setHistoryErr(e instanceof Error ? e.message : 'Failed to set baseline');
    }
  };

  const deleteVersion = async (v: ScheduleVersion) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(v.isBaseline
      ? 'This version is the baseline — deleting it removes the baseline too. Permanently delete it?'
      : 'Permanently delete this saved version? This cannot be undone.')) return;
    try {
      await api('DELETE', `/api/schedule-versions/${v.id}`);
      setVersions((prev) => prev.filter((x) => x.id !== v.id));
      if (v.isBaseline) setBaseline(null);
    } catch (e) {
      setHistoryErr(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const openCompare = async (v: ScheduleVersion) => {
    setCompareVersion(v);
    setCompareTasks([]);
    setCompareLoading(true);
    setHistoryOpen(false);
    try {
      const r = await api<{ success: boolean; version: { tasks?: ScheduleTask[] } }>('GET', `/api/schedule-versions/${v.id}`);
      setCompareTasks(r.version.tasks || []);
    } catch (e) {
      setHistoryErr(e instanceof Error ? e.message : 'Failed to load version');
      setCompareVersion(null);
    } finally {
      setCompareLoading(false);
    }
  };

  // Baseline (compareTasks) vs current (tasks), matched by task name.
  const diff = useMemo(() => {
    if (!compareVersion) return null;
    const curByName = new Map<string, ScheduleTask>();
    for (const c of tasks) if (!curByName.has(c.name)) curByName.set(c.name, c);
    const used = new Set<string>();
    const rows: DiffRow[] = [];
    for (const b of compareTasks) {
      const c = curByName.get(b.name);
      if (c) {
        used.add(c.id);
        rows.push({
          name: b.name, status: 'changed',
          startDelta: daysBetween(toDate(b.startDate), toDate(c.startDate)),
          endDelta: daysBetween(toDate(b.endDate), toDate(c.endDate)),
          baseProg: b.progressPct, curProg: c.progressPct,
        });
      } else {
        rows.push({ name: b.name, status: 'removed', baseProg: b.progressPct });
      }
    }
    for (const c of tasks) if (!used.has(c.id)) rows.push({ name: c.name, status: 'added', curProg: c.progressPct });
    const maxEnd = (arr: ScheduleTask[]) => arr.reduce((m, t) => (t.endDate > m ? t.endDate : m), arr[0]?.endDate || '');
    const baseFinish = maxEnd(compareTasks);
    const curFinish = maxEnd(tasks);
    const finishDelta = baseFinish && curFinish ? daysBetween(toDate(baseFinish), toDate(curFinish)) : 0;
    const slipped = rows.filter((r) => r.status === 'changed' && (r.endDelta || 0) !== 0).length;
    return { rows, finishDelta, slipped, baseProgress: compareVersion.overallProgress, curProgress: summary?.pctComplete ?? 0 };
  }, [compareVersion, compareTasks, tasks, summary]);

  // ── Drag-to-reschedule ─────────────────────────────────────────────────
  // Bars are draggable (move both dates together) and resizable from the
  // right edge (change duration only). Dragging updates `tasks` live for
  // instant visual feedback; the PUT to persist fires on mouseup, reading
  // the final dragged state off tasksRef (not the closure, which would be
  // stale by the time the listener runs).
  const tasksRef = useRef<ScheduleTask[]>(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const dragRef = useRef<{
    taskId: string;
    mode: 'move' | 'resize';
    startX: number;
    origStart: string;
    origEnd: string;
    isMilestone: boolean;
    offsetDays: number;
  } | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaX = e.clientX - d.startX;
      const offsetDays = Math.round(deltaX / dayWRef.current);
      if (offsetDays === d.offsetDays) return;
      d.offsetDays = offsetDays;
      setTasks((prev) => prev.map((t) => {
        if (t.id !== d.taskId) return t;
        if (d.mode === 'move') {
          const newStart = addDays(d.origStart, offsetDays);
          const newEnd = d.isMilestone ? newStart : addDays(d.origEnd, offsetDays);
          return { ...t, startDate: newStart, endDate: newEnd };
        }
        const newDuration = Math.max(1, durationOf(d.origStart, d.origEnd) + offsetDays);
        return { ...t, endDate: addDays(d.origStart, newDuration - 1) };
      }));
    };

    const handleMouseUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDraggingTaskId(null);
      document.body.style.userSelect = '';
      if (!d) return;
      const current = tasksRef.current.find((t) => t.id === d.taskId);
      if (!current) return;
      // A click without movement just selects the row (double-click opens
      // Task Information), matching MS Project.
      if (d.offsetDays === 0) {
        selectOne(current.id);
        return;
      }
      // Resizing changes the duration; recompute it from the new dates so it
      // stays the source of truth. Reflect it in state before the cascade.
      const dur = current.isMilestone ? 1 : workingDaysBetween(current.startDate, current.endDate, wdRef.current);
      const working = tasksRef.current.map((t) => (t.id === current.id ? { ...t, durationDays: dur } : t));
      setTasks(working);
      api('PUT', `/api/schedule-tasks/${current.id}`, { startDate: current.startDate, endDate: current.endDate, durationDays: dur })
        .then(() => cascade(working)) // shift any dependent tasks
        .catch((e) => {
          setErr(e instanceof Error ? e.message : 'Failed to save the new date');
          load();
        });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startDrag = (e: React.MouseEvent, task: ScheduleTask, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      taskId: task.id, mode, startX: e.clientX, origStart: task.startDate, origEnd: task.endDate,
      isMilestone: task.isMilestone, offsetDays: 0,
    };
    setDraggingTaskId(task.id);
    document.body.style.userSelect = 'none';
  };

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 2 }}>
      <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <IconButton size="small" component={Link} to={backHref}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
              Gantt Chart
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 5 }}>
            {code} — {name}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => void openHistory()}>
            History
          </Button>
          <Button
            variant="outlined" startIcon={<SaveIcon />} onClick={() => { setVerLabel(''); setSaveAsBaseline(false); setSaveVerOpen(true); }}
            disabled={sorted.length === 0}
          >
            Save version
          </Button>
          <Button
            variant="outlined" startIcon={<DescriptionIcon />} onClick={() => void runExportXlsx()}
            disabled={sorted.length === 0 || exportBusy !== null}
          >
            {exportBusy === 'xlsx' ? 'Exporting…' : 'Export Excel'}
          </Button>
          <Button
            variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => setPdfOpen(true)}
            disabled={sorted.length === 0 || exportBusy !== null}
          >
            Export PDF
          </Button>
          {quotations.length > 0 && (
            <Button
              variant="outlined" startIcon={<PlaylistAddIcon />} onClick={openImport}
            >
              Import from Calcsheet
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openAdd()} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>
            Add Task
          </Button>
        </Stack>
      </Box>

      {err && <Alert severity="error" sx={{ mb: 1.5 }}>{err}</Alert>}
      {exportErr && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setExportErr('')}>{exportErr}</Alert>}
      {loading && <LinearProgress sx={{ mb: 1.5 }} />}

      {/* Summary roll-up */}
      {summary && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap alignItems="center">
            {[
              { label: 'Start', value: fmt(toDate(summary.start)) },
              { label: 'Finish', value: fmt(toDate(summary.end)) },
              { label: 'Duration', value: `${summary.durationDays} day${summary.durationDays === 1 ? '' : 's'}` },
              { label: 'Tasks', value: String(tasks.length) },
            ].map((s) => (
              <Box key={s.label}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{s.label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.value}</Typography>
              </Box>
            ))}
            <Box sx={{ minWidth: 160 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Overall progress — {summary.pctComplete}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={summary.pctComplete}
                sx={{ height: 8, borderRadius: 4, mt: 0.5, '& .MuiLinearProgress-bar': { bgcolor: NET_PACIFIC_COLORS.success } }}
              />
            </Box>
            {baselineSummary ? (
              <>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Baseline finish</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{fmt(toDate(baselineSummary.end))}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Finish variance</Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: baselineSummary.variance > 0 ? 'error.main' : baselineSummary.variance < 0 ? 'success.main' : 'text.primary' }}
                  >
                    {varianceLabel(baselineSummary.variance)}{baselineSummary.variance > 0 ? ' late' : baselineSummary.variance < 0 ? ' early' : ''}
                  </Typography>
                </Box>
              </>
            ) : (
              <Tooltip title="Freeze the current plan as the baseline to track slippage against it">
                <Button
                  size="small" startIcon={<OutlinedFlagIcon />}
                  onClick={() => { setVerLabel('Baseline'); setSaveAsBaseline(true); setSaveVerOpen(true); }}
                >
                  Set baseline
                </Button>
              </Tooltip>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Overdue</Typography>
              <Chip
                size="small"
                label={summary.overdue}
                color={summary.overdue > 0 ? 'error' : 'default'}
                variant={summary.overdue > 0 ? 'filled' : 'outlined'}
              />
            </Box>
          </Stack>
        </Paper>
      )}

      {/* Filters */}
      {sorted.length > 0 && (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Show:</Typography>
          {categoriesInUse.map((c) => {
            const active = categoryFilter.size === 0 || categoryFilter.has(c);
            return (
              <Chip
                key={c}
                label={c}
                size="small"
                clickable
                onClick={() => toggleCategoryFilter(c)}
                variant={categoryFilter.size > 0 && categoryFilter.has(c) ? 'filled' : 'outlined'}
                sx={{
                  opacity: active ? 1 : 0.45,
                  borderColor: SCHEDULE_CATEGORY_COLORS[c],
                  ...(categoryFilter.size > 0 && categoryFilter.has(c)
                    ? { bgcolor: SCHEDULE_CATEGORY_COLORS[c], color: '#fff' }
                    : {}),
                }}
              />
            );
          })}
          {categoryFilter.size > 0 && (
            <Chip label="Clear" size="small" variant="outlined" onClick={() => setCategoryFilter(new Set())} />
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="When on, durations count working days and the whole schedule recomputes to skip weekends">
            <FormControlLabel
              control={<Checkbox size="small" checked={workingDays} onChange={(e) => { setWorkingDays(e.target.checked); void applyCalendar(e.target.checked); }} />}
              label={<Typography variant="body2">Working days</Typography>}
            />
          </Tooltip>
          <Tooltip title="Highlight the zero-slack tasks that drive the project finish date">
            <FormControlLabel
              control={<Checkbox size="small" checked={showCritical} onChange={(e) => setShowCritical(e.target.checked)} />}
              label={<Typography variant="body2">Critical path</Typography>}
            />
          </Tooltip>
          <Tooltip title={baseline ? `Grey bars show the baseline${baseline.label ? ` “${baseline.label}”` : ''} saved ${new Date(baseline.savedAt).toLocaleDateString()}` : 'No baseline yet — use Set baseline, or History → Set as baseline'}>
            <FormControlLabel
              disabled={!baseline}
              control={<Checkbox size="small" checked={!!baseline && showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} />}
              label={<Typography variant="body2">Baseline</Typography>}
            />
          </Tooltip>
          <FormControlLabel
            control={<Checkbox size="small" checked={milestonesOnly} onChange={(e) => setMilestonesOnly(e.target.checked)} />}
            label={<Typography variant="body2">Milestones only</Typography>}
          />
        </Stack>
      )}

      {!loading && sorted.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No schedule tasks yet. Add tasks to build the project timeline.</Typography>
        </Paper>
      )}

      {view === 'gantt' && sorted.length > 0 && visibleRows.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No tasks match the current filters.</Typography>
        </Paper>
      )}

      {sorted.length > 0 && (
        <Tabs value={view} onChange={(_, v) => setView(v)} sx={{ minHeight: 36, mb: 1, '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontWeight: 600 } }}>
          <Tab value="gantt" label="Gantt Chart" />
          <Tab value="scurve" label="S-Curve & Manpower" />
        </Tabs>
      )}

      {view === 'scurve' && sorted.length > 0 && (
        <ScheduleSCurve tasks={tasks} workingDays={workingDays} loadSnapshots={loadSnapshots} baselineTasks={showBaseline ? baseline?.tasks : undefined} />
      )}

      {view === 'gantt' && visibleRows.length > 0 && (() => {
        const selRow = visibleRows.find((r) => r.task.id === selectedId) || null;
        const tb = { size: 'small' as const, variant: 'text' as const, sx: { minWidth: 0, px: 1, color: 'text.primary', textTransform: 'none' } };
        return (
          <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Ribbon-style task toolbar, acting on the selected row */}
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#FAFAFA', flexWrap: 'wrap' }} useFlexGap>
              <Button {...tb} startIcon={<FormatIndentDecreaseIcon />} disabled={!selRow || !selRow.task.parentId} onClick={() => selRow && void outdentTask(selRow)}>Outdent</Button>
              <Button {...tb} startIcon={<FormatIndentIncreaseIcon />} disabled={!selRow} onClick={() => selRow && void indentTask(selRow)}>Indent</Button>
              <Divider orientation="vertical" flexItem />
              <Button {...tb} startIcon={<InfoOutlinedIcon />} disabled={!selRow} onClick={() => selRow && openEdit(tasks.find((t) => t.id === selRow.task.id) || selRow.task)}>Information</Button>
              <Button {...tb} startIcon={<CenterFocusStrongIcon />} disabled={!selRow} onClick={() => selRow && setScrollReq((p) => ({ id: selRow.task.id, n: (p?.n ?? 0) + 1 }))}>Scroll to Task</Button>
              <Tooltip title={weightInfo.mode === 'manual'
                ? `Progress is weighted by the task weights you entered${weightInfo.unweighted ? ` — ${weightInfo.unweighted} task(s) have no weight and count 0` : ''}`
                : 'Progress is weighted by task duration. Set weights to control each task\'s share.'}>
                <Button {...tb} startIcon={<BalanceIcon />} onClick={openWeights}
                  sx={{ ...tb.sx, ...(weightInfo.unweighted ? { color: 'warning.dark' } : {}) }}>
                  Weights: {weightInfo.mode === 'manual' ? 'Manual' : 'By duration'}{weightInfo.unweighted ? ` (${weightInfo.unweighted} missing)` : ''}
                </Button>
              </Tooltip>
              <Button
                {...tb} startIcon={<BorderColorIcon sx={{ color: `${TASK_HIGHLIGHTS[lastHighlight]} !important`, filter: 'saturate(3) brightness(0.8)' }} />}
                disabled={selectedTasks.length === 0} onClick={(e) => setHlMenu(e.currentTarget)}
              >
                Highlight
              </Button>
              <Button
                {...tb} startIcon={<DeleteIcon />} disabled={selectedTasks.length === 0}
                onClick={() => (selectedTasks.length === 1 ? setDeleteTarget(selectedTasks[0]) : setBulkDelete(selectedTasks))}
              >
                Delete
              </Button>
              {selectedTasks.length > 1 && <Typography variant="caption" color="text.secondary">{selectedTasks.length} selected</Typography>}
              <Box sx={{ flexGrow: 1 }} />
              <TextField
                select size="small" value={hlFilter} onChange={(e) => setHlFilter(e.target.value as HighlightFilter)}
                sx={{ minWidth: 170, '& .MuiInputBase-input': { py: 0.5, fontSize: 12 } }}
                SelectProps={{ renderValue: (v) => (v === 'none' ? 'Highlight: none' : `Highlight: ${HIGHLIGHT_FILTERS.find((f) => f.value === v)?.label}`) }}
              >
                {HIGHLIGHT_FILTERS.map((f) => <MenuItem key={f.value} value={f.value} dense>{f.label}</MenuItem>)}
              </TextField>
              <TextField
                size="small" placeholder="Find task (Ctrl+F)" value={search} inputRef={searchRef}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); gotoMatch(e.shiftKey ? -1 : 1); }
                  if (e.key === 'Escape') { setSearch(''); (e.target as HTMLInputElement).blur(); }
                }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ fontSize: 16, color: 'text.secondary', mr: 0.5 }} />,
                  endAdornment: search.trim() ? (
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {searchMatches.length === 0 ? 'none' : `${Math.max(1, searchMatches.indexOf(selectedId || '') + 1)}/${searchMatches.length}`}
                    </Typography>
                  ) : undefined,
                }}
                sx={{ width: 190, '& .MuiInputBase-input': { py: 0.5, fontSize: 12 } }}
              />
              <Tooltip title="Keyboard shortcuts (?)">
                <IconButton size="small" onClick={() => setHelpOpen(true)}><KeyboardIcon fontSize="small" /></IconButton>
              </Tooltip>
              <ToggleButtonGroup
                size="small" exclusive value={zoom}
                onChange={(_, v: GanttZoom | null) => { if (v) setZoom(v); }}
                sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1.25, textTransform: 'none', fontSize: 12 } }}
              >
                <ToggleButton value="day">Days</ToggleButton>
                <ToggleButton value="week">Weeks</ToggleButton>
                <ToggleButton value="month">Months</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <MsProjectGantt
              baseline={showBaseline && baseline ? baselineMap : null}
              rows={visibleRows}
              idNumbers={idNumbers}
              range={range}
              totalDays={totalDays}
              zoom={zoom}
              workingDays={workingDays}
              criticalIds={criticalIds}
              isOverdue={isOverdue}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelect={selectRow}
              filterHits={filterHits}
              searchQuery={search}
              revealRequest={revealReq}
              onOpen={(t) => openEdit(tasks.find((x) => x.id === t.id) || t)}
              onRowContextMenu={(e, row) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, row }); }}
              onReorder={(d, t, pos) => void moveTask(d, t, pos)}
              weightShare={weightInfo.share}
              weightMode={weightInfo.mode}
              onBarMouseDown={startDrag}
              draggingTaskId={draggingTaskId}
              gridWidth={gridWidth}
              onGridWidthChange={setGridWidth}
              scrollRequest={scrollReq}
            />
          </Paper>
        );
      })()}

      <Menu
        open={!!ctxMenu}
        onClose={() => setCtxMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={ctxMenu ? { top: ctxMenu.y, left: ctxMenu.x } : undefined}
        slotProps={{ list: { dense: true } }}
      >
        {ctxMenu && [
          <MenuItem key="info" onClick={() => { const r = ctxMenu.row; setCtxMenu(null); openEdit(tasks.find((t) => t.id === r.task.id) || r.task); }}>Information…</MenuItem>,
          <MenuItem key="scroll" onClick={() => { const r = ctxMenu.row; setCtxMenu(null); setScrollReq((p) => ({ id: r.task.id, n: (p?.n ?? 0) + 1 })); }}>Scroll to Task</MenuItem>,
          <Divider key="d1" />,
          <MenuItem key="insert" onClick={() => { const r = ctxMenu.row; setCtxMenu(null); openAdd(tasks.find((t) => t.id === r.task.id) || r.task); }}>Insert Task Below</MenuItem>,
          <MenuItem key="indent" onClick={() => { const r = ctxMenu.row; setCtxMenu(null); void indentTask(r); }}>Indent Task</MenuItem>,
          <MenuItem key="outdent" disabled={!ctxMenu.row.task.parentId} onClick={() => { const r = ctxMenu.row; setCtxMenu(null); void outdentTask(r); }}>Outdent Task</MenuItem>,
          <Divider key="d2" />,
          <Box key="hl" sx={{ px: 2, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="body2" sx={{ mr: 0.5 }}>Highlight</Typography>
            {(Object.keys(TASK_HIGHLIGHTS) as TaskHighlight[]).map((c) => (
              <Box
                key={c} title={c}
                onClick={() => { setCtxMenu(null); void applyHighlight(c); }}
                sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: TASK_HIGHLIGHTS[c], border: '1px solid rgba(0,0,0,0.25)', cursor: 'pointer', '&:hover': { transform: 'scale(1.2)' } }}
              />
            ))}
          </Box>,
          <MenuItem key="clearhl" onClick={() => { setCtxMenu(null); void applyHighlight(null); }}>Clear Highlight</MenuItem>,
          <Divider key="d3" />,
          <MenuItem
            key="delete" sx={{ color: 'error.main' }}
            onClick={() => { const r = ctxMenu.row; setCtxMenu(null); if (selectedTasks.length > 1) setBulkDelete(selectedTasks); else setDeleteTarget(tasks.find((t) => t.id === r.task.id) || r.task); }}
          >
            {selectedTasks.length > 1 ? `Delete ${selectedTasks.length} Tasks` : 'Delete Task'}
          </MenuItem>,
        ]}
      </Menu>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Task' : 'Add Task'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formErr && <Alert severity="error">{formErr}</Alert>}
            <TextField
              label="Task name" value={form.name} fullWidth autoFocus
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Category" select value={form.category} fullWidth
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {SCHEDULE_TASK_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
              <FormControlLabel
                control={<Checkbox checked={form.isMilestone} onChange={(e) => setForm((f) => ({ ...f, isMilestone: e.target.checked }))} />}
                label="Milestone"
                sx={{ whiteSpace: 'nowrap' }}
              />
            </Stack>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="body2" color="text.secondary">Task mode</Typography>
              <ToggleButtonGroup
                size="small" exclusive value={form.mode}
                onChange={(_, v: 'auto' | 'manual' | null) => {
                  if (!v) return;
                  setForm((f) => (v === 'manual'
                    ? { ...f, mode: v, finishDate: f.isMilestone ? f.startDate : addWorkingDays(nextWorkingDay(f.startDate, workingDays), normDuration(f.durationDays), workingDays) }
                    : { ...f, mode: v, durationDays: f.finishDate >= f.startDate ? workingDaysBetween(f.startDate, f.finishDate, workingDays) : f.durationDays }));
                }}
                sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1.5, textTransform: 'none' } }}
              >
                <ToggleButton value="auto">Auto scheduled</ToggleButton>
                <ToggleButton value="manual">Manually scheduled</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary">
                {form.mode === 'auto' ? 'Dates follow the predecessors.' : 'Your dates stand; predecessors won’t move it.'}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Start date" type="date" value={form.startDate} fullWidth InputLabelProps={{ shrink: true }}
                disabled={form.mode === 'auto' && form.predecessors.length > 0}
                helperText={form.mode === 'auto' && form.predecessors.length > 0 ? 'Driven by predecessors' : ' '}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
              {form.mode === 'manual' ? (
                <TextField
                  label="Finish date" type="date" value={form.isMilestone ? form.startDate : form.finishDate} fullWidth InputLabelProps={{ shrink: true }}
                  disabled={form.isMilestone}
                  error={!form.isMilestone && form.finishDate < form.startDate}
                  helperText={!form.isMilestone && form.finishDate >= form.startDate ? `${workingDaysBetween(form.startDate, form.finishDate, workingDays)} day(s)` : ' '}
                  onChange={(e) => setForm((f) => ({ ...f, finishDate: e.target.value }))}
                />
              ) : (
                <TextField
                  label="Duration (days)" type="number" value={form.durationDays} fullWidth
                  disabled={form.isMilestone}
                  inputProps={{ min: 0.5, step: 0.5 }}
                  helperText="Half days allowed (e.g. 0.5, 1.5)"
                  onChange={(e) => setForm((f) => ({ ...f, durationDays: Number(e.target.value) }))}
                  onWheel={blurNumberInputOnWheel}
                />
              )}
              <TextField
                label="Manpower" type="number" value={form.manpower} fullWidth
                disabled={form.isMilestone}
                inputProps={{ min: 0, step: 1 }}
                helperText="Headcount per working day"
                onChange={(e) => setForm((f) => ({ ...f, manpower: Math.max(0, Number(e.target.value) || 0) }))}
                onWheel={blurNumberInputOnWheel}
              />
            </Stack>
            {(() => {
              const isPhase = !!editingId && tasks.some((t) => t.parentId === editingId);
              const others = leafTasks(tasks).filter((t) => t.id !== editingId).reduce((sum, t) => sum + Math.max(0, Number(t.weight) || 0), 0);
              const w = Math.max(0, Number(form.weight) || 0);
              const help = isPhase
                ? "A phase's weight is the sum of its tasks' weights — set weights on its tasks."
                : w > 0
                  ? `≈ ${((w / (others + w)) * 100).toFixed(1)}% of project progress`
                  : weightInfo.mode === 'manual'
                    ? 'No weight — this task counts 0 toward progress'
                    : 'Blank = weigh by duration (current method)';
              return (
                <TextField
                  label="Progress weight" type="number" value={isPhase ? '' : form.weight || ''} fullWidth
                  disabled={isPhase}
                  inputProps={{ min: 0, step: 0.1 }}
                  helperText={help}
                  onChange={(e) => setForm((f) => ({ ...f, weight: Math.max(0, Number(e.target.value) || 0) }))}
                  onWheel={blurNumberInputOnWheel}
                />
              );
            })()}
            {!form.isMilestone && form.mode === 'auto' && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                Ends {fmt(toDate(addWorkingDays(nextWorkingDay(form.startDate, workingDays), normDuration(form.durationDays), workingDays)))}
                {workingDays ? ' · working days' : ''}
              </Typography>
            )}
            {(() => {
              // Parent options: any task except self and its own descendants (no cycles).
              const desc = editingId ? descendantIds(tasks, editingId) : new Set<string>();
              const parentCands = tasks.filter((t) => t.id !== editingId && !desc.has(t.id));
              return (
                <TextField
                  select fullWidth label="Parent (phase / summary)"
                  value={form.parentId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value || null }))}
                  helperText="Nest this task under a phase — that task becomes a summary and rolls up."
                >
                  <MenuItem value=""><em>None (top level)</em></MenuItem>
                  {parentCands.map((t) => (
                    <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                  ))}
                </TextField>
              );
            })()}
            {(() => {
              const check = parsePredecessors(form.predText, editingId);
              const names = check.ids.map((tid) => tasks.find((t) => t.id === tid)?.name).filter(Boolean).join(', ');
              return (
                <TextField
                  fullWidth label="Predecessors (row IDs)" placeholder="e.g. 3, 5"
                  value={form.predText}
                  error={!!check.error}
                  onChange={(e) => {
                    const text = e.target.value;
                    const next = parsePredecessors(text, editingId);
                    setForm((f) => ({ ...f, predText: text, predecessors: next.error ? f.predecessors : next.ids }));
                  }}
                  helperText={check.error
                    || (names ? `Starts after: ${names}` : 'Type the ID numbers from the table, separated by commas (finish-to-start).')}
                />
              );
            })()}
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>Progress: {form.progressPct}%</Typography>
              <Slider
                value={form.progressPct} step={5} min={0} max={100} valueLabelDisplay="auto"
                onChange={(_, v) => setForm((f) => ({ ...f, progressPct: v as number }))}
              />
            </Box>
            <TextField
              label="Notes" value={form.notes} fullWidth multiline minRows={2}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Work Items from Calcsheet</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {importErr && <Alert severity="error">{importErr}</Alert>}
            <Stack direction="row" spacing={2}>
              <TextField
                label="Quotation" select value={importQuotationId} fullWidth
                onChange={(e) => {
                  const qid = e.target.value;
                  setImportQuotationId(qid);
                  const q = quotations.find((x) => x.id === qid);
                  const services = q?.services || [];
                  setImportSelected(new Set(services.map((s) => s.id)));
                  setImportDurations(defaultDurationsFor(services));
                }}
              >
                {quotations.map((q) => (
                  <MenuItem key={q.id} value={q.id}>{q.kind} · rev {q.revision}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Start date" type="date" value={importStartDate} fullWidth InputLabelProps={{ shrink: true }}
                onChange={(e) => setImportStartDate(e.target.value)}
              />
            </Stack>
            {importServices.length === 0 ? (
              <Typography color="text.secondary">This quotation has no work items (Services) to import.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>Work item</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="right" sx={{ width: 110 }}>Duration (days)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {importServices.map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox checked={importSelected.has(s.id)} onChange={() => toggleImportSelected(s.id)} />
                      </TableCell>
                      <TableCell onClick={() => toggleImportSelected(s.id)} sx={{ cursor: 'pointer' }}>
                        {s.description || 'Untitled work item'}
                        {(!s.days || s.days <= 0) && (
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                            (lot — set duration manually)
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">{PHP(s.amount || 0)}</TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number" size="small" value={importDurations[s.id] ?? 1}
                          disabled={!importSelected.has(s.id)}
                          inputProps={{ min: 1, style: { textAlign: 'right' } }}
                          sx={{ width: 90 }}
                          onChange={(e) => setImportDurations((prev) => ({ ...prev, [s.id]: Math.max(1, Number(e.target.value) || 1) }))}
                          onWheel={blurNumberInputOnWheel}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Typography variant="caption" color="text.secondary">
              Each selected line becomes a task, stacked back-to-back starting on the date above. Lines without a day count default to 1 day — edit the duration for lot-priced items before importing. Adjust dates or categories afterward as needed.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)} disabled={importBusy}>Cancel</Button>
          <Button variant="contained" onClick={() => void runImport()} disabled={importBusy || importServices.length === 0}>
            {importBusy ? 'Importing…' : `Import ${importSelected.size ? `(${importSelected.size})` : ''}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete task?</DialogTitle>
        <DialogContent>
          <Typography>Delete "{deleteTarget?.name}" from the schedule? This can't be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!bulkDelete} onClose={() => setBulkDelete(null)}>
        <DialogTitle>Delete {bulkDelete?.length} tasks?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>These tasks will be removed from the schedule. This can't be undone.</Typography>
          {bulkDelete?.slice(0, 8).map((t) => <Typography key={t.id} variant="body2" color="text.secondary">• {t.name}</Typography>)}
          {(bulkDelete?.length || 0) > 8 && <Typography variant="body2" color="text.secondary">…and {(bulkDelete?.length || 0) - 8} more</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { const ids = (bulkDelete || []).map((t) => t.id); setBulkDelete(null); void deleteTasks(ids); }}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Menu anchorEl={hlMenu} open={!!hlMenu} onClose={() => setHlMenu(null)} slotProps={{ list: { dense: true } }}>
        {(Object.keys(TASK_HIGHLIGHTS) as TaskHighlight[]).map((c) => (
          <MenuItem key={c} onClick={() => { setHlMenu(null); void applyHighlight(c); }}>
            <Box sx={{ width: 16, height: 16, borderRadius: '3px', bgcolor: TASK_HIGHLIGHTS[c], border: '1px solid rgba(0,0,0,0.2)', mr: 1.25 }} />
            {c.charAt(0).toUpperCase() + c.slice(1)}{c === lastHighlight ? '  (H)' : ''}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setHlMenu(null); void applyHighlight(null); }}>No highlight</MenuItem>
      </Menu>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableBody>
              {SHORTCUTS.map(([k, d]) => (
                <TableRow key={k}>
                  <TableCell sx={{ whiteSpace: 'nowrap', width: '40%' }}>
                    <Box component="kbd" sx={{ fontFamily: 'monospace', fontSize: 12, px: 0.75, py: 0.25, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'grey.50' }}>{k}</Box>
                  </TableCell>
                  <TableCell>{d}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions><Button onClick={() => setHelpOpen(false)}>Close</Button></DialogActions>
      </Dialog>

      {/* Progress weights */}
      <Dialog open={weightsOpen} onClose={() => !weightsSaving && setWeightsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Progress weights</DialogTitle>
        <DialogContent>
          {(() => {
            const rows = flattenTree(rolledTasks, new Set());
            const total = Object.values(weightDraft).reduce((a, b) => a + b, 0);
            const manual = total > 0;
            const durBasis: Record<string, number> = {};
            leafTasks(tasks).forEach((t) => { durBasis[t.id] = durationWeight(t); });
            const durTotal = Object.values(durBasis).reduce((a, b) => a + b, 0);
            const missing = manual ? Object.values(weightDraft).filter((v) => !(v > 0)).length : 0;
            const shareOf = (tid: string) => (manual ? (total > 0 ? ((weightDraft[tid] || 0) / total) * 100 : 0) : (durTotal > 0 ? (durBasis[tid] / durTotal) * 100 : 0));
            return (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Each task's share of project progress = its weight ÷ total weight. Enter any consistent unit — percentages,
                  contract value, or man-hours. Leave every weight blank to weigh tasks by duration.
                  Project % complete = Σ (share × task % complete); phases roll up the same way.
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                  <Button size="small" variant="outlined" onClick={() => setWeightDraft(toPercents(durBasis))}>Fill from duration</Button>
                  <Button size="small" variant="outlined" onClick={() => {
                    const ids = Object.keys(weightDraft);
                    setWeightDraft(toPercents(Object.fromEntries(ids.map((k) => [k, 1]))));
                  }}>Distribute evenly</Button>
                  {manual && Math.abs(total - 100) > 0.01 && (
                    <Button size="small" variant="outlined" onClick={() => setWeightDraft(toPercents(weightDraft))}>Scale to 100</Button>
                  )}
                  <Button size="small" color="inherit" onClick={() => setWeightDraft(Object.fromEntries(Object.keys(weightDraft).map((k) => [k, 0])))}>Clear (use duration)</Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 40 }}>ID</TableCell>
                      <TableCell>Task</TableCell>
                      <TableCell align="right" sx={{ width: 90 }}>Duration</TableCell>
                      <TableCell align="right" sx={{ width: 130 }}>Weight</TableCell>
                      <TableCell align="right" sx={{ width: 100 }}>Share</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r, i) => {
                      const t = r.task;
                      if (r.isSummary) {
                        const sub = Array.from(descendantIds(tasks, t.id));
                        const phaseShare = sub.reduce((a, tid) => a + (tid in weightDraft ? shareOf(tid) : 0), 0);
                        const phaseWeight = sub.reduce((a, tid) => a + (weightDraft[tid] || 0), 0);
                        return (
                          <TableRow key={t.id} sx={{ bgcolor: 'grey.50' }}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell sx={{ fontWeight: 700, pl: `${16 + r.depth * 16}px` }}>{t.name}</TableCell>
                            <TableCell />
                            <TableCell align="right" sx={{ fontWeight: 700 }}>{manual ? Math.round(phaseWeight * 100) / 100 : ''}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>{phaseShare.toFixed(1)}%</TableCell>
                          </TableRow>
                        );
                      }
                      return (
                        <TableRow key={t.id}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell sx={{ pl: `${16 + r.depth * 16}px` }}>{t.name}</TableCell>
                          <TableCell align="right">{t.isMilestone ? '0 days' : `${t.durationDays != null && t.durationDays < 1 ? t.durationDays : durationOf(t.startDate, t.endDate)} d`}</TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small" type="number" variant="standard" value={weightDraft[t.id] || ''}
                              placeholder={manual ? '0' : (durTotal > 0 ? ((durBasis[t.id] / durTotal) * 100).toFixed(2) : '')}
                              inputProps={{ min: 0, step: 0.1, style: { textAlign: 'right' } }}
                              onChange={(e) => setWeightDraft((d) => ({ ...d, [t.id]: Math.max(0, Number(e.target.value) || 0) }))}
                              onWheel={blurNumberInputOnWheel}
                              sx={{ width: 100 }}
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ color: manual ? (weightDraft[t.id] > 0 ? 'text.primary' : 'warning.dark') : 'text.secondary' }}>
                            {shareOf(t.id).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow>
                      <TableCell />
                      <TableCell sx={{ fontWeight: 700 }}>Total{manual ? '' : ' (weighted by duration)'}</TableCell>
                      <TableCell />
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{manual ? Math.round(total * 100) / 100 : '—'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>100.0%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                {/* Below the table so it never shifts the rows while typing */}
                {missing > 0 && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>{missing} task{missing === 1 ? ' has' : 's have'} no weight and will count 0 toward progress.</Alert>
                )}
              </>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWeightsOpen(false)} disabled={weightsSaving}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveWeights()} disabled={weightsSaving}>{weightsSaving ? 'Saving…' : 'Save weights'}</Button>
        </DialogActions>
      </Dialog>

      <ScheduleExportDialog
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        projectId={id}
        project={{ code, name }}
        rows={exportRows}
        loadData={loadExportData}
        initial={{ showCritical, showBaseline: showBaseline && !!baseline }}
        hasBaseline={!!baseline}
      />

      {/* Save version dialog */}
      <Dialog open={saveVerOpen} onClose={() => !savingVer && setSaveVerOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{saveAsBaseline ? 'Set baseline' : 'Save schedule version'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Freezes the current schedule ({sorted.length} task{sorted.length === 1 ? '' : 's'}) as a named version you can restore later.
          </Typography>
          <TextField
            autoFocus fullWidth size="small" label="Label (optional)"
            placeholder="e.g. Baseline, Rev 1 — client moved delivery"
            value={verLabel}
            onChange={(e) => setVerLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveVersion(); }}
          />
          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Checkbox size="small" checked={saveAsBaseline} onChange={(e) => setSaveAsBaseline(e.target.checked)} />}
            label={<Typography variant="body2">Set as the baseline</Typography>}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
            {baseline
              ? `Replaces the current baseline (saved ${new Date(baseline.savedAt).toLocaleDateString()}).`
              : 'The baseline is the reference plan — it stays put while the schedule changes.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveVerOpen(false)} disabled={savingVer}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveVersion()} disabled={savingVer} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>
            {savingVer ? 'Saving…' : saveAsBaseline ? 'Set baseline' : 'Save version'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Version history dialog */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Version history
          <Typography variant="body2" color="text.secondary">
            Saved snapshots of this schedule. Restoring one replaces the current schedule (the current state is snapshotted first, so it's undoable).
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {historyLoading && <LinearProgress sx={{ mb: 1 }} />}
          {historyErr && <Alert severity="error" sx={{ mb: 1 }}>{historyErr}</Alert>}
          {!historyLoading && versions.length === 0 ? (
            <Alert severity="info">No saved versions yet. Use “Save version” to create one.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Saved on</TableCell>
                  <TableCell>Saved by / label</TableCell>
                  <TableCell align="right">Tasks</TableCell>
                  <TableCell align="right">Progress</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {versions.map((v, i) => (
                  <TableRow key={v.id} hover>
                    <TableCell sx={{ color: 'text.secondary' }}>{versions.length - i}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {v.savedAt ? new Date(v.savedAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{v.savedBy || '—'}</Typography>
                      {v.label && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>“{v.label}”</Typography>
                      )}
                      {v.isBaseline && <Chip size="small" icon={<FlagIcon />} label="Baseline" color="primary" variant="outlined" sx={{ ml: 1, height: 20 }} />}
                    </TableCell>
                    <TableCell align="right">{v.taskCount}</TableCell>
                    <TableCell align="right">{v.overallProgress}%</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Button size="small" startIcon={v.isBaseline ? <FlagIcon /> : <OutlinedFlagIcon />} onClick={() => void toggleBaseline(v)}>
                        {v.isBaseline ? 'Clear baseline' : 'Set as baseline'}
                      </Button>
                      <Button size="small" startIcon={<CompareArrowsIcon />} onClick={() => void openCompare(v)}>
                        Compare
                      </Button>
                      <Button size="small" startIcon={<UndoIcon />} disabled={restoringId === v.id} onClick={() => void restoreVersion(v)}>
                        {restoringId === v.id ? 'Restoring…' : 'Restore'}
                      </Button>
                      <IconButton size="small" title="Delete this version" onClick={() => void deleteVersion(v)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Compare dialog: baseline (selected version) vs current */}
      <Dialog open={!!compareVersion} onClose={() => setCompareVersion(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          Compare with current
          <Typography variant="body2" color="text.secondary">
            {compareVersion?.label || 'Version'} · {compareVersion?.savedAt ? new Date(compareVersion.savedAt).toLocaleString() : ''} — baseline vs the current schedule (matched by task name).
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {compareLoading && <LinearProgress sx={{ mb: 1 }} />}
          {diff && !compareLoading && (
            <>
              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Finish vs baseline</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: diff.finishDelta > 0 ? 'error.main' : diff.finishDelta < 0 ? 'success.main' : 'text.primary' }}>
                    {diff.finishDelta === 0 ? 'On plan' : diff.finishDelta > 0 ? `${diff.finishDelta} day${diff.finishDelta === 1 ? '' : 's'} later` : `${-diff.finishDelta} day${diff.finishDelta === -1 ? '' : 's'} earlier`}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Tasks slipped</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{diff.slipped}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Progress: baseline → current</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{diff.baseProgress}% → {diff.curProgress}%</Typography>
                </Box>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Task</TableCell>
                    <TableCell align="right">Δ Start</TableCell>
                    <TableCell align="right">Δ End</TableCell>
                    <TableCell align="right">Progress</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {diff.rows.map((r, i) => {
                    const deltaCell = (d?: number) => {
                      if (r.status !== 'changed' || d === undefined) return <Typography variant="caption" color="text.disabled">—</Typography>;
                      const color = d > 0 ? 'error.main' : d < 0 ? 'success.main' : 'text.secondary';
                      return <Typography variant="body2" sx={{ color }}>{d > 0 ? `+${d}d` : d < 0 ? `${d}d` : '0'}</Typography>;
                    };
                    return (
                      <TableRow key={`${r.name}-${i}`} hover>
                        <TableCell>{r.name}</TableCell>
                        <TableCell align="right">{deltaCell(r.startDelta)}</TableCell>
                        <TableCell align="right">{deltaCell(r.endDelta)}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {r.status === 'changed' ? `${r.baseProg}% → ${r.curProg}%`
                            : r.status === 'removed' ? `${r.baseProg}% → —`
                            : `— → ${r.curProg}%`}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small" variant="outlined"
                            label={r.status === 'added' ? 'Added' : r.status === 'removed' ? 'Removed' : ((r.startDelta || r.endDelta) ? 'Slipped' : 'On plan')}
                            color={r.status === 'added' ? 'info' : r.status === 'removed' ? 'warning' : ((r.endDelta || 0) > 0 ? 'error' : 'default')}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompareVersion(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// Calcsheet (proposal) schedule — resolves the project + quotations from the
// store and renders the shared Gantt with the "Import from Calcsheet" affordance.
export default function CalcsheetProjectSchedule() {
  const { id = '' } = useParams();
  const project = useQuotationStore((s) => s.projects.find((p) => p.id === id));
  const allQuotations = useQuotationStore((s) => s.quotations);
  const quotations = useMemo(() => allQuotations.filter((q) => q.projectId === id), [allQuotations, id]);

  if (!project) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Project not found. <Link to="/sales/calcsheet/projects">Back to projects</Link></Typography>
      </Box>
    );
  }

  return (
    <WorkScheduleGantt
      projectId={id}
      code={project.code}
      name={project.name}
      backHref={`/sales/calcsheet/projects/${project.id}`}
      quotationsForImport={quotations}
    />
  );
}
