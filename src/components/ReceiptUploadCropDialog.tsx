import { useEffect, useRef, useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import ReceiptCropper from './ReceiptCropper';
import { suggestReceiptCrop } from '../services/receiptCropService';
import { convertHeicToJpeg } from '../utils/receipts/imageUtils';
import { FULL_PHOTO_QUAD } from '../utils/receipts/cropGeometry';
import { perspectiveCropToBlob, type Quad } from '../utils/receipts/perspectiveCrop';

/** A row attachment is uploaded only after the employee confirms its preview. */
export default function ReceiptUploadCropDialog({ file, onAttach, onSkip, onCancel }: {
  file: File; onAttach: (file: File) => Promise<void>; onSkip: () => void; onCancel: () => void;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [url, setUrl] = useState(''); const [quad, setQuad] = useState<Quad>(FULL_PHOTO_QUAD);
  const [finding, setFinding] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const savingRef = useRef(false);
  useEffect(() => {
    let cancelled = false; let objectUrl = '';
    setFinding(true); setError(''); setPhoto(null); setUrl(''); setQuad(FULL_PHOTO_QUAD);
    void (async () => {
      try {
        const converted = await convertHeicToJpeg(file);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(converted); setUrl(objectUrl); setPhoto(converted);
        const suggestion = await suggestReceiptCrop(converted);
        if (!cancelled) setQuad(suggestion);
      } catch {
        if (!cancelled) setError('Could not open this photo. Try another image or skip it.');
      } finally { if (!cancelled) setFinding(false); }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file]);
  const confirm = async (selection: Quad) => {
    if (!photo || finding || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const full = selection.every((p, i) => p.x === FULL_PHOTO_QUAD[i].x && p.y === FULL_PHOTO_QUAD[i].y);
      const selected = full ? photo : new File([await perspectiveCropToBlob(photo, selection)],
        `${photo.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
      await onAttach(selected);
    } catch { setError('Could not attach this photo. Try again, or choose Full photo.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <Dialog open fullWidth maxWidth="xs" onClose={() => { if (!saving) onCancel(); }}>
    <DialogTitle>Check receipt crop — {file.name}</DialogTitle>
    <DialogContent>
      {error && <Alert severity="warning">{error}</Alert>}
      {url ? <ReceiptCropper imageUrl={url} initialQuad={quad} busy={finding || saving}
        busyLabel={finding ? 'Finding receipt…' : 'Attaching…'} retakeLabel="Skip photo"
        onConfirm={selection => { void confirm(selection); }} onRetake={onSkip} /> : finding && <CircularProgress aria-label="Finding receipt" />}
    </DialogContent>
    <DialogActions>
      {!url && !finding && <Button disabled={saving} onClick={onSkip}>Skip photo</Button>}
      <Button disabled={saving} onClick={onCancel}>Cancel remaining</Button>
    </DialogActions>
  </Dialog>;
}
