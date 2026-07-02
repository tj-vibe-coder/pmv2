import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  Chip,
  CircularProgress,
  Snackbar,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  ToggleButtonGroup,
  ToggleButton,
  Link,
} from '@mui/material';
import Grid from '@mui/material/Grid';
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
import { Add as AddIcon, Sync as SyncIcon, Delete as DeleteIcon, PhotoCamera as PhotoCameraIcon, PhotoLibrary as PhotoLibraryIcon, ExpandMore as ExpandMoreIcon, SwapHoriz as PromoteIcon, AddAPhoto as AddAPhotoIcon, OpenInNew as OpenInNewIcon, Edit as EditIcon, DriveFileMove as MoveIcon, Close as CloseIcon, DragIndicator as DragIndicatorIcon } from '@mui/icons-material';
import { Project } from '../types/Project';
import dataService from '../services/dataService';
import { getBudgets } from '../utils/projectBudgetStorage';
import { PURCHASE_ORDERS_STORAGE_KEY, type PurchaseOrder, type PurchaseOrderItem } from './PurchaseOrderPage';
import { API_BASE } from '../config/api';
import { PROJECT_EXPENSE_CATEGORIES, OVERHEAD_CATEGORIES, INVOICE_TYPES, INVESTORS, type FundingSource } from '../data/financeCategories';
import { parseReceipt, detectCropFromServer } from '../services/receiptParseService';
import { blobToBase64, compressForUpload } from '../utils/receipts/imageCompress';
import { detectReceiptQuad } from '../utils/receipts/autoCrop';
import { perspectiveCropToBlob, type Quad } from '../utils/receipts/perspectiveCrop';
import ReceiptCropper from './ReceiptCropper';
import ScanBatch from './ScanBatch';
import ScanWithPhoneButton from './ScanWithPhoneButton';
import { useAuth } from '../contexts/AuthContext';
import { getDriveItemThumbnailUrl, fetchDriveItemBlob, deleteDriveItem } from '../services/onedriveFolderService';

const EXPENSES_KEY = 'projectExpenses';

async function convertHeicToJpeg(file: File): Promise<File> {
  const name = file.name.toLowerCase();
  const isHeic = name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
  if (!isHeic) return file;
  try {
    const heic2any = (await import('heic2any')).default;
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(result) ? result[0] : result;
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export type ExpenseScope = 'project' | 'overhead';

// Sentinel value for the Project filter/select so "Overhead" can live in the same
// dropdown as real projects instead of a second control (roadmap §3).
const OVERHEAD_SENTINEL = '__overhead__';
// Every project expense, no overhead rows — the complement of OVERHEAD_SENTINEL.
const ALL_PROJECTS_SENTINEL = '__all_projects__';

export interface ProjectExpense {
  id: string;
  /** Which Firestore collection this row actually lives in — project_expenses or overhead_expenses.
   *  Client-side tag only, set when fetched; not a stored field. */
  scope: ExpenseScope;
  // Only present for scope === 'project' rows.
  projectId?: string;
  projectName?: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  createdAt: string;
  createdBy?: string;
  /** When synced from PO, avoid duplicate sync */
  sourcePoId?: string;
  sourcePoItemId?: string;
  /** When synced from Liquidation, avoid duplicate sync */
  sourceLiquidationId?: string;
  sourceLiquidationRowId?: string;
  sourceType?: 'manual' | 'receipt_scan' | 'po_sync' | 'liquidation_sync' | 'migrated';
  sourceCaId?: string;
  supplier?: string;
  invoiceNo?: string;
  invoiceType?: string;
  vat?: number;
  tin?: string;
  fundingSource?: FundingSource;
  receiptRef?: { oneDriveId: string; webUrl: string; filename: string };
}

const loadExpenses = (): ProjectExpense[] => {
  try {
    const raw = localStorage.getItem(EXPENSES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
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
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Mounted under both /expense-monitoring and /finance/expense-monitoring — match by suffix
  const isChildRoute = /\/(ca-form|liquidation-form|direct-labor)$/.test(location.pathname);
  
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(0);
  // Month (1-12) and quarter (1-4) are mutually exclusive; 0 = no filter.
  const [selectedMonth, setSelectedMonth] = useState<number>(0);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string | ''>('');
  const [loading, setLoading] = useState(true);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenseScope, setExpenseScope] = useState<ExpenseScope>('project');
  const [expenseProjectId, setExpenseProjectId] = useState<string | ''>('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseSupplier, setExpenseSupplier] = useState('');
  const [expenseInvoiceNo, setExpenseInvoiceNo] = useState('');
  const [expenseInvoiceType, setExpenseInvoiceType] = useState('');
  const [expenseVat, setExpenseVat] = useState('');
  const [expenseTin, setExpenseTin] = useState('');
  const [expenseFundingType, setExpenseFundingType] = useState<'corporate_bank' | 'investor_outofpocket'>('corporate_bank');
  const [expenseFundingInvestor, setExpenseFundingInvestor] = useState('');
  const [expenseLinkedInvestments, setExpenseLinkedInvestments] = useState<{ id: string; date: string; category: string; description: string; amount: number }[]>([]);
  const [expenseLinkedInvestmentId, setExpenseLinkedInvestmentId] = useState('');
  // AI-suggested on scan (mirrors LiquidationFormPage); reviewed/corrected later in the Tax Ledger.
  const [expenseDeductible, setExpenseDeductible] = useState<boolean | null>(null);
  const [expenseDeductibleReason, setExpenseDeductibleReason] = useState<string | null>(null);

  // Receipt crop step (mirrors ScanPage.tsx) before the AI parse.
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [editBlob, setEditBlob] = useState<Blob | null>(null);
  const [editQuad, setEditQuad] = useState<Quad | null>(null);

  // Superadmin: promote a manual/scanned expense to an employee's liquidation claim.
  const [promoteExpense, setPromoteExpense] = useState<ProjectExpense | null>(null);
  const [promoteUsers, setPromoteUsers] = useState<{ id: string; full_name: string | null; username: string }[]>([]);
  const [promoteUserId, setPromoteUserId] = useState('');
  const [promoteCAs, setPromoteCAs] = useState<{ id: string; ca_no: string; balance_remaining: number }[]>([]);
  const [promoteCaId, setPromoteCaId] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);
  const pendingReceiptRef = useRef<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  // Attach-receipt-later: retrofit a receipt photo onto an already-saved expense row
  // (no re-parse — the row's fields are already set, this just needs the image).
  const attachReceiptInputRef = useRef<HTMLInputElement>(null);
  const attachReceiptTargetRef = useRef<ProjectExpense | null>(null);
  const [attachingReceiptId, setAttachingReceiptId] = useState<string | null>(null);
  // Lazy OneDrive receipt thumbnails, keyed by oneDriveId (ported from OverheadExpensesPage).
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // Floating receipt viewer pane: full image fetched through the OneDrive proxy.
  const [viewer, setViewer] = useState<{ expense: ProjectExpense; url: string | null } | null>(null);
  const [viewerPos, setViewerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const viewerDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  // Edit an existing row (scope-aware PATCH).
  const [editExpense, setEditExpense] = useState<ProjectExpense | null>(null);
  const [editFields, setEditFields] = useState({ description: '', amount: '', date: '', category: '', supplier: '', invoiceNo: '', invoiceType: '', vat: '', tin: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  // Move a row between overhead and a project (server-side copy+delete).
  const [moveExpense, setMoveExpense] = useState<ProjectExpense | null>(null);
  const [moveProjectId, setMoveProjectId] = useState('');
  const [moveCategory, setMoveCategory] = useState('');
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [scanSnackbar, setScanSnackbar] = useState<{ open: boolean; severity: 'success' | 'error' | 'warning'; message: string }>({ open: false, severity: 'success', message: '' });
  const [scanBatchOpen, setScanBatchOpen] = useState(false);
  const [expensesDialogProject, setExpensesDialogProject] = useState<Project | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [localStorageCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(EXPENSES_KEY);
      if (!raw) return 0;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.length : 0;
    } catch (_) { return 0; }
  });

  const fetchExpenses = useCallback(async () => {
    setExpensesLoading(true);
    try {
      const token = localStorage.getItem('netpacific_token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [projRes, overheadRes] = await Promise.all([
        fetch(`${API_BASE}/api/project-expenses`, { headers }),
        fetch(`${API_BASE}/api/overhead-expenses`, { headers }),
      ]);
      const projData = await projRes.json().catch(() => ({ success: false, expenses: [] }));
      const overheadData = await overheadRes.json().catch(() => ({ success: false, expenses: [] }));
      const projRows: ProjectExpense[] = (projData.expenses || []).map((e: Omit<ProjectExpense, 'scope'>) => ({ ...e, scope: 'project' as const }));
      const overheadRows: ProjectExpense[] = (overheadData.expenses || []).map((e: Omit<ProjectExpense, 'scope'>) => ({ ...e, scope: 'overhead' as const }));
      const merged = [...projRows, ...overheadRows].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setExpenses(merged);
    } catch {
      setExpenses([]);
    } finally {
      setExpensesLoading(false);
    }
  }, []);

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
    fetchExpenses();
  }, [fetchExpenses]);

  // Reload expenses when navigating within expense monitoring (e.g. back from Liquidation form) so liquidations are reflected
  useEffect(() => {
    if (location.pathname.includes('/expense-monitoring')) {
      fetchExpenses();
    }
  }, [location.pathname, fetchExpenses]);

  const expensesInYear = useMemo(() => {
    if (selectedYear === 0 && selectedMonth === 0 && selectedQuarter === 0) return expenses;
    return expenses.filter((e) => {
      if (!e.date) return false;
      if (selectedYear !== 0 && !e.date.startsWith(String(selectedYear))) return false;
      const month = Number(e.date.slice(5, 7));
      if (selectedMonth !== 0 && month !== selectedMonth) return false;
      if (selectedQuarter !== 0 && Math.ceil(month / 3) !== selectedQuarter) return false;
      return true;
    });
  }, [expenses, selectedYear, selectedMonth, selectedQuarter]);

  // The budget cards/charts below are project-budget concepts — overhead expenses have
  // no project budget to track against, so they're excluded here (they still appear in
  // the unified Recent Expenses table below via `tableRows`).
  const projectExpensesInYear = useMemo(() => expensesInYear.filter((e) => e.scope === 'project'), [expensesInYear]);

  const spentByProject = useMemo(() => {
    const map: Record<string, number> = {};
    projectExpensesInYear.forEach((e) => {
      const key = String(e.projectId);
      map[key] = (map[key] || 0) + e.amount;
    });
    return map;
  }, [projectExpensesInYear]);

  const projectsForView = useMemo(() => {
    if (selectedProjectId === '' || selectedProjectId === ALL_PROJECTS_SENTINEL) return allProjects;
    const p = allProjects.find((x) => String(x.id) === selectedProjectId);
    return p ? [p] : [];
  }, [allProjects, selectedProjectId]);

  const expenseCategories = useMemo<ExpenseCategory[]>(() => {
    return projectsForView.map((p, i) => ({
      id: String(p.id),
      name: p.project_name,
      color: PIE_COLORS[i % PIE_COLORS.length],
      budget: budgets[String(p.id)] ?? 0,
      spent: spentByProject[String(p.id)] ?? 0,
    }));
  }, [projectsForView, budgets, spentByProject]);

  const expenseMetrics = useMemo(() => {
    // The all-projects sentinel behaves exactly like '' for the budget cards —
    // budgets are a project-only concept, so both aggregate every project.
    const isAggregate = selectedProjectId === '' || selectedProjectId === ALL_PROJECTS_SENTINEL;
    const totalBudget = isAggregate
      ? Object.values(budgets).reduce((a, b) => a + b, 0)
      : (budgets[selectedProjectId] ?? 0);
    const totalSpent = isAggregate
      ? projectExpensesInYear.reduce((sum, e) => sum + e.amount, 0)
      : selectedProjectId === OVERHEAD_SENTINEL
        ? expensesInYear.reduce((sum, e) => sum + (e.scope === 'overhead' ? e.amount : 0), 0)
        : (spentByProject[selectedProjectId] ?? 0);
    const totalRemaining = totalBudget - totalSpent;
    const spentPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    const overBudgetCount = isAggregate
      ? allProjects.filter((p) => (budgets[String(p.id)] ?? 0) > 0 && (spentByProject[String(p.id)] ?? 0) > (budgets[String(p.id)] ?? 0)).length
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
  }, [budgets, expensesInYear, projectExpensesInYear, spentByProject, allProjects, selectedProjectId]);

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
    projectExpensesInYear.forEach((e) => {
      if (selectedProjectId !== '' && selectedProjectId !== ALL_PROJECTS_SENTINEL && String(e.projectId) !== selectedProjectId) return;
      const month = e.date ? e.date.slice(0, 7) : '';
      if (month) byMonth[month] = (byMonth[month] || 0) + e.amount;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total, categories: {} }));
  }, [projectExpensesInYear, selectedProjectId]);

  // Unified table rows respecting the scope filter (roadmap §3): a specific project id
  // shows only that project's expenses, OVERHEAD_SENTINEL shows only overhead rows, and
  // '' (All) shows everything — both scopes, all projects.
  const tableRows = useMemo(() => {
    if (selectedProjectId === OVERHEAD_SENTINEL) return expensesInYear.filter((e) => e.scope === 'overhead');
    if (selectedProjectId === ALL_PROJECTS_SENTINEL) return expensesInYear.filter((e) => e.scope === 'project');
    if (selectedProjectId !== '') return expensesInYear.filter((e) => e.scope === 'project' && String(e.projectId) === selectedProjectId);
    return expensesInYear;
  }, [expensesInYear, selectedProjectId]);

  const expensesForProject = (projectId: string) => expenses.filter((e) => e.scope === 'project' && String(e.projectId) === projectId);

  const handleSyncFromPO = async () => {
    const pos = loadPOs();
    const newExpenses: ProjectExpense[] = [];
    const isMultiMRF = (po: { mrfIds?: string[]; mrfRequestNos?: string[] }) =>
      (po.mrfIds && po.mrfIds.length > 1) || (po.mrfRequestNos && po.mrfRequestNos.length > 1);

    for (const po of pos) {
      const pid = po.projectId;
      if (pid == null) continue;

      const project = allProjects.find((p) => String(p.id) === String(pid));
      const projectName = project?.project_name ?? po.projectName ?? '—';
      const orderDate = po.orderDate || new Date().toISOString().slice(0, 10);

      if (isMultiMRF(po)) {
        // Multiple MRFs: log each item separately
        for (const item of po.items || []) {
          const amt = lineTotal(item);
          if (amt <= 0) continue;

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
            scope: 'project',
            projectId: String(pid),
            projectName,
            description: `PO ${po.poNumber} · MRF ${mrfRequestNo}: ${desc}`,
            amount: amt,
            date: orderDate,
            category: 'Materials',
            createdAt: new Date().toISOString(),
            sourcePoId: po.id,
            sourcePoItemId: item.id,
            sourceType: 'po_sync',
          });
        }
      } else {
        // Single MRF: one expense per PO (total)
        const total = (po.items || []).reduce((sum, item) => sum + lineTotal(item), 0);
        if (total <= 0) continue;

        newExpenses.push({
          id: `exp-po-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          scope: 'project',
          projectId: String(pid),
          projectName,
          description: `PO ${po.poNumber} (${po.supplierName || '—'})`,
          amount: total,
          date: orderDate,
          category: 'Materials',
          createdAt: new Date().toISOString(),
          sourcePoId: po.id,
          sourceType: 'po_sync',
        });
      }
    }

    if (newExpenses.length === 0) {
      setSyncMessage({ type: 'info', text: 'No new POs with prices to sync. All POs are already logged or have no item prices.' });
      setTimeout(() => setSyncMessage(null), 4000);
      return;
    }

    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/project-expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ expenses: newExpenses }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        const count = data.count ?? newExpenses.length;
        if (count === 0) {
          setSyncMessage({ type: 'info', text: 'No new POs with prices to sync. All POs are already logged or have no item prices.' });
        } else {
          setSyncMessage({ type: 'success', text: `Synced ${count} expense(s) from PO.` });
        }
        await fetchExpenses();
      } else {
        setSyncMessage({ type: 'error', text: 'Failed to sync PO expenses.' });
      }
    } catch {
      setSyncMessage({ type: 'error', text: 'Error syncing PO expenses.' });
    }
    setTimeout(() => setSyncMessage(null), 4000);
  };

  const handleSyncFromLiquidation = async () => {
    try {
      const token = localStorage.getItem('netpacific_token');
      if (!token) {
        setSyncMessage({ type: 'error', text: 'Not authenticated. Please log in first.' });
        setTimeout(() => setSyncMessage(null), 4000);
        return;
      }
      const res = await fetch(`${API_BASE}/api/liquidations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (!data.success || !data.liquidations) {
        setSyncMessage({ type: 'error', text: 'Failed to fetch liquidations.' });
        setTimeout(() => setSyncMessage(null), 4000);
        return;
      }

      const submitted = data.liquidations.filter((l: any) => l.status === 'submitted');
      const newExpenses: ProjectExpense[] = [];
      for (const liq of submitted) {
        let rows: any[] = [];
        try { rows = JSON.parse(liq.rows_json || '[]'); } catch (_) { continue; }

        for (const row of rows) {
          const pid = row.projectId != null && row.projectId !== '' ? String(row.projectId) : '';
          if (!pid) continue;
          const amt = Number(row.amount);
          if (!amt || amt <= 0) continue;

          const project = allProjects.find((p) => String(p.id) === pid);
          const projectName = row.projectName || project?.project_name || '—';

          newExpenses.push({
            id: `exp-liq-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            scope: 'project',
            projectId: pid,
            projectName,
            description: `Liquidation ${liq.form_no}: ${(row.particulars || '').trim() || 'Liquidation'}`,
            amount: amt,
            date: row.date || liq.date_of_submission || new Date().toISOString().slice(0, 10),
            category: (row.category || '').trim() || 'Others',
            createdAt: new Date().toISOString(),
            sourceLiquidationId: liq.id,
            sourceLiquidationRowId: row.id,
            sourceType: 'liquidation_sync',
          });
        }
      }

      if (newExpenses.length === 0) {
        setSyncMessage({ type: 'info', text: 'No new liquidation expenses to sync. All submitted liquidations are already logged.' });
      } else {
        const syncRes = await fetch(`${API_BASE}/api/project-expenses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ expenses: newExpenses }),
        });
        const syncData = await syncRes.json().catch(() => ({ success: false }));
        if (syncData.success) {
          const count = syncData.count ?? newExpenses.length;
          if (count === 0) {
            setSyncMessage({ type: 'info', text: 'No new liquidation expenses to sync. All submitted liquidations are already logged.' });
          } else {
            setSyncMessage({ type: 'success', text: `Synced ${count} liquidation expense(s).` });
          }
          await fetchExpenses();
        } else {
          setSyncMessage({ type: 'error', text: 'Failed to save liquidation expenses.' });
        }
      }
    } catch (err) {
      setSyncMessage({ type: 'error', text: 'Error syncing liquidations.' });
    }
    setTimeout(() => setSyncMessage(null), 4000);
  };

  const handleMigrateToCloud = async () => {
    const localExpenses = loadExpenses();
    if (localExpenses.length === 0) {
      setSyncMessage({ type: 'info', text: 'No local expenses found to migrate.' });
      setTimeout(() => setSyncMessage(null), 4000);
      return;
    }
    if (!window.confirm(`Migrate ${localExpenses.length} local expense(s) to Firestore? Duplicates are skipped automatically.`)) return;
    setMigrating(true);
    try {
      const token = localStorage.getItem('netpacific_token');
      if (!token) {
        setSyncMessage({ type: 'error', text: 'Not authenticated. Please log in first.' });
        setTimeout(() => setSyncMessage(null), 4000);
        return;
      }
      const res = await fetch(`${API_BASE}/api/project-expenses/migrate-from-localstorage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expenses: localExpenses }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        setSyncMessage({ type: 'success', text: `Migration complete: ${data.inserted} expense(s) saved to cloud, ${data.skipped} already existed.` });
      } else {
        setSyncMessage({ type: 'error', text: data.error || 'Migration failed. You may not have admin access.' });
      }
    } catch {
      setSyncMessage({ type: 'error', text: 'Migration failed. Check your connection.' });
    } finally {
      setMigrating(false);
      setTimeout(() => setSyncMessage(null), 6000);
    }
  };

  const handleDeleteExpense = async (expense: ProjectExpense) => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    try {
      const token = localStorage.getItem('netpacific_token');
      const endpoint = expense.scope === 'overhead' ? 'overhead-expenses' : 'project-expenses';
      const res = await fetch(`${API_BASE}/api/${endpoint}/${expense.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        // Best-effort OneDrive cleanup of the orphaned receipt file — Firestore is
        // the source of truth, so a failure here never blocks the delete.
        if (expense.receiptRef?.oneDriveId) {
          void deleteDriveItem('server', 'server', expense.receiptRef.oneDriveId);
        }
        await fetchExpenses();
      }
    } catch {
      // silent — expense stays in list if request fails
    }
  };

  // Sync-sourced rows are managed by their origin job (PO/liquidation/payroll sync) —
  // editing or moving them here would be overwritten or double-counted on re-sync.
  const isUserManagedRow = (e: ProjectExpense) =>
    !e.sourceType || e.sourceType === 'manual' || e.sourceType === 'receipt_scan' || e.sourceType === 'migrated';

  const openEditDialog = (expense: ProjectExpense) => {
    setEditError('');
    setEditFields({
      description: expense.description || '',
      amount: String(expense.amount ?? ''),
      date: expense.date || '',
      category: expense.category || '',
      supplier: expense.supplier || '',
      invoiceNo: expense.invoiceNo || '',
      invoiceType: expense.invoiceType || '',
      vat: expense.vat != null ? String(expense.vat) : '',
      tin: expense.tin || '',
    });
    setEditExpense(expense);
  };

  const handleSaveEdit = async () => {
    if (!editExpense) return;
    const amount = Number(editFields.amount) || 0;
    if (amount <= 0) { setEditError('Enter an amount greater than 0'); return; }
    setSavingEdit(true);
    setEditError('');
    try {
      const token = localStorage.getItem('netpacific_token');
      const endpoint = editExpense.scope === 'overhead' ? 'overhead-expenses' : 'project-expenses';
      const res = await fetch(`${API_BASE}/api/${endpoint}/${editExpense.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          description: editFields.description.trim() || '—',
          amount,
          date: editFields.date,
          category: editFields.category.trim() || 'Others',
          supplier: editFields.supplier.trim(),
          invoiceNo: editFields.invoiceNo.trim(),
          invoiceType: editFields.invoiceType,
          tin: editFields.tin.trim(),
          ...(editFields.vat !== '' && !isNaN(Number(editFields.vat)) ? { vat: Number(editFields.vat) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        setEditExpense(null);
        await fetchExpenses();
      } else {
        setEditError(data.error || 'Failed to save changes');
      }
    } catch {
      setEditError('Failed to save changes. Check your connection.');
    } finally {
      setSavingEdit(false);
    }
  };

  const openMoveDialog = (expense: ProjectExpense) => {
    setMoveError('');
    setMoveProjectId('');
    // Preselect the category if it exists on the other side, otherwise force a re-pick.
    const targetList: readonly string[] = expense.scope === 'overhead' ? PROJECT_EXPENSE_CATEGORIES : OVERHEAD_CATEGORIES;
    setMoveCategory(targetList.includes(expense.category) ? expense.category : '');
    setMoveExpense(expense);
  };

  const handleMove = async () => {
    if (!moveExpense) return;
    if (moveExpense.scope === 'overhead' && !moveProjectId) { setMoveError('Select a project'); return; }
    setMoving(true);
    setMoveError('');
    try {
      const token = localStorage.getItem('netpacific_token');
      const project = allProjects.find((p) => String(p.id) === moveProjectId);
      const url = moveExpense.scope === 'overhead'
        ? `${API_BASE}/api/overhead-expenses/${moveExpense.id}/convert-to-project`
        : `${API_BASE}/api/project-expenses/${moveExpense.id}/convert-to-overhead`;
      const body = moveExpense.scope === 'overhead'
        ? { projectId: moveProjectId, projectName: project?.project_name ?? '—', ...(moveCategory ? { category: moveCategory } : {}) }
        : { ...(moveCategory ? { category: moveCategory } : {}) };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        setMoveExpense(null);
        setScanSnackbar({ open: true, severity: 'success', message: moveExpense.scope === 'overhead' ? 'Moved to project expenses.' : 'Moved to overhead expenses.' });
        await fetchExpenses();
      } else {
        setMoveError(data.error || 'Failed to move expense');
      }
    } catch {
      setMoveError('Failed to move expense. Check your connection.');
    } finally {
      setMoving(false);
    }
  };

  // Attach-receipt-later: user picks a photo for an existing row; upload it to OneDrive
  // (project folder for project rows, overhead folder otherwise) and PATCH the row's
  // receiptRef on the matching collection's endpoint. No crop/AI parse — the expense's
  // fields already exist; this only backfills the missing image.
  const openAttachReceipt = (expense: ProjectExpense) => {
    attachReceiptTargetRef.current = expense;
    attachReceiptInputRef.current?.click();
  };

  const handleAttachReceiptInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = attachReceiptTargetRef.current;
    attachReceiptTargetRef.current = null;
    if (!file || !target) return;
    setAttachingReceiptId(target.id);
    try {
      const token = localStorage.getItem('netpacific_token');
      const safeFile = await convertHeicToJpeg(file);
      const compressed = await compressForUpload(safeFile);
      const contentBase64 = await blobToBase64(compressed);
      const year = String((target.date || '').slice(0, 4) || new Date().getFullYear());
      const filename = `SCAN-${Date.now()}.jpg`;
      const project = target.scope === 'project' ? allProjects.find((p) => String(p.id) === String(target.projectId)) : undefined;
      const folderPath = target.scope === 'project'
        ? `Project Receipts/${project?.project_no || target.projectId}/${year}`
        : `00 Overhead Receipts/${year}`;
      const upRes = await fetch(`${API_BASE}/api/onedrive/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ folderPath, filename, contentBase64 }),
      });
      const upData = await upRes.json().catch(() => ({ ok: false })) as { ok: boolean; id?: string; webUrl?: string };
      if (!upData.ok || !upData.id || !upData.webUrl) {
        setScanSnackbar({ open: true, severity: 'error', message: 'Receipt upload to OneDrive failed. Try again.' });
        return;
      }
      const endpoint = target.scope === 'overhead' ? 'overhead-expenses' : 'project-expenses';
      const patchRes = await fetch(`${API_BASE}/api/${endpoint}/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ receiptRef: { oneDriveId: upData.id, webUrl: upData.webUrl, filename } }),
      });
      const patchData = await patchRes.json().catch(() => ({ success: false }));
      if (patchData.success) {
        setScanSnackbar({ open: true, severity: 'success', message: 'Receipt attached.' });
        await fetchExpenses();
      } else {
        setScanSnackbar({ open: true, severity: 'error', message: patchData.error || 'Failed to attach receipt to the expense.' });
      }
    } catch (err) {
      setScanSnackbar({ open: true, severity: 'error', message: err instanceof Error ? err.message : 'Failed to attach receipt' });
    } finally {
      setAttachingReceiptId(null);
    }
  };

  const openPromoteDialog = async (expense: ProjectExpense) => {
    setPromoteExpense(expense);
    setPromoteUserId('');
    setPromoteCaId('');
    setPromoteCAs([]);
    setPromoteError('');
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/users`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) setPromoteUsers(data.users);
    } catch {
      // silent — dialog still opens, employee list just stays empty
    }
  };

  const handlePromoteUserChange = async (userId: string) => {
    setPromoteUserId(userId);
    setPromoteCaId('');
    setPromoteCAs([]);
    if (!userId) return;
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/cash-advances`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        const eligible = (data.cash_advances || []).filter((ca: { user_id: string; status: string; balance_remaining: number }) =>
          String(ca.user_id) === userId && ca.status === 'approved' && (Number(ca.balance_remaining) || 0) > 0
        );
        setPromoteCAs(eligible.map((ca: { id: string; ca_no: string; balance_remaining: number }) => ({ id: ca.id, ca_no: ca.ca_no, balance_remaining: Number(ca.balance_remaining) || 0 })));
      }
    } catch {
      // silent — falls back to standalone out-of-pocket
    }
  };

  const handlePromote = async () => {
    if (!promoteExpense || !promoteUserId) return;
    setPromoting(true);
    setPromoteError('');
    try {
      const token = localStorage.getItem('netpacific_token');
      const endpoint = promoteExpense.scope === 'overhead' ? 'overhead-expenses' : 'project-expenses';
      const res = await fetch(`${API_BASE}/api/${endpoint}/${promoteExpense.id}/promote-to-liquidation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ userId: promoteUserId, ...(promoteCaId ? { caId: promoteCaId } : {}) }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        setPromoteExpense(null);
        await fetchExpenses();
      } else {
        setPromoteError(data.error || 'Failed to promote expense');
      }
    } catch {
      setPromoteError('Failed to promote expense. Check your connection.');
    } finally {
      setPromoting(false);
    }
  };

  const setEdit = useCallback((blob: Blob | null, quad: Quad | null) => {
    setEditUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return blob ? URL.createObjectURL(blob) : null; });
    setEditBlob(blob);
    setEditQuad(quad);
  }, []);

  useEffect(() => () => { if (editUrl) URL.revokeObjectURL(editUrl); }, [editUrl]);

  useEffect(() => { if (!addExpenseOpen) pendingReceiptRef.current = null; }, [addExpenseOpen]);

  // `?scope=overhead` presets the filter — used by the old /finance/overhead-expenses
  // route, which now redirects here. Run once on mount.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('scope') === 'overhead') {
      setSelectedProjectId(OVERHEAD_SENTINEL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort lazy receipt thumbnails via the server-side OneDrive proxy
  // (ported from OverheadExpensesPage). Never throws.
  useEffect(() => {
    let cancelled = false;
    const loadThumbs = async () => {
      const missing = expenses.filter((e) => e.receiptRef?.oneDriveId && !thumbs[e.receiptRef.oneDriveId]);
      if (missing.length === 0) return;
      try {
        const entries: Array<[string, string]> = [];
        for (const e of missing) {
          const oneDriveId = e.receiptRef!.oneDriveId;
          const url = await getDriveItemThumbnailUrl('server', 'server', oneDriveId);
          if (url) entries.push([oneDriveId, url]);
        }
        if (!cancelled && entries.length > 0) {
          setThumbs((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        }
      } catch (err) {
        console.warn('[OneDrive] receipt thumbnail fetch failed:', err);
      }
    };
    void loadThumbs();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses]);

  // Revoke the viewer pane's object URL when it changes or the pane closes.
  useEffect(() => () => { if (viewer?.url) URL.revokeObjectURL(viewer.url); }, [viewer]);

  const openReceiptViewer = async (expense: ProjectExpense) => {
    if (!expense.receiptRef?.oneDriveId) return;
    setViewerPos({ x: 0, y: 0 });
    setViewer({ expense, url: null });
    try {
      const blob = await fetchDriveItemBlob('server', 'server', expense.receiptRef.oneDriveId);
      setViewer((prev) => (prev && prev.expense.id === expense.id ? { ...prev, url: URL.createObjectURL(blob) } : prev));
    } catch (err) {
      console.warn('[OneDrive] receipt image fetch failed:', err);
      setScanSnackbar({ open: true, severity: 'error', message: 'Could not load the receipt image. Use "Open in OneDrive" instead.' });
    }
  };

  const onViewerDragStart = (e: React.PointerEvent) => {
    viewerDragRef.current = { startX: e.clientX, startY: e.clientY, baseX: viewerPos.x, baseY: viewerPos.y };
    const onMove = (ev: PointerEvent) => {
      const d = viewerDragRef.current;
      if (!d) return;
      setViewerPos({ x: d.baseX + ev.clientX - d.startX, y: d.baseY + ev.clientY - d.startY });
    };
    const onUp = () => {
      viewerDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Phase 1: pick a photo, auto-detect its corners, and open the crop dialog.
  const handleScanInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsScanning(true);
    try {
      const safeFile = await convertHeicToJpeg(file);
      let detected = await detectReceiptQuad(safeFile);
      if (!detected) {
        try {
          const imageBase64 = await blobToBase64(safeFile);
          detected = await detectCropFromServer(imageBase64, safeFile.type || 'image/jpeg');
        } catch {
          // best-effort — fall through to the default quad
        }
      }
      const quad: Quad = detected ?? [
        { x: 0.12, y: 0.14 }, { x: 0.88, y: 0.14 }, { x: 0.88, y: 0.86 }, { x: 0.12, y: 0.86 },
      ];
      setEdit(safeFile, quad);
    } catch (err) {
      setScanSnackbar({ open: true, severity: 'error', message: err instanceof Error ? err.message : 'Could not process photo' });
    } finally {
      setIsScanning(false);
    }
  };

  const retakeScan = () => {
    setEdit(null, null);
    pendingReceiptRef.current = null;
    scanInputRef.current?.click();
  };

  // Phase 2: user confirms the crop — flatten the quad, then parse with Gemini.
  const confirmScanCrop = async (quad: Quad) => {
    if (!editBlob) return;
    setIsScanning(true);
    try {
      const flattened = await perspectiveCropToBlob(editBlob, quad);
      const croppedFile = new File([flattened], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' });
      pendingReceiptRef.current = croppedFile;
      const imageBase64 = await blobToBase64(flattened);
      const parsed = await parseReceipt(imageBase64, 'image/jpeg');
      const amt = parsed.total ?? parsed.subtotal;
      if (typeof amt === 'number' && amt > 0) setExpenseAmount(String(amt));
      if (parsed.date) setExpenseDate(parsed.date);
      const scanCategoryList: readonly string[] = expenseScope === 'overhead' ? OVERHEAD_CATEGORIES : PROJECT_EXPENSE_CATEGORIES;
      if (parsed.suggestedCategory && scanCategoryList.includes(parsed.suggestedCategory)) {
        setExpenseCategory(parsed.suggestedCategory);
      }
      const desc = parsed.vendor || parsed.lineItems?.[0]?.description;
      if (desc && !expenseDescription.trim()) setExpenseDescription(desc);
      if (parsed.vendor) setExpenseSupplier(parsed.vendor);
      if (parsed.invoiceNumber) setExpenseInvoiceNo(parsed.invoiceNumber);
      if (parsed.invoiceType) {
        const matched = INVOICE_TYPES.find((t) => t.toLowerCase() === parsed.invoiceType?.toLowerCase());
        setExpenseInvoiceType(matched || '');
      }
      if (parsed.tax !== null && parsed.tax !== undefined) setExpenseVat(String(parsed.tax));
      if (typeof parsed.deductible === 'boolean') setExpenseDeductible(parsed.deductible);
      if (parsed.deductibleReason) setExpenseDeductibleReason(parsed.deductibleReason);
      const lowConf = typeof parsed.confidence === 'number' && parsed.confidence < 0.5;
      const pct = typeof parsed.confidence === 'number' ? Math.round(parsed.confidence * 100) : null;
      if (lowConf) {
        setScanSnackbar({ open: true, severity: 'warning', message: `Low confidence${pct !== null ? ` (${pct}%)` : ''} — please verify amount, date & category. Parsed: ${parsed.vendor || 'Unknown vendor'} (PHP ${Number(amt ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })})` });
      } else {
        setScanSnackbar({ open: true, severity: 'success', message: `Parsed: ${parsed.vendor || 'Unknown vendor'} (PHP ${Number(amt ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })})` });
      }
      setEdit(null, null);
    } catch (err) {
      setScanSnackbar({ open: true, severity: 'error', message: err instanceof Error ? err.message : 'Failed to parse receipt' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleExpenseInvestorChange = async (investor: string) => {
    setExpenseFundingInvestor(investor);
    setExpenseLinkedInvestmentId('');
    setExpenseLinkedInvestments([]);
    if (!investor) return;
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/investments`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        const eligible = (data.investments || []).filter((inv: { investor: string; sourceType?: string }) =>
          inv.investor === investor && inv.sourceType !== 'expense_sync'
        );
        setExpenseLinkedInvestments(eligible.map((inv: { id: string; date: string; category: string; description: string; amount: number }) => ({
          id: inv.id, date: inv.date, category: inv.category, description: inv.description, amount: Number(inv.amount) || 0,
        })));
      }
    } catch {
      // silent — admin-only endpoint; non-admins just won't see linkable investments
    }
  };

  const handleAddExpense = async () => {
    const pid = expenseProjectId === '' ? null : String(expenseProjectId);
    const amount = Number(expenseAmount) || 0;
    if (expenseScope === 'project' && pid == null) return;
    if (amount <= 0) return;
    if (expenseFundingType === 'investor_outofpocket' && !expenseFundingInvestor) return;
    const project = expenseScope === 'project' ? allProjects.find((p) => String(p.id) === pid) : undefined;
    setSavingExpense(true);
    try {
      const token = localStorage.getItem('netpacific_token');
      let receiptRef: { oneDriveId: string; webUrl: string; filename: string } | undefined;
      const pendingFile = pendingReceiptRef.current;
      if (pendingFile) {
        try {
          const compressed = await compressForUpload(pendingFile);
          const contentBase64 = await blobToBase64(compressed);
          const year = String(new Date().getFullYear());
          const filename = `SCAN-${Date.now()}.jpg`;
          const folderPath = expenseScope === 'project'
            ? `Project Receipts/${project?.project_no || pid}/${year}`
            : `00 Overhead Receipts/${year}`;
          const upRes = await fetch(`${API_BASE}/api/onedrive/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ folderPath, filename, contentBase64 }),
          });
          const upData = await upRes.json().catch(() => ({ ok: false })) as { ok: boolean; id?: string; webUrl?: string };
          if (upData.ok && upData.id && upData.webUrl) {
            receiptRef = { oneDriveId: upData.id, webUrl: upData.webUrl, filename };
          } else {
            console.warn('[OneDrive] expense receipt upload failed or returned not ok:', upData);
          }
        } catch (err) {
          console.warn('[OneDrive] expense receipt upload failed (expense still saved):', err);
        }
      }
      const endpoint = expenseScope === 'project' ? 'project-expenses' : 'overhead-expenses';
      const res = await fetch(`${API_BASE}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          ...(expenseScope === 'project' ? { projectId: pid, projectName: project?.project_name ?? '—' } : {}),
          description: expenseDescription.trim() || '—',
          amount,
          date: expenseDate,
          category: expenseCategory.trim() || '—',
          sourceType: pendingFile ? 'receipt_scan' : 'manual',
          ...(expenseSupplier.trim() ? { supplier: expenseSupplier.trim() } : {}),
          ...(expenseInvoiceNo.trim() ? { invoiceNo: expenseInvoiceNo.trim() } : {}),
          ...(expenseInvoiceType ? { invoiceType: expenseInvoiceType } : {}),
          ...(expenseVat && !isNaN(Number(expenseVat)) ? { vat: Number(expenseVat) } : {}),
          ...(expenseTin.trim() ? { tin: expenseTin.trim() } : {}),
          ...(expenseFundingType === 'investor_outofpocket' && expenseFundingInvestor
            ? { fundingSource: { type: 'investor_outofpocket', investor: expenseFundingInvestor, ...(expenseLinkedInvestmentId ? { linkedInvestmentId: expenseLinkedInvestmentId } : {}) } }
            : {}),
          ...(typeof expenseDeductible === 'boolean' ? { deductible: expenseDeductible } : {}),
          ...(expenseDeductibleReason ? { deductibleReason: expenseDeductibleReason } : {}),
          ...(receiptRef ? { receiptRef } : {}),
        }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        setAddExpenseOpen(false);
        setExpenseProjectId('');
        setExpenseAmount('');
        setExpenseDate(new Date().toISOString().slice(0, 10));
        setExpenseDescription('');
        setExpenseCategory('');
        setExpenseSupplier('');
        setExpenseInvoiceNo('');
        setExpenseInvoiceType('');
        setExpenseVat('');
        setExpenseTin('');
        setExpenseFundingType('corporate_bank');
        setExpenseFundingInvestor('');
        setExpenseLinkedInvestments([]);
        setExpenseLinkedInvestmentId('');
        setExpenseDeductible(null);
        setExpenseDeductibleReason(null);
        pendingReceiptRef.current = null;
        await fetchExpenses();
      }
    } catch {
      // silent
    } finally {
      setSavingExpense(false);
    }
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
          <ScanWithPhoneButton />
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={handleSyncFromPO}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Sync from PO
          </Button>
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={handleSyncFromLiquidation}
            sx={{ borderColor: NET_PACIFIC_COLORS.accent1, color: NET_PACIFIC_COLORS.accent1 }}
          >
            Sync from Liquidation
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setExpenseSupplier(''); setExpenseInvoiceNo(''); setExpenseInvoiceType(''); setExpenseVat(''); setExpenseTin(''); pendingReceiptRef.current = null;
              // Default the dialog's scope/project to whatever the table is filtered to.
              setExpenseScope(selectedProjectId === OVERHEAD_SENTINEL ? 'overhead' : 'project');
              if (selectedProjectId !== '' && selectedProjectId !== OVERHEAD_SENTINEL && selectedProjectId !== ALL_PROJECTS_SENTINEL) setExpenseProjectId(selectedProjectId);
              setAddExpenseOpen(true);
            }}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add Expense
          </Button>
        </Box>
      </Box>

      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
        PO totals are read from browser storage.
      </Typography>

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

      {localStorageCount > 0 && (
        <Box
          sx={{
            py: 1, px: 2, mb: 2, borderRadius: 1,
            bgcolor: 'info.light', color: 'info.dark',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
          }}
        >
          <Typography variant="body2">
            {localStorageCount} expense{localStorageCount !== 1 ? 's' : ''} stored locally (browser only). Migrate to cloud so all team members can see them.
          </Typography>
          <Button
            size="small" variant="outlined" disabled={migrating}
            onClick={handleMigrateToCloud}
            sx={{ borderColor: 'info.dark', color: 'info.dark', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {migrating ? 'Migrating…' : 'Migrate to cloud'}
          </Button>
        </Box>
      )}

      {expensesLoading && <LinearProgress sx={{ mb: 1 }} />}

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
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Month</InputLabel>
          <Select
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(Number(e.target.value)); setSelectedQuarter(0); }}
            label="Month"
          >
            <MenuItem value={0}>All months</MenuItem>
            {Array.from({ length: 12 }, (_, i) => (
              <MenuItem key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' })}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Quarter</InputLabel>
          <Select
            value={selectedQuarter}
            onChange={(e) => { setSelectedQuarter(Number(e.target.value)); setSelectedMonth(0); }}
            label="Quarter"
          >
            <MenuItem value={0}>All quarters</MenuItem>
            {[1, 2, 3, 4].map((q) => (
              <MenuItem key={q} value={q}>Q{q}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Scope</InputLabel>
          <Select
            value={selectedProjectId === '' ? '' : selectedProjectId}
            onChange={(e) => { const v = String(e.target.value); setSelectedProjectId(v === '' ? '' : v); }}
            label="Scope"
          >
            <MenuItem value="">All (projects + overhead)</MenuItem>
            <MenuItem value={ALL_PROJECTS_SENTINEL}>All projects (no overhead)</MenuItem>
            <MenuItem value={OVERHEAD_SENTINEL}>Overhead (no project)</MenuItem>
            {allProjects.map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>{p.project_name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {selectedProjectId !== '' && selectedProjectId !== OVERHEAD_SENTINEL && selectedProjectId !== ALL_PROJECTS_SENTINEL && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate(`/finance/projects/${selectedProjectId}/expenses`)}
          >
            Full Report
          </Button>
        )}
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ height: '100%', background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Budget</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatCurrency(expenseMetrics.totalBudget)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ height: '100%', background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Spent</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatCurrency(expenseMetrics.totalSpent)}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, fontSize: '0.75rem', mt: 0.5 }}>
                {expenseMetrics.spentPercentage.toFixed(1)}% of budget
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{
            height: '100%',
            color: 'white',
            background: expenseMetrics.statusColor === 'red'
              ? 'linear-gradient(135deg, #c62828 0%, #e57373 100%)'
              : expenseMetrics.statusColor === 'yellow'
                ? 'linear-gradient(135deg, #f9a825 0%, #ffd54f 100%)'
                : 'linear-gradient(135deg, #2e7d32 0%, #66bb6a 100%)',
          }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Remaining Budget</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatCurrency(expenseMetrics.totalRemaining)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{
            height: '100%',
            color: 'white',
            background: expenseMetrics.overBudgetCategories > 0
              ? 'linear-gradient(135deg, #c62828 0%, #e57373 100%)'
              : 'linear-gradient(135deg, #2e7d32 0%, #66bb6a 100%)',
          }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>
                {selectedProjectId === '' || selectedProjectId === ALL_PROJECTS_SENTINEL ? 'Over Budget Projects' : 'Over Budget'}
              </Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {expenseMetrics.overBudgetCategories}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* Expense Distribution Pie Chart */}
        <Grid size={{ xs: 12, md: 6 }}>
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
        <Grid size={{ xs: 12, md: 6 }}>
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
        <Grid size={{ xs: 12 }}>
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
                  <TableCell>Receipt</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell padding="none" align="center" width={170}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      {selectedYear === 0
                        ? 'No expenses yet. Use the Add Expense button to add an expense.'
                        : `No expenses in ${selectedYear}. Use the Add Expense button to add an expense.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  tableRows
                    .slice(0, 50)
                    .map((expense) => {
                      const project = expense.scope === 'project' ? allProjects.find((p) => String(p.id) === String(expense.projectId)) : undefined;
                      const projectNo = project?.project_no || String(project?.item_no ?? project?.id ?? '');
                      const poNumber = project?.po_number ?? '—';
                      return (
                    <TableRow key={`${expense.scope}-${expense.id}`}>
                      <TableCell>{expense.date}</TableCell>
                      <TableCell>
                        {expense.scope === 'overhead'
                          ? <Chip size="small" label="Overhead" variant="outlined" color="secondary" />
                          : expense.projectName}
                      </TableCell>
                      <TableCell>{expense.scope === 'overhead' ? '—' : (projectNo || '—')}</TableCell>
                      <TableCell>{expense.scope === 'overhead' ? '—' : poNumber}</TableCell>
                      <TableCell>{expense.category}</TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell align="right">{formatCurrency(expense.amount)}</TableCell>
                      <TableCell>
                        {expense.receiptRef?.oneDriveId && thumbs[expense.receiptRef.oneDriveId] ? (
                          <Box
                            component="img"
                            src={thumbs[expense.receiptRef.oneDriveId]}
                            alt="receipt"
                            onClick={() => openReceiptViewer(expense)}
                            onError={() => setThumbs((prev) => { const next = { ...prev }; delete next[expense.receiptRef!.oneDriveId]; return next; })}
                            sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider', cursor: 'pointer' }}
                          />
                        ) : expense.receiptRef?.webUrl ? (
                          <Link component="button" type="button" onClick={() => openReceiptViewer(expense)} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }}>
                            <OpenInNewIcon fontSize="inherit" /> View
                          </Link>
                        ) : (
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={
                            expense.sourceType === 'po_sync' ? 'PO' :
                            expense.sourceType === 'liquidation_sync' ? 'Liquidation' :
                            expense.sourceType === 'migrated' ? 'Migrated' :
                            expense.sourceType === 'receipt_scan' ? 'Scan' : 'Manual'
                          }
                          color={
                            expense.sourceType === 'po_sync' ? 'primary' :
                            expense.sourceType === 'liquidation_sync' ? 'warning' : 'default'
                          }
                        />
                      </TableCell>
                      <TableCell padding="none" align="center" sx={{ whiteSpace: 'nowrap' }}>
                        {/* Fixed-width slot per action (rendered empty when not applicable to this row)
                            so icons line up in columns instead of packing left and shifting per-row. */}
                        <Box sx={{ display: 'inline-flex', width: 34, justifyContent: 'center' }}>
                          {!expense.receiptRef?.webUrl && (
                            <IconButton size="small" onClick={() => openAttachReceipt(expense)} title="Attach receipt photo" color="primary" disabled={attachingReceiptId === expense.id}>
                              {attachingReceiptId === expense.id ? <CircularProgress size={16} /> : <AddAPhotoIcon fontSize="small" />}
                            </IconButton>
                          )}
                        </Box>
                        <Box sx={{ display: 'inline-flex', width: 34, justifyContent: 'center' }}>
                          {isUserManagedRow(expense) && (
                            <IconButton size="small" onClick={() => openEditDialog(expense)} title="Edit expense" color="primary">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                        <Box sx={{ display: 'inline-flex', width: 34, justifyContent: 'center' }}>
                          {isUserManagedRow(expense) && (
                            <IconButton size="small" onClick={() => openMoveDialog(expense)} title={expense.scope === 'overhead' ? 'Move to a project' : 'Move to overhead'} color="primary">
                              <MoveIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                        <Box sx={{ display: 'inline-flex', width: 34, justifyContent: 'center' }}>
                          {user?.role === 'superadmin' && (expense.sourceType === 'manual' || expense.sourceType === 'receipt_scan') && (
                            <IconButton size="small" onClick={() => openPromoteDialog(expense)} title="Promote to employee liquidation" color="primary">
                              <PromoteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                        <Box sx={{ display: 'inline-flex', width: 34, justifyContent: 'center' }}>
                          <IconButton size="small" onClick={() => handleDeleteExpense(expense)} title="Delete expense" color="error">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
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
              <Grid size={{ xs: 12 }}>
                <ToggleButtonGroup
                  fullWidth
                  exclusive
                  size="small"
                  color="primary"
                  value={expenseScope}
                  onChange={(_, v: ExpenseScope | null) => {
                    if (!v || v === expenseScope) return;
                    setExpenseScope(v);
                    // The two scopes use different category lists (COGS vs OPEX) — drop a
                    // selection that doesn't exist on the other side.
                    const nextList: readonly string[] = v === 'overhead' ? OVERHEAD_CATEGORIES : PROJECT_EXPENSE_CATEGORIES;
                    if (expenseCategory && !nextList.includes(expenseCategory)) setExpenseCategory('');
                  }}
                >
                  <ToggleButton value="project">Project Expense</ToggleButton>
                  <ToggleButton value="overhead">Overhead Expense</ToggleButton>
                </ToggleButtonGroup>
              </Grid>
              {expenseScope === 'project' && (
              <Grid size={{ xs: 12 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Project</InputLabel>
                  <Select
                    label="Project"
                    value={expenseProjectId}
                    onChange={(e) => { const v = String(e.target.value); setExpenseProjectId(v === '' ? '' : v); }}
                  >
                    <MenuItem value="">— Select project —</MenuItem>
                    {allProjects.map((project) => (
                      <MenuItem key={project.id} value={String(project.id)}>
                        {project.project_name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              )}
              <Grid size={{ xs: 12 }}>
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
              <Grid size={{ xs: 12 }}>
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
              <Grid size={{ xs: 12 }}>
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
              <Grid size={{ xs: 12 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select
                    label="Category"
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                  >
                    <MenuItem value="">— Select category —</MenuItem>
                    {(expenseScope === 'overhead' ? OVERHEAD_CATEGORIES : PROJECT_EXPENSE_CATEGORIES).map((cat) => (
                      <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: expenseFundingType === 'investor_outofpocket' ? 6 : 12 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Paid From</InputLabel>
                  <Select
                    label="Paid From"
                    value={expenseFundingType}
                    onChange={(e) => { setExpenseFundingType(e.target.value as 'corporate_bank' | 'investor_outofpocket'); if (e.target.value !== 'investor_outofpocket') setExpenseFundingInvestor(''); }}
                  >
                    <MenuItem value="corporate_bank">Corporate Bank Account</MenuItem>
                    <MenuItem value="investor_outofpocket">Investor (Out-of-Pocket)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              {expenseFundingType === 'investor_outofpocket' && (
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Investor</InputLabel>
                    <Select label="Investor" value={expenseFundingInvestor} onChange={(e) => handleExpenseInvestorChange(e.target.value)}>
                      <MenuItem value="">— Select investor —</MenuItem>
                      {INVESTORS.map((inv) => <MenuItem key={inv} value={inv}>{inv}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              )}
              {expenseFundingType === 'investor_outofpocket' && expenseFundingInvestor && expenseLinkedInvestments.length > 0 && (
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Link to Existing Investment (Optional)</InputLabel>
                    <Select label="Link to Existing Investment (Optional)" value={expenseLinkedInvestmentId} onChange={(e) => setExpenseLinkedInvestmentId(e.target.value)}>
                      <MenuItem value="">— New investment entry —</MenuItem>
                      {expenseLinkedInvestments.map((inv) => (
                        <MenuItem key={inv.id} value={inv.id}>
                          {inv.date} · {inv.category} · {inv.description || '—'} · {formatCurrency(inv.amount)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}
              <Grid size={{ xs: 12 }}>
                <Accordion variant="outlined" disableGutters sx={{ mt: 1 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="body2" color="text.secondary">BIR Substantiation Details (Optional)</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12 }}>
                        <TextField fullWidth size="small" label="Supplier / Vendor Name" value={expenseSupplier} onChange={(e) => setExpenseSupplier(e.target.value)} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth size="small" label="Supplier TIN" placeholder="000-000-000-00000" value={expenseTin} onChange={(e) => setExpenseTin(e.target.value)} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Document Type</InputLabel>
                          <Select label="Document Type" value={expenseInvoiceType} onChange={(e) => setExpenseInvoiceType(e.target.value)}>
                            <MenuItem value="">— None —</MenuItem>
                            {INVOICE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth size="small" label="Invoice / OR Number" value={expenseInvoiceNo} onChange={(e) => setExpenseInvoiceNo(e.target.value)} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth size="small" label="Input VAT (supplier)" type="number" value={expenseVat} onChange={(e) => setExpenseVat(e.target.value)} inputProps={{ min: 0, step: 0.01 }} />
                      </Grid>
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              color="primary"
              startIcon={isScanning ? <CircularProgress size={18} /> : <PhotoCameraIcon />}
              onClick={() => scanInputRef.current?.click()}
              disabled={isScanning}
            >
              Scan One
            </Button>
            <Button
              size="small"
              color="primary"
              startIcon={<PhotoLibraryIcon />}
              onClick={() => setScanBatchOpen(true)}
            >
              Scan Multiple
            </Button>
          </Box>
          <Box>
            <Button onClick={() => setAddExpenseOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleAddExpense}
              disabled={isScanning || savingExpense}
              sx={{ ml: 1, backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
            >
              Add Expense
            </Button>
          </Box>
        </DialogActions>
        <input
          type="file"
          ref={scanInputRef}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleScanInputChange}
        />
      </Dialog>

      {/* Crop step between photo pick and AI parse (auto-detected corners, adjustable) */}
      <Dialog open={!!editUrl} onClose={() => {}} maxWidth="xs" fullWidth>
        <DialogTitle>Adjust Receipt Crop</DialogTitle>
        <DialogContent>
          {editUrl && editQuad && (
            <ReceiptCropper imageUrl={editUrl} initialQuad={editQuad} busy={isScanning} onConfirm={confirmScanCrop} onRetake={retakeScan} />
          )}
        </DialogContent>
      </Dialog>

      {/* Multi-upload: pick several receipt photos, crop/parse each, save all at once.
          Each receipt gets its own Project picker in review, so one batch can mix
          receipts from different projects — it defaults to whatever project (if any)
          is already selected in the Add Expense dialog above. */}
      <Dialog open={scanBatchOpen} onClose={() => setScanBatchOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Scan Multiple Receipts</DialogTitle>
        <DialogContent>
          {scanBatchOpen && (() => {
            const project = allProjects.find((p) => String(p.id) === expenseProjectId);
            const scanProjects = allProjects.map((p) => ({ id: String(p.id), project_no: p.project_no || String(p.id), project_name: p.project_name, account_name: p.account_name }));
            return (
              <ScanBatch
                mode="project"
                selectedProject={project ? { id: String(project.id), project_no: project.project_no || String(project.id), project_name: project.project_name, account_name: project.account_name } : null}
                projects={scanProjects}
                categories={PROJECT_EXPENSE_CATEGORIES}
                onCancel={() => setScanBatchOpen(false)}
                onComplete={(n) => {
                  setScanBatchOpen(false);
                  setAddExpenseOpen(false);
                  setScanSnackbar({ open: true, severity: 'success', message: `Saved ${n} receipt${n === 1 ? '' : 's'}.` });
                  fetchExpenses();
                }}
              />
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Superadmin: promote a manual/scanned expense to an employee's liquidation claim */}
      <Dialog open={!!promoteExpense} onClose={() => setPromoteExpense(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Promote to Liquidation</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {promoteExpense && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {promoteExpense.description || promoteExpense.category} — {formatCurrency(promoteExpense.amount)} on {promoteExpense.date}.
                This will remove it from Expense Monitoring and create a submitted liquidation for the employee below.
              </Typography>
            )}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Employee</InputLabel>
                  <Select label="Employee" value={promoteUserId} onChange={(e) => handlePromoteUserChange(e.target.value)}>
                    <MenuItem value="">— Select employee —</MenuItem>
                    {promoteUsers.map((u) => (
                      <MenuItem key={u.id} value={String(u.id)}>{u.full_name || u.username}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControl fullWidth size="small" disabled={!promoteUserId}>
                  <InputLabel>Cash Advance</InputLabel>
                  <Select label="Cash Advance" value={promoteCaId} onChange={(e) => setPromoteCaId(e.target.value)}>
                    <MenuItem value="">Standalone (Out-of-Pocket reimbursement)</MenuItem>
                    {promoteCAs.map((ca) => (
                      <MenuItem key={ca.id} value={ca.id}>{ca.ca_no} — balance {formatCurrency(ca.balance_remaining)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              {promoteError && (
                <Grid size={{ xs: 12 }}>
                  <Typography variant="caption" color="error">{promoteError}</Typography>
                </Grid>
              )}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPromoteExpense(null)} disabled={promoting}>Cancel</Button>
          <Button variant="contained" onClick={handlePromote} disabled={promoting || !promoteUserId}>
            {promoting ? 'Promoting…' : 'Promote'}
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
              {expensesForProject(String(expensesDialogProject.id)).length === 0 ? (
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
                      {expensesForProject(String(expensesDialogProject.id)).map((e) => (
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
                setExpenseScope('project');
                setExpenseProjectId(String(expensesDialogProject.id));
                setExpenseAmount('');
                setExpenseDate(new Date().toISOString().slice(0, 10));
                setExpenseDescription('');
                setExpenseCategory('');
                setExpenseSupplier('');
                setExpenseInvoiceNo('');
                setExpenseInvoiceType('');
                setExpenseVat('');
                setExpenseTin('');
                setAddExpenseOpen(true);
                setExpensesDialogProject(null);
              }}
            >
              Add expense
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Edit an existing expense row (scope-aware PATCH) */}
      <Dialog open={!!editExpense} onClose={() => !savingEdit && setEditExpense(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edit {editExpense?.scope === 'overhead' ? 'Overhead' : 'Project'} Expense
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Amount" type="number" value={editFields.amount}
                  onChange={(e) => setEditFields((f) => ({ ...f, amount: e.target.value }))} inputProps={{ min: 0, step: 0.01 }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Date" type="date" value={editFields.date}
                  onChange={(e) => setEditFields((f) => ({ ...f, date: e.target.value }))} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth size="small" label="Description" value={editFields.description}
                  onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} multiline rows={2} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select label="Category" value={editFields.category} onChange={(e) => setEditFields((f) => ({ ...f, category: e.target.value }))}>
                    <MenuItem value="">— Select category —</MenuItem>
                    {(editExpense?.scope === 'overhead' ? OVERHEAD_CATEGORIES : PROJECT_EXPENSE_CATEGORIES).map((cat) => (
                      <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                    ))}
                    {/* Keep a legacy/free-text category selectable so opening the dialog doesn't silently drop it */}
                    {editFields.category && !((editExpense?.scope === 'overhead' ? OVERHEAD_CATEGORIES : PROJECT_EXPENSE_CATEGORIES) as readonly string[]).includes(editFields.category) && (
                      <MenuItem value={editFields.category}>{editFields.category}</MenuItem>
                    )}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Accordion variant="outlined" disableGutters sx={{ mt: 1 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="body2" color="text.secondary">BIR Substantiation Details (Optional)</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12 }}>
                        <TextField fullWidth size="small" label="Supplier / Vendor Name" value={editFields.supplier}
                          onChange={(e) => setEditFields((f) => ({ ...f, supplier: e.target.value }))} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth size="small" label="Supplier TIN" placeholder="000-000-000-00000" value={editFields.tin}
                          onChange={(e) => setEditFields((f) => ({ ...f, tin: e.target.value }))} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Document Type</InputLabel>
                          <Select label="Document Type" value={editFields.invoiceType} onChange={(e) => setEditFields((f) => ({ ...f, invoiceType: e.target.value }))}>
                            <MenuItem value="">— None —</MenuItem>
                            {INVOICE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth size="small" label="Invoice / OR Number" value={editFields.invoiceNo}
                          onChange={(e) => setEditFields((f) => ({ ...f, invoiceNo: e.target.value }))} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth size="small" label="Input VAT (supplier)" type="number" value={editFields.vat}
                          onChange={(e) => setEditFields((f) => ({ ...f, vat: e.target.value }))} inputProps={{ min: 0, step: 0.01 }} />
                      </Grid>
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              </Grid>
              {editError && (
                <Grid size={{ xs: 12 }}>
                  <Typography variant="caption" color="error">{editError}</Typography>
                </Grid>
              )}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditExpense(null)} disabled={savingEdit}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={savingEdit}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}>
            {savingEdit ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Move a row between overhead and a project (server-side copy + delete) */}
      <Dialog open={!!moveExpense} onClose={() => !moving && setMoveExpense(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {moveExpense?.scope === 'overhead' ? 'Move to Project Expenses' : 'Move to Overhead Expenses'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {moveExpense && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {moveExpense.description || moveExpense.category} — {formatCurrency(moveExpense.amount)} on {moveExpense.date}.
                {moveExpense.scope === 'overhead'
                  ? ' This will file it under the selected project (COGS) instead of company overhead.'
                  : ' This will detach it from its project and file it as company overhead (OPEX).'}
              </Typography>
            )}
            <Grid container spacing={2}>
              {moveExpense?.scope === 'overhead' && (
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Project</InputLabel>
                    <Select label="Project" value={moveProjectId} onChange={(e) => setMoveProjectId(String(e.target.value))}>
                      <MenuItem value="">— Select project —</MenuItem>
                      {allProjects.map((p) => (
                        <MenuItem key={p.id} value={String(p.id)}>{p.project_name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}
              <Grid size={{ xs: 12 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category (target)</InputLabel>
                  <Select label="Category (target)" value={moveCategory} onChange={(e) => setMoveCategory(e.target.value)}>
                    <MenuItem value="">— Keep as "{moveExpense?.category || 'Others'}" —</MenuItem>
                    {(moveExpense?.scope === 'overhead' ? PROJECT_EXPENSE_CATEGORIES : OVERHEAD_CATEGORIES).map((cat) => (
                      <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              {moveError && (
                <Grid size={{ xs: 12 }}>
                  <Typography variant="caption" color="error">{moveError}</Typography>
                </Grid>
              )}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMoveExpense(null)} disabled={moving}>Cancel</Button>
          <Button variant="contained" onClick={handleMove} disabled={moving || (moveExpense?.scope === 'overhead' && !moveProjectId)}>
            {moving ? 'Moving…' : 'Move'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Floating draggable receipt viewer pane */}
      {viewer && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            top: `calc(15% + ${viewerPos.y}px)`,
            left: `calc(50% + ${viewerPos.x}px)`,
            transform: 'translateX(-50%)',
            zIndex: (theme) => theme.zIndex.modal + 1,
            width: 380,
            maxWidth: '92vw',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <Box
            onPointerDown={onViewerDragStart}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
              bgcolor: NET_PACIFIC_COLORS.primary, color: 'white',
              cursor: 'move', userSelect: 'none', touchAction: 'none',
            }}
          >
            <DragIndicatorIcon fontSize="small" sx={{ opacity: 0.7 }} />
            <Typography variant="subtitle2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {viewer.expense.description || viewer.expense.category} — {formatCurrency(viewer.expense.amount)}
            </Typography>
            <IconButton size="small" onClick={() => setViewer(null)} sx={{ color: 'white' }} title="Close">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ p: 1.5, maxHeight: '60vh', overflow: 'auto', textAlign: 'center', bgcolor: '#f8fafc' }}>
            {viewer.url ? (
              <Box component="img" src={viewer.url} alt="receipt" sx={{ maxWidth: '100%', borderRadius: 1 }} />
            ) : (
              <Box sx={{ py: 6 }}><CircularProgress size={28} /></Box>
            )}
          </Box>
          {viewer.expense.receiptRef?.webUrl && (
            <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
              <Link href={viewer.expense.receiptRef.webUrl} target="_blank" rel="noopener" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <OpenInNewIcon fontSize="inherit" /> Open in OneDrive
              </Link>
            </Box>
          )}
        </Paper>
      )}

      {/* Hidden picker for attach-receipt-later on existing table rows */}
      <input
        type="file"
        ref={attachReceiptInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleAttachReceiptInputChange}
      />

      <Snackbar
        open={scanSnackbar.open}
        autoHideDuration={5000}
        onClose={() => setScanSnackbar((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setScanSnackbar((p) => ({ ...p, open: false }))}
          severity={scanSnackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {scanSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ExpenseMonitoring;
