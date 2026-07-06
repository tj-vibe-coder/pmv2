import { useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Radio, RadioGroup, Stack, TextField, Typography,
} from '@mui/material';
import { useQuotationStore } from '../../store/quotationStore';
import type { Project, Quotation } from '../../types/Quotation';

interface DuplicateQuotationDialogProps {
  open: boolean;
  quotation: Quotation | null;
  onClose: () => void;
  onDuplicated: (copy: Quotation) => void;
}

export default function DuplicateQuotationDialog({ open, quotation, onClose, onDuplicated }: DuplicateQuotationDialogProps) {
  const projects = useQuotationStore((s) => s.projects);
  const duplicateQuotation = useQuotationStore((s) => s.duplicateQuotation);
  const [scope, setScope] = useState<'same' | 'other'>('same');
  const [targetProject, setTargetProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== quotation?.projectId).sort((a, b) => a.code.localeCompare(b.code)),
    [projects, quotation?.projectId],
  );

  const reset = () => {
    setScope('same');
    setTargetProject(null);
    setErr('');
    setBusy(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleConfirm = async () => {
    if (!quotation) return;
    if (scope === 'other' && !targetProject) {
      setErr('Choose a project to duplicate into.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const copy = await duplicateQuotation(quotation.id, scope === 'other' ? { projectId: targetProject!.id } : undefined);
      if (!copy) throw new Error('Duplicate failed');
      reset();
      onDuplicated(copy);
    } catch {
      setErr('Failed to duplicate this quotation. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Duplicate Quotation</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Creates a full copy of this {quotation?.kind} quotation — all line items, terms, and
            pricing carried over — as the next available revision, ready to edit.
          </Typography>
          <RadioGroup value={scope} onChange={(e) => setScope(e.target.value as 'same' | 'other')}>
            <FormControlLabel value="same" control={<Radio size="small" />} label="Duplicate within this project (e.g. Option 2)" />
            <FormControlLabel value="other" control={<Radio size="small" />} label="Duplicate to another project" />
          </RadioGroup>
          {scope === 'other' && (
            <Autocomplete
              size="small"
              options={otherProjects}
              value={targetProject}
              onChange={(_e, v) => setTargetProject(v)}
              getOptionLabel={(p) => `${p.code} — ${p.name}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => <TextField {...params} label="Target project" placeholder="Search by code or name" />}
            />
          )}
          {err && <Alert severity="error">{err}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={busy}>
          {busy ? 'Duplicating…' : 'Duplicate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
