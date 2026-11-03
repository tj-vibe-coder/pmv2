import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel,
  FormHelperText, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Edit as EditIcon, EventRepeat as RecurringIcon } from '@mui/icons-material';
import { API_BASE } from '../../config/api';
import { OVERHEAD_CATEGORIES, PROJECT_EXPENSE_CATEGORIES } from '../../data/financeCategories';
import { blobToBase64, compressForUpload } from '../../utils/receipts/imageCompress';
import { isPdfReceipt, makeReceiptUploadFilename, RECEIPT_FILE_ACCEPT } from '../../utils/receipts/receiptFile';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0', secondary: '#1e4a72' };

// Recurring expenses (subscriptions, retainers, quarterly taxes). A template only
// reminds: each due occurrence waits here until an admin confirms the amount
// actually charged, or skips it. Server rules: server/recurringExpenses.js.

type Frequency = 'monthly' | 'quarterly' | 'yearly';
type PaidBy = { kind: 'company'; paidVia: 'bank' | 'corporate_card' } | { kind: 'person_repay'; userId: string; name?: string };
interface Template {
  id: string; name: string; supplier?: string; category: string; scope: 'overhead' | 'project';
  projectId?: string; projectName?: string; projectNo?: string; amount: number; currency: 'PHP' | 'USD';
  frequency: Frequency; dayOfMonth: number; paidBy: PaidBy; notes?: string; active?: boolean; nextDue: string; due: string[];
}
interface ProjectOption { id: string; project_name?: string; project_no?: string }

const php = (n: number) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('netpacific_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};
const paidByLabel = (p: PaidBy) => p.kind === 'person_repay'
  ? `${p.name || 'Person'} (repaid via liquidation)`
  : p.paidVia === 'corporate_card' ? 'IOCT corporate card' : 'IOCT bank account';
const freqLabel: Record<Frequency, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

const emptyForm = {
  name: '', supplier: '', category: '', scope: 'overhead' as 'overhead' | 'project', projectId: '', amount: '', currency: 'PHP' as 'PHP' | 'USD',
  frequency: 'monthly' as Frequency, dayOfMonth: '1', startDate: '', payer: 'company_bank', notes: '', active: true,
};

const primaryBtn = { backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } };

const RecurringExpensesTray: React.FC<{ onPosted?: () => void }> = ({ onPosted }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadError, setLoadError] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [settling, setSettling] = useState<{ t: Template; action: 'confirm' | 'skip' } | null>(null);
  const [settle, setSettle] = useState({ amount: '', date: '', invoiceAmount: '', remarks: '', reason: '' });
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [settleError, setSettleError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/recurring-expenses`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not load recurring expenses');
      setTemplates(data.templates);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load recurring expenses');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const due = useMemo(() => templates.filter((t) => t.active !== false && t.due.length > 0)
    .sort((a, b) => a.due[0].localeCompare(b.due[0])), [templates]);

  const openManage = async () => {
    setManageOpen(true);
    const [p, pr] = await Promise.all([
      fetch(`${API_BASE}/api/recurring-expenses/people`, { headers: authHeaders() }).then((r) => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/projects`, { headers: authHeaders() }).then((r) => r.json()).catch(() => null),
    ]);
    if (p?.success) setPeople(p.people);
    const list = Array.isArray(pr) ? pr : pr?.projects;
    if (Array.isArray(list)) setProjects(list.map((x: ProjectOption) => ({ id: String(x.id), project_name: x.project_name, project_no: x.project_no })));
  };

  const startEdit = (t: Template | 'new') => {
    setFormError('');
    setEditing(t);
    if (t === 'new') { setForm({ ...emptyForm, startDate: new Date().toISOString().slice(0, 10) }); return; }
    setForm({
      name: t.name, supplier: t.supplier || '', category: t.category, scope: t.scope, projectId: t.projectId || '',
      amount: String(t.amount), currency: t.currency, frequency: t.frequency, dayOfMonth: String(t.dayOfMonth), startDate: '',
      payer: t.paidBy.kind === 'person_repay' ? `person:${t.paidBy.userId}` : t.paidBy.paidVia === 'corporate_card' ? 'company_card' : 'company_bank',
      notes: t.notes || '', active: t.active !== false,
    });
  };

  const saveTemplate = async () => {
    setFormError('');
    const personId = form.payer.startsWith('person:') ? form.payer.slice(7) : '';
    const paidBy: PaidBy = personId
      ? { kind: 'person_repay', userId: personId, name: people.find((p) => p.id === personId)?.name }
      : { kind: 'company', paidVia: form.payer === 'company_card' ? 'corporate_card' : 'bank' };
    const project = projects.find((p) => p.id === form.projectId);
    const body = {
      name: form.name, supplier: form.supplier, category: form.category, scope: form.scope, amount: Number(form.amount), currency: form.currency,
      frequency: form.frequency, dayOfMonth: Number(form.dayOfMonth), paidBy, notes: form.notes,
      ...(form.scope === 'project' ? { projectId: form.projectId, projectName: project?.project_name || '', projectNo: project?.project_no || '' } : {}),
      ...(editing === 'new' ? { startDate: form.startDate } : { active: form.active }),
    };
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/recurring-expenses${editing === 'new' ? '' : `/${(editing as Template).id}`}`, {
        method: editing === 'new' ? 'POST' : 'PUT', headers: authHeaders(), body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) { setFormError(data.error || 'Could not save'); return; }
      setEditing(null);
      await load();
    } finally { setBusy(false); }
  };

  const openSettle = (t: Template, action: 'confirm' | 'skip') => {
    setSettleError('');
    setReceipt(null);
    setSettle({ amount: t.currency === 'PHP' ? String(t.amount) : '', date: t.due[0], invoiceAmount: t.currency === 'PHP' ? '' : String(t.amount), remarks: '', reason: '' });
    setSettling({ t, action });
  };

  const uploadReceipt = async (t: Template): Promise<{ oneDriveId: string; webUrl: string; filename: string } | null> => {
    if (!receipt) return null;
    const year = t.due[0].slice(0, 4);
    const folderPath = t.paidBy.kind === 'person_repay'
      ? `Liquidation Receipts/${year}/draft`
      : t.scope === 'project' ? `Project Receipts/${t.projectNo || t.projectId}/${year}` : `00 Overhead Receipts/${year}`;
    const filename = makeReceiptUploadFilename(receipt);
    const blob = isPdfReceipt(receipt) ? receipt : await compressForUpload(receipt);
    const res = await fetch(`${API_BASE}/api/onedrive/upload`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ folderPath, filename, contentBase64: await blobToBase64(blob) }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    if (!data.ok || !data.id) throw new Error('Receipt upload failed. Try again or confirm without it and attach it later.');
    return { oneDriveId: data.id, webUrl: data.webUrl, filename };
  };

  const submitSettle = async () => {
    if (!settling) return;
    const { t, action } = settling;
    setSettleError('');
    if (action === 'confirm' && !(Number(settle.amount) > 0)) { setSettleError('Enter the amount actually charged in pesos.'); return; }
    setBusy(true);
    try {
      const receiptRef = action === 'confirm' ? await uploadReceipt(t) : null;
      const res = await fetch(`${API_BASE}/api/recurring-expenses/${t.id}/${action}`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(action === 'confirm'
          ? { occurrence: t.due[0], amount: Number(settle.amount), date: settle.date, invoiceAmount: Number(settle.invoiceAmount) || undefined, remarks: settle.remarks, receiptRef }
          : { occurrence: t.due[0], reason: settle.reason }),
      });
      const data = await res.json();
      if (!data.success) { setSettleError(data.error || 'Could not save'); await load(); return; }
      setSettling(null);
      setNotice(action === 'skip'
        ? `${t.name}: ${t.due[0]} skipped.`
        : t.paidBy.kind === 'person_repay'
          ? `${t.name} added to ${t.paidBy.name || 'their'} draft liquidation. It becomes a repayment claim when submitted.`
          : `${t.name} recorded as an expense.`);
      await load();
      onPosted?.();
    } catch (e) {
      setSettleError(e instanceof Error ? e.message : 'Could not save');
    } finally { setBusy(false); }
  };

  const categories = form.scope === 'project' ? PROJECT_EXPENSE_CATEGORIES : OVERHEAD_CATEGORIES;

  return (
    <Paper sx={{ borderRadius: 2, overflow: 'hidden', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0', mb: 2 }}>
      <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 1 }}>
        <RecurringIcon sx={{ color: NET_PACIFIC_COLORS.primary }} />
        <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flexGrow: 1 }}>
          Recurring expenses due {due.length > 0 && <Chip size="small" color="warning" label={due.reduce((n, t) => n + t.due.length, 0)} sx={{ ml: 1 }} />}
        </Typography>
        <Button size="small" variant="outlined" onClick={openManage} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>
          Manage recurring
        </Button>
      </Box>
      <Box sx={{ p: 1.5 }}>
        {loadError && <Alert severity="warning" sx={{ mb: 1 }}>{loadError}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 1 }}>{notice}</Alert>}
        {due.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Nothing due. {templates.length === 0 ? 'Add subscriptions, retainers and quarterly taxes under Manage recurring.' : ''}</Typography>
        ) : (
          <Stack spacing={1}>
            {due.map((t) => (
              <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, p: 1, border: '1px solid #e2e8f0', borderRadius: 1, bgcolor: 'background.paper' }}>
                <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.name}</Typography>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Due {t.due[0]}{t.due.length > 1 ? ` · ${t.due.length} occurrences waiting (oldest first)` : ''} · {t.category} · {paidByLabel(t.paidBy)}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.currency === 'PHP' ? php(t.amount) : `${t.currency} ${t.amount.toFixed(2)}`}</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" sx={primaryBtn} onClick={() => openSettle(t, 'confirm')}>Confirm</Button>
                  <Button size="small" onClick={() => openSettle(t, 'skip')}>Skip</Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {/* Confirm / skip one occurrence */}
      <Dialog open={!!settling} onClose={() => !busy && setSettling(null)} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle sx={{ fontWeight: 600 }}>{settling?.action === 'skip' ? 'Skip' : 'Confirm'} {settling?.t.name} · {settling?.t.due[0]}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {settleError && <Alert severity="error">{settleError}</Alert>}
            {settling?.action === 'skip' ? (
              <TextField label="Reason (optional)" size="small" value={settle.reason} onChange={(e) => setSettle({ ...settle, reason: e.target.value })} helperText="Nothing is recorded; the item moves to its next due date." />
            ) : settling && (
              <>
                <Alert severity="info" variant="outlined">
                  {settling.t.paidBy.kind === 'person_repay'
                    ? `Adds a line to ${settling.t.paidBy.name || 'the payer'}'s draft liquidation. Submit that liquidation to claim the repayment.`
                    : `Records ${settling.t.scope === 'project' ? 'a project' : 'an overhead'} expense paid from the ${paidByLabel(settling.t.paidBy)}.`}
                </Alert>
                {settling.t.currency !== 'PHP' && (
                  <TextField label={`Invoice amount (${settling.t.currency})`} size="small" type="number" value={settle.invoiceAmount} onChange={(e) => setSettle({ ...settle, invoiceAmount: e.target.value })} />
                )}
                <TextField label="Amount charged (PHP)" size="small" type="number" required value={settle.amount} onChange={(e) => setSettle({ ...settle, amount: e.target.value })}
                  helperText={settling.t.currency !== 'PHP' ? 'The peso amount on your card statement.' : 'Edit if this month differs (e.g. prorated).'} />
                <TextField label="Date" size="small" type="date" value={settle.date} onChange={(e) => setSettle({ ...settle, date: e.target.value })} InputLabelProps={{ shrink: true }} />
                <TextField label="Remarks (optional)" size="small" value={settle.remarks} onChange={(e) => setSettle({ ...settle, remarks: e.target.value })} />
                <Box>
                  <Button component="label" size="small" variant="outlined" sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>
                    {receipt ? 'Change receipt' : 'Attach receipt (optional)'}
                    <input hidden type="file" accept={RECEIPT_FILE_ACCEPT} onChange={(e) => setReceipt(e.target.files?.[0] || null)} />
                  </Button>
                  {receipt && <Typography variant="caption" sx={{ ml: 1 }}>{receipt.name}</Typography>}
                  <FormHelperText>A reminder is not proof: attach the invoice or receipt when you have it.</FormHelperText>
                </Box>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSettling(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" sx={primaryBtn} onClick={submitSettle} disabled={busy}>{settling?.action === 'skip' ? 'Skip' : 'Confirm'}</Button>
        </DialogActions>
      </Dialog>

      {/* Manage templates */}
      <Dialog open={manageOpen} onClose={() => setManageOpen(false)} maxWidth="md" fullWidth fullScreen={fullScreen}>
        <DialogTitle sx={{ fontWeight: 600 }}>Recurring expenses</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button size="small" variant="contained" sx={primaryBtn} onClick={() => startEdit('new')}>Add recurring item</Button>
          </Box>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {['Item', 'Amount', 'Every', 'Next due', 'Paid by', ''].map((h) => <TableCell key={h} sx={{ fontWeight: 600 }}>{h}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {templates.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 3 }}>No recurring items yet.</TableCell></TableRow>
                ) : templates.map((t) => (
                  <TableRow key={t.id} sx={{ opacity: t.active === false ? 0.55 : 1 }}>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{t.name}<Typography variant="caption" display="block" color="text.secondary">{t.category}{t.active === false ? ' · paused' : ''}</Typography></TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{t.currency === 'PHP' ? php(t.amount) : `${t.currency} ${t.amount.toFixed(2)}`}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{freqLabel[t.frequency]}, day {t.dayOfMonth}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{t.nextDue}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{paidByLabel(t.paidBy)}</TableCell>
                    <TableCell><Tooltip title="Edit"><IconButton size="small" onClick={() => startEdit(t)}><EditIcon fontSize="small" /></IconButton></Tooltip></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setManageOpen(false)}>Close</Button></DialogActions>
      </Dialog>

      {/* Add / edit template */}
      <Dialog open={!!editing} onClose={() => !busy && setEditing(null)} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle sx={{ fontWeight: 600 }}>{editing === 'new' ? 'Add recurring item' : 'Edit recurring item'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Name" size="small" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Claude Pro" />
            <TextField label="Supplier" size="small" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            <FormControl size="small" fullWidth>
              <InputLabel>Paid by</InputLabel>
              <Select label="Paid by" value={form.payer} onChange={(e) => setForm({ ...form, payer: e.target.value })}>
                <MenuItem value="company_bank">IOCT bank account</MenuItem>
                <MenuItem value="company_card">IOCT corporate card</MenuItem>
                {people.map((p) => <MenuItem key={p.id} value={`person:${p.id}`}>{p.name}'s own card (repaid via liquidation)</MenuItem>)}
              </Select>
              <FormHelperText>A person's card adds each month to their draft liquidation instead of recording a company expense.</FormHelperText>
            </FormControl>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 140 } }}>
                <InputLabel>Charged to</InputLabel>
                <Select label="Charged to" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as 'overhead' | 'project', category: '' })}>
                  <MenuItem value="overhead">Overhead</MenuItem>
                  <MenuItem value="project">A project</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Category</InputLabel>
                <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
            {form.scope === 'project' && (
              <FormControl size="small" fullWidth>
                <InputLabel>Project</InputLabel>
                <Select label="Project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                  {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.project_no ? `${p.project_no} · ` : ''}{p.project_name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Usual amount" size="small" type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} fullWidth />
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 110 } }}>
                <InputLabel>Currency</InputLabel>
                <Select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as 'PHP' | 'USD' })}>
                  <MenuItem value="PHP">PHP</MenuItem>
                  <MenuItem value="USD">USD</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Every</InputLabel>
                <Select label="Every" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>
                  <MenuItem value="monthly">Month</MenuItem>
                  <MenuItem value="quarterly">Quarter</MenuItem>
                  <MenuItem value="yearly">Year</MenuItem>
                </Select>
              </FormControl>
              <TextField label="Day of month" size="small" type="number" value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })} inputProps={{ min: 1, max: 31 }} helperText="31 means the last day in shorter months" fullWidth />
              {editing === 'new' && (
                <TextField label="Starting from" size="small" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth />
              )}
            </Stack>
            <TextField label="Notes" size="small" multiline minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              helperText={form.category === 'Taxes & Licenses' ? 'For BIR percentage tax, put 2551Q in the name.' : undefined} />
            {editing !== 'new' && (
              <FormControlLabel control={<Switch checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />} label={form.active ? 'Active' : 'Paused'} />
            )}
            {editing !== 'new' && <FormHelperText>A new amount applies from now on; past entries keep theirs.</FormHelperText>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" sx={primaryBtn} onClick={saveTemplate} disabled={busy}>Save</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default RecurringExpensesTray;
