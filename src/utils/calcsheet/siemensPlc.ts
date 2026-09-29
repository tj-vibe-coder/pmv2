// Siemens PLC configurator — turns an I/O count (DI / DO / AI / AO), the PLC
// family (S7-1200 or S7-1500) and the Modbus need into the module list:
// CPU, memory card, ET 200SP remote I/O (interface bundle + I/O modules +
// BaseUnits), Modbus hardware and a SITOP 24 V supply. Pure logic — see
// SiemensPlcDialog.tsx for the popup.
//
// Rules (Siemens system manuals):
//  • S7-1200 CPU 1214C DC/DC/DC has 14 DI, 10 DQ and 2 AI (0–10 V) on board;
//    anything beyond goes to ET 200SP over PROFINET.
//  • S7-1500 CPU 1513-1 PN has no on-board I/O and REQUIRES a SIMATIC Memory
//    Card; all I/O is ET 200SP.
//  • ET 200SP: IM 155-6 PN ST takes up to 32 modules per station; every
//    module sits on its own BaseUnit (type A0). The first BaseUnit of a station
//    must be a light one (BU…+2D, opens the potential group); the rest are
//    dark (BU…+2B, bridged to the left). The server module and BusAdapter
//    come in the IM bundle.
//  • Modbus TCP is built into both CPUs' PROFINET port (no hardware).
//    Modbus RTU (RS-485): S7-1200 → CB 1241 on the CPU (one port; more ports
//    via ET 200SP CM PtP); S7-1500 → one ET 200SP CM PtP per port.

export type PlcFamily = 'S7-1200' | 'S7-1500';
export type ModbusMode = 'none' | 'tcp' | 'rtu';
export type SitopModel = 'none' | 'PSU100S' | 'PSU8200';

export type SiemensPartKey =
  | 'cpu1214' | 'cpu1513' | 'memCard' | 'cb1241'
  | 'imBundle' | 'di16' | 'dq16' | 'ai8' | 'aq4' | 'cmPtp'
  | 'buLight' | 'buDark' | 'psu100s' | 'psu8200';

export interface SiemensPart {
  key: SiemensPartKey;
  partNo: string;
  description: string;
  /** Default unit price (₱) from supplier quotes; 0 = not priced yet. */
  price: number;
}

// Prices from the Siemens supplier quotes TJ supplied (2026). A catalog item
// with the same part number (Sales → Pricelists) overrides these.
export const SIEMENS_PARTS: Record<SiemensPartKey, SiemensPart> = {
  cpu1214: { key: 'cpu1214', partNo: '6ES7214-1AG40-0XB0', price: 24059.81,
    description: 'SIMATIC S7-1200, CPU 1214C, compact CPU, DC/DC/DC, onboard I/O: 14 DI 24 V DC; 10 DO 24 V DC; 2 AI 0-10 V DC, power supply: DC 20.4-28.8 V DC, program/data memory 150 KB' },
  cpu1513: { key: 'cpu1513', partNo: '6ES7513-1AM03-0AB0', price: 124083.35,
    description: 'SIMATIC S7-1500, CPU 1513-1 PN, central processing unit with work memory 600 KB for program and 2.5 MB for data, 1st interface: PROFINET IRT with 2-port switch, 6 ns bit performance, SIMATIC Memory Card required' },
  memCard: { key: 'memCard', partNo: '6ES7954-8LL04-0AA0', price: 19533.25,
    description: 'SIMATIC S7, memory card for S7-1x00 CPU, 3.3 V Flash, 256 MB' },
  cb1241: { key: 'cb1241', partNo: '6ES7241-1CH30-1XB0', price: 4995.65,
    description: 'SIMATIC S7-1200, Communication Board CB 1241, RS485, terminal block, supports Freeport (Modbus RTU)' },
  imBundle: { key: 'imBundle', partNo: '6ES7155-6AA02-0BN0', price: 21697.11,
    description: 'SIMATIC ET 200SP, bundle PROFINET interface module IM 155-6 PN ST, max. 32 I/O modules and 16 ET 200AL modules, bundle consists of: interface module (6ES7155-6AU02-0BN0), server module (6ES7193-6PA00-0AA0), SIMATIC bus adapter BA 2x RJ45 (6ES7193-6AR00-0AA0)' },
  di16: { key: 'di16', partNo: '6ES7131-6BH01-0BA0', price: 6218.99,
    description: 'SIMATIC ET 200SP, Digital input module, DI 16x 24V DC Standard, type 3 (IEC 61131), sink input (PNP, P-reading), fits to BU-type A0, Colour Code CC00' },
  dq16: { key: 'dq16', partNo: '6ES7132-6BH01-0BA0', price: 7255.57,
    description: 'SIMATIC ET 200SP, Digital output module, DQ 16x 24V DC/0.5A Standard, Source output (PNP, P-switching), fits to BU-type A0, Colour Code CC00' },
  ai8: { key: 'ai8', partNo: '6ES7134-6GF00-0AA1', price: 16583.83,
    description: 'SIMATIC ET 200SP, Analog input module, AI 8xI 2-/4-wire Basic, suitable for BU type A0, A1, Color code CC01, Module diagnostics, 16 bit' },
  aq4: { key: 'aq4', partNo: '6ES7135-6HD00-0BA1', price: 14850.27,
    description: 'SIMATIC ET 200SP, Analog output module, AQ 4xU/I Standard, suitable for BU type A0, A1, Color code CC00, Module diagnostics, 16 bit, +/-0.3%' },
  cmPtp: { key: 'cmPtp', partNo: '6ES7137-6AA01-0BA0', price: 22526.27,
    description: 'SIMATIC ET 200SP, CM PtP communication module for serial connection RS-422, RS-485 and RS-232, freeport, 3964 (R), USS, MODBUS RTU master, slave, max. 250 Kbit/s, suitable for BU type A0' },
  buLight: { key: 'buLight', partNo: '6ES7193-6BP00-0DA0', price: 1600,
    description: 'SIMATIC ET 200SP, BaseUnit BU15-P16+A0+2D, BU type A0, Push-in terminals, without AUX terminals, new load group (light), WxH: 15x 117 mm' },
  buDark: { key: 'buDark', partNo: '6ES7193-6BP00-0BA0', price: 1105.71,
    description: 'SIMATIC ET 200SP, BaseUnit BU15-P16+A0+2B, BU type A0, Push-in terminals, without AUX terminals, bridged to the left, WxH: 15x 117 mm' },
  psu100s: { key: 'psu100s', partNo: '6EP1336-2BA10', price: 27429.76,
    description: 'SITOP PSU100S 20 A stabilized power supply input: 120/230 V AC output: 24 V DC/20 A' },
  psu8200: { key: 'psu8200', partNo: '6EP1336-3BA10', price: 33406.14,
    description: 'SITOP PSU8200 20 A stabilized power supply input: 120-230 V AC 110-220 V DC output: 24 V DC/20 A' },
};

export interface PlcInputs {
  family: PlcFamily;
  di: number;
  do: number;
  ai: number;
  ao: number;
  /** Extra channels for future use, applied to each I/O type in use (%). */
  sparePct: number;
  modbus: ModbusMode;
  /** RS-485 ports needed (Modbus RTU only). */
  modbusPorts: number;
  sitop: SitopModel;
  /** S7-1200: count the CPU's two 0–10 V inputs toward AI (off = all AI are 4–20 mA on modules). */
  useOnboardAi: boolean;
  /** S7-1200: include a memory card (always included for S7-1500, where it's required). */
  memoryCard: boolean;
  /** 24 V load per digital output, for PSU sizing (A) — interposing relay / pilot light ≈ 0.1 A. */
  doLoadA: number;
  /** Safety margin added to the estimated 24 V load when suggesting a PSU (%). */
  psuMarginPct: number;
}

export const DEFAULT_PLC_INPUTS: PlcInputs = {
  family: 'S7-1200', di: 0, do: 0, ai: 0, ao: 0, sparePct: 10,
  modbus: 'none', modbusPorts: 1, sitop: 'none', useOnboardAi: false, memoryCard: false,
  doLoadA: 0.1, psuMarginPct: 25,
};

export const CHANNELS = { di16: 16, dq16: 16, ai8: 8, aq4: 4 } as const;
const ONBOARD_1214 = { di: 14, do: 10, ai: 2 } as const;
export const IM_MAX_MODULES = 32;

export interface PlcLine { key: SiemensPartKey; qty: number; why: string }

export interface PlcChannels { needed: number; provided: number }

export interface PlcConfig {
  lines: PlcLine[];
  channels: { di: PlcChannels; do: PlcChannels; ai: PlcChannels; ao: PlcChannels };
  stations: number;
  ioModules: number;
  notes: string[];
}

const withSpare = (n: number, pct: number) => (n > 0 ? Math.ceil(n * (1 + Math.max(0, pct) / 100)) : 0);
const whole = (n: number) => Math.max(0, Math.round(Number(n) || 0));

export function configurePlc(raw: PlcInputs): PlcConfig {
  const inp = { ...raw, di: whole(raw.di), do: whole(raw.do), ai: whole(raw.ai), ao: whole(raw.ao), modbusPorts: Math.max(1, whole(raw.modbusPorts)) };
  const is1200 = inp.family === 'S7-1200';
  const need = { di: withSpare(inp.di, inp.sparePct), do: withSpare(inp.do, inp.sparePct), ai: withSpare(inp.ai, inp.sparePct), ao: withSpare(inp.ao, inp.sparePct) };
  const onboard = is1200 ? { di: ONBOARD_1214.di, do: ONBOARD_1214.do, ai: inp.useOnboardAi ? ONBOARD_1214.ai : 0 } : { di: 0, do: 0, ai: 0 };

  const diMods = Math.ceil(Math.max(0, need.di - onboard.di) / CHANNELS.di16);
  const dqMods = Math.ceil(Math.max(0, need.do - onboard.do) / CHANNELS.dq16);
  const aiMods = Math.ceil(Math.max(0, need.ai - onboard.ai) / CHANNELS.ai8);
  const aqMods = Math.ceil(need.ao / CHANNELS.aq4);

  const rtuPorts = inp.modbus === 'rtu' ? inp.modbusPorts : 0;
  const useCb = is1200 && rtuPorts >= 1;
  const cmMods = is1200 ? Math.max(0, rtuPorts - 1) : rtuPorts;

  const ioModules = diMods + dqMods + aiMods + aqMods + cmMods;
  const stations = ioModules > 0 ? Math.ceil(ioModules / IM_MAX_MODULES) : 0;

  const lines: PlcLine[] = [];
  const add = (key: SiemensPartKey, qty: number, why: string) => { if (qty > 0) lines.push({ key, qty, why }); };
  add(is1200 ? 'cpu1214' : 'cpu1513', 1, is1200 ? 'CPU — 14 DI / 10 DQ / 2 AI on board' : 'CPU — all I/O on ET 200SP');
  if (!is1200) add('memCard', 1, 'Required by every S7-1500 CPU');
  else if (inp.memoryCard) add('memCard', 1, 'Optional on S7-1200 (program backup / transfer)');
  add('cb1241', useCb ? 1 : 0, 'Modbus RTU port on the CPU (1 × RS-485)');
  add('imBundle', stations, `ET 200SP station${stations === 1 ? '' : 's'} — max ${IM_MAX_MODULES} modules each (incl. server module + BusAdapter)`);
  add('di16', diMods, `${CHANNELS.di16} DI each`);
  add('dq16', dqMods, `${CHANNELS.dq16} DQ each`);
  add('ai8', aiMods, `${CHANNELS.ai8} AI (4–20 mA) each`);
  add('aq4', aqMods, `${CHANNELS.aq4} AQ each`);
  add('cmPtp', cmMods, is1200 ? 'Extra Modbus RTU ports (CB 1241 gives only one)' : '1 per Modbus RTU (RS-485) port');
  add('buLight', stations, 'First BaseUnit of each station (starts the potential group)');
  add('buDark', ioModules - stations, 'One BaseUnit per remaining module');
  if (inp.sitop !== 'none') add(inp.sitop === 'PSU8200' ? 'psu8200' : 'psu100s', 1, `24 V DC supply — ${PSU_RATING_A[inp.sitop]} A`);

  const notes: string[] = [];
  if (inp.modbus === 'tcp') notes.push('Modbus TCP runs on the CPU\'s PROFINET port — no extra hardware.');
  if (is1200 && inp.ai > 0 && !inp.useOnboardAi) notes.push('The CPU\'s 2 on-board AI are 0–10 V only, so 4–20 mA inputs go on AI 8xI modules.');
  if (stations > 1) notes.push(`${ioModules} modules need ${stations} ET 200SP stations (32 modules per IM 155-6 PN ST).`);

  const provided = {
    di: onboard.di + diMods * CHANNELS.di16,
    do: onboard.do + dqMods * CHANNELS.dq16,
    ai: onboard.ai + aiMods * CHANNELS.ai8,
    ao: aqMods * CHANNELS.aq4,
  };
  return {
    lines,
    channels: {
      di: { needed: need.di, provided: provided.di },
      do: { needed: need.do, provided: provided.do },
      ai: { needed: need.ai, provided: provided.ai },
      ao: { needed: need.ao, provided: provided.ao },
    },
    stations,
    ioModules,
    notes,
  };
}

// ── 24 V DC load estimate (for choosing the SITOP) ───────────────────────
// Typical draws, rounded up — CPU and interface module from Siemens
// datasheets; module electronics and field loads are planning figures. The
// DO load and the margin are inputs because they depend on what's wired.
export const PSU_RATING_A: Record<Exclude<SitopModel, 'none'>, number> = { PSU100S: 20, PSU8200: 20 };
/** Standard SITOP output ratings to suggest from. */
export const SITOP_RATINGS_A = [2.5, 5, 10, 20, 40];

export interface LoadLine { label: string; qty: number; eachA: number; totalA: number }
export interface LoadEstimate { lines: LoadLine[]; totalA: number; withMarginA: number; suggestedA: number | null }

export function estimate24V(raw: PlcInputs, cfg: PlcConfig): LoadEstimate {
  const count = (k: SiemensPartKey) => cfg.lines.find((l) => l.key === k)?.qty ?? 0;
  const lines: LoadLine[] = [];
  const add = (label: string, qty: number, eachA: number) => { if (qty > 0) lines.push({ label, qty, eachA, totalA: qty * eachA }); };
  add(raw.family === 'S7-1200' ? 'CPU 1214C DC/DC/DC' : 'CPU 1513-1 PN', 1, raw.family === 'S7-1200' ? 0.5 : 0.7);
  add('ET 200SP interface module (per station)', count('imBundle'), 0.2);
  add('DI 16 module electronics', count('di16'), 0.05);
  add('DQ 16 module electronics', count('dq16'), 0.05);
  add('AI 8 module electronics', count('ai8'), 0.03);
  add('AQ 4 module electronics', count('aq4'), 0.05);
  add('CM PtP module', count('cmPtp'), 0.05);
  add('Digital inputs — sensor + input current', cfg.channels.di.needed, 0.01);
  add('Digital outputs — field load', cfg.channels.do.needed, Math.max(0, Number(raw.doLoadA) || 0));
  add('Analog inputs — 2-wire 4–20 mA loop', cfg.channels.ai.needed, 0.02);
  add('Analog outputs', cfg.channels.ao.needed, 0.02);
  const totalA = Math.round(lines.reduce((a, l) => a + l.totalA, 0) * 100) / 100;
  const withMarginA = Math.round(totalA * (1 + Math.max(0, Number(raw.psuMarginPct) || 0) / 100) * 100) / 100;
  const suggestedA = SITOP_RATINGS_A.find((r) => r >= withMarginA) ?? null;
  return { lines, totalA, withMarginA, suggestedA };
}

export interface SiemensCatalogItem { catalogNo: string; sellingPrice: number; pricelistDate?: string }

/** Unit price for a part: a catalog item with the same part number wins, else the quoted default. */
export function siemensPrice(part: SiemensPart, catalog: SiemensCatalogItem[]): { price: number; source: 'catalog' | 'quote' | 'none' } {
  const code = part.partNo.toUpperCase();
  const hit = catalog
    .filter((c) => (c.catalogNo || '').trim().toUpperCase() === code && (c.sellingPrice || 0) > 0)
    .sort((a, b) => String(b.pricelistDate || '').localeCompare(String(a.pricelistDate || '')))[0];
  if (hit) return { price: hit.sellingPrice, source: 'catalog' };
  return part.price > 0 ? { price: part.price, source: 'quote' } : { price: 0, source: 'none' };
}
