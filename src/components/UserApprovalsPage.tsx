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
} from '@mui/material';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import { useAuth } from '../contexts/AuthContext';

interface PendingUser {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: number;
}

const UserApprovalsPage: React.FC = () => {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  const fetchPending = useCallback(async () => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users/pending', {
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

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleApprove = async (id: number) => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setApprovingId(id);
    try {
      const res = await fetch(`/api/users/${id}/approve`, {
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
    </Box>
  );
};

export default UserApprovalsPage;
