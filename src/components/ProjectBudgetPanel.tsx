import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { API_BASE } from '../config/api';
import dataService from '../services/dataService';
import { useQuotationStore } from '../store/quotationStore';
import { resolveCalcsheetPrice } from '../utils/calcsheetBudget';
import type { Project } from '../types/Project';
import type { ProjectSpend } from '../types/ProjectSpendMonitor';

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('netpacific_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const proposalHref = (calcsheetProjectId: string) => `/sales/calcsheet/projects/${encodeURIComponent(calcsheetProjectId)}`;

/**
 * Contract amount vs the proposal it came from. Awarded proposals compare to the
 * locked price; unlocked ones to the latest IOCT (else ACTI) quotation, which is
 * what "Sync" would push.
 */
export const ProposalPriceCheck: React.FC<{ project: Project; onProjectUpdated?: (p: Project) => void }> = ({ project, onProjectUpdated }) => {
  const csProjects = useQuotationStore((s) => s.projects);
  const quotations = useQuotationStore((s) => s.quotations);
  const syncMainProject = useQuotationStore((s) => s.syncMainProject);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const expected = useMemo(() => resolveCalcsheetPrice(project, csProjects, quotations), [project, csProjects, quotations]);
  if (!expected) return null;
  const contract = Number(project.updated_contract_amount) || Number(project.contract_amount) || 0;
  const diff = contract - expected.price;
  const label = `${expected.calcsheetCode || 'Proposal'} · ${expected.quotationLabel}${expected.source === 'awarded' ? ' (locked)' : ''}`;

  if (Math.abs(diff) < 1) {
    return (
      <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
        Matches proposal <Link to={proposalHref(expected.calcsheetProjectId)}>{label}</Link>
      </Typography>
    );
  }

  const sync = async () => {
    setBusy(true);
    setErr('');
    try {
      await syncMainProject(expected.calcsheetProjectId);
      const fresh = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(String(project.id))}`, { headers: authHeaders() }).then((r) => r.json());
      if (fresh && fresh.id) onProjectUpdated?.(fresh);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Alert
      severity="warning"
      sx={{ mt: 1, '& .MuiAlert-message': { width: '100%' } }}
    >
      Proposal <Link to={proposalHref(expected.calcsheetProjectId)}>{label}</Link> is{' '}
      <strong>{dataService.formatCurrency(expected.price)}</strong> — {dataService.formatCurrency(Math.abs(diff))}{' '}
      {diff > 0 ? 'less' : 'more'} than this contract.
      {expected.source === 'latest' && ' The price isn’t locked on the proposal yet.'}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
        <Button size="small" variant="contained" color="warning" onClick={() => { void sync(); }} disabled={busy}>
          {busy ? 'Syncing…' : 'Use proposal price'}
        </Button>
        {expected.source === 'latest' && (
          <Button size="small" component={Link} to={proposalHref(expected.calcsheetProjectId)}>
            Lock awarded price
          </Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
        Keep this contract instead if it reflects a negotiated price or a change order.
      </Typography>
      {err && <Typography variant="caption" color="error" component="div">{err}</Typography>}
    </Alert>
  );
};

/** Actual spend (Finance) against the project budget, split by source. */
export const BudgetSpendSummary: React.FC<{ projectId: string | number; budget: number }> = ({ projectId, budget }) => {
  const [spend, setSpend] = useState<ProjectSpend | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setError('');
    fetch(`${API_BASE}/api/projects-monitor/spend?projectId=${encodeURIComponent(String(projectId))}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d?.success) throw new Error(d?.error || 'Failed');
        setSpend(d.spend || { total: 0, liquidation: 0, po: 0, labor: 0, manual: 0, draftLiquidation: 0, draftLines: 0, count: 0 });
      })
      .catch(() => { if (!cancelled) setError('Could not load spending from Finance.'); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (error) return <Alert severity="warning">{error}</Alert>;
  if (!spend) return <Typography variant="caption" color="text.secondary">Loading spending…</Typography>;

  const spent = spend.total;
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const remaining = budget - spent;
  const color = budget <= 0 ? '#9e9e9e' : pct > 100 ? '#d32f2f' : pct >= 80 ? '#ed6c02' : '#00b894';
  const parts = ([
    ['Liquidations', spend.liquidation],
    ['Purchase orders', spend.po],
    ['Labor', spend.labor],
    ['Other', spend.manual],
  ] as const).filter(([, v]) => v > 0);

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5, mb: 1 }}>
        <Box>
          <Typography variant="subtitle2" color="textSecondary">Spent so far</Typography>
          <Typography variant="h6">{dataService.formatCurrency(spent)}</Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2" color="textSecondary">{remaining >= 0 ? 'Remaining' : 'Over budget'}</Typography>
          <Typography variant="h6" sx={{ color: remaining < 0 ? 'error.main' : undefined }}>
            {budget > 0 ? dataService.formatCurrency(Math.abs(remaining)) : '—'}
          </Typography>
        </Box>
      </Box>
      {budget > 0 ? (
        <>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, pct))}
            sx={{ height: 8, borderRadius: 4, bgcolor: 'grey.200', '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 4 } }}
          />
          <Typography variant="caption" sx={{ fontWeight: 600, color, display: 'block', mt: 0.5 }}>
            {pct.toFixed(0)}% of budget used{pct > 100 ? ' — over budget' : pct >= 80 ? ' — at risk' : ''}
          </Typography>
        </>
      ) : (
        <Typography variant="caption" color="text.secondary">Set a budget above to track spending against it.</Typography>
      )}
      {parts.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
          {parts.map(([k, v]) => `${k} ${dataService.formatCurrency(v)}`).join(' · ')}
        </Typography>
      )}
      {spend.draftLiquidation > 0 && (
        <Typography variant="caption" component="div" sx={{ color: 'warning.dark' }}>
          + {dataService.formatCurrency(spend.draftLiquidation)} in {spend.draftLines} draft liquidation line(s), not filed yet
        </Typography>
      )}
      <Button size="small" component={Link} to={`/finance/projects/${encodeURIComponent(String(projectId))}/expenses`} sx={{ mt: 0.5, px: 0 }}>
        Open expense report
      </Button>
    </Box>
  );
};
