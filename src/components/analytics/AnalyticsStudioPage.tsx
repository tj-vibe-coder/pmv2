import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip as MuiTooltip,
  Typography,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PieChartIcon from '@mui/icons-material/PieChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SortIcon from '@mui/icons-material/Sort';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import LayersIcon from '@mui/icons-material/Layers';
import BusinessIcon from '@mui/icons-material/Business';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLocation, useNavigate } from 'react-router-dom';
import dataService from '../../services/dataService';
import { useQuotationStore } from '../../store/quotationStore';
import { computeTotals } from '../../utils/calcsheet/calc';
import { API_BASE } from '../../config/api';
import type { AiChart, AiChartType } from '../../types/AiAssist';
import type { Quotation } from '../../types/Quotation';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
  accent: '#00a8cc',
  teal: '#059669',
  amber: '#d97706',
  purple: '#7c3aed',
  slate: '#64748b',
};

const CATEGORICAL_PALETTE = [
  '#2c5aa0',
  '#00a8cc',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#e11d48',
  '#475569',
  '#0284c7',
  '#16a34a',
  '#ca8a04',
];

const SEQUENTIAL_LIGHT = '#c9dbf0';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(from: string, to: string, t: number): string {
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${mix(fr, tr)}${mix(fg, tg)}${mix(fb, tb)}`;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('netpacific_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function newest(a: Quotation, b: Quotation): number {
  const ra = parseInt(a.revision || '0', 10) || 0;
  const rb = parseInt(b.revision || '0', 10) || 0;
  if (rb !== ra) return rb - ra;
  return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
}

export type StudioScope = 'projects' | 'sales' | 'finance';
type DimensionType = 'category' | 'status' | 'year' | 'client' | 'grade';
type MetricType = 'total_amount' | 'total_balance' | 'total_billed' | 'count' | 'average_amount';

interface DataThread {
  id: string;
  title: string;
  scope: StudioScope;
  dimension: DimensionType;
  metric: MetricType;
  chartType: AiChartType | 'table';
  scopeFilter: string;
  timestamp: string;
}

const SCOPE_CONFIG = {
  projects: {
    title: 'Projects Analytics Studio',
    subtitle: 'Visual data formulation for operational project portfolios, billings, contract balances, and category execution.',
    icon: <BusinessIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
    dimensions: [
      { key: 'category', label: 'Project Category (HVAC, Electrical, etc.)' },
      { key: 'status', label: 'Execution Status (In Progress, Completed, etc.)' },
      { key: 'year', label: 'Fiscal / Project Year' },
      { key: 'client', label: 'Client Account Name' },
    ],
    metrics: [
      { key: 'total_amount', label: 'Total Contract Amount (PHP)' },
      { key: 'total_balance', label: 'Remaining Contract Balance (PHP)' },
      { key: 'total_billed', label: 'Total Billed Net (PHP)' },
      { key: 'count', label: 'Project Count' },
      { key: 'average_amount', label: 'Average Project Size (PHP)' },
    ],
    presets: [
      { label: 'Project Balances by Category', dimension: 'category', metric: 'total_balance', chartType: 'bar' },
      { label: 'Contract Amounts by Status', dimension: 'status', metric: 'total_amount', chartType: 'bar' },
      { label: 'Yearly Project Growth', dimension: 'year', metric: 'total_amount', chartType: 'line' },
      { label: 'Top Clients by Project Volume', dimension: 'client', metric: 'total_amount', chartType: 'bar' },
      { label: 'Average Contract Size by Category', dimension: 'category', metric: 'average_amount', chartType: 'donut' },
    ],
  },
  sales: {
    title: 'Sales Analytics Studio',
    subtitle: 'Visual data formulation for quotation pipeline, deal win rates, opportunity grading, and customer accounts.',
    icon: <QueryStatsIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
    dimensions: [
      { key: 'grade', label: 'Opportunity Grade (Grade A, B, C, D)' },
      { key: 'status', label: 'Deal Status (Draft, Sent, Won, Lost)' },
      { key: 'year', label: 'Quotation Year / Sent Year' },
      { key: 'client', label: 'Target Account / Client Name' },
    ],
    metrics: [
      { key: 'total_amount', label: 'Pipeline / Quoted Deal Value (PHP)' },
      { key: 'count', label: 'Deal / Quotation Count' },
      { key: 'average_amount', label: 'Average Deal Size (PHP)' },
    ],
    presets: [
      { label: 'Pipeline Value by Opportunity Grade', dimension: 'grade', metric: 'total_amount', chartType: 'bar' },
      { label: 'Opportunity Volume by Status', dimension: 'status', metric: 'total_amount', chartType: 'donut' },
      { label: 'Win/Loss Deals by Account', dimension: 'client', metric: 'total_amount', chartType: 'bar' },
      { label: 'Yearly Quoted Deal Trend', dimension: 'year', metric: 'total_amount', chartType: 'line' },
      { label: 'Average Opportunity Size by Grade', dimension: 'grade', metric: 'average_amount', chartType: 'bar' },
    ],
  },
  finance: {
    title: 'Finance Analytics Studio',
    subtitle: 'Visual data formulation for project & overhead expenses, cash advance liquidations, and Statement of Account monitoring.',
    icon: <AccountBalanceIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />,
    dimensions: [
      { key: 'category', label: 'Expense Category (Fuel, Materials, Labor, Overhead)' },
      { key: 'status', label: 'Payment / SOA Status (With PO, Pending PO, Settled)' },
      { key: 'year', label: 'Fiscal Year / Month' },
      { key: 'client', label: 'Payee / Partner / Client' },
    ],
    metrics: [
      { key: 'total_amount', label: 'Total Expense Amount (PHP)' },
      { key: 'total_balance', label: 'Unliquidated / Outstanding Balance (PHP)' },
      { key: 'count', label: 'Transaction / Record Count' },
      { key: 'average_amount', label: 'Average Expense (PHP)' },
    ],
    presets: [
      { label: 'Expense Breakdown by Category', dimension: 'category', metric: 'total_amount', chartType: 'donut' },
      { label: 'SOA Status: With PO vs Pending PO', dimension: 'status', metric: 'total_amount', chartType: 'bar' },
      { label: 'Cash Advance Liquidation Balance', dimension: 'category', metric: 'total_balance', chartType: 'bar' },
      { label: 'Yearly Expenditure Trend', dimension: 'year', metric: 'total_amount', chartType: 'line' },
      { label: 'Average Expense by Category', dimension: 'category', metric: 'average_amount', chartType: 'bar' },
    ],
  },
} as const;

interface AnalyticsStudioPageProps {
  domainScope?: StudioScope;
}

export default function AnalyticsStudioPage({ domainScope }: AnalyticsStudioPageProps): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();

  // Resolve scope from prop or pathname
  const activeScope: StudioScope = useMemo(() => {
    if (domainScope) return domainScope;
    if (location.pathname.includes('/sales')) return 'sales';
    if (location.pathname.includes('/finance')) return 'finance';
    return 'projects';
  }, [domainScope, location.pathname]);

  const config = SCOPE_CONFIG[activeScope];

  // State for visual encoding shelves
  const [dimension, setDimension] = useState<DimensionType>(
    activeScope === 'sales' ? 'grade' : 'category'
  );
  const [metric, setMetric] = useState<MetricType>('total_amount');
  const [chartType, setChartType] = useState<AiChartType | 'table'>('bar');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [promptInput, setPromptInput] = useState<string>('');
  const [sortAscending, setSortAscending] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Data Threads (Exploration History)
  const [threads, setThreads] = useState<DataThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('default');

  // Raw domain records
  const [rawProjects, setRawProjects] = useState<any[]>([]);
  const [rawExpenses, setRawExpenses] = useState<any[]>([]);
  const { projects: salesOpportunities, quotations: salesQuotations, clients: salesClients, init: initSalesStore } = useQuotationStore();

  // Reset default shelf parameters when switching studio scope
  useEffect(() => {
    if (activeScope === 'sales') {
      setDimension('grade');
    } else {
      setDimension('category');
    }
    setMetric('total_amount');
    setScopeFilter('all');
    setChartType('bar');

    // Create fresh initial thread for this scope
    const initThreadId = `thread-${activeScope}-init`;
    setThreads([
      {
        id: initThreadId,
        title: config.presets[0]?.label || `${activeScope.toUpperCase()} Overview`,
        scope: activeScope,
        dimension: activeScope === 'sales' ? 'grade' : 'category',
        metric: 'total_amount',
        chartType: 'bar',
        scopeFilter: 'all',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setActiveThreadId(initThreadId);
  }, [activeScope]);

  // Load domain data
  const loadData = async () => {
    setLoading(true);
    try {
      if (activeScope === 'projects') {
        const projects = await dataService.getProjects();
        setRawProjects(projects || []);
      } else if (activeScope === 'sales') {
        await initSalesStore();
      } else if (activeScope === 'finance') {
        const [projExpRes, ovhExpRes, caRes, soaRes] = await Promise.allSettled([
          fetch(`${API_BASE}/api/project-expenses`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
          fetch(`${API_BASE}/api/overhead-expenses`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
          fetch(`${API_BASE}/api/cash-advances`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : { cash_advances: [] })),
          fetch(`${API_BASE}/api/soa`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : { data: [] })),
        ]);

        const pExp =
          projExpRes.status === 'fulfilled' && projExpRes.value
            ? Array.isArray(projExpRes.value)
              ? projExpRes.value
              : projExpRes.value.expenses || []
            : [];

        const oExp =
          ovhExpRes.status === 'fulfilled' && ovhExpRes.value
            ? Array.isArray(ovhExpRes.value)
              ? ovhExpRes.value
              : ovhExpRes.value.expenses || []
            : [];

        const cas =
          caRes.status === 'fulfilled' && caRes.value
            ? Array.isArray(caRes.value)
              ? caRes.value
              : caRes.value.cash_advances || []
            : [];

        const soas =
          soaRes.status === 'fulfilled' && soaRes.value
            ? Array.isArray(soaRes.value)
              ? soaRes.value
              : soaRes.value.data || soaRes.value.items || []
            : [];

        const normalizedFinance: any[] = [
          ...pExp.map((e: any) => ({
            type: 'project_expense',
            category: e.category || 'Materials & Direct Costs',
            status: e.status || (e.is_liquidated ? 'Liquidated' : 'Recorded'),
            year: String(e.date || e.created_at || '').slice(0, 4) || '2026',
            client: e.payee || e.supplier || 'Direct Supplier',
            amount: Number(e.amount || 0) || 0,
            balance: 0,
          })),
          ...oExp.map((e: any) => ({
            type: 'overhead_expense',
            category: e.category || 'Overhead Expense',
            status: e.status || 'Paid',
            year: String(e.date || e.created_at || '').slice(0, 4) || '2026',
            client: e.payee || e.vendor || 'Vendor',
            amount: Number(e.amount || 0) || 0,
            balance: 0,
          })),
          ...cas.map((c: any) => ({
            type: 'cash_advance',
            category: c.purpose || 'Cash Advance',
            status: Number(c.balance_remaining || 0) > 0 ? 'Pending Liquidation' : 'Settled',
            year: String(c.date || c.created_at || '').slice(0, 4) || '2026',
            client: c.requester || c.full_name || 'Employee',
            amount: Number(c.amount || 0) || 0,
            balance: Number(c.balance_remaining || 0) || 0,
          })),
          ...soas.map((s: any) => ({
            type: 'soa',
            category: s.recipientName || s.partnerName || 'Subcontractor SOA',
            status: s.status === 'settled' ? 'Settled' : s.status === 'for_payment' ? 'For Payment' : 'Draft',
            year: String(s.date || s.createdAt || '').slice(0, 4) || '2026',
            client: s.recipientName || s.clientName || 'Partner / Client',
            amount: Number(s.totalAmount || s.grandTotal || 0) || 0,
            balance: Number(s.balanceRemaining || 0) || 0,
          })),
        ];

        // Fallback to project financial figures if no standalone expenses are recorded yet
        if (normalizedFinance.length === 0) {
          const projects = await dataService.getProjects();
          if (Array.isArray(projects)) {
            projects.forEach((p) => {
              const billed = Number(p.contract_billed ?? p.amount_contract_billed_net ?? 0) || 0;
              const contract = Number(p.updated_contract_amount ?? p.contract_amount ?? 0) || 0;
              const balance = Number(p.total_contract_balance ?? 0) || 0;
              const yr = String(p.year || '2026');
              if (contract > 0 || billed > 0) {
                normalizedFinance.push({
                  type: 'project_expense',
                  category: p.project_category || 'Project Direct Cost',
                  status: p.project_status || 'Recorded',
                  year: yr,
                  client: p.account_name || 'Client',
                  amount: billed > 0 ? billed : contract,
                  balance: balance,
                });
              }
            });
          }
        }

        setRawExpenses(normalizedFinance);
      }
    } catch (e) {
      console.error('Failed to load analytics data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeScope]);

  // Compute live dataset formulation based on current shelf state
  const activeDataset = useMemo<Array<{ group: string; value: number; count?: number; billed?: number; balance?: number }>>(() => {
    // -------------------------------------------------------------
    // 1. SALES DOMAIN
    // -------------------------------------------------------------
    if (activeScope === 'sales') {
      let list = [...salesOpportunities];
      if (scopeFilter !== 'all') {
        if (scopeFilter === 'won_only') list = list.filter((p) => p.status === 'won');
        else if (scopeFilter === 'active_pipeline') list = list.filter((p) => p.status === 'sent' || p.status === 'for_review');
        else list = list.filter((p) => (p.date || p.createdAt || '').includes(scopeFilter));
      }

      const groups = new Map<string, { group: string; count: number; totalAmount: number }>();

      list.forEach((p) => {
        // Compute real deal value from latest quotation
        const qs = salesQuotations.filter((q) => q.projectId === p.id);
        const latestIoct = qs.filter((q) => q.kind === 'IOCT').sort(newest)[0];
        const headline = latestIoct ?? qs.filter((q) => q.kind === 'ACTI').sort(newest)[0];
        const dealVal = headline ? computeTotals(headline).grandTotal : Number((p as any).dealValue ?? 0) || 0;

        let gKey = 'Unspecified';
        if (dimension === 'grade') {
          gKey = p.opportunityGrade ? `Grade ${p.opportunityGrade}` : 'Ungraded';
        } else if (dimension === 'status') {
          gKey = p.status ? p.status.replace('_', ' ').toUpperCase() : 'DRAFT';
        } else if (dimension === 'year') {
          gKey = (p.date || p.createdAt || '').slice(0, 4) || '2026';
        } else if (dimension === 'client') {
          const clientObj = salesClients.find((c) => c.id === p.customerId);
          gKey = clientObj?.name || (p as any).clientName || 'Direct Client';
        }

        if (!groups.has(gKey)) {
          groups.set(gKey, { group: gKey, count: 0, totalAmount: 0 });
        }
        const g = groups.get(gKey)!;
        g.count += 1;
        g.totalAmount += dealVal;
      });

      const rows = Array.from(groups.values()).map((g) => {
        let val = g.totalAmount;
        if (metric === 'count') val = g.count;
        else if (metric === 'average_amount') val = g.count > 0 ? g.totalAmount / g.count : 0;
        return { group: g.group, value: val, count: g.count };
      });

      if (sortAscending) rows.sort((a, b) => a.value - b.value);
      else rows.sort((a, b) => b.value - a.value);

      return rows;
    }

    // -------------------------------------------------------------
    // 2. FINANCE DOMAIN
    // -------------------------------------------------------------
    if (activeScope === 'finance') {
      let list = [...rawExpenses];
      if (scopeFilter !== 'all') {
        if (scopeFilter === 'project_expenses_only') list = list.filter((e) => e.type === 'project_expense');
        else if (scopeFilter === 'overhead_only') list = list.filter((e) => e.type === 'overhead_expense');
        else list = list.filter((e) => e.year === scopeFilter);
      }

      const groups = new Map<string, { group: string; count: number; totalAmount: number; totalBalance: number }>();

      list.forEach((e) => {
        let gKey = 'Unspecified';
        if (dimension === 'category') gKey = e.category || 'General';
        else if (dimension === 'status') gKey = e.status || 'Recorded';
        else if (dimension === 'year') gKey = e.year || '2026';
        else if (dimension === 'client') gKey = e.client || 'Payee';

        if (!groups.has(gKey)) {
          groups.set(gKey, { group: gKey, count: 0, totalAmount: 0, totalBalance: 0 });
        }
        const g = groups.get(gKey)!;
        g.count += 1;
        g.totalAmount += e.amount;
        g.totalBalance += e.balance;
      });

      const rows = Array.from(groups.values()).map((g) => {
        let val = g.totalAmount;
        if (metric === 'total_balance') val = g.totalBalance;
        else if (metric === 'count') val = g.count;
        else if (metric === 'average_amount') val = g.count > 0 ? g.totalAmount / g.count : 0;
        return { group: g.group, value: val, count: g.count, balance: g.totalBalance };
      });

      if (sortAscending) rows.sort((a, b) => a.value - b.value);
      else rows.sort((a, b) => b.value - a.value);

      return rows;
    }

    // -------------------------------------------------------------
    // 3. PROJECTS DOMAIN
    // -------------------------------------------------------------
    let list = [...rawProjects];
    if (scopeFilter !== 'all') {
      list = list.filter((p) => String(p.year || '') === scopeFilter);
    }

    const groups = new Map<string, { group: string; count: number; totalAmount: number; totalBilled: number; totalBalance: number }>();

    list.forEach((p) => {
      let gKey = 'Unspecified';
      if (dimension === 'category') gKey = p.project_category || 'Uncategorized';
      else if (dimension === 'status') gKey = p.project_status || 'Draft';
      else if (dimension === 'year') gKey = String(p.year || 'Unknown');
      else if (dimension === 'client') gKey = p.account_name || 'Direct Client';

      if (!groups.has(gKey)) {
        groups.set(gKey, { group: gKey, count: 0, totalAmount: 0, totalBilled: 0, totalBalance: 0 });
      }
      const g = groups.get(gKey)!;
      g.count += 1;
      g.totalAmount += Number(p.updated_contract_amount ?? p.contract_amount ?? 0) || 0;
      g.totalBilled += Number(p.contract_billed ?? p.amount_contract_billed_net ?? 0) || 0;
      g.totalBalance += Number(p.total_contract_balance ?? 0) || 0;
    });

    const rows = Array.from(groups.values()).map((g) => {
      let val = g.totalAmount;
      if (metric === 'total_balance') val = g.totalBalance;
      else if (metric === 'total_billed') val = g.totalBilled;
      else if (metric === 'count') val = g.count;
      else if (metric === 'average_amount') val = g.count > 0 ? g.totalAmount / g.count : 0;

      return {
        group: g.group,
        value: val,
        count: g.count,
        billed: g.totalBilled,
        balance: g.totalBalance,
      };
    });

    if (sortAscending) {
      rows.sort((a, b) => a.value - b.value);
    } else {
      rows.sort((a, b) => b.value - a.value);
    }

    return rows;
  }, [activeScope, rawProjects, rawExpenses, salesOpportunities, salesQuotations, salesClients, dimension, metric, scopeFilter, sortAscending]);

  // Current canvas rows always derive dynamically from the live activeDataset
  const currentRows = activeDataset;

  const summary = useMemo(() => {
    if (currentRows.length === 0) return null;
    const total = currentRows.reduce((s: number, r: { value: number }) => s + r.value, 0);
    const max = [...currentRows].sort((a, b) => b.value - a.value)[0];
    return {
      total,
      count: currentRows.length,
      maxLabel: max?.group,
      maxValue: max?.value || 0,
    };
  }, [currentRows]);

  const colorByGroup = useMemo(() => {
    const rankedAsc = [...currentRows].sort((a, b) => a.value - b.value).map((r) => r.group);
    const map = new Map<string, string>();
    rankedAsc.forEach((group, index) => {
      const t = rankedAsc.length > 1 ? index / (rankedAsc.length - 1) : 1;
      map.set(group, mixHex(SEQUENTIAL_LIGHT, NET_PACIFIC_COLORS.secondary, t));
    });
    return map;
  }, [currentRows]);

  const activeThread = useMemo(() => {
    return threads.find((t) => t.id === activeThreadId) || null;
  }, [threads, activeThreadId]);

  // When clicking a saved Data Thread tab, switch the shelves to its configuration
  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    const t = threads.find((th) => th.id === threadId);
    if (t) {
      setDimension(t.dimension);
      setMetric(t.metric);
      setScopeFilter(t.scopeFilter);
      setChartType(t.chartType);
    }
  };

  const handleCreateThread = (customTitle?: string) => {
    const newId = `thread-${Date.now()}`;
    const title = customTitle || `${metric.replace('_', ' ').toUpperCase()} by ${dimension.toUpperCase()}`;
    const newThread: DataThread = {
      id: newId,
      title,
      scope: activeScope,
      dimension,
      metric,
      chartType,
      scopeFilter,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setThreads((prev) => [newThread, ...prev]);
    setActiveThreadId(newId);
  };

  const handlePresetClick = (p: typeof config.presets[number]) => {
    setDimension(p.dimension as DimensionType);
    setMetric(p.metric as MetricType);
    setChartType(p.chartType as AiChartType);
    handleCreateThread(p.label);
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    const lower = promptInput.toLowerCase();
    if (lower.includes('status')) setDimension('status');
    else if (lower.includes('year') || lower.includes('trend')) setDimension('year');
    else if (lower.includes('client') || lower.includes('account')) setDimension('client');
    else if (lower.includes('grade') && activeScope === 'sales') setDimension('grade');
    else setDimension('category');

    if (lower.includes('balance')) setMetric('total_balance');
    else if (lower.includes('billed')) setMetric('total_billed');
    else if (lower.includes('count')) setMetric('count');
    else setMetric('total_amount');

    if (lower.includes('line') || lower.includes('trend') || lower.includes('growth')) setChartType('line');
    else if (lower.includes('donut') || lower.includes('pie') || lower.includes('share') || lower.includes('distribution')) setChartType('donut');
    else if (lower.includes('table')) setChartType('table');
    else setChartType('bar');

    handleCreateThread(promptInput);
    setPromptInput('');
  };

  const handleExportCsv = () => {
    const headers = ['Group', 'Value', 'Count'];
    const csvRows = [headers.join(',')];
    currentRows.forEach((r) => {
      csvRows.push(`"${r.group.replace(/"/g, '""')}",${r.value},${r.count ?? ''}`);
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeScope}_analytics_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyTsv = () => {
    const headers = ['Group', 'Value'];
    const lines = [headers.join('\t')];
    currentRows.forEach((r) => {
      lines.push(`${r.group}\t${r.value}`);
    });
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleScopeChange = (newScope: StudioScope) => {
    if (newScope === 'projects') navigate('/projects/analytics');
    else if (newScope === 'sales') navigate('/sales/analytics');
    else if (newScope === 'finance') navigate('/finance/analytics');
  };

  const provenanceCount =
    activeScope === 'sales'
      ? salesOpportunities.length
      : activeScope === 'finance'
      ? rawExpenses.length
      : rawProjects.length;

  return (
    <Container maxWidth="xl" sx={{ py: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Scope Switcher Banner */}
      <Paper sx={{ p: 1.5, mb: 2.5, borderRadius: 2, bgcolor: '#ffffff', border: '1px solid #e2e8f0' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" justifyContent="space-between" spacing={1.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#475569', textTransform: 'uppercase', fontSize: '0.75rem' }}>
              Studio Workspace:
            </Typography>
            <ButtonGroup size="small" variant="outlined">
              <Button
                variant={activeScope === 'projects' ? 'contained' : 'outlined'}
                startIcon={<BusinessIcon fontSize="small" />}
                onClick={() => handleScopeChange('projects')}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Projects Studio
              </Button>
              <Button
                variant={activeScope === 'sales' ? 'contained' : 'outlined'}
                startIcon={<QueryStatsIcon fontSize="small" />}
                onClick={() => handleScopeChange('sales')}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Sales Studio
              </Button>
              <Button
                variant={activeScope === 'finance' ? 'contained' : 'outlined'}
                startIcon={<AccountBalanceIcon fontSize="small" />}
                onClick={() => handleScopeChange('finance')}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Finance Studio
              </Button>
            </ButtonGroup>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => void loadData()}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={handleExportCsv}
            >
              Export CSV
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={handleCopyTsv}
              sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}
            >
              {copied ? 'Copied!' : 'Copy Data'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Studio Header */}
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            {config.icon}
            <Typography variant="h5" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
              {config.title}
            </Typography>
            <Chip
              icon={<AutoAwesomeIcon sx={{ fontSize: '1rem !important' }} />}
              label="Data Formulator Engine"
              color="primary"
              size="small"
              sx={{ fontWeight: 600 }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {config.subtitle}
          </Typography>
        </Box>
      </Stack>

      {/* Natural Language Formulator Input */}
      <Paper
        component="form"
        onSubmit={handlePromptSubmit}
        sx={{
          p: 1.5,
          mb: 2.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderRadius: 2,
          border: '1px solid #cbd5e1',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <AutoAwesomeIcon sx={{ color: NET_PACIFIC_COLORS.primary, ml: 0.5 }} />
        <TextField
          fullWidth
          variant="standard"
          placeholder={`Ask anything about ${activeScope} (e.g. '${config.presets[0]?.label}', '${config.presets[1]?.label}')...`}
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          InputProps={{ disableUnderline: true }}
        />
        <Button
          type="submit"
          variant="contained"
          size="medium"
          sx={{ bgcolor: NET_PACIFIC_COLORS.primary, px: 3, textTransform: 'none', fontWeight: 600 }}
        >
          Formulate
        </Button>
      </Paper>

      {/* Preset Inspirations */}
      <Stack direction="row" spacing={1} sx={{ mb: 2.5, overflowX: 'auto', pb: 0.5 }}>
        <Typography variant="caption" sx={{ alignSelf: 'center', color: 'text.secondary', fontWeight: 600 }}>
          Quick Formulations:
        </Typography>
        {config.presets.map((p) => (
          <Chip
            key={p.label}
            label={p.label}
            size="small"
            clickable
            onClick={() => handlePresetClick(p)}
            sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' }, fontSize: '0.8rem' }}
          />
        ))}
      </Stack>

      {/* Data Threads Bar (Exploration History) */}
      {threads.length > 0 && (
        <Paper sx={{ mb: 2, p: 0.5, borderRadius: 2, border: '1px solid #e2e8f0' }}>
          <Tabs
            value={activeThreadId}
            onChange={(_, val) => handleSelectThread(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 40 }}
          >
            {threads.map((t) => (
              <Tab
                key={t.id}
                value={t.id}
                label={
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <LayersIcon fontSize="small" sx={{ fontSize: '0.9rem' }} />
                    <span>{t.title}</span>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                      {t.timestamp}
                    </Typography>
                  </Stack>
                }
                sx={{ textTransform: 'none', minHeight: 40, py: 0.5 }}
              />
            ))}
          </Tabs>
        </Paper>
      )}

      {/* Main Grid: Visual Encoding Shelves on Left, Visual Canvas on Right */}
      <Grid container spacing={2.5} sx={{ flex: 1, minHeight: 0 }}>
        {/* Left: Concept Encoding Shelves */}
        <Grid size={{ xs: 12, md: 3.5 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              height: '100%',
              borderRadius: 2,
              border: '1px solid #e2e8f0',
              bgcolor: '#ffffff',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: NET_PACIFIC_COLORS.primary }}>
              Visual Encoding Shelves
            </Typography>

            <Stack spacing={2.5}>
              {/* X-Axis Dimension Shelf */}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#475569', display: 'block', mb: 0.5 }}>
                  1. DIMENSION (X-AXIS)
                </Typography>
                <Select
                  fullWidth
                  size="small"
                  value={dimension}
                  onChange={(e) => setDimension(e.target.value as DimensionType)}
                >
                  {config.dimensions.map((d) => (
                    <MenuItem key={d.key} value={d.key}>
                      {d.label}
                    </MenuItem>
                  ))}
                </Select>
              </Box>

              {/* Y-Axis Metric Shelf */}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#475569', display: 'block', mb: 0.5 }}>
                  2. MEASURE / METRIC (Y-AXIS)
                </Typography>
                <Select
                  fullWidth
                  size="small"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as MetricType)}
                >
                  {config.metrics.map((m) => (
                    <MenuItem key={m.key} value={m.key}>
                      {m.label}
                    </MenuItem>
                  ))}
                </Select>
              </Box>

              {/* Filter Shelf */}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#475569', display: 'block', mb: 0.5 }}>
                  3. SCOPE & FILTER
                </Typography>
                <Select
                  fullWidth
                  size="small"
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value)}
                >
                  <MenuItem value="all">All Records</MenuItem>
                  {activeScope === 'sales'
                    ? [
                        <MenuItem key="won_only" value="won_only">Won Opportunities Only</MenuItem>,
                        <MenuItem key="active_pipeline" value="active_pipeline">Active Pipeline (Sent/Review)</MenuItem>,
                        <MenuItem key="2026" value="2026">Year 2026</MenuItem>,
                        <MenuItem key="2025" value="2025">Year 2025</MenuItem>,
                      ]
                    : activeScope === 'finance'
                    ? [
                        <MenuItem key="project_expenses_only" value="project_expenses_only">Project Expenses Only</MenuItem>,
                        <MenuItem key="overhead_only" value="overhead_only">Overhead Expenses Only</MenuItem>,
                        <MenuItem key="2026" value="2026">Year 2026</MenuItem>,
                        <MenuItem key="2025" value="2025">Year 2025</MenuItem>,
                      ]
                    : [
                        <MenuItem key="2026" value="2026">Year 2026</MenuItem>,
                        <MenuItem key="2025" value="2025">Year 2025</MenuItem>,
                        <MenuItem key="2024" value="2024">Year 2024</MenuItem>,
                      ]}
                </Select>
              </Box>

              {/* Chart Form Selector */}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#475569', display: 'block', mb: 0.5 }}>
                  4. VISUAL GRAMMAR FORM
                </Typography>
                <ButtonGroup fullWidth size="small" variant="outlined">
                  <Button
                    variant={chartType === 'bar' ? 'contained' : 'outlined'}
                    onClick={() => setChartType('bar')}
                  >
                    Bar
                  </Button>
                  <Button
                    variant={chartType === 'line' ? 'contained' : 'outlined'}
                    onClick={() => setChartType('line')}
                  >
                    Line
                  </Button>
                  <Button
                    variant={chartType === 'donut' ? 'contained' : 'outlined'}
                    onClick={() => setChartType('donut')}
                  >
                    Donut
                  </Button>
                  <Button
                    variant={chartType === 'table' ? 'contained' : 'outlined'}
                    onClick={() => setChartType('table')}
                  >
                    Table
                  </Button>
                </ButtonGroup>
              </Box>

              <Button
                variant="contained"
                fullWidth
                onClick={() => handleCreateThread()}
                sx={{ bgcolor: NET_PACIFIC_COLORS.secondary, textTransform: 'none', fontWeight: 600 }}
              >
                Save as New Thread
              </Button>
            </Stack>
          </Paper>
        </Grid>

        {/* Right: Formulated Canvas & Inspector */}
        <Grid size={{ xs: 12, md: 8.5 }}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              height: '100%',
              borderRadius: 2,
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              bgcolor: '#ffffff',
            }}
          >
            {/* Canvas Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
                  {activeThread?.title || `${metric.replace('_', ' ').toUpperCase()} by ${dimension.toUpperCase()}`}
                </Typography>
                {summary && (
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <Chip
                      label={`Total: ${metric === 'count' ? summary.total : dataService.formatCurrency(summary.total)}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                    <Chip
                      label={`Groups: ${summary.count}`}
                      size="small"
                      sx={{ bgcolor: '#f1f5f9' }}
                    />
                    {summary.maxLabel && (
                      <Chip
                        label={`Highest: ${summary.maxLabel} (${metric === 'count' ? summary.maxValue : dataService.formatCurrency(summary.maxValue)})`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                )}
              </Box>

              <Stack direction="row" spacing={1}>
                <MuiTooltip title={sortAscending ? 'Sorted: Lowest first' : 'Sorted: Highest first'}>
                  <IconButton
                    size="small"
                    onClick={() => setSortAscending((prev) => !prev)}
                    sx={{ border: '1px solid #cbd5e1' }}
                  >
                    <SortIcon fontSize="small" />
                  </IconButton>
                </MuiTooltip>
              </Stack>
            </Stack>

            <Divider sx={{ mb: 2 }} />

            {/* Canvas Visualization Area */}
            <Box sx={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
              {currentRows.length === 0 ? (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.secondary">No records match the active criteria.</Typography>
                </Box>
              ) : chartType === 'table' ? (
                <TableContainer sx={{ flex: 1, maxHeight: 420 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>Group</TableCell>
                        <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }} align="right">
                          {metric === 'count' ? 'Count' : 'Amount'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }} align="right">
                          Share
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {currentRows.map((row) => {
                        const share = summary?.total ? ((row.value / summary.total) * 100).toFixed(1) : '0.0';
                        return (
                          <TableRow key={row.group} hover>
                            <TableCell sx={{ fontWeight: 500 }}>{row.group}</TableCell>
                            <TableCell align="right">
                              {metric === 'count' ? row.value : dataService.formatCurrency(row.value)}
                            </TableCell>
                            <TableCell align="right" sx={{ color: 'text.secondary' }}>
                              {share}%
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : chartType === 'line' ? (
                <ResponsiveContainer width="100%" height="100%" minHeight={320}>
                  <LineChart data={currentRows} margin={{ top: 16, right: 24, bottom: 16, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="group" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      tickFormatter={(v: number) => (metric === 'count' ? String(v) : dataService.formatCurrency(v))}
                    />
                    <Tooltip
                      formatter={(v: number) => [metric === 'count' ? v : dataService.formatCurrency(v), 'Value']}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={NET_PACIFIC_COLORS.primary}
                      strokeWidth={3}
                      dot={{ r: 4, fill: NET_PACIFIC_COLORS.secondary }}
                      activeDot={{ r: 6, fill: NET_PACIFIC_COLORS.accent }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : chartType === 'donut' ? (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Tooltip
                        formatter={(v: number) => [metric === 'count' ? v : dataService.formatCurrency(v), 'Value']}
                      />
                      <Pie
                        data={currentRows}
                        dataKey="value"
                        nameKey="group"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={105}
                        paddingAngle={2}
                        isAnimationActive={false}
                      >
                        {currentRows.map((_, idx) => (
                          <Cell key={`c-${idx}`} fill={CATEGORICAL_PALETTE[idx % CATEGORICAL_PALETTE.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="center" sx={{ mt: 1 }}>
                    {currentRows.slice(0, 8).map((r, idx) => (
                      <Chip
                        key={r.group}
                        size="small"
                        label={`${r.group}: ${metric === 'count' ? r.value : dataService.formatCurrency(r.value)}`}
                        sx={{
                          bgcolor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          '&::before': {
                            content: '""',
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            mr: 0.5,
                            bgcolor: CATEGORICAL_PALETTE[idx % CATEGORICAL_PALETTE.length],
                          },
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minHeight={320}>
                  <BarChart data={currentRows} layout="vertical" margin={{ top: 12, right: 24, bottom: 12, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={(v: number) => (metric === 'count' ? String(v) : dataService.formatCurrency(v))}
                    />
                    <YAxis type="category" dataKey="group" width={130} tick={{ fontSize: 12, fill: '#334155' }} />
                    <Tooltip
                      formatter={(v: number) => [metric === 'count' ? v : dataService.formatCurrency(v), 'Value']}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                      {currentRows.map((r) => (
                        <Cell key={r.group} fill={colorByGroup.get(r.group) || NET_PACIFIC_COLORS.primary} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>

            {/* Provenance Footer */}
            <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Provenance: {provenanceCount} {activeScope === 'sales' ? 'opportunities' : activeScope === 'finance' ? 'transactions' : 'projects'} scanned from records
              </Typography>
              <Chip label="Net Pacific Safe Boundary" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
