import type { RowInput } from 'jspdf-autotable';
import {
  ReportDoc, REPORT_ISSUERS, REPORT_COLORS, PAGE, CONTENT_WIDTH, formatLongDate, safeFileName,
  type ReportCompanyKey, type ReportSigner,
} from './reportPdfKit';
import type { ReportAssets } from './completionCertificatePdf';
import { drawGanttAnnex, drawSCurveAnnex, type ReportSchedule } from './scheduleAnnex';

export interface ProgressReportRow {
  code: string;
  name: string;
  weight: number;
  progress: number;
  /** Has child rows — shown bold/shaded, and listed in the summary table. */
  isParent: boolean;
  /** 0 = top level, 1 = child, … (indents the deliverable name). */
  level: number;
}

export interface ProgressReportPhoto {
  dataUrl: string;
  /** Pixel size, used to fit the photo without distortion. */
  width: number;
  height: number;
  caption?: string;
}

export interface ProgressReportData {
  reportCompany: ReportCompanyKey;
  projectName: string;
  projectNo: string;
  poNumber: string;
  client: string;
  location: string;
  reportDate: string;
  /** Two-digit progress billing number, e.g. "05". */
  pbNumber: string;
  rows: ProgressReportRow[];
  totalWeight: number;
  overallProgress: number;
  preparedBy: { name: string; designation?: string };
  approvers: { name: string; designation?: string; company?: string }[];
  photos: ProgressReportPhoto[];
  /** Work Schedule to attach as annexes (Gantt chart and/or S-Curve). */
  schedule?: { data: ReportSchedule; gantt: boolean; sCurve: boolean } | null;
}

const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);

export function buildProgressReportPdf(data: ProgressReportData, assets: ReportAssets = {}) {
  const issuer = REPORT_ISSUERS[data.reportCompany];
  const docNo = `${data.projectNo}-PB-${data.pbNumber}`;
  const reportDate = formatLongDate(data.reportDate) || formatLongDate(new Date());
  const pct = Math.round(data.overallProgress * 100) / 100;
  const parents = data.rows.filter((r) => r.isParent);

  const signers: ReportSigner[] = [
    { label: 'Prepared by', name: data.preparedBy.name, designation: data.preparedBy.designation, company: issuer.name, fields: [{ label: 'Date' }] },
    ...data.approvers.slice(0, 3).map((a) => ({ label: 'Approved by', name: a.name, designation: a.designation, company: a.company, fields: [{ label: 'Date' }] })),
  ];
  const perRow = signers.length === 3 ? 3 : 2;

  const wbsColumns = {
    0: { cellWidth: 18 },
    1: { cellWidth: 'auto' as const },
    2: { cellWidth: 24, halign: 'right' as const },
    3: { cellWidth: 24, halign: 'right' as const },
  };
  const alignHead = (h: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
    if (h.section === 'head' && h.column.index >= 2) h.cell.styles.halign = 'right';
  };
  const totalStyle = { font: 'helvetica', fontStyle: 'bold' as const, fillColor: REPORT_COLORS.totalFill };

  const render = (tailRows: number) => {
    const r = new ReportDoc({ bodyFontBase64: assets.bodyFontBase64 });

    r.heading('Project Details', 30);
    r.details([
      ['Project Name', data.projectName],
      ['Project No.', data.projectNo],
      ['Client', data.client],
      ['Location', data.location],
      ['PO Number', data.poNumber],
      ['Report Date', reportDate],
    ]);

    r.heading('Project Status', 24);
    r.paragraph([
      { text: `${issuer.name} hereby certifies that ` },
      { text: `${pct}%`, bold: true },
      { text: ' of the total scope of work under Purchase Order No. ' },
      { text: data.poNumber, bold: true },
      { text: ' has been completed as of the date of this report. The completed works were executed in full compliance with the approved project scope, technical specifications, and contractual obligations. All deliverables corresponding to the stated progress have been properly performed and documented.' },
    ], 9.5, { after: 2 });
    r.paragraph('This certification is issued for documentation, verification, and progress billing purposes.', 9.5, { after: 3 });

    // A one-section summary just repeats the WBS table's first row.
    if (parents.length > 1) {
      r.heading('Progress Summary', 22);
      r.table({
        head: [['Code', 'Scope', 'Weight %', 'Progress %']],
        body: [
          ...parents.map((p) => [p.code, p.name, fmt(p.weight), fmt(p.progress)]),
          [{ content: '', styles: totalStyle }, { content: 'Total', styles: totalStyle }, { content: fmt(parents.reduce((s, p) => s + p.weight, 0)), styles: totalStyle }, { content: fmt(pct), styles: totalStyle }],
        ],
        columnStyles: wbsColumns,
        didParseCell: alignHead,
      }, 7);
    }

    const detail: RowInput[] = data.rows.length > 0
      ? data.rows.map((row) => {
          const indent = 2 + Math.min(row.level, 4) * 4;
          const styles = row.isParent
            ? { font: 'helvetica', fontStyle: 'bold' as const, fillColor: REPORT_COLORS.groupFill }
            : {};
          return [
            { content: row.code || '—', styles },
            { content: row.name || '—', styles: { ...styles, cellPadding: { top: 1.6, bottom: 1.6, left: indent, right: 2 } } },
            { content: fmt(row.weight), styles },
            { content: fmt(row.progress), styles },
          ];
        })
      : [[{ content: 'No WBS items', colSpan: 4, styles: { halign: 'center' as const, textColor: REPORT_COLORS.ink } }]];
    const totalRow: RowInput = [
      { content: '', styles: totalStyle },
      { content: 'Total', styles: totalStyle },
      { content: fmt(data.totalWeight), styles: totalStyle },
      { content: fmt(pct), styles: totalStyle },
    ];
    const body = data.rows.length > 0 ? [...detail, totalRow] : detail;
    const split = Math.max(0, body.length - tailRows);
    if (tailRows > 0 && split === 0) r.addPage();
    r.heading('Work Breakdown Structure', 22);
    const wbsTable = (rows: RowInput[]) => r.table({
      head: [['Code', 'Deliverables', 'Weight %', 'Progress %']],
      body: rows,
      columnStyles: wbsColumns,
      alternateRowStyles: {},
      didParseCell: alignHead,
    }, 8);
    if (tailRows > 0 && split > 0) {
      wbsTable(body.slice(0, split));
      r.addPage();
      wbsTable(body.slice(split));
    } else {
      wbsTable(body);
    }

    // The signature must share its page with at least 3 line items (or the whole table).
    const tailOnPage = r.lastTableRowsOnFinalPage;
    const multiPageTable = r.pageCount > 1;
    const broke = r.signatures(signers, { perRow });

    // Annexes, each from a fresh page and lettered in order: Gantt, S-Curve, Site Photos.
    let annex = 0;
    const annexTitle = (name: string) => `Annex ${String.fromCharCode(65 + annex++)}: ${name}`;
    if (data.schedule?.gantt) {
      r.addPage();
      drawGanttAnnex(r, data.schedule.data, annexTitle('Gantt Chart'));
    }
    if (data.schedule?.sCurve) {
      r.addPage();
      drawSCurveAnnex(r, data.schedule.data, annexTitle('S-Curve'));
    }
    if (data.photos.length > 0) {
      r.addPage();
      r.heading(annexTitle('Site Photos'), 80);
      const gap = 6;
      const cols = 2;
      const colW = (CONTENT_WIDTH - gap * (cols - 1)) / cols;
      const boxH = 72;
      for (let i = 0; i < data.photos.length; i += cols) {
        const rowPhotos = data.photos.slice(i, i + cols);
        r.prose(8);
        const captions = rowPhotos.map((p, j) => (r.doc.splitTextToSize(p.caption?.trim() || `Photo ${i + j + 1}`, colW) as string[]).slice(0, 2));
        const capH = Math.max(...captions.map((c) => c.length)) * 3.6;
        r.ensure(boxH + 2 + capH + 2);
        rowPhotos.forEach((p, j) => {
          const x = PAGE.margin + j * (colW + gap);
          const aspect = p.width > 0 && p.height > 0 ? p.width / p.height : colW / boxH;
          let w = colW;
          let h = colW / aspect;
          if (h > boxH) { h = boxH; w = boxH * aspect; }
          r.doc.setDrawColor(...REPORT_COLORS.rule);
          r.doc.setLineWidth(0.2);
          r.doc.rect(x, r.y, colW, boxH, 'S');
          try {
            const format = p.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
            r.doc.addImage(p.dataUrl, format, x + (colW - w) / 2, r.y + (boxH - h) / 2, w, h, undefined, 'FAST');
          } catch {
            // Undecodable image: leave the framed placeholder.
          }
          r.prose(8);
          captions[j].forEach((line, li) => r.doc.text(line, x + colW / 2, r.y + boxH + 4.5 + li * 3.6, { align: 'center' }));
        });
        r.y += boxH + 2 + capH + 6;
      }
    }

    r.finish({
      issuer,
      logoDataUrl: assets.logoDataUrl,
      title: 'Progress Report',
      meta: [`Doc. No.: ${docNo}`, `Report Date: ${reportDate}`],
      docNo,
    });
    return { doc: r.doc, signatureOrphaned: broke || (multiPageTable && tailOnPage < 3) };
  };

  let out = render(0);
  if (out.signatureOrphaned && data.rows.length > 0) out = render(Math.min(3, data.rows.length + 1));
  return { doc: out.doc, filename: `${safeFileName(docNo)}.pdf` };
}
