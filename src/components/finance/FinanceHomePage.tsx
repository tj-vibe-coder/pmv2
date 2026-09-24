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
  Stack,
} from '@mui/material';
import {
  Paid as PaidIcon,
  AccountBalanceWallet as ExpenseWalletIcon,
  Receipt as ExpenseRegisterIcon,
  TrendingUp as TrendingUpIcon,
  Payments as PaymentsIcon,
  AssignmentTurnedIn as LiquidationIcon,
  Description as SoaIcon,
  AutoAwesome as AnalyticsIcon,
  Summarize as PnLIcon,
  MenuBook as TaxLedgerIcon,
  FactCheck as EwtIcon,
  PriceCheck as ReimbursementIcon,
  Engineering as LaborIcon,
  RequestQuote as CaIcon,
  ShoppingCart as PoIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { isPayrollAuthorized } from '../../config/payrollAccess';
import { API_BASE } from '../../config/api';
import { ProjectInvoice, getInvoiceStatus, invoiceOutstanding } from '../../types/Invoice';
import { Project } from '../../types/Project';
import { buildActiExpectedQueue, splitActiExpectedQueue } from '../../utils/commercialTrail';
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
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('netpacific_token') || '';
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    fetch(`${API}/invoices`)
      .then(r => { if (!r.ok) throw new Error('invoices'); return r.json(); })
      .then(setInvoices)
      .catch(() => setError('Some figures could not be loaded.'));

    fetch(`${API}/projects`)
      .then(r => { if (!r.ok) throw new Error('projects'); return r.json(); })
      .then((rows: Project[]) => setProjects(Array.isArray(rows) ? rows : []))
      .catch(() => { /* expected-from-ACTI KPI optional */ });

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
      outstanding: invoiceOutstanding(inv),
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

  const actiExpectedQueue = useMemo(() => {
    return buildActiExpectedQueue(projects, invoices);
  }, [projects, invoices]);

  const { pendingAr: actiPendingAr, ongoing: actiOngoing } = useMemo(
    () => splitActiExpectedQueue(actiExpectedQueue),
    [actiExpectedQueue],
  );

  const actiPendingArTotal = useMemo(
    () => actiPendingAr.reduce((s, r) => s + r.expectedAmount, 0),
    [actiPendingAr],
  );
  const actiOngoingTotal = useMemo(
    () => actiOngoing.reduce((s, r) => s + r.expectedAmount, 0),
    [actiOngoing],
  );

  // Grouped Modules
  const receivablesModules: ModuleCard[] = [
    {
      title: 'Collections & AR',
      description: 'Track invoices, aging schedules, and record cash collections per project.',
      icon: <PaidIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
      path: '/finance/collections',
    },
    ...(user?.role !== 'tax_filer'
      ? [
          {
            title: 'Statements of Account',
            description: 'Consolidated statements for partner ACTI and client subcontractor billings.',
            icon: <SoaIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
            path: '/finance/soa',
          },
        ]
      : []),
  ];

  const outflowModules: ModuleCard[] =
    user?.role === 'tax_filer'
      ? []
      : [
          {
            title: 'Expense Register',
            description: 'Unified project & overhead expense tracker with receipt proof and PO sync.',
            icon: <ExpenseRegisterIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
            path: '/finance/expense-monitoring',
          },
          {
            title: 'Purchase Orders',
            description: 'Review and manage supplier purchase orders, procurement commitments, and item orders.',
            icon: <PoIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
            path: '/finance/purchase-order',
          },
          {
            title: 'Cash Advances (CA)',
            description: 'Issue, track, and monitor cash advances and unliquidated balances.',
            icon: <CaIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
            path: '/finance/expense-monitoring/ca-form',
          },
          {
            title: 'Liquidation Form',
            description: 'Submit, review, and print liquidation reports for advances and project expenses.',
            icon: <LiquidationIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
            path: '/finance/expense-monitoring/liquidation-form',
          },
          ...(isAdmin
            ? [
                {
                  title: 'Reimbursements',
                  description: 'Review and mark out-of-pocket liquidation claims as reimbursed.',
                  icon: <ReimbursementIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
                  path: '/finance/reimbursements',
                },
              ]
            : []),
          {
            title: 'Direct Labor',
            description: 'Track direct field labor logs, payroll distributions, and man-hours.',
            icon: <LaborIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
            path: '/finance/expense-monitoring/direct-labor',
          },
        ];

  const intelligenceModules: ModuleCard[] = [
    ...(user?.role !== 'tax_filer'
      ? [
          {
            title: 'Finance Analytics',
            description: 'Visual charts, recurring run-rate forecasting, and CA/SOA formulation studio.',
            icon: <AnalyticsIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
            path: '/finance/analytics',
          },
        ]
      : []),
    {
      title: 'Tax Filer Ledger',
      description: 'Consolidated BIR substantiation audit ledger for expenses and payroll.',
      icon: <TaxLedgerIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
      path: '/finance/tax-ledger',
    },
    {
      title: 'Sales EWT / 2307',
      description: 'Customer 2307 withholding certificates register and tax credit monitoring.',
      icon: <EwtIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
      path: '/finance/ewt-2307',
    },
    ...(user?.role === 'superadmin'
      ? [{
          title: 'Profit & Loss',
          description: 'Company income statement, gross margin, overhead, and net profitability.',
          icon: <PnLIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
          path: '/finance/pnl',
        }]
      : []),
    ...(user?.role !== 'tax_filer'
      ? [{
          title: 'Investment Tracker',
          description: 'Capital contributions and the shareholder equity investment ledger.',
          icon: <TrendingUpIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
          path: '/finance/investment-tracker',
        }]
      : []),
    ...(payrollAllowed
      ? [{
          title: 'Payroll',
          description: 'Employees, payroll runs, DTR, and payslips.',
          icon: <PaymentsIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
          path: '/finance/payroll',
        }]
      : []),
  ];

  return (
    <Box sx={{ height: '100%', overflow: 'auto', pb: 4 }}>
      {/* Header & Quick Action Shortcuts */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            Finance Hub
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Overview, executive indicators, receivables, disbursements, and compliance
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          {user?.role !== 'tax_filer' && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<SoaIcon />}
              onClick={() => navigate('/finance/soa')}
              sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary, fontWeight: 600 }}
            >
              Statements of Account
            </Button>
          )}
          {user?.role !== 'tax_filer' && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<CaIcon />}
              onClick={() => navigate('/finance/expense-monitoring/ca-form')}
              sx={{ borderColor: NET_PACIFIC_COLORS.accent1, color: NET_PACIFIC_COLORS.accent1, fontWeight: 600 }}
            >
              Cash Advance
            </Button>
          )}
          {user?.role !== 'tax_filer' && (
            <Button
              variant="contained"
              size="small"
              startIcon={<LiquidationIcon />}
              onClick={() => navigate('/finance/expense-monitoring/liquidation-form')}
              sx={{ bgcolor: NET_PACIFIC_COLORS.primary, '&:hover': { bgcolor: NET_PACIFIC_COLORS.secondary }, fontWeight: 600 }}
            >
              Liquidation Form
            </Button>
          )}
          {user?.role === 'tax_filer' && (
            <>
              <Button
                variant="contained"
                size="small"
                startIcon={<TaxLedgerIcon />}
                onClick={() => navigate('/finance/tax-ledger')}
                sx={{ bgcolor: NET_PACIFIC_COLORS.primary, '&:hover': { bgcolor: NET_PACIFIC_COLORS.secondary }, fontWeight: 600 }}
              >
                Tax Filer Ledger
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<EwtIcon />}
                onClick={() => navigate('/finance/ewt-2307')}
                sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary, fontWeight: 600 }}
              >
                Sales EWT / 2307
              </Button>
            </>
          )}
        </Stack>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {/* KPI Cards Grid */}
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {/* AR Outstanding */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`,
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
            }}
            onClick={() => navigate('/finance/collections?tab=receivables')}
          >
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>AR Outstanding</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatPHP(arSummary.outstanding)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {arSummary.openCount} open invoice{arSummary.openCount === 1 ? '' : 's'} · View Receivables →
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* AR Overdue */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {arSummary.overdueCount > 0 ? (
            <Card
              sx={{
                background: 'linear-gradient(135deg, #e53935 0%, #ef9a9a 100%)',
                color: 'white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
              }}
              onClick={() => navigate('/finance/collections?tab=receivables')}
            >
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>AR Overdue</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                  {formatPHP(arSummary.overdueAmount)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {arSummary.overdueCount} overdue invoice{arSummary.overdueCount === 1 ? '' : 's'} · View →
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

        {/* ACTI Pending AR */}
        {user?.role !== 'tax_filer' && actiPendingAr.length > 0 && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              sx={{
                background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`,
                color: 'white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
              }}
              onClick={() => navigate('/finance/collections?tab=acti')}
            >
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>ACTI pending AR</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                  {formatPHP(actiPendingArTotal)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {actiPendingAr.length} completed · no invoice yet · View →
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* ACTI Ongoing */}
        {user?.role !== 'tax_filer' && actiOngoing.length > 0 && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              sx={{
                background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent2} 0%, ${NET_PACIFIC_COLORS.secondary} 100%)`,
                color: 'white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
              }}
              onClick={() => navigate('/finance/collections?tab=acti')}
            >
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>ACTI ongoing, no PO</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                  {formatPHP(actiOngoingTotal)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {actiOngoing.length} in progress · watchlist · View →
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Total Expenses (YTD) */}
        {user?.role !== 'tax_filer' && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              sx={{
                background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent1} 0%, ${NET_PACIFIC_COLORS.accent2} 100%)`,
                color: 'white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
              }}
              onClick={() => navigate('/finance/expense-monitoring')}
            >
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Expenses (YTD)</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{formatPHP(totalExpensesYtd)}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>{`Year ${new Date().getFullYear()} · View Register →`}</Typography>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Outstanding Cash Advances */}
        {user?.role !== 'tax_filer' && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              sx={{
                background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`,
                color: 'white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
              }}
              onClick={() => navigate('/finance/expense-monitoring/liquidation-form')}
            >
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Outstanding Cash Advances</Typography>
                  <LiquidationIcon sx={{ fontSize: 18, opacity: 0.8 }} />
                </Box>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{formatPHP(outstandingCA)}</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>Unliquidated balances</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, textDecoration: 'underline', opacity: 0.95 }}>
                    Liquidate →
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Pending Reimbursements */}
        {isAdmin && user?.role !== 'tax_filer' && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              sx={{
                background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`,
                color: '#2d3436',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
              }}
              onClick={() => navigate('/finance/reimbursements')}
            >
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Pending Reimbursements</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{pendingReimbursements}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>Awaiting payout · Review →</Typography>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Total Investments */}
        {user?.role !== 'tax_filer' && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              sx={{
                background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`,
                color: 'white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
              }}
              onClick={() => navigate('/finance/investment-tracker')}
            >
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Investments</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                  {formatPHP(totalInvested)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {investmentTarget != null ? `Target ${formatPHP(investmentTarget)} · Ledger →` : 'Capital contributions · Ledger →'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Latest Payroll Run */}
        {payrollAllowed && user?.role !== 'tax_filer' && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              sx={{
                background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`,
                color: 'white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
              }}
              onClick={() => navigate('/finance/payroll')}
            >
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Latest Payroll Run</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                  {latestRun ? latestRun.status : '—'}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {latestRun
                    ? `${latestRun.periodStart?.slice(0, 10)} – ${latestRun.periodEnd?.slice(0, 10)} · Manage →`
                    : 'Manage Payroll →'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* --- Section 1: Inflow & Receivables --- */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, color: NET_PACIFIC_COLORS.secondary, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PaidIcon fontSize="small" sx={{ color: NET_PACIFIC_COLORS.primary }} /> Inflow & Receivables
        </Typography>
        <Grid container spacing={1.5}>
          {receivablesModules.map((m) => (
            <Grid key={m.path} size={{ xs: 12, sm: 6, md: 4 }}>
              <Paper sx={{
                borderRadius: 2,
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                border: '1px solid #e2e8f0',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow 0.15s ease-in-out',
                '&:hover': { boxShadow: 2 },
              }}>
                <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 1 }}>
                  {m.icon}
                  <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
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

      {/* --- Section 2: Outflow & Expense Operations --- */}
      {user?.role !== 'tax_filer' && outflowModules.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, color: NET_PACIFIC_COLORS.secondary, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ExpenseWalletIcon fontSize="small" sx={{ color: NET_PACIFIC_COLORS.primary }} /> Outflow & Expense Operations
          </Typography>
          <Grid container spacing={1.5}>
            {outflowModules.map((m) => (
              <Grid key={m.path} size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper sx={{
                  borderRadius: 2,
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  border: '1px solid #e2e8f0',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'box-shadow 0.15s ease-in-out',
                  '&:hover': { boxShadow: 2 },
                }}>
                  <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 1 }}>
                    {m.icon}
                    <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
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
      )}

      {/* --- Section 3: Financial Intelligence & Accounting --- */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, color: NET_PACIFIC_COLORS.secondary, display: 'flex', alignItems: 'center', gap: 1 }}>
          <AnalyticsIcon fontSize="small" sx={{ color: NET_PACIFIC_COLORS.primary }} /> Financial Intelligence & Compliance
        </Typography>
        <Grid container spacing={1.5}>
          {intelligenceModules.map((m) => (
            <Grid key={m.path} size={{ xs: 12, sm: 6, md: 4 }}>
              <Paper sx={{
                borderRadius: 2,
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                border: '1px solid #e2e8f0',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow 0.15s ease-in-out',
                '&:hover': { boxShadow: 2 },
              }}>
                <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 1 }}>
                  {m.icon}
                  <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
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
    </Box>
  );
};

export default FinanceHomePage;
