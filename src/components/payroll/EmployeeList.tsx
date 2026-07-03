import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, Paper, Chip, IconButton, Alert, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import EventNoteIcon from '@mui/icons-material/EventNote';
import { Employee } from '../../types/Payroll';
import type { User } from '../../types/User';
import { getEmployees, createEmployee, updateEmployee, deactivateEmployee } from '../../utils/firebasePayroll';
import { resolveRateType } from '../../utils/payrollEngine';
import { useAuth } from '../../contexts/AuthContext';
import EmployeeForm from './EmployeeForm';

const API_BASE = process.env.REACT_APP_API_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');

const fmt = (n?: number) =>
  n !== undefined
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
    : '—';

interface EmployeeListProps {
  /** When provided, shows a "View DTR" action per employee (admin/superadmin only). */
  onViewDTR?: (emp: Employee) => void;
}

const EmployeeList: React.FC<EmployeeListProps> = ({ onViewDTR }) => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [sortKey, setSortKey] = useState<'employeeNumber' | 'name' | 'designation' | 'employeeType' | 'rate' | 'isActive'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const loadUsers = useCallback(async () => {
    if (user?.role !== 'superadmin') return;
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) { const data = await res.json(); setAllUsers(Array.isArray(data) ? data : data.users || []); }
    } catch { /* non-critical */ }
  }, [user?.role]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setEmployees(await getEmployees());
    } catch {
      setError('Failed to load employees.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadUsers(); }, [load, loadUsers]);

  const handleSave = async (data: Omit<Employee, 'id' | 'createdAt'>) => {
    if (editing) {
      await updateEmployee(editing.id, data);
    } else {
      await createEmployee(data);
    }
    await load();
  };

  const handleDeactivate = async (emp: Employee) => {
    if (!window.confirm(`Deactivate ${emp.name}?`)) return;
    try {
      await deactivateEmployee(emp.id);
      load();
    } catch { setError('Failed to deactivate employee.'); }
  };

  const sortedEmployees = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...employees].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'employeeNumber': cmp = (a.employeeNumber || '').localeCompare(b.employeeNumber || ''); break;
        case 'designation': cmp = (a.designation || '').localeCompare(b.designation || ''); break;
        case 'employeeType': cmp = a.employeeType.localeCompare(b.employeeType); break;
        case 'rate': cmp = (resolveRateType(a) === 'DAILY' ? a.dailyRate ?? 0 : a.monthlyRate ?? 0) - (resolveRateType(b) === 'DAILY' ? b.dailyRate ?? 0 : b.monthlyRate ?? 0); break;
        case 'isActive': cmp = Number(a.isActive) - Number(b.isActive); break;
        case 'name':
        default: cmp = a.name.localeCompare(b.name); break;
      }
      return cmp * dir;
    });
  }, [employees, sortKey, sortDir]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Header row background is dark navy — force white text/icon (TableSortLabel doesn't inherit color).
  const sortLabel = (key: typeof sortKey, text: string) => (
    <TableSortLabel
      active={sortKey === key}
      direction={sortKey === key ? sortDir : 'asc'}
      onClick={() => handleSort(key)}
      sx={{
        color: 'white',
        '&:hover': { color: 'white' },
        '&.Mui-active': { color: 'white' },
        '& .MuiTableSortLabel-icon': { color: 'white !important' },
      }}
    >
      {text}
    </TableSortLabel>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>Employees</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}
          sx={{ bgcolor: '#2853c0' }}>
          Add Employee
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#2c3242' }}>
              <TableRow>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>{sortLabel('employeeNumber', 'Emp No.')}</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>{sortLabel('name', 'Name')}</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>{sortLabel('designation', 'Designation')}</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>{sortLabel('employeeType', 'Type')}</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>{sortLabel('rate', 'Rate')}</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Meal Allow.</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Frequency</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>{sortLabel('isActive', 'Status')}</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No employees yet. Add your first employee.
                  </TableCell>
                </TableRow>
              ) : sortedEmployees.map((emp) => (
                <TableRow key={emp.id} hover sx={{ opacity: emp.isActive ? 1 : 0.5 }}>
                  <TableCell>{emp.employeeNumber}</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{emp.name}</TableCell>
                  <TableCell>{emp.designation}</TableCell>
                  <TableCell>
                    <Chip label={emp.employeeType} size="small"
                      color={emp.employeeType === 'FIELD' ? 'warning' : 'info'} />
                  </TableCell>
                  <TableCell>
                    {resolveRateType(emp) === 'DAILY' ? fmt(emp.dailyRate) + '/day' : fmt(emp.monthlyRate) + '/mo'}
                  </TableCell>
                  <TableCell>{fmt(emp.mealAllowance)}/day</TableCell>
                  <TableCell>{emp.payFrequency.replace('_', '-')}</TableCell>
                  <TableCell>
                    <Chip label={emp.isActive ? 'Active' : 'Inactive'} size="small"
                      color={emp.isActive ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell>
                    {onViewDTR && emp.userId && (
                      <IconButton size="small" title="View DTR" onClick={() => onViewDTR(emp)}>
                        <EventNoteIcon fontSize="small" />
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={() => { setEditing(emp); setFormOpen(true); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    {emp.isActive && (
                      <IconButton size="small" color="error" onClick={() => handleDeactivate(emp)}>
                        <PersonOffIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <EmployeeForm
        open={formOpen}
        employee={editing}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        canEditRate={user?.role === 'superadmin'}
        users={user?.role === 'superadmin' ? allUsers : []}
      />
    </Box>
  );
};

export default EmployeeList;
