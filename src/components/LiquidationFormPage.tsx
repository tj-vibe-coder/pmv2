import React, { useState, useEffect, useRef } from 'react';
import {
  Alert,
  Badge,
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Button,
  Chip,
  CircularProgress,
  Select,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Tooltip,
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import { Add as AddIcon, AttachFile as AttachFileIcon, CloudDone as CloudDoneIcon, CloudOff as CloudOffIcon, Delete as DeleteIcon, ErrorOutline as ErrorOutlineIcon, FileDownload as ExportIcon, FileUpload as ImportIcon, OpenInNew as OpenInNewIcon, Save as SaveIcon, Send as SendIcon, PictureAsPdf as PictureAsPdfIcon, PhotoCamera as PhotoCameraIcon } from '@mui/icons-material';
import { useOneDriveAuth } from '../contexts/OneDriveAuthContext';
import { isCorporateOneDriveConfigured } from '../config/onedriveConfig';
import {
  ensureFolder,
  fetchDriveItemBlob,
  resolveCorporateDriveId,
  sanitizeForOneDrive,
  uploadFileToFolderById,
} from '../services/onedriveFolderService';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import dataService from '../services/dataService';
import { Project } from '../types/Project';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';
import { fileToParseInput } from '../utils/receipts/imageCompress';
import { parseReceipt } from '../services/receiptParseService';
import { arialNarrowBase64 } from '../fonts/arialNarrowBase64';

const LIQUIDATION_CATEGORIES = [
  'Tools / Direct',
  'Gas',
  'Materials',
  'Transportation',
  'Accommodation',
  '3rd Party Labor',
  'Others',
] as const;

interface LiquidationRow {
  id: string;
  date: string;
  category: string;
  projectId: string | '';
  projectName: string;
  projectNo: string;
  particulars: string;
  amount: number;
  remarks: string;
}

// A scanned/photographed receipt attached to an expense row. Files live in
// OneDrive under `Liquidation Receipts/{year}/{form_no}/`; the liquidation doc
// stores only these references (as receipts_json). `file`/`uploadStatus` are
// session-only and never persisted.
interface ReceiptAttachment {
  id: string;
  rowId: string;
  filename: string;
  oneDriveId?: string;
  webUrl?: string;
  thumbnailDataUrl?: string;
  uploadedAt?: string;
  uploadStatus?: 'uploading' | 'done' | 'error';
  file?: File;
}

// ── Image helpers (same approach as ServiceReportTab) ──────────────────────

// Small thumbnail (~120px longest edge, JPEG 0.65) with EXIF orientation baked
// in, so receipts render without a live OneDrive connection after reload.
async function generateThumbnail(source: Blob): Promise<string> {
  const MAX = 120;
  try {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' } as unknown as ImageBitmapOptions);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.65);
  } catch {
    return '';
  }
}

// iPhone HEIC/HEIF → JPEG at attach time so browsers and jsPDF can render it.
async function convertHeicToJpeg(file: File): Promise<File> {
  const name = file.name.toLowerCase();
  const isHeic = name.endsWith('.heic') || name.endsWith('.heif') ||
    file.type === 'image/heic' || file.type === 'image/heif';
  if (!isHeic) return file;
  try {
    const heic2any = (await import('heic2any')).default;
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(result) ? result[0] : result;
    const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], jpegName, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// Bake EXIF orientation into a JPEG data URL so jsPDF embeds it upright.
async function normalizeImageOrientation(source: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' } as unknown as ImageBitmapOptions);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(source);
    });
  }
}

const isImageReceipt = (r: ReceiptAttachment): boolean =>
  (r.file?.type || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp)$/i.test(r.filename);

// Approved cash advances offered in the "Apply to CA" selector. ca_no is the
// human-readable reference (e.g. IOCT2606001-CA01); id stays the real key.
interface CaOption {
  id: string;
  ca_no?: string | null;
  amount: number;
  balance_remaining: number;
  status?: string;
  project_name?: string | null;
  project_no?: string | null;
  purpose?: string | null;
}

interface LoadedLiquidationOption {
  id: string;
  form_no: string;
  date_of_submission: string;
  status: string;
  total_amount: number;
  ca_id?: string | null;
  reimbursement_status?: string | null;
}

const newRow = (projectName = '', projectNo = ''): LiquidationRow => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  date: new Date().toISOString().slice(0, 10),
  category: '',
  projectId: '',
  projectName,
  projectNo,
  particulars: '',
  amount: 0,
  remarks: '',
});

async function addLiquidationRowsToProjectExpenses(
  rows: LiquidationRow[],
  liquidationId?: string,
  formNo?: string,
  sourceCaId?: string
): Promise<void> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;
    const toAdd = rows.filter((r) => {
      const pid = r.projectId;
      const amt = Number(r.amount);
      return pid !== '' && pid !== null && pid !== undefined && amt > 0;
    });
    if (toAdd.length === 0) return;
    const expenses = toAdd.map((r) => {
      const expense: Record<string, unknown> = {
        projectId: r.projectId,
        projectName: (r.projectName || '').trim() || '—',
        description: formNo
          ? `Liquidation ${formNo}: ${(r.particulars || '').trim() || 'Liquidation'}`
          : (r.particulars || '').trim() || 'Liquidation',
        amount: Number(r.amount),
        date: r.date || new Date().toISOString().slice(0, 10),
        category: (r.category || '').trim() || 'Others',
        sourceType: 'liquidation_sync',
        sourceLiquidationId: liquidationId,
        sourceLiquidationRowId: r.id,
      };
      if (sourceCaId) expense.sourceCaId = sourceCaId;
      return expense;
    });
    await fetch(`${API_BASE}/api/project-expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ expenses }),
    });
  } catch (err) {
    console.warn('[LiquidationFormPage] expense sync failed:', err);
  }
}

export default function LiquidationFormPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [employeeName, setEmployeeName] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [dateOfSubmission, setDateOfSubmission] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [formNo, setFormNo] = useState('');
  const [rows, setRows] = useState<LiquidationRow[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<LoadedLiquidationOption[]>([]);
  const [submittedLiquidations, setSubmittedLiquidations] = useState<LoadedLiquidationOption[]>([]);
  const [isViewingSubmitted, setIsViewingSubmitted] = useState(false);
  const [loadedOptionValue, setLoadedOptionValue] = useState<string>('');
  const [cashAdvances, setCashAdvances] = useState<CaOption[]>([]);
  // Reimbursement tracking of the currently loaded submitted no-CA liquidation.
  const [loadedReimb, setLoadedReimb] = useState<{ id: string; status: string | null; at: number | null } | null>(null);
  // Receipt scans/photos attached per expense row.
  const [receipts, setReceipts] = useState<ReceiptAttachment[]>([]);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const receiptRowIdRef = useRef<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanRowIdRef = useRef<string | null>(null);
  const [scanningRowId, setScanningRowId] = useState<string | null>(null);
  const [scanSnackbar, setScanSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' }>({ open: false, message: '', severity: 'success' });
  const receiptsFolderRef = useRef<{ key: string; driveId: string; folderId: string } | null>(null);
  const { isAuthenticated: oneDriveSignedIn, getAccessToken: getOneDriveToken, login: oneDriveLogin } = useOneDriveAuth();
  const [saving, setSaving] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [caId, setCaId] = useState<string | ''>('');
  const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'amount'; direction: 'asc' | 'desc' } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canDeleteLiquidation = draftId !== null || loadedOptionValue.startsWith('submitted:');
  const liquidationToDeleteId = draftId ?? (loadedOptionValue.startsWith('submitted:') ? loadedOptionValue.split(':')[1] : null);
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';
  const location = useLocation();

  const handleSort = (key: 'date' | 'amount') => {
    setSortConfig((prev) => {
      if (prev?.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      return { key, direction: 'asc' };
    });
  };

  const sortedRows = React.useMemo(() => {
    if (!sortConfig) return rows;
    return [...rows].sort((a, b) => {
      if (sortConfig.key === 'date') {
        const cmp = (a.date || '').localeCompare(b.date || '');
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      const aVal = Number(a.amount) || 0;
      const bVal = Number(b.amount) || 0;
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [rows, sortConfig]);

  useEffect(() => {
    const fullName = user?.full_name?.trim();
    const fallback = user?.username;
    if (fullName) setEmployeeName(fullName);
    else if (fallback && !employeeName) setEmployeeName(fallback);
  }, [employeeName, user?.full_name, user?.username]);

  useEffect(() => {
    dataService.getProjects().then(setProjects);
  }, []);

  const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;

  // Arriving from the CA form's "Liquidate" button: preselect the CA.
  useEffect(() => {
    const fromQuery = new URLSearchParams(location.search).get('ca_id');
    if (fromQuery) setCaId(fromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch next form number on mount (for new forms)
  useEffect(() => {
    if (!token || draftId !== null || formNo) return;
    fetch(`${API_BASE}/api/liquidations/next-form-no`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.form_no) {
          setFormNo(d.form_no);
        }
      })
      .catch(() => {});
  }, [token, draftId, formNo]);
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/liquidations`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.liquidations) {
          setDrafts(d.liquidations.filter((l: { status: string }) => l.status === 'draft'));
          setSubmittedLiquidations(d.liquidations.filter((l: { status: string }) => l.status === 'submitted').sort((a: { created_at: number }, b: { created_at: number }) => (b.created_at || 0) - (a.created_at || 0)));
        }
      })
      .catch(() => {});
  }, [token]);
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/cash-advances`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        // Keep the full list — the dropdown filters to usable CAs at render
        // time, but loaded liquidations need to resolve any linked CA's ca_no.
        if (d.success && d.cash_advances) setCashAdvances(d.cash_advances);
      })
      .catch(() => {});
  }, [token]);

  // Get-or-create `Liquidation Receipts/{year}/{form_no}/` in the corporate
  // drive. Cached per form number for the session.
  const ensureReceiptsFolder = async (): Promise<{ driveId: string; folderId: string } | null> => {
    if (!isCorporateOneDriveConfigured() || !oneDriveSignedIn) return null;
    const key = sanitizeForOneDrive((formNo || 'draft').trim() || 'draft');
    if (receiptsFolderRef.current?.key === key) return receiptsFolderRef.current;
    const odToken = await getOneDriveToken();
    if (!odToken) return null;
    const driveId = await resolveCorporateDriveId(odToken);
    const year = String(new Date().getFullYear());
    await ensureFolder(odToken, driveId, '', 'Liquidation Receipts');
    await ensureFolder(odToken, driveId, 'Liquidation Receipts', year);
    const folder = await ensureFolder(odToken, driveId, `Liquidation Receipts/${year}`, key);
    receiptsFolderRef.current = { key, driveId, folderId: folder.id };
    return receiptsFolderRef.current;
  };

  const attachReceipts = async (rowId: string, files: FileList | null) => {
    if (!rowId || !files || files.length === 0) return;
    for (const raw of Array.from(files)) {
      const file = await convertHeicToJpeg(raw);
      const thumbnailDataUrl = file.type.startsWith('image/') ? await generateThumbnail(file) : '';
      const rec: ReceiptAttachment = {
        id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        rowId,
        filename: file.name,
        thumbnailDataUrl: thumbnailDataUrl || undefined,
        uploadStatus: 'uploading',
        file,
      };
      setReceipts((prev) => [...prev, rec]);
      try {
        const folder = await ensureReceiptsFolder();
        const odToken = folder ? await getOneDriveToken() : null;
        if (!folder || !odToken) throw new Error('OneDrive not connected');
        // Short unique prefix avoids two same-named phone photos overwriting
        // each other (Graph default conflict behavior is replace).
        const uploadName = `${rec.id.slice(-6)}_${sanitizeForOneDrive(file.name)}`;
        const item = await uploadFileToFolderById(odToken, folder.driveId, folder.folderId, uploadName, file);
        setReceipts((prev) => prev.map((r) => r.id === rec.id
          ? { ...r, uploadStatus: 'done', oneDriveId: item.id, webUrl: item.webUrl, uploadedAt: new Date().toISOString() }
          : r));
      } catch {
        // Kept in memory — still embeds in the PDF, but won't survive reload.
        setReceipts((prev) => prev.map((r) => (r.id === rec.id ? { ...r, uploadStatus: 'error' } : r)));
      }
    }
  };

  const removeReceipt = (id: string) => setReceipts((prev) => prev.filter((r) => r.id !== id));

  const scanReceiptForRow = async (rowId: string, file: File) => {
    if (!file) return;
    setScanningRowId(rowId);
    // Convert HEIC->JPEG once so attach and parse share one safe JPEG (avoids a
    // duplicate heic2any pass and sending an unparseable HEIC to the parser).
    const safeFile = await convertHeicToJpeg(file);
    // Keep the photo even if AI parsing fails — attach via the existing flow.
    try {
      const dt = new DataTransfer();
      dt.items.add(safeFile);
      void attachReceipts(rowId, dt.files);
    } catch {
      void attachReceipts(rowId, [safeFile] as unknown as FileList);
    }
    try {
      const { imageBase64, mimeType } = await fileToParseInput(safeFile);
      const parsed = await parseReceipt(imageBase64, mimeType);
      setRows((prev) => prev.map((r) => {
        if (r.id !== rowId) return r;
        const amt = parsed.total ?? parsed.subtotal;
        return {
          ...r,
          date: parsed.date || r.date,
          category: parsed.suggestedCategory || r.category,
          amount: (typeof amt === 'number' && amt > 0) ? amt : r.amount,
          particulars: (!r.particulars || r.particulars.trim() === '')
            ? (parsed.vendor || parsed.lineItems?.[0]?.description || '')
            : r.particulars,
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
    } catch (e) {
      setScanSnackbar({ open: true, severity: 'error', message: e instanceof Error ? e.message : 'Failed to parse receipt' });
    } finally {
      setScanningRowId(null);
    }
  };

  const payload = () => ({
    form_no: formNo,
    date_of_submission: dateOfSubmission,
    employee_name: employeeName,
    employee_number: employeeNumber,
    rows_json: rows.map((r) => ({
      id: r.id,
      date: r.date,
      category: r.category,
      projectId: r.projectId,
      projectName: r.projectName,
      projectNo: r.projectNo,
      particulars: r.particulars,
      amount: r.amount,
      remarks: r.remarks,
    })),
    total_amount: totalAmount,
    ca_id: caId || null,
    // Only successfully uploaded receipts persist — local-only files can't be
    // recovered after a reload anyway.
    receipts_json: receipts
      .filter((r) => r.uploadStatus === 'done' && r.oneDriveId)
      .map(({ file: _f, uploadStatus: _s, ...keep }) => keep),
  });

  const saveDraft = async () => {
    if (!token) return;
    setSaving(true);
    setSubmitSuccess(null);
    try {
      const body = { ...payload(), status: 'draft' };
      const url = draftId ? `${API_BASE}/api/liquidations/${draftId}` : `${API_BASE}/api/liquidations`;
      const method = draftId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        const newId = data.id ?? draftId;
        setDraftId(newId);
        if (newId) setLoadedOptionValue(`draft:${newId}`);
        setSubmitSuccess('Draft saved.');
        fetch(`${API_BASE}/api/liquidations`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.liquidations) {
              setDrafts(d.liquidations.filter((l: { status: string }) => l.status === 'draft'));
              setSubmittedLiquidations(d.liquidations.filter((l: { status: string }) => l.status === 'submitted').sort((a: { created_at: number }, b: { created_at: number }) => (b.created_at || 0) - (a.created_at || 0)));
            }
          })
          .catch(() => {});
      } else {
        setSubmitSuccess(data.error || 'Save failed');
      }
    } catch (e) {
      setSubmitSuccess(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const loadDraft = async (id: string, isSubmitted = false) => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/liquidations/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!data.success || !data.liquidation) return;
    const l = data.liquidation;
    const serverStatus = String(l.status ?? '').toLowerCase().trim();
    const submitted =
      isSubmitted ||
      serverStatus === 'submitted';
    setIsViewingSubmitted(submitted);
    setFormNo(l.form_no || '');
    setDateOfSubmission(l.date_of_submission || new Date().toISOString().slice(0, 10));
    setEmployeeName(l.employee_name || '');
    setEmployeeNumber(l.employee_number || '');
    setCaId(l.ca_id || '');
    let raw: Record<string, unknown>[] = [];
    try {
      raw = Array.isArray(l.rows_json)
        ? l.rows_json
        : typeof l.rows_json === 'string'
          ? JSON.parse(l.rows_json || '[]')
          : [];
    } catch {
      raw = [];
    }
    if (!Array.isArray(raw)) raw = [];
    const loadedRows: LiquidationRow[] =
      raw.length === 0
        ? [newRow('', '')]
        : raw.map((r: Record<string, unknown>) => {
            const base = newRow(String(r.projectName ?? ''), String(r.projectNo ?? ''));
            const pidValue = r.projectId;
            // Firestore IDs are strings; accept any non-empty value as-is
            const projectId: string | '' = pidValue !== undefined && pidValue !== null && pidValue !== '' ? String(pidValue) : '';
            return {
              id: typeof r.id === 'string' && r.id ? String(r.id) : base.id,
              date: String(r.date ?? new Date().toISOString().slice(0, 10)),
              category: String(r.category ?? ''),
              projectId,
              projectName: String(r.projectName ?? ''),
              projectNo: String(r.projectNo ?? ''),
              particulars: String(r.particulars ?? ''),
              amount: Number(r.amount) || 0,
              remarks: String(r.remarks ?? ''),
            };
          });
    setRows(loadedRows);
    let loadedReceipts: ReceiptAttachment[] = [];
    try {
      const rawReceipts = Array.isArray(l.receipts_json)
        ? l.receipts_json
        : typeof l.receipts_json === 'string'
          ? JSON.parse(l.receipts_json || '[]')
          : [];
      if (Array.isArray(rawReceipts)) {
        loadedReceipts = rawReceipts
          .filter((r: Record<string, unknown>) => r && typeof r === 'object')
          .map((r: Record<string, unknown>) => ({
            id: String(r.id ?? `rcpt-${Math.random().toString(36).slice(2)}`),
            rowId: String(r.rowId ?? ''),
            filename: String(r.filename ?? 'receipt'),
            oneDriveId: r.oneDriveId ? String(r.oneDriveId) : undefined,
            webUrl: r.webUrl ? String(r.webUrl) : undefined,
            thumbnailDataUrl: r.thumbnailDataUrl ? String(r.thumbnailDataUrl) : undefined,
            uploadedAt: r.uploadedAt ? String(r.uploadedAt) : undefined,
            uploadStatus: 'done' as const,
          }));
      }
    } catch {
      loadedReceipts = [];
    }
    setReceipts(loadedReceipts);
    setDraftId(submitted ? null : l.id);
    setLoadedOptionValue(submitted ? `submitted:${l.id}` : `draft:${l.id}`);
    setLoadedReimb(
      submitted && !l.ca_id
        ? { id: l.id, status: l.reimbursement_status || 'pending', at: l.reimbursed_at || null }
        : null
    );
    setSubmitSuccess(null);
  };

  // Admin: flip the reimbursement status of the loaded no-CA liquidation.
  const updateReimbursement = async (next: 'pending' | 'reimbursed') => {
    if (!token || !loadedReimb) return;
    try {
      const res = await fetch(`${API_BASE}/api/liquidations/${loadedReimb.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reimbursement_status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setLoadedReimb((prev) => prev && { ...prev, status: next, at: next === 'reimbursed' ? Math.floor(Date.now() / 1000) : null });
        setSubmitSuccess(next === 'reimbursed' ? 'Marked as reimbursed.' : 'Reverted to pending reimbursement.');
        refreshLiquidationsList();
      } else {
        setSubmitSuccess(data.error || 'Update failed');
      }
    } catch (e) {
      setSubmitSuccess(e instanceof Error ? e.message : 'Network error');
    }
  };

  const refreshLiquidationsList = () => {
    if (!token) return;
    fetch(`${API_BASE}/api/liquidations`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.liquidations) {
          setDrafts(d.liquidations.filter((l: { status: string }) => l.status === 'draft'));
          setSubmittedLiquidations(d.liquidations.filter((l: { status: string }) => l.status === 'submitted').sort((a: { created_at: number }, b: { created_at: number }) => (b.created_at || 0) - (a.created_at || 0)));
        }
      })
      .catch(() => {});
  };

  const handleDeleteLiquidation = async () => {
    const id = liquidationToDeleteId;
    if (!token || id == null || String(id).trim() === '') return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/liquidations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      let data: { success?: boolean; error?: string } = {};
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (data.success) {
        const idToRemove = id;
        setDrafts((prev) => prev.filter((d) => d.id !== idToRemove));
        setSubmittedLiquidations((prev) => prev.filter((d) => d.id !== idToRemove));
        setDeleteDialogOpen(false);
        setDraftId(null);
        setLoadedOptionValue('');
        setIsViewingSubmitted(false);
        setRows([newRow('', '')]);
        setFormNo('');
        setEmployeeName(user?.full_name?.trim() || user?.username || '');
        setEmployeeNumber('');
        setDateOfSubmission(new Date().toISOString().slice(0, 10));
        setCaId('');
        setReceipts([]);
        setLoadedReimb(null);
        setSubmitSuccess('Liquidation deleted.');
        refreshLiquidationsList();
        fetch(`${API_BASE}/api/cash-advances`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.cash_advances) setCashAdvances(d.cash_advances);
          })
          .catch(() => {});
      } else if (res.status === 404) {
        const idToRemove = id;
        setDrafts((prev) => prev.filter((d) => d.id !== idToRemove));
        setSubmittedLiquidations((prev) => prev.filter((d) => d.id !== idToRemove));
        setDeleteDialogOpen(false);
        setDraftId(null);
        setLoadedOptionValue('');
        setIsViewingSubmitted(false);
        setRows([newRow('', '')]);
        setFormNo('');
        setEmployeeName(user?.full_name?.trim() || user?.username || '');
        setEmployeeNumber('');
        setDateOfSubmission(new Date().toISOString().slice(0, 10));
        setCaId('');
        setReceipts([]);
        setLoadedReimb(null);
        setSubmitSuccess('Liquidation removed from list.');
        refreshLiquidationsList();
      } else {
        const errMsg = data.error || (res.status === 401 ? 'Unauthorized' : res.status === 403 ? 'Forbidden' : `Delete failed (${res.status})`);
        setSubmitSuccess(errMsg);
      }
    } catch (e) {
      setSubmitSuccess(e instanceof Error ? e.message : 'Network error');
    } finally {
      setIsDeleting(false);
    }
  };

  const submitLiquidation = async () => {
    if (!token) return;
    if (rows.length === 0) {
      setSubmitSuccess('Add at least one row.');
      return;
    }
    setSaving(true);
    setSubmitSuccess(null);
    try {
      // Get next form number if not set (for new submissions)
      let finalFormNo = formNo;
      if (!finalFormNo || finalFormNo.trim() === '') {
        const res = await fetch(`${API_BASE}/api/liquidations/next-form-no`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (data.success && data.form_no) {
          finalFormNo = data.form_no;
          setFormNo(finalFormNo);
        } else {
          finalFormNo = 'LQ-0001';
        }
      }
      const body = { ...payload(), form_no: finalFormNo, status: 'submitted' };
      const url = draftId ? `${API_BASE}/api/liquidations/${draftId}` : `${API_BASE}/api/liquidations`;
      const method = draftId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        addLiquidationRowsToProjectExpenses(rows, data.id ?? draftId ?? undefined, finalFormNo, caId || undefined).catch(() => {});
        setDraftId(null);
        setLoadedOptionValue('');
        setIsViewingSubmitted(false);
        setRows([newRow('', '')]);
        setFormNo('');
        setSubmitSuccess(caId
          ? 'Liquidation submitted. Amount applied to CA has been deducted; expenses added to project expense.'
          : 'Liquidation submitted as an out-of-pocket reimbursement claim (pending payback); expenses added to project expense.');
        setCaId('');
        setReceipts([]);
        // Fetch next form number for new form
        fetch(`${API_BASE}/api/liquidations/next-form-no`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.form_no) {
              setFormNo(d.form_no);
            }
          })
          .catch(() => {});
        fetch(`${API_BASE}/api/liquidations`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.liquidations) {
              setDrafts(d.liquidations.filter((l: { status: string }) => l.status === 'draft'));
              setSubmittedLiquidations(d.liquidations.filter((l: { status: string }) => l.status === 'submitted').sort((a: { created_at: number }, b: { created_at: number }) => (b.created_at || 0) - (a.created_at || 0)));
            }
          })
          .catch(() => {});
        fetch(`${API_BASE}/api/cash-advances`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => d.success && d.cash_advances && setCashAdvances(d.cash_advances))
          .catch(() => {});
      } else {
        setSubmitSuccess(data.error || 'Submit failed');
      }
    } catch (e) {
      setSubmitSuccess(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const addRow = () => {
    setRows((prev) => [...prev, newRow('', '')]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    // Receipts belong to their row — drop them with it.
    setReceipts((prev) => prev.filter((r) => r.rowId !== id));
  };

  const updateRow = (id: string, field: keyof LiquidationRow, value: string | number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const setRowProject = (id: string, projectId: string | '') => {
    if (projectId === '') {
      updateRow(id, 'projectId', '');
      updateRow(id, 'projectName', '');
      updateRow(id, 'projectNo', '');
      return;
    }
    const p = projects.find((x) => String(x.id) === projectId);
    if (!p) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              projectId,
              projectName: p.project_name || '',
              projectNo: p.po_number || p.project_no || '',
            }
          : r
      )
    );
  };

  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const selectedCa = cashAdvances.find((c) => c.id === caId);
  // Usable for new liquidations: approved with money left. The currently
  // selected CA is always included so loaded liquidations keep their label.
  const availableCAs = cashAdvances.filter(
    (c) => (c.status === 'approved' && Number(c.balance_remaining) > 0) || c.id === caId
  );
  const caLabel = (c: CaOption) =>
    `${c.ca_no || `CA #${c.id}`}${c.project_name ? ` — ${c.project_name}` : c.purpose ? ` — ${c.purpose}` : ''}`;
  const overBalance = !isViewingSubmitted && !!selectedCa && totalAmount > Number(selectedCa.balance_remaining);

  const exportToPDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 14;
    const pageWidth = 210;
    const pageHeight = 297;
    const footerY = pageHeight - 10;
    const headerY = 14;
    let y = headerY;

    // Load Arial Narrow font
    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'bold');
    }
    const fontBody = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal');
    const fontBold = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'bold');

    // Load logo once for reuse on all pages
    let logoDataUrl: string | null = null;
    let logoWidth = 0;
    let logoHeight = 0;
    try {
      const { loadLogoTransparentBackground, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT } = await import('../utils/logoUtils');
      const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-acti.png`;
      logoDataUrl = await loadLogoTransparentBackground(logoUrl);
      logoWidth = ACT_LOGO_PDF_WIDTH;
      logoHeight = ACT_LOGO_PDF_HEIGHT;
    } catch (_) {}

    const lineHeight = 5;
    // Draw header on first page (logo, company name, Liquidation Form + Date on right)
    const drawHeader = () => {
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', margin, headerY - 2, logoWidth, logoHeight);
        doc.setFontSize(9);
        fontBold();
        doc.text('Advance Controle Technologie Inc.', margin, headerY + logoHeight + 4);
      }
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold'); // Use Arial Bold (helvetica bold) for title
      doc.text('Liquidation Form', pageWidth - margin, headerY, { align: 'right' });
      fontBody();
      doc.setFontSize(10);
      doc.text(`Date: ${dateOfSubmission || '—'}`, pageWidth - margin, headerY + lineHeight, { align: 'right' });
    };

    drawHeader();
    y += logoHeight > 0 ? logoHeight + 10 : 6;
    fontBody();
    doc.setFontSize(10);
    doc.text(`Name: ${(employeeName || '—').trim()}`, margin, y);
    y += 10;
    const exportRows = [...rows].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const body = exportRows.length > 0
      ? exportRows.map((r, i) => [
          String(i + 1),
          r.date || '—',
          r.category || '—',
          (r.projectName || '—').slice(0, 25),
          r.projectNo || '—',
          (r.particulars || '—').slice(0, 30),
          Number(r.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 }),
          (r.remarks || '—').slice(0, 15),
        ])
      : [['—', '—', '—', '—', '—', '—', '0.00', '—']];

    const tableStartY = y;
    const rowsPerPage = 25;
    const bottomReserve = 60;
    const tableHead = [['No.', 'Date', 'Category', 'Project', 'PO #', 'Particulars', 'Amount', 'Remarks']];
    const tableOpts = {
      margin: { left: margin, right: margin, bottom: bottomReserve },
      tableWidth: pageWidth - margin * 2,
      styles: { fontSize: 7, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica', cellPadding: 2 },
      headStyles: { fillColor: [44, 90, 160] as [number, number, number], font: hasArialNarrow ? 'ArialNarrow' : 'helvetica', fontStyle: 'bold' as const, fontSize: 7, cellPadding: 2 },
    };

    const chunks: string[][][] = [];
    for (let i = 0; i < body.length; i += rowsPerPage) {
      chunks.push(body.slice(i, i + rowsPerPage));
    }
    if (chunks.length === 0) chunks.push([['—', '—', '—', '—', '—', '—', '0.00', '—']]);

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        doc.addPage();
        drawHeader();
      }
      autoTable(doc, {
        head: tableHead,
        body: chunks[i],
        startY: tableStartY,
        ...tableOpts,
      });
    }
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (docWithTable.lastAutoTable?.finalY ?? tableStartY) + 8;
    // Total on the right side - use Helvetica Bold
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, pageWidth - margin, y, { align: 'right' });
    if (caId) {
      doc.text(`Applied to: ${selectedCa?.ca_no || `CA #${caId}`}`, margin, y);
    } else {
      const reimbursedSuffix = loadedReimb?.status === 'reimbursed'
        ? ` — Reimbursed${loadedReimb.at ? ` on ${new Date(loadedReimb.at * 1000).toLocaleDateString()}` : ''}`
        : '';
      doc.text(`For Reimbursement (out-of-pocket)${reimbursedSuffix}`, margin, y);
    }
    y += 14;
    fontBody();
    doc.setFontSize(9);
    const sigY = footerY - 28;
    doc.text('Prepared by:', margin, sigY);
    const preparedByName = (employeeName || user?.full_name || user?.username || user?.email || '—').trim() || '—';
    doc.text(preparedByName, margin, sigY + 6);

    // ── Receipt attachments appendix ──────────────────────────────────────
    // Image receipts embed in a 2-column grid so the signed PDF carries its
    // own proof; non-image files (PDFs) are listed by name. Sources: the
    // in-memory file from this session, else the stored OneDrive copy.
    let missingReceipts = 0;
    if (receipts.length > 0) {
      let odToken: string | null = null;
      let driveId: string | null = null;
      if (isCorporateOneDriveConfigured() && oneDriveSignedIn) {
        try {
          odToken = await getOneDriveToken();
          if (odToken) driveId = await resolveCorporateDriveId(odToken);
        } catch { odToken = null; driveId = null; }
      }
      const entries: { caption: string; dataUrl: string | null }[] = [];
      for (const r of receipts) {
        const rowIdx = rows.findIndex((x) => x.id === r.rowId);
        const caption = `Row ${rowIdx >= 0 ? rowIdx + 1 : '—'} · ${r.filename}`;
        if (!isImageReceipt(r)) {
          entries.push({ caption: `${caption} (file — see OneDrive)`, dataUrl: null });
          continue;
        }
        try {
          let blob: Blob | null = r.file ?? null;
          if (!blob && r.oneDriveId && odToken && driveId) {
            blob = await fetchDriveItemBlob(odToken, driveId, r.oneDriveId);
          }
          if (!blob) throw new Error('no source for receipt image');
          entries.push({ caption, dataUrl: await normalizeImageOrientation(blob) });
        } catch {
          missingReceipts++;
          entries.push({ caption: `${caption} (could not be embedded)`, dataUrl: null });
        }
      }
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Receipt Attachments', margin, 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const gridGap = 6;
      const cellW = (pageWidth - margin * 2 - gridGap) / 2;
      const maxImgH = 85;
      let gy = 26;
      let col = 0;
      const textLines: string[] = [];
      for (const e of entries) {
        if (!e.dataUrl) { textLines.push(e.caption); continue; }
        if (col === 0 && gy + maxImgH + 10 > footerY - 6) { doc.addPage(); gy = 18; }
        const x = margin + col * (cellW + gridGap);
        try {
          const props = doc.getImageProperties(e.dataUrl);
          const scale = Math.min(cellW / props.width, maxImgH / props.height);
          doc.addImage(e.dataUrl, 'JPEG', x, gy, props.width * scale, props.height * scale);
        } catch { /* unreadable image — caption still printed */ }
        doc.text(e.caption, x, gy + maxImgH + 4, { maxWidth: cellW });
        col = col === 0 ? 1 : 0;
        if (col === 0) gy += maxImgH + 10;
      }
      if (textLines.length > 0) {
        let ty = col === 1 ? gy + maxImgH + 10 : gy;
        if (ty + textLines.length * 5 > footerY - 6) { doc.addPage(); ty = 18; }
        for (const line of textLines) { doc.text(`• ${line}`, margin, ty); ty += 5; }
      }
      fontBody();
      doc.setFontSize(8);
    }

    // Add footer with page number and Doc No. on all pages (Doc No. is LIQ-001, not LIQ-LQ-001)
    const totalPages = doc.getNumberOfPages();
    const docNo = !formNo ? 'LIQ-001' : formNo.startsWith('LIQ-') ? formNo : formNo.startsWith('LQ-') ? 'LIQ-' + formNo.slice(3) : 'LIQ-' + formNo;
    doc.setFontSize(8);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
      doc.text(`Doc No.: ${docNo}`, margin, footerY);
    }
    
    // Filename names the CA (and therefore the project) the liquidation
    // settles against, e.g. LQ-0005_IOCT2606001-CA01.pdf — or flags it as an
    // out-of-pocket reimbursement claim.
    const fnBase = formNo || 'form';
    doc.save(
      caId
        ? (selectedCa?.ca_no
            ? `${fnBase}_${selectedCa.ca_no}.pdf`
            : `Liquidation_${fnBase}_${dateOfSubmission.replace(/-/g, '')}.pdf`)
        : `${fnBase}_Reimbursement.pdf`
    );
    if (missingReceipts > 0) {
      setSubmitSuccess(`${missingReceipts} receipt(s) could not be embedded in the PDF — sign in to OneDrive to include stored receipts.`);
    }
  };

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const headerRow1 = ['Employee Name', employeeName, 'Employee Number', employeeNumber];
    const headerRow2 = ['Date of Submission', dateOfSubmission, 'Form No.', formNo];
    const tableHeaders = ['No.', 'Date', 'Category', 'Project Name', 'PO #', 'Particulars', 'Amount', 'Remarks'];
    const exportRows = [...rows].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const dataRows = exportRows.map((r, i) => [
      i + 1,
      r.date,
      r.category,
      r.projectName,
      r.projectNo,
      r.particulars,
      r.amount,
      r.remarks,
    ]);
    const wsData = [headerRow1, headerRow2, [], tableHeaders, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // A4 print: paperSize 9 = A4, fitToPage so content fits one A4 sheet
    ws['!pageSetup'] = { paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    XLSX.utils.book_append_sheet(wb, ws, 'Liquidation');
    const filename = `liquidation_${formNo}_${dateOfSubmission.replace(/-/g, '')}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        if (data == null) return;
        const wb =
          typeof data === 'string'
            ? XLSX.read(data, { type: 'string' })
            : XLSX.read(new Uint8Array(data as ArrayBuffer), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (raw.length < 4) return;
        const r0 = (raw[0] as unknown[]) || [];
        const r1 = (raw[1] as unknown[]) || [];
        if (r0[1] != null) setEmployeeName(String(r0[1]));
        if (r0[3] != null) setEmployeeNumber(String(r0[3]));
        if (r1[1] != null) setDateOfSubmission(String(r1[1]).slice(0, 10));
        if (r1[3] != null) setFormNo(String(r1[3]));
        const headerRow = raw[3] as unknown[];
        if (!headerRow || (headerRow[0] !== 'No.' && headerRow[0] !== 1)) return;
        const imported: LiquidationRow[] = [];
        for (let i = 4; i < raw.length; i++) {
          const row = raw[i] as unknown[];
          if (!row || row.length < 6) continue;
          const date = row[1] != null ? String(row[1]).slice(0, 10) : new Date().toISOString().slice(0, 10);
          const amount = typeof row[6] === 'number' ? row[6] : parseFloat(String(row[6] || 0)) || 0;
          imported.push(newRow(String(row[3] ?? ''), String(row[4] ?? '')));
          const last = imported[imported.length - 1];
          last.projectId = '';
          last.date = date;
          last.category = String(row[2] ?? '');
          last.particulars = String(row[5] ?? '');
          last.amount = amount;
          last.remarks = String(row[7] ?? '');
        }
        if (imported.length > 0) setRows(imported);
      } catch (err) {
        console.error('Import error:', err);
      }
      e.target.value = '';
    };
    if (file.name.toLowerCase().endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const theme = {
    primary: '#2c5aa0',
    primaryLight: '#4f7bc8',
    secondary: '#1e4a72',
    border: '#e0e0e0',
    paper: '#ffffff',
  };

  return (
    <Box sx={{ p: 3, width: '100%', minHeight: 'calc(100vh - 80px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: theme.primary }}>
          Liquidation Form
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SaveIcon />}
            onClick={saveDraft}
            disabled={saving || isViewingSubmitted}
            sx={{ borderColor: theme.primary, color: theme.primary }}
          >
            Save draft
          </Button>
          {canDeleteLiquidation && (
            <Button
              variant="outlined"
              size="small"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteDialogOpen(true)}
              sx={{ borderColor: 'error.main', color: 'error.main' }}
            >
              Delete
            </Button>
          )}
          {(drafts.length > 0 || submittedLiquidations.length > 0) && (
            <Select<string>
              size="small"
              displayEmpty
              value={loadedOptionValue}
              onChange={(e) => {
                const raw = e.target.value as string;
                if (raw === '') {
                  setIsViewingSubmitted(false);
                  setDraftId(null);
                  setLoadedOptionValue('');
                  setRows([newRow('', '')]);
                  setFormNo('');
                  setEmployeeName('');
                  setEmployeeNumber('');
                  setDateOfSubmission(new Date().toISOString().slice(0, 10));
                  setCaId('');
                  setReceipts([]);
                  setLoadedReimb(null);
                  setSubmitSuccess(null);
                  return;
                }
                const colonIdx = raw.indexOf(':');
                const id = colonIdx !== -1 ? raw.slice(colonIdx + 1) : '';
                const isSubmitted = raw.startsWith('submitted:');
                if (id) loadDraft(id, isSubmitted);
              }}
              sx={{ minWidth: 200, '& .MuiSelect-select': { py: 0.75 } }}
              renderValue={(v: string) => {
                if (v === '') return 'Load liquidation…';
                const id = v.includes(':') ? v.split(':')[1] : '';
                const item = [...drafts, ...submittedLiquidations].find((d) => d.id === id);
                return item?.form_no || `#${id}`;
              }}
            >
              <MenuItem value="">
                <em>Load liquidation…</em>
              </MenuItem>
              {drafts.length > 0 && [
                <MenuItem key="drafts-header" disabled sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}>
                  Drafts
                </MenuItem>,
                ...drafts.map((d) => (
                  <MenuItem key={`draft-${d.id}`} value={`draft:${d.id}`}>
                    {d.form_no || `#${d.id}`} – {d.date_of_submission || 'no date'} (₱{Number(d.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })})
                  </MenuItem>
                )),
              ]}
              {submittedLiquidations.length > 0 && [
                <MenuItem key="submitted-header" disabled sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary', mt: drafts.length > 0 ? 1 : 0 }}>
                  Submitted
                </MenuItem>,
                ...submittedLiquidations.map((d) => (
                  <MenuItem key={`submitted-${d.id}`} value={`submitted:${d.id}`}>
                    {d.form_no || `#${d.id}`} – {d.date_of_submission || 'no date'} (₱{Number(d.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })})
                    {!d.ca_id && d.reimbursement_status && (
                      <Chip
                        size="small"
                        label={d.reimbursement_status === 'reimbursed' ? 'Reimbursed' : 'Reimb. pending'}
                        color={d.reimbursement_status === 'reimbursed' ? 'success' : 'warning'}
                        sx={{ ml: 1, height: 18, fontSize: '0.65rem' }}
                      />
                    )}
                  </MenuItem>
                )),
              ]}
            </Select>
          )}
          <Button
            variant="outlined"
            startIcon={<ImportIcon />}
            onClick={() => fileInputRef.current?.click()}
            sx={{ borderColor: theme.primary, color: theme.primary, '&:hover': { borderColor: theme.secondary, color: theme.secondary } }}
          >
            Import
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={exportToPDF}
            sx={{ borderColor: theme.primary, color: theme.primary }}
          >
            Export to PDF (for signing)
          </Button>
          <Button
            variant="contained"
            startIcon={<ExportIcon />}
            onClick={handleExport}
            sx={{ bgcolor: theme.primary, '&:hover': { bgcolor: theme.secondary } }}
          >
            Export
          </Button>
        </Box>
      </Box>
      {submitSuccess && (
        <Typography variant="body2" sx={{ mb: 2, color: submitSuccess.startsWith('Liquidation submitted') ? 'success.main' : submitSuccess.startsWith('Draft saved') ? 'info.main' : 'error.main' }}>
          {submitSuccess}
        </Typography>
      )}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleImport}
      />

      <Paper
        elevation={0}
        sx={{
          p: 3,
          border: `1px solid ${theme.border}`,
          borderRadius: 2,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          backgroundColor: theme.paper,
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 3 }}>
          <Box sx={{ flex: '1 1 200px' }}>
            <TextField
              fullWidth
              size="small"
              label="Name"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              disabled={isViewingSubmitted}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            />
          </Box>
          <Box sx={{ flex: '1 1 140px' }}>
            <TextField
              fullWidth
              size="small"
              label="Employee Number"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              disabled={isViewingSubmitted}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            />
          </Box>
          <Box sx={{ flex: '1 1 160px' }}>
            <TextField
              fullWidth
              size="small"
              label="Date of Submission"
              type="date"
              value={dateOfSubmission}
              onChange={(e) => setDateOfSubmission(e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={isViewingSubmitted}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            />
          </Box>
          <Box sx={{ flex: '0 1 120px' }}>
            <TextField
              fullWidth
              size="small"
              label="Form No."
              value={formNo}
              onChange={(e) => setFormNo(e.target.value)}
              disabled={isViewingSubmitted}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            />
          </Box>
          {(availableCAs.length > 0 || caId !== '') && (
            <Box sx={{ flex: '1 1 260px' }}>
              <Select
                size="small"
                fullWidth
                displayEmpty
                value={caId === '' ? '' : caId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || v == null) setCaId('');
                  else setCaId(String(v));
                }}
                disabled={isViewingSubmitted}
                sx={{ bgcolor: 'background.paper', minHeight: 40 }}
                renderValue={(v) => {
                  if ((v as unknown) === '' || v == null) return 'Apply to CA (optional)';
                  const ca = cashAdvances.find((c) => c.id === v);
                  return ca ? caLabel(ca) : `CA #${v}`;
                }}
              >
                <MenuItem value="">
                  <em>No CA — out-of-pocket (reimbursement)</em>
                </MenuItem>
                {availableCAs.map((ca) => (
                  <MenuItem key={ca.id} value={ca.id}>
                    {caLabel(ca)} · Balance ₱{Number(ca.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </MenuItem>
                ))}
              </Select>
              {selectedCa && !isViewingSubmitted && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: overBalance ? 'error.main' : 'text.secondary' }}>
                  {overBalance
                    ? `Total exceeds the remaining balance of ₱${Number(selectedCa.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                    : `₱${Number(selectedCa.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })} remaining to liquidate on this CA`}
                </Typography>
              )}
              {!selectedCa && caId === '' && !isViewingSubmitted && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
                  No CA selected — this will be tracked as a reimbursement claim.
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {overBalance && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Total ₱{totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} exceeds the CA balance ₱{Number(selectedCa?.balance_remaining || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}. Reduce the rows or split into a separate reimbursement liquidation.
          </Alert>
        )}

        {isViewingSubmitted && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: 'info.light', borderRadius: 1, border: '1px solid', borderColor: 'info.main', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ color: 'info.dark', fontWeight: 500 }}>
                Viewing submitted liquidation (read-only). To edit, create an editable copy below.
              </Typography>
              {loadedReimb && (
                <Chip
                  size="small"
                  label={loadedReimb.status === 'reimbursed'
                    ? `Reimbursed${loadedReimb.at ? ` on ${new Date(loadedReimb.at * 1000).toLocaleDateString()}` : ''}`
                    : 'Reimbursement pending'}
                  color={loadedReimb.status === 'reimbursed' ? 'success' : 'warning'}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {loadedReimb && isAdmin && (
                <Button
                  variant="outlined"
                  size="small"
                  color={loadedReimb.status === 'reimbursed' ? 'warning' : 'success'}
                  onClick={() => updateReimbursement(loadedReimb.status === 'reimbursed' ? 'pending' : 'reimbursed')}
                >
                  {loadedReimb.status === 'reimbursed' ? 'Revert to pending' : 'Mark reimbursed'}
                </Button>
              )}
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setDraftId(null);
                  setLoadedOptionValue('');
                  setIsViewingSubmitted(false);
                  setLoadedReimb(null);
                  setSubmitSuccess(null);
                }}
                sx={{ borderColor: 'info.main', color: 'info.dark' }}
              >
                Create editable copy
              </Button>
            </Box>
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          {isCorporateOneDriveConfigured() ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                size="small"
                variant="outlined"
                icon={oneDriveSignedIn ? <CloudDoneIcon /> : <CloudOffIcon />}
                label={oneDriveSignedIn
                  ? 'OneDrive connected — receipts will be stored'
                  : 'OneDrive not signed in — receipts won’t be stored'}
                color={oneDriveSignedIn ? 'success' : 'warning'}
              />
              {!oneDriveSignedIn && (
                <Button size="small" variant="outlined" onClick={() => oneDriveLogin()} sx={{ borderColor: theme.primary, color: theme.primary }}>
                  Sign in to OneDrive
                </Button>
              )}
            </Box>
          ) : (
            <span />
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={addRow}
            disabled={isViewingSubmitted}
            sx={{
              bgcolor: theme.primary,
              '&:hover': { bgcolor: theme.secondary },
            }}
          >
            Add row
          </Button>
        </Box>

        <TableContainer sx={{ border: `1px solid ${theme.border}`, borderRadius: 1, flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: theme.primary + '12' }}>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, width: 48 }}>No.</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 110 }} sortDirection={sortConfig?.key === 'date' ? sortConfig.direction : false}>
                  <TableSortLabel
                    active={sortConfig?.key === 'date'}
                    direction={sortConfig?.key === 'date' ? sortConfig.direction : 'asc'}
                    onClick={() => handleSort('date')}
                  >
                    Date
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 120 }}>
                  Category
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 180 }}>
                  Project Name
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 120 }}>
                  PO #
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 160 }}>
                  Particulars
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 100 }} sortDirection={sortConfig?.key === 'amount' ? sortConfig.direction : false}>
                  <TableSortLabel
                    active={sortConfig?.key === 'amount'}
                    direction={sortConfig?.key === 'amount' ? sortConfig.direction : 'asc'}
                    onClick={() => handleSort('amount')}
                  >
                    Amount
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 100 }}>
                  Remarks
                </TableCell>
                <TableCell sx={{ width: 56 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Click "Add row" to add expense lines. Select a project per row from the list.
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((row, index) => (
                  <TableRow key={row.id} hover sx={{ '&:hover .delete-btn': { opacity: 1 } }}>
                    <TableCell sx={{ color: 'text.secondary' }}>{index + 1}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                        disabled={isViewingSubmitted}
                        fullWidth
                        variant="outlined"
                        InputLabelProps={{ shrink: true }}
                        sx={{ maxWidth: 140, '& .MuiInputBase-input': { py: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={row.category}
                        displayEmpty
                        onChange={(e) => updateRow(row.id, 'category', e.target.value)}
                        disabled={isViewingSubmitted}
                        sx={{ minWidth: 130, '& .MuiSelect-select': { py: 0.75 } }}
                      >
                        <MenuItem value="">
                          <em>Select</em>
                        </MenuItem>
                        {LIQUIDATION_CATEGORIES.map((c) => (
                          <MenuItem key={c} value={c}>
                            {c}
                          </MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select<string | ''>
                        size="small"
                        value={row.projectId === '' ? '' : String(row.projectId)}
                        displayEmpty
                        onChange={(e) => {
                          const val = e.target.value;
                          setRowProject(row.id, val === '' ? '' : String(val));
                        }}
                        disabled={isViewingSubmitted}
                        sx={{ minWidth: 200, width: '100%', '& .MuiSelect-select': { py: 0.75 } }}
                        renderValue={(v: string | '') => {
                          if (v === '' || v === undefined) return <em>Select project</em>;
                          const p = projects.find((x) => String(x.id) === v);
                          return p?.project_name || row.projectName || '—';
                        }}
                      >
                        <MenuItem value="">
                          <em>Select project</em>
                        </MenuItem>
                        {projects.map((p) => (
                          <MenuItem key={p.id} value={String(p.id)}>
                            {p.project_name || `Project ${p.id}`}
                            {(p.po_number || p.project_no) ? ` (${p.po_number || p.project_no})` : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.projectNo}
                        onChange={(e) => updateRow(row.id, 'projectNo', e.target.value)}
                        placeholder="PO #"
                        fullWidth
                        sx={{ '& .MuiInputBase-input': { py: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.particulars}
                        onChange={(e) => updateRow(row.id, 'particulars', e.target.value)}
                        placeholder="Particulars"
                        fullWidth
                        sx={{ '& .MuiInputBase-input': { py: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        inputProps={{ min: 0, step: 0.01 }}
                        value={row.amount || ''}
                        onChange={(e) =>
                          updateRow(row.id, 'amount', parseFloat(e.target.value) || 0)
                        }
                        fullWidth
                        sx={{ maxWidth: 110, '& .MuiInputBase-input': { py: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.remarks}
                        onChange={(e) => updateRow(row.id, 'remarks', e.target.value)}
                        placeholder="Remarks"
                        fullWidth
                        sx={{ '& .MuiInputBase-input': { py: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Scan receipt with camera">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => {
                              scanRowIdRef.current = row.id;
                              scanInputRef.current?.click();
                            }}
                            disabled={isViewingSubmitted || !!scanningRowId}
                            sx={{ color: theme.primary }}
                            aria-label="Scan receipt"
                          >
                            {scanningRowId === row.id
                              ? <CircularProgress size={20} color="inherit" />
                              : <PhotoCameraIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Attach receipt (photo or PDF)">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => {
                              receiptRowIdRef.current = row.id;
                              receiptInputRef.current?.click();
                            }}
                            disabled={isViewingSubmitted}
                            sx={{ color: theme.primary }}
                            aria-label="Attach receipt"
                          >
                            <Badge
                              badgeContent={receipts.filter((r) => r.rowId === row.id).length}
                              color="primary"
                              overlap="circular"
                            >
                              <AttachFileIcon fontSize="small" />
                            </Badge>
                          </IconButton>
                        </span>
                      </Tooltip>
                      <IconButton
                        size="small"
                        onClick={() => removeRow(row.id)}
                        className="delete-btn"
                        sx={{ opacity: { xs: 1, md: 0.5 }, color: 'error.main' }}
                        aria-label="Delete row"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <input
          type="file"
          ref={receiptInputRef}
          accept="image/*,.pdf,.heic,.heif"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const rid = receiptRowIdRef.current;
            if (rid) attachReceipts(rid, e.target.files);
            e.target.value = '';
          }}
        />
        <input
          type="file"
          ref={scanInputRef}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const rid = scanRowIdRef.current;
            const file = e.target.files?.[0];
            if (rid && file) scanReceiptForRow(rid, file);
            e.target.value = '';
          }}
        />

        {receipts.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: theme.primary, mb: 1 }}>
              Receipts ({receipts.length})
            </Typography>
            {receipts.some((r) => r.uploadStatus === 'error') && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                Some receipts could not be uploaded to OneDrive — they will still embed in the PDF this
                session, but won't be kept after a reload. Sign in to OneDrive and re-attach to store them.
              </Alert>
            )}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {receipts.map((r) => {
                const rowIdx = rows.findIndex((x) => x.id === r.rowId);
                return (
                  <Box
                    key={r.id}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, border: `1px solid ${theme.border}`, borderRadius: 1, p: 0.75, maxWidth: 280 }}
                  >
                    {r.thumbnailDataUrl ? (
                      // eslint-disable-next-line jsx-a11y/img-redundant-alt
                      <img src={r.thumbnailDataUrl} alt={r.filename} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                      <AttachFileIcon sx={{ fontSize: 32, color: 'text.secondary' }} />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                        Row {rowIdx >= 0 ? rowIdx + 1 : '—'}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }} title={r.filename}>
                        {r.filename}
                      </Typography>
                    </Box>
                    {r.uploadStatus === 'uploading' && <CircularProgress size={16} />}
                    {r.uploadStatus === 'error' && (
                      <Tooltip title="Not uploaded to OneDrive — sign in and re-attach to store permanently">
                        <ErrorOutlineIcon fontSize="small" color="warning" />
                      </Tooltip>
                    )}
                    {r.webUrl && (
                      <IconButton size="small" onClick={() => window.open(r.webUrl, '_blank', 'noopener')} title="Open in OneDrive">
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    )}
                    {!isViewingSubmitted && (
                      <IconButton size="small" color="error" onClick={() => removeReceipt(r.id)} title="Remove receipt">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {rows.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mt: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.primary }}>
              TOTAL AMOUNT: ± {totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </Typography>
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={submitLiquidation}
              disabled={saving || isViewingSubmitted || overBalance}
              title={overBalance ? 'Total exceeds the selected CA balance' : undefined}
              sx={{ bgcolor: theme.secondary, '&:hover': { bgcolor: theme.primary } }}
            >
              Submit liquidation
            </Button>
          </Box>
        )}
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => !isDeleting && setDeleteDialogOpen(false)}>
        <DialogTitle>Delete liquidation</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this liquidation? This cannot be undone.
            {isViewingSubmitted && ' If it was applied to a cash advance, the balance will be restored.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleDeleteLiquidation} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={scanSnackbar.open}
        autoHideDuration={5000}
        onClose={() => setScanSnackbar((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setScanSnackbar((p) => ({ ...p, open: false }))}
          severity={scanSnackbar.severity}
          sx={{ width: '100%', boxShadow: 3 }}
        >
          {scanSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
