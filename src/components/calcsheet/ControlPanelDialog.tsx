import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
  useMediaQuery, useTheme,
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
import { ENCLOSURES, deviceList, frontView, plateView, rowDetailViews, sideView, terminalSchedule, type EnclosureKey } from '../../utils/calcsheet/panelLayout';
import { panelDrawingDxf, panelSheets } from '../../utils/calcsheet/panelDrawing';
import { panelDrawingPdf } from '../../utils/calcsheet/panelDrawingPdf';
import PanelDrawingPreview from './PanelDrawingPreview';
import PanelLayoutEditor from './PanelLayoutEditor';
import type { PlcSubmitSection } from './SiemensPlcDialog';

// Control Panel configurator: enclosure size + the panel's I/O → enclosure,
// wireduct, DIN rail, fans, light, thermostat, ABB 2P MCBs, 230 V and 24 V
// wiring, the WAGO terminal strip and marker tube, added to B. Supply of
// Components under "CONTROL PANEL", "TERMINAL BLOCKS & RELAYS" and "WIRES".
// The I/O is pre-filled from the last PLC / BMS configuration added.

/** Part no. and unit price columns fold into the item cell on phones. */
const HIDE_ON_PHONE = { display: { xs: 'none', sm: 'table-cell' } } as const;

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
  // Phones: full-screen dialog, fields stack two per row, tables scroll sideways.
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const lastIo = usePanelIoStore((s) => s.io);
  // The dialog starts on the smallest standard enclosure that fits (Tibox / Tekpan).
  const [inp, setInp] = useState<PanelInputs>(() => ({ ...DEFAULT_PANEL_INPUTS, enclosure: 'auto', io: lastIo ?? emptyPanelIo() }));
  const [drawTab, setDrawTab] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);
  const set = <K extends keyof PanelInputs>(k: K, v: PanelInputs[K]) => setInp((p) => ({ ...p, [k]: v }));
  const setIo = <K extends keyof PanelIo>(k: K, v: PanelIo[K]) => setInp((p) => ({ ...p, io: { ...p.io, [k]: v } }));
  // Pick up the latest PLC / BMS I/O each time the dialog opens.
  const fromIo = (io: PanelIo | null) => (io?.psuA ? { psuA: io.psuA, psuQty: io.psuQty ?? 1 } : {});
  useEffect(() => { if (open && lastIo) setInp((p) => ({ ...p, io: lastIo, ...fromIo(lastIo) })); }, [open, lastIo]);

  const catalog = usePricelistStore((s) => s.items);
  const fetchCatalog = usePricelistStore((s) => s.fetchItems);
  useEffect(() => { if (open && catalog.length === 0) void fetchCatalog().catch(() => {}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = configurePanel(inp);
  // Hand edits only hold while the devices stay the same — drop them (and say so) when they change.
  useEffect(() => {
    if (inp.layoutEdit && !cfg.layoutEdited) {
      setInp((p) => ({ ...p, layoutEdit: null }));
      setLayoutNotice('The devices changed, so the layout went back to auto — edit it again if needed.');
    }
  }, [inp.layoutEdit, cfg.layoutEdited]);
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

  // Drawings: general arrangement + one mounting plate per bay, to scale.
  const views = useMemo(() => {
    const plates = cfg.layout.bays.map((_, i) => plateView(cfg.layout, i));
    return { front: frontView(cfg.layout), side: sideView(cfg.layout), plates, rows: rowDetailViews(cfg.layout) };
  }, [cfg.layout]);
  const drawTabs = ['General arrangement', ...views.plates.map((_, i) => `Mounting plate — bay ${i + 1}`), 'Row details (1:2)'];
  const tab = Math.min(drawTab, drawTabs.length - 1);
  const heading = `${cfg.layout.bays.length > 1 ? `${cfg.layout.bays.length} × ` : ''}${cfg.layout.enclosure.label}`;
  const exportPdf = () => {
    const doc = panelDrawingPdf({
      heading,
      sheets: panelSheets(views.front, views.side, views.plates, views.rows),
      devices: deviceList(cfg.layout),
      schedule: inp.terminals ? terminalSchedule(inp.io) : [],
      bom: rows.map((r) => ({ qty: r.qty, uom: r.part.uom ?? 'pc', description: describe(r), brand: r.brand ?? r.part.brand ?? '', partNo: r.part.partNo })),
    });
    doc.save('control-panel-drawings.pdf');
  };
  const exportDxf = () => {
    const blob = new Blob([panelDrawingDxf([views.front, views.side, ...views.plates, ...views.rows])], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'control-panel.dxf';
    a.click();
    URL.revokeObjectURL(url);
  };

  type NumKey = 'widthMm' | 'heightMm' | 'depthMm' | 'heatLossW' | 'deltaT' | 'psuQty' | 'psuA' | 'extraCircuits' | 'extraLoadA' | 'bays';
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

  const reset = () => { setInp({ ...DEFAULT_PANEL_INPUTS, enclosure: 'auto', io: lastIo ?? emptyPanelIo(), ...fromIo(lastIo) }); setDrawTab(0); setLayoutNotice(null); };
  const close = () => { reset(); onClose(); };
  const submit = () => {
    onSubmit(sections.map((g) => ({
      header: g.header,
      rows: g.rows.map((r): ComponentLine => ({
        id: id(), code: '', description: describe(r), brand: r.brand ?? r.part.brand ?? '', partNo: r.part.partNo,
        qty: r.qty, uom: r.part.uom ?? 'pc', unitCost: r.unitCost, forex: 1,
        contingencyPct: productContingencyPct ?? 0, contingencyPctOverridden: false, discountPct: 0,
      })),
    })));
    reset();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth fullScreen={fullScreen} sx={{ '& .MuiDivider-wrapper': { whiteSpace: 'normal' } }}>
      <DialogTitle>
        Control Panel
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: { xs: 'none', sm: 'block' } }}>
          Enter the panel size — the enclosure, wireduct, DIN rail, fans, light, thermostat, 2-pole MCBs, terminals, wiring and marker tube are
          worked out for you and added to B. Supply of Components.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Enclosure</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <TextField select label="Enclosure" size="small" sx={{ minWidth: { xs: '100%', sm: 330 } }} value={inp.enclosure}
              onChange={(e) => setInp((p) => ({ ...p, enclosure: e.target.value as EnclosureKey | 'auto', bays: 0 }))}
              helperText={inp.enclosure === 'auto' ? `Auto: ${heading}` : ' '}>
              <MenuItem value="auto">Auto — smallest that fits</MenuItem>
              {ENCLOSURES.map((e) => <MenuItem key={e.key} value={e.key}>{e.label}</MenuItem>)}
              <MenuItem value="custom">Custom size</MenuItem>
            </TextField>
            {(cfg.layout.enclosure.joinable && inp.enclosure !== 'auto') && (
              <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 130 } }}>{num('bays', 'Bays (joined)', `Auto: ${cfg.layout.bays.length}`)}</Box>
            )}
          </Stack>
          {inp.enclosure === 'custom' && (
            <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
              <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 120 } }}>{num('widthMm', 'Width (mm)')}</Box>
              <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 120 } }}>{num('heightMm', 'Height (mm)')}</Box>
              <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 120 } }}>{num('depthMm', 'Depth (mm)')}</Box>
              <TextField select label="Mounting" size="small" sx={{ minWidth: { xs: '100%', sm: 190 } }} value={inp.mounting} onChange={(e) => set('mounting', e.target.value as PanelInputs['mounting'])}
                helperText={inp.mounting === 'auto' ? (cfg.floor ? 'Auto: floor-standing' : 'Auto: wall-mounted') : ' '}>
                <MenuItem value="auto">Auto (floor from 1400 mm)</MenuItem>
                <MenuItem value="wall">Wall-mounted</MenuItem>
                <MenuItem value="floor">Floor-standing</MenuItem>
              </TextField>
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary">
            Mounting plate ≈ {cfg.plate.w} x {cfg.plate.h} mm{cfg.layout.bays.length > 1 ? ` per bay × ${cfg.layout.bays.length} bays` : ''} · {cfg.rows} rail row{cfg.rows === 1 ? '' : 's'} ·
            {' '}{cfg.doors} door{cfg.doors === 1 ? '' : 's'}
          </Typography>

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Cooling</Typography></Divider>
          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <FormControlLabel control={<Checkbox size="small" checked={inp.heatAuto} onChange={(e) => set('heatAuto', e.target.checked)} />}
              label={<Typography variant="body2">Heat from the components</Typography>} />
            {inp.heatAuto
              ? <Typography variant="body2" sx={{ pt: 1, fontWeight: 600 }}>≈ {cfg.heatAutoW} W</Typography>
              : <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 150 } }}>{num('heatLossW', 'Heat loss inside (W)', `Auto would be ${cfg.heatAutoW} W`)}</Box>}
            <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 150 } }}>{num('deltaT', 'Allowed rise (K)', 'Inside over ambient')}</Box>
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
            <TextField select label="Main incomer" size="small" sx={{ width: { xs: '100%', sm: 170 } }} value={inp.mainA}
              onChange={(e) => set('mainA', e.target.value === 'auto' ? 'auto' : Number(e.target.value) as McbRating)}
              helperText={inp.mainA === 'auto' ? `Auto: 2P C${cfg.mainA} (${cfg.loadA} A load)` : `Load ${cfg.loadA} A`}>
              <MenuItem value="auto">Auto (from load)</MenuItem>
              {MCB_RATINGS.map((a) => <MenuItem key={a} value={a}>{`2P C${a}`}</MenuItem>)}
            </TextField>
            <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 140 } }}>{num('psuQty', '24 V DC supplies', '1 MCB each')}</Box>
            <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 140 } }}>{num('psuA', 'Supply rating (A)', 'Output, each')}</Box>
            <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 140 } }}>{num('extraCircuits', 'Other 230 V loads', '1 MCB each (C10)')}</Box>
            {inp.extraCircuits > 0 && <Box sx={{ width: { xs: 'calc(50% - 8px)', sm: 140 } }}>{num('extraLoadA', 'Load each (A)')}</Box>}
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
          {cfg.notes.map((n) => <Alert key={n} severity={/need ≈|Very small|more than one|Doesn't fit/.test(n) ? 'warning' : 'info'} sx={{ py: 0 }}>{n}</Alert>)}

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Drawings (to scale)</Typography></Divider>
          <Tabs value={tab} onChange={(_, v: number) => setDrawTab(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, textTransform: 'none' } }}>
            {drawTabs.map((t) => <Tab key={t} label={t} />)}
          </Tabs>
          {tab === 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '3fr 1fr' }, gap: 1 }}>
              <PanelDrawingPreview view={views.front} height={fullScreen ? 300 : 420} />
              <PanelDrawingPreview view={views.side} height={fullScreen ? 300 : 420} />
            </Box>
          )}
          {tab > 0 && tab <= views.plates.length && <PanelDrawingPreview view={views.plates[tab - 1]} height={fullScreen ? 360 : 520} />}
          {tab === views.plates.length + 1 && (
            views.rows.length
              ? (
                <Stack spacing={1} sx={{ maxHeight: 560, overflowY: 'auto', pr: 0.5 }}>
                  {views.rows.map((v) => <PanelDrawingPreview key={v.title} view={v} height={fullScreen ? 120 : 170} />)}
                </Stack>
              )
              : <Typography variant="body2" color="text.secondary">No rail rows yet.</Typography>
          )}
          {layoutNotice && <Alert severity="info" sx={{ py: 0 }} onClose={() => setLayoutNotice(null)}>{layoutNotice}</Alert>}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button size="small" variant="contained" onClick={() => setEditorOpen(true)}>Edit layout</Button>
            {cfg.layoutEdited && (
              <Chip size="small" color="primary" label="Edited layout" onDelete={() => set('layoutEdit', null)} />
            )}
            <Button size="small" variant="outlined" onClick={exportPdf}>Export drawings (PDF)</Button>
            <Button size="small" variant="outlined" onClick={exportDxf}>Export DXF (AutoCAD)</Button>
            <Typography variant="caption" color="text.secondary">
              A3, no title block: general arrangement, mounting plates, row details at 1:2 (terminals, relays, devices), device list, terminal schedule and BOM. DXF is 1:1 in mm, one layer per kind.
            </Typography>
          </Stack>

          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Items to add</Typography></Divider>
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
                <TableRow key={`h-${g.sec}`}>
                  <TableCell colSpan={5} sx={{ fontWeight: 700, bgcolor: 'action.hover', py: 0.5 }}>{g.header}</TableCell>
                </TableRow>,
                ...g.rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', ...HIDE_ON_PHONE }}>
                      {r.part.partNo || <Typography variant="body2" color="text.secondary">—</Typography>}
                      {r.part.partNo && r.part.verify && r.source !== 'catalog' && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'inherit' }}>verify P/N</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{describe(r)}</Typography>
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
              {inquiry} item{inquiry === 1 ? '' : 's'} for inquiry — added at ₱0. Add the price in Sales → Pricelists (same part number) or on the row.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <PanelLayoutEditor
        open={editorOpen}
        layout={cfg.layout}
        autoLayout={cfg.autoLayout}
        onCancel={() => setEditorOpen(false)}
        onDone={(l) => { set('layoutEdit', l); setLayoutNotice(null); setEditorOpen(false); }}
      />
      <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={submit}>
          Add {rows.length} item{rows.length === 1 ? '' : 's'} · {PHP(total)} to Components
        </Button>
      </DialogActions>
    </Dialog>
  );
}
