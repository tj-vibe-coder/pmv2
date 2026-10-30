/**
 * Billing Statement PDF: the Finance tab's one-page layout. Belmont (direct customer, no WHT) and an ACTI bill
 * (2% WHT) must print the same figures as the Python originals, and nothing internal.
 */
import { render } from '@testing-library/react';
import { BillingStatementDocument } from './blsPdfExport';
import type { BillingStatement } from '../../types/BillingStatement';

jest.mock('file-saver', () => ({ saveAs: jest.fn() }));
jest.mock('@react-pdf/renderer', () => {
  const React = require('react');
  const box = (tag: string) => ({ children }: { children?: React.ReactNode }) => React.createElement(tag, null, children);
  return {
    Document: box('div'), Page: box('div'), View: box('div'), Text: box('span'), Image: () => null,
    StyleSheet: { create: (s: unknown) => s }, pdf: () => ({ toBlob: async () => new Blob() }),
  };
});

const base: BillingStatement = {
  id: 'b1', kind: 'BLS', docNo: 'IOCT2610002-BLS-01', date: '2026-10-30', projectNo: 'IOCT2610002',
  billedToName: 'Belmont Laboratories, Inc.', billedToAddress: 'Floridablanca Interchange, SCTEX\nPampanga', attention: 'Arnel Bautista',
  subtitle: 'Billing for Service Invoice No. 014', whtPct: 0, approverLabel: 'Received / acknowledged by (Belmont)',
  refRows: [{ label: 'Belmont PO', value: '7540004156 dated October 6, 2026' }],
  lines: [
    { description: 'General Requirements (lot)', qty: 1, unit: 'lot', unitPrice: 29640 },
    { description: 'Supply of Components (lot)', qty: 1, unit: 'lot', unitPrice: 130568.41 },
    { description: 'Engineering Services (lot)', qty: 1, unit: 'lot', unitPrice: 56050 },
  ],
  supportingDocs: ['Service Invoice No. 014 dated October 30, 2026'],
};

const textOf = (b: BillingStatement) => render(<BillingStatementDocument bls={b} />).container.textContent ?? '';

it('prints a direct-customer bill without a withholding row', () => {
  const t = textOf(base);
  expect(t).toContain('BILLING STATEMENT');
  expect(t).toContain('October 30, 2026');
  expect(t).toContain('Belmont Laboratories, Inc.');
  expect(t).toContain('216,258.41');
  expect(t).toContain('Two Hundred Sixteen Thousand Two Hundred Fifty-Eight Pesos and 41/100 Only');
  expect(t).not.toContain('withholding');
  expect(t).toContain('RECEIVED / ACKNOWLEDGED BY (BELMONT)');
  expect(t).toContain('NON-VAT');
});

it('applies the per-bill withholding tax (ACTI, 2%)', () => {
  const t = textOf({ ...base, billedToName: undefined, billedToAddress: undefined, whtPct: 2,
    lines: [{ description: 'Engineering', qty: 10, unit: 'unit', unitPrice: 30000 }] });
  expect(t).toContain('Advance Controle Technologie Inc.');
  expect(t).toContain('Less: withholding tax (2%)');
  expect(t).toContain('(6,000.00)');
  expect(t).toContain('PHP 294,000.00');
});
