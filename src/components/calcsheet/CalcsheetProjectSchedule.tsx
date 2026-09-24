import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, Slider, Stack, TextField,
  Tooltip, Typography, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import HistoryIcon from '@mui/icons-material/History';
import SaveIcon from '@mui/icons-material/Save';
import UndoIcon from '@mui/icons-material/Undo';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import { useQuotationStore } from '../../store/quotationStore';
import type { ServiceLine, Quotation } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { blurNumberInputOnWheel } from '../../utils/calcsheet/numberInput';
import {
  MS_PER_DAY, addDays, daysBetween, durationOf, fmt, toDate, todayStr,
  addWorkingDays, nextWorkingDay, workingDaysBetween,
} from '../../utils/calcsheet/scheduleDates';
import { exportScheduleXlsx } from '../../utils/calcsheet/scheduleXlsxExport';
import { exportSchedulePdf } from '../../utils/calcsheet/schedulePdfExport';
import { autoSchedule, wouldCycle, criticalPath } from '../../utils/calcsheet/scheduleAuto';
import { rollUp, flattenTree, leafTasks, descendantIds, type TreeRow } from '../../utils/calcsheet/scheduleTree';
import {
  SCHEDULE_CATEGORY_COLORS, SCHEDULE_TASK_CATEGORIES, type ScheduleTask,
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

const DAY_WIDTH = 28;

interface TaskFormState {
  name: string;
  category: string;
  startDate: string;
  durationDays: number;
  progressPct: number;
  isMilestone: boolean;
  notes: string;
  predecessors: string[];
  parentId: string | null;
}

const emptyForm = (): TaskFormState => ({
  name: '', category: 'Engineering', startDate: todayStr(), durationDays: 1, progressPct: 0, isMilestone: false, notes: '', predecessors: [], parentId: null,
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
    // pad a few days either side so bars don't touch the edges
    min = new Date(min.getTime() - 2 * MS_PER_DAY);
    max = new Date(max.getTime() + 2 * MS_PER_DAY);
    return { start: min, end: max };
  }, [tasks]);

  const totalDays = Math.max(1, daysBetween(range.start, range.end));

  const months = useMemo(() => {
    const out: { label: string; offsetDays: number; days: number }[] = [];
    let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    if (cursor < range.start) { /* keep as-is, first segment gets clipped below */ }
    while (cursor <= range.end) {
      const segStart = cursor > range.start ? cursor : range.start;
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const segEnd = nextMonth < range.end ? nextMonth : range.end;
      out.push({
        label: cursor.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
        offsetDays: daysBetween(range.start, segStart),
        days: Math.max(1, daysBetween(segStart, segEnd)),
      });
      cursor = nextMonth;
    }
    return out;
  }, [range]);

  // ── Quick-win derived data ──────────────────────────────────────────────
  const todayDate = useMemo(() => toDate(todayStr()), []);
  // Pixel offset of the "today" line inside the timeline, or null when today
  // falls outside the visible range.
  const todayOffset = useMemo(() => {
    if (todayDate < range.start || todayDate > range.end) return null;
    return daysBetween(range.start, todayDate) * DAY_WIDTH;
  }, [todayDate, range]);

  // Weekend day offsets across the range, for column shading.
  const weekendOffsets = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(range.start.getTime() + i * MS_PER_DAY);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) out.push(i);
    }
    return out;
  }, [range, totalDays]);

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
  const visibleRows = useMemo(() => {
    const rows = flattenTree(rolledTasks, collapsed);
    return rows.filter((r) => {
      if (r.isSummary) return true; // keep structure even if children are filtered
      if (milestonesOnly && !r.task.isMilestone) return false;
      if (categoryFilter.size > 0 && !categoryFilter.has(r.task.category || 'Other')) return false;
      return true;
    });
  }, [rolledTasks, collapsed, milestonesOnly, categoryFilter]);

  // Finish-to-start dependency connectors between visible bars.
  const depArrows = useMemo(() => {
    const idxById = new Map(visibleRows.map((r, i) => [r.task.id, i]));
    const out: { key: string; x1: number; y1: number; x2: number; y2: number; pid: string; sid: string }[] = [];
    visibleRows.forEach((row, si) => {
      const s = row.task;
      (s.predecessors || []).forEach((pid) => {
        const pi = idxById.get(pid);
        if (pi === undefined) return;
        const p = visibleRows[pi].task;
        const pStartX = daysBetween(range.start, toDate(p.startDate)) * DAY_WIDTH;
        const x1 = p.isMilestone ? pStartX + DAY_WIDTH : pStartX + Math.max(DAY_WIDTH, (daysBetween(toDate(p.startDate), toDate(p.endDate)) + 1) * DAY_WIDTH);
        const sStartX = daysBetween(range.start, toDate(s.startDate)) * DAY_WIDTH;
        const x2 = s.isMilestone ? sStartX + DAY_WIDTH / 2 : sStartX;
        out.push({ key: `${pid}-${s.id}`, x1, y1: pi * 44 + 22, x2, y2: si * 44 + 22, pid, sid: s.id });
      });
    });
    return out;
  }, [visibleRows, range]);

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
    let weightedProgress = 0;
    let weightDays = 0;
    let overdue = 0;
    for (const t of leaves) {
      if (t.startDate < minStart) minStart = t.startDate;
      if (t.endDate > maxEnd) maxEnd = t.endDate;
      const dur = t.isMilestone ? 1 : Math.max(1, durationOf(t.startDate, t.endDate));
      weightedProgress += (t.progressPct || 0) * dur;
      weightDays += dur;
      if (isOverdue(t)) overdue += 1;
    }
    return {
      start: minStart,
      end: maxEnd,
      durationDays: daysBetween(toDate(minStart), toDate(maxEnd)) + 1,
      pctComplete: weightDays > 0 ? Math.round(weightedProgress / weightDays) : 0,
      overdue,
    };
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
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
      parentId: t.parentId ?? null,
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

  const save = async () => {
    if (!form.name.trim()) { setFormErr('Task name is required.'); return; }
    const startDate = nextWorkingDay(form.startDate, workingDays);
    const duration = form.isMilestone ? 1 : Math.max(1, Math.round(form.durationDays) || 1);
    const endDate = form.isMilestone ? startDate : addWorkingDays(startDate, duration, workingDays);
    const payload = {
      name: form.name, category: form.category, startDate, endDate, durationDays: duration,
      progressPct: form.progressPct, isMilestone: form.isMilestone, notes: form.notes,
      predecessors: form.predecessors, parentId: form.parentId,
    };
    setSaving(true);
    setFormErr('');
    try {
      let working: ScheduleTask[];
      if (editingId) {
        const r = await api<{ success: boolean; task: ScheduleTask }>('PUT', `/api/schedule-tasks/${editingId}`, payload);
        working = tasks.map((t) => (t.id === editingId ? r.task : t));
      } else {
        const r = await api<{ success: boolean; task: ScheduleTask }>('POST', '/api/schedule-tasks', {
          ...payload, projectId: id, order: tasks.length,
        });
        working = [...tasks, r.task];
      }
      await cascade(working);
      setDialogOpen(false);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const goneId = deleteTarget.id;
    try {
      await api('DELETE', `/api/schedule-tasks/${goneId}`);
      // Drop the deleted task and strip it from any successor's predecessors,
      // persisting those predecessor changes, then re-schedule.
      const affected: ScheduleTask[] = [];
      const working = tasks.filter((t) => t.id !== goneId).map((t) => {
        if (t.predecessors?.includes(goneId)) {
          const next = { ...t, predecessors: t.predecessors.filter((p) => p !== goneId) };
          affected.push(next);
          return next;
        }
        return t;
      });
      await Promise.all(affected.map((t) =>
        api('PUT', `/api/schedule-tasks/${t.id}`, { predecessors: t.predecessors }).catch(() => {}),
      ));
      await cascade(working);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteTarget(null);
    }
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

  const runExportPdf = async () => {
    setExportBusy('pdf');
    setExportErr('');
    try {
      await exportSchedulePdf({ code, name }, flattenTree(rolledTasks, new Set()).map((r) => r.task));
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setExportBusy(null);
    }
  };

  // ── Version history ─────────────────────────────────────────────────────
  const saveVersion = async () => {
    setSavingVer(true);
    try {
      await api('POST', '/api/schedule-versions', { projectId: id, label: verLabel.trim() || undefined });
      setSaveVerOpen(false);
      setVerLabel('');
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

  const deleteVersion = async (v: ScheduleVersion) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Permanently delete this saved version? This cannot be undone.')) return;
    try {
      await api('DELETE', `/api/schedule-versions/${v.id}`);
      setVersions((prev) => prev.filter((x) => x.id !== v.id));
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
      const offsetDays = Math.round(deltaX / DAY_WIDTH);
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
      if (d.offsetDays === 0) {
        openEdit(current);
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
            variant="outlined" startIcon={<SaveIcon />} onClick={() => { setVerLabel(''); setSaveVerOpen(true); }}
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
            variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => void runExportPdf()}
            disabled={sorted.length === 0 || exportBusy !== null}
          >
            {exportBusy === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </Button>
          {quotations.length > 0 && (
            <Button
              variant="outlined" startIcon={<PlaylistAddIcon />} onClick={openImport}
            >
              Import from Calcsheet
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>
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

      {sorted.length > 0 && visibleRows.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No tasks match the current filters.</Typography>
        </Paper>
      )}

      {visibleRows.length > 0 && (
        <Paper sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', minWidth: 340 + totalDays * DAY_WIDTH }}>
            {/* Task label column */}
            <Box sx={{ width: 340, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 2 }}>
              <Box sx={{ height: 48, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', px: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>TASK</Typography>
              </Box>
              {visibleRows.map((row) => {
                const t = row.task;
                return (
                  <Box key={t.id} sx={{ height: 44, display: 'flex', alignItems: 'center', pr: 1, borderBottom: '1px solid', borderColor: 'divider', gap: 0.25, pl: `${8 + row.depth * 16}px` }}>
                    {row.hasChildren ? (
                      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => toggleCollapse(t.id)}>
                        {collapsed.has(t.id) ? <KeyboardArrowRightIcon sx={{ fontSize: 18 }} /> : <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />}
                      </IconButton>
                    ) : <Box sx={{ width: 22, flexShrink: 0 }} />}
                    {!row.isSummary && (
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SCHEDULE_CATEGORY_COLORS[t.category || 'Other'] || NET_PACIFIC_COLORS.info, flexShrink: 0 }} />
                    )}
                    <Tooltip title={isOverdue(t) ? `${t.name} — overdue` : t.name}>
                      <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: (row.isSummary || t.isMilestone) ? 700 : 400, color: isOverdue(t) ? 'error.main' : 'inherit' }}>
                        {t.name}
                      </Typography>
                    </Tooltip>
                    <Tooltip title="Outdent"><IconButton size="small" sx={{ p: 0.25 }} onClick={() => void outdentTask(row)}><FormatIndentDecreaseIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    <Tooltip title="Indent"><IconButton size="small" sx={{ p: 0.25 }} onClick={() => void indentTask(row)}><FormatIndentIncreaseIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    <IconButton size="small" sx={{ p: 0.25 }} onClick={() => openEdit(t)}><EditIcon sx={{ fontSize: 15 }} /></IconButton>
                    <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteTarget(t)}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton>
                  </Box>
                );
              })}
            </Box>

            {/* Timeline */}
            <Box sx={{ position: 'relative' }}>
              {/* Weekend shading (behind the rows) */}
              {weekendOffsets.map((d) => (
                <Box key={`we-${d}`} sx={{ position: 'absolute', top: 48, left: d * DAY_WIDTH, width: DAY_WIDTH, height: visibleRows.length * 44, bgcolor: 'rgba(0,0,0,0.035)', pointerEvents: 'none', zIndex: 0 }} />
              ))}
              {/* Today marker (on top, non-interactive) */}
              {todayOffset !== null && (
                <Box sx={{ position: 'absolute', top: 0, left: todayOffset, width: 2, height: 48 + visibleRows.length * 44, bgcolor: NET_PACIFIC_COLORS.error, pointerEvents: 'none', zIndex: 3 }}>
                  <Box sx={{ position: 'absolute', top: 2, left: 3, px: 0.5, borderRadius: 0.5, bgcolor: NET_PACIFIC_COLORS.error, color: '#fff', fontSize: '0.6rem', fontWeight: 700, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
                    Today
                  </Box>
                </Box>
              )}
              {/* Dependency connectors (finish-to-start) */}
              {depArrows.length > 0 && (
                <svg
                  style={{ position: 'absolute', top: 48, left: 0, width: totalDays * DAY_WIDTH, height: visibleRows.length * 44, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}
                >
                  <defs>
                    <marker id="depArrowHead" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill="#8a8a8a" />
                    </marker>
                    <marker id="depArrowHeadCrit" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill="#d32f2f" />
                    </marker>
                  </defs>
                  {depArrows.map((a) => {
                    const crit = criticalIds.has(a.pid) && criticalIds.has(a.sid);
                    return (
                      <path
                        key={a.key}
                        d={`M ${a.x1} ${a.y1} H ${a.x1 + 8} V ${a.y2} H ${a.x2}`}
                        fill="none" stroke={crit ? '#d32f2f' : '#8a8a8a'} strokeWidth={crit ? 2 : 1.5}
                        markerEnd={crit ? 'url(#depArrowHeadCrit)' : 'url(#depArrowHead)'}
                      />
                    );
                  })}
                </svg>
              )}
              <Box sx={{ display: 'flex', height: 48, borderBottom: '1px solid', borderColor: 'divider', position: 'relative', zIndex: 1 }}>
                {months.map((m, i) => (
                  <Box key={i} sx={{ width: m.days * DAY_WIDTH, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>{m.label}</Typography>
                  </Box>
                ))}
              </Box>
              {visibleRows.map((row) => {
                const t = row.task;
                const offset = daysBetween(range.start, toDate(t.startDate)) * DAY_WIDTH;
                const width = Math.max(DAY_WIDTH, (daysBetween(toDate(t.startDate), toDate(t.endDate)) + 1) * DAY_WIDTH);
                const overdue = isOverdue(t);
                const color = overdue ? '#e53935' : (SCHEDULE_CATEGORY_COLORS[t.category || 'Other'] || NET_PACIFIC_COLORS.info);
                const critical = criticalIds.has(t.id);
                const isDragging = draggingTaskId === t.id;
                return (
                  <Box key={t.id} sx={{ height: 44, position: 'relative', borderBottom: '1px solid', borderColor: 'divider' }}>
                    {row.isSummary ? (
                      <Tooltip title={`${t.name} — ${fmt(toDate(t.startDate))} to ${fmt(toDate(t.endDate))} (${t.progressPct}%)`}>
                        <Box sx={{ position: 'absolute', left: offset, top: 17, width, height: 10, bgcolor: '#616161', borderRadius: 0.5, overflow: 'hidden' }}>
                          <Box sx={{ height: '100%', width: `${Math.min(100, Math.max(0, t.progressPct))}%`, bgcolor: '#2f2f2f' }} />
                        </Box>
                      </Tooltip>
                    ) : t.isMilestone ? (
                      <Tooltip title={isDragging ? '' : `${t.name} — ${fmt(toDate(t.startDate))} · drag to move`}>
                        <Box
                          onMouseDown={(e) => startDrag(e, t, 'move')}
                          sx={{
                            position: 'absolute', left: offset + DAY_WIDTH / 2 - 7, top: 12, width: 14, height: 14,
                            bgcolor: color, transform: 'rotate(45deg)', cursor: isDragging ? 'grabbing' : 'grab',
                            boxShadow: critical ? '0 0 0 2px #d32f2f' : isDragging ? '0 0 0 3px rgba(0,0,0,0.15)' : 'none',
                          }}
                        />
                      </Tooltip>
                    ) : (
                      <Tooltip title={isDragging ? '' : `${t.name} — ${fmt(toDate(t.startDate))} to ${fmt(toDate(t.endDate))} (${t.progressPct}%) · drag to move, edge to resize`}>
                        <Box
                          onMouseDown={(e) => startDrag(e, t, 'move')}
                          sx={{
                            position: 'absolute', left: offset, top: 10, width, height: 24, borderRadius: 1,
                            bgcolor: `${color}33`, border: critical ? '2px solid #d32f2f' : `1px solid ${color}`, cursor: isDragging ? 'grabbing' : 'grab',
                            overflow: 'hidden',
                            boxShadow: isDragging ? '0 0 0 2px rgba(0,0,0,0.15)' : 'none',
                          }}
                        >
                          <Box sx={{ height: '100%', width: `${Math.min(100, Math.max(0, t.progressPct))}%`, bgcolor: color }} />
                          <Box
                            onMouseDown={(e) => startDrag(e, t, 'resize')}
                            sx={{
                              position: 'absolute', right: 0, top: 0, width: 10, height: '100%', cursor: 'ew-resize',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              '&:hover > div, &:active > div': { opacity: 1 },
                            }}
                          >
                            <Box sx={{ width: 2, height: '60%', bgcolor: color, opacity: 0, borderRadius: 1 }} />
                          </Box>
                        </Box>
                      </Tooltip>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Paper>
      )}

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
            <Stack direction="row" spacing={2}>
              <TextField
                label="Start date" type="date" value={form.startDate} fullWidth InputLabelProps={{ shrink: true }}
                disabled={form.predecessors.length > 0}
                helperText={form.predecessors.length > 0 ? 'Driven by predecessors' : ' '}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
              <TextField
                label="Duration (days)" type="number" value={form.durationDays} fullWidth
                disabled={form.isMilestone}
                inputProps={{ min: 1 }}
                onChange={(e) => setForm((f) => ({ ...f, durationDays: Math.max(1, Number(e.target.value) || 1) }))}
                onWheel={blurNumberInputOnWheel}
              />
            </Stack>
            {!form.isMilestone && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                Ends {fmt(toDate(addWorkingDays(nextWorkingDay(form.startDate, workingDays), Math.max(1, Math.round(form.durationDays) || 1), workingDays)))}
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
              const summaryIds = new Set(tasks.filter((t) => t.parentId).map((t) => t.parentId));
              const cands = tasks.filter((t) => t.id !== editingId && !summaryIds.has(t.id) && (!editingId || !wouldCycle(tasks, editingId, t.id)));
              return (
                <TextField
                  select fullWidth label="Predecessors (finish-to-start)"
                  value={form.predecessors}
                  SelectProps={{
                    multiple: true,
                    renderValue: (sel) => {
                      const arr = sel as string[];
                      return arr.length === 0 ? 'None' : arr.map((pid) => tasks.find((t) => t.id === pid)?.name || '?').join(', ');
                    },
                  }}
                  onChange={(e) => setForm((f) => ({ ...f, predecessors: e.target.value as unknown as string[] }))}
                  helperText={form.predecessors.length > 0 ? 'This task starts after the selected task(s) finish.' : 'Optional — link this task to start after others.'}
                >
                  {cands.length === 0 && <MenuItem disabled value="">No other tasks to depend on</MenuItem>}
                  {cands.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      <Checkbox checked={form.predecessors.includes(t.id)} size="small" sx={{ py: 0 }} />
                      {t.name}
                    </MenuItem>
                  ))}
                </TextField>
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

      {/* Save version dialog */}
      <Dialog open={saveVerOpen} onClose={() => !savingVer && setSaveVerOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save schedule version</DialogTitle>
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveVerOpen(false)} disabled={savingVer}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveVersion()} disabled={savingVer} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>
            {savingVer ? 'Saving…' : 'Save version'}
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
                    </TableCell>
                    <TableCell align="right">{v.taskCount}</TableCell>
                    <TableCell align="right">{v.overallProgress}%</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
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
