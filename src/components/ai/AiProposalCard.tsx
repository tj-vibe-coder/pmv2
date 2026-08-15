import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import type { AiProposal } from '../../types/AiAssist';

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

interface AiProposalCardProps {
  proposal: AiProposal;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
}

export default function AiProposalCard({
  proposal,
  busy,
  onConfirm,
  onReject,
}: AiProposalCardProps): React.ReactElement {
  return (
    <Box
      aria-label="Pending Assist draft"
      sx={{
        bgcolor: 'rgba(44, 90, 160, 0.06)',
        border: '1px solid',
        borderColor: 'rgba(44, 90, 160, 0.24)',
        borderRadius: 1,
        mb: 2,
        p: 1.5,
      }}
    >
      <Typography sx={{ mb: 0.5 }} variant="subtitle2">
        Draft — not saved
      </Typography>
      <Typography color="text.secondary" variant="body2">
        {proposal.label || proposal.recordId || 'Opportunity'} · {proposal.field}
      </Typography>
      <Typography sx={{ mt: 0.75 }} variant="body2">
        {displayValue(proposal.currentValue)} → {displayValue(proposal.proposedValue)}
      </Typography>
      {proposal.reason ? (
        <Typography color="text.secondary" sx={{ mt: 0.5 }} variant="caption">
          {proposal.reason}
        </Typography>
      ) : null}
      <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
        <Button
          disabled={busy}
          onClick={onConfirm}
          size="small"
          variant="contained"
        >
          Apply
        </Button>
        <Button disabled={busy} onClick={onReject} size="small">
          Discard
        </Button>
      </Stack>
    </Box>
  );
}
