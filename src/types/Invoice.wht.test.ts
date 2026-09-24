import {
  getInvoiceStatus,
  invoiceCashDue,
  invoiceOutstanding,
  invoiceSettled,
  invoiceWht,
  type ProjectInvoice,
} from './Invoice';

const inv = (over: Partial<ProjectInvoice>): ProjectInvoice => ({
  id: 'i1',
  project_id: 'p1',
  invoice_no: '001',
  invoice_date: '2026-04-03',
  amount: 256158,
  payment_terms_days: 30,
  due_date: '2026-05-03',
  amount_collected: 0,
  created_at: '',
  updated_at: '',
  ...over,
});

test('WHT is not cash: settled = cash + EWT, outstanding uses both', () => {
  const row = inv({ amount_collected: 253596.42, wht_amount: 2561.58 });
  expect(invoiceWht(row)).toBeCloseTo(2561.58, 2);
  expect(invoiceSettled(row)).toBeCloseTo(256158, 2);
  expect(invoiceOutstanding(row)).toBeCloseTo(0, 2);
  expect(invoiceCashDue(row)).toBeCloseTo(0, 2);
  expect(getInvoiceStatus(row)).toBe('paid');
});

test('cash-only full collection without WHT is still paid', () => {
  const row = inv({ amount: 193414.05, amount_collected: 193414.05 });
  expect(getInvoiceStatus(row)).toBe('paid');
  expect(invoiceOutstanding(row)).toBe(0);
});

test('gross cash without splitting WHT overstates cash but was the old paid rule', () => {
  const old = inv({ amount_collected: 256158 });
  expect(getInvoiceStatus(old)).toBe('paid');
  expect(invoiceCashDue(old)).toBe(0);
});

test('WHT recorded but cash short stays partial', () => {
  const row = inv({ amount: 15000, amount_collected: 10000, wht_amount: 300 });
  expect(getInvoiceStatus(row)).toBe('partial');
  expect(invoiceOutstanding(row)).toBeCloseTo(4700, 2);
  expect(invoiceCashDue(row)).toBeCloseTo(4700, 2);
});

test('unpaid with due date in the past is overdue', () => {
  const row = inv({ amount: 15000, amount_collected: 0, due_date: '2020-01-01' });
  expect(getInvoiceStatus(row)).toBe('overdue');
});
