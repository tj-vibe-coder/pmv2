import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Alert, Chip,
  CircularProgress,
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = '/api';

const INVESTORS = [
  'TJ Caballero',
  'RJ Rivera',
  'Renzel Punongbayan',
  'Nylle Harold Managa',
];

const INVESTOR_TARGET_PCT: Record<string, number> = {
  'TJ Caballero':       35,
  'RJ Rivera':          30,
  'Renzel Punongbayan': 20,
  'Nylle Harold Managa':15,
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
      if (invData.success) setInvestments(invData.investments || []);
      if (tgtData.success) setTarget(tgtData.target);
    } catch (e) {
      setError('Failed to load investment data');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── Computed rows with running total ───────────────────────────────────────
  const rows = investments.map((inv, idx) => {
    const runningTotal = investments.slice(0, idx + 1).reduce((s, i) => s + i.amount, 0);
    return { ...inv, runningTotal, balanceVsTarget: target - runningTotal };
  });

  const totalInvested = investments.reduce((s, i) => s + i.amount, 0);
  const balance = target - totalInvested;

  // Breakdown by investor
  const breakdown = INVESTORS.map(investor => {
    const total = investments.filter(i => i.investor === investor).reduce((s, i) => s + i.amount, 0);
    const actualPct = totalInvested > 0 ? (total / totalInvested) * 100 : 0;
    const targetPct = INVESTOR_TARGET_PCT[investor] || 0;
    const targetAmount = target * (targetPct / 100);
    const variance = total - targetAmount;
    return { investor, total, actualPct, targetPct, targetAmount, variance };
  });

  // ── Dialog handlers ────────────────────────────────────────────────────────
  const openAdd = () => { setEditing(null); setForm(emptyForm); setFormError(null); setDialogOpen(true); };
  const openEdit = (inv: Investment) => { setEditing(inv); setForm({ date: inv.date, investor: inv.investor, amount: String(inv.amount), category: inv.category, description: inv.description }); setFormError(null); setDialogOpen(true); };
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

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 2, maxWidth: 1400, mx: 'auto' }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} color="primary">
            IO Control Technologie OPC – Investment Tracker
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Tracks all founder capital contributions and startup disbursements · Currency: PHP
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} sx={{ minWidth: 160 }}>
          Add Entry
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #e0e0e0' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
                Target Capitalization
              </Typography>
              {user?.role === 'superadmin' && (
                <IconButton size="small" onClick={openTargetDialog} sx={{ ml: 1 }}>
                  <EditIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
            <Typography variant="h5" fontWeight={700} color="primary" mt={0.5}>{formatPHP(target)}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #e0e0e0' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
              Total Invested to Date
            </Typography>
            <Typography variant="h5" fontWeight={700} color="success.main" mt={0.5}>{formatPHP(totalInvested)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {totalInvested > 0 ? ((totalInvested / target) * 100).toFixed(1) : '0'}% of target
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #e0e0e0' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
              Balance vs. Target
            </Typography>
            <Typography variant="h5" fontWeight={700} color={balance < 0 ? 'error.main' : 'text.primary'} mt={0.5}>
              {formatPHP(balance)}
            </Typography>
            <Typography variant="caption" color={balance < 0 ? 'error.main' : 'success.main'}>
              {balance < 0 ? 'Over target' : 'Remaining'}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Main Table */}
      <Paper sx={{ borderRadius: 2, border: '1px solid #e0e0e0', mb: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#1a3f72' }}>
                {['Date', 'Investor / Source', 'Amount (₱)', 'Category', 'Description', 'Running Total (₱)', 'Balance vs. Target (₱)', 'Actions'].map(h => (
                  <TableCell key={h} sx={{ color: 'white', fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No entries yet. Click "Add Entry" to get started.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row, idx) => (
                <TableRow key={row.id} sx={{ '&:hover': { backgroundColor: '#f5f7ff' }, backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                  <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {row.date ? new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{row.investor}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: '#1565c0', fontWeight: 500, textAlign: 'right' }}>
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
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600, textAlign: 'right' }}>{row.runningTotal.toLocaleString()}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', textAlign: 'right', color: row.balanceVsTarget < 0 ? 'error.main' : 'text.primary' }}>
                    {row.balanceVsTarget.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => openEdit(row)} sx={{ mr: 0.5 }}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => openDelete(row)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length > 0 && (
                <TableRow sx={{ backgroundColor: '#1a3f72' }}>
                  <TableCell colSpan={2} sx={{ color: 'white', fontWeight: 700 }}>TOTAL INVESTED TO DATE</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 700, textAlign: 'right' }}>{totalInvested.toLocaleString()}</TableCell>
                  <TableCell colSpan={5} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Contribution Breakdown */}
      <Paper sx={{ borderRadius: 2, border: '1px solid #e0e0e0', p: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, color: 'white', backgroundColor: '#1a3f72', mx: -2.5, mt: -2.5, px: 2.5, py: 1.5, borderRadius: '8px 8px 0 0' }}>
          Contribution Breakdown by Founder
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 700 }}>Founder</TableCell>
              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Target %</TableCell>
              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Target Amount</TableCell>
              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actual Invested</TableCell>
              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actual %</TableCell>
              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Variance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {breakdown.map(b => (
              <TableRow key={b.investor} sx={{ '&:hover': { backgroundColor: '#f5f7ff' } }}>
                <TableCell sx={{ fontWeight: 600 }}>{b.investor}</TableCell>
                <TableCell sx={{ textAlign: 'right', color: 'text.secondary' }}>{b.targetPct}%</TableCell>
                <TableCell sx={{ textAlign: 'right', color: 'text.secondary' }}>{formatPHP(b.targetAmount)}</TableCell>
                <TableCell sx={{ textAlign: 'right', color: '#1565c0', fontWeight: 600 }}>{formatPHP(b.total)}</TableCell>
                <TableCell sx={{ textAlign: 'right', color: 'text.secondary' }}>{b.actualPct.toFixed(1)}%</TableCell>
                <TableCell sx={{ textAlign: 'right', fontWeight: 600, color: b.variance >= 0 ? 'success.main' : 'error.main' }}>
                  {b.variance >= 0 ? '+' : ''}{formatPHP(b.variance)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 700 }}>TOTAL</TableCell>
              <TableCell sx={{ textAlign: 'right', fontWeight: 700 }}>100%</TableCell>
              <TableCell sx={{ textAlign: 'right', fontWeight: 700 }}>{formatPHP(target)}</TableCell>
              <TableCell sx={{ textAlign: 'right', fontWeight: 700, color: '#1565c0' }}>{formatPHP(totalInvested)}</TableCell>
              <TableCell sx={{ textAlign: 'right', fontWeight: 700 }}>100%</TableCell>
              <TableCell sx={{ textAlign: 'right', fontWeight: 700, color: balance <= 0 ? 'success.main' : 'error.main' }}>
                {balance <= 0 ? '+' : ''}{formatPHP(-balance)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Paper>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editing ? 'Edit Entry' : 'Add Investment Entry'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12} sm={6}>
              <TextField label="Date *" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select label="Investor / Source *" fullWidth size="small" value={form.investor} onChange={e => setForm(f => ({ ...f, investor: e.target.value }))}>
                {INVESTORS.map(inv => <MenuItem key={inv} value={inv}>{inv}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Amount (₱) *" type="number" fullWidth size="small" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} inputProps={{ min: 0 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select label="Category *" fullWidth size="small" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(cat => <MenuItem key={cat} value={cat}>{cat}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField label="Description" fullWidth size="small" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. TANN PH Server, SEC Filing Fees, etc." />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveEntry} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Entry'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Delete Entry?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the entry for <strong>{toDelete?.investor}</strong> — {toDelete?.description || toDelete?.category} ({toDelete ? formatPHP(toDelete.amount) : ''})?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Target Dialog (superadmin only) */}
      <Dialog open={targetDialogOpen} onClose={() => setTargetDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Set Target Capitalization</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField label="Target Amount (₱)" type="number" fullWidth size="small" value={targetInput} onChange={e => setTargetInput(e.target.value)} sx={{ mt: 1 }} inputProps={{ min: 0 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTargetDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveTarget} disabled={targetSaving}>
            {targetSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InvestmentTrackerPage;
