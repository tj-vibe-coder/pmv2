import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Divider,
  Button,
  IconButton,
  TextField,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Edit as EditIcon } from '@mui/icons-material';
import { Project } from '../types/Project';
import dataService from '../services/dataService';
import EditProjectDialog from './EditProjectDialog';
import { getBudget, setBudget } from '../utils/projectBudgetStorage';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Bar, Cell, Tooltip } from 'recharts';
import { ORDER_TRACKER_STORAGE_KEY } from './OrderTrackerPage';

const PROJECT_EXPENSES_KEY = 'projectExpenses';
const MATERIAL_REQUESTS_KEY = 'materialRequests';
const WBS_STORAGE_KEY = 'projectWBS';
export const REPORT_COMPANY_KEY = 'reportCompany';
const PROJECT_PROGRESS_SNAPSHOTS_KEY = 'projectProgressSnapshots';
const PROJECT_SERVICE_REPORTS_KEY = 'projectServiceReports';
export const REPORT_PREPARED_BY_KEY = 'reportPreparedBy';

export const REPORT_COMPANIES = {
  IOCT: 'IO Control Technologie OPC',
  ACT: 'Advance Controle Technologie Inc',
} as const;
export type ReportCompanyKey = keyof typeof REPORT_COMPANIES;

export const REPORT_COMPANY_ADDRESS: Record<ReportCompanyKey, string> = {
  ACT: 'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite, Region IV-A (Calabarzon), 4117',
  IOCT: 'B63, L7 Dynamism Jubilation Enclave, Santo Niño, City of Biñan, Laguna, Region IV-A (Calabarzon), 4024',
};


export interface WBSItem {
  id: string;
  code: string;
  name: string;
  weight: number;
  progress: number;
}

export function loadWBS(projectId: number): WBSItem[] {
  try {
    const raw = localStorage.getItem(WBS_STORAGE_KEY);
    if (raw) {
      const all: Record<string, WBSItem[]> = JSON.parse(raw);
      const items = all[String(projectId)] || [];
      return items.map((i) => ({
        ...i,
        weight: parseWBSNum(i.weight),
        progress: parseWBSNum(i.progress),
      }));
    }
  } catch (_) {}
  return [];
}

export function saveWBS(projectId: number, items: WBSItem[]): void {
  try {
    const raw = localStorage.getItem(WBS_STORAGE_KEY);
    const all: Record<string, WBSItem[]> = raw ? JSON.parse(raw) : {};
    all[String(projectId)] = items;
    localStorage.setItem(WBS_STORAGE_KEY, JSON.stringify(all));
  } catch (_) {}
}

export function parseWBSNum(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, Math.min(100, v));
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
    return Math.max(0, Math.min(100, n));
  }
  return 0;
}

export interface ProgressSnapshot {
  date: string;
  pbNumber: string;
  wbsItems: WBSItem[];
  overallProgress: number;
}

export function getProgressSnapshots(projectId: number): ProgressSnapshot[] {
  try {
    const raw = localStorage.getItem(PROJECT_PROGRESS_SNAPSHOTS_KEY);
    if (!raw) return [];
    const o: Record<string, ProgressSnapshot[]> = JSON.parse(raw);
    const list = o[String(projectId)] || [];
    return list.map((s) => ({
      ...s,
      wbsItems: (s.wbsItems || []).map((i) => ({
        ...i,
        weight: parseWBSNum(i.weight),
        progress: parseWBSNum(i.progress),
      })),
    }));
  } catch (_) {
    return [];
  }
}

export function saveProgressSnapshot(projectId: number, snapshot: ProgressSnapshot): void {
  try {
    const raw = localStorage.getItem(PROJECT_PROGRESS_SNAPSHOTS_KEY);
    const o: Record<string, ProgressSnapshot[]> = raw ? JSON.parse(raw) : {};
    const list = o[String(projectId)] || [];
    list.unshift(snapshot);
    o[String(projectId)] = list.slice(0, 100);
    localStorage.setItem(PROJECT_PROGRESS_SNAPSHOTS_KEY, JSON.stringify(o));
  } catch (_) {}
}

export function updateProgressSnapshotAt(projectId: number, index: number, snapshot: ProgressSnapshot): void {
  try {
    const raw = localStorage.getItem(PROJECT_PROGRESS_SNAPSHOTS_KEY);
    const o: Record<string, ProgressSnapshot[]> = raw ? JSON.parse(raw) : {};
    const list = o[String(projectId)] || [];
    if (index >= 0 && index < list.length) {
      list[index] = { ...snapshot, date: list[index].date };
      o[String(projectId)] = list;
      localStorage.setItem(PROJECT_PROGRESS_SNAPSHOTS_KEY, JSON.stringify(o));
    }
  } catch (_) {}
}

export interface ServiceReportActivityRow {
  activity: string;
  findingOutcome: string;
}

export interface ServiceReport {
  id: string;
  date: string;
  reportNo: string;
  title: string;
  startTime?: string;
  endTime?: string;
  /** New format: table rows. Legacy reports may have activities/findings instead. */
  activitiesTable?: ServiceReportActivityRow[];
  activities?: string;
  findings?: string;
  /** New format: table rows. Legacy reports may have recommendations string. */
  recommendationsTable?: string[];
  recommendations?: string;
  createdAt: string;
}

export function getServiceReports(projectId: number): ServiceReport[] {
  try {
    const raw = localStorage.getItem(PROJECT_SERVICE_REPORTS_KEY);
    if (!raw) return [];
    const o: Record<string, ServiceReport[]> = JSON.parse(raw);
    return o[String(projectId)] || [];
  } catch (_) {
    return [];
  }
}

export function saveServiceReport(projectId: number, report: Omit<ServiceReport, 'id' | 'createdAt'>): void {
  try {
    const raw = localStorage.getItem(PROJECT_SERVICE_REPORTS_KEY);
    const o: Record<string, ServiceReport[]> = raw ? JSON.parse(raw) : {};
    const list = o[String(projectId)] || [];
    const newReport: ServiceReport = {
      ...report,
      id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    list.unshift(newReport);
    o[String(projectId)] = list.slice(0, 100);
    localStorage.setItem(PROJECT_SERVICE_REPORTS_KEY, JSON.stringify(o));
  } catch (_) {}
}

export function clearServiceReports(projectId: number): void {
  try {
    const raw = localStorage.getItem(PROJECT_SERVICE_REPORTS_KEY);
    const o: Record<string, ServiceReport[]> = raw ? JSON.parse(raw) : {};
    delete o[String(projectId)];
    localStorage.setItem(PROJECT_SERVICE_REPORTS_KEY, JSON.stringify(o));
  } catch (_) {}
}

interface ProjectExpenseRow {
  projectId: number;
  amount: number;
  category: string;
  date?: string;
  description?: string;
}

function loadProjectExpenses(): ProjectExpenseRow[] {
  try {
    const raw = localStorage.getItem(PROJECT_EXPENSES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

function loadOrders(): { id: string; orderNo: string; projectId: number | null; orderDate: string; expectedDelivery?: string }[] {
  try {
    const raw = localStorage.getItem(ORDER_TRACKER_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

function loadMaterialRequests(): { id: string; requestNo: string; projectId: number | null; requestDate: string }[] {
  try {
    const raw = localStorage.getItem(MATERIAL_REQUESTS_KEY);
    if (raw) return JSON.parse(raw);
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

interface ProjectDetailsProps {
  project: Project;
  onBack: () => void;
  onProjectUpdated?: (project: Project) => void;
}

const ProjectDetails: React.FC<ProjectDetailsProps> = ({ project, onBack, onProjectUpdated }) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState(0);

  useEffect(() => {
    setBudgetAmount(getBudget(project.id));
  }, [project.id]);

  const handleBudgetChange = (value: number) => {
    setBudgetAmount(value);
    setBudget(project.id, value);
  };

  const billingPercentage = ((project.contract_billed || 0) / (project.updated_contract_amount || 1)) * 100;
  const backlogsAmount = dataService.getUnbilled(project);

  const expenseBreakdownData = useMemo(() => {
    const expenses = loadProjectExpenses().filter((e) => e.projectId === project.id);
    const byCategory: Record<string, number> = {};
    expenses.forEach((e) => {
      const cat = e.category?.trim() || 'Others';
      byCategory[cat] = (byCategory[cat] || 0) + e.amount;
    });
    return Object.entries(byCategory).map(([name, value]) => ({ name, value }));
  }, [project.id]);

  const projectHealthColor = useMemo(() => {
    const budget = getBudget(project.id);
    const expenses = loadProjectExpenses().filter((e) => e.projectId === project.id);
    const spent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const remaining = budget - spent;
    const remainingPct = budget > 0 ? (remaining / budget) * 100 : 100;
    if (budget <= 0) return '#9e9e9e';
    if (remaining < 0) return '#f44336';
    if (remainingPct <= 20) return '#ff9800';
    return '#4caf50';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- budgetAmount triggers re-run when user changes budget
  }, [project.id, budgetAmount]);


  const timelineEvents = useMemo(() => {
    const events: { date: string; sortKey: string; type: 'order' | 'mrf' | 'expense' | 'milestone'; label: string; detail?: string; color: string }[] = [];
    const poDate = project.po_date || project.start_date;
    if (poDate) {
      const d = typeof poDate === 'number' ? new Date(poDate * 1000).toISOString().slice(0, 10) : String(poDate).slice(0, 10);
      events.push({ date: d, sortKey: d + 'S', type: 'milestone', label: 'PO Date / Project Start', color: 'success.main' });
    }
    const orders = loadOrders().filter((o) => o.projectId === project.id);
    orders.forEach((o) => {
      events.push({ date: o.orderDate, sortKey: o.orderDate + 'O', type: 'order', label: `Order: ${o.orderNo}`, color: 'info.main' });
    });
    const mrfs = loadMaterialRequests().filter((m) => m.projectId === project.id);
    mrfs.forEach((m) => {
      events.push({ date: m.requestDate, sortKey: m.requestDate + 'M', type: 'mrf', label: `MRF: ${m.requestNo}`, color: 'warning.main' });
    });
    const expenses = loadProjectExpenses().filter((e) => e.projectId === project.id && e.date);
    expenses.forEach((e) => {
      const desc = (e.description || 'Expense').slice(0, 40);
      const amt = dataService.formatCurrency(e.amount);
      events.push({ date: e.date!, sortKey: e.date! + 'E', type: 'expense', label: `Expense: ${desc}`, detail: amt, color: 'primary.main' });
    });
    if (project.completion_date) {
      const d = typeof project.completion_date === 'number' ? new Date(project.completion_date * 1000).toISOString().slice(0, 10) : String(project.completion_date).slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      if (d <= today) {
        events.push({ date: d, sortKey: d + 'C', type: 'milestone', label: 'Project Completion', color: 'primary.main' });
      }
    }
    events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return events;
  }, [project.id, project.po_date, project.start_date, project.completion_date]);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1, color: '#2c5aa0' }}>
          {project.project_name}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          sx={{ ml: 2 }}
          onClick={() => setEditDialogOpen(true)}
        >
          Edit Project
        </Button>
      </Box>

      <EditProjectDialog
        open={editDialogOpen}
        project={project}
        onClose={() => setEditDialogOpen(false)}
        onSaved={(updated) => {
          onProjectUpdated?.(updated);
          setEditDialogOpen(false);
        }}
      />

      <Grid container spacing={3}>
        {/* Project Overview Card */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Project Overview
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Project No.
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.project_no || (project.item_no ?? project.id)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Project Name
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.project_name}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Client
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.account_name}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Status
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.actual_site_progress_percent ?? 0}%
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  PO Number
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.po_number || '—'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  PO Date (Project Start)
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.po_date ? dataService.formatDate(project.po_date) : '—'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Category
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.project_category}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  QTN Number
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.qtn_no}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Client Approver
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.client_approver}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Year
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.year}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Scope of Work
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.scope_of_work}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Location / Address
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.project_location || '—'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Created Date
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.created_at ? new Date(project.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                </Typography>
              </Grid>
              {project.completion_date && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Completion Date
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {dataService.formatDate(project.completion_date)}
                  </Typography>
                </Grid>
              )}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Last Updated
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.updated_at ? new Date(project.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                </Typography>
              </Grid>
              {project.remarks && (
                <Grid size={{ xs: 12 }}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Remarks
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {project.remarks}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Grid>

        {/* Financial Summary and Billing Progress Cards - Beside Overview */}
        <Grid size={{ xs: 12, md: 4 }}>
          {/* Financial Summary Card */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Financial Summary
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">
                Contract Amount
              </Typography>
              <Typography variant="h5" color="primary.main">
                {dataService.formatCurrency(project.updated_contract_amount || 0)}
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Project Budget
              </Typography>
              <TextField
                type="number"
                size="small"
                value={budgetAmount || ''}
                onChange={(e) => handleBudgetChange(Number(e.target.value) || 0)}
                placeholder="Set budget"
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ width: 200 }}
                helperText="Budget for this project (used in Expense Monitoring)"
              />
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">
                Backlogs
              </Typography>
              <Typography variant="h6">
                {dataService.formatCurrency(backlogsAmount)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {project.updated_contract_amount
                  ? `${((backlogsAmount / project.updated_contract_amount) * 100).toFixed(1)}% of contract unbilled`
                  : '—'}
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">
                Remaining Balance
              </Typography>
              <Typography variant="h6" color="warning.main">
                {dataService.formatCurrency(project.updated_contract_balance_net || 0)}
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">
                Retention
              </Typography>
              <Typography variant="h6">
                {dataService.formatCurrency(project.amount_for_retention_billing || 0)}
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box display="flex" alignItems="center">
              <Typography variant="subtitle2" color="textSecondary" sx={{ mr: 2 }}>
                Project Health
              </Typography>
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: projectHealthColor,
                }}
                title={projectHealthColor === '#4caf50' ? 'Healthy' : projectHealthColor === '#ff9800' ? 'At risk' : projectHealthColor === '#f44336' ? 'Over budget' : 'No budget set'}
              />
            </Box>
          </Paper>

          {/* Billing Progress Card */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Billing Progress
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Box
                  sx={{
                    width: '100%',
                    height: 8,
                    backgroundColor: 'grey.300',
                    borderRadius: 4,
                    mr: 2,
                  }}
                >
                  <Box
                    sx={{
                      width: `${billingPercentage}%`,
                      height: '100%',
                      backgroundColor: billingPercentage > 90 ? 'success.main' : 
                                     billingPercentage > 70 ? 'warning.main' : 'error.main',
                      borderRadius: 4,
                    }}
                  />
                </Box>
                <Typography variant="body2" color="textSecondary">
                  {billingPercentage.toFixed(1)}%
                </Typography>
              </Box>
              <Typography variant="body2" color="textSecondary">
                Duration: {project.duration_days} days
              </Typography>
            </CardContent>
          </Card>

          {/* Additional Details - Below Billing Progress */}
          <Paper sx={{ p: 3, mb: 3, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Additional Details
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="textSecondary">
                  Payment Terms: {project.payment_terms || 'N/A'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="textSecondary">
                  Bonds Requirement: {project.bonds_requirement || 'N/A'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Project Expense Chart - Full Width Below Overview */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ 
            p: 2, 
            mb: 3,
            borderRadius: 2,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0'
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Project Expense Breakdown
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Expenses from Expense Monitoring for this project, by category.
            </Typography>
            {expenseBreakdownData.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                No expenses recorded for this project yet. Add expenses in Expense Monitoring.
              </Typography>
            ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={expenseBreakdownData}
                margin={{ top: 20, right: 20, left: 20, bottom: 80 }}
              >
                <defs>
                  {['#1a365d', '#2c5aa0', '#3182ce', '#4299e1', '#63b3ed', '#90cdf4', '#bee3f8', '#e6f3ff', '#2d3748', '#4a5568'].map((color, index) => (
                    <linearGradient key={`expenseGradient-${index}`} id={`expenseGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={color} stopOpacity={0.3}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={100}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis 
                  tickFormatter={(value) => `₱${(value / 1000000).toFixed(1)}M`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <Tooltip 
                  formatter={(value: number) => [dataService.formatCurrency(value), 'Amount']}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {expenseBreakdownData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={`url(#expenseGradient${index % 10})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
            {expenseBreakdownData.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">
                Total expenses (this project): {dataService.formatCurrency(expenseBreakdownData.reduce((sum, row) => sum + row.value, 0))}
              </Typography>
            </Box>
            )}
          </Paper>
        </Grid>
      </Grid>


      {/* Timeline/Activity Section */}
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Project Timeline & Activity
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Milestones, orders (Order Tracker), MRF (Material Request), and expenses (Expense Monitoring) by date.
          </Typography>
          
          <Box sx={{ pl: 2, borderLeft: '2px solid #e0e0e0' }}>
            {timelineEvents.length === 0 && !project.po_date && !project.start_date && !project.completion_date ? (
              <Typography variant="body2" color="text.secondary">No timeline events yet. Add orders, MRFs, or expenses to see activity by date.</Typography>
            ) : (
              <>
                {timelineEvents.map((evt, idx) => (
                  <Box key={`${evt.sortKey}-${idx}`} sx={{ mb: 2, position: 'relative' }}>
                    <Box sx={{ position: 'absolute', left: -8, top: 4, width: 12, height: 12, borderRadius: '50%', bgcolor: evt.color }} />
                    <Typography variant="subtitle2" sx={{ ml: 2 }}>
                      {evt.date}: {evt.label}
                      {evt.detail != null && (
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                          {evt.detail}
                        </Typography>
                      )}
                    </Typography>
                  </Box>
                ))}
              </>
            )}
          </Box>

          {/* Project Details Summary */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Project Details
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="textSecondary">
                  Payment Terms: {project.payment_terms || 'N/A'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="textSecondary">
                  Bonds Requirement: {project.bonds_requirement || 'N/A'}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        </Paper>
      </Grid>
    </Container>
  );
};

export default ProjectDetails;