import { useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { nanoid } from 'nanoid';
import { useQuotationStore } from '../../store/quotationStore';
import type { ComponentLine } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { parseLenientFloat } from '../../utils/calcsheet/numberInput';
import {
  PIPE_SIZES, materialSlotByKey, blankEntry, pipesNeeded, junctionBoxesNeeded,
  computeEntryQuantities, aggregateEntries,
  type PipeSize, type InstallationWorkEntry,
} from '../../utils/calcsheet/installationMaterials';

const id = () => nanoid(6);

interface InstallationWorkDialogProps {
  open: boolean;
  onClose: () => void;
  // Applied to every generated component row, matching how a manually-added
  // row picks up the quotation's default (addComponent in the editor).
  productContingencyPct: number;
  onSubmit: (rows: ComponentLine[]) => void;
}

export default function InstallationWorkDialog({ open, onClose, productContingencyPct, onSubmit }: InstallationWorkDialogProps) {
  const installMaterialPrices = useQuotationStore((s) => s.installMaterialPrices);

  const [entries, setEntries] = useState<InstallationWorkEntry[]>([]);
  const [form, setForm] = useState<InstallationWorkEntry>(blankEntry());

  const setField = <K extends keyof InstallationWorkEntry>(key: K, value: InstallationWorkEntry[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const previewPipes = pipesNeeded(form.lengthMeters);
  const previewJunctions = junctionBoxesNeeded(form.lengthMeters);
  const canAddEntry = form.name.trim().length > 0 && form.lengthMeters > 0;

  const addEntry = () => {
    if (!canAddEntry) return;
    setEntries((prev) => [...prev, { ...form, id: id() }]);
    setForm(blankEntry());
  };
  const removeEntry = (entryId: string) => setEntries((prev) => prev.filter((e) => e.id !== entryId));

  const totals = aggregateEntries(entries);
  const totalRows = (Object.keys(totals) as Array<keyof typeof totals>)
    .filter((k) => (totals[k] || 0) > 0)
    .map((k) => {
      const slot = materialSlotByKey(k as string)!;
      const qty = totals[k] || 0;
      const price = installMaterialPrices[k as string];
      const unitCost = price?.unitCost ?? 0;
      return { key: k as string, slot, qty, unitCost, lineTotal: qty * unitCost };
    });
  const grandTotal = totalRows.reduce((s, r) => s + r.lineTotal, 0);

  const handleClose = () => {
    setEntries([]);
    setForm(blankEntry());
    onClose();
  };

  const handleFinalSubmit = () => {
    if (totalRows.length === 0) return;
    const rows: ComponentLine[] = totalRows.map((r) => ({
      id: id(),
      code: '',                        // renumbered by the editor's commit()
      description: r.slot.label,
      brand: installMaterialPrices[r.key]?.brand || '',
      partNo: '',
      qty: r.qty,
      uom: r.slot.uom,
      unitCost: r.unitCost,
      forex: 1,
      contingencyPct: productContingencyPct ?? 0,
      contingencyPctOverridden: false,
      discountPct: 0,
    }));
    onSubmit(rows);
    setEntries([]);
    setForm(blankEntry());
  };

  // Accessory field labels reflect the currently-selected pipe size, since a
  // single run's accessories all share that size (see installationMaterials.ts).
  const sizedLabel = (base: string) => `${base} ${form.pipeSize}`;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Installation Work
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Describe each conduit run — pipes and junction boxes are computed for you. Add as many runs as this
          project needs, then submit once to drop the totals into B. Supply of Components.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Installation Work Name" size="small" fullWidth
              placeholder="e.g. Panel Room to MCC-1"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
            <TextField
              label="Total length (m)" size="small" fullWidth type="text" inputMode="decimal"
              value={form.lengthMeters || ''}
              onChange={(e) => setField('lengthMeters', parseLenientFloat(e.target.value))}
            />
            <TextField
              select label="Pipe size" size="small" fullWidth
              value={form.pipeSize}
              onChange={(e) => setField('pipeSize', e.target.value as PipeSize)}
            >
              {PIPE_SIZES.map((sz) => <MenuItem key={sz} value={sz}>{sz}</MenuItem>)}
            </TextField>
          </Box>

          {form.lengthMeters > 0 && (
            <Alert severity="info" sx={{ py: 0 }}>
              This run needs <strong>{previewPipes} {form.pipeSize} pipe{previewPipes === 1 ? '' : 's'}</strong> and{' '}
              <strong>{previewJunctions} junction box{previewJunctions === 1 ? '' : 'es'}</strong>
              {' '}(3m/pipe, junction box every 3 pipes — rounded up to fully cover {form.lengthMeters}m).
            </Alert>
          )}

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Optional Conduit Accessories (this run)</Typography></Divider>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            <TextField
              label={sizedLabel('LQT (m)')} size="small" fullWidth type="text" inputMode="decimal"
              value={form.lqtMeters || ''} onChange={(e) => setField('lqtMeters', parseLenientFloat(e.target.value))}
            />
            <TextField
              label={sizedLabel('Straight Connector (pc)')} size="small" fullWidth type="text" inputMode="decimal"
              value={form.straightConnectorQty || ''} onChange={(e) => setField('straightConnectorQty', parseLenientFloat(e.target.value))}
            />
            <TextField
              label={sizedLabel('Caddy Clamp (pc)')} size="small" fullWidth type="text" inputMode="decimal"
              value={form.caddyClampQty || ''} onChange={(e) => setField('caddyClampQty', parseLenientFloat(e.target.value))}
            />
            <TextField
              label={sizedLabel('U Bolt (pc)')} size="small" fullWidth type="text" inputMode="decimal"
              value={form.uBoltQty || ''} onChange={(e) => setField('uBoltQty', parseLenientFloat(e.target.value))}
            />
            <TextField
              label="Unistrut Channel Slotted (pc)" size="small" fullWidth type="text" inputMode="decimal"
              value={form.unistrutChannelQty || ''} onChange={(e) => setField('unistrutChannelQty', parseLenientFloat(e.target.value))}
            />
            <TextField
              label="Angle Bar 1&quot; (pc)" size="small" fullWidth type="text" inputMode="decimal"
              value={form.angleBarQty || ''} onChange={(e) => setField('angleBarQty', parseLenientFloat(e.target.value))}
            />
          </Box>
          <Box>
            <Button startIcon={<AddIcon />} variant="outlined" size="small" disabled={!canAddEntry} onClick={addEntry}>
              Add run
            </Button>
          </Box>

          {entries.length > 0 && (
            <>
              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Runs added ({entries.length})</Typography></Divider>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Length (m)</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell align="right">Pipes</TableCell>
                    <TableCell align="right">Junction Boxes</TableCell>
                    <TableCell align="right" sx={{ width: 44 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((e) => {
                    const qs = computeEntryQuantities(e);
                    const pipeKey = Object.keys(qs).find((k) => k.startsWith('pipe_'));
                    return (
                      <TableRow key={e.id} hover>
                        <TableCell>{e.name}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{e.lengthMeters}</TableCell>
                        <TableCell>{e.pipeSize}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{pipeKey ? qs[pipeKey as keyof typeof qs] : 0}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{qs.junctionBox ?? 0}</TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => removeEntry(e.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Total to add to Section B</Typography></Divider>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Material</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell>UOM</TableCell>
                    <TableCell align="right">Unit Cost</TableCell>
                    <TableCell align="right">Line Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {totalRows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>{r.slot.label}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{r.qty}</TableCell>
                      <TableCell>{r.slot.uom}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', color: r.unitCost === 0 ? 'warning.main' : undefined }}>
                        {PHP(r.unitCost)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{PHP(r.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={4} align="right" sx={{ fontWeight: 600 }}>Grand Total</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(grandTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {totalRows.some((r) => r.unitCost === 0) && (
                <Alert severity="warning" sx={{ py: 0 }}>
                  Some materials above have no unit cost set yet — they'll be added at ₱0 and can be priced from Presets → Installation Materials, or edited directly on the row afterward.
                </Alert>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleFinalSubmit} disabled={totalRows.length === 0}>
          Add {totalRows.length > 0 ? `${totalRows.length} item${totalRows.length === 1 ? '' : 's'} · ${PHP(grandTotal)}` : ''} to Components
        </Button>
      </DialogActions>
    </Dialog>
  );
}
