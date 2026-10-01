import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  ListSubheader, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import { nanoid } from 'nanoid';
import { usePricelistStore } from '../../store/pricelistStore';
import { usePanelIoStore } from '../../store/panelIoStore';
import type { ComponentLine } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { parseLenientFloat } from '../../utils/calcsheet/numberInput';
import {
  ANALOG_KINDS, DEFAULT_CPU, DEFAULT_PLC_INPUTS, DEFAULT_REDUNDANT_CPU, HMI_LINES, HMI_PANELS, LICENSE_EDITIONS, MEMORY_CARDS, PSU_LINES,
  REDUNDANCY_OPTIONS, SIEMENS_PARTS, UNIFIED_LOGGING_PACKAGES, WINCC81_ARCHIVE_PACKAGES, SITOP_OPTIONS, SWITCHES, TERMINALS_HEADER, WIRES_HEADER, UNIFIED_PC_PACKAGES, WINCC81_PACKAGES, configurePlc, cpuChoices, panelHeat, cpuModel, tagPackageSize,
  ET200SP_GROUP_MAX_A, effectiveSwitches, estimate24V, noAnalog, onboardText, psuQtyFor, siemensPrice,
  type AnalogKey, type HmiLine, type PlcSection, type LicenseEdition, type ModbusMode, type PlcFamily, type PlcInputs, type Redundancy, type ScadaKind,
  type SwitchType, type WinccLicense,
} from '../../utils/calcsheet/siemensPlc';

// Siemens PLC configurator: I/O counts (analog by signal type and wiring) +
// PLC family/CPU/redundancy + Modbus + network (+ HMI, SCADA license, 24 V
// supply, WAGO terminals & wiring) → the module list, priced where we have a
// quote or a pricelist item, added to B. Supply of Components under a
// "PLC — SIEMENS …" header. Unpriced items go in at ₱0 marked "for inquiry".

export interface PlcSubmitSection { header: string; rows: ComponentLine[] }

/** Part no. and unit price columns fold into the item cell on phones. */
const HIDE_ON_PHONE = { display: { xs: 'none', sm: 'table-cell' } } as const;

interface Props {
  open: boolean;
  onClose: () => void;
  productContingencyPct: number;
  /** One entry per Section B header (PLC, terminal blocks & relays, wires), in that order; empty ones left out. */
  onSubmit: (sections: PlcSubmitSection[]) => void;
}

const id = () => nanoid(6);

// Terminals + wiring now come from the Control Panel configurator (it gets this I/O via usePanelIoStore).
// The dialog starts on the optimizing defaults: auto CPU, cheapest module sizes, S7-1200 local expansion
// when it fits, auto memory card.
const fresh = (): PlcInputs => ({
  ...DEFAULT_PLC_INPUTS, analog: noAnalog(), terminals: false, cpu: 'auto', expansion: 'auto', moduleSizes: 'auto', memCard: 'auto', pnCabling: true, scadaPackage: 'auto',
});

export default function SiemensPlcDialog({ open, onClose, productContingencyPct, onSubmit }: Props) {
  // Phones: full-screen dialog, fields stack two per row, tables scroll sideways.
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [inp, setInp] = useState<PlcInputs>(fresh);
  const setPanelIo = usePanelIoStore((s) => s.setIo);
  const set = <K extends keyof PlcInputs>(k: K, v: PlcInputs[K]) => setInp((p) => ({ ...p, [k]: v }));

  const catalog = usePricelistStore((s) => s.items);
  const fetchCatalog = usePricelistStore((s) => s.fetchItems);
  useEffect(() => { if (open && catalog.length === 0) void fetchCatalog().catch(() => {}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = configurePlc(inp, (key) => (SIEMENS_PARTS[key] ? siemensPrice(SIEMENS_PARTS[key], catalog).price : 0));
  const load = estimate24V(inp, cfg);
  const redundant = inp.redundancy !== 'none';
  const cpu = cpuModel(inp.family, cfg.cpuKey, inp.redundancy);
  const psu = SITOP_OPTIONS.find((s) => s.key === inp.sitop);
  const psuA = psu ? psu.ratingA : null;
  const psuQty = Math.max(1, Math.round(inp.psuQty || 1));
  const psuNeeded = psuA ? psuQtyFor(psuA, load.withMarginA) : 1;
  const psuSet = (n: number) => `${n > 1 ? `${n} × ` : ''}${psuA} A${n > 1 ? ` = ${n * (psuA ?? 0)} A` : ''}`;
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

  const dec = (k: 'doLoadA' | 'psuMarginPct' | 'tagsPerPoint', label: string, helper?: string) => (
    <TextField
      label={label} size="small" fullWidth type="text" inputMode="decimal" value={String(inp[k])} helperText={helper}
      onChange={(e) => set(k, Math.max(0, parseLenientFloat(e.target.value)))}
      onFocus={(e) => e.target.select()}
    />
  );
  const num = (k: 'di' | 'do' | 'sparePct' | 'modbusPorts' | 'hmiQty' | 'scadaQty' | 'scadaClients' | 'switchQty' | 'panelW' | 'panelH' | 'upsMinutes' | 'pnFieldLinks' | 'pnFieldM' | 'extraTags', label: string, helper?: string) => (
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

  const setFamily = (family: PlcFamily) => setInp((p) => ({ ...p, family, cpu: p.cpu === 'auto' ? 'auto' : DEFAULT_CPU[family] }));
  // Redundancy is S7-1500 only; switching it resets the CPU to that mode's default.
  const setRedundancy = (redundancy: Redundancy) => setInp((p) => {
    const family: PlcFamily = redundancy === 'none' ? p.family : 'S7-1500';
    return { ...p, redundancy, family, cpu: p.cpu === 'auto' ? 'auto' : redundancy === 'none' ? DEFAULT_CPU[family] : DEFAULT_REDUNDANT_CPU[redundancy] };
  });
  const setHmiLine = (line: HmiLine | 'none') => set('hmi', line === 'none' ? 'none'
    : (HMI_PANELS.find((h) => h.line === line && h.sizeIn === 7) ?? HMI_PANELS.find((h) => h.line === line))!.key);
  const setScada = (kind: ScadaKind) => setInp((p) => ({
    ...p, scada: kind, scadaPackage: 'auto', scadaLogging: 'none',
    licenseEdition: kind === 'unifiedPc' && p.licenseEdition === 'dl' ? 'standard' : p.licenseEdition,
  }));

  const close = () => { setInp(fresh()); onClose(); };
  const submit = () => {
    onSubmit(sections.map((g) => ({
      header: g.header,
      rows: g.rows.map((r): ComponentLine => ({
        // Brand-neutral description on the quotation; the part number keeps its own column.
        id: id(), code: '', description: r.part.generic || r.part.description, brand: r.part.brand ?? 'Siemens', partNo: r.part.partNo,
        qty: r.qty, uom: r.part.uom ?? 'pc', unitCost: r.unitCost, forex: 1,
        contingencyPct: productContingencyPct ?? 0, contingencyPctOverridden: false, discountPct: 0,
      })),
    })));
    setPanelIo({ ...cfg.panelIo, ...panelHeat(load) });
    setInp(fresh());
  };

  const psuItems = PSU_LINES.flatMap(({ line, label }) => {
    const opts = SITOP_OPTIONS.filter((s) => s.line === line);
    return [
      <ListSubheader key={line}>{label} · {opts[0].input.split(' ')[0]}</ListSubheader>,
      ...opts.map((s) => {
        const priced = siemensPrice(SIEMENS_PARTS[s.key], catalog).price > 0;
        // Too small alone → how many it takes, so a smaller model can still be picked in quantity.
        const tag = s.ratingA < load.withMarginA ? ` · needs ${psuQtyFor(s.ratingA, load.withMarginA)} pcs`
          : s.ratingA === load.suggestedA ? ' · suggested' : '';
        return (
          <MenuItem key={s.key} value={s.key}>
            {`${line} ${s.ratingA} A — ${s.partNo}${priced ? '' : ' · for inquiry'}${tag}`}
          </MenuItem>
        );
      }),
    ];
  });

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth fullScreen={fullScreen} sx={{ '& .MuiDivider-wrapper': { whiteSpace: 'normal' } }}>
      <DialogTitle>
        Siemens PLC
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: { xs: 'none', sm: 'block' } }}>
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
            <TextField select label="Redundancy" size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }} value={inp.redundancy} onChange={(e) => setRedundancy(e.target.value as Redundancy)}>
              {REDUNDANCY_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <TextField select label="CPU" size="small" sx={{ minWidth: { xs: '100%', sm: 280 } }} value={inp.cpu === 'auto' ? 'auto' : cpu.key} onChange={(e) => set('cpu', e.target.value)}
              helperText={inp.cpu === 'auto' ? `Auto: ${cpu.label}` : ' '}>
              <MenuItem value="auto">Auto — lowest-cost fit</MenuItem>
              {cpuChoices(inp.family, inp.redundancy).map((m) => (
                <MenuItem key={m.key} value={m.key}>
                  {m.label}{SIEMENS_PARTS[m.key].price > 0 ? '' : ' · for inquiry'}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="caption" color="text.secondary">
              {SIEMENS_PARTS[cpu.key].partNo} · {redundant
                ? `${cpu.redundancy === 'H' ? 'bundle of 2 CPUs + sync modules' : '2 CPUs'}; ET 200SP on IM 155-6 PN/2 HF; managed switches`
                : `${onboardText(cpu)}${is1200 ? (cfg.expansion === 'local' ? '; the rest on signal modules' : '; the rest on ET 200SP') : `; ${cfg.expansion === 'local' ? 'I/O on the CPU rack' : 'I/O on ET 200SP'}; memory card required`}`}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            {is1200 && (
              <TextField select label="I/O expansion" size="small" sx={{ minWidth: { xs: '100%', sm: 250 } }} value={inp.expansion} onChange={(e) => set('expansion', e.target.value as PlcInputs['expansion'])}
                helperText={inp.expansion === 'auto' ? `Auto: ${cfg.expansion === 'local' ? `signal modules on the CPU (${cfg.local?.modules ?? 0} of ${cfg.local?.slots ?? 0} slots)` : cfg.expansion === 'et200sp' ? 'ET 200SP' : 'on-board only'}` : ' '}>
                <MenuItem value="auto">Auto — on the CPU when it fits</MenuItem>
                <MenuItem value="local">Signal modules on the CPU (SM 12xx)</MenuItem>
                <MenuItem value="et200sp">ET 200SP remote I/O</MenuItem>
              </TextField>
            )}
            {!is1200 && !redundant && (
              <TextField select label="I/O expansion" size="small" sx={{ minWidth: { xs: '100%', sm: 250 } }} value={inp.expansion === 'local' ? 'local' : 'et200sp'}
                onChange={(e) => set('expansion', e.target.value as PlcInputs['expansion'])}
                helperText={cfg.central && !cfg.central.fallback
                  ? `${cfg.central.modules} of ${cfg.central.slots} slots · ${cfg.central.powerW} W backplane${cfg.central.ps ? ` (+ PS ${cfg.central.ps === 'c1500ps25' ? '25' : '60'} W)` : ''}`
                  : cfg.central?.fallback ? 'Doesn\'t fit the rack — ET 200SP used' : ' '}>
                <MenuItem value="et200sp">ET 200SP remote I/O</MenuItem>
                <MenuItem value="local">Central I/O on the CPU rack (S7-1500 modules)</MenuItem>
              </TextField>
            )}
            <TextField select label="Module sizes" size="small" sx={{ minWidth: { xs: '100%', sm: 230 } }} value={inp.moduleSizes} onChange={(e) => set('moduleSizes', e.target.value as PlcInputs['moduleSizes'])}
              helperText=" ">
              <MenuItem value="auto">Cheapest mix (8/16 DI·DQ, 4/8 AI, 2/4 AQ)</MenuItem>
              <MenuItem value="standard">Standard only (DI16 / DQ16 / AI8 / AQ4)</MenuItem>
            </TextField>
            {inp.cpu === 'auto' && inp.redundancy === 'none' && (
              <FormControlLabel control={<Checkbox size="small" checked={inp.failSafe} onChange={(e) => set('failSafe', e.target.checked)} />}
                label={<Typography variant="body2">Fail-safe CPU (F)</Typography>} />
            )}
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
                <MenuItem value="auto">{`Auto (${is1200 ? '4 MB' : '24 MB'})`}</MenuItem>
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

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              label="ET 200SP stations (IM)" size="small" sx={{ width: { xs: '100%', sm: 190 } }} type="text" inputMode="numeric"
              value={inp.imStations || ''} placeholder={`Auto (${cfg.suggestedStations})`}
              helperText={cfg.suggestedStations > 0 ? `Suggested: ${cfg.suggestedStations} — more for a separate IM per area` : 'Blank = auto'}
              onChange={(e) => set('imStations', Math.max(0, Math.round(parseLenientFloat(e.target.value))))}
              onFocus={(e) => e.target.select()}
            />
            {cfg.stations > 0 && (
              <Typography variant="caption" color="text.secondary">
                Using {cfg.stations} station{cfg.stations === 1 ? '' : 's'} for {cfg.ioModules} module{cfg.ioModules === 1 ? '' : 's'}
                {' '}(max {redundant ? 64 : 32} per {redundant ? 'IM 155-6 PN/2 HF' : 'IM 155-6 PN ST'}) · {cfg.potentialGroups} potential
                group{cfg.potentialGroups === 1 ? '' : 's'} (light BaseUnits, max {ET200SP_GROUP_MAX_A} A each).
              </Typography>
            )}
            {cfg.stations > 0 && inp.do > 0 && (
              <FormControlLabel
                control={<Checkbox size="small" checked={inp.dqOwnGroup} onChange={(e) => set('dqOwnGroup', e.target.checked)} />}
                label={<Typography variant="body2">DQ outputs on their own 24 V group (e.g. cut by the E-stop)</Typography>}
              />
            )}
          </Stack>

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Network switches</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 140 } }}>{num('switchQty', 'Switches', redundant ? 'Min. 2 for redundancy' : undefined)}</Box>
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

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">PROFINET cabling &amp; 24 V UPS</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControlLabel control={<Checkbox size="small" checked={inp.pnCabling} onChange={(e) => set('pnCabling', e.target.checked)} />}
              label={<Typography variant="body2">PROFINET cabling</Typography>} />
            {inp.pnCabling && (
              <>
                <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 170 } }}>{num('pnFieldLinks', 'Links leaving the panel', 'Rest = 2 m patch cords')}</Box>
                <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 150 } }}>{num('pnFieldM', 'Avg. field run (m)', '+10% on the cable')}</Box>
                <Typography variant="caption" color="text.secondary">
                  {cfg.profinet
                    ? `${cfg.profinet.links} link${cfg.profinet.links === 1 ? '' : 's'} — ${cfg.profinet.patch} patch cord${cfg.profinet.patch === 1 ? '' : 's'}${cfg.profinet.field ? `, ${cfg.profinet.cableM} m FC cable + ${cfg.profinet.field * 2} plugs` : ''}`
                    : 'Only one device on the network — no cabling needed'}
                </Typography>
              </>
            )}
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControlLabel control={<Checkbox size="small" checked={inp.ups} onChange={(e) => set('ups', e.target.checked)} />}
              label={<Typography variant="body2">24 V DC UPS</Typography>} />
            {inp.ups && (
              <>
                <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 140 } }}>{num('upsMinutes', 'Backup (min)')}</Box>
                <TextField select label="Buffered load" size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }} value={inp.upsLoad} onChange={(e) => set('upsLoad', e.target.value as PlcInputs['upsLoad'])}>
                  <MenuItem value="controller">Controller electronics only</MenuItem>
                  <MenuItem value="all">Whole 24 V load (incl. DO / field)</MenuItem>
                </TextField>
                {cfg.ups && (
                  <Typography variant="caption" color="text.secondary">
                    {`${cfg.ups.loadA} A for ${cfg.ups.minutes} min → ${cfg.ups.ah} Ah battery`}
                  </Typography>
                )}
              </>
            )}
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
              <TextField select label="PowerTags" size="small" fullWidth value={inp.scadaPackage} onChange={(e) => set('scadaPackage', e.target.value)}
                helperText={cfg.scadaTags ? `~${cfg.scadaTags.estimate} tags needed` : ' '}>
                <MenuItem value="auto">Auto{cfg.scadaTags ? ` — ${cfg.scadaTags.autoPackage}` : ''}</MenuItem>
                {(inp.scada === 'wincc81' ? WINCC81_PACKAGES : UNIFIED_PC_PACKAGES).map((p) => (
                  <MenuItem key={p} value={p}>{p}{cfg.scadaTags && tagPackageSize(p) < cfg.scadaTags.estimate ? ' · too small' : ''}</MenuItem>
                ))}
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
              <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 120 } }}>{num('scadaClients', 'Clients', inp.scada === 'unifiedPc' ? 'Operate clients' : 'RT Client stations')}</Box>
              <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 130 } }}>{dec('tagsPerPoint', 'Tags per I/O point', 'Value + alarms / status')}</Box>
              <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 130 } }}>{num('extraTags', 'Extra tags', 'Modbus, setpoints…')}</Box>
              {cfg.scadaTags && (
                <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>
                  PowerTags: {cfg.scadaTags.points} I/O points (incl. spare) × {cfg.scadaTags.perPoint}
                  {cfg.scadaTags.extra ? ` + ${cfg.scadaTags.extra} extra` : ''} ≈ {cfg.scadaTags.estimate} tags → {cfg.scadaTags.package} package
                  {inp.scadaPackage === 'auto' ? ' (auto)' : ''}.
                </Typography>
              )}
              <TextField select label="Data logging" size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }} value={inp.scadaLogging} onChange={(e) => set('scadaLogging', e.target.value)}
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

          <Typography variant="caption" color="text.secondary">
            Terminal blocks, relays and wiring are added with <strong>Control Panel</strong> — it picks up this I/O when you add these items.
          </Typography>

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
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3, color: load.suggestedQty > 1 ? 'warning.main' : 'success.main' }}>
                      {load.suggestedA ? `${load.suggestedQty > 1 ? `${load.suggestedQty} × ` : ''}${load.suggestedA} A` : '—'}
                    </Typography>
                  </Box>
                  <Box sx={{ flexGrow: 1 }} />
                  <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 150 } }}>{dec('doLoadA', 'Load per DO (A)', 'Relay / pilot ≈ 0.1')}</Box>
                  <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 110 } }}>{dec('psuMarginPct', 'Margin %')}</Box>
                </Stack>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                  <TextField select label="Power supply" size="small" sx={{ minWidth: { xs: '100%', sm: 340 } }} value={inp.sitop} onChange={(e) => set('sitop', e.target.value)}>
                    <MenuItem value="none">None — I&apos;ll add it myself</MenuItem>
                    {psuItems}
                  </TextField>
                  {psuA !== null && (
                    <TextField
                      label="PSU qty" size="small" sx={{ width: 90 }} type="text" inputMode="numeric"
                      value={inp.psuQty || ''} placeholder="1"
                      onChange={(e) => set('psuQty', Math.max(1, Math.round(parseLenientFloat(e.target.value)) || 1))}
                      onFocus={(e) => e.target.select()}
                    />
                  )}
                  {psuA === null ? (
                    <Typography variant="body2" color="warning.main">
                      No power supply selected — pick one for {load.withMarginA.toFixed(1)} A or more
                      {load.suggestedQty > 1 ? ` (e.g. ${load.suggestedQty} × ${load.suggestedA} A)` : ''}.
                    </Typography>
                  ) : psuA * psuQty < load.withMarginA ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="error.main">
                        {psuSet(psuQty)} is below the {load.withMarginA.toFixed(1)} A needed — use {psuNeeded} × {psuA} A.
                      </Typography>
                      <Button size="small" variant="outlined" color="error" onClick={() => set('psuQty', psuNeeded)}>Use {psuNeeded}</Button>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="success.main">
                      {psuSet(psuQty)} covers {load.withMarginA.toFixed(1)} A ({Math.round((load.withMarginA / (psuA * psuQty)) * 100)}% loaded)
                      {psuQty > 1 ? ' — split the 24 V loads across the supplies (e.g. one per potential group / circuit).' : '.'}
                    </Typography>
                  )}
                  <Box sx={{ flexGrow: 1 }} />
                  <Button size="small" onClick={() => setShowLoad((v) => !v)}>{showLoad ? 'Hide breakdown' : 'Show breakdown'}</Button>
                </Stack>
                {showLoad && (
                  <Box sx={{ overflowX: 'auto' }}>
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
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Typical draws: CPU, interface module and HMI per Siemens datasheets; module electronics and field loads (10 mA per DI, 20 mA
                  per analog loop, the DO load above) are planning figures — adjust the DO load for solenoids or heavier devices.
                </Typography>
              </Box>

              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Modules to add</Typography></Divider>
              <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={HIDE_ON_PHONE}>Part no.</TableCell>
                    <TableCell>Item</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right" sx={HIDE_ON_PHONE}>Unit price</TableCell>
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
                      <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', ...HIDE_ON_PHONE }}>
                        {r.part.partNo || <Typography variant="body2" color="warning.main">Ask supplier</Typography>}
                        {r.part.partNo && r.part.verify && r.source !== 'catalog' && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'inherit' }}>verify P/N</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{r.part.description.split(', ').slice(0, 3).join(', ')}</Typography>
                        <Typography variant="caption" color="text.secondary">{r.why}</Typography>
                        <Typography variant="caption" sx={{ display: { xs: 'block', sm: 'none' }, fontFamily: 'monospace', color: r.unitCost === 0 ? 'warning.main' : 'text.secondary' }}>
                          {r.part.partNo || 'Ask supplier'} · {r.unitCost === 0 ? 'for inquiry' : `@ ${PHP(r.unitCost)}`}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.qty}{r.part.uom && r.part.uom !== 'pc' ? ` ${r.part.uom}` : ''}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: r.unitCost === 0 ? 'warning.main' : undefined, ...HIDE_ON_PHONE }}>
                        {r.unitCost === 0 ? 'For inquiry' : PHP(r.unitCost)}
                        {r.source === 'catalog' && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>catalog</Typography>}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{PHP(r.lineTotal)}</TableCell>
                    </TableRow>
                    )),
                  ])}
                  <TableRow>
                    <TableCell colSpan={fullScreen ? 2 : 4} align="right" sx={{ fontWeight: 600 }}>Total{inquiry > 0 ? ` (excl. ${inquiry} for inquiry)` : ''}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              </Box>
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
      <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!ready}>
          Add {rows.length} item{rows.length === 1 ? '' : 's'} · {PHP(total)} to Components
        </Button>
      </DialogActions>
    </Dialog>
  );
}
