import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { nanoid } from 'nanoid';
import { usePricelistStore } from '../../store/pricelistStore';
import type { ComponentLine } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { parseLenientFloat } from '../../utils/calcsheet/numberInput';
import {
  DEFAULT_PLC_INPUTS, SIEMENS_PARTS, configurePlc, siemensPrice,
  type ModbusMode, type PlcFamily, type PlcInputs, type SitopModel,
} from '../../utils/calcsheet/siemensPlc';

// Siemens PLC configurator: I/O counts + PLC family + Modbus → the module
// list (CPU, ET 200SP, BaseUnits, Modbus hardware, SITOP), priced, added to
// B. Supply of Components under a "PLC — SIEMENS …" header.

interface Props {
  open: boolean;
  onClose: () => void;
  productContingencyPct: number;
  onSubmit: (rows: ComponentLine[], header: string) => void;
}

const id = () => nanoid(6);

export default function SiemensPlcDialog({ open, onClose, productContingencyPct, onSubmit }: Props) {
  const [inp, setInp] = useState<PlcInputs>(DEFAULT_PLC_INPUTS);
  const set = <K extends keyof PlcInputs>(k: K, v: PlcInputs[K]) => setInp((p) => ({ ...p, [k]: v }));

  const catalog = usePricelistStore((s) => s.items);
  const fetchCatalog = usePricelistStore((s) => s.fetchItems);
  useEffect(() => { if (open && catalog.length === 0) void fetchCatalog().catch(() => {}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = configurePlc(inp);
  const is1200 = inp.family === 'S7-1200';
  const hasIo = inp.di + inp.do + inp.ai + inp.ao > 0;
  const rows = cfg.lines.map((l) => {
    const part = SIEMENS_PARTS[l.key];
    const p = siemensPrice(part, catalog);
    return { ...l, part, unitCost: p.price, source: p.source, lineTotal: p.price * l.qty };
  });
  const total = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const header = `PLC — SIEMENS ${inp.family}`;

  const num = (k: 'di' | 'do' | 'ai' | 'ao' | 'sparePct' | 'modbusPorts', label: string, helper?: string) => (
    <TextField
      label={label} size="small" fullWidth type="text" inputMode="numeric"
      value={inp[k] || (k === 'sparePct' ? '0' : '')} placeholder="0" helperText={helper}
      onChange={(e) => set(k, Math.max(0, Math.round(parseLenientFloat(e.target.value))))}
      onFocus={(e) => e.target.select()}
    />
  );

  const close = () => { setInp(DEFAULT_PLC_INPUTS); onClose(); };
  const submit = () => {
    const lines: ComponentLine[] = rows.map((r) => ({
      id: id(), code: '', description: r.part.description, brand: 'Siemens', partNo: r.part.partNo,
      qty: r.qty, uom: 'pc', unitCost: r.unitCost, forex: 1,
      contingencyPct: productContingencyPct ?? 0, contingencyPctOverridden: false, discountPct: 0,
    }));
    onSubmit(lines, header);
    setInp(DEFAULT_PLC_INPUTS);
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>
        Siemens PLC
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Enter the I/O count and pick the PLC — the CPU, ET 200SP remote I/O, BaseUnits, Modbus hardware and 24 V supply are
          selected for you, priced, and added to B. Supply of Components.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup
              size="small" exclusive value={inp.family}
              onChange={(_, v: PlcFamily | null) => v && set('family', v)}
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 2 } }}
            >
              <ToggleButton value="S7-1200">S7-1200 · CPU 1214C</ToggleButton>
              <ToggleButton value="S7-1500">S7-1500 · CPU 1513-1 PN</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary">
              {is1200 ? '14 DI / 10 DQ / 2 AI (0–10 V) on the CPU; the rest on ET 200SP' : 'All I/O on ET 200SP; memory card required'}
            </Typography>
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 2 }}>
            {num('di', 'DI (digital in)')}
            {num('do', 'DO (digital out)')}
            {num('ai', 'AI (analog in)', '4–20 mA')}
            {num('ao', 'AO (analog out)')}
            {num('sparePct', 'Spare %', 'Added to each I/O type')}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.4fr 0.8fr 1.2fr' }, gap: 2 }}>
            <TextField select label="Modbus" size="small" fullWidth value={inp.modbus} onChange={(e) => set('modbus', e.target.value as ModbusMode)}>
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="tcp">Modbus TCP (Ethernet — built in)</MenuItem>
              <MenuItem value="rtu">Modbus RTU (RS-485)</MenuItem>
            </TextField>
            {inp.modbus === 'rtu' ? num('modbusPorts', 'RS-485 ports', is1200 ? '1st on CB 1241' : 'CM PtP each') : <Box />}
            <TextField select label="24 V power supply" size="small" fullWidth value={inp.sitop} onChange={(e) => set('sitop', e.target.value as SitopModel)}>
              <MenuItem value="PSU100S">SITOP PSU100S 20 A</MenuItem>
              <MenuItem value="PSU8200">SITOP PSU8200 20 A</MenuItem>
            </TextField>
          </Box>
          {is1200 && (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <FormControlLabel
                control={<Checkbox size="small" checked={inp.useOnboardAi} onChange={(e) => set('useOnboardAi', e.target.checked)} />}
                label={<Typography variant="body2">Count the CPU&apos;s 2 on-board AI (0–10 V signals only)</Typography>}
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={inp.memoryCard} onChange={(e) => set('memoryCard', e.target.checked)} />}
                label={<Typography variant="body2">Include memory card</Typography>}
              />
            </Stack>
          )}

          {hasIo || inp.modbus === 'rtu' ? (
            <>
              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Channels (incl. spare)</Typography></Divider>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(['di', 'do', 'ai', 'ao'] as const).filter((k) => cfg.channels[k].needed > 0).map((k) => (
                  <Chip
                    key={k} size="small" variant="outlined" color="success"
                    label={`${k.toUpperCase()}: ${cfg.channels[k].needed} needed · ${cfg.channels[k].provided} provided`}
                  />
                ))}
                {cfg.stations > 0 && <Chip size="small" variant="outlined" label={`${cfg.ioModules} ET 200SP module${cfg.ioModules === 1 ? '' : 's'} · ${cfg.stations} station${cfg.stations === 1 ? '' : 's'}`} />}
              </Stack>
              {cfg.notes.map((n) => <Alert key={n} severity="info" sx={{ py: 0 }}>{n}</Alert>)}

              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Modules to add</Typography></Divider>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Part no.</TableCell>
                    <TableCell>Item</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Unit price</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.part.partNo}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{r.part.description.split(', ').slice(0, 3).join(', ')}</Typography>
                        <Typography variant="caption" color="text.secondary">{r.why}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{r.qty}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: r.unitCost === 0 ? 'warning.main' : undefined }}>
                        {r.unitCost === 0 ? 'Not priced' : PHP(r.unitCost)}
                        {r.source === 'catalog' && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>catalog</Typography>}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{PHP(r.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={4} align="right" sx={{ fontWeight: 600 }}>Total</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {rows.some((r) => r.unitCost === 0) && (
                <Alert severity="warning" sx={{ py: 0 }}>
                  Some items have no price yet (e.g. the light BaseUnit 6ES7193-6BP00-0DA0) — they&apos;re added at ₱0; price them in Sales → Pricelists
                  (same part number) or on the row afterward.
                </Alert>
              )}
            </>
          ) : (
            <Alert severity="info">Enter the I/O count to see the modules.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!(hasIo || inp.modbus === 'rtu')}>
          Add {rows.length} item{rows.length === 1 ? '' : 's'} · {PHP(total)} to Components
        </Button>
      </DialogActions>
    </Dialog>
  );
}
