import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  IconButton, InputAdornment, InputLabel, LinearProgress, ListItemText, MenuItem, OutlinedInput, Paper,
  Select, Snackbar, Stack, Switch, FormControlLabel,
  Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, TextField, Typography, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import HistoryIcon from '@mui/icons-material/History';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import { Link } from 'react-router-dom';
import { useQuotationStore } from '../../store/quotationStore';
import type { ProjectStatus, Project } from '../../types/Quotation';
import { format } from 'date-fns';
import { PHP, computeTotals, ioctMargin } from '../../utils/calcsheet/calc';
import { quotationCode, nextProjectSequence } from '../../utils/calcsheet/codes';
import { useOneDriveAuth } from '../../contexts/OneDriveAuthContext';
import { isCorporateOneDriveConfigured } from '../../config/onedriveConfig';
import { ensureProposalFolder, ensureExecutionFolder, moveProposalToExecution } from '../../services/onedriveFolderService';

const statusColors: Record<ProjectStatus, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  draft: 'default', sent: 'primary', won: 'success', lost: 'error', inactive: 'warning',
};

// Single source of truth for the status options used by the multi-select filter
// and the inline status dropdown. Keep `inactive` here — it's part of ProjectStatus.
const STATUS_OPTIONS: ProjectStatus[] = ['draft', 'sent', 'won', 'lost', 'inactive'];
const statusLabel = (s: ProjectStatus) => s.charAt(0).toUpperCase() + s.slice(1);

type SortKey = 'code' | 'name' | 'customer' | 'date' | 'status' | 'grandTotal' | 'margin';
type SortDir = 'asc' | 'desc';

// Last-used sort persists per browser so the list reopens the way the user left it
const SORT_PREF_KEY = 'calcsheet-projects-sort';
const SORT_KEYS: SortKey[] = ['code', 'name', 'customer', 'date', 'status', 'grandTotal', 'margin'];

function loadSortPref(): { key: SortKey; dir: SortDir } {
  try {
    const raw = localStorage.getItem(SORT_PREF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (SORT_KEYS.includes(parsed.key) && (parsed.dir === 'asc' || parsed.dir === 'desc')) {
        return { key: parsed.key, dir: parsed.dir };
      }
    }
  } catch { /* corrupted pref — fall through to default */ }
  return { key: 'code', dir: 'asc' };
}

function saveSortPref(key: SortKey, dir: SortDir) {
  try {
    localStorage.setItem(SORT_PREF_KEY, JSON.stringify({ key, dir }));
  } catch { /* storage unavailable (private mode/quota) — sort still works for the session */ }
}

const empty = {
  name: '', location: '', date: format(new Date(), 'yyyy-MM-dd'),
  customerId: '', partnerId: '', salesContactId: '', status: 'draft' as ProjectStatus,
  code: '',
};

export default function Projects() {
  const projects = useQuotationStore((s) => s.projects);
  const clients = useQuotationStore((s) => s.clients);
  const quotations = useQuotationStore((s) => s.quotations);
  const addProject = useQuotationStore((s) => s.addProject);
  const deleteProject = useQuotationStore((s) => s.deleteProject);
  const updateProject = useQuotationStore((s) => s.updateProject);

  // OneDrive bulk auto-link
  const {
    isAuthenticated: oneDriveSignedIn,
    isLoading: oneDriveLoading,
    login: oneDriveLogin,
    getAccessToken: getOneDriveToken,
  } = useOneDriveAuth();
  const [bulkLinkDialogOpen, setBulkLinkDialogOpen] = useState(false);
  const [bulkLinkProgress, setBulkLinkProgress] = useState<{
    running: boolean;
    done: number;
    total: number;
    linked: number;
    created: number;
    failed: number;
    currentCode: string;
    failures: string[];
  } | null>(null);
  const [bulkLinkSummary, setBulkLinkSummary] = useState<string>('');
  const [createNotice, setCreateNotice] = useState<{ severity: 'success' | 'info' | 'warning' | 'error'; message: string } | null>(null);
  const oneDriveRequired = isCorporateOneDriveConfigured();
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  // Projects that don't yet have a proposal folder linked. (We don't try to
  // auto-link execution folders here — those are derived from proposal folders
  // via the promote-to-execution flow when status flips to 'won'.)
  const unlinkedProjects = useMemo<Project[]>(
    () => projects.filter((p) => !p.proposalFolderId),
    [projects],
  );

  const runBulkAutoLink = async () => {
    if (!oneDriveSignedIn) {
      await oneDriveLogin();
      // loginRedirect navigates away; this code path won't actually continue.
      return;
    }
    const token = await getOneDriveToken();
    if (!token) {
      setBulkLinkSummary('Could not get OneDrive token. Sign in again.');
      setBulkLinkDialogOpen(false);
      return;
    }
    setBulkLinkDialogOpen(false);
    const targets = unlinkedProjects;
    const progress = {
      running: true,
      done: 0,
      total: targets.length,
      linked: 0,
      created: 0,
      failed: 0,
      currentCode: '',
      failures: [] as string[],
    };
    setBulkLinkProgress({ ...progress });

    // Sequential to avoid hammering Graph; each project does 2-3 API calls.
    for (const p of targets) {
      progress.currentCode = p.code;
      setBulkLinkProgress({ ...progress });
      try {
        const ref = await ensureProposalFolder(token, p);
        await updateProject(p.id, {
          proposalFolderId: ref.id,
          proposalFolderUrl: ref.webUrl,
        });
        if (ref.matchedExisting) progress.linked++;
        else progress.created++;
        // Bonus: if the project is already won, also resolve the execution folder.
        if (p.status === 'won' && !p.executionFolderId) {
          try {
              let exId: string;
            let exUrl: string;
            let proposalUrl: string | undefined;
            if (p.mainProjectNo) {
              const { executionFolder, proposalFolder } = await moveProposalToExecution(token, {
                code: p.code,
                name: p.name,
                proposalFolderId: ref.id,
                executionFolderName: p.mainProjectNo,
              });
              exId = executionFolder.id;
              exUrl = executionFolder.webUrl;
              proposalUrl = proposalFolder.webUrl;
            } else {
              const exRef = await ensureExecutionFolder(token, p);
              exId = exRef.id;
              exUrl = exRef.webUrl;
            }
            await updateProject(p.id, {
              executionFolderId: exId,
              executionFolderUrl: exUrl,
              ...(proposalUrl ? { proposalFolderUrl: proposalUrl } : {}),
            });
          } catch (exErr) {
            // Non-fatal — proposal folder still landed.
            // eslint-disable-next-line no-console
            console.warn(`[OneDrive] bulk auto-link execution failed for ${p.code}`, exErr);
          }
        }
      } catch (err) {
        progress.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        progress.failures.push(`${p.code}: ${msg}`);
        // eslint-disable-next-line no-console
        console.warn(`[OneDrive] bulk auto-link failed for ${p.code}`, err);
      }
      progress.done++;
      setBulkLinkProgress({ ...progress });
    }
    progress.running = false;
    progress.currentCode = '';
    setBulkLinkProgress({ ...progress });
    const summary = `Done: ${progress.linked} linked to existing, ${progress.created} created, ${progress.failed} failed.`;
    setBulkLinkSummary(summary);
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  // tracks whether the location/code fields were auto-filled — so customer
  // changes can replace them, but manual edits lock them in
  const [locationAutoFilled, setLocationAutoFilled] = useState(false);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);

  // helper: compute the auto code given a customerId + date string.
  // We derive the next sequence from the actual project codes — the stored
  // `seq` counter is unreliable because legacy imports and manual code
  // assignments don't update it (data has codes up to 036 while the counter
  // might say 7). Computing from data on every render keeps the preview
  // honest. The actual server-side increment uses the same derivation.
  const computeCode = (customerId: string, date: string) => {
    const customer = clients.find((c) => c.id === customerId);
    const seq = nextProjectSequence(projects.map((p) => p.code));
    return quotationCode(seq, customer?.code ?? 'XXX', '00', new Date(date));
  };

  // ── filter + sort state ────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [legacyFilter, setLegacyFilter] = useState<'all' | 'legacy' | 'current'>('all');
  const [ongoingOnly, setOngoingOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(() => loadSortPref().key);
  const [sortDir, setSortDir] = useState<SortDir>(() => loadSortPref().dir);

  // OneDrive is no longer a hard gate on project creation. When it's configured
  // but the user isn't signed in, we still let them create the project and link
  // the proposal folder later. This avoids stranding a colleague whose MSAL
  // session is cached but can't acquire a token silently (24h SPA refresh-token
  // cap + ssoSilent blocked by browser cookie policy / wrong origin).
  const startNew = async () => {
    setForm(empty);
    setLocationAutoFilled(false);
    setCodeManuallyEdited(false);
    setOpen(true);
  };
  const save = async () => {
    if (!form.name || !form.customerId) return;
    try {
      const saved = await addProject({
        name: form.name,
        location: form.location,
        date: form.date,
        customerId: form.customerId || null,
        partnerId: form.partnerId || null,
        salesContactId: form.salesContactId || null,
        status: form.status,
        code: form.code || undefined,
      });
      setOpen(false);
      // If OneDrive is configured but the folder couldn't be created (not signed
      // in, or token unavailable), let the user know the project saved fine and
      // the folder can be linked later from the project page.
      if (oneDriveRequired && saved && !saved.proposalFolderId) {
        setCreateNotice({
          severity: 'info',
          message: oneDriveSignedIn
            ? 'Project created. OneDrive folder could not be created right now — open the project to create or link its proposal folder.'
            : 'Project created without a OneDrive folder. Sign in to OneDrive, then create or link the proposal folder from the project page.',
        });
      }
    } catch (err) {
      setCreateNotice({ severity: 'error', message: err instanceof Error ? err.message : 'Failed to create project.' });
    }
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
    // IOCT margin: pick the latest IOCT quotation (highest revision).
    const ioctQuotes = qs.filter((q) => q.kind === 'IOCT');
    const latestIoct = ioctQuotes.sort((a, b) =>
      (b.revision || '00').localeCompare(a.revision || '00'),
    )[0];
    const margin = latestIoct ? ioctMargin(computeTotals(latestIoct)) : null;
    return { p, customer, partner, totals, grandTotal, hasLegacy, year, margin };
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
      if (statusFilter.length > 0 && !statusFilter.includes(p.status)) return false;
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
        case 'margin':
          // Sort by pct; nulls (no data) go to the bottom regardless of direction
          av = a.margin ? a.margin.pct : -Infinity;
          bv = b.margin ? b.margin.pct : -Infinity;
          break;
      }
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    const nextDir: SortDir = sortKey === key
      ? (sortDir === 'asc' ? 'desc' : 'asc')
      : (key === 'date' || key === 'grandTotal' ? 'desc' : 'asc');
    setSortKey(key);
    setSortDir(nextDir);
    saveSortPref(key, nextDir);
  };

  // ── scroll-position memory + last-clicked row highlight ────────────────────
  const SCROLL_KEY = 'calcsheet-projects-scroll';
  const LAST_KEY = 'calcsheet-projects-last';
  const saveScroll = (projectId?: string) => {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    if (projectId) sessionStorage.setItem(LAST_KEY, projectId);
  };

  // The most recently clicked project id — persists across visits to the
  // detail page so the user can see at-a-glance which row they just came
  // back from. Cleared automatically when they click a different row.
  const [lastClickedId, setLastClickedId] = useState<string>(() =>
    sessionStorage.getItem(LAST_KEY) || '',
  );

  useEffect(() => {
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (!saved) return;
    sessionStorage.removeItem(SCROLL_KEY);
    const top = parseInt(saved, 10);
    // Double-rAF: first frame commits layout, second frame is safe to scroll
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
      });
    });
  }, []);

  const clearFilters = () => {
    setSearch(''); setStatusFilter([]); setCustomerFilter('all');
    setYearFilter('all'); setLegacyFilter('all'); setOngoingOnly(false);
  };

  const anyFilterActive = search || statusFilter.length > 0 || customerFilter !== 'all'
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
          {isCorporateOneDriveConfigured() && unlinkedProjects.length > 0 && (
            <Tooltip title={`Scan OneDrive and link the ${unlinkedProjects.length} project${unlinkedProjects.length === 1 ? '' : 's'} with no folder yet`}>
              <Button
                variant="outlined"
                color="info"
                startIcon={<CloudSyncIcon />}
                onClick={() => setBulkLinkDialogOpen(true)}
                disabled={bulkLinkProgress?.running}
              >
                Auto-link OneDrive ({unlinkedProjects.length})
              </Button>
            </Tooltip>
          )}
          {oneDriveRequired && !oneDriveSignedIn && (
            <Button
              variant="outlined"
              color="info"
              startIcon={<CloudSyncIcon />}
              onClick={() => { void oneDriveLogin(); }}
              disabled={oneDriveLoading}
            >
              Sign in OneDrive
            </Button>
          )}
          <Button
            component={Link}
            to="/sales/calcsheet/import-legacy"
            variant="outlined"
            color="warning"
            startIcon={<UploadFileIcon />}
          >
            Import legacy
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { void startNew(); }}
            disabled={oneDriveRequired && !oneDriveSignedIn && oneDriveLoading}
          >
            New project
          </Button>
        </Stack>
      </Stack>

      {/* Bulk auto-link progress */}
      {bulkLinkProgress && bulkLinkProgress.running && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Auto-linking OneDrive folders… {bulkLinkProgress.done} / {bulkLinkProgress.total}
              {bulkLinkProgress.currentCode && ` · ${bulkLinkProgress.currentCode}`}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={bulkLinkProgress.total ? (bulkLinkProgress.done / bulkLinkProgress.total) * 100 : 0}
            />
            <Typography variant="caption" color="text.secondary">
              Linked to existing: {bulkLinkProgress.linked} · Newly created: {bulkLinkProgress.created} · Failed: {bulkLinkProgress.failed}
            </Typography>
          </Stack>
        </Paper>
      )}
      {bulkLinkProgress && !bulkLinkProgress.running && bulkLinkProgress.failures.length > 0 && (
        <Alert severity="warning" onClose={() => setBulkLinkProgress(null)}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{bulkLinkProgress.failed} project{bulkLinkProgress.failed === 1 ? '' : 's'} failed:</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.8rem' }}>
            {bulkLinkProgress.failures.slice(0, 10).map((f, i) => <li key={i}>{f}</li>)}
            {bulkLinkProgress.failures.length > 10 && <li>… and {bulkLinkProgress.failures.length - 10} more (see console)</li>}
          </Box>
        </Alert>
      )}

      <Dialog open={bulkLinkDialogOpen} onClose={() => setBulkLinkDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Auto-link OneDrive folders</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            For each of the <strong>{unlinkedProjects.length}</strong> project{unlinkedProjects.length === 1 ? '' : 's'} without
            a OneDrive folder linked yet, the system will:
          </Typography>
          <Box component="ol" sx={{ pl: 3, my: 0, fontSize: '0.875rem', color: 'text.secondary' }}>
            <li>Look in <code>{/* eslint-disable-next-line */}'00 Proposal/IO Proposal'</code> for a folder whose name starts with the project's PCS code</li>
            <li>If exactly one match is found, link to it (no folder created)</li>
            <li>If no match, create a new folder using the canonical name</li>
            <li>For projects already marked <strong>won</strong>, also link or create the execution folder</li>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Existing folders are <strong>never modified or deleted</strong>. Worst-case outcome is an extra empty
            folder which you can delete manually. This may take a minute or two.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkLinkDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<CloudSyncIcon />} onClick={runBulkAutoLink}>
            Start
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!bulkLinkSummary}
        autoHideDuration={8000}
        onClose={() => setBulkLinkSummary('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setBulkLinkSummary('')}
          severity={bulkLinkProgress?.failed ? 'warning' : 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {bulkLinkSummary}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!createNotice}
        autoHideDuration={createNotice?.severity === 'error' ? 12000 : 9000}
        onClose={() => setCreateNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setCreateNotice(null)}
          severity={createNotice?.severity ?? 'info'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {createNotice?.message}
        </Alert>
      </Snackbar>

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
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Status</InputLabel>
            <Select
              multiple
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProjectStatus[])}
              input={<OutlinedInput label="Status" />}
              renderValue={(selected) =>
                selected.length === STATUS_OPTIONS.length
                  ? 'All'
                  : selected.map(statusLabel).join(', ')
              }
            >
              {STATUS_OPTIONS.map((status) => (
                <MenuItem key={status} value={status}>
                  <Checkbox size="small" checked={statusFilter.includes(status)} />
                  <ListItemText primary={statusLabel(status)} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
            label={<Typography variant="caption">Active proposals only</Typography>}
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
              <SortHeader k="margin" label="IOCT Margin" align="right" />
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map(({ p, customer, partner, totals, hasLegacy, margin }) => {
              const isLast = p.id === lastClickedId;
              const onRowClick = () => { setLastClickedId(p.id); saveScroll(p.id); };
              return (
              <TableRow
                key={p.id}
                hover
                sx={isLast ? {
                  // Soft highlight + accent border on the most recently visited row.
                  // sessionStorage-backed so it survives the round-trip into the
                  // project detail page during folder-backfill workflows.
                  bgcolor: 'rgba(25, 118, 210, 0.08)',
                  borderLeft: '3px solid',
                  borderLeftColor: 'primary.main',
                } : undefined}
              >
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Link to={`/sales/calcsheet/projects/${p.id}`} style={{ color: 'inherit' }} onClick={onRowClick}>{p.code}</Link>
                    {hasLegacy && (
                      <Tooltip title="Has legacy quotation(s)">
                        <HistoryIcon fontSize="inherit" color="warning" sx={{ fontSize: '0.85rem' }} />
                      </Tooltip>
                    )}
                    {isLast && (
                      <Tooltip title="Last visited">
                        <Chip size="small" label="Last" color="primary" variant="outlined" sx={{ height: 16, '& .MuiChip-label': { px: 0.75, fontSize: '0.65rem' } }} />
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Link to={`/sales/calcsheet/projects/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }} onClick={onRowClick}>
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
                    <Select
                      size="small"
                      value={p.status}
                      onChange={(e) => updateProject(p.id, { status: e.target.value as ProjectStatus })}
                      sx={{
                        minWidth: 96,
                        '& .MuiSelect-select': { py: 0.25, display: 'flex', alignItems: 'center' },
                        '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { border: '1px solid', borderColor: 'grey.400' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: '1px solid', borderColor: 'primary.main' },
                      }}
                      MenuProps={{ sx: { '& .MuiMenuItem-root': { fontSize: '0.8rem' } } }}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <MenuItem key={s} value={s} dense>
                          <Chip size="small" label={s} color={statusColors[s]} sx={{ minWidth: 60 }} />
                        </MenuItem>
                      ))}
                    </Select>
                    {p.ongoing && <Chip size="small" label="active" variant="outlined" sx={{ height: 18 }} />}
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
                  {margin ? (
                    <Stack spacing={0.25}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: margin.value >= 0 ? 'success.main' : 'error.main',
                        }}
                      >
                        {PHP(margin.value)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {margin.pct.toFixed(1)}%
                      </Typography>
                    </Stack>
                  ) : (
                    <Tooltip title="No cost data — legacy snapshot was imported from PDF or an ACTI-variant workbook">
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => setDeleteTarget(p)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
              );
            })}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                  {projects.length === 0
                    ? 'No projects yet — click "New project" to start'
                    : 'No projects match the current filters'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete project?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently delete <strong>{deleteTarget?.code} — {deleteTarget?.name}</strong> and all of its quotations. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (deleteTarget) { deleteProject(deleteTarget.id); setDeleteTarget(null); }
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New project</DialogTitle>
        <DialogContent>
          {oneDriveRequired && !oneDriveSignedIn && (
            <Alert
              severity="info"
              sx={{ mb: 1 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => { void oneDriveLogin(); }}
                  disabled={oneDriveLoading}
                >
                  Sign in
                </Button>
              }
            >
              You're not signed in to OneDrive. You can still create this project now and link its
              proposal folder later from the project page.
            </Alert>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            <TextField label="Project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ gridColumn: 'span 2' }} />
            {/* Customer first so location can auto-fill from it */}
            <TextField
              select
              label="Customer"
              value={form.customerId}
              onChange={(e) => {
                const newCustomerId = e.target.value;
                const selectedClient = clients.find((c) => c.id === newCustomerId);
                const newLocation =
                  (locationAutoFilled || form.location === '')
                    ? (selectedClient?.address ?? form.location)
                    : form.location;
                const didAutoFill = !!selectedClient?.address && newLocation === selectedClient?.address;
                setLocationAutoFilled(didAutoFill);
                const newCode = codeManuallyEdited ? form.code : computeCode(newCustomerId, form.date);
                setForm((prev) => ({ ...prev, customerId: newCustomerId, location: newLocation, code: newCode }));
              }}
            >
              {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>)}
            </TextField>
            <TextField select label="Partner (optional)" value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
              <MenuItem value="">— none —</MenuItem>
              {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>)}
            </TextField>
            <TextField
              label="Location"
              value={form.location}
              onChange={(e) => { setLocationAutoFilled(false); setForm({ ...form, location: e.target.value }); }}
              sx={{ gridColumn: 'span 2' }}
              helperText={locationAutoFilled ? 'Auto-filled from client — edit freely' : undefined}
            />
            <TextField
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => {
                const newDate = e.target.value;
                const newCode = codeManuallyEdited ? form.code : computeCode(form.customerId, newDate);
                setForm({ ...form, date: newDate, code: newCode });
              }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="sent">Sent</MenuItem>
              <MenuItem value="won">Won</MenuItem>
              <MenuItem value="lost">Lost</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
            <TextField
              select
              label="Sales / account contact"
              value={form.salesContactId}
              onChange={(e) => setForm({ ...form, salesContactId: e.target.value })}
              sx={{ gridColumn: 'span 2' }}
            >
              <MenuItem value="">— none —</MenuItem>
              <MenuItem value="Tyrone James Caballero">Tyrone James Caballero</MenuItem>
              <MenuItem value="Renzel Punongbayan">Renzel Punongbayan</MenuItem>
              <MenuItem value="Reuel Joshua Rivera">Reuel Joshua Rivera</MenuItem>
              <MenuItem value="Nylle Harold Managa">Nylle Harold Managa</MenuItem>
            </TextField>
            {/* Project code — editable, auto-filled from customer + date */}
            <TextField
              label="Project code (optional)"
              value={form.code}
              onChange={(e) => { setCodeManuallyEdited(true); setForm({ ...form, code: e.target.value }); }}
              onFocus={() => {
                // auto-fill on first focus if still empty
                if (!form.code && form.customerId && form.date) {
                  setForm((prev) => ({ ...prev, code: computeCode(form.customerId, form.date) }));
                }
              }}
              placeholder={
                form.customerId && form.date
                  ? computeCode(form.customerId, form.date)
                  : 'Auto-generated once customer & date are set'
              }
              helperText={
                codeManuallyEdited
                  ? 'Using your custom code. Clear the field to revert to auto-generation.'
                  : form.code
                  ? 'Auto-generated from customer & date — edit to override'
                  : 'Leave blank — code will be auto-generated from the customer code and date'
              }
              inputProps={{ style: { fontFamily: 'monospace' } }}
              sx={{ gridColumn: 'span 2' }}
            />
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
