import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, Link, MenuItem, Paper, Snackbar, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { API_BASE } from '../../../config/api';
import type { BillingDocKind, BillingStatement, BlsLine, BlsRefRow } from '../../../types/BillingStatement';
import { computeBlsTotals, DEFAULT_BLS_SUBTITLE, DEFAULT_BLS_TERMS, parseDocFilename } from '../../../types/BillingStatement';
import {
  createBillingStatement, deleteBillingStatement, listBillingStatements, nextBlsNo, updateBillingStatement,
} from '../../../services/billingStatementService';
import { generateBlsPdfBlob } from '../../../utils/bls/blsPdfExport';
import { getOrCreateChildFolderById, listChildrenById, uploadFileToFolderById } from '../../../services/onedriveFolderService';
import { useAuth } from '../../../contexts/AuthContext';

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

const NUM = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Where billing documents are filed inside a project's execution folder. */
const INVOICE_SUBFOLDER = 'Sales Invoice';

interface ProjectOption {
  id: string;
  project_no?: string;
  project_name: string;
  account_name?: string;
  po_number?: string;
  with_acti?: boolean;
  executionFolderId?: string;
}

const projectLabel = (p: ProjectOption) => `${p.project_no || '—'} · ${p.project_name}`;

async function fileToOneDrive(project: ProjectOption, filename: string, blob: Blob) {
  if (!project.executionFolderId) {
    throw new Error('This project has no OneDrive execution folder yet. Link it from the project page first.');
  }
  const sub = await getOrCreateChildFolderById('server', 'server', project.executionFolderId, INVOICE_SUBFOLDER);
  // Never overwrite: the upload endpoint replaces a same-named file, so refuse instead.
  const existing = await listChildrenById('server', 'server', sub.id);
  if (existing.some((c) => (c.name || '').toLowerCase() === filename.toLowerCase())) {
    throw new Error(`${filename} already exists in the project's ${INVOICE_SUBFOLDER} folder.`);
  }
  const item = await uploadFileToFolderById('server', 'server', sub.id, filename, blob);
  return {
    onedrive_item_id: item.id,
    onedrive_web_url: item.webUrl,
    filename,
    uploaded_at: new Date().toISOString(),
  };
}

const todayISO = () => new Date().toISOString().slice(0, 10);

// ─── Editor ──────────────────────────────────────────────────────────────────
interface EditorProps {
  open: boolean;
  bls: BillingStatement | null;
  projects: ProjectOption[];
  onClose: () => void;
  onSaved: (saved: BillingStatement) => void;
  onError: (msg: string) => void;
}

function BlsEditorDialog({ open, bls, projects, onClose, onSaved, onError }: EditorProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectOption | null>(null);
  const [docNo, setDocNo] = useState('');
  const [date, setDate] = useState(todayISO());
  const [billedToName, setBilledToName] = useState('');
  const [billedToAddress, setBilledToAddress] = useState('');
  const [attention, setAttention] = useState('');
  const [subtitle, setSubtitle] = useState(DEFAULT_BLS_SUBTITLE);
  const [billingLabel, setBillingLabel] = useState('Final (100%)');
  const [refRows, setRefRows] = useState<BlsRefRow[]>([]);
  const [lines, setLines] = useState<BlsLine[]>([{ description: '', qty: 1, unit: 'lot', unitPrice: 0 }]);
  const [whtPct, setWhtPct] = useState(0);
  const [docsText, setDocsText] = useState('');
  const [terms, setTerms] = useState(DEFAULT_BLS_TERMS);
  const [approverLabel, setApproverLabel] = useState('Verified / approved by');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (bls) {
      setProject(projects.find((p) => String(p.id) === String(bls.projectId)) || null);
      setDocNo(bls.docNo);
      setDate(bls.date);
      setBilledToName(bls.billedToName || '');
      setBilledToAddress(bls.billedToAddress || '');
      setAttention(bls.attention || '');
      setSubtitle(bls.subtitle || DEFAULT_BLS_SUBTITLE);
      setBillingLabel(bls.billingLabel || 'Final (100%)');
      setRefRows(bls.refRows || []);
      setLines(bls.lines?.length ? bls.lines : [{ description: '', qty: 1, unit: 'lot', unitPrice: 0 }]);
      setWhtPct(bls.whtPct ?? 0);
      setDocsText((bls.supportingDocs || []).join('\n'));
      setTerms(bls.terms || DEFAULT_BLS_TERMS);
      setApproverLabel(bls.approverLabel || 'Verified / approved by');
    } else {
      setProject(null);
      setDocNo('');
      setDate(todayISO());
      setBilledToName('');
      setBilledToAddress('');
      setAttention('');
      setSubtitle(DEFAULT_BLS_SUBTITLE);
      setBillingLabel('Final (100%)');
      setRefRows([]);
      setLines([{ description: '', qty: 1, unit: 'lot', unitPrice: 0 }]);
      setWhtPct(0);
      setDocsText('');
      setTerms(DEFAULT_BLS_TERMS);
      setApproverLabel('Verified / approved by');
    }
  }, [open, bls, projects]);

  const pickProject = async (p: ProjectOption | null) => {
    setProject(p);
    if (!p || bls) return;
    // Defaults by customer: ACTI-fronted jobs bill ACTI with 2% WHT; direct customers have none.
    if (p.with_acti) {
      setBilledToName('Advance Controle Technologie Inc.');
      setBilledToAddress('Block 13 Lot 8, Mindanao Ave., Gavino Maderan,\nGen. Mariano Alvarez, Cavite 4117');
      setWhtPct(2);
      setApproverLabel('Verified / approved by (ACTI)');
    } else {
      setBilledToName(p.account_name || '');
      setBilledToAddress('');
      setWhtPct(0);
      setApproverLabel(`Received / acknowledged by (${p.account_name || 'customer'})`);
    }
    setRefRows([
      { label: 'Project No.', value: p.project_no || '' },
      { label: 'Project', value: p.project_name },
      ...(p.po_number ? [{ label: 'Customer PO', value: p.po_number }] : []),
    ]);
    if (p.project_no) {
      try { setDocNo(await nextBlsNo(p.project_no)); } catch { /* shown as blank; server assigns on save */ }
    }
  };

  const totals = useMemo(() => computeBlsTotals(lines, whtPct), [lines, whtPct]);
  const setLine = (i: number, patch: Partial<BlsLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const setRef = (i: number, patch: Partial<BlsRefRow>) => setRefRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!project?.project_no) { onError('Pick a project that has a project number.'); return; }
    if (!lines.some((l) => l.description.trim() && l.qty > 0)) { onError('Add at least one billing line.'); return; }
    setSaving(true);
    try {
      const payload: Partial<BillingStatement> = {
        kind: 'BLS',
        docNo: docNo || undefined,
        date,
        projectId: String(project.id),
        projectNo: project.project_no,
        projectName: project.project_name,
        billedToName, billedToAddress, attention, subtitle, billingLabel, refRows,
        lines: lines.filter((l) => l.description.trim()),
        whtPct,
        supportingDocs: docsText.split('\n').map((s) => s.trim()).filter(Boolean),
        terms, approverLabel,
        preparedByName: bls?.preparedByName || user?.full_name || undefined,
      };
      const saved = bls ? await updateBillingStatement(bls.id, payload) : await createBillingStatement(payload);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      onError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle>{bls ? `Edit ${bls.docNo}` : 'New Billing Statement'}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Autocomplete
              options={projects}
              value={project}
              disabled={!!bls}
              getOptionLabel={projectLabel}
              isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
              onChange={(_, v) => { void pickProject(v); }}
              renderInput={(params) => <TextField {...params} label="Project" size="small" />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField size="small" fullWidth label="Doc. No." value={docNo} disabled={!!bls}
              onChange={(e) => setDocNo(e.target.value)} helperText="Blank = auto (ProjectNo-BLS-NN)" />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField size="small" fullWidth type="date" label="Date" value={date}
              onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField size="small" fullWidth label="Billed to" value={billedToName} onChange={(e) => setBilledToName(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField size="small" fullWidth label="Attention" value={attention} onChange={(e) => setAttention(e.target.value)} />
          </Grid>
          <Grid size={12}>
            <TextField size="small" fullWidth multiline minRows={2} label="Billed-to address (one line per row)"
              value={billedToAddress} onChange={(e) => setBilledToAddress(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField size="small" fullWidth label="Subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField size="small" fullWidth label="Billing" value={billingLabel} onChange={(e) => setBillingLabel(e.target.value)} />
          </Grid>

          <Grid size={12}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, mb: 0.5 }}>Project reference</Typography>
            <Stack spacing={1}>
              {refRows.map((r, i) => (
                <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField size="small" label="Label" value={r.label} sx={{ minWidth: { xs: '100%', sm: 180 } }} onChange={(e) => setRef(i, { label: e.target.value })} />
                  <TextField size="small" label="Value" value={r.value} fullWidth onChange={(e) => setRef(i, { value: e.target.value })} />
                  <IconButton size="small" aria-label="Remove row" onClick={() => setRefRows((rs) => rs.filter((_, k) => k !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
              <Box><Button size="small" startIcon={<AddIcon />} onClick={() => setRefRows((rs) => [...rs, { label: '', value: '' }])}>Add reference row</Button></Box>
            </Stack>
          </Grid>

          <Grid size={12}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, mb: 0.5 }}>Billing lines</Typography>
            <Stack spacing={1}>
              {lines.map((l, i) => (
                <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                  <TextField size="small" label="Description" value={l.description} fullWidth onChange={(e) => setLine(i, { description: e.target.value })} />
                  <TextField size="small" label="Qty" type="number" value={l.qty} sx={{ width: { xs: '100%', sm: 80 } }} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
                  <TextField size="small" label="Unit" value={l.unit} sx={{ width: { xs: '100%', sm: 80 } }} onChange={(e) => setLine(i, { unit: e.target.value })} />
                  <TextField size="small" label="Unit price" type="number" value={l.unitPrice} sx={{ width: { xs: '100%', sm: 130 } }} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} />
                  <IconButton size="small" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
              <Box><Button size="small" startIcon={<AddIcon />} onClick={() => setLines((ls) => [...ls, { description: '', qty: 1, unit: 'lot', unitPrice: 0 }])}>Add line</Button></Box>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField size="small" fullWidth type="number" label="Withholding tax %" value={whtPct}
              onChange={(e) => setWhtPct(Number(e.target.value))} helperText="0 hides the row" />
          </Grid>
          <Grid size={{ xs: 12, sm: 8 }}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="body2">Total sales (Non-VAT): <b>₱{NUM(totals.gross)}</b></Typography>
              {whtPct > 0 && <Typography variant="body2">Less withholding ({whtPct}%): <b>(₱{NUM(totals.wht)})</b></Typography>}
              <Typography variant="body1" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>Total amount due: ₱{NUM(totals.net)}</Typography>
            </Paper>
          </Grid>

          <Grid size={12}>
            <TextField size="small" fullWidth multiline minRows={3} label="Supporting documents attached (one per line)"
              value={docsText} onChange={(e) => setDocsText(e.target.value)} />
          </Grid>
          <Grid size={12}>
            <TextField size="small" fullWidth multiline minRows={2} label="Terms" value={terms} onChange={(e) => setTerms(e.target.value)} />
          </Grid>
          <Grid size={12}>
            <TextField size="small" fullWidth label="Approver box label" value={approverLabel} onChange={(e) => setApproverLabel(e.target.value)}
              helperText="Printed above the second signature box (changes by customer)" />
          </Grid>
          <Grid size={12}>
            <Alert severity="info" sx={{ py: 0 }}>Everything on this page prints on the customer's copy — keep internal notes out.</Alert>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Import ──────────────────────────────────────────────────────────────────
interface ImportProps {
  open: boolean;
  projects: ProjectOption[];
  existing: BillingStatement[];
  onClose: () => void;
  onImported: (saved: BillingStatement) => void;
  onError: (msg: string) => void;
}

function BlsImportDialog({ open, projects, existing, onClose, onImported, onError }: ImportProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [project, setProject] = useState<ProjectOption | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docNo, setDocNo] = useState('');
  const [kind, setKind] = useState<BillingDocKind>('BLS');
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setProject(null); setFile(null); setDocNo(''); setKind('BLS'); setDate(todayISO()); }
  }, [open]);

  const onFile = (f: File | null) => {
    setFile(f);
    if (!f) return;
    const parsed = parseDocFilename(f.name);
    setDocNo(parsed?.docNo || f.name.replace(/\.[^.]+$/, ''));
    if (parsed) {
      setKind(parsed.kind);
      const match = projects.find((p) => p.project_no === parsed.projectNo);
      if (match) setProject(match);
    }
  };

  const submit = async () => {
    if (!project?.project_no || !file || !docNo.trim()) { onError('Pick the project, a PDF file and its document number.'); return; }
    if (existing.some((e) => e.docNo.toLowerCase() === docNo.trim().toLowerCase() && e.projectNo === project.project_no)) {
      onError(`${docNo.trim()} is already filed for this project.`);
      return;
    }
    setBusy(true);
    try {
      const filename = `${docNo.trim().replace(/[\\/]/g, '-')}.pdf`;
      const uploaded = await fileToOneDrive(project, filename, file);
      const saved = await createBillingStatement({
        kind, docNo: docNo.trim(), date, source: 'imported',
        projectId: String(project.id), projectNo: project.project_no, projectName: project.project_name,
        file: uploaded,
      });
      onImported(saved);
      onClose();
    } catch (err: any) {
      onError(err.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>Import an existing BLS / SOA</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Alert severity="info" sx={{ py: 0 }}>
            The PDF is filed in the project's <b>{INVOICE_SUBFOLDER}</b> OneDrive folder and attached to the project here.
            Nothing is overwritten.
          </Alert>
          <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
            {file ? file.name : 'Choose PDF'}
            <input hidden type="file" accept="application/pdf,.pdf" onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ''; }} />
          </Button>
          <Autocomplete
            options={projects}
            value={project}
            getOptionLabel={projectLabel}
            isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
            onChange={(_, v) => setProject(v)}
            renderInput={(params) => <TextField {...params} label="Project" size="small" />}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField size="small" select label="Type" value={kind} onChange={(e) => setKind(e.target.value as BillingDocKind)} sx={{ minWidth: { xs: '100%', sm: 140 } }}>
              <MenuItem value="BLS">Billing Statement</MenuItem>
              <MenuItem value="SOA">Statement of Account</MenuItem>
            </TextField>
            <TextField size="small" fullWidth label="Document no." value={docNo} onChange={(e) => setDocNo(e.target.value)}
              helperText="Existing numbers (e.g. SOA-2026-004) are kept as-is" />
          </Stack>
          <TextField size="small" type="date" label="Document date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy || !file}>{busy ? 'Importing…' : 'Import'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function BlsPage() {
  const [rows, setRows] = useState<BillingStatement[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | BillingDocKind>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BillingStatement | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, projRes] = await Promise.all([
        listBillingStatements(),
        fetch(`${API_BASE}/api/projects`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('netpacific_token') || ''}` },
        }).then((r) => (r.ok ? r.json() : [])),
      ]);
      setRows(list);
      const arr: any[] = Array.isArray(projRes) ? projRes : projRes?.data || [];
      setProjects(arr.map((p) => ({
        id: String(p.id), project_no: p.project_no, project_name: p.project_name, account_name: p.account_name,
        po_number: p.po_number, with_acti: p.with_acti, executionFolderId: p.executionFolderId,
      })));
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load billing documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || [r.docNo, r.projectNo, r.projectName, r.billedToName].some((v) => (v || '').toLowerCase().includes(q));
  }), [rows, search, kindFilter]);

  const metrics = useMemo(() => ({
    total: rows.length,
    generated: rows.filter((r) => r.source !== 'imported').length,
    imported: rows.filter((r) => r.source === 'imported').length,
    unfiled: rows.filter((r) => !r.file).length,
  }), [rows]);

  const upsert = (saved: BillingStatement) => setRows((rs) => (rs.some((r) => r.id === saved.id) ? rs.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...rs]));

  const projectOf = (r: BillingStatement) => projects.find((p) => String(p.id) === String(r.projectId));

  const download = async (r: BillingStatement) => {
    setBusyId(r.id);
    try {
      const { saveAs } = await import('file-saver');
      saveAs(await generateBlsPdfBlob(r), `${r.docNo}.pdf`);
    } catch (err: any) {
      setError(err.message || 'Failed to build PDF');
    } finally { setBusyId(''); }
  };

  const fileToProject = async (r: BillingStatement) => {
    const project = projectOf(r);
    if (!project) { setError('Project not found for this document.'); return; }
    setBusyId(r.id);
    try {
      const uploaded = await fileToOneDrive(project, `${r.docNo}.pdf`, await generateBlsPdfBlob(r));
      upsert(await updateBillingStatement(r.id, { file: uploaded }));
      setToast(`${r.docNo} saved to the project's ${INVOICE_SUBFOLDER} folder`);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally { setBusyId(''); }
  };

  const remove = async (r: BillingStatement) => {
    const note = r.file ? '\n\nThe OneDrive copy is NOT deleted.' : '';
    if (!window.confirm(`Delete ${r.docNo} from the app?${note}`)) return;
    try {
      await deleteBillingStatement(r.id);
      setRows((rs) => rs.filter((x) => x.id !== r.id));
    } catch (err: any) { setError(err.message || 'Delete failed'); }
  };

  const kpis = [
    { label: 'DOCUMENTS', value: metrics.total, caption: 'BLS + imported SOAs', grad: [NET_PACIFIC_COLORS.primary, NET_PACIFIC_COLORS.secondary] },
    { label: 'GENERATED', value: metrics.generated, caption: 'Made in the app', grad: [NET_PACIFIC_COLORS.accent1, NET_PACIFIC_COLORS.accent2] },
    { label: 'IMPORTED', value: metrics.imported, caption: 'Existing files filed', grad: ['#e67e22', '#d35400'] },
    { label: 'NOT YET IN ONEDRIVE', value: metrics.unfiled, caption: 'Save to the project folder', grad: [NET_PACIFIC_COLORS.success, '#00a884'] },
  ];

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 1, alignItems: 'center', mb: 2 }}>
        <RequestQuoteIcon sx={{ mr: 1.5, color: NET_PACIFIC_COLORS.primary, fontSize: 32 }} />
        <Typography variant="h4" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>Billing Statements</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {kpis.map((k) => (
          <Grid key={k.label} size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper elevation={1} sx={{ p: 2.5, borderRadius: 2, background: `linear-gradient(135deg, ${k.grad[0]} 0%, ${k.grad[1]} 100%)`, color: 'white' }}>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>{k.label}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5 }}>{k.value}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{k.caption}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper elevation={1} sx={{ p: 1.5, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField size="small" fullWidth placeholder="Search by doc no., project or customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField size="small" fullWidth select label="Type" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as 'all' | BillingDocKind)}>
              <MenuItem value="all">All types</MenuItem>
              <MenuItem value="BLS">Billing Statements</MenuItem>
              <MenuItem value="SOA">Imported SOAs</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <Paper elevation={1}>
        <Box sx={{ p: 2, display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center', bgcolor: NET_PACIFIC_COLORS.primary, color: 'white', borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Billing documents ({filtered.length})</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.7)', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}>
              Import existing
            </Button>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setEditorOpen(true); }}
              sx={{ bgcolor: '#ffffff', color: NET_PACIFIC_COLORS.primary, fontWeight: 700, '&:hover': { bgcolor: '#f0f4f8' } }}>
              New Billing Statement
            </Button>
          </Stack>
        </Box>
        <TableContainer sx={{ maxHeight: 520, overflowX: 'auto' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Doc. No.</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Project</TableCell>
                <TableCell>Billed to</TableCell>
                <TableCell align="right">Amount due (₱)</TableCell>
                <TableCell>OneDrive</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} align="center"><CircularProgress size={22} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ color: 'text.secondary', py: 3 }}>No billing documents yet.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const generated = r.source !== 'imported';
                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{r.docNo}</TableCell>
                    <TableCell><Chip size="small" label={r.kind === 'SOA' ? 'SOA' : 'BLS'} color={r.kind === 'SOA' ? 'warning' : 'primary'} variant="outlined" /></TableCell>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>{r.projectNo}{r.projectName ? ` · ${r.projectName}` : ''}</TableCell>
                    <TableCell>{r.billedToName || '—'}</TableCell>
                    <TableCell align="right">{r.totalNet != null ? NUM(r.totalNet) : '—'}</TableCell>
                    <TableCell>
                      {r.file
                        ? <Link href={r.file.onedrive_web_url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>Open <OpenInNewIcon sx={{ fontSize: 14 }} /></Link>
                        : <Chip size="small" label="Not filed" />}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {generated && (
                        <>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditing(r); setEditorOpen(true); }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Download PDF"><span><IconButton size="small" disabled={busyId === r.id} onClick={() => void download(r)}><DownloadIcon fontSize="small" /></IconButton></span></Tooltip>
                          <Tooltip title={r.file ? 'Already in OneDrive' : "Save PDF to the project's Sales Invoice folder"}>
                            <span><IconButton size="small" disabled={busyId === r.id || !!r.file} onClick={() => void fileToProject(r)}><CloudUploadIcon fontSize="small" /></IconButton></span>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip title="Delete"><IconButton size="small" onClick={() => void remove(r)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <BlsEditorDialog open={editorOpen} bls={editing} projects={projects} onClose={() => setEditorOpen(false)}
        onSaved={(s) => { upsert(s); setToast(`${s.docNo} saved`); }} onError={setError} />
      <BlsImportDialog open={importOpen} projects={projects} existing={rows} onClose={() => setImportOpen(false)}
        onImported={(s) => { upsert(s); setToast(`${s.docNo} imported and filed in OneDrive`); }} onError={setError} />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
