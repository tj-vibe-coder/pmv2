import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Button, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, CircularProgress, Snackbar, Chip, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, TextField, MenuItem,
} from '@mui/material';
import { API_BASE } from '../config/api';

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
  createdAt: number;
  updatedAt: number;
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

type PayDialogContext =
  | { kind: 'single-reimb'; reimb: Reimbursement }
  | { kind: 'batch-reimb'; ids: string[] };

const ReimbursementDashboard: React.FC = () => {
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [cashAdvances, setCashAdvances] = useState<CashAdvanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [payDialog, setPayDialog] = useState<PayDialogContext | null>(null);
  const [payFundingType, setPayFundingType] = useState<'corporate_bank' | 'investor_outofpocket'>('corporate_bank');
  const [payInvestor, setPayInvestor] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

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

  const held = useMemo(
    () => cashAdvances.filter(ca => ca.status === 'approved' && Number(ca.balance_remaining) > 0),
    [cashAdvances]
  );

  const totalOwed = useMemo(
    () => reimbursements.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [reimbursements]
  );
  const totalHeld = useMemo(
    () => held.reduce((s, ca) => s + (Number(ca.balance_remaining) || 0), 0),
    [held]
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
    setPayFundingType('corporate_bank');
    setPayInvestor('');
  };

  const confirmPay = () => {
    if (!payDialog || paySubmitting) return;
    const fundingSource = payFundingType === 'investor_outofpocket' && payInvestor
      ? { type: 'investor_outofpocket' as const, investor: payInvestor }
      : undefined;
    setPaySubmitting(true);
    setError('');
    const request = payDialog.kind === 'batch-reimb'
      ? fetch(`${API}/reimbursements/batch-mark`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ ids: payDialog.ids, ...(fundingSource ? { fundingSource } : {}) }),
        })
      : fetch(`${API}/reimbursements/${payDialog.reimb.id}/pay`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ ...(fundingSource ? { fundingSource } : {}) }),
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
          <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Reimbursement Claims ({reimbursements.length})
            </Typography>
            <Button
              variant="contained"
              size="small"
              disabled={selectedIds.length === 0}
              onClick={() => openPayDialog({ kind: 'batch-reimb', ids: selectedIds })}
              sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
            >
              Pay Selected ({selectedIds.length})
            </Button>
          </Box>
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
                ) : reimbursements.length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>No pending reimbursement claims.</TableCell></TableRow>
                ) : reimbursements.map(r => (
                  <TableRow key={r.id} hover selected={selectedIds.includes(r.id)} sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={selectedIds.includes(r.id)} onChange={() => toggleOne(r.id)} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{r.formNo || '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{r.employeeName || r.full_name || r.username || '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      <Chip
                        size="small"
                        label={r.origin === 'ca_excess' ? 'CA Excess' : 'Out-of-pocket'}
                        color={r.origin === 'ca_excess' ? 'warning' : 'info'}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatDate(r.createdAt)}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }} align="right">{formatPHP(Number(r.amount) || 0)}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => openPayDialog({ kind: 'single-reimb', reimb: r })} sx={{ color: NET_PACIFIC_COLORS.primary }}>
                        Pay
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
          <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Outstanding Cash Advances ({held.length})
            </Typography>
          </Box>
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
                ? `Mark the reimbursement claim for ${payDialog.reimb.employeeName || payDialog.reimb.full_name || payDialog.reimb.username || 'this employee'} (${formatPHP(payDialog.reimb.amount)}) as paid.`
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
            />
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
