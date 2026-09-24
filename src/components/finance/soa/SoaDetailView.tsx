import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PaidIcon from '@mui/icons-material/Paid';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useSoaStore } from '../../../store/soaStore';
import type { SoaStatus, SoaItem } from '../../../types/StatementOfAccount';
import { soaStatusLabel, computeSoaTotals } from '../../../types/StatementOfAccount';
import { downloadSoaPdf, generateSoaPdfBlob } from '../../../utils/soa/soaPdfExport';
import SoaPdfPreviewDialog from './SoaPdfPreviewDialog';
import SoaEditorDialog from './SoaEditorDialog';
import RetroactivePoDialog from './RetroactivePoDialog';

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
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function SoaDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const activeSoa = useSoaStore((s) => s.activeSoa);
  const loading = useSoaStore((s) => s.loading);
  const error = useSoaStore((s) => s.error);
  const selectSoa = useSoaStore((s) => s.selectSoa);
  const saveSoa = useSoaStore((s) => s.saveSoa);
  const changeStatus = useSoaStore((s) => s.changeStatus);
  const modifyItem = useSoaStore((s) => s.modifyItem);
  const createRevision = useSoaStore((s) => s.createRevision);
  const recordPayment = useSoaStore((s) => s.recordPayment);
  const archiveToOneDrive = useSoaStore((s) => s.archiveToOneDrive);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [retroPoItem, setRetroPoItem] = useState<SoaItem | null>(null);
  const [statusAnchor, setStatusAnchor] = useState<null | HTMLElement>(null);

  // OneDrive archiving state
  const [archiving, setArchiving] = useState(false);
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Payment Recording Modal State
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    if (id) {
      void selectSoa(id);
    }
  }, [id, selectSoa]);

  if (loading && !activeSoa) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!activeSoa) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>Statement of Account not found.</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/finance/soa')}>
          Back to SOA List
        </Button>
      </Box>
    );
  }

  const totals = computeSoaTotals(activeSoa.items || []);
  const itemsWithPo = (activeSoa.items || []).filter((i) => i.hasPo);
  const itemsPendingPo = (activeSoa.items || []).filter((i) => !i.hasPo);

  const handleStatusSelect = async (status: SoaStatus) => {
    setStatusAnchor(null);
    await changeStatus(activeSoa.id, status);
  };

  const handleRevise = async () => {
    if (window.confirm(`Create a new revision for ${activeSoa.soaNo}?`)) {
      const revised = await createRevision(activeSoa.id);
      navigate(`/finance/soa/${revised.id}`);
    }
  };

  const handleOneDriveUpload = async () => {
    try {
      setArchiving(true);
      setArchiveSuccess(null);
      setArchiveError(null);
      const blob = await generateSoaPdfBlob(activeSoa);
      const base64 = await blobToBase64(blob);
      const result = await archiveToOneDrive(activeSoa.id, base64);
      setArchiveSuccess(`Archived to OneDrive (${result.folderPath})`);
    } catch (err: any) {
      setArchiveError(err.message || 'Failed to archive to OneDrive');
    } finally {
      setArchiving(false);
    }
  };

  const handleRecordPaymentSubmit = async () => {
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid payment amount greater than zero.');
      return;
    }

    try {
      setSavingPayment(true);
      await recordPayment(activeSoa.id, {
        amount: amt,
        paymentDate,
        reference: paymentRef,
        notes: paymentNotes,
      });
      setPaymentDialogOpen(false);
      setPaymentAmount('');
      setPaymentRef('');
      setPaymentNotes('');
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const getStatusColor = (status: SoaStatus) => {
    switch (status) {
      case 'settled':
        return 'success';
      case 'for_payment':
        return 'primary';
      case 'partially_paid':
        return 'warning';
      case 'draft':
        return 'default';
      case 'cancelled':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: 3 }}>
      {/* Back Button and Navigation Row */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/finance/soa')}>
          Back to SOA List
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {activeSoa.previousSoaNo && (
            <Chip
              label={`Prior Revision: ${activeSoa.previousSoaNo}`}
              size="small"
              variant="outlined"
              onClick={() => activeSoa.previousRevisionId && navigate(`/finance/soa/${activeSoa.previousRevisionId}`)}
              sx={{ cursor: 'pointer' }}
            />
          )}
          <Chip
            label={soaStatusLabel(activeSoa.status)}
            color={getStatusColor(activeSoa.status) as any}
            sx={{ fontWeight: 700 }}
          />
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {archiveSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setArchiveSuccess(null)}>{archiveSuccess}</Alert>}
      {archiveError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setArchiveError(null)}>{archiveError}</Alert>}

      {/* Header Info Banner */}
      <Box
        sx={{
          p: 2.5,
          mb: 3,
          bgcolor: '#ffffff',
          borderRadius: 2,
          border: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            STATEMENT OF ACCOUNT REF
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, fontFamily: 'monospace' }}>
            {activeSoa.soaNo}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Issued to <strong>{activeSoa.recipientName}</strong> on {activeSoa.date}
          </Typography>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<VisibilityIcon />}
            onClick={() => setPreviewOpen(true)}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Preview PDF
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={() => void downloadSoaPdf(activeSoa)}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Download PDF
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<CloudUploadIcon />}
            onClick={handleOneDriveUpload}
            disabled={archiving}
            sx={{ borderColor: NET_PACIFIC_COLORS.accent1, color: NET_PACIFIC_COLORS.accent1 }}
          >
            {archiving ? 'Archiving...' : 'Save to OneDrive'}
          </Button>
          {activeSoa.onedrive_web_url && (
            <Tooltip title="Open PDF in OneDrive">
              <IconButton
                size="small"
                component="a"
                href={activeSoa.onedrive_web_url}
                target="_blank"
                rel="noreferrer"
                sx={{ color: NET_PACIFIC_COLORS.primary }}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Button
            variant="contained"
            size="small"
            startIcon={<PaidIcon />}
            onClick={() => {
              setPaymentAmount(String(activeSoa.balanceRemaining || totals.totalOutstanding));
              setPaymentDialogOpen(true);
            }}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.success }}
          >
            Record Payment
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            onClick={() => setEditorOpen(true)}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Edit
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<HistoryEduIcon />}
            onClick={handleRevise}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.secondary }}
          >
            New Revision
          </Button>
          <IconButton size="small" onClick={(e) => setStatusAnchor(e.currentTarget)}>
            <MoreVertIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Status Menu */}
      <Menu anchorEl={statusAnchor} open={Boolean(statusAnchor)} onClose={() => setStatusAnchor(null)}>
        <MenuItem onClick={() => handleStatusSelect('draft')}>Set Status: Draft</MenuItem>
        <MenuItem onClick={() => handleStatusSelect('for_payment')}>Set Status: For Payment</MenuItem>
        <MenuItem onClick={() => handleStatusSelect('partially_paid')}>Set Status: Partially Paid</MenuItem>
        <MenuItem onClick={() => handleStatusSelect('settled')}>Set Status: Settled</MenuItem>
        <MenuItem onClick={() => handleStatusSelect('cancelled')}>Set Status: Cancelled</MenuItem>
      </Menu>

      {/* Summary KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2, bgcolor: '#ffffff', borderLeft: `4px solid ${NET_PACIFIC_COLORS.primary}` }}>
            <Typography variant="caption" color="text.secondary">TOTAL OUTSTANDING</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, mt: 0.5 }}>
              ₱{NUM(totals.totalOutstanding)}
            </Typography>
            <Typography variant="caption" color="text.secondary">VAT-EX (PHP)</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2, bgcolor: '#ffffff', borderLeft: `4px solid ${NET_PACIFIC_COLORS.accent1}` }}>
            <Typography variant="caption" color="text.secondary">SUBTOTAL (WITH PO)</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.accent1, mt: 0.5 }}>
              ₱{NUM(totals.subtotalWithPo)}
            </Typography>
            <Typography variant="caption" color="text.secondary">{itemsWithPo.length} projects</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2, bgcolor: '#ffffff', borderLeft: `4px solid #e67e22` }}>
            <Typography variant="caption" color="text.secondary">SUBTOTAL (PENDING PO)</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#e67e22', mt: 0.5 }}>
              ₱{NUM(totals.subtotalPendingPo)}
            </Typography>
            <Typography variant="caption" color="text.secondary">{itemsPendingPo.length} projects</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2, bgcolor: '#ffffff', borderLeft: `4px solid ${activeSoa.status === 'settled' ? NET_PACIFIC_COLORS.success : '#95a5a6'}` }}>
            <Typography variant="caption" color="text.secondary">COLLECTIONS & BALANCE</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: activeSoa.status === 'settled' ? NET_PACIFIC_COLORS.success : 'text.primary', mt: 0.5 }}>
              Collected: ₱{NUM(activeSoa.amountCollected || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Balance: ₱{NUM(activeSoa.balanceRemaining !== undefined ? activeSoa.balanceRemaining : totals.totalOutstanding)}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Recipient & Document Details */}
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="caption" color="text.secondary">Billed To (Recipient):</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{activeSoa.recipientName}</Typography>
            {activeSoa.recipientContactName && (
              <Typography variant="body2" color="text.secondary">
                Attn: {activeSoa.recipientContactName} {activeSoa.recipientContactPhone ? `(${activeSoa.recipientContactPhone})` : ''}
              </Typography>
            )}
            {activeSoa.recipientAddress && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {activeSoa.recipientAddress}
              </Typography>
            )}
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="caption" color="text.secondary">Document Metadata:</Typography>
            <Typography variant="body2"><strong>Date:</strong> {activeSoa.date}</Typography>
            <Typography variant="body2"><strong>Subject:</strong> {activeSoa.subject}</Typography>
            <Typography variant="body2"><strong>Prepared By:</strong> {activeSoa.preparedByName} ({activeSoa.preparedByTitle})</Typography>
            {activeSoa.onedrive_uploaded_at && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                OneDrive Snapshot: {activeSoa.onedrive_uploaded_at.slice(0, 19).replace('T', ' ')}
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>

      {/* Line Items Table */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 2, bgcolor: NET_PACIFIC_COLORS.primary, color: 'white', borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Account Summary Line Items</Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f4f7fb' }}>
                <TableCell sx={{ fontWeight: 700, width: '15%' }}>PO Number</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '20%' }}>Project / WBS</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '40%' }}>Description & Completion</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '15%', textAlign: 'right' }}>Amount (₱)</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '10%', textAlign: 'center' }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* SECTION 1: WITH PO */}
              <TableRow sx={{ bgcolor: '#eef3f9' }}>
                <TableCell colSpan={5} sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.secondary }}>
                  With Purchase Order ({itemsWithPo.length})
                </TableCell>
              </TableRow>
              {itemsWithPo.map((it) => (
                <TableRow key={it.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{it.poNumber}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{it.projectName}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{it.description}</Typography>
                    {it.completionDateText && (
                      <Typography variant="caption" color="text.secondary">Completion: {it.completionDateText}</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>₱{NUM(it.amount)}</TableCell>
                  <TableCell align="center">
                    <Button size="small" onClick={() => setRetroPoItem(it)}>Edit PO</Button>
                  </TableCell>
                </TableRow>
              ))}
              {itemsWithPo.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    No items with purchase orders.
                  </TableCell>
                </TableRow>
              )}

              {/* Subtotal With PO */}
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell colSpan={3} sx={{ textAlign: 'right', fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
                  Sub-total (with PO):
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
                  ₱{NUM(totals.subtotalWithPo)}
                </TableCell>
                <TableCell />
              </TableRow>

              {/* SECTION 2: PENDING PO */}
              <TableRow sx={{ bgcolor: '#fef5e7' }}>
                <TableCell colSpan={5} sx={{ fontWeight: 700, color: '#d35400' }}>
                  Pending Purchase Order ({itemsPendingPo.length})
                </TableCell>
              </TableRow>
              {itemsPendingPo.map((it) => (
                <TableRow key={it.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', color: '#d35400' }}>
                    N/A {it.footnoteSymbol ? ` ${it.footnoteSymbol}` : ''}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{it.projectName}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{it.description}</Typography>
                    {it.completionDateText && (
                      <Typography variant="caption" color="text.secondary">Completion: {it.completionDateText}</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#d35400' }}>₱{NUM(it.amount)}</TableCell>
                  <TableCell align="center">
                    <Button size="small" variant="contained" color="warning" onClick={() => setRetroPoItem(it)}>
                      Add PO
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {itemsPendingPo.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    No pending items.
                  </TableCell>
                </TableRow>
              )}

              {/* Subtotal Pending PO */}
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell colSpan={3} sx={{ textAlign: 'right', fontWeight: 700, color: '#d35400' }}>
                  Sub-total (pending PO):
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#d35400' }}>
                  ₱{NUM(totals.subtotalPendingPo)}
                </TableCell>
                <TableCell />
              </TableRow>

              {/* Grand Total */}
              <TableRow sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>
                <TableCell colSpan={3} sx={{ textAlign: 'right', fontWeight: 700, color: 'white' }}>
                  TOTAL OUTSTANDING, PhP (VAT-EX):
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: 'white', fontSize: '1rem' }}>
                  ₱{NUM(totals.totalOutstanding)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Payment Collections History */}
      {activeSoa.collections && activeSoa.collections.length > 0 && (
        <Paper sx={{ mb: 3 }}>
          <Box sx={{ p: 2, bgcolor: NET_PACIFIC_COLORS.secondary, color: 'white', borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Payment Collections History</Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f4f7fb' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Payment Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Reference / Check #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Notes</TableCell>
                  <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Amount Paid (₱)</TableCell>
                  <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Recorded At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeSoa.collections.map((col, idx) => (
                  <TableRow key={col.id || idx}>
                    <TableCell sx={{ fontWeight: 600 }}>{col.date}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{col.reference || '—'}</TableCell>
                    <TableCell>{col.notes || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.success }}>
                      ₱{NUM(col.amount)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                      {col.recordedAt ? col.recordedAt.slice(0, 10) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Footnotes & Annotations */}
      {activeSoa.footnotes && activeSoa.footnotes.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, mb: 1 }}>
            Footnotes & Explanations
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          {activeSoa.footnotes.map((fn, idx) => (
            <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>
              <strong>{fn.symbol}</strong> {fn.text}
            </Typography>
          ))}
        </Paper>
      )}

      {/* Modals & Dialogs */}
      <SoaPdfPreviewDialog
        open={previewOpen}
        soa={activeSoa}
        onClose={() => setPreviewOpen(false)}
      />

      <SoaEditorDialog
        open={editorOpen}
        soa={activeSoa}
        onClose={() => setEditorOpen(false)}
        onSave={async (payload) => {
          await saveSoa(payload);
        }}
      />

      <RetroactivePoDialog
        open={Boolean(retroPoItem)}
        item={retroPoItem}
        onClose={() => setRetroPoItem(null)}
        onSave={async (itemId, updates) => {
          await modifyItem(activeSoa.id, itemId, updates);
        }}
      />

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onClose={() => setPaymentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
          Record Collection / Payment for {activeSoa.soaNo}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Payment Amount (₱)"
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              size="small"
              fullWidth
              autoFocus
            />
            <TextField
              label="Payment Date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Reference / Check # / OR #"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              size="small"
              fullWidth
              placeholder="e.g. Check #123456 or Deposit Ref"
            />
            <TextField
              label="Notes"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              size="small"
              fullWidth
              multiline
              rows={2}
              placeholder="Optional remarks..."
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPaymentDialogOpen(false)} disabled={savingPayment}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleRecordPaymentSubmit}
            disabled={savingPayment}
            sx={{ bgcolor: NET_PACIFIC_COLORS.success }}
          >
            {savingPayment ? 'Saving...' : 'Save Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
