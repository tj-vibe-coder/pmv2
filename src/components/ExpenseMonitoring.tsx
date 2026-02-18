import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  SelectChangeEvent,
  IconButton,
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { Add as AddIcon, Sync as SyncIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Project } from '../types/Project';
import dataService from '../services/dataService';
import { getBudgets } from '../utils/projectBudgetStorage';
import { PURCHASE_ORDERS_STORAGE_KEY, type PurchaseOrder, type PurchaseOrderItem } from './PurchaseOrderPage';

const EXPENSES_KEY = 'projectExpenses';

const EXPENSE_CATEGORIES = [
  '3rd Party Labor',
  'Materials',
  'Transportation',
  'Accomodation',
  'Entertainment',
  'Airfare',
  'Others',
] as const;

export interface ProjectExpense {
  id: string;
  projectId: number;
  projectName: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  createdAt: string;
  /** When synced from PO, avoid duplicate sync */
  sourcePoId?: string;
  sourcePoItemId?: string;
}

const loadExpenses = (): ProjectExpense[] => {
  try {
    const raw = localStorage.getItem(EXPENSES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const saveExpenses = (data: ProjectExpense[]) => {
  try {
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(data));
  } catch (_) {}
};

const loadPOs = (): PurchaseOrder[] => {
  try {
    const raw = localStorage.getItem(PURCHASE_ORDERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const lineTotal = (item: PurchaseOrderItem): number =>
  (Number(item.quantity) || 0) * (Number(item.unitPrice ?? 0) || 0);

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

interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
  budget: number;
  spent: number;
}

interface MonthlyExpense {
  month: string;
  total: number;
  categories: Record<string, number>;
}

const PIE_COLORS = [
  NET_PACIFIC_COLORS.primary,
  NET_PACIFIC_COLORS.success,
  NET_PACIFIC_COLORS.warning,
  NET_PACIFIC_COLORS.info,
  NET_PACIFIC_COLORS.error,
  NET_PACIFIC_COLORS.accent1,
  NET_PACIFIC_COLORS.accent2,
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR + 2 - 2025 }, (_, i) => 2025 + i);

const ExpenseMonitoring: React.FC = () => {
  const location = useLocation();
  const isChildRoute = location.pathname === '/expense-monitoring/ca-form' || location.pathname === '/expense-monitoring/liquidation-form';
  
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [budgets, setBudgets] = useState<Record<number, number>>({});
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [expenseProjectId, setExpenseProjectId] = useState<number | ''>('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expensesDialogProject, setExpensesDialogProject] = useState<Project | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await dataService.getProjects().then(setAllProjects);
      } catch (error) {
        console.error('Error loading projects:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    setBudgets(getBudgets());
    setExpenses(loadExpenses());
  }, []);

  const expensesInYear = useMemo(() => {
    if (selectedYear === 0) return expenses;
    return expenses.filter((e) => e.date && e.date.startsWith(String(selectedYear)));
  }, [expenses, selectedYear]);

  const spentByProject = useMemo(() => {
    const map: Record<number, number> = {};
    expensesInYear.forEach((e) => {
      map[e.projectId] = (map[e.projectId] || 0) + e.amount;
    });
    return map;
  }, [expensesInYear]);

  const projectsForView = useMemo(() => {
    if (selectedProjectId === '') return allProjects;
    const p = allProjects.find((x) => x.id === selectedProjectId);
    return p ? [p] : [];
  }, [allProjects, selectedProjectId]);

  const expenseCategories = useMemo<ExpenseCategory[]>(() => {
    return projectsForView.map((p, i) => ({
      id: String(p.id),
      name: p.project_name,
      color: PIE_COLORS[i % PIE_COLORS.length],
      budget: budgets[p.id] ?? 0,
      spent: spentByProject[p.id] ?? 0,
    }));
  }, [projectsForView, budgets, spentByProject]);

  const expenseMetrics = useMemo(() => {
    const totalBudget = selectedProjectId === ''
      ? Object.values(budgets).reduce((a, b) => a + b, 0)
      : (budgets[selectedProjectId] ?? 0);
    const totalSpent = selectedProjectId === ''
      ? expensesInYear.reduce((sum, e) => sum + e.amount, 0)
      : (spentByProject[selectedProjectId] ?? 0);
    const totalRemaining = totalBudget - totalSpent;
    const spentPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    const overBudgetCount = selectedProjectId === ''
      ? allProjects.filter((p) => (budgets[p.id] ?? 0) > 0 && (spentByProject[p.id] ?? 0) > (budgets[p.id] ?? 0)).length
      : (totalBudget > 0 && totalSpent > totalBudget ? 1 : 0);
    const remainingPct = totalBudget > 0 ? (totalRemaining / totalBudget) * 100 : 100;
    const statusColor = totalRemaining < 0 ? 'red' : remainingPct <= 20 ? 'yellow' : 'green';
    return {
      totalBudget,
      totalSpent,
      totalRemaining,
      spentPercentage,
      overBudgetCategories: overBudgetCount,
      statusColor,
    };
  }, [budgets, expensesInYear, spentByProject, allProjects, selectedProjectId]);

  const pieChartData = expenseCategories.filter(cat => cat.spent > 0).map((cat, i) => ({
    name: cat.name.length > 12 ? cat.name.slice(0, 12) + '…' : cat.name,
    value: cat.spent,
    color: cat.color
  }));

  const budgetVsActualData = expenseCategories
    .filter(cat => cat.budget > 0 || cat.spent > 0)
    .slice(0, 10)
    .map(cat => ({
      category: cat.name.length > 8 ? cat.name.slice(0, 8) + '…' : cat.name,
      budget: cat.budget,
      spent: cat.spent,
      remaining: cat.budget - cat.spent
    }));

  const monthlyExpenseData = useMemo((): MonthlyExpense[] => {
    const byMonth: Record<string, number> = {};
    expensesInYear.forEach((e) => {
      if (selectedProjectId !== '' && e.projectId !== selectedProjectId) return;
      const month = e.date ? e.date.slice(0, 7) : '';
      if (month) byMonth[month] = (byMonth[month] || 0) + e.amount;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total, categories: {} }));
  }, [expensesInYear, selectedProjectId]);

  const expensesForProject = (projectId: number) => expenses.filter((e) => e.projectId === projectId);

  const handleSyncFromPO = () => {
    const pos = loadPOs();
    const existing = loadExpenses();
    const syncedPoIds = new Set(existing.filter((e) => e.sourcePoId && !e.sourcePoItemId).map((e) => e.sourcePoId!));
    const syncedPoItemKeys = new Set(
      existing.filter((e) => e.sourcePoId && e.sourcePoItemId).map((e) => `${e.sourcePoId}:${e.sourcePoItemId}`)
    );

    const newExpenses: ProjectExpense[] = [];
    const isMultiMRF = (po: { mrfIds?: string[]; mrfRequestNos?: string[] }) =>
      (po.mrfIds && po.mrfIds.length > 1) || (po.mrfRequestNos && po.mrfRequestNos.length > 1);

    for (const po of pos) {
      const pid = po.projectId;
      if (pid == null) continue;

      const project = allProjects.find((p) => p.id === pid);
      const projectName = project?.project_name ?? po.projectName ?? '—';
      const orderDate = po.orderDate || new Date().toISOString().slice(0, 10);

      if (isMultiMRF(po)) {
        // Multiple MRFs: log each item separately
        for (const item of po.items || []) {
          const amt = lineTotal(item);
          if (amt <= 0) continue;
          const key = `${po.id}:${item.id}`;
          if (syncedPoItemKeys.has(key)) continue;

          const mrfRequestNo = (() => {
            if (po.mrfIds && po.mrfRequestNos && item.id) {
              const idx = po.mrfIds.findIndex((id) => item.id.startsWith(`${id}-`));
              return idx >= 0 ? po.mrfRequestNos[idx] : po.mrfRequestNos[0];
            }
            return po.mrfRequestNo;
          })();
          const desc = [item.description, item.partNo, item.brand].filter(Boolean).join(' ') || '—';

          newExpenses.push({
            id: `exp-po-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            projectId: pid,
            projectName,
            description: `PO ${po.poNumber} · MRF ${mrfRequestNo}: ${desc}`,
            amount: amt,
            date: orderDate,
            category: 'Materials',
            createdAt: new Date().toISOString(),
            sourcePoId: po.id,
            sourcePoItemId: item.id,
          });
          syncedPoItemKeys.add(key);
        }
      } else {
        // Single MRF: one expense per PO (total)
        if (syncedPoIds.has(po.id)) continue;
        const total = (po.items || []).reduce((sum, item) => sum + lineTotal(item), 0);
        if (total <= 0) continue;

        newExpenses.push({
          id: `exp-po-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          projectId: pid,
          projectName,
          description: `PO ${po.poNumber} (${po.supplierName || '—'})`,
          amount: total,
          date: orderDate,
          category: 'Materials',
          createdAt: new Date().toISOString(),
          sourcePoId: po.id,
        });
        syncedPoIds.add(po.id);
      }
    }

    if (newExpenses.length === 0) {
      setSyncMessage({ type: 'info', text: 'No new POs with prices to sync. All POs are already logged or have no item prices.' });
    } else {
      const next = [...newExpenses, ...existing];
      setExpenses(next);
      saveExpenses(next);
      setSyncMessage({ type: 'success', text: `Synced ${newExpenses.length} expense(s) — total ${formatCurrency(newExpenses.reduce((s, e) => s + e.amount, 0))} logged.` });
    }
    setTimeout(() => setSyncMessage(null), 4000);
  };

  const handleDeleteExpense = (id: string) => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    const next = expenses.filter((e) => e.id !== id);
    setExpenses(next);
    saveExpenses(next);
  };

  const handleAddExpense = () => {
    const pid = expenseProjectId === '' ? null : Number(expenseProjectId);
    const amount = Number(expenseAmount) || 0;
    if (pid == null) return;
    if (amount <= 0) return;
    const project = allProjects.find((p) => p.id === pid);
    const newExpense: ProjectExpense = {
      id: `exp-${Date.now()}`,
      projectId: pid,
      projectName: project?.project_name ?? '—',
      description: expenseDescription.trim() || '—',
      amount,
      date: expenseDate,
      category: expenseCategory.trim() || '—',
      createdAt: new Date().toISOString(),
    };
    const next = [newExpense, ...expenses];
    setExpenses(next);
    saveExpenses(next);
    setAddExpenseOpen(false);
    setExpenseProjectId('');
    setExpenseAmount('');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setExpenseDescription('');
    setExpenseCategory('');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const handleYearChange = (event: SelectChangeEvent<number>) => {
    setSelectedYear(Number(event.target.value));
  };

  if (isChildRoute) {
    return <Outlet />;
  }

  if (loading) {
    return (
      <Box sx={{ height: '100%' }}>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>Loading expense data...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Expense Monitoring
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={handleSyncFromPO}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Sync from PO
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddExpenseOpen(true)}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add Expense
          </Button>
        </Box>
      </Box>

      {syncMessage && (
        <Box
          sx={{
            py: 1,
            px: 2,
            mb: 2,
            borderRadius: 1,
            bgcolor: syncMessage.type === 'success' ? 'success.light' : syncMessage.type === 'error' ? 'error.light' : 'info.light',
            color: syncMessage.type === 'success' ? 'success.dark' : syncMessage.type === 'error' ? 'error.dark' : 'info.dark',
          }}
        >
          {syncMessage.text}
        </Box>
      )}

      {/* Filters */}
      <Box display="flex" gap={2} mb={2} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Year</InputLabel>
          <Select value={selectedYear} onChange={handleYearChange} label="Year">
            <MenuItem value={0}>All years</MenuItem>
            {YEAR_OPTIONS.map((year) => (
              <MenuItem key={year} value={year}>{year}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Project</InputLabel>
          <Select
            value={selectedProjectId === '' ? '' : selectedProjectId}
            onChange={(e) => { const v = String(e.target.value); setSelectedProjectId(v === '' ? '' : Number(v)); }}
            label="Project"
          >
            <MenuItem value="">All projects</MenuItem>
            {allProjects.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.project_name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Budget</Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatCurrency(expenseMetrics.totalBudget)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Spent</Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatCurrency(expenseMetrics.totalSpent)}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, fontSize: '0.75rem' }}>
                {expenseMetrics.spentPercentage.toFixed(1)}% of budget
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{
            color: 'white',
            background: expenseMetrics.statusColor === 'red'
              ? 'linear-gradient(135deg, #c62828 0%, #e57373 100%)'
              : expenseMetrics.statusColor === 'yellow'
                ? 'linear-gradient(135deg, #f9a825 0%, #ffd54f 100%)'
                : 'linear-gradient(135deg, #2e7d32 0%, #66bb6a 100%)',
          }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Remaining Budget</Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatCurrency(expenseMetrics.totalRemaining)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{
            color: 'white',
            background: expenseMetrics.overBudgetCategories > 0
              ? 'linear-gradient(135deg, #c62828 0%, #e57373 100%)'
              : 'linear-gradient(135deg, #2e7d32 0%, #66bb6a 100%)',
          }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>
                {selectedProjectId === '' ? 'Over Budget Projects' : 'Over Budget'}
              </Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {expenseMetrics.overBudgetCategories}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* Expense Distribution Pie Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ 
            p: 2, 
            borderRadius: 2,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0'
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Expense Distribution by Project
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData.map((item, index) => ({
                    ...item,
                    fill: [
                      NET_PACIFIC_COLORS.primary,
                      NET_PACIFIC_COLORS.success,
                      NET_PACIFIC_COLORS.warning,
                      NET_PACIFIC_COLORS.info,
                      NET_PACIFIC_COLORS.error,
                      NET_PACIFIC_COLORS.accent1,
                      NET_PACIFIC_COLORS.accent2
                    ][index % 7]
                  }))}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => {
                    const percent = entry.percent || 0;
                    const name = entry.name || '';
                    return percent > 5 ? `${name}\n${(percent * 100).toFixed(0)}%` : '';
                  }}
                  outerRadius={80}
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), '']}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    fontSize: '12px'
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={24}
                  iconType="circle"
                  wrapperStyle={{
                    paddingTop: '10px',
                    fontSize: '11px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Budget vs Actual Bar Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ 
            p: 2, 
            borderRadius: 2,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0'
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Budget vs Actual Spending
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={budgetVsActualData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="budgetGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={NET_PACIFIC_COLORS.accent1} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={NET_PACIFIC_COLORS.accent1} stopOpacity={0.3}/>
                  </linearGradient>
                  <linearGradient id="spentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={NET_PACIFIC_COLORS.primary} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={NET_PACIFIC_COLORS.primary} stopOpacity={0.3}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis 
                  dataKey="category" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(value) => `₱${(value / 1000000).toFixed(1)}M`} 
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), '']}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    fontSize: '12px'
                  }}
                />
                <Legend iconSize={8} />
                <Bar dataKey="budget" fill="url(#budgetGradient)" name="Budget" radius={[3, 3, 0, 0]} />
                <Bar dataKey="spent" fill="url(#spentGradient)" name="Spent" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Monthly Trend */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={12}>
          <Paper sx={{ 
            p: 2, 
            borderRadius: 2,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0'
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Monthly Expense Trend
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyExpenseData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={NET_PACIFIC_COLORS.primary} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={NET_PACIFIC_COLORS.primary} stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(value) => `₱${(value / 1000000).toFixed(1)}M`} 
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Expense Amount']}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    fontSize: '12px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="total" 
                  stroke={NET_PACIFIC_COLORS.primary} 
                  fill="url(#areaGradient)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Expenses Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Recent Expenses</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Project</TableCell>
                  <TableCell>Project No.</TableCell>
                  <TableCell>PO Number</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Description Part #</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell padding="none" align="center" width={48}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expensesInYear.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      {selectedYear === 0
                        ? 'No expenses yet. Use the Add Expense button to add an expense.'
                        : `No expenses in ${selectedYear}. Use the Add Expense button to add an expense.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  (selectedProjectId === '' ? expensesInYear : expensesInYear.filter((e) => e.projectId === selectedProjectId))
                    .slice(0, 50)
                    .map((expense) => {
                      const project = allProjects.find((p) => p.id === expense.projectId);
                      const projectNo = project?.project_no || String(project?.item_no ?? project?.id ?? '');
                      const poNumber = project?.po_number ?? '—';
                      return (
                    <TableRow key={expense.id}>
                      <TableCell>{expense.date}</TableCell>
                      <TableCell>{expense.projectName}</TableCell>
                      <TableCell>{projectNo || '—'}</TableCell>
                      <TableCell>{poNumber}</TableCell>
                      <TableCell>{expense.category}</TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell align="right">{formatCurrency(expense.amount)}</TableCell>
                      <TableCell padding="none" align="center">
                        <IconButton size="small" onClick={() => handleDeleteExpense(expense.id)} title="Delete expense" color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ); })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <Dialog open={addExpenseOpen} onClose={() => setAddExpenseOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Expense</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>Project</InputLabel>
                  <Select
                    label="Project"
                    value={expenseProjectId}
                    onChange={(e) => { const v = String(e.target.value); setExpenseProjectId(v === '' ? '' : Number(v)); }}
                  >
                    <MenuItem value="">— Select project —</MenuItem>
                    {allProjects.map((project) => (
                      <MenuItem key={project.id} value={project.id}>
                        {project.project_name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Amount"
                  type="number"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Description"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  multiline
                  rows={2}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select
                    label="Category"
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                  >
                    <MenuItem value="">— Select category —</MenuItem>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddExpenseOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddExpense}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add Expense
          </Button>
        </DialogActions>
      </Dialog>

      {/* View expenses per project dialog */}
      <Dialog open={!!expensesDialogProject} onClose={() => setExpensesDialogProject(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ borderBottom: '1px solid #e2e8f0', pb: 1 }}>
          Expenses – {expensesDialogProject?.project_name}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {expensesDialogProject && (
            <>
              {expensesForProject(expensesDialogProject.id).length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2 }}>No expenses for this project yet.</Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {expensesForProject(expensesDialogProject.id).map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.date}</TableCell>
                          <TableCell>{e.description}</TableCell>
                          <TableCell>{e.category}</TableCell>
                          <TableCell align="right">{formatCurrency(e.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid #e2e8f0', p: 2 }}>
          <Button onClick={() => setExpensesDialogProject(null)}>Close</Button>
          {expensesDialogProject && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setExpenseProjectId(expensesDialogProject.id);
                setExpenseAmount('');
                setExpenseDate(new Date().toISOString().slice(0, 10));
                setExpenseDescription('');
                setExpenseCategory('');
                setAddExpenseOpen(true);
                setExpensesDialogProject(null);
              }}
            >
              Add expense
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExpenseMonitoring;
