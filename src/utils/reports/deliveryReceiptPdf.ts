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
  items: { itemNo: number; description: string; delivered: number; unit: string }[];
  dispatchedBy: { name?: string; date?: string };
  receivedBy: { name?: string; date?: string };
}

const ACKNOWLEDGEMENT = 'Received the above items in good order and condition.';

/**
 * Delivery Receipt. Line items paginate with the column header repeated and
 * rows never split. A one-page DR has the acknowledgement + signatures right
 * after the items; a longer DR repeats them at the foot of every page, so each
 * page is signed and no page can be swapped out afterwards.
 */
export function buildDeliveryReceiptPdf(data: DeliveryReceiptData, assets: ReportAssets = {}) {
  const issuer = REPORT_ISSUERS[data.reportCompany];
  const drNo = data.deliveryNoteNo.trim() || 'DR';
  const date = formatLongDate(data.despatchDate) || '—';
  const rows = data.items.map((it) => [
    String(it.itemNo),
    it.description.trim() || '—',
    String(Number(it.delivered) || 0),
    it.unit.trim() || '—',
  ]);

  const signers: ReportSigner[] = [
    { label: 'Dispatched by', name: data.dispatchedBy.name, fields: [{ label: 'Date', value: formatLongDate(data.dispatchedBy.date) }] },
    { label: 'Received by', name: data.receivedBy.name, fields: [{ label: 'Date', value: formatLongDate(data.receivedBy.date) }] },
  ];

  // everyPage: reserve the foot of each page for the acknowledgement + signatures.
  const render = (everyPage: boolean) => {
    const r = new ReportDoc({ bodyFontBase64: assets.bodyFontBase64 });
    const footH = everyPage ? r.measureParagraph(ACKNOWLEDGEMENT, 9.5) + 3 + r.measureSignatures(signers) + 2 : 0;

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
    r.table({
      head: [['Item #', 'Description', 'Qty', 'UOM']],
      body,
      margin: { top: PAGE.contentTop, bottom: PAGE.height - PAGE.contentBottom + (everyPage ? footH + 5 : 0), left: PAGE.margin, right: PAGE.margin },
      columnStyles: {
        0: { cellWidth: 16, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 22, halign: 'center' },
      },
      didParseCell: (h) => {
        if (h.section === 'head' && h.column.index !== 1) h.cell.styles.halign = h.column.index === 2 ? 'right' : 'center';
      },
    }, 6);

    if (everyPage) {
      for (let p = 1; p <= r.pageCount; p++) {
        r.doc.setPage(p);
        r.y = PAGE.contentBottom - footH;
        r.signatures(signers, { leadIn: ACKNOWLEDGEMENT });
      }
    } else {
      r.signatures(signers, { leadIn: ACKNOWLEDGEMENT });
    }
    r.finish({
      issuer,
      logoDataUrl: assets.logoDataUrl,
      title: 'Delivery Receipt',
      meta: [date],
      footer: drNo,
    });
    return r.doc;
  };

  let doc = render(false);
  if (doc.getNumberOfPages() > 1) doc = render(true);
  return { doc, filename: `${drNo.replace(/\s/g, '_')}.pdf` };
}
