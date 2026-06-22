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
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { ArrowBack as BackIcon } from '@mui/icons-material';
import type { Payslip } from '../../types/Payroll';
import PayslipCard from '../payroll/PayslipCard';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };
const API_BASE = '';

interface PayslipWithRun extends Payslip {
  payDate?: string;
  periodStart?: string;
  periodEnd?: string;
  runStatus?: string;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n);
}

const EmployeePayslipPage: React.FC = () => {
  const [payslips, setPayslips] = useState<PayslipWithRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  const fetchPayslips = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/payroll/my-payslips`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('Please log in again.');
        throw new Error('Failed to fetch payslips');
      }
      setPayslips(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payslips.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPayslips(); }, [fetchPayslips]);

  // Detail view
  if (selectedPayslip) {
    return (
      <Box>
        <Button
          startIcon={<BackIcon />}
          onClick={() => setSelectedPayslip(null)}
          sx={{ mb: 2, textTransform: 'none', color: NET_PACIFIC_COLORS.primary }}
        >
          Back to payslips
        </Button>
        <PayslipCard payslip={selectedPayslip} />
      </Box>
    );
  }

  // List view
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, mb: 2, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        My Payslips
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : payslips.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No payslips found.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Table size="small" sx={{ minWidth: 500 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff' }}>Pay Date</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff' }}>Period</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff' }}>Gross</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff' }}>Deductions</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff' }}>Net Pay</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff' }}>Status</TableCell>
                <TableCell sx={{ bgcolor: NET_PACIFIC_COLORS.primary }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {payslips.map((slip, i) => {
                const payDate = slip.payDate ? new Date(slip.payDate).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—';
                const period = slip.periodStart && slip.periodEnd
                  ? `${new Date(slip.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(slip.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : '—';
                const statusColor = slip.runStatus === 'PAID' ? 'success' : slip.runStatus === 'APPROVED' ? 'info' : 'default';
                return (
                  <TableRow key={`${slip.payrollRunId}-${i}`} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{payDate}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>{period}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatCurrency(slip.grossPay)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'error.main' }}>{formatCurrency(slip.totalDeductions)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{formatCurrency(slip.netPay)}</TableCell>
                    <TableCell>
                      <Chip label={slip.runStatus || 'DRAFT'} size="small" color={statusColor as 'success' | 'info' | 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        onClick={() => setSelectedPayslip(slip)}
                        sx={{ textTransform: 'none', color: NET_PACIFIC_COLORS.primary, whiteSpace: 'nowrap' }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default EmployeePayslipPage;
