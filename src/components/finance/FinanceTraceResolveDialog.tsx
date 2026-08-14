import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import {
  FinanceTraceApiError,
  resolveFinanceTrace,
} from '../../services/financeTraceService';
import type {
  FinanceExpenseCollection,
  FinanceTraceCandidate,
  FinanceTraceNode,
  FinanceTraceResolutionRequest,
  FinanceTraceResolutionResponse,
} from '../../types/FinanceTrace';

type ResolutionAction = FinanceTraceResolutionRequest['action'];

interface FinanceTraceResolveDialogProps {
  open: boolean;
  anchorNode: FinanceTraceNode;
  candidate: FinanceTraceCandidate;
  onClose: () => void;
  onResolved: (response: FinanceTraceResolutionResponse) => void;
}

const destructiveActions = new Set<ResolutionAction>([
  'keep_investment_delete_expense',
  'keep_expense_delete_investment',
]);

const FinanceTraceResolveDialog: React.FC<FinanceTraceResolveDialogProps> = ({
  open,
  anchorNode,
  candidate,
  onClose,
  onResolved,
}) => {
  const [action, setAction] = useState<ResolutionAction>('confirm_match');
  const [reason, setReason] = useState('');
  const [investmentCategory, setInvestmentCategory] = useState('');
  const [confirmedDelete, setConfirmedDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sourceFocusUrl, setSourceFocusUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    setAction('confirm_match');
    setReason('');
    setInvestmentCategory('');
    setConfirmedDelete(false);
    setError('');
    setSourceFocusUrl('');
  }, [open, anchorNode.key, candidate.node.key]);

  const pair = useMemo(() => {
    const nodes = [anchorNode, candidate.node];
    const investment = nodes.find((node) => node.type === 'investment');
    const expense = nodes.find((node) => node.type === 'expense');
    if (!investment || !expense) return null;
    if (expense.collection !== 'project_expenses' && expense.collection !== 'overhead_expenses') {
      return null;
    }
    return {
      investmentId: investment.id,
      expenseId: expense.id,
      expenseCollection: expense.collection as FinanceExpenseCollection,
    };
  }, [anchorNode, candidate.node]);

  const destructive = destructiveActions.has(action);
  const canSubmit = Boolean(
    pair
    && reason.trim()
    && (!destructive || confirmedDelete)
    && !submitting,
  );

  const submit = async () => {
    if (!pair || !canSubmit) return;
    setSubmitting(true);
    setError('');
    setSourceFocusUrl('');
    const request: FinanceTraceResolutionRequest = {
      action,
      ...pair,
      reason: reason.trim(),
      ...(action === 'keep_investment_delete_expense' && investmentCategory.trim()
        ? { investmentCategory: investmentCategory.trim() }
        : {}),
    } as FinanceTraceResolutionRequest;
    try {
      const response = await resolveFinanceTrace(request);
      onResolved(response);
    } catch (caught) {
      const apiError = caught as FinanceTraceApiError;
      setError(apiError.message || 'Failed to apply resolution.');
      if (apiError instanceof FinanceTraceApiError && apiError.sourceFocusUrl) {
        setSourceFocusUrl(apiError.sourceFocusUrl);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Review possible match</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Box>
            <Typography fontWeight={700}>{anchorNode.label}</Typography>
            <Typography variant="body2" color="text.secondary">
              compared with {candidate.node.label}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" action={sourceFocusUrl ? (
              <Button component={RouterLink} to={sourceFocusUrl} color="inherit" size="small">
                Open source
              </Button>
            ) : undefined}>
              {error}
            </Alert>
          )}

          {!sourceFocusUrl && (
            <>
              <FormControl>
                <FormLabel id="finance-resolution-label">Resolution</FormLabel>
                <RadioGroup
                  aria-labelledby="finance-resolution-label"
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value as ResolutionAction);
                    setConfirmedDelete(false);
                  }}
                >
                  <FormControlLabel value="confirm_match" control={<Radio />} label="Confirm match and link records" />
                  <FormControlLabel value="keep_both_separate" control={<Radio />} label="Keep both records, but separate them" />
                  <FormControlLabel value="keep_investment_delete_expense" control={<Radio />} label="Keep investment and delete expense" />
                  <FormControlLabel value="keep_expense_delete_investment" control={<Radio />} label="Keep expense and delete investment" />
                </RadioGroup>
              </FormControl>

              {action === 'keep_investment_delete_expense' && (
                <TextField
                  label="Investment category (optional)"
                  value={investmentCategory}
                  onChange={(event) => setInvestmentCategory(event.target.value)}
                  fullWidth
                />
              )}

              <TextField
                label="Review reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minRows={2}
                multiline
                required
                fullWidth
              />

              {destructive && (
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={confirmedDelete}
                      onChange={(event) => setConfirmedDelete(event.target.checked)}
                    />
                  )}
                  label="I understand this deletes one finance record and cannot be undone from this screen."
                />
              )}
            </>
          )}

          {!pair && (
            <Alert severity="warning">This type of possible match must be corrected at its source.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        {!sourceFocusUrl && (
          <Button variant="contained" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Applying…' : 'Apply resolution'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default FinanceTraceResolveDialog;
