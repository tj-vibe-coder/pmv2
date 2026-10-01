import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
  useMediaQuery, useTheme,
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
  INSULATIONS, WIRE_SIZES, cableOdMm, capacityFor, conduitFill, estimateCableOdMm, isMulticore,
  type ConductorGroup, type Insulation, type WireSize,
} from '../../utils/calcsheet/conduitFill';
import {
  PIPE_SIZES, CONDUIT_TYPES, materialSlotByKey, boxSlotFor, blankEntry, pipesNeeded, junctionBoxesNeeded, supportsNeeded,
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
  // Phones: full-screen dialog, fields stack two per row, tables scroll sideways.
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const installMaterialPrices = useQuotationStore((s) => s.installMaterialPrices);
  // Materials catalog (Sales → Pricelists) — the default price for each material.
  const catalog = usePricelistStore((s) => s.items);
  const catalogLoading = usePricelistStore((s) => s.loading);
  const fetchCatalog = usePricelistStore((s) => s.fetchItems);
  useEffect(() => { if (open && catalog.length === 0) void fetchCatalog().catch(() => {}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [entries, setEntries] = useState<InstallationWorkEntry[]>([]);
  const [form, setForm] = useState<InstallationWorkEntry>(blankEntry());

  // While the pipe size is on auto, it follows the PEC conduit-fill
  // recommendation whenever the wires, insulation or conduit type change.
  const setField = <K extends keyof InstallationWorkEntry>(key: K, value: InstallationWorkEntry[K]) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (next.pipeSizeAuto) {
        const rec = conduitFill(next.conductors, next.insulation, next.conduitType)?.recommended;
        if (rec) next.pipeSize = rec;
      }
      return next;
    });
  const setConductor = (i: number, patch: Partial<ConductorGroup>) =>
    setField('conductors', form.conductors.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const fill = conduitFill(form.conductors, form.insulation, form.conduitType);
  const fillPct = (v: number) => `${Math.round(v * 100)}%`;
  const overFill = !!fill && fill.fillOf(form.pipeSize) > fill.limit + 1e-9;

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
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth fullScreen={fullScreen} sx={{ '& .MuiDivider-wrapper': { whiteSpace: 'normal' } }}>
      <DialogTitle>
        Installation Work
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: { xs: 'none', sm: 'block' } }}>
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
              onChange={(e) => setForm((f) => ({ ...f, pipeSize: e.target.value as PipeSize, pipeSizeAuto: false }))}
              error={overFill}
              helperText={fill
                ? (form.pipeSizeAuto ? `Auto — ${fillPct(fill.fillOf(form.pipeSize))} fill` : `${fillPct(fill.fillOf(form.pipeSize))} fill${overFill ? ' — over PEC limit' : ''}`)
                : 'Add cables below to auto-size'}
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

          {/* Wires → PEC Chapter 9 conduit fill → recommended pipe size */}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Cables in this conduit</Typography>
              <Typography variant="caption" color="text.secondary">— sizes the pipe per PEC 2017 Chapter 9 (conduit fill)</Typography>
              <Box sx={{ flexGrow: 1 }} />
              <TextField
                select size="small" label="Insulation" value={form.insulation} sx={{ width: { xs: '100%', sm: 170 } }}
                onChange={(e) => setField('insulation', e.target.value as Insulation)}
              >
                {INSULATIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            </Stack>
            {form.conductors.map((g, i) => (
              <Box key={i} sx={{ mb: 1.25 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <TextField
                    select size="small" label="Cable size" value={g.size} sx={{ width: { xs: '100%', sm: 220 } }}
                    onChange={(e) => setConductor(i, { size: e.target.value as WireSize })}
                  >
                    {WIRE_SIZES.map((w) => <MenuItem key={w.value} value={w.value}>{w.label}</MenuItem>)}
                  </TextField>
                  <TextField
                    size="small" label="Cores" type="text" inputMode="numeric" sx={{ width: { xs: 'auto', sm: 90 }, flex: { xs: '1 1 80px', sm: 'none' } }}
                    value={g.cores && g.cores > 1 ? g.cores : ''} placeholder="1"
                    onChange={(e) => setConductor(i, { cores: Math.max(1, Math.round(parseLenientFloat(e.target.value))) })}
                  />
                  {isMulticore(g) && (
                    <TextField
                      size="small" label="Cable OD (mm)" type="text" inputMode="decimal" sx={{ width: { xs: 'auto', sm: 130 }, flex: { xs: '1 1 80px', sm: 'none' } }}
                      value={g.odMm ? String(g.odMm) : ''} placeholder={String(estimateCableOdMm(g.size, g.cores ?? 1, form.insulation))}
                      onChange={(e) => { const v = parseLenientFloat(e.target.value); setConductor(i, { odMm: v > 0 ? v : null }); }}
                    />
                  )}
                  <TextField
                    size="small" label="Cables QTY" type="text" inputMode="numeric" sx={{ width: { xs: 'auto', sm: 120 }, flex: { xs: '1 1 80px', sm: 'none' } }}
                    value={g.qty || ''} placeholder="0"
                    onChange={(e) => setConductor(i, { qty: Math.max(0, Math.round(parseLenientFloat(e.target.value))) })}
                  />
                  {form.conductors.length > 1 && (
                    <IconButton size="small" onClick={() => setField('conductors', form.conductors.filter((_, j) => j !== i))}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
                {isMulticore(g) && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {g.cores}-core cable counts as one conductor, sized by its OD (PEC Ch. 9 Note 9) —{' '}
                    {g.odMm ? `datasheet OD ${g.odMm} mm` : `estimated OD ${cableOdMm(g, form.insulation)} mm; enter the datasheet OD if you have it (shielded / armoured cable is bigger)`}.
                  </Typography>
                )}
                {/* How many of this cable each pipe size can take (PEC Ch. 9 / Annex C) */}
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                    Max {WIRE_SIZES.find((w) => w.value === g.size)?.label.split(' (')[0]}{isMulticore(g) ? ` × ${g.cores}C` : ''} cables per {form.conduitType} pipe:
                  </Typography>
                  {capacityFor(g, form.insulation, form.conduitType).map(({ pipe, max }) => {
                    const current = pipe === form.pipeSize;
                    const tooSmall = g.qty > 0 && max < g.qty;
                    return (
                      <Tooltip key={pipe} title={`${pipe} ${form.conduitType} holds up to ${max} × ${isMulticore(g) ? `${g.size} AWG ${g.cores}-core cable (OD ${cableOdMm(g, form.insulation)} mm)` : `${g.size} AWG ${form.insulation === 'THHN' ? 'THHN' : 'THW'}`} (PEC fill) — click to use ${pipe}`}>
                        <Chip
                          size="small" label={`${pipe} → ${max}`}
                          color={current ? (tooSmall ? 'warning' : 'primary') : 'default'}
                          variant={current ? 'filled' : 'outlined'}
                          onClick={() => setForm((f) => ({ ...f, pipeSize: pipe, pipeSizeAuto: false }))}
                          sx={{ height: 22, fontSize: 11, opacity: tooSmall && !current ? 0.45 : 1 }}
                        />
                      </Tooltip>
                    );
                  })}
                </Stack>
              </Box>
            ))}
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setField('conductors', [...form.conductors, { size: '14', qty: 1 }])}>
                Add cable size
              </Button>
              <Box sx={{ flexGrow: 1 }} />
              {fill && (fill.recommended ? (
                <Alert
                  severity={overFill ? 'warning' : 'success'} sx={{ py: 0 }}
                  action={!form.pipeSizeAuto && fill.recommended !== form.pipeSize ? (
                    <Button size="small" color="inherit" onClick={() => setForm((f) => ({ ...f, pipeSize: fill.recommended as PipeSize, pipeSizeAuto: true }))}>
                      Use {fill.recommended}
                    </Button>
                  ) : undefined}
                >
                  Recommended <strong>{fill.recommended} {form.conduitType}</strong> — {fill.conductors} cable{fill.conductors === 1 ? '' : 's'},{' '}
                  {fillPct(fill.fillOf(fill.recommended))} fill (PEC max {fillPct(fill.limit)})
                  {overFill ? `; ${form.pipeSize} would be ${fillPct(fill.fillOf(form.pipeSize))}` : ''}
                </Alert>
              ) : (
                <Alert severity="error" sx={{ py: 0 }}>
                  {fill.conductors} cables need more than a 2" {form.conduitType} ({fillPct(fill.fillOf('2"'))} fill, max {fillPct(fill.limit)}) — split them into separate runs.
                </Alert>
              ))}
            </Stack>
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
              <strong>{previewJunctions} × {materialSlotByKey(boxSlotFor(form.pipeSize))?.label}</strong> and{' '}
              <strong>{previewSupports} conduit support{previewSupports === 1 ? '' : 's'}</strong>
              {' '}(3m/pipe, a box every 3 pipes{form.bends90 > 4 ? ' or every 4 bends' : ''}; supports within {PEC_SUPPORT_FROM_BOX_M * 1000} mm of each box and at most {PEC_MAX_SUPPORT_SPACING_M} m apart — PEC 2017 {article}).
            </Alert>
          )}

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Conduit Accessories — PEC 2017 (computed; type to override)</Typography></Divider>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            {accField('couplingQty', sizedLabel(`${form.conduitType} Coupling (pc)`), isEmt
              ? '1 per joint between EMT sticks, within each box-to-box segment'
              : 'Comes with each IMC length — type a number only for spares')}
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
              <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Length (m)</TableCell>
                    <TableCell>Size / type</TableCell>
                    <TableCell>Cables</TableCell>
                    <TableCell align="right">Pipes</TableCell>
                    <TableCell align="right">Boxes</TableCell>
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
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {e.conductors.filter((g) => g.qty > 0).map((g) => `${g.qty}×${g.size}${isMulticore(g) ? `/${g.cores}C` : ''}`).join(' + ') || '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{pipeKey ? qs[pipeKey as keyof typeof qs] : 0}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{qs[boxSlotFor(e.pipeSize)] ?? 0}</TableCell>
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
              </Box>

              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Total to add to Section B</Typography></Divider>
              <Box sx={{ overflowX: 'auto' }}>
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
              </Box>
              {totalRows.some((r) => r.unitCost === 0) && (
                <Alert severity="warning" sx={{ py: 0 }}>
                  Some materials above have no price in the catalog (Sales → Pricelists) or Presets yet — they'll be added at ₱0 and can be priced there, or edited directly on the row afterward.
                </Alert>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleFinalSubmit} disabled={totalRows.length === 0}>
          Add {totalRows.length > 0 ? `${totalRows.length} item${totalRows.length === 1 ? '' : 's'} · ${PHP(grandTotal)}` : ''} to Components
        </Button>
      </DialogActions>
    </Dialog>
  );
}
