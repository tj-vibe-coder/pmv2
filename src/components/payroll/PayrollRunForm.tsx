import React, { useEffect, useState } from 'react';
import {
  Box, Button, Step, StepLabel, Stepper, Typography, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, MenuItem, Alert, CircularProgress, Divider,
} from '@mui/material';
import { Employee, DTRInput, Payslip, PayrollRun, DayType } from '../../types/Payroll';
import { getEmployees, createPayrollRun, saveDTREntries, savePayslips, approvePayrollRun } from '../../utils/firebasePayroll';
import { computePayslip } from '../../utils/payrollEngine';
import { useAuth } from '../../contexts/AuthContext';

const STEPS = ['Period Setup', 'DTR Entry', 'Preview & Adjustments', 'Approve & Lock'];
const DAY_TYPES: DayType[] = ['REGULAR', 'REST_DAY', 'SPECIAL_HOLIDAY', 'REGULAR_HOLIDAY', 'DOUBLE_HOLIDAY'];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

interface Props {
  onComplete: () => void;
  onCancel: () => void;
}

const PayrollRunForm: React.FC<Props> = ({ onComplete, onCancel }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 1
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [payDate, setPayDate] = useState('');

  // Step 2
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [dtrInputs, setDtrInputs] = useState<DTRInput[]>([]);

  // Step 3
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});

  // Step 4
  const [createdRun, setCreatedRun] = useState<PayrollRun | null>(null);

  // ── Step 1 → 2: load active employees ────────────────────────────────────
  const handleNextStep1 = async () => {
    if (!periodStart || !periodEnd || !payDate) { setError('All date fields are required.'); return; }
    setError('');
    setLoadingEmps(true);
    try {
      const emps = (await getEmployees()).filter((e) => e.isActive);
      setEmployees(emps);
      setDtrInputs(emps.map((emp) => ({
        employeeId: emp.id,
        employee: emp,
        workingDays: 0,
        regularHours: 0,
        overtimeHours: 0,
        nightDiffHours: 0,
        tardinessMinutes: 0,
        dayType: 'REGULAR' as DayType,
        regularHolidayDays: 0,
        specialHolidayDays: 0,
        restDayOTHours: 0,
        regularHolidayOTHours: 0,
      })));
      setStep(1);
    } catch { setError('Failed to load employees.'); }
    finally { setLoadingEmps(false); }
  };

  // ── Step 2 → 3: compute payslips ─────────────────────────────────────────
  const handleNextStep2 = () => {
    setError('');
    const computed = dtrInputs.map((dtr) =>
      computePayslip('', dtr, adjustments[dtr.employeeId] ?? 0)
    );
    setPayslips(computed);
    setStep(2);
  };

  // ── Step 3 → 4: save run + payslips ──────────────────────────────────────
  const handleSaveDraft = async () => {
    setSaving(true);
    setError('');
    try {
      const run = await createPayrollRun({
        periodStart,
        periodEnd,
        payDate,
        status: 'DRAFT',
        createdBy: user?.username ?? '',
      });
      setCreatedRun(run);

      // Save with final adjustments applied
      const finalSlips = dtrInputs.map((dtr) =>
        computePayslip(run.id, dtr, adjustments[dtr.employeeId] ?? 0)
      );
      await savePayslips(run.id, finalSlips);
      setStep(3);
    } catch (e: any) {
      setError(e.message || 'Failed to save payroll run.');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 4: approve & lock ────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!createdRun) return;
    setSaving(true);
    try {
      await approvePayrollRun(createdRun.id);
      onComplete();
    } catch { setError('Failed to approve run.'); }
    finally { setSaving(false); }
  };

  const updateDtr = (empId: string, field: keyof DTRInput, value: number | string) => {
    setDtrInputs((prev) =>
      prev.map((d) => d.employeeId === empId ? { ...d, [field]: value } : d)
    );
  };

  const totalNetPay = payslips.reduce((s, p) => s + p.netPay, 0);
  const totalGross = payslips.reduce((s, p) => s + p.grossPay, 0);
  const totalDeductions = payslips.reduce((s, p) => s + p.totalDeductions, 0);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h6" fontWeight={600} sx={{ cursor: 'pointer', color: '#2853c0' }} onClick={onCancel}>
          ← Payroll Register
        </Typography>
        <Typography variant="h6" color="text.secondary">/ New Payroll Run</Typography>
      </Box>

      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── STEP 1 ─────────────────────────────────────────────────────────── */}
      {step === 0 && (
        <Paper sx={{ p: 3, borderRadius: 2, maxWidth: 500 }}>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Select Pay Period</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Period Start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Period End" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Pay Date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
              <Button onClick={onCancel}>Cancel</Button>
              <Button variant="contained" onClick={handleNextStep1} disabled={loadingEmps} sx={{ bgcolor: '#2853c0' }}>
                {loadingEmps ? <CircularProgress size={20} /> : 'Next'}
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── STEP 2 ─────────────────────────────────────────────────────────── */}
      {step === 1 && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>
            DTR Entry — {employees.length} active employee(s)
          </Typography>
          <TableContainer component={Paper} sx={{ borderRadius: 2, mb: 2, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#2c3242' }}>
                <TableRow>
                  {['Employee', 'Day Type', 'Work Days', 'Reg Hrs', 'OT Hrs', 'Rest Day OT', 'Hol OT', 'Night Diff Hrs', 'Tardiness (min)', 'Reg Hol Days', 'Spl Hol Days'].map((h) => (
                    <TableCell key={h} sx={{ color: 'white', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {dtrInputs.map((dtr) => (
                  <TableRow key={dtr.employeeId}>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{dtr.employee.name}</TableCell>
                    <TableCell>
                      <TextField select size="small" value={dtr.dayType}
                        onChange={(e) => updateDtr(dtr.employeeId, 'dayType', e.target.value)}
                        sx={{ minWidth: 140 }}>
                        {DAY_TYPES.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    {(['workingDays', 'regularHours', 'overtimeHours', 'restDayOTHours', 'regularHolidayOTHours', 'nightDiffHours', 'tardinessMinutes', 'regularHolidayDays', 'specialHolidayDays'] as (keyof DTRInput)[]).map((field) => (
                      <TableCell key={field}>
                        <TextField type="number" size="small" value={(dtr as any)[field]}
                          onChange={(e) => updateDtr(dtr.employeeId, field, parseFloat(e.target.value) || 0)}
                          inputProps={{ min: 0, style: { width: 60 } }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button variant="contained" onClick={handleNextStep2} sx={{ bgcolor: '#2853c0' }}>Preview</Button>
          </Box>
        </Box>
      )}

      {/* ── STEP 3 ─────────────────────────────────────────────────────────── */}
      {step === 2 && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Preview & Adjustments</Typography>
          <TableContainer component={Paper} sx={{ borderRadius: 2, mb: 2, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#2c3242' }}>
                <TableRow>
                  {['Employee', 'Basic Pay', 'OT', 'Meal Allow.', 'SSS', 'PhilHealth', 'Pag-IBIG', 'Tax', 'Tardiness', 'Adjustment', 'Net Pay'].map((h) => (
                    <TableCell key={h} sx={{ color: 'white', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {payslips.map((slip, i) => {
                  const adj = adjustments[slip.employeeId] ?? 0;
                  const recomputed = computePayslip('', dtrInputs[i], adj);
                  return (
                    <TableRow key={slip.employeeId}>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{slip.employeeSnapshot?.name}</TableCell>
                      <TableCell>{fmt(recomputed.basicPay)}</TableCell>
                      <TableCell>{fmt(recomputed.otPayRegular + recomputed.otPayRestDay + recomputed.otPayRegularHoliday)}</TableCell>
                      <TableCell>{fmt(recomputed.mealAllowance)}</TableCell>
                      <TableCell>{fmt(recomputed.empSSS)}</TableCell>
                      <TableCell>{fmt(recomputed.empPhilhealth)}</TableCell>
                      <TableCell>{fmt(recomputed.empPagibig)}</TableCell>
                      <TableCell>{fmt(recomputed.withholdingTax)}</TableCell>
                      <TableCell>{fmt(recomputed.tardinessDeduction)}</TableCell>
                      <TableCell>
                        <TextField type="number" size="small" value={adj}
                          onChange={(e) => setAdjustments((a) => ({ ...a, [slip.employeeId]: parseFloat(e.target.value) || 0 }))}
                          inputProps={{ style: { width: 70 } }} />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#2853c0' }}>{fmt(recomputed.netPay)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Paper sx={{ p: 2, borderRadius: 2, mb: 2, bgcolor: '#f8f9fa' }}>
            <Box sx={{ display: 'flex', gap: 4 }}>
              <Typography>Total Gross: <strong>{fmt(totalGross)}</strong></Typography>
              <Typography>Total Deductions: <strong>{fmt(totalDeductions)}</strong></Typography>
              <Typography>Total Net Pay: <strong style={{ color: '#2853c0' }}>{fmt(totalNetPay)}</strong></Typography>
            </Box>
          </Paper>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button variant="contained" onClick={handleSaveDraft} disabled={saving} sx={{ bgcolor: '#2853c0' }}>
              {saving ? <CircularProgress size={20} /> : 'Save as Draft'}
            </Button>
          </Box>
        </Box>
      )}

      {/* ── STEP 4 ─────────────────────────────────────────────────────────── */}
      {step === 3 && createdRun && (
        <Paper sx={{ p: 4, borderRadius: 2, maxWidth: 600 }}>
          <Typography variant="h6" fontWeight={700} mb={2}>Approve & Lock Payroll Run</Typography>
          <Box sx={{ mb: 2 }}>
            <Typography><strong>Period:</strong> {createdRun.periodStart} – {createdRun.periodEnd}</Typography>
            <Typography><strong>Pay Date:</strong> {createdRun.payDate}</Typography>
            <Typography><strong>Employees:</strong> {payslips.length}</Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 4, mb: 3 }}>
            <Typography>Gross: <strong>{fmt(totalGross)}</strong></Typography>
            <Typography>Deductions: <strong>{fmt(totalDeductions)}</strong></Typography>
            <Typography>Net Pay: <strong style={{ color: '#2853c0' }}>{fmt(totalNetPay)}</strong></Typography>
          </Box>
          <Alert severity="warning" sx={{ mb: 3 }}>
            Approving this run will lock all figures. This cannot be undone.
          </Alert>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={onCancel}>Close (keep as Draft)</Button>
            <Button variant="contained" color="success" onClick={handleApprove} disabled={saving}>
              {saving ? <CircularProgress size={20} /> : 'Approve & Lock'}
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default PayrollRunForm;
