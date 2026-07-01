import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Button, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, CircularProgress, Snackbar,
} from '@mui/material';
import { API_BASE } from '../config/api';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0', secondary: '#1e4a72', accent1: '#4f7bc8', accent2: '#3c6ba5',
  success: '#00b894', warning: '#fdcb6e', error: '#e84393', info: '#74b9ff',
};
const API = `${API_BASE}/api`;

function formatPHP(n: number) {
  return '₱' + (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function formatDate(ts?: number | string) {
  if (!ts) return '—';
  if (typeof ts === 'string') return ts.slice(0, 10);
  return new Date(ts * 1000).toLocaleDateString('en-PH');
}

interface Reimbursement {
  id: string;
  form_no?: string | null;
  employee_name?: string | null;
  full_name?: string | null;
  username?: string | null;
  date_of_submission?: string | null;
  total_amount?: number;
  created_at?: number;
}

const ReimbursementDashboard: React.FC = () => {
  const [rows, setRows] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('netpacific_token');
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };

  const fetchData = () => {
    setLoading(true);
    fetch(`${API}/reimbursements`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.success) { setRows(data.reimbursements || []); setError(''); }
        else setError(data.error || 'Failed to load reimbursements.');
      })
      .catch(() => setError('Failed to load reimbursements.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPending = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
    [rows]
  );

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < rows.length;

  const toggleAll = () => setSelectedIds(allSelected ? [] : rows.map(r => r.id));
  const toggleOne = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const markReimbursed = () => {
    if (selectedIds.length === 0 || submitting) return;
    if (!window.confirm(`Mark ${selectedIds.length} reimbursement(s) as reimbursed? This records an out-of-pocket payout.`)) return;
    setSubmitting(true);
    fetch(`${API}/reimbursements/batch-mark`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ids: selectedIds }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setToast(data.message || `Marked ${data.updated} as reimbursed`);
          setSelectedIds([]);
          fetchData();
        } else {
          setError(data.error || 'Failed to mark reimbursed.');
        }
      })
      .catch(() => setError('Failed to mark reimbursed.'))
      .finally(() => setSubmitting(false));
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
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Pending Requests</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{rows.length}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Awaiting payout</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Pending Amount</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{formatPHP(totalPending)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Out-of-pocket claims</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
            Pending Reimbursements {selectedIds.length > 0 ? `(${selectedIds.length} selected)` : ''}
          </Typography>
          <Button
            variant="contained"
            size="small"
            disabled={selectedIds.length === 0 || submitting}
            onClick={markReimbursed}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary }}
          >
            {submitting ? 'Marking…' : `Mark Reimbursed${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
          </Button>
        </Box>
        <TableContainer sx={{ flexGrow: 1 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={someSelected}
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={rows.length === 0}
                  />
                </TableCell>
                <TableCell>Form No.</TableCell>
                <TableCell>Employee</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>No pending reimbursements.</TableCell></TableRow>
              ) : rows.map(r => (
                <TableRow key={r.id} hover selected={selectedIds.includes(r.id)}>
                  <TableCell padding="checkbox">
                    <Checkbox checked={selectedIds.includes(r.id)} onChange={() => toggleOne(r.id)} />
                  </TableCell>
                  <TableCell>{r.form_no || '—'}</TableCell>
                  <TableCell>{r.employee_name || r.full_name || r.username || '—'}</TableCell>
                  <TableCell>{r.date_of_submission ? formatDate(r.date_of_submission) : formatDate(r.created_at)}</TableCell>
                  <TableCell align="right">{formatPHP(Number(r.total_amount) || 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

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
