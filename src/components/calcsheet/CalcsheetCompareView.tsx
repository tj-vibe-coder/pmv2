import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Box, Chip, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import { useQuotationStore } from '../../store/quotationStore';
import { computeTotals, PHP } from '../../utils/calcsheet/calc';
import { resolveContact } from '../../types/Client';
import type { Quotation } from '../../types/Quotation';

export default function CompareView() {
  const { id = '' } = useParams();
  const project = useQuotationStore((s) => s.projects.find((p) => p.id === id));
  const allQuotations = useQuotationStore((s) => s.quotations);
  const quotations = useMemo(() => allQuotations.filter((q) => q.projectId === id), [allQuotations, id]);
  const clients = useQuotationStore((s) => s.clients);

  // Options sorted by kind, then revision ascending, for the pickers.
  const options = useMemo(
    () => [...quotations].sort((a, b) =>
      a.kind !== b.kind
        ? a.kind.localeCompare(b.kind)
        : (a.revision || '00').localeCompare(b.revision || '00'),
    ),
    [quotations],
  );

  // Default: latest revision on the right, the previous revision on the left,
  // preferring the IOCT kind (falling back to whichever kind has the most revisions).
  const defaults = useMemo(() => {
    if (quotations.length === 0) return { left: '', right: '' };
    const byKind = new Map<string, Quotation[]>();
    for (const q of quotations) {
      const list = byKind.get(q.kind) ?? [];
      list.push(q);
      byKind.set(q.kind, list);
    }
    const kind = byKind.has('IOCT')
      ? 'IOCT'
      : Array.from(byKind.keys()).sort((a, b) => byKind.get(b)!.length - byKind.get(a)!.length)[0];
    const revs = byKind.get(kind)!.slice().sort((a, b) => (b.revision || '00').localeCompare(a.revision || '00')); // newest first
    const right = revs[0];
    const left = revs[1] ?? revs[0];
    return { left: left.id, right: right.id };
  }, [quotations]);

  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  useEffect(() => { setLeftId(defaults.left); setRightId(defaults.right); }, [defaults]);

  if (!project) return <Typography>Project not found. <Link to="/sales/calcsheet/projects">Back</Link></Typography>;

  const left = quotations.find((q) => q.id === leftId);
  const right = quotations.find((q) => q.id === rightId);

  const label = (q: Quotation) => `${q.kind} · rev ${q.revision}`;

  const Picker = ({ label: lbl, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <FormControl size="small" fullWidth>
      <InputLabel>{lbl}</InputLabel>
      <Select label={lbl} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((q) => (
          <MenuItem key={q.id} value={q.id}>{project.code}-{q.revision} · {q.kind}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  const Col = ({ q, color }: { q?: Quotation; color: 'primary' | 'secondary' }) => {
    if (!q) return <Paper sx={{ p: 3, color: 'text.secondary' }}>Select a quotation to compare.</Paper>;
    const t = computeTotals(q);
    const recipient = clients.find((c) => c.id === q.recipientId);
    return (
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={q.kind} color={color} />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
              {project.code}-{q.revision}
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

  const leftTotal = left ? computeTotals(left).grandTotal : 0;
  const rightTotal = right ? computeTotals(right).grandTotal : 0;
  const delta = rightTotal - leftTotal;
  const pct = leftTotal > 0 ? (delta / leftTotal) * 100 : null;
  const deltaColor = delta > 0 ? 'success.main' : delta < 0 ? 'error.main' : 'text.primary';
  const sign = delta > 0 ? '+' : delta < 0 ? '− ' : '';

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{project.code}</Typography>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>{project.name} · Comparison</Typography>
        </Stack>
        <Box>
          <Link to={`/sales/calcsheet/projects/${project.id}`} style={{ color: 'inherit' }}>← Back to project</Link>
        </Box>
      </Stack>

      {options.length === 0 ? (
        <Paper sx={{ p: 3, color: 'text.secondary' }}>This project has no quotations to compare yet.</Paper>
      ) : (
        <>
          {/* Revision / quotation pickers */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
            <Picker label="Compare (older / base)" value={leftId} onChange={setLeftId} />
            <Typography sx={{ color: 'text.secondary', fontWeight: 600 }}>vs</Typography>
            <Picker label="Against (newer)" value={rightId} onChange={setRightId} />
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Col q={left} color="primary" />
            <Col q={right} color="secondary" />
          </Box>

          {left && right && (
            <Paper sx={{ p: 3, bgcolor: 'grey.50' }}>
              <Typography variant="h3" mb={1}>
                {leftId === rightId ? 'Same quotation selected' : `${label(right)} vs ${label(left)}`}
              </Typography>
              <Stack direction="row" spacing={4} flexWrap="wrap">
                <Box>
                  <Typography variant="caption" color="text.secondary">Difference in Grand Total (newer − older)</Typography>
                  <Typography variant="h3" sx={{ fontFamily: 'monospace', color: deltaColor }}>{sign}{PHP(Math.abs(delta))}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Change</Typography>
                  <Typography variant="h3" sx={{ fontFamily: 'monospace', color: deltaColor }}>
                    {pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
