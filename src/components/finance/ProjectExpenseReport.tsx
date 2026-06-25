import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Button, Alert,
  Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress,
} from '@mui/material';
import { API_BASE } from '../../config/api';
import { normalizeExpenseCategory } from '../../data/financeCategories';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0', secondary: '#1e4a72', accent1: '#4f7bc8', accent2: '#3c6ba5',
  success: '#00b894', warning: '#fdcb6e', error: '#e84393', info: '#74b9ff',
};
const API = `${API_BASE}/api`;

function formatPHP(n: number) {
  return '₱' + (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('netpacific_token');
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

interface ProjectExpense {
  id: string;
  projectId: string;
  projectName?: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  createdAt: string;
  sourceType: 'manual' | 'po_sync' | 'liquidation_sync' | 'migrated';
}

interface OpsProject {
  id: string;
  project_name?: string;
  project_no?: string;
}

interface CalcsheetProject {
  id: string;
  code?: string;
  name?: string;
  mainProjectId?: string;
  mainProjectNo?: string;
}

interface CalcsheetQuotation {
  id: string;
  projectId: string;
  kind: 'IOCT' | 'ACTI';
  legacyTotalsSnapshot?: { grandTotal: number };
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  po_sync: 'PO Sync',
  liquidation_sync: 'Liquidation',
  migrated: 'Migrated',
};

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function escapeCSVField(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

const ProjectExpenseReport: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();

  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [opsProject, setOpsProject] = useState<OpsProject | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError('');

    Promise.all([
      fetch(`${API}/project-expenses?projectId=${encodeURIComponent(projectId)}`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/projects`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/calcsheet/projects`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/calcsheet/quotations`, { headers: authHeaders() }).then(r => r.json()),
    ])
      .then(([expData, projectsData, csProjectsData, csQuotationsData]) => {
        if (expData.success) {
          setExpenses(expData.expenses || []);
        } else {
          setError(expData.error || 'Failed to load expenses.');
        }

        // projectsData is a bare array
        const projects: OpsProject[] = Array.isArray(projectsData) ? projectsData : [];
        const found = projects.find(p => p.id === projectId) || null;
        setOpsProject(found);

        // Resolve budget from calcsheet
        const csProjects: CalcsheetProject[] = csProjectsData?.projects || [];
        const csQuotations: CalcsheetQuotation[] = csQuotationsData?.quotations || [];

        let cp = csProjects.find(p => p.mainProjectId === projectId);
        if (!cp && found) {
          const pno = found.project_no;
          cp = csProjects.find(p => p.code === pno || p.mainProjectNo === pno);
        }

        if (cp) {
          // Only consider IOCT quotations that actually carry a frozen total — a
          // matched quotation with no snapshot must NOT collapse the budget to 0
          // (that would render a misleading negative "Remaining").
          const iocts = csQuotations.filter(
            q => q.projectId === cp!.id && q.kind === 'IOCT'
              && typeof q.legacyTotalsSnapshot?.grandTotal === 'number'
          );
          if (iocts.length > 0) {
            const best = iocts.reduce((top, q) =>
              (q.legacyTotalsSnapshot!.grandTotal) > (top.legacyTotalsSnapshot!.grandTotal) ? q : top
            , iocts[0]);
            setBudget(best.legacyTotalsSnapshot!.grandTotal);
          } else {
            setBudget(null);
          }
        } else {
          setBudget(null);
        }
      })
      .catch(() => setError('Failed to load project expense data.'))
      .finally(() => setLoading(false));
  }, [projectId]);

  const totalSpent = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  );

  const remaining = budget !== null ? budget - totalSpent : null;
  const pctConsumed = budget !== null && budget > 0 ? Math.round((totalSpent / budget) * 100) : null;

  const byCategory = useMemo(() => {
    const grouped = groupBy(expenses, e => normalizeExpenseCategory(e.category));
    return Array.from(grouped.entries())
      .map(([cat, items]) => ({ cat, count: items.length, amount: items.reduce((s, i) => s + Number(i.amount), 0) }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const byTimeline = useMemo(() => {
    const grouped = groupBy(expenses, e => (e.date || '').slice(0, 7) || 'Unknown');
    return Array.from(grouped.entries())
      .map(([month, items]) => ({ month, count: items.length, amount: items.reduce((s, i) => s + Number(i.amount), 0) }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [expenses]);

  const bySource = useMemo(() => {
    const grouped = groupBy(expenses, e => e.sourceType);
    return Array.from(grouped.entries())
      .map(([src, items]) => ({ src, label: SOURCE_LABELS[src] || src, count: items.length, amount: items.reduce((s, i) => s + Number(i.amount), 0) }));
  }, [expenses]);

  const exportCSV = () => {
    const pno = opsProject?.project_no || projectId || 'project';
    const header = 'Date,Category,Description,Source,Amount';
    const rows = expenses.map(e =>
      [
        escapeCSVField(e.date || ''),
        escapeCSVField(normalizeExpenseCategory(e.category)),
        escapeCSVField(e.description || ''),
        escapeCSVField(SOURCE_LABELS[e.sourceType] || e.sourceType),
        String(Number(e.amount) || 0),
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-expenses-${pno}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const projectName = opsProject?.project_name || projectId || '';
  const projectNo = opsProject?.project_no || '';

  const remainingGradient =
    remaining === null
      ? `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent2} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`
      : remaining >= 0
      ? `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`
      : `linear-gradient(135deg, ${NET_PACIFIC_COLORS.error} 0%, #fd79a8 100%)`;

  const totalRow = (total: number) => (
    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
      <TableCell sx={{ fontWeight: 700 }}>TOTAL</TableCell>
      <TableCell />
      <TableCell align="right" sx={{ fontWeight: 700 }}>{formatPHP(total)}</TableCell>
    </TableRow>
  );

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            Project Expenses — {projectName}
          </Typography>
          {projectNo && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
              {projectNo}
            </Typography>
          )}
        </Box>
        <Button variant="outlined" size="small" onClick={exportCSV} disabled={expenses.length === 0}>
          Export CSV
        </Button>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Budget (IOCT)</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {loading ? '—' : budget !== null ? formatPHP(budget) : 'No IOCT quotation linked'}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>IOCT quotation total</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Actual Spent</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {loading ? '—' : formatPHP(totalSpent)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: remainingGradient, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Remaining</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {loading ? '—' : remaining !== null ? formatPHP(remaining) : '—'}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Budget minus spent</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent2} 0%, ${NET_PACIFIC_COLORS.secondary} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>% Consumed</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {loading ? '—' : pctConsumed !== null ? `${pctConsumed}%` : '—'}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Of IOCT budget</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36 }}>
          <Tab label="By Category" sx={{ minHeight: 36 }} />
          <Tab label="By Timeline" sx={{ minHeight: 36 }} />
          <Tab label="By Source" sx={{ minHeight: 36 }} />
        </Tabs>
      </Box>

      <Paper sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', mt: 0, borderRadius: '0 0 4px 4px' }}>
        <TableContainer sx={{ flexGrow: 1 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <>
              {tab === 0 && (
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Category</TableCell>
                      <TableCell>Count</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {byCategory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No expenses recorded for this project.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {byCategory.map(r => (
                          <TableRow key={r.cat} hover>
                            <TableCell>{r.cat}</TableCell>
                            <TableCell>{r.count}</TableCell>
                            <TableCell align="right">{formatPHP(r.amount)}</TableCell>
                          </TableRow>
                        ))}
                        {totalRow(byCategory.reduce((s, r) => s + r.amount, 0))}
                      </>
                    )}
                  </TableBody>
                </Table>
              )}
              {tab === 1 && (
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Month</TableCell>
                      <TableCell>Count</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {byTimeline.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No expenses recorded for this project.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {byTimeline.map(r => (
                          <TableRow key={r.month} hover>
                            <TableCell>{r.month}</TableCell>
                            <TableCell>{r.count}</TableCell>
                            <TableCell align="right">{formatPHP(r.amount)}</TableCell>
                          </TableRow>
                        ))}
                        {totalRow(byTimeline.reduce((s, r) => s + r.amount, 0))}
                      </>
                    )}
                  </TableBody>
                </Table>
              )}
              {tab === 2 && (
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Source</TableCell>
                      <TableCell>Count</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bySource.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No expenses recorded for this project.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {bySource.map(r => (
                          <TableRow key={r.src} hover>
                            <TableCell>{r.label}</TableCell>
                            <TableCell>{r.count}</TableCell>
                            <TableCell align="right">{formatPHP(r.amount)}</TableCell>
                          </TableRow>
                        ))}
                        {totalRow(bySource.reduce((s, r) => s + r.amount, 0))}
                      </>
                    )}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default ProjectExpenseReport;
