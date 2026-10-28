import React from 'react';
import { Box, Link, Typography } from '@mui/material';
import type { PaymentTransfer } from '../../services/paymentTransferService';

const peso = (n: number) => '₱' + (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "Paid in transfer 3654… (2026-07-10): ₱3,000.00 CA02 + ₱600.00 LQ005 · Proof" — one line per
// transfer touching the row, so a shared proof of payment always shows its full split.
const TransferBreakdown: React.FC<{ transfers?: PaymentTransfer[]; onEdit?: (t: PaymentTransfer) => void }> = ({ transfers, onEdit }) => {
  if (!transfers || transfers.length === 0) return null;
  return (
    <Box sx={{ mt: 0.5 }}>
      {transfers.map(t => (
        <Typography key={t.id} variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: 'anywhere', textAlign: 'left' }}>
          Paid in transfer {t.reference || t.id} ({t.date}): {t.allocations.map(a => `${peso(a.amount)} ${a.docNo || a.id}`).join(' + ')}
          {t.proofRef && <> · <Link href={t.proofRef.webUrl} target="_blank" rel="noopener noreferrer">Proof</Link></>}
          {onEdit && <> · <Link component="button" variant="caption" onClick={() => onEdit(t)}>Edit</Link></>}
          {t.remark && <Box component="span" sx={{ display: 'block', fontStyle: 'italic' }}>{t.remark}</Box>}
        </Typography>
      ))}
    </Box>
  );
};

export default TransferBreakdown;
