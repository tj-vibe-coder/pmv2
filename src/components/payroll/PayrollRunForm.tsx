import React, { useEffect, useState } from 'react';
import {
  Box, Button, Step, StepLabel, Stepper, Typography, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, MenuItem, Alert, CircularProgress, Divider, Checkbox, Chip,
} from '@mui/material';
import { Employee, DTRInput, Payslip, PayrollRun, DayType } from '../../types/Payroll';
import { getEmployees, getPayslipsForRun, createPayrollRun, updatePayrollRun, savePayslips, approvePayrollRun } from '../../utils/firebasePayroll';
import { computePayslip } from '../../utils/payrollEngine';
import { CONTRIB_DEFAULTS } from '../../utils/governmentContrib';
import { useAuth } from '../../contexts/AuthContext';
import { INVESTORS, FundingSource } from '../../data/financeCategories';
import { API_BASE } from '../../config/api';

const STEPS = ['Period Setup', 'Select Employees', 'DTR Entry', 'Preview & Adjustments', 'Approve & Lock'];
const DAY_TYPES: DayType[] = ['REGULAR', 'REST_DAY', 'SPECIAL_HOLIDAY', 'REGULAR_HOLIDAY', 'DOUBLE_HOLIDAY'];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

interface Props {
  onComplete: () => void;
  onCancel: () => void;
  /** Superadmin edit mode: pre-fills the wizard from this run and saves back to it instead of creating a new one. */
  editRun?: PayrollRun | null;
}

const PayrollRunForm: React.FC<Props> = ({ onComplete, onCancel, editRun }) => {
  const { user } = useAuth();
  const isEditMode = !!editRun;
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEditMode);
  const [existingDtrByEmployee, setExistingDtrByEmployee] = useState<Record<string, DTRInput>>({});
  const [editMissingDtr, setEditMissingDtr] = useState(false);

  // Step 1
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [payDate, setPayDate] = useState('');
  const [fundingType, setFundingType] = useState<'corporate_bank' | 'investor_outofpocket'>('corporate_bank');
  const [fundingInvestor, setFundingInvestor] = useState('');
  const [linkedInvestmentId, setLinkedInvestmentId] = useState('');
  const [linkedInvestments, setLinkedInvestments] = useState<{ id: string; date: string; category: string; description: string; amount: number }[]>([]);

  const handleFundingInvestorChange = async (investor: string) => {
    setFundingInvestor(investor);
    setLinkedInvestmentId('');
    setLinkedInvestments([]);
    if (!investor) return;
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/investments`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        const eligible = (data.investments || []).filter((inv: { investor: string; sourceType?: string }) =>
          inv.investor === investor && inv.sourceType !== 'expense_sync'
        );
        setLinkedInvestments(eligible.map((inv: { id: string; date: string; category: string; description: string; amount: number }) => ({
          id: inv.id, date: inv.date, category: inv.category, description: inv.description, amount: Number(inv.amount) || 0,
        })));
      }
    } catch {
      // silent — admin-only endpoint; non-admins just won't see linkable investments
    }
  };

  // Step 2 (employee selection)
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Step 3
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dtrInputs, setDtrInputs] = useState<DTRInput[]>([]);

  // Step 4
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});

  // Step 5
  const [createdRun, setCreatedRun] = useState<PayrollRun | null>(null);

  // ── Edit mode: preload the wizard from an existing run instead of starting blank ──────────
  useEffect(() => {
    if (!editRun) return;
    let cancelled = false;
    (async () => {
      setLoadingEdit(true);
      setError('');
      try {
        setPeriodStart(editRun.periodStart);
        setPeriodEnd(editRun.periodEnd);
        setPayDate(editRun.payDate);
        if (editRun.fundingSource?.type === 'investor_outofpocket' && editRun.fundingSource.investor) {
          setFundingType('investor_outofpocket');
          await handleFundingInvestorChange(editRun.fundingSource.investor);
          if (!cancelled) setLinkedInvestmentId(editRun.fundingSource.linkedInvestmentId ?? '');
        }
        const [emps, slips] = await Promise.all([getEmployees(), getPayslipsForRun(editRun.id)]);
        if (cancelled) return;
        setAllEmployees(emps);
        setSelectedIds(new Set(slips.map((s) => s.employeeId)));
        const dtrMap: Record<string, DTRInput> = {};
        const adjMap: Record<string, number> = {};
        slips.forEach((s) => {
          if (s.dtrInput) dtrMap[s.employeeId] = s.dtrInput;
          adjMap[s.employeeId] = s.adjustment || 0;
        });
        setExistingDtrByEmployee(dtrMap);
        setEditMissingDtr(slips.some((s) => !s.dtrInput));
        setAdjustments(adjMap);
      } catch {
        if (!cancelled) setError('Failed to load run for editing.');
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRun?.id]);

  // ── Step 1 → 2: load all employees, default-select who was plausibly active this period ──
  const handleNextStep1 = async () => {
    if (!periodStart || !periodEnd || !payDate) { setError('All date fields are required.'); return; }
    setError('');
    // Edit mode already has the run's roster loaded — don't clobber it with the "active as of
    // period end" default used for brand-new runs.
    if (isEditMode) { setStep(1); return; }
    setLoadingEmps(true);
    try {
      const emps = await getEmployees();
      setAllEmployees(emps);
      // Default: currently-active employees already hired by the period end. Employees
      // hired after this period, or marked inactive, start unchecked — the user (often
      // backfilling payroll for months before they onboarded to this system) ticks them
      // in manually per run rather than the run silently including everyone on file.
      setSelectedIds(new Set(
        emps.filter((e) => e.isActive && (!e.dateHired || e.dateHired <= periodEnd)).map((e) => e.id)
      ));
      setStep(1);
    } catch { setError('Failed to load employees.'); }
    finally { setLoadingEmps(false); }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Step 2 → 3: lock in the employee roster for this run ─────────────────
  const handleNextSelection = () => {
    if (selectedIds.size === 0) { setError('Select at least one employee for this run.'); return; }
    setError('');
    const emps = allEmployees.filter((e) => selectedIds.has(e.id));
    setEmployees(emps);
    setDtrInputs(emps.map((emp) => {
      // Edit mode: reuse the DTR figures saved on the original payslip so the wizard reopens
      // with real attendance data instead of blanking it out. Falls back to zeros for a newly
      // added employee, or for a pre-dtrInput-snapshot legacy run (see editMissingDtr banner).
      const existing = existingDtrByEmployee[emp.id];
      if (existing) return { ...existing, employee: emp };
      return {
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
        regularHolidayRestDayDays: 0,
        specialHolidayRestDayDays: 0,
        regularHolidayRestDayOTHours: 0,
        specialHolidayRestDayOTHours: 0,
      };
    }));
    setStep(2);
  };

  // ── Step 3 → 4: compute payslips ─────────────────────────────────────────
  const handleNextStep2 = () => {
    setError('');
    const computed = dtrInputs.map((dtr) =>
      computePayslip('', dtr, adjustments[dtr.employeeId] ?? 0)
    );
    setPayslips(computed);
    setStep(3);
  };

  // ── Step 4 → 5: save run + payslips ──────────────────────────────────────
  const handleSaveDraft = async () => {
    setSaving(true);
    setError('');
    try {
      const fundingSource: FundingSource | undefined = fundingType === 'investor_outofpocket' && fundingInvestor
        ? { type: 'investor_outofpocket', investor: fundingInvestor, ...(linkedInvestmentId ? { linkedInvestmentId } : {}) }
        : undefined;

      if (isEditMode && editRun) {
        // Editing preserves the run's originally-snapshotted rates (a correction to hours/pay
        // shouldn't silently drift statutory rates too) — only new/legacy runs fall back to today's.
        const snapshotRates = editRun.contribRates ?? CONTRIB_DEFAULTS;
        const finalSlips = dtrInputs.map((dtr) =>
          computePayslip(editRun.id, dtr, adjustments[dtr.employeeId] ?? 0, snapshotRates)
        );
        // Saving an edit always resets the run to Draft — re-approve (and re-mark-paid, if it
        // was PAID before) from here or the register list to relock it with the corrected figures.
        await updatePayrollRun(editRun.id, {
          periodStart,
          periodEnd,
          payDate,
          status: 'DRAFT',
          contribRates: snapshotRates,
          ...(fundingSource ? { fundingSource } : {}),
          payslips: finalSlips,
        });
        setCreatedRun({
          id: editRun.id,
          periodStart,
          periodEnd,
          payDate,
          status: 'DRAFT',
          createdBy: editRun.createdBy,
          createdAt: editRun.createdAt,
          contribRates: snapshotRates,
          ...(fundingSource ? { fundingSource } : {}),
        });
        setPayslips(finalSlips);
        setStep(4);
        return;
      }

      // Snapshot the statutory rates in effect now, so a later refresh of the global
      // defaults never recomputes this run at different rates.
      const snapshotRates = CONTRIB_DEFAULTS;
      const run = await createPayrollRun({
        periodStart,
        periodEnd,
        payDate,
        status: 'DRAFT',
        createdBy: user?.username ?? '',
        contribRates: snapshotRates,
        ...(fundingSource ? { fundingSource } : {}),
      });
      setCreatedRun(run);

      // Save with final adjustments applied, using the run's snapshotted rates
      const finalSlips = dtrInputs.map((dtr) =>
        computePayslip(run.id, dtr, adjustments[dtr.employeeId] ?? 0, run.contribRates ?? snapshotRates)
      );
      await savePayslips(run.id, finalSlips);
      setStep(4);
    } catch (e: any) {
      setError(e.message || 'Failed to save payroll run.');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 5: approve & lock ────────────────────────────────────────────────
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

  if (loadingEdit) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h6" fontWeight={600} sx={{ cursor: 'pointer', color: '#2853c0' }} onClick={onCancel}>
          ← Payroll Register
        </Typography>
        <Typography variant="h6" color="text.secondary">/ {isEditMode ? 'Edit Payroll Run (Superadmin)' : 'New Payroll Run'}</Typography>
      </Box>

      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {isEditMode && step === 1 && editMissingDtr && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This run predates detailed DTR snapshots — attendance figures for some employees couldn't be
          restored and start blank. Re-enter them on the next step before saving.
        </Alert>
      )}

      {/* ── STEP 1: PERIOD SETUP ──────────────────────────────────────────────── */}
      {step === 0 && (
        <Paper sx={{ p: 3, borderRadius: 2, maxWidth: 500 }}>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Select Pay Period</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Period Start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Period End" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Pay Date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />

            <Divider sx={{ my: 0.5 }} />
            <Typography variant="body2" fontWeight={600}>Funded By</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
              Applies to this run's office-staff overhead sync on approval (salaries + employer gov't contributions). Link it to an Investment Tracker entry the same way an out-of-pocket expense is linked.
            </Typography>
            <TextField select label="Paid From" value={fundingType} fullWidth
              onChange={(e) => { const v = e.target.value as 'corporate_bank' | 'investor_outofpocket'; setFundingType(v); if (v !== 'investor_outofpocket') { setFundingInvestor(''); setLinkedInvestmentId(''); setLinkedInvestments([]); } }}>
              <MenuItem value="corporate_bank">Corporate Bank Account</MenuItem>
              <MenuItem value="investor_outofpocket">Investor (Out-of-Pocket)</MenuItem>
            </TextField>
            {fundingType === 'investor_outofpocket' && (
              <TextField select label="Investor" value={fundingInvestor} fullWidth onChange={(e) => handleFundingInvestorChange(e.target.value)}>
                <MenuItem value="">— Select investor —</MenuItem>
                {INVESTORS.map((inv) => <MenuItem key={inv} value={inv}>{inv}</MenuItem>)}
              </TextField>
            )}
            {fundingType === 'investor_outofpocket' && fundingInvestor && linkedInvestments.length > 0 && (
              <TextField select label="Link to Existing Investment (Optional)" value={linkedInvestmentId} fullWidth onChange={(e) => setLinkedInvestmentId(e.target.value)}>
                <MenuItem value="">— New investment entry —</MenuItem>
                {linkedInvestments.map((inv) => (
                  <MenuItem key={inv.id} value={inv.id}>
                    {inv.date} · {inv.category} · {inv.description || '—'} · {fmt(inv.amount)}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
              <Button onClick={onCancel}>Cancel</Button>
              <Button variant="contained" onClick={handleNextStep1} disabled={loadingEmps} sx={{ bgcolor: '#2853c0' }}>
                {loadingEmps ? <CircularProgress size={20} /> : 'Next'}
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── STEP 2: SELECT EMPLOYEES ──────────────────────────────────────────── */}
      {step === 1 && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} mb={1}>
            Who was active for {periodStart} – {periodEnd}?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Untick anyone who wasn't employed during this pay period (e.g. hired later, or already left). This matters most when backfilling past runs.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <Button size="small" onClick={() => setSelectedIds(new Set(allEmployees.map((e) => e.id)))}>Select All</Button>
            <Button size="small" onClick={() => setSelectedIds(new Set())}>Clear All</Button>
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center', ml: 1 }}>
              {selectedIds.size} of {allEmployees.length} selected
            </Typography>
          </Box>
          <TableContainer component={Paper} sx={{ borderRadius: 2, mb: 2 }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#2c3242' }}>
                <TableRow>
                  {['', 'Employee', 'Type', 'Designation', 'Date Hired', 'Status', 'Remittances'].map((h) => (
                    <TableCell key={h} sx={{ color: 'white', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {allEmployees.map((emp) => {
                  const hiredAfterPeriod = !!emp.dateHired && emp.dateHired > periodEnd;
                  const offAgencies = [
                    emp.sssEnabled === false && 'SSS',
                    emp.philhealthEnabled === false && 'PhilHealth',
                    emp.pagibigEnabled === false && 'Pag-IBIG',
                    emp.withholdingTaxEnabled === false && 'Tax',
                  ].filter(Boolean) as string[];
                  return (
                    <TableRow key={emp.id} sx={hiredAfterPeriod && selectedIds.has(emp.id) ? { bgcolor: '#fff3e0' } : undefined}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.has(emp.id)}
                          onChange={() => toggleSelected(emp.id)}
                          sx={{ color: '#2853c0', '&.Mui-checked': { color: '#2853c0' } }}
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{emp.name}</TableCell>
                      <TableCell>{emp.employeeType}</TableCell>
                      <TableCell>{emp.designation}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {emp.dateHired || '—'}
                        {hiredAfterPeriod && (
                          <Chip label="hired after period end" size="small" color="warning" sx={{ ml: 1 }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip label={emp.isActive ? 'Active' : 'Inactive'} size="small" color={emp.isActive ? 'success' : 'default'} />
                      </TableCell>
                      <TableCell>
                        {offAgencies.length === 0 ? (
                          <Chip label="Standard" size="small" color="success" variant="outlined" />
                        ) : (
                          <Chip label={`${offAgencies.join(', ')} off`} size="small" color="warning" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button variant="contained" onClick={handleNextSelection} sx={{ bgcolor: '#2853c0' }}>Next</Button>
          </Box>
        </Box>
      )}

      {/* ── STEP 3: DTR ENTRY ──────────────────────────────────────────────────── */}
      {step === 2 && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>
            DTR Entry — {employees.length} selected employee(s)
          </Typography>
          <TableContainer component={Paper} sx={{ borderRadius: 2, mb: 2, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#2c3242' }}>
                <TableRow>
                  {['Employee', 'Day Type', 'Work Days', 'Reg Hrs', 'OT Hrs', 'Rest Day OT', 'Hol OT', 'Reg Hol Rest OT', 'Spl Hol Rest OT', 'Night Diff Hrs', 'Tardiness (min)', 'Reg Hol Days', 'Reg Hol Rest Days', 'Spl Hol Days', 'Spl Hol Rest Days'].map((h) => (
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
                    {(['workingDays', 'regularHours', 'overtimeHours', 'restDayOTHours', 'regularHolidayOTHours', 'regularHolidayRestDayOTHours', 'specialHolidayRestDayOTHours', 'nightDiffHours', 'tardinessMinutes', 'regularHolidayDays', 'regularHolidayRestDayDays', 'specialHolidayDays', 'specialHolidayRestDayDays'] as (keyof DTRInput)[]).map((field) => (
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
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Count each calendar day under exactly one holiday/rest-day column (e.g. a regular holiday worked on a rest day goes in "Reg Hol Rest Days" only, not also "Reg Hol Days") to avoid double-paying the same day.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button variant="contained" onClick={handleNextStep2} sx={{ bgcolor: '#2853c0' }}>Preview</Button>
          </Box>
        </Box>
      )}

      {/* ── STEP 4: PREVIEW & ADJUSTMENTS ─────────────────────────────────────── */}
      {step === 3 && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Preview & Adjustments</Typography>
          {isEditMode && editRun && editRun.status !== 'DRAFT' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Saving resets this run to Draft (currently {editRun.status}) and re-syncs any office-staff overhead
              expenses. Re-approve — and re-mark as paid, if applicable — from here or the register list afterward.
            </Alert>
          )}
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
            <Button onClick={() => setStep(2)}>Back</Button>
            <Button variant="contained" onClick={handleSaveDraft} disabled={saving} sx={{ bgcolor: '#2853c0' }}>
              {saving ? <CircularProgress size={20} /> : isEditMode ? 'Save Changes' : 'Save as Draft'}
            </Button>
          </Box>
        </Box>
      )}

      {/* ── STEP 5: APPROVE & LOCK ─────────────────────────────────────────────── */}
      {step === 4 && createdRun && (
        <Paper sx={{ p: 4, borderRadius: 2, maxWidth: 600 }}>
          <Typography variant="h6" fontWeight={700} mb={2}>Approve & Lock Payroll Run</Typography>
          <Box sx={{ mb: 2 }}>
            <Typography><strong>Period:</strong> {createdRun.periodStart} – {createdRun.periodEnd}</Typography>
            <Typography><strong>Pay Date:</strong> {createdRun.payDate}</Typography>
            <Typography><strong>Employees:</strong> {payslips.length}</Typography>
            <Typography>
              <strong>Funded By:</strong>{' '}
              {createdRun.fundingSource?.type === 'investor_outofpocket'
                ? `${createdRun.fundingSource.investor} (Out-of-Pocket)${createdRun.fundingSource.linkedInvestmentId ? ' — linked to existing investment' : ''}`
                : 'Corporate Bank Account'}
            </Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 4, mb: 3 }}>
            <Typography>Gross: <strong>{fmt(totalGross)}</strong></Typography>
            <Typography>Deductions: <strong>{fmt(totalDeductions)}</strong></Typography>
            <Typography>Net Pay: <strong style={{ color: '#2853c0' }}>{fmt(totalNetPay)}</strong></Typography>
          </Box>
          <Alert severity="warning" sx={{ mb: 3 }}>
            Approving this run locks its figures for normal use. Only a superadmin can edit or delete it afterward.
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
