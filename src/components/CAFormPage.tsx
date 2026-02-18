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
} from '@mui/material';
import { Add as AddIcon, Check as CheckIcon, Close as CloseIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';

interface CashAdvanceRow {
  id: number;
  user_id: number;
  amount: number;
  balance_remaining: number;
  status: string;
  purpose: string | null;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

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

  const handleRequest = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError('Enter a valid amount');
      return;
    }
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt, purpose: purpose.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setAmount('');
        setPurpose('');
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
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
          <TextField
            size="small"
            label="Amount"
            type="number"
            inputProps={{ min: 0.01, step: 0.01 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            sx={{ width: 160 }}
          />
          <TextField
            size="small"
            label="Purpose (optional)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Site expenses"
            sx={{ flex: 1, minWidth: 200 }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleRequest}
            disabled={submitting}
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
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Purpose</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Requested</TableCell>
                {isAdmin && (
                  <TableCell sx={{ fontWeight: 600, color: theme.primary }} align="right">
                    Actions
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 9 : 6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
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
                    <TableCell>{ca.purpose || '—'}</TableCell>
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
                    {isAdmin && ca.status === 'pending' && (
                      <TableCell align="right">
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
                        >
                          Reject
                        </Button>
                      </TableCell>
                    )}
                    {isAdmin && ca.status !== 'pending' && <TableCell />}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
