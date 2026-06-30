import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TableSortLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListSubheader,
  TextField,
  Button,
  Chip,
  Link,
  Tooltip,
  LinearProgress,
  Alert,
} from '@mui/material';
import { FileDownload as FileDownloadIcon, ReceiptLong as ReceiptLongIcon } from '@mui/icons-material';
import { API_BASE } from '../../config/api';
import { accountFor } from '../../data/financeCategories';
import { fetchOverheadExpenses, OverheadExpense } from '../../services/overheadExpenseService';
import { useAuth } from '../../contexts/AuthContext';

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

const API = `${API_BASE}/api`;

function formatPHP(n: number) {
  return '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface ReceiptRef { oneDriveId?: string; webUrl?: string; filename?: string; }

// Raw shape of a /api/project-expenses row (only the fields we read).
interface ProjectExpenseRow {
  id?: string;
  description?: string;
  amount?: number;
  date?: string;
  category?: string;
  projectId?: string;
  sourceType?: string;
  receiptRef?: ReceiptRef;
  supplier?: string;
  invoiceNo?: string;
  invoiceType?: string;
  vat?: number;
  tin?: string;
  deductible?: boolean | null;
  deductibleReason?: string;
}

// Raw shape of a /api/payroll/runs row (only the fields we read).
interface PayrollRunRow {
  id?: string;
  periodStart?: string;
  periodEnd?: string;
  payDate?: string;
  createdAt?: string;
  status?: string;
}

type LedgerSource = 'project' | 'overhead' | 'payroll';

interface LedgerRow {
  id: string;
  source: LedgerSource;
  date: string;
  description: string;
  supplier: string;
  invoiceNo: string;
  invoiceType: string;
  category: string;
  accountCode: string;
  vat: number;
  tin: string;
  amount: number;
  deductible: boolean | null; // tax write-off flag from the receipt scan; null = unmarked / N/A
  deductibleReason: string;
  countInTotal: boolean; // payroll runs are informational (already synced into overhead)
  isSyncedPayroll?: boolean; // overhead rows posted by the payroll-approval sync
  projectId?: string;
  receiptRef?: ReceiptRef;
  runStatus?: string;
}

const SOURCE_LABEL: Record<LedgerSource, string> = {
  project: 'Project (COGS)',
  overhead: 'Overhead (OPEX)',
  payroll: 'Payroll',
};

const CURRENT_YEAR = new Date().getFullYear();

function yearOf(iso: string | undefined): string {
  if (!iso) return '';
  return String(iso).slice(0, 4);
}

// Month index 1..12 from an ISO date, or 0 if unparseable.
function monthOf(iso: string | undefined): number {
  if (!iso) return 0;
  const m = Number(String(iso).slice(5, 7));
  return m >= 1 && m <= 12 ? m : 0;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Period filter value: 'all' | 'q1'..'q4' | 'm1'..'m12'
type PeriodFilter = string;
function monthInPeriod(month: number, period: PeriodFilter): boolean {
  if (period === 'all') return true;
  if (month === 0) return false; // undated rows only show under "All year"
  if (period.startsWith('q')) {
    const q = Number(period.slice(1));
    return Math.ceil(month / 3) === q;
  }
  if (period.startsWith('m')) return Number(period.slice(1)) === month;
  return true;
}

// --- Lazy receipt thumbnail / link cell ---------------------------------
const ReceiptCell: React.FC<{ row: LedgerRow }> = ({ row }) => {
  const [thumb, setThumb] = useState<string | null>(null);
  const oneDriveId = row.receiptRef?.oneDriveId;
  const webUrl = row.receiptRef?.webUrl;

  useEffect(() => {
    let cancelled = false;
    if (!oneDriveId) return;
    (async () => {
      try {
        const res = await fetch(`${API}/onedrive/item/${encodeURIComponent(oneDriveId)}/thumbnail`, { headers: authHeaders() });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && json && json.ok && json.url) setThumb(json.url as string);
      } catch {
        /* treat any failure as no-thumbnail */
      }
    })();
    return () => { cancelled = true; };
  }, [oneDriveId]);

  if (row.source === 'payroll') {
    return (
      <Link href="/finance/payroll" underline="hover" sx={{ fontSize: '0.8rem' }}>
        View run
      </Link>
    );
  }

  if (!oneDriveId && !webUrl) {
    return <Chip size="small" label="No receipt" variant="outlined" sx={{ color: 'text.secondary' }} />;
  }

  const openHref = webUrl || `${API}/onedrive/item/${encodeURIComponent(oneDriveId || '')}/content`;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {thumb ? (
        <Tooltip title={row.receiptRef?.filename || 'Open receipt'}>
          <a href={openHref} target="_blank" rel="noopener noreferrer">
            <Box
              component="img"
              src={thumb}
              alt="receipt"
              sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider', display: 'block' }}
            />
          </a>
        </Tooltip>
      ) : (
        <Link href={openHref} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontSize: '0.8rem' }}>
          View
        </Link>
      )}
    </Box>
  );
};

type SortKey = 'date' | 'amount' | 'source' | 'supplier' | 'category';

const TaxFilerLedgerPage: React.FC = () => {
  const { user } = useAuth();
  const isTaxFiler = user?.role === 'tax_filer';
  const [year, setYear] = useState<string>(String(CURRENT_YEAR));
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | LedgerSource>('all');
  const [deductibleFilter, setDeductibleFilter] = useState<'all' | 'yes' | 'no' | 'unmarked'>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const projectReq = fetch(`${API}/project-expenses?year=${year}`, { headers: authHeaders() })
          .then((r) => r.json()).catch(() => ({}));
        const overheadReq = fetchOverheadExpenses({ year }).catch(() => [] as OverheadExpense[]);
        const payrollReq = isTaxFiler
          ? Promise.resolve([])
          : fetch(`${API}/payroll/runs`, { headers: authHeaders() })
              .then((r) => r.json()).catch(() => []);

        const [projectJson, overhead, payrollJson] = await Promise.all([projectReq, overheadReq, payrollReq]);
        if (cancelled) return;

        const projectRows: ProjectExpenseRow[] = (projectJson && projectJson.success && Array.isArray(projectJson.expenses))
          ? projectJson.expenses : [];
        const payrollRuns: PayrollRunRow[] = Array.isArray(payrollJson) ? payrollJson : [];

        const out: LedgerRow[] = [];

        projectRows.forEach((e, i) => {
          const category = e.category || 'Others';
          out.push({
            id: e.id || `proj-${i}`,
            source: 'project',
            date: e.date || '',
            description: e.description || '',
            supplier: e.supplier || '',
            invoiceNo: e.invoiceNo || '',
            invoiceType: e.invoiceType || '',
            category,
            accountCode: accountFor(category, 'project').code,
            vat: Number(e.vat) || 0,
            tin: e.tin || '',
            amount: Number(e.amount) || 0,
            deductible: typeof e.deductible === 'boolean' ? e.deductible : null,
            deductibleReason: e.deductibleReason || '',
            countInTotal: true,
            projectId: e.projectId,
            receiptRef: e.receiptRef,
          });
        });

        overhead.forEach((e, i) => {
          const category = e.category || 'Others';
          // Office payroll posted by the payroll-approval sync lands in overhead_expenses
          // with deterministic doc ids prefixed `payroll_sync_`. Flag it so the tax filer
          // can tell synced labor apart from manually-entered overhead.
          const isSyncedPayroll = (e.id || '').startsWith('payroll_sync_');
          out.push({
            id: e.id || `oh-${i}`,
            source: 'overhead',
            date: e.date || '',
            description: e.description || '',
            supplier: e.supplier || '',
            invoiceNo: e.invoiceNo || '',
            invoiceType: e.invoiceType || '',
            category,
            accountCode: accountFor(category, 'overhead').code,
            vat: Number(e.vat) || 0,
            tin: e.tin || '',
            amount: Number(e.amount) || 0,
            deductible: typeof e.deductible === 'boolean' ? e.deductible : null,
            deductibleReason: e.deductibleReason || '',
            countInTotal: true,
            isSyncedPayroll,
            receiptRef: e.receiptRef,
          });
        });

        payrollRuns
          .filter((run) => yearOf(run.payDate || run.periodEnd) === year)
          .forEach((run, i) => {
            out.push({
              id: run.id || `pay-${i}`,
              source: 'payroll',
              date: run.payDate || run.periodEnd || '',
              description: `Payroll run: ${run.periodStart || ''} to ${run.periodEnd || ''}`,
              supplier: '',
              invoiceNo: '',
              invoiceType: '',
              category: 'Salaries & Wages',
              accountCode: accountFor('Salaries & Wages', 'overhead').code,
              vat: 0,
              tin: '',
              amount: 0, // office payroll is already posted into overhead_expenses; shown here only as a reference to avoid double counting
              deductible: null,
              deductibleReason: '',
              countInTotal: false,
              runStatus: run.status,
            });
          });

        setRows(out);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load ledger');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [year, isTaxFiler]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const subset = rows.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (!monthInPeriod(monthOf(r.date), period)) return false;
      if (deductibleFilter === 'yes' && r.deductible !== true) return false;
      if (deductibleFilter === 'no' && r.deductible !== false) return false;
      if (deductibleFilter === 'unmarked' && r.deductible !== null) return false;
      if (!q) return true;
      return [r.description, r.supplier, r.invoiceNo, r.category, r.tin, r.accountCode]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...subset].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'amount': cmp = a.amount - b.amount; break;
        case 'source': cmp = a.source.localeCompare(b.source); break;
        case 'supplier': cmp = a.supplier.localeCompare(b.supplier); break;
        case 'category': cmp = a.category.localeCompare(b.category); break;
        case 'date':
        default: cmp = String(a.date).localeCompare(String(b.date)); break;
      }
      return cmp * dir;
    });
  }, [rows, sourceFilter, period, deductibleFilter, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    let cogs = 0, opex = 0, vat = 0, withReceipt = 0, missingReceipt = 0;
    let deductible = 0, nonDeductible = 0, unmarked = 0;
    filtered.forEach((r) => {
      if (r.countInTotal) {
        if (r.source === 'project') cogs += r.amount;
        else if (r.source === 'overhead') opex += r.amount;
        vat += r.vat;
        if (r.receiptRef?.oneDriveId || r.receiptRef?.webUrl) withReceipt += 1;
        else missingReceipt += 1;
        if (r.deductible === true) deductible += r.amount;
        else if (r.deductible === false) nonDeductible += r.amount;
        else unmarked += r.amount;
      }
    });
    return { cogs, opex, grand: cogs + opex, vat, withReceipt, missingReceipt, deductible, nonDeductible, unmarked };
  }, [filtered]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const exportCsv = () => {
    const headers = ['Source', 'Date', 'Description', 'Supplier', 'Invoice No', 'Invoice Type', 'Category', 'Account', 'VAT', 'TIN', 'Amount', 'Deductible', 'Deductible Reason', 'Receipt', 'Status'];
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const dedLabel = (d: boolean | null) => (d === true ? 'Yes' : d === false ? 'No' : '');
    const lines = filtered.map((r) => [
      SOURCE_LABEL[r.source], r.date, r.description, r.supplier, r.invoiceNo, r.invoiceType,
      r.category, r.accountCode, r.vat || '', r.tin, r.countInTotal ? r.amount : '',
      dedLabel(r.deductible), r.deductibleReason,
      r.receiptRef?.webUrl || r.receiptRef?.oneDriveId || '', r.runStatus || '',
    ].map(esc).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const periodTag = period === 'all' ? year : `${year}-${period}`;
    a.download = `tax-ledger-${periodTag}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const years = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

  const kpiCard = (label: string, value: string, gradient: string, sub?: string) => (
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Card sx={{ background: gradient, color: 'white' }}>
        <CardContent sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>{label}</Typography>
          <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{value}</Typography>
          {sub && <Typography variant="caption" sx={{ opacity: 0.85 }}>{sub}</Typography>}
        </CardContent>
      </Card>
    </Grid>
  );

  const sortLabel = (key: SortKey, text: string, align?: 'right') => (
    <TableSortLabel
      active={sortKey === key}
      direction={sortKey === key ? sortDir : 'asc'}
      onClick={() => handleSort(key)}
      sx={align === 'right' ? { flexDirection: 'row-reverse' } : undefined}
    >
      {text}
    </TableSortLabel>
  );

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptLongIcon fontSize="large" /> Tax Filer Ledger
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search supplier, invoice, TIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 220 }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Source</InputLabel>
            <Select label="Source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as 'all' | LedgerSource)}>
              <MenuItem value="all">All sources</MenuItem>
              <MenuItem value="project">Project (COGS)</MenuItem>
              <MenuItem value="overhead">Overhead (OPEX)</MenuItem>
              {!isTaxFiler && <MenuItem value="payroll">Payroll</MenuItem>}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Deductible</InputLabel>
            <Select label="Deductible" value={deductibleFilter} onChange={(e) => setDeductibleFilter(e.target.value as 'all' | 'yes' | 'no' | 'unmarked')}>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="yes">Deductible only</MenuItem>
              <MenuItem value="no">Non-deductible</MenuItem>
              <MenuItem value="unmarked">Unmarked</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Period</InputLabel>
            <Select label="Period" value={period} onChange={(e) => setPeriod(String(e.target.value))}>
              <MenuItem value="all">Full year</MenuItem>
              <ListSubheader>Quarter</ListSubheader>
              <MenuItem value="q1">Q1 (Jan–Mar)</MenuItem>
              <MenuItem value="q2">Q2 (Apr–Jun)</MenuItem>
              <MenuItem value="q3">Q3 (Jul–Sep)</MenuItem>
              <MenuItem value="q4">Q4 (Oct–Dec)</MenuItem>
              <ListSubheader>Month</ListSubheader>
              {MONTH_NAMES.map((m, i) => <MenuItem key={m} value={`m${i + 1}`}>{m}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel>Year</InputLabel>
            <Select label="Year" value={year} onChange={(e) => setYear(String(e.target.value))}>
              {years.map((y) => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={exportCsv} disabled={!filtered.length}>
            CSV
          </Button>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Consolidated BIR substantiation ledger: project costs, overhead, and payroll references for the selected year. Read-only.
      </Typography>

      {loading ? (
        <LinearProgress />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {kpiCard('Cost of Services', formatPHP(totals.cogs), `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, 'Project expenses (5xxx)')}
            {kpiCard('Overhead / OPEX', formatPHP(totals.opex), `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent2} 0%, ${NET_PACIFIC_COLORS.secondary} 100%)`, 'Operating expenses (6xxx)')}
            {kpiCard('Total Substantiated', formatPHP(totals.grand), `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, ${NET_PACIFIC_COLORS.primary} 100%)`, `Input VAT ${formatPHP(totals.vat)}`)}
            {kpiCard('Tax-Deductible', formatPHP(totals.deductible), `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, `Non-deductible ${formatPHP(totals.nonDeductible)}${totals.unmarked ? ` · Unmarked ${formatPHP(totals.unmarked)}` : ''}`)}
            {kpiCard('Receipts Attached', String(totals.withReceipt), `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent1} 0%, ${NET_PACIFIC_COLORS.accent2} 100%)`, `${totals.missingReceipt} missing receipt`)}
          </Grid>

          <Paper sx={{ borderRadius: 2 }}>
            <TableContainer sx={{ maxHeight: '60vh' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>{sortLabel('source', 'Source')}</TableCell>
                    <TableCell>{sortLabel('date', 'Date')}</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>{sortLabel('supplier', 'Supplier')}</TableCell>
                    <TableCell>Invoice No</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>{sortLabel('category', 'Category')}</TableCell>
                    <TableCell>Acct</TableCell>
                    <TableCell align="right">VAT</TableCell>
                    <TableCell>TIN</TableCell>
                    <TableCell align="right">{sortLabel('amount', 'Amount', 'right')}</TableCell>
                    <TableCell>Deductible</TableCell>
                    <TableCell>Receipt</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!filtered.length ? (
                    <TableRow><TableCell colSpan={13} align="center" sx={{ color: 'text.secondary', py: 4 }}>No records for {period === 'all' ? year : `${year} ${period.toUpperCase()}`}.</TableCell></TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={`${r.source}-${r.id}`} hover>
                        <TableCell>
                          <Chip
                            size="small"
                            label={r.isSyncedPayroll ? 'Overhead (Payroll)' : SOURCE_LABEL[r.source]}
                            color={r.source === 'project' ? 'primary' : r.source === 'overhead' ? 'secondary' : 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.date ? String(r.date).slice(0, 10) : '-'}</TableCell>
                        <TableCell sx={{ maxWidth: 240 }}>{r.description}{r.runStatus ? ` (${r.runStatus})` : ''}</TableCell>
                        <TableCell>{r.supplier || '-'}</TableCell>
                        <TableCell>{r.invoiceNo || '-'}</TableCell>
                        <TableCell>{r.invoiceType || '-'}</TableCell>
                        <TableCell>{r.category}</TableCell>
                        <TableCell>{r.accountCode}</TableCell>
                        <TableCell align="right">{r.vat ? formatPHP(r.vat) : '-'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.tin || '-'}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{r.countInTotal ? formatPHP(r.amount) : '-'}</TableCell>
                        <TableCell>
                          {r.source === 'payroll' ? (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          ) : r.deductible === null ? (
                            <Chip size="small" label="Unmarked" variant="outlined" sx={{ color: 'text.secondary' }} />
                          ) : (
                            <Tooltip title={r.deductibleReason || (r.deductible ? 'Marked tax-deductible' : 'Not tax-deductible')}>
                              <Chip
                                size="small"
                                label={r.deductible ? 'Deductible' : 'Non-deductible'}
                                color={r.deductible ? 'success' : 'error'}
                                variant={r.deductible ? 'filled' : 'outlined'}
                              />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell><ReceiptCell row={r} /></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1.5 }}>
            Payroll runs are listed for reference only and are not added to the totals: office payroll is already posted into Overhead (Salaries &amp; Wages / Government Contributions) by the payroll-approval sync, so counting it here would double it. Overhead rows tagged "Overhead (Payroll)" are that synced labor.
          </Typography>
        </>
      )}
    </Box>
  );
};

export default TaxFilerLedgerPage;
