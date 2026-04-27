import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Button,
  Select,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  Chip,
  SelectChangeEvent,
  TableSortLabel,
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import dataService from '../services/dataService';
import { Project } from '../types/Project';

const STORAGE_KEY = 'directLaborEntries';

const WORKER_TYPES = ['Direct Labor', '3rd Party'] as const;
type WorkerType = (typeof WORKER_TYPES)[number];

export interface DirectLaborEntry {
  id: string;
  projectId: string;
  projectName: string;
  workerName: string;
  workerType: WorkerType;
  role: string;
  date: string;
  hoursWorked: number;
  dailyRate: number;
  overtimeHours: number;
  overtimeRate: number;
  amount: number; // computed: (hoursWorked/8)*dailyRate + overtimeHours*overtimeRate
  remarks: string;
  createdAt: string;
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

const PIE_COLORS = [
  NET_PACIFIC_COLORS.primary,
  NET_PACIFIC_COLORS.success,
  NET_PACIFIC_COLORS.warning,
  NET_PACIFIC_COLORS.info,
  NET_PACIFIC_COLORS.error,
  NET_PACIFIC_COLORS.accent1,
  NET_PACIFIC_COLORS.accent2,
  '#6c5ce7',
  '#fd79a8',
  '#00cec9',
];

const loadEntries = (): DirectLaborEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const saveEntries = (data: DirectLaborEntry[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
};

const computeAmount = (hoursWorked: number, dailyRate: number, overtimeHours: number, overtimeRate: number): number => {
  const regular = (hoursWorked / 8) * dailyRate;
  const ot = overtimeHours * overtimeRate;
  return regular + ot;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR + 2 - 2025 }, (_, i) => 2025 + i);

export default function DirectLaborPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<DirectLaborEntry[]>(loadEntries);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filters
  const [filterYear, setFilterYear] = useState<number>(0);
  const [filterProjectId, setFilterProjectId] = useState<string | ''>('');
  const [filterWorkerType, setFilterWorkerType] = useState<WorkerType | ''>('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

  // Form fields
  const [formProjectId, setFormProjectId] = useState<string | ''>('');
  const [formWorkerName, setFormWorkerName] = useState('');
  const [formWorkerType, setFormWorkerType] = useState<WorkerType>('Direct Labor');
  const [formRole, setFormRole] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formHoursWorked, setFormHoursWorked] = useState('8');
  const [formDailyRate, setFormDailyRate] = useState('');
  const [formOvertimeHours, setFormOvertimeHours] = useState('0');
  const [formOvertimeRate, setFormOvertimeRate] = useState('0');
  const [formDirectAmount, setFormDirectAmount] = useState('');
  const [formRemarks, setFormRemarks] = useState('');

  const isThirdParty = formWorkerType === '3rd Party';

  useEffect(() => {
    dataService.getProjects().then(setProjects);
  }, []);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (filterYear !== 0) result = result.filter((e) => e.date?.startsWith(String(filterYear)));
    if (filterProjectId !== '') result = result.filter((e) => String(e.projectId) === filterProjectId);
    if (filterWorkerType !== '') result = result.filter((e) => e.workerType === filterWorkerType);
    return result;
  }, [entries, filterYear, filterProjectId, filterWorkerType]);

  const sortedEntries = useMemo(() => {
    const sorted = [...filteredEntries];
    sorted.sort((a, b) => {
      let cmp = 0;
      const key = sortConfig.key as keyof DirectLaborEntry;
      if (key === 'date') cmp = (a.date || '').localeCompare(b.date || '');
      else if (key === 'amount') cmp = a.amount - b.amount;
      else if (key === 'hoursWorked') cmp = a.hoursWorked - b.hoursWorked;
      else if (key === 'workerName') cmp = (a.workerName || '').localeCompare(b.workerName || '');
      else if (key === 'projectName') cmp = (a.projectName || '').localeCompare(b.projectName || '');
      else cmp = 0;
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredEntries, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Summary metrics
  const metrics = useMemo(() => {
    const totalManHours = filteredEntries.reduce((s, e) => s + e.hoursWorked + e.overtimeHours, 0);
    const totalCost = filteredEntries.reduce((s, e) => s + e.amount, 0);
    const directLabor = filteredEntries.filter((e) => e.workerType === 'Direct Labor');
    const thirdParty = filteredEntries.filter((e) => e.workerType === '3rd Party');
    const directLaborCost = directLabor.reduce((s, e) => s + e.amount, 0);
    const thirdPartyCost = thirdParty.reduce((s, e) => s + e.amount, 0);
    const directLaborHours = directLabor.reduce((s, e) => s + e.hoursWorked + e.overtimeHours, 0);
    const thirdPartyHours = thirdParty.reduce((s, e) => s + e.hoursWorked + e.overtimeHours, 0);
    const uniqueWorkers = new Set(filteredEntries.map((e) => e.workerName.toLowerCase().trim())).size;
    return { totalManHours, totalCost, directLaborCost, thirdPartyCost, directLaborHours, thirdPartyHours, uniqueWorkers };
  }, [filteredEntries]);

  // Chart data: cost by project
  const costByProject = useMemo(() => {
    const map: Record<string, { direct: number; thirdParty: number }> = {};
    filteredEntries.forEach((e) => {
      const name = e.projectName.length > 12 ? e.projectName.slice(0, 12) + '…' : e.projectName;
      if (!map[name]) map[name] = { direct: 0, thirdParty: 0 };
      if (e.workerType === 'Direct Labor') map[name].direct += e.amount;
      else map[name].thirdParty += e.amount;
    });
    return Object.entries(map).map(([project, v]) => ({ project, ...v }));
  }, [filteredEntries]);

  // Chart data: manhours by project
  const manhoursByProject = useMemo(() => {
    const map: Record<string, { regular: number; overtime: number }> = {};
    filteredEntries.forEach((e) => {
      const name = e.projectName.length > 12 ? e.projectName.slice(0, 12) + '…' : e.projectName;
      if (!map[name]) map[name] = { regular: 0, overtime: 0 };
      map[name].regular += e.hoursWorked;
      map[name].overtime += e.overtimeHours;
    });
    return Object.entries(map).map(([project, v]) => ({ project, ...v }));
  }, [filteredEntries]);

  // Pie: cost split by worker type
  const typePieData = useMemo(() => {
    const data = [];
    if (metrics.directLaborCost > 0) data.push({ name: 'Direct Labor', value: metrics.directLaborCost });
    if (metrics.thirdPartyCost > 0) data.push({ name: '3rd Party', value: metrics.thirdPartyCost });
    return data;
  }, [metrics]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const map: Record<string, { cost: number; hours: number }> = {};
    filteredEntries.forEach((e) => {
      const month = e.date?.slice(0, 7) || '';
      if (!month) return;
      if (!map[month]) map[month] = { cost: 0, hours: 0 };
      map[month].cost += e.amount;
      map[month].hours += e.hoursWorked + e.overtimeHours;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));
  }, [filteredEntries]);

  const resetForm = () => {
    setFormProjectId('');
    setFormWorkerName('');
    setFormWorkerType('Direct Labor');
    setFormRole('');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormHoursWorked('8');
    setFormDailyRate('');
    setFormOvertimeHours('0');
    setFormOvertimeRate('0');
    setFormDirectAmount('');
    setFormRemarks('');
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (entry: DirectLaborEntry) => {
    setEditingId(entry.id);
    setFormProjectId(entry.projectId);
    setFormWorkerName(entry.workerName);
    setFormWorkerType(entry.workerType);
    setFormRole(entry.role);
    setFormDate(entry.date);
    setFormHoursWorked(String(entry.hoursWorked));
    setFormDailyRate(String(entry.dailyRate));
    setFormOvertimeHours(String(entry.overtimeHours));
    setFormOvertimeRate(String(entry.overtimeRate));
    setFormDirectAmount(entry.workerType === '3rd Party' ? String(entry.amount) : '');
    setFormRemarks(entry.remarks);
    setDialogOpen(true);
  };

  const handleSave = () => {
    const pid = formProjectId === '' ? null : String(formProjectId);
    if (pid == null) return;
    const hours = isThirdParty ? 0 : (Number(formHoursWorked) || 0);
    const daily = isThirdParty ? 0 : (Number(formDailyRate) || 0);
    const otHours = isThirdParty ? 0 : (Number(formOvertimeHours) || 0);
    const otRate = isThirdParty ? 0 : (Number(formOvertimeRate) || 0);
    const amount = isThirdParty ? (Number(formDirectAmount) || 0) : computeAmount(hours, daily, otHours, otRate);
    if (amount <= 0) return;
    const project = projects.find((p) => String(p.id) === pid);

    if (editingId) {
      const updated = entries.map((e) =>
        e.id === editingId
          ? {
              ...e,
              projectId: pid,
              projectName: project?.project_name ?? '—',
              workerName: formWorkerName.trim() || '—',
              workerType: formWorkerType,
              role: formRole.trim(),
              date: formDate,
              hoursWorked: hours,
              dailyRate: daily,
              overtimeHours: otHours,
              overtimeRate: otRate,
              amount,
              remarks: formRemarks.trim(),
            }
          : e
      );
      setEntries(updated);
      saveEntries(updated);
    } else {
      const newEntry: DirectLaborEntry = {
        id: `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        projectId: pid,
        projectName: project?.project_name ?? '—',
        workerName: formWorkerName.trim() || '—',
        workerType: formWorkerType,
        role: formRole.trim(),
        date: formDate,
        hoursWorked: hours,
        dailyRate: daily,
        overtimeHours: otHours,
        overtimeRate: otRate,
        amount,
        remarks: formRemarks.trim(),
        createdAt: new Date().toISOString(),
      };
      const next = [newEntry, ...entries];
      setEntries(next);
      saveEntries(next);
    }
    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this entry?')) return;
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    saveEntries(next);
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Direct Labor / 3rd Party Services
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openAdd}
          sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
        >
          Add Entry
        </Button>
      </Box>

      {/* Filters */}
      <Box display="flex" gap={2} mb={2} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Year</InputLabel>
          <Select value={filterYear} onChange={(e: SelectChangeEvent<number>) => setFilterYear(Number(e.target.value))} label="Year">
            <MenuItem value={0}>All years</MenuItem>
            {YEAR_OPTIONS.map((y) => (
              <MenuItem key={y} value={y}>{y}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Project</InputLabel>
          <Select value={filterProjectId === '' ? '' : filterProjectId} onChange={(e) => { const v = String(e.target.value); setFilterProjectId(v === '' ? '' : v); }}
            label="Project"
          >
            <MenuItem value="">All projects</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>{p.project_name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Worker Type</InputLabel>
          <Select
            value={filterWorkerType}
            onChange={(e) => setFilterWorkerType(e.target.value as WorkerType | '')}
            label="Worker Type"
          >
            <MenuItem value="">All types</MenuItem>
            {WORKER_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Man-Hours</Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {metrics.totalManHours.toLocaleString()}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, fontSize: '0.75rem' }}>
                Regular + OT
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Labor Cost</Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatCurrency(metrics.totalCost)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Direct Labor</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatCurrency(metrics.directLaborCost)}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, fontSize: '0.75rem' }}>
                {metrics.directLaborHours.toLocaleString()} hrs
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>3rd Party Services</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatCurrency(metrics.thirdPartyCost)}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, fontSize: '0.75rem' }}>
                {metrics.uniqueWorkers} workers
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* Labor Cost by Project */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, borderRadius: 2, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Labor Cost by Project
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costByProject} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey="project" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), '']} contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                <Legend iconSize={8} />
                <Bar dataKey="direct" fill={NET_PACIFIC_COLORS.primary} name="Direct Labor" radius={[3, 3, 0, 0]} stackId="a" />
                <Bar dataKey="thirdParty" fill={NET_PACIFIC_COLORS.warning} name="3rd Party" radius={[3, 3, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Man-Hours by Project */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, borderRadius: 2, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Man-Hours by Project
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={manhoursByProject} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey="project" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                <Legend iconSize={8} />
                <Bar dataKey="regular" fill={NET_PACIFIC_COLORS.accent1} name="Regular Hours" radius={[3, 3, 0, 0]} stackId="a" />
                <Bar dataKey="overtime" fill={NET_PACIFIC_COLORS.error} name="Overtime Hours" radius={[3, 3, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* Cost Distribution Pie */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, borderRadius: 2, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Cost Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={typePieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={(entry: any) => `${entry.name} ${((entry.percent || 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {typePieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [formatCurrency(value), '']} contentStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Monthly Trend */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, borderRadius: 2, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Monthly Trend
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyTrend} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis yAxisId="cost" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}K`} />
                <YAxis yAxisId="hours" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip formatter={(value: number, name: string) => [name === 'Cost' ? formatCurrency(value) : `${value} hrs`, name]} contentStyle={{ fontSize: '12px' }} />
                <Legend iconSize={8} />
                <Bar yAxisId="cost" dataKey="cost" fill={NET_PACIFIC_COLORS.primary} name="Cost" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="hours" dataKey="hours" fill={NET_PACIFIC_COLORS.success} name="Hours" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Entries Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Labor Entries</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel active={sortConfig.key === 'date'} direction={sortConfig.key === 'date' ? sortConfig.direction : 'asc'} onClick={() => handleSort('date')}>
                      Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel active={sortConfig.key === 'projectName'} direction={sortConfig.key === 'projectName' ? sortConfig.direction : 'asc'} onClick={() => handleSort('projectName')}>
                      Project
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel active={sortConfig.key === 'workerName'} direction={sortConfig.key === 'workerName' ? sortConfig.direction : 'asc'} onClick={() => handleSort('workerName')}>
                      Worker
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell align="right">
                    <TableSortLabel active={sortConfig.key === 'hoursWorked'} direction={sortConfig.key === 'hoursWorked' ? sortConfig.direction : 'asc'} onClick={() => handleSort('hoursWorked')}>
                      Hours
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">OT Hrs</TableCell>
                  <TableCell align="right">Daily Rate</TableCell>
                  <TableCell align="right">
                    <TableSortLabel active={sortConfig.key === 'amount'} direction={sortConfig.key === 'amount' ? sortConfig.direction : 'asc'} onClick={() => handleSort('amount')}>
                      Amount
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Remarks</TableCell>
                  <TableCell align="center" width={80}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No labor entries yet. Click "Add Entry" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedEntries.slice(0, 100).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.date}</TableCell>
                      <TableCell>{entry.projectName}</TableCell>
                      <TableCell>{entry.workerName}</TableCell>
                      <TableCell>
                        <Chip
                          label={entry.workerType}
                          size="small"
                          sx={{
                            backgroundColor: entry.workerType === 'Direct Labor' ? NET_PACIFIC_COLORS.primary : NET_PACIFIC_COLORS.warning,
                            color: entry.workerType === 'Direct Labor' ? 'white' : '#2d3436',
                            fontWeight: 600,
                            fontSize: '0.7rem',
                          }}
                        />
                      </TableCell>
                      <TableCell>{entry.role || '—'}</TableCell>
                      <TableCell align="right">{entry.workerType === '3rd Party' ? '—' : entry.hoursWorked}</TableCell>
                      <TableCell align="right">{entry.workerType === '3rd Party' ? '—' : (entry.overtimeHours > 0 ? entry.overtimeHours : '—')}</TableCell>
                      <TableCell align="right">{entry.workerType === '3rd Party' ? '—' : formatCurrency(entry.dailyRate)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(entry.amount)}</TableCell>
                      <TableCell sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.remarks || '—'}</TableCell>
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => openEdit(entry)} title="Edit">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDelete(entry.id)} title="Delete" color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Labor Entry' : 'Add Labor Entry'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>Project</InputLabel>
                  <Select label="Project" value={formProjectId} onChange={(e) => { const v = String(e.target.value); setFormProjectId(v === '' ? '' : v); }}>
                    <MenuItem value="">— Select project —</MenuItem>
                    {projects.map((p) => (
                      <MenuItem key={p.id} value={String(p.id)}>{p.project_name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={8}>
                <TextField fullWidth size="small" label="Worker Name" value={formWorkerName} onChange={(e) => setFormWorkerName(e.target.value)} />
              </Grid>
              <Grid item xs={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Type</InputLabel>
                  <Select label="Type" value={formWorkerType} onChange={(e) => setFormWorkerType(e.target.value as WorkerType)}>
                    {WORKER_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth size="small" label="Role / Position" value={formRole} onChange={(e) => setFormRole(e.target.value)} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth size="small" label="Date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              {isThirdParty ? (
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Amount (₱)" type="number" value={formDirectAmount} onChange={(e) => setFormDirectAmount(e.target.value)} inputProps={{ min: 0, step: 1 }} />
                </Grid>
              ) : (
                <>
                  <Grid item xs={6}>
                    <TextField fullWidth size="small" label="Hours Worked" type="number" value={formHoursWorked} onChange={(e) => setFormHoursWorked(e.target.value)} inputProps={{ min: 0, step: 0.5 }} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth size="small" label="Daily Rate (₱)" type="number" value={formDailyRate} onChange={(e) => setFormDailyRate(e.target.value)} inputProps={{ min: 0, step: 1 }} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth size="small" label="Overtime Hours" type="number" value={formOvertimeHours} onChange={(e) => setFormOvertimeHours(e.target.value)} inputProps={{ min: 0, step: 0.5 }} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth size="small" label="Overtime Rate (₱/hr)" type="number" value={formOvertimeRate} onChange={(e) => setFormOvertimeRate(e.target.value)} inputProps={{ min: 0, step: 1 }} />
                  </Grid>
                  <Grid item xs={12}>
                    <Paper sx={{ p: 1.5, bgcolor: '#f0f7ff', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                        Computed Amount: {formatCurrency(computeAmount(Number(formHoursWorked) || 0, Number(formDailyRate) || 0, Number(formOvertimeHours) || 0, Number(formOvertimeRate) || 0))}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        = ({formHoursWorked || 0} hrs / 8) × ₱{formDailyRate || 0} + {formOvertimeHours || 0} OT hrs × ₱{formOvertimeRate || 0}
                      </Typography>
                    </Paper>
                  </Grid>
                </>
              )}
              <Grid item xs={12}>
                <TextField fullWidth size="small" label="Remarks" value={formRemarks} onChange={(e) => setFormRemarks(e.target.value)} multiline rows={2} />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={formProjectId === '' || !formWorkerName.trim() || (isThirdParty ? !(Number(formDirectAmount) > 0) : !(Number(formDailyRate) > 0))}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {editingId ? 'Update' : 'Add Entry'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
