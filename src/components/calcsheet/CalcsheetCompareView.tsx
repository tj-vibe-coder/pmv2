import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { useQuotationStore } from '../../store/quotationStore';
import { computeTotals, PHP } from '../../utils/calcsheet/calc';
import { resolveContact } from '../../types/Client';

export default function CompareView() {
  const { id = '' } = useParams();
  const project = useQuotationStore((s) => s.projects.find((p) => p.id === id));
  const allQuotations = useQuotationStore((s) => s.quotations);
  const quotations = useMemo(() => allQuotations.filter((q) => q.projectId === id), [allQuotations, id]);
  const clients = useQuotationStore((s) => s.clients);

  if (!project) return <Typography>Project not found. <Link to="/calcsheet/projects">Back</Link></Typography>;

  const ioct = quotations.find((q) => q.kind === 'IOCT');
  const acti = quotations.find((q) => q.kind === 'ACTI');

  const Col = ({ q, color }: { q: typeof ioct; color: 'primary' | 'secondary' }) => {
    if (!q) return <Paper sx={{ p: 3, color: 'text.secondary' }}>No {color === 'primary' ? 'IOCT' : 'ACTI'} quotation yet.</Paper>;
    const t = computeTotals(q);
    const recipient = clients.find((c) => c.id === q.recipientId);
    return (
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={q.kind} color={color} />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
              rev {q.revision}
            </Typography>
          </Stack>
          <Box>
            <Typography variant="caption" color="text.secondary">To</Typography>
            <Typography>{recipient?.name ?? '—'}</Typography>
            {(() => {
              const c = resolveContact(recipient ?? null, q.contactId);
              return c ? (
                <Typography variant="caption" color="text.secondary">
                  {c.name}{c.position ? ` · ${c.position}` : ''}
                </Typography>
              ) : null;
            })()}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 1, columnGap: 4 }}>
            <Typography variant="body2">A. General Requirements</Typography>
            <Typography sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(t.generalReqtsSubtotal)}</Typography>
            <Typography variant="body2">B. Components</Typography>
            <Typography sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(t.componentsSubtotal)}</Typography>
            <Typography variant="body2">C. Engineering</Typography>
            <Typography sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(t.servicesSubtotal)}</Typography>
            <Typography variant="body2" sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.5, fontWeight: 600 }}>Subtotal</Typography>
            <Typography sx={{ fontFamily: 'monospace', textAlign: 'right', fontWeight: 600, borderTop: '1px solid', borderColor: 'divider', pt: 0.5 }}>{PHP(t.subtotal)}</Typography>
            {q.discountPct > 0 && <>
              <Typography variant="body2">Discount</Typography>
              <Typography sx={{ fontFamily: 'monospace', textAlign: 'right', color: 'error.main' }}>− {PHP(t.discount)}</Typography>
            </>}
            {q.vatPct > 0 && <>
              <Typography variant="body2">VAT ({q.vatPct}%)</Typography>
              <Typography sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(t.vat)}</Typography>
            </>}
            <Typography variant="h3">Grand Total</Typography>
            <Typography variant="h3" sx={{ fontFamily: 'monospace', textAlign: 'right', color: `${color}.main` }}>{PHP(t.grandTotal)}</Typography>
          </Box>

          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
            <Stack direction="row" spacing={3} flexWrap="wrap">
              <Box>
                <Typography variant="caption" color="text.secondary">Components Cost</Typography>
                <Typography sx={{ fontFamily: 'monospace' }}>{PHP(t.componentsCost)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Labor Cost</Typography>
                <Typography sx={{ fontFamily: 'monospace' }}>{PHP(t.laborCost)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Total Margin</Typography>
                <Typography sx={{ fontFamily: 'monospace', color: 'success.main' }}>
                  {PHP((t.componentsSubtotal - t.componentsCost) + (t.servicesSubtotal - t.laborCost))}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Markup (P / L)</Typography>
                <Typography sx={{ fontFamily: 'monospace' }}>{q.productMarkupPct}% / {q.laborMarkupPct}%</Typography>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    );
  };

  const ioctTotal = ioct ? computeTotals(ioct).grandTotal : 0;
  const actiTotal = acti ? computeTotals(acti).grandTotal : 0;
  const delta = actiTotal - ioctTotal;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{project.code}</Typography>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>{project.name} · Comparison</Typography>
        </Stack>
        <Box>
          <Link to={`/calcsheet/projects/${project.id}`} style={{ color: 'inherit' }}>← Back to project</Link>
        </Box>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <Col q={ioct} color="primary" />
        <Col q={acti} color="secondary" />
      </Box>

      {ioct && acti && (
        <Paper sx={{ p: 3, bgcolor: 'grey.50' }}>
          <Typography variant="h3" mb={1}>ACTI vs IOCT</Typography>
          <Stack direction="row" spacing={4} flexWrap="wrap">
            <Box>
              <Typography variant="caption" color="text.secondary">Difference (ACTI − IOCT)</Typography>
              <Typography variant="h3" sx={{ fontFamily: 'monospace' }}>{PHP(delta)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">ACTI margin over IOCT subcontract</Typography>
              <Typography variant="h3" sx={{ fontFamily: 'monospace' }}>
                {ioctTotal > 0 ? `${((delta / ioctTotal) * 100).toFixed(1)}%` : '—'}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
