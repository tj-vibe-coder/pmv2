// Installation Work calculator — turns a set of named conduit runs (length,
// pipe size, bends, equipment connections, mounting) into the pipe /
// junction-box / accessory quantities needed, so Section B doesn't have to be
// hand-counted per project. Accessories are computed from the Philippine
// Electrical Code (PEC 2017) support rules — see pecAccessories() — and each
// can still be overridden per run.
// Pure logic only (no React) — see InstallationWorkDialog.tsx for the popup UI
// and CalcsheetPresets.tsx for where unit pricing is set.

export type PipeSize = '1/2"' | '3/4"' | '1"';
export const PIPE_SIZES: PipeSize[] = ['1/2"', '3/4"', '1"'];

/** IMC (Intermediate Metal Conduit, PEC Art. 3.42) or EMT (Electrical Metallic
 *  Tubing, Art. 3.58). Same support/bend rules; different pipe and fittings. */
export type ConduitType = 'IMC' | 'EMT';
export const CONDUIT_TYPES: { value: ConduitType; label: string; article: string }[] = [
  { value: 'IMC', label: 'IMC — Intermediate Metal Conduit', article: 'Art. 3.42' },
  { value: 'EMT', label: 'EMT — Electrical Metallic Tubing', article: 'Art. 3.58' },
];

/** How the conduit is fixed: beam/caddy clamps straight to the structure, or
 *  U-bolts on unistrut channel with 1" angle-bar brackets. */
export type Mounting = 'clamp' | 'unistrut';

// One continuous conduit run as entered in the popup. All of its accessories
// (LQT, Straight Connector, Caddy Clamp, U Bolt) are assumed to match this
// run's pipe size — a single run describes one size of conduit end-to-end;
// mixed sizes on one route are entered as separate runs. Unistrut Channel and
// Angle Bar aren't size-specific, so they're just one field each.
//
// Accessory fields are OVERRIDES: null = use the PEC-computed quantity.
export interface InstallationWorkEntry {
  id: string;               // local-only, for list management in the dialog
  name: string;
  lengthMeters: number;
  pipeSize: PipeSize;
  conduitType: ConduitType;
  /** 90° bends (or equivalent) along the run — PEC allows at most 360° between pull points. */
  bends90: number;
  /** Equipment / device end connections made with LQT flex. */
  equipmentConnections: number;
  mounting: Mounting;
  /** Couplings joining pipe sticks (IMC threaded / EMT). */
  couplingQty: number | null;
  /** Box / panel entries: locknut with bushing (IMC) or EMT connector (EMT). */
  boxFittingQty: number | null;
  lqtMeters: number | null;
  straightConnectorQty: number | null;
  caddyClampQty: number | null;
  uBoltQty: number | null;
  unistrutChannelQty: number | null;
  angleBarQty: number | null;
}

export const blankEntry = (): InstallationWorkEntry => ({
  id: '', name: '', lengthMeters: 0, pipeSize: '1/2"', conduitType: 'IMC',
  bends90: 0, equipmentConnections: 1, mounting: 'clamp',
  couplingQty: null, boxFittingQty: null,
  lqtMeters: null, straightConnectorQty: null, caddyClampQty: null, uBoltQty: null,
  unistrutChannelQty: null, angleBarQty: null,
});

export type AccessoryField = 'couplingQty' | 'boxFittingQty' | 'lqtMeters' | 'straightConnectorQty' | 'caddyClampQty' | 'uBoltQty' | 'unistrutChannelQty' | 'angleBarQty';

// Fixed set of material "slots" this calculator knows how to price and
// insert — pipe/LQT/Straight Connector/Caddy Clamp/U Bolt each split by size,
// Junction Box/Unistrut Channel/Angle Bar 1" as single slots. This list is the
// source of truth for label/uom; CalcsheetPresets only stores a brand/unitCost
// override per key (see quotationStore's installMaterialPrices), so adding a
// new slot here never needs a data migration — it just shows ₱0 until priced.
export type MaterialSlotKey =
  | 'pipe_half' | 'pipe_3q' | 'pipe_1'
  | 'emtPipe_half' | 'emtPipe_3q' | 'emtPipe_1'
  | 'imcCoupling_half' | 'imcCoupling_3q' | 'imcCoupling_1'
  | 'emtCoupling_half' | 'emtCoupling_3q' | 'emtCoupling_1'
  | 'locknut_half' | 'locknut_3q' | 'locknut_1'
  | 'emtConnector_half' | 'emtConnector_3q' | 'emtConnector_1'
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
  { key: 'emtPipe_half', label: 'EMT Pipe 1/2"', uom: 'pc' },
  { key: 'emtPipe_3q', label: 'EMT Pipe 3/4"', uom: 'pc' },
  { key: 'emtPipe_1', label: 'EMT Pipe 1"', uom: 'pc' },
  { key: 'imcCoupling_half', label: 'IMC Coupling 1/2"', uom: 'pc' },
  { key: 'imcCoupling_3q', label: 'IMC Coupling 3/4"', uom: 'pc' },
  { key: 'imcCoupling_1', label: 'IMC Coupling 1"', uom: 'pc' },
  { key: 'emtCoupling_half', label: 'EMT Coupling 1/2"', uom: 'pc' },
  { key: 'emtCoupling_3q', label: 'EMT Coupling 3/4"', uom: 'pc' },
  { key: 'emtCoupling_1', label: 'EMT Coupling 1"', uom: 'pc' },
  { key: 'locknut_half', label: 'Lock Nut with Bushing 1/2"', uom: 'pc' },
  { key: 'locknut_3q', label: 'Lock Nut with Bushing 3/4"', uom: 'pc' },
  { key: 'locknut_1', label: 'Lock Nut with Bushing 1"', uom: 'pc' },
  { key: 'emtConnector_half', label: 'EMT Connector 1/2"', uom: 'pc' },
  { key: 'emtConnector_3q', label: 'EMT Connector 3/4"', uom: 'pc' },
  { key: 'emtConnector_1', label: 'EMT Connector 1"', uom: 'pc' },
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
// A junction box every 3 pipes (9 m), and — PEC 2017 Art. 3.42 (IMC, "not
// more than the equivalent of four quarter bends (360° total) between pull
// points") — enough boxes that no box-to-box segment carries more than four
// 90° bends.
export function junctionBoxesNeeded(lengthMeters: number, bends90 = 0): number {
  const m = Math.max(0, lengthMeters || 0);
  if (m <= 0) return 0;
  return Math.max(Math.ceil(m / JUNCTION_SPACING_M), Math.ceil(Math.max(0, bends90 || 0) / MAX_QUARTER_BENDS));
}

// ── PEC 2017 accessory rules ─────────────────────────────────────────────
// IMC, Art. 3.42 (same as NEC 342.30): secured within 900 mm of every box /
// termination, and supported at intervals not exceeding 3.0 m.
export const PEC_SUPPORT_FROM_BOX_M = 0.9;
export const PEC_MAX_SUPPORT_SPACING_M = 3.0;
const MAX_QUARTER_BENDS = 4;
// LFMC ("LQT"), Art. 3.50 (NEC 350.30 exception): up to 900 mm at a terminal
// where flexibility is needed may be left unsupported — the usual equipment drop.
export const PEC_LQT_PER_CONNECTION_M = 0.9;
// Site practice (not PEC) for the support hardware — change here if the crew
// cuts differently.
export const UNISTRUT_PER_SUPPORT_M = 0.3;   // one short channel piece per support point
export const UNISTRUT_STICK_M = 3.0;         // slotted channel, 3 m (10 ft) stock
export const ANGLE_BAR_PER_SUPPORT_M = 0.6;  // one 1" angle bracket per support point
export const ANGLE_BAR_STICK_M = 6.0;        // 6 m (20 ft) stock

/** Supports along one box-to-box segment: one within 0.9 m of each end, none more than 3 m apart. */
export function supportsPerSegment(segmentM: number): number {
  const s = Math.max(0, segmentM || 0);
  if (s <= 0) return 0;
  return 1 + Math.ceil(Math.max(0, s - 2 * PEC_SUPPORT_FROM_BOX_M) / PEC_MAX_SUPPORT_SPACING_M);
}

/** Conduit supports a run needs under PEC — per segment between its junction boxes. */
export function supportsNeeded(lengthMeters: number, bends90 = 0): number {
  const segments = junctionBoxesNeeded(lengthMeters, bends90);
  if (segments === 0) return 0;
  return segments * supportsPerSegment(lengthMeters / segments);
}

/** PEC-computed accessory quantities for a run (before any per-run override). */
export function pecAccessories(e: Pick<InstallationWorkEntry, 'lengthMeters' | 'bends90' | 'equipmentConnections' | 'mounting'>): Record<AccessoryField, number> {
  const supports = supportsNeeded(e.lengthMeters, e.bends90);
  const pipes = pipesNeeded(e.lengthMeters);
  const segments = junctionBoxesNeeded(e.lengthMeters, e.bends90);
  const conns = Math.max(0, Math.round(e.equipmentConnections || 0));
  const onUnistrut = e.mounting === 'unistrut';
  return {
    // Sticks are joined end to end within each box-to-box segment.
    couplingQty: Math.max(0, pipes - segments),
    // Every segment enters a box / panel at both ends.
    boxFittingQty: segments * 2,
    lqtMeters: Math.round(conns * PEC_LQT_PER_CONNECTION_M * 10) / 10,
    straightConnectorQty: conns * 2, // one at each end of every LQT piece
    caddyClampQty: onUnistrut ? 0 : supports,
    uBoltQty: onUnistrut ? supports : 0,
    unistrutChannelQty: onUnistrut && supports > 0 ? Math.ceil((supports * UNISTRUT_PER_SUPPORT_M) / UNISTRUT_STICK_M) : 0,
    angleBarQty: onUnistrut && supports > 0 ? Math.ceil((supports * ANGLE_BAR_PER_SUPPORT_M) / ANGLE_BAR_STICK_M) : 0,
  };
}

/** Accessory quantities actually used: the override where set, else the PEC figure. */
export function effectiveAccessories(e: InstallationWorkEntry): Record<AccessoryField, number> {
  const auto = pecAccessories(e);
  const pick = (k: AccessoryField) => (e[k] ?? auto[k]);
  return {
    couplingQty: pick('couplingQty'), boxFittingQty: pick('boxFittingQty'),
    lqtMeters: pick('lqtMeters'), straightConnectorQty: pick('straightConnectorQty'), caddyClampQty: pick('caddyClampQty'),
    uBoltQty: pick('uBoltQty'), unistrutChannelQty: pick('unistrutChannelQty'), angleBarQty: pick('angleBarQty'),
  };
}

// Quantities a single run contributes, keyed by material slot. Zero/blank
// fields are omitted so callers can tell "not needed" from "needed, zero".
export function computeEntryQuantities(e: InstallationWorkEntry): Partial<Record<MaterialSlotKey, number>> {
  const suffix = sizeSuffix(e.pipeSize);
  const out: Partial<Record<MaterialSlotKey, number>> = {};
  const pipes = pipesNeeded(e.lengthMeters);
  const junctions = junctionBoxesNeeded(e.lengthMeters, e.bends90);
  const a = effectiveAccessories(e);
  const emt = e.conduitType === 'EMT';
  if (pipes > 0) out[`${emt ? 'emtPipe' : 'pipe'}_${suffix}` as MaterialSlotKey] = pipes;
  if (junctions > 0) out.junctionBox = junctions;
  if (a.couplingQty > 0) out[`${emt ? 'emtCoupling' : 'imcCoupling'}_${suffix}` as MaterialSlotKey] = a.couplingQty;
  if (a.boxFittingQty > 0) out[`${emt ? 'emtConnector' : 'locknut'}_${suffix}` as MaterialSlotKey] = a.boxFittingQty;
  if (a.lqtMeters > 0) out[`lqt_${suffix}` as MaterialSlotKey] = a.lqtMeters;
  if (a.straightConnectorQty > 0) out[`straightConnector_${suffix}` as MaterialSlotKey] = a.straightConnectorQty;
  if (a.caddyClampQty > 0) out[`caddyClamp_${suffix}` as MaterialSlotKey] = a.caddyClampQty;
  if (a.uBoltQty > 0) out[`uBolt_${suffix}` as MaterialSlotKey] = a.uBoltQty;
  if (a.unistrutChannelQty > 0) out.unistrutChannel = a.unistrutChannelQty;
  if (a.angleBarQty > 0) out.angleBar_1 = a.angleBarQty;
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

// ── Pricing from the materials catalog ───────────────────────────────────
// Each slot's item in the IOCT Electrical Materials pricelist
// (pricelist_items, see scripts/import-pricelist-materials.js), by catalog no.
export const SLOT_CATALOG_NO: Record<MaterialSlotKey, string> = {
  pipe_half: 'IMC-0.5', pipe_3q: 'IMC-0.75', pipe_1: 'IMC-1',
  emtPipe_half: 'EMT-0.5', emtPipe_3q: 'EMT-0.75', emtPipe_1: 'EMT-1',
  imcCoupling_half: 'IMCCPL-0.5', imcCoupling_3q: 'IMCCPL-0.75', imcCoupling_1: 'IMCCPL-1',
  // Not in the materials pricelist yet — priced ₱0 until added there (or in Presets).
  emtCoupling_half: 'EMTCPL-0.5', emtCoupling_3q: 'EMTCPL-0.75', emtCoupling_1: 'EMTCPL-1',
  locknut_half: 'LOCKNUT-0.5', locknut_3q: 'LOCKNUT-0.75', locknut_1: 'LOCKNUT-1',
  emtConnector_half: 'EMTCON-0.5', emtConnector_3q: 'EMTCON-0.75', emtConnector_1: 'EMTCON-1',
  junctionBox: 'JBOX-4X4',
  lqt_half: 'LQT-0.5', lqt_3q: 'LQT-0.75', lqt_1: 'LQT-1',
  straightConnector_half: 'LQTCON-0.5', straightConnector_3q: 'LQTCON-0.75', straightConnector_1: 'LQTCON-1',
  caddyClamp_half: 'CADDY-0.5', caddyClamp_3q: 'CADDY-0.75', caddyClamp_1: 'CADDY-1',
  uBolt_half: 'UBOLT-0.5', uBolt_3q: 'UBOLT-0.75', uBolt_1: 'UBOLT-1',
  unistrutChannel: 'UNISTRUT-SLOT',
  angleBar_1: 'ANGLEBAR-1',
};

export interface CatalogPriceItem { catalogNo: string; description: string; brand?: string; sellingPrice: number; pricelistDate?: string }

export interface SlotPrice {
  unitCost: number;
  brand: string;
  partNo: string;
  /** 'preset' = Presets → Installation Materials; 'catalog' = materials pricelist; 'none' = not priced. */
  source: 'preset' | 'catalog' | 'none';
  catalogItem?: CatalogPriceItem;
}

/**
 * Unit price for a slot: a price set on Presets → Installation Materials wins
 * (a deliberate company override); otherwise the catalog item for the slot
 * (newest pricelist if the catalog number appears more than once).
 */
export function resolveSlotPrice(
  key: MaterialSlotKey,
  presets: Record<string, InstallMaterialPrice | undefined>,
  catalog: CatalogPriceItem[],
): SlotPrice {
  const preset = presets[key];
  const code = SLOT_CATALOG_NO[key].toUpperCase();
  const item = catalog
    .filter((c) => (c.catalogNo || '').toUpperCase() === code && (c.sellingPrice || 0) > 0)
    .sort((a, b) => String(b.pricelistDate || '').localeCompare(String(a.pricelistDate || '')))[0];
  if (preset && (preset.unitCost || 0) > 0) {
    return { unitCost: preset.unitCost, brand: preset.brand || item?.brand || '', partNo: item?.catalogNo || '', source: 'preset', catalogItem: item };
  }
  if (item) return { unitCost: item.sellingPrice, brand: item.brand || '', partNo: item.catalogNo, source: 'catalog', catalogItem: item };
  return { unitCost: 0, brand: preset?.brand || '', partNo: '', source: 'none' };
}
