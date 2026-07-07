import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Chip,
  CircularProgress, Divider, Stack,
} from '@mui/material';
import type { PricelistItem, PricelistAuditEntry } from '../../types/Pricelist';
import { usePricelistStore } from '../../store/pricelistStore';
import { fmtDateTime } from './pricelistDate';

const actionColor: Record<string, 'success' | 'info' | 'error'> = {
  create: 'success', update: 'info', delete: 'error',
};

const val = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

export default function PricelistHistoryDialog({ item, onClose }: { item: PricelistItem | null; onClose: () => void }) {
  const fetchHistory = usePricelistStore((s) => s.fetchHistory);
  const [entries, setEntries] = useState<PricelistAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    fetchHistory(item.id).then((e) => setEntries(e)).finally(() => setLoading(false));
  }, [item, fetchHistory]);

  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        History — {item?.description}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{item?.catalogNo}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        ) : entries.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>No recorded changes yet.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {entries.map((e) => (
              <Box key={e.id}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Chip size="small" label={e.action} color={actionColor[e.action] || 'default'} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{e.byName || 'Unknown'}</Typography>
                  <Typography variant="caption" color="text.secondary">{fmtDateTime(e.at)}</Typography>
                </Stack>
                {e.action === 'update' && e.changes && (
                  <Box sx={{ pl: 1 }}>
                    {Object.entries(e.changes).map(([field, ch]) => (
                      <Typography key={field} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                        {field}: <span style={{ color: '#c62828' }}>{val(ch.from)}</span> → <span style={{ color: '#2e7d32' }}>{val(ch.to)}</span>
                      </Typography>
                    ))}
                  </Box>
                )}
                {e.action !== 'update' && e.snapshot && (
                  <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                    {val(e.snapshot.description)} · ₱{val(e.snapshot.sellingPrice)}
                  </Typography>
                )}
                <Divider sx={{ mt: 1 }} />
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
