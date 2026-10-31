import { ReportDoc, REPORT_ISSUERS, PAGE, CONTENT_WIDTH, formatLongDate, safeFileName, type ReportCompanyKey, type ReportSigner, type TextRun } from './reportPdfKit';

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
 * Certificate of Project Completion: a one-page letter — centred title, the
 * certification in prose with the key facts in bold, a dates list, and the
 * contractor and client signatures at the foot of the page.
 */
export function buildCompletionCertificatePdf(data: CompletionCertificateData, assets: ReportAssets = {}) {
  const issuer = REPORT_ISSUERS[data.reportCompany];
  const r = new ReportDoc({ bodyFontBase64: assets.bodyFontBase64 });
  const { doc } = r;
  const docNo = `${data.projectNo || 'COC'}-COC`;
  const completion = formatLongDate(data.completionDate) || '—';
  const start = formatLongDate(data.startDate);
  const po = data.poNumber.trim() || '—';
  const location = data.location?.trim();

  // Title
  r.y = 50;
  r.prose(22);
  const title = doc.splitTextToSize('Certificate of Project Completion', 120) as string[];
  title.forEach((l, i) => doc.text(l, PAGE.width / 2, r.y + i * 9.5, { align: 'center' }));
  r.y += (title.length - 1) * 9.5 + 15;

  // Reference line: PO (left), timeline (right) — stacked when they don't fit side by side.
  const pairWidth = (label: string, value: string) => {
    r.prose(BODY);
    const lw = doc.getTextWidth(`${label} `);
    r.bold(BODY);
    return { lw, w: lw + doc.getTextWidth(value) };
  };
  const pair = (label: string, value: string, x: number) => {
    const { lw } = pairWidth(label, value);
    r.prose(BODY);
    doc.text(`${label} `, x, r.y);
    r.bold(BODY);
    doc.text(value, x + lw, r.y);
  };
  const left: [string, string] = ['PO No.:', po];
  const right: [string, string] = start ? ['Project Timeline:', `${start} – ${completion}`] : ['Project No.:', data.projectNo || '—'];
  const leftW = pairWidth(...left).w;
  const rightW = pairWidth(...right).w;
  if (leftW + rightW + 10 <= CONTENT_WIDTH) {
    pair(...left, PAGE.margin);
    pair(...right, PAGE.width - PAGE.margin - rightW);
  } else {
    pair(...left, PAGE.margin);
    r.y += ReportDoc.lineHeight(BODY);
    pair(...right, PAGE.margin);
  }
  r.y += 12;

  const para = (runs: TextRun[] | string) => r.paragraph(runs, BODY, { after: 4.5 });
  para([
    { text: 'This Certificate of Project Completion is issued on ' },
    { text: completion, bold: true },
    { text: ' to confirm that ' },
    { text: issuer.name, bold: true },
    { text: ' has fully executed all the work required under Purchase Order No. ' },
    { text: po, bold: true },
    { text: ' for ' },
    { text: data.projectName, bold: true },
    ...(location ? [{ text: ', located at ' }, { text: location, bold: true }] : []),
    { text: ', for ' },
    { text: data.client, bold: true },
    { text: ', in accordance with all specified terms and conditions.' },
  ]);
  para([
    { text: issuer.name, bold: true },
    { text: ' has completed every aspect of the work and met all project requirements. The work was carried out in compliance with all relevant codes, regulations and standards, and inspections and tests have verified that all systems are functioning correctly and efficiently.' },
  ]);
  para('This certificate serves as official documentation that the project is complete and that all deliverables have been received and accepted by the client.');
  para('Issued as evidence of the project\'s completion.');

  r.gap(4);
  const dates: [string, string][] = [['Project No.', data.projectNo || '—']];
  if (start) dates.push(['Start Date', start]);
  dates.push(['Completion Date', completion]);
  dates.forEach(([label, value]) => r.paragraph([{ text: `${label}: ` }, { text: value, bold: true }], BODY, { after: 0.6 }));

  // Signatures sit at the foot of the page, as on a printed certificate.
  const signers: ReportSigner[] = [
    { label: 'Contractor', name: data.contractorRep.name, designation: data.contractorRep.designation, company: issuer.name, fields: [{ label: 'Date' }] },
    { label: 'Accepted by (Client)', name: data.approver.name, designation: data.approver.designation, company: data.approver.company, fields: [{ label: 'Date' }] },
  ];
  const sigH = r.measureSignatures(signers);
  r.y = Math.max(r.y + 10, PAGE.contentBottom - sigH - 2);
  r.signatures(signers);

  r.finish({ issuer, logoDataUrl: assets.logoDataUrl, title: 'Certificate of Project Completion', meta: [], docNo, letterhead: 'certificate' });
  return { doc: r.doc, filename: `${safeFileName(docNo)}.pdf` };
}
