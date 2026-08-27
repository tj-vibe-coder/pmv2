import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
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
import { useQuotationStore } from '../../store/quotationStore';
import type { ServiceLine } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { blurNumberInputOnWheel } from '../../utils/calcsheet/numberInput';
import {
  MS_PER_DAY, addDays, daysBetween, durationOf, fmt, toDate, todayStr,
} from '../../utils/calcsheet/scheduleDates';
import { exportScheduleXlsx } from '../../utils/calcsheet/scheduleXlsxExport';
import { exportSchedulePdf } from '../../utils/calcsheet/schedulePdfExport';
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
}

const emptyForm = (): TaskFormState => ({
  name: '', category: 'Engineering', startDate: todayStr(), durationDays: 1, progressPct: 0, isMilestone: false, notes: '',
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

export default function CalcsheetProjectSchedule() {
  const { id = '' } = useParams();
  const project = useQuotationStore((s) => s.projects.find((p) => p.id === id));
  const allQuotations = useQuotationStore((s) => s.quotations);
  const quotations = useMemo(() => allQuotations.filter((q) => q.projectId === id), [allQuotations, id]);

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
    if (sorted.length === 0) {
      const start = toDate(todayStr());
      const end = new Date(start.getTime() + 27 * MS_PER_DAY);
      return { start, end };
    }
    let min = toDate(sorted[0].startDate);
    let max = toDate(sorted[0].endDate);
    for (const t of sorted) {
      const s = toDate(t.startDate);
      const e = toDate(t.endDate);
      if (s < min) min = s;
      if (e > max) max = e;
    }
    // pad a few days either side so bars don't touch the edges
    min = new Date(min.getTime() - 2 * MS_PER_DAY);
    max = new Date(max.getTime() + 2 * MS_PER_DAY);
    return { start: min, end: max };
  }, [sorted]);

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
      durationDays: t.isMilestone ? 1 : durationOf(t.startDate, t.endDate),
      progressPct: t.progressPct, isMilestone: t.isMilestone, notes: t.notes || '',
    });
    setFormErr('');
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { setFormErr('Task name is required.'); return; }
    const duration = form.isMilestone ? 1 : Math.max(1, Math.round(form.durationDays) || 1);
    const endDate = addDays(form.startDate, duration - 1);
    const payload = {
      name: form.name, category: form.category, startDate: form.startDate, endDate,
      progressPct: form.progressPct, isMilestone: form.isMilestone, notes: form.notes,
    };
    setSaving(true);
    setFormErr('');
    try {
      if (editingId) {
        const r = await api<{ success: boolean; task: ScheduleTask }>('PUT', `/api/schedule-tasks/${editingId}`, payload);
        setTasks((prev) => prev.map((t) => (t.id === editingId ? r.task : t)));
      } else {
        const r = await api<{ success: boolean; task: ScheduleTask }>('POST', '/api/schedule-tasks', {
          ...payload, projectId: id, order: tasks.length,
        });
        setTasks((prev) => [...prev, r.task]);
      }
      setDialogOpen(false);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api('DELETE', `/api/schedule-tasks/${deleteTarget.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== deleteTarget.id));
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
        const startDate = cursor;
        const endDate = addDays(startDate, duration - 1);
        const r = await api<{ success: boolean; task: ScheduleTask }>('POST', '/api/schedule-tasks', {
          projectId: id,
          name: s.description || 'Untitled work item',
          category: guessCategory(s.description || ''),
          startDate,
          endDate,
          progressPct: 0,
          isMilestone: false,
          order: orderCursor++,
        });
        created.push(r.task);
        cursor = addDays(endDate, 1);
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
    if (!project) return;
    setExportBusy('xlsx');
    setExportErr('');
    try {
      await exportScheduleXlsx(project, sorted);
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : 'Excel export failed');
    } finally {
      setExportBusy(null);
    }
  };

  const runExportPdf = async () => {
    if (!project) return;
    setExportBusy('pdf');
    setExportErr('');
    try {
      await exportSchedulePdf(project, sorted);
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setExportBusy(null);
    }
  };

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
      api('PUT', `/api/schedule-tasks/${current.id}`, { startDate: current.startDate, endDate: current.endDate })
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

  if (!project) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Project not found. <Link to="/sales/calcsheet/projects">Back to projects</Link></Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 2 }}>
      <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <IconButton size="small" component={Link} to={`/sales/calcsheet/projects/${project.id}`}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
              Work Schedule
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 5 }}>
            {project.code} — {project.name}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
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
          <Button
            variant="outlined" startIcon={<PlaylistAddIcon />} onClick={openImport}
            disabled={quotations.length === 0}
          >
            Import from Calcsheet
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>
            Add Task
          </Button>
        </Stack>
      </Box>

      {err && <Alert severity="error" sx={{ mb: 1.5 }}>{err}</Alert>}
      {exportErr && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setExportErr('')}>{exportErr}</Alert>}
      {loading && <LinearProgress sx={{ mb: 1.5 }} />}

      {!loading && sorted.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No schedule tasks yet. Add tasks to build the project timeline.</Typography>
        </Paper>
      )}

      {sorted.length > 0 && (
        <Paper sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', minWidth: 280 + totalDays * DAY_WIDTH }}>
            {/* Task label column */}
            <Box sx={{ width: 280, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 2 }}>
              <Box sx={{ height: 48, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', px: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>TASK</Typography>
              </Box>
              {sorted.map((t) => (
                <Box key={t.id} sx={{ height: 44, display: 'flex', alignItems: 'center', px: 1.5, borderBottom: '1px solid', borderColor: 'divider', gap: 0.75 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SCHEDULE_CATEGORY_COLORS[t.category || 'Other'] || NET_PACIFIC_COLORS.info, flexShrink: 0 }} />
                  <Tooltip title={t.name}>
                    <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: t.isMilestone ? 700 : 400 }}>
                      {t.name}
                    </Typography>
                  </Tooltip>
                  <IconButton size="small" onClick={() => openEdit(t)}><EditIcon sx={{ fontSize: 15 }} /></IconButton>
                  <IconButton size="small" onClick={() => setDeleteTarget(t)}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton>
                </Box>
              ))}
            </Box>

            {/* Timeline */}
            <Box sx={{ position: 'relative' }}>
              <Box sx={{ display: 'flex', height: 48, borderBottom: '1px solid', borderColor: 'divider' }}>
                {months.map((m, i) => (
                  <Box key={i} sx={{ width: m.days * DAY_WIDTH, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>{m.label}</Typography>
                  </Box>
                ))}
              </Box>
              {sorted.map((t) => {
                const offset = daysBetween(range.start, toDate(t.startDate)) * DAY_WIDTH;
                const width = Math.max(DAY_WIDTH, (daysBetween(toDate(t.startDate), toDate(t.endDate)) + 1) * DAY_WIDTH);
                const color = SCHEDULE_CATEGORY_COLORS[t.category || 'Other'] || NET_PACIFIC_COLORS.info;
                const isDragging = draggingTaskId === t.id;
                return (
                  <Box key={t.id} sx={{ height: 44, position: 'relative', borderBottom: '1px solid', borderColor: 'divider' }}>
                    {t.isMilestone ? (
                      <Tooltip title={isDragging ? '' : `${t.name} — ${fmt(toDate(t.startDate))} · drag to move`}>
                        <Box
                          onMouseDown={(e) => startDrag(e, t, 'move')}
                          sx={{
                            position: 'absolute', left: offset + DAY_WIDTH / 2 - 7, top: 12, width: 14, height: 14,
                            bgcolor: color, transform: 'rotate(45deg)', cursor: isDragging ? 'grabbing' : 'grab',
                            boxShadow: isDragging ? '0 0 0 3px rgba(0,0,0,0.15)' : 'none',
                          }}
                        />
                      </Tooltip>
                    ) : (
                      <Tooltip title={isDragging ? '' : `${t.name} — ${fmt(toDate(t.startDate))} to ${fmt(toDate(t.endDate))} (${t.progressPct}%) · drag to move, edge to resize`}>
                        <Box
                          onMouseDown={(e) => startDrag(e, t, 'move')}
                          sx={{
                            position: 'absolute', left: offset, top: 10, width, height: 24, borderRadius: 1,
                            bgcolor: `${color}33`, border: `1px solid ${color}`, cursor: isDragging ? 'grabbing' : 'grab',
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
                Ends {fmt(toDate(addDays(form.startDate, Math.max(1, Math.round(form.durationDays) || 1) - 1)))}
              </Typography>
            )}
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
    </Box>
  );
}
