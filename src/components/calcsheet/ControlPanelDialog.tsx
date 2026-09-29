import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { nanoid } from 'nanoid';
import { usePricelistStore } from '../../store/pricelistStore';
import { usePanelIoStore } from '../../store/panelIoStore';
import type { ComponentLine } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { parseLenientFloat } from '../../utils/calcsheet/numberInput';
import { siemensPrice } from '../../utils/calcsheet/siemensPlc';
import {
  DEFAULT_PANEL_INPUTS, MCB_RATINGS, PANEL_HEADER, PANEL_PARTS, TERMINALS_HEADER, WIRES_HEADER, configurePanel, emptyPanelIo,
  type McbRating, type PanelInputs, type PanelSection,
} from '../../utils/calcsheet/controlPanel';
import type { PanelIo } from '../../utils/calcsheet/terminalWiring';
import type { PlcSubmitSection } from './SiemensPlcDialog';

// Control Panel configurator: enclosure size + the panel's I/O → enclosure,
// wireduct, DIN rail, fans, light, thermostat, ABB 2P MCBs, 230 V and 24 V
// wiring, the WAGO terminal strip and marker tube, added to B. Supply of
// Components under "CONTROL PANEL", "TERMINAL BLOCKS & RELAYS" and "WIRES".
// The I/O is pre-filled from the last PLC / BMS configuration added.

interface Props {
  open: boolean;
  onClose: () => void;
  productContingencyPct: number;
  onSubmit: (sections: PlcSubmitSection[]) => void;
}

const id = () => nanoid(6);
const SECTION_ORDER: PanelSection[] = ['panel', 'terminals', 'wiring'];
const SECTION_HEADER: Record<PanelSection, string> = { panel: PANEL_HEADER, terminals: TERMINALS_HEADER, wiring: WIRES_HEADER };

export default function ControlPanelDialog({ open, onClose, productContingencyPct, onSubmit }: Props) {
  const lastIo = usePanelIoStore((s) => s.io);
  const [inp, setInp] = useState<PanelInputs>(() => ({ ...DEFAULT_PANEL_INPUTS, io: lastIo ?? emptyPanelIo() }));
  const set = <K extends keyof PanelInputs>(k: K, v: PanelInputs[K]) => setInp((p) => ({ ...p, [k]: v }));
  const setIo = <K extends keyof PanelIo>(k: K, v: PanelIo[K]) => setInp((p) => ({ ...p, io: { ...p.io, [k]: v } }));
  // Pick up the latest PLC / BMS I/O each time the dialog opens.
  const fromIo = (io: PanelIo | null) => (io?.psuA ? { psuA: io.psuA, psuQty: io.psuQty ?? 1 } : {});
  useEffect(() => { if (open && lastIo) setInp((p) => ({ ...p, io: lastIo, ...fromIo(lastIo) })); }, [open, lastIo]);

  const catalog = usePricelistStore((s) => s.items);
  const fetchCatalog = usePricelistStore((s) => s.fetchItems);
  useEffect(() => { if (open && catalog.length === 0) void fetchCatalog().catch(() => {}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = configurePanel(inp);
  const rows = cfg.lines.map((l) => {
    const part = PANEL_PARTS[l.key];
    const p = siemensPrice(part, catalog);
    return { ...l, part, unitCost: p.price, source: p.source, lineTotal: p.price * l.qty };
  });
  const total = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const inquiry = rows.filter((r) => r.unitCost === 0).length;
  const sections = SECTION_ORDER
    .map((sec) => ({ sec, header: SECTION_HEADER[sec], rows: rows.filter((r) => r.section === sec) }))
    .filter((g) => g.rows.length > 0);
  const describe = (r: (typeof rows)[number]) => `${r.part.generic || r.part.description}${r.detail ? `, ${r.detail}` : ''}`;

  type NumKey = 'widthMm' | 'heightMm' | 'depthMm' | 'heatLossW' | 'deltaT' | 'psuQty' | 'psuA' | 'extraCircuits' | 'extraLoadA';
  const num = (k: NumKey, label: string, helper?: string) => (
    <TextField
      label={label} size="small" fullWidth type="text" inputMode="numeric"
      value={inp[k] || ''} placeholder="0" helperText={helper}
      onChange={(e) => set(k, Math.max(0, Math.round(parseLenientFloat(e.target.value))))}
      onFocus={(e) => e.target.select()}
    />
  );
  const ioNum = (k: 'di' | 'dq' | 'a2' | 'a4' | 'distPoints', label: string, helper?: string) => (
    <TextField
      label={label} size="small" fullWidth type="text" inputMode="numeric"
      value={inp.io[k] || ''} placeholder="0" helperText={helper}
      onChange={(e) => setIo(k, Math.max(0, Math.round(parseLenientFloat(e.target.value))))}
      onFocus={(e) => e.target.select()}
    />
  );

  const reset = () => setInp({ ...DEFAULT_PANEL_INPUTS, io: lastIo ?? emptyPanelIo(), ...fromIo(lastIo) });
  const close = () => { reset(); onClose(); };
  const submit = () => {
    onSubmit(sections.map((g) => ({
      header: g.header,
      rows: g.rows.map((r): ComponentLine => ({
        id: id(), code: '', description: describe(r), brand: r.part.brand ?? '', partNo: r.part.partNo,
        qty: r.qty, uom: r.part.uom ?? 'pc', unitCost: r.unitCost, forex: 1,
        contingencyPct: productContingencyPct ?? 0, contingencyPctOverridden: false, discountPct: 0,
      })),
    })));
    reset();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>
        Control Panel
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Enter the panel size — the enclosure, wireduct, DIN rail, fans, light, thermostat, 2-pole MCBs, terminals, wiring and marker tube are
          worked out for you and added to B. Supply of Components.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Enclosure</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <Box sx={{ width: 120 }}>{num('widthMm', 'Width (mm)')}</Box>
            <Box sx={{ width: 120 }}>{num('heightMm', 'Height (mm)')}</Box>
            <Box sx={{ width: 120 }}>{num('depthMm', 'Depth (mm)')}</Box>
            <TextField select label="Mounting" size="small" sx={{ minWidth: 190 }} value={inp.mounting} onChange={(e) => set('mounting', e.target.value as PanelInputs['mounting'])}
              helperText={inp.mounting === 'auto' ? (cfg.floor ? 'Auto: floor-standing' : 'Auto: wall-mounted') : ' '}>
              <MenuItem value="auto">Auto (floor from 1400 mm)</MenuItem>
              <MenuItem value="wall">Wall-mounted</MenuItem>
              <MenuItem value="floor">Floor-standing</MenuItem>
            </TextField>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Mounting plate ≈ {cfg.plate.w} x {cfg.plate.h} mm · {cfg.rows} rail row{cfg.rows === 1 ? '' : 's'} ({(cfg.railLayoutMm / 1000).toFixed(1)} m of DIN rail) ·
            {' '}{cfg.doors} door{cfg.doors === 1 ? '' : 's'}
          </Typography>

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Cooling</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <FormControlLabel control={<Checkbox size="small" checked={inp.heatAuto} onChange={(e) => set('heatAuto', e.target.checked)} />}
              label={<Typography variant="body2">Heat from the components</Typography>} />
            {inp.heatAuto
              ? <Typography variant="body2" sx={{ pt: 1, fontWeight: 600 }}>≈ {cfg.heatAutoW} W</Typography>
              : <Box sx={{ width: 150 }}>{num('heatLossW', 'Heat loss inside (W)', `Auto would be ${cfg.heatAutoW} W`)}</Box>}
            <Box sx={{ width: 150 }}>{num('deltaT', 'Allowed rise (K)', 'Inside over ambient')}</Box>
            <Typography variant="body2" sx={{ pt: 1 }}>
              {cfg.airflow > 0 ? `≈ ${cfg.airflow} m³/h of fan airflow needed` : 'Wall surface dissipates the heat — 1 fan for hot ambient'}
            </Typography>
          </Stack>
          {inp.heatAuto && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {cfg.heatSources.map((h) => <Chip key={h.label} size="small" variant="outlined" label={`${h.label}: ${h.w} W`} />)}
              {!inp.io.electronicsW && (
                <Typography variant="caption" color="text.secondary">Add a Siemens PLC / Desigo BMS first to include its electronics.</Typography>
              )}
            </Stack>
          )}

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">230 V AC (2-pole ABB MCBs)</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <TextField select label="Main incomer" size="small" sx={{ width: 170 }} value={inp.mainA}
              onChange={(e) => set('mainA', e.target.value === 'auto' ? 'auto' : Number(e.target.value) as McbRating)}
              helperText={inp.mainA === 'auto' ? `Auto: 2P C${cfg.mainA} (${cfg.loadA} A load)` : `Load ${cfg.loadA} A`}>
              <MenuItem value="auto">Auto (from load)</MenuItem>
              {MCB_RATINGS.map((a) => <MenuItem key={a} value={a}>{`2P C${a}`}</MenuItem>)}
            </TextField>
            <Box sx={{ width: 140 }}>{num('psuQty', '24 V DC supplies', '1 MCB each')}</Box>
            <Box sx={{ width: 140 }}>{num('psuA', 'Supply rating (A)', 'Output, each')}</Box>
            <Box sx={{ width: 140 }}>{num('extraCircuits', 'Other 230 V loads', '1 MCB each (C10)')}</Box>
            {inp.extraCircuits > 0 && <Box sx={{ width: 140 }}>{num('extraLoadA', 'Load each (A)')}</Box>}
            <FormControlLabel control={<Checkbox size="small" checked={inp.socket} onChange={(e) => set('socket', e.target.checked)} />}
              label={<Typography variant="body2">Service socket</Typography>} />
          </Stack>

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Terminals &amp; 0.5 mm² wiring</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControlLabel control={<Checkbox size="small" checked={inp.terminals} onChange={(e) => set('terminals', e.target.checked)} />}
              label={<Typography variant="body2">Add the terminal strip, relays &amp; 0.5 mm² wiring</Typography>} />
            {inp.io.source
              ? <Chip size="small" color="primary" variant="outlined" label={`I/O from ${inp.io.source}`} onDelete={() => set('io', emptyPanelIo())} />
              : <Typography variant="caption" color="text.secondary">Add a Siemens PLC / Desigo BMS first to fill this in, or type the counts.</Typography>}
          </Stack>
          {inp.terminals && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 2 }}>
              {ioNum('di', 'DI', '2-level terminal each')}
              {ioNum('dq', 'DO', 'Slim relay each')}
              {ioNum('a2', 'Analog 2-wire', '1 fused + 1 std')}
              {ioNum('a4', 'Analog 4-wire', '2 fused + 2 std')}
              {ioNum('distPoints', '24 V devices', 'Incl. PSU feed')}
            </Box>
          )}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {cfg.wiring && <Chip size="small" variant="outlined" label={`${cfg.wiring.terminals} terminals`} />}
            {cfg.wiring && <Chip size="small" variant="outlined" sx={{ borderColor: 'error.main' }} label={`0.5 mm²: ${cfg.wiring.redWires} red / ${cfg.wiring.blueWires} blue`} />}
            <Chip size="small" variant="outlined" label={`1.5 mm²: ${cfg.wires15} wires (white L1 / black L2)`} />
            <Chip size="small" variant="outlined" label={`DIN rail: ${(cfg.railNeededMm / 1000).toFixed(1)} m needed · ${(cfg.railLayoutMm / 1000).toFixed(1)} m fits`}
              color={cfg.railNeededMm > cfg.railLayoutMm ? 'warning' : 'default'} />
          </Stack>
          {cfg.notes.map((n) => <Alert key={n} severity={/need ≈|Very small|more than one/.test(n) ? 'warning' : 'info'} sx={{ py: 0 }}>{n}</Alert>)}

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Items to add</Typography></Divider>
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
              {sections.flatMap((g) => [
                <TableRow key={`h-${g.sec}`}>
                  <TableCell colSpan={5} sx={{ fontWeight: 700, bgcolor: 'action.hover', py: 0.5 }}>{g.header}</TableCell>
                </TableRow>,
                ...g.rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {r.part.partNo || <Typography variant="body2" color="text.secondary">—</Typography>}
                      {r.part.partNo && r.part.verify && r.source !== 'catalog' && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'inherit' }}>verify P/N</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{describe(r)}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.why}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.qty}{r.part.uom && r.part.uom !== 'pc' ? ` ${r.part.uom}` : ''}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: r.unitCost === 0 ? 'warning.main' : undefined }}>
                      {r.unitCost === 0 ? 'For inquiry' : PHP(r.unitCost)}
                      {r.source === 'catalog' && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>catalog</Typography>}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{PHP(r.lineTotal)}</TableCell>
                  </TableRow>
                )),
              ])}
              <TableRow>
                <TableCell colSpan={4} align="right" sx={{ fontWeight: 600 }}>Total{inquiry > 0 ? ` (excl. ${inquiry} for inquiry)` : ''}</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {inquiry > 0 && (
            <Alert severity="warning" sx={{ py: 0 }}>
              {inquiry} item{inquiry === 1 ? '' : 's'} for inquiry — added at ₱0. Add the price in Sales → Pricelists (same part number) or on the row.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={submit}>
          Add {rows.length} item{rows.length === 1 ? '' : 's'} · {PHP(total)} to Components
        </Button>
      </DialogActions>
    </Dialog>
  );
}
