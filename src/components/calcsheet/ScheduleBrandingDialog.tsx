import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch,
  TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  emptyBranding, resizeLogo, saveScheduleBranding, type ScheduleBranding,
} from '../../utils/calcsheet/scheduleBranding';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  branding: ScheduleBranding | null;
  onSaved: (b: ScheduleBranding) => void;
}

// Per-project "we are the subcontractor" setting: the client's / main
// contractor's logo then shows in the Gantt header and on the exported PDF.
export default function ScheduleBrandingDialog({ open, onClose, projectId, branding, onSaved }: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [b, setB] = useState<ScheduleBranding>(emptyBranding());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setB(branding ? { ...branding } : { ...emptyBranding(), subcontracted: true });
    setErr('');
  }, [open, branding]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setErr('');
    try {
      const { dataUrl, width, height } = await resizeLogo(file);
      setB((p) => ({ ...p, logoDataUrl: dataUrl, logoWidth: width, logoHeight: height }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read the image');
    }
  };

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const saved = await saveScheduleBranding(projectId, b);
      onSaved(saved);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const missingLogo = b.subcontracted && !b.logoDataUrl;

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth fullScreen={phone}>
      <DialogTitle>Client logo</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <FormControlLabel
            control={<Switch checked={b.subcontracted} onChange={(e) => setB((p) => ({ ...p, subcontracted: e.target.checked }))} />}
            label={(
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>IOCT is the subcontractor on this project</Typography>
                <Typography variant="caption" color="text.secondary">
                  Shows the client's logo on this Gantt chart and on its PDF export. Turn off to keep the schedule unbranded.
                </Typography>
              </Box>
            )}
          />
          <TextField
            size="small" fullWidth label="Client / main contractor" disabled={!b.subcontracted}
            value={b.clientName} onChange={(e) => setB((p) => ({ ...p, clientName: e.target.value }))}
          />
          <Box>
            <Typography variant="caption" color="text.secondary">Logo</Typography>
            <Box
              sx={{
                mt: 0.5, height: 120, border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#fff',
                opacity: b.subcontracted ? 1 : 0.5, p: 1.5,
              }}
            >
              {b.logoDataUrl ? (
                <Box component="img" src={b.logoDataUrl} alt={b.clientName || 'Client logo'} sx={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
              ) : (
                <Typography variant="body2" color="text.secondary">No logo yet</Typography>
              )}
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
              <Button size="small" variant="outlined" startIcon={<UploadIcon />} disabled={!b.subcontracted} onClick={() => fileRef.current?.click()}>
                {b.logoDataUrl ? 'Change logo' : 'Upload logo'}
              </Button>
              {b.logoDataUrl && (
                <Button
                  size="small" color="error" startIcon={<DeleteOutlineIcon />} disabled={!b.subcontracted}
                  onClick={() => setB((p) => ({ ...p, logoDataUrl: null, logoWidth: null, logoHeight: null }))}
                >
                  Remove
                </Button>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              PNG with a transparent background looks best. Empty margins are trimmed automatically.
            </Typography>
            <input
              ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
            />
          </Box>
          {missingLogo && <Alert severity="info" sx={{ py: 0 }}>Upload the client's logo to show it on the Gantt chart.</Alert>}
          {err && <Alert severity="error">{err}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy} sx={{ bgcolor: '#2c5aa0' }}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
