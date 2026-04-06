import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Alert, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import { Employee } from '../../types/Payroll';
import { getEmployees, createEmployee, updateEmployee, deactivateEmployee } from '../../utils/firebasePayroll';
import EmployeeForm from './EmployeeForm';

const fmt = (n?: number) =>
  n !== undefined
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
    : '—';

const EmployeeList: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setEmployees(await getEmployees());
    } catch {
      setError('Failed to load employees.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
                {['Emp No.', 'Name', 'Designation', 'Type', 'Rate', 'Meal Allow.', 'Frequency', 'Status', 'Actions'].map((h) => (
                  <TableCell key={h} sx={{ color: 'white', fontWeight: 600 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No employees yet. Add your first employee.
                  </TableCell>
                </TableRow>
              ) : employees.map((emp) => (
                <TableRow key={emp.id} hover sx={{ opacity: emp.isActive ? 1 : 0.5 }}>
                  <TableCell>{emp.employeeNumber}</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{emp.name}</TableCell>
                  <TableCell>{emp.designation}</TableCell>
                  <TableCell>
                    <Chip label={emp.employeeType} size="small"
                      color={emp.employeeType === 'FIELD' ? 'warning' : 'info'} />
                  </TableCell>
                  <TableCell>
                    {emp.employeeType === 'FIELD' ? fmt(emp.dailyRate) + '/day' : fmt(emp.monthlyRate) + '/mo'}
                  </TableCell>
                  <TableCell>{fmt(emp.mealAllowance)}/day</TableCell>
                  <TableCell>{emp.payFrequency.replace('_', '-')}</TableCell>
                  <TableCell>
                    <Chip label={emp.isActive ? 'Active' : 'Inactive'} size="small"
                      color={emp.isActive ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell>
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
      />
    </Box>
  );
};

export default EmployeeList;
