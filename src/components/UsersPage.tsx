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
  TextField,
  Button,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  IconButton,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';

interface UserRow {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  approved: number;
  created_at: number;
  updated_at: number;
}

const ROLES = ['superadmin', 'admin', 'user', 'viewer'] as const;

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<string>('');
  const [editApproved, setEditApproved] = useState<number>(1);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchUsers = useCallback(async () => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) {
      setError('Not logged in');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let data: { success?: boolean; users?: UserRow[]; error?: string };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(res.ok ? 'Invalid response' : `Request failed: ${res.status} ${res.statusText}`);
        setLoading(false);
        return;
      }
      if (data.success && data.users) {
        setUsers(data.users);
      } else {
        setError(data.error || (res.ok ? 'Failed to load users' : `Request failed: ${res.status}`));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setError(`Network error: ${msg}. Is the server running on the correct port?`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const startEdit = (u: UserRow) => {
    setEditingId(u.id);
    setEditFullName(u.full_name ?? '');
    setEditRole(u.role);
    setEditApproved(u.approved);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveUser = async () => {
    if (editingId == null) return;
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setSavingId(editingId);
    try {
      const res = await fetch(`${API_BASE}/api/users/${editingId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: editFullName.trim() || null,
          role: editRole,
          approved: editApproved,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingId
              ? {
                  ...u,
                  full_name: editFullName.trim() || null,
                  role: editRole,
                  approved: editApproved,
                }
              : u
          )
        );
        setEditingId(null);
      } else {
        setError(data.error || 'Failed to update user');
      }
    } catch (e) {
      setError('Network error');
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (u: UserRow) => {
    if (user?.id === u.id) {
      setError('You cannot delete your own account.');
      return;
    }
    if (!window.confirm(`Delete user "${u.username}" (${u.email})? This cannot be undone.`)) return;
    setDeletingId(u.id);
    setError(null);
    try {
      const token = localStorage.getItem('netpacific_token');
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/users/${u.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setUsers((prev) => prev.filter((x) => x.id !== u.id));
        if (editingId === u.id) {
          setEditingId(null);
        }
      } else {
        setError(data.error || `Delete failed: ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setDeletingId(null);
    }
  };

  if (user?.role !== 'superadmin') {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Access denied. Superadmin only.</Alert>
      </Box>
    );
  }

  const theme = { primary: '#2c5aa0', secondary: '#1e4a72' };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, color: theme.primary, mb: 2 }}>
        Users DB
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        View and edit user data. Set Full name so it appears on forms (e.g. Liquidation).
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
      ) : (
        <TableContainer component={Paper} sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: theme.primary + '12' }}>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Username</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Full name</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Approved</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.id}</TableCell>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    {editingId === u.id ? (
                      <TextField
                        size="small"
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        placeholder="Full name"
                        fullWidth
                        sx={{ maxWidth: 220 }}
                      />
                    ) : (
                      u.full_name || '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === u.id ? (
                      <Select
                        size="small"
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        sx={{ minWidth: 120 }}
                      >
                        {ROLES.map((r) => (
                          <MenuItem key={r} value={r}>{r}</MenuItem>
                        ))}
                      </Select>
                    ) : (
                      u.role
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === u.id ? (
                      <Select
                        size="small"
                        value={editApproved}
                        onChange={(e) => setEditApproved(Number(e.target.value))}
                        sx={{ minWidth: 80 }}
                      >
                        <MenuItem value={1}>Yes</MenuItem>
                        <MenuItem value={0}>No</MenuItem>
                      </Select>
                    ) : u.approved ? (
                      'Yes'
                    ) : (
                      'No'
                    )}
                  </TableCell>
                  <TableCell>
                    {u.created_at
                      ? new Date(u.created_at * 1000).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {editingId === u.id ? (
                      <>
                        <Button
                          size="small"
                          startIcon={<SaveIcon />}
                          onClick={saveUser}
                          disabled={savingId === u.id}
                          sx={{ mr: 0.5, color: theme.primary }}
                        >
                          Save
                        </Button>
                        <IconButton size="small" onClick={cancelEdit} aria-label="Cancel">
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => startEdit(u)}
                          sx={{ mr: 0.5, color: theme.primary }}
                        >
                          Edit
                        </Button>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={deletingId === u.id || user?.id === u.id}
                          onClick={() => deleteUser(u)}
                          aria-label="Delete user"
                          title={user?.id === u.id ? 'Cannot delete your own account' : 'Delete user'}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
