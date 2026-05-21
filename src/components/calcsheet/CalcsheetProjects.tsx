import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  InputAdornment, MenuItem, Paper, Stack, Switch, FormControlLabel, Table, TableBody,
  TableCell, TableHead, TableRow, TableSortLabel, TextField, Typography, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import HistoryIcon from '@mui/icons-material/History';
import { Link } from 'react-router-dom';
import { useQuotationStore } from '../../store/quotationStore';
import type { ProjectStatus } from '../../types/Quotation';
import { format } from 'date-fns';
import { PHP, computeTotals } from '../../utils/calcsheet/calc';

const statusColors: Record<ProjectStatus, 'default' | 'primary' | 'success' | 'error'> = {
  draft: 'default', sent: 'primary', won: 'success', lost: 'error',
};

type SortKey = 'code' | 'name' | 'customer' | 'date' | 'status' | 'grandTotal';
type SortDir = 'asc' | 'desc';

const empty = {
  name: '', location: '', date: format(new Date(), 'yyyy-MM-dd'),
  customerId: '', partnerId: '', salesContactId: '', status: 'draft' as ProjectStatus,
};

export default function Projects() {
  const projects = useQuotationStore((s) => s.projects);
  const clients = useQuotationStore((s) => s.clients);
  const sales = useQuotationStore((s) => s.salesContacts);
  const quotations = useQuotationStore((s) => s.quotations);
  const addProject = useQuotationStore((s) => s.addProject);
  const deleteProject = useQuotationStore((s) => s.deleteProject);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  // ── filter + sort state ────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [legacyFilter, setLegacyFilter] = useState<'all' | 'legacy' | 'current'>('all');
  const [ongoingOnly, setOngoingOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const startNew = () => { setForm(empty); setOpen(true); };
  const save = async () => {
    if (!form.name || !form.customerId) return;
    await addProject({
      name: form.name,
      location: form.location,
      date: form.date,
      customerId: form.customerId || null,
      partnerId: form.partnerId || null,
      salesContactId: form.salesContactId || null,
      status: form.status,
    });
    setOpen(false);
  };

  // Memoize per-project data so sort/filter doesn't re-scan quotations N times per render
  const enriched = useMemo(() => projects.map((p) => {
    const customer = clients.find((c) => c.id === p.customerId);
    const partner = clients.find((c) => c.id === p.partnerId);
    const qs = quotations.filter((q) => q.projectId === p.id);
    const totals = qs.map((q) => ({ kind: q.kind, total: computeTotals(q).grandTotal }));
    const grandTotal = totals.reduce((sum, t) => Math.max(sum, t.total), 0);  // use max kind as the "headline"
    const hasLegacy = qs.some((q) => q.formulaVersion === 'legacy');
    const year = p.date ? new Date(p.date).getFullYear() : 0;
    return { p, customer, partner, totals, grandTotal, hasLegacy, year };
  }), [projects, clients, quotations]);

  // Derive year options from data
  const yearOptions = useMemo(() => {
    const ys = Array.from(new Set(enriched.map((e) => e.year).filter((y) => y > 0))).sort((a, b) => b - a);
    return ys;
  }, [enriched]);

  // Filter
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return enriched.filter(({ p, customer, partner, hasLegacy, year }) => {
      if (s) {
        const hay = `${p.code} ${p.name} ${p.location ?? ''} ${customer?.name ?? ''} ${customer?.code ?? ''} ${partner?.name ?? ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (customerFilter !== 'all' && p.customerId !== customerFilter) return false;
      if (yearFilter !== 'all' && String(year) !== yearFilter) return false;
      if (legacyFilter === 'legacy' && !hasLegacy) return false;
      if (legacyFilter === 'current' && hasLegacy) return false;
      if (ongoingOnly && !p.ongoing) return false;
      return true;
    });
  }, [enriched, search, statusFilter, customerFilter, yearFilter, legacyFilter, ongoingOnly]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const mul = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortKey) {
        case 'code': av = a.p.code; bv = b.p.code; break;
        case 'name': av = (a.p.name || '').toLowerCase(); bv = (b.p.name || '').toLowerCase(); break;
        case 'customer': av = (a.customer?.name || '').toLowerCase(); bv = (b.customer?.name || '').toLowerCase(); break;
        case 'date': av = a.p.date || ''; bv = b.p.date || ''; break;
        case 'status': av = a.p.status; bv = b.p.status; break;
        case 'grandTotal': av = a.grandTotal; bv = b.grandTotal; break;
      }
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'date' || key === 'grandTotal' ? 'desc' : 'asc'); }
  };

  const clearFilters = () => {
    setSearch(''); setStatusFilter('all'); setCustomerFilter('all');
    setYearFilter('all'); setLegacyFilter('all'); setOngoingOnly(false);
  };

  const anyFilterActive = search || statusFilter !== 'all' || customerFilter !== 'all'
    || yearFilter !== 'all' || legacyFilter !== 'all' || ongoingOnly;

  const SortHeader = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <TableCell align={align} sortDirection={sortKey === k ? sortDir : false}>
      <TableSortLabel
        active={sortKey === k}
        direction={sortKey === k ? sortDir : 'asc'}
        onClick={() => toggleSort(k)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Projects</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            component={Link}
            to="/calcsheet/import-legacy"
            variant="outlined"
            color="warning"
            startIcon={<UploadFileIcon />}
          >
            Import legacy
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={startNew}>
            New project
          </Button>
        </Stack>
      </Stack>

      {/* Filter bar */}
      <Paper sx={{ p: 1.5 }} variant="outlined">
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            placeholder="Search code, name, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 280, flex: '1 1 280px', maxWidth: 380 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch('')}><ClearIcon fontSize="small" /></IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          <TextField
            select size="small" label="Status" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | 'all')}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="sent">Sent</MenuItem>
            <MenuItem value="won">Won</MenuItem>
            <MenuItem value="lost">Lost</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Customer" value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">All</MenuItem>
            {clients
              .filter((c) => enriched.some((e) => e.p.customerId === c.id))
              .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name))
              .map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.code ? `${c.code} — ${c.name}` : c.name}</MenuItem>
              ))}
          </TextField>
          <TextField
            select size="small" label="Year" value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            sx={{ minWidth: 100 }}
          >
            <MenuItem value="all">All</MenuItem>
            {yearOptions.map((y) => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
          </TextField>
          <TextField
            select size="small" label="Formula" value={legacyFilter}
            onChange={(e) => setLegacyFilter(e.target.value as 'all' | 'legacy' | 'current')}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="legacy">Legacy only</MenuItem>
            <MenuItem value="current">Current only</MenuItem>
          </TextField>
          <FormControlLabel
            control={<Switch size="small" checked={ongoingOnly} onChange={(e) => setOngoingOnly(e.target.checked)} />}
            label={<Typography variant="caption">Ongoing only</Typography>}
          />
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {sorted.length} of {projects.length}
          </Typography>
          {anyFilterActive && (
            <Button size="small" onClick={clearFilters} startIcon={<ClearIcon />}>Clear</Button>
          )}
        </Stack>
      </Paper>

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortHeader k="code" label="Code" />
              <SortHeader k="name" label="Project" />
              <SortHeader k="customer" label="Customer" />
              <TableCell>Partner</TableCell>
              <SortHeader k="date" label="Date" />
              <SortHeader k="status" label="Status" />
              <SortHeader k="grandTotal" label="Quotations" align="right" />
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map(({ p, customer, partner, totals, hasLegacy }) => (
              <TableRow key={p.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Link to={`/calcsheet/projects/${p.id}`} style={{ color: 'inherit' }}>{p.code}</Link>
                    {hasLegacy && (
                      <Tooltip title="Has legacy quotation(s)">
                        <HistoryIcon fontSize="inherit" color="warning" sx={{ fontSize: '0.85rem' }} />
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Link to={`/calcsheet/projects/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}</Typography>
                      {p.location && <Typography variant="caption" color="text.secondary">{p.location}</Typography>}
                    </Box>
                  </Link>
                </TableCell>
                <TableCell>{customer?.name ?? '—'}</TableCell>
                <TableCell>{partner?.name ?? '—'}</TableCell>
                <TableCell>{p.date ? format(new Date(p.date), 'dd MMM yyyy') : '—'}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Chip size="small" label={p.status} color={statusColors[p.status]} />
                    {p.ongoing && <Chip size="small" label="ongoing" variant="outlined" sx={{ height: 18 }} />}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Stack spacing={0.25}>
                    {totals.map((t, i) => (
                      <Typography key={i} variant="caption" sx={{ fontFamily: 'monospace' }}>
                        <strong>{t.kind}:</strong> {PHP(t.total)}
                      </Typography>
                    ))}
                    {totals.length === 0 && <Typography variant="caption" color="text.secondary">none</Typography>}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => deleteProject(p.id)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                  {projects.length === 0
                    ? 'No projects yet — click "New project" to start'
                    : 'No projects match the current filters'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New project</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            <TextField label="Project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ gridColumn: 'span 2' }} />
            <TextField label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} sx={{ gridColumn: 'span 2' }} />
            <TextField label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="sent">Sent</MenuItem>
              <MenuItem value="won">Won</MenuItem>
              <MenuItem value="lost">Lost</MenuItem>
            </TextField>
            <TextField select label="Customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>)}
            </TextField>
            <TextField select label="Partner (optional)" value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
              <MenuItem value="">— none —</MenuItem>
              {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>)}
            </TextField>
            <TextField select label="Sales contact" value={form.salesContactId} onChange={(e) => setForm({ ...form, salesContactId: e.target.value })} sx={{ gridColumn: 'span 2' }}>
              <MenuItem value="">— none —</MenuItem>
              {sales.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Create</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
