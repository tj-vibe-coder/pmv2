// Siemens PLC configurator — turns an I/O count (DI / DO and analog I/O by
// signal type and wiring), the PLC family + CPU model (optionally redundant),
// the Modbus need and the network into the module list: CPU, memory card,
// ET 200SP remote I/O (interface module + I/O modules + BaseUnits), Modbus
// hardware, SCALANCE switches, HMI panel, SCADA license, a 24 V supply and —
// optionally — the WAGO terminals, relays, accessories and 0.5 mm² wiring for
// the panel. Pure logic — see SiemensPlcDialog.tsx for the popup.
//
// Rules (Siemens system manuals):
//  • S7-1200 compact CPUs carry on-board I/O (1214C: 14 DI, 10 DQ, 2 AI
//    0–10 V; 1215C/1217C add 2 AQ 0–20 mA); anything beyond goes to ET 200SP
//    over PROFINET.
//  • S7-1500 standard CPUs have no on-board I/O (the 1511C/1512C compact ones
//    do) and REQUIRE a SIMATIC Memory Card; the rest of the I/O is ET 200SP.
//  • S7-1500R (2 × 1513R / 1515R) and S7-1500H (bundle: 2 × 1517H + sync
//    modules + sync cables) are redundant pairs — one memory card per CPU,
//    ET 200SP stations on IM 155-6 PN/2 HF (system redundancy S2, 64 modules),
//    and a PROFINET ring (MRP), so the switches must be managed.
//  • ET 200SP: IM 155-6 PN ST takes up to 32 modules per station; every
//    module sits on its own BaseUnit. The first BaseUnit of a station must be
//    a light one (…+2D, opens the potential group); the rest are dark (…+2B,
//    bridged to the left). Thermocouple modules sit on type A1 BaseUnits
//    (…/T, with the temperature sensor for internal cold-junction
//    compensation); everything else here on type A0.
//  • Analog modules by signal: 4–20 mA → AI 8xI 2-/4-wire BA; 0–10 V →
//    AI 8xU BA; RTD 2-wire and thermocouples → AI 8xRTD/TC 2-wire HF; RTD
//    3-/4-wire → AI 4xRTD/TC 2-/3-/4-wire HF; AO (U or I) → AQ 4xU/I ST.
//  • Modbus TCP is built into both CPUs' PROFINET port (no hardware).
//    Modbus RTU (RS-485): S7-1200 → CB 1241 on the CPU (one port; more ports
//    via ET 200SP CM PtP); S7-1500 → one ET 200SP CM PtP per port.
//
// Terminals & wiring (IOCT panel practice, WAGO TOPJOB S):
//  • 1 DI = one 2-level terminal; 1 DQ = one slim relay module (WAGO 857-304,
//    the TRS 24VDC 1CO equivalent); 1 analog point 2-wire = 1 fused +
//    1 standard terminal, 4-wire = 2 fused + 2 standard.
//  • Signal wiring is 0.5 mm² — red for +24 V DC, blue for 0 V DC — with
//    ferrules on both ends; length follows the panel size.
//
// Prices: parts marked `quoted` carry the price and part number from the
// supplier quotes TJ supplied (2026) or the ISTS WAGO inventory. The rest are
// listed so the BOM is complete — price 0 ("for inquiry"); Siemens part
// numbers were checked in the TIA Selection Tool (Sep 2026) except those
// marked `verify`. A catalog item with the same part number (Sales →
// Pricelists) overrides any price here.

export type PlcFamily = 'S7-1200' | 'S7-1500';
export type ModbusMode = 'none' | 'tcp' | 'rtu';
export type HmiLine = 'basic' | 'comfort' | 'unified';
export type ScadaKind = 'none' | 'wincc81' | 'unifiedPc';
export type WinccLicense = 'RC' | 'RT';
/** License delivery: standard (license on USB stick), Asia edition, or download (WinCC V8.1 only). */
export type LicenseEdition = 'standard' | 'asia' | 'dl';
export type Redundancy = 'none' | 'R' | 'H';
export type SwitchType = 'unmanaged' | 'managed';

export interface SiemensPart {
  key: string;
  /** '' = not known yet — the supplier fills it in. */
  partNo: string;
  description: string;
  /** Default unit price (₱) from supplier quotes; 0 = not priced (for inquiry). */
  price: number;
  /** Part number and price come from a supplier quote (others: confirm the part number). */
  quoted?: boolean;
  /** Maker — defaults to Siemens. */
  brand?: string;
  /** Unit of measure — defaults to 'pc'. */
  uom?: string;
  /** Part number not confirmed yet — shown as "verify P/N". */
  verify?: boolean;
}

// ── Analog signal types ──────────────────────────────────────────────────
export type AnalogKey = 'aiI' | 'aiU' | 'aiRtd' | 'aiTc' | 'aoI' | 'aoU';
/** Points per wiring: `w2` 2-wire, `w4` 4-wire (3-/4-wire for RTD). */
export interface AnalogCount { w2: number; w4: number }

export const ANALOG_KINDS: { key: AnalogKey; dir: 'ai' | 'ao'; label: string; w4Label: string | null }[] = [
  { key: 'aiI', dir: 'ai', label: 'AI 4–20 mA', w4Label: '4-wire' },
  { key: 'aiU', dir: 'ai', label: 'AI 0–10 V', w4Label: '4-wire' },
  { key: 'aiRtd', dir: 'ai', label: 'AI RTD (Pt100)', w4Label: '3-/4-wire' },
  { key: 'aiTc', dir: 'ai', label: 'AI thermocouple', w4Label: null },
  { key: 'aoI', dir: 'ao', label: 'AO 4–20 mA', w4Label: '4-wire' },
  { key: 'aoU', dir: 'ao', label: 'AO 0–10 V', w4Label: '4-wire' },
];
const ANALOG_KEYS = ANALOG_KINDS.map((k) => k.key);

export const noAnalog = (): Record<AnalogKey, AnalogCount> =>
  Object.fromEntries(ANALOG_KEYS.map((k) => [k, { w2: 0, w4: 0 }])) as Record<AnalogKey, AnalogCount>;

// ── CPUs ─────────────────────────────────────────────────────────────────
export interface CpuModel {
  key: string;
  family: PlcFamily;
  /** Short name for pickers, e.g. "1214C DC/DC/DC". */
  label: string;
  onboard: { di: number; do: number; ai: number; ao: number };
  /** Signal types the on-board AI / AO accept (S7-1200: AI 0–10 V, AQ 0–20 mA). */
  onboardAi: AnalogKey[];
  onboardAo: AnalogKey[];
  /** Draw from the 24 V supply per CPU (A, planning figure); 0 = CPU fed from 120/230 V AC. */
  drawA: number;
  relayOutputs?: boolean;
  failSafe?: boolean;
  /** Redundant system this CPU belongs to (bought and fitted as a pair). */
  redundancy?: 'R' | 'H';
  /** Work memory, e.g. "300 KB program, 1.5 MB data" (S7-1500). */
  memory?: string;
}

const cpu1200 = (key: string, model: string, variant: 'DC/DC/DC' | 'AC/DC/RLY' | 'DC/DC/RLY', io: [number, number, number, number], drawA: number, failSafe = false): CpuModel => ({
  key, family: 'S7-1200', label: `${model} ${variant}${failSafe ? ' (fail-safe)' : ''}`,
  onboard: { di: io[0], do: io[1], ai: io[2], ao: io[3] }, onboardAi: ['aiU'], onboardAo: ['aoI'],
  drawA: variant === 'AC/DC/RLY' ? 0 : drawA, relayOutputs: variant !== 'DC/DC/DC', failSafe,
});
const cpu1500 = (key: string, label: string, drawA: number, memory: string | undefined, opts: Partial<Pick<CpuModel, 'onboard' | 'failSafe' | 'redundancy'>> = {}): CpuModel => ({
  key, family: 'S7-1500', label, onboard: opts.onboard ?? { di: 0, do: 0, ai: 0, ao: 0 },
  onboardAi: ['aiI', 'aiU'], onboardAo: ['aoI', 'aoU'], drawA, failSafe: opts.failSafe ?? false, redundancy: opts.redundancy, memory,
});

export const CPU_MODELS: CpuModel[] = [
  cpu1200('cpu1211', 'CPU 1211C', 'DC/DC/DC', [6, 4, 2, 0], 0.4),
  cpu1200('cpu1211ac', 'CPU 1211C', 'AC/DC/RLY', [6, 4, 2, 0], 0.4),
  cpu1200('cpu1211rly', 'CPU 1211C', 'DC/DC/RLY', [6, 4, 2, 0], 0.4),
  cpu1200('cpu1212', 'CPU 1212C', 'DC/DC/DC', [8, 6, 2, 0], 0.4),
  cpu1200('cpu1212ac', 'CPU 1212C', 'AC/DC/RLY', [8, 6, 2, 0], 0.4),
  cpu1200('cpu1212rly', 'CPU 1212C', 'DC/DC/RLY', [8, 6, 2, 0], 0.4),
  cpu1200('cpu1214', 'CPU 1214C', 'DC/DC/DC', [14, 10, 2, 0], 0.5),
  cpu1200('cpu1214ac', 'CPU 1214C', 'AC/DC/RLY', [14, 10, 2, 0], 0.5),
  cpu1200('cpu1214rly', 'CPU 1214C', 'DC/DC/RLY', [14, 10, 2, 0], 0.5),
  cpu1200('cpu1215', 'CPU 1215C', 'DC/DC/DC', [14, 10, 2, 2], 0.5),
  cpu1200('cpu1215ac', 'CPU 1215C', 'AC/DC/RLY', [14, 10, 2, 2], 0.5),
  cpu1200('cpu1215rly', 'CPU 1215C', 'DC/DC/RLY', [14, 10, 2, 2], 0.5),
  cpu1200('cpu1217', 'CPU 1217C', 'DC/DC/DC', [14, 10, 2, 2], 0.6),
  cpu1200('cpu1212f', 'CPU 1212FC', 'DC/DC/DC', [8, 6, 2, 0], 0.4, true),
  cpu1200('cpu1214f', 'CPU 1214FC', 'DC/DC/DC', [14, 10, 2, 0], 0.5, true),
  cpu1200('cpu1215f', 'CPU 1215FC', 'DC/DC/DC', [14, 10, 2, 2], 0.5, true),
  cpu1500('cpu1511', 'CPU 1511-1 PN', 0.6, '300 KB program, 1.5 MB data'),
  cpu1500('cpu1513', 'CPU 1513-1 PN', 0.7, '600 KB program, 2.5 MB data'),
  cpu1500('cpu1515', 'CPU 1515-2 PN', 0.8, '1 MB program, 4.5 MB data'),
  cpu1500('cpu1516', 'CPU 1516-3 PN/DP', 0.9, '2 MB program, 7.5 MB data'),
  cpu1500('cpu1511c', 'CPU 1511C-1 PN (compact)', 0.8, '300 KB program, 1.5 MB data', { onboard: { di: 16, do: 16, ai: 4, ao: 2 } }),
  cpu1500('cpu1512c', 'CPU 1512C-1 PN (compact)', 0.9, '400 KB program, 2 MB data', { onboard: { di: 32, do: 32, ai: 4, ao: 2 } }),
  cpu1500('cpu1511f', 'CPU 1511F-1 PN (fail-safe)', 0.6, '450 KB program, 1.5 MB data', { failSafe: true }),
  cpu1500('cpu1513f', 'CPU 1513F-1 PN (fail-safe)', 0.7, '900 KB program, 2.5 MB data', { failSafe: true }),
  cpu1500('cpu1515f', 'CPU 1515F-2 PN (fail-safe)', 0.8, '1.5 MB program, 4.5 MB data', { failSafe: true }),
  cpu1500('cpu1516f', 'CPU 1516F-3 PN/DP (fail-safe)', 0.9, '3 MB program, 7.5 MB data', { failSafe: true }),
  cpu1500('cpu1513r', 'CPU 1513R-1 PN (S7-1500R)', 0.7, undefined, { redundancy: 'R' }),
  cpu1500('cpu1515r', 'CPU 1515R-2 PN (S7-1500R)', 0.8, undefined, { redundancy: 'R' }),
  cpu1500('cpu1517h', 'CPU 1517H-3 PN (S7-1500H bundle)', 1.0, undefined, { redundancy: 'H' }),
];
export const DEFAULT_CPU: Record<PlcFamily, string> = { 'S7-1200': 'cpu1214', 'S7-1500': 'cpu1513' };
export const DEFAULT_REDUNDANT_CPU: Record<'R' | 'H', string> = { R: 'cpu1513r', H: 'cpu1517h' };

export const REDUNDANCY_OPTIONS: { value: Redundancy; label: string }[] = [
  { value: 'none', label: 'None (single CPU)' },
  { value: 'R', label: 'S7-1500R — redundant over the PROFINET ring' },
  { value: 'H', label: 'S7-1500H — redundant with fibre sync' },
];

/** CPUs offered for a family + redundancy mode. */
export function cpuChoices(family: PlcFamily, redundancy: Redundancy = 'none'): CpuModel[] {
  if (redundancy !== 'none') return CPU_MODELS.filter((m) => m.redundancy === redundancy);
  return CPU_MODELS.filter((m) => m.family === family && !m.redundancy);
}

export function cpuModel(family: PlcFamily, key: string, redundancy: Redundancy = 'none'): CpuModel {
  const choices = cpuChoices(family, redundancy);
  const fallback = redundancy !== 'none' ? DEFAULT_REDUNDANT_CPU[redundancy] : DEFAULT_CPU[family];
  return choices.find((m) => m.key === key) ?? CPU_MODELS.find((m) => m.key === fallback)!;
}

// ── S7-1500 mounting rail ("backplate") ──────────────────────────────────
// Every S7-1500 CPU mounts on its own S7-1500 mounting rail (not a DIN rail).
// All I/O here is ET 200SP, so the rail only carries the CPU: pick the
// shortest standard length the CPU fits on. One rail per CPU (R/H: 2).
export const CPU1500_WIDTH_MM: Record<string, number> = {
  cpu1511: 35, cpu1513: 35, cpu1515: 70, cpu1516: 70, cpu1511c: 85, cpu1512c: 110,
  cpu1511f: 35, cpu1513f: 35, cpu1515f: 70, cpu1516f: 70, cpu1513r: 35, cpu1515r: 70, cpu1517h: 175,
};
export const MOUNTING_RAILS: { key: string; lengthMm: number; partNo: string }[] = [
  { key: 'rail1500_160', lengthMm: 160, partNo: '6ES7590-1AB60-0AA0' },
  { key: 'rail1500_245', lengthMm: 245, partNo: '6ES7590-1AC40-0AA0' },
  { key: 'rail1500_482', lengthMm: 482, partNo: '6ES7590-1AE80-0AA0' },
  { key: 'rail1500_530', lengthMm: 530, partNo: '6ES7590-1AF30-0AA0' },
  { key: 'rail1500_830', lengthMm: 830, partNo: '6ES7590-1AJ30-0AA0' },
];
export function mountingRailFor(cpuKey: string) {
  const w = CPU1500_WIDTH_MM[cpuKey] ?? 70;
  return MOUNTING_RAILS.find((r) => r.lengthMm >= w) ?? MOUNTING_RAILS[MOUNTING_RAILS.length - 1];
}

// ── Memory cards ─────────────────────────────────────────────────────────
export const MEMORY_CARDS: { key: string; label: string }[] = [
  { key: 'memCard4', label: '4 MB' },
  { key: 'memCard12', label: '12 MB' },
  { key: 'memCard24', label: '24 MB' },
  { key: 'memCard', label: '256 MB' },
];

// ── HMI panels ───────────────────────────────────────────────────────────
export const HMI_LINES: { value: HmiLine; label: string }[] = [
  { value: 'basic', label: 'Basic Panel (KTP, 2nd gen)' },
  { value: 'comfort', label: 'Comfort Panel (TP)' },
  { value: 'unified', label: 'Unified Comfort Panel (MTP)' },
];
export interface HmiPanel { key: string; line: HmiLine; model: string; sizeIn: number; partNo: string; drawA: number }
export const HMI_PANELS: HmiPanel[] = [
  { key: 'ktp400', line: 'basic', model: 'KTP400 Basic', sizeIn: 4, partNo: '6AV2123-2DB03-0AX0', drawA: 0.15 },
  { key: 'ktp700', line: 'basic', model: 'KTP700 Basic', sizeIn: 7, partNo: '6AV2123-2GB03-0AX0', drawA: 0.25 },
  { key: 'ktp900', line: 'basic', model: 'KTP900 Basic', sizeIn: 9, partNo: '6AV2123-2JB03-0AX0', drawA: 0.25 },
  { key: 'ktp1200', line: 'basic', model: 'KTP1200 Basic', sizeIn: 12, partNo: '6AV2123-2MB03-0AX0', drawA: 0.5 },
  { key: 'tp700', line: 'comfort', model: 'TP700 Comfort', sizeIn: 7, partNo: '6AV2124-0GC01-0AX0', drawA: 0.5 },
  { key: 'tp900', line: 'comfort', model: 'TP900 Comfort', sizeIn: 9, partNo: '6AV2124-0JC01-0AX0', drawA: 0.6 },
  { key: 'tp1200', line: 'comfort', model: 'TP1200 Comfort', sizeIn: 12, partNo: '6AV2124-0MC01-0AX0', drawA: 0.8 },
  { key: 'tp1500', line: 'comfort', model: 'TP1500 Comfort', sizeIn: 15, partNo: '6AV2124-0QC02-0AX2', drawA: 1.1 },
  { key: 'tp1900', line: 'comfort', model: 'TP1900 Comfort', sizeIn: 19, partNo: '6AV2124-0UC02-0AX1', drawA: 1.4 },
  { key: 'tp2200', line: 'comfort', model: 'TP2200 Comfort', sizeIn: 22, partNo: '6AV2124-0XC02-0AX1', drawA: 1.6 },
  { key: 'mtp700', line: 'unified', model: 'MTP700 Unified Comfort', sizeIn: 7, partNo: '6AV2128-3GB06-0AX1', drawA: 0.5 },
  { key: 'mtp1000', line: 'unified', model: 'MTP1000 Unified Comfort', sizeIn: 10, partNo: '6AV2128-3KB06-0AX1', drawA: 0.7 },
  { key: 'mtp1200', line: 'unified', model: 'MTP1200 Unified Comfort', sizeIn: 12, partNo: '6AV2128-3MB06-0AX1', drawA: 0.8 },
  { key: 'mtp1500', line: 'unified', model: 'MTP1500 Unified Comfort', sizeIn: 15, partNo: '6AV2128-3QB06-0AX1', drawA: 1.1 },
  { key: 'mtp1900', line: 'unified', model: 'MTP1900 Unified Comfort', sizeIn: 19, partNo: '6AV2128-3UB06-0AX1', drawA: 1.4 },
  { key: 'mtp2200', line: 'unified', model: 'MTP2200 Unified Comfort', sizeIn: 22, partNo: '6AV2128-3XB06-0AX1', drawA: 1.6 },
];

// ── SCADA licenses (TIA Selection Tool, Sep 2026) ────────────────────────
// WinCC V8.1: 6AV6381-2B?08-1A?? — size letter per RC/RT, then AX0 standard
// (license on USB stick), AV0 Asia edition, AH0 download.
export const WINCC81_PACKAGES = ['128', '512', '2048', '8192', '65536', '102400'];
const WINCC81_CODE: Record<WinccLicense, Record<string, string>> = {
  RC: { 128: 'BM', 512: 'BN', 2048: 'BP', 8192: 'BS', 65536: 'BQ', 102400: 'BT' },
  RT: { 128: 'BC', 512: 'BD', 2048: 'BE', 8192: 'BH', 65536: 'BF', 102400: 'BJ' },
};
const WINCC81_SUFFIX: Record<LicenseEdition, string> = { standard: 'AX0', asia: 'AV0', dl: 'AH0' };
// WinCC Unified V21 PC Runtime package: 6AV2155-???02-5?A0 — AA0 standard, BA0 Asia.
// (100k / max only exist as upgrades, so they're not offered.)
export const UNIFIED_PC_PACKAGES = ['150', '500', '1k', '2.5k', '5k', '10k', '50k'];
const UNIFIED_CODE: Record<string, string> = { 150: '3DB', 500: '1EB', '1k': '2EB', '2.5k': '2MB', '5k': '1FB', '10k': '2FB', '50k': '1GB' };
export const LICENSE_EDITIONS: { value: LicenseEdition; label: string; wincc81Only?: boolean }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'asia', label: 'Asia edition' },
  { value: 'dl', label: 'Download', wincc81Only: true },
];
// SCADA options (client/server, data logging, redundancy). WinCC V8.1: USB
// order number for standard/Asia, download number for 'dl' (Siemens WinCC
// V8.1 order data, Oct 2024). WinCC Unified options are 6AV2157-… (license on
// USB, 0AB0) — Database Storage 6AV2154-…; the Unified redundancy option has
// no V21 order number on file yet, so it goes in for the supplier to fill.
export const WINCC81_ARCHIVE_PACKAGES = ['1500', '5000', '10000', '30000'];
const WINCC81_ARCHIVE_CODE: Record<string, string> = { 1500: 'AX0', 5000: 'BX0', 10000: 'CX0', 30000: 'EX0' };
export const UNIFIED_LOGGING_PACKAGES = ['100', '500', '1000', '5000'];
const UNIFIED_LOGGING_PART: Record<string, string> = {
  100: '6AV2157-2DA00-0AB0', 500: '6AV2157-1EA00-0AB0', 1000: '6AV2157-2EA00-0AB0', 5000: '6AV2157-1FA00-0AB0',
};
/** Operate-client packs (largest first) — clients are covered with the fewest packs. */
const UNIFIED_CLIENT_PACKS: { n: number; partNo: string }[] = [
  { n: 100, partNo: '6AV2157-2DW00-0AB0' }, { n: 30, partNo: '6AV2157-6CW00-0AB0' }, { n: 10, partNo: '6AV2157-2CW00-0AB0' },
  { n: 3, partNo: '6AV2157-3JW00-0AB0' }, { n: 1, partNo: '6AV2157-1JW00-0AB0' },
];
export function unifiedClientPacks(clients: number): { n: number; qty: number }[] {
  let left = Math.max(0, Math.round(clients));
  const out: { n: number; qty: number }[] = [];
  UNIFIED_CLIENT_PACKS.forEach(({ n }) => { const q = Math.floor(left / n); if (q > 0) { out.push({ n, qty: q }); left -= q * n; } });
  return out;
}

export const scadaKey = (kind: Exclude<ScadaKind, 'none'>, license: WinccLicense, pkg: string, edition: LicenseEdition = 'standard') =>
  kind === 'wincc81' ? `wincc81_${license}_${pkg}_${edition}` : `unifiedPc_${pkg}_${edition === 'asia' ? 'asia' : 'standard'}`;

// ── Network switches (SCALANCE) ──────────────────────────────────────────
// Unmanaged: WAGO Industrial-ECO-Switch (priced on the ISTS WAGO quote);
// managed (MRP ring, needed for R/H): Siemens SCALANCE XC-200.
export interface NetSwitch { key: string; type: SwitchType; model: string; ports: number; partNo: string; drawA: number; brand: string; price: number }
export const SWITCHES: NetSwitch[] = [
  { key: 'wagoSw5', type: 'unmanaged', model: 'WAGO Industrial-ECO-Switch 5-port', ports: 5, partNo: '852-111', drawA: 0.07, brand: 'WAGO', price: 8328.24 },
  { key: 'wagoSw8', type: 'unmanaged', model: 'WAGO Industrial-ECO-Switch 8-port', ports: 8, partNo: '852-112/000-001', drawA: 0.1, brand: 'WAGO', price: 12492.35 },
  { key: 'xc208', type: 'managed', model: 'SCALANCE XC208', ports: 8, partNo: '6GK5208-0BA00-2AC2', drawA: 0.25, brand: 'Siemens', price: 0 },
  { key: 'xc216', type: 'managed', model: 'SCALANCE XC216', ports: 16, partNo: '6GK5216-0BA00-2AC2', drawA: 0.35, brand: 'Siemens', price: 0 },
];

// ── 24 V DC supplies (SITOP per the TIA Selection Tool, Sep 2026; WAGO) ──
export type SitopLine = 'PSU100S' | 'PSU200M' | 'PSU8200' | 'PSU300S';
export type PsuLine = SitopLine | 'WAGO Eco' | 'WAGO Pro 2';
export interface SitopOption { key: string; line: PsuLine; ratingA: number; partNo: string; input: string }
export const SITOP_LINES: SitopLine[] = ['PSU100S', 'PSU200M', 'PSU8200', 'PSU300S'];
/** Every supply line in picker order, with its menu header. */
export const PSU_LINES: { line: PsuLine; label: string }[] = [
  ...SITOP_LINES.map((line) => ({ line: line as PsuLine, label: `SITOP ${line}` })),
  { line: 'WAGO Eco', label: 'WAGO Eco' },
  { line: 'WAGO Pro 2', label: 'WAGO Pro 2' },
];
export const SITOP_OPTIONS: SitopOption[] = [
  { key: 'psu100s2', line: 'PSU100S', ratingA: 2.5, partNo: '6EP1332-2BA20', input: '1-phase 120/230 V AC' },
  { key: 'psu100s5', line: 'PSU100S', ratingA: 5, partNo: '6EP1333-2BA20', input: '1-phase 120/230 V AC' },
  { key: 'psu100s10', line: 'PSU100S', ratingA: 10, partNo: '6EP1334-2BA20', input: '1-phase 120/230 V AC' },
  { key: 'psu100s20', line: 'PSU100S', ratingA: 20, partNo: '6EP1336-2BA10', input: '1-phase 120/230 V AC' },
  { key: 'psu200m5', line: 'PSU200M', ratingA: 5, partNo: '6EP1333-3BA10', input: '1/2-phase 120-230 V AC' },
  { key: 'psu200m10', line: 'PSU200M', ratingA: 10, partNo: '6EP1334-3BA10', input: '1/2-phase 120-230 V AC' },
  { key: 'psu8200_20', line: 'PSU8200', ratingA: 20, partNo: '6EP1336-3BA10', input: '1-phase 120-230 V AC / 110-220 V DC' },
  { key: 'psu300s20', line: 'PSU300S', ratingA: 20, partNo: '6EP1436-2BA10', input: '3-phase 400-500 V AC' },
  { key: 'psu300s40', line: 'PSU300S', ratingA: 40, partNo: '6EP1437-2BA20', input: '3-phase 400-500 V AC' },
  { key: 'wagoEco5', line: 'WAGO Eco', ratingA: 5, partNo: '787-722', input: '1-phase' },
  { key: 'wagoEco10', line: 'WAGO Eco', ratingA: 10, partNo: '787-732', input: '1-phase' },
  { key: 'wagoEco20', line: 'WAGO Eco', ratingA: 20, partNo: '787-734', input: '1-phase' },
  { key: 'wagoEco40', line: 'WAGO Eco', ratingA: 40, partNo: '787-736', input: '1-phase' },
  { key: 'wagoPro5', line: 'WAGO Pro 2', ratingA: 5, partNo: '2787-2144', input: '1-phase' },
  { key: 'wagoPro10', line: 'WAGO Pro 2', ratingA: 10, partNo: '2787-2146', input: '1-phase' },
  { key: 'wagoPro20', line: 'WAGO Pro 2', ratingA: 20, partNo: '2787-2147', input: '1-phase' },
];
// VAT-ex unit prices from the ISTS WAGO inventory (787-734 / 787-736 from its quote page).
const WAGO_PSU_PRICE: Record<string, number> = {
  wagoEco5: 3512.75, wagoEco10: 5337.3, wagoEco20: 8503.13, wagoEco40: 21049.24,
  wagoPro5: 8904.09, wagoPro10: 13578.53, wagoPro20: 20342.01,
};

// ── Part list ────────────────────────────────────────────────────────────
const QUOTED: SiemensPart[] = [
  { key: 'cpu1214', partNo: '6ES7214-1AG40-0XB0', price: 24059.81,
    description: 'SIMATIC S7-1200, CPU 1214C, compact CPU, DC/DC/DC, onboard I/O: 14 DI 24 V DC; 10 DO 24 V DC; 2 AI 0-10 V DC, power supply: DC 20.4-28.8 V DC, program/data memory 150 KB' },
  { key: 'cpu1513', partNo: '6ES7513-1AM03-0AB0', price: 124083.35,
    description: 'SIMATIC S7-1500, CPU 1513-1 PN, central processing unit with work memory 600 KB for program and 2.5 MB for data, 1st interface: PROFINET IRT with 2-port switch, 6 ns bit performance, SIMATIC Memory Card required' },
  { key: 'memCard', partNo: '6ES7954-8LL04-0AA0', price: 19533.25,
    description: 'SIMATIC S7, memory card for S7-1x00 CPU, 3.3 V Flash, 256 MB' },
  { key: 'cb1241', partNo: '6ES7241-1CH30-1XB0', price: 4995.65,
    description: 'SIMATIC S7-1200, Communication Board CB 1241, RS485, terminal block, supports Freeport (Modbus RTU)' },
  { key: 'imBundle', partNo: '6ES7155-6AA02-0BN0', price: 21697.11,
    description: 'SIMATIC ET 200SP, bundle PROFINET interface module IM 155-6 PN ST, max. 32 I/O modules and 16 ET 200AL modules, bundle consists of: interface module (6ES7155-6AU02-0BN0), server module (6ES7193-6PA00-0AA0), SIMATIC bus adapter BA 2x RJ45 (6ES7193-6AR00-0AA0)' },
  { key: 'di16', partNo: '6ES7131-6BH01-0BA0', price: 6218.99,
    description: 'SIMATIC ET 200SP, Digital input module, DI 16x 24V DC Standard, type 3 (IEC 61131), sink input (PNP, P-reading), fits to BU-type A0, Colour Code CC00' },
  { key: 'dq16', partNo: '6ES7132-6BH01-0BA0', price: 7255.57,
    description: 'SIMATIC ET 200SP, Digital output module, DQ 16x 24V DC/0.5A Standard, Source output (PNP, P-switching), fits to BU-type A0, Colour Code CC00' },
  { key: 'ai8', partNo: '6ES7134-6GF00-0AA1', price: 16583.83,
    description: 'SIMATIC ET 200SP, Analog input module, AI 8xI 2-/4-wire Basic, suitable for BU type A0, A1, Color code CC01, Module diagnostics, 16 bit' },
  { key: 'aq4', partNo: '6ES7135-6HD00-0BA1', price: 14850.27,
    description: 'SIMATIC ET 200SP, Analog output module, AQ 4xU/I Standard, suitable for BU type A0, A1, Color code CC00, Module diagnostics, 16 bit, +/-0.3%' },
  { key: 'cmPtp', partNo: '6ES7137-6AA01-0BA0', price: 22526.27,
    description: 'SIMATIC ET 200SP, CM PtP communication module for serial connection RS-422, RS-485 and RS-232, freeport, 3964 (R), USS, MODBUS RTU master, slave, max. 250 Kbit/s, suitable for BU type A0' },
  { key: 'buLight', partNo: '6ES7193-6BP00-0DA0', price: 1600,
    description: 'SIMATIC ET 200SP, BaseUnit BU15-P16+A0+2D, BU type A0, Push-in terminals, without AUX terminals, new load group (light), WxH: 15x 117 mm' },
  { key: 'buDark', partNo: '6ES7193-6BP00-0BA0', price: 1105.71,
    description: 'SIMATIC ET 200SP, BaseUnit BU15-P16+A0+2B, BU type A0, Push-in terminals, without AUX terminals, bridged to the left, WxH: 15x 117 mm' },
  { key: 'psu100s20', partNo: '6EP1336-2BA10', price: 27429.76,
    description: 'SITOP PSU100S 20 A stabilized power supply input: 120/230 V AC output: 24 V DC/20 A' },
  { key: 'psu8200_20', partNo: '6EP1336-3BA10', price: 33406.14,
    description: 'SITOP PSU8200 20 A stabilized power supply input: 120-230 V AC 110-220 V DC output: 24 V DC/20 A' },
];

// Siemens catalog parts not on a quote yet (confirm part numbers with the supplier).
const CATALOG: SiemensPart[] = [
  { key: 'ai8u', partNo: '6ES7134-6FF00-0AA1', price: 0,
    description: 'SIMATIC ET 200SP, Analog input module, AI 8xU Basic, 0-10 V / ±10 V, suitable for BU type A0, A1, Color code CC01, Module diagnostics, 16 bit' },
  { key: 'rtd8', partNo: '6ES7134-6JF00-0CA1', price: 0,
    description: 'SIMATIC ET 200SP, Analog input module, AI 8xRTD/TC 2-wire High Feature, suitable for BU type A0, A1, Color code CC00, Module diagnostics, 16 bit' },
  { key: 'rtd4', partNo: '6ES7134-6JD00-0CA1', price: 0,
    description: 'SIMATIC ET 200SP, Analog input module, AI 4xRTD/TC 2-/3-/4-wire High Feature, suitable for BU type A0, A1, Color code CC00, Module diagnostics, 16 bit' },
  { verify: true, key: 'buLightA1', partNo: '6ES7193-6BP00-0DA1', price: 0,
    description: 'SIMATIC ET 200SP, BaseUnit BU15-P16+A0+2D/T, BU type A1, Push-in terminals, with temperature sensor (thermocouple cold junction), new load group (light), WxH: 15x 117 mm' },
  { verify: true, key: 'buDarkA1', partNo: '6ES7193-6BP00-0BA1', price: 0,
    description: 'SIMATIC ET 200SP, BaseUnit BU15-P16+A0+2B/T, BU type A1, Push-in terminals, with temperature sensor (thermocouple cold junction), bridged to the left, WxH: 15x 117 mm' },
  { verify: true, key: 'imHf', partNo: '6ES7155-6AU30-0CN0', price: 0,
    description: 'SIMATIC ET 200SP, PROFINET interface module IM 155-6 PN/2 High Feature, system redundancy S2 (S7-1500R/H), max. 64 I/O modules, incl. server module, BusAdapter ordered separately' },
  { key: 'busAdapter', partNo: '6ES7193-6AR00-0AA0', price: 0,
    description: 'SIMATIC ET 200SP, BusAdapter BA 2x RJ45, for the IM 155-6 PN HF interface module' },
  { key: 'cpu1513r', partNo: '6ES7513-1RM03-0AB0', price: 0,
    description: 'SIMATIC S7-1500R, CPU 1513R-1 PN, redundant CPU (order 2 per system), PROFINET IRT with 2-port switch, SIMATIC Memory Card required' },
  { key: 'cpu1515r', partNo: '6ES7515-2RN03-0AB0', price: 0,
    description: 'SIMATIC S7-1500R, CPU 1515R-2 PN, redundant CPU (order 2 per system), 2 PROFINET interfaces, SIMATIC Memory Card required' },
  { key: 'cpu1517h', partNo: '6ES7500-0HP00-0AB0', price: 0,
    description: 'SIMATIC S7-1500H redundant system bundle: 2 x CPU 1517H-3 PN, 4 x synchronization module, 2 x fibre-optic sync cable; SIMATIC Memory Card (1 per CPU) ordered separately' },
];

// Part numbers for the unquoted CPUs — checked in the TIA Selection Tool
// (Sep 2026). S7-1500: the current "…03" generation (same as the quoted
// 1513-1 PN), not the older "…02" / "…01" ones.
const CPU_PART_NO: Record<string, string> = {
  cpu1211: '6ES7211-1AE40-0XB0', cpu1211ac: '6ES7211-1BE40-0XB0', cpu1211rly: '6ES7211-1HE40-0XB0',
  cpu1212: '6ES7212-1AE40-0XB0', cpu1212ac: '6ES7212-1BE40-0XB0', cpu1212rly: '6ES7212-1HE40-0XB0',
  cpu1214ac: '6ES7214-1BG40-0XB0', cpu1214rly: '6ES7214-1HG40-0XB0',
  cpu1215: '6ES7215-1AG40-0XB0', cpu1215ac: '6ES7215-1BG40-0XB0', cpu1215rly: '6ES7215-1HG40-0XB0',
  cpu1217: '6ES7217-1AG40-0XB0',
  cpu1212f: '6ES7212-1AF40-0XB0', cpu1214f: '6ES7214-1AF40-0XB0', cpu1215f: '6ES7215-1AF40-0XB0',
  cpu1511: '6ES7511-1AL03-0AB0', cpu1515: '6ES7515-2AN03-0AB0', cpu1516: '6ES7516-3AP03-0AB0',
  cpu1511c: '6ES7511-1CL03-0AB0', cpu1512c: '6ES7512-1CM03-0AB0',
  cpu1511f: '6ES7511-1FL03-0AB0', cpu1513f: '6ES7513-1FM03-0AB0', cpu1515f: '6ES7515-2FN03-0AB0', cpu1516f: '6ES7516-3FP03-0AB0',
};
const MEM_PART_NO: Record<string, string> = { memCard4: '6ES7954-8LC04-0AA0', memCard12: '6ES7954-8LE04-0AA0', memCard24: '6ES7954-8LF04-0AA0' };

// WAGO terminals, relays and accessories, plus the 0.5 mm² signal wire — for
// the panel's I/O terminal strip. `quoted` ones carry the part number and
// VAT-ex unit price from the ISTS WAGO inventory (ex-stock list, 2026); the
// rest are WAGO catalog numbers for inquiry. A pricelist item with the same
// part number still wins.
const WQ = { brand: 'WAGO', quoted: true };
const W = { brand: 'WAGO', price: 0 };
export const WIRE_ROLL_M = 100;
/** ₱ per 100 m roll of 0.5 mm² wire (IOCT price, any colour). */
export const WIRE_ROLL_PRICE = 1500;
const TERMINAL_PARTS: SiemensPart[] = [
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

function cpuDescription(m: CpuModel): string {
  const io = m.onboard;
  const ioText = io.di + io.do + io.ai + io.ao > 0
    ? `onboard I/O: ${io.di} DI 24 V DC; ${io.do} DO ${m.relayOutputs ? 'relay 2 A' : '24 V DC'}; ${io.ai} AI${m.family === 'S7-1200' ? ' 0-10 V DC' : ''}${io.ao ? `; ${io.ao} AO` : ''}`
    : 'PROFINET, SIMATIC Memory Card required';
  return `SIMATIC ${m.family}, ${m.label}${m.family === 'S7-1200' ? ', compact CPU' : ''}${m.memory ? `, ${m.memory}` : ''}, ${ioText}`;
}

const LICENSE_TEXT: Record<WinccLicense, string> = { RC: 'RC (Runtime & Configuration)', RT: 'RT (Runtime)' };
const EDITION_TEXT: Record<LicenseEdition, string> = { standard: '', asia: ', Asia edition', dl: ', download' };

export const SIEMENS_PARTS: Record<string, SiemensPart> = (() => {
  const all: Record<string, SiemensPart> = {};
  const put = (p: SiemensPart) => { all[p.key] = p; };
  QUOTED.forEach((p) => put({ ...p, quoted: true }));
  CATALOG.forEach(put);
  TERMINAL_PARTS.forEach(put);
  CPU_MODELS.filter((m) => !all[m.key]).forEach((m) => put({ key: m.key, partNo: CPU_PART_NO[m.key] ?? '', price: 0, description: cpuDescription(m) }));
  MOUNTING_RAILS.forEach((r) => put({
    key: r.key, partNo: r.partNo, price: 0, verify: true,
    description: `SIMATIC S7-1500, mounting rail ${r.lengthMm} mm (approx. ${(r.lengthMm / 25.4).toFixed(1)} inch), incl. grounding screw, integrated DIN rail for mounting small parts such as terminals`,
  }));
  MEMORY_CARDS.filter((c) => !all[c.key]).forEach((c) => put({
    key: c.key, partNo: MEM_PART_NO[c.key] ?? '', price: 0, description: `SIMATIC S7, memory card for S7-1x00 CPU, 3.3 V Flash, ${c.label}`,
  }));
  HMI_PANELS.forEach((h) => put({
    key: h.key, partNo: h.partNo, price: 0,
    description: `SIMATIC HMI ${h.model}, ${HMI_LINES.find((l) => l.value === h.line)!.label.replace(/ \(.*/, '')}, ${h.sizeIn}" widescreen TFT touch display, PROFINET interface`,
  }));
  SWITCHES.forEach((s) => put(s.brand === 'WAGO'
    ? { key: s.key, partNo: s.partNo, price: s.price, brand: 'WAGO', quoted: true,
      description: `${s.model.replace(' 5-port', '').replace(' 8-port', '')}, unmanaged, ${s.ports}-port 100Base-TX, black` }
    : { key: s.key, partNo: s.partNo, price: s.price, verify: true,
      description: `SIMATIC NET ${s.model}, managed IE switch (MRP ring, VLAN, diagnostics), ${s.ports} x 10/100 Mbit/s RJ45 ports, 24 V DC` }));
  (['RC', 'RT'] as WinccLicense[]).forEach((lic) => WINCC81_PACKAGES.forEach((pkg) => LICENSE_EDITIONS.forEach(({ value: ed }) => put({
    key: scadaKey('wincc81', lic, pkg, ed), partNo: `6AV6381-2${WINCC81_CODE[lic][pkg]}08-1${WINCC81_SUFFIX[ed]}`, price: 0, uom: 'lic',
    description: `SIMATIC WinCC V8.1 ${LICENSE_TEXT[lic]}, ${pkg} PowerTags${EDITION_TEXT[ed]} — software license`,
  }))));
  UNIFIED_PC_PACKAGES.forEach((pkg) => (['standard', 'asia'] as LicenseEdition[]).forEach((ed) => put({
    key: scadaKey('unifiedPc', 'RT', pkg, ed), partNo: `6AV2155-${UNIFIED_CODE[pkg]}02-5${ed === 'asia' ? 'BA0' : 'AA0'}`, price: 0, uom: 'lic',
    description: `SIMATIC WinCC Unified V21 PC Runtime, ${pkg} PowerTags${EDITION_TEXT[ed]}, package — software license`,
  })));
  // SCADA options
  const dl = (ed: LicenseEdition) => ed === 'dl';
  LICENSE_EDITIONS.forEach(({ value: ed }) => {
    const sfx = ed === 'dl' ? '_dl' : '';
    put({ key: `wincc81Client${sfx}`, partNo: dl(ed) ? '6AV6381-2CA08-1AH0' : '6AV6381-2CA08-1AX0', price: 0, uom: 'lic',
      description: `SIMATIC WinCC V8.1 RT Client${dl(ed) ? ', download' : ''} — runtime software, single license (one per client station)` });
    put({ key: `wincc81Server${sfx}`, partNo: dl(ed) ? '6AV6371-1HA08-1AX0' : '6AV6371-1CA08-1AX0', price: 0, uom: 'lic',
      description: `SIMATIC WinCC/Server V8.1${dl(ed) ? ', download' : ''} — option for WinCC V8.1 runtime (client/server), single license (one per server)` });
    put({ key: `wincc81Redundancy${sfx}`, partNo: dl(ed) ? '6AV6371-1HF08-1AX0' : '6AV6371-1CF08-1AX0', price: 0, uom: 'lic',
      description: `SIMATIC WinCC/Redundancy V8.1${dl(ed) ? ', download' : ''} — option for WinCC V8.1 runtime, single license for 2 installations (one per server pair)` });
    WINCC81_ARCHIVE_PACKAGES.forEach((pkg) => put({
      key: `wincc81Archive_${pkg}${sfx}`, partNo: `6AV6371-1${dl(ed) ? 'H' : 'D'}Q10-0${WINCC81_ARCHIVE_CODE[pkg]}`, price: 0, uom: 'lic',
      description: `SIMATIC WinCC/Archive V8.x, ${pkg} archive tags (countable)${dl(ed) ? ', download' : ''} — data logging option, single license (one per server; 512 archive tags come with the base license)`,
    }));
  });
  UNIFIED_CLIENT_PACKS.forEach(({ n, partNo }) => put({
    key: `unifiedClient_${n}`, partNo, price: 0, uom: 'lic', verify: n === 100 || n === 10,
    description: `SIMATIC WinCC Unified Client, ${n} Operate Client${n === 1 ? '' : 's'} — option for WinCC Unified PC runtime, single license`,
  }));
  UNIFIED_LOGGING_PACKAGES.forEach((pkg) => put({
    key: `unifiedLogging_${pkg}`, partNo: UNIFIED_LOGGING_PART[pkg], price: 0, uom: 'lic', verify: pkg === '100',
    description: `SIMATIC WinCC Unified Logging Tags (${pkg}) — data logging option for WinCC Unified PC runtime, single license`,
  }));
  put({ key: 'unifiedDbStorage', partNo: '6AV2154-0BS02-5AA0', price: 0, uom: 'lic', verify: true,
    description: 'SIMATIC WinCC Unified Database Storage V21 — logging to Microsoft SQL Server (large tag counts / long retention), single license' });
  put({ key: 'unifiedRedundancy', partNo: '', price: 0, uom: 'lic',
    description: 'SIMATIC WinCC Unified Redundancy V21 — option for WinCC Unified PC runtime (redundant server pair)' });
  SITOP_OPTIONS.filter((s) => !all[s.key]).forEach((s) => put(s.line.startsWith('WAGO')
    ? { key: s.key, partNo: s.partNo, price: WAGO_PSU_PRICE[s.key] ?? 0, brand: 'WAGO', quoted: !!WAGO_PSU_PRICE[s.key],
      description: s.line === 'WAGO Eco'
        ? `WAGO switched-mode power supply, Eco, 1-phase, 24 V DC output voltage, ${s.ratingA} A output current, DC-OK LED`
        : `WAGO power supply, Pro 2, 1-phase, 24 V DC output voltage, ${s.ratingA} A output current, TopBoost + PowerBoost, communication capability` }
    : { key: s.key, partNo: s.partNo, price: 0,
      description: `SITOP ${s.line} ${s.ratingA} A stabilized power supply input: ${s.input} output: 24 V DC/${s.ratingA} A` }));
  return all;
})();

// ── Inputs ───────────────────────────────────────────────────────────────
export interface PlcInputs {
  family: PlcFamily;
  /** CPU model key (CPU_MODELS); falls back to the family / redundancy default. */
  cpu: string;
  /** Redundant CPU pair (S7-1500 only). */
  redundancy: Redundancy;
  di: number;
  do: number;
  /** Analog points by signal type and wiring. */
  analog: Record<AnalogKey, AnalogCount>;
  /** Extra channels for future use, applied to each I/O type in use (%). */
  sparePct: number;
  modbus: ModbusMode;
  /** RS-485 ports needed (Modbus RTU only). */
  modbusPorts: number;
  /** SITOP_OPTIONS key, or 'none'. */
  sitop: string;
  /** S7-1200: include a memory card (always included for S7-1500, where it's required). */
  memoryCard: boolean;
  /** MEMORY_CARDS key. */
  memCard: string;
  /** HMI_PANELS key, or 'none'. */
  hmi: string;
  hmiQty: number;
  scada: ScadaKind;
  winccLicense: WinccLicense;
  /** Standard / Asia / download (download is WinCC V8.1 only; Unified falls back to standard). */
  licenseEdition: LicenseEdition;
  /** Tag package (WINCC81_PACKAGES / UNIFIED_PC_PACKAGES). */
  scadaPackage: string;
  /** SCADA servers (or single stations); with redundancy each gets a partner. */
  scadaQty: number;
  /** Client stations viewing the server(s). */
  scadaClients: number;
  /** Server pairs: 2 servers per station + the redundancy license. */
  scadaRedundant: boolean;
  /** Extra logging tags: WINCC81_ARCHIVE_PACKAGES / UNIFIED_LOGGING_PACKAGES, or 'none'. */
  scadaLogging: string;
  /** WinCC Unified: log to SQL Server (Database Storage option). */
  scadaDbStorage: boolean;
  /** ET 200SP stations (interface modules) wanted; 0 = auto (the minimum). */
  imStations: number;
  /** Network switches; the model is picked from the port count. Redundancy forces ≥ 2 managed. */
  switchQty: number;
  switchType: SwitchType;
  /** Add the WAGO terminals, relays, accessories and 0.5 mm² wiring for the I/O. */
  terminals: boolean;
  /** Panel size (mm) — sets the average wire length. */
  panelW: number;
  panelH: number;
  /** 24 V load per digital output, for PSU sizing (A) — interposing relay / pilot light ≈ 0.1 A. */
  doLoadA: number;
  /** Safety margin added to the estimated 24 V load when suggesting a PSU (%). */
  psuMarginPct: number;
}

export const DEFAULT_PLC_INPUTS: PlcInputs = {
  family: 'S7-1200', cpu: 'cpu1214', redundancy: 'none', di: 0, do: 0, analog: noAnalog(), sparePct: 10,
  modbus: 'none', modbusPorts: 1, sitop: 'none', memoryCard: false, memCard: 'memCard',
  hmi: 'none', hmiQty: 1, scada: 'none', winccLicense: 'RC', licenseEdition: 'standard', scadaPackage: '2048', scadaQty: 1,
  scadaClients: 0, scadaRedundant: false, scadaLogging: 'none', scadaDbStorage: false,
  imStations: 0, switchQty: 0, switchType: 'unmanaged', terminals: true, panelW: 800, panelH: 1200,
  doLoadA: 0.1, psuMarginPct: 25,
};

export const CHANNELS = { di16: 16, dq16: 16, ai8: 8, ai8u: 8, rtd8: 8, rtd4: 4, aq4: 4 } as const;
export const IM_MAX_MODULES = 32;
export const IM_HF_MAX_MODULES = 64;

/** Which Section B header a line goes under: the PLC, the terminal strip, or the wiring. */
export type PlcSection = 'plc' | 'terminals' | 'wiring';
export const TERMINALS_HEADER = 'TERMINAL BLOCKS & RELAYS';
export const WIRES_HEADER = 'WIRES';

export interface PlcLine { key: string; qty: number; why: string; section: PlcSection }

export interface PlcChannels { needed: number; provided: number }

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

export interface PlcConfig {
  lines: PlcLine[];
  channels: { di: PlcChannels; do: PlcChannels; ai: PlcChannels; ao: PlcChannels };
  /** Channels needed (incl. spare) per analog type and wiring. */
  analog: Record<AnalogKey, AnalogCount>;
  stations: number;
  /** Fewest stations the module count needs (the auto value). */
  suggestedStations: number;
  ioModules: number;
  /** Switch model and count actually used (after redundancy rules). */
  network: { switchKey: string | null; qty: number; devices: number; portsPerSwitch: number };
  wiring: WiringSummary | null;
  notes: string[];
}

const withSpare = (n: number, pct: number) => (n > 0 ? Math.ceil(n * (1 + Math.max(0, pct) / 100)) : 0);
const whole = (n: number) => Math.max(0, Math.round(Number(n) || 0));

export function onboardText(m: CpuModel): string {
  const io = m.onboard;
  if (io.di + io.do + io.ai + io.ao === 0) return 'no on-board I/O';
  const aiText = m.onboardAi.includes('aiI') ? '' : ' (0–10 V)';
  const aoText = m.onboardAo.includes('aoU') ? '' : ' (0–20 mA)';
  return [`${io.di} DI`, `${io.do} DQ${m.relayOutputs ? ' (relay)' : ''}`, `${io.ai} AI${aiText}`, io.ao ? `${io.ao} AQ${aoText}` : '']
    .filter(Boolean).join(' / ');
}

/** Effective switch count/type after the redundancy rule (R/H → at least 2 managed). */
export function effectiveSwitches(inp: Pick<PlcInputs, 'redundancy' | 'switchQty' | 'switchType'>): { qty: number; type: SwitchType } {
  const qty = whole(inp.switchQty);
  return inp.redundancy !== 'none' ? { qty: Math.max(2, qty), type: 'managed' } : { qty, type: inp.switchType };
}

export function configurePlc(raw: PlcInputs): PlcConfig {
  const rawAnalog = raw.analog ?? noAnalog();
  const inp = {
    ...raw, di: whole(raw.di), do: whole(raw.do),
    modbusPorts: Math.max(1, whole(raw.modbusPorts)), hmiQty: Math.max(1, whole(raw.hmiQty)), scadaQty: Math.max(1, whole(raw.scadaQty)),
  };
  const redundant = inp.redundancy !== 'none';
  const family: PlcFamily = redundant ? 'S7-1500' : inp.family;
  const is1200 = family === 'S7-1200';
  const cpu = cpuModel(family, inp.cpu, inp.redundancy);
  const cpuUnits = redundant ? 2 : 1;

  // Channels needed per analog type/wiring (spare applied to each group).
  const analog = noAnalog();
  ANALOG_KEYS.forEach((k) => {
    const a = rawAnalog[k] ?? { w2: 0, w4: 0 };
    analog[k] = { w2: withSpare(whole(a.w2), inp.sparePct), w4: k === 'aiTc' ? 0 : withSpare(whole(a.w4), inp.sparePct) };
  });
  const tot = (k: AnalogKey) => analog[k].w2 + analog[k].w4;
  const need = {
    di: withSpare(inp.di, inp.sparePct), do: withSpare(inp.do, inp.sparePct),
    ai: ANALOG_KINDS.filter((k) => k.dir === 'ai').reduce((s, k) => s + tot(k.key), 0),
    ao: ANALOG_KINDS.filter((k) => k.dir === 'ao').reduce((s, k) => s + tot(k.key), 0),
  };

  // On-board analog channels take the signal types the CPU accepts.
  const modNeed: Record<AnalogKey, number> = Object.fromEntries(ANALOG_KEYS.map((k) => [k, tot(k)])) as Record<AnalogKey, number>;
  const allot = (slots: number, kinds: AnalogKey[]) => {
    let left = slots;
    let used = 0;
    kinds.forEach((k) => { const take = Math.min(left, modNeed[k]); modNeed[k] -= take; left -= take; used += take; });
    return used;
  };
  const onboardAiUsed = allot(cpu.onboard.ai, cpu.onboardAi);
  allot(cpu.onboard.ao, cpu.onboardAo);

  const diMods = Math.ceil(Math.max(0, need.di - cpu.onboard.di) / CHANNELS.di16);
  const dqMods = Math.ceil(Math.max(0, need.do - cpu.onboard.do) / CHANNELS.dq16);
  const aiMods = Math.ceil(modNeed.aiI / CHANNELS.ai8);
  const aiUMods = Math.ceil(modNeed.aiU / CHANNELS.ai8u);
  const rtd8Mods = Math.ceil(analog.aiRtd.w2 / CHANNELS.rtd8);
  const rtd4Mods = Math.ceil(analog.aiRtd.w4 / CHANNELS.rtd4);
  const tcMods = Math.ceil(analog.aiTc.w2 / CHANNELS.rtd8);
  const aqMods = Math.ceil((modNeed.aoI + modNeed.aoU) / CHANNELS.aq4);

  const rtuPorts = inp.modbus === 'rtu' ? inp.modbusPorts : 0;
  const useCb = is1200 && rtuPorts >= 1;
  const cmMods = is1200 ? Math.max(0, rtuPorts - 1) : rtuPorts;

  // Modules in slot order: A0 first, thermocouple modules (type A1) last, so a
  // station only opens on an A1 BaseUnit when it holds nothing but TC modules.
  const imMax = redundant ? IM_HF_MAX_MODULES : IM_MAX_MODULES;
  const a0Count = diMods + dqMods + aiMods + aiUMods + rtd8Mods + rtd4Mods + aqMods + cmMods;
  const ioModules = a0Count + tcMods;
  // Stations: the minimum the module count needs, or more when asked for
  // (e.g. a separate IM per area / panel) — never more than one per module.
  const suggestedStations = ioModules > 0 ? Math.ceil(ioModules / imMax) : 0;
  const askedStations = whole(inp.imStations);
  const stations = ioModules > 0 ? Math.min(ioModules, Math.max(suggestedStations, askedStations)) : 0;
  const bu = { lightA0: 0, darkA0: 0, lightA1: 0, darkA1: 0 };
  // Modules shared out evenly: the first (ioModules % stations) stations take one more.
  let first = 0;
  for (let s = 0; s < stations; s++) {
    const size = Math.floor(ioModules / stations) + (s < ioModules % stations ? 1 : 0);
    const last = first + size; // exclusive
    const a0InStation = Math.max(0, Math.min(last, a0Count) - first);
    const a1InStation = (last - first) - a0InStation;
    if (a0InStation > 0) { bu.lightA0 += 1; bu.darkA0 += a0InStation - 1; bu.darkA1 += a1InStation; }
    else { bu.lightA1 += 1; bu.darkA1 += a1InStation - 1; }
    first = last;
  }

  // Network switches: model from the ports each one needs.
  const sw = effectiveSwitches(inp);
  const panel = HMI_PANELS.find((h) => h.key === inp.hmi);
  const scadaServers = inp.scada === 'none' ? 0 : inp.scadaQty * (inp.scadaRedundant ? 2 : 1);
  const scadaClients = inp.scada === 'none' ? 0 : whole(inp.scadaClients);
  const devices = cpuUnits + stations + (panel ? inp.hmiQty : 0) + scadaServers + scadaClients;
  const portsPerSwitch = sw.qty > 0 ? Math.ceil(devices / sw.qty) + (sw.qty > 1 ? 2 : 1) : 0;
  const ofType = SWITCHES.filter((s) => s.type === sw.type).sort((a, b) => a.ports - b.ports);
  const netSwitch = sw.qty > 0 ? (ofType.find((s) => s.ports >= portsPerSwitch) ?? ofType[ofType.length - 1]) : null;

  const lines: PlcLine[] = [];
  const add = (key: string, qty: number, why: string, section: PlcSection = 'plc') => { if (qty > 0 && SIEMENS_PARTS[key]) lines.push({ key, qty, why, section }); };
  const hasOnboard = cpu.onboard.di + cpu.onboard.do + cpu.onboard.ai + cpu.onboard.ao > 0;
  if (cpu.redundancy === 'H') add(cpu.key, 1, 'Redundant pair — 2 CPUs + sync modules + sync cables in one bundle');
  else if (cpu.redundancy === 'R') add(cpu.key, 2, 'Redundant pair — primary + backup CPU');
  else add(cpu.key, 1, hasOnboard ? `CPU — ${onboardText(cpu)} on board` : 'CPU — all I/O on ET 200SP');
  const card = MEMORY_CARDS.some((c) => c.key === inp.memCard) ? inp.memCard : 'memCard';
  if (redundant) add(card, 2, 'One per CPU (required)');
  else if (!is1200) add(card, 1, 'Required by every S7-1500 CPU');
  else if (inp.memoryCard) add(card, 1, 'Optional on S7-1200 (program backup / transfer)');
  if (!is1200) {
    const rail = mountingRailFor(cpu.key);
    add(rail.key, cpuUnits, `S7-1500 mounting rail for the CPU (${CPU1500_WIDTH_MM[cpu.key] ?? 70} mm wide)${redundant ? ' — one per CPU' : ''}`);
  }
  add('cb1241', useCb ? 1 : 0, 'Modbus RTU port on the CPU (1 × RS-485)');
  if (redundant) {
    add('imHf', stations, `ET 200SP station${stations === 1 ? '' : 's'} on system redundancy S2 — max ${IM_HF_MAX_MODULES} modules each (server module included)`);
    add('busAdapter', stations, 'One BusAdapter per interface module');
  } else {
    add('imBundle', stations, `ET 200SP station${stations === 1 ? '' : 's'} — max ${IM_MAX_MODULES} modules each (incl. server module + BusAdapter)`);
  }
  add('di16', diMods, `${CHANNELS.di16} DI each`);
  add('dq16', dqMods, `${CHANNELS.dq16} DQ each`);
  add('ai8', aiMods, `${CHANNELS.ai8} AI 4–20 mA (2- or 4-wire) each`);
  add('ai8u', aiUMods, `${CHANNELS.ai8u} AI 0–10 V each`);
  const rtd8Why = [rtd8Mods ? `${rtd8Mods} for RTD 2-wire` : '', tcMods ? `${tcMods} for thermocouples (on A1 BaseUnits)` : ''].filter(Boolean).join(', ');
  add('rtd8', rtd8Mods + tcMods, `${CHANNELS.rtd8} RTD/TC each — ${rtd8Why}`);
  add('rtd4', rtd4Mods, `${CHANNELS.rtd4} RTD 3-/4-wire each`);
  add('aq4', aqMods, `${CHANNELS.aq4} AQ (0–10 V or 4–20 mA) each`);
  add('cmPtp', cmMods, is1200 ? 'Extra Modbus RTU ports (CB 1241 gives only one)' : '1 per Modbus RTU (RS-485) port');
  add('buLight', bu.lightA0, 'First BaseUnit of each station (starts the potential group)');
  add('buDark', bu.darkA0, 'One BaseUnit per remaining module');
  add('buLightA1', bu.lightA1, 'First BaseUnit of a thermocouple-only station');
  add('buDarkA1', bu.darkA1, 'Thermocouple modules — temperature sensor for cold-junction compensation');
  if (netSwitch) {
    add(netSwitch.key, sw.qty, `${sw.type === 'managed' ? 'Managed' : 'Unmanaged'} — ${devices} network device${devices === 1 ? '' : 's'}, ~${portsPerSwitch} ports per switch${redundant ? ' (MRP ring for the redundant system)' : ''}`);
  }
  if (panel) add(panel.key, inp.hmiQty, `Operator panel — ${panel.sizeIn}"`);
  if (inp.scada !== 'none') {
    const pkgs = inp.scada === 'wincc81' ? WINCC81_PACKAGES : UNIFIED_PC_PACKAGES;
    const pkg = pkgs.includes(inp.scadaPackage) ? inp.scadaPackage : pkgs[0];
    const red = inp.scadaRedundant;
    add(scadaKey(inp.scada, inp.winccLicense, pkg, inp.licenseEdition), scadaServers,
      red ? `SCADA base license — ${inp.scadaQty} redundant server pair${inp.scadaQty === 1 ? '' : 's'} (2 servers each)` : 'SCADA license — one per server / PC station');
    const logging = inp.scadaLogging;
    if (inp.scada === 'wincc81') {
      const sfx = inp.licenseEdition === 'dl' ? '_dl' : '';
      if (scadaClients > 0) {
        add(`wincc81Server${sfx}`, scadaServers, 'Client/server — WinCC/Server on each server');
        add(`wincc81Client${sfx}`, scadaClients, 'One RT Client license per client station');
      }
      add(`wincc81Redundancy${sfx}`, red ? inp.scadaQty : 0, 'One per redundant server pair (covers both installations)');
      if (WINCC81_ARCHIVE_PACKAGES.includes(logging)) add(`wincc81Archive_${logging}${sfx}`, scadaServers, `Data logging — ${logging} archive tags on each server (512 included in the base)`);
    } else {
      // Operate clients are licensed on the server — both servers of a redundant pair.
      unifiedClientPacks(scadaClients).forEach(({ n, qty }) => add(`unifiedClient_${n}`, qty * scadaServers,
        `${scadaClients} client${scadaClients === 1 ? '' : 's'} — licensed on each server${red ? ' (both servers of the pair)' : ''}`));
      add('unifiedRedundancy', red ? inp.scadaQty : 0, 'One per redundant server pair');
      if (UNIFIED_LOGGING_PACKAGES.includes(logging)) add(`unifiedLogging_${logging}`, scadaServers, `Data logging — ${logging} logging tags on each server`);
      add('unifiedDbStorage', inp.scadaDbStorage ? scadaServers : 0, 'Logging to SQL Server — one per server');
    }
  }
  const psu = SITOP_OPTIONS.find((s) => s.key === inp.sitop);
  if (psu) add(psu.key, 1, `24 V DC supply — ${psu.ratingA} A`);

  // ── WAGO terminal strip + 0.5 mm² wiring ──
  let wiring: WiringSummary | null = null;
  const a2 = ANALOG_KEYS.reduce((s, k) => s + analog[k].w2, 0);
  const a4 = ANALOG_KEYS.reduce((s, k) => s + analog[k].w4, 0);
  if (inp.terminals && need.di + need.do + a2 + a4 > 0) {
    const di = need.di;
    const dq = need.do;
    const fused = a2 + 2 * a4;
    const std = a2 + 2 * a4;
    const diJumpers = Math.ceil(di / 10);
    const relayGroups = Math.ceil(dq / 16);
    const relayJumpers = dq - relayGroups;
    // +24 V / 0 V distribution: CPU(s), each station's IM and light BaseUnit,
    // panels and switches, plus the PSU feed.
    const distPoints = (cpu.drawA > 0 ? cpuUnits : 0) + 2 * stations + (panel ? inp.hmiQty : 0) + sw.qty + 1;
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
      + stations * (50 + 12.5) + ioModules * 15) * 1.2);

    const redWires = di + dq + fused + distPoints + diJumpers;
    const blueWires = std + distPoints + relayGroups;
    const runM = Math.round(((whole(inp.panelW) + whole(inp.panelH)) / 2000 + 0.3) * 100) / 100;
    const redM = Math.ceil(redWires * runM * 1.1);
    const blueM = Math.ceil(blueWires * runM * 1.1);
    const ferrules = Math.ceil(((redWires + blueWires) * 2 * 1.1) / 100) * 100;
    wiring = { redWires, blueWires, runM, redM, blueM, terminals, railMm };

    add('tb2Level', di, '1 double-deck terminal per DI (incl. spare)', 'terminals');
    add('tb2LevelEnd', tb2End, 'Closes the DI terminal group', 'terminals');
    add('relay', dq, '1 slim relay per DO (incl. spare)', 'terminals');
    add('relayJumper', relayJumpers, `Bridges the relay coil commons (A2 → 0 V), ${relayGroups} group${relayGroups === 1 ? '' : 's'} of up to 16`, 'terminals');
    add('tbFuse', fused, `Analog: 1 per 2-wire point (${a2}), 2 per 4-wire point (${a4})`, 'terminals');
    add('fuse5x20', fused, 'Fuse insert for each fuse terminal', 'terminals');
    add('tbStd', std + 2 * distPoints, `Analog: 1 per 2-wire point, 2 per 4-wire point (${std}); +24 V / 0 V distribution for CPU, stations, panels, switches and the PSU feed (${2 * distPoints})`, 'terminals');
    add('tbPe', pe, 'PSU earth and DIN-rail / shield earth', 'terminals');
    add('tbStdEnd', stdEnd, 'Closes the distribution group (fuse terminals carry their own end plate)', 'terminals');
    add('jumper10', diJumpers + distJumpers, `Shorting links: DI 24 V level (${diJumpers}), +24 V / 0 V distribution (${distJumpers})`, 'terminals');
    add('endStop', endStops, `2 per terminal group (${groups} groups)`, 'terminals');
    add('markers', terminals, '1 marker per terminal / relay', 'terminals');
    add('dinRail', Math.ceil(railMm / 2000), `≈ ${(railMm / 1000).toFixed(1)} m of rail for terminals, relays and ET 200SP (+20%)`, 'terminals');
    add('wireRed', Math.ceil(redM / WIRE_ROLL_M), `0.5 mm² red (+24 V DC): ${redWires} wires × ${runM} m ≈ ${redM} m`, 'wiring');
    add('wireBlue', Math.ceil(blueM / WIRE_ROLL_M), `0.5 mm² blue (0 V DC): ${blueWires} wires × ${runM} m ≈ ${blueM} m`, 'wiring');
    add('ferrule05', ferrules, 'Both ends of every 0.5 mm² wire (+10%)', 'wiring');
  }

  const notes: string[] = [];
  if (redundant) notes.push(`${inp.redundancy === 'R' ? 'S7-1500R' : 'S7-1500H'}: ET 200SP on IM 155-6 PN/2 HF (system redundancy S2) and the PROFINET ring on managed switches (MRP). Consider a second 24 V supply with a redundancy module.`);
  if (redundant && whole(inp.switchQty) < 2) notes.push('Redundancy needs at least 2 managed switches — added automatically.');
  if (redundant && inp.switchType === 'unmanaged' && whole(inp.switchQty) > 0) notes.push('Unmanaged switches can\'t run the MRP ring — managed ones are used instead.');
  if (netSwitch && netSwitch.ports < portsPerSwitch) notes.push(`About ${portsPerSwitch} ports are needed per switch but the largest ${sw.type} one has ${netSwitch.ports} — add more switches.`);
  if (inp.modbus === 'tcp') notes.push('Modbus TCP runs on the CPU\'s PROFINET port — no extra hardware.');
  if (is1200 && need.ai > 0 && tot('aiU') < cpu.onboard.ai) notes.push('The CPU\'s on-board AI are 0–10 V only — other analog inputs go on ET 200SP modules.');
  if (analog.aiTc.w2 > 0) notes.push('Thermocouple modules sit on type A1 BaseUnits for internal cold-junction compensation.');
  if (cpu.relayOutputs && inp.do > 0) notes.push('This CPU\'s on-board outputs are relays (2 A) — fine for contactors, not for fast pulse outputs.');
  if (cpu.drawA === 0) notes.push('AC/DC/RLY CPU is powered from 120/230 V AC — it is not counted in the 24 V load.');
  if (cpu.failSafe) notes.push('Fail-safe CPU — safety I/O (F-DI / F-DQ) is not auto-selected; add those modules yourself.');
  if (askedStations > 0 && askedStations < suggestedStations) notes.push(`${ioModules} modules need at least ${suggestedStations} ET 200SP stations — using ${suggestedStations}, not ${askedStations}.`);
  if (askedStations > ioModules && ioModules > 0) notes.push(`Only ${ioModules} module${ioModules === 1 ? '' : 's'}, so at most ${ioModules} station${ioModules === 1 ? '' : 's'} (each needs at least one module).`);
  if (stations > suggestedStations) notes.push(`${stations} ET 200SP stations as requested — ${ioModules} modules shared out about ${Math.ceil(ioModules / stations)} per station; move modules between stations on the quotation if an area needs more.`);
  else if (stations > 1) notes.push(`${ioModules} modules need ${stations} ET 200SP stations (${imMax} modules per ${redundant ? 'IM 155-6 PN/2 HF' : 'IM 155-6 PN ST'}).`);
  if (wiring) notes.push('Terminals and wiring cover the I/O incl. spare; the main feed from the PSU to the distribution terminals is not included (size it separately).');

  const provided = {
    di: cpu.onboard.di + diMods * CHANNELS.di16,
    do: cpu.onboard.do + dqMods * CHANNELS.dq16,
    ai: onboardAiUsed + aiMods * CHANNELS.ai8 + aiUMods * CHANNELS.ai8u + (rtd8Mods + tcMods) * CHANNELS.rtd8 + rtd4Mods * CHANNELS.rtd4,
    ao: cpu.onboard.ao + aqMods * CHANNELS.aq4,
  };
  return {
    lines,
    channels: {
      di: { needed: need.di, provided: provided.di },
      do: { needed: need.do, provided: provided.do },
      ai: { needed: need.ai, provided: provided.ai },
      ao: { needed: need.ao, provided: provided.ao },
    },
    analog,
    stations,
    suggestedStations,
    ioModules,
    network: { switchKey: netSwitch?.key ?? null, qty: netSwitch ? sw.qty : 0, devices, portsPerSwitch },
    wiring,
    notes,
  };
}

// ── 24 V DC load estimate (for choosing the supply) ──────────────────────
// Typical draws, rounded up — CPU, interface module and panels from Siemens
// datasheets; module electronics and field loads are planning figures. The
// DO load and the margin are inputs because they depend on what's wired.
/** Standard supply output ratings to suggest from. */
export const SITOP_RATINGS_A = [2.5, 5, 10, 20, 40];

export interface LoadLine { label: string; qty: number; eachA: number; totalA: number }
export interface LoadEstimate { lines: LoadLine[]; totalA: number; withMarginA: number; suggestedA: number | null }

export function estimate24V(raw: PlcInputs, cfg: PlcConfig): LoadEstimate {
  const count = (k: string) => cfg.lines.find((l) => l.key === k)?.qty ?? 0;
  const lines: LoadLine[] = [];
  const add = (label: string, qty: number, eachA: number) => { if (qty > 0 && eachA > 0) lines.push({ label, qty, eachA, totalA: qty * eachA }); };
  const redundancy = raw.redundancy ?? 'none';
  const cpu = cpuModel(redundancy !== 'none' ? 'S7-1500' : raw.family, raw.cpu, redundancy);
  add(cpu.label, redundancy !== 'none' ? 2 : 1, cpu.drawA);
  add('ET 200SP interface module (per station)', count('imBundle'), 0.2);
  add('ET 200SP IM 155-6 PN/2 HF (per station)', count('imHf'), 0.25);
  add('DI 16 module electronics', count('di16'), 0.05);
  add('DQ 16 module electronics', count('dq16'), 0.05);
  add('AI 8xI module electronics', count('ai8'), 0.03);
  add('AI 8xU module electronics', count('ai8u'), 0.03);
  add('AI RTD/TC module electronics', count('rtd8') + count('rtd4'), 0.03);
  add('AQ 4 module electronics', count('aq4'), 0.05);
  add('CM PtP module', count('cmPtp'), 0.05);
  const sw = SWITCHES.find((s) => s.key === cfg.network.switchKey);
  if (sw) add(sw.model, cfg.network.qty, sw.drawA);
  const panel = HMI_PANELS.find((h) => h.key === raw.hmi);
  if (panel) add(`HMI ${panel.model}`, count(panel.key), panel.drawA);
  add('Digital inputs — sensor + input current', cfg.channels.di.needed, 0.01);
  add('Digital outputs — field load', cfg.channels.do.needed, Math.max(0, Number(raw.doLoadA) || 0));
  add('Analog inputs — 4–20 mA loops', cfg.analog.aiI.w2 + cfg.analog.aiI.w4, 0.02);
  add('Analog inputs — 0–10 V sensor supply', cfg.analog.aiU.w2 + cfg.analog.aiU.w4, 0.02);
  add('Analog outputs', cfg.channels.ao.needed, 0.02);
  const totalA = Math.round(lines.reduce((a, l) => a + l.totalA, 0) * 100) / 100;
  const withMarginA = Math.round(totalA * (1 + Math.max(0, Number(raw.psuMarginPct) || 0) / 100) * 100) / 100;
  const suggestedA = SITOP_RATINGS_A.find((r) => r >= withMarginA) ?? null;
  return { lines, totalA, withMarginA, suggestedA };
}

export interface SiemensCatalogItem { catalogNo: string; sellingPrice: number; pricelistDate?: string }

/** Unit price for a part: a catalog item with the same part number wins, else the quoted default. */
export function siemensPrice(part: SiemensPart, catalog: SiemensCatalogItem[]): { price: number; source: 'catalog' | 'quote' | 'none' } {
  const code = part.partNo.trim().toUpperCase();
  const hit = code ? catalog
    .filter((c) => (c.catalogNo || '').trim().toUpperCase() === code && (c.sellingPrice || 0) > 0)
    .sort((a, b) => String(b.pricelistDate || '').localeCompare(String(a.pricelistDate || '')))[0] : undefined;
  if (hit) return { price: hit.sellingPrice, source: 'catalog' };
  return part.price > 0 ? { price: part.price, source: 'quote' } : { price: 0, source: 'none' };
}
