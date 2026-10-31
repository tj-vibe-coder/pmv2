import { ReportDoc, REPORT_ISSUERS, formatLongDate, safeFileName, type ReportCompanyKey, type TextRun } from './reportPdfKit';

export interface CompletionCertificateData {
  reportCompany: ReportCompanyKey;
  projectName: string;
  projectNo: string;
  client: string;
  location?: string;
  /** The customer's PO number. */
  poNumber: string;
  completionDate: string;
  approver: { name: string; designation?: string; company?: string };
  contractorRep: { name: string; designation?: string };
}

export interface ReportAssets {
  logoDataUrl?: string | null;
  bodyFontBase64?: string;
}

const QA_TEXT = 'All work has been completed to the highest standards of quality and in compliance with all relevant codes, regulations, and standards. Inspections and tests have been conducted to verify that all systems are functioning correctly and efficiently.';
const ACCEPTANCE_TEXT = 'By signing below, the client acknowledges that the project has been completed to their satisfaction and that all deliverables have been received and accepted.';

export function buildCompletionCertificatePdf(data: CompletionCertificateData, assets: ReportAssets = {}) {
  const issuer = REPORT_ISSUERS[data.reportCompany];
  const r = new ReportDoc({ bodyFontBase64: assets.bodyFontBase64 });
  const docNo = `${data.projectNo || 'COC'}-COC`;
  const completion = formatLongDate(data.completionDate) || '—';

  r.heading('Project Information', 24);
  const rows: [string, string][] = [['Project Title', data.projectName], ['Project No.', data.projectNo], ['Client', data.client]];
  if (data.location?.trim()) rows.push(['Location', data.location.trim()]);
  rows.push(['PO Number', data.poNumber], ['Contractor', issuer.name], ['Completion Date', completion]);
  r.details(rows);

  r.heading('Certification');
  const statement: TextRun[] = [
    { text: `This is to certify that ${issuer.name} has completed the services for the project ` },
    { text: data.projectName, bold: true },
    { text: ' under Purchase Order No. ' },
    { text: data.poNumber, bold: true },
    { text: ` on ${completion}, in accordance with the project requirements.` },
  ];
  r.paragraph(statement, 10, { after: 5 });

  r.heading('Quality Assurance');
  r.paragraph(QA_TEXT, 10, { after: 5 });

  // Client Acceptance heading + statement + signatures stay together.
  const signers = [
    { label: 'Approved by (Client)', name: data.approver.name, designation: data.approver.designation, company: data.approver.company, fields: [{ label: 'Date' }] },
    { label: 'Contractor Representative', name: data.contractorRep.name, designation: data.contractorRep.designation, company: issuer.name, fields: [{ label: 'Date' }] },
  ];
  r.ensure(9 + r.measureParagraph(ACCEPTANCE_TEXT, 10) + 5 + r.measureSignatures(signers));
  r.heading('Client Acceptance', 0);
  r.paragraph(ACCEPTANCE_TEXT, 10, { after: 5 });
  r.signatures(signers);

  r.finish({
    issuer,
    logoDataUrl: assets.logoDataUrl,
    title: 'Certificate of Completion',
    meta: [`Doc. No.: ${docNo}`, `Date: ${completion}`],
    docNo,
  });
  return { doc: r.doc, filename: `${safeFileName(docNo)}.pdf` };
}
