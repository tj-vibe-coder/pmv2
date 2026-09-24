import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Stack,
} from '@mui/material';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import LockResetIcon from '@mui/icons-material/LockReset';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';

interface PendingUser {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: number;
}

interface ResetRequest {
  id: string;
  user_id: string;
  username: string;
  email: string;
  requested_at: number;
  request_count: number;
}

const UserApprovalsPage: React.FC = () => {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  // Password reset requests
  const [resetRequests, setResetRequests] = useState<ResetRequest[]>([]);
  const [resolveTarget, setResolveTarget] = useState<ResetRequest | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/users/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.users) {
        setPending(data.users);
      } else {
        setError(data.error || 'Failed to load pending users');
      }
    } catch (e) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResetRequests = useCallback(async () => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/users/reset-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) setResetRequests(data.requests);
    } catch {
      /* non-fatal; approvals still render */
    }
  }, []);

  useEffect(() => {
    fetchPending();
    fetchResetRequests();
  }, [fetchPending, fetchResetRequests]);

  const openResolve = (r: ResetRequest) => {
    setResolveTarget(r);
    setNewPassword('');
    setResolveErr(null);
  };

  const submitResolve = async () => {
    if (!resolveTarget) return;
    if (newPassword.length < 6) {
      setResolveErr('Password must be at least 6 characters long.');
      return;
    }
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setResolving(true);
    setResolveErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/users/reset-requests/${resolveTarget.id}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setResetRequests((prev) => prev.filter((x) => x.id !== resolveTarget.id));
        setNotice(`Password reset for ${resolveTarget.username}. Share the new password with them directly.`);
        setResolveTarget(null);
        setNewPassword('');
      } else {
        setResolveErr(data.error || 'Failed to reset password.');
      }
    } catch {
      setResolveErr('Network error.');
    } finally {
      setResolving(false);
    }
  };

  const dismissRequest = async (r: ResetRequest) => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/users/reset-requests/${r.id}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setResetRequests((prev) => prev.filter((x) => x.id !== r.id));
      } else {
        setError(data.error || 'Failed to dismiss request.');
      }
    } catch {
      setError('Network error.');
    }
  };

  const handleApprove = async (id: number) => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setApprovingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/users/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPending((prev) => prev.filter((u) => u.id !== id));
      } else {
        setError(data.error || 'Failed to approve');
      }
    } catch (e) {
      setError('Network error');
    } finally {
      setApprovingId(null);
    }
  };

  if (user?.role !== 'superadmin') {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Access denied. Superadmin only.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        User approvals
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        New users can register; they must be approved here before they can log in.
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : pending.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">No users pending approval.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: 'grey.100' }}>
                <TableCell>Username</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Requested</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pending.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell>
                    {u.created_at
                      ? new Date(u.created_at * 1000).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<HowToRegIcon />}
                      onClick={() => handleApprove(u.id)}
                      disabled={approvingId === u.id}
                    >
                      {approvingId === u.id ? 'Approving…' : 'Approve'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Password reset requests ─────────────────────────────────────── */}
      <Typography variant="h5" sx={{ mt: 4, mb: 1, fontWeight: 600 }}>
        Password reset requests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Users who can't sign in request a reset here. Set a new password, then share it with them directly.
      </Typography>

      {resetRequests.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">No pending password reset requests.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: 'grey.100' }}>
                <TableCell>Username</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Requested</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {resetRequests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.username}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>
                    {r.requested_at ? new Date(r.requested_at * 1000).toLocaleString() : '-'}
                    {r.request_count > 1 ? ` (×${r.request_count})` : ''}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<LockResetIcon />}
                        onClick={() => openResolve(r)}
                      >
                        Reset password
                      </Button>
                      <Button variant="text" size="small" color="inherit" onClick={() => dismissRequest(r)}>
                        Dismiss
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Set-new-password dialog */}
      <Dialog open={!!resolveTarget} onClose={() => !resolving && setResolveTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset password — {resolveTarget?.username}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Set a new password for <strong>{resolveTarget?.username}</strong> ({resolveTarget?.email}).
            You'll need to share this password with them directly.
          </DialogContentText>
          {resolveErr && <Alert severity="error" sx={{ mb: 2 }}>{resolveErr}</Alert>}
          <TextField
            autoFocus
            fullWidth
            type="text"
            label="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitResolve(); }}
            disabled={resolving}
            size="small"
            helperText="At least 6 characters. Shown as text so you can copy it to send to the user."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResolveTarget(null)} disabled={resolving}>Cancel</Button>
          <Button variant="contained" onClick={submitResolve} disabled={resolving}>
            {resolving ? 'Saving…' : 'Set password'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserApprovalsPage;
