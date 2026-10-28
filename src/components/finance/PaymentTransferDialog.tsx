import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  IconButton, InputLabel, MenuItem, Select, TextField, Typography, useMediaQuery,
} from '@mui/material';
import { Add as AddIcon, AttachFile as AttachFileIcon, RemoveCircleOutline as RemoveIcon } from '@mui/icons-material';
import { API_BASE } from '../../config/api';
import { PROOF_ACCEPT, ProofRef, uploadPaymentProof } from '../../utils/receipts/paymentProof';
import {
  PaymentTransfer, PaymentTransferInput, TransferAllocationType, deletePaymentTransfer, savePaymentTransfer,
} from '../../services/paymentTransferService';

interface DocOption { type: TransferAllocationType; id: string; label: string; docNo: string | null; amount: number; payee: string }
interface AllocationDraft { uid: string; type: TransferAllocationType; id: string; amount: string; rowIds?: string[] | null }

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Edit this transfer; omit to create one. */
  transfer?: PaymentTransfer | null;
  /** Prefill for a new transfer (e.g. from a CA's release dialog). */
  initial?: Partial<PaymentTransferInput> | null;
}

const peso = (n: number) => '₱' + (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const newUid = () => Math.random().toString(36).slice(2);

const PaymentTransferDialog: React.FC<Props> = ({ open, onClose, onSaved, transfer, initial }) => {
  const isPhone = useMediaQuery('(max-width:599.95px)');
  const [options, setOptions] = useState<DocOption[]>([]);
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [remark, setRemark] = useState('');
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  const [proofRef, setProofRef] = useState<ProofRef | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const src = transfer || initial || {};
    setDate(src.date || new Date().toISOString().slice(0, 10));
    setReference(src.reference || '');
    setAmount(src.amount ? String(src.amount) : '');
    setPayeeName(src.payeeName || '');
    setRemark(src.remark || '');
    setAllocations((src.allocations || []).map(a => ({ uid: newUid(), type: a.type, id: a.id, amount: String(a.amount), rowIds: a.rowIds })));
    setProofRef(src.proofRef || null);
    setProofFile(null);
    setError('');
    const token = localStorage.getItem('netpacific_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    Promise.all([
      fetch(`${API_BASE}/api/cash-advances`, { headers }).then(r => r.json()).catch(() => ({})),
      fetch(`${API_BASE}/api/reimbursements?scope=all`, { headers }).then(r => r.json()).catch(() => ({})),
    ]).then(([caData, reimbData]) => {
      type CaRow = { id: string; ca_no?: string | null; amount: number; status: string; full_name?: string | null; username?: string };
      type ReimbRow = { id: string; formNo?: string | null; amount: number; employeeName?: string | null; full_name?: string | null };
      const cas: DocOption[] = ((caData.cash_advances || []) as CaRow[])
        .filter(ca => ca.status === 'approved' || ca.status === 'closed')
        .map(ca => {
          const payee = ca.full_name || ca.username || '';
          return { type: 'cash_advance', id: ca.id, docNo: ca.ca_no || null, amount: Number(ca.amount) || 0, payee, label: `${ca.ca_no || ca.id} · ${payee} · ${peso(Number(ca.amount))}` };
        });
      const reimbs: DocOption[] = ((reimbData.reimbursements || []) as ReimbRow[]).map(r => {
        const payee = r.employeeName || r.full_name || '';
        return { type: 'reimbursement', id: r.id, docNo: r.formNo || null, amount: Number(r.amount) || 0, payee, label: `${r.formNo || r.id} · ${payee} · ${peso(Number(r.amount))}` };
      });
      setOptions([...cas, ...reimbs]);
    });
  }, [open, transfer, initial]);

  const allocated = useMemo(() => round2(allocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)), [allocations]);
  const total = round2(parseFloat(amount) || 0);
  const balanced = total > 0 && Math.abs(allocated - total) < 0.005;

  const updateAllocation = (uid: string, patch: Partial<AllocationDraft>) =>
    setAllocations(prev => prev.map(a => (a.uid === uid ? { ...a, ...patch } : a)));

  const pickDoc = (uid: string, opt: DocOption | null) => {
    updateAllocation(uid, { id: opt?.id || '', rowIds: null, ...(opt && !allocations.find(a => a.uid === uid)?.amount ? { amount: String(opt.amount) } : {}) });
    if (opt && !payeeName) setPayeeName(opt.payee);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      let proof = proofRef;
      if (proofFile) {
        const token = localStorage.getItem('netpacific_token');
        proof = await uploadPaymentProof(proofFile, reference || date, token, 'Payment Transfers');
      }
      const input: PaymentTransferInput = {
        ...(initial?.id && !transfer ? { id: initial.id } : {}),
        date, reference: reference.trim() || null, amount: total, payeeName: payeeName.trim() || null,
        remark: remark.trim() || null, proofRef: proof,
        allocations: allocations.map(a => ({ type: a.type, id: a.id, amount: round2(parseFloat(a.amount) || 0), rowIds: a.rowIds || null })),
      };
      await savePaymentTransfer(input, transfer?.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving the transfer failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!transfer || !window.confirm('Delete this transfer record? The payments themselves are not changed.')) return;
    setSaving(true);
    try {
      await deletePaymentTransfer(transfer.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const canSave = !saving && !!date && balanced && allocations.length > 0 && allocations.every(a => a.id && (parseFloat(a.amount) || 0) > 0);

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="md" fullWidth fullScreen={isPhone}>
      <DialogTitle sx={{ fontWeight: 600 }}>{transfer ? 'Edit transfer' : 'Record transfer'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          One bank or e-wallet transfer and what it paid. The breakdown must add up to the transfer total.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <TextField label="Date" type="date" size="small" value={date} onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} required sx={{ minWidth: { xs: '100%', sm: 160 } }} />
          <TextField label="Reference no." size="small" value={reference} onChange={e => setReference(e.target.value)} sx={{ minWidth: { xs: '100%', sm: 200 }, flex: 1 }} />
          <TextField label="Total amount" type="number" size="small" value={amount} onChange={e => setAmount(e.target.value)} required sx={{ minWidth: { xs: '100%', sm: 160 } }} />
          <TextField label="Paid to" size="small" value={payeeName} onChange={e => setPayeeName(e.target.value)} sx={{ minWidth: { xs: '100%', sm: 200 }, flex: 1 }} />
        </Box>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Breakdown</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {allocations.map(a => {
            const typeOptions = options.filter(o => o.type === a.type);
            const value = typeOptions.find(o => o.id === a.id) || null;
            return (
              <Box key={a.uid} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 160 } }}>
                  <InputLabel>Type</InputLabel>
                  <Select label="Type" value={a.type} onChange={e => updateAllocation(a.uid, { type: e.target.value as TransferAllocationType, id: '', rowIds: null })}>
                    <MenuItem value="cash_advance">Cash advance</MenuItem>
                    <MenuItem value="reimbursement">Reimbursement</MenuItem>
                  </Select>
                </FormControl>
                <Autocomplete
                  size="small"
                  options={typeOptions}
                  value={value}
                  onChange={(_, opt) => pickDoc(a.uid, opt)}
                  getOptionLabel={o => o.label}
                  isOptionEqualToValue={(o, v) => o.id === v.id}
                  renderInput={params => <TextField {...params} label={a.type === 'cash_advance' ? 'CA no.' : 'Liquidation form'} placeholder={a.id && !value ? a.id : undefined} />}
                  sx={{ flex: 1, minWidth: { xs: '100%', sm: 260 } }}
                />
                <TextField label="Amount" type="number" size="small" value={a.amount} onChange={e => updateAllocation(a.uid, { amount: e.target.value })} sx={{ width: { xs: 'calc(100% - 48px)', sm: 140 } }} />
                <IconButton color="error" onClick={() => setAllocations(prev => prev.filter(x => x.uid !== a.uid))} title="Remove">
                  <RemoveIcon fontSize="small" />
                </IconButton>
              </Box>
            );
          })}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 1 }}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setAllocations(prev => [...prev, { uid: newUid(), type: 'reimbursement', id: '', amount: '' }])}>
            Add item
          </Button>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', color: balanced ? 'success.main' : 'error.main' }}>
            {peso(allocated)} of {peso(total)}{!balanced && total > 0 ? ` · ${peso(round2(total - allocated))} unassigned` : ''}
          </Typography>
        </Box>

        <TextField label="Remark" size="small" multiline minRows={2} fullWidth value={remark} onChange={e => setRemark(e.target.value)} sx={{ mt: 2 }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 2 }}>
          <Button component="label" size="small" variant="outlined" startIcon={<AttachFileIcon />} disabled={saving}>
            {proofFile || proofRef ? 'Replace proof' : 'Attach proof'}
            <input type="file" hidden accept={PROOF_ACCEPT} onChange={e => { setProofFile(e.target.files?.[0] || null); e.target.value = ''; }} />
          </Button>
          {proofFile ? (
            <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{proofFile.name}</Typography>
          ) : proofRef ? (
            <>
              <a href={proofRef.webUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem' }}>{proofRef.filename}</a>
              <Button size="small" color="error" onClick={() => setProofRef(null)} disabled={saving}>Remove</Button>
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">Screenshot or PDF of the transfer</Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {transfer && <Button color="error" onClick={handleDelete} disabled={saving} sx={{ mr: 'auto' }}>Delete</Button>}
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PaymentTransferDialog;
