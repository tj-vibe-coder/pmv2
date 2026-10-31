import type { RowInput } from 'jspdf-autotable';
import { ReportDoc, REPORT_ISSUERS, REPORT_COLORS, PAGE, CONTENT_WIDTH, formatLongDate, type ReportCompanyKey, type ReportSigner } from './reportPdfKit';
import type { ReportAssets } from './completionCertificatePdf';

export interface DeliveryReceiptData {
  reportCompany: ReportCompanyKey;
  deliveryNoteNo: string;
  despatchDate: string;
  deliveryMethod: string;
  poNumber: string;
  shipTo: { name: string; address: string; contactName?: string; phone?: string; email?: string };
  invoiceTo: { name: string; address: string };
  items: { itemNo: number; description: string; delivered: number; unit: string }[];
  dispatchedBy: { name?: string; date?: string };
  receivedBy: { name?: string; date?: string; place?: string };
}

const ACKNOWLEDGEMENT = 'Received the above items in good order and condition.';

/**
 * Delivery Receipt. Line items paginate with the column header repeated; rows
 * never split, and the acknowledgement + signatures stay on one page with at
 * least the last few line items (never alone on an empty page).
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
    {
      label: 'Received by',
      name: data.receivedBy.name,
      fields: [{ label: 'Date', value: formatLongDate(data.receivedBy.date) }, { label: 'Place', value: data.receivedBy.place }],
    },
  ];

  // tailRows > 0 forces the last N line items onto the signature page.
  const render = (tailRows: number) => {
    const r = new ReportDoc({ bodyFontBase64: assets.bodyFontBase64 });

    r.details([
      ['DR Number', drNo, 'Dispatch Date', date],
      ['PO Number', data.poNumber.trim() || '—', 'Delivery Method', data.deliveryMethod.trim() || 'Physical'],
    ], 4);

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
    r.prose(9.5);
    const wrapped = blocks.map((b) => b.lines.flatMap((l) => r.doc.splitTextToSize(l, colW) as string[]));
    const blockH = lh + Math.max(...wrapped.map((w) => w.length)) * lh;
    r.ensure(blockH);
    blocks.forEach((b, i) => {
      const x = PAGE.margin + i * (CONTENT_WIDTH / 2);
      r.bold(9.5);
      r.doc.text(`${b.label}:`, x, r.y + lh * 0.72);
      r.prose(9.5);
      wrapped[i].forEach((line, li) => r.doc.text(line, x, r.y + lh * 0.72 + (li + 1) * lh));
    });
    r.gap(blockH + 6);

    const body: RowInput[] = rows.length > 0 ? rows : [[{ content: 'No line items', colSpan: 4, styles: { halign: 'center', textColor: REPORT_COLORS.ink } }]];
    const split = Math.max(0, body.length - tailRows);
    if (tailRows > 0 && split === 0) r.addPage();
    r.heading('Items Delivered', 16);
    const itemTable = (body: RowInput[]) => r.table({
      head: [['Item #', 'Description', 'Qty', 'UOM']],
      body,
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

    if (tailRows > 0 && split > 0) {
      itemTable(body.slice(0, split));
      r.addPage();
      itemTable(body.slice(split));
    } else {
      itemTable(body);
    }

    // The signature must share its page with at least 3 line items (or the whole table).
    const tailOnPage = r.lastTableRowsOnFinalPage;
    const multiPageTable = r.pageCount > 1;
    const broke = r.signatures(signers, { leadIn: ACKNOWLEDGEMENT });
    r.finish({
      issuer,
      logoDataUrl: assets.logoDataUrl,
      title: 'Delivery Receipt',
      meta: [`DR No.: ${drNo}`, `Date: ${date}`],
      docNo: drNo.replace(/\s/g, '-'),
    });
    return { doc: r.doc, signatureOrphaned: broke || (multiPageTable && tailOnPage < 3) };
  };

  let out = render(0);
  if (out.signatureOrphaned && rows.length > 0) out = render(Math.min(3, rows.length));
  return { doc: out.doc, filename: `${drNo.replace(/\s/g, '_')}.pdf` };
}
