import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, Chip, IconButton, Button, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { PayrollRun } from '../../types/Payroll';
import { getPayrollRuns, approvePayrollRun, markRunPaid, deletePayrollRun } from '../../utils/firebasePayroll';
import { useAuth } from '../../contexts/AuthContext';

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
  onEditRun: (run: PayrollRun) => void;
}

const PayrollRegister: React.FC<Props> = ({ onNewRun, onViewRun, onEditRun }) => {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PayrollRun | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sortKey, setSortKey] = useState<'period' | 'payDate' | 'status' | 'createdBy'>('period');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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

  const sortedRuns = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...runs].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'payDate': cmp = String(a.payDate).localeCompare(String(b.payDate)); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'createdBy': cmp = (a.createdBy || '').localeCompare(b.createdBy || ''); break;
        case 'period':
        default: cmp = String(a.periodStart).localeCompare(String(b.periodStart)); break;
      }
      return cmp * dir;
    });
  }, [runs, sortKey, sortDir]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePayrollRun(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch { setError('Failed to delete payroll run.'); }
    finally { setDeleting(false); }
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
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>{sortLabel('period', 'Period')}</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>{sortLabel('payDate', 'Pay Date')}</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>{sortLabel('status', 'Status')}</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>{sortLabel('createdBy', 'Created By')}</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No payroll runs yet. Create your first run.
                  </TableCell>
                </TableRow>
              ) : sortedRuns.map((run) => (
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
                    {isSuperadmin && (
                      <>
                        <IconButton size="small" onClick={() => onEditRun(run)} title="Edit (superadmin)">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(run)} title="Delete (superadmin)">
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

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Payroll Run?</DialogTitle>
        <DialogContent>
          <Typography>
            This permanently deletes the {deleteTarget?.status.toLowerCase()} run for{' '}
            {deleteTarget && `${fmtDate(deleteTarget.periodStart)} – ${fmtDate(deleteTarget.periodEnd)}`}, all its payslips,
            and — if it was approved or paid — reverses the overhead expense entries it posted to the company P&L.
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PayrollRegister;
