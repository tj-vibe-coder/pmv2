import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import type { ProjectInvoice } from '../../types/Invoice';
import { EVIDENCE_TYPES, CertificateEvidence, DocumentFile, EvidenceLink, EvidenceType, InvoiceDocuments } from '../../types/FinanceEvidence';
import { evidenceRequest } from '../../services/financeEvidenceService';
import { uploadFileToFolder } from '../../services/onedriveFolderService';
import { onedriveConfig } from '../../config/onedriveConfig';

interface EvidenceHistoryEvent { id: string; actor: string; at: string; reason: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
const money = (n: number) => (n / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 });
const blankCertificate = (inv: ProjectInvoice): CertificateEvidence => ({ certificateNumber: '', periodStart: '', periodEnd: '', printedIncomeCentavos: 0,
  printedWhtCentavos: 0, printedAtc: '', printedDescription: '', observedCalculation: '', reviewState: 'unreviewed', reviewNote: '', reviewFlags: [],
  allocations: [{ invoiceId: inv.id, whtCentavos: Math.round((Number(inv.wht_amount) || 0) * 100) }] });
const cents = (s: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(s.trim())) throw new Error('Amounts require non-negative pesos with at most two decimal places');
  return Math.round(Number(s) * 100);
};

function CertificateEditor({ link, invoice, onSaved, onCancel }: { link: EvidenceLink; invoice: ProjectInvoice; onSaved: () => void; onCancel: () => void }) {
  const initial = link.document.certificate || blankCertificate(invoice);
  const [form, setForm] = useState(initial);
  const [income, setIncome] = useState((initial.printedIncomeCentavos / 100).toFixed(2));
  const [wht, setWht] = useState((initial.printedWhtCentavos / 100).toFixed(2));
  const [allocations, setAllocations] = useState(initial.allocations.map(a => `${a.invoiceId}, ${(a.whtCentavos / 100).toFixed(2)}`).join('\n'));
  const [flags, setFlags] = useState(initial.reviewFlags.join('\n'));
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const parsed = allocations.split('\n').filter(s => s.trim()).map(line => {
        const parts = line.split(','); if (parts.length !== 2) throw new Error('Use one invoice ID, WHT amount per line');
        return { invoiceId: parts[0].trim(), whtCentavos: cents(parts[1]) };
      });
      await evidenceRequest(`/documents/${link.documentId}/certificate`, 'PUT', { ...form, revision: link.document.revision,
        printedIncomeCentavos: cents(income), printedWhtCentavos: cents(wht), reviewFlags: flags.split('\n').map(s => s.trim()).filter(Boolean), allocations: parsed });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  };
  return <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1.5}>
    <Typography variant="subtitle1">2307 printed evidence — {link.document.filename}</Typography>
    <Alert severity="info">Review applies to this shared certificate. Booked WHT on {invoice.invoice_no}: ₱{Number(invoice.wht_amount || 0).toFixed(2)}. Evidence changes leave cash, WHT and received history unchanged.</Alert>
    {error && <Alert severity="error">{error}</Alert>}
    {(['certificateNumber', 'periodStart', 'periodEnd', 'printedAtc', 'printedDescription', 'observedCalculation'] as const).map(key => <TextField key={key}
      label={{ certificateNumber: 'Certificate number', periodStart: 'Period start', periodEnd: 'Period end', printedAtc: 'Printed ATC', printedDescription: 'Printed description', observedCalculation: 'Observed calculation / basis (evidence only)' }[key]}
      type={key.startsWith('period') ? 'date' : 'text'} InputLabelProps={{ shrink: true }} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />)}
    <TextField label="Printed income base (PHP)" value={income} onChange={e => setIncome(e.target.value)} />
    <TextField label="Printed WHT (PHP)" value={wht} onChange={e => setWht(e.target.value)} />
    <TextField label="Evidence allocations: invoice ID, WHT (PHP)" multiline minRows={3} value={allocations} onChange={e => setAllocations(e.target.value)} helperText={`Current invoice ID: ${invoice.id}. Use zero to retain a removed allocation's history.`} />
    <TextField label="Review flags (one per line)" multiline minRows={2} value={flags} onChange={e => setFlags(e.target.value)} helperText="Record base/rate and goods/services discrepancies here; no tax treatment is inferred." />
    <TextField select label="Review state" value={form.reviewState} onChange={e => setForm({ ...form, reviewState: e.target.value as CertificateEvidence['reviewState'] })}>
      {['unreviewed', 'matched', 'discrepancy', 'resolved'].map(state => <MenuItem key={state} value={state}>{state}</MenuItem>)}
    </TextField>
    <TextField label="Review / resolution note" multiline value={form.reviewNote} onChange={e => setForm({ ...form, reviewNote: e.target.value })} />
    <Stack direction="row" spacing={1}><Button disabled={busy} variant="contained" onClick={save}>Save certificate evidence</Button><Button disabled={busy} onClick={onCancel}>Cancel</Button></Stack>
  </Stack></Paper>;
}

export default function InvoiceDocumentsPanel({ invoice, onClose, initialType = 'supporting_pack' }: { invoice: ProjectInvoice; onClose: () => void; initialType?: EvidenceType }) {
  const { user } = useAuth();
  const [data, setData] = useState<InvoiceDocuments>({ links: [], legacy: null });
  const [refreshNotice, setRefreshNotice] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [type, setType] = useState<EvidenceType>(user?.role === 'tax_filer' ? 'bir2307' : initialType);
  const [source, setSource] = useState(''); const [reference, setReference] = useState(''); const [documentDate, setDocumentDate] = useState('');
  const [webUrl, setWebUrl] = useState(''); const [filename, setFilename] = useState(''); const [documentId, setDocumentId] = useState('');
  const [invoiceIds, setInvoiceIds] = useState(invoice.id); const [editing, setEditing] = useState<EvidenceLink | null>(null);
  const [certificate, setCertificate] = useState<EvidenceLink | null>(null); const [history, setHistory] = useState<EvidenceHistoryEvent[] | null>(null);
  const [unlink, setUnlink] = useState<EvidenceLink | null>(null); const [reason, setReason] = useState('');
  const storageKey = `finance-evidence-upload:${invoice.id}`;
  const [pending, setPending] = useState<DocumentFile | null>(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { return null; } });
  const admin = ['superadmin', 'admin'].includes(user?.role || '');
  const canWrite = (t: EvidenceType) => admin || (user?.role === 'tax_filer' && t === 'bir2307');
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await evidenceRequest<InvoiceDocuments>(`/invoices/${encodeURIComponent(invoice.id)}/documents`)); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); return false; }
    finally { setLoading(false); }
  }, [invoice.id]);
  useEffect(() => { void reload(); }, [reload]);
  const refresh = async () => {
    setError('');
    if (await reload()) {
      // Never carry a stale revision forward or apply a draft to newer evidence.
      if (editing || certificate) {
        setEditing(null); setCertificate(null);
        setSource(''); setReference(''); setDocumentDate('');
        setRefreshNotice('Latest evidence loaded. Unsaved drafts discarded; reopen the editor to make changes.');
      }
      setUnlink(null); setHistory(null);
    }
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); } finally { setBusy(false); }
  };
  const link = () => run(async () => {
    await evidenceRequest('/links', 'POST', { invoiceIds: invoiceIds.split(',').map(s => s.trim()).filter(Boolean), type, source, reference, documentDate,
      ...(documentId ? { documentId: documentId.trim() } : { document: pending || { webUrl, filename } }) });
    sessionStorage.removeItem(storageKey); setPending(null); setWebUrl(''); setFilename(''); setDocumentId(''); await reload();
  });
  const upload = (file: File) => run(async () => {
    if (!source.trim()) throw new Error('Enter the evidence source before uploading');
    if (!/\.(pdf|png|jpe?g|tiff?|bmp)$/i.test(file.name) || file.size === 0 || file.size > 25 * 1024 * 1024) throw new Error('Choose a PDF/image up to 25 MB');
    const extension = file.name.slice(file.name.lastIndexOf('.'));
    const stem = file.name.slice(0, -extension.length).replace(new RegExp(`(?:\\${extension})+$`, 'i'), '');
    const unique = `${invoice.invoice_no.slice(0, 40)}_${Date.now()}_${Math.random().toString(36).slice(2)}_${stem.slice(0, 130)}${extension}`.replace(/[<>:"/\\|?*]/g, '_');
    const root = onedriveConfig.executionRoot || '01 Execution';
    const result = await uploadFileToFolder('server', 'server', root, unique, file, type, invoice.id);
    const saved: DocumentFile = { webUrl: result.webUrl, itemId: result.id, driveId: result.driveId, filename: result.name || unique, size: file.size,
      mimeType: file.type && ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/bmp'].includes(file.type) ? file.type : '' };
    // Persist upload recovery before linking; retry never uploads a second copy.
    setPending(saved); sessionStorage.setItem(storageKey, JSON.stringify(saved));
  });
  const edit = (row: EvidenceLink) => { setEditing(row); setSource(row.source); setReference(row.reference); setDocumentDate(row.documentDate); };
  const saveEdit = () => run(async () => {
    if (!editing) return;
    await evidenceRequest(`/links/${editing.id}`, 'PATCH', { revision: editing.revision, source, reference, documentDate });
    setEditing(null); await reload();
  });
  return <Dialog open fullWidth maxWidth="md" onClose={() => { if (!busy) onClose(); }}>
    <DialogTitle>Documents — {invoice.invoice_no}</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      <Alert severity="info">Supporting documents do not record a payment. Counter receipts acknowledge billing; deposit slips do not confirm clearance.</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {refreshNotice && <Alert severity="info" onClose={() => setRefreshNotice('')}>{refreshNotice}</Alert>}
      {loading && <Typography>Loading documents…</Typography>}
      {data.legacy && <Paper variant="outlined" sx={{ p: 1.5 }}><Typography>Legacy scan / supporting pack</Typography><Button href={data.legacy.webUrl} target="_blank" rel="noopener noreferrer">{data.legacy.filename}</Button><Typography variant="caption" display="block">Original scan retained; contents have not been classified.</Typography></Paper>}
      {!loading && (Number(invoice.wht_amount) > 0 || invoice.wht_2307_status) && !data.links.some(l => l.active && l.type === 'bir2307') && <Alert severity="warning">No standalone BIR 2307 linked. Historical flag: {invoice.wht_2307_status || 'expected'}{invoice.wht_2307_ref ? ` — ${invoice.wht_2307_ref}` : ''}. A legacy pack may contain the certificate.</Alert>}
      {data.links.map(row => <Paper key={row.id} variant="outlined" sx={{ p: 1.5, opacity: row.active ? 1 : 0.65 }}><Stack spacing={0.5}>
        <Box><Chip size="small" label={EVIDENCE_TYPES[row.type]} /> {!row.active && <Chip size="small" label="Unlinked" />}</Box>
        <Button href={row.document.webUrl} target="_blank" rel="noopener noreferrer" sx={{ justifyContent: 'flex-start' }}>{row.document.filename}</Button>
        <Typography variant="body2">{row.reference || 'No reference'} · {row.documentDate || 'Date unknown'} · {row.source}</Typography>
        <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>Document ID: {row.documentId} · {row.document.provenance}</Typography>
        {row.type === 'bir2307' && row.document.certificate && <Box>
          <Typography variant="body2">{row.document.certificate.certificateNumber} · {row.document.certificate.periodStart} – {row.document.certificate.periodEnd} · {row.document.certificate.reviewState}</Typography>
          <Typography variant="body2">Printed base ₱{money(row.document.certificate.printedIncomeCentavos)} · Printed WHT ₱{money(row.document.certificate.printedWhtCentavos)} · Allocated ₱{money(row.document.certificate.allocations.reduce((s, a) => s + a.whtCentavos, 0))}</Typography>
          <Typography variant="body2">{row.document.certificate.printedAtc} · {row.document.certificate.printedDescription}</Typography>
          <Typography variant="body2">{row.document.certificate.observedCalculation}</Typography>
          {row.document.certificate.reviewFlags.map(flag => <Alert key={flag} severity="warning">{flag}</Alert>)}
          <Typography variant="body2">{row.document.certificate.reviewNote}</Typography>
        </Box>}
        <Stack direction="row" flexWrap="wrap" spacing={1}>
          <Button disabled={busy} onClick={() => run(async () => setHistory(await evidenceRequest<EvidenceHistoryEvent[]>(`/links/${row.id}/history`)))}>Link history</Button>
          <Button disabled={busy} onClick={() => run(async () => setHistory(await evidenceRequest<EvidenceHistoryEvent[]>(`/documents/${row.documentId}/history`)))}>Document history</Button>
          {canWrite(row.type) && row.active && <><Button disabled={busy} onClick={() => edit(row)}>Edit reference</Button><Button disabled={busy} onClick={() => { setUnlink(row); setReason(''); }}>Unlink</Button></>}
          {canWrite('bir2307') && row.type === 'bir2307' && row.active && <Button disabled={busy} onClick={() => setCertificate(row)}>Review 2307</Button>}
        </Stack>
      </Stack></Paper>)}
      {certificate && <CertificateEditor key={`${certificate.id}:${certificate.document.revision}`} link={certificate} invoice={invoice} onCancel={() => setCertificate(null)} onSaved={() => { setCertificate(null); void reload(); }} />}
      {(admin || user?.role === 'tax_filer') && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1.5}>
        <Typography variant="subtitle1">{editing ? 'Edit evidence reference' : 'Add a document or link an existing file'}</Typography>
        {!editing && <TextField select label="Evidence type" value={type} onChange={e => setType(e.target.value as EvidenceType)}>{Object.entries(EVIDENCE_TYPES).filter(([t]) => canWrite(t as EvidenceType)).map(([t, label]) => <MenuItem key={t} value={t}>{label}</MenuItem>)}</TextField>}
        <TextField label="Evidence source" value={source} onChange={e => setSource(e.target.value)} placeholder="Audit file, original document, or uploader context" />
        <TextField label="Reference number" value={reference} onChange={e => setReference(e.target.value)} />
        <TextField label="Document date (optional)" type="date" InputLabelProps={{ shrink: true }} value={documentDate} onChange={e => setDocumentDate(e.target.value)} />
        {editing ? <Stack direction="row"><Button disabled={busy} onClick={saveEdit}>Save reference</Button><Button disabled={busy} onClick={() => setEditing(null)}>Cancel edit</Button></Stack> : <>
          <TextField label="Invoice IDs (comma separated)" value={invoiceIds} onChange={e => setInvoiceIds(e.target.value)} helperText="Use the same document for several invoices without uploading it again." />
          {pending ? <Alert severity="info">Uploaded: <a href={pending.webUrl} target="_blank" rel="noopener noreferrer">{pending.filename}</a>. Ready to link; upload metadata is retained in this browser tab for retry.</Alert> : <>
            <TextField label="Existing document ID (from another invoice's Documents)" value={documentId} onChange={e => setDocumentId(e.target.value)} />
            {!documentId && <><TextField label="Existing HTTPS file URL" value={webUrl} onChange={e => setWebUrl(e.target.value)} /><TextField label="Filename" value={filename} onChange={e => setFilename(e.target.value)} />
              <Button component="label" disabled={busy || !canWrite(type)}>Upload PDF / image<input aria-label="Upload invoice evidence" type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.bmp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} /></Button></>}
          </>}
          <Button variant="contained" disabled={busy || !source.trim() || !canWrite(type) || (!pending && !documentId && (!webUrl || !filename))} onClick={link}>{busy ? 'Working…' : 'Link document'}</Button>
        </>}
      </Stack></Paper>}
    </Stack></DialogContent>
    <DialogActions><Button disabled={busy || loading} onClick={() => { void refresh(); }}>{editing || certificate ? 'Refresh and discard drafts' : 'Refresh'}</Button><Button disabled={busy} onClick={onClose}>Close</Button></DialogActions>
    <Dialog open={!!unlink} onClose={() => { if (!busy) setUnlink(null); }}><DialogTitle>Unlink evidence</DialogTitle><DialogContent><Typography>The original file and evidence history stay available.</Typography><TextField autoFocus fullWidth label="Reason" value={reason} onChange={e => setReason(e.target.value)} sx={{ mt: 2 }} /></DialogContent><DialogActions><Button disabled={busy} onClick={() => setUnlink(null)}>Cancel</Button><Button disabled={busy || !reason.trim()} onClick={() => run(async () => { if (!unlink) return; await evidenceRequest(`/links/${unlink.id}`, 'PATCH', { revision: unlink.revision, active: false, reason }); setUnlink(null); await reload(); })}>Unlink</Button></DialogActions></Dialog>
    <Dialog open={history !== null} onClose={() => setHistory(null)} fullWidth maxWidth="md"><DialogTitle>Evidence history (latest 50 changes)</DialogTitle><DialogContent><Stack spacing={2}>{history?.length === 0 && <Typography>No recorded changes.</Typography>}{history?.map(event => {
      const before = event.before; const after = event.after;
      const certificate = after?.certificate as CertificateEvidence | undefined;
      const previousCertificate = before?.certificate as CertificateEvidence | undefined;
      return <Paper variant="outlined" sx={{ p: 1.5 }} key={event.id}>
        <Typography variant="subtitle2">{new Date(event.at).toLocaleString()} · {event.actor}</Typography>
        <Typography variant="body2">{!before ? 'Evidence added' : after?.active === false ? 'Evidence unlinked' : 'Evidence corrected'}</Typography>
        {event.reason && <Typography variant="body2">Reason: {event.reason}</Typography>}
        {(['source', 'reference', 'documentDate'] as const).filter(key => before?.[key] !== after?.[key]).map(key => <Typography key={key} variant="body2">{{ source: 'Source', reference: 'Reference', documentDate: 'Document date' }[key]}: {String(before?.[key] || '—')} → {String(after?.[key] || '—')}</Typography>)}
        {certificate && <>
          <Typography variant="body2">Review: {previousCertificate?.reviewState || 'Not recorded'} → {certificate.reviewState}</Typography>
          <Typography variant="body2">Printed base: {previousCertificate ? `₱${money(previousCertificate.printedIncomeCentavos)}` : '—'} → ₱{money(certificate.printedIncomeCentavos)}; printed WHT: {previousCertificate ? `₱${money(previousCertificate.printedWhtCentavos)}` : '—'} → ₱{money(certificate.printedWhtCentavos)}</Typography>
          <Typography variant="body2">{certificate.certificateNumber} · {certificate.periodStart} – {certificate.periodEnd} · {certificate.printedAtc} · {certificate.printedDescription}</Typography>
          <Typography variant="body2">{certificate.observedCalculation}</Typography>
          <Typography variant="body2">Flags: {certificate.reviewFlags.join('; ') || 'None'} · {certificate.reviewNote}</Typography>
          {certificate.allocations.map(a => <Typography key={a.invoiceId} variant="body2">Invoice {a.invoiceId}: ₱{money(a.whtCentavos)} evidence WHT</Typography>)}
        </>}
      </Paper>;
    })}</Stack></DialogContent><DialogActions><Button onClick={() => setHistory(null)}>Close history</Button></DialogActions></Dialog>
  </Dialog>;
}
