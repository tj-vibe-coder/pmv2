import type { RowInput } from 'jspdf-autotable';
import { ReportDoc, REPORT_ISSUERS, REPORT_COLORS, PAGE, CONTENT_WIDTH, formatLongDate, type ReportCompanyKey, type ReportSigner } from './reportPdfKit';
import type { ReportAssets } from './completionCertificatePdf';

export interface DeliveryReceiptData {
  reportCompany: ReportCompanyKey;
  deliveryNoteNo: string;
  despatchDate: string;
  poNumber: string;
  shipTo: { name: string; address: string; contactName?: string; phone?: string; email?: string };
  invoiceTo: { name: string; address: string };
  items: { itemNo: number; description: string; partNo?: string; delivered: number; unit: string }[];
  dispatchedBy: { name?: string; date?: string };
  receivedBy: { name?: string; date?: string };
}

const ACKNOWLEDGEMENT = 'Received the above items in good order and condition.';

/**
 * Delivery Receipt. Line items paginate with the column header repeated and
 * rows never split. The acknowledgement + signatures sit at a fixed spot at the
 * foot of every page, so each page is signed and none can be swapped out later;
 * the space between the last item and that block is left blank for items written in by hand.
 */
export function buildDeliveryReceiptPdf(data: DeliveryReceiptData, assets: ReportAssets = {}) {
  const issuer = REPORT_ISSUERS[data.reportCompany];
  const drNo = data.deliveryNoteNo.trim() || 'DR';
  const date = formatLongDate(data.despatchDate) || '—';
  const rows = data.items.map((it) => [
    String(it.itemNo),
    // A part number, when given, goes on its own line under the description (no label).
    [it.description.trim() || '—', it.partNo?.trim() || ''].filter(Boolean).join('\n'),
    String(Number(it.delivered) || 0),
    it.unit.trim() || '—',
  ]);

  const signers: ReportSigner[] = [
    { label: 'Dispatched by', name: data.dispatchedBy.name, fields: [{ label: 'Date', value: formatLongDate(data.dispatchedBy.date) }] },
    { label: 'Received by', name: data.receivedBy.name, fields: [{ label: 'Date', value: formatLongDate(data.receivedBy.date) }] },
  ];

  const r = new ReportDoc({ bodyFontBase64: assets.bodyFontBase64 });
  // The foot of each page is kept for the acknowledgement + signatures.
  const footH = r.measureParagraph(ACKNOWLEDGEMENT, 9.5) + 3 + r.measureSignatures(signers) + 2;
  const tableBottom = PAGE.contentBottom - footH - 5;

  r.heading('Delivery Details', 24);
  r.details([
    ['DR Number', drNo],
    ['PO Number', data.poNumber.trim() || '—'],
    ['Dispatch Date', date],
  ]);

  // Ship To / Invoice To as two plain address blocks side by side.
  const ship = data.shipTo;
  const blocks = [
    { label: 'Ship To', lines: [ship.name || '—', ship.address || '—',
      ...(ship.contactName ? [`Attn: ${ship.contactName}`] : []),
      ...(ship.phone ? [`Mobile: ${ship.phone}`] : []),
      ...(ship.email ? [`Email: ${ship.email}`] : [])] },
    { label: 'Invoice To', lines: [data.invoiceTo.name || '—', data.invoiceTo.address || '—'] },
  ];
  const colW = CONTENT_WIDTH / 2 - 4;
  const lh = ReportDoc.lineHeight(9.5);
  // The company name (first line of each block) is bold.
  const wrapped = blocks.map((b) => b.lines.flatMap((l, li) => {
    if (li === 0) r.bold(9.5); else r.prose(9.5);
    return (r.doc.splitTextToSize(l, colW) as string[]).map((text) => ({ text, bold: li === 0 }));
  }));
  const blockH = lh + Math.max(...wrapped.map((w) => w.length)) * lh;
  r.ensure(blockH);
  blocks.forEach((b, i) => {
    const x = PAGE.margin + i * (CONTENT_WIDTH / 2);
    r.bold(9.5);
    r.doc.text(`${b.label}:`, x, r.y + lh * 0.72);
    wrapped[i].forEach((line, li) => {
      if (line.bold) r.bold(9.5); else r.prose(9.5);
      r.doc.text(line.text, x, r.y + lh * 0.72 + (li + 1) * lh);
    });
  });
  r.gap(blockH + 6);

  const body: RowInput[] = rows.length > 0 ? rows : [[{ content: 'No line items', colSpan: 4, styles: { halign: 'center', textColor: REPORT_COLORS.ink } }]];
  r.heading('Items Delivered', 16);
  const margin = { top: PAGE.contentTop, bottom: PAGE.height - tableBottom, left: PAGE.margin, right: PAGE.margin };
  const columnStyles = {
    0: { cellWidth: 16, halign: 'center' as const },
    1: { cellWidth: 'auto' as const },
    2: { cellWidth: 20, halign: 'right' as const },
    3: { cellWidth: 22, halign: 'center' as const },
  };
  r.table({
    head: [['Item #', 'Description', 'Qty', 'UOM']],
    body,
    margin,
    columnStyles,
    didParseCell: (h) => {
      if (h.section === 'head' && h.column.index !== 1) h.cell.styles.halign = h.column.index === 2 ? 'right' : 'center';
    },
  }, 0);

  for (let p = 1; p <= r.pageCount; p++) {
    r.doc.setPage(p);
    r.y = PAGE.contentBottom - footH;
    r.signatures(signers, { leadIn: ACKNOWLEDGEMENT });
  }
  r.finish({
    issuer,
    logoDataUrl: assets.logoDataUrl,
    title: 'Delivery Receipt',
    meta: [date],
    footer: drNo,
  });
  return { doc: r.doc, filename: `${drNo.replace(/\s/g, '_')}.pdf` };
}
