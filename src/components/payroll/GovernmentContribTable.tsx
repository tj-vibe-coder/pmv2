import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, MenuItem, TextField,
  CircularProgress, Alert,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { getPayrollRuns, getPayslipsForRun } from '../../utils/firebasePayroll';
import { PayrollRun, Payslip } from '../../types/Payroll';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

const GovernmentContribTable: React.FC = () => {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlips, setLoadingSlips] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPayrollRuns()
      .then((r) => { setRuns(r); if (r.length > 0) setSelectedRunId(r[0].id); })
      .catch(() => setError('Failed to load runs.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    setLoadingSlips(true);
    getPayslipsForRun(selectedRunId)
      .then(setPayslips)
      .catch(() => setError('Failed to load payslips.'))
      .finally(() => setLoadingSlips(false));
  }, [selectedRunId]);

  const totals = payslips.reduce(
    (acc, s) => ({
      empSSS: acc.empSSS + s.empSSS,
      erSSS: acc.erSSS + s.erSSS,
      empPH: acc.empPH + s.empPhilhealth,
      erPH: acc.erPH + s.erPhilhealth,
      empPI: acc.empPI + s.empPagibig,
      erPI: acc.erPI + s.erPagibig,
    }),
    { empSSS: 0, erSSS: 0, empPH: 0, erPH: 0, empPI: 0, erPI: 0 }
  );

  const exportCSV = () => {
    const headers = ['Employee', 'SSS (Emp)', 'SSS (Er)', 'SSS Total', 'PhilHealth (Emp)', 'PhilHealth (Er)', 'PH Total', 'Pag-IBIG (Emp)', 'Pag-IBIG (Er)', 'PI Total'];
    const rows = payslips.map((s) => [
      s.employeeSnapshot?.name,
      s.empSSS.toFixed(2), s.erSSS.toFixed(2), (s.empSSS + s.erSSS).toFixed(2),
      s.empPhilhealth.toFixed(2), s.erPhilhealth.toFixed(2), (s.empPhilhealth + s.erPhilhealth).toFixed(2),
      s.empPagibig.toFixed(2), s.erPagibig.toFixed(2), (s.empPagibig + s.erPagibig).toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gov-remittances-${selectedRunId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" fontWeight={600}>Government Remittances</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField select size="small" value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)} sx={{ minWidth: 220 }}>
            {runs.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.periodStart} – {r.periodEnd} ({r.status})
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportCSV} disabled={payslips.length === 0}>
            Export CSV
          </Button>
        </Box>
      </Box>

      {loadingSlips ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#2c3242' }}>
              <TableRow>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Employee</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }} align="right">SSS (Emp)</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }} align="right">SSS (Er)</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }} align="right">SSS Total</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }} align="right">PhilHealth (Emp)</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }} align="right">PhilHealth (Er)</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }} align="right">Pag-IBIG (Emp)</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }} align="right">Pag-IBIG (Er)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payslips.map((s) => (
                <TableRow key={s.employeeId} hover>
                  <TableCell>{s.employeeSnapshot?.name}</TableCell>
                  <TableCell align="right">{fmt(s.empSSS)}</TableCell>
                  <TableCell align="right">{fmt(s.erSSS)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(s.empSSS + s.erSSS)}</TableCell>
                  <TableCell align="right">{fmt(s.empPhilhealth)}</TableCell>
                  <TableCell align="right">{fmt(s.erPhilhealth)}</TableCell>
                  <TableCell align="right">{fmt(s.empPagibig)}</TableCell>
                  <TableCell align="right">{fmt(s.erPagibig)}</TableCell>
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow sx={{ bgcolor: '#f5f7fa' }}>
                <TableCell sx={{ fontWeight: 700 }}>TOTAL</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.empSSS)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.erSSS)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#2853c0' }}>{fmt(totals.empSSS + totals.erSSS)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.empPH)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.erPH)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.empPI)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.erPI)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default GovernmentContribTable;
