import { ReportDoc, REPORT_ISSUERS, PAGE, CONTENT_WIDTH, formatLongDate, safeFileName, type ReportCompanyKey, type ReportSigner } from './reportPdfKit';

export interface CompletionCertificateData {
  reportCompany: ReportCompanyKey;
  projectName: string;
  projectNo: string;
  client: string;
  location?: string;
  /** The customer's PO number. */
  poNumber: string;
  /** Project start; shown in the timeline and the dates list when set. */
  startDate?: string;
  completionDate: string;
  approver: { name: string; designation?: string; company?: string };
  contractorRep: { name: string; designation?: string };
}

export interface ReportAssets {
  logoDataUrl?: string | null;
  bodyFontBase64?: string;
}

const BODY = 10.5;

/**
 * Certificate of Completion: a one-page letter — centred title, the certification, the project facts as aligned
 * "Label: value" lines, and the client's acceptance with both signatures at
 * the foot of the page. Spacing opens up on short certificates so the page
 * reads balanced rather than leaving a hole above the signatures.
 */
export function buildCompletionCertificatePdf(data: CompletionCertificateData, assets: ReportAssets = {}) {
  const issuer = REPORT_ISSUERS[data.reportCompany];
  const docNo = `${data.projectNo || 'COC'}-COC`;
  const completion = formatLongDate(data.completionDate) || '—';
  const start = formatLongDate(data.startDate);
  const po = data.poNumber.trim() || '—';
  const location = data.location?.trim();

  const details: [string, string][] = [['Project', data.projectName.trim() || '—'], ['Project No.', data.projectNo || '—'], ['Client', data.client.trim() || '—']];
  if (location) details.push(['Location', location]);
  details.push(['PO No.', po]);
  if (start) details.push(['Start Date', start]);
  details.push(['Completion Date', completion]);

  const signers: ReportSigner[] = [
    { label: 'Contractor', name: data.contractorRep.name, designation: data.contractorRep.designation, company: issuer.name, fields: [{ label: 'Date' }] },
    { label: 'Accepted by (Client)', name: data.approver.name, designation: data.approver.designation, company: data.approver.company, fields: [{ label: 'Date' }] },
  ];

  // `spread` = extra mm added at each of the gaps between blocks.
  const GAPS = 5;
  const render = (spread: number) => {
    const r = new ReportDoc({ bodyFontBase64: assets.bodyFontBase64 });
    const { doc } = r;

    r.y = 52 + spread;
    r.bold(24);
    const title = doc.splitTextToSize('Certificate of Completion', CONTENT_WIDTH) as string[];
    title.forEach((l, i) => doc.text(l, PAGE.width / 2, r.y + i * 10, { align: 'center' }));
    r.y += (title.length - 1) * 10 + 14 + spread;

    r.paragraph([
      { text: 'This is to certify that ' },
      { text: issuer.name, bold: true },
      { text: ' has completed all the work required under Purchase Order No. ' },
      { text: po, bold: true },
      { text: ' for the project below, in accordance with the agreed scope, technical specifications, and terms and conditions.' },
    ], BODY, { after: 5 + spread });

    r.details(details, 5 + spread, BODY);

    r.paragraph('All work was carried out in compliance with the relevant codes, regulations and standards. Inspections and tests have verified that all systems are functioning correctly and as intended.', BODY, { after: 4.5 });
    r.paragraph([
      { text: 'This certificate is issued on ' },
      { text: completion, bold: true },
      { text: ' as official documentation of the completion of the project.' },
    ], BODY, { after: 0 });
    const contentEnd = r.y;

    // Client acceptance + signatures sit at the foot of the page, as on a printed certificate.
    const leadIn = 'By signing below, the client confirms that the work is complete and that all deliverables have been received and accepted.';
    const footH = r.measureParagraph(leadIn, 9.5) + 3 + r.measureSignatures(signers);
    const sigTop = Math.max(r.y + 10 + spread, PAGE.contentBottom - footH - 2);
    r.y = sigTop;
    r.signatures(signers, { leadIn });

    // Same letterhead as the Progress Report; the title is in the body, the doc number in the footer.
    r.finish({ issuer, logoDataUrl: assets.logoDataUrl, title: '', meta: [], footer: docNo });
    return { doc: r.doc, free: sigTop - contentEnd };
  };

  let out = render(0);
  // Share the empty space evenly: the 4 gaps above the text end each grow by `spread`, and the
  // gap above the acceptance shrinks to 10 + spread, so no single hole is left above the signatures.
  const spread = Math.max(0, (out.free - 10) / GAPS);
  if (spread > 0.5) out = render(spread);
  return { doc: out.doc, filename: `${safeFileName(docNo)}.pdf` };
}
