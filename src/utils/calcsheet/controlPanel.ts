// Control Panel configurator — from the enclosure size (W × H × D) and the
// panel's I/O, the build materials: enclosure, slotted wireduct and DIN rail
// (from the mounting-plate layout), filter fans + exhaust filters (from the
// heat load), panel light + door switch, thermostat, ABB S200 MCBs, the 230 V
// wiring (1.5 mm², white L1 / black L2), the WAGO terminal strip + 0.5 mm²
// wiring (terminalWiring.ts) and PVC marker tube for tagging both wire sizes.
// Pure logic — see ControlPanelDialog.tsx.
//
// IOCT practice: 230 V AC is L1 / L2, so every circuit breaker is 2-pole
// (S202); 230 V wiring is 1.5 mm² — white for L1, black for L2.
//
// Rules of thumb (change here if the shop builds differently):
//  • Mounting plate ≈ W − 100 by H − 150 mm; component rows every 200 mm,
//    each with a DIN rail and a horizontal wireduct above and below; a
//    vertical duct down both sides. Duct and rail come in 2 m lengths.
//  • Fan airflow V = 3.1 × (Qloss − Qsurface) / ΔT m³/h, Qsurface =
//    5.5 W/m²K × A × ΔT (sheet steel, A per IEC 60890 for a free-standing
//    enclosure). One matching exhaust filter per fan.
//  • One LED light + door switch per door (2 doors above 800 mm wide).

import { TERMINAL_PARTS, TERMINAL_GENERIC, terminalStrip, type CatalogPart, type PanelIo, type StripLine, type WiringSummary } from './terminalWiring';
import {
  DIMS, DUCT_V_W, ENCLOSURES, MAX_BAYS, autoEnclosure, customEnclosure, layoutPanel, plateOf,
  type EnclosureKey, type LayoutGroup, type PanelLayout,
} from './panelLayout';

export type PanelSection = 'panel' | 'terminals' | 'wiring';

// ABB S202 (2-pole) C-curve — part numbers and prices from the HVC DCPI ABB
// pricelist (March 2026); a pricelist item with the same part number wins.
export const MCB_RATINGS = [6, 10, 16, 20, 25, 32, 40, 50, 63] as const;
export type McbRating = (typeof MCB_RATINGS)[number];
const S202_PRICE: Record<McbRating, number> = { 6: 909.2, 10: 831.16, 16: 831.16, 20: 831.16, 25: 1020.59, 32: 831.16, 40: 975.77, 50: 1054.22, 63: 1054.22 };
export const mcbKey = (a: McbRating) => `mcb2p_${a}`;

export interface Fan { key: string; sizeMm: number; airflow: number }
export const FANS: Fan[] = [
  { key: 'fan120', sizeMm: 120, airflow: 50 },
  { key: 'fan150', sizeMm: 150, airflow: 100 },
  { key: 'fan200', sizeMm: 200, airflow: 180 },
  { key: 'fan250', sizeMm: 250, airflow: 300 },
];

const G = (key: string, generic: string, uom = 'pc'): CatalogPart => ({ key, partNo: '', price: 0, brand: '', description: generic, generic, uom });
export const WIRE15_ROLL_M = 100;
export const TUBE_ROLL_M = 100;

const PANEL_PARTS_LIST: CatalogPart[] = [
  ...MCB_RATINGS.map((a): CatalogPart => ({
    key: mcbKey(a), partNo: `S202-C${a}`, price: S202_PRICE[a], quoted: true, brand: 'ABB',
    description: `ABB S202-C${a} miniature circuit breaker, 2P, C-curve, ${a} A, 6 kA`,
    generic: `Miniature circuit breaker 2P, C-curve, ${a} A`,
  })),
  G('mcbBusbar', 'MCB pin busbar 2P, cut to length'),
  { key: 'tbIn4', partNo: '2004-1201', price: 37.69, quoted: true, brand: 'WAGO',
    description: 'WAGO 2-conductor through terminal block, 4 mm², for DIN-rail 35 x 15 and 35 x 7.5, Push-in CAGE CLAMP, gray (230 V incoming L1 / L2)',
    generic: 'Terminal block, 4 mm² (incoming supply)' },
  { key: 'tbIn4End', partNo: '2004-1292', price: 33.73, quoted: true, brand: 'WAGO',
    description: 'WAGO end and intermediate plate, 1 mm thick, orange — for 2004-1201 terminals', generic: 'End plate for 4 mm² terminal block' },
  G('enclosureWall', 'Panel enclosure, wall-mounted'),
  G('enclosureFloor', 'Panel enclosure, floor-standing'),
  G('plinth', 'Enclosure plinth / base, 100 mm'),
  G('bayKit', 'Baying kit for joining enclosures side by side'),
  G('ductH', 'Slotted wiring duct 40 x 60 mm (W x H), with cover, 2 m'),
  G('ductV', 'Slotted wiring duct 60 x 80 mm (W x H), with cover, 2 m'),
  G('panelRail', 'DIN rail 35 mm, 2 m'),
  ...FANS.flatMap((f) => [
    G(f.key, `Filter fan ${f.sizeMm} mm, 230 V AC, approx. ${f.airflow} m³/h, with filter mat`),
    G(`${f.key}Exhaust`, `Exhaust filter grille ${f.sizeMm} mm, with filter mat`),
  ]),
  G('thermostat', 'Enclosure thermostat, NO contact (fan control), adjustable 0–60 °C'),
  G('panelLight', 'LED panel light 230 V AC'),
  G('doorSwitch', 'Door limit switch for panel light'),
  G('socket', 'Service socket outlet 230 V, DIN-rail mount'),
  G('wireL1', `Hook-up wire 1.5 mm², white (230 V AC L1), ${WIRE15_ROLL_M} m roll`, 'roll'),
  G('wireL2', `Hook-up wire 1.5 mm², black (230 V AC L2), ${WIRE15_ROLL_M} m roll`, 'roll'),
  G('wirePe', `Hook-up wire 1.5 mm², green-yellow (PE), ${WIRE15_ROLL_M} m roll`, 'roll'),
  G('ferrule15', '1.5mm2 ferrule'),
  G('tube05', `PVC marker tube Ø2.5 mm for wire tagging (0.5 mm² wire), ${TUBE_ROLL_M} m roll`, 'roll'),
  G('tube15', `PVC marker tube Ø3.2 mm for wire tagging (1.5 mm² wire), ${TUBE_ROLL_M} m roll`, 'roll'),
];

export const PANEL_PARTS: Record<string, CatalogPart> = (() => {
  const all: Record<string, CatalogPart> = {};
  PANEL_PARTS_LIST.forEach((p) => { all[p.key] = p; });
  TERMINAL_PARTS.forEach((p) => { all[p.key] = { ...p, generic: p.generic ?? TERMINAL_GENERIC[p.key] }; });
  return all;
})();

// ── Inputs ───────────────────────────────────────────────────────────────
export interface PanelInputs {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  /** 'auto' = floor-standing from 1400 mm high. */
  mounting: 'auto' | 'wall' | 'floor';
  /** Estimate the heat from the components (true), or use heatLossW. */
  heatAuto: boolean;
  /** Heat given off inside the panel (W) when entered by hand. */
  heatLossW: number;
  /** Allowed rise inside over ambient (K). */
  deltaT: number;
  /** I/O for the terminal strip (from the PLC / BMS configuration, or typed in). */
  io: PanelIo;
  terminals: boolean;
  /** 24 V DC supplies fed from 230 V (one 2P MCB each) and their output rating (A). */
  psuQty: number;
  psuA: number;
  /** Other 230 V AC loads needing their own breaker, and the current each draws (A). */
  extraCircuits: number;
  extraLoadA: number;
  /** Main incomer rating, or 'auto' = sized from the 230 V load. */
  mainA: McbRating | 'auto';
  socket: boolean;
  /** Standard enclosure (Tekpan floor 800 / 1200 W, Tibox wall 1000×800 / 800×600), 'auto' = smallest that fits, 'custom' = W × H × D above. */
  enclosure: EnclosureKey | 'auto';
  /** Floor-standing bays joined side by side; 0 = as many as the layout needs. */
  bays: number;
}

export const emptyPanelIo = (): PanelIo => ({ source: '', di: 0, dq: 0, a2: 0, a4: 0, distPoints: 1, deviceRailMm: 0 });

export const DEFAULT_PANEL_INPUTS: PanelInputs = {
  widthMm: 800, heightMm: 1200, depthMm: 300, mounting: 'auto', heatAuto: true, heatLossW: 150, deltaT: 10,
  io: emptyPanelIo(), terminals: true, psuQty: 1, psuA: 10, extraCircuits: 0, extraLoadA: 5, mainA: 'auto', socket: false,
  enclosure: 'custom', bays: 0,
};

export const PANEL_HEADER = 'CONTROL PANEL';
export const TERMINALS_HEADER = 'TERMINAL BLOCKS & RELAYS';
export const WIRES_HEADER = 'WIRES';

/** `detail` is appended to the part's quotation description (e.g. the enclosure size). */
export interface PanelLine { key: string; qty: number; why: string; section: PanelSection; detail?: string; brand?: string }

export interface PanelConfig {
  lines: PanelLine[];
  floor: boolean;
  doors: number;
  plate: { w: number; h: number };
  rows: number;
  /** DIN rail the layout gives vs. what the terminals + devices need (mm). */
  railLayoutMm: number;
  railNeededMm: number;
  airflow: number;
  /** Heat used for the fans (W), the auto estimate and its breakdown. */
  heatW: number;
  heatAutoW: number;
  heatSources: { label: string; w: number }[];
  /** 230 V load (A), before and after the 25% margin, and the main breaker picked. */
  loadA: number;
  mainA: McbRating;
  wiring: WiringSummary | null;
  wires15: number;
  /** Components placed on the mounting plate(s) — for the drawings and the fit check. */
  layout: PanelLayout;
  notes: string[];
}

const whole = (n: number) => Math.max(0, Math.round(Number(n) || 0));
/** Sticks of `stickMm` to cut `pieces` lengths of `pieceMm` from (no joins inside a piece). */
function sticks(pieces: number, pieceMm: number, stickMm = 2000): number {
  if (pieces <= 0 || pieceMm <= 0) return 0;
  if (pieceMm > stickMm) return pieces * Math.ceil(pieceMm / stickMm);
  return Math.ceil(pieces / Math.floor(stickMm / pieceMm));
}

/** The panel's devices as layout runs: power row, controller, relays, terminal strips. */
function panelGroups(raw: PanelInputs, io: PanelIo, psuQty: number, branches: number): LayoutGroup[] {
  const g: LayoutGroup[] = [];
  const run = (tag: string, label: string, d: { w: number; h: number }, count: number, zone: LayoutGroup['zone'], splittable = true) => {
    if (count > 0) g.push({ tag, label, unitW: d.w, unitH: d.h, count, splittable, zone });
  };
  run('X0', 'Incoming 230 V terminals', DIMS.tbIn4, 2, 'power');
  run('Q0', 'Main breaker 2P', DIMS.mcb2p, 1, 'power', false);
  run('Q1', 'Branch breakers 2P', DIMS.mcb2p, branches, 'power');
  run('B1', 'Thermostat', DIMS.thermostat, 1, 'power', false);
  if (raw.socket) run('XS1', 'Service socket', DIMS.socket, 1, 'power', false);
  const psuA = Math.max(0, Number(raw.psuA) || 0);
  run('G', `24 V DC supply ${psuA} A`, DIMS.psu(psuA), psuQty, 'power', false);
  // Controller devices from the PLC / BMS configuration (or one block of its rail length).
  const seen: Record<string, number> = {};
  if (io.devices?.length) {
    io.devices.forEach((d) => {
      seen[d.tag] = (seen[d.tag] ?? 0) + 1;
      run(`${d.tag}${seen[d.tag]}`, d.label, { w: d.widthMm, h: d.heightMm }, 1, 'control', false);
    });
  } else if (io.deviceRailMm > 0) run('A1', `Controller (${io.source || 'PLC / BMS'})`, { w: 15, h: 120 }, Math.ceil(io.deviceRailMm / 15), 'control');
  if (raw.terminals) {
    run('K', 'Interposing relays (DO)', DIMS.relay, io.dq, 'relays');
    run('X1', '24 V DC distribution', DIMS.tbStd, 2 * io.distPoints, 'terminals');
    run('X2', 'DI terminals, 2-level', DIMS.tb2Level, io.di, 'terminals');
    run('X3', 'Analog fuse terminals', DIMS.tbFuse, io.a2 + 2 * io.a4, 'terminals');
    run('X3', 'Analog terminals', DIMS.tbStd, io.a2 + 2 * io.a4, 'terminals');
    run('PE', 'PE terminals', DIMS.tbStd, 2, 'terminals');
  }
  return g;
}

export function configurePanel(raw: PanelInputs): PanelConfig {
  const io = { ...emptyPanelIo(), ...raw.io };
  const lines: PanelLine[] = [];
  const add = (key: string, qty: number, why: string, section: PanelSection = 'panel', detail?: string, brand?: string) => {
    if (qty > 0 && PANEL_PARTS[key]) lines.push({ key, qty, why, section, ...(detail ? { detail } : {}), ...(brand ? { brand } : {}) });
  };
  const notes: string[] = [];

  // 230 V circuits (one 2P breaker each) — needed for the layout and the heat estimate.
  const psuQty = whole(raw.psuQty);
  const circuits = [
    { n: psuQty, a: 6 as McbRating, what: '24 V DC supply' },
    { n: 1, a: 6 as McbRating, what: 'fans, thermostat and panel light' },
    { n: raw.socket ? 1 : 0, a: 16 as McbRating, what: 'service socket' },
    { n: whole(raw.extraCircuits), a: 10 as McbRating, what: 'other 230 V load' },
  ].filter((c) => c.n > 0);
  const branches = circuits.reduce((s, c) => s + c.n, 0);

  // Enclosure + bays: a standard one (or the smallest that fits), or the custom W × H × D.
  const groups = panelGroups(raw, io, psuQty, branches);
  const preset = raw.enclosure ?? 'custom';
  const custom = preset === 'custom';
  const floorIn = raw.mounting === 'floor' || (raw.mounting === 'auto' && whole(raw.heightMm) >= 1400);
  const askedBays = whole(raw.bays);
  let layout: PanelLayout;
  if (preset === 'auto') layout = autoEnclosure(groups);
  else {
    const e = custom ? customEnclosure(whole(raw.widthMm), whole(raw.heightMm), whole(raw.depthMm), floorIn) : ENCLOSURES.find((x) => x.key === preset)!;
    if (!e.joinable) layout = layoutPanel(groups, e, 1);
    else if (askedBays > 0) layout = layoutPanel(groups, e, Math.min(MAX_BAYS, askedBays));
    else {
      layout = layoutPanel(groups, e, 1);
      for (let b = 2; !layout.fits && b <= MAX_BAYS; b++) layout = layoutPanel(groups, e, b);
    }
    // Bays asked for beyond what the devices fill are drawn empty (spare).
    while (e.joinable && askedBays > layout.bays.length && layout.bays.length < MAX_BAYS) layout.bays.push({ plate: plateOf(e), rows: [] });
  }
  const enc = layout.enclosure;
  const bays = Math.max(1, layout.bays.length);
  const floor = custom ? floorIn : enc.floor;
  const bayW = custom ? whole(raw.widthMm) : enc.w;
  const W = bayW * bays;
  const H = custom ? whole(raw.heightMm) : enc.h;
  const D = custom ? whole(raw.depthMm) : enc.d;
  const bodyH = H - (custom ? 0 : enc.plinth);
  const doors = (bayW > 800 ? 2 : 1) * bays;
  const plate = custom ? { w: Math.max(0, bayW - 100), h: Math.max(0, H - 150) } : plateOf(enc);
  const rows = custom ? Math.max(1, Math.floor(plate.h / 200)) : layout.rowCount;
  const size = `${bayW} x ${H} x ${D} mm`;
  let railLayoutMm: number;

  if (custom) {
    add(floor ? 'enclosureFloor' : 'enclosureWall', bays, `${doors} door${doors === 1 ? '' : 's'}, mounting plate ${plate.w} x ${plate.h} mm`, 'panel',
      `${size} (W x H x D), ${doors / bays} door${doors / bays === 1 ? '' : 's'}, powder-coated steel, with mounting plate`);
    add('plinth', floor ? bays : 0, 'Floor-standing — lifts the enclosure for cable entry');
    add('ductH', sticks((rows + 1) * bays, plate.w), `${rows + 1} horizontal runs × ${plate.w} mm (above / below ${rows} rail rows)`);
    add('ductV', sticks(2 * bays, plate.h), `2 vertical runs × ${plate.h} mm (both sides)`);
    railLayoutMm = rows * plate.w * bays;
    add('panelRail', sticks(rows * bays, plate.w), `${rows} rail rows × ${plate.w} mm`);
  } else {
    const leaves = bayW > 800 ? 2 : 1;
    add(floor ? 'enclosureFloor' : 'enclosureWall', bays, `${bays > 1 ? `${bays} bays joined side by side, ` : ''}mounting plate ${plate.w} x ${plate.h} mm`, 'panel',
      `${H}H × ${bayW}W × ${D}D mm${enc.plinth ? ` (incl. ${enc.plinth} mm plinth)` : ''}, ${leaves} door${leaves === 1 ? '' : 's'}, powder-coated steel, with mounting plate`, enc.brand);
    add('bayKit', bays - 1, 'Joins the bays side by side');
    const runW = plate.w - 2 * DUCT_V_W;
    const hRuns = layout.bays.reduce((n, b) => n + (b.rows.length ? b.rows.length + 1 : 0), 0);
    add('ductH', sticks(hRuns, runW), `${hRuns} horizontal runs × ${runW} mm (above / below each rail row)`);
    add('ductV', sticks(2 * bays, plate.h), `2 vertical runs × ${plate.h} mm per bay (both sides)`);
    railLayoutMm = layout.rowCount * runW;
    add('panelRail', sticks(layout.rowCount, runW), `${layout.rowCount} rail rows × ${runW} mm (from the layout)`);
    if (preset === 'auto') notes.push(`Auto enclosure: ${bays > 1 ? `${bays} × ` : ''}${enc.label} — the smallest that fits the layout.`);
    if (!layout.fits) notes.push(`Doesn't fit${enc.joinable ? ` in ${bays} bay${bays === 1 ? '' : 's'}` : ''}: ${layout.unplaced.join(', ')} — pick a bigger enclosure${enc.joinable ? ' or more bays' : ''}.`);
  }

  // Heat inside the panel: auto from the components, or as entered.
  const psuA = Math.max(0, Number(raw.psuA) || 0);
  const load24A = io.load24A ?? psuQty * psuA * 0.6; // unknown load → assume supplies ~60% loaded
  const heatSources = [
    { label: 'Controller electronics (CPU, I/O modules, switches, HMI)', w: io.electronicsW ?? 0 },
    { label: `24 V supply losses (${Math.round(load24A * 10) / 10} A at ~90% efficiency)`, w: load24A * 24 * (1 / 0.9 - 1) },
    { label: `Slim relay coils (${io.dq} × 0.2 W)`, w: io.dq * 0.2 },
    { label: `Circuit breakers (${1 + branches} × ~1 W)`, w: 1 + branches },
    { label: 'Control transformer losses', w: io.transformerW ?? 0 },
    { label: 'Terminals, fuse LEDs, wiring (allowance)', w: 10 },
  ].filter((h) => h.w > 0).map((h) => ({ ...h, w: Math.round(h.w * 10) / 10 }));
  const heatAutoW = Math.round(heatSources.reduce((sum, h) => sum + h.w, 0));
  const heatW = raw.heatAuto ? heatAutoW : Math.max(0, Number(raw.heatLossW) || 0);

  // Heat: fans + exhaust filters, thermostat
  const dT = Math.max(1, Number(raw.deltaT) || 10);
  const area = 1.8 * (bodyH / 1000) * ((W + D) / 1000) + 1.4 * (W / 1000) * (D / 1000);
  const qSurface = 5.5 * area * dT;
  const airflow = Math.max(0, Math.round((3.1 * (heatW - qSurface)) / dT));
  const fan = FANS.find((f) => f.airflow >= airflow) ?? FANS[FANS.length - 1];
  // At least one fan per joined bay — each bay needs its own airflow.
  const fanQty = Math.max(airflow > 0 ? Math.ceil(airflow / fan.airflow) : 1, !custom && floor ? bays : 1);
  add(fan.key, fanQty, airflow > 0
    ? `${heatW} W inside${raw.heatAuto ? ' (auto)' : ''}, ${Math.round(qSurface)} W through the walls at ΔT ${dT} K → ≈ ${airflow} m³/h`
    : `The walls dissipate the ${heatW} W${raw.heatAuto ? ' (auto)' : ''} at ΔT ${dT} K — one fan for hot ambient / sun`);
  add(`${fan.key}Exhaust`, fanQty, 'One exhaust filter per fan (top of the opposite side)');
  add('thermostat', 1, 'Switches the fans');

  // Light + door switch
  add('panelLight', doors, 'One per door');
  add('doorSwitch', doors, 'Switches the panel light when the door opens');
  add('socket', raw.socket ? 1 : 0, 'Service outlet for a laptop / tools');

  // 230 V: main 2P + a 2P MCB per circuit
  // 230 V load: supplies at ~88% efficiency, fans ~0.3 A, lights ~0.1 A,
  // socket counted at 10 A, other loads as entered.
  const loadA = Math.round((
    psuQty * (24 * Math.max(0, Number(raw.psuA) || 0)) / 0.88 / 230
    + fanQty * 0.3 + doors * 0.1 + (raw.socket ? 10 : 0)
    + whole(raw.extraCircuits) * Math.max(0, Number(raw.extraLoadA) || 0)
  ) * 100) / 100;
  // Auto: next rating above load × 1.25 and above the largest branch breaker (so a branch trips first).
  const largestBranch = circuits.reduce((m, c) => Math.max(m, c.a), 0);
  const autoMain = MCB_RATINGS.find((a) => a >= loadA * 1.25 && a > largestBranch) ?? MCB_RATINGS[MCB_RATINGS.length - 1];
  const mainA: McbRating = raw.mainA === 'auto' || !(MCB_RATINGS as readonly number[]).includes(raw.mainA) ? autoMain : raw.mainA;
  add(mcbKey(mainA), 1, raw.mainA === 'auto'
    ? `Main incomer, 2P (L1 / L2) — auto: ${loadA} A load × 1.25, above the largest ${largestBranch} A branch`
    : 'Main incomer, 2P (L1 / L2)');
  if (raw.mainA !== 'auto' && mainA < loadA * 1.25) notes.push(`Main ${mainA} A is below the ${loadA} A load + 25% — ${autoMain} A suggested.`);
  if (raw.mainA !== 'auto' && mainA <= largestBranch) notes.push(`Main ${mainA} A is not above the largest ${largestBranch} A branch breaker — it may trip first.`);
  if (loadA * 1.25 > MCB_RATINGS[MCB_RATINGS.length - 1]) notes.push(`${loadA} A is beyond a 63 A MCB — use an MCCB incomer.`);
  // Same rating → one line: add up the branch breakers per rating.
  const byRating = new Map<McbRating, string[]>();
  circuits.forEach((c) => byRating.set(c.a, [...(byRating.get(c.a) ?? []), `${c.n} × ${c.what}`]));
  byRating.forEach((whats, a) => {
    const n = circuits.filter((c) => c.a === a).reduce((s, c) => s + c.n, 0);
    const existing = lines.find((l) => l.key === mcbKey(a));
    if (existing) { existing.qty += n; existing.why += `; ${whats.join(', ')}`; } else add(mcbKey(a), n, `2P branch: ${whats.join(', ')}`);
  });
  add('mcbBusbar', branches >= 2 ? 1 : 0, `Feeds the ${branches} branch breakers from the main`);
  add('tbIn4', 2, 'Incoming 230 V supply, L1 / L2');
  add('tbIn4End', 1, 'Closes the incoming supply terminals');

  // 1.5 mm² wiring: incomer → main → busbar, and L1 + L2 to every branch load.
  const runM = Math.round(((W + H) / 2000 + 0.3) * 100) / 100;
  const perColour = 2 + branches;
  const wires15 = perColour * 2 + doors * 2 + fanQty * 2; // + light / fan drops
  const l1M = Math.ceil((perColour + doors + fanQty) * runM * 1.1);
  const peM = Math.ceil((1 + doors + fanQty + 1) * runM * 1.1); // PSU, doors, fans, plate
  add('wireL1', Math.ceil(l1M / WIRE15_ROLL_M), `1.5 mm² white (L1): ≈ ${l1M} m`, 'wiring');
  add('wireL2', Math.ceil(l1M / WIRE15_ROLL_M), `1.5 mm² black (L2): ≈ ${l1M} m`, 'wiring');
  add('wirePe', Math.ceil(peM / WIRE15_ROLL_M), `1.5 mm² green-yellow (PE): doors, plate, fans, PSU ≈ ${peM} m`, 'wiring');
  add('ferrule15', Math.ceil((wires15 * 2 * 1.1) / 100) * 100, 'Both ends of every 1.5 mm² wire (+10%)', 'wiring');

  // Terminal strip + 0.5 mm² wiring
  let wiring: WiringSummary | null = null;
  let stripRailMm = 0;
  if (raw.terminals && io.di + io.dq + io.a2 + io.a4 > 0) {
    const strip = terminalStrip({
      ...io, extraRailMm: io.deviceRailMm, railFor: 'terminals, relays and the controller', panelW: W, panelH: H,
    });
    wiring = strip.wiring;
    stripRailMm = strip.wiring.railMm;
    // The layout's rails replace the strip's own DIN-rail estimate.
    strip.lines.filter((l: StripLine) => l.key !== 'dinRail').forEach((l) => add(l.key, l.qty, l.why, l.section));
  }

  // Marker tube: 2 tags per wire, ~20 mm each (+10%)
  const tubeM = (n: number) => (n * 2 * 0.02 * 1.1);
  const wires05 = wiring ? wiring.redWires + wiring.blueWires : 0;
  add('tube05', wires05 > 0 ? Math.ceil(tubeM(wires05) / TUBE_ROLL_M) : 0, `${wires05} × 0.5 mm² wires, a tag at each end`, 'wiring');
  add('tube15', Math.ceil(tubeM(wires15) / TUBE_ROLL_M), `${wires15} × 1.5 mm² wires, a tag at each end`, 'wiring');

  // Rail check: terminals + devices + breakers vs. what the layout holds.
  const railNeededMm = Math.ceil(stripRailMm + (1 + branches) * 36 + 2 * 12 + psuQty * 90);
  if (custom && railNeededMm > railLayoutMm) notes.push(`The terminals, devices and breakers need ≈ ${(railNeededMm / 1000).toFixed(1)} m of DIN rail but a ${W} x ${H} panel holds ≈ ${(railLayoutMm / 1000).toFixed(1)} m — go bigger or add a panel.`);
  if (W < 400 || H < 400) notes.push('Very small enclosure — check the layout by hand.');
  if (airflow > FANS[FANS.length - 1].airflow) notes.push(`≈ ${airflow} m³/h is more than one ${FANS[FANS.length - 1].sizeMm} mm fan — ${fanQty} fans, or consider a panel air conditioner.`);
  notes.push('230 V circuits are 2-pole (L1 / L2) — 1.5 mm² white for L1, black for L2.');

  return { lines, floor, doors, plate, rows, railLayoutMm, railNeededMm, airflow, heatW, heatAutoW, heatSources, loadA, mainA, wiring, wires15, layout, notes };
}
