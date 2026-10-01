// Panel drawings → PDF (A3 landscape, no title block): the general
// arrangement and mounting-plate sheets drawn to scale, then the device list,
// terminal schedule and bill of materials as tables.

import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Layer } from './panelLayout';
import type { ScheduleRow } from './panelLayout';
import { SHEET, expandView, viewBox, type Sheet } from './panelDrawing';

const LINE_MM: Record<Layer, number> = { OUTLINE: 0.5, PLATE: 0.35, DUCT: 0.18, RAIL: 0.18, DEVICE: 0.25, DIM: 0.13, TEXT: 0.13, HIDDEN: 0.18 };
const PT_PER_MM = 2.835;

export interface DeviceRow { tag: string; description: string; qty: number }
export interface BomRow { qty: number; uom: string; description: string; partNo: string; brand: string }

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function drawSheet(doc: jsPDF, sheet: Sheet, note?: string) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(SHEET.margin, SHEET.margin, SHEET.w - 2 * SHEET.margin, SHEET.h - 2 * SHEET.margin);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(sheet.title, SHEET.margin + 4, SHEET.margin + 7);
  sheet.views.forEach(({ view, k, ox, oy }) => {
    const X = (x: number) => ox + x / k;
    const Y = (y: number) => oy + y / k;
    expandView(view, k).forEach((p) => {
      doc.setLineWidth(LINE_MM[p.layer]);
      doc.setDrawColor(p.layer === 'DIM' ? 40 : 0);
      if (p.t === 'rect') {
        if (p.fill) { doc.setFillColor(...hex(p.fill)); doc.rect(X(p.x), Y(p.y), p.w / k, p.h / k, 'FD'); } else doc.rect(X(p.x), Y(p.y), p.w / k, p.h / k);
      } else if (p.t === 'line') {
        if (p.dash) doc.setLineDashPattern([2, 1], 0);
        doc.line(X(p.x1), Y(p.y1), X(p.x2), Y(p.y2));
        if (p.dash) doc.setLineDashPattern([], 0);
      } else {
        doc.setFont('helvetica', p.layer === 'DIM' ? 'normal' : 'normal');
        doc.setFontSize((p.h / k) * PT_PER_MM);
        doc.text(p.text, X(p.x), Y(p.y), { align: p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left', angle: -p.rotate });
      }
    });
    // View title + scale under the view, below its dimensions.
    const box = viewBox(view, k);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`${view.title}   SCALE 1:${k}`, X(view.w / 2), Y(box.y + box.h) + 2, { align: 'center' });
  });
  if (note) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(note, SHEET.margin + 4, SHEET.h - SHEET.margin - 4);
  }
}

export function panelDrawingPdf(opts: {
  heading: string;
  sheets: Sheet[];
  devices: DeviceRow[];
  schedule: ScheduleRow[];
  bom: BomRow[];
}): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const note = 'All dimensions in mm. Device sizes are planning figures from manufacturer datasheets — verify before fabrication.';
  opts.sheets.forEach((s, i) => {
    if (i > 0) doc.addPage('a3', 'landscape');
    drawSheet(doc, s, note);
  });
  const table = (title: string, head: string[], body: (string | number)[][]) => {
    doc.addPage('a3', 'landscape');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${title} — ${opts.heading}`, SHEET.margin + 4, SHEET.margin + 7);
    autoTable(doc, {
      startY: SHEET.margin + 12, head: [head], body, theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [44, 62, 102] },
      margin: { left: SHEET.margin + 4, right: SHEET.margin + 4 },
    });
  };
  table('DEVICE LIST', ['Tag', 'Description', 'Qty'], opts.devices.map((d) => [`-${d.tag}`, d.description, d.qty]));
  table('TERMINAL SCHEDULE', ['Strip', 'Terminal', 'Function', 'Wire'], opts.schedule.map((r) => [r.strip, r.terminal, r.fn, r.wire]));
  table('BILL OF MATERIALS', ['#', 'Qty', 'UOM', 'Description', 'Brand', 'Part no.'], opts.bom.map((b, i) => [i + 1, b.qty, b.uom, b.description, b.brand, b.partNo || '—']));
  return doc;
}
