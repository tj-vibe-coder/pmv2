// Siemens Desigo BMS configurator — turns an I/O count (DI / DO and analog I/O
// by signal type) plus the Desigo CC (management station) needs into the
// bill of materials: PXC automation station(s), TX-I/O modules, TX-I/O power
// supply modules, the 24 V AC control transformer, network switches, the
// Desigo CC licenses and — optionally — the WAGO terminals, relays and
// 0.5 mm² wiring (terminalWiring.ts). Pure logic — see DesigoBmsDialog.tsx.
//
// Rules (Siemens Desigo PXC4/PXC5/PXC7 and TX-I/O data sheets):
//  • PXC4.E16: 12 universal I/O + 4 relay outputs on board, up to 2 TX-I/O
//    modules. PXC5.E24: 8 universal + 8 super-universal + 2 DI + 6 relay
//    outputs on board, up to 4 TX-I/O modules powered directly.
//    PXC7.E400S / M / L: no on-board I/O, up to 100 / 200 / 400 TX-I/O points;
//    the PXC7 powers the first modules (≈ 300 mA) itself.
//  • TX-I/O: TXM1.16D 16 DI; TXM1.6R 6 relay DO; TXM1.8U 8 universal
//    (0–10 V in/out, Pt/Ni RTD, DI); TXM1.8X 8 super-universal (adds 4–20 mA
//    in/out). Thermocouples are not measured directly — use a transmitter
//    (counted as a 4–20 mA input).
//  • Protocols: BACnet/IP and Modbus TCP are built in (Modbus: up to 500
//    points per station). Each serial trunk — BACnet MS/TP, Modbus RTU or
//    M-Bus — takes one RS-485 port: PXC4 / PXC5 1, PXC7.E400S / M / L 1 / 2 / 4.
//    M-Bus is PXC5 / PXC7 only (plus an M-Bus level converter per trunk);
//    KNX TP1 is on board the PXC4 only. P1 (APOGEE FLN) is only on the
//    PXC7.A modular station, so it goes in as a gateway for the supplier.
//  • TXS1.12F10: TX-I/O power supply, AC 24 V in → DC 24 V 1.2 A out for the
//    modules and field devices; one per ~10 modules beyond what the station
//    powers itself.
//
// Part numbers: automation stations as in the Siemens HIT catalog (S55375-…);
// TX-I/O as BPZ:… order codes. Desigo CC licenses are ordered by feature —
// no public order numbers, so they go in for the supplier to fill. Everything
// is ₱0 (for inquiry) until priced in Sales → Pricelists.

import {
  ANALOG_KINDS, SIEMENS_PARTS, SWITCHES, SITOP_OPTIONS, noAnalog,
  type AnalogCount, type AnalogKey, type PlcLine, type PlcSection, type SiemensPart, type SwitchType,
} from './siemensPlc';
import { TERMINAL_PARTS, terminalStrip, type PanelIo, type WiringSummary } from './terminalWiring';

export type DesigoControllerKey = 'auto' | 'pxc4' | 'pxc5' | 'pxc7s' | 'pxc7m' | 'pxc7l';

export interface PxcModel {
  key: Exclude<DesigoControllerKey, 'auto'>;
  model: string;
  partNo: string;
  /** On-board points: universal (DI / AI 0–10 V / RTD / AO 0–10 V), super-universal (adds 4–20 mA), DI, relay DO. */
  onboard: { uio: number; suio: number; di: number; relay: number };
  /** TX-I/O modules the station can take (PXC4/PXC5) — null = limited by points (PXC7). */
  maxModules: number | null;
  /** TX-I/O points the station can take (PXC7). */
  maxTxPoints: number | null;
  /** TX-I/O modules the station powers itself before a TXS1.12F10 is needed. */
  selfPoweredModules: number;
  /** RS-485 ports for BACnet MS/TP / Modbus RTU / M-Bus trunks. */
  rs485: number;
  mbus: boolean;
  knx: boolean;
  description: string;
  generic: string;
}

export const PXC_MODELS: PxcModel[] = [
  { key: 'pxc4', model: 'PXC4.E16-2', partNo: 'S55375-C150', onboard: { uio: 12, suio: 0, di: 0, relay: 4 }, maxModules: 2, maxTxPoints: null, selfPoweredModules: 2, rs485: 1, mbus: false, knx: true,
    description: 'Desigo PXC4.E16-2 automation station, 16 I/O (12 universal, 4 relay), BACnet/IP, Modbus, extendable with up to 2 TX-I/O modules',
    generic: 'Building automation controller, BACnet/IP, 16 on-board I/O (12 universal, 4 relay), expandable' },
  { key: 'pxc5', model: 'PXC5.E24', partNo: 'S55375-C104', onboard: { uio: 8, suio: 8, di: 2, relay: 6 }, maxModules: 4, maxTxPoints: null, selfPoweredModules: 4, rs485: 1, mbus: true, knx: false,
    description: 'Desigo PXC5.E24 automation station, 24 I/O (8 universal, 8 super-universal, 2 DI, 6 relay), BACnet/IP, BACnet/SC, Modbus, TX-I/O extension',
    generic: 'Building automation controller, BACnet/IP, 24 on-board I/O (8 universal, 8 super-universal, 2 DI, 6 relay), expandable' },
  { key: 'pxc7s', model: 'PXC7.E400S', partNo: 'S55375-C111', onboard: { uio: 0, suio: 0, di: 0, relay: 0 }, maxModules: null, maxTxPoints: 100, selfPoweredModules: 3, rs485: 1, mbus: true, knx: false,
    description: 'Desigo PXC7.E400S automation station, BACnet/IP, BACnet/SC, up to 100 TX-I/O points / data points, 1 × RS-485 (Modbus RTU / MS/TP)',
    generic: 'Building automation controller, BACnet/IP, modular I/O up to 100 points' },
  { key: 'pxc7m', model: 'PXC7.E400M', partNo: 'S55375-C110', onboard: { uio: 0, suio: 0, di: 0, relay: 0 }, maxModules: null, maxTxPoints: 200, selfPoweredModules: 3, rs485: 2, mbus: true, knx: false,
    description: 'Desigo PXC7.E400M automation station, BACnet/IP, BACnet/SC, up to 200 TX-I/O points (250 data points), 2 × RS-485 (Modbus RTU / MS/TP)',
    generic: 'Building automation controller, BACnet/IP, modular I/O up to 200 points' },
  { key: 'pxc7l', model: 'PXC7.E400L', partNo: 'S55375-C105', onboard: { uio: 0, suio: 0, di: 0, relay: 0 }, maxModules: null, maxTxPoints: 400, selfPoweredModules: 3, rs485: 4, mbus: true, knx: false,
    description: 'Desigo PXC7.E400L automation station, BACnet/IP, BACnet/SC, up to 400 TX-I/O points (600 data points), 4 × RS-485 (Modbus RTU / MS/TP)',
    generic: 'Building automation controller, BACnet/IP, modular I/O up to 400 points' },
];

export const TX_MODULES = {
  txDi16: { channels: 16, partNo: 'BPZ:TXM1.16D', description: 'Desigo TX-I/O module TXM1.16D, 16 digital inputs', generic: 'I/O module, 16 digital inputs' },
  txDo6: { channels: 6, partNo: 'BPZ:TXM1.6R', description: 'Desigo TX-I/O module TXM1.6R, 6 relay outputs (changeover / NO)', generic: 'I/O module, 6 relay outputs' },
  txU8: { channels: 8, partNo: 'BPZ:TXM1.8U', description: 'Desigo TX-I/O module TXM1.8U, 8 universal I/O (0–10 V in/out, Pt/Ni RTD, DI)', generic: 'I/O module, 8 universal I/O (0–10 V in/out, RTD, DI)' },
  txX8: { channels: 8, partNo: 'BPZ:TXM1.8X', description: 'Desigo TX-I/O module TXM1.8X, 8 super-universal I/O (adds 4–20 mA in/out)', generic: 'I/O module, 8 universal I/O incl. 4–20 mA in/out' },
} as const;
type TxKey = keyof typeof TX_MODULES;

const DCC = { brand: 'Siemens', partNo: '', price: 0, uom: 'lic' };
const DESIGO_PARTS_LIST: SiemensPart[] = [
  ...PXC_MODELS.map((m) => ({ key: m.key, partNo: m.partNo, price: 0, brand: 'Siemens', description: m.description, generic: m.generic })),
  ...(Object.keys(TX_MODULES) as TxKey[]).map((k) => ({ key: k, partNo: TX_MODULES[k].partNo, price: 0, brand: 'Siemens', description: TX_MODULES[k].description, generic: TX_MODULES[k].generic })),
  { key: 'txs12f10', partNo: 'BPZ:TXS1.12F10', price: 0, brand: 'Siemens',
    description: 'Desigo TX-I/O power supply module TXS1.12F10, AC 24 V in, DC 24 V 1.2 A out, 10 A fuse',
    generic: 'I/O power supply module, 24 V AC in / 24 V DC 1.2 A out' },
  { key: 'xfmr100', partNo: '', price: 0, brand: '', description: 'Control transformer 230 / 24 V AC, 100 VA', generic: 'Control transformer 230 / 24 V AC, 100 VA' },
  { key: 'xfmr250', partNo: '', price: 0, brand: '', description: 'Control transformer 230 / 24 V AC, 250 VA', generic: 'Control transformer 230 / 24 V AC, 250 VA' },
  { key: 'xfmr500', partNo: '', price: 0, brand: '', description: 'Control transformer 230 / 24 V AC, 500 VA', generic: 'Control transformer 230 / 24 V AC, 500 VA' },
  { key: 'mbusConverter', partNo: '', price: 0, brand: '', description: 'M-Bus level converter / master (RS-485 ↔ M-Bus) for one M-Bus trunk', generic: 'M-Bus level converter (RS-485 to M-Bus)' },
  { key: 'p1Gateway', partNo: '', price: 0, brand: '', description: 'P1 (APOGEE FLN) integration — gateway or PXC7.A modular station with a P1 port, per FLN trunk (max. 32 P1 devices)', generic: 'P1 field-bus integration gateway (per trunk)' },
  { key: 'knxInterface', partNo: '', price: 0, brand: '', description: 'KNX IP interface / router for KNX TP1 integration', generic: 'KNX IP interface' },
  { key: 'rs485Termination', partNo: '', price: 0, brand: '', description: 'RS-485 bus termination / bias resistor set (120 Ω), 2 per trunk', generic: 'RS-485 bus termination resistor (120 Ω)' },
  { ...DCC, key: 'dccServer', description: 'Desigo CC management station — server base license', generic: 'BMS software — server license' },
  { ...DCC, key: 'dccPoints', description: 'Desigo CC field data points license', generic: 'BMS software — data point license' },
  { ...DCC, key: 'dccClient', description: 'Desigo CC installed client license', generic: 'BMS software — client license' },
  { ...DCC, key: 'dccWebClient', description: 'Desigo CC web / Windows app client license', generic: 'BMS software — web client license' },
  { ...DCC, key: 'dccRedundancy', description: 'Desigo CC server redundancy (failover) license', generic: 'BMS software — server redundancy license' },
  { ...DCC, key: 'dccHistory', description: 'Desigo CC long-term history / trend storage (SQL Server) option', generic: 'BMS software — long-term data logging option' },
  { ...DCC, key: 'dccReports', description: 'Desigo CC reports option', generic: 'BMS software — reports option' },
];

/** Every part the Desigo configurator can add: its own + the shared switches, supplies and terminal strip. */
export const DESIGO_PARTS: Record<string, SiemensPart> = (() => {
  const all: Record<string, SiemensPart> = {};
  DESIGO_PARTS_LIST.forEach((p) => { all[p.key] = p; });
  [...SWITCHES.map((s) => s.key), ...SITOP_OPTIONS.map((s) => s.key)].forEach((k) => { all[k] = SIEMENS_PARTS[k]; });
  TERMINAL_PARTS.forEach((p) => { all[p.key] = SIEMENS_PARTS[p.key] ?? p; });
  return all;
})();

// ── Inputs ───────────────────────────────────────────────────────────────
/** Field-bus integration: serial trunks (one RS-485 port each) and IP protocols. */
export interface DesigoProtocols {
  mstp: number;
  modbusRtu: number;
  mbus: number;
  p1: number;
  modbusTcp: boolean;
  knx: boolean;
}
export const noProtocols = (): DesigoProtocols => ({ mstp: 0, modbusRtu: 0, mbus: 0, p1: 0, modbusTcp: false, knx: false });

export interface DesigoInputs {
  controller: DesigoControllerKey;
  protocols: DesigoProtocols;
  /** Automation stations wanted; 0 = auto (the fewest that fit). */
  controllers: number;
  di: number;
  do: number;
  analog: Record<AnalogKey, AnalogCount>;
  sparePct: number;
  /** Desigo CC management station. */
  dcc: boolean;
  /** Integration points on top of the I/O (Modbus / BACnet from chillers, meters…). */
  integrationPoints: number;
  dccClients: number;
  dccWebClients: number;
  dccRedundant: boolean;
  dccHistory: boolean;
  dccReports: boolean;
  switchQty: number;
  switchType: SwitchType;
  /** 24 V DC supply for the field devices / panel (SITOP_OPTIONS key), or 'none'. */
  psu: string;
  terminals: boolean;
  panelW: number;
  panelH: number;
}

export const DEFAULT_DESIGO_INPUTS: DesigoInputs = {
  controller: 'auto', protocols: noProtocols(), controllers: 0, di: 0, do: 0, analog: noAnalog(), sparePct: 10,
  dcc: true, integrationPoints: 0, dccClients: 1, dccWebClients: 0, dccRedundant: false, dccHistory: false, dccReports: false,
  switchQty: 0, switchType: 'unmanaged', psu: 'none', terminals: true, panelW: 800, panelH: 1200,
};

export const BMS_HEADER = 'BMS — SIEMENS DESIGO PXC';
export const BMS_SOFTWARE_HEADER = 'BMS SOFTWARE — DESIGO CC';
/** 'bmsSoftware' lines go under their own header; the rest as in the PLC configurator. */
export type DesigoSection = PlcSection | 'bmsSoftware';
export interface DesigoLine extends Omit<PlcLine, 'section'> { section: DesigoSection }

export interface DesigoConfig {
  lines: DesigoLine[];
  controller: PxcModel | null;
  controllers: number;
  suggestedControllers: number;
  /** I/O points incl. spare, and how many sit on TX-I/O modules. */
  points: number;
  txPoints: number;
  modules: number;
  dataPoints: number;
  wiring: WiringSummary | null;
  /** I/O for the Control Panel configurator's terminal strip. */
  panelIo: PanelIo;
  notes: string[];
}

const whole = (n: number) => Math.max(0, Math.round(Number(n) || 0));
// Integer maths first: n × 1.1 in floating point is 110.00000000000001 for n = 100, which would round up to 111.
const withSpare = (n: number, pct: number) => (n > 0 ? Math.ceil((n * (100 + Math.max(0, pct))) / 100 - 1e-9) : 0);

interface Need { di: number; do: number; uio: number; suio: number; trunks: number; mbus: boolean; knx: boolean }

/** TX-I/O modules for the points left after the on-board I/O of `qty` stations. */
function txModulesFor(need: Need, m: PxcModel | null, qty: number): Record<TxKey, number> & { points: number } {
  const ob = m ? m.onboard : { uio: 0, suio: 0, di: 0, relay: 0 };
  // Super-universal points can take anything universal; plain universal and DI can take DI.
  let suio = need.suio;
  let uio = need.uio;
  let di = need.di;
  let freeSu = ob.suio * qty;
  const take = (n: number, free: number) => Math.min(n, free);
  let t = take(suio, freeSu); suio -= t; freeSu -= t;
  let freeU = ob.uio * qty;
  t = take(uio, freeU); uio -= t; freeU -= t;
  t = take(uio, freeSu); uio -= t; freeSu -= t;
  let freeDi = ob.di * qty;
  t = take(di, freeDi); di -= t; freeDi -= t;
  t = take(di, freeU); di -= t; freeU -= t;
  t = take(di, freeSu); di -= t; freeSu -= t;
  const dq = Math.max(0, need.do - ob.relay * qty);
  const mods = {
    txDi16: Math.ceil(di / TX_MODULES.txDi16.channels),
    txDo6: Math.ceil(dq / TX_MODULES.txDo6.channels),
    txU8: Math.ceil(uio / TX_MODULES.txU8.channels),
    txX8: Math.ceil(suio / TX_MODULES.txX8.channels),
  };
  return { ...mods, points: di + dq + uio + suio };
}

const moduleCount = (m: Record<TxKey, number>) => m.txDi16 + m.txDo6 + m.txU8 + m.txX8;

/** Whether `qty` stations of model `m` can hold the I/O (on board + TX-I/O). */
function fits(need: Need, m: PxcModel, qty: number): boolean {
  if (need.trunks > m.rs485 * qty) return false;
  if (need.mbus && !m.mbus) return false;
  const tx = txModulesFor(need, m, qty);
  if (m.maxModules !== null) return moduleCount(tx) <= m.maxModules * qty;
  return tx.points <= (m.maxTxPoints ?? 0) * qty;
}

export function configureDesigo(raw: DesigoInputs): DesigoConfig {
  const inp = { ...raw, di: whole(raw.di), do: whole(raw.do) };
  const a = raw.analog ?? noAnalog();
  const sp = (n: number) => withSpare(whole(n), inp.sparePct);
  const aTot = (k: AnalogKey) => sp(a[k]?.w2 ?? 0) + sp(a[k]?.w4 ?? 0);
  // Universal: 0–10 V in/out and RTD; super-universal: 4–20 mA in/out and
  // thermocouples (via a transmitter).
  const need: Need = {
    di: sp(inp.di), do: sp(inp.do),
    uio: aTot('aiU') + aTot('aiRtd') + aTot('aoU'),
    suio: aTot('aiI') + sp(a.aiTc?.w2 ?? 0) + aTot('aoI'),
    trunks: 0, mbus: false, knx: false,
  };
  const pr = { ...noProtocols(), ...(raw.protocols ?? {}) };
  const mstp = whole(pr.mstp);
  const rtu = whole(pr.modbusRtu);
  const mbus = whole(pr.mbus);
  const p1 = whole(pr.p1);
  need.trunks = mstp + rtu + mbus;
  need.mbus = mbus > 0;
  need.knx = !!pr.knx;
  const points = need.di + need.do + need.uio + need.suio;
  const lines: DesigoLine[] = [];
  const add = (key: string, qty: number, why: string, section: DesigoSection = 'plc') => { if (qty > 0 && DESIGO_PARTS[key]) lines.push({ key, qty, why, section }); };
  const notes: string[] = [];

  // Controller: the one picked, or the smallest single station that fits;
  // beyond one PXC7.E400L, as many E400L as needed.
  let model: PxcModel | null = null;
  let suggested = 0;
  if (points > 0 || need.trunks > 0 || p1 > 0 || pr.modbusTcp || pr.knx) {
    if (inp.controller !== 'auto') {
      model = PXC_MODELS.find((m) => m.key === inp.controller) ?? null;
    } else {
      model = PXC_MODELS.find((m) => fits(need, m, 1)) ?? PXC_MODELS.find((m) => m.key === 'pxc7l')!;
    }
    suggested = 1;
    while (model && !fits(need, model, suggested) && suggested < 100) suggested += 1;
  }
  const qty = model ? Math.max(suggested, whole(inp.controllers)) : 0;
  const tx = txModulesFor(need, model, qty);
  const modules = moduleCount(tx);
  // Modules beyond what each station powers itself need TXS1.12F10 supplies (≈ 10 modules each).
  const extraModules = model ? Math.max(0, modules - model.selfPoweredModules * qty) : 0;
  const txs = Math.ceil(extraModules / 10);

  if (model) {
    add(model.key, qty, qty > 1 ? `${qty} automation stations — ${Math.ceil(points / qty)} points each on average` : `Automation station — ${points} I/O points incl. spare`);
    add('txDi16', tx.txDi16, `${TX_MODULES.txDi16.channels} DI each`);
    add('txDo6', tx.txDo6, `${TX_MODULES.txDo6.channels} relay DO each`);
    add('txU8', tx.txU8, `${TX_MODULES.txU8.channels} universal each — 0–10 V in/out, RTD`);
    add('txX8', tx.txX8, `${TX_MODULES.txX8.channels} super-universal each — 4–20 mA in/out${a.aiTc?.w2 ? ', thermocouple transmitters' : ''}`);
    add('txs12f10', txs, `Powers the TX-I/O modules beyond the ${model.selfPoweredModules} the station feeds itself (≈ 10 modules each)`);
    // 24 V AC for the stations and TX-I/O supplies: ~25 VA per station, ~50 VA per TXS1.12F10.
    const va = (qty * 25 + txs * 50) * 1.25;
    add(va <= 100 ? 'xfmr100' : va <= 250 ? 'xfmr250' : 'xfmr500', va <= 500 ? 1 : Math.ceil(va / 500), `24 V AC for ${qty} station${qty === 1 ? '' : 's'}${txs ? ` and ${txs} TX-I/O supply module${txs === 1 ? '' : 's'}` : ''} (≈ ${Math.round(va)} VA incl. 25%)`);
    if (model.maxModules !== null && modules > model.maxModules * qty) notes.push(`${model.model} takes at most ${model.maxModules} TX-I/O modules — pick a bigger station or more stations.`);
    if (model.maxTxPoints !== null && tx.points > model.maxTxPoints * qty) notes.push(`${model.model} takes at most ${model.maxTxPoints} TX-I/O points — pick a bigger station or more stations.`);
    if (need.mbus && !model.mbus) notes.push(`${model.model} has no M-Bus — pick a PXC5 or PXC7.`);
    if (need.trunks > model.rs485 * qty) notes.push(`${need.trunks} serial trunks need ${need.trunks} RS-485 ports — ${model.model} has ${model.rs485} each; pick a bigger station or more stations.`);
    if (whole(inp.controllers) > 0 && whole(inp.controllers) < suggested) notes.push(`The I/O needs at least ${suggested} × ${model.model} — using ${suggested}.`);
  }
  // Protocols
  add('mbusConverter', mbus, 'One per M-Bus trunk (RS-485 to M-Bus)');
  add('p1Gateway', p1, 'P1 (APOGEE FLN) is not on the PXC4 / PXC5 / PXC7.E400 — gateway or PXC7.A, up to 32 devices per trunk');
  add('knxInterface', pr.knx && model && !model.knx ? 1 : 0, `KNX integration — ${model?.model ?? 'this station'} has no on-board KNX`);
  add('rs485Termination', (mstp + rtu + p1) * 2, 'Termination at both ends of every RS-485 trunk');
  if (need.trunks + p1 > 0 || pr.modbusTcp || pr.knx) {
    const list = [mstp && `BACnet MS/TP × ${mstp}`, rtu && `Modbus RTU × ${rtu}`, mbus && `M-Bus × ${mbus}`, p1 && `P1 × ${p1}`, pr.modbusTcp && 'Modbus TCP', pr.knx && 'KNX'].filter(Boolean).join(', ');
    notes.push(`Integration: ${list}. BACnet/IP and Modbus TCP use the station's Ethernet port (no hardware); each serial trunk uses one RS-485 port.`);
  }
  if (pr.knx && model?.knx) notes.push('KNX TP1 connects to the PXC4\'s on-board KNX interface.');
  if ((a.aiRtd?.w4 ?? 0) > 0) notes.push('TX-I/O measures RTDs 2-wire (Pt1000 / Ni1000); 3-/4-wire Pt100 needs a transmitter (then count it as 4–20 mA).');
  if ((a.aiTc?.w2 ?? 0) > 0) notes.push('Thermocouples need a head / rail transmitter to 4–20 mA — counted on super-universal points; add the transmitters.');

  // Desigo CC
  const dataPoints = points + whole(inp.integrationPoints);
  if (inp.dcc) {
    const servers = inp.dccRedundant ? 2 : 1;
    add('dccServer', servers, inp.dccRedundant ? 'Redundant pair — main + standby server' : 'Management station server', 'bmsSoftware');
    add('dccPoints', dataPoints > 0 ? 1 : 0, `${dataPoints} field data points (${points} I/O incl. spare + ${whole(inp.integrationPoints)} integration) — license sized to this count`, 'bmsSoftware');
    add('dccClient', whole(inp.dccClients), 'Installed client workstations', 'bmsSoftware');
    add('dccWebClient', whole(inp.dccWebClients), 'Web / Windows app clients', 'bmsSoftware');
    add('dccRedundancy', inp.dccRedundant ? 1 : 0, 'Server failover for the redundant pair', 'bmsSoftware');
    add('dccHistory', inp.dccHistory ? servers : 0, 'Long-term trend / history storage on SQL Server', 'bmsSoftware');
    add('dccReports', inp.dccReports ? 1 : 0, 'Scheduled / on-demand reports', 'bmsSoftware');
    notes.push('Desigo CC licenses are ordered by feature and data-point count — the supplier fills in the order numbers and prices.');
  }

  // Network: BACnet/IP between stations and the management station.
  const swQty = whole(inp.switchQty) || 0;
  const devices = qty + (inp.dcc ? (inp.dccRedundant ? 2 : 1) + whole(inp.dccClients) : 0);
  const portsPerSwitch = swQty > 0 ? Math.ceil(devices / swQty) + (swQty > 1 ? 2 : 1) : 0;
  const ofType = SWITCHES.filter((s) => s.type === inp.switchType).sort((x, y) => x.ports - y.ports);
  const netSwitch = swQty > 0 ? (ofType.find((s) => s.ports >= portsPerSwitch) ?? ofType[ofType.length - 1]) : null;
  if (netSwitch) add(netSwitch.key, swQty, `BACnet/IP network — ${devices} device${devices === 1 ? '' : 's'}, ~${portsPerSwitch} ports per switch`);
  const psu = SITOP_OPTIONS.find((s) => s.key === inp.psu);
  if (psu) add(psu.key, 1, `24 V DC for field devices / panel — ${psu.ratingA} A`);

  let wiring: WiringSummary | null = null;
  const a2 = ANALOG_KINDS.reduce((s, k) => s + sp(a[k.key]?.w2 ?? 0), 0);
  const a4 = ANALOG_KINDS.reduce((s, k) => s + (k.key === 'aiTc' ? 0 : sp(a[k.key]?.w4 ?? 0)), 0);
  const panelIo: PanelIo = {
    source: 'Siemens Desigo', di: need.di, dq: need.do, a2, a4,
    distPoints: qty + txs + swQty + (psu ? 1 : 0) + 1,
    deviceRailMm: qty * 200 + (modules + txs) * 64,
    ...(psu ? { psuA: psu.ratingA, psuQty: 1 } : {}),
  };
  if (inp.terminals && need.di + need.do + a2 + a4 > 0) {
    const strip = terminalStrip({
      ...panelIo, extraRailMm: panelIo.deviceRailMm, railFor: 'terminals, relays, automation stations and TX-I/O',
      panelW: whole(inp.panelW), panelH: whole(inp.panelH),
    });
    wiring = strip.wiring;
    strip.lines.forEach((l) => add(l.key, l.qty, l.why, l.section));
  }

  return { lines, controller: model, controllers: qty, suggestedControllers: suggested, points, txPoints: tx.points, modules, dataPoints, wiring, panelIo, notes };
}
