import React, { useEffect, useState } from 'react';
import {
  Box, Grid, Paper, Typography, Tab, Tabs, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody,
} from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PaymentsIcon from '@mui/icons-material/Payments';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getEmployees, getPayrollRuns, getPayslipsForRun } from '../../utils/firebasePayroll';
import { Payslip } from '../../types/Payroll';
import PayrollRegister from './PayrollRegister';
import EmployeeList from './EmployeeList';
import PayrollRunForm from './PayrollRunForm';
import GovernmentContribTable from './GovernmentContribTable';
import PayslipCard from './PayslipCard';
import PayrollSettings from './PayrollSettings';
import HolidayManager from './HolidayManager';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(n);

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}
const KPICard: React.FC<KPICardProps> = ({ icon, label, value, color }) => (
  <Paper sx={{ p: 3, borderRadius: 2, borderLeft: `4px solid ${color}` }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box sx={{ color, fontSize: 36 }}>{icon}</Box>
      <Box>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h6" fontWeight={700}>{value}</Typography>
      </Box>
    </Box>
  </Paper>
);

type TabView = 'register' | 'employees' | 'new_run' | 'view_run' | 'gov_contrib' | 'holidays' | 'settings';

const PayrollDashboard: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [view, setView] = useState<TabView>('register');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [kpi, setKpi] = useState({ employees: 0, gross: 0, remittances: 0, netPay: 0 });
  const [pieData, setPieData] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadKpi = async () => {
      try {
        const [emps, runs] = await Promise.all([getEmployees(), getPayrollRuns()]);
        const latestApproved = runs.find((r) => r.status === 'APPROVED' || r.status === 'PAID');
        let gross = 0, remit = 0, net = 0;
        let basic = 0, ot = 0, allowances = 0, deductions = 0;
        if (latestApproved) {
          const slips = await getPayslipsForRun(latestApproved.id);
          slips.forEach((s) => {
            gross += s.grossPay;
            remit += s.empSSS + s.empPhilhealth + s.empPagibig + s.erSSS + s.erPhilhealth + s.erPagibig;
            net += s.netPay;
            basic += s.basicPay;
            ot += s.otPayRegular + s.otPayRestDay + s.otPayRegularHoliday;
            allowances += s.mealAllowance;
            deductions += s.totalDeductions;
          });
        }
        setKpi({ employees: emps.filter((e) => e.isActive).length, gross, remittances: remit, netPay: net });
        setPieData([
          { name: 'Basic Pay', value: basic },
          { name: 'Overtime', value: ot },
          { name: 'Allowances', value: allowances },
          { name: 'Deductions', value: deductions },
        ].filter((d) => d.value > 0));
      } catch { /* non-critical */ }
      finally { setLoading(false); }
    };
    loadKpi();
  }, []);

  const PIE_COLORS = ['#2853c0', '#4f7bc8', '#82b1ff', '#f44336'];

  const TAB_VIEWS: TabView[] = ['register', 'employees', 'gov_contrib', 'holidays', 'settings'];

  const handleTabChange = (_: React.SyntheticEvent, val: number) => {
    setTab(val);
    setView(TAB_VIEWS[val] ?? 'register');
    setSelectedRunId(null);
    setSelectedPayslip(null);
  };

  if (selectedPayslip) {
    return <PayslipCard payslip={selectedPayslip} onBack={() => setSelectedPayslip(null)} />;
  }

  if (view === 'new_run') {
    return <PayrollRunForm
      onComplete={() => { setView('register'); setTab(0); }}
      onCancel={() => { setView('register'); setTab(0); }}
    />;
  }

  if (view === 'view_run' && selectedRunId) {
    return <ViewRunPayslips
      runId={selectedRunId}
      onBack={() => { setView('register'); setSelectedRunId(null); }}
      onViewPayslip={setSelectedPayslip}
    />;
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3, color: '#2c3242' }}>
        Payroll Management
      </Typography>

      {/* KPI Cards */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KPICard icon={<GroupIcon fontSize="inherit" />} label="Active Employees" value={String(kpi.employees)} color="#2853c0" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KPICard icon={<AccountBalanceWalletIcon fontSize="inherit" />} label="Latest Gross Payroll" value={fmt(kpi.gross)} color="#4caf50" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KPICard icon={<AccountBalanceIcon fontSize="inherit" />} label="Gov't Remittances Due" value={fmt(kpi.remittances)} color="#ff9800" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KPICard icon={<PaymentsIcon fontSize="inherit" />} label="Latest Net Pay" value={fmt(kpi.netPay)} color="#2196f3" />
          </Grid>
        </Grid>
      )}

      {/* Pie Chart */}
      {pieData.length > 0 && (
        <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} mb={1}>Payroll Cost Breakdown</Typography>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: { name: string; percent?: number }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {/* Tabs */}
      <Paper sx={{ borderRadius: 2 }}>
        <Tabs value={tab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }} variant="scrollable" scrollButtons="auto">
          <Tab label="Payroll Runs" />
          <Tab label="Employees" />
          <Tab label="Gov't Remittances" />
          <Tab label="Holidays" />
          <Tab label="Settings" />
        </Tabs>
        <Box sx={{ p: 3 }}>
          {tab === 0 && (
            <PayrollRegister
              onNewRun={() => setView('new_run')}
              onViewRun={(run) => { setSelectedRunId(run.id); setView('view_run'); }}
            />
          )}
          {tab === 1 && <EmployeeList />}
          {tab === 2 && <GovernmentContribTable />}
          {tab === 3 && <HolidayManager />}
          {tab === 4 && <PayrollSettings />}
        </Box>
      </Paper>
    </Box>
  );
};

// ── Inline helper: list payslips for a specific run ──────────────────────────
interface ViewRunProps {
  runId: string;
  onBack: () => void;
  onViewPayslip: (slip: Payslip) => void;
}

const ViewRunPayslips: React.FC<ViewRunProps> = ({ runId, onBack, onViewPayslip }) => {
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPayslipsForRun(runId).then(setSlips).finally(() => setLoading(false));
  }, [runId]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h6" fontWeight={600} sx={{ cursor: 'pointer', color: '#2853c0' }} onClick={onBack}>
          ← Payroll Register
        </Typography>
        <Typography variant="h6" color="text.secondary">/ Run Payslips</Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Table>
            <TableHead sx={{ bgcolor: '#2c3242' }}>
              <TableRow>
                {['Employee', 'Designation', 'Basic Pay', 'Gross Pay', 'Deductions', 'Net Pay', ''].map((h) => (
                  <TableCell key={h} sx={{ color: 'white', fontWeight: 600 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {slips.map((s) => (
                <TableRow key={s.employeeId} hover>
                  <TableCell>{s.employeeSnapshot?.name}</TableCell>
                  <TableCell>{s.employeeSnapshot?.designation}</TableCell>
                  <TableCell>{fmt(s.basicPay)}</TableCell>
                  <TableCell>{fmt(s.grossPay)}</TableCell>
                  <TableCell>{fmt(s.totalDeductions)}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#2853c0' }}>{fmt(s.netPay)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ cursor: 'pointer', color: '#2853c0', textDecoration: 'underline' }}
                      onClick={() => onViewPayslip(s)}>
                      View Payslip
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
};

export default PayrollDashboard;
