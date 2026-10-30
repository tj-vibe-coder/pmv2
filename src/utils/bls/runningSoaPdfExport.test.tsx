/**
 * Running-account SOA PDF (Finance tab layout): the Belmont sample must print the same figures, PAID/DUE status,
 * three signature blocks, and no "VAT-exclusive" wording.
 */
import { render } from '@testing-library/react';
import { RunningSoaDocument } from './runningSoaPdfExport';
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

const soa: BillingStatement = {
  id: 's1', kind: 'SOA', docNo: 'IOCT2610002-SOA-001', date: '2026-10-30', projectNo: 'IOCT2610002',
  billedToName: 'Belmont Laboratories, Inc.', billedToAddress: 'Floridablanca Interchange, SCTEX\nPampanga', attention: 'Arnel Bautista',
  refRows: [{ label: 'PO No.', value: '7540004156 (October 6, 2026)' }],
  billingLabel: 'Full Billing · 100%', subtitle: 'Covers the full contract value.', contractValue: 216258.41, poNo: '7540004156',
  txns: [{ invoiceDate: '2026-10-30', siNo: 'SI 014', description: 'Energy Management System — Full Billing', details: 'Engineering Services — PHP 56,050.00',
    contractAmount: 216258.41, billingPct: 100, amountBilled: 216258.41, status: 'DUE' }],
  paymentNote: 'Payment due on or before November 29, 2026.',
};

const textOf = (s: BillingStatement) => render(<RunningSoaDocument soa={s} />).container.textContent ?? '';

it('prints the Belmont running account', () => {
  const t = textOf(soa);
  expect(t).toContain('STATEMENT OF ACCOUNT');
  expect(t).toContain('IOCT2610002-SOA-001');
  expect(t).toContain('SI 014');
  expect(t).toContain('DUE');
  expect(t).toContain('PHP 216,258.41');
  expect(t).toContain('Previous Billings');
  expect(t).toContain('Balance after settlement of this SOA: PHP 0.00');
  expect(t).toContain('This Billing — SI 014');
  expect(t).toContain('RECEIVED & ACKNOWLEDGED BY');
  expect(t.toLowerCase()).not.toContain('vat-ex');
});

it('treats PAID rows as previous billings and leaves the balance', () => {
  const t = textOf({ ...soa, contractValue: 1000, txns: [
    { ...soa.txns![0], siNo: 'SI 001', amountBilled: 300, status: 'PAID' },
    { ...soa.txns![0], siNo: 'SI 002', amountBilled: 200, status: 'DUE' },
  ] });
  expect(t).toContain('PAID');
  expect(t).toContain('PHP 300.00');
  expect(t).toContain('TOTAL AMOUNT DUE');
  expect(t).toContain('PHP 200.00');
  expect(t).toContain('Balance after settlement of this SOA: PHP 500.00');
});
