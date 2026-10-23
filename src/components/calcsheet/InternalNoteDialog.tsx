import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';

// Internal notes: free text on a quotation line for the team only (price source, "budgetary", pricelist name…).
// It is never printed on the PDF or Excel — see ComponentLine.internalNote / ServiceLine.internalNote.

/** Small icon in a line's description cell. Dim when empty, filled when the line has a note; hover shows the text. */
export function InternalNoteButton({ note, lineLabel, disabled = false, onClick }: {
  note?: string;
  lineLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const has = !!note?.trim();
  // A locked (awarded) quotation can't be edited, but an existing note can still be read.
  if (disabled && !has) return null;
  const label = lineLabel.trim() || 'this line';
  return (
    <Tooltip title={has ? `Internal note (not printed): ${note}` : 'Add an internal note — never printed'}>
      <IconButton
        size="small" onClick={onClick} sx={{ p: 0.25, alignSelf: 'flex-start', mt: 0.5 }}
        aria-label={`${disabled ? 'View' : has ? 'Edit' : 'Add'} internal note for ${label}`}
      >
        {has
          ? <StickyNote2Icon sx={{ fontSize: 16 }} color="primary" />
          : <StickyNote2OutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
      </IconButton>
    </Tooltip>
  );
}

export default function InternalNoteDialog({ open, lineLabel, note, readOnly = false, onSave, onClose }: {
  open: boolean;
  lineLabel: string;
  note?: string;
  readOnly?: boolean;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  // Start from the saved note each time the dialog opens.
  useEffect(() => { if (open) setDraft(note ?? ''); }, [open, note]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        Internal note
        {lineLabel && <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>{lineLabel}</Typography>}
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          For the team only — <strong>never printed</strong> on the PDF or Excel. Use it for the price source, “budgetary”,
          the pricelist name or who quoted it, instead of the description.
        </Alert>
        <TextField
          autoFocus={!readOnly} fullWidth multiline minRows={3} value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Budgetary — for supplier quote. Not in pricelist."
          disabled={readOnly} inputProps={{ 'aria-label': 'Internal note' }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {!readOnly && !!note?.trim() && <Button color="inherit" onClick={() => onSave('')} sx={{ mr: 'auto' }}>Clear note</Button>}
        <Button onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
        {!readOnly && <Button variant="contained" onClick={() => onSave(draft)}>Save</Button>}
      </DialogActions>
    </Dialog>
  );
}
