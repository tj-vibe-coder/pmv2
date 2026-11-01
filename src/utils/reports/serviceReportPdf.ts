import type { RowInput } from 'jspdf-autotable';
import {
  ReportDoc, REPORT_ISSUERS, REPORT_COLORS, formatLongDate, safeFileName,
  type ReportCompanyKey, type ReportSigner, type ReportPhoto,
} from './reportPdfKit';
import type { ReportAssets } from './completionCertificatePdf';

export interface ServiceReportPhoto extends ReportPhoto {
  /** Activity row (0-based) the photo belongs to; -1 = Recommendations; undefined = general site photo. */
  activityIndex?: number;
}

export interface ServiceReportData {
  reportCompany: ReportCompanyKey;
  /** e.g. "IOCT-2610-014 - SR1"; printed in the footer as "IOCT-2610-014-SR1". */
  reportNo: string;
  /** Optional subject line, e.g. "Monthly Service Visit". */
  title?: string;
  projectName: string;
  projectNo: string;
  client: string;
  location?: string;
  poNumber: string;
  reportDate: string;
  coveredFrom?: string;
  coveredTo?: string;
  /** "HH:mm" (24 h) as entered. */
  startTime?: string;
  endTime?: string;
  activities: { activity: string; finding: string }[];
  recommendations: string;
  preparedBy: { name: string; designation?: string; company?: string };
  approvedBy: { name?: string; designation?: string; company?: string };
  photos: ServiceReportPhoto[];
  /** 'inline': photos follow the section they belong to; 'end': an annex after the signatures. */
  photoPlacement: 'inline' | 'end';
}

/** "13:30" → "1:30 PM"; anything else is returned as typed. */
const formatTime = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec((t || '').trim());
  if (!m) return (t || '').trim();
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "IOCT-2610-014 - SR1" → "IOCT-2610-014-SR1". */
export const serviceReportDocNo = (reportNo: string) => reportNo.trim().replace(/\s*-\s*/g, '-').replace(/\s+/g, '');

/**
 * Service Report, in the same letterhead / footer / plain-table style as the
 * Progress Report: details, the activities table, recommendations, then the
 * signatures. Photos go under their activity (inline) or in Annex A (end).
 */
export function buildServiceReportPdf(data: ServiceReportData, assets: ReportAssets = {}) {
  const issuer = REPORT_ISSUERS[data.reportCompany];
  const docNo = serviceReportDocNo(data.reportNo) || 'SR';
  const reportDate = formatLongDate(data.reportDate) || formatLongDate(new Date());

  const from = formatLongDate(data.coveredFrom);
  const to = formatLongDate(data.coveredTo);
  const covered = from && to && from !== to ? `${from} – ${to}` : from || to || reportDate;
  const start = formatTime(data.startTime);
  const end = formatTime(data.endTime);
  const time = start && end ? `${start} – ${end}` : start || end;

  const details: [string, string][] = [
    ['Project Name', data.projectName],
    ['Project No.', data.projectNo],
    ['Client', data.client],
  ];
  if (data.location?.trim()) details.push(['Location', data.location]);
  details.push(['PO Number', data.poNumber]);
  if (data.title?.trim()) details.push(['Subject', data.title]);
  details.push(['Date(s) Covered', covered]);
  if (time) details.push(['Time', time]);

  const signers: ReportSigner[] = [
    { label: 'Prepared by', name: data.preparedBy.name, designation: data.preparedBy.designation, company: data.preparedBy.company || issuer.name, fields: [{ label: 'Date' }] },
    { label: 'Approved by', name: data.approvedBy.name, designation: data.approvedBy.designation, company: data.approvedBy.company, fields: [{ label: 'Date' }] },
  ];

  const r = new ReportDoc({ bodyFontBase64: assets.bodyFontBase64 });
  const photoGroup = (title: string, photos: ServiceReportPhoto[]) => {
    if (photos.length === 0) return;
    r.heading(title, 80);
    r.photoGrid(photos);
    r.gap(2);
  };

  r.heading('Report Details', 30);
  r.details(details);

  const rows = data.activities.filter((a) => a.activity.trim() || a.finding.trim());
  const body: RowInput[] = rows.length > 0
    ? rows.map((a, i) => [String(i + 1), a.activity.trim() || '—', a.finding.trim() || '—'])
    : [[{ content: 'No activities listed', colSpan: 3, styles: { halign: 'center', textColor: REPORT_COLORS.ink } }]];
  r.heading('Activities Performed', 16);
  r.table({
    head: [['No.', 'Activity / Description', 'Findings / Results']],
    body,
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 'auto' },
    },
    didParseCell: (h) => {
      if (h.section === 'head' && h.column.index === 0) h.cell.styles.halign = 'center';
    },
  }, 7);

  const inline = data.photoPlacement === 'inline';
  if (inline) {
    // Activity numbers follow the printed table, which skips blank rows.
    rows.forEach((a, i) => {
      const src = data.activities.indexOf(a);
      photoGroup(`Photos: Activity ${i + 1}`, data.photos.filter((p) => p.activityIndex === src));
    });
    photoGroup('Site Photos', data.photos.filter((p) => p.activityIndex === undefined || (p.activityIndex >= 0 && !rows.includes(data.activities[p.activityIndex]))));
  }

  // Each typed line is its own paragraph, so numbered lists keep their line breaks.
  const remarks = data.recommendations.split('\n').map((l) => l.trim()).filter(Boolean);
  const remarksH = remarks.length > 0
    ? remarks.reduce((h, l) => h + r.measureParagraph(l, 9.5) + 1.5, 0) + 5.5
    : 22;
  const recPhotos = inline ? data.photos.filter((p) => p.activityIndex === -1) : [];
  // Keep the remarks, their first row of photos (if any) and the signatures on one page,
  // so the signatures are never left alone and the remarks never split from their photos.
  const photoRowH = recPhotos.length > 0 ? 8 + 84 + 2 : 0;
  const sigH = recPhotos.length > 2 ? 0 : r.measureSignatures(signers) + 2;
  r.ensure(8 + remarksH + photoRowH + sigH);
  r.heading('Recommendations and Remarks', 14);
  if (remarks.length > 0) remarks.forEach((l, i) => r.paragraph(l, 9.5, { after: i === remarks.length - 1 ? 7 : 1.5 }));
  else r.gap(22); // left blank to write in by hand
  photoGroup('Photos: Recommendations and Remarks', recPhotos);

  r.signatures(signers);

  if (!inline && data.photos.length > 0) {
    r.addPage();
    r.heading('Annex A: Site Photos', 80);
    r.photoGrid(data.photos);
  }

  r.finish({
    issuer,
    logoDataUrl: assets.logoDataUrl,
    title: 'Service Report',
    meta: [reportDate],
    footer: docNo,
  });
  return { doc: r.doc, filename: `${safeFileName(docNo)}.pdf` };
}
