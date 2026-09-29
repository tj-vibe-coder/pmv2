// Siemens PLC configurator — turns an I/O count (DI / DO / AI / AO), the PLC
// family + CPU model and the Modbus need into the module list: CPU, memory
// card, ET 200SP remote I/O (interface bundle + I/O modules + BaseUnits),
// Modbus hardware, HMI panel, SCADA license and a SITOP 24 V supply. Pure
// logic — see SiemensPlcDialog.tsx for the popup.
//
// Rules (Siemens system manuals):
//  • S7-1200 compact CPUs carry on-board I/O (1214C: 14 DI, 10 DQ, 2 AI
//    0–10 V); anything beyond goes to ET 200SP over PROFINET.
//  • S7-1500 standard CPUs have no on-board I/O (the 1511C/1512C compact ones
//    do) and REQUIRE a SIMATIC Memory Card; the rest of the I/O is ET 200SP.
//  • ET 200SP: IM 155-6 PN ST takes up to 32 modules per station; every
//    module sits on its own BaseUnit (type A0). The first BaseUnit of a station
//    must be a light one (BU…+2D, opens the potential group); the rest are
//    dark (BU…+2B, bridged to the left). The server module and BusAdapter
//    come in the IM bundle.
//  • Modbus TCP is built into both CPUs' PROFINET port (no hardware).
//    Modbus RTU (RS-485): S7-1200 → CB 1241 on the CPU (one port; more ports
//    via ET 200SP CM PtP); S7-1500 → one ET 200SP CM PtP per port.
//
// Prices: parts marked `quoted` carry the price and part number from the
// supplier quotes TJ supplied (2026). The rest are listed so the BOM is
// complete — price 0 ("for inquiry") and part numbers from Siemens' catalog
// that should be confirmed with the supplier. A catalog item with the same
// part number (Sales → Pricelists) overrides any price here.

export type PlcFamily = 'S7-1200' | 'S7-1500';
export type ModbusMode = 'none' | 'tcp' | 'rtu';
export type HmiLine = 'basic' | 'comfort' | 'unified';
export type ScadaKind = 'none' | 'wincc81' | 'unifiedPc';
export type WinccLicense = 'RC' | 'RT';

export interface SiemensPart {
  key: string;
  /** '' = not known yet — the supplier fills it in. */
  partNo: string;
  description: string;
  /** Default unit price (₱) from supplier quotes; 0 = not priced (for inquiry). */
  price: number;
  /** Part number and price come from a supplier quote (others: confirm the part number). */
  quoted?: boolean;
}

// ── CPUs ─────────────────────────────────────────────────────────────────
export interface CpuModel {
  key: string;
  family: PlcFamily;
  /** Short name for pickers, e.g. "1214C DC/DC/DC". */
  label: string;
  onboard: { di: number; do: number; ai: number; ao: number };
  /** On-board AI accept 4–20 mA (S7-1500 compact); the S7-1200's are 0–10 V only. */
  aiCurrent: boolean;
  /** Draw from the 24 V supply (A, planning figure); 0 = CPU fed from 120/230 V AC. */
  drawA: number;
  relayOutputs?: boolean;
  failSafe?: boolean;
}

const cpu1200 = (key: string, model: string, variant: 'DC/DC/DC' | 'AC/DC/RLY' | 'DC/DC/RLY', io: [number, number, number, number], drawA: number, failSafe = false): CpuModel => ({
  key, family: 'S7-1200', label: `${model} ${variant}${failSafe ? ' (fail-safe)' : ''}`,
  onboard: { di: io[0], do: io[1], ai: io[2], ao: io[3] }, aiCurrent: false,
  drawA: variant === 'AC/DC/RLY' ? 0 : drawA, relayOutputs: variant !== 'DC/DC/DC', failSafe,
});
const cpu1500 = (key: string, label: string, drawA: number, opts: Partial<Pick<CpuModel, 'onboard' | 'failSafe'>> = {}): CpuModel => ({
  key, family: 'S7-1500', label, onboard: opts.onboard ?? { di: 0, do: 0, ai: 0, ao: 0 },
  aiCurrent: true, drawA, failSafe: opts.failSafe ?? false,
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
  cpu1500('cpu1511', 'CPU 1511-1 PN', 0.6),
  cpu1500('cpu1513', 'CPU 1513-1 PN', 0.7),
  cpu1500('cpu1515', 'CPU 1515-2 PN', 0.8),
  cpu1500('cpu1516', 'CPU 1516-3 PN/DP', 0.9),
  cpu1500('cpu1511c', 'CPU 1511C-1 PN (compact)', 0.8, { onboard: { di: 16, do: 16, ai: 4, ao: 2 } }),
  cpu1500('cpu1512c', 'CPU 1512C-1 PN (compact)', 0.9, { onboard: { di: 32, do: 32, ai: 4, ao: 2 } }),
  cpu1500('cpu1511f', 'CPU 1511F-1 PN (fail-safe)', 0.6, { failSafe: true }),
  cpu1500('cpu1513f', 'CPU 1513F-1 PN (fail-safe)', 0.7, { failSafe: true }),
  cpu1500('cpu1515f', 'CPU 1515F-2 PN (fail-safe)', 0.8, { failSafe: true }),
  cpu1500('cpu1516f', 'CPU 1516F-3 PN/DP (fail-safe)', 0.9, { failSafe: true }),
];
export const DEFAULT_CPU: Record<PlcFamily, string> = { 'S7-1200': 'cpu1214', 'S7-1500': 'cpu1513' };

export function cpuModel(family: PlcFamily, key: string): CpuModel {
  return CPU_MODELS.find((m) => m.key === key && m.family === family)
    ?? CPU_MODELS.find((m) => m.key === DEFAULT_CPU[family])!;
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
  { key: 'tp1500', line: 'comfort', model: 'TP1500 Comfort', sizeIn: 15, partNo: '6AV2124-0QC02-0AX0', drawA: 1.1 },
  { key: 'tp1900', line: 'comfort', model: 'TP1900 Comfort', sizeIn: 19, partNo: '6AV2124-0UC02-0AX0', drawA: 1.4 },
  { key: 'tp2200', line: 'comfort', model: 'TP2200 Comfort', sizeIn: 22, partNo: '6AV2124-0XC02-0AX0', drawA: 1.6 },
  { key: 'mtp700', line: 'unified', model: 'MTP700 Unified Comfort', sizeIn: 7, partNo: '6AV2128-3GB06-0AX1', drawA: 0.5 },
  { key: 'mtp1000', line: 'unified', model: 'MTP1000 Unified Comfort', sizeIn: 10, partNo: '6AV2128-3KB06-0AX1', drawA: 0.7 },
  { key: 'mtp1200', line: 'unified', model: 'MTP1200 Unified Comfort', sizeIn: 12, partNo: '6AV2128-3MB06-0AX1', drawA: 0.8 },
  { key: 'mtp1500', line: 'unified', model: 'MTP1500 Unified Comfort', sizeIn: 15, partNo: '6AV2128-3QB06-0AX1', drawA: 1.1 },
  { key: 'mtp1900', line: 'unified', model: 'MTP1900 Unified Comfort', sizeIn: 19, partNo: '6AV2128-3UB06-0AX1', drawA: 1.4 },
  { key: 'mtp2200', line: 'unified', model: 'MTP2200 Unified Comfort', sizeIn: 22, partNo: '6AV2128-3XB06-0AX1', drawA: 1.6 },
];

// ── SCADA licenses (part numbers left for the supplier) ──────────────────
export const WINCC81_PACKAGES = ['128', '512', '2048', '8192', '64k', '100k', '150k', '256k'];
export const UNIFIED_PC_PACKAGES = ['150', '500', '1k', '2.5k', '5k', '10k', '30k', '50k', '100k'];
export const scadaKey = (kind: Exclude<ScadaKind, 'none'>, license: WinccLicense, pkg: string) =>
  kind === 'wincc81' ? `wincc81_${license}_${pkg}` : `unifiedPc_${pkg}`;

// ── SITOP 24 V DC supplies ───────────────────────────────────────────────
export interface SitopOption { key: string; line: 'PSU100S' | 'PSU8200'; ratingA: number; partNo: string; input: string }
export const SITOP_OPTIONS: SitopOption[] = [
  { key: 'psu100s2', line: 'PSU100S', ratingA: 2.5, partNo: '6EP1332-2BA20', input: '120/230 V AC' },
  { key: 'psu100s5', line: 'PSU100S', ratingA: 5, partNo: '6EP1333-2BA20', input: '120/230 V AC' },
  { key: 'psu100s10', line: 'PSU100S', ratingA: 10, partNo: '6EP1334-2BA20', input: '120/230 V AC' },
  { key: 'psu100s20', line: 'PSU100S', ratingA: 20, partNo: '6EP1336-2BA10', input: '120/230 V AC' },
  { key: 'psu8200_5', line: 'PSU8200', ratingA: 5, partNo: '6EP1333-3BA10', input: '120-230 V AC / 110-220 V DC' },
  { key: 'psu8200_10', line: 'PSU8200', ratingA: 10, partNo: '6EP1334-3BA10', input: '120-230 V AC / 110-220 V DC' },
  { key: 'psu8200_20', line: 'PSU8200', ratingA: 20, partNo: '6EP1336-3BA10', input: '120-230 V AC / 110-220 V DC' },
  { key: 'psu8200_40', line: 'PSU8200', ratingA: 40, partNo: '6EP1337-3BA00', input: '120/230 V AC' },
  { key: 'psu8200_3ph20', line: 'PSU8200', ratingA: 20, partNo: '6EP1436-3BA10', input: '3-phase 400-500 V AC' },
  { key: 'psu8200_3ph40', line: 'PSU8200', ratingA: 40, partNo: '6EP1437-3BA10', input: '3-phase 400-500 V AC' },
];

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

// Siemens catalog part numbers for the unquoted CPUs (confirm with the supplier).
const CPU_PART_NO: Record<string, string> = {
  cpu1211: '6ES7211-1AE40-0XB0', cpu1211ac: '6ES7211-1BE40-0XB0', cpu1211rly: '6ES7211-1HE40-0XB0',
  cpu1212: '6ES7212-1AE40-0XB0', cpu1212ac: '6ES7212-1BE40-0XB0', cpu1212rly: '6ES7212-1HE40-0XB0',
  cpu1214ac: '6ES7214-1BG40-0XB0', cpu1214rly: '6ES7214-1HG40-0XB0',
  cpu1215: '6ES7215-1AG40-0XB0', cpu1215ac: '6ES7215-1BG40-0XB0', cpu1215rly: '6ES7215-1HG40-0XB0',
  cpu1217: '6ES7217-1AG40-0XB0',
  cpu1212f: '6ES7212-1AF40-0XB0', cpu1214f: '6ES7214-1AF40-0XB0', cpu1215f: '6ES7215-1AF40-0XB0',
  cpu1511: '6ES7511-1AK02-0AB0', cpu1515: '6ES7515-2AM02-0AB0', cpu1516: '6ES7516-3AN02-0AB0',
  cpu1511c: '6ES7511-1CK01-0AB0', cpu1512c: '6ES7512-1CK01-0AB0',
  cpu1511f: '6ES7511-1FK02-0AB0', cpu1513f: '6ES7513-1FL02-0AB0', cpu1515f: '6ES7515-2FM02-0AB0', cpu1516f: '6ES7516-3FN02-0AB0',
};
const MEM_PART_NO: Record<string, string> = { memCard4: '6ES7954-8LC03-0AA0', memCard12: '6ES7954-8LE03-0AA0', memCard24: '6ES7954-8LF03-0AA0' };

function cpuDescription(m: CpuModel): string {
  const io = m.onboard;
  const ioText = io.di + io.do + io.ai + io.ao > 0
    ? `onboard I/O: ${io.di} DI 24 V DC; ${io.do} DO ${m.relayOutputs ? 'relay 2 A' : '24 V DC'}; ${io.ai} AI${m.family === 'S7-1200' ? ' 0-10 V DC' : ''}${io.ao ? `; ${io.ao} AO` : ''}`
    : 'PROFINET, SIMATIC Memory Card required';
  return `SIMATIC ${m.family}, ${m.label}${m.family === 'S7-1200' ? ', compact CPU' : ''}, ${ioText}`;
}

const LICENSE_TEXT: Record<WinccLicense, string> = { RC: 'RC (Runtime & Configuration)', RT: 'RT (Runtime)' };

export const SIEMENS_PARTS: Record<string, SiemensPart> = (() => {
  const all: Record<string, SiemensPart> = {};
  const put = (p: SiemensPart) => { all[p.key] = p; };
  QUOTED.forEach((p) => put({ ...p, quoted: true }));
  CPU_MODELS.filter((m) => !all[m.key]).forEach((m) => put({ key: m.key, partNo: CPU_PART_NO[m.key] ?? '', price: 0, description: cpuDescription(m) }));
  MEMORY_CARDS.filter((c) => !all[c.key]).forEach((c) => put({
    key: c.key, partNo: MEM_PART_NO[c.key] ?? '', price: 0, description: `SIMATIC S7, memory card for S7-1x00 CPU, 3.3 V Flash, ${c.label}`,
  }));
  HMI_PANELS.forEach((h) => put({
    key: h.key, partNo: h.partNo, price: 0,
    description: `SIMATIC HMI ${h.model}, ${HMI_LINES.find((l) => l.value === h.line)!.label.replace(/ \(.*/, '')}, ${h.sizeIn}" widescreen TFT touch display, PROFINET interface`,
  }));
  (['RC', 'RT'] as WinccLicense[]).forEach((lic) => WINCC81_PACKAGES.forEach((pkg) => put({
    key: scadaKey('wincc81', lic, pkg), partNo: '', price: 0,
    description: `SIMATIC WinCC V8.1 ${LICENSE_TEXT[lic]}, ${pkg} PowerTags — software license`,
  })));
  UNIFIED_PC_PACKAGES.forEach((pkg) => put({
    key: scadaKey('unifiedPc', 'RT', pkg), partNo: '', price: 0,
    description: `SIMATIC WinCC Unified PC Runtime, ${pkg} PowerTags — software license`,
  }));
  SITOP_OPTIONS.filter((s) => !all[s.key]).forEach((s) => put({
    key: s.key, partNo: s.partNo, price: 0,
    description: `SITOP ${s.line} ${s.ratingA} A stabilized power supply input: ${s.input} output: 24 V DC/${s.ratingA} A`,
  }));
  return all;
})();

// ── Inputs ───────────────────────────────────────────────────────────────
export interface PlcInputs {
  family: PlcFamily;
  /** CPU model key (CPU_MODELS); falls back to the family default. */
  cpu: string;
  di: number;
  do: number;
  ai: number;
  ao: number;
  /** Extra channels for future use, applied to each I/O type in use (%). */
  sparePct: number;
  modbus: ModbusMode;
  /** RS-485 ports needed (Modbus RTU only). */
  modbusPorts: number;
  /** SITOP_OPTIONS key, or 'none'. */
  sitop: string;
  /** S7-1200: count the CPU's two 0–10 V inputs toward AI (off = all AI are 4–20 mA on modules). */
  useOnboardAi: boolean;
  /** S7-1200: include a memory card (always included for S7-1500, where it's required). */
  memoryCard: boolean;
  /** MEMORY_CARDS key. */
  memCard: string;
  /** HMI_PANELS key, or 'none'. */
  hmi: string;
  hmiQty: number;
  scada: ScadaKind;
  winccLicense: WinccLicense;
  /** Tag package (WINCC81_PACKAGES / UNIFIED_PC_PACKAGES). */
  scadaPackage: string;
  scadaQty: number;
  /** 24 V load per digital output, for PSU sizing (A) — interposing relay / pilot light ≈ 0.1 A. */
  doLoadA: number;
  /** Safety margin added to the estimated 24 V load when suggesting a PSU (%). */
  psuMarginPct: number;
}

export const DEFAULT_PLC_INPUTS: PlcInputs = {
  family: 'S7-1200', cpu: 'cpu1214', di: 0, do: 0, ai: 0, ao: 0, sparePct: 10,
  modbus: 'none', modbusPorts: 1, sitop: 'none', useOnboardAi: false, memoryCard: false, memCard: 'memCard',
  hmi: 'none', hmiQty: 1, scada: 'none', winccLicense: 'RC', scadaPackage: '2048', scadaQty: 1,
  doLoadA: 0.1, psuMarginPct: 25,
};

export const CHANNELS = { di16: 16, dq16: 16, ai8: 8, aq4: 4 } as const;
export const IM_MAX_MODULES = 32;

export interface PlcLine { key: string; qty: number; why: string }

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

export function onboardText(m: CpuModel): string {
  const io = m.onboard;
  if (io.di + io.do + io.ai + io.ao === 0) return 'no on-board I/O';
  return [`${io.di} DI`, `${io.do} DQ${m.relayOutputs ? ' (relay)' : ''}`, `${io.ai} AI${m.aiCurrent ? '' : ' (0–10 V)'}`, io.ao ? `${io.ao} AQ` : '']
    .filter(Boolean).join(' / ');
}

export function configurePlc(raw: PlcInputs): PlcConfig {
  const inp = {
    ...raw, di: whole(raw.di), do: whole(raw.do), ai: whole(raw.ai), ao: whole(raw.ao),
    modbusPorts: Math.max(1, whole(raw.modbusPorts)), hmiQty: Math.max(1, whole(raw.hmiQty)), scadaQty: Math.max(1, whole(raw.scadaQty)),
  };
  const is1200 = inp.family === 'S7-1200';
  const cpu = cpuModel(inp.family, inp.cpu);
  const need = { di: withSpare(inp.di, inp.sparePct), do: withSpare(inp.do, inp.sparePct), ai: withSpare(inp.ai, inp.sparePct), ao: withSpare(inp.ao, inp.sparePct) };
  const onboard = { ...cpu.onboard, ai: cpu.aiCurrent || inp.useOnboardAi ? cpu.onboard.ai : 0 };

  const diMods = Math.ceil(Math.max(0, need.di - onboard.di) / CHANNELS.di16);
  const dqMods = Math.ceil(Math.max(0, need.do - onboard.do) / CHANNELS.dq16);
  const aiMods = Math.ceil(Math.max(0, need.ai - onboard.ai) / CHANNELS.ai8);
  const aqMods = Math.ceil(Math.max(0, need.ao - onboard.ao) / CHANNELS.aq4);

  const rtuPorts = inp.modbus === 'rtu' ? inp.modbusPorts : 0;
  const useCb = is1200 && rtuPorts >= 1;
  const cmMods = is1200 ? Math.max(0, rtuPorts - 1) : rtuPorts;

  const ioModules = diMods + dqMods + aiMods + aqMods + cmMods;
  const stations = ioModules > 0 ? Math.ceil(ioModules / IM_MAX_MODULES) : 0;

  const lines: PlcLine[] = [];
  const add = (key: string, qty: number, why: string) => { if (qty > 0 && SIEMENS_PARTS[key]) lines.push({ key, qty, why }); };
  const hasOnboard = cpu.onboard.di + cpu.onboard.do + cpu.onboard.ai + cpu.onboard.ao > 0;
  add(cpu.key, 1, hasOnboard ? `CPU — ${onboardText(cpu)} on board` : 'CPU — all I/O on ET 200SP');
  const card = MEMORY_CARDS.some((c) => c.key === inp.memCard) ? inp.memCard : 'memCard';
  if (!is1200) add(card, 1, 'Required by every S7-1500 CPU');
  else if (inp.memoryCard) add(card, 1, 'Optional on S7-1200 (program backup / transfer)');
  add('cb1241', useCb ? 1 : 0, 'Modbus RTU port on the CPU (1 × RS-485)');
  add('imBundle', stations, `ET 200SP station${stations === 1 ? '' : 's'} — max ${IM_MAX_MODULES} modules each (incl. server module + BusAdapter)`);
  add('di16', diMods, `${CHANNELS.di16} DI each`);
  add('dq16', dqMods, `${CHANNELS.dq16} DQ each`);
  add('ai8', aiMods, `${CHANNELS.ai8} AI (4–20 mA) each`);
  add('aq4', aqMods, `${CHANNELS.aq4} AQ each`);
  add('cmPtp', cmMods, is1200 ? 'Extra Modbus RTU ports (CB 1241 gives only one)' : '1 per Modbus RTU (RS-485) port');
  add('buLight', stations, 'First BaseUnit of each station (starts the potential group)');
  add('buDark', ioModules - stations, 'One BaseUnit per remaining module');
  const panel = HMI_PANELS.find((h) => h.key === inp.hmi);
  if (panel) add(panel.key, inp.hmiQty, `Operator panel — ${panel.sizeIn}"`);
  if (inp.scada !== 'none') {
    const pkgs = inp.scada === 'wincc81' ? WINCC81_PACKAGES : UNIFIED_PC_PACKAGES;
    const pkg = pkgs.includes(inp.scadaPackage) ? inp.scadaPackage : pkgs[0];
    add(scadaKey(inp.scada, inp.winccLicense, pkg), inp.scadaQty, 'SCADA license — one per PC station');
  }
  const psu = SITOP_OPTIONS.find((s) => s.key === inp.sitop);
  if (psu) add(psu.key, 1, `24 V DC supply — ${psu.ratingA} A`);

  const notes: string[] = [];
  if (inp.modbus === 'tcp') notes.push('Modbus TCP runs on the CPU\'s PROFINET port — no extra hardware.');
  if (is1200 && inp.ai > 0 && !inp.useOnboardAi) notes.push('The CPU\'s 2 on-board AI are 0–10 V only, so 4–20 mA inputs go on AI 8xI modules.');
  if (cpu.relayOutputs && inp.do > 0) notes.push('This CPU\'s on-board outputs are relays (2 A) — fine for contactors, not for fast pulse outputs.');
  if (cpu.drawA === 0) notes.push('AC/DC/RLY CPU is powered from 120/230 V AC — it is not counted in the 24 V load.');
  if (cpu.failSafe) notes.push('Fail-safe CPU — safety I/O (F-DI / F-DQ) is not auto-selected; add those modules yourself.');
  if (stations > 1) notes.push(`${ioModules} modules need ${stations} ET 200SP stations (32 modules per IM 155-6 PN ST).`);

  const provided = {
    di: onboard.di + diMods * CHANNELS.di16,
    do: onboard.do + dqMods * CHANNELS.dq16,
    ai: onboard.ai + aiMods * CHANNELS.ai8,
    ao: onboard.ao + aqMods * CHANNELS.aq4,
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
// Typical draws, rounded up — CPU, interface module and panels from Siemens
// datasheets; module electronics and field loads are planning figures. The
// DO load and the margin are inputs because they depend on what's wired.
/** Standard SITOP output ratings to suggest from. */
export const SITOP_RATINGS_A = [2.5, 5, 10, 20, 40];

export interface LoadLine { label: string; qty: number; eachA: number; totalA: number }
export interface LoadEstimate { lines: LoadLine[]; totalA: number; withMarginA: number; suggestedA: number | null }

export function estimate24V(raw: PlcInputs, cfg: PlcConfig): LoadEstimate {
  const count = (k: string) => cfg.lines.find((l) => l.key === k)?.qty ?? 0;
  const lines: LoadLine[] = [];
  const add = (label: string, qty: number, eachA: number) => { if (qty > 0 && eachA > 0) lines.push({ label, qty, eachA, totalA: qty * eachA }); };
  const cpu = cpuModel(raw.family, raw.cpu);
  add(cpu.label, 1, cpu.drawA);
  add('ET 200SP interface module (per station)', count('imBundle'), 0.2);
  add('DI 16 module electronics', count('di16'), 0.05);
  add('DQ 16 module electronics', count('dq16'), 0.05);
  add('AI 8 module electronics', count('ai8'), 0.03);
  add('AQ 4 module electronics', count('aq4'), 0.05);
  add('CM PtP module', count('cmPtp'), 0.05);
  const panel = HMI_PANELS.find((h) => h.key === raw.hmi);
  if (panel) add(`HMI ${panel.model}`, count(panel.key), panel.drawA);
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
  const code = part.partNo.trim().toUpperCase();
  const hit = code ? catalog
    .filter((c) => (c.catalogNo || '').trim().toUpperCase() === code && (c.sellingPrice || 0) > 0)
    .sort((a, b) => String(b.pricelistDate || '').localeCompare(String(a.pricelistDate || '')))[0] : undefined;
  if (hit) return { price: hit.sellingPrice, source: 'catalog' };
  return part.price > 0 ? { price: part.price, source: 'quote' } : { price: 0, source: 'none' };
}
