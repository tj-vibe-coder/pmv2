import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Chip,
  TextField,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Checkbox,
  Switch,
  Menu,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Alert,
  LinearProgress,
  Collapse,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Upload as UploadIcon,
  TableChart as ExcelIcon,
  Description as CsvIcon,
  KeyboardArrowDown as ArrowDownIcon,
  KeyboardArrowUp as ArrowUpIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  WarningAmber as WarningAmberIcon,
  Add as AddIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line } from 'recharts';
import { Project, ProjectFilters, YearSummary } from '../types/Project';
import { actiToIoctPoLabel, actiTrailSummary, isActiInvolved } from '../utils/commercialTrail';
import dataService from '../services/dataService';
import AddProjectDialog from './AddProjectDialog';
import { resolveBudgetsForProjects, resolveCalcsheetPrice } from '../utils/calcsheetBudget';
import { useQuotationStore } from '../store/quotationStore';
import { API_BASE } from '../config/api';
import { useNavigate } from 'react-router-dom';
import UntaggedExpensesPanel from './UntaggedExpensesPanel';
import type { ProjectSpend, ProjectSpendMonitor } from '../types/ProjectSpendMonitor';

// Legacy fallback only: spend now lives in Firestore `project_expenses`
// (GET /api/project-expenses). Used when that request fails.
const PROJECT_EXPENSES_KEY = 'projectExpenses';
function loadProjectExpenses(): { projectId: string; amount: number }[] {
  try {
    const raw = localStorage.getItem(PROJECT_EXPENSES_KEY);
    if (raw) return JSON.parse(raw).map((e: { projectId: string | number; amount: number }) => ({ projectId: String(e.projectId), amount: e.amount }));
  } catch (_) {}
  return [];
}

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
  accent1: '#4f7bc8',
  accent2: '#3c6ba5',
  success: '#00b894',
  warning: '#fdcb6e',
  error: '#e84393',
  info: '#74b9ff',
};

const CLOSED_STATUSES = new Set(['CLOSED', 'COMPLETED', 'CANCELLED', 'TERMINATED']);
const isClosedStatus = (status?: string) => CLOSED_STATUSES.has((status || '').trim().toUpperCase());
const isCancelledStatus = (status?: string) => ['CANCELLED', 'TERMINATED'].includes((status || '').trim().toUpperCase());

const DAY_MS = 86_400_000;
// Dates before this are bad imports (e.g. Excel serials read as epoch seconds), not real deadlines.
const MIN_REAL_DATE_MS = Date.UTC(2000, 0, 1);
const DUE_SOON_DAYS = 14;

/** Project dates are stored as epoch seconds or milliseconds (see dataService.formatDate). */
function toMs(ts: number | null | undefined): number | null {
  if (!ts) return null;
  const ms = String(Math.trunc(ts)).length <= 10 ? ts * 1000 : ts;
  return ms >= MIN_REAL_DATE_MS ? ms : null;
}

const compactPeso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 2,
});
const formatCompact = (n: number) => compactPeso.format(n || 0);

type FlagSeverity = 'error' | 'warning' | 'info';
interface ProjectFlag {
  key: string;
  label: string;
  severity: FlagSeverity;
}
const SEVERITY_RANK: Record<FlagSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Everything the monitoring table needs about one project, computed once. */
interface ProjectMonitor {
  contract: number;
  billed: number;
  unbilled: number;
  billedPct: number;
  progress: number;
  targetMs: number | null;
  daysLeft: number | null;
  budget: number;
  spent: number;
  budgetUsedPct: number | null;
  closed: boolean;
  flags: ProjectFlag[];
  severityRank: number;
}

function buildMonitor(project: Project, budget: number, spent: number, todayMs: number, proposalPrice: number | null = null): ProjectMonitor {
  const contract = project.updated_contract_amount || project.contract_amount || 0;
  const unbilled = dataService.getUnbilled(project);
  const billed = Math.max(0, contract - unbilled);
  const billedPct = contract > 0 ? (billed / contract) * 100 : 0;
  const progress = Math.max(0, Math.min(100, Number(project.actual_site_progress_percent) || 0));
  const targetMs = toMs(project.updated_completion_date) ?? toMs(project.completion_date);
  const daysLeft = targetMs == null ? null : Math.ceil((targetMs - todayMs) / DAY_MS);
  const budgetUsedPct = budget > 0 ? (spent / budget) * 100 : null;
  const closed = isClosedStatus(project.project_status);

  const flags: ProjectFlag[] = [];
  if (!closed) {
    if (progress < 100 && daysLeft != null && daysLeft < 0) {
      flags.push({ key: 'overdue', label: `Overdue ${-daysLeft}d`, severity: 'error' });
    } else if (progress < 90 && daysLeft != null && daysLeft <= DUE_SOON_DAYS) {
      flags.push({ key: 'due-soon', label: daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d`, severity: 'warning' });
    }
    if (budgetUsedPct != null && budgetUsedPct > 100) {
      flags.push({ key: 'over-budget', label: 'Over budget', severity: 'error' });
    } else if (budgetUsedPct != null && budgetUsedPct >= 80) {
      flags.push({ key: 'budget-risk', label: `Budget ${Math.round(budgetUsedPct)}% used`, severity: 'warning' });
    }
  }
  // Contract drifted from the proposal (awarded price, else latest quotation).
  if (!isCancelledStatus(project.project_status) && proposalPrice != null && Math.abs(contract - proposalPrice) >= 1) {
    flags.push({ key: 'price', label: `Price ≠ proposal (${contract > proposalPrice ? '+' : '−'}${formatCompact(Math.abs(contract - proposalPrice))})`, severity: 'warning' });
  }
  if (!isCancelledStatus(project.project_status) && progress >= 100 && unbilled > 0) {
    flags.push({ key: 'unbilled', label: `Done · ${formatCompact(unbilled)} unbilled`, severity: 'info' });
  } else if (!closed && progress >= 100) {
    flags.push({ key: 'closeout', label: 'Ready to close out', severity: 'info' });
  }
  flags.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const severityRank = flags.length ? SEVERITY_RANK[flags[0].severity] : 3;

  return { contract, billed, unbilled, billedPct, progress, targetMs, daysLeft, budget, spent, budgetUsedPct, closed, flags, severityRank };
}

const FLAG_CHIP_SX: Record<FlagSeverity, object> = {
  error: { bgcolor: '#fdecea', color: '#b71c1c', borderColor: '#f5c2c0' },
  warning: { bgcolor: '#fff4e5', color: '#8a5300', borderColor: '#ffd8a8' },
  info: { bgcolor: '#e8f1fb', color: NET_PACIFIC_COLORS.secondary, borderColor: '#c5d9f1' },
};

const FlagChip: React.FC<{ flag: ProjectFlag }> = ({ flag }) => (
  <Chip
    label={flag.label}
    size="small"
    variant="outlined"
    sx={{ ...FLAG_CHIP_SX[flag.severity], fontSize: '0.68rem', height: 20, fontWeight: 600 }}
  />
);

/** Small labelled bar used for progress, billing and budget columns. */
const MiniBar: React.FC<{ value: number; color: string; label: string; caption?: string }> = ({ value, color, label, caption }) => (
  <Box sx={{ minWidth: 110 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, mb: 0.25 }}>
      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{label}</Typography>
      {caption && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
          {caption}
        </Typography>
      )}
    </Box>
    <LinearProgress
      variant="determinate"
      value={Math.max(0, Math.min(100, value))}
      sx={{ height: 6, borderRadius: 3, bgcolor: 'grey.200', '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 } }}
    />
  </Box>
);

/** Spent vs budget, split by where the money came from, with a link to the project's expense report. */
const SpendCell: React.FC<{ m: ProjectMonitor; spend?: ProjectSpend; color: string; onOpen: () => void }> = ({ m, spend, color, onOpen }) => {
  const parts = spend
    ? ([
      ['Liq', spend.liquidation],
      ['PO', spend.po],
      ['Labor', spend.labor],
      ['Other', spend.manual],
    ] as const).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${formatCompact(v)}`)
    : [];
  const tooltip = [
    `Spent ${dataService.formatCurrency(m.spent)}${m.budget > 0 ? ` of ${dataService.formatCurrency(m.budget)} budget` : ' (no budget set)'}`,
    parts.length > 0 ? parts.join(' · ') : '',
    spend && spend.draftLiquidation > 0
      ? `+ ${dataService.formatCurrency(spend.draftLiquidation)} in ${spend.draftLines} draft liquidation line(s), not filed yet`
      : '',
    'Click to open the project expense report',
  ].filter(Boolean).join('\n');
  return (
    <Box
      role="link"
      title={tooltip}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      sx={{ cursor: 'pointer', borderRadius: 1, '&:hover .spend-label': { textDecoration: 'underline' } }}
    >
      {m.budgetUsedPct == null ? (
        <Typography className="spend-label" variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600, color: m.spent > 0 ? 'text.primary' : 'text.disabled' }}>
          {m.spent > 0 ? formatCompact(m.spent) : '—'}
        </Typography>
      ) : (
        <Box className="spend-label">
          <MiniBar value={m.budgetUsedPct} color={color} label={formatCompact(m.spent)} caption={`${Math.round(m.budgetUsedPct)}% of ${formatCompact(m.budget)}`} />
        </Box>
      )}
      {spend && spend.draftLiquidation > 0 && (
        <Typography variant="caption" component="div" sx={{ fontSize: '0.66rem', lineHeight: 1.3, color: 'warning.dark' }}>
          +{formatCompact(spend.draftLiquidation)} draft
        </Typography>
      )}
    </Box>
  );
};

const DASHBOARD_PREFS_KEY = 'projects-list-prefs';

type DashboardListPrefs = {
  searchTerm: string;
  year?: number;
  client?: string;
  statusFilter: string[];
  /** Hide closed/cancelled projects (the default monitoring view). */
  activeOnly: boolean;
  attentionOnly: boolean;
  showDetails: boolean;
  showCharts: boolean;
  filterActi: boolean;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  rowsPerPage: number;
};

function loadDashboardPrefs(): DashboardListPrefs {
  const defaults: DashboardListPrefs = {
    searchTerm: '',
    year: undefined,
    client: undefined,
    statusFilter: [],
    activeOnly: true,
    attentionOnly: false,
    showDetails: false,
    showCharts: false,
    filterActi: false,
    // Most urgent first: overdue / over budget, then warnings, then info.
    sortKey: 'alerts',
    sortDir: 'asc',
    rowsPerPage: 25,
  };
  try {
    const raw = localStorage.getItem(DASHBOARD_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const yearNum = Number(parsed.year);
    const statusFilter: string[] = Array.isArray(parsed.statusFilter)
      ? parsed.statusFilter.filter((s: unknown) => typeof s === 'string')
      : [];
    return {
      searchTerm: typeof parsed.searchTerm === 'string' ? parsed.searchTerm : '',
      year: Number.isFinite(yearNum) && yearNum > 0 ? yearNum : undefined,
      client: typeof parsed.client === 'string' && parsed.client ? parsed.client : undefined,
      statusFilter,
      // Prefs saved before the Active view existed: default to Active unless statuses were picked.
      activeOnly: typeof parsed.activeOnly === 'boolean' ? parsed.activeOnly : statusFilter.length === 0,
      attentionOnly: !!parsed.attentionOnly,
      showDetails: !!parsed.showDetails,
      showCharts: !!parsed.showCharts,
      filterActi: !!parsed.filterActi,
      sortKey: typeof parsed.sortKey === 'string' && parsed.sortKey ? parsed.sortKey : 'project_no',
      sortDir: parsed.sortDir === 'asc' || parsed.sortDir === 'desc' ? parsed.sortDir : 'desc',
      rowsPerPage: [25, 50, 100].includes(parsed.rowsPerPage) ? parsed.rowsPerPage : defaults.rowsPerPage,
    };
  } catch {
    return defaults;
  }
}

function saveDashboardPrefs(prefs: DashboardListPrefs) {
  try {
    localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(prefs));
  } catch { /* private mode / quota */ }
}

interface DashboardProps {
  onProjectSelect: (project: Project) => void;
  refreshTrigger?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ onProjectSelect, refreshTrigger: externalRefreshTrigger = 0 }) => {
  const [initPrefs] = useState(loadDashboardPrefs);
  const [filters, setFilters] = useState<ProjectFilters>({
    searchTerm: initPrefs.searchTerm || undefined,
    year: initPrefs.year,
    client: initPrefs.client,
  });
  const [statusFilter, setStatusFilter] = useState<string[]>(initPrefs.statusFilter);
  const [activeOnly, setActiveOnly] = useState(initPrefs.activeOnly);
  const [attentionOnly, setAttentionOnly] = useState(initPrefs.attentionOnly);
  const [showDetails, setShowDetails] = useState(initPrefs.showDetails);
  const [showCharts, setShowCharts] = useState(initPrefs.showCharts);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(initPrefs.rowsPerPage);
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [filterActi, setFilterActi] = useState(initPrefs.filterActi);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const effectiveRefreshTrigger = externalRefreshTrigger + refreshTrigger;
  const [sortConfig, setSortConfig] = useState<{key: string; direction: 'asc' | 'desc'}>({
    key: initPrefs.sortKey,
    direction: initPrefs.sortDir,
  });

  useEffect(() => {
    saveDashboardPrefs({
      searchTerm: filters.searchTerm || '',
      year: filters.year,
      client: filters.client,
      statusFilter,
      activeOnly,
      attentionOnly,
      showDetails,
      showCharts,
      filterActi,
      sortKey: sortConfig.key,
      sortDir: sortConfig.direction,
      rowsPerPage,
    });
  }, [filters.searchTerm, filters.year, filters.client, statusFilter, activeOnly, attentionOnly, showDetails, showCharts, filterActi, sortConfig, rowsPerPage]);

  // Any filter change goes back to the first page.
  useEffect(() => {
    setPage(0);
  }, [filters.searchTerm, filters.year, filters.client, statusFilter, activeOnly, attentionOnly, filterActi]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [addProjectDialogOpen, setAddProjectDialogOpen] = useState(false);
  const [yearSummaries, setYearSummaries] = useState<YearSummary[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<{name: string, value: number}[]>([]);
  const [uniqueStatuses, setUniqueStatuses] = useState<string[]>([]);
  const [uniqueYears, setUniqueYears] = useState<number[]>([]);
  const [uniqueClients, setUniqueClients] = useState<string[]>([]);
  const [spentByProject, setSpentByProject] = useState<Record<string, number>>({});
  const [spendMonitor, setSpendMonitor] = useState<ProjectSpendMonitor | null>(null);
  const [spendError, setSpendError] = useState('');
  const untaggedRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csProjects = useQuotationStore((s) => s.projects);
  const quotations = useQuotationStore((s) => s.quotations);

  // Load projects on component mount and when filters/refresh change
  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true);
      try {
        const data = await dataService.getProjects(filters);
        setProjects(data);
      } catch (error) {
        console.error('Error loading projects:', error);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [filters, effectiveRefreshTrigger]);

  // Spend per project (split by liquidation / PO / other), untagged expenses and the
  // liquidation→Finance sync check, from GET /api/projects-monitor/spend.
  // Falls back to plain project_expenses totals (then legacy localStorage) if unavailable.
  useEffect(() => {
    let cancelled = false;
    const sumBy = (rows: { projectId?: string | number; amount?: number | string }[]) => {
      const out: Record<string, number> = {};
      rows.forEach((e) => {
        const key = String(e.projectId ?? '');
        if (key) out[key] = (out[key] || 0) + (Number(e.amount) || 0);
      });
      return out;
    };
    const token = localStorage.getItem('netpacific_token');
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const getJson = (path: string) => fetch(`${API_BASE}${path}`, { headers }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.success) throw new Error(data?.error || `Request failed (${r.status})`);
      return data;
    });
    getJson('/api/projects-monitor/spend')
      .then((data: ProjectSpendMonitor) => {
        if (cancelled) return;
        setSpendMonitor(data);
        setSpendError('');
        const totals: Record<string, number> = {};
        Object.entries(data.byProject || {}).forEach(([id, sp]) => { totals[id] = sp.total; });
        setSpentByProject(totals);
      })
      .catch(() => getJson('/api/project-expenses')
        .then((data) => {
          if (cancelled) return;
          setSpendError('Untagged-expense tracking is unavailable right now (finance summary failed to load).');
          setSpentByProject(sumBy(data.expenses || []));
        })
        .catch(() => {
          if (cancelled) return;
          setSpendError('Could not load expenses from Finance.');
          setSpentByProject(sumBy(loadProjectExpenses()));
        }));
    return () => {
      cancelled = true;
    };
  }, [effectiveRefreshTrigger]);

  // Load static data on mount
  useEffect(() => {
    const loadStaticData = async () => {
      try {
        const [statusDist, statuses, years] = await Promise.all([
          dataService.getStatusDistribution(),
          dataService.getUniqueStatuses(),
          dataService.getUniqueYears()
        ]);

        const allProjects = await dataService.getProjects();
        const yearGroups: Record<number, typeof allProjects> = {};

        allProjects.forEach(project => {
          const year = project.year || new Date().getFullYear();
          if (!yearGroups[year]) yearGroups[year] = [];
          yearGroups[year].push(project);
        });

        const calculatedYearSummaries = Object.entries(yearGroups).map(([year, projects]) => ({
          year: parseInt(year),
          projectCount: projects.length,
          totalContractAmount: projects.reduce((sum, p) => sum + (p.updated_contract_amount || 0), 0),
          totalBilledAmount: projects.reduce((sum, p) => sum + (p.contract_billed || 0), 0),
          totalBacklogs: projects.reduce((sum, p) => sum + dataService.getUnbilled(p), 0),
          totalOutstandingBalance: projects.reduce((sum, p) => sum + dataService.getUnbilled(p), 0)
        })).sort((a, b) => a.year - b.year);

        setYearSummaries(calculatedYearSummaries);
        setStatusDistribution(statusDist.map(item => ({ name: item.label, value: item.value })));
        setUniqueStatuses(statuses);
        setUniqueYears(years);
        const clientNames = Array.from(new Set(
          allProjects.map((p) => (p.account_name || '').trim()).filter(Boolean),
        )).sort((a, b) => a.localeCompare(b));
        setUniqueClients(clientNames);
      } catch (error) {
        console.error('Error loading static data:', error);
      }
    };
    loadStaticData();
  }, [refreshTrigger]);

  // Budget = persisted project_budget, else manual override, else calcsheet cost.
  const monitorMap = useMemo(() => {
    const budgets = resolveBudgetsForProjects(projects, csProjects, quotations);
    const today = new Date();
    const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const map: Record<string, ProjectMonitor> = {};
    projects.forEach((p) => {
      const key = String(p.id);
      const proposal = resolveCalcsheetPrice(p, csProjects, quotations);
      map[key] = buildMonitor(p, budgets[key] ?? 0, spentByProject[key] ?? 0, todayMs, proposal ? proposal.price : null);
    });
    return map;
  }, [projects, csProjects, quotations, spentByProject]);

  // Server returns the year/client/search slice; ACTI is applied here so the
  // status chips count what the user can actually reach.
  const baseProjects = useMemo(
    () => (filterActi ? projects.filter((p) => p.with_acti) : projects),
    [projects, filterActi],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let active = 0;
    baseProjects.forEach((p) => {
      const s = p.project_status || '';
      counts[s] = (counts[s] || 0) + 1;
      if (!isClosedStatus(s)) active += 1;
    });
    return { counts, active, all: baseProjects.length };
  }, [baseProjects]);

  // Status chips that actually have projects, in the server's order, plus any
  // status present in the data but missing from that list.
  const statusChips = useMemo(() => {
    const ordered = uniqueStatuses.filter((s) => statusCounts.counts[s]);
    Object.keys(statusCounts.counts).forEach((s) => {
      if (s && !ordered.includes(s)) ordered.push(s);
    });
    return ordered;
  }, [uniqueStatuses, statusCounts]);

  // The scope the KPIs describe: everything except the "needs attention" narrowing.
  const scopedProjects = useMemo(() => {
    let base = baseProjects;
    if (activeOnly) base = base.filter((p) => !isClosedStatus(p.project_status));
    if (statusFilter.length > 0) {
      const allowed = new Set(statusFilter);
      base = base.filter((p) => allowed.has(p.project_status || ''));
    }
    return base;
  }, [baseProjects, activeOnly, statusFilter]);

  const attentionList = useMemo(
    () => scopedProjects
      .filter((p) => monitorMap[String(p.id)]?.flags.length)
      .sort((a, b) => {
        const ma = monitorMap[String(a.id)];
        const mb = monitorMap[String(b.id)];
        if (ma.severityRank !== mb.severityRank) return ma.severityRank - mb.severityRank;
        return (ma.daysLeft ?? Infinity) - (mb.daysLeft ?? Infinity);
      }),
    [scopedProjects, monitorMap],
  );

  const filteredProjects = useMemo(() => {
    const base = attentionOnly
      ? scopedProjects.filter((p) => monitorMap[String(p.id)]?.flags.length)
      : scopedProjects;

    const sortValue = (p: Project): number | string | null => {
      const m = monitorMap[String(p.id)];
      switch (sortConfig.key) {
        case 'contract':
        case 'contract_amount':
          return m?.contract ?? null;
        case 'backlogs':
          return m?.unbilled ?? null;
        case 'billed_pct':
          return m?.billedPct ?? null;
        case 'progress':
        case 'actual_site_progress_percent':
          return m?.progress ?? null;
        case 'target_date':
          return m?.targetMs ?? null;
        case 'budget_used':
          return m?.budgetUsedPct ?? null;
        case 'spent':
          return m?.spent || null;
        case 'alerts':
          return m?.severityRank ?? null;
        case 'acti_to_ioct_po_number':
          return (p.commercial_trail?.acti_to_ioct_po_number || '').toLowerCase() || null;
        default: {
          const v = p[sortConfig.key as keyof Project];
          if (v == null || v === '') return null;
          return typeof v === 'number' ? v : String(v).toLowerCase();
        }
      }
    };

    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      // Blanks always sink to the bottom, whichever direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [scopedProjects, attentionOnly, monitorMap, sortConfig]);

  // Clamp the page if a filter or delete shrinks the list under it.
  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / rowsPerPage));
  const safePage = Math.min(page, pageCount - 1);
  const pagedProjects = useMemo(
    () => filteredProjects.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage),
    [filteredProjects, safePage, rowsPerPage],
  );

  // "7 overdue · 2 over budget · …" for the needs-attention strip.
  const attentionBreakdown = useMemo(() => {
    const groups: [string, string[]][] = [
      ['overdue', ['overdue']],
      ['due soon', ['due-soon']],
      ['over budget', ['over-budget']],
      ['budget at risk', ['budget-risk']],
      ['price ≠ proposal', ['price']],
      ['done but unbilled', ['unbilled']],
      ['ready to close out', ['closeout']],
    ];
    return groups
      .map(([label, keys]) => ({
        label,
        count: attentionList.filter((p) => monitorMap[String(p.id)]?.flags.some((f) => keys.includes(f.key))).length,
      }))
      .filter((g) => g.count > 0)
      .map((g) => `${g.count} ${g.label}`)
      .join(' · ');
  }, [attentionList, monitorMap]);

  const showActiPoColumn = useMemo(
    () => showDetails && filteredProjects.some((p) => isActiInvolved(p)),
    [filteredProjects, showDetails],
  );

  const summary = useMemo(() => {
    const totals = scopedProjects.reduce(
      (acc, p) => {
        const m = monitorMap[String(p.id)];
        if (!m) return acc;
        acc.contract += m.contract;
        acc.billed += m.billed;
        acc.unbilled += m.unbilled;
        acc.spent += m.spent;
        if (!m.closed) acc.active += 1;
        if (m.flags.some((f) => f.severity !== 'info')) acc.atRisk += 1;
        return acc;
      },
      { contract: 0, billed: 0, unbilled: 0, spent: 0, active: 0, atRisk: 0 },
    );
    return {
      ...totals,
      projectCount: scopedProjects.length,
      attention: attentionList.length,
      billedPct: totals.contract > 0 ? (totals.billed / totals.contract) * 100 : 0,
    };
  }, [scopedProjects, monitorMap, attentionList]);

  const showActive = () => {
    setActiveOnly(true);
    setStatusFilter([]);
  };
  const showAll = () => {
    setActiveOnly(false);
    setStatusFilter([]);
  };
  const toggleStatus = (status: string) => {
    setActiveOnly(false);
    setStatusFilter((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({
      ...prev,
      searchTerm: event.target.value || undefined
    }));
  };

  // Handle project selection
  const handleProjectSelection = (projectId: string, isSelected: boolean) => {
    const newSelected = new Set(selectedProjects);
    if (isSelected) {
      newSelected.add(projectId);
    } else {
      newSelected.delete(projectId);
    }
    setSelectedProjects(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      setSelectedProjects(new Set(filteredProjects.map(p => String(p.id))));
      setShowBulkActions(true);
    } else {
      setSelectedProjects(new Set());
      setShowBulkActions(false);
    }
  };

  // Import from CSV/Excel
  const importFromFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        console.log('Import started - Headers:', headers);
        console.log('Total rows:', lines.length - 1);
        
        const importedProjects: Partial<Project>[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const project: any = {};
          
          headers.forEach((header, index) => {
            const value = values[index];
            
            // Map headers to project properties
            switch (header.toLowerCase()) {
              case 'id':
                project.id = parseInt(value) || 0;
                break;
              case 'item no':
                project.item_no = parseInt(value) || 0;
                break;
              case 'year':
                project.year = parseInt(value) || new Date().getFullYear();
                break;
              case 'am':
                project.am = value;
                break;
              case 'ovp number':
                project.ovp_number = value;
                break;
              case 'po number':
                project.po_number = value;
                break;
              case 'client status':
                project.client_status = value;
                break;
              case 'account name':
                project.account_name = value;
                break;
              case 'project name':
                project.project_name = value;
                break;
              case 'project category':
                project.project_category = value;
                break;
              case 'project location':
                project.project_location = value;
                break;
              case 'scope of work':
                project.scope_of_work = value;
                break;
              case 'qtn no':
                project.qtn_no = value;
                break;
              case 'ovp category':
                project.ovp_category = value;
                break;
              case 'contract amount':
                project.contract_amount = parseFloat(value) || 0;
                break;
              case 'updated contract amount':
                project.updated_contract_amount = parseFloat(value) || 0;
                break;
              case 'project status':
                project.project_status = value;
                break;
              case 'contract billed':
                project.contract_billed = parseFloat(value) || 0;
                break;
              case 'updated contract balance net':
                project.updated_contract_balance_net = parseFloat(value) || 0;
                break;
              case 'with acti':
                project.with_acti = /^(yes|true|1)$/i.test((value || '').trim());
                break;
              case 'partner':
                project.partner_name = value;
                break;
              // Add more field mappings as needed
              default:
                // Handle other fields dynamically
                const fieldName = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
                if (value !== undefined) {
                  project[fieldName] = isNaN(parseFloat(value)) ? value : parseFloat(value);
                }
            }
          });
          
          if (project.project_name) {
            importedProjects.push(project);
          }
        }
        
        console.log(`Successfully imported ${importedProjects.length} projects`);
        
        // Actually add the imported projects to the data service
        const addResult = await dataService.addProjects(importedProjects);
        
        if (addResult.success) {
          // Trigger data refresh to show new projects in UI
          setRefreshTrigger(prev => prev + 1);
          
          const message = addResult.errors.length > 0 
            ? `Successfully imported ${addResult.count || 0} projects from ${file.name}. Issues: ${addResult.errors.slice(0, 3).join(', ')}`
            : `Successfully imported ${addResult.count || 0} projects from ${file.name}`;
          
          alert(message);
          console.log(`Total projects now: ${dataService.getProjectCount()}`);
        } else {
          throw new Error(`Import failed: ${addResult.errors.join(', ')}`);
        }
        
      } catch (error) {
        console.error('Import error:', error);
        alert('Error importing file. Please check the format and try again.');
      }
    };
    
    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Trigger file import
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Handle project added callback
  const handleProjectAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Bulk delete functionality
  const handleBulkDelete = async () => {
    setIsDeleting(true);
    
    try {
      const selectedProjectIds = Array.from(selectedProjects) as string[];
      const selectedProjectNames = filteredProjects
        .filter(p => selectedProjectIds.includes(String(p.id)))
        .map(p => p.project_name);
      
      console.log('Deleting projects with IDs:', selectedProjectIds);
      console.log('Project names:', selectedProjectNames);
      
      // Simulate brief loading for better UX
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Actually delete the projects from the data service.
      // Project ids are Firestore doc ids (opaque strings) — do NOT convert to
      // Number(): that produced NaN for every real id, which serialized to null
      // and made the server delete a non-existent "null" doc. Selection appeared
      // to succeed (no error thrown) but the project was never actually removed.
      const deleteResult = await dataService.deleteProjects(selectedProjectIds);
      
      if (deleteResult.success) {
        // Clear selection and close dialog
        setSelectedProjects(new Set());
        setShowBulkActions(false);
        setDeleteDialogOpen(false);
        
        // Show success message  
        const deletedCount = Array.from(selectedProjects).length;
        const message = deleteResult.errors.length > 0 
          ? `Successfully deleted ${deletedCount} project(s). ${deleteResult.errors.join(', ')}`
          : `Successfully deleted ${deletedCount} project(s)`;
        
        alert(message);
        
        // Force component re-render by triggering data refresh
        setRefreshTrigger(prev => prev + 1);
        console.log(`Projects remaining: ${dataService.getProjectCount()}`);
        
      } else {
        throw new Error(deleteResult.errors.join(', ') || 'Delete operation failed');
      }
      
    } catch (error) {
      console.error('Error deleting projects:', error);
      alert(`Error deleting projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Open delete confirmation dialog
  const handleDeleteConfirmation = () => {
    setDeleteDialogOpen(true);
  };

  // Cancel delete operation
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  // Enhanced CSV export with all fields
  const exportToCSV = () => {
    // Function to escape CSV values properly
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // If value contains comma, double quote, or newline, wrap in quotes and escape internal quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Define headers in exact order
    const headers = [
      'ID',
      'Item No', 
      'Year',
      'AM',
      'OVP Number',
      'PO Number',
      'PO Date',
      'Client Status',
      'Client',
      'Project Name',
      'Project Category',
      'Project Location',
      'Scope of Work',
      'QTN No',
      'OVP Category',
      'Contract Amount',
      'Updated Contract Amount',
      'Down Payment %',
      'Retention %',
      'Start Date',
      'Duration Days',
      'Completion Date',
      'Payment Schedule',
      'Payment Terms',
      'Bonds Requirement',
      'Client Approver',
      'Progress Billing Schedule',
      'Mobilization Date',
      'Updated Completion Date',
      'Project Status',
      'Actual Site Progress %',
      'Actual Progress',
      'Evaluated Progress %',
      'Evaluated Progress',
      'For RFB %',
      'For RFB Amount',
      'RFB Date',
      'Type of RFB',
      'Work in Progress AP',
      'Work in Progress EP',
      'Updated Contract Balance %',
      'Total Contract Balance',
      'Updated Contract Balance Net %',
      'Updated Contract Balance Net',
      'Remarks',
      'Contract Billed Gross %',
      'Contract Billed',
      'Contract Billed Net %',
      'Amount Contract Billed Net',
      'For Retention Billing %',
      'Amount for Retention Billing',
      'Retention Status',
      'Unevaluated Progress',
      'Created At',
      'Updated At',
      'With ACTI',
      'Partner',
      'Customer PO issued to',
      'ACTI PO to IOCT',
      'ACTI PO date',
      'ACTI PO status',
      'Partner SI',
      'Partner SI date',
      'IOCT expected invoice',
      'IOCT expected collection',
    ];

    // Create CSV content with properly aligned data
    const csvContent = [
      headers.join(','),
      ...filteredProjects.map(project => {
        const row = [
          escapeCSV(project.id || ''),
          escapeCSV(project.item_no || ''),
          escapeCSV(project.year || ''),
          escapeCSV(project.am || ''),
          escapeCSV(project.ovp_number || ''),
          escapeCSV(project.po_number || ''),
          escapeCSV(project.po_date ? dataService.formatDate(project.po_date) : ''),
          escapeCSV(project.client_status || ''),
          escapeCSV(project.account_name || ''),
          escapeCSV(project.project_name || ''),
          escapeCSV(project.project_category || ''),
          escapeCSV(project.project_location || ''),
          escapeCSV(project.scope_of_work || ''),
          escapeCSV(project.qtn_no || ''),
          escapeCSV(project.ovp_category || ''),
          escapeCSV(project.contract_amount || 0),
          escapeCSV(project.updated_contract_amount || 0),
          escapeCSV(project.down_payment_percent || 0),
          escapeCSV(project.retention_percent || 0),
          escapeCSV(project.start_date ? dataService.formatDate(project.start_date) : ''),
          escapeCSV(project.duration_days || 0),
          escapeCSV(project.completion_date ? dataService.formatDate(project.completion_date) : ''),
          escapeCSV(project.payment_schedule || ''),
          escapeCSV(project.payment_terms || ''),
          escapeCSV(project.bonds_requirement || ''),
          escapeCSV(project.client_approver || ''),
          escapeCSV(project.progress_billing_schedule || ''),
          escapeCSV(project.mobilization_date ? dataService.formatDate(project.mobilization_date) : ''),
          escapeCSV(project.updated_completion_date ? dataService.formatDate(project.updated_completion_date) : ''),
          escapeCSV(project.project_status || ''),
          escapeCSV(project.actual_site_progress_percent || 0),
          escapeCSV(project.actual_progress || 0),
          escapeCSV(project.evaluated_progress_percent || 0),
          escapeCSV(project.evaluated_progress || 0),
          escapeCSV(project.for_rfb_percent || 0),
          escapeCSV(project.for_rfb_amount || 0),
          escapeCSV(project.rfb_date ? dataService.formatDate(project.rfb_date) : ''),
          escapeCSV(project.type_of_rfb || ''),
          escapeCSV(project.work_in_progress_ap || 0),
          escapeCSV(project.work_in_progress_ep || 0),
          escapeCSV(project.updated_contract_balance_percent || 0),
          escapeCSV(project.total_contract_balance || 0),
          escapeCSV(project.updated_contract_balance_net_percent || 0),
          escapeCSV(project.updated_contract_balance_net || 0),
          escapeCSV(project.remarks || ''),
          escapeCSV(project.contract_billed_gross_percent || 0),
          escapeCSV(project.contract_billed || 0),
          escapeCSV(project.contract_billed_net_percent || 0),
          escapeCSV(project.amount_contract_billed_net || 0),
          escapeCSV(project.for_retention_billing_percent || 0),
          escapeCSV(project.amount_for_retention_billing || 0),
          escapeCSV(project.retention_status || ''),
          escapeCSV(project.unevaluated_progress || 0),
          escapeCSV(project.created_at || ''),
          escapeCSV(project.updated_at || ''),
          escapeCSV(project.with_acti ? 'Yes' : 'No'),
          escapeCSV(project.partner_name || ''),
          escapeCSV(isActiInvolved(project) ? 'ACTI' : 'IOCT'),
          escapeCSV(isActiInvolved(project) ? (project.commercial_trail?.acti_to_ioct_po_number || '') : ''),
          escapeCSV(isActiInvolved(project) ? (project.commercial_trail?.acti_to_ioct_po_date || '') : ''),
          escapeCSV(isActiInvolved(project) ? (project.commercial_trail?.acti_to_ioct_po_status || '') : ''),
          escapeCSV(isActiInvolved(project) ? (project.commercial_trail?.partner_si_no || '') : ''),
          escapeCSV(isActiInvolved(project) ? (project.commercial_trail?.partner_si_date || '') : ''),
          escapeCSV(isActiInvolved(project) ? (project.commercial_trail?.ioct_expected_invoice_date || '') : ''),
          escapeCSV(isActiInvolved(project) ? (project.commercial_trail?.ioct_expected_collection_date || '') : ''),
        ];

        return row.join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projects_complete_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Excel export function
  const exportToExcel = () => {
    // Same headers as CSV for consistency
    const headers = [
      'ID',
      'Item No', 
      'Year',
      'AM',
      'OVP Number',
      'PO Number',
      'PO Date',
      'Client Status',
      'Client',
      'Project Name',
      'Project Category',
      'Project Location',
      'Scope of Work',
      'QTN No',
      'OVP Category',
      'Contract Amount',
      'Updated Contract Amount',
      'Down Payment %',
      'Retention %',
      'Start Date',
      'Duration Days',
      'Completion Date',
      'Payment Schedule',
      'Payment Terms',
      'Bonds Requirement',
      'Client Approver',
      'Progress Billing Schedule',
      'Mobilization Date',
      'Updated Completion Date',
      'Project Status',
      'Actual Site Progress %',
      'Actual Progress',
      'Evaluated Progress %',
      'Evaluated Progress',
      'For RFB %',
      'For RFB Amount',
      'RFB Date',
      'Type of RFB',
      'Work in Progress AP',
      'Work in Progress EP',
      'Updated Contract Balance %',
      'Total Contract Balance',
      'Updated Contract Balance Net %',
      'Updated Contract Balance Net',
      'Remarks',
      'Contract Billed Gross %',
      'Contract Billed',
      'Contract Billed Net %',
      'Amount Contract Billed Net',
      'For Retention Billing %',
      'Amount for Retention Billing',
      'Retention Status',
      'Unevaluated Progress',
      'Created At',
      'Updated At',
      'With ACTI',
      'Partner',
      'Customer PO issued to',
      'ACTI PO to IOCT',
      'ACTI PO date',
      'ACTI PO status',
      'Partner SI',
      'Partner SI date',
      'IOCT expected invoice',
      'IOCT expected collection',
    ];

    // Create BOM for Excel UTF-8 recognition
    const BOM = '\uFEFF';
    
    const csvContent = BOM + [
      headers.join('\t'), // Use tabs for better Excel compatibility
      ...filteredProjects.map(project => {
        const row = [
          project.id || '',
          project.item_no || '',
          project.year || '',
          project.am || '',
          project.ovp_number || '',
          project.po_number || '',
          project.po_date ? dataService.formatDate(project.po_date) : '',
          project.client_status || '',
          project.account_name || '',
          project.project_name || '',
          project.project_category || '',
          project.project_location || '',
          project.scope_of_work || '',
          project.qtn_no || '',
          project.ovp_category || '',
          project.contract_amount || 0,
          project.updated_contract_amount || 0,
          project.down_payment_percent || 0,
          project.retention_percent || 0,
          project.start_date ? dataService.formatDate(project.start_date) : '',
          project.duration_days || 0,
          project.completion_date ? dataService.formatDate(project.completion_date) : '',
          project.payment_schedule || '',
          project.payment_terms || '',
          project.bonds_requirement || '',
          project.client_approver || '',
          project.progress_billing_schedule || '',
          project.mobilization_date ? dataService.formatDate(project.mobilization_date) : '',
          project.updated_completion_date ? dataService.formatDate(project.updated_completion_date) : '',
          project.project_status || '',
          project.actual_site_progress_percent || 0,
          project.actual_progress || 0,
          project.evaluated_progress_percent || 0,
          project.evaluated_progress || 0,
          project.for_rfb_percent || 0,
          project.for_rfb_amount || 0,
          project.rfb_date ? dataService.formatDate(project.rfb_date) : '',
          project.type_of_rfb || '',
          project.work_in_progress_ap || 0,
          project.work_in_progress_ep || 0,
          project.updated_contract_balance_percent || 0,
          project.total_contract_balance || 0,
          project.updated_contract_balance_net_percent || 0,
          project.updated_contract_balance_net || 0,
          project.remarks || '',
          project.contract_billed_gross_percent || 0,
          project.contract_billed || 0,
          project.contract_billed_net_percent || 0,
          project.amount_contract_billed_net || 0,
          project.for_retention_billing_percent || 0,
          project.amount_for_retention_billing || 0,
          project.retention_status || '',
          project.unevaluated_progress || 0,
          project.created_at || '',
          project.updated_at || '',
          project.with_acti ? 'Yes' : 'No',
          project.partner_name || '',
          isActiInvolved(project) ? 'ACTI' : 'IOCT',
          isActiInvolved(project) ? (project.commercial_trail?.acti_to_ioct_po_number || '') : '',
          isActiInvolved(project) ? (project.commercial_trail?.acti_to_ioct_po_date || '') : '',
          isActiInvolved(project) ? (project.commercial_trail?.acti_to_ioct_po_status || '') : '',
          isActiInvolved(project) ? (project.commercial_trail?.partner_si_no || '') : '',
          isActiInvolved(project) ? (project.commercial_trail?.partner_si_date || '') : '',
          isActiInvolved(project) ? (project.commercial_trail?.ioct_expected_invoice_date || '') : '',
          isActiInvolved(project) ? (project.commercial_trail?.ioct_expected_collection_date || '') : '',
        ];

        return row.join('\t');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projects_excel_${new Date().toISOString().split('T')[0]}.xls`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const headCellSx = { fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap' as const };
  const sortableHead = (key: string, label: string, align: 'left' | 'right' = 'left') => (
    <TableCell align={align} sx={headCellSx} sortDirection={sortConfig.key === key ? sortConfig.direction : false}>
      <TableSortLabel
        active={sortConfig.key === key}
        direction={sortConfig.key === key ? sortConfig.direction : 'asc'}
        onClick={() => handleSort(key)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );

  const kpiCards: {
    label: string;
    value: string;
    caption: string;
    title?: string;
    gradient: string;
    dark?: boolean;
    onClick?: () => void;
    selected?: boolean;
  }[] = [
    {
      label: activeOnly ? 'Active Projects' : 'Projects',
      value: String(summary.projectCount),
      caption: activeOnly ? `of ${statusCounts.all} total` : `${summary.active} still active`,
      gradient: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`,
    },
    {
      label: 'Contract Value',
      value: formatCompact(summary.contract),
      title: dataService.formatCurrency(summary.contract),
      caption: 'updated contract amount',
      gradient: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.secondary} 0%, ${NET_PACIFIC_COLORS.accent2} 100%)`,
    },
    {
      label: 'Billed',
      value: formatCompact(summary.billed),
      title: dataService.formatCurrency(summary.billed),
      caption: `${summary.billedPct.toFixed(0)}% of contract`,
      gradient: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`,
    },
    {
      label: 'Unbilled (Backlog)',
      value: formatCompact(summary.unbilled),
      title: dataService.formatCurrency(summary.unbilled),
      caption: 'still to invoice',
      gradient: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`,
    },
    {
      label: 'Project Spend',
      value: formatCompact(summary.spent),
      title: dataService.formatCurrency(summary.spent),
      caption: spendMonitor
        ? `${formatCompact(spendMonitor.untagged.totals.all)} not tagged to a project · tap to view`
        : 'from Finance (liquidations, POs, expenses)',
      gradient: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent2} 0%, ${NET_PACIFIC_COLORS.info} 100%)`,
      onClick: () => untaggedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
    {
      label: 'Needs Attention',
      value: String(summary.attention),
      caption: attentionOnly ? 'showing only these · tap to clear' : `${summary.atRisk} late or over budget · tap to filter`,
      gradient: summary.attention > 0
        ? `linear-gradient(135deg, ${NET_PACIFIC_COLORS.error} 0%, #fd79a8 100%)`
        : `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`,
      dark: summary.attention === 0,
      onClick: () => setAttentionOnly((v) => !v),
      selected: attentionOnly,
    },
  ];

  const mobileSortOptions: { key: string; dir: 'asc' | 'desc'; label: string }[] = [
    { key: 'alerts', dir: 'asc', label: 'Most urgent' },
    { key: 'target_date', dir: 'asc', label: 'Target date' },
    { key: 'project_name', dir: 'asc', label: 'Name' },
    { key: 'contract', dir: 'desc', label: 'Contract' },
    { key: 'backlogs', dir: 'desc', label: 'Unbilled' },
    { key: 'progress', dir: 'asc', label: 'Site progress' },
  ];

  // Render dashboard
  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      {/* Title + page actions */}
      <Box sx={{ mb: 1.5, display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            Project Monitoring Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Progress, billing, deadlines and budget for every project — as of{' '}
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Typography>
        </Box>
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={importFromFile}
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddProjectDialogOpen(true)}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add Project
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadIcon />}
            onClick={handleImportClick}
            sx={{
              borderColor: NET_PACIFIC_COLORS.primary,
              color: NET_PACIFIC_COLORS.primary,
              '&:hover': { borderColor: NET_PACIFIC_COLORS.secondary, backgroundColor: 'rgba(44, 90, 160, 0.04)' },
            }}
          >
            Import
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            endIcon={<ArrowDownIcon />}
            onClick={(e) => setExportMenuAnchor(e.currentTarget)}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Export
          </Button>
          <Menu
            anchorEl={exportMenuAnchor}
            open={Boolean(exportMenuAnchor)}
            onClose={() => setExportMenuAnchor(null)}
            PaperProps={{ sx: { mt: 1, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', borderRadius: 2 } }}
          >
            <MenuItem onClick={() => { exportToCSV(); setExportMenuAnchor(null); }}>
              <ListItemIcon>
                <CsvIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Export as CSV" />
            </MenuItem>
            <MenuItem onClick={() => { exportToExcel(); setExportMenuAnchor(null); }}>
              <ListItemIcon>
                <ExcelIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Export as Excel" />
            </MenuItem>
          </Menu>
        </Stack>
      </Box>

      {/* KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' },
          gap: { xs: 1, sm: 1.5 },
          mb: 2,
        }}
      >
        {kpiCards.map((card) => {
          const textColor = card.dark ? '#2d3436' : 'white';
          const body = (
            <CardContent sx={{ p: { xs: 1.25, sm: 2 }, '&:last-child': { pb: { xs: 1.25, sm: 2 } } }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9, color: textColor, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>{card.label}</Typography>
              <Typography variant="h5" component="div" title={card.title} sx={{ fontWeight: 700, lineHeight: 1.1, color: textColor, fontSize: { xs: '1.15rem', sm: '1.5rem' } }}>
                {card.value}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.85, color: textColor, display: { xs: 'none', sm: 'block' }, mt: 0.5 }}>
                {card.caption}
              </Typography>
            </CardContent>
          );
          return (
            <Card
              key={card.label}
              sx={{
                background: card.gradient,
                color: textColor,
                outline: card.selected ? '3px solid' : 'none',
                outlineColor: NET_PACIFIC_COLORS.secondary,
                outlineOffset: 2,
              }}
            >
              {card.onClick ? <CardActionArea onClick={card.onClick} sx={{ height: '100%' }}>{body}</CardActionArea> : body}
            </Card>
          );
        })}
      </Box>

      {/* Needs attention — one line; the KPI card and the Alerts column carry the detail */}
      {attentionList.length > 0 && !attentionOnly && (
        <Paper
          sx={{
            px: 2, py: 1, mb: 1.5, borderRadius: 2, border: '1px solid #f5c2c0', bgcolor: '#fff8f8',
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.5,
          }}
        >
          <WarningAmberIcon sx={{ color: '#c62828' }} fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#2d3436' }}>
            {attentionList.length} need{attentionList.length === 1 ? 's' : ''} attention
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ flex: '1 1 200px', minWidth: 0 }}>
            {attentionBreakdown}
          </Typography>
          <Button size="small" onClick={() => setAttentionOnly(true)} sx={{ color: NET_PACIFIC_COLORS.primary, whiteSpace: 'nowrap' }}>
            Show them
          </Button>
        </Paper>
      )}

      {/* Filters */}
      <Paper sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              fullWidth
              placeholder="Search project, client, PO, code…"
              value={filters.searchTerm || ''}
              onChange={handleSearchChange}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Client</InputLabel>
              <Select
                value={filters.client || ''}
                onChange={(e) => setFilters((prev) => ({
                  ...prev,
                  client: e.target.value || undefined,
                }))}
                label="Client"
              >
                <MenuItem value="">All</MenuItem>
                {uniqueClients.map((client) => (
                  <MenuItem key={client} value={client}>{client}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, sm: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Year</InputLabel>
              <Select
                value={filters.year?.toString() || ''}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  year: e.target.value ? parseInt(e.target.value) : undefined
                }))}
                label="Year"
              >
                <MenuItem value="">All Years</MenuItem>
                {uniqueYears.map(year => (
                  <MenuItem key={year} value={year.toString()}>{year}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, sm: 6, md: 3 }}>
            <Chip
              label="With ACTI only"
              color={filterActi ? 'primary' : 'default'}
              variant={filterActi ? 'filled' : 'outlined'}
              onClick={() => setFilterActi(v => !v)}
              clickable
            />
          </Grid>
        </Grid>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5, alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Status:</Typography>
          <Chip
            size="small"
            label={`Active (${statusCounts.active})`}
            color={activeOnly ? 'primary' : 'default'}
            variant={activeOnly ? 'filled' : 'outlined'}
            onClick={showActive}
            clickable
          />
          <Chip
            size="small"
            label={`All (${statusCounts.all})`}
            color={!activeOnly && statusFilter.length === 0 ? 'primary' : 'default'}
            variant={!activeOnly && statusFilter.length === 0 ? 'filled' : 'outlined'}
            onClick={showAll}
            clickable
          />
          <Box sx={{ width: '1px', height: 20, bgcolor: 'divider', mx: 0.5 }} />
          {statusChips.map((status) => {
            const selected = statusFilter.includes(status);
            const color = dataService.getStatusColor(status);
            return (
              <Chip
                key={status || '(blank)'}
                size="small"
                label={`${status || 'No status'} (${statusCounts.counts[status] || 0})`}
                onClick={() => toggleStatus(status)}
                clickable
                variant={selected ? 'filled' : 'outlined'}
                sx={selected
                  ? { bgcolor: color, color: 'white', '&:hover': { bgcolor: color, opacity: 0.9 } }
                  : { borderColor: color, color: '#2d3436' }}
              />
            );
          })}
        </Box>
      </Paper>

      {/* Projects Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, flexGrow: 1 }}>
        <Box sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 1, justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
              Projects ({filteredProjects.length})
            </Typography>
            {attentionOnly && (
              <Chip
                size="small"
                label="Needs attention only"
                onDelete={() => setAttentionOnly(false)}
                sx={FLAG_CHIP_SX.error}
              />
            )}
          </Box>
          {isPhone ? (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Sort by</InputLabel>
              <Select
                label="Sort by"
                value={mobileSortOptions.some((o) => o.key === sortConfig.key) ? sortConfig.key : ''}
                onChange={(e) => {
                  const opt = mobileSortOptions.find((o) => o.key === e.target.value);
                  if (opt) setSortConfig({ key: opt.key, direction: opt.dir });
                }}
              >
                {mobileSortOptions.map((o) => <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          ) : (
            <FormControlLabel
              control={<Switch size="small" checked={showDetails} onChange={(e) => setShowDetails(e.target.checked)} />}
              label={<Typography variant="body2">Show PO / ACTI details</Typography>}
              sx={{ mr: 0 }}
            />
          )}
        </Box>

        {/* Bulk Actions */}
        {showBulkActions && (
          <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid #e0e0e0' }}>
            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} alignItems="center" justifyContent="space-between">
              <Typography variant="body2" color="textSecondary">
                {selectedProjects.size} project(s) selected
              </Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setSelectedProjects(new Set());
                    setShowBulkActions(false);
                  }}
                >
                  Clear Selection
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleDeleteConfirmation}
                  sx={{
                    backgroundColor: '#d32f2f',
                    '&:hover': {
                      backgroundColor: '#b71c1c'
                    }
                  }}
                >
                  Delete Selected ({selectedProjects.size})
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}

        {isPhone && filteredProjects.length > 0 ? (
          /* Phones: one tappable card per project instead of the wide table */
          <Stack spacing={1} sx={{ p: 1 }}>
            {pagedProjects.map((project) => {
              const m = monitorMap[String(project.id)];
              if (!m) return null;
              const leftBorder = m.severityRank === 0 ? '#d32f2f' : m.severityRank === 1 ? '#ed6c02' : '#e0e0e0';
              return (
                <Card key={project.id} variant="outlined" sx={{ borderLeft: `3px solid ${leftBorder}`, opacity: m.closed ? 0.75 : 1 }}>
                  <CardActionArea onClick={() => onProjectSelect(project)} sx={{ p: 1.25 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>{project.project_name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap component="div">
                          {[project.project_no || (project.item_no ?? project.id), project.account_name, project.with_acti ? 'ACTI' : '']
                            .filter(Boolean).join(' · ')}
                        </Typography>
                      </Box>
                      <Chip
                        label={project.project_status || '—'}
                        size="small"
                        sx={{ backgroundColor: dataService.getStatusColor(project.project_status || ''), color: 'white', fontSize: '0.62rem', height: 18, fontWeight: 600, flexShrink: 0 }}
                      />
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 1 }}>
                      <MiniBar value={m.progress} color={m.progress >= 100 ? NET_PACIFIC_COLORS.success : NET_PACIFIC_COLORS.primary}
                        label={`${Math.round(m.progress)}%`} caption="progress" />
                      <MiniBar value={m.billedPct} color={NET_PACIFIC_COLORS.success} label={`${Math.round(m.billedPct)}%`} caption="billed" />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Contract <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{formatCompact(m.contract)}</Box>
                        {' · '}Unbilled <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{formatCompact(m.unbilled)}</Box>
                      </Typography>
                      {m.targetMs && (
                        <Typography variant="caption" sx={{ whiteSpace: 'nowrap', color: !m.closed && m.daysLeft != null && m.daysLeft < 0 && m.progress < 100 ? 'error.main' : 'text.secondary' }}>
                          {dataService.formatDate(m.targetMs)}
                        </Typography>
                      )}
                    </Box>
                    {m.flags.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                        {m.flags.map((f) => <FlagChip key={f.key} flag={f} />)}
                      </Box>
                    )}
                  </CardActionArea>
                </Card>
              );
            })}
          </Stack>
        ) : (
        <TableContainer sx={{ minHeight: 200 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    indeterminate={selectedProjects.size > 0 && selectedProjects.size < filteredProjects.length}
                    checked={selectedProjects.size === filteredProjects.length && filteredProjects.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </TableCell>
                {sortableHead('project_name', 'Project')}
                {sortableHead('project_status', 'Status')}
                {sortableHead('progress', 'Site Progress')}
                {sortableHead('billed_pct', 'Billed')}
                {sortableHead('contract', 'Contract', 'right')}
                {sortableHead('backlogs', 'Unbilled', 'right')}
                {sortableHead('target_date', 'Target Completion')}
                {sortableHead('spent', 'Spent vs Budget')}
                {sortableHead('alerts', 'Alerts')}
                {showDetails && sortableHead('po_number', 'PO Number')}
                {showDetails && sortableHead('po_date', 'PO Date')}
                {showActiPoColumn && sortableHead('acti_to_ioct_po_number', 'ACTI PO (to IOCT)')}
                {showActiPoColumn && <TableCell sx={headCellSx}>ACTI trail</TableCell>}
                {showDetails && sortableHead('client_approver', 'Client Approver')}
                {showDetails && sortableHead('year', 'Year')}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProjects.length === 0 && (
                <TableRow>
                  <TableCell colSpan={20} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      {loading ? 'Loading projects…' : 'No projects match these filters.'}
                    </Typography>
                    {!loading && (activeOnly || statusFilter.length > 0 || attentionOnly) && (
                      <Button size="small" sx={{ mt: 1 }} onClick={() => { showAll(); setAttentionOnly(false); }}>
                        Show all statuses
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {pagedProjects.map((project) => {
                const m = monitorMap[String(project.id)];
                if (!m) return null;
                const statusColor = dataService.getStatusColor(project.project_status || '');
                const budgetColor = m.budgetUsedPct == null
                  ? '#bdbdbd'
                  : m.budgetUsedPct > 100 ? '#d32f2f' : m.budgetUsedPct >= 80 ? '#ed6c02' : NET_PACIFIC_COLORS.success;
                const leftBorder = m.severityRank === 0 ? '#d32f2f' : m.severityRank === 1 ? '#ed6c02' : 'transparent';
                return (
                  <TableRow
                    key={project.id}
                    hover
                    onClick={() => onProjectSelect(project)}
                    sx={{
                      cursor: 'pointer',
                      '&:nth-of-type(odd)': { backgroundColor: 'rgba(0, 0, 0, 0.02)' },
                      '& > td:first-of-type': { borderLeft: `3px solid ${leftBorder}` },
                      opacity: m.closed ? 0.75 : 1,
                    }}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={selectedProjects.has(String(project.id))}
                        onChange={(e) => handleProjectSelection(String(project.id), e.target.checked)}
                      />
                    </TableCell>
                    <TableCell sx={{ width: '26%', maxWidth: 0, minWidth: 200 }}>
                      <Typography variant="body2" noWrap title={project.project_name} sx={{ fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.3 }}>
                        {project.project_name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {[project.project_no || (project.item_no ?? project.id), project.account_name].filter(Boolean).join(' · ')}
                        </Typography>
                        {project.with_acti && (
                          <Chip
                            label="ACTI"
                            size="small"
                            color="primary"
                            variant="outlined"
                            title={project.partner_name || 'Joint with ACTI'}
                            sx={{ fontSize: '0.62rem', height: 16, flexShrink: 0 }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={project.project_status || '—'}
                        size="small"
                        sx={{ backgroundColor: statusColor, color: 'white', fontSize: '0.68rem', height: 20, fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>
                      <MiniBar
                        value={m.progress}
                        color={m.progress >= 100 ? NET_PACIFIC_COLORS.success : NET_PACIFIC_COLORS.primary}
                        label={`${Math.round(m.progress)}%`}
                      />
                    </TableCell>
                    <TableCell title={`Billed ${dataService.formatCurrency(m.billed)} of ${dataService.formatCurrency(m.contract)}`}>
                      <MiniBar
                        value={m.billedPct}
                        color={NET_PACIFIC_COLORS.success}
                        label={`${Math.round(m.billedPct)}%`}
                      />
                    </TableCell>
                    <TableCell align="right" title={dataService.formatCurrency(m.contract)}>
                      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {formatCompact(m.contract)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" title={dataService.formatCurrency(m.unbilled)}>
                      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem', whiteSpace: 'nowrap', color: m.unbilled > 0 ? 'text.primary' : 'text.disabled' }}>
                        {formatCompact(m.unbilled)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {m.targetMs ? (
                        <>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {dataService.formatDate(m.targetMs)}
                          </Typography>
                          {!m.closed && m.daysLeft != null && m.progress < 100 && (
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: m.daysLeft <= DUE_SOON_DAYS ? 600 : 400,
                                color: m.daysLeft < 0 ? 'error.main' : m.daysLeft <= DUE_SOON_DAYS ? 'warning.dark' : 'text.secondary',
                              }}
                            >
                              {m.daysLeft < 0 ? `${-m.daysLeft}d overdue` : m.daysLeft === 0 ? 'Due today' : `${m.daysLeft}d left`}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography variant="caption" color="text.disabled">Not set</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      <SpendCell
                        m={m}
                        spend={spendMonitor?.byProject[String(project.id)]}
                        color={budgetColor}
                        onOpen={() => navigate(`/finance/projects/${encodeURIComponent(String(project.id))}/expenses`)}
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 140 }}>
                      {m.flags.length ? (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {m.flags.map((f) => <FlagChip key={f.key} flag={f} />)}
                        </Box>
                      ) : (
                        <Typography variant="caption" sx={{ color: m.closed || !m.targetMs ? 'text.disabled' : 'success.main', fontWeight: 600 }}>
                          {m.closed ? '—' : m.targetMs ? 'On track' : 'No target date'}
                        </Typography>
                      )}
                    </TableCell>
                    {showDetails && (
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {project.po_number || '—'}
                          </Typography>
                          {isActiInvolved(project) && project.po_number && (
                            <Chip label="to ACTI" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                          )}
                        </Box>
                      </TableCell>
                    )}
                    {showDetails && (
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {project.po_date ? dataService.formatDate(project.po_date) : '—'}
                        </Typography>
                      </TableCell>
                    )}
                    {showActiPoColumn && (
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {isActiInvolved(project) ? actiToIoctPoLabel(project.commercial_trail) : '—'}
                        </Typography>
                      </TableCell>
                    )}
                    {showActiPoColumn && (
                      <TableCell sx={{ minWidth: 160 }}>
                        {(() => {
                          if (!isActiInvolved(project)) {
                            return <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>—</Typography>;
                          }
                          const lines = actiTrailSummary(project.commercial_trail);
                          if (lines.length === 0) {
                            return (
                              <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                                No trail yet
                              </Typography>
                            );
                          }
                          return lines.map((line) => (
                            <Typography key={line} variant="body2" sx={{ fontSize: '0.75rem', lineHeight: 1.35 }}>
                              {line}
                            </Typography>
                          ));
                        })()}
                      </TableCell>
                    )}
                    {showDetails && (
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {project.client_approver || '—'}
                        </Typography>
                      </TableCell>
                    )}
                    {showDetails && (
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {project.year ?? '—'}
                        </Typography>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        )}

        {filteredProjects.length > 0 && (
          <TablePagination
            component="div"
            count={filteredProjects.length}
            page={safePage}
            onPageChange={(_, next) => setPage(next)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100]}
            labelRowsPerPage={isPhone ? 'Per page' : 'Rows per page'}
            sx={{ borderTop: '1px solid #e0e0e0' }}
          />
        )}
      </Paper>

      <UntaggedExpensesPanel ref={untaggedRef} monitor={spendMonitor} year={filters.year} error={spendError} />

      {/* Trends (collapsed by default — the table above is the monitoring view) */}
      <Paper sx={{ mt: 2, borderRadius: 2, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <Button
          fullWidth
          onClick={() => setShowCharts((v) => !v)}
          endIcon={showCharts ? <ArrowUpIcon /> : <ArrowDownIcon />}
          sx={{ justifyContent: 'space-between', px: 2, py: 1.25, color: NET_PACIFIC_COLORS.primary, fontWeight: 600, textTransform: 'none', fontSize: '1rem' }}
        >
          Yearly trends &amp; status mix
        </Button>
        <Collapse in={showCharts} unmountOnExit>
          <Grid container spacing={1.5} sx={{ p: 2, pt: 0 }}>
            <Grid size={{ xs: 12, lg: 7 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: '#2c5aa0' }}>
                Contract vs backlog by year, with cumulative billing %
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={yearSummaries.map((summary, index, arr) => {
                    let cumulativeContracts = 0;
                    let cumulativeBilled = 0;
                    for (let i = 0; i <= index; i++) {
                      cumulativeContracts += arr[i].totalContractAmount;
                      cumulativeBilled += arr[i].totalBilledAmount;
                    }
                    return {
                      ...summary,
                      cumulativeContracts,
                      cumulativeBilled,
                      completionPercentage: cumulativeContracts > 0 ? (cumulativeBilled / cumulativeContracts * 100) : 0
                    };
                  })}
                  margin={{ top: 20, right: 20, bottom: 5, left: 0 }}
                >
                  <defs>
                    <linearGradient id="contractGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={NET_PACIFIC_COLORS.primary} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={NET_PACIFIC_COLORS.primary} stopOpacity={0.3}/>
                    </linearGradient>
                    <linearGradient id="billedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={NET_PACIFIC_COLORS.success} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={NET_PACIFIC_COLORS.success} stopOpacity={0.3}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(value) => formatCompact(value)}
                    width={70}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(value) => `${value}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      fontSize: '12px'
                    }}
                    formatter={(value: number, name: string, item: any) => {
                      const key = item?.dataKey || name;
                      const n = typeof value === 'number' ? value : Number(value);
                      if (key === 'completionPercentage' || name === 'Billed to date (%)') {
                        return [`${n.toFixed(2)}%`, 'Billed to date (%)'];
                      }
                      if (key === 'totalBacklogs' || name === 'Backlogs') {
                        return [dataService.formatCurrency(n), 'Backlogs'];
                      }
                      if (key === 'totalContractAmount' || name === 'Contract Amount') {
                        return [dataService.formatCurrency(n), 'Contract Amount'];
                      }
                      return [dataService.formatCurrency(n), name];
                    }}
                    labelFormatter={(label) => `Year ${String(label)}`}
                  />
                  <Legend iconSize={8} />
                  <Bar yAxisId="left" dataKey="totalContractAmount" fill="url(#contractGradient)" name="Contract Amount" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="left" dataKey="totalBacklogs" fill="url(#billedGradient)" name="Backlogs" radius={[3, 3, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="completionPercentage"
                    stroke={NET_PACIFIC_COLORS.warning}
                    strokeWidth={3}
                    dot={{ fill: NET_PACIFIC_COLORS.warning, strokeWidth: 2, r: 4 }}
                    name="Billed to date (%)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Grid>
            <Grid size={{ xs: 12, lg: 5 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: '#2c5aa0' }}>
                Projects by status (all years)
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    dataKey="value"
                    nameKey="name"
                  >
                    {statusDistribution.map((entry) => (
                      <Cell key={entry.name} fill={dataService.getStatusColor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value} projects`, '']} />
                  <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </Grid>
          </Grid>
        </Collapse>
      </Paper>


      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        PaperProps={{
          sx: {
            borderRadius: 3,
            minWidth: { xs: 0, sm: 400 }
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1, 
          color: '#d32f2f',
          pb: 1
        }}>
          <WarningIcon />
          Confirm Project Deletion
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone. All project data will be permanently deleted.
          </Alert>
          <DialogContentText>
            Are you sure you want to delete <strong>{selectedProjects.size}</strong> selected project(s)?
          </DialogContentText>
          {selectedProjects.size <= 5 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Projects to be deleted:
              </Typography>
              <Box sx={{ pl: 2 }}>
                {filteredProjects
                  .filter(p => selectedProjects.has(String(p.id)))
                  .map(project => (
                    <Typography key={project.id} variant="body2" sx={{ mb: 0.5 }}>
                      • {project.project_no || (project.item_no ?? project.id)} – {project.project_name}
                    </Typography>
                  ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button 
            onClick={handleDeleteCancel}
            variant="outlined"
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleBulkDelete}
            variant="contained" 
            color="error"
            disabled={isDeleting}
            startIcon={isDeleting ? null : <DeleteIcon />}
            sx={{
              backgroundColor: '#d32f2f',
              '&:hover': {
                backgroundColor: '#b71c1b'
              }
            }}
          >
            {isDeleting ? 'Deleting...' : `Delete ${selectedProjects.size} Project(s)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Project Dialog */}
      <AddProjectDialog
        open={addProjectDialogOpen}
        onClose={() => setAddProjectDialogOpen(false)}
        onProjectAdded={handleProjectAdded}
      />
    </Box>
  );
};

export default Dashboard;
