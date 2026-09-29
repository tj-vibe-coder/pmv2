import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  LinearProgress, MenuItem, TextField,
} from '@mui/material';
import { format } from 'date-fns';
import { useQuotationStore } from '../../store/quotationStore';
import type { Project, ProjectStatus } from '../../types/Quotation';
import { PROJECT_STATUSES, projectStatusLabel } from '../../types/Quotation';
import { quotationCode, nextProjectSequence } from '../../utils/calcsheet/codes';
import { useOneDriveAuth } from '../../contexts/OneDriveAuthContext';
import { isCorporateOneDriveConfigured } from '../../config/onedriveConfig';

// The calcsheet "New project" (proposal) form, shared by the Calcsheet
// Projects page and the Whiteboard. Lifted out of CalcsheetProjects.tsx
// unchanged in behavior: same fields, same auto-generated code, same
// location auto-fill from the client, same best-effort OneDrive handling
// (the store's addProject creates the proposal folder when it can).

export type NewProjectNotice = { severity: 'success' | 'info' | 'warning' | 'error'; message: string };

const blankForm = () => ({
  name: '', location: '', date: format(new Date(), 'yyyy-MM-dd'),
  customerId: '', partnerId: '', salesContactId: '', status: 'draft' as ProjectStatus,
  code: '',
});

interface NewCalcsheetProjectDialogProps {
  open: boolean;
  onClose: () => void;
  // Called after a successful create, with the saved project and — when
  // OneDrive is configured but no proposal folder could be made — an info
  // notice the caller can show.
  onCreated: (project: Project, notice: NewProjectNotice | null) => void;
}

export default function NewCalcsheetProjectDialog({ open, onClose, onCreated }: NewCalcsheetProjectDialogProps) {
  const init = useQuotationStore((s) => s.init);
  const projects = useQuotationStore((s) => s.projects);
  const clients = useQuotationStore((s) => s.clients);
  const addProject = useQuotationStore((s) => s.addProject);
  const { isAuthenticated: oneDriveSignedIn, isLoading: oneDriveLoading, login: oneDriveLogin } = useOneDriveAuth();
  const oneDriveRequired = isCorporateOneDriveConfigured();

  const [form, setForm] = useState(blankForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // tracks whether the location/code fields were auto-filled — so customer
  // changes can replace them, but manual edits lock them in
  const [locationAutoFilled, setLocationAutoFilled] = useState(false);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);

  // Fresh form each time it opens. init() is idempotent — it matters when
  // opened from outside the calcsheet (e.g. the Whiteboard) before the
  // calcsheet store has loaded clients/projects.
  useEffect(() => {
    if (!open) return;
    void init();
    setForm(blankForm());
    setLocationAutoFilled(false);
    setCodeManuallyEdited(false);
    setCreating(false);
    setError(null);
  }, [open, init]);

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

  const close = () => {
    if (creating) return; // don't dismiss mid-create (avoids "did it work?" ambiguity)
    onClose();
  };

  const save = async () => {
    // Customer is optional at creation — a bare opportunity can be saved before
    // the client is known. Its code is assigned automatically once a customer
    // is set (here or later from the project page).
    if (!form.name || creating) return;
    setCreating(true);
    setError(null);
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
      setCreating(false);
      // If OneDrive is configured but the folder couldn't be created (not signed
      // in, or token unavailable), let the user know the project saved fine and
      // the folder can be linked later from the project page.
      const notice: NewProjectNotice | null = oneDriveRequired && saved && !saved.proposalFolderId
        ? {
          severity: 'info',
          message: oneDriveSignedIn
            ? 'Project created. OneDrive folder could not be created right now — open the project to create or link its proposal folder.'
            : 'Project created without a OneDrive folder. Sign in to OneDrive, then create or link the proposal folder from the project page.',
        }
        : null;
      onCreated(saved, notice);
      onClose();
    } catch (err) {
      setCreating(false);
      setError(err instanceof Error ? err.message : 'Failed to create project.');
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth disableEscapeKeyDown={creating}>
      {creating && <LinearProgress />}
      <DialogTitle>New project</DialogTitle>
      <DialogContent>
        {creating && (
          <Alert severity="info" sx={{ mb: 1 }}>
            Creating project… this can take a few seconds (especially when linking OneDrive).
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>{error}</Alert>}
        {oneDriveRequired && !oneDriveSignedIn && (
          <Alert
            severity="info"
            sx={{ mb: 1 }}
            action={
              <Button color="inherit" size="small" onClick={() => { void oneDriveLogin(); }} disabled={oneDriveLoading || creating}>
                Sign in
              </Button>
            }
          >
            You're not signed in to OneDrive. You can still create this project now and link its
            proposal folder later from the project page.
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          <TextField label="Project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ gridColumn: 'span 2' }} disabled={creating} />
          {/* Customer first so location can auto-fill from it */}
          <TextField
            select
            label="Customer (optional)"
            value={form.customerId}
            disabled={creating}
            helperText="Leave blank to save a draft — no code is assigned until a client is set"
            onChange={(e) => {
              const newCustomerId = e.target.value;
              const selectedClient = clients.find((c) => c.id === newCustomerId);
              const newLocation =
                (locationAutoFilled || form.location === '')
                  ? (selectedClient?.address ?? form.location)
                  : form.location;
              const didAutoFill = !!selectedClient?.address && newLocation === selectedClient?.address;
              setLocationAutoFilled(didAutoFill);
              const newCode = codeManuallyEdited ? form.code : (newCustomerId ? computeCode(newCustomerId, form.date) : '');
              setForm((prev) => ({ ...prev, customerId: newCustomerId, location: newLocation, code: newCode }));
            }}
          >
            <MenuItem value="">— none yet —</MenuItem>
            {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>)}
          </TextField>
          <TextField select label="Partner (optional)" value={form.partnerId} disabled={creating} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
            <MenuItem value="">— none —</MenuItem>
            {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>)}
          </TextField>
          <TextField
            label="Location"
            value={form.location}
            disabled={creating}
            onChange={(e) => { setLocationAutoFilled(false); setForm({ ...form, location: e.target.value }); }}
            sx={{ gridColumn: 'span 2' }}
            helperText={locationAutoFilled ? 'Auto-filled from client — edit freely' : undefined}
          />
          <TextField
            label="Date"
            type="date"
            value={form.date}
            disabled={creating}
            onChange={(e) => {
              const newDate = e.target.value;
              const newCode = codeManuallyEdited ? form.code : (form.customerId ? computeCode(form.customerId, newDate) : '');
              setForm({ ...form, date: newDate, code: newCode });
            }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField select label="Status" value={form.status} disabled={creating} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
            {PROJECT_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>{projectStatusLabel(s)}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Sales / account contact"
            value={form.salesContactId}
            disabled={creating}
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
            disabled={creating}
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
        <Button onClick={close} disabled={creating}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => { void save(); }}
          disabled={creating || !form.name || !form.customerId}
          startIcon={creating ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {creating ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
