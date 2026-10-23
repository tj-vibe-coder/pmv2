/**
 * Guard: a line's internalNote is team-only and must never reach a customer document. The exporters print explicit
 * public fields; this runs both real exporters on a quotation whose lines carry notes and checks none of that text
 * comes out — so a future change that starts serializing whole lines fails CI instead of leaking price sources.
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

const NOTE_COMPONENT = 'SECRET-COMPONENT-NOTE budgetary [Not in pricelist]';
const NOTE_SERVICE = 'SECRET-SERVICE-NOTE for supplier quote';

const project = { id: 'p1', code: 'PCS2610158-IST-00', name: 'Transformer Panel' } as unknown as Project;
const quotation = {
  id: 'q1', projectId: 'p1', kind: 'IOCT', revision: '01', recipientId: null, formulaVersion: 'current',
  validityDays: 30, paymentTerms: '30 days', deliveryTerms: '', warrantyMonths: 12,
  productMarkupPct: 10, laborMarkupPct: 10, generalReqMarkupPct: 0, globalContingencyPct: 0, discountPct: 0, vatPct: 12,
  generalReqts: [],
  components: [
    { id: 'c1', code: 'B1', description: 'Circuit breaker 3P 100A', brand: 'ABB', partNo: 'S203', qty: 2, uom: 'pc', unitCost: 1000, forex: 1, contingencyPct: 0, discountPct: 0, internalNote: NOTE_COMPONENT },
  ],
  manpower: [],
  services: [
    { id: 's1', code: 'C1', description: 'Programming and testing', amount: 5000, internalNote: NOTE_SERVICE },
  ],
  laborRates: [],
} as unknown as Quotation;

it('does not print an internal note on the quotation PDF', async () => {
  await exportQuotationPdf(quotation, project, null, null, [], { save: false });
  const { container } = render(<>{mockCaptured.element}</>);
  expect(container.textContent).toContain('Circuit breaker 3P 100A'); // the document did render
  expect(container.textContent).toContain('Programming and testing');
  expect(container.textContent).not.toContain('SECRET');
  expect(container.textContent).not.toContain('Not in pricelist');
  expect(container.textContent).not.toContain('budgetary');
});

it('does not write an internal note into the Excel export', async () => {
  await exportQuotationXlsx(quotation, project, null, null);
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
  const all = cells.join('\n');
  expect(all).toContain('Circuit breaker 3P 100A'); // the workbook did render
  expect(all).toContain('Programming and testing');
  expect(all).not.toContain('SECRET');
  expect(all).not.toContain('Not in pricelist');
  expect(all).not.toContain('budgetary');
});
