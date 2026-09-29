// WAGO terminal strip + 0.5 mm² signal wiring for a control panel's I/O —
// IOCT panel practice, the same whatever PLC / BMS controller is used:
//  • 1 DI = one 2-level terminal; 1 DQ = one slim relay module (WAGO 857-304,
//    the TRS 24VDC 1CO equivalent); 1 analog point 2-wire = 1 fused +
//    1 standard terminal, 4-wire = 2 fused + 2 standard.
//  • +24 V / 0 V distribution terminals for every powered device, PE, end
//    plates, jumpers, end stops, markers and DIN rail.
//  • Signal wiring is 0.5 mm² — red for +24 V DC, blue for 0 V DC — with
//    ferrules on both ends; length follows the panel size.
// Used by siemensPlc.ts and multiVendorPlc.ts.

/** A priced catalog part as the configurators use it. */
export interface CatalogPart {
  key: string;
  /** '' = not known yet — the supplier fills it in. */
  partNo: string;
  description: string;
  /** Default unit price (₱) from supplier quotes; 0 = not priced (for inquiry). */
  price: number;
  /** Part number and price come from a supplier quote (others: confirm the part number). */
  quoted?: boolean;
  /** Maker — the Siemens configurator defaults it to Siemens. */
  brand?: string;
  /** Unit of measure — defaults to 'pc'. */
  uom?: string;
  /** Part number not confirmed yet — shown as "verify P/N". */
  verify?: boolean;
  /**
   * Brand-neutral description written into the quotation (the part number
   * stays in its own column) — so a client can't lift the exact model off the
   * quote, and an equivalent can be supplied when an item is out of stock.
   */
  generic?: string;
}

/** Brand-neutral quotation descriptions for the terminal-strip parts. */
export const TERMINAL_GENERIC: Record<string, string> = {
  tb2Level: 'Terminal block, 2-level, 2.5 mm²',
  tb2LevelEnd: 'End plate for 2-level terminal block',
  tbFuse: 'Fuse terminal block, 5 x 20 mm fuse, with blown-fuse LED, 2.5 mm²',
  tbStd: 'Terminal block, 2.5 mm²',
  tbStdEnd: 'End plate for terminal block',
  tbPe: 'Ground (PE) terminal block, 2.5 mm²',
  jumper10: 'Terminal jumper (shorting link), 10-way',
  relay: 'Slim relay module, 24 V DC coil, 1 changeover contact, 6 A',
  relayJumper: 'Relay jumper (shorting link), 2-way',
  endStop: 'End stopper for DIN rail',
  markers: 'Terminal marker',
  dinRail: 'DIN rail 35 mm, 2 m',
  ferrule05: '0.5mm2 ferrule',
  fuse5x20: 'Miniature fuse 5 x 20 mm, 0.5 A',
  wireRed: 'Hook-up wire 0.5 mm², red (+24 V DC), 100 m roll',
  wireBlue: 'Hook-up wire 0.5 mm², blue (0 V DC), 100 m roll',
};

// `quoted` ones carry the part number and VAT-ex unit price from the ISTS
// WAGO inventory (ex-stock list, 2026); the rest are WAGO catalog numbers for
// inquiry. A pricelist item with the same part number still wins.
const WQ = { brand: 'WAGO', quoted: true };
const W = { brand: 'WAGO', price: 0 };
export const WIRE_ROLL_M = 100;
/** ₱ per 100 m roll of 0.5 mm² wire (IOCT price, any colour). */
export const WIRE_ROLL_PRICE = 1500;
export const TERMINAL_PARTS: CatalogPart[] = [
  { ...WQ, key: 'tb2Level', partNo: '2002-2201', price: 99.41,
    description: 'WAGO double-deck terminal block, through/through, L/L, without marker carrier, for DIN-rail 35 x 15 and 35 x 7.5, 2.5 mm², Push-in CAGE CLAMP, gray (1 per DI)' },
  { ...WQ, key: 'tb2LevelEnd', partNo: '2002-2292', price: 31.23, description: 'WAGO end and intermediate plate, 0.8 mm thick, orange — for 2002-2201 double-deck terminals' },
  { ...WQ, key: 'tbFuse', partNo: '2002-1611/1000-541', price: 279.66,
    description: 'WAGO 2-conductor fuse terminal block with pivoting fuse holder, with end plate, for 5 x 20 mm miniature metric fuse, blown fuse indication by LED 12-30 V, for DIN-rail 35 x 15 and 35 x 7.5, 2.5 mm², Push-in CAGE CLAMP, gray' },
  { ...WQ, key: 'tbStd', partNo: '2002-1201', price: 26.45, description: 'WAGO 2-conductor through terminal block for DIN-rail, gray, Push-in CAGE CLAMP, 2.5 mm², 24 A, 800 V' },
  { ...WQ, key: 'tbStdEnd', partNo: '2002-1292', price: 34.94, description: 'WAGO end and intermediate plate, 0.8 mm thick, orange — for 2002-1201 terminals' },
  { ...WQ, key: 'tbPe', partNo: '2002-1207', price: 163.1, description: 'WAGO 2-conductor ground terminal block, 2.5 mm², for DIN-rail 35 x 15 and 35 x 7.5, Push-in CAGE CLAMP, green-yellow' },
  { ...WQ, key: 'jumper10', partNo: '2002-410', price: 250.57, description: 'WAGO jumper (shorting link), 10-way, insulated, light gray — for 2002 series' },
  { ...WQ, key: 'relay', partNo: '857-304', price: 554.69,
    description: 'WAGO relay module, nominal input voltage 24 V DC, 1 changeover contact, limiting continuous current 6 A, yellow status indicator, module width 6 mm, gray (TRS 24VDC 1CO equivalent, 1 per DO)' },
  { ...W, verify: true, key: 'relayJumper', partNo: '859-402', description: 'WAGO jumper (shorting link) for 857 relay modules, insulated, 2-way — coil common (A2 / 0 V)' },
  { ...WQ, key: 'endStop', partNo: '249-116', price: 51.69, description: 'WAGO screwless end stop, 6 mm wide, for DIN-rail 35 x 15 and 35 x 7.5, gray' },
  { ...WQ, key: 'markers', partNo: '2009-115', price: 2.37, description: 'WAGO WMB-Inline marker for Smart Printer, stretchable 5 - 5.2 mm, plain, snap-on type, white (1 per terminal)' },
  { ...W, verify: true, key: 'dinRail', partNo: '210-113', description: 'WAGO steel DIN rail 35 x 7.5 mm, 1 mm thick, slotted, 2 m length' },
  { ...W, verify: true, key: 'ferrule05', partNo: '216-201', description: '0.5mm2 ferrule' },
  { key: 'fuse5x20', brand: '', partNo: '', price: 0, description: 'Miniature glass fuse 5 x 20 mm, 0.5 A fast-acting — for the analog fuse terminals' },
  { key: 'wireRed', brand: '', partNo: '', price: WIRE_ROLL_PRICE, uom: 'roll', description: `Stranded hook-up wire 0.5 mm² (20 AWG), red — +24 V DC signal wiring, ${WIRE_ROLL_M} m roll` },
  { key: 'wireBlue', brand: '', partNo: '', price: WIRE_ROLL_PRICE, uom: 'roll', description: `Stranded hook-up wire 0.5 mm² (20 AWG), blue — 0 V DC signal wiring, ${WIRE_ROLL_M} m roll` },
];

export interface WiringSummary {
  redWires: number;
  blueWires: number;
  /** Average length per wire (m), from the panel size. */
  runM: number;
  redM: number;
  blueM: number;
  terminals: number;
  railMm: number;
}

export interface TerminalStripInput {
  /** Digital inputs / outputs incl. spare. */
  di: number;
  dq: number;
  /** Analog points (in + out, incl. spare) wired 2-wire / 4-wire. */
  a2: number;
  a4: number;
  /** Devices fed from the +24 V / 0 V distribution, incl. the PSU feed. */
  distPoints: number;
  /** DIN rail the controller / I/O modules take on the same rail (mm). */
  extraRailMm: number;
  /** What the DIN-rail line says it covers. */
  railFor: string;
  panelW: number;
  panelH: number;
}

export type StripSection = 'terminals' | 'wiring';
export interface StripLine { key: string; qty: number; why: string; section: StripSection }

export function terminalStrip(t: TerminalStripInput): { lines: StripLine[]; wiring: WiringSummary } {
  const { di, dq, a2, a4, distPoints } = t;
  const fused = a2 + 2 * a4;
  const std = a2 + 2 * a4;
  const diJumpers = Math.ceil(di / 10);
  const relayGroups = Math.ceil(dq / 16);
  const relayJumpers = dq - relayGroups;
  const distJumpers = 2 * Math.ceil(distPoints / 10);
  const pe = 2; // PSU earth + DIN-rail / shield earth
  const groups = (di ? 1 : 0) + (dq ? 1 : 0) + (fused ? 1 : 0) + 1;
  const endStops = 2 * groups;
  const tb2End = di ? 1 : 0;
  // The analog group ends on a fuse terminal, which comes with its own end
  // plate; only the +24 V / 0 V distribution group needs a 2002-1292.
  const stdEnd = 1;
  const terminals = di + dq + fused + std + 2 * distPoints + pe;
  const railMm = Math.ceil((di * 5.2 + dq * 6 + fused * 8 + (std + 2 * distPoints + pe) * 5.2 + (tb2End + stdEnd) * 0.8 + endStops * 6
    + t.extraRailMm) * 1.2);

  const redWires = di + dq + fused + distPoints + diJumpers;
  const blueWires = std + distPoints + relayGroups;
  const runM = Math.round(((Math.max(0, t.panelW) + Math.max(0, t.panelH)) / 2000 + 0.3) * 100) / 100;
  const redM = Math.ceil(redWires * runM * 1.1);
  const blueM = Math.ceil(blueWires * runM * 1.1);
  const ferrules = Math.ceil(((redWires + blueWires) * 2 * 1.1) / 100) * 100;

  const lines: StripLine[] = [];
  const add = (key: string, qty: number, why: string, section: StripSection = 'terminals') => { if (qty > 0) lines.push({ key, qty, why, section }); };
  add('tb2Level', di, '1 double-deck terminal per DI (incl. spare)');
  add('tb2LevelEnd', tb2End, 'Closes the DI terminal group');
  add('relay', dq, '1 slim relay per DO (incl. spare)');
  add('relayJumper', relayJumpers, `Bridges the relay coil commons (A2 → 0 V), ${relayGroups} group${relayGroups === 1 ? '' : 's'} of up to 16`);
  add('tbFuse', fused, `Analog: 1 per 2-wire point (${a2}), 2 per 4-wire point (${a4})`);
  add('fuse5x20', fused, 'Fuse insert for each fuse terminal');
  add('tbStd', std + 2 * distPoints, `Analog: 1 per 2-wire point, 2 per 4-wire point (${std}); +24 V / 0 V distribution for the controller, I/O stations, panels, switches and the PSU feed (${2 * distPoints})`);
  add('tbPe', pe, 'PSU earth and DIN-rail / shield earth');
  add('tbStdEnd', stdEnd, 'Closes the distribution group (fuse terminals carry their own end plate)');
  add('jumper10', diJumpers + distJumpers, `Shorting links: DI 24 V level (${diJumpers}), +24 V / 0 V distribution (${distJumpers})`);
  add('endStop', endStops, `2 per terminal group (${groups} groups)`);
  add('markers', terminals, '1 marker per terminal / relay');
  add('dinRail', Math.ceil(railMm / 2000), `≈ ${(railMm / 1000).toFixed(1)} m of rail for ${t.railFor} (+20%)`);
  add('wireRed', Math.ceil(redM / WIRE_ROLL_M), `0.5 mm² red (+24 V DC): ${redWires} wires × ${runM} m ≈ ${redM} m`, 'wiring');
  add('wireBlue', Math.ceil(blueM / WIRE_ROLL_M), `0.5 mm² blue (0 V DC): ${blueWires} wires × ${runM} m ≈ ${blueM} m`, 'wiring');
  add('ferrule05', ferrules, 'Both ends of every 0.5 mm² wire (+10%)', 'wiring');
  return { lines, wiring: { redWires, blueWires, runM, redM, blueM, terminals, railMm } };
}
