import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Table,
  TableBody,
  TableRow,
  TableCell,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Alert,
} from '@mui/material';
import { API_BASE } from '../../config/api';

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
  return '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface PnlResponse {
  success: boolean;
  year: string;
  generatedAt: string;
  revenue: number;
  revenueCollected: number;
  invoiceCount: number;
  costOfServices: number;
  grossProfit: number;
  grossMarginPct: number;
  operatingExpenses: number;
  overheadByCategory: Array<{ category: string; amount: number }>;
  operatingIncome: number;
  percentageTaxEstimate: number;
  netIncomeBeforeIncomeTax: number;
  error?: string;
}

const CURRENT_YEAR = new Date().getFullYear();

const CompanyPnLPage: React.FC = () => {
  const [year, setYear] = useState<string>(String(CURRENT_YEAR));
  const [data, setData] = useState<PnlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchPnl = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('netpacific_token');
        const res = await fetch(`${API}/finance/pnl?year=${year}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (cancelled) return;
        if (json && json.success) setData(json);
        else setError((json && json.error) || 'Failed to load P&L');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load P&L');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPnl();
    return () => { cancelled = true; };
  }, [year]);

  const years = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

  const kpiCard = (label: string, value: number, gradient: string, sub?: string) => (
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Card sx={{ background: gradient, color: 'white' }}>
        <CardContent sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>{label}</Typography>
          <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{formatPHP(value)}</Typography>
          {sub && <Typography variant="caption" sx={{ opacity: 0.85 }}>{sub}</Typography>}
        </CardContent>
      </Card>
    </Grid>
  );

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>Profit &amp; Loss</Typography>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Year</InputLabel>
          <Select label="Year" value={year} onChange={(e) => setYear(String(e.target.value))}>
            {years.map((y) => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Company-wide income statement. Revenue is IOCT&apos;s invoiced services (accrual). Non-VAT — 3% percentage tax estimated.
      </Typography>

      {loading ? (
        <LinearProgress />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : !data ? (
        <Alert severity="info">No data available.</Alert>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {kpiCard('Revenue (Accrual)', data.revenue, `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, `${data.invoiceCount} invoice${data.invoiceCount === 1 ? '' : 's'}`)}
            {kpiCard('Gross Profit', data.grossProfit, `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent2} 0%, ${NET_PACIFIC_COLORS.secondary} 100%)`, `${(data.grossMarginPct ?? 0).toFixed(1)}% margin`)}
            {kpiCard('Operating Income', data.operatingIncome, `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, ${NET_PACIFIC_COLORS.primary} 100%)`)}
            {kpiCard('Net Income (pre-tax)', data.netIncomeBeforeIncomeTax, data.netIncomeBeforeIncomeTax < 0 ? 'linear-gradient(135deg, #d32f2f 0%, #ef5350 100%)' : `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`)}
          </Grid>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Paper sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Income Statement ({data.year})</Typography>
                <Table size="small">
                  <TableBody>
                    <TableRow><TableCell>Revenue</TableCell><TableCell align="right">{formatPHP(data.revenue)}</TableCell></TableRow>
                    <TableRow><TableCell>Less: Cost of Services</TableCell><TableCell align="right">({formatPHP(data.costOfServices)})</TableCell></TableRow>
                    <TableRow><TableCell sx={{ fontWeight: 700 }}>Gross Profit ({(data.grossMarginPct ?? 0).toFixed(1)}%)</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{formatPHP(data.grossProfit)}</TableCell></TableRow>
                    <TableRow><TableCell>Less: Operating Expenses</TableCell><TableCell align="right">({formatPHP(data.operatingExpenses)})</TableCell></TableRow>
                    <TableRow><TableCell sx={{ fontWeight: 700 }}>Operating Income</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{formatPHP(data.operatingIncome)}</TableCell></TableRow>
                    <TableRow><TableCell>Less: Percentage Tax (3% est.)</TableCell><TableCell align="right">({formatPHP(data.percentageTaxEstimate)})</TableCell></TableRow>
                    <TableRow><TableCell sx={{ fontWeight: 700 }}>Net Income Before Income Tax</TableCell><TableCell align="right" sx={{ fontWeight: 700, color: data.netIncomeBeforeIncomeTax < 0 ? 'error.main' : 'inherit' }}>{data.netIncomeBeforeIncomeTax < 0 ? `(${formatPHP(Math.abs(data.netIncomeBeforeIncomeTax))})` : formatPHP(data.netIncomeBeforeIncomeTax)}</TableCell></TableRow>
                  </TableBody>
                </Table>
                <Typography variant="caption" display="block" sx={{ mt: 2 }} color="text.secondary">
                  Revenue is accrual (invoiced); {formatPHP(data.revenueCollected)} collected to date. The 3% percentage tax is estimated on collections (gross receipts).<br />
                  Revenue and cost are each recognized in the period recorded and are not matched per project, so a single year&apos;s margin can be distorted by billing/spend timing.<br />
                  Cost of Services currently excludes in-house field-labor payroll (posted in a later update), so gross margin may be overstated for projects staffed by own field crews.<br />
                  Corporate income tax (RCIT/MCIT) is estimated separately at year-end and is not included here.
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 5 }}>
              <Paper sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Operating Expenses by Category</Typography>
                <Table size="small">
                  <TableBody>
                    {!data.overheadByCategory?.length ? (
                      <TableRow><TableCell colSpan={2} align="center" sx={{ color: 'text.secondary', py: 3 }}>No overhead expenses for {data.year}.</TableCell></TableRow>
                    ) : (
                      (data.overheadByCategory ?? []).map((c) => (
                        <TableRow key={c.category}><TableCell>{c.category}</TableCell><TableCell align="right">{formatPHP(c.amount)}</TableCell></TableRow>
                      ))
                    )}
                    <TableRow><TableCell sx={{ fontWeight: 700 }}>Total</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{formatPHP(data.operatingExpenses)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
};

export default CompanyPnLPage;
