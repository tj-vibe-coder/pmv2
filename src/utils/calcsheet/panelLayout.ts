// Control-panel layout + CAD-style drawing model.
//
// Enclosures are IOCT's standard ones: Tekpan floor-standing 2100H (incl.
// 100 mm plinth) × 800W or 1200W × 800D — joined side by side ("bays") when
// one isn't enough — and Tibox wall-mounted 1000H × 800W × 300D or
// 800H × 600W × 300D. Components are placed to scale on each bay's mounting
// plate in rows (power → controller → relays → terminals), with a vertical
// wireduct down both sides and a horizontal one between rows. The drawing
// model is in real millimetres; drawingSvg / panelDrawingPdf / panelDrawingDxf
// render it. Pure logic.

// ── Enclosures ────────────────────────────────────────────────────────────
export type EnclosureKey = 'tekpan800' | 'tekpan1200' | 'tibox1000' | 'tibox800' | 'custom';
export interface EnclosureSpec {
  key: EnclosureKey;
  label: string;
  brand: string;
  floor: boolean;
  w: number;
  h: number;
  d: number;
  /** Plinth height included in h (floor-standing). */
  plinth: number;
  /** Floor-standing enclosures can be joined side by side. */
  joinable: boolean;
}
export const ENCLOSURES: EnclosureSpec[] = [
  { key: 'tibox800', label: 'Tibox wall-mount 800H × 600W × 300D', brand: 'Tibox', floor: false, w: 600, h: 800, d: 300, plinth: 0, joinable: false },
  { key: 'tibox1000', label: 'Tibox wall-mount 1000H × 800W × 300D', brand: 'Tibox', floor: false, w: 800, h: 1000, d: 300, plinth: 0, joinable: false },
  { key: 'tekpan800', label: 'Tekpan floor-standing 2100H × 800W × 800D', brand: 'Tekpan', floor: true, w: 800, h: 2100, d: 800, plinth: 100, joinable: true },
  { key: 'tekpan1200', label: 'Tekpan floor-standing 2100H × 1200W × 800D', brand: 'Tekpan', floor: true, w: 1200, h: 2100, d: 800, plinth: 100, joinable: true },
];
export const MAX_BAYS = 6;

export function customEnclosure(w: number, h: number, d: number, floor: boolean): EnclosureSpec {
  return { key: 'custom', label: `Custom ${floor ? 'floor-standing' : 'wall-mount'} ${h}H × ${w}W × ${d}D`, brand: '', floor, w, h, d, plinth: floor ? 100 : 0, joinable: floor };
}

/** Mounting plate of one bay: about W − 100 wide, body height − 150 high. */
export function plateOf(e: EnclosureSpec): { w: number; h: number } {
  return { w: Math.max(0, e.w - 100), h: Math.max(0, e.h - e.plinth - 150) };
}

// ── Layout constants (mm) ─────────────────────────────────────────────────
export const DUCT_V_W = 60; // vertical duct 60 × 80, footprint 60 wide
export const DUCT_H_H = 40; // horizontal duct 40 × 60, footprint 40 high
export const GAP = 10; // clearance between a device row and the ducts / next item
export const ROW_MIN = 60;

/**
 * A run of identical devices (or a single one). Splittable runs (terminals,
 * relays, breakers) may break across rows / bays; others stay whole.
 */
export interface LayoutGroup {
  /** Tag prefix and the first number, e.g. 'X2' + start 1 → X2:1… */
  tag: string;
  label: string;
  unitW: number;
  unitH: number;
  count: number;
  splittable: boolean;
  /** Row zone: devices of a new zone start on a new row. */
  zone: 'power' | 'control' | 'relays' | 'terminals';
  /** What it is, for the unit-by-unit row-detail drawing (absent = a plain device block). */
  kind?: DeviceKind;
}

/** Device kinds drawn in detail on the row sheets. */
export type DeviceKind = 'terminal' | 'terminal2' | 'fuse' | 'terminalIn' | 'relay' | 'mcb' | 'device';

export interface Placed { tag: string; label: string; x: number; y: number; w: number; h: number; count: number; zone: LayoutGroup['zone']; kind?: DeviceKind }
export interface Row { y: number; h: number; items: Placed[] }
export interface BayLayout { plate: { w: number; h: number }; rows: Row[] }
export interface PanelLayout {
  enclosure: EnclosureSpec;
  bays: BayLayout[];
  /** Everything placed without overflowing a plate. */
  fits: boolean;
  /** Devices that couldn't be placed (wider than a row, or out of bays). */
  unplaced: string[];
  /** Total DIN rail and horizontal duct lengths used (mm), and the rows drawn. */
  railMm: number;
  ductHMm: number;
  ductVMm: number;
  rowCount: number;
}

/** Place the groups on `bays` plates of `enclosure`, top to bottom, left to right. */
export function layoutPanel(groups: LayoutGroup[], enclosure: EnclosureSpec, bays: number): PanelLayout {
  const plate = plateOf(enclosure);
  const usableW = plate.w - 2 * DUCT_V_W - 2 * GAP;
  const out: BayLayout[] = [];
  const unplaced: string[] = [];
  let bay: BayLayout = { plate, rows: [] };
  out.push(bay);
  let row = null as Row | null; // reassigned inside newRow()
  let x = 0;
  let zone: LayoutGroup['zone'] | null = null;

  const bottomOf = (r: Row) => r.y + r.h;
  const newRow = (h: number): boolean => {
    const y = row ? bottomOf(row) + DUCT_H_H : DUCT_H_H; // a duct above every row
    if (y + h + DUCT_H_H > plate.h) {
      if (out.length >= bays) return false;
      bay = { plate, rows: [] };
      out.push(bay);
      row = { y: DUCT_H_H, h, items: [] };
    } else row = { y, h, items: [] };
    bay.rows.push(row);
    x = 0;
    return true;
  };
  const rowH = (unitH: number) => Math.max(ROW_MIN, unitH + 2 * GAP);

  for (const g of groups) {
    if (g.count <= 0) continue;
    if (g.unitW > usableW) { unplaced.push(`${g.label} (${g.unitW} mm wide)`); continue; }
    const needH = rowH(g.unitH);
    let left = g.count;
    let n = 1;
    const fail = () => { unplaced.push(`${g.label}${g.count > 1 ? ` (${left} of ${g.count})` : ''}`); left = 0; };
    while (left > 0) {
      // A new zone (power → control → relays → terminals) starts on a new row —
      // except terminals, which carry on along the relays' rail.
      if (!row || (zone !== g.zone && !(zone === 'relays' && g.zone === 'terminals'))) {
        if (!newRow(needH)) { fail(); break; }
        zone = g.zone;
      }
      let r = row as Row;
      // A taller device grows the current (last) row if the plate still has room, else takes a new row.
      if (needH > r.h) {
        if (r.y + needH + DUCT_H_H <= plate.h) r.h = needH;
        else { if (!newRow(needH)) { fail(); break; } r = row as Row; }
      }
      const room = usableW - x;
      const fitN = g.splittable ? Math.min(left, Math.floor(room / g.unitW)) : (g.unitW <= room ? 1 : 0);
      if (fitN <= 0) { if (!newRow(needH)) { fail(); break; } continue; }
      r.items.push({
        tag: g.count > 1 && !g.splittable ? `${g.tag}${n}` : g.tag, label: g.label,
        x: DUCT_V_W + GAP + x, y: r.y + (r.h - g.unitH) / 2, w: fitN * g.unitW, h: g.unitH, count: fitN, zone: g.zone,
        ...(g.kind ? { kind: g.kind } : {}),
      });
      x += fitN * g.unitW + (g.splittable ? 0 : GAP);
      left -= fitN;
      n += 1;
    }
    if (g.splittable) x += GAP; // room for the end stop after a run
  }

  const rowCount = out.reduce((s, b) => s + b.rows.length, 0);
  return {
    enclosure, bays: out, fits: unplaced.length === 0, unplaced,
    railMm: rowCount * (plate.w - 2 * DUCT_V_W),
    ductHMm: out.reduce((s, b) => s + (b.rows.length + 1) * (plate.w - 2 * DUCT_V_W), 0),
    ductVMm: out.length * 2 * plate.h,
    rowCount,
  };
}

/** Smallest standard enclosure (and bay count) that fits: Tibox first, then Tekpan 800 / 1200 with as few bays as possible. */
export function autoEnclosure(groups: LayoutGroup[]): PanelLayout {
  const tries: [EnclosureKey, number][] = [['tibox800', 1], ['tibox1000', 1]];
  for (let b = 1; b <= MAX_BAYS; b++) tries.push(['tekpan800', b], ['tekpan1200', b]);
  let last: PanelLayout | null = null;
  for (const [k, b] of tries) {
    const e = ENCLOSURES.find((x) => x.key === k)!;
    const l = layoutPanel(groups, e, b);
    if (l.fits) return l;
    last = l;
  }
  return last!;
}

// ── Device sizes (mm, W × H on the plate) — planning figures from datasheets ──
// Change here when a datasheet says otherwise.
export const DIMS = {
  mcb2p: { w: 35, h: 85 },            // ABB S202 (2 × 17.5 mm modules)
  tbIn4: { w: 6.2, h: 58 },           // WAGO 2004-1201
  tbStd: { w: 5.2, h: 48.5 },         // WAGO 2002-1201 / 2002-1207
  tb2Level: { w: 5.2, h: 70 },        // WAGO 2002-2201 double-deck
  tbFuse: { w: 6.2, h: 75 },          // WAGO 2002-1611 fuse terminal
  relay: { w: 6, h: 94 },             // WAGO 857-304 slim relay
  thermostat: { w: 17.5, h: 60 },
  socket: { w: 45, h: 85 },
  psu: (a: number) => ({ w: a <= 2.5 ? 35 : a <= 5 ? 40 : a <= 10 ? 55 : a <= 20 ? 70 : 110, h: 125 }),
};

// ── Drawing model (real mm) ──────────────────────────────────────────────
export type Layer = 'OUTLINE' | 'PLATE' | 'DUCT' | 'RAIL' | 'DEVICE' | 'DIM' | 'TEXT' | 'HIDDEN';
export type Shape =
  | { t: 'rect'; layer: Layer; x: number; y: number; w: number; h: number; fill?: string }
  | { t: 'line'; layer: Layer; x1: number; y1: number; x2: number; y2: number; dash?: boolean }
  /** size and dy are in PAPER mm (the height it prints at, whatever the scale). */
  | { t: 'text'; layer: Layer; x: number; y: number; text: string; size: number; anchor?: 'start' | 'middle' | 'end'; rotate?: number; dy?: number }
  | { t: 'dim'; layer: 'DIM'; x1: number; y1: number; x2: number; y2: number; offset: number; text?: string };

/** A view: shapes in its own mm coordinates (y down), with its extent. */
export interface View { title: string; w: number; h: number; shapes: Shape[] }

const dimH = (x1: number, x2: number, y: number, offset: number, text?: string): Shape => ({ t: 'dim', layer: 'DIM', x1, y1: y, x2, y2: y, offset, text });
const dimV = (y1: number, y2: number, x: number, offset: number, text?: string): Shape => ({ t: 'dim', layer: 'DIM', x1: x, y1, x2: x, y2, offset, text });

/** Front view of the joined bays (doors closed), with overall dimensions. */
export function frontView(layout: PanelLayout): View {
  const e = layout.enclosure;
  const n = layout.bays.length;
  const W = e.w * n;
  const shapes: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const x = i * e.w;
    shapes.push({ t: 'rect', layer: 'OUTLINE', x, y: 0, w: e.w, h: e.h - e.plinth });
    // Doors: 2 leaves above 800 mm wide.
    const leaves = e.w > 800 ? 2 : 1;
    for (let l = 0; l < leaves; l++) {
      const lx = x + 20 + (l * (e.w - 40)) / leaves;
      const lw = (e.w - 40) / leaves - (leaves > 1 ? 4 : 0);
      shapes.push({ t: 'rect', layer: 'OUTLINE', x: lx, y: 20, w: lw, h: e.h - e.plinth - 40 });
      const hx = l === 0 && leaves === 2 ? lx + lw - 25 : lx + (leaves === 2 ? 15 : lw - 25);
      shapes.push({ t: 'rect', layer: 'OUTLINE', x: hx, y: (e.h - e.plinth) / 2 - 60, w: 10, h: 120 }); // handle
    }
    if (e.plinth) {
      shapes.push({ t: 'rect', layer: 'OUTLINE', x, y: e.h - e.plinth, w: e.w, h: e.plinth, fill: '#d9d9d9' });
    }
    if (n > 1) shapes.push({ t: 'text', layer: 'TEXT', x: x + e.w / 2, y: 0, dy: -2, text: `BAY ${i + 1}`, size: 3, anchor: 'middle' });
  }
  shapes.push(dimH(0, W, e.h, 120, `${W}`));
  if (n > 1) shapes.push(dimH(0, e.w, e.h, 60, `${e.w}`));
  shapes.push(dimV(0, e.h, W, 120, `${e.h}`));
  if (e.plinth) shapes.push(dimV(e.h - e.plinth, e.h, 0, -80, `${e.plinth}`)); // plinth, on the left so it clears the overall height
  return { title: `FRONT VIEW — ${n} × ${e.label}`, w: W, h: e.h, shapes };
}

/** Side view with the depth. */
export function sideView(layout: PanelLayout): View {
  const e = layout.enclosure;
  const shapes: Shape[] = [
    { t: 'rect', layer: 'OUTLINE', x: 0, y: 0, w: e.d, h: e.h - e.plinth },
    { t: 'line', layer: 'HIDDEN', x1: e.d - 40, y1: 0, x2: e.d - 40, y2: e.h - e.plinth, dash: true }, // mounting plate
  ];
  if (e.plinth) shapes.push({ t: 'rect', layer: 'OUTLINE', x: 0, y: e.h - e.plinth, w: e.d, h: e.plinth, fill: '#d9d9d9' });
  shapes.push(dimH(0, e.d, e.h, 120, `${e.d}`));
  shapes.push(dimV(0, e.h, e.d, 80, `${e.h}`));
  return { title: 'SIDE VIEW', w: e.d, h: e.h, shapes };
}

/** One bay's mounting plate: ducts, rails and the devices with their tags. */
export function plateView(layout: PanelLayout, bayIndex: number): View {
  const b = layout.bays[bayIndex];
  const { w, h } = b.plate;
  const shapes: Shape[] = [{ t: 'rect', layer: 'PLATE', x: 0, y: 0, w, h }];
  // Vertical ducts both sides.
  shapes.push({ t: 'rect', layer: 'DUCT', x: 0, y: 0, w: DUCT_V_W, h, fill: '#eeeeee' });
  shapes.push({ t: 'rect', layer: 'DUCT', x: w - DUCT_V_W, y: 0, w: DUCT_V_W, h, fill: '#eeeeee' });
  // A horizontal duct above each row and below the last.
  const ductY = [...b.rows.map((r) => r.y - DUCT_H_H), ...(b.rows.length ? [b.rows[b.rows.length - 1].y + b.rows[b.rows.length - 1].h] : [])];
  ductY.forEach((y) => shapes.push({ t: 'rect', layer: 'DUCT', x: DUCT_V_W, y, w: w - 2 * DUCT_V_W, h: DUCT_H_H, fill: '#eeeeee' }));
  b.rows.forEach((r) => {
    // DIN rail (35 mm) centred in the row.
    shapes.push({ t: 'rect', layer: 'RAIL', x: DUCT_V_W, y: r.y + r.h / 2 - 17.5, w: w - 2 * DUCT_V_W, h: 35, fill: '#f6f6f6' });
    r.items.forEach((it) => {
      shapes.push({ t: 'rect', layer: 'DEVICE', x: it.x, y: it.y, w: it.w, h: it.h, fill: ZONE_FILL[it.zone] });
      // Terminal / relay runs: division lines at least ~12 mm apart, so a run of
      // 5 mm terminals still reads as a strip (not a black bar) at 1:10.
      if (it.count > 1) {
        const unit = it.w / it.count;
        const step = Math.max(1, Math.ceil(12 / unit));
        for (let k = step; k < it.count; k += step) shapes.push({ t: 'line', layer: 'DEVICE', x1: it.x + k * unit, y1: it.y, x2: it.x + k * unit, y2: it.y + it.h });
      }
      // Device name inside blocks big enough to hold it (sized for ~1:10).
      if (it.count === 1 && it.w >= 50 && it.h >= 40) {
        const max = Math.floor(it.w / 8.5);
        const name = it.label.length > max ? `${it.label.slice(0, Math.max(3, max - 1))}…` : it.label;
        shapes.push({ t: 'text', layer: 'TEXT', x: it.x + it.w / 2, y: it.y + it.h / 2, dy: 0.6, text: name, size: 1.4, anchor: 'middle' });
      }
      const label = it.count > 1 ? `-${it.tag} (${it.count})` : `-${it.tag}`;
      if (it.w >= 20) shapes.push({ t: 'text', layer: 'TEXT', x: it.x + it.w / 2, y: it.y, dy: -0.8, text: label, size: 1.8, anchor: 'middle' });
      else shapes.push({ t: 'text', layer: 'TEXT', x: it.x + it.w / 2, y: it.y + it.h / 2, text: label, size: 1.5, anchor: 'middle', rotate: -90 });
    });
  });
  shapes.push(dimH(0, w, h, 60, `${w}`));
  shapes.push(dimV(0, h, w, 60, `${h}`));
  return { title: `MOUNTING PLATE — BAY ${bayIndex + 1} (${w} × ${h})`, w, h, shapes };
}

const ZONE_FILL: Record<LayoutGroup['zone'], string> = { power: '#fde2c8', control: '#d6e6fb', relays: '#fff3b0', terminals: '#dcefd8' };

// ── Terminal schedule ─────────────────────────────────────────────────────
export interface ScheduleRow { strip: string; terminal: string; fn: string; wire: string }

/** Terminal-by-terminal list for the I/O (channels numbered from 1 per type). */
export function terminalSchedule(io: { di: number; dq: number; a2: number; a4: number; distPoints: number }): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  rows.push({ strip: 'X0', terminal: '1', fn: '230 V AC incoming — L1', wire: '1.5 mm² white' });
  rows.push({ strip: 'X0', terminal: '2', fn: '230 V AC incoming — L2', wire: '1.5 mm² black' });
  for (let i = 1; i <= io.distPoints; i++) rows.push({ strip: 'X1', terminal: `${i}`, fn: `+24 V DC distribution ${i}`, wire: '0.5 mm² red' });
  for (let i = 1; i <= io.distPoints; i++) rows.push({ strip: 'X1', terminal: `${io.distPoints + i}`, fn: `0 V DC distribution ${i}`, wire: '0.5 mm² blue' });
  for (let i = 1; i <= io.di; i++) rows.push({ strip: 'X2', terminal: `${i}`, fn: `DI ${i} — signal (upper) / +24 V sensor feed (lower)`, wire: '0.5 mm² red' });
  for (let i = 1; i <= io.dq; i++) rows.push({ strip: `K${i}`, terminal: 'A1/A2 · 11-12-14', fn: `DO ${i} — interposing relay`, wire: '0.5 mm² red (A1) / blue (A2)' });
  let t = 1;
  for (let i = 1; i <= io.a2; i++) {
    rows.push({ strip: 'X3', terminal: `${t++}`, fn: `AI/AO ${i} (2-wire) — +24 V loop supply, fused`, wire: '0.5 mm² red' });
    rows.push({ strip: 'X3', terminal: `${t++}`, fn: `AI/AO ${i} (2-wire) — signal`, wire: '0.5 mm² red' });
  }
  for (let i = 1; i <= io.a4; i++) {
    const n = io.a2 + i;
    rows.push({ strip: 'X3', terminal: `${t++}`, fn: `AI/AO ${n} (4-wire) — +24 V supply, fused`, wire: '0.5 mm² red' });
    rows.push({ strip: 'X3', terminal: `${t++}`, fn: `AI/AO ${n} (4-wire) — 0 V supply, fused`, wire: '0.5 mm² blue' });
    rows.push({ strip: 'X3', terminal: `${t++}`, fn: `AI/AO ${n} (4-wire) — signal +`, wire: '0.5 mm² red' });
    rows.push({ strip: 'X3', terminal: `${t++}`, fn: `AI/AO ${n} (4-wire) — signal −`, wire: '0.5 mm² blue' });
  }
  rows.push({ strip: 'PE', terminal: '1–2', fn: 'Protective earth (PSU, rail / shields)', wire: '1.5 mm² green-yellow' });
  return rows;
}

/** Tags on the plate with what they are and how many (runs split over rows are added up). */
export function deviceList(layout: PanelLayout): { tag: string; description: string; qty: number }[] {
  const m = new Map<string, { tag: string; description: string; qty: number }>();
  layout.bays.forEach((b) => b.rows.forEach((r) => r.items.forEach((it) => {
    const key = `${it.tag}|${it.label}`;
    const e = m.get(key) ?? { tag: it.tag, description: it.label, qty: 0 };
    e.qty += it.count;
    m.set(key, e);
  })));
  return Array.from(m.values());
}

// ── Row detail (terminals, relays and devices drawn unit by unit, 1:2) ──────

/** Longest stretch of a row on one row-detail view (model mm) — fits A3 at 1:2. */
export const ROW_DETAIL_MAX = 700;

/**
 * Tag of the n-th unit of a run: terminals "X2:5", relays "K5", other runs
 * "Q1.2"; a single device keeps its tag.
 */
const TERMINAL_KINDS: DeviceKind[] = ['terminal', 'terminal2', 'fuse', 'terminalIn'];
export function unitTag(it: Placed, n: number, single: boolean): string {
  if (single) return it.tag;
  if (it.kind === 'relay' || /[A-Z]$/.test(it.tag)) return `${it.tag}${n}`;
  if (it.kind && TERMINAL_KINDS.includes(it.kind)) return `${it.tag}:${n}`;
  return `${it.tag}.${n}`;
}
/** Units of this run are numbered (terminals, relays, any run of more than one). */
const numbered = (it: Placed) => it.count > 1 || it.kind === 'relay' || (!!it.kind && TERMINAL_KINDS.includes(it.kind));

interface Unit { x: number; w: number; it: Placed; tag: string; first: boolean; last: boolean }

/** One unit drawn in detail, in row coordinates (y = 0 at the top of the row). */
function unitShapes(u: Unit, rowY: number): Shape[] {
  const { it } = u;
  const y = it.y - rowY;
  const h = it.h;
  const x = u.x;
  const w = u.w;
  const out: Shape[] = [{ t: 'rect', layer: 'DEVICE', x, y, w, h, fill: ZONE_FILL[it.zone] }];
  const line = (x1: number, y1: number, x2: number, y2: number): Shape => ({ t: 'line', layer: 'DEVICE', x1, y1, x2, y2 });
  const open = (cy: number, oh = 4): Shape => ({ t: 'rect', layer: 'DEVICE', x: x + 0.8, y: cy - oh / 2, w: Math.max(0.5, w - 1.6), h: oh, fill: '#ffffff' });
  const kind = it.kind ?? 'device';
  if (kind === 'terminal' || kind === 'terminalIn' || kind === 'fuse' || kind === 'terminal2') {
    // Push-in clamp openings top and bottom, operating slots beside them, marker in the middle.
    out.push(open(y + 6), open(y + h - 6));
    out.push(line(x + 0.8, y + 11, x + w - 0.8, y + 11), line(x + 0.8, y + h - 11, x + w - 0.8, y + h - 11));
    if (kind === 'terminal2') {
      // Double-deck: a second pair of clamps one step in, and the deck step.
      out.push(open(y + 17), open(y + h - 17));
      out.push(line(x, y + h / 2, x + w, y + h / 2));
    }
    if (kind === 'fuse') {
      // Fuse holder lever across the middle.
      out.push({ t: 'rect', layer: 'DEVICE', x: x + 0.6, y: y + h / 2 - 12, w: w - 1.2, h: 24, fill: '#f2f2f2' });
    }
    out.push({ t: 'text', layer: 'TEXT', x: x + w / 2, y: y + (kind === 'fuse' ? h / 2 - 15 : kind === 'terminal2' ? h / 2 - 7 : h / 2), text: u.tag.split(':').pop() || u.tag, size: 1.4, anchor: 'middle', rotate: -90, dy: 0.5 });
  } else if (kind === 'relay') {
    // Slim relay: base with coil / contact clamps, relay body, LED.
    out.push(open(y + 5), open(y + h - 5));
    out.push(line(x, y + 14, x + w, y + 14), line(x, y + h - 14, x + w, y + h - 14));
    out.push({ t: 'rect', layer: 'DEVICE', x: x + w / 2 - 1.2, y: y + 18, w: 2.4, h: 2.4, fill: '#f5b041' });
    out.push({ t: 'text', layer: 'TEXT', x: x + w / 2, y: y + h / 2 + 6, text: u.tag, size: 1.4, anchor: 'middle', rotate: -90, dy: 0.5 });
  } else if (kind === 'mcb') {
    out.push(line(x, y + 18, x + w, y + 18), line(x, y + h - 18, x + w, y + h - 18));
    out.push({ t: 'rect', layer: 'DEVICE', x: x + w / 2 - 4, y: y + h / 2 - 9, w: 8, h: 18, fill: '#ffffff' });
    out.push({ t: 'text', layer: 'TEXT', x: x + w / 2, y: y + 12, text: `-${u.tag}`, size: 1.6, anchor: 'middle' });
  } else {
    const max = Math.max(3, Math.floor(w / 4.5));
    const name = it.label.length > max ? `${it.label.slice(0, max - 1)}…` : it.label;
    if (w >= 25) {
      out.push({ t: 'text', layer: 'TEXT', x: x + w / 2, y: y + 8, text: `-${u.tag}`, size: 1.8, anchor: 'middle' });
      out.push({ t: 'text', layer: 'TEXT', x: x + w / 2, y: y + h / 2, text: name, size: 1.4, anchor: 'middle', dy: 0.5 });
    } else {
      out.push({ t: 'text', layer: 'TEXT', x: x + w / 2, y: y + h / 2, text: `-${u.tag} ${name}`, size: 1.4, anchor: 'middle', rotate: -90, dy: 0.5 });
    }
  }
  return out;
}

/**
 * Row-detail views: every rail row with its terminals, relays, breakers and
 * devices drawn unit by unit with their tags (numbered in mounting order
 * across the whole panel), the top-hat rail and an end stop after each run.
 * Rows longer than ROW_DETAIL_MAX are split into parts.
 */
export function rowDetailViews(layout: PanelLayout): View[] {
  const counters: Record<string, number> = {};
  const views: View[] = [];
  let rowNo = 0;
  layout.bays.forEach((b, bi) => b.rows.forEach((r) => {
    rowNo += 1;
    if (!r.items.length) return;
    // Units in mounting order (numbers continue across rows and bays).
    const units: Unit[] = [];
    [...r.items].sort((a, c) => a.x - c.x).forEach((it) => {
      const single = !numbered(it);
      const uw = it.w / it.count;
      for (let k = 0; k < it.count; k++) {
        let tag = it.tag;
        if (!single) { const key = it.tag; counters[key] = (counters[key] ?? 0) + 1; tag = unitTag(it, counters[key], false); }
        units.push({ x: it.x + k * uw, w: uw, it, tag, first: k === 0, last: k === it.count - 1 });
      }
    });
    // Split into parts no longer than ROW_DETAIL_MAX, at unit edges.
    const parts: Unit[][] = [];
    let cur: Unit[] = [];
    units.forEach((u) => {
      if (cur.length && u.x + u.w - cur[0].x > ROW_DETAIL_MAX) { parts.push(cur); cur = []; }
      cur.push(u);
    });
    if (cur.length) parts.push(cur);
    parts.forEach((part, pi) => {
      const x0 = Math.floor(part[0].x) - 5;
      const x1 = Math.ceil(part[part.length - 1].x + part[part.length - 1].w) + 12;
      const w = x1 - x0;
      const shapes: Shape[] = [];
      // Top-hat rail TS 35 × 7.5 across the part.
      const ry = r.h / 2 - 17.5;
      shapes.push({ t: 'rect', layer: 'RAIL', x: 0, y: ry, w, h: 35, fill: '#f6f6f6' });
      shapes.push({ t: 'line', layer: 'RAIL', x1: 0, y1: ry + 5, x2: w, y2: ry + 5 }, { t: 'line', layer: 'RAIL', x1: 0, y1: ry + 30, x2: w, y2: ry + 30 });
      part.forEach((u) => {
        unitShapes({ ...u, x: u.x - x0 }, r.y).forEach((s) => shapes.push(s));
        // Run label above the first unit, end stop after the last unit of a run.
        if (u.first && u.it.count > 1) shapes.push({ t: 'text', layer: 'TEXT', x: u.x - x0, y: u.it.y - r.y, dy: -1.2, text: `-${u.it.tag}  ${u.it.label}`, size: 1.8, anchor: 'start' });
        if (u.last && u.it.count > 1) shapes.push({ t: 'rect', layer: 'DEVICE', x: u.x - x0 + u.w + 0.5, y: r.h / 2 - 22, w: 6, h: 44, fill: '#9e9e9e' });
      });
      shapes.push({ t: 'dim', layer: 'DIM', x1: part[0].x - x0, y1: r.h, x2: part[part.length - 1].x + part[part.length - 1].w - x0, y2: r.h, offset: 14 });
      const of = parts.length > 1 ? ` — PART ${pi + 1}/${parts.length}` : '';
      views.push({ title: `ROW ${rowNo}${layout.bays.length > 1 ? ` (BAY ${bi + 1})` : ''}${of}`, w, h: r.h, shapes });
    });
  }));
  return views;
}
