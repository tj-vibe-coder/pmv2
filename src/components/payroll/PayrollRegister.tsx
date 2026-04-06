import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Button, CircularProgress, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { PayrollRun } from '../../types/Payroll';
import { getPayrollRuns, approvePayrollRun, markRunPaid } from '../../utils/firebasePayroll';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success'> = {
  DRAFT: 'default',
  APPROVED: 'primary',
  PAID: 'success',
};

interface Props {
  onNewRun: () => void;
  onViewRun: (run: PayrollRun) => void;
}

const PayrollRegister: React.FC<Props> = ({ onNewRun, onViewRun }) => {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setRuns(await getPayrollRuns());
    } catch {
      setError('Failed to load payroll runs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (runId: string) => {
    try {
      await approvePayrollRun(runId);
      load();
    } catch { setError('Failed to approve run.'); }
  };

  const handlePaid = async (runId: string) => {
    try {
      await markRunPaid(runId);
      load();
    } catch { setError('Failed to mark run as paid.'); }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>Payroll Register</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={onNewRun}
          sx={{ bgcolor: '#2853c0' }}>
          New Payroll Run
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead sx={{ bgcolor: '#2c3242' }}>
              <TableRow>
                {['Period', 'Pay Date', 'Status', 'Created By', 'Actions'].map((h) => (
                  <TableCell key={h} sx={{ color: 'white', fontWeight: 600 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No payroll runs yet. Create your first run.
                  </TableCell>
                </TableRow>
              ) : runs.map((run) => (
                <TableRow key={run.id} hover>
                  <TableCell>
                    {fmtDate(run.periodStart)} – {fmtDate(run.periodEnd)}
                  </TableCell>
                  <TableCell>{fmtDate(run.payDate)}</TableCell>
                  <TableCell>
                    <Chip label={run.status} color={STATUS_COLORS[run.status]} size="small" />
                  </TableCell>
                  <TableCell>{run.createdBy}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => onViewRun(run)} title="View payslips">
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    {run.status === 'DRAFT' && (
                      <IconButton size="small" color="primary" onClick={() => handleApprove(run.id)} title="Approve">
                        <CheckCircleIcon fontSize="small" />
                      </IconButton>
                    )}
                    {run.status === 'APPROVED' && (
                      <Button size="small" variant="outlined" color="success"
                        onClick={() => handlePaid(run.id)} sx={{ ml: 0.5 }}>
                        Mark Paid
                      </Button>
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
};

export default PayrollRegister;
