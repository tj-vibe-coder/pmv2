import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button,
  CircularProgress, IconButton, InputAdornment, LinearProgress,
  MenuItem, Snackbar, TextField, Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { convertHeicToJpeg, makeThumb } from '../utils/receipts/imageUtils';
import { perspectiveCropToBlob, type Quad } from '../utils/receipts/perspectiveCrop';
import { detectReceiptQuad } from '../utils/receipts/autoCrop';
import { compressForUpload, blobToBase64 } from '../utils/receipts/imageCompress';
import { parseReceipt } from '../services/receiptParseService';
import ReceiptCropper from './ReceiptCropper';
import LiveCameraCapture from './LiveCameraCapture';
import { EXPENSE_CATEGORIES } from '../data/financeCategories';
import { API_BASE } from '../config/api';

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const index = i++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

const authHeaders = (): Record<string, string> => {
  const t = localStorage.getItem('netpacific_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const todayStr = (): string => new Date().toISOString().slice(0, 10);


const DEFAULT_QUAD: Quad = [
  { x: 0.12, y: 0.14 }, { x: 0.88, y: 0.14 },
  { x: 0.88, y: 0.86 }, { x: 0.12, y: 0.86 },
];

enum BatchStage {
  select = 'select',
  cropping = 'cropping',
  parsing = 'parsing',
  review = 'review',
  done = 'done',
}

export interface BatchItemFields {
  amount: string;
  date: string;
  category: string;
  description: string;
  supplier: string;
  invoiceNumber: string;
  invoiceType: string;
  vat: string;
  deductible: boolean | null;
  deductibleReason: string | null;
  customerIssues: string[];
  lowConf: boolean;
  // Only used in mode === 'project' when a `projects` list is supplied — lets each
  // receipt in the batch be filed under a different project instead of forcing the
  // whole batch under one `selectedProject`.
  projectId: string;
}

interface BatchItem {
  id: string;
  rawFile: File;
  croppedBlob?: Blob;
  fields: BatchItemFields;
  parseError?: string;
  saveError?: string;
  isSaved: boolean;
}

export interface ScanProject {
  id: string;
  project_no: string;
  project_name: string;
  account_name?: string;
}

// A batch item handed to a caller-supplied save handler when mode === 'liquidation'
// (liquidation rows live in the form's local state, not a REST resource, so there's
// no fixed endpoint to POST to like the project/overhead modes have).
export interface LiquidationScanItem {
  rawFile: File;
  croppedBlob?: Blob;
  fields: BatchItemFields;
}

interface ScanBatchProps {
  mode: 'project' | 'overhead' | 'liquidation';
  selectedProject: ScanProject | null;
  onCancel: () => void;
  onComplete: (savedCount: number) => void;
  deliverToDesktop?: boolean;
  pairingToken?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scanContext?: any;
  // Category list to validate the AI's suggested category against and to offer in
  // the review step's dropdown. Defaults to the full EXPENSE_CATEGORIES union.
  categories?: readonly string[];
  // Required when mode === 'liquidation': receives each item once cropped/parsed and
  // returns whether it was successfully added to the liquidation (e.g. as a new row).
  onLiquidationItem?: (item: LiquidationScanItem) => Promise<boolean>;
  // Only meaningful in mode === 'project'. When provided, the review step offers a
  // per-receipt Project picker (defaulting to `selectedProject`, if any) instead of
  // forcing every receipt in the batch under a single project — lets one upload mix
  // receipts from different projects.
  projects?: ScanProject[];
}

const emptyFields = (defaultProjectId = ''): BatchItemFields => ({
  amount: '', date: '', category: '', description: '',
  supplier: '', invoiceNumber: '', invoiceType: '', vat: '',
  deductible: null, deductibleReason: null, customerIssues: [], lowConf: false,
  projectId: defaultProjectId,
});

const ScanBatch: React.FC<ScanBatchProps> = ({ mode, selectedProject, onCancel, onComplete, deliverToDesktop, pairingToken, scanContext, categories, onLiquidationItem, projects }) => {
  const categoryList = categories ?? EXPENSE_CATEGORIES;
  const perItemProject = mode === 'project' && !!projects;
  const [stage, setStage] = useState<BatchStage>(BatchStage.select);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [cropIndex, setCropIndex] = useState(0);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [cropQuad, setCropQuad] = useState<Quad>(DEFAULT_QUAD);
  const [cropBusy, setCropBusy] = useState(false);
  const [parsedCount, setParsedCount] = useState(0);
  const [tooManyWarn, setTooManyWarn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalSavedCount, setFinalSavedCount] = useState(0);
  const [snack, setSnack] = useState<{
    open: boolean; severity: 'success' | 'error' | 'warning' | 'info'; msg: string;
  }>({ open: false, severity: 'success', msg: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUrlRef = useRef<string | null>(null);
  // Guards against a double-tap re-entering save before the `saving` state has
  // re-rendered the disabled button (the state read inside the handler is stale).
  const savingRef = useRef(false);

  useEffect(() => () => {
    if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current);
  }, []);

  // Advance to the success screen once every savable item has been saved (and at
  // least one was). Driven off live `items` so it also covers the case where the
  // user deletes the last remaining (failed) item after a partial save — otherwise
  // they'd be stranded on an empty review screen with no completion signal.
  useEffect(() => {
    if (stage !== BatchStage.review || saving) return;
    const remaining = items.filter((it) => !it.isSaved && Number(it.fields.amount) > 0).length;
    const saved = items.filter((it) => it.isSaved).length;
    if (saved > 0 && remaining === 0) {
      setFinalSavedCount(saved);
      setStage(BatchStage.done);
    }
  }, [items, stage, saving]);

  const revokeCurrentUrl = useCallback(() => {
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }
    setCropUrl(null);
  }, []);

  const loadCropForFile = useCallback(async (file: File) => {
    setCropBusy(true);
    revokeCurrentUrl();
    try {
      const url = URL.createObjectURL(file);
      activeUrlRef.current = url;
      setCropUrl(url);
      const quad = await detectReceiptQuad(file);
      setCropQuad(quad ?? DEFAULT_QUAD);
    } catch {
      setCropQuad(DEFAULT_QUAD);
    } finally {
      setCropBusy(false);
    }
  }, [revokeCurrentUrl]);

  const processFiles = async (files: File[]) => {
    if (!files.length) return;
    // Gemini's rate limit is 15 requests/minute; cap the batch at 10 to leave a buffer
    // (parsing runs at concurrency 3, so 10 items comfortably stays under the limit).
    const tooMany = files.length > 10;
    setTooManyWarn(tooMany);
    const sliced = tooMany ? files.slice(0, 10) : files;
    try {
      // convertHeicToJpeg already swallows its own errors and returns the original
      // file on failure, but guard the whole batch so one bad file can't strand the UI.
      const converted = await mapWithConcurrency(sliced, 3, (f) => convertHeicToJpeg(f));
      const newItems: BatchItem[] = converted.map((f, i) => ({
        id: `bi-${Date.now()}-${i}`,
        rawFile: f,
        fields: emptyFields(selectedProject?.id ?? ''),
        isSaved: false,
      }));
      setItems(newItems);
      setCropIndex(0);
      setStage(BatchStage.cropping);
      await loadCropForFile(newItems[0].rawFile);
    } catch (err) {
      setSnack({ open: true, severity: 'error', msg: err instanceof Error ? err.message : 'Could not load the selected photos.' });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    void processFiles(files);
  };

  const startParsing = async (itemList: BatchItem[]) => {
    setStage(BatchStage.parsing);
    setParsedCount(0);
    const parsed = await mapWithConcurrency(itemList, 3, async (item) => {
      try {
        const blob = item.croppedBlob ?? item.rawFile;
        const b64 = await blobToBase64(blob);
        const pr = await parseReceipt(b64, 'image/jpeg');
        const amt = pr.total ?? pr.subtotal;
        const sugCat = pr.suggestedCategory ?? '';
        const fields: BatchItemFields = {
          amount: typeof amt === 'number' ? String(amt) : '',
          date: pr.date || '',
          category: categoryList.includes(sugCat) ? sugCat : '',
          description: pr.description || pr.vendor || '',
          supplier: pr.vendor || '',
          invoiceNumber: pr.invoiceNumber || '',
          invoiceType: pr.invoiceType || '',
          vat: typeof pr.tax === 'number' && pr.tax > 0 ? String(pr.tax) : '',
          deductible: typeof pr.deductible === 'boolean' ? pr.deductible : null,
          deductibleReason: pr.deductibleReason || null,
          customerIssues: pr.customerValidation?.issues ?? [],
          lowConf: typeof pr.confidence === 'number' && pr.confidence < 0.5,
          projectId: item.fields.projectId,
        };
        setParsedCount((c) => c + 1);
        return { ...item, fields };
      } catch (err) {
        setParsedCount((c) => c + 1);
        return { ...item, parseError: err instanceof Error ? err.message : 'Parse failed' };
      }
    });
    setItems(parsed);
    setStage(BatchStage.review);
  };

  const handleCropConfirm = async (quad: Quad) => {
    if (cropBusy) return;
    const item = items[cropIndex];
    if (!item) return;
    setCropBusy(true);
    try {
      const cropped = await perspectiveCropToBlob(item.rawFile, quad);
      revokeCurrentUrl();
      const updated = items.map((it, i) => i === cropIndex ? { ...it, croppedBlob: cropped } : it);
      setItems(updated);
      const next = cropIndex + 1;
      if (next >= updated.length) {
        await startParsing(updated);
      } else {
        setCropIndex(next);
        await loadCropForFile(updated[next].rawFile);
      }
    } finally {
      setCropBusy(false);
    }
  };

  const handleRetake = async () => {
    const item = items[cropIndex];
    if (!item) return;
    setCropBusy(true);
    try {
      const quad = await detectReceiptQuad(item.rawFile);
      setCropQuad(quad ?? DEFAULT_QUAD);
    } catch {
      setCropQuad(DEFAULT_QUAD);
    } finally {
      setCropBusy(false);
    }
  };

  const handleSkipCropping = async () => {
    if (cropBusy) return;
    setCropBusy(true);
    revokeCurrentUrl();
    try {
      const withCrops = await mapWithConcurrency(items, 3, async (item) => {
        if (item.croppedBlob) return item;
        try {
          return { ...item, croppedBlob: await perspectiveCropToBlob(item.rawFile, DEFAULT_QUAD) };
        } catch { return item; }
      });
      await startParsing(withCrops);
    } finally {
      setCropBusy(false);
    }
  };

  const updateField = (id: string, updates: Partial<BatchItemFields>) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, fields: { ...it.fields, ...updates } } : it));
  };

  const deleteItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const saveOne = async (item: BatchItem, idx: number): Promise<BatchItem> => {
    if (mode === 'liquidation') {
      if (!onLiquidationItem) return { ...item, saveError: 'Liquidation handler not configured.' };
      try {
        const ok = await onLiquidationItem({ rawFile: item.rawFile, croppedBlob: item.croppedBlob, fields: item.fields });
        return ok ? { ...item, isSaved: true, saveError: undefined } : { ...item, saveError: 'Could not add to liquidation.' };
      } catch (err) {
        return { ...item, saveError: err instanceof Error ? err.message : 'Save failed' };
      }
    }
    const targetProject = perItemProject
      ? (projects || []).find((p) => p.id === item.fields.projectId) || null
      : selectedProject;
    // In per-item mode a receipt with no project assigned isn't an error — it just
    // falls back to an overhead expense instead of a project one (see url/body below).
    if (!deliverToDesktop && mode === 'project' && !targetProject && !perItemProject) {
      return { ...item, saveError: 'No project selected for this receipt.' };
    }
    try {
      const compressed = await compressForUpload(item.croppedBlob ?? item.rawFile);
      const contentBase64 = await blobToBase64(compressed);
      const year = String(new Date().getFullYear());
      const filename = `SCAN-${Date.now()}-${idx}.jpg`;

      if (deliverToDesktop) {
        if (!pairingToken || !scanContext?.folderPath) {
          return { ...item, saveError: 'Missing desktop context.' };
        }
        const r = await fetch(`${API_BASE}/api/onedrive/upload`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ folderPath: scanContext.folderPath, filename, contentBase64 }),
        });
        const d = await r.json().catch(() => ({ ok: false })) as { ok: boolean; id?: string; webUrl?: string };
        if (!d.ok || !d.id || !d.webUrl) return { ...item, saveError: 'Could not upload to OneDrive.' };

        const thumb = await makeThumb(item.croppedBlob ?? item.rawFile);
        const f = item.fields;
        const jobRes = await fetch(`${API_BASE}/api/scan-jobs/${pairingToken}/result`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            receipt: {
              oneDriveId: d.id, webUrl: d.webUrl, filename,
              ...(thumb ? { thumbnailDataUrl: thumb } : {}),
              parsed: {
                amount: Number(f.amount) > 0 ? Number(f.amount) : null,
                date: f.date || null,
                category: f.category || null,
                particulars: f.description || f.supplier || null,
                vendor: f.supplier || null,
                invoiceNo: f.invoiceNumber || null,
                deductible: f.deductible,
                deductibleReason: f.deductibleReason,
                customerInfoIssues: f.customerIssues,
                confidence: f.lowConf ? 0.4 : 0.9,
              },
            },
          }),
        });
        const jobData = await jobRes.json().catch(() => ({ ok: false })) as { ok: boolean };
        if (jobData.ok) return { ...item, isSaved: true, saveError: undefined };
        return { ...item, saveError: 'Could not send to desktop.' };
      }

      const folderPath = mode === 'project' && targetProject
        ? `Project Receipts/${targetProject.project_no}/${year}`
        : `00 Overhead Receipts/${year}`;

      let receiptRef: { oneDriveId: string; webUrl: string; filename: string } | undefined;
      try {
        const r = await fetch(`${API_BASE}/api/onedrive/upload`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ folderPath, filename, contentBase64 }),
        });
        const d = await r.json().catch(() => ({ ok: false })) as { ok: boolean; id?: string; webUrl?: string };
        if (d.ok && d.id && d.webUrl) receiptRef = { oneDriveId: d.id, webUrl: d.webUrl, filename };
      } catch { /* best-effort */ }

      const f = item.fields;
      const meta: Record<string, string | number | boolean> = {};
      if (f.supplier.trim()) meta.supplier = f.supplier.trim();
      if (f.invoiceNumber.trim()) meta.invoiceNo = f.invoiceNumber.trim();
      if (f.invoiceType.trim()) meta.invoiceType = f.invoiceType.trim();
      const vatNum = Number(f.vat);
      if (f.vat.trim() && Number.isFinite(vatNum) && vatNum > 0) meta.vat = vatNum;
      if (typeof f.deductible === 'boolean') meta.deductible = f.deductible;
      if (f.deductibleReason?.trim()) meta.deductibleReason = f.deductibleReason.trim();

      // A per-item batch with no project assigned on this receipt falls back to
      // overhead — same endpoint/shape as mode === 'overhead' uses.
      const url = (mode === 'project' && targetProject) ? `${API_BASE}/api/project-expenses` : `${API_BASE}/api/overhead-expenses`;
      const body = (mode === 'project' && targetProject)
        ? { projectId: targetProject.id, projectName: targetProject.project_name, description: f.description, amount: Number(f.amount), date: f.date || todayStr(), category: f.category || 'Others', sourceType: 'receipt_scan', receiptRef, ...meta }
        : { description: f.description, amount: Number(f.amount), date: f.date || todayStr(), category: f.category || 'Others', sourceType: 'receipt_scan', receiptRef, ...meta };

      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({ success: false })) as { success: boolean };
      if (data.success) return { ...item, isSaved: true, saveError: undefined };
      return { ...item, saveError: 'Server rejected the expense.' };
    } catch (err) {
      return { ...item, saveError: err instanceof Error ? err.message : 'Save failed' };
    }
  };

  const handleSaveAll = async () => {
    if (savingRef.current) return;
    const toSave = items.filter((it) => !it.isSaved && Number(it.fields.amount) > 0);
    if (!toSave.length) return;
    savingRef.current = true;
    setSaving(true);
    const results = await mapWithConcurrency(toSave, 3, saveOne);
    const resultMap = new Map(results.map((r) => [r.id, r]));
    // Functional update so edits/deletes the user made DURING the (multi-second)
    // save are preserved. Only the save outcome (isSaved/saveError) is propagated;
    // the live `fields` are kept, never overwritten by the stale pre-save snapshot.
    setItems((prev) => prev.map((it) => {
      const r = resultMap.get(it.id);
      return r ? { ...it, isSaved: r.isSaved, saveError: r.saveError } : it;
    }));
    const newlySaved = results.filter((r) => r.isSaved).length;
    savingRef.current = false;
    setSaving(false);
    setSnack({ open: true, severity: newlySaved === toSave.length ? 'success' : 'warning', msg: `Saved ${newlySaved} of ${toSave.length} receipts.` });
    // Completion is handled by the effect that watches `items` — it sees the live
    // post-save state, so it stays correct even if the user edited during the save.
  };

  const resetToSelect = () => {
    revokeCurrentUrl();
    setItems([]); setCropIndex(0); setParsedCount(0); setTooManyWarn(false); setFinalSavedCount(0);
    setStage(BatchStage.select);
  };

  // ── select ───────────────────────────────────────────────────────────────────
  if (stage === BatchStage.select) {
    return (
      <Box>
        {tooManyWarn && <Alert severity="warning" sx={{ mb: 2 }}>Only the first 10 photos were selected (batch limit, to stay within the AI parser's rate limit).</Alert>}
        <Button variant="contained" size="large" fullWidth startIcon={<CameraAltIcon />}
          onClick={() => setCameraOpen(true)} sx={{ py: 1.5, mb: 2 }}>
          Take Photos
        </Button>
        <Button variant="outlined" size="large" fullWidth startIcon={<PhotoLibraryIcon />}
          onClick={() => fileInputRef.current?.click()} sx={{ py: 1.5, mb: 2 }}>
          Choose from Library
        </Button>
        <Button variant="outlined" fullWidth onClick={onCancel}>Cancel</Button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
        {cameraOpen && (
          <LiveCameraCapture
            onDone={(files) => { setCameraOpen(false); void processFiles(files); }}
            onCancel={() => setCameraOpen(false)}
            onFallbackToPicker={() => { setCameraOpen(false); fileInputRef.current?.click(); }}
          />
        )}
      </Box>
    );
  }

  // ── cropping ─────────────────────────────────────────────────────────────────
  if (stage === BatchStage.cropping) {
    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">Crop {cropIndex + 1} of {items.length}</Typography>
          <Button size="small" onClick={handleSkipCropping} disabled={cropBusy}>Skip cropping (use full photos)</Button>
        </Box>
        {cropUrl ? (
          <ReceiptCropper imageUrl={cropUrl} initialQuad={cropQuad} busy={cropBusy} onConfirm={handleCropConfirm} onRetake={handleRetake} />
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        )}
      </Box>
    );
  }

  // ── parsing ──────────────────────────────────────────────────────────────────
  if (stage === BatchStage.parsing) {
    const pct = items.length > 0 ? Math.round((parsedCount / items.length) * 100) : 0;
    return (
      <Box sx={{ py: 4 }}>
        <Typography variant="body1" sx={{ mb: 2, textAlign: 'center' }}>
          Reading receipt {Math.min(parsedCount + 1, items.length)} of {items.length}…
        </Typography>
        <LinearProgress variant="determinate" value={pct} sx={{ borderRadius: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>{pct}%</Typography>
      </Box>
    );
  }

  // ── done ─────────────────────────────────────────────────────────────────────
  if (stage === BatchStage.done) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, gap: 2 }}>
        <CheckCircleIcon sx={{ fontSize: 72, color: 'success.main' }} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Saved {finalSavedCount} receipt{finalSavedCount === 1 ? '' : 's'}</Typography>
        <Button variant="contained" size="large" fullWidth sx={{ maxWidth: 320 }} onClick={resetToSelect}>Scan more</Button>
        <Button variant="text" size="large" fullWidth sx={{ maxWidth: 320 }} onClick={() => onComplete(finalSavedCount)}>Done</Button>
      </Box>
    );
  }

  // ── review ───────────────────────────────────────────────────────────────────
  const visibleItems = items.filter((it) => !it.isSaved);
  const totalAmt = visibleItems.reduce((s, it) => s + (Number(it.fields.amount) || 0), 0);
  const hasSaveErrors = visibleItems.some((it) => it.saveError);
  const failedCount = visibleItems.filter((it) => it.saveError).length;
  // In per-item mode a missing project isn't blocking — it just saves as overhead —
  // so only the classic single-project mode needs a `selectedProject` to be savable.
  const hasValidTarget = (it: BatchItem) =>
    mode !== 'project' || deliverToDesktop || perItemProject || !!selectedProject;
  const savableCount = visibleItems.filter((it) => Number(it.fields.amount) > 0 && hasValidTarget(it)).length;
  const canSaveAll = !saving && savableCount > 0;
  const missingProjectCount = perItemProject ? visibleItems.filter((it) => !it.fields.projectId).length : 0;
  const btnLabel = saving ? 'Saving…' : hasSaveErrors ? `Retry Failed (${failedCount})` : `Save All (${savableCount})`;

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {visibleItems.length} receipt{visibleItems.length !== 1 ? 's' : ''} — Total ₱{totalAmt.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
        </Typography>
        {!deliverToDesktop && mode === 'project' && !perItemProject && !selectedProject && (
          <Alert severity="warning" sx={{ mt: 1 }}>No project selected — go back and select a project before saving.</Alert>
        )}
        {!deliverToDesktop && perItemProject && missingProjectCount > 0 && (
          <Alert severity="info" sx={{ mt: 1 }}>
            {missingProjectCount} receipt{missingProjectCount === 1 ? '' : 's'} with no project assigned will be saved as Overhead Expense{missingProjectCount === 1 ? '' : 's'} instead.
          </Alert>
        )}
      </Box>
      <Box sx={{ maxHeight: '55vh', overflowY: 'auto', overflowX: 'hidden', mb: 2 }}>
        {visibleItems.map((item) => (
          <Accordion key={item.id} disableGutters sx={{ mb: 1, maxWidth: '100%' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ '& .MuiAccordionSummary-content': { minWidth: 0, overflow: 'hidden' } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0, pr: 1 }}>
                <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: '1 1 auto', mr: 1 }}>
                  {item.fields.supplier || item.fields.description || item.rawFile.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {item.fields.amount ? `₱${Number(item.fields.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                  </Typography>
                  <IconButton size="small" color="error" aria-label="delete"
                    onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {item.saveError && <Alert severity="error" sx={{ mb: 1.5 }}>{item.saveError}</Alert>}
              {(item.parseError || item.fields.lowConf) && (
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                  {item.parseError ? `Parse error: ${item.parseError}` : 'Low confidence — verify the values.'}
                </Alert>
              )}
              {perItemProject && (
                <TextField fullWidth size="small" select label="Project" value={item.fields.projectId}
                  onChange={(e) => updateField(item.id, { projectId: e.target.value })}
                  helperText={!item.fields.projectId ? 'No project — will save as Overhead Expense' : undefined}
                  sx={{ mb: 1.5 }}>
                  <MenuItem value="">— No project (Overhead) —</MenuItem>
                  {(projects || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.project_no} — {p.project_name}</MenuItem>)}
                </TextField>
              )}
              {item.fields.customerIssues.length > 0 && (
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                  Receipt customer info issues:
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {item.fields.customerIssues.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </Alert>
              )}
              <TextField fullWidth size="small" label="Amount" type="number" value={item.fields.amount}
                onChange={(e) => updateField(item.id, { amount: e.target.value })}
                inputProps={{ min: 0, step: 0.01 }}
                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                sx={{ mb: 1.5 }} />
              <TextField fullWidth size="small" label="Date" type="date" value={item.fields.date}
                onChange={(e) => updateField(item.id, { date: e.target.value })}
                InputLabelProps={{ shrink: true }} sx={{ mb: 1.5 }} />
              <TextField fullWidth size="small" select label="Category" value={item.fields.category}
                onChange={(e) => updateField(item.id, { category: e.target.value })} sx={{ mb: 1.5 }}>
                <MenuItem value="">— Select category —</MenuItem>
                {categoryList.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
              <TextField fullWidth size="small" label="Description" value={item.fields.description}
                onChange={(e) => updateField(item.id, { description: e.target.value })}
                multiline rows={2} sx={{ mb: 1.5 }} />
              <TextField fullWidth size="small" label="Supplier" value={item.fields.supplier}
                onChange={(e) => updateField(item.id, { supplier: e.target.value })} sx={{ mb: 1.5 }} />
              <TextField fullWidth size="small" label="Invoice No." value={item.fields.invoiceNumber}
                onChange={(e) => updateField(item.id, { invoiceNumber: e.target.value })}
                helperText={item.fields.invoiceType || undefined} sx={{ mb: 1.5 }} />
              <TextField fullWidth size="small" label="VAT" type="number" value={item.fields.vat}
                onChange={(e) => updateField(item.id, { vat: e.target.value })}
                inputProps={{ min: 0, step: 0.01 }}
                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                helperText="Leave blank for non-VAT receipts" />
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
      <Button variant="contained" size="large" fullWidth color="success" disabled={!canSaveAll}
        onClick={handleSaveAll}
        startIcon={saving ? <CircularProgress size={20} color="inherit" /> : undefined}
        sx={{ py: 1.5 }}>
        {btnLabel}
      </Button>
      <Button variant="text" fullWidth disabled={saving} sx={{ mt: 1 }}
        onClick={() => { const n = items.filter((it) => it.isSaved).length; if (n > 0) onComplete(n); else onCancel(); }}>
        {items.some((it) => it.isSaved) ? `Done — ${items.filter((it) => it.isSaved).length} saved` : 'Cancel'}
      </Button>
      <Snackbar open={snack.open} autoHideDuration={5000} onClose={() => setSnack((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnack((p) => ({ ...p, open: false }))} severity={snack.severity} variant="filled" sx={{ width: '100%' }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ScanBatch;
