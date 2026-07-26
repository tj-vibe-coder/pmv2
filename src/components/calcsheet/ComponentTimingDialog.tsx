import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';

interface Props {
  open: boolean;
  value?: string;
  quotationExpectedPurchaseDate?: string;
  minimumDate: string;
  onClose: () => void;
  onSave: (value: string) => void;
}

export default function ComponentTimingDialog({
  open,
  value = '',
  quotationExpectedPurchaseDate = '',
  minimumDate,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const invalid = Boolean(draft && draft < minimumDate);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Product purchase timing</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Product expected purchase date"
            type="date"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: minimumDate }}
            error={invalid}
            helperText={invalid
              ? 'Expected purchase date cannot be before the quotation date.'
              : 'Clear to use the quotation-level date.'}
          />
          {!draft && (
            <Alert severity="info">
              {quotationExpectedPurchaseDate
                ? `Uses quotation date: ${quotationExpectedPurchaseDate}`
                : 'Uses the assumed date three months after the quotation date.'}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => setDraft('')}>Clear override</Button>
        <Button variant="contained" disabled={invalid} onClick={() => onSave(draft)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
