/**
 * Non-VAT quotations (IOCT): totals read Subtotal / Discount / "VAT: N/A (Non-VAT)" / TOTAL AMOUNT PAYABLE, the bold
 * TAX STATUS clause leads the terms, and "VAT-EX" / "VAT-IN" / a 0% VAT line never reach the PDF or Excel. The
 * RJ-reported case: ₱25,000 less 5% = ₱1,250 → ₱23,750.00 payable.
 */
import { render } from '@testing-library/react';
import ExcelJS from 'exceljs';
import { exportQuotationPdf } from './pdfExport';
import { exportQuotationXlsx } from './xlsxExport';
import type { Project, Quotation } from '../../types/Quotation';

const mockSaved: { blob?: Blob } = {};
jest.mock('file-saver', () => ({ saveAs: (blob: Blob) => { mockSaved.blob = blob; } }));

// @react-pdf/renderer draws to a PDF, not the DOM. Swap its primitives for plain elements and capture the document
// handed to pdf(), so the text it would print can be read back.
const mockCaptured: { element?: React.ReactElement } = {};
jest.mock('@react-pdf/renderer', () => {
  const React = require('react');
  const { PDFDocument } = jest.requireActual('pdf-lib');
  const box = (tag: string) => ({ children }: { children?: React.ReactNode }) => React.createElement(tag, null, children);
  return {
    Document: box('div'), Page: box('div'), View: box('div'), Text: box('span'), Image: () => null,
    StyleSheet: { create: (s: unknown) => s },
    pdf: (element: React.ReactElement) => {
      mockCaptured.element = element;
      return {
        // A real, empty PDF — exportQuotationPdf stamps page numbers onto it with pdf-lib.
        toBlob: async () => {
          const doc = await PDFDocument.create();
          doc.addPage();
          const bytes = await doc.save();
          return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
        },
      };
    },
  };
});

import { computeTotals } from './calc';

const project = { id: 'p1', code: 'PCS2610164-MVC-00', name: 'Mabuhay Vinyl' } as unknown as Project;
const baseQuotation = (over: Partial<Quotation>) => ({
  id: 'q1', projectId: 'p1', kind: 'IOCT', revision: '01', recipientId: null, formulaVersion: 'current',
  validityDays: 30, paymentTerms: '30 days', deliveryTerms: '', warrantyMonths: 12,
  productMarkupPct: 0, laborMarkupPct: 0, generalReqMarkupPct: 0, globalContingencyPct: 0, discountPct: 5, vatPct: 0,
  generalReqts: [], components: [], manpower: [],
  services: [{ id: 's1', code: 'C1', description: 'Programming and testing', amount: 25000 }],
  laborRates: [],
  ...over,
}) as unknown as Quotation;

const xlsxCells = async () => {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(mockSaved.blob as Blob);
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const cells: string[] = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { cells.push(String(c.text ?? c.value ?? '')); })));
  return cells.join('\n');
};

it('nonVat adds no VAT even if vatPct is set, and 5% off 25,000 pays 23,750', () => {
  const t = computeTotals(baseQuotation({ nonVat: true, vatPct: 12 }));
  expect(t.subtotal).toBe(25000);
  expect(t.discount).toBe(1250);
  expect(t.vat).toBe(0);
  expect(t.grandTotal).toBe(23750);
});

it('prints the non-VAT totals block and leading Tax Status clause on the PDF', async () => {
  await exportQuotationPdf(baseQuotation({ nonVat: true }), project, null, null, [], { save: false });
  const text = render(<>{mockCaptured.element}</>).container.textContent ?? '';
  expect(text).toContain('N/A (Non-VAT)');
  expect(text).toContain('TOTAL AMOUNT PAYABLE');
  expect(text).toContain('23,750.00');
  expect(text).toContain('TAX STATUS: IO Control Technologie OPC is a NON-VAT registered taxpayer');
  expect(text.indexOf('TAX STATUS')).toBeLessThan(text.indexOf('Scope of Work'));
  expect(text.toLowerCase()).not.toContain('vat-ex');
  expect(text.toLowerCase()).not.toContain('vat-in');
  expect(text).not.toContain('0% VAT');
});

it('leaves a VAT quotation unchanged (no Non-VAT wording)', async () => {
  await exportQuotationPdf(baseQuotation({ vatPct: 12 }), project, null, null, [], { save: false });
  const text = render(<>{mockCaptured.element}</>).container.textContent ?? '';
  expect(text).toContain('VAT-IN');
  expect(text).not.toContain('Non-VAT');
  expect(text).not.toContain('TAX STATUS');
});

it('prints the non-VAT totals block on the Excel export', async () => {
  await exportQuotationXlsx(baseQuotation({ nonVat: true }), project, null, null);
  const all = await xlsxCells();
  expect(all).toContain('N/A (Non-VAT)');
  expect(all).toContain('TOTAL AMOUNT PAYABLE');
  expect(all).toContain('23750');
  expect(all.toLowerCase()).not.toContain('vat-ex');
});
