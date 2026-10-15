import React, { forwardRef, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  KeyboardArrowDown as ArrowDownIcon,
  KeyboardArrowUp as ArrowUpIcon,
  ReceiptLong as ReceiptIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import dataService from '../services/dataService';
import { financeFocusToken } from '../utils/financeTraceFocus';
import type { ProjectSpendMonitor, UntaggedExpense, UntaggedKind } from '../types/ProjectSpendMonitor';

const PRIMARY = '#2c5aa0';
const PREVIEW_ROWS = 10;

const KIND_META: Record<UntaggedKind, { label: string; chipSx: object; action: string }> = {
  liquidation: { label: 'Filed liquidation', chipSx: { bgcolor: '#fdecea', color: '#b71c1c' }, action: 'Fix in liquidation' },
  draft: { label: 'Draft liquidation', chipSx: { bgcolor: '#fff4e5', color: '#8a5300' }, action: 'Tag in draft' },
  manual: { label: 'Overhead entry', chipSx: { bgcolor: '#e8f1fb', color: '#1e4a72' }, action: 'Tag to project' },
};

const liquidationHref = (liquidationId: string, rowId: string) =>
  `/finance/expense-monitoring/liquidation-form?focus=${encodeURIComponent(
    financeFocusToken({ type: 'liquidation', id: liquidationId, rowId }),
  )}`;

function hrefFor(item: UntaggedExpense): string | null {
  if (item.kind === 'manual') {
    return `/finance/expense-monitoring?focus=${encodeURIComponent(
      financeFocusToken({ type: 'expense', collection: 'overhead_expenses', id: item.id }),
    )}`;
  }
  if (item.liquidationId && item.liquidationRowId) return liquidationHref(item.liquidationId, item.liquidationRowId);
  return null;
}

const inYear = (date: string | null, year?: number) => !year || String(date || '').startsWith(String(year));

const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

interface Props {
  monitor: ProjectSpendMonitor | null;
  /** Dashboard year filter; narrows the list by expense date. */
  year?: number;
  error?: string;
}

/** Spend with no project — the money the project view can't see. */
const UntaggedExpensesPanel = forwardRef<HTMLDivElement, Props>(({ monitor, year, error }, ref) => {
  const navigate = useNavigate();
  const [kindFilter, setKindFilter] = useState<UntaggedKind | 'all'>('all');
  const [expanded, setExpanded] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  const items = useMemo(
    () => (monitor?.untagged.items || []).filter((i) => inYear(i.date, year)),
    [monitor, year],
  );
  const totals = useMemo(() => {
    // Server totals cover every user's rows; when narrowed by year (or own-scope), sum what's listed.
    if (!year && monitor?.scope === 'all') return monitor.untagged.totals;
    const t = { liquidation: 0, manual: 0, draft: 0, all: 0 };
    items.forEach((i) => { t[i.kind] += i.amount; t.all += i.amount; });
    return t;
  }, [items, monitor, year]);
  const counts = useMemo(() => {
    const c: Record<UntaggedKind, number> = { liquidation: 0, manual: 0, draft: 0 };
    items.forEach((i) => { c[i.kind] += 1; });
    return c;
  }, [items]);

  const missing = useMemo(
    () => (monitor?.notInFinance?.items || []).filter((i) => inYear(i.date, year)),
    [monitor, year],
  );
  const missingTotal = missing.reduce((s, i) => s + i.amount, 0);

  const visible = items.filter((i) => kindFilter === 'all' || i.kind === kindFilter);
  const shown = expanded ? visible : visible.slice(0, PREVIEW_ROWS);

  const filterChip = (kind: UntaggedKind | 'all', label: string, amount: number, count: number) => (
    <Chip
      key={kind}
      size="small"
      clickable
      onClick={() => setKindFilter(kind)}
      color={kindFilter === kind ? 'primary' : 'default'}
      variant={kindFilter === kind ? 'filled' : 'outlined'}
      label={`${label} · ${dataService.formatCurrency(amount)} (${count})`}
    />
  );

  return (
    <Paper ref={ref} sx={{ mt: 2, borderRadius: 2, border: '1px solid #e2e8f0', overflow: 'hidden', scrollMarginTop: 80 }}>
      <Box sx={{ p: 2, pb: 1.5, display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptIcon sx={{ color: PRIMARY }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.05rem', color: PRIMARY }}>
              Expenses not tagged to a project
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Liquidation lines and overhead entries with no project{year ? ` · ${year}` : ''} (office payroll excluded)
              {monitor?.scope === 'own' ? ' · showing only your own entries' : ''}
            </Typography>
          </Box>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{dataService.formatCurrency(totals.all)}</Typography>
      </Box>

      {error && <Alert severity="warning" sx={{ mx: 2, mb: 1.5 }}>{error}</Alert>}
      {!monitor && !error && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>Loading finance data…</Typography>
      )}

      {monitor && (
        <>
          {missing.length > 0 && (
            <Alert
              severity="error"
              sx={{ mx: 2, mb: 1.5 }}
              action={(
                <Button color="inherit" size="small" onClick={() => setShowMissing((v) => !v)}>
                  {showMissing ? 'Hide' : 'Show'}
                </Button>
              )}
            >
              <strong>{missing.length} submitted liquidation line{missing.length === 1 ? '' : 's'} ({dataService.formatCurrency(missingTotal)})</strong>{' '}
              never reached Finance, so no project or overhead total includes them. Run{' '}
              <Link component="button" variant="body2" onClick={() => navigate('/finance/expense-monitoring')} sx={{ verticalAlign: 'baseline' }}>
                Sync from Liquidation
              </Link>{' '}
              in Expense Monitoring.
              <Collapse in={showMissing} unmountOnExit>
                <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                  {missing.slice(0, 50).map((m) => (
                    <li key={m.id}>
                      <Link component="button" variant="body2" onClick={() => navigate(liquidationHref(m.liquidationId, m.liquidationRowId))} sx={{ textAlign: 'left' }}>
                        {m.formNo || 'Liquidation'} · {m.description}
                      </Link>{' '}
                      — {dataService.formatCurrency(m.amount)} · {formatDate(m.date)} · {m.projectName || 'no project'}
                    </li>
                  ))}
                </Box>
              </Collapse>
            </Alert>
          )}

          <Box sx={{ px: 2, pb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {filterChip('all', 'All', totals.all, items.length)}
            {filterChip('liquidation', 'Filed liquidations', totals.liquidation, counts.liquidation)}
            {filterChip('draft', 'Draft liquidations', totals.draft, counts.draft)}
            {filterChip('manual', 'Other overhead', totals.manual, counts.manual)}
          </Box>

          {visible.length === 0 ? (
            <Typography variant="body2" color="success.main" sx={{ px: 2, pb: 2, fontWeight: 600 }}>
              Nothing untagged here — every expense is assigned to a project.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Expense</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Source</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Filed by</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((item) => {
                    const meta = KIND_META[item.kind];
                    const href = hrefFor(item);
                    return (
                      <TableRow key={`${item.kind}:${item.id}`} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{formatDate(item.date)}</TableCell>
                        <TableCell sx={{ minWidth: 200 }}>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{item.description}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {[item.category, item.supplier, item.formNo].filter(Boolean).join(' · ')}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={meta.label} sx={{ ...meta.chipSx, fontSize: '0.68rem', height: 20, fontWeight: 600 }} />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{item.filedBy || '—'}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {dataService.formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {item.receiptUrl && (
                            <Link href={item.receiptUrl} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ mr: 1.5 }}>
                              Receipt
                            </Link>
                          )}
                          {href && (
                            <Button size="small" endIcon={<OpenInNewIcon sx={{ fontSize: '0.9rem !important' }} />} onClick={() => navigate(href)} sx={{ color: PRIMARY, textTransform: 'none' }}>
                              {meta.action}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {visible.length > PREVIEW_ROWS && (
            <Button
              size="small"
              onClick={() => setExpanded((v) => !v)}
              endIcon={expanded ? <ArrowUpIcon /> : <ArrowDownIcon />}
              sx={{ m: 1, color: PRIMARY }}
            >
              {expanded ? 'Show fewer' : `Show all ${visible.length}`}
            </Button>
          )}
          {counts.liquidation > 0 && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2, pb: 1.5 }}>
              Filed liquidation lines get a project through the liquidation itself (Propose edit on a submitted form), so the
              project and overhead totals stay in step.
            </Typography>
          )}
        </>
      )}
    </Paper>
  );
});

UntaggedExpensesPanel.displayName = 'UntaggedExpensesPanel';

export default UntaggedExpensesPanel;
