import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  FormControlLabel,
  Switch,
  Typography,
  Alert,
} from '@mui/material';
import type { SoaItem } from '../../../types/StatementOfAccount';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
};

interface RetroactivePoDialogProps {
  open: boolean;
  item: SoaItem | null;
  onClose: () => void;
  onSave: (itemId: string, updates: Partial<SoaItem>) => Promise<void>;
}

export default function RetroactivePoDialog({
  open,
  item,
  onClose,
  onSave,
}: RetroactivePoDialogProps) {
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState('');
  const [hasPo, setHasPo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setPoNumber(item.poNumber || '');
      setPoDate(item.poDate || '');
      setHasPo(item.hasPo);
      setError(null);
    }
  }, [item, open]);

  if (!item) return null;

  const handleSave = async () => {
    if (hasPo && !poNumber.trim()) {
      setError('Please provide a Purchase Order number or toggle off With PO.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(item.id, {
        poNumber: poNumber.trim(),
        poDate: poDate.trim(),
        hasPo,
        footnoteSymbol: hasPo ? undefined : item.footnoteSymbol,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update item PO information');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
        Update Purchase Order for {item.projectName}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Typography variant="body2" color="text.secondary">
            {item.description}
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={hasPo}
                onChange={(e) => setHasPo(e.target.checked)}
                color="primary"
              />
            }
            label={hasPo ? 'Purchase Order Issued (With PO)' : 'Pending Purchase Order (N/A)'}
          />

          {hasPo && (
            <>
              <TextField
                label="PO Number"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g. 2606-005"
                size="small"
                fullWidth
                required
              />
              <TextField
                label="PO Date"
                type="date"
                value={poDate}
                onChange={(e) => setPoDate(e.target.value)}
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          sx={{
            backgroundColor: NET_PACIFIC_COLORS.primary,
            '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary },
          }}
        >
          {saving ? 'Saving...' : 'Update Item'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
