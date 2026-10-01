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

import { TERMINAL_GENERIC, TERMINAL_PARTS, terminalStrip, type CatalogPart, type PanelIo, type WiringSummary } from './terminalWiring';

export type { WiringSummary };
export type PlcFamily = 'S7-1200' | 'S7-1500';
export type ModbusMode = 'none' | 'tcp' | 'rtu';
export type HmiLine = 'basic' | 'comfort' | 'unified';
export type ScadaKind = 'none' | 'wincc81' | 'unifiedPc';
export type WinccLicense = 'RC' | 'RT';
/** License delivery: standard (license on USB stick), Asia edition, or download (WinCC V8.1 only). */
export type LicenseEdition = 'standard' | 'asia' | 'dl';
export type Redundancy = 'none' | 'R' | 'H';
export type SwitchType = 'unmanaged' | 'managed';

/** A priced part (brand defaults to Siemens here) — see terminalWiring.ts. */
export type SiemensPart = CatalogPart;

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

/** Tag count of a package name: '2048' → 2048, '2.5k' → 2500. */
export const tagPackageSize = (p: string) => (p.endsWith('k') ? Number(p.slice(0, -1)) * 1000 : Number(p));
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
  // ET 200SP smaller modules (for the cheapest module mix).
  { key: 'di8', partNo: '6ES7131-6BF01-0BA0', price: 0, description: 'SIMATIC ET 200SP, Digital input module, DI 8x 24V DC Standard, type 3 (IEC 61131), sink input (PNP, P-reading), fits to BU-type A0, Colour Code CC01' },
  { key: 'dq8', partNo: '6ES7132-6BF01-0BA0', price: 0, description: 'SIMATIC ET 200SP, Digital output module, DQ 8x 24V DC/0.5A Standard, Source output (PNP, P-switching), fits to BU-type A0, Colour Code CC02' },
  { key: 'ai4i', partNo: '6ES7134-6GD01-0BA1', price: 0, description: 'SIMATIC ET 200SP, Analog input module, AI 4xI 2-/4-wire Standard, suitable for BU type A0, A1, Color code CC03, Module diagnostics, 16 bit' },
  { key: 'ai4u', partNo: '6ES7134-6HD01-0BA1', price: 0, verify: true, description: 'SIMATIC ET 200SP, Analog input module, AI 4xU/I 2-wire Standard, suitable for BU type A0, A1, Color code CC03, Module diagnostics, 16 bit' },
  { key: 'aq2', partNo: '6ES7135-6HB00-0BA1', price: 0, description: 'SIMATIC ET 200SP, Analog output module, AQ 2xU/I Standard, suitable for BU type A0, A1, Color code CC00, Module diagnostics, 16 bit' },
  // S7-1200 signal modules / boards / communication modules (local expansion on the CPU).
  { key: 'sm1221di16', partNo: '6ES7221-1BH32-0XB0', price: 0, description: 'SIMATIC S7-1200, Digital input SM 1221, 16 DI, 24 V DC, sink/source' },
  { key: 'sm1221di8', partNo: '6ES7221-1BF32-0XB0', price: 0, verify: true, description: 'SIMATIC S7-1200, Digital input SM 1221, 8 DI, 24 V DC, sink/source' },
  { key: 'sm1222dq16', partNo: '6ES7222-1BH32-0XB0', price: 0, description: 'SIMATIC S7-1200, Digital output SM 1222, 16 DO, 24 V DC transistor 0.5 A' },
  { key: 'sm1222dq8', partNo: '6ES7222-1BF32-0XB0', price: 0, verify: true, description: 'SIMATIC S7-1200, Digital output SM 1222, 8 DO, 24 V DC transistor 0.5 A' },
  { key: 'sm1231ai4', partNo: '6ES7231-4HD32-0XB0', price: 0, description: 'SIMATIC S7-1200, Analog input SM 1231, 4 AI, +/-10 V, +/-5 V, +/-2.5 V, or 0-20 / 4-20 mA, 12 bit + sign bit (13 bit ADC)' },
  { key: 'sm1231ai8', partNo: '6ES7231-4HF32-0XB0', price: 0, verify: true, description: 'SIMATIC S7-1200, Analog input SM 1231, 8 AI, +/-10 V, +/-5 V, +/-2.5 V, or 0-20 / 4-20 mA, 12 bit + sign bit (13 bit ADC)' },
  { key: 'sm1231rtd4', partNo: '6ES7231-5PD32-0XB0', price: 0, description: 'SIMATIC S7-1200, Analog input SM 1231 RTD, 4 AI, Pt100 / Pt1000 resistance thermometers, 2-/3-/4-wire, 16 bit' },
  { key: 'sm1231rtd8', partNo: '6ES7231-5PF32-0XB0', price: 0, verify: true, description: 'SIMATIC S7-1200, Analog input SM 1231 RTD, 8 AI, Pt100 / Pt1000 resistance thermometers, 2-/3-/4-wire, 16 bit' },
  { key: 'sm1231tc4', partNo: '6ES7231-5QD32-0XB0', price: 0, description: 'SIMATIC S7-1200, Analog input SM 1231 TC, 4 AI, thermocouple, 16 bit' },
  { key: 'sm1231tc8', partNo: '6ES7231-5QF32-0XB0', price: 0, verify: true, description: 'SIMATIC S7-1200, Analog input SM 1231 TC, 8 AI, thermocouple, 16 bit' },
  { key: 'sm1232aq2', partNo: '6ES7232-4HB32-0XB0', price: 0, verify: true, description: 'SIMATIC S7-1200, Analog output SM 1232, 2 AO, +/-10 V or 0-20 mA, 14 bit' },
  { key: 'sm1232aq4', partNo: '6ES7232-4HD32-0XB0', price: 0, verify: true, description: 'SIMATIC S7-1200, Analog output SM 1232, 4 AO, +/-10 V or 0-20 mA, 14 bit' },
  { key: 'sb1231ai1', partNo: '6ES7231-4HA30-0XB0', price: 0, verify: true, description: 'SIMATIC S7-1200, Signal board SB 1231, 1 AI, +/-10 V or 0-20 mA, 12 bit' },
  { key: 'sb1232aq1', partNo: '6ES7232-4HA30-0XB0', price: 0, verify: true, description: 'SIMATIC S7-1200, Signal board SB 1232, 1 AO, +/-10 V or 0-20 mA, 12 bit' },
  // SITOP UPS1600 DC UPS + UPS1100 battery modules (24 V buffering).
  { key: 'ups10', partNo: '6EP4134-3AB00-0AY0', price: 0, description: 'SITOP UPS1600 10 A DC UPS, input 24 V DC, output 24 V DC / 10 A, for UPS1100 battery modules' },
  { key: 'ups20', partNo: '6EP4136-3AB00-0AY0', price: 0, description: 'SITOP UPS1600 20 A DC UPS, input 24 V DC, output 24 V DC / 20 A, for UPS1100 battery modules' },
  { key: 'ups40', partNo: '6EP4137-3AB00-0AY0', price: 0, verify: true, description: 'SITOP UPS1600 40 A DC UPS, input 24 V DC, output 24 V DC / 40 A, for UPS1100 battery modules' },
  { key: 'bat1_2', partNo: '6EP4131-0GB00-0AY0', price: 0, verify: true, description: 'SITOP UPS1100 battery module 24 V / 1.2 Ah, maintenance-free lead battery' },
  { key: 'bat3_2', partNo: '6EP4133-0GB00-0AY0', price: 0, description: 'SITOP UPS1100 battery module 24 V / 3.2 Ah, maintenance-free lead battery' },
  { key: 'bat7', partNo: '6EP4134-0GB00-0AY0', price: 0, verify: true, description: 'SITOP UPS1100 battery module 24 V / 7 Ah, maintenance-free lead battery' },
  { key: 'bat12', partNo: '6EP4135-0GB00-0AY0', price: 0, verify: true, description: 'SITOP UPS1100 battery module 24 V / 12 Ah, maintenance-free lead battery' },
  // PROFINET cabling
  { key: 'pnPatch2m', partNo: '6XV1870-3QH20', price: 0, description: 'SIMATIC NET IE TP Cord RJ45/RJ45, TP cable 4x2 with 2 RJ45 connectors, 2 m (patch cable inside the panel)' },
  { key: 'pnCable', partNo: '6XV1840-2AH10', price: 0, uom: 'm', description: 'SIMATIC NET IE FC TP Standard Cable GP 2x2 (PROFINET Type A), Cat 5e, shielded, sold by the metre' },
  { key: 'pnPlug', partNo: '6GK1901-1BB10-2AA0', price: 0, description: 'SIMATIC NET IE FC RJ45 Plug 180 2x2, RJ45 connector with metal enclosure and FastConnect, 180° cable outlet' },
  { key: 'cm1241', partNo: '6ES7241-1CH32-0XB0', price: 0, verify: true, description: 'SIMATIC S7-1200, Communication module CM 1241, RS-422/485, 9-pin sub D (Modbus RTU / Freeport)' },
  // S7-1500 central I/O (on the CPU's mounting rail) — order numbers from the TIA Selection Tool;
  // DI 32 / DQ 32 BA prices from Exponent Q-DBG-2609-035 (VAT-inc, like the other quoted figures).
  { key: 'c1500di32', partNo: '6ES7521-1BL10-0AA0', price: 22987.09, quoted: true,
    description: 'SIMATIC S7-1500, digital input module DI 32x24 V DC BA, 32 channels in groups of 16, input delay typ. 3.2 ms, type 3 (IEC 61131); incl. push-in front connector' },
  { key: 'c1500di16', partNo: '6ES7521-1BH10-0AA0', price: 0,
    description: 'SIMATIC S7-1500, digital input module DI 16x24 V DC BA, 16 channels; incl. push-in front connector' },
  { key: 'c1500dq32', partNo: '6ES7522-1BL10-0AA0', price: 27946.41, quoted: true,
    description: 'SIMATIC S7-1500, digital output module DQ 32x24 V DC/0.5 A BA, 32 channels in groups of 8, 4 A per group; incl. push-in front connector' },
  { key: 'c1500dq16', partNo: '6ES7522-1BH10-0AA0', price: 0,
    description: 'SIMATIC S7-1500, digital output module DQ 16x24 V DC/0.5 A BA, 16 channels; incl. push-in front connector' },
  { key: 'c1500ai8', partNo: '6ES7531-7KF00-0AB0', price: 0,
    description: 'SIMATIC S7-1500, analog input module AI 8xU/I/RTD/TC ST, 16 bit, 8 channels (4 for RTD); front connector ordered separately' },
  { key: 'c1500aq4', partNo: '6ES7532-5HD00-0AB0', price: 0,
    description: 'SIMATIC S7-1500, analog output module AQ 4xU/I ST, 16 bit, 4 channels; front connector ordered separately' },
  { key: 'c1500fc40', partNo: '6ES7592-1BM00-0XB0', price: 0,
    description: 'SIMATIC S7-1500, front connector, push-in terminals, 40-pole, for 35 mm wide modules' },
  { key: 'c1500cmPtp', partNo: '6ES7541-1AB01-0AB0', price: 0,
    description: 'SIMATIC S7-1500, communication module CM PtP RS422/485 HF, 15-pin D-sub, Freeport, 3964(R), Modbus RTU master/slave' },
  { key: 'c1500ps25', partNo: '6ES7505-0KA00-0AB0', price: 0,
    description: 'SIMATIC S7-1500, system power supply PS 25 W 24 V DC — feeds the backplane bus when the CPU alone can\'t' },
  { key: 'c1500ps60', partNo: '6ES7505-0RA00-0AB0', price: 0,
    description: 'SIMATIC S7-1500, system power supply PS 60 W 24/48/60 V DC — feeds the backplane bus when the CPU alone can\'t' },
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

// WAGO terminals, relays, accessories and 0.5 mm² wire (TERMINAL_PARTS) are
// shared with the other vendors' configurators — see terminalWiring.ts.
export { WIRE_STEP_M, WIRE_PRICE_PER_M } from './terminalWiring';

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
  Object.values(all).forEach((p) => { if (!p.generic) p.generic = genericDescription(p.key); });
  return all;
})();

/**
 * Brand-neutral description for the quotation — what the item does and its
 * key rating, no maker or model (the part number stays in its own column, so
 * it can be hidden and an equivalent supplied when an item is out of stock).
 */
export function genericDescription(key: string): string {
  if (TERMINAL_GENERIC[key]) return TERMINAL_GENERIC[key];
  // CPUs are named by family only on the proposal (TJ's convention): "CPU, S7-1200" / "CPU, S7-1500".
  const cpu = CPU_MODELS.find((m) => m.key === key);
  if (cpu) {
    // Redundant: Siemens' system names — S7-1500R (2 CPUs synced over the PROFINET ring), S7-1500H (bundle, sync modules).
    if (cpu.redundancy === 'H') return 'Redundant CPU, S7-1500H (2 CPUs with synchronization modules and sync cables)';
    if (cpu.redundancy === 'R') return 'Redundant CPU, S7-1500R';
    return `CPU, ${cpu.family}`;
  }
  const mem = MEMORY_CARDS.find((c) => c.key === key);
  if (mem) return `PLC memory card, ${mem.label}`;
  const hmi = HMI_PANELS.find((h) => h.key === key);
  if (hmi) return `HMI touch panel, ${hmi.sizeIn}" widescreen, Ethernet`;
  const sw = SWITCHES.find((x) => x.key === key);
  if (sw) return `Industrial Ethernet switch, ${sw.type}${sw.type === 'managed' ? ' (ring redundancy, VLAN)' : ''}, ${sw.ports} x RJ45 10/100 Mbit/s`;
  const psu = SITOP_OPTIONS.find((x) => x.key === key);
  if (psu) return `Power supply 24 V DC, ${psu.ratingA} A, ${psu.input.startsWith('3-phase') ? '3-phase' : '1-phase'} input`;
  const rail = MOUNTING_RAILS.find((r) => r.key === key);
  if (rail) return `PLC mounting rail, ${rail.lengthMm} mm`;
  let m: RegExpMatchArray | null;
  if ((m = key.match(/^wincc81_(RC|RT)_(\d+)_/))) return `SCADA ${m[1] === 'RC' ? 'runtime & configuration' : 'runtime'} license, ${m[2]} tags`;
  if ((m = key.match(/^unifiedPc_([^_]+)_/))) return `SCADA PC runtime license, ${m[1]} tags`;
  if ((m = key.match(/^wincc81Archive_(\d+)/))) return `SCADA data logging license, ${m[1]} archive tags`;
  if ((m = key.match(/^unifiedClient_(\d+)/))) return `SCADA client license, ${m[1]} client${m[1] === '1' ? '' : 's'}`;
  if ((m = key.match(/^unifiedLogging_(\d+)/))) return `SCADA data logging license, ${m[1]} logging tags`;
  if (key.startsWith('wincc81Client')) return 'SCADA client license';
  if (key.startsWith('wincc81Server')) return 'SCADA server license (client/server)';
  if (key.startsWith('wincc81Redundancy') || key === 'unifiedRedundancy') return 'SCADA redundancy license (redundant server pair)';
  if (key === 'unifiedDbStorage') return 'SCADA database storage license (SQL logging)';
  const GENERIC: Record<string, string> = {
    cb1241: 'RS-485 communication board (Modbus RTU)',
    cmPtp: 'Serial communication module RS-485 / RS-422 / RS-232 (Modbus RTU)',
    imBundle: 'Remote I/O interface module, PROFINET, max. 32 modules, with bus adapter',
    imHf: 'Remote I/O interface module, PROFINET, high feature (system redundancy), max. 64 modules',
    busAdapter: 'Bus adapter, 2 x RJ45',
    di16: 'Digital input module, 16 x 24 V DC',
    dq16: 'Digital output module, 16 x 24 V DC / 0.5 A',
    ai8: 'Analog input module, 8 x 4–20 mA (2-/4-wire)',
    ai8u: 'Analog input module, 8 x 0–10 V',
    rtd8: 'Analog input module, 8 x RTD / thermocouple (2-wire)',
    rtd4: 'Analog input module, 4 x RTD / thermocouple (2-/3-/4-wire)',
    aq4: 'Analog output module, 4 x 0–10 V / 4–20 mA',
    buLight: 'I/O base unit, starts a new potential group',
    buDark: 'I/O base unit',
    buLightA1: 'I/O base unit with temperature sensor (thermocouple), starts a new potential group',
    buDarkA1: 'I/O base unit with temperature sensor (thermocouple)',
    di8: 'Digital input module, 8 x 24 V DC',
    dq8: 'Digital output module, 8 x 24 V DC / 0.5 A',
    ai4i: 'Analog input module, 4 x 4–20 mA (2-/4-wire)',
    ai4u: 'Analog input module, 4 x 0–10 V / 4–20 mA (2-wire)',
    aq2: 'Analog output module, 2 x 0–10 V / 4–20 mA',
    sm1221di16: 'PLC expansion module, 16 digital inputs 24 V DC',
    sm1221di8: 'PLC expansion module, 8 digital inputs 24 V DC',
    sm1222dq16: 'PLC expansion module, 16 digital outputs 24 V DC transistor',
    sm1222dq8: 'PLC expansion module, 8 digital outputs 24 V DC transistor',
    sm1231ai4: 'PLC expansion module, 4 analog inputs 0–10 V / 4–20 mA',
    sm1231ai8: 'PLC expansion module, 8 analog inputs 0–10 V / 4–20 mA',
    sm1231rtd4: 'PLC expansion module, 4 RTD inputs (Pt100 / Pt1000)',
    sm1231rtd8: 'PLC expansion module, 8 RTD inputs (Pt100 / Pt1000)',
    sm1231tc4: 'PLC expansion module, 4 thermocouple inputs',
    sm1231tc8: 'PLC expansion module, 8 thermocouple inputs',
    sm1232aq2: 'PLC expansion module, 2 analog outputs 0–10 V / 4–20 mA',
    sm1232aq4: 'PLC expansion module, 4 analog outputs 0–10 V / 4–20 mA',
    sb1231ai1: 'PLC signal board, 1 analog input 0–10 V / 4–20 mA',
    sb1232aq1: 'PLC signal board, 1 analog output 0–10 V / 4–20 mA',
    cm1241: 'PLC communication module RS-422 / RS-485 (Modbus RTU)',
    c1500di32: 'PLC digital input module, 32 x 24 V DC, with front connector',
    c1500di16: 'PLC digital input module, 16 x 24 V DC, with front connector',
    c1500dq32: 'PLC digital output module, 32 x 24 V DC / 0.5 A, with front connector',
    c1500dq16: 'PLC digital output module, 16 x 24 V DC / 0.5 A, with front connector',
    c1500ai8: 'PLC analog input module, 8 x 0–10 V / 4–20 mA / RTD / thermocouple',
    c1500aq4: 'PLC analog output module, 4 x 0–10 V / 4–20 mA',
    c1500fc40: 'PLC front connector, 40-pole, push-in',
    c1500cmPtp: 'PLC serial communication module RS-422 / RS-485 (Modbus RTU)',
    c1500ps25: 'PLC system power supply, 25 W',
    c1500ps60: 'PLC system power supply, 60 W',
    ups10: 'DC UPS 24 V DC, 10 A (battery buffered)',
    ups20: 'DC UPS 24 V DC, 20 A (battery buffered)',
    ups40: 'DC UPS 24 V DC, 40 A (battery buffered)',
    bat1_2: 'UPS battery module 24 V, 1.2 Ah',
    bat3_2: 'UPS battery module 24 V, 3.2 Ah',
    bat7: 'UPS battery module 24 V, 7 Ah',
    bat12: 'UPS battery module 24 V, 12 Ah',
    pnPatch2m: 'Industrial Ethernet patch cable RJ45/RJ45, shielded, 2 m',
    pnCable: 'Industrial Ethernet cable 2x2, shielded, Cat 5e (per metre)',
    pnPlug: 'Industrial Ethernet RJ45 field plug, metal, 180°',
  };
  return GENERIC[key] ?? '';
}

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
  /** How many of that supply (loads split across them when one isn't enough). */
  psuQty: number;
  /** ET 200SP: DQ outputs on their own potential group (own light BaseUnit / 24 V feed). */
  dqOwnGroup: boolean;
  /** S7-1200: include a memory card (always included for S7-1500, where it's required). */
  memoryCard: boolean;
  /** MEMORY_CARDS key, or 'auto' (24 MB on S7-1500, 4 MB on S7-1200). */
  memCard: string;
  /** S7-1200 I/O beyond on board: signal modules on the CPU, ET 200SP, or auto (local when it fits). */
  expansion: 'auto' | 'local' | 'et200sp';
  /** 'auto' = cheapest mix of 8/16-ch DI/DQ, 4/8-ch AI, 2/4-ch AQ; 'standard' = DI16 / DQ16 / AI8 / AQ4 only. */
  moduleSizes: 'auto' | 'standard';
  /** With cpu 'auto': pick among fail-safe (F) CPUs. */
  failSafe: boolean;
  /** 24 V DC UPS (SITOP UPS1600 + battery) and the backup time wanted (minutes). */
  ups: boolean;
  upsMinutes: number;
  /** What the UPS buffers: the controller electronics only, or the whole 24 V load (incl. DO / field loads). */
  upsLoad: 'controller' | 'all';
  /** PROFINET cabling: patch cables inside the panel; links leaving it get FC cable + field plugs. */
  pnCabling: boolean;
  pnFieldLinks: number;
  pnFieldM: number;
  /** HMI_PANELS key, or 'none'. */
  hmi: string;
  hmiQty: number;
  scada: ScadaKind;
  winccLicense: WinccLicense;
  /** Standard / Asia / download (download is WinCC V8.1 only; Unified falls back to standard). */
  licenseEdition: LicenseEdition;
  /** Tag package (WINCC81_PACKAGES / UNIFIED_PC_PACKAGES). */
  scadaPackage: string;
  /** PowerTag estimate for 'auto': tags per I/O point (value + alarms / status) and extra tags (Modbus devices, setpoints, recipes…). */
  tagsPerPoint: number;
  extraTags: number;
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
  family: 'S7-1200', cpu: 'cpu1214', redundancy: 'none', expansion: 'et200sp', moduleSizes: 'standard', failSafe: false,
  ups: false, upsMinutes: 10, upsLoad: 'controller', pnCabling: false, pnFieldLinks: 0, pnFieldM: 50, di: 0, do: 0, analog: noAnalog(), sparePct: 10,
  modbus: 'none', modbusPorts: 1, sitop: 'none', psuQty: 1, dqOwnGroup: true, memoryCard: false, memCard: 'memCard',
  hmi: 'none', hmiQty: 1, scada: 'none', winccLicense: 'RC', licenseEdition: 'standard', scadaPackage: '2048', tagsPerPoint: 1.5, extraTags: 0, scadaQty: 1,
  scadaClients: 0, scadaRedundant: false, scadaLogging: 'none', scadaDbStorage: false,
  imStations: 0, switchQty: 0, switchType: 'unmanaged', terminals: true, panelW: 800, panelH: 1200,
  doLoadA: 0.1, psuMarginPct: 25,
};

export const CHANNELS = { di16: 16, dq16: 16, ai8: 8, ai8u: 8, rtd8: 8, rtd4: 4, aq4: 4 } as const;
export const IM_MAX_MODULES = 32;
export const IM_HF_MAX_MODULES = 64;
/** ET 200SP: max. current per potential group (P1/P2 bus fed by one light BaseUnit). */
export const ET200SP_GROUP_MAX_A = 10;

/** Which Section B header a line goes under: the PLC, the terminal strip, or the wiring. */
export type PlcSection = 'plc' | 'terminals' | 'wiring';
export const TERMINALS_HEADER = 'TERMINAL BLOCKS & RELAYS';
export const WIRES_HEADER = 'WIRES';

export interface PlcLine { key: string; qty: number; why: string; section: PlcSection }

export interface PlcChannels { needed: number; provided: number }

export interface PlcConfig {
  lines: PlcLine[];
  /** CPU actually used (the auto pick, or the one chosen). */
  cpuKey: string;
  /** How the I/O beyond on board is added. */
  expansion: 'local' | 'et200sp' | 'none';
  /** S7-1200 local expansion: signal modules used / CPU slots, and 5 V backplane current (mA) used / available. */
  local: { modules: number; slots: number; busMa: number; busMaxMa: number } | null;
  /** SCADA PowerTags: I/O points × tags per point + extra = estimate; the package 'auto' picks and the one used. */
  scadaTags: { points: number; perPoint: number; extra: number; estimate: number; autoPackage: string; package: string } | null;
  /** S7-1500 central I/O: modules / rack slots, backplane power (W) vs. what the CPU feeds, the system PS added, rail length; fallback = didn't fit, ET 200SP used. */
  central: { modules: number; slots: number; powerW: number; feedW: number; ps: string | null; railMm: number; fallback?: boolean } | null;
  /** PROFINET links (patch inside the panel, field runs) and the UPS sizing, when asked for. */
  profinet: { links: number; patch: number; field: number; cableM: number } | null;
  ups: { loadA: number; ah: number; minutes: number } | null;
  channels: { di: PlcChannels; do: PlcChannels; ai: PlcChannels; ao: PlcChannels };
  /** Channels needed (incl. spare) per analog type and wiring. */
  analog: Record<AnalogKey, AnalogCount>;
  stations: number;
  /** ET 200SP potential groups = light BaseUnits (A0 + A1). */
  potentialGroups: number;
  /** Fewest stations the module count needs (the auto value). */
  suggestedStations: number;
  ioModules: number;
  /** Switch model and count actually used (after redundancy rules). */
  network: { switchKey: string | null; qty: number; devices: number; portsPerSwitch: number };
  wiring: WiringSummary | null;
  /** I/O for the Control Panel configurator's terminal strip. */
  panelIo: PanelIo;
  notes: string[];
}

// Integer maths first: n × 1.1 in floating point is 110.00000000000001 for n = 100, which would round up to 111.
const withSpare = (n: number, pct: number) => (n > 0 ? Math.ceil((n * (100 + Math.max(0, pct))) / 100 - 1e-9) : 0);
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

// ── Cheapest module mix / auto CPU ───────────────────────────────────────
// Relative prices (₱, rough list-price ratios) used ONLY to rank options when
// neither the pricelist nor a supplier quote has a price — never shown or
// put on the BOM. Real prices (Sales → Pricelists, quotes) always win.
const RANK_PRICE: Record<string, number> = {
  cpu1211: 13000, cpu1212: 17000, cpu1215: 30000, cpu1217: 38000, cpu1212f: 30000, cpu1214f: 38000, cpu1215f: 45000,
  cpu1511: 70000, cpu1515: 190000, cpu1516: 260000, cpu1511c: 95000, cpu1512c: 140000,
  cpu1511f: 110000, cpu1513f: 180000, cpu1515f: 260000, cpu1516f: 340000, cpu1513r: 170000, cpu1515r: 250000, cpu1517h: 900000,
  memCard4: 3500, memCard12: 6000, memCard24: 9000,
  di8: 4300, dq8: 5000, ai4i: 11000, ai4u: 11000, aq2: 10500, ai8u: 16000, rtd8: 17000, rtd4: 12000,
  sm1221di8: 5500, sm1221di16: 8500, sm1222dq8: 6000, sm1222dq16: 9500, sm1231ai4: 13000, sm1231ai8: 21000,
  sm1231rtd4: 15000, sm1231rtd8: 23000, sm1231tc4: 14000, sm1231tc8: 22000, sm1232aq2: 12000, sm1232aq4: 20000,
  sb1231ai1: 7000, sb1232aq1: 7500, cm1241: 8000, cmPtp: 22526, imHf: 38000, busAdapter: 3500,
  buLightA1: 2200, buDarkA1: 1700, rail1500_160: 1500, rail1500_245: 1900,
  c1500di16: 14000, c1500dq16: 16000, c1500ai8: 30000, c1500aq4: 30000, c1500fc40: 1500, c1500cmPtp: 30000, c1500ps25: 15000, c1500ps60: 25000,
};
/** Unit cost for ranking: pricelist → quote → rough relative price. */
function rankCost(key: string, priceOf?: (key: string) => number): number {
  return (priceOf?.(key) || 0) || (SIEMENS_PARTS[key]?.price || 0) || RANK_PRICE[key] || 5000;
}

/** Cheapest set of modules (with an extra cost per module, e.g. its BaseUnit) covering `need` channels. */
export function cheapestModules(need: number, options: { key: string; ch: number }[], cost: (key: string) => number, perModule = 0): Record<string, number> {
  const out: Record<string, number> = {};
  if (need <= 0 || options.length === 0) return out;
  const max = need + Math.max(...options.map((o) => o.ch));
  const best: number[] = Array(max + 1).fill(Infinity);
  const pick: number[] = Array(max + 1).fill(-1);
  best[0] = 0;
  for (let t = 1; t <= max; t++) {
    options.forEach((o, i) => {
      const from = Math.max(0, t - o.ch);
      const c = best[from] + cost(o.key) + perModule;
      if (c < best[t] - 1e-6) { best[t] = c; pick[t] = i; }
    });
  }
  let target = need;
  for (let t = need; t <= max; t++) if (best[t] < best[target] - 1e-6) target = t;
  for (let t = target; t > 0;) {
    const o = options[pick[t]];
    out[o.key] = (out[o.key] ?? 0) + 1;
    t = Math.max(0, t - o.ch);
  }
  return out;
}

// S7-1200: signal-module slots on the right of the CPU, and the 5 V
// backplane current each CPU supplies / each module draws (mA, planning figures).
// S7-1500 central I/O: modules per rack (slots 2–31), power the CPU feeds into
// the backplane bus, and what each module takes from it (W) — planning figures
// from the Siemens manuals; check the power budget in the TIA Portal.
const C1500_MAX_MODULES = 30;
const C1500_CPU_FEED_W = 10;
const C1500_BUS_W: Record<string, number> = { c1500di32: 1, c1500di16: 0.8, c1500dq32: 1, c1500dq16: 0.8, c1500ai8: 0.7, c1500aq4: 0.8, c1500cmPtp: 0.6 };
/** Module width on the S7-1500 rail (mm): BA digital 25 mm, the others 35 mm. */
const C1500_WIDTH_MM: Record<string, number> = { c1500di32: 25, c1500di16: 25, c1500dq32: 25, c1500dq16: 25, c1500ai8: 35, c1500aq4: 35, c1500cmPtp: 35 };

const SM_SLOTS = (key: string) => (/^cpu1211/.test(key) ? 0 : /^cpu1212/.test(key) ? 2 : 8);
const BUS_MA_MAX = (key: string) => (/^cpu1211/.test(key) || /^cpu1212/.test(key) ? 1000 : 1600);
const BUS_MA: Record<string, number> = {
  sm1221di8: 105, sm1221di16: 130, sm1222dq8: 120, sm1222dq16: 140, sm1231ai4: 80, sm1231ai8: 90,
  sm1231rtd4: 80, sm1231rtd8: 90, sm1231tc4: 80, sm1231tc8: 80, sm1232aq2: 80, sm1232aq4: 80, sb1231ai1: 55, sb1232aq1: 15, cm1241: 220,
};

/** Performance class the I/O count asks for — S7-1500: 1 = 1511 … 4 = 1516; S7-1200: 1 = 1211C … 5 = 1217C (work memory grows with it). */
const tierFor = (channels: number, family: PlcFamily) => (family === 'S7-1200'
  ? (channels <= 64 ? 1 : channels <= 128 ? 2 : channels <= 256 ? 3 : channels <= 400 ? 4 : 5)
  : (channels <= 256 ? 1 : channels <= 1024 ? 2 : channels <= 2048 ? 3 : 4));
const CPU_TIER: Record<string, number> = {
  cpu1211: 1, cpu1212: 2, cpu1212f: 2, cpu1214: 3, cpu1214f: 3, cpu1215: 4, cpu1215f: 4, cpu1217: 5,
  cpu1511: 1, cpu1511c: 1, cpu1511f: 1, cpu1513: 2, cpu1512c: 2, cpu1513f: 2, cpu1513r: 2,
  cpu1515: 3, cpu1515f: 3, cpu1515r: 3, cpu1516: 4, cpu1516f: 4, cpu1517h: 4,
};

/** CPUs the auto pick chooses from (DC/DC/DC S7-1200s; relay / AC variants only by hand). */
export function autoCpuCandidates(inp: Pick<PlcInputs, 'family' | 'redundancy' | 'failSafe'>): string[] {
  if (inp.redundancy === 'R') return ['cpu1513r', 'cpu1515r'];
  if (inp.redundancy === 'H') return ['cpu1517h'];
  if (inp.family === 'S7-1200') return inp.failSafe ? ['cpu1212f', 'cpu1214f', 'cpu1215f'] : ['cpu1211', 'cpu1212', 'cpu1214', 'cpu1215', 'cpu1217'];
  return inp.failSafe ? ['cpu1511f', 'cpu1513f', 'cpu1515f', 'cpu1516f'] : ['cpu1511', 'cpu1511c', 'cpu1513', 'cpu1512c', 'cpu1515', 'cpu1516'];
}

/**
 * Configure the PLC. With `cpu: 'auto'`, every suitable CPU is tried and the
 * cheapest complete configuration wins (S7-1500: only CPUs of the performance
 * class the I/O count needs). `priceOf(key)` = pricelist price (0 = none).
 */
export function configurePlc(raw: PlcInputs, priceOf?: (key: string) => number): PlcConfig {
  if (raw.cpu !== 'auto') return configurePlcFor(raw, priceOf);
  const redundant = (raw.redundancy ?? 'none') !== 'none';
  const family: PlcFamily = redundant ? 'S7-1500' : raw.family;
  const probe = configurePlcFor({ ...raw, cpu: autoCpuCandidates({ ...raw, family })[0] }, priceOf);
  const channels = probe.channels.di.needed + probe.channels.do.needed + probe.channels.ai.needed + probe.channels.ao.needed;
  const tier = tierFor(channels, family);
  const all = autoCpuCandidates({ ...raw, family });
  const fitting = all.filter((k) => (CPU_TIER[k] ?? 5) >= tier);
  // Nothing big enough (e.g. redundant R for a very large system) → the largest on offer.
  const candidates = fitting.length ? fitting : all.slice(-1);
  let best: PlcConfig | null = null;
  let bestCost = Infinity;
  candidates.forEach((k) => {
    const c = configurePlcFor({ ...raw, cpu: k }, priceOf);
    const cost = c.lines.filter((l) => l.section === 'plc').reduce((sum, l) => sum + l.qty * rankCost(l.key, priceOf), 0);
    if (cost < bestCost - 1e-6) { best = c; bestCost = cost; }
  });
  const chosen = best ?? probe;
  const m = cpuModel(family, chosen.cpuKey, raw.redundancy ?? 'none');
  chosen.notes.unshift(`Auto CPU: ${m.label} — the lowest-cost fit for ${channels} channels (performance class ${tier} of ${family === 'S7-1200' ? 5 : 4}).`);
  if (family === 'S7-1200' && channels > 400) chosen.notes.push(`${channels} channels is a lot for an S7-1200 — consider an S7-1500.`);
  return chosen;
}

function configurePlcFor(raw: PlcInputs, priceOf?: (key: string) => number): PlcConfig {
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

  const leftDi = Math.max(0, need.di - cpu.onboard.di);
  const leftDo = Math.max(0, need.do - cpu.onboard.do);
  const rtuPorts = inp.modbus === 'rtu' ? inp.modbusPorts : 0;
  const cost = (key: string) => rankCost(key, priceOf);

  // ── S7-1200 local expansion: signal modules on the CPU (+ a signal board) ──
  let localMods: Record<string, number> = {};
  let local: PlcConfig['local'] = null;
  let useLocal = false;
  if (is1200 && inp.expansion !== 'et200sp') {
    const lm: Record<string, number> = {};
    const merge = (m: Record<string, number>) => Object.entries(m).forEach(([k, v]) => { lm[k] = (lm[k] ?? 0) + v; });
    let aiLeft = modNeed.aiI + modNeed.aiU;
    let aoLeft = modNeed.aoI + modNeed.aoU;
    // Signal board (front of the CPU) for a single leftover AI or AO — the CB 1241 uses the same slot.
    const boardFree = rtuPorts === 0;
    if (boardFree && aiLeft === 1) { lm.sb1231ai1 = 1; aiLeft = 0; } else if (boardFree && aoLeft === 1) { lm.sb1232aq1 = 1; aoLeft = 0; }
    const small = inp.moduleSizes === 'auto';
    merge(cheapestModules(leftDi, [{ key: 'sm1221di16', ch: 16 }, ...(small ? [{ key: 'sm1221di8', ch: 8 }] : [])], cost));
    merge(cheapestModules(leftDo, [{ key: 'sm1222dq16', ch: 16 }, ...(small ? [{ key: 'sm1222dq8', ch: 8 }] : [])], cost));
    merge(cheapestModules(aiLeft, [{ key: 'sm1231ai8', ch: 8 }, { key: 'sm1231ai4', ch: 4 }], cost));
    merge(cheapestModules(analog.aiRtd.w2 + analog.aiRtd.w4, [{ key: 'sm1231rtd8', ch: 8 }, { key: 'sm1231rtd4', ch: 4 }], cost));
    merge(cheapestModules(analog.aiTc.w2, [{ key: 'sm1231tc8', ch: 8 }, { key: 'sm1231tc4', ch: 4 }], cost));
    merge(cheapestModules(aoLeft, [{ key: 'sm1232aq4', ch: 4 }, { key: 'sm1232aq2', ch: 2 }], cost));
    const cms = Math.max(0, rtuPorts - 1);
    if (cms > 0) lm.cm1241 = cms;
    const smCount = Object.entries(lm).filter(([k]) => k.startsWith('sm12')).reduce((n, [, v]) => n + v, 0);
    const busMa = Object.entries(lm).reduce((n, [k, v]) => n + (BUS_MA[k] ?? 0) * v, 0);
    local = { modules: smCount, slots: SM_SLOTS(cpu.key), busMa, busMaxMa: BUS_MA_MAX(cpu.key) };
    const fits = smCount <= local.slots && cms <= 3 && busMa <= local.busMaxMa;
    useLocal = fits && whole(inp.imStations) === 0;
    if (useLocal) localMods = lm;
    else local = inp.expansion === 'local' ? local : null;
  }

  // ── S7-1500 central I/O: modules on the CPU's own mounting rail (chosen, never auto) ──
  // Slot 0 = system power supply, slot 1 = CPU, slots 2–31 = up to 30 modules.
  // R/H CPUs take no central I/O (ET 200SP over system redundancy only).
  let central: PlcConfig['central'] = null;
  if (!is1200 && !redundant && inp.expansion === 'local') {
    const lm: Record<string, number> = {};
    const merge = (m: Record<string, number>) => Object.entries(m).forEach(([k, v]) => { lm[k] = (lm[k] ?? 0) + v; });
    const small = inp.moduleSizes === 'auto';
    merge(cheapestModules(leftDi, [{ key: 'c1500di32', ch: 32 }, ...(small ? [{ key: 'c1500di16', ch: 16 }] : [])], cost));
    merge(cheapestModules(leftDo, [{ key: 'c1500dq32', ch: 32 }, ...(small ? [{ key: 'c1500dq16', ch: 16 }] : [])], cost));
    // AI 8xU/I/RTD/TC ST takes every input type; an RTD uses 2 channels (4 RTD per module).
    const aiUnits = modNeed.aiI + modNeed.aiU + analog.aiTc.w2 + 2 * (analog.aiRtd.w2 + analog.aiRtd.w4);
    if (aiUnits > 0) lm.c1500ai8 = Math.ceil(aiUnits / 8);
    const aq = modNeed.aoI + modNeed.aoU;
    if (aq > 0) lm.c1500aq4 = Math.ceil(aq / 4);
    if (rtuPorts > 0) lm.c1500cmPtp = rtuPorts;
    const fc = (lm.c1500ai8 ?? 0) + (lm.c1500aq4 ?? 0);
    const modules = Object.values(lm).reduce((a, b) => a + b, 0);
    // Backplane power (planning figures): the CPU feeds ~10 W; above that a system PS in slot 0.
    const powerW = Math.round(Object.entries(lm).reduce((w, [k, q]) => w + (C1500_BUS_W[k] ?? 1) * q, 0) * 10) / 10;
    const ps = powerW <= C1500_CPU_FEED_W ? null : powerW <= C1500_CPU_FEED_W + 25 ? 'c1500ps25' : 'c1500ps60';
    const railMm = (CPU1500_WIDTH_MM[cpu.key] ?? 70) + (ps === 'c1500ps25' ? 35 : ps === 'c1500ps60' ? 70 : 0)
      + Object.entries(lm).reduce((mm, [k, q]) => mm + (C1500_WIDTH_MM[k] ?? 35) * q, 0);
    const fits = modules <= C1500_MAX_MODULES && powerW <= C1500_CPU_FEED_W + 60;
    if (fits && whole(inp.imStations) === 0) {
      useLocal = true;
      if (fc > 0) lm.c1500fc40 = fc;
      if (ps) lm[ps] = 1;
      localMods = lm;
      central = { modules, slots: C1500_MAX_MODULES, powerW, feedW: C1500_CPU_FEED_W, ps, railMm };
    } else {
      central = { modules, slots: C1500_MAX_MODULES, powerW, feedW: C1500_CPU_FEED_W, ps, railMm, fallback: true };
    }
  }

  // ── ET 200SP modules (cheapest mix; each module also takes a BaseUnit) ──
  const buCost = SIEMENS_PARTS.buDark.price;
  const sizes = inp.moduleSizes === 'auto';
  const pickSp = (n: number, opts: { key: string; ch: number }[]) => (useLocal ? {} : cheapestModules(n, sizes ? opts : opts.slice(0, 1), cost, buCost));
  const spDi = pickSp(leftDi, [{ key: 'di16', ch: 16 }, { key: 'di8', ch: 8 }]);
  const spDq = pickSp(leftDo, [{ key: 'dq16', ch: 16 }, { key: 'dq8', ch: 8 }]);
  const spAiI = pickSp(modNeed.aiI, [{ key: 'ai8', ch: 8 }, { key: 'ai4i', ch: 4 }]);
  const spAiU = pickSp(modNeed.aiU, [{ key: 'ai8u', ch: 8 }, { key: 'ai4u', ch: 4 }]);
  const spRtd2 = pickSp(analog.aiRtd.w2, [{ key: 'rtd8', ch: 8 }, { key: 'rtd4', ch: 4 }]);
  const spAq = pickSp(modNeed.aoI + modNeed.aoU, [{ key: 'aq4', ch: 4 }, { key: 'aq2', ch: 2 }]);
  const rtd8Mods = spRtd2.rtd8 ?? 0;
  const rtd4Mods = (spRtd2.rtd4 ?? 0) + (useLocal ? 0 : Math.ceil(analog.aiRtd.w4 / CHANNELS.rtd4));
  const tcMods = useLocal ? 0 : Math.ceil(analog.aiTc.w2 / CHANNELS.rtd8);

  const useCb = is1200 && rtuPorts >= 1;
  const cmMods = useLocal ? 0 : is1200 ? Math.max(0, rtuPorts - 1) : rtuPorts;

  // Modules in slot order: inputs / analog / CM first, then the DQ outputs,
  // thermocouple modules (type A1 BaseUnits) last — so a station only opens on
  // an A1 BaseUnit when it holds nothing but TC modules.
  const imMax = redundant ? IM_HF_MAX_MODULES : IM_MAX_MODULES;
  const doLoad = Math.max(0, Number(inp.doLoadA) || 0);
  type SlotModule = { a1: boolean; dq: boolean; amps: number };
  const slots: SlotModule[] = [];
  const put = (count: number, m: SlotModule) => { for (let i = 0; i < count; i++) slots.push(m); };
  // Current each module takes from its potential group (P1/P2), at full channel
  // capacity: electronics + sensor / loop / output-load current per channel.
  const groupAmps = (electronics: number, channels: number, perChannel: number) => electronics + channels * perChannel;
  put(spDi.di16 ?? 0, { a1: false, dq: false, amps: groupAmps(0.05, 16, 0.01) });
  put(spDi.di8 ?? 0, { a1: false, dq: false, amps: groupAmps(0.03, 8, 0.01) });
  put(spAiI.ai8 ?? 0, { a1: false, dq: false, amps: groupAmps(0.03, 8, 0.02) });
  put(spAiI.ai4i ?? 0, { a1: false, dq: false, amps: groupAmps(0.03, 4, 0.02) });
  put(spAiU.ai8u ?? 0, { a1: false, dq: false, amps: groupAmps(0.03, 8, 0.02) });
  put(spAiU.ai4u ?? 0, { a1: false, dq: false, amps: groupAmps(0.03, 4, 0.02) });
  put(rtd8Mods + rtd4Mods, { a1: false, dq: false, amps: 0.03 });
  put(spAq.aq4 ?? 0, { a1: false, dq: false, amps: groupAmps(0.05, 4, 0.02) });
  put(spAq.aq2 ?? 0, { a1: false, dq: false, amps: groupAmps(0.04, 2, 0.02) });
  put(cmMods, { a1: false, dq: false, amps: 0.05 });
  put(spDq.dq16 ?? 0, { a1: false, dq: true, amps: groupAmps(0.05, 16, doLoad) });
  put(spDq.dq8 ?? 0, { a1: false, dq: true, amps: groupAmps(0.03, 8, doLoad) });
  put(tcMods, { a1: true, dq: false, amps: 0.03 });
  const ioModules = slots.length;
  // Stations: the minimum the module count needs, or more when asked for
  // (e.g. a separate IM per area / panel) — never more than one per module.
  const suggestedStations = ioModules > 0 ? Math.ceil(ioModules / imMax) : 0;
  const askedStations = whole(inp.imStations);
  const stations = ioModules > 0 ? Math.min(ioModules, Math.max(suggestedStations, askedStations)) : 0;
  const bu = { lightA0: 0, darkA0: 0, lightA1: 0, darkA1: 0 };
  // A light BaseUnit (…+2D) starts a potential group: it takes the 24 V in and
  // feeds the P1/P2 bus of the dark ones to its right. A new group starts at
  // the first module of every station, whenever the group would pass 10 A, and
  // — when asked — where the DQ outputs begin (own supply, e.g. switched off
  // by the E-stop) and where the inputs resume after them.
  const groupReasons = { overCurrent: 0, outputs: 0 };
  let groupsMaxA = 0;
  let first = 0;
  for (let s = 0; s < stations; s++) {
    // Modules shared out evenly: the first (ioModules % stations) stations take one more.
    const size = Math.floor(ioModules / stations) + (s < ioModules % stations ? 1 : 0);
    let groupA = 0;
    let prev: SlotModule | null = null;
    for (const m of slots.slice(first, first + size)) {
      const split = !!prev && inp.dqOwnGroup && m.dq !== prev.dq;
      const over = !!prev && !split && groupA + m.amps > ET200SP_GROUP_MAX_A;
      if (!prev || split || over) {
        if (split) groupReasons.outputs += 1;
        if (over) groupReasons.overCurrent += 1;
        if (m.a1) bu.lightA1 += 1; else bu.lightA0 += 1;
        groupA = 0;
      } else if (m.a1) bu.darkA1 += 1; else bu.darkA0 += 1;
      groupA += m.amps;
      groupsMaxA = Math.max(groupsMaxA, groupA);
      prev = m;
    }
    first += size;
  }
  const potentialGroups = bu.lightA0 + bu.lightA1;

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
  else add(cpu.key, 1, hasOnboard ? `CPU — ${onboardText(cpu)} on board${useLocal ? ', the rest on signal modules' : ''}` : 'CPU — all I/O on ET 200SP');
  // Auto: 24 MB covers most S7-1500 programs; 4 MB is enough to transfer / back up an S7-1200.
  const card = inp.memCard === 'auto' ? (is1200 ? 'memCard4' : 'memCard24') : MEMORY_CARDS.some((c) => c.key === inp.memCard) ? inp.memCard : 'memCard';
  if (redundant) add(card, 2, 'One per CPU (required)');
  else if (!is1200) add(card, 1, 'Required by every S7-1500 CPU');
  else if (inp.memoryCard) add(card, 1, 'Optional on S7-1200 (program backup / transfer)');
  if (!is1200) {
    const onRail = central && !central.fallback ? central.railMm : CPU1500_WIDTH_MM[cpu.key] ?? 70;
    const rail = MOUNTING_RAILS.find((r) => r.lengthMm >= onRail) ?? MOUNTING_RAILS[MOUNTING_RAILS.length - 1];
    add(rail.key, cpuUnits, central && !central.fallback
      ? `S7-1500 mounting rail — CPU${central.ps ? ' + system PS' : ''} + ${central.modules} central module${central.modules === 1 ? '' : 's'} ≈ ${onRail} mm`
      : `S7-1500 mounting rail for the CPU (${CPU1500_WIDTH_MM[cpu.key] ?? 70} mm wide)${redundant ? ' — one per CPU' : ''}`);
  }
  add('cb1241', useCb ? 1 : 0, 'Modbus RTU port on the CPU (1 × RS-485)');
  if (redundant) {
    add('imHf', stations, `ET 200SP station${stations === 1 ? '' : 's'} on system redundancy S2 — max ${IM_HF_MAX_MODULES} modules each (server module included)`);
    add('busAdapter', stations, 'One BusAdapter per interface module');
  } else {
    add('imBundle', stations, `ET 200SP station${stations === 1 ? '' : 's'} — max ${IM_MAX_MODULES} modules each (incl. server module + BusAdapter)`);
  }
  const why = (base: string) => (sizes ? `${base} — cheapest mix of module sizes` : base);
  add('di16', spDi.di16 ?? 0, why(`${CHANNELS.di16} DI each`));
  add('di8', spDi.di8 ?? 0, why('8 DI each'));
  add('dq16', spDq.dq16 ?? 0, why(`${CHANNELS.dq16} DQ each`));
  add('dq8', spDq.dq8 ?? 0, why('8 DQ each'));
  add('ai8', spAiI.ai8 ?? 0, why(`${CHANNELS.ai8} AI 4–20 mA (2- or 4-wire) each`));
  add('ai4i', spAiI.ai4i ?? 0, why('4 AI 4–20 mA (2- or 4-wire) each'));
  add('ai8u', spAiU.ai8u ?? 0, why(`${CHANNELS.ai8u} AI 0–10 V each`));
  add('ai4u', spAiU.ai4u ?? 0, why('4 AI 0–10 V each'));
  const rtd8Why = [rtd8Mods ? `${rtd8Mods} for RTD 2-wire` : '', tcMods ? `${tcMods} for thermocouples (on A1 BaseUnits)` : ''].filter(Boolean).join(', ');
  add('rtd8', rtd8Mods + tcMods, `${CHANNELS.rtd8} RTD/TC each — ${rtd8Why}`);
  add('rtd4', rtd4Mods, `${CHANNELS.rtd4} RTD 3-/4-wire each`);
  add('aq4', spAq.aq4 ?? 0, why(`${CHANNELS.aq4} AQ (0–10 V or 4–20 mA) each`));
  add('aq2', spAq.aq2 ?? 0, why('2 AQ (0–10 V or 4–20 mA) each'));
  // S7-1200 local expansion
  const LOCAL_WHY: Record<string, string> = {
    sm1221di16: '16 DI', sm1221di8: '8 DI', sm1222dq16: '16 DQ transistor', sm1222dq8: '8 DQ transistor',
    sm1231ai8: '8 AI 0–10 V / 4–20 mA', sm1231ai4: '4 AI 0–10 V / 4–20 mA', sm1231rtd8: '8 RTD', sm1231rtd4: '4 RTD',
    sm1231tc8: '8 thermocouple', sm1231tc4: '4 thermocouple', sm1232aq4: '4 AQ', sm1232aq2: '2 AQ',
    sb1231ai1: 'signal board, 1 AI (front of the CPU)', sb1232aq1: 'signal board, 1 AQ (front of the CPU)', cm1241: 'extra Modbus RTU port (left of the CPU, max. 3)',
    c1500di32: '32 DI (central)', c1500di16: '16 DI (central)', c1500dq32: '32 DQ (central)', c1500dq16: '16 DQ (central)',
    c1500ai8: '8 AI — 0–10 V, 4–20 mA, TC (4 RTD) (central)', c1500aq4: '4 AQ (central)', c1500cmPtp: '1 per Modbus RTU (RS-485) port (central)',
    c1500fc40: 'front connector for each AI / AQ module', c1500ps25: `system power supply — the modules need ${central?.powerW ?? 0} W, the CPU feeds ${C1500_CPU_FEED_W} W`,
    c1500ps60: `system power supply — the modules need ${central?.powerW ?? 0} W, the CPU feeds ${C1500_CPU_FEED_W} W`,
  };
  Object.entries(localMods).forEach(([k, q]) => add(k, q, `${k.startsWith('c1500') ? 'On the CPU rack' : 'On the CPU'} — ${LOCAL_WHY[k] ?? k}`));
  add('cmPtp', cmMods, is1200 ? 'Extra Modbus RTU ports (CB 1241 gives only one)' : '1 per Modbus RTU (RS-485) port');
  const groupWhy = [
    stations ? `start of ${stations === 1 ? 'the station' : `each of ${stations} stations`}` : '',
    groupReasons.outputs ? `${groupReasons.outputs} where the DQ outputs start / end (own 24 V group)` : '',
    groupReasons.overCurrent ? `${groupReasons.overCurrent} more to keep each group under ${ET200SP_GROUP_MAX_A} A` : '',
  ].filter(Boolean).join('; ');
  add('buLight', bu.lightA0, `Starts a potential group (24 V feed) — ${groupWhy}`);
  add('buDark', bu.darkA0, 'One BaseUnit per remaining module');
  add('buLightA1', bu.lightA1, 'First BaseUnit of a thermocouple-only station');
  add('buDarkA1', bu.darkA1, 'Thermocouple modules — temperature sensor for cold-junction compensation');
  if (netSwitch) {
    add(netSwitch.key, sw.qty, `${sw.type === 'managed' ? 'Managed' : 'Unmanaged'} — ${devices} network device${devices === 1 ? '' : 's'}, ~${portsPerSwitch} ports per switch${redundant ? ' (MRP ring for the redundant system)' : ''}`);
  }
  if (panel) add(panel.key, inp.hmiQty, `Operator panel — ${panel.sizeIn}"`);
  // ── SCADA PowerTags: estimated from the I/O (incl. spare) for the 'auto' package ──
  let scadaTags: PlcConfig['scadaTags'] = null;
  if (inp.scada !== 'none') {
    const pkgs = inp.scada === 'wincc81' ? WINCC81_PACKAGES : UNIFIED_PC_PACKAGES;
    const points = need.di + need.do + need.ai + need.ao;
    const perPoint = Math.max(0, Number(inp.tagsPerPoint) || 0);
    const extra = whole(inp.extraTags);
    const estimate = Math.ceil(points * perPoint - 1e-9) + extra;
    const autoPackage = pkgs.find((p) => tagPackageSize(p) >= estimate) ?? pkgs[pkgs.length - 1];
    scadaTags = { points, perPoint, extra, estimate, autoPackage, package: autoPackage };
  }
  if (inp.scada !== 'none') {
    const pkgs = inp.scada === 'wincc81' ? WINCC81_PACKAGES : UNIFIED_PC_PACKAGES;
    const est = scadaTags!;
    const pkg = inp.scadaPackage === 'auto' ? est.autoPackage : pkgs.includes(inp.scadaPackage) ? inp.scadaPackage : pkgs[0];
    est.package = pkg;
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
  const psuQty = Math.max(1, whole(inp.psuQty));
  if (psu) add(psu.key, psuQty, psuQty > 1 ? `24 V DC supply — ${psuQty} × ${psu.ratingA} A = ${psuQty * psu.ratingA} A, loads split across them` : `24 V DC supply — ${psu.ratingA} A`);

  // ── WAGO terminal strip + 0.5 mm² wiring ──
  let wiring: WiringSummary | null = null;
  const a2 = ANALOG_KEYS.reduce((s, k) => s + analog[k].w2, 0);
  const a4 = ANALOG_KEYS.reduce((s, k) => s + analog[k].w4, 0);
  // +24 V / 0 V distribution: CPU(s), each station's IM and light BaseUnit,
  // panels and switches, plus the PSU feed.
  const panelIo: PanelIo = {
    source: `Siemens ${redundant ? `S7-1500${inp.redundancy}` : family}`,
    di: need.di, dq: need.do, a2, a4,
    distPoints: (cpu.drawA > 0 ? cpuUnits : 0) + stations + potentialGroups + (panel ? inp.hmiQty : 0) + sw.qty + psuQty
      + (central && !central.fallback ? central.modules + (central.ps ? 1 : 0) : 0),
    deviceRailMm: stations * (50 + 12.5) + ioModules * 15 + (is1200 ? 110 : 0),
    ...(psu ? { psuA: psu.ratingA, psuQty } : {}),
  };
  if (inp.terminals && need.di + need.do + a2 + a4 > 0) {
    const strip = terminalStrip({
      ...panelIo, extraRailMm: stations * (50 + 12.5) + ioModules * 15, railFor: 'terminals, relays and ET 200SP',
      panelW: whole(inp.panelW), panelH: whole(inp.panelH),
    });
    wiring = strip.wiring;
    strip.lines.forEach((l) => add(l.key, l.qty, l.why, l.section));
  }

  const notes: string[] = [];
  if (useLocal && local) notes.push(`S7-1200 local expansion: ${local.modules} of ${local.slots} signal-module slots, ${local.busMa} of ${local.busMaxMa} mA backplane current — no ET 200SP station needed.`);
  if (central && !central.fallback) notes.push(`S7-1500 central I/O: ${central.modules} of ${central.slots} module slots on the CPU rack, ${central.powerW} W backplane power (CPU feeds ${central.feedW} W${central.ps ? ` + ${central.ps === 'c1500ps25' ? 'PS 25 W' : 'PS 60 W'}` : ''}) — planning figures, check the power budget in TIA Portal. No ET 200SP station needed.`);
  if (central?.fallback) notes.push(`Central I/O doesn't fit the S7-1500 rack (${central.modules} modules for ${central.slots} slots${central.powerW > central.feedW + 60 ? `, ${central.powerW} W backplane power` : ''}${whole(inp.imStations) > 0 ? ', or ET 200SP stations were asked for' : ''}) — using ET 200SP instead.`);
  if (is1200 && inp.expansion === 'local' && !useLocal && local) notes.push(`Doesn't fit on the CPU (${local.modules} signal modules for ${local.slots} slots, ${local.busMa} / ${local.busMaxMa} mA) — using ET 200SP instead.`);
  if (redundant) notes.push(`${inp.redundancy === 'R' ? 'S7-1500R' : 'S7-1500H'}: ET 200SP on IM 155-6 PN/2 HF (system redundancy S2) and the PROFINET ring on managed switches (MRP). Consider a second 24 V supply with a redundancy module.`);
  if (redundant && whole(inp.switchQty) < 2) notes.push('Redundancy needs at least 2 managed switches — added automatically.');
  if (redundant && inp.switchType === 'unmanaged' && whole(inp.switchQty) > 0) notes.push('Unmanaged switches can\'t run the MRP ring — managed ones are used instead.');
  if (netSwitch && netSwitch.ports < portsPerSwitch) notes.push(`About ${portsPerSwitch} ports are needed per switch but the largest ${sw.type} one has ${netSwitch.ports} — add more switches.`);
  if (scadaTags) {
    const t = scadaTags;
    const pkgs = inp.scada === 'wincc81' ? WINCC81_PACKAGES : UNIFIED_PC_PACKAGES;
    if (t.estimate > tagPackageSize(pkgs[pkgs.length - 1])) notes.push(`About ${t.estimate} PowerTags — more than the largest ${inp.scada === 'wincc81' ? 'WinCC V8.1' : 'WinCC Unified'} package (${pkgs[pkgs.length - 1]}); split the project or check with Siemens.`);
    else if (tagPackageSize(t.package) < t.estimate) notes.push(`The ${t.package} PowerTag package is below the ~${t.estimate} tags estimated — the ${t.autoPackage} package would cover it.`);
  }
  if (inp.modbus === 'tcp') notes.push('Modbus TCP runs on the CPU\'s PROFINET port — no extra hardware.');
  if (is1200 && need.ai > 0 && tot('aiU') < cpu.onboard.ai) notes.push('The CPU\'s on-board AI are 0–10 V only — other analog inputs go on ET 200SP modules.');
  if (potentialGroups > stations) notes.push(`${potentialGroups} ET 200SP potential groups (one light BaseUnit each, its own 24 V feed): max. ${ET200SP_GROUP_MAX_A} A per group${inp.dqOwnGroup && groupReasons.outputs ? ', DQ outputs on their own group' : ''}.`);
  if (groupsMaxA > ET200SP_GROUP_MAX_A) notes.push(`One output module alone takes about ${Math.round(groupsMaxA * 10) / 10} A at ${doLoad} A per output — over the ${ET200SP_GROUP_MAX_A} A a potential group carries. Use 8-channel DQ modules or interposing relays.`);
  if (analog.aiTc.w2 > 0) notes.push('Thermocouple modules sit on type A1 BaseUnits for internal cold-junction compensation.');
  if (cpu.relayOutputs && inp.do > 0) notes.push('This CPU\'s on-board outputs are relays (2 A) — fine for contactors, not for fast pulse outputs.');
  if (cpu.drawA === 0) notes.push('AC/DC/RLY CPU is powered from 120/230 V AC — it is not counted in the 24 V load.');
  if (cpu.failSafe) notes.push('Fail-safe CPU — safety I/O (F-DI / F-DQ) is not auto-selected; add those modules yourself.');
  if (askedStations > 0 && askedStations < suggestedStations) notes.push(`${ioModules} modules need at least ${suggestedStations} ET 200SP stations — using ${suggestedStations}, not ${askedStations}.`);
  if (askedStations > ioModules && ioModules > 0) notes.push(`Only ${ioModules} module${ioModules === 1 ? '' : 's'}, so at most ${ioModules} station${ioModules === 1 ? '' : 's'} (each needs at least one module).`);
  if (stations > suggestedStations) notes.push(`${stations} ET 200SP stations as requested — ${ioModules} modules shared out about ${Math.ceil(ioModules / stations)} per station; move modules between stations on the quotation if an area needs more.`);
  else if (stations > 1) notes.push(`${ioModules} modules need ${stations} ET 200SP stations (${imMax} modules per ${redundant ? 'IM 155-6 PN/2 HF' : 'IM 155-6 PN ST'}).`);
  if (wiring) notes.push('Terminals and wiring cover the I/O incl. spare; the main feed from the PSU to the distribution terminals is not included (size it separately).');

  const LOCAL_CH: Record<string, ['di' | 'do' | 'ai' | 'ao', number]> = {
    sm1221di16: ['di', 16], sm1221di8: ['di', 8], sm1222dq16: ['do', 16], sm1222dq8: ['do', 8],
    sm1231ai8: ['ai', 8], sm1231ai4: ['ai', 4], sm1231rtd8: ['ai', 8], sm1231rtd4: ['ai', 4], sm1231tc8: ['ai', 8], sm1231tc4: ['ai', 4],
    sm1232aq4: ['ao', 4], sm1232aq2: ['ao', 2], sb1231ai1: ['ai', 1], sb1232aq1: ['ao', 1],
    c1500di32: ['di', 32], c1500di16: ['di', 16], c1500dq32: ['do', 32], c1500dq16: ['do', 16], c1500ai8: ['ai', 8], c1500aq4: ['ao', 4],
  };
  const localCh = { di: 0, do: 0, ai: 0, ao: 0 };
  Object.entries(localMods).forEach(([k, q]) => { const c = LOCAL_CH[k]; if (c) localCh[c[0]] += c[1] * q; });
  const spCh = (m: Record<string, number>, per: Record<string, number>) => Object.entries(m).reduce((s2, [k, q]) => s2 + (per[k] ?? 0) * q, 0);
  const provided = {
    di: cpu.onboard.di + spCh(spDi, { di16: 16, di8: 8 }) + localCh.di,
    do: cpu.onboard.do + spCh(spDq, { dq16: 16, dq8: 8 }) + localCh.do,
    ai: onboardAiUsed + spCh(spAiI, { ai8: 8, ai4i: 4 }) + spCh(spAiU, { ai8u: 8, ai4u: 4 }) + (rtd8Mods + tcMods) * CHANNELS.rtd8 + rtd4Mods * CHANNELS.rtd4 + localCh.ai,
    ao: cpu.onboard.ao + spCh(spAq, { aq4: 4, aq2: 2 }) + localCh.ao,
  };
  // ── PROFINET cabling: one cable per link. With switches every device goes
  // to a switch (+ the switch-to-switch links, closed into a ring for MRP);
  // without, the devices are daisy-chained through the 2-port interfaces.
  let profinet: PlcConfig['profinet'] = null;
  if (inp.pnCabling && devices > 1) {
    const links = sw.qty > 0 ? devices + Math.max(0, sw.qty - 1) + (redundant && sw.qty > 2 ? 1 : 0) : devices - 1;
    const field = Math.min(links, whole(inp.pnFieldLinks));
    const patch = links - field;
    const cableM = Math.ceil(field * Math.max(0, Number(inp.pnFieldM) || 0) * 1.1);
    profinet = { links, patch, field, cableM };
    add('pnPatch2m', patch, `${links} PROFINET link${links === 1 ? '' : 's'} — ${patch} inside the panel`);
    add('pnCable', cableM, `${field} link${field === 1 ? '' : 's'} leaving the panel × ${inp.pnFieldM} m (+10%)`);
    add('pnPlug', field * 2, 'Two field plugs per cable run');
  }

  const result: PlcConfig = {
    lines,
    cpuKey: cpu.key,
    expansion: useLocal ? 'local' : ioModules > 0 ? 'et200sp' : 'none',
    local: useLocal && is1200 ? local : null,
    central,
    scadaTags,
    channels: {
      di: { needed: need.di, provided: provided.di },
      do: { needed: need.do, provided: provided.do },
      ai: { needed: need.ai, provided: provided.ai },
      ao: { needed: need.ao, provided: provided.ao },
    },
    analog,
    stations,
    potentialGroups,
    suggestedStations,
    ioModules,
    network: { switchKey: netSwitch?.key ?? null, qty: netSwitch ? sw.qty : 0, devices, portsPerSwitch },
    wiring,
    panelIo,
    profinet,
    ups: null,
    notes,
  };

  // ── 24 V UPS: SITOP UPS1600 sized for the buffered load, UPS1100 battery
  // for the backup time (Ah = A × h ÷ 0.7 for ageing / temperature derating).
  if (inp.ups) {
    const load = estimate24V(raw, result);
    const loadA = inp.upsLoad === 'all' ? load.totalA : Math.round((panelHeat(load).electronicsW / 24) * 100) / 100;
    const minutes = Math.max(1, whole(inp.upsMinutes) || 10);
    const ah = Math.round(((loadA * minutes) / 60 / 0.7) * 100) / 100;
    const upsKey = loadA * 1.2 <= 10 ? 'ups10' : loadA * 1.2 <= 20 ? 'ups20' : 'ups40';
    const BATS: [string, number][] = [['bat1_2', 1.2], ['bat3_2', 3.2], ['bat7', 7], ['bat12', 12]];
    // The 1.2 Ah module only suits the 10 A unit (charge / discharge current).
    const usable = BATS.filter(([k]) => upsKey === 'ups10' || k !== 'bat1_2');
    const bat = usable.find(([, a]) => a >= ah);
    const [batKey, batAh] = bat ?? usable[usable.length - 1];
    const batQty = bat ? 1 : Math.ceil(ah / batAh);
    result.ups = { loadA, ah, minutes };
    add(upsKey, 1, `24 V DC UPS — ${loadA} A buffered (${inp.upsLoad === 'all' ? 'whole 24 V load' : 'controller electronics'}) × 1.2`);
    add(batKey, batQty, `${minutes} min backup at ${loadA} A → ${ah} Ah incl. 30% derating${batQty > 1 ? ` (${batQty} in parallel)` : ''}`);
    notes.push(`UPS: size the 24 V supply for the load plus battery charging (≈ ${upsKey === 'ups10' ? 1 : 2} A extra).`);
    if (loadA * 1.2 > 40) notes.push(`${loadA} A buffered is beyond one 40 A UPS1600 — split the buffered loads.`);
  }
  return result;
}

// ── 24 V DC load estimate (for choosing the supply) ──────────────────────
// Typical draws, rounded up — CPU, interface module and panels from Siemens
// datasheets; module electronics and field loads are planning figures. The
// DO load and the margin are inputs because they depend on what's wired.
/** Standard supply output ratings to suggest from. */
export const SITOP_RATINGS_A = [2.5, 5, 10, 20, 40];

export interface LoadLine { label: string; qty: number; eachA: number; totalA: number }
export interface LoadEstimate {
  lines: LoadLine[];
  totalA: number;
  withMarginA: number;
  /** Smallest standard rating that covers the load alone; past 40 A, 40 A (× suggestedQty). Null with no load. */
  suggestedA: number | null;
  /** How many of suggestedA it takes (1 up to 40 A). */
  suggestedQty: number;
}

/** Supplies of `ratingA` needed to carry `needA` (at least 1). */
export const psuQtyFor = (ratingA: number, needA: number) => Math.max(1, Math.ceil(needA / ratingA - 1e-9));

export function estimate24V(raw: PlcInputs, cfg: PlcConfig): LoadEstimate {
  const count = (k: string) => cfg.lines.find((l) => l.key === k)?.qty ?? 0;
  const lines: LoadLine[] = [];
  const add = (label: string, qty: number, eachA: number) => { if (qty > 0 && eachA > 0) lines.push({ label, qty, eachA, totalA: qty * eachA }); };
  const redundancy = raw.redundancy ?? 'none';
  const cpu = cpuModel(redundancy !== 'none' ? 'S7-1500' : raw.family, cfg.cpuKey ?? raw.cpu, redundancy);
  add(cpu.label, redundancy !== 'none' ? 2 : 1, cpu.drawA);
  const localMods = cfg.lines.filter((l) => /^(sm12|sb12|cm1241)/.test(l.key)).reduce((n, l) => n + l.qty, 0);
  add('S7-1200 signal modules / boards (sensor supply share)', localMods, 0.03);
  add('ET 200SP interface module (per station)', count('imBundle'), 0.2);
  add('ET 200SP IM 155-6 PN/2 HF (per station)', count('imHf'), 0.25);
  add('DI 16 module electronics', count('di16'), 0.05);
  add('DI 8 module electronics', count('di8'), 0.03);
  add('DQ 16 module electronics', count('dq16'), 0.05);
  add('DQ 8 module electronics', count('dq8'), 0.03);
  add('AI 8xI module electronics', count('ai8'), 0.03);
  add('AI 8xU module electronics', count('ai8u'), 0.03);
  add('AI 4 module electronics', count('ai4i') + count('ai4u'), 0.03);
  add('AI RTD/TC module electronics', count('rtd8') + count('rtd4'), 0.03);
  add('AQ 4 module electronics', count('aq4'), 0.05);
  add('AQ 2 module electronics', count('aq2'), 0.04);
  add('CM PtP module', count('cmPtp'), 0.05);
  // S7-1500 central I/O: the backplane power (fed by the CPU / system PS) comes from the 24 V supply.
  if (cfg.central && !cfg.central.fallback) add(`S7-1500 backplane — ${cfg.central.modules} central module${cfg.central.modules === 1 ? '' : 's'} (${cfg.central.powerW} W ÷ 24 V ÷ 85%)`, 1, Math.round((cfg.central.powerW / 24 / 0.85) * 100) / 100);
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
  const largest = SITOP_RATINGS_A[SITOP_RATINGS_A.length - 1];
  const single = SITOP_RATINGS_A.find((r) => r >= withMarginA);
  const suggestedA = withMarginA <= 0 ? null : single ?? largest;
  const suggestedQty = single || suggestedA === null ? 1 : psuQtyFor(largest, withMarginA);
  return { lines, totalA, withMarginA, suggestedA, suggestedQty };
}

/**
 * Heat for the Control Panel's fan sizing: the 24 V electronics inside the
 * panel (field loads — sensors, DO loads, analog loops — dissipate in the
 * field, so they're left out) and the total 24 V load for the supply losses.
 */
export function panelHeat(load: LoadEstimate): { electronicsW: number; load24A: number } {
  const inside = load.lines.filter((l) => !/^(Digital inputs|Digital outputs|Analog inputs|Analog outputs) /.test(l.label) && l.label !== 'Analog outputs');
  return {
    electronicsW: Math.round(inside.reduce((s, l) => s + l.totalA, 0) * 24 * 10) / 10,
    load24A: load.totalA,
  };
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
