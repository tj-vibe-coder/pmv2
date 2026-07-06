import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  Grid,
  Divider,
  Button,
  IconButton,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Alert,
  Chip,
  Tooltip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  LinearProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Folder as FolderIcon,
  Link as LinkIcon,
  OpenInNew as OpenInNewIcon,
  Cloud as CloudIcon,
  CloudOff as CloudOffIcon,
  Receipt as ReceiptIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import { Project } from '../types/Project';
import type { ProjectInvoice, BillingMilestone, BillToKind } from '../types/Invoice';
import { getInvoiceStatus, computeDueDate, PAYMENT_TERMS_OPTIONS, BILL_TO_OPTIONS } from '../types/Invoice';
import dataService from '../services/dataService';
import EditProjectDialog from './EditProjectDialog';
import UpdateProgressDialog from './UpdateProgressDialog';
import { getBudget, setBudget } from '../utils/projectBudgetStorage';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Bar, Cell, Tooltip as RechartsTooltip } from 'recharts';
import { ORDER_TRACKER_STORAGE_KEY } from './OrderTrackerPage';
import { useOneDriveAuth } from '../contexts/OneDriveAuthContext';
import { isCorporateOneDriveConfigured } from '../config/onedriveConfig';
import { ensureExecutionFolder, resolveSharingUrl } from '../services/onedriveFolderService';

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

export function deleteProgressSnapshotAt(projectId: number, index: number): void {
  try {
    const raw = localStorage.getItem(PROJECT_PROGRESS_SNAPSHOTS_KEY);
    const o: Record<string, ProgressSnapshot[]> = raw ? JSON.parse(raw) : {};
    const list = o[String(projectId)] || [];
    if (index >= 0 && index < list.length) {
      list.splice(index, 1);
      if (list.length > 0) o[String(projectId)] = list;
      else delete o[String(projectId)];
      localStorage.setItem(PROJECT_PROGRESS_SNAPSHOTS_KEY, JSON.stringify(o));
    }
  } catch (_) {}
}

export interface ServiceReportActivityRow {
  activity: string;
  findingOutcome: string;
}

export interface ServiceReportPhoto {
  id: string;           // OneDrive item ID
  filename: string;
  webUrl: string;
  uploadedAt: string;
  activityIndex?: number; // undefined = general; number = linked to that activity row
  thumbnailDataUrl?: string; // small JPEG data URL stored at upload time for offline display
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
  photos?: ServiceReportPhoto[];
  approverName?: string;
  approverDesignation?: string;
  approverCompany?: string;
  /** Per-report "Prepared by" override (e.g. a third-party engineer who went onsite). */
  preparedByName?: string;
  preparedByDesignation?: string;
  preparedByCompany?: string;
  createdAt: string;
}

function srAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('netpacific_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Normalize a raw Firestore-returned doc (snake_case created_at) to ServiceReport shape.
function normalizeServiceReport(raw: Record<string, unknown>): ServiceReport {
  return {
    ...(raw as unknown as ServiceReport),
    createdAt: (raw.createdAt as string) ?? (raw.created_at as string) ?? '',
  };
}

export async function getServiceReports(projectId: number): Promise<ServiceReport[]> {
  const res = await fetch(`/api/service-reports?project_id=${projectId}`, {
    headers: srAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch service reports');
  const raw: Record<string, unknown>[] = await res.json();
  return raw.map(normalizeServiceReport);
}

export async function saveServiceReport(
  projectId: number,
  report: Omit<ServiceReport, 'id' | 'createdAt'>,
): Promise<ServiceReport> {
  const res = await fetch('/api/service-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...srAuthHeaders() },
    body: JSON.stringify({ ...report, project_id: String(projectId) }),
  });
  if (!res.ok) throw new Error('Failed to save service report');
  return normalizeServiceReport(await res.json());
}

export async function updateServiceReport(
  id: string,
  report: Omit<ServiceReport, 'id' | 'createdAt'>,
): Promise<void> {
  const res = await fetch(`/api/service-reports/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...srAuthHeaders() },
    body: JSON.stringify(report),
  });
  if (!res.ok) throw new Error('Failed to update service report');
}

export async function deleteServiceReport(id: string): Promise<void> {
  const res = await fetch(`/api/service-reports/${id}`, {
    method: 'DELETE',
    headers: srAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete service report');
}

export async function clearServiceReports(projectId: number): Promise<void> {
  const reports = await getServiceReports(projectId);
  await Promise.all(reports.map(r => deleteServiceReport(r.id)));
}

// One-time migration: moves any service reports still in localStorage to Firestore.
// Each successfully-migrated report is removed from localStorage immediately so that
// a partial failure on retry never creates duplicates in Firestore.
const SR_MIGRATION_KEY = 'sr_migrated_v1';
export async function migrateServiceReportsFromLocalStorage(): Promise<void> {
  if (localStorage.getItem(SR_MIGRATION_KEY)) return;
  const raw = localStorage.getItem(PROJECT_SERVICE_REPORTS_KEY);
  if (!raw) { localStorage.setItem(SR_MIGRATION_KEY, '1'); return; }
  let all: Record<string, ServiceReport[]>;
  try { all = JSON.parse(raw); } catch { localStorage.setItem(SR_MIGRATION_KEY, '1'); return; }

  const token = localStorage.getItem('netpacific_token') || '';
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let anyFailed = false;

  for (const [projectId, reports] of Object.entries(all)) {
    // oldest-first so Firestore orderBy(created_at desc) returns newest-first after migration
    const inOrder = [...reports].reverse();
    const remaining: ServiceReport[] = [];
    for (const report of inOrder) {
      try {
        const res = await fetch('/api/service-reports', {
          method: 'POST',
          headers,
          // Preserve original timestamp under the server's expected field name (snake_case)
          body: JSON.stringify({ ...report, project_id: projectId, created_at: report.createdAt }),
        });
        if (!res.ok) { remaining.push(report); anyFailed = true; }
      } catch { remaining.push(report); anyFailed = true; }
    }
    // Persist only the un-migrated remainder so retries don't re-post successes
    if (remaining.length > 0) {
      all[projectId] = remaining;
    } else {
      delete all[projectId];
    }
    const leftover = Object.keys(all);
    if (leftover.length === 0) localStorage.removeItem(PROJECT_SERVICE_REPORTS_KEY);
    else localStorage.setItem(PROJECT_SERVICE_REPORTS_KEY, JSON.stringify(all));
  }

  if (!anyFailed) localStorage.setItem(SR_MIGRATION_KEY, '1');
}

// ─── Progress reports (saved WBS snapshots) — Firestore-backed ────────────────
export interface StoredProgressReport {
  id: string;
  date: string;
  pbNumber: string;
  wbsItems: WBSItem[];
  overallProgress: number;
  createdAt: string;
}

function normalizeProgressReport(raw: Record<string, unknown>): StoredProgressReport {
  return {
    id: (raw.id as string) ?? '',
    date: (raw.date as string) ?? '',
    pbNumber: (raw.pbNumber as string) ?? '—',
    wbsItems: ((raw.wbsItems as WBSItem[]) || []).map((i) => ({
      ...i,
      weight: parseWBSNum(i.weight),
      progress: parseWBSNum(i.progress),
    })),
    overallProgress: typeof raw.overallProgress === 'number'
      ? (raw.overallProgress as number)
      : Number(raw.overallProgress) || 0,
    createdAt: (raw.createdAt as string) ?? (raw.created_at as string) ?? '',
  };
}

export async function getProgressReports(projectId: number): Promise<StoredProgressReport[]> {
  const res = await fetch(`/api/progress-reports?project_id=${projectId}`, { headers: srAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch progress reports');
  const raw: Record<string, unknown>[] = await res.json();
  return raw.map(normalizeProgressReport);
}

export async function saveProgressReport(projectId: number, snapshot: ProgressSnapshot): Promise<StoredProgressReport> {
  const res = await fetch('/api/progress-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...srAuthHeaders() },
    body: JSON.stringify({ ...snapshot, project_id: String(projectId) }),
  });
  if (!res.ok) throw new Error('Failed to save progress report');
  return normalizeProgressReport(await res.json());
}

export async function updateProgressReport(id: string, snapshot: ProgressSnapshot): Promise<void> {
  const res = await fetch(`/api/progress-reports/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...srAuthHeaders() },
    body: JSON.stringify(snapshot),
  });
  if (!res.ok) throw new Error('Failed to update progress report');
}

export async function deleteProgressReport(id: string): Promise<void> {
  const res = await fetch(`/api/progress-reports/${id}`, { method: 'DELETE', headers: srAuthHeaders() });
  if (!res.ok) throw new Error('Failed to delete progress report');
}

// One-time migration: moves any progress snapshots still in localStorage to Firestore.
// Each successfully-migrated snapshot is removed from localStorage so a partial-failure
// retry never duplicates. created_at is preserved from the snapshot's own date.
const PR_MIGRATION_KEY = 'pr_migrated_v1';
export async function migrateProgressSnapshotsFromLocalStorage(): Promise<void> {
  if (localStorage.getItem(PR_MIGRATION_KEY)) return;
  const raw = localStorage.getItem(PROJECT_PROGRESS_SNAPSHOTS_KEY);
  if (!raw) { localStorage.setItem(PR_MIGRATION_KEY, '1'); return; }
  let all: Record<string, ProgressSnapshot[]>;
  try { all = JSON.parse(raw); } catch { localStorage.setItem(PR_MIGRATION_KEY, '1'); return; }

  const token = localStorage.getItem('netpacific_token') || '';
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let anyFailed = false;

  for (const [projectId, snaps] of Object.entries(all)) {
    // localStorage stores newest-first (unshift); reverse → oldest-first
    const inOrder = [...snaps].reverse();
    const remaining: ProgressSnapshot[] = [];
    for (const snap of inOrder) {
      try {
        const res = await fetch('/api/progress-reports', {
          method: 'POST',
          headers,
          // Preserve original timestamp under the server's expected field name
          body: JSON.stringify({ ...snap, project_id: projectId, created_at: snap.date }),
        });
        if (!res.ok) { remaining.push(snap); anyFailed = true; }
      } catch { remaining.push(snap); anyFailed = true; }
    }
    if (remaining.length > 0) all[projectId] = remaining; else delete all[projectId];
    const leftover = Object.keys(all);
    if (leftover.length === 0) localStorage.removeItem(PROJECT_PROGRESS_SNAPSHOTS_KEY);
    else localStorage.setItem(PROJECT_PROGRESS_SNAPSHOTS_KEY, JSON.stringify(all));
  }

  if (!anyFailed) localStorage.setItem(PR_MIGRATION_KEY, '1');
}

// ─── Completion certificates — Firestore-backed ──────────────────────────────
export interface CompletionCertificate {
  id: string;
  projectName: string;
  poNumber: string;
  client: string;
  completionDate: string;
  approverName?: string;
  approverDesignation?: string;
  approverCompany?: string;
  preparedByName?: string;
  preparedByDesignation?: string;
  reportCompany: string;   // 'IOCT' | 'ACT'
  companyName: string;     // resolved company display name at save time
  createdAt: string;
}

function normalizeCompletionCertificate(raw: Record<string, unknown>): CompletionCertificate {
  return {
    ...(raw as unknown as CompletionCertificate),
    createdAt: (raw.createdAt as string) ?? (raw.created_at as string) ?? '',
  };
}

export async function getCompletionCertificates(projectId: number): Promise<CompletionCertificate[]> {
  const res = await fetch(`/api/completion-certificates?project_id=${projectId}`, { headers: srAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch completion certificates');
  const raw: Record<string, unknown>[] = await res.json();
  return raw.map(normalizeCompletionCertificate);
}

export async function saveCompletionCertificate(
  projectId: number,
  cert: Omit<CompletionCertificate, 'id' | 'createdAt'>,
): Promise<CompletionCertificate> {
  const res = await fetch('/api/completion-certificates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...srAuthHeaders() },
    body: JSON.stringify({ ...cert, project_id: String(projectId) }),
  });
  if (!res.ok) throw new Error('Failed to save completion certificate');
  return normalizeCompletionCertificate(await res.json());
}

export async function updateCompletionCertificate(
  id: string,
  cert: Omit<CompletionCertificate, 'id' | 'createdAt'>,
): Promise<void> {
  const res = await fetch(`/api/completion-certificates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...srAuthHeaders() },
    body: JSON.stringify(cert),
  });
  if (!res.ok) throw new Error('Failed to update completion certificate');
}

export async function deleteCompletionCertificate(id: string): Promise<void> {
  const res = await fetch(`/api/completion-certificates/${id}`, { method: 'DELETE', headers: srAuthHeaders() });
  if (!res.ok) throw new Error('Failed to delete completion certificate');
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
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState(0);
  const [projectInvoices, setProjectInvoices] = useState<ProjectInvoice[]>([]);
  const navigate = useNavigate();

  // Billing schedule state
  const [scheduleEditMode, setScheduleEditMode] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<BillingMilestone[]>([]);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleErr, setScheduleErr] = useState('');
  // Auto-generate schedule from payment terms (DP % + number of progress draws)
  const [genDpPct, setGenDpPct] = useState<number>(() => Math.round((project.down_payment_percent || 0) * (project.down_payment_percent <= 1 ? 100 : 1)));
  const [genDraws, setGenDraws] = useState<number>(2);

  // Invoice creation from milestone
  const [createInvoiceForMilestone, setCreateInvoiceForMilestone] = useState<BillingMilestone | null>(null);
  const [milestoneInvoiceForm, setMilestoneInvoiceForm] = useState({ invoice_no: '', invoice_date: '', amount: '', payment_terms_days: 30, notes: '', bill_to: 'customer' as BillToKind });
  const [milestoneInvoiceErr, setMilestoneInvoiceErr] = useState('');
  const [milestoneInvoiceSaving, setMilestoneInvoiceSaving] = useState(false);
  const { isAuthenticated: oneDriveSignedIn, login: oneDriveLogin, getAccessToken: getOneDriveToken } = useOneDriveAuth();
  const [oneDriveBusy, setOneDriveBusy] = useState(false);
  const [oneDriveErr, setOneDriveErr] = useState('');
  const [oneDriveInfo, setOneDriveInfo] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const executionFolderProject = useMemo(() => ({
    code: project.project_no || project.calcsheet_code || project.qtn_no || project.ovp_number || String(project.id),
    name: project.project_no ? '' : (project.project_name || String(project.id)),
  }), [project.calcsheet_code, project.id, project.ovp_number, project.project_name, project.project_no, project.qtn_no]);

  const saveExecutionFolderLink = async (ref: { id: string; webUrl: string }) => {
    const patch = { executionFolderId: ref.id, executionFolderUrl: ref.webUrl };
    const result = await dataService.updateProject(project.id, patch);
    if (!result.success) throw new Error(result.error || 'Failed to save OneDrive link');
    onProjectUpdated?.({ ...project, ...patch });
  };

  const createOrLinkExecutionFolder = async () => {
    setOneDriveBusy(true);
    setOneDriveErr('');
    setOneDriveInfo('');
    try {
      const token = await getOneDriveToken();
      if (!token) {
        setOneDriveErr('Sign in to OneDrive first.');
        return;
      }
      const ref = await ensureExecutionFolder(token, executionFolderProject);
      await saveExecutionFolderLink(ref);
      setOneDriveInfo(ref.matchedExisting ? `Linked existing folder: "${ref.folderName}"` : 'Execution folder linked.');
    } catch (e) {
      setOneDriveErr(e instanceof Error ? e.message : 'Failed to link execution folder');
    } finally {
      setOneDriveBusy(false);
    }
  };

  const submitExecutionFolderUrl = async () => {
    setOneDriveBusy(true);
    setOneDriveErr('');
    setOneDriveInfo('');
    try {
      const token = await getOneDriveToken();
      if (!token) {
        setOneDriveErr('Sign in to OneDrive first.');
        return;
      }
      const ref = await resolveSharingUrl(token, linkUrl);
      if (!ref.isFolder) {
        setOneDriveErr('That URL points to a file, not a folder.');
        return;
      }
      await saveExecutionFolderLink(ref);
      setLinkDialogOpen(false);
      setLinkUrl('');
      setOneDriveInfo('Execution folder linked.');
    } catch (e) {
      setOneDriveErr(e instanceof Error ? e.message : 'Failed to link execution folder');
    } finally {
      setOneDriveBusy(false);
    }
  };

  useEffect(() => {
    setBudgetAmount(getBudget(project.id));
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invoices?project_id=${encodeURIComponent(String(project.id))}`)
      .then(r => r.json())
      .then((invs: ProjectInvoice[]) => {
        if (!cancelled) setProjectInvoices(Array.isArray(invs) ? invs : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [project.id]);

  const arSummary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const totalInvoiced = projectInvoices.reduce((s, i) => s + i.amount, 0);
    const totalCollected = projectInvoices.reduce((s, i) => s + (i.amount_collected || 0), 0);
    const outstanding = projectInvoices.filter(i => (i.amount - (i.amount_collected || 0)) > 0)
      .reduce((s, i) => s + Math.max(0, i.amount - (i.amount_collected || 0)), 0);
    const overdueList = projectInvoices.filter(i => {
      const rem = i.amount - (i.amount_collected || 0);
      return rem > 0 && i.due_date && i.due_date < today;
    });
    return { totalInvoiced, totalCollected, outstanding, overdueCount: overdueList.length, overdueAmount: overdueList.reduce((s, i) => s + Math.max(0, i.amount - (i.amount_collected || 0)), 0) };
  }, [projectInvoices]);

  // Map pb_number → invoice for milestone matching
  const milestoneInvoiceMap = useMemo(() => {
    const map: Record<string, ProjectInvoice> = {};
    projectInvoices.forEach(inv => { if (inv.pb_number) map[inv.pb_number] = inv; });
    return map;
  }, [projectInvoices]);

  // Billing schedule handlers
  const openScheduleEdit = () => {
    setEditingSchedule(project.billing_schedule ? project.billing_schedule.map(m => ({ ...m })) : []);
    setScheduleErr('');
    setScheduleEditMode(true);
  };

  const applyTemplate = (template: '100' | '50+100' | '30+50+100') => {
    const now = Date.now();
    if (template === '100') {
      setEditingSchedule([{ id: `ms-${now}`, label: 'Upon Completion', trigger_pct: 100, billing_pct: 100, pb_number: 'PB1' }]);
    } else if (template === '50+100') {
      setEditingSchedule([
        { id: `ms-${now}-1`, label: '50% Progress Billing', trigger_pct: 50, billing_pct: 50, pb_number: 'PB1' },
        { id: `ms-${now}-2`, label: 'Upon Completion', trigger_pct: 100, billing_pct: 50, pb_number: 'PB2' },
      ]);
    } else {
      setEditingSchedule([
        { id: `ms-${now}-1`, label: 'Downpayment', trigger_pct: 0, billing_pct: 30, pb_number: 'PB1' },
        { id: `ms-${now}-2`, label: '50% Progress Billing', trigger_pct: 50, billing_pct: 50, pb_number: 'PB2' },
        { id: `ms-${now}-3`, label: 'Upon Completion', trigger_pct: 100, billing_pct: 20, pb_number: 'PB3' },
      ]);
    }
  };

  // Auto-generate: DP at trigger 0 (billable on PO), then N progress draws splitting the
  // remaining contract %. Trigger thresholds are seeded as an even-spaced HINT — they're
  // meant to be edited manually, since billing depends on per-project customer approval.
  const autoGenerateSchedule = () => {
    const dp = Math.max(0, Math.min(100, Math.round(genDpPct)));
    const draws = Math.max(1, Math.min(12, Math.round(genDraws)));
    const now = Date.now();
    const rows: BillingMilestone[] = [];
    let pb = 1;
    if (dp > 0) {
      rows.push({ id: `ms-${now}-dp`, label: 'Downpayment', trigger_pct: 0, billing_pct: dp, pb_number: `PB${pb++}` });
    }
    const remaining = 100 - dp;
    const per = Math.floor((remaining / draws) * 100) / 100; // 2-dp even split
    let allocated = 0;
    for (let i = 1; i <= draws; i++) {
      const isLast = i === draws;
      const billing = isLast ? Math.round((remaining - allocated) * 100) / 100 : per;
      allocated += per;
      const triggerHint = Math.round((i / draws) * 100); // even-spaced hint, editable
      rows.push({
        id: `ms-${now}-${i}`,
        label: isLast ? 'Upon Completion' : `${triggerHint}% Progress Billing`,
        trigger_pct: triggerHint,
        billing_pct: billing,
        pb_number: `PB${pb++}`,
      });
    }
    setEditingSchedule(rows);
    setScheduleErr('');
  };

  const addMilestoneRow = () => {
    const n = editingSchedule.length + 1;
    setEditingSchedule(prev => [...prev, { id: `ms-${Date.now()}`, label: '', trigger_pct: 100, billing_pct: 0, pb_number: `PB${n}` }]);
  };

  // Distribute the remaining billing % so the schedule totals exactly 100%,
  // adding the difference to the last progress milestone (or last row).
  const balanceBillingToHundred = () => {
    setEditingSchedule(prev => {
      if (prev.length === 0) return prev;
      const sumExceptLast = prev.slice(0, -1).reduce((s, m) => s + (Number(m.billing_pct) || 0), 0);
      const lastBilling = Math.round((100 - sumExceptLast) * 100) / 100;
      return prev.map((m, i) => i === prev.length - 1 ? { ...m, billing_pct: Math.max(0, lastBilling) } : m);
    });
  };

  const updateMilestoneField = (id: string, field: keyof BillingMilestone, value: string | number) => {
    setEditingSchedule(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const removeMilestoneRow = (id: string) => {
    setEditingSchedule(prev => prev.filter(m => m.id !== id));
  };

  const saveSchedule = async () => {
    setScheduleSaving(true);
    setScheduleErr('');
    try {
      const result = await dataService.updateProject(project.id, { billing_schedule: editingSchedule });
      if (!result.success) throw new Error(result.error || 'Failed to save billing schedule');
      onProjectUpdated?.({ ...project, billing_schedule: editingSchedule });
      setScheduleEditMode(false);
    } catch (e) {
      setScheduleErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setScheduleSaving(false);
    }
  };

  // Invoice creation from milestone
  const openCreateInvoice = (milestone: BillingMilestone) => {
    const contract = project.updated_contract_amount || project.contract_amount || 0;
    const suggestedAmount = contract > 0 ? Math.round((milestone.billing_pct / 100) * contract * 100) / 100 : 0;
    const today = new Date().toISOString().slice(0, 10);
    // Completion milestones (trigger ≥ 100%) and downpayment milestones (trigger = 0%)
    // are payable upon receipt of invoice — no credit period applies.
    const defaultTermsDays = milestone.trigger_pct >= 100 || milestone.trigger_pct === 0 ? 0 : 30;
    setMilestoneInvoiceForm({
      invoice_no: '',
      invoice_date: today,
      amount: suggestedAmount > 0 ? String(suggestedAmount) : '',
      payment_terms_days: defaultTermsDays,
      notes: `${milestone.label} — ${milestone.pb_number}`,
      bill_to: project.with_acti ? 'acti' : 'customer',
    });
    setMilestoneInvoiceErr('');
    setCreateInvoiceForMilestone(milestone);
  };

  const saveMilestoneInvoice = async () => {
    if (!createInvoiceForMilestone) return;
    if (!milestoneInvoiceForm.invoice_no.trim()) { setMilestoneInvoiceErr('Invoice number is required.'); return; }
    const amount = parseFloat(milestoneInvoiceForm.amount);
    if (!amount || amount <= 0) { setMilestoneInvoiceErr('Enter a valid amount.'); return; }
    setMilestoneInvoiceSaving(true);
    setMilestoneInvoiceErr('');
    try {
      const dueDate = computeDueDate(milestoneInvoiceForm.invoice_date, milestoneInvoiceForm.payment_terms_days);
      const body: Partial<ProjectInvoice> = {
        project_id: String(project.id),
        project_name: project.project_name,
        project_no: project.project_no || '',
        invoice_no: milestoneInvoiceForm.invoice_no.trim(),
        invoice_date: milestoneInvoiceForm.invoice_date,
        amount,
        payment_terms_days: milestoneInvoiceForm.payment_terms_days,
        due_date: dueDate,
        amount_collected: 0,
        notes: milestoneInvoiceForm.notes.trim() || undefined,
        pb_number: createInvoiceForMilestone.pb_number,
        bill_to: milestoneInvoiceForm.bill_to,
        bill_to_name: milestoneInvoiceForm.bill_to === 'acti'
          ? (project.partner_name || 'Advance Controle Technologie Inc')
          : (project.account_name || ''),
      };
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || res.statusText);
      }
      const created: ProjectInvoice = await res.json();
      setProjectInvoices(prev => [...prev, created]);
      setCreateInvoiceForMilestone(null);
    } catch (e) {
      setMilestoneInvoiceErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setMilestoneInvoiceSaving(false);
    }
  };

  const handleBudgetChange = (value: number) => {
    setBudgetAmount(value);
    setBudget(project.id, value);
  };

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
        {isCorporateOneDriveConfigured() && (
          <Stack direction="row" spacing={1} alignItems="center">
            {!oneDriveSignedIn ? (
              <Button
                variant="outlined"
                size="small"
                startIcon={<CloudOffIcon />}
                onClick={() => { void oneDriveLogin(); }}
              >
                Sign in
              </Button>
            ) : project.executionFolderUrl ? (
              <Button
                variant="outlined"
                size="small"
                color="success"
                startIcon={<FolderIcon />}
                endIcon={<OpenInNewIcon />}
                onClick={() => window.open(project.executionFolderUrl, '_blank', 'noopener')}
              >
                Execution Folder
              </Button>
            ) : (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  color="success"
                  startIcon={<CloudIcon />}
                  disabled={oneDriveBusy}
                  onClick={() => { void createOrLinkExecutionFolder(); }}
                >
                  {oneDriveBusy ? 'Linking...' : 'Link OneDrive'}
                </Button>
                <Button
                  variant="text"
                  size="small"
                  startIcon={<LinkIcon />}
                  disabled={oneDriveBusy}
                  onClick={() => setLinkDialogOpen(true)}
                >
                  Link existing
                </Button>
              </>
            )}
          </Stack>
        )}
        <Button
          variant="contained"
          size="small"
          onClick={() => setProgressDialogOpen(true)}
          sx={{
            ml: 1,
            backgroundColor: NET_PACIFIC_COLORS.success,
            '&:hover': { backgroundColor: '#00a381' },
          }}
        >
          Update Progress
        </Button>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          sx={{ ml: 2 }}
          onClick={() => setEditDialogOpen(true)}
        >
          Edit Project
        </Button>
      </Box>

      {(oneDriveErr || oneDriveInfo) && (
        <Alert severity={oneDriveErr ? 'error' : 'success'} sx={{ mb: 2 }} onClose={() => { setOneDriveErr(''); setOneDriveInfo(''); }}>
          {oneDriveErr || oneDriveInfo}
        </Alert>
      )}

      <Dialog open={linkDialogOpen} onClose={() => !oneDriveBusy && setLinkDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Link execution folder</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Paste the OneDrive execution folder URL for this project.
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="OneDrive folder URL"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              disabled={oneDriveBusy}
              error={!!oneDriveErr}
              helperText={oneDriveErr || ' '}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)} disabled={oneDriveBusy}>Cancel</Button>
          <Button variant="contained" onClick={() => { void submitExecutionFolderUrl(); }} disabled={oneDriveBusy || !linkUrl.trim()}>
            {oneDriveBusy ? 'Linking...' : 'Link Folder'}
          </Button>
        </DialogActions>
      </Dialog>

      <EditProjectDialog
        open={editDialogOpen}
        project={project}
        onClose={() => setEditDialogOpen(false)}
        onSaved={(updated) => {
          onProjectUpdated?.(updated);
          setEditDialogOpen(false);
        }}
      />

      <UpdateProgressDialog
        open={progressDialogOpen}
        project={project}
        onClose={() => setProgressDialogOpen(false)}
        onSaved={(updated) => {
          onProjectUpdated?.(updated);
          setProgressDialogOpen(false);
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
                {dataService.formatCurrency(dataService.getUnbilled(project))}
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

          {/* Additional Details */}
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

      {/* Progress Billing Section */}
      {(() => {
        const schedule = project.billing_schedule || [];
        const currentProgress = project.actual_site_progress_percent ?? 0;
        const contract = project.updated_contract_amount || project.contract_amount || 0;
        const PHP_FMT = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });

        const INVOICE_STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
          paid: 'success', partial: 'warning', overdue: 'error', unpaid: 'default',
        };

        return (
          <Grid container spacing={3} sx={{ mb: 1 }}>
            <Grid size={{ xs: 12 }}>
              <Paper sx={{ p: 3 }}>
                {/* Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ReceiptIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />
                    <Typography variant="h6" sx={{ color: NET_PACIFIC_COLORS.primary, fontWeight: 600 }}>
                      Progress Billing
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    {!scheduleEditMode && (
                      <>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<EditIcon />}
                          onClick={openScheduleEdit}
                          sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
                        >
                          {schedule.length > 0 ? 'Edit Schedule' : 'Set Up Schedule'}
                        </Button>
                        {arSummary.totalInvoiced > 0 && (
                          <Tooltip title="View all invoices in Collections & AR">
                            <Button
                              size="small"
                              variant="text"
                              endIcon={<OpenInNewIcon fontSize="small" />}
                              onClick={() => navigate(`/finance/collections?project_id=${encodeURIComponent(String(project.id))}`)}
                              sx={{ color: 'text.secondary' }}
                            >
                              View in AR
                            </Button>
                          </Tooltip>
                        )}
                      </>
                    )}
                  </Stack>
                </Box>

                {/* KPI row */}
                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  {[
                    { label: 'Contract Amount', value: PHP_FMT.format(contract), color: NET_PACIFIC_COLORS.primary },
                    { label: 'Total Billed', value: PHP_FMT.format(arSummary.totalInvoiced), color: NET_PACIFIC_COLORS.accent1 },
                    { label: 'Collected', value: PHP_FMT.format(arSummary.totalCollected), color: NET_PACIFIC_COLORS.success },
                    { label: 'Outstanding', value: PHP_FMT.format(arSummary.outstanding), color: arSummary.outstanding > 0 ? '#f59e0b' : 'text.secondary' },
                  ].map(kpi => (
                    <Grid key={kpi.label} size={{ xs: 6, sm: 3 }}>
                      <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary">{kpi.label}</Typography>
                        <Typography variant="body1" fontWeight={700} sx={{ color: kpi.color }}>
                          {kpi.value}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>

                {/* Site progress vs Billing progress — the DP gap is expected: billing can lead site work */}
                {(() => {
                  const sitePct = Math.max(0, Math.min(100, currentProgress));
                  const billingPct = contract > 0 ? Math.max(0, Math.min(100, Math.round((arSummary.totalInvoiced / contract) * 1000) / 10)) : 0;
                  const rows = [
                    { label: 'Site Progress', pct: sitePct, color: NET_PACIFIC_COLORS.accent1, hint: 'physical completion' },
                    { label: 'Billing Progress', pct: billingPct, color: NET_PACIFIC_COLORS.primary, hint: '% of contract billed' },
                  ];
                  return (
                    <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      <Stack spacing={1}>
                        {rows.map(r => (
                          <Box key={r.label}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.25 }}>
                              <Typography variant="caption" color="text.secondary">
                                {r.label} <Typography component="span" variant="caption" color="text.disabled">· {r.hint}</Typography>
                              </Typography>
                              <Typography variant="caption" fontWeight={700} sx={{ color: r.color }}>{r.pct}%</Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={r.pct}
                              sx={{ height: 6, borderRadius: 3, bgcolor: 'grey.100', '& .MuiLinearProgress-bar': { backgroundColor: r.color } }}
                            />
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  );
                })()}

                {/* Schedule editor */}
                {scheduleEditMode && (
                  <Box sx={{ mb: 2 }}>
                    {scheduleErr && <Alert severity="error" sx={{ mb: 1.5 }}>{scheduleErr}</Alert>}

                    {/* Templates */}
                    <Box sx={{ mb: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Quick templates:</Typography>
                      <Stack direction="row" spacing={1} display="inline-flex" flexWrap="wrap" gap={0.5}>
                        {([
                          { key: '100', label: '100% on Completion' },
                          { key: '50+100', label: '50% + 100%' },
                          { key: '30+50+100', label: '30% DP + 50% + 100%' },
                        ] as const).map(t => (
                          <Chip
                            key={t.key}
                            label={t.label}
                            size="small"
                            variant="outlined"
                            clickable
                            onClick={() => applyTemplate(t.key)}
                            sx={{ fontSize: '0.7rem' }}
                          />
                        ))}
                      </Stack>
                    </Box>

                    {/* Auto-generate from payment terms */}
                    <Box sx={{ mb: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        Auto-generate from payment terms — splits the contract into a downpayment plus progress draws.
                        Trigger % is seeded as a hint; edit each row's trigger to match customer approval.
                      </Typography>
                      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <TextField
                          size="small"
                          type="number"
                          label="Downpayment"
                          value={genDpPct}
                          onChange={e => setGenDpPct(Number(e.target.value))}
                          inputProps={{ min: 0, max: 100, style: { fontSize: '0.8rem', width: 70 } }}
                          InputProps={{ endAdornment: <Typography variant="caption">%</Typography> }}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Progress draws"
                          value={genDraws}
                          onChange={e => setGenDraws(Number(e.target.value))}
                          inputProps={{ min: 1, max: 12, style: { fontSize: '0.8rem', width: 70 } }}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={autoGenerateSchedule}
                          sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
                        >
                          Generate
                        </Button>
                      </Stack>
                    </Box>

                    {/* Editable milestone rows */}
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ '& th': { fontWeight: 600, fontSize: '0.8rem' } }}>
                            <TableCell>PB #</TableCell>
                            <TableCell>Label</TableCell>
                            <TableCell align="right">Trigger %</TableCell>
                            <TableCell align="right">Billing %</TableCell>
                            <TableCell align="right">Amount</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {editingSchedule.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} sx={{ py: 2, color: 'text.secondary', fontSize: '0.8rem', textAlign: 'center' }}>
                                No milestones yet. Apply a template or click "+ Add Milestone".
                              </TableCell>
                            </TableRow>
                          )}
                          {editingSchedule.map(m => (
                            <TableRow key={m.id}>
                              <TableCell sx={{ width: 90 }}>
                                <TextField
                                  size="small"
                                  value={m.pb_number}
                                  onChange={e => updateMilestoneField(m.id, 'pb_number', e.target.value)}
                                  inputProps={{ style: { fontSize: '0.8rem' } }}
                                  sx={{ width: 80 }}
                                />
                              </TableCell>
                              <TableCell>
                                <TextField
                                  size="small"
                                  fullWidth
                                  value={m.label}
                                  onChange={e => updateMilestoneField(m.id, 'label', e.target.value)}
                                  placeholder="e.g. 50% Progress Billing"
                                  inputProps={{ style: { fontSize: '0.8rem' } }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ width: 110 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={m.trigger_pct}
                                  onChange={e => updateMilestoneField(m.id, 'trigger_pct', Number(e.target.value))}
                                  inputProps={{ min: 0, max: 100, style: { fontSize: '0.8rem', textAlign: 'right' } }}
                                  InputProps={{ endAdornment: <Typography variant="caption">%</Typography> }}
                                  sx={{ width: 100 }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ width: 110 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={m.billing_pct}
                                  onChange={e => updateMilestoneField(m.id, 'billing_pct', Number(e.target.value))}
                                  inputProps={{ min: 0, max: 100, style: { fontSize: '0.8rem', textAlign: 'right' } }}
                                  InputProps={{ endAdornment: <Typography variant="caption">%</Typography> }}
                                  sx={{ width: 100 }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ width: 130 }}>
                                <Typography variant="caption" color="text.secondary">
                                  {contract > 0 ? PHP_FMT.format((m.billing_pct / 100) * contract) : '—'}
                                </Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ width: 50 }}>
                                <IconButton size="small" color="error" onClick={() => removeMilestoneRow(m.id)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    {(() => {
                      const billingSum = Math.round(editingSchedule.reduce((s, m) => s + (Number(m.billing_pct) || 0), 0) * 100) / 100;
                      const balanced = billingSum === 100;
                      if (editingSchedule.length === 0) return null;
                      return (
                        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                          <Typography variant="caption" sx={{ color: balanced ? 'success.main' : 'warning.main', fontWeight: 600 }}>
                            Total billing: {billingSum}% {balanced ? '✓' : '(should be 100%)'}
                          </Typography>
                          {!balanced && (
                            <Button size="small" variant="text" onClick={balanceBillingToHundred} sx={{ fontSize: '0.7rem' }}>
                              Balance to 100%
                            </Button>
                          )}
                        </Box>
                      );
                    })()}

                    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                      <Button size="small" startIcon={<AddIcon />} variant="text" onClick={addMilestoneRow}>
                        Add Milestone
                      </Button>
                      <Box sx={{ flexGrow: 1 }} />
                      <Button size="small" onClick={() => setScheduleEditMode(false)} disabled={scheduleSaving}>
                        Cancel
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => { void saveSchedule(); }}
                        disabled={scheduleSaving}
                        sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
                      >
                        {scheduleSaving ? 'Saving…' : 'Save Schedule'}
                      </Button>
                    </Stack>
                  </Box>
                )}

                {/* Milestone table (read mode) */}
                {!scheduleEditMode && schedule.length > 0 && (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 600, fontSize: '0.8rem', backgroundColor: `${NET_PACIFIC_COLORS.primary}15` } }}>
                          <TableCell>PB #</TableCell>
                          <TableCell>Milestone</TableCell>
                          <TableCell align="right">Trigger</TableCell>
                          <TableCell align="right">Billing %</TableCell>
                          <TableCell align="right">Amount</TableCell>
                          <TableCell>Invoice</TableCell>
                          <TableCell align="right">Collected</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="center">Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {schedule.map(m => {
                          const milestoneAmount = contract > 0 ? (m.billing_pct / 100) * contract : 0;
                          const linkedInvoice = milestoneInvoiceMap[m.pb_number];
                          const isEligible = currentProgress >= m.trigger_pct;
                          const invoiceStatus = linkedInvoice ? getInvoiceStatus(linkedInvoice) : null;
                          return (
                            <TableRow
                              key={m.id}
                              sx={{
                                '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' },
                                ...(isEligible && !linkedInvoice ? { backgroundColor: '#fffbe6 !important' } : {}),
                              }}
                            >
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                                {m.pb_number}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{m.label || '—'}</TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem', color: isEligible ? 'success.main' : 'text.secondary' }}>
                                {m.trigger_pct === 0 ? 'Upon PO / DP' : `${m.trigger_pct}%`}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{m.billing_pct}%</TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                {milestoneAmount > 0 ? PHP_FMT.format(milestoneAmount) : '—'}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                {linkedInvoice ? (
                                  <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                    {linkedInvoice.invoice_no}
                                  </Typography>
                                ) : (
                                  <Typography variant="caption" color="text.disabled">—</Typography>
                                )}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: (linkedInvoice?.amount_collected ?? 0) > 0 ? 'success.main' : 'text.secondary' }}>
                                {linkedInvoice ? PHP_FMT.format(linkedInvoice.amount_collected || 0) : '—'}
                              </TableCell>
                              <TableCell>
                                {invoiceStatus ? (
                                  <Chip
                                    label={invoiceStatus.charAt(0).toUpperCase() + invoiceStatus.slice(1)}
                                    color={INVOICE_STATUS_COLORS[invoiceStatus]}
                                    size="small"
                                    variant="outlined"
                                  />
                                ) : isEligible ? (
                                  <Chip label="Eligible" size="small" color="warning" variant="outlined" />
                                ) : (
                                  <Chip label="Pending" size="small" variant="outlined" />
                                )}
                              </TableCell>
                              <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                                {/* Progress Report link — always available for each milestone */}
                                <Tooltip title={`Open Progress Report for ${m.pb_number}`}>
                                  <IconButton
                                    size="small"
                                    onClick={() => navigate(`/reports/progress?projectId=${encodeURIComponent(String(project.id))}&pb=${encodeURIComponent(m.pb_number)}`)}
                                    sx={{ color: NET_PACIFIC_COLORS.accent1 }}
                                  >
                                    <DescriptionIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                {linkedInvoice ? (
                                  <Tooltip title="View in Collections & AR">
                                    <IconButton
                                      size="small"
                                      onClick={() => navigate(`/finance/collections?project_id=${encodeURIComponent(String(project.id))}`)}
                                    >
                                      <OpenInNewIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                ) : isEligible ? (
                                  <Tooltip title={`Create invoice for ${m.pb_number}`}>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      startIcon={<AddIcon />}
                                      onClick={() => openCreateInvoice(m)}
                                      sx={{
                                        fontSize: '0.7rem',
                                        borderColor: NET_PACIFIC_COLORS.primary,
                                        color: NET_PACIFIC_COLORS.primary,
                                        py: 0.25,
                                      }}
                                    >
                                      Invoice
                                    </Button>
                                  </Tooltip>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {/* Certificate of Completion CTA — shown when 100% complete and all milestones are invoiced */}
                {!scheduleEditMode && schedule.length > 0 && currentProgress >= 100 && schedule.every(m => !!milestoneInvoiceMap[m.pb_number]) && (
                  <Box sx={{ mt: 2, p: 2, borderRadius: 1, bgcolor: '#f0fdf4', border: '1px solid', borderColor: 'success.300', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                    <Box>
                      <Typography variant="body2" fontWeight={600} color="success.dark">
                        All milestones invoiced — project complete!
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Generate a Certificate of Completion to formally close out this project.
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      endIcon={<OpenInNewIcon fontSize="small" />}
                      onClick={() => navigate(`/reports/completion?projectId=${encodeURIComponent(String(project.id))}`)}
                    >
                      Certificate of Completion
                    </Button>
                  </Box>
                )}

                {/* Empty state */}
                {!scheduleEditMode && schedule.length === 0 && (
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <ReceiptIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      No billing schedule set up for this project.
                    </Typography>
                    <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={openScheduleEdit}>
                      Set Up Billing Schedule
                    </Button>
                  </Box>
                )}
              </Paper>
            </Grid>
          </Grid>
        );
      })()}

      {/* Create Invoice from Milestone dialog */}
      <Dialog open={!!createInvoiceForMilestone} onClose={() => !milestoneInvoiceSaving && setCreateInvoiceForMilestone(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Create Invoice — {createInvoiceForMilestone?.pb_number}: {createInvoiceForMilestone?.label}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {milestoneInvoiceErr && <Alert severity="error">{milestoneInvoiceErr}</Alert>}
            <TextField
              label="Invoice No."
              size="small"
              fullWidth
              required
              value={milestoneInvoiceForm.invoice_no}
              onChange={e => setMilestoneInvoiceForm(prev => ({ ...prev, invoice_no: e.target.value }))}
              placeholder="e.g. SI-2026-001"
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Invoice Date"
                  type="date"
                  size="small"
                  fullWidth
                  value={milestoneInvoiceForm.invoice_date}
                  onChange={e => setMilestoneInvoiceForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Amount (PHP)"
                  type="number"
                  size="small"
                  fullWidth
                  required
                  value={milestoneInvoiceForm.amount}
                  onChange={e => setMilestoneInvoiceForm(prev => ({ ...prev, amount: e.target.value }))}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
            </Grid>
            <FormControl size="small" fullWidth>
              <InputLabel>Payment Terms</InputLabel>
              <Select
                label="Payment Terms"
                value={milestoneInvoiceForm.payment_terms_days}
                onChange={e => setMilestoneInvoiceForm(prev => ({ ...prev, payment_terms_days: Number(e.target.value) }))}
              >
                {PAYMENT_TERMS_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Bill To</InputLabel>
              <Select
                label="Bill To"
                value={milestoneInvoiceForm.bill_to}
                onChange={e => setMilestoneInvoiceForm(prev => ({ ...prev, bill_to: e.target.value as BillToKind }))}
              >
                {BILL_TO_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Notes (optional)"
              size="small"
              multiline
              rows={2}
              fullWidth
              value={milestoneInvoiceForm.notes}
              onChange={e => setMilestoneInvoiceForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateInvoiceForMilestone(null)} disabled={milestoneInvoiceSaving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => { void saveMilestoneInvoice(); }}
            disabled={milestoneInvoiceSaving}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {milestoneInvoiceSaving ? 'Creating…' : 'Create Invoice'}
          </Button>
        </DialogActions>
      </Dialog>

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
                <RechartsTooltip
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
