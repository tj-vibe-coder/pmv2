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
  IconButton,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { Add as AddIcon, Check as CheckIcon, Close as CloseIcon, Delete as DeleteIcon, RemoveCircleOutline as RemoveIcon, PictureAsPdf as PictureAsPdfIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
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
  id: number;
  project_name: string;
  project_no?: string;
}

interface CashAdvanceRow {
  id: number;
  user_id: number;
  amount: number;
  balance_remaining: number;
  status: string;
  purpose: string | null;
  breakdown: string | null;
  project_id: number | null;
  project_name?: string | null;
  project_no?: string | null;
  requested_at: number | null;
  approved_at: number | null;
  approved_by: number | null;
  created_at: number;
  updated_at: number;
  username?: string;
  full_name?: string | null;
}

export default function CAFormPage() {
  const { user } = useAuth();
  const [list, setList] = useState<CashAdvanceRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [dateRequested, setDateRequested] = useState(() => new Date().toISOString().slice(0, 10));
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([{ category: 'Materials', description: '', amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('');

  const breakdownTotal = breakdown.reduce((sum, r) => sum + (parseFloat(String(r.amount)) || 0), 0);
  const canSubmit = breakdownTotal > 0 && selectedProject != null;

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
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetch(`${API_BASE}/api/projects`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data.map((p: { id: number; project_name?: string; project_no?: string }) => ({ id: p.id, project_name: p.project_name || '', project_no: p.project_no || '' })));
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
    previousCAs?: { id: number; amount: number; balance_remaining: number; requested_at?: number | null }[];
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
        doc.text(`CA #${ca.id}: Date ${reqDate} | Amount PHP ${Number(ca.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} | Balance remaining PHP ${Number(ca.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, margin, y);
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
      projectName: selectedProject?.project_name ?? '',
      dateRequested,
      breakdownRows: items.length > 0 ? items : [{ category: '—', description: '—', amount: breakdownTotal }],
      total: breakdownTotal,
      preparedByName,
      documentNo: `${(selectedProject?.project_no || '—').trim() || '—'}-CA-Draft`,
      previousCAs: previousApprovedWithBalance.map((ca) => ({
        id: ca.id,
        amount: ca.amount,
        balance_remaining: ca.balance_remaining,
        requested_at: ca.requested_at,
      })),
    });
    doc.save(`Cash_Advance_Request_${selectedProject?.project_name?.replace(/\s/g, '_') || 'form'}_${new Date().toISOString().slice(0, 10)}.pdf`);
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
      projectName: selectedProject?.project_name ?? '',
      dateRequested,
      breakdownRows: items.length > 0 ? items : [{ category: '—', description: '—', amount: breakdownTotal }],
      total: breakdownTotal,
      preparedByName,
      documentNo: `${(selectedProject?.project_no || '—').trim() || '—'}-CA-Draft`,
      previousCAs: previousApprovedWithBalance.map((ca) => ({
        id: ca.id,
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
    let breakdownRows: { category: string; description: string; amount: number }[] = [];
    try {
      if (ca.breakdown) {
        const b = JSON.parse(ca.breakdown);
        if (Array.isArray(b))
          breakdownRows = b.map((r: { category?: string; description?: string; amount?: number }) => ({
            category: String(r.category ?? '—'),
            description: String(r.description ?? ''),
            amount: Number(r.amount ?? 0),
          }));
      }
    } catch (_) {}
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
      projectName: ca.project_name ?? '',
      dateRequested: requestedDate,
      breakdownRows,
      total: Number(ca.amount) || 0,
      title: `Cash Advance Request #${ca.id}`,
      preparedByName: (ca.full_name?.trim() || ca.username || '').trim() || '—',
      documentNo: `${(ca.project_no || '—').trim() || '—'}-CA-${String(ca.id).padStart(3, '0')}`,
      previousCAs: previousOthers.map((c) => ({
        id: c.id,
        amount: c.amount,
        balance_remaining: c.balance_remaining,
        requested_at: c.requested_at,
      })),
    });
    doc.save(`Cash_Advance_${ca.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleRequest = async () => {
    if (breakdownTotal <= 0) {
      setError('Add at least one breakdown line with an amount');
      return;
    }
    if (!selectedProject) {
      setError('Select a project');
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
          project_id: selectedProject.id,
          date_requested: dateRequested || undefined,
          breakdown: items.length > 0 ? items : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setDateRequested(new Date().toISOString().slice(0, 10));
        setSelectedProject(null);
        setBreakdown([{ category: 'Materials', description: '', amount: '' }]);
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

  const handleApproveReject = async (id: number, status: 'approved' | 'rejected') => {
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
      if (data.success) fetchList();
      else setError(data.error || 'Action failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: number, status?: string) => {
    const message = status === 'approved' || status === 'rejected'
      ? 'This request is already ' + status + '. Delete the record anyway? This cannot be undone.'
      : 'Delete this cash advance request? This cannot be undone.';
    if (!window.confirm(message)) return;
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setActionId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) fetchList();
      else setError(data.error || 'Delete failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setActionId(null);
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
            renderInput={(params) => <TextField {...params} label="Project" required placeholder="Select project" />}
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
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>ID</TableCell>
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
                  <TableCell colSpan={isAdmin ? 10 : 8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No cash advance requests yet.
                  </TableCell>
                </TableRow>
              ) : (
                list.map((ca) => (
                  <TableRow key={ca.id} hover>
                    <TableCell>{ca.id}</TableCell>
                    {isAdmin && (
                      <>
                        <TableCell>{ca.username || '—'}</TableCell>
                        <TableCell>{ca.full_name || '—'}</TableCell>
                      </>
                    )}
                    <TableCell>{Number(ca.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{Number(ca.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{ca.project_name || (ca.project_id ? `#${ca.project_id}` : '—')}</TableCell>
                    <TableCell sx={{ maxWidth: 220, whiteSpace: 'pre-wrap' }}>
                      {(() => {
                        try {
                          const b = ca.breakdown ? JSON.parse(ca.breakdown) : [];
                          if (!Array.isArray(b) || b.length === 0) return '—';
                          return b.map((r: { category?: string; description?: string; amount?: number }) => {
                            const cat = (r.category || '').trim();
                            const desc = (r.description || '').trim();
                            const part = cat && desc ? `${cat} – ${desc}` : cat || desc || '—';
                            return `${part}: ${Number(r.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
                          }).join('\n');
                        } catch {
                          return '—';
                        }
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
                      <IconButton
                        size="small"
                        onClick={() => exportCARowToPDF(ca)}
                        title="Export to PDF (for signing)"
                        sx={{ color: theme.primary, ml: 0.5 }}
                      >
                        <PictureAsPdfIcon fontSize="small" />
                      </IconButton>
                      {(isAdmin || (ca.status === 'pending' && Number(ca.user_id) === Number(user?.id))) && (
                        <Button
                          size="small"
                          startIcon={<DeleteIcon />}
                          color="error"
                          variant="outlined"
                          onClick={() => handleDelete(ca.id, ca.status)}
                          disabled={actionId === ca.id}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
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
    </Box>
  );
}
