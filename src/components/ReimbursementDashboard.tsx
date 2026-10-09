import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Button, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, CircularProgress, Snackbar, Chip, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, TextField, MenuItem, useMediaQuery,
} from '@mui/material';
import { API_BASE } from '../config/api';
import { blobToBase64, compressForUpload } from '../utils/receipts/imageCompress';
import { convertHeicToJpeg } from '../utils/receipts/imageUtils';
import { useLocation, useNavigate } from 'react-router-dom';
import MoneyTrailButton from './finance/MoneyTrailButton';
import { getFinanceTrace } from '../services/financeTraceService';
import { useFinanceRowFocus } from '../hooks/useFinanceRowFocus';
import { financeFocusToken, financeFocusUrl, parseFinanceFocus } from '../utils/financeTraceFocus';
import {
  cashAdvanceOrigin,
  reimbursementOrigin,
  reimbursementSummaryFromTrace,
} from '../utils/financeModuleOrigins';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0', secondary: '#1e4a72', accent1: '#4f7bc8', accent2: '#3c6ba5',
  success: '#00b894', warning: '#fdcb6e', error: '#e84393', info: '#74b9ff',
};
const API = `${API_BASE}/api`;

function formatPHP(n: number) {
  return '₱' + (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(ts?: number | string | null) {
  if (!ts) return '—';
  if (typeof ts === 'string') return ts.slice(0, 10);
  return new Date(ts * 1000).toLocaleDateString('en-PH');
}

interface FundingSource {
  type: 'investor_outofpocket' | 'corporate_bank';
  investor?: string;
  linkedInvestmentId?: string;
}

interface Reimbursement {
  id: string;
  liquidationId: string;
  formNo: string | null;
  employeeId: string;
  employeeName: string | null;
  origin: 'ca_excess' | 'no_ca';
  amount: number;
  caId: string | null;
  status: 'pending' | 'paid';
  fundingSource: FundingSource | null;
  paidAt: number | null;
  paidBy: string | null;
  paidAmount?: number;
  createdAt: number | string;
  updatedAt: number | string;
  username?: string;
  full_name?: string | null;
}

interface CashAdvanceRow {
  id: string;
  ca_no?: string | null;
  user_id: string;
  amount: number;
  balance_remaining: number;
  status: string;
  purpose: string | null;
  project_name?: string | null;
  username?: string;
  full_name?: string | null;
}

interface ClaimLine {
  rowId: string; date: string; category: string; particulars: string;
  amount: number; hasReceipt: boolean; paid: boolean;
}
interface ClaimPayment {
  id: string; kind: 'lines' | 'remaining'; amount: number; paidAt: number;
  reference?: string; overrideReason?: string | null; rowIds?: string[] | null;
  proofRef?: ProofRef | null;
}
interface ProofRef { oneDriveId: string; webUrl: string; filename: string }

const PROOF_ACCEPT = 'image/*,.pdf,.heic,.heif';

// Upload a proof-of-payment file (screenshot/PDF) to OneDrive and return its reference.
async function uploadPaymentProof(file: File, formNo: string | null, authToken: string | null): Promise<ProofRef> {
  const safe = await convertHeicToJpeg(file);
  const compressed = await compressForUpload(safe);
  const contentBase64 = await blobToBase64(compressed);
  const extMatch = safe.name.match(/\.[a-z0-9]+$/i);
  const ext = extMatch ? extMatch[0] : (safe.type === 'application/pdf' ? '.pdf' : '.jpg');
  const filename = `PROOF-${Date.now()}${ext}`;
  const folderPath = `Reimbursement Proofs/${new Date().getFullYear()}/${(formNo || 'unassigned').replace(/[\\/:*?"<>|]/g, '-')}`;
  const res = await fetch(`${API}/onedrive/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: JSON.stringify({ folderPath, filename, contentBase64 }),
  });
  const data = await res.json().catch(() => ({ ok: false })) as { ok: boolean; id?: string; webUrl?: string };
  if (!data.ok || !data.id || !data.webUrl) throw new Error('Proof upload to OneDrive failed. Try again.');
  return { oneDriveId: data.id, webUrl: data.webUrl, filename };
}

const remainingOf = (r: Reimbursement) => Math.max(0, (Number(r.amount) || 0) - (Number(r.paidAmount) || 0));

type PayDialogContext =
  | { kind: 'single-reimb'; reimb: Reimbursement }
  | { kind: 'batch-reimb'; ids: string[] };

const ReimbursementDashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [cashAdvances, setCashAdvances] = useState<CashAdvanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Portrait phones (< 600 px): claims, advances and payable lines show as cards.
  const isPhone = useMediaQuery('(max-width:599.95px)');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [focusedHistorical, setFocusedHistorical] = useState<Reimbursement | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusLoadError, setFocusLoadError] = useState('');
  const financeRowRefs = useRef(new Map<string, HTMLElement>());

  const [payDialog, setPayDialog] = useState<PayDialogContext | null>(null);
  const [payFundingType, setPayFundingType] = useState<'corporate_bank' | 'investor_outofpocket'>('corporate_bank');
  const [payInvestor, setPayInvestor] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const [lineProofFile, setLineProofFile] = useState<File | null>(null);
  const [payProofFile, setPayProofFile] = useState<File | null>(null);
  // One or more claims (liquidation forms) paid by a single transfer. Empty = dialog closed.
  const [linesTargets, setLinesTargets] = useState<Reimbursement[]>([]);
  const [claimLines, setClaimLines] = useState<Record<string, ClaimLine[]>>({});
  const [linePayments, setLinePayments] = useState<ClaimPayment[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [lineSelected, setLineSelected] = useState<string[]>([]);
  const [lineReference, setLineReference] = useState('');
  const [lineOverride, setLineOverride] = useState('');
  const [lineFundingType, setLineFundingType] = useState<'corporate_bank' | 'investor_outofpocket'>('corporate_bank');
  const [lineInvestor, setLineInvestor] = useState('');
  const [lineSubmitting, setLineSubmitting] = useState(false);
  const [lineError, setLineError] = useState('');

  const [closeTarget, setCloseTarget] = useState<CashAdvanceRow | null>(null);
  const [closing, setClosing] = useState(false);

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('netpacific_token');
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/reimbursements`, { headers: authHeaders() }).then(r => r.json()).catch(() => ({ success: false })),
      fetch(`${API}/cash-advances`, { headers: authHeaders() }).then(r => r.json()).catch(() => ({ success: false })),
    ])
      .then(([reimbData, caData]) => {
        if (reimbData.success) setReimbursements(reimbData.reimbursements || []);
        else setError(reimbData.error || 'Failed to load reimbursements.');
        if (caData.success) setCashAdvances(caData.cash_advances || []);
      })
      .catch(() => setError('Failed to load reimbursements.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rawFinanceFocus = new URLSearchParams(location.search).get('focus') || '';
  const focusedOrigin = parseFinanceFocus(rawFinanceFocus);
  useEffect(() => {
    if (focusedOrigin?.type !== 'reimbursement') {
      setFocusedHistorical(null);
      setFocusLoadError('');
      return;
    }
    if (reimbursements.some((row) => row.id === focusedOrigin.id)) return;
    let cancelled = false;
    setFocusLoading(true);
    setFocusLoadError('');
    getFinanceTrace(focusedOrigin)
      .then((trace) => {
        if (cancelled) return;
        const summary = reimbursementSummaryFromTrace(trace);
        if (!summary) {
          setFocusLoadError('The linked reimbursement could not be found.');
          return;
        }
        setFocusedHistorical({
          id: summary.id,
          liquidationId: summary.liquidationId,
          formNo: summary.formNo,
          employeeId: '',
          employeeName: summary.employeeName,
          origin: summary.caId ? 'ca_excess' : 'no_ca',
          amount: summary.amount,
          caId: summary.caId,
          status: summary.status === 'paid' ? 'paid' : 'pending',
          fundingSource: null,
          paidAt: null,
          paidBy: null,
          createdAt: summary.createdAt,
          updatedAt: summary.createdAt,
        });
      })
      .catch((caught) => {
        if (!cancelled) setFocusLoadError(caught instanceof Error ? caught.message : 'Failed to load reimbursement.');
      })
      .finally(() => {
        if (!cancelled) setFocusLoading(false);
      });
    return () => { cancelled = true; };
    // The URL token and pending-list refresh are the only reload triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawFinanceFocus, reimbursements]);

  const displayedReimbursements = useMemo(() => {
    if (!focusedHistorical || reimbursements.some((row) => row.id === focusedHistorical.id)) {
      return reimbursements;
    }
    return [focusedHistorical, ...reimbursements];
  }, [focusedHistorical, reimbursements]);

  const financeFocus = useFinanceRowFocus({
    records: displayedReimbursements,
    originForRecord: reimbursementOrigin,
    loading: loading || focusLoading,
    rowRefs: financeRowRefs,
  });

  const held = useMemo(
    () => cashAdvances.filter(ca => ca.status === 'approved' && Number(ca.balance_remaining) > 0),
    [cashAdvances]
  );

  const totalOwed = useMemo(
    () => reimbursements.reduce((s, r) => s + remainingOf(r), 0),
    [reimbursements]
  );
  const totalHeld = useMemo(
    () => held.reduce((s, ca) => s + (Number(ca.balance_remaining) || 0), 0),
    [held]
  );

  const selectedClaims = useMemo(
    () => reimbursements.filter(r => selectedIds.includes(r.id)),
    [reimbursements, selectedIds]
  );

  const allSelected = reimbursements.length > 0 && selectedIds.length === reimbursements.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < reimbursements.length;

  const toggleAll = () => setSelectedIds(allSelected ? [] : reimbursements.map(r => r.id));
  const toggleOne = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const openPayDialog = (ctx: PayDialogContext) => {
    setPayDialog(ctx);
    setPayFundingType('corporate_bank');
    setPayInvestor('');
    setError('');
  };
  const closePayDialog = () => {
    setPayDialog(null);
    setPayProofFile(null);
    setPayFundingType('corporate_bank');
    setPayInvestor('');
  };

  const confirmPay = async () => {
    if (!payDialog || paySubmitting) return;
    const fundingSource = payFundingType === 'investor_outofpocket' && payInvestor
      ? { type: 'investor_outofpocket' as const, investor: payInvestor }
      : undefined;
    setPaySubmitting(true);
    setError('');
    let proofRef: ProofRef | undefined;
    if (payProofFile && payDialog.kind === 'single-reimb') {
      try {
        proofRef = await uploadPaymentProof(payProofFile, payDialog.reimb.formNo, localStorage.getItem('netpacific_token'));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Proof upload failed.');
        setPaySubmitting(false);
        return;
      }
    }
    const request = payDialog.kind === 'batch-reimb'
      ? fetch(`${API}/reimbursements/batch-mark`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ ids: payDialog.ids, ...(fundingSource ? { fundingSource } : {}) }),
        })
      : fetch(`${API}/reimbursements/${payDialog.reimb.id}/pay`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ ...(fundingSource ? { fundingSource } : {}), ...(proofRef ? { proofRef } : {}) }),
        });
    request
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setToast(data.message || 'Reimbursement paid');
          setSelectedIds([]);
          closePayDialog();
          fetchData();
        } else {
          setError(data.error || 'Failed to pay reimbursement.');
        }
      })
      .catch(() => setError('Failed to pay reimbursement.'))
      .finally(() => setPaySubmitting(false));
  };

  const lineKey = (claimId: string, rowId: string) => `${claimId}::${rowId}`;
  const openLinesDialog = (targets: Reimbursement[]) => {
    setLinesTargets(targets);
    setClaimLines({});
    setLinePayments([]);
    setLineSelected([]);
    setLineReference('');
    setLineProofFile(null);
    setLineOverride('');
    setLineFundingType('corporate_bank');
    setLineInvestor('');
    setLineError('');
    setLinesLoading(true);
    Promise.all(targets.map(t =>
      fetch(`${API}/reimbursements/${t.id}/lines`, { headers: authHeaders() }).then(res => res.json()),
    ))
      .then(results => {
        const failed = results.find(d => !d.success);
        if (failed) { setLineError(failed.error || 'Failed to load lines.'); return; }
        const byClaim: Record<string, ClaimLine[]> = {};
        const selected: string[] = [];
        results.forEach((data, i) => {
          const loaded: ClaimLine[] = data.lines || [];
          byClaim[targets[i].id] = loaded;
          // Default: pay only what is supported by a receipt.
          loaded.filter(l => l.hasReceipt && !l.paid).forEach(l => selected.push(lineKey(targets[i].id, l.rowId)));
        });
        setClaimLines(byClaim);
        setLineSelected(selected);
        if (targets.length === 1) setLinePayments(results[0].payments || []);
      })
      .catch(() => setLineError('Failed to load lines.'))
      .finally(() => setLinesLoading(false));
  };
  const closeLinesDialog = () => { if (!lineSubmitting) setLinesTargets([]); };
  const toggleLine = (key: string) =>
    setLineSelected(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
  const selectedLineEntries = linesTargets.flatMap(t =>
    (claimLines[t.id] || []).filter(l => lineSelected.includes(lineKey(t.id, l.rowId))).map(l => ({ claim: t, line: l })),
  );
  const selectedLineTotal = selectedLineEntries.reduce((sum, e) => sum + e.line.amount, 0);
  const selectedNoReceipt = selectedLineEntries.filter(e => !e.line.hasReceipt);
  const confirmPayLines = async () => {
    if (linesTargets.length === 0 || lineSubmitting) return;
    setLineSubmitting(true);
    setLineError('');
    let proofRef: ProofRef | undefined;
    if (lineProofFile) {
      try {
        const proofName = linesTargets.length === 1 ? linesTargets[0].formNo : `Transfer-${linesTargets.map(t => t.formNo).filter(Boolean).join('+')}`.slice(0, 80);
        proofRef = await uploadPaymentProof(lineProofFile, proofName, localStorage.getItem('netpacific_token'));
      } catch (e) {
        setLineError(e instanceof Error ? e.message : 'Proof upload failed.');
        setLineSubmitting(false);
        return;
      }
    }
    const fundingSource = lineFundingType === 'investor_outofpocket' && lineInvestor
      ? { type: 'investor_outofpocket' as const, investor: lineInvestor }
      : undefined;
    const common = {
      reference: lineReference,
      ...(proofRef ? { proofRef } : {}),
      ...(selectedNoReceipt.length > 0 ? { overrideReason: lineOverride } : {}),
      ...(fundingSource ? { fundingSource } : {}),
    };
    const claims = linesTargets
      .map(t => ({ id: t.id, rowIds: selectedLineEntries.filter(e => e.claim.id === t.id).map(e => e.line.rowId) }))
      .filter(c => c.rowIds.length > 0);
    const request = linesTargets.length === 1
      ? fetch(`${API}/reimbursements/${linesTargets[0].id}/pay-lines`, {
          method: 'POST', headers: authHeaders(), body: JSON.stringify({ rowIds: claims[0]?.rowIds || [], ...common }),
        })
      : fetch(`${API}/reimbursements/pay-lines-batch`, {
          method: 'POST', headers: authHeaders(), body: JSON.stringify({ claims, ...common }),
        });
    request
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setToast(data.message || 'Lines paid');
          setLinesTargets([]);
          setSelectedIds([]);
          fetchData();
        } else {
          setLineError(data.error || 'Failed to pay lines.');
        }
      })
      .catch(() => setLineError('Failed to pay lines.'))
      .finally(() => setLineSubmitting(false));
  };

  const handleCloseCa = (closureType: 'returned' | 'written_off') => {
    if (!closeTarget || closing) return;
    setClosing(true);
    setError('');
    fetch(`${API}/cash-advances/${closeTarget.id}/close`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ closureType }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setToast(data.message || 'Cash advance closed');
          setCloseTarget(null);
          fetchData();
        } else {
          setError(data.error || 'Failed to close cash advance.');
        }
      })
      .catch(() => setError('Failed to close cash advance.'))
      .finally(() => setClosing(false));
  };

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Reimbursements
        </Typography>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}

      {(financeFocus.focusedKey || financeFocus.focusError || focusLoadError) && (
        <Alert
          severity={(financeFocus.focusError || focusLoadError) ? 'warning' : 'info'}
          sx={{ mb: 1.5 }}
          action={(
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {financeFocus.hasBackSource && <Button color="inherit" size="small" onClick={financeFocus.backToSource}>Back to source</Button>}
              <Button color="inherit" size="small" onClick={financeFocus.clearFocus}>Clear focus</Button>
            </Box>
          )}
        >
          {focusLoading
            ? 'Loading the exact reimbursement…'
            : focusLoadError || financeFocus.focusError || 'Showing the exact reimbursement from the money trail.'}
        </Alert>
      )}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #e53935 0%, #ef9a9a 100%)', color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Company Owes Employees</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{formatPHP(totalOwed)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{reimbursements.length} claim{reimbursements.length === 1 ? '' : 's'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Employees Hold Company Cash</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{formatPHP(totalHeld)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Unliquidated CA balance</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Pending Claims</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{reimbursements.length}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Awaiting payout</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Open Advances</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{held.length}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Awaiting close-out</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ flexGrow: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
          <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Reimbursement Claims ({displayedReimbursements.length})
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="contained"
              size="small"
              disabled={selectedIds.length === 0}
              onClick={() => openPayDialog({ kind: 'batch-reimb', ids: selectedIds })}
              sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
            >
              Pay Selected ({selectedIds.length})
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={selectedIds.length === 0 || selectedClaims.some(r => r.origin !== 'no_ca' || r.status !== 'pending')}
              onClick={() => openLinesDialog(selectedClaims)}
              title="Pay selected lines from the selected forms as one transfer (out-of-pocket claims only)"
            >
              Pay lines ({selectedIds.length})
            </Button>
            </Box>
          </Box>
          {isPhone ? (
            <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {loading ? (
                <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
              ) : displayedReimbursements.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No pending reimbursement claims.</Typography>
              ) : (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Checkbox size="small" indeterminate={someSelected} checked={allSelected} onChange={toggleAll} disabled={reimbursements.length === 0} />
                    <Typography variant="body2" color="text.secondary">Select all</Typography>
                  </Box>
                  {displayedReimbursements.map(r => {
                    const origin = reimbursementOrigin(r);
                    const rowToken = financeFocusToken(origin);
                    const focused = financeFocus.isFocused(origin);
                    const historical = r.status !== 'pending';
                    const selected = selectedIds.includes(r.id);
                    return (
                      <Paper
                        key={r.id}
                        variant="outlined"
                        ref={(element: HTMLDivElement | null) => {
                          if (element) financeRowRefs.current.set(rowToken, element as unknown as HTMLTableRowElement);
                          else financeRowRefs.current.delete(rowToken);
                        }}
                        aria-current={focused ? 'true' : undefined}
                        sx={{
                          p: 1.25,
                          ...(selected ? { bgcolor: 'action.selected' } : {}),
                          ...(focused ? { bgcolor: 'rgba(44,90,160,0.14)', outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '-2px' } : {}),
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                          <Checkbox size="small" checked={selected} onChange={() => toggleOne(r.id)} disabled={historical} sx={{ p: 0.5, mt: -0.25 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {r.employeeName || r.full_name || r.username || '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">{formatDate(r.createdAt)}</Typography>
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                              {historical ? formatPHP(Number(r.amount) || 0) : formatPHP(remainingOf(r))}
                            </Typography>
                          </Box>
                        </Box>
                        {!historical && (Number(r.paidAmount) || 0) > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right' }}>
                            Partial · {formatPHP(Number(r.paidAmount))} of {formatPHP(Number(r.amount) || 0)} paid
                          </Typography>
                        )}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
                          <Chip
                            size="small"
                            label={historical ? 'Paid · historical' : r.origin === 'ca_excess' ? 'CA Excess' : 'Out-of-pocket'}
                            color={historical ? 'success' : r.origin === 'ca_excess' ? 'warning' : 'info'}
                          />
                          {r.liquidationId && (
                            <Chip
                              size="small" variant="outlined" color="warning"
                              label={r.formNo || 'Open liquidation'}
                              onClick={() => navigate(financeFocusUrl(
                                { type: 'liquidation', id: r.liquidationId, rowId: '__form__' },
                                `${location.pathname}${location.search}`,
                              ))}
                              sx={{ cursor: 'pointer' }}
                            />
                          )}
                          {r.caId && (
                            <Chip
                              size="small" variant="outlined" label="Open CA"
                              onClick={() => navigate(financeFocusUrl(
                                cashAdvanceOrigin({ id: r.caId as string }),
                                `${location.pathname}${location.search}`,
                              ))}
                              sx={{ cursor: 'pointer' }}
                            />
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, mt: 0.5 }}>
                          {!historical && r.origin === 'no_ca' && (
                            <Button size="small" variant="outlined" onClick={() => openLinesDialog([r])} sx={{ color: NET_PACIFIC_COLORS.primary }}>
                              Pay lines
                            </Button>
                          )}
                          {!historical && (
                            <Button size="small" variant="contained" onClick={() => openPayDialog({ kind: 'single-reimb', reimb: r })}
                              sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}>
                              Pay
                            </Button>
                          )}
                          <MoneyTrailButton origin={origin} compact onResolved={fetchData} />
                        </Box>
                      </Paper>
                    );
                  })}
                </>
              )}
            </Box>
          ) : (
          <TableContainer sx={{ maxHeight: 'calc(50vh - 240px)', minHeight: 200 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={someSelected}
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={reimbursements.length === 0}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Form No.</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Origin</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Amount</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
                ) : displayedReimbursements.length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>No pending reimbursement claims.</TableCell></TableRow>
                ) : displayedReimbursements.map(r => {
                  const origin = reimbursementOrigin(r);
                  const rowToken = financeFocusToken(origin);
                  const focused = financeFocus.isFocused(origin);
                  const historical = r.status !== 'pending';
                  return (
                  <TableRow
                    key={r.id}
                    hover
                    selected={selectedIds.includes(r.id)}
                    ref={(element: HTMLTableRowElement | null) => {
                      if (element) financeRowRefs.current.set(rowToken, element);
                      else financeRowRefs.current.delete(rowToken);
                    }}
                    aria-current={focused ? 'true' : undefined}
                    sx={{
                      '&:nth-of-type(odd)': { backgroundColor: focused ? 'rgba(44,90,160,0.14)' : 'rgba(0,0,0,0.02)' },
                      ...(focused ? { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '-2px' } : {}),
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox checked={selectedIds.includes(r.id)} onChange={() => toggleOne(r.id)} disabled={historical} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {r.liquidationId ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          color="warning"
                          label={r.formNo || 'Open liquidation'}
                          onClick={() => navigate(financeFocusUrl(
                            { type: 'liquidation', id: r.liquidationId, rowId: '__form__' },
                            `${location.pathname}${location.search}`,
                          ))}
                          sx={{ cursor: 'pointer' }}
                        />
                      ) : '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{r.employeeName || r.full_name || r.username || '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      <Chip
                        size="small"
                        label={historical ? 'Paid · historical' : r.origin === 'ca_excess' ? 'CA Excess' : 'Out-of-pocket'}
                        color={historical ? 'success' : r.origin === 'ca_excess' ? 'warning' : 'info'}
                      />
                      {r.caId && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label="Open CA"
                          onClick={() => navigate(financeFocusUrl(
                            cashAdvanceOrigin({ id: r.caId as string }),
                            `${location.pathname}${location.search}`,
                          ))}
                          sx={{ ml: 0.5, cursor: 'pointer' }}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatDate(r.createdAt)}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }} align="right">
                      {historical ? formatPHP(Number(r.amount) || 0) : formatPHP(remainingOf(r))}
                      {!historical && (Number(r.paidAmount) || 0) > 0 && (
                        <Typography variant="caption" component="div" color="text.secondary">
                          Partial · {formatPHP(Number(r.paidAmount))} of {formatPHP(Number(r.amount) || 0)} paid
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {!historical && r.origin === 'no_ca' && (
                        <Button size="small" onClick={() => openLinesDialog([r])} sx={{ color: NET_PACIFIC_COLORS.primary }}>
                          Pay lines
                        </Button>
                      )}
                      {!historical && (
                        <Button size="small" onClick={() => openPayDialog({ kind: 'single-reimb', reimb: r })} sx={{ color: NET_PACIFIC_COLORS.primary }}>
                          Pay
                        </Button>
                      )}
                      <MoneyTrailButton origin={origin} compact onResolved={fetchData} />
                    </TableCell>
                  </TableRow>
                );})}
              </TableBody>
            </Table>
          </TableContainer>
          )}
        </Paper>

        <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
          <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Outstanding Cash Advances ({held.length})
            </Typography>
          </Box>
          {isPhone ? (
            <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {loading ? (
                <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
              ) : held.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No outstanding cash advances.</Typography>
              ) : held.map(ca => (
                <Paper key={ca.id} variant="outlined" sx={{ p: 1.25 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{ca.ca_no || ca.id}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>{ca.full_name || ca.username || '—'}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {ca.project_name || ca.purpose || '—'}
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, mt: 0.75 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Advanced</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{formatPHP(Number(ca.amount) || 0)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Balance remaining</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'warning.main', fontWeight: 600 }}>{formatPHP(Number(ca.balance_remaining) || 0)}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                    <Button size="small" variant="outlined" onClick={() => setCloseTarget(ca)} sx={{ color: NET_PACIFIC_COLORS.primary }}>
                      Close &amp; Settle
                    </Button>
                  </Box>
                </Paper>
              ))}
            </Box>
          ) : (
          <TableContainer sx={{ maxHeight: 'calc(50vh - 240px)', minHeight: 200 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>CA No.</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Advanced</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Balance Remaining</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Project/Purpose</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
                ) : held.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>No outstanding cash advances.</TableCell></TableRow>
                ) : held.map(ca => (
                  <TableRow key={ca.id} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{ca.ca_no || ca.id}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{ca.full_name || ca.username || '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }} align="right">{formatPHP(Number(ca.amount) || 0)}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: 'warning.main', fontWeight: 600 }} align="right">{formatPHP(Number(ca.balance_remaining) || 0)}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{ca.project_name || ca.purpose || '—'}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => setCloseTarget(ca)} sx={{ color: NET_PACIFIC_COLORS.primary }}>
                        Close &amp; Settle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          )}
        </Paper>
      </Box>

      <Dialog open={!!payDialog} onClose={closePayDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Pay Reimbursement</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <DialogContentText sx={{ mb: 2 }}>
            {payDialog?.kind === 'batch-reimb'
              ? `Mark ${payDialog.ids.length} selected claim(s) as paid.`
              : payDialog?.kind === 'single-reimb'
                ? `Mark the reimbursement claim for ${payDialog.reimb.employeeName || payDialog.reimb.full_name || payDialog.reimb.username || 'this employee'} (${formatPHP(remainingOf(payDialog.reimb))}${(Number(payDialog.reimb.paidAmount) || 0) > 0 ? ' remaining' : ''}) as paid.`
                : ''}
          </DialogContentText>
          <TextField
            select
            size="small"
            label="Funding Source"
            value={payFundingType}
            fullWidth
            sx={{ mb: 2 }}
            onChange={(e) => {
              const v = e.target.value as 'corporate_bank' | 'investor_outofpocket';
              setPayFundingType(v);
              if (v !== 'investor_outofpocket') setPayInvestor('');
            }}
          >
            <MenuItem value="corporate_bank">Corporate Bank / Petty Cash</MenuItem>
            <MenuItem value="investor_outofpocket">Investor Out-of-Pocket</MenuItem>
          </TextField>
          {payFundingType === 'investor_outofpocket' && (
            <TextField
              size="small"
              label="Investor Name"
              value={payInvestor}
              onChange={(e) => setPayInvestor(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
          )}
          {payDialog?.kind === 'single-reimb' && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
            <Button component="label" size="small" variant="outlined" disabled={paySubmitting}>
              {payProofFile ? 'Change proof' : 'Attach proof of payment'}
              <input type="file" hidden accept={PROOF_ACCEPT} onChange={(e) => { setPayProofFile(e.target.files?.[0] || null); e.target.value = ''; }} />
            </Button>
            {payProofFile && (
              <Chip size="small" label={payProofFile.name} onDelete={() => setPayProofFile(null)} />
            )}
            {!payProofFile && <Typography variant="caption" color="text.secondary">Optional — screenshot or PDF of the InstaPay / GCash receipt</Typography>}
          </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closePayDialog} disabled={paySubmitting}>Cancel</Button>
          <Button
            variant="contained"
            onClick={confirmPay}
            disabled={paySubmitting || (payFundingType === 'investor_outofpocket' && !payInvestor)}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {paySubmitting ? <CircularProgress size={20} /> : 'Confirm Payment'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={linesTargets.length > 0} onClose={closeLinesDialog} maxWidth="md" fullWidth fullScreen={isPhone}>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {linesTargets.length > 1
            ? `Pay lines — one transfer, ${linesTargets.length} forms`
            : `Pay lines — ${linesTargets[0]?.formNo || ''} ${linesTargets[0]?.employeeName ? `· ${linesTargets[0].employeeName}` : ''}`}
        </DialogTitle>
        <DialogContent>
          {lineError && <Alert severity="error" sx={{ mb: 2 }}>{lineError}</Alert>}
          <DialogContentText sx={{ mb: 1.5 }}>
            Receipted lines are pre-selected. Lines left unpaid stay on their claim and can be paid later once the receipt is attached.
            {linesTargets.length > 1 && ' All selected lines are paid as one transfer: one reference and one proof, recorded against each form.'}
          </DialogContentText>
          {linesLoading ? (
            <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
          ) : isPhone ? (
            <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {linesTargets.map(t => (
                <Box key={t.id}>
                  {linesTargets.length > 1 && (
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1, mb: 0.5 }}>
                      {t.formNo || t.id} · {t.employeeName || ''}
                    </Typography>
                  )}
                  {(claimLines[t.id] || []).map(l => (
                    <Paper key={`${t.id}-${l.rowId}`} variant="outlined" sx={{ p: 1, mb: 0.5, display: 'flex', alignItems: 'flex-start', gap: 0.5, ...(l.paid ? { opacity: 0.55 } : {}) }}>
                      <Checkbox size="small" sx={{ p: 0.5 }} checked={lineSelected.includes(lineKey(t.id, l.rowId))} disabled={l.paid} onChange={() => toggleLine(lineKey(t.id, l.rowId))} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{l.particulars || l.category}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                          <Typography variant="caption" color="text.secondary">{l.date}</Typography>
                          {l.paid
                            ? <Chip size="small" color="success" label="Paid" />
                            : <Chip size="small" color={l.hasReceipt ? 'success' : 'warning'} variant="outlined" label={l.hasReceipt ? 'Receipt attached' : 'No receipt'} />}
                        </Box>
                      </Box>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatPHP(l.amount)}</Typography>
                    </Paper>
                  ))}
                </Box>
              ))}
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 320, mb: 2 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Particulars</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Receipt</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {linesTargets.flatMap(t => [
                    ...(linesTargets.length > 1 ? [(
                      <TableRow key={`h-${t.id}`}>
                        <TableCell colSpan={5} sx={{ fontWeight: 600, bgcolor: 'action.hover' }}>
                          {t.formNo || t.id} · {t.employeeName || ''}
                        </TableCell>
                      </TableRow>
                    )] : []),
                    ...(claimLines[t.id] || []).map(l => (
                    <TableRow key={`${t.id}-${l.rowId}`} hover sx={l.paid ? { opacity: 0.55 } : undefined}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={lineSelected.includes(lineKey(t.id, l.rowId))} disabled={l.paid} onChange={() => toggleLine(lineKey(t.id, l.rowId))} />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{l.date}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>{l.particulars || l.category}</TableCell>
                      <TableCell>
                        {l.paid
                          ? <Chip size="small" color="success" label="Paid" />
                          : <Chip size="small" color={l.hasReceipt ? 'success' : 'warning'} variant="outlined" label={l.hasReceipt ? 'Attached' : 'Missing'} />}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }} align="right">{formatPHP(l.amount)}</TableCell>
                    </TableRow>
                    )),
                  ])}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            To pay now: {formatPHP(selectedLineTotal)} ({selectedLineEntries.length} line{selectedLineEntries.length === 1 ? '' : 's'}
            {linesTargets.length > 1 ? ` across ${new Set(selectedLineEntries.map(e => e.claim.id)).size} forms` : ''})
          </Typography>
          {selectedNoReceipt.length > 0 && (
            <TextField
              size="small" fullWidth required sx={{ mb: 2 }}
              label={`Override reason — ${selectedNoReceipt.length} selected line(s) have no receipt`}
              value={lineOverride}
              onChange={(e) => setLineOverride(e.target.value)}
            />
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
            <TextField
              size="small" label="Payment reference (InstaPay / GCash ref)" value={lineReference}
              onChange={(e) => setLineReference(e.target.value)} sx={{ flex: 1, minWidth: { xs: '100%', sm: 240 } }}
            />
            <TextField
              select size="small" label="Funding Source" value={lineFundingType}
              onChange={(e) => {
                const v = e.target.value as 'corporate_bank' | 'investor_outofpocket';
                setLineFundingType(v);
                if (v !== 'investor_outofpocket') setLineInvestor('');
              }}
              sx={{ flex: 1, minWidth: { xs: '100%', sm: 240 } }}
            >
              <MenuItem value="corporate_bank">Corporate Bank / Petty Cash</MenuItem>
              <MenuItem value="investor_outofpocket">Investor Out-of-Pocket</MenuItem>
            </TextField>
            {lineFundingType === 'investor_outofpocket' && (
              <TextField size="small" label="Investor Name" value={lineInvestor} onChange={(e) => setLineInvestor(e.target.value)} fullWidth />
            )}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
            <Button component="label" size="small" variant="outlined" disabled={lineSubmitting}>
              {lineProofFile ? 'Change proof' : 'Attach proof of payment'}
              <input type="file" hidden accept={PROOF_ACCEPT} onChange={(e) => { setLineProofFile(e.target.files?.[0] || null); e.target.value = ''; }} />
            </Button>
            {lineProofFile && (
              <Chip size="small" label={lineProofFile.name} onDelete={() => setLineProofFile(null)} />
            )}
            {!lineProofFile && <Typography variant="caption" color="text.secondary">Optional — screenshot or PDF of the InstaPay / GCash receipt</Typography>}
          </Box>
          {linePayments.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Payment history</Typography>
              {linePayments.map(pm => (
                <Typography key={pm.id} variant="body2" color="text.secondary">
                  {formatDate(pm.paidAt)} · {formatPHP(pm.amount)} · {pm.kind === 'lines' ? `${pm.rowIds?.length || 0} line(s)` : 'remaining balance'}
                  {pm.reference ? ` · ref ${pm.reference}` : ''}{pm.overrideReason ? ` · override: ${pm.overrideReason}` : ''}
                  {pm.proofRef?.webUrl && (
                    <> · <a href={pm.proofRef.webUrl} target="_blank" rel="noreferrer">proof</a></>
                  )}
                </Typography>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeLinesDialog} disabled={lineSubmitting}>Cancel</Button>
          <Button
            variant="contained"
            onClick={confirmPayLines}
            disabled={
              lineSubmitting || linesLoading || selectedLineEntries.length === 0
              || (selectedNoReceipt.length > 0 && !lineOverride.trim())
              || (lineFundingType === 'investor_outofpocket' && !lineInvestor)
            }
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {lineSubmitting ? <CircularProgress size={20} /> : `Pay ${formatPHP(selectedLineTotal)}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!closeTarget} onClose={() => setCloseTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Close &amp; Settle — {closeTarget?.ca_no || closeTarget?.id}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <DialogContentText sx={{ mb: 2 }}>
            {closeTarget?.full_name || closeTarget?.username || 'This employee'} still holds an unused balance of{' '}
            <strong>{closeTarget ? formatPHP(Number(closeTarget.balance_remaining)) : formatPHP(0)}</strong> on this cash advance. Choose how to settle it.
          </DialogContentText>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Cash Returned</strong> — Employee physically returned the unused cash.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Write Off</strong> — Absorb the shortfall as a company cost (no cash physically returned).
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCloseTarget(null)} disabled={closing}>Cancel</Button>
          <Button color="warning" variant="contained" onClick={() => handleCloseCa('written_off')} disabled={closing}>
            Write Off
          </Button>
          <Button color="success" variant="contained" onClick={() => handleCloseCa('returned')} disabled={closing}>
            Cash Returned
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};

export default ReimbursementDashboard;
