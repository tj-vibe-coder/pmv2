import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import type { Client, Project, Quotation } from '../../types/Quotation';
import {
  computeTotals, lineGeneralTotal, componentLineTotal, componentSellingUnit, manpowerCost,
} from './calc';

const PHP_FMT = '"₱" #,##0.00;[Red]"₱" -#,##0.00';

function quotationDate(value: string | undefined): Date {
  const dateOnly = (value || format(new Date(), 'yyyy-MM-dd')).slice(0, 10);
  return new Date(`${dateOnly}T00:00:00`);
}

export async function exportQuotationXlsx(
  quotation: Quotation, project: Project, recipient: Client | null, customer: Client | null,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IOCT Calcsheet';
  wb.created = new Date();

  const totals = computeTotals(quotation);
  const refNo = `${project.code.replace(/-[A-Z]{3}-\d{2}$/, '')}-${(recipient?.code ?? 'XXX').slice(0, 3)}-${quotation.revision}`;
  const generalReqtsExportQty = Math.max(1, quotation.generalReqtsExportQty || 1);
  const generalReqtsExportUnitPrice = totals.generalReqtsSubtotal / generalReqtsExportQty;
  const engineeringServicesQty = Math.max(1, quotation.engineeringServicesQty || 1);
  const engineeringServicesUnitPrice = totals.servicesSubtotal / engineeringServicesQty;

  // Header sheet (quotation summary)
  const ws = wb.addWorksheet('Quotation', {
    properties: { defaultRowHeight: 16 },
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });

  ws.columns = [
    { width: 14 }, { width: 50 }, { width: 10 }, { width: 8 }, { width: 18 }, { width: 18 },
  ];

  const navy = 'FF0F2A44';
  const grayBg = 'FFF2F4F7';

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = quotation.kind === 'IOCT' ? 'IO Control Technologie OPC' : 'Advance Controle Technologie Inc.';
  ws.getCell('A1').font = { name: 'Inter', size: 14, bold: true, color: { argb: navy } };

  ws.mergeCells('A2:F2');
  ws.getCell('A2').value = quotation.kind === 'IOCT' ? 'B63 Biñan, Laguna · TIN: 697-029-976-00000' : 'Block 13, Mindanao Ave., Cavite';
  ws.getCell('A2').font = { name: 'Inter', size: 8, color: { argb: 'FF666666' } };

  ws.getCell('E1').value = 'QUOTATION';
  ws.getCell('E1').font = { name: 'Inter', size: 12, bold: true, color: { argb: navy } };
  ws.getCell('E1').alignment = { horizontal: 'right' };
  ws.getCell('F2').value = `Ref: ${refNo}`;
  ws.getCell('F2').alignment = { horizontal: 'right' };
  ws.getCell('F3').value = `Date: ${format(quotationDate(quotation.dateSent), 'dd MMM yyyy')}`;
  ws.getCell('F3').alignment = { horizontal: 'right' };

  ws.mergeCells('A4:F4');
  ws.getCell('A4').value = project.name;
  ws.getCell('A4').font = { name: 'Inter', size: 14, bold: true };

  ws.getCell('A6').value = 'To:';
  ws.getCell('A6').font = { bold: true };
  ws.getCell('B6').value = recipient?.name ?? '';
  ws.getCell('A7').value = 'Customer:';
  ws.getCell('A7').font = { bold: true };
  ws.getCell('B7').value = customer?.name ?? '';
  ws.getCell('A8').value = 'Location:';
  ws.getCell('A8').font = { bold: true };
  ws.getCell('B8').value = project.location ?? '';

  let r = 10;

  const sectionHeader = (label: string) => {
    ws.mergeCells(`A${r}:F${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = label;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    r++;
  };

  const tableHeader = (cols: string[]) => {
    cols.forEach((label, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = label;
      cell.font = { bold: true, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grayBg } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
      if (['Qty', 'Unit Price', 'Total'].includes(label)) cell.alignment = { horizontal: 'right' };
    });
    r++;
  };

  // A. General Requirements
  if (quotation.generalReqts.length) {
    sectionHeader('A. GENERAL REQUIREMENTS');
    tableHeader(['Code', 'Description', 'Qty', 'UOM', 'Unit Price', 'Total']);
    if (quotation.exportGeneralReqtsAsLot) {
      const displayIdx = Math.max(0, Math.floor((quotation.generalReqts.length - 1) / 2));
      quotation.generalReqts.forEach((l, i) => {
        ws.getRow(r).values = [
          l.code,
          l.description,
          i === displayIdx ? generalReqtsExportQty : '',
          i === displayIdx ? 'lot' : '',
          i === displayIdx ? generalReqtsExportUnitPrice : '',
          i === displayIdx ? totals.generalReqtsSubtotal : '',
        ];
        ws.getCell(r, 5).numFmt = PHP_FMT;
        ws.getCell(r, 6).numFmt = PHP_FMT;
        r++;
      });
    } else {
      quotation.generalReqts.forEach((l) => {
        ws.getRow(r).values = [l.code, l.description, l.qty, l.uom, l.unitPrice, lineGeneralTotal(l)];
        ws.getCell(r, 5).numFmt = PHP_FMT;
        ws.getCell(r, 6).numFmt = PHP_FMT;
        r++;
      });
    }
    ws.getRow(r).values = ['', '', '', '', 'Subtotal', totals.generalReqtsSubtotal];
    ws.getCell(r, 5).font = { bold: true };
    ws.getCell(r, 6).font = { bold: true };
    ws.getCell(r, 6).numFmt = PHP_FMT;
    r += 2;
  }

  // B. Components
  if (quotation.components.length) {
    sectionHeader('B. SUPPLY OF COMPONENTS');
    tableHeader(['Code', 'Description', 'Qty', 'UOM', 'Unit Price', 'Total']);
    quotation.components.forEach((l) => {
      ws.getRow(r).values = [
        l.code,
        [l.brand, l.description, l.partNo].filter(Boolean).join(' — '),
        l.qty, l.uom,
        componentSellingUnit(l, quotation.productMarkupPct),
        componentLineTotal(l, quotation.productMarkupPct),
      ];
      ws.getCell(r, 5).numFmt = PHP_FMT;
      ws.getCell(r, 6).numFmt = PHP_FMT;
      r++;
    });
    ws.getRow(r).values = ['', '', '', '', 'Subtotal', totals.componentsSubtotal];
    ws.getCell(r, 5).font = { bold: true };
    ws.getCell(r, 6).font = { bold: true };
    ws.getCell(r, 6).numFmt = PHP_FMT;
    r += 2;
  }

  // C. Services
  if (totals.servicesSubtotal > 0) {
    sectionHeader('C. ENGINEERING SERVICES');
    tableHeader(['Code', 'Description', 'Qty', 'UOM', 'Unit Price', 'Total']);
    if (quotation.servicesFromManpower && !quotation.servicesPerLinePricing) {
      ws.getRow(r).values = ['C-0010', 'Engineering Services', engineeringServicesQty, 'lot', engineeringServicesUnitPrice, totals.servicesSubtotal];
      ws.getCell(r, 5).numFmt = PHP_FMT;
      ws.getCell(r, 6).numFmt = PHP_FMT;
      r++;
    } else {
      quotation.services.forEach((l) => {
        ws.getRow(r).values = [l.code, l.description, 1, 'lot', l.amount, l.amount];
        ws.getCell(r, 5).numFmt = PHP_FMT;
        ws.getCell(r, 6).numFmt = PHP_FMT;
        r++;
      });
    }
    ws.getRow(r).values = ['', '', '', '', 'Subtotal', totals.servicesSubtotal];
    ws.getCell(r, 5).font = { bold: true };
    ws.getCell(r, 6).font = { bold: true };
    ws.getCell(r, 6).numFmt = PHP_FMT;
    r += 2;
  }

  // Totals
  const totalsBlock: [string, number, boolean?][] = [
    ['Subtotal (VAT-EX)', totals.subtotal, true],
  ];
  if (quotation.discountPct > 0) totalsBlock.push([`Discount (${quotation.discountPct}%)`, -totals.discount]);
  if (quotation.vatPct > 0) totalsBlock.push([`VAT (${quotation.vatPct}%)`, totals.vat]);
  totalsBlock.push(['GRAND TOTAL (PHP)', totals.grandTotal, true]);

  totalsBlock.forEach(([label, value, bold]) => {
    ws.getCell(r, 5).value = label;
    ws.getCell(r, 6).value = value;
    ws.getCell(r, 6).numFmt = PHP_FMT;
    if (bold) {
      ws.getCell(r, 5).font = { bold: true };
      ws.getCell(r, 6).font = { bold: true };
    }
    if (label.startsWith('GRAND')) {
      ws.getCell(r, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
      ws.getCell(r, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
      ws.getCell(r, 5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getCell(r, 6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }
    r++;
  });

  // Manpower sheet (working data)
  if (quotation.manpower.length) {
    const mp = wb.addWorksheet('Manpower');
    mp.columns = [
      { header: 'Role', width: 30 }, { header: 'Group', width: 14 },
      { header: 'Pax', width: 8 }, { header: 'Mandays', width: 10 },
      { header: 'Daily Rate', width: 14 }, { header: 'Allowance', width: 14 },
      { header: 'Cost', width: 16 },
    ];
    mp.getRow(1).font = { bold: true };
    quotation.manpower.forEach((m) => {
      mp.addRow([m.role, m.group, m.headcount, m.mandays, m.dailyRate, m.allowance, manpowerCost(m)]);
    });
    mp.getColumn(5).numFmt = PHP_FMT;
    mp.getColumn(6).numFmt = PHP_FMT;
    mp.getColumn(7).numFmt = PHP_FMT;
  }

  const buf = await wb.xlsx.writeBuffer();
  const filename = `${project.code.replace(/-[A-Z]{3}-\d{2}$/, '')}-${(recipient?.code ?? 'XXX').slice(0, 3)}-${quotation.revision}.xlsx`;
  saveAs(new Blob([buf]), filename);
}
