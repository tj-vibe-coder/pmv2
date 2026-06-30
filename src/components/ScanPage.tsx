import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Button, TextField, MenuItem, Autocomplete, ToggleButton, ToggleButtonGroup,
  Alert, CircularProgress, Snackbar, Paper, InputAdornment,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import { API_BASE } from '../config/api';
import { parseReceipt, detectCropFromServer } from '../services/receiptParseService';
import { compressForUpload, blobToBase64 } from '../utils/receipts/imageCompress';
import { detectReceiptQuad } from '../utils/receipts/autoCrop';
import { perspectiveCropToBlob, type Quad } from '../utils/receipts/perspectiveCrop';
import ReceiptCropper from './ReceiptCropper';
import { EXPENSE_CATEGORIES } from '../data/financeCategories';
import { convertHeicToJpeg } from '../utils/receipts/imageUtils';
import ScanBatch from './ScanBatch';

const authHeaders = (): Record<string, string> => {
  const t = localStorage.getItem('netpacific_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

interface ScanUser { username?: string; full_name?: string; }
interface ScanProject { id: string; project_no: string; project_name: string; account_name?: string; }
interface ReceiptRef { oneDriveId: string; webUrl: string; filename: string; }
interface ScanContext { kind: string; formNo?: string; year?: string; folderPath?: string; rowId?: string; label?: string; }

type ScanMode = 'project' | 'overhead';
type Severity = 'success' | 'error' | 'warning' | 'info';

const todayStr = (): string => new Date().toISOString().slice(0, 10);

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ minHeight: '100dvh', bgcolor: '#f5f5f5', p: 2 }}>
    <Box sx={{ maxWidth: 480, mx: 'auto' }}>{children}</Box>
  </Box>
);

const ScanPage: React.FC = () => {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<ScanUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [needsQr, setNeedsQr] = useState(false);
  const [exchanging, setExchanging] = useState(true);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [scanContext, setScanContext] = useState<ScanContext | null>(null);
  const [deductible, setDeductible] = useState<boolean | null>(null);
  const [deductibleReason, setDeductibleReason] = useState<string | null>(null);
  const [customerIssues, setCustomerIssues] = useState<string[]>([]);

  const [mode, setMode] = useState<ScanMode>('project');
  const [projects, setProjects] = useState<ScanProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ScanProject | null>(null);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceType, setInvoiceType] = useState('');
  const [vat, setVat] = useState('');

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lowConf, setLowConf] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editBlob, setEditBlob] = useState<Blob | null>(null);
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [editQuad, setEditQuad] = useState<Quad | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedAmount, setSavedAmount] = useState('');
  const [batchMode, setBatchMode] = useState(false);

  const [snackbar, setSnackbar] = useState<{ open: boolean; severity: Severity; message: string }>(
    { open: false, severity: 'success', message: '' },
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exchangeStartedRef = useRef(false);

  const showSnack = useCallback((severity: Severity, message: string) => {
    setSnackbar({ open: true, severity, message });
  }, []);

  const handleSessionExpired = useCallback(() => {
    setAuthed(false);
    setAuthError('Session expired — re-scan the QR from desktop.');
  }, []);

  useEffect(() => {
    if (exchangeStartedRef.current) return;
    exchangeStartedRef.current = true;
    const run = async () => {
      const pairing = new URLSearchParams(window.location.search).get('token');
      if (pairing) {
        setPairingToken(pairing);
        try {
          const res = await fetch(`${API_BASE}/api/auth/qr/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pairingToken: pairing }),
          });
          const data = await res.json().catch(() => ({ ok: false }));
          if (res.ok && data.ok && data.token) {
            localStorage.setItem('netpacific_token', data.token);
            setUser(data.user || null);
            setScanContext(data.context || null);
            setAuthed(true);
            window.history.replaceState({}, '', '/scan');
          } else if ((localStorage.getItem('netpacific_token') || '').startsWith('scan_')) {
            setAuthed(true);
            window.history.replaceState({}, '', '/scan');
          } else {
            setAuthError('This code is invalid or expired. Re-scan the QR from the desktop app.');
          }
        } catch {
          setAuthError('This code is invalid or expired. Re-scan the QR from the desktop app.');
        }
      } else if ((localStorage.getItem('netpacific_token') || '').startsWith('scan_')) {
        setAuthed(true);
      } else {
        setNeedsQr(true);
      }
      setExchanging(false);
    };
    void run();
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    const loadProjects = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects`, { headers: authHeaders() });
        if (res.status === 401) { if (!cancelled) handleSessionExpired(); return; }
        const data = await res.json().catch(() => []);
        const list: ScanProject[] = Array.isArray(data) ? data : (data.projects || []);
        if (!cancelled) {
          setProjects(list.map((p) => ({
            id: String(p.id), project_no: p.project_no, project_name: p.project_name, account_name: p.account_name,
          })));
        }
      } catch {
        if (!cancelled) showSnack('error', 'Could not load projects. Check your connection.');
      }
    };
    void loadProjects();
    return () => { cancelled = true; };
  }, [authed, handleSessionExpired, showSnack]);

  const setEdit = useCallback((blob: Blob | null, quad: Quad | null) => {
    setEditUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return blob ? URL.createObjectURL(blob) : null; });
    setEditBlob(blob);
    setEditQuad(quad);
  }, []);

  useEffect(() => () => { if (editUrl) URL.revokeObjectURL(editUrl); }, [editUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = '';
    if (!rawFile) return;
    setBusy(true);
    setParseError(null);
    setLowConf(false);
    try {
      const file = await convertHeicToJpeg(rawFile);
      let detected = await detectReceiptQuad(file);
      if (!detected) {
        try {
          const imageBase64 = await blobToBase64(file);
          detected = await detectCropFromServer(imageBase64, file.type || 'image/jpeg');
        } catch { /* best-effort */ }
      }
      const quad: Quad = detected ?? [
        { x: 0.12, y: 0.14 }, { x: 0.88, y: 0.14 }, { x: 0.88, y: 0.86 }, { x: 0.12, y: 0.86 },
      ];
      setEdit(file, quad);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setParseError(`Could not process photo: ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const retakePhoto = () => {
    setEdit(null, null);
    setParseError(null);
    fileInputRef.current?.click();
  };

  const confirmCrop = async (quad: Quad) => {
    if (!editBlob) return;
    setBusy(true);
    setParseError(null);
    setLowConf(false);
    try {
      const flattened = await perspectiveCropToBlob(editBlob, quad);
      const file = new File([flattened], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setPendingFile(file);
      const imageBase64 = await blobToBase64(flattened);
      const parsed = await parseReceipt(imageBase64, 'image/jpeg');
      const amt = parsed.total ?? parsed.subtotal;
      setAmount(typeof amt === 'number' ? String(amt) : '');
      setDate(parsed.date || '');
      setCategory((EXPENSE_CATEGORIES as readonly string[]).includes(parsed.suggestedCategory) ? parsed.suggestedCategory : '');
      setDescription(parsed.description || parsed.lineItems?.[0]?.description || parsed.vendor || '');
      setSupplier(parsed.vendor || '');
      setInvoiceNumber(parsed.invoiceNumber || '');
      setInvoiceType(parsed.invoiceType || '');
      setVat(typeof parsed.tax === 'number' && parsed.tax > 0 ? String(parsed.tax) : '');
      setDeductible(typeof parsed.deductible === 'boolean' ? parsed.deductible : null);
      setDeductibleReason(parsed.deductibleReason || null);
      setCustomerIssues(parsed.customerValidation?.issues || []);
      setLowConf(typeof parsed.confidence === 'number' && parsed.confidence < 0.5);
      setEdit(null, null);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setParseError(`Could not read receipt: ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    const numericAmount = Number(amount);
    if (!(numericAmount > 0)) return;
    if (mode === 'project' && !selectedProject) return;
    setSaving(true);
    let receiptRef: ReceiptRef | undefined;
    if (pendingFile) {
      try {
        const blob = await compressForUpload(pendingFile);
        const contentBase64 = await blobToBase64(blob);
        const year = String(new Date().getFullYear());
        const folderPath = mode === 'project' && selectedProject
          ? `Project Receipts/${selectedProject.project_no}/${year}`
          : `00 Overhead Receipts/${year}`;
        const filename = `SCAN-${Date.now()}.jpg`;
        const r = await fetch(`${API_BASE}/api/onedrive/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ folderPath, filename, contentBase64 }),
        });
        const d = await r.json().catch(() => ({ ok: false }));
        if (d.ok) receiptRef = { oneDriveId: d.id, webUrl: d.webUrl, filename };
      } catch { /* best-effort */ }
    }
    const meta: Record<string, string | number | boolean> = {};
    if (supplier.trim()) meta.supplier = supplier.trim();
    if (invoiceNumber.trim()) meta.invoiceNo = invoiceNumber.trim();
    if (invoiceType.trim()) meta.invoiceType = invoiceType.trim();
    const vatNum = Number(vat);
    if (vat.trim() && Number.isFinite(vatNum) && vatNum > 0) meta.vat = vatNum;
    if (typeof deductible === 'boolean') meta.deductible = deductible;
    if (deductibleReason && deductibleReason.trim()) meta.deductibleReason = deductibleReason.trim();
    try {
      const url = mode === 'project' ? `${API_BASE}/api/project-expenses` : `${API_BASE}/api/overhead-expenses`;
      const body = mode === 'project' && selectedProject
        ? { projectId: selectedProject.id, projectName: selectedProject.project_name, description, amount: numericAmount, date: date || todayStr(), category: category || 'Others', sourceType: 'receipt_scan', receiptRef, ...meta }
        : { description, amount: numericAmount, date: date || todayStr(), category: category || 'Others', sourceType: 'receipt_scan', receiptRef, ...meta };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
      if (res.status === 401) { handleSessionExpired(); return; }
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) { setSavedAmount(numericAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })); setSaved(true); }
      else { showSnack('error', 'Could not save the expense. Please try again.'); }
    } catch {
      showSnack('error', 'Could not save the expense. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const deliverToDesktop = scanContext?.kind === 'liquidation';

  const makeThumb = async (file: File): Promise<string> => {
    try {
      return await new Promise<string>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const MAX = 240;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('no ctx')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load failed')); };
        img.src = url;
      });
    } catch { return ''; }
  };

  const handleSendToDesktop = async () => {
    if (!pendingFile || !pairingToken || !scanContext?.folderPath) return;
    setSaving(true);
    try {
      const blob = await compressForUpload(pendingFile);
      const contentBase64 = await blobToBase64(blob);
      const filename = `SCAN-${Date.now()}.jpg`;
      const upRes = await fetch(`${API_BASE}/api/onedrive/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ folderPath: scanContext.folderPath, filename, contentBase64 }),
      });
      if (upRes.status === 401) { handleSessionExpired(); return; }
      const upData = await upRes.json().catch(() => ({ ok: false }));
      if (!upData.ok) { showSnack('error', 'Could not upload receipt to OneDrive. Please try again.'); return; }
      const thumb = await makeThumb(pendingFile);
      const jobRes = await fetch(`${API_BASE}/api/scan-jobs/${pairingToken}/result`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          receipt: {
            oneDriveId: upData.id, webUrl: upData.webUrl, filename,
            ...(thumb ? { thumbnailDataUrl: thumb } : {}),
            parsed: {
              amount: Number(amount) > 0 ? Number(amount) : null, date: date || null, category: category || null,
              particulars: description || supplier || null, vendor: supplier || null, invoiceNo: invoiceNumber || null,
              deductible, deductibleReason, customerInfoIssues: customerIssues, confidence: lowConf ? 0.4 : 0.9,
            },
          },
        }),
      });
      if (jobRes.status === 401) { handleSessionExpired(); return; }
      const jobData = await jobRes.json().catch(() => ({ ok: false }));
      if (jobData.ok) { setSavedAmount(''); setSaved(true); }
      else { showSnack('error', 'Could not send receipt to desktop. Please try again.'); }
    } catch {
      showSnack('error', 'Could not send receipt to desktop. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setAmount(''); setDate(''); setCategory(''); setDescription(''); setSupplier(''); setInvoiceNumber('');
    setInvoiceType(''); setVat(''); setDeductible(null); setDeductibleReason(null); setCustomerIssues([]);
    setPendingFile(null); setLowConf(false); setParseError(null); setSaved(false); setSavedAmount(''); setEdit(null, null);
  };

  const canSave = !busy && !saving && Number(amount) > 0 && (mode === 'overhead' || !!selectedProject);

  if (exchanging) {
    return (<Shell><Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}><CircularProgress /><Typography variant="body2" color="text.secondary">Connecting…</Typography></Box></Shell>);
  }
  if (needsQr) {
    return (<Shell><Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center' }}><Typography variant="body1" color="text.secondary">Open this page by scanning the QR code in the desktop app (Expense Monitoring → Scan with phone).</Typography></Box></Shell>);
  }
  if (!authed) {
    return (<Shell><Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Alert severity="error" sx={{ width: '100%' }}>{authError || 'This code is invalid or expired. Re-scan the QR from the desktop app.'}</Alert></Box></Shell>);
  }
  if (saved) {
    return (<Shell><Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 2, textAlign: 'center' }}><CheckCircleIcon sx={{ fontSize: 72, color: 'success.main' }} /><Typography variant="h6" sx={{ fontWeight: 700 }}>{deliverToDesktop ? 'Sent to desktop!' : `Saved! ₱${savedAmount} recorded.`}</Typography><Button variant="contained" size="large" fullWidth onClick={resetForm} sx={{ maxWidth: 320 }}>Scan another</Button></Box></Shell>);
  }

  if (batchMode) {
    return (
      <Shell>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Photo Receipt Scanner</Typography>
          <Typography variant="caption" color="text.secondary">Signed in as {user?.full_name || user?.username || 'team member'}</Typography>
        </Box>
        <ScanBatch
          mode={mode}
          selectedProject={selectedProject}
          onCancel={() => setBatchMode(false)}
          onComplete={(n) => { setBatchMode(false); showSnack('success', `Saved ${n} receipt${n === 1 ? '' : 's'}.`); }}
          deliverToDesktop={deliverToDesktop}
          pairingToken={pairingToken}
          scanContext={scanContext}
        />
        <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar((p) => ({ ...p, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert onClose={() => setSnackbar((p) => ({ ...p, open: false }))} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert>
        </Snackbar>
      </Shell>
    );
  }

  return (
    <Shell>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Photo Receipt Scanner</Typography>
        <Typography variant="caption" color="text.secondary">Signed in as {user?.full_name || user?.username || 'team member'}</Typography>
        {deliverToDesktop && scanContext?.label && (<Typography variant="caption" display="block" color="primary.main" sx={{ mt: 0.5 }}>Scanning for: {scanContext.label}</Typography>)}
      </Box>
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        {!deliverToDesktop && (
          <ToggleButtonGroup exclusive fullWidth color="primary" value={mode} onChange={(_e, val: ScanMode | null) => { if (val) setMode(val); }} sx={{ mb: 2 }}>
            <ToggleButton value="project">Project</ToggleButton>
            <ToggleButton value="overhead">Overhead</ToggleButton>
          </ToggleButtonGroup>
        )}
        {!deliverToDesktop && mode === 'project' && (
          <Autocomplete options={projects} value={selectedProject} onChange={(_e, val) => setSelectedProject(val)} getOptionLabel={(p) => `${p.project_no} — ${p.project_name}`} isOptionEqualToValue={(a, b) => a.id === b.id} renderInput={(params) => (<TextField {...params} label="Project" size="small" required sx={{ mb: 2 }} />)} />
        )}
        {!editUrl && (
          <>
            <Button variant="contained" size="large" fullWidth startIcon={busy ? <CircularProgress size={20} color="inherit" /> : <CameraAltIcon />} disabled={busy} onClick={() => fileInputRef.current?.click()} sx={{ py: 1.5, mb: 2 }}>{busy ? 'Processing…' : 'Scan Receipt'}</Button>
            <Button variant="outlined" size="large" fullWidth startIcon={<PhotoLibraryIcon />} onClick={() => setBatchMode(true)} sx={{ py: 1.5, mb: 2 }}>Scan Multiple</Button>
          </>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
        {editUrl && editQuad && (
          <Box sx={{ mb: 2 }}><ReceiptCropper imageUrl={editUrl} initialQuad={editQuad} busy={busy} onConfirm={confirmCrop} onRetake={retakePhoto} /></Box>
        )}
        {lowConf && (<Alert severity="warning" sx={{ mb: 2 }}>Low confidence — please verify the values.</Alert>)}
        {parseError && (<Alert severity="error" sx={{ mb: 2 }}>{parseError}</Alert>)}
        {customerIssues.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>Check the customer info written on the receipt — it should say IO Control Technologie OPC, TIN 697-029-976, Biñan, Laguna:<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{customerIssues.map((m, i) => (<li key={i}>{m}</li>))}</ul></Alert>
        )}
        <TextField fullWidth label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} inputProps={{ min: 0, step: 0.01 }} InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} sx={{ mb: 2 }} />
        <TextField fullWidth label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ mb: 2 }} />
        <TextField fullWidth select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ mb: 2 }}><MenuItem value="">— Select category —</MenuItem>{EXPENSE_CATEGORIES.map((c) => (<MenuItem key={c} value={c}>{c}</MenuItem>))}</TextField>
        <TextField fullWidth label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={2} sx={{ mb: 2 }} />
        <TextField fullWidth label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} sx={{ mb: 2 }} />
        <TextField fullWidth label="Invoice No." value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} helperText={invoiceType || undefined} sx={{ mb: 2 }} />
        <TextField fullWidth label="VAT" type="number" value={vat} onChange={(e) => setVat(e.target.value)} inputProps={{ min: 0, step: 0.01 }} InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} helperText="Leave blank for non-VAT receipts" sx={{ mb: 2 }} />
        {deliverToDesktop ? (
          <Button variant="contained" size="large" fullWidth color="primary" disabled={busy || saving || !pendingFile} onClick={handleSendToDesktop} startIcon={saving ? <CircularProgress size={20} color="inherit" /> : undefined} sx={{ py: 1.5 }}>{saving ? 'Sending…' : 'Send to desktop'}</Button>
        ) : (
          <Button variant="contained" size="large" fullWidth color="success" disabled={!canSave} onClick={handleSave} startIcon={saving ? <CircularProgress size={20} color="inherit" /> : undefined} sx={{ py: 1.5 }}>{saving ? 'Saving…' : 'Save Expense'}</Button>
        )}
      </Paper>
      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar((p) => ({ ...p, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar((p) => ({ ...p, open: false }))} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Shell>
  );
};

class ScanErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (<Box sx={{ minHeight: '100dvh', bgcolor: '#f5f5f5', p: 2 }}><Box sx={{ maxWidth: 480, mx: 'auto' }}><Alert severity="error" sx={{ mb: 2 }}><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Scanner error</Typography><Typography variant="caption" sx={{ wordBreak: 'break-word' }}>{this.state.error.message || String(this.state.error)}</Typography></Alert><Button variant="contained" fullWidth onClick={() => window.location.reload()}>Reload</Button></Box></Box>);
    }
    return this.props.children;
  }
}

const ScanPageWithBoundary: React.FC = () => (<ScanErrorBoundary><ScanPage /></ScanErrorBoundary>);
export default ScanPageWithBoundary;
