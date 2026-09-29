import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  ListSubheader, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { nanoid } from 'nanoid';
import { usePricelistStore } from '../../store/pricelistStore';
import type { ComponentLine } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { parseLenientFloat } from '../../utils/calcsheet/numberInput';
import {
  ANALOG_KINDS, DEFAULT_CPU, DEFAULT_PLC_INPUTS, DEFAULT_REDUNDANT_CPU, HMI_LINES, HMI_PANELS, LICENSE_EDITIONS, MEMORY_CARDS, PSU_LINES,
  REDUNDANCY_OPTIONS, SIEMENS_PARTS, UNIFIED_LOGGING_PACKAGES, WINCC81_ARCHIVE_PACKAGES, SITOP_OPTIONS, SWITCHES, TERMINALS_HEADER, WIRES_HEADER, UNIFIED_PC_PACKAGES, WINCC81_PACKAGES, configurePlc, cpuChoices, cpuModel,
  effectiveSwitches, estimate24V, noAnalog, onboardText, siemensPrice,
  type AnalogKey, type HmiLine, type PlcSection, type LicenseEdition, type ModbusMode, type PlcFamily, type PlcInputs, type Redundancy, type ScadaKind,
  type SwitchType, type WinccLicense,
} from '../../utils/calcsheet/siemensPlc';

// Siemens PLC configurator: I/O counts (analog by signal type and wiring) +
// PLC family/CPU/redundancy + Modbus + network (+ HMI, SCADA license, 24 V
// supply, WAGO terminals & wiring) → the module list, priced where we have a
// quote or a pricelist item, added to B. Supply of Components under a
// "PLC — SIEMENS …" header. Unpriced items go in at ₱0 marked "for inquiry".

export interface PlcSubmitSection { header: string; rows: ComponentLine[] }

interface Props {
  open: boolean;
  onClose: () => void;
  productContingencyPct: number;
  /** One entry per Section B header (PLC, terminal blocks & relays, wires), in that order; empty ones left out. */
  onSubmit: (sections: PlcSubmitSection[]) => void;
}

const id = () => nanoid(6);

const fresh = (): PlcInputs => ({ ...DEFAULT_PLC_INPUTS, analog: noAnalog() });

export default function SiemensPlcDialog({ open, onClose, productContingencyPct, onSubmit }: Props) {
  const [inp, setInp] = useState<PlcInputs>(fresh);
  const set = <K extends keyof PlcInputs>(k: K, v: PlcInputs[K]) => setInp((p) => ({ ...p, [k]: v }));

  const catalog = usePricelistStore((s) => s.items);
  const fetchCatalog = usePricelistStore((s) => s.fetchItems);
  useEffect(() => { if (open && catalog.length === 0) void fetchCatalog().catch(() => {}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = configurePlc(inp);
  const load = estimate24V(inp, cfg);
  const redundant = inp.redundancy !== 'none';
  const cpu = cpuModel(inp.family, inp.cpu, inp.redundancy);
  const psu = SITOP_OPTIONS.find((s) => s.key === inp.sitop);
  const psuA = psu ? psu.ratingA : null;
  const panel = HMI_PANELS.find((h) => h.key === inp.hmi);
  const [showLoad, setShowLoad] = useState(false);
  const is1200 = inp.family === 'S7-1200' && !redundant;
  const analogTotal = ANALOG_KINDS.reduce((s, k) => s + inp.analog[k.key].w2 + inp.analog[k.key].w4, 0);
  const hasIo = inp.di + inp.do + analogTotal > 0;
  const sw = effectiveSwitches(inp);
  const ready = hasIo || inp.modbus === 'rtu' || !!panel || inp.scada !== 'none' || sw.qty > 0 || redundant;
  const rows = cfg.lines.map((l) => {
    const part = SIEMENS_PARTS[l.key];
    const p = siemensPrice(part, catalog);
    return { ...l, part, unitCost: p.price, source: p.source, lineTotal: p.price * l.qty };
  });
  const total = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const inquiry = rows.filter((r) => r.unitCost === 0).length;
  const header = `PLC — SIEMENS ${redundant ? `S7-1500${inp.redundancy}` : inp.family}`;
  const SECTION_HEADER: Record<PlcSection, string> = { plc: header, terminals: TERMINALS_HEADER, wiring: WIRES_HEADER };
  const sections = (['plc', 'terminals', 'wiring'] as PlcSection[])
    .map((sec) => ({ sec, header: SECTION_HEADER[sec], rows: rows.filter((r) => r.section === sec) }))
    .filter((g) => g.rows.length > 0);

  const dec = (k: 'doLoadA' | 'psuMarginPct', label: string, helper?: string) => (
    <TextField
      label={label} size="small" fullWidth type="text" inputMode="decimal" value={String(inp[k])} helperText={helper}
      onChange={(e) => set(k, Math.max(0, parseLenientFloat(e.target.value)))}
      onFocus={(e) => e.target.select()}
    />
  );
  const num = (k: 'di' | 'do' | 'sparePct' | 'modbusPorts' | 'hmiQty' | 'scadaQty' | 'scadaClients' | 'switchQty' | 'panelW' | 'panelH', label: string, helper?: string) => (
    <TextField
      label={label} size="small" fullWidth type="text" inputMode="numeric"
      value={inp[k] || (k === 'sparePct' ? '0' : '')} placeholder="0" helperText={helper}
      onChange={(e) => set(k, Math.max(0, Math.round(parseLenientFloat(e.target.value))))}
      onFocus={(e) => e.target.select()}
    />
  );
  // Short visible label (the column header names the signal); the full name is the accessible one.
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

  const setFamily = (family: PlcFamily) => setInp((p) => ({ ...p, family, cpu: DEFAULT_CPU[family] }));
  // Redundancy is S7-1500 only; switching it resets the CPU to that mode's default.
  const setRedundancy = (redundancy: Redundancy) => setInp((p) => {
    const family: PlcFamily = redundancy === 'none' ? p.family : 'S7-1500';
    return { ...p, redundancy, family, cpu: redundancy === 'none' ? DEFAULT_CPU[family] : DEFAULT_REDUNDANT_CPU[redundancy] };
  });
  const setHmiLine = (line: HmiLine | 'none') => set('hmi', line === 'none' ? 'none'
    : (HMI_PANELS.find((h) => h.line === line && h.sizeIn === 7) ?? HMI_PANELS.find((h) => h.line === line))!.key);
  const setScada = (kind: ScadaKind) => setInp((p) => ({
    ...p, scada: kind, scadaPackage: kind === 'unifiedPc' ? '1k' : '2048', scadaLogging: 'none',
    licenseEdition: kind === 'unifiedPc' && p.licenseEdition === 'dl' ? 'standard' : p.licenseEdition,
  }));

  const close = () => { setInp(fresh()); onClose(); };
  const submit = () => {
    onSubmit(sections.map((g) => ({
      header: g.header,
      rows: g.rows.map((r): ComponentLine => ({
        id: id(), code: '', description: r.part.description, brand: r.part.brand ?? 'Siemens', partNo: r.part.partNo,
        qty: r.qty, uom: r.part.uom ?? 'pc', unitCost: r.unitCost, forex: 1,
        contingencyPct: productContingencyPct ?? 0, contingencyPctOverridden: false, discountPct: 0,
      })),
    })));
    setInp(fresh());
  };

  const psuItems = PSU_LINES.flatMap(({ line, label }) => {
    const opts = SITOP_OPTIONS.filter((s) => s.line === line);
    return [
      <ListSubheader key={line}>{label} · {opts[0].input.split(' ')[0]}</ListSubheader>,
      ...opts.map((s) => {
        const priced = siemensPrice(SIEMENS_PARTS[s.key], catalog).price > 0;
        const tag = s.ratingA < load.withMarginA ? ' · too small' : s.ratingA === load.suggestedA ? ' · suggested' : '';
        return (
          <MenuItem key={s.key} value={s.key} sx={{ color: s.ratingA < load.withMarginA ? 'text.disabled' : undefined }}>
            {`${line} ${s.ratingA} A — ${s.partNo}${priced ? '' : ' · for inquiry'}${tag}`}
          </MenuItem>
        );
      }),
    ];
  });

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>
        Siemens PLC
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Enter the I/O count and pick the PLC — the CPU, ET 200SP remote I/O, BaseUnits, Modbus hardware, switches, HMI, SCADA
          license, 24 V supply and the WAGO terminals &amp; wiring are selected for you and added to B. Supply of Components. Items
          without a price go in at ₱0 for inquiry.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup
              size="small" exclusive value={redundant ? 'S7-1500' : inp.family}
              onChange={(_, v: PlcFamily | null) => v && setFamily(v)}
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 2 } }}
            >
              <ToggleButton value="S7-1200" disabled={redundant}>S7-1200</ToggleButton>
              <ToggleButton value="S7-1500">S7-1500</ToggleButton>
            </ToggleButtonGroup>
            <TextField select label="Redundancy" size="small" sx={{ minWidth: 220 }} value={inp.redundancy} onChange={(e) => setRedundancy(e.target.value as Redundancy)}>
              {REDUNDANCY_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <TextField select label="CPU" size="small" sx={{ minWidth: 280 }} value={cpu.key} onChange={(e) => set('cpu', e.target.value)}>
              {cpuChoices(inp.family, inp.redundancy).map((m) => (
                <MenuItem key={m.key} value={m.key}>
                  {m.label}{SIEMENS_PARTS[m.key].price > 0 ? '' : ' · for inquiry'}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="caption" color="text.secondary">
              {SIEMENS_PARTS[cpu.key].partNo} · {redundant
                ? `${cpu.redundancy === 'H' ? 'bundle of 2 CPUs + sync modules' : '2 CPUs'}; ET 200SP on IM 155-6 PN/2 HF; managed switches`
                : `${onboardText(cpu)}${is1200 ? '; the rest on ET 200SP' : '; memory card required'}`}
            </Typography>
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            {num('di', 'DI (digital in)')}
            {num('do', 'DO (digital out)')}
            {num('sparePct', 'Spare %', 'Added to each I/O type')}
          </Box>

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
          {is1200 && cpu.onboard.ai > 0 && (
            <Typography variant="caption" color="text.secondary">
              The CPU&apos;s {cpu.onboard.ai} on-board AI take 0–10 V inputs first{cpu.onboard.ao ? `; its ${cpu.onboard.ao} on-board AQ take 4–20 mA outputs` : ''}.
            </Typography>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.4fr 0.8fr 1.2fr' }, gap: 2 }}>
            <TextField select label="Modbus" size="small" fullWidth value={inp.modbus} onChange={(e) => set('modbus', e.target.value as ModbusMode)}>
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="tcp">Modbus TCP (Ethernet — built in)</MenuItem>
              <MenuItem value="rtu">Modbus RTU (RS-485)</MenuItem>
            </TextField>
            {inp.modbus === 'rtu' ? num('modbusPorts', 'RS-485 ports', is1200 ? '1st on CB 1241' : 'CM PtP each') : <Box />}
            {!is1200 || inp.memoryCard ? (
              <TextField select label="Memory card" size="small" fullWidth value={inp.memCard} onChange={(e) => set('memCard', e.target.value)}>
                {MEMORY_CARDS.map((c) => (
                  <MenuItem key={c.key} value={c.key}>{c.label}{SIEMENS_PARTS[c.key].price > 0 ? '' : ' · for inquiry'}</MenuItem>
                ))}
              </TextField>
            ) : <Box />}
          </Box>
          {is1200 && (
            <FormControlLabel
              control={<Checkbox size="small" checked={inp.memoryCard} onChange={(e) => set('memoryCard', e.target.checked)} />}
              label={<Typography variant="body2">Include memory card</Typography>}
            />
          )}

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Network switches</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Box sx={{ width: 140 }}>{num('switchQty', 'Switches', redundant ? 'Min. 2 for redundancy' : undefined)}</Box>
            <ToggleButtonGroup
              size="small" exclusive value={sw.type}
              onChange={(_, v: SwitchType | null) => v && set('switchType', v)}
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 2 } }}
            >
              <ToggleButton value="unmanaged" disabled={redundant}>Unmanaged</ToggleButton>
              <ToggleButton value="managed">Managed</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary">
              {cfg.network.switchKey
                ? `${sw.qty} × ${SWITCHES.find((s) => s.key === cfg.network.switchKey)?.model} — ${cfg.network.devices} device${cfg.network.devices === 1 ? '' : 's'} on the network`
                : 'Enter how many switches — the model is picked from the ports needed'}
            </Typography>
          </Stack>

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">HMI &amp; SCADA</Typography></Divider>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1.5fr 1.5fr 0.6fr' }, gap: 2 }}>
            <TextField select label="HMI panel" size="small" fullWidth value={panel?.line ?? 'none'} onChange={(e) => setHmiLine(e.target.value as HmiLine | 'none')}>
              <MenuItem value="none">None</MenuItem>
              {HMI_LINES.map((l) => <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>)}
            </TextField>
            {panel ? (
              <TextField select label="HMI size" size="small" fullWidth value={panel.key} onChange={(e) => set('hmi', e.target.value)}>
                {HMI_PANELS.filter((h) => h.line === panel.line).map((h) => (
                  <MenuItem key={h.key} value={h.key}>{h.sizeIn}&quot; — {h.model}{SIEMENS_PARTS[h.key].price > 0 ? '' : ' · for inquiry'}</MenuItem>
                ))}
              </TextField>
            ) : <Box />}
            {panel ? num('hmiQty', 'HMI qty') : <Box />}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1.4fr 1fr 0.8fr 0.9fr 0.6fr' }, gap: 2 }}>
            <TextField select label="SCADA license" size="small" fullWidth value={inp.scada} onChange={(e) => setScada(e.target.value as ScadaKind)}>
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="wincc81">WinCC V8.1 (SCADA)</MenuItem>
              <MenuItem value="unifiedPc">WinCC Unified PC Runtime</MenuItem>
            </TextField>
            {inp.scada === 'wincc81' ? (
              <TextField select label="License type" size="small" fullWidth value={inp.winccLicense} onChange={(e) => set('winccLicense', e.target.value as WinccLicense)}>
                <MenuItem value="RC">RC — Runtime &amp; Configuration</MenuItem>
                <MenuItem value="RT">RT — Runtime only</MenuItem>
              </TextField>
            ) : <Box />}
            {inp.scada !== 'none' ? (
              <TextField select label="PowerTags" size="small" fullWidth value={inp.scadaPackage} onChange={(e) => set('scadaPackage', e.target.value)}>
                {(inp.scada === 'wincc81' ? WINCC81_PACKAGES : UNIFIED_PC_PACKAGES).map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </TextField>
            ) : <Box />}
            {inp.scada !== 'none' ? (
              <TextField select label="Edition" size="small" fullWidth value={inp.licenseEdition} onChange={(e) => set('licenseEdition', e.target.value as LicenseEdition)}>
                {LICENSE_EDITIONS.filter((ed) => inp.scada === 'wincc81' || !ed.wincc81Only).map((ed) => (
                  <MenuItem key={ed.value} value={ed.value}>{ed.label}</MenuItem>
                ))}
              </TextField>
            ) : <Box />}
            {inp.scada !== 'none' ? num('scadaQty', inp.scadaRedundant ? 'Server pairs' : 'Servers') : <Box />}
          </Box>
          {inp.scada !== 'none' && (
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Box sx={{ width: 120 }}>{num('scadaClients', 'Clients', inp.scada === 'unifiedPc' ? 'Operate clients' : 'RT Client stations')}</Box>
              <TextField select label="Data logging" size="small" sx={{ minWidth: 220 }} value={inp.scadaLogging} onChange={(e) => set('scadaLogging', e.target.value)}
                helperText={inp.scada === 'wincc81' ? '512 archive tags included' : 'Logging tags per server'}>
                <MenuItem value="none">{inp.scada === 'wincc81' ? 'Base only (512 archive tags)' : 'None'}</MenuItem>
                {(inp.scada === 'wincc81' ? WINCC81_ARCHIVE_PACKAGES : UNIFIED_LOGGING_PACKAGES).map((p) => (
                  <MenuItem key={p} value={p}>{inp.scada === 'wincc81' ? `Archive ${p} tags` : `Logging tags (${p})`}</MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={<Checkbox size="small" checked={inp.scadaRedundant} onChange={(e) => set('scadaRedundant', e.target.checked)} />}
                label={<Typography variant="body2">Redundant servers</Typography>}
              />
              {inp.scada === 'unifiedPc' && (
                <FormControlLabel
                  control={<Checkbox size="small" checked={inp.scadaDbStorage} onChange={(e) => set('scadaDbStorage', e.target.checked)} />}
                  label={<Typography variant="body2">Database Storage (SQL logging)</Typography>}
                />
              )}
            </Stack>
          )}

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Terminals &amp; wiring (WAGO)</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControlLabel
              control={<Checkbox size="small" checked={inp.terminals} onChange={(e) => set('terminals', e.target.checked)} />}
              label={<Typography variant="body2">Add terminals, relays, accessories &amp; 0.5 mm² wiring</Typography>}
            />
            {inp.terminals && (
              <>
                <Box sx={{ width: 130 }}>{num('panelW', 'Panel width (mm)')}</Box>
                <Box sx={{ width: 130 }}>{num('panelH', 'Panel height (mm)')}</Box>
              </>
            )}
          </Stack>
          {inp.terminals && (
            <Typography variant="caption" color="text.secondary">
              1 DI = 2-level terminal · 1 DO = slim relay (WAGO 857-304) · analog 2-wire = 1 fused + 1 standard, 4-wire = 2 fused + 2 standard ·
              red 0.5 mm² for +24 V DC, blue for 0 V DC, length from the panel size.
            </Typography>
          )}

          {ready ? (
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
                {cfg.wiring && (
                  <>
                    <Chip size="small" variant="outlined" label={`${cfg.wiring.terminals} terminals · ${(cfg.wiring.railMm / 1000).toFixed(1)} m DIN rail`} />
                    <Chip size="small" variant="outlined" sx={{ borderColor: 'error.main' }} label={`Red 0.5 mm²: ${cfg.wiring.redWires} wires ≈ ${cfg.wiring.redM} m`} />
                    <Chip size="small" variant="outlined" sx={{ borderColor: 'primary.main' }} label={`Blue 0.5 mm²: ${cfg.wiring.blueWires} wires ≈ ${cfg.wiring.blueM} m`} />
                  </>
                )}
              </Stack>
              {cfg.notes.map((n) => <Alert key={n} severity="info" sx={{ py: 0 }}>{n}</Alert>)}

              {/* 24 V DC load → pick the SITOP by hand */}
              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">24 V DC power supply</Typography></Divider>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                <Stack direction="row" spacing={3} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Estimated load</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{load.totalA.toFixed(2)} A</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>With {inp.psuMarginPct}% margin</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{load.withMarginA.toFixed(2)} A</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Suggested supply</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3, color: load.suggestedA ? 'success.main' : 'error.main' }}>
                      {load.suggestedA ? `${load.suggestedA} A` : 'over 40 A — split supplies'}
                    </Typography>
                  </Box>
                  <Box sx={{ flexGrow: 1 }} />
                  <Box sx={{ width: 150 }}>{dec('doLoadA', 'Load per DO (A)', 'Relay / pilot ≈ 0.1')}</Box>
                  <Box sx={{ width: 110 }}>{dec('psuMarginPct', 'Margin %')}</Box>
                </Stack>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                  <TextField select label="Power supply" size="small" sx={{ minWidth: 340 }} value={inp.sitop} onChange={(e) => set('sitop', e.target.value)}>
                    <MenuItem value="none">None — I&apos;ll add it myself</MenuItem>
                    {psuItems}
                  </TextField>
                  {psuA === null ? (
                    <Typography variant="body2" color="warning.main">No power supply selected — pick one for {load.withMarginA.toFixed(1)} A or more.</Typography>
                  ) : psuA < load.withMarginA ? (
                    <Typography variant="body2" color="error.main">{psuA} A is below the {load.withMarginA.toFixed(1)} A needed — pick a {load.suggestedA ?? 40}+ A supply.</Typography>
                  ) : (
                    <Typography variant="body2" color="success.main">{psuA} A covers {load.withMarginA.toFixed(1)} A ({Math.round((load.withMarginA / psuA) * 100)}% loaded).</Typography>
                  )}
                  <Box sx={{ flexGrow: 1 }} />
                  <Button size="small" onClick={() => setShowLoad((v) => !v)}>{showLoad ? 'Hide breakdown' : 'Show breakdown'}</Button>
                </Stack>
                {showLoad && (
                  <Table size="small" sx={{ mt: 1 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Load</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell align="right">Each (A)</TableCell>
                        <TableCell align="right">Total (A)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {load.lines.map((l) => (
                        <TableRow key={l.label}>
                          <TableCell>{l.label}</TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{l.qty}</TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{l.eachA}</TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{l.totalA.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Typical draws: CPU, interface module and HMI per Siemens datasheets; module electronics and field loads (10 mA per DI, 20 mA
                  per analog loop, the DO load above) are planning figures — adjust the DO load for solenoids or heavier devices.
                </Typography>
              </Box>

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
                  {sections.flatMap((g) => [
                    ...(sections.length > 1 ? [(
                      <TableRow key={`h-${g.sec}`}>
                        <TableCell colSpan={5} sx={{ fontWeight: 700, bgcolor: 'action.hover', py: 0.5 }}>{g.header}</TableCell>
                      </TableRow>
                    )] : []),
                    ...g.rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {r.part.partNo || <Typography variant="body2" color="warning.main">Ask supplier</Typography>}
                        {r.part.partNo && r.part.verify && r.source !== 'catalog' && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'inherit' }}>verify P/N</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{r.part.description.split(', ').slice(0, 3).join(', ')}</Typography>
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
                  (same part number, so it&apos;s used next time) or on the row. Siemens part numbers were checked in the TIA Selection Tool;
                  &quot;verify P/N&quot; ones still need confirming with the supplier.
                </Alert>
              )}
            </>
          ) : (
            <Alert severity="info">Enter the I/O count (or pick an HMI / SCADA license) to see the modules.</Alert>
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
