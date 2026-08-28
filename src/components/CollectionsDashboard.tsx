import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Grid, Paper, Typography, Card, CardContent, Button,
  IconButton, TextField, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Chip, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, Tooltip, Alert, CircularProgress, Stack, Autocomplete,
  FormControl, InputLabel, Select, Divider, Tabs, Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PaymentIcon from '@mui/icons-material/Payment';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PaymentsIcon from '@mui/icons-material/Payments';
import HandshakeIcon from '@mui/icons-material/Handshake';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import type { ProjectInvoice, InvoiceStatus, BillingMilestone, BillToKind } from '../types/Invoice';
import {
  getInvoiceStatus,
  computeDueDate,
  formatPaymentTerms,
  PAYMENT_TERMS_OPTIONS,
  BILL_TO_OPTIONS,
  invoiceCash,
  invoiceCashDue,
  invoiceOutstanding,
  invoiceWht,
} from '../types/Invoice';
import type { Project } from '../types/Project';
import type { StatementOfAccount } from '../types/StatementOfAccount';
import { listSoas } from '../services/soaService';
import {
  actiExpectedStageLabel,
  actiExpectedTimingLabel,
  actiToIoctPoLabel,
  buildActiExpectedQueue,
  splitActiExpectedQueue,
  type ActiExpectedRow,
} from '../utils/commercialTrail';
import { API_BASE } from '../config/api';
import { useOneDriveAuth } from '../contexts/OneDriveAuthContext';
import { resolveCorporateDriveId, uploadFileToFolder, projectFolderName } from '../services/onedriveFolderService';
import { onedriveConfig } from '../config/onedriveConfig';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API = `${API_BASE}/api`;
const ACTI_NAME = 'Advance Controle Technologie Inc';

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

const PHP = new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', minimumFractionDigits: 2,
});

const STATUS_COLORS: Record<InvoiceStatus, 'success' | 'warning' | 'error' | 'default'> = {
  paid: 'success',
  partial: 'warning',
  overdue: 'error',
  unpaid: 'default',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  partial: 'Partial',
  overdue: 'Overdue',
  unpaid: 'Unpaid',
};

const TODAY = (): string => new Date().toISOString().slice(0, 10);

// ─── form types ───────────────────────────────────────────────────────────────
interface InvoiceForm {
  project_id: string;
  project_name: string;
  project_no: string;
  invoice_no: string;
  invoice_date: string;
  amount: string;
  payment_terms_days: number;
  due_date: string;
  notes: string;
  pb_number: string;
  bill_to: BillToKind;
  wht_amount: string;
  wht_rate_pct: string;
}

const blankForm = (): InvoiceForm => ({
  project_id: '',
  project_name: '',
  project_no: '',
  invoice_no: '',
  invoice_date: TODAY(),
  amount: '',
  payment_terms_days: 30,
  due_date: computeDueDate(TODAY(), 30),
  notes: '',
  pb_number: '',
  bill_to: 'customer',
  wht_amount: '',
  wht_rate_pct: '',
});

interface CollectForm {
  amount_collected: string;
  collection_date: string;
}

// ─── component ────────────────────────────────────────────────────────────────
export default function CollectionsDashboard() {
  const { user } = useAuth();
  const isTaxFiler = user?.role === 'tax_filer';
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedProjectId = searchParams.get('project_id');
  const rawTab = searchParams.get('tab') || 'receivables';
  const currentTab = (rawTab === 'settled' || rawTab === 'collected')
    ? 'settled'
    : (rawTab === 'acti' && !isTaxFiler)
      ? 'acti'
      : 'receivables';

  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [soas, setSoas] = useState<StatementOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // filters for Receivables tab
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | ''>('');
  const [filterActi, setFilterActi] = useState(false);

  // filters for Settled tab
  const [searchSettled, setSearchSettled] = useState('');
  const [filterSettledStatus, setFilterSettledStatus] = useState<'all' | 'paid' | 'partial'>('all');
  const [filterSettledBillTo, setFilterSettledBillTo] = useState<'all' | 'customer' | 'acti'>('all');

  // add/edit dialog
  const [invoiceDialog, setInvoiceDialog] = useState<'add' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectInvoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>(blankForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // collect dialog
  const [collectDialog, setCollectDialog] = useState<ProjectInvoice | null>(null);
  const [collectForm, setCollectForm] = useState<CollectForm>({ amount_collected: '', collection_date: TODAY() });
  const [collectSaving, setCollectSaving] = useState(false);
  const [collectErr, setCollectErr] = useState('');

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ProjectInvoice | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // OneDrive upload
  const { isAuthenticated: oneDriveSignedIn, login: oneDriveLogin, getAccessToken: getOneDriveToken } = useOneDriveAuth();
  const [uploadingScanId, setUploadingScanId] = useState<string | null>(null);
  const [uploadScanErr, setUploadScanErr] = useState('');

  // ─── tab navigation helper ───────────────────────────────────────────────
  const handleTabChange = (_: React.SyntheticEvent, newTab: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (newTab === 'receivables') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', newTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  // ─── fetch ───────────────────────────────────────────────────────────────
  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`${API}/invoices`);
      if (!res.ok) throw new Error(await res.text());
      setInvoices(await res.json());
    } catch {
      setError('Failed to reload invoices.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const invoiceUrl = preselectedProjectId
      ? `${API}/invoices?project_id=${encodeURIComponent(preselectedProjectId)}`
      : `${API}/invoices`;
    Promise.all([
      fetch(`${API}/projects`).then(r => r.json()),
      fetch(invoiceUrl).then(r => r.json()),
      listSoas().catch(() => [] as StatementOfAccount[]),
    ])
      .then(([ps, invs, soaList]) => {
        setProjects(Array.isArray(ps) ? ps : []);
        setInvoices(Array.isArray(invs) ? invs : []);
        setSoas(Array.isArray(soaList) ? soaList : []);
      })
      .catch((err: unknown) => {
        console.error('CollectionsDashboard load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data.');
      })
      .finally(() => setLoading(false));
  }, [preselectedProjectId]);

  // ─── derived data ────────────────────────────────────────────────────────
  const projectsById = useMemo(() => {
    const m: Record<string, Project> = {};
    projects.forEach(p => { m[String(p.id)] = p; });
    return m;
  }, [projects]);

  // SOA Lookup Map for quick deep-link trail
  const soasByProjectId = useMemo(() => {
    const map: Record<string, StatementOfAccount[]> = {};
    soas.forEach(s => {
      (s.items || []).forEach(item => {
        if (item.projectId) {
          const pid = String(item.projectId);
          if (!map[pid]) map[pid] = [];
          if (!map[pid].some(existing => existing.id === s.id)) {
            map[pid].push(s);
          }
        }
      });
    });
    return map;
  }, [soas]);

  const findSoasForInvoice = useCallback((inv: ProjectInvoice): StatementOfAccount[] => {
    const byPid = soasByProjectId[String(inv.project_id)] || [];
    if (byPid.length > 0) return byPid;
    if (inv.project_no) {
      return soas.filter(s => (s.items || []).some(item => item.projectNo === inv.project_no));
    }
    return [];
  }, [soas, soasByProjectId]);

  // An invoice counts as "with ACTI" when its project is ACTI-joint or it's billed to ACTI.
  const isActiInvoice = (inv: ProjectInvoice) =>
    inv.bill_to === 'acti' || !!projectsById[String(inv.project_id)]?.with_acti;

  const enriched = useMemo(() => invoices.map(inv => ({
    ...inv,
    _status: getInvoiceStatus(inv),
    _outstanding: invoiceOutstanding(inv),
    _wht: invoiceWht(inv),
    _cash: invoiceCash(inv),
  })), [invoices]);

  const filteredReceivables = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter(inv => {
      if (filterStatus && inv._status !== filterStatus) return false;
      if (filterActi && !isActiInvoice(inv)) return false;
      if (q && !(
        (inv.invoice_no || '').toLowerCase().includes(q) ||
        (inv.project_name || '').toLowerCase().includes(q) ||
        (inv.project_no || '').toLowerCase().includes(q)
      )) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, search, filterStatus, filterActi, projectsById]);

  // Settled / Collected invoices list
  const collectedInvoices = useMemo(() => {
    return enriched
      .filter(inv => inv._cash > 0 || inv._wht > 0 || inv._status === 'paid')
      .sort((a, b) => {
        const dateA = a.collection_date || a.invoice_date || a.created_at || '';
        const dateB = b.collection_date || b.invoice_date || b.created_at || '';
        return dateB.localeCompare(dateA);
      });
  }, [enriched]);

  const filteredSettled = useMemo(() => {
    const q = searchSettled.toLowerCase().trim();
    return collectedInvoices.filter(inv => {
      if (filterSettledStatus === 'paid' && inv._status !== 'paid') return false;
      if (filterSettledStatus === 'partial' && inv._status !== 'partial') return false;
      if (filterSettledBillTo === 'customer' && inv.bill_to === 'acti') return false;
      if (filterSettledBillTo === 'acti' && inv.bill_to !== 'acti') return false;

      if (q) {
        const p = projectsById[String(inv.project_id)];
        const matchingSoas = findSoasForInvoice(inv);
        const matchSoaNo = matchingSoas.some(s => s.soaNo.toLowerCase().includes(q));
        const matchText = (
          (inv.invoice_no || '') + ' ' +
          (inv.project_name || '') + ' ' +
          (inv.project_no || '') + ' ' +
          (inv.pb_number || '') + ' ' +
          (inv.notes || '') + ' ' +
          (p?.account_name || '') + ' ' +
          (p?.project_name || '') + ' ' +
          (p?.project_no || '')
        ).toLowerCase();
        if (!matchText.includes(q) && !matchSoaNo) return false;
      }
      return true;
    });
  }, [collectedInvoices, searchSettled, filterSettledStatus, filterSettledBillTo, projectsById, findSoasForInvoice]);

  // Turnaround statistics
  const turnaroundStats = useMemo(() => {
    let totalDays = 0;
    let count = 0;
    collectedInvoices.forEach(inv => {
      if (inv.invoice_date && inv.collection_date) {
        const invD = new Date(inv.invoice_date).getTime();
        const colD = new Date(inv.collection_date).getTime();
        if (!isNaN(invD) && !isNaN(colD) && colD >= invD) {
          const days = Math.round((colD - invD) / (1000 * 60 * 60 * 24));
          totalDays += days;
          count++;
        }
      }
    });
    return {
      avgDays: count > 0 ? Math.round(totalDays / count) : null,
      sampleCount: count,
    };
  }, [collectedInvoices]);

  const summary = useMemo(() => {
    const totalInvoiced = enriched.reduce((s, i) => s + i.amount, 0);
    const totalCash = enriched.reduce((s, i) => s + i._cash, 0);
    const totalWht = enriched.reduce((s, i) => s + i._wht, 0);
    const outstanding = enriched.filter(i => i._status !== 'paid').reduce((s, i) => s + i._outstanding, 0);
    const overdueAmount = enriched.filter(i => i._status === 'overdue').reduce((s, i) => s + i._outstanding, 0);
    const overdueCount = enriched.filter(i => i._status === 'overdue').length;
    const fullyPaidCount = enriched.filter(i => i._status === 'paid').length;
    const partialCount = enriched.filter(i => i._status === 'partial').length;
    return {
      totalInvoiced,
      totalCash,
      totalWht,
      totalSettled: totalCash + totalWht,
      outstanding,
      overdueAmount,
      overdueCount,
      fullyPaidCount,
      partialCount,
    };
  }, [enriched]);

  // Milestones eligible to invoice: site progress has reached the trigger, and no
  // invoice yet carries that milestone's pb_number for the project. When the page is
  // filtered to one project (?project_id=), invoices only cover that project, so we
  // scope the scan to it to avoid false positives for projects whose invoices aren't loaded.
  const readyToInvoice = useMemo(() => {
    const invoicedKeys = new Set(
      invoices.filter(i => i.pb_number).map(i => `${i.project_id}::${i.pb_number}`)
    );
    const scanProjects = preselectedProjectId
      ? projects.filter(p => String(p.id) === preselectedProjectId)
      : projects;
    const items: { project: Project; milestone: BillingMilestone; amount: number }[] = [];
    scanProjects.forEach(p => {
      const schedule = p.billing_schedule || [];
      if (schedule.length === 0) return;
      const site = p.actual_site_progress_percent ?? 0;
      const contract = p.updated_contract_amount || p.contract_amount || 0;
      schedule.forEach(m => {
        if (site >= m.trigger_pct && !invoicedKeys.has(`${p.id}::${m.pb_number}`)) {
          items.push({ project: p, milestone: m, amount: contract > 0 ? (m.billing_pct / 100) * contract : 0 });
        }
      });
    });
    return items;
  }, [projects, invoices, preselectedProjectId]);

  const readyTotal = useMemo(() => readyToInvoice.reduce((s, r) => s + r.amount, 0), [readyToInvoice]);

  const actiExpectedQueue = useMemo(() => {
    const scanProjects = preselectedProjectId
      ? projects.filter((p) => String(p.id) === preselectedProjectId)
      : projects;
    return buildActiExpectedQueue(scanProjects, invoices);
  }, [projects, invoices, preselectedProjectId]);

  const { pendingAr: actiPendingAr, ongoing: actiOngoing } = useMemo(
    () => splitActiExpectedQueue(actiExpectedQueue),
    [actiExpectedQueue],
  );

  const actiPendingArTotal = useMemo(
    () => actiPendingAr.reduce((s, r) => s + r.expectedAmount, 0),
    [actiPendingAr],
  );
  const actiOngoingTotal = useMemo(
    () => actiOngoing.reduce((s, r) => s + r.expectedAmount, 0),
    [actiOngoing],
  );

  useEffect(() => {
    if (loading) return;
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (hash.startsWith('expected-acti') && currentTab !== 'acti') {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('tab', 'acti');
      setSearchParams(nextParams, { replace: true });
    }
  }, [loading, searchParams, currentTab, setSearchParams]);

  // ─── form helpers ────────────────────────────────────────────────────────
  const handleFormChange = (field: keyof InvoiceForm, value: string | number) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if ((field === 'invoice_date' || field === 'payment_terms_days') && next.invoice_date && next.payment_terms_days) {
        next.due_date = computeDueDate(next.invoice_date, Number(next.payment_terms_days));
      }
      return next;
    });
  };

  const openAdd = () => {
    setForm(blankForm());
    setFormErr('');
    setEditTarget(null);
    setInvoiceDialog('add');
  };

  const openEdit = (inv: ProjectInvoice) => {
    setForm({
      project_id: inv.project_id,
      project_name: inv.project_name || '',
      project_no: inv.project_no || '',
      invoice_no: inv.invoice_no,
      invoice_date: inv.invoice_date,
      amount: String(inv.amount),
      payment_terms_days: inv.payment_terms_days,
      due_date: inv.due_date,
      notes: inv.notes || '',
      pb_number: inv.pb_number || '',
      bill_to: inv.bill_to || 'customer',
      wht_amount: inv.wht_amount ? String(inv.wht_amount) : '',
      wht_rate_pct: inv.wht_rate_pct ? String(inv.wht_rate_pct) : '',
    });
    setFormErr('');
    setEditTarget(inv);
    setInvoiceDialog('edit');
  };

  // Pre-fill the add dialog for a milestone that's ready to invoice (carries pb_number
  // so the new invoice links back to the milestone in Progress Billing).
  const openCreateForMilestone = (project: Project, m: BillingMilestone) => {
    const contract = project.updated_contract_amount || project.contract_amount || 0;
    const amount = contract > 0 ? Math.round((m.billing_pct / 100) * contract * 100) / 100 : 0;
    const terms = (m.trigger_pct === 0 || m.trigger_pct >= 100) ? 0 : 30;
    const today = TODAY();
    setForm({
      project_id: String(project.id),
      project_name: project.project_name || '',
      project_no: project.project_no || '',
      invoice_no: '',
      invoice_date: today,
      amount: String(amount),
      payment_terms_days: terms,
      due_date: computeDueDate(today, terms),
      notes: [m.label, m.pb_number].filter(Boolean).join(' — '),
      pb_number: m.pb_number,
      bill_to: project.with_acti ? 'acti' : 'customer',
      wht_amount: '',
      wht_rate_pct: '',
    });
    setFormErr('');
    setEditTarget(null);
    setInvoiceDialog('add');
  };

  const openCollect = (inv: ProjectInvoice) => {
    const remainingCash = invoiceCashDue(inv);
    setCollectForm({
      amount_collected: String(invoiceCash(inv) + remainingCash),
      collection_date: TODAY(),
    });
    setCollectErr('');
    setCollectDialog(inv);
  };

  const handleSaveInvoice = async () => {
    if (!form.project_id) { setFormErr('Select a project.'); return; }
    if (!form.invoice_no.trim()) { setFormErr('Invoice number is required.'); return; }
    if (!form.invoice_date) { setFormErr('Invoice date is required.'); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setFormErr('Enter a valid amount.'); return; }
    if (!form.due_date) { setFormErr('Due date is required.'); return; }
    const whtAmount = parseFloat(form.wht_amount);
    const wht = Number.isFinite(whtAmount) && whtAmount > 0 ? whtAmount : 0;
    if (wht > amount) { setFormErr('WHT cannot exceed invoice amount.'); return; }
    const rateParsed = parseFloat(form.wht_rate_pct);
    const whtRate = Number.isFinite(rateParsed) && rateParsed > 0
      ? rateParsed
      : (wht > 0 && amount > 0 ? Math.round((wht / amount) * 10000) / 100 : 0);

    setSaving(true);
    setFormErr('');
    try {
      const body: Partial<ProjectInvoice> = {
        project_id: form.project_id,
        project_name: form.project_name,
        project_no: form.project_no,
        invoice_no: form.invoice_no.trim(),
        invoice_date: form.invoice_date,
        amount,
        payment_terms_days: form.payment_terms_days,
        due_date: form.due_date,
        notes: form.notes.trim() || undefined,
        pb_number: form.pb_number || undefined,
        bill_to: form.bill_to,
        bill_to_name: form.bill_to === 'acti' ? ACTI_NAME : (selectedProject?.account_name || form.project_name || ''),
        wht_amount: wht,
        wht_rate_pct: whtRate || undefined,
        wht_2307_status: wht > 0 ? (editTarget?.wht_2307_status || 'expected') : undefined,
        ...(invoiceDialog === 'add' ? { amount_collected: 0 } : {}),
      };
      const url = invoiceDialog === 'edit' && editTarget
        ? `${API}/invoices/${editTarget.id}`
        : `${API}/invoices`;
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(url, {
        method: invoiceDialog === 'edit' ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || res.statusText);
      }
      await fetchInvoices();
      setInvoiceDialog(null);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordCollection = async () => {
    if (!collectDialog) return;
    const collected = parseFloat(collectForm.amount_collected);
    if (isNaN(collected) || collected < 0) { setCollectErr('Enter a valid amount.'); return; }
    const maxCash = collectDialog.amount - invoiceWht(collectDialog);
    if (collected > maxCash + 0.005) {
      setCollectErr(`Cash collected cannot exceed ${PHP.format(maxCash)} (invoice minus EWT).`);
      return;
    }

    setCollectSaving(true);
    setCollectErr('');
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API}/invoices/${collectDialog.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ amount_collected: collected, collection_date: collectForm.collection_date || undefined }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || res.statusText);
      }
      await fetchInvoices();
      setCollectDialog(null);
    } catch (e) {
      setCollectErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setCollectSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const token = localStorage.getItem('netpacific_token');
      await fetch(`${API}/invoices/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      await fetchInvoices();
    } catch {
      setError('Delete failed.');
    } finally {
      setDeleteConfirm(false);
      setDeleteTarget(null);
    }
  };

  // ─── upload scan ────────────────────────────────────────────────────────
  const handleScanUpload = async (inv: ProjectInvoice, file: File) => {
    if (!/(\.pdf|\.png|\.jpe?g|\.tiff?|\.bmp)$/i.test(file.name)) {
      setUploadScanErr('Please upload a PDF or image file (PDF, PNG, JPG, TIFF, BMP).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setUploadScanErr('File is too large. Maximum size is 25 MB.');
      return;
    }

    if (!oneDriveSignedIn) {
      oneDriveLogin();
      return;
    }

    setUploadingScanId(inv.id);
    setUploadScanErr('');

    try {
      const token = await getOneDriveToken();
      if (!token) {
        setUploadScanErr('Could not obtain OneDrive access token. Please sign in again.');
        setUploadingScanId(null);
        return;
      }
      const driveId = await resolveCorporateDriveId(token);

      const code = inv.project_no || String(inv.project_id);
      const name = inv.project_name || '';
      const folderName = projectFolderName({ code, name });
      const sanitizedInvoice = inv.invoice_no.replace(/[<>:"/\\|?*]/g, '_');
      const filename = `${sanitizedInvoice}_${file.name}`;
      const execRoot = onedriveConfig.executionRoot || '01 Execution';
      const year = String(new Date().getFullYear());
      // Try year-aware path first (new structure), fall back to flat (historical projects)
      const yearPath = `${execRoot}/${year}/${folderName}/Sales Invoice`;
      const flatPath = `${execRoot}/${folderName}/Sales Invoice`;
      let result;
      try {
        result = await uploadFileToFolder(token, driveId, yearPath, filename, file);
      } catch {
        result = await uploadFileToFolder(token, driveId, flatPath, filename, file);
      }

      const scanFile = {
        onedrive_item_id: result.id,
        onedrive_web_url: result.webUrl,
        filename: result.name || filename,
        uploaded_at: new Date().toISOString(),
      };

      const authToken = localStorage.getItem('netpacific_token');
      await fetch(`${API}/invoices/${inv.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ scan_file: scanFile }),
      });

      await fetchInvoices();
    } catch (e) {
      setUploadScanErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploadingScanId(null);
    }
  };

  const handleScanPick = (inv: ProjectInvoice, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleScanUpload(inv, file);
    e.target.value = '';
  };

  const calculateTurnaround = (invoiceDate?: string, collectionDate?: string): string => {
    if (!invoiceDate || !collectionDate) return '—';
    const invD = new Date(invoiceDate).getTime();
    const colD = new Date(collectionDate).getTime();
    if (isNaN(invD) || isNaN(colD)) return '—';
    const diffDays = Math.round((colD - invD) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Same day';
    if (diffDays === 1) return '1 day';
    if (diffDays < 0) return '—';
    return `${diffDays} days`;
  };

  // ─── Export CSV for Settled Ledger ──────────────────────────────────────
  const exportCollectedToCSV = () => {
    const escapeCSV = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'Collection Date',
      'Project No',
      'Project Name',
      'Client / Account',
      'PB Milestone',
      'Invoice No',
      'Invoice Date',
      'Bill To',
      'Invoice Amount (PHP)',
      'Cash Collected (PHP)',
      'EWT Amount (PHP)',
      'EWT Rate %',
      'EWT 2307 Status',
      'Outstanding Balance (PHP)',
      'Settlement Status',
      'Turnaround (Days)',
      'Linked SOA(s)',
      'Scan File URL',
      'Notes',
    ];

    const rows = filteredSettled.map(inv => {
      const p = projectsById[String(inv.project_id)];
      const matchingSoas = findSoasForInvoice(inv);
      const turnaround = calculateTurnaround(inv.invoice_date, inv.collection_date);
      return [
        inv.collection_date || inv.invoice_date || '',
        inv.project_no || p?.project_no || '',
        inv.project_name || p?.project_name || '',
        p?.account_name || '',
        inv.pb_number || '',
        inv.invoice_no || '',
        inv.invoice_date || '',
        inv.bill_to === 'acti' ? 'ACTI' : 'End Customer',
        inv.amount ?? 0,
        inv._cash ?? 0,
        inv._wht ?? 0,
        inv.wht_rate_pct ? `${inv.wht_rate_pct}%` : '',
        inv.wht_2307_status || '',
        inv._outstanding ?? 0,
        STATUS_LABELS[inv._status] || inv._status,
        turnaround,
        matchingSoas.map(s => s.soaNo).join('; ') || '',
        inv.scan_file?.onedrive_web_url || '',
        inv.notes || '',
      ].map(escapeCSV).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `IOCT_Collected_Settlements_${TODAY()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderActiExpectedTable = (rows: ActiExpectedRow[]) => (
    <TableContainer sx={{ maxHeight: 280 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Project</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Customer PO (to ACTI)</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>ACTI PO (to IOCT)</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>ACTI SI to customer</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Expected collection</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Expected amount</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Stage</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const p = row.project;
            const trail = p.commercial_trail;
            return (
              <TableRow key={String(p.id)} hover>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, fontSize: '0.8rem', color: NET_PACIFIC_COLORS.primary, cursor: 'pointer' }}
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    {[p.project_no, p.project_name].filter(Boolean).join(' · ')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{p.account_name}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{p.po_number || '—'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{actiToIoctPoLabel(trail)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {trail?.partner_si_no
                      ? `${trail.partner_si_no}${trail.partner_si_date ? ` · ${trail.partner_si_date}` : ''}`
                      : '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{row.expectedCollectionDate || '—'}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{PHP.format(row.expectedAmount)}</Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={actiExpectedStageLabel(row.stage)} variant="outlined" />
                    <Chip
                      size="small"
                      label={actiExpectedTimingLabel(row.timing)}
                      color={row.timing === 'past_expected' ? 'warning' : row.timing === 'due_soon' ? 'info' : 'default'}
                      variant={row.timing === 'date_missing' ? 'outlined' : 'filled'}
                    />
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

  // ─── render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  const selectedProject = projects.find(p => String(p.id) === form.project_id) ?? null;

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      {/* Title */}
      <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Collections & Receivables
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate('/finance/ewt-2307')}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            EWT / 2307
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate('/finance/soa')}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Statements of Account (SOA)
          </Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}
      {uploadScanErr && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setUploadScanErr('')}>{uploadScanErr}</Alert>}

      {/* Global KPI Cards (Clickable Quick Tabs/Filters) */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Card
            sx={{
              background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`,
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.15s ease-in-out',
              '&:hover': { transform: 'translateY(-2px)' },
            }}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('tab');
              setSearchParams(next, { replace: true });
              setFilterStatus('');
            }}
          >
            <CardContent sx={{ p: 1.5 }}>
              <Typography variant="caption" sx={{ opacity: 0.9, display: 'block', fontWeight: 500 }}>Total Invoiced</Typography>
              <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {PHP.format(summary.totalInvoiced)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.7rem' }}>
                {enriched.length} invoice{enriched.length !== 1 ? 's' : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Card
            sx={{
              background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`,
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.15s ease-in-out',
              '&:hover': { transform: 'translateY(-2px)' },
            }}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set('tab', 'settled');
              setSearchParams(next, { replace: true });
            }}
          >
            <CardContent sx={{ p: 1.5 }}>
              <Typography variant="caption" sx={{ opacity: 0.9, display: 'block', fontWeight: 500 }}>Cash Received</Typography>
              <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {PHP.format(summary.totalCash)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.85, fontSize: '0.7rem' }}>
                {summary.totalInvoiced > 0
                  ? `${((summary.totalCash / summary.totalInvoiced) * 100).toFixed(1)}% of gross · open ledger`
                  : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Card
            sx={{
              background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent2} 0%, ${NET_PACIFIC_COLORS.secondary} 100%)`,
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.15s ease-in-out',
              '&:hover': { transform: 'translateY(-2px)' },
            }}
            onClick={() => navigate('/finance/ewt-2307')}
          >
            <CardContent sx={{ p: 1.5 }}>
              <Typography variant="caption" sx={{ opacity: 0.9, display: 'block', fontWeight: 500 }}>EWT / 2307</Typography>
              <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {PHP.format(summary.totalWht)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.7rem' }}>
                Tax credit · view 2307 register
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Card
            sx={{
              background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`,
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.15s ease-in-out',
              '&:hover': { transform: 'translateY(-2px)' },
            }}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('tab');
              setSearchParams(next, { replace: true });
              setFilterStatus('unpaid');
            }}
          >
            <CardContent sx={{ p: 1.5 }}>
              <Typography variant="caption" sx={{ opacity: 0.9, display: 'block', fontWeight: 500 }}>Outstanding</Typography>
              <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {PHP.format(summary.outstanding)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.7rem' }}>
                {enriched.filter(i => i._status !== 'paid').length} pending collection
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Card
            sx={{
              background: summary.overdueCount > 0
                ? `linear-gradient(135deg, #e53935 0%, #ef9a9a 100%)`
                : `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`,
              color: summary.overdueCount > 0 ? 'white' : '#2d3436',
              cursor: 'pointer',
              transition: 'transform 0.15s ease-in-out',
              '&:hover': { transform: 'translateY(-2px)' },
            }}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('tab');
              setSearchParams(next, { replace: true });
              setFilterStatus('overdue');
            }}
          >
            <CardContent sx={{ p: 1.5 }}>
              <Typography variant="caption" sx={{ opacity: 0.9, display: 'block', fontWeight: 500 }}>Overdue</Typography>
              <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {PHP.format(summary.overdueAmount)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.7rem' }}>
                {summary.overdueCount} past due
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        {!isTaxFiler && (
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Card
              sx={{
                background: `linear-gradient(135deg, #636e72 0%, #b2bec3 100%)`,
                color: 'white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-in-out',
                '&:hover': { transform: 'translateY(-2px)' },
              }}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set('tab', 'acti');
                setSearchParams(next, { replace: true });
              }}
            >
              <CardContent sx={{ p: 1.5 }}>
                <Typography variant="caption" sx={{ opacity: 0.9, display: 'block', fontWeight: 500 }}>ACTI Watchlist</Typography>
                <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {PHP.format(actiPendingArTotal)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.7rem' }}>
                  {actiPendingAr.length} pending · {actiOngoing.length} ongoing
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Tabs Navigation Bar */}
      <Paper sx={{ mb: 2, borderRadius: 2, bgcolor: '#ffffff' }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: '1px solid #e0e0e0',
            px: 1.5,
            '& .MuiTab-root': {
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '0.9rem',
              minHeight: 48,
            },
          }}
        >
          <Tab
            value="receivables"
            icon={<ReceiptLongIcon fontSize="small" />}
            iconPosition="start"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>Receivables & Billing</span>
                <Chip
                  size="small"
                  label={enriched.filter(i => i._status !== 'paid').length + readyToInvoice.length}
                  color={summary.overdueCount > 0 ? 'error' : 'default'}
                  sx={{ height: 20, fontSize: '0.725rem', fontWeight: 600 }}
                />
              </Box>
            }
          />
          <Tab
            value="settled"
            icon={<PaymentsIcon fontSize="small" />}
            iconPosition="start"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>Collected & Settlement Ledger</span>
                <Chip
                  size="small"
                  label={collectedInvoices.length}
                  color="success"
                  sx={{ height: 20, fontSize: '0.725rem', fontWeight: 600 }}
                />
              </Box>
            }
          />
          {!isTaxFiler && (
            <Tab
              value="acti"
              icon={<HandshakeIcon fontSize="small" />}
              iconPosition="start"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>ACTI Expected Watchlist</span>
                  {actiExpectedQueue.length > 0 && (
                    <Chip
                      size="small"
                      label={actiExpectedQueue.length}
                      color="primary"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.725rem', fontWeight: 600 }}
                    />
                  )}
                </Box>
              }
            />
          )}
        </Tabs>
      </Paper>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 1: RECEIVABLES & BILLING QUEUE
         ═══════════════════════════════════════════════════════════════════════ */}
      {currentTab === 'receivables' && (
        <Box>
          {/* Ready-to-invoice notification */}
          {readyToInvoice.length > 0 && (
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2, borderColor: NET_PACIFIC_COLORS.warning, bgcolor: '#fffbe6' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                <NotificationsActiveIcon sx={{ color: '#b7791f' }} fontSize="small" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {readyToInvoice.length} milestone{readyToInvoice.length !== 1 ? 's' : ''} ready to invoice
                </Typography>
                <Typography variant="body2" color="text.secondary">· {PHP.format(readyTotal)}</Typography>
              </Box>
              <Stack spacing={0} sx={{ maxHeight: 200, overflowY: 'auto' }}>
                {readyToInvoice.map(r => (
                  <Box
                    key={`${r.project.id}-${r.milestone.pb_number}`}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', py: 0.75, borderTop: '1px solid', borderColor: 'rgba(0,0,0,0.06)' }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {[r.project.project_no, r.project.project_name].filter(Boolean).join(' · ') || `Project ${r.project.id}`}
                        {' — '}
                        <Box component="span" sx={{ fontFamily: 'monospace', color: NET_PACIFIC_COLORS.primary }}>{r.milestone.pb_number}</Box>
                        {r.milestone.label ? ` ${r.milestone.label}` : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Site {r.project.actual_site_progress_percent ?? 0}% ≥ trigger {r.milestone.trigger_pct}% · bills {r.milestone.billing_pct}% = {PHP.format(r.amount)}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={() => openCreateForMilestone(r.project, r.milestone)}
                      sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary }, flexShrink: 0 }}
                    >
                      Create Invoice
                    </Button>
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Filters */}
          <Paper sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
            <Grid container spacing={1.5} alignItems="center">
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField
                  fullWidth
                  label="Search"
                  placeholder="Invoice no., project name…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value as InvoiceStatus | '')}
                    label="Status"
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    <MenuItem value="unpaid">Unpaid</MenuItem>
                    <MenuItem value="partial">Partial</MenuItem>
                    <MenuItem value="overdue">Overdue</MenuItem>
                    <MenuItem value="paid">Paid</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Chip
                  label="With ACTI"
                  color={filterActi ? 'primary' : 'default'}
                  variant={filterActi ? 'filled' : 'outlined'}
                  onClick={() => setFilterActi(v => !v)}
                  clickable
                />
              </Grid>
            </Grid>
          </Paper>

          {/* Invoices Table */}
          <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, flexGrow: 1 }}>
            <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0' }}>
              <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
                Invoices ({filteredReceivables.length})
              </Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={openAdd}
                sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
              >
                Add Invoice
              </Button>
            </Box>

            <TableContainer sx={{ maxHeight: 'calc(100vh - 460px)', minHeight: 300 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Project</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Invoice No.</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>PB #</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Bill To</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Date Issued</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Terms</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Due Date</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Cash</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>EWT</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Outstanding</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Status</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredReceivables.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} align="center" sx={{ py: 4, color: 'text.secondary', fontSize: '0.875rem' }}>
                        {enriched.length === 0
                          ? 'No invoices yet. Click "Add Invoice" to get started.'
                          : 'No invoices match the current filters.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredReceivables.map(inv => {
                    const isOverdue = inv._status === 'overdue';
                    const handleProjectClick = () => {
                      sessionStorage.setItem('selectedProjectId', String(inv.project_id));
                      navigate(`/projects/${inv.project_id}`);
                    };
                    return (
                      <TableRow key={inv.id} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              fontSize: '0.8rem',
                              color: NET_PACIFIC_COLORS.primary,
                              cursor: 'pointer',
                              '&:hover': { textDecoration: 'underline' },
                            }}
                            onClick={handleProjectClick}
                          >
                            {inv.project_name || '—'}
                          </Typography>
                          {inv.project_no && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ cursor: 'pointer' }}
                              onClick={handleProjectClick}
                            >
                              {inv.project_no}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                            {inv.invoice_no}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {inv.pb_number
                            ? <Chip label={inv.pb_number} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                            : <Typography variant="caption" color="text.disabled">—</Typography>}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {inv.bill_to === 'acti'
                            ? <Chip label="ACTI" size="small" color="primary" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                            : <Typography variant="caption" color="text.secondary">Customer</Typography>}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{inv.invoice_date}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {PHP.format(inv.amount)}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {formatPaymentTerms(inv.payment_terms_days)}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: isOverdue ? 'error.main' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                            {inv.due_date}
                          </Typography>
                          {isOverdue && (
                            <Typography variant="caption" color="error.main" display="block">Past due</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: inv._cash > 0 ? 'success.main' : 'text.secondary', fontWeight: inv._cash > 0 ? 600 : 400 }}>
                          {PHP.format(inv._cash)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: inv._wht > 0 ? NET_PACIFIC_COLORS.accent2 : 'text.disabled' }}>
                          {inv._wht > 0 ? PHP.format(inv._wht) : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {inv._outstanding > 0
                            ? <Typography variant="body2" sx={{ fontSize: '0.8rem', color: isOverdue ? 'error.main' : 'warning.dark', fontWeight: isOverdue ? 600 : 400 }}>{PHP.format(inv._outstanding)}</Typography>
                            : <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>—</Typography>}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={STATUS_LABELS[inv._status]}
                            color={STATUS_COLORS[inv._status]}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          {inv._status !== 'paid' && (
                            <Tooltip title="Record collection">
                              <IconButton size="small" color="success" onClick={() => openCollect(inv)}>
                                <PaymentIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {inv.scan_file?.onedrive_web_url ? (
                            <Tooltip title={`View scan: ${inv.scan_file.filename}`}>
                              <IconButton size="small" color="info" onClick={() => window.open(inv.scan_file!.onedrive_web_url, '_blank')}>
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title={uploadingScanId === inv.id ? 'Uploading…' : 'Upload invoice scan'}>
                              <IconButton size="small" color="primary" disabled={uploadingScanId === inv.id} component="label">
                                {uploadingScanId === inv.id ? <CircularProgress size={16} /> : <CloudUploadIcon fontSize="small" />}
                                <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.bmp" onChange={e => handleScanPick(inv, e)} />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEdit(inv)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => { setDeleteTarget(inv); setDeleteConfirm(true); }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 2: COLLECTED & SETTLEMENT LEDGER
         ═══════════════════════════════════════════════════════════════════════ */}
      {currentTab === 'settled' && (
        <Box>
          {/* Settlement Metrics Summary */}
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2, borderRadius: 2, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <AccountBalanceIcon sx={{ color: 'success.main', fontSize: 20 }} />
                  <Typography variant="body2" color="success.dark" fontWeight={600}>Total Cash Inflow</Typography>
                </Box>
                <Typography variant="h5" fontWeight={700} color="success.dark">
                  {PHP.format(summary.totalCash)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Cash collected and banked to date
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
                onClick={() => navigate('/finance/ewt-2307')}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <CheckCircleIcon sx={{ color: NET_PACIFIC_COLORS.accent2, fontSize: 20 }} />
                  <Typography variant="body2" fontWeight={600} color={NET_PACIFIC_COLORS.accent2}>
                    BIR 2307 EWT Recognized
                  </Typography>
                </Box>
                <Typography variant="h5" fontWeight={700} color={NET_PACIFIC_COLORS.accent2}>
                  {PHP.format(summary.totalWht)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Tax credit settlement · click for 2307 register
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2, borderRadius: 2, bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <PaymentsIcon sx={{ color: NET_PACIFIC_COLORS.primary, fontSize: 20 }} />
                  <Typography variant="body2" fontWeight={600} color={NET_PACIFIC_COLORS.primary}>
                    Gross Settled Revenue
                  </Typography>
                </Box>
                <Typography variant="h5" fontWeight={700} color={NET_PACIFIC_COLORS.primary}>
                  {PHP.format(summary.totalSettled)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {summary.fullyPaidCount} fully paid · {summary.partialCount} partial
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2, borderRadius: 2, bgcolor: '#faf5ff', border: '1px solid #e9d5ff' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <AccessTimeIcon sx={{ color: '#7e22ce', fontSize: 20 }} />
                  <Typography variant="body2" fontWeight={600} color="#7e22ce">
                    Avg Turnaround (DSO)
                  </Typography>
                </Box>
                <Typography variant="h5" fontWeight={700} color="#7e22ce">
                  {turnaroundStats.avgDays != null ? `${turnaroundStats.avgDays} days` : '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {turnaroundStats.sampleCount > 0 ? `Based on ${turnaroundStats.sampleCount} dated collections` : 'Collection dates tracking active'}
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* Settled Filters & Export Bar */}
          <Paper sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
            <Grid container spacing={1.5} alignItems="center">
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField
                  fullWidth
                  label="Search Settled Records"
                  placeholder="Invoice #, project, client, SOA #…"
                  value={searchSettled}
                  onChange={e => setSearchSettled(e.target.value)}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 3 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Settlement Type</InputLabel>
                  <Select
                    value={filterSettledStatus}
                    onChange={e => setFilterSettledStatus(e.target.value as 'all' | 'paid' | 'partial')}
                    label="Settlement Type"
                  >
                    <MenuItem value="all">All Collected ({collectedInvoices.length})</MenuItem>
                    <MenuItem value="paid">Fully Settled ({summary.fullyPaidCount})</MenuItem>
                    <MenuItem value="partial">Partially Collected ({summary.partialCount})</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Bill To</InputLabel>
                  <Select
                    value={filterSettledBillTo}
                    onChange={e => setFilterSettledBillTo(e.target.value as 'all' | 'customer' | 'acti')}
                    label="Bill To"
                  >
                    <MenuItem value="all">All Counterparties</MenuItem>
                    <MenuItem value="customer">End Customer</MenuItem>
                    <MenuItem value="acti">ACTI</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 12, md: 3 }} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<FileDownloadIcon />}
                  onClick={exportCollectedToCSV}
                  disabled={filteredSettled.length === 0}
                  sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
                >
                  Export CSV ({filteredSettled.length})
                </Button>
              </Grid>
            </Grid>
          </Paper>

          {/* Settled Ledger Table */}
          <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, flexGrow: 1 }}>
            <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0' }}>
              <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
                Collected & Settlement History ({filteredSettled.length})
              </Typography>
            </Box>

            <TableContainer sx={{ maxHeight: 'calc(100vh - 460px)', minHeight: 320 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Collection Date</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Project & PB Milestone</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Invoice No.</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Bill To</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Gross Billed</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Cash Collected</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>EWT (2307)</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Turnaround</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Linked SOA / Provenance</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSettled.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} align="center" sx={{ py: 5, color: 'text.secondary', fontSize: '0.875rem' }}>
                        {collectedInvoices.length === 0
                          ? 'No collections recorded yet. Use the Receivables tab to record your first payment.'
                          : 'No collected records match the active filter.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredSettled.map(inv => {
                    const p = projectsById[String(inv.project_id)];
                    const matchingSoas = findSoasForInvoice(inv);
                    const turnaround = calculateTurnaround(inv.invoice_date, inv.collection_date);

                    const handleProjectClick = () => {
                      sessionStorage.setItem('selectedProjectId', String(inv.project_id));
                      navigate(`/projects/${inv.project_id}`);
                    };

                    return (
                      <TableRow key={inv.id} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', color: '#2d3436' }}>
                            {inv.collection_date || '—'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Issued: {inv.invoice_date}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              fontSize: '0.8rem',
                              color: NET_PACIFIC_COLORS.primary,
                              cursor: 'pointer',
                              '&:hover': { textDecoration: 'underline' },
                            }}
                            onClick={handleProjectClick}
                          >
                            {[inv.project_no, inv.project_name].filter(Boolean).join(' · ') || `Project ${inv.project_id}`}
                          </Typography>
                          <Stack direction="row" spacing={0.5} alignItems="center" mt={0.25}>
                            {inv.pb_number && (
                              <Chip
                                label={inv.pb_number}
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ fontSize: '0.675rem', height: 18 }}
                              />
                            )}
                            {p?.account_name && (
                              <Typography variant="caption" color="text.secondary">
                                {p.account_name}
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 600 }}>
                            {inv.invoice_no}
                          </Typography>
                          {inv.scan_file?.onedrive_web_url && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: NET_PACIFIC_COLORS.primary,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.25,
                                '&:hover': { textDecoration: 'underline' },
                              }}
                              onClick={() => window.open(inv.scan_file!.onedrive_web_url, '_blank')}
                            >
                              <VisibilityIcon sx={{ fontSize: 12 }} /> Scan on file
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {inv.bill_to === 'acti' ? (
                            <Chip label="ACTI" size="small" color="primary" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                          ) : (
                            <Typography variant="caption" color="text.secondary">Customer</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {PHP.format(inv.amount)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'success.main', fontWeight: 700 }}>
                          {PHP.format(inv._cash)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {inv._wht > 0 ? (
                            <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600, color: NET_PACIFIC_COLORS.accent2 }}>
                                {PHP.format(inv._wht)}
                              </Typography>
                              <Chip
                                size="small"
                                label={inv.wht_2307_status === 'received' ? '2307 on file' : '2307 expected'}
                                color={inv.wht_2307_status === 'received' ? 'success' : 'warning'}
                                variant="outlined"
                                onClick={() => navigate('/finance/ewt-2307')}
                                sx={{ fontSize: '0.65rem', height: 16, cursor: 'pointer', mt: 0.25 }}
                              />
                            </Box>
                          ) : (
                            <Typography variant="caption" color="text.disabled">—</Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Chip
                            label={STATUS_LABELS[inv._status]}
                            color={STATUS_COLORS[inv._status]}
                            size="small"
                            variant="filled"
                            sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600 }}
                          />
                          {inv._status === 'partial' && (
                            <Typography variant="caption" color="warning.dark" display="block" sx={{ fontSize: '0.7rem' }}>
                              Due: {PHP.format(inv._outstanding)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                            {turnaround}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {matchingSoas.length > 0 ? (
                              matchingSoas.map(soa => (
                                <Tooltip key={soa.id} title={`View Statement of Account: ${soa.soaNo}`}>
                                  <Chip
                                    label={soa.soaNo}
                                    size="small"
                                    color="secondary"
                                    variant="outlined"
                                    onClick={() => navigate(`/finance/soa/${soa.id}`)}
                                    sx={{ fontSize: '0.7rem', height: 20, cursor: 'pointer' }}
                                  />
                                </Tooltip>
                              ))
                            ) : (
                              <Typography variant="caption" color="text.disabled">Direct invoice</Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          <Tooltip title="Update / Adjust collection amount">
                            <IconButton size="small" color="success" onClick={() => openCollect(inv)}>
                              <PaymentIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {inv.scan_file?.onedrive_web_url ? (
                            <Tooltip title={`View scan: ${inv.scan_file.filename}`}>
                              <IconButton size="small" color="info" onClick={() => window.open(inv.scan_file!.onedrive_web_url, '_blank')}>
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Upload scan">
                              <IconButton size="small" color="primary" disabled={uploadingScanId === inv.id} component="label">
                                <CloudUploadIcon fontSize="small" />
                                <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.bmp" onChange={e => handleScanPick(inv, e)} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {inv.pb_number && (
                            <Tooltip title={`Open Progress Report for ${inv.pb_number}`}>
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/reports/progress?projectId=${encodeURIComponent(String(inv.project_id))}&pb=${encodeURIComponent(inv.pb_number || '')}`)}
                                sx={{ color: NET_PACIFIC_COLORS.accent1 }}
                              >
                                <DescriptionIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Edit invoice details">
                            <IconButton size="small" onClick={() => openEdit(inv)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => { setDeleteTarget(inv); setDeleteConfirm(true); }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 3: ACTI EXPECTED WATCHLIST
         ═══════════════════════════════════════════════════════════════════════ */}
      {!isTaxFiler && currentTab === 'acti' && (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>IOCT–ACTI Commercial Trail:</strong> IOCT and ACTI are distinct commercial parties.
            The items below track project coordination milestones (Customer PO → ACTI, ACTI PO → IOCT, Partner SI).
            These expected dates <em>do not create Accounting AR</em> until an official IOCT invoice is issued.
          </Alert>

          {actiPendingAr.length > 0 && (
            <Paper id="expected-acti-pending-ar" sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                    ACTI pending AR — completed, awaiting PO / invoice ({actiPendingAr.length})
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Work is completed on site. Awaiting partner PO issuance or invoicing.
                  </Typography>
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
                  {PHP.format(actiPendingArTotal)}
                </Typography>
              </Box>
              {renderActiExpectedTable(actiPendingAr)}
            </Paper>
          )}

          {actiOngoing.length > 0 && (
            <Paper id="expected-acti-ongoing" sx={{ p: 2, borderRadius: 2, border: '1px dashed #c5d4eb', bgcolor: '#f8fafc' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.secondary }}>
                    ACTI ongoing — no PO from ACTI yet ({actiOngoing.length})
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Project still in progress on site. Watchlist only — not yet pending collection.
                  </Typography>
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.secondary }}>
                  {PHP.format(actiOngoingTotal)}
                </Typography>
              </Box>
              {renderActiExpectedTable(actiOngoing)}
            </Paper>
          )}

          {actiExpectedQueue.length === 0 && (
            <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="body1" color="text.secondary">
                No active ACTI joint coordination projects in the expected queue.
              </Typography>
            </Paper>
          )}
        </Box>
      )}

      {/* ── Add / Edit Invoice Dialog ─────────────────────────────────────── */}
      <Dialog open={invoiceDialog !== null} onClose={() => setInvoiceDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{invoiceDialog === 'add' ? 'Add Invoice' : 'Edit Invoice'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formErr && <Alert severity="error">{formErr}</Alert>}

            <Autocomplete
              options={projects}
              getOptionLabel={p => `${p.project_no ? p.project_no + ' — ' : ''}${p.project_name || ''} (${p.account_name || ''})`}
              value={selectedProject}
              onChange={(_, p) => {
                if (p) {
                  setForm(prev => ({
                    ...prev,
                    project_id: String(p.id),
                    project_name: p.project_name || '',
                    project_no: p.project_no || '',
                    bill_to: p.with_acti ? 'acti' : 'customer',
                  }));
                } else {
                  setForm(prev => ({ ...prev, project_id: '', project_name: '', project_no: '' }));
                }
              }}
              renderInput={params => <TextField {...params} label="Project" size="small" required />}
              isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
              disabled={invoiceDialog === 'edit'}
            />

            <TextField
              label="Invoice No."
              size="small"
              value={form.invoice_no}
              onChange={e => handleFormChange('invoice_no', e.target.value)}
              required
              placeholder="e.g. SI-2026-001"
            />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Invoice Date"
                  type="date"
                  size="small"
                  fullWidth
                  value={form.invoice_date}
                  onChange={e => handleFormChange('invoice_date', e.target.value)}
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Amount (PHP)"
                  type="number"
                  size="small"
                  fullWidth
                  value={form.amount}
                  onChange={e => handleFormChange('amount', e.target.value)}
                  required
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Payment Terms</InputLabel>
                  <Select
                    label="Payment Terms"
                    value={form.payment_terms_days}
                    onChange={e => handleFormChange('payment_terms_days', Number(e.target.value))}
                  >
                    {PAYMENT_TERMS_OPTIONS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Due Date"
                  type="date"
                  size="small"
                  fullWidth
                  value={form.due_date}
                  onChange={e => handleFormChange('due_date', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  helperText="Auto-computed; editable"
                />
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="EWT / WHT (PHP)"
                  type="number"
                  size="small"
                  fullWidth
                  value={form.wht_amount}
                  onChange={e => handleFormChange('wht_amount', e.target.value)}
                  inputProps={{ min: 0, step: 0.01 }}
                  helperText="Customer withholding (BIR 2307). Not cash."
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="EWT rate %"
                  type="number"
                  size="small"
                  fullWidth
                  value={form.wht_rate_pct}
                  onChange={e => handleFormChange('wht_rate_pct', e.target.value)}
                  inputProps={{ min: 0, step: 0.01 }}
                  helperText="Optional. 1, 2, or 5 typical."
                />
              </Grid>
            </Grid>

            <FormControl size="small" fullWidth>
              <InputLabel>Bill To</InputLabel>
              <Select
                label="Bill To"
                value={form.bill_to}
                onChange={e => setForm(prev => ({ ...prev, bill_to: e.target.value as BillToKind }))}
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
              value={form.notes}
              onChange={e => handleFormChange('notes', e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceDialog(null)} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveInvoice}
            disabled={saving}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {saving ? 'Saving…' : invoiceDialog === 'add' ? 'Add Invoice' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Record Collection Dialog ──────────────────────────────────────── */}
      <Dialog open={!!collectDialog} onClose={() => setCollectDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Record Collection</DialogTitle>
        <DialogContent>
          {collectDialog && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {collectErr && <Alert severity="error">{collectErr}</Alert>}

              <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="body2" fontWeight={600}>{collectDialog.project_name}</Typography>
                <Typography variant="body2">Invoice: <strong>{collectDialog.invoice_no}</strong></Typography>
                <Stack direction="row" spacing={2} mt={0.5}>
                  <Typography variant="caption" color="text.secondary">Amount: {PHP.format(collectDialog.amount)}</Typography>
                  <Typography variant="caption" color="text.secondary">Due: {collectDialog.due_date}</Typography>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption">Cash received: {PHP.format(invoiceCash(collectDialog))}</Typography>
                {invoiceWht(collectDialog) > 0 && (
                  <Typography variant="caption" display="block">
                    EWT / 2307: {PHP.format(invoiceWht(collectDialog))} (not cash)
                  </Typography>
                )}
                <Typography variant="caption" display="block">
                  Cash still due: <strong>{PHP.format(invoiceCashDue(collectDialog))}</strong>
                </Typography>
              </Box>

              <TextField
                label="Total cash collected (PHP)"
                type="number"
                size="small"
                value={collectForm.amount_collected}
                onChange={e => setCollectForm(prev => ({ ...prev, amount_collected: e.target.value }))}
                inputProps={{ min: 0, step: 0.01, max: collectDialog.amount - invoiceWht(collectDialog) }}
                helperText={`Max cash: ${PHP.format(collectDialog.amount - invoiceWht(collectDialog))} (invoice minus EWT)`}
                required
              />

              <TextField
                label="Collection Date"
                type="date"
                size="small"
                value={collectForm.collection_date}
                onChange={e => setCollectForm(prev => ({ ...prev, collection_date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCollectDialog(null)} disabled={collectSaving}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleRecordCollection}
            disabled={collectSaving}
          >
            {collectSaving ? 'Saving…' : 'Record Collection'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Invoice</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete invoice <strong>{deleteTarget?.invoice_no}</strong> for{' '}
            {deleteTarget && PHP.format(deleteTarget.amount)}? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
