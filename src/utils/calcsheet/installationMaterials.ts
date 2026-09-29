// Installation Work calculator — turns a set of named conduit runs (length,
// pipe size, bends, equipment connections, mounting) into the pipe /
// junction-box / accessory quantities needed, so Section B doesn't have to be
// hand-counted per project. Accessories are computed from the Philippine
// Electrical Code (PEC 2017) support rules — see pecAccessories() — and each
// can still be overridden per run.
// Pure logic only (no React) — see InstallationWorkDialog.tsx for the popup UI
// and CalcsheetPresets.tsx for where unit pricing is set.

import type { ConductorGroup, Insulation } from './conduitFill';

export type PipeSize = '1/2"' | '3/4"' | '1"' | '1-1/4"' | '1-1/2"' | '2"';
export const PIPE_SIZES: PipeSize[] = ['1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"'];

// Slot-key suffix per size (the original three keep their old keys, so saved
// Presets prices still line up) and the size part of catalog numbers.
type SizeKey = 'half' | '3q' | '1' | '1q' | '1h' | '2';
const SIZE_KEY: Record<PipeSize, SizeKey> = { '1/2"': 'half', '3/4"': '3q', '1"': '1', '1-1/4"': '1q', '1-1/2"': '1h', '2"': '2' };
const SIZE_CODE: Record<PipeSize, string> = { '1/2"': '0.5', '3/4"': '0.75', '1"': '1', '1-1/4"': '1.25', '1-1/2"': '1.5', '2"': '2' };

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
  /** true = pipe size follows the PEC conduit-fill recommendation for `conductors`. */
  pipeSizeAuto: boolean;
  conduitType: ConduitType;
  /** Wires pulled through this conduit (for sizing it — PEC Chapter 9). */
  conductors: ConductorGroup[];
  insulation: Insulation;
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
  id: '', name: '', lengthMeters: 0, pipeSize: '1/2"', pipeSizeAuto: true, conduitType: 'IMC',
  conductors: [{ size: '12', qty: 0 }], insulation: 'THHN',
  bends90: 0, equipmentConnections: 1, mounting: 'clamp',
  couplingQty: null, boxFittingQty: null,
  lqtMeters: null, straightConnectorQty: null, caddyClampQty: null, uBoltQty: null,
  unistrutChannelQty: null, angleBarQty: null,
});

export type AccessoryField = 'couplingQty' | 'boxFittingQty' | 'lqtMeters' | 'straightConnectorQty' | 'caddyClampQty' | 'uBoltQty' | 'unistrutChannelQty' | 'angleBarQty';

// Material "slots" this calculator knows how to price and insert: every
// size-specific item comes in all PIPE_SIZES; boxes, unistrut channel and
// angle bar are single slots. MATERIAL_SLOTS is the source of truth for
// label/uom; CalcsheetPresets only stores a brand/unitCost override per key
// (see quotationStore's installMaterialPrices), so adding a slot never needs a
// data migration — it just prices from the catalog, or ₱0 until priced.
const SIZED_FAMILIES = [
  { family: 'pipe', label: 'IMC Pipe', uom: 'pc', catalog: 'IMC' },
  { family: 'emtPipe', label: 'EMT Pipe', uom: 'pc', catalog: 'EMT' },
  { family: 'imcCoupling', label: 'IMC Coupling', uom: 'pc', catalog: 'IMCCPL' },
  { family: 'emtCoupling', label: 'EMT Coupling', uom: 'pc', catalog: 'EMTCPL' },
  { family: 'locknut', label: 'Lock Nut with Bushing', uom: 'pc', catalog: 'LOCKNUT' },
  { family: 'emtConnector', label: 'EMT Connector', uom: 'pc', catalog: 'EMTCON' },
  { family: 'lqt', label: 'LQT', uom: 'meter', catalog: 'LQT' },
  { family: 'straightConnector', label: 'Straight Connector', uom: 'pc', catalog: 'LQTCON' },
  { family: 'caddyClamp', label: 'Caddy Clamp', uom: 'pc', catalog: 'CADDY' },
  { family: 'uBolt', label: 'U Bolt', uom: 'pc', catalog: 'UBOLT' },
] as const;
type SizedFamily = (typeof SIZED_FAMILIES)[number]['family'];

// Boxes are sized to the conduit's knockout: a 4x4 junction box takes up to
// 1"; 1-1/4"–1-1/2" go to a 6x6x4 pull box and 2" to an 8x8x4 (site practice).
const BOX_SLOTS = [
  { key: 'junctionBox', label: 'Junction Box 4x4', catalog: 'JBOX-4X4' },
  { key: 'pullBox6', label: 'Pull Box 6x6x4', catalog: 'PULLBOX-6' },
  { key: 'pullBox8', label: 'Pull Box 8x8x4', catalog: 'PULLBOX-8' },
] as const;
type BoxKey = (typeof BOX_SLOTS)[number]['key'];
export function boxSlotFor(size: PipeSize): BoxKey {
  return size === '2"' ? 'pullBox8' : size === '1-1/4"' || size === '1-1/2"' ? 'pullBox6' : 'junctionBox';
}

export type MaterialSlotKey = `${SizedFamily}_${SizeKey}` | BoxKey | 'unistrutChannel' | 'angleBar_1';

export interface MaterialSlot {
  key: MaterialSlotKey;
  label: string;
  uom: 'pc' | 'meter';
  /** This slot's item number in the IOCT Electrical Materials pricelist. */
  catalogNo: string;
}

// Per-slot pricing override, stored server-side (calcsheet_install_materials,
// doc id = slot key) and edited on the Presets page — label/uom always come
// from MATERIAL_SLOTS above, this only carries what a team member actually
// has to set: brand + unit cost. Sparse — a slot with no doc yet is unitCost 0.
export interface InstallMaterialPrice {
  brand?: string;
  unitCost: number;
}

const sized = (family: SizedFamily): MaterialSlot[] => {
  const f = SIZED_FAMILIES.find((x) => x.family === family) as (typeof SIZED_FAMILIES)[number];
  return PIPE_SIZES.map((size) => ({
    key: `${family}_${SIZE_KEY[size]}` as MaterialSlotKey,
    label: `${f.label} ${size}`,
    uom: f.uom,
    catalogNo: `${f.catalog}-${SIZE_CODE[size]}`,
  }));
};

export const MATERIAL_SLOTS: MaterialSlot[] = [
  ...sized('pipe'), ...sized('emtPipe'), ...sized('imcCoupling'), ...sized('emtCoupling'),
  ...sized('locknut'), ...sized('emtConnector'),
  ...BOX_SLOTS.map((b) => ({ key: b.key as MaterialSlotKey, label: b.label, uom: 'pc' as const, catalogNo: b.catalog })),
  ...sized('lqt'), ...sized('straightConnector'), ...sized('caddyClamp'), ...sized('uBolt'),
  { key: 'unistrutChannel', label: 'Unistrut Channel Slotted', uom: 'pc', catalogNo: 'UNISTRUT-SLOT' },
  { key: 'angleBar_1', label: 'Angle Bar 1"', uom: 'pc', catalogNo: 'ANGLEBAR-1' },
];

export const materialSlotByKey = (key: string): MaterialSlot | undefined =>
  MATERIAL_SLOTS.find((s) => s.key === key);

// Standard pipe stick length, and how many sticks separate junction boxes —
// both fixed constants for now (not per-entry configurable); revisit if a
// project needs a non-standard pipe length.
const PIPE_LENGTH_M = 3;
const PIPES_PER_JUNCTION_BOX = 3;
const JUNCTION_SPACING_M = PIPE_LENGTH_M * PIPES_PER_JUNCTION_BOX; // 9

const sizeSuffix = (size: PipeSize): SizeKey => SIZE_KEY[size];

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
export function pecAccessories(e: Pick<InstallationWorkEntry, 'lengthMeters' | 'bends90' | 'equipmentConnections' | 'mounting'> & { conduitType?: ConduitType }): Record<AccessoryField, number> {
  const supports = supportsNeeded(e.lengthMeters, e.bends90);
  const pipes = pipesNeeded(e.lengthMeters);
  const segments = junctionBoxesNeeded(e.lengthMeters, e.bends90);
  const conns = Math.max(0, Math.round(e.equipmentConnections || 0));
  const onUnistrut = e.mounting === 'unistrut';
  return {
    // Sticks are joined end to end within each box-to-box segment. IMC is
    // bought "with coupling" (one per length), so none extra by default;
    // EMT is sold bare, so one coupling per joint.
    couplingQty: e.conduitType === 'EMT' ? Math.max(0, pipes - segments) : 0,
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
  if (junctions > 0) out[boxSlotFor(e.pipeSize)] = junctions;
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
// Each slot's item in the IOCT Electrical Materials pricelist (pricelist_items,
// see scripts/import-pricelist-materials.js), by catalog no. Sizes the
// pricelist doesn't carry yet simply don't match → "Not priced".
export const SLOT_CATALOG_NO = Object.fromEntries(MATERIAL_SLOTS.map((s) => [s.key, s.catalogNo])) as Record<MaterialSlotKey, string>;

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

// ── Placing the generated rows in Section B ──────────────────────────────
export const INSTALLATION_HEADER = 'INSTALLATION WORK';

type SectionRow = { id: string; description: string; isHeader?: boolean };

/**
 * Section B with the Installation Work rows added under an "INSTALLATION WORK"
 * header row: the first time, the header is created at the end; after that,
 * new rows go at the end of that header's block (before the next section
 * header) so repeat adds stay together instead of repeating the header.
 */
export function withInstallationRows<T extends SectionRow>(components: T[], rows: T[], makeHeader: () => T): T[] {
  const h = components.findIndex((c) => c.isHeader && c.description.trim().toUpperCase() === INSTALLATION_HEADER);
  if (h < 0) return [...components, makeHeader(), ...rows];
  let end = components.findIndex((c, i) => i > h && c.isHeader);
  if (end < 0) end = components.length;
  return [...components.slice(0, end), ...rows, ...components.slice(end)];
}
