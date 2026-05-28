import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Grid, Paper, Typography, Card, CardContent, Button,
  IconButton, TextField, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Chip, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, Tooltip, Alert, CircularProgress, Stack, Autocomplete,
  FormControl, InputLabel, Select, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PaymentIcon from '@mui/icons-material/Payment';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import type { ProjectInvoice, InvoiceStatus } from '../types/Invoice';
import {
  getInvoiceStatus,
  computeDueDate,
  formatPaymentTerms,
  PAYMENT_TERMS_OPTIONS,
} from '../types/Invoice';
import type { Project } from '../types/Project';
import { API_BASE } from '../config/api';
import { useOneDriveAuth } from '../contexts/OneDriveAuthContext';
import { resolveCorporateDriveId, uploadFileToFolder, projectFolderName } from '../services/onedriveFolderService';
import { onedriveConfig } from '../config/onedriveConfig';
import { useSearchParams, useNavigate } from 'react-router-dom';

const API = `${API_BASE}/api`;

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

const PHP = new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', minimumFractionDigits: 2,
});

const STATUS_COLORS: Record<InvoiceStatus, 'success' | 'warning' | 'error' | 'default'> = {
  paid: 'success',
  partial: 'warning',
  overdue: 'error',
  unpaid: 'default',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  partial: 'Partial',
  overdue: 'Overdue',
  unpaid: 'Unpaid',
};

const TODAY = (): string => new Date().toISOString().slice(0, 10);

// ─── form types ───────────────────────────────────────────────────────────────
interface InvoiceForm {
  project_id: string;
  project_name: string;
  project_no: string;
  invoice_no: string;
  invoice_date: string;
  amount: string;
  payment_terms_days: number;
  due_date: string;
  notes: string;
}

const blankForm = (): InvoiceForm => ({
  project_id: '',
  project_name: '',
  project_no: '',
  invoice_no: '',
  invoice_date: TODAY(),
  amount: '',
  payment_terms_days: 30,
  due_date: computeDueDate(TODAY(), 30),
  notes: '',
});

interface CollectForm {
  amount_collected: string;
  collection_date: string;
}

// ─── component ────────────────────────────────────────────────────────────────
export default function CollectionsDashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedProjectId = searchParams.get('project_id');
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | ''>('');

  // add/edit dialog
  const [invoiceDialog, setInvoiceDialog] = useState<'add' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectInvoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>(blankForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // collect dialog
  const [collectDialog, setCollectDialog] = useState<ProjectInvoice | null>(null);
  const [collectForm, setCollectForm] = useState<CollectForm>({ amount_collected: '', collection_date: TODAY() });
  const [collectSaving, setCollectSaving] = useState(false);
  const [collectErr, setCollectErr] = useState('');

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ProjectInvoice | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // OneDrive upload
  const { isAuthenticated: oneDriveSignedIn, login: oneDriveLogin, getAccessToken: getOneDriveToken } = useOneDriveAuth();
  const [uploadingScanId, setUploadingScanId] = useState<string | null>(null);
  const [uploadScanErr, setUploadScanErr] = useState('');

  // ─── fetch ───────────────────────────────────────────────────────────────
  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`${API}/invoices`);
      if (!res.ok) throw new Error(await res.text());
      setInvoices(await res.json());
    } catch {
      setError('Failed to reload invoices.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const invoiceUrl = preselectedProjectId
      ? `${API}/invoices?project_id=${encodeURIComponent(preselectedProjectId)}`
      : `${API}/invoices`;
    Promise.all([
      fetch(`${API}/projects`).then(r => r.json()),
      fetch(invoiceUrl).then(r => r.json()),
    ])
      .then(([ps, invs]) => { setProjects(ps); setInvoices(invs); })
      .catch((err: unknown) => {
        console.error('CollectionsDashboard load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data.');
      })
      .finally(() => setLoading(false));
  }, [preselectedProjectId]);

  // ─── derived data ────────────────────────────────────────────────────────
  const enriched = useMemo(() => invoices.map(inv => ({
    ...inv,
    _status: getInvoiceStatus(inv),
    _outstanding: Math.max(0, inv.amount - inv.amount_collected),
  })), [invoices]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter(inv => {
      if (filterStatus && inv._status !== filterStatus) return false;
      if (q && !(
        (inv.invoice_no || '').toLowerCase().includes(q) ||
        (inv.project_name || '').toLowerCase().includes(q) ||
        (inv.project_no || '').toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [enriched, search, filterStatus]);

  const summary = useMemo(() => {
    const totalInvoiced = enriched.reduce((s, i) => s + i.amount, 0);
    const totalCollected = enriched.reduce((s, i) => s + i.amount_collected, 0);
    const outstanding = enriched.filter(i => i._status !== 'paid').reduce((s, i) => s + i._outstanding, 0);
    const overdueAmount = enriched.filter(i => i._status === 'overdue').reduce((s, i) => s + i._outstanding, 0);
    const overdueCount = enriched.filter(i => i._status === 'overdue').length;
    return { totalInvoiced, totalCollected, outstanding, overdueAmount, overdueCount };
  }, [enriched]);

  // ─── form helpers ────────────────────────────────────────────────────────
  const handleFormChange = (field: keyof InvoiceForm, value: string | number) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if ((field === 'invoice_date' || field === 'payment_terms_days') && next.invoice_date && next.payment_terms_days) {
        next.due_date = computeDueDate(next.invoice_date, Number(next.payment_terms_days));
      }
      return next;
    });
  };

  const openAdd = () => {
    setForm(blankForm());
    setFormErr('');
    setEditTarget(null);
    setInvoiceDialog('add');
  };

  const openEdit = (inv: ProjectInvoice) => {
    setForm({
      project_id: inv.project_id,
      project_name: inv.project_name || '',
      project_no: inv.project_no || '',
      invoice_no: inv.invoice_no,
      invoice_date: inv.invoice_date,
      amount: String(inv.amount),
      payment_terms_days: inv.payment_terms_days,
      due_date: inv.due_date,
      notes: inv.notes || '',
    });
    setFormErr('');
    setEditTarget(inv);
    setInvoiceDialog('edit');
  };

  const openCollect = (inv: ProjectInvoice) => {
    const remaining = Math.max(0, inv.amount - inv.amount_collected);
    setCollectForm({ amount_collected: String(remaining), collection_date: TODAY() });
    setCollectErr('');
    setCollectDialog(inv);
  };

  const handleSaveInvoice = async () => {
    if (!form.project_id) { setFormErr('Select a project.'); return; }
    if (!form.invoice_no.trim()) { setFormErr('Invoice number is required.'); return; }
    if (!form.invoice_date) { setFormErr('Invoice date is required.'); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setFormErr('Enter a valid amount.'); return; }
    if (!form.due_date) { setFormErr('Due date is required.'); return; }

    setSaving(true);
    setFormErr('');
    try {
      const body: Partial<ProjectInvoice> = {
        project_id: form.project_id,
        project_name: form.project_name,
        project_no: form.project_no,
        invoice_no: form.invoice_no.trim(),
        invoice_date: form.invoice_date,
        amount,
        payment_terms_days: form.payment_terms_days,
        due_date: form.due_date,
        notes: form.notes.trim() || undefined,
        ...(invoiceDialog === 'add' ? { amount_collected: 0 } : {}),
      };
      const url = invoiceDialog === 'edit' && editTarget
        ? `${API}/invoices/${editTarget.id}`
        : `${API}/invoices`;
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(url, {
        method: invoiceDialog === 'edit' ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || res.statusText);
      }
      await fetchInvoices();
      setInvoiceDialog(null);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordCollection = async () => {
    if (!collectDialog) return;
    const collected = parseFloat(collectForm.amount_collected);
    if (isNaN(collected) || collected < 0) { setCollectErr('Enter a valid amount.'); return; }
    if (collected > collectDialog.amount) { setCollectErr('Collected amount exceeds invoice amount.'); return; }

    setCollectSaving(true);
    setCollectErr('');
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API}/invoices/${collectDialog.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ amount_collected: collected, collection_date: collectForm.collection_date || undefined }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || res.statusText);
      }
      await fetchInvoices();
      setCollectDialog(null);
    } catch (e) {
      setCollectErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setCollectSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const token = localStorage.getItem('netpacific_token');
      await fetch(`${API}/invoices/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      await fetchInvoices();
    } catch {
      setError('Delete failed.');
    } finally {
      setDeleteConfirm(false);
      setDeleteTarget(null);
    }
  };

  // ─── upload scan ────────────────────────────────────────────────────────
  const handleScanUpload = async (inv: ProjectInvoice, file: File) => {
    if (!/(\.pdf|\.png|\.jpe?g|\.tiff?|\.bmp)$/i.test(file.name)) {
      setUploadScanErr('Please upload a PDF or image file (PDF, PNG, JPG, TIFF, BMP).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setUploadScanErr('File is too large. Maximum size is 25 MB.');
      return;
    }

    if (!oneDriveSignedIn) {
      oneDriveLogin();
      return;
    }

    setUploadingScanId(inv.id);
    setUploadScanErr('');

    try {
      const token = await getOneDriveToken();
      if (!token) {
        setUploadScanErr('Could not obtain OneDrive access token. Please sign in again.');
        setUploadingScanId(null);
        return;
      }
      const driveId = await resolveCorporateDriveId(token);

      const code = inv.project_no || String(inv.project_id);
      const name = inv.project_name || '';
      const folderName = projectFolderName({ code, name });
      const sanitizedInvoice = inv.invoice_no.replace(/[<>:"/\\|?*]/g, '_');
      const filename = `${sanitizedInvoice}_${file.name}`;
      const execRoot = onedriveConfig.executionRoot || '01 Execution';
      const year = String(new Date().getFullYear());
      // Try year-aware path first (new structure), fall back to flat (historical projects)
      const yearPath = `${execRoot}/${year}/${folderName}/Sales Invoice`;
      const flatPath = `${execRoot}/${folderName}/Sales Invoice`;
      let result;
      try {
        result = await uploadFileToFolder(token, driveId, yearPath, filename, file);
      } catch {
        result = await uploadFileToFolder(token, driveId, flatPath, filename, file);
      }

      const scanFile = {
        onedrive_item_id: result.id,
        onedrive_web_url: result.webUrl,
        filename: result.name || filename,
        uploaded_at: new Date().toISOString(),
      };

      const authToken = localStorage.getItem('netpacific_token');
      await fetch(`${API}/invoices/${inv.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ scan_file: scanFile }),
      });

      await fetchInvoices();
    } catch (e) {
      setUploadScanErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploadingScanId(null);
    }
  };

  const handleScanPick = (inv: ProjectInvoice, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleScanUpload(inv, file);
    e.target.value = '';
  };

  // ─── render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  const selectedProject = projects.find(p => String(p.id) === form.project_id) ?? null;

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      {/* Title */}
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Collections & Receivables
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}
      {uploadScanErr && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setUploadScanErr('')}>{uploadScanErr}</Alert>}

      {/* KPI Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Invoiced</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {PHP.format(summary.totalInvoiced)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {enriched.length} invoice{enriched.length !== 1 ? 's' : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Collected</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {PHP.format(summary.totalCollected)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {summary.totalInvoiced > 0
                  ? `${((summary.totalCollected / summary.totalInvoiced) * 100).toFixed(1)}% of invoiced`
                  : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Outstanding</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {PHP.format(summary.outstanding)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {enriched.filter(i => i._status !== 'paid').length} pending
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{
            background: summary.overdueCount > 0
              ? `linear-gradient(135deg, #e53935 0%, #ef9a9a 100%)`
              : `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`,
            color: summary.overdueCount > 0 ? 'white' : '#2d3436',
          }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Overdue</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {PHP.format(summary.overdueAmount)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {summary.overdueCount} invoice{summary.overdueCount !== 1 ? 's' : ''} past due
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              fullWidth
              label="Search"
              placeholder="Invoice no., project name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as InvoiceStatus | '')}
                label="Status"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="unpaid">Unpaid</MenuItem>
                <MenuItem value="partial">Partial</MenuItem>
                <MenuItem value="overdue">Overdue</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, flexGrow: 1 }}>
        <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
            Invoices ({filtered.length})
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={openAdd}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add Invoice
          </Button>
        </Box>

        <TableContainer sx={{ maxHeight: 'calc(100vh - 480px)', minHeight: 300 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Project</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Invoice No.</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>PB #</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Date Issued</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Terms</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Due Date</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Collected</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Outstanding</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Status</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4, color: 'text.secondary', fontSize: '0.875rem' }}>
                    {enriched.length === 0
                      ? 'No invoices yet. Click "Add Invoice" to get started.'
                      : 'No invoices match the current filters.'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(inv => {
                const isOverdue = inv._status === 'overdue';
                const handleProjectClick = () => {
                  sessionStorage.setItem('selectedProjectId', String(inv.project_id));
                  navigate('/dashboard');
                };
                return (
                  <TableRow key={inv.id} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                          fontSize: '0.8rem',
                          color: NET_PACIFIC_COLORS.primary,
                          cursor: 'pointer',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                        onClick={handleProjectClick}
                      >
                        {inv.project_name || '—'}
                      </Typography>
                      {inv.project_no && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ cursor: 'pointer' }}
                          onClick={handleProjectClick}
                        >
                          {inv.project_no}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                        {inv.invoice_no}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {inv.pb_number
                        ? <Chip label={inv.pb_number} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{inv.invoice_date}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {PHP.format(inv.amount)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {formatPaymentTerms(inv.payment_terms_days)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', color: isOverdue ? 'error.main' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                        {inv.due_date}
                      </Typography>
                      {isOverdue && (
                        <Typography variant="caption" color="error.main">Past due</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: inv.amount_collected > 0 ? 'success.main' : 'text.secondary' }}>
                      {PHP.format(inv.amount_collected)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {inv._outstanding > 0
                        ? <Typography variant="body2" sx={{ fontSize: '0.8rem', color: isOverdue ? 'error.main' : 'warning.dark', fontWeight: isOverdue ? 600 : 400 }}>{PHP.format(inv._outstanding)}</Typography>
                        : <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>—</Typography>}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={STATUS_LABELS[inv._status]}
                        color={STATUS_COLORS[inv._status]}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                      {inv._status !== 'paid' && (
                        <Tooltip title="Record collection">
                          <IconButton size="small" color="success" onClick={() => openCollect(inv)}>
                            <PaymentIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {inv.scan_file?.onedrive_web_url ? (
                        <Tooltip title={`View scan: ${inv.scan_file.filename}`}>
                          <IconButton size="small" color="info" onClick={() => window.open(inv.scan_file!.onedrive_web_url, '_blank')}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title={uploadingScanId === inv.id ? 'Uploading…' : 'Upload invoice scan'}>
                          <IconButton size="small" color="primary" disabled={uploadingScanId === inv.id} component="label">
                            {uploadingScanId === inv.id ? <CircularProgress size={16} /> : <CloudUploadIcon fontSize="small" />}
                            <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.bmp" onChange={e => handleScanPick(inv, e)} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(inv)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => { setDeleteTarget(inv); setDeleteConfirm(true); }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ── Add / Edit Invoice Dialog ─────────────────────────────────────── */}
      <Dialog open={invoiceDialog !== null} onClose={() => setInvoiceDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{invoiceDialog === 'add' ? 'Add Invoice' : 'Edit Invoice'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formErr && <Alert severity="error">{formErr}</Alert>}

            <Autocomplete
              options={projects}
              getOptionLabel={p => `${p.project_no ? p.project_no + ' — ' : ''}${p.project_name || ''} (${p.account_name || ''})`}
              value={selectedProject}
              onChange={(_, p) => {
                if (p) {
                  setForm(prev => ({
                    ...prev,
                    project_id: String(p.id),
                    project_name: p.project_name || '',
                    project_no: p.project_no || '',
                  }));
                } else {
                  setForm(prev => ({ ...prev, project_id: '', project_name: '', project_no: '' }));
                }
              }}
              renderInput={params => <TextField {...params} label="Project" size="small" required />}
              isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
              disabled={invoiceDialog === 'edit'}
            />

            <TextField
              label="Invoice No."
              size="small"
              value={form.invoice_no}
              onChange={e => handleFormChange('invoice_no', e.target.value)}
              required
              placeholder="e.g. SI-2026-001"
            />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Invoice Date"
                  type="date"
                  size="small"
                  fullWidth
                  value={form.invoice_date}
                  onChange={e => handleFormChange('invoice_date', e.target.value)}
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Amount (PHP)"
                  type="number"
                  size="small"
                  fullWidth
                  value={form.amount}
                  onChange={e => handleFormChange('amount', e.target.value)}
                  required
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Payment Terms</InputLabel>
                  <Select
                    label="Payment Terms"
                    value={form.payment_terms_days}
                    onChange={e => handleFormChange('payment_terms_days', Number(e.target.value))}
                  >
                    {PAYMENT_TERMS_OPTIONS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Due Date"
                  type="date"
                  size="small"
                  fullWidth
                  value={form.due_date}
                  onChange={e => handleFormChange('due_date', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  helperText="Auto-computed; editable"
                />
              </Grid>
            </Grid>

            <TextField
              label="Notes (optional)"
              size="small"
              multiline
              rows={2}
              value={form.notes}
              onChange={e => handleFormChange('notes', e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceDialog(null)} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveInvoice}
            disabled={saving}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {saving ? 'Saving…' : invoiceDialog === 'add' ? 'Add Invoice' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Record Collection Dialog ──────────────────────────────────────── */}
      <Dialog open={!!collectDialog} onClose={() => setCollectDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Record Collection</DialogTitle>
        <DialogContent>
          {collectDialog && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {collectErr && <Alert severity="error">{collectErr}</Alert>}

              <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="body2" fontWeight={600}>{collectDialog.project_name}</Typography>
                <Typography variant="body2">Invoice: <strong>{collectDialog.invoice_no}</strong></Typography>
                <Stack direction="row" spacing={2} mt={0.5}>
                  <Typography variant="caption" color="text.secondary">Amount: {PHP.format(collectDialog.amount)}</Typography>
                  <Typography variant="caption" color="text.secondary">Due: {collectDialog.due_date}</Typography>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption">Previously collected: {PHP.format(collectDialog.amount_collected)}</Typography>
                <Typography variant="caption" display="block">
                  Remaining: <strong>{PHP.format(Math.max(0, collectDialog.amount - collectDialog.amount_collected))}</strong>
                </Typography>
              </Box>

              <TextField
                label="Amount Collected (PHP)"
                type="number"
                size="small"
                value={collectForm.amount_collected}
                onChange={e => setCollectForm(prev => ({ ...prev, amount_collected: e.target.value }))}
                inputProps={{ min: 0, step: 0.01, max: collectDialog.amount }}
                helperText={`Max: ${PHP.format(collectDialog.amount)}`}
                required
              />

              <TextField
                label="Collection Date"
                type="date"
                size="small"
                value={collectForm.collection_date}
                onChange={e => setCollectForm(prev => ({ ...prev, collection_date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCollectDialog(null)} disabled={collectSaving}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleRecordCollection}
            disabled={collectSaving}
          >
            {collectSaving ? 'Saving…' : 'Record Collection'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Invoice</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete invoice <strong>{deleteTarget?.invoice_no}</strong> for{' '}
            {deleteTarget && PHP.format(deleteTarget.amount)}? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
