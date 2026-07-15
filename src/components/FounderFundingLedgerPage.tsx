import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AccountBalance as AccountBalanceIcon,
  Add as AddIcon,
  Block as BlockIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  ErrorOutline as ErrorOutlineIcon,
  OpenInNew as OpenInNewIcon,
  Payments as PaymentsIcon,
  ReceiptLong as ReceiptLongIcon,
  Savings as SavingsIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Link,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { API_BASE } from '../config/api';
import {
  FounderDepositPayload,
  FounderFundingEntry,
  FounderFundingEntryType,
  FounderFundingFounder,
  FounderFundingLedgerResponse,
  FounderFundingMutationResponse,
  FounderFundingReconciliationResponse,
  FounderFundingSettingsResponse,
  FounderFundingSourceKind,
  FounderFundingStatus,
  FounderFundingSummary,
  FounderSettlementPayload,
  ReconciliationCandidate,
} from '../types/FounderFunding';
import {
  entryTypeLabel,
  formatCentavos,
  parseProofRefs,
  remainingAdvanceCentavos,
  sourceLabel,
} from '../utils/founderFunding';

const API = `${API_BASE}/api`;
const EMPTY_SUMMARY: FounderFundingSummary = {
  advancesOutstandingCentavos: 0,
  capitalContributedCentavos: 0,
  repaidThisPeriodCentavos: 0,
  needsReviewCount: 0,
};

type LedgerTab = 'all' | 'advances' | 'capital' | 'reconciliation';
type SettlementAction = 'repay' | 'capitalize';

interface DepositForm {
  idempotencyKey: string;
  founderId: string;
  entryType: 'founder_advance' | 'capital_contribution';
  amount: string;
  transactionDate: string;
  description: string;
  depositReference: string;
  resolutionReference: string;
  proofRefs: string;
}

interface SettlementForm {
  idempotencyKey: string;
  amount: string;
  transactionDate: string;
  description: string;
  resolutionReference: string;
  proofRefs: string;
}

const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const newIdempotencyKey = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

const newDepositForm = (): DepositForm => ({
  idempotencyKey: newIdempotencyKey(),
  founderId: '',
  entryType: 'founder_advance',
  amount: '',
  transactionDate: today(),
  description: '',
  depositReference: '',
  resolutionReference: '',
  proofRefs: '',
});

const newSettlementForm = (): SettlementForm => ({
  idempotencyKey: newIdempotencyKey(),
  amount: '',
  transactionDate: today(),
  description: '',
  resolutionReference: '',
  proofRefs: '',
});

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function statusColor(status: FounderFundingStatus): 'success' | 'default' {
  return status === 'posted' ? 'success' : 'default';
}

function entryColor(type: FounderFundingEntryType): 'primary' | 'success' | 'warning' | 'info' | 'default' {
  if (type === 'founder_advance') return 'primary';
  if (type === 'capital_contribution' || type === 'capitalization') return 'success';
  if (type === 'repayment') return 'warning';
  if (type === 'opening_balance_adjustment') return 'info';
  return 'default';
}

const FounderFundingLedgerPage: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<FounderFundingEntry[]>([]);
  const [summary, setSummary] = useState<FounderFundingSummary>(EMPTY_SUMMARY);
  const [founders, setFounders] = useState<FounderFundingFounder[]>([]);
  const [candidates, setCandidates] = useState<ReconciliationCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationError, setReconciliationError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<LedgerTab>('all');
  const [founderFilter, setFounderFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | FounderFundingEntryType>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | FounderFundingSourceKind>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | FounderFundingStatus>('posted');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [depositOpen, setDepositOpen] = useState(false);
  const [depositForm, setDepositForm] = useState<DepositForm>(newDepositForm);
  const [settlement, setSettlement] = useState<{ action: SettlementAction; entry: FounderFundingEntry } | null>(null);
  const [settlementForm, setSettlementForm] = useState<SettlementForm>(newSettlementForm);
  const [voidEntry, setVoidEntry] = useState<FounderFundingEntry | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<ReconciliationCandidate | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);

  const authHeaders = useCallback((json = false): HeadersInit => {
    const token = localStorage.getItem('netpacific_token');
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [response, settingsResponse] = await Promise.all([
        fetch(`${API}/founder-funding-ledger`, { headers: authHeaders() }),
        fetch(`${API}/founder-funding-settings`, { headers: authHeaders() }),
      ]);
      const data = await readJson<FounderFundingLedgerResponse>(response);
      const settingsData = await readJson<FounderFundingSettingsResponse>(settingsResponse);
      if (!data.success) throw new Error(data.error || 'Could not load the founder funding ledger.');
      if (!settingsData.success) throw new Error(settingsData.error || 'Could not load founder settings.');
      const nextEntries = Array.isArray(data.entries) ? data.entries : [];
      setEntries(nextEntries);
      setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });

      const entryFounders = nextEntries.reduce<FounderFundingFounder[]>((list, entry) => {
        if (!list.some(founder => founder.id === entry.founderId)) {
          list.push({ id: entry.founderId, name: entry.founderName });
        }
        return list;
      }, []);
      const configuredFounders = (settingsData.settings?.founders || []).map(founder => ({
        id: founder.id,
        name: founder.fullName || founder.username || founder.id,
      }));
      setFounders(configuredFounders.length ? configuredFounders : data.founders?.length ? data.founders : entryFounders);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the founder funding ledger.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadReconciliation = useCallback(async () => {
    setReconciliationLoading(true);
    setReconciliationError('');
    try {
      const response = await fetch(`${API}/founder-funding-ledger/reconciliation`, { headers: authHeaders() });
      const data = await readJson<FounderFundingReconciliationResponse>(response);
      if (!data.success) throw new Error(data.error || 'Could not load reconciliation candidates.');
      setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
    } catch (caught) {
      setReconciliationError(caught instanceof Error ? caught.message : 'Could not load reconciliation candidates.');
    } finally {
      setReconciliationLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { loadLedger(); }, [loadLedger]);
  useEffect(() => {
    if (tab === 'reconciliation' && candidates.length === 0) loadReconciliation();
  }, [tab, candidates.length, loadReconciliation]);

  const remainingByEntry = useMemo(() => {
    const settlements = entries.filter(entry => entry.status === 'posted' && entry.settlesEntryId);
    return new Map(entries.map(entry => {
      const used = settlements
        .filter(item => item.settlesEntryId === entry.id)
        .map(item => item.amountCentavos);
      return [entry.id, entry.remainingCentavos ?? remainingAdvanceCentavos(entry.amountCentavos, used)];
    }));
  }, [entries]);

  const filteredEntries = useMemo(() => entries.filter(entry => {
    if (tab === 'advances' && !['founder_advance', 'opening_balance_adjustment', 'repayment'].includes(entry.entryType)) return false;
    if (tab === 'capital' && entry.entryType !== 'capital_contribution' && entry.entryType !== 'capitalization') return false;
    if (founderFilter !== 'all' && entry.founderId !== founderFilter) return false;
    if (typeFilter !== 'all' && entry.entryType !== typeFilter) return false;
    if (sourceFilter !== 'all' && entry.source?.kind !== sourceFilter) return false;
    if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
    if (dateFrom && entry.transactionDate < dateFrom) return false;
    if (dateTo && entry.transactionDate > dateTo) return false;
    return true;
  }), [dateFrom, dateTo, entries, founderFilter, sourceFilter, statusFilter, tab, typeFilter]);

  const openDeposit = () => {
    setDepositForm({ ...newDepositForm(), founderId: founders.length === 1 ? founders[0].id : '' });
    setDialogError('');
    setDepositOpen(true);
  };

  const configureInitialFounders = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/founder-funding-settings`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({ founderUserIds: ['user_6', 'user_14'] }),
      });
      const data = await readJson<FounderFundingSettingsResponse>(response);
      if (!data.success) throw new Error(data.error || 'Could not configure founders.');
      setNotice('TJC and RJR are now configured as recognized founders.');
      await loadLedger();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not configure founders.');
    } finally {
      setSaving(false);
    }
  };

  const openSettlement = (action: SettlementAction, entry: FounderFundingEntry) => {
    setSettlement({ action, entry });
    setSettlementForm(newSettlementForm());
    setDialogError('');
  };

  const postMutation = async (url: string, body: unknown): Promise<FounderFundingMutationResponse> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(body),
    });
    const data = await readJson<FounderFundingMutationResponse>(response);
    if (!data.success) throw new Error(data.error || 'The transaction could not be saved.');
    return data;
  };

  const saveDeposit = async () => {
    if (!depositForm.founderId || !depositForm.amount || !depositForm.transactionDate || !depositForm.description.trim() || !depositForm.depositReference.trim()) {
      setDialogError('Founder, date, amount, description, and deposit reference are required.');
      return;
    }
    if (depositForm.entryType === 'capital_contribution' && !depositForm.resolutionReference.trim()) {
      setDialogError('Capital contributions require a resolution or approval reference.');
      return;
    }
    setSaving(true);
    setDialogError('');
    try {
      const payload: FounderDepositPayload = {
        idempotencyKey: depositForm.idempotencyKey,
        founderId: depositForm.founderId,
        entryType: depositForm.entryType,
        amount: depositForm.amount,
        transactionDate: depositForm.transactionDate,
        description: depositForm.description.trim(),
        depositReference: depositForm.depositReference.trim(),
        resolutionReference: depositForm.resolutionReference.trim() || undefined,
        proofRefs: parseProofRefs(depositForm.proofRefs),
      };
      await postMutation(`${API}/founder-funding-ledger/deposits`, payload);
      setDepositOpen(false);
      setNotice('Founder deposit recorded.');
      await loadLedger();
    } catch (caught) {
      setDialogError(caught instanceof Error ? caught.message : 'The deposit could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveSettlement = async () => {
    if (!settlement) return;
    if (!settlementForm.amount || !settlementForm.transactionDate) {
      setDialogError('Date and amount are required.');
      return;
    }
    if (settlement.action === 'capitalize' && !settlementForm.resolutionReference.trim()) {
      setDialogError('Capitalization requires a resolution or approval reference.');
      return;
    }
    setSaving(true);
    setDialogError('');
    try {
      const payload: FounderSettlementPayload = {
        idempotencyKey: settlementForm.idempotencyKey,
        amount: settlementForm.amount,
        transactionDate: settlementForm.transactionDate,
        description: settlementForm.description.trim() || undefined,
        resolutionReference: settlementForm.resolutionReference.trim() || undefined,
        proofRefs: parseProofRefs(settlementForm.proofRefs),
      };
      await postMutation(`${API}/founder-funding-ledger/${settlement.entry.id}/${settlement.action}`, payload);
      setSettlement(null);
      setNotice(settlement.action === 'repay' ? 'Repayment recorded.' : 'Advance converted to capital.');
      await loadLedger();
    } catch (caught) {
      setDialogError(caught instanceof Error ? caught.message : 'The settlement could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveVoid = async () => {
    if (!voidEntry || !voidReason.trim()) {
      setDialogError('A void reason is required for the audit trail.');
      return;
    }
    setSaving(true);
    setDialogError('');
    try {
      await postMutation(`${API}/founder-funding-ledger/${voidEntry.id}/void`, { reason: voidReason.trim() });
      setVoidEntry(null);
      setNotice('Ledger entry voided. The original record remains in the audit history.');
      await loadLedger();
    } catch (caught) {
      setDialogError(caught instanceof Error ? caught.message : 'The entry could not be voided.');
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setFounderFilter('all');
    setTypeFilter('all');
    setSourceFilter('all');
    setStatusFilter('posted');
    setDateFrom('');
    setDateTo('');
  };

  const kpis = [
    { label: 'Founder advances outstanding', value: summary.advancesOutstandingCentavos, icon: <AccountBalanceIcon />, tone: '#2c5aa0' },
    { label: 'Capital contributions', value: summary.capitalContributedCentavos, icon: <SavingsIcon />, tone: '#167c5a' },
    { label: 'Repaid this period', value: summary.repaidThisPeriodCentavos, icon: <PaymentsIcon />, tone: '#a35b13' },
  ];

  return (
    <Box sx={{ pb: 4 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
            Founder Funding Ledger
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
            Track founder advances, repayments, and permanent capital separately from company expenses.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openDeposit} disabled={loading || founders.length === 0} sx={{ minHeight: 42, whiteSpace: 'nowrap' }}>
          Record founder deposit
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={loadLedger}>Retry</Button>} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
      {!loading && founders.length === 0 && !error && (
        <Alert severity="warning" action={<Button color="inherit" size="small" disabled={saving} onClick={configureInitialFounders}>Configure TJC &amp; RJR</Button>} sx={{ mb: 2 }}>
          No recognized founders were returned by the ledger. Configure founder access before recording a deposit.
        </Alert>
      )}

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {kpis.map(kpi => (
          <Grid key={kpi.label} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%', borderTop: `3px solid ${kpi.tone}` }}>
              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</Typography>
                  {loading ? <Skeleton width={150} height={40} /> : <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 750 }}>{formatCentavos(kpi.value)}</Typography>}
                </Box>
                <Box sx={{ color: kpi.tone, opacity: 0.9 }}>{kpi.icon}</Box>
              </Stack>
            </Paper>
          </Grid>
        ))}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%', borderTop: '3px solid #b54747' }}>
            <Stack direction="row" justifyContent="space-between">
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Needs review</Typography>
                {loading ? <Skeleton width={50} height={40} /> : <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 750 }}>{summary.needsReviewCount}</Typography>}
              </Box>
              <ErrorOutlineIcon sx={{ color: '#b54747' }} />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_, value: LedgerTab) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="all" label="All activity" />
          <Tab value="advances" label="Founder advances" />
          <Tab value="capital" label="Capital contributions" />
          <Tab value="reconciliation" label={`Reconciliation${summary.needsReviewCount ? ` (${summary.needsReviewCount})` : ''}`} />
        </Tabs>

        {tab !== 'reconciliation' ? (
          <>
            <Box sx={{ p: 2, bgcolor: '#fafbfd' }}>
              <Grid container spacing={1.25} alignItems="center">
                <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                  <TextField select fullWidth size="small" label="Founder" value={founderFilter} onChange={event => setFounderFilter(event.target.value)}>
                    <MenuItem value="all">All founders</MenuItem>
                    {founders.map(founder => <MenuItem key={founder.id} value={founder.id}>{founder.name}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                  <TextField select fullWidth size="small" label="Entry type" value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)}>
                    <MenuItem value="all">All types</MenuItem>
                    {(['founder_advance', 'capital_contribution', 'repayment', 'capitalization', 'opening_balance_adjustment'] as FounderFundingEntryType[]).map(type => (
                      <MenuItem key={type} value={type}>{entryTypeLabel(type)}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                  <TextField select fullWidth size="small" label="Source" value={sourceFilter} onChange={event => setSourceFilter(event.target.value as typeof sourceFilter)}>
                    <MenuItem value="all">All sources</MenuItem>
                    <MenuItem value="liquidation">Liquidation</MenuItem>
                    <MenuItem value="cash_deposit">Cash deposit</MenuItem>
                    <MenuItem value="legacy_reconciliation">Legacy reconciliation</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                  <TextField select fullWidth size="small" label="Status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}>
                    <MenuItem value="all">All statuses</MenuItem>
                    <MenuItem value="posted">Posted</MenuItem>
                    <MenuItem value="voided">Voided</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 1.5 }}><TextField fullWidth size="small" type="date" label="From" value={dateFrom} onChange={event => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                <Grid size={{ xs: 6, sm: 4, md: 1.5 }}><TextField fullWidth size="small" type="date" label="To" value={dateTo} onChange={event => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                <Grid size={{ xs: 12, sm: 4, md: 1 }}><Button fullWidth size="small" onClick={clearFilters}>Clear</Button></Grid>
              </Grid>
            </Box>
            <TableContainer sx={{ maxHeight: 'calc(100vh - 420px)', minHeight: 260 }}>
              <Table stickyHeader size="small" aria-label="Founder funding ledger">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell><TableCell>Founder</TableCell><TableCell>Type</TableCell><TableCell>Description / source</TableCell><TableCell>Status</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">Remaining</TableCell><TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>{Array.from({ length: 8 }).map((__, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}</TableRow>
                  ))}
                  {!loading && filteredEntries.map(entry => {
                    const remaining = remainingByEntry.get(entry.id) ?? 0;
                    const isAdvance = entry.entryType === 'founder_advance' || entry.entryType === 'opening_balance_adjustment';
                    const canSettle = entry.status === 'posted' && isAdvance && remaining > 0;
                    return (
                      <TableRow key={entry.id} hover sx={{ opacity: entry.status === 'voided' ? 0.62 : 1 }}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry.transactionDate}</TableCell>
                        <TableCell><Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.founderName}</Typography></TableCell>
                        <TableCell><Chip size="small" variant="outlined" color={entryColor(entry.entryType)} label={entryTypeLabel(entry.entryType)} /></TableCell>
                        <TableCell sx={{ minWidth: 230 }}>
                          <Typography variant="body2" sx={{ fontWeight: 550 }}>{entry.description || '—'}</Typography>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Typography variant="caption" color="text.secondary">{sourceLabel(entry.source)}</Typography>
                            {entry.source.kind === 'liquidation' && entry.source.liquidationId && (
                              <Tooltip title="Open liquidation"><IconButton size="small" onClick={() => navigate(`/finance/expense-monitoring/liquidation-form?liquidation_id=${encodeURIComponent(entry.source.liquidationId || '')}`)} aria-label={`Open ${entry.source.liquidationFormNo || 'linked liquidation'} for ${entry.founderName}`}><OpenInNewIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                            )}
                          </Stack>
                          {entry.proofRefs?.length > 0 && (
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              {entry.proofRefs.map((proof, proofIndex) => /^https?:\/\//i.test(proof)
                                ? <Link key={proof} href={proof} target="_blank" rel="noopener noreferrer" variant="caption">Proof {proofIndex + 1}</Link>
                                : <Typography key={`${proof}-${proofIndex}`} variant="caption" color="text.secondary">Proof: {proof}</Typography>)}
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell><Chip size="small" color={statusColor(entry.status)} label={entry.status === 'posted' ? 'Posted' : 'Voided'} /></TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{formatCentavos(entry.amountCentavos)}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{isAdvance ? formatCentavos(remaining) : '—'}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {canSettle && <><Tooltip title="Record repayment"><IconButton size="small" color="warning" onClick={() => openSettlement('repay', entry)} aria-label={`Record repayment for ${entry.founderName}, ${entry.description}`}><PaymentsIcon fontSize="small" /></IconButton></Tooltip><Tooltip title="Convert to capital"><IconButton size="small" color="success" onClick={() => openSettlement('capitalize', entry)} aria-label={`Convert ${entry.founderName} advance to capital, ${entry.description}`}><TrendingUpIcon fontSize="small" /></IconButton></Tooltip></>}
                          {entry.status === 'posted' && <Tooltip title="Void entry"><IconButton size="small" color="error" onClick={() => { setVoidEntry(entry); setVoidReason(''); setDialogError(''); }} aria-label={`Void ${entry.founderName} entry, ${entry.description}`}><BlockIcon fontSize="small" /></IconButton></Tooltip>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!loading && filteredEntries.length === 0 && (
                    <TableRow><TableCell colSpan={8} align="center" sx={{ py: 8 }}><ReceiptLongIcon color="disabled" sx={{ fontSize: 38, mb: 1 }} /><Typography color="text.secondary">No ledger activity matches these filters.</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}><Typography variant="caption" color="text.secondary">{filteredEntries.length} of {entries.length} entries shown · Amounts are stored in exact centavos.</Typography></Box>
          </>
        ) : (
          <Box sx={{ p: 2 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Historical records are review-only. No expense, liquidation, or legacy investment changes until a superadmin applies an explicitly approved reconciliation action.
            </Alert>
            {reconciliationError && (
              <Alert severity="error" action={<Button color="inherit" size="small" onClick={loadReconciliation}>Retry</Button>} sx={{ mb: 2 }}>
                {reconciliationError}
              </Alert>
            )}
            {reconciliationLoading ? <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress size={30} /><Typography color="text.secondary" sx={{ mt: 1.5 }}>Checking legacy records…</Typography></Stack> : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small" aria-label="Legacy reconciliation candidates">
                  <TableHead><TableRow><TableCell>Source</TableCell><TableCell>Founder / description</TableCell><TableCell align="right">Review amount</TableCell><TableCell align="right">Difference</TableCell><TableCell>Evidence</TableCell><TableCell align="right">Review</TableCell></TableRow></TableHead>
                  <TableBody>
                    {candidates.map(candidate => (
                      <TableRow key={candidate.id} hover>
                        <TableCell><Typography variant="body2" sx={{ fontWeight: 650 }}>{candidate.sourceLabel}</Typography><Typography variant="caption" color="text.secondary">{candidate.transactionDate || '—'}</Typography></TableCell>
                        <TableCell><Typography variant="body2">{candidate.founderName || 'Founder unconfirmed'}</Typography><Typography variant="caption" color="text.secondary">{candidate.description}</Typography></TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCentavos(candidate.reviewAmountCentavos)}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{candidate.amountDifferenceCentavos == null ? '—' : formatCentavos(candidate.amountDifferenceCentavos)}</TableCell>
                        <TableCell><Chip size="small" variant="outlined" label={`${candidate.manualExpenseIds.length} expense · ${candidate.legacyInvestmentIds.length} legacy`} /></TableCell>
                        <TableCell align="right"><Button size="small" onClick={() => setSelectedCandidate(candidate)}>Review candidate</Button></TableCell>
                      </TableRow>
                    ))}
                    {candidates.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 7 }}><CheckCircleOutlineIcon color="success" sx={{ fontSize: 38, mb: 1 }} /><Typography color="text.secondary">No reconciliation candidates need review.</Typography></TableCell></TableRow>}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Paper>

      <Dialog open={depositOpen} onClose={() => !saving && setDepositOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Record founder deposit</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Use this when a founder transfers cash to IOCT. This does not create a company expense.</Typography>
          {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
          <Stack spacing={2}>
            <TextField select fullWidth required value={depositForm.founderId} onChange={event => setDepositForm(form => ({ ...form, founderId: event.target.value }))} label="Founder">{founders.map(founder => <MenuItem key={founder.id} value={founder.id}>{founder.name}</MenuItem>)}</TextField>
            <TextField select fullWidth label="Treatment" value={depositForm.entryType} onChange={event => setDepositForm(form => ({ ...form, entryType: event.target.value as DepositForm['entryType'] }))}><MenuItem value="founder_advance">Founder advance — IOCT owes the founder</MenuItem><MenuItem value="capital_contribution">Capital contribution — permanent funding</MenuItem></TextField>
            <Grid container spacing={1.5}><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required type="date" label="Transaction date" InputLabelProps={{ shrink: true }} value={depositForm.transactionDate} onChange={event => setDepositForm(form => ({ ...form, transactionDate: event.target.value }))} /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required label="Amount" inputMode="decimal" value={depositForm.amount} onChange={event => setDepositForm(form => ({ ...form, amount: event.target.value }))} slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }} /></Grid></Grid>
            <TextField fullWidth required label="Description" value={depositForm.description} onChange={event => setDepositForm(form => ({ ...form, description: event.target.value }))} />
            <TextField fullWidth required label="Bank / deposit reference" value={depositForm.depositReference} onChange={event => setDepositForm(form => ({ ...form, depositReference: event.target.value }))} />
            {depositForm.entryType === 'capital_contribution' && <TextField fullWidth required label="Resolution or approval reference" value={depositForm.resolutionReference} onChange={event => setDepositForm(form => ({ ...form, resolutionReference: event.target.value }))} helperText="Required evidence for permanent capital treatment." />}
            <TextField fullWidth multiline minRows={2} label="Proof references" value={depositForm.proofRefs} onChange={event => setDepositForm(form => ({ ...form, proofRefs: event.target.value }))} helperText="Paste document links or references, separated by commas or new lines." />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setDepositOpen(false)} disabled={saving}>Cancel</Button><Button variant="contained" onClick={saveDeposit} disabled={saving}>{saving ? 'Saving…' : 'Record deposit'}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(settlement)} onClose={() => !saving && setSettlement(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{settlement?.action === 'repay' ? 'Record founder repayment' : 'Convert advance to capital'}</DialogTitle>
        <DialogContent>
          {settlement && <Alert severity="info" sx={{ mb: 2 }}>Outstanding balance: <strong>{formatCentavos(remainingByEntry.get(settlement.entry.id) ?? 0)}</strong></Alert>}
          {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
          <Stack spacing={2}>
            <Grid container spacing={1.5}><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required type="date" label="Transaction date" InputLabelProps={{ shrink: true }} value={settlementForm.transactionDate} onChange={event => setSettlementForm(form => ({ ...form, transactionDate: event.target.value }))} /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required label="Amount" inputMode="decimal" value={settlementForm.amount} onChange={event => setSettlementForm(form => ({ ...form, amount: event.target.value }))} slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }} /></Grid></Grid>
            <TextField fullWidth label="Description" value={settlementForm.description} onChange={event => setSettlementForm(form => ({ ...form, description: event.target.value }))} />
            {settlement?.action === 'capitalize' && <TextField fullWidth required label="Resolution or approval reference" value={settlementForm.resolutionReference} onChange={event => setSettlementForm(form => ({ ...form, resolutionReference: event.target.value }))} helperText="The acting founder may approve their own capitalization; the reference remains part of the audit trail." />}
            <TextField fullWidth multiline minRows={2} label="Proof references" value={settlementForm.proofRefs} onChange={event => setSettlementForm(form => ({ ...form, proofRefs: event.target.value }))} helperText="Optional links or document references." />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setSettlement(null)} disabled={saving}>Cancel</Button><Button variant="contained" color={settlement?.action === 'repay' ? 'warning' : 'success'} onClick={saveSettlement} disabled={saving}>{saving ? 'Saving…' : settlement?.action === 'repay' ? 'Record repayment' : 'Convert to capital'}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(voidEntry)} onClose={() => !saving && setVoidEntry(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Void ledger entry?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>Voiding preserves the original record. Posted settlements may prevent this action.</Alert>
          {voidEntry && (
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
              <Typography sx={{ fontWeight: 700 }}>{voidEntry.founderName} · {formatCentavos(voidEntry.amountCentavos)}</Typography>
              <Typography variant="body2">{entryTypeLabel(voidEntry.entryType)} · {voidEntry.transactionDate}</Typography>
              <Typography variant="caption" color="text.secondary">{voidEntry.description}</Typography>
            </Paper>
          )}
          {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
          <TextField fullWidth required multiline minRows={3} label="Reason" value={voidReason} onChange={event => setVoidReason(event.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setVoidEntry(null)} disabled={saving}>Cancel</Button><Button variant="contained" color="error" onClick={saveVoid} disabled={saving}>{saving ? 'Voiding…' : 'Void entry'}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(selectedCandidate)} onClose={() => setSelectedCandidate(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Review reconciliation candidate</DialogTitle>
        <DialogContent>
          {selectedCandidate && <Stack spacing={2}>
            <Alert severity="warning">Review only. This screen does not change historical records.</Alert>
            <Box><Typography variant="overline" color="text.secondary">Matched source</Typography><Typography sx={{ fontWeight: 700 }}>{selectedCandidate.sourceLabel}</Typography><Typography variant="body2" color="text.secondary">{selectedCandidate.description}</Typography></Box>
            <Divider />
            <Grid container spacing={2}><Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Liquidation amount</Typography><Typography sx={{ fontWeight: 650 }}>{selectedCandidate.liquidationAmountCentavos == null ? '—' : formatCentavos(selectedCandidate.liquidationAmountCentavos)}</Typography></Grid><Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Legacy amount</Typography><Typography sx={{ fontWeight: 650 }}>{selectedCandidate.legacyAmountCentavos == null ? '—' : formatCentavos(selectedCandidate.legacyAmountCentavos)}</Typography></Grid></Grid>
            <Box><Typography variant="caption" color="text.secondary">Proposed action</Typography><Typography variant="body2">{selectedCandidate.proposedAction || 'Keep the liquidation expense as canonical and review linked legacy records.'}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">Evidence IDs</Typography><Typography variant="body2">Manual expenses: {selectedCandidate.manualExpenseIds.join(', ') || '—'}</Typography><Typography variant="body2">Legacy investments: {selectedCandidate.legacyInvestmentIds.join(', ') || '—'}</Typography></Box>
          </Stack>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setSelectedCandidate(null)}>Close review</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default FounderFundingLedgerPage;
