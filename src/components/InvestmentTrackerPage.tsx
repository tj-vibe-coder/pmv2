import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Alert, Chip, CircularProgress,
  Card, CardContent,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = '/api';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
  accent1: '#4f7bc8',
  success: '#00b894',
  warning: '#fdcb6e',
  info: '#74b9ff',
};

const INVESTORS = [
  'TJ Caballero',
  'RJ Rivera',
  'Renzel Punongbayan',
  'Nylle Harold Managa',
];

const INVESTOR_TARGET_PCT: Record<string, number> = {
  'TJ Caballero':        35,
  'RJ Rivera':           30,
  'Renzel Punongbayan':  20,
  'Nylle Harold Managa': 15,
};

const CATEGORIES = [
  'Capital Contribution',
  'Project Expense',
  'Startup Expense',
  'Overhead',
  'Liquidation',
  'Flight',
];

const CATEGORY_COLORS: Record<string, string> = {
  'Capital Contribution': '#2e7d32',
  'Project Expense':      '#1565c0',
  'Startup Expense':      '#6a1b9a',
  'Overhead':             '#e65100',
  'Liquidation':          '#37474f',
  'Flight':               '#00695c',
};

interface Investment {
  id: string;
  date: string;
  investor: string;
  amount: number;
  category: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

interface FormData {
  date: string;
  investor: string;
  amount: string;
  category: string;
  description: string;
}

const emptyForm: FormData = { date: '', investor: '', amount: '', category: '', description: '' };

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const InvestmentTrackerPage: React.FC = () => {
  const { user } = useAuth();
  const token = localStorage.getItem('netpacific_token') || '';

  const [investments, setInvestments] = useState<Investment[]>([]);
  const [target, setTarget] = useState<number>(650000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Investment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [targetSaving, setTargetSaving] = useState(false);

  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, tgtRes] = await Promise.all([
        fetch(`${API_BASE}/investments`, { headers: authHeaders }),
        fetch(`${API_BASE}/investments/target`, { headers: authHeaders }),
      ]);
      const invData = await invRes.json();
      const tgtData = await tgtRes.json();
      if (invRes.status === 401) {
        setError('Session expired. Please log in again.');
        return;
      }
      if (invData.success) setInvestments(invData.investments || []);
      else if (invData.error) setError(invData.error);
      if (tgtData.success) setTarget(tgtData.target);
      else if (tgtData.error) setError(prev => prev || tgtData.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load investment data');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── Computed rows ────────────────────────────────────────────────────────────
  const rows = investments.map((inv, idx) => {
    const runningTotal = investments.slice(0, idx + 1).reduce((s, i) => s + i.amount, 0);
    return { ...inv, runningTotal, balanceVsTarget: target - runningTotal };
  });

  const totalInvested = investments.reduce((s, i) => s + i.amount, 0);
  const balance = target - totalInvested;

  const breakdown = INVESTORS.map(investor => {
    const total = investments.filter(i => i.investor === investor).reduce((s, i) => s + i.amount, 0);
    const actualPct = totalInvested > 0 ? (total / totalInvested) * 100 : 0;
    const targetPct = INVESTOR_TARGET_PCT[investor] || 0;
    const targetAmount = target * (targetPct / 100);
    const variance = total - targetAmount;
    return { investor, total, actualPct, targetPct, targetAmount, variance };
  });

  // ── Dialog handlers ──────────────────────────────────────────────────────────
  const openAdd = () => { setEditing(null); setForm(emptyForm); setFormError(null); setDialogOpen(true); };
  const openEdit = (inv: Investment) => {
    setEditing(inv);
    setForm({ date: inv.date, investor: inv.investor, amount: String(inv.amount), category: inv.category, description: inv.description });
    setFormError(null);
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const saveEntry = async () => {
    if (!form.date || !form.investor || !form.amount || !form.category) { setFormError('Please fill in all required fields.'); return; }
    if (isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0) { setFormError('Amount must be a positive number.'); return; }
    setSaving(true); setFormError(null);
    try {
      const url = editing ? `${API_BASE}/investments/${editing.id}` : `${API_BASE}/investments`;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(form) });
      const data = await res.json();
      if (!data.success) { setFormError(data.error || 'Failed to save'); return; }
      closeDialog();
      await load();
    } catch { setFormError('Failed to save entry'); }
    finally { setSaving(false); }
  };

  const openDelete = (inv: Investment) => { setToDelete(inv); setDeleteDialogOpen(true); };
  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await fetch(`${API_BASE}/investments/${toDelete.id}`, { method: 'DELETE', headers: authHeaders });
      setDeleteDialogOpen(false); setToDelete(null);
      await load();
    } catch { }
    finally { setDeleting(false); }
  };

  const openTargetDialog = () => { setTargetInput(String(target)); setTargetDialogOpen(true); };
  const saveTarget = async () => {
    if (!targetInput || isNaN(parseFloat(targetInput))) return;
    setTargetSaving(true);
    try {
      await fetch(`${API_BASE}/investments/target`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ target: parseFloat(targetInput) }) });
      setTargetDialogOpen(false);
      await load();
    } catch { }
    finally { setTargetSaving(false); }
  };

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>

      {/* Title */}
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Investment Tracker
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      {/* KPI Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Target Capitalization</Typography>
                {user?.role === 'superadmin' && (
                  <IconButton size="small" onClick={openTargetDialog} sx={{ color: 'white', mt: -0.5, mr: -0.5, opacity: 0.8, '&:hover': { opacity: 1 } }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatPHP(target)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Invested to Date</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatPHP(totalInvested)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                {totalInvested > 0 ? ((totalInvested / target) * 100).toFixed(1) : '0'}% of target
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card sx={{
            background: balance < 0
              ? `linear-gradient(135deg, #e53935 0%, #ef9a9a 100%)`
              : `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`,
            color: 'white',
          }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Balance vs. Target</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatPHP(balance)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                {balance < 0 ? 'Over target' : 'Remaining to invest'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Ledger Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, mb: 2 }}>
        <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
            Investment Ledger ({investments.length})
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={openAdd}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add Entry
          </Button>
        </Box>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 480px)', minHeight: 200 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {['Date', 'Investor / Source', 'Amount (₱)', 'Category', 'Description', 'Running Total (₱)', 'Balance vs. Target (₱)', 'Actions'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary', fontSize: '0.875rem' }}>
                    No entries yet. Click "Add Entry" to get started.
                  </TableCell>
                </TableRow>
              )}
              {rows.map(row => (
                <TableRow key={row.id} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                  <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {row.date ? new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{row.investor}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', color: NET_PACIFIC_COLORS.primary, fontWeight: 500 }}>
                    {row.amount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.category}
                      size="small"
                      sx={{ backgroundColor: CATEGORY_COLORS[row.category] || '#607d8b', color: 'white', fontSize: '0.7rem', height: 20 }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'text.secondary' }}>{row.description}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{row.runningTotal.toLocaleString()}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', color: row.balanceVsTarget < 0 ? 'error.main' : 'text.primary' }}>
                    {row.balanceVsTarget.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => openEdit(row)} sx={{ mr: 0.5 }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => openDelete(row)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length > 0 && (
                <TableRow sx={{ backgroundColor: NET_PACIFIC_COLORS.primary }}>
                  <TableCell colSpan={2} sx={{ color: 'white', fontWeight: 700, fontSize: '0.8rem' }}>TOTAL INVESTED TO DATE</TableCell>
                  <TableCell align="right" sx={{ color: 'white', fontWeight: 700, fontSize: '0.8rem' }}>{totalInvested.toLocaleString()}</TableCell>
                  <TableCell colSpan={5} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Contribution Breakdown */}
      <Paper sx={{
        borderRadius: 2,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e2e8f0',
      }}>
        <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
            Contribution Breakdown by Founder
          </Typography>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Founder', 'Target %', 'Target Amount', 'Actual Invested', 'Actual %', 'Variance'].map((h, i) => (
                <TableCell key={h} align={i > 0 ? 'right' : 'left'} sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {breakdown.map(b => (
              <TableRow key={b.investor} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{b.investor}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{b.targetPct}%</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{formatPHP(b.targetAmount)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', color: NET_PACIFIC_COLORS.primary, fontWeight: 600 }}>{formatPHP(b.total)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{b.actualPct.toFixed(1)}%</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600, color: b.variance >= 0 ? 'success.main' : 'error.main' }}>
                  {b.variance >= 0 ? '+' : ''}{formatPHP(b.variance)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ backgroundColor: 'rgba(44, 90, 160, 0.06)' }}>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem' }}>TOTAL</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>100%</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>{formatPHP(target)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem', color: NET_PACIFIC_COLORS.primary }}>{formatPHP(totalInvested)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>100%</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem', color: balance <= 0 ? 'success.main' : 'error.main' }}>
                {balance <= 0 ? '+' : ''}{formatPHP(-balance)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Paper>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>{editing ? 'Edit Entry' : 'Add Investment Entry'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Date *" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select label="Investor / Source *" fullWidth size="small" value={form.investor} onChange={e => setForm(f => ({ ...f, investor: e.target.value }))}>
                {INVESTORS.map(inv => <MenuItem key={inv} value={inv}>{inv}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Amount (₱) *" type="number" fullWidth size="small" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} inputProps={{ min: 0 }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select label="Category *" fullWidth size="small" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(cat => <MenuItem key={cat} value={cat}>{cat}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField label="Description" fullWidth size="small" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. TANN PH Server, SEC Filing Fees, etc." />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveEntry}
            disabled={saving}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Entry'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Delete Entry?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete the entry for <strong>{toDelete?.investor}</strong> — {toDelete?.description || toDelete?.category} ({toDelete ? formatPHP(toDelete.amount) : ''})?
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Target Dialog (superadmin only) */}
      <Dialog open={targetDialogOpen} onClose={() => setTargetDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Set Target Capitalization</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            label="Target Amount (₱)"
            type="number"
            fullWidth
            size="small"
            value={targetInput}
            onChange={e => setTargetInput(e.target.value)}
            sx={{ mt: 1 }}
            inputProps={{ min: 0 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTargetDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveTarget}
            disabled={targetSaving}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {targetSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default InvestmentTrackerPage;
