import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Tooltip,
} from '@mui/material';
import { Add as AddIcon, Check as CheckIcon, Close as CloseIcon, Delete as DeleteIcon, KeyboardArrowDown as ExpandMoreIcon, KeyboardArrowUp as ExpandLessIcon, ReceiptLong as ReceiptLongIcon, RemoveCircleOutline as RemoveIcon, PictureAsPdf as PictureAsPdfIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import PdfPreviewDialog from './PdfPreviewDialog';

const CA_CATEGORIES = ['Materials', 'Accommodation', 'Allowance', 'Transportation', 'Entertainment'] as const;

interface BreakdownItem {
  category: string;
  description: string;
  amount: string;
}

interface ProjectOption {
  id: string;
  project_name: string;
  project_no?: string;
}

// What a stored breakdown line looks like after server normalization.
interface BreakdownLine {
  category?: string | null;
  description?: string | null;
  amount?: number;
}

interface CashAdvanceRow {
  id: string;
  ca_no?: string | null;
  user_id: string;
  amount: number;
  balance_remaining: number;
  status: string;
  purpose: string | null;
  // Legacy docs stored a JSON string; server-created docs store the array.
  breakdown: string | BreakdownLine[] | null;
  project_id: string | null;
  project_name?: string | null;
  project_no?: string | null;
  requested_at: number | null;
  approved_at: number | null;
  approved_by: string | null;
  created_at: number;
  updated_at: number;
  username?: string;
  full_name?: string | null;
}

interface LiquidationRow {
  id: string;
  form_no?: string | null;
  date_of_submission?: string | null;
  total_amount?: number;
  status?: string;
  ca_id?: string | null;
  created_at?: number;
}

// Parse a stored breakdown regardless of vintage: legacy docs hold a JSON
// string, server-created docs hold the array directly.
function parseBreakdown(raw: CashAdvanceRow['breakdown']): BreakdownLine[] {
  try {
    const b = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? []);
    return Array.isArray(b) ? b : [];
  } catch {
    return [];
  }
}

export default function CAFormPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [list, setList] = useState<CashAdvanceRow[]>([]);
  const [liquidations, setLiquidations] = useState<LiquidationRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [purpose, setPurpose] = useState('');
  const [dateRequested, setDateRequested] = useState(() => new Date().toISOString().slice(0, 10));
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([{ category: 'Materials', description: '', amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CashAdvanceRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('');

  const breakdownTotal = breakdown.reduce((sum, r) => sum + (parseFloat(String(r.amount)) || 0), 0);
  const canSubmit = breakdownTotal > 0 && (selectedProject != null || purpose.trim() !== '');

  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  const fetchList = useCallback(async () => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.cash_advances) {
        setList(data.cash_advances);
      } else {
        setError(data.error || 'Failed to load');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
    // Linked liquidations power the per-CA history rows; best-effort.
    try {
      const res = await fetch(`${API_BASE}/api/liquidations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.liquidations) setLiquidations(data.liquidations);
    } catch {
      // table still works without history
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetch(`${API_BASE}/api/projects`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data.map((p: { id: string | number; project_name?: string; project_no?: string }) => ({ id: String(p.id), project_name: p.project_name || '', project_no: p.project_no || '' })));
      })
      .catch(() => {});
  }, []);

  const addBreakdownRow = () => setBreakdown((b) => [...b, { category: 'Materials', description: '', amount: '' }]);
  const removeBreakdownRow = (index: number) => setBreakdown((b) => (b.length <= 1 ? b : b.filter((_, i) => i !== index)));
  const updateBreakdown = (index: number, field: 'category' | 'description' | 'amount', value: string) =>
    setBreakdown((b) => b.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const buildCAFormPdf = (data: {
    projectName: string;
    dateRequested: string;
    breakdownRows: { category: string; description: string; amount: number }[];
    total: number;
    title?: string;
    preparedByName: string;
    documentNo?: string;
    previousCAs?: { id: string; amount: number; balance_remaining: number; requested_at?: number | null }[];
  }) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 16;
    const pageWidth = 210;
    const pageHeight = 297;
    let y = 18;
    const lineH = 6;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(data.title || 'Cash Advance Request', pageWidth / 2, y, { align: 'center' });
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Project: ${(data.projectName || '—').trim()}`, margin, y);
    y += lineH;
    doc.text(`Date Requested: ${(data.dateRequested || '—').trim()}`, margin, y);
    y += lineH;

    const previousCAs = data.previousCAs?.filter((ca) => Number(ca.balance_remaining) > 0) ?? [];
    if (previousCAs.length > 0) {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Previous CA details', margin, y);
      y += lineH;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      previousCAs.forEach((ca) => {
        const reqDate = ca.requested_at ? new Date(ca.requested_at * 1000).toLocaleDateString() : '—';
        doc.text(`${ca.id}: Date ${reqDate} | Amount PHP ${Number(ca.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} | Balance remaining PHP ${Number(ca.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, margin, y);
        y += lineH - 1;
      });
      y += lineH + 2;
      doc.setFont('helvetica', 'normal');
    } else {
      y += 4;
    }

    const body = data.breakdownRows.length > 0
      ? data.breakdownRows.map((r) => [
          r.category || '—',
          (r.description || '—').trim() || '—',
          r.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 }),
        ])
      : [['—', '—', '0.00']];
    autoTable(doc, {
      head: [['Category', 'Details', 'Amount']],
      body,
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: pageWidth - margin * 2,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [44, 90, 160] },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (docWithTable.lastAutoTable?.finalY ?? y) + 8;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Amount: ${data.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const sigY = pageHeight - 36;
    doc.text('Prepared by:', margin, sigY);
    doc.text((data.preparedByName || '').trim() || '—', margin, sigY + 6);
    doc.line(margin, sigY + 8, margin + 50, sigY + 8);
    doc.text('Approved by:', pageWidth - margin - 50, sigY);
    doc.line(pageWidth - margin - 50, sigY + 8, pageWidth - margin, sigY + 8);

    const footerY = pageHeight - 10;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Document No.: ${data.documentNo ?? '—'}`, margin, footerY);
    const totalPages = doc.getNumberOfPages();
    if (totalPages > 1) {
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.text(`Document No.: ${data.documentNo ?? '—'}`, margin, footerY);
        doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
      }
    }

    return doc;
  };

  const preparedByName = (user?.full_name?.trim() || user?.username || '').trim() || '—';

  const previousApprovedWithBalance = list.filter(
    (ca) => ca.status === 'approved' && Number(ca.balance_remaining) > 0
  );

  const exportCurrentFormToPDF = () => {
    if (breakdownTotal <= 0) {
      setError('Add breakdown lines before exporting.');
      return;
    }
    const items = breakdown
      .map((r) => ({
        category: r.category || '—',
        description: r.description.trim(),
        amount: parseFloat(String(r.amount)) || 0,
      }))
      .filter((r) => r.amount > 0);
    const doc = buildCAFormPdf({
      projectName: selectedProject?.project_name || (purpose.trim() ? `${purpose.trim()} (prospect)` : ''),
      dateRequested,
      breakdownRows: items.length > 0 ? items : [{ category: '—', description: '—', amount: breakdownTotal }],
      total: breakdownTotal,
      preparedByName,
      documentNo: `${(selectedProject?.project_no || 'Prospect').trim() || 'Prospect'}-CA-Draft`,
      previousCAs: previousApprovedWithBalance.map((ca) => ({
        id: ca.ca_no || ca.id,
        amount: ca.amount,
        balance_remaining: ca.balance_remaining,
        requested_at: ca.requested_at,
      })),
    });
    doc.save(`${(selectedProject?.project_no || 'Prospect').trim() || 'Prospect'}-CA-Draft_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePreviewCurrentForm = () => {
    if (breakdownTotal <= 0) {
      setError('Add breakdown lines before preview.');
      return;
    }
    const items = breakdown
      .map((r) => ({
        category: r.category || '—',
        description: r.description.trim(),
        amount: parseFloat(String(r.amount)) || 0,
      }))
      .filter((r) => r.amount > 0);
    const doc = buildCAFormPdf({
      projectName: selectedProject?.project_name || (purpose.trim() ? `${purpose.trim()} (prospect)` : ''),
      dateRequested,
      breakdownRows: items.length > 0 ? items : [{ category: '—', description: '—', amount: breakdownTotal }],
      total: breakdownTotal,
      preparedByName,
      documentNo: `${(selectedProject?.project_no || 'Prospect').trim() || 'Prospect'}-CA-Draft`,
      previousCAs: previousApprovedWithBalance.map((ca) => ({
        id: ca.ca_no || ca.id,
        amount: ca.amount,
        balance_remaining: ca.balance_remaining,
        requested_at: ca.requested_at,
      })),
    });
    const blob = doc.output('blob') as Blob;
    setPdfPreviewBlob(blob);
    setPdfPreviewTitle('Cash Advance Request – Preview');
    setPdfPreviewOpen(true);
  };

  const exportCARowToPDF = (ca: CashAdvanceRow) => {
    let breakdownRows = parseBreakdown(ca.breakdown).map((r) => ({
      category: String(r.category ?? '—'),
      description: String(r.description ?? ''),
      amount: Number(r.amount ?? 0),
    }));
    if (breakdownRows.length === 0) breakdownRows = [{ category: '—', description: '—', amount: Number(ca.amount) || 0 }];
    const requestedDate = ca.requested_at
      ? new Date(ca.requested_at * 1000).toISOString().slice(0, 10)
      : ca.created_at
        ? new Date(ca.created_at * 1000).toISOString().slice(0, 10)
        : '—';
    const previousOthers = list.filter(
      (c) => c.status === 'approved' && Number(c.balance_remaining) > 0 && c.id !== ca.id
    );
    const doc = buildCAFormPdf({
      projectName: ca.project_name || (ca.purpose ? `${ca.purpose} (prospect)` : ''),
      dateRequested: requestedDate,
      breakdownRows,
      total: Number(ca.amount) || 0,
      title: `Cash Advance Request ${ca.ca_no || '#' + ca.id}`,
      preparedByName: (ca.full_name?.trim() || ca.username || '').trim() || '—',
      documentNo: ca.ca_no || `${(ca.project_no || '—').trim() || '—'}-CA-${String(ca.id).padStart(3, '0')}`,
      previousCAs: previousOthers.map((c) => ({
        id: c.ca_no || c.id,
        amount: c.amount,
        balance_remaining: c.balance_remaining,
        requested_at: c.requested_at,
      })),
    });
    doc.save(ca.ca_no ? `${ca.ca_no}.pdf` : `Cash_Advance_${ca.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleRequest = async () => {
    if (breakdownTotal <= 0) {
      setError('Add at least one breakdown line with an amount');
      return;
    }
    if (!selectedProject && !purpose.trim()) {
      setError('Select a project or describe the purpose/prospect');
      return;
    }
    const items = breakdown
      .map((r) => ({
        category: r.category || 'Materials',
        description: r.description.trim(),
        amount: parseFloat(String(r.amount)) || 0,
      }))
      .filter((r) => r.amount > 0);
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount: breakdownTotal,
          project_id: selectedProject?.id ?? null,
          purpose: purpose.trim() || undefined,
          date_requested: dateRequested || undefined,
          breakdown: items.length > 0 ? items : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setDateRequested(new Date().toISOString().slice(0, 10));
        setSelectedProject(null);
        setPurpose('');
        setBreakdown([{ category: 'Materials', description: '', amount: '' }]);
        setSnackbar(data.ca_no ? `Cash advance ${data.ca_no} requested` : 'Cash advance requested');
        fetchList();
      } else {
        setError(data.error || 'Request failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveReject = async (id: string, status: 'approved' | 'rejected') => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setActionId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setSnackbar(status === 'approved' ? 'Cash advance approved' : 'Cash advance rejected');
        fetchList();
      } else setError(data.error || 'Action failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (ca: CashAdvanceRow) => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setActionId(ca.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances/${ca.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setSnackbar(`Deleted ${ca.ca_no || 'cash advance'}`);
        fetchList();
      } else setError(data.error || 'Delete failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setActionId(null);
      setConfirmDelete(null);
    }
  };

  const theme = { primary: '#2c5aa0', secondary: '#1e4a72' };

  return (
    <Box sx={{ p: 3, width: '100%' }}>
      <Typography variant="h5" sx={{ fontWeight: 600, color: theme.primary, mb: 2 }}>
        Cash Advance (CA) Form
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Request a cash advance. Once approved, you can use it when submitting a liquidation; the liquidation amount will reduce your CA balance.
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3, border: '1px solid #e0e0e0', borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: theme.primary }}>
          Request Cash Advance
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start', mb: 2 }}>
          <Autocomplete
            size="small"
            options={projects}
            getOptionLabel={(p) => p.project_name || ''}
            value={selectedProject}
            onChange={(_, v) => setSelectedProject(v)}
            renderInput={(params) => <TextField {...params} label="Project" placeholder="Select project (optional for prospects)" />}
            sx={{ minWidth: 280 }}
          />
          <TextField
            size="small"
            label="Date requested"
            type="date"
            value={dateRequested}
            onChange={(e) => setDateRequested(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          {!selectedProject && (
            <TextField
              size="small"
              label="Purpose / prospect"
              required
              placeholder="e.g. Site survey for prospective quotation — Client X"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              helperText="No project yet? Describe what this CA is for."
              sx={{ minWidth: 320, flex: 1 }}
            />
          )}
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: theme.primary }}>
          Breakdown by category (add child lines under Materials for item breakdown; amount is auto-computed)
        </Typography>
        <TableContainer component={Box} sx={{ border: '1px solid #e0e0e0', borderRadius: 1, mb: 2, maxWidth: 640 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: theme.primary + '08' }}>
                <TableCell sx={{ fontWeight: 600, width: 160 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Details</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 120 }} align="right">Amount</TableCell>
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {breakdown.map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell sx={{ py: 0.5 }}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Category</InputLabel>
                      <Select
                        value={row.category || 'Materials'}
                        label="Category"
                        onChange={(e) => updateBreakdown(idx, 'category', e.target.value)}
                      >
                        {CA_CATEGORIES.map((c) => (
                          <MenuItem key={c} value={c}>{c}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder={row.category === 'Materials' ? 'e.g. Cement, steel (child items)' : 'Optional'}
                      value={row.description}
                      onChange={(e) => updateBreakdown(idx, 'description', e.target.value)}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }} align="right">
                    <TextField
                      size="small"
                      type="number"
                      inputProps={{ min: 0, step: 0.01 }}
                      placeholder="0"
                      value={row.amount}
                      onChange={(e) => updateBreakdown(idx, 'amount', e.target.value)}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <IconButton size="small" onClick={() => removeBreakdownRow(idx)} disabled={breakdown.length <= 1} color="error">
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button size="small" startIcon={<AddIcon />} onClick={addBreakdownRow} sx={{ color: theme.primary }}>
            Add line
          </Button>
          <Typography variant="body2" color="text.secondary">
            Total amount: {breakdownTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<VisibilityIcon />}
            onClick={handlePreviewCurrentForm}
            disabled={!canSubmit}
            sx={{ borderColor: theme.primary, color: theme.primary }}
          >
            Preview PDF
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={exportCurrentFormToPDF}
            disabled={!canSubmit}
            sx={{ borderColor: theme.primary, color: theme.primary }}
          >
            Export to PDF (for signing)
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleRequest}
            disabled={submitting || !canSubmit}
            sx={{ bgcolor: theme.primary, '&:hover': { bgcolor: theme.secondary } }}
          >
            Request CA
          </Button>
        </Box>
      </Paper>

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: theme.primary }}>
        {isAdmin ? 'All CA requests (monitor and approve)' : 'My CA requests'}
      </Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: theme.primary + '12' }}>
                <TableCell sx={{ width: 36 }} />
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>CA No.</TableCell>
                {isAdmin && (
                  <>
                    <TableCell sx={{ fontWeight: 600, color: theme.primary }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Full name</TableCell>
                  </>
                )}
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Balance</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Project</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Breakdown</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Requested</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 11 : 9} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No cash advance requests yet.
                  </TableCell>
                </TableRow>
              ) : (
                list.map((ca) => {
                  const linkedLiqs = liquidations.filter((l) => l.ca_id === ca.id);
                  const liquidatedTotal = linkedLiqs
                    .filter((l) => l.status === 'submitted')
                    .reduce((s, l) => s + (Number(l.total_amount) || 0), 0);
                  const expanded = expandedId === ca.id;
                  return (
                  <React.Fragment key={ca.id}>
                  <TableRow hover>
                    <TableCell sx={{ py: 0 }}>
                      <IconButton
                        size="small"
                        onClick={() => setExpandedId(expanded ? null : ca.id)}
                        title={expanded ? 'Hide liquidations' : `Show liquidations (${linkedLiqs.length})`}
                      >
                        {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {ca.ca_no || (
                        <Tooltip title={`Internal ID: ${ca.id}`}>
                          <span style={{ color: '#888' }}>{ca.id.slice(0, 8)}…</span>
                        </Tooltip>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <>
                        <TableCell>{ca.username || '—'}</TableCell>
                        <TableCell>{ca.full_name || '—'}</TableCell>
                      </>
                    )}
                    <TableCell>{Number(ca.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell sx={Number(ca.balance_remaining) < 0 ? { color: 'error.main', fontWeight: 600 } : undefined}>
                      {Number(ca.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      {ca.project_name
                        || (ca.purpose ? (
                          <Tooltip title="No project yet — prospect / out-of-project CA">
                            <em style={{ color: '#666' }}>{ca.purpose}</em>
                          </Tooltip>
                        ) : ca.project_id ? `#${ca.project_id}` : '—')}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220, whiteSpace: 'pre-wrap' }}>
                      {(() => {
                        const b = parseBreakdown(ca.breakdown);
                        if (b.length === 0) return '—';
                        return b.map((r) => {
                          const cat = (r.category || '').trim();
                          const desc = (r.description || '').trim();
                          const part = cat && desc ? `${cat} – ${desc}` : cat || desc || '—';
                          return `${part}: ${Number(r.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
                        }).join('\n');
                      })()}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={ca.status}
                        color={ca.status === 'approved' ? 'success' : ca.status === 'rejected' ? 'error' : 'default'}
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell>
                      {ca.requested_at
                        ? new Date(ca.requested_at * 1000).toLocaleDateString()
                        : ca.created_at
                        ? new Date(ca.created_at * 1000).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {isAdmin && ca.status === 'pending' && (
                        <>
                          <Button
                            size="small"
                            startIcon={<CheckIcon />}
                            color="success"
                            onClick={() => handleApproveReject(ca.id, 'approved')}
                            disabled={actionId === ca.id}
                            sx={{ mr: 0.5 }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            startIcon={<CloseIcon />}
                            color="error"
                            onClick={() => handleApproveReject(ca.id, 'rejected')}
                            disabled={actionId === ca.id}
                            sx={{ mr: 0.5 }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {ca.status === 'approved' && Number(ca.balance_remaining) > 0 && (
                        <Button
                          size="small"
                          startIcon={<ReceiptLongIcon />}
                          onClick={() => navigate(`${location.pathname.replace(/\/ca-form\/?$/, '/liquidation-form')}?ca_id=${ca.id}`)}
                          sx={{ color: theme.primary, mr: 0.5 }}
                          title="Submit a liquidation against this CA"
                        >
                          Liquidate
                        </Button>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => exportCARowToPDF(ca)}
                        title="Export to PDF (for signing)"
                        sx={{ color: theme.primary, ml: 0.5 }}
                      >
                        <PictureAsPdfIcon fontSize="small" />
                      </IconButton>
                      {(isAdmin || (ca.status === 'pending' && String(ca.user_id) === String(user?.id))) && (
                        <Button
                          size="small"
                          startIcon={<DeleteIcon />}
                          color="error"
                          variant="outlined"
                          onClick={() => setConfirmDelete(ca)}
                          disabled={actionId === ca.id}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 11 : 9} sx={{ py: 0, border: expanded ? undefined : 0 }}>
                      <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 1.5, pl: 6 }}>
                          {linkedLiqs.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              No liquidations linked to this CA yet.
                            </Typography>
                          ) : (
                            <>
                              <Typography variant="caption" sx={{ fontWeight: 600, color: theme.primary, display: 'block', mb: 0.5 }}>
                                Liquidated {liquidatedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} of {Number(ca.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </Typography>
                              {linkedLiqs.map((l) => (
                                <Typography key={l.id} variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                  {l.form_no || l.id} · {l.date_of_submission || (l.created_at ? new Date(l.created_at * 1000).toLocaleDateString() : '—')} · ₱{Number(l.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} · {l.status || '—'}
                                </Typography>
                              ))}
                            </>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                  </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <PdfPreviewDialog
        open={pdfPreviewOpen}
        onClose={() => { setPdfPreviewOpen(false); setPdfPreviewBlob(null); setPdfPreviewTitle(''); }}
        pdfBlob={pdfPreviewBlob}
        title={pdfPreviewTitle}
      />
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete {confirmDelete?.ca_no || 'cash advance'}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmDelete?.status === 'approved' || confirmDelete?.status === 'rejected'
              ? `This request is already ${confirmDelete.status}. Delete the record anyway? This cannot be undone.`
              : 'Delete this cash advance request? This cannot be undone.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => confirmDelete && handleDelete(confirmDelete)}
            disabled={!!actionId}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert onClose={() => setSnackbar(null)} severity="success" variant="filled" sx={{ width: '100%' }}>
            {snackbar}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
