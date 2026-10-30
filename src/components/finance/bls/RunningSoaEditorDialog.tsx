import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, MenuItem, Paper,
  Stack, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { API_BASE } from '../../../config/api';
import type { BillingStatement, BlsRefRow, SoaTxn } from '../../../types/BillingStatement';
import { computeSoaSummary, DEFAULT_SOA_REMITTANCE } from '../../../types/BillingStatement';
import type { ProjectInvoice } from '../../../types/Invoice';
import { invoiceSettled } from '../../../types/Invoice';
import { createBillingStatement, nextBlsNo, updateBillingStatement } from '../../../services/billingStatementService';
import { useAuth } from '../../../contexts/AuthContext';

const NUM = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const blankTxn = (): SoaTxn => ({ invoiceDate: todayISO(), siNo: '', description: '', details: '', contractAmount: 0, billingPct: 100, amountBilled: 0, status: 'DUE' });

export interface RunningSoaProject {
  id: string;
  project_no?: string;
  project_name: string;
  account_name?: string;
  po_number?: string;
  with_acti?: boolean;
}

interface Props {
  open: boolean;
  soa: BillingStatement | null;
  projects: RunningSoaProject[];
  onClose: () => void;
  onSaved: (saved: BillingStatement) => void;
  onError: (msg: string) => void;
}

export default function RunningSoaEditorDialog({ open, soa, projects, onClose, onSaved, onError }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const [project, setProject] = useState<RunningSoaProject | null>(null);
  const [docNo, setDocNo] = useState('');
  const [date, setDate] = useState(todayISO());
  const [billedToName, setBilledToName] = useState('');
  const [billedToAddress, setBilledToAddress] = useState('');
  const [billedToTin, setBilledToTin] = useState('');
  const [billedToEmail, setBilledToEmail] = useState('');
  const [attention, setAttention] = useState('');
  const [refRows, setRefRows] = useState<BlsRefRow[]>([]);
  const [billingLabel, setBillingLabel] = useState('');
  const [banner, setBanner] = useState('');
  const [contractValue, setContractValue] = useState(0);
  const [poNo, setPoNo] = useState('');
  const [txns, setTxns] = useState<SoaTxn[]>([blankTxn()]);
  const [paymentNote, setPaymentNote] = useState('');
  const [remittance, setRemittance] = useState(DEFAULT_SOA_REMITTANCE);
  const [remarks, setRemarks] = useState('');
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (soa) {
      setProject(projects.find((p) => String(p.id) === String(soa.projectId)) || null);
      setDocNo(soa.docNo); setDate(soa.date);
      setBilledToName(soa.billedToName || ''); setBilledToAddress(soa.billedToAddress || '');
      setBilledToTin(soa.billedToTin || ''); setBilledToEmail(soa.billedToEmail || ''); setAttention(soa.attention || '');
      setRefRows(soa.refRows || []); setBillingLabel(soa.billingLabel || ''); setBanner(soa.subtitle || '');
      setContractValue(soa.contractValue || 0); setPoNo(soa.poNo || '');
      setTxns(soa.txns?.length ? soa.txns : [blankTxn()]);
      setPaymentNote(soa.paymentNote || ''); setRemittance(soa.remittance ?? DEFAULT_SOA_REMITTANCE); setRemarks(soa.remarks || '');
    } else {
      setProject(null); setDocNo(''); setDate(todayISO());
      setBilledToName(''); setBilledToAddress(''); setBilledToTin(''); setBilledToEmail(''); setAttention('');
      setRefRows([]); setBillingLabel(''); setBanner(''); setContractValue(0); setPoNo('');
      setTxns([blankTxn()]); setPaymentNote(''); setRemittance(DEFAULT_SOA_REMITTANCE); setRemarks('');
    }
  }, [open, soa, projects]);

  useEffect(() => {
    if (!open || !project) { setInvoices([]); return; }
    let cancelled = false;
    fetch(`${API_BASE}/api/invoices?project_id=${encodeURIComponent(String(project.id))}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('netpacific_token') || ''}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectInvoice[]) => { if (!cancelled) setInvoices(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setInvoices([]); });
    return () => { cancelled = true; };
  }, [open, project]);

  const pickProject = async (p: RunningSoaProject | null) => {
    setProject(p);
    if (!p || soa) return;
    if (p.with_acti) {
      setBilledToName('Advance Controle Technologie Inc.');
      setBilledToAddress('Block 13 Lot 8, Mindanao Ave., Gavino Maderan,\nGen. Mariano Alvarez, Cavite 4117');
    } else {
      setBilledToName(p.account_name || ''); setBilledToAddress('');
    }
    setPoNo(p.po_number || '');
    setRefRows([
      { label: 'Project', value: p.project_name },
      ...(p.po_number ? [{ label: 'PO No.', value: p.po_number }] : []),
      { label: 'VAT', value: 'Non-VAT' },
    ]);
    if (p.project_no) {
      try { setDocNo(await nextBlsNo(p.project_no, 'SOA')); } catch { /* server assigns on save */ }
    }
  };

  const addFromInvoice = (inv: ProjectInvoice | null) => {
    if (!inv) return;
    const settled = invoiceSettled(inv) >= inv.amount - 0.005;
    const pct = contractValue > 0 ? Math.round((inv.amount / contractValue) * 10000) / 100 : 100;
    setTxns((ts) => [
      ...ts.filter((t) => t.siNo || t.description || t.amountBilled),
      {
        invoiceDate: inv.invoice_date || todayISO(), siNo: inv.invoice_no, description: '', details: '',
        contractAmount: contractValue, billingPct: pct, amountBilled: inv.amount, status: settled ? 'PAID' : 'DUE',
      },
    ]);
  };

  const summary = useMemo(() => computeSoaSummary(txns, contractValue), [txns, contractValue]);
  const setTxn = (i: number, patch: Partial<SoaTxn>) => setTxns((ts) => ts.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const setRef = (i: number, patch: Partial<BlsRefRow>) => setRefRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!project?.project_no) { onError('Pick a project that has a project number.'); return; }
    const rows = txns.filter((t) => t.description.trim() || t.siNo.trim() || t.amountBilled);
    if (!rows.length) { onError('Add at least one transaction row.'); return; }
    setSaving(true);
    try {
      const payload: Partial<BillingStatement> = {
        kind: 'SOA', docNo: docNo || undefined, date,
        projectId: String(project.id), projectNo: project.project_no, projectName: project.project_name,
        billedToName, billedToAddress, billedToTin, billedToEmail, attention, refRows,
        billingLabel, subtitle: banner, contractValue, poNo, txns: rows, paymentNote, remittance, remarks,
        preparedByName: soa?.preparedByName || user?.full_name || undefined,
      };
      const saved = soa ? await updateBillingStatement(soa.id, payload) : await createBillingStatement(payload);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      onError(err.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle>{soa ? `Edit ${soa.docNo}` : 'New Statement of Account'}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Autocomplete
              options={projects} value={project} disabled={!!soa}
              getOptionLabel={(p) => `${p.project_no || '—'} · ${p.project_name}`}
              isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
              onChange={(_, v) => { void pickProject(v); }}
              renderInput={(params) => <TextField {...params} label="Project" size="small" />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField size="small" fullWidth label="SOA No." value={docNo} disabled={!!soa} onChange={(e) => setDocNo(e.target.value)} helperText="Blank = auto (ProjectNo-SOA-NNN)" />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField size="small" fullWidth type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField size="small" fullWidth label="Bill to" value={billedToName} onChange={(e) => setBilledToName(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField size="small" fullWidth label="Attention" value={attention} onChange={(e) => setAttention(e.target.value)} />
          </Grid>
          <Grid size={12}>
            <TextField size="small" fullWidth multiline minRows={2} label="Bill-to address (one line per row)" value={billedToAddress} onChange={(e) => setBilledToAddress(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField size="small" fullWidth label="Customer TIN" value={billedToTin} onChange={(e) => setBilledToTin(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField size="small" fullWidth label="Customer email" value={billedToEmail} onChange={(e) => setBilledToEmail(e.target.value)} />
          </Grid>

          <Grid size={12}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2c5aa0', mb: 0.5 }}>Project & contract reference</Typography>
            <Stack spacing={1}>
              {refRows.map((r, i) => (
                <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField size="small" label="Label" value={r.label} sx={{ minWidth: { xs: '100%', sm: 160 } }} onChange={(e) => setRef(i, { label: e.target.value })} />
                  <TextField size="small" label="Value" value={r.value} fullWidth onChange={(e) => setRef(i, { value: e.target.value })} />
                  <IconButton size="small" aria-label="Remove row" onClick={() => setRefRows((rs) => rs.filter((_, k) => k !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
              <div><Button size="small" startIcon={<AddIcon />} onClick={() => setRefRows((rs) => [...rs, { label: '', value: '' }])}>Add reference row</Button></div>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField size="small" fullWidth label="Banner badge" value={billingLabel} onChange={(e) => setBillingLabel(e.target.value)} placeholder="e.g. Full Billing · 100%" />
          </Grid>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField size="small" fullWidth label="Banner text" value={banner} onChange={(e) => setBanner(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField size="small" fullWidth type="number" label="Total contract value (PHP)" value={contractValue} onChange={(e) => setContractValue(Number(e.target.value))} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField size="small" fullWidth label="PO No." value={poNo} onChange={(e) => setPoNo(e.target.value)} />
          </Grid>

          <Grid size={12}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2c5aa0', mb: 0.5 }}>Transactions</Typography>
            <Stack spacing={1.5}>
              {txns.map((t, i) => (
                <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                  <Grid container spacing={1}>
                    <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" fullWidth type="date" label="Invoice date" value={t.invoiceDate} onChange={(e) => setTxn(i, { invoiceDate: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                    <Grid size={{ xs: 6, sm: 2 }}><TextField size="small" fullWidth label="SI No." value={t.siNo} onChange={(e) => setTxn(i, { siNo: e.target.value })} /></Grid>
                    <Grid size={{ xs: 12, sm: 7 }}><TextField size="small" fullWidth label="Description" value={t.description} onChange={(e) => setTxn(i, { description: e.target.value })} /></Grid>
                    <Grid size={12}><TextField size="small" fullWidth multiline minRows={2} label="Details (one line per row, optional)" value={t.details || ''} onChange={(e) => setTxn(i, { details: e.target.value })} /></Grid>
                    <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" fullWidth type="number" label="Contract amount" value={t.contractAmount} onChange={(e) => setTxn(i, { contractAmount: Number(e.target.value) })} /></Grid>
                    <Grid size={{ xs: 6, sm: 2 }}>
                      <TextField size="small" fullWidth type="number" label="Billing %" value={t.billingPct}
                        onChange={(e) => { const pct = Number(e.target.value); setTxn(i, { billingPct: pct, amountBilled: Math.round(t.contractAmount * pct) / 100 }); }} />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" fullWidth type="number" label="Amount billed" value={t.amountBilled} onChange={(e) => setTxn(i, { amountBilled: Number(e.target.value) })} /></Grid>
                    <Grid size={{ xs: 4, sm: 2 }}>
                      <TextField size="small" fullWidth select label="Status" value={t.status} onChange={(e) => setTxn(i, { status: e.target.value as 'PAID' | 'DUE' })}>
                        <MenuItem value="DUE">DUE</MenuItem>
                        <MenuItem value="PAID">PAID</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid size={{ xs: 2, sm: 2 }} sx={{ textAlign: 'right' }}>
                      <IconButton size="small" aria-label="Remove transaction" disabled={txns.length === 1} onClick={() => setTxns((ts) => ts.filter((_, k) => k !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                    </Grid>
                  </Grid>
                </Paper>
              ))}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setTxns((ts) => [...ts, blankTxn()])}>Add row</Button>
                <Autocomplete
                  sx={{ minWidth: { xs: '100%', sm: 320 } }} size="small" options={invoices} value={null} blurOnSelect
                  getOptionLabel={(i) => `${i.invoice_no} · ${i.invoice_date || ''} · ₱${NUM(i.amount)}`}
                  onChange={(_, v) => addFromInvoice(v)}
                  noOptionsText={project ? 'No invoices recorded for this project' : 'Pick a project first'}
                  renderInput={(params) => <TextField {...params} label="Add a row from a recorded invoice" size="small" />}
                />
              </Stack>
            </Stack>
          </Grid>

          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="body2">Previous billings (PAID): <b>₱{NUM(summary.previousBillings)}</b></Typography>
              <Typography variant="body2">This billing (DUE): <b>₱{NUM(summary.thisBilling)}</b></Typography>
              <Typography variant="body1" sx={{ fontWeight: 700, color: '#2c5aa0' }}>Total amount due: ₱{NUM(summary.totalDue)} · balance after settlement ₱{NUM(summary.balanceAfter)}</Typography>
            </Paper>
          </Grid>

          <Grid size={12}>
            <TextField size="small" fullWidth multiline minRows={2} label="Payment note (printed under the summary)" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)}
              placeholder={'Payment due on or before …\nPlease reference SI No. … and PO No. … in all remittances.'} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField size="small" fullWidth multiline minRows={4} label="Remittance instructions" value={remittance} onChange={(e) => setRemittance(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField size="small" fullWidth multiline minRows={4} label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Grid>
          <Grid size={12}>
            <Alert severity="info" sx={{ py: 0 }}>Everything here prints on the customer's copy — keep internal notes out.</Alert>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
