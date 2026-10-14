import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReimbursementDashboard from './ReimbursementDashboard';
import { reimbursementCashDue } from '../types/LiquidationWorkflow';
jest.mock('./finance/MoneyTrailButton', () => () => null);
const fetchMock = jest.fn();
const paid = { id: 'paid1', liquidationId: 'lp', formNo: 'LQ-PAID', employeeName: 'Paid Employee', origin: 'no_ca', amount: 3000, status: 'paid', workflowStatus: 'awaiting_rj_review', createdAt: 1 };
const unpaid = { id: 'pending1', liquidationId: 'lu', formNo: 'LQ-UNPAID', employeeName: 'Unpaid Employee', origin: 'no_ca', amount: 100, status: 'pending', workflowStatus: 'awaiting_physical', createdAt: 2 };
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url, options) => ({ ok: true, json: async () => options?.method === 'POST' ? { success: true } : String(url).includes('/reimbursements') ? { success: true, reimbursements: [paid, unpaid] } : { success: true, cash_advances: [] } }));
  global.fetch = fetchMock;
});
test('paid but unreviewed claims stay visible at zero cash due and cannot be selected for another payment', async () => {
  render(<MemoryRouter><ReimbursementDashboard /></MemoryRouter>);
  const row = await screen.findByRole('row', { name: /Paid Employee/ });
  expect(within(row).getByText('₱0.00')).toBeInTheDocument();
  expect(within(row).getByText('Submitted to RJ — awaiting review')).toBeInTheDocument();
  expect(within(row).getByRole('checkbox')).toBeDisabled();
  expect(within(row).queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  expect(screen.getByRole('button', { name: 'Pay Selected (1)' })).toBeEnabled();
  expect(within(row).getByRole('checkbox')).not.toBeChecked();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('scope=open'))).toBe(true);
  expect(reimbursementCashDue({ status: 'paid', amount: 3000 })).toBe(0);
});
test('urgent payment reason is sent explicitly with the payment request', async () => {
  render(<MemoryRouter><ReimbursementDashboard /></MemoryRouter>);
  const row = await screen.findByRole('row', { name: /Unpaid Employee/ });
  fireEvent.click(within(row).getByRole('button', { name: 'Pay' }));
  fireEvent.change(await screen.findByLabelText('Urgent payment reason (only when paying before RJ review)'), { target: { value: 'Urgent transport money' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Payment' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes('/pending1/pay') && JSON.parse(options.body).urgentPaymentReason === 'Urgent transport money')).toBe(true));
});
