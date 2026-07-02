import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Button,
  Alert,
} from '@mui/material';
import {
  Paid as PaidIcon,
  AccountBalanceWallet as ReceiptIcon,
  TrendingUp as TrendingUpIcon,
  Payments as PaymentsIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { isPayrollAuthorized } from '../../config/payrollAccess';
import { API_BASE } from '../../config/api';
import { ProjectInvoice, getInvoiceStatus } from '../../types/Invoice';
import { PayrollRun } from '../../types/Payroll';
import { getPayrollRuns } from '../../utils/firebasePayroll';

const NET_PACIFIC_COLORS = {
  primary:   '#2c5aa0',
  secondary: '#1e4a72',
  accent1:   '#4f7bc8',
  accent2:   '#3c6ba5',
  success:   '#00b894',
  warning:   '#fdcb6e',
  error:     '#e84393',
  info:      '#74b9ff',
};

const API = `${API_BASE}/api`;

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface InvestmentRecord {
  amount: number;
}

interface ModuleCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
}

const FinanceHomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const payrollAllowed = isPayrollAuthorized(user?.role);

  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);
  const [investmentTarget, setInvestmentTarget] = useState<number | null>(null);
  const [latestRun, setLatestRun] = useState<PayrollRun | null>(null);
  const [error, setError] = useState('');
  const [totalExpensesYtd, setTotalExpensesYtd] = useState(0);
  const [pendingReimbursements, setPendingReimbursements] = useState(0);
  const [outstandingCA, setOutstandingCA] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('netpacific_token') || '';
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    fetch(`${API}/invoices`)
      .then(r => { if (!r.ok) throw new Error('invoices'); return r.json(); })
      .then(setInvoices)
      .catch(() => setError('Some figures could not be loaded.'));

    fetch(`${API}/investments`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => { if (data.success) setInvestments(data.investments || []); })
      .catch(() => setError('Some figures could not be loaded.'));

    fetch(`${API}/investments/target`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => { if (data.success) setInvestmentTarget(data.target); })
      .catch(() => { /* target is a caption only */ });

    if (isPayrollAuthorized(user?.role)) {
      getPayrollRuns()
        .then(runs => {
          if (runs.length === 0) return;
          const sorted = [...runs].sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || ''));
          setLatestRun(sorted[0]);
        })
        .catch(() => { /* payroll card simply shows no run */ });
    }

    const year = new Date().getFullYear();
    Promise.all([
      fetch(`${API}/project-expenses/summary?year=${year}`, { headers: authHeaders })
        .then(r => r.json())
        .then(d => (d && d.success ? Number(d.total) || 0 : 0))
        .catch(() => 0),
      fetch(`${API}/overhead-expenses/summary?year=${year}`, { headers: authHeaders })
        .then(r => r.json())
        .then(d => (d && d.success ? Number(d.total) || 0 : 0))
        .catch(() => 0),
    ])
      .then(([projectTotal, overheadTotal]) => setTotalExpensesYtd(projectTotal + overheadTotal))
      .catch(() => { /* expenses KPI optional */ });

    fetch(`${API}/cash-advances`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const out = (data.cash_advances || []).reduce(
            (s: number, ca: any) => s + Math.max(0, Number(ca.balance_remaining) || 0), 0);
          setOutstandingCA(out);
        }
      })
      .catch(() => { /* CA KPI optional */ });

    if (user?.role === 'superadmin' || user?.role === 'admin') {
      fetch(`${API}/reimbursements`, { headers: authHeaders })
        .then(r => r.json())
        .then(data => { if (data.success) setPendingReimbursements((data.reimbursements || []).length); })
        .catch(() => { /* reimbursements KPI optional */ });
    }
  }, [user?.username, user?.role]);

  const arSummary = useMemo(() => {
    const enriched = invoices.map(inv => ({
      status: getInvoiceStatus(inv),
      outstanding: Math.max(0, inv.amount - inv.amount_collected),
    }));
    const outstanding = enriched.filter(i => i.status !== 'paid').reduce((s, i) => s + i.outstanding, 0);
    const overdueAmount = enriched.filter(i => i.status === 'overdue').reduce((s, i) => s + i.outstanding, 0);
    const overdueCount = enriched.filter(i => i.status === 'overdue').length;
    const openCount = enriched.filter(i => i.status !== 'paid').length;
    return { outstanding, overdueAmount, overdueCount, openCount };
  }, [invoices]);

  const totalInvested = useMemo(
    () => investments.reduce((s, i) => s + (i.amount || 0), 0),
    [investments]
  );

  const modules: ModuleCard[] = [
    {
      title: 'Collections & AR',
      description: 'Track invoices, due dates, and record collections per project.',
      icon: <PaidIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
      path: '/finance/collections',
    },
    {
      title: 'Expense Monitoring',
      description: 'Project expenses, cash advances, liquidations, and direct labor.',
      icon: <ReceiptIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
      path: '/finance/expense-monitoring',
    },
    {
      title: 'Investment Tracker',
      description: 'Capital contributions and the investment ledger.',
      icon: <TrendingUpIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
      path: '/finance/investment-tracker',
    },
    ...(payrollAllowed
      ? [{
          title: 'Payroll',
          description: 'Employees, payroll runs, DTR, and payslips.',
          icon: <PaymentsIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
          path: '/finance/payroll',
        }]
      : []),
    ...(isAdmin
      ? [{
          title: 'Reimbursements',
          description: 'Review and mark out-of-pocket liquidation claims as reimbursed.',
          icon: <ReceiptIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
          path: '/finance/reimbursements',
        }]
      : []),
  ];

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Finance
        </Typography>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 1.5 }}>{error}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* AR Outstanding */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>AR Outstanding</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatPHP(arSummary.outstanding)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {arSummary.openCount} open invoice{arSummary.openCount === 1 ? '' : 's'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* AR Overdue — red when > 0, yellow when clear */}
        <Grid size={{ xs: 6, sm: 3 }}>
          {arSummary.overdueCount > 0 ? (
            <Card sx={{ background: 'linear-gradient(135deg, #e53935 0%, #ef9a9a 100%)', color: 'white' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>AR Overdue</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                  {formatPHP(arSummary.overdueAmount)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {arSummary.overdueCount} overdue invoice{arSummary.overdueCount === 1 ? '' : 's'}
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>AR Overdue</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                  {formatPHP(0)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>No overdue invoices</Typography>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Total Investments */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Investments</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatPHP(totalInvested)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {investmentTarget != null ? `Target ${formatPHP(investmentTarget)}` : 'Capital contributions'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Latest Payroll Run — only for authorized users */}
        {payrollAllowed && (
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Latest Payroll Run</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                  {latestRun ? latestRun.status : '—'}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {latestRun
                    ? `${latestRun.periodStart?.slice(0, 10)} – ${latestRun.periodEnd?.slice(0, 10)}`
                    : 'No runs yet'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Total Expenses (YTD) */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent1} 0%, ${NET_PACIFIC_COLORS.accent2} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Expenses (YTD)</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{formatPHP(totalExpensesYtd)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{`Year ${new Date().getFullYear()}`}</Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Outstanding Cash Advances */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Outstanding Cash Advances</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{formatPHP(outstandingCA)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Unliquidated balances</Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Pending Reimbursements — admin only */}
        {isAdmin && (
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Pending Reimbursements</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{pendingReimbursements}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>Awaiting payout</Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      <Grid container spacing={1.5}>
        {modules.map((m) => (
          <Grid key={m.path} size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper sx={{
              borderRadius: 2,
              overflow: 'hidden',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid #e2e8f0',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 1 }}>
                {m.icon}
                <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                  {m.title}
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 1.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {m.description}
                </Typography>
                <Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => navigate(m.path)}
                    sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
                  >
                    Open
                  </Button>
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default FinanceHomePage;
