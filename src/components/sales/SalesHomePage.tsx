import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Chip,
  Select,
  MenuItem,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useQuotationStore } from '../../store/quotationStore';
import type { Project, ProjectStatus, Quotation } from '../../types/Quotation';
import { projectStatusLabel } from '../../types/Quotation';
import { computeTotals, ioctMargin } from '../../utils/calcsheet/calc';

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

const statusColors: Record<ProjectStatus, 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info'> = {
  draft: 'default', for_review: 'info', sent: 'primary', won: 'success', lost: 'error', inactive: 'warning',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const compactPHP = (n: number) =>
  '₱' + new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

// Latest quotation: highest numeric revision, tiebreak most recently updated.
// Mirrors the server's newestQuotation comparator used by sync-main.
function newest(a: Quotation, b: Quotation): number {
  const ra = parseInt(a.revision || '0', 10) || 0;
  const rb = parseInt(b.revision || '0', 10) || 0;
  if (rb !== ra) return rb - ra;
  return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
}

interface EnrichedProject {
  p: Project;
  customerName: string;
  value: number;
  margin: { value: number; pct: number } | null;
  year: string;
  month: string;
  sentDate: string;
}

const chartPaperSx = {
  borderRadius: 2,
  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
  border: '1px solid #e2e8f0',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
} as const;

const headCellSx = { fontWeight: 600, fontSize: '0.875rem' } as const;
const bodyCellSx = { fontSize: '0.8rem' } as const;
const stripedRowSx = {
  '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' },
} as const;

const FunnelTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <Paper sx={{ p: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{d.stage}</Typography>
      <Typography variant="caption">
        {d.count} proposal{d.count === 1 ? '' : 's'} · {formatPHP(d.value)}
      </Typography>
    </Paper>
  );
};

const SalesHomePage: React.FC = () => {
  const projects = useQuotationStore((s) => s.projects);
  const quotations = useQuotationStore((s) => s.quotations);
  const clients = useQuotationStore((s) => s.clients);
  const initialized = useQuotationStore((s) => s.initialized);

  const currentYear = String(new Date().getFullYear());
  const [trendYear, setTrendYear] = useState<string>(currentYear);

  const enriched = useMemo<EnrichedProject[]>(() => {
    return projects.map((p) => {
      const qs = quotations.filter((q) => q.projectId === p.id);
      const latestIoct = qs.filter((q) => q.kind === 'IOCT').sort(newest)[0];
      // Headline value follows the sync-main convention: latest IOCT, fallback latest ACTI
      const headline = latestIoct ?? qs.filter((q) => q.kind === 'ACTI').sort(newest)[0];
      const customer = clients.find((c) => c.id === p.customerId);
      return {
        p,
        customerName: customer?.name ?? 'Unassigned',
        value: headline ? computeTotals(headline).grandTotal : 0,
        margin: latestIoct ? ioctMargin(computeTotals(latestIoct)) : null,
        year: (p.date || '').slice(0, 4),
        month: (p.date || '').slice(0, 7),
        sentDate: headline?.dateSent || p.date || '',
      };
    });
  }, [projects, quotations, clients]);

  const kpis = useMemo(() => {
    const open = enriched.filter((e) => e.p.status === 'draft' || e.p.status === 'for_review' || e.p.status === 'sent');
    const pipelineValue = open.reduce((s, e) => s + e.value, 0);
    const wonYtd = enriched.filter((e) => e.p.status === 'won' && e.year === currentYear);
    const wonYtdValue = wonYtd.reduce((s, e) => s + e.value, 0);
    const wonCount = enriched.filter((e) => e.p.status === 'won').length;
    const lostCount = enriched.filter((e) => e.p.status === 'lost').length;
    const winRate = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : null;
    const withMargin = enriched.filter((e) => e.margin !== null);
    const avgMarginPct = withMargin.length > 0
      ? withMargin.reduce((s, e) => s + (e.margin?.pct ?? 0), 0) / withMargin.length
      : null;
    return {
      pipelineValue,
      openCount: open.length,
      wonYtdValue,
      wonYtdCount: wonYtd.length,
      wonCount,
      lostCount,
      winRate,
      avgMarginPct,
      marginCoverage: withMargin.length,
      totalProjects: enriched.length,
    };
  }, [enriched, currentYear]);

  const yearOptions = useMemo(
    () => Array.from(new Set(enriched.map((e) => e.year).filter(Boolean))).sort().reverse(),
    [enriched]
  );

  const monthlyTrend = useMemo(() => {
    const rows = new Map<string, { draft: number; for_review: number; sent: number; won: number; lost: number }>();
    enriched
      .filter((e) => e.p.status !== 'inactive' && e.month && (trendYear === 'all' || e.year === trendYear))
      .forEach((e) => {
        const row = rows.get(e.month) ?? { draft: 0, for_review: 0, sent: 0, won: 0, lost: 0 };
        row[e.p.status as 'draft' | 'for_review' | 'sent' | 'won' | 'lost'] += e.value;
        rows.set(e.month, row);
      });
    const keys = trendYear === 'all'
      ? Array.from(rows.keys()).sort()
      : Array.from({ length: 12 }, (_, i) => `${trendYear}-${String(i + 1).padStart(2, '0')}`);
    return keys.map((k) => {
      const [y, m] = k.split('-');
      const label = trendYear === 'all' ? `${MONTHS[Number(m) - 1]} ’${y.slice(2)}` : MONTHS[Number(m) - 1];
      return { month: label, ...(rows.get(k) ?? { draft: 0, for_review: 0, sent: 0, won: 0, lost: 0 }) };
    });
  }, [enriched, trendYear]);

  const topCustomers = useMemo(() => {
    const byCustomer = new Map<string, { name: string; total: number; count: number }>();
    enriched
      .filter((e) => e.p.status === 'won')
      .forEach((e) => {
        const key = e.p.customerId ?? 'unassigned';
        const row = byCustomer.get(key) ?? { name: e.customerName, total: 0, count: 0 };
        row.total += e.value;
        row.count += 1;
        byCustomer.set(key, row);
      });
    return Array.from(byCustomer.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [enriched]);

  const funnel = useMemo(() => {
    const stage = (s: ProjectStatus) => {
      const rows = enriched.filter((e) => e.p.status === s);
      return { count: rows.length, value: rows.reduce((sum, e) => sum + e.value, 0) };
    };
    return [
      { stage: 'Draft', ...stage('draft'), fill: '#90a4ae' },
      { stage: 'For review', ...stage('for_review'), fill: NET_PACIFIC_COLORS.info },
      { stage: 'Sent', ...stage('sent'), fill: NET_PACIFIC_COLORS.primary },
      { stage: 'Won', ...stage('won'), fill: NET_PACIFIC_COLORS.success },
    ];
  }, [enriched]);

  const agingSent = useMemo(() => {
    const now = Date.now();
    return enriched
      .filter((e) => e.p.status === 'sent')
      .map((e) => {
        const t = new Date(e.sentDate).getTime();
        return { ...e, ageDays: Number.isFinite(t) ? Math.floor((now - t) / 86400000) : null };
      })
      .sort((a, b) => {
        if (a.ageDays === null) return 1;
        if (b.ageDays === null) return -1;
        return b.ageDays - a.ageDays;
      })
      .slice(0, 10);
  }, [enriched]);

  const recentProposals = useMemo(
    () =>
      [...enriched]
        .sort(
          (a, b) =>
            (b.p.date || '').localeCompare(a.p.date || '') ||
            (b.p.createdAt || '').localeCompare(a.p.createdAt || '')
        )
        .slice(0, 8),
    [enriched]
  );

  const ageChipColor = (days: number): 'default' | 'warning' | 'error' =>
    days > 60 ? 'error' : days >= 30 ? 'warning' : 'default';

  if (!initialized) {
    return (
      <Box sx={{ height: '100%', overflow: 'hidden' }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 1.5 }}>
          Sales
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Sales
        </Typography>
      </Box>

      <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
        {/* Pipeline value (draft + sent) */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Pipeline Value</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatPHP(kpis.pipelineValue)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {kpis.openCount} open proposal{kpis.openCount === 1 ? '' : 's'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Won value YTD */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Won Value ({currentYear})</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatPHP(kpis.wonYtdValue)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {kpis.wonYtdCount} won in {currentYear}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Win rate */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Win Rate</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {kpis.winRate === null ? '—' : `${kpis.winRate.toFixed(0)}%`}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {kpis.winRate === null
                  ? 'No decided proposals yet'
                  : `${kpis.wonCount} won / ${kpis.lostCount} lost`}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Average IOCT margin */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Avg IOCT Margin</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {kpis.avgMarginPct === null ? '—' : `${kpis.avgMarginPct.toFixed(1)}%`}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {kpis.marginCoverage} of {kpis.totalProjects} projects with cost data
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
        {/* Monthly proposal value */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={chartPaperSx}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                Monthly Proposal Value
              </Typography>
              <Select
                size="small"
                value={trendYear}
                onChange={(e) => setTrendYear(e.target.value)}
                sx={{ minWidth: 110, fontSize: '0.8125rem' }}
              >
                <MenuItem value="all">All years</MenuItem>
                {yearOptions.map((y) => (
                  <MenuItem key={y} value={y}>{y}</MenuItem>
                ))}
              </Select>
            </Box>
            <Box sx={{ p: 1.5, flexGrow: 1 }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={compactPHP} tick={{ fontSize: 12 }} width={70} />
                  <RechartsTooltip formatter={(value) => formatPHP(Number(value))} />
                  <Legend />
                  <Bar dataKey="draft" stackId="s" fill="#90a4ae" name="Draft" />
                  <Bar dataKey="for_review" stackId="s" fill={NET_PACIFIC_COLORS.info} name="For review" />
                  <Bar dataKey="sent" stackId="s" fill={NET_PACIFIC_COLORS.primary} name="Sent" />
                  <Bar dataKey="won" stackId="s" fill={NET_PACIFIC_COLORS.success} name="Won" />
                  <Bar dataKey="lost" stackId="s" fill={NET_PACIFIC_COLORS.error} name="Lost" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        {/* Status funnel + top customers */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={chartPaperSx}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
              <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                Status Funnel
              </Typography>
            </Box>
            <Box sx={{ px: 1.5, pt: 1 }}>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={funnel} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="stage" width={50} tick={{ fontSize: 12 }} />
                  <RechartsTooltip content={<FunnelTooltip />} />
                  <Bar dataKey="count">
                    {funnel.map((f) => (
                      <Cell key={f.stage} fill={f.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ px: 1.5, pt: 0.5, pb: 0.5, borderTop: '1px solid #e0e0e0' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                Top Customers (Won)
              </Typography>
            </Box>
            <TableContainer sx={{ flexGrow: 1 }}>
              <Table size="small">
                <TableBody>
                  {topCustomers.length === 0 && (
                    <TableRow>
                      <TableCell sx={bodyCellSx} colSpan={3}>No won proposals yet</TableCell>
                    </TableRow>
                  )}
                  {topCustomers.map((c, i) => (
                    <TableRow key={c.name} sx={stripedRowSx}>
                      <TableCell sx={{ ...bodyCellSx, width: 24, color: 'text.secondary' }}>{i + 1}</TableCell>
                      <TableCell sx={bodyCellSx}>
                        {c.name}
                        <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                          ({c.count})
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, fontWeight: 600 }} align="right">{formatPHP(c.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
        {/* Aging sent proposals */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={chartPaperSx}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
              <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                Aging Sent Proposals
              </Typography>
            </Box>
            <TableContainer sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={headCellSx}>Code</TableCell>
                    <TableCell sx={headCellSx}>Customer</TableCell>
                    <TableCell sx={headCellSx} align="right">Value</TableCell>
                    <TableCell sx={headCellSx} align="right">Days</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agingSent.length === 0 && (
                    <TableRow>
                      <TableCell sx={bodyCellSx} colSpan={4}>No sent proposals awaiting a decision</TableCell>
                    </TableRow>
                  )}
                  {agingSent.map((e) => (
                    <TableRow key={e.p.id} hover sx={stripedRowSx}>
                      <TableCell sx={bodyCellSx}>
                        <Link to={`/sales/calcsheet/projects/${e.p.id}`} style={{ color: NET_PACIFIC_COLORS.primary }}>
                          {e.p.code}
                        </Link>
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', maxWidth: 220 }} noWrap>
                          {e.p.name}
                        </Typography>
                      </TableCell>
                      <TableCell sx={bodyCellSx}>{e.customerName}</TableCell>
                      <TableCell sx={bodyCellSx} align="right">{formatPHP(e.value)}</TableCell>
                      <TableCell sx={bodyCellSx} align="right">
                        {e.ageDays === null ? '—' : (
                          <Chip size="small" label={`${e.ageDays}d`} color={ageChipColor(e.ageDays)} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Recent proposals */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={chartPaperSx}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
              <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                Recent Proposals
              </Typography>
            </Box>
            <TableContainer sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={headCellSx}>Code</TableCell>
                    <TableCell sx={headCellSx}>Customer</TableCell>
                    <TableCell sx={headCellSx}>Status</TableCell>
                    <TableCell sx={headCellSx} align="right">Value</TableCell>
                    <TableCell sx={headCellSx} align="right">Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentProposals.length === 0 && (
                    <TableRow>
                      <TableCell sx={bodyCellSx} colSpan={5}>No proposals yet</TableCell>
                    </TableRow>
                  )}
                  {recentProposals.map((e) => (
                    <TableRow key={e.p.id} hover sx={stripedRowSx}>
                      <TableCell sx={bodyCellSx}>
                        <Link to={`/sales/calcsheet/projects/${e.p.id}`} style={{ color: NET_PACIFIC_COLORS.primary }}>
                          {e.p.code}
                        </Link>
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', maxWidth: 220 }} noWrap>
                          {e.p.name}
                        </Typography>
                      </TableCell>
                      <TableCell sx={bodyCellSx}>{e.customerName}</TableCell>
                      <TableCell sx={bodyCellSx}>
                        <Chip size="small" label={projectStatusLabel(e.p.status)} color={statusColors[e.p.status]} />
                      </TableCell>
                      <TableCell sx={bodyCellSx} align="right">{formatPHP(e.value)}</TableCell>
                      <TableCell sx={bodyCellSx} align="right">{e.p.date || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SalesHomePage;
