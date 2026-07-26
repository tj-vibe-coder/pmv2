import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';

interface ComponentTimingActionProps {
  componentDescription: string;
  expectedPurchaseDate?: string;
  invalid?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function ComponentTimingAction({
  componentDescription,
  expectedPurchaseDate,
  invalid = false,
  disabled = false,
  onClick,
}: ComponentTimingActionProps) {
  const componentLabel = componentDescription.trim() || 'component';
  const actionLabel = expectedPurchaseDate
    ? `Edit expected purchase date for ${componentLabel}`
    : `Set expected purchase date for ${componentLabel}`;
  const tooltip = invalid
    ? 'Expected purchase date cannot be before the quotation date'
    : expectedPurchaseDate
      ? `Expected purchase: ${expectedPurchaseDate}`
      : 'Set product expected purchase date';

  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton
          size="small"
          aria-label={actionLabel}
          disabled={disabled}
          onClick={onClick}
        >
          <EventIcon
            fontSize="small"
            color={invalid ? 'error' : expectedPurchaseDate ? 'primary' : 'inherit'}
          />
        </IconButton>
      </span>
    </Tooltip>
  );
}

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
