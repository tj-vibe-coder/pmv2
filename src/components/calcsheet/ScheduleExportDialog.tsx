import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  LinearProgress, Radio, RadioGroup, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { saveAs } from 'file-saver';
import type { TreeRow } from '../../utils/calcsheet/scheduleTree';
import {
  EXPORT_COLUMNS, PAPER_SIZES, defaultExportSettings, droppedColumns, renderSchedulePdf, schedulePdfFileName,
  type ScheduleExportData, type ScheduleExportSettings, type PaperSize,
} from '../../utils/calcsheet/schedulePdfExport';

// Export Gantt dialog: layout / document / chart settings on the left, a live
// preview of the exact PDF pages on the right. Settings are remembered per
// project. No company branding or sign-off block — schedules also go out on
// projects where IOCT is the subcontractor.

interface Props {
  open: boolean;
  onClose: () => void;
  /** Storage key for remembered settings. */
  projectId: string;
  project: { code?: string; name?: string };
  rows: TreeRow[];
  loadData: () => Promise<ScheduleExportData>;
  /** Page toggles carried in as the chart defaults each time the dialog opens. */
  initial: { showCritical: boolean; showBaseline: boolean };
  hasBaseline: boolean;
}

const storageKey = (id: string) => `gantt-export-${id}`;

function loadSettings(id: string, project: Props['project']): ScheduleExportSettings {
  const base = defaultExportSettings(project);
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ScheduleExportSettings>;
    // Keep only known keys (older saves carried title-block fields).
    const known = Object.fromEntries(Object.entries(saved).filter(([k]) => k in base)) as Partial<ScheduleExportSettings>;
    return { ...base, ...known, columns: { ...base.columns, ...(saved.columns || {}) } };
  } catch {
    return base;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 1 }}>{title}</Typography>
      <Stack spacing={1.25} sx={{ mt: 0.5 }}>{children}</Stack>
    </Box>
  );
}

export default function ScheduleExportDialog({ open, onClose, projectId, project, rows, loadData, initial, hasBaseline }: Props) {
  const [s, setS] = useState<ScheduleExportSettings>(() => loadSettings(projectId, project));
  const [data, setData] = useState<ScheduleExportData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const renderSeq = useRef(0);
  const blobRef = useRef<Blob | null>(null);

  // Fresh settings + data each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setS({ ...loadSettings(projectId, project), showCritical: initial.showCritical, showBaseline: initial.showBaseline });
    setData(null);
    setErr('');
    loadData().then(setData).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load schedule data'));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember settings (Date issued is always today's on open).
  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(storageKey(projectId), JSON.stringify(s)); } catch { /* ignore */ }
  }, [s, open, projectId]);

  // Live preview, debounced; a newer render supersedes an older one.
  useEffect(() => {
    if (!open || !data) return undefined;
    const seq = ++renderSeq.current;
    setRendering(true);
    const timer = window.setTimeout(() => {
      renderSchedulePdf(project, rows, data, s)
        .then((blob) => {
          if (seq !== renderSeq.current) return;
          blobRef.current = blob;
          setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
          setErr('');
        })
        .catch((e) => { if (seq === renderSeq.current) setErr(e instanceof Error ? e.message : 'Preview failed'); })
        .finally(() => { if (seq === renderSeq.current) setRendering(false); });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [s, data, open, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => { if (!open) { setPreviewUrl(null); blobRef.current = null; } }, [open]);

  const set = <K extends keyof ScheduleExportSettings>(k: K, v: ScheduleExportSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const check = (k: keyof ScheduleExportSettings, label: string, disabled = false, hint?: string) => (
    <FormControlLabel
      sx={{ my: -0.5 }}
      disabled={disabled}
      control={<Checkbox size="small" checked={!!s[k] && !disabled} onChange={(e) => set(k, e.target.checked as never)} />}
      label={<Typography variant="body2">{label}{hint && <Typography component="span" variant="caption" color="text.secondary"> — {hint}</Typography>}</Typography>}
    />
  );
  const text = (k: keyof ScheduleExportSettings, label: string, props: Record<string, unknown> = {}) => (
    <TextField size="small" fullWidth label={label} value={s[k] as string} onChange={(e) => set(k, e.target.value as never)} {...props} />
  );

  const dropped = droppedColumns(s, hasBaseline && s.showBaseline);
  const rangeBad = s.range === 'custom' && (!s.rangeStart || !s.rangeEnd || s.rangeStart > s.rangeEnd);

  const download = async () => {
    if (!data) return;
    setBusy(true);
    try {
      // Re-render if the preview is stale (settings changed within the debounce).
      const blob = !rendering && blobRef.current ? blobRef.current : await renderSchedulePdf(project, rows, data, s);
      saveAs(blob, schedulePdfFileName(project, s));
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xl" fullWidth PaperProps={{ sx: { height: '92vh' } }}>
      <DialogTitle sx={{ pb: 1 }}>Export Gantt PDF</DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', minHeight: 0 }}>
        {/* Settings */}
        <Box sx={{ width: 380, flexShrink: 0, overflowY: 'auto', p: 2, borderRight: 1, borderColor: 'divider' }}>
          <Section title="Layout">
            <ToggleButtonGroup size="small" exclusive fullWidth value={s.paper} onChange={(_, v: PaperSize | null) => v && set('paper', v)}>
              {(Object.keys(PAPER_SIZES) as PaperSize[]).map((p) => <ToggleButton key={p} value={p}>{PAPER_SIZES[p].label}</ToggleButton>)}
            </ToggleButtonGroup>
            <ToggleButtonGroup size="small" exclusive fullWidth value={s.orientation} onChange={(_, v: ScheduleExportSettings['orientation'] | null) => v && set('orientation', v)}>
              <ToggleButton value="landscape">Landscape</ToggleButton>
              <ToggleButton value="portrait">Portrait</ToggleButton>
            </ToggleButtonGroup>
            <RadioGroup value={s.layout} onChange={(e) => set('layout', e.target.value as ScheduleExportSettings['layout'])}>
              <FormControlLabel sx={{ my: -0.5 }} value="fit" control={<Radio size="small" />} label={<Typography variant="body2">Fit the schedule on one page</Typography>} />
              <FormControlLabel sx={{ my: -0.5 }} value="paged" control={<Radio size="small" />} label={<Typography variant="body2">Multiple pages <Typography component="span" variant="caption" color="text.secondary">— readable rows; header and task columns repeat</Typography></Typography>} />
            </RadioGroup>
            <RadioGroup value={s.range} onChange={(e) => set('range', e.target.value as ScheduleExportSettings['range'])}>
              <FormControlLabel sx={{ my: -0.5 }} value="project" control={<Radio size="small" />} label={<Typography variant="body2">Whole project</Typography>} />
              <FormControlLabel sx={{ my: -0.5 }} value="custom" control={<Radio size="small" />} label={<Typography variant="body2">Date range <Typography component="span" variant="caption" color="text.secondary">— e.g. a 3-week look-ahead</Typography></Typography>} />
            </RadioGroup>
            {s.range === 'custom' && (
              <Stack direction="row" spacing={1}>
                <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={s.rangeStart} onChange={(e) => set('rangeStart', e.target.value)} error={rangeBad} />
                <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={s.rangeEnd} onChange={(e) => set('rangeEnd', e.target.value)} error={rangeBad} />
              </Stack>
            )}
            {s.range === 'custom' && check('rangeTasksOnly', 'Only tasks active in this range')}
            {rangeBad && <Typography variant="caption" color="error">Pick a start and end date (start before end) — showing the whole project meanwhile.</Typography>}
            {check('includeSCurve', 'Include S-Curve page')}
            {check('includeManpower', 'Include manpower chart', !s.includeSCurve)}
          </Section>

          <Divider sx={{ mb: 1.5 }} />
          <Section title="Document">
            {text('title', 'Document title')}
            <Stack direction="row" spacing={1}>
              <Box sx={{ width: 150, flexShrink: 0 }}>{text('projectNumber', 'Project no.')}</Box>
              {text('revision', 'Revision')}
            </Stack>
            {text('projectTitle', 'Project title')}
          </Section>

          <Divider sx={{ mb: 1.5 }} />
          <Section title="Chart">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {check('showDependencies', 'Dependencies')}
              {check('showProgress', 'Progress')}
              {check('showBaseline', 'Baseline', !hasBaseline)}
              {check('showCritical', 'Critical path')}
              {check('showTaskLabels', 'Task labels')}
              {check('showManpower', 'Manpower')}
              {check('showToday', 'Today line')}
              {check('showWeekends', 'Weekends')}
            </Box>
            <Typography variant="caption" color="text.secondary">Columns</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', mt: '0 !important' }}>
              {EXPORT_COLUMNS.map((c) => (
                <FormControlLabel
                  key={c.key}
                  sx={{ my: -0.5 }}
                  control={<Checkbox size="small" checked={s.columns[c.key]} onChange={(e) => set('columns', { ...s.columns, [c.key]: e.target.checked })} />}
                  label={<Typography variant="body2">{c.label}</Typography>}
                />
              ))}
            </Box>
            {dropped.length > 0 && (
              <Alert severity="info" sx={{ py: 0 }}>
                Not enough width on {PAPER_SIZES[s.paper].label} {s.orientation} for: {dropped.join(', ')} — use a larger paper or landscape to include them.
              </Alert>
            )}
          </Section>
          <Button size="small" onClick={() => setS({ ...defaultExportSettings(project), showCritical: initial.showCritical, showBaseline: initial.showBaseline })}>
            Reset to defaults
          </Button>
        </Box>

        {/* Preview */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', bgcolor: '#525659', position: 'relative' }}>
          {(rendering || !data) && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }} />}
          {err && <Alert severity="error" sx={{ m: 2 }}>{err}</Alert>}
          {previewUrl ? (
            <Box component="iframe" title="PDF preview" src={`${previewUrl}#view=Fit`} sx={{ flex: 1, border: 0, width: '100%', bgcolor: '#525659' }} />
          ) : (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', opacity: 0.8 }}>
              <Typography variant="body2">Preparing preview…</Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', ml: 1 }}>{schedulePdfFileName(project, s)}</Typography>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained" startIcon={<PictureAsPdfIcon />} onClick={() => void download()}
          disabled={busy || !data} sx={{ bgcolor: '#2c5aa0' }}
        >
          {busy ? 'Exporting…' : 'Download PDF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
