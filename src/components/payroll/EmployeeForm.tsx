import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Grid, FormControlLabel, Switch,
} from '@mui/material';
import { Employee, EmployeeType, PayFrequency } from '../../types/Payroll';

const DESIGNATIONS = ['Helper', 'Skilled Worker', 'Foreman', 'Supervisor', 'Engineer', 'Engineering Manager', 'Project Manager', 'Admin', 'Accounting', 'Other'];

interface Props {
  open: boolean;
  employee?: Employee | null;
  onClose: () => void;
  onSave: (data: Omit<Employee, 'id' | 'createdAt'>) => Promise<void>;
}

const EMPTY: Omit<Employee, 'id' | 'createdAt'> = {
  employeeNumber: '',
  name: '',
  designation: '',
  employeeType: 'FIELD',
  payFrequency: 'WEEKLY',
  dailyRate: 0,
  monthlyRate: 0,
  mealAllowance: 0,
  dateHired: new Date().toISOString().split('T')[0],
  isActive: true,
  sssNumber: '',
  philhealthNumber: '',
  pagibigNumber: '',
  tinNumber: '',
};

const EmployeeForm: React.FC<Props> = ({ open, employee, onClose, onSave }) => {
  const [form, setForm] = useState<Omit<Employee, 'id' | 'createdAt'>>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (employee) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, ...rest } = employee;
      setForm(rest);
    } else {
      setForm(EMPTY);
    }
  }, [employee, open]);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setForm((f) => ({ ...f, [field]: val }));
  };

  const handleSave = async () => {
    if (!form.name || !form.employeeNumber || !form.designation) return;
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: '#2c3242' }}>
        {employee ? 'Edit Employee' : 'Add Employee'}
      </DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth label="Employee No." value={form.employeeNumber} onChange={set('employeeNumber')} required />
          </Grid>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField fullWidth label='Name (LASTNAME, Firstname)' value={form.name} onChange={set('name')} required />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth select label="Designation" value={form.designation} onChange={set('designation')} required>
              {DESIGNATIONS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField fullWidth select label="Type" value={form.employeeType}
              onChange={(e) => setForm((f) => ({ ...f, employeeType: e.target.value as EmployeeType }))}>
              <MenuItem value="FIELD">Field</MenuItem>
              <MenuItem value="OFFICE">Office</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField fullWidth select label="Pay Frequency" value={form.payFrequency}
              onChange={(e) => setForm((f) => ({ ...f, payFrequency: e.target.value as PayFrequency }))}>
              <MenuItem value="WEEKLY">Weekly</MenuItem>
              <MenuItem value="SEMI_MONTHLY">Semi-Monthly</MenuItem>
              <MenuItem value="MONTHLY">Monthly</MenuItem>
            </TextField>
          </Grid>

          {form.employeeType === 'FIELD' && (
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth label="Daily Rate (₱)" type="number" value={form.dailyRate} onChange={set('dailyRate')} inputProps={{ min: 0 }} />
            </Grid>
          )}
          {form.employeeType === 'OFFICE' && (
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth label="Monthly Rate (₱)" type="number" value={form.monthlyRate} onChange={set('monthlyRate')} inputProps={{ min: 0 }} />
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth label="Meal Allowance (₱/day)" type="number" value={form.mealAllowance} onChange={set('mealAllowance')} inputProps={{ min: 0 }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth label="Date Hired" type="date" value={form.dateHired} onChange={set('dateHired')} InputLabelProps={{ shrink: true }} />
          </Grid>

          <Grid size={12}><strong>Government Numbers</strong></Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField fullWidth label="SSS No." value={form.sssNumber} onChange={set('sssNumber')} />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField fullWidth label="PhilHealth No." value={form.philhealthNumber} onChange={set('philhealthNumber')} />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField fullWidth label="Pag-IBIG No." value={form.pagibigNumber} onChange={set('pagibigNumber')} />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField fullWidth label="TIN No." value={form.tinNumber} onChange={set('tinNumber')} />
          </Grid>

          <Grid size={12}>
            <FormControlLabel
              control={<Switch checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />}
              label="Active Employee"
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          sx={{ bgcolor: '#2853c0' }}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EmployeeForm;
