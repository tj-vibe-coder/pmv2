// Installation Work calculator — turns a set of named conduit runs (length +
// pipe size + optional accessory counts) into the pipe/junction-box/accessory
// quantities needed, so Section B doesn't have to be hand-counted per project.
// Pure logic only (no React) — see InstallationWorkDialog.tsx for the popup UI
// and CalcsheetPresets.tsx for where unit pricing is set.

export type PipeSize = '1/2"' | '3/4"' | '1"';
export const PIPE_SIZES: PipeSize[] = ['1/2"', '3/4"', '1"'];

// One continuous conduit run as entered in the popup. All of its accessories
// (LQT, Straight Connector, Caddy Clamp, U Bolt) are assumed to match this
// run's pipe size — a single run describes one size of conduit end-to-end;
// mixed sizes on one route are entered as separate runs. Unistrut Channel and
// Angle Bar aren't size-specific, so they're just one field each.
export interface InstallationWorkEntry {
  id: string;               // local-only, for list management in the dialog
  name: string;
  lengthMeters: number;
  pipeSize: PipeSize;
  lqtMeters: number;
  straightConnectorQty: number;
  caddyClampQty: number;
  uBoltQty: number;
  unistrutChannelQty: number;
  angleBarQty: number;
}

export const blankEntry = (): InstallationWorkEntry => ({
  id: '', name: '', lengthMeters: 0, pipeSize: '1/2"',
  lqtMeters: 0, straightConnectorQty: 0, caddyClampQty: 0, uBoltQty: 0,
  unistrutChannelQty: 0, angleBarQty: 0,
});

// Fixed set of material "slots" this calculator knows how to price and
// insert — pipe/LQT/Straight Connector/Caddy Clamp/U Bolt each split by size,
// Junction Box/Unistrut Channel/Angle Bar 1" as single slots. This list is the
// source of truth for label/uom; CalcsheetPresets only stores a brand/unitCost
// override per key (see quotationStore's installMaterialPrices), so adding a
// new slot here never needs a data migration — it just shows ₱0 until priced.
export type MaterialSlotKey =
  | 'pipe_half' | 'pipe_3q' | 'pipe_1'
  | 'junctionBox'
  | 'lqt_half' | 'lqt_3q' | 'lqt_1'
  | 'straightConnector_half' | 'straightConnector_3q' | 'straightConnector_1'
  | 'caddyClamp_half' | 'caddyClamp_3q' | 'caddyClamp_1'
  | 'uBolt_half' | 'uBolt_3q' | 'uBolt_1'
  | 'unistrutChannel'
  | 'angleBar_1';

export interface MaterialSlot {
  key: MaterialSlotKey;
  label: string;
  uom: 'pc' | 'meter';
}

// Per-slot pricing override, stored server-side (calcsheet_install_materials,
// doc id = slot key) and edited on the Presets page — label/uom always come
// from MATERIAL_SLOTS above, this only carries what a team member actually
// has to set: brand + unit cost. Sparse — a slot with no doc yet is unitCost 0.
export interface InstallMaterialPrice {
  brand?: string;
  unitCost: number;
}

export const MATERIAL_SLOTS: MaterialSlot[] = [
  { key: 'pipe_half', label: 'IMC Pipe 1/2"', uom: 'pc' },
  { key: 'pipe_3q', label: 'IMC Pipe 3/4"', uom: 'pc' },
  { key: 'pipe_1', label: 'IMC Pipe 1"', uom: 'pc' },
  { key: 'junctionBox', label: 'Junction Box', uom: 'pc' },
  { key: 'lqt_half', label: 'LQT 1/2"', uom: 'meter' },
  { key: 'lqt_3q', label: 'LQT 3/4"', uom: 'meter' },
  { key: 'lqt_1', label: 'LQT 1"', uom: 'meter' },
  { key: 'straightConnector_half', label: 'Straight Connector 1/2"', uom: 'pc' },
  { key: 'straightConnector_3q', label: 'Straight Connector 3/4"', uom: 'pc' },
  { key: 'straightConnector_1', label: 'Straight Connector 1"', uom: 'pc' },
  { key: 'caddyClamp_half', label: 'Caddy Clamp 1/2"', uom: 'pc' },
  { key: 'caddyClamp_3q', label: 'Caddy Clamp 3/4"', uom: 'pc' },
  { key: 'caddyClamp_1', label: 'Caddy Clamp 1"', uom: 'pc' },
  { key: 'uBolt_half', label: 'U Bolt 1/2"', uom: 'pc' },
  { key: 'uBolt_3q', label: 'U Bolt 3/4"', uom: 'pc' },
  { key: 'uBolt_1', label: 'U Bolt 1"', uom: 'pc' },
  { key: 'unistrutChannel', label: 'Unistrut Channel Slotted', uom: 'pc' },
  { key: 'angleBar_1', label: 'Angle Bar 1"', uom: 'pc' },
];

export const materialSlotByKey = (key: string): MaterialSlot | undefined =>
  MATERIAL_SLOTS.find((s) => s.key === key);

// Standard pipe stick length, and how many sticks separate junction boxes —
// both fixed constants for now (not per-entry configurable); revisit if a
// project needs a non-standard pipe length.
const PIPE_LENGTH_M = 3;
const PIPES_PER_JUNCTION_BOX = 3;
const JUNCTION_SPACING_M = PIPE_LENGTH_M * PIPES_PER_JUNCTION_BOX; // 9

const sizeSuffix = (size: PipeSize): 'half' | '3q' | '1' =>
  size === '1/2"' ? 'half' : size === '3/4"' ? '3q' : '1';

// Pipes/junction boxes round UP — a run needs at least this many full sticks
// to reach its full length (e.g. 100m ÷ 3m = 33.33 → 34 pipes; 33 would only
// cover 99m).
export function pipesNeeded(lengthMeters: number): number {
  const m = Math.max(0, lengthMeters || 0);
  return m > 0 ? Math.ceil(m / PIPE_LENGTH_M) : 0;
}
export function junctionBoxesNeeded(lengthMeters: number): number {
  const m = Math.max(0, lengthMeters || 0);
  return m > 0 ? Math.ceil(m / JUNCTION_SPACING_M) : 0;
}

// Quantities a single run contributes, keyed by material slot. Zero/blank
// fields are omitted so callers can tell "not needed" from "needed, zero".
export function computeEntryQuantities(e: InstallationWorkEntry): Partial<Record<MaterialSlotKey, number>> {
  const suffix = sizeSuffix(e.pipeSize);
  const out: Partial<Record<MaterialSlotKey, number>> = {};
  const pipes = pipesNeeded(e.lengthMeters);
  const junctions = junctionBoxesNeeded(e.lengthMeters);
  if (pipes > 0) out[`pipe_${suffix}` as MaterialSlotKey] = pipes;
  if (junctions > 0) out.junctionBox = junctions;
  if (e.lqtMeters > 0) out[`lqt_${suffix}` as MaterialSlotKey] = e.lqtMeters;
  if (e.straightConnectorQty > 0) out[`straightConnector_${suffix}` as MaterialSlotKey] = e.straightConnectorQty;
  if (e.caddyClampQty > 0) out[`caddyClamp_${suffix}` as MaterialSlotKey] = e.caddyClampQty;
  if (e.uBoltQty > 0) out[`uBolt_${suffix}` as MaterialSlotKey] = e.uBoltQty;
  if (e.unistrutChannelQty > 0) out.unistrutChannel = e.unistrutChannelQty;
  if (e.angleBarQty > 0) out.angleBar_1 = e.angleBarQty;
  return out;
}

// Sums every entry's quantities into one totals map — this is what actually
// gets priced and inserted into Section B on Final Submit.
export function aggregateEntries(entries: InstallationWorkEntry[]): Partial<Record<MaterialSlotKey, number>> {
  const totals: Partial<Record<MaterialSlotKey, number>> = {};
  for (const e of entries) {
    const qs = computeEntryQuantities(e);
    for (const key of Object.keys(qs) as MaterialSlotKey[]) {
      totals[key] = (totals[key] || 0) + (qs[key] || 0);
    }
  }
  return totals;
}
