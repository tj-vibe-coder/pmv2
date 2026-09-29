import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { nanoid } from 'nanoid';
import { useQuotationStore } from '../../store/quotationStore';
import { usePricelistStore } from '../../store/pricelistStore';
import type { ComponentLine } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { parseLenientFloat } from '../../utils/calcsheet/numberInput';
import {
  PIPE_SIZES, CONDUIT_TYPES, materialSlotByKey, blankEntry, pipesNeeded, junctionBoxesNeeded, supportsNeeded,
  computeEntryQuantities, aggregateEntries, pecAccessories, effectiveAccessories, resolveSlotPrice,
  PEC_MAX_SUPPORT_SPACING_M, PEC_SUPPORT_FROM_BOX_M, PEC_LQT_PER_CONNECTION_M,
  type PipeSize, type ConduitType, type InstallationWorkEntry, type AccessoryField, type Mounting, type MaterialSlotKey,
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
  // Materials catalog (Sales → Pricelists) — the default price for each material.
  const catalog = usePricelistStore((s) => s.items);
  const catalogLoading = usePricelistStore((s) => s.loading);
  const fetchCatalog = usePricelistStore((s) => s.fetchItems);
  useEffect(() => { if (open && catalog.length === 0) void fetchCatalog().catch(() => {}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [entries, setEntries] = useState<InstallationWorkEntry[]>([]);
  const [form, setForm] = useState<InstallationWorkEntry>(blankEntry());

  const setField = <K extends keyof InstallationWorkEntry>(key: K, value: InstallationWorkEntry[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const previewPipes = pipesNeeded(form.lengthMeters);
  const previewJunctions = junctionBoxesNeeded(form.lengthMeters, form.bends90);
  const previewSupports = supportsNeeded(form.lengthMeters, form.bends90);
  const autoAcc = pecAccessories(form);
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
      const price = resolveSlotPrice(k as MaterialSlotKey, installMaterialPrices, catalog);
      return { key: k as string, slot, qty, unitCost: price.unitCost, price, lineTotal: qty * price.unitCost };
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
      brand: r.price.brand,
      partNo: r.price.partNo,
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

  // An accessory field: shows the PEC-computed quantity until the user types
  // an override; clearing the field goes back to the computed figure.
  const accField = (key: AccessoryField, label: string, why: string) => {
    const overridden = form[key] !== null;
    return (
      <TextField
        label={label} size="small" fullWidth type="text" inputMode="decimal"
        value={overridden ? String(form[key]) : String(autoAcc[key])}
        onChange={(e) => setField(key, e.target.value.trim() === '' ? null : parseLenientFloat(e.target.value))}
        onFocus={(e) => e.target.select()}
        helperText={(
          <Tooltip title={why} placement="bottom-start">
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Chip
                size="small" label={overridden ? 'Edited' : 'PEC auto'} color={overridden ? 'warning' : 'success'} variant="outlined"
                sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }}
              />
              {overridden
                ? <Box component="span" sx={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setField(key, null)}>use {autoAcc[key]}</Box>
                : <Box component="span">{why.split(' — ')[0]}</Box>}
            </Box>
          </Tooltip>
        )}
      />
    );
  };
  const onUnistrut = form.mounting === 'unistrut';
  const isEmt = form.conduitType === 'EMT';
  const article = CONDUIT_TYPES.find((c) => c.value === form.conduitType)?.article ?? '';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Installation Work
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Describe each conduit run — pipes, junction boxes and the conduit accessories are computed for you
          (PEC 2017 support rules). Add as many runs as this project needs, then submit once to drop the totals
          into B. Supply of Components.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr 1fr' }, gap: 2 }}>
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
            <TextField
              select label="Conduit type" size="small" fullWidth
              value={form.conduitType}
              onChange={(e) => setField('conduitType', e.target.value as ConduitType)}
            >
              {CONDUIT_TYPES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
            </TextField>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1.4fr' }, gap: 2 }}>
            <TextField
              label="90° bends (total)" size="small" fullWidth type="text" inputMode="numeric"
              value={form.bends90 || ''} placeholder="0"
              onChange={(e) => setField('bends90', Math.max(0, Math.round(parseLenientFloat(e.target.value))))}
              helperText="PEC: max 4 (360°) between pull points"
            />
            <TextField
              label="Equipment connections (LQT)" size="small" fullWidth type="text" inputMode="numeric"
              value={String(form.equipmentConnections)}
              onChange={(e) => setField('equipmentConnections', Math.max(0, Math.round(parseLenientFloat(e.target.value))))}
              helperText="Flex drops to motors / devices"
            />
            <TextField
              select label="Mounting" size="small" fullWidth value={form.mounting}
              onChange={(e) => setField('mounting', e.target.value as Mounting)}
              helperText={onUnistrut ? 'U-bolts on unistrut, 1" angle brackets' : 'Caddy/beam clamps to the structure'}
            >
              <MenuItem value="clamp">Caddy clamp (to structure)</MenuItem>
              <MenuItem value="unistrut">Unistrut + U-bolt</MenuItem>
            </TextField>
          </Box>

          {form.lengthMeters > 0 && (
            <Alert severity="info" sx={{ py: 0 }}>
              This run needs <strong>{previewPipes} {form.pipeSize} {form.conduitType} pipe{previewPipes === 1 ? '' : 's'}</strong>,{' '}
              <strong>{previewJunctions} junction box{previewJunctions === 1 ? '' : 'es'}</strong> and{' '}
              <strong>{previewSupports} conduit support{previewSupports === 1 ? '' : 's'}</strong>
              {' '}(3m/pipe, a box every 3 pipes{form.bends90 > 4 ? ' or every 4 bends' : ''}; supports within {PEC_SUPPORT_FROM_BOX_M * 1000} mm of each box and at most {PEC_MAX_SUPPORT_SPACING_M} m apart — PEC 2017 {article}).
            </Alert>
          )}

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Conduit Accessories — PEC 2017 (computed; type to override)</Typography></Divider>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            {accField('couplingQty', sizedLabel(`${form.conduitType} Coupling (pc)`), `1 per joint between ${form.conduitType} sticks, within each box-to-box segment`)}
            {accField('boxFittingQty', sizedLabel(isEmt ? 'EMT Connector (pc)' : 'Lock Nut w/ Bushing (pc)'), isEmt
              ? '2 per segment — one EMT connector at each box / panel entry'
              : '2 per segment — a locknut with bushing at each box / panel entry')}
            {accField('lqtMeters', sizedLabel('LQT (m)'), `${PEC_LQT_PER_CONNECTION_M} m per connection — PEC Art. 3.50: up to 900 mm at a terminal may be unsupported`)}
            {accField('straightConnectorQty', sizedLabel('Straight Connector (pc)'), '2 per LQT piece — one at each end')}
            {accField('caddyClampQty', sizedLabel('Caddy Clamp (pc)'), onUnistrut ? '0 when mounted on unistrut — U-bolts hold the conduit' : '1 per support — PEC Art. 3.42 support spacing')}
            {accField('uBoltQty', sizedLabel('U Bolt (pc)'), onUnistrut ? '1 per support — PEC Art. 3.42 support spacing' : '0 with caddy clamps — switch Mounting to Unistrut to use U-bolts')}
            {accField('unistrutChannelQty', 'Unistrut Channel Slotted (pc)', onUnistrut ? '0.3 m per support, cut from 3 m sticks — site practice' : '0 with caddy clamps')}
            {accField('angleBarQty', 'Angle Bar 1" (pc)', onUnistrut ? '0.6 m bracket per support, cut from 6 m bars — site practice' : '0 with caddy clamps')}
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
                    <TableCell>Size / type</TableCell>
                    <TableCell align="right">Pipes</TableCell>
                    <TableCell align="right">Junction Boxes</TableCell>
                    <TableCell align="right">Supports</TableCell>
                    <TableCell align="right">LQT (m)</TableCell>
                    <TableCell align="right" sx={{ width: 44 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((e) => {
                    const qs = computeEntryQuantities(e);
                    const pipeKey = Object.keys(qs).find((k) => k.startsWith('pipe_') || k.startsWith('emtPipe_'));
                    return (
                      <TableRow key={e.id} hover>
                        <TableCell>{e.name}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{e.lengthMeters}</TableCell>
                        <TableCell>{e.pipeSize} {e.conduitType}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{pipeKey ? qs[pipeKey as keyof typeof qs] : 0}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{qs.junctionBox ?? 0}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                          {(() => { const a = effectiveAccessories(e); return e.mounting === 'unistrut' ? `${a.uBoltQty} U-bolt` : `${a.caddyClampQty} clamp`; })()}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{effectiveAccessories(e).lqtMeters}</TableCell>
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
                    <TableCell>Price source</TableCell>
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
                      <TableCell sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {r.price.source === 'catalog'
                          ? <>Catalog · {r.price.partNo}{r.price.brand ? ` · ${r.price.brand}` : ''}</>
                          : r.price.source === 'preset'
                            ? <>Presets{r.price.brand ? ` · ${r.price.brand}` : ''}</>
                            : <Box component="span" sx={{ color: 'warning.main' }}>{catalogLoading ? 'Loading catalog…' : 'Not priced'}</Box>}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', color: r.unitCost === 0 ? 'warning.main' : undefined }}>
                        {PHP(r.unitCost)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{PHP(r.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>Grand Total</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(grandTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {totalRows.some((r) => r.unitCost === 0) && (
                <Alert severity="warning" sx={{ py: 0 }}>
                  Some materials above have no price in the catalog (Sales → Pricelists) or Presets yet — they'll be added at ₱0 and can be priced there, or edited directly on the row afterward.
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
