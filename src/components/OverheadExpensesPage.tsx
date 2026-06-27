import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  Link,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  PhotoCamera as PhotoCameraIcon,
  OpenInNew as OpenInNewIcon,
  AccountBalanceWallet as WalletIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { OVERHEAD_CATEGORIES, INVOICE_TYPES } from '../data/financeCategories';
import { parseReceipt } from '../services/receiptParseService';
import { fileToParseInput, compressForUpload } from '../utils/receipts/imageCompress';
import { isCorporateOneDriveConfigured } from '../config/onedriveConfig';
import { useOneDriveAuth } from '../contexts/OneDriveAuthContext';
import { resolveCorporateDriveId, ensureFolder, uploadFileToFolderById, sanitizeForOneDrive, deleteDriveItem, getDriveItemThumbnailUrl } from '../services/onedriveFolderService';
import {
  fetchOverheadExpenses,
  createOverheadExpense,
  updateOverheadExpense,
  deleteOverheadExpense,
  type OverheadExpense,
} from '../services/overheadExpenseService';
import ScanWithPhoneButton from './ScanWithPhoneButton';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
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

const CURRENT_YEAR = new Date().getFullYear();

const OverheadExpensesPage: React.FC = () => {
  const { isAuthenticated: oneDriveSignedIn, getAccessToken: getOneDriveToken } = useOneDriveAuth();
  const [expenses, setExpenses] = useState<OverheadExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [filterCategory, setFilterCategory] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceType, setInvoiceType] = useState('');
  const [vat, setVat] = useState('');
  const [tin, setTin] = useState('');

  const scanInputRef = React.useRef<HTMLInputElement>(null);
  const pendingReceiptRef = React.useRef<File | null>(null);
  const [receiptAttached, setReceiptAttached] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; severity: 'success' | 'error' | 'warning'; message: string }>({ open: false, severity: 'success', message: '' });
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchOverheadExpenses({ year, category: filterCategory || undefined });
      setExpenses(rows);
    } catch (e) {
      setSnackbar({ open: true, severity: 'error', message: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, [year, filterCategory]);

  useEffect(() => { load(); }, [load]);

  // Best-effort lazy receipt thumbnails: for each expense with a OneDrive receipt
  // not yet in `thumbs`, fetch a short-lived pre-authed thumbnail URL. Never throws.
  useEffect(() => {
    let cancelled = false;
    const loadThumbs = async () => {
      const missing = expenses.filter((e) => e.receiptRef?.oneDriveId && !thumbs[e.receiptRef.oneDriveId!]);
      if (missing.length === 0) return;
      if (!isCorporateOneDriveConfigured() || !oneDriveSignedIn) return;
      try {
        const token = await getOneDriveToken();
        if (!token) return;
        const driveId = await resolveCorporateDriveId(token);
        const entries: Array<[string, string]> = [];
        for (const e of missing) {
          const oneDriveId = e.receiptRef!.oneDriveId!;
          const url = await getDriveItemThumbnailUrl(token, driveId, oneDriveId);
          if (url) entries.push([oneDriveId, url]);
        }
        if (!cancelled && entries.length > 0) {
          setThumbs((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        }
      } catch (err) {
        console.warn('[OneDrive] overhead receipt thumbnail fetch failed:', err);
      }
    };
    void loadThumbs();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, oneDriveSignedIn]);

  const totalYtd = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setCategory('');
    setSupplier('');
    setInvoiceNo('');
    setInvoiceType('');
    setVat('');
    setTin('');
    pendingReceiptRef.current = null;
    setReceiptAttached(false);
  };

  const handleScanInputChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setIsScanning(true);
    const safeFile = await convertHeicToJpeg(file);
    pendingReceiptRef.current = safeFile;
    setReceiptAttached(true);
    try {
      const { imageBase64, mimeType } = await fileToParseInput(safeFile);
      const parsed = await parseReceipt(imageBase64, mimeType);
      const lowConf = typeof parsed.confidence === 'number' && parsed.confidence < 0.5;
      const pct = typeof parsed.confidence === 'number' ? Math.round(parsed.confidence * 100) : null;
      const amt = parsed.total ?? parsed.subtotal;
      if (typeof amt === 'number' && amt > 0) setAmount(String(amt));
      if (parsed.date) setDate(parsed.date);
      if (parsed.suggestedCategory && (OVERHEAD_CATEGORIES as readonly string[]).includes(parsed.suggestedCategory)) {
        setCategory(parsed.suggestedCategory);
      }
      const desc = parsed.vendor || parsed.lineItems?.[0]?.description;
      if (desc && !description.trim()) setDescription(desc);
      if (parsed.vendor) setSupplier(parsed.vendor);
      if (parsed.invoiceNumber) setInvoiceNo(parsed.invoiceNumber);
      if (parsed.invoiceType) {
        const matched = INVOICE_TYPES.find((t) => t.toLowerCase() === parsed.invoiceType?.toLowerCase());
        setInvoiceType(matched || '');
      }
      if (parsed.tax !== null && parsed.tax !== undefined) setVat(String(parsed.tax));
      if (lowConf) {
        setSnackbar({ open: true, severity: 'warning', message: `Low confidence${pct !== null ? ` (${pct}%)` : ''} — please verify amount, date & category.` });
      } else {
        setSnackbar({ open: true, severity: 'success', message: `Parsed: ${parsed.vendor || 'Unknown vendor'} (PHP ${Number(amt ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })})` });
      }
    } catch (e) {
      setSnackbar({ open: true, severity: 'error', message: e instanceof Error ? e.message : 'Failed to parse receipt' });
    } finally {
      setIsScanning(false);
    }
  };

  // Best-effort: upload the scanned overhead receipt to OneDrive under
  // `00 Overhead Receipts/{year}/`, then patch the expense with the receiptRef.
  // Never blocks; failure is logged only.
  const uploadOverheadReceipt = async (expenseId: string, file: File) => {
    try {
      if (!isCorporateOneDriveConfigured() || !oneDriveSignedIn) return;
      const token = await getOneDriveToken();
      if (!token) return;
      const driveId = await resolveCorporateDriveId(token);
      const yr = String(new Date().getFullYear());
      await ensureFolder(token, driveId, '', '00 Overhead Receipts');
      const folder = await ensureFolder(token, driveId, '00 Overhead Receipts', yr);
      if (!folder?.id) return;
      const blob = await compressForUpload(file);
      const item = await uploadFileToFolderById(token, driveId, folder.id, `OH-${expenseId}_${sanitizeForOneDrive(file.name)}`, blob);
      await updateOverheadExpense(expenseId, { receiptRef: { oneDriveId: item.id, webUrl: item.webUrl, filename: file.name } });
    } catch (err) {
      console.warn('[OneDrive] overhead receipt upload failed (expense saved):', err);
    }
  };

  const handleAdd = async () => {
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      setSnackbar({ open: true, severity: 'error', message: 'Enter an amount greater than 0' });
      return;
    }
    setSavingExpense(true);
    try {
      const created = await createOverheadExpense({
        description: description.trim() || '—',
        amount: amt,
        date,
        category: category || 'Others',
        sourceType: pendingReceiptRef.current ? 'receipt_scan' : 'manual',
        ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
        ...(invoiceNo.trim() ? { invoiceNo: invoiceNo.trim() } : {}),
        ...(invoiceType ? { invoiceType } : {}),
        ...(vat && !isNaN(Number(vat)) ? { vat: Number(vat) } : {}),
        ...(tin.trim() ? { tin: tin.trim() } : {}),
      });
      const file = pendingReceiptRef.current;
      setAddOpen(false);
      resetForm();
      setSnackbar({ open: true, severity: 'success', message: 'Overhead expense added' });
      if (file && created.id) {
        void uploadOverheadReceipt(created.id, file).finally(() => load());
      } else {
        await load();
      }
    } catch (e) {
      setSnackbar({ open: true, severity: 'error', message: e instanceof Error ? e.message : 'Failed to save' });
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    const exp = expenses.find((x) => x.id === id);
    setDeletingId(id);
    try {
      await deleteOverheadExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      setSnackbar({ open: true, severity: 'success', message: 'Deleted' });
      // best-effort OneDrive cleanup (never blocks the delete — Firestore is source of truth):
      if (exp?.receiptRef?.oneDriveId && isCorporateOneDriveConfigured() && oneDriveSignedIn) {
        try {
          const token = await getOneDriveToken();
          if (token) {
            const driveId = await resolveCorporateDriveId(token);
            await deleteDriveItem(token, driveId, exp.receiptRef.oneDriveId);
          }
        } catch (err) {
          console.warn('[OneDrive] overhead receipt delete failed (expense already removed):', err);
        }
      }
    } catch (e) {
      setSnackbar({ open: true, severity: 'error', message: e instanceof Error ? e.message : 'Failed to delete' });
    } finally {
      setDeletingId(null);
    }
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n);

  const years = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Overhead Expenses
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <ScanWithPhoneButton />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { resetForm(); setAddOpen(true); }}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add Overhead Expense
          </Button>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Company expenses not tied to any project (rent, utilities, supplies, subscriptions). Scan a receipt to auto-fill.
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Paper sx={{ p: 2.5, borderRadius: 2, color: 'white', background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.secondary} 100%)` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WalletIcon />
              <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>Total Overhead ({year})</Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>{formatCurrency(totalYtd)}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>{expenses.length} expense{expenses.length === 1 ? '' : 's'}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Year</InputLabel>
            <Select label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: 3 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Category</InputLabel>
            <Select label="Category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <MenuItem value="">All categories</MenuItem>
              {OVERHEAD_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {loading ? (
        <LinearProgress />
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: NET_PACIFIC_COLORS.primary + '12' }}>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Amount</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Receipt</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No overhead expenses yet. Use "Add Overhead Expense" to record one.
                  </TableCell>
                </TableRow>
              ) : (
                expenses.map((e) => (
                  <TableRow key={e.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.date}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell align="right">{formatCurrency(Number(e.amount) || 0)}</TableCell>
                    <TableCell>
                      {e.receiptRef?.oneDriveId && thumbs[e.receiptRef.oneDriveId] ? (
                        <Link href={e.receiptRef.webUrl} target="_blank" rel="noopener">
                          <Box component="img" src={thumbs[e.receiptRef.oneDriveId]} alt="receipt" onError={() => setThumbs((prev) => { const next = { ...prev }; delete next[e.receiptRef!.oneDriveId!]; return next; })} sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }} />
                        </Link>
                      ) : e.receiptRef?.webUrl ? (
                        <Link href={e.receiptRef.webUrl} target="_blank" rel="noopener" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                          <OpenInNewIcon fontSize="small" /> View
                        </Link>
                      ) : (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="error" onClick={() => handleDelete(e.id)} disabled={deletingId === e.id}>
                        {deletingId === e.id ? <CircularProgress size={18} /> : <DeleteIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Overhead Expense</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth size="small" label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} inputProps={{ min: 0, step: 0.01 }} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth size="small" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={2} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <MenuItem value="">— Select category —</MenuItem>
                    {OVERHEAD_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
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
                        <TextField fullWidth size="small" label="Supplier / Vendor Name" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth size="small" label="Supplier TIN" placeholder="000-000-000-00000" value={tin} onChange={(e) => setTin(e.target.value)} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Document Type</InputLabel>
                          <Select label="Document Type" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
                            <MenuItem value="">— None —</MenuItem>
                            {INVOICE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth size="small" label="Invoice / OR Number" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth size="small" label="Input VAT (supplier)" type="number" value={vat} onChange={(e) => setVat(e.target.value)} inputProps={{ min: 0, step: 0.01 }} />
                      </Grid>
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              </Grid>
              {receiptAttached && (
                <Grid size={{ xs: 12 }}>
                  <Typography variant="caption" color="success.main">Receipt attached — will upload to OneDrive after saving.</Typography>
                </Grid>
              )}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Tooltip title="Scan receipt with AI">
            <span>
              <IconButton color="primary" onClick={() => scanInputRef.current?.click()} disabled={isScanning}>
                {isScanning ? <CircularProgress size={24} /> : <PhotoCameraIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <Box>
            <Button onClick={() => setAddOpen(false)} disabled={savingExpense}>Cancel</Button>
            <Button variant="contained" onClick={handleAdd} disabled={savingExpense || isScanning} sx={{ ml: 1, backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}>
              {savingExpense ? 'Saving…' : 'Add Expense'}
            </Button>
          </Box>
        </DialogActions>
        <input type="file" ref={scanInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleScanInputChange} />
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar((p) => ({ ...p, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar((p) => ({ ...p, open: false }))} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default OverheadExpensesPage;
