import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  ListSubheader, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { nanoid } from 'nanoid';
import { usePricelistStore } from '../../store/pricelistStore';
import { usePanelIoStore } from '../../store/panelIoStore';
import type { ComponentLine } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { parseLenientFloat } from '../../utils/calcsheet/numberInput';
import {
  ANALOG_KINDS, PSU_LINES, SITOP_OPTIONS, TERMINALS_HEADER, WIRES_HEADER, noAnalog, siemensPrice,
  type AnalogKey, type SwitchType,
} from '../../utils/calcsheet/siemensPlc';
import {
  BMS_HEADER, BMS_SOFTWARE_HEADER, DEFAULT_DESIGO_INPUTS, DESIGO_PARTS, PXC_MODELS, configureDesigo, noProtocols,
  type DesigoControllerKey, type DesigoInputs, type DesigoProtocols, type DesigoSection,
} from '../../utils/calcsheet/desigoBms';
import type { PlcSubmitSection } from './SiemensPlcDialog';

// Siemens Desigo BMS configurator: I/O counts (analog by signal type) + the
// Desigo CC needs → PXC automation station(s), TX-I/O, power, switches,
// Desigo CC licenses and the WAGO terminal strip + wiring, added to
// B. Supply of Components under their own headers. Descriptions on the
// quotation are brand-neutral; the part number and brand keep their columns.

interface Props {
  open: boolean;
  onClose: () => void;
  productContingencyPct: number;
  onSubmit: (sections: PlcSubmitSection[]) => void;
}

const id = () => nanoid(6);
// Terminals + wiring now come from the Control Panel configurator (it gets this I/O via usePanelIoStore).
const fresh = (): DesigoInputs => ({ ...DEFAULT_DESIGO_INPUTS, analog: noAnalog(), protocols: noProtocols(), terminals: false });
const SECTION_ORDER: DesigoSection[] = ['plc', 'bmsSoftware', 'terminals', 'wiring'];
const SECTION_HEADER: Record<DesigoSection, string> = {
  plc: BMS_HEADER, bmsSoftware: BMS_SOFTWARE_HEADER, terminals: TERMINALS_HEADER, wiring: WIRES_HEADER,
};

export default function DesigoBmsDialog({ open, onClose, productContingencyPct, onSubmit }: Props) {
  const [inp, setInp] = useState<DesigoInputs>(fresh);
  const setPanelIo = usePanelIoStore((s) => s.setIo);
  const set = <K extends keyof DesigoInputs>(k: K, v: DesigoInputs[K]) => setInp((p) => ({ ...p, [k]: v }));

  const catalog = usePricelistStore((s) => s.items);
  const fetchCatalog = usePricelistStore((s) => s.fetchItems);
  useEffect(() => { if (open && catalog.length === 0) void fetchCatalog().catch(() => {}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = configureDesigo(inp);
  const rows = cfg.lines.map((l) => {
    const part = DESIGO_PARTS[l.key];
    const p = siemensPrice(part, catalog);
    return { ...l, part, unitCost: p.price, source: p.source, lineTotal: p.price * l.qty };
  });
  const total = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const inquiry = rows.filter((r) => r.unitCost === 0).length;
  const sections = SECTION_ORDER
    .map((sec) => ({ sec, header: SECTION_HEADER[sec], rows: rows.filter((r) => r.section === sec) }))
    .filter((g) => g.rows.length > 0);
  const ready = rows.length > 0;

  type NumKey = 'di' | 'do' | 'sparePct' | 'controllers' | 'integrationPoints' | 'dccClients' | 'dccWebClients' | 'switchQty' | 'panelW' | 'panelH';
  const num = (k: NumKey, label: string, helper?: string, placeholder = '0') => (
    <TextField
      label={label} size="small" fullWidth type="text" inputMode="numeric"
      value={inp[k] || (k === 'sparePct' ? '0' : '')} placeholder={placeholder} helperText={helper}
      onChange={(e) => set(k, Math.max(0, Math.round(parseLenientFloat(e.target.value))))}
      onFocus={(e) => e.target.select()}
    />
  );
  const analogNum = (k: AnalogKey, w: 'w2' | 'w4', label: string, fullName: string) => (
    <TextField
      label={label} size="small" fullWidth type="text" inputMode="numeric" inputProps={{ 'aria-label': fullName }}
      value={inp.analog[k][w] || ''} placeholder="0"
      onChange={(e) => {
        const v = Math.max(0, Math.round(parseLenientFloat(e.target.value)));
        setInp((p) => ({ ...p, analog: { ...p.analog, [k]: { ...p.analog[k], [w]: v } } }));
      }}
      onFocus={(e) => e.target.select()}
    />
  );

  const setProto = <K extends keyof DesigoProtocols>(k: K, v: DesigoProtocols[K]) => setInp((p) => ({ ...p, protocols: { ...p.protocols, [k]: v } }));
  const trunk = (k: 'mstp' | 'modbusRtu' | 'mbus' | 'p1', label: string) => (
    <Box sx={{ width: 140 }}>
      <TextField label={label} size="small" fullWidth type="text" inputMode="numeric" value={inp.protocols[k] || ''} placeholder="0" helperText="trunks"
        onChange={(e) => setProto(k, Math.max(0, Math.round(parseLenientFloat(e.target.value))))} onFocus={(e) => e.target.select()} />
    </Box>
  );

  const close = () => { setInp(fresh()); onClose(); };
  const submit = () => {
    onSubmit(sections.map((g) => ({
      header: g.header,
      rows: g.rows.map((r): ComponentLine => ({
        // Brand-neutral description on the quotation; the part number and brand keep their own columns.
        id: id(), code: '', description: r.part.generic || r.part.description, brand: r.part.brand ?? 'Siemens', partNo: r.part.partNo,
        qty: r.qty, uom: r.part.uom ?? 'pc', unitCost: r.unitCost, forex: 1,
        contingencyPct: productContingencyPct ?? 0, contingencyPctOverridden: false, discountPct: 0,
      })),
    })));
    setPanelIo(cfg.panelIo);
    setInp(fresh());
  };

  const psuItems = PSU_LINES.flatMap(({ line, label }) => [
    <ListSubheader key={line}>{label}</ListSubheader>,
    ...SITOP_OPTIONS.filter((s) => s.line === line).map((s) => (
      <MenuItem key={s.key} value={s.key}>{`${line} ${s.ratingA} A — ${s.partNo}`}</MenuItem>
    )),
  ]);

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>
        Siemens Desigo BMS
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Enter the I/O count — the PXC automation station, TX-I/O modules, power, switches, Desigo CC licenses and the terminals &amp;
          wiring are selected for you and added to B. Supply of Components. Items without a price go in at ₱0 for inquiry.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <TextField select label="Automation station" size="small" sx={{ minWidth: 260 }} value={inp.controller}
              onChange={(e) => set('controller', e.target.value as DesigoControllerKey)}
              helperText={inp.controller === 'auto' && cfg.controller ? `Auto: ${cfg.controller.model}` : ' '}>
              <MenuItem value="auto">Auto — smallest that fits</MenuItem>
              {PXC_MODELS.map((m) => <MenuItem key={m.key} value={m.key}>{m.model} — {m.partNo}</MenuItem>)}
            </TextField>
            <Box sx={{ width: 170 }}>
              {num('controllers', 'Stations', cfg.suggestedControllers ? `Suggested: ${cfg.suggestedControllers}` : 'Blank = auto', cfg.suggestedControllers ? `Auto (${cfg.suggestedControllers})` : 'Auto')}
            </Box>
            <Box sx={{ width: 130 }}>{num('di', 'DI (digital in)')}</Box>
            <Box sx={{ width: 130 }}>{num('do', 'DO (digital out)')}</Box>
            <Box sx={{ width: 110 }}>{num('sparePct', 'Spare %')}</Box>
          </Stack>

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Analog I/O by signal type</Typography></Divider>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(6, 1fr)' }, gap: 2 }}>
            {ANALOG_KINDS.map((k) => (
              <Stack key={k.key} spacing={1}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{k.label}</Typography>
                {analogNum(k.key, 'w2', '2-wire', `${k.label} 2-wire`)}
                {k.w4Label ? analogNum(k.key, 'w4', k.w4Label, `${k.label} ${k.w4Label}`) : null}
              </Stack>
            ))}
          </Box>

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Protocols / integration</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            {trunk('mstp', 'BACnet MS/TP')}
            {trunk('modbusRtu', 'Modbus RTU')}
            {trunk('mbus', 'M-Bus')}
            {trunk('p1', 'P1 (FLN)')}
            <FormControlLabel control={<Checkbox size="small" checked={inp.protocols.modbusTcp} onChange={(e) => setProto('modbusTcp', e.target.checked)} />}
              label={<Typography variant="body2">Modbus TCP</Typography>} />
            <FormControlLabel control={<Checkbox size="small" checked={inp.protocols.knx} onChange={(e) => setProto('knx', e.target.checked)} />}
              label={<Typography variant="body2">KNX</Typography>} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            BACnet/IP is always on. Each MS/TP, Modbus RTU or M-Bus trunk uses one RS-485 port (PXC4 / PXC5: 1, PXC7.E400S / M / L: 1 / 2 / 4) — the
            station is picked to have enough.
          </Typography>

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Desigo CC (management station)</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControlLabel
              control={<Checkbox size="small" checked={inp.dcc} onChange={(e) => set('dcc', e.target.checked)} />}
              label={<Typography variant="body2">Include Desigo CC licenses</Typography>}
            />
            {inp.dcc && (
              <>
                <Box sx={{ width: 150 }}>{num('integrationPoints', 'Integration points', 'Modbus / BACnet')}</Box>
                <Box sx={{ width: 120 }}>{num('dccClients', 'Clients', 'Installed')}</Box>
                <Box sx={{ width: 120 }}>{num('dccWebClients', 'Web clients')}</Box>
                <FormControlLabel control={<Checkbox size="small" checked={inp.dccRedundant} onChange={(e) => set('dccRedundant', e.target.checked)} />}
                  label={<Typography variant="body2">Redundant servers</Typography>} />
                <FormControlLabel control={<Checkbox size="small" checked={inp.dccHistory} onChange={(e) => set('dccHistory', e.target.checked)} />}
                  label={<Typography variant="body2">Long-term data logging</Typography>} />
                <FormControlLabel control={<Checkbox size="small" checked={inp.dccReports} onChange={(e) => set('dccReports', e.target.checked)} />}
                  label={<Typography variant="body2">Reports</Typography>} />
              </>
            )}
          </Stack>

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Network &amp; power</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Box sx={{ width: 120 }}>{num('switchQty', 'Switches')}</Box>
            <ToggleButtonGroup size="small" exclusive value={inp.switchType}
              onChange={(_, v: SwitchType | null) => v && set('switchType', v)}
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 2 } }}>
              <ToggleButton value="unmanaged">Unmanaged</ToggleButton>
              <ToggleButton value="managed">Managed</ToggleButton>
            </ToggleButtonGroup>
            <TextField select label="24 V DC supply (field devices)" size="small" sx={{ minWidth: 300 }} value={inp.psu} onChange={(e) => set('psu', e.target.value)}>
              <MenuItem value="none">None</MenuItem>
              {psuItems}
            </TextField>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Terminal blocks, relays and wiring are added with <strong>Control Panel</strong> — it picks up this I/O when you add these items.
          </Typography>

          {ready ? (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {cfg.points > 0 && <Chip size="small" variant="outlined" color="success" label={`${cfg.points} I/O points incl. spare · ${cfg.txPoints} on TX-I/O`} />}
                {cfg.modules > 0 && <Chip size="small" variant="outlined" label={`${cfg.modules} TX-I/O module${cfg.modules === 1 ? '' : 's'}`} />}
                {inp.dcc && cfg.dataPoints > 0 && <Chip size="small" variant="outlined" label={`${cfg.dataPoints} Desigo CC data points`} />}
                {cfg.wiring && <Chip size="small" variant="outlined" label={`${cfg.wiring.terminals} terminals · ${(cfg.wiring.railMm / 1000).toFixed(1)} m DIN rail`} />}
              </Stack>
              {cfg.notes.map((n) => <Alert key={n} severity="info" sx={{ py: 0 }}>{n}</Alert>)}

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
                          {r.part.partNo || <Typography variant="body2" color="warning.main">Ask supplier</Typography>}
                          {r.part.partNo && r.part.verify && r.source !== 'catalog' && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'inherit' }}>verify P/N</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{r.part.generic || r.part.description}</Typography>
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
                  {inquiry} item{inquiry === 1 ? '' : 's'} for inquiry — added at ₱0. When the supplier quotes, add the price in Sales → Pricelists
                  (same part number, so it&apos;s used next time) or on the row.
                </Alert>
              )}
            </>
          ) : (
            <Alert severity="info">Enter the I/O count (or tick the Desigo CC licenses) to see the items.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!ready}>
          Add {rows.length} item{rows.length === 1 ? '' : 's'} · {PHP(total)} to Components
        </Button>
      </DialogActions>
    </Dialog>
  );
}
