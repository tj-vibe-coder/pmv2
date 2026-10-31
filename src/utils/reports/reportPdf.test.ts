import jsPDF from 'jspdf';
import { buildDeliveryReceiptPdf, type DeliveryReceiptData } from './deliveryReceiptPdf';
import { buildProgressReportPdf, type ProgressReportData } from './progressReportPdf';
import { buildCompletionCertificatePdf } from './completionCertificatePdf';
import { formatLongDate } from './reportPdfKit';
import { PDFDocument } from 'pdf-lib';
import { appendPdfs } from './scheduleAnnex';

// Without a body font every string is drawn in Helvetica, so it shows up as
// plain "(text) Tj" operators in the page content stream.
const pageText = (doc: jsPDF, page: number): string => {
  const pages = (doc.internal as unknown as { pages: string[][] }).pages;
  return (pages[page] || [])
    .join('\n')
    .match(/\((?:\\.|[^\\)])*\) Tj/g)?.map((t) => t.slice(1, -4)).join(' ') ?? '';
};

const drData = (n: number, longEvery = 0): DeliveryReceiptData => ({
  reportCompany: 'IOCT',
  deliveryNoteNo: 'DR-0042',
  despatchDate: '2026-10-30',
  deliveryMethod: 'Company vehicle',
  poNumber: '4500123987',
  shipTo: { name: 'Analog Devices Inc.', address: 'Gateway Business Park, General Trias, Cavite', contactName: 'Maria Santos' },
  invoiceTo: { name: 'Analog Devices Inc.', address: 'Gateway Business Park, General Trias, Cavite' },
  items: Array.from({ length: n }, (_, i) => ({
    itemNo: i + 1,
    description: longEvery && i % longEvery === 0
      ? `Item ${i + 1} — panel component delivered complete with manufacturer's test certificate, installation manual and calibration report`
      : `Item ${i + 1} — terminal block 2.5 mm2 feed-through`,
    delivered: 2,
    unit: 'pcs',
  })),
  dispatchedBy: { name: 'Renzel Ramos', date: '2026-10-30' },
  receivedBy: {},
});

const prData = (sections: number, perSection: number, approvers: number, photos = 0): ProgressReportData => {
  const rows: ProgressReportData['rows'] = [];
  const leaf = 100 / (sections * perSection);
  for (let s = 1; s <= sections; s++) {
    rows.push({ code: String(s), name: `Section ${s}`, weight: leaf * perSection, progress: 50, isParent: true, level: 0 });
    for (let c = 1; c <= perSection; c++) rows.push({ code: `${s}.${c}`, name: `Deliverable ${s}.${c}`, weight: leaf, progress: 50, isParent: false, level: 1 });
  }
  return {
    reportCompany: 'IOCT',
    projectName: 'Booster Pump PLC Upgrade',
    projectNo: 'IOCT-2610-014',
    poNumber: '4500123987',
    client: 'Analog Devices Inc.',
    location: 'General Trias, Cavite',
    reportDate: '10/31/2026',
    pbNumber: '03',
    rows,
    totalWeight: 100,
    overallProgress: 50,
    preparedBy: { name: 'Tyrone James Caballero', designation: 'General Manager' },
    approvers: Array.from({ length: approvers }, (_, i) => ({ name: `Approver ${i + 1}`, designation: 'Manager', company: 'Client Co.' })),
    photos: Array.from({ length: photos }, (_, i) => ({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=', width: 4, height: 3, caption: `Photo ${i + 1}` })),
  };
};

/** Every page carries the letterhead title and a correct "Page X of Y". */
const expectFramed = (doc: jsPDF, title: string) => {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    const text = pageText(doc, p);
    expect(text).toContain(title);
    expect(text).toContain(`Page ${p} of ${total}`);
  }
};

/** Item labels ("Item 12 —" / "Deliverable 3.2") on a page. */
const rowsOn = (doc: jsPDF, page: number, re: RegExp) => pageText(doc, page).match(re)?.length ?? 0;

describe('report PDFs', () => {
  it('formats report dates', () => {
    expect(formatLongDate('2026-10-30')).toBe('October 30, 2026');
    expect(formatLongDate('10/31/2026')).toBe('October 31, 2026');
    expect(formatLongDate('')).toBe('');
    expect(formatLongDate('not a date')).toBe('not a date');
  });

  it.each([3, 18, 26, 30, 64])('Delivery Receipt with %i items: framed pages, signatures never orphaned', (n) => {
    const { doc, filename } = buildDeliveryReceiptPdf(drData(n, 7));
    expect(filename).toBe('DR-0042.pdf');
    expectFramed(doc, 'DELIVERY RECEIPT');
    const last = doc.getNumberOfPages();
    expect(pageText(doc, last)).toContain('Dispatched by:');
    // The signature page always carries line items (at least the last 3, or all of them).
    expect(rowsOn(doc, last, /Item \d+ /g)).toBeGreaterThanOrEqual(Math.min(3, n));
    expect(pageText(doc, last)).toContain(`Item ${n} `);
    // Every item appears exactly once across the document.
    let seen = 0;
    for (let p = 1; p <= last; p++) seen += rowsOn(doc, p, /Item \d+ /g);
    expect(seen).toBe(n);
  });

  it.each([
    [1, 4, 1, 0],
    [4, 4, 2, 2],
    [8, 8, 3, 5],
    [5, 6, 3, 0],
  ])('Progress Report %i×%i with %i approver(s), %i photo(s): signatures stay with WBS rows', (sections, per, approvers, photos) => {
    const { doc, filename } = buildProgressReportPdf(prData(sections, per, approvers, photos));
    expect(filename).toBe('IOCT-2610-014-PB-03.pdf');
    expectFramed(doc, 'PROGRESS REPORT');
    const total = doc.getNumberOfPages();
    let sigPage = 0;
    for (let p = 1; p <= total; p++) if (pageText(doc, p).includes('Prepared by:')) sigPage = p;
    expect(sigPage).toBeGreaterThan(0);
    // Rows + the Total row share the signature page.
    expect(rowsOn(doc, sigPage, /Deliverable \d+\.\d+|Total/g)).toBeGreaterThanOrEqual(3);
    // Photos go in an annex that starts on the page after the signatures.
    const annexPage = sigPage + (photos > 0 ? 1 : 0);
    expect(total).toBeGreaterThanOrEqual(annexPage);
    expect(total === sigPage).toBe(photos === 0);
    expect(pageText(doc, annexPage).includes('Annex A')).toBe(photos > 0);
  });

  it('appends the Work Schedule PDF after the report pages', async () => {
    const { doc } = buildProgressReportPdf(prData(2, 3, 1, 1));
    const reportPages = doc.getNumberOfPages();
    const gantt = new jsPDF({ orientation: 'landscape', format: 'a3' });
    gantt.addPage('a3', 'landscape');
    const merged = await PDFDocument.load(await appendPdfs(doc.output('arraybuffer'), [new Uint8Array(gantt.output('arraybuffer'))]));
    expect(merged.getPageCount()).toBe(reportPages + 2);
    // Attached pages keep their own size (A3 landscape), report pages stay A4.
    expect(Math.round(merged.getPage(0).getWidth())).toBe(595);
    expect(Math.round(merged.getPage(reportPages).getWidth())).toBe(1191);
  });

  it('Certificate of Completion fits one page even with long text', () => {
    const long = 'Supply, Installation, Testing and Commissioning of PLC-Based Water Treatment Plant Automation and SCADA System — Phase 2';
    const { doc, filename } = buildCompletionCertificatePdf({
      reportCompany: 'ACT',
      projectName: long,
      projectNo: 'IOCT-2610-014',
      client: 'Analog Devices Inc.',
      poNumber: '4500123987',
      location: 'Gateway Business Park, General Trias, Cavite',
      startDate: '2026-08-03',
      completionDate: '2026-10-28',
      approver: { name: 'Engr. Maria Cristina Dela Paz-Santos', designation: 'Senior Facilities and Utilities Engineering Manager', company: 'Analog Devices Inc.' },
      contractorRep: { name: 'Tyrone James Caballero', designation: 'General Manager' },
    });
    expect(filename).toBe('IOCT-2610-014-COC.pdf');
    expect(doc.getNumberOfPages()).toBe(1);
    const text = pageText(doc, 1);
    expect(text).toContain('Certificate of Project');
    expect(text).toContain('PO No.:');
    expect(text).not.toContain('ACTI PO');
    expect(text).not.toMatch(/payment|balance/i);
    // Both signatures, with the dates list above them.
    expect(text).toContain('Contractor:');
    expect(text).toContain('Accepted by \\(Client\\):');
    expect(text).toContain('Completion Date: ');
  });
});
