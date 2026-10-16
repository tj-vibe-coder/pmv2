import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Radio,
  Stack,
  Typography,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { API_BASE } from '../../config/api';
import { PHP } from '../../utils/calcsheet/calc';
import { awardFigures } from '../../utils/calcsheet/awardFigures';
import type { Client, Project, Quotation } from '../../types/Quotation';
import type { ProjectSpend } from '../../types/ProjectSpendMonitor';

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('netpacific_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const byNewest = (a: Quotation, b: Quotation) =>
  (parseInt(b.revision || '0', 10) || 0) - (parseInt(a.revision || '0', 10) || 0)
  || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));

/** Default award candidate: the current award, else latest IOCT, else latest ACTI (same rule as the server). */
export function defaultAwardQuotationId(project: Project, quotations: Quotation[]): string {
  if (project.awarded && quotations.some((q) => q.id === project.awarded?.quotationId)) return project.awarded.quotationId;
  const ioct = quotations.filter((q) => q.kind === 'IOCT').sort(byNewest)[0];
  const acti = quotations.filter((q) => q.kind === 'ACTI').sort(byNewest)[0];
  return (ioct || acti)?.id ?? '';
}

/** Radio list of the project's quotations with the price and budget each would lock. */
export function AwardQuotationPicker({
  quotations,
  clients,
  value,
  onChange,
}: {
  quotations: Quotation[];
  clients: Client[];
  value: string;
  onChange: (id: string) => void;
}) {
  const rows = useMemo(
    () => [...quotations].sort((a, b) => (a.kind === b.kind ? byNewest(a, b) : a.kind === 'IOCT' ? -1 : 1)),
    [quotations],
  );
  if (rows.length === 0) {
    return <Alert severity="warning">This project has no quotations yet, so there is no price to lock.</Alert>;
  }
  return (
    <Stack spacing={0.75}>
      {rows.map((q) => {
        const f = awardFigures(q);
        const recipient = clients.find((c) => c.id === q.recipientId);
        const selected = value === q.id;
        return (
          <Paper
            key={q.id}
            variant="outlined"
            onClick={() => onChange(q.id)}
            sx={{
              p: 1,
              pr: 1.5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              borderColor: selected ? 'primary.main' : 'divider',
              bgcolor: selected ? 'rgba(44, 90, 160, 0.05)' : undefined,
            }}
          >
            <Radio size="small" checked={selected} onChange={() => onChange(q.id)} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip size="small" label={q.kind} color={q.kind === 'IOCT' ? 'primary' : 'secondary'} />
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>rev {q.revision}</Typography>
                {q.awardedAt && <Chip size="small" icon={<LockIcon />} label="Awarded" color="success" variant="outlined" sx={{ height: 20 }} />}
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {recipient?.name ?? 'No recipient'}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{PHP(f.price)}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                budget {PHP(f.budget)}
              </Typography>
            </Box>
          </Paper>
        );
      })}
    </Stack>
  );
}

interface MainProjectSnapshot {
  contract: number;
  budget: number;
  projectNo: string;
}

interface Props {
  project: Project;
  quotations: Quotation[];
  isAdmin: boolean;
  busy?: boolean;
  /** Open the picker to lock (or re-lock) the awarded quotation. */
  onLock: () => void;
  onUnlock: () => void;
  /** Re-push the locked price/budget to the Project List row. */
  onRepush: () => void;
  /** Bumped by the parent after award/sync so the card refetches. */
  refreshKey?: number;
}

/**
 * Awarded price & budget, and actual spend against it (from Finance), for a won proposal.
 * Spend comes from GET /api/projects-monitor/spend?projectId=<Project List id>.
 */
export default function AwardedBudgetCard({ project, quotations, isAdmin, busy, onLock, onUnlock, onRepush, refreshKey = 0 }: Props) {
  const awarded = project.awarded;
  const mainId = project.mainProjectId;
  const [spend, setSpend] = useState<ProjectSpend | null>(null);
  const [main, setMain] = useState<MainProjectSnapshot | null>(null);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    if (!mainId) {
      setSpend(null);
      setMain(null);
      return;
    }
    let cancelled = false;
    setLoadErr('');
    Promise.all([
      fetch(`${API_BASE}/api/projects-monitor/spend?projectId=${encodeURIComponent(mainId)}`, { headers: authHeaders() })
        .then((r) => r.json())
        .then((d) => (d?.success ? (d.spend as ProjectSpend | null) : Promise.reject(new Error(d?.error || 'spend')))),
      fetch(`${API_BASE}/api/projects/${encodeURIComponent(mainId)}`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([sp, mp]) => {
        if (cancelled) return;
        setSpend(sp);
        setMain(mp && mp.id
          ? {
            contract: Number(mp.updated_contract_amount) || Number(mp.contract_amount) || 0,
            budget: Number(mp.project_budget) || 0,
            projectNo: mp.project_no || '',
          }
          : null);
      })
      .catch(() => {
        if (!cancelled) setLoadErr('Could not load spending from Finance.');
      });
    return () => {
      cancelled = true;
    };
  }, [mainId, refreshKey]);

  const awardedQuotation = awarded ? quotations.find((q) => q.id === awarded.quotationId) : undefined;

  if (!awarded) {
    return (
      <Alert
        severity="warning"
        icon={<LockOpenIcon />}
        action={(
          <Button color="inherit" size="small" startIcon={<LockIcon />} onClick={onLock} disabled={busy || quotations.length === 0}>
            Lock awarded price
          </Button>
        )}
      >
        <strong>Awarded price not locked.</strong> Pick the quotation this project was awarded on to freeze its price and budget,
        align the execution project's contract amount, and track spending against that budget.
      </Alert>
    );
  }

  const budget = awarded.budget;
  const spent = spend?.total ?? 0;
  const pending = spend?.draftLiquidation ?? 0;
  const usedPct = budget > 0 ? (spent / budget) * 100 : 0;
  const remaining = budget - spent;
  const barColor = usedPct > 100 ? '#d32f2f' : usedPct >= 80 ? '#ed6c02' : '#00b894';
  const priceDrift = main ? Math.abs(main.contract - awarded.price) >= 1 : false;
  const budgetEdited = main ? main.budget > 0 && Math.abs(main.budget - budget) >= 1 : false;
  const parts = spend
    ? ([
      ['Liquidations', spend.liquidation],
      ['Purchase orders', spend.po],
      ['Labor', spend.labor],
      ['Other', spend.manual],
    ] as const).filter(([, v]) => v > 0)
    : [];

  const stat = (label: string, value: string, sub?: string, color?: string) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body1" sx={{ fontWeight: 700, fontFamily: 'monospace', color, whiteSpace: 'nowrap' }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary" component="div">{sub}</Typography>}
    </Box>
  );

  return (
    <Paper variant="outlined" sx={{ p: 2, borderColor: 'success.light' }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={2} rowGap={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <LockIcon color="success" fontSize="small" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Awarded price &amp; budget</Typography>
          {awardedQuotation ? (
            <Link to={`/sales/calcsheet/quotations/${awardedQuotation.id}`} style={{ textDecoration: 'none' }} title="Open the awarded quotation">
              <Chip size="small" clickable label={`${awarded.kind} rev ${awarded.revision}`} color={awarded.kind === 'IOCT' ? 'primary' : 'secondary'} />
            </Link>
          ) : (
            <Chip size="small" label={`${awarded.kind} rev ${awarded.revision} (deleted)`} />
          )}
          <Typography variant="caption" color="text.secondary">
            locked {new Date(awarded.awardedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {awarded.awardedBy ? ` by ${awarded.awardedBy}` : ''}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {mainId && (
            <Button size="small" variant="outlined" startIcon={<ReceiptLongIcon />} component={Link} to={`/finance/projects/${encodeURIComponent(mainId)}/expenses`}>
              Expense report
            </Button>
          )}
          {isAdmin && (
            <Button size="small" color="inherit" startIcon={<LockOpenIcon />} onClick={onUnlock} disabled={busy}>
              Unlock
            </Button>
          )}
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2, mb: 1.5 }}>
        {stat('Contract price (locked)', PHP(awarded.price), awarded.price !== awarded.grandTotal ? `quotation total ${PHP(awarded.grandTotal)}` : undefined)}
        {stat('Budget (cost)', PHP(budget), `margin ${PHP(awarded.price / (1 + ((awardedQuotation?.vatPct ?? 0) / 100)) - budget)} VAT-ex`)}
        {stat('Spent so far', mainId ? PHP(spent) : '—', pending > 0 ? `+ ${PHP(pending)} in draft liquidations` : undefined)}
        {stat(remaining >= 0 ? 'Remaining' : 'Over budget', mainId ? PHP(Math.abs(remaining)) : '—', undefined, remaining < 0 ? 'error.main' : undefined)}
      </Box>

      {mainId ? (
        <>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, usedPct))}
            sx={{ height: 8, borderRadius: 4, bgcolor: 'grey.200', '& .MuiLinearProgress-bar': { bgcolor: barColor, borderRadius: 4 } }}
          />
          <Stack direction="row" justifyContent="space-between" flexWrap="wrap" useFlexGap columnGap={2} sx={{ mt: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: barColor }}>{usedPct.toFixed(0)}% of budget used</Typography>
            {parts.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {parts.map(([k, v]) => `${k} ${PHP(v)}`).join(' · ')}
              </Typography>
            )}
          </Stack>
        </>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Link or create the Project List record to start tracking spending against this budget.
        </Typography>
      )}

      {loadErr && <Alert severity="warning" sx={{ mt: 1.5 }}>{loadErr}</Alert>}
      {priceDrift && main && (
        <Alert
          severity="error"
          sx={{ mt: 1.5 }}
          action={<Button color="inherit" size="small" onClick={onRepush} disabled={busy}>Apply locked price</Button>}
        >
          Project List {main.projectNo} shows <strong>{PHP(main.contract)}</strong>, not the awarded {PHP(awarded.price)}.
        </Alert>
      )}
      {budgetEdited && main && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          The execution team set the Project List budget to {PHP(main.budget)} (awarded budget {PHP(budget)}). The bar above
          tracks the awarded budget.
        </Alert>
      )}
    </Paper>
  );
}
