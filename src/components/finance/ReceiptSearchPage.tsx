import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { API_BASE } from '../../config/api';
import { financeFocusUrl } from '../../utils/financeTraceFocus';
import { liquidationRowOrigin } from '../../utils/financeModuleOrigins';

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

type PaperState = 'draft' | 'not_handed_in' | 'handed_in' | 'reviewed' | 'changed_since' | 'returned';

interface ItemHit {
  liquidationId: string;
  rowId: string | null;
  formNo: string | null;
  formStatus: 'submitted' | 'draft';
  employeeName: string | null;
  itemNo: number | null;
  date: string | null;
  category: string | null;
  particulars: string | null;
  supplier: string | null;
  invoiceNo: string | null;
  projectName: string | null;
  amount: number;
  exactAmount: boolean;
  invoiceTotal: { total: number; lines: number; exact: boolean } | null;
  receipts: { filename: string | null; webUrl: string | null }[];
  paper: { state: PaperState; submittedDate?: string | null; reviewDate?: string | null; returnReason?: string | null };
}

const FIELDS = ['amount', 'q', 'from', 'to'] as const;

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Whether this form's paper packet (the physical receipts) has reached the vault.
const paperChip = (paper: ItemHit['paper']) => {
  const map: Record<PaperState, { label: string; color: string; title: string }> = {
    draft: { label: 'Draft — not submitted', color: NET_PACIFIC_COLORS.warning, title: 'The form is still a draft.' },
    not_handed_in: { label: 'No hand-in recorded', color: NET_PACIFIC_COLORS.error, title: 'Filed online, but no hand-in of this form\'s paper receipts is recorded. Forms from before hand-in tracking show this too.' },
    handed_in: { label: `Handed to RJ${paper.submittedDate ? ` ${paper.submittedDate}` : ''}`, color: NET_PACIFIC_COLORS.info, title: 'The paper packet was handed in and is waiting for RJ\'s check.' },
    reviewed: { label: 'In vault — RJ reviewed', color: NET_PACIFIC_COLORS.success, title: `RJ checked the paper receipts${paper.reviewDate ? ` on ${paper.reviewDate}` : ''}.` },
    changed_since: { label: 'Edited after hand-in', color: NET_PACIFIC_COLORS.warning, title: 'The form changed after its paper packet was handed in; hand in again.' },
    returned: { label: 'Returned to filer', color: NET_PACIFIC_COLORS.warning, title: paper.returnReason || 'RJ returned the paper receipts.' },
  };
  const s = map[paper.state];
  return <Chip size="small" label={s.label} title={s.title} sx={{ bgcolor: s.color, color: paper.state === 'draft' || paper.state === 'changed_since' || paper.state === 'returned' ? 'rgba(0,0,0,0.87)' : 'white', fontWeight: 600, fontSize: '0.7rem' }} />;
};

const ReceiptSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<Record<(typeof FIELDS)[number], string>>(() => ({
    amount: params.get('amount') || '', q: params.get('q') || '', from: params.get('from') || '', to: params.get('to') || '',
  }));
  const [results, setResults] = useState<ItemHit[] | null>(null);
  const [meta, setMeta] = useState<{ total: number; truncated: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (query: URLSearchParams) => {
    if (!FIELDS.some((f) => query.get(f))) { setResults(null); return; }
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/liquidations/item-search?${query.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || `Search failed (${res.status})`);
      setResults(data.results);
      setMeta({ total: data.total, truncated: data.truncated });
    } catch (e) {
      setResults(null);
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // The URL holds the search, so "back" from an opened liquidation re-runs it.
  useEffect(() => { run(params); }, [params, run]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    FIELDS.forEach((f) => { if (form[f].trim()) next.set(f, form[f].trim()); });
    if (!next.toString()) { setError('Enter an amount, some text, or a date range'); return; }
    setParams(next);
  };

  const openRow = (hit: ItemHit) => {
    if (!hit.rowId) return;
    navigate(financeFocusUrl(liquidationRowOrigin(hit.liquidationId, { id: hit.rowId }), `/finance/receipt-search?${params.toString()}`));
  };

  const headCell = { fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' } as const;
  const cell = { fontSize: '0.8rem' } as const;

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Receipt Search
        </Typography>
      </Box>

      <Paper component="form" onSubmit={submit} sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField fullWidth size="small" label="Amount (line or invoice total)" inputMode="decimal" value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="e.g. 350" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField fullWidth size="small" label="Supplier, invoice no., particulars" value={form.q}
              onChange={(e) => setForm((p) => ({ ...p, q: e.target.value }))} placeholder="e.g. Shell 643427" />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <TextField fullWidth size="small" type="date" label="Receipt date from" InputLabelProps={{ shrink: true }} value={form.from}
              onChange={(e) => setForm((p) => ({ ...p, from: e.target.value }))} />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <TextField fullWidth size="small" type="date" label="to" InputLabelProps={{ shrink: true }} value={form.to}
              onChange={(e) => setForm((p) => ({ ...p, to: e.target.value }))} />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <Button fullWidth type="submit" variant="contained" startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />} disabled={loading}
              sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}>
              Search
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      {results && results.length === 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          No liquidation line matches. This receipt doesn't look filed yet. Try just the amount, or widen the dates, before filing it.
        </Alert>
      )}

      {results && results.length > 0 && (
        <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
            <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
              Matches ({meta?.total ?? results.length}{meta?.truncated ? `, showing ${results.length}` : ''})
            </Typography>
          </Box>
          <TableContainer sx={{ flexGrow: 1, minHeight: 300 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCell}>Form / Item</TableCell>
                  <TableCell sx={headCell}>Receipt date</TableCell>
                  <TableCell sx={headCell}>Particulars</TableCell>
                  <TableCell sx={headCell}>Supplier / Invoice</TableCell>
                  <TableCell sx={headCell} align="right">Amount</TableCell>
                  <TableCell sx={headCell}>Digital copy</TableCell>
                  <TableCell sx={headCell}>Paper</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((hit) => (
                  <TableRow key={`${hit.liquidationId}:${hit.rowId}`} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                    <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>
                      <Link component="button" type="button" onClick={() => openRow(hit)} disabled={!hit.rowId} sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {hit.formNo || 'Untitled draft'}
                      </Link>
                      {hit.itemNo != null && <Typography component="span" sx={{ ml: 0.75, fontSize: '0.8rem', fontWeight: 600 }}>Item {hit.itemNo}</Typography>}
                      {hit.employeeName && <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{hit.employeeName}</Typography>}
                    </TableCell>
                    <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>{hit.date || '—'}</TableCell>
                    <TableCell sx={{ ...cell, minWidth: 180 }}>
                      {hit.particulars || '—'}
                      {(hit.category || hit.projectName) && (
                        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{[hit.category, hit.projectName].filter(Boolean).join(' · ')}</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ ...cell, minWidth: 140 }}>
                      {hit.supplier || '—'}
                      {hit.invoiceNo && <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{hit.invoiceNo}</Typography>}
                    </TableCell>
                    <TableCell sx={{ ...cell, whiteSpace: 'nowrap', fontWeight: hit.exactAmount ? 700 : 400 }} align="right">
                      {peso(hit.amount)}
                      {hit.invoiceTotal && (
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: hit.invoiceTotal.exact ? 700 : 400, color: NET_PACIFIC_COLORS.secondary }}>
                          Invoice total {peso(hit.invoiceTotal.total)} ({hit.invoiceTotal.lines} lines)
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>
                      {hit.receipts.length
                        ? hit.receipts.map((r, i) => (r.webUrl
                          ? <Link key={i} href={r.webUrl} target="_blank" rel="noopener noreferrer" sx={{ display: 'block', fontSize: '0.8rem' }}>View{hit.receipts.length > 1 ? ` ${i + 1}` : ''}</Link>
                          : <span key={i}>Attached</span>))
                        : <Typography component="span" sx={{ fontSize: '0.8rem', color: NET_PACIFIC_COLORS.error }}>None</Typography>}
                    </TableCell>
                    <TableCell sx={cell}>{paperChip(hit.paper)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default ReceiptSearchPage;
