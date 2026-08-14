import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { getFinanceTrace } from '../../services/financeTraceService';
import type {
  FinanceTraceCandidate,
  FinanceTraceNode,
  FinanceTraceOrigin,
  FinanceTraceResolutionResponse,
  FinanceTraceResponse,
} from '../../types/FinanceTrace';
import FinanceTraceResolveDialog from './FinanceTraceResolveDialog';

interface MoneyTrailDrawerProps {
  open: boolean;
  origin: FinanceTraceOrigin;
  onClose: () => void;
  onResolved?: (response: FinanceTraceResolutionResponse) => void;
}

const relationLabels: Record<string, string> = {
  funded_by: 'Funded by',
  recorded_as_expense: 'Recorded as expense',
  liquidated_by: 'Liquidated by',
  funded_by_cash_advance: 'Funded by cash advance',
  reimbursed_by: 'Reimbursed by',
};

const php = new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', minimumFractionDigits: 2,
});

const withSource = (focusUrl: string, source: string): string => {
  const [pathname, query = ''] = focusUrl.split('?');
  const params = new URLSearchParams(query);
  params.set('from', source);
  return `${pathname}?${params.toString()}`;
};

const MoneyTrailDrawer: React.FC<MoneyTrailDrawerProps> = ({
  open,
  origin,
  onClose,
  onResolved,
}) => {
  const location = useLocation();
  const [trace, setTrace] = useState<FinanceTraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<FinanceTraceCandidate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTrace(await getFinanceTrace(origin));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load money trail.');
    } finally {
      setLoading(false);
    }
  }, [origin]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const sourceUrl = `${location.pathname}${location.search}`;
  const anchorNode = useMemo(() => (
    trace?.nodes.find((node) => node.key === trace.originKey) || trace?.nodes[0] || null
  ), [trace]);

  const resolved = (response: FinanceTraceResolutionResponse) => {
    setTrace(response.trace);
    setSelectedCandidate(null);
    onResolved?.(response);
  };

  const recordLink = (node: FinanceTraceNode, label = 'Open exact record') => (
    <Button
      component={RouterLink}
      to={withSource(node.focusUrl, sourceUrl)}
      size="small"
      endIcon={<OpenInNewIcon fontSize="small" />}
    >
      {label}
    </Button>
  );

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: '100%', sm: 480 }, maxWidth: '100%' } }}
      >
        <Box sx={{ p: 2.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography component="h2" variant="h6" fontWeight={800}>Money trail</Typography>
            <IconButton onClick={onClose} aria-label="Close money trail"><CloseIcon /></IconButton>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Confirmed links and review-only possible matches across finance records.
          </Typography>
        </Box>
        <Divider />

        <Box sx={{ p: 2.5, overflowY: 'auto' }}>
          {loading && <Stack spacing={1}><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></Stack>}
          {!loading && error && (
            <Alert severity="error" action={<Button onClick={load} color="inherit">Retry</Button>}>
              {error}
            </Alert>
          )}
          {!loading && !error && trace && (
            <Stack spacing={3}>
              <Box component="section" aria-labelledby="confirmed-trail-heading">
                <Typography id="confirmed-trail-heading" variant="subtitle1" fontWeight={800}>
                  Confirmed trail
                </Typography>
                {trace.nodes.length === 0 ? (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>No linked records found.</Typography>
                ) : (
                  <List disablePadding>
                    {trace.nodes.map((node) => (
                      <ListItem key={node.key} disableGutters alignItems="flex-start" sx={{ py: 1.25 }}>
                        <ListItemText
                          primary={<Typography fontWeight={700}>{node.label}</Typography>}
                          secondary={(
                            <Stack component="span" spacing={0.5} sx={{ mt: 0.5 }}>
                              <Typography component="span" variant="body2" color="text.secondary">
                                {[node.date, node.amount !== undefined ? php.format(node.amount) : '', node.secondaryLabel]
                                  .filter(Boolean).join(' · ')}
                              </Typography>
                              <Box component="span">{recordLink(node)}</Box>
                            </Stack>
                          )}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
                {trace.edges.length > 0 && (
                  <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }} aria-label="Confirmed relationships">
                    {trace.edges.map((edge) => (
                      <Chip
                        key={`${edge.from}-${edge.to}-${edge.relation}`}
                        size="small"
                        color="success"
                        variant="outlined"
                        label={relationLabels[edge.relation] || edge.relation}
                      />
                    ))}
                  </Stack>
                )}
              </Box>

              <Divider />

              <Box component="section" aria-labelledby="possible-matches-heading">
                <Typography id="possible-matches-heading" variant="subtitle1" fontWeight={800}>
                  Possible matches
                </Typography>
                {trace.candidates.length === 0 ? (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>No possible matches found.</Typography>
                ) : (
                  <Stack spacing={2} sx={{ mt: 1.5 }}>
                    {trace.candidates.map((candidate) => (
                      <Box key={candidate.node.key} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                        <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
                          <Typography fontWeight={700}>{candidate.node.label}</Typography>
                          <Chip size="small" color="warning" label="Needs review" />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {candidate.evidence.join(' · ')}
                        </Typography>
                        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
                          {recordLink(candidate.node)}
                          {trace.permissions.canConfirm && candidate.confirmable && anchorNode && (
                            <Button size="small" variant="contained" onClick={() => setSelectedCandidate(candidate)}>
                              Review match
                            </Button>
                          )}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            </Stack>
          )}
        </Box>
      </Drawer>

      {anchorNode && selectedCandidate && (
        <FinanceTraceResolveDialog
          open
          anchorNode={anchorNode}
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          onResolved={resolved}
        />
      )}
    </>
  );
};

export default MoneyTrailDrawer;
