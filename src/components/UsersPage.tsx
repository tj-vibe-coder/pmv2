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
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputLabel,
  FormControl,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';

interface UserRow {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  designation: string | null;
  contact_number: string | null;
  role: string;
  approved: number;
  created_at: number;
  updated_at: number;
}

interface PayrollEmployee {
  id: string;
  name: string;
  userId?: string;
}

const ROLES = ['superadmin', 'admin', 'user', 'viewer', 'tax_filer'] as const;

export default function UsersPage() {
  const { user, updateCachedUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editContactNumber, setEditContactNumber] = useState('');
  const [editRole, setEditRole] = useState<string>('');
  const [editApproved, setEditApproved] = useState<number>(1);
  const [editPassword, setEditPassword] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [payrollEmployees, setPayrollEmployees] = useState<PayrollEmployee[]>([]);
  const [editPayrollEmpId, setEditPayrollEmpId] = useState<string>('');

  const fetchPayrollEmployees = useCallback(async () => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/payroll/employees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPayrollEmployees(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore — payroll link is optional */ }
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addFullName, setAddFullName] = useState('');
  const [addDesignation, setAddDesignation] = useState('');
  const [addContactNumber, setAddContactNumber] = useState('');
  const [addRole, setAddRole] = useState<string>('user');
  const [addApproved, setAddApproved] = useState<number>(1);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
    fetchPayrollEmployees();
  }, [fetchUsers, fetchPayrollEmployees]);

  const startEdit = (u: UserRow) => {
    setEditingId(u.id);
    setEditUsername(u.username);
    setEditEmail(u.email);
    setEditFullName(u.full_name ?? '');
    setEditDesignation(u.designation ?? '');
    setEditContactNumber(u.contact_number ?? '');
    setEditRole(u.role);
    setEditApproved(u.approved);
    setEditPassword('');
    // Find which payroll employee is currently linked to this user
    const linked = payrollEmployees.find((pe) => pe.userId === u.id);
    setEditPayrollEmpId(linked?.id ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const openAddDialog = () => {
    setAddUsername('');
    setAddEmail('');
    setAddPassword('');
    setAddFullName('');
    setAddDesignation('');
    setAddContactNumber('');
    setAddRole('user');
    setAddApproved(1);
    setAddError(null);
    setAddOpen(true);
  };

  const createUser = async () => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    if (!addUsername.trim()) { setAddError('Username is required'); return; }
    if (!addEmail.trim()) { setAddError('Email is required'); return; }
    if (addPassword.length < 6) { setAddError('Password must be at least 6 characters long'); return; }
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: addUsername.trim(),
          email: addEmail.trim(),
          password: addPassword,
          full_name: addFullName.trim() || null,
          designation: addDesignation.trim() || null,
          contact_number: addContactNumber.trim() || null,
          role: addRole,
          approved: addApproved,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.user) {
        setUsers((prev) => [...prev, data.user]);
        setAddOpen(false);
      } else {
        setAddError(data.error || 'Failed to create user');
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setAddSaving(false);
    }
  };

  const saveUser = async () => {
    if (editingId == null) return;
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    if (!editUsername.trim()) {
      setError('Username is required');
      return;
    }
    if (!editEmail.trim()) {
      setError('Email is required');
      return;
    }
    if (editPassword && editPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    setSavingId(editingId);
    try {
      const res = await fetch(`${API_BASE}/api/users/${editingId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: editUsername.trim(),
          email: editEmail.trim(),
          full_name: editFullName.trim() || null,
          designation: editDesignation.trim() || null,
          contact_number: editContactNumber.trim() || null,
          role: editRole,
          approved: editApproved,
          ...(editPassword ? { password: editPassword } : {}),
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        // Update payroll employee link if changed
        const prevLinked = payrollEmployees.find((pe) => pe.userId === editingId);
        const prevPayrollId = prevLinked?.id ?? '';
        if (editPayrollEmpId !== prevPayrollId) {
          // Unlink old payroll employee
          if (prevPayrollId) {
            await fetch(`${API_BASE}/api/payroll/employees/${prevPayrollId}`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: '' }),
            }).catch(() => {});
          }
          // Link new payroll employee
          if (editPayrollEmpId) {
            await fetch(`${API_BASE}/api/payroll/employees/${editPayrollEmpId}`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: editingId }),
            }).catch(() => {});
          }
          // Refresh payroll employees to reflect new links
          fetchPayrollEmployees();
        }
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingId
              ? data.user
              : u
          )
        );
        if (String(user?.id) === editingId) {
          updateCachedUser(data.user);
        }
        setEditingId(null);
        setEditPassword('');
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
    if (String(user?.id) === u.id) {
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, color: theme.primary }}>
            User Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage account identity, contact details, company position, access role, approval status, and password resets.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openAddDialog}
          sx={{ bgcolor: theme.primary, '&:hover': { bgcolor: theme.secondary } }}
        >
          Add User
        </Button>
      </Box>

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
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Contact No.</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Company Position</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Access Role</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Approved</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Password</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary }}>Payroll Employee</TableCell>
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
                  <TableCell>
                    {editingId === u.id ? (
                      <TextField
                        size="small"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        placeholder="Username"
                        fullWidth
                        sx={{ minWidth: 150 }}
                      />
                    ) : (
                      u.username
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === u.id ? (
                      <TextField
                        size="small"
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="Email"
                        fullWidth
                        sx={{ minWidth: 220 }}
                      />
                    ) : (
                      u.email
                    )}
                  </TableCell>
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
                      <TextField
                        size="small"
                        value={editContactNumber}
                        onChange={(e) => setEditContactNumber(e.target.value)}
                        placeholder="+63 ..."
                        fullWidth
                        sx={{ minWidth: 170 }}
                      />
                    ) : (
                      u.contact_number || '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === u.id ? (
                      <TextField
                        size="small"
                        value={editDesignation}
                        onChange={(e) => setEditDesignation(e.target.value)}
                        placeholder="Company position"
                        fullWidth
                        sx={{ maxWidth: 180 }}
                      />
                    ) : (
                      u.designation || '—'
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
                    {editingId === u.id ? (
                      <TextField
                        size="small"
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="Leave blank"
                        fullWidth
                        sx={{ minWidth: 150 }}
                      />
                    ) : (
                      '••••••'
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === u.id ? (
                      <Select
                        size="small"
                        value={editPayrollEmpId}
                        onChange={(e) => setEditPayrollEmpId(e.target.value)}
                        displayEmpty
                        sx={{ minWidth: 160 }}
                      >
                        <MenuItem value=""><em>None</em></MenuItem>
                        {payrollEmployees.map((pe) => (
                          <MenuItem
                            key={pe.id}
                            value={pe.id}
                            disabled={!!pe.userId && pe.userId !== u.id}
                          >
                            {pe.name}{pe.userId && pe.userId !== u.id ? ' (linked)' : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    ) : (
                      payrollEmployees.find((pe) => pe.userId === u.id)?.name || '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {u.created_at
                      ? new Date(u.created_at * 1000).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {editingId === u.id ? (
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
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
                      </Stack>
                    ) : (
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
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
                          disabled={deletingId === u.id || String(user?.id) === u.id}
                          onClick={() => deleteUser(u)}
                          aria-label="Delete user"
                          title={String(user?.id) === u.id ? 'Cannot delete your own account' : 'Delete user'}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={addOpen} onClose={() => !addSaving && setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add User</DialogTitle>
        <DialogContent>
          {addError && (
            <Alert severity="error" onClose={() => setAddError(null)} sx={{ mb: 2 }}>
              {addError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Username"
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Email"
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              helperText="At least 6 characters"
              fullWidth
            />
            <TextField
              label="Full name"
              value={addFullName}
              onChange={(e) => setAddFullName(e.target.value)}
              fullWidth
            />
            <TextField
              label="Company position"
              value={addDesignation}
              onChange={(e) => setAddDesignation(e.target.value)}
              fullWidth
            />
            <TextField
              label="Contact number"
              value={addContactNumber}
              onChange={(e) => setAddContactNumber(e.target.value)}
              placeholder="+63 ..."
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="add-user-role-label">Access Role</InputLabel>
              <Select
                labelId="add-user-role-label"
                label="Access Role"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
              >
                {ROLES.map((r) => (
                  <MenuItem key={r} value={r}>{r}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="add-user-approved-label">Approved</InputLabel>
              <Select
                labelId="add-user-approved-label"
                label="Approved"
                value={addApproved}
                onChange={(e) => setAddApproved(Number(e.target.value))}
              >
                <MenuItem value={1}>Yes — can log in immediately</MenuItem>
                <MenuItem value={0}>No — pending approval</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={addSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={createUser}
            disabled={addSaving}
            sx={{ bgcolor: theme.primary, '&:hover': { bgcolor: theme.secondary } }}
          >
            {addSaving ? 'Creating…' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
