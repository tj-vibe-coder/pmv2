// Hand edits to the mounting-plate layout (the Control Panel layout editor).
//
// The auto layout (layoutPanel) is the starting point; the editor moves
// devices / runs between rows and bays, nudges them, splits a run, and adds
// or removes rail rows. Every edit returns a new layout (or an error and the
// layout unchanged), re-stacked so rows sit one under the other with a duct
// between them. An edited layout is only kept while it holds the same
// devices as the auto layout (layoutSignature) — change the I/O and the
// edits are dropped. Pure logic.

import { DUCT_H_H, DUCT_V_W, GAP, ROW_MIN, type PanelLayout, type Placed, type Row } from './panelLayout';

/** Where an item is: bay, row (within the bay) and item index (within the row). */
export interface ItemRef { bay: number; row: number; item: number }
export interface EditResult { layout: PanelLayout; error?: string }

/** Height of a new, empty rail row (mm). */
export const NEW_ROW_H = 120;

const round = (n: number) => Math.round(n * 100) / 100;
const unitW = (it: Placed) => round(it.w / it.count);

/**
 * What the layout holds, independent of where things are: enclosure, bay
 * count and the total of each kind of device. Same signature = same devices.
 */
export function layoutSignature(l: PanelLayout): string {
  const totals = new Map<string, number>();
  l.bays.forEach((b) => b.rows.forEach((r) => r.items.forEach((it) => {
    const key = `${it.tag}|${it.label}|${unitW(it)}|${it.h}`;
    totals.set(key, (totals.get(key) ?? 0) + it.count);
  })));
  const items = Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}|${n}`);
  return [l.enclosure.key, l.enclosure.w, l.enclosure.h, l.bays.length, ...items].join(';');
}

export function cloneLayout(l: PanelLayout): PanelLayout {
  return {
    ...l,
    unplaced: [...l.unplaced],
    bays: l.bays.map((b) => ({ plate: { ...b.plate }, rows: b.rows.map((r) => ({ ...r, items: r.items.map((it) => ({ ...it })) })) })),
  };
}

/** Left / right limits for devices on a rail row (inside the vertical ducts). */
export function rowLimits(l: PanelLayout): { min: number; max: number } {
  const w = l.bays[0]?.plate.w ?? l.enclosure.w;
  return { min: DUCT_V_W + GAP, max: w - DUCT_V_W - GAP };
}

const needH = (it: Placed) => Math.max(ROW_MIN, it.h + 2 * GAP);

/**
 * Re-stack every bay: row heights from their tallest device (empty rows keep
 * theirs), rows one under the other with a duct above each, devices centred
 * vertically. Recomputes rail / duct lengths and whether it all fits.
 */
export function restack(l: PanelLayout): PanelLayout {
  const { min, max } = rowLimits(l);
  const problems: string[] = [];
  let rowNo = 0;
  l.bays.forEach((b, bi) => {
    let y = DUCT_H_H;
    b.rows.forEach((r) => {
      rowNo += 1;
      if (r.items.length) r.h = Math.max(...r.items.map(needH));
      r.y = y;
      r.items.sort((a, c) => a.x - c.x).forEach((it) => { it.y = r.y + (r.h - it.h) / 2; });
      y += r.h + DUCT_H_H;
      const end = r.items.length ? Math.max(...r.items.map((it) => it.x + it.w)) : 0;
      const start = r.items.length ? Math.min(...r.items.map((it) => it.x)) : min;
      if (end > max + 0.01 || start < min - 0.01) problems.push(`Row ${rowNo} runs past the ducts`);
    });
    if (y > b.plate.h + 0.01) problems.push(`Bay ${bi + 1}: rows are ${Math.round(y - b.plate.h)} mm taller than the mounting plate`);
  });
  const rowCount = l.bays.reduce((s, b) => s + b.rows.length, 0);
  const plateW = l.bays[0]?.plate.w ?? 0;
  const plateH = l.bays[0]?.plate.h ?? 0;
  const unplaced = l.unplaced.filter((u) => !/^Row \d+ runs|^Bay \d+: rows/.test(u));
  return {
    ...l,
    unplaced: [...unplaced, ...problems],
    fits: unplaced.length === 0 && problems.length === 0,
    rowCount,
    railMm: rowCount * (plateW - 2 * DUCT_V_W),
    ductHMm: l.bays.reduce((s, b) => s + (b.rows.length + 1) * (plateW - 2 * DUCT_V_W), 0),
    ductVMm: l.bays.length * 2 * plateH,
  };
}

/**
 * Lay a row's items out left to right without overlaps, keeping each one at
 * least where it was asked to go (`fixed` is placed first at its x), pushing
 * the others right — then, if the row overflows, back left. null = doesn't fit.
 */
function packRow(items: Placed[], fixed: Placed | null, min: number, max: number): Placed[] | null {
  const total = items.reduce((s, it) => s + it.w, 0);
  if (total > max - min + 0.01) return null;
  const sorted = [...items].sort((a, c) => (a.x + (a === fixed ? -0.001 : 0)) - (c.x + (c === fixed ? -0.001 : 0)));
  let end = min;
  sorted.forEach((it) => { it.x = Math.max(it.x, end); end = it.x + it.w; });
  // Overflow on the right → shift back left from the end.
  let limit = max;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const it = sorted[i];
    if (it.x + it.w > limit) it.x = limit - it.w;
    limit = it.x;
  }
  if (sorted.length && sorted[0].x < min - 0.01) return null;
  sorted.forEach((it) => { it.x = round(it.x); });
  return sorted;
}

const get = (l: PanelLayout, ref: ItemRef): Placed | undefined => l.bays[ref.bay]?.rows[ref.row]?.items[ref.item];

/**
 * Move an item to row `to` (same or another bay) with its left edge at `x`
 * (plate mm). Neighbours are pushed aside; a taller device grows the row.
 */
export function moveItem(l0: PanelLayout, ref: ItemRef, to: { bay: number; row: number }, x: number): EditResult {
  const l = cloneLayout(l0);
  const src = l.bays[ref.bay]?.rows[ref.row];
  const dst = l.bays[to.bay]?.rows[to.row];
  const it = src?.items[ref.item];
  if (!src || !dst || !it) return { layout: l0, error: 'Nothing to move there' };
  const { min, max } = rowLimits(l);
  src.items.splice(ref.item, 1);
  it.x = Math.min(Math.max(min, x), max - it.w);
  const packed = packRow([...dst.items, it], it, min, max);
  if (!packed) return { layout: l0, error: `No room for -${it.tag} in that row (${Math.round(it.w)} mm) — split the run or pick another row` };
  dst.items = packed;
  const out = restack(l);
  const tooTall = out.unplaced.find((u) => u.startsWith(`Bay ${to.bay + 1}: rows`));
  if (tooTall) return { layout: l0, error: `${tooTall} — -${it.tag} is too tall for that row` };
  return { layout: out };
}

/** Nudge an item left / right along its row by dx mm. */
export function nudgeItem(l: PanelLayout, ref: ItemRef, dx: number): EditResult {
  const it = get(l, ref);
  if (!it) return { layout: l, error: 'Nothing selected' };
  return moveItem(l, ref, { bay: ref.bay, row: ref.row }, it.x + dx);
}

/** Split a run after `first` units into two pieces side by side (each can then be moved). */
export function splitItem(l0: PanelLayout, ref: ItemRef, first: number): EditResult {
  const l = cloneLayout(l0);
  const r = l.bays[ref.bay]?.rows[ref.row];
  const it = r?.items[ref.item];
  if (!r || !it) return { layout: l0, error: 'Nothing selected' };
  const n = Math.round(first);
  if (it.count < 2 || n < 1 || n >= it.count) return { layout: l0, error: `Split -${it.tag} between 1 and ${it.count - 1}` };
  const u = it.w / it.count;
  const a: Placed = { ...it, count: n, w: round(n * u) };
  const b: Placed = { ...it, count: it.count - n, w: round((it.count - n) * u), x: round(it.x + n * u) };
  r.items.splice(ref.item, 1, a, b);
  return { layout: restack(l) };
}

/** Join two touching pieces of the same run back into one. */
export function joinWithNext(l0: PanelLayout, ref: ItemRef): EditResult {
  const l = cloneLayout(l0);
  const r = l.bays[ref.bay]?.rows[ref.row];
  if (!r) return { layout: l0, error: 'Nothing selected' };
  // Rows are kept sorted left to right (restack), so the next item is the neighbour.
  const i = ref.item;
  const a = r.items[i];
  const b = r.items[i + 1];
  if (!a || !b || a.tag !== b.tag || a.label !== b.label || unitW(a) !== unitW(b)) return { layout: l0, error: 'The next item in the row is not part of the same run' };
  const joined: Placed = { ...a, count: a.count + b.count, w: round(a.w + b.w) };
  r.items.splice(i, 2, joined);
  const { min, max } = rowLimits(l);
  const packed = packRow(r.items, joined, min, max);
  if (!packed) return { layout: l0, error: 'No room to join them' };
  r.items = packed;
  return { layout: restack(l) };
}

/** Add an empty rail row at the bottom of a bay. */
export function addRow(l0: PanelLayout, bay: number): EditResult {
  const l = cloneLayout(l0);
  const b = l.bays[bay];
  if (!b) return { layout: l0, error: 'No such bay' };
  const used = b.rows.reduce((y, r) => y + r.h + DUCT_H_H, DUCT_H_H);
  if (used + NEW_ROW_H + DUCT_H_H > b.plate.h) return { layout: l0, error: `Bay ${bay + 1} is full — no room for another rail row` };
  const row: Row = { y: used, h: NEW_ROW_H, items: [] };
  b.rows.push(row);
  return { layout: restack(l) };
}

/** Remove an empty rail row. */
export function removeRow(l0: PanelLayout, bay: number, row: number): EditResult {
  const r = l0.bays[bay]?.rows[row];
  if (!r) return { layout: l0, error: 'No such row' };
  if (r.items.length) return { layout: l0, error: 'Move the devices off the row first' };
  const l = cloneLayout(l0);
  l.bays[bay].rows.splice(row, 1);
  return { layout: restack(l) };
}

/** Which row a point (plate mm, in bay `bay`) is over — the row band plus half a duct above and below. */
export function rowAt(l: PanelLayout, bay: number, y: number): number {
  const rows = l.bays[bay]?.rows ?? [];
  return rows.findIndex((r) => y >= r.y - DUCT_H_H / 2 && y <= r.y + r.h + DUCT_H_H / 2);
}
