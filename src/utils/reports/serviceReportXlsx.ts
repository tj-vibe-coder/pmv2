import ExcelJS from 'exceljs';

/**
 * Text-only Excel export of a Daily Service Report. Mirrors the PDF template
 * layout (header block, activities table, recommendations, dual signature
 * block) so the spreadsheet reads the same as the generated PDF.
 */
export interface ServiceReportXlsxData {
  companyName: string;
  /**
   * Optional company logo to embed in the top-left of the header. `dataUrl` is a
   * base64 data URL; `width`/`height` are the rendered size in pixels (already
   * aspect-corrected by the caller). Mirrors the per-company logo the PDF uses.
   */
  logo?: { dataUrl: string; extension: 'png' | 'jpeg'; width: number; height: number };
  projectName: string;
  projectNo: string;
  reportNo: string;
  reportDateStr: string;
  poNumber: string;
  client: string;
  startTime: string;
  endTime: string;
  activities: { activity: string; findingOutcome: string }[];
  recommendations: string;
  preparedBy: { name: string; designation: string; company: string };
  approvedBy: { name: string; designation: string; company: string };
}

const NAVY = 'FF2C5AA0'; // table-header fill only (matches the PDF's DR_HEADER_BLUE)
const BLACK = 'FF000000';

function buildWorkbook(data: ServiceReportXlsxData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = data.companyName;
  wb.created = new Date();

  const ws = wb.addWorksheet('Service Report', {
    properties: { defaultRowHeight: 16 },
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });
  // A is wide enough for the meta/signature labels ("Project Name:", "Designation");
  // Activity (B) and Finding/Outcome (C+D) stay close to the PDF's 50/50 split.
  ws.columns = [{ width: 11 }, { width: 30 }, { width: 14 }, { width: 24 }];

  // ---- Header ----
  // Mirror the PDF: logo alone on the top line, then the company name (left) and
  // "Daily Service Report" (right) on the line below it.
  if (data.logo) {
    const imageId = wb.addImage({ base64: data.logo.dataUrl, extension: data.logo.extension });
    ws.getRow(1).height = Math.max(20, data.logo.height * 0.75 + 4); // px → pt (≈0.75) + padding
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: data.logo.width, height: data.logo.height },
      editAs: 'oneCell',
    });
  }
  ws.mergeCells('A2:B2');
  ws.getCell('A2').value = data.companyName.toUpperCase();
  ws.getCell('A2').font = { name: 'Arial', size: 11, bold: true, color: { argb: BLACK } };
  ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' };
  ws.mergeCells('C2:D2');
  ws.getCell('C2').value = 'Daily Service Report';
  ws.getCell('C2').font = { name: 'Arial', size: 14, bold: true, color: { argb: BLACK } };
  ws.getCell('C2').alignment = { vertical: 'middle', horizontal: 'right' };

  // Each side is one cell ("Label: value") like the PDF's left/right text lines,
  // so labels never get clipped by an adjacent value cell.
  const metaRow = (r: number, lLabel: string, lValue: string, rLabel: string, rValue: string) => {
    ws.mergeCells(`A${r}:C${r}`);
    ws.getCell(`A${r}`).value = `${lLabel} ${lValue || '—'}`;
    ws.getCell(`A${r}`).font = { size: 9 };
    ws.getCell(`A${r}`).alignment = { horizontal: 'left' };
    ws.getCell(`D${r}`).value = `${rLabel} ${rValue || '—'}`;
    ws.getCell(`D${r}`).font = { size: 9 };
    ws.getCell(`D${r}`).alignment = { horizontal: 'right' };
  };
  metaRow(3, 'Project Name:', data.projectName, 'Report No.:', data.reportNo);
  metaRow(4, 'Project No.:', data.projectNo, 'Date:', data.reportDateStr);
  metaRow(5, 'PO No.:', data.poNumber, 'Start Time:', data.startTime);
  metaRow(6, 'Client:', data.client, 'End Time:', data.endTime);

  let r = 8;

  // Plain bold heading, matching the PDF (which uses bold text headings, not
  // filled section bars — only the table header row is filled).
  const heading = (label: string) => {
    ws.mergeCells(`A${r}:D${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = label;
    c.font = { name: 'Arial', bold: true, size: 11, color: { argb: BLACK } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(r).height = 18;
    r++;
  };

  const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };

  // ---- Activities ----
  heading('Activities');
  ['No.', 'Activity', 'Finding / Outcome'].forEach((label, i) => {
    // Activity spans B; Finding spans C:D
    const cell = i === 2 ? ws.getCell(r, 3) : ws.getCell(r, i + 1);
    if (i === 2) ws.mergeCells(r, 3, r, 4);
    cell.value = label;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle' };
    cell.border = border;
  });
  ws.getCell(r, 1).border = border;
  ws.getCell(r, 2).border = border;
  r++;

  const rows = data.activities.filter(a => (a.activity || '').trim() || (a.findingOutcome || '').trim());
  (rows.length ? rows : [{ activity: '', findingOutcome: '' }]).forEach((a, i) => {
    ws.getCell(r, 1).value = i + 1;
    ws.getCell(r, 1).alignment = { vertical: 'top', horizontal: 'center' };
    ws.getCell(r, 2).value = (a.activity || '').trim() || '—';
    ws.getCell(r, 2).alignment = { vertical: 'top', wrapText: true };
    ws.mergeCells(r, 3, r, 4);
    ws.getCell(r, 3).value = (a.findingOutcome || '').trim() || '—';
    ws.getCell(r, 3).alignment = { vertical: 'top', wrapText: true };
    for (let c = 1; c <= 4; c++) {
      ws.getCell(r, c).font = { size: 9 };
      ws.getCell(r, c).border = border;
    }
    r++;
  });
  r += 1;

  // ---- Recommendations and Remarks ----
  heading('Recommendations and Remarks');
  ws.mergeCells(r, 1, r + 3, 4);
  const rec = ws.getCell(r, 1);
  rec.value = (data.recommendations || '').trim();
  rec.font = { size: 9 };
  rec.alignment = { vertical: 'top', wrapText: true };
  rec.border = border;
  r += 5;

  // ---- Signatures ----
  const sigBlock = (col: number, heading: string, who: { name: string; designation: string; company: string }, rowBase: number) => {
    const c1 = col; // label col
    const c2 = col + 1; // value col
    ws.getCell(rowBase, c1).value = heading;
    ws.getCell(rowBase, c1).font = { bold: true, size: 10 };
    const line = (offset: number, label: string, value: string) => {
      ws.getCell(rowBase + offset, c1).value = label;
      ws.getCell(rowBase + offset, c1).font = { size: 9, bold: true };
      ws.getCell(rowBase + offset, c2).value = value || '';
      ws.getCell(rowBase + offset, c2).font = { size: 9 };
      ws.getCell(rowBase + offset, c2).border = { bottom: thin };
    };
    line(2, 'Name', who.name);
    line(3, 'Designation', who.designation);
    line(4, 'Company', who.company);
    line(5, 'Date', data.reportDateStr);
  };
  sigBlock(1, 'Prepared by:', data.preparedBy, r);
  sigBlock(3, 'Approved by:', data.approvedBy, r);

  return wb;
}

export async function buildServiceReportXlsxBlob(data: ServiceReportXlsxData): Promise<Blob> {
  const wb = buildWorkbook(data);
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
