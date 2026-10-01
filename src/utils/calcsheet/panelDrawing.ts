// Panel drawings: turns the layout views (panelLayout.ts) into plain
// primitives at a drawing scale, composes A3 sheets, and writes DXF (1:1,
// millimetres, one layer per kind) for AutoCAD. The PDF lives in
// panelDrawingPdf.ts, the on-screen preview in PanelDrawingPreview.tsx.

import type { Layer, Shape, View } from './panelLayout';

/** Primitives in MODEL mm (y down). Text height is in model mm here (paper size × scale). */
export type Prim =
  | { t: 'rect'; layer: Layer; x: number; y: number; w: number; h: number; fill?: string }
  | { t: 'line'; layer: Layer; x1: number; y1: number; x2: number; y2: number; dash?: boolean }
  | { t: 'text'; layer: Layer; x: number; y: number; text: string; h: number; anchor: 'start' | 'middle' | 'end'; rotate: number };

/** Standard drawing scales (1 : k). */
export const SCALES = [2, 5, 10, 15, 20, 25, 30, 40, 50];

/**
 * Expand a view at 1 : k — dimensions become extension lines, a dimension
 * line with 45° ticks and the value; text sizes (paper mm) become model mm.
 */
export function expandView(view: View, k: number): Prim[] {
  const out: Prim[] = [];
  const tick = 1.2 * k;       // 45° tick half-length, 1.2 mm on paper
  const ext = 1 * k;          // extension past the dimension line
  const txt = 2.5 * k;        // dimension text height
  view.shapes.forEach((s: Shape) => {
    if (s.t === 'rect' || s.t === 'line') { out.push(s); return; }
    if (s.t === 'text') {
      out.push({ t: 'text', layer: s.layer, x: s.x, y: s.y + (s.dy ?? 0) * k, text: s.text, h: s.size * k, anchor: s.anchor ?? 'start', rotate: s.rotate ?? 0 });
      return;
    }
    // Dimension
    const horizontal = s.y1 === s.y2;
    const value = s.text ?? `${Math.round(Math.hypot(s.x2 - s.x1, s.y2 - s.y1))}`;
    if (horizontal) {
      const y = s.y1 + s.offset;
      out.push({ t: 'line', layer: 'DIM', x1: s.x1, y1: s.y1 + k, x2: s.x1, y2: y + ext });
      out.push({ t: 'line', layer: 'DIM', x1: s.x2, y1: s.y2 + k, x2: s.x2, y2: y + ext });
      out.push({ t: 'line', layer: 'DIM', x1: s.x1, y1: y, x2: s.x2, y2: y });
      [s.x1, s.x2].forEach((x) => out.push({ t: 'line', layer: 'DIM', x1: x - tick, y1: y + tick, x2: x + tick, y2: y - tick }));
      out.push({ t: 'text', layer: 'DIM', x: (s.x1 + s.x2) / 2, y: y - 0.8 * k, text: value, h: txt, anchor: 'middle', rotate: 0 });
    } else {
      const x = s.x1 + s.offset;
      out.push({ t: 'line', layer: 'DIM', x1: s.x1 + k, y1: s.y1, x2: x + ext, y2: s.y1 });
      out.push({ t: 'line', layer: 'DIM', x1: s.x2 + k, y1: s.y2, x2: x + ext, y2: s.y2 });
      out.push({ t: 'line', layer: 'DIM', x1: x, y1: s.y1, x2: x, y2: s.y2 });
      [s.y1, s.y2].forEach((yy) => out.push({ t: 'line', layer: 'DIM', x1: x - tick, y1: yy + tick, x2: x + tick, y2: yy - tick }));
      out.push({ t: 'text', layer: 'DIM', x: x - 0.8 * k, y: (s.y1 + s.y2) / 2, text: value, h: txt, anchor: 'middle', rotate: -90 });
    }
  });
  return out;
}

/** Extent of a view incl. room for its dimensions and titles (model mm). */
export function viewBox(view: View, k: number): { x: number; y: number; w: number; h: number } {
  let x0 = 0;
  let y0 = 0;
  let x1 = view.w;
  let y1 = view.h;
  expandView(view, k).forEach((p) => {
    if (p.t === 'rect') { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h); }
    else if (p.t === 'line') { x0 = Math.min(x0, p.x1, p.x2); y0 = Math.min(y0, p.y1, p.y2); x1 = Math.max(x1, p.x1, p.x2); y1 = Math.max(y1, p.y1, p.y2); }
    else { y0 = Math.min(y0, p.y - p.h * 1.2); y1 = Math.max(y1, p.y + p.h * 0.4); x0 = Math.min(x0, p.x - p.h); x1 = Math.max(x1, p.x + p.h); }
  });
  const pad = 4 * k;
  return { x: x0 - pad, y: y0 - pad - 6 * k, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad + 6 * k };
}

// ── A3 sheets ─────────────────────────────────────────────────────────────
export const SHEET = { w: 420, h: 297, margin: 10 };

export interface PlacedView { view: View; k: number; ox: number; oy: number }
export interface Sheet { title: string; views: PlacedView[] }

/** Smallest standard scale at which the views fit side by side on one A3 sheet (k ≥ minK). */
export function sheetScale(views: View[], minK = 1): number {
  const availW = SHEET.w - 2 * SHEET.margin - 10;
  const availH = SHEET.h - 2 * SHEET.margin - 20;
  return SCALES.find((k) => k >= minK && views.reduce((s, v) => s + viewBox(v, k).w / k + 8, 0) <= availW
    && Math.max(...views.map((v) => viewBox(v, k).h / k)) <= availH) ?? SCALES[SCALES.length - 1];
}

/** Lay views out left to right on a sheet, all at one scale, vertically centred. */
export function composeSheet(title: string, views: View[]): Sheet {
  const k = sheetScale(views);
  const boxes = views.map((v) => viewBox(v, k));
  const totalW = boxes.reduce((s, b) => s + b.w / k, 0) + 8 * (views.length - 1);
  let cursor = (SHEET.w - totalW) / 2;
  const placed = views.map((v, i) => {
    const b = boxes[i];
    const oy = SHEET.margin + 12 + (SHEET.h - 2 * SHEET.margin - 12 - b.h / k) / 2;
    const p: PlacedView = { view: v, k, ox: cursor - b.x / k, oy: oy - b.y / k };
    cursor += b.w / k + 8;
    return p;
  });
  return { title, views: placed };
}

/** Scale of the row-detail sheets (1 : ROW_DETAIL_K). */
export const ROW_DETAIL_K = 2;

/**
 * Row-detail views stacked top to bottom at 1:2, as many per A3 sheet as fit
 * (views come from rowDetailViews, already split to fit the sheet width).
 */
export function rowDetailSheets(rows: View[], k = ROW_DETAIL_K): Sheet[] {
  const top = SHEET.margin + 14;
  const bottom = SHEET.h - SHEET.margin - 8;
  const pages: PlacedView[][] = [];
  let page: PlacedView[] = [];
  let y = top;
  rows.forEach((v) => {
    const b = viewBox(v, k);
    const h = b.h / k + 6; // + the view title under it
    if (page.length && y + h > bottom) { pages.push(page); page = []; y = top; }
    page.push({ view: v, k, ox: (SHEET.w - b.w / k) / 2 - b.x / k, oy: y - b.y / k });
    y += h + 4;
  });
  if (page.length) pages.push(page);
  return pages.map((views, i) => ({ title: pages.length > 1 ? `ROW DETAILS — TERMINALS, RELAYS & DEVICES (${i + 1}/${pages.length})` : 'ROW DETAILS — TERMINALS, RELAYS & DEVICES', views }));
}

/** Sheets: general arrangement (front + side), mounting plates (up to 3 bays per sheet), then the row details at 1:2. */
export function panelSheets(front: View, side: View, plates: View[], rows: View[] = []): Sheet[] {
  const sheets: Sheet[] = [composeSheet('GENERAL ARRANGEMENT', [front, side])];
  for (let i = 0; i < plates.length; i += 3) {
    const group = plates.slice(i, i + 3);
    sheets.push(composeSheet(plates.length > 3 ? `MOUNTING PLATE LAYOUT (${i / 3 + 1}/${Math.ceil(plates.length / 3)})` : 'MOUNTING PLATE LAYOUT', group));
  }
  return [...sheets, ...rowDetailSheets(rows)];
}

// ── DXF (AutoCAD R12, 1:1 millimetres) ───────────────────────────────────
const LAYER_COLOR: Record<Layer, number> = { OUTLINE: 7, PLATE: 8, DUCT: 9, RAIL: 8, DEVICE: 5, DIM: 1, TEXT: 7, HIDDEN: 8 };

/**
 * DXF of the views at 1:1 (mm), placed side by side in model space; text
 * and dimension ticks sized for plotting at 1 : plotK. y is flipped (DXF y up).
 */
export function panelDrawingDxf(views: View[], plotK = 10): string {
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), typeof v === 'number' ? (Math.round(v * 1000) / 1000).toString() : v);
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); g(70, 4); // millimetres
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  g(0, 'LTYPE'); g(2, 'HIDDEN'); g(70, 0); g(3, 'Hidden __ __ __'); g(72, 65); g(73, 2); g(40, 9.525); g(49, 6.35); g(49, -3.175);
  g(0, 'ENDTAB');
  const layers = Object.keys(LAYER_COLOR) as Layer[];
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
  layers.forEach((l) => { g(0, 'LAYER'); g(2, l); g(70, 0); g(62, LAYER_COLOR[l]); g(6, l === 'HIDDEN' ? 'HIDDEN' : 'CONTINUOUS'); });
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const line = (layer: Layer, x1: number, y1: number, x2: number, y2: number) => {
    g(0, 'LINE'); g(8, layer); g(10, x1); g(20, -y1); g(30, 0); g(11, x2); g(21, -y2); g(31, 0);
  };
  let ox = 0;
  views.forEach((v) => {
    const box = viewBox(v, plotK);
    const dx = ox - box.x;
    // View title under the view.
    g(0, 'TEXT'); g(8, 'TEXT'); g(10, dx + v.w / 2); g(20, -(v.h + 3.5 * plotK * 4)); g(30, 0); g(40, 3.5 * plotK); g(1, v.title); g(72, 1); g(11, dx + v.w / 2); g(21, -(v.h + 3.5 * plotK * 4)); g(31, 0);
    expandView(v, plotK).forEach((p) => {
      if (p.t === 'rect') {
        line(p.layer, dx + p.x, p.y, dx + p.x + p.w, p.y);
        line(p.layer, dx + p.x + p.w, p.y, dx + p.x + p.w, p.y + p.h);
        line(p.layer, dx + p.x + p.w, p.y + p.h, dx + p.x, p.y + p.h);
        line(p.layer, dx + p.x, p.y + p.h, dx + p.x, p.y);
      } else if (p.t === 'line') line(p.dash ? 'HIDDEN' : p.layer, dx + p.x1, p.y1, dx + p.x2, p.y2);
      else {
        const just = p.anchor === 'middle' ? 1 : p.anchor === 'end' ? 2 : 0;
        g(0, 'TEXT'); g(8, p.layer); g(10, dx + p.x); g(20, -p.y); g(30, 0); g(40, p.h); g(1, p.text);
        if (p.rotate) g(50, -p.rotate);
        if (just) { g(72, just); g(11, dx + p.x); g(21, -p.y); g(31, 0); }
      }
    });
    ox += box.w + 500;
  });
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\n') + '\n';
}
