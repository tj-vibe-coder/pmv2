// Conduit fill — PEC 2017 Chapter 9 (same tables as NEC Chapter 9):
//   Table 1: max fill = 53% for 1 conductor, 31% for 2, 40% for 3 or more.
//   Table 4: internal area of IMC (Art. 3.42) and EMT (Art. 3.58) per trade size.
//   Table 5: conductor area by insulation type and size.
// Used by the Installation Work calculator to recommend the smallest conduit
// that legally holds a run's wires.

import type { ConduitType, PipeSize } from './installationMaterials';

export type WireSize =
  | '18' | '16' | '14' | '12' | '10' | '8' | '6' | '4' | '3' | '2' | '1'
  | '1/0' | '2/0' | '3/0' | '4/0' | '250' | '300' | '350';

export type Insulation = 'THHN' | 'THW';
export const INSULATIONS: { value: Insulation; label: string }[] = [
  { value: 'THHN', label: 'THHN / THWN-2' },
  { value: 'THW', label: 'THW / TW' },
];

// Philippine sizes are usually quoted in mm²; show both.
export const WIRE_SIZES: { value: WireSize; label: string }[] = [
  { value: '18', label: '18 AWG (0.75 mm²)' },
  { value: '16', label: '16 AWG (1.25 mm²)' },
  { value: '14', label: '14 AWG (2.0 mm²)' },
  { value: '12', label: '12 AWG (3.5 mm²)' },
  { value: '10', label: '10 AWG (5.5 mm²)' },
  { value: '8', label: '8 AWG (8.0 mm²)' },
  { value: '6', label: '6 AWG (14 mm²)' },
  { value: '4', label: '4 AWG (22 mm²)' },
  { value: '3', label: '3 AWG (30 mm²)' },
  { value: '2', label: '2 AWG (38 mm²)' },
  { value: '1', label: '1 AWG (50 mm²)' },
  { value: '1/0', label: '1/0 AWG (60 mm²)' },
  { value: '2/0', label: '2/0 AWG (70 mm²)' },
  { value: '3/0', label: '3/0 AWG (80 mm²)' },
  { value: '4/0', label: '4/0 AWG (100 mm²)' },
  { value: '250', label: '250 kcmil (125 mm²)' },
  { value: '300', label: '300 kcmil (150 mm²)' },
  { value: '350', label: '350 kcmil (175 mm²)' },
];

const IN2_TO_MM2 = 645.16;

// Table 5, approximate area in in². 18/16 AWG are fixture wire (TFFN) under
// either insulation choice — building wire starts at 14 AWG.
const AREA_IN2: Record<Insulation, Record<WireSize, number>> = {
  THHN: {
    '18': 0.0055, '16': 0.0072, '14': 0.0097, '12': 0.0133, '10': 0.0211, '8': 0.0366, '6': 0.0507,
    '4': 0.0824, '3': 0.0973, '2': 0.1158, '1': 0.1562, '1/0': 0.1855, '2/0': 0.2223, '3/0': 0.2679,
    '4/0': 0.3237, '250': 0.397, '300': 0.4608, '350': 0.5242,
  },
  THW: {
    '18': 0.0055, '16': 0.0072, '14': 0.0139, '12': 0.0181, '10': 0.0243, '8': 0.0437, '6': 0.0726,
    '4': 0.0973, '3': 0.1134, '2': 0.1333, '1': 0.1901, '1/0': 0.2223, '2/0': 0.2624, '3/0': 0.3117,
    '4/0': 0.3718, '250': 0.4596, '300': 0.5281, '350': 0.5958,
  },
};

// Table 4, total (100%) internal area — the published in² figures (kept exact:
// rounding to whole mm² tips borderline counts over the Note 7 threshold).
const CONDUIT_AREA_IN2: Record<ConduitType, Record<PipeSize, number>> = {
  IMC: { '1/2"': 0.342, '3/4"': 0.586, '1"': 0.959, '1-1/4"': 1.647, '1-1/2"': 2.225, '2"': 3.63 },
  EMT: { '1/2"': 0.304, '3/4"': 0.533, '1"': 0.864, '1-1/4"': 1.496, '1-1/2"': 2.036, '2"': 3.356 },
};
const CONDUIT_AREA_MM2 = Object.fromEntries(
  Object.entries(CONDUIT_AREA_IN2).map(([t, sizes]) => [t, Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, v * IN2_TO_MM2]))]),
) as Record<ConduitType, Record<PipeSize, number>>;

const CONDUIT_ORDER: PipeSize[] = ['1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"'];

export interface ConductorGroup { size: WireSize; qty: number }

export function wireAreaMm2(size: WireSize, insulation: Insulation): number {
  return AREA_IN2[insulation][size] * IN2_TO_MM2;
}

/** Table 1 fill limit (fraction) for a number of conductors. */
export function fillLimit(conductors: number): number {
  return conductors <= 1 ? 0.53 : conductors === 2 ? 0.31 : 0.4;
}

export interface FillResult {
  conductors: number;
  wireAreaMm2: number;
  /** Allowed fill for this conductor count (0.53 / 0.31 / 0.40). */
  limit: number;
  /** Smallest conduit (up to 2") within the limit; null when even 2" is too small. */
  recommended: PipeSize | null;
  /** Fill fraction of `size` (the size being checked). */
  fillOf: (size: PipeSize) => number;
}

/**
 * How many cables of one size a conduit may hold (PEC Chapter 9): 40% fill
 * for three or more, 31% for two, 53% for one; and Note 7 — when every cable
 * is the same size and the count works out to a decimal of 0.8 or more, the
 * next whole number is permitted (this is how the Annex C tables are built).
 */
export function maxCables(size: WireSize, insulation: Insulation, type: ConduitType, pipe: PipeSize): number {
  const a = wireAreaMm2(size, insulation);
  const area = CONDUIT_AREA_MM2[type][pipe];
  const raw = (0.4 * area) / a;
  const n = raw - Math.floor(raw) >= 0.8 ? Math.ceil(raw) : Math.floor(raw);
  if (n >= 3) return n;
  if (2 * a <= 0.31 * area) return 2;
  return a <= 0.53 * area ? 1 : 0;
}

/** Cables of `size` per pipe for every pipe size (the Annex C row). */
export function capacityBySize(size: WireSize, insulation: Insulation, type: ConduitType): { pipe: PipeSize; max: number }[] {
  return CONDUIT_ORDER.map((pipe) => ({ pipe, max: maxCables(size, insulation, type, pipe) }));
}

export function conduitFill(groups: ConductorGroup[], insulation: Insulation, type: ConduitType): FillResult | null {
  const valid = groups.filter((g) => g.qty > 0);
  const conductors = valid.reduce((n, g) => n + Math.round(g.qty), 0);
  if (conductors === 0) return null;
  const area = valid.reduce((a, g) => a + Math.round(g.qty) * wireAreaMm2(g.size, insulation), 0);
  const limit = fillLimit(conductors);
  const fillOf = (size: PipeSize) => area / CONDUIT_AREA_MM2[type][size];
  // All one size → use the per-pipe capacity (incl. Note 7) so the
  // recommendation agrees with the capacity shown; mixed sizes → by area.
  const sizes = new Set(valid.map((g) => g.size));
  const fits = sizes.size === 1
    ? (pipe: PipeSize) => conductors <= maxCables(valid[0].size, insulation, type, pipe)
    : (pipe: PipeSize) => fillOf(pipe) <= limit + 1e-9;
  const recommended = CONDUIT_ORDER.find(fits) ?? null;
  return { conductors, wireAreaMm2: area, limit, recommended, fillOf };
}
