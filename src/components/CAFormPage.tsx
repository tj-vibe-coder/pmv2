import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  Chip,
  LinearProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Tooltip,
  Divider,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import { Add as AddIcon, Check as CheckIcon, Close as CloseIcon, Delete as DeleteIcon, KeyboardArrowDown as ExpandMoreIcon, KeyboardArrowUp as ExpandLessIcon, ReceiptLong as ReceiptLongIcon, RemoveCircleOutline as RemoveIcon, PictureAsPdf as PictureAsPdfIcon, Visibility as VisibilityIcon, PhotoCamera as PhotoCameraIcon, AccountBalanceWallet as WalletIcon } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';
import { INVESTORS, FundingSource } from '../data/financeCategories';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import PdfPreviewDialog from './PdfPreviewDialog';
import { parseReceipt } from '../services/receiptParseService';
import { fileToParseInput, compressForUpload } from '../utils/receipts/imageCompress';
import { isCorporateOneDriveConfigured } from '../config/onedriveConfig';
import { useOneDriveAuth } from '../contexts/OneDriveAuthContext';
import { resolveCorporateDriveId, ensureFolder, uploadFileToFolderById, sanitizeForOneDrive } from '../services/onedriveFolderService';

const CA_CATEGORIES = ['Materials', 'Accommodation', 'Allowance', 'Transportation', 'Entertainment'] as const;

const NET_PACIFIC_COLORS = {
  primary:   '#2c5aa0',
  secondary: '#1e4a72',
  accent1:   '#4f7bc8',
  accent2:   '#3c6ba5',
  success:   '#00b894',
  warning:   '#fdcb6e',
  error:     '#e84393',
  info:      '#74b9ff',
};

interface BreakdownItem {
  _uid: string;
  category: string;
  description: string;
  amount: string;
}

// Receipts come back categorized in the liquidation taxonomy; map to the CA set.
const LIQ_TO_CA_CATEGORY: Record<string, string> = {
  'Tools / Direct': 'Materials',
  'Gas': 'Transportation',
  'Materials': 'Materials',
  'Transportation': 'Transportation',
  'Accommodation': 'Accommodation',
  '3rd Party Labor': 'Materials',
  'Others': 'Allowance',
};

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

interface ProjectOption {
  id: string;
  project_name: string;
  project_no?: string;
}

// What a stored breakdown line looks like after server normalization.
interface BreakdownLine {
  category?: string | null;
  description?: string | null;
  amount?: number;
}

interface CashAdvanceRow {
  id: string;
  ca_no?: string | null;
  user_id: string;
  amount: number;
  balance_remaining: number;
  status: string;
  purpose: string | null;
  // Legacy docs stored a JSON string; server-created docs store the array.
  breakdown: string | BreakdownLine[] | null;
  project_id: string | null;
  project_name?: string | null;
  project_no?: string | null;
  requested_at: number | null;
  approved_at: number | null;
  approved_by: string | null;
  created_at: number;
  updated_at: number;
  username?: string;
  full_name?: string | null;
  fundingSource?: FundingSource;
}

interface LiquidationRow {
  id: string;
  form_no?: string | null;
  date_of_submission?: string | null;
  total_amount?: number;
  status?: string;
  ca_id?: string | null;
  created_at?: number;
}

// Per-employee rollup across all of an employee's approved CAs. Tracks the "still holds
// cash" and "company owes them" amounts SEPARATELY (summed per-CA before combining), rather
// than netting to one number — an employee can simultaneously still be holding cash on one
// CA and be owed a refund on another (an over-liquidated one); netting those together can
// cancel out near zero and hide both facts from the admin reviewing this table.
interface EmployeeCaBalance {
  userId: string;
  name: string;
  approvedCount: number;
  totalApproved: number;
  heldPositive: number; // sum of each approved CA's balance_remaining where it's > 0
  owedNegative: number; // sum of abs(balance_remaining) where it's < 0 (company owes employee)
}

// Parse a stored breakdown regardless of vintage: legacy docs hold a JSON
// string, server-created docs hold the array directly.
function parseBreakdown(raw: CashAdvanceRow['breakdown']): BreakdownLine[] {
  try {
    const b = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? []);
    return Array.isArray(b) ? b : [];
  } catch {
    return [];
  }
}

export default function CAFormPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [list, setList] = useState<CashAdvanceRow[]>([]);
  const [liquidations, setLiquidations] = useState<LiquidationRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [purpose, setPurpose] = useState('');
  const [dateRequested, setDateRequested] = useState(() => new Date().toISOString().slice(0, 10));
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([{ _uid: crypto.randomUUID(), category: 'Materials', description: '', amount: '' }]);
  const [fundingType, setFundingType] = useState<'corporate_bank' | 'investor_outofpocket'>('corporate_bank');
  const [fundingInvestor, setFundingInvestor] = useState('');
  const [linkedInvestmentId, setLinkedInvestmentId] = useState('');
  const [linkedInvestments, setLinkedInvestments] = useState<{ id: string; date: string; category: string; description: string; amount: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CashAdvanceRow | null>(null);
  const [closeTarget, setCloseTarget] = useState<CashAdvanceRow | null>(null);
  const [closing, setClosing] = useState(false);
  // Edit-funding dialog — separate state from the "new request" funding fields above so
  // opening it (for any existing CA, including ones created before this feature shipped)
  // doesn't clobber whatever the admin has mid-typed into the request form.
  const [fundingEditTarget, setFundingEditTarget] = useState<CashAdvanceRow | null>(null);
  const [fundingEditType, setFundingEditType] = useState<'corporate_bank' | 'investor_outofpocket'>('corporate_bank');
  const [fundingEditInvestor, setFundingEditInvestor] = useState('');
  const [fundingEditLinkedId, setFundingEditLinkedId] = useState('');
  const [fundingEditLinkedInvestments, setFundingEditLinkedInvestments] = useState<{ id: string; date: string; category: string; description: string; amount: number }[]>([]);
  const [fundingEditLoadingInvestments, setFundingEditLoadingInvestments] = useState(false);
  const [savingFunding, setSavingFunding] = useState(false);
  // Invalidates any in-flight /api/investments fetch from a previous dialog open or a previous
  // investor selection — without this, a slow response for CA-A (or a previously-picked
  // investor) can resolve after the dialog has moved on to CA-B and silently overwrite its
  // investor/linked-investment state with the wrong data.
  const fundingEditGenRef = useRef(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('');

  const { isAuthenticated: oneDriveSignedIn, getAccessToken: getOneDriveToken } = useOneDriveAuth();
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanRowIdRef = useRef<string | null>(null);
  const pendingReceiptsRef = useRef<Record<string, File>>({});
  const [scanningRowId, setScanningRowId] = useState<string | null>(null);
  const [scanSnackbar, setScanSnackbar] = useState<{ open: boolean; severity: 'success' | 'error' | 'warning'; message: string }>({ open: false, severity: 'success', message: '' });

  const breakdownTotal = breakdown.reduce((sum, r) => sum + (parseFloat(String(r.amount)) || 0), 0);
  const canSubmit = breakdownTotal > 0 && (selectedProject != null || purpose.trim() !== '');

  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  const fetchList = useCallback(async () => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.cash_advances) {
        setList(data.cash_advances);
      } else {
        setError(data.error || 'Failed to load');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
    // Linked liquidations power the per-CA history rows; best-effort.
    try {
      const res = await fetch(`${API_BASE}/api/liquidations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.liquidations) setLiquidations(data.liquidations);
    } catch {
      // table still works without history
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetch(`${API_BASE}/api/projects`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data.map((p: { id: string | number; project_name?: string; project_no?: string }) => ({ id: String(p.id), project_name: p.project_name || '', project_no: p.project_no || '' })));
      })
      .catch(() => {});
  }, []);

  const handleFundingInvestorChange = async (investor: string) => {
    setFundingInvestor(investor);
    setLinkedInvestmentId('');
    setLinkedInvestments([]);
    if (!investor) return;
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/investments`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        const eligible = (data.investments || []).filter((inv: { investor: string; sourceType?: string }) =>
          inv.investor === investor && inv.sourceType !== 'expense_sync'
        );
        setLinkedInvestments(eligible.map((inv: { id: string; date: string; category: string; description: string; amount: number }) => ({
          id: inv.id, date: inv.date, category: inv.category, description: inv.description, amount: Number(inv.amount) || 0,
        })));
      }
    } catch {
      // silent — admin-only endpoint; non-admins just won't see linkable investments
    }
  };

  // `gen` lets a caller (openFundingEdit) reuse a generation it already bumped, so opening a
  // dialog counts as exactly one invalidation event rather than two. A direct call from the
  // Investor <Select> (no `gen` passed) bumps its own, invalidating any earlier in-flight
  // fetch for this same dialog (e.g. the admin switching investors twice quickly).
  const handleFundingEditInvestorChange = async (investor: string, gen?: number) => {
    const myGen = gen ?? ++fundingEditGenRef.current;
    setFundingEditInvestor(investor);
    setFundingEditLinkedId('');
    setFundingEditLinkedInvestments([]);
    if (!investor) return;
    setFundingEditLoadingInvestments(true);
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/investments`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json().catch(() => ({ success: false }));
      if (fundingEditGenRef.current !== myGen) return; // superseded by a newer open/selection
      if (data.success) {
        const eligible = (data.investments || []).filter((inv: { investor: string; sourceType?: string }) =>
          inv.investor === investor && inv.sourceType !== 'expense_sync'
        );
        setFundingEditLinkedInvestments(eligible.map((inv: { id: string; date: string; category: string; description: string; amount: number }) => ({
          id: inv.id, date: inv.date, category: inv.category, description: inv.description, amount: Number(inv.amount) || 0,
        })));
      }
    } catch {
      // silent — admin-only endpoint
    } finally {
      if (fundingEditGenRef.current === myGen) setFundingEditLoadingInvestments(false);
    }
  };

  const openFundingEdit = async (ca: CashAdvanceRow) => {
    const myGen = ++fundingEditGenRef.current; // invalidates any fetch still in flight from a previously-opened CA
    setFundingEditTarget(ca);
    setError(null);
    const fs = ca.fundingSource;
    if (fs && fs.type === 'investor_outofpocket' && fs.investor) {
      setFundingEditType('investor_outofpocket');
      await handleFundingEditInvestorChange(fs.investor, myGen);
      if (fundingEditGenRef.current !== myGen) return; // a newer open superseded this one
      setFundingEditLinkedId(fs.linkedInvestmentId ?? '');
    } else {
      setFundingEditType('corporate_bank');
      setFundingEditInvestor('');
      setFundingEditLinkedId('');
      setFundingEditLinkedInvestments([]);
      setFundingEditLoadingInvestments(false);
    }
  };

  const closeFundingEdit = () => {
    fundingEditGenRef.current++; // invalidate any fetch still in flight for the CA being closed
    setFundingEditTarget(null);
    setError(null);
    setFundingEditType('corporate_bank');
    setFundingEditInvestor('');
    setFundingEditLinkedId('');
    setFundingEditLinkedInvestments([]);
    setFundingEditLoadingInvestments(false);
  };

  const handleSaveFunding = async () => {
    if (!fundingEditTarget) return;
    const token = localStorage.getItem('netpacific_token');
    if (!token) { setError('Session expired — please refresh and sign in again.'); return; }
    const fundingSource: FundingSource = fundingEditType === 'investor_outofpocket' && fundingEditInvestor
      ? { type: 'investor_outofpocket', investor: fundingEditInvestor, ...(fundingEditLinkedId ? { linkedInvestmentId: fundingEditLinkedId } : {}) }
      : { type: 'corporate_bank' };
    setSavingFunding(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances/${fundingEditTarget.id}/funding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fundingSource }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        if (data.syncWarning) {
          setSnackbar(null);
          setError(data.message || 'Funding source saved, but the Investment Tracker link failed to update — please retry.');
        } else {
          setSnackbar('Funding source updated');
          closeFundingEdit();
        }
        fetchList();
      } else {
        setError(data.error || 'Failed to update funding source');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSavingFunding(false);
    }
  };

  const addBreakdownRow = () => setBreakdown((b) => [...b, { _uid: crypto.randomUUID(), category: 'Materials', description: '', amount: '' }]);
  const removeBreakdownRow = (index: number) =>
    setBreakdown((b) => {
      if (b.length <= 1) return b;
      const removed = b[index];
      if (removed && pendingReceiptsRef.current[removed._uid]) delete pendingReceiptsRef.current[removed._uid];
      return b.filter((_, i) => i !== index);
    });
  const updateBreakdown = (index: number, field: 'category' | 'description' | 'amount', value: string) =>
    setBreakdown((b) => b.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const triggerScan = (uid: string) => {
    scanRowIdRef.current = uid;
    scanInputRef.current?.click();
  };

  const handleScanInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const rowId = scanRowIdRef.current;
    e.target.value = '';
    if (!file || !rowId) return;
    setScanningRowId(rowId);
    const safeFile = await convertHeicToJpeg(file);
    pendingReceiptsRef.current[rowId] = safeFile;
    try {
      const { imageBase64, mimeType } = await fileToParseInput(safeFile);
      const parsed = await parseReceipt(imageBase64, mimeType);
      setBreakdown((prev) => prev.map((r) => {
        if (r._uid !== rowId) return r;
        const amt = parsed.total ?? parsed.subtotal;
        const mapped = parsed.suggestedCategory ? (LIQ_TO_CA_CATEGORY[parsed.suggestedCategory] || 'Materials') : r.category;
        return {
          ...r,
          category: mapped,
          amount: (typeof amt === 'number' && amt > 0) ? String(amt) : r.amount,
          description: (!r.description || r.description.trim() === '')
            ? (parsed.vendor || parsed.lineItems?.[0]?.description || '')
            : r.description,
        };
      }));
      const shown = parsed.total ?? parsed.subtotal ?? 0;
      const lowConf = typeof parsed.confidence === 'number' && parsed.confidence < 0.5;
      const pct = typeof parsed.confidence === 'number' ? Math.round(parsed.confidence * 100) : null;
      if (lowConf) {
        setScanSnackbar({ open: true, severity: 'warning', message: `Low confidence${pct !== null ? ` (${pct}%)` : ''} — please verify amount, date & category. Parsed: ${parsed.vendor || 'Unknown vendor'} (PHP ${Number(shown).toLocaleString('en-PH', { minimumFractionDigits: 2 })})` });
      } else {
        setScanSnackbar({ open: true, severity: 'success', message: `Parsed: ${parsed.vendor || 'Unknown vendor'} (PHP ${Number(shown).toLocaleString('en-PH', { minimumFractionDigits: 2 })})` });
      }
    } catch (err) {
      setScanSnackbar({ open: true, severity: 'error', message: err instanceof Error ? err.message : 'Failed to parse receipt' });
    } finally {
      setScanningRowId((prev) => (prev === rowId ? null : prev));
      if (scanRowIdRef.current === rowId) scanRowIdRef.current = null;
    }
  };

  // Best-effort: after the CA is created and has a ca_no, push the held receipt
  // photos to OneDrive under `Cash Advance Receipts/{year}/{ca_no}/`. Never
  // blocks or fails CA creation.
  const uploadPendingReceipts = (caNo: string, files: File[]) => {
    if (!caNo || files.length === 0) return;
    void (async () => {
      try {
        if (!isCorporateOneDriveConfigured() || !oneDriveSignedIn) return;
        const odToken = await getOneDriveToken();
        if (!odToken) return;
        const driveId = await resolveCorporateDriveId(odToken);
        const year = String(new Date().getFullYear());
        await ensureFolder(odToken, driveId, '', 'Cash Advance Receipts');
        await ensureFolder(odToken, driveId, 'Cash Advance Receipts', year);
        const folder = await ensureFolder(odToken, driveId, `Cash Advance Receipts/${year}`, sanitizeForOneDrive(caNo));
        if (!folder?.id) return;
        await Promise.all(files.map(async (f, i) => {
          const blob = await compressForUpload(f);
          const uploadName = `${i + 1}_${sanitizeForOneDrive(f.name)}`;
          await uploadFileToFolderById(odToken, driveId, folder.id, uploadName, blob);
        }));
      } catch (err) {
        console.warn('[OneDrive] CA receipt upload failed (CA created successfully):', err);
      }
    })();
  };

  const buildCAFormPdf = (data: {
    projectName: string;
    dateRequested: string;
    breakdownRows: { category: string; description: string; amount: number }[];
    total: number;
    title?: string;
    preparedByName: string;
    documentNo?: string;
    previousCAs?: { id: string; amount: number; balance_remaining: number; requested_at?: number | null }[];
  }) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 16;
    const pageWidth = 210;
    const pageHeight = 297;
    let y = 18;
    const lineH = 6;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(data.title || 'Cash Advance Request', pageWidth / 2, y, { align: 'center' });
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Project: ${(data.projectName || '—').trim()}`, margin, y);
    y += lineH;
    doc.text(`Date Requested: ${(data.dateRequested || '—').trim()}`, margin, y);
    y += lineH;

    const previousCAs = data.previousCAs?.filter((ca) => Number(ca.balance_remaining) > 0) ?? [];
    if (previousCAs.length > 0) {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Previous CA details', margin, y);
      y += lineH;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      previousCAs.forEach((ca) => {
        const reqDate = ca.requested_at ? new Date(ca.requested_at * 1000).toLocaleDateString() : '—';
        doc.text(`${ca.id}: Date ${reqDate} | Amount PHP ${Number(ca.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} | Balance remaining PHP ${Number(ca.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, margin, y);
        y += lineH - 1;
      });
      y += lineH + 2;
      doc.setFont('helvetica', 'normal');
    } else {
      y += 4;
    }

    const body = data.breakdownRows.length > 0
      ? data.breakdownRows.map((r) => [
          r.category || '—',
          (r.description || '—').trim() || '—',
          r.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 }),
        ])
      : [['—', '—', '0.00']];
    autoTable(doc, {
      head: [['Category', 'Details', 'Amount']],
      body,
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: pageWidth - margin * 2,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [44, 90, 160] },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (docWithTable.lastAutoTable?.finalY ?? y) + 8;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Amount: ${data.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const sigY = pageHeight - 36;
    doc.text('Prepared by:', margin, sigY);
    doc.text((data.preparedByName || '').trim() || '—', margin, sigY + 6);
    doc.line(margin, sigY + 8, margin + 50, sigY + 8);
    doc.text('Approved by:', pageWidth - margin - 50, sigY);
    doc.line(pageWidth - margin - 50, sigY + 8, pageWidth - margin, sigY + 8);

    const footerY = pageHeight - 10;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Document No.: ${data.documentNo ?? '—'}`, margin, footerY);
    const totalPages = doc.getNumberOfPages();
    if (totalPages > 1) {
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.text(`Document No.: ${data.documentNo ?? '—'}`, margin, footerY);
        doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
      }
    }

    return doc;
  };

  const preparedByName = (user?.full_name?.trim() || user?.username || '').trim() || '—';

  const previousApprovedWithBalance = list.filter(
    (ca) => ca.status === 'approved' && Number(ca.balance_remaining) > 0
  );

  // Answers "does this person still hold unliquidated cash, or has their liquidation
  // exceeded what they were advanced (company owes them the difference)?" balance_remaining
  // is server-authoritative (see PATCH /approve and the liquidation submit/revision paths),
  // so this only sums it — it never re-derives the number from liquidations itself.
  const employeeBalances = useMemo<EmployeeCaBalance[]>(() => {
    const byUser = new Map<string, EmployeeCaBalance>();
    for (const ca of list) {
      if (ca.status !== 'approved') continue;
      const key = String(ca.user_id);
      const name = ca.full_name?.trim() || ca.username || key;
      const bal = Number(ca.balance_remaining) || 0;
      const existing = byUser.get(key);
      if (existing) {
        existing.approvedCount += 1;
        existing.totalApproved += Number(ca.amount) || 0;
        existing.heldPositive += Math.max(0, bal);
        existing.owedNegative += Math.max(0, -bal);
      } else {
        byUser.set(key, {
          userId: key,
          name,
          approvedCount: 1,
          totalApproved: Number(ca.amount) || 0,
          heldPositive: Math.max(0, bal),
          owedNegative: Math.max(0, -bal),
        });
      }
    }
    // Settled employees (nothing held, nothing owed) add no value here — only surface who
    // still has something open, biggest total exposure first.
    return Array.from(byUser.values())
      .filter((b) => b.heldPositive > 0.005 || b.owedNegative > 0.005)
      .sort((a, b) => (b.heldPositive + b.owedNegative) - (a.heldPositive + a.owedNegative));
  }, [list]);
  const visibleEmployeeBalances = isAdmin
    ? employeeBalances
    : employeeBalances.filter((b) => b.userId === String(user?.id));
  const totalOutstandingHeld = employeeBalances.reduce((s, b) => s + b.heldPositive, 0);
  const totalCompanyOwes = employeeBalances.reduce((s, b) => s + b.owedNegative, 0);

  const exportCurrentFormToPDF = () => {
    if (breakdownTotal <= 0) {
      setError('Add breakdown lines before exporting.');
      return;
    }
    const items = breakdown
      .map((r) => ({
        category: r.category || '—',
        description: r.description.trim(),
        amount: parseFloat(String(r.amount)) || 0,
      }))
      .filter((r) => r.amount > 0);
    const doc = buildCAFormPdf({
      projectName: selectedProject?.project_name || (purpose.trim() ? `${purpose.trim()} (prospect)` : ''),
      dateRequested,
      breakdownRows: items.length > 0 ? items : [{ category: '—', description: '—', amount: breakdownTotal }],
      total: breakdownTotal,
      preparedByName,
      documentNo: `${(selectedProject?.project_no || 'Prospect').trim() || 'Prospect'}-CA-Draft`,
      previousCAs: previousApprovedWithBalance.map((ca) => ({
        id: ca.ca_no || ca.id,
        amount: ca.amount,
        balance_remaining: ca.balance_remaining,
        requested_at: ca.requested_at,
      })),
    });
    doc.save(`${(selectedProject?.project_no || 'Prospect').trim() || 'Prospect'}-CA-Draft_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePreviewCurrentForm = () => {
    if (breakdownTotal <= 0) {
      setError('Add breakdown lines before preview.');
      return;
    }
    const items = breakdown
      .map((r) => ({
        category: r.category || '—',
        description: r.description.trim(),
        amount: parseFloat(String(r.amount)) || 0,
      }))
      .filter((r) => r.amount > 0);
    const doc = buildCAFormPdf({
      projectName: selectedProject?.project_name || (purpose.trim() ? `${purpose.trim()} (prospect)` : ''),
      dateRequested,
      breakdownRows: items.length > 0 ? items : [{ category: '—', description: '—', amount: breakdownTotal }],
      total: breakdownTotal,
      preparedByName,
      documentNo: `${(selectedProject?.project_no || 'Prospect').trim() || 'Prospect'}-CA-Draft`,
      previousCAs: previousApprovedWithBalance.map((ca) => ({
        id: ca.ca_no || ca.id,
        amount: ca.amount,
        balance_remaining: ca.balance_remaining,
        requested_at: ca.requested_at,
      })),
    });
    const blob = doc.output('blob') as Blob;
    setPdfPreviewBlob(blob);
    setPdfPreviewTitle('Cash Advance Request – Preview');
    setPdfPreviewOpen(true);
  };

  const exportCARowToPDF = (ca: CashAdvanceRow) => {
    let breakdownRows = parseBreakdown(ca.breakdown).map((r) => ({
      category: String(r.category ?? '—'),
      description: String(r.description ?? ''),
      amount: Number(r.amount ?? 0),
    }));
    if (breakdownRows.length === 0) breakdownRows = [{ category: '—', description: '—', amount: Number(ca.amount) || 0 }];
    const requestedDate = ca.requested_at
      ? new Date(ca.requested_at * 1000).toISOString().slice(0, 10)
      : ca.created_at
        ? new Date(ca.created_at * 1000).toISOString().slice(0, 10)
        : '—';
    const previousOthers = list.filter(
      (c) => c.status === 'approved' && Number(c.balance_remaining) > 0 && c.id !== ca.id
    );
    const doc = buildCAFormPdf({
      projectName: ca.project_name || (ca.purpose ? `${ca.purpose} (prospect)` : ''),
      dateRequested: requestedDate,
      breakdownRows,
      total: Number(ca.amount) || 0,
      title: `Cash Advance Request ${ca.ca_no || '#' + ca.id}`,
      preparedByName: (ca.full_name?.trim() || ca.username || '').trim() || '—',
      documentNo: ca.ca_no || `${(ca.project_no || '—').trim() || '—'}-CA-${String(ca.id).padStart(3, '0')}`,
      previousCAs: previousOthers.map((c) => ({
        id: c.ca_no || c.id,
        amount: c.amount,
        balance_remaining: c.balance_remaining,
        requested_at: c.requested_at,
      })),
    });
    doc.save(ca.ca_no ? `${ca.ca_no}.pdf` : `Cash_Advance_${ca.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleRequest = async () => {
    if (breakdownTotal <= 0) {
      setError('Add at least one breakdown line with an amount');
      return;
    }
    if (!selectedProject && !purpose.trim()) {
      setError('Select a project or describe the purpose/prospect');
      return;
    }
    const items = breakdown
      .map((r) => ({
        category: r.category || 'Materials',
        description: r.description.trim(),
        amount: parseFloat(String(r.amount)) || 0,
      }))
      .filter((r) => r.amount > 0);
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    const fundingSource: FundingSource | undefined = fundingType === 'investor_outofpocket' && fundingInvestor
      ? { type: 'investor_outofpocket', investor: fundingInvestor, ...(linkedInvestmentId ? { linkedInvestmentId } : {}) }
      : undefined;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount: breakdownTotal,
          project_id: selectedProject?.id ?? null,
          purpose: purpose.trim() || undefined,
          date_requested: dateRequested || undefined,
          breakdown: items.length > 0 ? items : undefined,
          ...(fundingSource ? { fundingSource } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        const heldFiles = Object.values(pendingReceiptsRef.current);
        pendingReceiptsRef.current = {};
        if (data.ca_no) uploadPendingReceipts(String(data.ca_no), heldFiles);
        setDateRequested(new Date().toISOString().slice(0, 10));
        setSelectedProject(null);
        setPurpose('');
        setBreakdown([{ _uid: crypto.randomUUID(), category: 'Materials', description: '', amount: '' }]);
        setFundingType('corporate_bank');
        setFundingInvestor('');
        setLinkedInvestmentId('');
        setLinkedInvestments([]);
        setSnackbar(data.ca_no ? `Cash advance ${data.ca_no} requested` : 'Cash advance requested');
        fetchList();
      } else {
        setError(data.error || 'Request failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveReject = async (id: string, status: 'approved' | 'rejected') => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setActionId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setSnackbar(status === 'approved' ? 'Cash advance approved' : 'Cash advance rejected');
        fetchList();
      } else setError(data.error || 'Action failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (ca: CashAdvanceRow) => {
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setActionId(ca.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances/${ca.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setSnackbar(`Deleted ${ca.ca_no || 'cash advance'}`);
        fetchList();
      } else setError(data.error || 'Delete failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setActionId(null);
      setConfirmDelete(null);
    }
  };

  const handleClose = async (closureType: 'returned' | 'written_off') => {
    if (!closeTarget) return;
    const token = localStorage.getItem('netpacific_token');
    if (!token) return;
    setClosing(true);
    try {
      const res = await fetch(`${API_BASE}/api/cash-advances/${closeTarget.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ closureType }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setSnackbar(data.message || 'Cash advance closed');
        setCloseTarget(null);
        fetchList();
      } else setError(data.error || 'Close failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setClosing(false);
    }
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Cash Advance (CA) Form
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Request a cash advance. Once approved, you can use it when submitting a liquidation; the liquidation amount will reduce your CA balance.
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3, border: '1px solid #e0e0e0', borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: NET_PACIFIC_COLORS.primary }}>
          Request Cash Advance
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start', mb: 2 }}>
          <Autocomplete
            size="small"
            options={projects}
            getOptionLabel={(p) => p.project_name || ''}
            value={selectedProject}
            onChange={(_, v) => setSelectedProject(v)}
            renderInput={(params) => <TextField {...params} label="Project" placeholder="Select project (optional for prospects)" />}
            sx={{ minWidth: 280 }}
          />
          <TextField
            size="small"
            label="Date requested"
            type="date"
            value={dateRequested}
            onChange={(e) => setDateRequested(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          {!selectedProject && (
            <TextField
              size="small"
              label="Purpose / prospect"
              required
              placeholder="e.g. Site survey for prospective quotation — Client X"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              helperText="No project yet? Describe what this CA is for."
              sx={{ minWidth: 320, flex: 1 }}
            />
          )}
        </Box>

        {isAdmin && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: NET_PACIFIC_COLORS.primary }}>
              Funded By
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Applies once this CA is approved. Link it to an Investment Tracker entry the same way an out-of-pocket expense is linked. Admin-only — which investor is fronting a CA is decided at approval, not by the requester.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start', mb: 2 }}>
              <TextField
                select
                size="small"
                label="Paid From"
                value={fundingType}
                sx={{ minWidth: 220 }}
                onChange={(e) => {
                  const v = e.target.value as 'corporate_bank' | 'investor_outofpocket';
                  setFundingType(v);
                  if (v !== 'investor_outofpocket') { setFundingInvestor(''); setLinkedInvestmentId(''); setLinkedInvestments([]); }
                }}
              >
                <MenuItem value="corporate_bank">Corporate Bank Account</MenuItem>
                <MenuItem value="investor_outofpocket">Investor (Out-of-Pocket)</MenuItem>
              </TextField>
              {fundingType === 'investor_outofpocket' && (
                <TextField
                  select
                  size="small"
                  label="Investor"
                  value={fundingInvestor}
                  sx={{ minWidth: 220 }}
                  onChange={(e) => handleFundingInvestorChange(e.target.value)}
                >
                  <MenuItem value="">— Select investor —</MenuItem>
                  {INVESTORS.map((inv) => <MenuItem key={inv} value={inv}>{inv}</MenuItem>)}
                </TextField>
              )}
              {fundingType === 'investor_outofpocket' && fundingInvestor && linkedInvestments.length > 0 && (
                <TextField
                  select
                  size="small"
                  label="Link to Existing Investment (Optional)"
                  value={linkedInvestmentId}
                  sx={{ minWidth: 280 }}
                  onChange={(e) => setLinkedInvestmentId(e.target.value)}
                >
                  <MenuItem value="">— New investment entry —</MenuItem>
                  {linkedInvestments.map((inv) => (
                    <MenuItem key={inv.id} value={inv.id}>
                      {inv.date} · {inv.category} · {inv.description || '—'} · {inv.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Box>
          </>
        )}

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: NET_PACIFIC_COLORS.primary }}>
          Breakdown by category (add child lines under Materials for item breakdown; amount is auto-computed)
        </Typography>
        <TableContainer component={Box} sx={{ border: '1px solid #e0e0e0', borderRadius: 1, mb: 2, maxWidth: 640 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: NET_PACIFIC_COLORS.primary + '08' }}>
                <TableCell sx={{ fontWeight: 600, width: 160 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Details</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 120 }} align="right">Amount</TableCell>
                <TableCell sx={{ width: 96 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {breakdown.map((row, idx) => (
                <TableRow key={row._uid}>
                  <TableCell sx={{ py: 0.5 }}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Category</InputLabel>
                      <Select
                        value={row.category || 'Materials'}
                        label="Category"
                        onChange={(e) => updateBreakdown(idx, 'category', e.target.value)}
                      >
                        {CA_CATEGORIES.map((c) => (
                          <MenuItem key={c} value={c}>{c}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder={row.category === 'Materials' ? 'e.g. Cement, steel (child items)' : 'Optional'}
                      value={row.description}
                      onChange={(e) => updateBreakdown(idx, 'description', e.target.value)}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }} align="right">
                    <TextField
                      size="small"
                      type="number"
                      inputProps={{ min: 0, step: 0.01 }}
                      placeholder="0"
                      value={row.amount}
                      onChange={(e) => updateBreakdown(idx, 'amount', e.target.value)}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.5, whiteSpace: 'nowrap' }}>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => triggerScan(row._uid)}
                      disabled={scanningRowId === row._uid}
                      title="Scan receipt with AI"
                    >
                      {scanningRowId === row._uid ? <CircularProgress size={18} /> : <PhotoCameraIcon fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" onClick={() => removeBreakdownRow(idx)} disabled={breakdown.length <= 1} color="error">
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button size="small" startIcon={<AddIcon />} onClick={addBreakdownRow} sx={{ color: NET_PACIFIC_COLORS.primary }}>
            Add line
          </Button>
          <Typography variant="body2" color="text.secondary">
            Total amount: {breakdownTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<VisibilityIcon />}
            onClick={handlePreviewCurrentForm}
            disabled={!canSubmit}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Preview PDF
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={exportCurrentFormToPDF}
            disabled={!canSubmit}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Export to PDF (for signing)
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleRequest}
            disabled={submitting || !canSubmit || scanningRowId !== null}
            sx={{ bgcolor: NET_PACIFIC_COLORS.primary, '&:hover': { bgcolor: NET_PACIFIC_COLORS.secondary } }}
          >
            Request CA
          </Button>
        </Box>
      </Paper>

      {!loading && visibleEmployeeBalances.length > 0 && (
        isAdmin ? (
          <Paper sx={{ mb: 3, borderRadius: 2, overflow: 'hidden', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
              <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                Cash Advance Balances by Employee
              </Typography>
            </Box>
            <Box sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1.5 }}>
                <Typography variant="body2">
                  Held by employees (still to liquidate):{' '}
                  <strong>{totalOutstandingHeld.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                </Typography>
                {totalCompanyOwes > 0 && (
                  <Typography variant="body2" sx={{ color: 'error.main' }}>
                    Company owes employees (over-liquidated):{' '}
                    <strong>{totalCompanyOwes.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                  </Typography>
                )}
              </Box>
              <TableContainer>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Employee</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Approved CAs</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Total Approved</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Holds Unliquidated</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Company Owes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleEmployeeBalances.map((b) => (
                      <TableRow key={b.userId} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{b.name}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }} align="right">{b.approvedCount}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }} align="right">{b.totalApproved.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: b.heldPositive > 0 ? 600 : undefined, color: b.heldPositive > 0 ? 'warning.main' : 'text.disabled' }}>
                          {b.heldPositive > 0 ? b.heldPositive.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: b.owedNegative > 0 ? 600 : undefined, color: b.owedNegative > 0 ? 'error.main' : 'text.disabled' }}>
                          {b.owedNegative > 0 ? b.owedNegative.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Paper>
        ) : (
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            {(() => {
              const b = visibleEmployeeBalances[0];
              const fmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
              return (
                <>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ height: '100%', background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Approved CAs</Typography>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{b.approvedCount}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>with open balance</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ height: '100%', background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Approved</Typography>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{fmt(b.totalApproved)}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>sum of approved CAs</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ height: '100%', background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Holds Unliquidated</Typography>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{b.heldPositive > 0 ? fmt(b.heldPositive) : '—'}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>still to liquidate</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ height: '100%', background: b.owedNegative > 0 ? 'linear-gradient(135deg, #e53935 0%, #ef9a9a 100%)' : `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Company Owes</Typography>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{b.owedNegative > 0 ? fmt(b.owedNegative) : '—'}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>over-liquidated</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </>
              );
            })()}
          </Grid>
        )
      )}

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: NET_PACIFIC_COLORS.primary }}>
        {isAdmin ? 'All CA requests (monitor and approve)' : 'My CA requests'}
      </Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: NET_PACIFIC_COLORS.primary + '12' }}>
                <TableCell sx={{ width: 36 }} />
                <TableCell sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>CA No.</TableCell>
                {isAdmin && (
                  <>
                    <TableCell sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>Full name</TableCell>
                  </>
                )}
                <TableCell sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>Balance</TableCell>
                <TableCell sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>Project</TableCell>
                <TableCell sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>Breakdown</TableCell>
                <TableCell sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>Requested</TableCell>
                <TableCell sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 11 : 9} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No cash advance requests yet.
                  </TableCell>
                </TableRow>
              ) : (
                list.map((ca) => {
                  // Drafts aren't finalized yet (still editable/discardable by the owner), so
                  // only submitted (pending-review) liquidations count as "linked" to a CA.
                  const linkedLiqs = liquidations.filter((l) => l.ca_id === ca.id && l.status === 'submitted');
                  const liquidatedTotal = linkedLiqs.reduce((s, l) => s + (Number(l.total_amount) || 0), 0);
                  const expanded = expandedId === ca.id;
                  return (
                  <React.Fragment key={ca.id}>
                  <TableRow hover>
                    <TableCell sx={{ py: 0, whiteSpace: 'nowrap' }}>
                      <IconButton
                        size="small"
                        onClick={() => setExpandedId(expanded ? null : ca.id)}
                        title={expanded ? 'Hide liquidations' : `Show liquidations (${linkedLiqs.length})`}
                      >
                        {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                      {linkedLiqs.length > 0 && (
                        <Chip
                          size="small"
                          label={linkedLiqs.length}
                          color="info"
                          sx={{ height: 18, fontSize: '0.7rem', '& .MuiChip-label': { px: 0.75 } }}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {ca.ca_no || (
                        <Tooltip title={`Internal ID: ${ca.id}`}>
                          <span style={{ color: '#888' }}>{ca.id.slice(0, 8)}…</span>
                        </Tooltip>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <>
                        <TableCell>{ca.username || '—'}</TableCell>
                        <TableCell>{ca.full_name || '—'}</TableCell>
                      </>
                    )}
                    <TableCell>{Number(ca.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell sx={Number(ca.balance_remaining) < 0 ? { color: 'error.main', fontWeight: 600 } : undefined}>
                      {Number(ca.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      {Number(ca.amount) > 0 && (
                        <Tooltip title={`${Math.round(Math.min(100, Math.max(0, ((Number(ca.amount) - Number(ca.balance_remaining)) / Number(ca.amount)) * 100)))}% consumed`}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(100, Math.max(0, ((Number(ca.amount) - Number(ca.balance_remaining)) / Number(ca.amount)) * 100))}
                            sx={{ mt: 0.5, height: 5, borderRadius: 3 }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      {ca.project_name
                        || (ca.purpose ? (
                          <Tooltip title="No project yet — prospect / out-of-project CA">
                            <em style={{ color: '#666' }}>{ca.purpose}</em>
                          </Tooltip>
                        ) : ca.project_id ? `#${ca.project_id}` : '—')}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220, whiteSpace: 'pre-wrap' }}>
                      {(() => {
                        const b = parseBreakdown(ca.breakdown);
                        if (b.length === 0) return '—';
                        return b.map((r) => {
                          const cat = (r.category || '').trim();
                          const desc = (r.description || '').trim();
                          const part = cat && desc ? `${cat} – ${desc}` : cat || desc || '—';
                          return `${part}: ${Number(r.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
                        }).join('\n');
                      })()}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={ca.status}
                        color={ca.status === 'approved' ? 'success' : ca.status === 'rejected' ? 'error' : 'default'}
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell>
                      {ca.requested_at
                        ? new Date(ca.requested_at * 1000).toLocaleDateString()
                        : ca.created_at
                        ? new Date(ca.created_at * 1000).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {isAdmin && ca.status === 'pending' && (
                        <>
                          <Button
                            size="small"
                            startIcon={<CheckIcon />}
                            color="success"
                            onClick={() => handleApproveReject(ca.id, 'approved')}
                            disabled={actionId === ca.id}
                            sx={{ mr: 0.5 }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            startIcon={<CloseIcon />}
                            color="error"
                            onClick={() => handleApproveReject(ca.id, 'rejected')}
                            disabled={actionId === ca.id}
                            sx={{ mr: 0.5 }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {ca.status === 'approved' && Number(ca.balance_remaining) > 0 && (
                        <Button
                          size="small"
                          startIcon={<ReceiptLongIcon />}
                          onClick={() => navigate(`${location.pathname.replace(/\/ca-form\/?$/, '/liquidation-form')}?ca_id=${ca.id}`)}
                          sx={{ color: NET_PACIFIC_COLORS.primary, mr: 0.5 }}
                          title="Submit a liquidation against this CA"
                        >
                          Liquidate
                        </Button>
                      )}
                      {isAdmin && ca.status === 'approved' && Number(ca.balance_remaining) > 0 && (
                        <Button
                          size="small"
                          startIcon={<WalletIcon />}
                          onClick={() => setCloseTarget(ca)}
                          sx={{ color: NET_PACIFIC_COLORS.primary, mr: 0.5 }}
                          title="Close out this CA's remaining unused balance"
                        >
                          Close &amp; Settle
                        </Button>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => exportCARowToPDF(ca)}
                        title="Export to PDF (for signing)"
                        sx={{ color: NET_PACIFIC_COLORS.primary, ml: 0.5 }}
                      >
                        <PictureAsPdfIcon fontSize="small" />
                      </IconButton>
                      {isAdmin && ca.status !== 'rejected' && (
                        <IconButton
                          size="small"
                          onClick={() => openFundingEdit(ca)}
                          title={ca.fundingSource?.type === 'investor_outofpocket' ? `Funded by ${ca.fundingSource.investor} (out-of-pocket) — edit` : 'Edit funding source / link to Investment Tracker'}
                          sx={{ color: ca.fundingSource?.type === 'investor_outofpocket' ? 'info.main' : NET_PACIFIC_COLORS.primary, ml: 0.5 }}
                        >
                          <WalletIcon fontSize="small" />
                        </IconButton>
                      )}
                      {(isAdmin || (ca.status === 'pending' && String(ca.user_id) === String(user?.id))) && (
                        <Button
                          size="small"
                          startIcon={<DeleteIcon />}
                          color="error"
                          variant="outlined"
                          onClick={() => setConfirmDelete(ca)}
                          disabled={actionId === ca.id}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 11 : 9} sx={{ py: 0, border: expanded ? undefined : 0 }}>
                      <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 1.5, pl: 6 }}>
                          {linkedLiqs.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              No liquidations linked to this CA yet.
                            </Typography>
                          ) : (
                            <>
                              <Typography variant="caption" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, display: 'block', mb: 0.5 }}>
                                Liquidated {liquidatedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} of {Number(ca.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </Typography>
                              {linkedLiqs.map((l) => (
                                <Typography key={l.id} variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                  {l.form_no || l.id} · {l.date_of_submission || (l.created_at ? new Date(l.created_at * 1000).toLocaleDateString() : '—')} · ₱{Number(l.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} · {l.status || '—'}
                                </Typography>
                              ))}
                            </>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                  </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <PdfPreviewDialog
        open={pdfPreviewOpen}
        onClose={() => { setPdfPreviewOpen(false); setPdfPreviewBlob(null); setPdfPreviewTitle(''); }}
        pdfBlob={pdfPreviewBlob}
        title={pdfPreviewTitle}
      />
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete {confirmDelete?.ca_no || 'cash advance'}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmDelete?.status === 'approved' || confirmDelete?.status === 'rejected'
              ? `This request is already ${confirmDelete.status}. Delete the record anyway? This cannot be undone.`
              : 'Delete this cash advance request? This cannot be undone.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => confirmDelete && handleDelete(confirmDelete)}
            disabled={!!actionId}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!closeTarget} onClose={() => setCloseTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Close &amp; Settle — {closeTarget?.ca_no || closeTarget?.id}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {closeTarget?.full_name || closeTarget?.username || 'This employee'} still holds an unused balance of{' '}
            <strong>
              ₱{closeTarget ? Number(closeTarget.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}
            </strong>{' '}
            on this cash advance. Choose how to settle it.
          </DialogContentText>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Cash Returned</strong> — Employee physically returned the unused cash.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Write Off</strong> — Absorb the shortfall as a company cost (no cash physically returned).
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCloseTarget(null)} disabled={closing}>Cancel</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => handleClose('written_off')}
            disabled={closing}
          >
            Write Off
          </Button>
          <Button
            color="success"
            variant="contained"
            onClick={() => handleClose('returned')}
            disabled={closing}
          >
            Cash Returned
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!fundingEditTarget} onClose={closeFundingEdit} maxWidth="sm" fullWidth>
        <DialogTitle>
          Funding Source — {fundingEditTarget?.ca_no || fundingEditTarget?.id}
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {fundingEditTarget?.status === 'approved'
              ? "Applies immediately — links (or unlinks) this CA's Investment Tracker entry now, dated to its original approval."
              : 'This CA is still pending, so nothing is linked yet. The funding source you pick here takes effect automatically once it’s approved.'}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              select
              size="small"
              label="Paid From"
              value={fundingEditType}
              fullWidth
              onChange={(e) => {
                const v = e.target.value as 'corporate_bank' | 'investor_outofpocket';
                setFundingEditType(v);
                if (v !== 'investor_outofpocket') { setFundingEditInvestor(''); setFundingEditLinkedId(''); setFundingEditLinkedInvestments([]); }
              }}
            >
              <MenuItem value="corporate_bank">Corporate Bank Account</MenuItem>
              <MenuItem value="investor_outofpocket">Investor (Out-of-Pocket)</MenuItem>
            </TextField>
            {fundingEditType === 'investor_outofpocket' && (
              <TextField
                select
                size="small"
                label="Investor"
                value={fundingEditInvestor}
                fullWidth
                onChange={(e) => handleFundingEditInvestorChange(e.target.value)}
              >
                <MenuItem value="">— Select investor —</MenuItem>
                {INVESTORS.map((inv) => <MenuItem key={inv} value={inv}>{inv}</MenuItem>)}
              </TextField>
            )}
            {fundingEditType === 'investor_outofpocket' && fundingEditInvestor && fundingEditLoadingInvestments && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                <CircularProgress size={16} />
                <Typography variant="caption">Loading this investor's linkable investments…</Typography>
              </Box>
            )}
            {fundingEditType === 'investor_outofpocket' && fundingEditInvestor && !fundingEditLoadingInvestments && fundingEditLinkedInvestments.length > 0 && (
              <TextField
                select
                size="small"
                label="Link to Existing Investment (Optional)"
                value={fundingEditLinkedId}
                fullWidth
                onChange={(e) => setFundingEditLinkedId(e.target.value)}
              >
                <MenuItem value="">— New investment entry —</MenuItem>
                {fundingEditLinkedInvestments.map((inv) => (
                  <MenuItem key={inv.id} value={inv.id}>
                    {inv.date} · {inv.category} · {inv.description || '—'} · {inv.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeFundingEdit} disabled={savingFunding}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveFunding}
            disabled={savingFunding || fundingEditLoadingInvestments || (fundingEditType === 'investor_outofpocket' && !fundingEditInvestor)}
            sx={{ bgcolor: NET_PACIFIC_COLORS.primary, '&:hover': { bgcolor: NET_PACIFIC_COLORS.secondary } }}
          >
            {savingFunding ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
      <input
        type="file"
        ref={scanInputRef}
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleScanInputChange}
      />
      <Snackbar
        open={scanSnackbar.open}
        autoHideDuration={5000}
        onClose={() => setScanSnackbar((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
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
      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert onClose={() => setSnackbar(null)} severity="success" variant="filled" sx={{ width: '100%' }}>
            {snackbar}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
