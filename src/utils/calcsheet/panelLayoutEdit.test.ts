import { DEFAULT_PANEL_INPUTS, configurePanel, emptyPanelIo, type PanelInputs } from './controlPanel';
import { DUCT_H_H, ENCLOSURES, frontView, layoutPanel, plateView, rowDetailViews, sideView, type LayoutGroup } from './panelLayout';
import { panelSheets, rowDetailSheets } from './panelDrawing';
import {
  addRow, joinWithNext, layoutSignature, moveItem, nudgeItem, removeRow, rowAt, rowLimits, splitItem,
} from './panelLayoutEdit';

const enc = (k: string) => ENCLOSURES.find((e) => e.key === k)!;
const g = (p: Partial<LayoutGroup> & Pick<LayoutGroup, 'tag' | 'label'>): LayoutGroup => ({ unitW: 5.2, unitH: 48.5, count: 1, splittable: true, zone: 'terminals', ...p });
const base = () => layoutPanel([
  g({ tag: 'Q0', label: 'Main breaker 2P', unitW: 35, unitH: 85, splittable: false, zone: 'power', kind: 'mcb' }),
  g({ tag: 'G', label: '24 V DC supply 10 A', unitW: 55, unitH: 125, splittable: false, zone: 'power' }),
  g({ tag: 'K', label: 'Interposing relays (DO)', unitW: 6, unitH: 94, count: 20, zone: 'relays', kind: 'relay' }),
  g({ tag: 'X2', label: 'DI terminals, 2-level', unitW: 5.2, unitH: 70, count: 40, kind: 'terminal2' }),
], enc('tekpan800'), 1);

describe('layout editor', () => {
  it('signature follows the devices, not where they are', () => {
    const l = base();
    const moved = moveItem(l, { bay: 0, row: 1, item: 1 }, { bay: 0, row: 0 }, 400).layout;
    const split = splitItem(l, { bay: 0, row: 1, item: 1 }, 15).layout;
    expect(layoutSignature(moved)).toBe(layoutSignature(l));
    expect(layoutSignature(split)).toBe(layoutSignature(l));
    const fewer = layoutPanel([g({ tag: 'X2', label: 'DI terminals, 2-level', count: 39, unitH: 70 })], enc('tekpan800'), 1);
    expect(layoutSignature(fewer)).not.toBe(layoutSignature(l));
  });

  it('moves a run to another row, pushing neighbours aside; the row grows for a taller device', () => {
    const l = base();
    // Row 1 = power (Q0, G), row 2 = relays + DI terminals.
    expect(l.bays[0].rows.map((r) => r.items.map((i) => i.tag))).toEqual([['Q0', 'G'], ['K', 'X2']]);
    const res = moveItem(l, { bay: 0, row: 1, item: 1 }, { bay: 0, row: 0 }, rowLimits(l).min);
    expect(res.error).toBeUndefined();
    const r0 = res.layout.bays[0].rows[0];
    expect(r0.items.map((i) => i.tag)).toEqual(['X2', 'Q0', 'G']);
    // No overlaps, all inside the ducts.
    r0.items.reduce((end, it) => { expect(it.x).toBeGreaterThanOrEqual(end - 0.01); return it.x + it.w; }, rowLimits(l).min);
    expect(Math.max(...r0.items.map((i) => i.x + i.w))).toBeLessThanOrEqual(rowLimits(l).max + 0.01);
    // Rows stay stacked with a duct between them.
    const [a, b] = res.layout.bays[0].rows;
    expect(b.y).toBeCloseTo(a.y + a.h + DUCT_H_H, 5);
  });

  it('refuses a move that does not fit the row', () => {
    const l = layoutPanel([g({ tag: 'X2', label: 'DI', count: 200, unitH: 70 })], enc('tekpan800'), 1);
    // Row 1 is full (107 terminals); the 93 on row 2 can't join it.
    const res = moveItem(l, { bay: 0, row: 1, item: 0 }, { bay: 0, row: 0 }, 100);
    expect(res.error).toMatch(/No room for -X2/);
    expect(res.layout).toBe(l);
  });

  it('nudges along the rail, clamped to the ducts', () => {
    const l = base();
    const right = nudgeItem(l, { bay: 0, row: 0, item: 0 }, 5000).layout;
    const q0 = right.bays[0].rows[0].items.find((i) => i.tag === 'Q0')!;
    expect(q0.x + q0.w).toBeLessThanOrEqual(rowLimits(l).max + 0.01);
  });

  it('splits a run into two pieces and joins them back', () => {
    const l = base();
    const split = splitItem(l, { bay: 0, row: 1, item: 0 }, 8);
    expect(split.error).toBeUndefined();
    const items = split.layout.bays[0].rows[1].items;
    expect(items.filter((i) => i.tag === 'K').map((i) => i.count)).toEqual([8, 12]);
    expect(splitItem(l, { bay: 0, row: 1, item: 0 }, 20).error).toMatch(/between 1 and 19/);
    const joined = joinWithNext(split.layout, { bay: 0, row: 1, item: 0 });
    expect(joined.error).toBeUndefined();
    expect(joined.layout.bays[0].rows[1].items.filter((i) => i.tag === 'K').map((i) => i.count)).toEqual([20]);
  });

  it('adds and removes rail rows; rail and duct lengths follow', () => {
    const l = base();
    const added = addRow(l, 0).layout;
    expect(added.rowCount).toBe(3);
    expect(added.railMm).toBeGreaterThan(l.railMm);
    expect(removeRow(added, 0, 0).error).toMatch(/Move the devices/);
    expect(removeRow(added, 0, 2).layout.rowCount).toBe(2);
    // A full bay takes no more rows.
    let full = l;
    for (let i = 0; i < 20; i++) { const r = addRow(full, 0); if (r.error) break; full = r.layout; }
    expect(addRow(full, 0).error).toMatch(/full/);
  });

  it('finds the row under a point', () => {
    const l = base();
    const r1 = l.bays[0].rows[1];
    expect(rowAt(l, 0, r1.y + 5)).toBe(1);
    expect(rowAt(l, 0, 5000)).toBe(-1);
  });

  it('Control Panel uses an edited layout while the devices are the same, and drops it when they change', () => {
    const io = { ...emptyPanelIo(), di: 16, dq: 8, distPoints: 2 };
    const inputs: PanelInputs = { ...DEFAULT_PANEL_INPUTS, enclosure: 'tekpan800', terminals: true, psuA: 10, psuQty: 1, io };
    const auto = configurePanel(inputs);
    expect(auto.layoutEdited).toBe(false);
    const edited = addRow(auto.layout, 0).layout;
    const withEdit = configurePanel({ ...inputs, layoutEdit: edited });
    expect(withEdit.layoutEdited).toBe(true);
    expect(withEdit.layout.rowCount).toBe(auto.layout.rowCount + 1);
    // One more rail row → more DIN rail on the BOM side.
    expect(withEdit.railLayoutMm).toBeGreaterThan(auto.railLayoutMm);
    // Change the I/O → the edit no longer matches and the auto layout is used.
    const changed = configurePanel({ ...inputs, io: { ...io, di: 17 }, layoutEdit: edited });
    expect(changed.layoutEdited).toBe(false);
  });
});

describe('row details', () => {
  it('draws every unit with its tag, numbered in mounting order across rows', () => {
    const views = rowDetailViews(base());
    const texts = views.flatMap((v) => v.shapes.filter((s) => s.t === 'text').map((s) => (s as { text: string }).text));
    expect(texts).toContain('K1');
    expect(texts).toContain('K20');
    // Terminals show their number on the terminal (the strip tag is in the run label).
    expect(texts).toContain('-X2  DI terminals, 2-level');
    expect(texts.filter((t) => t === '40')).toHaveLength(1);
    expect(texts).toContain('-Q0');
    // Every view fits the A3 width at 1:2.
    views.forEach((v) => expect(v.w).toBeLessThanOrEqual(720));
  });

  it('numbering carries on when a strip is split over rows', () => {
    const l = layoutPanel([g({ tag: 'X1', label: '24 V DC distribution', count: 150, kind: 'terminal' })], enc('tekpan800'), 1);
    const views = rowDetailViews(l);
    const texts = views.flatMap((v) => v.shapes.filter((s) => s.t === 'text').map((s) => (s as { text: string }).text));
    ['1', '107', '108', '150'].forEach((n) => expect(texts).toContain(n));
  });

  it('long rows split into parts and stack on A3 sheets at 1:2', () => {
    const l = layoutPanel([g({ tag: 'X1', label: 'Terminals', count: 200, kind: 'terminal' })], enc('tekpan1200'), 1);
    const views = rowDetailViews(l);
    expect(views.some((v) => /PART 1\/2/.test(v.title))).toBe(true);
    const sheets = rowDetailSheets(views);
    expect(sheets.length).toBeGreaterThan(0);
    sheets.forEach((s) => s.views.forEach((pv) => expect(pv.k).toBe(2)));
    expect(panelSheets(frontView(l), sideView(l), [plateView(l, 0)], views).length).toBe(sheets.length + 2);
  });
});
