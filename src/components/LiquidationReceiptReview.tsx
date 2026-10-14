import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { WORKFLOW_LABELS } from '../types/LiquidationWorkflow';
import { API_BASE } from '../config/api';

interface ReceiptReview {
  physicalSubmission?: { active: boolean; version: number; submittedDate: string; submittedByName: string; note: string; returnReason?: string; returnedBy?: string; returnedByName?: string; returnedAt?: string };
  active: boolean; revision: number; reviewedBy: string; reviewedByName: string; reviewDate: string;
  recordedAt: string; note: string; withdrawalReason?: string;
}
interface ReviewState {
  review: ReceiptReview | null; status: 'not_reviewed' | 'reviewed' | 'review_required' | 'withdrawn';
  contentHash: string; revision: number; canRecord: boolean; canSubmitPhysical: boolean; isRj: boolean; workflowStatus: string;
}
interface ReviewEvent { id: string; at: string; actorName: string; action: string; after: ReceiptReview; before: ReceiptReview | null }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
async function request<T>(id: string, suffix = '', body?: unknown): Promise<T> {
  const token = localStorage.getItem('netpacific_token');
  const res = await fetch(`${API_BASE}/api/liquidations/${encodeURIComponent(id)}/receipt-review${suffix}`, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not load receipt review'); return data;
}
export default function LiquidationReceiptReview({ liquidationId, contentHash, readOnly, onReload }: {
  liquidationId: string; contentHash: string; readOnly: boolean; onReload: () => Promise<unknown>;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<ReviewState | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [physicalAction, setPhysicalAction] = useState<'submit' | 'return' | null>(null);
  const [submittedDate, setSubmittedDate] = useState(today);
  const [physicalConfirmed, setPhysicalConfirmed] = useState(false);
  const [open, setOpen] = useState(false); const [withdraw, setWithdraw] = useState(false);
  const [reviewDate, setReviewDate] = useState(today); const [note, setNote] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState<ReviewEvent[] | null>(null);
  const admin = user?.role === 'admin' || user?.role === 'superadmin';
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setData(await request<ReviewState>(liquidationId)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load review'); }
    finally { setBusy(false); }
  }, [liquidationId]);
  useEffect(() => { void load(); }, [load]);
  const changed = !!data && (!contentHash || data.contentHash !== contentHash);
  const canRecord = admin && data?.isRj && data?.canRecord && !readOnly && !changed;
  const save = async () => {
    if (!data || !canRecord) return;
    setBusy(true); setError('');
    try {
      await request(liquidationId, '', { physicalReceiptConfirmed: physicalConfirmed, action: withdraw ? 'withdraw' : 'review', contentHash, revision: data.revision, reviewDate, note, confirmed });
      setOpen(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save review'); } finally { setBusy(false); }
  };
  const begin = (removing: boolean) => { setWithdraw(removing); setNote(''); setConfirmed(false); setPhysicalConfirmed(false); setReviewDate(today()); setOpen(true); };
  const savePhysical = async () => {
    if (!data || !physicalAction || changed || readOnly) return;
    setBusy(true); setError('');
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/liquidations/${encodeURIComponent(liquidationId)}/physical-receipts`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action: physicalAction, contentHash, revision: data.revision, submittedDate, note, confirmed }) });
      const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Could not save physical submission');
      setPhysicalAction(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save physical submission'); } finally { setBusy(false); }
  };
  const labels = { not_reviewed: 'Not reviewed', reviewed: 'Receipts reviewed', review_required: 'Review required — form changed', withdrawn: 'Review withdrawn' };
  return <Paper variant="outlined" sx={{ p: 2, mb: 2 }}><Stack spacing={1}>
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography variant="subtitle1" fontWeight={600}>Physical receipts &amp; RJ review</Typography>
      {data?.workflowStatus && <Chip size="small" label={WORKFLOW_LABELS[data.workflowStatus] || data.workflowStatus} color={data.workflowStatus === 'closed' ? 'success' : 'warning'} />}
      {data && <Chip size="small" label={changed && data.status === 'reviewed' ? 'Reload form to check review status' : labels[data.status]} color={data.status === 'reviewed' && !changed ? 'success' : 'warning'} />}
    </Box>
    <Typography variant="body2" color="text.secondary">Records the receipt-by-receipt check against this saved liquidation, including original paper receipts.</Typography>
    {data?.review?.physicalSubmission && <Box>
      {!data.review.physicalSubmission.active && <Alert severity="warning" sx={{ mb: 1 }}>
        <Typography variant="body2" fontWeight={600}>Physical copies returned</Typography>
        <Typography variant="body2">Return reason: {data.review.physicalSubmission.returnReason || 'No reason recorded'}</Typography>
        <Typography variant="body2">Returned by: {data.review.physicalSubmission.returnedByName || data.review.physicalSubmission.returnedBy || 'Unknown'} · Returned at: {data.review.physicalSubmission.returnedAt ? new Date(data.review.physicalSubmission.returnedAt).toLocaleString() : 'Unknown'}</Typography>
      </Alert>}
      <Typography variant="body2">{data.review.physicalSubmission.active ? 'Physical copies submitted to RJ' : 'Original handover to RJ'} · {data.review.physicalSubmission.submittedDate} · Recorded by {data.review.physicalSubmission.submittedByName}</Typography>
      {data.review.physicalSubmission.note && <Typography variant="body2">Handover note: {data.review.physicalSubmission.note}</Typography>}
    </Box>}
    {data?.review?.reviewedBy && <Box>
      <Typography variant="body2">{data.status === 'reviewed' ? 'Reviewed by' : 'Previous review by'}: <strong>{data.review.reviewedByName}</strong> · Review date: <strong>{data.review.reviewDate}</strong></Typography>
      <Typography variant="caption" color="text.secondary">Recorded in app: {new Date(data.review.recordedAt).toLocaleString()}</Typography>
      {data.review.note && <Typography variant="body2">Notes: {data.review.note}</Typography>}
      {data.review.withdrawalReason && <Typography variant="body2">Withdrawal reason: {data.review.withdrawalReason}</Typography>}
    </Box>}
    {data?.status === 'review_required' && <Alert severity="warning">The saved form or receipt links changed after the previous review. Check them again before recording a new review.</Alert>}
    {changed && <Alert severity="warning">This form view is outdated. Reload the liquidation and check the current rows before recording a review.</Alert>}
    {readOnly && admin && <Typography variant="body2">Finish or cancel the edit and resolve pending changes before recording a receipt review.</Typography>}
    {error && <Alert severity="error">{error}</Alert>}
    <Stack direction="row" spacing={1} flexWrap="wrap">
      {data?.canSubmitPhysical && <Button disabled={busy || changed || readOnly} variant="outlined" onClick={() => { setPhysicalAction('submit'); setNote(''); setConfirmed(false); setSubmittedDate(today()); }}>{data.review?.physicalSubmission?.active ? 'Record corrected physical submission' : 'Mark physical copies submitted to RJ'}</Button>}
      {data?.isRj && data.review?.physicalSubmission?.active && <Button disabled={busy || changed || readOnly} onClick={() => { setPhysicalAction('return'); setNote(''); }}>Return physical copies</Button>}
      {data?.isRj && <Button disabled={busy || !canRecord} variant="outlined" onClick={() => begin(false)}>{data?.status === 'reviewed' ? 'Record another receipt review' : 'Record receipt review'}</Button>}
      {data?.isRj && data?.review?.active && <Button disabled={busy || !canRecord} onClick={() => begin(true)}>Withdraw review</Button>}
      <Button disabled={busy} onClick={() => { setOpen(false); void load(); }}>Refresh review status</Button>
      {changed && <Button disabled={busy} onClick={() => { void onReload(); }}>Reload liquidation</Button>}
      {data?.review && <Button disabled={busy} onClick={async () => { setBusy(true); try { setHistory(await request<ReviewEvent[]>(liquidationId, '/history')); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load history'); } finally { setBusy(false); } }}>Review history</Button>}
    </Stack>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} fullWidth maxWidth="sm">
      <DialogTitle>{withdraw ? 'Withdraw receipt review' : 'Record receipt review'}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <TextField label="Reviewed by" value={user?.full_name || user?.username || ''} InputProps={{ readOnly: true }} helperText="Your signed-in account is recorded automatically." />
        {!withdraw && <TextField type="date" label="Review date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ max: today() }} helperText="Use the date you actually checked the receipts, including an earlier paper review." />}
        <TextField label={withdraw ? 'Withdrawal reason' : 'Review notes (optional)'} value={note} onChange={e => setNote(e.target.value)} multiline minRows={2} inputProps={{ maxLength: 2000 }} />
        {!withdraw && <FormControlLabel control={<Checkbox checked={physicalConfirmed} onChange={e => setPhysicalConfirmed(e.target.checked)} />} label="I am RJ and confirm I have received the printed form and physical receipt copies for this submission." />}
        {!withdraw && <FormControlLabel control={<Checkbox checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />} label="I checked every expense against its original or scanned receipt, confirmed all receipts are present, and verified the dates, amounts and particulars match." />}
        <Typography variant="body2" color="text.secondary">This records the manual receipt check and leaves payment and reimbursement status unchanged.</Typography>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button variant="contained" disabled={busy || !canRecord || (withdraw ? !note.trim() : !confirmed || !physicalConfirmed || !reviewDate)} onClick={save}>{withdraw ? 'Withdraw review' : 'Save receipt review'}</Button></DialogActions>
    </Dialog>
    <Dialog open={physicalAction !== null} onClose={() => { if (!busy) setPhysicalAction(null); }} fullWidth maxWidth="sm"><DialogTitle>{physicalAction === 'return' ? 'Return physical copies' : 'Physical copies submitted to RJ'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {physicalAction === 'submit' && <><TextField label="Submission date" type="date" value={submittedDate} onChange={e => setSubmittedDate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ max: today() }} /><FormControlLabel control={<Checkbox checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />} label="I handed the printed liquidation and physical receipt copies to RJ." /></>}
      <TextField label={physicalAction === 'return' ? 'Return reason' : 'Submission notes (optional)'} multiline value={note} onChange={e => setNote(e.target.value)} inputProps={{ maxLength: 2000 }} />{error && <Alert severity="error">{error}</Alert>}
    </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setPhysicalAction(null)}>Cancel</Button><Button variant="contained" disabled={busy || (physicalAction === 'submit' ? !confirmed || !submittedDate : !note.trim())} onClick={savePhysical}>Save physical receipt status</Button></DialogActions></Dialog>
    <Dialog open={history !== null} onClose={() => setHistory(null)} fullWidth maxWidth="sm"><DialogTitle>Receipt review history (latest 50)</DialogTitle><DialogContent><Stack spacing={2}>
      {history?.map(event => <Paper key={event.id} variant="outlined" sx={{ p: 1.5 }}><Typography variant="subtitle2">{event.action === 'review' ? 'RJ reviewed receipts' : event.action === 'physical_submit' ? 'Physical copies submitted' : event.action === 'physical_return' ? 'Physical copies returned' : 'Review withdrawn'} · {event.actorName}</Typography><Typography variant="body2">Date: {event.after.reviewDate || event.after.physicalSubmission?.submittedDate || '—'} · Recorded: {new Date(event.at).toLocaleString()}</Typography><Typography variant="body2">{event.action === 'withdraw' ? event.after.withdrawalReason : event.action.startsWith('physical_') ? event.after.physicalSubmission?.returnReason || event.after.physicalSubmission?.note : event.after.note}</Typography>{event.before?.reviewedBy && <Typography variant="caption">Previous review: {event.before.reviewedByName} · {event.before.reviewDate}</Typography>}</Paper>)}
    </Stack></DialogContent><DialogActions><Button onClick={() => setHistory(null)}>Close history</Button></DialogActions></Dialog>
  </Stack></Paper>;
}
